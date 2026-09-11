// ─────────────────────────────────────────────────────────────────────────────
// Erreurs de contrat.
//
// §A : « Les erreurs techniques et résultats métier sont des champs distincts. »
// Ce module ne couvre QUE le premier niveau : le refus d'une valeur qui ne
// respecte pas les règles de forme du §E. Un refus métier (une réservation
// rejetée, un budget dépassé) n'est PAS une erreur de contrat et n'a rien à
// faire ici : il appartient aux paquets de domaine, sous la forme d'un résultat.
//
// La liste ci-dessous n'invente rien : chaque membre transcrit une règle que le
// §E énonce littéralement.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §E : « Les JSON de domaine sont stricts : propriétés inconnues rejetées,
 * enums explicites, timestamps UTC ISO 8601, nombres non finis interdits. Les
 * montants sont des chaînes d'entiers non négatifs en micro-USD. »
 */
export const CONTRACT_ERROR_KINDS = [
  /** Une propriété non déclarée par le contrat est présente. */
  'UNKNOWN_PROPERTY',
  /** Une propriété obligatoire du contrat est absente. */
  'MISSING_PROPERTY',
  /** La valeur n'appartient pas à l'énumération explicite du contrat. */
  'ENUM_VALUE_UNKNOWN',
  /** `NaN`, `Infinity` ou `-Infinity` : interdits sans exception. */
  'NON_FINITE_NUMBER',
  /** Un timestamp qui n'est pas de l'ISO 8601 UTC. */
  'TIMESTAMP_NOT_UTC_ISO8601',
  /** Un montant qui n'est pas une chaîne d'entier non négatif. */
  'AMOUNT_NOT_NON_NEGATIVE_INTEGER_STRING',
  /** Un ajustement signé qui n'est pas une chaîne d'entier relatif. */
  'AMOUNT_NOT_SIGNED_INTEGER_STRING',
  /** Le type JavaScript reçu n'est pas celui que le contrat déclare. */
  'TYPE_MISMATCH',
] as const

export type ContractErrorKind = (typeof CONTRACT_ERROR_KINDS)[number]

/**
 * Refus de contrat. Porte son `kind` et le chemin de la valeur fautive, parce
 * qu'un message libre ne se teste pas : §G interdit qu'une preuve repose sur
 * du texte plutôt que sur une observation.
 */
export class ContractViolation extends Error {
  readonly kind: ContractErrorKind
  readonly path: string

  constructor(kind: ContractErrorKind, path: string, detail?: string) {
    super(detail === undefined ? `${kind} @ ${path}` : `${kind} @ ${path} : ${detail}`)
    this.name = 'ContractViolation'
    this.kind = kind
    this.path = path
  }
}

export function isContractViolation(e: unknown): e is ContractViolation {
  return e instanceof ContractViolation
}
