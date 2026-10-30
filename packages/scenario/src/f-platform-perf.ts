// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — T75, ADR-021 décision 3 (L206-L212) : contrôles de
// PERFORMANCE (P20 et suivantes) et de CONCURRENCE (P21 et suivantes) de
// F-PLATFORM, côté GÉNÉRATION (pur : aucune E/S, aucun processus). Le banc qui
// lance réellement le candidat est `@bench/activities#measurePlatformLatency`
// et `#runPlatformConcurrencyTrials`.
//
// Les VALEURS viennent de la source de clauses (`@bench/oracle#PLATFORM_CLAUSES`) :
//   - la clause active qui déclare `contract.valeurs.plafonds_p95_ms` (P20.R3) :
//     plafond p95 par opération (`autre` à défaut), plafond de l'import de
//     volume (`import_50000_lignes_ms`), volume (`volume_reservations`) ;
//   - la clause active qui déclare `contract.valeurs.essais_paralleles_min`
//     (P21.R3) : nombre minimal d'essais et clients parallèles par essai.
// Le PROFIL d'import (locataire, créneaux, capacité, membres) et les noms des
// scénarios de concurrence sont ceux de la racine gelée
// (`periodes.P20.volume`, `periodes.P21.concurrence`) : le banc les lit et les
// passe ici ; ce module ne recopie aucune de ces valeurs.
//
// RÉPARTITION DU VOLUME. Le profil dit « membre i mod membres, créneau i mod
// créneaux » ; à la lettre (1000 membres, 500 créneaux) il ne donne que
// ppcm(1000, 500) = 1000 couples (membre, créneau) distincts : les 49 000 autres
// lignes seraient ALREADY_BOOKED (P1.R2) et il n'y aurait que 1000
// réservations, contre P20.R3 (« après import de 50 000 réservations »). On
// suit la répartition fixée par acceptance/T75.spec.ts (II) : ligne i (0-base)
// -> créneau i mod créneaux, membre (i + floor(i / membres)) mod membres ; le
// plan vérifie que les couples sont distincts et que chaque créneau tient dans
// sa capacité, et lève sinon (aucun volume silencieusement réduit).
// ─────────────────────────────────────────────────────────────────────────────
import { PLATFORM_CLAUSES, type PlatformClause } from '@bench/oracle'

import { platformActiveOperations, platformCanonicalJson, platformPeriodNumber, type PlatformCheckStep } from './f-platform-checks.js'

type Json = Record<string, unknown>

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v)
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** ADR-021 décision 3 / acceptance/T75.spec.ts II : échauffement et échantillons par opération. */
export const PLATFORM_LATENCY_MIN_WARMUP = 10
export const PLATFORM_LATENCY_MIN_SAMPLES = 60

/* ═══════════════════════════════════════════ valeurs lues dans la source */

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
const valeurs = (c: PlatformClause): Json => {
  const v = c.contract['valeurs']
  return estObjet(v) ? v : {}
}

export interface PlatformLatencyCeilings {
  /** La clause qui déclare les plafonds (P20.R3). */
  readonly clause: string
  /** Plafond p95 (ms) par opération, dont `autre`. */
  readonly ceilings: Readonly<Record<string, number>>
  /** Plafond de l'import de volume, opération entière (ms). */
  readonly importCeilingMs: number
  /** Réservations à importer avant la mesure. */
  readonly volumeReservations: number
}

/** Plafonds de latence en vigueur à la période (P20 et suivantes), lus dans la source de clauses. */
export function platformLatencyCeilings(period: number | string): PlatformLatencyCeilings {
  const n = platformPeriodNumber(period)
  const c = PLATFORM_CLAUSES.find((x) => estActive(x, n) && estObjet(valeurs(x)['plafonds_p95_ms']))
  if (c === undefined) throw new Error(`F-PLATFORM : aucune clause active a P${String(n)} ne declare plafonds_p95_ms (mesure de latence a partir de P20)`)
  const v = valeurs(c)
  const ceilings: Record<string, number> = {}
  for (const [k, x] of Object.entries(v['plafonds_p95_ms'] as Json)) if (estNombre(x)) ceilings[k] = x
  if (!estNombre(ceilings['autre'])) throw new Error(`F-PLATFORM : ${c.id} sans plafond « autre »`)
  const imp = v['import_50000_lignes_ms']
  const vol = v['volume_reservations']
  if (!estNombre(imp) || !estNombre(vol)) throw new Error(`F-PLATFORM : ${c.id} sans import_50000_lignes_ms ou volume_reservations`)
  return { clause: c.id, ceilings, importCeilingMs: imp, volumeReservations: vol }
}

