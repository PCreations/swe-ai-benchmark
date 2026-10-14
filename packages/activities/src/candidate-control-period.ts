// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — exercer et contrôler le code du candidat à chaque
// période (T51, ADR-009 L92-98, docs/specs/T51.md).
//
// CE QUE CE FICHIER FAIT (les livrables de L94, mot pour mot) :
//
//   « contrat `bench.candidate/2` aligné sur l'application scriptée » — les
//     cinq opérations ci-dessous (`create_tenant`/`advance_clock`/`write`/
//     `read`/`probe_cancel`/`fingerprint`) reprennent, sans les redéfinir, les
//     formes FIXÉES par `acceptance/T50.spec.ts` (section III), elles-mêmes
//     reprises par parallélisme avec `bench.candidate/1` (T48).
//
//   « adaptateur qui présente le processus du candidat aux contrôles
//     existants » — `runCandidateProcess` lance le CODE DU COMMIT DE FIN
//     (reprenant, à l'identique, la mécanique de restauration/sauvegarde de
//     dépôt par trajectoire de T48 : `restoreWorkspace`/`commitWorkspace`/
//     `persistWorkspaceArchive`) comme un VRAI sous-processus NDJSON ; AUCUN
//     chemin ne retombe sur une application scriptée interne — c'est
//     précisément le danger que T51.M1 nomme et que `ops-received.log`
//     (canal hors-contrat tenu par le candidat lui-même) rend observable de
//     l'extérieur.
//
//   « exécution du plan d'usages de la période et des contrôles » — le plan
//     d'usages INTERNE du scénario de démonstration (`F-RESERVATION`, repris
//     de `packages/scenario`) est joué contre le processus-candidat, period
//     par période ; les CINQ contrôles nommés par ADR-009:L34
//     (`reserve@1`/`idempotence@1`/`cancel@1`/`fifo@1`/`isolation@1`) sont
//     évalués en comparant ce que le processus a RÉELLEMENT répondu (`actual`)
//     à ce qu'un modèle de référence INDÉPENDANT, tenu par ce fichier seul et
//     JAMAIS interrogé par le monde, attend (`expected`) — jamais une
//     comparaison du candidat à lui-même.
//
//   « statuts persistés avec la période et agrégés dans le rapport de fin » —
//     chaque période persiste, dans PostgreSQL réel, son relevé complet des
//     cinq contrôles ; `candidateControlReport` relit l'historique d'une
//     trajectoire et en rend l'agrégat par période.
//
// UN CANDIDAT NON DÉPLOYÉ (démarrage manqué, délai dépassé, format violé) NE
// FAIT JAMAIS ÉCHOUER LA PÉRIODE (A3) : les cinq contrôles sont publiés,
// TOUS violés, jamais omis, et la trajectoire avance normalement à la
// période suivante.
//
// AUCUN FICHIER AUXILIAIRE N'EST ÉCRIT DANS L'ESPACE DE TRAVAIL DU CANDIDAT
// (A5) : ce moteur ne dépose ni l'oracle, ni les identifiants de contrôle, ni
// l'horloge d'une période future — la SEULE écriture disque sous
// `--candidate-workspace-root` est celle que `restoreWorkspace`/
// `commitWorkspace` font déjà pour T48 (dépôt git du candidat lui-même).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { getArtifact, openS3ArtifactStore, putArtifact, s3TestServiceConfig } from '@bench/storage'
import { RESERVATION_SETUP, SCRIPTED_PERIODS } from '@bench/scenario'
import type { ScriptedAction, ScriptedPeriod } from '@bench/scenario'
import { CANDIDATE_LAUNCH_COMMAND } from './candidate-protocol-v2.js'

/* ══════════════════════════════════ formes du contrat ═══════════════════ */

export interface CandidateControlPeriodInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly candidateWorkspaceRoot?: string | undefined
  readonly candidateCommand?: readonly string[] | undefined
  readonly candidateTimeoutMs?: number | undefined
}

export interface CandidateControlEntry {
  readonly id: string
  readonly status: 'satisfied' | 'violated'
  readonly actual: unknown
  readonly expected: unknown
}

export interface CandidateControlPeriodResult {
  readonly campaign_id: string
  readonly period_index: number
  readonly candidate: {
    readonly deployed: boolean
    readonly not_deployed_reason: string | null
    readonly workspace_dir: string | null
    readonly commit_sha: string | null
  }
  readonly controls: readonly CandidateControlEntry[]
}

export interface CandidateControlReportInput {
  readonly campaignId: string
  readonly postgresDatabase: string
}

export interface CandidateControlReportPeriod {
  readonly period_index: number
  readonly satisfied: number
  readonly violated: number
}

export interface CandidateControlReportResult {
  readonly campaign_id: string
  readonly periods: readonly CandidateControlReportPeriod[]
}

/** Les trois motifs de non-déploiement — REPRIS À L'IDENTIQUE de T48 (motifs de TRANSPORT). */
export const CANDIDATE_CONTROL_NOT_DEPLOYED_REASON = {
  START_FAILED: 'CANDIDATE_START_FAILED',
  TIMEOUT: 'CANDIDATE_TIMEOUT',
  PROTOCOL_VIOLATION: 'CANDIDATE_PROTOCOL_VIOLATION',
} as const

