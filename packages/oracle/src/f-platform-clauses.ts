// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — LA source de clauses de F-PLATFORM, périodes P1 à P16 (tâches
// T70 pour P1-P8, T71 pour P9-P16 ; ADR-021 décision 1 : « le scénario est écrit
// une seule fois, sous forme de clauses »).
//
// Chaque clause porte, au même endroit :
//   id, enters, exits, replaces   — sa vie : active sur [enters, exits[ ;
//   text                          — le texte exact que lira le candidat ;
//   contract                      — son fragment de contrat (opérations,
//                                   arguments, champs de réponse, valeurs,
//                                   codes d'erreur, exemples) et, sous
//                                   `quantities`, l'unité et le format de chaque
//                                   grandeur qu'elle compare ;
//   implementation                — sa mise en œuvre dans le modèle attendu :
//                                   chaque clé est une DÉCISION, chaque valeur
//                                   la fonction (ou l'étape rangée) qui la rend ;
//   governs                       — les décisions gouvernées, dérivées des clés
//                                   de `implementation` (jamais écrites à part) ;
//   compares                      — les grandeurs comparées ;
//   questions_ouvertes            — ce que la racine gelée ne fixe pas et que le
//                                   modèle tranche provisoirement (à confirmer).
//
// Les règles sont celles de acceptance/reference-platform/F-PLATFORM-P1-P8.json
// et F-PLATFORM-P9-P16.json (`periodes.<Pn>.regles`), une clause par règle,
// mêmes identifiants, mêmes remplacements ; une clause remplacée sort à
// l'entrée de sa remplaçante. Le moteur (f-platform-engine.ts) ne contient
// aucune règle. Les questions ouvertes Q01-Q28 de la racine P9-P16 sont
// tranchées PROVISOIREMENT dans le champ `questions_ouvertes` de la clause
// concernée.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Booking,
  type Etape,
  type Implementation,
  type JournalEntry,
  type Json,
  type PlatformClause,
  type PlatformContext,
  type PlatformResponse,
  type Quantity,
  type Series,
  type Slot,
  type Tenant,
  type Vue,
  fail,
  newTenant,
  succeed,
  clone,
} from './f-platform-engine.js'

/* ─────────────────────────────────────── unités et formats des grandeurs */

