// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — T74, ADR-021 décisions 3 et 5 (L198-L204) : les contrôles
// qui départagent les candidats F-PLATFORM, côté GÉNÉRATION (pur : aucune E/S,
// aucun processus, voir `./index.ts`). La notation qui lance réellement le
// candidat est dans `@bench/activities#scorePlatformTargeted` et
// `#scorePlatformDifferential`.
//
// TROIS PIÈCES
//
//   1. `generatePlatformDifferentialStreams({period, seed})` — à chaque
//      période, au moins dix flux d'au moins mille opérations, tirés d'un
//      générateur pseudo-aléatoire DÉTERMINISTE (mulberry32 graine par
//      FNV-1a de « graine | période | indice »). Le tirage connaît le contrat
//      en vigueur (opérations actives, champs d'enveloppe, noms v2) et suit
//      l'état que le modèle attendu lui rend (créneaux créés, réservations,
//      séries, membres) pour viser des identifiants qui existent, avec une
//      part d'identifiants inconnus, de rejeux, d'arguments invalides et
//      d'acteurs non autorisés. Chaque flux commence sur un état VIDE.
//
//   2. `generatePlatformTargetedSequences({period, seed, clause?})` — une
//      séquence ciblée par clause active (deux quand la clause est
//      départageable). Une séquence est ANCRÉE SUR LA FRONTIÈRE de sa
//      clause : on tire des flux (mêmes tirages que 1, graine propre à la
//      clause) qu'on joue en parallèle contre le modèle attendu et contre la
//      source de clauses PRIVÉE DE CETTE CLAUSE (si elle en remplace une, la
//      remplacée reste en vigueur à sa place, comme le fait `replaces`) ; la
//      séquence est le préfixe qui s'arrête à la PREMIÈRE étape où les deux
//      répondent différemment — exactement l'endroit où un candidat qui
//      ignore la clause se trompe. La source privée ne sert qu'à CHOISIR les
//      étapes : chaque attente est la réponse ENTIÈRE du modèle attendu
//      (`@bench/oracle#PlatformEngine` sur la source complète).
//      Chaque attente cite sa clause : l'étape de frontière cite la clause
//      ciblée ; les étapes qui y mènent citent la clause qui gouverne leur
//      opération à cette période (`<op>.effet`, ou la clause de requête qui
//      répond à une opération inconnue / une version invalide). Toutes sont
//      actives à la période, donc dans `docs/spec.md` (T73).
//      Une clause dont la privation n'a aucun effet observable dans le budget
//      de recherche (p. ex. P12.R1, qui « précise sans en changer le sens »
//      P11.R4, ou un plafond de performance) reçoit une séquence courte
//      marquée `discriminating: false` : elle est notée comme les autres.
//
//   3. Les aides de notation, pures : `platformExpectedResponses` (le modèle
//      attendu neuf sur une suite d'étapes), `diagnosePlatformDivergence` (la
//      clause d'une divergence : la clause active dont la privation reproduit
//      la réponse reçue, sinon la clause qui gouverne l'opération),
//      `platformCanonicalJson` (égalité JSON profonde, ordre des clés
//      indifférent).
//
// FORME D'UNE ÉTAPE : celle du modèle attendu `{ op, args, at, tenant?,
// actor?, version? }` (sans `period` : la période est celle du lot, ajoutée
// par le notateur à chaque requête `bench.platform/1`). Une étape de séquence
// ciblée porte en plus `expect: { clause, response }`.
// ─────────────────────────────────────────────────────────────────────────────
import { PLATFORM_CLAUSES, PlatformEngine, type PlatformClause, type PlatformStep } from '@bench/oracle'

type Json = Record<string, unknown>

/** ADR-021 L202 : « au moins dix flux d'au moins mille opérations ». */
export const PLATFORM_DIFFERENTIAL_MIN_STREAMS = 10
export const PLATFORM_DIFFERENTIAL_MIN_OPERATIONS = 1000
export const PLATFORM_CHECKS_PERIOD_COUNT = 24
/** Protocole du processus candidat que jouent les notateurs (voir docs/api.md). */
export const PLATFORM_CANDIDATE_PROTOCOL = 'bench.platform/1'

/* ═════════════════════════════════════════════════════════ formes publiques */

/** Une étape du modèle attendu, sans sa période. */
export interface PlatformCheckStep {
  readonly op: string
  readonly args: Json
  readonly at: string
  readonly tenant?: string
  readonly actor?: string
  readonly version?: string
}

/** L'attente d'une étape ciblée : la réponse entière du modèle attendu, et la clause citée. */
export interface PlatformExpectation {
  readonly clause: string
  readonly response: Json
}

export interface PlatformTargetedStep extends PlatformCheckStep {
  readonly expect: PlatformExpectation
}

export interface PlatformTargetedSequence {
  /** La clause ciblée. */
  readonly clause: string
  readonly period: string
  readonly index: number
  /** Vrai quand la dernière étape est une frontière : la source privée de la clause y répond autrement. */
  readonly discriminating: boolean
  readonly steps: readonly PlatformTargetedStep[]
}

export interface PlatformDifferentialStream {
  readonly index: number
  readonly period: string
  readonly steps: readonly PlatformCheckStep[]
}

export interface PlatformChecksInput {
  readonly period?: number | string
  readonly periodIndex?: number
  readonly periodId?: string
  readonly seed?: number | string
}

export interface GeneratePlatformTargetedSequencesInput extends PlatformChecksInput {
  readonly clause?: string
}

export interface GeneratePlatformDifferentialStreamsInput extends PlatformChecksInput {
  /** Nombre de flux (au moins 10). */
  readonly count?: number
  /** Opérations par flux (au moins 1000). */
  readonly length?: number
}

export interface GeneratePlatformTargetedSequencesResult {
  readonly period: string
  readonly seed: number | string
  readonly sequences: readonly PlatformTargetedSequence[]
}

export interface GeneratePlatformDifferentialStreamsResult {
  readonly period: string
  readonly seed: number | string
  readonly streams: readonly PlatformDifferentialStream[]
}

/* ═══════════════════════════════════════════════════════════ utilitaires */

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v)

