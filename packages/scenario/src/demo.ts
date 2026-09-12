// ─────────────────────────────────────────────────────────────────────────────
// T11 — LE PILOTE DE PÉRIODE SCRIPTÉ, et la trajectoire verticale en mémoire
// (cahier L245-L253).
//
// CE QUE CE FICHIER ASSEMBLE, ET CE QU'IL N'ÉCRIT PAS. L249 : « assembler
// révélation, décision de fixture, validation, usages et métriques sans dépendre
// encore de Temporal ni du stockage distribué ». Chacun de ces cinq mots a déjà
// son paquet, et le pilote les APPELLE :
//
//   révélation           `compileScenarioPack` / `revealPeriod` (T06, ce paquet)
//   décision de fixture  `demo-script.ts` — les entrées connues du §F, et
//                        l'application candidate scriptée de `demo-application.ts`
//   validation           `demo-controls.ts` — les contrôles métier NOMMÉS, qui
//                        comparent l'application au modèle indépendant (T07, T10)
//   usages               `generateIntentPlan` / `executeIntentPlan` (T08)
//   métriques            `computePeriodMetrics` (T04)
//
// Aucun Q, aucun R, aucun G, aucun statut de contrôle n'est écrit ici : tous
// sont CALCULÉS. C'est la condition pour que les douze mutants de
// verification/mutants/T11.json puissent faire mentir le pilote — une valeur
// recopiée survivrait à la perturbation qui la contredit.
//
// ────────────────────────────────────────────── DÉTERMINISME, ET SA FRONTIÈRE
// Deux exécutions des mêmes options doivent rendre le MÊME résultat canonique.
// Le pilote n'a donc aucune source de non-détermination dans la partie comparée :
// l'horloge est l'horloge MÉTIER du scénario (jamais l'horloge système), l'ordre
// du plan d'usage est seedé (T08), l'oracle est pur (T07), les métriques sont
// pures (T04).
//
// Deux métadonnées échappent à cette règle, et elles sont DÉCLARÉES volatiles
// (L559) plutôt que tues : `run_id` et `emitted_at`. Les déclarer est ce qui
// permet de les retirer avant comparaison ; ne PAS déclarer tout le reste est ce
// qui empêche la comparaison de se vider de son contenu.
//
// ──────────────────────────────────────── CE QUE CE JALON NE VALIDE PAS (L253)
// « Ce jalon ne valide ni persistence réelle ni isolation. Cette limite apparaît
// dans le résultat. » Elle y apparaît sous `limitations`, et le résultat porte
// en outre `cost_origin` : les dépenses publiées sont FICTIVES et archivées
// (L21), aucun appel fournisseur n'a été émis.
// ─────────────────────────────────────────────────────────────────────────────
import { canonicalDigest } from '@bench/contracts'
import { computePeriodMetrics } from '@bench/domain'
import type {
  MetricPeriod,
  MetricRequirement,
  PeriodMetrics,
  RetiredRequirement,
} from '@bench/domain'
import type { ReservationRecord } from '@bench/oracle'
import { createBusinessClock, executeIntentPlan, generateIntentPlan } from '@bench/workload'
import type { IntentInvocation, WorldReply } from '@bench/workload'

import { ScenarioRejection } from './errors.js'
import { compileScenarioPack, revealPeriod } from './pack.js'
import type { CompiledRequirement, ScenarioPack } from './pack.js'
import {
  DEMO_SCENARIO_ID,
  DEMO_SCENARIO_SOURCE,
  DEMO_VARIANTS,
  DEPLOYED_BY_VARIANT,
  RESERVATION_SETUP,
  SCRIPTED_HALT,
  SCRIPTED_PERIODS,
  SCRIPTED_SPEND,
  SLOT_ID,
  TENANT_ORIGIN,
} from './demo-script.js'
import type { DemoVariant, ScriptedPeriod } from './demo-script.js'
import { createReferenceModel, createScriptedApplication } from './demo-application.js'
import type { ReferenceModel, ScriptedApplication } from './demo-application.js'
import {
  CONTROL_BY_REQUIREMENT,
  CONTROL_IDS,
  evaluateControl,
  probeForeignTenant,
} from './demo-controls.js'
import type { ControlId, ControlOutcome, ControlStatus, ForeignReadProbe } from './demo-controls.js'

