// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — modèle attendu du scénario F-LONG (tâche T61, ADR-018).
//
// CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS.
//
//   `replayFLong()` est un rejeu ENTIER et DÉTERMINISTE, SANS ARGUMENT, du
//   scénario F-LONG tel qu'ADR-018 l'énonce (lignes 77-159) : douze périodes,
//   P1 à P4 reprenant F-RESERVATION (cahier §F) à l'identique, P5 à P12
//   ajoutant, remplaçant et retirant des règles. Il rend un tableau de douze
//   enregistrements `{ period, active_rules, facts }` — la forme que fixe
//   acceptance/T61.spec.ts (section III), puisqu'aucun énoncé de contrat
//   n'existe encore (le contrat `bench.candidate/3` est l'objet de T62).
//
//   Ce n'est PAS le contrat que recevra le candidat (T62), ni un état qui
//   dure à travers un redémarrage de processus (T63, `BENCH_DATA_DIR`) : c'est
//   un module interne, pur, sans aucune E/S, qui calcule les faits attendus.
//
// ────────────────────────────────────────────────────────────── déterminisme
// Comme `machine.ts` (T07) : aucune horloge ambiante (`Date.now()` n'apparaît
// nulle part — chaque opération porte son propre instant littéral, tiré
// d'ADR-018), aucun identifiant aléatoire, et la file est ordonnée par séquence
// d'admission explicite (`rank`), jamais par égalité possible de timestamps.
//
// Les deux probes de frontière (P3, P9) s'appliquent à des CLONES jetables de
// l'état (`FLongEngine.clone()`) : elles ne modifient jamais la trajectoire
// principale, exactement comme les clones P3 de F-RESERVATION (cahier L123).
//
// ─────────────────────────────────────────────────────── règles réutilisées
// La frontière des 24 heures de `cancel@2` (P3-P6) réutilise
// `isCancellationAllowed` de `machine.ts` (T07, déjà prouvé à HEAD) plutôt que
// de dupliquer ce calcul : même règle, même code.
// ─────────────────────────────────────────────────────────────────────────────

import { isCancellationAllowed } from './machine.js'

/* ───────────────────────────────────────────────────────────────── types */

type Level = 'standard' | 'gold'
type Status = 'confirmed' | 'waiting' | 'cancelled'
type CancelRuleVersion = 'v1' | 'v2' | 'v3' | 'v4'
type QueueMode = 'fifo' | 'priority'

interface SlotDef {
  readonly id: string
  readonly tenant: string
  capacity: number
  readonly start: string
  readonly price: number
}

interface HistoryEvent {
  readonly event: string
  readonly status: Status
}

interface ReservationRec {
  readonly id: string
  readonly originTenant: string
  tenant: string
  readonly actor: string
  readonly slot: string
  status: Status
  readonly rank: number
  demoteRank: number
  history: HistoryEvent[]
}

export interface PeriodRecord {
  readonly period: string
  readonly active_rules: readonly string[]
  readonly facts: Readonly<Record<string, unknown>>
}

/* ──────────────────────────────────────────────────────────── le moteur */

class FLongEngine {
  reservations: ReservationRec[] = []
  slots: Map<string, SlotDef> = new Map()
  tenants: Set<string> = new Set()
  balances: Map<string, number> = new Map()
  levels: Map<string, Level> = new Map()
  seq = 0
  demoteCounter = 0
  cancelRule: CancelRuleVersion = 'v1'
  priceActive = false
  quotaActive = false
  historyActive = false
  queueMode: QueueMode = 'fifo'

  nextSeq(): number {
    this.seq += 1
    return this.seq
  }

  nextDemote(): number {
    this.demoteCounter -= 1
    return this.demoteCounter
  }

  createTenant(id: string): void {
    this.tenants.add(id)
  }

  createSlot(id: string, tenant: string, capacity: number, start: string, price: number): void {
    this.slots.set(id, { id, tenant, capacity, start, price })
  }

  levelOf(actor: string): Level {
    return this.levels.get(actor) ?? 'standard'
  }

