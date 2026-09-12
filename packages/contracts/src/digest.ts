// ─────────────────────────────────────────────────────────────────────────────
// Empreintes — SQUELETTE T02, aucune règle de calcul ici.
//
// §E (cahier L82) : « Les empreintes utilisent SHA-256 sur des octets
// canoniques documentés. Objets JSON triés récursivement par clé ; ordre des
// tableaux conservé ; UTF-8 [...] »
//
// TROIS EXPORTS, PARCE QUE LE CAHIER DÉCRIT TROIS RÔLES DISTINCTS, et parce que
// `acceptance/T02.spec.ts` les confronte l'un à l'autre : T02.A3 exige que
// l'empreinte d'une valeur SOIT le SHA-256 de ses octets canoniques. Fusionner
// les trois rendrait cette égalité invérifiable — il n'y aurait plus deux
// chemins à comparer.
//
//   canonicalBytes  : valeur de domaine → octets (la règle de sérialisation)
//   sha256Hex       : octets → 64 hexadécimaux minuscules (la fonction de hachage)
//   canonicalDigest : la composition des deux
//
// ÉTAT : chacun LÈVE. Le squelette ne rend surtout pas une constante : T02.A1
// (« mêmes octets ») et T02.A2 (« empreinte stable ») sont des énoncés
// d'ÉGALITÉ, qu'une constante satisferait sans rien calculer. C'est la mise en
// garde littérale de `verification/cases.lock.json` et de T02.M1/T02.M2.
//
// CE QUE CE FICHIER N'IMPORTE PAS, ET POURQUOI. `node:crypto` n'apparaît pas.
// `packages/contracts/tsconfig.json` fixe `types: []` pour rendre MÉCANIQUE
// l'indépendance exigée par ADR-005 §3 ; l'étape verte devra donc trancher
// explicitement où vit SHA-256, pas le décider par inadvertance dans un import
// ajouté au passage.
// ─────────────────────────────────────────────────────────────────────────────
import type { CanonicalValue } from './canonical.js'
import { NotImplemented } from './not-implemented.js'

/**
 * Octets canoniques d'une valeur de domaine (§E, cahier L82).
 *
 * Contrat visé, non encore tenu : clés triées récursivement, ordre des tableaux
 * conservé, encodage UTF-8, aucun horodatage technique ajouté.
 */
export function canonicalBytes(_value: CanonicalValue): Uint8Array {
  throw new NotImplemented('contracts.canonicalBytes')
}

/**
 * SHA-256 d'une suite d'octets, en hexadécimal minuscule (64 caractères).
 *
 * Vecteur de référence du cahier (L173) : les octets `abc` donnent
 * `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
 */
export function sha256Hex(_bytes: Uint8Array): string {
  throw new NotImplemented('contracts.sha256Hex')
}

/**
 * Empreinte d'une valeur de domaine : `sha256Hex(canonicalBytes(valeur))`.
 * L'égalité entre ce raccourci et sa décomposition est elle-même une exigence
 * (cahier L82), pas une commodité.
 */
export function canonicalDigest(_value: CanonicalValue): string {
  throw new NotImplemented('contracts.canonicalDigest')
}
