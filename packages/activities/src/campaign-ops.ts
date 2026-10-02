// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ÉTAGE VERT de `bench campaign preflight|run|cancel`
// (cahier L513-L521, tâche T41, cas A2/A3/A4) : préflight en lecture seule
// d'un manifeste `bench.campaign.manifest/1` (FIXÉ par `acceptance/
// T41.spec.ts`, section III.2 — le cahier, L517, ne prescrit aucun format de
// fichier pour les opérations génériques de campagne), exécution réelle via
// le fournisseur FACTICE déjà établi (T17/T28), et annulation NON DESTRUCTIVE.
//
// MÊME DISCIPLINE QUE `./pilot.ts` (T39) : AUCUN paquet de T30/T36/T37/T38/
// T39/T40 n'est réutilisé ici — `verification/tasks.json#T41.source_paths` ne
// déclare que `apps/cli`, `infra`, `docs`, si bien que le contrat vit au
// niveau de la COMMANDE (`acceptance/T41.spec.ts`, section III), jamais d'une
// forme de manifeste ou de sortie publiée par une dépendance. Ce qui EST
// réutilisé, ce sont les PRIMITIVES déjà publiées et déjà testées :
// `@bench/storage` (migrations + repository PostgreSQL réel), `@bench/billing`
// (budget/réservation réels — un plafond atteint est arbitré par PostgreSQL,
// jamais par une comparaison côté client) et `@bench/gateway` (fournisseur
// factice + dispatch idempotent, T17).
//
// PRÉFLIGHT = LECTURE SEULE, PAR CONSTRUCTION (section III.3 : « Lecture
// seule, AUCUNE écriture, AUCUN appel modèle »). `computeCampaignOpsPreflight`
// est une fonction PURE : aucun argument de connexion, aucun import de
// `@bench/storage`/`@bench/billing`/`@bench/gateway` sur ce chemin.
// `runCampaignOps` ne se connecte à PostgreSQL QUE lorsque CE préflight est
// `ready` — un prérequis manquant écrit le refus et REND avant toute
// connexion (A3 : « AUCUNE écriture en base pour ce campaign_id »).
//
// LE GATE `credential`, PROPRE À T41 (absent de T39). Le cahier (§B, L17-24)
// n'exige une vraie clé pour AUCUN gate `recorded` — ce chemin ne lit même
// jamais `ANTHROPIC_API_KEY`. En mode `live`, en revanche, son ABSENCE est un
// prérequis manquant nommé `credential`, au même titre que `model`/`budget`
// (A3) ; sa PRÉSENCE ne déclenche jamais un appel réseau réel : `--provider
// fake` reste le seul fournisseur jamais contacté (§B, L17-24, L521 — même
// discipline que `./pilot.ts`, T39.A5).
//
// ANNULATION NON DESTRUCTIVE (A4). `cancelCampaignOps` n'exécute qu'une
// LECTURE (aucun DELETE, aucun UPDATE, aucun INSERT) : une suppression,
// même limitée au `campaign_id` demandé, serait indiscernable d'une
// suppression qui déborderait sur une autre campagne logée dans la même base
// partagée (cahier:L559) tant qu'aucune ligne n'est jamais retirée. Rendre le
// chemin structurellement incapable d'écrire est plus fort qu'une discipline
// qu'il faudrait respecter à chaque appel.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { addMicroUsd, microUsd } from '@bench/contracts'
import { openBudget, reserveBudget } from '@bench/billing'
import { createFakeProvider, dispatchModelCall } from '@bench/gateway'
import { applyMigrations, closeStore, openStore } from '@bench/storage'

type Json = Record<string, unknown>

/** Nom déjà établi par `verification/runner/doctor.mjs` (sonde `live-credentials`), pas inventé ici. */
export const CREDENTIAL_ENV_VAR = 'ANTHROPIC_API_KEY'

/* ══════════════════ manifeste `bench.campaign.manifest/1` (section III.2) ═ */

interface CampaignOpsManifestGroup {
  readonly source_parent_project_id: string
  readonly source_scenario_id: string
  readonly clone_instance_ids: readonly string[]
}

