// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ASSEMBLAGE D'UNE PÉRIODE PERSISTANTE COMPLÈTE, avec les
// adaptateurs réels locaux (cahier L353-L359, tâche T23).
//
// CE QUE CE FICHIER FAIT, PHASE PAR PHASE (l'énumération verbatim de L97) :
//
//   RESTORING     lit le POINTEUR de la trajectoire dans PostgreSQL REEL
//                 (table `bench_run_period_trajectories`, créée par ce
//                 fichier) puis, si un checkpoint existe déjà, relit son
//                 CONTENU dans le magasin d'artefacts S3 réel (`@bench/
//                 storage`, T13/T14) — c'est de là, et de là seulement, que
//                 `active_version_id` d'une période antérieure est restauré
//                 (A3, A4) : PostgreSQL ne porte que le pointeur et le
//                 compteur de période, jamais la substance.
//   REVEALING .. AUDITING
//                 pour la trajectoire NOMINALE (aucun `--variant`, ou
//                 `nominal`), ce fichier délègue le calcul métier à
//                 `@bench/scenario` (`runDemo`, T11) : MÊME scénario compilé,
//                 MÊME application scriptée, MÊME calcul de métriques
//                 (`@bench/domain`, T04) que `bench demo` — c'est ce qui rend
//                 A2 vrai par CONSTRUCTION plutôt que par coïncidence
//                 numérique. Pour la variante `invalid-candidate` (fixée par
//                 `acceptance/T23.spec.ts`, section III), un script PROPRE à
//                 CE fichier joue deux périodes : P1 livre et déploie, P2 est
//                 un candidat refusé qui NE DOIT PAS effacer le déploiement
//                 de P1 (D-5, L65).
//   CHECKPOINTING écrit le contenu substantiel dans le magasin S3 (référence
//                 adressée par contenu, donc distincte à chaque période tant
//                 que son contenu change) et publie SEULEMENT ALORS le
//                 pointeur dans PostgreSQL — jamais avant : c'est cette
//                 ordonnance, et elle seule, qui rend une interruption
//                 injectée par `--test-stop-after-phase` incapable de publier
//                 un faux état final (A5).
//
// CE QUE CE FICHIER NE FAIT PAS, ET POURQUOI CE N'EST PAS UN OUBLI.
//   • Il ne rejoue pas la déduplication par clé d'opération de `@bench/domain`
//     (D-6, L68) : aucun cas requis de T23 n'invoque deux fois la même
//     opération logique, et la dupliquer ici sans un test qui l'exerce aurait
//     été une règle non observée (§G, L139).
//   • Il ne provisionne pas de sandbox Linux (`@bench/sandbox`, T19) pour
//     exécuter le candidat : `acceptance/T23.spec.ts` section VI est explicite
//     — « elle ne réverifie pas l'isolation du sandbox (T19)… T23 observe leur
//     ASSEMBLAGE, pas leurs propriétés internes » — et le candidat scripté
//     (mode `recorded`, réponses archivées, L21) n'exécute aucun code tiers
//     qu'il faudrait confiner. Limite assumée, consignée ici plutôt que tue.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'

import { sha256Hex } from '@bench/contracts'
import {
  getArtifact,
  openS3ArtifactStore,
  putArtifact,
  s3TestServiceConfig,
} from '@bench/storage'
import { runDemo } from '@bench/scenario'
import type { DemoPeriodResult } from '@bench/scenario'

/* ══════════════════════════════════ formes du contrat ═══════════════════ */

export const RUN_PERIOD_MODE = 'recorded' // cahier:L21 — seul mode que ce fichier joue
export const RUN_PERIOD_VARIANTS = ['nominal', 'invalid-candidate'] as const
export type RunPeriodVariant = (typeof RUN_PERIOD_VARIANTS)[number]

/** Les dix phases de L97, dans l'ordre : sert à borner `--test-stop-after-phase`. */
export const RUN_PERIOD_PHASES = [
  'PENDING',
  'RESTORING',
  'REVEALING',
  'DEVELOPING',
  'VALIDATING',
  'DEPLOYING',
  'EXERCISING',
  'AUDITING',
  'CHECKPOINTING',
  'COMPLETED',
] as const

