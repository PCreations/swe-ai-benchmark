// ─────────────────────────────────────────────────────────────────────────────
// @bench/sandbox — ADDITIF DE FENCING sur un volume restauré (cahier L321,
// L371-L378, tâche T25).
//
// ÉTAGE ROUGE. Un seul rôle fixé par la section III de l'en-tête
// d'`acceptance/T25.spec.ts` : `writeToRestoredVolume`. Il ne touche ni ne
// réouvre les six exports déjà fixés par `acceptance/T19.spec.ts`
// (`./index.ts`) — fichier séparé, même raison que `packages/gateway/src/
// fencing.ts`. `volumeDir` y est un répertoire HÔTE ordinaire (section III.10
// de la suite) : ce rôle ne reprouve PAS l'isolation de conteneur de T19,
// seulement le contrôle de jeton sur CE chemin d'écriture précis.
//
// SQUELETTE : lève `NotImplemented` — ce qui N'EST PAS le contrat final (le
// rôle ne doit jamais lever une fois écrit, « NE LÈVE JAMAIS »), mais fait
// échouer `T25.A2` pour la raison attendue à cet étage.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Entrée de `writeToRestoredVolume` (section III.10). */
export interface WriteToRestoredVolumeRequest {
  readonly resourceId: string
  readonly token: number
  readonly now: number
  readonly volumeDir: string
  readonly relPath: string
  readonly content: string
}

export interface WriteToRestoredVolumeResult {
  readonly written: boolean
}

/**
 * Écrit `content` à `volumeDir/relPath` si et seulement si le contrôle de bail
 * admet `token` pour `resourceId` (section III.10). SQUELETTE : lève
 * `NotImplemented`.
 */
export async function writeToRestoredVolume(
  leaseHandle: unknown,
  request: WriteToRestoredVolumeRequest,
): Promise<WriteToRestoredVolumeResult> {
  void leaseHandle
  void request
  throw new NotImplemented('sandbox.writeToRestoredVolume')
}
