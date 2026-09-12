// ─────────────────────────────────────────────────────────────────────────────
// La machine à états de réservation (cahier L213), et rien d'autre.
//
// SANS SQL NI HTTP (L213), SANS RÉUTILISER LES APPLICATIONS TÉMOINS (L217).
// `packages/oracle/tsconfig.json` fixe `types: []` : ni `node:fs`, ni
// `node:http`, ni `node:child_process` ne peuvent entrer ici sans faire échouer
// `tsc`. La seule dépendance est `@bench/contracts`, qui n'est lui-même qu'un
// paquet de formes et d'empreintes — pas un validateur métier.
//
// ─────────────────────────────────────────────────────────────── déterminisme
// « Toutes les transitions sont déterministes » (L217). Trois conséquences
// concrètes, et chacune est un choix qu'on aurait pu rater :
//
//   1. AUCUNE HORLOGE AMBIANTE. `Date.now()` n'apparaît nulle part. Le seul
//      instant qui existe est `operation.at`, fourni par l'appelant. Une
//      annulation « 1 ms après la frontière » (cas A4) doit être refusée parce
//      que son instant MÉTIER le dit, pas parce que la machine a regardé
//      l'heure qu'il est.
//
//   2. AUCUN IDENTIFIANT ALÉATOIRE. Les identifiants de réservation sont
//      dérivés d'un compteur porté par l'état : `RES-0001`, `RES-0002`. Deux
//      rejeux du même journal produisent les mêmes identifiants. §F les déclare
//      `non_fixe_par_le_cahier`, donc aucune assertion ne les compare — mais un
//      identifiant tiré au sort rendrait l'oracle non reproductible, ce qui est
//      une autre façon de perdre le déterminisme que L217 exige.
//
//   3. LA FILE EST ORDONNÉE PAR `sequence`, JAMAIS PAR `at`. L123 : « FIFO est
//      ordonné par séquence d'admission explicite, pas par égalité possible de
//      timestamps ». Les deux admissions de P2 portent le MÊME instant métier ;
//      si la file s'appuyait sur `at`, leur ordre dépendrait d'un détail de tri
//      non spécifié. Le tri de promotion est en outre STABLE (l'index d'entrée
//      départage les rangs égaux), pour que même un journal mal formé reste
//      reproductible.
//
// ────────────────────────────────────────────────────────────────── pureté
// `applyOperation` ne MUTE jamais son entrée : elle rend un état neuf. Ce n'est
// pas du zèle fonctionnel, c'est l'énoncé de L123 — « les probes de frontière
// P3 sont des clones jetables ; elles ne modifient pas l'état persistant
// principal ». Un réducteur qui muterait son argument ferait de la probe de
// frontière une modification de l'état de production.
//
// ──────────────────────────────────────── l'invariant D-6, et ses deux moitiés
// L68 : « les effets valides sont dédupliqués par CLÉ D'OPÉRATION et empreinte
// d'entrée ». Les deux moitiés sont indissociables :
//
//   même clé + même empreinte  -> REJEU. Aucun effet nouveau, et l'appel
//                                 ABOUTIT : c'est l'idempotence de P1, et c'est
//                                 le volet positif du cas A6.
//   même clé + empreinte autre -> CONFLIT EXPLICITE (cas A6). Rendre
//                                 silencieusement le résultat du premier appel
//                                 serait le bug que ce cas traque : deux
//                                 intentions différentes confondues.
//
// Seuls les effets VALIDES entrent au registre. Un refus n'y laisse rien : sans
// quoi une opération refusée réserverait sa clé, et son rejeu corrigé
// deviendrait un conflit.
//
// ───────────────────────────────── une lecture assumée de §F, et laquelle
// §F P1 dit « demande concurrente de B rejetée sans surbooking » et §F P2 dit
// « B puis C en attente ». §F ne dit PAS si une demande faite sur un créneau
// plein est écartée ou mise en file. Cette implémentation retient la seconde
// lecture — admission en file d'attente, jamais confirmation — parce qu'elle
// satisfait littéralement les deux énoncés à la fois : le demandeur n'est pas
// confirmé (« rejetée », pas de surbooking, le titulaire reste A) et il figure
// « en attente », ce que P2 exige ensuite. La lecture inverse exigerait une
// seconde demande de B en P2, que §F ne mentionne pas davantage. Le choix est
// signalé ici parce qu'il n'est pas déduit du cahier : il est COMPATIBLE avec
// lui, et c'est tout ce qu'on peut en dire.
// ─────────────────────────────────────────────────────────────────────────────
import { canonicalDigest } from '@bench/contracts'

import { ReservationRejection, childPath } from './errors.js'
import type {
  ReservationOperation,
  ReservationOracleSetup,
  ReservationSlot,
  ReservationStatus,
} from './contract.js'
import { asObject, validateOperation, validateSetup } from './contract.js'

