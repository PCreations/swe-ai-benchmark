// ─────────────────────────────────────────────────────────────────────────────
// bench resume — LA commande de reprise.
//
// Contrat §K : à chaque reprise de session, l'agent lit le cahier, le registre
// et les dernières preuves ; il vérifie le commit, les empreintes et les
// blocages ; il choisit une tâche non terminée dont toutes les dépendances sont
// acceptées. « Il n'infère pas la réussite d'une tâche d'après un résumé de
// conversation. »
//
// Cette commande ne lit QUE git et les sondes du boot courant. Elle n'écrit
// rien. Elle est sûre sur un conteneur vieux de dix secondes.
// ─────────────────────────────────────────────────────────────────────────────
import { headSha, branchName, isClean, pushState, oidAt } from './git.mjs'
import { loadRegistry, attestability } from './registry.mjs'
import { inputDigest } from './input-digest.mjs'
import { ledgerState, attestationsByTask } from './ledger.mjs'
import { readEvidence, bootId } from './doctor.mjs'

export const EXIT = {
  ACTIONABLE: 0,
  REGISTRY_INVALID: 2,
  ALL_PROVEN: 3,
  LEDGER_DIVERGENCE: 4,
  NOTHING_ACTIONABLE: 11,
}

/**
 * Les prédicats de validité. Une attestation ne « reste » jamais valide : sa
 * validité est RECALCULÉE à chaque appel. C'est ce qui rend `DONE` dérivé.
 */
function evaluate(task, atts, caps, digest) {
  const mine = atts.get(task.id) ?? []
  if (mine.length === 0) return { state: 'NOT_PROVEN', why: 'aucune attestation' }

  // Le plus RÉCENT selon l'ordre des commits du ledger — pas « un qui a réussi ».
  const latest = mine[mine.length - 1].doc
  const sameDigest = mine.filter((a) => a.doc.input_digest === digest)
  const verdicts = new Set(sameDigest.map((a) => a.doc.verdict))
  if (verdicts.size > 1)
    return {
      state: 'CONTESTED',
      why: `verdicts contradictoires sur le meme input_digest : ${[...verdicts].join(' / ')}`,
    }

  if (latest.schema !== 'bench.attestation/1') return { state: 'NOT_PROVEN', why: 'schema inconnu' }
  if (latest.verdict !== 'PASS') return { state: 'NOT_PROVEN', why: `verdict ${latest.verdict}` }
  if (latest.dirty) return { state: 'NOT_PROVEN', why: 'preuve produite sur un arbre sale' }
  if (!latest.clean_room) return { state: 'NOT_PROVEN', why: 'preuve non produite en clean-room' }
  if (latest.input_digest !== digest)
    return { state: 'STALE', why: 'les entrees ont change depuis la preuve' }

  // Capacités re-sondées CE BOOT. Une attestation produite sur un hôte plus
  // capable ne vaut pas ici.
  const missing = (latest.capabilities_used ?? []).filter((c) => !caps?.capabilities?.[c]?.present)
  if (missing.length) return { state: 'STALE', why: `capacites absentes ce boot : ${missing.join(', ')}` }

  const covered = new Set(latest.cases?.map((c) => c.id) ?? [])
  const uncovered = task.required_cases.filter((c) => !covered.has(c))
  if (uncovered.length) return { state: 'NOT_PROVEN', why: `cas non couverts : ${uncovered.length}` }

  return { state: 'PROVEN', why: '' }
}

