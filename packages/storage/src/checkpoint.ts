// ─────────────────────────────────────────────────────────────────────────────
// Checkpoints coherents (cahier L281-L290, tache T15).
//
// CE QUE LES SIX ROLES FONT, ET COMMENT.
//
//   openCheckpointCoordinator({ admin_dsn, app_database, artifact_store })
//       Ouvre un coordinateur SANS contacter PostgreSQL (meme convention que
//       `openStore`, T12) : `admin_dsn` sert uniquement a DERIVER le DSN de
//       `app_database` dans le meme cluster (`dsnWithDatabase`) — ce
//       coordinateur n'utilise jamais `admin_dsn` pour CREATE/DROP une base ;
//       la suite d'acceptation cree et detruit ses propres bases elle-meme.
//
//   applyOperation(h, { operation_sequence, fact })
//       Ecrit `fact` dans une table dediee de `app_database`
//       (`bench_checkpoint_operations`), GATEE par la barriere d'ecriture : un
//       appel pendant une fenetre FERMEE est refuse par
//       `CHECKPOINT_BARRIER_CLOSED` avant tout contact avec PostgreSQL (A7).
//
//   beginCheckpoint(h, { after_operation })
//       Ferme la barriere, attend que les ecritures deja EN VOL terminent
//       (drainage), et rend un jeton opaque que seul `finishCheckpoint` sur ce
//       MEME coordinateur peut consommer.
//
//   finishCheckpoint(h, token, { components, fault? })
//       Capture les CINQ composants de L283 — `base` (export de
//       `app_database` par `pg_dump`, deriv du coordinateur lui-meme, jamais
//       fourni par l'appelant) et les quatre octets opaques `code`,
//       `fichiers`, `files`, `memoire` — les televerse dans le magasin
//       d'artefacts (T13/T14), puis publie un MANIFESTE canonique (§E, L82)
//       qui les reference. Le point d'injection nomme `STOP_AFTER_EACH_UPLOAD`
//       (L141) arrete la capture juste apres le televersement d'un composant,
//       AVANT cette publication (A2). La barriere est ROUVERTE dans un `finally`
//       : un checkpoint abandonne ne doit pas laisser l'application verrouillee.
//
//   listCheckpoints(h)
//       Relit les objets du magasin, ne retient que ceux dont le contenu est
//       un MANIFESTE de checkpoint (forme verifiee structurellement) pour CE
//       `app_database` : un checkpoint jamais publie (barriere fermee puis
//       abandonnee) n'y figure jamais, puisque son manifeste n'a jamais ete
//       ecrit (A2).
//
//   restoreCheckpoint(h2, { checkpoint_id })
//       Relit le manifeste identifie, verifie la PRESENCE puis l'INTEGRITE de
//       chaque objet qu'il reference (empreinte de contenu deja verifiee par
//       `getArtifact`, T13/T14), restaure le dump `base` sur l'environnement
//       VIERGE que `h2` designe (L289), et rend les faits metier relus par un
//       temoin `psql` ainsi que les quatre composants opaques en octets EXACTS.
//       Le PERIMETRE de la restauration est strictement `app_database` : ce
//       role ne touche jamais une autre base du cluster, meme visible depuis
//       `admin_dsn` (invariant D.4, L66, A6).
//
// POURQUOI L'IDENTITE DE CHECKPOINT EST LE `ref` DU MANIFESTE PUBLIE, ET RIEN
// D'AUTRE. `canonicalBytes` (@bench/contracts, §E) serialise le manifeste —
// `app_database`, `after_operation`, les CINQ references de composants — en
// octets canoniques, cles triees, aucun horodatage technique ajoute. Le
// magasin d'artefacts est deja ADRESSE PAR LE CONTENU (T13) : publier ces
// octets rend un `ref` qui EST `sha256:<empreinte des octets canoniques>`.
// Deux captures d'un etat metier identique, avec les memes composants opaques,
// produisent donc EXACTEMENT le meme manifeste, donc le meme `ref` (A5) — sans
// qu'aucun compteur, horloge ou UUID n'entre dans le calcul. Un seul changement
// (une operation de plus avant la capture change le dump `base`, un composant
// opaque different change sa reference) change le manifeste, donc l'identite.
//
// POURQUOI `base` EST DERIVE PAR `pg_dump`, ET COMMENT LA DETERMINISME EST
// TENUE MALGRE UN OUTIL QUI N'EST PAS ECRIT ICI. PostgreSQL 18 fait preceder
// chaque export d'un jeton ALEATOIRE (`\restrict <jeton>` / `\unrestrict
// <meme jeton>`), different a chaque invocation par defaut — ce qui romprait
// A5 pour une raison entierement etrangere au contenu capture. `pg_dump
// --restrict-key=<cle fixe>` (un export de bas niveau du meme outil, pas une
// reinvention du format de dump) rend ce jeton CONSTANT ; verifie empiriquement
// sur ce boot (PostgreSQL 18.6) : deux exports d'un contenu identique, a une
// seconde d'ecart, produisent des octets identiques des que la cle est fixee.
//
// CE QUE CE FICHIER NE PRETEND PAS FAIRE (cf. section V de l'en-tete de
// acceptance/T15.spec.ts) : il ne reimplemente pas le contrat ArtifactStore
// (T13/T14, reutilise tel quel via `putArtifact`/`getArtifact`/`listArtifacts`),
// il n'impose aucun schema de table au-dela de celle qu'il cree lui-meme pour
// ses propres operations, et il ne rejoue aucun invariant comptable de T16/T17.
// ─────────────────────────────────────────────────────────────────────────────

