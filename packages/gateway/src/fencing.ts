// ─────────────────────────────────────────────────────────────────────────────
// @bench/gateway — ADDITIFS DE FENCING (cahier L371-L378, tâche T25).
//
// ÉTAGE VERT. Ce fichier ajoute DEUX rôles fixés par la section III de
// l'en-tête d'`acceptance/T25.spec.ts` : `dispatchModelCallFenced` et
// `stopSession`. Il ne touche ni ne réouvre `dispatchModelCall`,
// `getModelCall` ni `reconcileModelCall` (déjà fixés par
// `acceptance/T17.spec.ts`, `./index.ts`) — ce fichier est SÉPARÉ pour que le
// diff de ce commit le montre : aucun contrat T17 n'est modifié par T25.
//
// `dispatchModelCallFenced` DÉLÈGUE, IL NE RÉIMPLÉMENTE PAS. Le contrôle de
// bail (`assertLeaseAdmitted`, `@bench/workflows`) est appliqué AVANT tout —
// avant même de lire `params.provider` — puis la fonction appelle
// `dispatchModelCall` TELLE QUELLE (import depuis `./index.ts` ; le cycle
// index.ts <-> fencing.ts est sans danger ici car `dispatchModelCall` est une
// déclaration de fonction, liée à l'instanciation du module, pas à son
// évaluation). Un jeton périmé ne contacte donc JAMAIS `params.provider` et ne
// crée ni ne mute aucun enregistrement durable (A1, A4) : `assertLeaseAdmitted`
// lève avant la première ligne de `dispatchModelCall`.
//
// `stopSession` ÉCRIT DIRECTEMENT DANS LE JOURNAL DURABLE DE T17
// (`model_calls`, même table, même script `psql` minimal que `./psql.ts`) :
// chaque id de `pendingCalls` (jamais passé par `dispatchModelCall`, donc sans
// trace) reçoit CANCELLED_BEFORE_DISPATCH (L99, enum déjà établie) ; chaque id
// de `dispatchedModelCallIds` n'est PAS touché, son statut durable existant
// reste inchangé (A3, L373).
// ─────────────────────────────────────────────────────────────────────────────

import { ContractViolation } from '@bench/contracts'
import { isCentralStore } from '@bench/storage'
import { assertLeaseAdmitted } from '@bench/workflows'
import { GatewayRefusal } from './errors.js'
import { dispatchModelCall } from './index.js'
import type { DispatchModelCallResult } from './index.js'
import { runScript } from './psql.js'

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

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

/**
 * Variante fencée de `dispatchModelCall` (section III.6) : n'admet `params`
 * qu'après contrôle du jeton de bail, puis délègue EXACTEMENT à
 * `dispatchModelCall`. Un jeton périmé rejette AVANT tout contact du
 * fournisseur et avant toute écriture durable (A1, A4).
 */
export async function dispatchModelCallFenced(
  handle: unknown,
  params: unknown,
  fencing: DispatchFencing,
  hooks?: unknown,
): Promise<DispatchModelCallResult> {
  const f = (fencing ?? {}) as Partial<DispatchFencing>
  const resourceId = requireNonEmptyString(f.resourceId, 'dispatchModelCallFenced.fencing.resourceId')
  if (typeof f.token !== 'number') {
    throw new ContractViolation('TYPE_MISMATCH', 'dispatchModelCallFenced.fencing.token', 'nombre attendu')
  }

  // DÉCISIF (III.6) : le contrôle de bail précède TOUT.
  assertLeaseAdmitted(f.leaseHandle, resourceId, f.token)

  return dispatchModelCall(handle, params, hooks)
}

/* ─────────────────────────────────── arrêt de session (section III.7) ──── */

/** Même copie minimale que `./index.ts` (voir son en-tête) : `packages/
 * storage` n'expose pas son `PsqlSession` interne, et psql est un prérequis
 * déclaré (`postgres18`), pas une bibliothèque à réexporter. */
function dsnOf(handle: unknown): string {
  if (!isCentralStore(handle)) {
    throw new GatewayRefusal(
      'STORAGE_UNAVAILABLE',
      'le premier argument doit être un repository rendu par openStore (@bench/storage)',
    )
  }
  if (handle.closed) {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', 'repository déjà fermé')
  }
  return handle.dsn
}

/** Écrit un enregistrement TERMINAL `CANCELLED_BEFORE_DISPATCH` pour un
 * `model_call_id` qui n'est JAMAIS passé par `dispatchModelCall` (L99, enum
 * déjà établie, jamais inventée ici). `ON CONFLICT` rend l'écriture idempotente
 * si `stopSession` est rejoué pour le même id. */
async function insertCancelledBeforeDispatch(dsn: string, callId: string): Promise<void> {
  const r = await runScript(
    dsn,
    { call_id: callId },
    `
DO $bench$
DECLARE
  p jsonb;
BEGIN
  SELECT j INTO p FROM _p;

  INSERT INTO model_calls (call_id, call_state)
    VALUES (p->>'call_id', 'CANCELLED_BEFORE_DISPATCH')
    ON CONFLICT (call_id) DO UPDATE SET call_state = 'CANCELLED_BEFORE_DISPATCH';

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = r.ok && r.payload !== null ? r.payload['outcome'] : undefined
  if (outcome !== 'OK') {
    const detail = r.payload?.['detail']
    throw new GatewayRefusal(
      'STORAGE_UNAVAILABLE',
      `stopSession(CANCELLED_BEFORE_DISPATCH ${callId}) : ${typeof detail === 'string' ? detail : r.error || String(outcome)}`,
    )
  }
}

/**
 * Arrêt de session (section III.7, cahier L373 : « arrêt de session »). NE
 * LÈVE PAS pour un arrêt normal. Chaque id de `pendingCalls` reçoit
 * CANCELLED_BEFORE_DISPATCH et apparaît dans `cancelled` ; chaque id de
 * `dispatchedModelCallIds` n'est pas touché et apparaît tel quel dans
 * `tracked` (A3).
 */
export async function stopSession(handle: unknown, request: StopSessionRequest): Promise<StopSessionResult> {
  const dsn = dsnOf(handle)
  const req = (request ?? {}) as Partial<StopSessionRequest>
  const pendingCalls = Array.isArray(req.pendingCalls) ? req.pendingCalls : []
  const dispatchedModelCallIds = Array.isArray(req.dispatchedModelCallIds) ? req.dispatchedModelCallIds : []

  const cancelled: string[] = []
  for (const ref of pendingCalls) {
    const id = (ref as Partial<PendingOrDispatchedCallRef> | null | undefined)?.model_call_id
    if (typeof id !== 'string' || id.length === 0) continue
    await insertCancelledBeforeDispatch(dsn, id)
    cancelled.push(id)
  }

  return { cancelled, tracked: [...dispatchedModelCallIds] }
}
