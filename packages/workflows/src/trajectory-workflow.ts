// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — workflow de trajectoire (cahier L361-L370, tâche T24).
//
// CE FICHIER EST LE SEUL QUE LE WORKER BUNDLE DANS LE BAC À SABLE TEMPORAL
// (`workflowsPath` pointe directement dessus, jamais sur `./runner.ts`) : il
// n'importe QUE `@temporalio/workflow`, jamais `node:*` ni un paquet `@bench/*`
// qui en dépendrait — c'est ce qui le rend rejouable (déterminisme des
// workflows, docs.temporal.io/workflow-definition, cahier:L653).
//
// CE QUE CE FICHIER ORCHESTRE, PAS CE QU'IL CALCULE (L365 : « aucune règle
// métier ici »). Une trajectoire est une CHAÎNE SÉQUENTIELLE de périodes : pour
// chacune, deux Activities (effets externes, L365) :
//
//   'model-call'  — UN appel modèle par période, à travers le journal durable
//                   de T17 (`@bench/gateway`, dispatchModelCall). C'est
//                   l'Activity que `--test-duplicate-activity model-call`
//                   (acceptance/T24.spec.ts, A4) force à être invoquée une
//                   SECONDE fois avec la MÊME identité d'opération : la
//                   déduplication (invariant 6, L68) vit dans l'Activity, pas
//                   ici — ce fichier se contente de comparer les deux réponses
//                   reçues et de publier `calls_observed`.
//   'run-period'  — l'assemblage complet d'UNE période persistante (T23,
//                   `runPeriodOnce`) : RESTORING..CHECKPOINTING contre
//                   PostgreSQL et S3 réels.
//
// PARAMÈTRES EXPLICITES DE RETRY (L363) : `proxyActivities` ci-dessous fixe
// une politique nommée plutôt que les défauts du SDK — un rejeu de la MÊME
// Activity (retry Temporal OU `--test-duplicate-activity`) retrouve son
// résultat au lieu de refaire l'effet externe (invariant 6, L68 ; invariant 7,
// L69 ; L655).
//
// CONTINUATION (A5, invariant 1 L63 : « aucun retour automatique à une base
// idéale »). `continueAsNew` ne repart JAMAIS d'une identité ou d'un état
// vide : `campaignId`, le nombre total de périodes, la dernière période
// achevée, les `period_starts`/`continuation_chain` déjà produits et le
// résultat éventuel du test de duplication (A4) traversent la continuation
// dans l'entrée de l'exécution suivante. `workflowInfo().runId` est une
// lecture STABLE au sein d'une exécution donnée (identique en direct et au
// replay de CETTE exécution) : c'est la source du `run_id` de chaque maillon
// de `continuation_chain`.
// ─────────────────────────────────────────────────────────────────────────────
import { continueAsNew, proxyActivities, workflowInfo } from '@temporalio/workflow'

/* ══════════════════════════════ formes du contrat (section III, T24.spec) */

/** Un démarrage de période, DANS L'ORDRE réel de démarrage (A1). */
export interface PeriodStart {
  readonly period_index: number
  readonly after_checkpoint_of: number | null
}

/** Une exécution Temporal distincte de la trajectoire (A5). */
export interface ContinuationLink {
  readonly run_id: string
  readonly campaign_id: string
  readonly periods: readonly number[]
}

/** Rapport de l'Activity dupliquée, présent seulement si demandé (A4). */
export interface DuplicatedActivityReport {
  readonly operation: string
  readonly calls_observed: number
  readonly results_identical: boolean
}

export interface TrajectoryWorkflowInput {
  readonly mode: string
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  /** Point d'injection nommé (cahier:L141) : fixé par `acceptance/T24.spec.ts` à `'model-call'` (A4). */
  readonly testDuplicateActivity?: string | undefined
  /** Point d'injection nommé (cahier:L141) : seuil artificiellement bas (A5). */
  readonly testContinueAsNewAfter?: number | undefined
  // Porté en avant par continue-as-new — JAMAIS une base idéale (D-1, L63).
  readonly totalPeriods?: number | undefined
  readonly lastCompletedPeriodIndex?: number | null | undefined
  readonly priorPeriodStarts?: readonly PeriodStart[] | undefined
  readonly priorChain?: readonly ContinuationLink[] | undefined
  readonly duplicatedActivityDone?: DuplicatedActivityReport | null | undefined
}

export interface TrajectoryWorkflowResult {
  readonly campaign_id: string
  readonly phase: 'COMPLETED'
  readonly period_starts: readonly PeriodStart[]
  readonly continuation_chain: readonly ContinuationLink[]
  readonly continued_as_new_count: number
  readonly duplicated_activity: DuplicatedActivityReport | null
}

/* ══════════════════════════ les deux Activities (types locaux, L365) ═══════
 * Déclarés ICI plutôt qu'importés de `@bench/activities` : un `import type`
 * serait certes effacé par `verbatimModuleSyntax`, mais la frontière de ce
 * fichier (le seul que le bundler Temporal embarque, en-tête ci-dessus) reste
 * plus simple à auditer sans AUCUNE dépendance déclarée vers un paquet qui,
 * lui, importe `node:child_process`/`node:fs`. Les deux côtés (ce fichier et
 * `packages/activities/src/trajectory-activities.ts`) sont tenus en phase par
 * `acceptance/T24.spec.ts`, pas par un type partagé.
 */
