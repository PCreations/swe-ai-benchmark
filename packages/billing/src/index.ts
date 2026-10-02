// ─────────────────────────────────────────────────────────────────────────────
// @bench/billing — budget et écritures comptables atomiques (cahier L291-L298,
// tâche T16).
//
// CE QUE CE PAQUET AJOUTE, ET SUR QUOI IL S'APPUIE.
// `packages/storage` (T12) publie déjà `applyMigrations`, `openStore` et
// `closeStore` sur le schéma central qui porte, entre autres,
// `budget_reservations` et `ledger_entries` (cahier L257-L259) : T16 REMPLIT
// ce schéma de règles (nouvelle migration `0002_billing_ledger.sql`, jamais
// une réécriture de `0001_central_schema.sql` — L259), il ne le redéclare pas.
//
// COMMENT LA CONCURRENCE DE F-BUDGET (L105) EST ARBITRÉE. Chaque rôle qui
// décide quelque chose (`reserveBudget`, `settleReservation`, `importReceipt`,
// `recordUnknownCost`, `addAdjustment`) tient dans UN script PL/pgSQL envoyé
// en une fois à `psql` (voir `./psql.ts`). PostgreSQL exécute la chaîne entière
// comme une seule transaction implicite (documenté par
// `packages/storage/src/migrations.ts`) ; un `SELECT ... FOR UPDATE` sur la
// ligne `budgets` y verrouille la ligne pour la durée du script, ce qui
// sérialise deux réservations concurrentes sur le MÊME budget sans session
// persistante ni barrière applicative — c'est PostgreSQL qui arbitre, pas une
// vérification côté client qui aurait sa fenêtre.
//
// LE CALCUL TARIFAIRE (T16.A1) PASSE PAR `@bench/contracts` (`mulMicroUsd`,
// `addMicroUsd`) : arithmétique en `bigint`, jamais en flottant (cahier
// invariant 9, L71).
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto'
import {
  ContractViolation,
  addMicroUsd,
  microUsd,
  mulMicroUsd,
  signedMicroUsd,
  toBigInt,
} from '@bench/contracts'
import type { MicroUsd } from '@bench/contracts'
import { isCentralStore } from '@bench/storage'
import { BillingRefusal } from './errors.js'
import { runScript } from './psql.js'
import type { ScriptResult } from './psql.js'

export { BILLING_REFUSAL_CODES, BillingRefusal, isBillingRefusal } from './errors.js'
export type { BillingRefusalCode } from './errors.js'

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

export interface OpenBudgetRequest {
  readonly budget_id: string
  readonly limit: string | number
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

export interface SettleReservationRequest {
  readonly reservation_id: string
  readonly amount: string | number
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

export interface ImportReceiptRequest {
  readonly budget_id: string
  readonly receipt_id: string
  readonly amount: string | number
}

export interface ImportReceiptResult {
  readonly expense_id: string
}

export interface RecordUnknownCostRequest {
  readonly budget_id: string
  readonly ref: string
}

export interface RecordUnknownCostResult {
  readonly entry_id: string
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

export interface ListLedgerEntriesRequest {
  readonly budget_id: string
}

/* ─────────────────────────────────────────────────────────── validation */

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

/** Un compte entier non négatif (nombre de tokens) — nombre ou chaîne. */
function toCount(v: unknown, path: string): bigint {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v)
  if (typeof v === 'string' && /^(?:0|[1-9][0-9]*)$/.test(v)) return BigInt(v)
  throw new ContractViolation('TYPE_MISMATCH', path, `entier non négatif attendu (reçu ${JSON.stringify(v)})`)
}

/** Un prix par token (F-MONEY) — nombre ou chaîne — vu comme un montant. */
function toPrice(v: unknown, path: string): MicroUsd {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return microUsd(String(v), path)
  if (typeof v === 'string') return microUsd(v, path)
  throw new ContractViolation('TYPE_MISMATCH', path, `montant attendu (reçu ${JSON.stringify(v)})`)
}

/** Un montant non négatif (L80) — nombre entier ou chaîne d'entiers. */
function amountText(v: unknown, path: string): string {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return microUsd(String(v), path)
  if (typeof v === 'string') return microUsd(v, path)
  throw new ContractViolation('TYPE_MISMATCH', path, `montant non négatif attendu (reçu ${JSON.stringify(v)})`)
}

/** Comme `amountText`, mais typé `MicroUsd` pour alimenter `addMicroUsd` (T27). */
function toMicroUsd(v: unknown, path: string): MicroUsd {
  return amountText(v, path) as MicroUsd
}

/** Un montant signé (L80 : écriture d'ajustement) — nombre entier ou chaîne. */
function signedAmountText(v: unknown, path: string): string {
  if (typeof v === 'number' && Number.isInteger(v)) return signedMicroUsd(String(v), path)
  if (typeof v === 'string') return signedMicroUsd(v, path)
  throw new ContractViolation('TYPE_MISMATCH', path, `montant signé attendu (reçu ${JSON.stringify(v)})`)
}

/* ───────────────────────────────────────────────────────── le handle */

function dsnOf(handle: unknown): string {
  if (!isCentralStore(handle)) {
    throw new BillingRefusal(
      'STORAGE_UNAVAILABLE',
      'le premier argument doit être un repository rendu par openStore (@bench/storage)',
    )
  }
  if (handle.closed) {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', 'repository déjà fermé')
  }
  return handle.dsn
}

function outcomeOf(r: ScriptResult, role: string): string {
  if (!r.ok || r.payload === null) {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `${role} : ${r.error || 'résultat illisible'}`)
  }
  const outcome = r.payload['outcome']
  if (typeof outcome !== 'string') {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `${role} : issue sans 'outcome' (${JSON.stringify(r.payload)})`)
  }
  return outcome
}

