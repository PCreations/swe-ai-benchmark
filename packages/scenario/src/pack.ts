// ─────────────────────────────────────────────────────────────────────────────
// T06 — compilation des scénarios et contrôle de leur révélation (cahier L203
// à L210). Les quatre livrables de L205 sont ici, et chacun est un objet
// distinct plutôt qu'une intention :
//
//   PACK PUBLIC / PRIVÉ      `pack.public` ne porte que ce qu'un agent peut
//                            connaître sans rien apprendre du futur : l'identité
//                            du scénario et l'index de ses périodes. `pack.private`
//                            porte le contenu complet. La porte de révélation est
//                            la SEULE fonction qui lit `private`, et elle ne
//                            recopie jamais au-delà du curseur.
//   INDEX DE PÉRIODES        `pack.public.periods`, contigu depuis 1 (L78).
//   TABLE DE RÉPONSES CLIENT `pack.private.answers`, chaque entrée portant la
//                            période où elle est PUBLIÉE — celle qui la contient
//                            dans la source.
//   VERSIONNEMENT            `pack.private.periods[k].active_requirement_keys`,
//                            résolu à la compilation : remplacements et retraits
//                            appliqués période par période (L88, F-QUALITY L109,
//                            F-REGRESSION L129).
//
// ─────────────────────────────────────────────────────────────────────────────
// LA PORTE, ET POURQUOI ELLE EST POSITIONNELLE.
//
// `revealPeriod(pack, cible, curseur)` prend le curseur de révélation en
// TROISIÈME argument. Le cahier prescrit le refus (« lecture anticipée renvoie
// `NOT_RELEASED` », L207) mais ne nomme pas le canal par lequel la période
// courante est connue ; `acceptance/T06.spec.ts` §III fixe ce canal et
// `verification/mutants/T06.json` (T06.M2) en fait sa contre-épreuve. CURSEUR
// ABSENT = LECTURE À L'HEURE : un appel sans curseur demande la période cible
// telle qu'elle est disponible à cette période-là, ce qui ne révèle rien de
// postérieur. C'est le seul défaut admissible : prendre « tout est ouvert »
// comme défaut ferait de l'oubli d'un argument une fuite silencieuse.
//
// CE QUE LA RÉVÉLATION DE k CONTIENT, ET CE QU'ELLE NE CONTIENT PAS.
// Elle contient tout ce qui a été révélé JUSQU'À k inclus — un agent ne perd
// pas ce qu'il a déjà vu. Elle ne contient RIEN de k+1 : ni événement, ni
// réponse métier, ni exigence (D-2, L63). Les deux moitiés se tiennent : une
// révélation vide respecterait la seconde sans servir à rien, et
// verification/cases.lock.json classe A1 `absence` précisément pour l'exiger.
//
// AUCUN IMPORT DE NODE. Ce paquet compile sous `types: []` : ni `node:fs`, ni
// `node:child_process` n'y sont accessibles. La porte ne peut donc pas être
// contournée par un canal latéral depuis l'intérieur du paquet — c'est une
// propriété du typage, pas une promesse.
// ─────────────────────────────────────────────────────────────────────────────
import { ScenarioRejection, childPath } from './errors.js'
import { readScenarioSource } from './source.js'
import type { SourceReference, SourceRequirement } from './source.js'
import { checkEventGraph } from './graph.js'
import type { PlacedEvent } from './graph.js'

export const SCENARIO_PACK_SCHEMA = 'bench.scenario.pack/1'
export const PERIOD_REVEAL_SCHEMA = 'bench.scenario.reveal/1'
export const CUSTOMER_ANSWER_SCHEMA = 'bench.scenario.customer-answer/1'

/** Un événement compilé. `revealed_at_period` est la période qui le CONTIENT. */
export interface CompiledEvent {
  readonly event_id: string
  readonly revealed_at_period: number
  readonly depends_on: readonly string[]
  readonly sentinel: string
  readonly payload: { readonly [k: string]: unknown }
}

/** Une exigence compilée : les neuf champs de L88, plus sa date de révélation. */
export interface CompiledRequirement extends SourceRequirement {
  readonly revealed_at_period: number
}

/** Une entrée de la table de réponses client, avec sa période de publication. */
export interface CompiledAnswer {
  readonly question_id: string
  readonly answer: string
  readonly released_at_period: number
  readonly source_reference: SourceReference
  readonly sentinel: string
}

/** L'index de périodes — public : il dit COMBIEN, jamais QUOI. */
export interface PublicPeriodEntry {
  readonly period_index: number
}

export interface ScenarioPackPublic {
  readonly scenario_id: string
  readonly business_domain: string
  readonly period_count: number
  readonly periods: readonly PublicPeriodEntry[]
}

