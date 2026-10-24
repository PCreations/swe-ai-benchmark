// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T66, ADR-018 L214-L220 (et ADR-019, « Effet sur T66 ») :
// le pilote F-LONG sur le chemin `bench pilot-conduct --provider claude-cli
// --live`, avec plusieurs repetitions par configuration et un rapport agrege
// par configuration.
//
// CE FICHIER N'INVENTE AUCUNE BRIQUE ; IL ASSEMBLE CELLES QUI SONT PROUVEES :
//
//   PROMPT        contrat `bench.candidate/4` et enonce de la periode (T67,
//                 `CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG`), regles actives de
//                 la periode (T62, `CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG`),
//                 mecanique de transport et convention de lancement (T52,
//                 `describeCandidateProtocolV2`) — jamais une seconde redaction.
//   ETAT          un repertoire BENCH_DATA_DIR par trajectoire, conserve de P1 a
//                 P12 : a chaque periode, le candidat que la session vient de
//                 committer joue la trajectoire principale de CETTE periode
//                 (`fLongTrajectoryV4`, T68) sur ce repertoire (`runFLongPeriod`,
//                 T63) — l'etat traverse donc les redemarrages ET les reecritures
//                 du code (ADR-018 decision 2).
//   NOTATION      chaque regle active est notee par EXECUTION REELLE sur des
//                 copies de cet etat (`runFLongProbe`, T63) :
//                   - regles a partir de P5 : generateur et notateur v4 de T68
//                     (`scoreDiscriminatingRule`, avec `stateAtPeriod` : l'etat
//                     est deja celui de la periode, aucun rejeu) ;
//                   - regles de F-RESERVATION (P1-P4, `reserve@1`,
//                     `idempotence@1`, `fifo@1`, `cancel@1`, `cancel@2`,
//                     `isolation@1`), pour lesquelles T68 ne definit pas de lot :
//                     lots de 20 sequences construits ici, dont CHAQUE attendu
//                     est rendu par le modele attendu v4 de T68
//                     (`ExpectedModelV4`) et juge par le meme `judgeStep` — aucun
//                     modele attendu n'est reecrit.
//   MESURES       Q, R, G, G_new par periode et chronologie par regle : les
//                 fonctions de T65 (`persistPeriodMeasures`, `readPeriodMeasures`,
//                 `ruleTimeline`, donc `computePeriodMetrics` de T04) ; mesures
//                 du code (ADR-018 decision 5) lues sur le commit de la session.
//   RAPPORT       enregistrement par (repetition, periode) et agregat par
//                 configuration : moyenne, minimum, maximum et effectif de chaque
//                 mesure (ADR-018 decision 6). AUCUN intervalle de confiance :
//                 T35 ne fixe aucun effectif pour ce pilote (cahier L466), donc
//                 aucun effectif de repetitions n'atteint le seuil qui en
//                 autoriserait un.
//
// CONVENTIONS FIXEES ICI (aucune source ne les impose) :
//   - une regle est SATISFAITE a une periode quand son score vaut 1 (toutes ses
//     sequences satisfaites) ; c'est l'entree `satisfied` de T04 ;
//   - les intentions de R sont les sequences notees de la periode (offertes =
//     total, reussies = satisfaites) ;
//   - la graine des sequences est derivee de l'identite de la trajectoire : deux
//     repetitions recoivent deux lots differents, une reprise retrouve le meme.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG,
  DISCRIMINATED_RULES,
  DISCRIMINATING_MIN_BATCH_SIZE,
  DISCRIMINATING_SEQUENCES_CONTRACT,
  ExpectedModelV4,
  activeRulesV4,
  describeFLongInterfaceContractV4,
  fLongTrajectoryV4,
  type SequenceStep,
  type StepExpectation,
} from '@bench/scenario'
import type { ClaudeCliPeriodUsage } from '@bench/agents'

import { describeCandidateProtocolV2, CANDIDATE_ENTRYPOINT_FILENAME } from './candidate-protocol-v2.js'
import { describeCandidateProtocolV3 } from './candidate-protocol-v3.js'
import { CANDIDATE_LONG_PERIOD_KEYS, CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG } from './candidate-requirements-statement-long.js'
import { judgeStep, scoreDiscriminatingRule } from './discriminating-rule-scoring.js'
import { runFLongPeriod, runFLongProbe, type FLongPeriodOperationResult } from './f-long-persistence.js'

type Json = Record<string, unknown>

/** Identifiant de scenario porte par `corpus.groups[].source_scenario_id`. */
export const F_LONG_SCENARIO_ID = 'F-LONG'

/** Nombre de periodes de F-LONG (ADR-018 decision 1). */
export const F_LONG_PERIOD_COUNT = CANDIDATE_LONG_PERIOD_KEYS.length

type PeriodKey = (typeof CANDIDATE_LONG_PERIOD_KEYS)[number]

function periodKeyOf(periodIndex: number): PeriodKey {
  const key = CANDIDATE_LONG_PERIOD_KEYS[periodIndex - 1]
  if (key === undefined) throw new Error(`F-LONG : periode ${String(periodIndex)} hors de P1..P${String(F_LONG_PERIOD_COUNT)}`)
  return key
}

/** Horloge laissee par la trajectoire principale a la fin d'une periode (dernier `advance_clock`). */
function trajectoryClockAt(periodIndex: number): number {
  let last = Number.NaN
  for (let i = 1; i <= periodIndex; i += 1) {
    for (const step of fLongTrajectoryV4(periodKeyOf(i))) {
      if (step.op === 'advance_clock') last = Date.parse(String(step.args['to']))
    }
  }
  return last
}

