// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — le fournisseur `claude-cli` de `bench run-period` et
// `bench pilot-conduct` (T49, ADR-008-candidat-reel-par-session-claude-p.md
// L147-L153 ; verification/tasks.extensions.json : T49 est une tache
// d'EXTENSION, pas du cahier).
//
// CE QUE CE FICHIER AJOUTE, ET POURQUOI UN FICHIER SEPARE DE `run-period.ts`.
// `runPeriodOnce` (T23/T45) reste INTACT : aucune de ses lignes n'est
// touchee par ce fichier, ce qui rend la REGRESSION de T49.A5 (le
// fournisseur factice, inchange) vraie PAR CONSTRUCTION plutot que par une
// verification separee — le chemin `--provider fake` ne traverse jamais ce
// module. Ce fichier assemble a la place UNE PERIODE CANDIDATE REELLE :
//
//   REFUS AVANT TOUT APPEL (A6, ADR-008 L98) : sans `--live`, retourne un
//   echec nomme AVANT d'ouvrir PostgreSQL ou de deriver un espace de
//   travail — aucune trace, aucun appel.
//
//   PROMPT (A2) : les exigences REVELEES de CETTE periode SEULEMENT,
//   obtenues par `revealedRequirementsForPeriod` (`./run-period.js`) — LA
//   MEME fonction pure que `runPeriodOnce` emploie pour son propre champ
//   `requirements`, afin que les deux soient BIT-IDENTIQUES pour le meme
//   (scenario, periode). Le marqueur `bench.candidate/1` (T48) est ajoute
//   comme PRESENCE du contrat d'application, jamais comme invocation du
//   protocole NDJSON lui-meme (T49 ne re-exerce pas `candidate-period`, voir
//   acceptance/T49.spec.ts section V). AUCUNE autre donnee n'entre dans le
//   prompt (ni audit, ni controles, ni exigences d'une autre periode) : le
//   danger de fuite (IV.(2) de la suite) est evite PAR CONSTRUCTION — ce
//   fichier ne lit jamais `audit`/`controls`.
//
//   SESSION (A1) : `launchClaudeCliPeriod` (`@bench/agents`, T47) dans un
//   espace de travail git REEL, derive de `--candidate-workspace-root` par
//   le MEME hachage stable que `./candidate-period.ts` (T48) emploie pour sa
//   propre derivation — jamais fourni par l'appelant. Le commit de FIN n'est
//   ecrit QU'APRES que la session a resolu, pour que `git show <commit_sha>`
//   porte reellement ce que la session a ecrit dans ce repertoire.
//
//   PERSISTANCE (A1, A3) : UNE ligne par (campaign_id, period_index) dans
//   `bench_claude_cli_periods`, ECRITE SEULEMENT SI LA SESSION A REUSSI —
//   jamais pour une session en echec, jamais pour un refus `--live`. C'est
//   cette absence d'ecriture, et elle seule, qui rend une periode en echec
//   NI SAUTEE NI DUPLIQUEE : la prochaine tentative relit `MAX(period_index)
//   + 1`, qui n'a pas avance (A3).
//
//   RAPPORT CUMULATIF (A4) : `aggregateClaudeCliUsage` relit CETTE MEME
//   table, jamais un compteur tenu en memoire par le processus qui vient
//   d'ecrire — meme discipline que `buildTokenReport` de `./pilot-conduct.ts`
//   (T46) pour le fournisseur factice.
//
// CE QUE CE FICHIER NE FAIT PAS. Il ne provisionne aucun stockage S3 pour
// l'espace de travail (a la difference de `./candidate-period.ts`, T48) :
// `--candidate-workspace-root` designe ici un repertoire REEL et REUTILISE
// directement d'un appel au suivant (jamais un seau S3), exactement ce que
// `acceptance/T49.spec.ts` observe (section V : « elle ne fixe aucune regle
// de derivation precise [...] seulement qu'il designe un depot git REEL et
// REUTILISABLE entre l'ecriture et la relecture d'UNE MEME periode »). Il
// n'exerce jamais le protocole NDJSON de `candidate-period` (T48) : le code
// ecrit par la session est COMMIS, jamais DEPLOYE ni EXERCE par ce fichier.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { launchClaudeCliPeriod } from '@bench/agents'
import type { ClaudeCliPeriodUsage } from '@bench/agents'

import { revealedRequirementsForPeriod, SCENARIO_DEFAULT } from './run-period.js'

/* ══════════════════════════════════ formes du contrat ═══════════════════ */

export interface RunPeriodClaudeCliInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly live: boolean
  readonly model: string
  readonly candidateWorkspaceRoot: string
  readonly scenarioId?: string | undefined
}

export interface ClaudeCliCandidate {
  readonly provider: 'claude-cli'
  readonly session_id: string
  readonly raw_output: string
  readonly commit_sha: string
  readonly workspace_dir: string
  readonly usage: readonly ClaudeCliPeriodUsage[]
}

