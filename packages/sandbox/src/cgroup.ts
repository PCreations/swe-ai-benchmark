// ─────────────────────────────────────────────────────────────────────────────
// Limites de ressources et preuve indépendante (L323/A5).
//
// DRIVER ET VERSION ÉPINGLÉS PAR infra/profiles.json : cgroupfs v1. Mesuré sur
// cet hôte par `verification/runner/doctor.mjs` (`containers.cgroup-mem`,
// `containers.cgroup-pids`) : `/sys/fs/cgroup/unified` n'expose que `hugetlb`,
// donc les contrôleurs mémoire/pids v2 n'existent pas ici. Ce module lit et
// écrit directement les pseudo-fichiers v1 (`memory.limit_in_bytes`,
// `memory.failcnt`, `pids.max`, `pids.events`), exactement comme la sonde.
//
// `readResourceEvidence` (§III) doit être une observation INDÉPENDANTE du
// code de sortie d'`execShell` — la même discipline que doctor.mjs : elle lit
// ces fichiers directement depuis le contrôleur (hors du candidat), jamais
// depuis une valeur auto-déclarée par le processus exécuté.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { sh, trySh } from './sh.js'

export interface CgroupPaths {
  readonly memDir: string
  readonly pidsDir: string
}

export function createCgroups(short: string, memoryLimitBytes: number, pidsMax: number): CgroupPaths {
  const memDir = `/sys/fs/cgroup/memory/bench/${short}`
  const pidsDir = `/sys/fs/cgroup/pids/bench/${short}`
  mkdirSync(memDir, { recursive: true })
  mkdirSync(pidsDir, { recursive: true })
  writeFileSync(`${memDir}/memory.limit_in_bytes`, String(Math.trunc(memoryLimitBytes)))
  writeFileSync(`${pidsDir}/pids.max`, String(Math.trunc(pidsMax)))
  return { memDir, pidsDir }
}

/** Fragment shell qui fait rejoindre les DEUX cgroups par le processus
 * appelant ($$) — à préfixer devant chaque commande exécutée dans le
 * sandbox, puisque les processus lancés par le contrôleur (pas des
 * descendants du PID 1 du conteneur) n'héritent pas automatiquement de son
 * appartenance de cgroup. */
export function joinCgroupsSnippet(paths: CgroupPaths): string {
  return `echo $$ > ${paths.memDir}/cgroup.procs 2>/dev/null; echo $$ > ${paths.pidsDir}/cgroup.procs 2>/dev/null;`
}

export interface ResourceEvidence {
  readonly memoryFailcnt: number
  readonly pidsLimitHit: boolean
}

function readMemoryFailcnt(memDir: string): number {
  try {
    return Number(readFileSync(`${memDir}/memory.failcnt`, 'utf8').trim())
  } catch {
    return 0
  }
}

/** `pids.events` (« max N ») existe sous ce noyau même en hiérarchie v1
 * (mesuré directement, pas supposé) — c'est le compteur indépendant que
 * `readResourceEvidence` expose comme `pidsLimitHit`. */
function readPidsMaxEvents(pidsDir: string): number {
  try {
    const txt = readFileSync(`${pidsDir}/pids.events`, 'utf8')
    const m = /max\s+(\d+)/.exec(txt)
    return m?.[1] !== undefined ? Number(m[1]) : 0
  } catch {
    return 0
  }
}

export function readEvidence(paths: CgroupPaths): ResourceEvidence {
  return {
    memoryFailcnt: readMemoryFailcnt(paths.memDir),
    pidsLimitHit: readPidsMaxEvents(paths.pidsDir) > 0,
  }
}

/** Snapshot brut (pour la détection de dépassement PAR APPEL d'`execShell`,
 * en delta — cf. runtime.ts). */
export function snapshot(paths: CgroupPaths): { memoryFailcnt: number; pidsMaxEvents: number } {
  return { memoryFailcnt: readMemoryFailcnt(paths.memDir), pidsMaxEvents: readPidsMaxEvents(paths.pidsDir) }
}

export function destroyCgroups(paths: CgroupPaths): void {
  // Un cgroup ne se retire que vide : les processus ont déjà été tués par
  // l'appelant (runtime.ts) avant ce nettoyage ; quelques retries absorbent
  // le délai de récupération du noyau.
  for (const dir of [paths.pidsDir, paths.memDir]) {
    for (let i = 0; i < 20; i += 1) {
      const r = trySh(`rmdir ${dir}`)
      if (r.ok) break
      sh(`sleep 0.05`)
    }
  }
}
