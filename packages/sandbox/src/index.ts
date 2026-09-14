// ─────────────────────────────────────────────────────────────────────────────
// SandboxRunner Linux : profil d'exécution borné, réseau du candidat et
// procédure de destruction (cahier L317-L326, tâche T19).
//
// ÉTAGE VERT. Les trois exports de la section III de l'en-tête
// d'`acceptance/T19.spec.ts` sont implémentés par composition de modules
// séparés (chacun responsable d'UN mécanisme du noyau) :
//   - rootfs.ts    vue de système de fichiers minimale du candidat (L321)
//   - net.ts       netns scellé + liste blanche nftables (L321, L323/A2-A3)
//   - cgroup.ts     limites mémoire/pids réelles et preuve indépendante (A5)
//   - runtime.ts    lancement, exécution, destruction du conteneur (L319)
//   - probe.ts      sondes TCP depuis/vers le netns du candidat (A2/A3/A6)
//   - gateway.ts    liaison jeton -> trajectoire de « la passerelle » (A4)
//
// CE QUE CE FICHIER NE PRÉTEND PAS FAIRE : aucun des modules ci-dessus ne
// crée de user namespace pour le candidat (cf. runtime.ts, en-tête, pour la
// raison mesurée). Le candidat est confiné par des espaces de noms
// PID/mount/uts/ipc/network réels et des cgroups v1 réels, pas par un
// remappage d'UID.
// ─────────────────────────────────────────────────────────────────────────────
import { rmSync } from 'node:fs'
import { createCgroups, destroyCgroups, readEvidence, type CgroupPaths } from './cgroup.js'
import { mintGatewayCredential as gatewayMint, verifyTrajectoryClaim as gatewayVerify } from './gateway.js'
import { netPlanFor, shortId, type NetPlan } from './ids.js'
import { createSandboxNetwork, destroySandboxNetwork, type EgressEntry } from './net.js'
import { sandboxBaseDir } from './paths.js'
import { exposeProbeListener as netExposeListener, probeTcp as netProbeTcp, type Listener } from './probe.js'
import { buildRootfsSkeleton, writeInitScript, writeMountSetupScript } from './rootfs.js'
import { destroyHolder, execIn, launchHolder, type Holder } from './runtime.js'

/** Une destination autorisée en liste blanche d'egress (L321, L323/A3). */
export interface AllowedEgressEntry {
  readonly label: string
  readonly host: string
  readonly port: number
}

/** Entrée de `buildSandboxProfile` (section III.1). */
export interface SandboxProfileInput {
  readonly trajectoryId: string
  readonly workspaceDir: string
  readonly memoryLimitBytes: number
  readonly pidsMax: number
  readonly allowedEgress: readonly AllowedEgressEntry[]
  readonly controlRepoRoot: string
  readonly privateSentinelPath: string
}

/** Profil archivable — sérialisable JSON sans perte (§III.1). */
export interface Profile {
  readonly trajectoryId: string
  readonly workspaceDir: string
  readonly memoryLimitBytes: number
  readonly pidsMax: number
  readonly allowedEgress: readonly AllowedEgressEntry[]
  readonly controlRepoRoot: string
  readonly privateSentinelPath: string
}

export interface ExecResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly terminated: boolean
  readonly terminationReason: string | null
}

export interface ProbeResult {
  readonly reachable: boolean
}

export interface ProbeListener {
  readonly host: string
  readonly port: number
}

export interface GatewayCredential {
  readonly token: string
}

export interface ResourceEvidence {
  readonly memoryFailcnt: number
  readonly pidsLimitHit: boolean
}

export interface SandboxHandle {
  readonly trajectoryId: string
  execShell(command: string, opts?: { readonly timeoutMs?: number }): Promise<ExecResult>
  probeTcp(host: string, port: number, opts?: { readonly timeoutMs?: number }): Promise<ProbeResult>
  exposeProbeListener(): Promise<ProbeListener>
  mintGatewayCredential(): Promise<GatewayCredential>
  readResourceEvidence(): Promise<ResourceEvidence>
  destroy(): Promise<void>
}

export interface TrajectoryClaimResult {
  readonly accepted: boolean
  readonly code?: string
}