export const DEMO_RESULT_SCHEMA = 'bench.demo.result/1'

/** Le seul mode et le seul stockage que ce jalon sait jouer (L247). */
export const DEMO_MODE = 'recorded'
export const DEMO_STORAGE = 'memory'

/** La graine du flux `workload` pour cette démonstration (L82). */
const DEMO_SEED = 'T11-DEMO'

/** L'identité complète de la trajectoire démontrée (L78). */
const DEMO_IDENTITY = {
  campaign_id: 'CMP-T11-DEMO',
  parent_project_id: 'PRJ-RESERVATION',
  scenario_id: DEMO_SCENARIO_ID,
  configuration_id: 'CFG-RECORDED-MEMORY',
  repetition_id: 'REP-1',
  budget_id: 'BDG-T11-DEMO',
} as const

/**
 * L'origine des dépenses publiées.
 *
 * Le cahier ne fixe PAS l'énumération de `cost_origin` ; il fixe ce que cette
 * valeur doit dire en mode `recorded` : « réponses et coûts FICTIFS archivés »
 * (L21), « les coûts non encore exercés sont explicitement FICTIFS » (L253).
 * La valeur le dit donc en toutes lettres, plutôt que par un code dont il
 * faudrait connaître la table pour savoir qu'aucun fournisseur n'a été facturé.
 */
const DEMO_COST_ORIGIN = 'fictitious'

/** §H, L413 : la provenance du corpus reste synthétique ou hybride. */
const DEMO_CORPUS_PROVENANCE = 'synthetic'

/**
 * Les métadonnées explicitement volatiles (L559). Elles sont les SEULES que la
 * comparaison canonique a le droit d'ignorer : projet, scénario, configuration,
 * budget, répétition, période et résultat restent comparés.
 */
const VOLATILE_METADATA = ['run_id', 'emitted_at'] as const

/** La limite de ce jalon, telle que L253 exige qu'elle apparaisse au résultat. */
const DEMO_LIMITATIONS = [
  "Jalon T11 : demonstration de bout en bout du domaine, entierement en memoire. Ce jalon ne valide NI la persistence reelle (T12, T23) NI l'isolation (T20, T21) — il n'ouvre aucune base, aucun stockage d'objets et aucun conteneur.",
  "Les depenses publiees sont des couts FICTIFS archives par l'agent scripte (mode recorded) : aucun appel fournisseur n'a ete emis, et aucune facture reelle n'entre dans ce resultat.",
  "L'application candidate scriptee partage la machine a transitions de l'oracle metier : les controles publies detectent les ecarts que le scenario introduit, non l'independance de deux implementations.",
] as const

/* ───────────────────────────────────────────────────── options du pilote */

const DEMO_OPTION_KEYS = ['mode', 'storage', 'variant', 'emitted_at'] as const

/**
 * Convention d'appel du pilote : un objet PLAT, strict (L80).
 *
 * `mode` et `storage` reprennent littéralement les deux drapeaux de la commande
 * de L247. `variant` désigne la trajectoire jouée ; son absence vaut trajectoire
 * nominale. `emitted_at` rend l'horodatage d'émission INJECTABLE : le pilote ne
 * lit l'horloge système que faute de mieux, et jamais dans la partie comparée du
 * résultat.
 */
export interface DemoOptions {
  readonly mode: string
  readonly storage: string
  readonly variant?: string | undefined
  readonly emitted_at?: string | undefined
}

/* ─────────────────────────────────────────────────── formes du résultat */

/** Une exigence telle que la période la PUBLIE. */
export interface PublishedRequirement {
  readonly id: string
  readonly version: number
  readonly capability_id: string
  readonly weight: number
  readonly due_at_period: number
  readonly criticality: string
  readonly satisfied: boolean
  readonly control: string
}

/** Un fait métier du journal de la trajectoire. */
export interface BusinessFact {
  readonly period_index: number
  readonly intent_id: string
  readonly usage: string
  readonly operation: string
  readonly actor: string
  readonly tenant: string
  readonly slot: string
  readonly status: string
  readonly code: string | null
  readonly external_id: string | null
  readonly business_clock: string
}

/** L'historique métier accumulé, tel que la période le publie (D-1, L63). */
export interface BusinessHistory {
  readonly tenant: string
  readonly slot: string
  readonly facts: readonly BusinessFact[]
  readonly reservations: readonly ReservationRecord[]
}

