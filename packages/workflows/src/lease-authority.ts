// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — l'AUTORITE DE BAIL (cahier L371-L378, tâche T25).
//
// ÉTAGE VERT. Les cinq rôles ci-dessous sont le contrat FIXÉ par la section
// III de l'en-tête d'`acceptance/T25.spec.ts` (ADR-001 : l'auteure de cette
// suite est aveugle à ce fichier ; cette implémentation ne redéfinit rien du
// contrat, elle se contente de le satisfaire sous les noms qu'elle a déjà
// choisis).
//
// DURABILITÉ CHOISIE : EN MÉMOIRE, DANS LE `LeaseHandle` LUI-MÊME. La section
// III.1 de la suite est explicite : « aucune ressource Postgres n'est exigée
// par cette suite : l'implémenteur choisit la durabilité du bail ». Un bail de
// fencing protège contre deux EXÉCUTEURS concurrents d'UN MÊME processus
// orchestrateur (invariant 6, L68 : un rejeu de l'orchestrateur, pas deux
// processus Node indépendants qui se disputeraient une ressource) — une Map en
// mémoire, vivante pour la durée du `LeaseHandle`, suffit à cette propriété et
// évite d'introduire une dépendance PostgreSQL qu'aucun cas de T25 n'exige
// (contrairement à A1/A3/A4/A5 côté `packages/gateway`, qui restent sur le
// journal durable réel de T17).
//
// LE MÊME `LeaseHandle` PORTE AUSSI LES CHECKPOINTS PUBLIÉS (additif pour
// `packages/activities`, section III.9) : `publishCheckpointActivity` et
// `listPublishedCheckpoints` ne reçoivent QUE `leaseHandle` en paramètre
// d'autorité (pas de second handle de stockage) — le `LeaseHandle` est donc la
// seule ressource partagée disponible pour cette lecture indépendante
// (IV.3 : « le contrôle qui ferme ce trou »).
//
// CE FICHIER EST DÉLIBÉRÉMENT SÉPARÉ DE `trajectory-workflow.ts`. Ce dernier
// est le SEUL fichier que le Worker Temporal bundle dans le bac à sable
// (`workflowsPath`) : il n'importe que `@temporalio/workflow`, jamais
// `@bench/contracts` ni aucun autre paquet qui dépendrait de `node:*` (voir son
// en-tête, et L377 du cahier : « les services qui protègent les effets
// contrôlent le jeton, PAS SEULEMENT LE SCHEDULER » — l'autorité de bail n'est
// donc pas elle-même tenue de vivre dans un Workflow replayable). Ajouter ces
// cinq exports à `trajectory-workflow.ts` romprait cette propriété pour rien :
// `index.ts` exporte les deux fichiers côte à côte, sans que l'un importe
// l'autre.
// ─────────────────────────────────────────────────────────────────────────────

import { ContractViolation } from '@bench/contracts'
import { StaleExecutionError, STALE_EXECUTION_CODE } from './fencing-errors.js'

export { StaleExecutionError, STALE_EXECUTION_CODE, isStaleExecutionError } from './fencing-errors.js'

/** Options d'ouverture de l'autorité de bail — forme NON fixée par le cahier
 * (section III.1 : « l'implémenteur choisit la durabilité du bail »). */
export interface OpenLeaseAuthorityOptions {
  readonly [key: string]: unknown
}

/** Poignée opaque rendue par `openLeaseAuthority` ; reçue telle quelle par les
 * quatre autres rôles et par les additifs de gateway/activities/sandbox. */
export interface LeaseHandle {
  readonly [key: string]: unknown
}

/** Entrée d'`acquireLease` (section III.2). */
export interface AcquireLeaseParams {
  readonly resourceId: string
  readonly holderId: string
  readonly now: number
}

/** Jeton de fencing émis pour `resourceId` — ENTIER STRICTEMENT CROISSANT par
 * ressource (cahier L375 : « jeton 7, puis jeton 8 », propriété pas valeur). */
export interface AcquireLeaseResult {
  readonly resourceId: string
  readonly token: number
  readonly holderId: string
}

/** Entrée de `heartbeatLease` (section III.3). */
export interface HeartbeatLeaseParams {
  readonly resourceId: string
  readonly token: number
  readonly now: number
}

/** `heartbeatLease` NE LÈVE JAMAIS (même discipline que `probeTcp`, T19) : un
 * refus est un résultat, pas une exception. */
