// ─────────────────────────────────────────────────────────────────────────────
// L'APPLICATION CANDIDATE SCRIPTÉE, et le MODÈLE indépendant qui la juge.
//
// DEUX OBJETS, DEUX RÔLES, ET C'EST LA SÉPARATION QUI COMPTE :
//
//   `createScriptedApplication`  ce que le candidat a « déployé » à ce jalon :
//                                un service de réservation EN MÉMOIRE
//                                (`--storage memory`, L247). C'est lui que le
//                                monde interroge, et c'est lui que la variante
//                                `cross-tenant-read` rend fautif.
//   `createReferenceModel`       l'oracle métier de T07 (`@bench/oracle`),
//                                conduit par les MÊMES écritures scriptées. Il
//                                dit ce qui DEVRAIT être observé ; il n'est
//                                jamais interrogé par le monde.
//
// Les contrôles métier de `demo-controls.ts` comparent l'un à l'autre. Sans
// cette séparation, un contrôle ne pourrait que se comparer à lui-même — et
// c'est exactement le biais que T10 (L237-L244) existe pour interdire.
//
// CE QUE CE JALON NE PROUVE PAS, ET QUI EST ÉCRIT DANS LE RÉSULTAT. L253 : ce
// jalon « ne valide ni persistence réelle ni isolation ». L'application scriptée
// partage ici la machine à transitions de l'oracle : ce qui est observable, ce
// sont les ÉCARTS QUE LE SCRIPT INTRODUIT (le défaut de la variante, l'absence
// de déploiement de `F-FAILURE`), pas l'indépendance de deux implémentations.
// La limite est publiée dans le résultat plutôt que tue ici.
//
// AUCUN MOCK NE REMPLACE UN SERVICE RÉEL. T11 ne déclare aucun prérequis de
// service (`verification/tasks.json`, `requires: ["node22"]`) : il n'y a donc
// aucun PostgreSQL, aucun S3, aucun Temporal à substituer. L'application est en
// mémoire parce que L247 le demande, pas pour contourner une absence.
// ─────────────────────────────────────────────────────────────────────────────
import { canonicalDigest } from '@bench/contracts'
import type { CanonicalValue } from '@bench/contracts'
import {
  applyOperation,
  createReservationOracle,
  isCancellationAllowed,
  isReservationRejection,
  projectBusinessState,
} from '@bench/oracle'
import type {
  ReservationOracleState,
  ReservationRecord,
  ReservationView,
} from '@bench/oracle'

import { DEPLOYED_BY_VARIANT, RESERVATION_SETUP, SLOT_ID, TENANT_ORIGIN } from './demo-script.js'
import type { DemoVariant, ScriptedWrite } from './demo-script.js'

/** Le code par lequel une application non déployée décline tout. */
export const NO_DEPLOYMENT_CODE = 'NO_DEPLOYMENT'

/** Ce que l'application répond à une écriture. */
export interface WriteObservation {
  readonly ok: boolean
  readonly code: string | null
  readonly external_id: string | null
}

/** Ce que l'application répond à une lecture. */
export interface ReadObservation {
  readonly ok: boolean
  readonly code: string | null
  readonly records: readonly ReservationRecord[]
}

/** Le verdict d'une probe d'annulation jouée sur un clone jetable (L123). */
export interface ProbeObservation {
  readonly accepted: boolean
  readonly code: string | null
}

export interface ScriptedApplication {
  readonly deployed: boolean
  /**
   * Enregistre un locataire créé par un événement révélé (L119 : « création d'un
   * locataire `other` » en P4). Avant sa création, ce locataire n'existe pour
   * personne — et c'est ce qui fait que `isolation@1` est satisfaite en P3 puis
   * violée en P4 sous la variante fautive (F-REGRESSION, L129).
   */
  createTenant(tenant: string): void
  /** Empreinte canonique de l'état courant — sert à prouver qu'une probe n'a rien changé. */
  digest(): string
  submit(write: ScriptedWrite): WriteObservation
  read(view: ReservationView): ReadObservation
  /** Annulation jouée sur un CLONE jetable : l'état principal n'est pas touché (L123). */
  probeCancellation(actor: string, at: string, key: string): ProbeObservation
}

/** Le modèle indépendant : il ne sert que d'ATTENTE, jamais de réponse au monde. */
export interface ReferenceModel {
  state(): ReservationOracleState
  apply(write: ScriptedWrite): WriteObservation
  expectedRecords(tenant: string): readonly ReservationRecord[]
  /** Le verdict que la règle d'annulation de §F impose à cet instant. */
  expectedCancellation(at: string): boolean
  /** Le code de refus qu'une lecture hors locataire doit recevoir (L123). */
  expectedForeignReadCode(): string
}

/* ─────────────────────────────────────────────────────── outils communs */

const rejectionCode = (e: unknown): string =>
  isReservationRejection(e) ? e.code : 'UNEXPECTED_ERROR'

