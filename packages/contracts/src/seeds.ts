// ─────────────────────────────────────────────────────────────────────────────
// Dérivation de graines et générateur pseudo-aléatoire.
//
// §E (cahier L82) : « Les graines sont dérivées par identifiants et flux
// (`scenario`, `workload`, `assignment`, `bootstrap`) pour que l'ajout d'un
// tirage dans un composant ne change pas tous les autres. »
// §G (cahier L143) : « Une version et un algorithme pseudo-aléatoire figés sont
// requis pour les sorties simulées. »
//
// CES DEUX PHRASES NE VIVENT PAS AU MÊME POINT DU PROGRAMME, et c'est la raison
// pour laquelle il y a ici trois exports plutôt qu'un :
//
//   deriveSeed    : (identité, flux) → graine. La dérivation, et rien d'autre.
//   createRng     : (graine, version d'algorithme) → suite reproductible.
//   rngForStream  : la composition, pour l'appelant qui ne veut pas la faire.
//
// CE QUI REND L'INDÉPENDANCE DES FLUX VRAIE, ET PAS SEULEMENT ANNONCÉE : il n'y
// a AUCUN état partagé. Aucune variable de module, d'abord — le compteur global
// que décrit T02.M5 devrait s'écrire ici, en toutes lettres. Mais surtout,
// l'état d'un générateur n'est pas modifié par la lecture : `createRng` fige un
// état INITIAL, et chaque parcours en prend une copie. Deux lecteurs d'une même
// suite lisent donc la même suite, et mille tirages du flux `bootstrap` ne
// déplacent rien nulle part. C'est la lecture littérale de L173 — « rejouer une
// suite [...] donne la même suite » : ce qui se rejoue est la SUITE, pas un
// curseur qu'il faudrait penser à remettre à zéro.
//
// L'ALGORITHME EST FIGÉ ET NOMMÉ. `xoshiro128**` (Blackman & Vigna, 2018) est
// publié, court, entièrement en entiers 32 bits — donc reproductible à
// l'identique partout où tournent `Math.imul` et les décalages. Son état de
// 128 bits vient des seize premiers octets de `SHA-256(version | graine)` : la
// version entre DANS l'état, si bien qu'un changement de version ne peut pas
// produire la même suite par accident. Une version inconnue est refusée, jamais
// servie en silence (cahier L143 : « figés »).
//
// AUCUNE LECTURE DE `Date.now()` NI DU HASARD GLOBAL. C'est la condition de fin
// de la tâche (cahier L175). Ce fichier n'importe que du calcul pur ; la
// propriété se lit au diff, et T02.A6 l'observe en rejouant le vecteur pendant
// que `Math.random` lève et que `Date.now` ment.
// ─────────────────────────────────────────────────────────────────────────────
import { canonicalBytes, sha256Hex } from './digest.js'
import { ContractViolation } from './errors.js'
import type { TrajectoryIdentity } from './identity.js'
import { TRAJECTORY_ID_FIELDS } from './identity.js'
import type { SeedStream } from './manifest.js'
import { SEED_STREAMS } from './manifest.js'
import { sha256 } from './sha256.js'
import { utf8Encode } from './utf8.js'

/**
 * Suite pseudo-aléatoire figée par une graine et une version d'algorithme.
 *
 * CE N'EST PAS UN CURSEUR MUTABLE, ET C'EST LE POINT. Le cahier (L173) énonce
 * « rejouer une suite avec la même graine et version d'algorithme donne la même
 * suite » : l'objet rendu EST la suite, et chaque parcours la rejoue depuis la
 * graine. Un objet à `next()` partagé dirait l'inverse — deux lecteurs du même
 * générateur se voleraient leurs tirages, et « rejouer » exigerait de savoir
 * combien de fois quelqu'un d'autre a déjà tiré. Le curseur existe quand même,
 * mais il est LOCAL au parcours : `rng[Symbol.iterator]()` en ouvre un neuf.
 *
 * Les valeurs sont des flottants de [0, 1) : un entier 32 bits divisé par 2^32,
 * donc une division EXACTE, reproductible chiffre pour chiffre.
 */
