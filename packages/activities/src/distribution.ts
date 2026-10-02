// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ÉTAGE VERT de T40 (cahier L505-L512) : « vérifier la
// capacité de distribution sans facture IA massive ».
//
// TROIS RÔLES, UN PAR SOUS-COMMANDE `apps/cli` (section III de l'en-tête
// d'`acceptance/T40.spec.ts` — l'auteure de cette suite est aveugle à ce
// fichier, ADR-001 ; ce fichier ne redéfinit rien du contrat, il se contente
// de le satisfaire) :
//
//   planDistribution(input)          -> PlanDistributionResult
//       VALIDATION PURE d'un profil de charge (A1) : un produit de cinq
//       entiers pour les trajectoires, multiplié par les périodes par
//       trajectoire. AUCUNE écriture PostgreSQL, AUCUN appel fournisseur —
//       c'est ce qui rend A2 vrai par CONSTRUCTION : une fonction qui ne
//       touche jamais `postgresDatabase` ne peut laisser aucune trace
//       attribuable à `--plan-id` dans aucune table.
//   runDistributionBounded(input)    -> RunDistributionBoundedResult
//       Démarre `jobs` jobs courts, chacun une seule Activity FACTICE,
//       régulés par la MÊME file d'admission que T26 (cahier L379-385,
//       `@bench/workflows` admission-queue.ts + `./admitted-effect.ts`,
//       `runAdmittedEffect`) — pas une réimplémentation séparée du plafond de
//       concurrence, le MÊME mécanisme à l'échelle des jobs plutôt que des
//       appels modèle. Chaque complétion est persistée DURABLEMENT
//       (PostgreSQL réel, table `distribution_jobs`) avant que la complétion
//       suivante ne soit even considérée, ce qui rend `--test-stop-after-
//       completions` reproductible : le processus peut s'arrêter à tout
//       moment après coup, aucune complétion déjà écrite n'est perdue (A5,
//       cahier L371-377).
//   resumeDistribution(input)        -> ResumeDistributionResult
//       Relit `distribution_runs`/`distribution_jobs` sous `campaignId` (même
//       base) et achève les jobs dont l'index n'a pas encore de ligne
//       persistée — jamais une seconde fois ceux déjà complétés (A5, « ne
//       perd aucun job » ⇒ ne double aucun job non plus, même discipline que
//       A3 : couverture exacte de `echoed_index`).
//
// POURQUOI `@bench/workflows`/`admitted-effect.ts` ET PAS UNE RÉGULATION DE
// CONCURRENCE SÉPARÉE. Le cahier (L509, commentaire III de la suite) nomme
// explicitement T26 comme précédent de la technique du plafond observé par
// barrière. `submitReadyCall`/`releaseCall` (admission-queue.ts) admettent
// SYNCHRONEMENT, sans `await` avant la décision (voir son en-tête) : un lot de
// jobs soumis par un seul `Array.from({length: jobs}, (_, i) => doJob(i))`
// (aucun `await` entre deux soumissions) conserve donc l'ordre d'arrivée réel,
// et au plus `cap` jobs sont actifs simultanément — exactement ce que A4
// observe par une barrière HTTP réelle hébergée par la suite elle-même.
//
// POURQUOI `psql` EN SOUS-PROCESSUS, PAS UN DRIVER `pg` — même raison et même
// geste que `./run-period.ts` (T23) et `./campaign.ts` (T38) : aucun pilote
// PostgreSQL n'est au lockfile (toucher `pnpm-lock.yaml` est une zone INFRA
// pour un besoin que `psql`, déjà requis par `postgres18`, couvre entièrement).
//
// POURQUOI LE MAGASIN D'ARTEFACTS LOCAL (T13) PLUTÔT QUE S3 (T14). Le contrat
// fixé par la suite (section III) ne donne à `distribution-run-bounded` aucun
// drapeau `--s3-bucket` : seul `--test-large-artifact-bytes` déclenche le
// stockage d'un gros artefact, dans un répertoire dédié sous le répertoire
// temporaire du système. L'adaptateur local (`openArtifactStore({ root })`,
// `@bench/storage`, T13) satisfait le MÊME port que l'adaptateur S3 (T14) —
// « le cœur métier [...] les interfaces sont implémentées par adaptateurs »
// (cahier L34) — et c'est tout ce que A6 observe : une RÉFÉRENCE courte et non
// vide, jamais les octets eux-mêmes dans l'export d'historique.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'