/** JSON canonique : clés triées, champs `undefined` omis. Deux réponses sont égales ssi leurs formes canoniques le sont. */
export function platformCanonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(platformCanonicalJson).join(',')}]`
  if (v !== null && typeof v === 'object') {
    const o = v as Json
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${platformCanonicalJson(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Numéro de période (1..24) d'une entrée `{period | periodIndex | periodId}`. */
export function platformPeriodNumber(input: PlatformChecksInput | number | string): number {
  const brut = typeof input === 'object' ? (input.period ?? input.periodIndex ?? input.periodId) : input
  let n: number | null = null
  if (typeof brut === 'number' && Number.isInteger(brut)) n = brut
  else if (typeof brut === 'string') {
    const m = /^[Pp]?(\d{1,2})$/u.exec(brut.trim())
    if (m) n = Number(m[1])
  }
  if (n === null || n < 1 || n > PLATFORM_CHECKS_PERIOD_COUNT) {
    throw new Error(`F-PLATFORM : periode illisible ou hors de P1..P${String(PLATFORM_CHECKS_PERIOD_COUNT)} : ${String(brut)}`)
  }
  return n
}

function graineDe(input: PlatformChecksInput): number | string {
  const s = input.seed
  if (typeof s === 'number' && Number.isFinite(s)) return s
  if (typeof s === 'string' && s.length > 0) return s
  throw new Error('F-PLATFORM : graine (seed) absente')
}

/** FNV-1a 32 bits. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
class Rng {
  private a: number
  constructor(graine: string) {
    this.a = fnv1a(graine) || 0x9e3779b9
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0
    let t = this.a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** Entier dans [lo, hi], bornes incluses. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error('pick sur une liste vide')
    return xs[Math.floor(this.next() * xs.length)] as T
  }
  weighted<T>(xs: readonly (readonly [T, number])[]): T {
    let total = 0
    for (const [, w] of xs) total += w
    let r = this.next() * total
    for (const [v, w] of xs) {
      r -= w
      if (r < 0) return v
    }
    return (xs[xs.length - 1] as readonly [T, number])[0]
  }
}

const HEURE = 3_600_000
const JOUR = 86_400_000
const p2 = (x: number): string => String(x).padStart(2, '0')
function iso(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`
}
const dateDe = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const moisDe = (ms: number): string => new Date(ms).toISOString().slice(0, 7)
function moisDecale(ms: number, k: number): string {
  const d = new Date(ms)
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1)
  return moisDe(t)
}

/* ═══════════════════════════════════════════════════ contrat d'une période */

function periodeDe(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string') {
    const m = /^[Pp]?(\d{1,2})$/u.exec(v.trim())
    if (m) return Number(m[1])
  }
  return null
}

function estActive(c: PlatformClause, n: number): boolean {
  const e = periodeDe(c.enters)
  if (e === null) return false
  const s = c.exits === null || c.exits === undefined ? null : periodeDe(c.exits)
  return e <= n && (s === null || n < s)
}

interface ContratPeriode {
  readonly n: number
  readonly actives: readonly PlatformClause[]
  /** Opérations v1 en vigueur (celles dont une clause active porte l'effet). */
  readonly ops: ReadonlySet<string>
  /** Nom v1 -> nom v2 (P24.R2). */
  readonly opV2: ReadonlyMap<string, string>
  readonly opV1: ReadonlyMap<string, string>
  /** Clé v1 -> clé v2 (P24.R2). */
  readonly cleV2: ReadonlyMap<string, string>
  readonly tenant: boolean
  readonly actor: boolean
  readonly version: boolean
}

const CONTRATS = new Map<number, ContratPeriode>()

function contratDe(n: number): ContratPeriode {
  const deja = CONTRATS.get(n)
  if (deja !== undefined) return deja
  const actives = PLATFORM_CLAUSES.filter((c) => estActive(c, n))
  const ops = new Set<string>()
  const opV2 = new Map<string, string>()
  const cleV2 = new Map<string, string>()
  const enveloppe = new Set<string>()
  for (const c of actives) {
    for (const k of Object.keys(c.implementation)) {
      const m = /^([a-z_]+)\.effet$/u.exec(k)
      if (m) ops.add(m[1] as string)
    }
    const o = c.contract['operations']
    if (estObjet(o)) for (const [k, v] of Object.entries(o)) if (typeof v === 'string') opV2.set(k, v)
    const ch = c.contract['champs']
    if (estObjet(ch)) for (const [k, v] of Object.entries(ch)) if (typeof v === 'string') cleV2.set(k, v)
    const e = c.contract['enveloppe']
    if (estObjet(e)) for (const k of Object.keys(e)) enveloppe.add(k)
  }
  const contrat: ContratPeriode = {
    n,
    actives,
    ops,
    opV2,
    opV1: new Map([...opV2].map(([a, b]) => [b, a])),
    cleV2,
    tenant: enveloppe.has('tenant'),
    actor: enveloppe.has('actor'),
    version: enveloppe.has('version'),
  }
  CONTRATS.set(n, contrat)
  return contrat
}

/** Opérations en vigueur à la période n (noms v1, puis noms v2 s'il y en a). */
export function platformActiveOperations(period: number | string): string[] {
  const c = contratDe(platformPeriodNumber(period))
  return [...c.ops, ...[...c.ops].map((o) => c.opV2.get(o)).filter((x): x is string => x !== undefined)]
}

function renommerCles(v: unknown, cles: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(v)) return v.map((x) => renommerCles(x, cles))
  if (estObjet(v)) {
    const out: Json = {}
    for (const [k, x] of Object.entries(v)) out[cles.get(k) ?? k] = renommerCles(x, cles)
    return out
  }
  return v
}

/* ═══════════════════════════════════════════════ source privée d'une clause */

/**
 * La source de clauses privée de `retirees` : chaque clause nommée est ôtée ;
 * si elle en remplace une, celle-ci reste en vigueur à sa place (sa sortie
 * devient celle de la clause ôtée).
 */
export function platformClausesWithout(retirees: readonly string[]): PlatformClause[] {
  const ot = new Set(retirees)
  const parId = new Map(PLATFORM_CLAUSES.map((c) => [c.id, c]))
  const report = new Map<string, string | null>()
  for (const id of ot) {
    const c = parId.get(id)
    if (c === undefined || c.replaces === null) continue
    let remplacee: string = c.replaces
    for (let garde = 0; garde < 50 && ot.has(remplacee); garde += 1) {
      const suivante = parId.get(remplacee)?.replaces
      if (suivante === null || suivante === undefined) break
      remplacee = suivante
    }
    if (!ot.has(remplacee)) report.set(remplacee, c.exits)
  }
  return PLATFORM_CLAUSES.filter((c) => !ot.has(c.id)).map((c) => (report.has(c.id) ? { ...c, exits: report.get(c.id) ?? null } : c))
}

/** Réponse JSON d'un moteur, ou le marqueur d'une exception (le moteur privé peut lever). */
function appliquer(moteur: PlatformEngine, step: PlatformStep): Json {
  try {
    return clone(moteur.apply(step)) as Json
  } catch (e) {
    return { ok: false, error: 'INTERNAL_ERROR', message: String((e as Error)?.message ?? e).slice(0, 300) }
  }
}

const versEtape = (s: PlatformCheckStep, n: number): PlatformStep => ({ ...clone(s), period: `P${String(n)}` }) as PlatformStep

/* ═════════════════════════════════════════════════════════ tirage d'un flux */

