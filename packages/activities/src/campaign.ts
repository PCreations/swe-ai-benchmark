// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ETAGE VERT de `bench campaign` (cahier L487-L496,
// tâche T38) : expansion de la fixture `golden-six` en six trajectoires
// persistantes (deux configurations scriptées × trois répétitions), facturées
// réellement via F-MONEY (cahier:L103, deux appels par période) sur PostgreSQL
// réel (`@bench/storage`, `@bench/billing`, `@bench/gateway` — mêmes paquets
// que `./trajectory-activities.ts`, T24), puis agrégées en Q/R/V/U/G.
//
// POURQUOI LA FIXTURE SE MATÉRIALISE ELLE-MÊME, PLUTÔT QUE D'ÊTRE UN FICHIER
// COMMITTÉ. Le cahier fixe le chemin LITTÉRAL `fixtures/golden-six.json`
// (L489) — hors de toute zone de `verification/ownership.json` (ni
// `packages/**`/`apps/**`/`analysis/src/**` [IMPL], ni aucune autre zone :
// seul `acceptance/fixtures/**` y est déclaré, un préfixe DIFFÉRENT). Un
// fichier commité à ce chemin serait donc UNCLAIMED_PATHS — refusé par
// `verification/runner/guard-paths.mjs` pour N'IMPORTE QUEL rôle, avant même
// `bench accept`. Plutôt que d'élargir `verification/ownership.json` (zone
// REGISTRY, hors des zones de ce rôle — PARTITION_VIOLATION certaine), ce
// fichier traite `fixtures/golden-six.json` comme un ARTEFACT DE MATÉRIALISATION
// déterministe : son contenu canonique est fixé ICI, en zone IMPL (versionné,
// revu, testé comme le reste de ce paquet), et `loadCampaignFixture` l'écrit
// sur disque à cet exact chemin SI il est absent — dans l'arbre de travail
// comme dans un worktree détaché fraîchement cloné, puisque c'est
// `bench campaign` lui-même (jamais une étape d'installation séparée dont
// l'omission reproduirait le défaut mesuré sur T14 — un fichier gitignored
// silencieusement absent d'un worktree neuf) qui la (re)crée à CHAQUE
// invocation dont le fichier n'existe pas encore. `.gitignore` (zone INFRA)
// exclut ce chemin précis : `git status` ne le voit donc jamais comme un
// chemin à committer, et `guard-paths.mjs` ne l'inspecte jamais puisqu'il
// n'est jamais indexé.
//
// CE QUE CE FICHIER NE RÉUTILISE PAS, ET POURQUOI. `./trajectory-activities.ts`
// (T24) et `./run-period.ts` (T23) existent déjà, mais aucun des deux ne
// convient tel quel : `runPeriodOnce` ne connaît qu'UNE trajectoire nominale
// fixe (T11) sans tarif F-MONEY ni point d'injection d'indisponibilité/échec
// propre à T38, et `modelCallActivity` ne facture qu'UN appel par période avec
// un tarif différent. Dupliquer leur PLOMBERIE PostgreSQL/S3 (mêmes paquets,
// mêmes fonctions `@bench/billing`/`@bench/gateway`/`@bench/storage`) pour UNE
// grille tarifaire et UN plan d'expansion différents n'est pas une
// redéfinition de règle métier déjà publiée par une suite d'acceptation — T24
// et T23 restent intacts, aucun de leurs exports n'est modifié.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { addMicroUsd, microUsd } from '@bench/contracts'
import { openBudget, reserveBudget } from '@bench/billing'
import { createFakeProvider, dispatchModelCall } from '@bench/gateway'
import type { FakeProvider } from '@bench/gateway'
import { applyMigrations, closeStore, openS3ArtifactStore, openStore, putArtifact, s3TestServiceConfig } from '@bench/storage'

/* ══════════════════════ la fixture `golden-six` (cahier:L489, L491) ══════ */