export interface RunPeriodClaudeCliOutcome {
  readonly schema: 'bench.t49.claude_cli_period_result/1'
  readonly campaign_id: string
  readonly period_index: number | null
  readonly persisted: boolean
  readonly failure_reason: string | null
  readonly candidate?: ClaudeCliCandidate
}

export interface RereadClaudeCliPeriodInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly periodIndex: number
}

/** Motif de refus NOMME (A6, ADR-008 L98) — distinct des quatre motifs de
 *  T47.A4, jamais confondu avec un echec DE session (aucune session n'a ici
 *  jamais ete invoquee). */
export const REASON_LIVE_FLAG_ABSENT =
  "refus : --live absent, le fournisseur claude-cli n'est jamais invoque (ADR-008:L98)"

/** Motif NOMME quand `--test-reread-period <n>` vise une periode qui n'a
 *  jamais ete persistee pour cette trajectoire (jamais confondu avec un
 *  echec de session : aucune session n'est invoquee par une relecture). */
export const REASON_NO_PERIOD_PERSISTED = 'aucune periode persistee a cet indice pour cette trajectoire'

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
      `run-period-claude-cli.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(
        0,
        800,
      ),
    )
  }
}

const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

const TABLE = 'bench_claude_cli_periods'

function ensureTable(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       campaign_id text NOT NULL,
       period_index integer NOT NULL,
       session_id text NOT NULL,
       raw_output text NOT NULL,
       commit_sha text NOT NULL,
       workspace_dir text NOT NULL,
       scenario_id text NOT NULL,
       usage jsonb NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (campaign_id, period_index)
     )`,
  )
}

function lastCompletedPeriod(db: string, campaignId: string): number {
  const out = runPsql(db, `SELECT COALESCE(MAX(period_index), 0) FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`)
  const n = Number.parseInt(out, 10)
  return Number.isInteger(n) ? n : 0
}

interface PersistedClaudeCliPeriod {
  readonly period_index: number
  readonly session_id: string
  readonly raw_output: string
  readonly commit_sha: string
  readonly workspace_dir: string
  readonly usage: readonly ClaudeCliPeriodUsage[]
}

function parseUsage(raw: string | undefined): ClaudeCliPeriodUsage[] {
  if (raw === undefined || raw === '') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as ClaudeCliPeriodUsage[]) : []
  } catch {
    return []
  }
}

function readClaudeCliPeriod(db: string, campaignId: string, periodIndex: number): PersistedClaudeCliPeriod | null {
  const out = runPsql(
    db,
    `SELECT period_index, session_id, raw_output, commit_sha, workspace_dir, usage::text FROM ${TABLE}
       WHERE campaign_id = ${sqlLit(campaignId)} AND period_index = ${String(periodIndex)}`,
  )
  if (out === '') return null
  const fields = out.split('|')
  const period = Number.parseInt(fields[0] ?? '', 10)
  if (!Number.isInteger(period)) return null
  return {
    period_index: period,
    session_id: fields[1] ?? '',
    raw_output: fields[2] ?? '',
    commit_sha: fields[3] ?? '',
    workspace_dir: fields[4] ?? '',
    usage: parseUsage(fields[5]),
  }
}

function writeClaudeCliPeriod(
  db: string,
  campaignId: string,
  periodIndex: number,
  row: Omit<PersistedClaudeCliPeriod, 'period_index'> & { readonly scenarioId: string },
): void {
  runPsql(
    db,
    `INSERT INTO ${TABLE}(campaign_id, period_index, session_id, raw_output, commit_sha, workspace_dir, scenario_id, usage)
       VALUES (
         ${sqlLit(campaignId)}, ${String(periodIndex)}, ${sqlLit(row.session_id)}, ${sqlLit(row.raw_output)},
         ${sqlLit(row.commit_sha)}, ${sqlLit(row.workspace_dir)}, ${sqlLit(row.scenarioId)},
         ${sqlLit(JSON.stringify(row.usage))}::jsonb
       )
     ON CONFLICT (campaign_id, period_index) DO NOTHING`,
  )
}

/** Toutes les periodes persistees pour un ensemble de trajectoires (T46,
 *  agregat cumulatif A4) — jamais un compteur tenu en memoire par le
 *  processus qui vient d'ecrire (voir l'en-tete). */
