// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ÉNONCÉ DES EXIGENCES par période, à destination du
// candidat (T53, ADR-011-enonce-des-exigences-pour-le-candidat.md L103-L109 ;
// verification/tasks.extensions.json : T53 est une tâche d'EXTENSION, pas du
// cahier).
//
// CE QUE CE FICHIER AJOUTE. ADR-011 L105 (verbatim) : « pour chaque période du
// scénario de démonstration, un énoncé en langue naturelle des règles
// F-RESERVATION actives à cette période, avec le vocabulaire et les
// paramètres du modèle attendu, déclaré dans la description exportée du
// contrat et inclus dans le prompt de la période ». Ce fichier fixe donc, UNE
// SEULE FOIS :
//
//   - un énoncé en prose, par période P1..P4 du scénario de démonstration
//     (F-RESERVATION, acceptance/reference/F-RESERVATION.json), qui ne porte
//     QUE les règles actives À CETTE période — jamais une règle d'une période
//     suivante (A1) ;
//   - pour chaque période, le VOCABULAIRE des valeurs de réponse que le
//     modèle attendu peut produire à cette période (statuts de réservation,
//     codes de refus de `@bench/oracle`, T07) — chaque valeur figure,
//     littéralement, dans l'énoncé de la MÊME période (A2) ;
//   - les PARAMÈTRES du modèle attendu — début du créneau (toutes périodes),
//     préavis d'annulation et frontière incluse/exclue (P3) — repris de
//     `RESERVATION_SETUP` (`@bench/scenario`, T11), jamais recopiés à la main
//     (A3) ;
//   - AUCUN verdict de contrôle, AUCUN champ `satisfied` (ADR-011 L107,
//     littéral), AUCUNE valeur attendue calculée pour la période (A4) : cet
//     énoncé ne décrit que les RÈGLES, jamais le JUGEMENT porté sur une
//     exécution.
//
// CE QUI REND A5 VRAI PAR CONSTRUCTION. `CANDIDATE_REQUIREMENTS_STATEMENT_V2`
// porte À LA FOIS le marqueur `bench.candidate/2` (repris de
// `./candidate-protocol-v2.ts`, jamais une copie locale) ET les quatre
// énoncés de période : une seule description exportée, jamais deux objets qui
// pourraient diverger (exactement la discipline que `./candidate-protocol-
// v2.ts` fixe déjà pour le contrat lui-même).
//
// D'OÙ VIENNENT LES LITTÉRAUX. Le créneau (`S1`, début `2030-01-03T12:00:00Z`,
// capacité), le préavis d'annulation (24 heures) et la frontière incluse
// viennent de `RESERVATION_SETUP` (`@bench/scenario`, T11, lui-même transcrit
// du cahier §F L119). La frontière elle-même (`2030-01-02T12:00:00Z`) est
// CALCULÉE à partir de ces deux valeurs (début moins préavis), jamais
// recopiée. Les statuts de réservation (`confirmed`, `waiting`, `cancelled`)
// et les codes de refus (`CONFLICT`, `CANCELLATION_TOO_LATE`,
// `NO_ACTIVE_RESERVATION`, `NOT_FOUND`) sont ceux de `@bench/oracle`
// (`packages/oracle/src/contract.ts#RESERVATION_STATUSES`,
// `packages/oracle/src/errors.ts#RESERVATION_REJECTION_KINDS`) : `@bench/
// activities` ne dépend pas de `@bench/oracle` au manifeste, donc ces six
// chaînes sont reprises ICI comme littéraux, avec leur provenance exacte en
// commentaire plutôt qu'ajouter une dépendance de paquet pour six constantes
// déjà figées par §F.
// ─────────────────────────────────────────────────────────────────────────────
import { RESERVATION_SETUP } from '@bench/scenario'

import { CANDIDATE_OPERATIONS_V2, CANDIDATE_PROTOCOL_MARKER_V2 } from './candidate-protocol-v2.js'

/* ═══════════════════════ littéraux repris de RESERVATION_SETUP (T11) ═════ */

