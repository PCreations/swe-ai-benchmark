// ─────────────────────────────────────────────────────────────────────────────
// LE PIPELINE DE QUALIFICATION, VOLET SCÉNARIO — et la FILE DE QUARANTAINE
// (livrables L239).
//
// CE QU'UN SCÉNARIO PRÉTEND, ET QUI EN DÉCIDE. Un scénario soumis à
// qualification porte, à chaque étape, l'issue que son AUTEUR affirme :
// `expect.outcome`. C'est une ASSERTION, pas une donnée. Le pipeline la
// confronte au CONTRAT — la machine à états de `@bench/oracle` (T07), qui est
// une dépendance, donc « un contrat déjà validé » (L147). Quand les deux
// divergent, ce n'est pas le contrat qui a tort : c'est le scénario qui est
// DÉFECTUEUX, et il entre en quarantaine.
//
// POURQUOI L'ORACLE ET PAS UNE SECONDE RÈGLE ÉCRITE ICI. Réécrire la règle de
// capacité ou celle des 24 h dans ce fichier créerait un deuxième juge, et deux
// juges qui divergent ne qualifient plus rien. L217 dit la même chose du côté de
// T07 (« l'oracle ne réutilise ni les handlers, ni les requêtes SQL, ni les
// validateurs métier des applications témoins ») : il n'y a qu'UNE description
// du métier, et T10 s'y adosse au lieu de la dupliquer.
//
// CE QUE « ACCEPTÉ » VEUT DIRE POUR UNE DEMANDE. L'acteur OBTIENT le créneau,
// c'est-à-dire que sa réservation est `confirmed` après l'étape. Être admis en
// FILE D'ATTENTE n'est pas obtenir le créneau : §F le dit en toutes lettres pour
// P1 (« demande concurrente de B rejetée sans surbooking », une seule confirmée,
// titulaire A). Pour une annulation, « accepté » est l'aboutissement de l'appel.
//
// LA FILE EST CUMULATIVE ET NE SE VIDE PAS. Un cas écarté le reste : c'est ce
// qui permet à `buildConfirmatoryManifest` de refuser de l'inclure, et à
// `exportExclusions` d'en rendre compte.
// ─────────────────────────────────────────────────────────────────────────────
import {
  applyOperation,
  createReservationOracle,
  isReservationRejection,
  type ReservationOperationKind,
  type ReservationOracleState,
} from '@bench/oracle'

import {
  QualificationViolation,
  requireExactKeys,
  requireFlatObject,
  requireNonEmptyString,
} from './errors.js'
import { DELAI_ANNULATION_HEURES, FRONTIERE_INCLUSE } from './reference.js'

export const SCENARIO_SCHEMA = 'bench.qualification.scenario/1'

/** Vocabulaire d'issue d'une assertion de scénario (convention III.4). */
export const ISSUE_ACCEPTEE = 'accepted'
export const ISSUE_REFUSEE = 'refused'

export interface QualificationScenarioStep {
  readonly step_id: string
  readonly at: string
  readonly operation: string
  readonly actor: string
  readonly slot: string
  readonly sequence: number
  readonly expect: { readonly outcome: string }
}

export interface QualificationScenario {
  readonly schema: string
  readonly scenario_id: string
  readonly tenant: string
  readonly business_clock: string
  readonly slots: readonly {
    readonly slot_id: string
    readonly capacity: number
    readonly starts_at: string
  }[]
  readonly steps: readonly QualificationScenarioStep[]
}

/** Ce qu'une étape a prétendu, et ce que le contrat a donné. */
export interface StepVerdict {
  readonly step_id: string
  readonly operation: string
  readonly actor: string
  readonly slot: string
  readonly expected: string
  readonly observed: string
  readonly agrees: boolean
  readonly contract_code: string | null
}

/** Convention d'appel III.5 : le rapport de qualification d'un scénario. */
export interface ScenarioQualificationReport {
  readonly schema: 'bench.qualification.scenario-report/1'
  readonly scenario_id: string
  readonly verdict: 'QUALIFIE' | 'QUARANTAINE'
  readonly quarantined: boolean
  readonly reason: string | null
  readonly reason_code: string | null
  readonly steps: readonly StepVerdict[]
}

/** Une entrée de la file de quarantaine (livrable L239). */
export interface QuarantineEntry {
  readonly scenario_id: string
  readonly reason: string
  readonly reason_code: string
  readonly step_id: string
  readonly operation: string
  readonly expected: string
  readonly observed: string
}

const FILE_DE_QUARANTAINE: QuarantineEntry[] = []

/* ───────────────────────────────────────── lecture stricte du scénario */

