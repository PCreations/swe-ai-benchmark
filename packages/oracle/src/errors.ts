// ─────────────────────────────────────────────────────────────────────────────
// Refus de `@bench/oracle` (T07).
//
// POURQUOI UN REFUS LEVÉ, ET NON RENDU. Même raison qu'en T03 et T06 : un refus
// rendu comme valeur se laisse ignorer, et §D-12 exige qu'un `PASS` repose sur
// des assertions réellement exécutées. Lever rend IMPOSSIBLE de « refuser puis
// joindre quand même l'effet » — une annulation tardive ne peut pas se glisser
// dans l'état par la porte de derrière d'un champ `state` accolé au refus.
//
// UN REFUS MÉTIER N'EST PAS UNE ERREUR TECHNIQUE. §A : « les erreurs techniques
// et résultats métier sont des champs distincts ». `ContractViolation` de
// `@bench/contracts` couvre la forme des messages du §E ; ce type-ci couvre le
// verdict de la machine à états — trop tard pour annuler, clé d'opération
// rejouée avec d'autres arguments, locataire étranger. Il porte donc un `code`
// explicite, jamais un simple message : §G refuse qu'une preuve repose sur du
// texte libre plutôt que sur une observation.
//
// CE QU'UN REFUS NE PORTE JAMAIS. Aucune donnée métier du locataire protégé.
// L123 écrit `NOT_FOUND` « sans donnée métier divulguée » : un refus qui citait
// l'identifiant de la réservation qu'il protège divulguerait précisément ce
// qu'il prétend cacher. Le refus nomme le CODE et le CHEMIN de l'argument
// fautif — rien de l'état.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Natures de refus que T07 sait produire.
 *
 * Les six premières transcrivent les règles de forme du §E (L80 : « les JSON de
 * domaine sont stricts : propriétés inconnues rejetées, enums explicites,
 * timestamps UTC ISO 8601 »). Les suivantes sont les verdicts de la machine à
 * états, et chacune se rattache à une ligne du cahier :
 *
 *   NOT_FOUND        L123 — contrat intertenant : « les acteurs de `other` ne
 *                    peuvent ni lire ni modifier les réservations `legacy` »,
 *                    et le verdict est `NOT_FOUND` sans donnée divulguée.
 *   CONFLICT         L215 cas A6 — « répétition d'une opération avec même clé
 *                    et arguments différents donne un conflit explicite ».
 *                    C'est l'autre moitié de l'invariant D-6 (L68) : les effets
 *                    valides sont dédupliqués par clé d'opération ET empreinte
 *                    d'entrée ; clé égale et empreinte différente n'est pas une
 *                    déduplication, c'est une collision.
 *   CANCELLATION_TOO_LATE  L119 — « annulation permise au moins 24 heures avant
 *                    le début, frontière incluse », et le cas A4 exige le refus
 *                    1 ms après.
 *   NO_ACTIVE_RESERVATION  L119 cas A7 — il n'y a rien à annuler une seconde
 *                    fois ; le refus est ce qui empêche une seconde promotion.
 *   ALREADY_RESERVED L68 — un même acteur ne détient pas deux effets valides
 *                    sur le même créneau sous deux clés différentes.
 *   SLOT_UNKNOWN     forme du journal : un créneau non déclaré au `setup`.
 */
export const RESERVATION_REJECTION_KINDS = [
  // ── forme (L80)
  'UNKNOWN_PROPERTY',
  'MISSING_PROPERTY',
  'TYPE_MISMATCH',
  'ENUM_VALUE_UNKNOWN',
  'TIMESTAMP_NOT_UTC_ISO8601',
  'NON_FINITE_NUMBER',
  'EMPTY_STRING',
  'STATE_MALFORMED',
  // ── verdicts de la machine à états
  'NOT_FOUND',
  'CONFLICT',
  'CANCELLATION_TOO_LATE',
  'NO_ACTIVE_RESERVATION',
  'ALREADY_RESERVED',
  'SLOT_UNKNOWN',
] as const

export type ReservationRejectionKind = (typeof RESERVATION_REJECTION_KINDS)[number]

/**
 * Refus de l'oracle de réservation. `code` et `path` sont les deux champs
 * observables ; `detail` est une glose destinée au lecteur d'un rapport, et
 * aucune décision ne doit en dépendre.
 *
 * `name` vaut `ReservationRejection` et non `Error` : un lecteur de rapport —
 * humain ou machine — doit pouvoir distinguer d'un coup d'œil ce refus métier
 * d'un `TypeError`, qui serait un plantage et non un verdict.
 */
export class ReservationRejection extends Error {
  readonly code: ReservationRejectionKind
  readonly path: string
  readonly detail: string

  constructor(code: ReservationRejectionKind, path: string, detail: string) {
    super(`${code} @ ${path} : ${detail}`)
    this.name = 'ReservationRejection'
    this.code = code
    this.path = path
    this.detail = detail
  }
}

export function isReservationRejection(e: unknown): e is ReservationRejection {
  return e instanceof ReservationRejection
}

/** Chemin d'un enfant. La racine est `''`, si bien qu'un champ racine est `/tenant`. */
export const childPath = (base: string, segment: string | number): string =>
  `${base}/${String(segment)}`
