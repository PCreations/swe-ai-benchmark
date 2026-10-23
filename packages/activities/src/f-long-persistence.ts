// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T63, ADR-018 decision point 2 (L46-49) et livrables
// L190-L196 : un repertoire de donnees passe au candidat par BENCH_DATA_DIR,
// conserve de P1 a P12 a travers des redemarrages reels du processus
// candidat ; les sondes de frontiere s'appliquent a des copies jetables de ce
// repertoire, jamais a l'original.
//
// DEUX ROLES, chacun un APPEL = UN PROCESSUS CANDIDAT NEUF (jamais de
// processus garde en vie entre deux appels — acceptance/T63.spec.ts, IV.1/
// IV.2) :
//   - runFLongPeriod  : lance le candidat avec BENCH_DATA_DIR pointee SUR LE
//     REPERTOIRE DONNE, sans jamais le copier — la trajectoire principale.
//   - runFLongProbe   : lance le candidat avec BENCH_DATA_DIR pointee sur une
//     COPIE JETABLE de ce repertoire (copiee ICI, par ce fichier, AVANT le
//     demarrage du processus) — les sondes de frontiere ; l'original n'est
//     jamais touche par le processus sonde, qui ne voit que sa copie.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/* ══════════════════════════════ formes du contrat ═══════════════════════
 * Fixees par acceptance/T63.spec.ts, section II.2 (aucune source ne les
 * impose — ADR-001) : `candidateCommand` est l'argv du processus candidat,
 * `benchDataDir` le repertoire que la fonction resolue DOIT positionner par
 * la variable d'environnement BENCH_DATA_DIR du processus qu'elle lance.
 */

export interface FLongPeriodOperation {
  readonly id: string
  readonly op: string
  readonly args?: Record<string, unknown>
}

export interface FLongPeriodOperationResult {
  readonly id: string
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: { readonly code?: string; readonly message?: string }
}

export interface RunFLongPeriodInput {
  readonly candidateCommand: readonly string[]
  readonly benchDataDir: string
  readonly ops: readonly FLongPeriodOperation[]
  readonly timeoutMs?: number
  /** T66 — repertoire courant du processus candidat (par defaut : celui du
   *  moteur). Le pilote F-LONG y passe l'espace de travail de la session, pour
   *  qu'un candidat qui lit des fichiers relatifs a son depot les trouve. */
  readonly cwd?: string
}

export interface RunFLongPeriodResult {
  readonly responses: readonly FLongPeriodOperationResult[]
}

const DEFAULT_TIMEOUT_MS = 20_000

/* ═══════════════ echange NDJSON avec un processus candidat NEUF ═════════
 * Protocole `bench.candidate/1` (repris a l'identique d'acceptance/fixtures/
 * candidates/reference-app.mjs, T48) : probe de demarrage `{ready:true,
 * protocol:"bench.candidate/1"}` puis NDJSON `{id,op,args}` ->
 * `{id,ok,...}`. Un SEUL processus est lance par appel ; toutes les `ops`
 * de cet appel lui sont adressees dans l'ordre, puis le processus est
 * termine — c'est ce qui rend chaque appel a `runFLongPeriod`/`runFLongProbe`
 * une PERIODE SEPAREE (acceptance/T63.spec.ts, IV.1).
 */

type ChannelEvent = { readonly kind: 'line'; readonly line: string } | { readonly kind: 'closed' } | { readonly kind: 'timeout' }

class LineChannel {
  private readonly queue: string[] = []
  private closed = false
  private waiter: ((e: ChannelEvent) => void) | null = null

  constructor(stdout: NodeJS.ReadableStream, registerClose: (cb: () => void) => void) {
    let partial = ''
    stdout.on('data', (d: Buffer) => {
      partial += d.toString('utf8')
      let idx = partial.indexOf('\n')
      while (idx >= 0) {
        const line = partial.slice(0, idx)
        partial = partial.slice(idx + 1)
        this.deliverLine(line)
        idx = partial.indexOf('\n')
      }
    })
    registerClose(() => {
      this.closed = true
      this.deliverClosed()
    })
  }

  private deliverLine(line: string): void {
    if (this.waiter !== null) {
      const w = this.waiter
      this.waiter = null
      w({ kind: 'line', line })
    } else {
      this.queue.push(line)
    }
  }

  private deliverClosed(): void {
    if (this.waiter !== null) {
      const w = this.waiter
      this.waiter = null
      w({ kind: 'closed' })
    }
  }

  async next(timeoutMs: number): Promise<ChannelEvent> {
    if (this.queue.length > 0) return { kind: 'line', line: this.queue.shift() as string }
    if (this.closed) return { kind: 'closed' }
    return new Promise<ChannelEvent>((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null
        resolve({ kind: 'timeout' })
      }, timeoutMs)
      this.waiter = (e): void => {
        clearTimeout(timer)
        resolve(e)
      }
    })
  }
}

function errorResultFor(id: string, code: string, message: string): FLongPeriodOperationResult {
  return { id, ok: false, error: { code, message } }
}

/**
 * Lance `command` avec `BENCH_DATA_DIR=<dataDir>` dans son environnement,
 * attend la probe de demarrage, echange `ops` dans l'ordre (un seul message
 * a la fois, reponse attendue avant la requete suivante), puis termine le
 * processus. Si le candidat ne demarre pas, ou ne repond pas a une
 * operation, les operations restantes recoivent une reponse d'echec — jamais
 * une exception qui ferait echouer tout l'appel.
 */
