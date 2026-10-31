// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T74, ADR-021 décisions 3 et 5 (L198-L204) : les deux
// notateurs F-PLATFORM, qui EXÉCUTENT RÉELLEMENT le candidat.
//
//   scorePlatformTargeted({period, seed, candidateCommand, benchDataDir,
//                          clause?, postgresDatabase?})
//     joue chaque séquence ciblée de la période
//     (`@bench/scenario#generatePlatformTargetedSequences`, même graine ;
//     seulement celles de `clause` si elle est donnée) contre un processus
//     candidat neuf dont BENCH_DATA_DIR est un répertoire vide propre à la
//     séquence (sous `benchDataDir`), et juge chaque attente : la réponse reçue
//     doit être ÉGALE (JSON profond, ordre des clés indifférent) à la réponse
//     attendue. Une séquence est satisfaite quand toutes ses attentes le sont ;
//     score d'une clause = séquences satisfaites / séquences qui la ciblent.
//
//   scorePlatformDifferential({period, seed, candidateCommand, benchDataDir,
//                              postgresDatabase?})
//     joue CHAQUE flux de `generatePlatformDifferentialStreams` contre un
//     processus candidat NEUF (BENCH_DATA_DIR : répertoire vide propre au flux)
//     et contre un modèle attendu neuf. Un flux diverge dès que la réponse du
//     candidat diffère de celle du modèle ; score = flux sans divergence /
//     flux (ADR-021 décision 3 : « la fraction de flux sans divergence »).
//
// ÉCHECS. Chaque échec porte au premier niveau l'opération (`op`), l'attendu
// (`expected` : la réponse ENTIÈRE du modèle), la réponse reçue TELLE QUE REÇUE
// (`received`) et la clause (`clause`) ; plus la requête (`request`) et sa
// place (séquence ou flux, indice d'étape). Ciblé : la clause de l'attente non
// satisfaite. Différentiel : la PREMIÈRE divergence du flux, diagnostiquée
// avec sa clause (`@bench/scenario#diagnosePlatformDivergence` : la clause
// active dont la privation reproduit la réponse reçue, sinon celle qui
// gouverne l'opération).
//
// PERSISTANCE. Avec `postgresDatabase`, chaque échec est inscrit (psql réel,
// socket local) dans la table `bench_f_platform_failures` du schéma public :
// une ligne par échec, colonnes op, clause, expected, received, request.
//
// PROTOCOLE `bench.platform/1` (décrit aussi dans docs/api.md de chaque
// période) : `candidateCommand` (argv) est lancée telle quelle avec
// BENCH_DATA_DIR ; première ligne de stdout {"ready":true,"protocol":
// "bench.platform/1"} ; puis une requête JSON par ligne sur stdin
// `{id, period: 'Pn', at, op, args, tenant?, actor?, version?}` et une réponse
// par requête, dans l'ordre : `{"id": <id>, "response": {ok, ...}}`. La fin de
// stdin termine le processus. Rien dans la note ne dépend de la forme de la
// commande, seulement des réponses.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  PLATFORM_CANDIDATE_PROTOCOL,
  diagnosePlatformDivergence,
  generatePlatformDifferentialStreams,
  generatePlatformTargetedSequences,
  platformCanonicalJson,
  platformExpectedResponses,
  platformPeriodNumber,
  type PlatformCheckStep,
  type PlatformClause,
  type PlatformTargetedSequence,
} from '@bench/scenario'

type Json = Record<string, unknown>

export interface ScorePlatformInput {
  readonly period?: number | string
  readonly periodIndex?: number
  readonly periodId?: string
  readonly seed: number | string
  readonly candidateCommand: readonly string[]
  readonly benchDataDir: string
  readonly postgresDatabase?: string
  /** Processus candidats simultanés (défaut : min(4, cœurs)). */
  readonly concurrency?: number
  /** Délai maximal d'un processus candidat (ms). */
  readonly timeoutMs?: number
  /** Répertoire courant du processus candidat. */
  readonly cwd?: string
  /**
   * T77 : la source de clauses dont on tire séquences, flux et modèle attendu
   * (absente : la source en vigueur). La calibration note ainsi un candidat
   * contre la source qu'elle calibre.
   */
  readonly clauses?: readonly PlatformClause[]
}

