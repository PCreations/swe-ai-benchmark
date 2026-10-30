// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T75, ADR-021 décision 3 (L206-L212) : le banc de
// PERFORMANCE et de CONCURRENCE F-PLATFORM, qui EXÉCUTE RÉELLEMENT le candidat
// (protocole `bench.platform/1`, voir docs/api.md et f-platform-checks-scoring.ts).
//
//   measurePlatformLatency({period: 20, seed, candidateCommand, benchDataDir,
//                           postgresDatabase?})
//     un candidat NEUF sur un BENCH_DATA_DIR vide : le locataire du profil de
//     volume, ses membres et ses créneaux, puis UN import_bookings de
//     `reservations` lignes (toutes acceptées : voir la répartition dans
//     `@bench/scenario#planPlatformVolume`), mesuré contre le plafond d'import ;
//     puis, pour chaque opération active, `warmup` requêtes non comptées et
//     `samples` échantillons, UNE requête en vol à la fois. Un échantillon est
//     la durée côté banc (`performance.now()`), de l'instant qui précède
//     l'écriture de la requête à celui où sa réponse complète est lue ; p95 au
//     rang le plus proche ; plafond de l'opération lu dans la clause (P20.R3).
//     -> { pass, import, operations }.
//
//   runPlatformConcurrencyTrials({period: 21, seed, candidateCommand,
//                                 benchDataDir, postgresDatabase?})
//     un candidat NEUF, BENCH_PLATFORM_SOCKET posé (extension « connexions
//     multiples » de bench.platform/1) ; `clients_paralleles` connexions ;
//     au moins `essais_paralleles_min` essais, chaque scénario du bloc
//     `concurrence` de la racine au moins ceil(min / scénarios) fois ; un essai
//     = une requête par connexion, toutes écrites avant d'attendre la moindre
//     réponse (barrière), puis les vérifications séquentielles.
//     -> { pass, trials, violations }.
//
// VALEURS. Plafonds et paramètres : la source de clauses (P20.R3, P21.R3) via
// `@bench/scenario`. Profil d'import (`periodes.P20.volume`), horloges et noms
// des scénarios (`periodes.P21.concurrence`) : la racine gelée
// acceptance/reference-platform/F-PLATFORM-P17-P24.json, LUE (jamais écrite),
// cherchée depuis le répertoire courant puis depuis ce module (ou donnée par
// `referenceRoot`).
//
// PERSISTANCE (psql réel, socket local, schéma public) : chaque mesure dans
// `bench_f_platform_latency` (op, p95_ms, ceiling_ms, ... et la mesure entière
// en jsonb) ; chaque violation dans `bench_f_platform_concurrency_violations`
// (trial, scenario, kind, clause, detail).
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import {
  PLATFORM_CANDIDATE_PROTOCOL,
  judgePlatformConcurrencyTrial,
  planPlatformConcurrency,
  planPlatformVolume,
  platformConcurrencyParameters,
  platformLatencyCeiling,
  platformLatencyCeilings,
  platformP95,
  type PlatformCheckStep,
  type PlatformConcurrencyViolation,
  type PlatformVolumeProfile,
} from '@bench/scenario'

import { jsonbLiteral, runPlatformPsql, sqlLiteral, verifyPlatformInput } from './f-platform-checks-scoring.js'

type Json = Record<string, unknown>
const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v)

export interface PlatformBenchInput {
  readonly period?: number | string
  readonly periodIndex?: number
  readonly periodId?: string
  readonly seed?: number | string
  readonly candidateCommand: readonly string[]
  readonly benchDataDir: string
  readonly postgresDatabase?: string
  /** Délai maximal d'une requête (ms ; défaut 600 000). */
  readonly timeoutMs?: number
  readonly cwd?: string
  /** Chemin de F-PLATFORM-P17-P24.json (sinon cherché, voir l'en-tête). */
  readonly referenceRoot?: string
}

