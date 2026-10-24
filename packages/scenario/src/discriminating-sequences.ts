// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — T68, ADR-019 decision 3 (L87-91) et carte L100-L106 : des
// sequences par regle qui EXERCENT cette regle sur le contrat
// `bench.candidate/4` — elles appellent les operations qu'elle introduit et
// placent ses frontieres (prix, echeances, quotas, ordre de file, fuseau
// Europe/Paris, transfert) la ou une implementation qui l'ignore se trompe.
//
// TROIS PIECES, TOUTES PURES (aucune E/S, aucun processus : meme contrainte que
// le reste de `@bench/scenario`, voir `./index.ts`) :
//
//   1. `fLongTrajectoryV4(period)` — la trajectoire principale de F-LONG
//      (ADR-018 L77-155) traduite en operations `bench.candidate/4`, periode
//      par periode, creneaux crees par `create_slot` (ADR-019 decision 1 :
//      « a partir de P1, la trajectoire principale cree chaque creneau par
//      create_slot »). Le notateur (`@bench/activities#scoreDiscriminatingRule`)
//      la rejoue contre BENCH_DATA_DIR avant d'appliquer les sequences a des
//      COPIES de l'etat (ADR-018 decisions 2 et 3).
//
//   2. `ExpectedModelV4` — le modele attendu qui juge chaque etape d'une
//      sequence. Les ensembles de regles par periode viennent du modele
//      attendu de T61/T67 (`@bench/oracle#replayFLong`, `active_rules`) ; les
//      regles elles-memes suivent ADR-018 (P5-P12) et les huit points
//      d'ADR-019 (decision 2). Le moteur `FLongEngine` de `@bench/oracle`
//      n'est pas exporte (il ne rejoue que le recit fixe de F-LONG) : ce
//      modele-ci en est la generalisation a des sequences arbitraires, sur le
//      contrat v4. Les faits de la trajectoire principale que certaines
//      sequences relisent (historique `migrated` de E sur S2, transfert de B
//      sur S1) sont pris TELS QUELS dans `replayFLong()`, jamais recalcules.
//
//   3. `generateDiscriminatingSequences({rule, period, seed, contract})` — le
//      lot (20 sequences, ADR-018 L202) d'une regle active a partir de P5.
//      Chaque sequence porte ses etapes `{id, op, args}` et, pour chacune,
//      l'OBSERVABLE attendu calcule par le modele.
//
// CE QUE LES ATTENTES JUGENT, ET CE QU'ELLES NE JUGENT PAS. Seuls des
// observables fixes par ADR-018/ADR-019 (et par le contrat public) :
//   - la decision d'une reservation (`confirmed` / `waiting`) ;
//   - les codes d'erreur `QUOTA_EXCEEDED`, `CANCELLATION_TOO_LATE`,
//     `NOT_FOUND` ;
//   - le statut lu par `read` et la `waiting_position` d'une attente ; la
//     valeur nulle lue depuis le locataire d'origine apres transfert ;
//   - les soldes (`balance`), seul canal du remboursement juge ici ;
//   - la forme EXACTE `{type, status, at}` des evenements d'historique, leur
//     presence, et le premier evenement `migrated` d'une reservation existant
//     a l'entree de P10.
// JAMAIS : la `decision` rendue par `set_capacity`, `set_level`, `transfer`,
// `create_slot`, `probe_cancel` ou par une annulation (aucun ADR ne fixe ces
// libelles ; seul le succes ou le code d'erreur compte), le libelle d'un
// evenement d'historique autre que `migrated`, la valeur de `at`, ni les
// champs supplementaires de `read` (p.ex. `slot_id`).
//
// ISOLEMENT DES SEQUENCES. Chaque sequence cree ses propres locataires, ses
// creneaux et ses acteurs, nommes a partir d'un hachage de (graine, regle,
// periode, indice) : elle ne depend de l'etat de la trajectoire que par
// l'horloge (donc l'ensemble de regles de la periode), sauf les relectures
// explicites de faits de `replayFLong()` ci-dessus. Les instants choisis
// restent dans la fenetre de la periode (aucune sequence n'avance l'horloge
// jusqu'a la periode suivante).
// ─────────────────────────────────────────────────────────────────────────────
import { replayFLong } from '@bench/oracle'

/** Contrat sur lequel ces sequences sont ecrites (ADR-019 decision 1). */
export const DISCRIMINATING_SEQUENCES_CONTRACT = 'bench.candidate/4'

/** ADR-018:L202 — « le lot de chaque regle compte au moins 20 sequences ». */
export const DISCRIMINATING_MIN_BATCH_SIZE = 20

const PERIOD_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const
type PeriodId = (typeof PERIOD_IDS)[number]

type Status = 'confirmed' | 'waiting' | 'cancelled'

/* ═══════════════════════════════════════════════════ formes publiques ═══ */

/** Une etape : une requete du contrat `bench.candidate/4`. */
export interface SequenceStep {
  readonly id: string
  readonly op: string
  readonly args: Readonly<Record<string, unknown>>
}

/** L'observable attendu d'une etape — uniquement ce qu'un ADR fixe (voir l'en-tete). */
export type StepExpectation =
  | { readonly kind: 'ok' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'decision'; readonly decision: 'confirmed' | 'waiting' }
  | { readonly kind: 'value'; readonly value: null | { readonly status: Status; readonly waiting_position?: number } }
  | { readonly kind: 'balance'; readonly balance: number }
  | { readonly kind: 'events'; readonly first?: { readonly type: string; readonly status: Status } }

/**
 * T69 (ADR-020 decisions 1-2) — les NOMS DE CHAMPS de reponse que le notateur
 * lit (`@bench/activities#judgeStep`) et que le contrat d'interface de chaque
 * periode cite (`describeFLongInterfaceContractV4`) : une seule source, jamais
 * une seconde liste ecrite a la main.
 */
export const F_LONG_V4_RESPONSE_FIELDS = Object.freeze({
  decision: 'decision',
  value: 'value',
  status: 'status',
  waitingPosition: 'waiting_position',
  balance: 'balance',
  events: 'events',
  eventType: 'type',
  eventStatus: 'status',
  eventAt: 'at',
  errorCode: 'code',
  errorMessage: 'message',
} as const)