const LOCATAIRES = ['t-a', 't-b', 't-c', 't-d'] as const
const PROPRIETAIRES: Record<string, string> = { 't-a': 'm-oa', 't-b': 'm-ob', 't-c': 'm-oa', 't-d': 'm-od' }
const MEMBRES = ['m-a', 'm-b', 'm-c', 'm-d', 'm-e', 'm-f', 'm-s', 'm-t'] as const
const SERIES = ['Y1', 'Y2', 'Y3'] as const
const ADMIN_SEUL: ReadonlySet<string> = new Set([
  'add_member',
  'set_price',
  'set_tier',
  'set_timezone',
  'number_seats',
  'issue_invoices',
  'set_rate',
  'change_price',
  'merge_tenants',
  'erase_member',
  'report_revenue',
])
const ADMIN_STAFF: ReadonlySet<string> = new Set([
  'create_slot',
  'create_recurring',
  'add_exception',
  'top_up',
  'mark_no_show',
  'close_slot',
  'report_occupancy',
  'import_bookings',
  'exchange_bookings',
])

/** Poids de tirage des opérations v1 (celles qui ne sont pas en vigueur sont ignorées). */
const POIDS: readonly (readonly [string, number])[] = [
  ['reserve', 20],
  ['cancel', 8],
  ['get_booking', 5],
  ['get_slot', 4],
  ['create_slot', 7],
  ['create_tenant', 1.2],
  ['add_member', 3.5],
  ['create_recurring', 2],
  ['add_exception', 1.5],
  ['list_occurrences', 1.5],
  ['set_price', 3.5],
  ['set_tier', 2],
  ['top_up', 4],
  ['get_wallet', 2.5],
  ['set_timezone', 1.2],
  ['mark_no_show', 3.5],
  ['number_seats', 1.5],
  ['close_slot', 2],
  ['issue_invoices', 1.5],
  ['list_documents', 2],
  ['set_rate', 2.5],
  ['change_price', 2.5],
  ['merge_tenants', 0.5],
  ['erase_member', 0.8],
  ['report_occupancy', 1.5],
  ['report_revenue', 1.5],
  ['import_bookings', 2],
  ['transfer_booking', 3],
  ['exchange_bookings', 2.5],
]

interface Reservation {
  readonly slot: string
  member: string
}

interface EtatLocataire {
  readonly membres: Map<string, string>
  /** slot_id -> starts_at (ms). */
  readonly creneaux: Map<string, number>
  /** slot_id -> capacity. */
  readonly capacites: Map<string, number>
  readonly reservations: Map<string, Reservation>
  readonly requetes: string[]
  readonly series: Map<string, string[]>
  readonly imports: Map<string, unknown[]>
  readonly pseudonymes: string[]
}

const nouvelEtat = (): EtatLocataire => ({
  membres: new Map(),
  creneaux: new Map(),
  capacites: new Map(),
  reservations: new Map(),
  requetes: [],
  series: new Map(),
  imports: new Map(),
  pseudonymes: [],
})

/**
 * Tire les étapes d'un flux. Chaque étape est jouée contre `observer` (le
 * modèle attendu du tirage), dont la réponse oriente les tirages suivants.
 * `arret` peut interrompre le tirage (recherche d'une frontière).
 */
class Tirage {
  private readonly r: Rng
  private readonly c: ContratPeriode
  private t: number
  private compteur = 0
  private readonly locataires = new Map<string, EtatLocataire>()
  /** Locataires créés avec succès (et pas encore absorbés par une fusion). */
  private readonly crees: string[] = []
  private readonly opsTirables: (readonly [string, number])[]
  readonly steps: PlatformCheckStep[] = []

  constructor(
    graine: string,
    n: number,
    private readonly observer: (s: PlatformCheckStep) => Json,
  ) {
    this.r = new Rng(graine)
    this.c = contratDe(n)
    // Début du flux : un instant de 2031-2032, différent d'un flux à l'autre
    // (saisons, changements d'heure, fins de mois).
    this.t = Date.UTC(2031, 0, 5) + this.r.int(0, 600) * JOUR + this.r.int(6, 20) * HEURE + this.r.int(0, 3) * 15 * 60_000
    this.opsTirables = POIDS.filter(([op]) => this.c.ops.has(op))
    if (!this.c.tenant) this.locataires.set('default', nouvelEtat())
  }

  /* ───── sélecteurs */

  private etat(t: string): EtatLocataire {
    let e = this.locataires.get(t)
    if (e === undefined) {
      e = nouvelEtat()
      this.locataires.set(t, e)
    }
    return e
  }
  private creesOuPool(): string[] {
    return this.crees.length > 0 ? [...this.crees] : [...LOCATAIRES]
  }
  private choisirLocataire(): string {
    const crees = this.creesOuPool()
    const x = this.r.next()
    if (x < 0.62) return crees[0] as string
    if (x < 0.95) return this.r.pick(crees)
    if (x < 0.985) return this.r.pick(LOCATAIRES)
    return 't-zz'
  }
  private choisirActeur(e: EtatLocataire, tenant: string, op: string): string | undefined {
    const membres = [...e.membres.entries()]
    const x = this.r.next()
    if (x < 0.012) return undefined
    if (x < 0.05 || membres.length === 0) return this.r.pick([...MEMBRES, PROPRIETAIRES[tenant] ?? 'm-oa', 'm-zz', ...e.pseudonymes])
    const admins = membres.filter(([, r]) => r === 'admin').map(([m]) => m)
    const staff = membres.filter(([, r]) => r === 'staff').map(([m]) => m)
    const simples = membres.filter(([, r]) => r === 'member').map(([m]) => m)
    // Le plus souvent un rôle autorisé pour l'opération, parfois un autre (FORBIDDEN).
    const autorise = ADMIN_SEUL.has(op) ? ['admin'] : ADMIN_STAFF.has(op) ? ['admin', 'staff'] : ['admin', 'staff', 'member']
    const role = this.r.chance(0.8)
      ? this.r.weighted<string>(autorise.map((x) => [x, x === 'member' ? 0.45 : x === 'staff' ? 0.3 : 0.4] as const))
      : this.r.pick(['admin', 'staff', 'member'])
    const lot = role === 'admin' ? admins : role === 'staff' ? staff : simples
    return lot.length > 0 ? this.r.pick(lot) : this.r.pick(membres)[0]
  }
  private membre(e: EtatLocataire, acteur?: string): string {
    if (acteur !== undefined && e.membres.get(acteur) === 'member' && this.r.chance(0.7)) return acteur
    if (e.pseudonymes.length > 0 && this.r.chance(0.08)) return this.r.pick(e.pseudonymes)
    const connus = [...e.membres.keys()]
    if (connus.length > 0 && this.r.chance(0.82)) return this.r.pick(connus)
    return this.r.pick([...MEMBRES, 'm-zz'])
  }
  private creneau(e: EtatLocataire, futur = 0.75): string {
    const tous = [...e.creneaux.entries()]
    const x = this.r.next()
    if (tous.length === 0 || x > 0.94) return this.r.pick(['S404', 'Y1@2031-02-03', 'S1'])
    if (x < futur) {
      const avenir = tous.filter(([, s]) => s > this.t)
      if (avenir.length > 0) return this.r.pick(avenir.slice(this.r.chance(0.4) ? -3 : -12))[0]
    }
    return this.r.pick(tous.slice(-20))[0]
  }
  private creneauCommence(e: EtatLocataire): string {
    const passes = [...e.creneaux.entries()].filter(([, s]) => s <= this.t)
    return passes.length > 0 && this.r.chance(0.8) ? this.r.pick(passes.slice(-10))[0] : this.creneau(e)
  }
  private reservation(e: EtatLocataire, pred?: (r: Reservation) => boolean): string {
    const toutes = [...e.reservations.entries()]
    if (toutes.length === 0 || this.r.chance(0.05)) return this.r.pick(['r-zz', 'b404', ...e.requetes.slice(-3)])
    const visees = pred === undefined ? toutes : toutes.filter(([, r]) => pred(r))
    const lot = visees.length > 0 && this.r.chance(0.8) ? visees : toutes
    return this.r.chance(0.7) ? this.r.pick(lot.slice(-14))[0] : this.r.pick(lot)[0]
  }
  private sieges(defaut: number): unknown {
    return this.r.weighted<unknown>([
      [undefined, defaut],
      [1, 25],
      [2, 25],
      [3, 15],
      [4, 8],
      [6, 3],
      [0, 2],
      ['2', 1],
    ])
  }
  private debutCreneau(): number {
    const x = this.r.next()
    let d: number
    if (x < 0.4) d = this.r.int(2, 47) * HEURE
    else if (x < 0.8) d = this.r.int(48, 160) * HEURE
    else if (x < 0.95) d = this.r.int(7, 25) * JOUR
    else d = -this.r.int(1, 40) * HEURE
    const debut = this.t + d
    return debut - (debut % (15 * 60_000))
  }
  private prix(): number {
    return this.r.weighted<number>([
      [this.r.int(1, 40) * 100 + this.r.pick([0, 0, 50, 99, 1, 33]), 80],
      [0, 6],
      [this.r.int(1, 999), 10],
      [100_000_000, 1],
    ])
  }

