// ─────────────────────────────────────────────────────────────────────────────
// ÉTAGE VERT — exécuter l'évaluateur sur des copies privées jetables (cahier
// L327-L336, tâche T20).
//
// COMPOSITION, PAS RÉINVENTION. Ce fichier ne réimplémente ni l'isolation
// noyau (netns scellé, cgroups réels, rootfs minimal — `@bench/sandbox`, T19)
// ni le clonage bas niveau : il les ORCHESTRE.
//   - `private-pg.ts`    clone PostgreSQL jetable, joignable UNIQUEMENT par le
//                        candidat de CETTE évaluation (T19 `allowedEgress`)
//   - `private-files.ts` copie jetable de `developerFilesDir`, montée par
//                        `@bench/sandbox` sous `/workspace` du candidat
//   - `@bench/sandbox`   `buildSandboxProfile`/`provisionSandbox` (T19) :
//                        netns dédié, cgroups réels, `execShell` DANS le
//                        conteneur candidat
//
// LES DEUX RÔLES PUBLIÉS (section III de l'en-tête d'`acceptance/T20.spec.ts`,
// fixés par cette suite faute d'énoncé du cahier — même geste que T19 fixant
// `SandboxHandle`) :
//
//   runPrivateEvaluation(input) -> Promise<EvaluationResult>
//       Clone `developerDsn`/`developerFilesDir` dans une copie privée
//       jetable, isolée du développeur (L329), y exécute chaque
//       `hiddenTests[].script` DANS le candidat (`SandboxHandle.execShell`),
//       assemble un verdict RÉEL par cas (`exitCode === 0`, jamais la
//       prétention de `candidateReportedVerdicts`, A2), détruit la copie, et
//       ne renvoie qu'un `boundedFeedback` qui ne cite QUE les `caseId` des
//       cas `operational: true` — jamais `hiddenFilePath` ni le texte d'un
//       script (A4). `simulateTruncatedExecution` (point d'injection NOMMÉ,
//       cahier L141 : « pas de course de temps ») court-circuite
//       DÉTERMINISTIQUEMENT vers `EVALUATION_INCOMPLETE` — jamais une
//       véritable course contre une horloge, qui resterait une COÏNCIDENCE
//       temporelle, pas une preuve.
//   listEvaluationScenarioIds(kind) -> Promise<string[]>
//       Le jeu de scénarios CANONIQUE affecté à `validation`, resp. à
//       `audit` — deux constantes disjointes et non vides, indépendantes de
//       tout `hiddenTests` fourni par l'appelant (A3).
//
// CE QUE CE FICHIER NE FAIT JAMAIS. Il ne lit ni n'écrit
// `candidateReportedVerdicts` dans le calcul d'un verdict — ce champ est
// accepté en entrée et JAMAIS consulté après validation de forme, pour que sa
// présence ne puisse par construction influencer aucun `passed` (A2).
// ─────────────────────────────────────────────────────────────────────────────

import { buildSandboxProfile, provisionSandbox } from '@bench/sandbox'
import { provisionPrivateFiles } from './private-files.js'
import { provisionPrivatePostgres } from './private-pg.js'

/** Un cas caché fourni par l'appelant (section III.1). */
export interface HiddenTestCase {
  readonly caseId: string
  /** Exécuté via `/bin/sh -c "<script>"` DANS la copie privée isolée. */
  readonly script: string
  /** Cas dont le verdict peut être montré au développeur (retour borné, A4). */
  readonly operational?: boolean
  /** Chemin FACTICE du fichier de test — NE DOIT JAMAIS apparaître dans `boundedFeedback`. */
  readonly hiddenFilePath?: string
}

/** Une prétention de verdict émise par le CANDIDAT — sans aucun effet (A2). */
export interface CandidateReportedVerdict {
  readonly caseId: string
  readonly passed: boolean
}

/** Une destination autorisée en liste blanche d'egress pour la copie privée (A7). */
export interface AllowedEgressEntry {
  readonly label: string
  readonly host: string
  readonly port: number
}

/** Entrée de `runPrivateEvaluation` (section III.1). */
export interface PrivateEvaluationInput {
  readonly trajectoryId: string
  readonly kind: 'validation' | 'audit'
  /** PostgreSQL RÉEL, état produit persistant et visible au développeur (L329). */
  readonly developerDsn: string
  /** Hôte, fichiers persistants du produit, visibles au développeur. */
  readonly developerFilesDir: string
  /** Hôte, logs relisibles par le développeur APRÈS l'évaluation. */
  readonly developerLogsDir: string
  readonly hiddenTests: readonly HiddenTestCase[]
  readonly candidateReportedVerdicts?: readonly CandidateReportedVerdict[]
  readonly allowedEgress?: readonly AllowedEgressEntry[]
  /** Point d'injection NOMMÉ (cahier L141 : pas de course de temps). */
  readonly simulateTruncatedExecution?: boolean
}

/** Un verdict RÉELLEMENT observé — jamais la prétention du candidat (A2). */
export interface EvaluationVerdict {
  readonly caseId: string
  readonly passed: boolean
  readonly origin?: string
}

/** Rendu de `runPrivateEvaluation` (section III.1). */
export interface EvaluationResult {
  /** cahier:L97, L333 — jamais un succès prétendu pour une exécution tronquée (A6). */
  readonly status: 'COMPLETED' | 'EVALUATION_INCOMPLETE'
  readonly reason?: string
  readonly verdicts: readonly EvaluationVerdict[]
  /** Sérialisable JSON — ne révèle ni `hiddenFilePath` ni texte des cas non opérationnels (A4). */
  readonly boundedFeedback: unknown
  readonly privateCopyDestroyed: boolean
}

