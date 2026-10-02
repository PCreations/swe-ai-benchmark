// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — `bench analysis export` / `bench analysis run` (T42,
// cahier L523-L529 : « reconstruction du rapport depuis les SEULS exports
// donne les memes valeurs »).
//
// DEUX COMMANDES, DEUX PROCESSUS, UN SEUL FICHIER COMME FRONTIÈRE.
//
//   exportAnalysis({ postgresDatabase })
//       Relit, sur PostgreSQL RÉEL, la table ad hoc que `./campaign.ts`
//       (`bench campaign`, T38) écrit déjà à la fin de chaque campagne
//       (`bench_campaign_analysis`, un miroir JSON du rapport publié, keyé par
//       campaign_id). Ne prend AUCUN `--campaign-id` : le squelette T41 fixe
//       `analysis export --postgres-database <db>` sans ce drapeau, donc
//       cette commande énumère TOUTES les campagnes déjà écrites dans cette
//       base — golden-six (A2/A4) n'en écrit qu'une seule.
//
//   runAnalysisFromExport({ exportPath })
//       Lit SEULEMENT le fichier désigné : ni PostgreSQL ni S3 ne sont
//       contactés (le squelette T41 ne porte ni `--postgres-database` ni
//       `--s3-bucket` pour `analysis run`). Reconstitue trajectory_count,
//       period_count, model_calls_settled_count, total_cost_micro_usd et
//       Q/R/V/U/G par une AGRÉGATION INDÉPENDANTE — `aggregateCampaignQuality`
//       de `./campaign.ts`, rejouée sur des données relues depuis un fichier,
//       jamais sur l'objet mémoire que `runCampaign` a déjà retourné.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'

import { addMicroUsd, microUsd } from '@bench/contracts'

import { aggregateCampaignQuality } from './campaign.js'
import type { TrajectoryReport } from './campaign.js'

/* ══════════════════════════════════ PostgreSQL réel (psql) ═══════════════ */

function socketDir(): string {
  const h = process.env.PGHOST
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h
  return '/var/run/postgresql'
}
function pgUser(): string {
  return process.env.PGUSER ?? os.userInfo().username
}
function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(pgUser())}@/${encodeURIComponent(db)}?host=${encodeURIComponent(socketDir())}`
}

function runPsql(db: string, sql: string): string {
  try {
    return execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `analysis.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(0, 800),
    )
  }
}

const CAMPAIGN_ANALYSIS_TABLE = 'bench_campaign_analysis'

/** Même DDL que `./campaign.ts#persistCampaignAnalysis` — idempotente, pour
 * qu'un export lancé avant toute campagne ne lève jamais une table absente. */
function ensureCampaignAnalysisTable(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${CAMPAIGN_ANALYSIS_TABLE} (
       campaign_id text PRIMARY KEY,
       report jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

export interface ExportAnalysisInput {
  readonly postgresDatabase: string
}

export interface AnalysisExportCampaign {
  readonly campaign_id: string
  readonly trajectories: readonly unknown[]
}

export interface AnalysisExport {
  readonly schema: 'bench.t42.analysis_export/1'
  readonly campaigns: readonly AnalysisExportCampaign[]
}

/** `bench analysis export --postgres-database <db>` (T42, section II.2). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function exportAnalysis(input: ExportAnalysisInput): Promise<AnalysisExport> {
  const db = input.postgresDatabase
  ensureCampaignAnalysisTable(db)
  const out = runPsql(db, `SELECT campaign_id, report::text FROM ${CAMPAIGN_ANALYSIS_TABLE} ORDER BY campaign_id`)
  const campaigns: AnalysisExportCampaign[] = []
  if (out !== '') {
    for (const line of out.split('\n')) {
      if (line === '') continue
      const sep = line.indexOf('|')
      if (sep === -1) continue
      const campaignId = line.slice(0, sep)
      const reportJson = line.slice(sep + 1)
      const parsed = JSON.parse(reportJson) as Record<string, unknown>
      const trajectories = Array.isArray(parsed['trajectories']) ? (parsed['trajectories'] as unknown[]) : []
      campaigns.push({ campaign_id: campaignId, trajectories })
    }
  }
  return { schema: 'bench.t42.analysis_export/1', campaigns }
}

export interface RunAnalysisInput {
  readonly exportPath: string
}

/** `bench analysis run <export.json>` (T42, section II.2) — fichier SEUL. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function runAnalysisFromExport(input: RunAnalysisInput): Promise<Record<string, unknown>> {
  const raw = fs.readFileSync(input.exportPath, 'utf8')
  const parsed = JSON.parse(raw) as { campaigns?: readonly AnalysisExportCampaign[] }
  const trajectories = ((parsed.campaigns ?? []).flatMap((c) => c.trajectories ?? [])) as unknown as TrajectoryReport[]

  const periodCount = trajectories.reduce((sum, t) => sum + t.periods.length, 0)
  const modelCallsSettledCount = trajectories.reduce(
    (sum, t) => sum + t.periods.reduce((s, p) => s + p.model_calls_settled, 0),
    0,
  )
  const totalCost =
    trajectories.length === 0 ? microUsd('0') : addMicroUsd(...trajectories.map((t) => microUsd(t.cost_micro_usd)))
  const quality = aggregateCampaignQuality(trajectories)

  return {
    schema: 'bench.t42.analysis_run/1',
    trajectory_count: trajectories.length,
    period_count: periodCount,
    model_calls_settled_count: modelCallsSettledCount,
    total_cost_micro_usd: totalCost,
    Q: quality.Q,
    R: quality.R,
    V: quality.V,
    U: quality.U,
    G: quality.G,
  }
}