export function computeBoard() {
  const reg = loadRegistry()
  if (reg.problems?.length) return { fatal: EXIT.REGISTRY_INVALID, problems: reg.problems }

  const head = headSha()
  const branch = branchName()
  const clean = isClean()
  const ledger = ledgerState()
  const srcPush = pushState(branch)
  const caps = readEvidence()
  const atts = attestationsByTask()

  const states = new Map()
  for (const [id, t] of reg.byId) {
    const digest = inputDigest(t, 'HEAD')
    const capMissing = (t.requires ?? []).filter((c) => !caps?.capabilities?.[c]?.present)
    const ev = evaluate(t, atts, caps, digest)
    states.set(id, { task: t, digest, capMissing, ...ev })
  }

  // Propagation : une tâche n'est PROVEN que si toutes ses dépendances le sont
  // (§H : « une dépendance signifie un contrat déjà validé »).
  let changed = true
  while (changed) {
    changed = false
    for (const [id, s] of states) {
      if (s.state !== 'PROVEN') continue
      const bad = s.task.depends_on.find((d) => states.get(d)?.state !== 'PROVEN')
      if (bad) {
        states.set(id, { ...s, state: 'STALE', why: `dependance ${bad} n'est plus prouvee` })
        changed = true
      }
    }
  }

  // Classement final.
  for (const [id, s] of states) {
    if (s.state === 'PROVEN' || s.state === 'CONTESTED') continue
    const depsOk = s.task.depends_on.every((d) => states.get(d)?.state === 'PROVEN')
    if (s.capMissing.length) {
      states.set(id, { ...s, state: 'BLOCKED', why: `capacites absentes : ${s.capMissing.join(', ')}` })
    } else if (!depsOk) {
      const waiting = s.task.depends_on.filter((d) => states.get(d)?.state !== 'PROVEN')
      states.set(id, { ...s, state: 'WAITING', why: `attend ${waiting.join(', ')}` })
    } else if (s.state === 'NOT_PROVEN') {
      states.set(id, { ...s, state: 'READY' })
    }
  }

  return { head, branch, clean, ledger, srcPush, caps, states, reg }
}