/** Statuts qu'une reservation peut porter (lus par `read`, portes par chaque evenement d'historique). */
export const F_LONG_V4_STATUSES: readonly Status[] = Object.freeze(['confirmed', 'waiting', 'cancelled'] as const)

export interface DiscriminatingSequence {
  readonly contract: typeof DISCRIMINATING_SEQUENCES_CONTRACT
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly index: number
  /** La frontiere placee par cette sequence, en clair (diagnostic). */
  readonly boundary: string
  readonly steps: readonly SequenceStep[]
  /** `expect[i]` juge `steps[i]`. */
  readonly expect: readonly StepExpectation[]
}

export interface GenerateDiscriminatingSequencesInput {
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly count?: number
  readonly contract?: string
  readonly protocol?: string
}

export interface GenerateDiscriminatingSequencesResult {
  readonly contract: typeof DISCRIMINATING_SEQUENCES_CONTRACT
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly sequences: readonly DiscriminatingSequence[]
}

/* ═══════════════════════════════════ regles par periode (T61/T67) ═══════ */

let rulesCache: Map<string, readonly string[]> | null = null

/** Ensemble de regles actives d'une periode, tel que le modele attendu de T61/T67 le rend. */
export function activeRulesV4(period: string): readonly string[] {
  if (rulesCache === null) {
    rulesCache = new Map(replayFLong().map((r) => [r.period, [...r.active_rules]]))
  }
  const rules = rulesCache.get(period)
  if (rules === undefined) throw new Error(`periode inconnue de F-LONG : ${period}`)
  return rules
}

function factsOf(period: string): Readonly<Record<string, unknown>> {
  const rec = replayFLong().find((r) => r.period === period)
  if (rec === undefined) throw new Error(`periode inconnue de F-LONG : ${period}`)
  return rec.facts
}

/**
 * T69 — le premier evenement de l'historique d'une reservation existant a
 * l'entree de P10 (fait gele de la trajectoire, ADR-018 P10) : celui que le lot
 * de `history@1` compare, et celui que le contrat d'interface cite.
 */
export function fLongMigratedHistoryFactV4(): { readonly type: string; readonly status: Status } {
  const f = factsOf('P10')
  return { type: String(f['e_s2_history_first_event']), status: String(f['e_s2_history_first_status']) as Status }
}

/* ═══════════════════════════════════ fuseau Europe/Paris (ADR-019 pt 2) ═ */

const PARIS_TZ = 'Europe/Paris'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

interface LocalParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

function parisParts(ms: number): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type)
    if (p === undefined) throw new Error(`partie de date absente : ${type}`)
    return Number(p.value)
  }
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

function parisOffsetMs(ms: number): number {
  const p = parisParts(ms)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** Instant UTC d'une heure locale de Paris (deux passes, hors de l'instant meme d'une transition). */
function parisLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let t = naive - parisOffsetMs(naive)
  t = naive - parisOffsetMs(t)
  return t
}

/** cancel@4 (ADR-018 L125-133, ADR-019 pt 2) : 18:00 heure de Paris, la veille du jour local du creneau. */
function cancel4Deadline(startMs: number): number {
  const p = parisParts(startMs)
  const veille = new Date(Date.UTC(p.year, p.month - 1, p.day - 1))
  return parisLocalToUtc(veille.getUTCFullYear(), veille.getUTCMonth() + 1, veille.getUTCDate(), 18, 0)
}

/** Premier instant >= `fromMs` ou il est 18:00:00 a Paris. */
function nextParis18h(fromMs: number): number {
  const p = parisParts(fromMs)
  for (let d = 0; d < 3; d += 1) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + d))
    const t = parisLocalToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 18, 0)
    if (t >= fromMs) return t
  }
  throw new Error('aucune echeance de 18:00 trouvee')
}

const iso = (ms: number): string => new Date(ms).toISOString()

/* ═════════════════════════ trajectoire principale de F-LONG (contrat v4) ═ */

type TrajectoryOp = { readonly op: string; readonly args: Readonly<Record<string, unknown>> }

