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

// ── T02 : sérialisation canonique, empreintes, dérivation de graines et
//    horloge injectable — les livrables que le cahier L171 place dans
//    `contracts`. Les trois rôles de l'empreinte restent SÉPARÉS (octets,
//    hachage, composition) : c'est ce qui rend vérifiable l'égalité du §E
//    « l'empreinte d'une valeur est le SHA-256 de ses octets canoniques ».
//    SHA-256 (FIPS 180-4), l'encodage UTF-8 et le générateur pseudo-aléatoire
//    sont écrits dans le paquet, sans aucun import : ADR-005 §3 veut ce paquet
//    indépendant, et `tsconfig.json` le rend mécanique par `types: []`.
export { canonicalBytes, canonicalDigest, sha256Hex } from './digest.js'
export { PRNG_ALGORITHM_VERSION, PRNG_TEST_VECTOR, createRng, deriveSeed, rngForStream } from './seeds.js'
export type { PrngTestVector, Rng } from './seeds.js'
export { fixedClock } from './clock.js'
export type { Clock } from './clock.js'

// `NotImplemented` reste exporté pour les squelettes des tâches ultérieures ;
// plus aucun export public de ce paquet ne le lève.
export { NotImplemented, isNotImplemented } from './not-implemented.js'

// ── T03 : le manifeste de campagne du §E, sous ses DEUX formes. Les interfaces
//    servent au code qui le construit ; `CAMPAIGN_MANIFEST_SCHEMA` sert au code
//    qui le reçoit en JSON et doit rejeter une propriété inconnue (L80) — une
//    interface TypeScript ne survit pas à l'exécution et ne peut rien rejeter.
export {
  CAMPAIGN_MANIFEST_REQUIRED_FIELDS,
  CAMPAIGN_MANIFEST_SCHEMA,
  CORPUS_DIGEST_FIELD,
  SEED_STREAMS,
} from './manifest.js'
export type {
  BudgetSpec,
  CampaignManifest,
  ConfigurationSpec,
  CorpusEntry,
  CorpusRef,
  ManifestDocument,
  ManifestSchemaNode,
  PolicySet,
  ProjectSpec,
  ScenarioSpec,
  SeedSet,
  SeedStream,
} from './manifest.js'
