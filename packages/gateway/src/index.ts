// ─────────────────────────────────────────────────────────────────────────────
// @bench/gateway — passerelle modele et reponse perdue (cahier L299-L306,
// tache T17).
//
// CE QUE CE PAQUET AJOUTE, ET SUR QUOI IL S'APPUIE. T17 depend de T12 (schema
// central PostgreSQL, `packages/storage`) et T16 (budgets et reservations,
// `packages/billing`) — ni l'un ni l'autre n'est redeclare ici :
// `computeModelCallCost` et `settleReservation` viennent de `@bench/billing`,
// `isCentralStore` de `@bench/storage`. `packages/storage/migrations/
// 0003_gateway_model_calls.sql` REMPLIT le `model_calls` que 0001 a deja cree
// (L259) — nouveau fichier, jamais une reecriture de 0001/0002.
//
// LE JOURNAL DURABLE, ET COMMENT L99 Y DEVIENT OBSERVABLE. Chaque ecriture
// durable decisive (DISPATCH_STARTED, puis SETTLED) est un script `psql`
// SEPARE (`./psql.ts`, meme copie minimale que `packages/billing/src/psql.ts`
// et pour la meme raison) : c'est ce qui rend un crash simule ENTRE deux
// ecritures observable a la reprise, plutot que masque par une transaction
// unique qui engloberait tout `dispatchModelCall`.
//
//   1. AUCUNE trace pour `model_call_id`      -> dispatch complet (premier
//      envoi, ou reprise d'une panne AVANT toute ecriture durable : A5).
//   2. DISPATCH_STARTED present, pas d'etat terminal
//                                              -> `{ status: 'UNKNOWN' }`,
//      SANS recontacter le fournisseur (A2, A6) — la regle conservative de
//      L99 elle-meme, jamais deduite du compteur du fournisseur factice
//      (`provider.calls`), qui n'existe pas pour un fournisseur reel
//      (cf. verification/mutants/T17.json, T17.M7).
//   3. Etat terminal deja atteint (SETTLED)    -> meme resultat rendu, SANS
//      recontacter le fournisseur (A3).
//
// IDEMPOTENCE LOGIQUE (A7). `model_call_idempotency` associe chaque
// `idempotency_key` a l'empreinte canonique (`@bench/contracts`,
// `canonicalDigest`, L82) de la requete qui l'a d'abord utilisee. Une reprise
// avec la MEME cle et la MEME requete (meme `model_call_id`) est un rejeu
// legitime ; la MEME cle avec une requete DIFFERENTE est REJETEE, AVANT toute
// ecriture durable et avant tout contact du fournisseur — `IDEMPOTENCY_KEY_
// CONFLICT`, code FIXE par `acceptance/T17.spec.ts` (le cahier ne le nomme
// pas, cf. sa section II).
//
// LA RECONCILIATION (A4) N'INVENTE JAMAIS DE TEXTE. `reconcileModelCall`
// ecrit `cost_micro_usd` et `usage`, jamais `response_text` : c'est cette
// absence, et elle seule, qui rend « sans inventer de reponse textuelle »
// verifiable par une simple lecture (`getModelCall`) apres coup.
// ─────────────────────────────────────────────────────────────────────────────

import { canonicalDigest, ContractViolation } from '@bench/contracts'
import type { CanonicalValue } from '@bench/contracts'
import { computeModelCallCost, settleReservation } from '@bench/billing'
import type { ModelCallUsage, Tariff } from '@bench/billing'
import { isCentralStore } from '@bench/storage'
import { GatewayRefusal } from './errors.js'
import { runScript } from './psql.js'
import type { ScriptResult } from './psql.js'

export { GATEWAY_REFUSAL_CODES, GatewayRefusal, isGatewayRefusal } from './errors.js'
export type { GatewayRefusalCode } from './errors.js'

/** Reponse scriptee d'un appel de fournisseur factice (cf. III.1). */
export interface FakeProviderResponse {
  readonly text: string
  readonly usage?: {
    readonly input_uncached_tokens: number
    readonly input_cached_tokens: number
    readonly output_tokens: number
  }
}

/** Cible de creation d'un fournisseur factice (L15, L301). */
export interface CreateFakeProviderRequest {
  readonly responses: ReadonlyArray<string | FakeProviderResponse>
  readonly onRequest?: (request: unknown, index: number) => void
}

/** Fournisseur factice rendu : `complete()` scripte, `calls` un compteur vivant. */
export interface FakeProvider {
  complete(request: unknown): Promise<unknown>
  readonly calls: number
}

