// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — moteur d'exécution des clauses de F-PLATFORM (tâche T70,
// ADR-021 décision 1).
//
// CE FICHIER NE CONTIENT AUCUNE RÈGLE MÉTIER. Il sait seulement :
//   - quelles clauses sont actives à une période ([entrée, sortie[) ;
//   - à quelle clause active appartient une décision (clé de sa mise en œuvre) ;
//   - dérouler une opération : étapes d'enveloppe, puis étapes de l'opération
//     triées par rang, puis son effet ; chaque étape, chaque effet, chaque vue
//     est une fonction portée par une clause de f-platform-clauses.ts.
//
// Une décision demandée qui n'a pas de clause active lève une erreur : rien ne
// se décide ici « par défaut », hormis deux points de structure documentés
// (locataire implicite avant P3, une place par réservation avant P6).
//
// Aucune horloge ambiante : l'instant de chaque opération est son champ `at`.
// ─────────────────────────────────────────────────────────────────────────────

export type Json = Record<string, unknown>

/** Réponse d'une opération : `{ ok: true, ... }` ou `{ ok: false, error }`. */
export type PlatformResponse = Json & { ok: boolean }

export interface PlatformStep {
  readonly id?: string
  readonly period: string | number
  readonly at: string
  readonly op: string
  readonly tenant?: string
  readonly actor?: string
  readonly args?: Json
}

export type BookingStatus = 'confirmed' | 'waiting' | 'cancelled'

export interface Booking {
  readonly booking_id: string
  readonly member_id: string
  readonly slot_id: string
  readonly seq: number
  status: BookingStatus
  seats: number
  amount_cents?: number
  paid_credits_cents?: number
  paid_card_cents?: number
}

export interface Slot {
  readonly slot_id: string
  readonly capacity: number
  readonly starts_at: string
  /** File d'attente : booking_id, tête en premier. */
  file: string[]
  price_cents?: number
}

export interface Series {
  readonly series_id: string
  readonly weekday: number
  readonly start_time: string
  readonly capacity: number
  readonly from_date: string
  readonly until_date: string
  readonly exceptions: Set<string>
}

export interface Tenant {
  readonly tenant_id: string
  readonly owner_id?: string
  readonly slots: Map<string, Slot>
  readonly bookings: Map<string, Booking>
  readonly memo: Map<string, PlatformResponse>
  readonly members: Map<string, string>
  readonly tiers: Map<string, string>
  readonly wallets: Map<string, number>
  readonly series: Map<string, Series>
}

export interface PlatformState {
  readonly tenants: Map<string, Tenant>
  seq: number
}

/** Mise en œuvre d'une clause : décision -> fonction (ou étape/vue rangée). */
export type Implementation = Readonly<Record<string, unknown>>

export interface Quantity {
  readonly unit: string
  readonly format: string
}

export interface PlatformClause {
  readonly id: string
  readonly enters: string
  readonly exits: string | null
  readonly replaces: string | null
  readonly text: string
  readonly contract: Json
  readonly implementation: Implementation
  readonly governs: readonly string[]
  readonly compares: readonly string[]
  readonly questions_ouvertes?: readonly string[]
}

/** Étape rangée d'une opération ou de l'enveloppe : rend une réponse pour s'arrêter, rien pour continuer. */
export interface Etape {
  readonly rang: number
  readonly etape: (ctx: PlatformContext) => PlatformResponse | undefined
}
/** Contribution d'une clause à une vue (réservation, créneau, annulation). */
export type Vue<T> = (ctx: PlatformContext, objet: T, champs: Json) => void

export function periodNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string') {
    const m = /^[Pp]?(\d{1,2})$/.exec(v.trim())
    if (m) return Number(m[1])
  }
  return null
}

export function isActiveAt(c: { enters?: unknown; exits?: unknown }, n: number): boolean {
  const e = periodNumber(c.enters)
  if (e === null) return false
  const s = c.exits === null || c.exits === undefined ? null : periodNumber(c.exits)
  return e <= n && (s === null || n < s)
}

export function fail(error: string): PlatformResponse {
  return { ok: false, error }
}

