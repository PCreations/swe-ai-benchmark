// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T68, ADR-019 decision 3 (L87-91) et carte L100-L106 : le
// notateur v4 d'une regle a une periode. Il EXECUTE REELLEMENT le candidat :
//
//   1. il amene l'etat du candidat jusqu'a la periode en rejouant la
//      trajectoire principale de F-LONG (`@bench/scenario#fLongTrajectoryV4`,
//      contrat `bench.candidate/4`) contre `benchDataDir`, un processus
//      candidat NEUF par periode (`runFLongPeriod`, T63 — ADR-018 decision 2 :
//      un etat qui dure a travers les redemarrages) ;
//   2. il applique chaque sequence du lot de la regle
//      (`@bench/scenario#generateDiscriminatingSequences`, meme regle, meme
//      periode, meme graine) a une COPIE JETABLE de cet etat (`runFLongProbe`,
//      T63 — ADR-018 decisions 2 et 3), l'original n'etant jamais touche ;
//   3. il compare chaque reponse a l'observable attendu que le modele attendu
//      (`ExpectedModelV4`, regles de `replayFLong`, huit points d'ADR-019) a
//      attache a l'etape. Une sequence est satisfaite quand TOUTES ses etapes
//      le sont ; le score est la fraction exacte `satisfied / total` (ADR-018
//      decision 3).
//
// CE QUE LE NOTATEUR JUGE. Uniquement les observables que fixent ADR-018 et
// ADR-019 (detail dans l'en-tete de `@bench/scenario/src/discriminating-
// sequences.ts`) : succes ou code d'erreur, decision d'une reservation,
// statut et position lus, valeur nulle, solde, forme exacte `{type, status,
// at}` des evenements d'historique et premier evenement `migrated`. Jamais la
// decision de `transfer`, `set_capacity`, `set_level`, `create_slot`,
// `probe_cancel` ou d'une annulation, ni un libelle d'evenement autre que
// `migrated`, ni la valeur de `at`, ni un champ supplementaire de `read`.
//
// LA COMMANDE N'EST JAMAIS INTERPRETEE. `candidateCommand` est lancee telle
// quelle ; rien dans la note ne depend de sa forme, seulement des reponses.
// ─────────────────────────────────────────────────────────────────────────────
import {
  DISCRIMINATING_SEQUENCES_CONTRACT,
  fLongTrajectoryV4,
  generateDiscriminatingSequences,
  type DiscriminatingSequence,
  type StepExpectation,
} from '@bench/scenario'

import { runFLongPeriod, runFLongProbe, type FLongPeriodOperationResult } from './f-long-persistence.js'

export interface ScoreDiscriminatingRuleInput {
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly candidateCommand: readonly string[]
  readonly benchDataDir: string
  readonly contract?: string
  readonly protocol?: string
  readonly count?: number
}

/** Premiere etape non satisfaite d'une sequence (diagnostic). */
export interface DiscriminatingFailure {
  readonly index: number
  readonly boundary: string
  readonly step: string
  readonly op: string
  readonly expected: StepExpectation
  readonly received: FLongPeriodOperationResult | null
}

export interface ScoreDiscriminatingRuleResult {
  readonly contract: typeof DISCRIMINATING_SEQUENCES_CONTRACT
  readonly rule: string
  readonly period: string
  readonly seed: number
  readonly score: number
  readonly satisfied: number
  readonly total: number
  readonly failures: readonly DiscriminatingFailure[]
}