export interface ScorePlatformTargetedInput extends ScorePlatformInput {
  readonly clause?: string
}

/** Un échec diagnostiqué : opération, attendu, reçu, clause (ADR-021 décision 3). */
export interface PlatformFailure {
  readonly kind: 'targeted' | 'differential'
  readonly period: string
  readonly op: string
  readonly expected: unknown
  readonly received: unknown
  readonly clause: string
  readonly request: Json
  /** Ciblé : la clause que vise la séquence ; différentiel : absent. */
  readonly target_clause?: string
  readonly sequence_index?: number
  readonly stream_index?: number
  readonly step_index: number
  /** Différentiel : comment la clause a été établie. */
  readonly diagnosis?: 'privation' | 'operation'
}

export interface PlatformClauseScore {
  readonly score: number
  readonly satisfied: number
  readonly total: number
}

export interface ScorePlatformTargetedResult {
  readonly protocol: typeof PLATFORM_CANDIDATE_PROTOCOL
  readonly period: string
  readonly seed: number | string
  readonly clauses: Readonly<Record<string, PlatformClauseScore>>
  readonly score: number
  readonly satisfied: number
  readonly total: number
  readonly failures: readonly PlatformFailure[]
}

export interface ScorePlatformDifferentialResult {
  readonly protocol: typeof PLATFORM_CANDIDATE_PROTOCOL
  readonly period: string
  readonly seed: number | string
  readonly score: number
  readonly satisfied: number
  readonly total: number
  readonly failures: readonly PlatformFailure[]
}

/* ═══════════════════════════════════════ dialogue bench.platform/1 ═══════ */

interface Dialogue {
  /** Réponses dans l'ordre des requêtes (undefined : aucune réponse reçue). */
  readonly responses: (unknown | undefined)[]
  readonly ready: boolean
  readonly diagnostic: string
}

function dialoguer(input: ScorePlatformInput, dataDir: string, requetes: readonly Json[]): Promise<Dialogue> {
  const [cmd, ...args] = input.candidateCommand
  return new Promise((resolve) => {
    let fini = false
    const child = spawn(cmd as string, args, {
      env: { ...process.env, BENCH_DATA_DIR: dataDir },
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    })
    const morceaux: Buffer[] = []
    let erreurs = ''
    const minuteur = setTimeout(() => child.kill('SIGKILL'), input.timeoutMs ?? 300_000)
    child.stdout.on('data', (d: Buffer) => morceaux.push(d))
    child.stderr.on('data', (d: Buffer) => {
      if (erreurs.length < 4000) erreurs += d.toString('utf8')
    })
    const terminer = (motif: string): void => {
      if (fini) return
      fini = true
      clearTimeout(minuteur)
      const lignes = Buffer.concat(morceaux)
        .toString('utf8')
        .split('\n')
        .filter((l) => l.trim() !== '')
      let pret: unknown = null
      try {
        pret = JSON.parse(lignes[0] ?? 'null')
      } catch {
        pret = null
      }
      const ready = estObjet(pret) && pret['ready'] === true && pret['protocol'] === PLATFORM_CANDIDATE_PROTOCOL
      const parId = new Map<string, unknown>()
      const dansLOrdre: unknown[] = []
      for (const l of lignes.slice(ready ? 1 : 0)) {
        try {
          const j = JSON.parse(l) as unknown
          if (!estObjet(j) || !('response' in j)) continue
          parId.set(String(j['id']), j['response'])
          dansLOrdre.push(j['response'])
        } catch {
          /* ligne illisible : ignorée */
        }
      }
      const responses = requetes.map((q, i) => (parId.has(String(q['id'])) ? parId.get(String(q['id'])) : parId.size === 0 ? dansLOrdre[i] : undefined))
      resolve({ responses, ready, diagnostic: `${motif}${erreurs === '' ? '' : ` ; stderr : ${erreurs.slice(0, 600)}`}` })
    }
    child.on('error', (e) => terminer(`lancement impossible : ${String(e.message)}`))
    child.on('close', (code, signal) => terminer(`fin du candidat (code ${String(code)}, signal ${String(signal)})`))
    child.stdin.on('error', () => {
      /* le candidat a fermé son entrée : ses réponses disent le reste */
    })
    for (const q of requetes) child.stdin.write(`${JSON.stringify(q)}\n`)
    child.stdin.end()
  })
}

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v)

