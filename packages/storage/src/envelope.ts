// ─────────────────────────────────────────────────────────────────────────────
// L'enveloppe de publication, et ce que le stockage exige d'elle avant
// d'ouvrir une transaction.
//
// L80 : « les JSON de domaine sont stricts : propriétés inconnues rejetées ».
// Une enveloppe mal formée est donc refusée AVANT le `BEGIN`, par une
// `ContractViolation` de `@bench/contracts` — la classe que T02 a écrite pour
// exactement cette famille de refus. Le stockage ne réinvente pas un
// vocabulaire d'erreurs de forme : il réutilise celui du contrat.
//
// CE QUE T12 NE VALIDE PAS, ET POURQUOI. Les champs de `PeriodResult` (L95) ne
// sont pas contrôlés ici : c'est le rôle de T03, et un stockage qui
// re-validerait le domaine ferait diverger deux définitions de la même règle.
// T12 exige seulement que `result` soit un objet — il doit traverser le
// stockage sans changer de type (L80), ce qu'un `jsonb` garantit.
// ─────────────────────────────────────────────────────────────────────────────

import { ContractViolation, TRAJECTORY_ID_FIELDS, trajectoryKey } from '@bench/contracts'
import type { PeriodIdentity } from '@bench/contracts'

/** Convention d'appel IV.1 : objet PLAT et STRICT. */
export interface StoreTarget {
  readonly dsn: string
}

/**
 * Enveloppe de publication. `events` est la liste des événements de domaine à
 * écrire DANS LA MÊME TRANSACTION que le résultat (L257 : « outbox et
 * publication transactionnelle »).
 */
export interface PublishEnvelope {
  readonly idempotency_key: string
  readonly input_digest: string
  readonly identity: PeriodIdentity
  readonly result: Readonly<Record<string, unknown>>
  readonly events: readonly Readonly<Record<string, unknown>>[]
}

/**
 * POINTS D'INJECTION NOMMÉS (L141). Un livrable, pas une commodité de test :
 * sans eux, une panne « avant commit » ne serait pas reproductible.
 */
export type PublishFault =
  | 'BEFORE_COMMIT'
  | 'AFTER_COMMIT'
  | 'CONFLICT_ONCE'
  | 'CONFLICT_EVERY_ATTEMPT'

/** Convention d'appel IV.3 et IV.4. */
export interface PublishOptions {
  readonly fault?: PublishFault
  readonly barrier?: () => Promise<void>
}

/** Convention d'appel IV.6 : la clé, et rien d'autre. */
export interface ReadQuery {
  readonly idempotency_key: string
}

/** Ce que rend une publication acceptée (convention d'appel IV.2). */
export interface PublishReceipt {
  readonly idempotency_key: string
  readonly input_digest: string
  /** Tentatives réellement consommées, entier >= 1. */
  readonly attempts: number
  /** Faux quand la clé était déjà publiée à l'identique : rien n'a été réécrit. */
  readonly inserted: boolean
  /** Événements écrits par CETTE publication (0 sur une reprise idempotente). */
  readonly events_written: number
}

/** L'enregistrement relu (convention d'appel IV.6). */
export interface PeriodRecord {
  readonly idempotency_key: string
  readonly input_digest: string
  readonly identity: PeriodIdentity
  readonly result: Readonly<Record<string, unknown>>
  readonly period_index: number
  readonly published_at: string
}

const ENVELOPE_FIELDS = [
  'idempotency_key',
  'input_digest',
  'identity',
  'result',
  'events',
] as const

const IDENTITY_FIELDS: readonly string[] = [...TRAJECTORY_ID_FIELDS, 'period_index']

const PUBLISH_FAULTS: readonly PublishFault[] = [
  'BEFORE_COMMIT',
  'AFTER_COMMIT',
  'CONFLICT_ONCE',
  'CONFLICT_EVERY_ATTEMPT',
]

const OPTION_FIELDS = ['fault', 'barrier'] as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function requireObject(v: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(v)) throw new ContractViolation('TYPE_MISMATCH', path, 'objet attendu')
  return v
}

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne attendue')
  if (v.length === 0) throw new ContractViolation('MISSING_PROPERTY', path, 'chaîne vide')
  return v
}

