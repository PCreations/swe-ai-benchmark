// ─────────────────────────────────────────────────────────────────────────────
// @bench/evaluation — T65, ADR-018 L206-L212 : les mesures longitudinales sur
// le chemin reel (acceptance/T65.spec.ts). Trois roles, fixes par la section
// II.1 de cette suite (aucune source n'impose de signature, ADR-001) :
//
//   persistPeriodMeasures({ benchDataDir, entries }) -> Promise<any>
//       Persiste, pour chaque entree `{periodKey, period, code}`, les quatre
//       grandeurs Q/R/G/G_new rendues par `computePeriodMetrics` (@bench/
//       domain, T04) sur `period`, ainsi que les mesures de code `code` — qui
//       ne doivent JAMAIS influencer Q/R/G/G_new (ADR-018 L64-67).
//   readPeriodMeasures({ benchDataDir, periodKey }) -> Promise<{Q, R, G,
//       G_new, regressions?, code}>
//       Relit les grandeurs persistees d'une periode.
//   ruleTimeline({ benchDataDir, ruleId }) -> Promise<{firstSatisfiedPeriod,
//       regressionPeriods, recoveryPeriods}>
//       Rend la chronologie d'une regle (`id@version`, cahier:L109/L129) :
//       premiere periode de satisfaction, periodes de regression et de
//       retablissement.
//
// COMMENT LE CALCUL EST FAIT, ET POURQUOI.
//
//   `persistPeriodMeasures` appelle UNE SEULE FOIS `computePeriodMetrics`
//   (T04, deja PROUVEE a HEAD) sur LA SERIE ENTIERE des periodes fournies,
//   dans l'ordre chronologique donne par `entries` : c'est cette fonction qui
//   porte, periode par periode, l'historique « autrefois satisfaite » / «
//   satisfaite a la periode precedente comparable » (L189) dont dependent G
//   et `G_new` — ce module ne le recalcule jamais a la main, pour ne jamais
//   diverger de l'oracle que la suite d'acceptation compare (T65.A1).
//
//   Les mesures de CODE (`CodeMetrics`) sont persistees A COTE, jamais
//   transmises a `computePeriodMetrics` : aucun champ de `CodeMetrics` n'a de
//   correspondant dans `MetricPeriod`, donc il n'existe tout simplement aucun
//   chemin par lequel elles pourraient influencer Q/R/G/G_new (ADR-018
//   L64-67, danger T65.A4).
//
//   `ruleTimeline` relit les memes `entries` persistees et la meme sortie de
//   `computePeriodMetrics`, puis balaie les periodes dans l'ordre :
//     - premiere periode active+due+satisfaite  -> firstSatisfiedPeriod ;
//     - toute periode ou `periods[i].regressions` contient `ruleId`
//       -> regressionPeriods (c'est exactement G, L189 : actuellement
//       violee et autrefois satisfaite — jamais recalcule autrement que par
//       l'oracle T04) ;
//     - la premiere periode active+due+satisfaite qui suit une periode de
//       regression -> recoveryPeriods.
//   Un retrait (replaced ou non) sort la regle de `requirements` : elle ne
//   peut alors plus apparaitre dans `regressions` (L129, F-REGRESSION), donc
//   ruleTimeline ne compte jamais un retrait comme une regression — sans
//   aucune logique dediee a `retired`, par construction de l'oracle T04.
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from 'node:fs'
import * as path from 'node:path'
import { computePeriodMetrics } from '@bench/domain'
import type { MetricPeriod } from '@bench/domain'

/** Mesures du code d'une periode — ADR-018 L64-67, mot pour mot. */
export interface CodeMetrics {
  readonly linesAdded: number
  readonly linesRemoved: number
  readonly filesTouched: number
  readonly testFilesWritten: number
}

/** Une entree a persister — fixee par acceptance/T65.spec.ts, II.1. */
export interface LongitudinalMeasureEntry {
  readonly periodKey: string
  readonly period: MetricPeriod
  readonly code: CodeMetrics
}

export interface PersistPeriodMeasuresInput {
  readonly benchDataDir: string
  readonly entries: readonly LongitudinalMeasureEntry[]
}

export interface ReadPeriodMeasuresInput {
  readonly benchDataDir: string
  readonly periodKey: string
}

/** Grandeurs persistees d'une periode — fixees par acceptance/T65.spec.ts, II.1. */
export interface PeriodMeasures {
  readonly Q: number | null
  readonly R: number | null
  readonly G: number
  readonly G_new: number
  readonly regressions?: readonly string[]
  readonly code: CodeMetrics
}

export interface RuleTimelineInput {
  readonly benchDataDir: string
  readonly ruleId: string
}

