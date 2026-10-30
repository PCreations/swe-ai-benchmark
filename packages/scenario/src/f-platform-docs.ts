// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — les documents de période de F-PLATFORM (tâche T73,
// ADR-021 décision 4 : « comme un vrai projet, tickets et documentation dans le
// dépôt »).
//
// `renderPlatformPeriodDocs(n, { clauses? })` rend, pour la période n (1..24),
// les trois fichiers que le moteur écrit dans le dépôt du candidat :
//
//   docs/spec.md         la spécification consolidée : le texte EXACT de
//                        chaque clause active à n (et d'aucune autre), avec
//                        ses précisions ;
//   docs/api.md          le contrat d'interface en vigueur : enveloppe,
//                        opérations (arguments, réponses, erreurs), autres
//                        fragments de contrat, unités et formats de chaque
//                        grandeur, vocabulaire comparé (chaque valeur avec le
//                        nom de son champ) et exemples, au moins un par forme
//                        de réponse, succès et erreur ;
//   docs/tickets/Pnn.md  le ticket : clauses ajoutées, remplacées (avec leur
//                        remplaçante sur la même ligne), retirées, puis les
//                        critères d'acceptation de chaque clause nouvelle,
//                        illustrés d'exemples.
//
// TOUT DÉRIVE DE LA SOURCE DE CLAUSES (ADR-021 décision 1) : la source
// exportée par `@bench/oracle`, ou celle que l'appelant fournit dans
// `options.clauses` (même forme). Aucun texte n'est écrit à la main par
// période : textes, contrat, unités et vocabulaire sont lus dans les clauses
// actives ; les différences entre périodes sont calculées sur leurs bornes
// [enters, exits[ et leurs remplacements.
//
// LES EXEMPLES NE REPRODUISENT AUCUN FAIT (ADR-020 décision 2). Les
// `contract.exemples` de la source reprennent les identifiants et les montants
// de la trajectoire principale : beaucoup reproduisent mot pour mot une
// réponse attendue. Ils ne sont donc jamais recopiés. Chaque exemple est
// CALCULÉ par le modèle attendu (le moteur `PlatformEngine` exécutant les
// clauses fournies, c'est-à-dire leur mise en œuvre) sur un SCÉNARIO
// D'ILLUSTRATION écrit une seule fois pour toutes les périodes : identifiants
// préfixés `ex-`, instants en 2047-2048, montants propres. À la période n, le
// scénario est rejoué entièrement sous les clauses actives à n ; une opération
// absente du contrat de n n'est pas jouée, un argument non déclaré à n est
// retiré. Une sonde par opération (arguments remplacés par des valeurs
// inconnues) donne la forme d'erreur. À partir de la version v2 du contrat, le
// même scénario est rejoué traduit par la correspondance déclarée.
// Seul repli : quand le moteur ne peut rien exécuter pour une clause (source
// fournie incohérente), les exemples de cette clause sont ceux de la source,
// identifiants renommés en `ex-…` — jamais tels quels.
//
// Déterministe pour une période et une source données ; pur (aucune E/S).
// ─────────────────────────────────────────────────────────────────────────────

import { PlatformEngine, platformClauses, type PlatformClause, type PlatformStep } from '@bench/oracle'

import { PLATFORM_CANDIDATE_PROTOCOL } from './f-platform-checks.js'

type Json = Record<string, unknown>

/** Nombre de périodes de F-PLATFORM (ADR-021 décision 2). */
export const F_PLATFORM_PERIOD_COUNT = 24

/** Chemin du ticket de la période n : `docs/tickets/Pnn.md`, nn sur deux chiffres. */
export function platformTicketPath(n: number): string {
  return `docs/tickets/P${String(n).padStart(2, '0')}.md`
}

export const PLATFORM_SPEC_PATH = 'docs/spec.md'
export const PLATFORM_API_PATH = 'docs/api.md'

export interface PlatformPeriodDocsOptions {
  /** Source de clauses à utiliser à la place de la source exportée (même forme). */
  readonly clauses?: readonly unknown[]
}

/* ═══════════════════════════════════════════ lecture tolérante d'une clause */

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v)

interface Clause {
  readonly id: string
  readonly enters: number | null
  readonly exits: number | null
  readonly replaces: readonly string[]
  readonly text: string
  readonly contract: Json
  readonly precisions: readonly Json[]
  readonly brut: Json
}

function numeroPeriode(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string') {
    const m = /^[Pp]?(\d{1,2})$/.exec(v.trim())
    if (m) return Number(m[1])
  }
  return null
}

function lireClause(c: Json): Clause {
  const r = c['replaces']
  const remplace = typeof r === 'string' ? [r] : Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
  const p = c['precisions']
  return {
    id: String(c['id']),
    enters: numeroPeriode(c['enters']),
    exits: c['exits'] === null || c['exits'] === undefined ? null : numeroPeriode(c['exits']),
    replaces: remplace,
    text: typeof c['text'] === 'string' ? c['text'] : '',
    contract: estObjet(c['contract']) ? c['contract'] : {},
    precisions: Array.isArray(p) ? p.filter(estObjet) : [],
    brut: c,
  }
}

function active(c: Clause, n: number): boolean {
  return c.enters !== null && c.enters <= n && (c.exits === null || n < c.exits)
}

/* ═════════════════════════════════════════════ différence entre périodes */

interface Difference {
  readonly ajoutees: Clause[]
  /** Clauses entrant à n en remplaçant une ou plusieurs autres. */
  readonly remplacantes: Clause[]
  readonly retirees: Clause[]
}

function difference(clauses: readonly Clause[], n: number): Difference {
  const avant = new Set(n <= 1 ? [] : clauses.filter((c) => active(c, n - 1)).map((c) => c.id))
  const apres = clauses.filter((c) => active(c, n))
  const entrantes = apres.filter((c) => !avant.has(c.id))
  const ajoutees = entrantes.filter((c) => c.replaces.length === 0)
  const remplacantes = entrantes.filter((c) => c.replaces.length > 0)
  const remplacees = new Set(remplacantes.flatMap((c) => c.replaces))
  const ids = new Set(apres.map((c) => c.id))
  const retirees = clauses.filter((c) => avant.has(c.id) && !ids.has(c.id) && !remplacees.has(c.id))
  return { ajoutees, remplacantes, retirees }
}

/* ═══════════════════════════════════════════════════ le contrat en vigueur */

interface ContratEnVigueur {
  /** Opérations du contrat v1 (fragments `operations.<op>` objets), dans l'ordre d'apparition. */
  readonly operations: string[]
  /** Arguments déclarés par opération (union des fragments actifs) ; absent = non déclaré. */
  readonly arguments: Map<string, Set<string>>
  /** Champs de l'enveloppe déclarés par une clause active (tenant, actor, version). */
  readonly enveloppe: Set<string>
  /** Correspondance v1 -> v2 des noms d'opérations et de clés, si une clause active la déclare. */
  readonly opV2: Map<string, string>
  readonly cleV2: Map<string, string>
}