  /* ───── arguments d'une opération v1 */

  private args(op: string, tenant: string, e: EtatLocataire, acteur: string | undefined): Json | null {
    const r = this.r
    const n = this.c.n
    switch (op) {
      case 'create_slot': {
        const reprise = e.creneaux.size > 0 && r.chance(0.08)
        const id = reprise ? r.pick([...e.creneaux.keys()]) : `S${String(++this.compteur)}`
        const capacite = r.weighted<unknown>([
          [1, 18],
          [2, 25],
          [3, 22],
          [4, 15],
          [5, 8],
          [8, 4],
          [10, 6],
          [11, 3],
          [20, 2],
          [0, 2],
          [10001, 1],
          ['3', 1],
        ])
        const starts = r.chance(0.015) ? '2031-13-40T25:00:00Z' : iso(this.debutCreneau())
        return { slot_id: r.chance(0.01) ? '' : id, capacity: capacite, starts_at: starts }
      }
      case 'reserve': {
        const reprise = e.requetes.length > 0 && r.chance(0.12)
        const req = reprise ? r.pick(e.requetes.slice(-25)) : `r${String(++this.compteur)}`
        const a: Json = { request_id: req, member_id: this.membre(e, acteur), slot_id: this.creneau(e) }
        if (reprise && r.chance(0.5)) {
          const ancienne = e.reservations.get(req)
          if (ancienne !== undefined) {
            a['member_id'] = ancienne.member
            a['slot_id'] = ancienne.slot
          }
        }
        if (n >= 6) {
          const s = this.sieges(40)
          if (s !== undefined) a['seats'] = s
        }
        return a
      }
      case 'cancel': {
        const a: Json = { booking_id: this.reservation(e) }
        if (n >= 8 && r.chance(0.25)) a['seats'] = r.weighted<unknown>([[1, 6], [2, 3], [3, 1], [0, 1]])
        return a
      }
      case 'get_booking':
        return { booking_id: this.reservation(e) }
      case 'get_slot':
        return { slot_id: this.creneau(e, 0.5) }
      case 'create_tenant': {
        const id = r.chance(0.03) ? '' : r.pick(LOCATAIRES)
        const owner = r.chance(0.2) ? r.pick(['m-oa', 'm-ob', 'm-a']) : (PROPRIETAIRES[id] ?? 'm-oa')
        return { tenant_id: id, owner_id: owner }
      }
      case 'add_member': {
        const role = r.weighted<string>([
          ['member', 55],
          ['staff', 22],
          ['admin', 10],
          ['owner', 3],
        ])
        const m = r.chance(0.08) ? r.pick(['m-oa', 'm-ob', 'm-od']) : r.pick(MEMBRES)
        return { member_id: m, role: m.startsWith('m-o') && r.chance(0.7) ? 'admin' : role }
      }
      case 'create_recurring': {
        const debut = this.t + r.int(0, 6) * JOUR
        const fin = debut + r.weighted<number>([[r.int(0, 40) * JOUR, 90], [400 * JOUR, 3], [-3 * JOUR, 3]])
        return {
          series_id: r.pick(SERIES) + (r.chance(0.5) ? '' : String(r.int(1, 3))),
          weekday: r.chance(0.03) ? 8 : r.int(1, 7),
          start_time: r.chance(0.02) ? '24:10' : `${p2(r.int(6, 21))}:${r.pick(['00', '30', '15'])}`,
          capacity: r.weighted<unknown>([[1, 3], [2, 5], [3, 4], [0, 1]]),
          from_date: dateDe(debut),
          until_date: dateDe(fin),
        }
      }
      case 'add_exception': {
        const series = [...e.series.entries()]
        if (series.length === 0 || r.chance(0.1)) return { series_id: r.pick(SERIES), date: dateDe(this.t + r.int(0, 20) * JOUR) }
        const [id, slots] = r.pick(series)
        const date = slots.length > 0 && r.chance(0.8) ? (r.pick(slots).split('@')[1] ?? dateDe(this.t)) : dateDe(this.t + r.int(0, 20) * JOUR)
        return { series_id: id, date }
      }
      case 'list_occurrences': {
        const series = [...e.series.keys()]
        return { series_id: series.length > 0 && r.chance(0.85) ? r.pick(series) : r.pick(SERIES) }
      }
      case 'set_price': {
        const a: Json = { slot_id: this.creneau(e), price_cents: r.chance(0.02) ? -5 : this.prix() }
        if (n >= 15 && r.chance(0.55)) a['currency'] = r.weighted<string>([['USD', 6], ['EUR', 3], ['GBP', 1]])
        return a
      }
      case 'set_tier':
        return { member_id: this.membre(e), tier: r.weighted<string>([['gold', 4], ['silver', 4], ['none', 2], ['platinum', 0.5]]) }
      case 'top_up': {
        const a: Json = { member_id: this.membre(e, acteur), amount_cents: r.chance(0.03) ? 0 : r.int(1, 60) * 100 + r.pick([0, 0, 50, 1]) }
        if (n >= 15 && r.chance(0.4)) a['currency'] = r.weighted<string>([['USD', 6], ['EUR', 3], ['JPY', 1]])
        return a
      }
      case 'get_wallet':
        return { member_id: this.membre(e, acteur) }
      case 'set_timezone':
        return { timezone: r.weighted<string>([['Europe/Paris', 6], ['UTC', 4], ['Mars/Olympus', 1]]) }
      case 'mark_no_show':
        return { booking_id: this.reservationCommencee(e) }
      case 'number_seats':
        return { slot_id: this.creneau(e, 0.85) }
      case 'close_slot':
        return { slot_id: r.chance(0.75) ? this.creneauCommence(e) : this.creneau(e) }
      case 'issue_invoices':
        return {
          month: r.weighted<string>([
            [moisDecale(this.t, -1), 50],
            [moisDecale(this.t, -2), 15],
            [moisDe(this.t), 20],
            [moisDecale(this.t, 1), 5],
            ['2031-13', 2],
          ]),
        }
      case 'list_documents':
        return { member_id: this.membre(e, acteur) }
      case 'set_rate':
        return {
          currency: r.chance(0.04) ? 'GBP' : 'USD',
          date: dateDe(this.t + r.int(-4, 3) * JOUR),
          rate_micro: r.chance(0.03) ? 0 : r.int(820_000, 1_250_000),
        }
      case 'change_price':
        return {
          slot_id: this.creneau(e),
          price_cents: this.prix(),
          effective_from: iso(this.t - (r.chance(0.06) ? -r.int(1, 30) * HEURE : r.int(0, 96) * HEURE)),
        }
      case 'merge_tenants': {
        const autres = this.creesOuPool().filter((x) => x !== tenant)
        return { source_tenant_id: autres.length > 0 && r.chance(0.85) ? r.pick(autres) : r.pick([...LOCATAIRES, tenant]) }
      }
      case 'erase_member':
        return { member_id: this.membre(e) }
      case 'report_occupancy': {
        const de = this.t - r.int(0, 20) * JOUR
        const a: Json = { from: `${dateDe(de)}T00:00:00Z`, to: `${dateDe(de + r.int(1, 40) * JOUR)}T00:00:00Z` }
        if (r.chance(0.4)) a['sort'] = r.weighted<string>([['-fill_bp', 3], ['slot_id', 3], ['starts_at', 2], ['fill_bp', 0.5]])
        if (r.chance(0.4)) a['page_size'] = r.weighted<number>([[2, 3], [3, 3], [1, 1], [101, 0.4]])
        if (r.chance(0.3)) a['page'] = r.int(1, 3)
        if (r.chance(0.25)) a['min_fill_bp'] = r.pick([0, 2500, 5000, 10000])
        return a
      }
      case 'report_revenue': {
        const a: Json = { from_month: moisDecale(this.t, -r.int(0, 3)), to_month: moisDecale(this.t, r.int(-1, 1)) }
        if (r.chance(0.3)) a['member_id'] = this.membre(e)
        if (r.chance(0.4)) a['sort'] = r.weighted<string>([['-net_cents', 3], ['member_id', 3], ['month', 2], ['net', 0.5]])
        if (r.chance(0.35)) a['page_size'] = r.weighted<number>([[2, 3], [3, 3], [1, 1], [0, 0.4]])
        if (r.chance(0.3)) a['page'] = r.int(1, 3)
        return a
      }
      case 'import_bookings': {
        const ids = [...e.imports.keys()]
        if (ids.length > 0 && r.chance(0.25)) {
          const id = r.pick(ids)
          return { import_id: id, rows: r.chance(0.6) ? clone(e.imports.get(id) ?? []) : this.lignes(e) }
        }
        const id = r.chance(0.02) ? '' : `imp-${String(++this.compteur)}`
        return { import_id: id, rows: r.chance(0.04) ? [] : this.lignes(e) }
      }
      case 'transfer_booking':
        return { booking_id: this.reservation(e), to_member_id: this.membre(e) }
      case 'exchange_bookings': {
        const a = this.reservation(e)
        return { booking_id: a, with_booking_id: r.chance(0.04) ? a : this.reservation(e) }
      }
      default:
        return null
    }
  }