import { openArtifactStore, putArtifact } from '@bench/storage'
import { openAdmissionQueue } from '@bench/workflows'
import type { QueueHandle } from '@bench/workflows'

import { runAdmittedEffect } from './admitted-effect.js'

/* ══════════════════════════ A. `plan-distribution` (A1, A2) ══════════════ */

export interface PlanDistributionInput {
  readonly campaignId: string
  readonly mode: string
  readonly parents: number
  readonly scenarios: number
  readonly configurations: number
  readonly repetitions: number
  readonly budgets: number
  readonly periodsPerTrajectory: number
}

export interface PlanDistributionResult {
  readonly campaign_id: string
  readonly mode: string
  readonly trajectories: number
  readonly periods: number
  readonly model_calls_dispatched: number
}

/**
 * Validation pure (A1) : AUCUNE écriture, AUCUN appel fournisseur (A2) — ni
 * PostgreSQL ni réseau ne sont même ouverts ici.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function planDistribution(input: PlanDistributionInput): Promise<PlanDistributionResult> {
  const trajectories =
    input.parents * input.scenarios * input.configurations * input.repetitions * input.budgets
  const periods = trajectories * input.periodsPerTrajectory
  return {
    campaign_id: input.campaignId,
    mode: input.mode,
    trajectories,
    periods,
    model_calls_dispatched: 0,
  }
}

/* ══════════════════════════════ PostgreSQL réel (psql) ════════════════════ */

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

interface PsqlResult {
  readonly ok: boolean
  readonly out: string
}

function runPsql(dsn: string, sql: string): PsqlResult {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsn, '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() }
  }
}

