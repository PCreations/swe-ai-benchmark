// ─────────────────────────────────────────────────────────────────────────────
// Contrôles de FORME partagés par l'horloge, le générateur et l'exécuteur.
//
// L80 : « Les JSON de domaine sont stricts : propriétés inconnues rejetées,
// enums explicites, timestamps UTC ISO 8601, nombres non finis interdits. »
// Ces cinq fonctions sont la seule porte par laquelle une valeur extérieure
// entre dans ce paquet ; il n'y a donc pas d'endroit où une entrée malformée
// puisse se faufiler ensuite.
//
// Ce module ne connaît AUCUN concept de T08 : ni intention, ni horloge, ni
// compteur. C'est ce qui permet de le relire pour ce qu'il est — un contrôle de
// forme — sans avoir à vérifier qu'il ne cache pas une règle métier.
// ─────────────────────────────────────────────────────────────────────────────
import { WorkloadRejection, childPath } from './errors.js'

/**
 * Un timestamp UTC ISO 8601 (L80). Le `Z` est EXIGÉ : un décalage `+01:00`
 * décrirait le même instant sous une graphie qui n'est pas celle du cahier, et
 * deux graphies pour un instant rendraient la comparaison d'un plan à un autre
 * dépendante de l'écriture plutôt que de l'instant.
 */
const UTC_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/

export type PlainObject = Record<string, unknown>

export function requireObject(value: unknown, path: string): PlainObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return refuseType(value, path, 'un objet')
  }
  return value as PlainObject
}

function refuseType(value: unknown, path: string, attendu: string): never {
  const recu =
    value === null ? 'null' : Array.isArray(value) ? 'un tableau' : `un ${typeof value}`
  throw new WorkloadRejection('TYPE_MISMATCH', path, `attendu ${attendu}, reçu ${recu}`)
}

/**
 * §E : « propriétés inconnues rejetées ». La liste est donnée par l'appelant,
 * si bien que chaque contrat déclare le sien plutôt que d'hériter d'un
 * fourre-tout commun.
 */
export function requireOnlyKeys(
  o: PlainObject,
  allowed: readonly string[],
  path: string,
): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) {
      throw new WorkloadRejection(
        'UNKNOWN_PROPERTY',
        childPath(path, k),
        `propriétés déclarées : ${allowed.join(', ')}`,
      )
    }
  }
}

export function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string') return refuseType(value, path, 'une chaîne')
  if (value.length === 0) {
    throw new WorkloadRejection('EMPTY_STRING', path, 'une chaîne vide n’identifie rien')
  }
  return value
}

export function requireStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) return refuseType(value, path, 'un tableau de chaînes')
  return value.map((x, i) => requireNonEmptyString(x, childPath(path, i)))
}

/** Un entier non négatif et fini : ni `NaN`, ni `Infinity` (L80). */
export function requireNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number') return refuseType(value, path, 'un nombre')
  if (!Number.isFinite(value)) {
    throw new WorkloadRejection('NON_FINITE_NUMBER', path, String(value))
  }
  if (!Number.isInteger(value)) {
    throw new WorkloadRejection('NOT_AN_INTEGER', path, String(value))
  }
  if (value < 0) {
    throw new WorkloadRejection('NEGATIVE_DURATION', path, String(value))
  }
  return value
}

/** Rend l'instant en millisecondes depuis l'époque, ou refuse (L80). */
export function requireUtcIsoInstant(value: unknown, path: string): number {
  const s = requireNonEmptyString(value, path)
  if (!UTC_ISO_8601.test(s)) {
    throw new WorkloadRejection(
      'TIMESTAMP_NOT_UTC_ISO8601',
      path,
      `« ${s} » n’est pas un instant UTC ISO 8601 terminé par Z`,
    )
  }
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) {
    throw new WorkloadRejection('TIMESTAMP_NOT_UTC_ISO8601', path, `« ${s} » n’est pas un instant`)
  }
  return ms
}

/**
 * Graphie CANONIQUE d'un instant métier : UTC ISO 8601, millisecondes
 * explicites. La milliseconde est l'unité du cahier, qui oppose `12:00:00Z` à
 * `12:00:00.001Z` (L119) ; l'écrire toujours évite qu'une frontière franchie
 * d'une milliseconde se lise comme le même texte que la frontière.
 */
export const formatUtcIso = (ms: number): string => new Date(ms).toISOString()

/**
 * Hachage FNV-1a 32 bits. Il ne sert PAS à la sécurité : il sert à dériver un
 * ordre et des identifiants REPRODUCTIBLES à partir du triplet
 * (scénario, graine, usage). L82 : « les graines sont dérivées par identifiants
 * et flux » — le flux de T08 est `workload`. Aucune source d'entropie n'entre
 * ici : ni horloge système, ni compteur global, ni `Math.random`. C'est ce qui
 * rend le plan identique quel que soit le nombre de workers (L223).
 */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const hex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')

/**
 * Compose une clé de graine. Le séparateur est `U+0000`, qu'aucun identifiant
 * du cahier ne contient : sans lui, `('AB', 'C')` et `('A', 'BC')` donneraient
 * la même clé, donc le même tirage pour deux entrées différentes.
 */
export const seedKey = (...parts: readonly string[]): string => parts.join('\u0000')
