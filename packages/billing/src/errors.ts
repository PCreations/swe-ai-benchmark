// ─────────────────────────────────────────────────────────────────────────────
// Les refus de @bench/billing.
//
// Même séparation que packages/storage/src/errors.ts (§A : « les erreurs
// techniques et les résultats métier sont des champs distincts ») : un refus
// porte un CODE qui nomme sa cause, jamais le vocabulaire d'un plantage
// (TypeError, ECONNREFUSED…) que T16.spec.ts distingue explicitement d'un
// refus authentique.
// ─────────────────────────────────────────────────────────────────────────────

export const BILLING_REFUSAL_CODES = [
  /** L297 : aucune borne fiable n'est fournie en mode plafond strict. */
  'UNBOUNDED_COST',
  /** L105/L297 : la réservation dépasserait le disponible du budget. */
  'INSUFFICIENT_AVAILABLE',
  /** Le `budget_id` désigné n'a jamais été ouvert par `openBudget`. */
  'BUDGET_NOT_FOUND',
  /** Le `reservation_id` désigné n'existe pas. */
  'RESERVATION_NOT_FOUND',
  /** La réservation existe mais n'est plus `RESERVED` (déjà réglée/libérée). */
  'RESERVATION_NOT_ACTIVE',
  /** L'écriture d'origine d'un ajustement n'existe pas. */
  'ORIGINAL_ENTRY_NOT_FOUND',
  /** Un montant fourni n'est pas un entier valide (§E, L80). */
  'INVALID_AMOUNT',
  /** Le serveur ou la connexion a manqué : ni acceptation, ni refus métier. */
  'STORAGE_UNAVAILABLE',
] as const

export type BillingRefusalCode = (typeof BILLING_REFUSAL_CODES)[number]

export class BillingRefusal extends Error {
  readonly code: BillingRefusalCode
  readonly detail: string

  constructor(code: BillingRefusalCode, detail: string) {
    super(`${code} : ${detail}`)
    this.name = 'BillingRefusal'
    this.code = code
    this.detail = detail
  }
}

export function isBillingRefusal(e: unknown): e is BillingRefusal {
  return e instanceof BillingRefusal
}
