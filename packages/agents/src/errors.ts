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
//
// LES CINQ CODES T28 SONT FIXÉS PAR `acceptance/T28.spec.ts` (section II de
// son en-tête), PAS PAR LE CAHIER : L401 nomme les trois classes de refus
// d'A5 et les deux d'A3 en toutes lettres, mais jamais leur code machine.
// `UNKNOWN_TOOL` / `INVALID_TOOL_ARGUMENTS` (A3), `RATE_LIMITED` /
// `AUTHENTICATION_ERROR` / `TRUNCATED_RESPONSE` (A5) reprennent donc, mot
// pour mot, les constantes que la suite compare (`codeDe(err) === '...'`).
// `PROVIDER_ERROR` et `PROVIDER_UNAVAILABLE` ne sont exercés par aucun cas
// requis ; ils couvrent les statuts HTTP et les pannes de connexion qu'A5 ne
// nomme pas, sans jamais laisser une telle réponse passer pour acceptée.
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
  /** T28.A3 — `validateAndNormalizeToolCall` : nom absent de `toolDefs`. */
  'UNKNOWN_TOOL',
  /** T28.A3 — `validateAndNormalizeToolCall` : argument requis absent ou mal typé. */
  'INVALID_TOOL_ARGUMENTS',
  /** T28.A5 — `AnthropicProvider.complete` : HTTP 429 reçu du fournisseur. */
  'RATE_LIMITED',
  /** T28.A5 — `AnthropicProvider.complete` : HTTP 401/403 reçu du fournisseur. */
  'AUTHENTICATION_ERROR',
  /** T28.A5 — `AnthropicProvider.complete` : corps de réponse tronqué au niveau transport. */
  'TRUNCATED_RESPONSE',
  /** `AnthropicProvider.complete` : statut HTTP inattendu, hors des trois classes ci-dessus. */
  'PROVIDER_ERROR',
  /** `AnthropicProvider.complete` : connexion au fournisseur impossible (réseau). */
  'PROVIDER_UNAVAILABLE',
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
