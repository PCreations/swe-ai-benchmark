// ─────────────────────────────────────────────────────────────────────────────
// Manifeste de campagne (§E) — types ET schéma machine.
//
// « `CampaignManifest` | version, mode, corpus et empreintes, configurations,
//   budgets, graines, périodes, politiques, métriques, statut de gel » (L86)
//
// POURQUOI UN SCHÉMA EN DONNÉES ET PAS SEULEMENT DES INTERFACES.
// Les interfaces TypeScript disparaissent à l'exécution : elles ne peuvent pas
// rejeter une propriété inconnue reçue d'un fichier JSON, alors que L80 l'exige
// (« les JSON de domaine sont stricts : propriétés inconnues rejetées »). Le
// descripteur `CAMPAIGN_MANIFEST_SCHEMA` porte la MÊME forme sous une valeur
// parcourable, et `packages/domain` l'applique. Les deux se contredisant serait
// une faute silencieuse ; c'est pourquoi les interfaces ci-dessous sont écrites
// à côté du descripteur, dans ce fichier et pas ailleurs.
//
// TOUTE PROPRIÉTÉ DÉCLARÉE EST OBLIGATOIRE. Le §E dit « champs minimaux
// obligatoires », et §D-8 exige que graines, budgets, conditions, versions et
// règles de validation soient figés AVANT une campagne de mesure. Un manifeste
// auquel il manquerait `frozen` ou `budgets` ne porterait pas cette garantie :
// `required` n'est donc pas un sous-ensemble de `properties`, c'est le même
// ensemble. Un champ facultatif devra être introduit explicitement, par une
// tâche qui dira pourquoi.
//
// AUCUN HORODATAGE TECHNIQUE. §G : « l'heure et la durée sont des métadonnées
// volatiles, exclues de la comparaison canonique ». Le manifeste n'en porte
// aucun — omission délibérée, pas oubli : L82 interdit d'en ajouter à un objet
// métier déterministe, et le manifeste est l'objet dont on prend l'empreinte.
// ─────────────────────────────────────────────────────────────────────────────
import type { CanonicalValue } from './canonical.js'
import { CORPUS_PROVENANCES, EXECUTION_MODES } from './enums.js'
import type { CorpusProvenance, ExecutionMode } from './enums.js'
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

/* ─────────────────────────────────────────── les contrats, comme types */

/** Une entrée de corpus : son identité et l'empreinte de son contenu (L82). */
export interface CorpusEntry {
  readonly entry_id: string
  /** SHA-256 hex sur octets canoniques (§E). 64 caractères minuscules. */
  readonly sha256: string
}

/**
 * Le corpus de la campagne et SON empreinte (L86 : « corpus et empreintes »).
 *
 * `digest` est l'empreinte du corpus PRIVÉ DE `digest` : un champ ne peut pas
 * entrer dans le calcul de sa propre valeur. C'est la règle que T03.A6 vérifie
 * avant toute exécution.
 */
export interface CorpusRef {
  readonly corpus_id: string
  readonly corpus_provenance: CorpusProvenance
  readonly entries: readonly CorpusEntry[]
  readonly digest: string
}

/** Un scénario porte SA provenance : elle suit la source, pas le manifeste. */
export interface ScenarioSpec {
  readonly scenario_id: string
  readonly corpus_provenance: CorpusProvenance
}

/**
 * §D-11 : « les répétitions et variantes ne sont pas de nouveaux projets
 * indépendants ». Le projet parent est donc le porteur statistique, et ses
 * scénarios n'en sont pas des frères.
 */
export interface ProjectSpec {
  readonly parent_project_id: string
  readonly scenarios: readonly ScenarioSpec[]
}

export interface ConfigurationSpec {
  readonly configuration_id: string
  readonly agent: string
}

export interface BudgetSpec {
  readonly budget_id: string
  readonly limit_micro_usd: MicroUsd
}

export interface PolicySet {
  /** §D-7 : un appel dont la réponse est perdue n'est pas relancé aveuglément. */
  readonly lost_result: string
  readonly retry: string
}

export interface CampaignManifest {
  readonly version: string
  readonly campaign_id: string
  readonly execution_mode: ExecutionMode
  /** §D-8 : statut de gel. `false` interdit une campagne de mesure. */
  readonly frozen: boolean
  readonly corpus: CorpusRef
  readonly projects: readonly ProjectSpec[]
  readonly configurations: readonly ConfigurationSpec[]
  readonly budgets: readonly BudgetSpec[]
  /** §D-11 : une répétition n'est pas un projet. Entier ≥ 1. */
  readonly repetitions: number
  /** Nombre de périodes K de la campagne ; commence à 1 (§E). */
  readonly periods: number
  readonly seeds: SeedSet
  readonly policies: PolicySet
  readonly metrics: readonly string[]
}