/** Plafond d'une opération : le sien, à défaut `autre`. */
export function platformLatencyCeiling(c: PlatformLatencyCeilings, op: string): number {
  return c.ceilings[op] ?? (c.ceilings['autre'] as number)
}

export interface PlatformConcurrencyParameters {
  /** La clause qui déclare les paramètres (P21.R3). */
  readonly clause: string
  readonly minTrials: number
  readonly parallelClients: number
}

/** Paramètres des essais parallèles en vigueur à la période (P21 et suivantes), lus dans la source. */
export function platformConcurrencyParameters(period: number | string): PlatformConcurrencyParameters {
  const n = platformPeriodNumber(period)
  const c = PLATFORM_CLAUSES.find((x) => estActive(x, n) && estNombre(valeurs(x)['essais_paralleles_min']))
  if (c === undefined) throw new Error(`F-PLATFORM : aucune clause active a P${String(n)} ne declare essais_paralleles_min (essais paralleles a partir de P21)`)
  const v = valeurs(c)
  const clients = v['clients_paralleles']
  if (!estNombre(clients) || clients < 2) throw new Error(`F-PLATFORM : ${c.id} sans clients_paralleles`)
  return { clause: c.id, minTrials: v['essais_paralleles_min'] as number, parallelClients: clients }
}

/* ═══════════════════════════════════════════════════════ horloge ═══════ */

