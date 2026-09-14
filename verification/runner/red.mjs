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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { repoRoot, git, headSha, isClean } from './git.mjs'
import { loadRegistry } from './registry.mjs'
import { inputDigest } from './input-digest.mjs'
import { ledgerRef, appendToLedger } from './ledger.mjs'
import { runAcceptance, TEST_STATUS } from './chains.mjs'

const R = repoRoot()

export const RED_REASONS = {
  VALID: ['ASSERTION_FAILED', 'STUB_NOT_IMPLEMENTED'],
  INVALID: ['MODULE_NOT_FOUND', 'TYPE_ERROR', 'SUITE_FAILED_TO_RUN'],
}

/**
 * Exécute la suite et rend l'état observé par cas — sans l'interpréter.
 *
 * La chaîne (Jest ou pytest) se déduit de `acceptance_entry`, exactement comme
 * `verify:task` (chains.mjs) : coder en dur `pnpm test` ici ferait tourner
 * Jest sur une tâche pytest, ne trouverait jamais ses cas, et transformerait
 * silencieusement « pas encore implémenté » en CASES_NOT_OBSERVED — un refus
 * qui punirait la mauvaise raison. `runAcceptance` lit en outre le rapport
 * MACHINE (JSON Jest / JUnit pytest), jamais la sortie console — la même règle
 * que chains.mjs impose à `verify:task`, que cette fonction violait jusqu'ici.
 *
 * L'identifiant d'un cas ('Txx.Ay') ne peut pas apparaître littéralement dans
 * un nom de fonction pytest : le point y est syntaxiquement interdit en Python,
 * donc un test honnête l'écrit 'Txx_Ay'. Le séparateur accepté est donc '.' OU
 * '_', jamais un troisième sens — un test Jest garde 'Txx.Ay' au mot.
 */
export function observeSuite(taskId) {
  const reg = loadRegistry()
  const task = reg.byId?.get(taskId)
  if (!task)
    return { suite_loaded: false, exit_code: 1, cases: [], raw_tail: `tache inconnue : ${taskId}` }

  const run = runAcceptance(task.acceptance_entry)
  if (!run.loaded) {
    const tail = `${run.why ?? ''}\n${(run.stderr_tail ?? '').slice(-1500)}`.trim()
    return { suite_loaded: false, exit_code: run.exit_code ?? 1, cases: [], raw_tail: tail.slice(-2000) }
  }

  const cases = []
  for (const id of task.required_cases ?? []) {
    const re = new RegExp(id.replace(/\./g, '[._]'))
    const mine = (run.tests ?? []).filter((t) => re.test(t.name))
    if (mine.length === 0) continue // jamais observe -> CASES_NOT_OBSERVED, plus bas
    const skipped = mine.some((t) => t.status === TEST_STATUS.SKIPPED)
    if (skipped) continue // §G refuse les cas sautes : ni vert, ni rouge legitime
    cases.push({ id, green: mine.every((t) => t.status === TEST_STATUS.PASS) })
  }
  return { suite_loaded: true, exit_code: run.exit_code, cases, raw_tail: (run.stderr_tail ?? '').slice(-4000) }
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
  // La porte rouge n'existe que si elle SURVIT a la session. Un fichier dans
  // .bench/ est gitignore et part avec le conteneur : ce serait exactement le
  // souvenir que §K interdit. L'enregistrement va donc sur la branche orpheline
  // de ledger, par la plomberie — y committer ne change jamais le tree hash des
  // sources, donc produire la preuve ne modifie pas le commit qu'elle certifie.
  const path = `red/${taskId}/${doc.subject_commit}.json`
  const content = JSON.stringify(doc, null, 2) + '\n'

  // Copie locale, pour diagnostic seulement : elle ne fait jamais foi.
  const scratch = `${R}/.bench/ledger-wt/red/${taskId}`
  mkdirSync(scratch, { recursive: true })
  writeFileSync(`${scratch}/${doc.subject_commit}.json`, content)

  const commit = appendToLedger(
    [{ path, content }],
    `red(${taskId}): porte rouge enregistree sur ${doc.subject_commit.slice(0, 8)}`
  )
  return { path, doc, ledger: commit }
}

export { existsSync, readFileSync, git, ledgerRef }