  private reservationCommencee(e: EtatLocataire): string {
    return this.reservation(e, (b) => (e.creneaux.get(b.slot) ?? Infinity) <= this.t)
  }

  private lignes(e: EtatLocataire): unknown[] {
    const nb = this.r.int(1, 4)
    const out: unknown[] = []
    for (let i = 0; i < nb; i += 1) {
      if (this.r.chance(0.04)) {
        out.push({ member_id: 'm-a' })
        continue
      }
      const reprise = e.requetes.length > 0 && this.r.chance(0.12)
      const l: Json = {
        request_id: reprise ? this.r.pick(e.requetes.slice(-20)) : `i${String(++this.compteur)}`,
        member_id: this.membre(e),
        slot_id: this.creneau(e),
      }
      const s = this.c.n >= 6 ? this.sieges(50) : undefined
      if (s !== undefined) l['seats'] = s
      out.push(l)
    }
    return out
  }

  /* ───── une étape */

  private avancer(): void {
    const x = this.r.next()
    let d: number
    if (x < 0.75) d = this.r.int(1, 20) * 60_000
    else if (x < 0.97) d = this.r.int(1, 6) * HEURE + this.r.int(0, 59) * 60_000
    else d = this.r.int(1, 2) * JOUR
    this.t += d
  }

