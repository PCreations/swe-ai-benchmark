// ─────────────────────────────────────────────────────────────────────────────
// @bench/evaluation — T65, ADR-018 L206-L212 : les mesures longitudinales sur
// le chemin reel (acceptance/T65.spec.ts). Trois roles, fixes par la section
// II.1 de cette suite (aucune source n'impose de signature, ADR-001) :
//
//   persistPeriodMeasures({ benchDataDir, entries }) -> Promise<any>
//       Persiste, pour chaque entree `{periodKey, period, code}`, les quatre
//       grandeurs Q/R/G/G_new rendues par `computePeriodMetrics` (@bench/
//       domain, T04) sur `period`, ainsi que les mesures de code `code` — qui
//       ne doivent JAMAIS influencer Q/R/G/G_new (ADR-018 L64-67).
//   readPeriodMeasures({ benchDataDir, periodKey }) -> Promise<{Q, R, G,
//       G_new, regressions?, code}>
//       Relit les grandeurs persistees d'une periode.
//   ruleTimeline({ benchDataDir, ruleId }) -> Promise<{firstSatisfiedPeriod,
//       regressionPeriods, recoveryPeriods}>
//       Rend la chronologie d'une regle (`id@version`, cahier:L109/L129) :
//       premiere periode de satisfaction, periodes de regression et de
//       retablissement.
//
// SQUELETTE (etage RED) : les trois roles ci-dessous levent `NotImplemented`.
// Aucun des quatre cas requis (T65.A1-A4) ne peut donc verdir ici ; ils
// doivent rougir de `STUB_NOT_IMPLEMENTED`, jamais de `MODULE_NOT_FOUND`
// (les exports existent et ont la bonne forme).
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'
import type { MetricPeriod } from '@bench/domain'

/** Mesures du code d'une periode — ADR-018 L64-67, mot pour mot. */
export interface CodeMetrics {
  readonly linesAdded: number
  readonly linesRemoved: number
  readonly filesTouched: number
  readonly testFilesWritten: number
}

/** Une entree a persister — fixee par acceptance/T65.spec.ts, II.1. */
export interface LongitudinalMeasureEntry {
  readonly periodKey: string
  readonly period: MetricPeriod
  readonly code: CodeMetrics
}

export interface PersistPeriodMeasuresInput {
  readonly benchDataDir: string
  readonly entries: readonly LongitudinalMeasureEntry[]
}

export interface ReadPeriodMeasuresInput {
  readonly benchDataDir: string
  readonly periodKey: string
}

/** Grandeurs persistees d'une periode — fixees par acceptance/T65.spec.ts, II.1. */
export interface PeriodMeasures {
  readonly Q: number | null
  readonly R: number | null
  readonly G: number
  readonly G_new: number
  readonly regressions?: readonly string[]
  readonly code: CodeMetrics
}

export interface RuleTimelineInput {
  readonly benchDataDir: string
  readonly ruleId: string
}

/** Chronologie d'une regle — fixee par acceptance/T65.spec.ts, II.1. */
export interface RuleTimeline {
  readonly firstSatisfiedPeriod: string | null
  readonly regressionPeriods: readonly string[]
  readonly recoveryPeriods: readonly string[]
}

/**
 * Persiste, pour chaque periode de `entries`, les grandeurs Q/R/G/G_new
 * rendues par `computePeriodMetrics` (@bench/domain, T04) sur `period`, et
 * les mesures de code `code` — jamais melangees au calcul du score.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function persistPeriodMeasures(_input: PersistPeriodMeasuresInput): Promise<void> {
  throw new NotImplemented('evaluation.persistPeriodMeasures')
}

/** Relit les grandeurs persistees d'une periode. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function readPeriodMeasures(_input: ReadPeriodMeasuresInput): Promise<PeriodMeasures> {
  throw new NotImplemented('evaluation.readPeriodMeasures')
}

/** Rend la chronologie (satisfaction/regression/retablissement) d'une regle. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function ruleTimeline(_input: RuleTimelineInput): Promise<RuleTimeline> {
  throw new NotImplemented('evaluation.ruleTimeline')
}