/** Horloge d'ouverture d'une periode (premier `advance_clock` de sa trajectoire). */
function periodOpeningClock(periodIndex: number): string | null {
  const first = fLongTrajectoryV4(periodKeyOf(periodIndex)).find((s) => s.op === 'advance_clock')
  return first === undefined ? null : String(first.args['to'])
}

/* ══════════════════════════════════════════════════════ prompt (T67) ═════ */

/**
 * Le prompt d'une session F-LONG : contrat `bench.candidate/4` (T67), regles
 * actives de la periode (T62) et points tranches d'ADR-019 pour cette periode
 * (T67), transport et lancement (T52). Rien d'autre : ni sequence cachee, ni
 * valeur attendue, ni regle d'une periode ulterieure.
 */
export function buildFLongPilotPrompt(periodIndex: number): string {
  const key = periodKeyOf(periodIndex)
  const opening = periodOpeningClock(periodIndex)
  return [
    `Scenario F-LONG, periode ${key} sur ${String(F_LONG_PERIOD_COUNT)}. Contrat d'application ${CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG.protocol} : developpe (ou fais evoluer) le code candidat de ce depot comme un processus qui echangera des operations {op,args} en JSON ligne a ligne sur son entree et sa sortie standard.`,
    describeCandidateProtocolV2(),
    describeCandidateProtocolV3(),
    CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG.contract,
    // T69 (ADR-020) : le contrat d'interface de CETTE periode, calcule depuis le
    // modele attendu qui la note — il fait partie de la specification.
    describeFLongInterfaceContractV4(key),
    `Etat persistant : le moteur lance ${CANDIDATE_ENTRYPOINT_FILENAME} avec la variable d'environnement BENCH_DATA_DIR, qui designe un repertoire de donnees. Toute donnee doit y etre conservee : le processus est arrete puis relance entre deux lots d'operations, et le meme repertoire est repris a la periode suivante, apres que tu auras modifie le code. Un changement de format de tes donnees doit donc relire (migrer) celles des periodes precedentes.`,
    opening === null
      ? `Horloge : le moteur fixe l'instant courant par l'operation advance_clock.`
      : `Horloge : le moteur fixe l'instant courant par l'operation advance_clock ; la periode ${key} s'ouvre a ${opening}.`,
    `Enonce des regles de cette periode :`,
    CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG.periods[key].statement,
    `Points tranches pour cette periode (${CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG.protocol}) :`,
    CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG.periods[key].statement,
  ].join('\n\n')
}

/* ═════════════════ lots des regles de F-RESERVATION (attendus : T68) ═════ */

/** Regles notees par le generateur de T68 ; les autres le sont par les lots ci-dessous. */
const T68_RULES: ReadonlySet<string> = new Set(DISCRIMINATED_RULES)

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const FAR_MS = 30 * DAY_MS

function hash32(...parts: readonly (string | number)[]): number {
  return createHash('sha256').update(parts.map(String).join('\u0001'), 'utf8').digest().readUInt32BE(0)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T
const int = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1))
const iso = (ms: number): string => new Date(ms).toISOString()

class BaseSequence {
  readonly steps: SequenceStep[] = []
  private n = 0
  private admission = 0
  private opKey = 0

  constructor(readonly tag: string) {}

  push(op: string, args: Record<string, unknown>): Record<string, unknown> {
    this.n += 1
    this.steps.push({ id: `${this.tag}-${String(this.n)}`, op, args })
    return args
  }
  tenant(tid: string): void {
    this.push('create_tenant', { tenant_id: tid })
  }
  slot(tid: string, sid: string, startMs: number, capacity: number): void {
    this.push('create_slot', { tenant_id: tid, slot_id: sid, start: iso(startMs), capacity, price: 0 })
  }
  reserve(tid: string, sid: string, actor: string): Record<string, unknown> {
    this.admission += 1
    this.opKey += 1
    return this.push('write', {
      op: 'reserve',
      actor,
      tenant_id: tid,
      admission_seq: this.admission,
      operation_key: `${this.tag}-op${String(this.opKey)}`,
      slot_id: sid,
    })
  }
  cancel(tid: string, sid: string, actor: string): Record<string, unknown> {
    this.opKey += 1
    return this.push('write', { op: 'cancel', actor, tenant_id: tid, operation_key: `${this.tag}-op${String(this.opKey)}`, slot_id: sid })
  }
  /** Rejoue EXACTEMENT une requete deja envoyee (meme `operation_key`, memes arguments). */
  replay(args: Record<string, unknown>): void {
    this.push('write', { ...args })
  }
  read(tid: string, sid: string, key: string): void {
    this.push('read', { tenant_id: tid, key, slot_id: sid })
  }
}

interface BaseCtx {
  readonly b: BaseSequence
  readonly rng: () => number
  readonly u: string
  readonly base: number
}

/** reserve@1 — admission : confirme tant qu'une place est libre, sinon en attente, dans l'ordre. */
function baseReserve(c: BaseCtx): string {
  const { b, rng, u } = c
  const T = `t66-res-${u}`
  const S = `slot-${u}`
  const capacity = int(rng, 1, 3)
  const n = capacity + int(rng, 1, 2)
  b.tenant(T)
  b.slot(T, S, c.base + FAR_MS, capacity)
  const actors = Array.from({ length: n }, (_, i) => `a${String(i + 1)}-${u}`)
  for (const a of actors) b.reserve(T, S, a)
  for (const a of actors) b.read(T, S, a)
  return `capacite ${String(capacity)}, ${String(n)} admissions`
}

