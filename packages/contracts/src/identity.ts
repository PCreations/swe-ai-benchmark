// ─────────────────────────────────────────────────────────────────────────────
// Identités (§E).
//
// « Identité complète d'une trajectoire :
//   campaign_id / parent_project_id / scenario_id / configuration_id /
//   repetition_id / budget_id.
//   Une période ajoute `period_index` commençant à 1.
//   Une opération ajoute `phase`, `operation_kind`, `operation_sequence` et
//   `logical_attempt`. »
//
// La forme emboîtée n'est pas cosmétique : elle rend impossible d'écrire une
// identité d'opération sans son identité de période, donc de confondre « appel
// 2 de la période 1 » avec « répétition 2 » — la confusion que §E nomme
// explicitement.
// ─────────────────────────────────────────────────────────────────────────────
import type { PhaseState } from './enums.js'

export interface TrajectoryIdentity {
  readonly campaign_id: string
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
  readonly repetition_id: string
  readonly budget_id: string
}

export interface PeriodIdentity extends TrajectoryIdentity {
  /** Commence à 1, jamais à 0 (§E). */
  readonly period_index: number
}

export interface OperationIdentity extends PeriodIdentity {
  readonly phase: PhaseState
  readonly operation_kind: string
  readonly operation_sequence: number
  /**
   * §E : « Les retries techniques conservent cette identité ; une nouvelle
   * demande après résultat perdu reçoit une nouvelle tentative logique. »
   * Un retry technique NE l'incrémente PAS.
   */
  readonly logical_attempt: number
}

export const TRAJECTORY_ID_FIELDS = [
  'campaign_id',
  'parent_project_id',
  'scenario_id',
  'configuration_id',
  'repetition_id',
  'budget_id',
] as const

/**
 * Clé d'identité stable et lisible, dans l'ordre du §E. Sert de clé
 * d'opération pour la déduplication du §D-6, où l'ordre des composantes doit
 * être figé pour que deux processus produisent la même clé.
 */
export function trajectoryKey(id: TrajectoryIdentity): string {
  return TRAJECTORY_ID_FIELDS.map((f) => id[f]).join('/')
}

export function periodKey(id: PeriodIdentity): string {
  return `${trajectoryKey(id)}#${id.period_index}`
}

export function operationKey(id: OperationIdentity): string {
  return `${periodKey(id)}:${id.phase}:${id.operation_kind}:${id.operation_sequence}:${id.logical_attempt}`
}
