// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T77, ADR-021 décision 6 (« Le garde-fou avant tout
// pilote ») et L222-L228 : la CALIBRATION d'une source de clauses F-PLATFORM
// et le REFUS de lancer une campagne sans calibration réussie de la source en
// vigueur.
//
//   calibratePlatformClauseSource({candidateCommand, clauses?, ...})
//     pour chaque période n de 1 à 24, note le candidat (protocole
//     bench.platform/1) avec les deux notateurs de T74
//     (`scorePlatformTargeted`, `scorePlatformDifferential`), sur les
//     séquences, les flux et le modèle attendu de LA SOURCE CALIBRÉE, et
//     vérifie la COMPLÉTUDE : chaque clause comparée à n (active à n, ou citée
//     par une attente d'une séquence ciblée de n) a un texte non vide qui
//     figure (NFC, blancs ramenés à une espace) dans le `docs/spec.md` rendu à
//     n à partir de cette même source (`renderPlatformPeriodDocs`, T73).
//     RÉUSSIE ssi, à chaque période, chaque clause active est notée 1, le
//     différentiel est noté 1 et la complétude tient. Chaque échec nomme
//     {clause, period}. Le rapport est inscrit dans le REGISTRE.
//
//   platformClauseSourceFingerprint(clauses)
//     l'EMPREINTE d'une source : sha256 d'un JSON canonique qui porte
//       - chaque clause, champ par champ (texte, précisions, contrat, bornes,
//         remplacement...), sa MISE EN ŒUVRE comprise : chaque fonction de
//         `implementation` y figure par son code (`Function#toString`) ;
//       - le code du moteur générique (`dist/f-platform-engine.js` de
//         @bench/oracle) et celui du module des clauses
//         (`dist/f-platform-clauses.js` : les fonctions auxiliaires que les
//         mises en œuvre appellent n'apparaissent pas dans leur
//         `toString`).
//     Déterministe (mêmes clauses, même code construit -> même empreinte) ;
//     change dès que le TEXTE d'une clause ou sa MISE EN ŒUVRE change (T70.A1 :
//     la mise en œuvre fait partie de la clause), ou que le moteur change.
//
//   REGISTRE : le répertoire BENCH_CALIBRATION_DIR, sinon
//     `packages/activities/calibrations/` (versionné : il porte la calibration
//     réussie de la source en vigueur, produite par `bench calibrate` avec le
//     candidat de référence dérivé des seuls documents). Un fichier JSON par
//     calibration, réussie ou non : le rapport complet (empreinte et ses
//     composantes, date, commande du candidat, scores par période).
//
//   assertPlatformSourceCalibrated()
//     lève CALIBRATION_REQUIRED (avec l'empreinte en vigueur et le registre)
//     si le registre ne porte AUCUNE calibration réussie — et cohérente : 24
//     périodes, chaque clause active notée 1, différentiel 1, aucun échec —
//     de l'empreinte de la source en vigueur. `bench pilot-conduct --live`
//     l'appelle AVANT toute écriture et toute session (./pilot-conduct.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  PLATFORM_CANDIDATE_PROTOCOL,
  PLATFORM_CLAUSES_IN_FORCE,
  PLATFORM_SPEC_PATH,
  generatePlatformTargetedSequences,
  renderPlatformPeriodDocs,
  type PlatformClause,
} from '@bench/scenario'

import {
  runPlatformPsql,
  scorePlatformDifferential,
  scorePlatformTargeted,
  sqlLiteral,
  jsonbLiteral,
  type PlatformFailure,
} from './f-platform-checks-scoring.js'
import { F_PLATFORM_PERIOD_COUNT, F_PLATFORM_SCENARIO_ID } from './f-platform-pilot.js'

type Json = Record<string, unknown>

export const PLATFORM_CALIBRATION_SCHEMA = 'bench.platform.calibration/1'
export const PLATFORM_FINGERPRINT_SCHEMA = 'bench.platform.clause-source-fingerprint/1'
export const CALIBRATION_DIR_ENV = 'BENCH_CALIBRATION_DIR'
/** Graine des séquences ciblées et des flux différentiels de la calibration. */
export const PLATFORM_CALIBRATION_SEED = 'bench.platform.calibration/1'
export const PLATFORM_CALIBRATIONS_TABLE = 'bench_platform_calibrations'

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v)
const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex')
const normaliser = (s: string): string => s.normalize('NFC').replace(/\s+/gu, ' ').trim()

