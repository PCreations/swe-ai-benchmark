// ─────────────────────────────────────────────────────────────────────────────
// Manifeste de campagne (§E).
//
// « `CampaignManifest` | version, mode, corpus et empreintes, configurations,
//   budgets, graines, périodes, politiques, métriques, statut de gel »
//
// Les dix champs sont TOUS obligatoires : le §E les nomme « champs minimaux
// obligatoires », et §D-8 exige que graines, budgets, conditions, versions et
// règles de validation soient figés AVANT une campagne de mesure. Un manifeste
// auquel il manquerait `frozen` ne pourrait pas porter cette garantie.
//
// Les sous-structures restent volontairement ouvertes (`CanonicalValue`) là où
// le cahier ne fixe pas encore leur forme : les tâches T02 (scénarios), T12
// (budgets) et T31 (métriques) les précisent. Déclarer ici une forme inventée
// donnerait une fausse impression de spécification.
// ─────────────────────────────────────────────────────────────────────────────
import type { CanonicalValue } from './canonical.js'
import type { ExecutionMode, CorpusProvenance } from './enums.js'
import type { MicroUsd } from './units.js'

/**
 * §E : « Les graines sont dérivées par identifiants et flux (`scenario`,
 * `workload`, `assignment`, `bootstrap`) pour que l'ajout d'un tirage dans un
 * composant ne change pas tous les autres. » Les quatre flux sont donc nommés,
 * pas libres : une graine unique de campagne recréerait le couplage que cette
 * phrase existe pour casser.
 */
export const SEED_STREAMS = ['scenario', 'workload', 'assignment', 'bootstrap'] as const
export type SeedStream = (typeof SEED_STREAMS)[number]

export type SeedSet = { readonly [S in SeedStream]: string }

export interface CorpusRef {
  readonly corpus_id: string
  readonly provenance: CorpusProvenance
  /** SHA-256 hex sur octets canoniques (§E). 64 caractères. */
  readonly sha256: string
}

export interface BudgetSpec {
  readonly budget_id: string
  readonly limit_micro_usd: MicroUsd
}

/**
 * §G : « L'heure et la durée sont des métadonnées volatiles, exclues de la
 * comparaison canonique des résultats métier. » Le manifeste ne porte donc
 * aucun horodatage technique — c'est une omission délibérée, pas un oubli.
 */
export interface CampaignManifest {
  readonly schema: 'bench.campaign_manifest/1'
  readonly version: string
  readonly mode: ExecutionMode
  readonly corpora: readonly CorpusRef[]
  readonly configurations: readonly CanonicalValue[]
  readonly budgets: readonly BudgetSpec[]
  readonly seeds: SeedSet
  /** Nombre de périodes K de la campagne ; commence à 1 (§E). */
  readonly periods: number
  readonly policies: CanonicalValue
  readonly metrics: CanonicalValue
  /** §D-8 : statut de gel. `false` interdit une campagne de mesure. */
  readonly frozen: boolean
}

export const CAMPAIGN_MANIFEST_REQUIRED_FIELDS = [
  'schema',
  'version',
  'mode',
  'corpora',
  'configurations',
  'budgets',
  'seeds',
  'periods',
  'policies',
  'metrics',
  'frozen',
] as const
