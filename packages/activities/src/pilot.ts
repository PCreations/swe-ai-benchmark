// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ÉTAGE VERT de `bench pilot` (cahier L497-L504, tâche
// T39) : préflight en lecture seule d'un manifeste de pilote
// (`bench.pilot.manifest/1`, FIXÉ par `acceptance/T39.spec.ts` — le cahier,
// L499, ne prescrit aucun format de fichier), et exécution réelle, bornée par
// un plafond budgétaire réel, via le fournisseur factice déjà établi
// (T17/T28).
//
// POURQUOI CE FICHIER NE DÉPEND D'AUCUN PAQUET DE T28/T29/T30/T35. Les
// `source_paths` de T39 (`verification/tasks.json#T39`) ne déclarent AUCUN
// `packages/**` — seulement `fixtures`, `apps/cli`, `docs` — si bien que le
// contrat entier vit au niveau de la COMMANDE `bench pilot`
// (`acceptance/T39.spec.ts`, section II) : aucune de ces quatre tâches ne
// publie de forme de manifeste ou de sortie que ce fichier devrait reprendre
// verbatim. Ce qu'il RÉUTILISE, en revanche, ce sont les PRIMITIVES déjà
// publiées et déjà testées : `@bench/storage` (migrations + repository
// PostgreSQL), `@bench/billing` (budget/réservation/règlement réels, donc le
// respect de plafond de A5 est arbitré par PostgreSQL — `reserveBudget`,
// comme pour `./campaign.ts`, T38 — jamais par une comparaison côté client
// qui aurait sa fenêtre), et `@bench/gateway` (fournisseur factice +
// dispatch idempotent, T17).
//
// PRÉFLIGHT = LECTURE SEULE, PAR CONSTRUCTION (A6). `computePilotPreflight`
// est une fonction PURE : aucun argument de connexion, aucun import de
// `@bench/storage`/`@bench/billing`/`@bench/gateway` sur ce chemin. Le
// préflight ne peut donc STRUCTURELLEMENT rien écrire nulle part — ce n'est
// pas une discipline qu'il faudrait respecter à chaque appel, c'est une
// fonction qui n'a même pas les moyens d'écrire. `runPilot` n'ouvre une
// connexion PostgreSQL QUE lorsque `execute` est vrai (voir plus bas).
//
// LE PLAFOND DE A5 EST UN SEUL BUDGET PARTAGÉ POUR TOUTE LA CAMPAGNE, PAS UN
// BUDGET PAR TRAJECTOIRE. Le cahier (L501) dit « une campagne live [...]
// respecte SES plafonds » — au singulier, au niveau de la campagne, pas de
// la trajectoire. `manifest-small-live-tight-cap.json` fixe un plafond de
// `1` micro-USD pour DEUX trajectoires : un budget par trajectoire aurait
// dupliqué ce plafond (2 micro-USD disponibles au total) et aurait laissé
// passer une dépense que le cahier interdit. Une seule enveloppe
// (`@bench/billing openBudget`), ouverte une fois par appel `--execute`, sous
// laquelle CHAQUE tentative de facturation réserve réellement — la
// réservation refusée (dépense cumulée + tentative > plafond) devient un
// échec DE CETTE TRAJECTOIRE, jamais une exception qui interromprait les
// autres (cahier L501 : « laisse des résultats même si tous les candidats
// échouent »).
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { addMicroUsd, microUsd } from '@bench/contracts'
import { openBudget, reserveBudget } from '@bench/billing'
import { createFakeProvider, dispatchModelCall } from '@bench/gateway'
import { applyMigrations, closeStore, openStore } from '@bench/storage'

type Json = Record<string, unknown>

/* ══════════════════════ manifeste `bench.pilot.manifest/1` (T39, section II) ══ */

interface PilotManifestGroup {
  readonly source_parent_project_id: string
  readonly source_scenario_id: string
  readonly clone_instance_ids: readonly string[]
}

interface PilotManifest {
  readonly schema?: string
  readonly corpus?: { readonly groups?: readonly PilotManifestGroup[] }
  readonly model?: { readonly name?: string }
  readonly price?: { readonly tariff_micro_usd?: string }
  readonly exposure?: { readonly predefined?: boolean; readonly value?: string }
  readonly budget?: { readonly cap_micro_usd?: string }
  readonly configurations?: readonly string[]
  readonly repetitions?: number
  readonly periods_per_trajectory?: number
}

/** Lit et parse le manifeste à `manifestPath` (chemin relatif ou absolu). */
export function loadPilotManifest(manifestPath: string): PilotManifest {
  const absPath = path.isAbsolute(manifestPath) ? manifestPath : path.resolve(process.cwd(), manifestPath)
  const raw = fs.readFileSync(absPath, 'utf8')
  return JSON.parse(raw) as PilotManifest
}

/**
 * Un prérequis (`model`/`price`/`exposure`/`budget`) est ABSENT si son objet
 * est `{}` (README, `acceptance/fixtures/pilot/README.md`) — vide ou absent.
 */