import { execFile as execFileCb } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { canonicalBytes } from '@bench/contracts'
import type { CanonicalValue } from '@bench/contracts'
import { jsonParameter, psqlOnce } from './psql.js'
import { getArtifact, listArtifacts, putArtifact } from './artifacts.js'
import { isArtifactRefusal } from './artifact-errors.js'
import { CheckpointRefusal } from './checkpoint-errors.js'

export {
  CHECKPOINT_REFUSAL_CODES,
  CheckpointRefusal,
  isCheckpointRefusal,
} from './checkpoint-errors.js'
export type { CheckpointRefusalCode } from './checkpoint-errors.js'

const execFileP = promisify(execFileCb)

/** Cible d'ouverture d'un coordinateur de checkpoint (L283, L289). */
export interface CheckpointCoordinatorTarget {
  /** DSN admin PostgreSQL, utilise pour DERIVER le DSN de `app_database`. */
  readonly admin_dsn: string
  /** Nom de la base applicative que ce coordinateur pilote, et elle seule. */
  readonly app_database: string
  /** Magasin d'artefacts (T13 local ou T14 S3) deja ouvert. */
  readonly artifact_store: unknown
}

/** Une operation metier numerotee, appliquee via {@link applyOperation}. */
export interface CheckpointOperation {
  readonly operation_sequence: number
  readonly fact: unknown
}

/** Fenetre de capture ouverte par {@link beginCheckpoint}. */
export interface BeginCheckpointRequest {
  readonly after_operation: number
}

/** Les quatre composants opaques que l'appelant fournit (L283). */
export interface CheckpointComponents {
  readonly code: Uint8Array
  readonly fichiers: Uint8Array
  readonly files: Uint8Array
  readonly memoire: Uint8Array
}

/** Point d'injection nomme de L141, unique valeur admise (convention IV.3). */
export type CheckpointFault = 'STOP_AFTER_EACH_UPLOAD'

/** Composants nommes que {@link finishCheckpoint} doit capturer (L283). */
export interface FinishCheckpointRequest {
  readonly components: CheckpointComponents
  readonly fault?: CheckpointFault
}

/** Ce que rend une finalisation acceptee. */
export interface FinishCheckpointResult {
  readonly checkpoint_id: string
}

