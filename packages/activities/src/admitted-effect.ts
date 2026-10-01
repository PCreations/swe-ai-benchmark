// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — L'EFFET EXTERNE ADMIS (cahier L379-L386, L365, tâche T26).
//
// ÉTAGE ROUGE. Un seul rôle fixé par la section III de l'en-tête
// d'`acceptance/T26.spec.ts` : `runAdmittedEffect`. C'est le point unique où
// « l'appel externe » (cahier L365 : « les appels externes se trouvent dans
// les Activities ») a lieu, une fois l'admission accordée par
// `packages/workflows` — jamais avant.
//
// SQUELETTE : l'export lève `NotImplemented`, sans jamais appeler `effect()`
// ni `submitReadyCall`/`releaseCall` — ce qui fait échouer `T26.A1` et `T26.A5`
// pour la raison attendue à cet étage.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Entrée de `runAdmittedEffect` (section III.11). */
export interface RunAdmittedEffectParams {
  readonly callId: string
  readonly providerId: string
  readonly now: number
}

/**
 * Appelle `submitReadyCall` pour `callId`, ATTEND l'admission, puis ET
 * SEULEMENT ALORS invoque `effect()` ; que `effect()` réussisse ou échoue,
 * libère ensuite le slot via `releaseCall` avec le MÊME `now`, puis répercute
 * le résultat ou l'erreur de `effect()` sans la transformer (section III.11).
 * SQUELETTE : lève `NotImplemented`, sans jamais contacter `handle` ni
 * invoquer `effect`.
 */
export async function runAdmittedEffect<T>(
  handle: unknown,
  params: RunAdmittedEffectParams,
  effect: () => Promise<T>,
): Promise<T> {
  void handle
  void params
  void effect
  throw new NotImplemented('activities.runAdmittedEffect')
}
