// ─────────────────────────────────────────────────────────────────────────────
// `bench run-trajectory` / `bench replay-trajectory` — la plomberie Temporal
// RÉELLE de T24 (cahier L361-L370). AUCUNE RÈGLE MÉTIER ICI (même règle que
// l'en-tête de `./index.ts`) : le workflow déterministe vit dans
// `@bench/workflows` (bac à sable Temporal, jamais importé ici comme module
// EXÉCUTABLE — voir la note sur `workflowsPath` plus bas), les effets externes
// dans les Activities de `@bench/activities`. Ce fichier se contente de :
//
//   (1) héberger, DANS LE MÊME PROCESSUS, le Worker Temporal ET le Client qui
//       démarre la trajectoire et en attend le résultat (un seul processus =
//       une seule mesure cohérente de `fake_provider_calls`, en-tête de
//       `packages/activities/src/trajectory-activities.ts`) ;
//   (2) exporter l'historique RÉEL de l'exécution (section III de
//       `acceptance/T24.spec.ts`) en octets protobuf bruts — jamais relu par
//       la suite elle-même, qui ne relit que ce que `replay-trajectory`
//       affiche ;
//   (3) appliquer, SUR L'EXPORT SEULEMENT, le point d'injection
//       `--test-reorder-commands` (A3) : la trajectoire VÉCUE reste intacte
//       (`phase=COMPLETED` malgré le drapeau), seul le fichier écrit est
//       corrompu ;
//   (4) rejouer un historique contre le CODE ACTUEL via
//       `Worker.runReplayHistory` (A2, A3) — AUCUNE connexion Temporal n'est
//       ouverte pour cette opération : le replay ne contacte ni le serveur
//       réel ni aucune Activity (elles ne sont même pas passées en option),
//       ce qui réalise `--block-external` PAR CONSTRUCTION plutôt que par un
//       filtre réseau.
//
// POURQUOI `workflowsPath` POINTE SUR LE FICHIER, JAMAIS SUR UN IMPORT ESM
// DE CE PROCESSUS. `packages/workflows/src/trajectory-workflow.ts` appelle
// `proxyActivities(...)` À L'IMPORT (hors de toute fonction) : évalué par CE
// processus Node (hors du bac à sable que seul le Worker construit),
// `proxyActivities` lève immédiatement (« Activities may only be used from
// within workflow context »). Le Worker, lui, ne l'exécute JAMAIS ainsi : il
// lit le FICHIER par chemin et le compile dans son propre bac à sable V8 via
// son bundler webpack interne. Ce fichier résout donc ce chemin par
// `import.meta.resolve` (résolution ESM native : le `package.json` de
// `@bench/workflows` ne publie qu'une condition `import`, pas `require`,
// donc `require.resolve` échouerait ici — « No "exports" main defined » —
// même si `@bench/workflows` est bien une dépendance déclarée de `apps/cli`,
// condition que l'isolation stricte de pnpm exige de toute façon), jamais par
// `import './...'` qui chargerait le module pour de vrai.
// ─────────────────────────────────────────────────────────────────────────────
import { fork } from 'node:child_process'
import * as path from 'node:path'
import * as fsp from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { Client, Connection } from '@temporalio/client'
import { NativeConnection, Worker } from '@temporalio/worker'
import temporalProto from '@temporalio/proto'

import { fakeProviderCallsTotal, getPeriodCount, modelCallActivity, runPeriodOnce } from '@bench/activities'

/* ══════════════════════ le type protobuf d'historique (réutilisé 2x) ══════ */

type HistoryEvent = Record<string, unknown>
interface PlainHistory {
  events: HistoryEvent[]
}

function historyProtoType(): {
  encode: (msg: unknown) => { finish(): Uint8Array }
  decode: (bytes: Uint8Array) => unknown
  toObject: (msg: unknown, opts: Record<string, unknown>) => PlainHistory
} {
  const root = (temporalProto as unknown as { default?: unknown }).default ?? temporalProto
  const r = root as {
    temporal: { api: { history: { v1: { History: ReturnType<typeof historyProtoType> } } } }
  }
  return r.temporal.api.history.v1.History
}

/** Passe par un aller-retour protobuf complet : l'objet rendu est un POJO mutable. */
function toPlainHistory(rawEvents: readonly unknown[]): PlainHistory {
  const HistoryType = historyProtoType()
  const encoded = HistoryType.encode({ events: rawEvents }).finish()
  const decoded = HistoryType.decode(encoded)
  return HistoryType.toObject(decoded, { longs: Number, enums: Number, bytes: Buffer })
}

async function writeHistoryFile(filePath: string, history: PlainHistory): Promise<void> {
  const HistoryType = historyProtoType()
  const bytes = HistoryType.encode(history).finish()
  await fsp.writeFile(filePath, bytes)
}

