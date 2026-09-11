// ─────────────────────────────────────────────────────────────────────────────
// Énumérations explicites du §E.
//
// Rien n'est inventé ici : chaque liste est la transcription littérale d'une
// phrase du cahier, dans son ordre d'énoncé. Ajouter un membre « qui manque »
// serait un affaiblissement invisible — §A exige une modification tracée du
// cahier, jamais un élargissement silencieux d'un enum.
// ─────────────────────────────────────────────────────────────────────────────

/** §E : « États de phase ». */
export const PHASE_STATES = [
  'PENDING',
  'RESTORING',
  'REVEALING',
  'DEVELOPING',
  'VALIDATING',
  'DEPLOYING',
  'EXERCISING',
  'AUDITING',
  'CHECKPOINTING',
  'COMPLETED',
] as const
export type PhaseState = (typeof PHASE_STATES)[number]

/**
 * §E : « Les états d'arrêt de calcul `BUDGET_EXHAUSTED`, `RUNNER_BLOCKED` et
 * `CANCELLED` n'effacent pas la période de l'analyse. » Ils sont donc un
 * ensemble DISTINCT des états de phase, pas des membres supplémentaires :
 * une période arrêtée reste une ligne de résultat.
 */
export const COMPUTATION_HALT_STATES = ['BUDGET_EXHAUSTED', 'RUNNER_BLOCKED', 'CANCELLED'] as const
export type ComputationHaltState = (typeof COMPUTATION_HALT_STATES)[number]

/** §E : « `attempt_outcome` vaut `SUCCESS`, `FAILED` ou `CANCELLED` ». */
export const ATTEMPT_OUTCOMES = ['SUCCESS', 'FAILED', 'CANCELLED'] as const
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number]

/** §E : « `deployment_coverage` vaut `NO_DEPLOYMENT`, `PARTIAL` ou `ACCEPTED` ». */
export const DEPLOYMENT_COVERAGES = ['NO_DEPLOYMENT', 'PARTIAL', 'ACCEPTED'] as const
export type DeploymentCoverage = (typeof DEPLOYMENT_COVERAGES)[number]

/**
 * §E : « États d'appel ». L'ordre compte : « l'écriture `DISPATCH_STARTED`
 * précède l'envoi réseau ; même un crash immédiatement après cette écriture est
 * traité comme potentiellement facturé ». `UNKNOWN` n'est donc pas un fourre-
 * tout mais l'état d'un appel dont la réponse est perdue — §D-7 interdit de le
 * relancer aveuglément.
 */
export const CALL_STATES = [
  'RESERVED',
  'DISPATCH_STARTED',
  'RESPONSE_STORED',
  'SETTLED',
  'UNKNOWN',
  'CANCELLED_BEFORE_DISPATCH',
] as const
export type CallState = (typeof CALL_STATES)[number]

/**
 * §A : « Les résultats portent toujours `execution_mode`, `cost_origin` et
 * `corpus_provenance`. Un rapport réel ne peut contenir des coûts fictifs sans
 * être rejeté. » Les trois champs existent donc au niveau des contrats ; la
 * règle de rejet elle-même appartient à l'évaluation.
 */
export const EXECUTION_MODES = ['SIMULATED', 'LIVE'] as const
export type ExecutionMode = (typeof EXECUTION_MODES)[number]

export const COST_ORIGINS = ['FICTIONAL_GRID', 'PROVIDER_INVOICE'] as const
export type CostOrigin = (typeof COST_ORIGINS)[number]

export const CORPUS_PROVENANCES = ['PUBLIC_FIXTURE', 'PRIVATE_FIXTURE', 'ATTACK_FIXTURE'] as const
export type CorpusProvenance = (typeof CORPUS_PROVENANCES)[number]

/** Appartenance à un enum, avec rétrécissement de type. */
export function isMember<T extends string>(members: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (members as readonly string[]).includes(value)
}