/** Le résultat d'une période de la trajectoire (contrat `PeriodResult`, L95). */
export interface DemoPeriodResult {
  readonly period_index: number
  readonly phase: string
  readonly business_clock: string
  readonly attempt_outcome: string
  readonly deployment_coverage: string
  readonly requirements: readonly PublishedRequirement[]
  readonly replaced_requirements: readonly string[]
  readonly regressions: readonly string[]
  readonly new_regressions: readonly string[]
  readonly backlog: readonly string[]
  readonly Q: number | null
  readonly R: number | null
  readonly G: number
  readonly G_new: number
  readonly spend: string
  readonly intents_offered: number
  readonly intents_succeeded: number
  readonly period_controls: readonly ControlOutcome[]
  readonly cross_tenant_probe: ForeignReadProbe
  readonly business_history: BusinessHistory
}

/** Le résultat complet de la démonstration. */
export interface DemoResult {
  readonly schema: string
  readonly execution_mode: string
  readonly cost_origin: string
  readonly corpus_provenance: string
  readonly storage: string
  readonly variant: string
  readonly campaign_id: string
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
  readonly repetition_id: string
  readonly budget_id: string
  readonly run_id: string
  readonly emitted_at: string
  readonly volatile_metadata: readonly string[]
  readonly limitations: readonly string[]
  readonly controls: readonly ControlOutcome[]
  readonly periods: readonly DemoPeriodResult[]
  readonly aggregates: {
    readonly V: number | null
    readonly U: number | null
    readonly exposure: number
    readonly intent_success_rate: number | null
  }
  readonly spend_total: string
  readonly halt: { readonly after_period_index: number; readonly state: string | null } | null
}

/* ──────────────────────────────────────────────── lecture des options */

const isPlainObject = (v: unknown): v is { readonly [k: string]: unknown } =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

function readOptions(raw: unknown): {
  variant: DemoVariant
  emitted_at: string | null
} {
  if (!isPlainObject(raw)) {
    throw new ScenarioRejection('TYPE_MISMATCH', '/options', 'les options du pilote sont un objet plat')
  }
  for (const k of Object.keys(raw)) {
    if (!(DEMO_OPTION_KEYS as readonly string[]).includes(k)) {
      throw new ScenarioRejection('UNKNOWN_PROPERTY', `/options/${k}`, 'propriete non declaree par le contrat')
    }
  }
  if (raw['mode'] !== DEMO_MODE) {
    throw new ScenarioRejection(
      'ENUM_VALUE_UNKNOWN',
      '/options/mode',
      `ce jalon ne joue que le mode "${DEMO_MODE}" (L247) ; un mode "live" exige un fournisseur reel et sort de T11`,
    )
  }
  if (raw['storage'] !== DEMO_STORAGE) {
    throw new ScenarioRejection(
      'ENUM_VALUE_UNKNOWN',
      '/options/storage',
      `ce jalon ne joue que le stockage "${DEMO_STORAGE}" (L247) ; la persistance reelle est T12`,
    )
  }
  const rawVariant = raw['variant']
  let variant: DemoVariant = 'nominal'
  if (rawVariant !== undefined && rawVariant !== null) {
    if (typeof rawVariant !== 'string' || !(DEMO_VARIANTS as readonly string[]).includes(rawVariant)) {
      throw new ScenarioRejection(
        'ENUM_VALUE_UNKNOWN',
        '/options/variant',
        `variantes admises : ${DEMO_VARIANTS.join(', ')}`,
      )
    }
    variant = rawVariant as DemoVariant
  }
  const rawEmitted = raw['emitted_at']
  if (rawEmitted !== undefined && rawEmitted !== null && typeof rawEmitted !== 'string') {
    throw new ScenarioRejection('TYPE_MISMATCH', '/options/emitted_at', 'instant UTC ISO 8601 attendu')
  }
  return {
    variant,
    emitted_at: typeof rawEmitted === 'string' ? rawEmitted : null,
  }
}

/* ─────────────────────────────────────────────── pièces du pilote */