function contratEnVigueur(clauses: readonly Clause[], n: number): ContratEnVigueur {
  const operations: string[] = []
  const args = new Map<string, Set<string>>()
  const enveloppe = new Set<string>()
  const opV2 = new Map<string, string>()
  const cleV2 = new Map<string, string>()
  for (const c of clauses) {
    if (!active(c, n)) continue
    const ops = c.contract['operations']
    if (estObjet(ops)) {
      for (const [op, frag] of Object.entries(ops)) {
        if (typeof frag === 'string') {
          opV2.set(op, frag)
          continue
        }
        if (!estObjet(frag)) continue
        if (!operations.includes(op)) operations.push(op)
        const a = frag['arguments']
        if (estObjet(a)) {
          const s = args.get(op) ?? new Set<string>()
          for (const k of Object.keys(a)) s.add(k)
          args.set(op, s)
        }
      }
    }
    const env = c.contract['enveloppe']
    if (estObjet(env)) for (const k of Object.keys(env)) enveloppe.add(k)
    const champs = c.contract['champs']
    if (estObjet(champs)) for (const [k, v] of Object.entries(champs)) if (typeof v === 'string') cleV2.set(k, v)
  }
  return { operations, arguments: args, enveloppe, opV2, cleV2 }
}

function exemplesSource(c: Clause): Json[] {
  const v = c.contract['exemples'] ?? c.contract['examples']
  return Array.isArray(v) ? v.filter(estObjet) : []
}

function opsDesExemples(c: Clause): string[] {
  const out: string[] = []
  for (const e of exemplesSource(c)) {
    const rq = e['requete'] ?? e['request']
    if (estObjet(rq) && typeof rq['op'] === 'string' && !out.includes(rq['op'])) out.push(rq['op'])
  }
  return out
}

/* ═══════════════════════════════════ le scénario d'illustration (une fois) */

interface PasIllustration {
  readonly at: string
  readonly op: string
  readonly tenant?: string
  readonly actor?: string
  readonly args: Json
}

const STUDIO = 'ex-studio'
const ANNEXE = 'ex-annexe'
const OLGA = 'ex-olga' // propriétaire des deux locataires (admin)
const PAUL = 'ex-paul' // staff

/** Un pas du scénario ; locataire `ex-studio` et acteur `ex-paul` (staff) par défaut. */
function pas(at: string, op: string, args: Json, actor: string = PAUL, tenant: string = STUDIO): PasIllustration {
  return { at, op, tenant, actor, args }
}
const adm = (at: string, op: string, args: Json, tenant: string = STUDIO): PasIllustration => pas(at, op, args, OLGA, tenant)

/**
 * Scénario d'illustration de toute la plateforme, écrit UNE fois et rejoué à
 * chaque période sous les clauses actives : il ne contient ni règle ni réponse
 * attendue — les réponses sont calculées par le modèle attendu. Ses valeurs
 * (identifiants `ex-…`, années 2047-2048, prix et soldes) sont propres à la
 * documentation.
 */
