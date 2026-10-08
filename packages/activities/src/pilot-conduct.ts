// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'orchestrateur `bench pilot-conduct` (T46, ADR-007
// L157-L163) : conduit CHAQUE trajectoire compilée d'un manifeste de pilote
// (T39, même format `bench.pilot.manifest/1`), PÉRIODE PAR PÉRIODE, à travers
// `runPeriodOnce` (T23/T45, `./run-period.js`) — jamais une simple boucle
// au-dessus de `run-period` (ADR-007, « Arbitrage ») : chaque trajectoire
// compilée reçoit sa PROPRE identité (`trajectory_key`, dérivée ici, jamais
// fournie par l'appelant) et son PROPRE scénario/configuration (T45), sous une
// identité de CAMPAGNE supérieure (`--campaign-id` de CETTE commande) que
// `run-period` ne connaît pas (ADR-007, L59-L61 : `campaign` écrit
// `trajectories`, `run-period` écrit `bench_run_period_trajectories` — deux
// schémas disjoints que T46 relie, sans en détourner aucun).
//
// CE QUE CE FICHIER AJOUTE À CÔTÉ DE `run-period` : DEUX TABLES PROPRES, DANS
// LE MÊME POSTGRESQL (`--postgres-database`), par le même mécanisme `psql`
// direct que `./run-period.ts` emploie pour les siennes (`bench_run_period_
// trajectories`, `bench_checkpoint_manifests`) — jamais une migration du
// schéma central (`@bench/storage`), qui n'a aucune raison de connaître
// l'identité de campagne de T46 :
//
//   bench_pilot_conduct_trajectories  la COMPILATION du manifeste, PERSISTÉE
//                                     une fois par trajectoire sous cette
//                                     campagne (idempotent, ON CONFLICT DO
//                                     NOTHING) — relue, jamais recompilée, à
//                                     chaque invocation suivante (A5).
//   bench_pilot_conduct_periods       une ligne par période RÉELLEMENT
//                                     persistée pour cette campagne, portant
//                                     les `model_call_id` réglés par
//                                     `@bench/gateway` (T44/T17) pour cette
//                                     période — la base du rapport de tokens
//                                     (A3).
//
// LE MODÈLE APPELÉ, PAR PÉRIODE. `run-period` (T23) n'appelle jamais
// `@bench/gateway` : il assemble une période métier (PostgreSQL + S3), sans
// aucun appel modèle facturé. T46 (ADR-007 L159 : « rapport de fin en tokens
// par modèle et par catégorie ») a besoin d'un appel modèle RÉELLEMENT réglé
// par période, pour que `token_report` agrège autre chose qu'un décompte
// inventé : ce fichier dispatche donc, EN PLUS de `runPeriodOnce`, un appel au
// fournisseur factice (`@bench/gateway`, T44/T17) par période réellement
// persistée, sous un budget RÉEL (`@bench/billing`, T16) qui porte le
// plafond — ou l'enveloppe large substituée à `unbounded: true` ci-dessous —
// déclaré par le manifeste (A4).
//
// `budget.unbounded` (ADR-007 L159/L161, TROISIÈME forme du prérequis
// `budget`, AJOUTÉE par cette tâche à celles déjà fixées par T39 — cahier
// §E/L501, `acceptance/T39.spec.ts` II.2 : `{ cap_micro_usd }` plafonné,
// `{}` absent/refusé). Aucune notion de plafond illimité n'existe dans
// `@bench/billing` (T16, cahier L291-L298) — et l'étendre pour une ABSENCE de
// contrainte aurait touché un paquet hors des `source_paths` de T46
// (`verification/tasks.extensions.json#T46`) pour un comportement qu'une
// enveloppe assez large produit déjà, sans ambiguïté, pour tout manifeste de
// cette échelle : `UNBOUNDED_BUDGET_LIMIT_MICRO_USD` ci-dessous.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { openBudget, reserveBudget } from '@bench/billing'
import { applyMigrations, closeStore, openStore } from '@bench/storage'
import { createFakeProvider, dispatchModelCall, getModelCall } from '@bench/gateway'
import type { ModelCallRecord } from '@bench/gateway'