/** Une période compilée, côté privé : son contenu et son état d'exigences. */
export interface PrivatePeriod {
  readonly period_index: number
  readonly business_clock: string
  readonly sentinel: string
  readonly event_ids: readonly string[]
  readonly requirement_keys: readonly string[]
  readonly requirement_withdrawals: readonly string[]
  readonly question_ids: readonly string[]
  readonly active_requirement_keys: readonly string[]
}

export interface ScenarioPackPrivate {
  readonly periods: readonly PrivatePeriod[]
  readonly events: readonly CompiledEvent[]
  readonly requirements: readonly CompiledRequirement[]
  readonly answers: readonly CompiledAnswer[]
}

export interface ScenarioPack {
  readonly schema: typeof SCENARIO_PACK_SCHEMA
  readonly scenario_id: string
  readonly corpus_provenance: string
  readonly business_domain: string
  readonly period_count: number
  readonly public: ScenarioPackPublic
  readonly private: ScenarioPackPrivate
}

/** Ce que la porte remet à l'agent pour une période. */
export interface PeriodReveal {
  readonly schema: typeof PERIOD_REVEAL_SCHEMA
  readonly scenario_id: string
  readonly business_domain: string
  readonly period_index: number
  readonly released_through: number
  readonly period_count: number
  readonly business_clock: string
  readonly period_sentinel: string
  readonly events: readonly CompiledEvent[]
  readonly customer_answers: readonly CompiledAnswer[]
  readonly active_requirements: readonly CompiledRequirement[]
}

/** Ce que le service client rend quand la question est couverte ET publiée. */
export interface CustomerAnswer {
  readonly schema: typeof CUSTOMER_ANSWER_SCHEMA
  readonly question_id: string
  readonly answer: string
  readonly released_at_period: number
  readonly source_reference: SourceReference
  readonly sentinel: string
}

/* ────────────────────────────────────────────────────────────── compilation */

/** Premier doublon d'une famille d'identifiants, refusé en nommant son chemin. */
function refuseDuplicate(seen: Set<string>, value: string, path: string, quoi: string): void {
  if (seen.has(value)) {
    throw new ScenarioRejection('DUPLICATE_ID', path, `${quoi} "${value}" apparait deux fois`)
  }
  seen.add(value)
}

/**
 * Compile une source de scénario en pack public/privé.
 *
 * L'ORDRE DES CONTRÔLES EST FAIL-CLOSED : forme (§E) d'abord, puis unicité des
 * identités, puis graphe des événements, puis versionnement des exigences.
 * Chacun suppose que le précédent a réussi — résoudre un graphe dont les
 * identifiants ne sont pas uniques n'aurait aucun sens, et un `Map` y écraserait
 * silencieusement un sommet.
 *
 * @throws ScenarioRejection — forme, identité, graphe ou versionnement.
 */