function detailOf(r: ScriptResult): string {
  const d = r.payload?.['detail']
  return typeof d === 'string' ? d : ''
}

/* ─────────────────────────────────────────────────────────────── T16.A1 */

/**
 * Calcule le coût d'un appel modèle à partir d'une grille tarifaire (L293).
 *
 * PUR : ne touche pas au stockage, ne prend pas de `handle`. Les trois champs
 * d'entrée sont DISJOINTS (L103) — additionnés séparément, jamais fusionnés
 * avant tarification. L'arithmétique passe par `@bench/contracts`
 * (`mulMicroUsd`/`addMicroUsd`) : `bigint`, jamais de flottant (cahier
 * invariant 9).
 */
export function computeModelCallCost(request: ComputeModelCallCostRequest): string {
  const tariff = request.tariff
  const usage = request.usage
  const uncached = mulMicroUsd(
    toPrice(tariff.input_uncached_per_token, 'computeModelCallCost.tariff.input_uncached_per_token'),
    toCount(usage.input_uncached_tokens, 'computeModelCallCost.usage.input_uncached_tokens'),
  )
  const cached = mulMicroUsd(
    toPrice(tariff.input_cached_per_token, 'computeModelCallCost.tariff.input_cached_per_token'),
    toCount(usage.input_cached_tokens, 'computeModelCallCost.usage.input_cached_tokens'),
  )
  const output = mulMicroUsd(
    toPrice(tariff.output_per_token, 'computeModelCallCost.tariff.output_per_token'),
    toCount(usage.output_tokens, 'computeModelCallCost.usage.output_tokens'),
  )
  return addMicroUsd(uncached, cached, output)
}

/* ─────────────────────────────────────────────────────────────── T16.A2 */

/** Crée une enveloppe budgétaire de plafond `limit` (L297). */
export async function openBudget(handle: unknown, request: OpenBudgetRequest): Promise<void> {
  const budgetId = requireNonEmptyString(request.budget_id, 'openBudget.budget_id')
  const limit = amountText(request.limit, 'openBudget.limit')
  const dsn = dsnOf(handle)
  const r = await runScript(dsn, { budget_id: budgetId, limit }, `
DO $bench$
DECLARE
  p jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  INSERT INTO budgets (budget_id, limit_micro_usd)
    VALUES (p->>'budget_id', p->>'limit')
    ON CONFLICT (budget_id) DO NOTHING;
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OPENED'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`)
  const outcome = outcomeOf(r, 'openBudget')
  if (outcome !== 'OPENED') {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `openBudget : ${detailOf(r) || outcome}`)
  }
}