async function exchangeWithFreshProcess(
  command: readonly string[],
  dataDir: string,
  ops: readonly FLongPeriodOperation[],
  timeoutMs: number,
  cwd?: string,
): Promise<RunFLongPeriodResult> {
  const cmd = command[0]
  if (cmd === undefined) {
    return { responses: ops.map((op) => errorResultFor(op.id, 'START_FAILED', 'candidateCommand vide')) }
  }
  const args = command.slice(1)
  const child = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, BENCH_DATA_DIR: dataDir },
    ...(cwd !== undefined ? { cwd } : {}),
  })

  const channel = new LineChannel(child.stdout, (cb) => child.on('close', () => cb()))

  let killed = false
  const kill = (): void => {
    if (killed) return
    killed = true
    try {
      child.kill('SIGKILL')
    } catch {
      // best effort — le processus est peut-etre deja mort
    }
  }

  let spawnErrorMessage: string | null = null
  child.once('error', (e) => {
    spawnErrorMessage = String((e as Error).message)
  })

  const probe = await channel.next(timeoutMs)
  let ready = false
  if (probe.kind === 'line') {
    try {
      const parsed = JSON.parse(probe.line) as Record<string, unknown>
      ready = parsed['ready'] === true
    } catch {
      ready = false
    }
  }
  if (!ready) {
    kill()
    const message = spawnErrorMessage ?? "le candidat n'a pas emis de probe de demarrage valide"
    return { responses: ops.map((op) => errorResultFor(op.id, 'START_FAILED', message)) }
  }

  const responses: FLongPeriodOperationResult[] = []
  for (const op of ops) {
    try {
      child.stdin.write(`${JSON.stringify({ id: op.id, op: op.op, args: op.args ?? {} })}\n`)
    } catch (e) {
      responses.push(errorResultFor(op.id, 'WRITE_FAILED', String((e as Error).message)))
      continue
    }
    const ev = await channel.next(timeoutMs)
    if (ev.kind === 'closed') {
      responses.push(errorResultFor(op.id, 'PROCESS_CLOSED', 'le processus candidat a ferme sa sortie standard'))
      continue
    }
    if (ev.kind === 'timeout') {
      responses.push(errorResultFor(op.id, 'TIMEOUT', `aucune reponse recue pour ${op.id} avant ${String(timeoutMs)}ms`))
      continue
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(ev.line) as Record<string, unknown>
    } catch {
      responses.push(errorResultFor(op.id, 'PROTOCOL_VIOLATION', `reponse non-JSON : ${ev.line}`))
      continue
    }
    if (parsed['ok'] === true) {
      responses.push({ id: op.id, ok: true, result: parsed['result'] })
    } else if (parsed['ok'] === false) {
      const err = parsed['error']
      const code = err !== null && typeof err === 'object' ? (err as Record<string, unknown>)['code'] : undefined
      const message = err !== null && typeof err === 'object' ? (err as Record<string, unknown>)['message'] : undefined
      const errorObj: { code?: string; message?: string } = {}
      if (typeof code === 'string') errorObj.code = code
      if (typeof message === 'string') errorObj.message = message
      responses.push({ id: op.id, ok: false, error: errorObj })
    } else {
      responses.push(errorResultFor(op.id, 'PROTOCOL_VIOLATION', `reponse malformee : ${ev.line}`))
    }
  }

  try {
    child.stdin.end()
  } catch {
    // le processus a peut-etre deja ferme son entree
  }
  kill()

  return { responses }
}

/**
 * « period runner » (ADR-018 L46-49) — lance le processus candidat avec
 * `BENCH_DATA_DIR=<benchDataDir>` positionnee sur le repertoire DONNE, SANS
 * jamais le copier : la trajectoire principale, d'une periode a l'autre.
 */
export async function runFLongPeriod(input: RunFLongPeriodInput): Promise<RunFLongPeriodResult> {
  fs.mkdirSync(input.benchDataDir, { recursive: true })
  return exchangeWithFreshProcess(
    input.candidateCommand,
    input.benchDataDir,
    input.ops,
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    input.cwd,
  )
}

/**
 * « probe runner » (ADR-018 L46-49) — lance le processus candidat avec
 * `BENCH_DATA_DIR` pointee sur une COPIE JETABLE de `benchDataDir`, de sorte
 * que l'original ne soit jamais touche : les sondes de frontiere. La copie
 * est faite ICI, avant le demarrage du processus — jamais par l'appelant
 * (acceptance/T63.spec.ts, IV.3 : seul un clonage FAIT PAR LE MOTEUR prouve
 * l'isolation du moteur).
 */
export async function runFLongProbe(input: RunFLongPeriodInput): Promise<RunFLongPeriodResult> {
  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-flong-probe-'))
  try {
    fs.mkdirSync(input.benchDataDir, { recursive: true })
    fs.cpSync(input.benchDataDir, copyDir, { recursive: true })
    return await exchangeWithFreshProcess(
      input.candidateCommand,
      copyDir,
      input.ops,
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      input.cwd,
    )
  } finally {
    try {
      fs.rmSync(copyDir, { recursive: true, force: true })
    } catch {
      // nettoyage best-effort du repertoire jetable
    }
  }
}