export interface RunPeriodInput {
  readonly mode: string
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly variant?: string | undefined
  /**
   * Identité de trajectoire (T45, ADR-007:L151) : la PREMIÈRE période d'une
   * trajectoire fixe son scénario et sa configuration ; chaque période
   * SUIVANTE les relit depuis l'état persistant, jamais depuis ces champs —
   * fournir ici une valeur qui DIVERGE de celle enregistrée à la première
   * période (configuration ou scénario) est refusé avec
   * `TRAJECTORY_IDENTITY_CONFLICT` (ADR-007:L153), sans écrire de période.
   * Omis à la première période d'une trajectoire fraîche, chaque champ
   * retombe sur le défaut hérité de T23 (ADR-007:L117).
   */
  readonly scenarioId?: string | undefined
  readonly configurationId?: string | undefined
  /** Point d'injection nommé (cahier:L141) : arrêt volontaire après cette phase. */
  readonly testStopAfterPhase?: string | undefined
}

export interface RunPeriodCompleted {
  readonly ok: true
  readonly result: Readonly<Record<string, unknown>>
}

/**
 * L'interruption injectée (A5) : AUCUN état final n'est publié — ni PostgreSQL
 * ni S3 ne voient la période avancer. Le processus appelant n'écrit rien sur sa
 * sortie standard dans ce cas (acceptance/T23.spec.ts, A5, lit cela comme
 * `resultat === null`, une entrée valide de son propre contrat : aucune
 * assertion ne porte alors sur un objet qui n'a jamais prétendu être un état
 * final).
 */
export interface RunPeriodInterrupted {
  readonly ok: false
  readonly reason: string
}

export type RunPeriodOutcome = RunPeriodCompleted | RunPeriodInterrupted

