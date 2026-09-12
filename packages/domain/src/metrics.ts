// ─────────────────────────────────────────────────────────────────────────────
// Métriques de période et leurs dénominateurs (T04, L185–L194) — SQUELETTE.
//
// CE FICHIER NE CALCULE RIEN, ET C'EST SON RÔLE À CE COMMIT.
// L'étage RED exige que les six cas de `acceptance/T04.spec.ts` échouent pour
// la RAISON ATTENDUE. Avant ce fichier ils échouaient tous sur
// `CONTRAT-NON-SATISFAIT role=computePeriodMetrics` — c'est-à-dire sur
// l'absence d'un NOM. Un rouge de cette forme ne dit rien de ce que la suite
// vérifie : il est à la résolution de modules ce que `MODULE_NOT_FOUND` est au
// chargement, la forme par défaut du TDD en monorepo TypeScript.
//
// En déclarant le nom et en le faisant LEVER, le rouge se déplace là où il
// prouve quelque chose : la suite appelle réellement l'export, lit réellement
// sa sortie, et tombe sur l'assertion qui exige une mesure lisible.
// `verification/runner/red.mjs` ne retient que `ASSERTION_FAILED` et
// `STUB_NOT_IMPLEMENTED` comme rouge légitime.
//
// POURQUOI UN SEUL EXPORT POUR SEPT LIVRABLES.
// L187 nomme Q, R, V, U, backlog, exigences remplacées et régressions. Mais
// aucune de ces grandeurs n'est calculable période par période isolément :
// G et G_new comparent une période à la précédente (L189), V et U agrègent sur
// la série, l'exposition est une fraction de la série (L111). L'entrée
// naturelle du contrat est donc la SÉRIE, et le découpage en sept fonctions
// serait une décomposition que le cahier n'impose pas.
//
// CE QUI RESTE À ÉCRIRE, ET QUI NE DOIT PAS ÊTRE DEVINÉ ICI :
//   • Q — moyenne pondérée des exigences ACTIVES DUES, comptée par id/version
//     active et jamais par nombre d'assertions (L129, invariant D.10) ;
//     `null` si aucun poids d'exigence active due (L111) ;
//   • R — réussite d'intention de la période ; `null` si aucune intention
//     admissible n'est proposée, mais 0 — jamais `null` — pour une trajectoire
//     indisponible face à des intentions prévues (L111) ;
//   • V — moyenne temporelle de Q sur les périodes (L107) ;
//   • U — moyenne temporelle de R sur les seules périodes EXPOSÉES, avec
//     l'exposition publiée à part (L111) ;
//   • la réussite agrégée par intention — quotient des SOMMES, distincte de U
//     et de l'exposition, « ces trois derniers nombres sont différents et
//     doivent rester identifiés » (L107) ;
//   • G / G_new — régressions ouvertes et nouvelles, avec leurs IDENTITÉS :
//     un compte seul ne distingue pas `isolation@1` du retrait de `cancel@1`
//     (L129, L189).
//
// AUCUNE NOTE LLM N'INTERVIENT (L193). La propriété est ici structurelle et
// non déclarative : ce paquet compile sous `types: []` et ne dépend que de
// `@bench/contracts`, donc aucun client de modèle ne peut s'y glisser sans
// faire échouer la compilation.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/**
 * Une exigence ACTIVE à une période, telle qu'elle entre dans la mesure.
 *
 * `satisfied` est l'issue d'évaluation de la période : c'est une ENTRÉE de la
 * fonction pure (L187), jamais quelque chose que ce module décide.
 *
 * `assertions` est porté parce que le contrat Requirement (L88) le porte — et
 * parce que son cardinal ne doit RIEN changer au poids d'une exigence (L72,
 * L129). Le champ existe donc pour que l'invariance soit observable, pas pour
 * être lu par le calcul de Q.
 */
export interface MetricRequirement {
  readonly id: string
  readonly version: number
  readonly capability_id: string
  readonly weight: number
  readonly revealed_at_period: number
  readonly due_at_period: number
  readonly criticality: string
  readonly source: string
  readonly satisfied: boolean
  readonly assertions: readonly string[]
}

/**
 * Une exigence RETIRÉE à une période, avec son « remplacement éventuel » (L88).
 *
 * `replaced_by` nul signifie un simple retrait. La distinction n'est pas
 * décorative : le retrait de `cancel@1` REMPLACÉE par `cancel@2` ne produit pas
 * de régression (L129).
 */
export interface RetiredRequirement {
  readonly id: string
  readonly version: number
  readonly replaced_by: { readonly id: string; readonly version: number } | null
}

/** Une période de la série mesurée (L78, L107, L109). */
export interface MetricPeriod {
  readonly period_index: number
  readonly duration: number
  readonly requirements: readonly MetricRequirement[]
  readonly retired: readonly RetiredRequirement[]
  readonly intents_offered: number
  readonly intents_succeeded: number
}

/** La série soumise : forme nommée, ou tableau nu. */
export type MetricSeriesInput = { readonly periods: readonly MetricPeriod[] } | readonly MetricPeriod[]

/**
 * Options d'EXÉCUTION d'une mesure. Comme pour `compileCampaignManifest`, elles
 * ne sont jamais un facteur scientifique et le calcul ne les lira pas.
 */
export interface MetricOptions {
  readonly [option: string]: unknown
}

/** Les grandeurs d'une période. `null` porte les conventions de L111. */
export interface PeriodMetrics {
  readonly period_index: number
  readonly Q: number | null
  readonly R: number | null
  readonly G: number
  readonly G_new: number
  readonly regressions: readonly string[]
  readonly new_regressions: readonly string[]
}

/** Les agrégats de campagne (L107, L111). */
export interface CampaignAggregates {
  readonly V: number | null
  readonly U: number | null
  readonly exposure: number
  readonly intent_success_rate: number | null
}

/** La mesure complète d'une série. */
export interface SeriesMetrics {
  readonly periods: readonly PeriodMetrics[]
  readonly aggregates: CampaignAggregates
}

/**
 * Mesure une série de périodes : métriques par période et agrégats de campagne.
 *
 * SQUELETTE — lève `NotImplemented`. Le message porte le préfixe
 * `NOT_IMPLEMENTED`, seul moyen pour le lecteur d'un rapport d'échec de
 * distinguer « la règle n'est pas encore écrite » d'un plantage.
 */
export function computePeriodMetrics(_series: MetricSeriesInput, _options?: MetricOptions): SeriesMetrics {
  throw new NotImplemented('domain.computePeriodMetrics')
}