const PERIODS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const
const PARALLEL_PROBES = 4
const MAX_REPORTED_FAILURES = 5
const STATUSES = new Set(['confirmed', 'waiting', 'cancelled'])
const EVENT_KEYS = ['at', 'status', 'type'] // ADR-019 pt 7 : exactement {type, status, at}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Juge UNE reponse contre l'observable attendu — rien de plus que ce qu'il nomme. */
export function judgeStep(expected: StepExpectation, r: FLongPeriodOperationResult | undefined): boolean {
  if (r === undefined) return false
  if (expected.kind === 'error') return !r.ok && r.error?.code === expected.code
  if (!r.ok) return false
  const result = r.result
  switch (expected.kind) {
    case 'ok':
      return true
    case 'decision':
      return isRecord(result) && result['decision'] === expected.decision
    case 'balance':
      return isRecord(result) && result['balance'] === expected.balance
    case 'value': {
      if (!isRecord(result) || !('value' in result)) return false
      const v = result['value']
      if (expected.value === null) return v === null
      if (!isRecord(v) || v['status'] !== expected.value.status) return false
      return expected.value.waiting_position === undefined || v['waiting_position'] === expected.value.waiting_position
    }
    case 'events': {
      if (!isRecord(result) || !Array.isArray(result['events'])) return false
      const events = result['events'] as unknown[]
      if (events.length === 0) return false
      for (const e of events) {
        if (!isRecord(e)) return false
        const keys = Object.keys(e).sort()
        if (keys.length !== EVENT_KEYS.length || keys.some((k, i) => k !== EVENT_KEYS[i])) return false
        if (typeof e['status'] !== 'string' || !STATUSES.has(e['status'])) return false
      }
      if (expected.first !== undefined) {
        const first = events[0] as Record<string, unknown>
        return first['type'] === expected.first.type && first['status'] === expected.first.status
      }
      return true
    }
    default:
      return false
  }
}

async function runSequence(
  input: ScoreDiscriminatingRuleInput,
  seq: DiscriminatingSequence,
): Promise<DiscriminatingFailure | null> {
  const { responses } = await runFLongProbe({
    candidateCommand: input.candidateCommand,
    benchDataDir: input.benchDataDir,
    ops: seq.steps,
  })
  for (let i = 0; i < seq.steps.length; i += 1) {
    const step = seq.steps[i]
    const expected = seq.expect[i]
    if (step === undefined || expected === undefined) return null
    const received = responses.find((x) => x.id === step.id)
    if (!judgeStep(expected, received)) {
      return { index: seq.index, boundary: seq.boundary, step: step.id, op: step.op, expected, received: received ?? null }
    }
  }
  return null
}

/**
 * Note `rule` a `period` contre le candidat lance par `candidateCommand` : rejeu
 * de la trajectoire principale sur `benchDataDir`, puis chaque sequence du lot
 * sur une copie de l'etat (voir l'en-tete).
 */
export async function scoreDiscriminatingRule(input: ScoreDiscriminatingRuleInput): Promise<ScoreDiscriminatingRuleResult> {
  const contract = input.contract ?? input.protocol ?? DISCRIMINATING_SEQUENCES_CONTRACT
  if (contract !== DISCRIMINATING_SEQUENCES_CONTRACT) {
    throw new Error(`contrat non pris en charge : ${contract} (attendu ${DISCRIMINATING_SEQUENCES_CONTRACT})`)
  }
  if (!Array.isArray(input.candidateCommand) || input.candidateCommand.length === 0) {
    throw new Error('candidateCommand vide')
  }
  if (typeof input.benchDataDir !== 'string' || input.benchDataDir.length === 0) {
    throw new Error('benchDataDir absent')
  }
  // Le lot d'abord : une regle ou une periode invalide echoue avant tout lancement.
  const genInput = { rule: input.rule, period: input.period, seed: input.seed, contract }
  const { sequences } = generateDiscriminatingSequences(
    input.count === undefined ? genInput : { ...genInput, count: input.count },
  )

  // 1. Trajectoire principale, une periode = un processus neuf, sur benchDataDir.
  for (const p of PERIODS) {
    await runFLongPeriod({ candidateCommand: input.candidateCommand, benchDataDir: input.benchDataDir, ops: fLongTrajectoryV4(p) })
    if (p === input.period) break
  }

  // 2-3. Chaque sequence sur une copie jetable de l'etat, jugee par le modele attendu.
  const outcomes: (DiscriminatingFailure | null)[] = new Array<DiscriminatingFailure | null>(sequences.length).fill(null)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < sequences.length) {
      const i = next
      next += 1
      outcomes[i] = await runSequence(input, sequences[i] as DiscriminatingSequence)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_PROBES, sequences.length) }, () => worker()))

  const failures = outcomes.filter((f): f is DiscriminatingFailure => f !== null)
  const total = sequences.length
  const satisfied = total - failures.length
  return {
    contract: DISCRIMINATING_SEQUENCES_CONTRACT,
    rule: input.rule,
    period: input.period,
    seed: input.seed,
    score: total > 0 ? satisfied / total : 0,
    satisfied,
    total,
    failures: failures.slice(0, MAX_REPORTED_FAILURES),
  }
}
