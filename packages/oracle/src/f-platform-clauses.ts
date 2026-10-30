// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — LA source de clauses de F-PLATFORM, périodes P1 à P24 (tâches
// T70 pour P1-P8, T71 pour P9-P16, T72 pour P17-P24 ; ADR-021 décision 1 : « le
// scénario est écrit une seule fois, sous forme de clauses »).
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
//   precisions                    — les précisions de la règle dans la racine
//                                   (passe de clarification : questions T70-xx,
//                                   Qnn, N-0n tranchées ; décisions du mandant
//                                   du 27/10/2026 : Q38, Q63, Q64, Q65, avec leur
//                                   origine), recopiées mot pour mot ;
//   questions_ouvertes            — ce que la racine gelée laisse ouvert (plus
//                                   rien : Q38 est tranchée par le mandant).
//
// Les règles sont celles de acceptance/reference-platform/F-PLATFORM-P1-P8.json,
// F-PLATFORM-P9-P16.json et F-PLATFORM-P17-P24.json (`periodes.<Pn>.regles`),
// une clause par règle, mêmes identifiants, mêmes remplacements ; une clause
// remplacée sort à l'entrée de sa remplaçante (T72 : P1.R4 sort à P21, P14.R3 et
// P15.R6 à P22 ; clarification : P5.R1 sort à P9, où P9.R5 la remplace). Le
// moteur (f-platform-engine.ts) ne contient aucune règle, pas même l'instant et
// le rang de confirmation (P1.R3). Les questions T70-01..T70-16, Q01-Q61 et
// N-01..N-04 sont tranchées par la passe de clarification : les règles réécrites
// portent le texte de la racine, et chaque clause ses `precisions`. Q38, Q63,
// Q64 et Q65 sont tranchées par la décision du mandant du 27/10/2026 (P18.R1,
// P22.R2, P22.R4 ; P16.R1, P16.R2 ; P17.R1 ; P8.R4).
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Booking,
  type Complement,
  type Etape,
  type Invariant,
  type Implementation,
  type JournalEntry,
  type Json,
  type PlatformClause,
  type Precision,
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
  capacity: { unit: 'places', format: 'entier de 1 a 10 000' },
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
  rate_micro: { unit: 'EUR pour 1 USD x 1 000 000', format: 'entier de 1 a 10 000 000 (912500 = 0,9125 EUR par USD)' },
  credited_cents: { unit: CENTIMES, format: 'entier > 0, montant credite en EUR apres conversion P15.R3' },
  original_amount_cents: { unit: 'centimes de dollar US', format: 'entier >= 0, montant net avant conversion' },
  effective_from: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', <= at" },
  adjusted: { unit: 'ajustements', format: "tableau JSON de { booking_id, refunded_cents, refund, credit_note_id }, ordre de confirmation" },
  // ── P17 à P24 (T72)
  source_tenant_id: { unit: IDENT, format: 'tenant_id du locataire absorbe par la fusion' },
  renamed: { unit: 'renommages', format: "tableau JSON de { kind, from, to }, to = '<source_tenant_id>:<from>' ; kind 'slot', 'series', 'booking', 'request', 'import', 'pseudonym' dans cet ordre, puis from croissant (ordinal UTF-16)" },
  merged_members: { unit: 'liste de member_id', format: 'tableau JSON de chaines, ordre croissant (ordinal UTF-16)' },
  added_members: { unit: 'liste de member_id', format: 'tableau JSON de chaines, ordre croissant (ordinal UTF-16)' },
  origin: { unit: 'origine de reservation', format: '{ tenant_id, booking_id } du locataire et de la reservation de creation' },
  credit_note_ids: { unit: 'liste de credit_note_id', format: 'tableau JSON de chaines, ordre croissant' },
  bookings_anonymized: { unit: 'reservations', format: 'entier >= 0' },
  from: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', borne incluse" },
  to: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', borne exclue" },
  min_fill_bp: { unit: 'points de base (10000 = 100 %)', format: 'entier >= 0, 0 par defaut, borne incluse' },
  fill_bp: { unit: 'points de base (10000 = 100 %)', format: 'entier : floor(booked x 10000 / capacity), peut depasser 10000' },
  sort: { unit: 'cle de tri', format: "occupation : 'starts_at' | '-fill_bp' | 'slot_id' ; revenus : 'month' | '-net_cents' | 'member_id' ('-' = decroissant)" },
  page: { unit: 'rang de page', format: 'entier >= 1, 1-base, 1 par defaut' },
  page_size: { unit: 'lignes par page', format: 'entier de 1 a 100, 20 par defaut' },
  pages: { unit: 'pages', format: 'entier : ceil(total / page_size), 0 si total = 0' },
  total: { unit: 'lignes', format: 'entier >= 0, nombre de lignes (apres filtre pour un rapport)' },
  rows: { unit: 'lignes', format: "tableau JSON d'objets, dans l'ordre declare" },
  from_month: { unit: 'mois civil LOCAL du site', format: "'AAAA-MM', borne incluse" },
  to_month: { unit: 'mois civil LOCAL du site', format: "'AAAA-MM', borne incluse" },
  credit_notes_cents: { unit: CENTIMES, format: 'entier >= 0, somme des amount_cents des avoirs citant la facture' },
  net_cents: { unit: CENTIMES, format: 'entier signe : total_cents - credit_notes_cents' },
  sum_net_cents: { unit: CENTIMES, format: 'entier signe : somme des net_cents de toutes les lignes filtrees' },
  import_id: { unit: IDENT, format: 'chaine non vide fournie par le client' },
  accepted: { unit: 'reservations', format: 'entier >= 0 : confirmed + waiting' },
  confirmed: { unit: 'reservations', format: 'entier >= 0' },
  'import_bookings.waiting': { unit: 'reservations', format: 'entier >= 0 (champ waiting de la reponse d import)' },
  duplicates: { unit: 'lignes', format: 'entier >= 0' },
  rejected: { unit: 'lignes refusees', format: 'tableau JSON de { index, request_id, error }, ordre des lignes' },
  index: { unit: 'rang de ligne', format: 'entier >= 1, 1-base' },
  plafond_p95_ms: { unit: 'millisecondes (ms)', format: 'entier, latence au 95e centile par operation' },
  duree_import_ms: { unit: 'millisecondes (ms)', format: "entier, duree d'un import de 50 000 lignes" },
  acquired_at: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', at de l'operation qui credite" },
  expires_at: { unit: 'instant UTC', format: "ISO 8601 'AAAA-MM-JJTHH:MM:SSZ', meme instant 12 mois civils apres acquired_at" },
  remaining_cents: { unit: CENTIMES, format: 'entier > 0, reste du lot' },
  lots: { unit: 'lots de credits', format: 'tableau JSON de { acquired_at, expires_at, remaining_cents }, expires_at croissant puis ordre d entree' },
  expired_cents: { unit: CENTIMES, format: 'entier >= 0, somme des lignes expiry du mois' },
  wallet_refunds_cents: { unit: CENTIMES, format: "entier >= 0, somme des lignes wallet_refund du mois (remboursement du portefeuille a l'effacement, P18.R1)" },
  to_member_id: { unit: IDENT, format: 'member_id du destinataire' },
  with_booking_id: { unit: IDENT, format: "booking_id de l'autre reservation de l'echange" },
  fee_cents: { unit: CENTIMES, format: 'entier : 0 si A = 0, sinon max(100, floor((A x 1000 + 5000) / 10000))' },
  'fee.credits_cents': { unit: CENTIMES, format: 'entier >= 0, part des frais payee en credits' },
  'fee.card_cents': { unit: CENTIMES, format: 'entier >= 0, part des frais payee par carte' },
  payer_member_id: { unit: IDENT, format: 'member_id debite a la confirmation, ou null si jamais confirmee' },
  transfers: { unit: 'transferts', format: 'tableau JSON de { from_member_id, to_member_id, at, fee_cents }, ordre des transferts' },
  exchanged: { unit: 'echange', format: 'tableau JSON de deux { booking_id, member_id, fee_cents }' },
  version: { unit: 'version du contrat', format: "'v1' | 'v2' ('v1' par defaut), hors args" },
  reservation_id: { unit: IDENT, format: 'v2 : nom de booking_id' },
  session_id: { unit: IDENT, format: 'v2 : nom de slot_id' },
  session_ids: { unit: 'liste ordonnee de slot_id', format: 'v2 : nom de slot_ids' },
  quantity: { unit: 'places', format: 'v2 : nom de seats' },
  with_reservation_id: { unit: IDENT, format: 'v2 : nom de with_booking_id' },
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

/**
 * Précisions de la passe de clarification (racines gelées, `regles[].precisions`), recopiées mot pour mot :
 * chaque clause porte celles de sa règle (champ `precisions`).
 */