const DEFAULT_TIMEOUT_MS = 15_000

/** ADR-009:L34, verbatim — les cinq identifiants de contrôle, dans cet ordre. */
const CONTROL_IDS = ['reserve@1', 'idempotence@1', 'cancel@1', 'fifo@1', 'isolation@1'] as const
type ControlKey = (typeof CONTROL_IDS)[number]

/** Le locataire d'origine (`RESERVATION_SETUP.tenant`, F-RESERVATION) et celui que P4 révèle. */
const TENANT_ORIGIN = RESERVATION_SETUP.tenant
const TENANT_OTHER = 'other'

/** Les horloges métier des quatre périodes (F-RESERVATION, cahier:L125). */
const PERIOD_CLOCKS: readonly string[] = [
  '2030-01-01T00:00:00Z',
  '2030-01-01T01:00:00Z',
  '2030-01-02T11:00:00Z',
  '2030-01-02T13:00:00Z',
]

function clockForPeriod(periodIndex: number): string {
  const i = Math.min(Math.max(periodIndex, 1), PERIOD_CLOCKS.length) - 1
  return PERIOD_CLOCKS[i] as string
}

function scriptedPeriodFor(periodIndex: number): ScriptedPeriod {
  const i = Math.min(Math.max(periodIndex, 1), SCRIPTED_PERIODS.length) - 1
  return SCRIPTED_PERIODS[i] as ScriptedPeriod
}

/* ══════════════════════════════ PostgreSQL réel (psql) ═══════════════════
 * Même socle que candidate-period.ts (T48) : un DSN socket Unix, jamais le
 * driver `pg` (aucun n'est présent au lockfile).
 */

function socketDir(): string {
  const h = process.env['PGHOST']
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h
  return '/var/run/postgresql'
}

function pgUser(): string {
  return process.env['PGUSER'] ?? os.userInfo().username
}

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(pgUser())}@/${encodeURIComponent(db)}?host=${encodeURIComponent(socketDir())}`
}

function runPsql(db: string, sql: string): string {
  try {
    return execFileSync('psql', ['-tAqX', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `candidate-control-period.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(
        0,
        800,
      ),
    )
  }
}

const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

const TABLE = 'bench_candidate_control_trajectories'
const PERIODS_TABLE = 'bench_candidate_control_periods'