export interface HeartbeatLeaseResult {
  readonly accepted: boolean
  readonly currentToken: number
  readonly code?: string
}

/** Entrée de `revokeLease` (section III.4). */
export interface RevokeLeaseParams {
  readonly resourceId: string
  readonly now: number
}

export interface RevokeLeaseResult {
  readonly revoked: boolean
}

/* ──────────────────────────────────────────── état interne, dans le handle */

/** Un jeton courant par ressource, et si elle a été explicitement révoquée —
 * DISTINCT d'une simple supersession par un jeton plus récent (A4 vs A1). */
interface LeaseResourceState {
  currentToken: number
  revoked: boolean
}

/** État porté par le `LeaseHandle` lui-même (cf. en-tête : pas de ressource
 * Postgres, la Map vit pour la durée du handle). */
interface LeaseAuthorityState {
  readonly resources: Map<string, LeaseResourceState>
  readonly publishedCheckpoints: Map<string, string[]>
}

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'nombre fini attendu')
  }
  return v
}

/** Lit l'état interne d'un `LeaseHandle` — jette si l'argument n'est pas une
 * poignée rendue par `openLeaseAuthority` de CE module. */
function stateOf(leaseHandle: unknown): LeaseAuthorityState {
  const h = leaseHandle as { resources?: unknown; publishedCheckpoints?: unknown } | null | undefined
  if (h === null || h === undefined || !(h.resources instanceof Map) || !(h.publishedCheckpoints instanceof Map)) {
    throw new ContractViolation(
      'TYPE_MISMATCH',
      'leaseHandle',
      'poignée rendue par openLeaseAuthority (@bench/workflows) attendue',
    )
  }
  return h as unknown as LeaseAuthorityState
}

/**
 * Ouvre l'autorité de bail (section III.1). Aucune ressource externe n'est
 * provisionnée (cf. en-tête) : la poignée rendue PORTE elle-même l'état.
 */
export async function openLeaseAuthority(opts?: OpenLeaseAuthorityOptions): Promise<LeaseHandle> {
  void opts
  const state: LeaseAuthorityState = {
    resources: new Map<string, LeaseResourceState>(),
    publishedCheckpoints: new Map<string, string[]>(),
  }
  return state as unknown as LeaseHandle
}

/**
 * Émet un jeton de fencing strictement croissant pour `resourceId` (section
 * III.2, cahier L375). Un nouvel octroi efface toute révocation antérieure de
 * la même ressource : l'octroi explicite d'un nouveau bail est un geste
 * distinct de la simple survivance d'un jeton révoqué.
 */
export async function acquireLease(
  leaseHandle: LeaseHandle,
  params: AcquireLeaseParams,
): Promise<AcquireLeaseResult> {
  const p = (params ?? {}) as Partial<AcquireLeaseParams>
  const resourceId = requireNonEmptyString(p.resourceId, 'acquireLease.resourceId')
  const holderId = requireNonEmptyString(p.holderId, 'acquireLease.holderId')
  requireNumber(p.now, 'acquireLease.now')

  const state = stateOf(leaseHandle)
  const prev = state.resources.get(resourceId)
  const token = (prev?.currentToken ?? 0) + 1
  state.resources.set(resourceId, { currentToken: token, revoked: false })

  return { resourceId, token, holderId }
}

/**
 * Renouvelle ou refuse un bail selon le jeton courant de `resourceId` (section
 * III.3, cahier L375/A6). `currentToken` nomme TOUJOURS le vrai jeton courant,
 * qu'il accepte ou refuse la tentative — un heartbeat tardif ne le fait JAMAIS
 * reculer.
 */
export async function heartbeatLease(
  leaseHandle: LeaseHandle,
  params: HeartbeatLeaseParams,
): Promise<HeartbeatLeaseResult> {
  const p = (params ?? {}) as Partial<HeartbeatLeaseParams>
  const resourceId = requireNonEmptyString(p.resourceId, 'heartbeatLease.resourceId')
  const token = requireNumber(p.token, 'heartbeatLease.token')
  requireNumber(p.now, 'heartbeatLease.now')

  const state = stateOf(leaseHandle)
  const entry = state.resources.get(resourceId)
  const currentToken = entry?.currentToken ?? 0
  const accepted = entry !== undefined && !entry.revoked && entry.currentToken === token

  if (accepted) return { accepted: true, currentToken }
  return { accepted: false, currentToken, code: STALE_EXECUTION_CODE }
}