/** Points d'injection nommes de `dispatchModelCall` (section III.2). */
export interface DispatchModelCallHooks {
  readonly beforeDispatchStarted?: () => void
  readonly afterDispatchStarted?: () => void
  readonly afterProviderResponse?: () => void
}

/** Parametres d'un dispatch, premier envoi ou reprise (section III.2). */
export interface DispatchModelCallParams {
  readonly model_call_id: string
  readonly idempotency_key: string
  readonly budget_id: string
  readonly reservation_id: string
  readonly provider: FakeProvider
  readonly request: unknown
  readonly tariff: unknown
}

/** Ce que rend un dispatch accepte, premier envoi ou reprise. */
export interface DispatchModelCallResult {
  readonly model_call_id: string
  readonly status: string
  readonly cost?: string
  readonly usage?: unknown
  readonly response?: unknown
}

/** Identite d'un appel modele, pour lecture directe (section III.3). */
export interface GetModelCallRequest {
  readonly model_call_id: string
}

/** L'enregistrement du journal durable d'appel, tel que `getModelCall` le rend. */
export interface ModelCallRecord {
  readonly model_call_id: string
  readonly status: string
  readonly idempotency_key?: string
  readonly budget_id?: string
  readonly reservation_id?: string
  readonly cost?: string
  readonly usage?: unknown
  readonly response: unknown
}

/** Un recu de facturation arrive hors bande pour un appel UNKNOWN (section III.4). */
export interface ReconcileModelCallRequest {
  readonly model_call_id: string
  readonly tariff: unknown
  readonly receipt: {
    readonly usage: unknown
  }
}

/** Ce que rend une reconciliation acceptee. */
export interface ReconcileModelCallResult {
  readonly model_call_id: string
  readonly status: string
  readonly cost: string
}

/* ─────────────────────────────────────────────────────────── validation */

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

function requireFunction(v: unknown, path: string): (request: unknown) => Promise<unknown> {
  if (typeof v !== 'function') {
    throw new ContractViolation('TYPE_MISMATCH', path, 'fonction attendue')
  }
  return v as (request: unknown) => Promise<unknown>
}

function dsnOf(handle: unknown): string {
  if (!isCentralStore(handle)) {
    throw new GatewayRefusal(
      'STORAGE_UNAVAILABLE',
      'le premier argument doit être un repository rendu par openStore (@bench/storage)',
    )
  }
  if (handle.closed) {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', 'repository déjà fermé')
  }
  return handle.dsn
}

function outcomeOf(r: ScriptResult, role: string): string {
  if (!r.ok || r.payload === null) {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', `${role} : ${r.error || 'résultat illisible'}`)
  }
  const outcome = r.payload['outcome']
  if (typeof outcome !== 'string') {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', `${role} : issue sans 'outcome' (${JSON.stringify(r.payload)})`)
  }
  return outcome
}

function detailOf(r: ScriptResult): string {
  const d = r.payload?.['detail']
  return typeof d === 'string' ? d : ''
}

/**
 * Empreinte canonique d'une requete (L82). Le repli local ne sert que pour une
 * valeur qui ne respecterait pas les contraintes strictes de `canonicalJson`
 * (nombre non fini, `undefined` imbriqué) — aucun cas de T17 ne l'exerce, mais
 * une empreinte doit rester calculable plutot que faire echouer tout le
 * dispatch sur une contrainte de forme qui n'est pas la sienne.
 */
function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const keys = Object.keys(o).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
  }
  return JSON.stringify(String(v))
}

function digestOfRequest(request: unknown): string {
  try {
    return canonicalDigest(request as CanonicalValue)
  } catch {
    return canonicalDigest(stableStringify(request))
  }
}

/* ───────────────────────────────────────────────────────────── T17.1 */

/**
 * Cree un fournisseur factice scripte, sans reseau (L15, L301 « avec
 * compteurs »). `onRequest`, si fourni, est appele de facon SYNCHRONE au tout
 * debut de `complete()`, avant toute resolution (cf. III.1) — le point
 * d'observation qu'A1 utilise pour prouver que DISPATCH_STARTED precede la
 * reception par le fournisseur.
 */
export function createFakeProvider(request: unknown): FakeProvider {
  const req = (request ?? {}) as CreateFakeProviderRequest
  const responses: ReadonlyArray<string | FakeProviderResponse> = Array.isArray(req.responses)
    ? req.responses
    : []
  const onRequest = req.onRequest

  const provider = {
    calls: 0,
    async complete(r: unknown): Promise<unknown> {
      const index = provider.calls
      onRequest?.(r, index)
      provider.calls += 1
      if (responses.length === 0) return { text: '' }
      const raw = responses[Math.min(index, responses.length - 1)] as string | FakeProviderResponse
      return typeof raw === 'string' ? { text: raw } : raw
    },
  }
  return provider
}