/**
 * Une réservation, telle que la machine la porte et que la projection l'expose.
 *
 * `rank` est la séquence d'admission explicite de l'opération qui l'a créée
 * (L123). Elle ne bouge JAMAIS : une promotion change le statut, pas le rang —
 * sans quoi l'ordre de la file dépendrait de son propre historique.
 */
export interface ReservationRecord {
  readonly id: string
  readonly tenant: string
  readonly actor: string
  readonly slot: string
  readonly status: ReservationStatus
  readonly rank: number
  readonly at: string
  readonly cancelled_at: string | null
}

/**
 * Une entrée du registre de déduplication D-6 : la clé d'opération, et
 * l'empreinte canonique des arguments sous lesquels elle a produit son effet.
 */
export interface AppliedEffect {
  readonly key: string
  readonly fingerprint: string
}

/**
 * L'état de l'oracle. §F dit « évaluer l'état métier EXPORTÉ, pas un nom de
 * table imposé » : cette forme est un détail d'implémentation, et seule
 * `projectBusinessState` est un contrat observable.
 */
export interface ReservationOracleState {
  readonly tenant: string
  readonly clock: string
  readonly actors: readonly string[]
  readonly slots: readonly ReservationSlot[]
  readonly cancellation_notice_hours: number
  readonly cancellation_boundary_inclusive: boolean
  readonly reservations: readonly ReservationRecord[]
  readonly effects: readonly AppliedEffect[]
  readonly reservation_counter: number
}

const STATE_FIELDS = [
  'tenant',
  'clock',
  'actors',
  'slots',
  'cancellation_notice_hours',
  'cancellation_boundary_inclusive',
  'reservations',
  'effects',
  'reservation_counter',
] as const

function requireState(raw: unknown): ReservationOracleState {
  const o = asObject(raw, '/state')
  for (const k of STATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) {
      throw new ReservationRejection(
        'STATE_MALFORMED',
        childPath('/state', k),
        'état non produit par createReservationOracle',
      )
    }
  }
  return raw as ReservationOracleState
}

const reservationId = (counter: number): string => `RES-${String(counter).padStart(4, '0')}`

/**
 * L'empreinte d'entrée de D-6. La clé d'opération en est EXCLUE : c'est elle
 * qu'on compare, comparer l'empreinte d'un objet qui la contient rendrait
 * l'égalité vraie par construction et supprimerait le cas de conflit.
 * `canonicalDigest` est l'empreinte du §E — octets canoniques triés par clé,
 * SHA-256 — et non une égalité structurelle improvisée ici.
 */
function fingerprintOf(op: ReservationOperation): string {
  return canonicalDigest({
    kind: op.kind,
    tenant: op.tenant,
    actor: op.actor,
    slot: op.slot,
    at: op.at,
    sequence: op.sequence,
  })
}

/**
 * La frontière d'annulation : « au moins 24 heures avant le début, frontière
 * incluse » (§F P3). Le délai et l'inclusion viennent du `setup`, pas d'une
 * constante écrite ici — le 24 appartient à la fixture gelée, pas au code.
 */
export function cancellationBoundary(slotStart: string, noticeHours: number): number {
  return Date.parse(slotStart) - noticeHours * 3_600_000
}

export function isCancellationAllowed(
  at: string,
  slotStart: string,
  noticeHours: number,
  boundaryInclusive: boolean,
): boolean {
  const instant = Date.parse(at)
  const boundary = cancellationBoundary(slotStart, noticeHours)
  return boundaryInclusive ? instant <= boundary : instant < boundary
}

/**
 * Remplit le créneau depuis la file, par rang croissant, jusqu'à sa capacité.
 * Appelée après CHAQUE transition : c'est le seul endroit où une promotion peut
 * naître, donc le seul endroit où une double promotion pourrait naître. Comme
 * elle ne promeut que ce qui manque pour atteindre la capacité, un état déjà
 * plein est un point fixe — ce que le cas A7 mesure en rejouant une annulation.
 */
function refill(records: readonly ReservationRecord[], slot: ReservationSlot): ReservationRecord[] {
  const confirmed = records.filter((r) => r.slot === slot.id && r.status === 'confirmed').length
  let free = slot.capacity - confirmed
  if (free <= 0) return [...records]

  const queue = records
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.slot === slot.id && x.r.status === 'waiting')
    .sort((a, b) => (a.r.rank !== b.r.rank ? a.r.rank - b.r.rank : a.i - b.i))

  const promoted = new Set<string>()
  for (const x of queue) {
    if (free <= 0) break
    promoted.add(x.r.id)
    free -= 1
  }
  if (promoted.size === 0) return [...records]
  return records.map((r) => (promoted.has(r.id) ? { ...r, status: 'confirmed' as const } : r))
}

