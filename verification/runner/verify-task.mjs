// ─────────────────────────────────────────────────────────────────────────────
// bench verify:task <Txx> — SQUELETTE.
//
// §G : « T00 crée `pnpm verify:task Txx`. Une tâche exécutée renvoie : code 0
// si toutes ses assertions requises et ses dépendances réussissent ; code 1 si
// une assertion échoue ; code 2 si un prérequis est absent. »
// ADR-005 §1 projette les quatre issues de T00 sur ces trois codes, la
// distinction vivant dans le champ `reason` du rapport.
//
// CE QUE CE FICHIER FAIT, ET CE QU'IL NE FAIT PAS
// ───────────────────────────────────────────────
// Il ne vérifie RIEN. Aucune suite de tests n'est lancée, aucun cas n'est
// adjugé. Toute tâche connue sort donc en `2 / NOT_IMPLEMENTED`.
//
// Ce n'est pas un manque déguisé : c'est le seul verdict honnête tant que la
// vérification n'existe pas. §D-12 — « un résultat `PASS` nécessite l'exécution
// des assertions obligatoires ; ni test sauté, ni rapport absent, ni simple
// code de sortie d'un sous-processus ne suffisent ». Un squelette qui rendrait
// `0` sur une tâche non vérifiée serait précisément le faux PASS que tout le
// dispositif existe pour rendre impossible. La valeur `PASS` est déclarée dans
// `REASON` parce qu'elle fait partie du contrat de sortie ; AUCUN chemin de ce
// module ne la produit, et c'est vérifiable en lisant `decide()`.
//
// EN REVANCHE, les chemins qui ne dépendent pas de la vérification sont justes
// dès maintenant, parce qu'ils sont entièrement connaissables :
//   • registre invalide  → 2 / REGISTRY_INVALID  (fail-closed, évalué en premier :
//     un registre cassé ne permet pas de savoir si la tâche existe) ;
//   • tâche absente du registre → 2 / UNKNOWN_TASK ;
//   • `BENCH_REGISTRY` détourne la lecture (ADR-005 §2).
//
// POURQUOI PAS DE VERDICT `BLOCKED` ICI. §B impose « un défaut de prérequis
// produit BLOCKED, jamais PASS », et ce verdict arrivera. Mais une tâche dont
// la vérification n'est pas écrite n'est pas EMPÊCHÉE de tourner par un
// prérequis : elle n'a rien à faire tourner. Annoncer BLOCKED reviendrait à
// affirmer qu'il ne manque que le prérequis. L'état des prérequis est donc
// OBSERVÉ et inscrit au rapport (`prerequisites`, `blocked_by`), sans encore
// commander le verdict. `NOT_IMPLEMENTED` couvre tous les cas connus, ce qui ne
// peut faire passer aucune tâche pour terminée.
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

const R = repoRoot()

/** Les issues nommées par ADR-005 §1. */
export const REASON = {
  PASS: 'PASS',
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  UNKNOWN_TASK: 'UNKNOWN_TASK',
  REGISTRY_INVALID: 'REGISTRY_INVALID',
}

/** La projection des issues sur les trois codes du §G. */
export const EXIT_FOR_REASON = {
  [REASON.PASS]: 0,
  [REASON.ASSERTION_FAILED]: 1,
  [REASON.NOT_IMPLEMENTED]: 2,
  [REASON.UNKNOWN_TASK]: 2,
  [REASON.REGISTRY_INVALID]: 2,
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

/**
 * LA décision. Trois branches, aucune d'elles ne peut rendre `PASS`.
 * L'ordre est fail-closed : on ne prétend jamais savoir si une tâche existe
 * dans un registre qu'on vient de déclarer invalide.
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

  return { reason: REASON.NOT_IMPLEMENTED, registry: reg, task, detail: [] }
}

/** Construit le rapport du §G à partir de ce qui a été réellement observé. */
export function buildReport(taskId, decision, startedAt) {
  const { reason, registry, task, detail } = decision
  const prereq = prerequisites(task?.requires)
  const blockedBy = Object.entries(prereq)
    .filter(([, v]) => !v.present)
    .map(([k]) => k)

  const expected = task?.required_cases ?? []

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

    // §G : « commandes ». Vide, et c'est le fait le plus important du rapport :
    // aucune commande n'a tourné, donc aucun cas n'a pu réussir.
    commands: [],

    // §G : « assertions attendues/exécutées, statuts individuels ».
    expected_cases: expected,
    executed_cases: [],
    assertions_expected: expected.length,
    assertions_executed: 0,
    case_statuses: expected.map((id) => ({ id, status: 'NOT_RUN' })),
    skipped_cases: [],

    // §G : « fichiers de preuves ».
    proof_files: [],

    // §G : « prérequis ».
    requires: task?.requires ?? [],
    prerequisites: prereq,
    blocked_by: blockedBy,
    requires_live_credentials: task?.requires_live_credentials ?? null,
    depends_on: task?.depends_on ?? [],

    detail,

    limitations: [
      'SQUELETTE : aucune verification n\'est implementee. Toute tache connue sort en NOT_IMPLEMENTED.',
      'Les prerequis sont observes et inscrits, mais ne commandent pas encore le verdict (voir l\'en-tete de verify-task.mjs).',
      'Ce rapport n\'est PAS une attestation : il n\'est pas produit en clean-room et ne va pas au ledger.',
    ],

    // §G : « L'heure et la durée sont des métadonnées volatiles, exclues de la
    // comparaison canonique des résultats métier. » Elles sont donc regroupées
    // sous une seule clé, que le comparateur peut retirer d'un bloc au lieu de
    // devoir connaître leurs noms un par un.
    volatile: {
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      boot_id: bootId(),
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
  report.proof_files = []
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
  L.push(`  cas attendus  ${report.assertions_expected}   executes ${report.assertions_executed}`)
  if (report.requires.length) {
    L.push(`  prerequis     ${report.requires.map((c) => `${c}${report.prerequisites[c]?.present ? '' : ' (ABSENT)'}`).join(', ')}`)
  }
  L.push('')
  if (report.reason === REASON.NOT_IMPLEMENTED) {
    L.push('  Aucune assertion n\'a ete executee : ce squelette n\'implemente pas la')
    L.push('  verification. §D-12 interdit de conclure sans assertions executees.')
    L.push('')
  }
  L.push(path ? `  rapport       ${path.slice(R.length + 1)}  (gitignore — ADR-005 §6)` : '  rapport       non ecrit (id de tache impropre a un nom de fichier)')
  return L.join('\n')
}
