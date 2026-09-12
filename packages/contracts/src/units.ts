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

// ─────────────────────────────────────────────────────────────────────────────
// LES DEUX CONSTRUCTEURS DE T02 — montant et écriture d'ajustement.
//
// POURQUOI DEUX, ET PAS UN AVEC UN DRAPEAU. §E (cahier L80) : « Les montants
// sont des chaînes d'entiers NON NÉGATIFS en micro-USD [...] Les ajustements
// sont des écritures séparées signées. » Le signe négatif n'est pas interdit en
// soi : il est interdit à un MONTANT et légitime dans une ÉCRITURE
// D'AJUSTEMENT. C'est tout le sens du qualificatif « hors écriture
// d'ajustement » de L173. Un constructeur unique paramétré rendrait cette
// frontière invisible au diff.
//
// POURQUOI `unknown` ET NON `string`. `microUsd` / `signedMicroUsd` (livrables
// T00) n'acceptent qu'une `string`, ce qui suffit quand l'appelant a déjà un
// texte. Ici, le cahier interdit aussi les « nombres non finis » (L80) : pour
// REFUSER `NaN` et `Infinity`, encore faut-il pouvoir les RECEVOIR. Ces deux
// constructeurs sont donc la frontière du paquet — le point où une valeur
// venue du monde extérieur devient, ou ne devient pas, un montant.
//
// CE QUE LE REFUS COUVRE, ET POURQUOI IL N'EST PAS UNE COMPÉTENCE. Sont
// refusés : négatifs (hors ajustement), décimaux, `NaN` sous ses deux formes,
// infinis, chaîne vide, notation exponentielle, zéros de tête, tout ce qui
// n'est pas une chaîne. Mais un constructeur qui refuserait TOUT satisferait
// la lettre de L173 sans rien vérifier : `0`, `1000000` (= 1 USD, L80) et un
// entier au-delà de 2^53 doivent être ACCEPTÉS et relus à l'identique. La
// chaîne est conservée telle quelle, jamais reconstruite via un `number` :
// c'est l'invariant 9 (« entiers exacts, jamais une addition de flottants
// monétaires ») au point le plus bas où il puisse être tenu.
// ─────────────────────────────────────────────────────────────────────────────

/** Rend une valeur refusée lisible dans un message, sans la faire passer pour un texte valide. */
function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : `${typeof value}:${String(value)}`
}

/**
 * Montant en micro-USD (§E, cahier L80). Non négatif, entier exact, sans limite
 * à 2^53 : le transport est une chaîne, l'arithmétique un `bigint`.
 *
 * Refuse : négatifs, décimaux, `NaN`, infinis, chaîne vide, notation
 * exponentielle, zéros de tête, et toute valeur qui n'est pas une chaîne.
 */
export function parseAmountMicroUsd(value: unknown, path = '$'): MicroUsd {
  if (!isMicroUsd(value))
    throw new ContractViolation('AMOUNT_NOT_NON_NEGATIVE_INTEGER_STRING', path, describe(value))
  return value
}

/**
 * Écriture d'ajustement (§E, cahier L80) : « écritures séparées signées ». Le
 * négatif y est LÉGITIME ; le décimal, le `NaN` et l'infini restent refusés.
 * L'ajustement ne blanchit que le SIGNE.
 *
 * `-0` est refusé comme les zéros de tête : deux écritures textuellement
 * distinctes pour un même montant rendraient l'empreinte du §E ambiguë.
 */
export function parseAdjustmentMicroUsd(value: unknown, path = '$'): SignedMicroUsd {
  if (!isSignedMicroUsd(value))
    throw new ContractViolation('AMOUNT_NOT_SIGNED_INTEGER_STRING', path, describe(value))
  return value
}