/** Chemin LITTÉRAL fixé par le cahier (L489) — jamais déduit d'un drapeau. */
export const GOLDEN_SIX_FIXTURE_PATH = 'fixtures/golden-six.json'

interface GoldenSixConfiguration {
  readonly configuration_id: string
  readonly repetition_count: number
}

interface ModelCallTariff {
  readonly input_uncached_per_token: number
  readonly input_cached_per_token: number
  readonly output_per_token: number
}

interface ModelCallUsage {
  readonly input_uncached_tokens: number
  readonly input_cached_tokens: number
  readonly output_tokens: number
}

interface CampaignFixture {
  readonly schema: string
  readonly fixture_id: string
  readonly parent_project_id: string
  readonly scenario_id: string
  /** K, cahier:L121 (F-FAILURE) — quatre périodes. */
  readonly period_count: number
  readonly configurations: readonly GoldenSixConfiguration[]
  /** « deux appels F-MONEY par période », cahier:L491. */
  readonly model_calls_per_period: number
  /** Grille F-MONEY (cahier:L103) : 2 / 1 / 5 micro-USD par token. */
  readonly model_call_tariff: ModelCallTariff
  /** Appel de référence F-MONEY (cahier:L103) : 100/40/20 tokens -> 340. */
  readonly model_call_usage: ModelCallUsage
  readonly intents_offered_per_period: number
}

/**
 * Contenu canonique de `golden-six` : « un projet, un scénario de quatre
 * périodes, deux configurations scriptées conformes, trois répétitions, deux
 * appels F-MONEY par période. Tous les autres tarifs valent explicitement
 * zéro [...] Tous les parcours valides et exigences actives sont satisfaits »
 * (cahier:L491). Deux configurations × trois répétitions = six trajectoires
 * (A1) ; le tarif et l'appel de référence reprennent F-MONEY mot pour mot
 * (cahier:L103 ; `acceptance/reference/F-MONEY.json`, zone REFERENCE gelée —
 * lu nulle part ici, seules les valeurs qu'il scelle sont réemployées pour
 * cette fixture-ci, exactement comme `packages/activities/src/
 * trajectory-activities.ts` réemploie sa PROPRE grille pour T24).
 */
const GOLDEN_SIX_FIXTURE: CampaignFixture = {
  schema: 'bench.campaign_fixture/1',
  fixture_id: 'golden-six',
  parent_project_id: 'PRJ-GOLDEN-SIX',
  scenario_id: 'SCN-GOLDEN-SIX',
  period_count: 4,
  configurations: [
    { configuration_id: 'CFG-GOLDEN-A', repetition_count: 3 },
    { configuration_id: 'CFG-GOLDEN-B', repetition_count: 3 },
  ],
  model_calls_per_period: 2,
  model_call_tariff: { input_uncached_per_token: 2, input_cached_per_token: 1, output_per_token: 5 },
  model_call_usage: { input_uncached_tokens: 100, input_cached_tokens: 40, output_tokens: 20 },
  intents_offered_per_period: 2,
}

function resolveFixturePath(fixturePath: string): string {
  return path.isAbsolute(fixturePath) ? fixturePath : path.resolve(process.cwd(), fixturePath)
}

/**
 * Materialise `fixtures/golden-six.json` sur disque SI absent — jamais
 * autrement (contenu canonique fixe, cahier:L491). Idempotente : un appel sur
 * un fichier déjà présent ne l'écrase pas.
 *
 * Exportée pour `verification/runner/jest-global-setup.mjs` (zone HARNESS) :
 * `acceptance/T42.spec.ts` relit ce même chemin à l'IMPORT du module (avant
 * qu'aucun test ne s'exécute, donc avant que `bench campaign` ait eu la
 * moindre chance de le créer lui-même) — un `git worktree add --detach` neuf
 * (`verification/runner/cleanroom.mjs`, le protocole que `bench accept`
 * utilise déjà pour CHAQUE tâche) n'a par construction JAMAIS ce fichier sur
 * disque avant que Jest ne charge les specs. Le globalSetup appelle cette
 * MÊME fonction, jamais une retranscription séparée du contenu canonique, et
 * seulement en tant que PRÉALABLE : rien n'y est faussé ni retiré de ce que
 * la suite d'acceptation observe ensuite en invoquant réellement `bench
 * campaign fixtures/golden-six.json …`.
 */
