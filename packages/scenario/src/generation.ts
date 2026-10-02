// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — fabrique de scénarios via modèle, sans auto-certification
// libre (cahier L405-L414, tâche T29).
//
// ÉTAGE VERT. Noms et formes FIXÉS PAR `acceptance/T29.spec.ts` (section III
// de son en-tête) — le cahier ne nomme aucun export pour ce générateur,
// exactement comme pour les connecteurs de T18/T19/T28 avant lui. Noms
// primaires sans alias :
//
//   generateScenarioFromModel(request)   générateur + parser + DSL + qualif. (L407)
//   buildRevelationPackage(input)        paquet de révélation du générateur  (L409, L63)
//
// L'AUTO-CERTIFICATION LIBRE QUE LE TITRE INTERDIT. `generateScenarioFromModel`
// ne redéclare PAS le pipeline de qualification : il importe `qualifyScenario`
// de `@bench/evaluation` (T10, déjà prouvé) et le REJOUE sur le `scenario`
// qu'il vient de compiler — jamais une auto-déclaration de son propre champ
// `qualification`. Un scénario que ce fichier compilerait et déclarerait
// « qualifié » sans que l'oracle indépendant en convienne serait exactement
// le défaut que le titre de la tâche nomme. `@bench/evaluation` est donc une
// dépendance déclarée de `package.json`, comme `@bench/oracle` l'est déjà.
//
// TROIS GARDES DISTINCTES, DANS CET ORDRE, SUR LE DOCUMENT DSL ÉCRIT PAR LE
// MODÈLE (`bench.scenario.dsl/1`) :
//   1. SOURCES CITÉES — chaque `cited_sources[i]` doit figurer dans
//      `available_sources` (L409 : « paquets explicitement disponibles, pas
//      récupérés dans des comptes privés supposés accessibles »). Un manque
//      REFUSE immédiatement l'appel entier (`SOURCE_UNVERIFIED`, L411) : ce
//      n'est pas une propriété stochastique du DSL, donc pas un motif de
//      nouvelle tentative.
//   2. VOCABULAIRE — `rule.operation` doit valoir `reserve` ou `cancel`
//      (vocabulaire déjà fixé côté oracle, T10). Rien en aval ne fait cette
//      vérification à la place de ce fichier : le pipeline de T10 normalise
//      silencieusement une opération inconnue vers `reserve`, ce qui est son
//      droit en tant que CONTRAT métier, pas une garde de FORME du DSL.
//   3. CYCLE — `depends_on` ne referme aucun circuit entre `rule_id`.
// Les règles qui passent ces trois gardes sont compilées en `steps`
// (`depends_on` consommé à la compilation, jamais transmis à l'oracle) puis
// SOUMISES à `qualifyScenario` : une contradiction avec le contrat met le
// scénario en quarantaine, exactement comme un cycle ou une opération hors
// DSL — ce sont les trois défauts de L411, chacun retenté indépendamment
// jusqu'à `max_attempts` (A6).
//
// `manifest_hash` est `canonicalDigest` (`@bench/contracts`, déjà prouvé par
// T02) du DOCUMENT DSL ACCEPTÉ tel que `JSON.parse` l'a rendu : les clés sont
// triées récursivement par la canonicalisation elle-même (L82), donc un
// réordonnancement des clés source ne change jamais le hash, et aucun
// horodatage technique n'est jamais mêlé aux octets hachés.
// ─────────────────────────────────────────────────────────────────────────────
import type { CanonicalValue } from '@bench/contracts'
import { canonicalDigest } from '@bench/contracts'
import { qualifyScenario } from '@bench/evaluation'
import type { ScenarioQualificationReport } from '@bench/evaluation'

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

const VOCABULAIRE_OPERATIONS = ['reserve', 'cancel']