function buildTrajectory(): Map<PeriodId, readonly TrajectoryOp[]> {
  let seq = 0
  let key = 0
  const reserve = (actor: string, slot: string, opKey?: string): TrajectoryOp => {
    seq += 1
    key += 1
    return {
      op: 'write',
      args: { op: 'reserve', actor, tenant_id: 'legacy', admission_seq: seq, operation_key: opKey ?? `flong-k${String(key)}`, slot_id: slot },
    }
  }
  const cancel = (actor: string, slot: string): TrajectoryOp => {
    key += 1
    return { op: 'write', args: { op: 'cancel', actor, tenant_id: 'legacy', operation_key: `flong-k${String(key)}`, slot_id: slot } }
  }
  const clock = (to: string): TrajectoryOp => ({ op: 'advance_clock', args: { to } })
  const slot = (id: string, start: string, capacity: number, price: number): TrajectoryOp => ({
    op: 'create_slot',
    args: { tenant_id: 'legacy', slot_id: id, start, capacity, price },
  })
  const t = new Map<PeriodId, readonly TrajectoryOp[]>()

  // P1 — F-RESERVATION : A confirme, rejeu idempotent de A (MEME requete), B en attente.
  const aP1 = reserve('A', 'S1', 'flong-p1-a')
  const bP1 = reserve('B', 'S1')
  t.set('P1', [
    clock('2030-01-01T00:00:00Z'),
    { op: 'create_tenant', args: { tenant_id: 'legacy' } },
    slot('S1', '2030-01-03T12:00:00Z', 1, 0),
    aP1,
    { op: aP1.op, args: { ...aP1.args } },
    bP1,
  ])
  // P2 — A annule (cancel@1), B promu ; C en attente.
  t.set('P2', [clock('2030-01-01T01:00:00Z'), cancel('A', 'S1'), reserve('C', 'S1')])
  // P3 — cancel@2 : les sondes de frontiere vivent sur des copies, pas ici.
  t.set('P3', [clock('2030-01-02T11:00:00Z')])
  // P4 — isolation@1 : locataire `other`.
  t.set('P4', [clock('2030-01-02T13:00:00Z'), { op: 'create_tenant', args: { tenant_id: 'other' } }])
  // P5 — capacity@1 sur S2.
  t.set('P5', [
    clock('2030-01-03T00:00:00Z'),
    slot('S2', '2030-01-10T12:00:00Z', 1, 0),
    reserve('A', 'S2'),
    reserve('D', 'S2'),
    { op: 'set_capacity', args: { tenant_id: 'legacy', slot_id: 'S2', capacity: 2 } },
    reserve('E', 'S2'),
    { op: 'set_capacity', args: { tenant_id: 'legacy', slot_id: 'S2', capacity: 1 } },
  ])
  // P6 — priority@1 : E passe gold ; A annule S2.
  t.set('P6', [
    clock('2030-01-04T00:00:00Z'),
    { op: 'set_level', args: { tenant_id: 'legacy', actor: 'E', level: 'gold' } },
    cancel('A', 'S2'),
  ])
  // P7 — price@1, cancel@3 sur S3.
  t.set('P7', [
    clock('2030-01-05T00:00:00Z'),
    slot('S3', '2030-01-06T12:00:00Z', 1, 1999),
    reserve('B', 'S3'),
    cancel('B', 'S3'),
    clock('2030-01-06T00:00:00Z'),
    reserve('C', 'S3'),
    cancel('C', 'S3'),
  ])
  // P8 — quota@1 : D sur S4, S5 puis S6 (QUOTA_EXCEEDED).
  t.set('P8', [
    clock('2030-01-07T00:00:00Z'),
    slot('S4', '2030-01-20T12:00:00Z', 5, 0),
    slot('S5', '2030-01-20T12:00:00Z', 5, 0),
    slot('S6', '2030-01-20T12:00:00Z', 5, 0),
    reserve('D', 'S4'),
    reserve('D', 'S5'),
    reserve('D', 'S6'),
  ])
  // P9 — cancel@4 : F reserve S7 (les annulations vivent sur des copies).
  t.set('P9', [clock('2030-03-30T12:00:00Z'), slot('S7', '2030-03-31T10:00:00Z', 1, 3000), reserve('F', 'S7')])
  // P10 — history@1 ; H passe gold.
  t.set('P10', [clock('2030-04-01T00:00:00Z'), { op: 'set_level', args: { tenant_id: 'legacy', actor: 'H', level: 'gold' } }])
  // P11 — fifo@2, quota@1 retire : S8 ; D reserve S6.
  t.set('P11', [
    clock('2030-04-02T00:00:00Z'),
    slot('S8', '2030-04-02T00:00:00Z', 1, 0),
    reserve('F', 'S8'),
    reserve('G', 'S8'),
    reserve('H', 'S8'),
    reserve('D', 'S6'),
  ])
  // P12 — transfer@1 : `third` ; B sur S1 transferee de legacy a other.
  t.set('P12', [
    clock('2030-04-03T00:00:00Z'),
    { op: 'create_tenant', args: { tenant_id: 'third' } },
    { op: 'transfer', args: { tenant_id: 'legacy', key: 'B', slot_id: 'S1', to_tenant_id: 'other' } },
  ])
  return t
}

let trajectoryCache: Map<PeriodId, readonly TrajectoryOp[]> | null = null

function trajectory(): Map<PeriodId, readonly TrajectoryOp[]> {
  if (trajectoryCache === null) trajectoryCache = buildTrajectory()
  return trajectoryCache
}

function asPeriod(period: string): PeriodId {
  const p = PERIOD_IDS.find((x) => x === period)
  if (p === undefined) throw new Error(`periode inconnue de F-LONG : ${period}`)
  return p
}

/** Operations de la trajectoire principale d'UNE periode (contrat v4), avec des ids stables. */
export function fLongTrajectoryV4(period: string): readonly SequenceStep[] {
  const p = asPeriod(period)
  const ops = trajectory().get(p) ?? []
  return ops.map((o, i) => ({ id: `flong-${p}-${String(i + 1)}`, op: o.op, args: o.args }))
}

/** T69 — l'horloge a laquelle le notateur juge les sequences d'une periode (fin de sa trajectoire). */
export function fLongScoringClockV4(period: string): number {
  return trajectoryClockAt(asPeriod(period))
}

/** Horloge laissee par la trajectoire principale a la fin d'une periode. */
function trajectoryClockAt(period: PeriodId): number {
  let last = Number.NaN
  for (const p of PERIOD_IDS) {
    for (const o of trajectory().get(p) ?? []) {
      if (o.op === 'advance_clock') last = Date.parse(String(o.args['to']))
    }
    if (p === period) break
  }
  return last
}

/* ═════════════════════════════════════════════════ le modele attendu ═══ */

interface MSlot {
  readonly tid: string
  readonly sid: string
  readonly start: number
  capacity: number
  readonly price: number
  queue: number[]
  pinned: number
}

interface MRes {
  readonly rid: number
  tenant: string
  readonly slotKey: string
  readonly sid: string
  readonly actor: string
  readonly seq: number
  status: Status
  paid: number
  events: number
}

interface MTenant {
  readonly levels: Map<string, string>
  readonly balances: Map<string, number>
}

class Refusal {
  constructor(readonly code: string) {}
}

const QUOTA_MAX_CONFIRMED = 2

/**
 * Modele attendu `bench.candidate/4` pour une periode donnee (regles de
 * `activeRulesV4(period)`), sur des locataires NEUFS. Chaque `apply` rend
 * l'observable attendu de l'etape — jamais une valeur qu'aucun ADR ne fixe.
 */
export class ExpectedModelV4 {
  private readonly rules: ReadonlySet<string>
  private clock: number
  private readonly tenants = new Map<string, MTenant>()
  private readonly slots = new Map<string, MSlot>()
  private readonly reservations: MRes[] = []
  private readonly tombstones = new Set<string>()
  private nextRid = 1

  constructor(period: string, clockMs: number) {
    this.rules = new Set(activeRulesV4(period))
    this.clock = clockMs
  }

  private active(rule: string): boolean {
    return this.rules.has(rule)
  }

  private tenant(tid: unknown): MTenant {
    const t = typeof tid === 'string' ? this.tenants.get(tid) : undefined
    if (t === undefined) throw new Refusal('NOT_FOUND')
    return t
  }

  private slot(tid: string, sid: unknown): MSlot {
    const s = typeof sid === 'string' ? this.slots.get(`${tid}\u0000${sid}`) : undefined
    if (s === undefined) throw new Refusal('NOT_FOUND')
    return s
  }

