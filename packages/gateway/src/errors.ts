// ─────────────────────────────────────────────────────────────────────────────
// Les refus de @bench/gateway.
//
// Même séparation que `packages/billing/src/errors.ts` et
// `packages/storage/src/errors.ts` (§A : « les erreurs techniques et les
// résultats métier sont des champs distincts ») : un refus porte un CODE qui
// nomme sa cause, jamais le vocabulaire d'un plantage (TypeError, ECONNREFUSED…)
// que `acceptance/T17.spec.ts` distingue explicitement d'un refus authentique
// (`MARQUEURS_DE_PLANTAGE`).
//
// `IDEMPOTENCY_KEY_CONFLICT` EST FIXÉ PAR LA SUITE, PAS PAR LE CAHIER (voir
// acceptance/T17.spec.ts §II) : le cahier nomme la règle (« même clé avec
// autre requête est rejetée », L303) sans nommer son code de refus, exactement
// comme T16 a fixé `UNBOUNDED_COST` avant que packages/billing n'existe.
// ─────────────────────────────────────────────────────────────────────────────

export const GATEWAY_REFUSAL_CODES = [
  /** T17.A7 — la même `idempotency_key` est réutilisée avec une requête différente. */
  'IDEMPOTENCY_KEY_CONFLICT',
  /** `getModelCall`/`reconcileModelCall` désignent un `model_call_id` jamais dispatché. */
  'MODEL_CALL_NOT_FOUND',
  /** Le premier argument n'est pas un repository ouvert par `openStore` (@bench/storage). */
  'STORAGE_UNAVAILABLE',
] as const

export type GatewayRefusalCode = (typeof GATEWAY_REFUSAL_CODES)[number]

export class GatewayRefusal extends Error {
  readonly code: GatewayRefusalCode
  readonly detail: string

  constructor(code: GatewayRefusalCode, detail: string) {
    super(`${code} : ${detail}`)
    this.name = 'GatewayRefusal'
    this.code = code
    this.detail = detail
  }
}

export function isGatewayRefusal(e: unknown): e is GatewayRefusal {
  return e instanceof GatewayRefusal
}