const SCENARIO_ILLUSTRATION: readonly PasIllustration[] = [
  // Locataires, membres, réglages (2 janvier 2047).
  { at: '2047-01-02T09:00:00Z', op: 'create_tenant', args: { tenant_id: STUDIO, owner_id: OLGA } },
  { at: '2047-01-02T09:01:00Z', op: 'create_tenant', args: { tenant_id: ANNEXE, owner_id: OLGA } },
  adm('2047-01-02T09:02:00Z', 'add_member', { member_id: PAUL, role: 'staff' }),
  adm('2047-01-02T09:03:00Z', 'add_member', { member_id: 'ex-lea', role: 'member' }),
  adm('2047-01-02T09:03:10Z', 'add_member', { member_id: 'ex-noe', role: 'member' }),
  adm('2047-01-02T09:03:20Z', 'add_member', { member_id: 'ex-ines', role: 'member' }),
  adm('2047-01-02T09:03:30Z', 'add_member', { member_id: 'ex-yann', role: 'member' }),
  adm('2047-01-02T09:03:40Z', 'add_member', { member_id: 'ex-zoe', role: 'member' }),
  adm('2047-01-02T09:03:50Z', 'add_member', { member_id: 'ex-max', role: 'member' }),
  adm('2047-01-02T09:04:00Z', 'add_member', { member_id: 'ex-ugo', role: 'member' }),
  adm('2047-01-02T09:10:00Z', 'set_timezone', { timezone: 'Europe/Paris' }),
  adm('2047-01-02T09:11:00Z', 'set_rate', { currency: 'USD', date: '2047-01-01', rate_micro: 875000 }),
  adm('2047-01-02T09:12:00Z', 'set_tier', { member_id: 'ex-lea', tier: 'silver' }),
  adm('2047-01-02T09:12:30Z', 'set_tier', { member_id: 'ex-noe', tier: 'gold' }),
  pas('2047-01-02T09:14:00Z', 'top_up', { member_id: 'ex-lea', amount_cents: 5000 }),
  pas('2047-01-02T09:15:00Z', 'top_up', { member_id: 'ex-noe', amount_cents: 3000, currency: 'USD' }),
  pas('2047-01-02T09:15:30Z', 'top_up', { member_id: 'ex-ugo', amount_cents: 700 }),
  pas('2047-01-02T09:16:00Z', 'get_wallet', { member_id: 'ex-lea' }, 'ex-lea'),
  // Créneaux et prix.
  pas('2047-01-02T09:20:00Z', 'create_slot', { slot_id: 'ex-A1', capacity: 2, starts_at: '2047-01-20T17:00:00Z' }),
  adm('2047-01-02T09:20:10Z', 'set_price', { slot_id: 'ex-A1', price_cents: 1500 }),
  pas('2047-01-02T09:21:00Z', 'create_slot', { slot_id: 'ex-A2', capacity: 4, starts_at: '2047-03-10T17:00:00Z' }),
  adm('2047-01-02T09:21:10Z', 'set_price', { slot_id: 'ex-A2', price_cents: 2400 }),
  pas('2047-01-02T09:22:00Z', 'create_slot', { slot_id: 'ex-A3', capacity: 10, starts_at: '2047-01-25T18:00:00Z' }),
  pas('2047-01-02T09:23:00Z', 'create_slot', { slot_id: 'ex-A4', capacity: 3, starts_at: '2047-04-15T17:00:00Z' }),
  adm('2047-01-02T09:23:10Z', 'set_price', { slot_id: 'ex-A4', price_cents: 1800, currency: 'USD' }),
  pas('2047-01-02T09:24:00Z', 'create_slot', { slot_id: 'ex-A5', capacity: 1, starts_at: '2047-03-20T17:00:00Z' }),
  adm('2047-01-02T09:24:10Z', 'set_price', { slot_id: 'ex-A5', price_cents: 1200 }),
  pas('2047-01-02T09:25:00Z', 'create_slot', { slot_id: 'ex-A6', capacity: 3, starts_at: '2047-04-01T17:00:00Z' }),
  adm('2047-01-02T09:25:10Z', 'set_price', { slot_id: 'ex-A6', price_cents: 2000 }),
  pas('2047-01-02T09:26:00Z', 'create_slot', { slot_id: 'ex-A7', capacity: 2, starts_at: '2047-04-20T17:00:00Z' }),
  pas('2047-01-02T09:27:00Z', 'create_slot', { slot_id: 'ex-A8', capacity: 2, starts_at: '2047-03-25T17:00:00Z' }),
  adm('2047-01-02T09:27:10Z', 'set_price', { slot_id: 'ex-A8', price_cents: 1000 }),
  pas('2047-01-02T09:28:00Z', 'create_slot', { slot_id: 'ex-A9', capacity: 3, starts_at: '2047-04-25T17:00:00Z' }),
  adm('2047-01-02T09:28:10Z', 'set_price', { slot_id: 'ex-A9', price_cents: 900 }),
  pas('2047-01-02T09:29:00Z', 'create_slot', { slot_id: 'ex-N1', capacity: 2, starts_at: '2047-01-08T07:00:00Z' }),
  pas('2047-01-02T09:29:10Z', 'create_slot', { slot_id: 'ex-N2', capacity: 2, starts_at: '2047-01-10T07:00:00Z' }),
  pas('2047-01-02T09:29:20Z', 'create_slot', { slot_id: 'ex-N3', capacity: 2, starts_at: '2047-01-12T07:00:00Z' }),
  // Réservations (3 janvier 2047).
  pas('2047-01-03T10:00:00Z', 'reserve', { request_id: 'ex-r01', member_id: 'ex-lea', slot_id: 'ex-A1' }),
  pas('2047-01-03T10:01:00Z', 'reserve', { request_id: 'ex-r02', member_id: 'ex-noe', slot_id: 'ex-A1' }, 'ex-noe'),
  pas('2047-01-03T10:02:00Z', 'reserve', { request_id: 'ex-r03', member_id: 'ex-ines', slot_id: 'ex-A1' }),
  pas('2047-01-03T10:02:30Z', 'reserve', { request_id: 'ex-r03', member_id: 'ex-ines', slot_id: 'ex-A1' }),
  pas('2047-01-03T10:03:00Z', 'get_booking', { booking_id: 'ex-r03' }),
  pas('2047-01-03T10:04:00Z', 'get_slot', { slot_id: 'ex-A1' }),
  pas('2047-01-03T10:05:00Z', 'reserve', { request_id: 'ex-r04', member_id: 'ex-lea', slot_id: 'ex-A2', seats: 2 }),
  pas('2047-01-03T10:06:00Z', 'reserve', { request_id: 'ex-r05', member_id: 'ex-zoe', slot_id: 'ex-A2' }),
  pas('2047-01-03T10:07:00Z', 'reserve', { request_id: 'ex-r06', member_id: 'ex-noe', slot_id: 'ex-A2' }),
  pas('2047-01-03T10:08:00Z', 'reserve', { request_id: 'ex-r07', member_id: 'ex-ines', slot_id: 'ex-A2' }),
  adm('2047-01-03T10:09:00Z', 'number_seats', { slot_id: 'ex-A2' }),
  pas('2047-01-03T10:10:00Z', 'get_slot', { slot_id: 'ex-A2' }),
  pas('2047-01-03T10:11:00Z', 'reserve', { request_id: 'ex-r08', member_id: 'ex-max', slot_id: 'ex-A3', seats: 10 }),
  pas('2047-01-03T10:12:00Z', 'reserve', { request_id: 'ex-r09', member_id: 'ex-zoe', slot_id: 'ex-A3' }),
  pas('2047-01-03T10:13:00Z', 'reserve', { request_id: 'ex-r10', member_id: 'ex-yann', slot_id: 'ex-A3' }),
  pas('2047-01-03T10:14:00Z', 'get_slot', { slot_id: 'ex-A3' }),
  pas('2047-01-03T10:15:00Z', 'reserve', { request_id: 'ex-r13', member_id: 'ex-zoe', slot_id: 'ex-A6' }),
  pas('2047-01-03T10:16:00Z', 'reserve', { request_id: 'ex-r16', member_id: 'ex-yann', slot_id: 'ex-A8' }),
  pas('2047-01-03T10:17:00Z', 'reserve', { request_id: 'ex-n1', member_id: 'ex-max', slot_id: 'ex-N1' }),
  pas('2047-01-03T10:17:10Z', 'reserve', { request_id: 'ex-n2', member_id: 'ex-max', slot_id: 'ex-N2' }),
  pas('2047-01-03T10:17:20Z', 'reserve', { request_id: 'ex-n3', member_id: 'ex-max', slot_id: 'ex-N3' }),
  pas('2047-01-03T10:18:00Z', 'get_booking', { booking_id: 'ex-r01' }),
  pas('2047-01-03T10:19:00Z', 'get_booking', { booking_id: 'ex-r04' }),
  // Un second locataire, fusionné avant toute facture (5 janvier 2047).
  adm('2047-01-05T09:00:00Z', 'add_member', { member_id: PAUL, role: 'staff' }, ANNEXE),
  adm('2047-01-05T09:00:10Z', 'add_member', { member_id: 'ex-kim', role: 'member' }, ANNEXE),
  pas('2047-01-05T09:01:00Z', 'create_slot', { slot_id: 'ex-B1', capacity: 2, starts_at: '2047-02-20T17:00:00Z' }, PAUL, ANNEXE),
  pas('2047-01-05T09:01:10Z', 'create_slot', { slot_id: 'ex-A7', capacity: 1, starts_at: '2047-02-21T17:00:00Z' }, PAUL, ANNEXE),
  pas('2047-01-05T09:02:00Z', 'reserve', { request_id: 'ex-r20', member_id: 'ex-kim', slot_id: 'ex-B1' }, PAUL, ANNEXE),
  pas('2047-01-05T09:02:10Z', 'reserve', { request_id: 'ex-r01', member_id: 'ex-kim', slot_id: 'ex-A7' }, PAUL, ANNEXE),
  adm('2047-01-05T09:05:00Z', 'merge_tenants', { source_tenant_id: ANNEXE }),
  pas('2047-01-05T09:06:00Z', 'get_booking', { booking_id: 'ex-r20' }),
  // Absences et suspension (8 au 12 janvier 2047).
  pas('2047-01-08T08:00:00Z', 'mark_no_show', { booking_id: 'ex-n1' }),
  pas('2047-01-10T08:00:00Z', 'mark_no_show', { booking_id: 'ex-n2' }),
  pas('2047-01-12T08:00:00Z', 'mark_no_show', { booking_id: 'ex-n3' }),
  pas('2047-01-12T08:01:00Z', 'reserve', { request_id: 'ex-r17', member_id: 'ex-max', slot_id: 'ex-A7' }),
  pas('2047-01-12T08:02:00Z', 'get_booking', { booking_id: 'ex-n3' }),
  // Série hebdomadaire et exception (13 janvier 2047).
  pas('2047-01-13T09:00:00Z', 'create_recurring', {
    series_id: 'ex-yoga',
    weekday: 3,
    start_time: '18:30',
    capacity: 3,
    from_date: '2047-02-01',
    until_date: '2047-03-31',
  }),
  pas('2047-01-13T09:01:00Z', 'list_occurrences', { series_id: 'ex-yoga' }),
  pas('2047-01-13T09:02:00Z', 'reserve', { request_id: 'ex-r21', member_id: 'ex-zoe', slot_id: 'ex-yoga@2047-02-13' }),
  pas('2047-01-13T09:03:00Z', 'add_exception', { series_id: 'ex-yoga', date: '2047-02-13' }),
  // Annulation qui promeut (15 janvier 2047), clôture d'un créneau surréservé.
  pas('2047-01-15T09:00:00Z', 'cancel', { booking_id: 'ex-r02' }),
  pas('2047-01-15T09:01:00Z', 'get_booking', { booking_id: 'ex-r03' }),
  pas('2047-01-25T18:00:00Z', 'close_slot', { slot_id: 'ex-A3' }),
  pas('2047-01-25T18:01:00Z', 'get_slot', { slot_id: 'ex-A3' }),
  pas('2047-01-25T18:02:00Z', 'get_wallet', { member_id: 'ex-zoe' }),
  // Factures de janvier, avoirs, trop-perçus (février 2047).
  adm('2047-02-02T09:00:00Z', 'issue_invoices', { month: '2047-01' }),
  pas('2047-02-02T09:05:00Z', 'cancel', { booking_id: 'ex-r04', seats: 1 }),
  pas('2047-02-02T09:06:00Z', 'cancel', { booking_id: 'ex-r16' }),
  pas('2047-02-03T09:00:00Z', 'reserve', { request_id: 'ex-r14', member_id: 'ex-max', slot_id: 'ex-A6' }),
  adm('2047-02-05T09:00:00Z', 'change_price', { slot_id: 'ex-A6', price_cents: 1500, effective_from: '2047-01-03T00:00:00Z' }),
  adm('2047-02-06T09:00:00Z', 'number_seats', { slot_id: 'ex-A4' }),
  pas('2047-02-06T09:01:00Z', 'reserve', { request_id: 'ex-r15', member_id: 'ex-noe', slot_id: 'ex-A4' }),
  pas('2047-02-06T09:02:00Z', 'transfer_booking', { booking_id: 'ex-r15', to_member_id: 'ex-lea' }),
  pas('2047-02-06T09:03:00Z', 'get_booking', { booking_id: 'ex-r15' }),
  pas('2047-02-06T09:03:30Z', 'get_slot', { slot_id: 'ex-A4' }),
  pas('2047-02-06T09:04:00Z', 'exchange_bookings', { booking_id: 'ex-r06', with_booking_id: 'ex-r14' }),
  pas('2047-02-07T09:00:00Z', 'reserve', { request_id: 'ex-r22', member_id: 'ex-ines', slot_id: 'ex-A5' }),
  pas('2047-02-07T09:01:00Z', 'reserve', { request_id: 'ex-r23', member_id: 'ex-lea', slot_id: 'ex-A5' }),
  pas('2047-02-07T09:02:00Z', 'get_booking', { booking_id: 'ex-r23' }),
  adm('2047-02-10T09:00:00Z', 'number_seats', { slot_id: 'ex-A9' }),
  pas('2047-02-10T09:01:00Z', 'reserve', { request_id: 'ex-r24', member_id: 'ex-ines', slot_id: 'ex-A9', seats: 2 }),
  pas('2047-02-10T09:02:00Z', 'reserve', { request_id: 'ex-r25', member_id: 'ex-lea', slot_id: 'ex-A9' }),
  pas('2047-02-10T09:03:00Z', 'reserve', { request_id: 'ex-r26', member_id: 'ex-zoe', slot_id: 'ex-A9' }),
  pas('2047-02-10T09:04:00Z', 'get_slot', { slot_id: 'ex-A9' }),
  pas('2047-02-11T09:00:00Z', 'cancel', { booking_id: 'ex-r24', seats: 1 }),
  pas('2047-02-12T09:00:00Z', 'import_bookings', {
    import_id: 'ex-imp1',
    rows: [
      { request_id: 'ex-i1', member_id: 'ex-zoe', slot_id: 'ex-A7' },
      { request_id: 'ex-i2', member_id: 'ex-ines', slot_id: 'ex-A7', seats: 2 },
      { request_id: 'ex-i3', member_id: 'ex-inconnu', slot_id: 'ex-A7' },
      { request_id: 'ex-i1', member_id: 'ex-zoe', slot_id: 'ex-A7' },
    ],
  }),
  pas('2047-02-12T09:01:00Z', 'get_slot', { slot_id: 'ex-A7' }),
  pas('2047-02-12T09:02:00Z', 'report_occupancy', {
    from: '2047-01-01T00:00:00Z',
    to: '2047-05-01T00:00:00Z',
    min_fill_bp: 0,
    sort: '-fill_bp',
    page_size: 5,
    page: 1,
  }),
  // Factures de février, rapports, documents, effacement (mars 2047).
  adm('2047-03-02T09:00:00Z', 'issue_invoices', { month: '2047-02' }),
  adm('2047-03-02T09:01:00Z', 'report_revenue', { from_month: '2047-01', to_month: '2047-02', sort: '-net_cents', page_size: 10, page: 1 }),
  pas('2047-03-02T09:02:00Z', 'list_documents', { member_id: 'ex-lea' }),
  pas('2047-03-02T09:03:00Z', 'list_documents', { member_id: 'ex-yann' }),
  adm('2047-03-03T09:00:00Z', 'erase_member', { member_id: 'ex-yann' }),
  pas('2047-03-03T09:01:00Z', 'get_wallet', { member_id: 'ex-lea' }),
  // Un an plus tard : expiration des crédits (février 2048).
  adm('2048-02-03T09:00:00Z', 'issue_invoices', { month: '2048-01' }),
  pas('2048-02-03T09:01:00Z', 'list_documents', { member_id: 'ex-ugo' }),
  pas('2048-02-03T09:02:00Z', 'get_wallet', { member_id: 'ex-ugo' }),
]