  setLevel(actor: string, level: Level): void {
    this.levels.set(actor, level)
  }

  balance(actor: string): number {
    return this.balances.get(actor) ?? 0
  }

  addBalance(actor: string, delta: number): void {
    this.balances.set(actor, this.balance(actor) + delta)
  }

  /** Clone jetable : utilisé par les probes de frontière P3 et P9, jamais par la trajectoire principale. */
  clone(): FLongEngine {
    const c = new FLongEngine()
    c.reservations = this.reservations.map((r) => ({ ...r, history: r.history.map((h) => ({ ...h })) }))
    c.slots = new Map(this.slots)
    c.tenants = new Set(this.tenants)
    c.balances = new Map(this.balances)
    c.levels = new Map(this.levels)
    c.seq = this.seq
    c.demoteCounter = this.demoteCounter
    c.cancelRule = this.cancelRule
    c.priceActive = this.priceActive
    c.quotaActive = this.quotaActive
    c.historyActive = this.historyActive
    c.queueMode = this.queueMode
    return c
  }
}

function levelWeight(level: Level): number {
  return level === 'gold' ? 1 : 0
}

/**
 * Ordre de file. En mode `fifo` (fifo@1, fifo@2), un acteur rétrogradé par
 * une réduction de capacité (`demoteRank` fini, négatif) passe devant la file
 * ordinaire (`demoteRank` infini) — ADR-018:L93-94 (« la réduire sous le
 * nombre de confirmés rétrograde les confirmés les plus récents [...] en
 * tête de la file d'attente »). En mode `priority` (priority@1), le niveau
 * (`gold` d'abord) DOMINE cette mémoire de rétrogradation : ADR-018:L100-105
 * dit que priority@1 REMPLACE fifo@1, pas qu'elle le complète, et le
 * « changement de niveau réordonne immédiatement les files existantes »
 * (P6 : E passe devant D malgré la rétrogradation de D en P5). Dans les deux
 * modes, la séquence d'admission (`rank`) départage le reste.
 */
function compareWaiting(e: FLongEngine, a: ReservationRec, b: ReservationRec): number {
  if (e.queueMode === 'fifo') {
    if (a.demoteRank !== b.demoteRank) return a.demoteRank - b.demoteRank
    return a.rank - b.rank
  }
  const wa = levelWeight(e.levelOf(a.actor))
  const wb = levelWeight(e.levelOf(b.actor))
  if (wa !== wb) return wb - wa
  return a.rank - b.rank
}

/* ──────────────────────────────────────────────────── fuseau horaire Paris */

const PARIS_TZ = 'Europe/Paris'

interface LocalParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

function getTZParts(ms: number, timeZone: string): LocalParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(ms))
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type)
    if (p === undefined) throw new Error(`partie de date absente : ${type}`)
    return Number(p.value)
  }
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

function tzOffsetMinutes(ms: number, timeZone: string): number {
  const p = getTZParts(ms, timeZone)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUTC - ms) / 60_000)
}

/** Instant UTC d'une heure locale donnée, par deux passes (suffisant hors de l'instant même d'une transition DST). */
function localToUTC(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  const offset1 = tzOffsetMinutes(guess, timeZone)
  let utc = guess - offset1 * 60_000
  const offset2 = tzOffsetMinutes(utc, timeZone)
  if (offset2 !== offset1) utc = guess - offset2 * 60_000
  return utc
}

/**
 * ADR-018:L125-133 (`cancel@4`) — échéance de remboursement intégral : 18:00
 * heure locale du locataire, la veille du JOUR LOCAL du début du créneau.
 */
function parisDeadlineBeforeUTC(slotStartISO: string): number {
  const startMs = Date.parse(slotStartISO)
  const local = getTZParts(startMs, PARIS_TZ)
  const dayBefore = new Date(Date.UTC(local.year, local.month - 1, local.day - 1))
  return localToUTC(dayBefore.getUTCFullYear(), dayBefore.getUTCMonth() + 1, dayBefore.getUTCDate(), 18, 0, 0, PARIS_TZ)
}

