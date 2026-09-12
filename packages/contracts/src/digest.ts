// ─────────────────────────────────────────────────────────────────────────────
// Empreintes — SHA-256 sur octets canoniques (§E, cahier L82).
//
// « Les empreintes utilisent SHA-256 sur des octets canoniques documentés.
//   Objets JSON triés récursivement par clé ; ordre des tableaux conservé ;
//   UTF-8 ; aucun timestamp technique ajouté à un objet métier déterministe. »
//
// TROIS EXPORTS, PARCE QUE LE CAHIER DÉCRIT TROIS RÔLES DISTINCTS :
//
//   canonicalBytes  : valeur de domaine → octets (la règle de sérialisation)
//   sha256Hex       : octets → 64 hexadécimaux minuscules (la fonction de hachage)
//   canonicalDigest : la composition des deux, et RIEN d'autre
//
// L'égalité `canonicalDigest(v) === sha256Hex(canonicalBytes(v))` n'est pas une
// commodité : c'est ce qui interdit qu'une empreinte se calcule autrement que
// par la règle du §E. Elle est ici tenue par construction — `canonicalDigest`
// appelle littéralement les deux autres — plutôt que par deux chemins de code
// qu'il faudrait garder d'accord.
//
// AUCUN IMPORT EXTERNE. `node:crypto` n'apparaît pas : ADR-005 §3 veut ce
// paquet indépendant, `tsconfig.json` le rend mécanique par `types: []`, et
// `./sha256.js` porte l'algorithme de FIPS 180-4 écrit sur place.
// ─────────────────────────────────────────────────────────────────────────────
import type { CanonicalValue } from './canonical.js'
import { canonicalJson } from './canonical.js'
import { ContractViolation } from './errors.js'
import { sha256 } from './sha256.js'
import { toHex, utf8Encode } from './utf8.js'

/**
 * Octets canoniques d'une valeur de domaine (§E, cahier L82) : clés triées
 * récursivement, ordre des tableaux conservé, encodage UTF-8, aucun horodatage
 * technique ajouté.
 *
 * La sortie est la représentation UTF-8 du texte canonique : deux rédactions du
 * même objet, dont les clés sont permutées à tous les niveaux, donnent le même
 * tableau d'octets — c'est l'énoncé de T02.A1.
 */
export function canonicalBytes(value: CanonicalValue): Uint8Array {
  return utf8Encode(canonicalJson(value))
}

/**
 * SHA-256 d'une suite d'octets, en hexadécimal minuscule (64 caractères).
 *
 * Vecteur de contrôle du cahier (L173) : les octets `abc` donnent
 * `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return toHex(sha256(asBytes(bytes)))
}

/**
 * Empreinte d'une valeur de domaine : `sha256Hex(canonicalBytes(valeur))`.
 */
export function canonicalDigest(value: CanonicalValue): string {
  return sha256Hex(canonicalBytes(value))
}

/**
 * Normalise l'entrée du hacheur.
 *
 * La vérification est STRUCTURELLE (longueur numérique, octets indexables) et
 * non un `instanceof` : sous Jest, la suite d'acceptation et le paquet peuvent
 * être évalués dans deux contextes de module, où `Uint8Array` n'est pas le même
 * constructeur. Un refus dépendant du contexte d'exécution serait une propriété
 * du harnais, pas du contrat — exactement ce que §G interdit d'appeler preuve.
 */
function asBytes(input: Uint8Array): Uint8Array {
  const like = input as unknown as { readonly length?: unknown }
  if (input === null || typeof input !== 'object' || typeof like.length !== 'number') {
    throw new ContractViolation('TYPE_MISMATCH', '$', `octets attendus, recu ${typeof input}`)
  }
  const n = like.length
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i += 1) {
    const b = (input as unknown as Record<number, unknown>)[i]
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > 255) {
      throw new ContractViolation('TYPE_MISMATCH', `$[${i}]`, `octet attendu, recu ${String(b)}`)
    }
    out[i] = b
  }
  return out
}