/** Chronologie d'une regle — fixee par acceptance/T65.spec.ts, II.1. */
export interface RuleTimeline {
  readonly firstSatisfiedPeriod: string | null
  readonly regressionPeriods: readonly string[]
  readonly recoveryPeriods: readonly string[]
}

/* ══════════════════════════ stockage interne (fichiers JSON) ═══════════ */

const ENTRIES_FILE = 'entries.json'
const PERIODS_SUBDIR = 'periods'

function entriesFilePath(benchDataDir: string): string {
  return path.join(benchDataDir, ENTRIES_FILE)
}

function periodsDir(benchDataDir: string): string {
  return path.join(benchDataDir, PERIODS_SUBDIR)
}

function periodFilePath(benchDataDir: string, periodKey: string): string {
  return path.join(periodsDir(benchDataDir), `${periodKey}.json`)
}

/** L'identite de comptage d'une exigence : `id@version` (cahier L109, L129). */
const cle = (id: string, version: number): string => `${id}@${String(version)}`

/**
 * Persiste, pour chaque periode de `entries`, les grandeurs Q/R/G/G_new
 * rendues par `computePeriodMetrics` (@bench/domain, T04) sur l'ensemble de
 * la serie, et les mesures de code `code` — jamais melangees au calcul du
 * score (ADR-018 L64-67).
 */
export async function persistPeriodMeasures(input: PersistPeriodMeasuresInput): Promise<void> {
  const { benchDataDir, entries } = input
  fs.mkdirSync(benchDataDir, { recursive: true })
  fs.mkdirSync(periodsDir(benchDataDir), { recursive: true })

  const seriesMetrics = computePeriodMetrics(entries.map((e) => e.period))

  fs.writeFileSync(entriesFilePath(benchDataDir), JSON.stringify(entries), 'utf8')

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i] as LongitudinalMeasureEntry
    const metrics = seriesMetrics.periods[i]
    const measures: PeriodMeasures = {
      Q: metrics?.Q ?? null,
      R: metrics?.R ?? null,
      G: metrics?.G ?? 0,
      G_new: metrics?.G_new ?? 0,
      regressions: metrics?.regressions ?? [],
      code: entry.code,
    }
    fs.writeFileSync(periodFilePath(benchDataDir, entry.periodKey), JSON.stringify(measures), 'utf8')
  }
  await Promise.resolve()
}

/** Relit les grandeurs persistees d'une periode. */
export async function readPeriodMeasures(input: ReadPeriodMeasuresInput): Promise<PeriodMeasures> {
  const { benchDataDir, periodKey } = input
  const filePath = periodFilePath(benchDataDir, periodKey)
  const raw = fs.readFileSync(filePath, 'utf8')
  const measures = JSON.parse(raw) as PeriodMeasures
  await Promise.resolve()
  return measures
}

function readEntries(benchDataDir: string): LongitudinalMeasureEntry[] {
  const raw = fs.readFileSync(entriesFilePath(benchDataDir), 'utf8')
  return JSON.parse(raw) as LongitudinalMeasureEntry[]
}

/**
 * Rend la chronologie (satisfaction/regression/retablissement) d'une regle,
 * en relisant les `entries` persistees et en reappliquant `computePeriodMetrics`
 * (T04) sur la serie entiere — jamais une seconde logique de regression
 * ecrite a cote de l'oracle.
 */
export async function ruleTimeline(input: RuleTimelineInput): Promise<RuleTimeline> {
  const { benchDataDir, ruleId } = input
  const entries = readEntries(benchDataDir)
  const seriesMetrics = computePeriodMetrics(entries.map((e) => e.period))

  let firstSatisfiedPeriod: string | null = null
  const regressionPeriods: string[] = []
  const recoveryPeriods: string[] = []
  let wasInRegression = false

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i] as LongitudinalMeasureEntry
    const period = entry.period
    const metrics = seriesMetrics.periods[i]

    // L'exigence active+due+satisfaite de CETTE periode, si elle existe.
    const actifSatisfait = period.requirements.some(
      (r) => cle(r.id, r.version) === ruleId && r.due_at_period <= period.period_index && r.satisfied === true,
    )

    if (firstSatisfiedPeriod === null && actifSatisfait) {
      firstSatisfiedPeriod = entry.periodKey
    }

    const enRegressionIci = (metrics?.regressions ?? []).includes(ruleId)
    if (enRegressionIci) {
      regressionPeriods.push(entry.periodKey)
      wasInRegression = true
    } else if (wasInRegression && actifSatisfait) {
      recoveryPeriods.push(entry.periodKey)
      wasInRegression = false
    }
  }

  await Promise.resolve()
  return { firstSatisfiedPeriod, regressionPeriods, recoveryPeriods }
}
