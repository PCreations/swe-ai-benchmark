// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T76, ADR-021 décision 5 et L214-L220 : le pilote
// F-PLATFORM sur le chemin `bench pilot-conduct --provider claude-cli --live`,
// à un ou plusieurs BRAS (./pilot-arms.ts), avec des répétitions par bras.
//
// CE FICHIER ASSEMBLE DES BRIQUES PROUVÉES :
//
//   PÉRIODE      le moteur a déjà matérialisé docs/ (T73) et la session a
//                commis son code (T49) ; ce fichier note alors le commit :
//                  - scores CIBLÉS par clause active et score DIFFÉRENTIEL :
//                    les notateurs de T74 (`scorePlatformTargeted`,
//                    `scorePlatformDifferential`), qui EXÉCUTENT le
//                    `candidate.mjs` du commit (protocole bench.platform/1) ;
//                    la graine est celle du COUPLE (groupe, clone, répétition)
//                    et non du bras : à une même période, les deux bras d'une
//                    même répétition sont notés sur les MÊMES séquences ;
//                  - RÉGRESSIONS (G du cahier, par identifiant de clause) : les
//                    clauses actives non satisfaites (score < 1) à la période,
//                    satisfaites (score = 1) à une période antérieure de la
//                    même trajectoire ;
//                  - COÛTS de la session : jetons par catégorie (T47/T49),
//                    tours (`num_turns`) et durée (`duration_ms` de la sortie
//                    de `claude -p`, à défaut la durée d'horloge de la session) ;
//                  - QUALITÉ DU CODE : les six mesures de ./code-quality.ts.
//                Tout est persisté dans PostgreSQL (`bench_f_platform_pilot_
//                periods`), une ligne par (trajectoire, période), idempotent.
//   RAPPORT      relu de cette table : un enregistrement par (bras, répétition,
//                période) ; par bras et par période {mean, min, max, n} de
//                chaque mesure ; et le rapport du coût du bras traitement
//                (B) sur celui du bras de référence (A), par période et cumulé,
//                RAPPORT DES MOYENNES, rééchantillonné selon T33
//                (./paired-resampling.ts) sur les répétitions.
//
// LE COÛT D'UNE SESSION (rapport B/A) : le total de ses jetons, toutes
// catégories confondues — une mesure linéaire des comptes que la session rend,
// jamais une durée d'horloge.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import type { ClaudeCliPeriodUsage } from '@bench/agents'

import { CANDIDATE_ENTRYPOINT_FILENAME } from './candidate-protocol-v2.js'
import { measureCodeQuality, type CodeQualityMeasures } from './code-quality.js'
import { scorePlatformDifferential, scorePlatformTargeted, runPlatformPsql, sqlLiteral } from './f-platform-checks-scoring.js'
import { F_PLATFORM_SCENARIO_ID } from './f-platform-pilot.js'
import { empiricalInverseQuantileInterval, pairedDraws, ratioOfMeans } from './paired-resampling.js'
import { comparedArms, type PilotArm } from './pilot-arms.js'

type Json = Record<string, unknown>

export const F_PLATFORM_PILOT_TABLE = 'bench_f_platform_pilot_periods'

const USAGE_CATEGORIES = ['input_fresh', 'cache_read', 'output', 'cache_write_5m', 'cache_write_1h', 'cache_write_unresolved'] as const
const QUALITY_MEASURES = ['complexity', 'duplication', 'function_size', 'file_size', 'tests_written', 'coverage'] as const

/** Bornes de la bande ponctuelle (T33). */
export const RESAMPLING_LOWER_Q = 0.025
export const RESAMPLING_UPPER_Q = 0.975

const nn = (n: number): string => String(n).padStart(2, '0')

/* ══════════════════════════════════════════════ PostgreSQL (psql réel) ═══ */

interface ClauseScore {
  readonly score: number
  readonly satisfied: number
  readonly total: number
}

interface FPlatformPeriodRow {
  readonly trajectory_key: string
  readonly period_index: number
  readonly period_key: string
  readonly configuration_id: string
  readonly arm: string | null
  readonly repetition: number | null
  readonly seed: string
  readonly commit_sha: string
  readonly workspace_dir: string
  readonly targeted: Readonly<Record<string, ClauseScore>>
  readonly differential: ClauseScore
  readonly regressions: readonly string[]
  readonly tokens: Readonly<Record<string, number>>
  readonly turns: number | null
  readonly duration_ms: number | null
  readonly cost_usd: number | null
  readonly code_quality: CodeQualityMeasures
}