function execSqlOrThrow(dsn: string, sql: string, contexte: string): string {
  const r = runPsql(dsn, sql)
  if (!r.ok) throw new Error(`${contexte} : ${r.out.slice(0, 500)}`)
  return r.out
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function sqlLiteralOrNull(value: string | null): string {
  return value === null ? 'NULL' : `'${escapeLiteral(value)}'`
}

/** Tables propres à T40, créées à la demande — jamais sous les migrations
 * centrales de `@bench/storage` (T12), dont le schéma est partagé par toutes
 * les tâches : ce fichier ne lui ajoute rien. */
function ensureDistributionTables(dsn: string): void {
  execSqlOrThrow(
    dsn,
    'CREATE TABLE IF NOT EXISTS distribution_runs (' +
      'campaign_id text PRIMARY KEY, jobs_total integer NOT NULL, ' +
      'created_at timestamptz NOT NULL DEFAULT now())',
    'distribution.ensureDistributionTables(distribution_runs)',
  )
  execSqlOrThrow(
    dsn,
    'CREATE TABLE IF NOT EXISTS distribution_jobs (' +
      'campaign_id text NOT NULL, job_index integer NOT NULL, job_id text NOT NULL, ' +
      "phase text NOT NULL, artifact_reference text, completed_at timestamptz NOT NULL DEFAULT now(), " +
      'PRIMARY KEY (campaign_id, job_index))',
    'distribution.ensureDistributionTables(distribution_jobs)',
  )
}

function upsertRun(dsn: string, campaignId: string, jobsTotal: number): void {
  execSqlOrThrow(
    dsn,
    `INSERT INTO distribution_runs(campaign_id, jobs_total) VALUES ('${escapeLiteral(campaignId)}', ${String(jobsTotal)}) ` +
      'ON CONFLICT (campaign_id) DO UPDATE SET jobs_total = EXCLUDED.jobs_total',
    'distribution.upsertRun',
  )
}

function readRunJobsTotal(dsn: string, campaignId: string): number | null {
  const r = runPsql(dsn, `SELECT jobs_total FROM distribution_runs WHERE campaign_id = '${escapeLiteral(campaignId)}'`)
  if (!r.ok) throw new Error(`distribution.readRunJobsTotal : ${r.out.slice(0, 500)}`)
  if (r.out.trim() === '') return null
  const n = Number.parseInt(r.out.trim(), 10)
  if (!Number.isInteger(n)) throw new Error(`distribution.readRunJobsTotal : jobs_total illisible (${r.out})`)
  return n
}

function insertCompletedJob(
  dsn: string,
  campaignId: string,
  jobIndex: number,
  jobId: string,
  phase: string,
  artifactReference: string | null,
): void {
  execSqlOrThrow(
    dsn,
    'INSERT INTO distribution_jobs(campaign_id, job_index, job_id, phase, artifact_reference) VALUES (' +
      `'${escapeLiteral(campaignId)}', ${String(jobIndex)}, '${escapeLiteral(jobId)}', ` +
      `'${escapeLiteral(phase)}', ${sqlLiteralOrNull(artifactReference)}) ` +
      'ON CONFLICT (campaign_id, job_index) DO NOTHING',
    'distribution.insertCompletedJob',
  )
}

interface PersistedJobRow {
  readonly jobIndex: number
  readonly jobId: string
  readonly phase: string
  readonly artifactReference: string | null
}

/** Une ligne par job déjà persisté, triée par index — jamais relu deux fois
 * par `distribution-resume` (A5 : couverture exacte, aucun doublon). */
function readCompletedJobs(dsn: string, campaignId: string): PersistedJobRow[] {
  const r = runPsql(
    dsn,
    'SELECT job_index || \'|\' || job_id || \'|\' || phase || \'|\' || coalesce(artifact_reference, \'\') ' +
      `FROM distribution_jobs WHERE campaign_id = '${escapeLiteral(campaignId)}' ORDER BY job_index`,
  )
  if (!r.ok) throw new Error(`distribution.readCompletedJobs : ${r.out.slice(0, 500)}`)
  if (r.out.trim() === '') return []
  return r.out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const i1 = line.indexOf('|')
      const i2 = line.indexOf('|', i1 + 1)
      const i3 = line.indexOf('|', i2 + 1)
      const jobIndex = Number.parseInt(line.slice(0, i1), 10)
      const jobId = line.slice(i1 + 1, i2)
      const phase = line.slice(i2 + 1, i3)
      const artifactReference = line.slice(i3 + 1)
      return { jobIndex, jobId, phase, artifactReference: artifactReference === '' ? null : artifactReference }
    })
}

/* ══════════════════════ B. le travail d'UNE Activity FACTICE ═════════════ */

/** GET bloquant : ne se résout que lorsque le serveur distant écrit une
 * réponse — c'est la barrière HTTP réelle d'A4 (cahier L379-385) qui pilote
 * ce délai, jamais un minuteur local. */
