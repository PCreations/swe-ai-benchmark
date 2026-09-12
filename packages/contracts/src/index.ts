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
  parseAdjustmentMicroUsd,
  parseAmountMicroUsd,
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

// ── T02 (squelette) : sérialisation canonique, empreintes, dérivation de
//    graines et horloge injectable — les livrables que le cahier L171 place
//    dans `contracts`. Chaque export LÈVE tant que T02 n'est pas vert ; aucun
//    ne rend de constante, parce que les cas A1, A2, A5 et A6 sont des énoncés
//    d'égalité, d'invariance ou de déterminisme qu'une constante satisferait
//    sans rien calculer (verification/mutants/T02.json).
export { canonicalBytes, canonicalDigest, sha256Hex } from './digest.js'
export { createRng, deriveSeed, rngForStream } from './seeds.js'
export type { Rng } from './seeds.js'
export { fixedClock } from './clock.js'
export type { Clock } from './clock.js'
export { NotImplemented, isNotImplemented } from './not-implemented.js'

export { CAMPAIGN_MANIFEST_REQUIRED_FIELDS, SEED_STREAMS } from './manifest.js'
export type { BudgetSpec, CampaignManifest, CorpusRef, SeedSet, SeedStream } from './manifest.js'