function rejectUnknown(o: Record<string, unknown>, known: readonly string[], path: string): void {
  for (const k of Object.keys(o)) {
    if (!known.includes(k)) throw new ContractViolation('UNKNOWN_PROPERTY', `${path}.${k}`)
  }
}

/** L261/A1 : la cible d'un `applyMigrations` ou d'un `openStore`. */
export function checkTarget(v: unknown, role: string): StoreTarget {
  const o = requireObject(v, role)
  rejectUnknown(o, ['dsn'], role)
  return { dsn: requireNonEmptyString(o['dsn'], `${role}.dsn`) }
}

/** L80 : propriétés inconnues rejetées, jusque dans l'identité de L78. */
export function checkEnvelope(v: unknown): PublishEnvelope {
  const o = requireObject(v, 'envelope')
  rejectUnknown(o, ENVELOPE_FIELDS, 'envelope')
  for (const f of ENVELOPE_FIELDS) {
    if (!(f in o)) throw new ContractViolation('MISSING_PROPERTY', `envelope.${f}`)
  }

  const idObj = requireObject(o['identity'], 'envelope.identity')
  rejectUnknown(idObj, IDENTITY_FIELDS, 'envelope.identity')
  for (const f of TRAJECTORY_ID_FIELDS) {
    requireNonEmptyString(idObj[f], `envelope.identity.${f}`)
  }
  const periodIndex = idObj['period_index']
  if (typeof periodIndex !== 'number' || !Number.isFinite(periodIndex)) {
    throw new ContractViolation('NON_FINITE_NUMBER', 'envelope.identity.period_index')
  }
  if (!Number.isInteger(periodIndex) || periodIndex < 1) {
    // §E : « une période ajoute `period_index` commençant à 1 ».
    throw new ContractViolation('TYPE_MISMATCH', 'envelope.identity.period_index', 'entier >= 1')
  }

  const events = o['events']
  if (!Array.isArray(events)) {
    throw new ContractViolation('TYPE_MISMATCH', 'envelope.events', 'tableau attendu')
  }
  events.forEach((e, i) => {
    requireObject(e, `envelope.events[${String(i)}]`)
  })

  return {
    idempotency_key: requireNonEmptyString(o['idempotency_key'], 'envelope.idempotency_key'),
    input_digest: requireNonEmptyString(o['input_digest'], 'envelope.input_digest'),
    identity: idObj as unknown as PeriodIdentity,
    result: requireObject(o['result'], 'envelope.result'),
    events: events as readonly Record<string, unknown>[],
  }
}

/** Le troisième argument : plat, optionnel, et strictement énuméré (IV.3). */
export function checkOptions(v: unknown): PublishOptions {
  if (v === undefined || v === null) return {}
  const o = requireObject(v, 'options')
  rejectUnknown(o, OPTION_FIELDS, 'options')
  const out: { fault?: PublishFault; barrier?: () => Promise<void> } = {}
  const fault = o['fault']
  if (fault !== undefined) {
    if (typeof fault !== 'string' || !PUBLISH_FAULTS.includes(fault as PublishFault)) {
      throw new ContractViolation('ENUM_VALUE_UNKNOWN', 'options.fault', String(fault))
    }
    out.fault = fault as PublishFault
  }
  const barrier = o['barrier']
  if (barrier !== undefined) {
    if (typeof barrier !== 'function') {
      throw new ContractViolation('TYPE_MISMATCH', 'options.barrier', 'fonction attendue')
    }
    out.barrier = barrier as () => Promise<void>
  }
  return out
}

/** Convention d'appel IV.6 : `{ idempotency_key }`, et rien d'autre. */
export function checkQuery(v: unknown): ReadQuery {
  const o = requireObject(v, 'query')
  rejectUnknown(o, ['idempotency_key'], 'query')
  return {
    idempotency_key: requireNonEmptyString(o['idempotency_key'], 'query.idempotency_key'),
  }
}

/**
 * L'identifiant de trajectoire : les six champs de L78 dans l'ordre que
 * `@bench/contracts` fige. L'ordre est figé là-bas et pas ici, pour que deux
 * processus produisent la même clé (D-6).
 */
export function trajectoryIdOf(identity: PeriodIdentity): string {
  return trajectoryKey(identity)
}