/** La requête bench.platform/1 d'une étape. */
function requete(id: string, n: number, s: PlatformCheckStep): Json {
  const q: Json = { id, period: `P${String(n)}`, at: s.at, op: s.op, args: s.args }
  if (s.tenant !== undefined) q['tenant'] = s.tenant
  if (s.actor !== undefined) q['actor'] = s.actor
  if (s.version !== undefined) q['version'] = s.version
  return q
}

const corps = (s: PlatformCheckStep): Json => {
  const q: Json = { at: s.at, op: s.op, args: s.args }
  if (s.tenant !== undefined) q['tenant'] = s.tenant
  if (s.actor !== undefined) q['actor'] = s.actor
  if (s.version !== undefined) q['version'] = s.version
  return q
}

/** Exécute `travaux` avec au plus `k` en vol ; résultats dans l'ordre. */
async function enParallele<T>(k: number, nb: number, travail: (i: number) => Promise<T>): Promise<T[]> {
  const out = new Array<T>(nb)
  let suivant = 0
  const ouvrier = async (): Promise<void> => {
    while (suivant < nb) {
      const i = suivant
      suivant += 1
      out[i] = await travail(i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(k, nb)) }, () => ouvrier()))
  return out
}

function verifierEntree(input: Pick<ScorePlatformInput, 'candidateCommand' | 'benchDataDir' | 'period' | 'periodIndex' | 'periodId'>): number {
  if (!Array.isArray(input.candidateCommand) || input.candidateCommand.length === 0 || typeof input.candidateCommand[0] !== 'string') {
    throw new Error('F-PLATFORM : candidateCommand vide')
  }
  if (typeof input.benchDataDir !== 'string' || input.benchDataDir.length === 0) throw new Error('F-PLATFORM : benchDataDir absent')
  fs.mkdirSync(input.benchDataDir, { recursive: true })
  return platformPeriodNumber(input)
}

const parallelisme = (input: ScorePlatformInput): number =>
  Math.max(1, Math.floor(input.concurrency ?? Math.min(4, typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length)))

/** Un répertoire d'état VIDE, neuf, propre à une séquence ou un flux. */
const repertoireNeuf = (racine: string, prefixe: string): string => fs.mkdtempSync(path.join(racine, prefixe))

/* ═══════════════════════════════════════════════════ notateur ciblé ═════ */