function estEntierOuNombre(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Garde de FORME minimale : un document mal formé n'est ni un cycle ni une contradiction. */
function estDocumentBienForme(v: unknown): v is ScenarioDslDocument {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  if (typeof o['scenario_id'] !== 'string' || o['scenario_id'].length === 0) return false
  if (typeof o['tenant'] !== 'string' || o['tenant'].length === 0) return false
  if (typeof o['business_clock'] !== 'string' || o['business_clock'].length === 0) return false
  if (!Array.isArray(o['slots'])) return false
  if (!Array.isArray(o['rules'])) return false
  for (const s of o['slots']) {
    if (s === null || typeof s !== 'object') return false
    const slot = s as Record<string, unknown>
    if (typeof slot['slot_id'] !== 'string' || typeof slot['starts_at'] !== 'string') return false
    if (!estEntierOuNombre(slot['capacity'])) return false
  }
  for (const r of o['rules']) {
    if (r === null || typeof r !== 'object') return false
    const rule = r as Record<string, unknown>
    if (typeof rule['rule_id'] !== 'string' || rule['rule_id'].length === 0) return false
    if (typeof rule['at'] !== 'string') return false
    if (typeof rule['operation'] !== 'string') return false
    if (typeof rule['actor'] !== 'string') return false
    if (typeof rule['slot'] !== 'string') return false
    if (!estEntierOuNombre(rule['sequence'])) return false
    const expect = rule['expect']
    if (expect === null || typeof expect !== 'object' || typeof (expect as Record<string, unknown>)['outcome'] !== 'string') {
      return false
    }
    if (!Array.isArray(rule['depends_on'])) return false
  }
  return true
}

/**
 * Détecte un cycle dans `depends_on` entre `rule_id` du document DSL — même
 * méthode que `checkEventGraph` (graph.ts, T06) : épluchage topologique, puis
 * une marche depuis un sommet non épluché pour ÉNUMÉRER le cycle concret
 * plutôt que de nommer tout ce qui en descend.
 */
function detecterCycle(rules: readonly ScenarioDslRule[]): readonly string[] | null {
  const parId = new Map<string, ScenarioDslRule>()
  for (const r of rules) parId.set(r.rule_id, r)

  const resolu = new Set<string>()
  let progresse = true
  while (progresse) {
    progresse = false
    for (const r of rules) {
      if (resolu.has(r.rule_id)) continue
      if (r.depends_on.every((d) => resolu.has(d) || !parId.has(d))) {
        resolu.add(r.rule_id)
        progresse = true
      }
    }
  }
  const bloques = rules.filter((r) => !resolu.has(r.rule_id))
  if (bloques.length === 0) return null

  const depart = bloques[0]
  if (depart === undefined) return bloques.map((r) => r.rule_id)
  const chemin: string[] = []
  const rang = new Map<string, number>()
  let courant: ScenarioDslRule | undefined = depart
  while (courant !== undefined) {
    const deja = rang.get(courant.rule_id)
    if (deja !== undefined) return [...chemin.slice(deja), courant.rule_id]
    rang.set(courant.rule_id, chemin.length)
    chemin.push(courant.rule_id)
    const suivantId: string | undefined = courant.depends_on.find((d) => parId.has(d) && !resolu.has(d))
    courant = suivantId === undefined ? undefined : parId.get(suivantId)
  }
  return bloques.map((r) => r.rule_id)
}

/** Compile les règles ACCEPTÉES en `steps` — `depends_on` n'y figure plus (convention 3). */
function compilerScenario(doc: ScenarioDslDocument): Record<string, unknown> {
  return {
    schema: 'bench.qualification.scenario/1',
    scenario_id: doc.scenario_id,
    tenant: doc.tenant,
    business_clock: doc.business_clock,
    slots: doc.slots.map((s) => ({ slot_id: s.slot_id, capacity: s.capacity, starts_at: s.starts_at })),
    steps: [...doc.rules]
      .sort((a, b) => a.sequence - b.sequence)
      .map((r) => ({
        step_id: r.rule_id,
        at: r.at,
        operation: r.operation,
        actor: r.actor,
        slot: r.slot,
        sequence: r.sequence,
        expect: { outcome: r.expect.outcome },
      })),
  }
}

function estQuarantaine(rapport: ScenarioQualificationReport): boolean {
  return rapport.quarantined === true
}

/** Refus d'une tentative donnée — compte vers `attempts`, éligible à une nouvelle tentative. */
function refusTentative(
  reason: string,
  tentative: number,
  coutParTentative: bigint,
  quarantined: boolean,
): ScenarioGenerationRefusal {
  return {
    ok: false,
    reason,
    quarantined,
    attempts: tentative,
    total_cost_micro_usd: (coutParTentative * BigInt(tentative)).toString(),
  }
}

/**
 * Génère un scénario DSL via modèle : tire une réponse (`draw_model_response`),
 * parse le DOCUMENT DSL, vérifie que chaque source citée figure dans
 * `available_sources` (sinon `SOURCE_UNVERIFIED`, L411, refus immédiat — pas
 * de nouvelle tentative), détecte cycle et opération hors vocabulaire (L411),
 * compile les règles acceptées en `steps` et les soumet à `qualifyScenario`
 * (T10, indépendant — jamais réimplémenté ici) avant d'accepter ou de mettre
 * en quarantaine. Une sortie rejetée (cycle, hors DSL ou contradiction avec
 * l'oracle) peut être retirée jusqu'à `max_attempts` fois, pas au-delà (A6) :
 * c'est le COMPTEUR d'appels à `draw_model_response`, pas l'épuisement d'un
 * tableau fourni par l'appelant, qui arrête la boucle.
 */
export async function generateScenarioFromModel(
  request: ScenarioGenerationRequest,
): Promise<ScenarioGenerationResult> {
  const maxAttempts = request.max_attempts
  const coutParTentative = BigInt(request.cost_per_attempt_micro_usd)
  let dernierRefus: ScenarioGenerationRefusal | null = null

  for (let tentative = 1; tentative <= maxAttempts; tentative += 1) {
    const reponse = request.draw_model_response()

    if (reponse === undefined) {
      dernierRefus = refusTentative(
        `AUCUNE_REPONSE tentative ${String(tentative)}/${String(maxAttempts)} : draw_model_response n'a rien rendu`,
        tentative,
        coutParTentative,
        false,
      )
      continue
    }

    let brut: unknown
    try {
      brut = JSON.parse(reponse.text)
    } catch (e) {
      dernierRefus = refusTentative(
        `DSL_MALFORME tentative ${String(tentative)}/${String(maxAttempts)} : JSON invalide (${(e as Error).message})`,
        tentative,
        coutParTentative,
        false,
      )
      continue
    }

    if (!estDocumentBienForme(brut)) {
      dernierRefus = refusTentative(
        `DSL_MALFORME tentative ${String(tentative)}/${String(maxAttempts)} : document bench.scenario.dsl/1 invalide`,
        tentative,
        coutParTentative,
        false,
      )
      continue
    }
    const doc = brut

    // (1) SOURCES CITÉES — refus immédiat, hors boucle de régénération : ce
    //     n'est pas un défaut stochastique du DSL, c'est une citation non
    //     vérifiable (L409, L411).
    const sourceManquante = reponse.cited_sources.find((s) => !request.available_sources.includes(s))
    if (sourceManquante !== undefined) {
      return refusTentative(
        `SOURCE_UNVERIFIED : source citee ${JSON.stringify(sourceManquante)} absente des sources disponibles ` +
          `[${request.available_sources.join(', ')}]`,
        tentative,
        coutParTentative,
        false,
      )
    }

    // (2) CYCLE.
    const cycle = detecterCycle(doc.rules)
    if (cycle !== null) {
      dernierRefus = refusTentative(
        `QUARANTAINE cycle detecte entre regles ${cycle.join(' -> ')} : depends_on referme un circuit`,
        tentative,
        coutParTentative,
        true,
      )
      continue
    }

    // (3) VOCABULAIRE — propre à T29 : `qualifyScenario` (T10) normalise une
    //     opération inconnue vers `reserve` en tant que CONTRAT métier ; rien
    //     en aval ne la refuserait donc à sa place.
    const horsDsl = doc.rules.find((r) => !VOCABULAIRE_OPERATIONS.includes(r.operation))
    if (horsDsl !== undefined) {
      dernierRefus = refusTentative(
        `QUARANTAINE operation hors DSL : la regle ${horsDsl.rule_id} porte l'operation ` +
          `${JSON.stringify(horsDsl.operation)}, ni reserve ni cancel`,
        tentative,
        coutParTentative,
        true,
      )
      continue
    }

    // (4) QUALIFICATION INDÉPENDANTE — jamais une auto-déclaration.
    const scenario = compilerScenario(doc)
    const qualification = qualifyScenario(scenario)
    if (estQuarantaine(qualification)) {
      dernierRefus = refusTentative(
        `QUARANTAINE contradiction avec l'oracle : ${qualification.reason ?? 'raison absente du rapport T10'}`,
        tentative,
        coutParTentative,
        true,
      )
      continue
    }

    return {
      ok: true,
      scenario,
      qualification,
      manifest_hash: canonicalDigest(doc as unknown as CanonicalValue),
      attempts: tentative,
      total_cost_micro_usd: (coutParTentative * BigInt(tentative)).toString(),
    }
  }

  return (
    dernierRefus ?? {
      ok: false,
      reason: `TENTATIVES_EPUISEES : max_attempts=${String(maxAttempts)} atteint sans reponse exploitable`,
      attempts: maxAttempts,
      total_cost_micro_usd: (coutParTentative * BigInt(maxAttempts)).toString(),
    }
  )
}

/**
 * Construit le paquet de révélation remis au modèle générateur pour
 * `period_index` : filtre `rule_catalog` par `reveal_period <= period_index`
 * (invariant D-2, cahier L63) — aucune règle d'une période strictement
 * postérieure n'y figure jamais.
 */
export function buildRevelationPackage(input: RevelationPackageInput): GenerationRevelationPackage {
  return {
    period_index: input.period_index,
    rules: input.rule_catalog.filter((r) => r.reveal_period <= input.period_index),
  }
}
