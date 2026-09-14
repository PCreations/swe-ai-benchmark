// ─────────────────────────────────────────────────────────────────────────────
// bench accept <Txx> — la SEULE fabrique d'attestations.
//
// `verify:task` dit ce que la suite fait AUJOURD'HUI, DANS L'ARBRE DE TRAVAIL.
// Cela ne prouve rien sur un commit : `cleanroom.mjs` documente le contre-
// exemple, un `dist/` gitignoré qui rend verte une suite qui échouerait sur un
// clone propre. `bench accept` est la commande qui transforme une exécution en
// PREUVE DURABLE, et elle n'accorde ce statut qu'après avoir fermé, une par
// une, les portes par lesquelles un faux PASS pourrait entrer.
//
// SEPT PORTES, DANS CET ORDRE, ET CHACUNE FAIL-CLOSED :
//
//   1. REGISTRE VALIDE. Un registre cassé ne permet même pas de savoir quels
//      cas sont requis. (Et ici, jamais de `BENCH_REGISTRY` : un registre de
//      remplacement est un outil de TEST — ADR-005 §2 le cantonne à
//      `verify:task`. Attester depuis un registre synthétique reviendrait à se
//      décerner un diplôme rédigé par soi-même.)
//   2. ARBRE PROPRE. §G : « tout diff de source non committé interdit une
//      attestation finale ». Une attestation nomme un commit ; si l'arbre en
//      diffère, elle nomme autre chose que ce qu'elle a exécuté.
//   3. SOURCES POUSSÉES. Le conteneur est éphémère. Attester un commit qui
//      n'existe que sur ce disque produit une preuve qui désigne un objet
//      perdu — pire qu'une absence de preuve, puisqu'elle a l'air d'en être une.
//   4. PORTE ROUGE. Une tâche dont les cas n'ont jamais été observés ROUGES
//      n'est pas prouvée par un vert : le vert peut venir d'un cas vide. La
//      porte doit exister sur le ledger, porter le verdict RED_RECORDED, et son
//      commit sujet doit être un ANCÊTRE de HEAD — sinon elle parle d'un autre
//      historique.
//   5. RÈGLE DES DEUX CLÉS. Sur la plage (porte rouge .. HEAD), aucun commit ne
//      peut mêler implémentation et zone de jugement. C'est ici que la règle
//      devient une AUTORITÉ et non un hook contournable : la plage est dérivée
//      du ledger, que l'implémenteur ne peut pas réécrire (`pre-push` refuse le
//      non-fast-forward).
//   6. CAPACITÉS. Re-sondées ce boot. §B : « un défaut de prérequis produit
//      BLOCKED, jamais PASS ».
//   7. CLEAN-ROOM. La suite tourne dans un `git worktree add --detach` neuf à
//      HEAD, dont l'état ignoré a été vérifié vide. Le rapport adjugé est celui
//      que CE run vient d'écrire sur la sortie standard, jamais un fichier
//      trouvé sur le disque.
//
// Ce qui sort : une attestation `bench.attestation/1` sur la branche orpheline
// de ledger. `bench resume` la RE-ÉVALUE à chaque appel — digest des entrées,
// capacités du boot courant, dépendances prouvées — et c'est cette
// réévaluation, jamais le fichier, qui fait qu'une tâche est `[H]`.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import { repoRoot, git, gitOrNull, headSha, branchName, isClean, isAncestor, pushState, oidAt } from './git.mjs'
import { loadRegistry, attestability } from './registry.mjs'
import { inputDigest } from './input-digest.mjs'
import { readEvidence, runProbes, bootId } from './doctor.mjs'
import { resolveLedger, appendToLedger, ledgerRef, attestationsByTask, ledgerOrder } from './ledger.mjs'
import { runInCleanRoom } from './cleanroom.mjs'
import { requiredCapabilities } from './verify-task.mjs'

const R = repoRoot()

/** Un refus nommé, jamais un `false` muet. */
const refuse = (verdict, reason, extra = {}) => ({ ok: false, verdict, reason, ...extra })