export function succeed(champs: Json): PlatformResponse {
  return { ok: true, ...champs }
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function newTenant(tenant_id: string, owner_id?: string): Tenant {
  return {
    tenant_id,
    ...(owner_id === undefined ? {} : { owner_id }),
    slots: new Map(),
    bookings: new Map(),
    memo: new Map(),
    members: new Map(),
    tiers: new Map(),
    wallets: new Map(),
    series: new Map(),
  }
}

/** Table des décisions actives à une période : décision -> [clause, mise en œuvre]. */
function decisionTable(clauses: readonly PlatformClause[], n: number): Map<string, [string, unknown]> {
  const table = new Map<string, [string, unknown]>()
  for (const c of clauses) {
    if (!isActiveAt(c, n)) continue
    for (const [decision, impl] of Object.entries(c.implementation)) {
      const deja = table.get(decision)
      if (deja !== undefined) {
        throw new Error(`CONTRADICTION decision ${decision} gouvernee par ${deja[0]} et ${c.id} a P${String(n)}`)
      }
      table.set(decision, [c.id, impl])
    }
  }
  return table
}

export class PlatformContext {
  /** Locataire courant (partition de l'état) ; fixé par l'enveloppe. */
  locataire: Tenant
  /** Données de travail de l'opération (créneau, réservation, places...). */
  readonly d: Record<string, unknown> = {}
  /** Rappels exécutés sur la réponse finale (mémorisation d'idempotence). */
  readonly apres: Array<(r: PlatformResponse) => void> = []
  readonly args: Json

  constructor(
    readonly etat: PlatformState,
    readonly step: PlatformStep,
    readonly periode: number,
    private readonly table: Map<string, [string, unknown]>,
  ) {
    this.args = step.args ?? {}
    this.locataire = etat.tenants.get('default') as Tenant
  }

  get instant(): number {
    return Date.parse(this.step.at)
  }

  regleOpt<T>(decision: string): T | undefined {
    return this.table.get(decision)?.[1] as T | undefined
  }

  regle<T>(decision: string): T {
    const r = this.table.get(decision)
    if (r === undefined) {
      throw new Error(`DECISION-SANS-CLAUSE ${decision} a P${String(this.periode)} (operation ${this.step.op})`)
    }
    return r[1] as T
  }

  /** Toutes les décisions actives d'un préfixe, dans l'ordre de leur rang puis de leur nom. */
  regles<T>(prefixe: string): T[] {
    const trouvees: Array<[string, unknown]> = []
    for (const [k, v] of this.table) if (k.startsWith(prefixe)) trouvees.push([k, v[1]])
    const rang = (v: unknown): number =>
      v !== null && typeof v === 'object' && typeof (v as { rang?: unknown }).rang === 'number'
        ? (v as { rang: number }).rang
        : 0
    trouvees.sort((a, b) => rang(a[1]) - rang(b[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    return trouvees.map(([, v]) => v as T)
  }

  /* ─────────────── points d'appel communs, chacun servi par une clause ── */

  role(member: unknown): string | undefined {
    if (typeof member !== 'string') return undefined
    return this.regle<(ctx: PlatformContext, t: Tenant, m: string) => string | undefined>('membres.role')(
      this,
      this.locataire,
      member,
    )
  }

  occupees(slot: Slot): number {
    return this.regle<(ctx: PlatformContext, s: Slot) => number>('creneau.occupation')(this, slot)
  }

  estActive(b: Booking): boolean {
    return this.regles<(b: Booking) => boolean>('reservation.active.').some((f) => f(b))
  }

  /** Une réservation devient confirmed : montant puis paiement, si des clauses actives les gouvernent. */
  confirmer(b: Booking): void {
    b.status = 'confirmed'
    const montant = this.regleOpt<(ctx: PlatformContext, b: Booking) => number>('reservation.montant')
    if (montant !== undefined) b.amount_cents = montant(this, b)
    const paiement = this.regleOpt<(ctx: PlatformContext, b: Booking) => void>('reservation.paiement')
    if (paiement !== undefined) paiement(this, b)
  }

  /** Des places du créneau viennent d'être libérées : promotion, si une clause active la gouverne. */
  liberer(slot: Slot | undefined): string[] {
    if (slot === undefined) return []
    const promotion = this.regleOpt<(ctx: PlatformContext, s: Slot) => string[]>('liberation.promotion')
    return promotion === undefined ? [] : promotion(this, slot)
  }

  vue<T>(prefixe: string, objet: T): PlatformResponse {
    const champs: Json = {}
    for (const v of this.regles<Vue<T>>(prefixe)) v(this, objet, champs)
    return succeed(champs)
  }
}

/** Modèle attendu : un état unique, des clauses, une opération à la fois. */
export class PlatformEngine {
  readonly etat: PlatformState = { tenants: new Map([['default', newTenant('default')]]), seq: 0 }
  private readonly tables = new Map<number, Map<string, [string, unknown]>>()

  constructor(readonly clauses: readonly PlatformClause[]) {}

  private table(n: number): Map<string, [string, unknown]> {
    let t = this.tables.get(n)
    if (t === undefined) {
      t = decisionTable(this.clauses, n)
      this.tables.set(n, t)
    }
    return t
  }

  apply(step: PlatformStep): PlatformResponse {
    const n = periodNumber(step.period)
    if (n === null) throw new Error(`PERIODE-ILLISIBLE ${String(step.period)}`)
    const ctx = new PlatformContext(this.etat, step, n, this.table(n))
    const effet = ctx.regleOpt<(ctx: PlatformContext) => PlatformResponse>(`${step.op}.effet`)
    if (effet === undefined) throw new Error(`OPERATION-SANS-CLAUSE ${step.op} a P${String(n)}`)
    const etapes = [...ctx.regles<Etape>('enveloppe.'), ...ctx.regles<Etape>(`${step.op}.etape.`)]
    let reponse: PlatformResponse | undefined
    for (const e of etapes) {
      reponse = e.etape(ctx)
      if (reponse !== undefined) break
    }
    if (reponse === undefined) reponse = effet(ctx)
    for (const f of ctx.apres) f(reponse)
    return reponse
  }
}
