// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — compilation des scénarios et contrôle de leur révélation
// (cahier L203-L210, tâche T06).
//
// PÉRIMÈTRE ASSUMÉ. Comme `@bench/domain`, ce paquet ne dépend que de
// `@bench/contracts` et compile sous `types: []` : ni `node:fs`, ni
// `node:child_process` ne peuvent y entrer sans faire échouer `tsc`. L'invariant
// D-2 (« une révélation de période k ne contient ni besoins, ni réponses
// métier, ni tests privés de k+1 », L63) se juge sur ce que la fonction de
// révélation REND ; un paquet qui ne sait pas ouvrir un fichier ni lancer un
// processus ne peut pas contourner sa propre porte par un canal latéral.
//
// LES QUATRE RÔLES, ET CE QUI LES SÉPARE. `compileScenarioPack` est la seule
// entrée qui lit une source ; `revealPeriod`, `answerCustomerQuestion` et
// `activeRequirements` ne lisent qu'un pack DÉJÀ compilé. Une porte ne peut donc
// pas être contournée en resoumettant la source : il n'existe aucun chemin qui
// rende du contenu sans passer par l'une des trois lectures gardées.
//
// T06 EST ÉCRITE : aucun de ses quatre rôles ne lève `NotImplemented`.
//
// UN CINQUIÈME RÔLE, ÉCRIT : `runDemo`, le pilote de période scripté de T11
// (L247). Le registre force ce rôle dans l'un des trois paquets que T11 déclare
// (`packages/domain`, `packages/scenario`, `packages/workload`) et `demo.ts` dit
// en tête pourquoi c'est celui-ci : A2 et A6 portent sur les EXIGENCES ACTIVES
// d'une période et sur leur remplacement, que ce paquet possède déjà.
//
// Le pilote ASSEMBLE (L249) : il appelle `@bench/domain` pour les métriques,
// `@bench/oracle` pour le modèle métier indépendant et `@bench/workload` pour
// l'horloge métier et les usages. Ces trois dépendances sont déclarées dans
// `package.json` ; aucune règle de ces paquets n'est réécrite ici.
//
// PLUS AUCUN EXPORT PUBLIC DE CE PAQUET NE LÈVE `NotImplemented`.
// ─────────────────────────────────────────────────────────────────────────────
export {
  CUSTOMER_ANSWER_SCHEMA,
  PERIOD_REVEAL_SCHEMA,
  SCENARIO_PACK_SCHEMA,
  activeRequirements,
  answerCustomerQuestion,
  compileScenarioPack,
  revealPeriod,
} from './pack.js'
export type {
  CompiledAnswer,
  CompiledEvent,
  CompiledRequirement,
  CustomerAnswer,
  PeriodReveal,
  PrivatePeriod,
  PublicPeriodEntry,
  ScenarioPack,
  ScenarioPackPrivate,
  ScenarioPackPublic,
} from './pack.js'

export { SCENARIO_REJECTION_KINDS, ScenarioRejection, isScenarioRejection } from './errors.js'
export type { ScenarioRejectionKind } from './errors.js'

export {
  REQUIREMENT_CRITICALITIES,
  SCENARIO_SOURCE_SCHEMA,
  readScenarioSource,
} from './source.js'
export type {
  RequirementCriticality,
  ScenarioSource,
  SourceAnswer,
  SourceEvent,
  SourcePeriod,
  SourceReference,
  SourceRequirement,
} from './source.js'

export { DEMO_MODE, DEMO_RESULT_SCHEMA, DEMO_STORAGE, runDemo } from './demo.js'
export type {
  BusinessFact,
  BusinessHistory,
  DemoOptions,
  DemoPeriodResult,
  DemoResult,
  PublishedRequirement,
} from './demo.js'

export {
  DEMO_SCENARIO_ID,
  DEMO_VARIANTS,
  RESERVATION_SETUP,
  SCRIPTED_PERIODS,
  SCRIPTED_SPEND,
} from './demo-script.js'
export type { DemoVariant, ScriptedAction, ScriptedPeriod } from './demo-script.js'