/* ───────────────────────────────────────────────────────── porte 4 : le rouge */

/**
 * La porte rouge de la tâche, si elle existe sur le ledger ET parle de cet
 * historique. On prend la plus RÉCENTE des portes dont le commit sujet est un
 * ancêtre de HEAD : c'est celle qui borne la plage des deux clés.
 */
export function redGate(taskId) {
  const { ref } = resolveLedger()
  if (!ref) return null
  const listing = gitOrNull(['ls-tree', '-r', '--name-only', ref, '--', `red/${taskId}`])
  const files = listing ? listing.split('\n').filter(Boolean) : []
  const gates = []
  for (const f of files) {
    const raw = gitOrNull(['show', `${ref}:${f}`])
    if (!raw) continue
    let doc
    try {
      doc = JSON.parse(raw)
    } catch {
      continue
    }
    if (doc.schema !== 'bench.red/1' || doc.task !== taskId) continue
    if (doc.verdict !== 'RED_RECORDED') continue
    if (!doc.subject_commit || !isAncestor(doc.subject_commit, 'HEAD')) continue
    // MEME PIEGE que les attestations : `rev-list --count <ref> -- <f>` compte
    // les commits touchant <f> et vaut 1 pour toute porte, ecrite une fois.
    // Le rang doit etre la PROFONDEUR du commit, sinon « la plus recente »
    // veut dire « la derniere de l'alphabet » — et la plage des deux cles est
    // alors bornee par la mauvaise porte.
    gates.push({ path: f, order: ledgerOrder(ref, f), doc })
  }
  gates.sort((a, b) => a.order - b.order || a.path.localeCompare(b.path))
  return gates.length ? gates[gates.length - 1] : null
}

/* ──────────────────────────────────────────────── porte 5 : les deux clés */

/**
 * Re-dérive la partition sur la plage (porte rouge .. HEAD]. Le rôle de chaque
 * commit est lu dans son trailer `Bench-Role`; un commit sans trailer est
 * REFUSÉ, pas ignoré — c'est la différence entre une garde et une formalité.
 */
