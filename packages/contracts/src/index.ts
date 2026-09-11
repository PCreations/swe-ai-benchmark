// ─────────────────────────────────────────────────────────────────────────────
// @bench/contracts — schémas de messages, identités, manifeste, unités et
// erreurs (cahier §C).
//
// PÉRIMÈTRE ASSUMÉ. Ce paquet est le plus bas de la pile : il ne dépend de
// RIEN, pas même de la bibliothèque standard de Node. ADR-005 §3 l'exige
// (« ni Temporal, ni Docker, ni SDK fournisseur, ni appel externe ») et
// `types: []` dans son tsconfig le rend mécanique plutôt que déclaratif.
//
// Ce qu'il ne contient PAS, et pourquoi : aucune règle de facturation (T12/
// T16), aucune transition de période (T03), aucune métrique (T31). Le §C leur
// donne d'autres paquets. Un contrat gonflé de logique métier ferait de chaque
// tâche ultérieure une modification de ce fichier, donc une re-péremption des
// 44 attestations.
// ─────────────────────────────────────────────────────────────────────────────
export { CONTRACT_ERROR_KINDS, ContractViolation, isContractViolation } from './errors.js'
export type { ContractErrorKind } from './errors.js'

export {
  MICRO_USD_PER_USD,
  ZERO_MICRO_USD,
  addMicroUsd,
  applyAdjustment,
  compareMicroUsd,
  fromBigInt,
  fromBigIntSigned,
  isMicroUsd,
  isSignedMicroUsd,
  microUsd,
  mulMicroUsd,
  signedMicroUsd,
  toBigInt,
} from './units.js'
export type { MicroUsd, SignedMicroUsd } from './units.js'

export {
  ATTEMPT_OUTCOMES,
  CALL_STATES,
  COMPUTATION_HALT_STATES,
  CORPUS_PROVENANCES,
  COST_ORIGINS,
  DEPLOYMENT_COVERAGES,
  EXECUTION_MODES,
  PHASE_STATES,
  isMember,
} from './enums.js'
export type {
  AttemptOutcome,
  CallState,
  ComputationHaltState,
  CorpusProvenance,
  CostOrigin,
  DeploymentCoverage,
  ExecutionMode,
  PhaseState,
} from './enums.js'

export { TRAJECTORY_ID_FIELDS, operationKey, periodKey, trajectoryKey } from './identity.js'
export type { OperationIdentity, PeriodIdentity, TrajectoryIdentity } from './identity.js'

export { canonicalJson } from './canonical.js'
export type { CanonicalValue } from './canonical.js'

export { CAMPAIGN_MANIFEST_REQUIRED_FIELDS, SEED_STREAMS } from './manifest.js'
export type { BudgetSpec, CampaignManifest, CorpusRef, SeedSet, SeedStream } from './manifest.js'
