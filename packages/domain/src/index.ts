// ─────────────────────────────────────────────────────────────────────────────
// @bench/domain — transitions de période, versionnement des exigences et
// métriques pures (cahier §C, L38).
//
// PÉRIMÈTRE ASSUMÉ. Ce paquet ne dépend que de `@bench/contracts`. ADR-005 §3
// veut le cœur métier indépendant de Temporal, de Docker et de tout SDK
// fournisseur ; `types: []` dans son tsconfig rend la propriété mécanique —
// aucun `@types/*` implicite, donc aucun `node:*` ne peut s'y glisser sans
// faire échouer la compilation. C'est aussi ce qui rend observable la fin de
// T03 : « aucune création de worker pendant une compilation de manifeste »
// (L183) n'est pas une promesse, c'est une impossibilité de typage.
//
// À ce commit le paquet porte T03 — validation structurée d'un manifeste de
// campagne, et planificateur pur de ses cellules — et T04 : les métriques de
// période et leurs dénominateurs, `computePeriodMetrics`, fonction pure d'une
// série de périodes vers Q, R, G, G_new par période et V, U, exposition et
// réussite agrégée par intention pour la campagne (L185–L194).
//
// Il DÉCLARE en outre les quatre rôles de T05 — la machine à états d'une
// période (L195–L202). Ils sont un SQUELETTE : chacun lève `NotImplemented`.
// Les déclarer maintenant déplace le rouge de `acceptance/T05.spec.ts` de
// l'absence d'un NOM (« CONTRAT-NON-SATISFAIT ») vers l'appel réel, seule
// forme de rouge que `verification/runner/red.mjs` accepte comme preuve.
// ─────────────────────────────────────────────────────────────────────────────
export { compileCampaignManifest } from './campaign.js'
export type { CampaignCell, CampaignPlan, CompileOptions } from './campaign.js'

export {
  MANIFEST_REJECTION_KINDS,
  ManifestRejection,
  isManifestRejection,
  validateCampaignManifest,
} from './manifest-validation.js'
export type { ManifestRejectionKind } from './manifest-validation.js'

export { computePeriodMetrics } from './metrics.js'
export type {
  CampaignAggregates,
  MetricOptions,
  MetricPeriod,
  MetricRequirement,
  MetricSeriesInput,
  PeriodMetrics,
  RetiredRequirement,
  SeriesMetrics,
} from './metrics.js'

export {
  applyPeriodEvent,
  closePeriod,
  initialPeriodState,
  reducePeriodLog,
} from './period.js'
export type {
  AttemptOutcome,
  DeploymentCoverage,
  PeriodCommand,
  PeriodEvent,
  PeriodHaltState,
  PeriodPhase,
  PeriodResult,
  PeriodState,
  PeriodTransition,
} from './period.js'
