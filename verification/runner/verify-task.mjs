// ─────────────────────────────────────────────────────────────────────────────
// bench verify:task <Txx> — le vérificateur.
//
// §G : « T00 crée `pnpm verify:task Txx`. Une tâche exécutée renvoie : code 0
// si toutes ses assertions requises et ses dépendances réussissent ; code 1 si
// une assertion échoue ; code 2 si un prérequis est absent. »
// ADR-005 §1 projette les quatre issues de T00 sur ces trois codes, la
// distinction vivant dans le champ `reason` du rapport.
//
// L'ORDRE DES BRANCHES EST FAIL-CLOSED, et c'est le cœur du fichier :
//
//   1. registre invalide  → 2 / REGISTRY_INVALID. On ne prétend jamais savoir
//      si une tâche existe dans un registre qu'on vient de déclarer cassé.
//   2. tâche absente      → 2 / UNKNOWN_TASK.
//   3. prérequis absent   → 2 / BLOCKED. §B : « un défaut de prérequis produit
//      BLOCKED, jamais PASS ». Ce verdict n'était pas rendu par le squelette,
//      qui n'avait rien à faire tourner ; maintenant qu'une suite s'exécute,
//      une capacité absente doit ARRÊTER avant elle, sinon la suite échouerait
//      et l'absence d'hôte serait maquillée en échec d'assertion.
//   4. entrée d'acceptation absente, ou suite qui ne se charge pas, ou aucun
//      cas requis observé → 2 / NOT_IMPLEMENTED. Rien n'a tourné : ce n'est pas
//      un échec d'assertion (ADR-005 §1 : « 1 signifie que la tâche a tourné »).
//   5. un cas requis rouge, sauté ou jamais vu → 1 / ASSERTION_FAILED.
//   6. tous les cas requis observés VERTS → 0 / PASS.
//
// CE QUI REND `PASS` ATTEIGNABLE, ET CE QUI LE REND DIFFICILE. §D-12 : « un
// résultat PASS nécessite l'exécution des assertions obligatoires ; ni test
// sauté, ni rapport absent, ni simple code de sortie d'un sous-processus ne
// suffisent ». Les trois interdits sont fermés ici, chacun par une ligne de
// `adjudicate()` : le rapport machine de la chaîne est la seule entrée (jamais
// son code de sortie), un cas sauté est refusé comme un cas rouge, et un cas
// requis jamais observé est refusé comme un cas rouge.
//
// CE QUE CE FICHIER NE FAIT TOUJOURS PAS, ET POURQUOI CE N'EST PAS UN MANQUE.
// §G parle aussi des DÉPENDANCES. Elles ne commandent pas le verdict ici : la
// dépendance est une propriété du GRAPHE, pas de la suite d'une tâche, et
// l'autorité sur « une dépendance est-elle validée » est le ledger — que
// `bench resume` et `bench accept` interrogent. Les faire peser sur
// `verify:task` rendrait la commande inutilisable pendant le développement
// (T01 refuserait de s'exécuter tant que T00 n'est pas attestée) sans fermer
// aucun chemin vers un faux PASS, puisque `bench accept` refuse déjà d'attester
// une tâche dont une dépendance n'est pas prouvée. L'état des dépendances est
// donc OBSERVÉ et inscrit au rapport (`depends_on`), et la limite est nommée
// dans `limitations`.
//
// Le rapport va dans `verification/results/<Txx>.json`, chemin GITIGNORÉ.
// ADR-005 §6 : ce n'est pas une contradiction avec §G, c'est le dispositif
// d'anti-circularité — la preuve existe à l'endroit prescrit sans que la
// produire modifie le commit qu'elle certifie.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { repoRoot, headSha, branchName, isClean, oidAt } from './git.mjs'
import { loadRegistryForVerification } from './registry.mjs'
import { inputDigest } from './input-digest.mjs'
import { readEvidence, runProbes, bootId } from './doctor.mjs'
import { runAcceptance, projectCases, TEST_STATUS } from './chains.mjs'

const R = repoRoot()

/** Les issues nommées par ADR-005 §1, plus le `BLOCKED` qu'impose §B. */
export const REASON = {
  PASS: 'PASS',
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  UNKNOWN_TASK: 'UNKNOWN_TASK',
  REGISTRY_INVALID: 'REGISTRY_INVALID',
  BLOCKED: 'BLOCKED',
}

/** La projection des issues sur les trois codes du §G. */
export const EXIT_FOR_REASON = {
  [REASON.PASS]: 0,
  [REASON.ASSERTION_FAILED]: 1,
  [REASON.NOT_IMPLEMENTED]: 2,
  [REASON.UNKNOWN_TASK]: 2,
  [REASON.REGISTRY_INVALID]: 2,
  [REASON.BLOCKED]: 2,
}