async function readHistoryFile(filePath: string): Promise<PlainHistory> {
  let bytes: Buffer
  try {
    bytes = await fsp.readFile(filePath)
  } catch (e) {
    throw new Error(
      `replay-trajectory : historique illisible (${filePath}) : ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  const HistoryType = historyProtoType()
  let decoded: unknown
  try {
    decoded = HistoryType.decode(bytes)
  } catch (e) {
    throw new Error(
      `replay-trajectory : historique corrompu (${filePath}) : ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  return HistoryType.toObject(decoded, { longs: Number, enums: Number, bytes: Buffer })
}

/**
 * Point d'injection nommé (cahier:L141, A3) : permute l'IDENTITÉ (type + id)
 * des deux PREMIÈRES Activities planifiées de l'historique — exactement les
 * deux que chaque période planifie (`'model-call'` puis `'run-period'`,
 * `packages/workflows/src/trajectory-workflow.ts`). Rejouer cet export contre
 * le code RÉEL (non permuté) du workflow est alors non déterministe : au
 * moment où le code émet sa commande `'model-call'`, l'historique enregistre
 * `'run-period'` à cette place (mesuré : `Worker.runReplayHistory` lève
 * `DeterminismViolationError`, « Activity id of scheduled event … does not
 * match activity id of activity command … »).
 */
function swapFirstTwoActivitySchedules(events: readonly HistoryEvent[]): void {
  const scheduled = events.filter((e) => e['activityTaskScheduledEventAttributes'] !== undefined)
  if (scheduled.length < 2) {
    throw new Error(
      `--test-reorder-commands : moins de deux Activities planifiées dans l'historique (${String(scheduled.length)} trouvée(s))`,
    )
  }
  const e1 = scheduled[0] as HistoryEvent
  const e2 = scheduled[1] as HistoryEvent
  const a1 = e1['activityTaskScheduledEventAttributes'] as Record<string, unknown>
  const a2 = e2['activityTaskScheduledEventAttributes'] as Record<string, unknown>
  const tmpId = a1['activityId']
  const tmpType = a1['activityType']
  a1['activityId'] = a2['activityId']
  a1['activityType'] = a2['activityType']
  a2['activityId'] = tmpId
  a2['activityType'] = tmpType
}

/* ══════════════════════════════════ `bench run-trajectory` ════════════════ */

export interface RunTrajectoryParams {
  readonly mode: string
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly exportHistoryPath: string
  readonly testReorderCommands: boolean
  readonly testDuplicateActivity: string | undefined
  readonly testContinueAsNewAfter: number | undefined
}

/** Forme VENANT de `trajectoryWorkflow` (@bench/workflows) — reprise ici en
 * dur plutôt qu'importée : les deux côtés sont tenus en phase par
 * `acceptance/T24.spec.ts`, jamais par un type partagé (même choix que
 * `packages/workflows/src/trajectory-workflow.ts` pour les Activities,
 * section « formes du contrat » de ce même fichier). */
interface TrajectoryWorkflowResult {
  readonly campaign_id: string
  readonly phase: string
  readonly period_starts: ReadonlyArray<{ readonly period_index: number; readonly after_checkpoint_of: number | null }>
  readonly continuation_chain: ReadonlyArray<{
    readonly run_id: string
    readonly campaign_id: string
    readonly periods: readonly number[]
  }>
  readonly continued_as_new_count: number
  readonly duplicated_activity: { readonly operation: string; readonly calls_observed: number; readonly results_identical: boolean } | null
}

function resolveWorkflowsPath(): string {
  const indexUrl = import.meta.resolve('@bench/workflows')
  const indexPath = fileURLToPath(indexUrl)
  return path.join(path.dirname(indexPath), 'trajectory-workflow.js')
}

function temporalAddress(): string {
  return process.env['TEMPORAL_ADDRESS'] ?? '127.0.0.1:7233'
}

function temporalNamespace(): string {
  return process.env['TEMPORAL_NAMESPACE'] ?? 'default'
}

export async function runTrajectory(params: RunTrajectoryParams): Promise<Readonly<Record<string, unknown>>> {
  const address = temporalAddress()
  const namespace = temporalNamespace()
  // Un identifiant PAR CAMPAGNE (L78) : deux trajectoires concurrentes
  // (acceptance/T24.spec.ts, V.5) ne se disputent ni file de tâches ni
  // workflow id.
  const taskQueue = `t24-trajectory-${params.campaignId}`
  const workflowId = `t24-wf-${params.campaignId}`

  const nativeConnection = await NativeConnection.connect({ address })
  const worker = await Worker.create({
    connection: nativeConnection,
    namespace,
    taskQueue,
    workflowsPath: resolveWorkflowsPath(),
    activities: {
      getPeriodCount,
      'model-call': modelCallActivity,
      'run-period': runPeriodOnce,
    },
  })
  const runPromise = worker.run()

  const clientConnection = await Connection.connect({ address })
  const client = new Client({ connection: clientConnection, namespace })

  try {
    const handle = await client.workflow.start('trajectoryWorkflow', {
      taskQueue,
      workflowId,
      args: [
        {
          mode: params.mode,
          campaignId: params.campaignId,
          postgresDatabase: params.postgresDatabase,
          s3Bucket: params.s3Bucket,
          testDuplicateActivity: params.testDuplicateActivity,
          testContinueAsNewAfter: params.testContinueAsNewAfter,
        },
      ],
    })

    const result = (await handle.result()) as TrajectoryWorkflowResult

    // Historique RÉEL de CETTE exécution (celle que `handle` désigne : la
    // PREMIÈRE run-id de la chaîne — suffisant ici, aucun cas requis de T24
    // n'exporte/rejoue une trajectoire qui a continué, section VI de la
    // suite).
    const rawHistory = await handle.fetchHistory()
    const plainHistory = toPlainHistory(rawHistory.events ?? [])
    if (params.testReorderCommands) swapFirstTwoActivitySchedules(plainHistory.events)
    await writeHistoryFile(params.exportHistoryPath, plainHistory)

    return {
      campaign_id: result.campaign_id,
      phase: result.phase,
      period_starts: result.period_starts,
      continuation_chain: result.continuation_chain,
      continued_as_new_count: result.continued_as_new_count,
      history_export_path: params.exportHistoryPath,
      fake_provider_calls: fakeProviderCallsTotal(),
      duplicated_activity: result.duplicated_activity,
    }
  } finally {
    worker.shutdown()
    await runPromise.catch(() => undefined)
    await nativeConnection.close()
    await clientConnection.close()
  }
}

/* ══════════════════════════════════ `bench replay-trajectory` ═══════════════
 * AUCUNE connexion Temporal, AUCUNE Activity passée en option : le replay ne
 * peut PAS contacter un service externe (`--block-external` par construction,
 * pas par filtre). `Worker.runReplayHistory` lève `DeterminismViolationError`
 * (ou toute autre erreur de replay) quand l'historique ne correspond pas au
 * code ACTUEL du workflow (docs.temporal.io/workflow-definition, cahier:L653).
 */

export interface ReplayTrajectoryResult {
  readonly determinism: 'OK' | 'VIOLATION'
  readonly violation_reason: string | null
  readonly external_calls_during_replay: number
  readonly new_writes_during_replay: number
  readonly history_path: string
}

export async function replayTrajectory(historyPath: string): Promise<ReplayTrajectoryResult> {
  // Une erreur ICI (fichier absent ou octets non décodables) n'est PAS un
  // verdict de déterminisme : c'est un refus antérieur, qui remonte tel quel
  // à l'appelant (acceptance/T24.spec.ts, A2, « contrôle positif » : un
  // historique absent fait ÉCHOUER la commande).
  const history = await readHistoryFile(historyPath)

  try {
    await Worker.runReplayHistory({ workflowsPath: resolveWorkflowsPath() }, history)
    return {
      determinism: 'OK',
      violation_reason: null,
      // Aucune Activity n'est enregistrée pour ce replay (ci-dessus) : le
      // bac à sable Temporal ne peut matériellement déclencher ni appel
      // externe ni écriture — mesuré nul, jamais supposé.
      external_calls_during_replay: 0,
      new_writes_during_replay: 0,
      history_path: historyPath,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      determinism: 'VIOLATION',
      violation_reason: message,
      external_calls_during_replay: 0,
      new_writes_during_replay: 0,
      history_path: historyPath,
    }
  }
}

/* ══════════════ isolation de processus (sortie standard garantie propre) ═══
 * `./index.ts` n'appelle JAMAIS `runTrajectory`/`replayTrajectory` ci-dessus
 * directement : il passe par les deux wrappers suivants, qui exécutent le
 * travail dans un PROCESSUS FORKÉ (`./trajectory-worker-entry.ts`) dont la
 * sortie standard est entièrement ignorée. Voir l'en-tête de ce fichier pour
 * la mesure qui motive cette isolation (le Core natif de Temporal écrit
 * parfois directement sur la sortie standard, hors de tout logger JS).
 */

type WorkerMessage = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string }

function workerEntryPath(): string {
  return fileURLToPath(new URL('./trajectory-worker-entry.js', import.meta.url))
}

function runInForkedProcess(kind: 'run' | 'replay', payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = fork(workerEntryPath(), [kind, JSON.stringify(payload)], {
      // stdout DU PROCESSUS ENFANT IGNORÉ (ni hérité, ni mis en pipe) : rien
      // de ce que le Core natif y écrit ne peut atteindre LA sortie standard
      // de `bench`. stderr reste hérité pour la visibilité des journaux.
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    let settled = false
    child.on('message', (message: WorkerMessage) => {
      settled = true
      if (message.ok) resolve(message.value)
      else reject(new Error(message.message))
    })
    child.on('error', (err: Error) => {
      if (!settled) {
        settled = true
        reject(err)
      }
    })
    child.on('exit', (code: number | null) => {
      if (!settled) {
        settled = true
        reject(
          new Error(
            `trajectory-worker-entry : processus terminé sans message IPC (code ${String(code)})`,
          ),
        )
      }
    })
  })
}

export async function runTrajectoryForked(
  params: RunTrajectoryParams,
): Promise<Readonly<Record<string, unknown>>> {
  return (await runInForkedProcess('run', params)) as Readonly<Record<string, unknown>>
}

export async function replayTrajectoryForked(historyPath: string): Promise<ReplayTrajectoryResult> {
  return (await runInForkedProcess('replay', { historyPath })) as ReplayTrajectoryResult
}
