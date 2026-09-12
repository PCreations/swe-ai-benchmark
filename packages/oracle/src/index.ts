// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — oracle métier indépendant de réservation (cahier L211-L218,
// tâche T07).
//
// TROIS RÔLES, ET RIEN D'AUTRE DE PUBLIC :
//
//   createReservationOracle(setup)   -> état initial                    (L213)
//   applyOperation(état, opération)  -> état suivant, ou refus métier    (L213)
//   projectBusinessState(état, vue)  -> projection métier canonique      (L213)
//
// CE QUE CE PAQUET S'INTERDIT, ET COMMENT C'EST RENDU MÉCANIQUE. « Sans SQL ni
// HTTP » (L213) ; « l'oracle ne réutilise ni les handlers, ni les requêtes SQL,
// ni les validateurs métier des applications témoins » (L217).
// `packages/oracle/tsconfig.json` fixe `types: []` : aucun module Node n'est
// typé ici, si bien qu'un `node:fs` ou un `node:http` glissé dans un import
// fait échouer `tsc` avant tout test. La seule dépendance déclarée est
// `@bench/contracts` — empreinte canonique du §E et erreurs de forme, aucune
// règle métier. Les applications témoins n'existent qu'en T09 ; ce paquet n'a
// donc rien à leur emprunter, et ce fichier est l'endroit où le constater au
// diff.
//
// CE QUI N'EST PAS ENCORE LÀ. Le « catalogue de résultats attendus » de L213
// est un livrable dont aucun des sept cas requis ne fixe la forme ; il est servi
// ici par la projection canonique elle-même, qui est ce que les cas comparent.
// L211 prévient qu'« une erreur commune peut subsister » : ce paquet ne prétend
// pas couvrir §F au-delà des transitions que §F décrit — réserver, annuler,
// promouvoir, et le contrat intertenant.
// ─────────────────────────────────────────────────────────────────────────────

export {
  RESERVATION_OPERATION_KINDS,
  RESERVATION_STATUSES,
  validateOperation,
  validateSetup,
  validateView,
} from './contract.js'
export type {
  ReservationOperation,
  ReservationOperationKind,
  ReservationOracleSetup,
  ReservationSlot,
  ReservationStatus,
  ReservationView,
} from './contract.js'

export {
  RESERVATION_REJECTION_KINDS,
  ReservationRejection,
  isReservationRejection,
} from './errors.js'
export type { ReservationRejectionKind } from './errors.js'

export {
  applyOperation,
  cancellationBoundary,
  createReservationOracle,
  isCancellationAllowed,
} from './machine.js'
export type { AppliedEffect, ReservationOracleState, ReservationRecord } from './machine.js'

export { projectBusinessState } from './projection.js'
export type { BusinessProjection, ProjectedSlot } from './projection.js'
