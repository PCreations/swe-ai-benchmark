// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — L'EFFET EXTERNE ADMIS (cahier L379-L386, L365, tâche T26).
//
// ÉTAGE VERT. Un seul rôle fixé par la section III de l'en-tête
// d'`acceptance/T26.spec.ts` : `runAdmittedEffect`. C'est le point unique où
// « l'appel externe » (cahier L365 : « les appels externes se trouvent dans
// les Activities ») a lieu, une fois l'admission accordée par
// `packages/workflows` — jamais avant.
//
// DÉLÈGUE, NE RÉIMPLÉMENTE PAS. `submitReadyCall`/`releaseCall`
// (`@bench/workflows`, admission-queue.ts) sont appelés TELS QUELS sur le
// MÊME `handle` que le test reçoit de `openAdmissionQueue` — même geste que
// `dispatchModelCallFenced` déléguant à `assertLeaseAdmitted` (T25,
// `packages/gateway/src/fencing.ts`). Cette Activity n'a donc AUCUN état
// propre : le `QueueHandle` reste la seule source de vérité de l'admission.
//
// PROPAGATION SANS TRANSFORMATION (III.11). `effect()` est invoqué ENTRE
// l'attente de `admitted` et l'appel à `releaseCall` — jamais avant, jamais
// après. Le `finally` ci-dessous garantit que `releaseCall` a lieu que
// `effect()` réussisse ou échoue, SANS intercepter ni modifier le résultat ou
// l'erreur : `effect()` (ou son rejet) traverse telle quelle jusqu'à
// l'appelant, aucun `catch` ne transforme son message ni son type.
// ─────────────────────────────────────────────────────────────────────────────

import { ContractViolation } from '@bench/contracts'
import { releaseCall, submitReadyCall } from '@bench/workflows'
import type { QueueHandle } from '@bench/workflows'

/** Entrée de `runAdmittedEffect` (section III.11). */
export interface RunAdmittedEffectParams {
  readonly callId: string
  readonly providerId: string
  readonly now: number
}

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'nombre fini attendu')
  }
  return v
}

/**
 * Appelle `submitReadyCall` pour `callId`, ATTEND l'admission, puis ET
 * SEULEMENT ALORS invoque `effect()` ; que `effect()` réussisse ou échoue,
 * libère ensuite le slot via `releaseCall` avec le MÊME `now`, puis répercute
 * le résultat ou l'erreur de `effect()` sans la transformer (section III.11).
 */
export async function runAdmittedEffect<T>(
  handle: unknown,
  params: RunAdmittedEffectParams,
  effect: () => Promise<T>,
): Promise<T> {
  const p = (params ?? {}) as Partial<RunAdmittedEffectParams>
  const callId = requireNonEmptyString(p.callId, 'runAdmittedEffect.callId')
  const providerId = requireNonEmptyString(p.providerId, 'runAdmittedEffect.providerId')
  const now = requireNumber(p.now, 'runAdmittedEffect.now')

  const { admitted } = await submitReadyCall(handle as QueueHandle, { callId, providerId, now })
  await admitted

  try {
    return await effect()
  } finally {
    await releaseCall(handle as QueueHandle, { callId, now })
  }
}
