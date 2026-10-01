// ─────────────────────────────────────────────────────────────────────────────
// @bench/evaluation — incidents et backlog (cahier L345-L352, tâche T22).
//
// SQUELETTE (étage ROUGE). Aucune règle métier n'est écrite ici : ni
// déduplication par signature, ni classification d'origine, ni politique de
// violation critique, ni comparateur de tri. Les quatre rôles ci-dessous sont
// NOMMÉS par la section III de l'en-tête de `acceptance/T22.spec.ts` — le
// cahier ne fixe aucun nom d'export pour T22, exactement comme pour
// `admitDelivery` (T21) ou `EvaluationResult` (T20) — et `verification/
// mutants/T22.json` les cible par ce même nom primaire.
//
//   ingestObservations(input)             déduplication par signature,
//                                         compteur d'occurrences, ticket de
//                                         révélation à la période N+1, sans
//                                         jamais recopier la solution cachée
//                                         (A1, A2, A3).
//   classifyDefectOrigin(input)           distingue une panne extérieure
//                                         prévue d'un défaut du candidat (A4).
//   applyCriticalViolationPolicy(input)   politique figée sur violation
//                                         critique : mise hors service,
//                                         dégradation du service mesuré (A5).
//   sortBacklog(items)                    tri priorité, échéance puis
//                                         identifiant, indépendant de l'ordre
//                                         d'entrée (A6).
//
// Chacun lève `NotImplemented` (@bench/contracts) : un refus de SQUELETTE,
// jamais un verdict (packages/contracts/src/not-implemented.ts). Ce fichier ne
// redéclare aucun rôle déjà publié par ce paquet (T10, T20) : aucun autre
// fichier de `packages/evaluation` n'est touché par ce commit.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/* ══════════════════════ formes du contrat (section III de la suite) ═══════ */

/** Une observation entrante, section III.1 de `acceptance/T22.spec.ts`. */
export interface IncidentObservation {
  readonly signature: string
  readonly origin: string
  readonly hidden_test_expectation?: {
    readonly root_cause: string
    readonly expected_fix: string
  }
}

/** Entrée de `ingestObservations`, section III.1. */
export interface IngestObservationsInput {
  readonly period_index: number
  readonly prior_incidents: readonly Incident[]
  readonly observations: readonly IncidentObservation[]
}

/** Ticket de révélation d'un incident, section III.1. */
export interface IncidentTicket {
  readonly id: string
  readonly revealed_at_period: number
}

/** Un incident, élément de `prior_incidents` ET de `IngestResult.incidents`. */
export interface Incident {
  readonly id: string
  readonly signature: string
  readonly occurrences: number
  readonly ticket: IncidentTicket
}

/** Sortie de `ingestObservations`, section III.1. */
export interface IngestResult {
  readonly incidents: readonly Incident[]
}

/** Entrée de `classifyDefectOrigin`, section III.2. */
export interface ClassifyDefectOriginInput {
  readonly unavailable: boolean
  readonly external_outage_window: boolean
}

/** Entrée de `applyCriticalViolationPolicy`, section III.3. */
export interface ApplyCriticalViolationPolicyInput {
  readonly critical_violation: boolean
  readonly measured_service_before: number
}

/** Sortie de `applyCriticalViolationPolicy`, section III.3. */
export interface PolicyResult {
  readonly service_suspended: boolean
  readonly measured_service_after: number
}

/** Un élément du backlog à trier, section III.4. */
export interface BacklogItem {
  readonly id: string
  readonly priority: number
  readonly due_date: string
}

/* ══════════════════════════════════ rôles ══════════════════════════════════ */

/** Déduplication par signature, comptage, ticket de révélation (A1, A2, A3). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function ingestObservations(_input: IngestObservationsInput): Promise<IngestResult> {
  throw new NotImplemented('evaluation.ingestObservations')
}

/** Classification de l'origine d'un défaut observé (A4). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function classifyDefectOrigin(_input: ClassifyDefectOriginInput): Promise<string> {
  throw new NotImplemented('evaluation.classifyDefectOrigin')
}

/** Politique figée sur violation critique (A5). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function applyCriticalViolationPolicy(
  _input: ApplyCriticalViolationPolicyInput,
): Promise<PolicyResult> {
  throw new NotImplemented('evaluation.applyCriticalViolationPolicy')
}

/** Tri du backlog par priorité, échéance puis identifiant (A6). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function sortBacklog(_items: readonly BacklogItem[]): Promise<BacklogItem[]> {
  throw new NotImplemented('evaluation.sortBacklog')
}
