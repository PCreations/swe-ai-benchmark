// ─────────────────────────────────────────────────────────────────────────────
// La SOURCE de scénario, et son contrôle de forme (T06, livrable « pack
// public/privé » de L205).
//
// CE QUE CE FICHIER DÉCIDE, ET SUR QUELLE AUTORITÉ.
//
//   L80  « Les JSON de domaine sont stricts : propriétés inconnues rejetées,
//        enums explicites, timestamps UTC ISO 8601, nombres non finis
//        interdits. » Le parcours ci-dessous est exhaustif : chaque objet
//        déclare ses champs, et tout champ non déclaré est un refus qui NOMME
//        le chemin exact. Un contrôle qui se contenterait de vérifier la
//        présence des champs attendus laisserait entrer une propriété
//        clandestine — donc une charge utile qu'aucune porte ne connaît.
//
//   L78  « Une période ajoute `period_index` commençant à 1. » Les périodes
//        sont donc ordonnées et contiguës : `periods[i].period_index === i+1`.
//
//   L88  `Requirement` : « id, version, capability_id, poids, date de
//        révélation, échéance, remplacement éventuel, criticité, source ». Les
//        neuf champs sont obligatoires. La DATE DE RÉVÉLATION n'est pas écrite
//        dans l'objet : c'est la période qui le CONTIENT, et c'est ce qui rend
//        D-2 observable — une exigence ne peut pas annoncer en P1 qu'elle
//        arrivera en P4, puisqu'elle n'existe pas avant la période qui la porte.
//
// LA CHARGE UTILE D'ÉVÉNEMENT EST OPAQUE, ET C'EST DÉLIBÉRÉ. `payload` porte
// des faits métier dont le contrat appartient au domaine du scénario, pas au
// compilateur : en fixer les clés ici reviendrait à écrire dans T06 le modèle
// de réservation de T07. Elle n'échappe pas pour autant au §E — elle est
// traversée pour y refuser tout nombre non fini et toute valeur que JSON ne
// sait pas porter.
// ─────────────────────────────────────────────────────────────────────────────
import { CORPUS_PROVENANCES, isMember } from '@bench/contracts'
import type { CorpusProvenance } from '@bench/contracts'
import { ScenarioRejection, childPath } from './errors.js'

/** Le schéma que la source doit déclarer. */
export const SCENARIO_SOURCE_SCHEMA = 'bench.scenario.source/1'

/**
 * §E : « enums explicites ». La criticité d'une exigence (L88) n'est pas
 * énumérée par le cahier ; elle l'est ici, faute de quoi « criticité » serait
 * une chaîne libre — et une énumération implicite est exactement ce que le §E
 * interdit.
 */
export const REQUIREMENT_CRITICALITIES = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'] as const
export type RequirementCriticality = (typeof REQUIREMENT_CRITICALITIES)[number]

export interface SourceEvent {
  readonly event_id: string
  readonly depends_on: readonly string[]
  readonly sentinel: string
  readonly payload: { readonly [k: string]: unknown }
}

export interface SourceRequirement {
  readonly requirement_id: string
  readonly version: number
  readonly key: string
  readonly capability_id: string
  readonly weight: number
  readonly due_at_period: number
  readonly replaces: string | null
  readonly criticality: RequirementCriticality
  readonly source: string
  readonly sentinel: string
}

export interface SourceReference {
  readonly fixture: string
  readonly path: string
}

export interface SourceAnswer {
  readonly question_id: string
  readonly answer: string
  readonly source_reference: SourceReference
  readonly sentinel: string
}

export interface SourcePeriod {
  readonly period_index: number
  readonly business_clock: string
  readonly sentinel: string
  readonly events: readonly SourceEvent[]
  readonly requirements: readonly SourceRequirement[]
  readonly requirement_withdrawals: readonly string[]
  readonly customer_answers: readonly SourceAnswer[]
}

