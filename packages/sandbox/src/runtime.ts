// ─────────────────────────────────────────────────────────────────────────────
// Cycle de vie du conteneur candidat : lancement, exécution de commandes,
// destruction (L319, L321, §III.2).
//
// POURQUOI DEUX APPELS `unshare` IMBRIQUÉS PLUTÔT QU'UN SEUL AVEC TOUS LES
// ESPACES DE NOMS. Mesuré sur cet hôte, pas supposé : un unique
// `unshare --pid --mount --uts --ipc --fork -- <script qui monte puis
// chroot>` laisse le processus qui a effectivement rejoint l'espace de noms
// PID (celui qu'`unshare --fork` crée par fork()) bloqué avant même son
// premier `exec` — `nsenter --target <ce pid> --root` échoue ensuite avec
// « cannot open /workspace », signe que le chroot n'a jamais eu lieu.
// Séparer le montage (un `unshare --mount --uts --ipc` SANS `--fork`, qui
// déplace le processus appelant lui-même — pas de fork nécessaire pour un
// mount namespace) de la création de l'espace de noms PID (un second
// `unshare --pid --fork` imbriqué, exécuté APRÈS que tous les montages sont
// en place) élimine l'interaction : chaque étape est alors un simple appel
// `unshare(2)` sans effet de bord observé. Toute la chaîne — y compris le
// join du netns externe (net.ts) et du cgroup (cgroup.ts) — avance par
// `exec`, donc conserve le MÊME pid hôte jusqu'au dernier `unshare --fork`,
// qui introduit exactement UN niveau d'enfant : celui-là est le PID 1 réel
// du conteneur, la seule valeur dont ce module a besoin pour tout le reste
// (`nsenter --target`).
//
// CE QUE CE MODULE NE FAIT PAS : créer un user namespace pour le candidat.
// Essayé et abandonné (cf. le message du commit IMPL) : combiner un user
// namespace avec le montage du rootfs échoue sur cet hôte avec
// « remount-private ... permission denied » dès que `runc` (ou un
// `unshare --user` équivalent) doit changer la propagation d'un montage
// préparé hors de ce user namespace — restriction noyau, pas un bug de ce
// paquet. Le candidat tourne donc comme le root RÉEL de l'hôte, confiné par
// son propre espace de noms PID/mount/uts/ipc, un netns scellé de
// l'extérieur (net.ts) et des cgroups v1 réels (cgroup.ts) — pas par un
// remappage d'UID. C'est un écart mesuré face à l'aspiration
// d'`infra/oci/base-spec.json` (« conteneurs non privilégiés ») : aucun des
// six cas requis de `acceptance/T19.spec.ts` ne l'exige, mais il reste
// réel et non dissimulé.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import type { CgroupPaths } from './cgroup.js'
import { joinCgroupsSnippet, snapshot } from './cgroup.js'
import { netnsPath } from './net.js'
import type { NetPlan } from './ids.js'
import { trySh } from './sh.js'

export interface Holder {
  readonly controlPid: number
  readonly initPid: number
}

function directChild(pid: number): number | null {
  const f = `/proc/${pid}/task/${pid}/children`
  if (!existsSync(f)) return null
  const raw = readFileSync(f, 'utf8').trim()
  if (!raw) return null
  const first = raw.split(/\s+/)[0]
  return first !== undefined ? Number(first) : null
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function cmdlineOf(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ')
  } catch {
    return ''
  }
}