/** Un checkpoint COMPLET et publie, tel que rendu par {@link listCheckpoints}. */
export interface CheckpointSummary {
  readonly checkpoint_id: string
}

/** Identite d'un checkpoint restaurable (L287). */
export interface RestoreCheckpointRequest {
  readonly checkpoint_id: string
}

/** Ce que rend une restauration acceptee (L289). */
export interface RestoreCheckpointResult {
  readonly facts: readonly unknown[]
  readonly components: CheckpointComponents
}

/* ─────────────────────────────────────────────────── forme des appels (L80) */

type Json = Record<string, unknown>

function plainObject(v: unknown): Json | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Json
}

function invalid(role: string, detail: string, subject = role): never {
  throw new CheckpointRefusal('CHECKPOINT_TARGET_INVALID', detail, subject)
}

function invalidInput(role: string, detail: string, subject = role): never {
  throw new CheckpointRefusal('CHECKPOINT_INPUT_INVALID', detail, subject)
}

function checkKeys(o: Json, allowed: readonly string[], role: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) invalidInput(role, `${role} n'accepte pas la propriete « ${k} »`)
  }
}

function checkTarget(target: unknown): {
  admin_dsn: string
  app_database: string
  artifact_store: unknown
} {
  const o = plainObject(target)
  if (o === null) {
    invalid(
      'openCheckpointCoordinator',
      'openCheckpointCoordinator attend un objet plat { admin_dsn, app_database, artifact_store }',
    )
  }
  checkKeys(o, ['admin_dsn', 'app_database', 'artifact_store'], 'openCheckpointCoordinator')
  const { admin_dsn, app_database, artifact_store } = o
  if (typeof admin_dsn !== 'string' || admin_dsn.length === 0) {
    invalid('openCheckpointCoordinator', 'admin_dsn doit etre une chaine non vide')
  }
  if (typeof app_database !== 'string' || app_database.length === 0) {
    invalid('openCheckpointCoordinator', 'app_database doit etre une chaine non vide')
  }
  if (artifact_store === undefined || artifact_store === null) {
    invalid('openCheckpointCoordinator', 'artifact_store doit etre un magasin deja ouvert')
  }
  return { admin_dsn, app_database, artifact_store }
}

/**
 * Derive le DSN de `database` dans le MEME cluster que `dsn` (meme autorite,
 * memes options de requete — typiquement `?host=<socket>`), sans jamais
 * contacter PostgreSQL. Ni `node:url` (les DSN `scheme://user@/base?host=…`
 * portent un hote VIDE devant des identifiants, une forme que `URL` du
 * standard WHATWG refuse purement et simplement) ni un pilote SQL ne sont
 * requis pour cette seule substitution du segment de chemin.
 */
const DSN_SHAPE = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*\/)([^?]*)(\?.*)?$/

function dsnWithDatabase(dsn: string, database: string): string {
  const m = DSN_SHAPE.exec(dsn)
  if (m === null) {
    invalid(
      'openCheckpointCoordinator',
      'admin_dsn doit avoir la forme schema://autorite/base[?options]',
      dsn,
    )
  }
  return `${m[1]}${encodeURIComponent(database)}${m[3] ?? ''}`
}

interface CheckedOperation {
  readonly operation_sequence: number
  readonly fact: unknown
}

function checkOperation(operation: unknown): CheckedOperation {
  const o = plainObject(operation)
  if (o === null) {
    invalidInput('applyOperation', 'applyOperation attend un objet plat { operation_sequence, fact }')
  }
  checkKeys(o, ['operation_sequence', 'fact'], 'applyOperation')
  const seq = o.operation_sequence
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
    invalidInput('applyOperation', 'operation_sequence doit etre un entier >= 1')
  }
  if (!('fact' in o) || o.fact === undefined) {
    invalidInput('applyOperation', 'applyOperation attend un fait defini')
  }
  return { operation_sequence: seq, fact: o.fact }
}

