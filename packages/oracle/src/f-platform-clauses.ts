// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — LA source de clauses de F-PLATFORM, périodes P1 à P8 (tâche
// T70, ADR-021 décision 1 : « le scénario est écrit une seule fois, sous forme
// de clauses »).
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
// (`periodes.<Pn>.regles`), une clause par règle, mêmes identifiants, mêmes
// remplacements. Le moteur (f-platform-engine.ts) ne contient aucune règle.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Booking,
  type Etape,
  type Implementation,
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
  status: { unit: 'enumeration', format: "'confirmed' | 'waiting' | 'cancelled'" },
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
}

interface ClauseSpec {
  readonly id: string
  readonly enters: string
  readonly exits?: string
  readonly replaces?: string
  readonly text: string
  readonly contract: Json
  readonly implementation: Implementation
  readonly grandeurs: readonly string[]
  readonly questions_ouvertes?: readonly string[]
}

function clause(s: ClauseSpec): PlatformClause {
  const quantities: Record<string, Quantity> = {}
  for (const g of s.grandeurs) {
    const q = PLATFORM_QUANTITIES[g]
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
    'reservation.paiement': (_ctx: PlatformContext, b: Booking): void => {
      b.paid_credits_cents = 0
      b.paid_card_cents = b.amount_cents ?? 0
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
    'portefeuille.solde': ((ctx, member) => ctx.locataire.wallets.get(member) ?? 0) satisfies Solde,
    'portefeuille.mouvement': ((ctx, member, delta) => {
      const solde = (ctx.locataire.wallets.get(member) ?? 0) + delta
      if (solde < 0) throw new Error(`PORTEFEUILLE-NEGATIF ${member}`)
      ctx.locataire.wallets.set(member, solde)
      return solde
    }) satisfies Mouvement,
    'top_up.effet': (ctx: PlatformContext): PlatformResponse => {
      const { member_id, amount_cents } = ctx.args
      if (!estEntier(amount_cents) || amount_cents <= 0) return fail('INVALID_ARGUMENT')
      if (ctx.role(member_id) === undefined) return fail('NOT_FOUND')
      const balance_cents = ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, String(member_id), amount_cents)
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

/** La source unique de clauses de F-PLATFORM, P1 à P8, dans l'ordre d'entrée. */
export const PLATFORM_CLAUSES: readonly PlatformClause[] = Object.freeze([
  P1_R1, P1_R2, P1_R3, P1_R4, P1_R5, P1_R6, P1_R7,
  P2_R1, P2_R2, P2_R3, P2_R4,
  P3_R1, P3_R2, P3_R3,
  P4_R1, P4_R2, P4_R3, P4_R4,
  P5_R1, P5_R2, P5_R3,
  P6_R1, P6_R2, P6_R3, P6_R4,
  P7_R1, P7_R2, P7_R3, P7_R4, P7_R5,
  P8_R1, P8_R2, P8_R3, P8_R4,
])