const SLOT = RESERVATION_SETUP.slots[0]
if (SLOT === undefined) {
  throw new Error('candidate-requirements-statement : RESERVATION_SETUP.slots est vide')
}
const SLOT_ID = SLOT.id // cahier:L119, via @bench/scenario — 'S1'
const SLOT_START = SLOT.start // cahier:L119, via @bench/scenario — '2030-01-03T12:00:00Z'
const SLOT_CAPACITY = SLOT.capacity // cahier:L119, via @bench/scenario — 1
const NOTICE_HOURS = RESERVATION_SETUP.cancellation_notice_hours // cahier:L119 — 24
const BOUNDARY_INCLUSIVE = RESERVATION_SETUP.cancellation_boundary_inclusive // cahier:L119 — true

/** Frontière d'annulation (début moins préavis), CALCULÉE — jamais recopiée. */
function cancellationBoundary(startIso: string, noticeHours: number): string {
  const ms = Date.parse(startIso) - noticeHours * 3_600_000
  return new Date(ms).toISOString().replace(/\.000Z$/, 'Z')
}
const CANCELLATION_BOUNDARY = cancellationBoundary(SLOT_START, NOTICE_HOURS)

/* ═══════════════ statuts et codes de refus (packages/oracle, repris) ═════
 * packages/oracle/src/contract.ts#RESERVATION_STATUSES et
 * packages/oracle/src/errors.ts#RESERVATION_REJECTION_KINDS — voir l'en-tête.
 */
const STATUS_CONFIRMED = 'confirmed'
const STATUS_WAITING = 'waiting'
const STATUS_CANCELLED = 'cancelled'
const REJECTION_CONFLICT = 'CONFLICT'
const REJECTION_CANCELLATION_TOO_LATE = 'CANCELLATION_TOO_LATE'
const REJECTION_NO_ACTIVE_RESERVATION = 'NO_ACTIVE_RESERVATION'
const REJECTION_NOT_FOUND = 'NOT_FOUND'

/* ═══════════════════ ADR-013 : un seul vocabulaire (T56) ═════════════════
 * « Ce que le troisième essai réel a montré » : l'énoncé (T53) ne doit citer
 * AUCUN autre nom de champ que ceux du contrat `bench.candidate/2`
 * (`./candidate-protocol-v2.ts`) — jamais `statut` ni `idempotency_key`
 * (vocabulaire interdit par l'incident réel). Les DEUX noms canoniques que
 * cet incident oppose à ces noms bannis (`decision`, `operation_key`) sont
 * donc cités, littéralement, dans l'énoncé de CHAQUE période — même phrase,
 * reprise à l'identique, jamais reformulée différemment d'une période à
 * l'autre. */
const CANONICAL_FIELD_NAMES_SENTENCE = `Une réservation devient ${STATUS_CONFIRMED} dès qu'une place se libère au créneau ; cette décision est portée par le champ \`decision\` de la réponse, par exemple \`{"decision":"${STATUS_CONFIRMED}"}\` ; la clé d'idempotence de chaque écriture s'appelle \`operation_key\`.`

/* ═══════════════════════════════ les quatre énoncés de période ═══════════ */

export interface CandidatePeriodRequirementsStatement {
  /** L'énoncé en langue naturelle des règles actives à cette période (A1). */
  readonly statement: string
  /** Identique à `statement` ici : c'est ce texte, et rien d'autre, qui entre
   *  dans le prompt de la période (ADR-011 L105 : « inclus dans le prompt »). */
  readonly prompt: string
  /** Chaque valeur de réponse que le modèle attendu peut produire à cette
   *  période (A2) — chacune figure littéralement dans `statement`. */
  readonly vocabulary: readonly string[]
  /** Paramètres propres à la règle d'annulation (P3 seulement, A3). */
  readonly cancellationNoticeHours?: number
  readonly boundaryInclusive?: boolean
}