/**
 * Réserve un montant sur un budget (L297).
 *
 * `max_cost` absent ou `null` signifie « coût maximal non borné » (T16.A7) ;
 * `mode: 'STRICT_CAP'` active le plafond strict de L297 — auquel cas
 * l'absence de borne est refusée AVANT toute écriture, avec `UNBOUNDED_COST`
 * mot pour mot. Un dépassement du disponible est un résultat métier RENDU
 * (`accepted:false`), pas une exception : c'est la décision ordinaire d'un
 * budget, pas l'absence d'une garantie que L297 exige explicitement.
 */
export async function reserveBudget(
  handle: unknown,
  request: ReserveBudgetRequest,
): Promise<ReserveBudgetResult> {
  const budgetId = requireNonEmptyString(request.budget_id, 'reserveBudget.budget_id')
  const amount = amountText(request.amount, 'reserveBudget.amount')
  const mode = request.mode ?? null
  const maxCostProvided = request.max_cost !== undefined && request.max_cost !== null
  if (mode === 'STRICT_CAP' && !maxCostProvided) {
    // cahier:L297 — « un plafond absolu n'est promis que lorsque l'adaptateur
    // possède une borne fiable ; sinon le mode strict bloque l'émission ».
    throw new BillingRefusal(
      'UNBOUNDED_COST',
      'mode STRICT_CAP exige un max_cost borné ; aucune borne fiable fournie',
    )
  }
  const maxCost = maxCostProvided ? amountText(request.max_cost, 'reserveBudget.max_cost') : null
  const dsn = dsnOf(handle)
  const reservationId = `res-${randomUUID()}`

  const r = await runScript(
    dsn,
    { budget_id: budgetId, amount, max_cost: maxCost, mode, reservation_id: reservationId },
    `
DO $bench$
DECLARE
  p           jsonb;
  bid         text;
  amt         numeric;
  lim         numeric;
  spent       numeric;
  reserved    numeric;
  available   numeric;
  rid         text;
BEGIN
  SELECT j INTO p FROM _p;
  bid := p->>'budget_id';
  amt := (p->>'amount')::numeric;
  rid := p->>'reservation_id';

  -- Verrouille la ligne budget : deux réservations concurrentes sur le MÊME
  -- budget se sérialisent ici (cahier L105, sous-cas 1).
  SELECT limit_micro_usd::numeric INTO lim FROM budgets WHERE budget_id = bid FOR UPDATE;
  IF lim IS NULL THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'BUDGET_NOT_FOUND'));
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount_micro_usd::numeric), 0) INTO spent
    FROM ledger_entries
    WHERE budget_id = bid AND entry_kind IN ('EXPENSE', 'ADJUSTMENT') AND amount_micro_usd IS NOT NULL;

  SELECT COALESCE(SUM(amount_micro_usd::numeric), 0) INTO reserved
    FROM budget_reservations
    WHERE budget_id = bid AND reservation_state = 'RESERVED';

  available := lim - spent - reserved;

  IF amt > available THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'REJECTED', 'code', 'INSUFFICIENT_AVAILABLE'));
    RETURN;
  END IF;

  INSERT INTO budget_reservations
      (reservation_id, budget_id, amount_micro_usd, max_cost_micro_usd, mode, reservation_state)
    VALUES (rid, bid, p->>'amount', p->>'max_cost', p->>'mode', 'RESERVED');

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ACCEPTED', 'reservation_id', rid));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )

  const outcome = outcomeOf(r, 'reserveBudget')
  if (outcome === 'ACCEPTED') {
    const rid = r.payload?.['reservation_id']
    return { accepted: true, reservation_id: typeof rid === 'string' ? rid : reservationId }
  }
  if (outcome === 'REJECTED') {
    const code = r.payload?.['code']
    return { accepted: false, code: typeof code === 'string' ? code : 'INSUFFICIENT_AVAILABLE' }
  }
  if (outcome === 'BUDGET_NOT_FOUND') {
    throw new BillingRefusal('BUDGET_NOT_FOUND', `aucun budget ouvert sous ${budgetId}`)
  }
  throw new BillingRefusal('STORAGE_UNAVAILABLE', `reserveBudget : ${detailOf(r) || outcome}`)
}

/** Règle une réservation acceptée au montant réellement facturé. */
export async function settleReservation(
  handle: unknown,
  request: SettleReservationRequest,
): Promise<void> {
  const reservationId = requireNonEmptyString(request.reservation_id, 'settleReservation.reservation_id')
  const amount = amountText(request.amount, 'settleReservation.amount')
  const dsn = dsnOf(handle)

  const r = await runScript(dsn, { reservation_id: reservationId, amount }, `
DO $bench$
DECLARE
  p     jsonb;
  rid   text;
  amt   text;
  bid   text;
  state text;
BEGIN
  SELECT j INTO p FROM _p;
  rid := p->>'reservation_id';
  amt := p->>'amount';

  SELECT budget_id, reservation_state INTO bid, state
    FROM budget_reservations WHERE reservation_id = rid FOR UPDATE;

  IF bid IS NULL THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'RESERVATION_NOT_FOUND'));
    RETURN;
  END IF;
  IF state <> 'RESERVED' THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'RESERVATION_NOT_ACTIVE', 'state', state));
    RETURN;
  END IF;

  UPDATE budget_reservations SET reservation_state = 'SETTLED', released_at = now()
    WHERE reservation_id = rid;

  INSERT INTO ledger_entries (budget_id, entry_kind, amount_micro_usd, cost_origin)
    VALUES (bid, 'EXPENSE', amt, 'SETTLEMENT');

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'SETTLED'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`)

  const outcome = outcomeOf(r, 'settleReservation')
  if (outcome === 'SETTLED') return
  if (outcome === 'RESERVATION_NOT_FOUND') {
    throw new BillingRefusal('RESERVATION_NOT_FOUND', `réservation ${reservationId} introuvable`)
  }
  if (outcome === 'RESERVATION_NOT_ACTIVE') {
    throw new BillingRefusal('RESERVATION_NOT_ACTIVE', `réservation ${reservationId} n'est plus active`)
  }
  throw new BillingRefusal('STORAGE_UNAVAILABLE', `settleReservation : ${detailOf(r) || outcome}`)
}

