// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — fabrique de scénarios via modèle, sans auto-certification
// libre (cahier L405-L414, tâche T29).
//
// ÉTAGE ROUGE : aucune règle métier n'est écrite ici. Ni parsing du DSL, ni
// détection de cycle, ni vérification de sources citées, ni appel à l'oracle
// indépendant de T10, ni comptage de tentatives. Les deux rôles ci-dessous
// LÈVENT `NotImplemented` (@bench/contracts), message préfixé
// `NOT_IMPLEMENTED` que `verification/runner/red.mjs` sait lire.
//
// Noms et formes FIXÉS PAR `acceptance/T29.spec.ts` (section III de son
// en-tête) — le cahier ne nomme aucun export pour ce générateur, exactement
// comme pour les connecteurs de T18/T19/T28 avant lui. Noms primaires sans
// alias :
//
//   generateScenarioFromModel(request)   générateur + parser + DSL + qualif. (L407)
//   buildRevelationPackage(input)        paquet de révélation du générateur  (L409, L63)
//
// `generateScenarioFromModel` ne redéclare PAS le pipeline de qualification :
// à l'étage VERT, il importera `qualifyScenario` de `@bench/evaluation` (T10,
// déjà prouvé) et le rejouera sur le `scenario` qu'il compile — jamais une
// auto-déclaration de son propre champ `qualification`, ce qui est le titre
// même de la tâche. Rien de cela n'est câblé à cet étage : aucune dépendance
// supplémentaire n'est donc ajoutée à `package.json` pour l'instant.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/** Issue attendue d'une règle du DOCUMENT DSL (convention 1, section III). */
export interface ScenarioDslRuleExpect {
  readonly outcome: string
}

/** Règle du DOCUMENT DSL — vocabulaire `operation` déjà fixé par T10 (III.4). */
export interface ScenarioDslRule {
  readonly rule_id: string
  readonly at: string
  readonly operation: string
  readonly actor: string
  readonly slot: string
  readonly sequence: number
  readonly expect: ScenarioDslRuleExpect
  readonly depends_on: readonly string[]
}

/** Créneau du DOCUMENT DSL. */
export interface ScenarioDslSlot {
  readonly slot_id: string
  readonly capacity: number
  readonly starts_at: string
}

/**
 * Document `bench.scenario.dsl/1` — le texte que le modèle ÉCRIT
 * (`model_response.text`, sérialisé JSON), convention 1 de la section III de
 * `acceptance/T29.spec.ts`.
 */
export interface ScenarioDslDocument {
  readonly schema: string
  readonly scenario_id: string
  readonly tenant: string
  readonly business_clock: string
  readonly slots: readonly ScenarioDslSlot[]
  readonly rules: readonly ScenarioDslRule[]
}

/**
 * Réponse du modèle — FOURNIE PAR L'APPELANT (`draw_model_response`), jamais
 * un fournisseur réel (L15, substituable), convention 2.
 */
export interface ScenarioModelResponse {
  readonly text: string
  readonly cited_sources: readonly string[]
}

/** Requête de génération — `bench.scenario.generation.request/1`, convention 2. */
export interface ScenarioGenerationRequest {
  readonly schema: string
  readonly draw_model_response: () => ScenarioModelResponse | undefined
  readonly available_sources: readonly string[]
  readonly max_attempts: number
  readonly cost_per_attempt_micro_usd: string
}

/**
 * Pack rendu en cas de succès (convention 3). `scenario` est EXACTEMENT
 * `bench.qualification.scenario/1` (T10) : relu tel quel par
 * `qualifyScenario`, jamais une forme propre à T29.
 */
export interface ScenarioGenerationSuccess {
  readonly ok: true
  readonly scenario: Record<string, unknown>
  readonly qualification: unknown
  readonly manifest_hash: string
  readonly attempts: number
  readonly total_cost_micro_usd: string
}

/**
 * Refus — convention 4 : source citée non vérifiée (`SOURCE_UNVERIFIED`,
 * L411), quarantaine (`quarantined`, `reason` nommant la règle fautive), ou
 * tentatives épuisées (`attempts === max_attempts`).
 */
export interface ScenarioGenerationRefusal {
  readonly ok: false
  readonly reason: string
  readonly quarantined?: boolean
  readonly attempts?: number
  readonly total_cost_micro_usd?: string
}

export type ScenarioGenerationResult = ScenarioGenerationSuccess | ScenarioGenerationRefusal

/** Entrée du catalogue de règles remis à `buildRevelationPackage`, par période. */
export interface RevelationRuleCatalogEntry {
  readonly reveal_period: number
  readonly [key: string]: unknown
}

/** Entrée de `buildRevelationPackage` : catalogue complet + période courante. */
export interface RevelationPackageInput {
  readonly rule_catalog: readonly RevelationRuleCatalogEntry[]
  readonly period_index: number
}

/**
 * Paquet de révélation remis au MODÈLE générateur pour la période courante
 * (L409, invariant D-2 L63) : aucune règle de période strictement postérieure
 * n'y figure — même régle que `revealPeriod` pour le CANDIDAT, appliquée ici
 * à la révélation que T29 remet pendant la génération.
 */
export interface GenerationRevelationPackage {
  readonly period_index: number
  readonly rules: readonly RevelationRuleCatalogEntry[]
}

/**
 * Génère un scénario DSL via modèle : tire une réponse (`draw_model_response`),
 * parse le DOCUMENT DSL, vérifie que chaque source citée figure dans
 * `available_sources` (sinon `SOURCE_UNVERIFIED`, L411), détecte cycle et
 * opération hors vocabulaire (L411), compile les règles acceptées en `steps`
 * et les soumet à `qualifyScenario` (T10, indépendant — jamais réimplémenté
 * ici) avant d'accepter ou de mettre en quarantaine. Une sortie rejetée peut
 * être retirée jusqu'à `max_attempts` fois, pas au-delà (A6). Rien de tout
 * cela n'est écrit à cet étage.
 */
export function generateScenarioFromModel(
  request: ScenarioGenerationRequest,
): Promise<ScenarioGenerationResult> {
  void request
  throw new NotImplemented('scenario.generateScenarioFromModel')
}

/**
 * Construit le paquet de révélation remis au modèle générateur pour
 * `period_index` : filtre `rule_catalog` par `reveal_period <= period_index`
 * (invariant D-2, cahier L63). Rien de tout cela n'est écrit à cet étage.
 */
export function buildRevelationPackage(input: RevelationPackageInput): GenerationRevelationPackage {
  void input
  throw new NotImplemented('scenario.buildRevelationPackage')
}
