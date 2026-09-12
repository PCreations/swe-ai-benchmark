// ─────────────────────────────────────────────────────────────────────────────
// Formes acceptées par l'oracle, et leur validation STRICTE (L80).
//
// « Les JSON de domaine sont stricts : propriétés inconnues rejetées, enums
//   explicites, timestamps UTC ISO 8601, nombres non finis interdits. »
//
// Une interface TypeScript ne survit pas à l'exécution : elle ne peut rien
// rejeter. Les validateurs ci-dessous sont donc la SEULE stricture réelle, et
// c'est pour cela qu'ils travaillent sur `unknown` plutôt que sur le type
// déclaré. Le typage sert l'appelant qui compile ; la validation sert l'oracle
// qui reçoit.
// ─────────────────────────────────────────────────────────────────────────────
import { ReservationRejection, childPath } from './errors.js'

/** Les deux transitions que §F exerce : réserver, annuler. */
export const RESERVATION_OPERATION_KINDS = ['reserve', 'cancel'] as const
export type ReservationOperationKind = (typeof RESERVATION_OPERATION_KINDS)[number]

/**
 * Les trois statuts de la machine à états. Ce sont des ÉTATS de réservation,
 * pas des verdicts d'appel : une annulation refusée ne produit aucun statut.
 */
export const RESERVATION_STATUSES = ['confirmed', 'waiting', 'cancelled'] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

/** Un créneau : identité, capacité, instant de début (UTC ISO 8601, L80). */
export interface ReservationSlot {
  readonly id: string
  readonly capacity: number
  readonly start: string
}

/**
 * Configuration initiale de l'oracle : horloge initiale, locataire, acteurs,
 * créneaux, et les deux paramètres de la règle d'annulation de P3 (délai en
 * heures, frontière incluse).
 */
export interface ReservationOracleSetup {
  readonly clock: string
  readonly tenant: string
  readonly actors: readonly string[]
  readonly slots: readonly ReservationSlot[]
  readonly cancellation_notice_hours: number
  readonly cancellation_boundary_inclusive: boolean
}

/**
 * Une opération soumise à l'oracle. Objet PLAT et STRICT (L80).
 *
 * `sequence` est la « séquence d'admission explicite » de L123 : c'est elle, et
 * jamais `at`, qui ordonne la file — deux admissions peuvent porter le même
 * instant métier, et §F dit littéralement que FIFO ne s'appuie pas sur une
 * égalité possible de timestamps. `idempotency_key` est la clé d'opération de
 * l'invariant D-6 (L68).
 */
export interface ReservationOperation {
  readonly kind: ReservationOperationKind
  readonly tenant: string
  readonly actor: string
  readonly slot: string
  readonly at: string
  readonly sequence: number
  readonly idempotency_key: string
}

/**
 * La vue sous laquelle une projection est demandée. Le locataire est
 * obligatoire : c'est lui qui porte la propriété testée par §F P4 (« les
 * acteurs de `other` ne peuvent ni lire ni modifier les réservations
 * `legacy` », L119).
 */
export interface ReservationView {
  readonly tenant: string
  readonly actor?: string
}

/* ───────────────────────────────────────────────── outils de stricture */

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/

export function asObject(v: unknown, path: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new ReservationRejection('TYPE_MISMATCH', path === '' ? '/' : path, `objet attendu, ${v === null ? 'null' : Array.isArray(v) ? 'tableau' : typeof v} reçu`)
  }
  return v as Record<string, unknown>
}

/**
 * « Propriétés inconnues rejetées » (L80), et propriétés obligatoires exigées.
 * Les deux moitiés vont ensemble : n'exiger que la présence laisserait passer
 * un champ surnuméraire, qui est exactement la façon dont un appelant croit
 * paramétrer ce que l'oracle ignore.
 */
export function exactKeys(
  o: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) {
      throw new ReservationRejection('UNKNOWN_PROPERTY', childPath(path, k), 'propriété non déclarée par le contrat')
    }
  }
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(o, k) || o[k] === undefined) {
      throw new ReservationRejection('MISSING_PROPERTY', childPath(path, k), 'propriété obligatoire absente')
    }
  }
}

export function asNonEmptyString(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key]
  const p = childPath(path, key)
  if (typeof v !== 'string') throw new ReservationRejection('TYPE_MISMATCH', p, `chaîne attendue, ${typeof v} reçu`)
  if (v.length === 0) throw new ReservationRejection('EMPTY_STRING', p, 'chaîne vide')
  return v
}

export function asBoolean(o: Record<string, unknown>, key: string, path: string): boolean {
  const v = o[key]
  if (typeof v !== 'boolean') {
    throw new ReservationRejection('TYPE_MISMATCH', childPath(path, key), `booléen attendu, ${typeof v} reçu`)
  }
  return v
}

export function asFiniteNumber(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key]
  const p = childPath(path, key)
  if (typeof v !== 'number') throw new ReservationRejection('TYPE_MISMATCH', p, `nombre attendu, ${typeof v} reçu`)
  if (!Number.isFinite(v)) throw new ReservationRejection('NON_FINITE_NUMBER', p, String(v))
  return v
}