const sha256File = (p) => {
  try {
    return createHash('sha256').update(readFileSync(p)).digest('hex')
  } catch {
    return null
  }
}

/**
 * Versions DÉCLARÉES (lues dans les fichiers d'épinglage) et OBSERVÉES (lues
 * dans le processus courant). Les deux, jamais l'une pour l'autre : c'est
 * exactement l'écart que §C veut rendre visible quand un hôte n'a pas la
 * version épinglée.
 */
export function versions() {
  let pkg = {}
  try {
    pkg = JSON.parse(readFileSync(`${R}/package.json`, 'utf8'))
  } catch {}
  const dev = pkg.devDependencies ?? {}
  let pyproject = ''
  try {
    pyproject = readFileSync(`${R}/analysis/pyproject.toml`, 'utf8')
  } catch {}
  const grab = (re) => (pyproject.match(re) ?? [])[1] ?? null

  return {
    declared: {
      node: pkg.engines?.node ?? null,
      pnpm: pkg.packageManager ?? null,
      typescript: dev.typescript ?? null,
      jest: dev.jest ?? null,
      'ts-jest': dev['ts-jest'] ?? null,
      python: grab(/requires-python\s*=\s*"([^"]+)"/),
      pytest: grab(/pytest==([0-9A-Za-z.\-]+)/),
    },
    observed: { node: process.versions.node, v8: process.versions.v8 },
  }
}

/**
 * Prérequis EXÉCUTÉS, jamais supposés. On réutilise les sondes de doctor si
 * elles datent de CE boot ; sinon on relance uniquement celles dont la tâche a
 * besoin. Aucun cache entre deux boots : doctor.mjs en explique la raison.
 */
export function prerequisites(required) {
  const needed = [...new Set(required ?? [])]
  if (needed.length === 0) return {}
  const known = readEvidence()?.capabilities ?? {}
  const absent = needed.filter((c) => !(c in known))
  const fresh = absent.length ? runProbes(absent) : {}
  const out = {}
  for (const c of needed) out[c] = known[c] ?? fresh[c] ?? { present: false, reason: 'sonde indisponible' }
  return out
}

/** Les capacités qu'une carte exige réellement, credentials compris (§B). */
export function requiredCapabilities(task) {
  const caps = [...(task?.requires ?? [])]
  if (task?.requires_live_credentials) caps.push('live-credentials')
  return [...new Set(caps)]
}

/**
 * Adjuge les cas requis à partir des tests OBSERVÉS. Trois refus distincts, et
 * aucun d'eux ne regarde le code de sortie de la chaîne (§D-12).
 */
export function adjudicate(requiredCases, run) {
  const statuses = projectCases(requiredCases, run.tests ?? [])
  const executed = statuses.filter((s) => s.status !== 'NOT_RUN').map((s) => s.id)
  const failed = statuses.filter((s) => s.status === TEST_STATUS.FAIL).map((s) => s.id)
  const skipped = statuses.filter((s) => s.status === TEST_STATUS.SKIPPED).map((s) => s.id)
  const missing = statuses.filter((s) => s.status === 'NOT_RUN').map((s) => s.id)

  // La suite ne s'est pas chargée, ou aucun cas requis n'a été vu : il n'y a
  // rien à adjuger. Une tâche qui n'a rien exécuté n'a pas ÉCHOUÉ, elle n'est
  // pas implémentée — les confondre ferait passer un import cassé pour un
  // contrat violé, et inversement.
  if (!run.loaded || executed.length === 0) {
    return {
      reason: REASON.NOT_IMPLEMENTED,
      statuses,
      executed,
      failed,
      skipped,
      missing,
      detail: [
        run.why ?? `aucun cas requis observe parmi ${run.tests?.length ?? 0} test(s) executes`,
        ...(run.suite_errors ?? []).slice(0, 3),
      ],
    }
  }

  if (failed.length || skipped.length || missing.length) {
    return {
      reason: REASON.ASSERTION_FAILED,
      statuses,
      executed,
      failed,
      skipped,
      missing,
      detail: [
        failed.length ? `cas en echec : ${failed.join(', ')}` : null,
        skipped.length ? `cas SAUTES — §G les refuse : ${skipped.join(', ')}` : null,
        missing.length ? `cas requis jamais observes : ${missing.join(', ')}` : null,
      ].filter(Boolean),
    }
  }

  return { reason: REASON.PASS, statuses, executed, failed, skipped, missing, detail: [] }
}

