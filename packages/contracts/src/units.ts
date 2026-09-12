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
import { NotImplemented } from './not-implemented.js'

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

// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE T02 — les deux constructeurs que `acceptance/T02.spec.ts` exerce.
//
// POURQUOI DEUX, ET PAS UN AVEC UN DRAPEAU. §E (cahier L80) : « Les montants
// sont des chaînes d'entiers NON NÉGATIFS en micro-USD [...] Les ajustements
// sont des écritures séparées signées. » Le signe négatif n'est pas interdit en
// soi : il est interdit à un MONTANT et légitime dans une ÉCRITURE
// D'AJUSTEMENT. C'est tout le sens du qualificatif « hors écriture
// d'ajustement » de L173. Un constructeur unique paramétré rendrait cette
// frontière invisible au diff.
//
// `isMicroUsd` / `microUsd` / `signedMicroUsd` existent déjà (livrables T00) et
// n'acceptent qu'une `string`. Les entrées que T02.A4 soumet sont plus larges —
// `NaN`, `Infinity`, la chaîne vide, `1e6` — parce que le cahier interdit les
// « nombres non finis » en plus des décimaux. Les deux exports ci-dessous
// prennent donc `unknown` : refuser un nombre non fini suppose de pouvoir le
// RECEVOIR.
//
// ÉTAT : ils LÈVENT `NotImplemented`, et non `ContractViolation`. La distinction
// n'est pas cosmétique — la suite compte tout `throw` comme un REFUS, si bien
// qu'un stub levant une violation de contrat se ferait passer pour la garde
// qu'il ne contient pas. Le cas reste rouge par sa MOITIÉ POSITIVE : T02.A4
// exige aussi que `0`, `1000000`, les montants importés de la racine gelée
// F-MONEY et un entier au-delà de 2^53 soient ACCEPTÉS et relus à l'identique.
// C'est la leçon que `verification/mutants/T02.json` inscrit en T02.M8 : le
// refus n'est pas une compétence.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Montant en micro-USD (§E, cahier L80). Non négatif, entier exact, sans limite
 * à 2^53 : le transport est une chaîne, l'arithmétique un `bigint`.
 *
 * Refuse : négatifs, décimaux, `NaN`, infinis, chaîne vide, notation
 * exponentielle, zéros de tête.
 */
export function parseAmountMicroUsd(_value: unknown, _path = '$'): MicroUsd {
  throw new NotImplemented('contracts.parseAmountMicroUsd')
}

/**
 * Écriture d'ajustement (§E, cahier L80) : « écritures séparées signées ». Le
 * négatif y est LÉGITIME ; le décimal, le `NaN` et l'infini restent refusés.
 * L'ajustement ne blanchit que le SIGNE.
 */
export function parseAdjustmentMicroUsd(_value: unknown, _path = '$'): SignedMicroUsd {
  throw new NotImplemented('contracts.parseAdjustmentMicroUsd')
}

