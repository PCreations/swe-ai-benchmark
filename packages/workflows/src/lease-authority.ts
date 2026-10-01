// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — l'AUTORITE DE BAIL (cahier L371-L378, tâche T25).
//
// ÉTAGE ROUGE. Les cinq rôles ci-dessous sont le contrat FIXÉ par la section
// III de l'en-tête d'`acceptance/T25.spec.ts` (ADR-001 : l'auteure de cette
// suite est aveugle à ce fichier ; ce squelette ne redéfinit rien du contrat,
// il se contente d'exister sous les noms qu'elle a déjà choisis). Aucune règle
// de bail n'est écrite ici : chaque export lève `NotImplemented` et c'est,
// avec les cinq autres squelettes de ce commit (packages/gateway,
// packages/activities, packages/sandbox), ce qui rend `T25.A1`..`T25.A6` rouges
// pour la raison attendue — `STUB_NOT_IMPLEMENTED`, jamais un module
// introuvable — plutôt que de laisser la suite échouer à se charger.
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
//
// `packages/workflows` est le PREMIER paquet listé dans `PACKAGES` côté suite
// (acceptance/T25.spec.ts, section III) : c'est pourquoi ces cinq noms sont
// posés ici plutôt que dans gateway/activities/sandbox, qui portent chacun
// leurs propres additifs (fencing côté dispatch/checkpoint/volume).
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

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

/**
 * Ouvre l'autorité de bail (section III.1). SQUELETTE : aucune ressource
 * n'est provisionnée, l'export lève `NotImplemented`.
 */
export async function openLeaseAuthority(opts?: OpenLeaseAuthorityOptions): Promise<LeaseHandle> {
  void opts
  throw new NotImplemented('workflows.openLeaseAuthority')
}

/**
 * Émet un jeton de fencing strictement croissant pour `resourceId` (section
 * III.2, cahier L375). SQUELETTE : lève `NotImplemented`.
 */
export async function acquireLease(
  leaseHandle: LeaseHandle,
  params: AcquireLeaseParams,
): Promise<AcquireLeaseResult> {
  void leaseHandle
  void params
  throw new NotImplemented('workflows.acquireLease')
}

/**
 * Renouvelle ou refuse un bail selon le jeton courant de `resourceId` (section
 * III.3, cahier L375/A6). SQUELETTE : lève `NotImplemented` — ce qui N'EST PAS
 * encore le contrat final (le rôle ne doit jamais lever une fois écrit), mais
 * fait échouer les cas pour la raison attendue à cet étage (STUB_NOT_IMPLEMENTED).
 */
export async function heartbeatLease(
  leaseHandle: LeaseHandle,
  params: HeartbeatLeaseParams,
): Promise<HeartbeatLeaseResult> {
  void leaseHandle
  void params
  throw new NotImplemented('workflows.heartbeatLease')
}

/**
 * Révoque explicitement tout jeton pour `resourceId` (section III.4, cahier
 * L371 : « réconciliation après annulation »). SQUELETTE : lève
 * `NotImplemented`.
 */
export async function revokeLease(
  leaseHandle: LeaseHandle,
  params: RevokeLeaseParams,
): Promise<RevokeLeaseResult> {
  void leaseHandle
  void params
  throw new NotImplemented('workflows.revokeLease')
}

/**
 * Ferme l'autorité de bail (section III.5, optionnel comme `closeStore`).
 * SQUELETTE : lève `NotImplemented`.
 */
export async function closeLeaseAuthority(leaseHandle: LeaseHandle): Promise<void> {
  void leaseHandle
  throw new NotImplemented('workflows.closeLeaseAuthority')
}
