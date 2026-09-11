// ─────────────────────────────────────────────────────────────────────────────
// Unités monétaires — micro-USD.
//
// §E : « Les montants sont des chaînes d'entiers non négatifs en micro-USD ;
// `1000000` vaut 1 USD. » §D-9 : « Les dépenses utilisent des entiers exacts,
// jamais une addition de flottants monétaires. »
//
// Ces deux phrases se tiennent ensemble : le type de transport est une CHAÎNE
// (aucun arrondi à la sérialisation, aucune limite à 2^53), l'arithmétique se
// fait en `bigint`, et `number` n'apparaît nulle part dans ce fichier pour
// représenter de l'argent. C'est la raison d'être du type nominal ci-dessous :
// un `string` quelconque ne peut pas se faire passer pour un montant sans être
// passé par `microUsd()`, donc sans avoir été validé.
// ─────────────────────────────────────────────────────────────────────────────
import { ContractViolation } from './errors.js'

declare const MICRO_USD: unique symbol
declare const SIGNED_MICRO_USD: unique symbol

/** Montant non négatif, en micro-USD, sous forme de chaîne d'entier décimal. */
export type MicroUsd = string & { readonly [MICRO_USD]: true }

/**
 * Écriture d'ajustement. §E : « Les ajustements sont des écritures séparées
 * signées, pas l'édition d'une facture déjà inscrite. » Un ajustement peut donc
 * être négatif ; une dépense, jamais.
 */
export type SignedMicroUsd = string & { readonly [SIGNED_MICRO_USD]: true }

/** 1 USD = 1 000 000 micro-USD. Constante du §E, pas un choix. */
export const MICRO_USD_PER_USD = 1_000_000n

const NON_NEGATIVE = /^(?:0|[1-9][0-9]*)$/
const SIGNED = /^-?(?:0|[1-9][0-9]*)$/

export function isMicroUsd(value: unknown): value is MicroUsd {
  return typeof value === 'string' && NON_NEGATIVE.test(value)
}

export function isSignedMicroUsd(value: unknown): value is SignedMicroUsd {
  return typeof value === 'string' && SIGNED.test(value) && value !== '-0'
}

/** Valide et marque un montant. Refuse `01`, `1.0`, `1e3`, ` 1`, `-1`, `+1`. */
export function microUsd(value: string, path = '$'): MicroUsd {
  if (!isMicroUsd(value))
    throw new ContractViolation('AMOUNT_NOT_NON_NEGATIVE_INTEGER_STRING', path, JSON.stringify(value))
  return value
}

export function signedMicroUsd(value: string, path = '$'): SignedMicroUsd {
  if (!isSignedMicroUsd(value))
    throw new ContractViolation('AMOUNT_NOT_SIGNED_INTEGER_STRING', path, JSON.stringify(value))
  return value
}

/** Le seul pont vers l'arithmétique : exact, sans virgule flottante. */
export function toBigInt(amount: MicroUsd | SignedMicroUsd): bigint {
  return BigInt(amount)
}

/**
 * Retour depuis `bigint`. Un résultat négatif ne peut pas être une dépense :
 * il est refusé plutôt que tronqué à zéro, parce que §D-5 (« un échec conserve
 * ses dépenses ») interdit de faire disparaître de l'argent par saturation.
 */
export function fromBigInt(value: bigint, path = '$'): MicroUsd {
  if (value < 0n)
    throw new ContractViolation('AMOUNT_NOT_NON_NEGATIVE_INTEGER_STRING', path, value.toString())
  return value.toString() as MicroUsd
}

export function fromBigIntSigned(value: bigint): SignedMicroUsd {
  return value.toString() as SignedMicroUsd
}

export function addMicroUsd(...amounts: readonly MicroUsd[]): MicroUsd {
  let total = 0n
  for (const a of amounts) total += BigInt(a)
  return total.toString() as MicroUsd
}

/** Multiplication par un compte entier (tokens × tarif). `count` est un `bigint`. */
export function mulMicroUsd(amount: MicroUsd, count: bigint, path = '$'): MicroUsd {
  if (count < 0n) throw new ContractViolation('TYPE_MISMATCH', path, `count negatif : ${count}`)
  return (BigInt(amount) * count).toString() as MicroUsd
}

/**
 * Applique une écriture d'ajustement à un solde. Le résultat reste un montant
 * non négatif : un ajustement qui ferait passer le solde sous zéro est une
 * violation, pas un solde négatif silencieux.
 */
export function applyAdjustment(balance: MicroUsd, adjustment: SignedMicroUsd, path = '$'): MicroUsd {
  return fromBigInt(BigInt(balance) + BigInt(adjustment), path)
}

/** -1, 0, 1. Aucune comparaison lexicographique : `'9' > '10'` en chaînes. */
export function compareMicroUsd(a: MicroUsd, b: MicroUsd): -1 | 0 | 1 {
  const x = BigInt(a)
  const y = BigInt(b)
  return x < y ? -1 : x > y ? 1 : 0
}

export const ZERO_MICRO_USD = '0' as MicroUsd