/** Les retraits PAR REMPLACEMENT révélés à cette période (L86, L187). */
function retiredAt(pack: ScenarioPack, periodIndex: number): RetiredRequirement[] {
  const out: RetiredRequirement[] = []
  const parCle = new Map<string, CompiledRequirement>()
  for (const r of pack.private.requirements) parCle.set(r.key, r)

  for (const r of pack.private.requirements) {
    if (r.revealed_at_period !== periodIndex || r.replaces === null) continue
    const ancienne = parCle.get(r.replaces)
    if (ancienne === undefined) continue
    out.push({
      id: ancienne.requirement_id,
      version: ancienne.version,
      replaced_by: { id: r.requirement_id, version: r.version },
    })
  }

  const entree = pack.private.periods[periodIndex - 1]
  if (entree !== undefined) {
    for (const cle of entree.requirement_withdrawals) {
      const retiree = parCle.get(cle)
      if (retiree === undefined) continue
      out.push({ id: retiree.requirement_id, version: retiree.version, replaced_by: null })
    }
  }
  return out
}

/** Le monde : ce que l'application candidate répond, et rien d'autre. */
function makeWorld(
  period: ScriptedPeriod,
  app: ScriptedApplication,
  model: ReferenceModel,
  clock: string,
  journal: BusinessFact[],
  admittedReserveKeys: string[],
): (invocation: IntentInvocation) => WorldReply {
  return (invocation: IntentInvocation): WorldReply => {
    const action = period.actions[invocation.usage]
    if (action === undefined) {
      return { ok: false, code: 'USAGE_SANS_ACTION_SCRIPTEE' }
    }

    if (action.kind === 'write') {
      // Le MODÈLE reçoit la même demande que l'application : c'est ce qui lui
      // permet, plus tard, de dire ce qui AURAIT dû être observé.
      const attendu = model.apply(action)
      if (attendu.ok && action.operation === 'reserve') {
        admittedReserveKeys.push(action.idempotency_key)
      }
      const vu = app.submit(action)
      journal.push({
        period_index: period.period_index,
        intent_id: invocation.id,
        usage: invocation.usage,
        operation: action.operation,
        actor: action.actor,
        tenant: action.tenant,
        slot: SLOT_ID,
        status: vu.ok ? 'ACCEPTED' : 'REFUSED',
        code: vu.code,
        external_id: vu.external_id,
        business_clock: clock,
      })
      return vu.ok
        ? { ok: true, external_id: vu.external_id ?? '' }
        : { ok: false, code: vu.code ?? 'SANS_CODE' }
    }

    const vu = app.read({ tenant: action.tenant, actor: action.actor })
    journal.push({
      period_index: period.period_index,
      intent_id: invocation.id,
      usage: invocation.usage,
      operation: 'read',
      actor: action.actor,
      tenant: action.tenant,
      slot: SLOT_ID,
      status: vu.ok ? 'ACCEPTED' : 'REFUSED',
      code: vu.code,
      external_id: null,
      business_clock: clock,
    })
    return vu.ok ? { ok: true } : { ok: false, code: vu.code ?? 'SANS_CODE' }
  }
}

/** La somme de dépenses entières, sans jamais additionner de flottants (D-9, L71). */
function sumIntegerStrings(values: readonly string[]): string {
  let total = 0n
  for (const v of values) total += BigInt(v)
  return total.toString()
}

/* ───────────────────────────────────────────────────────── le pilote */

/**
 * Joue la trajectoire verticale en mémoire et rend son résultat JSON (L247).
 *
 * @throws ScenarioRejection — options hors contrat (mode, stockage, variante).
 */