function checkBeginRequest(request: unknown): { after_operation: number } {
  const o = plainObject(request)
  if (o === null) invalidInput('beginCheckpoint', 'beginCheckpoint attend un objet plat { after_operation }')
  checkKeys(o, ['after_operation'], 'beginCheckpoint')
  const v = o.after_operation
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    invalidInput('beginCheckpoint', 'after_operation doit etre un entier >= 0')
  }
  return { after_operation: v }
}

function asComponentBytes(v: unknown, key: string): Uint8Array {
  if (v instanceof Uint8Array) return v
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  invalidInput('finishCheckpoint', `le composant « ${key} » attend des octets bruts (Uint8Array ou Buffer)`)
}

const OPTIONAL_COMPONENT_KEYS = ['code', 'fichiers', 'files', 'memoire'] as const

function checkFinishRequest(request: unknown): {
  components: CheckpointComponents
  fault?: CheckpointFault
} {
  const o = plainObject(request)
  if (o === null) {
    invalidInput('finishCheckpoint', 'finishCheckpoint attend un objet plat { components, fault? }')
  }
  checkKeys(o, ['components', 'fault'], 'finishCheckpoint')
  const comps = plainObject(o.components)
  if (comps === null) {
    invalidInput('finishCheckpoint', 'components doit etre un objet plat { code, fichiers, files, memoire }')
  }
  checkKeys(comps, OPTIONAL_COMPONENT_KEYS, 'finishCheckpoint')
  for (const key of OPTIONAL_COMPONENT_KEYS) {
    if (!(key in comps)) invalidInput('finishCheckpoint', `components doit porter la propriete « ${key} »`)
  }
  const components: CheckpointComponents = {
    code: asComponentBytes(comps.code, 'code'),
    fichiers: asComponentBytes(comps.fichiers, 'fichiers'),
    files: asComponentBytes(comps.files, 'files'),
    memoire: asComponentBytes(comps.memoire, 'memoire'),
  }
  if (o.fault === undefined) return { components }
  if (o.fault !== 'STOP_AFTER_EACH_UPLOAD') {
    invalidInput('finishCheckpoint', 'le seul point d injection declare est STOP_AFTER_EACH_UPLOAD', String(o.fault))
  }
  return { components, fault: 'STOP_AFTER_EACH_UPLOAD' }
}

function checkRestoreRequest(request: unknown): { checkpoint_id: string } {
  const o = plainObject(request)
  if (o === null) invalidInput('restoreCheckpoint', 'restoreCheckpoint attend un objet plat { checkpoint_id }')
  checkKeys(o, ['checkpoint_id'], 'restoreCheckpoint')
  const id = o.checkpoint_id
  if (typeof id !== 'string' || id.length === 0) {
    invalidInput('restoreCheckpoint', 'checkpoint_id doit etre une chaine non vide')
  }
  return { checkpoint_id: id }
}

/* ────────────────────────────────────────────── le coordinateur et son jeton */

/**
 * Un coordinateur ouvert. La barriere (`barrierClosed`) et l'ensemble des
 * ecritures en vol (`inFlight`) sont l'etat que `applyOperation`,
 * `beginCheckpoint` et `finishCheckpoint` partagent — aucun de ces trois roles
 * n'est une fonction pure, exactement parce que L285 exige une PORTE avec un
 * etat (ouverte/fermee), pas un controle sans memoire.
 */
class CheckpointCoordinator {
  readonly admin_dsn: string
  readonly app_database: string
  readonly app_dsn: string
  readonly artifact_store: unknown

  barrierClosed = false
  openToken: CheckpointToken | null = null
  readonly inFlight = new Set<Promise<void>>()
  tableReady: Promise<void> | null = null

  constructor(admin_dsn: string, app_database: string, app_dsn: string, artifact_store: unknown) {
    this.admin_dsn = admin_dsn
    this.app_database = app_database
    this.app_dsn = app_dsn
    this.artifact_store = artifact_store
  }
}