interface ModelCallActivityInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly periodIndex: number
}
interface ModelCallActivityResult {
  readonly model_call_id: string
  readonly status: string
  readonly cost: string | null
  readonly usage: unknown
  readonly response: unknown
  readonly calls_observed: number
}
interface RunPeriodActivityInput {
  readonly mode: string
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
}
type RunPeriodActivityOutcome =
  | { readonly ok: true; readonly result: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: string }

interface TrajectoryActivities {
  getPeriodCount(input: { readonly mode: string }): Promise<number>
  'model-call'(input: ModelCallActivityInput): Promise<ModelCallActivityResult>
  'run-period'(input: RunPeriodActivityInput): Promise<RunPeriodActivityOutcome>
}

/**
 * Comparaison STABLE, indépendante de l'ordre des clés. `usage` traverse
 * PostgreSQL (colonne `jsonb`, @bench/gateway) entre les deux appels
 * `'model-call'` comparés par A4 : jsonb NE PRÉSERVE PAS l'ordre textuel des
 * clés (mesuré : `{a,b,c}` en entrée ressort réordonné) — un `JSON.stringify`
 * nu comparerait alors deux usages IDENTIQUES comme différents, et ferait
 * échouer `results_identical` pour une raison qui n'a rien à voir avec L68.
 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

/** Paramètres EXPLICITES de retry (cahier:L363) — jamais les défauts du SDK. */
const activities = proxyActivities<TrajectoryActivities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '30 seconds',
    maximumAttempts: 5,
  },
})

/* ══════════════════════════════════════════════════════════ le workflow ═══ */

export async function trajectoryWorkflow(input: TrajectoryWorkflowInput): Promise<TrajectoryWorkflowResult> {
  const totalPeriods = input.totalPeriods ?? (await activities.getPeriodCount({ mode: input.mode }))
  let lastCompleted: number | null = input.lastCompletedPeriodIndex ?? null
  const priorStarts = input.priorPeriodStarts ?? []
  const priorChain = input.priorChain ?? []
  let duplicatedActivity = input.duplicatedActivityDone ?? null
  const threshold = input.testContinueAsNewAfter ?? Number.POSITIVE_INFINITY

  const thisRunStarts: PeriodStart[] = []

  while (lastCompleted === null || lastCompleted < totalPeriods) {
    const afterCheckpointOf = lastCompleted
    const periodIndex = (lastCompleted ?? 0) + 1

    // ── 'model-call' : UN appel modèle par période, à travers T17 ──────────
    const first = await activities['model-call']({
      campaignId: input.campaignId,
      postgresDatabase: input.postgresDatabase,
      periodIndex,
    })

    // Point d'injection nommé (A4) : seulement sur la TOUTE PREMIÈRE période
    // de la trajectoire entière (jamais répété après une continuation — D-1,
    // L63 : la reprise ne refait pas ce qui a déjà eu lieu).
    if (afterCheckpointOf === null && input.testDuplicateActivity === 'model-call' && duplicatedActivity === null) {
      const second = await activities['model-call']({
        campaignId: input.campaignId,
        postgresDatabase: input.postgresDatabase,
        periodIndex,
      })
      duplicatedActivity = {
        operation: 'model-call',
        calls_observed: second.calls_observed,
        results_identical:
          first.cost === second.cost &&
          first.response === second.response &&
          stableStringify(first.usage) === stableStringify(second.usage),
      }
    }

    // ── 'run-period' : RESTORING..CHECKPOINTING (T23, PostgreSQL+S3 réels) ─
    const outcome = await activities['run-period']({
      mode: input.mode,
      campaignId: input.campaignId,
      postgresDatabase: input.postgresDatabase,
      s3Bucket: input.s3Bucket,
    })
    if (!outcome.ok) {
      // Aucun point d'injection de ce fichier n'interrompt une période : une
      // interruption ici serait un défaut d'assemblage, pas un résultat
      // métier attendu (contrairement à `bench run-period
      // --test-stop-after-phase`, T23).
      throw new Error(`trajectoryWorkflow : période interrompue de façon inattendue (${outcome.reason})`)
    }
    const completedIndex = Number(outcome.result['period_index'])
    thisRunStarts.push({ period_index: completedIndex, after_checkpoint_of: afterCheckpointOf })
    lastCompleted = completedIndex

    // ── seuil de continuation (A5, point d'injection nommé cahier:L141) ────
    if (lastCompleted < totalPeriods && thisRunStarts.length >= threshold) {
      const link: ContinuationLink = {
        run_id: workflowInfo().runId,
        campaign_id: input.campaignId,
        periods: thisRunStarts.map((p) => p.period_index),
      }
      return continueAsNew<typeof trajectoryWorkflow>({
        ...input,
        totalPeriods,
        lastCompletedPeriodIndex: lastCompleted,
        priorPeriodStarts: [...priorStarts, ...thisRunStarts],
        priorChain: [...priorChain, link],
        duplicatedActivityDone: duplicatedActivity,
      })
    }
  }

  const link: ContinuationLink = {
    run_id: workflowInfo().runId,
    campaign_id: input.campaignId,
    periods: thisRunStarts.map((p) => p.period_index),
  }
  return {
    campaign_id: input.campaignId,
    phase: 'COMPLETED',
    period_starts: [...priorStarts, ...thisRunStarts],
    continuation_chain: [...priorChain, link],
    continued_as_new_count: priorChain.length,
    duplicated_activity: duplicatedActivity,
  }
}
