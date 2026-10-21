// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — T64, ADR-018 decision point 3 (L54-58) et livrables
// L198-L204 : generation, a partir d'une graine, d'un lot de sequences par
// regle active, appliquees a des copies de l'etat, jamais montrees au
// candidat (acceptance/T64.spec.ts, section II.1, ROLES_GENERATE_SEQUENCES).
//
// CE QUE CE ROLE PRODUIT. Une sequence est une petite scene de reservation
// generee de facon PURE et DETERMINISTE a partir de (seed, rule, period,
// index) : deux identifiants d'acteur et un identifiant de creneau, tous
// derives d'un hachage entier de ces quatre valeurs — jamais de `Date.now`,
// jamais de `Math.random` (meme discipline que `packages/oracle/src/
// f-long.ts`, T61). `@bench/activities#scoreRule` (meme tache, paquet
// voisin) est responsable de traduire chaque sequence en operations reelles
// du contrat `bench.candidate/3` et de noter la reponse d'un candidat ; ce
// paquet-ci reste pur (aucune E/S, aucun processus — meme contrainte que le
// reste de `@bench/scenario`, voir l'en-tete de `./index.ts`).
//
// DETERMINISME (T64.A1). `hash32` est un hachage FNV-1a borne a 32 bits sur
// la concatenation textuelle de (seed, rule, period, index) : meme graine,
// meme (rule, period, index) -> meme hachage -> meme sequence ; une graine
// differente change le hachage de CHAQUE sequence du lot (le texte hache
// inclut `seed` lui-meme), donc deux graines differentes rendent deux lots
// distincts (perturbation IV.1 de acceptance/T64.spec.ts : un generateur qui
// ignorerait la graine echouerait cette suite).
// ─────────────────────────────────────────────────────────────────────────────

/** Entree du generateur de lot cache — fixee par acceptance/T64.spec.ts, II.1. */
export interface GenerateHiddenSequencesInput {
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly count?: number
}

/**
 * Une sequence du lot cache. Valeur opaque pour la suite d'acceptation
 * (jamais inspectee, seulement comparee par egalite structurelle JSON) ;
 * cette forme concrete est une decision de CE paquet (ADR-001 : aucune
 * source ne la fixe), consommee par `@bench/activities#scoreRule` pour
 * construire les operations reelles envoyees au candidat.
 */
export interface HiddenSequence {
  readonly rule: string
  readonly period: string
  readonly index: number
  readonly tenantId: string
  readonly slotId: string
  readonly actor: string
  readonly otherActor: string
  readonly level: 'standard' | 'gold'
}

/** Sortie du generateur de lot cache — fixee par acceptance/T64.spec.ts, II.1. */
export interface GenerateHiddenSequencesResult {
  readonly sequences: readonly HiddenSequence[]
}

/** ADR-018:L202 — « le lot de chaque regle compte au moins 20 sequences ». */
const MIN_BATCH_SIZE = 20

/** Hachage FNV-1a 32 bits, deterministe, sans dependance a l'horloge ni au hasard ambiant. */
function hash32(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5 // FNV offset basis
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193) // FNV prime
    }
  }
  return h >>> 0
}

/** mulberry32 — PRNG deterministe amorce par un entier 32 bits. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Genere, a partir de `seed`, le lot de sequences caches d'une regle active a
 * une periode donnee (ADR-018 L54-58 / L200) — deterministe sur la graine
 * (meme graine -> meme lot, T64.A1), jamais montre au candidat (T64.A2), et
 * d'au moins 20 sequences (T64.A4 ; `count`, s'il est fourni et superieur,
 * est respecte — jamais utilise pour descendre sous ce plancher).
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function generateHiddenSequences(
  input: GenerateHiddenSequencesInput,
): Promise<GenerateHiddenSequencesResult> {
  const count = Math.max(input.count ?? MIN_BATCH_SIZE, MIN_BATCH_SIZE)
  const sequences: HiddenSequence[] = []
  for (let index = 0; index < count; index += 1) {
    const h = hash32(input.seed, input.rule, input.period, index)
    const rng = mulberry32(h)
    const suffix = h.toString(36)
    const level: 'standard' | 'gold' = rng() < 0.5 ? 'standard' : 'gold'
    sequences.push({
      rule: input.rule,
      period: input.period,
      index,
      tenantId: `hs-tenant-${suffix}`,
      slotId: `hs-slot-${suffix}`,
      actor: `hs-actor-${suffix}-a`,
      otherActor: `hs-actor-${suffix}-b`,
      level,
    })
  }
  return { sequences }
}