/** Jeton opaque rendu par {@link beginCheckpoint}, consomme par {@link finishCheckpoint}. */
class CheckpointToken {
  readonly coordinator: CheckpointCoordinator
  readonly after_operation: number
  consumed = false

  constructor(coordinator: CheckpointCoordinator, after_operation: number) {
    this.coordinator = coordinator
    this.after_operation = after_operation
  }
}

function requireCoordinator(handle: unknown, role: string): CheckpointCoordinator {
  if (!(handle instanceof CheckpointCoordinator)) {
    invalid(role, `${role} attend le coordinateur rendu par openCheckpointCoordinator`)
  }
  return handle
}

function requireToken(token: unknown, h: CheckpointCoordinator, role: string): CheckpointToken {
  if (!(token instanceof CheckpointToken) || token.coordinator !== h) {
    throw new CheckpointRefusal(
      'CHECKPOINT_TOKEN_INVALID',
      `${role} attend le jeton rendu par beginCheckpoint sur ce meme coordinateur`,
      role,
    )
  }
  if (token.consumed || h.openToken !== token) {
    throw new CheckpointRefusal(
      'CHECKPOINT_TOKEN_INVALID',
      `${role} : ce jeton a deja ete consomme, ou ne correspond plus a la fenetre ouverte`,
      role,
    )
  }
  return token
}

/**
 * Ouvre un coordinateur de checkpoint (L283, L289). N'etablit pas de connexion
 * a l'ouverture : le premier appel reel dira si `app_database` repond.
 */
export function openCheckpointCoordinator(target: unknown): unknown {
  const { admin_dsn, app_database, artifact_store } = checkTarget(target)
  const app_dsn = dsnWithDatabase(admin_dsn, app_database)
  return new CheckpointCoordinator(admin_dsn, app_database, app_dsn, artifact_store)
}

/* ──────────────────────────────────────────── la table des operations metier */

const OPERATIONS_TABLE = 'bench_checkpoint_operations'

async function ensureOperationsTable(h: CheckpointCoordinator): Promise<void> {
  if (h.tableReady !== null) {
    await h.tableReady
    return
  }
  const ready = (async () => {
    const r = await psqlOnce(
      h.app_dsn,
      `CREATE TABLE IF NOT EXISTS ${OPERATIONS_TABLE} (operation_sequence integer NOT NULL, fact jsonb NOT NULL);`,
    )
    if (!r.ok) {
      throw new CheckpointRefusal(
        'CHECKPOINT_STORAGE_UNAVAILABLE',
        `preparation de la table des operations refusee : ${r.error}`,
        h.app_database,
      )
    }
  })()
  h.tableReady = ready
  try {
    await ready
  } catch (e) {
    h.tableReady = null
    throw e
  }
}

async function writeOperation(h: CheckpointCoordinator, op: CheckedOperation): Promise<void> {
  await ensureOperationsTable(h)
  const sql =
    `INSERT INTO ${OPERATIONS_TABLE} (operation_sequence, fact) ` +
    `VALUES (${String(op.operation_sequence)}, ${jsonParameter(op.fact)});`
  const r = await psqlOnce(h.app_dsn, sql)
  if (!r.ok) {
    throw new CheckpointRefusal(
      'CHECKPOINT_STORAGE_UNAVAILABLE',
      `ecriture de l operation ${String(op.operation_sequence)} refusee : ${r.error}`,
      h.app_database,
    )
  }
}

/**
 * Applique une operation metier numerotee (L61 D.6), gatee par la barriere de
 * L285 : une fenetre FERMEE refuse AVANT tout contact avec PostgreSQL (A7).
 */