export { CONTROL_BY_REQUIREMENT, CONTROL_IDS } from './demo-controls.js'
export type { ControlId, ControlOutcome, ControlStatus, ForeignReadProbe } from './demo-controls.js'

// ── T30 : geler et préenregistrer les campagnes (cahier L415-L421). SQUELETTE
//    à cet étage — les cinq rôles lèvent `NotImplemented` (voir preregistration.ts).
export {
  freezeCampaign,
  issueLocalTestReceipt,
  preflightCampaign,
  verifyFreezeIntegrity,
  verifyRegistrationReceipt,
} from './preregistration.js'
export type {
  FrozenCampaign,
  PreregistrationBundle,
  PreregistrationVerdict,
  RegistrationReceipt,
  VerificationReport,
} from './preregistration.js'

// ── T29 : automatiser la fabrique de scénarios sans auto-certification libre
//    (cahier L405-L414). SQUELETTE à cet étage — les deux rôles lèvent
//    `NotImplemented` (voir generation.ts).
// ── T64 : controles larges et caches (ADR-018 L198-L204). SQUELETTE a cet
//    etage — le role leve `NotImplemented` (voir hidden-sequences.ts).
export { generateHiddenSequences } from './hidden-sequences.js'
export type { GenerateHiddenSequencesInput, GenerateHiddenSequencesResult, HiddenSequence } from './hidden-sequences.js'

// ── T67 : contrat bench.candidate/4, creneaux designes et points tranches
//    (ADR-019). Jamais exporte sous le nom `buildFLongPeriodStatement` (ni
//    aucun des alias de `ROLES_STATEMENT_BUILDER` deja essayes par
//    acceptance/T62.spec.ts) : voir l'en-tete de ./candidate-protocol-v4-long.ts.
export {
  CANDIDATE_PROTOCOL_MARKER_V4,
  CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG,
  describeFLongInterfaceContractV4,
} from './candidate-protocol-v4-long.js'
export type { CandidateLongPeriodStatementV4, CandidateRequirementsStatementV4Long } from './candidate-protocol-v4-long.js'

// ── T68 : sequences cachees qui discriminent chaque regle (ADR-019 L100-106),
//    sur le contrat bench.candidate/4, avec le modele attendu qui les juge et
//    la trajectoire principale de F-LONG en operations v4 (voir
//    discriminating-sequences.ts).
export {
  DISCRIMINATED_RULES,
  DISCRIMINATING_MIN_BATCH_SIZE,
  DISCRIMINATING_SEQUENCES_CONTRACT,
  ExpectedModelV4,
  F_LONG_V4_RESPONSE_FIELDS,
  F_LONG_V4_STATUSES,
  activeRulesV4,
  fLongMigratedHistoryFactV4,
  fLongScoringClockV4,
  fLongTrajectoryV4,
  generateDiscriminatingSequences,
  generateSequencesForRule,
} from './discriminating-sequences.js'
export type {
  DiscriminatingSequence,
  GenerateDiscriminatingSequencesInput,
  GenerateDiscriminatingSequencesResult,
  SequenceStep,
  StepExpectation,
} from './discriminating-sequences.js'

export { buildRevelationPackage, generateScenarioFromModel } from './generation.js'
export type {
  GenerationRevelationPackage,
  RevelationPackageInput,
  RevelationRuleCatalogEntry,
  ScenarioDslDocument,
  ScenarioDslRule,
  ScenarioDslRuleExpect,
  ScenarioDslSlot,
  ScenarioGenerationRefusal,
  ScenarioGenerationRequest,
  ScenarioGenerationResult,
  ScenarioGenerationSuccess,
  ScenarioModelResponse,
} from './generation.js'

// ── T73 : documents de période de F-PLATFORM dans le dépôt du candidat
//    (ADR-021 décision 4) — spec, contrat d'interface et ticket, dérivés de la
//    source de clauses (voir f-platform-docs.ts).
export {
  F_PLATFORM_PERIOD_COUNT,
  PLATFORM_API_PATH,
  PLATFORM_SPEC_PATH,
  platformTicketPath,
  renderPlatformPeriodDocs,
} from './f-platform-docs.js'
export type { PlatformPeriodDocsOptions } from './f-platform-docs.js'
