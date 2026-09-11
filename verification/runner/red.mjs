// ─────────────────────────────────────────────────────────────────────────────
// bench red — enregistre la PORTE ROUGE sur le ledger.
//
// Sans cet enregistrement, la preuve que les cas ont été observés en échec
// AVANT toute implémentation ne vivrait que dans une conversation — précisément
// ce que §K interdit : « il n'infère pas la réussite d'une tâche d'après un
// résumé de conversation ».
//
// Ce que la porte refuse, et pourquoi :
//   • un cas VERT à ce stade est VACUOUS — un programme qui ne fait rien peut
//     satisfaire un cas mal écrit (observé pour de vrai sur T00.A4/A5) ;
//   • un rouge dont la cause est un module introuvable ou une suite qui refuse
//     de se charger n'est PAS une preuve : c'est la forme par défaut du TDD,
//     et elle ne dit rien de ce que le test vérifie ;
//   • un cas VERT n'est admis que s'il porte une CONTRE-ÉPREUVE par mutation :
//     un mutant nommé doit le tuer. Faute de quoi il est indistinguable d'un
//     cas vide.
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { repoRoot, git, headSha, isClean } from './git.mjs'
import { loadRegistry } from './registry.mjs'
import { inputDigest } from './input-digest.mjs'
import { ledgerRef } from './ledger.mjs'

const R = repoRoot()

export const RED_REASONS = {
  VALID: ['ASSERTION_FAILED', 'STUB_NOT_IMPLEMENTED'],
  INVALID: ['MODULE_NOT_FOUND', 'TYPE_ERROR', 'SUITE_FAILED_TO_RUN'],
}

/** Exécute la suite et rend l'état observé par cas — sans l'interpréter. */
export function observeSuite(taskId) {
  let out = '',
    code = 0
  try {
    out = execSync('pnpm test 2>&1', { cwd: R, encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 64e6 })
  } catch (e) {
    code = e.status ?? 1
    out = String(e.stdout ?? '') + String(e.stderr ?? '')
  }

  if (/Test suite failed to run/.test(out)) {
    return { suite_loaded: false, exit_code: code, cases: [], raw_tail: out.slice(-2000) }
  }

  const cases = []
  const re = new RegExp(`(✓|✕|√|×)\\s+(${taskId}\\.A\\d+)`, 'g')
  let m
  while ((m = re.exec(out)) !== null) {
    cases.push({ id: m[2], green: m[1] === '✓' || m[1] === '√' })
  }
  return { suite_loaded: true, exit_code: code, cases, raw_tail: out.slice(-4000) }
}

/**
 * Adjuge. Ne consomme QUE l'observation qu'on vient de produire, jamais un
 * fichier trouvé sur le disque.
 */
export function adjudicate(taskId, observed, mutationProof = {}) {
  const reg = loadRegistry()
  if (reg.problems?.length) return { verdict: 'REGISTRY_INVALID', problems: reg.problems }
  const task = reg.byId.get(taskId)
  if (!task) return { verdict: 'UNKNOWN_TASK' }

  if (!observed.suite_loaded)
    return {
      verdict: 'INVALID_RED',
      reason: 'SUITE_FAILED_TO_RUN',
      detail: "la suite ne s'est pas chargee : zero cas execute, donc aucune preuve",
    }

  const seen = new Map(observed.cases.map((c) => [c.id, c]))
  const missing = task.required_cases.filter((c) => !seen.has(c))
  if (missing.length)
    return { verdict: 'INVALID_RED', reason: 'CASES_NOT_OBSERVED', detail: missing.join(', ') }

  const rows = task.required_cases.map((id) => {
    const c = seen.get(id)
    const proof = mutationProof[id]
    if (!c.green) return { id, state: 'RED', reason: 'ASSERTION_FAILED' }
    // Un vert n'est admis qu'avec contre-epreuve par mutation.
    if (proof?.killed_by)
      return { id, state: 'GREEN_PROVEN_BY_MUTATION', killed_by: proof.killed_by, note: proof.note ?? null }
    return { id, state: 'VACUOUS', reason: 'vert sans contre-epreuve par mutation' }
  })

  const vacuous = rows.filter((r) => r.state === 'VACUOUS')
  return {
    verdict: vacuous.length ? 'INVALID_RED' : 'RED_RECORDED',
    reason: vacuous.length ? 'VACUOUS_CASES' : null,
    vacuous: vacuous.map((r) => r.id),
    rows,
  }
}

export function record(taskId, observed, adjudication, mutationProof) {
  const reg = loadRegistry()
  const task = reg.byId.get(taskId)
  const doc = {
    schema: 'bench.red/1',
    task: taskId,
    subject_commit: headSha(),
    dirty: !isClean(),
    input_digest: inputDigest(task, 'HEAD'),
    suite_loaded: observed.suite_loaded,
    suite_exit_code: observed.exit_code,
    verdict: adjudication.verdict,
    cases: adjudication.rows,
    mutation_proof: mutationProof,
    invalid_red_reasons: RED_REASONS.INVALID,
    note:
      'Un rouge par module introuvable ou suite non chargee n est PAS une preuve. ' +
      'Un vert a ce stade n est admis qu avec un mutant nomme qui le tue.',
  }
  const ledger = process.env.BENCH_LEDGER ?? `${R}/.bench/ledger-wt`
  const dir = `${ledger}/red/${taskId}`
  mkdirSync(dir, { recursive: true })
  const path = `${dir}/${doc.subject_commit}.json`
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n')
  return { path, doc }
}

export { existsSync, readFileSync, git, ledgerRef }