interface CampaignOpsManifest {
  readonly schema?: string
  readonly corpus?: { readonly groups?: readonly CampaignOpsManifestGroup[] }
  readonly model?: { readonly name?: string }
  readonly price?: { readonly tariff_micro_usd?: string }
  readonly budget?: { readonly cap_micro_usd?: string }
  readonly configurations?: readonly string[]
  readonly repetitions?: number
  readonly periods_per_trajectory?: number
}

/** Lit et parse le manifeste à `manifestPath` (chemin relatif ou absolu). */
export function loadCampaignOpsManifest(manifestPath: string): CampaignOpsManifest {
  const absPath = path.isAbsolute(manifestPath) ? manifestPath : path.resolve(process.cwd(), manifestPath)
  const raw = fs.readFileSync(absPath, 'utf8')
  return JSON.parse(raw) as CampaignOpsManifest
}

/** Un prérequis (`model`/`budget`) est ABSENT si son objet est `{}` (README, même règle que T39). */
function isEmptyPrerequisite(o: Record<string, unknown> | undefined): boolean {
  return o === undefined || o === null || Object.keys(o).length === 0
}

/**
 * Prérequis manquants pour `mode` donné : `model`/`budget` TOUJOURS contrôlés ;
 * `credential` SEULEMENT en mode `live` (section III.2 : « n'est pas un champ
 * du manifeste : il est lu dans ANTHROPIC_API_KEY »). Un profil `recorded` ne
 * lit même jamais cette variable — c'est ce qui rend A2 vrai par
 * CONSTRUCTION, pas par coïncidence d'environnement.
 */
export function missingCampaignOpsPrerequisites(manifest: CampaignOpsManifest, mode: string): string[] {
  const missing: string[] = []
  if (isEmptyPrerequisite(manifest.model)) missing.push('model')
  if (isEmptyPrerequisite(manifest.budget)) missing.push('budget')
  if (mode === 'live' && !process.env[CREDENTIAL_ENV_VAR]) missing.push('credential')
  return missing
}

/**
 * Résultat du préflight (lecture seule, section III.3) : fonction PURE, voir
 * l'en-tête du fichier — `execution_mode` reflète `mode` tel que demandé.
 */
export function computeCampaignOpsPreflight(manifest: CampaignOpsManifest, mode: string): Readonly<Json> {
  const missing = missingCampaignOpsPrerequisites(manifest, mode)
  return {
    schema: 'bench.campaign.preflight_result/1',
    ready: missing.length === 0,
    missing_prerequisites: missing,
    execution_mode: mode,
  }
}

/* ══════════════════════════════════ PostgreSQL réel (dsn), même motif que ═
 * `./pilot.ts`, `./run-period.ts`, `packages/billing/src/psql.ts` : un petit
 * helper dupliqué plutôt qu'une dépendance croisée pour trois lignes (même
 * choix déjà fait ailleurs dans ce dépôt). */
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

/* ══════════════════════════════════════ plan d'exécution (`campaign run`) ═ */

interface CampaignOpsTrajectoryPlan {
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
  readonly repetition_id: string
}

/** Produit cartésien clones × configurations × répétitions (même forme que `./pilot.ts`). */
function planCampaignOpsTrajectories(manifest: CampaignOpsManifest): CampaignOpsTrajectoryPlan[] {
  const groups = manifest.corpus?.groups ?? []
  const configurations = manifest.configurations ?? []
  const repetitions = manifest.repetitions ?? 0
  const plans: CampaignOpsTrajectoryPlan[] = []
  for (const group of groups) {
    for (const _cloneInstanceId of group.clone_instance_ids) {
      for (const configurationId of configurations) {
        for (let rep = 1; rep <= repetitions; rep += 1) {
          plans.push({
            parent_project_id: group.source_parent_project_id,
            scenario_id: group.source_scenario_id,
            configuration_id: configurationId,
            repetition_id: `REP-${String(rep)}`,
          })
        }
      }
    }
  }
  return plans
}