/**
 * Lit l'état d'un budget (L297) : l'invariant
 * `spent + reserved + available = limit` porte sur ces quatre champs.
 */
export async function getBudgetState(
  handle: unknown,
  request: GetBudgetStateRequest,
): Promise<BudgetState> {
  const budgetId = requireNonEmptyString(request.budget_id, 'getBudgetState.budget_id')
  const dsn = dsnOf(handle)

  const r = await runScript(dsn, { budget_id: budgetId }, `
DO $bench$
DECLARE
  p        jsonb;
  bid      text;
  lim      numeric;
  spent    numeric;
  reserved numeric;
  unknowns integer;
BEGIN
  SELECT j INTO p FROM _p;
  bid := p->>'budget_id';

  SELECT limit_micro_usd::numeric INTO lim FROM budgets WHERE budget_id = bid;
  IF lim IS NULL THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'BUDGET_NOT_FOUND'));
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount_micro_usd::numeric), 0) INTO spent
    FROM ledger_entries
    WHERE budget_id = bid AND entry_kind IN ('EXPENSE', 'ADJUSTMENT') AND amount_micro_usd IS NOT NULL;

  SELECT COALESCE(SUM(amount_micro_usd::numeric), 0) INTO reserved
    FROM budget_reservations
    WHERE budget_id = bid AND reservation_state = 'RESERVED';

  SELECT COUNT(*) INTO unknowns FROM ledger_entries WHERE budget_id = bid AND entry_kind = 'UNKNOWN_COST';

  INSERT INTO _r VALUES (jsonb_build_object(
    'outcome', 'OK',
    'limit', lim::text,
    'spent', spent::text,
    'reserved', reserved::text,
    'available', (lim - spent - reserved)::text,
    'unknown_cost_count', unknowns,
    'has_unknown_costs', unknowns > 0
  ));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`)

  const outcome = outcomeOf(r, 'getBudgetState')
  if (outcome === 'BUDGET_NOT_FOUND') {
    throw new BillingRefusal('BUDGET_NOT_FOUND', `aucun budget ouvert sous ${budgetId}`)
  }
  if (outcome !== 'OK') {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `getBudgetState : ${detailOf(r) || outcome}`)
  }
  const p = r.payload as Record<string, unknown>
  const unknownCount = p['unknown_cost_count']
  return {
    limit: String(p['limit']),
    spent: String(p['spent']),
    reserved: String(p['reserved']),
    available: String(p['available']),
    unknown_cost_count: typeof unknownCount === 'number' ? unknownCount : Number(unknownCount),
    has_unknown_costs: p['has_unknown_costs'] === true,
  }
}

