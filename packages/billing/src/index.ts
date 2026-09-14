// ─────────────────────────────────────────────────────────────────────────────
// @bench/billing — budget et écritures comptables atomiques (cahier L291-L298,
// tâche T16).
//
// SQUELETTE. Étage ROUGE : aucune règle métier n'est écrite ici — ni calcul
// tarifaire, ni transaction de réservation, ni idempotence de reçu, ni
// écriture d'ajustement, ni invariant `spent + reserved + available = limit`.
// Les neuf rôles ci-dessous LÈVENT `NotImplemented` (`@bench/contracts`), dont
// le message porte le préfixe `NOT_IMPLEMENTED` que `verification/runner/red.mjs`
// sait lire.
//
// CE QUE CE PAQUET AJOUTE, ET SUR QUOI IL S'APPUIE.
// `packages/storage` (T12) publie déjà `applyMigrations`, `openStore` et
// `closeStore` sur le schéma central qui porte, entre autres,
// `budget_reservations` et `ledger_entries` (cahier L257-L259) : T16 REMPLIT
// ce schéma de règles, il ne le redéclare pas. Les rôles ci-dessous sont donc
// les NEUF que `packages/billing` ajoute — fixés par la section III de l'en-tête
// de `acceptance/T16.spec.ts`, puisque le cahier ne les dicte pas — sans alias :
// la liste d'alias que la suite tolère est une tolérance de NOMMAGE côté
// appelant, jamais une invitation à en inventer un ici.
//
//   computeModelCallCost({ tariff, usage })                    calcul pur (L293)
//   openBudget(handle, { budget_id, limit })                   enveloppe (L297)
//   reserveBudget(handle, { budget_id, amount, max_cost?, mode? }) réservation
//   settleReservation(handle, { reservation_id, amount })      règlement
//   getBudgetState(handle, { budget_id })                      lecture d'état
//   importReceipt(handle, { budget_id, receipt_id, amount })   dépense idempotente
//   recordUnknownCost(handle, { budget_id, ref })               coût non connu (A5)
//   addAdjustment(handle, { original_entry_id, delta_amount, reason }) correction
//   listLedgerEntries(handle, { budget_id })                    relecture
//
// `computeModelCallCost` est PUR — pas de `handle`, pas de Promise : c'est le
// « calcul tarifaire » de L293, isolé de l'écriture comptable. Les huit autres
// portent un `handle` rendu par `openStore` et rendent une `Promise`.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Grille tarifaire d'un modèle (F-MONEY, cahier L103). */
export interface Tariff {
  readonly input_uncached_per_token: number
  readonly input_cached_per_token: number
  readonly output_per_token: number
}

/** Consommation d'un appel modèle (F-MONEY, cahier L103). */
export interface ModelCallUsage {
  readonly input_uncached_tokens: number
  readonly input_cached_tokens: number
  readonly output_tokens: number
}

export interface ComputeModelCallCostRequest {
  readonly tariff: Tariff
  readonly usage: ModelCallUsage
}

/**
 * Calcule le coût d'un appel modèle à partir d'une grille tarifaire (L293).
 *
 * PUR : ne touche pas au stockage, ne prend pas de `handle`. Le montant rendu
 * est une chaîne d'entiers non négatifs en micro-USD (L80) ou un entier non
 * négatif — seule la VALEUR est décisive pour T16.A1.
 */
export function computeModelCallCost(_request: ComputeModelCallCostRequest): string | number {
  throw new NotImplemented('billing.computeModelCallCost')
}

export interface OpenBudgetRequest {
  readonly budget_id: string
  readonly limit: string | number
}

/** Crée une enveloppe budgétaire de plafond `limit` (L297). */
export async function openBudget(_handle: unknown, _request: OpenBudgetRequest): Promise<void> {
  throw new NotImplemented('billing.openBudget')
}

export interface ReserveBudgetRequest {
  readonly budget_id: string
  readonly amount: string | number
  readonly max_cost?: string | number | null
  readonly mode?: string
}