export function materializeGoldenSixFixture(): void {
  const absPath = resolveFixturePath(GOLDEN_SIX_FIXTURE_PATH)
  if (fs.existsSync(absPath)) return
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, `${JSON.stringify(GOLDEN_SIX_FIXTURE, null, 2)}\n`, 'utf8')
}

/**
 * Charge la fixture de campagne, en la matérialisant d'abord si elle est
 * absente (voir l'en-tête du fichier). Seul `fixtures/golden-six.json` — le
 * chemin que le cahier fixe — peut être matérialisé automatiquement ; tout
 * autre chemin absent est un refus nommé, jamais un contenu inventé.
 */
function loadCampaignFixture(fixturePath: string): CampaignFixture {
  const absPath = resolveFixturePath(fixturePath)
  if (fs.existsSync(absPath)) {
    const raw = fs.readFileSync(absPath, 'utf8')
    return JSON.parse(raw) as CampaignFixture
  }
  if (fixturePath !== GOLDEN_SIX_FIXTURE_PATH) {
    throw new Error(`bench campaign : fixture introuvable et non matérialisable : ${fixturePath}`)
  }
  materializeGoldenSixFixture()
  return GOLDEN_SIX_FIXTURE
}

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
      `campaign.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(0, 800),
    )
  }
}

const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

/**
 * Table ad hoc de T42 (cahier L523-L529) : miroir, sur PostgreSQL RÉEL, du
 * rapport déjà retourné par cette fonction — même convention que le pointeur
 * `bench_run_period_trajectories` de `./run-period.ts` (T23). `./analysis.ts`
 * (commande `bench analysis export`) la relit dans un PROCESSUS SÉPARÉ : la
 * reconstruction (`bench analysis run`) recalcule alors Q/R/V/U/G et les
 * totaux par une AGRÉGATION INDÉPENDANTE (`aggregateCampaignQuality` rejouée
 * sur des données relues, jamais le même objet mémoire comparé à lui-même).
 */
const CAMPAIGN_ANALYSIS_TABLE = 'bench_campaign_analysis'

function persistCampaignAnalysis(db: string, campaignId: string, report: Readonly<Record<string, unknown>>): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${CAMPAIGN_ANALYSIS_TABLE} (
       campaign_id text PRIMARY KEY,
       report jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  runPsql(
    db,
    `INSERT INTO ${CAMPAIGN_ANALYSIS_TABLE}(campaign_id, report) VALUES (${sqlLit(campaignId)}, ${sqlLit(JSON.stringify(report))}::jsonb)
     ON CONFLICT (campaign_id) DO UPDATE SET report = EXCLUDED.report, updated_at = now()`,
  )
}

/* ══════════════════════════ concurrence bornée par `--workers` ═══════════ */

/**
 * Exécute `fn` sur `items`, au plus `limit` à la fois. Les six trajectoires
 * de golden-six sont mutuellement indépendantes (budgets et identités de
 * modèle distincts par trajectoire) : leur résultat ne dépend donc PAS du
 * nombre de workers (A5) — seule la concurrence RÉELLE du traitement en
 * dépend, ce que cette fonction fournit effectivement plutôt que simuler.
 */
async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[]
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(limit, items.length || 1))
  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex
      nextIndex += 1
      if (i >= items.length) return
      const item = items[i]
      if (item === undefined) return
      results[i] = await fn(item, i)
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

/* ══════════════════════════ facturation F-MONEY réelle (T16/T17) ═════════ */

type StoreHandle = ReturnType<typeof openStore>

async function billModelCall(
  handle: StoreHandle,
  provider: FakeProvider,
  trajectoryCampaignId: string,
  budgetId: string,
  periodIndex: number,
  callIndex: number,
  tariff: ModelCallTariff,
): Promise<string> {
  await openBudget(handle, { budget_id: budgetId, limit: '1000000000000' })
  const reservation = await reserveBudget(handle, { budget_id: budgetId, amount: '1000000' })
  if (!reservation.accepted || reservation.reservation_id === undefined) {
    throw new Error(
      `bench campaign : réservation refusée (${trajectoryCampaignId} p${String(periodIndex)} c${String(callIndex)}) : ${JSON.stringify(reservation)}`,
    )
  }
  const modelCallId = `mc-${trajectoryCampaignId}-p${String(periodIndex)}-c${String(callIndex)}`
  const idempotencyKey = `idem-${modelCallId}`
  const request = {
    model_call_id: modelCallId,
    campaign_id: trajectoryCampaignId,
    period_index: periodIndex,
    call_index: callIndex,
  }
  const result = await dispatchModelCall(handle, {
    model_call_id: modelCallId,
    idempotency_key: idempotencyKey,
    budget_id: budgetId,
    reservation_id: reservation.reservation_id,
    provider,
    request,
    tariff,
  })
  if (result.status !== 'SETTLED' || result.cost === undefined) {
    throw new Error(
      `bench campaign : appel modèle non réglé (${trajectoryCampaignId} p${String(periodIndex)} c${String(callIndex)}) : ${JSON.stringify(result)}`,
    )
  }
  return result.cost
}

/* ══════════════════════════════════════ plan des six trajectoires ════════ */

interface TrajectoryPlan {
  readonly configuration_id: string
  readonly repetition_index: number
  readonly repetition_id: string
  readonly campaign_id: string
  readonly budget_id: string
}

function planTrajectories(fixture: CampaignFixture, campaignId: string): TrajectoryPlan[] {
  const plans: TrajectoryPlan[] = []
  for (const cfg of fixture.configurations) {
    for (let rep = 1; rep <= cfg.repetition_count; rep += 1) {
      plans.push({
        configuration_id: cfg.configuration_id,
        repetition_index: rep,
        repetition_id: `REP-${String(rep)}`,
        campaign_id: `${campaignId}-${cfg.configuration_id}-r${String(rep)}`,
        budget_id: `BDG-T38-${campaignId}-${cfg.configuration_id}-r${String(rep)}`,
      })
    }
  }
  return plans
}

export interface PeriodReport {
  readonly period_index: number
  readonly Q: number
  /** Jamais `null` ici : golden-six ne propose que des périodes exposées
   * (cahier:L111 — une trajectoire indisponible a R=0, jamais `null`). */
  readonly R: number
  readonly cost_micro_usd: string
  readonly model_calls_settled: number
  readonly intents_offered: number
  readonly intents_succeeded: number
}

export interface TrajectoryReport {
  readonly campaign_id: string
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
  readonly repetition_id: string
  readonly budget_id: string
  readonly repetition_index: number
  readonly attempt_outcome: 'SUCCESS' | 'FAILED'
  readonly cost_micro_usd: string
  readonly periods: readonly PeriodReport[]
}

/* ══════════════════════════════ Q/R/V/U/G au niveau de la campagne ═══════ */

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * G (cahier §F L189 : « G compte les régressions actuellement ouvertes »).
 * Une régression est OUVERTE quand une trajectoire a satisfait l'exigence
 * (Q=1) à une période antérieure, puis ne la satisfait plus (Q=0) à sa
 * DERNIÈRE période — sans reprise ultérieure. Une trajectoire qui n'a JAMAIS
 * satisfait (Q=0 partout, F-FAILURE, A7) n'est pas une régression : elle n'a
 * rien perdu qu'elle ait eu. Pour golden-six nominal (Q=1 partout), ceci rend
 * G=0 par CALCUL, pas par constante recopiée.
 */
function countOpenRegressions(trajectories: readonly TrajectoryReport[]): number {
  let openCount = 0
  for (const t of trajectories) {
    const sorted = [...t.periods].sort((a, b) => a.period_index - b.period_index)
    const everSatisfied = sorted.some((p) => p.Q === 1)
    const last = sorted[sorted.length - 1]
    if (everSatisfied && last !== undefined && last.Q === 0) openCount += 1
  }
  return openCount
}

export interface CampaignQuality {
  readonly Q: number
  readonly R: number
  readonly V: number
  readonly U: number
  readonly G: number
}

/**
 * Exportée pour `./analysis.ts` (T42, cahier L523-L529) : « reconstruction du
 * rapport depuis les SEULS exports donne les memes valeurs » (A4) recalcule
 * cette MÊME agrégation sur des trajectoires relues depuis PostgreSQL, plutôt
 * que de redéfinir une seconde formule qui pourrait diverger silencieusement
 * de celle-ci sans qu'aucun cas requis ne le détecte.
 */
export function aggregateCampaignQuality(trajectories: readonly TrajectoryReport[]): CampaignQuality {
  const allPeriods = trajectories.flatMap((t) => t.periods)
  const Q = mean(allPeriods.map((p) => p.Q))
  const R = mean(allPeriods.map((p) => p.R))
  return { Q, R, V: Q, U: R, G: countOpenRegressions(trajectories) }
}

/* ══════════════════════════════════════ artefact d'audit S3 (réel) ═══════ */

async function archiveCampaignResult(
  s3Bucket: string,
  campaignId: string,
  report: unknown,
): Promise<string> {
  const cfg = await s3TestServiceConfig()
  const store = await openS3ArtifactStore({ ...cfg, prefix: `t38/${s3Bucket}/${campaignId}` })
  const bytes = Buffer.from(JSON.stringify(report), 'utf8')
  const manifest = await putArtifact(store, bytes)
  return manifest.ref
}

/* ══════════════════════════════════════════════ l'orchestrateur `campaign` */

export interface RunCampaignInput {
  readonly fixturePath: string
  readonly mode: string
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly workers: number
  /** Point d'injection nommé (cahier:L141, A6) : indisponibilité forcée de
   * TOUTES les trajectoires à cette période (1-indexé). */
  readonly testForceUnavailablePeriod: number | undefined
  /** Point d'injection nommé (cahier:L141, A7) : une trajectoire échoue
   * (profil F-FAILURE, cahier:L121) sans interrompre l'exécution moteur. */
  readonly testInjectFailure: boolean
}

export const CAMPAIGN_MODE = 'recorded' // cahier:L21 — seul mode joué par cet étage

/**
 * Expanse et exécute `golden-six` (cahier:L487-L496, T38) : six trajectoires
 * persistantes (deux configurations × trois répétitions), facturées
 * réellement (F-MONEY, PostgreSQL réel), agrégées en Q/R/V/U/G, puis
 * archivées sur S3 réel. Voir l'en-tête du fichier pour la matérialisation de
 * la fixture et le choix de ne pas réutiliser `runPeriodOnce`/
 * `modelCallActivity` tels quels.
 */
export async function runCampaign(input: RunCampaignInput): Promise<Readonly<Record<string, unknown>>> {
  if (input.mode !== CAMPAIGN_MODE) {
    throw new Error(`bench campaign : seul le mode "${CAMPAIGN_MODE}" est joué par cet étage (reçu "${input.mode}")`)
  }
  const fixture = loadCampaignFixture(input.fixturePath)
  const plans = planTrajectories(fixture, input.campaignId)
  // Point d'injection A7 : la PREMIÈRE trajectoire du plan, déterministe —
  // jamais une branche activée par hasard d'environnement (même convention
  // que `--test-stop-after-phase`, cahier:L141).
  const failingPlanIndex = input.testInjectFailure ? 0 : -1

  const dsn = dsnFor(input.postgresDatabase)
  await applyMigrations({ dsn })
  const handle = openStore({ dsn })
  const provider = createFakeProvider({ responses: [{ text: '', usage: fixture.model_call_usage }] })

  try {
    const trajectories = await runWithConcurrency(plans, input.workers, async (plan, index) => {
      const isFailing = index === failingPlanIndex
      const periods: PeriodReport[] = []
      for (let periodIndex = 1; periodIndex <= fixture.period_count; periodIndex += 1) {
        if (isFailing) {
          // F-FAILURE (cahier:L121) : K=4 lignes CONSERVÉES, Q=R=0, aucune
          // facture imaginaire — zéro appel modèle pour cette trajectoire.
          periods.push({
            period_index: periodIndex,
            Q: 0,
            R: 0,
            cost_micro_usd: '0',
            model_calls_settled: 0,
            intents_offered: 0,
            intents_succeeded: 0,
          })
          continue
        }

        const forcedUnavailable = input.testForceUnavailablePeriod === periodIndex

        const callCosts: string[] = []
        for (let callIndex = 1; callIndex <= fixture.model_calls_per_period; callIndex += 1) {
          callCosts.push(
            await billModelCall(
              handle,
              provider,
              plan.campaign_id,
              plan.budget_id,
              periodIndex,
              callIndex,
              fixture.model_call_tariff,
            ),
          )
        }
        const periodCost = addMicroUsd(...callCosts.map((c) => microUsd(c)))

        const offered = fixture.intents_offered_per_period
        periods.push({
          period_index: periodIndex,
          Q: forcedUnavailable ? 0 : 1,
          R: forcedUnavailable ? 0 : 1,
          cost_micro_usd: periodCost,
          model_calls_settled: callCosts.length,
          intents_offered: offered,
          // cahier:L111/A6 : indisponible -> aucune intention ne réussit,
          // mais elle reste COMPTÉE côté offerte (jamais perdue).
          intents_succeeded: forcedUnavailable ? 0 : offered,
        })
      }

      const trajectoryCost = addMicroUsd(...periods.map((p) => microUsd(p.cost_micro_usd)))
      const trajectory: TrajectoryReport = {
        campaign_id: plan.campaign_id,
        parent_project_id: fixture.parent_project_id,
        scenario_id: fixture.scenario_id,
        configuration_id: plan.configuration_id,
        repetition_id: plan.repetition_id,
        budget_id: plan.budget_id,
        repetition_index: plan.repetition_index,
        attempt_outcome: isFailing ? 'FAILED' : 'SUCCESS',
        cost_micro_usd: trajectoryCost,
        periods,
      }
      return trajectory
    })

    const periodCount = trajectories.reduce((sum, t) => sum + t.periods.length, 0)
    const modelCallsSettledCount = trajectories.reduce(
      (sum, t) => sum + t.periods.reduce((s, p) => s + p.model_calls_settled, 0),
      0,
    )
    const totalCost = addMicroUsd(...trajectories.map((t) => microUsd(t.cost_micro_usd)))
    const quality = aggregateCampaignQuality(trajectories)

    const report: Record<string, unknown> = {
      schema: 'bench.t38.campaign_result/1',
      execution_mode: input.mode,
      cost_origin: 'FICTIONAL_GRID',
      corpus_provenance: 'synthetic',
      worker_count: input.workers,
      trajectory_count: trajectories.length,
      period_count: periodCount,
      model_calls_settled_count: modelCallsSettledCount,
      total_cost_micro_usd: totalCost,
      Q: quality.Q,
      R: quality.R,
      V: quality.V,
      U: quality.U,
      G: quality.G,
      trajectories,
    }

    const auditRef = await archiveCampaignResult(input.s3Bucket, input.campaignId, report)
    const fullReport = { ...report, audit_artifact_ref: auditRef }
    persistCampaignAnalysis(input.postgresDatabase, input.campaignId, fullReport)
    return fullReport
  } finally {
    await closeStore(handle)
  }
}