function lireScenario(raw: unknown): QualificationScenario {
  const o = requireFlatObject(raw, '/scenario')
  requireExactKeys(
    o,
    ['schema', 'scenario_id', 'tenant', 'business_clock', 'slots', 'steps'],
    [],
    '/scenario',
  )
  const schema = requireNonEmptyString(o, 'schema', '/scenario')
  if (schema !== SCENARIO_SCHEMA) {
    throw new QualificationViolation(
      'SCHEMA_UNKNOWN',
      '/scenario/schema',
      `schema ${JSON.stringify(schema)} inconnu, ${SCENARIO_SCHEMA} attendu`,
    )
  }
  const creneaux = o['slots']
  const etapes = o['steps']
  if (!Array.isArray(creneaux)) {
    throw new QualificationViolation('TYPE_MISMATCH', '/scenario/slots', 'tableau attendu')
  }
  if (!Array.isArray(etapes)) {
    throw new QualificationViolation('TYPE_MISMATCH', '/scenario/steps', 'tableau attendu')
  }
  return {
    schema,
    scenario_id: requireNonEmptyString(o, 'scenario_id', '/scenario'),
    tenant: requireNonEmptyString(o, 'tenant', '/scenario'),
    business_clock: requireNonEmptyString(o, 'business_clock', '/scenario'),
    slots: creneaux as QualificationScenario['slots'],
    steps: etapes as readonly QualificationScenarioStep[],
  }
}

/** L'état métier que le contrat donne à un acteur sur un créneau. */
function statutDe(etat: ReservationOracleState, slot: string, actor: string): string {
  const r = etat.reservations.find(
    (x) => x.slot === slot && x.actor === actor && x.status !== 'cancelled',
  )
  return r === undefined ? 'absent' : r.status
}

/**
 * L'issue que le CONTRAT donne à une étape. `accepted` signifie que l'acteur
 * OBTIENT le créneau ; une admission en file d'attente ne l'est pas.
 */
function issueDuContrat(
  etat: ReservationOracleState,
  kind: ReservationOperationKind,
  slot: string,
  actor: string,
): string {
  if (kind === 'cancel') return ISSUE_ACCEPTEE
  return statutDe(etat, slot, actor) === 'confirmed' ? ISSUE_ACCEPTEE : ISSUE_REFUSEE
}

/* ══════════════════════════════════════════════ qualifyScenario ═══════ */

/**
 * Confronte les assertions d'un scénario au contrat métier. Rend un rapport ;
 * ne lève que pour un scénario MAL FORMÉ (refus d'appel), jamais pour un
 * scénario faux — un scénario faux est précisément ce que la quarantaine
 * enregistre.
 */
export function qualifyScenario(raw: unknown): ScenarioQualificationReport {
  const scenario = lireScenario(raw)

  const acteurs: string[] = []
  for (const e of scenario.steps) if (!acteurs.includes(e.actor)) acteurs.push(e.actor)

  let etat = createReservationOracle({
    clock: scenario.business_clock,
    tenant: scenario.tenant,
    actors: acteurs,
    slots: scenario.slots.map((s) => ({
      id: s.slot_id,
      capacity: s.capacity,
      start: s.starts_at,
    })),
    cancellation_notice_hours: DELAI_ANNULATION_HEURES,
    cancellation_boundary_inclusive: FRONTIERE_INCLUSE,
  })

  const ordonnees = [...scenario.steps].sort((a, b) => a.sequence - b.sequence)
  const verdicts: StepVerdict[] = []

  for (const etape of ordonnees) {
    const kind: ReservationOperationKind = etape.operation === 'cancel' ? 'cancel' : 'reserve'
    let observee: string
    let code: string | null = null
    try {
      etat = applyOperation(etat, {
        kind,
        tenant: scenario.tenant,
        actor: etape.actor,
        slot: etape.slot,
        at: etape.at,
        sequence: etape.sequence,
        idempotency_key: etape.step_id,
      })
      observee = issueDuContrat(etat, kind, etape.slot, etape.actor)
    } catch (e) {
      if (!isReservationRejection(e)) throw e
      observee = ISSUE_REFUSEE
      code = e.code
    }
    verdicts.push({
      step_id: etape.step_id,
      operation: etape.operation,
      actor: etape.actor,
      slot: etape.slot,
      expected: etape.expect.outcome,
      observed: observee,
      agrees: etape.expect.outcome === observee,
      contract_code: code,
    })
  }

  const divergente = verdicts.find((v) => !v.agrees) ?? null
  if (divergente === null) {
    return {
      schema: 'bench.qualification.scenario-report/1',
      scenario_id: scenario.scenario_id,
      verdict: 'QUALIFIE',
      quarantined: false,
      reason: null,
      reason_code: null,
      steps: verdicts,
    }
  }

  const reason =
    `contradiction entre l'assertion du scenario et le contrat : l'etape ` +
    `${divergente.step_id} (${divergente.operation} par ${divergente.actor} sur ` +
    `${divergente.slot}) est affirmee ${divergente.expected}, le contrat donne ` +
    `${divergente.observed}` +
    (divergente.contract_code === null ? '' : ` (${divergente.contract_code})`)
  const reasonCode = `CONTRADICTION_ASSERTION_CONTRAT_${divergente.operation.toUpperCase()}`

  FILE_DE_QUARANTAINE.push({
    scenario_id: scenario.scenario_id,
    reason,
    reason_code: reasonCode,
    step_id: divergente.step_id,
    operation: divergente.operation,
    expected: divergente.expected,
    observed: divergente.observed,
  })

  return {
    schema: 'bench.qualification.scenario-report/1',
    scenario_id: scenario.scenario_id,
    verdict: 'QUARANTAINE',
    quarantined: true,
    reason,
    reason_code: reasonCode,
    steps: verdicts,
  }
}

/** La file de quarantaine, telle qu'elle est (livrable L239). */
export function listQuarantine(): readonly QuarantineEntry[] {
  return [...FILE_DE_QUARANTAINE]
}