export function compileScenarioPack(source: unknown): ScenarioPack {
  const src = readScenarioSource(source)

  const events: CompiledEvent[] = []
  const placed: PlacedEvent[] = []
  const requirements: CompiledRequirement[] = []
  const answers: CompiledAnswer[] = []
  const vusEvenements = new Set<string>()
  const vusExigences = new Set<string>()
  const vusQuestions = new Set<string>()
  const vusSentinelles = new Set<string>()

  for (const period of src.periods) {
    const base = childPath('/periods', period.period_index - 1)
    refuseDuplicate(vusSentinelles, period.sentinel, childPath(base, 'sentinel'), 'la sentinelle')

    period.events.forEach((e, i) => {
      const path = childPath(childPath(base, 'events'), i)
      refuseDuplicate(vusEvenements, e.event_id, childPath(path, 'event_id'), 'l identifiant d evenement')
      refuseDuplicate(vusSentinelles, e.sentinel, childPath(path, 'sentinel'), 'la sentinelle')
      events.push({
        event_id: e.event_id,
        revealed_at_period: period.period_index,
        depends_on: e.depends_on,
        sentinel: e.sentinel,
        payload: e.payload,
      })
      placed.push({
        event_id: e.event_id,
        revealed_at_period: period.period_index,
        depends_on: e.depends_on,
        path,
      })
    })

    period.requirements.forEach((r, i) => {
      const path = childPath(childPath(base, 'requirements'), i)
      refuseDuplicate(vusExigences, r.key, childPath(path, 'key'), 'la cle d exigence')
      refuseDuplicate(vusSentinelles, r.sentinel, childPath(path, 'sentinel'), 'la sentinelle')
      requirements.push({ ...r, revealed_at_period: period.period_index })
    })

    period.customer_answers.forEach((a, i) => {
      const path = childPath(childPath(base, 'customer_answers'), i)
      refuseDuplicate(vusQuestions, a.question_id, childPath(path, 'question_id'), 'la question')
      refuseDuplicate(vusSentinelles, a.sentinel, childPath(path, 'sentinel'), 'la sentinelle')
      answers.push({
        question_id: a.question_id,
        answer: a.answer,
        released_at_period: period.period_index,
        source_reference: a.source_reference,
        sentinel: a.sentinel,
      })
    })
  }

  checkEventGraph(src, placed)

  // ── versionnement : remplacements et retraits résolus PÉRIODE PAR PÉRIODE.
  //    « Remplacer une exigence désactive la bonne version au bon instant »
  //    (L207) : l'instant est la période qui porte la NOUVELLE version, et la
  //    version désactivée est celle que `replaces` nomme — jamais l'inverse.
  const actives = new Set<string>()
  const privatePeriods: PrivatePeriod[] = []
  for (const period of src.periods) {
    const base = childPath('/periods', period.period_index - 1)
    period.requirements.forEach((r, i) => {
      const path = childPath(childPath(base, 'requirements'), i)
      actives.add(r.key)
      if (r.replaces !== null) {
        if (r.replaces === r.key) {
          throw new ScenarioRejection(
            'REPLACED_REQUIREMENT_UNKNOWN',
            childPath(path, 'replaces'),
            'une exigence ne se remplace pas elle-meme',
          )
        }
        if (!actives.has(r.replaces)) {
          throw new ScenarioRejection(
            'REPLACED_REQUIREMENT_UNKNOWN',
            childPath(path, 'replaces'),
            `"${r.replaces}" n est pas active a la periode ${String(period.period_index)}`,
          )
        }
        actives.delete(r.replaces)
      }
    })
    period.requirement_withdrawals.forEach((w, i) => {
      const path = childPath(childPath(base, 'requirement_withdrawals'), i)
      if (!actives.has(w)) {
        throw new ScenarioRejection(
          'WITHDRAWN_REQUIREMENT_UNKNOWN',
          path,
          `"${w}" n est pas active a la periode ${String(period.period_index)}`,
        )
      }
      actives.delete(w)
    })
    privatePeriods.push({
      period_index: period.period_index,
      business_clock: period.business_clock,
      sentinel: period.sentinel,
      event_ids: period.events.map((e) => e.event_id),
      requirement_keys: period.requirements.map((r) => r.key),
      requirement_withdrawals: period.requirement_withdrawals,
      question_ids: period.customer_answers.map((a) => a.question_id),
      active_requirement_keys: [...actives].sort(),
    })
  }

  return {
    schema: SCENARIO_PACK_SCHEMA,
    scenario_id: src.scenario_id,
    corpus_provenance: src.corpus_provenance,
    business_domain: src.business_domain,
    period_count: src.period_count,
    public: {
      scenario_id: src.scenario_id,
      business_domain: src.business_domain,
      period_count: src.period_count,
      periods: src.periods.map((p) => ({ period_index: p.period_index })),
    },
    private: { periods: privatePeriods, events, requirements, answers },
  }
}

/* ─────────────────────────────────────────────── interrogation d'un pack */

const isPlainObject = (v: unknown): v is { readonly [k: string]: unknown } =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Un pack compilé, et pas autre chose — une source brute serait sans porte. */
function asPack(value: unknown): ScenarioPack {
  if (!isPlainObject(value) || value.schema !== SCENARIO_PACK_SCHEMA) {
    throw new ScenarioRejection(
      'PACK_MALFORMED',
      '/pack',
      `un pack compile "${SCENARIO_PACK_SCHEMA}" est attendu`,
    )
  }
  return value as unknown as ScenarioPack
}

/** Une période du scénario, ou un refus qui ne dit rien du contenu. */
function asPeriodIndex(pack: ScenarioPack, value: number, quoi: string): number {
  if (!Number.isInteger(value) || value < 1 || value > pack.period_count) {
    throw new ScenarioRejection(
      'PERIOD_UNKNOWN',
      `/${quoi}`,
      `periode hors de l index : 1..${String(pack.period_count)} attendu`,
    )
  }
  return value
}

/** Les exigences actives à la période donnée, dans l'ordre stable des clés. */
function activeAt(pack: ScenarioPack, period: number): readonly CompiledRequirement[] {
  const entry = pack.private.periods[period - 1]
  if (entry === undefined) {
    throw new ScenarioRejection('PACK_MALFORMED', '/private/periods', 'index de periodes incomplet')
  }
  const parCle = new Map<string, CompiledRequirement>()
  for (const r of pack.private.requirements) parCle.set(r.key, r)
  const out: CompiledRequirement[] = []
  for (const key of entry.active_requirement_keys) {
    const r = parCle.get(key)
    if (r === undefined) {
      throw new ScenarioRejection(
        'PACK_MALFORMED',
        '/private/requirements',
        `la cle active "${key}" n a pas d exigence`,
      )
    }
    out.push(r)
  }
  return out
}