/**
 * Révoque explicitement tout jeton pour `resourceId` (section III.4, cahier
 * L371 : « réconciliation après annulation »). Après cet appel, AUCUN jeton —
 * même celui qui serait sinon encore courant — n'est plus admis, DISTINCT
 * d'une simple supersession par un jeton plus récent (A4 vs A1).
 */
export async function revokeLease(
  leaseHandle: LeaseHandle,
  params: RevokeLeaseParams,
): Promise<RevokeLeaseResult> {
  const p = (params ?? {}) as Partial<RevokeLeaseParams>
  const resourceId = requireNonEmptyString(p.resourceId, 'revokeLease.resourceId')
  requireNumber(p.now, 'revokeLease.now')

  const state = stateOf(leaseHandle)
  const prev = state.resources.get(resourceId)
  state.resources.set(resourceId, { currentToken: prev?.currentToken ?? 0, revoked: true })

  return { revoked: true }
}

/**
 * Ferme l'autorité de bail (section III.5, optionnel comme `closeStore`).
 * Aucune ressource externe à libérer (cf. en-tête) : les Maps internes sont
 * simplement vidées.
 */
export async function closeLeaseAuthority(leaseHandle: LeaseHandle): Promise<void> {
  const state = stateOf(leaseHandle)
  state.resources.clear()
  state.publishedCheckpoints.clear()
}

/* ───────────────── additifs internes, utilisés par gateway/activities/sandbox
 * pour appliquer LE MÊME contrôle de bail sans dupliquer l'état (L377 : « les
 * services qui protègent les effets contrôlent le jeton »). Ces exports ne
 * sont PAS des rôles de la suite (absents de ROLES, acceptance/T25.spec.ts) :
 * ils sont le mécanisme PARTAGÉ par lequel les quatre autres paquets lisent
 * l'état que ce fichier possède, sans réinventer trois copies divergentes de
 * la même règle d'admission. */

/** `token` est-il, EN CE MOMENT, le jeton courant et non révoqué de
 * `resourceId` ? Ne lève jamais : un `leaseHandle` mal formé est traité comme
 * une non-admission plutôt que de faire planter un appelant qui a lui-même la
 * discipline « ne lève jamais » (`writeToRestoredVolume`, T19/sandbox). */
export function isLeaseAdmitted(leaseHandle: unknown, resourceId: string, token: number): boolean {
  try {
    const state = stateOf(leaseHandle)
    const entry = state.resources.get(resourceId)
    return entry !== undefined && !entry.revoked && entry.currentToken === token
  } catch {
    return false
  }
}

/** Même contrôle que `isLeaseAdmitted`, mais lève `StaleExecutionError` sur
 * refus — ce que `dispatchModelCallFenced`/`publishCheckpointActivity`
 * utilisent, puisqu'eux REJETTENT une promesse plutôt que de rendre un champ
 * `accepted` (section III.6, III.8). */
export function assertLeaseAdmitted(leaseHandle: unknown, resourceId: string, token: number): void {
  if (!isLeaseAdmitted(leaseHandle, resourceId, token)) {
    throw new StaleExecutionError(
      resourceId,
      `jeton ${String(token)} non admis pour la ressource ${resourceId} (périmé ou révoqué)`,
    )
  }
}

/** Enregistre `checkpointRef` comme publié pour `resourceId`, dans le MÊME
 * `leaseHandle` (section III.9 : `listPublishedCheckpoints` n'a pas d'autre
 * ressource à interroger). Jamais appelé si `assertLeaseAdmitted` a déjà
 * rejeté — c'est cette absence d'appel, pas une condition ici, qui garantit
 * qu'un checkpoint périmé n'apparaît jamais dans la liste (IV.3). */
export function recordPublishedCheckpoint(leaseHandle: unknown, resourceId: string, checkpointRef: string): void {
  const state = stateOf(leaseHandle)
  const list = state.publishedCheckpoints.get(resourceId)
  if (list === undefined) {
    state.publishedCheckpoints.set(resourceId, [checkpointRef])
  } else {
    list.push(checkpointRef)
  }
}

/** Lecture INDÉPENDANTE de ce que `recordPublishedCheckpoint` a réellement
 * enregistré (section III.9). */
export function readPublishedCheckpoints(leaseHandle: unknown, resourceId: string): readonly string[] {
  const state = stateOf(leaseHandle)
  return state.publishedCheckpoints.get(resourceId) ?? []
}