export interface ReserveBudgetResult {
  readonly accepted: boolean
  readonly reservation_id?: string
  readonly code?: string
}

/**
 * Réserve un montant sur un budget (L297).
 *
 * `max_cost` absent ou `null` signifie « coût maximal non borné » (T16.A7) ;
 * `mode: 'STRICT_CAP'` active le plafond strict de L297. Un refus peut être
 * RENDU (`accepted:false`, `code`) ou LEVÉ (erreur `.code`) — ce squelette ne
 * décide d'aucune des deux formes, il lève `NotImplemented`.
 */
export async function reserveBudget(
  _handle: unknown,
  _request: ReserveBudgetRequest,
): Promise<ReserveBudgetResult> {
  throw new NotImplemented('billing.reserveBudget')
}

export interface SettleReservationRequest {
  readonly reservation_id: string
  readonly amount: string | number
}

/** Règle une réservation acceptée au montant réellement facturé. */
export async function settleReservation(
  _handle: unknown,
  _request: SettleReservationRequest,
): Promise<void> {
  throw new NotImplemented('billing.settleReservation')
}

export interface GetBudgetStateRequest {
  readonly budget_id: string
}

export interface BudgetState {
  readonly limit: string | number
  readonly spent: string | number
  readonly reserved: string | number
  readonly available: string | number
  readonly unknown_cost_count?: number
  readonly has_unknown_costs?: boolean
}

/**
 * Lit l'état d'un budget (L297) : l'invariant
 * `spent + reserved + available = limit` porte sur ces quatre champs.
 */
export async function getBudgetState(
  _handle: unknown,
  _request: GetBudgetStateRequest,
): Promise<BudgetState> {
  throw new NotImplemented('billing.getBudgetState')
}

export interface ImportReceiptRequest {
  readonly budget_id: string
  readonly receipt_id: string
  readonly amount: string | number
}

export interface ImportReceiptResult {
  readonly expense_id: string
}

/**
 * Importe un reçu comme dépense, IDEMPOTENT par `receipt_id` (T16.A3, T16.A4) :
 * importer deux fois la même clé ne crée pas une seconde dépense ; deux clés
 * différentes en créent deux, même à montant égal (L80).
 */
export async function importReceipt(
  _handle: unknown,
  _request: ImportReceiptRequest,
): Promise<ImportReceiptResult> {
  throw new NotImplemented('billing.importReceipt')
}

export interface RecordUnknownCostRequest {
  readonly budget_id: string
  readonly ref: string
}

export interface RecordUnknownCostResult {
  readonly entry_id: string
}

/**
 * Enregistre une ligne de coût dont le montant n'est PAS CONNU au moment de
 * l'écriture (T16.A5) : le montant qu'elle porte n'est jamais silencieusement
 * zéro.
 */
export async function recordUnknownCost(
  _handle: unknown,
  _request: RecordUnknownCostRequest,
): Promise<RecordUnknownCostResult> {
  throw new NotImplemented('billing.recordUnknownCost')
}

export interface AddAdjustmentRequest {
  readonly budget_id: string
  readonly original_entry_id: string
  readonly delta_amount: string | number
  readonly reason: string
}

export interface AddAdjustmentResult {
  readonly adjustment_id: string
  readonly original_entry_id?: string
  readonly adjusts?: string
}

/**
 * Ajoute une correction (T16.A6) : une écriture SIGNÉE, séparée de l'écriture
 * d'origine (L80), qui reste elle-même inchangée.
 */
export async function addAdjustment(
  _handle: unknown,
  _request: AddAdjustmentRequest,
): Promise<AddAdjustmentResult> {
  throw new NotImplemented('billing.addAdjustment')
}

export interface ListLedgerEntriesRequest {
  readonly budget_id: string
}

/** Toutes les écritures d'un budget (dépenses, coûts inconnus, ajustements). */
export async function listLedgerEntries(
  _handle: unknown,
  _request: ListLedgerEntriesRequest,
): Promise<readonly unknown[]> {
  throw new NotImplemented('billing.listLedgerEntries')
}
