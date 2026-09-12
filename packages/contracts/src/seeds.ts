// ─────────────────────────────────────────────────────────────────────────────
// Dérivation de graines et générateur pseudo-aléatoire — SQUELETTE T02.
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
// T02.M5 mute la première et T02.M6 la seconde : un flux correctement dérivé
// que consomme un générateur non déterministe ne vaut rien, et la réciproque
// est fausse. Les tenir séparés est ce qui rend les deux contre-épreuves
// distinctes.
//
// ÉTAT : chacun LÈVE. Ne surtout pas rendre une constante — T02.A5
// (« indépendant du nombre de tirages ») et T02.A6 (« rejouer donne la même
// suite ») sont des énoncés d'INVARIANCE et de DÉTERMINISME, qu'une valeur
// constante rendrait verts sans rien dériver ni rejouer.
//
// LE VECTEUR PUBLIÉ (`PRNG_TEST_VECTOR`, cahier L173) N'EST PAS DÉCLARÉ ICI.
// C'est une DONNÉE, pas un export appelable : un squelette ne peut pas la
// « lever ». La publier maintenant obligerait à inventer huit tirages qu'aucun
// algorithme figé n'a produits — exactement ce que le cahier L13 interdit
// (« n'invente ni credentials, ni résultats réels »). Elle appartient à l'étage
// vert, avec l'algorithme qui l'engendre.
// ─────────────────────────────────────────────────────────────────────────────
import type { TrajectoryIdentity } from './identity.js'
import type { SeedStream } from './manifest.js'
import { NotImplemented } from './not-implemented.js'

/**
 * Générateur pseudo-aléatoire seedé. La forme minimale est un `next()` : ce que
 * le cahier exige est la REPRODUCTIBILITÉ de la suite, pas une ergonomie.
 */
export interface Rng {
  readonly next: () => number
}

/**
 * Graine d'un flux nommé, dérivée de l'identité complète de trajectoire
 * (six composantes, cahier L78) et du flux (cahier L82).
 */
export function deriveSeed(_identity: TrajectoryIdentity, _stream: SeedStream): string {
  throw new NotImplemented('contracts.deriveSeed')
}

/**
 * Générateur figé par sa graine ET sa version d'algorithme (cahier L143).
 * Aucune lecture de `Date.now()` ni du hasard global n'est permise ici : c'est
 * la condition de fin de la tâche (cahier L175).
 */
export function createRng(_seed: string, _algorithmVersion: string): Rng {
  throw new NotImplemented('contracts.createRng')
}

/** `createRng(deriveSeed(identité, flux), version figée)`. */
export function rngForStream(_identity: TrajectoryIdentity, _stream: SeedStream): Rng {
  throw new NotImplemented('contracts.rngForStream')
}