/* ─────────────────────────────────────────────────────────── T16.A3/A4 */

/**
 * Importe un reçu comme dépense, IDEMPOTENT par `receipt_id` (T16.A3, T16.A4) :
 * l'unicité PARTIELLE `(budget_id, receipt_id)` (migration 0002) est ce qui
 * arbitre — pas une vérification applicative qui aurait sa fenêtre.
 */
export async function importReceipt(
  handle: unknown,
  request: ImportReceiptRequest,
): Promise<ImportReceiptResult> {
  const budgetId = requireNonEmptyString(request.budget_id, 'importReceipt.budget_id')
  const receiptId = requireNonEmptyString(request.receipt_id, 'importReceipt.receipt_id')
  const amount = amountText(request.amount, 'importReceipt.amount')
  const dsn = dsnOf(handle)

  const r = await runScript(
    dsn,
    { budget_id: budgetId, receipt_id: receiptId, amount },
    `
DO $bench$
DECLARE
  p    jsonb;
  bid  text;
  recv text;
  amt  text;
  eid  bigint;
BEGIN
  SELECT j INTO p FROM _p;
  bid := p->>'budget_id';
  recv := p->>'receipt_id';
  amt := p->>'amount';

  -- IDEMPOTENT : la même clé (budget_id, receipt_id) rend TOUJOURS le même
  -- entry_id, que ce soit la première importation ou la dixième (T16.A3).
  INSERT INTO ledger_entries (budget_id, entry_kind, amount_micro_usd, receipt_id, cost_origin)
    VALUES (bid, 'EXPENSE', amt, recv, 'RECEIPT')
    ON CONFLICT (budget_id, receipt_id) WHERE receipt_id IS NOT NULL
    DO UPDATE SET receipt_id = EXCLUDED.receipt_id
    RETURNING entry_id INTO eid;

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK', 'expense_id', eid::text));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )

  const outcome = outcomeOf(r, 'importReceipt')
  if (outcome !== 'OK') {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `importReceipt : ${detailOf(r) || outcome}`)
  }
  const eid = r.payload?.['expense_id']
  return { expense_id: typeof eid === 'string' ? eid : String(eid) }
}

/* ────────────────────────────────────────────────────────────── T16.A5 */

/**
 * Enregistre une ligne de coût dont le montant n'est PAS CONNU au moment de
 * l'écriture (T16.A5). `amount_micro_usd` reste NULL en base : une absence
 * EXPLICITE, jamais un zéro substitué — c'est ce que `listLedgerEntries`
 * relit tel quel.
 */
export async function recordUnknownCost(
  handle: unknown,
  request: RecordUnknownCostRequest,
): Promise<RecordUnknownCostResult> {
  const budgetId = requireNonEmptyString(request.budget_id, 'recordUnknownCost.budget_id')
  const ref = requireNonEmptyString(request.ref, 'recordUnknownCost.ref')
  const dsn = dsnOf(handle)

  const r = await runScript(dsn, { budget_id: budgetId, ref }, `
DO $bench$
DECLARE
  p   jsonb;
  bid text;
  rf  text;
  eid bigint;
BEGIN
  SELECT j INTO p FROM _p;
  bid := p->>'budget_id';
  rf := p->>'ref';

  INSERT INTO ledger_entries (budget_id, entry_kind, ref, cost_origin, amount_micro_usd)
    VALUES (bid, 'UNKNOWN_COST', rf, 'UNKNOWN_COST', NULL)
    RETURNING entry_id INTO eid;

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK', 'entry_id', eid::text));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`)

  const outcome = outcomeOf(r, 'recordUnknownCost')
  if (outcome !== 'OK') {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `recordUnknownCost : ${detailOf(r) || outcome}`)
  }
  const eid = r.payload?.['entry_id']
  return { entry_id: typeof eid === 'string' ? eid : String(eid) }
}