export interface ScenarioSource {
  readonly schema: typeof SCENARIO_SOURCE_SCHEMA
  readonly scenario_id: string
  readonly corpus_provenance: CorpusProvenance
  readonly business_domain: string
  readonly period_count: number
  readonly periods: readonly SourcePeriod[]
}

/* ─────────────────────────────────────────────────────────── outils de forme */

type PlainObject = { readonly [k: string]: unknown }

const isPlainObject = (v: unknown): v is PlainObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const observedType = (v: unknown): string => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/** UTC ISO 8601, `Z` obligatoire : §E n'admet aucun autre décalage. */
const UTC_ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/

function requireObject(v: unknown, path: string, quoi: string): PlainObject {
  if (!isPlainObject(v)) {
    throw new ScenarioRejection('TYPE_MISMATCH', path, `${quoi} doit etre un objet, vu ${observedType(v)}`)
  }
  return v
}

function requireArray(v: unknown, path: string, quoi: string): readonly unknown[] {
  if (!Array.isArray(v)) {
    throw new ScenarioRejection('TYPE_MISMATCH', path, `${quoi} doit etre un tableau, vu ${observedType(v)}`)
  }
  return v
}

/** Les clés déclarées, et RIEN d'autre (L80 : « propriétés inconnues rejetées »). */
function requireExactKeys(o: PlainObject, declared: readonly string[], path: string): void {
  for (const k of declared) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) {
      throw new ScenarioRejection('MISSING_PROPERTY', childPath(path, k), 'propriete obligatoire absente')
    }
  }
  const known = new Set(declared)
  for (const k of Object.keys(o)) {
    if (!known.has(k)) {
      throw new ScenarioRejection('UNKNOWN_PROPERTY', childPath(path, k), 'propriete non declaree par le contrat')
    }
  }
}

function requireText(v: unknown, path: string): string {
  if (typeof v !== 'string') {
    throw new ScenarioRejection('TYPE_MISMATCH', path, `chaine attendue, vu ${observedType(v)}`)
  }
  if (v.length === 0) {
    throw new ScenarioRejection('EMPTY_STRING', path, 'chaine vide interdite')
  }
  return v
}

function requirePositiveInteger(v: unknown, path: string): number {
  if (typeof v !== 'number') {
    throw new ScenarioRejection('TYPE_MISMATCH', path, `entier attendu, vu ${observedType(v)}`)
  }
  if (!Number.isFinite(v)) {
    throw new ScenarioRejection('NON_FINITE_NUMBER', path, 'NaN et Infinity sont interdits')
  }
  if (!Number.isInteger(v) || v < 1) {
    throw new ScenarioRejection('TYPE_MISMATCH', path, 'entier strictement positif attendu')
  }
  return v
}

function requireUtcTimestamp(v: unknown, path: string): string {
  const s = requireText(v, path)
  if (!UTC_ISO8601.test(s) || !Number.isFinite(Date.parse(s))) {
    throw new ScenarioRejection('TIMESTAMP_NOT_UTC_ISO8601', path, 'timestamp UTC ISO 8601 attendu')
  }
  return s
}

/**
 * Traversée de la charge utile opaque : on n'y impose aucune clé, mais §E y
 * interdit les nombres non finis et tout ce que JSON ne porte pas.
 */
function requireJsonValue(v: unknown, path: string): void {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new ScenarioRejection('NON_FINITE_NUMBER', path, 'NaN et Infinity sont interdits')
    }
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      requireJsonValue(x, childPath(path, i))
    })
    return
  }
  if (isPlainObject(v)) {
    for (const [k, x] of Object.entries(v)) requireJsonValue(x, childPath(path, k))
    return
  }
  throw new ScenarioRejection('TYPE_MISMATCH', path, `valeur JSON attendue, vu ${observedType(v)}`)
}

/* ───────────────────────────────────────────────── parcours de la source */

