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
// UN CINQUIÈME RÔLE, ET IL LÈVE ENCORE. `demo.ts` déclare `runDemo`, le pilote
// de période scripté de T11 (L247). Le registre force ce rôle dans l'un des
// trois paquets que T11 déclare, et `demo.ts` dit en tête pourquoi c'est
// celui-ci. À ce commit il n'est qu'un NOM : il lève `NotImplemented`, et c'est
// l'étage rouge de T11, pas une régression de T06.
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

export { runDemo } from './demo.js'
export type { DemoOptions } from './demo.js'
