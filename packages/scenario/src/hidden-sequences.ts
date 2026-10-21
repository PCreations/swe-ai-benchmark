// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — T64, ADR-018 decision point 3 (L54-58) et livrables
// L198-L204 : generation, a partir d'une graine, d'un lot de sequences par
// regle active, appliquees a des copies de l'etat, jamais montrees au
// candidat (acceptance/T64.spec.ts, section II.1, ROLES_GENERATE_SEQUENCES).
//
// SQUELETTE (etage RED) : le role ci-dessous leve `NotImplemented`. Aucun des
// quatre cas requis (T64.A1/A2/A3/A4) ne peut donc verdir ici ; ils doivent
// rougir de `STUB_NOT_IMPLEMENTED`, jamais de `MODULE_NOT_FOUND` (l'export
// existe et a la bonne forme).
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/** Entree du generateur de lot cache — fixee par acceptance/T64.spec.ts, II.1. */
export interface GenerateHiddenSequencesInput {
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly count?: number
}

/** Une sequence du lot cache — valeur opaque, jamais inspectee par la suite. */
export type HiddenSequence = unknown

/** Sortie du generateur de lot cache — fixee par acceptance/T64.spec.ts, II.1. */
export interface GenerateHiddenSequencesResult {
  readonly sequences: readonly HiddenSequence[]
}

/**
 * Genere, a partir de `seed`, le lot de sequences caches d'une regle active a
 * une periode donnee (ADR-018 L54-58 / L200) — deterministe sur la graine
 * (meme graine -> meme lot, T64.A1), jamais montre au candidat (T64.A2), et
 * d'au moins 20 sequences par defaut (T64.A4).
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function generateHiddenSequences(
  _input: GenerateHiddenSequencesInput,
): Promise<GenerateHiddenSequencesResult> {
  throw new NotImplemented('scenario.generateHiddenSequences')
}