  /** Tire, joue et enregistre une étape ; rend sa réponse. */
  private emettre(op: string, forcer?: { tenant?: string; actor?: string | null; args?: Json; court?: boolean }): Json {
    const c = this.c
    const tenant = c.tenant ? (forcer?.tenant ?? this.choisirLocataire()) : 'default'
    const e = this.etat(tenant)
    let actor: string | undefined
    if (c.actor && op !== 'create_tenant') {
      actor = forcer?.actor === undefined ? this.choisirActeur(e, tenant, op) : (forcer.actor ?? undefined)
    }
    const args = forcer?.args ?? this.args(op, tenant, e, actor)
    if (args === null) return { ok: false }
    let opEnvoyee = op
    let argsEnvoyes: Json = args
    let version: string | undefined
    if (c.version) {
      const v = this.r.weighted<string | undefined>([
        [undefined, 12],
        ['v1', 38],
        ['v2', 48],
        ['v3', 1.2],
        ['V2', 0.8],
      ])
      version = v
      if (v === 'v2') {
        const fuite = this.r.chance(0.04)
        opEnvoyee = fuite && this.r.chance(0.5) ? op : (c.opV2.get(op) ?? op)
        argsEnvoyes = fuite ? args : (renommerCles(args, c.cleV2) as Json)
      } else if (this.r.chance(0.025)) {
        opEnvoyee = c.opV2.get(op) ?? op
        if (this.r.chance(0.5)) argsEnvoyes = renommerCles(args, c.cleV2) as Json
      }
    }
    const step: PlatformCheckStep = {
      op: opEnvoyee,
      args: argsEnvoyes,
      at: iso(this.t),
      ...(c.tenant && (op !== 'create_tenant' || this.r.chance(0.3)) ? { tenant } : {}),
      ...(actor !== undefined ? { actor } : {}),
      ...(version !== undefined ? { version } : {}),
    }
    this.steps.push(step)
    const rep = this.observer(step)
    this.noter(op, tenant, e, args, rep)
    if (forcer?.court === true) this.t += this.r.int(1, 4) * 60_000
    else this.avancer()
    return rep
  }

  /** Met à jour ce que le tirage sait de l'état, d'après la réponse du modèle. */
  private noter(op: string, tenant: string, e: EtatLocataire, args: Json, rep: Json): void {
    // La réponse peut être en forme v2 : on la relit en v1.
    const r = this.c.version ? (renommerCles(rep, new Map([...this.c.cleV2].map(([a, b]) => [b, a]))) as Json) : rep
    if (op === 'reserve' && typeof args['request_id'] === 'string') e.requetes.push(args['request_id'])
    if (r['ok'] !== true) return
    switch (op) {
      case 'create_tenant': {
        const id = String(args['tenant_id'])
        const et = this.etat(id)
        et.membres.set(String(args['owner_id']), 'admin')
        if (!this.crees.includes(id)) this.crees.push(id)
        break
      }
      case 'add_member':
        e.membres.set(String(args['member_id']), String(args['role']))
        break
      case 'create_slot':
        e.creneaux.set(String(args['slot_id']), Date.parse(String(args['starts_at'])))
        e.capacites.set(String(args['slot_id']), Number(args['capacity']))
        break
      case 'reserve':
        e.reservations.set(String(r['booking_id'] ?? args['request_id']), { slot: String(args['slot_id']), member: String(args['member_id']) })
        break
      case 'create_recurring':
      case 'list_occurrences': {
        const ids = Array.isArray(r['slot_ids']) ? r['slot_ids'].map(String) : []
        e.series.set(String(args['series_id']), ids)
        const heure = typeof args['start_time'] === 'string' ? args['start_time'] : '18:00'
        for (const s of ids) {
          const d = s.split('@')[1]
          if (d !== undefined && !e.creneaux.has(s)) e.creneaux.set(s, Date.parse(`${d}T${heure}:00Z`))
        }
        break
      }
      case 'import_bookings': {
        e.imports.set(String(args['import_id']), clone((args['rows'] as unknown[]) ?? []))
        for (const l of (args['rows'] as unknown[]) ?? []) {
          if (!estObjet(l) || typeof l['request_id'] !== 'string') continue
          e.requetes.push(l['request_id'])
          e.reservations.set(l['request_id'], { slot: String(l['slot_id']), member: String(l['member_id']) })
        }
        break
      }
      case 'transfer_booking': {
        const b = e.reservations.get(String(args['booking_id']))
        if (b !== undefined) b.member = String(args['to_member_id'])
        break
      }
      case 'erase_member':
        if (typeof r['member_id'] === 'string') {
          e.membres.delete(String(args['member_id']))
          e.pseudonymes.push(r['member_id'])
        }
        break
      case 'merge_tenants': {
        const src = String(args['source_tenant_id'])
        const s = this.locataires.get(src)
        if (s !== undefined) {
          for (const [k, v] of s.creneaux) e.creneaux.set(`${src}:${k}`, v)
          for (const [k, v] of s.reservations) e.reservations.set(`${src}:${k}`, { slot: `${src}:${v.slot}`, member: v.member })
          for (const [k, v] of s.membres) if (!e.membres.has(k)) e.membres.set(k, v)
          this.locataires.delete(src)
          const i = this.crees.indexOf(src)
          if (i >= 0) this.crees.splice(i, 1)
        }
        break
      }
      default:
        break
    }
  }

  /** Mise en place : locataires, membres de chaque rôle, quelques créneaux. */
  private miseEnPlace(arret: () => boolean): void {
    const c = this.c
    const locs: string[] = []
    if (c.tenant && c.ops.has('create_tenant')) {
      const nb = this.r.int(2, 3)
      for (let i = 0; i < nb && !arret(); i += 1) {
        const id = LOCATAIRES[i] as string
        this.emettre('create_tenant', { args: { tenant_id: id, owner_id: PROPRIETAIRES[id] ?? 'm-oa' } })
        locs.push(id)
      }
    } else locs.push('default')
    for (const tenant of locs) {
      if (c.actor && c.ops.has('add_member')) {
        const owner = PROPRIETAIRES[tenant] ?? 'm-oa'
        const roles: [string, string][] = [
          ['m-s', 'staff'],
          ['m-a', 'member'],
          ['m-b', 'member'],
          ['m-c', 'member'],
        ]
        if (this.r.chance(0.7)) roles.push(['m-d', 'member'])
        if (this.r.chance(0.5)) roles.push(['m-e', 'member'])
        if (this.r.chance(0.4)) roles.push(['m-t', 'staff'])
        if (tenant !== 't-a' && this.r.chance(0.6)) roles.push(['m-oa', 'admin'])
        for (const [m, role] of roles) {
          if (arret()) return
          this.emettre('add_member', { tenant, actor: owner, args: { member_id: m, role } })
        }
      }
      for (let i = 0, nb = this.r.int(2, 3); i < nb && !arret(); i += 1) {
        const owner = c.actor ? (PROPRIETAIRES[tenant] ?? 'm-oa') : null
        const args = this.args('create_slot', tenant, this.etat(tenant), owner ?? undefined) as Json
        args['slot_id'] = `S${String(++this.compteur)}`
        args['starts_at'] = iso(this.t + this.r.int(30, 140) * HEURE)
        if (typeof args['capacity'] !== 'number' || args['capacity'] < 1 || args['capacity'] > 10) args['capacity'] = 2
        this.emettre('create_slot', { ...(c.tenant ? { tenant } : {}), actor: owner, args })
      }
    }
  }

