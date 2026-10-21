// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T64, ADR-018 decision point 3 (L54-58) et livrables
// L198-L204 : le score d'une regle a une periode est la fraction de ses
// sequences cachees satisfaites (acceptance/T64.spec.ts, section II.1,
// ROLES_SCORE_RULE). Ce role est responsable, comme le fixe la suite, de
// rejouer d'abord la trajectoire principale contre `candidateCommand`/
// `benchDataDir` (meme mecanisme que `runFLongPeriod`, T63) AVANT de generer
// et noter le lot cache sur des copies — ADR-018 L54-58 lie explicitement
// trajectoire principale et lot cache pour chaque regle active.
//
// SQUELETTE (etage RED) : le role ci-dessous leve `NotImplemented`. Aucun des
// quatre cas requis (T64.A1/A2/A3/A4) ne peut donc verdir ici ; ils doivent
// rougir de `STUB_NOT_IMPLEMENTED`, jamais de `MODULE_NOT_FOUND` (l'export
// existe et a la bonne forme).
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/** Entree du notateur de regle cachee — fixee par acceptance/T64.spec.ts, II.1. */
export interface ScoreRuleInput {
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly candidateCommand: readonly string[]
  readonly benchDataDir: string
  readonly count?: number
}

/** Sortie du notateur de regle cachee — fixee par acceptance/T64.spec.ts, II.1. */
export interface ScoreRuleResult {
  readonly score: number
  readonly satisfied: number
  readonly total: number
}

/**
 * Note une regle active a une periode donnee contre le candidat lance par
 * `candidateCommand`/`benchDataDir` : rejoue d'abord la trajectoire
 * principale jusqu'a `period`, puis genere (a partir de `seed`) et note le
 * lot de sequences cachees de `rule` sur des copies de l'etat — `score` est
 * la fraction EXACTE `satisfied / total` (ADR-018 L54-58).
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function scoreRule(_input: ScoreRuleInput): Promise<ScoreRuleResult> {
  throw new NotImplemented('activities.scoreRule')
}