/** État initial de l'oracle (L213 : « machine à états de réservation »). */
export function createReservationOracle(setup: ReservationOracleSetup): ReservationOracleState {
  const s = validateSetup(setup as unknown)
  return {
    tenant: s.tenant,
    clock: s.clock,
    actors: [...s.actors],
    slots: s.slots.map((x) => ({ id: x.id, capacity: x.capacity, start: x.start })),
    cancellation_notice_hours: s.cancellation_notice_hours,
    cancellation_boundary_inclusive: s.cancellation_boundary_inclusive,
    reservations: [],
    effects: [],
    reservation_counter: 0,
  }
}

function admit(
  state: ReservationOracleState,
  op: ReservationOperation,
  slot: ReservationSlot,
): ReservationOracleState {
  const active = state.reservations.find(
    (r) => r.slot === slot.id && r.actor === op.actor && r.status !== 'cancelled',
  )
  if (active !== undefined) {
    throw new ReservationRejection(
      'ALREADY_RESERVED',
      '/operation/actor',
      'cet acteur détient déjà une réservation active sur ce créneau',
    )
  }
  const counter = state.reservation_counter + 1
  const admitted: ReservationRecord = {
    id: reservationId(counter),
    tenant: state.tenant,
    actor: op.actor,
    slot: slot.id,
    // Toute admission entre par la FILE ; seule `refill` confirme, et seulement
    // dans la limite de la capacité. Confirmer directement « quand il reste de
    // la place » dupliquerait la règle de capacité en deux endroits, et c'est
    // par ce genre de duplication qu'un surbooking finit par passer.
    status: 'waiting',
    rank: op.sequence,
    at: op.at,
    cancelled_at: null,
  }
  return {
    ...state,
    reservations: refill([...state.reservations, admitted], slot),
    reservation_counter: counter,
  }
}

function cancel(
  state: ReservationOracleState,
  op: ReservationOperation,
  slot: ReservationSlot,
): ReservationOracleState {
  const index = state.reservations.findIndex(
    (r) => r.slot === slot.id && r.actor === op.actor && r.status !== 'cancelled',
  )
  if (index < 0) {
    throw new ReservationRejection(
      'NO_ACTIVE_RESERVATION',
      '/operation/actor',
      'aucune réservation active à annuler sur ce créneau',
    )
  }
  if (
    !isCancellationAllowed(
      op.at,
      slot.start,
      state.cancellation_notice_hours,
      state.cancellation_boundary_inclusive,
    )
  ) {
    throw new ReservationRejection(
      'CANCELLATION_TOO_LATE',
      '/operation/at',
      `annulation permise jusqu'à ${String(state.cancellation_notice_hours)} h avant le début, ` +
        `frontière ${state.cancellation_boundary_inclusive ? 'incluse' : 'exclue'}`,
    )
  }
  const cancelled = state.reservations.map((r, i) =>
    i === index ? { ...r, status: 'cancelled' as const, cancelled_at: op.at } : r,
  )
  return { ...state, reservations: refill(cancelled, slot) }
}

/**
 * Applique une opération et rend un état NOUVEAU (L213). Un refus métier est
 * levé, jamais rendu : voir `errors.ts`.
 *
 * L'ORDRE DES CONTRÔLES EST UNE DÉCISION. L'isolation intertenant passe AVANT
 * tout le reste, y compris avant le registre D-6 : répondre « conflit de clé »
 * à un acteur d'un autre locataire lui apprendrait que cette clé existe, ce qui
 * est déjà une divulgation (L123 : `NOT_FOUND` sans donnée métier divulguée).
 */
export function applyOperation(
  state: ReservationOracleState,
  operation: ReservationOperation,
): ReservationOracleState {
  const s = requireState(state as unknown)
  const op = validateOperation(operation as unknown)

  if (op.tenant !== s.tenant) {
    throw new ReservationRejection(
      'NOT_FOUND',
      '/operation/tenant',
      'aucune donnée accessible sous ce locataire',
    )
  }

  const fingerprint = fingerprintOf(op)
  const known = s.effects.find((e) => e.key === op.idempotency_key)
  if (known !== undefined) {
    // Rejeu à arguments identiques : l'appel ABOUTIT et ne produit aucun effet.
    if (known.fingerprint === fingerprint) return { ...s }
    throw new ReservationRejection(
      'CONFLICT',
      '/operation/idempotency_key',
      "clé d'opération déjà appliquée avec une empreinte d'entrée différente",
    )
  }

  if (!s.actors.includes(op.actor)) {
    throw new ReservationRejection('NOT_FOUND', '/operation/actor', 'acteur inconnu de ce locataire')
  }
  const slot = s.slots.find((x) => x.id === op.slot)
  if (slot === undefined) {
    throw new ReservationRejection('SLOT_UNKNOWN', '/operation/slot', 'créneau non déclaré au setup')
  }

  const next = op.kind === 'reserve' ? admit(s, op, slot) : cancel(s, op, slot)
  return { ...next, effects: [...next.effects, { key: op.idempotency_key, fingerprint }] }
}