/* ══════════════════════════════ PostgreSQL réel (psql) ═══════════════════ */

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
      `run-period.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(
        0,
        800,
      ),
    )
  }
}

const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

const TABLE = 'bench_run_period_trajectories'

/**
 * Le POINTEUR persistant d'une trajectoire : période dernièrement achevée,
 * référence du checkpoint S3, et l'IDENTITÉ (scénario/configuration, T45,
 * ADR-007:L151) fixée à la première période de cette trajectoire — jamais
 * réécrite ensuite (voir `writeTrajectoryPointer`, qui exclut ces deux
 * colonnes de sa clause `ON CONFLICT … DO UPDATE`).
 */
interface TrajectoryPointer {
  readonly lastCompletedPeriod: number
  readonly checkpointRef: string
  readonly scenarioId: string
  readonly configurationId: string
}

function ensureTrajectoryTable(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       campaign_id text PRIMARY KEY,
       last_completed_period integer NOT NULL,
       checkpoint_ref text NOT NULL,
       scenario_id text NOT NULL,
       configuration_id text NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

function readTrajectoryPointer(db: string, campaignId: string): TrajectoryPointer | null {
  const out = runPsql(
    db,
    `SELECT last_completed_period, checkpoint_ref, scenario_id, configuration_id FROM ${TABLE} WHERE campaign_id = ${sqlLit(campaignId)}`,
  )
  if (out === '') return null
  const [periodRaw, ref, scenarioId, configurationId] = out.split('|')
  const period = Number.parseInt(periodRaw ?? '', 10)
  if (
    !Number.isInteger(period) ||
    ref === undefined ||
    ref === '' ||
    scenarioId === undefined ||
    scenarioId === '' ||
    configurationId === undefined ||
    configurationId === ''
  ) {
    return null
  }
  return { lastCompletedPeriod: period, checkpointRef: ref, scenarioId, configurationId }
}

/**
 * Écrit le pointeur de période. `scenarioId`/`configurationId` ne sont
 * INSÉRÉS qu'à la création de la ligne (première période) : la clause
 * `ON CONFLICT … DO UPDATE` ci-dessous ne les liste PAS, donc une ré-écriture
 * sur une trajectoire existante ne les modifie jamais — c'est ce qui rend
 * l'identité FIXE après la première période (ADR-007:L151), par construction
 * plutôt que par une vérification séparée.
 */
function writeTrajectoryPointer(
  db: string,
  campaignId: string,
  periodIndex: number,
  checkpointRef: string,
  scenarioId: string,
  configurationId: string,
): void {
  runPsql(
    db,
    `INSERT INTO ${TABLE}(campaign_id, last_completed_period, checkpoint_ref, scenario_id, configuration_id)
       VALUES (${sqlLit(campaignId)}, ${String(periodIndex)}, ${sqlLit(checkpointRef)}, ${sqlLit(scenarioId)}, ${sqlLit(configurationId)})
     ON CONFLICT (campaign_id) DO UPDATE SET
       last_completed_period = EXCLUDED.last_completed_period,
       checkpoint_ref = EXCLUDED.checkpoint_ref,
       updated_at = now()`,
  )
}

/* ══════════════════ manifeste inspectable de checkpoint (T42, cahier L157) */

// `bench checkpoint inspect` (T42, section II.3) ne reçoit ni `--s3-bucket`
// (absent du squelette T41) ni mémoire partagée avec le processus qui a
// produit le checkpoint (A5 : « processus NEUF »). Cette table ad hoc, sur le
// MÊME PostgreSQL que `--postgres-database` (jamais S3), publie donc les
// champs minimaux du `CheckpointManifest` (cahier:L157 : horloge, exigences,
// version active) pour CE `checkpointRef` précis — une deuxième écriture,
// à côté du pointeur ci-dessus, jamais à sa place.
const CHECKPOINT_MANIFEST_TABLE = 'bench_checkpoint_manifests'

function ensureCheckpointManifestTable(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${CHECKPOINT_MANIFEST_TABLE} (
       checkpoint_id text PRIMARY KEY,
       campaign_id text NOT NULL,
       period_index integer NOT NULL,
       manifest jsonb NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

function writeCheckpointManifest(
  db: string,
  checkpointId: string,
  campaignId: string,
  periodIndex: number,
  manifest: Readonly<Record<string, unknown>>,
): void {
  ensureCheckpointManifestTable(db)
  runPsql(
    db,
    `INSERT INTO ${CHECKPOINT_MANIFEST_TABLE}(checkpoint_id, campaign_id, period_index, manifest)
       VALUES (${sqlLit(checkpointId)}, ${sqlLit(campaignId)}, ${String(periodIndex)}, ${sqlLit(JSON.stringify(manifest))}::jsonb)
     ON CONFLICT (checkpoint_id) DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id,
       period_index = EXCLUDED.period_index,
       manifest = EXCLUDED.manifest`,
  )
}

export interface InspectCheckpointInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly checkpointId: string
}

export interface CheckpointInspection {
  readonly checkpoint_id: string
  readonly campaign_id: string
  readonly period_index: number
  readonly business_clock: string | null
  readonly active_version_id: string | null
  readonly Q: number | null
  readonly R: number | null
  readonly requirements: readonly unknown[]
}

/**
 * `bench checkpoint inspect --campaign-id <id> --postgres-database <db>
 *  --checkpoint-id <id>` (T42, section II.3) : relit le manifeste publié par
 * `runPeriodOnce` ci-dessus, depuis un PROCESSUS NEUF (A5) — jamais une
 * valeur gardée en mémoire par l'appel qui a produit ce checkpoint. Rend
 * `null` si `checkpointId` est absent de `campaignId`, un refus NOMMÉ plutôt
 * qu'une valeur inventée.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function inspectCheckpoint(input: InspectCheckpointInput): Promise<CheckpointInspection | null> {
  const db = input.postgresDatabase
  ensureCheckpointManifestTable(db)
  const out = runPsql(
    db,
    `SELECT campaign_id, period_index, manifest::text FROM ${CHECKPOINT_MANIFEST_TABLE} WHERE checkpoint_id = ${sqlLit(input.checkpointId)}`,
  )
  if (out === '') return null
  const firstSep = out.indexOf('|')
  const secondSep = firstSep === -1 ? -1 : out.indexOf('|', firstSep + 1)
  if (firstSep === -1 || secondSep === -1) return null
  const campaignId = out.slice(0, firstSep)
  const periodRaw = out.slice(firstSep + 1, secondSep)
  const manifestJson = out.slice(secondSep + 1)
  if (campaignId !== input.campaignId) return null
  const periodIndex = Number.parseInt(periodRaw, 10)
  if (!Number.isInteger(periodIndex)) return null
  const manifest = JSON.parse(manifestJson) as Record<string, unknown>
  return {
    checkpoint_id: input.checkpointId,
    campaign_id: campaignId,
    period_index: periodIndex,
    business_clock: typeof manifest['business_clock'] === 'string' ? (manifest['business_clock'] as string) : null,
    active_version_id:
      typeof manifest['active_version_id'] === 'string' ? (manifest['active_version_id'] as string) : null,
    Q: typeof manifest['Q'] === 'number' ? (manifest['Q'] as number) : null,
    R: typeof manifest['R'] === 'number' ? (manifest['R'] as number) : null,
    requirements: Array.isArray(manifest['requirements']) ? (manifest['requirements'] as unknown[]) : [],
  }
}

/* ══════════════════════════════════ stockage S3 réel ═════════════════════ */

/** Le CONTENU substantiel d'un checkpoint (T15) : ce que PostgreSQL ne porte pas. */
interface CheckpointPayload {
  readonly schema: 'bench.t23.checkpoint/1'
  readonly campaign_id: string
  readonly period_index: number
  readonly variant: string
  readonly active_version_id: string | null
  readonly deployment_coverage: string
  readonly completed_at: string
}

async function openCheckpointStore(s3Bucket: string, campaignId: string): Promise<ReturnType<typeof openS3ArtifactStore>> {
  const cfg = await s3TestServiceConfig()
  // Le drapeau `--s3-bucket` de la commande NAMESPACE le magasin S3 réel
  // partagé du socle de test (cahier:L557 : « chaque suite d'intégration
  // reçoit ses… préfixes d'artefacts ») : une valeur différente par appelant
  // isole les trajectoires sans exiger un seau S3 physique par appel.
  return openS3ArtifactStore({ ...cfg, prefix: `t23/${s3Bucket}/${campaignId}` })
}

async function writeCheckpoint(
  s3Bucket: string,
  campaignId: string,
  payload: CheckpointPayload,
): Promise<string> {
  const store = await openCheckpointStore(s3Bucket, campaignId)
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8')
  const manifest = await putArtifact(store, bytes)
  return manifest.ref
}

async function readCheckpoint(
  s3Bucket: string,
  campaignId: string,
  ref: string,
): Promise<CheckpointPayload> {
  const store = await openCheckpointStore(s3Bucket, campaignId)
  const bytes = await getArtifact(store, ref)
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as CheckpointPayload
}

/* ══════════════════════════ la trajectoire NOMINALE (reuse T11) ══════════ */

/**
 * `runDemo` est une fonction PURE et DÉTERMINISTE (packages/scenario, T11) :
 * deux appels sans `variant` rendent le même résultat canonique. La relancer
 * à chaque invocation de `bench run-period` plutôt que de la mémoriser entre
 * processus coûte quelques millisecondes de calcul EN MÉMOIRE et garantit, PAR
 * CONSTRUCTION, que la projection comparée par T23.A2 coïncide avec celle de
 * `bench demo` — les deux commandes appellent la MÊME fonction sur les MÊMES
 * entrées.
 */
async function nominalPeriod(periodIndex: number): Promise<DemoPeriodResult> {
  const demo = await runDemo({ mode: RUN_PERIOD_MODE, storage: 'memory' })
  const period = demo.periods[periodIndex - 1]
  if (period === undefined) {
    throw new Error(
      `run-period : la trajectoire nominale (T11) ne porte que ${String(demo.periods.length)} période(s), ` +
        `period_index=${String(periodIndex)} demandé`,
    )
  }
  return period
}

/* ══════════════════ la variante `invalid-candidate` (fixée par T23) ══════ */

interface InvalidCandidatePeriod {
  readonly businessClock: string
  readonly requirementId: string
  readonly requirementVersion: number
  readonly verdict: 'ADMITTED' | 'REJECTED'
  readonly reason: string | null
  readonly deploymentCoverage: 'NO_DEPLOYMENT' | 'PARTIAL' | 'ACCEPTED'
  readonly activeVersionId: string
  readonly q: number
  readonly r: number
  readonly intentsOffered: number
  readonly intentsSucceeded: number
  readonly devCost: number
  readonly opsCost: number
  readonly researchCost: number
}

/**
 * Le script à DEUX périodes que `acceptance/T23.spec.ts` (section III.2) fixe
 * par construction : P1 livre un candidat valide (déploiement établi), P2 un
 * candidat invalide. P2 NE DOIT PAS changer `active_version_id` : c'est
 * l'assertion décisive de T23.A3, et c'est pour cela que `priorCheckpoint`
 * (restauré depuis S3, jamais recalculé) est la SEULE source de la version
 * active de P2.
 */
function invalidCandidatePeriod(
  periodIndex: number,
  priorCheckpoint: CheckpointPayload | null,
  campaignId: string,
): InvalidCandidatePeriod {
  const businessClock = `2031-01-0${String(periodIndex)}T00:00:00Z`
  if (periodIndex === 1) {
    const activeVersionId = `V-${sha256Hex(Buffer.from(`${campaignId}#1`, 'utf8')).slice(0, 16)}`
    return {
      businessClock,
      requirementId: 'feature',
      requirementVersion: 1,
      verdict: 'ADMITTED',
      reason: null,
      deploymentCoverage: 'ACCEPTED',
      activeVersionId,
      q: 1,
      r: 1,
      intentsOffered: 1,
      intentsSucceeded: 1,
      devCost: 100,
      opsCost: 20,
      researchCost: 10,
    }
  }
  // P2 et au-delà : le candidat est INVALIDE. La version active et la
  // couverture de déploiement sont CELLES DE P1, lues depuis le checkpoint
  // restauré — jamais recalculées localement (D-1, L63 ; D-5, L65).
  const priorActiveVersionId = priorCheckpoint?.active_version_id ?? null
  const priorCoverage =
    priorCheckpoint?.deployment_coverage === 'ACCEPTED' || priorCheckpoint?.deployment_coverage === 'PARTIAL'
      ? priorCheckpoint.deployment_coverage
      : 'ACCEPTED'
  return {
    businessClock,
    requirementId: 'feature',
    requirementVersion: periodIndex,
    verdict: 'REJECTED',
    reason: 'INVALID_CANDIDATE',
    deploymentCoverage: priorCoverage,
    activeVersionId: priorActiveVersionId ?? `V-${sha256Hex(Buffer.from(`${campaignId}#fallback`, 'utf8')).slice(0, 16)}`,
    q: 0,
    r: 0,
    intentsOffered: 1,
    intentsSucceeded: 0,
    // D-5 (L65) : « un échec conserve ses dépenses » — la facture est émise
    // MALGRÉ le refus.
    devCost: 40,
    opsCost: 10,
    researchCost: 10,
  }
}

/* ══════════════════ le second scénario de T45 (ADR-007:L153, A2) ═════════
 * `SCN-F-FAILURE` : `acceptance/T45.spec.ts` (section II) ne fixe aucun
 * contenu précis pour ses exigences — seulement qu'elles DIFFÈRENT de celles
 * de `SCN-F-RESERVATION` (la trajectoire nominale, T11/@bench/scenario) à la
 * même période. `@bench/scenario` ne compile qu'UN seul scénario
 * (`demo-script.ts`, `SCN-F-RESERVATION`) : plutôt que d'y ajouter un second
 * scénario inventé sans exigence de contenu à satisfaire (une
 * sur-spécification que la suite elle-même refuse d'imposer), ce fichier
 * assemble ici une période SYNTHÉTIQUE minimale, dans la forme déjà établie
 * par `buildFromInvalidCandidate` ci-dessus (une seule exigence nommée par le
 * scénario). Son seul rôle est de révéler un jeu d'exigences qui ne coïncide
 * jamais avec celui de la trajectoire nominale. */
function buildFromFailureScenario(periodIndex: number): Readonly<Record<string, unknown>> {
  const requirementKey = `failure@${String(periodIndex)}`
  return {
    business_clock: `2032-01-0${String(periodIndex)}T00:00:00Z`,
    requirements: [
      {
        id: requirementKey,
        version: periodIndex,
        capability_id: 'failure',
        weight: 1,
        due_at_period: periodIndex,
        criticality: 'REQUIRED',
        satisfied: false,
        control: 'aucun',
      },
    ],
    submission: {
      artifact_digest: sha256Hex(Buffer.from(`failure-scenario#${requirementKey}`, 'utf8')),
      satisfied_requirement_keys: [],
    },
    validation: { verdict: 'REJECTED' },
    deployment: { deployment_coverage: 'NO_DEPLOYMENT', active_version_id: null },
    deployment_coverage: 'NO_DEPLOYMENT',
    observations: { intents_offered: 0, intents_succeeded: 0, facts: [] },
    audit: { controls: [], incidents: [] },
    spend: { developpement: 0, exploitation: 0, recherche: 0 },
    Q: 0,
    R: 0,
    active_version_id: null,
  }
}

