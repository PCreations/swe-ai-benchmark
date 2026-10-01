// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — LA FILE D'ADMISSION (cahier L379-L386, tâche T26).
//
// ÉTAGE ROUGE. Les huit rôles ci-dessous sont le contrat FIXÉ par la section
// III de l'en-tête d'`acceptance/T26.spec.ts` (ADR-001 : l'auteure de cette
// suite est aveugle à ce fichier ; ce squelette ne redéfinit rien du contrat,
// il se contente d'exister sous les noms qu'elle a déjà choisis). Aucune règle
// d'admission n'est écrite ici : chaque export lève `NotImplemented`, ce qui
// fait échouer `T26.A1`..`T26.A3`/`T26.A6` pour la raison attendue —
// `STUB_NOT_IMPLEMENTED`/`ASSERTION_FAILED`, jamais un module introuvable —
// plutôt que de laisser la suite échouer à se charger.
//
// CE FICHIER EST DÉLIBÉRÉMENT SÉPARÉ DE `trajectory-workflow.ts` ET DE
// `lease-authority.ts`, même geste et même raison que T25 : `trajectory-
// workflow.ts` reste le SEUL fichier que le Worker Temporal bundle dans le
// bac à sable (`workflowsPath`), il n'importe que `@temporalio/workflow`,
// jamais `@bench/contracts` ni aucun autre paquet qui dépendrait de `node:*`.
// La régulation d'admission décrite par L383 n'engage elle-même aucun moteur
// Temporal particulier (section V de l'en-tête de la suite) : elle n'a donc
// aucune raison de vivre dans un Workflow replayable.
//
// `packages/workflows` est le PREMIER paquet listé dans `PACKAGES` côté suite
// (acceptance/T26.spec.ts, section III) : c'est pourquoi ces huit noms sont
// posés ici plutôt que dans gateway/activities, qui portent chacun leurs
// propres additifs (recul fournisseur côté gateway, effet admis côté
// activities).
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Options d'ouverture de la file d'admission (section III.1). `cap` plafonne
 * le nombre d'appels simultanément ACTIFS pour un `providerId` donné ; `seed`
 * dérive l'ordre d'affectation de (6). */
export interface OpenAdmissionQueueOptions {
  readonly cap: number
  readonly seed: number
}

/** Poignée opaque rendue par `openAdmissionQueue` ; reçue telle quelle par
 * `packages/gateway` (recul fournisseur) et `packages/activities`
 * (`runAdmittedEffect`) — UN SEUL état d'admission partagé entre les trois
 * paquets (en-tête de la suite, section III : « même geste que le
 * `leaseHandle` de T25 »). */
export interface QueueHandle {
  readonly [key: string]: unknown
}

/** Entrée de `submitReadyCall` (section III.2). */
export interface SubmitReadyCallParams {
  readonly callId: string
  readonly providerId: string
  readonly now: number
}

/** Ticket rendu par `submitReadyCall` : `admitted` se résout dès qu'un slot
 * est libre ET que le fournisseur n'est pas en recul. */
export interface SubmitReadyCallResult {
  readonly callId: string
  readonly admitted: Promise<{ readonly admittedAt: number }>
}

/** Entrée de `releaseCall` (section III.3). */
export interface ReleaseCallParams {
  readonly callId: string
  readonly now: number
}

export interface ReleaseCallResult {
  readonly released: boolean
}

/** Lecture non destructive de l'état courant (section III.4, A1/A2). */
export interface QueueSnapshot {
  readonly active: number
  readonly waiting: number
}

/** Entrée de `pumpAdmission` (section III.5). */
export interface PumpAdmissionParams {
  readonly now: number
}

export interface PumpAdmissionResult {
  readonly admitted: readonly string[]
}

/** Ce que rend `getCallTimings` (section III.7). */
export interface CallTimings {
  readonly queuedAt: number
  readonly admittedAt: number | null
  readonly releasedAt: number | null
  readonly timeInQueue: number | null
  readonly timeActive: number | null
}

/**
 * Ouvre la file d'admission (section III.1). SQUELETTE : aucune règle
 * d'admission n'est provisionnée, l'export lève `NotImplemented`.
 */
export async function openAdmissionQueue(opts: OpenAdmissionQueueOptions): Promise<QueueHandle> {
  void opts
  throw new NotImplemented('workflows.openAdmissionQueue')
}

/**
 * Enregistre un appel comme PRÊT (section III.2, cahier L383). SQUELETTE :
 * lève `NotImplemented`, sans jamais résoudre `admitted`.
 */
export async function submitReadyCall(
  handle: QueueHandle,
  params: SubmitReadyCallParams,
): Promise<SubmitReadyCallResult> {
  void handle
  void params
  throw new NotImplemented('workflows.submitReadyCall')
}

/**
 * Libère le slot tenu par `callId` et réévalue la file (section III.3, cahier
 * L383 A2 : « libérer un slot n'en admet qu'un »). SQUELETTE : lève
 * `NotImplemented`.
 */
export async function releaseCall(
  handle: QueueHandle,
  params: ReleaseCallParams,
): Promise<ReleaseCallResult> {
  void handle
  void params
  throw new NotImplemented('workflows.releaseCall')
}

/**
 * Lecture non destructive de l'état courant (section III.4). SQUELETTE : lève
 * `NotImplemented`.
 */
export async function getQueueSnapshot(handle: QueueHandle): Promise<QueueSnapshot> {
  void handle
  throw new NotImplemented('workflows.getQueueSnapshot')
}

/**
 * Réévalue la file à l'instant `now` sans qu'aucun appel ne vienne d'être
 * soumis ni libéré (section III.5) — le seul moyen d'observer qu'un recul
 * fournisseur expire sans attente fragile au temps réel. SQUELETTE : lève
 * `NotImplemented`.
 */
export async function pumpAdmission(
  handle: QueueHandle,
  params: PumpAdmissionParams,
): Promise<PumpAdmissionResult> {
  void handle
  void params
  throw new NotImplemented('workflows.pumpAdmission')
}

/**
 * Ordre d'affectation ANNONCÉ, PUR et SANS EFFET DE BORD, dérivé de `seed`
 * (section III.6, cahier L381 : « ordre d'affectation seedé »). SQUELETTE :
 * lève `NotImplemented`.
 */
export async function announceAssignmentOrder(
  handle: QueueHandle,
  callIds: readonly string[],
): Promise<string[]> {
  void handle
  void callIds
  throw new NotImplemented('workflows.announceAssignmentOrder')
}

/**
 * Lecture des métriques de file d'un appel (section III.7, cahier L383 A6 :
 * « temps en file et temps actif [...] enregistrés séparément »). SQUELETTE :
 * lève `NotImplemented`.
 */
export async function getCallTimings(handle: QueueHandle, callId: string): Promise<CallTimings> {
  void handle
  void callId
  throw new NotImplemented('workflows.getCallTimings')
}

/**
 * Ferme la file d'admission (section III.8, optionnel comme
 * `closeLeaseAuthority` de T25). SQUELETTE : lève `NotImplemented`.
 */
export async function closeAdmissionQueue(handle: QueueHandle): Promise<void> {
  void handle
  throw new NotImplemented('workflows.closeAdmissionQueue')
}
