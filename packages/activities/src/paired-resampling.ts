// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T76 : le rééchantillonnage APPARIÉ de T33 (cahier
// L439-L445, analysis/src/bootstrap.py), repris pour le rapport de coût entre
// deux bras d'un pilote. Mêmes règles, transposées de l'unité « parent » à
// l'unité « répétition » (trajectoire) :
//
//   - les valeurs sont d'abord réduites à UNE valeur par unité et par bras
//     (ici, le coût d'une trajectoire à une période, ou cumulé jusqu'à elle) ;
//   - un tirage est une liste d'unités (avec remise), de la taille du nombre
//     d'unités, et le MÊME tirage sert aux deux bras (T33.A2) ;
//   - le rapport d'un tirage est le RAPPORT DES MOYENNES du bras numérateur et
//     du bras dénominateur sur les unités tirées (jamais une moyenne de
//     rapports) ; dénominateur nul : `null` (ZERO_DENOMINATOR), jamais un
//     lissage ;
//   - la bande est ponctuelle, par quantile empirique INVERSE (rang
//     ceil(q n), 1-indexé sur les valeurs triées, sans interpolation), jamais
//     étiquetée simultanée (T33.A1/A7).
//
// LES TIRAGES. Quand l'ensemble des tirages possibles (u^u pour u unités) ne
// dépasse pas `maxDraws`, ils sont TOUS énumérés, dans l'ordre lexicographique
// (bootstrap exact) ; sinon `maxDraws` tirages pseudo-aléatoires, de graine
// déclarée. Dans les deux cas la liste est publiée (manifeste de tirages).
// Une sortie déterministe n'implique pas une couverture fréquentiste garantie.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'

export const DEFAULT_MAX_DRAWS = 2000

export interface PairedDraws<U> {
  readonly method: 'exhaustive' | 'pseudo_random'
  readonly seed: string | null
  readonly draws: readonly (readonly U[])[]
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Les tirages appariés sur `units` (ordre conservé), exhaustifs si possible. */
export function pairedDraws<U>(units: readonly U[], options: { readonly maxDraws?: number; readonly seed?: string } = {}): PairedDraws<U> {
  const u = units.length
  const maxDraws = Math.max(1, Math.floor(options.maxDraws ?? DEFAULT_MAX_DRAWS))
  if (u === 0) return { method: 'exhaustive', seed: null, draws: [] }
  if (u ** u <= maxDraws) {
    const draws: U[][] = []
    const idx = new Array<number>(u).fill(0)
    for (;;) {
      draws.push(idx.map((k) => units[k] as U))
      let p = u - 1
      while (p >= 0 && idx[p] === u - 1) {
        idx[p] = 0
        p -= 1
      }
      if (p < 0) break
      idx[p] = (idx[p] as number) + 1
    }
    return { method: 'exhaustive', seed: null, draws }
  }
  const seed = options.seed ?? 'bench-paired-resampling'
  const rng = mulberry32(createHash('sha256').update(seed, 'utf8').digest().readUInt32BE(0))
  const draws: U[][] = []
  for (let d = 0; d < maxDraws; d += 1) draws.push(Array.from({ length: u }, () => units[Math.floor(rng() * u)] as U))
  return { method: 'pseudo_random', seed, draws }
}

const mean = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length

/** Rapport des moyennes numérateur / dénominateur sur les unités `draw` ; `null` si le dénominateur est nul. */
export function ratioOfMeans<U>(draw: readonly U[], numerator: (u: U) => number, denominator: (u: U) => number): number | null {
  if (draw.length === 0) return null
  const b = mean(draw.map(denominator))
  if (!Number.isFinite(b) || b === 0) return null
  const a = mean(draw.map(numerator))
  return Number.isFinite(a) ? a / b : null
}

export interface PointwiseInterval {
  readonly lower: number | null
  readonly upper: number | null
  readonly lower_quantile: number
  readonly upper_quantile: number
  readonly kind: 'pointwise'
  readonly simultaneous: false
  readonly convention: 'empirical_inverse_quantile_ceil_qn'
}

/** Bande ponctuelle par quantile empirique inverse (rang ceil(q n), 1-indexé). */
export function empiricalInverseQuantileInterval(values: readonly number[], lowerQ: number, upperQ: number): PointwiseInterval {
  const sorted = [...values].sort((x, y) => x - y)
  const n = sorted.length
  const at = (q: number): number | null => {
    if (n === 0) return null
    const rank = Math.min(n, Math.max(1, Math.ceil(q * n - 1e-12)))
    return sorted[rank - 1] as number
  }
  return {
    lower: at(lowerQ),
    upper: at(upperQ),
    lower_quantile: lowerQ,
    upper_quantile: upperQ,
    kind: 'pointwise',
    simultaneous: false,
    convention: 'empirical_inverse_quantile_ceil_qn',
  }
}