  private levelOf(r: MRes): string {
    return this.tenants.get(r.tenant)?.levels.get(r.actor) ?? 'standard'
  }

  /** Ordre de file : priority@1 -> niveau puis sequence ; fifo@1/fifo@2 -> sequence. */
  private compare(a: MRes, b: MRes): number {
    if (this.active('priority@1')) {
      const ga = this.levelOf(a) === 'gold' ? 0 : 1
      const gb = this.levelOf(b) === 'gold' ? 0 : 1
      if (ga !== gb) return ga - gb
    }
    return a.seq - b.seq || a.rid - b.rid
  }

  private res(rid: number): MRes {
    const r = this.reservations.find((x) => x.rid === rid)
    if (r === undefined) throw new Error(`reservation inconnue ${String(rid)}`)
    return r
  }

  private confirmedOf(slot: MSlot): MRes[] {
    return this.reservations.filter((r) => r.slotKey === `${slot.tid}\u0000${slot.sid}` && r.status === 'confirmed')
  }

  private confirmedCountOfActor(tid: string, actor: string): number {
    return this.reservations.filter((r) => r.tenant === tid && r.actor === actor && r.status === 'confirmed').length
  }

  private event(r: MRes): void {
    if (this.active('history@1')) r.events += 1
  }

  private confirm(r: MRes, slot: MSlot): void {
    r.status = 'confirmed'
    if (this.active('price@1') && slot.price > 0) {
      const t = this.tenant(r.tenant)
      t.balances.set(r.actor, (t.balances.get(r.actor) ?? 0) - slot.price)
      r.paid += slot.price // ADR-019 pt 4 : le montant effectivement debite
    }
    this.event(r)
  }

  private removeFromQueue(slot: MSlot, rid: number): void {
    const i = slot.queue.indexOf(rid)
    if (i < 0) return
    slot.queue.splice(i, 1)
    if (i < slot.pinned) slot.pinned -= 1
  }

  /** Insere une attente APRES les retrogrades epingles (ADR-019 pt 8), dans l'ordre de la file. */
  private insert(slot: MSlot, r: MRes): void {
    let i = slot.pinned
    while (i < slot.queue.length && this.compare(this.res(slot.queue[i] as number), r) <= 0) i += 1
    slot.queue.splice(i, 0, r.rid)
  }

  /** Promotion dans l'ordre de la file ; sous quota@1, saute l'acteur a deux confirmes (ADR-019 pt 5). */
  private promote(slot: MSlot): void {
    let i = 0
    while (this.confirmedOf(slot).length < slot.capacity && i < slot.queue.length) {
      const r = this.res(slot.queue[i] as number)
      if (this.active('quota@1') && this.confirmedCountOfActor(r.tenant, r.actor) >= QUOTA_MAX_CONFIRMED) {
        i += 1
        continue
      }
      this.removeFromQueue(slot, r.rid)
      this.confirm(r, slot)
    }
  }

  /** capacity@1 : retrograde les confirmes les plus recents, en tete de file, epingles (ADR-018 P5, ADR-019 pt 8). */
  private demote(slot: MSlot): void {
    const conf = this.confirmedOf(slot).sort((a, b) => b.seq - a.seq || b.rid - a.rid)
    const demoted: MRes[] = []
    while (conf.length > slot.capacity) {
      const r = conf.shift() as MRes
      r.status = 'waiting'
      this.event(r)
      demoted.push(r)
    }
    demoted.sort((a, b) => a.seq - b.seq || a.rid - b.rid)
    slot.queue = [...demoted.map((r) => r.rid), ...slot.queue]
    slot.pinned += demoted.length
  }

  /** ADR-019 pt 1 : (tenant_id, key, slot_id) ; la plus recente non annulee, a defaut la plus recente. */
  private designate(tid: string, key: unknown, sid: unknown): MRes | null {
    const cands = this.reservations.filter((r) => r.tenant === tid && r.actor === key && r.sid === sid)
    if (cands.length === 0) return null
    const alive = cands.filter((r) => r.status !== 'cancelled')
    const pool = (alive.length > 0 ? alive : cands).sort((a, b) => b.seq - a.seq || b.rid - a.rid)
    return pool[0] ?? null
  }

  /** ADR-019 pts 3, 4, 6 et ADR-018 cancel@2/@3/@4. */
  private evaluateCancel(r: MRes): { verdict: 'accepted' | 'refused' | 'too_late'; refund: number } {
    const slot = this.slots.get(r.slotKey) as MSlot
    const now = this.clock
    const paid = r.paid
    if (this.active('cancel@1')) return { verdict: 'accepted', refund: paid }
    if (now >= slot.start) return { verdict: 'too_late', refund: 0 }
    if (this.active('cancel@2')) {
      return now <= slot.start - DAY_MS ? { verdict: 'accepted', refund: paid } : { verdict: 'refused', refund: 0 }
    }
    if (this.active('cancel@3')) {
      const before = slot.start - now
      if (before >= 2 * DAY_MS) return { verdict: 'accepted', refund: paid }
      if (before >= DAY_MS) return { verdict: 'accepted', refund: Math.floor(paid / 2) }
      return { verdict: 'accepted', refund: 0 }
    }
    if (this.active('cancel@4')) {
      return { verdict: 'accepted', refund: now <= cancel4Deadline(slot.start) ? paid : 0 }
    }
    return { verdict: 'accepted', refund: paid }
  }

  private position(r: MRes): number {
    const slot = this.slots.get(r.slotKey) as MSlot
    return slot.queue.indexOf(r.rid) + 1
  }

  private valueOf(r: MRes): { status: Status; waiting_position?: number } {
    return r.status === 'waiting' ? { status: r.status, waiting_position: this.position(r) } : { status: r.status }
  }

  apply(step: SequenceStep): StepExpectation {
    try {
      return this.applyOrThrow(step)
    } catch (e) {
      if (e instanceof Refusal) return { kind: 'error', code: e.code }
      throw e
    }
  }

