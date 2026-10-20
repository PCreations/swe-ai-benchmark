// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T63, ADR-018 decision point 2 (L46-49) et livrables
// L190-L196 : un repertoire de donnees passe au candidat par BENCH_DATA_DIR,
// conserve de P1 a P12 a travers des redemarrages reels du processus
// candidat ; les sondes de frontiere s'appliquent a des copies jetables de ce
// repertoire, jamais a l'original.
//
// SQUELETTE (etage RED) : les deux roles ci-dessous sont resolus par
// acceptance/T63.spec.ts (section II.1, ROLES_PERIOD_RUNNER /
// ROLES_PROBE_RUNNER) mais aucune regle n'est encore ecrite — chaque export
// leve `NotImplemented`. Aucun des trois cas requis (T63.A1/A2/A3) ne peut
// donc verdir ici ; ils doivent rougir de `STUB_NOT_IMPLEMENTED`, jamais de
// `MODULE_NOT_FOUND` (les exports existent et ont la bonne forme).
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/* ══════════════════════════════ formes du contrat ═══════════════════════
 * Fixees par acceptance/T63.spec.ts, section II.2 (aucune source ne les
 * impose — ADR-001) : `candidateCommand` est l'argv du processus candidat,
 * `benchDataDir` le repertoire que la fonction resolue DOIT positionner par
 * la variable d'environnement BENCH_DATA_DIR du processus qu'elle lance.
 */

export interface FLongPeriodOperation {
  readonly id: string
  readonly op: string
  readonly args?: Record<string, unknown>
}

export interface FLongPeriodOperationResult {
  readonly id: string
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: { readonly code?: string; readonly message?: string }
}

export interface RunFLongPeriodInput {
  readonly candidateCommand: readonly string[]
  readonly benchDataDir: string
  readonly ops: readonly FLongPeriodOperation[]
  readonly timeoutMs?: number
}

export interface RunFLongPeriodResult {
  readonly responses: readonly FLongPeriodOperationResult[]
}

/**
 * « period runner » (ADR-018 L46-49) — lance le processus candidat avec
 * `BENCH_DATA_DIR=<benchDataDir>` positionnee sur le repertoire DONNE, SANS
 * jamais le copier : la trajectoire principale, d'une periode a l'autre.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function runFLongPeriod(_input: RunFLongPeriodInput): Promise<RunFLongPeriodResult> {
  throw new NotImplemented('activities.runFLongPeriod')
}

/**
 * « probe runner » (ADR-018 L46-49) — lance le processus candidat avec
 * `BENCH_DATA_DIR` pointee sur une COPIE JETABLE de `benchDataDir`, de sorte
 * que l'original ne soit jamais touche : les sondes de frontiere.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function runFLongProbe(_input: RunFLongPeriodInput): Promise<RunFLongPeriodResult> {
  throw new NotImplemented('activities.runFLongProbe')
}