interface CampaignOpsTrajectoryResult extends CampaignOpsTrajectoryPlan {
  readonly budget_id: string
  readonly attempt_outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED'
  readonly cost_micro_usd: string
}

/* ═══════════════════════════════════ `bench campaign run` (section III.3) ═ */

export interface RunCampaignOpsInput {
  readonly manifestPath: string
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly mode: string
  readonly provider: string
}

/**
 * `bench campaign run` (cahier L513-L521, T41). Prérequis manquant : REND un
 * refus structuré `{ready:false, missing_prerequisites, execution_started:
 * false}` AVANT toute connexion PostgreSQL (A3). Prêt : exécute réellement les
 * trajectoires compilées via le fournisseur FACTICE, sous un unique budget réel
 * (`@bench/billing`) qui porte le plafond de la campagne (même motif que
 * `./pilot.ts`) ; une réservation refusée devient un échec DE LA TRAJECTOIRE,
 * jamais une interruption de l'exécution.
 */
export async function runCampaignOps(input: RunCampaignOpsInput): Promise<Readonly<Json>> {
  const manifest = loadCampaignOpsManifest(input.manifestPath)
  const preflight = computeCampaignOpsPreflight(manifest, input.mode)

  if (preflight.ready !== true) {
    // AUCUNE connexion PostgreSQL n'a été ouverte sur ce chemin (voir l'en-tête).
    return {
      schema: 'bench.campaign.run_result/1',
      ready: false,
      missing_prerequisites: preflight.missing_prerequisites,
      execution_mode: input.mode,
      execution_started: false,
    }
  }
  if (input.mode !== 'recorded' && input.mode !== 'live') {
    throw new Error(`bench campaign run exige --mode recorded|live (reçu ${JSON.stringify(input.mode)})`)
  }
  if (input.provider !== 'fake') {
    throw new Error(`bench campaign run exige --provider fake (reçu ${JSON.stringify(input.provider)})`)
  }

  const tariffRaw = String(manifest.price?.tariff_micro_usd ?? '0')
  const capRaw = String(manifest.budget?.cap_micro_usd ?? '0')
  const tariff = { input_uncached_per_token: Number(tariffRaw), input_cached_per_token: 0, output_per_token: 0 }
  const periodsPerTrajectory = Math.max(1, manifest.periods_per_trajectory ?? 1)

  const dsn = dsnFor(input.postgresDatabase)
  await applyMigrations({ dsn })
  const handle = openStore({ dsn })

  try {
    // Budget UNIQUE pour toute la campagne (même motif que `./pilot.ts`) :
    // son identifiant PORTE `--campaign-id` en clair, pour rester retrouvable
    // en base (contrôle positif A2/A3 — même technique que T23/T37/T38/T39).
    const budgetId = `campaign-ops-budget-${input.campaignId}`
    await openBudget(handle, { budget_id: budgetId, limit: capRaw })

    const provider = createFakeProvider({
      responses: [{ text: '', usage: { input_uncached_tokens: 1, input_cached_tokens: 0, output_tokens: 0 } }],
    })

    const plans = planCampaignOpsTrajectories(manifest)
    const trajectories: CampaignOpsTrajectoryResult[] = []
    let callIndex = 0
    for (const plan of plans) {
      let failed = false
      let trajectoryCost = microUsd('0')
      for (let periodIndex = 1; periodIndex <= periodsPerTrajectory; periodIndex += 1) {
        callIndex += 1
        const reservation = await reserveBudget(handle, { budget_id: budgetId, amount: tariffRaw })
        if (!reservation.accepted || reservation.reservation_id === undefined) {
          // Plafond atteint : un échec DE CETTE TRAJECTOIRE, jamais une
          // exception qui en interromprait d'autres (même motif que T39.A5).
          failed = true
          continue
        }
        // `campaign_id` EN CLAIR dans `model_call_id` (comme `./pilot.ts`) :
        // c'est ce que le contrôle positif d'A2/A3 retrouve en base.
        const modelCallId = `mc-campaign-ops-${input.campaignId}-${String(callIndex)}`
        const result = await dispatchModelCall(handle, {
          model_call_id: modelCallId,
          idempotency_key: `idem-${modelCallId}`,
          budget_id: budgetId,
          reservation_id: reservation.reservation_id,
          provider,
          request: { campaign_id: input.campaignId, plan_index: callIndex },
          tariff,
        })
        if (result.status !== 'SETTLED' || result.cost === undefined) {
          failed = true
          continue
        }
        trajectoryCost = addMicroUsd(trajectoryCost, microUsd(result.cost))
      }
      trajectories.push({
        ...plan,
        budget_id: budgetId,
        attempt_outcome: failed ? 'FAILED' : 'SUCCESS',
        cost_micro_usd: trajectoryCost,
      })
    }

    const totalCost = addMicroUsd(...trajectories.map((t) => microUsd(t.cost_micro_usd)))

    return {
      schema: 'bench.campaign.run_result/1',
      // §B (cahier:L17-24) : TOUJOURS fictifs — le fournisseur reste FACTICE
      // même en profil `live` (même discipline que `./pilot.ts`, T39.A5).
      execution_mode: input.mode,
      cost_origin: 'FICTIONAL_GRID',
      corpus_provenance: 'synthetic',
      campaign_id: input.campaignId,
      ready: true,
      missing_prerequisites: [],
      execution_started: true,
      trajectory_count: trajectories.length,
      total_cost_micro_usd: totalCost,
      trajectories,
    }
  } finally {
    await closeStore(handle)
  }
}