  private applyOrThrow(step: SequenceStep): StepExpectation {
    const a = step.args
    switch (step.op) {
      case 'create_tenant': {
        const tid = String(a['tenant_id'])
        if (!this.tenants.has(tid)) this.tenants.set(tid, { levels: new Map(), balances: new Map() })
        return { kind: 'ok' }
      }
      case 'advance_clock':
        this.clock = Date.parse(String(a['to']))
        return { kind: 'ok' }
      case 'create_slot': {
        const tid = String(a['tenant_id'])
        this.tenant(tid)
        const sid = String(a['slot_id'])
        this.slots.set(`${tid}\u0000${sid}`, {
          tid,
          sid,
          start: Date.parse(String(a['start'])),
          capacity: Number(a['capacity']),
          price: Number(a['price'] ?? 0),
          queue: [],
          pinned: 0,
        })
        return { kind: 'ok' }
      }
      case 'write':
        return a['op'] === 'reserve' ? this.reserve(a) : this.cancel(a)
      case 'read': {
        const tid = String(a['tenant_id'])
        this.tenant(tid)
        const r = this.designate(tid, a['key'], a['slot_id'])
        if (r !== null) return { kind: 'value', value: this.valueOf(r) }
        const visible =
          this.tombstones.has(`${tid}\u0000${String(a['key'])}\u0000${String(a['slot_id'])}`) ||
          this.slots.has(`${tid}\u0000${String(a['slot_id'])}`)
        if (visible) return { kind: 'value', value: null }
        throw new Refusal('NOT_FOUND')
      }
      case 'probe_cancel': {
        const tid = String(a['tenant_id'])
        this.tenant(tid)
        const r = this.designate(tid, a['key'], a['slot_id'])
        if (r === null) throw new Refusal('NOT_FOUND')
        if (r.status === 'cancelled') return { kind: 'ok' }
        if (this.evaluateCancel(r).verdict === 'too_late') throw new Refusal('CANCELLATION_TOO_LATE')
        return { kind: 'ok' }
      }
      case 'set_capacity': {
        const tid = String(a['tenant_id'])
        this.tenant(tid)
        const slot = this.slot(tid, a['slot_id'])
        if (!this.active('capacity@1')) throw new Error('set_capacity hors de capacity@1 : sequence mal formee')
        slot.capacity = Number(a['capacity'])
        if (this.confirmedOf(slot).length > slot.capacity) this.demote(slot)
        else this.promote(slot)
        return { kind: 'ok' }
      }
      case 'set_level': {
        const t = this.tenant(a['tenant_id'])
        t.levels.set(String(a['actor']), String(a['level']))
        if (this.active('priority@1')) {
          // Reordonnance immediate de toutes les files (ADR-018 P6) ; leve l'epinglage (ADR-019 pt 8).
          for (const s of this.slots.values()) {
            s.queue = s.queue.map((rid) => this.res(rid)).sort((x, y) => this.compare(x, y)).map((r) => r.rid)
            s.pinned = 0
          }
        }
        return { kind: 'ok' }
      }
      case 'balance': {
        const t = this.tenant(a['tenant_id'])
        return { kind: 'balance', balance: t.balances.get(String(a['actor'])) ?? 0 }
      }
      case 'history': {
        const tid = String(a['tenant_id'])
        this.tenant(tid)
        const r = this.designate(tid, a['key'], a['slot_id'])
        if (r === null) throw new Refusal('NOT_FOUND')
        if (r.events === 0) throw new Error('historique attendu vide : sequence mal formee')
        return { kind: 'events' }
      }
      case 'transfer': {
        const tid = String(a['tenant_id'])
        this.tenant(tid)
        const r = this.designate(tid, a['key'], a['slot_id'])
        if (r === null) throw new Refusal('NOT_FOUND')
        if (!this.active('transfer@1')) throw new Error('transfer hors de transfer@1 : sequence mal formee')
        const dest = String(a['to_tenant_id'])
        this.tenant(dest)
        this.tombstones.add(`${tid}\u0000${String(a['key'])}\u0000${String(a['slot_id'])}`)
        r.tenant = dest
        this.event(r)
        return { kind: 'ok' }
      }
      default:
        throw new Error(`operation inconnue du modele : ${step.op}`)
    }
  }

  private reserve(a: Readonly<Record<string, unknown>>): StepExpectation {
    const tid = String(a['tenant_id'])
    this.tenant(tid)
    const slot = this.slot(tid, a['slot_id'])
    const actor = String(a['actor'])
    const existing = this.reservations.find(
      (r) => r.slotKey === `${tid}\u0000${slot.sid}` && r.tenant === tid && r.actor === actor && r.status !== 'cancelled',
    )
    if (existing !== undefined) return { kind: 'decision', decision: existing.status === 'confirmed' ? 'confirmed' : 'waiting' }
    if (this.active('quota@1') && this.confirmedCountOfActor(tid, actor) >= QUOTA_MAX_CONFIRMED) {
      throw new Refusal('QUOTA_EXCEEDED') // ADR-018 P8 : sans attente ni debit
    }
    const r: MRes = {
      rid: this.nextRid++,
      tenant: tid,
      slotKey: `${tid}\u0000${slot.sid}`,
      sid: slot.sid,
      actor,
      seq: Number(a['admission_seq']),
      status: 'waiting',
      paid: 0,
      events: 0,
    }
    this.reservations.push(r)
    if (slot.queue.length === 0 && this.confirmedOf(slot).length < slot.capacity) {
      this.confirm(r, slot)
    } else {
      this.insert(slot, r)
      this.event(r)
      this.promote(slot)
    }
    return { kind: 'decision', decision: r.status === 'confirmed' ? 'confirmed' : 'waiting' }
  }

  private cancel(a: Readonly<Record<string, unknown>>): StepExpectation {
    const tid = String(a['tenant_id'])
    this.tenant(tid)
    const r = this.designate(tid, a['actor'], a['slot_id'])
    if (r === null) throw new Refusal('NOT_FOUND')
    if (r.status === 'cancelled') return { kind: 'ok' }
    const { verdict, refund } = this.evaluateCancel(r)
    if (verdict === 'too_late') throw new Refusal('CANCELLATION_TOO_LATE')
    if (verdict === 'refused') return { kind: 'ok' } // refus metier : aucun effet
    const slot = this.slots.get(r.slotKey) as MSlot
    const wasConfirmed = r.status === 'confirmed'
    this.removeFromQueue(slot, r.rid)
    r.status = 'cancelled'
    if (refund > 0) {
      const t = this.tenant(r.tenant)
      t.balances.set(r.actor, (t.balances.get(r.actor) ?? 0) + refund)
    }
    this.event(r)
    if (wasConfirmed) this.promote(slot)
    return { kind: 'ok' }
  }
}