function parisDeadlineRefund(atISO: string, slotStartISO: string, price: number): number {
  return Date.parse(atISO) <= parisDeadlineBeforeUTC(slotStartISO) ? price : 0
}

/** ADR-018:L110-111 — 100% à 48h ou plus, 50% arrondi au centime inférieur entre 24 et 48h, 0% en deça. */
function tieredRefund(atISO: string, slotStartISO: string, price: number): number {
  const hoursBefore = (Date.parse(slotStartISO) - Date.parse(atISO)) / 3_600_000
  if (hoursBefore >= 48) return price
  if (hoursBefore >= 24) return Math.floor(price * 0.5)
  return 0
}

/* ───────────────────────────────────────────────────────── transitions */

type ReserveResult =
  | { readonly kind: 'OK'; readonly reservation: ReservationRec; readonly duplicate: boolean }
  | { readonly kind: 'QUOTA_EXCEEDED' }

type CancelResult =
  | { readonly kind: 'OK'; readonly refund: number }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'CANCELLATION_TOO_LATE' }

function requireSlot(e: FLongEngine, slotId: string): SlotDef {
  const slot = e.slots.get(slotId)
  if (slot === undefined) throw new Error(`créneau inconnu : ${slotId}`)
  return slot
}

/**
 * Admet un acteur sur un créneau. Idempotent au niveau acteur×créneau : une
 * seconde admission du MÊME acteur sur le MÊME créneau, alors qu'il détient
 * déjà une réservation active, n'est aucun effet nouveau — le rejeu de §F P1
 * (« rejeu de sa clé idempotente sans doublon »).
 */
function reserve(e: FLongEngine, actor: string, slotId: string, at: string): ReserveResult {
  const slot = requireSlot(e, slotId)
  const existing = e.reservations.find((r) => r.slot === slotId && r.actor === actor && r.status !== 'cancelled')
  if (existing !== undefined) return { kind: 'OK', reservation: existing, duplicate: true }

  if (e.quotaActive) {
    const confirmedCount = e.reservations.filter(
      (r) => r.tenant === slot.tenant && r.actor === actor && r.status === 'confirmed',
    ).length
    // ADR-018:L118-120 — « refusée [...] sans attente ni débit » : aucun enregistrement n'est créé.
    if (confirmedCount >= 2) return { kind: 'QUOTA_EXCEEDED' }
  }

  const rank = e.nextSeq()
  const rec: ReservationRec = {
    id: `R${String(rank)}`,
    originTenant: slot.tenant,
    tenant: slot.tenant,
    actor,
    slot: slotId,
    status: 'waiting',
    rank,
    demoteRank: Number.POSITIVE_INFINITY,
    history: [],
  }
  // Toute admission entre par la file ; seule `refill` confirme (même lecture que machine.ts, T07).
  e.reservations.push(rec)
  refill(e, slotId)
  void at
  return { kind: 'OK', reservation: rec, duplicate: false }
}

function cancel(e: FLongEngine, actor: string, slotId: string, at: string): CancelResult {
  const rec = e.reservations.find((r) => r.slot === slotId && r.actor === actor && r.status !== 'cancelled')
  if (rec === undefined) return { kind: 'NOT_FOUND' }
  const slot = requireSlot(e, slotId)

  let allowed: boolean
  let refund = 0
  if (e.cancelRule === 'v1') {
    allowed = true // cancel@1 : aucune restriction (P1-P2)
  } else if (e.cancelRule === 'v2') {
    allowed = isCancellationAllowed(at, slot.start, 24, true) // cancel@2 : 24h, frontière incluse
  } else if (e.cancelRule === 'v3') {
    allowed = true // cancel@3 : permise jusqu'au début, avec remboursement dégressif
    refund = tieredRefund(at, slot.start, slot.price)
  } else {
    allowed = true // cancel@4 : permise jusqu'au début, échéance Europe/Paris
    refund = parisDeadlineRefund(at, slot.start, slot.price)
  }
  if (!allowed) return { kind: 'CANCELLATION_TOO_LATE' }

  const wasConfirmed = rec.status === 'confirmed'
  rec.status = 'cancelled'
  if (e.historyActive) rec.history.push({ event: 'cancelled', status: 'cancelled' })
  if (e.priceActive && wasConfirmed && refund > 0) e.addBalance(actor, refund)
  refill(e, slotId)
  return { kind: 'OK', refund }
}