/** PURE — aucune E/S, aucune ressource ouverte (section III.1). */
export function buildSandboxProfile(input: SandboxProfileInput): Profile {
  return {
    trajectoryId: input.trajectoryId,
    workspaceDir: input.workspaceDir,
    memoryLimitBytes: input.memoryLimitBytes,
    pidsMax: input.pidsMax,
    allowedEgress: input.allowedEgress.map((e) => ({ label: e.label, host: e.host, port: e.port })),
    controlRepoRoot: input.controlRepoRoot,
    privateSentinelPath: input.privateSentinelPath,
  }
}

class Sandbox implements SandboxHandle {
  readonly trajectoryId: string
  #short: string
  #dir: string
  #plan: NetPlan
  #cgroups: CgroupPaths
  #holder: Holder
  #listeners: Listener[] = []
  #destroyed = false

  constructor(trajectoryId: string, short: string, dir: string, plan: NetPlan, cgroups: CgroupPaths, holder: Holder) {
    this.trajectoryId = trajectoryId
    this.#short = short
    this.#dir = dir
    this.#plan = plan
    this.#cgroups = cgroups
    this.#holder = holder
  }

  async execShell(command: string, opts?: { readonly timeoutMs?: number }): Promise<ExecResult> {
    if (this.#destroyed) {
      throw new Error('sandbox.execShell: ce SandboxHandle a été détruit (destroy() a déjà été appelé)')
    }
    return execIn(this.#holder, this.#cgroups, command, opts ?? {})
  }

  async probeTcp(host: string, port: number, opts?: { readonly timeoutMs?: number }): Promise<ProbeResult> {
    if (this.#destroyed) return { reachable: false }
    return netProbeTcp(this.#plan, host, port, opts?.timeoutMs ?? 5_000)
  }

  async exposeProbeListener(): Promise<ProbeListener> {
    if (this.#destroyed) {
      throw new Error('sandbox.exposeProbeListener: ce SandboxHandle a été détruit')
    }
    const l = await netExposeListener(this.#plan)
    this.#listeners.push(l)
    return { host: l.host, port: l.port }
  }

  async mintGatewayCredential(): Promise<GatewayCredential> {
    return gatewayMint(this.trajectoryId)
  }

  async readResourceEvidence(): Promise<ResourceEvidence> {
    return readEvidence(this.#cgroups)
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return
    this.#destroyed = true
    for (const l of this.#listeners.splice(0)) {
      l.kill()
    }
    destroyHolder(this.#holder)
    await new Promise((r) => setTimeout(r, 150))
    destroyCgroups(this.#cgroups)
    destroySandboxNetwork(this.#short, this.#plan)
    for (let i = 0; i < 10; i += 1) {
      try {
        rmSync(this.#dir, { recursive: true, force: true })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
  }
}

/**
 * Provisionne le conteneur candidat non privilégié à partir d'un `Profile`
 * archivé et rend un `SandboxHandle` (section III.2).
 */
export async function provisionSandbox(profile: Profile): Promise<SandboxHandle> {
  const short = shortId(profile.trajectoryId)
  const dir = sandboxBaseDir(short)
  const rootfs = `${dir}/rootfs`

  buildRootfsSkeleton(rootfs)
  writeInitScript(rootfs)
  const mountSetupPath = writeMountSetupScript(dir, rootfs, profile.workspaceDir)

  const plan = netPlanFor(short)
  const allowed: EgressEntry[] = profile.allowedEgress.map((e) => ({ host: e.host, port: e.port }))
  createSandboxNetwork(short, plan, allowed)

  const cgroups = createCgroups(short, profile.memoryLimitBytes, profile.pidsMax)

  const holder = await launchHolder(mountSetupPath, plan, cgroups)

  return new Sandbox(profile.trajectoryId, short, dir, plan, cgroups, holder)
}

/**
 * Point de décision de la passerelle : vérifie qu'un jeton émis par
 * `mintGatewayCredential()` est présenté avec l'identité de trajectoire à
 * laquelle il est RÉELLEMENT lié (section III.3, L323/A4).
 */
export function verifyTrajectoryClaim(
  claimedTrajectoryId: string,
  token: string,
): Promise<TrajectoryClaimResult> {
  return Promise.resolve(gatewayVerify(claimedTrajectoryId, token))
}