function applyWrite(
  state: ReservationOracleState,
  write: ScriptedWrite,
): { state: ReservationOracleState; observation: WriteObservation } {
  try {
    const next = applyOperation(state, {
      kind: write.operation,
      tenant: write.tenant,
      actor: write.actor,
      slot: SLOT_ID,
      at: state.clock,
      sequence: write.sequence,
      idempotency_key: write.idempotency_key,
    })
    // L'identifiant externe rendu au monde est celui que l'ÉTAT porte, jamais un
    // symbole fabriqué : c'est ce que T08 appelle « résolution d'identifiants
    // externes » (L221), et un symbole inventé la viderait de son sens.
    const mine = next.reservations.filter((r) => r.actor === write.actor)
    const last = mine.length === 0 ? null : mine[mine.length - 1]
    return {
      state: next,
      observation: { ok: true, code: null, external_id: last === undefined || last === null ? null : last.id },
    }
  } catch (e) {
    return { state, observation: { ok: false, code: rejectionCode(e), external_id: null } }
  }
}

/**
 * L'horloge métier de la période, portée par l'état de l'oracle. Avancer le
 * temps métier est une ÉCRITURE d'état comme une autre : les instants
 * d'opération en dépendent (la frontière d'annulation de §F P3 se juge sur eux).
 */
function withClock(state: ReservationOracleState, clock: string): ReservationOracleState {
  return { ...state, clock }
}

/* ──────────────────────────────────── l'application candidate scriptée */

export function createScriptedApplication(variant: DemoVariant): ScriptedApplication & {
  advanceTo(clock: string): void
} {
  const deployed = DEPLOYED_BY_VARIANT[variant]
  let state = createReservationOracle(RESERVATION_SETUP)
  const knownTenants = new Set<string>([RESERVATION_SETUP.tenant])

  return {
    deployed,

    createTenant(tenant: string): void {
      knownTenants.add(tenant)
    },

    advanceTo(clock: string): void {
      if (!deployed) return
      state = withClock(state, clock)
    },

    digest(): string {
      return canonicalDigest(state as unknown as CanonicalValue)
    },

    submit(write: ScriptedWrite): WriteObservation {
      if (!deployed) return { ok: false, code: NO_DEPLOYMENT_CODE, external_id: null }
      const applied = applyWrite(state, write)
      state = applied.state
      return applied.observation
    },

    read(view: ReservationView): ReadObservation {
      if (!deployed) return { ok: false, code: NO_DEPLOYMENT_CODE, records: [] }
      if (
        variant === 'cross-tenant-read' &&
        view.tenant !== TENANT_ORIGIN &&
        knownTenants.has(view.tenant)
      ) {
        // ── LE DÉFAUT SCRIPTÉ DE CETTE VARIANTE, ET RIEN D'AUTRE.
        // L'application sert l'état métier du locataire d'origine à un
        // locataire qui n'y a aucun droit (L119). Le chemin d'écriture, lui,
        // reste correct : c'est ce qui rend la détection CIBLÉE, et c'est la
        // propriété que T11.M12 interdit de contourner en faisant tout échouer.
        return {
          ok: true,
          code: null,
          records: projectBusinessState(state, { tenant: TENANT_ORIGIN }).reservations,
        }
      }
      try {
        return { ok: true, code: null, records: projectBusinessState(state, view).reservations }
      } catch (e) {
        return { ok: false, code: rejectionCode(e), records: [] }
      }
    },

    probeCancellation(actor: string, at: string, key: string): ProbeObservation {
      if (!deployed) return { accepted: false, code: NO_DEPLOYMENT_CODE }
      // CLONE JETABLE (L123) : `applyOperation` rend un état NEUF ; celui-ci est
      // simplement abandonné, si bien que la probe ne peut pas modifier l'état
      // persistant principal.
      const clone = withClock(state, at)
      const applied = applyWrite(clone, {
        kind: 'write',
        operation: 'cancel',
        actor,
        tenant: TENANT_ORIGIN,
        sequence: 900,
        idempotency_key: key,
      })
      return { accepted: applied.observation.ok, code: applied.observation.code }
    },
  }
}

/* ────────────────────────────────────────────── le modèle indépendant */

export function createReferenceModel(): ReferenceModel & { advanceTo(clock: string): void } {
  let state = createReservationOracle(RESERVATION_SETUP)

  return {
    advanceTo(clock: string): void {
      state = withClock(state, clock)
    },

    state(): ReservationOracleState {
      return state
    },

    apply(write: ScriptedWrite): WriteObservation {
      const applied = applyWrite(state, write)
      state = applied.state
      return applied.observation
    },

    expectedRecords(tenant: string): readonly ReservationRecord[] {
      try {
        return projectBusinessState(state, { tenant }).reservations
      } catch {
        return []
      }
    },

    expectedCancellation(at: string): boolean {
      const slot = state.slots.find((s) => s.id === SLOT_ID)
      if (slot === undefined) return false
      return isCancellationAllowed(
        at,
        slot.start,
        state.cancellation_notice_hours,
        state.cancellation_boundary_inclusive,
      )
    },

    expectedForeignReadCode(): string {
      try {
        projectBusinessState(state, { tenant: `${state.tenant}-inexistant` })
      } catch (e) {
        return rejectionCode(e)
      }
      // Inatteignable : la projection REFUSE toute vue hors locataire (L123).
      // Fail-closed plutôt que muet.
      return 'ORACLE_DID_NOT_REFUSE'
    },
  }
}