/**
 * LA décision. L'ordre est celui de l'en-tête, et il est fail-closed de bout en
 * bout : chaque branche antérieure rend impossible d'affirmer ce que la
 * suivante supposerait.
 */
export function decide(taskId, env = process.env) {
  const reg = loadRegistryForVerification(env)
  if (reg.problems.length)
    return { reason: REASON.REGISTRY_INVALID, registry: reg, detail: reg.problems }

  const task = reg.byId.get(taskId)
  if (!task)
    return {
      reason: REASON.UNKNOWN_TASK,
      registry: reg,
      detail: [`${taskId} n'existe pas dans ${reg.source.path}`],
    }

  const caps = requiredCapabilities(task)
  const prereq = prerequisites(caps)
  const blockedBy = Object.entries(prereq)
    .filter(([, v]) => !v.present)
    .map(([k]) => k)
  if (blockedBy.length)
    return {
      reason: REASON.BLOCKED,
      registry: reg,
      task,
      prereq,
      blockedBy,
      detail: [
        `prerequis absent(s) : ${blockedBy.join(', ')}`,
        'Un defaut de prerequis produit BLOCKED, jamais un PASS affaibli (§B).',
      ],
    }

  const run = runAcceptance(task.acceptance_entry)
  const verdict = adjudicate(task.required_cases ?? [], run)
  return { reason: verdict.reason, registry: reg, task, prereq, blockedBy, run, verdict, detail: verdict.detail }
}

/** Construit le rapport du §G à partir de ce qui a été réellement observé. */
export function buildReport(taskId, decision, startedAt) {
  const { reason, registry, task, detail, run, verdict } = decision
  const prereq = decision.prereq ?? prerequisites(requiredCapabilities(task))
  const blockedBy = Object.entries(prereq)
    .filter(([, v]) => !v.present)
    .map(([k]) => k)

  const expected = task?.required_cases ?? []
  const statuses = verdict?.statuses ?? expected.map((id) => ({ id, status: 'NOT_RUN' }))
  const executed = verdict?.executed ?? []

  return {
    schema: 'bench.result/1',
    task_id: taskId,
    reason,
    exit_code: EXIT_FOR_REASON[reason],

    // §G : « id de tâche, commit […] ». Le commit certifié, et l'aveu si
    // l'arbre est sale : « les preuves intermédiaires de développement peuvent
    // être étiquetées dirty=true, sans valider la fin d'une tâche ».
    commit: headSha(),
    branch: branchName(),
    dirty: !isClean(),
    clean_room: false,

    registry: {
      kind: registry.source.kind,
      path: registry.source.path.startsWith(R + '/') ? registry.source.path.slice(R.length + 1) : registry.source.path,
      sha256: sha256File(registry.source.path),
      problems: registry.problems,
    },

    // §G : « empreinte des fixtures ». Lue dans l'OBJET GIT, jamais par un
    // parcours de fichiers : git.mjs explique pourquoi (un worktree sparse
    // empreinterait l'ensemble vide et rendrait T01.A4 auto-satisfaisant).
    fixtures: { 'acceptance/reference': oidAt('HEAD', 'acceptance/reference') },
    input_digest: task ? inputDigest(task, 'HEAD') : null,

    // §G : « versions ».
    versions: versions(),
    lockfiles: {
      'pnpm-lock.yaml': sha256File(`${R}/pnpm-lock.yaml`),
      'analysis/uv.lock': sha256File(`${R}/analysis/uv.lock`),
    },

    // §G : « commandes ». Ce qui a réellement été lancé, avec son code.
    commands: run?.commands ?? [],
    chain: run?.chain ?? null,
    acceptance_entry: task?.acceptance_entry ?? null,
    suite_loaded: run?.loaded ?? false,
    suite_exit_code: run?.exit_code ?? null,
    tests_observed: run?.totals ?? { total: 0, passed: 0, failed: 0 },

    // §G : « assertions attendues/exécutées, statuts individuels ».
    expected_cases: expected,
    executed_cases: executed,
    assertions_expected: expected.length,
    assertions_executed: executed.length,
    case_statuses: statuses,
    skipped_cases: verdict?.skipped ?? [],
    missing_cases: verdict?.missing ?? expected,

    // §G : « fichiers de preuves ». Le rapport machine de la chaîne, celui que
    // CE run vient d'écrire dans un répertoire nommé par nonce.
    proof_files: run?.report_file ? [run.report_file] : [],

    // §G : « prérequis ».
    requires: task?.requires ?? [],
    prerequisites: prereq,
    blocked_by: blockedBy,
    requires_live_credentials: task?.requires_live_credentials ?? null,
    depends_on: task?.depends_on ?? [],

    detail,
    stdout_tail: reason === REASON.PASS ? null : (run?.stdout_tail ?? null),

    limitations: [
      'Les dependances ne commandent pas ce verdict : le graphe est adjuge par bench accept et bench resume, qui lisent le ledger.',
      'Ce rapport n\'est PAS une attestation tant qu\'il n\'est pas produit en clean-room sur un arbre propre (clean_room / dirty ci-dessus).',
      'La CI n\'est couverte par aucun cas requis de T00 (ADR-005 point 7) : elle est livree, pas prouvee ici.',
    ],

    // §G : « L'heure et la durée sont des métadonnées volatiles, exclues de la
    // comparaison canonique des résultats métier. » Elles sont donc regroupées
    // sous une seule clé, que le comparateur peut retirer d'un bloc au lieu de
    // devoir connaître leurs noms un par un.
    volatile: {
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      boot_id: bootId(),
      run_id: run?.run_id ?? null,
    },
  }
}