/* ═══════════════════════════════════════ exécution par le modèle attendu */

interface Exemple {
  readonly requete: Json
  readonly reponse: Json
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function traduireCles(v: unknown, cles: Map<string, string>): unknown {
  if (Array.isArray(v)) return v.map((x) => traduireCles(x, cles))
  if (estObjet(v)) {
    const out: Json = {}
    for (const [k, x] of Object.entries(v)) out[cles.get(k) ?? k] = traduireCles(x, cles)
    return out
  }
  return v
}

/** Arguments d'une sonde d'erreur : chaînes inconnues, tableaux vides, le reste inchangé. */
function argumentsDeSonde(args: Json): Json {
  const out: Json = {}
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === 'string' ? 'ex-inconnu' : Array.isArray(v) ? [] : v
  return out
}

interface Execution {
  readonly exemples: Exemple[]
}

/**
 * Rejoue le scénario d'illustration sous les clauses actives à n, en v1 ou
 * traduit en v2, puis sonde chaque opération sans exemple d'erreur.
 */
function executer(clauses: readonly Clause[], n: number, version: 'v1' | 'v2', opsSondees: readonly string[]): Execution {
  const contrat = contratEnVigueur(clauses, n)
  const moteur = new PlatformEngine(clauses.map((c) => c.brut) as unknown as PlatformClause[])
  const exemples: Exemple[] = []
  const v2 = version === 'v2'
  const nomV = (op: string): string => (v2 ? (contrat.opV2.get(op) ?? op) : op)
  let dernierInstant = SCENARIO_ILLUSTRATION[0]?.at ?? '2047-01-01T00:00:00Z'
  const derniersArgs = new Map<string, PasIllustration>()

  const jouer = (p: PasIllustration, op: string, args: Json): Json | null => {
    const step: PlatformStep = {
      period: n,
      at: p.at,
      op,
      ...(p.tenant === undefined ? {} : { tenant: p.tenant }),
      ...(p.actor === undefined ? {} : { actor: p.actor }),
      ...(v2 ? { version: 'v2' } : {}),
      args,
    }
    let reponse: Json
    try {
      reponse = clone(moteur.apply(step))
    } catch {
      return null
    }
    const requete: Json = { op }
    if (v2) requete['version'] = 'v2'
    if (contrat.enveloppe.has('tenant') && p.tenant !== undefined) requete['tenant'] = p.tenant
    if (contrat.enveloppe.has('actor') && p.actor !== undefined) requete['actor'] = p.actor
    requete['at'] = p.at
    requete['args'] = clone(args)
    exemples.push({ requete, reponse })
    return reponse
  }

  for (const p of SCENARIO_ILLUSTRATION) {
    if (!contrat.operations.includes(p.op)) continue
    const declares = contrat.arguments.get(p.op)
    const args: Json = {}
    for (const [k, v] of Object.entries(p.args)) if (declares === undefined || declares.has(k)) args[k] = v
    const argsV = v2 ? (traduireCles(args, contrat.cleV2) as Json) : args
    jouer(p, nomV(p.op), argsV)
    dernierInstant = p.at
    derniersArgs.set(nomV(p.op), { ...p, args: argsV })
  }

  // Sondes : une forme d'erreur pour chaque opération qui n'en a pas encore.
  const sondes = [...new Set([...contrat.operations.map(nomV), ...opsSondees])]
  for (const op of sondes) {
    const aDejaUneErreur = (): boolean => exemples.some((e) => e.requete['op'] === op && e.reponse['ok'] === false)
    if (aDejaUneErreur()) continue
    const modele = derniersArgs.get(op)
    const p: PasIllustration = {
      at: dernierInstant,
      op,
      tenant: modele?.tenant ?? STUDIO,
      actor: modele?.actor ?? OLGA,
      args: argumentsDeSonde(modele?.args ?? {}),
    }
    for (let essai = 0; essai < 2 && !aDejaUneErreur(); essai += 1) {
      const r = jouer(p, op, p.args)
      if (r === null) break
      if (r['ok'] !== false) exemples.pop()
    }
  }
  return { exemples }
}

/** Forme d'une réponse (clés, types, valeur de `ok`), récursivement. */
function forme(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `[${[...new Set(v.map(forme))].sort().join('|')}]`
  if (estObjet(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => (k === 'ok' ? `ok=${String(v['ok'])}` : `${k}:${forme(v[k])}`))
      .join(',')}}`
  }
  return typeof v
}

interface ExemplesDePeriode {
  /** Tous les exemples calculés, dans l'ordre d'exécution (v1 puis v2). */
  readonly tous: Exemple[]
  /** Un exemple par (version, opération, forme complète de réponse). */
  readonly parForme: Exemple[]
}

function exemplesDePeriode(clauses: readonly Clause[], n: number): ExemplesDePeriode {
  const actives = clauses.filter((c) => active(c, n))
  const contrat = contratEnVigueur(clauses, n)
  const opsExemples = [...new Set(actives.flatMap(opsDesExemples))]
  const tous: Exemple[] = [...executer(clauses, n, 'v1', opsExemples).exemples]
  if (contrat.enveloppe.has('version') && contrat.opV2.size > 0) {
    const v1Renommees = [...contrat.opV2.keys()]
    tous.push(...executer(clauses, n, 'v2', v1Renommees).exemples)
  }
  const vus = new Set<string>()
  const parForme: Exemple[] = []
  for (const e of tous) {
    const k = `${String(e.requete['version'] ?? 'v1')} ${String(e.requete['op'])} ${forme(e.reponse)}`
    if (vus.has(k)) continue
    vus.add(k)
    parForme.push(e)
  }
  return { tous, parForme }
}

/* ═════════════════════════ repli : exemples de la source, renommés `ex-…` */

const CLE_IDENTIFIANT = /(^|_)id$|^(actor|tenant)$|_ids$/u

function renommerExemple(e: Json): Json {
  const jetons = new Set<string>()
  const relever = (v: unknown, cle: string): void => {
    if (Array.isArray(v)) v.forEach((x) => relever(x, cle))
    else if (estObjet(v)) for (const [k, x] of Object.entries(v)) relever(x, k)
    else if (typeof v === 'string' && CLE_IDENTIFIANT.test(cle) && v.length > 0) {
      for (const part of v.split(/[@:]/u)) if (part.length > 0 && !/^\d{4}-\d{2}-\d{2}$/u.test(part)) jetons.add(part)
    }
  }
  relever(e['requete'] ?? e['request'], '')
  relever(e['reponse'] ?? e['response'], '')
  const renommer = (s: string): string => {
    if (jetons.has(s)) return `ex-${s}`
    const inv = /^(INV-\d{4}-\d{2}-)(.+)$/u.exec(s)
    if (inv !== null && jetons.has(inv[2] as string)) return `${inv[1] as string}ex-${inv[2] as string}`
    if (/[@:]/u.test(s)) {
      const parts = s.split(/([@:])/u)
      if (parts.some((x) => jetons.has(x))) return parts.map((x) => (jetons.has(x) ? `ex-${x}` : x)).join('')
    }
    return s
  }
  const prose = (s: string): string =>
    s.replace(/[A-Za-z0-9][A-Za-z0-9_.-]*/gu, (m) => (jetons.has(m) ? `ex-${m}` : m))
  const parcourir = (v: unknown, cle: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => parcourir(x, cle))
    if (estObjet(v)) {
      const out: Json = {}
      for (const [k, x] of Object.entries(v)) out[k] = parcourir(x, k)
      return out
    }
    if (typeof v === 'string') return cle === 'contexte' ? prose(v) : renommer(v)
    return v
  }
  return parcourir(e, '') as Json
}

/* ═════════════════════════════════════════════════════ rendu Markdown */

function bloc(e: Exemple | Json): string {
  return ['```json', JSON.stringify(e, null, 2), '```'].join('\n')
}

function scalaire(v: unknown): string {
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/** Fragment de contrat en listes Markdown (clés entre accents graves). */
function puces(v: unknown, retrait: string): string[] {
  const out: string[] = []
  if (!estObjet(v)) return out
  for (const [k, x] of Object.entries(v)) {
    if (Array.isArray(x) && x.every((y) => !estObjet(y) && !Array.isArray(y))) {
      out.push(`${retrait}- \`${k}\` : ${x.length === 0 ? '[]' : x.map((y) => (typeof y === 'string' ? `\`${y}\`` : scalaire(y))).join(', ')}`)
    } else if (Array.isArray(x)) {
      out.push(`${retrait}- \`${k}\` :`)
      for (const y of x) {
        if (estObjet(y)) {
          out.push(`${retrait}  - élément :`)
          out.push(...puces(y, `${retrait}    `))
        } else out.push(`${retrait}  - ${scalaire(y)}`)
      }
    } else if (estObjet(x)) {
      out.push(`${retrait}- \`${k}\` :`)
      out.push(...puces(x, `${retrait}  `))
    } else {
      out.push(`${retrait}- \`${k}\` : ${scalaire(x)}`)
    }
  }
  return out
}