export function render(board, { json = false } = {}) {
  if (board.fatal) {
    if (json) return { text: JSON.stringify({ exit: board.fatal, problems: board.problems }, null, 2), exit: board.fatal }
    const t = [
      'REGISTRE INVALIDE — rien n\'est actionnable tant qu\'il n\'est pas repare.',
      '',
      ...board.problems.map((p) => `  ${p}`),
    ]
    return { text: t.join('\n'), exit: board.fatal }
  }

  const by = (st) => [...board.states.entries()].filter(([, s]) => s.state === st).map(([id]) => id)
  const proven = by('PROVEN')
  const ready = by('READY')
  const waiting = by('WAITING')
  const blocked = by('BLOCKED')
  const stale = by('STALE')
  const contested = by('CONTESTED')
  const total = board.states.size

  // Rien n'est durable tant que ce n'est pas pousse — c'est un blocage, pas un
  // avertissement : un conteneur ephemere emporte tout travail local.
  const unpushedSrc = !board.srcPush.pushed
  const unpushedLedger = board.ledger.exists && !board.ledger.pushed

  let exit = EXIT.ACTIONABLE
  if (unpushedSrc || unpushedLedger) exit = EXIT.LEDGER_DIVERGENCE
  else if (proven.length === total) exit = EXIT.ALL_PROVEN
  else if (ready.length === 0) exit = EXIT.NOTHING_ACTIONABLE

  if (json) {
    return {
      exit,
      text: JSON.stringify(
        {
          exit,
          head: board.head,
          branch: board.branch,
          clean: board.clean,
          boot_id: bootId(),
          proven,
          ready,
          waiting,
          blocked,
          stale,
          contested,
          capabilities: Object.fromEntries(
            Object.entries(board.caps?.capabilities ?? {}).map(([k, v]) => [k, v.present])
          ),
          next: ready[0] ?? null,
        },
        null,
        2
      ),
    }
  }

  const L = []
  L.push(`PROUVE A HEAD : ${proven.length}/${total}   ·   NON PROUVE : ${total - proven.length}/${total}`)
  if (proven.length < total) L.push(`   -> « est-ce fini ? » NON.`)
  L.push('')
  L.push(`BENCH RESUME   ${board.branch} @ ${board.head.slice(0, 8)}   arbre ${board.clean ? 'propre' : 'SALE'}`)
  L.push(
    `LEDGER         ${board.ledger.name} ${board.ledger.sha ?? '(absent)'}  ` +
      (board.ledger.exists
        ? board.ledger.pushed
          ? 'pousse'
          : `NON POUSSE (${board.ledger.ahead ?? '?'} evenement(s)) — rien n'est durable`
        : 'absent localement (bench bootstrap le recree depuis origin)')
  )
  L.push(`SOURCE         ${board.srcPush.pushed ? 'poussee' : `NON POUSSEE (${board.srcPush.ahead ?? '?'} commit(s))`}`)
  L.push(`CAHIER         ${oidAt('HEAD', 'docs/cahier.md').slice(0, 12)}  (${board.reg.tasks.task_count} taches, ${board.reg.tasks.required_case_count} cas)`)
  L.push('')

  if (board.caps) {
    L.push(`HOTE           boot_id ${bootId().slice(0, 8)} — sondes EXECUTEES ce boot`)
    for (const [k, v] of Object.entries(board.caps.capabilities)) {
      L.push(`  ${v.present ? 'OK  ' : 'ABS '} ${k.padEnd(24)} ${v.present ? v.detail : v.reason}`)
      if (!v.present && v.remedy) L.push(`       remede : ${v.remedy}`)
    }
  } else {
    L.push('HOTE           AUCUNE SONDE POUR CE BOOT — lance `pnpm bench doctor`')
  }
  L.push('')

  const row = (label, ids) => ids.length && L.push(`  ${label.padEnd(10)} ${ids.join(' ')}`)
  L.push('TABLEAU DES TACHES')
  row('[H] prouve', proven)
  row('R  pret', ready)
  row('B  bloque', blocked)
  row('S  perime', stale)
  row('X  conteste', contested)
  row('W  attend', waiting)
  L.push('')

  L.push('PROCHAINE ACTION')
  if (unpushedSrc || unpushedLedger) {
    L.push('  Des preuves ou des sources ne sont pas poussees. Le conteneur est ephemere :')
    L.push('  tout ce qui n\'est pas sur origin sera perdu.')
    L.push(`  -> git push --atomic origin ${board.branch} ${board.ledger.name}`)
  } else if (contested.length) {
    L.push(`  ${contested.length} tache(s) CONTESTED : deux attestations en desaccord.`)
    contested.forEach((id) => L.push(`  -> bench contested ${id}`))
  } else if (ready.length) {
    const id = ready[0]
    const s = board.states.get(id)
    L.push(`  ${id} · ${s.task.title}`)
    L.push(`     cas requis : ${s.task.required_cases.length}   capacites : ${s.task.requires.join(', ') || 'aucune'}`)
    const att = attestability(id, board.reg.lock)
    if (att.attestable) {
      L.push(`     modes de preuve : ${Object.entries(att.kinds).map(([k, n]) => `${k}×${n}`).join(', ')}`)
    } else {
      L.push(`     NON ATTESTABLE : ${att.unclassified.length} cas sans mode de preuve etabli`)
      L.push(`     (fail-closed — classer avant d'attester, jamais deviner)`)
    }
    L.push(`  -> pnpm bench task start ${id}`)
  } else if (proven.length === total) {
    L.push('  Les 44 taches sont prouvees a HEAD.')
  } else {
    // §K : un blocage nomme le prerequis manquant ET toutes les taches
    // independantes encore realisables.
    L.push('  Rien n\'est actionnable. Prerequis manquants :')
    const caps = new Set()
    blocked.forEach((id) => board.states.get(id).capMissing.forEach((c) => caps.add(c)))
    ;[...caps].sort().forEach((c) => {
      const r = board.caps?.capabilities?.[c]?.remedy
      L.push(`  - ${c}${r ? ` — ${r}` : ''}`)
    })
  }

  return { text: L.join('\n'), exit }
}