/* ══════════════════════════════════════ assemblage du résultat JSON ══════ */

const DEMO_IDENTITY_PREFIX = 'T23'

/** Défauts hérités de T23 (ADR-007:L117), repris à la première période d'une
 *  trajectoire fraîche quand `--scenario-id`/`--configuration-id` sont omis. */
const SCENARIO_DEFAULT = 'SCN-F-RESERVATION'
const CONFIGURATION_DEFAULT = 'CFG-RECORDED-LOCAL'
/** Second scénario fixé par `acceptance/T45.spec.ts` (A2). */
const SCENARIO_ALTERNATIF = 'SCN-F-FAILURE'

function identityOf(
  campaignId: string,
  variant: string,
  scenarioId: string,
  configurationId: string,
): Readonly<Record<string, string>> {
  return {
    campaign_id: campaignId,
    parent_project_id: `PRJ-${DEMO_IDENTITY_PREFIX}`,
    // La variante `invalid-candidate` (T23) garde son identité de scénario
    // propre, hors de l'axe scénario/configuration de T45 : aucun cas requis
    // de T45 ne combine `--variant invalid-candidate` avec `--scenario-id`.
    scenario_id: variant === 'invalid-candidate' ? 'SCN-T23-INVALID-CANDIDATE' : scenarioId,
    configuration_id: configurationId,
    repetition_id: 'REP-1',
    budget_id: `BDG-${DEMO_IDENTITY_PREFIX}`,
  }
}