export interface Rng extends Iterable<number> {
  /**
   * Les `count` premiers tirages de la suite, depuis la graine. La forme finie,
   * pour que le parcours d'une suite infinie ne soit jamais un accident.
   */
  readonly take: (count: number) => number[]
}

/**
 * Version figée de l'algorithme pseudo-aléatoire (cahier L143). Elle entre dans
 * l'état initial du générateur : deux versions ne peuvent pas servir la même
 * suite sur la même graine.
 */
export const PRNG_ALGORITHM_VERSION = 'bench.xoshiro128starstar/1'

/**
 * Séparateur d'unités (U+001F) entre la version et la graine. Il ne peut
 * apparaître ni dans l'une ni dans l'autre : deux couples distincts ne peuvent
 * donc pas se confondre en une seule chaîne.
 */
const UNIT_SEPARATOR = '\u001f'

const u32 = (a: Uint32Array, i: number): number => a[i] as number
const byte = (a: Uint8Array, i: number): number => a[i] as number
const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0

/** 2^32. Diviser par cette puissance de deux est EXACT en virgule flottante. */
const TWO_POW_32 = 4294967296

/**
 * Graine d'un flux nommé, dérivée de l'identité complète de trajectoire
 * (six composantes, cahier L78) et du flux (cahier L82).
 *
 * La dérivation passe par les octets canoniques du §E : deux processus, deux
 * langages ou deux ordres de champs donnent la même graine, ce qu'une
 * concaténation libre ne garantirait pas.
 */
export function deriveSeed(identity: TrajectoryIdentity, stream: SeedStream): string {
  if (!SEED_STREAMS.includes(stream)) {
    throw new ContractViolation('ENUM_VALUE_UNKNOWN', '$.stream', String(stream))
  }
  if (identity === null || typeof identity !== 'object') {
    throw new ContractViolation('TYPE_MISMATCH', '$.identity', typeof identity)
  }

  // Les six composantes, et elles seules, dans un objet reconstruit : une
  // identité de période ou d'opération (qui en porte davantage, §E) dérive la
  // graine de SA trajectoire, et non une graine parallèle.
  const subject: Record<string, string> = {}
  for (const field of TRAJECTORY_ID_FIELDS) {
    const v = identity[field]
    if (typeof v !== 'string' || v.length === 0) {
      throw new ContractViolation('MISSING_PROPERTY', `$.identity.${field}`, String(v))
    }
    subject[field] = v
  }

  return sha256Hex(canonicalBytes({ identity: subject, stream }))
}

/**
 * Générateur figé par sa graine ET sa version d'algorithme (cahier L143).
 *
 * Aucune lecture de `Date.now()` ni du hasard global : c'est la condition de
 * fin de la tâche (cahier L175). L'état est PROPRE à l'objet rendu ; deux
 * appels sur la même graine rejouent la même suite depuis le début.
 */
export function createRng(seed: string, algorithmVersion: string = PRNG_ALGORITHM_VERSION): Rng {
  if (typeof seed !== 'string' || seed.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', '$.seed', `graine attendue, recu ${typeof seed}`)
  }
  if (algorithmVersion !== PRNG_ALGORITHM_VERSION) {
    throw new ContractViolation('ENUM_VALUE_UNKNOWN', '$.algorithm_version', String(algorithmVersion))
  }

  // État initial de 128 bits, dérivé une fois et JAMAIS modifié ensuite : c'est
  // lui qui fait de l'objet une suite plutôt qu'un curseur. Chaque parcours en
  // prend une copie.
  const initial = initialState(seed, algorithmVersion)

  const cursor = (): Iterator<number> => {
    const s = new Uint32Array(initial)
    return { next: (): IteratorResult<number> => ({ done: false, value: step(s) }) }
  }

  return {
    [Symbol.iterator]: cursor,
    take: (count: number): number[] => {
      if (!Number.isInteger(count) || count < 0) {
        throw new ContractViolation('TYPE_MISMATCH', '$.count', String(count))
      }
      const s = new Uint32Array(initial)
      const out: number[] = []
      for (let i = 0; i < count; i += 1) out.push(step(s))
      return out
    },
  }
}