const IDENT = 'identifiant (sans unite)'
const CENTIMES = "centimes d'euro"
const INSTANT = { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', UTC, a la seconde" }
const LISTE_ID = 'liste ordonnee de booking_id'

export const PLATFORM_QUANTITIES: Readonly<Record<string, Quantity>> = {
  at: INSTANT,
  starts_at: INSTANT,
  tenant_id: { unit: IDENT, format: 'chaine non vide fournie par le client' },
  owner_id: { unit: IDENT, format: 'chaine non vide (un member_id)' },
  slot_id: { unit: IDENT, format: "chaine non vide fournie par le client ; occurrence : '<series_id>@<AAAA-MM-JJ>'" },
  request_id: { unit: IDENT, format: 'chaine non vide fournie par le client' },
  booking_id: { unit: IDENT, format: 'chaine, egale au request_id de la requete creatrice' },
  member_id: { unit: IDENT, format: 'chaine non vide fournie par le client' },
  actor: { unit: IDENT, format: "member_id de l'auteur de l'operation" },
  series_id: { unit: IDENT, format: 'chaine non vide fournie par le client' },
  status: { unit: 'enumeration', format: "'confirmed' | 'waiting' | 'cancelled' (et 'bumped' a partir de P13)" },
  role: { unit: 'enumeration', format: "'admin' | 'staff' | 'member'" },
  tier: { unit: 'enumeration', format: "'none' | 'silver' | 'gold'" },
  capacity: { unit: 'places', format: 'entier >= 1' },
  seats: { unit: 'places', format: 'entier >= 1 (1 par defaut)' },
  booked: { unit: 'places', format: 'entier >= 0' },
  available: { unit: 'places', format: 'entier >= 0 (capacity - booked)' },
  position: { unit: "rang dans la file d'attente", format: 'entier >= 1 (1 = tete de file)' },
  waiting: { unit: LISTE_ID, format: 'tableau JSON de chaines, tete de file en premier' },
  promoted: { unit: LISTE_ID, format: "tableau JSON de chaines, dans l'ordre de promotion ([] si aucune)" },
  cancelled: { unit: LISTE_ID, format: "tableau JSON de chaines, dans l'ordre de creation des reservations" },
  slot_ids: { unit: 'liste ordonnee de slot_id', format: 'tableau JSON de chaines, ordre chronologique' },
  weekday: { unit: 'jour de semaine ISO 8601', format: 'entier 1..7, 1 = lundi, 7 = dimanche' },
  start_time: { unit: 'heure UTC', format: "'HH:MM' (00:00 a 23:59)" },
  from_date: { unit: 'date du calendrier UTC', format: "'AAAA-MM-JJ', borne incluse" },
  until_date: { unit: 'date du calendrier UTC', format: "'AAAA-MM-JJ', borne incluse" },
  date: { unit: 'date du calendrier UTC', format: "'AAAA-MM-JJ'" },
  price_cents: { unit: CENTIMES, format: 'entier >= 0, prix PAR PLACE' },
  discount_bp: { unit: 'points de base (1 pb = 1/10000)', format: 'entier : none 0, silver 1000, gold 2500' },
  amount_cents: { unit: CENTIMES, format: 'entier >= 0, jamais de flottant' },
  refunded_cents: { unit: CENTIMES, format: 'entier >= 0' },
  paid_credits_cents: { unit: CENTIMES, format: 'entier >= 0' },
  paid_card_cents: { unit: CENTIMES, format: 'entier >= 0' },
  balance_cents: { unit: CENTIMES, format: 'entier >= 0' },
  'refund.credits_cents': { unit: CENTIMES, format: 'entier >= 0, part re-creditee au portefeuille' },
  'refund.card_cents': { unit: CENTIMES, format: 'entier >= 0, part remboursee a la carte' },
  // ── P9 à P16 (T71)
  timezone: { unit: 'fuseau du site', format: "'UTC' | 'Europe/Paris' ('UTC' par defaut)" },
  local_starts_at: { unit: 'heure locale murale du site', format: "'AAAA-MM-JJTHH:MM:SS+HH:MM' (decalage en vigueur a l'instant)" },
  refund_rate_bp: { unit: 'points de base (10000 = 100 %)', format: 'entier : 10000, 5000 ou 0 (palier P9.R3)' },
  no_show: { unit: 'booleen', format: 'true | false (false par defaut)' },
  absences_30d: { unit: 'absences', format: 'entier >= 1, fenetre ]T - 2 592 000 s, T]' },
  suspended_until: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', ou null si jamais suspendu" },
  numbered: { unit: 'booleen', format: 'true si le creneau est numerote (P11)' },
  seat_numbers: { unit: 'numeros de place', format: 'tableau JSON croissant d entiers consecutifs dans 1..capacity' },
  free_seats: { unit: 'numeros de place', format: 'tableau JSON croissant d entiers dans 1..capacity' },
  assignments: { unit: 'affectation de places', format: 'tableau JSON de { booking_id, seat_numbers }, ordre seats desc puis booking_id asc (ordinal UTF-16)' },
  overbook_limit: { unit: 'places', format: 'entier : capacity + floor(capacity x 1000 / 10000) si non numerote, capacity sinon' },
  closed: { unit: 'booleen', format: 'true apres close_slot' },
  expired: { unit: LISTE_ID, format: "tableau JSON de chaines, dans l'ordre de la file" },
  bumped: { unit: LISTE_ID, format: "tableau JSON de chaines, dans l'ordre de debarquement" },
  compensation_cents: { unit: CENTIMES, format: 'entier >= 0, 1000 par place debarquee' },
  month: { unit: 'mois civil LOCAL du site', format: "'AAAA-MM', mois 01..12" },
  invoice_id: { unit: IDENT, format: "'INV-<AAAA-MM>-<member_id>'" },
  invoice_ids: { unit: "liste d'invoice_id", format: 'tableau JSON de chaines, par member_id croissant (ordinal)' },
  credit_note_id: { unit: IDENT, format: "'AV-nnnn' (4 chiffres, sequence par locataire depuis AV-0001), ou null" },
  reason: { unit: 'enumeration', format: "'cancellation' | 'bump' | 'price_change'" },
  issued_at: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', at de l'operation emettrice" },
  'lines.amount_cents': { unit: CENTIMES, format: 'entier > 0 (les mouvements nuls ne sont pas des lignes)' },
  charges_cents: { unit: CENTIMES, format: 'entier >= 0, somme des lignes charge' },
  refunds_cents: { unit: CENTIMES, format: 'entier >= 0, somme des lignes refund et adjustment' },
  total_cents: { unit: CENTIMES, format: 'entier signe : charges_cents - refunds_cents' },
  'invoices.card_cents': { unit: CENTIMES, format: 'entier SIGNE : parts carte des charges - parts carte des remboursements' },
  credits_used_cents: { unit: CENTIMES, format: 'entier SIGNE : parts credits des charges - parts credits des remboursements' },
  top_ups_cents: { unit: CENTIMES, format: 'entier >= 0, somme des credited_cents des rechargements' },
  compensations_cents: { unit: CENTIMES, format: 'entier >= 0, somme des compensations (P13.R3)' },
  credit_notes_credits_cents: { unit: CENTIMES, format: 'entier >= 0, somme des credits_cents des avoirs emis dans le mois' },
  opening_balance_cents: { unit: CENTIMES, format: 'entier >= 0, solde au premier instant (local) du mois' },
  closing_balance_cents: { unit: CENTIMES, format: 'entier >= 0, solde au premier instant (local) du mois suivant' },
  'credit_notes.amount_cents': { unit: CENTIMES, format: 'entier > 0, R (ou T pour price_change)' },
  'credit_notes.credits_cents': { unit: CENTIMES, format: 'entier >= 0, part re-creditee au portefeuille' },
  'credit_notes.card_cents': { unit: CENTIMES, format: 'entier >= 0, part rendue a la carte' },
  currency: { unit: 'devise ISO 4217', format: "'EUR' | 'USD' ('EUR' par defaut)" },
  price_currency: { unit: 'devise ISO 4217', format: "'EUR' | 'USD'" },
  rate_micro: { unit: 'EUR pour 1 USD x 1 000 000', format: 'entier >= 1 (912500 = 0,9125 EUR par USD)' },
  credited_cents: { unit: CENTIMES, format: 'entier > 0, montant credite en EUR apres conversion P15.R3' },
  original_amount_cents: { unit: 'centimes de dollar US', format: 'entier >= 0, montant net avant conversion' },
  effective_from: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', <= at" },
  adjusted: { unit: 'ajustements', format: "tableau JSON de { booking_id, refunded_cents, refund, credit_note_id }, ordre de confirmation" },
}

/** price_cents à partir de P15 : la devise du prix n'est plus forcément l'EUR. */
const PRIX_EN_DEVISE: Quantity = { unit: 'centimes de la devise du prix (price_currency)', format: 'entier >= 0, prix PAR PLACE' }

interface ClauseSpec {
  readonly id: string
  readonly enters: string
  readonly exits?: string
  readonly replaces?: string
  readonly text: string
  readonly contract: Json
  readonly implementation: Implementation
  readonly grandeurs: readonly string[]
  /** Unités propres à la clause, qui priment sur PLATFORM_QUANTITIES (grandeur redéfinie). */
  readonly unites?: Readonly<Record<string, Quantity>>
  readonly questions_ouvertes?: readonly string[]
}

function clause(s: ClauseSpec): PlatformClause {
  const quantities: Record<string, Quantity> = {}
  for (const g of s.grandeurs) {
    const q = s.unites?.[g] ?? PLATFORM_QUANTITIES[g]
    if (q === undefined) throw new Error(`GRANDEUR-SANS-UNITE ${g} dans ${s.id}`)
    quantities[g] = { ...q }
  }
  return {
    id: s.id,
    enters: s.enters,
    exits: s.exits ?? null,
    replaces: s.replaces ?? null,
    text: s.text,
    contract: { ...s.contract, quantities },
    implementation: s.implementation,
    governs: Object.keys(s.implementation).sort(),
    compares: [...s.grandeurs],
    ...(s.questions_ouvertes === undefined ? {} : { questions_ouvertes: [...s.questions_ouvertes] }),
  }
}

/* ─────────────────────────────────────────────────── petits outils purs */

const estChaine = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const estEntier = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const estInstant = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && !Number.isNaN(Date.parse(v))
const JOUR_MS = 86_400_000

function dateUtc(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(t).toISOString().slice(0, 10) === v ? t : null
}
const jourIso = (t: number): number => {
  const d = new Date(t).getUTCDay()
  return d === 0 ? 7 : d
}
const texteDate = (t: number): string => new Date(t).toISOString().slice(0, 10)

const slotDe = (ctx: PlatformContext): Slot => ctx.d.slot as Slot
const reservationDe = (ctx: PlatformContext): Booking => ctx.d.booking as Booking
const etape = (rang: number, f: (ctx: PlatformContext) => PlatformResponse | undefined): Etape => ({ rang, etape: f })

type Creation = (ctx: PlatformContext, status: 'confirmed' | 'waiting') => Booking
type Remboursement = (ctx: PlatformContext, b: Booking, k: number, n: number) => void
type RetraitFile = (ctx: PlatformContext, b: Booking, slot: Slot | undefined) => void
type Solde = (ctx: PlatformContext, member: string) => number
type Mouvement = (ctx: PlatformContext, member: string, delta: number) => number
/** Hook d'annulation partielle : k places viennent d'être retirées à b. */
type Partielle = (ctx: PlatformContext, b: Booking, k: number) => void

/** Historique daté des mouvements de portefeuille d'un locataire (clé de donnees). */
const CLE_HISTORIQUE_PORTEFEUILLE = 'portefeuille.historique'
interface MouvementDate {
  readonly member_id: string
  readonly t: number
  readonly delta: number
}
const historiquePortefeuille = (ctx: PlatformContext): MouvementDate[] =>
  ctx.donnee<MouvementDate[]>(CLE_HISTORIQUE_PORTEFEUILLE, () => [])

/** Mouvement de portefeuille commun à P8.R1 et P15.R4 : le solde ne descend jamais sous 0. */
const mouvementPortefeuille: Mouvement = (ctx, member, delta) => {
  const solde = (ctx.locataire.wallets.get(member) ?? 0) + delta
  if (solde < 0) throw new Error(`PORTEFEUILLE-NEGATIF ${member}`)
  ctx.locataire.wallets.set(member, solde)
  if (delta !== 0) historiquePortefeuille(ctx).push({ member_id: member, t: ctx.instant, delta })
  return solde
}
const soldePortefeuille: Solde = (ctx, member) => ctx.locataire.wallets.get(member) ?? 0

/* ════════════════════════════════════════════════════════════════════ P1 */

const P1_R1 = clause({
  id: 'P1.R1',
  enters: 'P1',
  text:
    "Création d'un créneau. L'opération create_slot reçoit slot_id (chaîne non vide choisie par le client), " +
    "capacity (nombre de places, entier supérieur ou égal à 1) et starts_at (instant de début, ISO 8601 en UTC, " +
    "forme exacte 'AAAA-MM-JJTHH:MM:SSZ'). Si capacity n'est pas un entier >= 1, ou si starts_at n'a pas cette " +
    "forme, la réponse est { ok: false, error: 'INVALID_ARGUMENT' }. Si slot_id désigne déjà un créneau, la réponse " +
    "est { ok: false, error: 'ALREADY_EXISTS' } et rien ne change. Sinon le créneau est créé, vide, et la réponse est " +
    '{ ok: true, slot_id }.',
  contract: {
    operations: {
      create_slot: {
        arguments: { slot_id: 'chaine non vide', capacity: 'entier >= 1', starts_at: "'AAAA-MM-JJTHH:MM:SSZ'" },
        reponse: { ok: true, slot_id: 'chaine' },
        erreurs: ['INVALID_ARGUMENT', 'ALREADY_EXISTS'],
      },
    },
    valeurs: { capacity_min: 1 },
    exemples: [
      {
        requete: { op: 'create_slot', args: { slot_id: 'S1', capacity: 2, starts_at: '2031-03-20T18:00:00Z' } },
        reponse: { ok: true, slot_id: 'S1' },
      },
      { requete: { op: 'create_slot', args: { slot_id: 'S1', capacity: 3, starts_at: '2031-03-22T18:00:00Z' } }, reponse: { ok: false, error: 'ALREADY_EXISTS' } },
    ],
  },
  implementation: {
    'create_slot.effet': (ctx: PlatformContext): PlatformResponse => {
      const { slot_id, capacity, starts_at } = ctx.args
      if (!estChaine(slot_id) || !estEntier(capacity) || capacity < 1 || !estInstant(starts_at)) {
        return fail('INVALID_ARGUMENT')
      }
      if (ctx.locataire.slots.has(slot_id)) return fail('ALREADY_EXISTS')
      ctx.locataire.slots.set(slot_id, { slot_id, capacity, starts_at, file: [] })
      return succeed({ slot_id })
    },
  },
  grandeurs: ['slot_id', 'capacity', 'starts_at'],
  questions_ouvertes: [
    "ordre entre INVALID_ARGUMENT et ALREADY_EXISTS non fixe par la racine : le modele controle les arguments d'abord",
    "INVALID_ARGUMENT figure en P1.R1 alors que la racine le liste parmi les codes introduits en P8",
  ],
})

const P1_R2 = clause({
  id: 'P1.R2',
  enters: 'P1',
  text:
    "Réservation. L'opération reserve reçoit request_id (chaîne non vide, identifiant de la requête), member_id " +
    "(le membre pour qui l'on réserve) et slot_id. Les contrôles s'appliquent dans cet ordre exact, et le premier qui " +
    "échoue donne la réponse : (1) idempotence (clause P1.R4) ; (2) slot_id inconnu -> { ok: false, error: 'NOT_FOUND' } ; " +
    "(3) l'instant de l'opération (champ at) est supérieur ou égal à starts_at -> { ok: false, error: 'SLOT_CLOSED' } : " +
    "un créneau n'est réservable que si at < starts_at, strictement ; (4) member_id a déjà une réservation ACTIVE sur ce " +
    "créneau -> { ok: false, error: 'ALREADY_BOOKED' } ; (5) admission (règle d'admission en vigueur). Une réservation " +
    'réussie répond { ok: true, booking_id, member_id, slot_id, status }.',
  contract: {
    operations: {
      reserve: {
        arguments: { request_id: 'chaine non vide', member_id: 'chaine non vide', slot_id: 'chaine non vide' },
        reponse: { ok: true, booking_id: 'chaine', member_id: 'chaine', slot_id: 'chaine', status: "'confirmed'" },
        erreurs: ['NOT_FOUND', 'SLOT_CLOSED', 'ALREADY_BOOKED'],
        ordre_des_controles: ['idempotence', 'NOT_FOUND', 'SLOT_CLOSED', 'ALREADY_BOOKED', 'admission'],
      },
    },
    exemples: [
      {
        contexte: "creneau S9 de starts_at '2031-03-03T08:15:00Z'",
        requete: { op: 'reserve', at: '2031-03-03T08:14:59Z', args: { request_id: 'r8', member_id: 'm-dan', slot_id: 'S9' } },
        reponse: { ok: true, booking_id: 'r8', status: 'confirmed' },
      },
      {
        requete: { op: 'reserve', at: '2031-03-03T08:15:00Z', args: { request_id: 'r9', member_id: 'm-eve', slot_id: 'S9' } },
        reponse: { ok: false, error: 'SLOT_CLOSED' },
      },
    ],
  },
  implementation: {
    'reserve.etape.creneau_inconnu': etape(20, (ctx) => {
      const slot = ctx.locataire.slots.get(String(ctx.args.slot_id))
      if (slot === undefined) return fail('NOT_FOUND')
      ctx.d.slot = slot
      return undefined
    }),
    'reserve.etape.creneau_ferme': etape(30, (ctx) =>
      ctx.instant >= Date.parse(slotDe(ctx).starts_at) ? fail('SLOT_CLOSED') : undefined,
    ),
    'reserve.etape.deja_reserve': etape(50, (ctx) => {
      const slot = slotDe(ctx)
      for (const b of ctx.locataire.bookings.values()) {
        if (b.member_id === ctx.args.member_id && b.slot_id === slot.slot_id && ctx.estActive(b)) {
          return fail('ALREADY_BOOKED')
        }
      }
      return undefined
    }),
    'reserve.effet': (ctx: PlatformContext): PlatformResponse =>
      ctx.regle<(ctx: PlatformContext) => PlatformResponse>('reserve.admission')(ctx),
  },
  grandeurs: ['request_id', 'member_id', 'slot_id', 'at', 'starts_at'],
  questions_ouvertes: [
    "la racine ne fixe pas la forme de la reponse de succes de reserve (les faits n'en comparent que booking_id et status) : le modele rend la vue de reservation (P1.R3 et suivantes)",
  ],
})

const P1_R3 = clause({
  id: 'P1.R3',
  enters: 'P1',
  text:
    "Réservations et statuts. Une réservation créée a pour booking_id le request_id de la requête qui l'a créée. " +
    "Ses statuts possibles sont 'confirmed' et 'cancelled' ('waiting' s'y ajoute à partir de P2). Une réservation est " +
    "ACTIVE si son statut est 'confirmed'. La vue d'une réservation porte booking_id, member_id, slot_id et status.",
  contract: {
    valeurs: { status: ['confirmed', 'cancelled'], active: ['confirmed'] },
    vue_reservation: { booking_id: 'chaine = request_id', member_id: 'chaine', slot_id: 'chaine', status: "'confirmed' | 'cancelled'" },
    exemples: [{ requete: { op: 'reserve', args: { request_id: 'r1', member_id: 'm-ana', slot_id: 'S1' } }, reponse: { ok: true, booking_id: 'r1', status: 'confirmed' } }],
  },
  implementation: {
    'reservation.creation': ((ctx, status) => {
      const b: Booking = {
        booking_id: String(ctx.args.request_id),
        member_id: String(ctx.args.member_id),
        slot_id: String(ctx.args.slot_id),
        seq: ++ctx.etat.seq,
        status,
        seats: typeof ctx.d.seats === 'number' ? ctx.d.seats : 1,
      }
      ctx.locataire.bookings.set(b.booking_id, b)
      return b
    }) satisfies Creation,
    'reservation.active.confirmee': (b: Booking): boolean => b.status === 'confirmed',
    'vue.reservation.base': ((_ctx, b, champs) => {
      Object.assign(champs, { booking_id: b.booking_id, member_id: b.member_id, slot_id: b.slot_id, status: b.status })
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['booking_id', 'request_id', 'member_id', 'slot_id', 'status'],
})

const P1_R4 = clause({
  id: 'P1.R4',
  enters: 'P1',
  text:
    "Idempotence de reserve. La première réponse produite pour un request_id est mémorisée, y compris une réponse " +
    "d'erreur (NOT_FOUND, SLOT_CLOSED, ALREADY_BOOKED, et FULL tant que ce refus existe). Toute requête reserve ultérieure portant le même " +
    "request_id renvoie cette réponse mémorisée à l'identique, sans aucun effet, quels que soient ses autres arguments " +
    "et l'état courant (même si la réservation a changé depuis, ou si le créneau a de la place).",
  contract: {
    operations: { reserve: { idempotence: 'cle request_id ; premiere reponse rejouee a l\'identique, erreurs comprises' } },
    erreurs: ['NOT_FOUND', 'SLOT_CLOSED', 'ALREADY_BOOKED', 'FULL'],
    exemples: [
      {
        contexte: "r3 a d'abord recu FULL ; une place s'est liberee depuis",
        requete: { op: 'reserve', args: { request_id: 'r3', member_id: 'm-cleo', slot_id: 'S1' } },
        reponse: { ok: false, error: 'FULL' },
      },
    ],
  },
  implementation: {
    'reserve.etape.idempotence': etape(10, (ctx) => {
      const cle = String(ctx.args.request_id)
      const memo = ctx.locataire.memo.get(cle)
      if (memo !== undefined) return clone(memo)
      const memo_de = ctx.locataire.memo
      ctx.apres.push((r) => {
        const memorisable = ctx.regleOpt<(r: PlatformResponse) => boolean>('idempotence.memorisable')
        if (memorisable === undefined || memorisable(r)) memo_de.set(cle, clone(r))
      })
      return undefined
    }),
  },
  grandeurs: ['request_id'],
})

const P1_R5 = clause({
  id: 'P1.R5',
  enters: 'P1',
  exits: 'P2',
  text:
    "Admission. booked est le nombre de places occupées par les réservations 'confirmed' du créneau ; chaque " +
    "réservation occupe exactement 1 place. Si booked + 1 <= capacity, la réservation est créée 'confirmed' ; sinon la " +
    "requête est refusée { ok: false, error: 'FULL' } et rien n'est créé.",
  contract: {
    operations: { reserve: { admission: 'confirmed si booked + 1 <= capacity, sinon FULL', erreurs: ['FULL'] } },
    valeurs: { places_par_reservation: 1 },
    exemples: [
      { contexte: 'S1 de capacity 2, deux reservations confirmed', requete: { op: 'reserve', args: { request_id: 'r3', member_id: 'm-cleo', slot_id: 'S1' } }, reponse: { ok: false, error: 'FULL' } },
    ],
  },
  implementation: {
    'reserve.admission': (ctx: PlatformContext): PlatformResponse => {
      const slot = slotDe(ctx)
      if (ctx.occupees(slot) + 1 > slot.capacity) return fail('FULL')
      const b = ctx.regle<Creation>('reservation.creation')(ctx, 'confirmed')
      ctx.confirmer(b)
      return ctx.vue('vue.reservation.', b)
    },
  },
  grandeurs: ['booked', 'capacity'],
})

const P1_R6 = clause({
  id: 'P1.R6',
  enters: 'P1',
  text:
    "Annulation. L'opération cancel reçoit booking_id. booking_id inconnu -> { ok: false, error: 'NOT_FOUND' } ; " +
    "réservation déjà 'cancelled' -> { ok: false, error: 'ALREADY_CANCELLED' } ; sinon son statut devient 'cancelled' " +
    "et sa place est libérée. Aucune règle de délai : l'annulation est permise à tout instant. Réponse " +
    "{ ok: true, booking_id, status: 'cancelled' }.",
  contract: {
    operations: {
      cancel: {
        arguments: { booking_id: 'chaine' },
        reponse: { ok: true, booking_id: 'chaine', status: "'cancelled'" },
        erreurs: ['NOT_FOUND', 'ALREADY_CANCELLED'],
      },
    },
    exemples: [
      { requete: { op: 'cancel', args: { booking_id: 'r1' } }, reponse: { ok: true, booking_id: 'r1', status: 'cancelled' } },
      { requete: { op: 'cancel', args: { booking_id: 'r1' } }, reponse: { ok: false, error: 'ALREADY_CANCELLED' } },
      { requete: { op: 'cancel', args: { booking_id: 'r404' } }, reponse: { ok: false, error: 'NOT_FOUND' } },
    ],
  },
  implementation: {
    'cancel.etape.inconnue': etape(10, (ctx) => {
      const b = ctx.locataire.bookings.get(String(ctx.args.booking_id))
      if (b === undefined) return fail('NOT_FOUND')
      ctx.d.booking = b
      return undefined
    }),
    'cancel.etape.deja_annulee': etape(30, (ctx) =>
      reservationDe(ctx).status === 'cancelled' ? fail('ALREADY_CANCELLED') : undefined,
    ),
    'cancel.effet': (ctx: PlatformContext): PlatformResponse => {
      const b = reservationDe(ctx)
      const slot = ctx.locataire.slots.get(b.slot_id)
      const etaitConfirmee = b.status === 'confirmed'
      ctx.regleOpt<Remboursement>('annulation.remboursement')?.(ctx, b, b.seats, b.seats)
      if (b.status === 'waiting') ctx.regleOpt<RetraitFile>('annulation.retrait_file')?.(ctx, b, slot)
      b.status = 'cancelled'
      ctx.d.promoted = etaitConfirmee ? ctx.liberer(slot) : []
      return ctx.vue('vue.annulation.', b)
    },
    'vue.annulation.base': ((_ctx, b, champs) => {
      Object.assign(champs, { booking_id: b.booking_id, status: b.status })
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['booking_id', 'status'],
})

const P1_R7 = clause({
  id: 'P1.R7',
  enters: 'P1',
  text:
    "Lectures. get_booking { booking_id } -> { ok: true, booking_id, member_id, slot_id, status } (vue de la " +
    "réservation), ou { ok: false, error: 'NOT_FOUND' } si booking_id est inconnu. get_slot { slot_id } -> " +
    "{ ok: true, slot_id, capacity, starts_at, booked, available }, ou NOT_FOUND si slot_id est inconnu. booked est la " +
    "somme des places des réservations 'confirmed' du créneau et available = capacity - booked.",
  contract: {
    operations: {
      get_booking: {
        arguments: { booking_id: 'chaine' },
        reponse: { ok: true, booking_id: 'chaine', member_id: 'chaine', slot_id: 'chaine', status: 'chaine' },
        erreurs: ['NOT_FOUND'],
      },
      get_slot: {
        arguments: { slot_id: 'chaine' },
        reponse: { ok: true, slot_id: 'chaine', capacity: 'entier', starts_at: 'instant', booked: 'entier', available: 'entier' },
        erreurs: ['NOT_FOUND'],
      },
    },
    exemples: [
      {
        requete: { op: 'get_slot', args: { slot_id: 'S1' } },
        reponse: { ok: true, slot_id: 'S1', capacity: 2, starts_at: '2031-03-20T18:00:00Z', booked: 1, available: 1 },
      },
      { requete: { op: 'get_booking', args: { booking_id: 'r1' } }, reponse: { ok: true, booking_id: 'r1', member_id: 'm-ana', slot_id: 'S1', status: 'cancelled' } },
    ],
  },
  implementation: {
    'get_booking.etape.inconnue': etape(10, (ctx) => {
      const b = ctx.locataire.bookings.get(String(ctx.args.booking_id))
      if (b === undefined) return fail('NOT_FOUND')
      ctx.d.booking = b
      return undefined
    }),
    'get_booking.effet': (ctx: PlatformContext): PlatformResponse => ctx.vue('vue.reservation.', reservationDe(ctx)),
    'get_slot.etape.inconnu': etape(10, (ctx) => {
      const slot = ctx.locataire.slots.get(String(ctx.args.slot_id))
      if (slot === undefined) return fail('NOT_FOUND')
      ctx.d.slot = slot
      return undefined
    }),
    'get_slot.effet': (ctx: PlatformContext): PlatformResponse => ctx.vue('vue.creneau.', slotDe(ctx)),
    'creneau.occupation': (ctx: PlatformContext, slot: Slot): number => {
      let n = 0
      for (const b of ctx.locataire.bookings.values()) {
        if (b.slot_id === slot.slot_id && b.status === 'confirmed') n += b.seats
      }
      return n
    },
    'vue.creneau.base': ((ctx, s, champs) => {
      const booked = ctx.occupees(s)
      Object.assign(champs, { slot_id: s.slot_id, capacity: s.capacity, starts_at: s.starts_at, booked, available: s.capacity - booked })
    }) satisfies Vue<Slot>,
  },
  grandeurs: ['booking_id', 'member_id', 'slot_id', 'status', 'capacity', 'starts_at', 'booked', 'available'],
})

/* ════════════════════════════════════════════════════════════════════ P2 */

const P2_R1 = clause({
  id: 'P2.R1',
  enters: 'P2',
  exits: 'P6',
  replaces: 'P1.R5',
  text:
    "Admission avec file d'attente (remplace P1.R5). Si booked + 1 <= capacity, la réservation est créée 'confirmed' ; " +
    "sinon elle est créée avec le statut 'waiting' et ajoutée en QUEUE de la file d'attente du créneau. Le refus FULL " +
    "n'existe plus. La réponse d'une réservation en attente porte position, son rang dans la file compté à partir de 1 " +
    "(1 = tête de file).",
  contract: {
    operations: { reserve: { admission: "confirmed si booked + 1 <= capacity, sinon waiting en queue de file", reponse_attente: { status: "'waiting'", position: 'entier >= 1' } } },
    retire: ['FULL'],
    exemples: [
      { contexte: 'S2 de capacity 1 deja occupe', requete: { op: 'reserve', args: { request_id: 'w2', member_id: 'm-ben', slot_id: 'S2' } }, reponse: { ok: true, booking_id: 'w2', status: 'waiting', position: 1 } },
    ],
  },
  implementation: {
    'reserve.admission': (ctx: PlatformContext): PlatformResponse => {
      const slot = slotDe(ctx)
      const creer = ctx.regle<Creation>('reservation.creation')
      if (ctx.occupees(slot) + 1 <= slot.capacity) {
        const b = creer(ctx, 'confirmed')
        ctx.confirmer(b)
        return ctx.vue('vue.reservation.', b)
      }
      const b = creer(ctx, 'waiting')
      slot.file.push(b.booking_id)
      return ctx.vue('vue.reservation.', b)
    },
  },
  grandeurs: ['booked', 'capacity', 'status', 'position'],
})

const P2_R2 = clause({
  id: 'P2.R2',
  enters: 'P2',
  exits: 'P6',
  text:
    "Promotion à l'annulation. Quand une réservation 'confirmed' est annulée, la place libérée est attribuée, dans la " +
    "même opération, à la réservation en tête de file, qui passe 'confirmed' et quitte la file. Annuler une réservation " +
    "'waiting' la retire de la file (les suivantes remontent d'un rang) et ne promeut personne. La réponse de cancel " +
    "porte promoted : la liste ordonnée des booking_id promus par cette opération ([] si aucun).",
  contract: {
    operations: { cancel: { reponse: { ok: true, booking_id: 'chaine', status: "'cancelled'", promoted: 'tableau de booking_id' } } },
    exemples: [
      { contexte: 'w1 confirmed, file [w3, w4]', requete: { op: 'cancel', args: { booking_id: 'w1' } }, reponse: { ok: true, booking_id: 'w1', status: 'cancelled', promoted: ['w3'] } },
      { contexte: 'w2 waiting', requete: { op: 'cancel', args: { booking_id: 'w2' } }, reponse: { ok: true, booking_id: 'w2', status: 'cancelled', promoted: [] } },
    ],
  },
  implementation: {
    'annulation.retrait_file': ((_ctx, b, slot) => {
      if (slot !== undefined) slot.file = slot.file.filter((id) => id !== b.booking_id)
    }) satisfies RetraitFile,
    'liberation.promotion': (ctx: PlatformContext, slot: Slot): string[] => {
      const promus: string[] = []
      for (;;) {
        const tete = slot.file[0]
        const b = tete === undefined ? undefined : ctx.locataire.bookings.get(tete)
        if (b === undefined || ctx.occupees(slot) + b.seats > slot.capacity) break
        slot.file.shift()
        ctx.confirmer(b)
        promus.push(b.booking_id)
      }
      return promus
    },
    'vue.annulation.promus': ((ctx, _b, champs) => {
      champs.promoted = Array.isArray(ctx.d.promoted) ? [...(ctx.d.promoted as string[])] : []
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['promoted', 'status'],
})

const P2_R3 = clause({
  id: 'P2.R3',
  enters: 'P2',
  text:
    "Lectures avec file. get_slot porte en plus waiting : la liste ordonnée des booking_id en attente sur le créneau " +
    "(tête de file en premier, [] si personne). get_booking d'une réservation 'waiting' porte position (rang 1-base " +
    "dans la file) ; une réservation qui n'est pas 'waiting' n'a pas de champ position.",
  contract: {
    operations: {
      get_slot: { reponse: { waiting: 'tableau de booking_id' } },
      get_booking: { reponse: { position: "entier >= 1, seulement si status = 'waiting'" } },
    },
    exemples: [
      { requete: { op: 'get_slot', args: { slot_id: 'S2' } }, reponse: { ok: true, slot_id: 'S2', booked: 1, available: 0, waiting: ['w2', 'w3'] } },
      { requete: { op: 'get_booking', args: { booking_id: 'w3' } }, reponse: { ok: true, booking_id: 'w3', status: 'waiting', position: 1 } },
    ],
  },
  implementation: {
    'vue.creneau.file': ((_ctx, s, champs) => {
      champs.waiting = [...s.file]
    }) satisfies Vue<Slot>,
    'vue.reservation.position': ((ctx, b, champs) => {
      if (b.status !== 'waiting') return
      const slot = ctx.locataire.slots.get(b.slot_id)
      if (slot !== undefined) champs.position = slot.file.indexOf(b.booking_id) + 1
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['waiting', 'position'],
})

const P2_R4 = clause({
  id: 'P2.R4',
  enters: 'P2',
  text:
    "Une réservation 'waiting' est ACTIVE : elle déclenche { ok: false, error: 'ALREADY_BOOKED' } pour une nouvelle " +
    'réservation du même membre sur le même créneau, exactement comme une réservation confirmed.',
  contract: {
    valeurs: { active: ['confirmed', 'waiting'] },
    erreurs: ['ALREADY_BOOKED'],
    exemples: [
      { contexte: 'm-cleo a w3 waiting sur S2', requete: { op: 'reserve', args: { request_id: 'w5', member_id: 'm-cleo', slot_id: 'S2' } }, reponse: { ok: false, error: 'ALREADY_BOOKED' } },
    ],
  },
  implementation: {
    'reservation.active.en_attente': (b: Booking): boolean => b.status === 'waiting',
  },
  grandeurs: ['status'],
})

/* ════════════════════════════════════════════════════════════════════ P3 */

const P3_R1 = clause({
  id: 'P3.R1',
  enters: 'P3',
  text:
    "Création d'un locataire. create_tenant { tenant_id, owner_id } crée un locataire ; tenant_id est une chaîne non " +
    "vide, owner_id le member_id de son propriétaire. Un tenant_id déjà pris (y compris 'default') -> " +
    "{ ok: false, error: 'ALREADY_EXISTS' }. Réponse { ok: true, tenant_id }. owner_id n'a d'effet qu'à partir de P4. " +
    "create_tenant ne porte pas de champ tenant.",
  contract: {
    operations: {
      create_tenant: {
        arguments: { tenant_id: 'chaine non vide', owner_id: 'chaine non vide' },
        reponse: { ok: true, tenant_id: 'chaine' },
        erreurs: ['ALREADY_EXISTS', 'INVALID_ARGUMENT'],
      },
    },
    exemples: [
      { requete: { op: 'create_tenant', args: { tenant_id: 't-alpha', owner_id: 'm-ana' } }, reponse: { ok: true, tenant_id: 't-alpha' } },
      { requete: { op: 'create_tenant', args: { tenant_id: 't-alpha', owner_id: 'm-dan' } }, reponse: { ok: false, error: 'ALREADY_EXISTS' } },
    ],
  },
  implementation: {
    'create_tenant.effet': (ctx: PlatformContext): PlatformResponse => {
      const { tenant_id, owner_id } = ctx.args
      if (!estChaine(tenant_id) || !estChaine(owner_id)) return fail('INVALID_ARGUMENT')
      if (ctx.etat.tenants.has(tenant_id)) return fail('ALREADY_EXISTS')
      ctx.etat.tenants.set(tenant_id, newTenant(tenant_id, owner_id))
      return succeed({ tenant_id })
    },
  },
  grandeurs: ['tenant_id', 'owner_id'],
  questions_ouvertes: ['tenant_id ou owner_id absent : non fixe par la racine ; le modele repond INVALID_ARGUMENT'],
})

const P3_R2 = clause({
  id: 'P3.R2',
  enters: 'P3',
  text:
    "Locataire de chaque opération. Toute opération autre que create_tenant porte un champ tenant, au niveau de " +
    "l'opération (hors args) ; absent, il vaut 'default'. Le locataire 'default' existe implicitement et contient tout ce " +
    "qui a été créé en P1 et P2. Un tenant inconnu -> { ok: false, error: 'NOT_FOUND' }, contrôle fait avant tous les " +
    'autres.',
  contract: {
    enveloppe: { tenant: "chaine, hors args ; absent -> 'default'" },
    erreurs: ['NOT_FOUND'],
    exemples: [{ requete: { op: 'reserve', tenant: 't-gamma', args: { request_id: 'x1', member_id: 'm-ana', slot_id: 'S1' } }, reponse: { ok: false, error: 'NOT_FOUND' } }],
  },
  implementation: {
    'enveloppe.locataire': etape(10, (ctx) => {
      if (ctx.step.op === 'create_tenant') return undefined
      const partition = ctx.regle<(ctx: PlatformContext, id: string) => Tenant | undefined>('locataire.partition')(
        ctx,
        ctx.step.tenant ?? 'default',
      )
      if (partition === undefined) return fail('NOT_FOUND')
      ctx.locataire = partition
      return undefined
    }),
  },
  grandeurs: ['tenant_id'],
})

const P3_R3 = clause({
  id: 'P3.R3',
  enters: 'P3',
  text:
    "Isolation des locataires. slot_id, booking_id (donc request_id) et member_id sont propres à chaque locataire : " +
    "le même identifiant peut exister dans deux locataires sans rapport entre eux. Une ressource d'un autre locataire est " +
    "introuvable : { ok: false, error: 'NOT_FOUND' }, jamais FORBIDDEN. L'idempotence de reserve est clé par le couple " +
    '(tenant, request_id).',
  contract: {
    isolation: ['slot_id', 'booking_id', 'request_id', 'member_id'],
    idempotence: { cle: '(tenant, request_id)' },
    erreurs: ['NOT_FOUND'],
    exemples: [
      { contexte: 'w3 existe dans default', requete: { op: 'get_booking', tenant: 't-alpha', args: { booking_id: 'w3' } }, reponse: { ok: false, error: 'NOT_FOUND' } },
    ],
  },
  implementation: {
    'locataire.partition': (ctx: PlatformContext, id: string): Tenant | undefined => ctx.etat.tenants.get(id),
  },
  grandeurs: ['tenant_id', 'slot_id', 'booking_id', 'request_id', 'member_id'],
})

/* ════════════════════════════════════════════════════════════════════ P4 */

const ROLES = ['admin', 'staff', 'member'] as const

const P4_R1 = clause({
  id: 'P4.R1',
  enters: 'P4',
  text:
    "Membres et rôles. Les rôles sont 'admin', 'staff' et 'member'. Le owner_id d'un locataire est 'admin' de ce " +
    "locataire. add_member { member_id, role } crée le membre dans le locataire de l'opération, ou remplace son rôle s'il " +
    "existe déjà ; réponse { ok: true, member_id, role }. Un role hors de ces trois valeurs -> " +
    "{ ok: false, error: 'INVALID_ARGUMENT' }. Le locataire 'default' n'a ni propriétaire ni membre.",
  contract: {
    operations: {
      add_member: {
        roles_autorises: ['admin'],
        arguments: { member_id: 'chaine non vide', role: "'admin' | 'staff' | 'member'" },
        reponse: { ok: true, member_id: 'chaine', role: 'chaine' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { roles: [...ROLES], proprietaire: 'admin' },
    exemples: [{ requete: { op: 'add_member', tenant: 't-alpha', actor: 'm-ana', args: { member_id: 'm-sam', role: 'staff' } }, reponse: { ok: true, member_id: 'm-sam', role: 'staff' } }],
  },
  implementation: {
    'membres.role': (_ctx: PlatformContext, t: Tenant, m: string): string | undefined =>
      t.owner_id === m ? 'admin' : t.members.get(m),
    'add_member.effet': (ctx: PlatformContext): PlatformResponse => {
      const { member_id, role } = ctx.args
      if (!estChaine(member_id) || typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
        return fail('INVALID_ARGUMENT')
      }
      ctx.locataire.members.set(member_id, role)
      return succeed({ member_id, role })
    },
  },
  grandeurs: ['member_id', 'role', 'owner_id'],
  questions_ouvertes: [
    "add_member sur le owner_id : la racine dit que le proprietaire est admin ; le modele le garde admin quel que soit le role ecrit",
    'role invalide : non fixe par la racine ; le modele repond INVALID_ARGUMENT',
  ],
})

const P4_R2 = clause({
  id: 'P4.R2',
  enters: 'P4',
  text:
    "Acteur. Toute opération sauf create_tenant porte un champ actor (au niveau de l'opération, hors args) : le " +
    "member_id de celui qui agit. Ordre des contrôles : (1) tenant inconnu -> NOT_FOUND ; (2) actor absent ou non membre " +
    "du locataire -> { ok: false, error: 'FORBIDDEN' } ; (3) rôle de l'actor non autorisé pour l'opération -> " +
    "{ ok: false, error: 'FORBIDDEN' } ; puis les contrôles propres à l'opération.",
  contract: {
    enveloppe: { actor: 'member_id, hors args ; obligatoire sauf create_tenant' },
    ordre_des_controles: ['tenant inconnu -> NOT_FOUND', 'actor absent ou non membre -> FORBIDDEN', 'role non autorise -> FORBIDDEN', "controles de l'operation"],
    erreurs: ['FORBIDDEN', 'NOT_FOUND'],
    exemples: [
      { contexte: "m-ana n'est pas membre de t-beta", requete: { op: 'get_slot', tenant: 't-beta', actor: 'm-ana', args: { slot_id: 'S1' } }, reponse: { ok: false, error: 'FORBIDDEN' } },
      { requete: { op: 'get_slot', tenant: 't-alpha', args: { slot_id: 'S4' } }, reponse: { ok: false, error: 'FORBIDDEN' } },
    ],
  },
  implementation: {
    'enveloppe.acteur': etape(20, (ctx) => {
      if (ctx.step.op === 'create_tenant') return undefined
      const role = ctx.role(ctx.step.actor)
      if (role === undefined) return fail('FORBIDDEN')
      const permis = ctx.regle<readonly string[]>(`autorisation.${ctx.step.op}`)
      return permis.includes(role) ? undefined : fail('FORBIDDEN')
    }),
  },
  grandeurs: ['actor', 'role', 'tenant_id'],
})

const soiSeulement =
  (cible: (ctx: PlatformContext) => string) =>
  (ctx: PlatformContext): PlatformResponse | undefined =>
    ctx.role(ctx.step.actor) === 'member' && cible(ctx) !== ctx.step.actor ? fail('FORBIDDEN') : undefined

const P4_R3 = clause({
  id: 'P4.R3',
  enters: 'P4',
  text:
    "Permissions par opération. add_member : admin. create_slot : admin, staff. reserve : admin et staff pour tout " +
    "member_id ; member seulement si member_id = actor (sinon FORBIDDEN, contrôle fait avant l'idempotence). cancel et " +
    "get_booking : admin et staff pour toute réservation ; member seulement pour ses propres réservations (booking_id " +
    "inconnu -> NOT_FOUND d'abord, puis réservation d'un autre membre -> FORBIDDEN). get_slot : tous les rôles. " +
    "create_tenant : sans contrôle d'acteur.",
  contract: {
    permissions: {
      add_member: ['admin'],
      create_slot: ['admin', 'staff'],
      reserve: ['admin', 'staff', 'member:soi'],
      cancel: ['admin', 'staff', 'member:soi'],
      get_booking: ['admin', 'staff', 'member:soi'],
      get_slot: ['admin', 'staff', 'member'],
      create_tenant: 'sans controle',
    },
    erreurs: ['FORBIDDEN', 'NOT_FOUND'],
    exemples: [
      { requete: { op: 'reserve', tenant: 't-alpha', actor: 'm-cleo', args: { request_id: 'c2', member_id: 'm-dan', slot_id: 'S4' } }, reponse: { ok: false, error: 'FORBIDDEN' } },
      { requete: { op: 'cancel', tenant: 't-alpha', actor: 'm-dan', args: { booking_id: 'c1' } }, reponse: { ok: false, error: 'FORBIDDEN' } },
    ],
  },
  implementation: {
    'autorisation.add_member': ['admin'],
    'autorisation.create_slot': ['admin', 'staff'],
    'autorisation.reserve': ['admin', 'staff', 'member'],
    'autorisation.cancel': ['admin', 'staff', 'member'],
    'autorisation.get_booking': ['admin', 'staff', 'member'],
    'autorisation.get_slot': ['admin', 'staff', 'member'],
    'reserve.etape.pour_autrui': etape(5, soiSeulement((ctx) => String(ctx.args.member_id))),
    'cancel.etape.proprietaire': etape(20, soiSeulement((ctx) => reservationDe(ctx).member_id)),
    'get_booking.etape.proprietaire': etape(20, soiSeulement((ctx) => reservationDe(ctx).member_id)),
  },
  grandeurs: ['role', 'member_id', 'actor'],
})

const P4_R4 = clause({
  id: 'P4.R4',
  enters: 'P4',
  text:
    "Une réponse FORBIDDEN n'est jamais mémorisée pour l'idempotence : le même request_id reste utilisable ensuite. " +
    "reserve : un member_id qui n'est pas membre du locataire -> { ok: false, error: 'NOT_FOUND' }, contrôle fait après " +
    "celui de l'existence du créneau et avant SLOT_CLOSED.",
  contract: {
    operations: { reserve: { erreurs: ['NOT_FOUND', 'FORBIDDEN'], membre_inconnu: 'NOT_FOUND, apres slot inconnu, avant SLOT_CLOSED' } },
    idempotence: { jamais_memorise: ['FORBIDDEN'] },
    exemples: [
      { contexte: 'c2 a recu FORBIDDEN', requete: { op: 'reserve', tenant: 't-alpha', actor: 'm-cleo', args: { request_id: 'c2', member_id: 'm-cleo', slot_id: 'S4' } }, reponse: { ok: true, booking_id: 'c2', status: 'confirmed' } },
      { requete: { op: 'reserve', tenant: 't-alpha', actor: 'm-sam', args: { request_id: 'c4', member_id: 'm-eve', slot_id: 'S4' } }, reponse: { ok: false, error: 'NOT_FOUND' } },
    ],
  },
  implementation: {
    'idempotence.memorisable': (r: PlatformResponse): boolean => r.error !== 'FORBIDDEN',
    'reserve.etape.membre_inconnu': etape(25, (ctx) => (ctx.role(ctx.args.member_id) === undefined ? fail('NOT_FOUND') : undefined)),
  },
  grandeurs: ['request_id', 'member_id'],
})

/* ════════════════════════════════════════════════════════════════════ P5 */

const datesDeSerie = (s: Series): string[] => {
  const debut = dateUtc(s.from_date)
  const fin = dateUtc(s.until_date)
  const out: string[] = []
  if (debut === null || fin === null) return out
  for (let t = debut; t <= fin; t += JOUR_MS) if (jourIso(t) === s.weekday) out.push(texteDate(t))
  return out
}
const occurrence = (series_id: string, date: string): string => `${series_id}@${date}`

const P5_R1 = clause({
  id: 'P5.R1',
  enters: 'P5',
  text:
    "Créneaux récurrents hebdomadaires. create_recurring { series_id, weekday, start_time, capacity, from_date, " +
    "until_date } (rôles admin, staff) : weekday est le jour ISO 8601 (1 = lundi ... 7 = dimanche) ; start_time est une " +
    "heure 'HH:MM' en UTC ; from_date et until_date sont des dates 'AAAA-MM-JJ' du calendrier UTC, bornes INCLUSES. " +
    "L'opération crée un créneau par date d de [from_date, until_date] dont le jour ISO vaut weekday, de slot_id " +
    "'<series_id>@<AAAA-MM-JJ>', de starts_at '<AAAA-MM-JJ>T<HH:MM>:00Z' et de capacité capacity. Ces créneaux se " +
    "réservent et se lisent comme les autres. Réponse { ok: true, series_id, slot_ids }, slot_ids en ordre chronologique.",
  contract: {
    operations: {
      create_recurring: {
        roles_autorises: ['admin', 'staff'],
        arguments: {
          series_id: 'chaine non vide',
          weekday: 'entier 1..7 (ISO, 1 = lundi)',
          start_time: "'HH:MM' UTC",
          capacity: 'entier >= 1',
          from_date: "'AAAA-MM-JJ' incluse",
          until_date: "'AAAA-MM-JJ' incluse",
        },
        reponse: { ok: true, series_id: 'chaine', slot_ids: 'tableau chronologique' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'],
      },
    },
    valeurs: { weekday: 'ISO 8601, 1 = lundi', bornes: 'incluses', fuseau: 'UTC' },
    exemples: [
      {
        requete: { op: 'create_recurring', args: { series_id: 'yoga', weekday: 3, start_time: '18:00', capacity: 2, from_date: '2031-03-10', until_date: '2031-04-09' } },
        reponse: { ok: true, series_id: 'yoga', slot_ids: ['yoga@2031-03-12', 'yoga@2031-03-19', 'yoga@2031-03-26', 'yoga@2031-04-02', 'yoga@2031-04-09'] },
      },
    ],
  },
  implementation: {
    'autorisation.create_recurring': ['admin', 'staff'],
    'serie.dates': datesDeSerie,
    'create_recurring.effet': (ctx: PlatformContext): PlatformResponse => {
      const { series_id, weekday, start_time, capacity, from_date, until_date } = ctx.args
      const debut = dateUtc(from_date)
      const fin = dateUtc(until_date)
      if (
        !estChaine(series_id) ||
        !estEntier(weekday) || weekday < 1 || weekday > 7 ||
        typeof start_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start_time) ||
        !estEntier(capacity) || capacity < 1 ||
        debut === null || fin === null || debut > fin
      ) {
        return fail('INVALID_ARGUMENT')
      }
      const t = ctx.locataire
      const serie: Series = {
        series_id, weekday, start_time, capacity,
        from_date: String(from_date), until_date: String(until_date), exceptions: new Set(),
      }
      const dates = datesDeSerie(serie)
      if (t.series.has(series_id) || dates.some((d) => t.slots.has(occurrence(series_id, d)))) return fail('ALREADY_EXISTS')
      t.series.set(series_id, serie)
      for (const d of dates) {
        const slot_id = occurrence(series_id, d)
        t.slots.set(slot_id, { slot_id, capacity, starts_at: `${d}T${start_time}:00Z`, file: [] })
      }
      return succeed({ series_id, slot_ids: dates.map((d) => occurrence(series_id, d)) })
    },
  },
  grandeurs: ['series_id', 'weekday', 'start_time', 'capacity', 'from_date', 'until_date', 'slot_id', 'starts_at', 'slot_ids'],
  questions_ouvertes: [
    "series_id deja pris, ou occurrence dont le slot_id existe deja : non fixe par la racine ; le modele repond ALREADY_EXISTS sans rien creer",
    'arguments invalides (weekday hors 1..7, heure ou date mal formee, from_date > until_date) : non fixe ; le modele repond INVALID_ARGUMENT',
  ],
})

const P5_R2 = clause({
  id: 'P5.R2',
  enters: 'P5',
  text:
    "Exceptions (jours fériés). add_exception { series_id, date } (rôles admin, staff) : si series_id est inconnu, ou si " +
    "date n'est pas une occurrence COURANTE de la série (jour de semaine différent, hors des bornes, ou déjà exceptée) -> " +
    "{ ok: false, error: 'NOT_FOUND' }. Sinon l'occurrence est retirée : son créneau n'existe plus (get_slot et reserve " +
    "sur son slot_id -> NOT_FOUND) et toutes ses réservations actives ('confirmed' et 'waiting') passent 'cancelled' " +
    "(elles restent lisibles par get_booking). Réponse { ok: true, series_id, date, cancelled }, cancelled étant la liste " +
    "des booking_id annulés dans l'ordre de création des réservations.",
  contract: {
    operations: {
      add_exception: {
        roles_autorises: ['admin', 'staff'],
        arguments: { series_id: 'chaine', date: "'AAAA-MM-JJ'" },
        reponse: { ok: true, series_id: 'chaine', date: 'chaine', cancelled: 'tableau de booking_id, ordre de creation' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND'],
      },
    },
    exemples: [
      { requete: { op: 'add_exception', args: { series_id: 'yoga', date: '2031-03-26' } }, reponse: { ok: true, series_id: 'yoga', date: '2031-03-26', cancelled: ['d1', 'd2', 'd3'] } },
      { contexte: 'deja exceptee', requete: { op: 'add_exception', args: { series_id: 'yoga', date: '2031-03-26' } }, reponse: { ok: false, error: 'NOT_FOUND' } },
    ],
  },
  implementation: {
    'autorisation.add_exception': ['admin', 'staff'],
    'add_exception.effet': (ctx: PlatformContext): PlatformResponse => {
      const t = ctx.locataire
      const serie = t.series.get(String(ctx.args.series_id))
      const date = ctx.args.date
      if (serie === undefined || typeof date !== 'string') return fail('NOT_FOUND')
      const dates = ctx.regle<(s: Series) => string[]>('serie.dates')(serie)
      if (!dates.includes(date) || serie.exceptions.has(date)) return fail('NOT_FOUND')
      serie.exceptions.add(date)
      const slot_id = occurrence(serie.series_id, date)
      const annulees = [...t.bookings.values()]
        .filter((b) => b.slot_id === slot_id && (b.status === 'confirmed' || b.status === 'waiting'))
        .sort((a, b) => a.seq - b.seq)
      for (const b of annulees) b.status = 'cancelled'
      t.slots.delete(slot_id)
      return succeed({ series_id: serie.series_id, date, cancelled: annulees.map((b) => b.booking_id) })
    },
  },
  grandeurs: ['series_id', 'date', 'cancelled', 'status'],
  questions_ouvertes: [
    "a partir de P7/P8, une reservation confirmed annulee par add_exception : la racine ne dit ni remboursement ni re-credit du portefeuille ; le modele n'applique aucun remboursement (a trancher avant toute sequence qui l'exerce)",
  ],
})

const P5_R3 = clause({
  id: 'P5.R3',
  enters: 'P5',
  text:
    "list_occurrences { series_id } (tous les rôles) -> { ok: true, series_id, slot_ids } : les slot_id des occurrences " +
    "courantes de la série, exceptions exclues, en ordre chronologique ; series_id inconnu -> " +
    "{ ok: false, error: 'NOT_FOUND' }.",
  contract: {
    operations: {
      list_occurrences: {
        roles_autorises: ['admin', 'staff', 'member'],
        arguments: { series_id: 'chaine' },
        reponse: { ok: true, series_id: 'chaine', slot_ids: 'tableau chronologique' },
        erreurs: ['NOT_FOUND'],
      },
    },
    exemples: [
      { contexte: 'apres exception du 2031-03-26', requete: { op: 'list_occurrences', args: { series_id: 'yoga' } }, reponse: { ok: true, series_id: 'yoga', slot_ids: ['yoga@2031-03-12', 'yoga@2031-03-19', 'yoga@2031-04-02', 'yoga@2031-04-09'] } },
    ],
  },
  implementation: {
    'autorisation.list_occurrences': ['admin', 'staff', 'member'],
    'list_occurrences.effet': (ctx: PlatformContext): PlatformResponse => {
      const serie = ctx.locataire.series.get(String(ctx.args.series_id))
      if (serie === undefined) return fail('NOT_FOUND')
      const dates = ctx.regle<(s: Series) => string[]>('serie.dates')(serie).filter((d) => !serie.exceptions.has(d))
      return succeed({ series_id: serie.series_id, slot_ids: dates.map((d) => occurrence(serie.series_id, d)) })
    },
  },
  grandeurs: ['series_id', 'slot_ids'],
  questions_ouvertes: ['series_id inconnu : non fixe par la racine ; le modele repond NOT_FOUND'],
})

/* ════════════════════════════════════════════════════════════════════ P6 */

const P6_R1 = clause({
  id: 'P6.R1',
  enters: 'P6',
  exits: 'P13',
  text:
    "Réservations de groupe. reserve accepte un argument seats, nombre de places demandées : entier >= 1, 1 par défaut " +
    "s'il est absent ; toute autre valeur -> { ok: false, error: 'INVALID_ARGUMENT' }. Toute réservation porte seats, et " +
    "les réponses de reserve et de get_booking le renvoient. booked est la SOMME des seats des réservations 'confirmed' " +
    'du créneau ; available = capacity - booked.',
  contract: {
    operations: {
      reserve: { arguments: { seats: 'entier >= 1, defaut 1' }, reponse: { seats: 'entier' }, erreurs: ['INVALID_ARGUMENT'] },
      get_booking: { reponse: { seats: 'entier' } },
    },
    exemples: [{ requete: { op: 'reserve', args: { request_id: 'g1', member_id: 'm-cleo', slot_id: 'S6', seats: 3 } }, reponse: { ok: true, booking_id: 'g1', status: 'confirmed', seats: 3 } }],
  },
  implementation: {
    'reserve.etape.places_valides': etape(40, (ctx) => {
      const seats = ctx.args.seats ?? 1
      if (!estEntier(seats) || seats < 1) return fail('INVALID_ARGUMENT')
      ctx.d.seats = seats
      return undefined
    }),
    'vue.reservation.places': ((_ctx, b, champs) => {
      champs.seats = b.seats
    }) satisfies Vue<Booking>,
    'creneau.plafond': (_ctx: PlatformContext, slot: Slot): number => slot.capacity,
  },
  grandeurs: ['seats', 'booked', 'available', 'capacity'],
  questions_ouvertes: ["INVALID_ARGUMENT figure en P6.R1 alors que la racine le liste parmi les codes introduits en P8"],
})

const P6_R2 = clause({
  id: 'P6.R2',
  enters: 'P6',
  text:
    "Groupe trop grand. seats > capacity -> { ok: false, error: 'GROUP_TOO_LARGE' }, contrôle placé après SLOT_CLOSED " +
    "(et après la validité de seats) et avant ALREADY_BOOKED. seats = capacity est permis.",
  contract: {
    operations: { reserve: { erreurs: ['GROUP_TOO_LARGE'], ordre_des_controles: ['SLOT_CLOSED', 'INVALID_ARGUMENT (seats)', 'GROUP_TOO_LARGE', 'ALREADY_BOOKED'] } },
    exemples: [{ contexte: 'S6 de capacity 5', requete: { op: 'reserve', args: { request_id: 'g5', member_id: 'm-ana', slot_id: 'S6', seats: 6 } }, reponse: { ok: false, error: 'GROUP_TOO_LARGE' } }],
  },
  implementation: {
    'reserve.etape.taille_groupe': etape(45, (ctx) =>
      (ctx.d.seats as number) > slotDe(ctx).capacity ? fail('GROUP_TOO_LARGE') : undefined,
    ),
  },
  grandeurs: ['seats', 'capacity'],
})

const P6_R3 = clause({
  id: 'P6.R3',
  enters: 'P6',
  exits: 'P11',
  replaces: 'P2.R1',
  text:
    "Admission tout ou rien (remplace P2.R1). Si seats <= available, la réservation est 'confirmed' pour toutes ses " +
    "places ; sinon elle entre ENTIÈRE en queue de file ('waiting', avec position), jamais partiellement. Une demande qui " +
    'tient est confirmée même si des groupes plus anciens attendent.',
  contract: {
    operations: { reserve: { admission: "confirmed si seats <= available, sinon waiting entiere en queue de file" } },
    exemples: [
      { contexte: 'S6 : capacity 5, booked 3, file [g2 (3 places)]', requete: { op: 'reserve', args: { request_id: 'g3', member_id: 'm-fay', slot_id: 'S6', seats: 2 } }, reponse: { ok: true, booking_id: 'g3', status: 'confirmed', seats: 2 } },
    ],
  },
  implementation: {
    'reserve.admission': (ctx: PlatformContext): PlatformResponse => {
      const slot = slotDe(ctx)
      const seats = typeof ctx.d.seats === 'number' ? ctx.d.seats : 1
      const creer = ctx.regle<Creation>('reservation.creation')
      if (seats <= slot.capacity - ctx.occupees(slot)) {
        const b = creer(ctx, 'confirmed')
        ctx.confirmer(b)
        return ctx.vue('vue.reservation.', b)
      }
      const b = creer(ctx, 'waiting')
      slot.file.push(b.booking_id)
      return ctx.vue('vue.reservation.', b)
    },
  },
  grandeurs: ['seats', 'available', 'status', 'position'],
})

const P6_R4 = clause({
  id: 'P6.R4',
  enters: 'P6',
  exits: 'P11',
  replaces: 'P2.R2',
  text:
    "Promotion premier-qui-tient (remplace P2.R2). Après toute libération de places, on parcourt la file depuis la tête " +
    "et on promeut ('confirmed') la PREMIÈRE réservation dont seats <= available ; on recommence le parcours depuis la " +
    "tête tant qu'une réservation tient. Les réservations sautées gardent leur rang. Annuler une réservation 'waiting' la " +
    "retire de la file et ne libère aucune place. La réponse de cancel porte promoted : les booking_id promus dans l'ordre " +
    'de promotion ([] si aucun).',
  contract: {
    operations: { cancel: { reponse: { promoted: 'tableau de booking_id, ordre de promotion' } } },
    exemples: [
      { contexte: 'S6 capacity 5 : g1 (3) et g3 (2) confirmed ; file [g2 (3), g4 (1)]', requete: { op: 'cancel', args: { booking_id: 'g3' } }, reponse: { ok: true, booking_id: 'g3', status: 'cancelled', promoted: ['g4'] } },
    ],
  },
  implementation: {
    'annulation.retrait_file': ((_ctx, b, slot) => {
      if (slot !== undefined) slot.file = slot.file.filter((id) => id !== b.booking_id)
    }) satisfies RetraitFile,
    'liberation.promotion': (ctx: PlatformContext, slot: Slot): string[] => {
      const promus: string[] = []
      for (let tient = true; tient; ) {
        tient = false
        const dispo = slot.capacity - ctx.occupees(slot)
        for (let i = 0; i < slot.file.length; i += 1) {
          const b = ctx.locataire.bookings.get(slot.file[i] as string)
          if (b !== undefined && b.seats <= dispo) {
            slot.file.splice(i, 1)
            ctx.confirmer(b)
            promus.push(b.booking_id)
            tient = true
            break
          }
        }
      }
      return promus
    },
    'vue.annulation.promus': ((ctx, _b, champs) => {
      champs.promoted = Array.isArray(ctx.d.promoted) ? [...(ctx.d.promoted as string[])] : []
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['seats', 'available', 'promoted'],
})

/* ════════════════════════════════════════════════════════════════════ P7 */

const TAUX_REMISE_BP: Readonly<Record<string, number>> = { none: 0, silver: 1000, gold: 2500 }

const P7_R1 = clause({
  id: 'P7.R1',
  enters: 'P7',
  exits: 'P15',
  text:
    "Prix par place. set_price { slot_id, price_cents } (rôle admin seulement) fixe le prix PAR PLACE du créneau, en " +
    "centimes d'euro, entier >= 0 ; réponse { ok: true, slot_id, price_cents }. slot_id inconnu -> NOT_FOUND ; " +
    "price_cents qui n'est pas un entier >= 0 -> INVALID_ARGUMENT. Tout créneau a le prix 0 tant qu'aucun prix n'est fixé.",
  contract: {
    operations: {
      set_price: {
        roles_autorises: ['admin'],
        arguments: { slot_id: 'chaine', price_cents: 'entier >= 0 (centimes, par place)' },
        reponse: { ok: true, slot_id: 'chaine', price_cents: 'entier' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { prix_par_defaut_cents: 0 },
    exemples: [
      { requete: { op: 'set_price', actor: 'm-ana', args: { slot_id: 'S7', price_cents: 1999 } }, reponse: { ok: true, slot_id: 'S7', price_cents: 1999 } },
      { contexte: 'actor staff', requete: { op: 'set_price', actor: 'm-sam', args: { slot_id: 'S7', price_cents: 1 } }, reponse: { ok: false, error: 'FORBIDDEN' } },
    ],
  },
  implementation: {
    'autorisation.set_price': ['admin'],
    'tarif.prix': (_ctx: PlatformContext, slot: Slot | undefined): number => slot?.price_cents ?? 0,
    'set_price.effet': (ctx: PlatformContext): PlatformResponse => {
      const slot = ctx.locataire.slots.get(String(ctx.args.slot_id))
      if (slot === undefined) return fail('NOT_FOUND')
      const p = ctx.args.price_cents
      if (!estEntier(p) || p < 0) return fail('INVALID_ARGUMENT')
      slot.price_cents = p
      return succeed({ slot_id: slot.slot_id, price_cents: p })
    },
  },
  grandeurs: ['slot_id', 'price_cents'],
  questions_ouvertes: ['slot_id inconnu (NOT_FOUND) et prix invalide (INVALID_ARGUMENT, controle apres NOT_FOUND) : non fixes par la racine'],
})

const P7_R2 = clause({
  id: 'P7.R2',
  enters: 'P7',
  text:
    "Niveaux d'abonnement. set_tier { member_id, tier } (rôle admin seulement) : tier vaut 'none', 'silver' ou 'gold' ; " +
    "le niveau par défaut d'un membre est 'none' ; réponse { ok: true, member_id, tier }. Taux de remise, en points de " +
    "base (1 pb = 1/10000) : none 0, silver 1000 (10 %), gold 2500 (25 %). member_id non membre du locataire -> " +
    "NOT_FOUND ; tier hors de ces trois valeurs -> INVALID_ARGUMENT.",
  contract: {
    operations: {
      set_tier: {
        roles_autorises: ['admin'],
        arguments: { member_id: 'chaine', tier: "'none' | 'silver' | 'gold'" },
        reponse: { ok: true, member_id: 'chaine', tier: 'chaine' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { taux_remise_bp: { ...TAUX_REMISE_BP }, niveau_par_defaut: 'none', unite: 'points de base (1/10000)' },
    exemples: [{ requete: { op: 'set_tier', actor: 'm-ana', args: { member_id: 'm-cleo', tier: 'gold' } }, reponse: { ok: true, member_id: 'm-cleo', tier: 'gold' } }],
  },
  implementation: {
    'autorisation.set_tier': ['admin'],
    'tarif.taux_remise': (ctx: PlatformContext, member: string): number =>
      TAUX_REMISE_BP[ctx.locataire.tiers.get(member) ?? 'none'] ?? 0,
    'set_tier.effet': (ctx: PlatformContext): PlatformResponse => {
      const { member_id, tier } = ctx.args
      if (ctx.role(member_id) === undefined) return fail('NOT_FOUND')
      if (typeof tier !== 'string' || !(tier in TAUX_REMISE_BP)) return fail('INVALID_ARGUMENT')
      ctx.locataire.tiers.set(String(member_id), tier)
      return succeed({ member_id, tier })
    },
  },
  grandeurs: ['member_id', 'tier', 'discount_bp'],
  questions_ouvertes: ['member_id non membre (NOT_FOUND) et tier invalide (INVALID_ARGUMENT) : non fixes par la racine'],
})

const P7_R3 = clause({
  id: 'P7.R3',
  enters: 'P7',
  exits: 'P15',
  text:
    "Montant d'une réservation. Il est fixé à l'instant où la réservation devient 'confirmed' (à la réservation ou à la " +
    "promotion), avec le prix et le niveau de CET instant : brut = seats × price_cents ; remise = brut × taux / 10000 " +
    "arrondi au centime, demi vers le haut, soit floor((brut × taux + 5000) / 10000) ; amount_cents = brut - remise. La " +
    "remise porte sur le brut TOTAL, pas place par place ; l'arrondi porte sur la REMISE. Tous les montants sont des " +
    "centimes d'euro entiers. Un changement de prix ou de niveau ultérieur ne modifie pas un montant déjà fixé. Les " +
    "réservations confirmées avant P7 ont amount_cents 0. Une réservation 'waiting' n'a pas encore de montant : reserve " +
    "et get_booking portent amount_cents pour une réservation qui n'est pas 'waiting'.",
  contract: {
    operations: {
      reserve: { reponse: { amount_cents: "entier, si status != 'waiting'" } },
      get_booking: { reponse: { amount_cents: "entier, si status != 'waiting'" } },
    },
    valeurs: { arrondi: 'demi vers le haut, sur la remise', formule_remise: 'floor((brut*taux_bp + 5000) / 10000)' },
    exemples: [
      { calcul: 'gold, 1 place a 1999 : brut 1999, remise floor((1999*2500+5000)/10000) = 500, amount_cents 1499' },
      { calcul: 'silver, 3 places a 1999 : brut 5997, remise floor((5997*1000+5000)/10000) = 600, amount_cents 5397' },
      { calcul: 'gold, 3 places a 333 : brut 999, remise floor((999*2500+5000)/10000) = 250, amount_cents 749' },
    ],
  },
  implementation: {
    'reservation.montant': (ctx: PlatformContext, b: Booking): number => {
      const prix = ctx.regle<(ctx: PlatformContext, s: Slot | undefined) => number>('tarif.prix')(ctx, ctx.locataire.slots.get(b.slot_id))
      const taux = ctx.regle<(ctx: PlatformContext, m: string) => number>('tarif.taux_remise')(ctx, b.member_id)
      const brut = b.seats * prix
      const remise = Math.floor((brut * taux + 5000) / 10000)
      b.discount_bp = taux
      return brut - remise
    },
    'vue.reservation.montant': ((_ctx, b, champs) => {
      if (b.status !== 'waiting') champs.amount_cents = b.amount_cents ?? 0
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['amount_cents', 'price_cents', 'seats', 'discount_bp'],
})

const P7_R4 = clause({
  id: 'P7.R4',
  enters: 'P7',
  exits: 'P8',
  text: "Paiement. Le montant amount_cents est payé entièrement par carte au moment de la confirmation.",
  contract: {
    paiement: { source: 'carte', moment: 'confirmation (reservation ou promotion)' },
    operations: { reserve: { paiement: 'carte, amount_cents entier' } },
  },
  implementation: {
    'reservation.paiement': (ctx: PlatformContext, b: Booking): void => {
      const A = b.amount_cents ?? 0
      b.paid_credits_cents = 0
      b.paid_card_cents = A
      ctx.journaliser({ type: 'charge', member_id: b.member_id, booking_id: b.booking_id, amount_cents: A, credits_cents: 0, card_cents: A })
    },
  },
  grandeurs: ['amount_cents'],
})

const P7_R5 = clause({
  id: 'P7.R5',
  enters: 'P7',
  exits: 'P8',
  text:
    "Remboursement à l'annulation. Annuler une réservation 'confirmed' rembourse 100 % de son montant à la carte : " +
    "refunded_cents = amount_cents ; annuler une réservation 'waiting' rembourse 0. La réponse de cancel porte " +
    "refunded_cents (centimes entiers). Après l'annulation, amount_cents de la réservation vaut 0.",
  contract: {
    operations: { cancel: { reponse: { refunded_cents: 'entier (centimes)' } } },
    exemples: [{ contexte: 'p2 confirmed, amount_cents 5397', requete: { op: 'cancel', args: { booking_id: 'p2' } }, reponse: { ok: true, booking_id: 'p2', status: 'cancelled', refunded_cents: 5397, promoted: ['p3'] } }],
  },
  implementation: {
    'annulation.remboursement': ((ctx, b) => {
      const A = b.status === 'confirmed' ? (b.amount_cents ?? 0) : 0
      ctx.d.rembourse = A
      if (A > 0) ctx.journaliser({ type: 'refund', member_id: b.member_id, booking_id: b.booking_id, amount_cents: A, credits_cents: 0, card_cents: A })
      if (b.status === 'confirmed') {
        b.amount_cents = 0
        b.paid_credits_cents = 0
        b.paid_card_cents = 0
      }
    }) satisfies Remboursement,
    'vue.annulation.remboursement': ((ctx, _b, champs) => {
      champs.refunded_cents = typeof ctx.d.rembourse === 'number' ? ctx.d.rembourse : 0
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['refunded_cents', 'amount_cents'],
})

/* ════════════════════════════════════════════════════════════════════ P8 */

const P8_R1 = clause({
  id: 'P8.R1',
  enters: 'P8',
  exits: 'P15',
  text:
    "Portefeuille de crédits. Chaque membre a, dans chaque locataire, un portefeuille de solde balance_cents (centimes " +
    "d'euro, entier >= 0, initialement 0). top_up { member_id, amount_cents } (rôles admin, staff) crédite le " +
    "portefeuille : amount_cents doit être un entier > 0, sinon { ok: false, error: 'INVALID_ARGUMENT' } ; réponse " +
    "{ ok: true, member_id, balance_cents } avec le solde après crédit. get_wallet { member_id } : admin et staff pour " +
    "tout membre, member pour lui-même seulement (sinon FORBIDDEN) ; réponse { ok: true, member_id, balance_cents }. " +
    'member_id non membre du locataire -> NOT_FOUND.',
  contract: {
    operations: {
      top_up: {
        roles_autorises: ['admin', 'staff'],
        arguments: { member_id: 'chaine', amount_cents: 'entier > 0 (centimes)' },
        reponse: { ok: true, member_id: 'chaine', balance_cents: 'entier >= 0' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'NOT_FOUND'],
      },
      get_wallet: {
        roles_autorises: ['admin', 'staff', 'member:soi'],
        arguments: { member_id: 'chaine' },
        reponse: { ok: true, member_id: 'chaine', balance_cents: 'entier >= 0' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND'],
      },
    },
    erreurs: ['INVALID_ARGUMENT'],
    exemples: [
      { requete: { op: 'top_up', actor: 'm-sam', args: { member_id: 'm-cleo', amount_cents: 2000 } }, reponse: { ok: true, member_id: 'm-cleo', balance_cents: 2000 } },
      { requete: { op: 'top_up', actor: 'm-sam', args: { member_id: 'm-dan', amount_cents: 0 } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.top_up': ['admin', 'staff'],
    'autorisation.get_wallet': ['admin', 'staff', 'member'],
    'portefeuille.solde': soldePortefeuille,
    'portefeuille.mouvement': mouvementPortefeuille,
    'top_up.effet': (ctx: PlatformContext): PlatformResponse => {
      const { member_id, amount_cents } = ctx.args
      if (!estEntier(amount_cents) || amount_cents <= 0) return fail('INVALID_ARGUMENT')
      if (ctx.role(member_id) === undefined) return fail('NOT_FOUND')
      const balance_cents = ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, String(member_id), amount_cents)
      ctx.journaliser({ type: 'top_up', member_id: String(member_id), booking_id: null, amount_cents, credits_cents: amount_cents, card_cents: 0 })
      return succeed({ member_id, balance_cents })
    },
    'get_wallet.etape.soi': etape(5, soiSeulement((ctx) => String(ctx.args.member_id))),
    'get_wallet.effet': (ctx: PlatformContext): PlatformResponse => {
      const member_id = ctx.args.member_id
      if (ctx.role(member_id) === undefined) return fail('NOT_FOUND')
      return succeed({ member_id, balance_cents: ctx.regle<Solde>('portefeuille.solde')(ctx, String(member_id)) })
    },
  },
  grandeurs: ['member_id', 'amount_cents', 'balance_cents'],
  questions_ouvertes: ["member_id non membre pour top_up ou get_wallet : non fixe par la racine ; le modele repond NOT_FOUND (apres INVALID_ARGUMENT pour top_up)"],
})

const P8_R2 = clause({
  id: 'P8.R2',
  enters: 'P8',
  replaces: 'P7.R4',
  text:
    "Paiement crédits puis carte (remplace P7.R4). À la confirmation (réservation ou promotion), avec le solde de cet " +
    "instant : paid_credits_cents = min(balance_cents, amount_cents), débité du portefeuille du membre de la réservation ; " +
    "paid_card_cents = amount_cents - paid_credits_cents. Les réservations payées avant P8 ont paid_credits_cents 0 et " +
    "paid_card_cents = amount_cents. reserve et get_booking d'une réservation 'confirmed' portent amount_cents, " +
    'paid_credits_cents et paid_card_cents (centimes entiers).',
  contract: {
    operations: {
      reserve: { reponse: { amount_cents: 'entier', paid_credits_cents: 'entier', paid_card_cents: 'entier' } },
      get_booking: { reponse: { amount_cents: 'entier', paid_credits_cents: 'entier', paid_card_cents: 'entier' } },
    },
    exemples: [
      { contexte: 'solde 2000, gold, 3 places a 1000', requete: { op: 'reserve', args: { request_id: 'q1', member_id: 'm-cleo', slot_id: 'S10', seats: 3 } }, reponse: { ok: true, booking_id: 'q1', status: 'confirmed', seats: 3, amount_cents: 2250, paid_credits_cents: 2000, paid_card_cents: 250 } },
    ],
  },
  implementation: {
    'reservation.paiement': (ctx: PlatformContext, b: Booking): void => {
      const A = b.amount_cents ?? 0
      const credits = Math.min(ctx.regle<Solde>('portefeuille.solde')(ctx, b.member_id), A)
      if (credits > 0) ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, b.member_id, -credits)
      b.paid_credits_cents = credits
      b.paid_card_cents = A - credits
      ctx.journaliser({ type: 'charge', member_id: b.member_id, booking_id: b.booking_id, amount_cents: A, credits_cents: credits, card_cents: A - credits })
    },
    'vue.reservation.paiement': ((_ctx, b, champs) => {
      if (b.status !== 'confirmed') return
      const A = b.amount_cents ?? 0
      champs.paid_credits_cents = b.paid_credits_cents ?? 0
      champs.paid_card_cents = b.paid_card_cents ?? A
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['amount_cents', 'paid_credits_cents', 'paid_card_cents', 'balance_cents'],
})

const P8_R3 = clause({
  id: 'P8.R3',
  enters: 'P8',
  text:
    "Annulation partielle. cancel { booking_id, seats? } : soit n le nombre de places restantes de la réservation. seats " +
    "absent ou égal à n = annulation totale ; 1 <= seats < n = annulation partielle, permise seulement pour une " +
    "réservation 'confirmed' ; seats < 1, seats > n, seats non entier, ou annulation partielle d'une réservation " +
    "'waiting' -> { ok: false, error: 'INVALID_ARGUMENT' }, sans effet. Ce contrôle suit NOT_FOUND, FORBIDDEN et " +
    "ALREADY_CANCELLED. Une annulation partielle laisse la réservation 'confirmed' avec n - seats places, libère les places " +
    "annulées (promotion) et répond { ok: true, booking_id, status: 'confirmed', seats: n - seats, ... }.",
  contract: {
    operations: {
      cancel: {
        arguments: { booking_id: 'chaine', seats: 'entier, 1 <= seats <= n (optionnel)' },
        reponse_partielle: { ok: true, booking_id: 'chaine', status: "'confirmed'", seats: 'n - seats' },
        erreurs: ['INVALID_ARGUMENT'],
      },
    },
    exemples: [
      { contexte: 'q3 confirmed, 2 places', requete: { op: 'cancel', args: { booking_id: 'q3', seats: 3 } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'cancel.etape.places': etape(40, (ctx) => {
      const b = reservationDe(ctx)
      const n = b.seats
      const k = ctx.args.seats
      if (k === undefined || k === null) return undefined
      if (!estEntier(k) || k < 1 || k > n) return fail('INVALID_ARGUMENT')
      if (k === n) return undefined
      if (b.status !== 'confirmed') return fail('INVALID_ARGUMENT')
      ctx.regle<Remboursement>('annulation.remboursement')(ctx, b, k, n)
      b.seats = n - k
      for (const f of ctx.regles<Partielle>('annulation.partielle.')) f(ctx, b, k)
      ctx.d.partielle = true
      ctx.d.promoted = ctx.liberer(ctx.locataire.slots.get(b.slot_id))
      return ctx.vue('vue.annulation.', b)
    }),
    'vue.annulation.places': ((ctx, b, champs) => {
      if (ctx.d.partielle === true) champs.seats = b.seats
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['seats', 'status'],
  questions_ouvertes: ["ordre ALREADY_CANCELLED avant INVALID_ARGUMENT non fixe explicitement par la racine"],
})

const P8_R4 = clause({
  id: 'P8.R4',
  enters: 'P8',
  exits: 'P9',
  replaces: 'P7.R5',
  text:
    "Remboursement au prorata vers chaque source (remplace P7.R5). Soit A = amount_cents restant, C = " +
    "paid_credits_cents restant et D = paid_card_cents restant (A = C + D), en centimes entiers. Annulation totale : " +
    "rembourse C en crédits (re-crédités au portefeuille du membre) et D à la carte, puis A, C et D valent 0. Annulation " +
    "partielle de k places sur n : R = floor(A × k / n) ; part crédits r_c = floor(R × C / A) (0 si A = 0) ; part carte " +
    "r_d = R - r_c ; la réservation garde n - k places, A - R, C - r_c et D - r_d et reste 'confirmed' ; r_c est " +
    "re-crédité au portefeuille ; les places libérées déclenchent la promotion. Une réservation 'waiting' annulée " +
    "rembourse 0. La réponse de cancel porte refunded_cents = R (ou C + D pour une annulation totale), refund = " +
    "{ credits_cents, card_cents } et promoted.",
  contract: {
    operations: {
      cancel: {
        reponse: { refunded_cents: 'entier', refund: { credits_cents: 'entier', card_cents: 'entier' }, promoted: 'tableau' },
      },
    },
    valeurs: { arrondi_rembourse: 'floor', arrondi_part_credits: 'floor, la carte recoit le reste' },
    exemples: [
      {
        contexte: 'q1 : 3 places, A 2250, C 2000, D 250',
        requete: { op: 'cancel', args: { booking_id: 'q1', seats: 1 } },
        reponse: { ok: true, booking_id: 'q1', status: 'confirmed', seats: 2, refunded_cents: 750, refund: { credits_cents: 666, card_cents: 84 }, promoted: [] },
      },
    ],
  },
  implementation: {
    'annulation.remboursement': ((ctx, b, k, n) => {
      let R = 0
      let rc = 0
      if (b.status === 'confirmed') {
        const A = b.amount_cents ?? 0
        const C = b.paid_credits_cents ?? 0
        const D = b.paid_card_cents ?? A - C
        if (k === n) {
          rc = C
          R = C + D
          b.amount_cents = 0
          b.paid_credits_cents = 0
          b.paid_card_cents = 0
        } else {
          R = Math.floor((A * k) / n)
          rc = A === 0 ? 0 : Math.floor((R * C) / A)
          b.amount_cents = A - R
          b.paid_credits_cents = C - rc
          b.paid_card_cents = D - (R - rc)
        }
        if (rc > 0) ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, b.member_id, rc)
        if (R > 0) ctx.journaliser({ type: 'refund', member_id: b.member_id, booking_id: b.booking_id, amount_cents: R, credits_cents: rc, card_cents: R - rc })
      }
      ctx.d.rembourse = R
      ctx.d.refund = { credits_cents: rc, card_cents: R - rc }
    }) satisfies Remboursement,
    'vue.annulation.remboursement': ((ctx, _b, champs) => {
      champs.refunded_cents = typeof ctx.d.rembourse === 'number' ? ctx.d.rembourse : 0
      champs.refund = ctx.d.refund ?? { credits_cents: 0, card_cents: 0 }
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['refunded_cents', 'refund.credits_cents', 'refund.card_cents', 'amount_cents', 'paid_credits_cents', 'paid_card_cents', 'balance_cents'],
})

/* ════════════════════════════════════════════════════════════════════ P9 */

const HEURE_MS = 3_600_000
const MINUTE_MS = 60_000
const FUSEAUX = ['UTC', 'Europe/Paris'] as const
const CLE_FUSEAU = 'site.fuseau'

/** Instant ISO 8601 UTC à la seconde, sans millisecondes. */
const isoSeconde = (t: number): string => `${new Date(t).toISOString().slice(0, 19)}Z`

/** Instant UTC (ms) de 01:00:00Z le dernier dimanche du mois `mois0` (0 = janvier) de `annee`. */
function dernierDimancheUneHeure(annee: number, mois0: number): number {
  const fin = Date.UTC(annee, mois0 + 1, 0)
  return fin - new Date(fin).getUTCDay() * JOUR_MS + HEURE_MS
}

/** Décalage (minutes) d'un fuseau admis à l'instant t. */
function decalageDe(fuseau: string, t: number): number {
  if (fuseau !== 'Europe/Paris') return 0
  const an = new Date(t).getUTCFullYear()
  return t >= dernierDimancheUneHeure(an, 2) && t < dernierDimancheUneHeure(an, 9) ? 120 : 60
}

type Fuseau = (ctx: PlatformContext) => string
type Decalage = (ctx: PlatformContext, t: number) => number
type VersUtc = (ctx: PlatformContext, mural: number) => number

/** Heure murale (ms « naïves », lues comme UTC) de l'instant t, dans le fuseau du site. */
const murale = (ctx: PlatformContext, t: number): number => t + ctx.regle<Decalage>('fuseau.decalage')(ctx, t) * MINUTE_MS
const versUtc = (ctx: PlatformContext, m: number): number => ctx.regle<VersUtc>('fuseau.vers_utc')(ctx, m)

const P9_R1 = clause({
  id: 'P9.R1',
  enters: 'P9',
  text:
    "Fuseau du site. set_timezone { timezone } (rôle admin seulement) fixe le fuseau du site du locataire de l'opération. " +
    "timezone vaut exactement 'UTC' ou 'Europe/Paris' ; toute autre valeur -> { ok: false, error: 'INVALID_ARGUMENT' }, " +
    "sans effet. Tout locataire (y compris 'default') a le fuseau 'UTC' tant qu'aucun n'est fixé. Réponse " +
    "{ ok: true, tenant_id, timezone }. Les instants stockés (starts_at, at) restent en UTC : changer de fuseau ne " +
    'modifie aucun instant ni aucun montant déjà fixé.',
  contract: {
    operations: {
      set_timezone: {
        roles_autorises: ['admin'],
        arguments: { timezone: "'UTC' | 'Europe/Paris'" },
        reponse: { ok: true, tenant_id: 'chaine', timezone: 'chaine' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { fuseaux_admis: [...FUSEAUX], defaut: 'UTC' },
    exemples: [
      { requete: { op: 'set_timezone', tenant: 't-alpha', actor: 'm-ana', args: { timezone: 'Europe/Paris' } }, reponse: { ok: true, tenant_id: 't-alpha', timezone: 'Europe/Paris' } },
      { requete: { op: 'set_timezone', tenant: 't-alpha', actor: 'm-ana', args: { timezone: 'Mars/Olympus' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { contexte: 'actor staff', requete: { op: 'set_timezone', tenant: 't-alpha', actor: 'm-sam', args: { timezone: 'UTC' } }, reponse: { ok: false, error: 'FORBIDDEN' } },
    ],
  },
  implementation: {
    'autorisation.set_timezone': ['admin'],
    'fuseau.du_site': ((ctx) => ctx.donnee<{ fuseau: string }>(CLE_FUSEAU, () => ({ fuseau: 'UTC' })).fuseau) satisfies Fuseau,
    'set_timezone.effet': (ctx: PlatformContext): PlatformResponse => {
      const timezone = ctx.args.timezone
      if (typeof timezone !== 'string' || !(FUSEAUX as readonly string[]).includes(timezone)) return fail('INVALID_ARGUMENT')
      ctx.donnee<{ fuseau: string }>(CLE_FUSEAU, () => ({ fuseau: 'UTC' })).fuseau = timezone
      return succeed({ tenant_id: ctx.locataire.tenant_id, timezone })
    },
  },
  grandeurs: ['timezone', 'tenant_id'],
  questions_ouvertes: [
    "Q01 (provisoire) : create_recurring (P5.R1) garde start_time en heure UTC apres set_timezone ; une serie qui traverse un changement d'heure garde la meme heure UTC et change d'heure locale",
    "Q05 (provisoire) : set_timezone reste permis apres l'emission de factures ; une facture emise est figee telle quelle (immuable) et les mois suivants se calculent avec le fuseau en vigueur a leur emission",
  ],
})

const P9_R2 = clause({
  id: 'P9.R2',
  enters: 'P9',
  text:
    "Heure locale. 'UTC' : décalage +00:00 toute l'année. 'Europe/Paris' : UTC+1 (+01:00), sauf de l'instant 01:00:00Z du " +
    "dernier dimanche de mars (inclus) à l'instant 01:00:00Z du dernier dimanche d'octobre (exclu), où c'est UTC+2 " +
    "(+02:00) ; en 2031 : 2031-03-30T01:00:00Z et 2031-10-26T01:00:00Z. Conversion d'une heure locale murale en instant " +
    "UTC : une heure locale INEXISTANTE (saut de printemps, de 02:00:00 à 02:59:59 locale le jour du passage) est " +
    "interprétée avec le décalage d'AVANT le saut (+01:00), ce qui revient à l'avancer d'une heure ; une heure locale " +
    "AMBIGUË (automne, de 02:00:00 à 02:59:59) désigne sa PREMIÈRE occurrence (+02:00). get_slot porte en plus " +
    "local_starts_at : l'heure locale du début au format 'AAAA-MM-JJTHH:MM:SS+HH:MM' (décalage en vigueur à cet instant).",
  contract: {
    operations: { get_slot: { reponse: { local_starts_at: "'AAAA-MM-JJTHH:MM:SS+HH:MM'" } } },
    valeurs: {
      UTC: '+00:00',
      'Europe/Paris': { hiver: '+01:00', ete: '+02:00', debut_ete_2031: '2031-03-30T01:00:00Z', fin_ete_2031: '2031-10-26T01:00:00Z' },
      heure_inexistante: "decalage d'avant le saut (+01:00)",
      heure_ambigue: 'premiere occurrence (+02:00)',
      format_local: 'AAAA-MM-JJTHH:MM:SS+HH:MM',
    },
    exemples: [
      { contexte: "t-alpha en 'Europe/Paris'", requete: { op: 'get_slot', args: { slot_id: 'S12' } }, reponse: { ok: true, slot_id: 'S12', starts_at: '2031-03-31T07:00:00Z', local_starts_at: '2031-03-31T09:00:00+02:00' } },
      { calcul: "02:30 locale le 2031-03-30 n'existe pas : lue a +01:00, soit 2031-03-30T01:30:00Z" },
    ],
  },
  implementation: {
    'fuseau.decalage': ((ctx, t) => decalageDe(ctx.regle<Fuseau>('fuseau.du_site')(ctx), t)) satisfies Decalage,
    'fuseau.vers_utc': ((ctx, m) => {
      const fuseau = ctx.regle<Fuseau>('fuseau.du_site')(ctx)
      if (fuseau !== 'Europe/Paris') return m
      const ete = m - 2 * HEURE_MS
      if (decalageDe(fuseau, ete) === 120) return ete // été, ou première occurrence d'une heure ambiguë
      return m - HEURE_MS // hiver, ou heure inexistante lue avec le décalage d'avant le saut
    }) satisfies VersUtc,
    'vue.creneau.heure_locale': ((ctx, s, champs) => {
      const t = Date.parse(s.starts_at)
      const d = ctx.regle<Decalage>('fuseau.decalage')(ctx, t)
      const hh = String(Math.floor(Math.abs(d) / 60)).padStart(2, '0')
      const mm = String(Math.abs(d) % 60).padStart(2, '0')
      champs.local_starts_at = `${new Date(t + d * MINUTE_MS).toISOString().slice(0, 19)}${d < 0 ? '-' : '+'}${hh}:${mm}`
    }) satisfies Vue<Slot>,
  },
  grandeurs: ['local_starts_at', 'starts_at', 'timezone'],
  questions_ouvertes: [
    "Q02 (provisoire) : l'heure ambigue d'automne est lue comme sa premiere occurrence (+02:00), comme la racine le fixe ; regle executee mais non exercee par un fait",
  ],
})

type TauxAnnulation = (ctx: PlatformContext, b: Booking) => number

const P9_R3 = clause({
  id: 'P9.R3',
  enters: 'P9',
  text:
    "Paliers d'annulation, en heure MURALE du site. Soit Ls l'heure locale murale du début du créneau (P9.R2). D48 = " +
    "l'instant UTC de l'heure locale murale Ls moins 48 heures d'horloge (même heure, deux jours de calendrier plus tôt) ; " +
    "D24 = l'instant UTC de Ls moins 24 heures d'horloge (même heure, la veille) ; chacune convertie par P9.R2. Ce ne sont " +
    "PAS des durées écoulées : autour d'un changement d'heure, D48 peut être à 47 ou 49 heures réelles du début. Pour une " +
    "annulation à l'instant at (champ at de l'opération) : at < D48 -> taux 10000 pb (100 %) ; D48 <= at < D24 -> 5000 pb " +
    "(50 %) ; at >= D24 -> 0 pb (y compris après le début). D48 et D24 appartiennent au palier SUIVANT. Le palier vaut " +
    "pour toute annulation, totale ou partielle, quel que soit l'acteur (admin, staff ou member). La réponse de cancel " +
    "porte refund_rate_bp, le taux du palier en points de base, même pour une réservation waiting (qui ne rembourse rien).",
  contract: {
    operations: { cancel: { reponse: { refund_rate_bp: 'entier : 10000 | 5000 | 0' } } },
    valeurs: {
      paliers_bp: [{ avant: 'D48', taux: 10000 }, { de: 'D48', avant: 'D24', taux: 5000 }, { de: 'D24', taux: 0 }],
      bornes: 'D48 et D24 appartiennent au palier suivant (at < D strict)',
      unite: 'points de base (10000 = 100 %)',
    },
    exemples: [
      { contexte: "S12 debut 09:00 locale le 2031-03-31 (07:00Z) ; D48 = 09:00 locale le 29/03 (+01:00) = 08:00Z", requete: { op: 'cancel', at: '2031-03-29T07:59:00Z', args: { booking_id: 't1' } }, reponse: { ok: true, refund_rate_bp: 10000 } },
      { requete: { op: 'cancel', at: '2031-03-29T08:00:00Z', args: { booking_id: 't2' } }, reponse: { ok: true, refund_rate_bp: 5000 } },
    ],
  },
  implementation: {
    'annulation.taux': ((ctx, b) => {
      const slot = ctx.locataire.slots.get(b.slot_id)
      if (slot === undefined) return 10000
      const Ls = murale(ctx, Date.parse(slot.starts_at))
      const D48 = versUtc(ctx, Ls - 2 * JOUR_MS)
      const D24 = versUtc(ctx, Ls - JOUR_MS)
      return ctx.instant < D48 ? 10000 : ctx.instant < D24 ? 5000 : 0
    }) satisfies TauxAnnulation,
  },
  grandeurs: ['refund_rate_bp', 'starts_at', 'at'],
  questions_ouvertes: [
    "Q03 (provisoire, exercee) : le palier s'applique quel que soit l'acteur ; une annulation par admin ou staff n'est pas remboursee a 100 % d'office",
    "Q06 (provisoire) : refund_rate_bp d'une annulation de reservation waiting vaut le taux du palier (elle ne rembourse rien)",
    "creneau supprime par add_exception : ses reservations sont deja cancelled ; le taux rendu par defaut serait 10000 (cas inatteignable par cancel)",
  ],
})

type Avoir = (ctx: PlatformContext, b: Booking, e: JournalEntry, reason: string) => string | null

/** Rembourse r_c au portefeuille et inscrit le remboursement ; rend l'avoir éventuel (P14.R4). */
function inscrireRemboursement(ctx: PlatformContext, b: Booking, R: number, rc: number, reason: string, type = 'refund'): string | null {
  if (rc > 0) ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, b.member_id, rc)
  if (R <= 0) return null
  const e = ctx.journaliser({ type, member_id: b.member_id, booking_id: b.booking_id, amount_cents: R, credits_cents: rc, card_cents: R - rc })
  return ctx.regleOpt<Avoir>('comptabilite.avoir')?.(ctx, b, e, reason) ?? null
}

const P9_R4 = clause({
  id: 'P9.R4',
  enters: 'P9',
  replaces: 'P8.R4',
  text:
    "Remboursement selon le palier (remplace P8.R4). Soit A = amount_cents restant, C = paid_credits_cents restant, D = " +
    "paid_card_cents restant (A = C + D), en centimes d'euro entiers, et t le taux du palier (P9.R3) en points de base. " +
    "Annulation totale : R = floor(A × t / 10000). Annulation partielle de k places sur n : R = floor(A × k × t / " +
    "(n × 10000)) (un seul arrondi). Dans les deux cas : r_c = floor(R × C / A) (0 si A = 0), r_d = R - r_c ; r_c est " +
    "re-crédité au portefeuille, r_d rendu à la carte ; la réservation garde A - R, C - r_c, D - r_d. Annulation totale : " +
    "statut 'cancelled', amount_cents vaut A - R (frais retenus, 0 si t = 10000) et get_booking d'une réservation " +
    "cancelled porte encore amount_cents, paid_credits_cents et paid_card_cents ; annulation partielle : seats = n - k, " +
    "statut 'confirmed', les places libérées déclenchent la promotion. Une réservation waiting annulée rembourse 0. " +
    "Réponse de cancel : refunded_cents = R, refund = { credits_cents: r_c, card_cents: r_d }, refund_rate_bp, promoted, " +
    "et pour une partielle seats (et seat_numbers à partir de P11). Avant P9 le taux vaut toujours 10000, ce qui redonne " +
    'exactement P8.R4.',
  contract: {
    operations: {
      cancel: {
        reponse: { refunded_cents: 'entier = R', refund: { credits_cents: 'entier = r_c', card_cents: 'entier = r_d' }, refund_rate_bp: 'entier', promoted: 'tableau' },
      },
      get_booking: { reponse_cancelled: { amount_cents: 'A - R', paid_credits_cents: 'C - r_c', paid_card_cents: 'D - r_d' } },
    },
    valeurs: { arrondi_rembourse: 'floor, un seul arrondi', arrondi_part_credits: 'floor, la carte recoit le reste' },
    exemples: [
      {
        contexte: 't4 : 3 places, A 2250, C 500, D 1750 ; palier 5000',
        requete: { op: 'cancel', args: { booking_id: 't4', seats: 1 } },
        reponse: { ok: true, booking_id: 't4', status: 'confirmed', seats: 2, refund_rate_bp: 5000, refunded_cents: 375, refund: { credits_cents: 83, card_cents: 292 } },
      },
      { contexte: 't2 annulee a 50 % (A 2000)', requete: { op: 'get_booking', args: { booking_id: 't2' } }, reponse: { ok: true, status: 'cancelled', amount_cents: 1000, paid_credits_cents: 0, paid_card_cents: 1000 } },
    ],
  },
  implementation: {
    'annulation.remboursement': ((ctx, b, k, n) => {
      const t = ctx.regle<TauxAnnulation>('annulation.taux')(ctx, b)
      let R = 0
      let rc = 0
      ctx.d.taux = t
      if (b.status === 'confirmed') {
        const A = b.amount_cents ?? 0
        const C = b.paid_credits_cents ?? 0
        const D = b.paid_card_cents ?? A - C
        R = k === n ? Math.floor((A * t) / 10000) : Math.floor((A * k * t) / (n * 10000))
        rc = A === 0 ? 0 : Math.floor((R * C) / A)
        b.amount_cents = A - R
        b.paid_credits_cents = C - rc
        b.paid_card_cents = D - (R - rc)
        ctx.d.credit_note_id = inscrireRemboursement(ctx, b, R, rc, 'cancellation')
      }
      ctx.d.rembourse = R
      ctx.d.refund = { credits_cents: rc, card_cents: R - rc }
    }) satisfies Remboursement,
    'vue.annulation.remboursement': ((ctx, _b, champs) => {
      champs.refunded_cents = typeof ctx.d.rembourse === 'number' ? ctx.d.rembourse : 0
      champs.refund = ctx.d.refund ?? { credits_cents: 0, card_cents: 0 }
      champs.refund_rate_bp = ctx.d.taux
    }) satisfies Vue<Booking>,
    'vue.reservation.frais_retenus': ((_ctx, b, champs) => {
      if (b.status !== 'cancelled') return
      champs.paid_credits_cents = b.paid_credits_cents ?? 0
      champs.paid_card_cents = b.paid_card_cents ?? 0
    }) satisfies Vue<Booking>,
  },
  grandeurs: [
    'refunded_cents', 'refund.credits_cents', 'refund.card_cents', 'refund_rate_bp',
    'amount_cents', 'paid_credits_cents', 'paid_card_cents', 'balance_cents',
  ],
  questions_ouvertes: [
    "Q04 (provisoire) : add_exception (P5.R2) sur une reservation payee n'applique ni remboursement, ni palier, ni avoir (choix de T70 conserve)",
  ],
})

/* ═══════════════════════════════════════════════════════════════════ P10 */

const CLE_ABSENCES = 'absences'
const CLE_SUSPENSIONS = 'absences.suspensions'
const FENETRE_ABSENCES_MS = 30 * 86_400_000
const SUSPENSION_MS = 7 * 86_400_000
const SEUIL_ABSENCES = 3

interface Absence {
  readonly member_id: string
  readonly t: number
}
type Enregistrement = (ctx: PlatformContext, b: Booking, T: number) => { absences_30d: number; suspended_until: string | null }

const P10_R1 = clause({
  id: 'P10.R1',
  enters: 'P10',
  text:
    "Absences. mark_no_show { booking_id } (rôles admin, staff) enregistre une absence. Contrôles après ceux d'acteur " +
    "(P4.R2), dans cet ordre : booking_id inconnu -> { ok: false, error: 'NOT_FOUND' } ; statut différent de 'confirmed' -> " +
    "{ ok: false, error: 'INVALID_ARGUMENT' } ; at < starts_at du créneau (créneau pas encore commencé) -> " +
    "{ ok: false, error: 'INVALID_ARGUMENT' } ; absence déjà enregistrée pour cette réservation -> " +
    "{ ok: false, error: 'ALREADY_EXISTS' }. Effet : la réservation porte no_show = true ; son statut reste 'confirmed' ; " +
    "aucun remboursement. Réponse { ok: true, booking_id, member_id, absences_30d, suspended_until } (P10.R2). À partir " +
    'de P10, les vues de réservation (reserve, get_booking) portent no_show (booléen, false par défaut).',
  contract: {
    operations: {
      mark_no_show: {
        roles_autorises: ['admin', 'staff'],
        arguments: { booking_id: 'chaine' },
        reponse: { ok: true, booking_id: 'chaine', member_id: 'chaine', absences_30d: 'entier', suspended_until: 'instant UTC | null' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'],
        ordre_des_controles: ['NOT_FOUND', "statut != confirmed -> INVALID_ARGUMENT", 'at < starts_at -> INVALID_ARGUMENT', 'ALREADY_EXISTS'],
      },
      reserve: { reponse: { no_show: 'booleen' } },
      get_booking: { reponse: { no_show: 'booleen' } },
    },
    exemples: [
      { requete: { op: 'mark_no_show', actor: 'm-sam', args: { booking_id: 'c3' } }, reponse: { ok: true, booking_id: 'c3', member_id: 'm-dan', absences_30d: 1, suspended_until: null } },
      { contexte: 'absence deja enregistree', requete: { op: 'mark_no_show', actor: 'm-sam', args: { booking_id: 'g8' } }, reponse: { ok: false, error: 'ALREADY_EXISTS' } },
      { contexte: 'creneau pas encore commence', requete: { op: 'mark_no_show', actor: 'm-sam', args: { booking_id: 'u1' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.mark_no_show': ['admin', 'staff'],
    'mark_no_show.effet': (ctx: PlatformContext): PlatformResponse => {
      const b = ctx.locataire.bookings.get(String(ctx.args.booking_id))
      if (b === undefined) return fail('NOT_FOUND')
      if (b.status !== 'confirmed') return fail('INVALID_ARGUMENT')
      const slot = ctx.locataire.slots.get(b.slot_id)
      if (slot === undefined || ctx.instant < Date.parse(slot.starts_at)) return fail('INVALID_ARGUMENT')
      if (b.no_show === true) return fail('ALREADY_EXISTS')
      b.no_show = true
      const r = ctx.regle<Enregistrement>('absences.enregistrer')(ctx, b, Date.parse(slot.starts_at))
      return succeed({ booking_id: b.booking_id, member_id: b.member_id, ...r })
    },
    'vue.reservation.absence': ((_ctx, b, champs) => {
      champs.no_show = b.no_show === true
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['booking_id', 'member_id', 'no_show', 'absences_30d', 'suspended_until', 'starts_at'],
  questions_ouvertes: [
    "Q08 (provisoire) : une absence enregistree ne s'annule pas et une suspension ne se leve pas",
    "Q09 (provisoire) : une reservation absente reste confirmed (no_show = true), reste facturee, compte dans booked, et peut encore etre annulee (au palier en vigueur, 0 % apres D24)",
  ],
})

const P10_R2 = clause({
  id: 'P10.R2',
  enters: 'P10',
  text:
    "Fenêtre de 30 jours. L'instant d'une absence est le starts_at de son créneau (pas l'instant de l'enregistrement). À " +
    "l'enregistrement d'une absence d'instant T, absences_30d = nombre d'absences enregistrées du même membre dans le même " +
    "locataire (celle-ci comprise) dont l'instant est dans ]T - 30 jours, T] : borne basse EXCLUE, borne haute incluse ; " +
    "30 jours = 30 × 86400 = 2 592 000 secondes exactement (durée absolue, indépendante du fuseau et des changements " +
    "d'heure). Si absences_30d >= 3, le membre est suspendu : suspended_until = max(ancienne valeur, at + 7 × 86400 s " +
    "= at + 604 800 s), où at est l'instant de l'opération mark_no_show. suspended_until est un instant ISO 8601 UTC " +
    "'AAAA-MM-JJTHH:MM:SSZ' ; il vaut null tant que le membre n'a jamais été suspendu ; une valeur échue reste affichée.",
  contract: {
    operations: { mark_no_show: { reponse: { absences_30d: 'entier >= 1', suspended_until: "'AAAA-MM-JJTHH:MM:SSZ' | null" } } },
    valeurs: { seuil: SEUIL_ABSENCES, fenetre_s: 2_592_000, fenetre: ']T - 30 j, T]', suspension_s: 604_800, origine_suspension: "at de l'operation mark_no_show" },
    exemples: [
      { contexte: 'T = 2031-04-23T18:00Z ; une absence a 2031-03-24T18:00Z (borne basse, exclue)', reponse: { absences_30d: 2, suspended_until: null } },
      { contexte: '3e absence, at 2031-04-27T18:00:00Z', reponse: { absences_30d: 3, suspended_until: '2031-05-04T18:00:00Z' } },
    ],
  },
  implementation: {
    'absences.enregistrer': ((ctx, b, T) => {
      const absences = ctx.donnee<Absence[]>(CLE_ABSENCES, () => [])
      absences.push({ member_id: b.member_id, t: T })
      const n = absences.filter((a) => a.member_id === b.member_id && a.t > T - FENETRE_ABSENCES_MS && a.t <= T).length
      const suspensions = ctx.donnee<Map<string, number>>(CLE_SUSPENSIONS, () => new Map())
      if (n >= SEUIL_ABSENCES) {
        suspensions.set(b.member_id, Math.max(suspensions.get(b.member_id) ?? -Infinity, ctx.instant + SUSPENSION_MS))
      }
      const s = suspensions.get(b.member_id)
      return { absences_30d: n, suspended_until: s === undefined ? null : isoSeconde(s) }
    }) satisfies Enregistrement,
  },
  grandeurs: ['absences_30d', 'suspended_until', 'starts_at', 'at'],
  questions_ouvertes: [
    "Q07 (provisoire) : une absence enregistree hors ordre n'est comptee que relativement a elle-meme ; les absences deja enregistrees ne sont pas reevaluees et aucune suspension retroactive n'est declenchee",
  ],
})

const P10_R3 = clause({
  id: 'P10.R3',
  enters: 'P10',
  text:
    "Suspension. reserve : nouveau contrôle placé après « member_id non membre -> NOT_FOUND » et avant « at >= starts_at " +
    "-> SLOT_CLOSED » : si at < suspended_until du member_id -> { ok: false, error: 'SUSPENDED' } (à at = suspended_until, " +
    "la réservation est de nouveau permise). SUSPENDED est mémorisé pour l'idempotence comme les autres refus de reserve " +
    "(seul FORBIDDEN ne l'est pas) : rejouer le même request_id après la fin de la suspension rend encore SUSPENDED. La " +
    "suspension n'empêche ni l'annulation, ni la promotion d'une réservation déjà en file, ni une lecture.",
  contract: {
    operations: {
      reserve: {
        erreurs: ['SUSPENDED'],
        ordre_des_controles: ['NOT_FOUND (slot)', 'NOT_FOUND (member_id)', 'SUSPENDED', 'SLOT_CLOSED'],
        suspension: 'at < suspended_until -> SUSPENDED ; at = suspended_until -> permis',
      },
    },
    idempotence: { memorise: ['SUSPENDED'] },
    exemples: [
      { contexte: "m-fay suspendue jusqu'a 2031-05-04T18:00:00Z", requete: { op: 'reserve', at: '2031-04-27T18:03:00Z', args: { request_id: 'f-s1', member_id: 'm-fay', slot_id: 'S17' } }, reponse: { ok: false, error: 'SUSPENDED' } },
      { requete: { op: 'reserve', at: '2031-05-04T18:00:00Z', args: { request_id: 'f-s2', member_id: 'm-fay', slot_id: 'S17' } }, reponse: { ok: true, booking_id: 'f-s2', status: 'confirmed' } },
    ],
  },
  implementation: {
    'reserve.etape.suspendu': etape(27, (ctx) => {
      const s = ctx.donnee<Map<string, number>>(CLE_SUSPENSIONS, () => new Map()).get(String(ctx.args.member_id))
      return s !== undefined && ctx.instant < s ? fail('SUSPENDED') : undefined
    }),
  },
  grandeurs: ['suspended_until', 'at', 'member_id'],
})

/* ═══════════════════════════════════════════════════════════════════ P11 */

type Affectation = (reservations: ReadonlyArray<{ booking_id: string; seats: number }>) => Array<{ booking_id: string; seats: number }>
type PlacesLibres = (ctx: PlatformContext, slot: Slot) => number[]
/** Places attribuables à `seats` places : [] (non numéroté, tient), un bloc (numéroté, tient), ou null (ne tient pas). */
type PlaceQuiTient = (ctx: PlatformContext, slot: Slot, seats: number) => number[] | null
type Plafond = (ctx: PlatformContext, slot: Slot) => number
type ConditionPromotion = (ctx: PlatformContext, slot: Slot, b: Booking) => boolean

const P11_R1 = clause({
  id: 'P11.R1',
  enters: 'P11',
  text:
    "MIGRATION vers des places numérotées. number_seats { slot_id } (rôle admin seulement) migre un créneau vers des places " +
    "numérotées 1..capacity. Contrôles après ceux d'acteur, dans cet ordre : slot_id inconnu -> { ok: false, error: " +
    "'NOT_FOUND' } ; créneau déjà numéroté -> { ok: false, error: 'ALREADY_EXISTS' } ; at >= starts_at -> { ok: false, " +
    "error: 'SLOT_CLOSED' } ; créneau surréservé (booked > capacity) -> { ok: false, error: 'INVALID_ARGUMENT' }. Réponse " +
    "{ ok: true, slot_id, assignments } : assignments liste { booking_id, seat_numbers } dans l'ordre d'affectation " +
    "(P11.R2). La migration ne libère aucune place et ne promeut personne. Un créneau non migré reste non numéroté (ses " +
    "réservations n'ont pas de seat_numbers) ; un créneau n'est numéroté que par number_seats.",
  contract: {
    operations: {
      number_seats: {
        roles_autorises: ['admin'],
        arguments: { slot_id: 'chaine' },
        reponse: { ok: true, slot_id: 'chaine', assignments: 'tableau de { booking_id, seat_numbers }' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'ALREADY_EXISTS', 'SLOT_CLOSED', 'INVALID_ARGUMENT'],
        ordre_des_controles: ['NOT_FOUND', 'ALREADY_EXISTS', 'SLOT_CLOSED', 'INVALID_ARGUMENT (surreserve)'],
      },
    },
    exemples: [
      {
        contexte: 'S17 : 6 places ; confirmed f-s2 (1), n1 (2), n3 (2), n4 (1)',
        requete: { op: 'number_seats', actor: 'm-ana', args: { slot_id: 'S17' } },
        reponse: { ok: true, slot_id: 'S17', assignments: [{ booking_id: 'n1', seat_numbers: [1, 2] }, { booking_id: 'n3', seat_numbers: [3, 4] }, { booking_id: 'f-s2', seat_numbers: [5] }, { booking_id: 'n4', seat_numbers: [6] }] },
      },
      { contexte: 'deja numerote', requete: { op: 'number_seats', actor: 'm-ana', args: { slot_id: 'S17' } }, reponse: { ok: false, error: 'ALREADY_EXISTS' } },
    ],
  },
  implementation: {
    'autorisation.number_seats': ['admin'],
    'number_seats.effet': (ctx: PlatformContext): PlatformResponse => {
      const slot = ctx.locataire.slots.get(String(ctx.args.slot_id))
      if (slot === undefined) return fail('NOT_FOUND')
      if (slot.numbered === true) return fail('ALREADY_EXISTS')
      if (ctx.instant >= Date.parse(slot.starts_at)) return fail('SLOT_CLOSED')
      if (ctx.occupees(slot) > slot.capacity) return fail('INVALID_ARGUMENT')
      const confirmees = [...ctx.locataire.bookings.values()].filter((b) => b.slot_id === slot.slot_id && b.status === 'confirmed')
      const ordre = ctx.regle<Affectation>('numerotation.affectation')(confirmees.map((b) => ({ booking_id: b.booking_id, seats: b.seats })))
      let suivante = 1
      const assignments: Array<{ booking_id: string; seat_numbers: number[] }> = []
      for (const { booking_id, seats } of ordre) {
        const seat_numbers = Array.from({ length: seats }, (_, i) => suivante + i)
        suivante += seats
        ;(ctx.locataire.bookings.get(booking_id) as Booking).seat_numbers = seat_numbers
        assignments.push({ booking_id, seat_numbers: [...seat_numbers] })
      }
      slot.numbered = true
      return succeed({ slot_id: slot.slot_id, assignments })
    },
  },
  grandeurs: ['slot_id', 'assignments', 'seat_numbers', 'capacity', 'starts_at', 'at'],
  questions_ouvertes: [
    'Q10 (provisoire) : number_seats ne declenche aucune promotion ; une reservation waiting qui tiendrait reste en file jusqu a la prochaine liberation',
    'Q11 (provisoire) : migrer un creneau surreserve (booked > capacity, possible a partir de P13) est refuse : INVALID_ARGUMENT, sans effet, controle place apres SLOT_CLOSED',
    "Q12 (provisoire) : create_slot ne cree jamais un creneau numerote ; seul number_seats numerote",
  ],
})

const P11_R2 = clause({
  id: 'P11.R2',
  enters: 'P11',
  text:
    "Affectation déterministe à la migration. Seules les réservations 'confirmed' du créneau reçoivent des places ; les " +
    "'waiting' n'en reçoivent pas et gardent leur rang. Ordre : seats DÉCROISSANT, puis booking_id CROISSANT en comparaison " +
    "ordinale des unités de code UTF-16 (l'ordre de la comparaison de chaînes de JavaScript, '<'). Chaque réservation " +
    "reçoit, dans cet ordre, le bloc de places consécutives qui suit le précédent, à partir de la place 1 (la première " +
    "reçoit 1..seats). L'affectation ne dépend que de l'ensemble { booking_id, seats } des réservations confirmed : ni de " +
    "leur ordre de création, ni de l'ordre d'itération d'une structure, ni de l'historique. Deux rejeux de la migration " +
    'sur le même état donnent la même affectation.',
  contract: {
    operations: { number_seats: { ordre_d_affectation: ['seats desc', 'booking_id asc (ordinal UTF-16)'] } },
    valeurs: { cle_de_tri: ['seats desc', 'booking_id asc (ordinal UTF-16)'], premiere_place: 1 },
    exemples: [
      { contexte: 'M1 de 5 places : k1 (1), k2 (2), k3 (2), dans n importe quel ordre de creation', reponse: { ok: true, slot_id: 'M1', assignments: [{ booking_id: 'k2', seat_numbers: [1, 2] }, { booking_id: 'k3', seat_numbers: [3, 4] }, { booking_id: 'k1', seat_numbers: [5] }] } },
    ],
  },
  implementation: {
    'numerotation.affectation': ((reservations) =>
      [...reservations]
        .map((r) => ({ booking_id: r.booking_id, seats: r.seats }))
        .sort((a, b) => b.seats - a.seats || (a.booking_id < b.booking_id ? -1 : a.booking_id > b.booking_id ? 1 : 0))) satisfies Affectation,
  },
  grandeurs: ['assignments', 'seat_numbers', 'seats', 'booking_id'],
})

/** Premier bloc de `seats` places consécutives parmi `libres` (croissantes), ou null. */
function premierBloc(libres: readonly number[], seats: number): number[] | null {
  const ens = new Set(libres)
  for (const debut of libres) {
    const bloc = Array.from({ length: seats }, (_, i) => debut + i)
    if (bloc.every((x) => ens.has(x))) return bloc
  }
  return null
}

const P11_R3 = clause({
  id: 'P11.R3',
  enters: 'P11',
  replaces: 'P6.R3',
  text:
    "Admission tout ou rien (remplace P6.R3). Créneau NON numéroté : inchangé (seats <= available -> 'confirmed' pour toutes " +
    "ses places, sinon entrée ENTIÈRE en queue de file, 'waiting', avec position). Créneau numéroté : la réservation est " +
    "'confirmed' si et seulement s'il existe un bloc de seats places consécutives libres ; elle reçoit alors le bloc libre " +
    "de plus petit premier numéro (premier qui tient) ; sinon elle entre entière en queue de file ('waiting'), même si " +
    "available >= seats. Une demande qui tient est confirmée même si des réservations plus anciennes attendent. Les vues " +
    "d'une réservation 'confirmed' d'un créneau numéroté (reserve, get_booking) portent seat_numbers, liste croissante.",
  contract: {
    operations: {
      reserve: { admission: 'non numerote : seats <= available ; numerote : bloc de seats places consecutives libres (premier qui tient)', reponse: { seat_numbers: 'tableau croissant, creneau numerote' } },
      get_booking: { reponse: { seat_numbers: "tableau croissant, si confirmed sur un creneau numerote" } },
    },
    exemples: [
      { contexte: 'S17 numerote, libres [2, 5]', requete: { op: 'reserve', args: { request_id: 'n5', member_id: 'm-dan', slot_id: 'S17', seats: 2 } }, reponse: { ok: true, booking_id: 'n5', status: 'waiting', position: 1, seats: 2 } },
      { requete: { op: 'reserve', args: { request_id: 'n6', member_id: 'm-sam', slot_id: 'S17' } }, reponse: { ok: true, booking_id: 'n6', status: 'confirmed', seats: 1, seat_numbers: [2] } },
    ],
  },
  implementation: {
    'creneau.places_libres': ((ctx, slot) => {
      const prises = new Set<number>()
      for (const b of ctx.locataire.bookings.values()) {
        if (b.slot_id === slot.slot_id && b.status === 'confirmed') for (const x of b.seat_numbers ?? []) prises.add(x)
      }
      return Array.from({ length: slot.capacity }, (_, i) => i + 1).filter((x) => !prises.has(x))
    }) satisfies PlacesLibres,
    'admission.place': ((ctx, slot, seats) => {
      if (slot.numbered === true) return premierBloc(ctx.regle<PlacesLibres>('creneau.places_libres')(ctx, slot), seats)
      return seats <= ctx.regle<Plafond>('creneau.plafond')(ctx, slot) - ctx.occupees(slot) ? [] : null
    }) satisfies PlaceQuiTient,
    'reserve.admission': (ctx: PlatformContext): PlatformResponse => {
      const slot = slotDe(ctx)
      const seats = typeof ctx.d.seats === 'number' ? ctx.d.seats : 1
      const creer = ctx.regle<Creation>('reservation.creation')
      const bloc = ctx.regle<PlaceQuiTient>('admission.place')(ctx, slot, seats)
      if (bloc !== null) {
        const b = creer(ctx, 'confirmed')
        if (slot.numbered === true) b.seat_numbers = bloc
        ctx.confirmer(b)
        return ctx.vue('vue.reservation.', b)
      }
      const b = creer(ctx, 'waiting')
      slot.file.push(b.booking_id)
      return ctx.vue('vue.reservation.', b)
    },
    'vue.reservation.sieges': ((ctx, b, champs) => {
      if (b.status !== 'confirmed' || b.seat_numbers === undefined) return
      if (ctx.locataire.slots.get(b.slot_id)?.numbered === true) champs.seat_numbers = [...b.seat_numbers]
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['seats', 'available', 'status', 'position', 'seat_numbers'],
})

/** Promotion premier-qui-tient, commune à P11.R4 et à P12.R1 (qui la précise). */
function promouvoir(ctx: PlatformContext, slot: Slot): string[] {
  const promus: string[] = []
  for (let tient = true; tient; ) {
    tient = false
    for (let i = 0; i < slot.file.length; i += 1) {
      const b = ctx.locataire.bookings.get(slot.file[i] as string)
      if (b === undefined) continue
      const bloc = ctx.regle<PlaceQuiTient>('admission.place')(ctx, slot, b.seats)
      if (bloc === null) continue
      if (!ctx.regles<ConditionPromotion>('promotion.condition.').every((f) => f(ctx, slot, b))) continue
      slot.file.splice(i, 1)
      if (slot.numbered === true) b.seat_numbers = bloc
      ctx.confirmer(b)
      promus.push(b.booking_id)
      tient = true
      break
    }
  }
  return promus
}

const implementationPromotion: Implementation = {
  'annulation.retrait_file': ((_ctx, b, slot) => {
    if (slot !== undefined) slot.file = slot.file.filter((id) => id !== b.booking_id)
  }) satisfies RetraitFile,
  'liberation.promotion': promouvoir,
  'vue.annulation.promus': ((ctx, _b, champs) => {
    champs.promoted = Array.isArray(ctx.d.promoted) ? [...(ctx.d.promoted as string[])] : []
  }) satisfies Vue<Booking>,
}

const P11_R4 = clause({
  id: 'P11.R4',
  enters: 'P11',
  exits: 'P12',
  replaces: 'P6.R4',
  text:
    "Promotion premier-qui-tient (remplace P6.R4). Après toute libération de places, on parcourt la file depuis la tête et " +
    "on promeut ('confirmed') la PREMIÈRE réservation qui tient ; on recommence depuis la tête tant qu'une réservation " +
    "tient. Tenir : créneau non numéroté, seats <= available ; créneau numéroté, il existe un bloc de seats places " +
    "consécutives libres, et la réservation promue reçoit le bloc libre de plus petit premier numéro. Les réservations " +
    "sautées gardent leur rang ; annuler une réservation 'waiting' la retire de la file ; promoted liste les booking_id " +
    "promus dans l'ordre de promotion ([] si aucun).",
  contract: {
    operations: { cancel: { reponse: { promoted: 'tableau de booking_id, ordre de promotion' } } },
    exemples: [{ contexte: 'S17 : n2 annulee, n4 (1 place) en tete de file', requete: { op: 'cancel', args: { booking_id: 'n2' } }, reponse: { ok: true, booking_id: 'n2', status: 'cancelled', promoted: ['n4'] } }],
  },
  implementation: implementationPromotion,
  grandeurs: ['promoted', 'seats', 'available', 'seat_numbers'],
})

const P11_R5 = clause({
  id: 'P11.R5',
  enters: 'P11',
  text:
    "Libération des places numérotées. Une annulation totale libère toutes les places de la réservation. Une annulation " +
    "partielle de k places libère les k places de PLUS GRANDS numéros de la réservation, qui garde les autres ; la " +
    "réponse de cancel porte alors seat_numbers (les places gardées, liste croissante). get_slot porte numbered (booléen) " +
    'et, pour un créneau numéroté, free_seats : la liste croissante des places libres.',
  contract: {
    operations: {
      cancel: { reponse_partielle: { seat_numbers: 'places gardees, tableau croissant' } },
      get_slot: { reponse: { numbered: 'booleen', free_seats: 'tableau croissant (creneau numerote)' } },
    },
    exemples: [
      { contexte: 'n1 [1, 2]', requete: { op: 'cancel', args: { booking_id: 'n1', seats: 1 } }, reponse: { ok: true, booking_id: 'n1', status: 'confirmed', seats: 1, seat_numbers: [1] } },
      { requete: { op: 'get_slot', args: { slot_id: 'S17' } }, reponse: { ok: true, slot_id: 'S17', numbered: true, booked: 4, available: 2, free_seats: [2, 5], waiting: [] } },
    ],
  },
  implementation: {
    'annulation.partielle.sieges': ((ctx, b, k) => {
      if (b.seat_numbers === undefined || ctx.locataire.slots.get(b.slot_id)?.numbered !== true) return
      const tries = [...b.seat_numbers].sort((x, y) => x - y)
      b.seat_numbers = tries.slice(0, Math.max(0, tries.length - k))
    }) satisfies Partielle,
    'vue.annulation.sieges': ((ctx, b, champs) => {
      if (ctx.d.partielle === true && b.seat_numbers !== undefined && ctx.locataire.slots.get(b.slot_id)?.numbered === true) {
        champs.seat_numbers = [...b.seat_numbers]
      }
    }) satisfies Vue<Booking>,
    'vue.creneau.numerotation': ((ctx, s, champs) => {
      champs.numbered = s.numbered === true
      if (s.numbered === true) champs.free_seats = ctx.regle<PlacesLibres>('creneau.places_libres')(ctx, s)
    }) satisfies Vue<Slot>,
  },
  grandeurs: ['seat_numbers', 'free_seats', 'numbered', 'seats'],
})

/* ═══════════════════════════════════════════════════════════════════ P12 */

const P12_R1 = clause({
  id: 'P12.R1',
  enters: 'P12',
  replaces: 'P11.R4',
  text:
    "RAPPORT DE BUG BUG-P12, comportement correct (remplace P11.R4, qu'il précise sans en changer le sens). Promotion " +
    "premier-qui-tient : après toute libération de places, on parcourt la file depuis la tête et on promeut la PREMIÈRE " +
    "réservation qui tient ; on recommence depuis la tête tant qu'une réservation tient. Sur un créneau numéroté, une " +
    "réservation tient s'il existe un bloc de seats places consécutives libres parmi TOUTES les places libres du créneau au " +
    "moment du parcours, quelle que soit l'opération qui les a libérées (annulation totale, partielle, ou une opération " +
    "antérieure) ; la réservation promue reçoit le bloc libre de plus petit premier numéro. Non numéroté : seats <= " +
    "available. Les réservations sautées gardent leur rang ; promoted liste les promus dans l'ordre de promotion. Scénario " +
    "de reproduction fourni (sans la cause) : créneau numéroté de 4 places ; x1 (1 place) reçoit [1], x2 (2) [2,3], x3 (1) " +
    "[4] ; x4 (2) attend ; annuler x1 ne promeut personne ; annuler 1 place de x2 libère la place 3 et ne promeut " +
    "personne ; annuler x3 doit promouvoir x4 sur [3,4]. Observé en production : x4 reste en file.",
  contract: {
    operations: { cancel: { reponse: { promoted: 'tableau de booking_id, ordre de promotion' } } },
    rapport_de_bug: { id: 'BUG-P12', observe: { requete: { op: 'cancel', args: { booking_id: 'x3' } }, reponse: { ok: true, booking_id: 'x3', status: 'cancelled', promoted: [] } } },
    exemples: [
      { contexte: 'S16 numerote de 4 places : libres {1, 3} ; x3 [4] ; x4 (2) en file', requete: { op: 'cancel', args: { booking_id: 'x3' } }, reponse: { ok: true, booking_id: 'x3', status: 'cancelled', promoted: ['x4'] } },
      { requete: { op: 'get_booking', args: { booking_id: 'x4' } }, reponse: { ok: true, booking_id: 'x4', status: 'confirmed', seats: 2, seat_numbers: [3, 4] } },
    ],
  },
  implementation: implementationPromotion,
  grandeurs: ['promoted', 'seats', 'available', 'seat_numbers', 'free_seats'],
  questions_ouvertes: [
    "Q13 (provisoire, exercee) : P12.R1 est porte comme REMPLACEMENT de P11.R4 (meme mise en oeuvre, texte precise), choix de la racine, pour garder la non-contradiction mecanique",
  ],
})

/* ═══════════════════════════════════════════════════════════════════ P13 */

const SURRESERVATION_BP = 1000
const COMPENSATION_PAR_PLACE_CENTS = 1000
type Debarquement = (ctx: PlatformContext, b: Booking) => number

const P13_R1 = clause({
  id: 'P13.R1',
  enters: 'P13',
  replaces: 'P6.R1',
  text:
    "Places et surréservation (remplace P6.R1). reserve accepte seats, nombre de places demandées : entier >= 1, 1 par " +
    "défaut s'il est absent ; toute autre valeur -> { ok: false, error: 'INVALID_ARGUMENT' } ; toute réservation porte " +
    "seats et les réponses de reserve et de get_booking le renvoient. booked = SOMME des seats des réservations " +
    "'confirmed'. Plafond d'admission : créneau NON numéroté, plafond = capacity + floor(capacity × 1000 / 10000) " +
    "(surréservation de 10 %, arrondie à la place inférieure : 9 -> 9, 10 -> 11, 19 -> 20, 20 -> 22) ; créneau numéroté, " +
    "plafond = capacity (pas de surréservation). available = plafond - booked ; l'admission (P11.R3) et la promotion " +
    "(P12.R1) comparent seats à ce available. GROUP_TOO_LARGE reste jugé contre capacity (seats > capacity). get_slot " +
    'porte overbook_limit (le plafond) et closed (booléen).',
  contract: {
    operations: {
      reserve: { arguments: { seats: 'entier >= 1, defaut 1' }, reponse: { seats: 'entier' }, erreurs: ['INVALID_ARGUMENT', 'GROUP_TOO_LARGE'] },
      get_booking: { reponse: { seats: 'entier' } },
      get_slot: { reponse: { overbook_limit: 'entier', available: 'overbook_limit - booked', closed: 'booleen' } },
    },
    valeurs: { surreservation_bp: SURRESERVATION_BP, arrondi: 'floor, a la place', exemples: { 9: 9, 10: 11, 19: 20, 20: 22 } },
    exemples: [
      { contexte: 'S18 non numerote de capacite 10, booked 10', requete: { op: 'get_slot', args: { slot_id: 'S18' } }, reponse: { ok: true, slot_id: 'S18', capacity: 10, booked: 10, overbook_limit: 11, available: 1 } },
    ],
  },
  implementation: {
    'reserve.etape.places_valides': etape(40, (ctx) => {
      const seats = ctx.args.seats ?? 1
      if (!estEntier(seats) || seats < 1) return fail('INVALID_ARGUMENT')
      ctx.d.seats = seats
      return undefined
    }),
    'vue.reservation.places': ((_ctx, b, champs) => {
      champs.seats = b.seats
    }) satisfies Vue<Booking>,
    'creneau.plafond': ((_ctx, slot) =>
      slot.numbered === true ? slot.capacity : slot.capacity + Math.floor((slot.capacity * SURRESERVATION_BP) / 10000)) satisfies Plafond,
    'vue.creneau.surreservation': ((ctx, s, champs) => {
      const plafond = ctx.regle<Plafond>('creneau.plafond')(ctx, s)
      champs.overbook_limit = plafond
      champs.available = plafond - ctx.occupees(s)
      champs.closed = s.closed === true
    }) satisfies Vue<Slot>,
  },
  grandeurs: ['seats', 'booked', 'available', 'capacity', 'overbook_limit', 'closed'],
  questions_ouvertes: [
    "Q17 (provisoire) : available d'un creneau clos reste overbook_limit - booked (il n'est plus reservable de toute facon : at >= starts_at)",
  ],
})

const P13_R2 = clause({
  id: 'P13.R2',
  enters: 'P13',
  text:
    "Clôture. close_slot { slot_id } (rôles admin, staff) clôture un créneau à son début. Contrôles après ceux d'acteur, " +
    "dans cet ordre : slot_id inconnu -> { ok: false, error: 'NOT_FOUND' } ; at < starts_at -> { ok: false, error: " +
    "'INVALID_ARGUMENT' } ; créneau déjà clos -> { ok: false, error: 'ALREADY_CLOSED' }. Effets, dans cet ordre : (1) toutes " +
    "les réservations 'waiting' passent 'cancelled' (expirées, rien à rembourser) et la file est vidée ; (2) tant que " +
    "booked > capacity, la réservation 'confirmed' confirmée la PLUS RÉCEMMENT (ordre de confirmation P13.R3) est " +
    "débarquée ENTIÈRE (statut 'bumped', P13.R3), même si cela fait descendre booked sous capacity. Réponse { ok: true, " +
    "slot_id, expired, bumped, compensation_cents } : expired dans l'ordre de la file, bumped dans l'ordre de " +
    "débarquement, compensation_cents = somme des compensations (centimes d'euro). close_slot n'est jamais automatique.",
  contract: {
    operations: {
      close_slot: {
        roles_autorises: ['admin', 'staff'],
        arguments: { slot_id: 'chaine' },
        reponse: { ok: true, slot_id: 'chaine', expired: 'tableau de booking_id', bumped: 'tableau de booking_id', compensation_cents: 'entier' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT', 'ALREADY_CLOSED'],
      },
    },
    exemples: [
      { contexte: 'S18 : capacite 10, booked 11, o4 en file', requete: { op: 'close_slot', at: '2031-05-12T16:00:00Z', args: { slot_id: 'S18' } }, reponse: { ok: true, slot_id: 'S18', expired: ['o4'], bumped: ['o3'], compensation_cents: 1000 } },
      { requete: { op: 'close_slot', at: '2031-05-12T15:59:00Z', args: { slot_id: 'S18' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { contexte: 'deja clos', requete: { op: 'close_slot', args: { slot_id: 'S18' } }, reponse: { ok: false, error: 'ALREADY_CLOSED' } },
    ],
  },
  implementation: {
    'autorisation.close_slot': ['admin', 'staff'],
    'close_slot.effet': (ctx: PlatformContext): PlatformResponse => {
      const slot = ctx.locataire.slots.get(String(ctx.args.slot_id))
      if (slot === undefined) return fail('NOT_FOUND')
      if (ctx.instant < Date.parse(slot.starts_at)) return fail('INVALID_ARGUMENT')
      if (slot.closed === true) return fail('ALREADY_CLOSED')
      const expired = [...slot.file]
      for (const id of expired) {
        const b = ctx.locataire.bookings.get(id)
        if (b !== undefined) b.status = 'cancelled'
      }
      slot.file = []
      const bumped: string[] = []
      let compensation_cents = 0
      while (ctx.occupees(slot) > slot.capacity) {
        const dernier = [...ctx.locataire.bookings.values()]
          .filter((b) => b.slot_id === slot.slot_id && b.status === 'confirmed')
          .sort((a, b) => (b.confirmation_seq ?? b.seq) - (a.confirmation_seq ?? a.seq))[0] as Booking
        compensation_cents += ctx.regle<Debarquement>('debarquement')(ctx, dernier)
        bumped.push(dernier.booking_id)
      }
      slot.closed = true
      return succeed({ slot_id: slot.slot_id, expired, bumped, compensation_cents })
    },
  },
  grandeurs: ['slot_id', 'expired', 'bumped', 'compensation_cents', 'booked', 'capacity', 'starts_at', 'at'],
  questions_ouvertes: [
    "Q14 (provisoire) : close_slot n'est jamais automatique ; un creneau surreserve non clos garde ses surnumeraires sans compensation",
  ],
})

const P13_R3 = clause({
  id: 'P13.R3',
  enters: 'P13',
  text:
    "Ordre de confirmation et débarquement. L'ordre de confirmation est l'ordre dans lequel les réservations sont devenues " +
    "'confirmed' le long de la trajectoire (à la réservation ou à la promotion ; à l'intérieur d'une opération, dans " +
    "l'ordre de promoted) ; une annulation partielle ne change pas ce rang. Débarquement d'une réservation : remboursement " +
    "intégral vers chaque source (C re-crédité au portefeuille, D à la carte), puis amount_cents, paid_credits_cents et " +
    "paid_card_cents valent 0 ; compensation de 1000 centimes d'euro PAR PLACE débarquée, créditée au portefeuille du " +
    "membre (crédits), due même pour une réservation gratuite. Le statut devient 'bumped' ; get_booking le rend avec ces " +
    "montants. 'bumped' n'est pas un statut actif : cancel -> { ok: false, error: 'ALREADY_CANCELLED' }, mark_no_show -> " +
    "{ ok: false, error: 'INVALID_ARGUMENT' }.",
  contract: {
    valeurs: { compensation_par_place_cents: COMPENSATION_PAR_PLACE_CENTS, status: ['confirmed', 'waiting', 'cancelled', 'bumped'] },
    operations: {
      cancel: { erreurs: ['ALREADY_CANCELLED'] },
      get_booking: { reponse_bumped: { status: "'bumped'", amount_cents: 0, paid_credits_cents: 0, paid_card_cents: 0 } },
    },
    exemples: [
      { contexte: 'o3 debarquee', requete: { op: 'get_booking', args: { booking_id: 'o3' } }, reponse: { ok: true, booking_id: 'o3', status: 'bumped', amount_cents: 0, paid_credits_cents: 0, paid_card_cents: 0 } },
      { requete: { op: 'cancel', args: { booking_id: 'o3' } }, reponse: { ok: false, error: 'ALREADY_CANCELLED' } },
    ],
  },
  implementation: {
    'debarquement': ((ctx, b) => {
      const A = b.amount_cents ?? 0
      const C = b.paid_credits_cents ?? 0
      b.status = 'bumped'
      b.amount_cents = 0
      b.paid_credits_cents = 0
      b.paid_card_cents = 0
      inscrireRemboursement(ctx, b, A, C, 'bump')
      const compensation = COMPENSATION_PAR_PLACE_CENTS * b.seats
      ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, b.member_id, compensation)
      ctx.journaliser({ type: 'compensation', member_id: b.member_id, booking_id: b.booking_id, amount_cents: compensation, credits_cents: compensation, card_cents: 0 })
      return compensation
    }) satisfies Debarquement,
    'cancel.etape.debarquee': etape(31, (ctx) => (reservationDe(ctx).status === 'bumped' ? fail('ALREADY_CANCELLED') : undefined)),
    'vue.reservation.debarquee': ((_ctx, b, champs) => {
      if (b.status !== 'bumped') return
      champs.paid_credits_cents = b.paid_credits_cents ?? 0
      champs.paid_card_cents = b.paid_card_cents ?? 0
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['status', 'compensation_cents', 'amount_cents', 'paid_credits_cents', 'paid_card_cents', 'balance_cents', 'bumped'],
  questions_ouvertes: [
    "Q15 (provisoire) : le debarquement suit l'ordre de confirmation ; une reservation partiellement annulee garde son rang de confirmation d'origine",
    "Q16 (provisoire, exercee) : la compensation (1000 centimes par place) est due meme pour une reservation gratuite et meme si le debarquement d'un groupe entier fait descendre booked sous capacity",
  ],
})

/* ═══════════════════════════════════════════════════════════════════ P14 */

const CLE_FACTURATION = 'facturation'
interface Facturation {
  readonly emis: Set<string>
  readonly factures: Map<string, Json>
  readonly avoirs: Json[]
  seq: number
}
const facturation = (ctx: PlatformContext): Facturation =>
  ctx.donnee<Facturation>(CLE_FACTURATION, () => ({ emis: new Set(), factures: new Map(), avoirs: [], seq: 0 }))

type MoisDe = (ctx: PlatformContext, t: number) => string
type DebutMois = (ctx: PlatformContext, mois: string) => number
type Lignes = (ctx: PlatformContext, member: string, mois: string) => JournalEntry[]
type Facture = (ctx: PlatformContext, member: string, mois: string) => Json
type Rapprochement = (ctx: PlatformContext, member: string) => void

const MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/
const moisSuivant = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number) as [number, number]
  return m === 12 ? `${String(a + 1)}-01` : `${String(a)}-${String(m + 1).padStart(2, '0')}`
}
const TYPES_REMBOURSEMENT = new Set(['refund', 'adjustment'])

const P14_R1 = clause({
  id: 'P14.R1',
  enters: 'P14',
  text:
    "Mouvements financiers d'un membre dans un locataire, chacun daté par le at de l'opération qui le produit : charge " +
    "(réservation devenue 'confirmed' avec amount_cents > 0 : montant, part crédits, part carte), refund (remboursement " +
    "R > 0 d'une annulation ou d'un débarquement, NON couvert par un avoir), top_up (crédits achetés, en centimes d'euro " +
    "crédités), compensation (P13.R3), et adjustment à partir de P16. Les mouvements de montant nul ne sont pas des lignes. " +
    "Le mois d'un mouvement est le mois CIVIL LOCAL du site 'AAAA-MM' (fuseau du locataire au moment de l'émission, P9.R2) " +
    'de son instant ; tous les mouvements depuis P1 comptent.',
  contract: {
    mouvements: ['charge', 'refund', 'top_up', 'compensation', 'adjustment (P16)'],
    valeurs: { mois: "'AAAA-MM', mois civil local du site", montant_nul: "pas de ligne" },
    exemples: [{ calcul: "fuseau 'Europe/Paris' : mai 2031 local va de 2031-04-30T22:00:00Z (inclus) a 2031-05-31T22:00:00Z (exclu)" }],
  },
  implementation: {
    'comptabilite.mois': ((ctx, t) => new Date(murale(ctx, t)).toISOString().slice(0, 7)) satisfies MoisDe,
    'comptabilite.debut_mois': ((ctx, mois) => versUtc(ctx, Date.parse(`${mois}-01T00:00:00Z`))) satisfies DebutMois,
    'comptabilite.lignes': ((ctx, member, mois) => {
      const moisDe = ctx.regle<MoisDe>('comptabilite.mois')
      return ctx.locataire.journal.filter(
        (e) => e.member_id === member && e.amount_cents > 0 && e.avoir === undefined && moisDe(ctx, Date.parse(e.at)) === mois,
      )
    }) satisfies Lignes,
  },
  grandeurs: ['month', 'lines.amount_cents', 'at'],
})

const P14_R2 = clause({
  id: 'P14.R2',
  enters: 'P14',
  text:
    "Émission. issue_invoices { month } (rôle admin seulement) émet les factures du mois 'AAAA-MM'. Contrôles après ceux " +
    "d'acteur, dans cet ordre : month mal formé (forme autre que 'AAAA-MM', ou mois hors 01..12) -> { ok: false, error: " +
    "'INVALID_ARGUMENT' } ; mois non terminé (at < premier instant du mois suivant en heure locale du site) -> " +
    "{ ok: false, error: 'INVALID_ARGUMENT' } ; mois déjà émis pour ce locataire -> { ok: false, error: 'ALREADY_EXISTS' }. " +
    "Une facture est émise pour chaque membre ayant au moins une ligne ou un avoir émis dans le mois ; invoice_id = " +
    "'INV-<AAAA-MM>-<member_id>'. Réponse { ok: true, month, invoice_ids }, invoice_ids par member_id croissant (ordinal). " +
    'Une facture émise est IMMUABLE : elle ne change plus jamais, et un mois émis ne se réémet pas.',
  contract: {
    operations: {
      issue_invoices: {
        roles_autorises: ['admin'],
        arguments: { month: "'AAAA-MM'" },
        reponse: { ok: true, month: "'AAAA-MM'", invoice_ids: "tableau de 'INV-<AAAA-MM>-<member_id>', par member_id croissant" },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'],
      },
    },
    exemples: [
      { contexte: "fuseau 'Europe/Paris'", requete: { op: 'issue_invoices', at: '2031-05-31T21:59:59Z', args: { month: '2031-05' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { requete: { op: 'issue_invoices', at: '2031-05-13T09:03:00Z', args: { month: '2031-03' } }, reponse: { ok: true, month: '2031-03', invoice_ids: ['INV-2031-03-m-cleo', 'INV-2031-03-m-dan', 'INV-2031-03-m-fay', 'INV-2031-03-m-gus'] } },
      { contexte: 'deja emis', requete: { op: 'issue_invoices', args: { month: '2031-03' } }, reponse: { ok: false, error: 'ALREADY_EXISTS' } },
    ],
  },
  implementation: {
    'autorisation.issue_invoices': ['admin'],
    'issue_invoices.effet': (ctx: PlatformContext): PlatformResponse => {
      const month = ctx.args.month
      if (typeof month !== 'string' || !MOIS.test(month)) return fail('INVALID_ARGUMENT')
      if (ctx.instant < ctx.regle<DebutMois>('comptabilite.debut_mois')(ctx, moisSuivant(month))) return fail('INVALID_ARGUMENT')
      const f = facturation(ctx)
      if (f.emis.has(month)) return fail('ALREADY_EXISTS')
      const moisDe = ctx.regle<MoisDe>('comptabilite.mois')
      const membres = new Set<string>()
      for (const e of ctx.locataire.journal) {
        if (e.amount_cents > 0 && e.avoir === undefined && moisDe(ctx, Date.parse(e.at)) === month) membres.add(e.member_id)
      }
      for (const a of f.avoirs) if (a.month === month) membres.add(String(a.member_id))
      const tries = [...membres].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const invoice_ids: string[] = []
      for (const m of tries) {
        const facture = ctx.regle<Facture>('comptabilite.facture')(ctx, m, month)
        f.factures.set(String(facture.invoice_id), facture)
        invoice_ids.push(String(facture.invoice_id))
      }
      f.emis.add(month)
      for (const m of tries) ctx.regle<Rapprochement>('comptabilite.rapprochement')(ctx, m)
      return succeed({ month, invoice_ids })
    },
  },
  grandeurs: ['month', 'invoice_ids', 'invoice_id', 'at'],
  questions_ouvertes: [
    "Q19 (provisoire) : issue_invoices accepte d'emettre les mois dans le desordre et n'exige pas que les mois precedents soient emis ; le solde d'ouverture est lu dans l'historique du portefeuille",
    "Q20 (provisoire, exercee) : tout locataire peut etre facture ; un mouvement de montant nul n'est pas une ligne ; un membre sans ligne ni avoir dans le mois n'a pas de facture, meme si son solde est non nul",
  ],
})

const P14_R3 = clause({
  id: 'P14.R3',
  enters: 'P14',
  text:
    "Contenu d'une facture : invoice_id, member_id, month, lines (dans l'ordre des opérations ; au sein d'une opération, le " +
    "remboursement avant la compensation, puis les charges des promus dans l'ordre de promoted ; chaque ligne { type, " +
    "booking_id (null pour top_up), amount_cents }), charges_cents = somme des charges, refunds_cents = somme des lignes " +
    "de remboursement (refund, et adjustment à partir de P16), total_cents = charges_cents - refunds_cents, card_cents = " +
    "parts carte des charges - parts carte des remboursements, credits_used_cents = parts crédits des charges - parts " +
    "crédits des remboursements (ces deux montants sont SIGNÉS et card_cents + credits_used_cents = total_cents), " +
    "top_ups_cents, compensations_cents, credit_notes_credits_cents = somme des credits_cents des avoirs émis dans le mois " +
    "pour ce membre, opening_balance_cents et closing_balance_cents = solde du portefeuille au premier instant (local) du " +
    "mois et au premier instant du mois suivant. Tous les montants en centimes d'euro entiers. Identité : closing = " +
    'opening + top_ups + compensations + credit_notes_credits - credits_used.',
  contract: {
    facture: {
      invoice_id: "'INV-<AAAA-MM>-<member_id>'",
      member_id: 'chaine',
      month: "'AAAA-MM'",
      lines: "tableau de { type: 'charge' | 'refund' | 'top_up' | 'compensation' | 'adjustment', booking_id: chaine | null, amount_cents: entier }",
      charges_cents: 'entier',
      refunds_cents: 'entier',
      total_cents: 'entier',
      card_cents: 'entier signe',
      credits_used_cents: 'entier signe',
      top_ups_cents: 'entier',
      compensations_cents: 'entier',
      credit_notes_credits_cents: 'entier',
      opening_balance_cents: 'entier',
      closing_balance_cents: 'entier',
    },
    identite: 'closing = opening + top_ups + compensations + credit_notes_credits - credits_used',
    exemples: [
      {
        facture: {
          invoice_id: 'INV-2031-04-m-gus', member_id: 'm-gus', month: '2031-04',
          lines: [{ type: 'charge', booking_id: 'v2', amount_cents: 3000 }],
          charges_cents: 3000, refunds_cents: 0, total_cents: 3000, card_cents: 3000, credits_used_cents: 0,
          top_ups_cents: 0, compensations_cents: 0, credit_notes_credits_cents: 0, opening_balance_cents: 0, closing_balance_cents: 0,
        },
      },
    ],
  },
  implementation: {
    'comptabilite.facture': ((ctx, member, mois) => {
      const lignes = ctx.regle<Lignes>('comptabilite.lignes')(ctx, member, mois)
      const somme = (types: (t: string) => boolean, champ: 'amount_cents' | 'credits_cents' | 'card_cents'): number =>
        lignes.filter((e) => types(e.type)).reduce((s, e) => s + e[champ], 0)
      const charge = (t: string): boolean => t === 'charge'
      const remb = (t: string): boolean => TYPES_REMBOURSEMENT.has(t)
      const charges_cents = somme(charge, 'amount_cents')
      const refunds_cents = somme(remb, 'amount_cents')
      const debut = ctx.regle<DebutMois>('comptabilite.debut_mois')
      const solde = (t: number): number =>
        historiquePortefeuille(ctx).filter((h) => h.member_id === member && h.t < t).reduce((s, h) => s + h.delta, 0)
      const credit_notes_credits_cents = facturation(ctx)
        .avoirs.filter((a) => a.member_id === member && a.month === mois)
        .reduce((s, a) => s + (a.credits_cents as number), 0)
      return {
        invoice_id: `INV-${mois}-${member}`,
        member_id: member,
        month: mois,
        lines: lignes.map((e) => ({ type: e.type, booking_id: e.booking_id, amount_cents: e.amount_cents })),
        charges_cents,
        refunds_cents,
        total_cents: charges_cents - refunds_cents,
        card_cents: somme(charge, 'card_cents') - somme(remb, 'card_cents'),
        credits_used_cents: somme(charge, 'credits_cents') - somme(remb, 'credits_cents'),
        top_ups_cents: somme((t) => t === 'top_up', 'amount_cents'),
        compensations_cents: somme((t) => t === 'compensation', 'amount_cents'),
        credit_notes_credits_cents,
        opening_balance_cents: solde(debut(ctx, mois)),
        closing_balance_cents: solde(debut(ctx, moisSuivant(mois))),
      }
    }) satisfies Facture,
  },
  grandeurs: [
    'invoice_id', 'member_id', 'month', 'lines.amount_cents', 'charges_cents', 'refunds_cents', 'total_cents',
    'invoices.card_cents', 'credits_used_cents', 'top_ups_cents', 'compensations_cents', 'credit_notes_credits_cents',
    'opening_balance_cents', 'closing_balance_cents',
  ],
  questions_ouvertes: [
    "Q21 (provisoire, exercee) : format de ligne minimal { type, booking_id, amount_cents } : ni parts credits/carte par ligne, ni devise d'origine d'un rechargement en USD (la ligne porte les centimes d'EUR credites)",
  ],
})

const P14_R4 = clause({
  id: 'P14.R4',
  enters: 'P14',
  text:
    "Avoirs. Un remboursement R > 0 (annulation, débarquement) dont la CHARGE appartient à un mois déjà facturé (mois local " +
    "de la confirmation de la réservation) ne devient pas une ligne : il fait l'objet d'un avoir émis à l'instant de " +
    "l'opération : { credit_note_id 'AV-nnnn' (séquence par locataire, 4 chiffres, à partir de AV-0001), invoice_id (la " +
    "facture de la charge), member_id, booking_id, reason ('cancellation', 'bump', 'price_change' à partir de P16), month " +
    "(mois local d'émission 'AAAA-MM'), issued_at (instant ISO 8601 UTC 'AAAA-MM-JJTHH:MM:SSZ'), amount_cents = R, " +
    "credits_cents = r_c, card_cents = r_d } (centimes d'euro). Sinon le remboursement est une ligne refund du mois où il " +
    "a lieu, même si la charge date d'un mois passé non encore facturé. La réponse de cancel porte credit_note_id " +
    "(l'avoir émis, ou null).",
  contract: {
    avoir: {
      credit_note_id: "'AV-nnnn'",
      invoice_id: 'facture de la charge',
      member_id: 'chaine',
      booking_id: 'chaine',
      reason: "'cancellation' | 'bump' | 'price_change'",
      month: "'AAAA-MM' (emission)",
      issued_at: "'AAAA-MM-JJTHH:MM:SSZ'",
      amount_cents: 'R',
      credits_cents: 'r_c',
      card_cents: 'r_d',
    },
    operations: { cancel: { reponse: { credit_note_id: "'AV-nnnn' | null" } } },
    exemples: [
      {
        contexte: 'v1 confirmee en avril (facture), annulee le 14/05 a 100 %',
        requete: { op: 'cancel', args: { booking_id: 'v1' } },
        reponse: { ok: true, booking_id: 'v1', status: 'cancelled', refund_rate_bp: 10000, refunded_cents: 1500, refund: { credits_cents: 833, card_cents: 667 }, credit_note_id: 'AV-0001' },
      },
    ],
  },
  implementation: {
    'comptabilite.avoir': ((ctx, b, e, reason) => {
      const f = facturation(ctx)
      const moisCharge = ctx.regle<MoisDe>('comptabilite.mois')(ctx, Date.parse(b.confirmed_at ?? e.at))
      if (!f.emis.has(moisCharge)) return null
      f.seq += 1
      const credit_note_id = `AV-${String(f.seq).padStart(4, '0')}`
      f.avoirs.push({
        credit_note_id,
        invoice_id: `INV-${moisCharge}-${b.member_id}`,
        member_id: b.member_id,
        booking_id: b.booking_id,
        reason,
        month: ctx.regle<MoisDe>('comptabilite.mois')(ctx, ctx.instant),
        issued_at: ctx.step.at,
        amount_cents: e.amount_cents,
        credits_cents: e.credits_cents,
        card_cents: e.card_cents,
      })
      e.avoir = credit_note_id
      return credit_note_id
    }) satisfies Avoir,
    'vue.annulation.avoir': ((ctx, _b, champs) => {
      champs.credit_note_id = typeof ctx.d.credit_note_id === 'string' ? ctx.d.credit_note_id : null
    }) satisfies Vue<Booking>,
  },
  grandeurs: [
    'credit_note_id', 'invoice_id', 'reason', 'month', 'issued_at',
    'credit_notes.amount_cents', 'credit_notes.credits_cents', 'credit_notes.card_cents', 'refunded_cents',
  ],
  questions_ouvertes: [
    "Q18 (provisoire, exercee) : le remboursement d'une charge d'un mois passe mais non encore facture est une ligne refund du mois du remboursement (card_cents de ce mois peut devenir negatif)",
    "Q22 (provisoire) : au-dela de AV-9999 la sequence continue sur 5 chiffres ou plus (AV-10000), sans troncature",
  ],
})

const P14_R5 = clause({
  id: 'P14.R5',
  enters: 'P14',
  text:
    "Documents. list_documents { member_id } : admin et staff pour tout membre ; member pour lui-même seulement (sinon " +
    "{ ok: false, error: 'FORBIDDEN' }) ; member_id non membre du locataire -> { ok: false, error: 'NOT_FOUND' }. Réponse " +
    "{ ok: true, member_id, invoices, credit_notes } : invoices, les factures émises du membre (contenu P14.R3) par mois " +
    'croissant ; credit_notes, ses avoirs (contenu P14.R4) par credit_note_id croissant.',
  contract: {
    operations: {
      list_documents: {
        roles_autorises: ['admin', 'staff', 'member:soi'],
        arguments: { member_id: 'chaine' },
        reponse: { ok: true, member_id: 'chaine', invoices: 'tableau, par month croissant', credit_notes: 'tableau, par credit_note_id croissant' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND'],
      },
    },
    exemples: [{ contexte: 'actor member m-gus', requete: { op: 'list_documents', actor: 'm-gus', args: { member_id: 'm-dan' } }, reponse: { ok: false, error: 'FORBIDDEN' } }],
  },
  implementation: {
    'autorisation.list_documents': ['admin', 'staff', 'member'],
    'list_documents.etape.soi': etape(5, soiSeulement((ctx) => String(ctx.args.member_id))),
    'list_documents.effet': (ctx: PlatformContext): PlatformResponse => {
      const member_id = ctx.args.member_id
      if (ctx.role(member_id) === undefined) return fail('NOT_FOUND')
      const f = facturation(ctx)
      const invoices = [...f.factures.values()]
        .filter((x) => x.member_id === member_id)
        .sort((a, b) => (String(a.month) < String(b.month) ? -1 : 1))
      const credit_notes = f.avoirs
        .filter((a) => a.member_id === member_id)
        .sort((a, b) => (String(a.credit_note_id) < String(b.credit_note_id) ? -1 : 1))
      return succeed({ member_id, invoices: clone(invoices), credit_notes: clone(credit_notes) })
    },
  },
  grandeurs: ['member_id', 'invoice_id', 'credit_note_id', 'month'],
})

const P14_R6 = clause({
  id: 'P14.R6',
  enters: 'P14',
  text:
    "Rapprochement exact, à tout instant où tous les mois écoulés sont facturés et où aucun mouvement n'a eu lieu depuis la " +
    "fin du dernier mois facturé : pour chaque membre, balance_cents du portefeuille = closing_balance_cents de sa " +
    "dernière facture = somme, sur ses factures, de (top_ups + compensations + credit_notes_credits - credits_used) ; la " +
    "facture suivante s'ouvre sur la clôture de la précédente ; et pour chaque facture, credit_notes_credits_cents = somme " +
    "des credits_cents des avoirs du membre émis ce mois-là. Le modèle attendu vérifie ces identités à chaque émission.",
  contract: {
    invariants: [
      'balance_cents = closing_balance_cents de la derniere facture',
      'opening_balance_cents(facture n+1) = closing_balance_cents(facture n)',
      'closing = opening + top_ups + compensations + credit_notes_credits - credits_used',
      'credit_notes_credits_cents = somme des credits_cents des avoirs du mois',
    ],
    exemples: [{ calcul: 'm-cleo apres mai : (2000 - 1167) + (0 - 833) + (833 - 0) = 833 = balance_cents' }],
  },
  implementation: {
    'comptabilite.rapprochement': ((ctx, member) => {
      const f = facturation(ctx)
      const factures = [...f.factures.values()].filter((x) => x.member_id === member).sort((a, b) => (String(a.month) < String(b.month) ? -1 : 1))
      let ouverture = 0
      for (const x of factures) {
        const n = (k: string): number => x[k] as number
        const avoirs = f.avoirs.filter((a) => a.member_id === member && a.month === x.month).reduce((s, a) => s + (a.credits_cents as number), 0)
        if (
          n('opening_balance_cents') !== ouverture ||
          n('credit_notes_credits_cents') !== avoirs ||
          n('closing_balance_cents') !== n('opening_balance_cents') + n('top_ups_cents') + n('compensations_cents') + avoirs - n('credits_used_cents') ||
          n('card_cents') + n('credits_used_cents') !== n('total_cents')
        ) {
          throw new Error(`RAPPROCHEMENT-ROMPU ${String(x.invoice_id)}`)
        }
        ouverture = n('closing_balance_cents')
      }
    }) satisfies Rapprochement,
  },
  grandeurs: ['balance_cents', 'opening_balance_cents', 'closing_balance_cents', 'credit_notes_credits_cents', 'credits_used_cents', 'top_ups_cents', 'compensations_cents'],
})

/* ═══════════════════════════════════════════════════════════════════ P15 */

const CLE_TAUX = 'devise.taux'
const DEVISES = ['EUR', 'USD'] as const
type TauxApplicable = (ctx: PlatformContext, t: number) => number | undefined
type Conversion = (usd_cents: number, rate_micro: number) => number
type Devise = (ctx: PlatformContext, slot: Slot | undefined) => string
interface Tarification {
  readonly seats: number
  readonly prix: number
  readonly devise: string
  readonly taux_bp: number
  readonly rate_micro?: number
}
type Montant = (ctx: PlatformContext, t: Tarification) => { amount_cents: number; net: number }

const P15_R1 = clause({
  id: 'P15.R1',
  enters: 'P15',
  text:
    "Table de taux. set_rate { currency, date, rate_micro } (rôle admin seulement) inscrit un taux dans la table datée du " +
    "locataire. currency vaut 'USD' (l'EUR est la devise de compte, taux implicite 1) ; date 'AAAA-MM-JJ' ; rate_micro " +
    "entier >= 1 = nombre d'EUR pour 1 USD multiplié par 1 000 000 (912500 = 0,9125 EUR par USD). Sinon " +
    "{ ok: false, error: 'INVALID_ARGUMENT' }. Un taux déjà inscrit pour (currency, date) -> { ok: false, error: " +
    "'ALREADY_EXISTS' } (la table ne se réécrit pas). Réponse { ok: true, currency, date, rate_micro }.",
  contract: {
    operations: {
      set_rate: {
        roles_autorises: ['admin'],
        arguments: { currency: "'USD'", date: "'AAAA-MM-JJ'", rate_micro: 'entier >= 1 (EUR par USD x 10^6)' },
        reponse: { ok: true, currency: "'USD'", date: 'chaine', rate_micro: 'entier' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'],
      },
    },
    valeurs: { unite_rate_micro: 'EUR par USD x 10^6', devises: [...DEVISES], devise_de_compte: 'EUR' },
    exemples: [
      { requete: { op: 'set_rate', actor: 'm-ana', args: { currency: 'USD', date: '2031-06-01', rate_micro: 912500 } }, reponse: { ok: true, currency: 'USD', date: '2031-06-01', rate_micro: 912500 } },
      { requete: { op: 'set_rate', actor: 'm-ana', args: { currency: 'GBP', date: '2031-06-01', rate_micro: 1170000 } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.set_rate': ['admin'],
    'set_rate.effet': (ctx: PlatformContext): PlatformResponse => {
      const { currency, date, rate_micro } = ctx.args
      if (currency !== 'USD' || dateUtc(date) === null || !estEntier(rate_micro) || rate_micro < 1) return fail('INVALID_ARGUMENT')
      const table = ctx.donnee<Map<string, number>>(CLE_TAUX, () => new Map())
      if (table.has(String(date))) return fail('ALREADY_EXISTS')
      table.set(String(date), rate_micro)
      return succeed({ currency, date, rate_micro })
    },
  },
  grandeurs: ['currency', 'date', 'rate_micro'],
  questions_ouvertes: ["Q24 (provisoire) : pas de borne superieure pour rate_micro ; pas de taux EUR -> USD ; portefeuille et factures toujours en EUR"],
})

const P15_R2 = clause({
  id: 'P15.R2',
  enters: 'P15',
  text:
    "Taux applicable à un instant : l'entrée de la table de plus grande date <= la date CIVILE LOCALE du site (P9.R2) de " +
    "cet instant. Aucune entrée -> { ok: false, error: 'RATE_UNAVAILABLE' } pour l'opération qui en a besoin.",
  contract: {
    erreurs: ['RATE_UNAVAILABLE'],
    valeurs: { date_du_taux: "'AAAA-MM-JJ', date civile LOCALE du site" },
    exemples: [
      { contexte: "taux du 01/06 et du 15/06 ; 'Europe/Paris'", calcul: '2031-06-14T21:59:00Z = 23:59 locale le 14/06 -> taux du 01/06 ; 2031-06-14T22:00:00Z = 00:00 le 15/06 -> taux du 15/06' },
    ],
  },
  implementation: {
    'devise.taux_applicable': ((ctx, t) => {
      const jour = new Date(murale(ctx, t)).toISOString().slice(0, 10)
      let meilleure: string | undefined
      const table = ctx.donnee<Map<string, number>>(CLE_TAUX, () => new Map())
      for (const d of table.keys()) if (d <= jour && (meilleure === undefined || d > meilleure)) meilleure = d
      return meilleure === undefined ? undefined : table.get(meilleure)
    }) satisfies TauxApplicable,
  },
  grandeurs: ['rate_micro', 'date', 'at'],
})

const P15_R3 = clause({
  id: 'P15.R3',
  enters: 'P15',
  text:
    "Conversion USD -> EUR, déclarée : eur_cents = usd_cents × rate_micro / 1 000 000 arrondi au centime le plus proche, et " +
    "à égalité exacte (demi-centime) vers le centime PAIR (arrondi bancaire). Calcul exact en entiers : N = usd_cents × " +
    "rate_micro ; q = floor(N / 10^6), r = N - q × 10^6 ; 2r > 10^6 -> q + 1 ; 2r < 10^6 -> q ; 2r = 10^6 -> q si q pair, " +
    'q + 1 si q impair.',
  contract: {
    valeurs: { arrondi: 'demi au pair (bancaire), au centime', formule: 'N = usd_cents x rate_micro ; q = floor(N / 10^6) ; r = N - q x 10^6' },
    exemples: [
      { calcul: '1000 USD-cents a 912500 : 912,5 -> 912 (912 pair)' },
      { calcul: '3000 USD-cents a 912500 : 2737,5 -> 2738 (2737 impair)' },
      { calcul: '1499 USD-cents a 925000 : 1386,575 -> 1387' },
    ],
  },
  implementation: {
    'devise.conversion': ((usd, rate) => {
      const N = usd * rate
      const q = Math.floor(N / 1_000_000)
      const r2 = 2 * (N - q * 1_000_000)
      return r2 > 1_000_000 ? q + 1 : r2 < 1_000_000 ? q : q % 2 === 0 ? q : q + 1
    }) satisfies Conversion,
  },
  grandeurs: ['rate_micro', 'credited_cents', 'amount_cents', 'original_amount_cents'],
})

const P15_R4 = clause({
  id: 'P15.R4',
  enters: 'P15',
  replaces: 'P8.R1',
  text:
    "Portefeuille (remplace P8.R1). Chaque membre a, dans chaque locataire, un portefeuille balance_cents en centimes " +
    "d'EUR (entier >= 0, initialement 0). top_up { member_id, amount_cents, currency? } (rôles admin, staff) : amount_cents " +
    "entier > 0 (centimes de currency) et currency absente, 'EUR' ou 'USD', sinon { ok: false, error: 'INVALID_ARGUMENT' } ; " +
    "member_id non membre du locataire -> { ok: false, error: 'NOT_FOUND' } ; en USD, sans taux applicable (P15.R2) -> " +
    "{ ok: false, error: 'RATE_UNAVAILABLE' }, sinon credited_cents = conversion P15.R3 de amount_cents au taux applicable " +
    "à at ; en EUR credited_cents = amount_cents. Réponse { ok: true, member_id, balance_cents (après crédit), " +
    "credited_cents, currency, rate_micro (USD seulement) }. get_wallet { member_id } : admin et staff pour tout membre ; " +
    "member pour lui-même seulement (sinon FORBIDDEN) ; member_id non membre -> NOT_FOUND ; réponse { ok: true, member_id, " +
    'balance_cents }.',
  contract: {
    operations: {
      top_up: {
        roles_autorises: ['admin', 'staff'],
        arguments: { member_id: 'chaine', amount_cents: 'entier > 0 (centimes de currency)', currency: "'EUR' (defaut) | 'USD'" },
        reponse: { ok: true, member_id: 'chaine', balance_cents: 'entier', credited_cents: 'entier', currency: 'chaine', rate_micro: 'entier (USD)' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'NOT_FOUND', 'RATE_UNAVAILABLE'],
      },
      get_wallet: {
        roles_autorises: ['admin', 'staff', 'member:soi'],
        arguments: { member_id: 'chaine' },
        reponse: { ok: true, member_id: 'chaine', balance_cents: 'entier >= 0' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND'],
      },
    },
    exemples: [
      { contexte: 'taux 912500, solde 840', requete: { op: 'top_up', actor: 'm-sam', args: { member_id: 'm-dan', amount_cents: 1000, currency: 'USD' } }, reponse: { ok: true, member_id: 'm-dan', currency: 'USD', rate_micro: 912500, credited_cents: 912, balance_cents: 1752 } },
      { requete: { op: 'top_up', actor: 'm-sam', args: { member_id: 'm-fay', amount_cents: 500, currency: 'GBP' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.top_up': ['admin', 'staff'],
    'autorisation.get_wallet': ['admin', 'staff', 'member'],
    'portefeuille.solde': soldePortefeuille,
    'portefeuille.mouvement': mouvementPortefeuille,
    'top_up.effet': (ctx: PlatformContext): PlatformResponse => {
      const { member_id, amount_cents } = ctx.args
      const currency = ctx.args.currency ?? 'EUR'
      if (!estEntier(amount_cents) || amount_cents <= 0 || typeof currency !== 'string' || !(DEVISES as readonly string[]).includes(currency)) {
        return fail('INVALID_ARGUMENT')
      }
      if (ctx.role(member_id) === undefined) return fail('NOT_FOUND')
      let credited_cents = amount_cents
      let rate_micro: number | undefined
      if (currency === 'USD') {
        rate_micro = ctx.regle<TauxApplicable>('devise.taux_applicable')(ctx, ctx.instant)
        if (rate_micro === undefined) return fail('RATE_UNAVAILABLE')
        credited_cents = ctx.regle<Conversion>('devise.conversion')(amount_cents, rate_micro)
      }
      const balance_cents = ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, String(member_id), credited_cents)
      ctx.journaliser({ type: 'top_up', member_id: String(member_id), booking_id: null, amount_cents: credited_cents, credits_cents: credited_cents, card_cents: 0 })
      return succeed({ member_id, balance_cents, credited_cents, currency, ...(rate_micro === undefined ? {} : { rate_micro }) })
    },
    'get_wallet.etape.soi': etape(5, soiSeulement((ctx) => String(ctx.args.member_id))),
    'get_wallet.effet': (ctx: PlatformContext): PlatformResponse => {
      const member_id = ctx.args.member_id
      if (ctx.role(member_id) === undefined) return fail('NOT_FOUND')
      return succeed({ member_id, balance_cents: ctx.regle<Solde>('portefeuille.solde')(ctx, String(member_id)) })
    },
  },
  grandeurs: ['member_id', 'balance_cents', 'credited_cents', 'currency', 'rate_micro'],
})

const P15_R5 = clause({
  id: 'P15.R5',
  enters: 'P15',
  replaces: 'P7.R1',
  text:
    "Prix en devise (remplace P7.R1). set_price { slot_id, price_cents, currency? } (rôle admin seulement) fixe le prix PAR " +
    "PLACE du créneau en centimes entiers >= 0 de currency ('EUR' par défaut, ou 'USD' ; autre -> INVALID_ARGUMENT) ; " +
    "réponse { ok: true, slot_id, price_cents, currency }. slot_id inconnu -> NOT_FOUND ; price_cents qui n'est pas un " +
    "entier >= 0 -> INVALID_ARGUMENT. Tout créneau a le prix 0 EUR tant qu'aucun prix n'est fixé.",
  contract: {
    operations: {
      set_price: {
        roles_autorises: ['admin'],
        arguments: { slot_id: 'chaine', price_cents: 'entier >= 0 (centimes de currency, par place)', currency: "'EUR' (defaut) | 'USD'" },
        reponse: { ok: true, slot_id: 'chaine', price_cents: 'entier', currency: 'chaine' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { prix_par_defaut: '0 EUR' },
    exemples: [{ requete: { op: 'set_price', actor: 'm-ana', args: { slot_id: 'S22', price_cents: 1999, currency: 'USD' } }, reponse: { ok: true, slot_id: 'S22', price_cents: 1999, currency: 'USD' } }],
  },
  implementation: {
    'autorisation.set_price': ['admin'],
    'tarif.prix': (_ctx: PlatformContext, slot: Slot | undefined): number => slot?.price_cents ?? 0,
    'tarif.devise': ((_ctx, slot) => slot?.price_currency ?? 'EUR') satisfies Devise,
    'set_price.effet': (ctx: PlatformContext): PlatformResponse => {
      const slot = ctx.locataire.slots.get(String(ctx.args.slot_id))
      if (slot === undefined) return fail('NOT_FOUND')
      const p = ctx.args.price_cents
      const currency = ctx.args.currency ?? 'EUR'
      if (!estEntier(p) || p < 0 || typeof currency !== 'string' || !(DEVISES as readonly string[]).includes(currency)) return fail('INVALID_ARGUMENT')
      slot.price_cents = p
      slot.price_currency = currency
      return succeed({ slot_id: slot.slot_id, price_cents: p, currency })
    },
  },
  grandeurs: ['slot_id', 'price_cents', 'currency'],
  unites: { price_cents: PRIX_EN_DEVISE },
  questions_ouvertes: [
    "Q27 (provisoire, exercee) : set_price (P15.R5) et change_price (P16.R1) gouvernent des decisions distinctes (set_price.effet, change_price.effet) qui ecrivent le meme prix du creneau pour les confirmations futures",
    "Q28 (provisoire) : get_slot ne porte ni price_cents ni price_currency",
  ],
})

const P15_R6 = clause({
  id: 'P15.R6',
  enters: 'P15',
  replaces: 'P7.R3',
  text:
    "Montant (remplace P7.R3). Fixé à l'instant où la réservation devient 'confirmed', avec le prix, la devise du prix et " +
    "le niveau de CET instant : brut = seats × price_cents ; remise = floor((brut × taux + 5000) / 10000) (taux en points " +
    "de base : none 0, silver 1000, gold 2500 ; demi vers le haut, sur la remise, sur le brut total) ; net = brut - remise, " +
    "dans la devise du prix. Prix en EUR : amount_cents = net. Prix en USD : amount_cents = conversion P15.R3 de net au " +
    "taux applicable (P15.R2) à l'instant de la confirmation (réservation ou promotion) ; la réservation porte alors " +
    "price_currency 'USD', original_amount_cents = net (centimes d'USD) et rate_micro. amount_cents est toujours en " +
    "centimes d'EUR ; tout remboursement se calcule sur amount_cents, sans reconversion. Réserver un créneau en USD sans " +
    "taux applicable -> { ok: false, error: 'RATE_UNAVAILABLE' } (contrôle placé juste avant l'admission, mémorisé) ; une " +
    "réservation en file d'un tel créneau ne tient pas tant qu'aucun taux ne s'applique. Un changement ultérieur de prix, " +
    "de niveau ou de taux ne modifie pas un montant fixé (sauf P16). Les réservations confirmées avant P7 ont amount_cents " +
    '0 ; une réservation waiting n\'a pas de montant : reserve et get_booking portent amount_cents si status != waiting.',
  contract: {
    operations: {
      reserve: {
        erreurs: ['RATE_UNAVAILABLE'],
        reponse: { amount_cents: "entier (EUR), si status != 'waiting'", price_currency: "'USD'", original_amount_cents: 'entier (USD)', rate_micro: 'entier' },
      },
      get_booking: { reponse: { amount_cents: 'entier (EUR)', price_currency: "'USD'", original_amount_cents: 'entier (USD)', rate_micro: 'entier' } },
    },
    valeurs: { formule_remise: 'floor((brut*taux_bp + 5000) / 10000)', conversion: 'P15.R3' },
    exemples: [
      {
        contexte: 'S22 a 1999 USD-cents, m-cleo gold, taux 925000',
        requete: { op: 'reserve', args: { request_id: 'w-c', member_id: 'm-cleo', slot_id: 'S22' } },
        reponse: { ok: true, booking_id: 'w-c', status: 'confirmed', price_currency: 'USD', original_amount_cents: 1499, rate_micro: 925000, amount_cents: 1387 },
      },
    ],
  },
  implementation: {
    'tarif.montant': ((ctx, t) => {
      const brut = t.seats * t.prix
      const net = brut - Math.floor((brut * t.taux_bp + 5000) / 10000)
      if (t.devise !== 'USD') return { amount_cents: net, net }
      if (t.rate_micro === undefined) throw new Error('TAUX-ABSENT a la confirmation')
      return { amount_cents: ctx.regle<Conversion>('devise.conversion')(net, t.rate_micro), net }
    }) satisfies Montant,
    'reservation.montant': (ctx: PlatformContext, b: Booking): number => {
      const slot = ctx.locataire.slots.get(b.slot_id)
      const devise = ctx.regle<Devise>('tarif.devise')(ctx, slot)
      const taux_bp = ctx.regle<(ctx: PlatformContext, m: string) => number>('tarif.taux_remise')(ctx, b.member_id)
      const rate_micro = devise === 'USD' ? ctx.regle<TauxApplicable>('devise.taux_applicable')(ctx, ctx.instant) : undefined
      const prix = ctx.regle<(ctx: PlatformContext, s: Slot | undefined) => number>('tarif.prix')(ctx, slot)
      const { amount_cents, net } = ctx.regle<Montant>('tarif.montant')(ctx, { seats: b.seats, prix, devise, taux_bp, ...(rate_micro === undefined ? {} : { rate_micro }) })
      b.discount_bp = taux_bp
      if (devise === 'USD') {
        b.price_currency = 'USD'
        b.original_amount_cents = net
        if (rate_micro !== undefined) b.rate_micro = rate_micro
      }
      return amount_cents
    },
    'vue.reservation.montant': ((_ctx, b, champs) => {
      if (b.status !== 'waiting') champs.amount_cents = b.amount_cents ?? 0
    }) satisfies Vue<Booking>,
    'vue.reservation.devise': ((_ctx, b, champs) => {
      if (b.status === 'waiting' || b.price_currency !== 'USD') return
      champs.price_currency = b.price_currency
      champs.original_amount_cents = b.original_amount_cents
      champs.rate_micro = b.rate_micro
    }) satisfies Vue<Booking>,
    'reserve.etape.taux': etape(55, (ctx) => {
      const slot = slotDe(ctx)
      if (ctx.regle<Devise>('tarif.devise')(ctx, slot) !== 'USD') return undefined
      return ctx.regle<TauxApplicable>('devise.taux_applicable')(ctx, ctx.instant) === undefined ? fail('RATE_UNAVAILABLE') : undefined
    }),
    'promotion.condition.taux': ((ctx, slot) =>
      ctx.regle<Devise>('tarif.devise')(ctx, slot) !== 'USD' ||
      ctx.regle<TauxApplicable>('devise.taux_applicable')(ctx, ctx.instant) !== undefined) satisfies ConditionPromotion,
  },
  grandeurs: ['amount_cents', 'price_cents', 'seats', 'discount_bp', 'price_currency', 'original_amount_cents', 'rate_micro'],
  unites: { price_cents: PRIX_EN_DEVISE },
  questions_ouvertes: [
    "Q23 (provisoire) : une reservation en file d'un creneau en USD ne tient pas tant qu'aucun taux ne s'applique ; une reservation directe rend RATE_UNAVAILABLE (memorise)",
  ],
})

/* ═══════════════════════════════════════════════════════════════════ P16 */

interface Ajustement {
  readonly booking_id: string
  readonly refunded_cents: number
  readonly refund: { credits_cents: number; card_cents: number }
  readonly credit_note_id: string | null
}
type TropPercus = (ctx: PlatformContext, slot: Slot, effective_from: number) => Ajustement[]
type DocumentTropPercu = (ctx: PlatformContext, b: Booking, T: number, rc: number) => string | null

const P16_R1 = clause({
  id: 'P16.R1',
  enters: 'P16',
  text:
    "Changement de prix RÉTROACTIF. change_price { slot_id, price_cents, effective_from } (rôle admin seulement). Contrôles " +
    "après ceux d'acteur, dans cet ordre : slot_id inconnu -> { ok: false, error: 'NOT_FOUND' } ; price_cents entier >= 0 " +
    "(centimes de la devise du prix), sinon { ok: false, error: 'INVALID_ARGUMENT' } ; effective_from instant ISO 8601 UTC " +
    "'AAAA-MM-JJTHH:MM:SSZ' et <= at, sinon { ok: false, error: 'INVALID_ARGUMENT' } (un changement futur passe par " +
    "set_price). Effet : le prix du créneau devient price_cents (devise inchangée) pour toute confirmation FUTURE " +
    "(réservation ou promotion après cette opération), et les trop-perçus sont rendus (P16.R2). Réponse { ok: true, " +
    "slot_id, price_cents, adjusted } où adjusted liste, dans l'ordre de confirmation, { booking_id, refunded_cents, " +
    'refund: { credits_cents, card_cents }, credit_note_id } des réservations ajustées.',
  contract: {
    operations: {
      change_price: {
        roles_autorises: ['admin'],
        arguments: { slot_id: 'chaine', price_cents: 'entier >= 0', effective_from: "'AAAA-MM-JJTHH:MM:SSZ' <= at" },
        reponse: { ok: true, slot_id: 'chaine', price_cents: 'entier', adjusted: 'tableau de { booking_id, refunded_cents, refund: { credits_cents, card_cents }, credit_note_id }' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
      },
    },
    exemples: [
      { contexte: 'at 2031-07-08T09:01:00Z', requete: { op: 'change_price', actor: 'm-ana', args: { slot_id: 'S23', price_cents: 1600, effective_from: '2031-07-09T00:00:00Z' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { contexte: 'hausse', requete: { op: 'change_price', actor: 'm-ana', args: { slot_id: 'S23', price_cents: 2400, effective_from: '2031-06-01T00:00:00Z' } }, reponse: { ok: true, slot_id: 'S23', price_cents: 2400, adjusted: [] } },
    ],
  },
  implementation: {
    'autorisation.change_price': ['admin'],
    'change_price.effet': (ctx: PlatformContext): PlatformResponse => {
      const slot = ctx.locataire.slots.get(String(ctx.args.slot_id))
      if (slot === undefined) return fail('NOT_FOUND')
      const { price_cents, effective_from } = ctx.args
      if (!estEntier(price_cents) || price_cents < 0) return fail('INVALID_ARGUMENT')
      if (!estInstant(effective_from) || Date.parse(effective_from) > ctx.instant) return fail('INVALID_ARGUMENT')
      slot.price_cents = price_cents
      const adjusted = ctx.regle<TropPercus>('tarif.trop_percus')(ctx, slot, Date.parse(effective_from))
      return succeed({ slot_id: slot.slot_id, price_cents, adjusted })
    },
  },
  grandeurs: ['slot_id', 'price_cents', 'effective_from', 'adjusted', 'at'],
  unites: { price_cents: PRIX_EN_DEVISE },
})

const P16_R2 = clause({
  id: 'P16.R2',
  enters: 'P16',
  text:
    "Trop-perçus. Pour chaque réservation 'confirmed' du créneau dont l'instant de confirmation est >= effective_from " +
    "(borne incluse), dans l'ordre de confirmation : A' = montant recalculé par P15.R6 pour ses seats ACTUELS, avec le " +
    "nouveau prix mais le niveau (taux de remise) et, en USD, le rate_micro de SA confirmation. Si A' < A (amount_cents " +
    "actuel) : trop-perçu T = A - A' ; r_c = floor(T × C / A), r_d = T - r_c (C = paid_credits_cents, D = paid_card_cents) ; " +
    "r_c re-crédité au portefeuille, r_d rendu à la carte ; la réservation garde A', C - r_c, D - r_d. Si A' >= A : rien " +
    "(une hausse ne s'applique qu'aux confirmations futures). Les réservations confirmées avant effective_from, waiting, " +
    'annulées ou débarquées ne changent pas. Montants en centimes d\'euro entiers.',
  contract: {
    valeurs: { borne_effective_from: 'incluse', arrondi_part_credits: 'floor, la carte recoit le reste' },
    operations: { change_price: { adjusted: { refunded_cents: 'T = A - A\'', refund: { credits_cents: 'r_c', card_cents: 'r_d' } } } },
    exemples: [
      { contexte: "y2 : silver, A 1800, C 88, D 1712, confirmee a effective_from ; nouveau prix 1600", calcul: "A' = 1600 - 160 = 1440 ; T = 360 ; r_c = floor(360 x 88 / 1800) = 17 ; r_d = 343" },
    ],
  },
  implementation: {
    'tarif.trop_percus': ((ctx, slot, effective_from) => {
      const devise = ctx.regle<Devise>('tarif.devise')(ctx, slot)
      const prix = ctx.regle<(ctx: PlatformContext, s: Slot | undefined) => number>('tarif.prix')(ctx, slot)
      const concernees = [...ctx.locataire.bookings.values()]
        .filter((b) => b.slot_id === slot.slot_id && b.status === 'confirmed' && b.confirmed_at !== undefined && Date.parse(b.confirmed_at) >= effective_from)
        .sort((a, b) => (a.confirmation_seq ?? a.seq) - (b.confirmation_seq ?? b.seq))
      const out: Ajustement[] = []
      for (const b of concernees) {
        const A = b.amount_cents ?? 0
        const taux_bp = b.discount_bp ?? ctx.regle<(ctx: PlatformContext, m: string) => number>('tarif.taux_remise')(ctx, b.member_id)
        const { amount_cents: A2 } = ctx.regle<Montant>('tarif.montant')(ctx, {
          seats: b.seats, prix, devise: b.price_currency ?? devise, taux_bp, ...(b.rate_micro === undefined ? {} : { rate_micro: b.rate_micro }),
        })
        if (A2 >= A) continue
        const T = A - A2
        const C = b.paid_credits_cents ?? 0
        const D = b.paid_card_cents ?? A - C
        const rc = Math.floor((T * C) / A)
        b.amount_cents = A2
        b.paid_credits_cents = C - rc
        b.paid_card_cents = D - (T - rc)
        const credit_note_id = ctx.regle<DocumentTropPercu>('comptabilite.trop_percu')(ctx, b, T, rc)
        out.push({ booking_id: b.booking_id, refunded_cents: T, refund: { credits_cents: rc, card_cents: T - rc }, credit_note_id })
      }
      return out
    }) satisfies TropPercus,
  },
  grandeurs: ['effective_from', 'amount_cents', 'paid_credits_cents', 'paid_card_cents', 'refunded_cents', 'refund.credits_cents', 'refund.card_cents', 'balance_cents'],
  questions_ouvertes: [
    "Q25 (provisoire) : A' est recalcule sur les seats ACTUELS, meme pour une reservation deja partiellement annulee avec palier < 100 %",
    "Q26 (provisoire) : sur un creneau en USD, A' utilise le rate_micro de la confirmation de la reservation",
  ],
})

const P16_R3 = clause({
  id: 'P16.R3',
  enters: 'P16',
  text:
    "Document d'un trop-perçu : si la charge de la réservation appartient à un mois déjà facturé, un avoir (P14.R4) de " +
    "reason 'price_change' et amount_cents = T ; sinon une ligne de type 'adjustment' { type: 'adjustment', booking_id, " +
    "amount_cents = T } du mois où a lieu le changement, comptée dans refunds_cents, card_cents et credits_used_cents comme " +
    'un remboursement (P14.R3). credit_note_id de adjusted vaut l\'avoir ou null.',
  contract: {
    ligne: { type: "'adjustment'", booking_id: 'chaine', amount_cents: 'T' },
    avoir: { reason: "'price_change'", amount_cents: 'T' },
    operations: { change_price: { adjusted: { credit_note_id: "'AV-nnnn' | null" } } },
    exemples: [
      {
        requete: { op: 'change_price', actor: 'm-ana', args: { slot_id: 'S23', price_cents: 1600, effective_from: '2031-06-20T10:00:00Z' } },
        reponse: { ok: true, slot_id: 'S23', price_cents: 1600, adjusted: [{ booking_id: 'y2', refunded_cents: 360, refund: { credits_cents: 17, card_cents: 343 }, credit_note_id: 'AV-0003' }, { booking_id: 'y3', refunded_cents: 600, refund: { credits_cents: 547, card_cents: 53 }, credit_note_id: null }] },
      },
    ],
  },
  implementation: {
    'comptabilite.trop_percu': ((ctx, b, T, rc) => inscrireRemboursement(ctx, b, T, rc, 'price_change', 'adjustment')) satisfies DocumentTropPercu,
  },
  grandeurs: ['credit_note_id', 'lines.amount_cents', 'refunds_cents', 'reason'],
})

/** La source unique de clauses de F-PLATFORM, P1 à P16, dans l'ordre d'entrée. */
export const PLATFORM_CLAUSES: readonly PlatformClause[] = Object.freeze([
  P1_R1, P1_R2, P1_R3, P1_R4, P1_R5, P1_R6, P1_R7,
  P2_R1, P2_R2, P2_R3, P2_R4,
  P3_R1, P3_R2, P3_R3,
  P4_R1, P4_R2, P4_R3, P4_R4,
  P5_R1, P5_R2, P5_R3,
  P6_R1, P6_R2, P6_R3, P6_R4,
  P7_R1, P7_R2, P7_R3, P7_R4, P7_R5,
  P8_R1, P8_R2, P8_R3, P8_R4,
  P9_R1, P9_R2, P9_R3, P9_R4,
  P10_R1, P10_R2, P10_R3,
  P11_R1, P11_R2, P11_R3, P11_R4, P11_R5,
  P12_R1,
  P13_R1, P13_R2, P13_R3,
  P14_R1, P14_R2, P14_R3, P14_R4, P14_R5, P14_R6,
  P15_R1, P15_R2, P15_R3, P15_R4, P15_R5, P15_R6,
  P16_R1, P16_R2, P16_R3,
])