const SECONDE = 1000
const JOUR = 86_400_000
const iso = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`
const dateDe = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const moisDe = (ms: number): string => new Date(ms).toISOString().slice(0, 7)
const p = (x: number, w: number): string => String(x).padStart(w, '0')

/** Horloge monotone : chaque étape avance d'une seconde. */
class Horloge {
  private t: number
  constructor(depart: number) {
    this.t = depart
  }
  suivante(): string {
    const s = iso(this.t)
    this.t += SECONDE
    return s
  }
  get ms(): number {
    return this.t
  }
  sauterA(ms: number): void {
    if (ms > this.t) this.t = ms
  }
}

function departDe(clock: string): number {
  const t = Date.parse(clock)
  if (!Number.isFinite(t)) throw new Error(`F-PLATFORM : horloge de periode illisible : ${clock}`)
  return t
}

/* ═══════════════════════════════════════════════ plan de volume (A1) ═══ */

/** Profil d'import, tel que `periodes.P20.volume` de la racine gelée le déclare. */
export interface PlatformVolumeProfile {
  readonly tenant_id: string
  readonly creneaux: number
  readonly capacite: number
  readonly membres: number
  readonly reservations: number
  readonly places_par_ligne?: number
}

export interface PlatformVolumeOperationPlan {
  readonly op: string
  readonly warmup: readonly PlatformCheckStep[]
  readonly samples: readonly PlatformCheckStep[]
}

export interface PlatformVolumePlan {
  readonly period: string
  readonly tenant: string
  readonly owner: string
  /** Locataire, membres, créneaux : à jouer avant l'import (non mesurés). */
  readonly setup: readonly PlatformCheckStep[]
  /** L'import de volume (un seul import_bookings), mesuré contre `importCeilingMs`. */
  readonly import: PlatformCheckStep
  readonly rows: number
  /** Une entrée par opération active (sauf import_bookings), dans l'ordre où les jouer. */
  readonly operations: readonly PlatformVolumeOperationPlan[]
}

export interface PlanPlatformVolumeInput {
  readonly period: number | string
  readonly profile: PlatformVolumeProfile
  /** Horloge de la période (`periodes.Pn.horloge` de la racine). */
  readonly clock: string
  readonly warmup?: number
  readonly samples?: number
}

/** Ligne i -> (créneau, membre) : répartition fixée par acceptance/T75.spec.ts II (voir l'en-tête). */
export function platformVolumeRowAssignment(i: number, profile: PlatformVolumeProfile): { slot: number; member: number } {
  return { slot: i % profile.creneaux, member: (i + Math.floor(i / profile.membres)) % profile.membres }
}

function verifierProfil(pr: PlatformVolumeProfile): void {
  for (const k of ['creneaux', 'capacite', 'membres', 'reservations'] as const) {
    if (!Number.isInteger(pr[k]) || pr[k] < 1) throw new Error(`F-PLATFORM : profil de volume, ${k} invalide : ${String(pr[k])}`)
  }
  if (typeof pr.tenant_id !== 'string' || pr.tenant_id === '') throw new Error('F-PLATFORM : profil de volume sans tenant_id')
  const seats = pr.places_par_ligne ?? 1
  const parCreneau = new Array<number>(pr.creneaux).fill(0)
  const couples = new Set<number>()
  for (let i = 0; i < pr.reservations; i += 1) {
    const a = platformVolumeRowAssignment(i, pr)
    couples.add(a.slot * pr.membres + a.member)
    parCreneau[a.slot] = (parCreneau[a.slot] as number) + seats
  }
  if (couples.size !== pr.reservations) {
    throw new Error(`F-PLATFORM : profil de volume : ${String(couples.size)} couples (membre, creneau) distincts pour ${String(pr.reservations)} lignes`)
  }
  if (parCreneau.some((x) => x > pr.capacite)) throw new Error('F-PLATFORM : profil de volume : un creneau depasse sa capacite')
}

/**
 * Le plan de la mesure de latence : locataire du profil, membres, créneaux,
 * l'import de volume, puis pour CHAQUE opération active (sauf import_bookings)
 * `warmup` + `samples` requêtes qui RÉUSSISSENT toutes sur l'état importé.
 * Deux phases d'horloge : A (créneaux à venir : réservations, migrations,
 * fusions...) puis B (après le début de tous les créneaux : absences,
 * clôtures, effacements, factures). Les opérations qui figent le locataire
 * (issue_invoices interdit ensuite set_timezone et merge_tenants) sont jouées
 * après celles qu'elles interdiraient.
 */
export function planPlatformVolume(input: PlanPlatformVolumeInput): PlatformVolumePlan {
  const n = platformPeriodNumber(input.period)
  const pr = input.profile
  verifierProfil(pr)
  const nbW = Math.max(PLATFORM_LATENCY_MIN_WARMUP, Math.floor(input.warmup ?? PLATFORM_LATENCY_MIN_WARMUP))
  const nbS = Math.max(PLATFORM_LATENCY_MIN_SAMPLES, Math.floor(input.samples ?? PLATFORM_LATENCY_MIN_SAMPLES))
  const total = nbW + nbS
  const T = pr.tenant_id
  const owner = `${T}-owner`
  const depart = departDe(input.clock)
  const h = new Horloge(depart)
  const largeurM = String(pr.membres - 1).length
  const largeurS = String(pr.creneaux - 1).length
  const membre = (k: number): string => `${T}-m${p(((k % pr.membres) + pr.membres) % pr.membres, largeurM)}`
  const creneau = (k: number): string => `${T}-s${p(((k % pr.creneaux) + pr.creneaux) % pr.creneaux, largeurS)}`
  const debutCreneaux = depart + 7 * JOUR
  const debut = (j: number): number => debutCreneaux + j * 3_600_000
  const finCreneaux = debut(pr.creneaux)
  const reservation = (i: number): string => `${T}-b${String(i)}`
  const etape = (op: string, args: Json, avecTenant = true): PlatformCheckStep =>
    avecTenant ? { op, args, at: h.suivante(), tenant: T, actor: owner } : { op, args, at: h.suivante() }

  if (total > pr.creneaux || total > pr.membres || 4 * total > pr.reservations) {
    throw new Error(`F-PLATFORM : profil de volume trop petit pour ${String(total)} requetes par operation`)
  }

  // Préparation : locataire, membres, créneaux.
  const setup: PlatformCheckStep[] = [etape('create_tenant', { tenant_id: T, owner_id: owner }, false)]
  for (let k = 0; k < pr.membres; k += 1) setup.push(etape('add_member', { member_id: membre(k), role: 'member' }))
  for (let j = 0; j < pr.creneaux; j += 1) setup.push(etape('create_slot', { slot_id: creneau(j), capacity: pr.capacite, starts_at: iso(debut(j)) }))
  const seats = pr.places_par_ligne
  const rows: Json[] = []
  for (let i = 0; i < pr.reservations; i += 1) {
    const a = platformVolumeRowAssignment(i, pr)
    const r: Json = { request_id: reservation(i), member_id: membre(a.member), slot_id: creneau(a.slot) }
    if (seats !== undefined) r['seats'] = seats
    rows.push(r)
  }
  const imp = etape('import_bookings', { import_id: `${T}-import`, rows })

  // Lignes choisies pour les opérations qui visent une réservation importée :
  // des tranches disjointes, réparties sur tout le volume.
  const tranche = (base: number, k: number): number => (base + k * Math.floor(pr.reservations / total)) % pr.reservations
  const actives = new Set(platformActiveOperations(n))
  actives.delete('import_bookings')

  type Generateur = (k: number) => PlatformCheckStep
  // Phase A : tous les créneaux sont à venir.
  const debutX = depart + 6 * JOUR
  const phaseA: [string, Generateur][] = [
    ['get_booking', (k) => etape('get_booking', { booking_id: reservation(tranche(7, k)) })],
    ['get_slot', (k) => etape('get_slot', { slot_id: creneau(k * 7) })],
    ['get_wallet', (k) => etape('get_wallet', { member_id: membre(k * 13) })],
    ['list_documents', (k) => etape('list_documents', { member_id: membre(k * 17) })],
    ['report_occupancy', (k) => etape('report_occupancy', { from: iso(debutCreneaux), to: iso(finCreneaux), page_size: 100, page: (k % Math.max(1, Math.ceil(pr.creneaux / 100))) + 1 })],
    ['create_slot', (k) => etape('create_slot', { slot_id: `${T}-x${String(k)}`, capacity: pr.capacite, starts_at: iso(debutX + k * 60_000) })],
    ['reserve', (k) => etape('reserve', { request_id: `${T}-r${String(k)}`, member_id: membre(k), slot_id: `${T}-x${String(k)}` })],
    ['set_price', (k) => etape('set_price', { slot_id: creneau(k), price_cents: 0 })],
    ['cancel', (k) => etape('cancel', { booking_id: reservation(tranche(11, k)) })],
    ['create_tenant', (k) => etape('create_tenant', { tenant_id: `${T}-t${String(k)}`, owner_id: owner }, false)],
    ['merge_tenants', (k) => etape('merge_tenants', { source_tenant_id: `${T}-t${String(k)}` })],
    ['add_member', (k) => etape('add_member', { member_id: `${T}-n${String(k)}`, role: 'member' })],
    ['set_tier', (k) => etape('set_tier', { member_id: membre(k), tier: 'silver' })],
    ['top_up', (k) => etape('top_up', { member_id: membre(k), amount_cents: 1000 })],
    [
      'create_recurring',
      (k) => {
        const d0 = debutX + (k % 7) * JOUR
        return etape('create_recurring', { series_id: `${T}-y${String(k)}`, weekday: ((new Date(d0).getUTCDay() + 6) % 7) + 1, start_time: '10:00', capacity: 10, from_date: dateDe(d0), until_date: dateDe(d0 + 21 * JOUR) })
      },
    ],
    ['list_occurrences', (k) => etape('list_occurrences', { series_id: `${T}-y${String(k)}` })],
    ['add_exception', (k) => etape('add_exception', { series_id: `${T}-y${String(k)}`, date: dateDe(debutX + (k % 7) * JOUR) })],
    ['set_timezone', () => etape('set_timezone', { timezone: 'UTC' })],
    ['number_seats', (k) => etape('number_seats', { slot_id: creneau(Math.floor(pr.creneaux / 5) + k) })],
    ['set_rate', (k) => etape('set_rate', { currency: 'USD', date: dateDe(depart - (k + 1) * JOUR), rate_micro: 912_500 })],
    [
      'change_price',
      (k) => {
        const s = etape('change_price', { slot_id: creneau(Math.floor((2 * pr.creneaux) / 5) + k), price_cents: 0 })
        return { ...s, args: { ...s.args, effective_from: s.at } }
      },
    ],
  ]
  // Phase B : après le début de tous les créneaux (ceux du profil, les créneaux x et les séries).
  const debutB = Math.max(finCreneaux, debutX + 40 * JOUR) + JOUR
  const moisB = Date.UTC(new Date(debutB).getUTCFullYear(), new Date(debutB).getUTCMonth(), 1)
  const moisAvant = (k: number): string => {
    const d = new Date(moisB)
    return moisDe(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (total - k), 1))
  }
  const phaseB: [string, Generateur][] = [
    ['mark_no_show', (k) => etape('mark_no_show', { booking_id: reservation(tranche(13, k)) })],
    ['close_slot', (k) => etape('close_slot', { slot_id: creneau(Math.floor((3 * pr.creneaux) / 5) + k) })],
    // Cibles : les membres ajoutés par la mesure d'add_member (phase A), sans réservation ; le
    // locataire est celui du volume (50 000 réservations), que l'effacement parcourt. Un membre
    // importé ferait aussi réécrire, dans le candidat de référence, les 50 000 lignes mémorisées
    // de l'import (P21.R2) : coût d'une représentation, pas de la règle (voir le rapport de T75).
    ['erase_member', (k) => etape('erase_member', { member_id: `${T}-n${String(k)}` })],
    ['issue_invoices', (k) => etape('issue_invoices', { month: moisAvant(k) })],
    ['report_revenue', (k) => etape('report_revenue', { from_month: moisAvant(0), to_month: moisAvant(total - 1), page_size: 100 })],
  ]

  const operations: PlatformVolumeOperationPlan[] = []
  const jouer = (liste: readonly [string, Generateur][]): void => {
    for (const [op, g] of liste) {
      if (!actives.has(op)) continue
      const steps = Array.from({ length: total }, (_, k) => g(k))
      operations.push({ op, warmup: steps.slice(0, nbW), samples: steps.slice(nbW) })
      actives.delete(op)
    }
  }
  jouer(phaseA)
  h.sauterA(debutB)
  jouer(phaseB)
  if (actives.size > 0) throw new Error(`F-PLATFORM : aucune requete de mesure pour l'operation active ${[...actives].join(', ')}`)
  return { period: `P${String(n)}`, tenant: T, owner, setup, import: imp, rows: rows.length, operations }
}