export async function runDemo(options: DemoOptions): Promise<DemoResult> {
  const { variant, emitted_at } = readOptions(options as unknown)

  const pack = compileScenarioPack(DEMO_SCENARIO_SOURCE)
  const app = createScriptedApplication(variant)
  const model = createReferenceModel()
  const deployed = DEPLOYED_BY_VARIANT[variant]

  const journal: BusinessFact[] = []
  const admittedReserveKeys: string[] = []

  const metricPeriods: MetricPeriod[] = []
  const perPeriodControls: ControlOutcome[][] = []
  const perPeriodProbes: ForeignReadProbe[] = []
  const perPeriodHistory: BusinessHistory[] = []
  const perPeriodIntents: { offered: number; succeeded: number }[] = []
  const revealedClocks: string[] = []

  for (const scripted of SCRIPTED_PERIODS) {
    const k = scripted.period_index

    // (1) RÉVÉLATION (T06) — le curseur vaut la période courante : rien de k+1
    //     n'est lisible (D-2, L63).
    const reveal = revealPeriod(pack, k, k)
    revealedClocks.push(reveal.business_clock)

    // (2) L'HORLOGE MÉTIER de la période, portée par le scénario révélé.
    app.advanceTo(reveal.business_clock)
    model.advanceTo(reveal.business_clock)

    // (2 bis) CE QUE LA RÉVÉLATION DÉCIDE. L'événement de P4 crée le locataire
    //         `other` (L119) ; avant lui, ce locataire n'existe pour personne.
    //         C'est ce qui fait que `isolation@1` est satisfaite en P3 puis
    //         violée en P4 sous la variante fautive (F-REGRESSION, L129), et non
    //         violée dès son entrée.
    for (const evenement of reveal.events) {
      if (evenement.revealed_at_period !== k) continue
      const cree = evenement.payload['created_tenant']
      if (typeof cree === 'string' && cree.length > 0) app.createTenant(cree)
    }

    // (3) LES USAGES (T08) — plan seedé, puis exécution contre l'application.
    const plan = generateIntentPlan({
      scenario: DEMO_SCENARIO_ID,
      seed: DEMO_SEED,
      tenant: TENANT_ORIGIN,
      actors: RESERVATION_SETUP.actors,
      slot: SLOT_ID,
      usages: scripted.usages,
      clock: createBusinessClock({ start: reveal.business_clock }),
    })
    const execution = await executeIntentPlan(
      plan,
      makeWorld(scripted, app, model, reveal.business_clock, journal, admittedReserveKeys),
    )
    perPeriodIntents.push({
      offered: execution.counters.business.offered,
      succeeded: execution.counters.business.served,
    })

    // (4) VALIDATION — un contrôle NOMMÉ par exigence active et due (T10, L241).
    const ctx = { app, model, admitted_reserve_keys: admittedReserveKeys }
    const outcomes: ControlOutcome[] = []
    const parControle = new Map<ControlId, ControlOutcome>()
    for (const exigence of reveal.active_requirements) {
      if (exigence.due_at_period > k) continue
      const controle = CONTROL_BY_REQUIREMENT[exigence.key]
      if (controle === undefined) continue
      const resultat = evaluateControl(controle, ctx)
      outcomes.push(resultat)
      parControle.set(controle, resultat)
    }
    perPeriodControls.push(outcomes)

    // La sonde intertenant est REJOUÉE pour être publiée en clair dans la
    // période : L123 veut le verdict inscrit, pas seulement compté.
    perPeriodProbes.push(probeForeignTenant(ctx).probe)

    // (5) LES MÉTRIQUES (T04) — ce que la période soumet au calcul. La
    //     satisfaction d'une exigence EST le statut de son contrôle.
    const requirements: MetricRequirement[] = reveal.active_requirements.map((r) => {
      const controle = CONTROL_BY_REQUIREMENT[r.key]
      const resultat = controle === undefined ? undefined : parControle.get(controle)
      return {
        id: r.requirement_id,
        version: r.version,
        capability_id: r.capability_id,
        weight: r.weight,
        revealed_at_period: r.revealed_at_period,
        due_at_period: r.due_at_period,
        criticality: r.criticality,
        source: r.source,
        // UNE EXIGENCE NE PEUT PAS ÊTRE SATISFAITE PAR UNE APPLICATION QUI
        // N'EST PAS DÉPLOYÉE. L121 : « un candidat SANS DÉPLOIEMENT sur les
        // quatre périodes conserve quatre lignes avec Q=0 et R=0 si les
        // exigences et usages y sont présents ». Le déploiement est donc une
        // condition NÉCESSAIRE, indépendante du verdict de chaque contrôle :
        // faire dépendre Q=0 du seul fait que six contrôles ont observé un
        // écart ferait remonter Q dès qu'un contrôle deviendrait permissif,
        // alors qu'il n'y a toujours rien de déployé à mesurer.
        satisfied: deployed && resultat !== undefined && resultat.status === 'PASS',
        assertions: controle === undefined ? [] : [controle],
      }
    })

    metricPeriods.push({
      period_index: k,
      duration: 1,
      requirements,
      retired: retiredAt(pack, k),
      intents_offered: execution.counters.business.offered,
      intents_succeeded: execution.counters.business.served,
    })

    // (6) L'HISTORIQUE MÉTIER accumulé — D-1 (L63) : l'état applicatif PERSISTE
    //     d'une période à l'autre, aucun retour à une base idéale.
    const lecture = app.read({ tenant: TENANT_ORIGIN })
    perPeriodHistory.push({
      tenant: TENANT_ORIGIN,
      slot: SLOT_ID,
      facts: journal.map((f) => ({ ...f })),
      reservations: lecture.ok ? lecture.records.map((r) => ({ ...r })) : [],
    })
  }

  const mesure = computePeriodMetrics({ periods: metricPeriods })
  const spend = SCRIPTED_SPEND[variant]

  const periods: DemoPeriodResult[] = metricPeriods.map((mp, i) => {
    const m = mesure.periods[i] as PeriodMetrics
    const clock = revealedClocks[i] ?? ''
    const requirements = mp.requirements.map((r) => {
      const cle = `${r.id}@${String(r.version)}`
      return {
        id: cle,
        version: r.version,
        capability_id: r.capability_id,
        weight: r.weight,
        due_at_period: r.due_at_period,
        criticality: r.criticality,
        satisfied: r.satisfied,
        control: CONTROL_BY_REQUIREMENT[cle] ?? 'aucun',
      }
    })
    return {
      period_index: mp.period_index,
      phase: 'COMPLETED',
      business_clock: clock,
      attempt_outcome: deployed ? 'SUCCESS' : 'FAILED',
      deployment_coverage: deployed ? 'ACCEPTED' : 'NO_DEPLOYMENT',
      requirements,
      replaced_requirements: m.replaced,
      regressions: m.regressions,
      new_regressions: m.new_regressions,
      backlog: m.backlog,
      Q: m.Q,
      R: m.R,
      G: m.G,
      G_new: m.G_new,
      spend: spend[i] ?? '0',
      intents_offered: perPeriodIntents[i]?.offered ?? 0,
      intents_succeeded: perPeriodIntents[i]?.succeeded ?? 0,
      period_controls: perPeriodControls[i] ?? [],
      cross_tenant_probe: perPeriodProbes[i] as ForeignReadProbe,
      business_history: perPeriodHistory[i] as BusinessHistory,
    }
  })

  // Le statut PUBLIÉ d'un contrôle nommé : violé s'il l'a été au moins une fois,
  // sinon le statut de sa dernière évaluation. Un contrôle jamais évalué ne
  // figure pas : nommer un contrôle sans l'exécuter serait un PASS sans
  // observation (§G, L139).
  const controls: ControlOutcome[] = []
  for (const id of CONTROL_IDS) {
    const evaluations = perPeriodControls.flat().filter((c) => c.id === id)
    if (evaluations.length === 0) continue
    const viole = evaluations.find((c) => c.status === 'VIOLATED')
    const retenu = viole ?? (evaluations[evaluations.length - 1] as ControlOutcome)
    const statut: ControlStatus = viole === undefined ? 'PASS' : 'VIOLATED'
    controls.push({ ...retenu, status: statut })
  }

  const emitted = emitted_at ?? new Date(Date.now()).toISOString()

  return {
    schema: DEMO_RESULT_SCHEMA,
    execution_mode: DEMO_MODE,
    cost_origin: DEMO_COST_ORIGIN,
    corpus_provenance: DEMO_CORPUS_PROVENANCE,
    storage: DEMO_STORAGE,
    variant,
    campaign_id: DEMO_IDENTITY.campaign_id,
    parent_project_id: DEMO_IDENTITY.parent_project_id,
    scenario_id: DEMO_IDENTITY.scenario_id,
    configuration_id: DEMO_IDENTITY.configuration_id,
    repetition_id: DEMO_IDENTITY.repetition_id,
    budget_id: DEMO_IDENTITY.budget_id,
    run_id: `RUN-${canonicalDigest({ emitted_at: emitted, variant }).slice(0, 16)}`,
    emitted_at: emitted,
    volatile_metadata: [...VOLATILE_METADATA],
    limitations: [...DEMO_LIMITATIONS],
    controls,
    periods,
    aggregates: mesure.aggregates,
    spend_total: sumIntegerStrings(spend),
    halt: SCRIPTED_HALT[variant],
  }
}
