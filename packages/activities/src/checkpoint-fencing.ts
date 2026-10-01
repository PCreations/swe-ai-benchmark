// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — publication de checkpoint FENCÉE (cahier L365, L371-L378,
// tâche T25).
//
// ÉTAGE ROUGE. Deux rôles fixés par la section III de l'en-tête
// d'`acceptance/T25.spec.ts` : `publishCheckpointActivity` (admission gardée
// par le même jeton de bail que `dispatchModelCallFenced`, cahier L365 : « les
// appels externes se trouvent dans les Activities ») et
// `listPublishedCheckpoints`, le contrôle INDÉPENDANT qui ferme le trou d'un
// rejet en apparence qui publierait quand même (A1, second volet).
//
// SQUELETTE : les deux exports lèvent `NotImplemented`.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Entrée de `publishCheckpointActivity` (section III.8). */
export interface PublishCheckpointActivityRequest {
  readonly resourceId: string
  readonly token: number
  readonly now: number
  readonly checkpointRef: string
}

export interface PublishCheckpointActivityResult {
  readonly ok: true
  readonly published: string
}

/**
 * Publie un checkpoint, SI ET SEULEMENT SI le contrôle de bail admet `token`
 * pour `resourceId` (section III.8). SQUELETTE : lève `NotImplemented`, sans
 * jamais enregistrer `checkpointRef` comme publié.
 */
export async function publishCheckpointActivity(
  leaseHandle: unknown,
  request: PublishCheckpointActivityRequest,
): Promise<PublishCheckpointActivityResult> {
  void leaseHandle
  void request
  throw new NotImplemented('activities.publishCheckpointActivity')
}

/**
 * Lecture indépendante de ce que `publishCheckpointActivity` a réellement
 * enregistré pour `resourceId` (section III.9). SQUELETTE : lève
 * `NotImplemented`.
 */
export async function listPublishedCheckpoints(
  leaseHandle: unknown,
  resourceId: string,
): Promise<readonly string[]> {
  void leaseHandle
  void resourceId
  throw new NotImplemented('activities.listPublishedCheckpoints')
}