const nn = (n: number): string => String(n).padStart(2, '0')

/* ─────────────────────────────────────────────────────────── docs/spec.md */

function renderSpec(clauses: readonly Clause[], n: number): string {
  const actives = clauses.filter((c) => active(c, n))
  const out: string[] = [
    `# Spécification F-PLATFORM — période P${nn(n)}`,
    '',
    `Spécification consolidée et à jour à la période P${String(n)} : le texte de chacune des ${String(actives.length)} règles en vigueur, avec ses précisions. Le contrat d'interface (opérations, réponses, valeurs exactes, codes d'erreur, exemples) est dans \`docs/api.md\` ; ce qui change à cette période est dans \`${platformTicketPath(n)}\`.`,
    '',
    'Ce fichier est réécrit par le moteur au début de chaque période.',
    '',
  ]
  for (const c of actives) {
    out.push(`## ${c.id}`, '')
    const vie = [`En vigueur depuis P${String(c.enters)}`]
    if (c.replaces.length > 0) vie.push(`remplace ${c.replaces.join(', ')}`)
    out.push(`_${vie.join(' ; ')}._`, '')
    out.push(c.text, '')
    if (c.precisions.length > 0) {
      out.push('Précisions :', '')
      for (const p of c.precisions) {
        const q = typeof p['question'] === 'string' ? p['question'] : ''
        const t = typeof p['texte'] === 'string' ? p['texte'] : ''
        if (t !== '') out.push(`- (${q}) ${t}`)
      }
      out.push('')
    }
  }
  return `${out.join('\n').trimEnd()}\n`
}