/** idempotence@1 — rejouer la meme requete renvoie le meme resultat, sans doublon ni nouvel effet. */
function baseIdempotence(c: BaseCtx): string {
  const { b, rng, u } = c
  const T = `t66-idem-${u}`
  const S = `slot-${u}`
  const capacity = int(rng, 1, 2)
  const replays = int(rng, 1, 2)
  b.tenant(T)
  b.slot(T, S, c.base + FAR_MS, capacity)
  const first = `a1-${u}`
  const reserved = b.reserve(T, S, first)
  for (let i = 0; i < replays; i += 1) b.replay(reserved)
  const others = Array.from({ length: capacity }, (_, i) => `a${String(i + 2)}-${u}`)
  for (const a of others) b.reserve(T, S, a)
  const cancelled = b.cancel(T, S, first)
  b.replay(cancelled)
  for (const a of [first, ...others]) b.read(T, S, a)
  return `capacite ${String(capacity)}, ${String(replays)} rejeu(x) de l'admission puis rejeu de l'annulation`
}

/** fifo@1 — file par sequence d'admission ; une annulation promeut la tete de file. */
function baseFifo(c: BaseCtx): string {
  const { b, rng, u } = c
  const T = `t66-fifo-${u}`
  const S = `slot-${u}`
  const n = int(rng, 3, 5)
  b.tenant(T)
  b.slot(T, S, c.base + FAR_MS, 1)
  const actors = Array.from({ length: n }, (_, i) => `a${String(i + 1)}-${u}`)
  for (const a of actors) b.reserve(T, S, a)
  for (const a of actors.slice(1)) b.read(T, S, a)
  b.cancel(T, S, actors[0] as string)
  const middle = n >= 4 && rng() < 0.5
  if (middle) b.cancel(T, S, actors[2] as string)
  for (const a of actors) b.read(T, S, a)
  return `${String(n)} admissions sur une place, annulation du confirme${middle ? ' et d\'une attente' : ''}`
}

/** cancel@1 — annulation sans restriction, quel que soit le debut du creneau. */
function baseCancel1(c: BaseCtx): string {
  const { b, rng, u } = c
  const T = `t66-c1-${u}`
  const S = `slot-${u}`
  const offset = pick(rng, [-DAY_MS, -HOUR_MS, HOUR_MS, 23 * HOUR_MS, FAR_MS])
  b.tenant(T)
  b.slot(T, S, c.base + offset, 1)
  b.reserve(T, S, `a-${u}`)
  b.reserve(T, S, `b-${u}`)
  b.cancel(T, S, `a-${u}`)
  b.read(T, S, `a-${u}`)
  b.read(T, S, `b-${u}`)
  return `annulation a ${String(offset / HOUR_MS)} h du debut`
}

/** cancel@2 — permise jusqu'a 24 h avant le debut (frontiere incluse), refusee ensuite. */
function baseCancel2(c: BaseCtx): string {
  const { b, rng, u } = c
  const T = `t66-c2-${u}`
  const S = `slot-${u}`
  const before = pick(rng, [DAY_MS, DAY_MS + 1, DAY_MS - 1, DAY_MS + HOUR_MS, DAY_MS - HOUR_MS, 3 * DAY_MS, HOUR_MS, 0, -HOUR_MS])
  b.tenant(T)
  b.slot(T, S, c.base + before, 1)
  b.reserve(T, S, `a-${u}`)
  b.reserve(T, S, `b-${u}`)
  b.cancel(T, S, `a-${u}`)
  b.read(T, S, `a-${u}`)
  b.read(T, S, `b-${u}`)
  return `annulation a ${String(before)} ms du debut`
}

/** isolation@1 — chaque locataire a son propre espace de creneaux et de reservations. */
function baseIsolation(c: BaseCtx): string {
  const { b, rng, u } = c
  const T1 = `t66-iso1-${u}`
  const T2 = `t66-iso2-${u}`
  const S = `slot-${u}`
  const a = `a-${u}`
  const other = `b-${u}`
  b.tenant(T1)
  b.tenant(T2)
  b.slot(T1, S, c.base + FAR_MS, 1)
  b.reserve(T1, S, a)
  b.read(T2, S, a)
  b.reserve(T2, S, a)
  const shared = rng() < 0.5
  if (shared) {
    b.slot(T2, S, c.base + FAR_MS, 1)
    b.reserve(T2, S, other)
    b.read(T2, S, a)
    b.read(T1, S, other)
    b.read(T2, S, other)
  }
  b.read(T1, S, a)
  return shared ? 'meme slot_id dans deux locataires' : 'creneau absent du second locataire'
}

const BASE_DESIGNS: Readonly<Record<string, (c: BaseCtx) => string>> = {
  'reserve@1': baseReserve,
  'idempotence@1': baseIdempotence,
  'fifo@1': baseFifo,
  'cancel@1': baseCancel1,
  'cancel@2': baseCancel2,
  'isolation@1': baseIsolation,
}

interface BaseSequenceSpec {
  readonly boundary: string
  readonly steps: readonly SequenceStep[]
  readonly expect: readonly StepExpectation[]
}