export async function scorePlatformTargeted(input: ScorePlatformTargetedInput): Promise<ScorePlatformTargetedResult> {
  const n = verifierEntree(input)
  const lot = generatePlatformTargetedSequences({
    period: n,
    seed: input.seed,
    ...(input.clause !== undefined ? { clause: input.clause } : {}),
    ...(input.clauses !== undefined ? { clauses: input.clauses } : {}),
  })
  const sequences: readonly PlatformTargetedSequence[] = lot.sequences

  const jouer = async (i: number): Promise<{ satisfaite: boolean; failures: PlatformFailure[] }> => {
    const seq = sequences[i] as PlatformTargetedSequence
    const dir = repertoireNeuf(input.benchDataDir, `seq-${String(i)}-`)
    const requetes = seq.steps.map((s, j) => requete(`s${String(i)}-${String(j)}`, n, s))
    const d = await dialoguer(input, dir, requetes)
    const failures: PlatformFailure[] = []
    seq.steps.forEach((s, j) => {
      const recu = d.responses[j]
      if (recu !== undefined && platformCanonicalJson(recu) === platformCanonicalJson(s.expect.response)) return
      failures.push({
        kind: 'targeted',
        period: `P${String(n)}`,
        op: s.op,
        expected: s.expect.response,
        received: recu === undefined ? null : recu,
        clause: s.expect.clause,
        request: corps(s),
        target_clause: seq.clause,
        sequence_index: seq.index,
        step_index: j,
      })
    })
    return { satisfaite: failures.length === 0, failures }
  }
  const issues = await enParallele(parallelisme(input), sequences.length, jouer)

  const parClause = new Map<string, { satisfied: number; total: number }>()
  sequences.forEach((s, i) => {
    const e = parClause.get(s.clause) ?? { satisfied: 0, total: 0 }
    e.total += 1
    if (issues[i]?.satisfaite === true) e.satisfied += 1
    parClause.set(s.clause, e)
  })
  const clauses: Record<string, PlatformClauseScore> = {}
  for (const [c, e] of parClause) clauses[c] = { score: e.total > 0 ? e.satisfied / e.total : 0, satisfied: e.satisfied, total: e.total }
  const failures = issues.flatMap((x) => x.failures)
  const satisfied = issues.filter((x) => x.satisfaite).length
  const result: ScorePlatformTargetedResult = {
    protocol: PLATFORM_CANDIDATE_PROTOCOL,
    period: `P${String(n)}`,
    seed: input.seed,
    clauses,
    score: sequences.length > 0 ? satisfied / sequences.length : 0,
    satisfied,
    total: sequences.length,
    failures,
  }
  if (input.postgresDatabase !== undefined) persisterEchecs(input.postgresDatabase, input.seed, failures)
  return result
}

/* ═════════════════════════════════════════════ notateur différentiel ═════ */

/** Budget du diagnostic par privation, par notation (ms) ; au-delà, la clause qui gouverne l'opération. */
const BUDGET_DIAGNOSTIC_MS = 4_000

export async function scorePlatformDifferential(input: ScorePlatformInput): Promise<ScorePlatformDifferentialResult> {
  const n = verifierEntree(input)
  const { streams } = generatePlatformDifferentialStreams({ period: n, seed: input.seed, ...(input.clauses !== undefined ? { clauses: input.clauses } : {}) })

  const jouer = async (i: number): Promise<{ index: number; recu: unknown; attendu: Json } | null> => {
    const f = streams[i]
    if (f === undefined) return null
    const dir = repertoireNeuf(input.benchDataDir, `stream-${String(i)}-`)
    const requetes = f.steps.map((s, j) => requete(`f${String(i)}-${String(j)}`, n, s))
    const d = await dialoguer(input, dir, requetes)
    // Un modèle attendu NEUF par flux, sur l'état vide.
    const attendus = platformExpectedResponses(n, f.steps, input.clauses)
    for (let j = 0; j < f.steps.length; j += 1) {
      const recu = d.responses[j]
      const attendu = attendus[j] as Json
      if (recu === undefined || platformCanonicalJson(recu) !== platformCanonicalJson(attendu)) {
        return { index: j, recu: recu === undefined ? null : recu, attendu }
      }
    }
    return null
  }
  const divergences = await enParallele(parallelisme(input), streams.length, jouer)

  const failures: PlatformFailure[] = []
  const deadline = Date.now() + BUDGET_DIAGNOSTIC_MS
  divergences.forEach((dv, i) => {
    if (dv === null) return
    const f = streams[i]
    if (f === undefined) return
    const s = f.steps[dv.index] as PlatformCheckStep
    const diag = diagnosePlatformDivergence({
      period: n,
      steps: f.steps,
      index: dv.index,
      received: dv.recu,
      deadline,
      ...(input.clauses !== undefined ? { clauses: input.clauses } : {}),
    })
    failures.push({
      kind: 'differential',
      period: `P${String(n)}`,
      op: s.op,
      expected: dv.attendu,
      received: dv.recu,
      clause: diag.clause,
      request: corps(s),
      stream_index: f.index,
      step_index: dv.index,
      diagnosis: diag.method,
    })
  })
  const total = streams.length
  const satisfied = total - failures.length
  const result: ScorePlatformDifferentialResult = {
    protocol: PLATFORM_CANDIDATE_PROTOCOL,
    period: `P${String(n)}`,
    seed: input.seed,
    score: total > 0 ? satisfied / total : 0,
    satisfied,
    total,
    failures,
  }
  if (input.postgresDatabase !== undefined) persisterEchecs(input.postgresDatabase, input.seed, failures)
  return result
}