/* ──────────────────────────────────── le même contrat, comme donnée */

/**
 * Un nœud du schéma. Les types portent leur RÈGLE, pas seulement leur forme :
 * `amount_micro_usd` et `sha256_hex` sont des types du §E (L80, L82), pas des
 * chaînes libres. Les écrire ici évite qu'un validateur réinvente la règle.
 */
export type ManifestSchemaNode =
  | { readonly type: 'string' }
  | { readonly type: 'enum'; readonly members: readonly string[] }
  | { readonly type: 'boolean' }
  | { readonly type: 'integer'; readonly minimum: number }
  /** L80 : chaîne d'entier non négatif en micro-USD. */
  | { readonly type: 'amount_micro_usd' }
  /** L82 : 64 hexadécimaux minuscules. */
  | { readonly type: 'sha256_hex' }
  | { readonly type: 'array'; readonly minItems: number; readonly items: ManifestSchemaNode }
  | {
      readonly type: 'object'
      readonly properties: { readonly [k: string]: ManifestSchemaNode }
      /**
       * Le nom de la propriété par laquelle cet objet porte une identité, quand
       * il en porte une. Deux objets de même espèce ne peuvent pas partager la
       * même valeur : c'est « un id en doublon est rejeté » (T03.A3), et le
       * cahier dit « un id », pas « un id de configuration » — d'où un marqueur
       * sur chaque espèce porteuse plutôt qu'une liste tenue à part.
       */
      readonly identity?: string
    }

const SEED_PROPERTIES: { readonly [k: string]: ManifestSchemaNode } = Object.fromEntries(
  SEED_STREAMS.map((s) => [s, { type: 'string' } as ManifestSchemaNode]),
)

/**
 * Le schéma du `CampaignManifest`, sous la forme que `packages/domain` parcourt
 * pour valider un document JSON reçu. Il énumère exactement les champs de L86,
 * plus les trois que L78 rend indispensables à une identité de trajectoire —
 * `campaign_id`, les projets (`parent_project_id`, `scenario_id`) et les
 * `repetitions` — sans lesquels un manifeste ne pourrait pas décrire la cellule
 * que le §E définit.
 */
export const CAMPAIGN_MANIFEST_SCHEMA: ManifestSchemaNode = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    campaign_id: { type: 'string' },
    execution_mode: { type: 'enum', members: EXECUTION_MODES },
    frozen: { type: 'boolean' },
    corpus: {
      type: 'object',
      properties: {
        corpus_id: { type: 'string' },
        corpus_provenance: { type: 'enum', members: CORPUS_PROVENANCES },
        entries: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            identity: 'entry_id',
            properties: {
              entry_id: { type: 'string' },
              sha256: { type: 'sha256_hex' },
            },
          },
        },
        digest: { type: 'sha256_hex' },
      },
    },
    projects: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        identity: 'parent_project_id',
        properties: {
          parent_project_id: { type: 'string' },
          scenarios: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              identity: 'scenario_id',
              properties: {
                scenario_id: { type: 'string' },
                corpus_provenance: { type: 'enum', members: CORPUS_PROVENANCES },
              },
            },
          },
        },
      },
    },
    configurations: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        identity: 'configuration_id',
        properties: {
          configuration_id: { type: 'string' },
          agent: { type: 'string' },
        },
      },
    },
    budgets: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        identity: 'budget_id',
        properties: {
          budget_id: { type: 'string' },
          limit_micro_usd: { type: 'amount_micro_usd' },
        },
      },
    },
    repetitions: { type: 'integer', minimum: 1 },
    periods: { type: 'integer', minimum: 1 },
    seeds: { type: 'object', properties: SEED_PROPERTIES },
    policies: {
      type: 'object',
      properties: {
        lost_result: { type: 'string' },
        retry: { type: 'string' },
      },
    },
    metrics: { type: 'array', minItems: 1, items: { type: 'string' } },
  },
}

/**
 * Les champs de L86, dans l'ordre où le cahier les énumère. Dérivé du schéma
 * plutôt que recopié : une liste tenue à la main finirait par diverger du
 * descripteur que le validateur applique réellement.
 */
export const CAMPAIGN_MANIFEST_REQUIRED_FIELDS: readonly string[] = Object.keys(
  (CAMPAIGN_MANIFEST_SCHEMA as { readonly properties: { readonly [k: string]: unknown } }).properties,
)

/**
 * Le champ d'un corpus qui porte son EMPREINTE, et qui est donc exclu du calcul
 * de cette empreinte. Nommé ici, et non dans le validateur, pour que la règle
 * « l'empreinte ne se contient pas elle-même » vive avec le schéma.
 */
export const CORPUS_DIGEST_FIELD = 'digest'

/** Un manifeste, tel qu'il est reçu : du JSON, pas encore un contrat. */
export type ManifestDocument = CanonicalValue