/* ──────────────────────────────────────────────────────────── docs/api.md */

const CODE_ERREUR = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$|^[A-Z]{4,}$/u

function codesErreur(v: unknown, cle: string, out: Set<string>): void {
  if (Array.isArray(v)) v.forEach((x) => codesErreur(x, cle, out))
  else if (estObjet(v)) {
    for (const [k, x] of Object.entries(v)) if (k !== 'exemples' && k !== 'examples' && k !== 'quantities') codesErreur(x, k, out)
  } else if (typeof v === 'string' && /erreur|error|code/u.test(cle) && CODE_ERREUR.test(v)) out.add(v)
}

function valeursEnumerees(format: string): string[] {
  const out: string[] = []
  for (const m of format.matchAll(/'([A-Za-z][A-Za-z0-9_/]*)'/gu)) if (!out.includes(m[1] as string)) out.push(m[1] as string)
  return out
}

function quantitesActives(clauses: readonly Clause[], n: number): Map<string, { unit: string; format: string; clause: string }> {
  const out = new Map<string, { unit: string; format: string; clause: string }>()
  for (const c of clauses) {
    if (!active(c, n)) continue
    const q = c.contract['quantities'] ?? c.contract['units']
    if (!estObjet(q)) continue
    for (const [k, d] of Object.entries(q)) {
      if (!estObjet(d)) continue
      out.set(k, { unit: String(d['unit'] ?? d['unite'] ?? ''), format: String(d['format'] ?? ''), clause: c.id })
    }
  }
  return out
}

/** Couples (champ, valeur) de vocabulaire lus dans les réponses des exemples. */
function vocabulaireDesExemples(exemples: readonly Exemple[], out: Map<string, Set<string>>): void {
  const ajouter = (k: string, v: string): void => {
    const s = out.get(k) ?? new Set<string>()
    s.add(v)
    out.set(k, s)
  }
  const parcourir = (v: unknown, k: string): void => {
    if (Array.isArray(v)) v.forEach((x) => parcourir(x, k))
    else if (estObjet(v)) for (const [kk, x] of Object.entries(v)) parcourir(x, kk)
    else if (typeof v === 'string') {
      if (k === 'error' || k === 'code') ajouter('error', v)
      else if (!CLE_IDENTIFIANT.test(k) && /^[a-z][a-z_]*$/u.test(v)) ajouter(k, v)
    }
  }
  for (const e of exemples) parcourir(e.reponse, '')
}

/**
 * Le protocole du processus candidat (`bench.platform/1`, T74) : comment le
 * moteur lance l'application et lui adresse les opérations de ce contrat. Les
 * notateurs de `@bench/activities` (séquences ciblées, flux différentiels) le
 * jouent tel qu'il est écrit ici ; le candidat n'a pas d'autre source pour
 * l'apprendre.
 */