import { runPeriodOnce } from './run-period.js'
import { aggregateClaudeCliUsage, countClaudeCliPeriods, runPeriodOnceClaudeCli } from './run-period-claude-cli.js'

type Json = Record<string, unknown>

/* ══════════════════════ manifeste `bench.pilot.manifest/1`, étendu (II) ═══ */

interface ConductManifestGroup {
  readonly source_parent_project_id: string
  readonly source_scenario_id: string
  readonly clone_instance_ids: readonly string[]
}

interface ConductManifestBudget {
  readonly cap_micro_usd?: string
  /** AJOUTÉ par T46 (ADR-007 L159/L161) : budget déclaré SANS plafond — un
   *  troisième prérequis valide, distinct de `{}` (absent, toujours refusé). */
  readonly unbounded?: boolean
}

interface ConductManifest {
  readonly schema?: string
  readonly corpus?: { readonly groups?: readonly ConductManifestGroup[] }
  readonly model?: { readonly name?: string }
  readonly price?: { readonly tariff_micro_usd?: string }
  readonly exposure?: { readonly predefined?: boolean; readonly value?: string }
  readonly budget?: ConductManifestBudget
  readonly configurations?: readonly string[]
  readonly repetitions?: number
  readonly periods_per_trajectory?: number
}

function loadConductManifest(manifestPath: string): ConductManifest {
  const absPath = path.isAbsolute(manifestPath) ? manifestPath : path.resolve(process.cwd(), manifestPath)
  const raw = fs.readFileSync(absPath, 'utf8')
  return JSON.parse(raw) as ConductManifest
}

/** Les cinq prérequis (même ordre, même vocabulaire que T39 — `acceptance/
 *  T39.spec.ts` II.2, `missingPilotPrerequisites`, `./pilot.ts`). */
export const PILOT_CONDUCT_PREREQUISITES = ['model', 'price', 'corpus', 'exposure', 'budget'] as const

/** Un prérequis est ABSENT si son objet est `{}` — vide ou absent (même règle
 *  que T39). `{ unbounded: true }` n'est PAS vide : c'est la forme AJOUTÉE par
 *  cette tâche, jamais confondue avec l'absence (verification/mutants/T46.json,
 *  M4 — c'est exactement la perturbation INVERSE que ce fichier doit éviter). */
function isEmptyPrerequisite(o: object | undefined): boolean {
  return o === undefined || o === null || Object.keys(o).length === 0
}

function missingConductPrerequisites(manifest: ConductManifest): string[] {
  const missing: string[] = []
  if (isEmptyPrerequisite(manifest.model)) missing.push('model')
  if (isEmptyPrerequisite(manifest.price)) missing.push('price')
  const groups = manifest.corpus?.groups ?? []
  if (groups.length === 0) missing.push('corpus')
  if (isEmptyPrerequisite(manifest.exposure)) missing.push('exposure')
  if (isEmptyPrerequisite(manifest.budget)) missing.push('budget')
  return missing
}

function trajectoryCount(manifest: ConductManifest): number {
  const groups = manifest.corpus?.groups ?? []
  const clones = groups.reduce((acc, g) => acc + (g.clone_instance_ids?.length ?? 0), 0)
  const configCount = manifest.configurations?.length ?? 0
  const repetitions = manifest.repetitions ?? 0
  return clones * configCount * repetitions
}

function periodCount(manifest: ConductManifest): number {
  return trajectoryCount(manifest) * (manifest.periods_per_trajectory ?? 0)
}

