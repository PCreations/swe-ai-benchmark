// ─────────────────────────────────────────────────────────────────────────────
// Petits utilitaires d'exécution shell — même discipline que
// verification/runner/doctor.mjs (zone HARNESS) : commandes réellement
// exécutées, jamais de simulation. Ce module est privé au paquet (non
// exporté par index.ts) : il n'est qu'un outil pour les autres modules.
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process'

export interface ShResult {
  readonly ok: boolean
  readonly out: string
  readonly code: number | null
}

/** Exécute `cmd` via `/bin/sh -c`, lève si le code de sortie est non nul. */
export function sh(cmd: string, timeoutMs = 20_000): string {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  }).trim()
}

/** Comme `sh`, mais rend un résultat au lieu de lever. */
export function trySh(cmd: string, timeoutMs = 20_000): ShResult {
  try {
    return { ok: true, out: sh(cmd, timeoutMs), code: 0 }
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown; status?: number | null }
    const out = `${String(err.stdout ?? '')}${String(err.stderr ?? '')}`
    return { ok: false, out, code: err.status ?? null }
  }
}