function readAllClaudeCliPeriods(db: string, campaignIds: readonly string[]): PersistedClaudeCliPeriod[] {
  if (campaignIds.length === 0) return []
  const liste = campaignIds.map(sqlLit).join(', ')
  const out = runPsql(
    db,
    `SELECT period_index, session_id, raw_output, commit_sha, workspace_dir, usage::text FROM ${TABLE}
       WHERE campaign_id IN (${liste}) ORDER BY campaign_id, period_index`,
  )
  if (out === '') return []
  return out.split('\n').map((line) => {
    const fields = line.split('|')
    const period = Number.parseInt(fields[0] ?? '', 10)
    return {
      period_index: Number.isInteger(period) ? period : 0,
      session_id: fields[1] ?? '',
      raw_output: fields[2] ?? '',
      commit_sha: fields[3] ?? '',
      workspace_dir: fields[4] ?? '',
      usage: parseUsage(fields[5]),
    }
  })
}

/** Exportee pour `./pilot-conduct.ts` (T46/T49) : appelle elle-meme
 *  `ensureTable`, idempotent, pour rester correcte quel que soit l'ordre
 *  d'appel (meme discipline defensive que `readPersistedTrajectories` dans
 *  `./pilot-conduct.ts`, qui ne suppose jamais que sa table existe deja). */
function countClaudeCliPeriods(db: string, campaignId: string): number {
  ensureTable(db)
  const out = runPsql(db, `SELECT COUNT(*) FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`)
  const n = Number.parseInt(out, 10)
  return Number.isInteger(n) ? n : 0
}

/* ═══════════════════════ espace de travail git réel (T48, derivation) ════ */

/** Derivation STABLE du sous-repertoire d'une trajectoire sous
 *  `--candidate-workspace-root` (meme discipline que `./candidate-period.ts`,
 *  T48, III.1 : l'appelant ne nomme JAMAIS le sous-repertoire). */
function workspaceSubdir(campaignId: string): string {
  return createHash('sha256').update(campaignId, 'utf8').digest('hex').slice(0, 24)
}

function ensureWorkspace(root: string, campaignId: string): string {
  const dir = path.join(root, workspaceSubdir(campaignId))
  fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(path.join(dir, '.git'))) {
    execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] })
  }
  return dir
}