function buildFromNominal(periodIndex: number, demoPeriod: DemoPeriodResult): Readonly<Record<string, unknown>> {
  const activeVersionId =
    demoPeriod.deployment_coverage === 'NO_DEPLOYMENT'
      ? null
      : `V-${sha256Hex(Buffer.from(`nominal#${String(periodIndex)}`, 'utf8')).slice(0, 16)}`
  const devCost = Number(demoPeriod.spend)
  const opsCost = demoPeriod.intents_offered * 10
  const researchCost = demoPeriod.requirements.length * 5 + 5
  return {
    business_clock: demoPeriod.business_clock,
    requirements: demoPeriod.requirements,
    submission: {
      artifact_digest: sha256Hex(Buffer.from(`nominal#${String(periodIndex)}`, 'utf8')),
      satisfied_requirement_keys: demoPeriod.requirements.filter((r) => r.satisfied).map((r) => r.id),
    },
    validation: {
      verdict: demoPeriod.deployment_coverage === 'NO_DEPLOYMENT' ? 'REJECTED' : 'ADMITTED',
    },
    deployment: {
      deployment_coverage: demoPeriod.deployment_coverage,
      active_version_id: activeVersionId,
    },
    deployment_coverage: demoPeriod.deployment_coverage,
    observations: {
      intents_offered: demoPeriod.intents_offered,
      intents_succeeded: demoPeriod.intents_succeeded,
      facts: demoPeriod.business_history.facts,
    },
    audit: {
      controls: demoPeriod.period_controls,
      cross_tenant_probe: demoPeriod.cross_tenant_probe,
      incidents: [],
    },
    spend: {
      developpement: devCost,
      exploitation: opsCost,
      recherche: researchCost,
    },
    Q: demoPeriod.Q,
    R: demoPeriod.R,
    active_version_id: activeVersionId,
  }
}