const SAFE_NAME = /^[A-Za-z0-9_.-]{1,32}$/

export function writeReport(report) {
  if (!SAFE_NAME.test(report.task_id)) return null
  const dir = `${R}/verification/results`
  mkdirSync(dir, { recursive: true })
  const path = `${dir}/${report.task_id}.json`
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n')
  return path
}

export function verifyTask(taskId, env = process.env) {
  const startedAt = Date.now()
  const decision = decide(taskId, env)
  const report = buildReport(taskId, decision, startedAt)
  const path = writeReport(report)
  return { report, path, exit: EXIT_FOR_REASON[report.reason] }
}

/** Rendu texte. Nomme le fichier de rapport : §G interdit « ça marche ». */
export function render(report, path) {
  const L = []
  L.push(`VERIFY:TASK  ${report.task_id}   ${report.reason}   sortie ${report.exit_code}`)
  L.push('')
  L.push(`  commit        ${report.commit.slice(0, 12)}${report.dirty ? '  (arbre SALE — dirty=true)' : ''}`)
  L.push(`  registre      ${report.registry.kind}  ${report.registry.path}`)
  if (report.registry.problems.length) {
    L.push('')
    L.push('  REGISTRE INVALIDE :')
    report.registry.problems.forEach((p) => L.push(`    ${p}`))
  }
  // `detail` reprend `registry.problems` quand le registre est invalide : ne
  // pas le réimprimer, une preuve lue deux fois n'en fait pas deux.
  if (report.reason !== REASON.REGISTRY_INVALID) for (const d of report.detail ?? []) L.push(`  ${d}`)
  L.push('')
  if (report.acceptance_entry) {
    L.push(`  acceptation   ${report.acceptance_entry}  [${report.chain ?? 'chaine inconnue'}]`)
  }
  for (const c of report.commands ?? []) L.push(`  commande      ${c.command}   -> ${c.exit_code}`)
  L.push('')
  L.push(`  cas attendus  ${report.assertions_expected}   executes ${report.assertions_executed}`)
  for (const s of report.case_statuses ?? []) {
    const mark = s.status === 'PASS' ? 'OK  ' : s.status === 'FAIL' ? 'ROUGE' : s.status === 'SKIPPED' ? 'SAUTE' : 'NON  '
    L.push(`    ${mark} ${s.id}`)
  }
  if (report.requires.length) {
    L.push(`  prerequis     ${report.requires.map((c) => `${c}${report.prerequisites[c]?.present ? '' : ' (ABSENT)'}`).join(', ')}`)
  }
  L.push('')
  if (report.reason === REASON.NOT_IMPLEMENTED) {
    L.push('  Aucun cas requis n\'a ete observe : rien n\'a tourne. §D-12 interdit de')
    L.push('  conclure sans assertions executees — ce n\'est pas un echec d\'assertion.')
    L.push('')
  }
  if (report.reason === REASON.PASS) {
    L.push('  Les cas requis ont TOUS ete executes et sont verts. Ce rapport ne vaut')
    L.push('  pas attestation : seul `bench accept` en produit une, en clean-room.')
    L.push('')
  }
  if (report.stdout_tail) {
    L.push('  --- fin de la sortie de la chaine ---')
    report.stdout_tail.split('\n').slice(-20).forEach((l) => L.push(`  ${l}`))
    L.push('')
  }
  L.push(path ? `  rapport       ${path.slice(R.length + 1)}  (gitignore — ADR-005 §6)` : '  rapport       non ecrit (id de tache impropre a un nom de fichier)')
  return L.join('\n')
}