/**
 * Un instant métier. Deux contrôles, et non un : la forme (UTC ISO 8601, L80)
 * puis la parsabilité. `2030-02-31T00:00:00Z` satisfait la première et pas la
 * seconde ; le laisser passer donnerait un `NaN` qui rendrait toute comparaison
 * de frontière silencieusement fausse — donc une annulation tardive acceptée.
 */
export function asTimestamp(o: Record<string, unknown>, key: string, path: string): string {
  const v = asNonEmptyString(o, key, path)
  const p = childPath(path, key)
  if (!ISO_UTC.test(v)) {
    throw new ReservationRejection('TIMESTAMP_NOT_UTC_ISO8601', p, 'forme attendue AAAA-MM-JJThh:mm:ss[.sss]Z')
  }
  if (!Number.isFinite(Date.parse(v))) {
    throw new ReservationRejection('TIMESTAMP_NOT_UTC_ISO8601', p, 'instant non représentable')
  }
  return v
}

export function asEnum<T extends string>(
  o: Record<string, unknown>,
  key: string,
  members: readonly T[],
  path: string,
): T {
  const v = asNonEmptyString(o, key, path)
  if (!(members as readonly string[]).includes(v)) {
    throw new ReservationRejection('ENUM_VALUE_UNKNOWN', childPath(path, key), `valeurs admises : ${members.join('|')}`)
  }
  return v as T
}

/* ──────────────────────────────────── les trois formes d'entrée publiques */

const SETUP_KEYS = [
  'clock',
  'tenant',
  'actors',
  'slots',
  'cancellation_notice_hours',
  'cancellation_boundary_inclusive',
] as const

const SLOT_KEYS = ['id', 'capacity', 'start'] as const

const OPERATION_KEYS = [
  'kind',
  'tenant',
  'actor',
  'slot',
  'at',
  'sequence',
  'idempotency_key',
] as const

export function validateSetup(raw: unknown): ReservationOracleSetup {
  const o = asObject(raw, '/setup')
  exactKeys(o, SETUP_KEYS, [], '/setup')

  const clock = asTimestamp(o, 'clock', '/setup')
  const tenant = asNonEmptyString(o, 'tenant', '/setup')

  const rawActors = o['actors']
  if (!Array.isArray(rawActors)) {
    throw new ReservationRejection('TYPE_MISMATCH', '/setup/actors', 'tableau attendu')
  }
  const actors: string[] = []
  rawActors.forEach((a, i) => {
    if (typeof a !== 'string' || a.length === 0) {
      throw new ReservationRejection('TYPE_MISMATCH', `/setup/actors/${String(i)}`, 'identifiant d\'acteur non vide attendu')
    }
    actors.push(a)
  })

  const rawSlots = o['slots']
  if (!Array.isArray(rawSlots)) {
    throw new ReservationRejection('TYPE_MISMATCH', '/setup/slots', 'tableau attendu')
  }
  const slots: ReservationSlot[] = []
  rawSlots.forEach((s, i) => {
    const p = `/setup/slots/${String(i)}`
    const so = asObject(s, p)
    exactKeys(so, SLOT_KEYS, [], p)
    const capacity = asFiniteNumber(so, 'capacity', p)
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new ReservationRejection('TYPE_MISMATCH', `${p}/capacity`, 'entier non négatif attendu')
    }
    slots.push({ id: asNonEmptyString(so, 'id', p), capacity, start: asTimestamp(so, 'start', p) })
  })

  const notice = asFiniteNumber(o, 'cancellation_notice_hours', '/setup')
  if (notice < 0) {
    throw new ReservationRejection('TYPE_MISMATCH', '/setup/cancellation_notice_hours', 'nombre d\'heures non négatif attendu')
  }

  return {
    clock,
    tenant,
    actors,
    slots,
    cancellation_notice_hours: notice,
    cancellation_boundary_inclusive: asBoolean(o, 'cancellation_boundary_inclusive', '/setup'),
  }
}

export function validateOperation(raw: unknown): ReservationOperation {
  const o = asObject(raw, '/operation')
  exactKeys(o, OPERATION_KEYS, [], '/operation')
  const sequence = asFiniteNumber(o, 'sequence', '/operation')
  if (!Number.isInteger(sequence)) {
    throw new ReservationRejection('TYPE_MISMATCH', '/operation/sequence', 'séquence d\'admission entière attendue')
  }
  return {
    kind: asEnum(o, 'kind', RESERVATION_OPERATION_KINDS, '/operation'),
    tenant: asNonEmptyString(o, 'tenant', '/operation'),
    actor: asNonEmptyString(o, 'actor', '/operation'),
    slot: asNonEmptyString(o, 'slot', '/operation'),
    at: asTimestamp(o, 'at', '/operation'),
    sequence,
    idempotency_key: asNonEmptyString(o, 'idempotency_key', '/operation'),
  }
}

export function validateView(raw: unknown): ReservationView {
  const o = asObject(raw, '/view')
  exactKeys(o, ['tenant'], ['actor'], '/view')
  const tenant = asNonEmptyString(o, 'tenant', '/view')
  if (Object.prototype.hasOwnProperty.call(o, 'actor') && o['actor'] !== undefined) {
    return { tenant, actor: asNonEmptyString(o, 'actor', '/view') }
  }
  return { tenant }
}