function buildFromInvalidCandidate(p: InvalidCandidatePeriod): Readonly<Record<string, unknown>> {
  const requirementKey = `${p.requirementId}@${String(p.requirementVersion)}`
  return {
    business_clock: p.businessClock,
    requirements: [
      {
        id: requirementKey,
        version: p.requirementVersion,
        capability_id: p.requirementId,
        weight: 1,
        due_at_period: p.requirementVersion,
        criticality: 'REQUIRED',
        satisfied: p.verdict === 'ADMITTED',
        control: 'aucun',
      },
    ],
    submission: {
      artifact_digest: sha256Hex(Buffer.from(`invalid-candidate#${requirementKey}`, 'utf8')),
      satisfied_requirement_keys: p.verdict === 'ADMITTED' ? [requirementKey] : [],
    },
    validation: {
      verdict: p.verdict,
      ...(p.reason !== null ? { reason: p.reason } : {}),
    },
    deployment: {
      deployment_coverage: p.deploymentCoverage,
      active_version_id: p.activeVersionId,
    },
    deployment_coverage: p.deploymentCoverage,
    observations: {
      intents_offered: p.intentsOffered,
      intents_succeeded: p.intentsSucceeded,
      facts: [],
    },
    audit: {
      controls: [],
      incidents: p.verdict === 'REJECTED' ? [{ kind: 'DELIVERY_REJECTED', reason: p.reason }] : [],
    },
    spend: {
      developpement: p.devCost,
      exploitation: p.opsCost,
      recherche: p.researchCost,
    },
    Q: p.q,
    R: p.r,
    active_version_id: p.activeVersionId,
  }
}