/* ═══════════════════════════════════════════════════════════ empreinte ═════ */

/** JSON canonique d'une valeur de clause : clés triées, fonctions par leur code. */
function canonique(v: unknown, vus: Set<unknown> = new Set()): string {
  if (typeof v === 'function') return JSON.stringify({ $fn: Function.prototype.toString.call(v) })
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (vus.has(v)) return '"$cycle"'
  vus.add(v)
  let out: string
  if (Array.isArray(v)) out = `[${v.map((x) => canonique(x, vus)).join(',')}]`
  else {
    const o = v as Json
    out = `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonique(o[k], vus)}`)
      .join(',')}}`
  }
  vus.delete(v)
  return out
}

/** Le répertoire `dist` de @bench/oracle (celui que @bench/scenario charge). */
function oracleDistDir(): string {
  const scenarioEntry = fileURLToPath(import.meta.resolve('@bench/scenario'))
  const scenarioRoot = path.resolve(path.dirname(scenarioEntry), '..')
  const candidats = [
    path.join(scenarioRoot, 'node_modules', '@bench', 'oracle', 'dist'),
    path.join(scenarioRoot, '..', 'oracle', 'dist'),
  ]
  for (const c of candidats) {
    if (fs.existsSync(path.join(c, 'f-platform-engine.js'))) return fs.realpathSync(c)
  }
  throw new Error(`F-PLATFORM : code construit de @bench/oracle introuvable (essayé ${candidats.join(', ')})`)
}

export interface PlatformFingerprint {
  readonly fingerprint: string
  readonly components: {
    readonly schema: string
    readonly clause_count: number
    readonly clauses_sha256: string
    readonly engine_sha256: string
    readonly clause_module_sha256: string
  }
}

/** L'empreinte d'une source de clauses (voir l'en-tête). */
export function platformClauseSourceFingerprint(clauses: readonly unknown[] = PLATFORM_CLAUSES_IN_FORCE): PlatformFingerprint {
  const dist = oracleDistDir()
  const components = {
    schema: PLATFORM_FINGERPRINT_SCHEMA,
    clause_count: clauses.length,
    clauses_sha256: sha256(canonique(clauses)),
    engine_sha256: sha256(fs.readFileSync(path.join(dist, 'f-platform-engine.js'))),
    clause_module_sha256: sha256(fs.readFileSync(path.join(dist, 'f-platform-clauses.js'))),
  }
  return { fingerprint: `sha256:${sha256(canonique(components))}`, components }
}

/* ═════════════════════════════════════════════════════════════ registre ═════ */

/** Le registre par défaut, versionné : `packages/activities/calibrations/`. */
export function defaultCalibrationDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'calibrations')
}

/** Le registre en vigueur : BENCH_CALIBRATION_DIR, sinon le registre par défaut. */
export function calibrationDir(): string {
  const v = process.env[CALIBRATION_DIR_ENV]
  return v !== undefined && v.trim() !== '' ? path.resolve(v) : defaultCalibrationDir()
}

/** Clauses actives à n (entrée <= n < sortie). */
function actives(clauses: readonly PlatformClause[], n: number): PlatformClause[] {
  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isInteger(v)) return v
    const m = typeof v === 'string' ? /^[Pp]?(\d{1,2})$/u.exec(v.trim()) : null
    return m ? Number(m[1]) : null
  }
  return clauses.filter((c) => {
    const e = num(c.enters)
    if (e === null) return false
    const s = c.exits === null || c.exits === undefined ? null : num(c.exits)
    return e <= n && (s === null || n < s)
  })
}

/**
 * Un enregistrement est une calibration RÉUSSIE et COHÉRENTE de `fingerprint`
 * pour `clauses` : schéma, empreinte, succès, 24 périodes dont les scores
 * ciblés couvrent exactement les clauses actives, tous à 1, différentiel 1,
 * aucun échec. Rend le motif du rejet, ou null.
 */
function defautDEnregistrement(r: unknown, fingerprint: string, clauses: readonly PlatformClause[]): string | null {
  if (!estObjet(r)) return 'pas un objet'
  if (r['schema'] !== PLATFORM_CALIBRATION_SCHEMA) return `schéma ${String(r['schema'])}`
  if (r['fingerprint'] !== fingerprint) return 'autre empreinte'
  if (r['success'] !== true) return 'calibration échouée'
  if (!Array.isArray(r['failures']) || r['failures'].length > 0) return 'échecs inscrits'
  const periods = r['periods']
  if (!Array.isArray(periods) || periods.length !== F_PLATFORM_PERIOD_COUNT) return 'périodes incomplètes'
  for (let n = 1; n <= F_PLATFORM_PERIOD_COUNT; n += 1) {
    const p = periods.find((x) => estObjet(x) && x['period'] === `P${String(n)}`) as Json | undefined
    if (p === undefined) return `P${String(n)} absente`
    const t = p['targeted']
    if (!estObjet(t)) return `P${String(n)} sans scores ciblés`
    const attendues = actives(clauses, n).map((c) => c.id).sort()
    const notees = Object.keys(t).sort()
    if (attendues.join(',') !== notees.join(',')) return `P${String(n)} : clauses notées différentes des clauses actives`
    if (!Object.values(t).every((v) => v === 1)) return `P${String(n)} : score ciblé différent de 1`
    if (p['differential'] !== 1) return `P${String(n)} : différentiel différent de 1`
    if (p['complete'] !== true) return `P${String(n)} : complétude non tenue`
  }
  return null
}

export interface CalibrationLookup {
  readonly fingerprint: string
  readonly registry: string
  /** Le fichier de la calibration réussie trouvée, ou null. */
  readonly calibration: string | null
  /** Calibrations de cette empreinte rejetées, avec leur motif. */
  readonly rejected: readonly { readonly file: string; readonly reason: string }[]
}

/** Cherche, dans le registre, une calibration réussie de la source en vigueur. */
export function findPlatformCalibration(
  options: { readonly registry?: string; readonly clauses?: readonly PlatformClause[] } = {},
): CalibrationLookup {
  const registry = options.registry ?? calibrationDir()
  const clauses = options.clauses ?? PLATFORM_CLAUSES_IN_FORCE
  const { fingerprint } = platformClauseSourceFingerprint(clauses)
  const rejected: { file: string; reason: string }[] = []
  const fichiers = fs.existsSync(registry) ? fs.readdirSync(registry).filter((f) => f.endsWith('.json')).sort() : []
  for (const f of fichiers) {
    const chemin = path.join(registry, f)
    let r: unknown
    try {
      r = JSON.parse(fs.readFileSync(chemin, 'utf8')) as unknown
    } catch {
      continue
    }
    if (!estObjet(r) || r['fingerprint'] !== fingerprint) continue
    const defaut = defautDEnregistrement(r, fingerprint, clauses)
    if (defaut === null) return { fingerprint, registry, calibration: chemin, rejected }
    rejected.push({ file: chemin, reason: defaut })
  }
  return { fingerprint, registry, calibration: null, rejected }
}

export class PlatformCalibrationRequiredError extends Error {
  readonly code = 'CALIBRATION_REQUIRED'
  constructor(readonly lookup: CalibrationLookup) {
    super(
      `CALIBRATION_REQUIRED : aucune calibration réussie de la source de clauses ${F_PLATFORM_SCENARIO_ID} en vigueur ` +
        `(empreinte ${lookup.fingerprint}) dans le registre ${lookup.registry}` +
        (lookup.rejected.length > 0 ? ` (rejetées : ${lookup.rejected.map((x) => `${path.basename(x.file)} : ${x.reason}`).join(' ; ')})` : '') +
        ` — ADR-021 décision 6 : la campagne est bloquée ; lancer d'abord ` +
        `\`bench calibrate --scenario-id ${F_PLATFORM_SCENARIO_ID} --candidate-command <argv JSON>\` ` +
        `avec un candidat de référence dérivé des seuls documents remis`,
    )
    this.name = 'PlatformCalibrationRequiredError'
  }
}

