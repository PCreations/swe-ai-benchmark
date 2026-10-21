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
// CE QUE CE ROLE VERIFIE REELLEMENT (ADR-001 : aucune source ne fixe le
// detail d'une sequence cachee, seulement le mecanisme). Chaque sequence
// generee par `@bench/scenario#generateHiddenSequences` devient ICI deux
// operations reelles du contrat `bench.candidate/3` : un premier acteur
// admis sur un creneau NEUF (jamais vu auparavant, identifiant tire de la
// graine) doit etre confirme ; un second acteur admis sur le MEME creneau,
// juste apres, doit etre mis EN ATTENTE (modele a capacite 1 implicite,
// repris de F-RESERVATION et de P1-P4 de F-LONG — aucun creneau n'est
// jamais cree explicitement par le contrat, `operation_key` en tient lieu).
// Une sequence est satisfaite quand les DEUX decisions correspondent
// exactement a cette attente. Un candidat qui ne met jamais personne en
// attente (par exemple `t64-naive-single-case-candidate.mjs`, qui repond
// `{decision:'confirmed'}` a toute ecriture, quels que soient les arguments)
// rate donc CHAQUE sequence — score 0, strictement inferieur a 1 (T64.A3).
//
// CE QUE CE ROLE NE PRETEND PAS FAIRE. Il ne rejoue pas, operation par
// operation, le recit narratif complet des douze periodes de F-LONG
// (`packages/oracle/src/f-long.ts#replayFLong`, T61) : un appel a
// `runFLongPeriod` avec un lot d'operations vide etablit le repertoire
// persistant avant la sonde, conformement au mecanisme de T63, sans
// reproduire ici une seconde fois le scenario entier que T61 a deja prouve.
// Chaque sequence cachee porte son PROPRE creneau neuf (jamais partage entre
// sequences, jamais reutilise d'une periode a l'autre) : elle teste donc la
// regle « capacite 1 + mise en file », active sans interruption de P1 a P12,
// independamment de l'etat laisse par la trajectoire principale.
// ─────────────────────────────────────────────────────────────────────────────
import { generateHiddenSequences, type HiddenSequence } from '@bench/scenario'

import { runFLongPeriod, runFLongProbe, type FLongPeriodOperation, type FLongPeriodOperationResult } from './f-long-persistence.js'

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

const DEFAULT_COUNT = 20

function decisionOf(r: FLongPeriodOperationResult | undefined): unknown {
  if (r === undefined || !r.ok) return undefined
  const result = r.result as Record<string, unknown> | undefined
  return result?.['decision']
}

/**
 * Traduit une sequence cachee en deux operations reelles du contrat
 * `bench.candidate/3` sur une COPIE JETABLE de l'etat (`runFLongProbe`,
 * T63) : un premier acteur admis sur un creneau neuf doit etre confirme, un
 * second acteur admis sur ce MEME creneau juste apres doit etre mis en
 * attente. Rend `true` quand les DEUX decisions correspondent exactement.
 */
async function runOneSequence(
  candidateCommand: readonly string[],
  benchDataDir: string,
  seq: HiddenSequence,
): Promise<boolean> {
  const ops: FLongPeriodOperation[] = [
    { id: 'ct', op: 'create_tenant', args: { tenant_id: seq.tenantId } },
    {
      id: 'w1',
      op: 'write',
      args: { op: 'reserve', actor: seq.actor, tenant_id: seq.tenantId, admission_seq: 1, operation_key: seq.slotId },
    },
    {
      id: 'w2',
      op: 'write',
      args: { op: 'reserve', actor: seq.otherActor, tenant_id: seq.tenantId, admission_seq: 2, operation_key: seq.slotId },
    },
  ]
  const { responses } = await runFLongProbe({ candidateCommand, benchDataDir, ops })
  const decision1 = decisionOf(responses.find((r) => r.id === 'w1'))
  const decision2 = decisionOf(responses.find((r) => r.id === 'w2'))
  return decision1 === 'confirmed' && decision2 === 'waiting'
}

/**
 * Note une regle active a une periode donnee contre le candidat lance par
 * `candidateCommand`/`benchDataDir` : etablit d'abord le repertoire
 * persistant de la trajectoire principale (`runFLongPeriod`, lot vide — voir
 * l'en-tete), puis genere (a partir de `seed`) et note, sur des copies
 * jetables (`runFLongProbe`), le lot de sequences cachees de `rule` — `score`
 * est la fraction EXACTE `satisfied / total` (ADR-018 L54-58).
 */
export async function scoreRule(input: ScoreRuleInput): Promise<ScoreRuleResult> {
  const count = input.count ?? DEFAULT_COUNT

  // Trajectoire principale (voir l'en-tete) : etablit le repertoire persistant
  // avant toute sonde, un appel reel a `runFLongPeriod` (T63).
  await runFLongPeriod({ candidateCommand: input.candidateCommand, benchDataDir: input.benchDataDir, ops: [] })

  const { sequences } = await generateHiddenSequences({
    rule: input.rule,
    period: input.period,
    seed: input.seed,
    count,
  })

  let satisfied = 0
  for (const seq of sequences) {
    const ok = await runOneSequence(input.candidateCommand, input.benchDataDir, seq)
    if (ok) satisfied += 1
  }

  const total = sequences.length
  const score = total > 0 ? satisfied / total : 0
  return { score, satisfied, total }
}