function generateBaseSequences(rule: string, periodIndex: number, seed: number): BaseSequenceSpec[] {
  const design = BASE_DESIGNS[rule]
  if (design === undefined) throw new Error(`F-LONG : aucun lot de sequences pour la regle ${rule}`)
  const key = periodKeyOf(periodIndex)
  const clock = trajectoryClockAt(periodIndex)
  const out: BaseSequenceSpec[] = []
  for (let index = 0; index < DISCRIMINATING_MIN_BATCH_SIZE; index += 1) {
    const h = hash32('t66', seed, rule, key, index)
    const u = h.toString(36)
    const b = new BaseSequence(`t66-${u}`)
    const boundary = design({ b, rng: mulberry32(h), u, base: clock })
    // L'attendu de CHAQUE etape vient du modele attendu v4 de T68, a l'horloge de la periode.
    const model = new ExpectedModelV4(key, clock)
    out.push({ boundary, steps: b.steps, expect: b.steps.map((s) => model.apply(s)) })
  }
  return out
}

/* ══════════════════════════════════════════════ notation d'une regle ═════ */

/**
 * T69 (ADR-020 decision 4) — diagnostic d'une regle notee sous 1 : la PREMIERE
 * etape non satisfaite d'une sequence, avec l'operation, l'attendu (celui du
 * modele attendu) et la reponse recue du candidat (`null` s'il n'a rien rendu).
 * Les noms `operation` / `expected` / `received` sont les seuls de l'objet qui
 * designent ces trois roles (l'identifiant d'etape est `step_id`).
 */
export interface FLongRuleFailure {
  readonly rule: string
  readonly sequence_index: number
  readonly step_id: string
  readonly boundary: string
  readonly operation: string
  readonly expected: StepExpectation
  readonly received: FLongPeriodOperationResult | null
}

export interface FLongRuleScore {
  readonly score: number
  readonly satisfied: number
  readonly total: number
  readonly scorer: 'T68' | 'T66-base'
  /** Premieres etapes non satisfaites (au plus MAX_DIAGNOSTICS), celles qui ont une reponse recue d'abord. */
  readonly failures?: readonly FLongRuleFailure[]
}

const MAX_DIAGNOSTICS = 5

function keepDiagnostics(failures: readonly FLongRuleFailure[]): FLongRuleFailure[] {
  const withResponse = failures.filter((f) => f.received !== null)
  const without = failures.filter((f) => f.received === null)
  return [...withResponse, ...without].slice(0, MAX_DIAGNOSTICS)
}

const PARALLEL_PROBES = 4

async function scoreBaseRule(
  rule: string,
  periodIndex: number,
  seed: number,
  candidateCommand: readonly string[],
  benchDataDir: string,
  cwd: string,
): Promise<FLongRuleScore> {
  const sequences = generateBaseSequences(rule, periodIndex, seed)
  const ok: boolean[] = new Array<boolean>(sequences.length).fill(false)
  const failures: (FLongRuleFailure | null)[] = new Array<FLongRuleFailure | null>(sequences.length).fill(null)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < sequences.length) {
      const i = next
      next += 1
      const seq = sequences[i] as BaseSequenceSpec
      const { responses } = await runFLongProbe({ candidateCommand, benchDataDir, ops: seq.steps, cwd })
      ok[i] = true
      for (let j = 0; j < seq.steps.length; j += 1) {
        const step = seq.steps[j] as SequenceStep
        const expected = seq.expect[j] as StepExpectation
        const received: FLongPeriodOperationResult | undefined = responses.find((r) => r.id === step.id)
        if (!judgeStep(expected, received)) {
          ok[i] = false
          failures[i] = {
            rule,
            sequence_index: i,
            step_id: step.id,
            boundary: seq.boundary,
            operation: step.op,
            expected,
            received: received ?? null,
          }
          break
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_PROBES, sequences.length) }, () => worker()))
  const satisfied = ok.filter((x) => x).length
  const total = sequences.length
  return {
    score: total > 0 ? satisfied / total : 0,
    satisfied,
    total,
    scorer: 'T66-base',
    failures: keepDiagnostics(failures.filter((f): f is FLongRuleFailure => f !== null)),
  }
}

async function scoreRuleAtPeriod(
  rule: string,
  periodIndex: number,
  seed: number,
  candidateCommand: readonly string[],
  benchDataDir: string,
  cwd: string,
): Promise<FLongRuleScore> {
  if (T68_RULES.has(rule)) {
    const r = await scoreDiscriminatingRule({
      rule,
      period: periodKeyOf(periodIndex),
      seed,
      candidateCommand,
      benchDataDir,
      contract: DISCRIMINATING_SEQUENCES_CONTRACT,
      cwd,
      stateAtPeriod: true,
    })
    const failures = r.failures.map(
      (f): FLongRuleFailure => ({
        rule,
        sequence_index: f.index,
        step_id: f.step,
        boundary: f.boundary,
        operation: f.op,
        expected: f.expected,
        received: f.received,
      }),
    )
    return { score: r.score, satisfied: r.satisfied, total: r.total, scorer: 'T68', failures: keepDiagnostics(failures) }
  }
  return scoreBaseRule(rule, periodIndex, seed, candidateCommand, benchDataDir, cwd)
}

/* ═══════════════════════════════════════════ mesures du code (ADR-018 d.5) */

export interface FLongCodeMeasures {
  readonly lines_added: number
  readonly lines_removed: number
  readonly files_touched: number
  readonly test_files_written: number
}

/** Un fichier de test : sous un repertoire de tests, ou nomme `*.test.*` / `*.spec.*` / `test_*`. */
const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|(^|\/)test_[^/]*$|\.(test|spec)\.[A-Za-z0-9]+$/