/** Remplit le créneau depuis la file, par ordre de `compareWaiting`, jusqu'à sa capacité. */
function refill(e: FLongEngine, slotId: string): void {
  const slot = e.slots.get(slotId)
  if (slot === undefined) return
  const confirmedCount = e.reservations.filter((r) => r.slot === slotId && r.status === 'confirmed').length
  let free = slot.capacity - confirmedCount
  if (free <= 0) return

  const queue = e.reservations
    .filter((r) => r.slot === slotId && r.status === 'waiting')
    .sort((a, b) => compareWaiting(e, a, b))

  for (const r of queue) {
    if (free <= 0) break
    r.status = 'confirmed'
    r.demoteRank = Number.POSITIVE_INFINITY
    if (e.historyActive) r.history.push({ event: 'confirmed', status: 'confirmed' })
    if (e.priceActive && slot.price > 0) e.addBalance(r.actor, -slot.price)
    free -= 1
  }
}

/**
 * ADR-018:L92-94 — augmenter promeut dans l'ordre de la file ; réduire sous
 * le nombre de confirmés rétrograde les confirmés les plus récents (séquence
 * d'admission décroissante) EN TÊTE de la file d'attente.
 */
function setCapacity(e: FLongEngine, slotId: string, newCapacity: number): void {
  const slot = requireSlot(e, slotId)
  const old = slot.capacity
  e.slots.set(slotId, { ...slot, capacity: newCapacity })

  if (newCapacity > old) {
    refill(e, slotId)
    return
  }
  if (newCapacity < old) {
    const confirmed = e.reservations
      .filter((r) => r.slot === slotId && r.status === 'confirmed')
      .sort((a, b) => b.rank - a.rank) // le plus récemment admis d'abord
    let excess = confirmed.length - newCapacity
    for (const r of confirmed) {
      if (excess <= 0) break
      r.status = 'waiting'
      r.demoteRank = e.nextDemote()
      excess -= 1
    }
  }
}

/** ADR-018:L149-153 — transfert à l'initiative du locataire d'origine ; l'origine est conservée (tombstone), jamais effacée. */
function transferReservation(e: FLongEngine, actor: string, slotId: string, toTenant: string): void {
  const rec = e.reservations.find((r) => r.slot === slotId && r.actor === actor && r.status !== 'cancelled')
  if (rec === undefined) throw new Error('rien à transférer')
  rec.tenant = toTenant
}

/**
 * Lecture intertenant. Trois issues, jamais deux : le locataire COURANT voit
 * le statut réel ; le locataire D'ORIGINE d'une réservation transférée au
 * loin voit une valeur nulle (il sait qu'elle est partie, sans la divulguer) ;
 * tout AUTRE locataire reçoit `NOT_FOUND`, sans donnée métier divulguée
 * (cahier L123, repris par ADR-018 pour `transfer@1`).
 */
function readStatus(e: FLongEngine, queryTenant: string, actor: string, slotId: string): string | null {
  const rec = e.reservations.find((r) => r.slot === slotId && r.actor === actor)
  if (rec === undefined) return 'NOT_FOUND'
  if (rec.tenant === queryTenant) return rec.status
  if (rec.originTenant === queryTenant) return null
  return 'NOT_FOUND'
}

function ownerOf(e: FLongEngine, slotId: string): string | undefined {
  return e.reservations.find((r) => r.slot === slotId && r.status === 'confirmed')?.actor
}

function statusOf(e: FLongEngine, slotId: string, actor: string): string | undefined {
  return e.reservations.find((r) => r.slot === slotId && r.actor === actor)?.status
}