/* ────────────────────────────────────────────────────────────── T16.A6 */

/**
 * Ajoute une correction (T16.A6) : une écriture SIGNÉE, séparée de l'écriture
 * d'origine (L80), qui reste elle-même inchangée — `addAdjustment` ne touche
 * jamais la ligne `original_entry_id`, elle en insère une NOUVELLE qui la
 * nomme (`adjusts`).
 */
export async function addAdjustment(
  handle: unknown,
  request: AddAdjustmentRequest,
): Promise<AddAdjustmentResult> {
  const budgetId = requireNonEmptyString(request.budget_id, 'addAdjustment.budget_id')
  const originalEntryId = requireNonEmptyString(request.original_entry_id, 'addAdjustment.original_entry_id')
  const delta = signedAmountText(request.delta_amount, 'addAdjustment.delta_amount')
  const reason = requireNonEmptyString(request.reason, 'addAdjustment.reason')
  const dsn = dsnOf(handle)

  const r = await runScript(
    dsn,
    { budget_id: budgetId, original_entry_id: originalEntryId, delta_amount: delta, reason },
    `
DO $bench$
DECLARE
  p     jsonb;
  bid   text;
  oid   bigint;
  delta text;
  rsn   text;
  eid   bigint;
  found boolean;
BEGIN
  SELECT j INTO p FROM _p;
  bid := p->>'budget_id';
  oid := (p->>'original_entry_id')::bigint;
  delta := p->>'delta_amount';
  rsn := p->>'reason';

  SELECT EXISTS(SELECT 1 FROM ledger_entries WHERE entry_id = oid AND budget_id = bid) INTO found;
  IF NOT found THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ORIGINAL_ENTRY_NOT_FOUND'));
    RETURN;
  END IF;

  INSERT INTO ledger_entries (budget_id, entry_kind, amount_micro_usd, adjusts, reason, cost_origin)
    VALUES (bid, 'ADJUSTMENT', delta, oid, rsn, 'ADJUSTMENT')
    RETURNING entry_id INTO eid;

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK', 'adjustment_id', eid::text));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )

  const outcome = outcomeOf(r, 'addAdjustment')
  if (outcome === 'ORIGINAL_ENTRY_NOT_FOUND') {
    throw new BillingRefusal(
      'ORIGINAL_ENTRY_NOT_FOUND',
      `écriture d'origine ${originalEntryId} introuvable pour le budget ${budgetId}`,
    )
  }
  if (outcome !== 'OK') {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `addAdjustment : ${detailOf(r) || outcome}`)
  }
  const aid = r.payload?.['adjustment_id']
  const adjustmentId = typeof aid === 'string' ? aid : String(aid)
  return { adjustment_id: adjustmentId, original_entry_id: originalEntryId, adjusts: originalEntryId }
}

/** Toutes les écritures d'un budget (dépenses, coûts inconnus, ajustements). */
export async function listLedgerEntries(
  handle: unknown,
  request: ListLedgerEntriesRequest,
): Promise<readonly unknown[]> {
  const budgetId = requireNonEmptyString(request.budget_id, 'listLedgerEntries.budget_id')
  const dsn = dsnOf(handle)

  const r = await runScript(dsn, { budget_id: budgetId }, `
DO $bench$
DECLARE
  p       jsonb;
  bid     text;
  entries jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  bid := p->>'budget_id';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'entry_id', entry_id::text,
      'entry_kind', entry_kind,
      'amount', amount_micro_usd,
      'receipt_id', receipt_id,
      'ref', ref,
      'adjusts', adjusts::text,
      'original_entry_id', adjusts::text,
      'reason', reason
    ) ORDER BY entry_id), '[]'::jsonb)
    INTO entries
    FROM ledger_entries WHERE budget_id = bid;

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK', 'entries', entries));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`)

  const outcome = outcomeOf(r, 'listLedgerEntries')
  if (outcome !== 'OK') {
    throw new BillingRefusal('STORAGE_UNAVAILABLE', `listLedgerEntries : ${detailOf(r) || outcome}`)
  }
  const entries = r.payload?.['entries']
  return Array.isArray(entries) ? entries : []
}

