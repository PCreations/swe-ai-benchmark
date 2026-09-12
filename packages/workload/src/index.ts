// ─────────────────────────────────────────────────────────────────────────────
// @bench/workload — SQUELETTE de la génération et de l'exécution des intentions
// d'usage (cahier L219-L226, tâche T08).
//
// CE FICHIER N'IMPLÉMENTE RIEN, ET C'EST SON RÔLE.
//
// L'étage ROUGE exige que `acceptance/T08.spec.ts` échoue POUR LA RAISON
// ATTENDUE. `verification/runner/red.mjs` n'admet que deux formes de rouge —
// `ASSERTION_FAILED` et `STUB_NOT_IMPLEMENTED` — et refuse explicitement
// `MODULE_NOT_FOUND`, `TYPE_ERROR` et `SUITE_FAILED_TO_RUN` : « c'est la forme
// par défaut du TDD en monorepo TypeScript, elle ne dit rien de ce que le test
// vérifie ».
//
// Sans ce squelette, `packages/workload` n'existe pas : `specifiersFor('workload')`
// ne rend aucun spécificateur, `assertLoaded()` tombe sur
// « PAQUET-NON-CHARGEABLE » et les six cas ne prouvent que l'absence d'un
// répertoire. Avec lui, le paquet se charge, les cinq rôles se résolvent, la
// suite APPELLE réellement les exports, et chaque cas échoue sur ce qu'il
// OBSERVE.
//
// LES CINQ RÔLES, ET D'OÙ VIENNENT LEURS NOMS. Ils ne sont pas choisis ici :
// `acceptance/T08.spec.ts` §III les nomme (export PRIMAIRE + alias tolérés), et
// `verification/mutants/T08.json` reprend les six conventions d'appel telles
// quelles. Les noms primaires sont retenus, sans alias : un alias n'est une
// tolérance que du côté de la suite.
//
//   createBusinessClock({ start })        -> horloge métier ISOLÉE      (L221)
//   readBusinessClock(horloge)            -> instant métier UTC ISO     (L80)
//   advanceBusinessClock(horloge, delta)  -> horloge avancée            (L221)
//   generateIntentPlan(entrée)            -> plan d'usage seedé         (L221)
//   executeIntentPlan(plan, monde)        -> résultat d'exécution       (L221)
//
// POURQUOI `NotImplemented` DE `@bench/contracts`, ET PAS UN REFUS MAISON.
// Son message porte le préfixe `NOT_IMPLEMENTED`, que le lecteur d'un rapport
// d'échec distingue d'un refus métier. Le squelette ne doit surtout pas se
// faire passer pour la compétence qu'il ne contient pas : deux cas de T08 sont
// classés `absence` (A4, A5) et un troisième est une INVARIANCE (A1) —
// autant de cas qu'un stub complaisant verdirait à vide. Ici rien ne répond :
// aucune horloge n'est rendue, aucun plan n'est produit, aucun compteur n'est
// publié. Les six cas tombent sur `exigerAccepte`, c'est-à-dire sur une
// ASSERTION, jamais sur un import cassé.
//
// LE PÉRIMÈTRE QUE CE PAQUET S'INTERDIT. « Horloge métier isolée » (L221) et
// « séparations entre temps métier, attente technique et temps de calcul »
// (L225) : le temps métier de T08 ne peut pas venir de l'horloge système.
// `tsconfig.json` fixe `types: []` — ni `node:fs`, ni `node:http`, ni
// `node:timers` ne peuvent entrer ici sans faire échouer `tsc`. La seule
// dépendance déclarée est `@bench/contracts`.
//
// Tous les exports ci-dessous lèveront jusqu'à ce que T08 soit écrite.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/* ─────────────────────────────────────────────────────── horloge métier */

/**
 * Ouverture d'une horloge métier. `start` est un instant UTC ISO 8601 (L80) :
 * `acceptance/T08.spec.ts` y passe `valeurs.horloge_initiale.valeur` et
 * `valeurs.horloges_des_periodes.P3.valeur`, tous deux scellés dans
 * `acceptance/reference/F-RESERVATION.json`.
 */
export interface BusinessClockSetup {
  readonly start: string
}

/**
 * Une horloge métier. Chaque appel à `createBusinessClock` doit en rendre une
 * INDÉPENDANTE : c'est l'énoncé même de T08.A5 (« avancer le temps métier de A
 * ne change pas celui de B ») et le livrable « horloge métier isolée » de L221.
 */
export interface BusinessClock {
  readonly start: string
  readonly instant: string
}

/** Un delta d'avance, exprimé en MILLISECONDES de temps MÉTIER (L119). */
export type BusinessClockDelta = number | { readonly ms: number } | { readonly milliseconds: number }

/**
 * Ouvre une horloge métier isolée à l'instant `start` (L221).
 *
 * @throws NotImplemented tant que T08 n'est pas écrite.
 */
export function createBusinessClock(setup: BusinessClockSetup): BusinessClock {
  void setup
  throw new NotImplemented('workload.createBusinessClock')
}

/**
 * Rend l'instant métier courant de l'horloge, en UTC ISO 8601 (L80).
 *
 * @throws NotImplemented tant que T08 n'est pas écrite.
 */