export function twoKeyAudit(fromCommit) {
  const range = `${fromCommit}..HEAD`
  const shas = (gitOrNull(['rev-list', '--reverse', range]) ?? '').split('\n').filter(Boolean)
  const commits = []
  for (const sha of shas) {
    const body = git(['log', '-1', '--format=%B', sha])
    const role = (body.match(/^Bench-Role:[ \t]*(.+)$/m) ?? [])[1]?.trim() ?? null
    const phase = (body.match(/^Bench-Phase:[ \t]*(.+)$/m) ?? [])[1]?.trim() ?? null
    const files = (gitOrNull(['show', '--pretty=', '--name-only', '--diff-filter=ACMR', sha]) ?? '')
      .split('\n')
      .filter(Boolean)
    const entry = { sha: sha.slice(0, 12), role, phase, files: files.length, problems: [] }

    if (phase === 'bootstrap') {
      entry.problems.push('SKIPPED: commit de base declare')
      commits.push(entry)
      continue
    }
    if (!role) {
      entry.problems.push('ROLE_ABSENT : aucun trailer Bench-Role')
      commits.push(entry)
      continue
    }
    if (files.length === 0) {
      commits.push(entry)
      continue
    }
    try {
      execFileSync('node', ['verification/runner/guard-paths.mjs', role, ...files], {
        cwd: R,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      entry.problems.push(...String(e.stderr ?? '').trim().split('\n').filter(Boolean))
    }
    commits.push(entry)
  }
  const tainted = commits.filter((c) => c.problems.some((p) => !p.startsWith('SKIPPED')))
  return { range, commits, tainted }
}

/* ───────────────────────────────────────────────────────────── adjudication */

/** Le rapport JSON que le clean-room a imprimé — et rien d'autre. */
export function parseReport(stdout) {
  const start = stdout.indexOf('{')
  if (start < 0) return null
  try {
    return JSON.parse(stdout.slice(start))
  } catch {
    return null
  }
}

export function accept(taskId, { dryRun = false } = {}) {
  const started = Date.now()

  // ── 1. registre
  const reg = loadRegistry()
  if (reg.problems?.length) return refuse('REGISTRY_INVALID', 'registre invalide', { problems: reg.problems })
  const task = reg.byId.get(taskId)
  if (!task) return refuse('UNKNOWN_TASK', `${taskId} n'existe pas dans verification/tasks.json`)

  const att = attestability(taskId, reg.lock)
  if (!att.attestable)
    return refuse('UNCLASSIFIED_PROOF_KIND', `cas sans mode de preuve etabli : ${att.unclassified.join(', ')}`)

  // ── 2. arbre propre
  if (!isClean())
    return refuse('DIRTY_TREE', 'un diff non committe interdit une attestation (§G)', {
      porcelain: git(['status', '--porcelain']).split('\n').slice(0, 20),
    })

  // ── 3. sources poussees
  const branch = branchName()
  const push = pushState(branch)
  if (!push.pushed)
    return refuse('SOURCE_NOT_PUSHED', `${branch} n'est pas poussee : le commit atteste serait perdu avec le conteneur`, {
      ahead: push.ahead,
    })

  // ── 4. porte rouge
  const gate = redGate(taskId)
  if (!gate)
    return refuse(
      'NO_RED_GATE',
      `aucune porte rouge RED_RECORDED pour ${taskId} sur ${ledgerRef()} dont le commit sujet soit un ancetre de HEAD`
    )

  // ── 5. regle des deux cles
  const audit = twoKeyAudit(gate.doc.subject_commit)
  if (audit.tainted.length)
    return refuse('PROOF_TAINTED', 'la plage depuis la porte rouge viole la partition des zones', { audit })

  // ── 6. capacites, re-sondees ce boot
  const caps = requiredCapabilities(task)
  const known = readEvidence()?.capabilities ?? {}
  const unknown = caps.filter((c) => !(c in known))
  const probed = unknown.length ? runProbes(unknown) : {}
  const capState = Object.fromEntries(caps.map((c) => [c, known[c] ?? probed[c] ?? { present: false, reason: 'sonde indisponible' }]))
  const missing = caps.filter((c) => !capState[c].present)
  if (missing.length) return refuse('BLOCKED', `capacites absentes ce boot : ${missing.join(', ')}`, { capabilities: capState })

  // ── 7. clean-room
  const head = headSha()
  const digest = inputDigest(task, 'HEAD')
  const observed = runInCleanRoom({
    rev: 'HEAD',
    tag: `accept-${taskId}`,
    prepare: [
      'pnpm install --frozen-lockfile --reporter=silent',
      // `--locked`, PAS `--frozen` : chez uv, `--frozen` signifie « n'examine
      // meme pas pyproject.toml », donc il rend 0 sur un manifeste desynchronise
      // du lockfile — mesure : uv 0.8.17, exit 0. `--locked` est le veritable
      // equivalent de `pnpm install --frozen-lockfile` (exit 1). Faux amis :
      // meme mot, garantie opposee, et c'est la preparation du CLEAN-ROOM.
      'uv --project analysis sync --locked',
      // BUILD DEPUIS LES SOURCES. Le plan l'exigeait — « installe
      // --frozen-lockfile, BUILD DEPUIS LES SOURCES, execute les sondes » — et
      // il manquait. Consequence mesuree sur T18 : `accept` rendait
      // reason=BLOCKED avec les sept cas non verts, alors que le tableau
      // affichait T18 READY. La sonde `fake-provider` charge
      // packages/gateway/dist/index.js ; `dist/` est gitignore, donc absent
      // d'un worktree neuf, donc la capacite manquait — dans le clean-room
      // seulement. Exactement le defaut que T14 avait deja montre : un vert (ou
      // ici un rouge) qui depend d'un artefact hors du graphe d'objets.
      //
      // Les suites Jest compilent le TS a la volee et n'avaient donc jamais
      // eu besoin de dist/ ; c'est ce qui a masque le trou jusqu'a ce qu'une
      // sonde charge un artefact construit. Cout mesure : 2,7 s.
      'pnpm build',
    ],
    // `node tools/bench` et non `pnpm verify:task` : pnpm prefixe sa sortie de
    // deux lignes de banniere, et le rapport adjuge doit etre la SEULE chose
    // que la commande imprime.
    command: `node tools/bench verify:task ${taskId} --json`,
  })
  if (observed.verdict) return refuse(observed.verdict, observed.reason, { observed: summarize(observed) })

  const report = parseReport(observed.stdout ?? '')
  if (!report) return refuse('NO_REPORT', 'le clean-room n a produit aucun rapport lisible', { observed: summarize(observed) })

  // L'adjudication. Chaque ligne ferme un chemin distinct, et AUCUNE ne se
  // contente du code de sortie du sous-processus (§D-12).
  const problems = []
  if (observed.exit_code !== 0) problems.push(`sortie ${observed.exit_code} en clean-room`)
  if (report.reason !== 'PASS') problems.push(`reason=${report.reason}`)
  if (report.commit !== head) problems.push(`le rapport certifie ${report.commit?.slice(0, 12)}, HEAD est ${head.slice(0, 12)}`)
  if (report.dirty) problems.push('le rapport se declare produit sur un arbre sale')
  if (report.registry?.kind !== 'repository') problems.push(`registre ${report.registry?.kind} : une attestation ne s appuie jamais sur un registre de remplacement`)
  if (report.input_digest !== digest) problems.push('input_digest du rapport different de celui calcule a HEAD')
  const statuses = new Map((report.case_statuses ?? []).map((c) => [c.id, c.status]))
  const notGreen = task.required_cases.filter((c) => statuses.get(c) !== 'PASS')
  if (notGreen.length) problems.push(`cas requis non verts : ${notGreen.join(', ')}`)
  if ((report.skipped_cases ?? []).length) problems.push(`cas sautes : ${report.skipped_cases.join(', ')}`)

  if (problems.length)
    return refuse('NOT_PROVEN', 'le clean-room ne prouve pas la tache', { problems, report: slim(report), observed: summarize(observed) })

  // ── L'attestation
  const doc = {
    schema: 'bench.attestation/1',
    task: taskId,
    verdict: 'PASS',
    commit: head,
    branch,
    dirty: false,
    clean_room: true,
    input_digest: digest,
    capabilities_used: caps,
    capabilities: capState,
    cases: task.required_cases.map((id) => ({ id, status: statuses.get(id) })),
    proof_kinds: att.kinds,
    red_gate: { path: gate.path, subject_commit: gate.doc.subject_commit, verdict: gate.doc.verdict },
    two_key: { range: audit.range, commits: audit.commits },
    clean_room_run: summarize(observed),
    report: slim(report),
    depends_on: task.depends_on,
    limitations: [...(report.limitations ?? []), ...driftLimitations(task, gate)],
    boot_id: bootId(),
    produced_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
  }

  if (dryRun) return { ok: true, verdict: 'PASS', doc, dryRun: true }

  const ledger = appendToLedger(
    [{ path: `attestations/${taskId}/${head}.json`, content: JSON.stringify(doc, null, 2) + '\n' }],
    `accept(${taskId}): PASS atteste en clean-room sur ${head.slice(0, 8)}`
  )
  return { ok: true, verdict: 'PASS', doc, ledger }
}

/**
 * LA PORTE ROUGE PARLE-T-ELLE ENCORE DES ASSERTIONS ACTUELLES ?
 *
 * `accept` exige une porte rouge dont le commit sujet soit un ancetre de HEAD.
 * Rien n'exige que l'entree d'acceptation n'ait pas change depuis : un cas
 * ajoute APRES la porte n'a jamais ete observe rouge, et son vert pourrait donc
 * venir d'un cas vide — exactement ce que la porte existe pour exclure.
 *
 * Le rendre bloquant serait malhonnete : une fois la tache implementee, on ne
 * peut plus reproduire le rouge sans desinstaller l'implementation. On fait
 * donc ce que le cahier fait ailleurs — DETECTER ET NOMMER plutot que
 * pretendre. L'attestation porte la limitation en clair, et `bench resume`
 * l'affiche : un lecteur voit ce que la preuve ne couvre pas.
 */
export function driftLimitations(task, gate) {
  const entry = task.acceptance_entry
  if (!entry || !gate?.doc?.subject_commit) return []
  const atRed = oidAt(gate.doc.subject_commit, entry)
  const atHead = oidAt('HEAD', entry)
  if (atRed === atHead) return []
  return [
    {
      code: 'RED_GATE_PREDATES_ACCEPTANCE_EDIT',
      detail:
        `${entry} a change depuis la porte rouge ${gate.doc.subject_commit.slice(0, 12)} ` +
        `(${atRed.slice(0, 12)} -> ${atHead.slice(0, 12)}). Le rouge observe ne porte pas ` +
        `sur les assertions actuelles : ce qui a ete ajoute depuis n'a jamais ete vu echouer.`,
    },
  ]
}

/** Ce qu'on garde du run : assez pour rejouer, jamais la sortie entiere. */
function summarize(o) {
  return {
    nonce: o.nonce,
    rev: o.rev,
    clean_room: o.clean_room,
    pristine: o.pristine,
    stray_before: o.stray_before ?? [],
    prepare: (o.prepare ?? []).map((p) => ({ command: p.command, exit_code: p.exit_code })),
    command: o.command,
    exit_code: o.exit_code,
    stdout_sha256: o.stdout_sha256,
    run_dir: o.run_dir?.startsWith(R + '/') ? o.run_dir.slice(R.length + 1) : o.run_dir,
  }
}

/** Le rapport, sans ce qui est volatil ni ce qui ferait doublon. */
function slim(r) {
  const { volatile, stdout_tail, prerequisites, ...rest } = r ?? {}
  return rest
}

export function render(result) {
  const L = []
  if (!result.ok) {
    L.push(`ACCEPT — REFUSE : ${result.verdict}`, '', `  ${result.reason}`)
    for (const p of result.problems ?? []) L.push(`    ${p}`)
    for (const c of result.audit?.tainted ?? []) L.push(`    ${c.sha} [${c.role ?? 'sans role'}] ${c.problems.join(' | ')}`)
    for (const p of result.porcelain ?? []) L.push(`    ${p}`)
    L.push('', '  Aucune attestation n a ete ecrite. §B : un defaut de prerequis ou de')
    L.push('  procedure produit un refus nomme, jamais un PASS affaibli.')
    return L.join('\n')
  }
  const d = result.doc
  L.push(`ACCEPT ${d.task} — PASS   atteste en clean-room`, '')
  L.push(`  commit        ${d.commit.slice(0, 12)}  (${d.branch})`)
  L.push(`  input_digest  ${d.input_digest.slice(0, 16)}…`)
  L.push(`  porte rouge   ${d.red_gate.subject_commit.slice(0, 12)}  ${d.red_gate.verdict}`)
  L.push(`  deux cles     ${d.two_key.range}  ${d.two_key.commits.length} commit(s), 0 violation`)
  L.push(`  clean-room    ${d.clean_room_run.nonce}  vierge=${d.clean_room_run.pristine}  sortie=${d.clean_room_run.exit_code}`)
  L.push(`  capacites     ${d.capabilities_used.join(', ') || 'aucune'}`)
  L.push('')
  for (const c of d.cases) L.push(`    ${c.status === 'PASS' ? 'OK  ' : 'ROUGE'} ${c.id}`)
  L.push('')
  if (result.dryRun) {
    L.push('  --dry-run : rien n a ete ecrit sur le ledger.')
  } else {
    L.push(`  ledger        ${result.ledger.ref} ${result.ledger.commit.slice(0, 8)}  ${result.ledger.files[0]}`)
    L.push('')
    L.push('  RIEN N EST DURABLE TANT QUE CE N EST PAS POUSSE :')
    L.push(`  -> git push --atomic origin ${d.branch} ${result.ledger.ref}`)
  }
  return L.join('\n')
}

export { attestationsByTask }
