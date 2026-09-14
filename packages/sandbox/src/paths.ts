// ─────────────────────────────────────────────────────────────────────────────
// Racine du dépôt et répertoire de travail du SandboxRunner.
//
// `.bench/` est gitignoré (voir .gitignore) : c'est exactement l'endroit où
// `verification/runner/doctor.mjs` range déjà ses propres artefacts de sonde
// (`.bench/probe`). Ce module réutilise la même convention plutôt que d'en
// inventer une nouvelle.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function repoRoot(): string {
  let dir: string
  try {
    dir = dirname(fileURLToPath(import.meta.url))
  } catch {
    dir = process.cwd()
  }
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function sandboxBaseDir(id: string): string {
  return join(repoRoot(), '.bench', 'sandbox', id)
}