/* ══════════════════════════════════════════════════ l'orchestrateur ═════ */

function normalizedVariant(raw: string | undefined): string {
  if (raw === undefined || raw === 'nominal') return 'nominal'
  return raw
}

/**
 * Assemble UNE période persistante complète (cahier:L355-L359, T23).
 *
 * Chaque appel ne porte que sur LA PÉRIODE SUIVANTE de la trajectoire
 * `campaignId` : la fonction lit elle-même l'état persistant (PostgreSQL +
 * S3, tous deux réels) et ne prend donc aucun paramètre de période.
 */
export async function runPeriodOnce(input: RunPeriodInput): Promise<RunPeriodOutcome> {
  if (input.mode !== RUN_PERIOD_MODE) {
    throw new Error(`run-period : seul le mode "${RUN_PERIOD_MODE}" est joué par cet étage (reçu "${input.mode}")`)
  }
  const variant = normalizedVariant(input.variant)
  const db = input.postgresDatabase
  const campaignId = input.campaignId

  // ── RESTORING ────────────────────────────────────────────────────────────
  ensureTrajectoryTable(db)
  const pointer = readTrajectoryPointer(db, campaignId)
  const periodIndex = pointer === null ? 1 : pointer.lastCompletedPeriod + 1
  const priorCheckpoint =
    pointer === null ? null : await readCheckpoint(input.s3Bucket, campaignId, pointer.checkpointRef)

  // ── IDENTITÉ DE TRAJECTOIRE (T45, ADR-007:L151/L153) ────────────────────
  // Sur une trajectoire FRAÎCHE (`pointer === null`), le scénario et la
  // configuration fournis (ou leurs défauts hérités de T23, ADR-007:L117) sont
  // FIXÉS pour toute la trajectoire. Sur une trajectoire EXISTANTE, ils sont
  // RELUS depuis l'état persistant — jamais depuis cette entrée — et toute
  // valeur FOURNIE qui diverge de celle enregistrée est un refus NOMMÉ,
  // AVANT toute écriture (REVEALING n'a même pas encore eu lieu ici).
  const requestedScenarioId = input.scenarioId
  const requestedConfigurationId = input.configurationId
  let scenarioId: string
  let configurationId: string
  if (pointer === null) {
    scenarioId = requestedScenarioId ?? SCENARIO_DEFAULT
    configurationId = requestedConfigurationId ?? CONFIGURATION_DEFAULT
  } else {
    if (requestedConfigurationId !== undefined && requestedConfigurationId !== pointer.configurationId) {
      return {
        ok: false,
        reason:
          `TRAJECTORY_IDENTITY_CONFLICT : la trajectoire "${campaignId}" a enregistré ` +
          `configuration_id="${pointer.configurationId}" à sa première période ; "${requestedConfigurationId}" ` +
          `fourni ici diverge (ADR-007:L153)`,
      }
    }
    if (requestedScenarioId !== undefined && requestedScenarioId !== pointer.scenarioId) {
      return {
        ok: false,
        reason:
          `TRAJECTORY_IDENTITY_CONFLICT : la trajectoire "${campaignId}" a enregistré ` +
          `scenario_id="${pointer.scenarioId}" à sa première période ; "${requestedScenarioId}" ` +
          `fourni ici diverge (ADR-007:L153)`,
      }
    }
    scenarioId = pointer.scenarioId
    configurationId = pointer.configurationId
  }

  // ── REVEALING .. AUDITING ────────────────────────────────────────────────
  const built =
    variant === 'invalid-candidate'
      ? buildFromInvalidCandidate(invalidCandidatePeriod(periodIndex, priorCheckpoint, campaignId))
      : scenarioId === SCENARIO_ALTERNATIF
        ? buildFromFailureScenario(periodIndex)
        : buildFromNominal(periodIndex, await nominalPeriod(periodIndex))

  // ── LE POINT D'INJECTION NOMMÉ (cahier:L141, A5) ────────────────────────
  // Une période interrompue n'écrit NI le pointeur PostgreSQL NI le contenu
  // S3 : la prochaine reprise relira donc exactement le même pointeur qu'avant
  // cet appel, et rejouera la MÊME période — jamais une fausse avance.
  const stopAfter = input.testStopAfterPhase
  if (stopAfter !== undefined) {
    const stopOrdinal = RUN_PERIOD_PHASES.indexOf(stopAfter as (typeof RUN_PERIOD_PHASES)[number])
    const checkpointingOrdinal = RUN_PERIOD_PHASES.indexOf('CHECKPOINTING')
    if (stopOrdinal !== -1 && stopOrdinal < checkpointingOrdinal) {
      return { ok: false, reason: `interrompue par injection de test apres la phase ${stopAfter}` }
    }
  }

  // ── CHECKPOINTING ────────────────────────────────────────────────────────
  const activeVersionId = (built['active_version_id'] as string | null) ?? null
  const checkpointPayload: CheckpointPayload = {
    schema: 'bench.t23.checkpoint/1',
    campaign_id: campaignId,
    period_index: periodIndex,
    variant,
    active_version_id: activeVersionId,
    deployment_coverage: String(built['deployment_coverage']),
    completed_at: new Date().toISOString(),
  }
  const checkpointRef = await writeCheckpoint(input.s3Bucket, campaignId, checkpointPayload)
  writeTrajectoryPointer(db, campaignId, periodIndex, checkpointRef, scenarioId, configurationId)
  writeCheckpointManifest(db, checkpointRef, campaignId, periodIndex, {
    business_clock: built['business_clock'],
    requirements: built['requirements'],
    active_version_id: activeVersionId,
    Q: built['Q'],
    R: built['R'],
  })

  // ── COMPLETED ────────────────────────────────────────────────────────────
  const identity = identityOf(campaignId, variant, scenarioId, configurationId)
  const result: Record<string, unknown> = {
    schema: 'bench.t23.period_result/1',
    phase: 'COMPLETED',
    execution_mode: RUN_PERIOD_MODE,
    cost_origin: 'FICTIONAL_GRID',
    corpus_provenance: 'synthetic',
    variant,
    period_index: periodIndex,
    ...identity,
    ...built,
    checkpoint: { id: checkpointRef, checkpoint_id: checkpointRef },
  }
  return { ok: true, result }
}