/** Lève CALIBRATION_REQUIRED sans calibration réussie de la source en vigueur ; rend la recherche sinon. */
export function assertPlatformSourceCalibrated(options: { readonly registry?: string } = {}): CalibrationLookup {
  const lookup = findPlatformCalibration(options)
  if (lookup.calibration === null) throw new PlatformCalibrationRequiredError(lookup)
  return lookup
}

/* ═════════════════════════════════════════════════ source de clauses ═════ */

/** Charge la source exportée par un module ES (`clauses`, `PLATFORM_CLAUSES`, `platformClauses`, `default`). */
export async function loadPlatformClauseSource(modulePath: string): Promise<PlatformClause[]> {
  const abs = path.resolve(process.cwd(), modulePath)
  if (!fs.existsSync(abs)) throw new Error(`bench calibrate : source de clauses introuvable ${abs}`)
  const mod = (await import(pathToFileURL(abs).href)) as Json
  let v: unknown
  for (const k of ['clauses', 'PLATFORM_CLAUSES', 'platformClauses', 'default']) {
    if (mod[k] !== undefined) {
      v = mod[k]
      break
    }
  }
  if (typeof v === 'function') v = await Promise.resolve((v as () => unknown)())
  if (estObjet(v) && Array.isArray(v['clauses'])) v = v['clauses']
  if (!Array.isArray(v) || v.length === 0) throw new Error(`bench calibrate : ${abs} n'exporte aucun tableau de clauses (clauses | PLATFORM_CLAUSES | platformClauses | default)`)
  for (const c of v) {
    if (!estObjet(c) || typeof c['id'] !== 'string' || !estObjet(c['implementation'])) {
      throw new Error(`bench calibrate : ${abs} : élément qui n'est pas une clause F-PLATFORM (id, implementation) : ${JSON.stringify(c)?.slice(0, 200)}`)
    }
  }
  return v as PlatformClause[]
}