const PRECISIONS: Readonly<Record<string, readonly Precision[]>> = {
  'P1.R1': [
    { question: 'T70-01', classe: 'GARDER', texte: "create_slot contrôle d'abord ses arguments : slot_id absent ou vide, capacity non entière ou < 1, ou starts_at hors de la forme 'AAAA-MM-JJTHH:MM:SSZ' -> INVALID_ARGUMENT ; ensuite seulement, un slot_id déjà pris -> ALREADY_EXISTS." },
    { question: 'T70-02', classe: 'CHANGER', texte: "INVALID_ARGUMENT est un code introduit des P1 (codes_erreur_introduits de P1, et non plus de P8) : create_slot (P1.R1) l'emploie des P1, seats (P6.R1) des P6." },
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
  ],
  'P1.R2': [
    { question: 'T70-03', classe: 'GARDER', texte: "La réponse de succès de reserve est la vue de la réservation, avec exactement les champs que get_booking rendrait à l'instant de la réponse ; un rejeu idempotent rend cette réponse mémorisée telle quelle." },
  ],
  'P1.R3': [
    { question: 'N-03', classe: 'FIXER', texte: "L'instant de confirmation d'une réservation est le at de l'opération qui la rend 'confirmed' ; son rang de confirmation est l'ordre de ces passages le long de la trajectoire." },
  ],
  'P1.R8': [
    { question: 'Q60', classe: 'FIXER', texte: "Une opération dont le nom n'appartient pas au contrat en vigueur à la période -> { ok: false, error: 'INVALID_ARGUMENT' }, sans effet, non mémorisée. Ce contrôle passe avant tous les autres (avant le tenant ; à partir de P24, juste après celui de la version)." },
  ],
  'P2.R2': [
    { question: 'N-02', classe: 'FIXER', texte: "Une libération de places à un instant at >= starts_at du créneau (annulation tardive, totale ou partielle) ne promeut personne ; les réservations en file y restent jusqu'à close_slot, qui les expire." },
  ],
  'P3.R1': [
    { question: 'T70-04', classe: 'GARDER', texte: "create_tenant : tenant_id ou owner_id absent, vide ou non chaîne -> INVALID_ARGUMENT, contrôle fait avant ALREADY_EXISTS." },
  ],
  'P4.R1': [
    { question: 'T70-05', classe: 'CHANGER', texte: "add_member dont member_id est le propriétaire du locataire -> { ok: false, error: 'INVALID_ARGUMENT' }, sans effet : le propriétaire reste admin." },
    { question: 'T70-06', classe: 'GARDER', texte: "add_member : member_id absent ou vide, ou role hors de 'admin', 'staff', 'member' -> INVALID_ARGUMENT, contrôle fait après ceux d'acteur." },
  ],
  'P5.R1': [
    { question: 'T70-07', classe: 'GARDER', texte: "create_recurring : si series_id existe déjà dans le locataire, ou si le slot_id d'une seule de ses occurrences existe déjà -> ALREADY_EXISTS et rien n'est créé (tout ou rien)." },
    { question: 'T70-08', classe: 'GARDER', texte: "create_recurring : series_id vide, weekday hors 1..7, start_time hors 'HH:MM' (00:00 à 23:59), capacity non entière ou < 1, date mal formée ou from_date > until_date -> INVALID_ARGUMENT ; ce contrôle précède ALREADY_EXISTS." },
    { question: 'N-01', classe: 'FIXER', texte: "create_recurring dont la plage [from_date, until_date] ne contient aucun jour weekday -> INVALID_ARGUMENT, rien n'est créé." },
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
  ],
  'P5.R2': [
    { question: 'T70-09', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
    { question: 'Q04', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
  ],
  'P5.R3': [
    { question: 'T70-10', classe: 'GARDER', texte: "list_occurrences : series_id inconnu -> NOT_FOUND." },
  ],
  'P6.R1': [
    { question: 'T70-11', classe: 'CHANGER', texte: "INVALID_ARGUMENT etant introduit des P1, le refus de seats invalide (P6.R1) est permis des P6." },
  ],
  'P6.R4': [
    { question: 'N-02', classe: 'FIXER', texte: "Une libération de places à un instant at >= starts_at du créneau (annulation tardive, totale ou partielle) ne promeut personne ; les réservations en file y restent jusqu'à close_slot, qui les expire." },
  ],
  'P7.R1': [
    { question: 'T70-12', classe: 'GARDER', texte: "set_price : slot_id inconnu -> NOT_FOUND d'abord ; ensuite price_cents (et, à partir de P15, currency) invalide -> INVALID_ARGUMENT." },
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
  ],
  'P7.R2': [
    { question: 'T70-13', classe: 'GARDER', texte: "set_tier : member_id non membre du locataire -> NOT_FOUND d'abord ; ensuite tier hors de 'none', 'silver', 'gold' -> INVALID_ARGUMENT." },
  ],
  'P7.R5': [
    { question: 'T70-09', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
    { question: 'Q04', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
  ],
  'P8.R1': [
    { question: 'T70-14', classe: 'GARDER', texte: "top_up : amount_cents (et, à partir de P15, currency) invalide -> INVALID_ARGUMENT d'abord, puis member_id non membre -> NOT_FOUND. get_wallet : un member qui lit le portefeuille d'un autre -> FORBIDDEN, puis member_id non membre -> NOT_FOUND." },
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
  ],
  'P8.R3': [
    { question: 'T70-15', classe: 'GARDER', texte: "cancel : NOT_FOUND, puis FORBIDDEN, puis ALREADY_CANCELLED (une réservation 'bumped' compte comme annulée à partir de P13), puis validité de seats -> INVALID_ARGUMENT." },
  ],
  'P8.R4': [
    { question: 'T70-09', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
    { question: 'Q04', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
    { question: "Q65", classe: "GARDER", origine: "decision du mandant du 27/10/2026", texte: "Vue d'une reservation annulee. get_booking d'une reservation 'cancelled' porte, comme a partir de P9 (P9.R4), amount_cents, paid_credits_cents et paid_card_cents RESTANTS apres le remboursement, c'est-a-dire A, C et D tels que la reservation les garde : a P8 le remboursement d'une annulation totale (cancel sans seats, ou seats = n) et d'une annulation d'office par add_exception (P5.R2) est integral, donc amount_cents = paid_credits_cents = paid_card_cents = 0 (P8.F31 : q4a apres add_exception, A 1000 -> 0, C 600 -> 0, D 400 -> 0). Les frais retenus, le cas echeant (a partir de P9, taux de palier < 10000), sont ce qui reste dans ces champs : amount_cents = A - R, paid_credits_cents = C - r_c, paid_card_cents = D - r_d (P9.R4) ; le contrat n'exige aucun champ distinct (frais_retenus_cents ou autre), et F (somme des frais d'annulation partielle, P9.R4) reste interne. Precision sans effet sur aucun fait." },
  ],
  'P9.R2': [
    { question: 'Q02', classe: 'GARDER', texte: "Une heure locale ambiguë (de 02:00:00 à 02:59:59 le dernier dimanche d'octobre) désigne sa première occurrence (+02:00)." },
    { question: 'Q61', classe: 'GARDER', texte: "Une heure locale ambiguë (de 02:00:00 à 02:59:59 le dernier dimanche d'octobre) désigne sa première occurrence (+02:00)." },
  ],
  'P9.R3': [
    { question: 'T70-16', classe: 'CHANGER', texte: "Une annulation d'office par add_exception a un taux FORCE de 10000, pose par P5.R2 et lu par P9.R3 (et non l'effet de bord d'un creneau supprime)." },
    { question: 'Q03', classe: 'GARDER', texte: "Le palier s'applique à toute annulation, quel que soit l'acteur (admin, staff ou member) : il n'existe pas d'annulation à 100 % par geste commercial." },
    { question: 'Q04', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
    { question: 'Q06', classe: 'GARDER', texte: "refund_rate_bp est le taux du palier à l'instant de l'annulation, y compris pour une réservation waiting, qui ne rembourse rien (refunded_cents 0)." },
  ],
  'P9.R4': [
    { question: 'Q04', classe: 'CHANGER', texte: "Quand add_exception retire une occurrence, chaque réservation 'confirmed' annulée d'office est remboursée INTÉGRALEMENT (taux 10000, quel que soit le palier) vers chaque source : C re-crédité au portefeuille, D rendu à la carte, au payeur à partir de P23. Si la charge appartient à un mois déjà facturé, un avoir de reason 'cancellation' est émis ; sinon c'est une ligne refund. Une réservation waiting ne rembourse rien. La réponse de add_exception est inchangée." },
    { question: 'Q25', classe: 'CHANGER', texte: "A' = montant P15.R6 au nouveau prix pour les seats actuels + F, où F est la somme des frais d'annulation partielle déjà retenus sur la réservation (à chaque annulation partielle de k places sur n : F += floor(A × k / n) - R). Le trop-perçu T = A - A' ne rend jamais des frais d'annulation." },
  ],
  'P9.R5': [
    { question: 'T70-07', classe: 'GARDER', texte: "create_recurring : si series_id existe déjà dans le locataire, ou si le slot_id d'une seule de ses occurrences existe déjà -> ALREADY_EXISTS et rien n'est créé (tout ou rien)." },
    { question: 'T70-08', classe: 'GARDER', texte: "create_recurring : series_id vide, weekday hors 1..7, start_time hors 'HH:MM' (00:00 à 23:59), capacity non entière ou < 1, date mal formée ou from_date > until_date -> INVALID_ARGUMENT ; ce contrôle précède ALREADY_EXISTS." },
    { question: 'N-01', classe: 'FIXER', texte: "create_recurring dont la plage [from_date, until_date] ne contient aucun jour weekday -> INVALID_ARGUMENT, rien n'est créé." },
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
    { question: 'Q01', classe: 'CHANGER', texte: "À partir de P9, start_time est l'heure MURALE locale du site et from_date, until_date et la date d'occurrence sont des dates du calendrier local ; le starts_at de chaque occurrence est l'instant UTC de '<date> <start_time>' local, converti par P9.R2 (heure inexistante lue à +01:00, heure ambiguë = première occurrence). Une série hebdomadaire garde donc la même heure locale de part et d'autre d'un changement d'heure. En 'UTC', rien ne change." },
  ],
  'P10.R1': [
    { question: 'Q08', classe: 'GARDER', texte: "Une absence enregistrée est définitive ; une suspension dure jusqu'à suspended_until ; aucune opération ne les retire." },
    { question: 'Q09', classe: 'GARDER', texte: "Une réservation marquée absente reste 'confirmed' (no_show = true) : elle reste payée et facturée, compte dans booked, et peut encore être annulée au palier en vigueur (0 % après D24)." },
  ],
  'P10.R2': [
    { question: 'Q07', classe: 'GARDER', texte: "absences_30d est calculé une seule fois, à l'enregistrement de l'absence d'instant T, sur les absences déjà enregistrées du membre dont l'instant est dans ]T - 30 j, T] ; un enregistrement ultérieur ne recalcule pas les absences déjà enregistrées et ne déclenche aucune suspension rétroactive." },
  ],
  'P11.R1': [
    { question: 'Q10', classe: 'GARDER', texte: "number_seats ne libère aucune place et ne promeut personne." },
    { question: 'Q11', classe: 'GARDER', texte: "number_seats sur un créneau surréservé (booked > capacity) -> INVALID_ARGUMENT, sans effet, contrôle fait après SLOT_CLOSED." },
    { question: 'Q12', classe: 'GARDER', texte: "create_slot crée toujours un créneau non numéroté ; seul number_seats numérote un créneau." },
  ],
  'P11.R4': [
    { question: 'N-02', classe: 'FIXER', texte: "Une libération de places à un instant at >= starts_at du créneau (annulation tardive, totale ou partielle) ne promeut personne ; les réservations en file y restent jusqu'à close_slot, qui les expire." },
  ],
  'P12.R1': [
    { question: 'N-02', classe: 'FIXER', texte: "Une libération de places à un instant at >= starts_at du créneau (annulation tardive, totale ou partielle) ne promeut personne ; les réservations en file y restent jusqu'à close_slot, qui les expire." },
    { question: 'Q13', classe: 'GARDER', texte: "P12.R1 remplace P11.R4. La règle de promotion ne change pas ; le rapport BUG-P12 la précise : toutes les places libres du créneau comptent, quelle que soit l'opération qui les a libérées." },
  ],
  'P13.R1': [
    { question: 'Q17', classe: 'GARDER', texte: "available = overbook_limit - booked, y compris pour un créneau clos ou commencé : available ne dit pas si le créneau est réservable." },
  ],
  'P13.R2': [
    { question: 'Q14', classe: 'GARDER', texte: "close_slot n'est jamais automatique : tant qu'un créneau n'est pas clos, ses réservations surnuméraires restent 'confirmed', sans débarquement ni compensation." },
    { question: 'Q15', classe: 'GARDER', texte: "On débarque dans l'ordre inverse de confirmation ; une annulation partielle ne change pas le rang de confirmation." },
  ],
  'P13.R3': [
    { question: 'Q16', classe: 'GARDER', texte: "La compensation de 1000 centimes par place débarquée est due même pour une réservation gratuite ; un groupe est débarqué entier, même si booked descend alors sous capacity." },
  ],
  'P14.R2': [
    { question: 'Q05', classe: 'CHANGER', texte: "À partir de P14, set_timezone est refusé { ok: false, error: 'INVALID_ARGUMENT' }, sans effet, dès que le locataire a émis au moins une facture." },
    { question: 'Q19', classe: 'GARDER', texte: "issue_invoices peut émettre n'importe quel mois terminé, dans n'importe quel ordre, sans exiger que les mois précédents soient émis ; opening_balance_cents est le solde réel du portefeuille au premier instant local du mois." },
    { question: 'Q20', classe: 'GARDER', texte: "Tout locataire peut émettre des factures ; un mouvement de montant 0 n'est pas une ligne ; un membre sans ligne ni avoir émis dans le mois n'a pas de facture ce mois-là, même si son solde est non nul." },
  ],
  'P14.R3': [
    { question: 'Q21', classe: 'GARDER', texte: "Une ligne de facture est exactement { type, booking_id, amount_cents } (booking_id null pour top_up et expiry) ; un rechargement en USD y figure pour ses centimes d'EUR crédités." },
  ],
  'P14.R4': [
    { question: 'Q18', classe: 'GARDER', texte: "Un remboursement dont la charge appartient à un mois non encore facturé est une ligne refund du mois où il a lieu, même si la charge date d'un mois passé ; card_cents et credits_used_cents d'une facture peuvent donc être négatifs." },
    { question: 'Q22', classe: 'GARDER', texte: "Les séquences d'avoirs et de pseudonymes ont au moins 4 chiffres, complétés par des zéros à gauche ; au-delà de 9999 elles continuent sans troncature (AV-10000)." },
  ],
  'P14.R6': [
    { question: 'Q19', classe: 'GARDER', texte: "Le rapprochement ne contraint que les instants ou sa condition tient (chaque mois ecoule portant un mouvement ou un avoir du membre est emis). Une facture s'ouvre toujours sur le solde REEL du portefeuille au premier instant local de son mois (Q19), y compris la PREMIERE facture d'un membre : ce solde est non nul quand des mois anterieurs portant ses mouvements (rechargement, remboursement, compensation...) n'ont pas ete emis, et ce n'est pas une rupture du rapprochement. issue_invoices n'a pas d'autres refus que ceux de P14.R2 : il emet alors les factures et repond { ok: true, month, invoice_ids }. Chaque facture verifie toujours, seule, closing = opening + top_ups + compensations + credit_notes_credits - credits_used ; la facture suivante d'un membre s'ouvre sur la cloture de sa precedente des qu'aucun mois strictement entre les deux ne porte de mouvement du membre ; la somme sur ses factures egale balance_cents des que la condition est retablie, par exemple apres l'emission, dans le desordre, du mois manquant, les factures deja emises restant inchangees. Ex. (t-q19) : 777 recharges en avril, 2500 en mai ; issue_invoices '2031-05' -> ok ; INV-2031-05-m-ivy s'ouvre a 777 et se clot a 3277 ; avril emis ensuite : 0 -> 777." },
  ],
  'P15.R1': [
    { question: 'Q24', classe: 'CHANGER', texte: "rate_micro est un entier de 1 à 10 000 000 inclus, sinon INVALID_ARGUMENT." },
  ],
  'P15.R4': [
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
  ],
  'P15.R5': [
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
    { question: 'Q28', classe: 'GARDER', texte: "get_slot ne porte ni price_cents ni devise ; le prix payé se lit dans amount_cents (et original_amount_cents) de la réservation." },
  ],
  'P15.R6': [
    { question: 'Q23', classe: 'GARDER', texte: "Une réservation en file sur un créneau en USD n'est pas promue tant qu'aucun taux ne s'applique (elle garde son rang) ; un reserve direct rend RATE_UNAVAILABLE, réponse mémorisée pour l'idempotence." },
  ],
  'P16.R1': [
    { question: 'N-04', classe: 'FIXER', texte: "capacity est un entier de 1 à 10 000 ; price_cents de 0 à 100 000 000 ; amount_cents de top_up de 1 à 100 000 000 ; une plage create_recurring couvre au plus 366 jours. Au-delà -> INVALID_ARGUMENT." },
    { question: 'Q27', classe: 'GARDER', texte: "set_price fixe le prix des confirmations futures sans toucher aux réservations existantes ; change_price fixe ce même prix (devise inchangée) et rend EN PLUS les trop-perçus des confirmations depuis effective_from." },
    { question: "Q63", classe: "FIXER", origine: "decision du mandant du 27/10/2026", texte: "change_price garde la devise du creneau (devise inchangee) et ne reajuste que les reservations confirmees dans cette devise (P16.R2, Q63) ; une reservation confirmee dans une autre devise n'est pas dans adjusted, sans erreur." },
  ],
  'P16.R2': [
    { question: 'Q25', classe: 'CHANGER', texte: "A' = montant P15.R6 au nouveau prix pour les seats actuels + F, où F est la somme des frais d'annulation partielle déjà retenus sur la réservation (à chaque annulation partielle de k places sur n : F += floor(A × k / n) - R). Le trop-perçu T = A - A' ne rend jamais des frais d'annulation." },
    { question: 'Q26', classe: 'GARDER', texte: "Le recalcul P16.R2 d'une réservation en USD utilise le rate_micro de sa confirmation." },
    { question: "Q63", classe: "FIXER", origine: "decision du mandant du 27/10/2026", texte: "Changement de devise non retroactif. change_price ne reajuste que les reservations confirmees dans la devise ACTUELLE du creneau (celle du dernier set_price ; change_price ne la change pas, P16.R1). Devise d'une reservation : 'USD' si elle a ete confirmee sur un prix en USD (price_currency 'USD', P15.R6), 'EUR' sinon. Une reservation confirmee dans l'autre devise (creneau passe de EUR a USD, ou de USD a EUR, par set_price apres sa confirmation) n'est pas ajustee : elle est absente de adjusted, garde amount_cents, paid_credits_cents, paid_card_cents (et en USD original_amount_cents, rate_micro), aucun remboursement, aucune ligne adjustment, aucun avoir ; change_price repond ok sans erreur. Les reservations de la devise actuelle sont ajustees selon P16.R2 (en USD avec le rate_micro de leur confirmation, Q26). Ex. (t-q63) : u1 confirmee 2000 EUR sur C1, C1 passe a 2000 USD, change_price 1500 -> adjusted [] ; u4 confirmee ensuite 1500 USD (1350) ; change_price 1000 -> adjusted [u4 : 450] seulement ; u2 confirmee 2000 USD (1800) sur C2, C2 passe a 2000 EUR, change_price 1500 -> adjusted [], u2 garde 1800 ; u3 confirmee 2000 EUR sur C3 reste en EUR, change_price 1500 -> adjusted [u3 : 500]." },
  ],
  'P17.R1': [
    { question: 'Q29', classe: 'GARDER', texte: "merge_tenants -> INVALID_ARGUMENT dès que la source ou la cible a émis au moins une facture (P14.R2)." },
    { question: "Q64", classe: "FIXER", origine: "decision du mandant du 27/10/2026", texte: "Refuser la fusion. merge_tenants -> INVALID_ARGUMENT, sans aucun effet (la source existe toujours, rien n'est renomme ni ajoute), si le member_id d'un membre de la SOURCE (proprietaire compris) est egal a un pseudonyme de la CIBLE (P18.R1, y compris un pseudonyme venu d'une fusion anterieure) : un pseudonyme ne designe jamais un membre (Q62) et un member_id n'est jamais renomme (P17.R3). Ce controle est le SIXIEME, apres les cinq de P17.R1 (NOT_FOUND source, source = cible, actor non admin de la source, facture emise, renommage deja pris) : il n'est atteint que si ces cinq passent. Le sens inverse (pseudonyme de la source egal a un member_id de la cible) n'est PAS refuse : il est deja couvert par Q34 (P17.R2 (e)), le pseudonyme de la source est renomme '<source_tenant_id>:<pseudonyme>' (fait P18.F29 : anon-0001 de t-q62b, member_id d'un membre de t-q62, devient 't-q62b:anon-0001'). Un pseudonyme de la source egal a un pseudonyme de la cible suit de meme Q34. Ex. (t-q64a/t-q64b) : anon-0001, pseudonyme de t-q64a, est member_id d'un membre de t-q64b -> INVALID_ARGUMENT ; une fois ce membre efface dans t-q64b (il y devient anon-0002), la fusion reussit sans renommage." },
  ],
  'P17.R2': [
    { question: 'Q32', classe: 'CHANGER', texte: "Une série et ses occurrences se renomment ENSEMBLE : si series_id ou le slot_id de l'une de ses occurrences entre en collision, series_id et tous les slot_id '<series_id>@<date>' de la série reçoivent le préfixe '<source_tenant_id>:'. Le lien '<series_id>@<date>' est ainsi conservé." },
    { question: 'Q34', classe: 'CHANGER', texte: "Un pseudonyme de la source déjà présent dans la cible (pseudonyme ou member_id) est renommé '<source_tenant_id>:<pseudonyme>', avec tout ce qui le cite (portefeuille, historique, lots, factures, avoirs). Ce renommage figure dans renamed, sous le kind 'pseudonym', placé après 'import'." },
  ],
  'P17.R3': [
    { question: 'Q30', classe: 'GARDER', texte: "Par exception à l'isolation P3.R3, qui reste vraie entre locataires distincts, merge_tenants considère qu'un member_id présent dans les deux locataires désigne la MÊME personne : pas de renommage, rôle le plus élevé, niveau de plus forte remise, soldes et historiques de portefeuille réunis, suspension la plus tardive." },
    { question: 'Q33', classe: 'GARDER', texte: "Les absences enregistrées dans la source rejoignent celles de la cible et comptent dans absences_30d des enregistrements suivants." },
    { question: 'Q34', classe: 'CHANGER', texte: "Un pseudonyme de la source déjà présent dans la cible (pseudonyme ou member_id) est renommé '<source_tenant_id>:<pseudonyme>', avec tout ce qui le cite (portefeuille, historique, lots, factures, avoirs). Ce renommage figure dans renamed, sous le kind 'pseudonym', placé après 'import'." },
  ],
  'P17.R4': [
    { question: 'Q31', classe: 'GARDER', texte: "Dans une réponse mémorisée de la source, seuls les champs booking_id et slot_id de premier niveau sont réécrits ; les identifiants imbriqués gardent leur valeur d'origine." },
  ],
  'P18.R1': [
    { question: 'Q35', classe: 'GARDER', texte: "erase_member -> INVALID_ARGUMENT tant que le membre a une réservation confirmed ou waiting sur un créneau qui n'a pas commencé ; il faut d'abord l'annuler." },
    { question: 'Q62', classe: 'FIXER', texte: "Un pseudonyme est unique dans son locataire et ne designe jamais un membre. erase_member attribue le numero SUIVANT de la sequence du locataire (dernier numero attribue par erase_member dans ce locataire + 1, soit 1 au depart ; une fusion ne change pas la sequence de la cible, P17.R1) et saute, en poursuivant la sequence, tout numero dont 'anon-nnnn' est deja, dans ce locataire, le member_id d'un membre (proprietaire compris) ou un pseudonyme (y compris un pseudonyme venu d'une fusion, P17.R2) ; le numero retenu devient le dernier attribue. Ex. (t-q62) : un membre 'anon-0001' existe, m-qa est efface -> anon-0002, et le membre anon-0001 garde son portefeuille ; apres la fusion de t-q62b (ses pseudonymes anon-0001 et anon-0002 renommes par Q34, anon-0003 garde), m-qe est efface -> anon-0004." },
    { question: "Q38", classe: "CHANGER", origine: "decision du mandant du 27/10/2026", texte: "Remboursement du portefeuille a l'effacement (« Rembourser sur carte »). Soit B le solde balance_cents du membre a l'instant at de erase_member, apres les expirations de cet instant (P22.R2). Si B > 0 : B est rembourse sur sa carte et le portefeuille passe a 0 ; c'est un mouvement de portefeuille de type 'wallet_refund', date de at, de montant B, porte (comme tout l'historique, P18.R2) par le pseudonyme. Ligne de facture, exactement {type: 'wallet_refund', booking_id: null, amount_cents: B}, sur la facture du mois local de at (P14.R1) du pseudonyme ('INV-<AAAA-MM>-<pseudonyme>'), rangee a son instant parmi les lignes (ordre des operations, P14.R3 ; P22.R4) ; elle suffit a faire emettre cette facture (P14.R2). Ce n'est ni une charge ni un remboursement de reservation : charges_cents, refunds_cents, total_cents, card_cents et credits_used_cents n'en tiennent pas compte (report_revenue, P19.R3, non plus). Toute facture emise a partir de P18 porte le champ wallet_refunds_cents = somme de ses lignes wallet_refund (0 sans ligne) ; les factures emises avant P18 ne le portent pas et ne changent pas. Identite de cloture (P14.R3 de P18 a P21, P22.R4 puis P23.R5 ensuite) : closing_balance_cents = opening_balance_cents + top_ups_cents + compensations_cents + credit_notes_credits_cents - credits_used_cents - expired_cents (a partir de P22) - wallet_refunds_cents ; le rapprochement P14.R6 somme, sur les factures du membre, (top_ups + compensations + credit_notes_credits - credits_used - expired - wallet_refunds), qui egale balance_cents quand sa condition tient. Lots (P22.R2) : le remboursement est un debit de credits qui consomme TOUS les lots restants (reste 0) : ils n'expirent plus, get_wallet du pseudonyme rend balance_cents 0 et lots []. Si B = 0 : aucun mouvement, aucune ligne. La reponse de erase_member est inchangee. Ex. (t-q38) : m-ra, 1000 recharges, 400 payes en credits, efface -> 600 rembourses, facture d'aout 2031 du pseudonyme : top_up 1000, charge 400, wallet_refund 600, cloture 0 = 0 + 1000 - 400 - 600 ; m-rb, solde 0, efface -> aucune ligne wallet_refund." },
  ],
  'P18.R2': [
    { question: 'Q36', classe: 'GARDER', texte: "Les arguments mémorisés sont anonymisés comme les réponses : à partir de P21, rejouer une clé de l'ancien membre avec son ancien member_id rend IDEMPOTENCY_CONFLICT." },
    { question: 'Q37', classe: 'CHANGER', texte: "L'anonymisation ne remplace que les valeurs des clés member_id, payer_member_id, from_member_id et to_member_id, à toute profondeur, ainsi que le suffixe des invoice_id 'INV-<AAAA-MM>-<member_id>'. Un slot_id, un request_id ou un autre identifiant égal par hasard au member_id ne change pas." },
  ],
  'P18.R3': [
    { question: 'Q62', classe: 'GARDER', texte: "add_member dont member_id est un pseudonyme du locataire (P18.R1, y compris un pseudonyme venu d'une fusion) le designe comme member_id : NOT_FOUND, sans effet, controle fait apres ceux de P4.R1 ; seul l'ANCIEN identifiant d'un membre efface peut etre repris par add_member (nouveau membre). Un member_id de la forme 'anon-nnnn' qui n'est pas un pseudonyme du locataire est un identifiant comme un autre (le membre est cree, et la sequence de P18.R1 le saute)." },
  ],
  'P19.R1': [
    { question: 'Q39', classe: 'GARDER', texte: "report_occupancy filtre starts_at sur des instants UTC, from inclus et to exclu (et non sur des mois locaux)." },
    { question: 'Q40', classe: 'GARDER', texte: "booked du rapport compte les réservations confirmed, absences comprises, sans les débarquées ; les créneaux clos et passés sont inclus." },
  ],
  'P19.R3': [
    { question: 'Q41', classe: 'GARDER', texte: "credit_notes_cents d'une ligne de report_revenue somme les avoirs qui citent cette facture, émis jusqu'à l'instant du rapport, quel que soit leur mois d'émission." },
  ],
  'P20.R1': [
    { question: 'Q42', classe: 'GARDER', texte: "import_bookings est une réservation en LOT, pas une reprise d'historique : chaque ligne est payée (crédits puis carte) et facturée exactement comme un reserve." },
  ],
  'P20.R2': [
    { question: 'Q44', classe: 'GARDER', texte: "duplicates compte toute ligne dont le request_id était déjà mémorisé, que la réponse mémorisée soit un succès ou un refus ; une telle ligne n'apparaît pas dans rejected." },
  ],
  'P20.R3': [
    { question: 'Q43', classe: 'GARDER', texte: "Plafonds au 95e centile après import de 50 000 réservations : reserve et cancel 50 ms ; get_booking, get_slot et get_wallet 20 ms ; list_documents 100 ms ; report_occupancy et report_revenue 200 ms ; toute autre opération 100 ms ; un import de 50 000 lignes 30 000 ms." },
  ],
  'P21.R1': [
    { question: 'Q45', classe: 'GARDER', texte: "Les arguments comparés sont { member_id, slot_id, seats (1 si absent) } ; l'actor et l'instant ne comptent pas." },
  ],
  'P21.R2': [
    { question: 'Q46', classe: 'GARDER', texte: "Pour import_bookings, rows est comparé par égalité profonde des valeurs JSON (ordre des clés indifférent), sans normalisation : une ligne sans seats diffère d'une ligne seats: 1." },
  ],
  'P21.R3': [
    { question: 'Q47', classe: 'GARDER', texte: "La spec du candidat ne porte que les invariants de P21.R3 ; « 100 essais, 20 clients, quatre scenarios » est un parametre de T75, a confirmer la-bas." },
  ],
  'P22.R1': [
    { question: 'Q52', classe: 'GARDER', texte: "set_tier reste accepté après P22 ; le niveau est enregistré mais n'a plus d'effet sur le prix." },
  ],
  'P22.R2': [
    { question: 'Q48', classe: 'GARDER', texte: "Tout re-crédit (remboursement, trop-perçu, avoir) forme un nouveau lot de 12 mois à compter de son instant ; il ne reprend pas l'échéance des crédits d'origine." },
    { question: 'Q49', classe: 'GARDER', texte: "Les compensations de débarquement forment des lots et expirent comme des crédits achetés." },
    { question: 'Q51', classe: 'CHANGER', texte: "12 mois civils après le 29 février donnent le 28 février de l'année suivante, à la même heure UTC." },
    { question: "Q38", classe: "CHANGER", origine: "decision du mandant du 27/10/2026", texte: "Le remboursement du portefeuille a l'effacement (P18.R1, Q38) est un debit de credits date de l'effacement : il consomme TOUS les lots restants a cet instant (la reconstitution retroactive depuis P8 l'inclut) ; aucun lot du pseudonyme n'expire ensuite." },
  ],
  'P22.R4': [
    { question: 'Q50', classe: 'GARDER', texte: "Une expiration est un mouvement : elle produit une ligne expiry et, si c'est le seul mouvement du mois, une facture de total 0." },
    { question: "Q38", classe: "CHANGER", origine: "decision du mandant du 27/10/2026", texte: "Une ligne {type: 'wallet_refund', booking_id: null, amount_cents} (P18.R1, Q38) est rangee a son instant ; wallet_refunds_cents = somme de ces lignes ; elle n'entre ni dans charges_cents, refunds_cents, total_cents, card_cents ni credits_used_cents ; identite : closing = opening + top_ups + compensations + credit_notes_credits - credits_used - expired - wallet_refunds." },
  ],
  'P23.R1': [
    { question: 'Q55', classe: 'GARDER', texte: "Seul le destinataire d'un transfert est contrôlé (SUSPENDED) ; un membre suspendu peut céder sa réservation. Une absence reste attachée au membre qui était titulaire quand elle a été enregistrée." },
  ],
  'P23.R2': [
    { question: 'Q56', classe: 'GARDER', texte: "exchange_bookings est une opération de back-office (admin, staff) qui ne demande pas le consentement des titulaires ; un member -> FORBIDDEN." },
  ],
  'P23.R3': [
    { question: 'Q54', classe: 'CHANGER', texte: "fee_cents = 0 si A = 0 ; sinon fee_cents = max(100, floor((A × 1000 + 5000) / 10000))." },
  ],
  'P23.R4': [
    { question: 'Q53', classe: 'GARDER', texte: "Les remboursements d'une réservation transférée vont au payeur (payer_member_id) ; la compensation de débarquement va au titulaire actuel." },
  ],
  'P24.R1': [
    { question: 'Q60', classe: 'FIXER', texte: "Une opération dont le nom n'appartient pas au contrat en vigueur à la période -> { ok: false, error: 'INVALID_ARGUMENT' }, sans effet, non mémorisée. Ce contrôle passe avant tous les autres (avant le tenant ; à partir de P24, juste après celui de la version)." },
  ],
  'P24.R2': [
    { question: 'Q57', classe: 'GARDER', texte: "La correspondance v1 <-> v2 ne renomme que les clés listées ; toutes les autres (seat_numbers, free_seats, overbook_limit, …) gardent leur nom en v2." },
    { question: 'Q58', classe: 'GARDER', texte: "En v2, seule l'erreur de premier niveau prend la forme { code } ; les error des lignes rejected restent des chaînes." },
  ],
  'P24.R4': [
    { question: 'Q59', classe: 'GARDER', texte: "Une clé de l'autre version, à n'importe quelle profondeur des arguments, est refusée INVALID_ARGUMENT ; une clé inconnue des deux versions est ignorée." },
  ],
}

function clause(s: ClauseSpec): PlatformClause {
  const precisions = PRECISIONS[s.id]
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
    ...(precisions === undefined ? {} : { precisions: precisions.map((p) => ({ ...p })) }),
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
  /** Modifiable : l'effacement P18 remplace l'identifiant du membre. */
  member_id: string
  readonly t: number
  readonly delta: number
  /** P22.R2 : mouvement d'expiration d'un lot (pas un débit). */
  readonly expiration?: true
  /** P22.R2 : lot (entrée de crédits) dont l'expiration est déjà inscrite. */
  expire?: true
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

/**
 * Arguments de la première requête de chaque clé d'idempotence (tenant, request_id), rangés à côté de la réponse
 * mémorisée : { member_id, slot_id, seats (1 si absent) }. P1.R4 ne les compare pas ; P21.R1 les compare.
 */
const CLE_ARGUMENTS_IDEMPOTENCE = 'idempotence.arguments'
interface ArgumentsNormalises {
  member_id: unknown
  slot_id: unknown
  seats: unknown
}
const argumentsNormalises = (args: Json): ArgumentsNormalises => ({
  member_id: args.member_id,
  slot_id: args.slot_id,
  seats: args.seats ?? 1,
})
const argumentsMemorises = (ctx: PlatformContext): Map<string, ArgumentsNormalises> =>
  ctx.donnee<Map<string, ArgumentsNormalises>>(CLE_ARGUMENTS_IDEMPOTENCE, () => new Map())

/** Bornes des entiers (clarification N-04, Q24) : au-delà, INVALID_ARGUMENT. */
const CAPACITE_MIN = 1
const CAPACITE_MAX = 10_000
const PRIX_MAX_CENTS = 100_000_000
const RECHARGE_MAX_CENTS = 100_000_000
const RATE_MICRO_MAX = 10_000_000
/** Une plage create_recurring couvre au plus 366 dates : until_date - from_date <= 365 jours. */
const PLAGE_MAX_JOURS = 365
const capaciteValide = (v: unknown): v is number => estEntier(v) && v >= CAPACITE_MIN && v <= CAPACITE_MAX
const prixValide = (v: unknown): v is number => estEntier(v) && v >= 0 && v <= PRIX_MAX_CENTS
const rechargeValide = (v: unknown): v is number => estEntier(v) && v >= 1 && v <= RECHARGE_MAX_CENTS

/** Taux d'une annulation d'office par add_exception (P5.R2), forcé quel que soit le palier P9.R3. */
const TAUX_INTEGRAL_BP = 10_000

/** Rang de confirmation (P1.R3) : compteur global, l'ordre de confirmation traverse les locataires. */
const CLE_RANG_CONFIRMATION = 'confirmation.rang'

/* ════════════════════════════════════════════════════════════════════ P1 */

const P1_R1 = clause({
  id: 'P1.R1',
  enters: 'P1',
  text:
    "create_slot {slot_id, capacity, starts_at} cree un creneau. Controles dans cet ordre (le premier qui echoue donne la reponse, sans effet) : (1) slot_id absent ou vide, capacity non entiere ou hors de 1..10000, ou starts_at hors de la forme 'AAAA-MM-JJTHH:MM:SSZ' -> INVALID_ARGUMENT ; (2) slot_id deja pris -> ALREADY_EXISTS. starts_at est un instant ISO 8601 UTC. Reponse {ok: true, slot_id}.",
  contract: {
    operations: {
      create_slot: {
        arguments: { slot_id: 'chaine non vide', capacity: 'entier de 1 a 10000', starts_at: "'AAAA-MM-JJTHH:MM:SSZ'" },
        reponse: { ok: true, slot_id: 'chaine' },
        erreurs: ['INVALID_ARGUMENT', 'ALREADY_EXISTS'],
        ordre_des_controles: ['INVALID_ARGUMENT (slot_id, capacity, starts_at)', 'ALREADY_EXISTS'],
      },
    },
    valeurs: { capacity_min: CAPACITE_MIN, capacity_max: CAPACITE_MAX },
    exemples: [
      {
        requete: { op: 'create_slot', args: { slot_id: 'S1', capacity: 2, starts_at: '2031-03-20T18:00:00Z' } },
        reponse: { ok: true, slot_id: 'S1' },
      },
      { requete: { op: 'create_slot', args: { slot_id: 'S1', capacity: 3, starts_at: '2031-03-22T18:00:00Z' } }, reponse: { ok: false, error: 'ALREADY_EXISTS' } },
      { requete: { op: 'create_slot', args: { slot_id: 'K10001', capacity: 10001, starts_at: '2031-03-20T18:00:00Z' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'create_slot.effet': (ctx: PlatformContext): PlatformResponse => {
      const { slot_id, capacity, starts_at } = ctx.args
      if (!estChaine(slot_id) || !capaciteValide(capacity) || !estInstant(starts_at)) {
        return fail('INVALID_ARGUMENT')
      }
      if (ctx.locataire.slots.has(slot_id)) return fail('ALREADY_EXISTS')
      ctx.locataire.slots.set(slot_id, { slot_id, capacity, starts_at, file: [] })
      return succeed({ slot_id })
    },
  },
  grandeurs: ['slot_id', 'capacity', 'starts_at'],
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
})

const P1_R3 = clause({
  id: 'P1.R3',
  enters: 'P1',
  text:
    "Une reservation creee a pour booking_id le request_id de la requete qui l'a creee. Statuts : confirmed, cancelled (et waiting a partir de P2). Une reservation est ACTIVE si son statut est confirmed (ou waiting a partir de P2). L'instant de confirmation d'une reservation est le at de l'operation qui la rend 'confirmed' (a la reservation ou a la promotion) ; son rang de confirmation est l'ordre de ces passages le long de la trajectoire (a l'interieur d'une operation, dans l'ordre de promoted). P13.R2, P13.R3, P14.R4, P16.R2 et P17.R4 emploient ces deux notions.",
  contract: {
    valeurs: { status: ['confirmed', 'cancelled'], active: ['confirmed'] },
    vue_reservation: { booking_id: 'chaine = request_id', member_id: 'chaine', slot_id: 'chaine', status: "'confirmed' | 'cancelled'" },
    confirmation: {
      instant: "at de l'operation qui rend la reservation 'confirmed' (reservation ou promotion)",
      rang: "ordre de ces passages le long de la trajectoire, tous locataires confondus ; dans une operation, ordre de promoted",
      lu_par: ['P13.R2', 'P13.R3', 'P14.R4', 'P16.R2', 'P17.R4'],
    },
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
    'reservation.confirmation': (ctx: PlatformContext, b: Booking): void => {
      b.status = 'confirmed'
      b.confirmed_at = ctx.step.at
      b.confirmation_seq = ++ctx.donneeGlobale<{ rang: number }>(CLE_RANG_CONFIRMATION, () => ({ rang: 0 })).rang
    },
    'reservation.active.confirmee': (b: Booking): boolean => b.status === 'confirmed',
    'vue.reservation.base': ((_ctx, b, champs) => {
      Object.assign(champs, { booking_id: b.booking_id, member_id: b.member_id, slot_id: b.slot_id, status: b.status })
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['booking_id', 'request_id', 'member_id', 'slot_id', 'status', 'at'],
})

const P1_R4 = clause({
  id: 'P1.R4',
  enters: 'P1',
  exits: 'P21',
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
      const arguments_de = argumentsMemorises(ctx)
      const demandes = argumentsNormalises(ctx.args)
      ctx.apres.push((r) => {
        const memorisable = ctx.regleOpt<(r: PlatformResponse) => boolean>('idempotence.memorisable')
        if (memorisable === undefined || memorisable(r)) {
          memo_de.set(cle, clone(r))
          arguments_de.set(cle, demandes)
        }
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

/** Forme d'une erreur dans la version de la requête (P24.R2) ; sans elle, la forme v1. */
type FormeErreur = (ctx: PlatformContext, code: string) => PlatformResponse

const P1_R8 = clause({
  id: 'P1.R8',
  enters: 'P1',
  text:
    "Operation inconnue : une operation dont le nom n'appartient pas au contrat en vigueur a la periode (operations introduites par les clauses actives ; avant P24, un nom d'operation du contrat v2 comme create_reservation est une operation inconnue) -> {ok: false, error: 'INVALID_ARGUMENT'}, sans effet, non memorisee. Ce controle passe avant tous les autres : avant celui du tenant (P3.R2) et de l'acteur (P4.R2) ; a partir de P24, juste apres celui de la version (P24.R1).",
  contract: {
    operation_inconnue: { reponse: { ok: false, error: 'INVALID_ARGUMENT' }, memorisee: false, effet: 'aucun' },
    erreurs: ['INVALID_ARGUMENT'],
    valeurs: { reponse: 'INVALID_ARGUMENT', rang: 'premier controle (apres la version a partir de P24)', memorisee: false },
    exemples: [
      { contexte: 'avant P24 : nom du contrat v2', requete: { op: 'create_reservation', tenant: 't-clar', actor: 'm-own', args: { request_id: 'x60', member_id: 'm-max', session_id: 'F23' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { contexte: 'tenant inconnu : le controle d operation passe avant', requete: { op: 'frobnicate', tenant: 't-nulle-part', actor: 'm-own', args: { slot_id: 'F23' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { contexte: 'x60 n a pas ete memorise', requete: { op: 'reserve', tenant: 't-clar', actor: 'm-own', args: { request_id: 'x60', member_id: 'm-max', slot_id: 'F23' } }, reponse: { ok: true, booking_id: 'x60', status: 'confirmed' } },
    ],
  },
  implementation: {
    'requete.operation_connue': etape(15, (ctx) => {
      const op = ctx.step.op
      if (ctx.regleOpt(`${op}.effet`) !== undefined) return undefined
      const autres = ctx.regleOpt<() => Correspondance>('contrat.correspondance')?.()
      if (autres !== undefined && Object.values(autres.operations).includes(op)) return undefined
      const forme = ctx.regleOpt<FormeErreur>('contrat.forme_erreur')
      return forme === undefined ? fail('INVALID_ARGUMENT') : forme(ctx, 'INVALID_ARGUMENT')
    }),
  },
  grandeurs: [],
})

/* ════════════════════════════════════════════════════════════════════ P2 */

/** Clarification N-02 : une libération à at >= starts_at du créneau ne promeut personne. */
const creneauOuvert = (ctx: PlatformContext, slot: Slot): boolean => ctx.instant < Date.parse(slot.starts_at)

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
    "Promotion : quand une reservation confirmed est annulee, la place liberee est attribuee, dans la meme operation, a la reservation en tete de file, qui passe confirmed et quitte la file. Annuler une reservation waiting la retire de la file (les suivantes remontent) et ne promeut personne. La reponse de cancel porte promoted : la liste ordonnee des booking_id promus par cette operation ([] si aucun). Une liberation de places a un instant at >= starts_at du creneau (annulation tardive, totale ou partielle) ne promeut personne : promoted = [] et les reservations en file y restent (a partir de P13, close_slot les expire).",
  contract: {
    operations: { cancel: { reponse: { ok: true, booking_id: 'chaine', status: "'cancelled'", promoted: 'tableau de booking_id' } } },
    exemples: [
      { contexte: 'w1 confirmed, file [w3, w4]', requete: { op: 'cancel', args: { booking_id: 'w1' } }, reponse: { ok: true, booking_id: 'w1', status: 'cancelled', promoted: ['w3'] } },
      { contexte: 'w2 waiting', requete: { op: 'cancel', args: { booking_id: 'w2' } }, reponse: { ok: true, booking_id: 'w2', status: 'cancelled', promoted: [] } },
      { contexte: "N2 commence a 09:20:00Z, n2d en file", requete: { op: 'cancel', at: '2031-03-04T09:20:00Z', args: { booking_id: 'n2b' } }, reponse: { ok: true, booking_id: 'n2b', status: 'cancelled', promoted: [] } },
    ],
    liberation_tardive: 'at >= starts_at du creneau : aucune promotion, la file reste (P13 : close_slot l expire)',
  },
  implementation: {
    'annulation.retrait_file': ((_ctx, b, slot) => {
      if (slot !== undefined) slot.file = slot.file.filter((id) => id !== b.booking_id)
    }) satisfies RetraitFile,
    'liberation.promotion': (ctx: PlatformContext, slot: Slot): string[] => {
      const promus: string[] = []
      if (!creneauOuvert(ctx, slot)) return promus
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
    "Roles : admin, staff, member. Le owner_id d'un locataire est admin de ce locataire. add_member {member_id, role} cree le membre ou remplace son role ; reponse {ok: true, member_id, role}. Controles apres ceux d'acteur (P4.R2) : member_id absent ou vide, ou role hors de 'admin', 'staff', 'member' -> INVALID_ARGUMENT ; member_id = owner_id du locataire -> INVALID_ARGUMENT, sans effet (le proprietaire reste admin). Le locataire 'default' n'a ni proprietaire ni membre.",
  contract: {
    operations: {
      add_member: {
        roles_autorises: ['admin'],
        arguments: { member_id: 'chaine non vide', role: "'admin' | 'staff' | 'member'" },
        reponse: { ok: true, member_id: 'chaine', role: 'chaine' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { roles: [...ROLES], proprietaire: 'admin, jamais modifiable par add_member' },
    exemples: [
      { requete: { op: 'add_member', tenant: 't-alpha', actor: 'm-ana', args: { member_id: 'm-sam', role: 'staff' } }, reponse: { ok: true, member_id: 'm-sam', role: 'staff' } },
      { contexte: 'm-own proprietaire de t-clar', requete: { op: 'add_member', tenant: 't-clar', actor: 'm-own', args: { member_id: 'm-own', role: 'member' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'membres.role': (_ctx: PlatformContext, t: Tenant, m: string): string | undefined =>
      t.owner_id === m ? 'admin' : t.members.get(m),
    'add_member.etape.arguments': etape(10, (ctx) => {
      const { member_id, role } = ctx.args
      if (!estChaine(member_id) || typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
        return fail('INVALID_ARGUMENT')
      }
      return member_id === ctx.locataire.owner_id ? fail('INVALID_ARGUMENT') : undefined
    }),
    'add_member.effet': (ctx: PlatformContext): PlatformResponse => {
      const member_id = String(ctx.args.member_id)
      const role = String(ctx.args.role)
      ctx.locataire.members.set(member_id, role)
      return succeed({ member_id, role })
    },
  },
  grandeurs: ['member_id', 'role', 'owner_id'],
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

/** starts_at d'une occurrence de date `d` (AAAA-MM-JJ) à l'heure `hhmm` : UTC (P5.R1) ou heure locale du site (P9.R5). */
type DebutOccurrence = (ctx: PlatformContext, d: string, hhmm: string) => string

/** Contrôles (dans l'ordre de P5.R1 / P9.R5) et création tout ou rien d'une série hebdomadaire. */
function creerSerie(ctx: PlatformContext, debutDe: DebutOccurrence): PlatformResponse {
  const { series_id, weekday, start_time, capacity, from_date, until_date } = ctx.args
  const debut = dateUtc(from_date)
  const fin = dateUtc(until_date)
  if (
    !estChaine(series_id) ||
    !estEntier(weekday) || weekday < 1 || weekday > 7 ||
    typeof start_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start_time) ||
    !capaciteValide(capacity) ||
    debut === null || fin === null || debut > fin ||
    fin - debut > PLAGE_MAX_JOURS * JOUR_MS
  ) {
    return fail('INVALID_ARGUMENT')
  }
  const t = ctx.locataire
  const serie: Series = {
    series_id, weekday, start_time, capacity,
    from_date: String(from_date), until_date: String(until_date), exceptions: new Set(),
  }
  const dates = datesDeSerie(serie)
  if (dates.length === 0) return fail('INVALID_ARGUMENT')
  if (t.series.has(series_id) || dates.some((d) => t.slots.has(occurrence(series_id, d)))) return fail('ALREADY_EXISTS')
  t.series.set(series_id, serie)
  for (const d of dates) {
    const slot_id = occurrence(series_id, d)
    t.slots.set(slot_id, { slot_id, capacity, starts_at: debutDe(ctx, d, start_time), file: [] })
  }
  return succeed({ series_id, slot_ids: dates.map((d) => occurrence(series_id, d)) })
}

const P5_R1 = clause({
  id: 'P5.R1',
  enters: 'P5',
  exits: 'P9',
  text:
    "create_recurring {series_id, weekday, start_time, capacity, from_date, until_date} (admin, staff) : weekday est le jour ISO (1 = lundi ... 7 = dimanche) ; start_time 'HH:MM' en UTC ; from_date et until_date 'AAAA-MM-JJ', bornes INCLUSES. Cree un creneau par date d de [from_date, until_date] dont le jour ISO vaut weekday, de slot_id '<series_id>@<AAAA-MM-JJ>', starts_at '<AAAA-MM-JJ>T<HH:MM>:00Z', capacite capacity. Reponse {ok: true, series_id, slot_ids} en ordre chronologique. Controles apres ceux d'acteur, dans cet ordre (le premier qui echoue donne la reponse, rien n'est cree) : (1) series_id absent ou vide, weekday hors 1..7, start_time hors 'HH:MM' (00:00 a 23:59), capacity non entiere ou hors de 1..10000, date mal formee, from_date > until_date, plage de plus de 366 jours (until_date - from_date > 365 jours), ou plage [from_date, until_date] ne contenant aucun jour weekday (serie sans occurrence) -> INVALID_ARGUMENT ; (2) series_id deja pris dans le locataire, ou slot_id d'une seule de ses occurrences deja pris -> ALREADY_EXISTS (tout ou rien).",
  contract: {
    operations: {
      create_recurring: {
        roles_autorises: ['admin', 'staff'],
        arguments: {
          series_id: 'chaine non vide',
          weekday: 'entier 1..7 (ISO, 1 = lundi)',
          start_time: "'HH:MM' UTC",
          capacity: 'entier de 1 a 10000',
          from_date: "'AAAA-MM-JJ' incluse",
          until_date: "'AAAA-MM-JJ' incluse, until_date - from_date <= 365 jours",
        },
        reponse: { ok: true, series_id: 'chaine', slot_ids: 'tableau chronologique, au moins une occurrence' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'],
        ordre_des_controles: ['INVALID_ARGUMENT (arguments, plage, serie sans occurrence)', 'ALREADY_EXISTS (tout ou rien)'],
      },
    },
    valeurs: { weekday: 'ISO 8601, 1 = lundi', bornes: 'incluses', fuseau: 'UTC', capacity: '1..10000', plage_max: '366 dates (until_date - from_date <= 365 jours)', occurrences_min: 1 },
    exemples: [
      {
        requete: { op: 'create_recurring', args: { series_id: 'yoga', weekday: 3, start_time: '18:00', capacity: 2, from_date: '2031-03-10', until_date: '2031-04-09' } },
        reponse: { ok: true, series_id: 'yoga', slot_ids: ['yoga@2031-03-12', 'yoga@2031-03-19', 'yoga@2031-03-26', 'yoga@2031-04-02', 'yoga@2031-04-09'] },
      },
      { contexte: 'aucun lundi du 01/04 au 06/04/2031', requete: { op: 'create_recurring', args: { series_id: 'V0', weekday: 1, start_time: '10:00', capacity: 2, from_date: '2031-04-01', until_date: '2031-04-06' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { contexte: '366 jours d ecart', requete: { op: 'create_recurring', args: { series_id: 'Y367', weekday: 1, start_time: '10:00', capacity: 2, from_date: '2031-04-01', until_date: '2032-04-01' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.create_recurring': ['admin', 'staff'],
    'serie.dates': datesDeSerie,
    'create_recurring.effet': (ctx: PlatformContext): PlatformResponse => creerSerie(ctx, (_ctx, d, hhmm) => `${d}T${hhmm}:00Z`),
  },
  grandeurs: ['series_id', 'weekday', 'start_time', 'capacity', 'from_date', 'until_date', 'slot_id', 'starts_at', 'slot_ids'],
})

const P5_R2 = clause({
  id: 'P5.R2',
  enters: 'P5',
  text:
    "add_exception {series_id, date} (admin, staff) : si date n'est pas une occurrence COURANTE de la serie (jour different, hors bornes, ou deja exceptee) -> NOT_FOUND. Sinon l'occurrence est retiree (son creneau n'existe plus : get_slot et reserve -> NOT_FOUND) et toutes ses reservations actives (confirmed et waiting) passent cancelled. Reponse {ok: true, series_id, date, cancelled} : booking_id annules dans l'ordre de creation des reservations. Chaque reservation 'confirmed' ainsi annulee d'office est remboursee INTEGRALEMENT (taux 10000, quel que soit le palier P9.R3) vers chaque source : C re-credite au portefeuille (P8), D rendu a la carte, au payeur a partir de P23 (P23.R4) ; puis amount_cents, paid_credits_cents et paid_card_cents valent 0. Si la charge appartient a un mois deja facture (P14.R4), un avoir de reason 'cancellation' est emis ; sinon c'est une ligne refund (P14.R1). Une reservation waiting ne rembourse rien. La reponse de add_exception est inchangee.",
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
      { contexte: 'q4a confirmed : A 1000, C 600, D 400', requete: { op: 'add_exception', args: { series_id: 'Q4', date: '2031-03-20' } }, reponse: { ok: true, series_id: 'Q4', date: '2031-03-20', cancelled: ['q4a'] }, puis: { get_wallet: { balance_cents: 600 }, get_booking: { status: 'cancelled', amount_cents: 0, paid_credits_cents: 0, paid_card_cents: 0 } } },
    ],
    annulation_d_office: {
      remboursement: 'integral (taux force 10000, quel que soit le palier) vers chaque source : C au portefeuille, D a la carte (au payeur a partir de P23)',
      document: "avoir de reason 'cancellation' si la charge est d'un mois deja facture, sinon ligne refund",
      waiting: 'rien a rembourser',
      reponse: 'inchangee',
    },
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
      const rembourser = ctx.regleOpt<Remboursement>('annulation.remboursement')
      for (const b of annulees) {
        if (b.status === 'confirmed' && rembourser !== undefined) {
          ctx.d.taux_force = TAUX_INTEGRAL_BP
          rembourser(ctx, b, b.seats, b.seats)
        }
        b.status = 'cancelled'
      }
      t.slots.delete(slot_id)
      return succeed({ series_id: serie.series_id, date, cancelled: annulees.map((b) => b.booking_id) })
    },
  },
  grandeurs: ['series_id', 'date', 'cancelled', 'status', 'amount_cents', 'paid_credits_cents', 'paid_card_cents'],
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
    "Promotion premier-qui-tient : apres toute liberation de places, on parcourt la file depuis la tete et on promeut la PREMIERE reservation dont seats <= available ; on recommence le parcours depuis la tete tant qu'une reservation tient. Les reservations sautees gardent leur rang. promoted liste les promus dans l'ordre de promotion. Une liberation de places a un instant at >= starts_at du creneau (annulation tardive, totale ou partielle) ne promeut personne : promoted = [] et les reservations en file y restent (a partir de P13, close_slot les expire).",
  contract: {
    operations: { cancel: { reponse: { promoted: 'tableau de booking_id, ordre de promotion' } } },
    exemples: [
      { contexte: 'S6 capacity 5 : g1 (3) et g3 (2) confirmed ; file [g2 (3), g4 (1)]', requete: { op: 'cancel', args: { booking_id: 'g3' } }, reponse: { ok: true, booking_id: 'g3', status: 'cancelled', promoted: ['g4'] } },
      { contexte: 'G6 commence a 09:30:00Z, g6b (2) en file', requete: { op: 'cancel', at: '2031-03-08T09:30:00Z', args: { booking_id: 'g6a' } }, reponse: { ok: true, booking_id: 'g6a', status: 'cancelled', promoted: [] } },
    ],
    liberation_tardive: 'at >= starts_at du creneau : aucune promotion, la file reste (P13 : close_slot l expire)',
  },
  implementation: {
    'annulation.retrait_file': ((_ctx, b, slot) => {
      if (slot !== undefined) slot.file = slot.file.filter((id) => id !== b.booking_id)
    }) satisfies RetraitFile,
    'liberation.promotion': (ctx: PlatformContext, slot: Slot): string[] => {
      const promus: string[] = []
      if (!creneauOuvert(ctx, slot)) return promus
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
    "set_price {slot_id, price_cents} (admin) : prix PAR PLACE en centimes entiers de 0 a 100 000 000 (slot_id inconnu -> NOT_FOUND d'abord, puis price_cents invalide -> INVALID_ARGUMENT) ; reponse {ok: true, slot_id, price_cents}. Tout creneau a le prix 0 tant qu'aucun prix n'est fixe.",
  contract: {
    operations: {
      set_price: {
        roles_autorises: ['admin'],
        arguments: { slot_id: 'chaine', price_cents: 'entier de 0 a 100 000 000 (centimes, par place)' },
        reponse: { ok: true, slot_id: 'chaine', price_cents: 'entier' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
        ordre_des_controles: ['NOT_FOUND (slot_id)', 'INVALID_ARGUMENT (price_cents)'],
      },
    },
    valeurs: { prix_par_defaut_cents: 0, price_cents_min: 0, price_cents_max: PRIX_MAX_CENTS },
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
      if (!prixValide(p)) return fail('INVALID_ARGUMENT')
      slot.price_cents = p
      return succeed({ slot_id: slot.slot_id, price_cents: p })
    },
  },
  grandeurs: ['slot_id', 'price_cents'],
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
    "Annulation totale d'une reservation confirmed : refunded_cents = amount_cents (100 %, vers la carte) ; waiting : 0. La reponse de cancel porte refunded_cents. Apres annulation totale, amount_cents vaut 0. Une annulation d'office par add_exception (P5.R2) rembourse de meme 100 % (amount_cents vers la carte).",
  contract: {
    operations: { cancel: { reponse: { refunded_cents: 'entier (centimes)' } } },
    annulation_d_office: 'add_exception (P5.R2) : 100 %, amount_cents vers la carte',
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
    "Chaque membre a, dans chaque locataire, un portefeuille balance_cents (entier >= 0, initialement 0). top_up {member_id, amount_cents} (admin, staff) : amount_cents entier de 1 a 100 000 000 sinon INVALID_ARGUMENT ; reponse {ok: true, member_id, balance_cents} (solde apres). get_wallet {member_id} : admin, staff pour tout membre ; member pour lui-meme seulement (sinon FORBIDDEN) ; reponse {ok: true, member_id, balance_cents}.",
  contract: {
    operations: {
      top_up: {
        roles_autorises: ['admin', 'staff'],
        arguments: { member_id: 'chaine', amount_cents: 'entier de 1 a 100 000 000 (centimes)' },
        reponse: { ok: true, member_id: 'chaine', balance_cents: 'entier >= 0' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'NOT_FOUND'],
        ordre_des_controles: ['INVALID_ARGUMENT (amount_cents)', 'NOT_FOUND (member_id)'],
      },
      get_wallet: {
        roles_autorises: ['admin', 'staff', 'member:soi'],
        arguments: { member_id: 'chaine' },
        reponse: { ok: true, member_id: 'chaine', balance_cents: 'entier >= 0' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND'],
      },
    },
    erreurs: ['INVALID_ARGUMENT'],
    valeurs: { amount_cents_min: 1, amount_cents_max: RECHARGE_MAX_CENTS },
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
      if (!rechargeValide(amount_cents)) return fail('INVALID_ARGUMENT')
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
})

const P8_R4 = clause({
  id: 'P8.R4',
  enters: 'P8',
  exits: 'P9',
  replaces: 'P7.R5',
  text:
    "Remboursement : soit A = amount_cents restant, C = paid_credits_cents restant, D = paid_card_cents restant (A = C + D). Annulation totale : rembourse C en credits (re-credites au portefeuille) et D a la carte, puis A, C, D valent 0. Annulation partielle de k places sur n : R = floor(A x k / n) ; part credits r_c = floor(R x C / A) (0 si A = 0) ; part carte r_d = R - r_c ; la reservation garde n - k places, A - R, C - r_c, D - r_d et reste confirmed ; r_c est re-credite au portefeuille ; les places liberees declenchent la promotion. La reponse de cancel porte refunded_cents = R (ou C + D), refund = {credits_cents, card_cents}, promoted, et pour une annulation partielle status 'confirmed' et seats = n - k. L'annulation d'office par add_exception (P5.R2) rembourse de meme la totalite : C au portefeuille, D a la carte.",
  contract: {
    operations: {
      cancel: {
        reponse: { refunded_cents: 'entier', refund: { credits_cents: 'entier', card_cents: 'entier' }, promoted: 'tableau' },
      },
      get_booking: { reponse_cancelled: { amount_cents: 0, paid_credits_cents: 0, paid_card_cents: 0 } },
    },
    valeurs: { arrondi_rembourse: 'floor', arrondi_part_credits: 'floor, la carte recoit le reste', annulation_d_office: 'add_exception (P5.R2) : totalite, C au portefeuille, D a la carte' },
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
    'vue.reservation.frais_retenus': ((_ctx, b, champs) => {
      if (b.status !== 'cancelled') return
      champs.paid_credits_cents = b.paid_credits_cents ?? 0
      champs.paid_card_cents = b.paid_card_cents ?? 0
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
})

type TauxAnnulation = (ctx: PlatformContext, b: Booking) => number

const P9_R3 = clause({
  id: 'P9.R3',
  enters: 'P9',
  text:
    "Paliers d'annulation, en heure MURALE du site. Soit Ls l'heure locale murale du debut du creneau (P9.R2). D48 = l'instant UTC de l'heure locale murale (Ls moins 48 heures d'horloge : meme heure, deux jours de calendrier plus tot) ; D24 = l'instant UTC de (Ls moins 24 heures d'horloge : meme heure, la veille) ; chacune convertie par P9.R2. Ce ne sont PAS des durees ecoulees : autour d'un changement d'heure, D48 peut etre a 47 ou 49 heures reelles du debut. Pour une annulation a l'instant at (champ at de l'operation) : at < D48 -> taux 10000 pb (100 %) ; D48 <= at < D24 -> 5000 pb (50 %) ; at >= D24 -> 0 pb (y compris apres le debut). Le palier vaut pour toute annulation, totale ou partielle, quel que soit l'acteur (admin, staff ou membre). La reponse de cancel porte refund_rate_bp, le taux du palier, meme pour une reservation waiting (qui ne rembourse rien). Une annulation d'office par add_exception (P5.R2) n'applique aucun palier : son taux est FORCE a 10000 par P5.R2, quel que soit l'instant.",
  contract: {
    operations: { cancel: { reponse: { refund_rate_bp: 'entier : 10000 | 5000 | 0' } } },
    valeurs: {
      paliers_bp: [{ avant: 'D48', taux: 10000 }, { de: 'D48', avant: 'D24', taux: 5000 }, { de: 'D24', taux: 0 }],
      bornes: 'D48 et D24 appartiennent au palier suivant (at < D strict)',
      unite: 'points de base (10000 = 100 %)',
      annulation_d_office: 'add_exception (P5.R2) : taux FORCE a 10000, aucun palier',
    },
    exemples: [
      { contexte: "S12 debut 09:00 locale le 2031-03-31 (07:00Z) ; D48 = 09:00 locale le 29/03 (+01:00) = 08:00Z", requete: { op: 'cancel', at: '2031-03-29T07:59:00Z', args: { booking_id: 't1' } }, reponse: { ok: true, refund_rate_bp: 10000 } },
      { requete: { op: 'cancel', at: '2031-03-29T08:00:00Z', args: { booking_id: 't2' } }, reponse: { ok: true, refund_rate_bp: 5000 } },
    ],
  },
  implementation: {
    'annulation.taux': ((ctx, b) => {
      if (typeof ctx.d.taux_force === 'number') return ctx.d.taux_force
      const slot = ctx.locataire.slots.get(b.slot_id)
      if (slot === undefined) throw new Error(`CRENEAU-ABSENT ${b.slot_id} pour l'annulation de ${b.booking_id}`)
      const Ls = murale(ctx, Date.parse(slot.starts_at))
      const D48 = versUtc(ctx, Ls - 2 * JOUR_MS)
      const D24 = versUtc(ctx, Ls - JOUR_MS)
      return ctx.instant < D48 ? 10000 : ctx.instant < D24 ? 5000 : 0
    }) satisfies TauxAnnulation,
  },
  grandeurs: ['refund_rate_bp', 'starts_at', 'at'],
})

type Avoir = (ctx: PlatformContext, b: Booking, e: JournalEntry, reason: string) => string | null

/** Membre remboursé d'une réservation : son titulaire, sauf clause active qui désigne le payeur (P23.R4). */
type Payeur = (ctx: PlatformContext, b: Booking) => string

/** Rembourse r_c au portefeuille et inscrit le remboursement ; rend l'avoir éventuel (P14.R4). */
function inscrireRemboursement(ctx: PlatformContext, b: Booking, R: number, rc: number, reason: string, type = 'refund'): string | null {
  const membre = ctx.regleOpt<Payeur>('reservation.payeur')?.(ctx, b) ?? b.member_id
  if (rc > 0) ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, membre, rc)
  if (R <= 0) return null
  const e = ctx.journaliser({ type, member_id: membre, booking_id: b.booking_id, amount_cents: R, credits_cents: rc, card_cents: R - rc })
  return ctx.regleOpt<Avoir>('comptabilite.avoir')?.(ctx, b, e, reason) ?? null
}

/** Frais d'annulation partielle déjà retenus sur une réservation (F, P9.R4 ; lus par P16.R2). */
interface AvecFrais extends Booking {
  frais_retenus_cents?: number
}
const avecFrais = (b: Booking): AvecFrais => b as AvecFrais

const P9_R4 = clause({
  id: 'P9.R4',
  enters: 'P9',
  replaces: 'P8.R4',
  text:
    "Remboursement selon le palier (remplace P8.R4). Soit A = amount_cents restant, C = paid_credits_cents restant, D = paid_card_cents restant (A = C + D) et t le taux du palier (P9.R3) en points de base. Annulation totale : R = floor(A x t / 10000). Annulation partielle de k places sur n : R = floor(A x k x t / (n x 10000)) (un seul arrondi). Dans les deux cas : r_c = floor(R x C / A) (0 si A = 0), r_d = R - r_c ; r_c est re-credite au portefeuille, r_d rendu a la carte ; la reservation garde A - R, C - r_c, D - r_d. Annulation totale : statut cancelled, amount_cents vaut A - R (frais retenus, 0 si t = 10000) ; annulation partielle : seats = n - k, statut confirmed, les places liberees declenchent la promotion. Reponse de cancel : refunded_cents = R, refund = {credits_cents: r_c, card_cents: r_d}, refund_rate_bp, promoted, et pour une partielle seats (et seat_numbers a partir de P11). Avant P9 le taux vaut toujours 10000, ce qui redonne exactement P8.R4. Frais retenus : chaque reservation porte F, la somme des frais d'annulation partielle deja retenus (0 a sa creation) ; une annulation partielle de k places sur n ajoute floor(A x k / n) - R a F (part non rendue des places annulees) ; F sert au recalcul P16.R2. L'annulation d'office par add_exception (P5.R2) rend R = A (taux force 10000).",
  contract: {
    operations: {
      cancel: {
        reponse: { refunded_cents: 'entier = R', refund: { credits_cents: 'entier = r_c', card_cents: 'entier = r_d' }, refund_rate_bp: 'entier', promoted: 'tableau' },
      },
      get_booking: { reponse_cancelled: { amount_cents: 'A - R', paid_credits_cents: 'C - r_c', paid_card_cents: 'D - r_d' } },
    },
    valeurs: {
      arrondi_rembourse: 'floor, un seul arrondi',
      arrondi_part_credits: 'floor, la carte recoit le reste',
      frais_retenus: 'F, 0 a la creation ; annulation partielle de k sur n : F += floor(A x k / n) - R ; lu par P16.R2',
      annulation_d_office: 'add_exception (P5.R2) : R = A (taux force 10000)',
    },
    exemples: [
      { contexte: 'r16a : 4 places, A 4000 ; palier 5000', requete: { op: 'cancel', args: { booking_id: 'r16a', seats: 2 } }, reponse: { ok: true, status: 'confirmed', seats: 2, refunded_cents: 1000, refund_rate_bp: 5000 }, calcul: 'F = floor(4000 x 2 / 4) - 1000 = 1000' },
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
        if (k !== n) avecFrais(b).frais_retenus_cents = (avecFrais(b).frais_retenus_cents ?? 0) + Math.floor((A * k) / n) - R
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
})

const P9_R5 = clause({
  id: 'P9.R5',
  enters: 'P9',
  replaces: 'P5.R1',
  text:
    "create_recurring {series_id, weekday, start_time, capacity, from_date, until_date} (admin, staff) (remplace P5.R1) : weekday est le jour ISO (1 = lundi ... 7 = dimanche) ; start_time 'HH:MM' est l'heure MURALE locale du site (fuseau du locataire a l'instant de create_recurring, P9.R1) ; from_date et until_date 'AAAA-MM-JJ' sont des dates du calendrier LOCAL, bornes INCLUSES. Controles apres ceux d'acteur, dans cet ordre (le premier qui echoue donne la reponse, rien n'est cree) : (1) series_id absent ou vide, weekday hors 1..7, start_time hors 'HH:MM' (00:00 a 23:59), capacity non entiere ou hors de 1..10000, date mal formee, from_date > until_date, plage de plus de 366 jours (until_date - from_date > 365 jours), ou plage ne contenant aucun jour weekday -> INVALID_ARGUMENT ; (2) series_id deja pris dans le locataire, ou slot_id d'une seule de ses occurrences deja pris -> ALREADY_EXISTS (tout ou rien). Cree un creneau par date locale d de [from_date, until_date] dont le jour ISO vaut weekday, de slot_id '<series_id>@<AAAA-MM-JJ>' (d), capacite capacity, et de starts_at l'instant UTC de '<d> <start_time>' en heure locale, converti par P9.R2 (heure inexistante lue a +01:00, heure ambigue = premiere occurrence). Une serie hebdomadaire garde donc la meme heure locale de part et d'autre d'un changement d'heure ; en 'UTC', le resultat est celui de P5.R1. Les creneaux deja crees ne bougent pas. Reponse {ok: true, series_id, slot_ids} en ordre chronologique.",
  contract: {
    operations: {
      create_recurring: {
        roles_autorises: ['admin', 'staff'],
        arguments: {
          series_id: 'chaine non vide',
          weekday: 'entier 1..7 (ISO, 1 = lundi)',
          start_time: "'HH:MM' heure murale locale du site",
          capacity: 'entier de 1 a 10000',
          from_date: "'AAAA-MM-JJ' date locale, incluse",
          until_date: "'AAAA-MM-JJ' date locale, incluse, until_date - from_date <= 365 jours",
        },
        reponse: { ok: true, series_id: 'chaine', slot_ids: 'tableau chronologique, au moins une occurrence' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'],
        ordre_des_controles: ['INVALID_ARGUMENT (arguments, plage, serie sans occurrence)', 'ALREADY_EXISTS (tout ou rien)'],
      },
    },
    valeurs: { weekday: 'ISO 8601, 1 = lundi', bornes: 'incluses', fuseau: 'heure murale locale du site (P9.R2)', capacity: '1..10000', plage_max: '366 dates (until_date - from_date <= 365 jours)' },
    exemples: [
      {
        contexte: "t-clar en 'Europe/Paris' ; dimanches 23/03, 30/03 (passage a l'ete) et 06/04/2031 a 02:30 locale",
        requete: { op: 'create_recurring', args: { series_id: 'W9', weekday: 7, start_time: '02:30', capacity: 1, from_date: '2031-03-23', until_date: '2031-04-06' } },
        reponse: { ok: true, series_id: 'W9', slot_ids: ['W9@2031-03-23', 'W9@2031-03-30', 'W9@2031-04-06'] },
        calcul: "23/03 : 02:30+01:00 = 01:30Z ; 30/03 : 02:30 inexistante, lue a +01:00 = 01:30Z (03:30+02:00) ; 06/04 : 02:30+02:00 = 00:30Z",
      },
      { calcul: "26/10/2031 a 02:30 locale (ambigue) : premiere occurrence, +02:00 = 00:30Z" },
    ],
  },
  implementation: {
    'autorisation.create_recurring': ['admin', 'staff'],
    'serie.dates': datesDeSerie,
    'create_recurring.effet': (ctx: PlatformContext): PlatformResponse =>
      creerSerie(ctx, (c, d, hhmm) => isoSeconde(versUtc(c, Date.parse(`${d}T${hhmm}:00Z`)))),
  },
  grandeurs: ['series_id', 'weekday', 'start_time', 'capacity', 'from_date', 'until_date', 'slot_id', 'starts_at', 'slot_ids'],
  unites: {
    start_time: { unit: 'heure murale locale du site', format: "'HH:MM' (00:00 a 23:59), convertie par P9.R2" },
    from_date: { unit: 'date du calendrier LOCAL du site', format: "'AAAA-MM-JJ', borne incluse" },
    until_date: { unit: 'date du calendrier LOCAL du site', format: "'AAAA-MM-JJ', borne incluse, until_date - from_date <= 365 jours" },
  },
})

/* ═══════════════════════════════════════════════════════════════════ P10 */

const CLE_ABSENCES = 'absences'
const CLE_SUSPENSIONS = 'absences.suspensions'
const FENETRE_ABSENCES_MS = 30 * 86_400_000
const SUSPENSION_MS = 7 * 86_400_000
const SEUIL_ABSENCES = 3

interface Absence {
  /** Modifiable : l'effacement P18 remplace l'identifiant du membre. */
  member_id: string
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
  'promotion.condition.creneau_ouvert': ((ctx, slot) => creneauOuvert(ctx, slot)) satisfies ConditionPromotion,
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
    "Promotion premier-qui-tient (remplace P6.R4). Apres toute liberation de places, on parcourt la file depuis la tete et on promeut la PREMIERE reservation qui tient ; on recommence depuis la tete tant qu'une reservation tient. Tenir : non numerote, seats <= available ; numerote, il existe un bloc de seats places consecutives libres, et la reservation promue recoit le bloc libre de plus petit premier numero. Les reservations sautees gardent leur rang ; promoted liste les promus dans l'ordre de promotion. Une liberation de places a un instant at >= starts_at du creneau (annulation tardive, totale ou partielle) ne promeut personne : promoted = [] et les reservations en file y restent (a partir de P13, close_slot les expire).",
  contract: {
    operations: { cancel: { reponse: { promoted: 'tableau de booking_id, ordre de promotion' } } },
    exemples: [{ contexte: 'S17 : n2 annulee, n4 (1 place) en tete de file', requete: { op: 'cancel', args: { booking_id: 'n2' } }, reponse: { ok: true, booking_id: 'n2', status: 'cancelled', promoted: ['n4'] } }],
    liberation_tardive: 'at >= starts_at du creneau : aucune promotion, la file reste (P13 : close_slot l expire)',
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
    "RAPPORT DE BUG BUG-P12, comportement correct (remplace P11.R4, qu'il precise sans en changer le sens). Promotion premier-qui-tient : apres toute liberation de places, on parcourt la file depuis la tete et on promeut la PREMIERE reservation qui tient ; on recommence depuis la tete tant qu'une reservation tient. Sur un creneau numerote, une reservation tient s'il existe un bloc de seats places consecutives libres parmi TOUTES les places libres du creneau au moment du parcours, quelle que soit l'operation qui les a liberees (annulation totale, partielle, ou une operation anterieure) ; la reservation promue recoit le bloc libre de plus petit premier numero. Non numerote : seats <= available. Les reservations sautees gardent leur rang ; promoted liste les promus dans l'ordre de promotion. Scenario de reproduction fourni (sans la cause) : creneau numerote de 4 places ; x1 (1 place) recoit [1], x2 (2) [2,3], x3 (1) [4] ; x4 (2) attend ; annuler x1 ne promeut personne ; annuler 1 place de x2 libere la place 3 et ne promeut personne ; annuler x3 doit promouvoir x4 sur [3,4]. Observe en production : x4 reste en file. Une liberation de places a un instant at >= starts_at du creneau (annulation tardive, totale ou partielle) ne promeut personne : promoted = [] et les reservations en file y restent (a partir de P13, close_slot les expire).",
  contract: {
    operations: { cancel: { reponse: { promoted: 'tableau de booking_id, ordre de promotion' } } },
    liberation_tardive: 'at >= starts_at du creneau : aucune promotion, la file reste (P13 : close_slot l expire)',
    rapport_de_bug: { id: 'BUG-P12', observe: { requete: { op: 'cancel', args: { booking_id: 'x3' } }, reponse: { ok: true, booking_id: 'x3', status: 'cancelled', promoted: [] } } },
    exemples: [
      { contexte: 'S16 numerote de 4 places : libres {1, 3} ; x3 [4] ; x4 (2) en file', requete: { op: 'cancel', args: { booking_id: 'x3' } }, reponse: { ok: true, booking_id: 'x3', status: 'cancelled', promoted: ['x4'] } },
      { requete: { op: 'get_booking', args: { booking_id: 'x4' } }, reponse: { ok: true, booking_id: 'x4', status: 'confirmed', seats: 2, seat_numbers: [3, 4] } },
    ],
  },
  implementation: implementationPromotion,
  grandeurs: ['promoted', 'seats', 'available', 'seat_numbers', 'free_seats'],
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
})

/* ═══════════════════════════════════════════════════════════════════ P14 */

const CLE_FACTURATION = 'facturation'
interface Facturation {
  readonly emis: Set<string>
  readonly factures: Map<string, Json>
  readonly avoirs: Json[]
  seq: number
}
const nouvelleFacturation = (): Facturation => ({ emis: new Set(), factures: new Map(), avoirs: [], seq: 0 })
const facturation = (ctx: PlatformContext): Facturation => ctx.donnee<Facturation>(CLE_FACTURATION, nouvelleFacturation)
/** Facturation d'un locataire quelconque (pas forcément celui de l'opération). */
const facturationDe = (t: Tenant): Facturation => {
  if (!t.donnees.has(CLE_FACTURATION)) t.donnees.set(CLE_FACTURATION, nouvelleFacturation())
  return t.donnees.get(CLE_FACTURATION) as Facturation
}

type MoisDe = (ctx: PlatformContext, t: number) => string
type DebutMois = (ctx: PlatformContext, mois: string) => number
type Lignes = (ctx: PlatformContext, member: string, mois: string) => JournalEntry[]
type Facture = (ctx: PlatformContext, member: string, mois: string) => Json
type Rapprochement = (ctx: PlatformContext, member: string) => void
/** Sortie du portefeuille portée par une facture hors credits_used (P22.R4 : expired_cents ; P18.R1 : wallet_refunds_cents). */
type SortieDeFacture = (facture: Json) => number
/** Champs ajoutés à une facture par une clause active à son émission, calculés sur ses lignes (P18.R1 : wallet_refunds_cents). */
type ChampDeFacture = (lignes: readonly JournalEntry[]) => Json
/** Champs ajoutés par les clauses actives, insérés avant opening_balance_cents. */
const champsDeFacture = (ctx: PlatformContext, lignes: readonly JournalEntry[]): Json =>
  Object.assign({}, ...ctx.regles<ChampDeFacture>('comptabilite.champ.').map((f) => f(lignes))) as Json

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
    "issue_invoices {month} (admin) emet les factures du mois 'AAAA-MM'. Controles apres ceux d'acteur : month mal forme (mois hors 01..12) -> INVALID_ARGUMENT ; mois non termine (at < premier instant du mois suivant en heure locale du site) -> INVALID_ARGUMENT ; mois deja emis pour ce locataire -> ALREADY_EXISTS. Une facture est emise pour chaque membre ayant au moins une ligne ou un avoir emis dans le mois ; invoice_id = 'INV-<AAAA-MM>-<member_id>'. Reponse {ok: true, month, invoice_ids} par member_id croissant (ordinal). Une facture emise est IMMUABLE : elle ne change plus jamais. A partir de P14, set_timezone (P9.R1) est refuse {ok: false, error: 'INVALID_ARGUMENT'}, sans effet, des que le locataire a emis au moins une facture, meme vers le fuseau deja en vigueur ; avant la premiere facture il reste permis.",
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
      { contexte: 't-alpha a emis des factures', requete: { op: 'set_timezone', tenant: 't-alpha', actor: 'm-ana', args: { timezone: 'Europe/Paris' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { contexte: "t-clar n'a emis aucune facture", requete: { op: 'set_timezone', tenant: 't-clar', actor: 'm-own', args: { timezone: 'Europe/Paris' } }, reponse: { ok: true, tenant_id: 't-clar', timezone: 'Europe/Paris' } },
    ],
    fuseau_verrouille: "set_timezone -> INVALID_ARGUMENT, sans effet, des la premiere facture emise du locataire (meme vers le fuseau en vigueur)",
  },
  implementation: {
    'autorisation.issue_invoices': ['admin'],
    'set_timezone.etape.factures': etape(10, (ctx) => (facturation(ctx).emis.size > 0 ? fail('INVALID_ARGUMENT') : undefined)),
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
      // toutes les factures sont calculees avant toute ecriture ; l'emission est atomique : si le controle de
      // rapprochement (P14.R6) leve, ni les factures ni le mois emis ne restent inscrits
      const factures = tries.map((m) => ctx.regle<Facture>('comptabilite.facture')(ctx, m, month))
      const invoice_ids = factures.map((x) => String(x.invoice_id))
      for (const x of factures) f.factures.set(String(x.invoice_id), x)
      f.emis.add(month)
      try {
        for (const m of tries) ctx.regle<Rapprochement>('comptabilite.rapprochement')(ctx, m)
      } catch (e) {
        for (const id of invoice_ids) f.factures.delete(id)
        f.emis.delete(month)
        throw e
      }
      return succeed({ month, invoice_ids })
    },
  },
  grandeurs: ['month', 'invoice_ids', 'invoice_id', 'at', 'timezone'],
})

const P14_R3 = clause({
  id: 'P14.R3',
  enters: 'P14',
  exits: 'P22',
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
        ...champsDeFacture(ctx, lignes),
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
        invoice_id: `INV-${moisCharge}-${e.member_id}`,
        member_id: e.member_id,
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
})

/** Réponse de list_documents pour member_id (P14.R5) : factures par mois croissant, avoirs par identifiant croissant. */
function documentsDe(ctx: PlatformContext, member_id: unknown): PlatformResponse {
  const f = facturation(ctx)
  const invoices = [...f.factures.values()]
    .filter((x) => x.member_id === member_id)
    .sort((a, b) => (String(a.month) < String(b.month) ? -1 : 1))
  const credit_notes = f.avoirs
    .filter((a) => a.member_id === member_id)
    .sort((a, b) => (String(a.credit_note_id) < String(b.credit_note_id) ? -1 : 1))
  return succeed({ member_id, invoices: clone(invoices), credit_notes: clone(credit_notes) })
}

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
      return documentsDe(ctx, member_id)
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
      // precision Q19 : une facture s'ouvre sur le solde REEL (meme la premiere) ; chaque facture verifie seule son
      // identite ; la suivante s'ouvre sur la cloture de la precedente des qu'aucun mois strictement entre les deux ne
      // porte de mouvement du membre ; la somme ne contraint le solde qu'une fois tous ses mois a mouvement emis
      const f = facturation(ctx)
      const moisDe = ctx.regle<MoisDe>('comptabilite.mois')
      const aMouvement = new Set<string>()
      for (const h of historiquePortefeuille(ctx)) if (h.member_id === member) aMouvement.add(moisDe(ctx, h.t))
      for (const e of ctx.locataire.journal) {
        if (e.member_id === member && e.amount_cents > 0 && e.avoir === undefined) aMouvement.add(moisDe(ctx, Date.parse(e.at)))
      }
      for (const a of f.avoirs) if (a.member_id === member) aMouvement.add(String(a.month))
      const factures = [...f.factures.values()].filter((x) => x.member_id === member).sort((a, b) => (String(a.month) < String(b.month) ? -1 : 1))
      const sorties = ctx.regles<SortieDeFacture>('comptabilite.sortie.')
      let precedente: Json | null = null
      let somme = 0
      for (const x of factures) {
        const n = (k: string): number => x[k] as number
        const avoirs = f.avoirs.filter((a) => a.member_id === member && a.month === x.month).reduce((s, a) => s + (a.credits_cents as number), 0)
        const autres = sorties.reduce((s, sortie) => s + sortie(x), 0)
        const variation = n('top_ups_cents') + n('compensations_cents') + avoirs - n('credits_used_cents') - autres
        const chainee =
          precedente !== null && ![...aMouvement].some((m) => m > String((precedente as Json).month) && m < String(x.month))
        if (
          (chainee && n('opening_balance_cents') !== ((precedente as Json).closing_balance_cents as number)) ||
          n('credit_notes_credits_cents') !== avoirs ||
          n('closing_balance_cents') !== n('opening_balance_cents') + variation ||
          n('card_cents') + n('credits_used_cents') !== n('total_cents')
        ) {
          throw new Error(`RAPPROCHEMENT-ROMPU ${String(x.invoice_id)}`)
        }
        somme += variation
        precedente = x
      }
      // condition de P14.R6 : chaque mois portant un mouvement ou un avoir du membre est emis (le mois en cours, non
      // termine, ne l'est jamais : un mouvement depuis la fin du dernier mois facture suspend la contrainte)
      const condition = [...aMouvement].every((m) => f.emis.has(m))
      if (condition && factures.length > 0) {
        const derniere = factures[factures.length - 1] as Json
        const solde = ctx.regle<Solde>('portefeuille.solde')(ctx, member)
        if (somme !== solde || derniere.closing_balance_cents !== solde) {
          throw new Error(`RAPPROCHEMENT-ROMPU ${String(derniere.invoice_id)}`)
        }
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
    "set_rate {currency, date, rate_micro} (admin) inscrit un taux dans la table datee du locataire. currency vaut 'USD' (l'EUR est la devise de compte, taux implicite 1) ; date 'AAAA-MM-JJ' ; rate_micro entier de 1 a 10 000 000 inclus = nombre d'EUR pour 1 USD multiplie par 1 000 000 (912500 = 0,9125 EUR par USD). Sinon INVALID_ARGUMENT. Un taux deja inscrit pour (currency, date) -> ALREADY_EXISTS (la table ne se reecrit pas). Reponse {ok: true, currency, date, rate_micro}.",
  contract: {
    operations: {
      set_rate: {
        roles_autorises: ['admin'],
        arguments: { currency: "'USD'", date: "'AAAA-MM-JJ'", rate_micro: 'entier de 1 a 10 000 000 (EUR par USD x 10^6)' },
        reponse: { ok: true, currency: "'USD'", date: 'chaine', rate_micro: 'entier' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'],
      },
    },
    valeurs: { unite_rate_micro: 'EUR par USD x 10^6', devises: [...DEVISES], devise_de_compte: 'EUR', rate_micro_min: 1, rate_micro_max: RATE_MICRO_MAX },
    exemples: [
      { requete: { op: 'set_rate', actor: 'm-ana', args: { currency: 'USD', date: '2031-06-01', rate_micro: 912500 } }, reponse: { ok: true, currency: 'USD', date: '2031-06-01', rate_micro: 912500 } },
      { requete: { op: 'set_rate', actor: 'm-ana', args: { currency: 'GBP', date: '2031-06-01', rate_micro: 1170000 } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.set_rate': ['admin'],
    'set_rate.effet': (ctx: PlatformContext): PlatformResponse => {
      const { currency, date, rate_micro } = ctx.args
      if (currency !== 'USD' || dateUtc(date) === null || !estEntier(rate_micro) || rate_micro < 1 || rate_micro > RATE_MICRO_MAX) return fail('INVALID_ARGUMENT')
      const table = ctx.donnee<Map<string, number>>(CLE_TAUX, () => new Map())
      if (table.has(String(date))) return fail('ALREADY_EXISTS')
      table.set(String(date), rate_micro)
      return succeed({ currency, date, rate_micro })
    },
  },
  grandeurs: ['currency', 'date', 'rate_micro'],
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
    "Portefeuille (remplace P8.R1). Chaque membre a, dans chaque locataire, un portefeuille balance_cents en centimes d'EUR (entier >= 0, initialement 0). top_up {member_id, amount_cents, currency?} (admin, staff) : amount_cents entier de 1 a 100 000 000 et currency absente, 'EUR' ou 'USD', sinon INVALID_ARGUMENT ; member_id non membre -> NOT_FOUND ; en USD, sans taux applicable -> RATE_UNAVAILABLE, sinon credited_cents = conversion P15.R3 de amount_cents au taux applicable a at ; en EUR credited_cents = amount_cents. Reponse {ok: true, member_id, balance_cents (apres), credited_cents, currency, rate_micro (USD seulement)}. get_wallet {member_id} : admin, staff pour tout membre ; member pour lui-meme seulement (sinon FORBIDDEN) ; reponse {ok: true, member_id, balance_cents}.",
  contract: {
    operations: {
      top_up: {
        roles_autorises: ['admin', 'staff'],
        arguments: { member_id: 'chaine', amount_cents: 'entier de 1 a 100 000 000 (centimes de currency)', currency: "'EUR' (defaut) | 'USD'" },
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
      if (!rechargeValide(amount_cents) || typeof currency !== 'string' || !(DEVISES as readonly string[]).includes(currency)) {
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
    "set_price {slot_id, price_cents, currency?} (admin) (remplace P7.R1) : prix PAR PLACE en centimes entiers de 0 a 100 000 000 de currency ('EUR' par defaut, ou 'USD' ; autre -> INVALID_ARGUMENT) ; reponse {ok: true, slot_id, price_cents, currency}. Tout creneau a le prix 0 EUR tant qu'aucun prix n'est fixe.",
  contract: {
    operations: {
      set_price: {
        roles_autorises: ['admin'],
        arguments: { slot_id: 'chaine', price_cents: 'entier de 0 a 100 000 000 (centimes de currency, par place)', currency: "'EUR' (defaut) | 'USD'" },
        reponse: { ok: true, slot_id: 'chaine', price_cents: 'entier', currency: 'chaine' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { prix_par_defaut: '0 EUR', price_cents_min: 0, price_cents_max: PRIX_MAX_CENTS },
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
      if (!prixValide(p) || typeof currency !== 'string' || !(DEVISES as readonly string[]).includes(currency)) return fail('INVALID_ARGUMENT')
      slot.price_cents = p
      slot.price_currency = currency
      return succeed({ slot_id: slot.slot_id, price_cents: p, currency })
    },
  },
  grandeurs: ['slot_id', 'price_cents', 'currency'],
  unites: { price_cents: PRIX_EN_DEVISE },
})

const P15_R6 = clause({
  id: 'P15.R6',
  enters: 'P15',
  exits: 'P22',
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
    "change_price {slot_id, price_cents, effective_from} (admin) : changement de prix RETROACTIF. Controles apres ceux d'acteur : slot_id inconnu -> NOT_FOUND ; price_cents entier de 0 a 100 000 000 sinon INVALID_ARGUMENT ; effective_from instant ISO 8601 UTC <= at, sinon INVALID_ARGUMENT. Effet : le prix du creneau devient price_cents (devise inchangee) pour toute confirmation FUTURE (reservation ou promotion apres cette operation). Reponse {ok: true, slot_id, price_cents, adjusted} ou adjusted liste, dans l'ordre de confirmation, {booking_id, refunded_cents, refund: {credits_cents, card_cents}, credit_note_id} des reservations ajustees.",
  contract: {
    operations: {
      change_price: {
        roles_autorises: ['admin'],
        arguments: { slot_id: 'chaine', price_cents: 'entier de 0 a 100 000 000', effective_from: "'AAAA-MM-JJTHH:MM:SSZ' <= at" },
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
      if (!prixValide(price_cents)) return fail('INVALID_ARGUMENT')
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
    "Trop-percus. Pour chaque reservation confirmed du creneau dont l'instant de confirmation est >= effective_from (borne incluse), dans l'ordre de confirmation : A' = montant recalcule par P15.R6 pour ses seats ACTUELS, avec le nouveau prix mais le niveau (taux de remise) et, en USD, le rate_micro de SA confirmation, PLUS F, la somme des frais d'annulation partielle deja retenus sur la reservation (P9.R4). Le trop-percu T = A - A' ne rend donc jamais des frais d'annulation. Si A' < A (amount_cents actuel) : trop-percu T = A - A' ; r_c = floor(T x C / A), r_d = T - r_c ; r_c re-credite au portefeuille, r_d rendu a la carte ; la reservation garde A', C - r_c, D - r_d. Si A' >= A : rien (une hausse ne s'applique qu'aux confirmations futures). Les reservations confirmees avant effective_from, waiting, annulees ou debarquees ne changent pas. Monnaie (Q63, decision du mandant du 27/10/2026) : seules sont recalculees les reservations confirmees dans la devise ACTUELLE du creneau (devise d'une reservation : 'USD' si elle porte price_currency 'USD' (P15.R6), 'EUR' sinon, y compris avant P15) ; un changement de devise par set_price n'est jamais retroactif : une reservation confirmee dans une autre devise que celle du creneau au moment de change_price n'est pas ajustee, ne figure pas dans adjusted et ne produit ni remboursement, ni ligne, ni avoir ; ce n'est pas une erreur.",
  contract: {
    valeurs: { borne_effective_from: 'incluse', arrondi_part_credits: 'floor, la carte recoit le reste', A_prime: 'montant P15.R6 au nouveau prix pour les seats actuels + F (frais retenus, P9.R4)', devise: 'seulement les reservations confirmees dans la devise actuelle du creneau ; autre devise : non ajustee, absente de adjusted, sans erreur' },
    operations: { change_price: { adjusted: { refunded_cents: 'T = A - A\'', refund: { credits_cents: 'r_c', card_cents: 'r_d' } } } },
    exemples: [
      { contexte: "y2 : silver, A 1800, C 88, D 1712, confirmee a effective_from ; nouveau prix 1600", calcul: "A' = 1600 - 160 = 1440 ; T = 360 ; r_c = floor(360 x 88 / 1800) = 17 ; r_d = 343" },
      { contexte: 'r16a : 2 places restantes, A 3000, F 1000 ; nouveau prix 800', calcul: "A' = 2 x 800 + 1000 = 2600 ; T = 400 (les frais retenus ne sont pas rendus)" },
      { contexte: 'Q63 (t-q63) : u1 confirmee 2000 EUR sur C1, puis set_price C1 2000 USD', calcul: 'change_price 1500 -> adjusted [] : u1 (EUR) n est pas dans la devise actuelle du creneau (USD), sans erreur' },
    ],
  },
  implementation: {
    'tarif.trop_percus': ((ctx, slot, effective_from) => {
      const devise = ctx.regle<Devise>('tarif.devise')(ctx, slot)
      const prix = ctx.regle<(ctx: PlatformContext, s: Slot | undefined) => number>('tarif.prix')(ctx, slot)
      // Q63 (decision du mandant) : seules les reservations confirmees dans la devise ACTUELLE du creneau sont
      // recalculees ; devise d'une reservation : 'USD' si elle porte price_currency 'USD', 'EUR' sinon
      const deviseDe = (b: Booking): string => (b.price_currency === 'USD' ? 'USD' : 'EUR')
      const concernees = [...ctx.locataire.bookings.values()]
        .filter((b) => b.slot_id === slot.slot_id && b.status === 'confirmed' && b.confirmed_at !== undefined && Date.parse(b.confirmed_at) >= effective_from)
        .filter((b) => deviseDe(b) === devise)
        .sort((a, b) => (a.confirmation_seq ?? a.seq) - (b.confirmation_seq ?? b.seq))
      const out: Ajustement[] = []
      for (const b of concernees) {
        const A = b.amount_cents ?? 0
        const taux_bp = b.discount_bp ?? ctx.regle<(ctx: PlatformContext, m: string) => number>('tarif.taux_remise')(ctx, b.member_id)
        const { amount_cents: A2 } = ctx.regle<Montant>('tarif.montant')(ctx, {
          seats: b.seats, prix, devise, taux_bp, ...(b.rate_micro === undefined ? {} : { rate_micro: b.rate_micro }),
        })
        const Aprime = A2 + (avecFrais(b).frais_retenus_cents ?? 0)
        if (Aprime >= A) continue
        const T = A - Aprime
        const C = b.paid_credits_cents ?? 0
        const D = b.paid_card_cents ?? A - C
        const rc = Math.floor((T * C) / A)
        b.amount_cents = Aprime
        b.paid_credits_cents = C - rc
        b.paid_card_cents = D - (T - rc)
        const credit_note_id = ctx.regle<DocumentTropPercu>('comptabilite.trop_percu')(ctx, b, T, rc)
        out.push({ booking_id: b.booking_id, refunded_cents: T, refund: { credits_cents: rc, card_cents: T - rc }, credit_note_id })
      }
      return out
    }) satisfies TropPercus,
  },
  grandeurs: ['effective_from', 'amount_cents', 'paid_credits_cents', 'paid_card_cents', 'refunded_cents', 'refund.credits_cents', 'refund.card_cents', 'balance_cents'],
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

/** Textes d'énoncé des clauses P17 à P24 (règles Pn.Rk). */
const TEXTE_P17_R1 =
  "merge_tenants {source_tenant_id} fusionne le locataire SOURCE dans le locataire CIBLE, qui est le locataire de l'enveloppe (champ tenant) ; actor admin de la cible (P4.R2, P4.R3). Controles apres ceux d'acteur, dans cet ordre (le premier qui echoue donne la reponse, sans aucun effet) : (1) source_tenant_id inconnu (jamais cree, ou deja fusionne) -> NOT_FOUND ; (2) source_tenant_id = cible -> INVALID_ARGUMENT ; (3) actor non admin de la source -> FORBIDDEN ; (4) la source ou la cible a deja emis au moins une facture (P14.R2) -> INVALID_ARGUMENT ; (5) un identifiant renomme par P17.R2 existe deja dans son espace de la cible ou de la source -> INVALID_ARGUMENT. ; (6) le member_id d'un membre de la source (proprietaire compris) est egal a un pseudonyme (P18.R1) de la cible -> INVALID_ARGUMENT (Q64). Effet : tout le contenu de la source passe dans la cible (P17.R2 a P17.R4), puis la source cesse d'exister : toute operation dont le champ tenant la nomme -> NOT_FOUND (P3.R2), merge_tenants qui la nomme -> NOT_FOUND, et create_tenant avec son identifiant -> ALREADY_EXISTS (l'identifiant reste reserve). La cible garde son proprietaire, son fuseau (P9.R1), sa sequence d'avoirs (P14.R4) et de pseudonymes (P18.R1) ; la table de taux (P15.R1) de la source s'ajoute a celle de la cible, une date deja presente dans la cible gardant le taux de la cible. Reponse {ok: true, tenant_id (la cible), source_tenant_id, renamed, merged_members, added_members}."
const TEXTE_P17_R2 =
  "Collisions d'identifiants, regle declaree. Espaces de noms : (a) slot_id ; (b) series_id ; (c) request_id / booking_id : les reservations ET les cles d'idempotence memorisees (P1.R4, y compris celles d'une reponse d'erreur) ; (d) import_id (P20.R1) ; (e) pseudonymes (P18.R1). Un identifiant de la SOURCE qui existe deja dans le meme espace de la CIBLE est renomme '<source_tenant_id>:<identifiant>' (exemple : 'M1' de t-mig-b devient 't-mig-b:M1') ; un identifiant sans collision garde son nom ; les identifiants de la cible ne changent jamais. Tout ce qui reference un identifiant renomme suit : slot_id des reservations, file d'attente, occurrences d'une serie, cle et booking_id/slot_id d'une reponse memorisee. renamed liste les renommages {kind, from, to} : kind 'slot', puis 'series', puis 'booking' (cle portant une reservation), puis 'request' (cle memorisee sans reservation), puis 'import', puis 'pseudonym' ; dans chaque kind, from croissant (ordinal UTF-16). Les member_id ne sont jamais renommes (P17.R3). Une serie et ses occurrences se renomment ENSEMBLE : si series_id ou le slot_id de l'une de ses occurrences courantes entre en collision, series_id et tous les slot_id '<series_id>@<date>' de la serie recoivent le prefixe '<source_tenant_id>:' (le lien '<series_id>@<date>' est conserve) ; chacun de ces renommages figure dans renamed (kind 'slot' pour les occurrences, 'series' pour la serie). Un pseudonyme de la source (P18.R1) deja present dans la cible, comme pseudonyme ou comme member_id, est renomme '<source_tenant_id>:<pseudonyme>', avec tout ce qui le cite (portefeuille, historique, lots, factures, avoirs, reservations) ; renomme ou non, il reste un pseudonyme lisible dans la cible (P18.R3). Ce renommage figure dans renamed sous le kind 'pseudonym', place apres 'import'."
const TEXTE_P17_R3 =
  "Membres. Un member_id present dans les deux locataires designe la MEME personne : il n'est pas renomme ; son role devient le plus eleve des deux (admin > staff > member) ; son niveau (P7.R2) celui de plus fort taux de remise ; son portefeuille la SOMME des deux soldes, l'historique du portefeuille de la source (mouvements et lots P22.R2) rejoignant celui de la cible avec ses instants ; suspended_until la plus tardive des deux (null si aucune). Un membre present seulement dans la source est ajoute avec son role, son niveau, son portefeuille et sa suspension. merged_members (presents dans les deux) et added_members (source seulement) : member_id croissants (ordinal). Un pseudonyme (P18.R1) n'est pas un membre : il ne figure ni dans merged_members ni dans added_members et suit P17.R2 (e)."
const TEXTE_P17_R4 =
  "Historique conserve. Chaque reservation de la source passe dans la cible avec TOUT son etat, inchange hors renommage P17.R2 : member_id, status, seats, seat_numbers, rang en file d'attente, no_show, amount_cents, paid_credits_cents, paid_card_cents, devise et taux d'origine (P15.R6), instant et rang de confirmation (l'ordre de confirmation P13.R3 reste l'ordre global de la trajectoire), mouvements financiers (P14.R1). A partir de P17, toute reservation porte origin = {tenant_id, booking_id} : le locataire et le booking_id sous lesquels elle a ete CREEE (pour une reservation jamais fusionnee : son locataire et son booking_id actuels) ; les vues de reservation (reserve, get_booking) portent origin. Une reponse memorisee de la source est conservee sous sa cle (renommee s'il y a lieu) : seuls ses champs booking_id et slot_id de premier niveau sont reecrits selon le renommage ; le reste (dont origin) est inchange ; elle est rejouee a l'identique sous cette cle."
const TEXTE_P18_R1 =
  "erase_member {member_id} (admin). Controles apres ceux d'acteur, dans cet ordre : member_id non membre du locataire (y compris un pseudonyme, ou un membre deja efface) -> NOT_FOUND ; member_id = proprietaire du locataire, ou = actor -> INVALID_ARGUMENT ; le membre a une reservation active (confirmed ou waiting) sur un creneau dont starts_at > at -> INVALID_ARGUMENT (elle doit d'abord etre annulee). Effet : le membre recoit un pseudonyme 'anon-nnnn' (sequence par locataire, 4 chiffres, a partir de anon-0001) et est anonymise (P18.R2) ; un solde de portefeuille non nul est rembourse sur sa carte et le portefeuille passe a 0 (mouvement 'wallet_refund', precision Q38). Reponse {ok: true, member_id (le pseudonyme), invoice_ids (factures renommees, ordre croissant), credit_note_ids (avoirs du membre, ordre croissant), bookings_anonymized (nombre de reservations dont member_id, ou le payeur P23.R4, valait le membre)}."
const TEXTE_P18_R2 =
  "Anonymisation. Dans tout le locataire, l'identifiant efface est remplace par le pseudonyme : member_id (et payeur) des reservations, portefeuille (solde, historique, lots), niveau, suspension, reponses et arguments memorises (seules les valeurs EGALES au member_id des cles member_id, payer_member_id, from_member_id et to_member_id, a toute profondeur, ainsi que le suffixe des invoice_id 'INV-<AAAA-MM>-<member_id>' ; un slot_id, un request_id ou un autre identifiant egal par hasard au member_id ne change pas), factures et avoirs (member_id, et l'invoice_id 'INV-<AAAA-MM>-<member_id>' devient 'INV-<AAAA-MM>-<pseudonyme>', y compris l'invoice_id cite par un avoir). C'est la SEULE exception a l'immuabilite des factures (P14.R2) : elle ne remplace que des identifiants ; aucun montant, aucune ligne, aucun ordre ne change ; les totaux de toutes les factures restent intacts. Les identifiants des autres membres, des reservations et des avoirs ne changent pas."
const TEXTE_P18_R3 =
  "Apres effacement. Le membre efface n'est plus membre : il ne peut plus agir (FORBIDDEN, P4.R2) ; toute operation qui le designe comme member_id (reserve, top_up, set_tier, erase_member, ...) -> NOT_FOUND, et de meme pour le pseudonyme, sauf en lecture : list_documents, get_wallet (admin, staff) et le filtre member_id de report_revenue (P19.R3) acceptent le pseudonyme ; get_booking rend le pseudonyme. Les documents futurs du pseudonyme portent 'INV-<AAAA-MM>-<pseudonyme>' ; issue_invoices range les pseudonymes parmi les member_id par ordre croissant (ordinal). add_member avec l'ancien identifiant cree un NOUVEAU membre, sans historique (solde 0, aucun document)."
const TEXTE_P19_R1 =
  "report_occupancy {from, to, min_fill_bp?, sort?, page_size?, page?} (admin, staff). Controles apres ceux d'acteur, dans cet ordre : from ou to absent ou pas au format 'AAAA-MM-JJTHH:MM:SSZ', ou from >= to -> INVALID_ARGUMENT ; min_fill_bp (defaut 0) pas un entier >= 0 -> INVALID_ARGUMENT ; sort (defaut 'starts_at') hors de {'starts_at', '-fill_bp', 'slot_id'} -> INVALID_ARGUMENT ; page_size (defaut 20) pas un entier de 1 a 100, ou page (defaut 1) pas un entier >= 1 -> INVALID_ARGUMENT. Lignes : une par creneau existant du locataire (une occurrence exceptee par P5.R2 n'existe plus) dont from <= starts_at < to (borne haute EXCLUE) : {slot_id, starts_at, capacity, booked, fill_bp}, booked = somme des seats des reservations confirmed (P13.R1), fill_bp = floor(booked x 10000 / capacity) (points de base ; peut depasser 10000 en surreservation). Filtre : fill_bp >= min_fill_bp (borne incluse)."
const TEXTE_P19_R2 =
  "Tri stable et pagination. Ordre : la cle de sort ('starts_at' croissant, '-fill_bp' decroissant, 'slot_id' croissant ordinal), puis, a egalite, starts_at croissant, puis slot_id croissant ordinal (unites UTF-16) : l'ordre est total et ne depend ni de l'ordre de creation, ni de la page demandee. total = nombre de lignes apres filtre ; pages = ceil(total / page_size) (0 si total = 0) ; rows = les lignes de rang (page - 1) x page_size + 1 a page x page_size. Une page au-dela de la derniere rend rows = [] (ce n'est pas une erreur). Reponse {ok: true, total, page, page_size, pages, rows}."
const TEXTE_P19_R3 =
  "report_revenue {from_month, to_month, member_id?, sort?, page_size?, page?} (admin seulement). Controles apres ceux d'acteur : from_month ou to_month pas au format 'AAAA-MM' (mois 01..12), ou from_month > to_month -> INVALID_ARGUMENT ; sort (defaut 'month') hors de {'month', '-net_cents', 'member_id'} -> INVALID_ARGUMENT ; page_size et page comme P19.R1. Lignes : une par facture EMISE (P14.R2) de mois dans [from_month, to_month] (bornes incluses), filtree sur member_id s'il est donne (egalite exacte ; un pseudonyme P18 est un member_id comme un autre ; un member_id sans facture donne total 0, pas une erreur) : {invoice_id, month, member_id, total_cents, credit_notes_cents, net_cents} ; credit_notes_cents = somme des amount_cents des avoirs (P14.R4) dont l'invoice_id est cette facture, emis jusqu'a l'instant du rapport ; net_cents = total_cents - credit_notes_cents. Ordre : la cle de sort ('month' croissant, '-net_cents' decroissant, 'member_id' croissant ordinal), puis month croissant, puis member_id croissant ordinal. Pagination comme P19.R2. Reponse {ok: true, total, page, page_size, pages, sum_net_cents, rows}, sum_net_cents = somme des net_cents de TOUTES les lignes filtrees (pas seulement de la page)."
const TEXTE_P20_R1 =
  "import_bookings {import_id, rows} (admin, staff). Controles apres ceux d'acteur : import_id absent ou chaine vide -> INVALID_ARGUMENT ; import_id deja vu dans le locataire -> idempotence de l'import (P20.R4) ; rows pas un tableau, vide, ou de plus de 50 000 lignes -> INVALID_ARGUMENT (non memorise). Chaque ligne {request_id, member_id, slot_id, seats?} est traitee, dans l'ordre des lignes, EXACTEMENT comme une requete reserve emise par l'actor de l'import a l'instant at de l'import : meme ordre des controles qu'a P16 (sans le controle 'member pour autrui', l'actor etant admin ou staff), meme idempotence par request_id et meme memorisation (une ligne refusee memorise son refus comme reserve), meme admission, meme paiement (P8.R2, P15.R6). Une ligne refusee n'arrete pas l'import (import partiellement invalide). Une ligne qui n'est pas un objet portant un request_id chaine est refusee INVALID_ARGUMENT, sans memorisation."
const TEXTE_P20_R2 =
  "Reponse de import_bookings {ok: true, import_id, total, accepted, confirmed, waiting, duplicates, rejected}. total = nombre de lignes ; duplicates = nombre de lignes dont le request_id etait deja memorise avant elles (par une requete anterieure ou par une ligne precedente du meme import) : elles n'ont aucun effet ; rejected = [{index, request_id, error}] des autres lignes dont la reponse est un refus, dans l'ordre des lignes, index = rang 1-base de la ligne ; accepted = nombre de reservations creees = confirmed + waiting. Identite : total = accepted + duplicates + nombre de rejected."
const TEXTE_P20_R3 =
  "Plafond de latence declare, par operation, sur le volume importe (la mesure est faite par T75, pas par les faits de cette racine) : apres import de 50 000 reservations selon le profil `volume` de cette racine, la latence au 95e centile de chaque operation ne depasse pas : reserve 50 ms, cancel 50 ms, get_booking 20 ms, get_slot 20 ms, get_wallet 20 ms, list_documents 100 ms, report_occupancy 200 ms, report_revenue 200 ms, toute autre operation 100 ms ; un import_bookings de 50 000 lignes : 30 000 ms pour l'operation entiere. Une implementation qui parcourt toutes les reservations du locataire a chaque operation depasse ces plafonds."
const TEXTE_P20_R4 =
  "Idempotence de l'import : un import_id deja vu dans le locataire renvoie la reponse memorisee de son premier import, a l'identique et sans effet, quels que soient les rows envoyes. Seule une reponse ok: true est memorisee."
const TEXTE_P21_R1 =
  "Idempotence sous rejeux (remplace P1.R4). La premiere reponse produite pour un request_id (requete reserve ou ligne d'import P20.R1) est memorisee avec les arguments NORMALISES de sa requete {member_id, slot_id, seats (1 si absent)} ; c'est vrai aussi des cles memorisees avant P21 (arguments de leur premiere requete). Une requete ulterieure portant le meme request_id : arguments normalises egaux -> la reponse memorisee, a l'identique, sans effet (meme si l'etat a change depuis) ; arguments normalises differents -> {ok: false, error: 'IDEMPOTENCY_CONFLICT'}, sans effet et NON memorise (la cle garde sa premiere reponse). Une ligne d'import en conflit est un refus (rejected, error IDEMPOTENCY_CONFLICT). Le controle 'member pour autrui -> FORBIDDEN' (P4.R3) reste place AVANT l'idempotence et n'est jamais memorise."
const TEXTE_P21_R2 =
  "Idempotence de l'import sous rejeux (remplace P20.R4) : un import_id deja vu renvoie la reponse memorisee, a l'identique et sans effet, si rows est egal EN PROFONDEUR a celui du premier import (memes lignes, meme ordre, memes champs) ; sinon {ok: false, error: 'IDEMPOTENCY_CONFLICT'}, sans effet et non memorise."
const TEXTE_P21_R3 =
  "Serialisabilite (clause de concurrence ; les essais paralleles sont faits par T75, les faits de cette racine sont sequentiels). Chaque operation est atomique. Des requetes paralleles produisent les memes reponses et le meme etat qu'une execution SEQUENTIELLE dans un ordre compatible avec leur chevauchement temporel. Invariants verifies apres chaque operation : booked <= overbook_limit de chaque creneau (P13.R1) ; aucune place numerotee attribuee a deux reservations ; au plus une reservation active par (membre, creneau) ; au plus une reservation par request_id ; tout solde de portefeuille >= 0. En sequentiel, l'ordre est celui de la trajectoire, y compris entre operations de meme instant at."
const TEXTE_P21_R4 =
  "Derniere place disputee : parmi des requetes reserve concurrentes (request_id distincts) pour la derniere place d'un creneau, exactement UNE est confirmed ; les autres entrent en file (waiting) dans l'ordre de serialisation. Rejeux simultanes : N requetes paralleles de meme request_id et memes arguments creent exactement UNE reservation et recoivent N reponses identiques (la reponse memorisee, celle de la premiere executee comprise) ; si leurs arguments different, une seule cree, les autres recoivent la reponse memorisee ou IDEMPOTENCY_CONFLICT selon P21.R1."
const TEXTE_P22_R1 =
  "Fin des remises par niveau (remplace P15.R6). Le montant est fixe a l'instant ou la reservation devient confirmed (reservation ou promotion) avec le prix et la devise du prix de CET instant, SANS remise : brut = seats x price_cents ; net = brut (taux 0 quel que soit le niveau) ; prix en EUR : amount_cents = net ; prix en USD : conversion P15.R3 au taux applicable a l'instant de la confirmation, avec price_currency, original_amount_cents et rate_micro comme a P15.R6 ; RATE_UNAVAILABLE comme a P15.R6. Cela vaut pour toute confirmation a partir de P22, y compris la promotion d'une reservation demandee avant P22. Les montants fixes avant P22 ne changent pas ; les factures et avoirs deja emis ne changent pas. set_tier reste accepte et le niveau reste enregistre, sans effet sur le prix. Le recalcul P16.R2 utilise le taux de remise de la confirmation de chaque reservation : son taux d'avant P22 pour une reservation confirmee avant P22, 0 pour une reservation confirmee a partir de P22."
const TEXTE_P22_R2 =
  "Lots de credits et expiration. Chaque entree de credits au portefeuille (top_up, compensation P13.R3, re-credit r_c d'un remboursement ou d'un trop-percu, y compris par avoir) forme un LOT {acquired_at = at de l'operation, expires_at = le meme instant UTC 12 mois civils plus tard (12 mois civils apres un 29 fevrier donnent le 28 fevrier de l'annee suivante, a la meme heure UTC), remaining_cents}. Chaque debit de credits (paiement P8.R2, frais P23.R3) consomme les lots par expires_at croissant (le plus ancien d'abord), puis par ordre d'entree. Retroactivite : les lots sont reconstitues sur TOUT l'historique du portefeuille depuis P8, par la meme regle (y compris les anciens credits). Un lot expire a l'instant expires_at : pour une operation d'instant at >= expires_at son reste est perdu (a at = expires_at le lot est expire ; a expires_at - 1 s il ne l'est pas). L'expiration est un mouvement de portefeuille date de expires_at, de montant = reste du lot ; a instant egal elle precede l'operation. balance_cents = somme des restes des lots non expires."
const TEXTE_P22_R3 =
  "Vues des lots. get_wallet porte en plus lots = [{acquired_at, expires_at, remaining_cents}] : les lots non expires de reste > 0, par expires_at croissant puis ordre d'entree (acquired_at, expires_at : 'AAAA-MM-JJTHH:MM:SSZ'). La reponse de top_up porte en plus expires_at, l'echeance du lot cree."
const TEXTE_P22_R4 =
  "Factures (remplace P14.R3). Contenu de P14.R3, plus : les lignes {type: 'expiry', booking_id: null, amount_cents} des expirations du membre dont expires_at tombe dans le mois (mois local, P14.R1), rangees a leur instant parmi les lignes ; le champ expired_cents = somme de ces lignes. Une expiration n'est ni une charge ni un remboursement : charges_cents, refunds_cents, total_cents, card_cents et credits_used_cents n'en tiennent pas compte. Identite : closing_balance_cents = opening_balance_cents + top_ups_cents + compensations_cents + credit_notes_credits_cents - credits_used_cents - expired_cents - wallet_refunds_cents (lignes 'wallet_refund' du remboursement a l'effacement, P18.R1, Q38 ; ni charge ni remboursement). Les factures emises avant P22 ne portent pas expired_cents et ne changent pas."
const TEXTE_P23_R1 =
  "transfer_booking {booking_id, to_member_id} (admin, staff pour toute reservation ; member seulement pour une reservation dont il est le TITULAIRE, member_id). Controles apres ceux d'acteur, dans cet ordre : booking_id inconnu -> NOT_FOUND ; actor member non titulaire -> FORBIDDEN ; to_member_id non membre -> NOT_FOUND ; statut different de confirmed, ou to_member_id = titulaire actuel -> INVALID_ARGUMENT ; at >= starts_at du creneau -> SLOT_CLOSED ; at < suspended_until du destinataire (P10.R3) -> SUSPENDED ; le destinataire a une AUTRE reservation active (confirmed ou waiting) sur le meme creneau -> ALREADY_BOOKED. Effet : le titulaire devient to_member_id ; la reservation garde booking_id, seats, seat_numbers, montants, payeur et rang de confirmation ; le cedant paie les frais P23.R3. Reponse {ok: true, booking_id, member_id (nouveau titulaire), fee_cents, fee: {credits_cents, card_cents}}."
const TEXTE_P23_R2 =
  "exchange_bookings {booking_id, with_booking_id} (admin, staff ; member -> FORBIDDEN) : les deux titulaires echangent leurs reservations ; sur un meme creneau numerote, cela echange leurs places. Controles apres ceux d'acteur, dans cet ordre : l'une des deux inconnue -> NOT_FOUND ; booking_id = with_booking_id, l'une non confirmed, ou meme titulaire -> INVALID_ARGUMENT ; l'un des deux creneaux commence (at >= starts_at) -> SLOT_CLOSED ; l'un des deux titulaires suspendu (at < suspended_until) -> SUSPENDED ; creneaux differents et l'un des titulaires a deja une autre reservation active sur le creneau qu'il recoit -> ALREADY_BOOKED. Effet : chacun devient titulaire de la reservation de l'autre ; chaque cedant paie les frais P23.R3 de la reservation qu'il cede (frais de booking_id d'abord). Reponse {ok: true, exchanged: [{booking_id, member_id (nouveau titulaire), fee_cents}, {booking_id: with_booking_id, member_id, fee_cents}]}."
const TEXTE_P23_R3 =
  "Frais de transfert : fee_cents = 0 si A = 0 ; sinon fee_cents = max(100, floor((A x 1000 + 5000) / 10000)), A = amount_cents actuel de la reservation cedee (10 % arrondi demi vers le haut au centime, minimum 100 centimes pour une reservation payante, meme peu chere ; une reservation gratuite se cede sans frais). Payes par le cedant au moment du transfert : credits d'abord (lots P22.R2, le plus ancien d'abord), puis carte. C'est un mouvement de type 'fee' (booking_id, montant, part credits, part carte) date de l'operation. Les frais ne sont jamais rembourses. A partir de P23, les vues de reservation (reserve, get_booking) portent payer_member_id (le membre debite a la confirmation ; null si jamais confirmee) et transfers = [{from_member_id, to_member_id, at, fee_cents}] dans l'ordre des transferts ([] si aucun)."
const TEXTE_P23_R4 =
  "Payeur et remboursements. Le titulaire actuel peut annuler sa reservation (member pour sa reservation, P4.R3). Tout remboursement ulterieur d'une reservation transferee (annulation totale ou partielle, debarquement, trop-percu P16.R2) va au PAYEUR (payer_member_id), pas au titulaire : r_c re-credite a son portefeuille, r_d rendu a sa carte, ligne refund ou avoir sur SES documents (l'avoir cite la facture de la charge, celle du payeur). La compensation de debarquement (P13.R3) va au titulaire."
const TEXTE_P23_R5 =
  "Factures (remplace P22.R4). Contenu de P22.R4, plus les lignes {type: 'fee', booking_id, amount_cents} des frais payes par le membre, comptees comme des charges : dans charges_cents, et leurs parts dans card_cents et credits_used_cents."
const TEXTE_P24_R1 =
  "Version du contrat. A partir de P24, l'enveloppe porte un champ version (au niveau de l'operation, hors args) : 'v1' ou 'v2' ; absent, il vaut 'v1'. Avant P24 ce champ est ignore. Toute autre valeur -> {ok: false, error: 'INVALID_ARGUMENT'} (forme v1), sans effet et avant tout autre controle (meme celui du tenant). Juste apres ce controle, une operation dont le nom n'appartient ni au contrat v1 ni au contrat v2 de P24 -> INVALID_ARGUMENT dans la forme de la version (P1.R8)."
const TEXTE_P24_R2 =
  "Correspondance declaree v1 <-> v2, bijective. Operations : reserve <-> create_reservation, cancel <-> cancel_reservation, get_booking <-> get_reservation, get_slot <-> get_session, create_slot <-> create_session, transfer_booking <-> transfer_reservation, exchange_bookings <-> exchange_reservations, import_bookings <-> import_reservations ; toutes les autres operations gardent leur nom. Champs : booking_id <-> reservation_id, slot_id <-> session_id, slot_ids <-> session_ids, seats <-> quantity, with_booking_id <-> with_reservation_id ; la correspondance porte sur les NOMS de cles, a toute profondeur, dans les arguments ET dans les reponses (exemples : rows[].slot_id, lines[].booking_id, origin.booking_id, assignments[].booking_id) ; les valeurs ne changent jamais, les autres cles non plus. Erreurs : v1 {ok: false, error: CODE} <-> v2 {ok: false, error: {code: CODE}} ; seule l'erreur de premier niveau change de forme (les error des lignes rejected d'un import restent des chaines)."
const TEXTE_P24_R3 =
  "Equivalence. Une requete v2 est traduite en v1 par la correspondance P24.R2, executee par les regles en vigueur, et sa reponse est traduite en v2 : une operation v1 et son equivalent v2 ont le MEME effet et des reponses qui se correspondent exactement. L'idempotence est commune aux deux versions : une cle (request_id, import_id) memorisee par une version est rejouee par l'autre, la reponse etant rendue dans la forme de la requete qui rejoue ; les arguments normalises (P21.R1) et les rows (P21.R2) sont compares apres traduction en v1. Le contrat v1 continue de fonctionner a l'identique."
const TEXTE_P24_R4 =
  "Noms de l'autre version. En v2, un nom d'operation v1 renomme (ex. reserve) ou une cle v1 renommee presente a n'importe quelle profondeur des arguments (ex. booking_id) -> {ok: false, error: {code: 'INVALID_ARGUMENT'}} ; en v1, un nom d'operation v2 ou une cle v2 -> {ok: false, error: 'INVALID_ARGUMENT'}. Sans effet, non memorise, controle juste apres celui de la version."

/* ═══════════════════════════════════════════════════════ outils P17 à P24 */

const ordinal = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** L'état qu'une clause range sous `cle` dans un locataire quelconque (pas forcément celui de l'opération). */
function donneeDe<T>(t: Tenant, cle: string, init: () => T): T {
  if (!t.donnees.has(cle)) t.donnees.set(cle, init())
  return t.donnees.get(cle) as T
}

/** Égalité profonde de valeurs JSON, indépendante de l'ordre des clés d'un objet. */
function egalProfond(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => egalProfond(x, b[i]))
  if (a !== null && typeof a === 'object') {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) return false
    const ka = Object.keys(a as Json).filter((k) => (a as Json)[k] !== undefined)
    const kb = Object.keys(b as Json).filter((k) => (b as Json)[k] !== undefined)
    return ka.length === kb.length && ka.every((k) => egalProfond((a as Json)[k], (b as Json)[k]))
  }
  return Object.is(a, b)
}

/** Clés dont la valeur désigne un membre (P18.R2, clarification Q37). */
const CLES_DE_MEMBRE: ReadonlySet<string> = new Set(['member_id', 'payer_member_id', 'from_member_id', 'to_member_id'])
const FACTURE_ID = /^INV-\d{4}-\d{2}-/
/** 'INV-<AAAA-MM>-<de>' devient 'INV-<AAAA-MM>-<vers>' ; tout autre identifiant est rendu tel quel. */
const renommerFacture = (id: unknown, de: string, vers: string): unknown =>
  typeof id === 'string' && FACTURE_ID.test(id) && id.slice(12) === de ? `${id.slice(0, 12)}${vers}` : id

/**
 * Remplace `de` par `vers`, à toute profondeur, dans les SEULES valeurs des clés de membre (member_id,
 * payer_member_id, from_member_id, to_member_id) et dans le suffixe des invoice_id (clés invoice_id, invoice_ids) ;
 * un slot_id, un request_id ou toute autre valeur égale par hasard à `de` ne change pas.
 */
function remplacerMembre<T>(v: T, de: string, vers: string, cle?: string): T {
  if (typeof v === 'string') {
    if (cle !== undefined && CLES_DE_MEMBRE.has(cle)) return (v === de ? vers : v) as T
    if (cle === 'invoice_id' || cle === 'invoice_ids') return renommerFacture(v, de, vers) as T
    return v
  }
  if (Array.isArray(v)) return v.map((x: unknown) => remplacerMembre(x, de, vers, cle)) as T
  if (v !== null && typeof v === 'object') {
    const out: Json = {}
    for (const [k, x] of Object.entries(v as Json)) out[k] = remplacerMembre(x, de, vers, k)
    return out as T
  }
  return v
}

/** Réservation avec les champs ajoutés à partir de P17 (origine, payeur, transferts). */
interface Origine {
  readonly tenant_id: string
  readonly booking_id: string
}
interface Transfert {
  from_member_id: string
  to_member_id: string
  readonly at: string
  readonly fee_cents: number
}
interface Reservation extends Booking {
  origin?: Origine
  payer_member_id?: string
  transfers?: Transfert[]
}
const etendue = (b: Booking): Reservation => b as Reservation

type RoleDe = (ctx: PlatformContext, t: Tenant, m: string) => string | undefined
type Partition = (ctx: PlatformContext, id: string) => Tenant | undefined

const CLE_ABSORBES = 'fusion.absorbes'
const CLE_PSEUDONYMES = 'effacement.pseudonymes'
const CLE_IMPORTS = 'import.memoire'

interface Pseudonymes {
  seq: number
  readonly ensemble: Set<string>
}
const pseudonymesDe = (t: Tenant): Pseudonymes => donneeDe<Pseudonymes>(t, CLE_PSEUDONYMES, () => ({ seq: 0, ensemble: new Set() }))

interface ImportMemorise {
  readonly reponse: PlatformResponse
  readonly rows: unknown
}
const importsDe = (t: Tenant): Map<string, ImportMemorise> => donneeDe<Map<string, ImportMemorise>>(t, CLE_IMPORTS, () => new Map())
const historiqueDe = (t: Tenant): MouvementDate[] => donneeDe<MouvementDate[]>(t, CLE_HISTORIQUE_PORTEFEUILLE, () => [])
const suspensionsDe = (t: Tenant): Map<string, number> => donneeDe<Map<string, number>>(t, CLE_SUSPENSIONS, () => new Map())

/* ═══════════════════════════════════════════════════════════════════ P17 */

const RANG_ROLE: Readonly<Record<string, number>> = { member: 0, staff: 1, admin: 2 }
const ORDRE_DES_KINDS = ['slot', 'series', 'booking', 'request', 'import', 'pseudonym'] as const
type Kind = (typeof ORDRE_DES_KINDS)[number]

interface Renommage {
  readonly kind: Kind
  readonly from: string
  readonly to: string
}
interface PlanFusion {
  readonly slots: Map<string, string>
  readonly series: Map<string, string>
  readonly cles: Map<string, string>
  readonly imports: Map<string, string>
  readonly pseudonymes: Map<string, string>
  readonly renamed: Renommage[]
}
type Planifier = (ctx: PlatformContext, source: Tenant, cible: Tenant) => PlanFusion | null
type FusionMembres = (ctx: PlatformContext, source: Tenant, cible: Tenant) => { merged_members: string[]; added_members: string[] }
type FusionContenu = (ctx: PlatformContext, source: Tenant, cible: Tenant, plan: PlanFusion) => void

const aEmisUneFacture = (t: Tenant): boolean => {
  const f = t.donnees.get(CLE_FACTURATION) as Facturation | undefined
  return f !== undefined && f.emis.size > 0
}
const membresDe = (t: Tenant): string[] => {
  const ms = new Set(t.members.keys())
  if (t.owner_id !== undefined) ms.add(t.owner_id)
  return [...ms]
}
const absorbesDe = (t: Tenant): Set<string> => donneeDe<Set<string>>(t, CLE_ABSORBES, () => new Set())

const P17_R1 = clause({
  id: 'P17.R1',
  enters: 'P17',
  text: TEXTE_P17_R1,
  contract: {
    operations: {
      merge_tenants: {
        roles_autorises: ['admin'],
        arguments: { source_tenant_id: 'chaine' },
        reponse: { ok: true, tenant_id: 'chaine (la cible)', source_tenant_id: 'chaine', renamed: 'tableau de { kind, from, to }', merged_members: 'tableau', added_members: 'tableau' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
        ordre_des_controles: ['NOT_FOUND source', 'INVALID_ARGUMENT source = cible', 'FORBIDDEN actor non admin de la source', 'INVALID_ARGUMENT facture emise', 'INVALID_ARGUMENT renommage deja pris', 'INVALID_ARGUMENT member_id de la source = pseudonyme de la cible'],
      },
      create_tenant: { erreurs: ['ALREADY_EXISTS'], identifiant_absorbe: 'reste reserve : ALREADY_EXISTS' },
    },
    exemples: [
      { contexte: "m-ana n'est pas membre de t-beta", requete: { op: 'merge_tenants', tenant: 't-alpha', actor: 'm-ana', args: { source_tenant_id: 't-beta' } }, reponse: { ok: false, error: 'FORBIDDEN' } },
      { requete: { op: 'merge_tenants', tenant: 't-mig-a', actor: 'm-ana', args: { source_tenant_id: 't-gamma' } }, reponse: { ok: false, error: 'NOT_FOUND' } },
      { contexte: 'apres fusion de t-mig-b', requete: { op: 'create_tenant', args: { tenant_id: 't-mig-b', owner_id: 'm-ana' } }, reponse: { ok: false, error: 'ALREADY_EXISTS' } },
      { contexte: 'Q64 : anon-0001, pseudonyme de t-q64a, est member_id d un membre de t-q64b', requete: { op: 'merge_tenants', tenant: 't-q64a', actor: 'm-own', args: { source_tenant_id: 't-q64b' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.merge_tenants': ['admin'],
    'create_tenant.etape.identifiant_absorbe': etape(5, (ctx) => {
      const id = ctx.args.tenant_id
      if (typeof id !== 'string') return undefined
      for (const t of ctx.etat.tenants.values()) if ((t.donnees.get(CLE_ABSORBES) as Set<string> | undefined)?.has(id) === true) return fail('ALREADY_EXISTS')
      return undefined
    }),
    'merge_tenants.effet': (ctx: PlatformContext): PlatformResponse => {
      const cible = ctx.locataire
      const sid = ctx.args.source_tenant_id
      const source = typeof sid === 'string' ? ctx.regle<Partition>('locataire.partition')(ctx, sid) : undefined
      if (source === undefined) return fail('NOT_FOUND')
      if (source === cible) return fail('INVALID_ARGUMENT')
      if (ctx.regle<RoleDe>('membres.role')(ctx, source, String(ctx.step.actor)) !== 'admin') return fail('FORBIDDEN')
      if (aEmisUneFacture(source) || aEmisUneFacture(cible)) return fail('INVALID_ARGUMENT')
      const plan = ctx.regle<Planifier>('fusion.renommage')(ctx, source, cible)
      if (plan === null) return fail('INVALID_ARGUMENT')
      // (6) Q64 (decision du mandant) : un member_id de la source (proprietaire compris) egal a un pseudonyme de la
      // cible -> INVALID_ARGUMENT, sans effet (un pseudonyme ne designe jamais un membre, un member_id n'est jamais renomme)
      const pseudosCible = pseudonymesDe(cible).ensemble
      const membresSource = [...source.members.keys(), ...(source.owner_id === undefined ? [] : [source.owner_id])]
      if (membresSource.some((m) => pseudosCible.has(m))) return fail('INVALID_ARGUMENT')
      for (const [de, vers] of plan.pseudonymes) {
        ctx.regle<RenommerMembre>('membre.renommer')(ctx, source, de, vers)
        const pseudos = pseudonymesDe(source).ensemble
        pseudos.delete(de)
        pseudos.add(vers)
      }
      const membres = ctx.regle<FusionMembres>('fusion.membres')(ctx, source, cible)
      ctx.regle<FusionContenu>('fusion.contenu')(ctx, source, cible, plan)
      const absorbes = absorbesDe(cible)
      absorbes.add(source.tenant_id)
      for (const x of absorbesDe(source)) absorbes.add(x)
      ctx.etat.tenants.delete(source.tenant_id)
      return succeed({
        tenant_id: cible.tenant_id,
        source_tenant_id: source.tenant_id,
        renamed: plan.renamed.map((r) => ({ ...r })),
        merged_members: membres.merged_members,
        added_members: membres.added_members,
      })
    },
  },
  grandeurs: ['tenant_id', 'source_tenant_id', 'renamed', 'merged_members', 'added_members', 'actor'],
})

const P17_R2 = clause({
  id: 'P17.R2',
  enters: 'P17',
  text: TEXTE_P17_R2,
  contract: {
    valeurs: {
      forme_du_renommage: '<source_tenant_id>:<identifiant>',
      espaces: ['slot_id', 'series_id', 'request_id/booking_id', 'import_id', 'pseudonyme'],
      ordre_de_renamed: [...ORDRE_DES_KINDS],
      tri_dans_un_kind: 'from croissant (ordinal UTF-16)',
      serie: 'series_id et ses occurrences renommes ensemble (lien <series_id>@<date> conserve)',
      pseudonyme: "en collision avec un pseudonyme ou un member_id de la cible : '<source_tenant_id>:<pseudonyme>', avec tout ce qui le cite",
    },
    exemples: [
      { contexte: 'M1 existe dans t-mig-a et t-mig-b', calcul: "'M1' de t-mig-b devient 't-mig-b:M1' ; renamed [{ kind: 'slot', from: 'M1', to: 't-mig-b:M1' }, ...]" },
      { contexte: 'serie SR dans t-q32a et t-q32b ; occurrence SR@2031-09-08 dans t-q32b seulement', requete: { op: 'merge_tenants', tenant: 't-q32a', actor: 'm-own', args: { source_tenant_id: 't-q32b' } }, reponse: { ok: true, renamed: [{ kind: 'slot', from: 'SR@2031-09-08', to: 't-q32b:SR@2031-09-08' }, { kind: 'series', from: 'SR', to: 't-q32b:SR' }] } },
      { contexte: 'anon-0001 dans t-q34a et t-q34b', requete: { op: 'merge_tenants', tenant: 't-q34a', actor: 'm-own', args: { source_tenant_id: 't-q34b' } }, reponse: { ok: true, renamed: [{ kind: 'pseudonym', from: 'anon-0001', to: 't-q34b:anon-0001' }] } },
    ],
  },
  implementation: {
    'fusion.renommage': ((ctx, source, cible) => {
      const prefixe = `${source.tenant_id}:`
      const renamed: Renommage[] = []
      const plan: PlanFusion = { slots: new Map(), series: new Map(), cles: new Map(), imports: new Map(), pseudonymes: new Map(), renamed }
      /** Renomme `id` en '<source>:<id>' ; faux si ce nom est déjà pris dans l'espace de la cible ou de la source. */
      const renommer = (kind: Kind, id: string, vers: Map<string, string>, pris: ReadonlySet<string>, ids: ReadonlySet<string>): boolean => {
        const to = `${prefixe}${id}`
        if (pris.has(to) || ids.has(to)) return false
        vers.set(id, to)
        renamed.push({ kind, from: id, to })
        return true
      }
      const slotsSource = new Set(source.slots.keys())
      const slotsCible = new Set(cible.slots.keys())
      const seriesSource = new Set(source.series.keys())
      const seriesCible = new Set(cible.series.keys())
      // (b) et (a) : une série et ses occurrences se renomment ENSEMBLE
      const dates = ctx.regle<(s: Series) => string[]>('serie.dates')
      for (const se of source.series.values()) {
        const occurrences = dates(se).map((d) => occurrence(se.series_id, d)).filter((id) => slotsSource.has(id))
        if (!seriesCible.has(se.series_id) && !occurrences.some((id) => slotsCible.has(id))) continue
        if (!renommer('series', se.series_id, plan.series, seriesCible, seriesSource)) return null
        for (const id of occurrences) if (!renommer('slot', id, plan.slots, slotsCible, slotsSource)) return null
      }
      for (const id of slotsSource) {
        if (!plan.slots.has(id) && slotsCible.has(id) && !renommer('slot', id, plan.slots, slotsCible, slotsSource)) return null
      }
      // (c) clés d'idempotence et réservations ; (d) imports
      const cles = (t: Tenant): Set<string> => new Set([...t.bookings.keys(), ...t.memo.keys()])
      const clesSource = cles(source)
      const clesCible = cles(cible)
      for (const id of clesSource) {
        if (clesCible.has(id) && !renommer(source.bookings.has(id) ? 'booking' : 'request', id, plan.cles, clesCible, clesSource)) return null
      }
      const importsSource = new Set(importsDe(source).keys())
      const importsCible = new Set(importsDe(cible).keys())
      for (const id of importsSource) if (importsCible.has(id) && !renommer('import', id, plan.imports, importsCible, importsSource)) return null
      // (e) pseudonymes : en collision avec un pseudonyme ou un member_id de la cible
      const nomsCible = new Set([...pseudonymesDe(cible).ensemble, ...membresDe(cible)])
      const nomsSource = new Set([...pseudonymesDe(source).ensemble, ...membresDe(source)])
      for (const p of pseudonymesDe(source).ensemble) if (nomsCible.has(p) && !renommer('pseudonym', p, plan.pseudonymes, nomsCible, nomsSource)) return null
      renamed.sort((a, b) => ORDRE_DES_KINDS.indexOf(a.kind) - ORDRE_DES_KINDS.indexOf(b.kind) || ordinal(a.from, b.from))
      return plan
    }) satisfies Planifier,
  },
  grandeurs: ['renamed', 'slot_id', 'series_id', 'booking_id', 'request_id', 'import_id', 'member_id'],
})

const P17_R3 = clause({
  id: 'P17.R3',
  enters: 'P17',
  text: TEXTE_P17_R3,
  contract: {
    valeurs: { rang_des_roles: ['member', 'staff', 'admin'], niveau: 'plus fort taux de remise', portefeuille: 'somme', suspension: 'la plus tardive (null si aucune)' },
    operations: { merge_tenants: { reponse: { merged_members: 'member_id croissants', added_members: 'member_id croissants' } } },
    exemples: [{ contexte: 'm-y : 300 dans la cible, 650 dans la source', requete: { op: 'get_wallet', tenant: 't-mig-a', actor: 'm-ana', args: { member_id: 'm-y' } }, reponse: { ok: true, member_id: 'm-y', balance_cents: 950 } }],
  },
  implementation: {
    'fusion.membres': ((_ctx, source, cible) => {
      const roleDe = (t: Tenant, m: string): string | undefined => (t.owner_id === m ? 'admin' : t.members.get(m))
      const merged_members: string[] = []
      const added_members: string[] = []
      for (const m of membresDe(source)) {
        const rs = roleDe(source, m) as string
        const rc = roleDe(cible, m)
        if (rc === undefined) added_members.push(m)
        else merged_members.push(m)
        const role = rc === undefined || (RANG_ROLE[rs] ?? 0) > (RANG_ROLE[rc] ?? 0) ? rs : rc
        if (cible.owner_id !== m) cible.members.set(m, role)
      }
      for (const [m, ts] of source.tiers) {
        const tc = cible.tiers.get(m)
        if (tc === undefined || (TAUX_REMISE_BP[ts] ?? 0) > (TAUX_REMISE_BP[tc] ?? 0)) cible.tiers.set(m, ts)
      }
      for (const [m, w] of source.wallets) cible.wallets.set(m, (cible.wallets.get(m) ?? 0) + w)
      const historique = historiqueDe(cible)
      historique.push(...historiqueDe(source))
      const tries = historique.map((h, i) => [h, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([h]) => h)
      historique.splice(0, historique.length, ...tries)
      const suspensions = suspensionsDe(cible)
      for (const [m, s] of suspensionsDe(source)) suspensions.set(m, Math.max(suspensions.get(m) ?? -Infinity, s))
      donneeDe<Absence[]>(cible, CLE_ABSENCES, () => []).push(...donneeDe<Absence[]>(source, CLE_ABSENCES, () => []))
      merged_members.sort(ordinal)
      added_members.sort(ordinal)
      return { merged_members, added_members }
    }) satisfies FusionMembres,
  },
  grandeurs: ['merged_members', 'added_members', 'member_id', 'role', 'tier', 'balance_cents', 'suspended_until'],
})

const P17_R4 = clause({
  id: 'P17.R4',
  enters: 'P17',
  text: TEXTE_P17_R4,
  contract: {
    operations: {
      reserve: { reponse: { origin: '{ tenant_id, booking_id } de creation' } },
      get_booking: { reponse: { origin: '{ tenant_id, booking_id } de creation' } },
    },
    memoire_renommee: 'cle renommee ; seuls booking_id et slot_id de premier niveau reecrits',
    exemples: [
      { requete: { op: 'get_booking', tenant: 't-mig-a', actor: 'm-ana', args: { booking_id: 't-mig-b:k1' } }, reponse: { ok: true, booking_id: 't-mig-b:k1', member_id: 'm-x', slot_id: 't-mig-b:M1', seat_numbers: [5], origin: { tenant_id: 't-mig-b', booking_id: 'k1' } } },
    ],
  },
  implementation: {
    'fusion.contenu': ((_ctx, source, cible, plan) => {
      const rs = (id: string): string => plan.slots.get(id) ?? id
      const rk = (id: string): string => plan.cles.get(id) ?? id
      for (const s of source.slots.values()) {
        const ns: Slot = { ...s, slot_id: rs(s.slot_id), file: s.file.map(rk) }
        cible.slots.set(ns.slot_id, ns)
      }
      for (const se of source.series.values()) {
        const id = plan.series.get(se.series_id) ?? se.series_id
        cible.series.set(id, { ...se, series_id: id, exceptions: new Set(se.exceptions) })
      }
      for (const b of source.bookings.values()) {
        const e = etendue(b)
        const nb: Reservation = {
          ...e,
          booking_id: rk(b.booking_id),
          slot_id: rs(b.slot_id),
          origin: e.origin ?? { tenant_id: source.tenant_id, booking_id: b.booking_id },
          ...(e.seat_numbers === undefined ? {} : { seat_numbers: [...e.seat_numbers] }),
          ...(e.transfers === undefined ? {} : { transfers: e.transfers.map((x) => ({ ...x })) }),
        }
        cible.bookings.set(nb.booking_id, nb)
      }
      const argumentsCible = donneeDe<Map<string, ArgumentsNormalises>>(cible, CLE_ARGUMENTS_IDEMPOTENCE, () => new Map())
      const argumentsSource = donneeDe<Map<string, ArgumentsNormalises>>(source, CLE_ARGUMENTS_IDEMPOTENCE, () => new Map())
      for (const [k, r] of source.memo) {
        const nr = clone(r)
        if (typeof nr.booking_id === 'string') nr.booking_id = rk(nr.booking_id)
        if (typeof nr.slot_id === 'string') nr.slot_id = rs(nr.slot_id)
        cible.memo.set(rk(k), nr)
        const a = argumentsSource.get(k)
        if (a !== undefined) argumentsCible.set(rk(k), { ...a, slot_id: typeof a.slot_id === 'string' ? rs(a.slot_id) : a.slot_id })
      }
      const importsCible = importsDe(cible)
      for (const [k, x] of importsDe(source)) importsCible.set(plan.imports.get(k) ?? k, x)
      for (const e of source.journal) cible.journal.push(e)
      cible.journal.sort((a, b) => a.seq - b.seq)
      const tauxCible = donneeDe<Map<string, number>>(cible, CLE_TAUX, () => new Map())
      for (const [d, r] of donneeDe<Map<string, number>>(source, CLE_TAUX, () => new Map())) if (!tauxCible.has(d)) tauxCible.set(d, r)
      const pseudos = pseudonymesDe(cible)
      for (const p of pseudonymesDe(source).ensemble) pseudos.ensemble.add(p)
    }) satisfies FusionContenu,
    'vue.reservation.origine': ((ctx, b, champs) => {
      const o = etendue(b).origin
      champs.origin = o === undefined ? { tenant_id: ctx.locataire.tenant_id, booking_id: b.booking_id } : { tenant_id: o.tenant_id, booking_id: o.booking_id }
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['origin', 'booking_id', 'slot_id', 'request_id', 'tenant_id'],
})

/* ═══════════════════════════════════════════════════════════════════ P18 */

/** Remboursement du portefeuille a l'effacement (P18.R1, Q38). */
type RemboursementEffacement = (ctx: PlatformContext, member: string) => void
const TYPE_REMBOURSEMENT_PORTEFEUILLE = 'wallet_refund'
type PseudonymeSuivant = (ctx: PlatformContext) => string
interface BilanAnonymisation {
  readonly invoice_ids: string[]
  readonly credit_note_ids: string[]
  readonly bookings_anonymized: number
}
type Anonymiser = (ctx: PlatformContext, membre: string, pseudo: string) => BilanAnonymisation
/** Remplace l'identifiant `de` par `vers` dans tout le locataire `t` (P18.R2 ; aussi pour un pseudonyme renommé par P17.R2). */
type RenommerMembre = (ctx: PlatformContext, t: Tenant, de: string, vers: string) => BilanAnonymisation

const P18_R1 = clause({
  id: 'P18.R1',
  enters: 'P18',
  text: TEXTE_P18_R1,
  contract: {
    operations: {
      erase_member: {
        roles_autorises: ['admin'],
        arguments: { member_id: 'chaine' },
        reponse: { ok: true, member_id: "pseudonyme 'anon-nnnn'", invoice_ids: 'tableau croissant', credit_note_ids: 'tableau croissant', bookings_anonymized: 'entier' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'],
        ordre_des_controles: ['NOT_FOUND (non membre, pseudonyme, deja efface)', 'INVALID_ARGUMENT (proprietaire ou actor)', 'INVALID_ARGUMENT (reservation active a venir)'],
      },
    },
    valeurs: { pseudonyme: "'anon-' + 4 chiffres, sequence par locataire, a partir de anon-0001" },
    remboursement_du_portefeuille: {
      mouvement: "'wallet_refund', date de at, montant B = balance_cents apres les expirations de at, porte par le pseudonyme ; aucun si B = 0",
      ligne: "{ type: 'wallet_refund', booking_id: null, amount_cents: B }, facture du mois local de at, rangee a son instant",
      facture: { wallet_refunds_cents: 'somme des lignes wallet_refund (0 sans ligne), sur toute facture emise a partir de P18' },
      hors_de: ['charges_cents', 'refunds_cents', 'total_cents', 'card_cents', 'credits_used_cents', 'report_revenue'],
      identite: 'closing = opening + top_ups + compensations + credit_notes_credits - credits_used (- expired a partir de P22) - wallet_refunds',
      lots: 'debit de credits qui consomme tous les lots restants (P22.R2)',
    },
    exemples: [
      { requete: { op: 'erase_member', tenant: 't-alpha', actor: 'm-ana', args: { member_id: 'm-gus' } }, reponse: { ok: true, member_id: 'anon-0001', credit_note_ids: ['AV-0002'], bookings_anonymized: 13 } },
      { contexte: 'Q38 (t-q38) : m-ra, 1000 recharges, 400 payes en credits, efface', calcul: 'B = 600 rembourses sur la carte ; facture d aout 2031 du pseudonyme : top_up 1000, charge 400, wallet_refund 600, cloture 0 = 0 + 1000 - 400 - 600' },
      { contexte: 'm-cleo a une reservation confirmed a venir', requete: { op: 'erase_member', tenant: 't-alpha', actor: 'm-ana', args: { member_id: 'm-cleo' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.erase_member': ['admin'],
    // Q62 : numero suivant de la sequence du locataire (une fusion ne la change pas, P17.R1), en sautant tout
    // 'anon-nnnn' deja member_id d'un membre (proprietaire compris) ou pseudonyme du locataire (fusion comprise).
    'effacement.pseudonyme': ((ctx) => {
      const p = pseudonymesDe(ctx.locataire)
      const nom = (n: number): string => `anon-${String(n).padStart(4, '0')}`
      let n = p.seq + 1
      while (ctx.role(nom(n)) !== undefined || p.ensemble.has(nom(n))) n += 1
      p.seq = n
      return nom(n)
    }) satisfies PseudonymeSuivant,
    'erase_member.effet': (ctx: PlatformContext): PlatformResponse => {
      const m = ctx.args.member_id
      if (typeof m !== 'string' || ctx.role(m) === undefined) return fail('NOT_FOUND')
      if (m === ctx.locataire.owner_id || m === ctx.step.actor) return fail('INVALID_ARGUMENT')
      for (const b of ctx.locataire.bookings.values()) {
        if (b.member_id !== m || !ctx.estActive(b)) continue
        const slot = ctx.locataire.slots.get(b.slot_id)
        if (slot !== undefined && Date.parse(slot.starts_at) > ctx.instant) return fail('INVALID_ARGUMENT')
      }
      const pseudo = ctx.regle<PseudonymeSuivant>('effacement.pseudonyme')(ctx)
      ctx.regle<RemboursementEffacement>('effacement.remboursement_portefeuille')(ctx, m)
      const bilan = ctx.regle<Anonymiser>('effacement.anonymiser')(ctx, m, pseudo)
      return succeed({ member_id: pseudo, ...bilan })
    },
    // Q38 (decision du mandant) : le solde B (apres les expirations de at, etape d'enveloppe) est rembourse sur la
    // carte ; debit de credits (il consomme les lots restants, P22.R2) et ligne 'wallet_refund' du mois de at.
    // Inscrit avant l'anonymisation : P18.R2 le fait porter par le pseudonyme, comme tout l'historique.
    'effacement.remboursement_portefeuille': ((ctx, m) => {
      const B = ctx.regle<Solde>('portefeuille.solde')(ctx, m)
      if (B <= 0) return
      ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, m, -B)
      ctx.journaliser({ type: TYPE_REMBOURSEMENT_PORTEFEUILLE, member_id: m, booking_id: null, amount_cents: B, credits_cents: B, card_cents: 0 })
    }) satisfies RemboursementEffacement,
    // toute facture emise a partir de P18 porte wallet_refunds_cents (0 sans ligne)
    'comptabilite.champ.wallet_refunds_cents': ((lignes) => ({
      wallet_refunds_cents: lignes.filter((e) => e.type === TYPE_REMBOURSEMENT_PORTEFEUILLE).reduce((s, e) => s + e.amount_cents, 0),
    })) satisfies ChampDeFacture,
    // identite de cloture et rapprochement (P14.R3/P14.R6, P22.R4, P23.R5) : - wallet_refunds
    'comptabilite.sortie.wallet_refund': ((x) => (typeof x.wallet_refunds_cents === 'number' ? x.wallet_refunds_cents : 0)) satisfies SortieDeFacture,
  },
  grandeurs: ['member_id', 'invoice_ids', 'credit_note_ids', 'bookings_anonymized', 'starts_at', 'at', 'balance_cents', 'lines.amount_cents', 'wallet_refunds_cents'],
})

const P18_R2 = clause({
  id: 'P18.R2',
  enters: 'P18',
  text: TEXTE_P18_R2,
  contract: {
    valeurs: {
      invoice_id_renomme: 'INV-<AAAA-MM>-<pseudonyme>',
      montants: 'inchanges',
      exception_a_l_immuabilite: 'identifiants seulement',
      cles_anonymisees: ['member_id', 'payer_member_id', 'from_member_id', 'to_member_id', 'suffixe de invoice_id'],
    },
    exemples: [
      { calcul: "INV-2031-03-m-gus devient INV-2031-03-anon-0001 ; total_cents 3373 inchange" },
      { contexte: "z1 de m-yan sur le creneau d'identifiant 'm-yan', m-yan efface (anon-0001)", requete: { op: 'reserve', tenant: 't-q37', actor: 'm-own', args: { request_id: 'z1', member_id: 'anon-0001', slot_id: 'm-yan' } }, reponse: { ok: true, booking_id: 'z1', member_id: 'anon-0001', slot_id: 'm-yan', status: 'confirmed' } },
    ],
  },
  implementation: {
    'membre.renommer': ((_ctx, t, m, pseudo) => {
      const deplacer = <V>(map: Map<string, V>): void => {
        const v = map.get(m)
        if (v === undefined) return
        map.delete(m)
        map.set(pseudo, v)
      }
      deplacer(t.tiers)
      deplacer(t.wallets)
      deplacer(suspensionsDe(t))
      for (const h of historiqueDe(t)) if (h.member_id === m) h.member_id = pseudo
      for (const a of donneeDe<Absence[]>(t, CLE_ABSENCES, () => [])) if (a.member_id === m) a.member_id = pseudo
      for (const e of t.journal) if (e.member_id === m) e.member_id = pseudo
      let bookings_anonymized = 0
      for (const b of t.bookings.values()) {
        const e = etendue(b)
        if (b.member_id !== m && e.payer_member_id !== m) continue
        bookings_anonymized += 1
        if (b.member_id === m) b.member_id = pseudo
        if (e.payer_member_id === m) e.payer_member_id = pseudo
      }
      for (const b of t.bookings.values()) {
        for (const x of etendue(b).transfers ?? []) {
          if (x.from_member_id === m) x.from_member_id = pseudo
          if (x.to_member_id === m) x.to_member_id = pseudo
        }
      }
      for (const [k, r] of t.memo) t.memo.set(k, remplacerMembre(r, m, pseudo))
      const args = donneeDe<Map<string, ArgumentsNormalises>>(t, CLE_ARGUMENTS_IDEMPOTENCE, () => new Map())
      for (const [k, a] of args) args.set(k, remplacerMembre(a, m, pseudo))
      const imports = importsDe(t)
      for (const [k, x] of imports) imports.set(k, remplacerMembre(x, m, pseudo))
      const f = facturationDe(t)
      const factures = [...f.factures.values()]
      f.factures.clear()
      const invoice_ids: string[] = []
      for (const x of factures) {
        if (x.member_id === m) {
          x.member_id = pseudo
          x.invoice_id = renommerFacture(x.invoice_id, m, pseudo)
          invoice_ids.push(String(x.invoice_id))
        }
        f.factures.set(String(x.invoice_id), x)
      }
      const credit_note_ids: string[] = []
      for (const a of f.avoirs) {
        a.invoice_id = renommerFacture(a.invoice_id, m, pseudo)
        if (a.member_id === m) a.member_id = pseudo
        if (a.member_id === pseudo) credit_note_ids.push(String(a.credit_note_id))
      }
      return { invoice_ids: invoice_ids.sort(ordinal), credit_note_ids: credit_note_ids.sort(ordinal), bookings_anonymized }
    }) satisfies RenommerMembre,
    'effacement.anonymiser': ((ctx, m, pseudo) => {
      const t = ctx.locataire
      t.members.delete(m)
      const bilan = ctx.regle<RenommerMembre>('membre.renommer')(ctx, t, m, pseudo)
      pseudonymesDe(t).ensemble.add(pseudo)
      return bilan
    }) satisfies Anonymiser,
  },
  grandeurs: ['member_id', 'invoice_id', 'credit_note_id', 'total_cents', 'balance_cents'],
})

const estPseudonyme = (ctx: PlatformContext, m: unknown): boolean =>
  typeof m === 'string' && pseudonymesDe(ctx.locataire).ensemble.has(m) && ctx.role(m) === undefined

const P18_R3 = clause({
  id: 'P18.R3',
  enters: 'P18',
  text: TEXTE_P18_R3,
  contract: {
    operations: {
      list_documents: { pseudonyme: 'accepte (admin, staff)' },
      get_wallet: { pseudonyme: 'accepte (admin, staff)' },
      report_revenue: { filtre_member_id: 'un pseudonyme est un member_id comme un autre' },
      reserve: { erreurs: ['NOT_FOUND'], membre_efface: 'NOT_FOUND, pseudonyme compris' },
      add_member: { erreurs: ['NOT_FOUND'], pseudonyme: 'NOT_FOUND sans effet, apres les controles de P4.R1 ; ancien identifiant : nouveau membre' },
    },
    erreurs: ['NOT_FOUND', 'FORBIDDEN'],
    exemples: [
      { requete: { op: 'get_wallet', tenant: 't-alpha', actor: 'm-sam', args: { member_id: 'anon-0001' } }, reponse: { ok: true, member_id: 'anon-0001', balance_cents: 547 } },
      { requete: { op: 'list_documents', tenant: 't-alpha', actor: 'm-sam', args: { member_id: 'm-gus' } }, reponse: { ok: false, error: 'NOT_FOUND' } },
    ],
  },
  implementation: {
    'get_wallet.etape.pseudonyme': etape(6, (ctx) => {
      const m = ctx.args.member_id
      if (!estPseudonyme(ctx, m)) return undefined
      return succeed({ member_id: m, balance_cents: ctx.regle<Solde>('portefeuille.solde')(ctx, String(m)) })
    }),
    // Q62 : un pseudonyme ne designe jamais un membre ; controle apres ceux de P4.R1 (add_member.etape.arguments, rang 10).
    'add_member.etape.pseudonyme': etape(20, (ctx) => (pseudonymesDe(ctx.locataire).ensemble.has(String(ctx.args.member_id)) ? fail('NOT_FOUND') : undefined)),
    'list_documents.etape.pseudonyme': etape(6, (ctx) => (estPseudonyme(ctx, ctx.args.member_id) ? documentsDe(ctx, ctx.args.member_id) : undefined)),
  },
  grandeurs: ['member_id', 'balance_cents', 'invoice_id'],
})

/* ═══════════════════════════════════════════════════════════════════ P19 */

interface Pagination {
  readonly page_size: number
  readonly page: number
}
type PaginationValide = (args: Json) => Pagination | null
type Paginer = <T>(lignes: readonly T[], p: Pagination) => { total: number; page: number; page_size: number; pages: number; rows: T[] }
interface LigneOccupation {
  readonly slot_id: string
  readonly starts_at: string
  readonly capacity: number
  readonly booked: number
  readonly fill_bp: number
}
type OrdreOccupation = (lignes: readonly LigneOccupation[], sort: string) => LigneOccupation[]

const TRIS_OCCUPATION = ['starts_at', '-fill_bp', 'slot_id'] as const
const TRIS_REVENUS = ['month', '-net_cents', 'member_id'] as const

const P19_R1 = clause({
  id: 'P19.R1',
  enters: 'P19',
  text: TEXTE_P19_R1,
  contract: {
    operations: {
      report_occupancy: {
        roles_autorises: ['admin', 'staff'],
        arguments: { from: "'AAAA-MM-JJTHH:MM:SSZ' inclus", to: "'AAAA-MM-JJTHH:MM:SSZ' exclu", min_fill_bp: 'entier >= 0 (0)', sort: "'starts_at' (defaut) | '-fill_bp' | 'slot_id'", page_size: 'entier 1..100 (20)', page: 'entier >= 1 (1)' },
        reponse: { ok: true, total: 'entier', page: 'entier', page_size: 'entier', pages: 'entier', rows: 'tableau de { slot_id, starts_at, capacity, booked, fill_bp }' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { tris: [...TRIS_OCCUPATION], page_size: { defaut: 20, min: 1, max: 100 }, page: { defaut: 1, min: 1 }, fill_bp: 'floor(booked * 10000 / capacity)', fenetre: '[from, to[' },
    exemples: [
      { requete: { op: 'report_occupancy', tenant: 't-alpha', actor: 'm-sam', args: { from: '2031-05-01T00:00:00Z', to: '2031-06-01T00:00:00Z', page_size: 101 } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
      { calcul: 'S20 : capacity 20, booked 19 -> fill_bp floor(190000 / 20) = 9500' },
    ],
  },
  implementation: {
    'autorisation.report_occupancy': ['admin', 'staff'],
    'rapport.pagination_valide': ((args) => {
      const page_size = args.page_size ?? 20
      const page = args.page ?? 1
      if (!estEntier(page_size) || page_size < 1 || page_size > 100 || !estEntier(page) || page < 1) return null
      return { page_size, page }
    }) satisfies PaginationValide,
    'report_occupancy.effet': (ctx: PlatformContext): PlatformResponse => {
      const { from, to } = ctx.args
      if (!estInstant(from) || !estInstant(to) || Date.parse(from) >= Date.parse(to)) return fail('INVALID_ARGUMENT')
      const min = ctx.args.min_fill_bp ?? 0
      if (!estEntier(min) || min < 0) return fail('INVALID_ARGUMENT')
      const sort = ctx.args.sort ?? 'starts_at'
      if (typeof sort !== 'string' || !(TRIS_OCCUPATION as readonly string[]).includes(sort)) return fail('INVALID_ARGUMENT')
      const pagination = ctx.regle<PaginationValide>('rapport.pagination_valide')(ctx.args)
      if (pagination === null) return fail('INVALID_ARGUMENT')
      const debut = Date.parse(from)
      const fin = Date.parse(to)
      const lignes: LigneOccupation[] = []
      for (const s of ctx.locataire.slots.values()) {
        const t = Date.parse(s.starts_at)
        if (t < debut || t >= fin) continue
        const booked = ctx.occupees(s)
        const fill_bp = Math.floor((booked * 10000) / s.capacity)
        if (fill_bp >= min) lignes.push({ slot_id: s.slot_id, starts_at: s.starts_at, capacity: s.capacity, booked, fill_bp })
      }
      const ordonnees = ctx.regle<OrdreOccupation>('rapport.ordre_occupation')(lignes, sort)
      return succeed(clone(ctx.regle<Paginer>('rapport.paginer')(ordonnees, pagination)))
    },
  },
  grandeurs: ['from', 'to', 'min_fill_bp', 'sort', 'page_size', 'page', 'slot_id', 'starts_at', 'capacity', 'booked', 'fill_bp'],
})

const P19_R2 = clause({
  id: 'P19.R2',
  enters: 'P19',
  text: TEXTE_P19_R2,
  contract: {
    valeurs: { departage: ['starts_at croissant', 'slot_id croissant ordinal'], pages: 'ceil(total / page_size), 0 si total = 0', page_au_dela: 'rows = []' },
    exemples: [
      { requete: { op: 'report_occupancy', tenant: 't-alpha', actor: 'm-sam', args: { from: '2031-05-01T00:00:00Z', to: '2031-06-01T00:00:00Z', sort: '-fill_bp', page_size: 2, page: 4 } }, reponse: { ok: true, total: 5, page: 4, page_size: 2, pages: 3, rows: [] } },
    ],
  },
  implementation: {
    'rapport.paginer': (<T>(lignes: readonly T[], p: Pagination) => {
      const total = lignes.length
      const pages = Math.ceil(total / p.page_size)
      const rows = lignes.slice((p.page - 1) * p.page_size, p.page * p.page_size)
      return { total, page: p.page, page_size: p.page_size, pages, rows }
    }) satisfies Paginer,
    'rapport.ordre_occupation': ((lignes, sort) => {
      const cle = (a: LigneOccupation, b: LigneOccupation): number =>
        sort === '-fill_bp' ? b.fill_bp - a.fill_bp : sort === 'slot_id' ? ordinal(a.slot_id, b.slot_id) : 0
      return [...lignes].sort((a, b) => cle(a, b) || Date.parse(a.starts_at) - Date.parse(b.starts_at) || ordinal(a.slot_id, b.slot_id))
    }) satisfies OrdreOccupation,
  },
  grandeurs: ['total', 'page', 'page_size', 'pages', 'rows', 'sort', 'starts_at', 'slot_id', 'fill_bp'],
})

interface LigneRevenu {
  readonly invoice_id: string
  readonly month: string
  readonly member_id: string
  readonly total_cents: number
  readonly credit_notes_cents: number
  readonly net_cents: number
}

const P19_R3 = clause({
  id: 'P19.R3',
  enters: 'P19',
  text: TEXTE_P19_R3,
  contract: {
    operations: {
      report_revenue: {
        roles_autorises: ['admin'],
        arguments: { from_month: "'AAAA-MM'", to_month: "'AAAA-MM'", member_id: 'chaine (optionnel)', sort: "'month' (defaut) | '-net_cents' | 'member_id'", page_size: 'entier 1..100 (20)', page: 'entier >= 1 (1)' },
        reponse: { ok: true, total: 'entier', page: 'entier', page_size: 'entier', pages: 'entier', sum_net_cents: 'entier', rows: 'tableau de { invoice_id, month, member_id, total_cents, credit_notes_cents, net_cents }' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT'],
      },
    },
    valeurs: { tris: [...TRIS_REVENUS], departage: ['month croissant', 'member_id croissant ordinal'] },
    exemples: [
      { requete: { op: 'report_revenue', tenant: 't-alpha', actor: 'm-ana', args: { from_month: '2031-07', to_month: '2031-06' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.report_revenue': ['admin'],
    'report_revenue.effet': (ctx: PlatformContext): PlatformResponse => {
      const { from_month, to_month } = ctx.args
      if (typeof from_month !== 'string' || !MOIS.test(from_month) || typeof to_month !== 'string' || !MOIS.test(to_month) || from_month > to_month) {
        return fail('INVALID_ARGUMENT')
      }
      const sort = ctx.args.sort ?? 'month'
      if (typeof sort !== 'string' || !(TRIS_REVENUS as readonly string[]).includes(sort)) return fail('INVALID_ARGUMENT')
      const pagination = ctx.regle<PaginationValide>('rapport.pagination_valide')(ctx.args)
      if (pagination === null) return fail('INVALID_ARGUMENT')
      const f = facturation(ctx)
      const filtre = ctx.args.member_id
      const lignes: LigneRevenu[] = []
      for (const x of f.factures.values()) {
        const month = String(x.month)
        if (month < from_month || month > to_month) continue
        if (filtre !== undefined && x.member_id !== filtre) continue
        const total_cents = x.total_cents as number
        const credit_notes_cents = f.avoirs
          .filter((a) => a.invoice_id === x.invoice_id && Date.parse(String(a.issued_at)) <= ctx.instant)
          .reduce((s, a) => s + (a.amount_cents as number), 0)
        lignes.push({ invoice_id: String(x.invoice_id), month, member_id: String(x.member_id), total_cents, credit_notes_cents, net_cents: total_cents - credit_notes_cents })
      }
      const cle = (a: LigneRevenu, b: LigneRevenu): number =>
        sort === '-net_cents' ? b.net_cents - a.net_cents : sort === 'member_id' ? ordinal(a.member_id, b.member_id) : 0
      lignes.sort((a, b) => cle(a, b) || ordinal(a.month, b.month) || ordinal(a.member_id, b.member_id))
      const sum_net_cents = lignes.reduce((s, l) => s + l.net_cents, 0)
      const p = ctx.regle<Paginer>('rapport.paginer')(lignes, pagination)
      return succeed(clone({ total: p.total, page: p.page, page_size: p.page_size, pages: p.pages, sum_net_cents, rows: p.rows }))
    },
  },
  grandeurs: ['from_month', 'to_month', 'member_id', 'sort', 'invoice_id', 'month', 'total_cents', 'credit_notes_cents', 'net_cents', 'sum_net_cents', 'total', 'pages', 'rows'],
})

/* ═══════════════════════════════════════════════════════════════════ P20 */

const LIGNES_MAX = 50_000
interface IssueDeLigne {
  readonly index: number
  readonly request_id: unknown
  readonly reponse: PlatformResponse
  readonly doublon: boolean
}
type BilanImport = (ctx: PlatformContext, import_id: string, issues: readonly IssueDeLigne[]) => PlatformResponse

const PLAFONDS_P95_MS: Readonly<Record<string, number>> = {
  reserve: 50,
  cancel: 50,
  get_booking: 20,
  get_slot: 20,
  get_wallet: 20,
  list_documents: 100,
  report_occupancy: 200,
  report_revenue: 200,
}
const PLAFOND_PAR_DEFAUT_MS = 100
const DUREE_IMPORT_MS = 30_000

const P20_R1 = clause({
  id: 'P20.R1',
  enters: 'P20',
  text: TEXTE_P20_R1,
  contract: {
    operations: {
      import_bookings: {
        roles_autorises: ['admin', 'staff'],
        arguments: { import_id: 'chaine non vide', rows: 'tableau de 1 a 50 000 { request_id, member_id, slot_id, seats? }' },
        erreurs: ['FORBIDDEN', 'INVALID_ARGUMENT'],
        ligne: 'traitee exactement comme reserve (controles, idempotence, admission, paiement)',
      },
    },
    valeurs: { lignes_min: 1, lignes_max: LIGNES_MAX },
    exemples: [
      { requete: { op: 'import_bookings', tenant: 't-alpha', actor: 'm-sam', args: { import_id: 'imp-2', rows: [] } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'autorisation.import_bookings': ['admin', 'staff'],
    'import_bookings.etape.identifiant': etape(5, (ctx) => (estChaine(ctx.args.import_id) ? undefined : fail('INVALID_ARGUMENT'))),
    'import_bookings.effet': (ctx: PlatformContext): PlatformResponse => {
      const rows = ctx.args.rows
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > LIGNES_MAX) return fail('INVALID_ARGUMENT')
      const issues: IssueDeLigne[] = []
      rows.forEach((row: unknown, i: number) => {
        const index = i + 1
        const rid = row !== null && typeof row === 'object' && !Array.isArray(row) ? (row as Json).request_id : undefined
        if (typeof rid !== 'string') {
          issues.push({ index, request_id: rid ?? null, reponse: fail('INVALID_ARGUMENT'), doublon: false })
          return
        }
        const deja = ctx.locataire.memo.has(rid)
        const reponse = ctx.executer('reserve', clone(row as Json))
        const conflit = reponse.ok === false && reponse.error === 'IDEMPOTENCY_CONFLICT'
        issues.push({ index, request_id: rid, reponse, doublon: deja && !conflit })
      })
      return ctx.regle<BilanImport>('import.bilan')(ctx, String(ctx.args.import_id), issues)
    },
  },
  grandeurs: ['import_id', 'rows', 'request_id', 'member_id', 'slot_id', 'seats'],
})

const P20_R2 = clause({
  id: 'P20.R2',
  enters: 'P20',
  text: TEXTE_P20_R2,
  contract: {
    operations: {
      import_bookings: {
        reponse: { ok: true, import_id: 'chaine', total: 'entier', accepted: 'entier', confirmed: 'entier', waiting: 'entier', duplicates: 'entier', rejected: 'tableau de { index, request_id, error }' },
      },
    },
    identite: 'total = accepted + duplicates + nombre de rejected ; accepted = confirmed + waiting',
    exemples: [
      { reponse: { ok: true, import_id: 'imp-4', total: 2, accepted: 2, confirmed: 0, waiting: 2, duplicates: 0, rejected: [] } },
    ],
  },
  implementation: {
    'import.bilan': ((_ctx, import_id, issues) => {
      let confirmed = 0
      let waiting = 0
      let duplicates = 0
      const rejected: Json[] = []
      for (const x of issues) {
        if (x.doublon) duplicates += 1
        else if (x.reponse.ok === true) {
          if (x.reponse.status === 'confirmed') confirmed += 1
          else waiting += 1
        } else rejected.push({ index: x.index, request_id: x.request_id, error: x.reponse.error })
      }
      return succeed({ import_id, total: issues.length, accepted: confirmed + waiting, confirmed, waiting, duplicates, rejected })
    }) satisfies BilanImport,
  },
  grandeurs: ['import_id', 'total', 'accepted', 'confirmed', 'import_bookings.waiting', 'duplicates', 'rejected', 'index'],
})

const P20_R3 = clause({
  id: 'P20.R3',
  enters: 'P20',
  text: TEXTE_P20_R3,
  contract: {
    valeurs: { unite: 'millisecondes (ms), latence au 95e centile', plafonds_p95_ms: { ...PLAFONDS_P95_MS, autre: PLAFOND_PAR_DEFAUT_MS }, import_50000_lignes_ms: DUREE_IMPORT_MS, volume_reservations: LIGNES_MAX },
    mesure: 'T75 (pas les faits de la racine)',
  },
  implementation: {
    'performance.plafond_p95_ms': (op: string): number => PLAFONDS_P95_MS[op] ?? PLAFOND_PAR_DEFAUT_MS,
    'performance.duree_import_ms': (): number => DUREE_IMPORT_MS,
  },
  grandeurs: ['plafond_p95_ms', 'duree_import_ms'],
})

/** Mémoire d'idempotence d'un import (P20.R4) : seule une réponse ok: true est mémorisée, avec ses rows. */
const memoriserImport = (ctx: PlatformContext, cle: string): void => {
  const imports = importsDe(ctx.locataire)
  const rows = clone(ctx.args.rows)
  ctx.apres.push((r) => {
    if (r.ok === true) imports.set(cle, { reponse: clone(r), rows })
  })
}

const P20_R4 = clause({
  id: 'P20.R4',
  enters: 'P20',
  exits: 'P21',
  text: TEXTE_P20_R4,
  contract: {
    operations: { import_bookings: { idempotence: 'cle (tenant, import_id) ; reponse ok: true rejouee a l identique quels que soient les rows' } },
    exemples: [{ contexte: 'imp-1 deja importe', requete: { op: 'import_bookings', args: { import_id: 'imp-1', rows: '(memes ou autres)' } }, reponse: { ok: true, import_id: 'imp-1', total: 10, accepted: 3, duplicates: 2 } }],
  },
  implementation: {
    'import_bookings.etape.idempotence': etape(10, (ctx) => {
      const cle = String(ctx.args.import_id)
      const memo = importsDe(ctx.locataire).get(cle)
      if (memo !== undefined) return clone(memo.reponse)
      memoriserImport(ctx, cle)
      return undefined
    }),
  },
  grandeurs: ['import_id'],
})

/* ═══════════════════════════════════════════════════════════════════ P21 */

const P21_R1 = clause({
  id: 'P21.R1',
  enters: 'P21',
  replaces: 'P1.R4',
  text: TEXTE_P21_R1,
  contract: {
    operations: {
      reserve: {
        idempotence: 'cle (tenant, request_id) ; arguments normalises { member_id, slot_id, seats (1 si absent) } egaux -> reponse memorisee ; differents -> IDEMPOTENCY_CONFLICT (non memorise)',
        erreurs: ['IDEMPOTENCY_CONFLICT'],
      },
      import_bookings: { ligne_en_conflit: 'rejected, error IDEMPOTENCY_CONFLICT' },
    },
    erreurs: ['IDEMPOTENCY_CONFLICT'],
    valeurs: { arguments_normalises: ['member_id', 'slot_id', 'seats (defaut 1)'] },
    exemples: [
      { contexte: 'r21b memorise avec { m-dan, S42, 1 }', requete: { op: 'reserve', args: { request_id: 'r21b', member_id: 'm-dan', slot_id: 'S42', seats: 1 } }, reponse: { ok: true, booking_id: 'r21b', status: 'confirmed' } },
      { requete: { op: 'reserve', args: { request_id: 'r21b', member_id: 'm-dan', slot_id: 'S42', seats: 2 } }, reponse: { ok: false, error: 'IDEMPOTENCY_CONFLICT' } },
    ],
  },
  implementation: {
    'reserve.etape.idempotence': etape(10, (ctx) => {
      const cle = String(ctx.args.request_id)
      const t = ctx.locataire
      const arguments_de = argumentsMemorises(ctx)
      const demandes = argumentsNormalises(ctx.args)
      const memo = t.memo.get(cle)
      if (memo !== undefined) {
        const premiers = arguments_de.get(cle)
        if (premiers !== undefined && !egalProfond(premiers, demandes)) return fail('IDEMPOTENCY_CONFLICT')
        ctx.d.cle_idempotence = cle
        return clone(memo)
      }
      ctx.d.cle_idempotence = cle
      ctx.apres.push((r) => {
        const memorisable = ctx.regleOpt<(r: PlatformResponse) => boolean>('idempotence.memorisable')
        if (memorisable === undefined || memorisable(r)) {
          t.memo.set(cle, clone(r))
          arguments_de.set(cle, demandes)
        }
      })
      return undefined
    }),
  },
  grandeurs: ['request_id', 'member_id', 'slot_id', 'seats'],
})

const P21_R2 = clause({
  id: 'P21.R2',
  enters: 'P21',
  replaces: 'P20.R4',
  text: TEXTE_P21_R2,
  contract: {
    operations: { import_bookings: { idempotence: 'rows egaux en profondeur -> reponse memorisee ; sinon IDEMPOTENCY_CONFLICT (non memorise)', erreurs: ['IDEMPOTENCY_CONFLICT'] } },
    exemples: [{ contexte: 'imp-1 rejoue avec 3 lignes au lieu de 10', requete: { op: 'import_bookings', args: { import_id: 'imp-1' } }, reponse: { ok: false, error: 'IDEMPOTENCY_CONFLICT' } }],
  },
  implementation: {
    'import_bookings.etape.idempotence': etape(10, (ctx) => {
      const cle = String(ctx.args.import_id)
      const memo = importsDe(ctx.locataire).get(cle)
      if (memo !== undefined) return egalProfond(memo.rows, ctx.args.rows) ? clone(memo.reponse) : fail('IDEMPOTENCY_CONFLICT')
      memoriserImport(ctx, cle)
      return undefined
    }),
  },
  grandeurs: ['import_id', 'rows'],
})

/** Créneaux touchés par l'opération courante (créneau ou créneau de la réservation de l'opération). */
const creneauxTouches = (ctx: PlatformContext): Slot[] => {
  const out = new Set<Slot>()
  const s = ctx.d.slot as Slot | undefined
  if (s !== undefined && ctx.locataire.slots.get(s.slot_id) === s) out.add(s)
  for (const cle of ['booking', 'autre']) {
    const b = ctx.d[cle] as Booking | undefined
    const sb = b === undefined ? undefined : ctx.locataire.slots.get(b.slot_id)
    if (sb !== undefined) out.add(sb)
  }
  return [...out]
}

const P21_R3 = clause({
  id: 'P21.R3',
  enters: 'P21',
  text: TEXTE_P21_R3,
  contract: {
    invariants: ['booked <= overbook_limit', 'place numerotee unique', 'une reservation active par (membre, creneau)', 'une reservation par request_id', 'solde >= 0'],
    valeurs: { essais_paralleles_min: 100, clients_paralleles: 20, ordre_sequentiel: 'celui de la trajectoire, y compris a instant egal' },
  },
  implementation: {
    'invariant.coherence': ((ctx) => {
      for (const slot of creneauxTouches(ctx)) {
        const plafond = ctx.regle<Plafond>('creneau.plafond')(ctx, slot)
        if (ctx.occupees(slot) > plafond) throw new Error(`INVARIANT-ROMPU booked > overbook_limit sur ${slot.slot_id}`)
        const places = new Set<number>()
        const actifs = new Set<string>()
        for (const b of ctx.locataire.bookings.values()) {
          if (b.slot_id !== slot.slot_id) continue
          if (ctx.estActive(b)) {
            if (actifs.has(b.member_id)) throw new Error(`INVARIANT-ROMPU deux reservations actives de ${b.member_id} sur ${slot.slot_id}`)
            actifs.add(b.member_id)
          }
          if (b.status !== 'confirmed' || slot.numbered !== true) continue
          for (const x of b.seat_numbers ?? []) {
            if (places.has(x)) throw new Error(`INVARIANT-ROMPU place ${String(x)} attribuee deux fois sur ${slot.slot_id}`)
            places.add(x)
          }
        }
      }
      for (const [m, w] of ctx.locataire.wallets) if (w < 0) throw new Error(`INVARIANT-ROMPU solde negatif ${m}`)
    }) satisfies Invariant,
  },
  grandeurs: ['booked', 'overbook_limit', 'seat_numbers', 'balance_cents', 'request_id'],
})

const P21_R4 = clause({
  id: 'P21.R4',
  enters: 'P21',
  text: TEXTE_P21_R4,
  contract: {
    scenarios: ['derniere_place : exactement une confirmed, les autres waiting dans l ordre de serialisation', 'rejeux_simultanes : une reservation, N reponses identiques', 'rejeux_en_conflit : reponse memorisee ou IDEMPOTENCY_CONFLICT'],
    erreurs: ['IDEMPOTENCY_CONFLICT'],
    exemples: [
      { contexte: 'S42 : une place libre ; r21b puis r21c au meme instant', reponse: { r21b: { status: 'confirmed' }, r21c: { status: 'waiting', position: 1 } } },
    ],
  },
  implementation: {
    'invariant.rejeu_identique': ((ctx, r) => {
      const cle = ctx.d.cle_idempotence
      if (typeof cle !== 'string') return
      if (r.ok === false && (r.error === 'IDEMPOTENCY_CONFLICT' || r.error === 'FORBIDDEN')) return
      const memo = ctx.locataire.memo.get(cle)
      if (memo !== undefined && !egalProfond(memo, r)) throw new Error(`INVARIANT-ROMPU rejeu divergent de la cle ${cle}`)
    }) satisfies Invariant,
  },
  grandeurs: ['request_id', 'status', 'position'],
})

/* ═══════════════════════════════════════════════════════════════════ P22 */

/** Même instant UTC, 12 mois civils plus tard ; le jour est borné au dernier jour du mois (29 février -> 28 février). */
function plusDouzeMois(t: number): number {
  const d = new Date(t)
  const an = d.getUTCFullYear() + 1
  const dernierJour = new Date(Date.UTC(an, d.getUTCMonth() + 1, 0)).getUTCDate()
  return Date.UTC(an, d.getUTCMonth(), Math.min(d.getUTCDate(), dernierJour), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
}

interface Lot {
  readonly entree: MouvementDate
  readonly ordre: number
  readonly acquis: number
  readonly echeance: number
  reste: number
  echu: boolean
}
type Lots = (historique: readonly MouvementDate[], member: string, jusqua: number) => { vivants: Lot[]; echus: Lot[] }

const P22_R1 = clause({
  id: 'P22.R1',
  enters: 'P22',
  replaces: 'P15.R6',
  text: TEXTE_P22_R1,
  contract: {
    operations: {
      reserve: { erreurs: ['RATE_UNAVAILABLE'], reponse: { amount_cents: "entier (EUR), sans remise, si status != 'waiting'", price_currency: "'USD'", original_amount_cents: 'entier (USD)', rate_micro: 'entier' } },
      get_booking: { reponse: { amount_cents: 'entier (EUR)' } },
      set_tier: { reste_accepte: 'sans effet sur le prix' },
    },
    valeurs: { taux_de_remise_bp: 0, recalcul_P16: 'taux de remise de la confirmation de chaque reservation' },
    exemples: [
      { contexte: 'm-cleo gold, S60 a 600', requete: { op: 'reserve', args: { request_id: 'f2', member_id: 'm-cleo', slot_id: 'S60' } }, reponse: { ok: true, booking_id: 'f2', amount_cents: 600, paid_card_cents: 600 } },
    ],
  },
  implementation: {
    'tarif.montant': P15_R6.implementation['tarif.montant'],
    'reservation.montant': (ctx: PlatformContext, b: Booking): number => {
      const slot = ctx.locataire.slots.get(b.slot_id)
      const devise = ctx.regle<Devise>('tarif.devise')(ctx, slot)
      const rate_micro = devise === 'USD' ? ctx.regle<TauxApplicable>('devise.taux_applicable')(ctx, ctx.instant) : undefined
      const prix = ctx.regle<(ctx: PlatformContext, s: Slot | undefined) => number>('tarif.prix')(ctx, slot)
      const { amount_cents, net } = ctx.regle<Montant>('tarif.montant')(ctx, { seats: b.seats, prix, devise, taux_bp: 0, ...(rate_micro === undefined ? {} : { rate_micro }) })
      b.discount_bp = 0
      if (devise === 'USD') {
        b.price_currency = 'USD'
        b.original_amount_cents = net
        if (rate_micro !== undefined) b.rate_micro = rate_micro
      }
      return amount_cents
    },
    'vue.reservation.montant': P15_R6.implementation['vue.reservation.montant'],
    'vue.reservation.devise': P15_R6.implementation['vue.reservation.devise'],
    'reserve.etape.taux': P15_R6.implementation['reserve.etape.taux'],
    'promotion.condition.taux': P15_R6.implementation['promotion.condition.taux'],
  },
  grandeurs: ['amount_cents', 'price_cents', 'seats', 'discount_bp', 'price_currency', 'original_amount_cents', 'rate_micro'],
  unites: { price_cents: PRIX_EN_DEVISE },
})

const P22_R2 = clause({
  id: 'P22.R2',
  enters: 'P22',
  text: TEXTE_P22_R2,
  contract: {
    valeurs: { duree: '12 mois civils, meme instant UTC ; 29 fevrier + 12 mois = 28 fevrier', bornes: 'expire si at >= expires_at', consommation: "expires_at croissant puis ordre d'entree", retroactivite: 'tout l historique du portefeuille depuis P8' },
    lot: { acquired_at: "'AAAA-MM-JJTHH:MM:SSZ'", expires_at: "'AAAA-MM-JJTHH:MM:SSZ'", remaining_cents: 'entier' },
    exemples: [
      { contexte: 'lot de 400 expirant le 2032-08-11T09:02:00Z', requete: { op: 'get_wallet', at: '2032-08-11T09:01:59Z', args: { member_id: 'm-fay' } }, reponse: { ok: true, balance_cents: 900 } },
      { requete: { op: 'get_wallet', at: '2032-08-11T09:02:00Z', args: { member_id: 'm-fay' } }, reponse: { ok: true, balance_cents: 500 } },
      { contexte: 'top_up de 1000 le 2032-02-29T10:00:00Z', requete: { op: 'get_wallet', args: { member_id: 'm-feb' } }, reponse: { ok: true, balance_cents: 1000, lots: [{ acquired_at: '2032-02-29T10:00:00Z', expires_at: '2033-02-28T10:00:00Z', remaining_cents: 1000 }] } },
    ],
  },
  implementation: {
    'portefeuille.lots': ((historique, member, jusqua) => {
      const lots: Lot[] = []
      const echus: Lot[] = []
      const parEcheance = (a: Lot, b: Lot): number => a.echeance - b.echeance || a.ordre - b.ordre
      const expirer = (t: number): void => {
        for (const l of lots) {
          if (!l.echu && l.echeance <= t) {
            l.echu = true
            echus.push(l)
          }
        }
      }
      const evenements = historique
        .map((h, i) => [h, i] as const)
        .filter(([h]) => h.member_id === member && h.expiration !== true && h.t <= jusqua)
        .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
      for (const [h] of evenements) {
        expirer(h.t)
        if (h.delta > 0) {
          lots.push({ entree: h, ordre: lots.length, acquis: h.t, echeance: plusDouzeMois(h.t), reste: h.delta, echu: false })
          continue
        }
        let d = -h.delta
        for (const l of lots.filter((x) => !x.echu && x.reste > 0).sort(parEcheance)) {
          const pris = Math.min(l.reste, d)
          l.reste -= pris
          d -= pris
          if (d === 0) break
        }
        if (d > 0) throw new Error(`LOTS-INSUFFISANTS ${member} a ${isoSeconde(h.t)}`)
      }
      expirer(jusqua)
      return { vivants: lots.filter((l) => !l.echu && l.reste > 0).sort(parEcheance), echus: echus.sort(parEcheance) }
    }) satisfies Lots,
    'enveloppe.expiration': etape(15, (ctx) => {
      if (ctx.step.op === 'create_tenant') return undefined
      const t = ctx.locataire
      const historique = historiqueDe(t)
      const lots = ctx.regle<Lots>('portefeuille.lots')
      const echeances: Array<{ member: string; lot: Lot }> = []
      for (const member of new Set(historique.map((h) => h.member_id))) {
        for (const lot of lots(historique, member, ctx.instant).echus) {
          if (lot.entree.expire === true) continue
          lot.entree.expire = true
          if (lot.reste > 0) echeances.push({ member, lot })
        }
      }
      echeances.sort((a, b) => a.lot.echeance - b.lot.echeance || a.lot.entree.t - b.lot.entree.t || ordinal(a.member, b.member))
      for (const { member, lot } of echeances) {
        historique.push({ member_id: member, t: lot.echeance, delta: -lot.reste, expiration: true })
        t.wallets.set(member, (t.wallets.get(member) ?? 0) - lot.reste)
        t.journal.push({
          seq: ++ctx.etat.journal_seq,
          at: isoSeconde(lot.echeance),
          type: 'expiry',
          member_id: member,
          booking_id: null,
          amount_cents: lot.reste,
          credits_cents: lot.reste,
          card_cents: 0,
        })
      }
      return undefined
    }),
  },
  grandeurs: ['acquired_at', 'expires_at', 'remaining_cents', 'balance_cents', 'at'],
})

const P22_R3 = clause({
  id: 'P22.R3',
  enters: 'P22',
  text: TEXTE_P22_R3,
  contract: {
    operations: {
      get_wallet: { reponse: { lots: 'tableau de { acquired_at, expires_at, remaining_cents }, expires_at croissant puis ordre d entree' } },
      top_up: { reponse: { expires_at: "'AAAA-MM-JJTHH:MM:SSZ'" } },
    },
    exemples: [
      { requete: { op: 'top_up', tenant: 't-alpha', actor: 'm-sam', at: '2032-08-02T09:01:00Z', args: { member_id: 'm-fay', amount_cents: 500 } }, reponse: { ok: true, member_id: 'm-fay', balance_cents: 1500, credited_cents: 500, expires_at: '2033-08-02T09:01:00Z' } },
    ],
  },
  implementation: {
    'get_wallet.complement.lots': ((ctx, r) => {
      if (r.ok !== true) return r
      const { vivants } = ctx.regle<Lots>('portefeuille.lots')(historiqueDe(ctx.locataire), String(r.member_id), ctx.instant)
      return { ...r, lots: vivants.map((l) => ({ acquired_at: isoSeconde(l.acquis), expires_at: isoSeconde(l.echeance), remaining_cents: l.reste })) }
    }) satisfies Complement,
    'top_up.complement.echeance': ((ctx, r) => (r.ok === true ? { ...r, expires_at: isoSeconde(plusDouzeMois(ctx.instant)) } : r)) satisfies Complement,
  },
  grandeurs: ['lots', 'acquired_at', 'expires_at', 'remaining_cents'],
})

/** Facture à partir de P22 (P22.R4 ; P23.R5 avec les frais) : lignes rangées à leur instant, expirations, frais. */
function factureAvecExpirations(ctx: PlatformContext, member: string, mois: string, frais: boolean): Json {
  const lignes = [...ctx.regle<Lignes>('comptabilite.lignes')(ctx, member, mois)].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seq - b.seq)
  const somme = (types: (t: string) => boolean, champ: 'amount_cents' | 'credits_cents' | 'card_cents'): number =>
    lignes.filter((e) => types(e.type)).reduce((s, e) => s + e[champ], 0)
  const charge = (t: string): boolean => t === 'charge' || (frais && t === 'fee')
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
    expired_cents: somme((t) => t === 'expiry', 'amount_cents'),
    credit_notes_credits_cents,
    ...champsDeFacture(ctx, lignes),
    opening_balance_cents: solde(debut(ctx, mois)),
    closing_balance_cents: solde(debut(ctx, moisSuivant(mois))),
  }
}
const sortieExpiration: SortieDeFacture = (x) => (typeof x.expired_cents === 'number' ? x.expired_cents : 0)
const GRANDEURS_FACTURE = [
  'invoice_id', 'member_id', 'month', 'lines.amount_cents', 'charges_cents', 'refunds_cents', 'total_cents',
  'invoices.card_cents', 'credits_used_cents', 'top_ups_cents', 'compensations_cents', 'credit_notes_credits_cents',
  'opening_balance_cents', 'closing_balance_cents', 'expired_cents', 'wallet_refunds_cents',
] as const

const P22_R4 = clause({
  id: 'P22.R4',
  enters: 'P22',
  exits: 'P23',
  replaces: 'P14.R3',
  text: TEXTE_P22_R4,
  contract: {
    facture: { lines: "tableau de { type: 'charge' | 'refund' | 'top_up' | 'compensation' | 'adjustment' | 'expiry' | 'wallet_refund', booking_id, amount_cents }, rangees a leur instant", expired_cents: 'entier', wallet_refunds_cents: 'entier' },
    identite: 'closing = opening + top_ups + compensations + credit_notes_credits - credits_used - expired - wallet_refunds',
    exemples: [
      { facture: { invoice_id: 'INV-2032-06-m-dan', month: '2032-06', lines: [{ type: 'expiry', booking_id: null, amount_cents: 1664 }], charges_cents: 0, total_cents: 0, credits_used_cents: 0, expired_cents: 1664, opening_balance_cents: 1681, closing_balance_cents: 17 } },
    ],
  },
  implementation: {
    'comptabilite.facture': ((ctx, member, mois) => factureAvecExpirations(ctx, member, mois, false)) satisfies Facture,
    'comptabilite.sortie.expiration': sortieExpiration,
  },
  grandeurs: [...GRANDEURS_FACTURE],
})

/* ═══════════════════════════════════════════════════════════════════ P23 */

interface Frais {
  readonly fee_cents: number
  readonly fee: { credits_cents: number; card_cents: number }
}
type FraisDeTransfert = (ctx: PlatformContext, b: Booking, cedant: string) => Frais

/** Payeur d'une réservation (P23.R3) : le membre débité à la confirmation ; null si jamais confirmée. */
const payeurDe = (b: Booking): string | null => etendue(b).payer_member_id ?? (b.confirmed_at !== undefined ? b.member_id : null)
const suspenduA = (ctx: PlatformContext, m: string): boolean => {
  const s = suspensionsDe(ctx.locataire).get(m)
  return s !== undefined && ctx.instant < s
}
const autreActive = (ctx: PlatformContext, m: string, slot_id: string, sauf: Booking): boolean => {
  for (const b of ctx.locataire.bookings.values()) if (b !== sauf && b.member_id === m && b.slot_id === slot_id && ctx.estActive(b)) return true
  return false
}
const commenceA = (ctx: PlatformContext, b: Booking): boolean => {
  const slot = ctx.locataire.slots.get(b.slot_id)
  return slot === undefined || ctx.instant >= Date.parse(slot.starts_at)
}
/** Cession de b à `vers` : payeur figé, frais du cédant (P23.R3), transfert inscrit. */
function ceder(ctx: PlatformContext, b: Booking, vers: string): Frais {
  const e = etendue(b)
  const cedant = b.member_id
  e.payer_member_id = payeurDe(b) ?? cedant
  const frais = ctx.regle<FraisDeTransfert>('transfert.frais')(ctx, b, cedant)
  b.member_id = vers
  ;(e.transfers ??= []).push({ from_member_id: cedant, to_member_id: vers, at: ctx.step.at, fee_cents: frais.fee_cents })
  return frais
}

const P23_R1 = clause({
  id: 'P23.R1',
  enters: 'P23',
  text: TEXTE_P23_R1,
  contract: {
    operations: {
      transfer_booking: {
        roles_autorises: ['admin', 'staff', 'member:titulaire'],
        arguments: { booking_id: 'chaine', to_member_id: 'chaine' },
        reponse: { ok: true, booking_id: 'chaine', member_id: 'nouveau titulaire', fee_cents: 'entier', fee: { credits_cents: 'entier', card_cents: 'entier' } },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT', 'SLOT_CLOSED', 'SUSPENDED', 'ALREADY_BOOKED'],
        ordre_des_controles: ['NOT_FOUND (booking_id)', 'FORBIDDEN (member non titulaire)', 'NOT_FOUND (to_member_id)', 'INVALID_ARGUMENT (non confirmed, ou meme titulaire)', 'SLOT_CLOSED', 'SUSPENDED (destinataire)', 'ALREADY_BOOKED (destinataire)'],
      },
    },
    exemples: [
      { requete: { op: 'transfer_booking', tenant: 't-alpha', actor: 'm-sam', args: { booking_id: 'h1', to_member_id: 'm-gus' } }, reponse: { ok: true, booking_id: 'h1', member_id: 'm-gus', fee_cents: 200, fee: { credits_cents: 0, card_cents: 200 } } },
      { contexte: 'm-fay detient deja h3 sur S70', requete: { op: 'transfer_booking', tenant: 't-alpha', actor: 'm-sam', args: { booking_id: 'h2', to_member_id: 'm-fay' } }, reponse: { ok: false, error: 'ALREADY_BOOKED' } },
    ],
  },
  implementation: {
    'autorisation.transfer_booking': ['admin', 'staff', 'member'],
    'transfer_booking.effet': (ctx: PlatformContext): PlatformResponse => {
      const b = ctx.locataire.bookings.get(String(ctx.args.booking_id))
      if (b === undefined) return fail('NOT_FOUND')
      ctx.d.booking = b
      if (ctx.role(ctx.step.actor) === 'member' && b.member_id !== ctx.step.actor) return fail('FORBIDDEN')
      const vers = ctx.args.to_member_id
      if (typeof vers !== 'string' || ctx.role(vers) === undefined) return fail('NOT_FOUND')
      if (b.status !== 'confirmed' || vers === b.member_id) return fail('INVALID_ARGUMENT')
      if (commenceA(ctx, b)) return fail('SLOT_CLOSED')
      if (suspenduA(ctx, vers)) return fail('SUSPENDED')
      if (autreActive(ctx, vers, b.slot_id, b)) return fail('ALREADY_BOOKED')
      const frais = ceder(ctx, b, vers)
      return succeed({ booking_id: b.booking_id, member_id: vers, fee_cents: frais.fee_cents, fee: { ...frais.fee } })
    },
  },
  grandeurs: ['booking_id', 'to_member_id', 'member_id', 'fee_cents', 'fee.credits_cents', 'fee.card_cents', 'starts_at', 'suspended_until', 'at'],
})

const P23_R2 = clause({
  id: 'P23.R2',
  enters: 'P23',
  text: TEXTE_P23_R2,
  contract: {
    operations: {
      exchange_bookings: {
        roles_autorises: ['admin', 'staff'],
        arguments: { booking_id: 'chaine', with_booking_id: 'chaine' },
        reponse: { ok: true, exchanged: 'tableau de deux { booking_id, member_id (nouveau titulaire), fee_cents }' },
        erreurs: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT', 'SLOT_CLOSED', 'SUSPENDED', 'ALREADY_BOOKED'],
        ordre_des_controles: ['NOT_FOUND', 'INVALID_ARGUMENT (meme reservation, non confirmed, meme titulaire)', 'SLOT_CLOSED', 'SUSPENDED', 'ALREADY_BOOKED (creneaux differents)'],
      },
    },
    exemples: [
      { requete: { op: 'exchange_bookings', tenant: 't-alpha', actor: 'm-sam', args: { booking_id: 'h2', with_booking_id: 'h3' } }, reponse: { ok: true, exchanged: [{ booking_id: 'h2', member_id: 'm-fay', fee_cents: 400 }, { booking_id: 'h3', member_id: 'm-dan', fee_cents: 200 }] } },
    ],
  },
  implementation: {
    'autorisation.exchange_bookings': ['admin', 'staff'],
    'exchange_bookings.effet': (ctx: PlatformContext): PlatformResponse => {
      const id1 = String(ctx.args.booking_id)
      const id2 = String(ctx.args.with_booking_id)
      const b1 = ctx.locataire.bookings.get(id1)
      const b2 = ctx.locataire.bookings.get(id2)
      if (b1 === undefined || b2 === undefined) return fail('NOT_FOUND')
      ctx.d.booking = b1
      ctx.d.autre = b2
      if (id1 === id2 || b1.status !== 'confirmed' || b2.status !== 'confirmed' || b1.member_id === b2.member_id) return fail('INVALID_ARGUMENT')
      if (commenceA(ctx, b1) || commenceA(ctx, b2)) return fail('SLOT_CLOSED')
      const m1 = b1.member_id
      const m2 = b2.member_id
      if (suspenduA(ctx, m1) || suspenduA(ctx, m2)) return fail('SUSPENDED')
      if (b1.slot_id !== b2.slot_id && (autreActive(ctx, m1, b2.slot_id, b2) || autreActive(ctx, m2, b1.slot_id, b1))) return fail('ALREADY_BOOKED')
      const f1 = ceder(ctx, b1, m2)
      const f2 = ceder(ctx, b2, m1)
      return succeed({
        exchanged: [
          { booking_id: b1.booking_id, member_id: m2, fee_cents: f1.fee_cents },
          { booking_id: b2.booking_id, member_id: m1, fee_cents: f2.fee_cents },
        ],
      })
    },
  },
  grandeurs: ['booking_id', 'with_booking_id', 'exchanged', 'member_id', 'fee_cents', 'seat_numbers'],
})

const TAUX_FRAIS_BP = 1000
const FRAIS_MINIMUM_CENTS = 100

const P23_R3 = clause({
  id: 'P23.R3',
  enters: 'P23',
  text: TEXTE_P23_R3,
  contract: {
    valeurs: { taux_bp: TAUX_FRAIS_BP, minimum_cents: FRAIS_MINIMUM_CENTS, arrondi: 'demi vers le haut, au centime', formule: '0 si A = 0 ; sinon max(100, floor((A*1000 + 5000) / 10000))', reservation_gratuite: 0, paiement: 'credits (lots, le plus ancien d abord) puis carte', mouvement: "'fee'" },
    operations: {
      reserve: { reponse: { payer_member_id: 'member_id | null', transfers: 'tableau de { from_member_id, to_member_id, at, fee_cents }' } },
      get_booking: { reponse: { payer_member_id: 'member_id | null', transfers: 'tableau de { from_member_id, to_member_id, at, fee_cents }' } },
    },
    exemples: [
      { calcul: 'A = 600 : floor((600*1000 + 5000) / 10000) = 60 < 100 -> fee_cents 100' },
      { contexte: 'f23a gratuite (A = 0)', requete: { op: 'transfer_booking', args: { booking_id: 'f23a', to_member_id: 'm-lou' } }, reponse: { ok: true, booking_id: 'f23a', member_id: 'm-lou', fee_cents: 0, fee: { credits_cents: 0, card_cents: 0 } } },
      { requete: { op: 'get_booking', args: { booking_id: 'h1' } }, reponse: { ok: true, booking_id: 'h1', member_id: 'm-gus', payer_member_id: 'm-cleo', transfers: [{ from_member_id: 'm-cleo', to_member_id: 'm-gus', at: '2032-08-16T09:06:00Z', fee_cents: 200 }] } },
    ],
  },
  implementation: {
    'transfert.frais': ((ctx, b, cedant) => {
      const A = b.amount_cents ?? 0
      const fee_cents = A === 0 ? 0 : Math.max(FRAIS_MINIMUM_CENTS, Math.floor((A * TAUX_FRAIS_BP + 5000) / 10000))
      const credits = Math.min(ctx.regle<Solde>('portefeuille.solde')(ctx, cedant), fee_cents)
      if (credits > 0) ctx.regle<Mouvement>('portefeuille.mouvement')(ctx, cedant, -credits)
      ctx.journaliser({ type: 'fee', member_id: cedant, booking_id: b.booking_id, amount_cents: fee_cents, credits_cents: credits, card_cents: fee_cents - credits })
      return { fee_cents, fee: { credits_cents: credits, card_cents: fee_cents - credits } }
    }) satisfies FraisDeTransfert,
    'vue.reservation.payeur': ((_ctx, b, champs) => {
      champs.payer_member_id = payeurDe(b)
      champs.transfers = (etendue(b).transfers ?? []).map((x) => ({ ...x }))
    }) satisfies Vue<Booking>,
  },
  grandeurs: ['fee_cents', 'fee.credits_cents', 'fee.card_cents', 'amount_cents', 'payer_member_id', 'transfers', 'balance_cents'],
})

const P23_R4 = clause({
  id: 'P23.R4',
  enters: 'P23',
  text: TEXTE_P23_R4,
  contract: {
    remboursements: 'au payeur (payer_member_id) : r_c a son portefeuille, r_d a sa carte, ligne refund ou avoir sur ses documents',
    compensation_de_debarquement: 'au titulaire',
    operations: { cancel: { titulaire: 'peut annuler (member pour sa reservation)' } },
    exemples: [
      { contexte: 'h2 payee par m-dan, transferee a m-fay', requete: { op: 'cancel', actor: 'm-fay', args: { booking_id: 'h2', seats: 1 } }, reponse: { ok: true, booking_id: 'h2', status: 'confirmed', seats: 1, refunded_cents: 2000, refund: { credits_cents: 0, card_cents: 2000 } } },
    ],
  },
  implementation: {
    'reservation.payeur': ((_ctx, b) => payeurDe(b) ?? b.member_id) satisfies Payeur,
  },
  grandeurs: ['payer_member_id', 'refunded_cents', 'refund.credits_cents', 'refund.card_cents'],
})

const P23_R5 = clause({
  id: 'P23.R5',
  enters: 'P23',
  replaces: 'P22.R4',
  text: TEXTE_P23_R5,
  contract: {
    facture: { lines: "tableau de { type: 'charge' | 'refund' | 'top_up' | 'compensation' | 'adjustment' | 'expiry' | 'wallet_refund' | 'fee', booking_id, amount_cents }", charges_cents: 'charges + frais' },
    identite: 'closing = opening + top_ups + compensations + credit_notes_credits - credits_used - expired - wallet_refunds',
    exemples: [
      { facture: { invoice_id: 'INV-2032-08-m-dan', lines: [{ type: 'charge', booking_id: 'h2', amount_cents: 4000 }, { type: 'fee', booking_id: 'h2', amount_cents: 400 }, { type: 'refund', booking_id: 'h2', amount_cents: 2000 }] } },
    ],
  },
  implementation: {
    'comptabilite.facture': ((ctx, member, mois) => factureAvecExpirations(ctx, member, mois, true)) satisfies Facture,
    'comptabilite.sortie.expiration': sortieExpiration,
  },
  grandeurs: [...GRANDEURS_FACTURE],
})

/* ═══════════════════════════════════════════════════════════════════ P24 */

interface Correspondance {
  readonly operations: Readonly<Record<string, string>>
  readonly champs: Readonly<Record<string, string>>
}
const CORRESPONDANCE_V2: Correspondance = {
  operations: {
    reserve: 'create_reservation',
    cancel: 'cancel_reservation',
    get_booking: 'get_reservation',
    get_slot: 'get_session',
    create_slot: 'create_session',
    transfer_booking: 'transfer_reservation',
    exchange_bookings: 'exchange_reservations',
    import_bookings: 'import_reservations',
  },
  champs: {
    booking_id: 'reservation_id',
    slot_id: 'session_id',
    slot_ids: 'session_ids',
    seats: 'quantity',
    with_booking_id: 'with_reservation_id',
  },
}
const inverse = (table: Readonly<Record<string, string>>): Record<string, string> => Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k]))
type Renommer = <T>(v: T, table: Readonly<Record<string, string>>) => T
/** Renomme les CLÉS d'une valeur JSON, à toute profondeur ; les valeurs ne changent pas. */
const renommerCles: Renommer = <T>(v: T, table: Readonly<Record<string, string>>): T => {
  if (Array.isArray(v)) return v.map((x: unknown) => renommerCles(x, table)) as T
  if (v !== null && typeof v === 'object') {
    const out: Json = {}
    for (const [k, x] of Object.entries(v as Json)) out[table[k] ?? k] = renommerCles(x, table)
    return out as T
  }
  return v
}
const porteUneCle = (v: unknown, cles: ReadonlySet<string>): boolean => {
  if (Array.isArray(v)) return v.some((x) => porteUneCle(x, cles))
  if (v !== null && typeof v === 'object') return Object.entries(v as Json).some(([k, x]) => cles.has(k) || porteUneCle(x, cles))
  return false
}
const erreurV2 = (code: string): PlatformResponse => ({ ok: false, error: { code } })

const P24_R1 = clause({
  id: 'P24.R1',
  enters: 'P24',
  text: TEXTE_P24_R1,
  contract: {
    enveloppe: { version: "'v1' | 'v2', hors args ; absent -> 'v1'" },
    erreurs: ['INVALID_ARGUMENT'],
    valeurs: { versions: ['v1', 'v2'], defaut: 'v1', controle: 'avant tout autre, meme celui du tenant' },
    exemples: [{ requete: { op: 'get_slot', tenant: 't-alpha', actor: 'm-sam', version: 'v3', args: { slot_id: 'S80' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } }],
  },
  implementation: {
    'requete.version': etape(10, (ctx) => {
      const v = ctx.step.version ?? 'v1'
      if (v !== 'v1' && v !== 'v2') return fail('INVALID_ARGUMENT')
      ctx.d.version = v
      return undefined
    }),
  },
  grandeurs: ['version'],
})

const P24_R2 = clause({
  id: 'P24.R2',
  enters: 'P24',
  text: TEXTE_P24_R2,
  contract: {
    operations: { ...CORRESPONDANCE_V2.operations },
    champs: { ...CORRESPONDANCE_V2.champs },
    erreur_v1: '{ ok: false, error: CODE }',
    erreur_v2: '{ ok: false, error: { code: CODE } }',
    portee: 'noms de cles, a toute profondeur, arguments et reponses ; seule l erreur de premier niveau change de forme',
    exemples: [
      { requete: { op: 'create_session', version: 'v2', args: { session_id: 'S80', capacity: 2, starts_at: '2032-09-30T16:00:00Z' } }, reponse: { ok: true, session_id: 'S80' } },
      { requete: { op: 'get_reservation', version: 'v2', args: { reservation_id: 'nope' } }, reponse: { ok: false, error: { code: 'NOT_FOUND' } } },
    ],
  },
  implementation: {
    'contrat.correspondance': (): Correspondance => CORRESPONDANCE_V2,
    'contrat.renommer': renommerCles,
    'contrat.forme_erreur': ((ctx, code) => (ctx.d.version === 'v2' ? erreurV2(code) : fail(code))) satisfies FormeErreur,
  },
  grandeurs: ['reservation_id', 'session_id', 'session_ids', 'quantity', 'with_reservation_id', 'booking_id', 'slot_id', 'slot_ids', 'seats', 'with_booking_id'],
})

const P24_R3 = clause({
  id: 'P24.R3',
  enters: 'P24',
  text: TEXTE_P24_R3,
  contract: {
    equivalence: 'requete v2 traduite en v1, executee, reponse traduite en v2 : meme effet, reponses correspondantes',
    idempotence: 'commune aux deux versions ; comparaison apres traduction en v1 ; reponse rendue dans la forme de la requete qui rejoue',
    exemples: [
      { contexte: 'v1r cree en v2 (quantity 2)', requete: { op: 'reserve', version: 'v1', args: { request_id: 'v1r', member_id: 'm-cleo', slot_id: 'S80', seats: 2 } }, reponse: { ok: true, booking_id: 'v1r', slot_id: 'S80', seats: 2 } },
    ],
  },
  implementation: {
    'requete.traduction': etape(30, (ctx) => {
      if (ctx.d.version !== 'v2') return undefined
      const c = ctx.regle<() => Correspondance>('contrat.correspondance')()
      const renommer = ctx.regle<Renommer>('contrat.renommer')
      const op = inverse(c.operations)[ctx.step.op] ?? ctx.step.op
      ctx.reecrire(op, renommer(ctx.args, inverse(c.champs)))
      ctx.sorties.push((r) => {
        if (r.ok !== false) return renommer(r, c.champs)
        return typeof r.error === 'string' ? erreurV2(r.error) : r
      })
      return undefined
    }),
  },
  grandeurs: ['version', 'request_id', 'import_id'],
})

const P24_R4 = clause({
  id: 'P24.R4',
  enters: 'P24',
  text: TEXTE_P24_R4,
  contract: {
    erreurs: ['INVALID_ARGUMENT'],
    v2: "nom d'operation v1 renomme, ou cle v1 renommee a toute profondeur -> { ok: false, error: { code: 'INVALID_ARGUMENT' } }",
    v1: "nom d'operation v2, ou cle v2 -> { ok: false, error: 'INVALID_ARGUMENT' }",
    exemples: [
      { requete: { op: 'get_reservation', version: 'v2', args: { booking_id: 'v1r' } }, reponse: { ok: false, error: { code: 'INVALID_ARGUMENT' } } },
      { requete: { op: 'reserve', version: 'v1', args: { request_id: 'v9r', member_id: 'm-dan', session_id: 'S80' } }, reponse: { ok: false, error: 'INVALID_ARGUMENT' } },
    ],
  },
  implementation: {
    'requete.noms': etape(20, (ctx) => {
      const c = ctx.regle<() => Correspondance>('contrat.correspondance')()
      const v2 = ctx.d.version === 'v2'
      const ops = v2 ? Object.keys(c.operations) : Object.values(c.operations)
      const cles = new Set(v2 ? Object.keys(c.champs) : Object.values(c.champs))
      if (!ops.includes(ctx.step.op) && !porteUneCle(ctx.args, cles)) return undefined
      return v2 ? erreurV2('INVALID_ARGUMENT') : fail('INVALID_ARGUMENT')
    }),
  },
  grandeurs: ['version'],
})

/** La source unique de clauses de F-PLATFORM, P1 à P24, dans l'ordre d'entrée. */
export const PLATFORM_CLAUSES: readonly PlatformClause[] = Object.freeze([
  P1_R1, P1_R2, P1_R3, P1_R4, P1_R5, P1_R6, P1_R7, P1_R8,
  P2_R1, P2_R2, P2_R3, P2_R4,
  P3_R1, P3_R2, P3_R3,
  P4_R1, P4_R2, P4_R3, P4_R4,
  P5_R1, P5_R2, P5_R3,
  P6_R1, P6_R2, P6_R3, P6_R4,
  P7_R1, P7_R2, P7_R3, P7_R4, P7_R5,
  P8_R1, P8_R2, P8_R3, P8_R4,
  P9_R1, P9_R2, P9_R3, P9_R4, P9_R5,
  P10_R1, P10_R2, P10_R3,
  P11_R1, P11_R2, P11_R3, P11_R4, P11_R5,
  P12_R1,
  P13_R1, P13_R2, P13_R3,
  P14_R1, P14_R2, P14_R3, P14_R4, P14_R5, P14_R6,
  P15_R1, P15_R2, P15_R3, P15_R4, P15_R5, P15_R6,
  P16_R1, P16_R2, P16_R3,
  P17_R1, P17_R2, P17_R3, P17_R4,
  P18_R1, P18_R2, P18_R3,
  P19_R1, P19_R2, P19_R3,
  P20_R1, P20_R2, P20_R3, P20_R4,
  P21_R1, P21_R2, P21_R3, P21_R4,
  P22_R1, P22_R2, P22_R3, P22_R4,
  P23_R1, P23_R2, P23_R3, P23_R4, P23_R5,
  P24_R1, P24_R2, P24_R3, P24_R4,
])
