// ─────────────────────────────────────────────────────────────────────────────
// Copie privée jetable de `developerFilesDir` (cahier L329, tâche T20).
//
// Un répertoire temporaire frais, jamais le répertoire développeur lui-même :
// `provisionSandbox` (T19) le monte en lecture-écriture sous `/workspace` du
// candidat (rootfs.ts) — toute écriture du candidat doit donc atterrir ICI,
// jamais dans `developerFilesDir`.
// ─────────────────────────────────────────────────────────────────────────────
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface PrivateFilesCopy {
  readonly dir: string
  destroy(): void
}

export function provisionPrivateFiles(developerFilesDir: string): PrivateFilesCopy {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bench-eval-filescopy-'))
  for (const entry of readdirSync(developerFilesDir)) {
    cpSync(path.join(developerFilesDir, entry), path.join(dir, entry), { recursive: true })
  }
  let destroyed = false
  return {
    dir,
    destroy(): void {
      if (destroyed) return
      destroyed = true
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