/* ═══════════════════════════════════════════ hasard deterministe ═══════ */

function hash32(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5
  for (const part of parts) {
    const s = `${String(part)}\u0001`
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ═══════════════════════════════════════════ constructeur de sequence ══ */

/** Etape dont l'attendu est un FAIT de la trajectoire (replayFLong), pas un calcul du modele. */
interface FactStep {
  readonly step: SequenceStep
  readonly expect: StepExpectation
}

class SequenceBuilder {
  readonly steps: SequenceStep[] = []
  private readonly facts = new Map<number, StepExpectation>()
  private n = 0
  private admission = 0
  private opKey = 0

  constructor(readonly tag: string) {}

  private push(op: string, args: Record<string, unknown>): void {
    this.n += 1
    this.steps.push({ id: `${this.tag}-${String(this.n)}`, op, args })
  }

  clock(ms: number): void {
    this.push('advance_clock', { to: iso(ms) })
  }
  tenant(tid: string): void {
    this.push('create_tenant', { tenant_id: tid })
  }
  slot(tid: string, sid: string, startMs: number, capacity: number, price: number): void {
    this.push('create_slot', { tenant_id: tid, slot_id: sid, start: iso(startMs), capacity, price })
  }
  reserve(tid: string, sid: string, actor: string): void {
    this.admission += 1
    this.opKey += 1
    this.push('write', {
      op: 'reserve',
      actor,
      tenant_id: tid,
      admission_seq: this.admission,
      operation_key: `${this.tag}-op${String(this.opKey)}`,
      slot_id: sid,
    })
  }
  cancel(tid: string, sid: string, actor: string): void {
    this.opKey += 1
    this.push('write', { op: 'cancel', actor, tenant_id: tid, operation_key: `${this.tag}-op${String(this.opKey)}`, slot_id: sid })
  }
  read(tid: string, sid: string, key: string): void {
    this.push('read', { tenant_id: tid, key, slot_id: sid })
  }
  probe(tid: string, sid: string, key: string): void {
    this.push('probe_cancel', { tenant_id: tid, key, slot_id: sid })
  }
  capacity(tid: string, sid: string, capacity: number): void {
    this.push('set_capacity', { tenant_id: tid, slot_id: sid, capacity })
  }
  level(tid: string, actor: string, level: 'gold' | 'standard'): void {
    this.push('set_level', { tenant_id: tid, actor, level })
  }
  balance(tid: string, actor: string): void {
    this.push('balance', { tenant_id: tid, actor })
  }
  history(tid: string, sid: string, key: string): void {
    this.push('history', { tenant_id: tid, key, slot_id: sid })
  }
  transfer(tid: string, sid: string, key: string, to: string): void {
    this.push('transfer', { tenant_id: tid, key, slot_id: sid, to_tenant_id: to })
  }
  /** Relecture d'un fait gele de la trajectoire : l'attendu vient de replayFLong(). */
  fact(f: FactStep): void {
    this.n += 1
    this.steps.push({ ...f.step, id: `${this.tag}-${String(this.n)}` })
    this.facts.set(this.steps.length - 1, f.expect)
  }

  expectations(period: string, clockMs: number): StepExpectation[] {
    const model = new ExpectedModelV4(period, clockMs)
    return this.steps.map((s, i) => this.facts.get(i) ?? model.apply(s))
  }
}

/* ═══════════════════════════════════════════ sequences par regle ═══════ */

interface Ctx {
  readonly b: SequenceBuilder
  readonly rng: () => number
  readonly u: string // suffixe unique de la sequence
  readonly base: number // horloge de depart de la sequence (dans la fenetre de la periode)
  readonly period: PeriodId
}

const int = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1))
const FAR = 30 * DAY_MS

/** capacity@1 — augmenter promeut dans l'ordre de la file ; reduire retrograde les plus recents en tete (pt 8). */
function seqCapacity(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-cap-${u}`
  const S = `slot-${u}`
  const c0 = int(rng, 1, 2)
  const n = c0 + 2
  b.tenant(T)
  b.slot(T, S, c.base + FAR, c0, int(rng, 0, 1) * int(rng, 100, 900))
  const actors = Array.from({ length: n }, (_, i) => `a${String(i + 1)}-${u}`)
  for (const a of actors) b.reserve(T, S, a)
  b.capacity(T, S, c0 + 1) // l'attente de tete est promue
  for (const a of actors) b.read(T, S, a)
  const x = `x-${u}`
  b.reserve(T, S, x)
  const m = int(rng, 1, c0) // reduction sous le nombre de confirmes
  b.capacity(T, S, m)
  const y = `y-${u}`
  b.reserve(T, S, y) // nouvelle attente : APRES les retrogrades epingles
  for (const a of [...actors, x, y]) b.read(T, S, a)
  return `capacite ${String(c0)} -> ${String(c0 + 1)} -> ${String(m)}`
}

/** priority@1 — un acteur passe gold depasse la file ; l'annulation du titulaire le promeut. */
function seqPriority(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-prio-${u}`
  const S = `slot-${u}`
  const k = int(rng, 2, 4)
  b.tenant(T)
  b.slot(T, S, c.base + FAR, 1, 0)
  const holder = `h-${u}`
  b.reserve(T, S, holder)
  const waiting = Array.from({ length: k }, (_, i) => `w${String(i + 1)}-${u}`)
  for (const w of waiting) b.reserve(T, S, w)
  const j = int(rng, 2, k) // jamais le premier : sous fifo@1, il n'aurait pas bouge
  const gold = waiting[j - 1] as string
  b.level(T, gold, 'gold')
  for (const w of waiting) b.read(T, S, w)
  b.cancel(T, S, holder)
  for (const w of waiting) b.read(T, S, w)
  return `gold en position ${String(j)} sur ${String(k)}`
}