/** Mesures du commit `commitSha` de l'espace de travail, contre son parent (ou l'arbre vide). */
function codeMeasures(workspaceDir: string, commitSha: string): FLongCodeMeasures {
  const out = execFileSync('git', ['diff-tree', '--root', '--no-commit-id', '-r', '--numstat', commitSha], {
    cwd: workspaceDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let added = 0
  let removed = 0
  let files = 0
  let tests = 0
  for (const line of out.split('\n')) {
    if (line.trim() === '') continue
    const [a, r, ...rest] = line.split('\t')
    const file = rest.join('\t')
    files += 1
    added += Number.parseInt(a ?? '', 10) || 0
    removed += Number.parseInt(r ?? '', 10) || 0
    if (TEST_FILE.test(file)) tests += 1
  }
  return { lines_added: added, lines_removed: removed, files_touched: files, test_files_written: tests }
}

/* ═══════════════════════════════════════════ jetons de la session ═══════ */

const USAGE_CATEGORIES = ['input_fresh', 'cache_read', 'output', 'cache_write_5m', 'cache_write_1h', 'cache_write_unresolved'] as const

function tokensOf(usage: readonly ClaudeCliPeriodUsage[]): Record<string, number> {
  const out: Record<string, number> = {}
  let total = 0
  for (const cat of USAGE_CATEGORIES) {
    const v = usage.reduce((s, u) => s + (typeof u[cat] === 'number' && Number.isFinite(u[cat]) ? u[cat] : 0), 0)
    out[cat] = v
    total += v
  }
  out['total'] = total
  return out
}

/* ══════════════════════════════════════════ PostgreSQL reel (psql) ═══════ */

function socketDir(): string {
  const h = process.env['PGHOST']
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h
  return '/var/run/postgresql'
}
function dsnFor(db: string): string {
  const user = process.env['PGUSER'] ?? os.userInfo().username
  return `postgresql://${encodeURIComponent(user)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(socketDir())}`
}
function runPsql(db: string, sql: string): string {
  try {
    return execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    throw new Error(`f-long-pilot.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(0, 800))
  }
}
const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

const TABLE = 'bench_f_long_pilot_periods'

function ensureTable(db: string): void {
  runPsql(
    db,
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       trajectory_key text NOT NULL,
       period_index integer NOT NULL,
       period_key text NOT NULL,
       seed bigint NOT NULL,
       commit_sha text NOT NULL,
       rule_scores jsonb NOT NULL,
       code jsonb NOT NULL,
       tokens jsonb NOT NULL,
       trajectory jsonb NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (trajectory_key, period_index)
     )`,
  )
}

interface FLongPeriodRow {
  readonly trajectory_key: string
  readonly period_index: number
  readonly period_key: string
  readonly seed: number
  readonly commit_sha: string
  readonly rule_scores: Readonly<Record<string, FLongRuleScore>>
  readonly code: FLongCodeMeasures
  readonly tokens: Readonly<Record<string, number>>
  readonly trajectory: { readonly total: number; readonly ok: number }
}

function readRows(db: string, trajectoryKey: string): FLongPeriodRow[] {
  ensureTable(db)
  const out = runPsql(
    db,
    `SELECT row_to_json(t) FROM (
       SELECT trajectory_key, period_index, period_key, seed, commit_sha, rule_scores, code, tokens, trajectory
         FROM ${TABLE} WHERE trajectory_key = ${sqlLit(trajectoryKey)} ORDER BY period_index
     ) t`,
  )
  if (out === '') return []
  return out
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as FLongPeriodRow)
}

function writeRow(db: string, row: FLongPeriodRow): void {
  runPsql(
    db,
    `INSERT INTO ${TABLE}(trajectory_key, period_index, period_key, seed, commit_sha, rule_scores, code, tokens, trajectory)
       VALUES (${sqlLit(row.trajectory_key)}, ${String(row.period_index)}, ${sqlLit(row.period_key)}, ${String(row.seed)},
               ${sqlLit(row.commit_sha)}, ${sqlLit(JSON.stringify(row.rule_scores))}::jsonb,
               ${sqlLit(JSON.stringify(row.code))}::jsonb, ${sqlLit(JSON.stringify(row.tokens))}::jsonb,
               ${sqlLit(JSON.stringify(row.trajectory))}::jsonb)
     ON CONFLICT (trajectory_key, period_index) DO NOTHING`,
  )
}

/* ═══════════════════════ mesures longitudinales : les fonctions de T65 ════
 * `persistPeriodMeasures`/`readPeriodMeasures`/`ruleTimeline` vivent dans
 * `@bench/evaluation` (T65), dont `@bench/activities` ne declare pas la
 * dependance : la declarer reecrirait `pnpm-lock.yaml`, entree GLOBALE de
 * toutes les attestations. Le paquet est donc resolu a l'execution, par le
 * graphe de dependances DEJA declare : `@bench/scenario` depend de
 * `@bench/evaluation`. Les signatures ci-dessous sont celles que fixe
 * acceptance/T65.spec.ts (II.1) ; aucune n'est reimplementee ici. */

interface MetricRequirementInput {
  readonly id: string
  readonly version: number
  readonly capability_id: string
  readonly weight: number
  readonly revealed_at_period: number
  readonly due_at_period: number
  readonly criticality: string
  readonly source: string
  readonly satisfied: boolean
  readonly assertions: readonly string[]
}

interface MetricPeriodInput {
  readonly period_index: number
  readonly duration: number
  readonly requirements: readonly MetricRequirementInput[]
  readonly retired: readonly { readonly id: string; readonly version: number; readonly replaced_by: { readonly id: string; readonly version: number } | null }[]
  readonly intents_offered: number
  readonly intents_succeeded: number
}

interface CodeMetricsInput {
  readonly linesAdded: number
  readonly linesRemoved: number
  readonly filesTouched: number
  readonly testFilesWritten: number
}

interface PeriodMeasuresOutput {
  readonly Q: number | null
  readonly R: number | null
  readonly G: number
  readonly G_new: number
  readonly regressions?: readonly string[]
  readonly code: CodeMetricsInput
}

interface RuleTimelineOutput {
  readonly firstSatisfiedPeriod: string | null
  readonly regressionPeriods: readonly string[]
  readonly recoveryPeriods: readonly string[]
}

interface LongitudinalMeasuresApi {
  persistPeriodMeasures(input: {
    benchDataDir: string
    entries: readonly { periodKey: string; period: MetricPeriodInput; code: CodeMetricsInput }[]
  }): Promise<void>
  readPeriodMeasures(input: { benchDataDir: string; periodKey: string }): Promise<PeriodMeasuresOutput>
  ruleTimeline(input: { benchDataDir: string; ruleId: string }): Promise<RuleTimelineOutput>
}

let measuresApi: Promise<LongitudinalMeasuresApi> | null = null

async function loadMeasuresApi(): Promise<LongitudinalMeasuresApi> {
  const scenarioEntry = fileURLToPath(import.meta.resolve('@bench/scenario'))
  let dir = path.dirname(scenarioEntry)
  for (;;) {
    const pkgDir = path.join(dir, 'node_modules', '@bench', 'evaluation')
    const pkgJson = path.join(pkgDir, 'package.json')
    if (fs.existsSync(pkgJson)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as {
        exports?: { '.'?: { import?: string } }
        main?: string
      }
      const entry = pkg.exports?.['.']?.import ?? pkg.main ?? './dist/index.js'
      const mod = (await import(pathToFileURL(path.join(pkgDir, entry)).href)) as Partial<LongitudinalMeasuresApi>
      if (
        typeof mod.persistPeriodMeasures !== 'function' ||
        typeof mod.readPeriodMeasures !== 'function' ||
        typeof mod.ruleTimeline !== 'function'
      ) {
        throw new Error('@bench/evaluation ne porte pas persistPeriodMeasures/readPeriodMeasures/ruleTimeline (T65)')
      }
      return mod as LongitudinalMeasuresApi
    }
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error("@bench/evaluation introuvable depuis @bench/scenario (mesures de T65)")
    dir = parent
  }
}

function longitudinalMeasures(): Promise<LongitudinalMeasuresApi> {
  if (measuresApi === null) measuresApi = loadMeasuresApi()
  return measuresApi
}

function parseRule(rule: string): { id: string; version: number } {
  const i = rule.lastIndexOf('@')
  return { id: rule.slice(0, i), version: Number(rule.slice(i + 1)) }
}

/** Famille des regles d'ordre de file : un remplacement peut y changer d'identifiant (fifo <-> priority). */
const QUEUE_ORDER_IDS = new Set(['fifo', 'priority'])

/** Retraits a l'entree d'une periode, avec leur remplacement (ADR-018 : P3, P6, P7, P9, P11). */
function retiredAt(periodIndex: number): MetricPeriodInput['retired'] {
  if (periodIndex <= 1) return []
  const before = activeRulesV4(periodKeyOf(periodIndex - 1))
  const now = activeRulesV4(periodKeyOf(periodIndex))
  const added = now.filter((r) => !before.includes(r)).map(parseRule)
  return before
    .filter((r) => !now.includes(r))
    .map((r) => {
      const old = parseRule(r)
      const by =
        added.find((a) => a.id === old.id) ??
        (QUEUE_ORDER_IDS.has(old.id) ? added.find((a) => QUEUE_ORDER_IDS.has(a.id)) : undefined) ??
        null
      return { id: old.id, version: old.version, replaced_by: by }
    })
}

/** Premiere periode ou la regle est active (son echeance). */
function dueAt(rule: string, periodIndex: number): number {
  for (let i = 1; i <= periodIndex; i += 1) if (activeRulesV4(periodKeyOf(i)).includes(rule)) return i
  return periodIndex + 1
}

function metricPeriodOf(row: FLongPeriodRow): MetricPeriodInput {
  const active = activeRulesV4(periodKeyOf(row.period_index))
  let offered = 0
  let succeeded = 0
  const requirements = active.map((rule): MetricRequirementInput => {
    const s = row.rule_scores[rule]
    offered += s?.total ?? 0
    succeeded += s?.satisfied ?? 0
    const { id, version } = parseRule(rule)
    const due = dueAt(rule, row.period_index)
    return {
      id,
      version,
      capability_id: id,
      weight: 1,
      revealed_at_period: due,
      due_at_period: due,
      criticality: 'normal',
      source: 'ADR-018',
      satisfied: s !== undefined && s.score === 1,
      assertions: [`${rule}#${String(s?.total ?? 0)}-sequences`],
    }
  })
  return {
    period_index: row.period_index,
    duration: 1,
    requirements,
    retired: retiredAt(row.period_index),
    intents_offered: offered,
    intents_succeeded: succeeded,
  }
}

/* ═════════════════════════════════════ repertoires d'etat d'une trajectoire */

function trajectoryStateDir(stateRoot: string, trajectoryKey: string): string {
  const h = createHash('sha256').update(trajectoryKey, 'utf8').digest('hex').slice(0, 24)
  return path.join(stateRoot, '.bench-f-long', h)
}
const dataDirOf = (stateRoot: string, trajectoryKey: string): string => path.join(trajectoryStateDir(stateRoot, trajectoryKey), 'data')
const measuresDirOf = (stateRoot: string, trajectoryKey: string): string =>
  path.join(trajectoryStateDir(stateRoot, trajectoryKey), 'measures')

/** Graine des sequences cachees d'une trajectoire (stable a la reprise, distincte par repetition). */
export function fLongSeedOf(trajectoryKey: string): number {
  return hash32('t66-seed', trajectoryKey)
}

async function persistMeasures(db: string, stateRoot: string, trajectoryKey: string): Promise<void> {
  const rows = readRows(db, trajectoryKey)
  const api = await longitudinalMeasures()
  await api.persistPeriodMeasures({
    benchDataDir: measuresDirOf(stateRoot, trajectoryKey),
    entries: rows.map((row) => ({
      periodKey: row.period_key,
      period: metricPeriodOf(row),
      code: {
        linesAdded: row.code.lines_added,
        linesRemoved: row.code.lines_removed,
        filesTouched: row.code.files_touched,
        testFilesWritten: row.code.test_files_written,
      },
    })),
  })
}

/* ══════════════════════════════════════ une periode F-LONG du pilote ════ */

export interface ControlFLongPilotPeriodInput {
  readonly postgresDatabase: string
  readonly trajectoryKey: string
  readonly periodIndex: number
  readonly workspaceDir: string
  readonly commitSha: string
  readonly usage: readonly ClaudeCliPeriodUsage[]
  /** Racine sous laquelle vivent l'etat BENCH_DATA_DIR et les mesures de la trajectoire. */
  readonly stateRoot: string
}

export function hasFLongPilotPeriod(db: string, trajectoryKey: string, periodIndex: number): boolean {
  return readRows(db, trajectoryKey).some((r) => r.period_index === periodIndex)
}

/**
 * Apres la session de la periode `periodIndex` : le candidat committe joue la
 * trajectoire principale de la periode sur l'etat persistant, puis chaque regle
 * active est notee sur des copies de cet etat ; scores, mesures du code et
 * jetons sont persistes, puis les mesures longitudinales (T65) recalculees sur
 * la serie. Idempotent : une periode deja controlee n'est jamais rejouee.
 */
export async function controlFLongPilotPeriod(input: ControlFLongPilotPeriodInput): Promise<void> {
  const db = input.postgresDatabase
  ensureTable(db)
  if (hasFLongPilotPeriod(db, input.trajectoryKey, input.periodIndex)) return
  const key = periodKeyOf(input.periodIndex)
  const seed = fLongSeedOf(input.trajectoryKey)
  const dataDir = dataDirOf(input.stateRoot, input.trajectoryKey)
  const command = ['node', path.join(input.workspaceDir, CANDIDATE_ENTRYPOINT_FILENAME)]

  const main = await runFLongPeriod({
    candidateCommand: command,
    benchDataDir: dataDir,
    ops: fLongTrajectoryV4(key),
    cwd: input.workspaceDir,
  })

  const ruleScores: Record<string, FLongRuleScore> = {}
  for (const rule of activeRulesV4(key)) {
    ruleScores[rule] = await scoreRuleAtPeriod(rule, input.periodIndex, seed, command, dataDir, input.workspaceDir)
  }

  writeRow(db, {
    trajectory_key: input.trajectoryKey,
    period_index: input.periodIndex,
    period_key: key,
    seed,
    commit_sha: input.commitSha,
    rule_scores: ruleScores,
    code: codeMeasures(input.workspaceDir, input.commitSha),
    tokens: tokensOf(input.usage),
    trajectory: { total: main.responses.length, ok: main.responses.filter((r) => r.ok).length },
  })
  await persistMeasures(db, input.stateRoot, input.trajectoryKey)
}

/* ════════════════════════════════════════════════════ le rapport (A1-A3) */

export interface FLongReportTrajectory {
  readonly trajectory_key: string
  readonly configuration_id: string
  readonly scenario_id: string
}

/** Rang de repetition porte par l'identite de trajectoire (`...--rep<N>`, pilot-conduct). */
function repetitionOf(trajectoryKey: string): number | null {
  const m = /--rep(\d+)$/.exec(trajectoryKey)
  return m === null ? null : Number(m[1])
}

interface Stat {
  readonly mean: number
  readonly min: number
  readonly max: number
  readonly n: number
  readonly per_repetition: string
}

function stat(values: readonly number[], perRepetition: string): Stat | null {
  if (values.length === 0) return null
  const sum = values.reduce((s, v) => s + v, 0)
  return {
    mean: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    n: values.length,
    per_repetition: perRepetition,
  }
}

const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((s, v) => s + v, 0) / xs.length)

interface RepetitionSummary {
  readonly rules: Map<string, number>
  readonly Q: number | null
  readonly R: number | null
  readonly G: number | null
  readonly G_new: number | null
  readonly code: Map<string, number>
  readonly tokens: Map<string, number>
}

/**
 * Le rapport F-LONG de `pilot-conduct` : un enregistrement par (repetition,
 * periode) — scores par regle, Q/R/G/G_new et regressions relus par T65,
 * mesures du code, jetons —, la chronologie de chaque regle par trajectoire
 * (T65), et un agregat par configuration ({mean, min, max, n} de chaque
 * mesure, sans intervalle de confiance).
 */
export async function fLongPilotReport(input: {
  readonly postgresDatabase: string
  readonly stateRoot: string
  readonly trajectories: readonly FLongReportTrajectory[]
}): Promise<Readonly<Json>> {
  const db = input.postgresDatabase
  const api = await longitudinalMeasures()
  const periods: Json[] = []
  const timelines: Json[] = []
  const summaries = new Map<string, RepetitionSummary[]>()
  const allRules = [...new Set(CANDIDATE_LONG_PERIOD_KEYS.flatMap((k) => activeRulesV4(k)))]

  for (const t of input.trajectories.filter((x) => x.scenario_id === F_LONG_SCENARIO_ID)) {
    const rows = readRows(db, t.trajectory_key)
    if (rows.length === 0) continue
    const repetition = repetitionOf(t.trajectory_key)
    const measuresDir = measuresDirOf(input.stateRoot, t.trajectory_key)
    const perRule = new Map<string, number[]>()
    const qs: number[] = []
    const rs: number[] = []
    const gs: number[] = []
    let gNew = 0
    const code = new Map<string, number>()
    const tokens = new Map<string, number>()

    for (const row of rows) {
      const m = await api.readPeriodMeasures({ benchDataDir: measuresDir, periodKey: row.period_key })
      const ruleScores: Record<string, number> = {}
      const sequences: Record<string, Json> = {}
      // T69 (ADR-020 decision 4) : pour chaque regle notee sous 1, la premiere
      // etape non satisfaite d'au moins une sequence, relue de la ligne persistee.
      const diagnostics: Record<string, Json[]> = {}
      for (const [rule, s] of Object.entries(row.rule_scores)) {
        ruleScores[rule] = s.score
        sequences[rule] = { satisfied: s.satisfied, total: s.total, scorer: s.scorer }
        if (s.score < 1) diagnostics[rule] = (s.failures ?? []).map((f) => ({ ...f }))
        perRule.set(rule, [...(perRule.get(rule) ?? []), s.score])
      }
      if (m.Q !== null) qs.push(m.Q)
      if (m.R !== null) rs.push(m.R)
      gs.push(m.G)
      gNew += m.G_new
      for (const [k, v] of Object.entries(row.code)) code.set(k, (code.get(k) ?? 0) + v)
      for (const [k, v] of Object.entries(row.tokens)) tokens.set(k, (tokens.get(k) ?? 0) + v)
      periods.push({
        trajectory_key: t.trajectory_key,
        configuration_id: t.configuration_id,
        repetition,
        period: row.period_key,
        period_index: row.period_index,
        seed: row.seed,
        commit_sha: row.commit_sha,
        rule_scores: ruleScores,
        sequences,
        diagnostics,
        Q: m.Q,
        R: m.R,
        G: m.G,
        G_new: m.G_new,
        regressions: [...(m.regressions ?? [])],
        code: { ...row.code },
        tokens: { ...row.tokens },
        main_trajectory: { ...row.trajectory },
      })
    }

    const timeline: Record<string, Json> = {}
    for (const rule of allRules) {
      const tl = await api.ruleTimeline({ benchDataDir: measuresDir, ruleId: rule })
      timeline[rule] = {
        first_satisfied: tl.firstSatisfiedPeriod,
        regressed_at: [...tl.regressionPeriods],
        recovered_at: [...tl.recoveryPeriods],
      }
    }
    timelines.push({ trajectory_key: t.trajectory_key, configuration_id: t.configuration_id, repetition, rules: timeline })

    const rules = new Map<string, number>()
    for (const [rule, xs] of perRule) {
      const v = mean(xs)
      if (v !== null) rules.set(rule, v)
    }
    const list = summaries.get(t.configuration_id) ?? []
    list.push({ rules, Q: mean(qs), R: mean(rs), G: mean(gs), G_new: gNew, code, tokens })
    summaries.set(t.configuration_id, list)
  }

  const aggregates: Json[] = []
  for (const [configuration, reps] of summaries) {
    const numbers = (pickValue: (r: RepetitionSummary) => number | null | undefined): number[] =>
      reps.map(pickValue).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const put = (target: Json, name: string, values: number[], perRepetition: string): void => {
      const s = stat(values, perRepetition)
      if (s !== null) target[name] = s
    }
    const ruleScores: Json = {}
    for (const rule of allRules) put(ruleScores, rule, numbers((r) => r.rules.get(rule)), 'score moyen sur les periodes ou la regle est active')
    const measures: Json = { rule_scores: ruleScores }
    put(measures, 'Q', numbers((r) => r.Q), 'moyenne sur les periodes (T65/T04)')
    put(measures, 'R', numbers((r) => r.R), 'moyenne sur les periodes (T65/T04)')
    put(measures, 'G', numbers((r) => r.G), 'moyenne sur les periodes des regressions ouvertes (T65/T04)')
    put(measures, 'G_new', numbers((r) => r.G_new), 'total sur la trajectoire des regressions nouvelles (T65/T04)')
    const code: Json = {}
    for (const k of ['lines_added', 'lines_removed', 'files_touched', 'test_files_written']) {
      put(code, k, numbers((r) => r.code.get(k) ?? 0), 'total sur la trajectoire')
    }
    measures['code'] = code
    const tokens: Json = {}
    for (const k of [...USAGE_CATEGORIES, 'total']) put(tokens, k, numbers((r) => r.tokens.get(k) ?? 0), 'total sur la trajectoire')
    measures['tokens'] = tokens
    aggregates.push({ configuration_id: configuration, repetitions: reps.length, measures })
  }

  return {
    scenario_id: F_LONG_SCENARIO_ID,
    contract: DISCRIMINATING_SEQUENCES_CONTRACT,
    periods,
    rule_timelines: timelines,
    aggregates,
  }
}