const P1: CandidatePeriodRequirementsStatement = {
  statement: [
    `Période P1 — règles actives du scénario F-RESERVATION.`,
    `Le créneau ${SLOT_ID} (début ${SLOT_START}) a une capacité de ${String(SLOT_CAPACITY)} réservation(s) confirmée(s) simultanément.`,
    `Chaque réservation porte une décision dont la valeur figure parmi ${STATUS_CONFIRMED} ou ${STATUS_CANCELLED}.`,
    `Rejouer la même clé d'opération, nommée \`operation_key\`, avec les mêmes arguments renvoie le résultat déjà obtenu, sans créer de doublon ; la rejouer avec des arguments différents renvoie ${REJECTION_CONFLICT}.`,
    `Aucune file d'attente ${STATUS_CONFIRMED}/attente/${STATUS_CANCELLED} n'est encore active à cette période (pas plus qu'une règle d'annulation ou qu'une isolation entre locataires).`,
    CANONICAL_FIELD_NAMES_SENTENCE,
  ].join(' '),
  get prompt() {
    return this.statement
  },
  vocabulary: [STATUS_CONFIRMED, STATUS_CANCELLED, REJECTION_CONFLICT],
}

const P2: CandidatePeriodRequirementsStatement = {
  statement: [
    `Période P2 — règles actives du scénario F-RESERVATION.`,
    `En plus des règles de P1 (créneau ${SLOT_ID}, début ${SLOT_START}), une file d'attente ${STATUS_CONFIRMED}/${STATUS_WAITING}/${STATUS_CANCELLED} ordonnée par séquence d'admission explicite (jamais par l'horodatage) s'applique désormais.`,
    `Au-delà de la capacité du créneau, toute réservation supplémentaire reçoit la décision ${STATUS_WAITING} ; la première entrée de la file devient ${STATUS_CONFIRMED} dès qu'une place se libère ; une réservation annulée porte la décision ${STATUS_CANCELLED}.`,
    `Rejouer une clé d'opération (\`operation_key\`) reste sans effet de doublon (${REJECTION_CONFLICT} si les arguments diffèrent).`,
    `Aucune règle d'annulation ni aucune isolation entre locataires ne sont encore énoncées à cette période.`,
    CANONICAL_FIELD_NAMES_SENTENCE,
  ].join(' '),
  get prompt() {
    return this.statement
  },
  vocabulary: [STATUS_CONFIRMED, STATUS_WAITING, STATUS_CANCELLED, REJECTION_CONFLICT],
}

const P3: CandidatePeriodRequirementsStatement = {
  statement: [
    `Période P3 — règles actives du scénario F-RESERVATION.`,
    `En plus des règles de P1 et P2 (créneau ${SLOT_ID}, début ${SLOT_START} ; file d'attente ${STATUS_CONFIRMED}/${STATUS_WAITING}/${STATUS_CANCELLED}), une annulation n'est acceptée que si elle intervient au moins ${String(NOTICE_HOURS)} heures avant le début du créneau, frontière incluse : un acteur peut encore annuler exactement à ${CANCELLATION_BOUNDARY}.`,
    `Une annulation trop tardive renvoie ${REJECTION_CANCELLATION_TOO_LATE} ; annuler une réservation qui n'a plus d'effet actif renvoie ${REJECTION_NO_ACTIVE_RESERVATION}.`,
    `Aucune isolation entre locataires n'est encore énoncée à cette période.`,
    CANONICAL_FIELD_NAMES_SENTENCE,
  ].join(' '),
  get prompt() {
    return this.statement
  },
  vocabulary: [STATUS_CONFIRMED, STATUS_WAITING, STATUS_CANCELLED, REJECTION_CANCELLATION_TOO_LATE, REJECTION_NO_ACTIVE_RESERVATION],
  cancellationNoticeHours: NOTICE_HOURS,
  boundaryInclusive: BOUNDARY_INCLUSIVE,
}

const P4: CandidatePeriodRequirementsStatement = {
  statement: [
    `Période P4 — règles actives du scénario F-RESERVATION.`,
    `En plus des règles de P1, P2 et P3 (créneau ${SLOT_ID}, début ${SLOT_START} ; file d'attente ${STATUS_CONFIRMED}/${STATUS_WAITING}/${STATUS_CANCELLED} ; annulation acceptée à partir de ${String(NOTICE_HOURS)} heures avant le début, frontière incluse à ${CANCELLATION_BOUNDARY}, sinon ${REJECTION_CANCELLATION_TOO_LATE}), les locataires sont désormais isolés.`,
    `Un acteur d'un autre locataire ne peut ni lire ni modifier les réservations de ce locataire, et toute tentative renvoie le verdict ${REJECTION_NOT_FOUND}, sans aucune donnée métier divulguée.`,
    CANONICAL_FIELD_NAMES_SENTENCE,
  ].join(' '),
  get prompt() {
    return this.statement
  },
  vocabulary: [STATUS_CONFIRMED, STATUS_WAITING, STATUS_CANCELLED, REJECTION_CANCELLATION_TOO_LATE, REJECTION_NOT_FOUND],
}