/* ─────────────────────────────────────────────────────────────── T27 */
//
// Les trois rôles suivants sont NOUVEAUX pour @bench/billing (cahier
// L387-L394, tâche T27) : aucune ligne du cahier ne les nomme, ils sont
// fixés par acceptance/T27.spec.ts (section III-c de son en-tête), qui en
// fait le contrat public exact (noms, formes, PUR sans stockage pour les
// deux premiers).

/** `{ A, B }` — mêmes lettres que le cahier (L391 : « branches à 300 et 500 »). */
export interface LineageBranchCosts {
  readonly A: string | number
  readonly B: string | number
}

export interface ComputeLineagePhysicalCostRequest {
  readonly ancestor_cost: string | number
  readonly fork_overhead_cost: string | number
  readonly branch_costs: LineageBranchCosts
}

export interface ComputeLineagePhysicalCostResult {
  readonly total_physical_cost: string
  readonly marginal_cost_by_branch: { readonly A: string; readonly B: string }
}

/**
 * Agrège le préfixe ancestral (compté une seule fois), la dépense
 * supplémentaire partagée par la famille (comptée une seule fois) et les
 * coûts de branche en un total physique unique (T27.A3, T27.A4). PUR : ne
 * prend pas de `handle`, ne touche pas au stockage. Les QUATRE termes
 * (`ancestor_cost`, `fork_overhead_cost`, `branch_costs.A`,
 * `branch_costs.B`) sont additionnés une seule fois chacun via
 * `@bench/contracts` (`addMicroUsd`) — `bigint`, jamais de flottant (cahier
 * invariant 9, L71). `marginal_cost_by_branch` reprend `branch_costs` tel
 * quel : il EXCLUT le préfixe ancestral et la dépense partagée (L391).
 */
export function computeLineagePhysicalCost(
  request: ComputeLineagePhysicalCostRequest,
): ComputeLineagePhysicalCostResult {
  const branchCosts = request.branch_costs
  if (branchCosts === null || typeof branchCosts !== 'object') {
    throw new ContractViolation(
      'TYPE_MISMATCH',
      'computeLineagePhysicalCost.branch_costs',
      'objet plat { A, B } attendu',
    )
  }
  const ancestor = toMicroUsd(request.ancestor_cost, 'computeLineagePhysicalCost.ancestor_cost')
  const overhead = toMicroUsd(request.fork_overhead_cost, 'computeLineagePhysicalCost.fork_overhead_cost')
  const a = toMicroUsd(branchCosts.A, 'computeLineagePhysicalCost.branch_costs.A')
  const b = toMicroUsd(branchCosts.B, 'computeLineagePhysicalCost.branch_costs.B')
  // Chaque terme compte UNE SEULE fois : pas de boucle par branche qui
  // réinjecterait le préfixe ancestral ou la dépense partagée (T27.A3/A4).
  const total = addMicroUsd(ancestor, overhead, a, b)
  return {
    total_physical_cost: total,
    marginal_cost_by_branch: { A: a, B: b },
  }
}

export interface PlanMaintenanceReserveRequest {
  readonly budget_limit: string | number
  /** Fraction (0.15 pour 15 %, cahier L391). */
  readonly reserve_rate: number
}

export interface PlanMaintenanceReserveResult {
  /** ÉCHO, INCHANGÉ (L391 : « sans porter le budget à 1150 »). */
  readonly budget_limit: string
  readonly reserved_for_maintenance: string
}

/**
 * Décompose un `reserve_rate` décimal (0.15 pour 15 %) en fraction EXACTE
 * `num/den` à partir de sa représentation décimale (`"0.15"` -> 15/100) :
 * aucune multiplication flottante n'entre dans le calcul de la réserve
 * (cahier invariant 9, L71) — seule une DIVISION ENTIÈRE finale (troncature,
 * jamais un arrondi qui dérape vers 151 comme L391 l'interdit).
 */
