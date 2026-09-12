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
// À ce commit le paquet porte T03 : validation structurée d'un manifeste de
// campagne, et planificateur pur de ses cellules.
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
