// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ÉTAGE VERT de `bench doctor` (cahier L513-L521, tâche
// T41, cas A1) : sept sondes de capacité, une par entrée de
// `verification/tasks.json#T41.requires`.
//
// CE FICHIER N'IMPORTE NI N'EXÉCUTE JAMAIS `verification/runner/doctor.mjs`
// (zone HARNESS). `acceptance/T41.spec.ts` (section I) est explicite : la
// suite établit sa PROPRE vérité terrain, indépendamment de l'implémentation
// du produit, précisément pour ne jamais comparer une sonde à elle-même. Ce
// fichier fait symétriquement la même chose côté PRODUIT : chaque sonde
// exécute réellement la capacité qu'elle rapporte (psql, curl, une connexion
// TCP, `runc --version`, `unshare`, un fournisseur factice réellement
// invoqué), jamais une recopie de la sonde du vérificateur.
//
// SENSIBILITÉ À L'ENVIRONNEMENT DU PROCESSUS COURANT, PAS À UN ENVIRONNEMENT
// EXPLICITEMENT PASSÉ. `acceptance/T41.spec.ts` (A1) bascule une capacité en
// relançant CE processus CLI avec un `PGHOST`/`S3_ENDPOINT`/`TEMPORAL_ADDRESS`
// différent, ou un `PATH` dans lequel `runc`/`unshare` sont masqués par un
// binaire factice qui échoue toujours. Chaque sonde lit donc `process.env` et
// laisse les commandes externes hériter de cet environnement — exactement
// comme `verification/runner/doctor.mjs` le fait pour SA propre vérité, sans
// qu'aucun code ne soit partagé entre les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import * as net from 'node:net'

import { createFakeProvider } from '@bench/gateway'

type Json = Record<string, unknown>

interface ProbeResult {
  readonly present: boolean
  readonly detail?: string
  readonly reason?: string
}

const PRESENT = (detail: string): ProbeResult => ({ present: true, detail })
const ABSENT = (reason: string): ProbeResult => ({ present: false, reason })

const PROBE_TIMEOUT_MS = 6000

function trySh(cmd: string, args: readonly string[], timeoutMs = PROBE_TIMEOUT_MS): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, [...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown; message?: string }
    const out = `${String(err.stdout ?? '')}${String(err.stderr ?? '')}`.trim()
    return { ok: false, out: out || String(err.message ?? '') }
  }
}

/* ══════════════════════════════════════════════════════ node22 (cahier §C) */

function probeNode22(): ProbeResult {
  const v = process.versions.node
  const major = Number(v.split('.')[0])
  return major >= 22 && major < 23
    ? PRESENT(`node ${v}`)
    : ABSENT(`node ${v} hors de la plage >=22 <23`)
}

/* ══════════════════════════════════════════════════════ postgres18 (§C) ═══
 * `psql` sans `-d` explicite lit `PGHOST`/`PGUSER` depuis l'environnement du
 * PROCESSUS COURANT (héritage normal d'`execFileSync` sans option `env`) : la
 * bascule A1 (`PGHOST` réécrit vers un chemin inexistant) y est donc visible
 * sans configuration supplémentaire. */
function probePostgres18(): ProbeResult {
  const r = trySh('psql', ['-tAc', 'SELECT 1'])
  if (!r.ok) return ABSENT(`aucun serveur PostgreSQL joignable : ${r.out || 'psql a échoué'}`)
  const v = trySh('psql', ['-tAc', 'SHOW server_version_num'])
  const num = Number((v.out || '').trim())
  if (v.ok && Number.isFinite(num) && num >= 180000 && num < 190000) {
    return PRESENT(`server_version_num=${String(num)} (PostgreSQL 18)`)
  }
  return ABSENT(
    v.ok
      ? `server_version_num=${v.out} hors de la plage PostgreSQL 18 (cahier §C)`
      : `serveur joignable mais version illisible : ${v.out}`,
  )
}

/* ═══════════════════════════════════════════════════════════════════ s3 ═══ */

