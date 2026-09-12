// ─────────────────────────────────────────────────────────────────────────────
// @bench/workload — génération et exécution des intentions d'usage
// (cahier L219-L226, tâche T08).
//
// CINQ RÔLES PUBLICS, ET RIEN D'AUTRE QUI DÉCIDE :
//
//   createBusinessClock({ start })        -> horloge métier ISOLÉE      (L221)
//   readBusinessClock(horloge)            -> instant métier UTC ISO     (L80)
//   advanceBusinessClock(horloge, delta)  -> horloge avancée            (L221)
//   generateIntentPlan(entrée)            -> plan d'usage seedé         (L221)
//   executeIntentPlan(plan, monde)        -> résultat d'exécution       (L221)
//
// LES QUATRE LIVRABLES DE L221, ET OÙ ILS VIVENT :
//
//   « modèle d'intention »                 `plan.ts`, interface `Intent` — le
//                                          contrat §E (L88) : id stable, acteur
//                                          externe, locataire, instant métier,
//                                          opération, cible attendue.
//   « plan d'usage seedé »                 `plan.ts`, `generateIntentPlan` —
//                                          ordre et identifiants dérivés de
//                                          (flux, scénario, graine, usage), donc
//                                          invariants au nombre de workers.
//   « résolution d'identifiants externes » `execute.ts` — un handle n'est résolu
//                                          que par l'identifiant que le MONDE a
//                                          réellement rendu ; sinon l'intention
//                                          est `UNSERVED` et conservée (L67).
//   « horloge métier isolée »              `clock.ts` — aucune source de temps
//                                          partagée, aucune lecture de
//                                          l'horloge système.
//
// CE QUE CE PAQUET S'INTERDIT, ET COMMENT C'EST RENDU MÉCANIQUE.
// `packages/workload/tsconfig.json` fixe `types: []` : ni `node:fs`, ni
// `node:http`, ni `node:timers`, ni `process` ne sont nommables ici sans faire
// échouer `tsc`. `Date.now()` n'apparaît nulle part ; `new Date(...)` n'est
// appelé qu'avec un argument explicite, dans `shapes.formatUtcIso`. La seule
// dépendance déclarée reste `@bench/contracts`.
//
// CE QUI N'EST PAS ICI, ET CHEZ QUI C'EST. L'enregistrement séparé du temps en
// file et du temps actif est T26.A6 (L383) ; la politique de criticité — quelle
// violation met quoi hors service — est T22.A5 (L349). T08 en fournit la
// matière (les compteurs de conformité, l'horloge métier isolée) et s'arrête
// là : §H n'attache rien d'autre à ses six cas.
// ─────────────────────────────────────────────────────────────────────────────

export {
  WORKLOAD_REJECTION_KINDS,
  WorkloadRejection,
  isWorkloadRejection,
} from './errors.js'
export type { WorkloadRejectionKind } from './errors.js'

export {
  advanceBusinessClock,
  createBusinessClock,
  elapsedBusinessMs,
  readBusinessClock,
} from './clock.js'
export type { BusinessClock, BusinessClockDelta, BusinessClockSetup } from './clock.js'

export { DEFAULT_USAGE_KIND, isComplianceKind, normalizeCatalog } from './catalog.js'
export type { CandidateState, NormalizedUsage, UsageTemplate } from './catalog.js'

export { PLAN_INPUT_KEYS, WORKLOAD_SEED_STREAM, generateIntentPlan } from './plan.js'
export type { Intent, IntentPlan, IntentPlanInput } from './plan.js'

export { INTENT_STATUSES, executeIntentPlan } from './execute.js'
export type {
  IntentExecutionCounters,
  IntentExecutionOptions,
  IntentExecutionResult,
  IntentInvocation,
  IntentOutcome,
  IntentStatus,
  World,
  WorldReply,
} from './execute.js'