  /**
   * Rafale : plusieurs réservations d'affilée sur un même créneau à venir, par
   * des membres différents — files d'attente, créneaux pleins, surréservation.
   */
  private rafale(longueur: number, arret: () => boolean): void {
    const tenant = this.c.tenant ? this.choisirLocataire() : 'default'
    const e = this.etat(tenant)
    const avenir = [...e.creneaux.entries()].filter(([, s]) => s > this.t + HEURE)
    if (avenir.length === 0) return
    const grands = avenir.filter(([id]) => (e.capacites.get(id) ?? 0) >= 10)
    const slot = (grands.length > 0 && this.r.chance(0.6) ? this.r.pick(grands.slice(-3)) : this.r.pick(avenir.slice(-4)))[0]
    const admins = [...e.membres.entries()].filter(([, r]) => r !== 'member').map(([m]) => m)
    const membres = [...e.membres.keys()]
    if (membres.length < 3) membres.push(...MEMBRES)
    for (let i = membres.length - 1; i > 0; i -= 1) {
      const j = this.r.int(0, i)
      const x = membres[i] as string
      membres[i] = membres[j] as string
      membres[j] = x
    }
    for (let k = 0, nb = this.r.int(5, 14); k < nb && this.steps.length < longueur && !arret(); k += 1) {
      const m = this.r.chance(0.85) ? (membres[k % membres.length] as string) : this.r.pick(membres)
      const a: Json = { request_id: `r${String(++this.compteur)}`, member_id: m, slot_id: slot }
      if (this.c.n >= 6 && this.r.chance(0.8)) a['seats'] = this.r.weighted<number>([[1, 2], [2, 4], [3, 4]])
      const actor = this.c.actor ? (admins.length > 0 ? this.r.pick(admins) : null) : null
      this.emettre('reserve', { tenant, actor, args: a, court: true })
    }
  }

  /** Tire `longueur` étapes (moins si `arret` devient vrai). */
  tirer(longueur: number, arret: () => boolean = () => false): PlatformCheckStep[] {
    this.miseEnPlace(() => arret() || this.steps.length >= longueur)
    // Chaque opération en vigueur au moins une fois tôt dans le flux (couverture),
    // puis tirage pondéré.
    const aVoir = this.opsTirables.map(([op]) => op)
    for (let i = aVoir.length - 1; i > 0; i -= 1) {
      const j = this.r.int(0, i)
      const x = aVoir[i] as string
      aVoir[i] = aVoir[j] as string
      aVoir[j] = x
    }
    while (this.steps.length < longueur && !arret()) {
      let op: string
      if (aVoir.length > 0 && this.r.chance(0.12)) op = aVoir.pop() as string
      else if (this.r.chance(0.004)) op = 'frobnicate'
      else op = this.r.weighted(this.opsTirables)
      if (op === 'frobnicate') {
        this.emettre(op, { args: { slot_id: 'S1' } })
        continue
      }
      if (op === 'reserve' && this.r.chance(0.06)) {
        this.rafale(longueur, arret)
        continue
      }
      this.emettre(op)
    }
    return this.steps
  }
}

/* ═══════════════════════════════════════════════════════ flux différentiels */

const FLUX = new Map<string, GeneratePlatformDifferentialStreamsResult>()

function tirerFlux(graine: string, n: number, longueur: number): PlatformCheckStep[] {
  const modele = new PlatformEngine(PLATFORM_CLAUSES)
  const t = new Tirage(graine, n, (s) => appliquer(modele, versEtape(s, n)))
  return t.tirer(longueur)
}

/**
 * Les flux différentiels de la période : `count` (>= 10) flux de `length`
 * (>= 1000) opérations, déterministes pour une graine donnée.
 */
export function generatePlatformDifferentialStreams(input: GeneratePlatformDifferentialStreamsInput): GeneratePlatformDifferentialStreamsResult {
  const n = platformPeriodNumber(input)
  const seed = graineDe(input)
  const count = Math.max(PLATFORM_DIFFERENTIAL_MIN_STREAMS, Math.floor(input.count ?? PLATFORM_DIFFERENTIAL_MIN_STREAMS))
  const length = Math.max(PLATFORM_DIFFERENTIAL_MIN_OPERATIONS, Math.floor(input.length ?? PLATFORM_DIFFERENTIAL_MIN_OPERATIONS))
  const cle = `${String(seed)}|${String(n)}|${String(count)}|${String(length)}`
  const deja = FLUX.get(cle)
  if (deja !== undefined) return clone(deja)
  const streams: PlatformDifferentialStream[] = []
  for (let i = 0; i < count; i += 1) {
    streams.push({ index: i, period: `P${String(n)}`, steps: tirerFlux(`flux|${String(seed)}|P${String(n)}|${String(i)}`, n, length) })
  }
  const out: GeneratePlatformDifferentialStreamsResult = { period: `P${String(n)}`, seed, streams }
  FLUX.set(cle, out)
  return clone(out)
}

/* ════════════════════════════════════════════════════════ séquences ciblées */

/** La clause active à n qui gouverne l'opération d'une étape (citée par les attentes de mise en place). */
function clauseDeLOperation(s: PlatformCheckStep, n: number, repli: string): string {
  const c = contratDe(n)
  const v1 = c.version && s.version === 'v2' ? (c.opV1.get(s.op) ?? s.op) : s.op
  const chercher = (decision: string): string | undefined => c.actives.find((x) => decision in x.implementation)?.id
  if (c.version && s.version !== undefined && s.version !== 'v1' && s.version !== 'v2') return chercher('requete.version') ?? repli
  if (c.version && (s.version === 'v2' ? c.opV2.has(s.op) || !c.ops.has(v1) : c.opV1.has(s.op))) {
    return chercher('requete.noms') ?? chercher('requete.traduction') ?? repli
  }
  if (!c.ops.has(v1)) return chercher('requete.operation_connue') ?? repli
  if (c.version && s.version === 'v2') return chercher('requete.traduction') ?? chercher(`${v1}.effet`) ?? repli
  return chercher(`${v1}.effet`) ?? repli
}

/** Opérations qu'une clause touche (clés de mise en œuvre et contrat). */
function opsDeLaClause(c: PlatformClause): Set<string> {
  const out = new Set<string>()
  for (const k of Object.keys(c.implementation)) {
    const m = /^(?:autorisation\.)?([a-z_]+)\./u.exec(k)
    if (m) out.add(m[1] as string)
  }
  const o = c.contract['operations']
  if (estObjet(o)) for (const k of Object.keys(o)) out.add(k)
  return out
}

/** Budget de recherche d'une frontière : longueurs des flux essayés. */
const ESSAIS = [250, 500, 900, 1400, 2000] as const
const SEQUENCES_PAR_CLAUSE = 2

interface Frontiere {
  readonly steps: PlatformCheckStep[]
  readonly reponses: Json[]
}