function ensureTables(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       campaign_id text PRIMARY KEY,
       period_index integer NOT NULL,
       workspace_ref text,
       commit_sha text,
       model_state jsonb NOT NULL DEFAULT '{}'::jsonb,
       control_state jsonb NOT NULL DEFAULT '{}'::jsonb,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${PERIODS_TABLE} (
       campaign_id text NOT NULL,
       period_index integer NOT NULL,
       controls jsonb NOT NULL,
       PRIMARY KEY (campaign_id, period_index)
     )`,
  )
}

/* ─────────────────────────────── le modèle de référence (INDÉPENDANT) ═══
 * Un modèle en mémoire tenu par CE FICHIER SEUL, jamais interrogé par le
 * monde, qui dit ce qu'une application CORRECTE devrait répondre — jamais ce
 * qu'elle a répondu. Même séparation de rôles que `createScriptedApplication`
 * / `createReferenceModel` de `packages/scenario/demo-application.ts`.
 */

interface ModelState {
  readonly ownerTenant: string | null
  readonly clock: string | null
  readonly holder: string | null
  readonly queue: ReadonlyArray<{ readonly actor: string; readonly admission_seq: number }>
  readonly cancelled: readonly string[]
  readonly seen: Readonly<Record<string, string>>
}

function emptyModelState(): ModelState {
  return { ownerTenant: null, clock: null, holder: null, queue: [], cancelled: [], seen: {} }
}

function isModelState(v: unknown): v is ModelState {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** F-RESERVATION : annulation acceptée au plus tard 24h avant le créneau, frontière incluse. */
const SLOT_BEGIN = '2030-01-03T12:00:00Z'
const BOUNDARY = '2030-01-02T12:00:00Z'

/** Décision du modèle pour une écriture, et l'état qui en résulte. */
function modelWrite(
  state: ModelState,
  op: string,
  actor: string,
  admissionSeq: number,
  operationKey: string,
): { readonly state: ModelState; readonly decision: string } {
  if (operationKey in state.seen) {
    return { state, decision: state.seen[operationKey] as string }
  }
  let decision: string
  let holder = state.holder
  let queue = state.queue
  let cancelled = state.cancelled
  if (op === 'reserve') {
    if (holder === null) {
      holder = actor
      decision = 'confirmed'
    } else if (holder === actor) {
      decision = 'confirmed'
    } else if (queue.some((q) => q.actor === actor)) {
      decision = 'waiting'
    } else {
      queue = [...queue, { actor, admission_seq: admissionSeq }].sort((a, b) => a.admission_seq - b.admission_seq)
      decision = 'waiting'
    }
  } else if (op === 'cancel') {
    if (holder !== actor) {
      decision = 'refused'
    } else if (state.clock !== null && Date.parse(state.clock) > Date.parse(BOUNDARY)) {
      decision = 'refused'
    } else {
      holder = null
      cancelled = [...cancelled, actor]
      const sorted = [...queue].sort((a, b) => a.admission_seq - b.admission_seq)
      const next = sorted[0]
      queue = sorted.slice(1)
      holder = next === undefined ? null : next.actor
      decision = 'cancelled'
    }
  } else {
    decision = 'UNKNOWN_SUB_OP'
  }
  const seen = { ...state.seen, [operationKey]: decision }
  return { state: { ...state, holder, queue, cancelled, seen }, decision }
}

/** Le modèle répond `null`/`refused`/un code de refus, JAMAIS en mutant l'état, pour `read`/`probe_cancel`. */
function modelStatusOf(state: ModelState, tenantId: string, key: string): { ok: boolean; code: string | null; value: unknown } {
  if (state.ownerTenant === null || tenantId !== state.ownerTenant) {
    return { ok: false, code: 'NOT_FOUND', value: null }
  }
  let value: unknown = null
  if (state.holder === key) {
    value = { status: 'confirmed' }
  } else {
    const pos = state.queue.findIndex((q) => q.actor === key)
    if (pos >= 0) value = { status: 'waiting', waiting_position: pos + 1 }
    else if (state.cancelled.includes(key)) value = { status: 'cancelled' }
  }
  return { ok: true, code: null, value }
}

/* ─────────────────────────── un canal NDJSON vers le processus-candidat ═══
 * REPRIS, sans le réinventer, de candidate-period.ts (T48) — même protocole
 * de transport (probe `{"ready":true}`, échange `{id,op,args}`/
 * `{id,ok,result|error}`), même trois motifs de non-déploiement.
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

type RpcOutcome =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
  | { readonly failure: 'TIMEOUT' | 'PROTOCOL_VIOLATION' }

/** Un processus-candidat `bench.candidate/2` démarré, prêt à échanger des requêtes. */
interface CandidateProcess {
  call(op: string, args: Readonly<Record<string, unknown>>): Promise<RpcOutcome>
  kill(): void
}

async function startCandidateProcess(
  command: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ readonly deployed: true; readonly process: CandidateProcess } | { readonly deployed: false; readonly reason: string }> {
  const cmd = command[0]
  if (cmd === undefined) {
    return { deployed: false, reason: CANDIDATE_CONTROL_NOT_DEPLOYED_REASON.START_FAILED }
  }
  const args = command.slice(1)
  const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  const channel = new LineChannel(child.stdout, (cb) => child.on('close', () => cb()))

  let killed = false
  const kill = (): void => {
    if (killed) return
    killed = true
    try {
      child.kill('SIGKILL')
    } catch {
      // best effort — le processus est peut-être déjà mort
    }
  }

  const write = (line: string): void => {
    try {
      child.stdin.write(`${line}\n`)
    } catch {
      // le processus a peut-être déjà fermé son entrée : l'échange suivant expirera proprement
    }
  }

  const probe = await channel.next(timeoutMs)
  if (probe.kind !== 'line') {
    kill()
    return { deployed: false, reason: CANDIDATE_CONTROL_NOT_DEPLOYED_REASON.START_FAILED }
  }
  let ready = false
  try {
    const parsed = JSON.parse(probe.line) as Record<string, unknown>
    ready = parsed['ready'] === true
  } catch {
    ready = false
  }
  if (!ready) {
    kill()
    return { deployed: false, reason: CANDIDATE_CONTROL_NOT_DEPLOYED_REASON.START_FAILED }
  }

  let seq = 0
  const nextId = (): string => {
    seq += 1
    return `req-${String(seq)}`
  }

  const call = async (op: string, opArgs: Readonly<Record<string, unknown>>): Promise<RpcOutcome> => {
    const id = nextId()
    write(JSON.stringify({ id, op, args: opArgs }))
    const ev = await channel.next(timeoutMs)
    if (ev.kind !== 'line') return { failure: 'TIMEOUT' }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(ev.line) as Record<string, unknown>
    } catch {
      return { failure: 'PROTOCOL_VIOLATION' }
    }
    if (parsed['id'] !== id || typeof parsed['ok'] !== 'boolean') {
      return { failure: 'PROTOCOL_VIOLATION' }
    }
    if (parsed['ok']) return { ok: true, result: parsed['result'] }
    const err = parsed['error']
    if (err === null || typeof err !== 'object') return { failure: 'PROTOCOL_VIOLATION' }
    const code = (err as Record<string, unknown>)['code']
    const message = (err as Record<string, unknown>)['message']
    if (typeof code !== 'string' || typeof message !== 'string') return { failure: 'PROTOCOL_VIOLATION' }
    return { ok: false, error: { code, message } }
  }

  return { deployed: true, process: { call, kill } }
}

/* ══════════════════════ espace de travail git réel (S3 réel) ══════════════
 * REPRIS À L'IDENTIQUE de candidate-period.ts (T48) — même mécanique de
 * restauration/sauvegarde par trajectoire, préfixée `t51/` pour ne jamais
 * recouvrir l'espace d'archive de T48 sous le même bucket.
 */

async function openWorkspaceStore(s3Bucket: string, campaignId: string): Promise<ReturnType<typeof openS3ArtifactStore>> {
  const cfg = await s3TestServiceConfig()
  return openS3ArtifactStore({ ...cfg, prefix: `t51/${s3Bucket}/${campaignId}` })
}

function workspaceSubdir(campaignId: string): string {
  return createHash('sha256').update(campaignId, 'utf8').digest('hex').slice(0, 24)
}

async function restoreWorkspace(
  root: string,
  campaignId: string,
  priorRef: string | null,
  s3Bucket: string,
): Promise<string> {
  fs.mkdirSync(root, { recursive: true })
  const dir = path.join(root, workspaceSubdir(campaignId))
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  if (priorRef !== null) {
    const store = await openWorkspaceStore(s3Bucket, campaignId)
    const bytes = await getArtifact(store, priorRef)
    execFileSync('tar', ['-xzf', '-', '-C', dir], {
      input: Buffer.from(bytes),
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'ignore', 'pipe'],
    })
  } else {
    execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] })
  }
  return dir
}

async function persistWorkspaceArchive(dir: string, s3Bucket: string, campaignId: string): Promise<string> {
  const bytes = execFileSync('tar', ['-czf', '-', '-C', dir, '.'], {
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const store = await openWorkspaceStore(s3Bucket, campaignId)
  const manifest = await putArtifact(store, bytes)
  return manifest.ref
}

function commitWorkspace(dir: string, periodIndex: number): string {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] })
  execFileSync(
    'git',
    [
      '-c',
      'user.email=bench-candidate@bench.test',
      '-c',
      'user.name=bench-candidate',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      `period ${String(periodIndex)}`,
    ],
    { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/* ═══════════════════════════ pointeur de trajectoire (PostgreSQL) ═══════ */

interface TrajectoryPointer {
  readonly periodIndex: number
  readonly workspaceRef: string | null
  readonly commitSha: string | null
  readonly modelState: ModelState
  readonly controlState: Readonly<Record<ControlKey, { readonly actual: unknown; readonly expected: unknown }>>
}

function emptyControlState(): Readonly<Record<ControlKey, { readonly actual: unknown; readonly expected: unknown }>> {
  const out: Record<string, { actual: unknown; expected: unknown }> = {}
  for (const id of CONTROL_IDS) out[id] = { actual: null, expected: null }
  return out as Readonly<Record<ControlKey, { readonly actual: unknown; readonly expected: unknown }>>
}

function readPointer(db: string, campaignId: string): TrajectoryPointer | null {
  const head = runPsql(
    db,
    `SELECT period_index, coalesce(workspace_ref,''), coalesce(commit_sha,'') FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`,
  )
  if (head === '') return null
  const [periodRaw, workspaceRefRaw, commitShaRaw] = head.split('|')
  const periodIndex = Number.parseInt(periodRaw ?? '', 10)
  if (!Number.isInteger(periodIndex)) return null
  const stateRaw = runPsql(db, `SELECT model_state::text FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`)
  let modelState = emptyModelState()
  try {
    const parsed = JSON.parse(stateRaw) as unknown
    if (isModelState(parsed)) modelState = { ...emptyModelState(), ...parsed }
  } catch {
    // garde l'état vide — une ligne illisible ne doit jamais faire échouer la lecture du pointeur
  }
  const controlRaw = runPsql(db, `SELECT control_state::text FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`)
  let controlState = emptyControlState()
  try {
    const parsed = JSON.parse(controlRaw) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed as object).length > 0) {
      controlState = { ...emptyControlState(), ...(parsed as Record<string, { actual: unknown; expected: unknown }>) }
    }
  } catch {
    // idem
  }
  return {
    periodIndex,
    workspaceRef: workspaceRefRaw === undefined || workspaceRefRaw === '' ? null : workspaceRefRaw,
    commitSha: commitShaRaw === undefined || commitShaRaw === '' ? null : commitShaRaw,
    modelState,
    controlState,
  }
}

function writePointer(
  db: string,
  campaignId: string,
  periodIndex: number,
  workspaceRef: string | null,
  commitSha: string | null,
  modelState: ModelState,
  controlState: Readonly<Record<ControlKey, { readonly actual: unknown; readonly expected: unknown }>>,
): void {
  runPsql(
    db,
    `INSERT INTO ${TABLE}(campaign_id, period_index, workspace_ref, commit_sha, model_state, control_state)
       VALUES (
         ${sqlLit(campaignId)}, ${String(periodIndex)},
         ${workspaceRef === null ? 'NULL' : sqlLit(workspaceRef)},
         ${commitSha === null ? 'NULL' : sqlLit(commitSha)},
         ${sqlLit(JSON.stringify(modelState))}::jsonb,
         ${sqlLit(JSON.stringify(controlState))}::jsonb
       )
     ON CONFLICT (campaign_id) DO UPDATE SET
       period_index = EXCLUDED.period_index,
       workspace_ref = EXCLUDED.workspace_ref,
       commit_sha = EXCLUDED.commit_sha,
       model_state = EXCLUDED.model_state,
       control_state = EXCLUDED.control_state,
       updated_at = now()`,
  )
}

function writePeriodControls(db: string, campaignId: string, periodIndex: number, controls: readonly CandidateControlEntry[]): void {
  runPsql(
    db,
    `INSERT INTO ${PERIODS_TABLE}(campaign_id, period_index, controls)
       VALUES (${sqlLit(campaignId)}, ${String(periodIndex)}, ${sqlLit(JSON.stringify(controls))}::jsonb)
     ON CONFLICT (campaign_id, period_index) DO UPDATE SET controls = EXCLUDED.controls`,
  )
}

function readAllPeriodControls(db: string, campaignId: string): Map<number, CandidateControlEntry[]> {
  const out = new Map<number, CandidateControlEntry[]>()
  const raw = runPsql(
    db,
    `SELECT period_index, controls::text FROM ${PERIODS_TABLE} WHERE campaign_id = ${sqlLit(campaignId)} ORDER BY period_index`,
  )
  if (raw === '') return out
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    const sep = line.indexOf('|')
    if (sep < 0) continue
    const periodIndex = Number.parseInt(line.slice(0, sep), 10)
    if (!Number.isInteger(periodIndex)) continue
    try {
      const controls = JSON.parse(line.slice(sep + 1)) as CandidateControlEntry[]
      out.set(periodIndex, controls)
    } catch {
      // ligne illisible : jamais une cause d'échec du rapport
    }
  }
  return out
}

/* ════════════════════ traduction de l'action scriptée → bench.candidate/2 ═ */

function argsForAction(action: ScriptedAction, tenant: string): { readonly op: string; readonly args: Record<string, unknown> } {
  if (action.kind === 'write') {
    return {
      op: 'write',
      args: {
        op: action.operation,
        actor: action.actor,
        tenant_id: tenant,
        admission_seq: action.sequence,
        operation_key: action.idempotency_key,
      },
    }
  }
  return { op: 'read', args: { tenant_id: tenant, key: action.actor } }
}

type ControlStateMap = Record<ControlKey, { readonly actual: unknown; readonly expected: unknown }>

/**
 * Évalue UN usage scripté (une entrée de `scripted.actions`) contre le
 * processus-candidat, et rend l'état (modèle + contrôles) qui en résulte --
 * extrait, SANS CHANGEMENT DE COMPORTEMENT, du corps de boucle que
 * `candidateControlPeriodOnce` (T51) exerçait déjà seul, pour que
 * `controlCandidateCommitOnce` (T52, ci-dessous) le réutilise SANS LE
 * RÉINVENTER sur la totalité de `SCRIPTED_PERIODS` en un seul passage.
 * `call` porte déjà, par fermeture, la bascule `deployed` (voir les deux
 * appelants) ; `isDeployed` la relit après un échange qui pourrait l'avoir
 * fait basculer.
 */
async function applyScriptedUsage(
  usageId: string,
  action: ScriptedAction,
  modelState: ModelState,
  controlState: ControlStateMap,
  call: (op: string, args: Readonly<Record<string, unknown>>) => Promise<RpcOutcome | null>,
  isDeployed: () => boolean,
): Promise<{ readonly modelState: ModelState; readonly controlState: ControlStateMap }> {
  const tenant = action.tenant
  const { op, args } = argsForAction(action, tenant)
  const outcome = await call(op, args)
  if (!isDeployed()) return { modelState, controlState }

  if (action.kind === 'write') {
    const r = modelWrite(modelState, action.operation, action.actor, action.sequence, action.idempotency_key)
    const nextModelState = r.state
    const expectedDecision = r.decision
    const actualDecision =
      outcome !== null && 'ok' in outcome && outcome.ok
        ? ((outcome.result as { decision?: unknown } | undefined)?.decision ?? null)
        : { error: outcome !== null && 'error' in outcome ? outcome.error.code : null }

    let nextControlState = controlState
    if (usageId === 'reserve-A') {
      nextControlState = { ...nextControlState, 'reserve@1': { actual: actualDecision, expected: expectedDecision } }
    } else if (usageId === 'replay-A') {
      nextControlState = { ...nextControlState, 'idempotence@1': { actual: actualDecision, expected: expectedDecision } }
    } else if (usageId === 'annulation-A') {
      nextControlState = { ...nextControlState, 'cancel@1': { actual: actualDecision, expected: expectedDecision } }
      // La PROMOTION FIFO qui résulte de cette annulation (le prochain de
      // la file, ordonné par séquence d'admission — jamais un ordre
      // d'arrivée implicite) : son statut, lu des deux côtés.
      const promoted = nextModelState.holder
      if (promoted !== null) {
        const expectedPromoted = modelStatusOf(nextModelState, TENANT_ORIGIN, promoted)
        const readOutcome = await call('read', { tenant_id: TENANT_ORIGIN, key: promoted })
        if (isDeployed()) {
          const actualPromoted =
            readOutcome !== null && 'ok' in readOutcome && readOutcome.ok
              ? ((readOutcome.result as { value?: unknown } | undefined)?.value ?? null)
              : { error: readOutcome !== null && 'error' in readOutcome ? readOutcome.error.code : null }
          nextControlState = { ...nextControlState, 'fifo@1': { actual: actualPromoted, expected: expectedPromoted.value } }
        }
      }
    }
    return { modelState: nextModelState, controlState: nextControlState }
  }

  // Lecture : `sonde-intertenant` (ADR-009:L34 isolation@1) compare
  // directement le refus attendu (modèle, toujours fidèle à
  // `ownerTenant`) à ce que le candidat a réellement répondu.
  const expectedRead = modelStatusOf(modelState, tenant, action.actor)
  const actualRead =
    outcome !== null && 'ok' in outcome && outcome.ok
      ? { ok: true, code: null }
      : { ok: false, code: outcome !== null && 'error' in outcome ? outcome.error.code : null }
  let nextControlState = controlState
  if (usageId === 'sonde-intertenant') {
    nextControlState = {
      ...nextControlState,
      'isolation@1': { actual: actualRead, expected: { ok: expectedRead.ok, code: expectedRead.code } },
    }
  }
  return { modelState, controlState: nextControlState }
}

/* ══════════════════════════════════════════════════════════════════ l'orchestrateur */

/**
 * Avance la trajectoire `campaignId` d'EXACTEMENT une période (ADR-009
 * L92-98) : restaure l'espace de travail (A1/A2 de T48, repris à
 * l'identique), lance le code du commit de fin comme un VRAI processus
 * `bench.candidate/2`, joue le plan d'usages INTERNE de la période (plan
 * F-RESERVATION) contre lui, évalue les cinq contrôles nommés en comparant
 * ce que le processus a répondu à un modèle de référence indépendant, puis
 * sauvegarde (commit git + archive S3 + pointeur PostgreSQL + relevé de la
 * période). L'état persistant est lu par cette fonction elle-même, jamais
 * fourni par l'appelant.
 */
export async function candidateControlPeriodOnce(
  input: CandidateControlPeriodInput,
): Promise<CandidateControlPeriodResult> {
  const db = input.postgresDatabase
  const campaignId = input.campaignId
  ensureTables(db)
  const pointer = readPointer(db, campaignId)
  const periodIndex = pointer === null ? 1 : pointer.periodIndex + 1
  const timeoutMs = input.candidateTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const command = input.candidateCommand

  let workspaceDir: string | null = null
  if (input.candidateWorkspaceRoot !== undefined) {
    workspaceDir = await restoreWorkspace(input.candidateWorkspaceRoot, campaignId, pointer?.workspaceRef ?? null, input.s3Bucket)
  }

  let modelState = pointer?.modelState ?? emptyModelState()
  let controlState: Record<ControlKey, { actual: unknown; expected: unknown }> = {
    ...(pointer?.controlState ?? emptyControlState()),
  }

  const scripted = scriptedPeriodFor(periodIndex)
  const clock = clockForPeriod(periodIndex)

  // (1) L'horloge métier et la création de locataire que la révélation de
  // cette période décide — JAMAIS celle d'une période future (A5).
  modelState = { ...modelState, clock }
  if (periodIndex === 1) {
    modelState = { ...modelState, ownerTenant: modelState.ownerTenant ?? TENANT_ORIGIN }
  }

  const cwd = workspaceDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'bench-candidate-control-'))

  let deployed = true
  let notDeployedReason: string | null = null
  let candidateProcess: CandidateProcess | null = null

  if (command === undefined) {
    deployed = false
    notDeployedReason = CANDIDATE_CONTROL_NOT_DEPLOYED_REASON.START_FAILED
  } else {
    const started = await startCandidateProcess(command, cwd, timeoutMs)
    if (!started.deployed) {
      deployed = false
      notDeployedReason = started.reason
    } else {
      candidateProcess = started.process
    }
  }

  /** Appelle le candidat ; toute défaillance mi-parcours bascule `deployed=false`. */
  const call = async (op: string, args: Readonly<Record<string, unknown>>): Promise<RpcOutcome | null> => {
    if (candidateProcess === null) return null
    const r = await candidateProcess.call(op, args)
    if ('failure' in r) {
      deployed = false
      notDeployedReason =
        r.failure === 'TIMEOUT'
          ? CANDIDATE_CONTROL_NOT_DEPLOYED_REASON.TIMEOUT
          : CANDIDATE_CONTROL_NOT_DEPLOYED_REASON.PROTOCOL_VIOLATION
      candidateProcess.kill()
      candidateProcess = null
      return null
    }
    return r
  }

  if (deployed) {
    await call('create_tenant', { tenant_id: TENANT_ORIGIN })
    if (periodIndex === 4) await call('create_tenant', { tenant_id: TENANT_OTHER })
    await call('advance_clock', { to: clock })

    // Évaluation PARTAGÉE (T52, `applyScriptedUsage`, ci-dessus) — même
    // comportement qu'avant l'extraction, jamais réinventé.
    for (const [usageId, action] of Object.entries(scripted.actions)) {
      if (!deployed) break
      const r = await applyScriptedUsage(usageId, action, modelState, controlState, call, () => deployed)
      modelState = r.modelState
      controlState = r.controlState
    }
  }

  let newCommitSha: string | null = null
  if (deployed) {
    if (candidateProcess !== null) candidateProcess.kill()
    if (workspaceDir !== null) newCommitSha = commitWorkspace(workspaceDir, periodIndex)
  }

  let workspaceRef = pointer?.workspaceRef ?? null
  if (workspaceDir !== null) {
    workspaceRef = await persistWorkspaceArchive(workspaceDir, input.s3Bucket, campaignId)
  }
  const commitSha = newCommitSha ?? pointer?.commitSha ?? null

  writePointer(db, campaignId, periodIndex, workspaceRef, commitSha, modelState, controlState)

  // (A3) Un candidat NON DÉPLOYÉ : les cinq contrôles sont publiés, TOUS
  // violés, jamais omis — quel que soit l'état porté depuis une période
  // antérieure.
  const controls: CandidateControlEntry[] = CONTROL_IDS.map((id) => {
    if (!deployed) {
      return { id, status: 'violated', actual: 'CANDIDATE_NOT_DEPLOYED', expected: controlState[id].expected }
    }
    const entry = controlState[id]
    const satisfied = deepEqualCanonical(entry.actual, entry.expected)
    return { id, status: satisfied ? 'satisfied' : 'violated', actual: entry.actual, expected: entry.expected }
  })

  writePeriodControls(db, campaignId, periodIndex, controls)

  return {
    campaign_id: campaignId,
    period_index: periodIndex,
    candidate: {
      deployed,
      not_deployed_reason: notDeployedReason,
      workspace_dir: workspaceDir,
      commit_sha: commitSha,
    },
    controls,
  }
}

/* ═══════════════ contrôle direct du commit d'UNE période (T52, ADR-010) ═══
 *
 * CE QUE CE BLOC AJOUTE, ET POURQUOI JAMAIS `restoreWorkspace`/
 * `candidateControlPeriodOnce` CI-DESSUS (destinés à `bench
 * candidate-control-period`, T51, qui restaure SON PROPRE espace de travail
 * depuis SON PROPRE préfixe S3 `t51/`) : ADR-010 (« Ce que la relecture a
 * trouvé », point 2) nomme PRÉCISÉMENT ce danger pour `pilot-conduct` --
 * contrôler un espace de travail SANS RAPPORT avec le commit de fin que la
 * session claude-cli vient de produire (`./run-period-claude-cli.ts`, T49).
 *
 * `controlCandidateCommitOnce` contrôle donc le commit DONNÉ PAR L'APPELANT
 * (`pilot-conduct`, `./pilot-conduct.ts`) -- jamais un pointeur relu depuis
 * PostgreSQL, jamais une restauration S3 -- en matérialisant l'arbre EXACT de
 * ce commit (`git archive`, hors de toute écriture dans le dépôt de la
 * session) dans un répertoire JETABLE, distinct du dépôt de la session : le
 * candidat contrôlé ne peut donc jamais laisser de fichier auxiliaire
 * (`state.json`, `ops-received.log`) dans l'espace de travail que la période
 * SUIVANTE committera (A4).
 *
 * UN VERDICT COMPLET, INDÉPENDANT, PAR PÉRIODE (A2/A3) -- jamais un pointeur
 * qui avance de 1 à chaque appel (à la différence de
 * `candidateControlPeriodOnce`/T51, qui avance une trajectoire de contrôle
 * PROPRE période par période) : chaque appel rejoue la totalité de
 * `SCRIPTED_PERIODS` (les quatre périodes métier F-RESERVATION) contre UN
 * SEUL processus-candidat frais, pour que le relevé des cinq contrôles
 * (ADR-009:L34) soit le même, qu'on contrôle le commit de la période 1 ou
 * celui de la période 2 d'une MÊME trajectoire -- exactement la propriété
 * qu'exige acceptance/T52.spec.ts (A2 : répartition nominale `(5,0)`/fautive
 * `(4,1)` identique À CHAQUE période persistée).
 *
 * PERSISTANCE PARTAGÉE AVEC `candidate-control-report` (A5) : ce bloc écrit
 * dans LA MÊME table (`writePeriodControls`, ci-dessus), sous l'identité de
 * TRAJECTOIRE que `pilot-conduct` dérive déjà (`trajectory_key`) -- jamais
 * une table propre à T52 -- pour qu'un appel ULTÉRIEUR et DIRECT de `bench
 * candidate-control-report --campaign-id <trajectory_key>` (T51, DÉJÀ
 * PROUVÉ) lise la MÊME trajectoire de contrôle que celle que `pilot-conduct`
 * vient d'écrire.
 */

export interface ControlCandidateCommitInput {
  /** L'identité de TRAJECTOIRE (`trajectory_key`), PARTAGÉE avec
   *  `candidate-control-report` -- jamais l'identité de CAMPAGNE que
   *  `pilot-conduct` connaît en plus (voir `./pilot-conduct.ts`). */
  readonly campaignId: string
  readonly postgresDatabase: string
  /** L'indice de la période SESSION (T49) dont ce commit est la fin --
   *  jamais un pointeur auto-incrémenté : fourni par l'appelant. */
  readonly periodIndex: number
  /** Le dépôt git de LA SESSION (T49/`./run-period-claude-cli.ts`) --
   *  JAMAIS restauré ni ré-archivé ici ; seul `commitSha` y est lu, par
   *  `git archive`, dans un répertoire jetable. */
  readonly workspaceDir: string
  readonly commitSha: string
  /** Convention de lancement (ADR-010 L42-44, `./candidate-protocol-v2.ts`)
   *  -- un défaut, jamais un nouveau drapeau `bench pilot-conduct`. */
  readonly candidateCommand?: readonly string[] | undefined
  readonly candidateTimeoutMs?: number | undefined
}

export interface ControlCandidateCommitResult {
  readonly campaign_id: string
  readonly period_index: number
  readonly controls: readonly CandidateControlEntry[]
}

/** Matérialise l'arbre EXACT de `commitSha` (jamais l'état courant, non
 *  committé, du dépôt) dans un répertoire JETABLE -- `git archive`, hors de
 *  toute écriture dans `workspaceDir` lui-même (A4 : aucun fichier
 *  auxiliaire du candidat contrôlé ne doit atteindre le dépôt de la
 *  session). */
function materializeCommitTree(workspaceDir: string, commitSha: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-candidate-control-commit-'))
  const archive = execFileSync('git', ['-C', workspaceDir, 'archive', commitSha], {
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  execFileSync('tar', ['-xf', '-', '-C', dir], {
    input: archive,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['pipe', 'ignore', 'pipe'],
  })
  return dir
}

/**
 * Lance et contrôle, EN UN SEUL PROCESSUS CANDIDAT FRAIS, le code du commit
 * `commitSha` (le commit de fin produit par la session de CETTE période,
 * T49) -- rejoue la totalité du plan d'usages F-RESERVATION
 * (`SCRIPTED_PERIODS`), évalue les cinq contrôles nommés par ADR-009:L34, et
 * persiste le relevé sous `campaignId` (A2/A3/A5, voir l'en-tête du bloc).
 * Un candidat NON DÉPLOYÉ (démarrage manqué, délai dépassé, format violé) NE
 * LÈVE JAMAIS : les cinq contrôles sont publiés, TOUS violés (même
 * discipline que `candidateControlPeriodOnce`, A3 de T51).
 */
export async function controlCandidateCommitOnce(
  input: ControlCandidateCommitInput,
): Promise<ControlCandidateCommitResult> {
  const db = input.postgresDatabase
  const campaignId = input.campaignId
  const periodIndex = input.periodIndex
  ensureTables(db)
  const timeoutMs = input.candidateTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const command = input.candidateCommand ?? CANDIDATE_LAUNCH_COMMAND

  const cwd = materializeCommitTree(input.workspaceDir, input.commitSha)
  try {
    let modelState: ModelState = { ...emptyModelState(), ownerTenant: TENANT_ORIGIN }
    let controlState: ControlStateMap = emptyControlState()

    let deployed = true
    let candidateProcess: CandidateProcess | null = null

    const started = await startCandidateProcess(command, cwd, timeoutMs)
    if (!started.deployed) {
      deployed = false
    } else {
      candidateProcess = started.process
    }

    const call = async (op: string, opArgs: Readonly<Record<string, unknown>>): Promise<RpcOutcome | null> => {
      if (candidateProcess === null) return null
      const r = await candidateProcess.call(op, opArgs)
      if ('failure' in r) {
        deployed = false
        candidateProcess.kill()
        candidateProcess = null
        return null
      }
      return r
    }

    if (deployed) {
      await call('create_tenant', { tenant_id: TENANT_ORIGIN })
      for (const scripted of SCRIPTED_PERIODS) {
        if (!deployed) break
        const clock = clockForPeriod(scripted.period_index)
        modelState = { ...modelState, clock }
        if (scripted.period_index === 4) await call('create_tenant', { tenant_id: TENANT_OTHER })
        await call('advance_clock', { to: clock })

        for (const [usageId, action] of Object.entries(scripted.actions)) {
          if (!deployed) break
          const r = await applyScriptedUsage(usageId, action, modelState, controlState, call, () => deployed)
          modelState = r.modelState
          controlState = r.controlState
        }
      }
    }

    if (candidateProcess !== null) candidateProcess.kill()

    // (A3 de T51, reprise à l'identique) : un candidat NON DÉPLOYÉ publie les
    // cinq contrôles TOUS violés, jamais omis.
    const controls: CandidateControlEntry[] = CONTROL_IDS.map((id) => {
      if (!deployed) {
        return { id, status: 'violated', actual: 'CANDIDATE_NOT_DEPLOYED', expected: controlState[id].expected }
      }
      const entry = controlState[id]
      const satisfied = deepEqualCanonical(entry.actual, entry.expected)
      return { id, status: satisfied ? 'satisfied' : 'violated', actual: entry.actual, expected: entry.expected }
    })

    writePeriodControls(db, campaignId, periodIndex, controls)

    return { campaign_id: campaignId, period_index: periodIndex, controls }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}

/** Lit l'état persistant d'UNE trajectoire et en rend l'agrégat par période. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function candidateControlReport(input: CandidateControlReportInput): Promise<CandidateControlReportResult> {
  const db = input.postgresDatabase
  ensureTables(db)
  const all = readAllPeriodControls(db, input.campaignId)
  const periods: CandidateControlReportPeriod[] = [...all.keys()]
    .sort((a, b) => a - b)
    .map((periodIndex) => {
      const controls = all.get(periodIndex) as CandidateControlEntry[]
      const satisfied = controls.filter((c) => c.status === 'satisfied').length
      const violated = controls.filter((c) => c.status === 'violated').length
      return { period_index: periodIndex, satisfied, violated }
    })
  return { campaign_id: input.campaignId, periods }
}

/* ─────────────────────────────────────────────────────── égalité profonde */

/** cahier:L82 — objets JSON triés RÉCURSIVEMENT par clé, ordre des tableaux conservé. */
function canonicalValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalValue)
  if (v !== null && typeof v === 'object') {
    const obj = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj).sort()) out[k] = canonicalValue(obj[k])
    return out
  }
  return v
}

function deepEqualCanonical(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b))
}