/* ───────────────────────────────────────────────────────── lectures DB */

interface IdempotencyRow {
  readonly call_id: string
  readonly request_digest: string
}

async function readIdempotency(dsn: string, idempotencyKey: string): Promise<IdempotencyRow | null> {
  const r = await runScript(dsn, { idempotency_key: idempotencyKey }, `
DO $bench$
DECLARE
  p   jsonb;
  key text;
  row record;
BEGIN
  SELECT j INTO p FROM _p;
  key := p->>'idempotency_key';

  SELECT call_id, request_digest INTO row FROM model_call_idempotency WHERE idempotency_key = key;
  IF NOT FOUND THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'NOT_FOUND'));
    RETURN;
  END IF;

  INSERT INTO _r VALUES (jsonb_build_object(
    'outcome', 'OK', 'call_id', row.call_id, 'request_digest', row.request_digest
  ));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`)
  const outcome = outcomeOf(r, 'dispatchModelCall(readIdempotency)')
  if (outcome === 'NOT_FOUND') return null
  if (outcome !== 'OK') {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', `readIdempotency : ${detailOf(r) || outcome}`)
  }
  const p = r.payload as Record<string, unknown>
  return { call_id: String(p['call_id']), request_digest: String(p['request_digest']) }
}

interface ModelCallRow {
  readonly call_state: string
  readonly idempotency_key: string | null
  readonly budget_id: string | null
  readonly reservation_id: string | null
  readonly cost: string | null
  readonly usage: unknown
  readonly response_text: string | null
}

async function readModelCallRow(dsn: string, callId: string): Promise<ModelCallRow | null> {
  const r = await runScript(dsn, { call_id: callId }, `
DO $bench$
DECLARE
  p   jsonb;
  cid text;
  row record;
BEGIN
  SELECT j INTO p FROM _p;
  cid := p->>'call_id';

  SELECT call_state, idempotency_key, budget_id, reservation_id, cost_micro_usd, usage, response_text
    INTO row
    FROM model_calls WHERE call_id = cid;
  IF NOT FOUND THEN
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'NOT_FOUND'));
    RETURN;
  END IF;

  INSERT INTO _r VALUES (jsonb_build_object(
    'outcome', 'OK',
    'call_state', row.call_state,
    'idempotency_key', row.idempotency_key,
    'budget_id', row.budget_id,
    'reservation_id', row.reservation_id,
    'cost', row.cost_micro_usd,
    'usage', row.usage,
    'response_text', row.response_text
  ));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`)
  const outcome = outcomeOf(r, 'readModelCallRow')
  if (outcome === 'NOT_FOUND') return null
  if (outcome !== 'OK') {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', `readModelCallRow : ${detailOf(r) || outcome}`)
  }
  const p = r.payload as Record<string, unknown>
  return {
    call_state: String(p['call_state']),
    idempotency_key: typeof p['idempotency_key'] === 'string' ? (p['idempotency_key'] as string) : null,
    budget_id: typeof p['budget_id'] === 'string' ? (p['budget_id'] as string) : null,
    reservation_id: typeof p['reservation_id'] === 'string' ? (p['reservation_id'] as string) : null,
    cost: typeof p['cost'] === 'string' ? (p['cost'] as string) : null,
    usage: p['usage'] ?? null,
    response_text: typeof p['response_text'] === 'string' ? (p['response_text'] as string) : null,
  }
}

/* ───────────────────────────────────────────────────────── ecritures DB */

/**
 * L'ECRITURE DECISIVE DE L99 : DISPATCH_STARTED, committee dans SON PROPRE
 * script — donc dans SA PROPRE transaction implicite — avant tout appel au
 * fournisseur. Un crash simule apres cet appel (hooks `afterDispatchStarted`,
 * `afterProviderResponse`) trouve cette ligne deja persistee.
 */