/**
 * Rend la vue disponible de la période `target`, telle qu'un agent dont le
 * curseur de révélation est `cursor` a le droit de la lire.
 *
 * @throws ScenarioRejection `NOT_RELEASED` — `target > cursor` (L207).
 */
export function revealPeriod(pack: ScenarioPack, target: number, cursor?: number): PeriodReveal {
  const p = asPack(pack)
  const cible = asPeriodIndex(p, target, 'target')
  const curseur = cursor === undefined ? cible : cursor
  if (!Number.isInteger(curseur) || curseur < 1) {
    throw new ScenarioRejection('PERIOD_UNKNOWN', '/cursor', 'curseur de revelation entier >= 1 attendu')
  }
  if (cible > curseur) {
    // Le refus ne porte NI le contenu demandé, NI sa sentinelle : un refus
    // bavard apprendrait par le message ce que la porte devait cacher (D-2).
    throw new ScenarioRejection(
      'NOT_RELEASED',
      childPath('/periods', cible),
      'lecture anticipee : la periode demandee est posterieure au curseur de revelation',
    )
  }
  const entry = p.private.periods[cible - 1]
  if (entry === undefined) {
    throw new ScenarioRejection('PACK_MALFORMED', '/private/periods', 'index de periodes incomplet')
  }
  return {
    schema: PERIOD_REVEAL_SCHEMA,
    scenario_id: p.scenario_id,
    business_domain: p.business_domain,
    period_index: cible,
    released_through: cible,
    period_count: p.period_count,
    business_clock: entry.business_clock,
    period_sentinel: entry.sentinel,
    events: p.private.events.filter((e) => e.revealed_at_period <= cible),
    customer_answers: p.private.answers.filter((a) => a.released_at_period <= cible),
    active_requirements: activeAt(p, cible),
  }
}

/**
 * Répond à une question client posée à la période `period`.
 *
 * LES DEUX REFUS SONT DISTINCTS, ET NE SE SUBSTITUENT PAS L'UN À L'AUTRE :
 * `UNSPECIFIED` dit qu'aucune entrée de la table ne couvre la question — donc
 * qu'il n'y a RIEN à attendre ; `NOT_RELEASED` dit qu'une entrée existe mais
 * n'est pas encore publiée. Répondre `UNSPECIFIED` dans le second cas nierait
 * l'existence de la question, ce que le cahier n'autorise pas ; répondre
 * `NOT_RELEASED` dans le premier promettrait une réponse qui n'arrivera jamais.
 *
 * « SANS INVENTER DE RÈGLE » (L207) : aucune réponse n'est dérivée d'une entrée
 * voisine. La table est une TABLE — elle se lit, elle ne se calcule pas.
 *
 * @throws ScenarioRejection `UNSPECIFIED` ou `NOT_RELEASED` (L207).
 */
export function answerCustomerQuestion(
  pack: ScenarioPack,
  period: number,
  question: string,
): CustomerAnswer {
  const p = asPack(pack)
  const periode = asPeriodIndex(p, period, 'period')
  if (typeof question !== 'string' || question.length === 0) {
    throw new ScenarioRejection('TYPE_MISMATCH', '/question', 'identifiant de question non vide attendu')
  }
  const entry = p.private.answers.find((a) => a.question_id === question)
  if (entry === undefined) {
    throw new ScenarioRejection(
      'UNSPECIFIED',
      childPath('/customer_answers', question),
      'aucune entree de la table ne couvre cette question',
    )
  }
  if (entry.released_at_period > periode) {
    // Ni la réponse, ni sa sentinelle, ni la période de publication : la porte
    // du service client protège exactement ce que protège celle de révélation.
    throw new ScenarioRejection(
      'NOT_RELEASED',
      childPath('/customer_answers', question),
      'cette entree de la table n est pas publiee a la periode interrogee',
    )
  }
  return {
    schema: CUSTOMER_ANSWER_SCHEMA,
    question_id: entry.question_id,
    answer: entry.answer,
    released_at_period: entry.released_at_period,
    source_reference: entry.source_reference,
    sentinel: entry.sentinel,
  }
}

/**
 * Versions d'exigence actives à la période donnée — remplacements et retraits
 * résolus (L88, F-QUALITY L109, F-REGRESSION L129).
 *
 * @throws ScenarioRejection `PERIOD_UNKNOWN` — période hors de l'index.
 */
export function activeRequirements(
  pack: ScenarioPack,
  period: number,
): readonly CompiledRequirement[] {
  const p = asPack(pack)
  return activeAt(p, asPeriodIndex(p, period, 'period'))
}