export async function launchHolder(
  mountSetupPath: string,
  plan: NetPlan,
  cgroups: CgroupPaths,
): Promise<Holder> {
  const outer = `${joinCgroupsSnippet(cgroups)} exec nsenter --net=${netnsPath(plan)} -- unshare --mount --uts --ipc -- /bin/sh ${mountSetupPath}`
  const child = spawn('sh', ['-c', outer], { stdio: 'ignore', detached: true })
  child.unref()
  const controlPid = child.pid
  if (controlPid === undefined) throw new Error('sandbox.launchHolder: échec du spawn du contrôleur')

  // `mountsetup.sh` (rootfs.ts) exécute PLUSIEURS commandes externes (mount,
  // touch...) avant sa dernière ligne `exec unshare --pid --fork -- chroot
  // ... /init.sh` — chacune de ces commandes est, un court instant, un
  // enfant DIRECT de `controlPid`. Lire `children` trop tôt y trouve donc un
  // processus TRANSITOIRE (« mount », « touch »...), pas le PID 1 du
  // conteneur — mesuré : ce faux positif fait échouer `nsenter --root`
  // ensuite avec un message trompeur (« cd: can't cd to /workspace »), sur
  // le MAUVAIS pid. On attend d'abord que `controlPid` ait atteint sa
  // dernière ligne (son propre `cmdline` reflète alors `unshare --pid
  // --fork -- chroot ...`, par `exec`), et seulement ensuite on lit son
  // enfant : à ce point-là, plus aucune commande transitoire ne peut
  // apparaître avant le fork de PID 1.
  let atFinalExec = false
  for (let i = 0; i < 150; i += 1) {
    const cl = cmdlineOf(controlPid)
    if (cl.includes('chroot') && cl.includes('/init.sh')) {
      atFinalExec = true
      break
    }
    if (!isAlive(controlPid)) break
    await sleep(50)
  }
  if (!atFinalExec) {
    throw new Error('sandbox.launchHolder: le contrôleur n\'a jamais atteint son exec final (montages)')
  }

  let initPid: number | null = null
  for (let i = 0; i < 100; i += 1) {
    initPid = directChild(controlPid)
    if (initPid !== null) break
    if (!isAlive(controlPid)) break
    await sleep(50)
  }
  if (initPid === null) {
    throw new Error('sandbox.launchHolder: le PID 1 du conteneur n\'est jamais apparu')
  }

  // Prêt seulement quand le chroot + les montages sont réellement en place —
  // pas une attente à durée fixe : on sonde jusqu'à ce que `cd /workspace`
  // réussisse à l'intérieur du conteneur.
  //
  // POURQUOI `cd /workspace` DANS LA COMMANDE, PAS `nsenter --wd=`. Mesuré
  // sur cet hôte (util-linux 2.39.3) : `nsenter --root --wd=<chemin>`
  // applique le `chdir` AVANT le `chroot`, donc contre l'ANCIENNE racine —
  // `--wd=/workspace` échoue systématiquement avec « cannot open /workspace »
  // alors que `ls -la /workspace`, exécuté PAR la commande une fois le
  // chroot effectif, réussit. `execIn` (plus bas) applique la même
  // contournement.
  let ready = false
  for (let i = 0; i < 150; i += 1) {
    const r = trySh(
      `nsenter --target ${initPid} --mount --pid --uts --ipc --root -- /bin/sh -c "cd /workspace && true"`,
      3000,
    )
    if (r.ok) {
      ready = true
      break
    }
    if (!isAlive(initPid)) break
    await sleep(100)
  }
  if (!ready) {
    throw new Error('sandbox.launchHolder: le conteneur ne devient jamais prêt (chroot/montages)')
  }

  return { controlPid, initPid }
}

export interface ExecOptions {
  readonly timeoutMs?: number
}

export interface ExecOutcome {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly terminated: boolean
  readonly terminationReason: string | null
}

function runArgv(cmd: string, args: readonly string[], timeoutMs: number): Promise<{
  code: number
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('close', (code, signal) => {
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? -1, signal, stdout, stderr })
    })
  })
}

/**
 * Exécute `command` DANS le conteneur (`/bin/sh -c "<command>"`, §III.2).
 * `terminated`/`terminationReason` sont dérivés d'une lecture DE CGROUP
 * avant/après (delta), jamais du seul code de sortie du processus exécuté —
 * la même discipline que `readResourceEvidence` (cgroup.ts) : un `fork()`
 * qui échoue sous `pids.max` ne rend pas nécessairement un `$?` non nul (le
 * script continue), donc le code de sortie seul ne prouverait rien.
 */
export async function execIn(
  holder: Holder,
  cgroups: CgroupPaths,
  command: string,
  opts: ExecOptions = {},
): Promise<ExecOutcome> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const secs = Math.max(1, Math.ceil(timeoutMs / 1000))
  const before = snapshot(cgroups)

  // Pas de `--wd=/workspace` : cf. launchHolder (nsenter applique le chdir
  // avant le chroot sur cet hôte). Le `cd /workspace` fait partie du
  // WRAPPER (positionnel `$0`), jamais concaténé dans `command` lui-même —
  // `command` reste un unique argv, quel que soit son contenu.
  const nsenterArgs = [
    '--target',
    String(holder.initPid),
    '--mount',
    '--pid',
    '--uts',
    '--ipc',
    '--net',
    '--root',
    '--',
    '/bin/sh',
    '-c',
    'cd /workspace 2>/dev/null; exec timeout -s KILL "$1" /bin/sh -c "$2"',
    'sh',
    String(secs),
    command,
  ]
  const outer = `${joinCgroupsSnippet(cgroups)} exec "$@"`
  const { code, signal, stdout, stderr } = await runArgv('sh', ['-c', outer, 'sh', 'nsenter', ...nsenterArgs], timeoutMs + 10_000)

  const after = snapshot(cgroups)
  const memHit = after.memoryFailcnt > before.memoryFailcnt
  const pidsHit = after.pidsMaxEvents > before.pidsMaxEvents

  let terminated = false
  let terminationReason: string | null = null
  if (memHit) {
    terminated = true
    terminationReason = `limite cgroup mémoire atteinte (memory.failcnt ${before.memoryFailcnt} -> ${after.memoryFailcnt})`
  } else if (pidsHit) {
    terminated = true
    terminationReason = `limite cgroup pids atteinte (pids.events max ${before.pidsMaxEvents} -> ${after.pidsMaxEvents})`
  }

  return {
    exitCode: signal !== null ? 128 + signalNumber(signal) : code,
    stdout,
    stderr,
    terminated,
    terminationReason,
  }
}

function signalNumber(signal: NodeJS.Signals): number {
  const table: Record<string, number> = { SIGKILL: 9, SIGTERM: 15, SIGSEGV: 11, SIGABRT: 6 }
  return table[signal] ?? 1
}

export function destroyHolder(holder: Holder): void {
  for (const pid of [holder.initPid, holder.controlPid]) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* déjà mort */
    }
  }
}