function waitingOrderOf(e: FLongEngine, slotId: string): string[] {
  return e.reservations
    .filter((r) => r.slot === slotId && r.status === 'waiting')
    .sort((a, b) => compareWaiting(e, a, b))
    .map((r) => r.actor)
}

function countConfirmed(e: FLongEngine, slotId: string): number {
  return e.reservations.filter((r) => r.slot === slotId && r.status === 'confirmed').length
}

/** ADR-018:L136-139 — chaque réservation existante à l'entrée de P10 commence par un unique événement `migrated`. */
function migrateHistory(e: FLongEngine): void {
  for (const r of e.reservations) {
    if (r.history.length === 0) r.history.push({ event: 'migrated', status: r.status })
  }
}

/* ────────────────────────────────────────────────── le scénario F-LONG */

function buildFLong(): PeriodRecord[] {
  const e = new FLongEngine()
  e.createTenant('legacy')
  e.createSlot('S1', 'legacy', 1, '2030-01-03T12:00:00Z', 0)

  // ADR-018:L61-65, L86 — l'ensemble initial de P1-P2.
  const rules = new Set<string>(['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'])
  const out: PeriodRecord[] = []
  const snap = (period: string, facts: Readonly<Record<string, unknown>>): void => {
    out.push({ period, active_rules: [...rules], facts })
  }

  /* ─────────────────────────────────────────────────────────────── P1 */
  const P1 = '2030-01-01T00:00:00Z'
  reserve(e, 'A', 'S1', P1) // confirmé (capacité libre)
  reserve(e, 'A', 'S1', P1) // rejeu idempotent : même acteur, même créneau
  reserve(e, 'B', 'S1', P1) // file (créneau plein)
  snap('P1', {
    s1_owner: ownerOf(e, 'S1'),
    s1_status: statusOf(e, 'S1', 'A'),
    duplicate_idempotent_no_dup: countConfirmed(e, 'S1') === 1,
    b_rejected_no_overbooking: ownerOf(e, 'S1') === 'A' && statusOf(e, 'S1', 'B') === 'waiting',
  })

  /* ─────────────────────────────────────────────────────────────── P2 */
  const P2 = '2030-01-01T01:00:00Z'
  cancel(e, 'A', 'S1', P2) // sous cancel@1 : aucune restriction -> B promu
  reserve(e, 'C', 'S1', P2) // créneau à nouveau plein (B confirmé) -> C en file
  snap('P2', {
    s1_owner: ownerOf(e, 'S1'),
    s1_status: statusOf(e, 'S1', 'B'),
    waiting_order: waitingOrderOf(e, 'S1'),
  })

  /* ─────────────────────────────────────────────────────────────── P3 */
  // ADR-018:L86-87 — cancel@1 remplacée par cancel@2 (24h, frontière incluse).
  rules.delete('cancel@1')
  rules.add('cancel@2')
  e.cancelRule = 'v2'
  const boundary = '2030-01-02T12:00:00Z' // 24h avant le début de S1 (2030-01-03T12:00Z)
  const afterBoundary = '2030-01-02T12:00:00.001Z'
  const cloneAtBoundary = e.clone()
  const probe1 = cancel(cloneAtBoundary, 'B', 'S1', boundary)
  const cloneAfterBoundary = e.clone()
  const probe2 = cancel(cloneAfterBoundary, 'B', 'S1', afterBoundary)
  snap('P3', {
    clone_at_boundary_allowed: probe1.kind === 'OK',
    clone_at_boundary_new_owner: ownerOf(cloneAtBoundary, 'S1'),
    clone_after_boundary_allowed: probe2.kind === 'OK',
  })

  /* ─────────────────────────────────────────────────────────────── P4 */
  // ADR-018:L86-89 — isolation@1 s'ajoute ; création du locataire `other`.
  e.createTenant('other')
  rules.add('isolation@1')
  snap('P4', {
    base_a_status: statusOf(e, 'S1', 'A'),
    base_b_status: statusOf(e, 'S1', 'B'),
    base_c_status: statusOf(e, 'S1', 'C'),
    other_tenant_read_legacy_s1: readStatus(e, 'other', 'B', 'S1'),
  })

  /* ─────────────────────────────────────────────────────────────── P5 */
  // ADR-018:L91-98 — capacity@1.
  rules.add('capacity@1')
  const P5 = '2030-01-03T00:00:00Z'
  e.createSlot('S2', 'legacy', 1, '2030-01-10T12:00:00Z', 0)
  reserve(e, 'A', 'S2', P5) // confirmé
  reserve(e, 'D', 'S2', P5) // en attente
  setCapacity(e, 'S2', 2) // D confirmé
  reserve(e, 'E', 'S2', P5) // en attente
  setCapacity(e, 'S2', 1) // D rétrogradé en tête de file
  snap('P5', {
    s2_capacity_final: e.slots.get('S2')?.capacity,
    s2_owner: ownerOf(e, 'S2'),
    s2_waiting_order: waitingOrderOf(e, 'S2'),
  })

  /* ─────────────────────────────────────────────────────────────── P6 */
  // ADR-018:L100-105 — fifo@1 remplacée par priority@1.
  rules.delete('fifo@1')
  rules.add('priority@1')
  e.queueMode = 'priority'
  const P6 = '2030-01-04T00:00:00Z'
  e.setLevel('E', 'gold') // réordonne la file de S2 : E devant D
  cancel(e, 'A', 'S2', P6) // -> E promu
  snap('P6', {
    s2_owner: ownerOf(e, 'S2'),
    s2_waiting_order: waitingOrderOf(e, 'S2'),
    s2_a_status: statusOf(e, 'S2', 'A'),
  })

  /* ─────────────────────────────────────────────────────────────── P7 */
  // ADR-018:L107-116 — price@1 ; cancel@2 remplacée par cancel@3.
  rules.delete('cancel@2')
  rules.add('cancel@3')
  rules.add('price@1')
  e.cancelRule = 'v3'
  e.priceActive = true
  e.createSlot('S3', 'legacy', 1, '2030-01-06T12:00:00Z', 1999)
  const P7_B = '2030-01-05T00:00:00Z' // 36h avant le début de S3
  reserve(e, 'B', 'S3', P7_B)
  const refundB = cancel(e, 'B', 'S3', P7_B) // 36h avant -> 50%
  const P7_C = '2030-01-06T00:00:00Z' // 12h avant le début de S3
  reserve(e, 'C', 'S3', P7_C)
  const refundC = cancel(e, 'C', 'S3', P7_C) // 12h avant, refusé sous cancel@2, permis sous cancel@3
  snap('P7', {
    b_refund: refundB.kind === 'OK' ? refundB.refund : 0,
    c_refund: refundC.kind === 'OK' ? refundC.refund : 0,
    c_cancel_allowed: refundC.kind === 'OK',
    balance_B: e.balance('B'),
    balance_C: e.balance('C'),
  })

  /* ─────────────────────────────────────────────────────────────── P8 */
  // ADR-018:L118-123 — quota@1.
  rules.add('quota@1')
  e.quotaActive = true
  const P8 = '2030-01-07T00:00:00Z'
  e.createSlot('S4', 'legacy', 5, '2030-01-20T12:00:00Z', 0)
  e.createSlot('S5', 'legacy', 5, '2030-01-20T12:00:00Z', 0)
  e.createSlot('S6', 'legacy', 5, '2030-01-20T12:00:00Z', 0)
  reserve(e, 'D', 'S4', P8) // confirmé — 1 confirmée
  reserve(e, 'D', 'S5', P8) // confirmé — 2 confirmées (l'attente sur S2 ne compte pas)
  const d_s6 = reserve(e, 'D', 'S6', P8) // QUOTA_EXCEEDED
  snap('P8', {
    d_s4_status: statusOf(e, 'S4', 'D'),
    d_s5_status: statusOf(e, 'S5', 'D'),
    d_s6_result: d_s6.kind,
    d_s6_waiting: d_s6.kind === 'OK' && d_s6.reservation.status === 'waiting',
    d_s6_debited: false,
  })

  /* ─────────────────────────────────────────────────────────────── P9 */
  // ADR-018:L125-133 — cancel@3 remplacée par cancel@4 (échéance Europe/Paris).
  rules.delete('cancel@3')
  rules.add('cancel@4')
  e.cancelRule = 'v4'
  const P9 = '2030-03-30T12:00:00Z'
  e.createSlot('S7', 'legacy', 1, '2030-03-31T10:00:00Z', 3000)
  reserve(e, 'F', 'S7', P9) // F reste confirmé sur la trajectoire principale : les deux annulations ne s'appliquent qu'à des clones
  const cloneDeadline = e.clone()
  const probeDeadline = cancel(cloneDeadline, 'F', 'S7', '2030-03-30T17:00:00Z')
  const cloneAfterDeadline = e.clone()
  const probeAfterDeadline = cancel(cloneAfterDeadline, 'F', 'S7', '2030-03-30T17:00:00.001Z')
  snap('P9', {
    refund_at_deadline: probeDeadline.kind === 'OK' ? probeDeadline.refund : 0,
    refund_after_deadline: probeAfterDeadline.kind === 'OK' ? probeAfterDeadline.refund : 0,
  })

  /* ────────────────────────────────────────────────────────────── P10 */
  // ADR-018:L135-140 — history@1.
  rules.add('history@1')
  e.historyActive = true
  migrateHistory(e)
  e.setLevel('H', 'gold') // « H passé gold en P10, quand les niveaux comptaient encore » (ADR-018:L145)
  const eOnS2 = e.reservations.find((r) => r.slot === 'S2' && r.actor === 'E')
  const firstEvent = eOnS2?.history[0]
  snap('P10', {
    e_s2_history_first_event: firstEvent?.event,
    e_s2_history_first_status: firstEvent?.status,
  })

  /* ────────────────────────────────────────────────────────────── P11 */
  // ADR-018:L142-147 — priority@1 remplacée par fifo@2 ; quota@1 retiré.
  rules.delete('priority@1')
  rules.add('fifo@2')
  rules.delete('quota@1')
  e.queueMode = 'fifo'
  e.quotaActive = false
  const P11 = '2030-04-02T00:00:00Z'
  e.createSlot('S8', 'legacy', 1, P11, 0)
  reserve(e, 'F', 'S8', P11) // confirmé
  reserve(e, 'G', 'S8', P11) // en attente — standard
  reserve(e, 'H', 'S8', P11) // en attente — gold, mais fifo@2 ignore les niveaux
  const d_s6_retry = reserve(e, 'D', 'S6', P11) // quota retiré -> confirmé
  snap('P11', {
    s8_owner: ownerOf(e, 'S8'),
    s8_waiting_order: waitingOrderOf(e, 'S8'),
    d_s6_status: d_s6_retry.kind === 'OK' ? d_s6_retry.reservation.status : d_s6_retry.kind,
  })

  /* ────────────────────────────────────────────────────────────── P12 */
  // ADR-018:L149-155 — transfer@1.
  rules.add('transfer@1')
  const P12 = '2030-04-03T00:00:00Z'
  e.createTenant('third')
  transferReservation(e, 'B', 'S1', 'other')
  void P12
  snap('P12', {
    b_s1_from_other: readStatus(e, 'other', 'B', 'S1'),
    b_s1_from_legacy: readStatus(e, 'legacy', 'B', 'S1'),
    b_s1_from_third: readStatus(e, 'third', 'B', 'S1'),
  })

  return out
}

/**
 * Rejoue ENTIÈREMENT le scénario F-LONG (ADR-018) et rend les douze
 * enregistrements de période. Pur, déterministe, sans E/S — acceptance/T61
 * section III.
 */
export function replayFLong(): PeriodRecord[] {
  return buildFLong()
}
