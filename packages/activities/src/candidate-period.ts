// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — donner au candidat un espace de travail et un contrat
// d'application (T48, ADR-008 L139-L145, docs/specs/T48.md).
//
// CE QUE CE FICHIER FAIT (les livrables de L141, mot pour mot) :
//
//   « un depot git par trajectoire, restaure au debut de chaque periode
//     depuis l'etat persistant et sauvegarde a la fin » — `restoreWorkspace`
//     et `persistWorkspaceArchive` ci-dessous : le repertoire de travail
//     local n'est JAMAIS une source de vérité (acceptance/T48.spec.ts, A1,
//     corrompt deliberement le disque entre deux periodes) — il est
//     entierement EFFACE puis RECREE depuis l'archive la plus recente
//     publiee dans le magasin S3 reel (prefixee par trajectoire, donc deux
//     trajectoires sous la meme racine ne se recouvrent jamais, A2).
//
//   « un contrat d'application par lequel le moteur lance le code du
//     candidat comme un processus et l'exerce avec les operations de
//     l'application scriptee » — `runCandidateProcess` : NDJSON sur
//     stdin/stdout, probe de demarrage puis un echange request/response par
//     operation, dans l'ordre (ADR-008 L88-91).
//
//   « un adaptateur qui presente ce processus aux controles existants comme
//     l'application scriptee » — `runScriptedOps` implemente EXACTEMENT la
//     meme semantique (cinq operations, memes codes d'erreur, meme empreinte
//     canonique) pour le mode SANS processus-candidat : c'est ce qui rend
//     l'egalite de A3 vraie par CONSTRUCTION plutot que par coincidence.
//
// CE QUE CE FICHIER NE FAIT PAS. Il ne revalide ni l'agent scripte (T18), ni
// la validation/l'admission (T20/T21), ni `run-period` (T23) : T48 ne depend
// que de T11 et T23 (acceptance/T48.spec.ts, section V). Il n'invoque jamais
// une vraie session `claude -p` (T47/T49) : les candidats exerces ici sont
// des processus NDJSON quelconques, jamais un fournisseur de modele.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { getArtifact, openS3ArtifactStore, putArtifact, s3TestServiceConfig } from '@bench/storage'

/* ══════════════════════════════════ formes du contrat ═══════════════════ */

export interface CandidateOperation {
  readonly op: string
  readonly args?: Readonly<Record<string, unknown>> | undefined
}

export interface CandidatePeriodInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly candidateWorkspaceRoot?: string | undefined
  readonly candidateCommand?: readonly string[] | undefined
  readonly candidateTimeoutMs?: number | undefined
  readonly candidateOps?: readonly CandidateOperation[] | undefined
}

export interface CandidateOperationResult {
  readonly op: string
  readonly args: Readonly<Record<string, unknown>>
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: { readonly code: string; readonly message: string }
  readonly fingerprint_before?: string
  readonly fingerprint_after?: string
}

export interface CandidatePeriodResult {
  readonly campaign_id: string
  readonly period_index: number
  readonly candidate: {
    readonly mode: 'scripted' | 'process'
    readonly deployed: boolean
    readonly not_deployed_reason: string | null
    readonly workspace_dir: string | null
    readonly commit_sha: string | null
  }
  readonly operations: readonly CandidateOperationResult[]
}

/** Les trois motifs de non-deploiement (ADR-008 L143, FIXES par acceptance/T48.spec.ts III.3.c). */
export const CANDIDATE_NOT_DEPLOYED_REASON = {
  START_FAILED: 'CANDIDATE_START_FAILED',
  TIMEOUT: 'CANDIDATE_TIMEOUT',
  PROTOCOL_VIOLATION: 'CANDIDATE_PROTOCOL_VIOLATION',
} as const

const DEFAULT_TIMEOUT_MS = 15_000