export interface MeasurePlatformLatencyInput extends PlatformBenchInput {
  readonly warmup?: number
  readonly samples?: number
}

/* ═════════════════════════════════════════════ racine gelée (lecture) ═══ */

const RACINE = path.join('acceptance', 'reference-platform', 'F-PLATFORM-P17-P24.json')

function cheminRacine(input: PlatformBenchInput): string {
  if (input.referenceRoot !== undefined) return input.referenceRoot
  const departs: string[] = [process.cwd()]
  try {
    departs.push(path.dirname(fileURLToPath(import.meta.url)))
  } catch {
    /* module hors fichier */
  }
  for (const d of departs) {
    let dir = d
    for (let i = 0; i < 12; i += 1) {
      const f = path.join(dir, RACINE)
      if (fs.existsSync(f)) return f
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  throw new Error(`F-PLATFORM : racine gelee ${RACINE} introuvable (depuis ${departs.join(', ')}) ; passer referenceRoot`)
}

function periodeGelee(input: PlatformBenchInput, n: number): Json {
  const f = cheminRacine(input)
  const d = JSON.parse(fs.readFileSync(f, 'utf8')) as Json
  const e = estObjet(d['periodes']) ? d['periodes'][`P${String(n)}`] : undefined
  if (!estObjet(e)) throw new Error(`F-PLATFORM : ${f} sans periodes.P${String(n)}`)
  return e
}

/** Le bloc de la racine (volume ou concurrence) en vigueur à n : celui de la plus récente période <= n qui le porte. */
function blocGele(input: PlatformBenchInput, n: number, cle: string): { bloc: Json; horloge: string } {
  const horloge = periodeGelee(input, n)['horloge']
  if (typeof horloge !== 'string') throw new Error(`F-PLATFORM : P${String(n)} sans horloge`)
  for (let m = n; m >= 17; m -= 1) {
    const b = periodeGelee(input, m)[cle]
    if (estObjet(b)) return { bloc: b, horloge }
  }
  throw new Error(`F-PLATFORM : aucun bloc ${cle} dans la racine jusqu'a P${String(n)}`)
}

/* ═════════════════════════════════════ candidat interactif (bench.platform/1) */

interface Reponse {
  readonly response: unknown
  /** Durée côté banc : avant l'écriture -> réponse complète lue (ms). */
  readonly latency: number
}

/** Un client NDJSON : requêtes écrites, réponses lues dans l'ordre, appariées par id. */
class Client {
  private tampon = ''
  private readonly attente = new Map<string, { t0: number; resolve: (r: Reponse) => void; reject: (e: Error) => void; minuteur: NodeJS.Timeout }>()
  private ferme: Error | null = null
  constructor(
    private readonly ecrire: (s: string) => void,
    private readonly delaiMs: number,
    private readonly nom: string,
  ) {}

  /** Données reçues (après la ligne prête pour stdout). */
  recevoir(d: string): void {
    const t1 = performance.now()
    this.tampon += d
    let i = this.tampon.indexOf('\n')
    while (i >= 0) {
      const ligne = this.tampon.slice(0, i)
      this.tampon = this.tampon.slice(i + 1)
      if (ligne.trim() !== '') this.ligne(ligne, t1)
      i = this.tampon.indexOf('\n')
    }
  }

  private ligne(l: string, t1: number): void {
    let j: unknown
    try {
      j = JSON.parse(l)
    } catch {
      return
    }
    if (!estObjet(j) || !('response' in j)) return
    const id = String(j['id'])
    const a = this.attente.get(id)
    if (a === undefined) return
    this.attente.delete(id)
    clearTimeout(a.minuteur)
    a.resolve({ response: j['response'], latency: t1 - a.t0 })
  }

  /** Écrit la requête et rend la promesse de sa réponse ; `t0` est pris juste avant l'écriture. */
  envoyer(q: Json): Promise<Reponse> {
    if (this.ferme !== null) return Promise.reject(this.ferme)
    const id = String(q['id'])
    const ligne = `${JSON.stringify(q)}\n`
    return new Promise<Reponse>((resolve, reject) => {
      const minuteur = setTimeout(() => {
        this.attente.delete(id)
        reject(new Error(`F-PLATFORM : ${this.nom} : pas de reponse a ${id} en ${String(this.delaiMs)} ms`))
      }, this.delaiMs)
      const t0 = performance.now()
      this.attente.set(id, { t0, resolve, reject, minuteur })
      this.ecrire(ligne)
    })
  }

  fermer(e: Error): void {
    this.ferme = e
    for (const [, a] of this.attente) {
      clearTimeout(a.minuteur)
      a.reject(e)
    }
    this.attente.clear()
  }
}

class Candidat {
  readonly enfant: ChildProcessWithoutNullStreams
  readonly stdin: Client
  private erreurs = ''
  private sortie = ''
  private pret = false
  readonly ligneDePret: Promise<Json>
  readonly fin: Promise<void>
  private readonly connexions: net.Socket[] = []

  constructor(input: PlatformBenchInput, dataDir: string, env: Record<string, string>, private readonly delaiMs: number) {
    const [cmd, ...args] = input.candidateCommand
    this.enfant = spawn(cmd as string, args, {
      env: { ...process.env, ...env, BENCH_DATA_DIR: dataDir },
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    })
    this.enfant.stdin.on('error', () => {
      /* le candidat a fermé son entrée : les réponses manquantes le diront */
    })
    this.stdin = new Client((s) => this.enfant.stdin.write(s), delaiMs, 'stdin')
    this.enfant.stdout.setEncoding('utf8')
    this.enfant.stderr.setEncoding('utf8')
    this.enfant.stderr.on('data', (d: string) => {
      if (this.erreurs.length < 4000) this.erreurs += d
    })
    let resoudrePret: (j: Json) => void = () => undefined
    let rejeterPret: (e: Error) => void = () => undefined
    this.ligneDePret = new Promise<Json>((res, rej) => {
      resoudrePret = res
      rejeterPret = rej
    })
    const minuteurPret = setTimeout(() => rejeterPret(new Error(`F-PLATFORM : candidat non pret en ${String(delaiMs)} ms ; stderr : ${this.erreurs.slice(0, 600)}`)), delaiMs)
    this.enfant.stdout.on('data', (d: string) => {
      if (this.pret) {
        this.stdin.recevoir(d)
        return
      }
      this.sortie += d
      const i = this.sortie.indexOf('\n')
      if (i < 0) return
      const premiere = this.sortie.slice(0, i)
      const reste = this.sortie.slice(i + 1)
      this.pret = true
      clearTimeout(minuteurPret)
      let j: unknown = null
      try {
        j = JSON.parse(premiere)
      } catch {
        j = null
      }
      if (!estObjet(j) || j['ready'] !== true || j['protocol'] !== PLATFORM_CANDIDATE_PROTOCOL) {
        rejeterPret(new Error(`F-PLATFORM : premiere ligne du candidat non conforme a ${PLATFORM_CANDIDATE_PROTOCOL} : ${premiere.slice(0, 200)}`))
        return
      }
      resoudrePret(j)
      if (reste !== '') this.stdin.recevoir(reste)
    })
    this.fin = new Promise<void>((res) => {
      this.enfant.on('close', (code, signal) => {
        clearTimeout(minuteurPret)
        const e = new Error(`F-PLATFORM : fin du candidat (code ${String(code)}, signal ${String(signal)}) ; stderr : ${this.erreurs.slice(0, 600)}`)
        rejeterPret(e)
        this.stdin.fermer(e)
        res()
      })
      this.enfant.on('error', (e) => {
        clearTimeout(minuteurPret)
        const err = new Error(`F-PLATFORM : lancement impossible : ${e.message}`)
        rejeterPret(err)
        this.stdin.fermer(err)
        res()
      })
    })
  }

  /** Ouvre une connexion au socket annoncé par la ligne prête. */
  connecter(socket: string, nom: string): Promise<Client> {
    return new Promise<Client>((resolve, reject) => {
      const s = net.createConnection(socket)
      s.setNoDelay(true)
      s.setEncoding('utf8')
      const c = new Client((x) => s.write(x), this.delaiMs, nom)
      s.on('data', (d: string) => c.recevoir(d))
      s.once('connect', () => resolve(c))
      s.on('error', (e) => {
        c.fermer(new Error(`F-PLATFORM : connexion ${nom} : ${e.message}`))
        reject(e)
      })
      s.on('close', () => c.fermer(new Error(`F-PLATFORM : connexion ${nom} fermee par le candidat`)))
      this.connexions.push(s)
    })
  }

  /** Ferme les connexions, puis stdin ; attend la fin (SIGKILL au-delà du délai). */
  async terminer(): Promise<void> {
    for (const s of this.connexions) s.end()
    this.enfant.stdin.end()
    const minuteur = setTimeout(() => this.enfant.kill('SIGKILL'), 30_000)
    await this.fin
    clearTimeout(minuteur)
  }

  tuer(): void {
    for (const s of this.connexions) s.destroy()
    if (this.enfant.exitCode === null && this.enfant.signalCode === null) this.enfant.kill('SIGKILL')
  }
}

function requete(id: string, n: number, s: PlatformCheckStep): Json {
  const q: Json = { id, period: `P${String(n)}`, at: s.at, op: s.op, args: s.args }
  if (s.tenant !== undefined) q['tenant'] = s.tenant
  if (s.actor !== undefined) q['actor'] = s.actor
  if (s.version !== undefined) q['version'] = s.version
  return q
}

const okDe = (r: unknown): boolean => estObjet(r) && r['ok'] === true

/** Un BENCH_DATA_DIR vide, neuf. */
const repertoireNeuf = (racine: string, prefixe: string): string => fs.mkdtempSync(path.join(racine, prefixe))

/* ═════════════════════════════════════════════════ mesure de latence (A1) */

export interface PlatformLatencyMeasure {
  readonly op: string
  readonly p95_ms: number
  readonly ceiling_ms: number
  readonly clause: string
  readonly samples: number
  readonly warmup: number
  readonly latencies_ms: readonly number[]
  readonly request_ids: readonly string[]
  /** Échantillons refusés (ok !== true) : une mesure qui en compte échoue. */
  readonly refused: number
  readonly pass: boolean
}

export interface PlatformLatencyImport {
  readonly latency_ms: number
  readonly ceiling_ms: number
  readonly request_id: string
  readonly clause: string
  readonly rows: number
  readonly accepted: number | null
  readonly pass: boolean
}

export interface MeasurePlatformLatencyResult {
  readonly protocol: typeof PLATFORM_CANDIDATE_PROTOCOL
  readonly period: string
  readonly seed: number | string | null
  readonly clause: string
  readonly tenant: string
  readonly import: PlatformLatencyImport
  readonly operations: Readonly<Record<string, PlatformLatencyMeasure>>
  readonly pass: boolean
}

export async function measurePlatformLatency(input: MeasurePlatformLatencyInput): Promise<MeasurePlatformLatencyResult> {
  const n = verifyPlatformInput(input)
  const plafonds = platformLatencyCeilings(n)
  const { bloc, horloge } = blocGele(input, n, 'volume')
  const plan = planPlatformVolume({
    period: n,
    profile: bloc as unknown as PlatformVolumeProfile,
    clock: horloge,
    ...(input.warmup !== undefined ? { warmup: input.warmup } : {}),
    ...(input.samples !== undefined ? { samples: input.samples } : {}),
  })
  if (plan.rows !== plafonds.volumeReservations) {
    throw new Error(`F-PLATFORM : profil de volume de ${String(plan.rows)} lignes, ${plafonds.clause} en exige ${String(plafonds.volumeReservations)}`)
  }
  const delai = input.timeoutMs ?? 600_000
  const dir = repertoireNeuf(input.benchDataDir, 'latency-')
  const c = new Candidat(input, dir, {}, delai)
  let seq = 0
  const id = (prefixe: string): string => `${prefixe}-${String((seq += 1))}`
  try {
    await c.ligneDePret
    // Préparation : en flux (non mesurée), puis contrôle des réponses.
    const prep = await Promise.all(plan.setup.map((s) => c.stdin.envoyer(requete(id('setup'), n, s))))
    const refus = prep.filter((r) => !okDe(r.response)).length
    if (refus > 0) throw new Error(`F-PLATFORM : ${String(refus)} requete(s) de preparation refusee(s), ex. ${JSON.stringify(prep.find((r) => !okDe(r.response))?.response).slice(0, 300)}`)

    // L'import de volume, mesuré.
    const idImport = id('import')
    const ri = await c.stdin.envoyer(requete(idImport, n, plan.import))
    const accepted = estObjet(ri.response) && typeof ri.response['accepted'] === 'number' ? ri.response['accepted'] : null
    const imp: PlatformLatencyImport = {
      latency_ms: ri.latency,
      ceiling_ms: plafonds.importCeilingMs,
      request_id: idImport,
      clause: plafonds.clause,
      rows: plan.rows,
      accepted,
      pass: ri.latency <= plafonds.importCeilingMs && okDe(ri.response) && accepted === plan.rows,
    }

    // Chaque opération : échauffement puis échantillons, une requête en vol à la fois.
    const operations: Record<string, PlatformLatencyMeasure> = {}
    for (const o of plan.operations) {
      for (const s of o.warmup) await c.stdin.envoyer(requete(id(`w-${o.op}`), n, s))
      const lat: number[] = []
      const ids: string[] = []
      let refused = 0
      for (const s of o.samples) {
        const rid = id(`m-${o.op}`)
        const r = await c.stdin.envoyer(requete(rid, n, s))
        lat.push(r.latency)
        ids.push(rid)
        if (!okDe(r.response)) refused += 1
      }
      const p95 = platformP95(lat)
      const ceiling = platformLatencyCeiling(plafonds, o.op)
      operations[o.op] = {
        op: o.op,
        p95_ms: p95,
        ceiling_ms: ceiling,
        clause: plafonds.clause,
        samples: lat.length,
        warmup: o.warmup.length,
        latencies_ms: lat,
        request_ids: ids,
        refused,
        pass: p95 <= ceiling && refused === 0,
      }
    }
    await c.terminer()
    const result: MeasurePlatformLatencyResult = {
      protocol: PLATFORM_CANDIDATE_PROTOCOL,
      period: `P${String(n)}`,
      seed: input.seed ?? null,
      clause: plafonds.clause,
      tenant: plan.tenant,
      import: imp,
      operations,
      pass: imp.pass && Object.values(operations).every((m) => m.pass),
    }
    if (input.postgresDatabase !== undefined) persisterLatence(input.postgresDatabase, result)
    return result
  } finally {
    c.tuer()
  }
}

/* ═════════════════════════════════════════════════ essais parallèles (A2) */

export interface PlatformConcurrencyTrial {
  readonly scenario: string
  readonly clients: number
  /** Les `id` (protocole) des requêtes PARALLÈLES de l'essai. */
  readonly request_ids: readonly string[]
  readonly violations: readonly PlatformConcurrencyViolation[]
}

export interface RunPlatformConcurrencyTrialsResult {
  readonly protocol: typeof PLATFORM_CANDIDATE_PROTOCOL
  readonly period: string
  readonly seed: number | string | null
  readonly clause: string
  readonly trials: readonly PlatformConcurrencyTrial[]
  readonly violations: readonly PlatformConcurrencyViolation[]
  readonly pass: boolean
}

/** Chemin de socket Unix court (sun_path <= 100 octets). */
function cheminSocket(): { dossier: string; socket: string } {
  for (const base of [os.tmpdir(), '/tmp']) {
    try {
      const dossier = fs.mkdtempSync(path.join(base, 'bp-'))
      const socket = path.join(dossier, 'c.sock')
      if (Buffer.byteLength(socket) <= 100) return { dossier, socket }
      fs.rmSync(dossier, { recursive: true, force: true })
    } catch {
      /* base suivante */
    }
  }
  throw new Error('F-PLATFORM : aucun chemin de socket Unix de 100 octets au plus')
}

export async function runPlatformConcurrencyTrials(input: PlatformBenchInput): Promise<RunPlatformConcurrencyTrialsResult> {
  const n = verifyPlatformInput(input)
  const params = platformConcurrencyParameters(n)
  const { bloc, horloge } = blocGele(input, n, 'concurrence')
  const scenarios = Array.isArray(bloc['scenarios']) ? bloc['scenarios'].map((s) => String(estObjet(s) ? s['nom'] : s)) : []
  const plan = planPlatformConcurrency({ period: n, clock: horloge, scenarios, minTrials: params.minTrials, parallelClients: params.parallelClients })
  const delai = input.timeoutMs ?? 600_000
  const dir = repertoireNeuf(input.benchDataDir, 'concurrency-')
  const { dossier, socket } = cheminSocket()
  const c = new Candidat(input, dir, { BENCH_PLATFORM_SOCKET: socket }, delai)
  let seq = 0
  const id = (prefixe: string): string => `${prefixe}-${String((seq += 1))}`
  try {
    const pret = await c.ligneDePret
    const annonce = typeof pret['socket'] === 'string' ? pret['socket'] : null
    if (annonce === null) throw new Error(`F-PLATFORM : la ligne prete n'annonce pas le socket (BENCH_PLATFORM_SOCKET=${socket}) : extension « connexions multiples » non suivie`)
    const clients: Client[] = []
    for (let k = 0; k < params.parallelClients; k += 1) clients.push(await c.connecter(annonce, `connexion ${String(k + 1)}`))

    const sequentiel = async (steps: readonly PlatformCheckStep[], prefixe: string): Promise<unknown[]> => {
      const out: unknown[] = []
      for (const s of steps) out.push((await c.stdin.envoyer(requete(id(prefixe), n, s))).response)
      return out
    }
    const prep = await sequentiel(plan.setup, 'setup')
    if (prep.some((r) => !okDe(r))) throw new Error(`F-PLATFORM : preparation refusee : ${JSON.stringify(prep.find((r) => !okDe(r))).slice(0, 300)}`)

    const trials: PlatformConcurrencyTrial[] = []
    const violations: PlatformConcurrencyViolation[] = []
    for (const t of plan.trials) {
      const pre = await sequentiel(t.setup, `t${String(t.index)}-setup`)
      if (pre.some((r) => !okDe(r))) throw new Error(`F-PLATFORM : preparation de l'essai ${String(t.index)} refusee : ${JSON.stringify(pre).slice(0, 300)}`)
      // Barrière : toutes les requêtes écrites, chacune sur sa connexion, avant d'attendre.
      const ids = t.parallel.map(() => id(`t${String(t.index)}-p`))
      const enVol = t.parallel.map((s, k) => (clients[k] as Client).envoyer(requete(ids[k] as string, n, s)))
      const responses = (await Promise.all(enVol)).map((r) => r.response)
      const checks = await sequentiel(t.checks, `t${String(t.index)}-check`)
      const vs = judgePlatformConcurrencyTrial({ trial: t, responses, checks })
      violations.push(...vs)
      trials.push({ scenario: t.scenario, clients: t.parallel.length, request_ids: ids, violations: vs })
    }
    await c.terminer()
    const result: RunPlatformConcurrencyTrialsResult = {
      protocol: PLATFORM_CANDIDATE_PROTOCOL,
      period: `P${String(n)}`,
      seed: input.seed ?? null,
      clause: params.clause,
      trials,
      violations,
      pass: violations.length === 0,
    }
    if (input.postgresDatabase !== undefined) persisterViolations(input.postgresDatabase, result)
    return result
  } finally {
    c.tuer()
    fs.rmSync(dossier, { recursive: true, force: true })
  }
}

/* ═══════════════════════════════════════════ PostgreSQL réel (psql) ═════ */

export const PLATFORM_LATENCY_TABLE = 'bench_f_platform_latency'
export const PLATFORM_CONCURRENCY_VIOLATIONS_TABLE = 'bench_f_platform_concurrency_violations'

const nombre = (x: number): string => (Number.isFinite(x) ? String(x) : 'NULL')

function persisterLatence(db: string, r: MeasurePlatformLatencyResult): void {
  const seed = sqlLiteral(String(r.seed))
  const lignes = Object.values(r.operations).map(
    (m) =>
      `(${sqlLiteral(r.period)}, ${seed}, ${sqlLiteral(m.op)}, ${sqlLiteral(m.clause)}, ${nombre(m.p95_ms)}, ${nombre(m.ceiling_ms)}, ${String(m.samples)}, ${String(m.warmup)}, ${String(m.refused)}, ${m.pass ? 'true' : 'false'}, ${jsonbLiteral(m)})`,
  )
  const i = r.import
  lignes.push(
    `(${sqlLiteral(r.period)}, ${seed}, 'import_bookings', ${sqlLiteral(i.clause)}, NULL, ${nombre(i.ceiling_ms)}, 1, 0, ${i.accepted === i.rows ? '0' : '1'}, ${i.pass ? 'true' : 'false'}, ${jsonbLiteral({ kind: 'volume_import', ...i })})`,
  )
  runPlatformPsql(
    db,
    [
      `CREATE TABLE IF NOT EXISTS ${PLATFORM_LATENCY_TABLE} (
         id bigserial PRIMARY KEY,
         period text NOT NULL,
         seed text NOT NULL,
         op text NOT NULL,
         clause text NOT NULL,
         p95_ms double precision,
         ceiling_ms double precision NOT NULL,
         samples integer NOT NULL,
         warmup integer NOT NULL,
         refused integer NOT NULL,
         pass boolean NOT NULL,
         measure jsonb NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now()
       );`,
      `INSERT INTO ${PLATFORM_LATENCY_TABLE} (period, seed, op, clause, p95_ms, ceiling_ms, samples, warmup, refused, pass, measure) VALUES\n${lignes.join(',\n')};`,
    ].join('\n'),
  )
}

function persisterViolations(db: string, r: RunPlatformConcurrencyTrialsResult): void {
  const sql = [
    `CREATE TABLE IF NOT EXISTS ${PLATFORM_CONCURRENCY_VIOLATIONS_TABLE} (
       id bigserial PRIMARY KEY,
       period text NOT NULL,
       seed text NOT NULL,
       trial integer NOT NULL,
       scenario text NOT NULL,
       kind text NOT NULL,
       clause text NOT NULL,
       detail text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     );`,
  ]
  if (r.violations.length > 0) {
    const lignes = r.violations.map(
      (v) => `(${sqlLiteral(r.period)}, ${sqlLiteral(String(r.seed))}, ${String(v.trial)}, ${sqlLiteral(v.scenario)}, ${sqlLiteral(v.kind)}, ${sqlLiteral(v.clause)}, ${sqlLiteral(v.detail)})`,
    )
    sql.push(`INSERT INTO ${PLATFORM_CONCURRENCY_VIOLATIONS_TABLE} (period, seed, trial, scenario, kind, clause, detail) VALUES\n${lignes.join(',\n')};`)
  }
  runPlatformPsql(db, sql.join('\n'))
}