function isEmptyPrerequisite(o: Record<string, unknown> | undefined): boolean {
  return o === undefined || o === null || Object.keys(o).length === 0
}

/** Les cinq prérequis du cahier (L501), NOMMÉS dans cet ordre fixe. */
export const PILOT_PREREQUISITES = ['model', 'price', 'corpus', 'exposure', 'budget'] as const

/**
 * Prérequis manquants (cahier L501 : « liste COMPLÈTE », jamais seulement le
 * premier trouvé) — CHACUN des cinq est contrôlé indépendamment, aucun
 * raccourci qui s'arrêterait au premier manque.
 */
export function missingPilotPrerequisites(manifest: PilotManifest): string[] {
  const missing: string[] = []
  if (isEmptyPrerequisite(manifest.model)) missing.push('model')
  if (isEmptyPrerequisite(manifest.price)) missing.push('price')
  const groups = manifest.corpus?.groups ?? []
  if (groups.length === 0) missing.push('corpus')
  if (isEmptyPrerequisite(manifest.exposure)) missing.push('exposure')
  if (isEmptyPrerequisite(manifest.budget)) missing.push('budget')
  return missing
}

function totalClones(manifest: PilotManifest): number {
  const groups = manifest.corpus?.groups ?? []
  return groups.reduce((acc, g) => acc + (g.clone_instance_ids?.length ?? 0), 0)
}

/** Produit cartésien clones × configurations × répétitions (cahier L501). */
export function pilotTrajectoryCount(manifest: PilotManifest): number {
  const configurationCount = manifest.configurations?.length ?? 0
  const repetitions = manifest.repetitions ?? 0
  return totalClones(manifest) * configurationCount * repetitions
}

export function pilotPeriodCount(manifest: PilotManifest): number {
  return pilotTrajectoryCount(manifest) * (manifest.periods_per_trajectory ?? 0)
}

/**
 * Parents statistiques DISTINCTS (cahier L501, A3) — `source_parent_project_id`
 * du GROUPE, jamais un identifiant d'instance de clone (`clone_instance_ids`).
 * Six clones d'un même groupe ne comptent donc jamais pour six parents.
 */
export function pilotParentProjectIds(manifest: PilotManifest): string[] {
  const groups = manifest.corpus?.groups ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const g of groups) {
    if (!seen.has(g.source_parent_project_id)) {
      seen.add(g.source_parent_project_id)
      out.push(g.source_parent_project_id)
    }
  }
  return out
}

/**
 * Résultat du préflight (SANS `--execute`, section II de
 * `acceptance/T39.spec.ts`) : fonction PURE, lecture seule par construction
 * (voir l'en-tête du fichier) — `execution_started` vaut TOUJOURS `false` ici.
 */
export function computePilotPreflight(manifest: PilotManifest): Readonly<Json> {
  const missing = missingPilotPrerequisites(manifest)
  return {
    schema: 'bench.pilot.preflight_result/1',
    ready: missing.length === 0,
    missing_prerequisites: missing,
    trajectory_count: pilotTrajectoryCount(manifest),
    period_count: pilotPeriodCount(manifest),
    parent_project_ids: pilotParentProjectIds(manifest),
    execution_started: false,
  }
}

/* ══════════════════════════════════ PostgreSQL réel (T39 --execute) ══════ */

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

/* ══════════════════════════════════════ plan d'exécution (--execute) ═════ */

interface PilotTrajectoryPlan {
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
  readonly repetition_id: string
}