function httpGetAwait(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.on('data', () => {
        /* le corps de la réponse (« libere »/« fermeture ») n'importe pas */
      })
      res.on('end', () => resolve())
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

function largeArtifactStoreRoot(campaignId: string): string {
  const safe = campaignId.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const root = path.join(os.tmpdir(), 'bench-distribution-artifacts', safe)
  fs.mkdirSync(root, { recursive: true })
  return root
}

/** Octets ALÉATOIRES (donc incompressibles, A6), stockés via le magasin
 * d'artefacts (T13) ; rend la RÉFÉRENCE courte, jamais les octets. */
async function storeLargeArtifact(campaignId: string, bytes: number): Promise<string> {
  const root = largeArtifactStoreRoot(campaignId)
  const handle = openArtifactStore({ root })
  const data = crypto.randomBytes(bytes)
  const manifest = await Promise.resolve(putArtifact(handle, data))
  return (manifest as { readonly ref: string }).ref
}

const PHASE_COMPLETED = 'COMPLETED' // cahier:L97
const DISTRIBUTION_PROVIDER_ID = 'distribution-run' // un seul fournisseur logique : le plafond porte sur LES JOBS

/** Le travail FIXE d'une Activity factice (section III de la suite) : attend
 * la barrière si demandée, stocke le gros artefact SEULEMENT pour l'index 0
 * si demandé, et rend sa référence (ou `null`). */
async function fakeJobActivity(
  campaignId: string,
  index: number,
  testActivityBarrierUrl: string | undefined,
  testLargeArtifactBytes: number | undefined,
): Promise<string | null> {
  if (testActivityBarrierUrl !== undefined) {
    await httpGetAwait(testActivityBarrierUrl)
  }
  if (testLargeArtifactBytes !== undefined && index === 0) {
    return storeLargeArtifact(campaignId, testLargeArtifactBytes)
  }
  return null
}

/* ══════════════════ C. export d'historique — RÉFÉRENCES, jamais le contenu */

export interface DistributionJobResult {
  readonly job_id: string
  readonly echoed_index: number
  readonly phase: string
  readonly artifact_reference: string | null
}

function writeHistoryExport(
  exportPath: string,
  campaignId: string,
  results: readonly DistributionJobResult[],
): void {
  // Schéma au choix de cette implémentation (comme `--export-history` de
  // T24) : seules RÉFÉRENCES courtes ici, jamais le contenu d'un artefact —
  // c'est ce qui rend A6 vrai par construction plutôt que par une limite de
  // taille appliquée après coup.
  const payload = {
    schema: 'bench.distribution-history/1',
    campaign_id: campaignId,
    jobs: results.map((r) => ({
      job_id: r.job_id,
      echoed_index: r.echoed_index,
      phase: r.phase,
      artifact_reference: r.artifact_reference,
    })),
  }
  fs.writeFileSync(exportPath, JSON.stringify(payload))
}

/* ══════════════════ D. l'arrêt simulé — EXACTEMENT ce que la suite exige ═══ */

/** Écrit EXACTEMENT `{ campaign_id, crash_simulated: true,
 * completions_before_crash }` sur la sortie standard (jamais via
 * `process.stdout.write`, dont l'écriture sur un tube est ASYNCHRONE sous
 * POSIX — `fs.writeSync` est un appel système synchrone, garanti complet
 * avant que `process.exit` ne coupe le processus), puis sort en code non nul
 * SANS traiter les jobs restants (A5, cahier L371-377). `never` : cette
 * fonction ne rend jamais la main à son appelant.
 */
function crashExit(campaignId: string, completionsBeforeCrash: number): never {
  const payload = { campaign_id: campaignId, crash_simulated: true, completions_before_crash: completionsBeforeCrash }
  fs.writeSync(1, `${JSON.stringify(payload)}\n`)
  process.exit(1)
}

/* ══════════════════════ E. `distribution-run-bounded` (A3, A4, A5, A6) ═══ */

export interface RunDistributionBoundedInput {
  readonly campaignId: string
  readonly mode: string
  readonly jobs: number
  readonly postgresDatabase: string
  readonly maxConcurrent?: number
  readonly testActivityBarrierUrl?: string
  readonly testStopAfterCompletions?: number
  readonly testLargeArtifactBytes?: number
  readonly exportHistoryPath?: string
}

export interface RunDistributionBoundedResult {
  readonly campaign_id: string
  readonly jobs_submitted: number
  readonly results: readonly DistributionJobResult[]
}

export async function runDistributionBounded(
  input: RunDistributionBoundedInput,
): Promise<RunDistributionBoundedResult> {
  const dsn = dsnFor(input.postgresDatabase)
  ensureDistributionTables(dsn)
  upsertRun(dsn, input.campaignId, input.jobs)

  // Sans `--max-concurrent` : aucun plafond réel (A3), cap = jobs. AVEC : le
  // MÊME mécanisme de file (A4), cap = la valeur demandée.
  const cap =
    input.maxConcurrent !== undefined && input.maxConcurrent > 0
      ? input.maxConcurrent
      : Math.max(1, input.jobs)
  const queue: QueueHandle = await openAdmissionQueue({ cap, seed: 0 })

  let completions = 0
  const results: DistributionJobResult[] = new Array(input.jobs) as DistributionJobResult[]

  async function doJob(index: number): Promise<void> {
    const jobId = crypto.randomUUID()
    const artifactReference = await runAdmittedEffect<string | null>(
      queue,
      { callId: jobId, providerId: DISTRIBUTION_PROVIDER_ID, now: Date.now() },
      () => fakeJobActivity(input.campaignId, index, input.testActivityBarrierUrl, input.testLargeArtifactBytes),
    )

    // DURABLEMENT persisté AVANT que la complétion suivante ne soit décidée
    // (A5) : `execFileSync` bloque tout le fil d'exécution le temps de
    // l'écriture, donc ce bloc ne s'entrelace avec aucune autre complétion.
    insertCompletedJob(dsn, input.campaignId, index, jobId, PHASE_COMPLETED, artifactReference)
    results[index] = {
      job_id: jobId,
      echoed_index: index,
      phase: PHASE_COMPLETED,
      artifact_reference: artifactReference,
    }
    completions += 1
    if (input.testStopAfterCompletions !== undefined && completions === input.testStopAfterCompletions) {
      crashExit(input.campaignId, completions) // ne rend jamais la main
    }
  }

  // AUCUN `await` entre deux soumissions (même règle que admission-queue.ts,
  // en-tête) : les `jobs` admissions sont décidées dans l'ordre d'index.
  await Promise.all(Array.from({ length: input.jobs }, (_, i) => doJob(i)))

  if (input.exportHistoryPath !== undefined) {
    writeHistoryExport(input.exportHistoryPath, input.campaignId, results)
  }

  return { campaign_id: input.campaignId, jobs_submitted: input.jobs, results }
}

/* ══════════════════════════ F. `distribution-resume` (A5) ════════════════ */

export interface ResumeDistributionInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly exportHistoryPath?: string
}