const EVENT_KEYS = ['event_id', 'depends_on', 'sentinel', 'payload'] as const
const REQUIREMENT_KEYS = [
  'requirement_id',
  'version',
  'key',
  'capability_id',
  'weight',
  'due_at_period',
  'replaces',
  'criticality',
  'source',
  'sentinel',
] as const
const REFERENCE_KEYS = ['fixture', 'path'] as const
const ANSWER_KEYS = ['question_id', 'answer', 'source_reference', 'sentinel'] as const
const PERIOD_KEYS = [
  'period_index',
  'business_clock',
  'sentinel',
  'events',
  'requirements',
  'requirement_withdrawals',
  'customer_answers',
] as const
const SOURCE_KEYS = [
  'schema',
  'scenario_id',
  'corpus_provenance',
  'business_domain',
  'period_count',
  'periods',
] as const

function readEvent(v: unknown, path: string): SourceEvent {
  const o = requireObject(v, path, 'un evenement')
  requireExactKeys(o, EVENT_KEYS, path)
  const depends = requireArray(o.depends_on, childPath(path, 'depends_on'), 'depends_on').map((d, i) =>
    requireText(d, childPath(childPath(path, 'depends_on'), i)),
  )
  const payload = requireObject(o.payload, childPath(path, 'payload'), 'la charge utile')
  requireJsonValue(payload, childPath(path, 'payload'))
  return {
    event_id: requireText(o.event_id, childPath(path, 'event_id')),
    depends_on: depends,
    sentinel: requireText(o.sentinel, childPath(path, 'sentinel')),
    payload,
  }
}

function readRequirement(v: unknown, path: string, periodIndex: number): SourceRequirement {
  const o = requireObject(v, path, 'une exigence')
  requireExactKeys(o, REQUIREMENT_KEYS, path)
  const requirementId = requireText(o.requirement_id, childPath(path, 'requirement_id'))
  const version = requirePositiveInteger(o.version, childPath(path, 'version'))
  const key = requireText(o.key, childPath(path, 'key'))
  // La clé n'est pas un champ libre : elle est la CONCATÉNATION de l'id et de la
  // version. Sans ce contrôle, deux versions d'une même exigence pourraient
  // porter la même clé, et « désactiver la bonne version » (L207) n'aurait plus
  // de référent observable.
  if (key !== `${requirementId}@${String(version)}`) {
    throw new ScenarioRejection(
      'REQUIREMENT_KEY_MISMATCH',
      childPath(path, 'key'),
      `la cle doit etre "<requirement_id>@<version>", vue "${key}"`,
    )
  }
  const weight = requirePositiveInteger(o.weight, childPath(path, 'weight'))
  const due = requirePositiveInteger(o.due_at_period, childPath(path, 'due_at_period'))
  if (due < periodIndex) {
    throw new ScenarioRejection(
      'TYPE_MISMATCH',
      childPath(path, 'due_at_period'),
      'une echeance ne peut pas preceder la periode de revelation',
    )
  }
  const replacesRaw = o.replaces
  const replaces =
    replacesRaw === null ? null : requireText(replacesRaw, childPath(path, 'replaces'))
  if (!isMember(REQUIREMENT_CRITICALITIES, o.criticality)) {
    throw new ScenarioRejection(
      'ENUM_VALUE_UNKNOWN',
      childPath(path, 'criticality'),
      `criticite hors enum : ${REQUIREMENT_CRITICALITIES.join(', ')}`,
    )
  }
  return {
    requirement_id: requirementId,
    version,
    key,
    capability_id: requireText(o.capability_id, childPath(path, 'capability_id')),
    weight,
    due_at_period: due,
    replaces,
    criticality: o.criticality,
    source: requireText(o.source, childPath(path, 'source')),
    sentinel: requireText(o.sentinel, childPath(path, 'sentinel')),
  }
}