function ensureTable(db: string): void {
  runPlatformPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${F_PLATFORM_PILOT_TABLE} (
       trajectory_key text NOT NULL,
       period_index integer NOT NULL,
       period_key text NOT NULL,
       configuration_id text NOT NULL,
       arm text,
       repetition integer,
       seed text NOT NULL,
       commit_sha text NOT NULL,
       workspace_dir text NOT NULL,
       targeted jsonb NOT NULL,
       differential jsonb NOT NULL,
       regressions jsonb NOT NULL,
       tokens jsonb NOT NULL,
       turns integer,
       duration_ms double precision,
       cost_usd double precision,
       code_quality jsonb NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (trajectory_key, period_index)
     )`,
  )
}

function readRows(db: string, trajectoryKey: string): FPlatformPeriodRow[] {
  ensureTable(db)
  const out = runPlatformPsql(
    db,
    `SELECT row_to_json(t) FROM (
       SELECT trajectory_key, period_index, period_key, configuration_id, arm, repetition, seed, commit_sha, workspace_dir,
              targeted, differential, regressions, tokens, turns, duration_ms, cost_usd, code_quality
         FROM ${F_PLATFORM_PILOT_TABLE} WHERE trajectory_key = ${sqlLiteral(trajectoryKey)} ORDER BY period_index
     ) t`,
  )
  if (out === '') return []
  return out
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as FPlatformPeriodRow)
}

const numOrNull = (v: number | null): string => (v === null || !Number.isFinite(v) ? 'NULL' : String(v))
const jsonb = (v: unknown): string => `${sqlLiteral(JSON.stringify(v))}::jsonb`

function writeRow(db: string, row: FPlatformPeriodRow): void {
  runPlatformPsql(
    db,
    `INSERT INTO ${F_PLATFORM_PILOT_TABLE}(trajectory_key, period_index, period_key, configuration_id, arm, repetition, seed,
         commit_sha, workspace_dir, targeted, differential, regressions, tokens, turns, duration_ms, cost_usd, code_quality)
       VALUES (${sqlLiteral(row.trajectory_key)}, ${String(row.period_index)}, ${sqlLiteral(row.period_key)},
               ${sqlLiteral(row.configuration_id)}, ${row.arm === null ? 'NULL' : sqlLiteral(row.arm)}, ${numOrNull(row.repetition)},
               ${sqlLiteral(row.seed)}, ${sqlLiteral(row.commit_sha)}, ${sqlLiteral(row.workspace_dir)},
               ${jsonb(row.targeted)}, ${jsonb(row.differential)}, ${jsonb(row.regressions)}, ${jsonb(row.tokens)},
               ${numOrNull(row.turns)}, ${numOrNull(row.duration_ms)}, ${numOrNull(row.cost_usd)}, ${jsonb(row.code_quality)})
     ON CONFLICT (trajectory_key, period_index) DO NOTHING`,
  )
}

/* ═══════════════════════════════════════════════ une période du pilote ═══ */

/** Graine des contrôles d'un couple (groupe, clone, répétition) : la même pour tous les bras. */
export function fPlatformSeedOf(pairingKey: string): string {
  return String(createHash('sha256').update(`t76-seed|${pairingKey}`, 'utf8').digest().readUInt32BE(0))
}

/** Rang de répétition porté par l'identité de trajectoire (`...--rep<N>`, pilot-conduct). */
export function repetitionOfTrajectory(trajectoryKey: string): number | null {
  const m = /--rep(\d+)$/.exec(trajectoryKey)
  return m === null ? null : Number(m[1])
}

function tokensOf(usage: readonly ClaudeCliPeriodUsage[]): Record<string, number> {
  const out: Record<string, number> = {}
  let total = 0
  for (const cat of USAGE_CATEGORIES) {
    const v = usage.reduce((s, u) => s + (typeof u[cat] === 'number' && Number.isFinite(u[cat]) ? u[cat] : 0), 0)
    out[cat] = v
    total += v
  }
  out['total'] = total
  return out
}

/** `num_turns`, `duration_ms`, `total_cost_usd` de la sortie JSON de `claude -p` (absents : null). */
function sessionCounts(raw: string): { turns: number | null; duration_ms: number | null; cost_usd: number | null } {
  let o: Json = {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) o = parsed as Json
  } catch {
    /* sortie illisible : aucun compte */
  }
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return { turns: num(o['num_turns']), duration_ms: num(o['duration_ms']), cost_usd: num(o['total_cost_usd']) }
}

export interface ControlFPlatformPilotPeriodInput {
  readonly postgresDatabase: string
  readonly trajectoryKey: string
  readonly configurationId: string
  readonly arm: string | null
  readonly periodIndex: number
  readonly workspaceDir: string
  readonly commitSha: string
  readonly usage: readonly ClaudeCliPeriodUsage[]
  readonly rawOutput: string
  /** Durée d'horloge de la session (ms), quand la sortie ne porte pas `duration_ms`. */
  readonly sessionWallMs?: number | undefined
  /** Clé d'appariement (groupe, clone, répétition) : fixe la graine des contrôles. */
  readonly pairingKey: string
}

export function hasFPlatformPilotPeriod(db: string, trajectoryKey: string, periodIndex: number): boolean {
  return readRows(db, trajectoryKey).some((r) => r.period_index === periodIndex)
}

/**
 * Après la session de la période : note le commit (T74), calcule les
 * régressions, relève coûts et qualité du code, et persiste la ligne.
 * Idempotent : une période déjà persistée n'est jamais renotée.
 */
export async function controlFPlatformPilotPeriod(input: ControlFPlatformPilotPeriodInput): Promise<void> {
  const db = input.postgresDatabase
  ensureTable(db)
  const previous = readRows(db, input.trajectoryKey)
  if (previous.some((r) => r.period_index === input.periodIndex)) return
  const n = input.periodIndex
  const seed = fPlatformSeedOf(input.pairingKey)
  const candidateCommand = [process.execPath, path.join(input.workspaceDir, CANDIDATE_ENTRYPOINT_FILENAME)]
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-f-platform-pilot-'))
  try {
    const targeted = await scorePlatformTargeted({
      period: n,
      seed,
      candidateCommand,
      benchDataDir: path.join(scratch, 'targeted'),
      postgresDatabase: db,
      cwd: input.workspaceDir,
    })
    const differential = await scorePlatformDifferential({
      period: n,
      seed,
      candidateCommand,
      benchDataDir: path.join(scratch, 'differential'),
      postgresDatabase: db,
      cwd: input.workspaceDir,
    })
    const satisfiedBefore = new Set<string>()
    for (const r of previous) {
      if (r.period_index >= n) continue
      for (const [c, s] of Object.entries(r.targeted)) if (s.score === 1) satisfiedBefore.add(c)
    }
    const regressions = Object.entries(targeted.clauses)
      .filter(([c, s]) => s.score < 1 && satisfiedBefore.has(c))
      .map(([c]) => c)
      .sort()
    const counts = sessionCounts(input.rawOutput)
    writeRow(db, {
      trajectory_key: input.trajectoryKey,
      period_index: n,
      period_key: `P${nn(n)}`,
      configuration_id: input.configurationId,
      arm: input.arm,
      repetition: repetitionOfTrajectory(input.trajectoryKey),
      seed,
      commit_sha: input.commitSha,
      workspace_dir: input.workspaceDir,
      targeted: targeted.clauses,
      differential: { score: differential.score, satisfied: differential.satisfied, total: differential.total },
      regressions,
      tokens: tokensOf(input.usage),
      turns: counts.turns,
      duration_ms: counts.duration_ms ?? input.sessionWallMs ?? null,
      cost_usd: counts.cost_usd,
      code_quality: measureCodeQuality({ workspaceDir: input.workspaceDir, commitSha: input.commitSha }),
    })
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

/* ══════════════════════════════════════════════════════════ le rapport ═══ */

export interface FPlatformReportTrajectory {
  readonly trajectory_key: string
  readonly configuration_id: string
  readonly scenario_id: string
}

interface Stat {
  readonly mean: number
  readonly min: number
  readonly max: number
  readonly n: number
}

function stat(values: readonly (number | null | undefined)[]): Stat | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (xs.length === 0) return null
  return { mean: xs.reduce((s, v) => s + v, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs), n: xs.length }
}

/** Coût d'une session pour le rapport entre bras : le total de ses jetons. */
const sessionCost = (row: FPlatformPeriodRow): number => row.tokens['total'] ?? USAGE_CATEGORIES.reduce((s, c) => s + (row.tokens[c] ?? 0), 0)

export interface FPlatformPilotReportInput {
  readonly postgresDatabase: string
  readonly trajectories: readonly FPlatformReportTrajectory[]
  readonly arms: readonly PilotArm[]
  readonly periodsPerTrajectory: number
  /** Nombre maximal de tirages (au-delà, tirages pseudo-aléatoires) et graine. */
  readonly resampling?: { readonly maxDraws?: number; readonly seed?: string } | undefined
}

interface Group {
  readonly arm: string | null
  readonly configuration_id: string
  readonly label: string | null
  /** répétition -> période -> ligne */
  readonly byRepetition: Map<number, Map<number, FPlatformPeriodRow>>
}

export async function fPlatformPilotReport(input: FPlatformPilotReportInput): Promise<Readonly<Json>> {
  const db = input.postgresDatabase
  ensureTable(db)
  const groups = new Map<string, Group>()
  const periods: Json[] = []
  const armOf = (configurationId: string): PilotArm | null => input.arms.find((a) => a.configuration === configurationId) ?? null

  for (const t of input.trajectories.filter((x) => x.scenario_id === F_PLATFORM_SCENARIO_ID)) {
    const rows = readRows(db, t.trajectory_key)
    const arm = armOf(t.configuration_id)
    const group =
      groups.get(t.configuration_id) ??
      ({ arm: arm?.arm ?? null, configuration_id: t.configuration_id, label: arm?.label ?? null, byRepetition: new Map() } satisfies Group)
    groups.set(t.configuration_id, group)
    const repetition = repetitionOfTrajectory(t.trajectory_key)
    const byPeriod = new Map<number, FPlatformPeriodRow>()
    if (repetition !== null) group.byRepetition.set(repetition, byPeriod)
    for (const row of rows) {
      byPeriod.set(row.period_index, row)
      const targetedScores: Record<string, number> = {}
      const targetedCounts: Record<string, Json> = {}
      for (const [c, s] of Object.entries(row.targeted)) {
        targetedScores[c] = s.score
        targetedCounts[c] = { satisfied: s.satisfied, total: s.total }
      }
      periods.push({
        trajectory_key: t.trajectory_key,
        configuration_id: t.configuration_id,
        arm: group.arm,
        repetition,
        period: row.period_key,
        period_index: row.period_index,
        seed: row.seed,
        commit_sha: row.commit_sha,
        workspace_dir: row.workspace_dir,
        targeted_scores: targetedScores,
        targeted_counts: targetedCounts,
        differential_score: row.differential.score,
        differential_counts: { satisfied: row.differential.satisfied, total: row.differential.total },
        regressions: [...row.regressions],
        tokens: { ...row.tokens },
        turns: row.turns,
        duration_ms: row.duration_ms,
        cost_usd: row.cost_usd,
        session_cost: sessionCost(row),
        code_quality: { ...row.code_quality },
      })
    }
  }

  /* ── par bras et par période : {mean, min, max, n} de chaque mesure ── */
  const lastPeriod = Math.max(0, input.periodsPerTrajectory)
  const aggregates: Json[] = []
  for (const g of groups.values()) {
    const perPeriod: Json[] = []
    for (let n = 1; n <= lastPeriod; n += 1) {
      const rows = [...g.byRepetition.values()].map((m) => m.get(n)).filter((r): r is FPlatformPeriodRow => r !== undefined)
      if (rows.length === 0) continue
      const put = (target: Json, name: string, values: readonly (number | null | undefined)[]): void => {
        const s = stat(values)
        if (s !== null) target[name] = s
      }
      const targeted: Json = {}
      for (const c of [...new Set(rows.flatMap((r) => Object.keys(r.targeted)))].sort()) put(targeted, c, rows.map((r) => r.targeted[c]?.score))
      const measures: Json = { targeted_scores: targeted }
      put(measures, 'differential_score', rows.map((r) => r.differential.score))
      put(measures, 'regressions', rows.map((r) => r.regressions.length))
      const tokens: Json = {}
      for (const cat of [...USAGE_CATEGORIES, 'total']) put(tokens, cat, rows.map((r) => r.tokens[cat]))
      measures['tokens'] = tokens
      put(measures, 'turns', rows.map((r) => r.turns))
      put(measures, 'duration_ms', rows.map((r) => r.duration_ms))
      put(measures, 'cost_usd', rows.map((r) => r.cost_usd))
      put(measures, 'session_cost', rows.map(sessionCost))
      const quality: Json = {}
      for (const q of QUALITY_MEASURES) put(quality, q, rows.map((r) => r.code_quality[q]))
      measures['code_quality'] = quality
      perPeriod.push({ period: `P${nn(n)}`, period_index: n, measures })
    }
    aggregates.push({
      arm: g.arm,
      configuration_id: g.configuration_id,
      label: g.label,
      trajectory_count: g.byRepetition.size,
      periods: perPeriod,
    })
  }

  return {
    scenario_id: F_PLATFORM_SCENARIO_ID,
    arms: input.arms.map((a) => ({ ...a })),
    statistics: 'par bras et par periode : moyenne, minimum, maximum et effectif (trajectoires) de chaque mesure',
    periods,
    aggregates,
    cost_ratio: costRatioReport(input, groups, lastPeriod),
  }
}

/* ═══════════════════════════════ rapport de coût entre bras (T33) ═══════ */

function costRatioReport(input: FPlatformPilotReportInput, groups: ReadonlyMap<string, Group>, lastPeriod: number): Json | null {
  const pair = comparedArms(input.arms)
  if (pair === null) return null
  const ref = groups.get(pair.reference.configuration)
  const trt = groups.get(pair.treatment.configuration)
  if (ref === undefined || trt === undefined) return null

  const costAt = (g: Group, rep: number, n: number, cumulative: boolean): number | null => {
    const m = g.byRepetition.get(rep)
    if (m === undefined) return null
    let sum = 0
    for (let k = cumulative ? 1 : n; k <= n; k += 1) {
      const r = m.get(k)
      if (r === undefined) return null
      sum += sessionCost(r)
    }
    return sum
  }

  const series = (cumulative: boolean): Json[] => {
    const out: Json[] = []
    for (let n = 1; n <= lastPeriod; n += 1) {
      const units = [...ref.byRepetition.keys()]
        .filter((rep) => trt.byRepetition.has(rep))
        .filter((rep) => costAt(ref, rep, n, cumulative) !== null && costAt(trt, rep, n, cumulative) !== null)
        .sort((x, y) => x - y)
      if (units.length === 0) continue
      const num = (rep: number): number => costAt(trt, rep, n, cumulative) as number
      const den = (rep: number): number => costAt(ref, rep, n, cumulative) as number
      const { method, seed, draws } = pairedDraws(units, {
        ...(input.resampling?.maxDraws !== undefined ? { maxDraws: input.resampling.maxDraws } : {}),
        seed: `${input.resampling?.seed ?? 'bench-t76'}|${cumulative ? 'cumulative' : 'per_period'}|P${nn(n)}`,
      })
      const ratios = draws.map((d) => ratioOfMeans(d, num, den))
      const finite = ratios.filter((r): r is number => r !== null)
      const meanOf = (f: (rep: number) => number): number => units.reduce((s, u) => s + f(u), 0) / units.length
      out.push({
        period: `P${nn(n)}`,
        period_index: n,
        ratio: ratioOfMeans(units, num, den),
        mean_cost_reference: meanOf(den),
        mean_cost_treatment: meanOf(num),
        repetitions: units,
        resampling: {
          method,
          seed,
          draws,
          ratios,
          interval: empiricalInverseQuantileInterval(finite, RESAMPLING_LOWER_Q, RESAMPLING_UPPER_Q),
        },
      })
    }
    return out
  }

  return {
    numerator_arm: pair.treatment.arm,
    denominator_arm: pair.reference.arm,
    cost_measure: 'tokens_total',
    definition:
      'rapport des moyennes : moyenne sur les repetitions du cout du bras numerateur divisee par celle du bras denominateur ; ' +
      'cumule a Pn : couts sommes de P1 a Pn. Cout d une session : total de ses jetons, toutes categories.',
    method:
      'T33 : reechantillonnage apparie des repetitions (un meme tirage pour les deux bras), rapport des moyennes par tirage, ' +
      `bande ponctuelle ${String(RESAMPLING_LOWER_Q)}-${String(RESAMPLING_UPPER_Q)} par quantile empirique inverse (rang ceil(q n)), jamais simultanee`,
    per_period: series(false),
    cumulative: series(true),
  }
}