/** price@1 — debit a la confirmation (et a la promotion), remboursement du montant debite, attente annulee sans remboursement. */
function seqPrice(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-price-${u}`
  const S = `slot-${u}`
  const p = int(rng, 101, 4999)
  const cap = int(rng, 1, 2)
  b.tenant(T)
  b.slot(T, S, c.base + FAR, cap, p)
  const holders = Array.from({ length: cap }, (_, i) => `h${String(i + 1)}-${u}`)
  const w = `w-${u}`
  const v = `v-${u}`
  for (const h of holders) b.reserve(T, S, h)
  b.reserve(T, S, w)
  b.reserve(T, S, v)
  for (const a of [...holders, w, v]) b.balance(T, a)
  const first = holders[0] as string
  b.cancel(T, S, first) // >= 48 h avant : remboursement integral du montant debite
  b.cancel(T, S, v) // attente : annulee, rien a rembourser (pt 6)
  for (const a of [...holders, w, v]) b.balance(T, a)
  b.read(T, S, w)
  b.read(T, S, v)
  return `prix ${String(p)}, capacite ${String(cap)}`
}

/** Un cas d'annulation : creneau a `hoursBefore` du debut, reservation payee, sonde, annulation, lecture, solde. */
function cancelCase(c: Ctx, T: string, label: string, startMs: number, price: number): void {
  const { b, u } = c
  const S = `slot-${label}-${u}`
  const a = `a-${label}-${u}`
  b.slot(T, S, startMs, 1, price)
  b.reserve(T, S, a)
  b.probe(T, S, a)
  b.cancel(T, S, a)
  b.read(T, S, a)
  b.balance(T, a)
}

/** cancel@3 — 100 % a >= 48 h, 50 % (centime inferieur) a >= 24 h, 0 % sinon, permise jusqu'au debut, puis CANCELLATION_TOO_LATE. */
function seqCancel3(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-c3-${u}`
  const now = c.base + int(rng, 1, 60) * 60_000
  b.clock(now)
  b.tenant(T)
  const p = int(rng, 101, 4999)
  const kind = int(rng, 0, 3)
  let before: number
  if (kind === 0) before = DAY_MS // exactement 24 h : 50 % (cancel@2 : integral)
  else if (kind === 1) before = DAY_MS + int(rng, 1, 23 * 60) * 60_000 // entre 24 et 48 h : 50 %
  else if (kind === 2) before = int(rng, 1, 23 * 60) * 60_000 // moins de 24 h : permise, 0 % (cancel@2 : refusee)
  else before = 1 // une milliseconde avant le debut : permise, 0 %
  cancelCase(c, T, 'main', now + before, p)
  cancelCase(c, T, 'h48', now + 2 * DAY_MS, int(rng, 101, 4999)) // exactement 48 h : integral
  cancelCase(c, T, 'start', now, int(rng, 101, 4999)) // au debut : CANCELLATION_TOO_LATE (pt 3)
  return `annulation ${String(before)} ms avant le debut, prix ${String(p)}`
}

/** cancel@4 — echeance 18:00 Europe/Paris la veille du jour local, pour un locataire NEUF (pt 2). */
function seqCancel4(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-c4-${u}`
  const deadline = nextParis18h(c.base + HOUR_MS)
  const deltas = [-HOUR_MS, -60_000, -1, 0, 0, 1, 60_000, HOUR_MS]
  const delta = deltas[int(rng, 0, deltas.length - 1)] as number
  const now = deadline + delta
  b.clock(now)
  b.tenant(T)
  // Debut le lendemain local de l'echeance, en soiree : >= 24 h apres l'echeance,
  // de sorte que cancel@3 (50 %) se distingue toujours de cancel@4 (100 % ou 0 %).
  const d = parisParts(deadline)
  const lendemain = new Date(Date.UTC(d.year, d.month - 1, d.day + 1))
  const start = parisLocalToUtc(lendemain.getUTCFullYear(), lendemain.getUTCMonth() + 1, lendemain.getUTCDate(), int(rng, 20, 23), int(rng, 0, 59))
  const p = int(rng, 101, 4999)
  cancelCase(c, T, 'main', start, p)
  cancelCase(c, T, 'start', now, int(rng, 101, 4999)) // au debut : CANCELLATION_TOO_LATE (pt 3)
  return `annulation a echeance ${delta >= 0 ? '+' : ''}${String(delta)} ms (echeance ${iso(deadline)}), prix ${String(p)}`
}

/** quota@1 — au-dela de deux confirmes : QUOTA_EXCEEDED sans debit ; la promotion saute l'acteur a deux confirmes (pt 5). */
function seqQuota(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-quota-${u}`
  const q = `q-${u}`
  const o = `o-${u}`
  const r = `r-${u}`
  const p1 = int(rng, 0, 1) * int(rng, 101, 999)
  const p2 = int(rng, 0, 1) * int(rng, 101, 999)
  const p3 = int(rng, 101, 999)
  b.tenant(T)
  const H = `slot-hold-${u}`
  b.slot(T, H, c.base + FAR, 1, 0)
  b.reserve(T, H, o) // titulaire
  b.reserve(T, H, q) // q attend en tete (0 confirme)
  b.reserve(T, H, r) // r attend derriere q
  const s1 = `slot-1-${u}`
  const s2 = `slot-2-${u}`
  const s3 = `slot-3-${u}`
  b.slot(T, s1, c.base + FAR, 5, p1)
  b.slot(T, s2, c.base + FAR, 5, p2)
  b.slot(T, s3, c.base + FAR, 5, p3)
  b.reserve(T, s1, q)
  b.reserve(T, s2, q) // q detient deux confirmes
  b.reserve(T, s3, q) // QUOTA_EXCEEDED, sans attente ni debit
  b.balance(T, q)
  b.cancel(T, H, o) // la promotion saute q et profite a r
  b.read(T, H, q)
  b.read(T, H, r)
  return `quota a deux confirmes, prix ${String(p1)}/${String(p2)}/${String(p3)}`
}