export function readBusinessClock(clock: BusinessClock): string {
  void clock
  throw new NotImplemented('workload.readBusinessClock')
}

/**
 * Avance l'horloge de `delta` millisecondes de temps MÉTIER et rend l'horloge
 * avancée. La milliseconde est l'unité du cahier, qui oppose `12:00:00Z` à
 * `12:00:00.001Z` (L119).
 *
 * @throws NotImplemented tant que T08 n'est pas écrite.
 */
export function advanceBusinessClock(clock: BusinessClock, delta: BusinessClockDelta): BusinessClock {
  void clock
  void delta
  throw new NotImplemented('workload.advanceBusinessClock')
}

/* ─────────────────────────────────────────────── plan d'usage et intentions */

/**
 * Un usage du CATALOGUE que le scénario offre. `requires` est la liste des
 * handles externes dont l'usage a besoin, `produces` celui qu'il crée (ou
 * `null`). §F fixe le NOMBRE d'intentions offertes, jamais leur nature :
 * F-QUALITY inscrit « la nature des intentions derrière les cardinaux » dans
 * `non_fixe_par_le_cahier`. Le catalogue est donc une ENTRÉE.
 */
export interface UsageTemplate {
  readonly id: string
  readonly operation: string
  readonly requires: readonly string[]
  readonly produces: string | null
  readonly kind?: string
  readonly tenant?: string
  readonly actor?: string
}

/** Les handles que le candidat a DÉJÀ créés (L223). */
export interface CandidateState {
  readonly created: readonly string[]
}

/**
 * Entrée du générateur de plan. Objet PLAT et STRICT (L80 : « propriétés
 * inconnues rejetées »). `workers` est une option d'EXÉCUTION : T08.A1 affirme
 * que le plan n'en dépend PAS.
 */
export interface IntentPlanInput {
  readonly scenario: string
  readonly seed: string
  readonly tenant: string
  readonly actors: readonly string[]
  readonly usages: readonly UsageTemplate[]
  readonly candidate_state: CandidateState
  readonly clock: BusinessClock
  readonly workers?: number
}

/**
 * Une intention. Contrat `Intent` du §E (L88) : « id stable, acteur externe,
 * locataire, instant métier, opération, arguments, cible métier attendue ».
 * L'`at` vient de l'horloge MÉTIER fournie, jamais de l'horloge système.
 */
export interface Intent {
  readonly id: string
  readonly usage: string
  readonly operation: string
  readonly actor: string
  readonly tenant: string
  readonly at: string
  readonly requires: readonly string[]
  readonly produces: string | null
}

/** Le plan rendu par le générateur : les intentions OFFERTES (L95, L225). */
export interface IntentPlan {
  readonly scenario: string
  readonly seed: string
  readonly intents: readonly Intent[]
}

/**
 * Produit le plan d'usage seedé du scénario (L221). Le plan ne dépend ni du
 * nombre de workers ni de l'état du candidat : L223 et L225.
 *
 * @throws NotImplemented tant que T08 n'est pas écrite.
 */
export function generateIntentPlan(input: IntentPlanInput): IntentPlan {
  void input
  throw new NotImplemented('workload.generateIntentPlan')
}

/* ────────────────────────────────────────────── exécution du plan d'usage */

/** Ce que le MONDE rend pour une intention qui lui est soumise. */
export interface WorldReply {
  readonly ok: boolean
  readonly external_id?: string
  readonly denied?: boolean
  readonly code?: string
}

/** Le monde contre lequel un plan s'exécute : l'application témoin candidate. */
export type World = (intent: Intent) => WorldReply | Promise<WorldReply>

/**
 * L'issue d'une intention. Une intention dont une référence externe n'a pas pu
 * être résolue est NON SERVIE — elle reste présente, et le monde n'est pas
 * appelé pour elle (L67 invariant D-5, L223, L225).
 */
export interface IntentOutcome {
  readonly id: string
  readonly usage: string
  readonly status: string
  readonly external_id: string | null
  readonly code: string | null
}

/**
 * Compteurs agrégés PUBLIÉS par l'implémentation. T08.A4 porte sur le COMPTAGE
 * lui-même : la suite les LIT, elle ne les recalcule jamais.
 */
export interface IntentExecutionCounters {
  readonly business: { readonly offered: number; readonly served: number; readonly failed: number }
  readonly compliance: { readonly count: number; readonly denied: number }
}

/** Le résultat d'une exécution : les issues, et les compteurs agrégés. */
export interface IntentExecutionResult {
  readonly outcomes: readonly IntentOutcome[]
  readonly counters: IntentExecutionCounters
}

/**
 * Exécute le plan RENDU PAR LE GÉNÉRATEUR contre le monde fourni, en résolvant
 * les identifiants externes que les intentions antérieures ont réellement
 * produits (L221).
 *
 * @throws NotImplemented tant que T08 n'est pas écrite.
 */
export function executeIntentPlan(
  plan: IntentPlan,
  world: World,
): Promise<IntentExecutionResult> {
  void plan
  void world
  throw new NotImplemented('workload.executeIntentPlan')
}