/** Même produit cartésien que `pilotTrajectoryCount`, mais ÉNUMÉRÉ. */
function planPilotTrajectories(manifest: PilotManifest): PilotTrajectoryPlan[] {
  const groups = manifest.corpus?.groups ?? []
  const configurations = manifest.configurations ?? []
  const repetitions = manifest.repetitions ?? 0
  const plans: PilotTrajectoryPlan[] = []
  for (const group of groups) {
    for (const _cloneInstanceId of group.clone_instance_ids) {
      for (const configurationId of configurations) {
        for (let rep = 1; rep <= repetitions; rep += 1) {
          plans.push({
            // L'identité du PARENT reste celle du GROUPE (A3) — jamais celle
            // du clone, même si le plan itère sur chaque instance clonée.
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

interface PilotTrajectoryResult extends PilotTrajectoryPlan {
  readonly budget_id: string
  readonly attempt_outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED'
  readonly cost_micro_usd: string
}

/* ═══════════════════════════════════════════ `runPilot` (T39, section II) ═══ */

export interface RunPilotInput {
  readonly manifestPath: string
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly execute: boolean
  readonly mode?: string
  readonly provider?: string
  /** Point d'injection nommé (cahier:L141, A5) : chaque candidat échoue, sans
   * jamais tenter de facturation réelle pour cette trajectoire. */
  readonly testForceAllCandidatesFail: boolean
}

/**
 * `bench pilot` (cahier L497-L504, T39). SANS `--execute` : délègue
 * entièrement à `computePilotPreflight`, une fonction pure — aucune
 * connexion PostgreSQL/S3 n'est même ouverte sur ce chemin (A6). AVEC
 * `--execute` : exécute réellement les trajectoires compilées à travers le
 * fournisseur factice (`@bench/gateway`), sous un unique budget réel
 * (`@bench/billing`) qui porte le plafond de la campagne (voir l'en-tête du
 * fichier) ; une réservation refusée devient un échec DE LA TRAJECTOIRE,
 * jamais une interruption de l'exécution (cahier L501).
 */
export async function runPilot(input: RunPilotInput): Promise<Readonly<Json>> {
  const manifest = loadPilotManifest(input.manifestPath)
  const preflight = computePilotPreflight(manifest)

  if (!input.execute) {
    // Lecture seule, ici et nulle part en aval : voir l'en-tête du fichier.
    return preflight
  }

  if (preflight.ready !== true) {
    throw new Error(
      `bench pilot --execute refusé : prérequis manquants ${JSON.stringify(preflight.missing_prerequisites)} (cahier:L501 — un défaut de prérequis produit BLOCKED, jamais PASS)`,
    )
  }
  if (input.mode !== 'recorded' && input.mode !== 'live') {
    throw new Error(`bench pilot --execute exige --mode recorded|live (reçu ${JSON.stringify(input.mode)})`)
  }
  if (input.provider !== 'fake') {
    throw new Error(`bench pilot --execute exige --provider fake (reçu ${JSON.stringify(input.provider)})`)
  }

  const tariffRaw = String(manifest.price?.tariff_micro_usd ?? '0')
  const capRaw = String(manifest.budget?.cap_micro_usd ?? '0')
  const tariff = { input_uncached_per_token: Number(tariffRaw), input_cached_per_token: 0, output_per_token: 0 }

  const dsn = dsnFor(input.postgresDatabase)
  await applyMigrations({ dsn })
  const handle = openStore({ dsn })

  try {
    // Budget UNIQUE pour toute la campagne (voir l'en-tête du fichier) : son
    // identifiant porte `--campaign-id` pour rester retrouvable en base
    // (contrôle positif A6 — même technique que T23/T37/T38).
    const budgetId = `pilot-budget-${input.campaignId}`
    await openBudget(handle, { budget_id: budgetId, limit: capRaw })

    const provider = createFakeProvider({
      responses: [{ text: '', usage: { input_uncached_tokens: 1, input_cached_tokens: 0, output_tokens: 0 } }],
    })

    const plans = planPilotTrajectories(manifest)
    const trajectories: PilotTrajectoryResult[] = []
    let callIndex = 0
    for (const plan of plans) {
      callIndex += 1

      if (input.testForceAllCandidatesFail) {
        // Point d'injection NOMMÉ (A5, témoin « laisse des résultats même si
        // tous les candidats échouent ») : aucune tentative de facturation —
        // jamais une branche activée par hasard d'environnement.
        trajectories.push({ ...plan, budget_id: budgetId, attempt_outcome: 'FAILED', cost_micro_usd: '0' })
        continue
      }

      const reservation = await reserveBudget(handle, { budget_id: budgetId, amount: tariffRaw })
      if (!reservation.accepted || reservation.reservation_id === undefined) {
        // Plafond atteint (A5, témoin « respecte ses plafonds ») : un échec
        // DE CETTE TRAJECTOIRE, jamais une exception qui en interromprait
        // d'autres — PostgreSQL (`reserveBudget`) arbitre le plafond, pas une
        // comparaison côté client.
        trajectories.push({ ...plan, budget_id: budgetId, attempt_outcome: 'FAILED', cost_micro_usd: '0' })
        continue
      }

      const modelCallId = `mc-pilot-${input.campaignId}-${String(callIndex)}`
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
        trajectories.push({ ...plan, budget_id: budgetId, attempt_outcome: 'FAILED', cost_micro_usd: '0' })
        continue
      }
      trajectories.push({ ...plan, budget_id: budgetId, attempt_outcome: 'SUCCESS', cost_micro_usd: result.cost })
    }

    const totalCost = addMicroUsd(...trajectories.map((t) => microUsd(t.cost_micro_usd)))

    return {
      schema: 'bench.pilot.execute_result/1',
      // §B (cahier:L17-24) : TOUJOURS fictifs — le fournisseur reste FACTICE
      // même en profil `live` (cahier L503 : « le lancement réel [...] sont
      // des opérations de recherche séparées »).
      execution_mode: input.mode,
      cost_origin: 'FICTIONAL_GRID',
      corpus_provenance: 'synthetic',
      ready: true,
      missing_prerequisites: [],
      trajectory_count: trajectories.length,
      period_count: preflight.period_count,
      parent_project_ids: preflight.parent_project_ids,
      execution_started: true,
      total_cost_micro_usd: totalCost,
      trajectories,
    }
  } finally {
    await closeStore(handle)
  }
}