export async function applyOperation(
  handle: unknown,
  operation: unknown,
): Promise<{ accepted: true; operation_sequence: number }> {
  const h = requireCoordinator(handle, 'applyOperation')
  const op = checkOperation(operation)
  if (h.barrierClosed) {
    throw new CheckpointRefusal(
      'CHECKPOINT_BARRIER_CLOSED',
      'la barriere d ecriture est fermee : une capture de checkpoint est en cours',
      String(op.operation_sequence),
    )
  }
  const task = writeOperation(h, op)
  h.inFlight.add(task)
  try {
    await task
  } finally {
    h.inFlight.delete(task)
  }
  return { accepted: true, operation_sequence: op.operation_sequence }
}

/**
 * Ferme la barriere d'ecriture apres l'operation nommee (L285), draine les
 * ecritures deja EN VOL, et rend un jeton opaque.
 */
export async function beginCheckpoint(handle: unknown, request: unknown): Promise<unknown> {
  const h = requireCoordinator(handle, 'beginCheckpoint')
  const req = checkBeginRequest(request)
  if (h.barrierClosed) {
    throw new CheckpointRefusal(
      'CHECKPOINT_IN_PROGRESS',
      'une fenetre de checkpoint est deja ouverte sur ce coordinateur',
      h.app_database,
    )
  }
  h.barrierClosed = true
  await Promise.allSettled([...h.inFlight])
  const token = new CheckpointToken(h, req.after_operation)
  h.openToken = token
  return token
}

/* ─────────────────────────────────────────────────── export/import de `base` */

/**
 * Cle de restriction FIXE de `pg_dump --restrict-key` (PostgreSQL >= 16.10 /
 * 17.6 / 18). Sans elle, `pg_dump` prefixe chaque export d'un jeton
 * ALEATOIRE (`\restrict <jeton>`), different a chaque appel — ce qui romprait
 * A5 pour une raison entierement etrangere au contenu capture. La valeur
 * elle-meme n'a aucune portee de securite ici : elle sert uniquement a rendre
 * deux exports d'un contenu identique BYTE-IDENTIQUES.
 */
const DUMP_RESTRICT_KEY = 'BENCHCHECKPOINTFIXEDRESTRICTKEY00000000000000000000000000'

const DUMP_TIMEOUT_MS = 120_000
const DUMP_MAX_BUFFER = 256 * 1024 * 1024

async function dumpDatabase(dsn: string, subject: string): Promise<Buffer> {
  try {
    const { stdout } = await execFileP('pg_dump', ['--restrict-key=' + DUMP_RESTRICT_KEY, '-d', dsn], {
      encoding: 'buffer',
      timeout: DUMP_TIMEOUT_MS,
      maxBuffer: DUMP_MAX_BUFFER,
    })
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as unknown as Uint8Array)
  } catch (e) {
    const err = e as { stderr?: unknown; message?: string }
    const stderrText = Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : String(err.stderr ?? '')
    const detail = (stderrText || String(err.message ?? e)).trim()
    throw new CheckpointRefusal('CHECKPOINT_CAPTURE_FAILED', `pg_dump a echoue : ${detail}`, subject)
  }
}