function protocoleCandidat(n: number): string[] {
  const proto = PLATFORM_CANDIDATE_PROTOCOL
  return [
    `## Protocole du processus candidat (\`${proto}\`)`,
    '',
    "Le moteur exerce l'application en la lançant comme un processus (la commande de lancement du dépôt) et en lui adressant les opérations de ce contrat :",
    '',
    "- **État** : la variable d'environnement `BENCH_DATA_DIR` désigne le répertoire où l'application garde son état. L'état doit survivre à l'arrêt du processus : le moteur relance l'application sur le même `BENCH_DATA_DIR` (au moins à chaque période) et s'attend à retrouver tout ce qui a été fait. Un `BENCH_DATA_DIR` vide est un état vide.",
    `- **Démarrage** : la première ligne écrite sur la sortie standard est l'objet JSON \`{"ready":true,"protocol":"${proto}"}\` (d'autres champs peuvent s'y ajouter) ; rien n'est écrit sur la sortie standard avant elle.`,
    `- **Requêtes** : l'entrée standard porte ensuite une requête JSON par ligne, \`{"id", "period", "at", "op", "args", "tenant"?, "actor"?, "version"?}\` : \`id\` est un identifiant de requête choisi par le moteur ; \`period\` est la période en cours (\`"P${String(n)}"\` pour ce document) ; \`at\` est l'instant de l'opération (\`'AAAA-MM-JJTHH:MM:SSZ'\`, UTC), seule horloge de l'application ; \`op\` et \`args\` sont l'opération et ses arguments décrits ci-dessous ; les champs d'enveloppe en vigueur (section « Enveloppe ») sont au même niveau que \`op\`, hors \`args\`, et absents quand la requête ne les porte pas.`,
    "- **Réponses** : pour chaque requête, une ligne JSON sur la sortie standard, dans l'ordre des requêtes : `{\"id\": <id de la requête>, \"response\": <réponse>}`, où `<réponse>` est la réponse de l'opération telle que ce contrat la décrit (`{ ok: true, ... }` ou `{ ok: false, error }`). Les réponses sont comparées à l'attendu comme des valeurs JSON : l'ordre des clés est indifférent, une clé absente n'est pas une clé à `null`.",
    "- **Fin** : les opérations sont traitées une à une, dans l'ordre des lignes ; quand l'entrée standard se ferme, l'application répond à toutes les requêtes reçues puis se termine.",
    "- **Connexions multiples** : quand la variable d'environnement `BENCH_PLATFORM_SOCKET` est posée, elle désigne le chemin d'un socket Unix (flux) choisi par le moteur ; l'application ÉCOUTE sur ce chemin AVANT d'écrire sa ligne de démarrage, qui porte alors aussi le champ `socket` (le chemin écouté). Chaque connexion acceptée est un client indépendant, au même cadrage que l'entrée standard : une requête JSON par ligne, une réponse `{\"id\", \"response\"}` par requête, dans l'ordre des requêtes DE CETTE CONNEXION. Les `id` sont uniques sur tout le processus. Des requêtes de connexions distinctes peuvent être en vol en même temps : chaque opération est atomique, et le résultat doit être celui d'une exécution séquentielle dans un ordre compatible avec leur chevauchement (aucun dépassement de capacité, aucune réservation en double pour une même clé). L'entrée standard reste un client ; le moteur ferme ses connexions avant l'entrée standard, dont la fermeture termine le processus après les réponses en attente. Sans `BENCH_PLATFORM_SOCKET`, rien ne change.",
    "- **Mesures** : le moteur mesure aussi la latence de chaque opération (durée entre l'écriture d'une requête et la lecture de sa réponse, une requête en vol à la fois) sur un volume importé, et la compare aux plafonds que le contrat déclare quand il en déclare.",
    '',
  ]
}

function renderApi(clauses: readonly Clause[], n: number, ex: ExemplesDePeriode): string {
  const actives = clauses.filter((c) => active(c, n))
  const contrat = contratEnVigueur(clauses, n)
  const out: string[] = [
    `# Contrat d'interface F-PLATFORM — période P${nn(n)}`,
    '',
    `Le contrat en vigueur à la période P${String(n)} : chaque opération, ses arguments, ses réponses avec leurs valeurs exactes, ses codes d'erreur, l'unité et le format de chaque grandeur, et des exemples (au moins un par forme de réponse, succès et erreur). Les règles sont dans \`docs/spec.md\` ; chaque fragment cite la clause qui l'introduit.`,
    '',
    "Forme générale : une requête est `{ op, args }` (plus les champs d'enveloppe en vigueur, hors `args`) ; une réponse de succès est `{ ok: true, ... }`, une réponse d'erreur `{ ok: false, error }`.",
    '',
    'Ce fichier est réécrit par le moteur au début de chaque période.',
    '',
    ...protocoleCandidat(n),
  ]

  // Enveloppe.
  const env = actives.filter((c) => estObjet(c.contract['enveloppe']))
  if (env.length > 0) {
    out.push('## Enveloppe', '')
    for (const c of env) {
      out.push(`Fragment de ${c.id} :`, '')
      out.push(...puces(c.contract['enveloppe'], ''), '')
    }
  }

  // Opérations.
  out.push('## Opérations', '')
  for (const op of contrat.operations) {
    out.push(`### \`${op}\``, '')
    if (contrat.opV2.has(op)) out.push(`Nom en v2 : \`${contrat.opV2.get(op) as string}\`.`, '')
    for (const c of actives) {
      const ops = c.contract['operations']
      if (!estObjet(ops) || !estObjet(ops[op])) continue
      out.push(`Fragment de ${c.id} :`, '')
      out.push(...puces(ops[op], ''), '')
    }
  }

  // Autres éléments du contrat, par clause.
  const autres = actives.filter((c) =>
    Object.keys(c.contract).some((k) => !['operations', 'enveloppe', 'exemples', 'examples', 'quantities', 'units'].includes(k)),
  )
  if (autres.length > 0) {
    out.push('## Autres éléments du contrat', '')
    for (const c of autres) {
      const reste: Json = {}
      for (const [k, v] of Object.entries(c.contract)) {
        if (!['operations', 'enveloppe', 'exemples', 'examples', 'quantities', 'units'].includes(k)) reste[k] = v
      }
      out.push(`### ${c.id}`, '')
      out.push(...puces(reste, ''), '')
    }
    // Les correspondances v1 <-> v2 portées par `operations` (valeurs chaînes).
  }

  // Grandeurs.
  const q = quantitesActives(clauses, n)
  out.push('## Grandeurs : unités et formats', '')
  for (const [k, d] of q) out.push(`- \`${k}\` (${d.unit}) : ${d.format} — ${d.clause}`)
  out.push('')

  // Vocabulaire comparé.
  const vocab = new Map<string, Set<string>>()
  const codes = new Set<string>()
  for (const c of actives) codesErreur(c.contract, '', codes)
  vocab.set('error', codes)
  for (const [k, d] of q) {
    if (!/enum/iu.test(d.unit)) continue
    const s = vocab.get(k) ?? new Set<string>()
    for (const v of valeursEnumerees(d.format)) s.add(v)
    vocab.set(k, s)
  }
  vocabulaireDesExemples(ex.parForme, vocab)
  out.push('## Vocabulaire', '')
  out.push(
    "Chaque valeur exacte qu'une réponse peut porter, avec le nom du champ qui la porte (pour une erreur : le champ `error`, ou `error.code` en v2).",
    '',
  )
  for (const [k, vs] of vocab) for (const v of [...vs].sort()) out.push(`- \`${k}\` : \`${v}\``)
  out.push('')

  // Exemples.
  out.push('## Exemples', '')
  out.push(
    "Calculés par le modèle attendu sur un scénario d'illustration (locataires `ex-studio` et `ex-annexe`, membres et réservations `ex-…`, 2047-2048), rejoué dans l'ordre sous les règles de cette période : un exemple par forme de réponse. Chaque bloc donne la requête (`requete`) et la réponse (`reponse`).",
    '',
  )
  const ordre: string[] = []
  for (const e of ex.parForme) {
    const op = `${String(e.requete['op'])}${e.requete['version'] === 'v2' ? ' (v2)' : ''}`
    if (!ordre.includes(op)) ordre.push(op)
  }
  for (const op of ordre) {
    out.push(`### \`${op}\``, '')
    for (const e of ex.parForme) {
      const k = `${String(e.requete['op'])}${e.requete['version'] === 'v2' ? ' (v2)' : ''}`
      if (k === op) out.push(bloc(e), '')
    }
  }
  return `${out.join('\n').trimEnd()}\n`
}