function reserveRateFraction(rate: unknown, path: string): { num: bigint; den: bigint } {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, `fraction non négative attendue (reçu ${JSON.stringify(rate)})`)
  }
  const m = /^([0-9]+)(?:\.([0-9]+))?$/.exec(rate.toString())
  if (m === null) {
    throw new ContractViolation('TYPE_MISMATCH', path, `fraction décimale attendue (reçu ${rate.toString()})`)
  }
  const intPart = m[1] as string
  const fracPart = m[2] ?? ''
  const den = 10n ** BigInt(fracPart.length)
  const num = BigInt(`${intPart}${fracPart}`)
  return { num, den }
}

/**
 * Identifie la part d'un budget réservée à la maintenance, SANS l'ajouter au
 * `budget_limit` rendu (T27.A5, cahier L391). PUR, sans stockage. La réserve
 * est `floor(budget_limit * reserve_rate)` en arithmétique ENTIÈRE exacte
 * (`bigint`), jamais une multiplication flottante arrondie.
 */
export function planMaintenanceReserve(
  request: PlanMaintenanceReserveRequest,
): PlanMaintenanceReserveResult {
  const limit = toMicroUsd(request.budget_limit, 'planMaintenanceReserve.budget_limit')
  const { num, den } = reserveRateFraction(request.reserve_rate, 'planMaintenanceReserve.reserve_rate')
  const reserved = (toBigInt(limit) * num) / den
  return {
    budget_limit: limit, // ÉCHO, INCHANGÉ — jamais gonflé par la réserve (L391)
    reserved_for_maintenance: reserved.toString(),
  }
}

/** Porte au moins `phase` — une des valeurs d'état de L97. */
export interface PeriodStateForEligibility {
  readonly phase: string
  readonly [key: string]: unknown
}

export interface CheckMaintenanceEligibilityRequest {
  readonly period_state: PeriodStateForEligibility
}

export interface MaintenanceEligibilitySignal {
  readonly code: string
  readonly reason?: string
}

export interface CheckMaintenanceEligibilityResult {
  readonly eligible: boolean
  readonly signal?: MaintenanceEligibilitySignal
}

/**
 * Les trois états d'arrêt de calcul de L97 : ils « n'effacent pas la période
 * de l'analyse », mais ils SONT, mot pour mot, les phases inéligibles au
 * contrôle de maintenance (c'est le sens exact que l'en-tête de
 * acceptance/T27.spec.ts donne à L391/A6).
 */
const MAINTENANCE_INELIGIBLE_PHASES: ReadonlySet<string> = new Set([
  'BUDGET_EXHAUSTED',
  'RUNNER_BLOCKED',
  'CANCELLED',
])

/**
 * Décide si un `period_state` est éligible au contrôle de maintenance
 * (T27.A6). Un état inéligible (ex. `BUDGET_EXHAUSTED`, cahier L97) doit être
 * SIGNALÉ — `eligible:false` et un code nommant la cause — jamais un
 * plantage ; un état éligible (ex. `DEVELOPING`) ne doit, symétriquement, pas
 * être signalé à tort. `period_state` n'est ni muté ni effacé par cet appel
 * (L391 : « pas effacé ») : ce rôle ne fait que LIRE `phase`, jamais écrire
 * sur l'objet reçu.
 */
export function checkMaintenanceEligibility(
  request: CheckMaintenanceEligibilityRequest,
): CheckMaintenanceEligibilityResult {
  const periodState = request.period_state
  if (periodState === null || typeof periodState !== 'object') {
    throw new ContractViolation(
      'TYPE_MISMATCH',
      'checkMaintenanceEligibility.period_state',
      'objet plat { phase, ... } attendu',
    )
  }
  const phase = periodState.phase
  if (typeof phase !== 'string' || phase.length === 0) {
    throw new ContractViolation(
      'TYPE_MISMATCH',
      'checkMaintenanceEligibility.period_state.phase',
      `chaîne non vide attendue (reçu ${JSON.stringify(phase)})`,
    )
  }
  if (MAINTENANCE_INELIGIBLE_PHASES.has(phase)) {
    return {
      eligible: false,
      signal: {
        code: 'MAINTENANCE_INELIGIBLE_PHASE',
        reason: `phase ${phase} : état d'arrêt de calcul (cahier L97), inéligible au contrôle de maintenance`,
      },
    }
  }
  return { eligible: true }
}
