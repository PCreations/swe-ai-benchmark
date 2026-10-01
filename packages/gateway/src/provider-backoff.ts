// ─────────────────────────────────────────────────────────────────────────────
// @bench/gateway — ADDITIFS DE RECUL FOURNISSEUR (cahier L379-L386, tâche T26).
//
// ÉTAGE ROUGE. Ce fichier ajoute DEUX rôles fixés par la section III de
// l'en-tête d'`acceptance/T26.spec.ts` : `recordProviderBackoff` et
// `isProviderAdmissible`. Il ne touche ni ne réouvre `dispatchModelCall`,
// `getModelCall`, `reconcileModelCall` (déjà fixés par
// `acceptance/T17.spec.ts`) ni `dispatchModelCallFenced`/`stopSession` (déjà
// fixés par `acceptance/T25.spec.ts`) — ce fichier est SÉPARÉ pour que le
// diff de ce commit le montre : aucun contrat T17/T25 n'est modifié par T26.
//
// SQUELETTE : les deux exports lèvent `NotImplemented`, ce qui fait échouer
// `T26.A4` pour la raison attendue à cet étage.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Entrée de `recordProviderBackoff` (section III.9, cahier L383 :
 * « Retry-After=4 »). */
export interface RecordProviderBackoffParams {
  readonly providerId: string
  readonly retryAfterSeconds: number
  readonly now: number
}

/** Entrée de `isProviderAdmissible` (section III.10). */
export interface IsProviderAdmissibleParams {
  readonly providerId: string
  readonly now: number
}

/**
 * Enregistre qu'à l'instant `now`, `providerId` a signalé un recul de
 * `retryAfterSeconds` secondes (section III.9, cahier L383). SQUELETTE : lève
 * `NotImplemented`, sans jamais rendre `providerId` inadmissible.
 */
export async function recordProviderBackoff(
  handle: unknown,
  params: RecordProviderBackoffParams,
): Promise<void> {
  void handle
  void params
  throw new NotImplemented('gateway.recordProviderBackoff')
}

/**
 * `providerId` est-il, EN CE MOMENT, admissible (section III.10) ? SQUELETTE :
 * lève `NotImplemented` au lieu de ne JAMAIS lever (contrat final) — c'est
 * cette levée, interceptée par `essayer()` côté suite, qui produit l'échec
 * attendu à cet étage.
 */
export async function isProviderAdmissible(
  handle: unknown,
  params: IsProviderAdmissibleParams,
): Promise<boolean> {
  void handle
  void params
  throw new NotImplemented('gateway.isProviderAdmissible')
}