/* ═══════════════════════════════════════════ PostgreSQL réel (psql) ═════ */

function socketDir(): string {
  const h = process.env['PGHOST']
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h
  return '/var/run/postgresql'
}
function dsnFor(db: string): string {
  const user = process.env['PGUSER'] ?? os.userInfo().username
  return `postgresql://${encodeURIComponent(user)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(socketDir())}`
}
/** Exécute un script SQL passé sur l'entrée standard (aucune limite de taille d'argument). */
function runPsql(db: string, sql: string): string {
  try {
    return execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-f', '-'], {
      input: sql,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    throw new Error(`f-platform.psql(${db}) a échoué : ${(err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? '')}`.slice(0, 800))
  }
}
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`
const jsonb = (v: unknown): string => `${lit(JSON.stringify(v === undefined ? null : v))}::jsonb`

/* Partagés avec le banc de performance et de concurrence (T75, f-platform-perf.ts). */
export { verifierEntree as verifyPlatformInput, runPsql as runPlatformPsql, lit as sqlLiteral, jsonb as jsonbLiteral }

export const PLATFORM_FAILURES_TABLE = 'bench_f_platform_failures'

function persisterEchecs(db: string, seed: number | string, failures: readonly PlatformFailure[]): void {
  const lignes = failures.map(
    (f) =>
      `(${lit(f.kind)}, ${lit(f.period)}, ${lit(String(seed))}, ${lit(f.clause)}, ${lit(f.op)}, ${f.target_clause === undefined ? 'NULL' : lit(f.target_clause)}, ` +
      `${String(f.sequence_index ?? f.stream_index ?? 0)}, ${String(f.step_index)}, ${f.diagnosis === undefined ? 'NULL' : lit(f.diagnosis)}, ` +
      `${jsonb(f.request)}, ${jsonb(f.expected)}, ${jsonb(f.received)})`,
  )
  const sql = [
    `CREATE TABLE IF NOT EXISTS ${PLATFORM_FAILURES_TABLE} (
       id bigserial PRIMARY KEY,
       kind text NOT NULL,
       period text NOT NULL,
       seed text NOT NULL,
       clause text NOT NULL,
       op text NOT NULL,
       target_clause text,
       batch_index integer NOT NULL,
       step_index integer NOT NULL,
       diagnosis text,
       request jsonb NOT NULL,
       expected jsonb NOT NULL,
       received jsonb,
       created_at timestamptz NOT NULL DEFAULT now()
     );`,
  ]
  if (lignes.length > 0) {
    sql.push(
      `INSERT INTO ${PLATFORM_FAILURES_TABLE} (kind, period, seed, clause, op, target_clause, batch_index, step_index, diagnosis, request, expected, received) VALUES\n${lignes.join(',\n')};`,
    )
  }
  runPsql(db, sql.join('\n'))
}