/** Forme EFFECTIVE du prérequis budget, échoée telle quelle (section II du
 *  contrat) — jamais devinée : `unbounded: true` SEULEMENT si le manifeste le
 *  déclare mot pour mot, sinon le plafond déclaré. */
function effectiveBudget(manifest: ConductManifest): Readonly<Json> {
  if (manifest.budget?.unbounded === true) return { unbounded: true }
  return { cap_micro_usd: String(manifest.budget?.cap_micro_usd ?? '0') }
}

/** Voir l'en-tête du fichier : substitut d'une absence de plafond, jamais
 *  littéralement infini (PostgreSQL n'a pas cette notion), mais hors de
 *  portée de tout manifeste que cette tâche exerce. */
const UNBOUNDED_BUDGET_LIMIT_MICRO_USD = '1000000000000000000000000000000' // 10^30 micro-USD

function budgetLimit(manifest: ConductManifest): string {
  if (manifest.budget?.unbounded === true) return UNBOUNDED_BUDGET_LIMIT_MICRO_USD
  return String(manifest.budget?.cap_micro_usd ?? '0')
}

/* ══════════════════════ plan : une trajectoire par (groupe,clone,config,rep) */

interface ConductTrajectoryPlan {
  readonly trajectory_key: string
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
}

/**
 * Même produit cartésien que `planPilotTrajectories` (T39, `./pilot.ts`),
 * mais chaque trajectoire reçoit ICI sa propre identité STABLE
 * (`trajectory_key`) : déterministe depuis l'identité de CAMPAGNE
 * (`campaignId`) et sa position dans le manifeste — jamais fournie par
 * l'appelant (`acceptance/T46.spec.ts`, section « LA RAISON… »), et STABLE
 * entre deux invocations successives sur le même manifeste et la même
 * campagne (A5 : la seconde invocation doit retrouver le MÊME ensemble).
 */
function planConductTrajectories(campaignId: string, manifest: ConductManifest): ConductTrajectoryPlan[] {
  const groups = manifest.corpus?.groups ?? []
  const configurations = manifest.configurations ?? []
  const repetitions = manifest.repetitions ?? 0
  const plans: ConductTrajectoryPlan[] = []
  groups.forEach((group, groupIndex) => {
    for (const cloneInstanceId of group.clone_instance_ids) {
      for (const configurationId of configurations) {
        for (let rep = 1; rep <= repetitions; rep += 1) {
          plans.push({
            trajectory_key: `${campaignId}--g${String(groupIndex)}--${cloneInstanceId}--${configurationId}--rep${String(rep)}`,
            // L'identité du PARENT reste celle du GROUPE (même règle que T39) —
            // jamais celle du clone.
            parent_project_id: group.source_parent_project_id,
            scenario_id: group.source_scenario_id,
            configuration_id: configurationId,
          })
        }
      }
    }
  })
  return plans
}