function readAnswer(v: unknown, path: string): SourceAnswer {
  const o = requireObject(v, path, 'une reponse client')
  requireExactKeys(o, ANSWER_KEYS, path)
  const refPath = childPath(path, 'source_reference')
  const ref = requireObject(o.source_reference, refPath, 'la reference de source')
  requireExactKeys(ref, REFERENCE_KEYS, refPath)
  return {
    question_id: requireText(o.question_id, childPath(path, 'question_id')),
    answer: requireText(o.answer, childPath(path, 'answer')),
    source_reference: {
      fixture: requireText(ref.fixture, childPath(refPath, 'fixture')),
      path: requireText(ref.path, childPath(refPath, 'path')),
    },
    sentinel: requireText(o.sentinel, childPath(path, 'sentinel')),
  }
}

function readPeriod(v: unknown, path: string, rank: number): SourcePeriod {
  const o = requireObject(v, path, 'une periode')
  requireExactKeys(o, PERIOD_KEYS, path)
  const index = requirePositiveInteger(o.period_index, childPath(path, 'period_index'))
  if (index !== rank) {
    throw new ScenarioRejection(
      'PERIOD_INDEX_NOT_SEQUENTIAL',
      childPath(path, 'period_index'),
      `les periodes commencent a 1 et sont contigues : ${String(rank)} attendu, ${String(index)} vu`,
    )
  }
  const eventsPath = childPath(path, 'events')
  const requirementsPath = childPath(path, 'requirements')
  const withdrawalsPath = childPath(path, 'requirement_withdrawals')
  const answersPath = childPath(path, 'customer_answers')
  return {
    period_index: index,
    business_clock: requireUtcTimestamp(o.business_clock, childPath(path, 'business_clock')),
    sentinel: requireText(o.sentinel, childPath(path, 'sentinel')),
    events: requireArray(o.events, eventsPath, 'events').map((e, i) =>
      readEvent(e, childPath(eventsPath, i)),
    ),
    requirements: requireArray(o.requirements, requirementsPath, 'requirements').map((r, i) =>
      readRequirement(r, childPath(requirementsPath, i), index),
    ),
    requirement_withdrawals: requireArray(
      o.requirement_withdrawals,
      withdrawalsPath,
      'requirement_withdrawals',
    ).map((w, i) => requireText(w, childPath(withdrawalsPath, i))),
    customer_answers: requireArray(o.customer_answers, answersPath, 'customer_answers').map((a, i) =>
      readAnswer(a, childPath(answersPath, i)),
    ),
  }
}

/**
 * Lit une source de scénario en refusant tout ce que le §E refuse. Rend une
 * valeur TYPÉE : au-delà de ce point, plus aucune fonction du paquet n'a à se
 * demander si un champ existe.
 */
export function readScenarioSource(value: unknown): ScenarioSource {
  const o = requireObject(value, '', 'une source de scenario')
  requireExactKeys(o, SOURCE_KEYS, '')
  if (o.schema !== SCENARIO_SOURCE_SCHEMA) {
    throw new ScenarioRejection(
      'SCHEMA_UNKNOWN',
      '/schema',
      `schema attendu "${SCENARIO_SOURCE_SCHEMA}"`,
    )
  }
  if (!isMember(CORPUS_PROVENANCES, o.corpus_provenance)) {
    throw new ScenarioRejection(
      'ENUM_VALUE_UNKNOWN',
      '/corpus_provenance',
      `provenance hors enum : ${CORPUS_PROVENANCES.join(', ')}`,
    )
  }
  const periods = requireArray(o.periods, '/periods', 'periods').map((p, i) =>
    readPeriod(p, childPath('/periods', i), i + 1),
  )
  const declared = requirePositiveInteger(o.period_count, '/period_count')
  if (declared !== periods.length) {
    throw new ScenarioRejection(
      'PERIOD_COUNT_MISMATCH',
      '/period_count',
      `${String(declared)} declare, ${String(periods.length)} periodes presentes`,
    )
  }
  return {
    schema: SCENARIO_SOURCE_SCHEMA,
    scenario_id: requireText(o.scenario_id, '/scenario_id'),
    corpus_provenance: o.corpus_provenance,
    business_domain: requireText(o.business_domain, '/business_domain'),
    period_count: declared,
    periods,
  }
}