/* ──────────────────────────────────────────────────── docs/tickets/Pnn.md */

function premierePhrase(t: string): string {
  const s = t.replace(/\s+/gu, ' ').trim()
  const m = /^(.{1,160}?[.;:])(\s|$)/u.exec(s)
  return m !== null ? (m[1] as string) : s.slice(0, 160)
}

function exemplesDeCritere(c: Clause, ex: ExemplesDePeriode): Json[] {
  const ops = opsDesExemples(c)
  if (ops.length === 0) return []
  // Pour chaque opération de la clause : le succès dont la réponse porte le
  // plus de champs nommés par le texte de la clause, et l'erreur dont le code
  // y figure (à défaut, la première de chaque sorte).
  const mots = new Set(c.text.match(/[A-Za-z_][A-Za-z0-9_]*/gu) ?? [])
  const score = (e: Exemple): number => {
    if (e.reponse['ok'] === false) {
      const err = e.reponse['error']
      const code = typeof err === 'string' ? err : estObjet(err) ? String(err['code']) : ''
      return mots.has(code) ? 1 : 0
    }
    return Object.keys(e.reponse).filter((k) => k !== 'ok' && mots.has(k)).length
  }
  const choisis: Exemple[] = []
  for (const op of ops) {
    for (const ok of [true, false]) {
      let meilleur: Exemple | undefined
      for (const x of ex.tous) {
        if (x.requete['op'] !== op || x.reponse['ok'] !== ok) continue
        if (meilleur === undefined || score(x) > score(meilleur)) meilleur = x
      }
      if (meilleur !== undefined && !choisis.includes(meilleur)) choisis.push(meilleur)
    }
    if (choisis.length >= 4) break
  }
  if (choisis.length > 0) return choisis.slice(0, 4) as unknown as Json[]
  // Repli : la source, identifiants renommés (jamais telle quelle).
  return exemplesSource(c).slice(0, 2).map(renommerExemple)
}

function renderTicket(clauses: readonly Clause[], n: number, ex: ExemplesDePeriode): string {
  const d = difference(clauses, n)
  const actives = clauses.filter((c) => active(c, n))
  const nouvelles = [...d.ajoutees, ...d.remplacantes]
  const out: string[] = [
    `# Ticket P${nn(n)} — F-PLATFORM, période ${String(n)} sur ${String(F_PLATFORM_PERIOD_COUNT)}`,
    '',
    '## Ce qui change',
    '',
    n === 1
      ? `Première période : la plateforme démarre avec ${String(actives.length)} règles.`
      : `Par rapport à la période P${String(n - 1)} : ${String(d.ajoutees.length)} règle(s) ajoutée(s), ${String(d.remplacantes.length)} remplacée(s), ${String(d.retirees.length)} retirée(s). ${String(actives.length)} règles sont en vigueur.`,
    '',
    `La spécification à jour est dans \`docs/spec.md\`, le contrat d'interface dans \`docs/api.md\`. Ce ticket décrit ce qui change ; une fois la période passée, il reste dans le dépôt comme historique.`,
    '',
    '## Clauses ajoutées',
    '',
  ]
  if (d.ajoutees.length === 0) out.push('Aucune.')
  for (const c of d.ajoutees) out.push(`- ${c.id} — ${premierePhrase(c.text)}`)
  out.push('', '## Clauses remplacées', '')
  if (d.remplacantes.length === 0) out.push('Aucune.')
  for (const c of d.remplacantes) for (const r of c.replaces) out.push(`- ${c.id} remplace ${r}`)
  out.push('', '## Clauses retirées', '')
  if (d.retirees.length === 0) out.push('Aucune.')
  for (const c of d.retirees) out.push(`- ${c.id} n'est plus en vigueur à partir de P${String(n)}, sans remplaçante.`)
  out.push('', "## Critères d'acceptation", '')
  if (nouvelles.length === 0) out.push('Aucune règle nouvelle : les règles en vigueur restent celles de la période précédente.', '')
  else {
    out.push(
      "Chaque règle ajoutée ou remplaçante est satisfaite quand l'application se comporte comme son texte le dit ; les exemples, calculés par le modèle attendu sur le scénario d'illustration de `docs/api.md`, en montrent l'effet.",
      '',
    )
  }
  for (const c of nouvelles) {
    out.push(`### ${c.id}${c.replaces.length > 0 ? ` (remplace ${c.replaces.join(', ')})` : ''}`, '')
    out.push(c.text, '')
    const exemples = exemplesDeCritere(c, ex)
    if (exemples.length > 0) {
      out.push('Exemples :', '')
      for (const e of exemples) out.push(bloc(e), '')
    }
  }
  return `${out.join('\n').trimEnd()}\n`
}

/* ═════════════════════════════════════════════════════════ le générateur */

/**
 * Les trois documents de la période `n` de F-PLATFORM, indexés par chemin
 * relatif au dépôt du candidat : `docs/spec.md`, `docs/api.md` et
 * `docs/tickets/Pnn.md`.
 */
export function renderPlatformPeriodDocs(n: number, options: PlatformPeriodDocsOptions = {}): Record<string, string> {
  if (!Number.isInteger(n) || n < 1 || n > F_PLATFORM_PERIOD_COUNT) {
    throw new Error(`F-PLATFORM : periode ${String(n)} hors de P1..P${String(F_PLATFORM_PERIOD_COUNT)}`)
  }
  const source = (options.clauses ?? (platformClauses as readonly unknown[])).filter(estObjet).map(lireClause)
  const ex = exemplesDePeriode(source, n)
  return {
    [PLATFORM_SPEC_PATH]: renderSpec(source, n),
    [PLATFORM_API_PATH]: renderApi(source, n, ex),
    [platformTicketPath(n)]: renderTicket(source, n, ex),
  }
}