/* ══════════════════════════════════ PostgreSQL réel (psql, comme run-period) */

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
    return execFileSync('psql', ['-tAqX', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `pilot-conduct.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(
        0,
        800,
      ),
    )
  }
}

const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

const TRAJECTORIES_TABLE = 'bench_pilot_conduct_trajectories'
const PERIODS_TABLE = 'bench_pilot_conduct_periods'

function ensureConductTables(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${TRAJECTORIES_TABLE} (
       campaign_id text NOT NULL,
       trajectory_key text NOT NULL,
       parent_project_id text NOT NULL,
       scenario_id text NOT NULL,
       configuration_id text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (campaign_id, trajectory_key)
     )`,
  )
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${PERIODS_TABLE} (
       campaign_id text NOT NULL,
       trajectory_key text NOT NULL,
       period_index integer NOT NULL,
       model_call_ids jsonb NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (campaign_id, trajectory_key, period_index)
     )`,
  )
}

/**
 * Compile, PUIS PERSISTE (idempotent — `ON CONFLICT … DO NOTHING`), chaque
 * trajectoire du manifeste sous cette campagne. La LECTURE qui alimente la
 * réponse (`readPersistedTrajectories` ci-dessous) se fait TOUJOURS depuis
 * cette table, jamais depuis `plans` directement — l'identité de campagne est
 * ainsi PERSISTÉE et RELUE, jamais recompilée à chaque appel (A5).
 */
function persistCompiledTrajectories(db: string, campaignId: string, plans: readonly ConductTrajectoryPlan[]): void {
  for (const p of plans) {
    runPsql(
      db,
      `INSERT INTO ${TRAJECTORIES_TABLE}(campaign_id, trajectory_key, parent_project_id, scenario_id, configuration_id)
         VALUES (${sqlLit(campaignId)}, ${sqlLit(p.trajectory_key)}, ${sqlLit(p.parent_project_id)}, ${sqlLit(p.scenario_id)}, ${sqlLit(p.configuration_id)})
       ON CONFLICT (campaign_id, trajectory_key) DO NOTHING`,
    )
  }
}

interface PersistedTrajectory {
  readonly trajectory_key: string
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
}

function readPersistedTrajectories(db: string, campaignId: string): PersistedTrajectory[] {
  const out = runPsql(
    db,
    `SELECT trajectory_key, parent_project_id, scenario_id, configuration_id FROM ${TRAJECTORIES_TABLE}
       WHERE campaign_id = ${sqlLit(campaignId)} ORDER BY trajectory_key`,
  )
  if (out === '') return []
  return out.split('\n').map((line) => {
    const fields = line.split('|')
    return {
      trajectory_key: fields[0] ?? '',
      parent_project_id: fields[1] ?? '',
      scenario_id: fields[2] ?? '',
      configuration_id: fields[3] ?? '',
    }
  })
}

function countPersistedPeriods(db: string, campaignId: string, trajectoryKey: string): number {
  const out = runPsql(
    db,
    `SELECT COUNT(*) FROM ${PERIODS_TABLE} WHERE campaign_id = ${sqlLit(campaignId)} AND trajectory_key = ${sqlLit(trajectoryKey)}`,
  )
  const n = Number.parseInt(out, 10)
  return Number.isInteger(n) ? n : 0
}

function totalPersistedPeriods(db: string, campaignId: string): number {
  const out = runPsql(db, `SELECT COUNT(*) FROM ${PERIODS_TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`)
  const n = Number.parseInt(out, 10)
  return Number.isInteger(n) ? n : 0
}

function persistPeriod(
  db: string,
  campaignId: string,
  trajectoryKey: string,
  periodIndex: number,
  modelCallIds: readonly string[],
): void {
  runPsql(
    db,
    `INSERT INTO ${PERIODS_TABLE}(campaign_id, trajectory_key, period_index, model_call_ids)
       VALUES (${sqlLit(campaignId)}, ${sqlLit(trajectoryKey)}, ${String(periodIndex)}, ${sqlLit(JSON.stringify(modelCallIds))}::jsonb)
     ON CONFLICT (campaign_id, trajectory_key, period_index) DO NOTHING`,
  )
}

interface PersistedPeriod {
  readonly trajectory_key: string
  readonly period_index: number
  readonly model_call_ids: readonly string[]
}

function parseModelCallIds(raw: string | undefined): string[] {
  if (raw === undefined || raw === '') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function readPersistedPeriods(db: string, campaignId: string): PersistedPeriod[] {
  const out = runPsql(
    db,
    `SELECT trajectory_key, period_index, model_call_ids::text FROM ${PERIODS_TABLE}
       WHERE campaign_id = ${sqlLit(campaignId)} ORDER BY trajectory_key, period_index`,
  )
  if (out === '') return []
  return out.split('\n').map((line) => {
    const fields = line.split('|')
    const periodIndex = Number.parseInt(fields[1] ?? '', 10)
    return {
      trajectory_key: fields[0] ?? '',
      period_index: Number.isInteger(periodIndex) ? periodIndex : 0,
      model_call_ids: parseModelCallIds(fields[2]),
    }
  })
}

/* ══════════════════════ token_report : agrégat CUMULATIF (A3) ═══════════ */

/** Les cinq catégories ADR-002, reprises à l'identique de `@bench/gateway`
 *  (T44, ADR-007 L145) — jamais une sixième (ce fichier ne dispatche que des
 *  réponses FINES, section « Le modèle appelé » ci-dessus, donc aucun appel
 *  de cette tâche ne porte `cache_unresolved`). */
const TOKEN_CATEGORIES = ['input_fresh', 'cache_write_5m', 'cache_write_1h', 'cache_read', 'output'] as const

function numOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function zeroVector(): Record<string, number> {
  return { input_fresh: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 0 }
}

/**
 * Reconstruit `token_report.by_model`, CUMULATIF sur toutes les périodes
 * persistées pour la campagne, par relecture DIRECTE de `getModelCall`
 * (`@bench/gateway`, déjà prouvé par T44) — jamais un compteur tenu en
 * mémoire par ce fichier, qui pourrait diverger de ce que la base porte
 * réellement (même discipline que la suite d'acceptation elle-même, IV.3).
 */
async function buildTokenReport(handle: unknown, periods: readonly PersistedPeriod[]): Promise<Readonly<Json>> {
  const byModel = new Map<string, Record<string, number>>()
  const ids = [...new Set(periods.flatMap((p) => p.model_call_ids))]
  for (const id of ids) {
    const record: ModelCallRecord | null = await getModelCall(handle, { model_call_id: id })
    const model = record?.model !== undefined && record.model.length > 0 ? record.model : 'UNKNOWN'
    const usage = (record?.usage ?? {}) as Record<string, unknown>
    const vector = byModel.get(model) ?? zeroVector()
    for (const cat of TOKEN_CATEGORIES) {
      vector[cat] = (vector[cat] ?? 0) + numOrZero(usage[cat])
    }
    byModel.set(model, vector)
  }
  return { by_model: Object.fromEntries(byModel) }
}

/* ══════════════════════════════════ conductPilot (T46) ═══════════════════ */

export interface ConductPilotInput {
  readonly manifestPath: string
  /** Identité SUPÉRIEURE (la CAMPAGNE, A5) — jamais l'identité de trajectoire
   *  que `run-period` connaît déjà (ADR-007 L121). */
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly provider: string
  readonly mode: string
  /** Point d'injection nommé (cahier:L141) : arrête le processus APRÈS avoir
   *  persisté exactement ce nombre de périodes au total pour la campagne
   *  (compte global, toutes trajectoires confondues). */
  readonly testStopAfterPeriods?: number | undefined
  /** `--live` (T49, ADR-008 L98) — SEULEMENT quand `provider === 'claude-cli'` ;
   *  ignoré sous `--provider fake` (A5 : le comportement de T46 est inchangé). */
  readonly live?: boolean | undefined
  /** `--candidate-workspace-root` (T49, même nom et même rôle que
   *  `./candidate-period.ts`, T48) — EXIGÉ quand `provider === 'claude-cli'`. */
  readonly candidateWorkspaceRoot?: string | undefined
}

/**
 * Branche `--provider claude-cli` de `conductPilot` (T49, ADR-008
 * L149/L151). Conduit chaque trajectoire compilee du manifeste, PERIODE PAR
 * PERIODE, via `runPeriodOnceClaudeCli` (`./run-period-claude-cli.ts`,
 * T47/T48) — jamais le fournisseur factice ni le budget reel de
 * `@bench/billing` (voir l'en-tete du fichier, « Le modele appele »
 * pour T46 : ce chemin ne s'applique qu'au fournisseur factice). Refuse
 * AVANT TOUT APPEL si `--live` est absent (A6, meme discipline que
 * `run-period --provider claude-cli`) ou si `--candidate-workspace-root`
 * manque.
 */
async function conductPilotClaudeCli(
  input: ConductPilotInput,
  manifest: ConductManifest,
  plans: readonly ConductTrajectoryPlan[],
): Promise<Readonly<Json>> {
  if (input.live !== true) {
    throw new Error(
      "bench pilot-conduct --provider claude-cli refusé : --live absent (ADR-008:L98) — le fournisseur claude-cli n'est jamais invoqué",
    )
  }
  if (input.candidateWorkspaceRoot === undefined) {
    throw new Error('bench pilot-conduct --provider claude-cli exige --candidate-workspace-root')
  }
  const modelName = manifest.model?.name
  if (modelName === undefined || modelName.length === 0) {
    throw new Error('bench pilot-conduct --provider claude-cli exige model.name dans le manifeste')
  }

  const db = input.postgresDatabase
  const campaignId = input.campaignId
  const periodsPerTrajectory = manifest.periods_per_trajectory ?? 0
  let interrupted = false
  let totalSoFar = plans.reduce((sum, p) => sum + countClaudeCliPeriods(db, p.trajectory_key), 0)

  outer: for (const plan of plans) {
    const already = countClaudeCliPeriods(db, plan.trajectory_key)
    for (let i = already + 1; i <= periodsPerTrajectory; i += 1) {
      if (input.testStopAfterPeriods !== undefined && totalSoFar >= input.testStopAfterPeriods) {
        interrupted = true
        break outer
      }
      const outcome = await runPeriodOnceClaudeCli({
        campaignId: plan.trajectory_key,
        postgresDatabase: db,
        live: true,
        model: modelName,
        candidateWorkspaceRoot: input.candidateWorkspaceRoot,
        scenarioId: plan.scenario_id,
      })
      if (!outcome.persisted) {
        throw new Error(
          `bench pilot-conduct : session claude-cli en échec pour ${plan.trajectory_key} période ${String(i)} : ${outcome.failure_reason ?? 'motif inconnu'}`,
        )
      }
      totalSoFar += 1
    }
  }

  const persistedTrajectories = readPersistedTrajectories(db, campaignId)
  const periodsByTrajectory = new Map<string, number>()
  for (const t of persistedTrajectories) {
    periodsByTrajectory.set(t.trajectory_key, countClaudeCliPeriods(db, t.trajectory_key))
  }
  const totalPersisted = [...periodsByTrajectory.values()].reduce((sum, n) => sum + n, 0)
  const candidateByModel = aggregateClaudeCliUsage(
    db,
    persistedTrajectories.map((t) => t.trajectory_key),
  )

  return {
    schema: 'bench.pilot_conduct.result/1',
    campaign_id: campaignId,
    trajectory_count: trajectoryCount(manifest),
    period_count: periodCount(manifest),
    periods_persisted: totalPersisted,
    ready: true,
    missing_prerequisites: [],
    interrupted,
    budget: effectiveBudget(manifest),
    trajectories: persistedTrajectories.map((t) => ({
      trajectory_key: t.trajectory_key,
      parent_project_id: t.parent_project_id,
      scenario_id: t.scenario_id,
      configuration_id: t.configuration_id,
      periods_persisted: periodsByTrajectory.get(t.trajectory_key) ?? 0,
    })),
    periods: [],
    token_report: { by_model: {} },
    candidate_token_report: { by_model: candidateByModel },
  }
}

/**
 * `bench pilot-conduct` (T46, ADR-007 L157-L163). Refuse AVANT TOUTE
 * CONNEXION si un prérequis manque (même discipline que `runPilot`/T39,
 * `./pilot.ts`) — ni trajectoire ni période persistée pour ce `campaignId`
 * dans ce cas (A4(c)). Sinon, compile et PERSISTE chaque trajectoire, puis
 * l'avance, PÉRIODE PAR PÉRIODE, via `runPeriodOnce` (T23/T45) ET un appel
 * modèle réglé (`@bench/gateway`, T44/T17, sous un budget réel `@bench/
 * billing`, T16) — jusqu'à `periods_per_trajectory`, ou jusqu'à ce que
 * `testStopAfterPeriods` soit atteint pour la campagne entière.
 */
export async function conductPilot(input: ConductPilotInput): Promise<Readonly<Json>> {
  const manifest = loadConductManifest(input.manifestPath)
  const missing = missingConductPrerequisites(manifest)
  if (missing.length > 0) {
    throw new Error(
      `bench pilot-conduct refusé : prérequis manquants ${JSON.stringify(missing)} ` +
        `(ADR-007:L161 — « un budget absent reste refusé comme l'exige T39 » ; cahier:L501 — ` +
        `un défaut de prérequis produit BLOCKED, jamais PASS)`,
    )
  }
  if (input.mode !== 'recorded' && input.mode !== 'live') {
    throw new Error(`bench pilot-conduct exige --mode recorded|live (reçu ${JSON.stringify(input.mode)})`)
  }
  if (input.provider !== 'fake' && input.provider !== 'claude-cli') {
    throw new Error(`bench pilot-conduct exige --provider fake|claude-cli (reçu ${JSON.stringify(input.provider)})`)
  }

  const db = input.postgresDatabase
  const campaignId = input.campaignId
  const plans = planConductTrajectories(campaignId, manifest)

  ensureConductTables(db)
  persistCompiledTrajectories(db, campaignId, plans)

  // ── T49 (ADR-008 L149) : branche ENTIEREMENT SEPAREE du fournisseur
  // `claude-cli`, qui ne traverse JAMAIS le fournisseur factice ni le budget
  // reel ci-dessous (voir l'en-tete de ./run-period-claude-cli.ts) — c'est ce
  // qui rend A5 (fournisseur factice inchange) vrai PAR CONSTRUCTION.
  if (input.provider === 'claude-cli') {
    return conductPilotClaudeCli(input, manifest, plans)
  }

  const dsn = dsnFor(db)
  await applyMigrations({ dsn })
  const handle = openStore({ dsn })

  try {
    const budgetId = `pilot-conduct-budget-${campaignId}`
    await openBudget(handle, { budget_id: budgetId, limit: budgetLimit(manifest) })

    const tariffRaw = String(manifest.price?.tariff_micro_usd ?? '0')
    const tariff = { input_uncached_per_token: Number(tariffRaw), input_cached_per_token: 0, output_per_token: 0 }
    const modelName = manifest.model?.name
    const provider = createFakeProvider({
      provider: input.provider,
      ...(modelName !== undefined ? { model: modelName } : {}),
      // Réponse FINE (T44, ADR-002) : les cinq catégories, toujours des
      // entiers non négatifs — le contrat (V) ne prescrit aucune valeur
      // précise. UN SEUL jeton `input_fresh`, pour que le coût réglé
      // (tariff.input_uncached_per_token × ce jeton) égale exactement le
      // montant RÉSERVÉ ci-dessous (`tariffRaw`) — même convention que T39
      // (`./pilot.ts`, réponse à un seul jeton non mis en cache) : réserver
      // et régler un montant DIFFÉRENT romprait l'invariant de budget sans
      // rien apprendre sur le rapport de tokens, qui n'est pas affecté par
      // la VALEUR choisie ici (seules les clés comptent pour A3).
      responses: [
        {
          text: '',
          usage: {
            input_fresh_tokens: 1,
            cache_write_5m_tokens: 0,
            cache_write_1h_tokens: 0,
            cache_read_tokens: 0,
            output_tokens: 0,
          },
        },
      ],
    })

    const periodsPerTrajectory = manifest.periods_per_trajectory ?? 0
    let totalSoFar = totalPersistedPeriods(db, campaignId)
    let interrupted = false

    outer: for (const plan of plans) {
      const already = countPersistedPeriods(db, campaignId, plan.trajectory_key)
      for (let i = already + 1; i <= periodsPerTrajectory; i += 1) {
        if (input.testStopAfterPeriods !== undefined && totalSoFar >= input.testStopAfterPeriods) {
          interrupted = true
          break outer
        }

        // ── `run-period` (T23/T45) : l'identité PARAMÉTRÉE de CETTE trajectoire,
        // jamais une boucle aveugle (ADR-007, « Arbitrage »).
        const outcome = await runPeriodOnce({
          mode: 'recorded',
          campaignId: plan.trajectory_key,
          postgresDatabase: db,
          s3Bucket: input.s3Bucket,
          scenarioId: plan.scenario_id,
          configurationId: plan.configuration_id,
        })
        if (!outcome.ok) {
          throw new Error(
            `bench pilot-conduct : run-period a refusé la trajectoire ${plan.trajectory_key} (période ${String(i)}) : ${outcome.reason}`,
          )
        }

        // ── l'appel modèle RÉGLÉ de cette période (T44/T17/T16) — voir l'en-tête.
        const modelCallId = `mc-pilot-conduct-${campaignId}-${plan.trajectory_key}-p${String(i)}`
        const reservation = await reserveBudget(handle, { budget_id: budgetId, amount: tariffRaw })
        if (!reservation.accepted || reservation.reservation_id === undefined) {
          throw new Error(
            `bench pilot-conduct : réservation budgétaire refusée pour ${plan.trajectory_key}#${String(i)} ` +
              `(${reservation.code ?? 'INCONNU'}) — un plafond déclaré par ce manifeste devrait couvrir cette campagne`,
          )
        }
        const dispatch = await dispatchModelCall(handle, {
          model_call_id: modelCallId,
          idempotency_key: `idem-${modelCallId}`,
          budget_id: budgetId,
          reservation_id: reservation.reservation_id,
          provider,
          request: { campaign_id: campaignId, trajectory_key: plan.trajectory_key, period_index: i },
          tariff,
        })
        if (dispatch.status !== 'SETTLED') {
          throw new Error(
            `bench pilot-conduct : l'appel modèle ${modelCallId} n'a pas été réglé (status=${dispatch.status})`,
          )
        }

        persistPeriod(db, campaignId, plan.trajectory_key, i, [modelCallId])
        totalSoFar += 1
      }
    }

    const persistedTrajectories = readPersistedTrajectories(db, campaignId)
    const persistedPeriods = readPersistedPeriods(db, campaignId)
    const tokenReport = await buildTokenReport(handle, persistedPeriods)

    const periodsByTrajectory = new Map<string, number>()
    for (const p of persistedPeriods) {
      periodsByTrajectory.set(p.trajectory_key, (periodsByTrajectory.get(p.trajectory_key) ?? 0) + 1)
    }

    return {
      schema: 'bench.pilot_conduct.result/1',
      campaign_id: campaignId,
      trajectory_count: trajectoryCount(manifest),
      period_count: periodCount(manifest),
      periods_persisted: persistedPeriods.length,
      ready: true,
      missing_prerequisites: [],
      interrupted,
      budget: effectiveBudget(manifest),
      trajectories: persistedTrajectories.map((t) => ({
        trajectory_key: t.trajectory_key,
        parent_project_id: t.parent_project_id,
        scenario_id: t.scenario_id,
        configuration_id: t.configuration_id,
        periods_persisted: periodsByTrajectory.get(t.trajectory_key) ?? 0,
      })),
      periods: persistedPeriods.map((p) => ({
        trajectory_key: p.trajectory_key,
        period_index: p.period_index,
        model_call_ids: p.model_call_ids,
      })),
      token_report: tokenReport,
    }
  } finally {
    await closeStore(handle)
  }
}
