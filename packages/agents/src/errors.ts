// ─────────────────────────────────────────────────────────────────────────────
// Les refus de @bench/agents.
//
// Même séparation que `packages/gateway/src/errors.ts` et
// `packages/billing/src/errors.ts` (§A : « les erreurs techniques et les
// résultats métier sont des champs distincts ») : un refus porte un CODE qui
// nomme sa cause, jamais le vocabulaire d'un plantage (TypeError,
// ECONNREFUSED…) qu'`acceptance/T18.spec.ts` distingue explicitement d'un
// refus authentique (`MARQUEURS_DE_PLANTAGE`).
//
// `INVALID_MODEL_RESPONSE` EST FIXÉ PAR LA SUITE, PAS PAR LE CAHIER (voir
// acceptance/T18.spec.ts §II) : le cahier dit « réponses invalides donnent
// erreur typée » (L313.A5) sans nommer son code, exactement comme
// `IDEMPOTENCY_KEY_CONFLICT` a été fixé avant `packages/gateway`.
// ─────────────────────────────────────────────────────────────────────────────

export const AGENTS_REFUSAL_CODES = [
  /** T18.A5 — la réponse modèle archivée consommée par MODEL_CALL est invalide (texte vide/absent). */
  'INVALID_MODEL_RESPONSE',
  /** Le `session_id` désigné n'a jamais été ouvert par `start`/`resume`. */
  'SESSION_NOT_FOUND',
  /** Le premier argument n'est pas un repository ouvert par `openStore` (@bench/storage). */
  'STORAGE_UNAVAILABLE',
  /** Un paramètre requis manque ou a un type incorrect (§E). */
  'INVALID_PARAMETER',
] as const

export type AgentsRefusalCode = (typeof AGENTS_REFUSAL_CODES)[number]

export class AgentsRefusal extends Error {
  readonly code: AgentsRefusalCode
  readonly detail: string

  constructor(code: AgentsRefusalCode, detail: string) {
    super(`${code} : ${detail}`)
    this.name = 'AgentsRefusal'
    this.code = code
    this.detail = detail
  }
}

export function isAgentsRefusal(e: unknown): e is AgentsRefusal {
  return e instanceof AgentsRefusal
}