/* ═══════════════════ la description UNIQUE, EXPORTÉE (A5) ════════════════ */

export interface CandidateRequirementsStatementV2 {
  /** Témoin DIRECT du contrat `bench.candidate/2` (repris de
   *  `./candidate-protocol-v2.ts`, jamais une copie locale — A5). */
  readonly protocol: typeof CANDIDATE_PROTOCOL_MARKER_V2
  readonly operations: typeof CANDIDATE_OPERATIONS_V2
  readonly periods: {
    readonly P1: CandidatePeriodRequirementsStatement
    readonly P2: CandidatePeriodRequirementsStatement
    readonly P3: CandidatePeriodRequirementsStatement
    readonly P4: CandidatePeriodRequirementsStatement
  }
}

/**
 * LA description unique et exportée de l'énoncé des exigences par période
 * (T53, ADR-011 L105) — porte, dans le MÊME objet, le témoin du contrat
 * `bench.candidate/2` et les quatre énoncés de période, pour que l'énoncé et
 * le vocabulaire du modèle attendu ne puissent jamais diverger du contrat
 * (A5).
 */
export const CANDIDATE_REQUIREMENTS_STATEMENT_V2: CandidateRequirementsStatementV2 = {
  protocol: CANDIDATE_PROTOCOL_MARKER_V2,
  operations: CANDIDATE_OPERATIONS_V2,
  periods: { P1, P2, P3, P4 },
}

/** Les quatre clés de période, dans l'ordre (utile aux appelants). */
export const CANDIDATE_REQUIREMENTS_PERIOD_KEYS = ['P1', 'P2', 'P3', 'P4'] as const
export type CandidateRequirementsPeriodKey = (typeof CANDIDATE_REQUIREMENTS_PERIOD_KEYS)[number]

function normalizedPeriodKey(raw: string): CandidateRequirementsPeriodKey | null {
  const upper = raw.trim().toUpperCase()
  return (CANDIDATE_REQUIREMENTS_PERIOD_KEYS as readonly string[]).includes(upper)
    ? (upper as CandidateRequirementsPeriodKey)
    : null
}

/** Résout une période à partir d'une clé (`P1`..`p4`), d'un index (1-based
 *  préféré) ou d'un objet `{ period | periodKey }` — tolère les quelques
 *  formes qu'un appelant pourrait employer, sans en imposer une seule. */
function resolvePeriodKey(arg: unknown): CandidateRequirementsPeriodKey | null {
  if (typeof arg === 'string') return normalizedPeriodKey(arg)
  if (typeof arg === 'number' && Number.isInteger(arg) && arg >= 1 && arg <= CANDIDATE_REQUIREMENTS_PERIOD_KEYS.length) {
    return CANDIDATE_REQUIREMENTS_PERIOD_KEYS[arg - 1] as CandidateRequirementsPeriodKey
  }
  if (arg !== null && typeof arg === 'object') {
    const obj = arg as { readonly period?: unknown; readonly periodKey?: unknown }
    if (typeof obj.period === 'string') return normalizedPeriodKey(obj.period)
    if (typeof obj.periodKey === 'string') return normalizedPeriodKey(obj.periodKey)
  }
  return null
}

/**
 * Le prompt d'une période du scénario de démonstration (ADR-011 L105) :
 * l'énoncé en langue naturelle des règles actives à cette période, tel que
 * déclaré par `CANDIDATE_REQUIREMENTS_STATEMENT_V2` — jamais une
 * reconstruction séparée.
 */
export function buildCandidatePeriodPrompt(period: unknown): string {
  const key = resolvePeriodKey(period)
  if (key === null) {
    throw new Error(
      `buildCandidatePeriodPrompt : période non reconnue (${JSON.stringify(period)}) — attendu l'une de ${CANDIDATE_REQUIREMENTS_PERIOD_KEYS.join(', ')}`,
    )
  }
  return CANDIDATE_REQUIREMENTS_STATEMENT_V2.periods[key].prompt
}