/** p95 au rang le plus proche : échantillons triés, valeur de rang ceil(0,95 × S) (1-base). */
export function platformP95(samples: readonly number[]): number {
  if (samples.length === 0) return NaN
  const s = [...samples].sort((a, b) => a - b)
  return s[Math.max(0, Math.ceil(0.95 * s.length) - 1)] as number
}

/* ═══════════════════════════════════════════ essais parallèles (A2) ═══ */

/** Les scénarios connus (bloc `periodes.P21.concurrence.scenarios` de la racine). */
export const PLATFORM_CONCURRENCY_SCENARIOS = ['derniere_place', 'rejeux_simultanes', 'rejeux_en_conflit', 'import_et_reserve'] as const

export interface PlatformConcurrencyTrialPlan {
  readonly index: number
  readonly scenario: string
  /** Préparation séquentielle (non comptée). */
  readonly setup: readonly PlatformCheckStep[]
  /** Une requête par client, toutes en vol en même temps. */
  readonly parallel: readonly PlatformCheckStep[]
  /** Vérifications séquentielles, après les réponses parallèles. */
  readonly checks: readonly PlatformCheckStep[]
  readonly slot: string
}

export interface PlatformConcurrencyPlan {
  readonly period: string
  readonly tenant: string
  readonly owner: string
  readonly setup: readonly PlatformCheckStep[]
  readonly trials: readonly PlatformConcurrencyTrialPlan[]
}