/* ══════════════════════════════ PostgreSQL réel (psql) ═══════════════════ */

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
      `candidate-period.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(
        0,
        800,
      ),
    )
  }
}

const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

const TABLE = 'bench_candidate_period_trajectories'

function ensureTable(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       campaign_id text PRIMARY KEY,
       period_index integer NOT NULL,
       mode text NOT NULL,
       workspace_ref text,
       commit_sha text,
       scripted_state jsonb NOT NULL DEFAULT '{}'::jsonb,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

interface ScriptedState {
  readonly tenants: Record<string, Record<string, unknown>>
}

function emptyScriptedState(): ScriptedState {
  return { tenants: {} }
}

function isScriptedState(v: unknown): v is ScriptedState {
  if (v === null || typeof v !== 'object') return false
  const tenants = (v as Record<string, unknown>)['tenants']
  return tenants !== null && typeof tenants === 'object' && !Array.isArray(tenants)
}

interface TrajectoryPointer {
  readonly periodIndex: number
  readonly mode: string
  readonly workspaceRef: string | null
  readonly commitSha: string | null
  readonly scriptedState: ScriptedState
}

function readPointer(db: string, campaignId: string): TrajectoryPointer | null {
  const head = runPsql(
    db,
    `SELECT period_index, mode, coalesce(workspace_ref,''), coalesce(commit_sha,'') FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`,
  )
  if (head === '') return null
  const [periodRaw, mode, workspaceRefRaw, commitShaRaw] = head.split('|')
  const periodIndex = Number.parseInt(periodRaw ?? '', 10)
  if (!Number.isInteger(periodIndex) || mode === undefined || mode === '') return null
  const stateRaw = runPsql(db, `SELECT scripted_state::text FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`)
  let scriptedState = emptyScriptedState()
  try {
    const parsed = JSON.parse(stateRaw) as unknown
    if (isScriptedState(parsed)) scriptedState = parsed
  } catch {
    // garde l'etat vide — une ligne illisible ne doit jamais faire echouer la lecture du pointeur
  }
  return {
    periodIndex,
    mode,
    workspaceRef: workspaceRefRaw === undefined || workspaceRefRaw === '' ? null : workspaceRefRaw,
    commitSha: commitShaRaw === undefined || commitShaRaw === '' ? null : commitShaRaw,
    scriptedState,
  }
}

function writePointer(
  db: string,
  campaignId: string,
  periodIndex: number,
  mode: string,
  workspaceRef: string | null,
  commitSha: string | null,
  scriptedState: ScriptedState,
): void {
  runPsql(
    db,
    `INSERT INTO ${TABLE}(campaign_id, period_index, mode, workspace_ref, commit_sha, scripted_state)
       VALUES (
         ${sqlLit(campaignId)}, ${String(periodIndex)}, ${sqlLit(mode)},
         ${workspaceRef === null ? 'NULL' : sqlLit(workspaceRef)},
         ${commitSha === null ? 'NULL' : sqlLit(commitSha)},
         ${sqlLit(JSON.stringify(scriptedState))}::jsonb
       )
     ON CONFLICT (campaign_id) DO UPDATE SET
       period_index = EXCLUDED.period_index,
       mode = EXCLUDED.mode,
       workspace_ref = EXCLUDED.workspace_ref,
       commit_sha = EXCLUDED.commit_sha,
       scripted_state = EXCLUDED.scripted_state,
       updated_at = now()`,
  )
}

/* ══════════════════════════ espace de travail git réel (S3 réel) ══════════ */

async function openWorkspaceStore(s3Bucket: string, campaignId: string): Promise<ReturnType<typeof openS3ArtifactStore>> {
  const cfg = await s3TestServiceConfig()
  // Préfixé par trajectoire (campaignId), à l'intérieur de --s3-bucket : deux
  // trajectoires n'écrivent jamais dans le même espace d'archive (A2).
  return openS3ArtifactStore({ ...cfg, prefix: `t48/${s3Bucket}/${campaignId}` })
}

/** Dérivation STABLE du sous-répertoire d'une trajectoire sous `--candidate-workspace-root`
 *  (acceptance/T48.spec.ts, III.1 : « l'appelant ne nomme JAMAIS le sous-répertoire »). */
function workspaceSubdir(campaignId: string): string {
  return createHash('sha256').update(campaignId, 'utf8').digest('hex').slice(0, 24)
}

/**
 * Efface entièrement le répertoire local (il n'est jamais une source de
 * vérité, A1) et le recrée depuis l'archive persistante la plus récente
 * (S3 réel), ou — trajectoire fraîche — depuis un dépôt git vierge.
 */
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

/** Archive le répertoire ENTIER (dépôt git compris) et le publie dans S3 réel. */
async function persistWorkspaceArchive(dir: string, s3Bucket: string, campaignId: string): Promise<string> {
  const bytes = execFileSync('tar', ['-czf', '-', '-C', dir, '.'], {
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const store = await openWorkspaceStore(s3Bucket, campaignId)
  const manifest = await putArtifact(store, bytes)
  return manifest.ref
}

/** Sauvegarde la fin de période (ADR-008 L86-87) : commit git réel, sha rendu. */
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

/* ══════════════════ l'application scriptée (mode « scripted ») ═══════════
 * Implémente EXACTEMENT la même sémantique métier que le contrat du mode
 * `process` (III.3.d, dérivé mot pour mot de ADR-008 L90) — c'est ce que
 * acceptance/T48.spec.ts A3 compare, opération par opération, à l'issue d'un
 * VRAI processus (acceptance/fixtures/candidates/reference-app.mjs).
 */

/** cahier:L82 — objets JSON triés RÉCURSIVEMENT par clé, ordre des tableaux conservé, UTF-8. */
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

function scriptedFingerprint(state: ScriptedState): string {
  const bytes = Buffer.from(JSON.stringify(canonicalValue({ tenants: state.tenants })), 'utf8')
  return createHash('sha256').update(bytes).digest('hex')
}

type OpOutcome =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

function runScriptedOp(state: ScriptedState, op: string, args: Readonly<Record<string, unknown>>): OpOutcome {
  const tenants = state.tenants as Record<string, Record<string, unknown>>
  switch (op) {
    case 'create_tenant': {
      const tenantId = String(args['tenant_id'])
      if (tenants[tenantId] === undefined) tenants[tenantId] = {}
      return { ok: true, result: {} }
    }
    case 'write': {
      const tenantId = String(args['tenant_id'])
      const key = String(args['key'])
      if (tenants[tenantId] === undefined) {
        return { ok: false, error: { code: 'TENANT_NOT_FOUND', message: tenantId } }
      }
      tenants[tenantId][key] = args['value']
      return { ok: true, result: {} }
    }
    case 'read': {
      const tenantId = String(args['tenant_id'])
      const key = String(args['key'])
      const value = tenants[tenantId]?.[key] ?? null
      return { ok: true, result: { value } }
    }
    case 'probe_cancel': {
      // cahier:L123 — les probes ne modifient JAMAIS l'état persistant principal.
      const tenantId = String(args['tenant_id'])
      const key = String(args['key'])
      const decision = tenants[tenantId]?.[key] !== undefined ? 'cancelled' : 'refused'
      return { ok: true, result: { decision } }
    }
    case 'fingerprint': {
      return { ok: true, result: { sha256: scriptedFingerprint(state) } }
    }
    default:
      return { ok: false, error: { code: 'UNKNOWN_OP', message: op } }
  }
}

function runScriptedOps(state: ScriptedState, ops: readonly CandidateOperation[]): CandidateOperationResult[] {
  const out: CandidateOperationResult[] = []
  for (const o of ops) {
    const args = o.args ?? {}
    if (o.op === 'probe_cancel') {
      const fingerprint_before = scriptedFingerprint(state)
      const r = runScriptedOp(state, o.op, args)
      const fingerprint_after = scriptedFingerprint(state)
      out.push({
        op: o.op,
        args,
        ok: r.ok,
        ...(r.ok ? { result: r.result } : { error: r.error }),
        fingerprint_before,
        fingerprint_after,
      })
      continue
    }
    const r = runScriptedOp(state, o.op, args)
    out.push({ op: o.op, args, ok: r.ok, ...(r.ok ? { result: r.result } : { error: r.error }) })
  }
  return out
}

/* ══════════════════ le candidat réel (mode « process »), NDJSON ═══════════
 * Contrat (ADR-008 L88-91, FIXE par acceptance/T48.spec.ts III.3) : NDJSON
 * sur stdin/stdout, une probe de démarrage puis un échange request/response
 * séquentiel par opération, dans le délai `--candidate-timeout-ms`.
 */

type ChannelEvent = { readonly kind: 'line'; readonly line: string } | { readonly kind: 'closed' } | { readonly kind: 'timeout' }

/** Lecture ligne par ligne d'un flux NDJSON, avec attente bornée dans le temps. */
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

interface ProcessOutcome {
  readonly deployed: boolean
  readonly reason: string | null
  readonly operations: readonly CandidateOperationResult[]
}

async function runCandidateProcess(
  command: readonly string[],
  cwd: string,
  timeoutMs: number,
  ops: readonly CandidateOperation[],
): Promise<ProcessOutcome> {
  const cmd = command[0]
  if (cmd === undefined) {
    return { deployed: false, reason: CANDIDATE_NOT_DEPLOYED_REASON.START_FAILED, operations: [] }
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

  // Probe de démarrage (III.3.b) : EXACTEMENT une ligne `{"ready":true}` dans le délai.
  const probe = await channel.next(timeoutMs)
  if (probe.kind !== 'line') {
    kill()
    return { deployed: false, reason: CANDIDATE_NOT_DEPLOYED_REASON.START_FAILED, operations: [] }
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
    return { deployed: false, reason: CANDIDATE_NOT_DEPLOYED_REASON.START_FAILED, operations: [] }
  }

  let seq = 0
  const nextId = (): string => {
    seq += 1
    return `req-${String(seq)}`
  }

  type Exchange = OpOutcome | { readonly failure: 'TIMEOUT' | 'PROTOCOL_VIOLATION' }

  const exchange = async (op: string, opArgs: Readonly<Record<string, unknown>>): Promise<Exchange> => {
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

  const reasonOf = (failure: 'TIMEOUT' | 'PROTOCOL_VIOLATION'): string =>
    failure === 'TIMEOUT' ? CANDIDATE_NOT_DEPLOYED_REASON.TIMEOUT : CANDIDATE_NOT_DEPLOYED_REASON.PROTOCOL_VIOLATION

  // Miroir LOCAL de l'état métier, tenu par l'ADAPTATEUR lui-même à partir
  // des arguments qu'IL vient d'envoyer et du verdict ok/erreur que le
  // candidat vient de rendre — jamais par une requête supplémentaire au
  // candidat. C'est ce qui rend `fingerprint_before`/`fingerprint_after`
  // (A5) observables SANS ajouter une seule ligne au canal `ops-received.log`
  // du candidat (A3, mutant T48.M3) : le témoin décisif de A3 est que le
  // journal porte EXACTEMENT une ligne par opération DEMANDÉE, ni plus ni
  // moins — une requête `fingerprint` cachée autour de `probe_cancel` y
  // apparaîtrait, cassant cette égalité par construction.
  const shadow = emptyScriptedState()
  const mirrorMutation = (op: string, opArgs: Readonly<Record<string, unknown>>, outcome: OpOutcome): void => {
    if (!outcome.ok) return
    const tenants = shadow.tenants
    if (op === 'create_tenant') {
      const tenantId = String(opArgs['tenant_id'])
      if (tenants[tenantId] === undefined) tenants[tenantId] = {}
    } else if (op === 'write') {
      const tenantId = String(opArgs['tenant_id'])
      const key = String(opArgs['key'])
      if (tenants[tenantId] === undefined) tenants[tenantId] = {}
      tenants[tenantId][key] = opArgs['value']
    }
    // read / probe_cancel / fingerprint : AUCUNE mutation (cahier:L123).
  }

  const out: CandidateOperationResult[] = []
  for (const o of ops) {
    const opArgs = o.args ?? {}
    if (o.op === 'probe_cancel') {
      const fingerprint_before = scriptedFingerprint(shadow)
      const r = await exchange(o.op, opArgs)
      if ('failure' in r) {
        kill()
        return { deployed: false, reason: reasonOf(r.failure), operations: [] }
      }
      mirrorMutation(o.op, opArgs, r)
      const fingerprint_after = scriptedFingerprint(shadow)
      out.push({
        op: o.op,
        args: opArgs,
        ok: r.ok,
        ...(r.ok ? { result: r.result } : { error: r.error }),
        fingerprint_before,
        fingerprint_after,
      })
      continue
    }
    const r = await exchange(o.op, opArgs)
    if ('failure' in r) {
      kill()
      return { deployed: false, reason: reasonOf(r.failure), operations: [] }
    }
    mirrorMutation(o.op, opArgs, r)
    out.push({ op: o.op, args: opArgs, ok: r.ok, ...(r.ok ? { result: r.result } : { error: r.error }) })
  }

  kill()
  return { deployed: true, reason: null, operations: out }
}

/* ══════════════════════════════════════════════════════════════════ l'orchestrateur */

/**
 * Avance la trajectoire `campaignId` d'EXACTEMENT une période : restaure
 * l'espace de travail (s'il y en a un) depuis l'état persistant, expose le
 * candidat soit comme un processus réel (`candidateCommand`) soit via
 * l'application scriptée (absent), joue les opérations fournies dans
 * l'ordre, puis sauvegarde (commit git + archive S3 + pointeur PostgreSQL).
 * Chaque appel ne porte que sur LA PÉRIODE SUIVANTE : l'état persistant est
 * lu par cette fonction elle-même, jamais fourni par l'appelant.
 */
export async function candidatePeriodOnce(input: CandidatePeriodInput): Promise<CandidatePeriodResult> {
  const db = input.postgresDatabase
  const campaignId = input.campaignId
  ensureTable(db)
  const pointer = readPointer(db, campaignId)
  const periodIndex = pointer === null ? 1 : pointer.periodIndex + 1
  const mode: 'scripted' | 'process' = input.candidateCommand !== undefined ? 'process' : 'scripted'
  const ops = input.candidateOps ?? []
  const timeoutMs = input.candidateTimeoutMs ?? DEFAULT_TIMEOUT_MS

  let workspaceDir: string | null = null
  if (input.candidateWorkspaceRoot !== undefined) {
    workspaceDir = await restoreWorkspace(input.candidateWorkspaceRoot, campaignId, pointer?.workspaceRef ?? null, input.s3Bucket)
  }

  let deployed = true
  let notDeployedReason: string | null = null
  let operations: readonly CandidateOperationResult[] = []
  let newCommitSha: string | null = null
  const scriptedState = pointer?.scriptedState ?? emptyScriptedState()

  if (mode === 'process') {
    const cwd = workspaceDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'bench-candidate-'))
    const outcome = await runCandidateProcess(input.candidateCommand as readonly string[], cwd, timeoutMs, ops)
    deployed = outcome.deployed
    notDeployedReason = outcome.reason
    operations = outcome.operations
    if (deployed && workspaceDir !== null) {
      newCommitSha = commitWorkspace(workspaceDir, periodIndex)
    }
  } else {
    operations = runScriptedOps(scriptedState, ops)
  }

  let workspaceRef = pointer?.workspaceRef ?? null
  if (workspaceDir !== null) {
    workspaceRef = await persistWorkspaceArchive(workspaceDir, input.s3Bucket, campaignId)
  }

  // commit_sha : null hors mode `process`, ou si rien n'a jamais été déployé
  // pour cette trajectoire (acceptance/T48.spec.ts, section III.2).
  const commitSha = mode === 'process' ? newCommitSha ?? pointer?.commitSha ?? null : null

  writePointer(db, campaignId, periodIndex, mode, workspaceRef, commitSha, scriptedState)

  return {
    campaign_id: campaignId,
    period_index: periodIndex,
    candidate: {
      mode,
      deployed,
      not_deployed_reason: notDeployedReason,
      workspace_dir: workspaceDir,
      commit_sha: commitSha,
    },
    operations,
  }
}