async function restoreDatabase(dsn: string, bytes: Uint8Array, subject: string): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-t15-restore-'))
  const file = path.join(dir, 'dump.sql')
  try {
    fs.writeFileSync(file, Buffer.from(bytes))
    await execFileP('psql', ['-v', 'ON_ERROR_STOP=1', '-d', dsn, '-f', file], {
      encoding: 'utf8',
      timeout: DUMP_TIMEOUT_MS,
      maxBuffer: DUMP_MAX_BUFFER,
    })
  } catch (e) {
    const err = e as { stderr?: unknown; message?: string }
    const detail = (typeof err.stderr === 'string' ? err.stderr : String(err.message ?? e)).trim()
    throw new CheckpointRefusal('CHECKPOINT_RESTORE_FAILED', `restauration du composant base refusee : ${detail}`, subject)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function readFacts(dsn: string): Promise<unknown[]> {
  const r = await psqlOnce(dsn, `SELECT fact::text FROM ${OPERATIONS_TABLE} ORDER BY operation_sequence;`)
  if (!r.ok) return []
  const out: unknown[] = []
  for (const line of r.lines) {
    try {
      out.push(JSON.parse(line))
    } catch {
      /* une ligne illisible n est pas un fait metier : elle est ignoree */
    }
  }
  return out
}

/* ──────────────────────────────────────────────── le manifeste de checkpoint */

const MANIFEST_KIND = 'bench.checkpoint.manifest/1'

interface ManifestValue {
  readonly kind: string
  readonly app_database: string
  readonly after_operation: number
  readonly components: {
    readonly base: string
    readonly code: string
    readonly fichiers: string
    readonly files: string
    readonly memoire: string
  }
}

const COMPONENT_REF_KEYS = ['base', 'code', 'fichiers', 'files', 'memoire'] as const

function isManifestValue(v: unknown): v is ManifestValue {
  const o = plainObject(v)
  if (o === null) return false
  if (o.kind !== MANIFEST_KIND) return false
  if (typeof o.app_database !== 'string') return false
  if (typeof o.after_operation !== 'number') return false
  const c = plainObject(o.components)
  if (c === null) return false
  for (const k of COMPONENT_REF_KEYS) {
    if (typeof c[k] !== 'string' || (c[k] as string).length === 0) return false
  }
  return true
}

const ORDERED_OPTIONAL_KEYS = ['code', 'fichiers', 'files', 'memoire'] as const

/**
 * Capture les cinq composants, verifie les artefacts qu'elle vient d'ecrire
 * (le magasin lui-meme verifie chaque relecture, T13/T14) et publie le
 * manifeste canonique (L285, L287). La barriere est ROUVERTE dans un
 * `finally` : un checkpoint abandonne au point d'injection ne laisse jamais
 * l'application verrouillee.
 */
export async function finishCheckpoint(
  handle: unknown,
  token: unknown,
  request: unknown,
): Promise<FinishCheckpointResult> {
  const h = requireCoordinator(handle, 'finishCheckpoint')
  const tok = requireToken(token, h, 'finishCheckpoint')
  const req = checkFinishRequest(request)
  try {
    const refs: Partial<Record<(typeof COMPONENT_REF_KEYS)[number], string>> = {}

    const baseBytes = await dumpDatabase(h.app_dsn, h.app_database)
    const baseManifest = await Promise.resolve(putArtifact(h.artifact_store, baseBytes))
    refs.base = baseManifest.ref
    if (req.fault === 'STOP_AFTER_EACH_UPLOAD') {
      throw new CheckpointRefusal(
        'CHECKPOINT_INCOMPLETE',
        'capture interrompue au point d injection STOP_AFTER_EACH_UPLOAD, juste apres le ' +
          'televersement du composant base, avant la publication du manifeste',
        h.app_database,
      )
    }

    for (const key of ORDERED_OPTIONAL_KEYS) {
      const manifest = await Promise.resolve(putArtifact(h.artifact_store, req.components[key]))
      refs[key] = manifest.ref
      if (req.fault === 'STOP_AFTER_EACH_UPLOAD') {
        throw new CheckpointRefusal(
          'CHECKPOINT_INCOMPLETE',
          `capture interrompue au point d injection STOP_AFTER_EACH_UPLOAD, juste apres le ` +
            `televersement du composant ${key}, avant la publication du manifeste`,
          h.app_database,
        )
      }
    }

    const manifestValue: ManifestValue = {
      kind: MANIFEST_KIND,
      app_database: h.app_database,
      after_operation: tok.after_operation,
      components: {
        base: refs.base as string,
        code: refs.code as string,
        fichiers: refs.fichiers as string,
        files: refs.files as string,
        memoire: refs.memoire as string,
      },
    }
    const manifestBytes = canonicalBytes(manifestValue as unknown as CanonicalValue)
    const published = await Promise.resolve(putArtifact(h.artifact_store, manifestBytes))
    return { checkpoint_id: published.ref }
  } finally {
    h.barrierClosed = false
    h.openToken = null
    tok.consumed = true
  }
}

/**
 * Relit les checkpoints COMPLETS et publies de `h.app_database` (L287, A2) :
 * un objet du magasin dont le contenu n'est pas un manifeste de checkpoint —
 * un composant opaque, par exemple — n'y figure jamais.
 */
export async function listCheckpoints(handle: unknown): Promise<readonly CheckpointSummary[]> {
  const h = requireCoordinator(handle, 'listCheckpoints')
  const all = await Promise.resolve(listArtifacts(h.artifact_store))
  const out: CheckpointSummary[] = []
  for (const artifact of all) {
    let bytes: Uint8Array
    try {
      bytes = await Promise.resolve(getArtifact(h.artifact_store, artifact.ref))
    } catch {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.from(bytes).toString('utf8'))
    } catch {
      continue
    }
    if (!isManifestValue(parsed) || parsed.app_database !== h.app_database) continue
    out.push({ checkpoint_id: artifact.ref })
  }
  return out
}

