// ─────────────────────────────────────────────────────────────────────────────
// Le CATALOGUE d'usages, et l'état du candidat.
//
// POURQUOI LE CATALOGUE EST UNE ENTRÉE, ET NON UNE TABLE ÉCRITE ICI. §F fixe le
// NOMBRE d'intentions offertes par période (F-QUALITY : « intentions offertes
// [4,4,0,2] ») et inscrit explicitement « la nature des intentions derrière les
// cardinaux » dans `non_fixe_par_le_cahier`. Écrire ici les quatre usages de
// F-QUALITY reviendrait à inventer une spécification que le cahier refuse de
// donner — et à rendre le générateur incapable de servir un autre scénario.
// Le catalogue arrive donc du scénario compilé (T06) ; ce module n'en contrôle
// que la FORME.
//
// CE QUE `candidate_state` FAIT ICI, ET CE QU'IL NE FAIT PAS. Il est contrôlé,
// et il n'est PAS un filtre. T08.A2 : « les quatre usages de F-QUALITY sont
// toujours proposés si le candidat n'a créé aucune donnée » (L223). Un
// générateur qui ne proposerait que les usages dont le candidat a déjà créé la
// donnée mesurerait la complaisance du plan envers l'implémentation candidate
// au lieu de mesurer l'implémentation candidate : un candidat qui ne crée rien
// obtiendrait un score parfait sur un plan vide. La conservation du nombre
// d'intentions offertes (L225) est précisément ce qui l'interdit.
//
// Une référence manquante n'est donc jamais traitée à la GÉNÉRATION. Elle se
// traite à l'EXÉCUTION, et par un statut `UNSERVED` — invariant D-5 (L67) :
// « un échec conserve ses dépenses, ses intentions non servies et son backlog ».
// ─────────────────────────────────────────────────────────────────────────────
import { WorkloadRejection, childPath } from './errors.js'
import {
  requireNonEmptyString,
  requireObject,
  requireOnlyKeys,
  requireStringArray,
} from './shapes.js'

/**
 * Un usage du catalogue que le scénario offre.
 *
 *   `requires`  les handles externes dont l'usage a besoin pour être servi ;
 *   `produces`  le handle qu'il crée, ou `null` ;
 *   `kind`      la nature de l'usage. Un usage dont le `kind` désigne un essai
 *               négatif de sécurité alimente conformité/criticité et non le
 *               comptage des parcours métier (L223, T08.A4) ;
 *   `tenant`    le locataire, quand l'usage n'est pas celui de la campagne —
 *               c'est le cas d'un essai intertenant (L123) ;
 *   `actor`     l'acteur externe, quand le scénario le fixe.
 */
export interface UsageTemplate {
  readonly id: string
  readonly operation: string
  readonly requires: readonly string[]
  readonly produces: string | null
  readonly kind?: string
  readonly tenant?: string
  readonly actor?: string
}

/** Les handles que le candidat a DÉJÀ créés (L223). */
export interface CandidateState {
  readonly created: readonly string[]
}

/**
 * Un usage dont la forme a été contrôlée et les absences normalisées. Les
 * optionnels deviennent `null` plutôt que `undefined` : sous
 * `exactOptionalPropertyTypes`, un champ absent et un champ à `undefined` ne
 * sont pas la même chose, et le générateur n'a aucune raison de distinguer les
 * deux.
 */
export interface NormalizedUsage {
  readonly id: string
  readonly operation: string
  readonly requires: readonly string[]
  readonly produces: string | null
  readonly kind: string
  readonly tenant: string | null
  readonly actor: string | null
}

/** La nature par défaut d'un usage : un parcours métier (L223). */
export const DEFAULT_USAGE_KIND = 'business'

/**
 * Les natures d'usage qui alimentent conformité/criticité plutôt que le
 * comptage des parcours métier valides (L223, T08.A4). Le motif est délibérément
 * large : un essai négatif mal classé contaminerait le taux de réussite métier,
 * et c'est la contamination — pas la finesse de la taxonomie — que le cas
 * interdit. La POLITIQUE de criticité (quelle violation met hors service) n'est
 * pas ici : c'est T22 (L349).
 */
const COMPLIANCE_KINDS =
  /secu|s[ée]curit|security|negative|n[ée]gatif|negatif|probe|compliance|conformit|criticit|criticality|audit|abuse|tenant[_\s-]?isolation/i

export const isComplianceKind = (kind: string): boolean => COMPLIANCE_KINDS.test(kind)

const USAGE_KEYS = ['id', 'operation', 'requires', 'produces', 'kind', 'tenant', 'actor'] as const
const CANDIDATE_KEYS = ['created'] as const

function normalizeUsage(value: unknown, path: string): NormalizedUsage {
  const o = requireObject(value, path)
  requireOnlyKeys(o, USAGE_KEYS, path)
  const produces = o['produces']
  if (produces !== null && produces !== undefined && typeof produces !== 'string') {
    throw new WorkloadRejection(
      'TYPE_MISMATCH',
      childPath(path, 'produces'),
      'attendu un handle ou null',
    )
  }
  return {
    id: requireNonEmptyString(o['id'], childPath(path, 'id')),
    operation: requireNonEmptyString(o['operation'], childPath(path, 'operation')),
    requires:
      o['requires'] === undefined
        ? []
        : requireStringArray(o['requires'], childPath(path, 'requires')),
    produces:
      produces === undefined || produces === null
        ? null
        : requireNonEmptyString(produces, childPath(path, 'produces')),
    kind:
      o['kind'] === undefined
        ? DEFAULT_USAGE_KIND
        : requireNonEmptyString(o['kind'], childPath(path, 'kind')),
    tenant:
      o['tenant'] === undefined ? null : requireNonEmptyString(o['tenant'], childPath(path, 'tenant')),
    actor:
      o['actor'] === undefined ? null : requireNonEmptyString(o['actor'], childPath(path, 'actor')),
  }
}

/**
 * Contrôle le catalogue et refuse deux usages de même identifiant : l'`id`
 * d'une intention en dérive, et « id stable » (L88) cesserait d'être une
 * identité si deux intentions pouvaient partager le leur.
 */
export function normalizeCatalog(value: unknown, path: string): readonly NormalizedUsage[] {
  if (!Array.isArray(value)) {
    throw new WorkloadRejection('TYPE_MISMATCH', path, 'attendu un tableau d’usages')
  }
  const vus = new Set<string>()
  const usages = value.map((u, i) => normalizeUsage(u, childPath(path, i)))
  for (const u of usages) {
    if (vus.has(u.id)) {
      throw new WorkloadRejection('DUPLICATE_USAGE_ID', path, `l’usage « ${u.id} » figure deux fois`)
    }
    vus.add(u.id)
  }
  return usages
}

/**
 * Contrôle l'état du candidat. La valeur rendue est délibérément inutilisée par
 * le générateur : voir l'en-tête de ce module. Elle est contrôlée quand même,
 * parce qu'une entrée malformée doit être refusée à la porte et non se
 * découvrir plus tard sous la forme d'un plan silencieusement différent.
 */
export function normalizeCandidateState(value: unknown, path: string): CandidateState {
  if (value === undefined) return { created: [] }
  const o = requireObject(value, path)
  requireOnlyKeys(o, CANDIDATE_KEYS, path)
  return {
    created:
      o['created'] === undefined ? [] : requireStringArray(o['created'], childPath(path, 'created')),
  }
}
