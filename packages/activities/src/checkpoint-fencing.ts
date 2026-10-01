// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — publication de checkpoint FENCÉE (cahier L365, L371-L378,
// tâche T25).
//
// ÉTAGE VERT. Deux rôles fixés par la section III de l'en-tête
// d'`acceptance/T25.spec.ts` : `publishCheckpointActivity` (admission gardée
// par le même jeton de bail que `dispatchModelCallFenced`, cahier L365 : « les
// appels externes se trouvent dans les Activities ») et
// `listPublishedCheckpoints`, le contrôle INDÉPENDANT qui ferme le trou d'un
// rejet en apparence qui publierait quand même (A1, second volet).
//
// AUCUN STOCKAGE PROPRE : le `leaseHandle` reçu (`@bench/workflows`) PORTE déjà
// la liste des checkpoints publiés par ressource (cf. son en-tête) —
// `publishCheckpointActivity` n'a que `leaseHandle` en paramètre d'autorité, il
// n'y a donc pas d'autre endroit où persister `checkpointRef`. `recordPublished
// Checkpoint` n'est appelé QU'APRÈS que `assertLeaseAdmitted` a laissé passer :
// c'est cette séquence, pas une condition supplémentaire, qui garantit qu'un
// jeton périmé ne publie jamais rien (IV.3).
// ─────────────────────────────────────────────────────────────────────────────

import { ContractViolation } from '@bench/contracts'
import { assertLeaseAdmitted, readPublishedCheckpoints, recordPublishedCheckpoint } from '@bench/workflows'

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

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

/**
 * Publie un checkpoint, SI ET SEULEMENT SI le contrôle de bail admet `token`
 * pour `resourceId` (section III.8). Rejette avec `.code === 'STALE_EXECUTION'`
 * quand inadmissible, SANS jamais enregistrer `checkpointRef` comme publié.
 */
export async function publishCheckpointActivity(
  leaseHandle: unknown,
  request: PublishCheckpointActivityRequest,
): Promise<PublishCheckpointActivityResult> {
  const r = (request ?? {}) as Partial<PublishCheckpointActivityRequest>
  const resourceId = requireNonEmptyString(r.resourceId, 'publishCheckpointActivity.resourceId')
  const checkpointRef = requireNonEmptyString(r.checkpointRef, 'publishCheckpointActivity.checkpointRef')
  if (typeof r.token !== 'number') {
    throw new ContractViolation('TYPE_MISMATCH', 'publishCheckpointActivity.token', 'nombre attendu')
  }

  // DÉCISIF (III.8, A1 second volet) : admission avant TOUTE écriture.
  assertLeaseAdmitted(leaseHandle, resourceId, r.token)
  recordPublishedCheckpoint(leaseHandle, resourceId, checkpointRef)

  return { ok: true, published: checkpointRef }
}

/**
 * Lecture indépendante de ce que `publishCheckpointActivity` a réellement
 * enregistré pour `resourceId` (section III.9).
 */
export async function listPublishedCheckpoints(leaseHandle: unknown, resourceId: string): Promise<readonly string[]> {
  return readPublishedCheckpoints(leaseHandle, resourceId)
}
