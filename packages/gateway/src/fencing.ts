// ─────────────────────────────────────────────────────────────────────────────
// @bench/gateway — ADDITIFS DE FENCING (cahier L371-L378, tâche T25).
//
// ÉTAGE ROUGE. Ce fichier ajoute DEUX rôles fixés par la section III de
// l'en-tête d'`acceptance/T25.spec.ts` : `dispatchModelCallFenced` et
// `stopSession`. Il ne touche ni ne réouvre `dispatchModelCall`,
// `getModelCall` ni `reconcileModelCall` (déjà fixés par
// `acceptance/T17.spec.ts`, `./index.ts`) — ce fichier est SÉPARÉ pour que le
// diff de ce commit le montre : aucun contrat T17 n'est modifié par T25.
//
// SQUELETTE : les deux exports lèvent `NotImplemented`, ce qui fait échouer
// `T25.A1`/`T25.A3`/`T25.A4` pour la raison attendue à cet étage.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** `fencing` reçu par `dispatchModelCallFenced` (section III.6). */
export interface DispatchFencing {
  readonly leaseHandle: unknown
  readonly resourceId: string
  readonly token: number
  readonly now: number
}

/** Un appel « déjà parti » (DISPATCH_STARTED écrit, trace durable existante). */
export interface PendingOrDispatchedCallRef {
  readonly model_call_id: string
}

/** Entrée de `stopSession` (section III.7). */
export interface StopSessionRequest {
  readonly pendingCalls: readonly PendingOrDispatchedCallRef[]
  readonly dispatchedModelCallIds: readonly string[]
}

/** Ce que rend `stopSession` : les deux ensembles d'identifiants, distincts
 * (cahier L373, L375 — « deux appels partis », « trois en attente »). */
export interface StopSessionResult {
  readonly cancelled: readonly string[]
  readonly tracked: readonly string[]
}

/**
 * Variante fencée de `dispatchModelCall` (section III.6) : n'admet `params`
 * qu'après contrôle du jeton de bail. SQUELETTE : lève `NotImplemented`, SANS
 * jamais contacter `params.provider` ni importer `dispatchModelCall` — la
 * délégation réelle au dispatch de T17 est un geste de l'étage VERT, pas de
 * celui-ci.
 */
export async function dispatchModelCallFenced(
  handle: unknown,
  params: unknown,
  fencing: DispatchFencing,
  hooks?: unknown,
): Promise<unknown> {
  void handle
  void params
  void fencing
  void hooks
  throw new NotImplemented('gateway.dispatchModelCallFenced')
}

/**
 * Arrêt de session (section III.7, cahier L373 : « arrêt de session »).
 * SQUELETTE : lève `NotImplemented`.
 */
export async function stopSession(
  handle: unknown,
  request: StopSessionRequest,
): Promise<StopSessionResult> {
  void handle
  void request
  throw new NotImplemented('gateway.stopSession')
}