/** history@1 — evenements {type, status, at} ; `migrated` pour une reservation existant a l'entree de P10. */
function seqHistory(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-hist-${u}`
  const S = `slot-${u}`
  b.tenant(T)
  b.slot(T, S, c.base + FAR, 1, int(rng, 0, 1) * int(rng, 101, 999))
  const a = `a-${u}`
  const w = `w-${u}`
  b.reserve(T, S, a)
  b.reserve(T, S, w)
  if (rng() < 0.5) b.cancel(T, S, a) // w promu
  b.history(T, S, a)
  b.history(T, S, w)
  // Fait gele de la trajectoire (ADR-018 P10) : l'historique de E sur S2 commence par `migrated`.
  b.fact({
    step: { id: '', op: 'history', args: { tenant_id: 'legacy', key: 'E', slot_id: 'S2' } },
    expect: { kind: 'events', first: fLongMigratedHistoryFactV4() },
  })
  return 'historique de reservations neuves et migration de E sur S2'
}

/** fifo@2 — les niveaux n'ont plus d'effet : un gold arrive apres un standard reste derriere lui. */
function seqFifo2(c: Ctx): string {
  const { b, rng, u } = c
  const T = `t68-fifo2-${u}`
  const S = `slot-${u}`
  b.tenant(T)
  b.slot(T, S, c.base + FAR, 1, 0)
  const holder = `h-${u}`
  const before = int(rng, 1, 2)
  const after = int(rng, 0, 1)
  const std = Array.from({ length: before }, (_, i) => `s${String(i + 1)}-${u}`)
  const late = Array.from({ length: after }, (_, i) => `l${String(i + 1)}-${u}`)
  const g = `g-${u}`
  b.level(T, g, 'gold')
  b.reserve(T, S, holder)
  for (const s of std) b.reserve(T, S, s)
  b.reserve(T, S, g)
  for (const s of late) b.reserve(T, S, s)
  for (const s of [...std, g, ...late]) b.read(T, S, s)
  b.cancel(T, S, holder)
  for (const s of [...std, g, ...late]) b.read(T, S, s)
  return `gold arrive apres ${String(before)} standard(s)`
}

/** transfer@1 — apres transfert : destination voit, origine lit null, tiers NOT_FOUND. */
function seqTransfer(c: Ctx): string {
  const { b, rng, u } = c
  const O = `t68-tr-o-${u}`
  const D = `t68-tr-d-${u}`
  const X = `t68-tr-x-${u}`
  const S = `slot-${u}`
  for (const t of [O, D, X]) b.tenant(t)
  b.slot(O, S, c.base + FAR, 1, int(rng, 0, 1) * int(rng, 101, 999))
  const a = `a-${u}`
  b.reserve(O, S, a)
  b.read(X, S, a) // isolation : NOT_FOUND avant transfert
  b.transfer(O, S, a, D)
  b.read(D, S, a)
  b.read(O, S, a)
  b.read(X, S, a)
  // Faits geles de la trajectoire (ADR-018 P12) : B sur S1, transferee de legacy a other.
  const f = factsOf('P12')
  const fromOther = f['b_s1_from_other']
  b.fact({
    step: { id: '', op: 'read', args: { tenant_id: 'other', key: 'B', slot_id: 'S1' } },
    expect: { kind: 'value', value: { status: String(fromOther) as Status } },
  })
  b.fact({
    step: { id: '', op: 'read', args: { tenant_id: 'legacy', key: 'B', slot_id: 'S1' } },
    expect: f['b_s1_from_legacy'] === null ? { kind: 'value', value: null } : { kind: 'error', code: 'NOT_FOUND' },
  })
  b.fact({
    step: { id: '', op: 'read', args: { tenant_id: 'third', key: 'B', slot_id: 'S1' } },
    expect: { kind: 'error', code: String(f['b_s1_from_third']) },
  })
  return 'transfert vers un locataire neuf, puis relecture du transfert de B sur S1'
}

const DESIGNS: Readonly<Record<string, (c: Ctx) => string>> = {
  'capacity@1': seqCapacity,
  'priority@1': seqPriority,
  'price@1': seqPrice,
  'cancel@3': seqCancel3,
  'cancel@4': seqCancel4,
  'quota@1': seqQuota,
  'history@1': seqHistory,
  'fifo@2': seqFifo2,
  'transfer@1': seqTransfer,
}

/** Regles pour lesquelles un lot discriminant est defini (les regles actives a partir de P5). */
export const DISCRIMINATED_RULES: readonly string[] = Object.keys(DESIGNS)

/**
 * Lot de sequences discriminantes d'une regle a une periode ou elle est active
 * (ADR-019 decision 3), deterministe sur la graine, sur `bench.candidate/4`.
 */
export function generateDiscriminatingSequences(input: GenerateDiscriminatingSequencesInput): GenerateDiscriminatingSequencesResult {
  const contract = input.contract ?? input.protocol ?? DISCRIMINATING_SEQUENCES_CONTRACT
  if (contract !== DISCRIMINATING_SEQUENCES_CONTRACT) {
    throw new Error(`contrat non pris en charge : ${contract} (attendu ${DISCRIMINATING_SEQUENCES_CONTRACT})`)
  }
  const design = DESIGNS[input.rule]
  if (design === undefined) throw new Error(`aucune sequence discriminante pour la regle ${input.rule}`)
  const period = asPeriod(input.period)
  if (!activeRulesV4(period).includes(input.rule)) throw new Error(`${input.rule} n'est pas active en ${period}`)
  if (!Number.isFinite(input.seed)) throw new Error('graine invalide')
  const count = Math.max(input.count ?? DISCRIMINATING_MIN_BATCH_SIZE, DISCRIMINATING_MIN_BATCH_SIZE)
  const clock = trajectoryClockAt(period)
  const sequences: DiscriminatingSequence[] = []
  for (let index = 0; index < count; index += 1) {
    const h = hash32('t68', input.seed, input.rule, period, index)
    const u = h.toString(36)
    const b = new SequenceBuilder(`t68-${u}`)
    const rng = mulberry32(h)
    const boundary = design({ b, rng, u, base: clock, period })
    sequences.push({
      contract: DISCRIMINATING_SEQUENCES_CONTRACT,
      rule: input.rule,
      period,
      seed: input.seed,
      index,
      boundary,
      steps: b.steps,
      expect: b.expectations(period, clock),
    })
  }
  return { contract: DISCRIMINATING_SEQUENCES_CONTRACT, rule: input.rule, period, seed: input.seed, sequences }
}

/** Alias historique (nom du squelette rouge) : `(opts)` ou `(rule, period, seed)`. */
export function generateSequencesForRule(
  ruleOrInput: string | GenerateDiscriminatingSequencesInput,
  period?: string,
  seed?: number,
): GenerateDiscriminatingSequencesResult {
  if (typeof ruleOrInput !== 'string') return generateDiscriminatingSequences(ruleOrInput)
  if (period === undefined || seed === undefined) throw new Error('generateSequencesForRule(rule, period, seed)')
  return generateDiscriminatingSequences({ rule: ruleOrInput, period, seed })
}