/* ══════════════════════════════════════════════════════════ calibration ═════ */

export interface CalibratePlatformInput {
  readonly candidateCommand: readonly string[]
  /** Module de la source calibrée (absent : la source en vigueur). */
  readonly clauseSourcePath?: string
  readonly postgresDatabase?: string
  /** Registre (absent : `calibrationDir()`). */
  readonly registry?: string
  readonly seed?: string
  readonly concurrency?: number
  /** Journal de progression (stderr par défaut). */
  readonly log?: (ligne: string) => void
}

export interface CalibrationFailure {
  readonly clause: string
  readonly period: string
  readonly kind: 'targeted' | 'differential' | 'completeness'
  readonly reason: string
  /** Nombre d'échecs élémentaires de cette sorte pour (clause, période). */
  readonly count: number
  /** Un exemple (notateurs de T74) : opération, requête, attendu, reçu. */
  readonly example?: Json
}

const tronquer = (v: unknown, n = 600): unknown => {
  const s = JSON.stringify(v ?? null)
  return s.length <= n ? v : `${s.slice(0, n)}…`
}

function headDuDepot(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim()
  } catch {
    return null
  }
}

/** Empreintes des fichiers nommés par la commande du candidat (audit). */
function fichiersDuCandidat(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of argv.slice(1)) {
    const abs = path.resolve(process.cwd(), a)
    try {
      if (fs.statSync(abs).isFile()) out[a] = `sha256:${sha256(fs.readFileSync(abs))}`
    } catch {
      /* pas un fichier */
    }
  }
  return out
}

function persisterCalibration(db: string, rapport: Json): void {
  runPlatformPsql(
    db,
    [
      `CREATE TABLE IF NOT EXISTS ${PLATFORM_CALIBRATIONS_TABLE} (
         id bigserial PRIMARY KEY,
         scenario_id text NOT NULL,
         fingerprint text NOT NULL,
         success boolean NOT NULL,
         report jsonb NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now()
       );`,
      `INSERT INTO ${PLATFORM_CALIBRATIONS_TABLE} (scenario_id, fingerprint, success, report) VALUES (` +
        `${sqlLiteral(F_PLATFORM_SCENARIO_ID)}, ${sqlLiteral(String(rapport['fingerprint']))}, ${rapport['success'] === true ? 'true' : 'false'}, ${jsonbLiteral(rapport)});`,
    ].join('\n'),
  )
}