async function insertDispatchStarted(
  dsn: string,
  args: {
    readonly callId: string
    readonly idempotencyKey: string
    readonly budgetId: string
    readonly reservationId: string
    readonly requestDigest: string
  },
): Promise<void> {
  const r = await runScript(
    dsn,
    {
      call_id: args.callId,
      idempotency_key: args.idempotencyKey,
      budget_id: args.budgetId,
      reservation_id: args.reservationId,
      request_digest: args.requestDigest,
    },
    `
DO $bench$
DECLARE
  p jsonb;
BEGIN
  SELECT j INTO p FROM _p;

  INSERT INTO model_calls
      (call_id, idempotency_key, budget_id, reservation_id, call_state, request_digest, dispatch_started_at)
    VALUES (p->>'call_id', p->>'idempotency_key', p->>'budget_id', p->>'reservation_id',
            'DISPATCH_STARTED', p->>'request_digest', now());

  INSERT INTO model_call_idempotency (idempotency_key, call_id, request_digest)
    VALUES (p->>'idempotency_key', p->>'call_id', p->>'request_digest')
    ON CONFLICT (idempotency_key)
    DO UPDATE SET call_id = EXCLUDED.call_id, request_digest = EXCLUDED.request_digest;

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'dispatchModelCall(DISPATCH_STARTED)')
  if (outcome !== 'OK') {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', `écriture DISPATCH_STARTED : ${detailOf(r) || outcome}`)
  }
}

/** L'ECRITURE TERMINALE : SETTLED. `responseText` reste `null` depuis la
 * reconciliation (A4) — jamais fabriqué. */
async function markSettled(
  dsn: string,
  args: {
    readonly callId: string
    readonly cost: string
    readonly usage: unknown
    readonly responseText: string | null
  },
): Promise<void> {
  const r = await runScript(
    dsn,
    { call_id: args.callId, cost: args.cost, usage: args.usage, response_text: args.responseText },
    `
DO $bench$
DECLARE
  p jsonb;
BEGIN
  SELECT j INTO p FROM _p;

  UPDATE model_calls
    SET call_state = 'SETTLED',
        cost_micro_usd = p->>'cost',
        usage = p->'usage',
        response_text = p->>'response_text',
        settled_at = now()
    WHERE call_id = p->>'call_id';

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'dispatchModelCall(SETTLED)')
  if (outcome !== 'OK') {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', `écriture SETTLED : ${detailOf(r) || outcome}`)
  }
}

/* ───────────────────────────────────────────────────────────── T17.2 */

/**
 * Dispatch idempotent d'un appel modele : premier envoi ET reprise de la
 * meme operation apres panne (invariant 7, L69, L303). Voir l'en-tete du
 * fichier pour les trois branches et l'ordre des ecritures durables.
 */
export async function dispatchModelCall(
  handle: unknown,
  params: unknown,
  hooks?: unknown,
): Promise<DispatchModelCallResult> {
  const dsn = dsnOf(handle)
  const p = (params ?? {}) as Partial<DispatchModelCallParams>
  const h = (hooks ?? {}) as DispatchModelCallHooks

  const modelCallId = requireNonEmptyString(p.model_call_id, 'dispatchModelCall.model_call_id')
  const idempotencyKey = requireNonEmptyString(p.idempotency_key, 'dispatchModelCall.idempotency_key')
  const budgetId = requireNonEmptyString(p.budget_id, 'dispatchModelCall.budget_id')
  const reservationId = requireNonEmptyString(p.reservation_id, 'dispatchModelCall.reservation_id')
  const complete = requireFunction(
    (p.provider as { complete?: unknown } | undefined)?.complete,
    'dispatchModelCall.provider.complete',
  )
  const request = p.request
  const tariff = p.tariff

  const requestDigest = digestOfRequest(request)

  // IDEMPOTENCE (A7) : une cle deja vue pour un AUTRE model_call_id, avec une
  // empreinte de requete DIFFERENTE, est rejetee AVANT tout contact du
  // fournisseur et avant toute ecriture durable.
  const idem = await readIdempotency(dsn, idempotencyKey)
  if (idem !== null && idem.call_id !== modelCallId && idem.request_digest !== requestDigest) {
    throw new GatewayRefusal(
      'IDEMPOTENCY_KEY_CONFLICT',
      `idempotency_key ${idempotencyKey} déjà utilisée pour une requête différente (model_call_id ${idem.call_id})`,
    )
  }

  // LE JOURNAL DURABLE ARBITRE, PAS L'HORLOGE : la reprise se decide par ce
  // que la ligne `model_calls` montre, jamais par le compteur du fournisseur.
  const existing = await readModelCallRow(dsn, modelCallId)
  if (existing !== null) {
    if (existing.call_state === 'SETTLED') {
      return {
        model_call_id: modelCallId,
        status: 'SETTLED',
        ...(existing.cost !== null ? { cost: existing.cost } : {}),
        ...(existing.usage !== null ? { usage: existing.usage } : {}),
        ...(existing.response_text !== null ? { response: existing.response_text } : {}),
      }
    }
    // DISPATCH_STARTED present sans etat terminal (ou tout autre etat
    // intermediaire) : L99, « meme un crash immediatement apres cette
    // ecriture est traite comme potentiellement facture » — UNKNOWN, jamais
    // resolu a tort en SETTLED/FAILED/CANCELLED_BEFORE_DISPATCH, et SANS
    // recontacter le fournisseur (A2, A6).
    return { model_call_id: modelCallId, status: 'UNKNOWN' }
  }

  // AUCUNE TRACE : premier envoi, ou reprise d'une panne AVANT toute
  // ecriture durable (A5). Rien n'est encore engage.
  h.beforeDispatchStarted?.()

  await insertDispatchStarted(dsn, {
    callId: modelCallId,
    idempotencyKey,
    budgetId,
    reservationId,
    requestDigest,
  })

  h.afterDispatchStarted?.()

  const raw = await complete(request)
  const respObj = (typeof raw === 'string' ? { text: raw } : (raw ?? {})) as {
    readonly text?: unknown
    readonly usage?: unknown
  }

  h.afterProviderResponse?.()

  const usage = (respObj.usage ?? { input_uncached_tokens: 0, input_cached_tokens: 0, output_tokens: 0 }) as ModelCallUsage
  const responseText = typeof respObj.text === 'string' ? respObj.text : ''
  const cost = computeModelCallCost({ tariff: tariff as Tariff, usage })

  await settleReservation(handle, { reservation_id: reservationId, amount: cost })
  await markSettled(dsn, { callId: modelCallId, cost, usage, responseText })

  return { model_call_id: modelCallId, status: 'SETTLED', cost, usage, response: responseText }
}

