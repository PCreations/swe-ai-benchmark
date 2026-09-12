// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — SQUELETTE de l'oracle métier indépendant de réservation
// (cahier L211-L218, tâche T07).
//
// CE FICHIER N'IMPLÉMENTE RIEN, ET C'EST SON RÔLE.
//
// L'étage ROUGE exige que `acceptance/T07.spec.ts` échoue POUR LA RAISON
// ATTENDUE. `verification/runner/red.mjs` n'admet que deux formes de rouge —
// `ASSERTION_FAILED` et `STUB_NOT_IMPLEMENTED` — et refuse explicitement
// `MODULE_NOT_FOUND` et `SUITE_FAILED_TO_RUN` : « c'est la forme par défaut du
// TDD en monorepo TypeScript, elle ne dit rien de ce que le test vérifie ».
//
// Sans ce squelette, la suite tomberait sur son assertion de CONTRAT DE
// NOMMAGE (« CONTRAT-NON-SATISFAIT roles=[…] ») : un rouge qui ne prouve que
// l'absence d'un fichier. Avec lui, les trois rôles se résolvent, la suite
// appelle réellement les trois exports, et chaque cas échoue sur ce qu'il
// OBSERVE — l'état métier projeté.
//
// LES TROIS RÔLES, ET D'OÙ VIENNENT LEURS NOMS. Ils ne sont pas choisis ici :
// `acceptance/T07.spec.ts` §III les nomme, et `verification/mutants/T07.json`
// les reprend. Les signatures sont celles que la suite appelle — état en
// premier pour `applyOperation`, vue en second argument POSITIONNEL pour
// `projectBusinessState`.
//
//   createReservationOracle(setup)   -> état initial                    (L213)
//   applyOperation(état, opération)  -> état suivant, ou refus métier    (L213)
//   projectBusinessState(état, vue)  -> projection métier canonique      (L213)
//
// POURQUOI `NotImplemented` DE `@bench/contracts`, ET PAS UNE ERREUR MAISON.
// Son message porte le préfixe `NOT_IMPLEMENTED`, que le lecteur d'un rapport
// d'échec distingue d'un refus métier. Le squelette ne doit surtout pas se
// faire passer pour la garde qu'il ne contient pas : un stub qui lèverait un
// refus métier verdirait à tort les deux cas `refusal` (A4, A6). Il ne le fait
// pas — chacun porte son VOLET POSITIF, et le journal d'opérations de la suite
// est refusé dès la création de l'oracle.
//
// LE PÉRIMÈTRE QUE CE PAQUET S'INTERDIT. « Sans SQL ni HTTP » (L213), et
// « l'oracle ne réutilise ni les handlers, ni les requêtes SQL, ni les
// validateurs métier des applications témoins » (L217). `tsconfig.json` fixe
// `types: []` : ni `node:fs`, ni `node:http`, ni `node:child_process` ne
// peuvent entrer ici sans faire échouer `tsc`. La seule dépendance déclarée est
// `@bench/contracts`.
//
// Tous les exports ci-dessous lèveront jusqu'à ce que T07 soit écrite.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/** Les deux transitions que §F exerce : réserver, annuler. */
export type ReservationOperationKind = 'reserve' | 'cancel'

/**
 * Configuration initiale de l'oracle. La forme est celle que
 * `acceptance/T07.spec.ts` construit depuis `acceptance/reference/
 * F-RESERVATION.json` — horloge initiale, locataire, acteurs, créneaux, et les
 * deux paramètres de la règle d'annulation de P3 (délai en heures, frontière
 * incluse).
 */
export interface ReservationOracleSetup {
  readonly clock: string
  readonly tenant: string
  readonly actors: readonly string[]
  readonly slots: readonly ReservationSlot[]
  readonly cancellation_notice_hours: number
  readonly cancellation_boundary_inclusive: boolean
}

/** Un créneau : identité, capacité, instant de début (UTC ISO 8601, L80). */
export interface ReservationSlot {
  readonly id: string
  readonly capacity: number
  readonly start: string
}

/**
 * Une opération soumise à l'oracle. Objet PLAT et STRICT (L80 : « propriétés
 * inconnues rejetées »).
 *
 * `sequence` est la « séquence d'admission explicite » de L123 : c'est elle,
 * et jamais `at`, qui ordonne la file — deux admissions peuvent porter le même
 * instant métier. `idempotency_key` est la clé d'opération de l'invariant D-6
 * (L68), dédupliquée par clé ET empreinte d'entrée.
 */
export interface ReservationOperation {
  readonly kind: ReservationOperationKind
  readonly tenant: string
  readonly actor: string
  readonly slot: string
  readonly at: string
  readonly sequence: number
  readonly idempotency_key: string
}

/**
 * La vue sous laquelle une projection est demandée. Le locataire est
 * obligatoire : c'est lui qui porte la propriété testée par A5 (« les acteurs
 * de `other` ne peuvent ni lire ni modifier les réservations `legacy` », L119).
 */
export interface ReservationView {
  readonly tenant: string
  readonly actor?: string
}

/**
 * L'état de l'oracle. Opaque de l'extérieur : §F dit « évaluer l'état métier
 * EXPORTÉ, pas un nom de table imposé ». Seule la projection est observable, et
 * c'est elle que la suite lit.
 */
export interface ReservationOracleState {
  readonly [key: string]: unknown
}

/**
 * La projection métier canonique. Sa forme n'est pas fixée par le cahier ;
 * `acceptance/T07.spec.ts` la lit structurellement (acteur + statut) plutôt que
 * par un chemin imposé. Le squelette ne lui invente donc pas de contrat.
 */
export interface BusinessProjection {
  readonly [key: string]: unknown
}

/**
 * État initial de l'oracle (L213 : « machine à états de réservation »).
 *
 * @throws NotImplemented tant que T07 n'est pas écrite.
 */
export function createReservationOracle(setup: ReservationOracleSetup): ReservationOracleState {
  void setup
  throw new NotImplemented('oracle.createReservationOracle')
}

/**
 * Applique une opération et rend un état NOUVEAU — L123 exige que les probes de
 * frontière soient des clones jetables « qui ne modifient pas l'état persistant
 * principal ». Un refus métier est un rejet, pas un plantage.
 *
 * @throws NotImplemented tant que T07 n'est pas écrite.
 */
export function applyOperation(
  state: ReservationOracleState,
  operation: ReservationOperation,
): ReservationOracleState {
  void state
  void operation
  throw new NotImplemented('oracle.applyOperation')
}

/**
 * Projection métier canonique servie SOUS UNE VUE (L213, L119). Le second
 * argument est positionnel et décisif : l'ignorer sert les réservations d'un
 * locataire à un acteur d'un autre, ce qui est exactement le mutant T07.M5.
 *
 * @throws NotImplemented tant que T07 n'est pas écrite.
 */
export function projectBusinessState(
  state: ReservationOracleState,
  view: ReservationView,
): BusinessProjection {
  void state
  void view
  throw new NotImplemented('oracle.projectBusinessState')
}