/** Calibre une source de clauses par un candidat ; inscrit le rapport au registre ; le rend. */
export async function calibratePlatformClauseSource(input: CalibratePlatformInput): Promise<Json> {
  const log = input.log ?? ((l: string): void => void process.stderr.write(`${l}\n`))
  if (!Array.isArray(input.candidateCommand) || input.candidateCommand.length === 0 || !input.candidateCommand.every((x) => typeof x === 'string')) {
    throw new Error('bench calibrate : --candidate-command doit être un tableau JSON non vide de chaînes')
  }
  const debut = Date.now()
  const clauses: readonly PlatformClause[] =
    input.clauseSourcePath === undefined ? PLATFORM_CLAUSES_IN_FORCE : await loadPlatformClauseSource(input.clauseSourcePath)
  const fp = platformClauseSourceFingerprint(clauses)
  const seed = input.seed ?? PLATFORM_CALIBRATION_SEED
  const registry = input.registry ?? calibrationDir()
  const parId = new Map(clauses.map((c) => [c.id, c]))
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-calibrate-'))
  log(`bench calibrate : ${F_PLATFORM_SCENARIO_ID}, empreinte ${fp.fingerprint}, ${String(clauses.length)} clauses, candidat ${JSON.stringify(input.candidateCommand)}`)

  const periods: Json[] = []
  const failures: CalibrationFailure[] = []
  try {
    for (let n = 1; n <= F_PLATFORM_PERIOD_COUNT; n += 1) {
      const t0 = Date.now()
      const P = `P${String(n)}`
      const commun = {
        period: n,
        seed,
        candidateCommand: input.candidateCommand,
        clauses,
        ...(input.postgresDatabase !== undefined ? { postgresDatabase: input.postgresDatabase } : {}),
        ...(input.concurrency !== undefined ? { concurrency: input.concurrency } : {}),
      }
      const cible = await scorePlatformTargeted({ ...commun, benchDataDir: path.join(travail, P, 'targeted') })
      const diff = await scorePlatformDifferential({ ...commun, benchDataDir: path.join(travail, P, 'differential') })
      fs.rmSync(path.join(travail, P), { recursive: true, force: true })

      // Complétude : chaque clause comparée à n figure dans docs/spec.md rendu à n depuis CETTE source.
      const spec = normaliser(renderPlatformPeriodDocs(n, { clauses })[PLATFORM_SPEC_PATH] ?? '')
      const comparees = new Set(actives(clauses, n).map((c) => c.id))
      for (const s of generatePlatformTargetedSequences({ period: n, seed, clauses }).sequences) {
        comparees.add(s.clause)
        for (const e of s.steps) comparees.add(e.expect.clause)
      }
      const absentes: string[] = []
      for (const id of [...comparees].sort()) {
        const c = parId.get(id)
        const texte = c === undefined || typeof c.text !== 'string' ? '' : normaliser(c.text)
        const motif =
          c === undefined
            ? 'clause comparée absente de la source'
            : texte === ''
              ? `texte de la clause vide : ${PLATFORM_SPEC_PATH} ne peut pas la porter`
              : !spec.includes(texte)
                ? `texte de la clause absent de ${PLATFORM_SPEC_PATH} rendu à ${P}`
                : null
        if (motif === null) continue
        absentes.push(id)
        failures.push({ clause: id, period: P, kind: 'completeness', reason: motif, count: 1 })
      }

      // Échecs des notateurs, regroupés par (sorte, clause) pour cette période.
      const groupes = new Map<string, { f: PlatformFailure; count: number }>()
      for (const f of [...cible.failures, ...diff.failures]) {
        const k = `${f.kind}|${f.clause}`
        const g = groupes.get(k)
        if (g === undefined) groupes.set(k, { f, count: 1 })
        else g.count += 1
      }
      for (const [, { f, count }] of groupes) {
        failures.push({
          clause: f.clause,
          period: P,
          kind: f.kind,
          reason: f.kind === 'targeted' ? 'attente d’une séquence ciblée non satisfaite' : 'divergence d’un flux différentiel avec le modèle attendu',
          count,
          example: {
            op: f.op,
            request: tronquer(f.request),
            expected: tronquer(f.expected),
            received: tronquer(f.received),
            ...(f.target_clause !== undefined ? { target_clause: f.target_clause } : {}),
            ...(f.diagnosis !== undefined ? { diagnosis: f.diagnosis } : {}),
          },
        })
      }
      // Une clause active sans séquence ciblée est notée 0 : elle n'a pas été comparée.
      const targeted: Record<string, number> = {}
      for (const c of actives(clauses, n)) targeted[c.id] = cible.clauses[c.id]?.score ?? 0
      for (const [id, v] of Object.entries(targeted)) {
        if (v !== 1 && !failures.some((f) => f.period === P && f.clause === id && f.kind === 'targeted')) {
          failures.push({ clause: id, period: P, kind: 'targeted', reason: `score ciblé ${String(v)} (aucune séquence satisfaite)`, count: 1 })
        }
      }
      if (diff.score !== 1 && diff.failures.length === 0) {
        failures.push({ clause: actives(clauses, n)[0]?.id ?? 'P1.R1', period: P, kind: 'differential', reason: `différentiel ${String(diff.score)}`, count: 1 })
      }
      const complete = absentes.length === 0
      const ok = complete && diff.score === 1 && Object.values(targeted).every((v) => v === 1)
      periods.push({
        period: P,
        ok,
        targeted,
        differential: diff.score,
        targeted_sequences: { satisfied: cible.satisfied, total: cible.total },
        differential_streams: { satisfied: diff.satisfied, total: diff.total },
        complete,
        compared_clauses: comparees.size,
        duration_ms: Date.now() - t0,
      })
      log(
        `bench calibrate : ${P} ciblé ${String(cible.satisfied)}/${String(cible.total)}, différentiel ${String(diff.satisfied)}/${String(diff.total)}, ` +
          `complétude ${complete ? 'ok' : `manquent ${absentes.join(', ')}`} (${String(Date.now() - t0)} ms)`,
      )
    }
  } finally {
    fs.rmSync(travail, { recursive: true, force: true })
  }

  const success = failures.length === 0 && periods.length === F_PLATFORM_PERIOD_COUNT && periods.every((p) => p['ok'] === true)
  const createdAt = new Date().toISOString()
  const rapport: Json = {
    schema: PLATFORM_CALIBRATION_SCHEMA,
    fingerprint: fp.fingerprint,
    success,
    status: success ? 'calibrated' : 'failed',
    scenario_id: F_PLATFORM_SCENARIO_ID,
    created_at: createdAt,
    duration_ms: Date.now() - debut,
    fingerprint_components: fp.components,
    clause_source: input.clauseSourcePath === undefined ? 'in-force (@bench/oracle platformClauses)' : input.clauseSourcePath,
    candidate_command: [...input.candidateCommand],
    candidate_files: fichiersDuCandidat(input.candidateCommand),
    protocol: PLATFORM_CANDIDATE_PROTOCOL,
    seed,
    scorers: ['scorePlatformTargeted', 'scorePlatformDifferential'],
    completeness: `chaque clause comparée a un texte non vide présent dans ${PLATFORM_SPEC_PATH} rendu à la période depuis la même source`,
    repository_head: headDuDepot(),
    host: { node: process.version, platform: process.platform, cpus: os.cpus().length },
    periods,
    failures,
  }
  fs.mkdirSync(registry, { recursive: true })
  const nom = `${createdAt.replace(/[:.]/g, '-')}-${fp.fingerprint.replace(/^sha256:/, '').slice(0, 16)}-${success ? 'calibrated' : 'failed'}-${randomBytes(3).toString('hex')}.json`
  const fichier = path.join(registry, nom)
  fs.writeFileSync(fichier, `${JSON.stringify(rapport, null, 2)}\n`)
  rapport['registry_file'] = fichier
  if (input.postgresDatabase !== undefined) persisterCalibration(input.postgresDatabase, rapport)
  return rapport
}