/* ───────────────────────────────────────────────────────────── T17.3 */

/** Lecture directe du journal durable d'appel (L301). */
export async function getModelCall(handle: unknown, request: unknown): Promise<ModelCallRecord | null> {
  const dsn = dsnOf(handle)
  const r = (request ?? {}) as Partial<GetModelCallRequest>
  const modelCallId = requireNonEmptyString(r.model_call_id, 'getModelCall.model_call_id')

  const row = await readModelCallRow(dsn, modelCallId)
  if (row === null) return null

  return {
    model_call_id: modelCallId,
    status: row.call_state === 'DISPATCH_STARTED' ? 'UNKNOWN' : row.call_state,
    ...(row.idempotency_key !== null ? { idempotency_key: row.idempotency_key } : {}),
    ...(row.budget_id !== null ? { budget_id: row.budget_id } : {}),
    ...(row.reservation_id !== null ? { reservation_id: row.reservation_id } : {}),
    ...(row.cost !== null ? { cost: row.cost } : {}),
    ...(row.usage !== null ? { usage: row.usage } : {}),
    response: row.response_text,
  }
}

/* ───────────────────────────────────────────────────────────── T17.4 */

/**
 * Endpoint de reconciliation (L301) : ingere un recu arrive hors bande pour
 * un appel UNKNOWN et le regle, SANS JAMAIS fabriquer de contenu de reponse
 * (A4) — `response_text` reste tel quel (absent, si le dispatch original ne
 * l'a jamais sauvegarde).
 */
export async function reconcileModelCall(
  handle: unknown,
  request: unknown,
): Promise<ReconcileModelCallResult> {
  const dsn = dsnOf(handle)
  const r = (request ?? {}) as Partial<ReconcileModelCallRequest>
  const modelCallId = requireNonEmptyString(r.model_call_id, 'reconcileModelCall.model_call_id')
  const tariff = r.tariff
  const receipt = r.receipt as { usage?: unknown } | undefined
  const usage = receipt?.usage as ModelCallUsage

  const existing = await readModelCallRow(dsn, modelCallId)
  if (existing === null) {
    throw new GatewayRefusal('MODEL_CALL_NOT_FOUND', `aucun appel modèle sous ${modelCallId}`)
  }
  if (existing.call_state === 'SETTLED') {
    // Reconciliation deja appliquee : idempotent, ne re-regle pas une
    // deuxieme fois la reservation (rendrait RESERVATION_NOT_ACTIVE).
    return {
      model_call_id: modelCallId,
      status: 'SETTLED',
      cost: existing.cost ?? '0',
    }
  }
  const reservationId = existing.reservation_id
  if (reservationId === null) {
    throw new GatewayRefusal('STORAGE_UNAVAILABLE', `appel ${modelCallId} sans reservation_id associée`)
  }

  const cost = computeModelCallCost({ tariff: tariff as Tariff, usage })

  await settleReservation(handle, { reservation_id: reservationId, amount: cost })
  // response_text: null — reconcileModelCall ne fabrique JAMAIS de reponse.
  await markSettled(dsn, { callId: modelCallId, cost, usage, responseText: null })

  return { model_call_id: modelCallId, status: 'SETTLED', cost }
}