export interface PlanPlatformConcurrencyInput {
  readonly period: number | string
  readonly clock: string
  /** Noms des scénarios (racine) ; chacun doit être connu. */
  readonly scenarios: readonly string[]
  readonly minTrials: number
  readonly parallelClients: number
  readonly tenant?: string
}

export function planPlatformConcurrency(input: PlanPlatformConcurrencyInput): PlatformConcurrencyPlan {
  const n = platformPeriodNumber(input.period)
  const N = input.parallelClients
  if (!Number.isInteger(N) || N < 2) throw new Error(`F-PLATFORM : clients paralleles invalides : ${String(N)}`)
  if (input.scenarios.length === 0) throw new Error('F-PLATFORM : aucun scenario de concurrence')
  for (const s of input.scenarios) {
    if (!(PLATFORM_CONCURRENCY_SCENARIOS as readonly string[]).includes(s)) throw new Error(`F-PLATFORM : scenario de concurrence inconnu : ${s}`)
  }
  const T = input.tenant ?? 't-concurrence'
  const owner = `${T}-owner`
  const depart = departDe(input.clock)
  const h = new Horloge(depart)
  const nbMembres = 2 * N
  const membre = (k: number): string => `${T}-m${p(k, String(nbMembres - 1).length)}`
  const etape = (op: string, args: Json, avecTenant = true): PlatformCheckStep =>
    avecTenant ? { op, args, at: h.suivante(), tenant: T, actor: owner } : { op, args, at: h.suivante() }
  const setup: PlatformCheckStep[] = [etape('create_tenant', { tenant_id: T, owner_id: owner }, false)]
  for (let k = 0; k < nbMembres; k += 1) setup.push(etape('add_member', { member_id: membre(k), role: 'member' }))

  const parScenario = Math.ceil(input.minTrials / input.scenarios.length)
  const nb = Math.max(input.minTrials, parScenario * input.scenarios.length)
  const debutCreneaux = depart + 30 * JOUR
  const trials: PlatformConcurrencyTrialPlan[] = []
  for (let i = 0; i < nb; i += 1) {
    const scenario = input.scenarios[i % input.scenarios.length] as string
    const slot = `${T}-s${String(i)}`
    const capacite = scenario === 'derniere_place' ? 1 : scenario === 'import_et_reserve' ? Math.max(1, Math.floor(N / 2)) : N + 1
    const pre = [etape('create_slot', { slot_id: slot, capacity: capacite, starts_at: iso(debutCreneaux + i * 60_000) })]
    const at = h.suivante()
    const par = (op: string, args: Json): PlatformCheckStep => ({ op, args, at, tenant: T, actor: owner })
    const parallel: PlatformCheckStep[] = []
    const rid = `${T}-c${String(i)}`
    if (scenario === 'derniere_place') {
      for (let k = 0; k < N; k += 1) parallel.push(par('reserve', { request_id: `${rid}-${String(k)}`, member_id: membre(k), slot_id: slot }))
    } else if (scenario === 'rejeux_simultanes') {
      for (let k = 0; k < N; k += 1) parallel.push(par('reserve', { request_id: rid, member_id: membre(0), slot_id: slot }))
    } else if (scenario === 'rejeux_en_conflit') {
      for (let k = 0; k < N; k += 1) parallel.push(par('reserve', { request_id: rid, member_id: membre(k), slot_id: slot }))
    } else {
      // import_et_reserve : un import (assez de lignes pour remplir le créneau) et N - 1 reserve.
      const lignes = Array.from({ length: capacite }, (_, j) => ({ request_id: `${rid}-i${String(j)}`, member_id: membre(N + j), slot_id: slot }))
      parallel.push(par('import_bookings', { import_id: `${rid}-imp`, rows: lignes }))
      for (let k = 1; k < N; k += 1) parallel.push(par('reserve', { request_id: `${rid}-${String(k)}`, member_id: membre(k), slot_id: slot }))
    }
    const checks: PlatformCheckStep[] = [etape('get_slot', { slot_id: slot })]
    if (scenario === 'rejeux_simultanes' || scenario === 'rejeux_en_conflit') checks.push(etape('get_booking', { booking_id: rid }))
    trials.push({ index: i, scenario, setup: pre, parallel, checks, slot })
  }
  return { period: `P${String(n)}`, tenant: T, owner, setup, trials }
}