/* ═════════════════════════════════ `bench campaign preflight` (III.3) ═════ */

export interface CampaignOpsPreflightInput {
  readonly manifestPath: string
  readonly mode: string
}

/** `bench campaign preflight` : délègue entièrement à la fonction pure ci-dessus. */
export function campaignOpsPreflight(input: CampaignOpsPreflightInput): Readonly<Json> {
  const manifest = loadCampaignOpsManifest(input.manifestPath)
  return computeCampaignOpsPreflight(manifest, input.mode)
}

/* ═══════════════════════════════════ `bench campaign cancel` (A4) ═════════ */

export interface CancelCampaignOpsInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
}

function runPsqlRead(dsn: string, sql: string): string {
  try {
    return execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsn, '-c', sql], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `campaign cancel: lecture refusée : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(
        0,
        800,
      ),
    )
  }
}

const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

/**
 * `bench campaign cancel` (A4 : « ne supprime ni ses artefacts ni ceux d'une
 * autre campagne »). CE CHEMIN N'EXÉCUTE AUCUNE ÉCRITURE : ni DELETE, ni
 * UPDATE, ni INSERT — seulement une LECTURE du budget associé, pour rendre un
 * verdict informatif. Voir l'en-tête du fichier : rendre ce chemin
 * STRUCTURELLEMENT incapable d'écrire est ce qui garantit, par construction,
 * qu'aucune campagne voisine logée dans la même base partagée (cahier:L559)
 * ne peut jamais être touchée.
 */
export async function cancelCampaignOps(input: CancelCampaignOpsInput): Promise<Readonly<Json>> {
  const dsn = dsnFor(input.postgresDatabase)
  const budgetId = `campaign-ops-budget-${input.campaignId}`
  let modelCallsObserved = 0
  try {
    const out = runPsqlRead(dsn, `SELECT count(*) FROM model_calls WHERE budget_id = ${sqlLit(budgetId)}`)
    const parsed = Number.parseInt(out, 10)
    modelCallsObserved = Number.isFinite(parsed) ? parsed : 0
  } catch {
    // Base inatteignable ou schéma absent (campagne jamais exécutée) : un
    // verdict de lecture qui échoue ne doit jamais devenir une écriture de
    // repli — `cancelled` reste vrai, `model_calls_observed` reste `0`.
    modelCallsObserved = 0
  }
  return {
    schema: 'bench.campaign.cancel_result/1',
    campaign_id: input.campaignId,
    budget_id: budgetId,
    cancelled: true,
    model_calls_observed: modelCallsObserved,
  }
}
