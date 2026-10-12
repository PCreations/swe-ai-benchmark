// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — exercer et contrôler le code du candidat à chaque
// période (T51, ADR-009 L92-98, docs/specs/T51.md).
//
// SQUELETTE ROUGE (étage RED). Aucune règle métier ici : les deux exports
// lèvent `NotImplemented`. Les formes ci-dessous ne sont fixées QUE pour que
// les appelants (apps/cli) et la suite d'acceptation (acceptance/T51.spec.ts,
// section II, jamais relue par cet auteur) aient un contrat TypeScript
// stable à travers lequel le refus `NOT_IMPLEMENTED` remonte.
//
//   candidateControlPeriodOnce(input) -> Promise<CandidateControlPeriodResult>
//       Avancera la trajectoire `--campaign-id` d'une période : lancement du
//       code du commit de fin comme un processus-candidat `bench.candidate/2`
//       (adaptateur vers les contrôles existants), exécution du plan d'usages
//       interne du scénario de démonstration, application des cinq contrôles
//       nommés par ADR-009:L34.
//   candidateControlReport(input) -> Promise<CandidateControlReportResult>
//       Lira l'état persistant d'une trajectoire et en rendra l'agrégat par
//       période (satisfaits/violés).
//
// CE QUE CE FICHIER NE FAIT PAS À CET ÉTAGE : aucun espace de travail git
// n'est restauré, aucun processus n'est lancé, aucune ligne PostgreSQL/S3
// n'est lue ni écrite. Ce sont des livrables de l'étage GREEN de T51.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/* ══════════════════════════════════ formes du contrat ═══════════════════ */

export interface CandidateControlPeriodInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  readonly s3Bucket: string
  readonly candidateWorkspaceRoot?: string | undefined
  readonly candidateCommand?: readonly string[] | undefined
  readonly candidateTimeoutMs?: number | undefined
}

export interface CandidateControlEntry {
  readonly id: string
  readonly status: 'satisfied' | 'violated'
  readonly actual: unknown
  readonly expected: unknown
}

export interface CandidateControlPeriodResult {
  readonly campaign_id: string
  readonly period_index: number
  readonly candidate: {
    readonly deployed: boolean
    readonly not_deployed_reason: string | null
    readonly workspace_dir: string | null
    readonly commit_sha: string | null
  }
  readonly controls: readonly CandidateControlEntry[]
}

export interface CandidateControlReportInput {
  readonly campaignId: string
  readonly postgresDatabase: string
}

export interface CandidateControlReportPeriod {
  readonly period_index: number
  readonly satisfied: number
  readonly violated: number
}

export interface CandidateControlReportResult {
  readonly campaign_id: string
  readonly periods: readonly CandidateControlReportPeriod[]
}

/* ══════════════════════════════════ squelette rouge ═════════════════════ */

export async function candidateControlPeriodOnce(
  _input: CandidateControlPeriodInput,
): Promise<CandidateControlPeriodResult> {
  throw new NotImplemented('activities.candidateControlPeriodOnce')
}

export async function candidateControlReport(
  _input: CandidateControlReportInput,
): Promise<CandidateControlReportResult> {
  throw new NotImplemented('activities.candidateControlReport')
}