/** Cherche, dans un flux tiré pour (clause, n, k), la première étape où source complète et source privée divergent. */
function chercherFrontiere(clause: string, n: number, graine: string, longueur: number, privee: readonly PlatformClause[]): Frontiere | null {
  const complet = new PlatformEngine(PLATFORM_CLAUSES)
  const prive = new PlatformEngine(privee)
  const reponses: Json[] = []
  let trouve = false
  const t = new Tirage(graine, n, (s) => {
    const etape = versEtape(s, n)
    const attendu = appliquer(complet, etape)
    const autre = appliquer(prive, etape)
    reponses.push(attendu)
    if (platformCanonicalJson(attendu) !== platformCanonicalJson(autre)) trouve = true
    return attendu
  })
  const steps = t.tirer(longueur, () => trouve)
  void clause
  return trouve ? { steps, reponses } : null
}

const SEQUENCES = new Map<string, PlatformTargetedSequence[]>()

function sequencesDeLaClause(c: PlatformClause, n: number, seed: number | string): PlatformTargetedSequence[] {
  const cle = `${String(seed)}|${String(n)}|${c.id}`
  const deja = SEQUENCES.get(cle)
  if (deja !== undefined) return deja
  const privee = platformClausesWithout([c.id])
  const trouvees: Frontiere[] = []
  for (let k = 0; k < ESSAIS.length && trouvees.length < SEQUENCES_PAR_CLAUSE; k += 1) {
    const f = chercherFrontiere(c.id, n, `cible|${String(seed)}|P${String(n)}|${c.id}|${String(k)}`, ESSAIS[k] as number, privee)
    if (f !== null) trouvees.push(f)
    else if (trouvees.length > 0) break
  }
  const out: PlatformTargetedSequence[] = []
  const habiller = (steps: readonly PlatformCheckStep[], reponses: readonly Json[], discriminating: boolean): PlatformTargetedSequence => ({
    clause: c.id,
    period: `P${String(n)}`,
    index: out.length,
    discriminating,
    steps: steps.map((s, i) => ({
      ...s,
      expect: { clause: i === steps.length - 1 ? c.id : clauseDeLOperation(s, n, c.id), response: reponses[i] as Json },
    })),
  })
  for (const f of trouvees) out.push(habiller(f.steps, f.reponses, true))
  if (out.length === 0) {
    // Privation sans effet observable dans le budget : une séquence courte qui
    // s'arrête sur une opération que la clause touche.
    const modele = new PlatformEngine(PLATFORM_CLAUSES)
    const reponses: Json[] = []
    const t = new Tirage(`cible|${String(seed)}|P${String(n)}|${c.id}|repli`, n, (s) => {
      const r = appliquer(modele, versEtape(s, n))
      reponses.push(r)
      return r
    })
    const steps = t.tirer(40)
    const ops = opsDeLaClause(c)
    let fin = steps.length - 1
    for (let i = 8; i < steps.length; i += 1) {
      const s = steps[i] as PlatformCheckStep
      const v1 = contratDe(n).opV1.get(s.op) ?? s.op
      if (ops.has(v1)) {
        fin = i
        break
      }
    }
    out.push(habiller(steps.slice(0, fin + 1), reponses.slice(0, fin + 1), false))
  }
  SEQUENCES.set(cle, out)
  return out
}

/**
 * Les séquences ciblées de la période : pour chaque clause active (ou pour
 * `clause` seule), une ou deux séquences ancrées sur sa frontière.
 */
export function generatePlatformTargetedSequences(input: GeneratePlatformTargetedSequencesInput): GeneratePlatformTargetedSequencesResult {
  const n = platformPeriodNumber(input)
  const seed = graineDe(input)
  const actives = contratDe(n).actives
  let visees: readonly PlatformClause[] = actives
  if (input.clause !== undefined) {
    if (!PLATFORM_CLAUSES.some((c) => c.id === input.clause)) throw new Error(`F-PLATFORM : clause inconnue ${input.clause}`)
    visees = actives.filter((c) => c.id === input.clause)
  }
  const sequences: PlatformTargetedSequence[] = []
  for (const c of visees) {
    for (const s of sequencesDeLaClause(c, n, seed)) sequences.push({ ...s, index: sequences.length })
  }
  return { period: `P${String(n)}`, seed, sequences: clone(sequences) }
}

/* ═════════════════════════════════════════════════════ aides de notation */

/** Les réponses d'un modèle attendu NEUF aux étapes, dans l'ordre (période n pour toutes). */
export function platformExpectedResponses(period: number | string, steps: readonly PlatformCheckStep[]): Json[] {
  const n = platformPeriodNumber(period)
  const modele = new PlatformEngine(PLATFORM_CLAUSES)
  return steps.map((s) => appliquer(modele, versEtape(s, n)))
}

/**
 * La clause d'une divergence à l'étape `index` d'un flux joué depuis un état
 * vide : la première clause active dont la privation reproduit exactement
 * la réponse reçue (rejeu du préfixe), essayée d'abord parmi les clauses qui
 * touchent l'opération ; à défaut, la clause qui gouverne l'opération.
 */
export function diagnosePlatformDivergence(input: {
  readonly period: number | string
  readonly steps: readonly PlatformCheckStep[]
  readonly index: number
  readonly received: unknown
  /** Nombre maximal de clauses rejouées (budget). */
  readonly budget?: number
  /** Instant (Date.now()) au-delà duquel on cesse de rejouer des privations. */
  readonly deadline?: number
}): { clause: string; method: 'privation' | 'operation' } {
  const n = platformPeriodNumber(input.period)
  const c = contratDe(n)
  const etape = input.steps[input.index]
  const repli = c.actives[0]?.id ?? 'P1.R1'
  if (etape === undefined) return { clause: repli, method: 'operation' }
  const parOperation = clauseDeLOperation(etape, n, repli)
  const v1 = c.opV1.get(etape.op) ?? etape.op
  const recu = platformCanonicalJson(input.received)
  const touche = c.actives.filter((x) => opsDeLaClause(x).has(v1))
  const autres = c.actives.filter((x) => !touche.includes(x))
  const ordre = [...touche, ...autres].slice(0, input.budget ?? c.actives.length)
  const prefixe = input.steps.slice(0, input.index + 1).map((s) => versEtape(s, n))
  // Le candidat a répondu comme le modèle attendu jusqu'à `index` exclu : une
  // privation qui s'en écarte plus tôt n'explique pas la divergence.
  const modele = new PlatformEngine(PLATFORM_CLAUSES)
  const attendus = prefixe.map((s) => platformCanonicalJson(appliquer(modele, s)))
  for (const x of ordre) {
    if (input.deadline !== undefined && Date.now() > input.deadline) break
    const moteur = new PlatformEngine(platformClausesWithout([x.id]))
    let explique = true
    for (let i = 0; i < prefixe.length && explique; i += 1) {
      const r = platformCanonicalJson(appliquer(moteur, prefixe[i] as PlatformStep))
      explique = i < prefixe.length - 1 ? r === attendus[i] : r === recu
    }
    if (explique) return { clause: x.id, method: 'privation' }
  }
  return { clause: parOperation, method: 'operation' }
}