const HIDDEN_TEST_TIMEOUT_MS = 60_000
const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024
const PIDS_MAX = 128

/** Échappement shell — guillemets simples, la seule forme dont POSIX sh a besoin. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Préfixe `script` par l'export des deux variables d'environnement promises
 * à `hiddenTests[].script` (section III.1) — `execShell` (T19) ne prend
 * aucun paramètre d'environnement séparé ; composer en tête de la commande
 * shell est la seule surface qu'il expose. */
function withEnv(script: string, env: Readonly<Record<string, string>>): string {
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}=${shQuote(v)}`)
    .join('; ')
  return `${exports}; ${script}`
}

/** Le jeu CANONIQUE de scénarios de validation — indépendant de tout
 * `hiddenTests` fourni par l'appelant (A3). Fixé par cette tâche, faute
 * d'énoncé du cahier (même geste que T19 fixant `SandboxHandle`). */
const VALIDATION_SCENARIO_IDS: readonly string[] = [
  'validation-reservation-cycle-complet',
  'validation-tarification-standard',
  'validation-annulation-avant-frontiere',
  'validation-migration-version-precedente',
]

/** Le jeu CANONIQUE de scénarios d'audit — disjoint du précédent (A3). */
const AUDIT_SCENARIO_IDS: readonly string[] = [
  'audit-cloisonnement-copie-privee',
  'audit-empreinte-verdict-par-cas',
  'audit-cout-recherche-distingue',
]

/**
 * Le jeu de scénarios CANONIQUE que le runner affecte à `kind`
 * (`validation` xor `audit`, A3) — indépendant de tout `hiddenTests` fourni
 * par l'appelant.
 */
export function listEvaluationScenarioIds(kind: 'validation' | 'audit'): Promise<string[]> {
  return Promise.resolve([...(kind === 'validation' ? VALIDATION_SCENARIO_IDS : AUDIT_SCENARIO_IDS)])
}

interface BoundedFeedbackCase {
  readonly caseId: string
  readonly passed: boolean
}

interface BoundedFeedback {
  readonly cases: readonly BoundedFeedbackCase[]
}

/**
 * Exécute les `hiddenTests` sur une copie privée jetable du checkpoint
 * développeur, dans une frontière d'accès distincte (L329).
 */
export async function runPrivateEvaluation(input: PrivateEvaluationInput): Promise<EvaluationResult> {
  // Point d'injection NOMMÉ (cahier L141) : jamais une course contre une
  // horloge réelle — la troncature est DÉCIDÉE ici, pas mesurée après coup.
  if (input.simulateTruncatedExecution === true) {
    return {
      status: 'EVALUATION_INCOMPLETE',
      reason: 'exécution tronquée (simulateTruncatedExecution=true, point d’injection nommé — cahier L141)',
      verdicts: [],
      boundedFeedback: { cases: [] } satisfies BoundedFeedback,
      privateCopyDestroyed: true,
    }
  }

  const privatePg = await provisionPrivatePostgres(input.developerDsn)
  const privateFiles = provisionPrivateFiles(input.developerFilesDir)

  const verdicts: EvaluationVerdict[] = []
  // Assignés dans le `finally` ci-dessous, qui s'exécute TOUJOURS (succès ou
  // rejet) : une évaluation qui plante en cours de route ne doit jamais
  // laisser le cluster PostgreSQL éphémère ni la copie de fichiers derrière
  // elle (L329, L335 : « nettoyage de chaque copie »).
  let sandboxOk = true
  let privateCopyDestroyed = false
  try {
    const allowedEgress = [...(input.allowedEgress ?? []), privatePg.egress]
    const profile = buildSandboxProfile({
      trajectoryId: input.trajectoryId,
      workspaceDir: privateFiles.dir,
      memoryLimitBytes: MEMORY_LIMIT_BYTES,
      pidsMax: PIDS_MAX,
      allowedEgress,
      // Ni l'un ni l'autre n'est jamais monté dans la vue du candidat
      // (rootfs.ts) : purement descriptif, archivable avec le profil.
      controlRepoRoot: 'n/a (T20 : pas de dépôt de contrôle monté)',
      privateSentinelPath: 'n/a (T20 : pas de sentinelle de contrôle)',
    })
    const sandbox = await provisionSandbox(profile)
    try {
      for (const tc of input.hiddenTests) {
        const wrapped = withEnv(tc.script, {
          EVAL_COPY_DB_DSN: privatePg.dsn,
          EVAL_COPY_FILES_DIR: '/workspace',
        })
        const res = await sandbox.execShell(wrapped, { timeoutMs: HIDDEN_TEST_TIMEOUT_MS })
        verdicts.push({ caseId: tc.caseId, passed: res.exitCode === 0 })
      }
    } finally {
      try {
        await sandbox.destroy()
      } catch {
        sandboxOk = false
      }
    }
  } finally {
    let pgOk = true
    try {
      privatePg.destroy()
    } catch {
      pgOk = false
    }
    let filesOk = true
    try {
      privateFiles.destroy()
    } catch {
      filesOk = false
    }
    privateCopyDestroyed = sandboxOk && pgOk && filesOk
  }

  const operationalIds = new Set(input.hiddenTests.filter((tc) => tc.operational === true).map((tc) => tc.caseId))
  const boundedFeedback: BoundedFeedback = {
    cases: verdicts.filter((v) => operationalIds.has(v.caseId)).map((v) => ({ caseId: v.caseId, passed: v.passed })),
  }

  return {
    status: 'COMPLETED',
    verdicts,
    boundedFeedback,
    privateCopyDestroyed,
  }
}