function probeS3(): ProbeResult {
  const ep = process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000'
  const r = trySh('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '3', ep])
  return r.ok && r.out !== '000' ? PRESENT(`${ep} répond ${r.out}`) : ABSENT(`aucun service S3 sur ${ep}`)
}

/* ════════════════════════════════════════════════════════════ temporal ═══ */

function probeTemporal(): Promise<ProbeResult> {
  const addr = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233'
  const [host, portStr] = addr.split(':')
  const port = Number(portStr ?? 7233)
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: host ?? '127.0.0.1', port, timeout: 3000 })
    const finish = (ok: boolean): void => {
      try {
        socket.destroy()
      } catch {
        /* déjà fermée */
      }
      resolve(ok ? PRESENT(`${addr} ouvert`) : ABSENT(`aucun serveur Temporal sur ${addr}`))
    }
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/* ══════════════════════════════════════════════════════ containers.runc ═══
 * Exécute réellement `runc --version` (hérite de `PATH`, donc d'un binaire
 * factice masquant `runc` prépendu par la bascule A1), plutôt que de tester
 * la seule présence d'un fichier sur le disque. */
function probeRunc(): ProbeResult {
  const r = trySh('runc', ['--version'])
  return r.ok ? PRESENT(r.out.split('\n')[0] ?? 'runc') : ABSENT(`runc indisponible : ${r.out || 'introuvable'}`)
}

/* ═══════════════════════════════════════════════════ containers.userns ═══ */

function probeUserns(): ProbeResult {
  const r = trySh('unshare', [
    '--user',
    '--map-root-user',
    '--net',
    '--pid',
    '--mount',
    '--fork',
    '/bin/sh',
    '-c',
    'echo BENCH-CLI-USERNS-OK',
  ])
  return r.ok && r.out.includes('BENCH-CLI-USERNS-OK')
    ? PRESENT('namespaces user/net/pid/mount OK')
    : ABSENT(`unshare --user a échoué : ${r.out || 'indisponible'}`)
}

/* ═══════════════════════════════════════════════════════ fake-provider ═══
 * Invoque RÉELLEMENT `@bench/gateway` (T17) : aucune mutation d'environnement
 * ne peut faire basculer cette capacité sans corrompre le paquet lui-même
 * (acceptance/T41.spec.ts, section IV.A1) — elle n'est donc vérifiée que
 * structurellement par la suite, mais la sonde reste une exécution réelle. */
async function probeFakeProvider(): Promise<ProbeResult> {
  try {
    const provider = createFakeProvider({ responses: ['ok'] })
    const before = provider.calls
    await provider.complete({ prompt: 'bench-doctor-probe' })
    if (typeof before === 'number' && provider.calls === before + 1) {
      return PRESENT(`calls ${String(before)} -> ${String(provider.calls)}`)
    }
    return ABSENT('fournisseur factice sans compteur vivant')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return ABSENT(`fournisseur factice absent ou en échec : ${message}`)
  }
}

/* ═══════════════════════════════════════════════════════════ le rapport ═══ */

export interface DoctorReport extends Json {
  readonly schema: 'bench.doctor.report/1'
  readonly capabilities: Readonly<Record<string, ProbeResult>>
}

/**
 * Exécute les sept sondes de `verification/tasks.json#T41.requires` et rend
 * un rapport `{ capabilities: { <nom>: { present, detail? | reason? } } }`
 * (A1). `temporal` et `fake-provider` sont asynchrones ; les cinq autres sont
 * synchrones et s'exécutent dans l'ordre, chacune indépendamment des quatre
 * autres (A1 : « une perturbation ne doit rien basculer d'autre »).
 */
export async function runDoctorProbes(): Promise<Readonly<DoctorReport>> {
  const [temporal, fakeProvider] = await Promise.all([probeTemporal(), probeFakeProvider()])
  return {
    schema: 'bench.doctor.report/1',
    capabilities: {
      node22: probeNode22(),
      postgres18: probePostgres18(),
      s3: probeS3(),
      temporal,
      'containers.runc': probeRunc(),
      'containers.userns': probeUserns(),
      'fake-provider': fakeProvider,
    },
  }
}