/** Commit de FIN de periode (ADR-008 L86-87) : TOUT ce que la session a
 *  ecrit dans l'espace de travail, commis APRES que la session a resolu —
 *  jamais avant (A1 : `git show <commit_sha>` doit porter l'ecriture de
 *  CETTE session). */
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
      `claude-cli period ${String(periodIndex)}`,
    ],
    { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/* ══════════════════════════════════ prompt (A2) ═══════════════════════════
 * Serialisation canonique (cles triees RECURSIVEMENT, ordre des tableaux
 * conserve) : MEME convention que `acceptance/T49.spec.ts` (fonction
 * `canonique`) et que `./candidate-period.ts` (`canonicalValue`) — c'est ce
 * qui rend la comparaison de sous-chaine de A2 robuste a l'ordre
 * d'enumeration des cles, jamais a leur contenu. */
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

/** Marqueur de PRESENCE du contrat d'application (T48), jamais une
 *  invocation du protocole NDJSON lui-meme (voir l'en-tete, section V de
 *  acceptance/T49.spec.ts). AUCUNE autre donnee (audit, controles,
 *  exigences d'une autre periode) n'entre ici — le danger de fuite (IV.(2))
 *  est evite PAR CONSTRUCTION. */
const CANDIDATE_PROTOCOL_MARKER = 'bench.candidate/1'

function buildPrompt(requirements: readonly unknown[]): string {
  const reqJson = JSON.stringify(canonicalValue(requirements))
  return [
    `Protocole d'application ${CANDIDATE_PROTOCOL_MARKER} (voir bench candidate-period) : developpe le code candidat de cette periode comme un processus qui echangera, plus tard, des operations {op,args} en JSON ligne a ligne sur son entree et sa sortie standard.`,
    'Exigences revelees pour cette periode (JSON) :',
    reqJson,
  ].join('\n\n')
}

/* ══════════════════════════════════════════════════ l'orchestrateur (A1/A3/A6) */

/**
 * Avance la trajectoire `campaignId` d'EXACTEMENT une periode candidate
 * REELLE (T49). Refuse AVANT TOUT APPEL si `live` n'est pas vrai (A6) ;
 * sinon lance une session `claude -p` neuve (`@bench/agents`, T47) dans
 * l'espace de travail derive de `candidateWorkspaceRoot` (T48), et persiste
 * SEULEMENT SI la session a reussi (A3).
 */
export async function runPeriodOnceClaudeCli(input: RunPeriodClaudeCliInput): Promise<RunPeriodClaudeCliOutcome> {
  const campaignId = input.campaignId

  // ── A6 : refus AVANT tout appel, avant meme toute connexion PostgreSQL. ──
  if (!input.live) {
    return {
      schema: 'bench.t49.claude_cli_period_result/1',
      campaign_id: campaignId,
      period_index: null,
      persisted: false,
      failure_reason: REASON_LIVE_FLAG_ABSENT,
    }
  }

  const db = input.postgresDatabase
  ensureTable(db)
  const periodIndex = lastCompletedPeriod(db, campaignId) + 1
  const scenarioId = input.scenarioId ?? SCENARIO_DEFAULT

  const requirements = await revealedRequirementsForPeriod(scenarioId, periodIndex)
  const prompt = buildPrompt(requirements)
  const workspaceDir = ensureWorkspace(input.candidateWorkspaceRoot, campaignId)

  const session = await launchClaudeCliPeriod({
    workspaceDir,
    model: input.model,
    prompt,
    env: process.env,
  })

  if (!session.ok) {
    return {
      schema: 'bench.t49.claude_cli_period_result/1',
      campaign_id: campaignId,
      period_index: periodIndex,
      persisted: false,
      failure_reason: session.reason,
    }
  }

  // ── CHECKPOINTING : commis APRES la reussite de la session (voir l'en-tete). ──
  const commitSha = commitWorkspace(workspaceDir, periodIndex)
  writeClaudeCliPeriod(db, campaignId, periodIndex, {
    session_id: session.sessionId,
    raw_output: session.raw,
    commit_sha: commitSha,
    workspace_dir: workspaceDir,
    scenarioId,
    usage: session.usage,
  })

  return {
    schema: 'bench.t49.claude_cli_period_result/1',
    campaign_id: campaignId,
    period_index: periodIndex,
    persisted: true,
    failure_reason: null,
    candidate: {
      provider: 'claude-cli',
      session_id: session.sessionId,
      raw_output: session.raw,
      commit_sha: commitSha,
      workspace_dir: workspaceDir,
      usage: session.usage,
    },
  }
}

/**
 * `--test-reread-period <n>` (point d'injection NOMME, T49, II.1) : relit,
 * depuis un processus NEUF, EXACTEMENT ce que `runPeriodOnceClaudeCli` a
 * persiste pour cette periode — jamais le self-report en memoire de l'appel
 * qui l'a ecrite (A1/A3/A4).
 */
export function rereadClaudeCliPeriod(input: RereadClaudeCliPeriodInput): RunPeriodClaudeCliOutcome {
  const db = input.postgresDatabase
  ensureTable(db)
  const row = readClaudeCliPeriod(db, input.campaignId, input.periodIndex)
  if (row === null) {
    return {
      schema: 'bench.t49.claude_cli_period_result/1',
      campaign_id: input.campaignId,
      period_index: input.periodIndex,
      persisted: false,
      failure_reason: REASON_NO_PERIOD_PERSISTED,
    }
  }
  return {
    schema: 'bench.t49.claude_cli_period_result/1',
    campaign_id: input.campaignId,
    period_index: row.period_index,
    persisted: true,
    failure_reason: null,
    candidate: {
      provider: 'claude-cli',
      session_id: row.session_id,
      raw_output: row.raw_output,
      commit_sha: row.commit_sha,
      workspace_dir: row.workspace_dir,
      usage: row.usage,
    },
  }
}

/* ══════════════════════ agrégat cumulatif par modèle (T46/A4) ═══════════ */

/** Les six categories (acceptance/T47.spec.ts, III.1 ; acceptance/T49.spec.ts,
 *  CATEGORIES_USAGE) — jamais une septieme. */
const USAGE_CATEGORIES = [
  'input_fresh',
  'cache_read',
  'output',
  'cache_write_5m',
  'cache_write_1h',
  'cache_write_unresolved',
] as const

function zeroVector(): Record<string, number> {
  return {
    input_fresh: 0,
    cache_read: 0,
    output: 0,
    cache_write_5m: 0,
    cache_write_1h: 0,
    cache_write_unresolved: 0,
  }
}

/**
 * Reconstruit `candidate_token_report.by_model`, CUMULATIF sur TOUTES les
 * periodes REELLEMENT persistees pour les trajectoires `campaignIds`, par
 * relecture DIRECTE de `bench_claude_cli_periods` (A4) — jamais un compteur
 * tenu en memoire par `bench pilot-conduct` au fil de ses appels.
 */
export function aggregateClaudeCliUsage(
  postgresDatabase: string,
  campaignIds: readonly string[],
): Readonly<Record<string, Record<string, number>>> {
  ensureTable(postgresDatabase)
  const periods = readAllClaudeCliPeriods(postgresDatabase, campaignIds)
  const byModel = new Map<string, Record<string, number>>()
  for (const period of periods) {
    for (const u of period.usage) {
      const vector = byModel.get(u.model) ?? zeroVector()
      for (const cat of USAGE_CATEGORIES) {
        vector[cat] = (vector[cat] ?? 0) + (typeof u[cat] === 'number' ? u[cat] : 0)
      }
      byModel.set(u.model, vector)
    }
  }
  return Object.fromEntries(byModel)
}

export { countClaudeCliPeriods }