export interface ResumeDistributionResult {
  readonly campaign_id: string
  readonly jobs_total: number
  readonly results: readonly DistributionJobResult[]
}

export async function resumeDistribution(input: ResumeDistributionInput): Promise<ResumeDistributionResult> {
  const dsn = dsnFor(input.postgresDatabase)
  ensureDistributionTables(dsn)

  const jobsTotal = readRunJobsTotal(dsn, input.campaignId)
  if (jobsTotal === null) {
    throw new Error(
      `distribution-resume : aucun run connu pour campaign_id=${input.campaignId} dans ${input.postgresDatabase}`,
    )
  }

  const completed = readCompletedJobs(dsn, input.campaignId)
  const completedByIndex = new Map(completed.map((r) => [r.jobIndex, r]))

  const results: DistributionJobResult[] = []
  for (let index = 0; index < jobsTotal; index += 1) {
    const existing = completedByIndex.get(index)
    if (existing !== undefined) {
      results.push({
        job_id: existing.jobId,
        echoed_index: index,
        phase: existing.phase,
        artifact_reference: existing.artifactReference,
      })
      continue
    }
    // Un job jamais complété avant l'arrêt : achevé ICI, jamais rejoué pour
    // un index déjà présent (A5, même discipline de couverture exacte qu'A3).
    const jobId = crypto.randomUUID()
    insertCompletedJob(dsn, input.campaignId, index, jobId, PHASE_COMPLETED, null)
    results.push({ job_id: jobId, echoed_index: index, phase: PHASE_COMPLETED, artifact_reference: null })
  }

  if (input.exportHistoryPath !== undefined) {
    writeHistoryExport(input.exportHistoryPath, input.campaignId, results)
  }

  return { campaign_id: input.campaignId, jobs_total: jobsTotal, results }
}