/**
 * État initial de 128 bits : les seize premiers octets de
 * `SHA-256(version | graine)`, lus en gros-boutien.
 */
function initialState(seed: string, algorithmVersion: string): Uint32Array {
  const material = sha256(utf8Encode(`${algorithmVersion}${UNIT_SEPARATOR}${seed}`))
  const s = new Uint32Array(4)
  for (let i = 0; i < 4; i += 1) {
    const p = i * 4
    s[i] =
      ((byte(material, p) << 24) |
        (byte(material, p + 1) << 16) |
        (byte(material, p + 2) << 8) |
        byte(material, p + 3)) >>>
      0
  }

  // xoshiro128** exige un état non nul. SHA-256 ne rend pas seize octets nuls ;
  // la garde est là pour que cette propriété soit portée par le code et non par
  // une confiance dans la fonction de hachage.
  if (u32(s, 0) === 0 && u32(s, 1) === 0 && u32(s, 2) === 0 && u32(s, 3) === 0) s[0] = 1
  return s
}

/** Un tour de xoshiro128** : avance l'état reçu et rend le tirage. */
function step(s: Uint32Array): number {
  const result = (Math.imul(rotl(Math.imul(u32(s, 1), 5), 7), 9) >>> 0) / TWO_POW_32
  const t = (u32(s, 1) << 9) >>> 0
  s[2] = (u32(s, 2) ^ u32(s, 0)) >>> 0
  s[3] = (u32(s, 3) ^ u32(s, 1)) >>> 0
  s[1] = (u32(s, 1) ^ u32(s, 2)) >>> 0
  s[0] = (u32(s, 0) ^ u32(s, 3)) >>> 0
  s[2] = (u32(s, 2) ^ t) >>> 0
  s[3] = rotl(u32(s, 3), 11)
  return result
}

/** `createRng(deriveSeed(identité, flux))`, sous la version figée. */
export function rngForStream(identity: TrajectoryIdentity, stream: SeedStream): Rng {
  return createRng(deriveSeed(identity, stream), PRNG_ALGORITHM_VERSION)
}

/**
 * VECTEUR PUBLIÉ (cahier L173 : « rejouer une suite avec la même graine et
 * version d'algorithme donne la même suite, avec vecteur publié »).
 *
 * Ce n'est pas une valeur attendue inventée : c'est la sortie OBSERVÉE de
 * `createRng(seed, algorithm)` ci-dessus, relevée une fois et publiée pour que
 * tout changement d'algorithme devienne un diff, et non une dérive silencieuse
 * des campagnes déjà mesurées (§D-8 : graines et versions figées avant une
 * campagne). Le cahier L13 interdit d'inventer des résultats ; publier ceux
 * qu'un algorithme figé produit réellement est l'inverse de cette faute.
 *
 * Reproductible hors de ce dépôt : les douze premiers tirages de
 * `createRng('T02/vecteur-publie', 'bench.xoshiro128starstar/1')`.
 */
export interface PrngTestVector {
  readonly algorithm: string
  readonly seed: string
  readonly values: readonly number[]
}

export const PRNG_TEST_VECTOR: PrngTestVector = {
  algorithm: PRNG_ALGORITHM_VERSION,
  seed: 'T02/vecteur-publie',
  values: [
    0.9715661872178316, 0.5759889131877571, 0.9900179498363286,
    0.7018043517600745, 0.6924036436248571, 0.37358532985672355,
    0.9599133601877838, 0.7525616274215281, 0.3238430926576257,
    0.0570716958027333, 0.43826753133907914, 0.7209267434664071,
  ],
}