/** Une violation d'invariant (P21.R3 / P21.R4) observée dans un essai. */
export interface PlatformConcurrencyViolation {
  readonly trial: number
  readonly scenario: string
  /** 'capacity' (dépassement de capacité), 'idempotency' (doublon idempotent), 'serialisation' (issue non sérialisable). */
  readonly kind: 'capacity' | 'idempotency' | 'serialisation'
  readonly clause: string
  readonly detail: string
}

const ok = (r: unknown): boolean => estObjet(r) && r['ok'] === true
const statut = (r: unknown): string | null => (estObjet(r) && typeof r['status'] === 'string' ? r['status'] : null)

/**
 * Juge un essai sur les réponses parallèles et les vérifications. Les
 * invariants lus sur les RÉPONSES (places confirmées rendues, réponses ok
 * distinctes pour une clé) détectent aussi une mise à jour perdue que l'état
 * final ne montrerait plus.
 */
export function judgePlatformConcurrencyTrial(input: {
  readonly trial: PlatformConcurrencyTrialPlan
  readonly responses: readonly unknown[]
  readonly checks: readonly unknown[]
  readonly clauses?: { readonly capacity?: string; readonly idempotency?: string; readonly serialisation?: string }
}): PlatformConcurrencyViolation[] {
  const { trial } = input
  const out: PlatformConcurrencyViolation[] = []
  const cl = { capacity: 'P21.R3', idempotency: 'P21.R1', serialisation: 'P21.R4', ...(input.clauses ?? {}) }
  const v = (kind: PlatformConcurrencyViolation['kind'], detail: string): void => {
    out.push({ trial: trial.index, scenario: trial.scenario, kind, clause: cl[kind], detail })
  }
  const slot = input.checks[0]
  const capacite = estObjet(slot) && estNombre(slot['capacity']) ? slot['capacity'] : null
  const plafond = estObjet(slot) && estNombre(slot['overbook_limit']) ? slot['overbook_limit'] : capacite
  const booked = estObjet(slot) && estNombre(slot['booked']) ? slot['booked'] : null
  if (!ok(slot) || plafond === null || booked === null) v('serialisation', `verification get_slot illisible : ${platformCanonicalJson(slot).slice(0, 200)}`)
  const rs = input.responses
  const nonRepondues = rs.filter((r) => r === undefined).length
  if (nonRepondues > 0) v('serialisation', `${String(nonRepondues)} requete(s) parallele(s) sans reponse`)

  // Places confirmées RENDUES par les réponses (reserve : seats de la réponse confirmed ; import : confirmed).
  let confirmees = 0
  trial.parallel.forEach((s, k) => {
    const r = rs[k]
    if (!ok(r)) return
    if (s.op === 'import_bookings') {
      const c = (r as Json)['confirmed']
      if (estNombre(c)) confirmees += c
    } else if (statut(r) === 'confirmed') {
      const seats = (r as Json)['seats']
      confirmees += estNombre(seats) ? seats : 1
    }
  })
  const capaciteDepassee = (): void => {
    if (plafond !== null && confirmees > plafond) v('capacity', `${String(confirmees)} place(s) confirmee(s) par les reponses paralleles pour un plafond de ${String(plafond)}`)
    if (plafond !== null && booked !== null && booked > plafond) v('capacity', `booked ${String(booked)} > overbook_limit ${String(plafond)} apres l'essai`)
  }

  if (trial.scenario === 'derniere_place') {
    capaciteDepassee()
    const c = rs.filter((r) => statut(r) === 'confirmed').length
    const w = rs.filter((r) => statut(r) === 'waiting').length
    if (c <= (plafond ?? 1) && (c !== 1 || w !== rs.length - 1)) v('serialisation', `${String(c)} confirmed et ${String(w)} waiting (attendu 1 et ${String(rs.length - 1)}, P21.R4)`)
  } else if (trial.scenario === 'import_et_reserve') {
    capaciteDepassee()
    const lignesRefusees = rs.filter((r, k) => trial.parallel[k]?.op === 'import_bookings' && !ok(r)).length
    if (lignesRefusees > 0) v('serialisation', "l'import concurrent est refuse")
  } else {
    const distinctes = new Set(rs.filter(ok).map((r) => platformCanonicalJson(r)))
    if (trial.scenario === 'rejeux_simultanes') {
      if (new Set(rs.map((r) => platformCanonicalJson(r))).size !== 1 || distinctes.size !== 1) v('idempotency', `${String(new Set(rs.map((r) => platformCanonicalJson(r))).size)} reponses distinctes pour ${String(rs.length)} rejeux identiques`)
    } else {
      if (distinctes.size > 1) v('idempotency', `${String(distinctes.size)} reponses ok distinctes pour une meme cle request_id (une seule creation attendue)`)
      if (distinctes.size === 0) v('serialisation', 'aucune requete de la cle ne reussit')
      const autres = rs.filter((r) => !ok(r) && !(estObjet(r) && r['error'] === 'IDEMPOTENCY_CONFLICT')).length
      if (autres > 0) v('serialisation', `${String(autres)} refus autre qu'IDEMPOTENCY_CONFLICT`)
    }
    if (booked !== null && booked > 1) v('idempotency', `booked ${String(booked)} : plusieurs reservations pour une meme cle request_id`)
    const b = input.checks[1]
    if (!ok(b)) v('idempotency', 'la reservation de la cle est introuvable apres l essai')
  }
  return out
}
