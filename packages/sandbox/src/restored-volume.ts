// ─────────────────────────────────────────────────────────────────────────────
// @bench/sandbox — ADDITIF DE FENCING sur un volume restauré (cahier L321,
// L371-L378, tâche T25).
//
// ÉTAGE VERT. Un seul rôle fixé par la section III de l'en-tête
// d'`acceptance/T25.spec.ts` : `writeToRestoredVolume`. Il ne touche ni ne
// réouvre les six exports déjà fixés par `acceptance/T19.spec.ts`
// (`./index.ts`) — fichier séparé, même raison que `packages/gateway/src/
// fencing.ts`. `volumeDir` y est un répertoire HÔTE ordinaire (section III.10
// de la suite) : ce rôle ne reprouve PAS l'isolation de conteneur de T19,
// seulement le contrôle de jeton sur CE chemin d'écriture précis.
//
// NE LÈVE JAMAIS (section III.10, même discipline que `probeTcp` de T19) : un
// `leaseHandle` mal formé, un jeton périmé ou une écriture hôte en échec
// rendent tous `{ written: false }`, jamais une exception.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs'
import * as path from 'node:path'
import { isLeaseAdmitted } from '@bench/workflows'

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
 * admet `token` pour `resourceId` (section III.10). NE LÈVE JAMAIS.
 */
export async function writeToRestoredVolume(
  leaseHandle: unknown,
  request: WriteToRestoredVolumeRequest,
): Promise<WriteToRestoredVolumeResult> {
  const r = (request ?? {}) as Partial<WriteToRestoredVolumeRequest>
  if (
    typeof r.resourceId !== 'string' ||
    r.resourceId.length === 0 ||
    typeof r.token !== 'number' ||
    typeof r.volumeDir !== 'string' ||
    r.volumeDir.length === 0 ||
    typeof r.relPath !== 'string' ||
    r.relPath.length === 0 ||
    typeof r.content !== 'string'
  ) {
    return { written: false }
  }

  if (!isLeaseAdmitted(leaseHandle, r.resourceId, r.token)) {
    return { written: false }
  }

  const target = path.join(r.volumeDir, r.relPath)
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, r.content, 'utf8')
    return { written: true }
  } catch {
    return { written: false }
  }
}