/** Relit un objet reference par un manifeste, ou refuse par un code de checkpoint (L287, A3, A4). */
async function readReferencedComponent(
  artifactStore: unknown,
  ref: string,
  label: string,
): Promise<Buffer> {
  try {
    const bytes = await Promise.resolve(getArtifact(artifactStore, ref))
    return Buffer.from(bytes)
  } catch (e) {
    if (isArtifactRefusal(e)) {
      if (e.code === 'ARTIFACT_MISSING') {
        throw new CheckpointRefusal(
          'CHECKPOINT_INCOMPLETE',
          `${label} reference par ce checkpoint est absent du magasin d'artefacts`,
          ref,
        )
      }
      throw new CheckpointRefusal(
        'CHECKPOINT_CORRUPT',
        `${label} reference par ce checkpoint ne vaut plus son empreinte (${e.code})`,
        ref,
      )
    }
    throw e
  }
}

/**
 * Restaure un checkpoint sur l'environnement VIERGE que `h2` designe (L289) :
 * base fraiche, meme magasin d'artefacts. Ne touche JAMAIS une autre base du
 * cluster que `h2.app_database` (invariant D.4, L66, A6).
 */
export async function restoreCheckpoint(
  handle: unknown,
  request: unknown,
): Promise<RestoreCheckpointResult> {
  const h = requireCoordinator(handle, 'restoreCheckpoint')
  const req = checkRestoreRequest(request)

  const manifestBytes = await readReferencedComponent(h.artifact_store, req.checkpoint_id, 'le pointeur de checkpoint')
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    throw new CheckpointRefusal(
      'CHECKPOINT_INCOMPLETE',
      'le pointeur de checkpoint ne decrit pas un document JSON valide',
      req.checkpoint_id,
    )
  }
  if (!isManifestValue(parsed)) {
    throw new CheckpointRefusal(
      'CHECKPOINT_INCOMPLETE',
      'le pointeur de checkpoint ne decrit pas un manifeste de checkpoint valide',
      req.checkpoint_id,
    )
  }

  const baseBytes = await readReferencedComponent(h.artifact_store, parsed.components.base, 'le composant base')
  const codeBytes = await readReferencedComponent(h.artifact_store, parsed.components.code, 'le composant code')
  const fichiersBytes = await readReferencedComponent(h.artifact_store, parsed.components.fichiers, 'le composant fichiers')
  const filesBytes = await readReferencedComponent(h.artifact_store, parsed.components.files, 'le composant files')
  const memoireBytes = await readReferencedComponent(h.artifact_store, parsed.components.memoire, 'le composant memoire')

  await restoreDatabase(h.app_dsn, baseBytes, h.app_database)
  const facts = await readFacts(h.app_dsn)

  return {
    facts,
    components: {
      code: codeBytes,
      fichiers: fichiersBytes,
      files: filesBytes,
      memoire: memoireBytes,
    },
  }
}
