// ─────────────────────────────────────────────────────────────────────────────
// L'ADAPTATEUR LOCAL du port `ArtifactStore` (cahier L267).
//
// L34 : « le cœur métier ne dépend ni de Temporal, ni de Docker […] les
// interfaces sont implémentées par adaptateurs. » Le port est décrit dans
// src/artifacts.ts ; ce fichier en est la seule implémentation de T13, sur un
// répertoire du système de fichiers. T14 (L273) posera la seconde, sur un
// service objet réel, et devra satisfaire le MÊME contrat — d'où l'insistance
// à ne rien publier ici qui dépende d'un détail POSIX visible de l'appelant.
//
// ── ADRESSAGE PAR LE CONTENU, ET RIEN D'AUTRE ────────────────────────────────
// La référence d'un objet est `sha256:<64 hexadécimaux>`, l'empreinte de ses
// octets. Trois conséquences, et ce sont exactement les propriétés que L269
// exige :
//   · les mêmes octets donnent la même référence, dans ce magasin comme dans
//     un autre — la référence ne doit RIEN à l'histoire du magasin qui la
//     reçoit (A1) ;
//   · un octet changé change l'empreinte, donc la référence (A2) ;
//   · un nom de fichier fourni par un candidat n'entre JAMAIS dans le calcul,
//     donc jamais dans un chemin du stockage central (L271). Le seul chemin
//     qu'une écriture touche est dérivé d'une empreinte, c'est-à-dire de 64
//     caractères hexadécimaux qu'aucune entrée hostile ne peut détourner.
//
// L'empreinte est celle de `@bench/contracts` (L82, prouvée par T02.A3 contre
// le vecteur littéral du cahier). Le stockage ne réimplémente pas SHA-256 : une
// seconde définition de l'empreinte serait une seconde vérité, et c'est
// précisément ce que « empreintes vérifiées avant usage » (L271) ne peut pas
// tolérer.
//
// ── DISPOSITION SUR LE DISQUE ────────────────────────────────────────────────
//   <root>/objects/<aa>/<reste>/bytes          les octets, tels qu'écrits
//   <root>/objects/<aa>/<reste>/manifest.json  le manifeste de contenu (L267)
//   <root>/staging/<unique>/…                  une écriture en cours
//
// Le découpage `<aa>/<reste>` évite un répertoire à un million d'entrées ; il
// n'est pas un contrat, et la suite d'acceptation n'en impose aucun.
//
// ── POURQUOI PUBLIER PAR RENOMMAGE D'UN RÉPERTOIRE ───────────────────────────
// A5 exige qu'une écriture interrompue ne soit pas visible comme objet final.
// Un objet final est ici DEUX fichiers — les octets et leur manifeste — et les
// publier l'un après l'autre laisserait une fenêtre où un objet à demi publié
// existe. `rename(2)` d'un répertoire est atomique sur un même système de
// fichiers : la publication est donc UN seul pas, indivisible. Écrire
// directement sur le chemin final — la perturbation que
// verification/mutants/T13.json pose sur ce cas — rendrait au contraire
// l'objet partiel présent et listable.
//
// Ce qui reste sous `staging/` après une interruption n'est pas nettoyé, et
// c'est délibéré : un vrai crash ne nettoie pas davantage. La preuve que porte
// A5 n'est pas « il ne reste rien », c'est « rien de ce qui reste n'est un
// objet final » — et seul `objects/` est lu par la lecture et le listage.
//
// ── EMPREINTES VÉRIFIÉES AVANT USAGE (L271) ──────────────────────────────────
// Toute lecture recalcule l'empreinte des octets lus et la compare à celle que
// la référence porte. Une corruption d'un seul octet, à longueur préservée,
// est donc refusée par `ARTIFACT_CORRUPT` — un contrôle de taille seul ne la
// verrait pas, et c'est pourquoi A3 corrompt sans changer la longueur.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs'
import * as path from 'node:path'
import { sha256Hex } from '@bench/contracts'
import { ArtifactRefusal } from './artifact-errors.js'

/** Le préfixe d'algorithme d'une référence de contenu (L82). */
export const ARTIFACT_DIGEST_ALGORITHM = 'sha256'

/**
 * LA LIMITE DE TAILLE DÉCLARÉE de L271, en octets.
 *
 * Le cahier exige que la limite soit DÉCLARÉE et n'en fixe aucune valeur ;
 * cette décision de conception est donc prise ici, et consignée à l'endroit
 * où elle s'applique — le rôle `implementer` n'écrit pas `docs/**`
 * (verification/ownership.json), et une décision consignée hors de sa portée
 * serait une décision non consignée. 64 Mio couvre un dépôt de travail
 * compressé, un journal d'appels ou un paquet de tests d'une période, et reste
 * très en deçà de ce qu'un adaptateur doit charger en mémoire pour vérifier
 * une empreinte.
 *
 * Elle est APPLIQUÉE, pas seulement publiée : une écriture plus grande est
 * refusée par `ARTIFACT_TOO_LARGE`, et une entrée d'archive plus grande par
 * `ARCHIVE_ENTRY_TOO_LARGE`. Une limite qu'on annonce sans l'imposer serait le
 * nom d'une limite, pas une limite.
 */
export const ARTIFACT_SIZE_LIMIT_BYTES = 64 * 1024 * 1024

const OBJECTS_DIR = 'objects'
const STAGING_DIR = 'staging'
const BYTES_FILE = 'bytes'
const MANIFEST_FILE = 'manifest.json'

const HEX_64 = /^[0-9a-f]{64}$/

/** Le manifeste de contenu de L267, rendu par une écriture acceptée. */
export interface ArtifactManifest {
  /** La référence de contenu : `sha256:<64 hexadécimaux>`. */
  readonly ref: string
  /** SHA-256 hexadécimal des octets écrits (L82). */
  readonly digest: string
  /** Taille en octets. */
  readonly size: number
  /** L'algorithme d'empreinte, publié pour que la vérification soit reproductible. */
  readonly algorithm: string
}

/** Cible de l'adaptateur local (L267) : la racine d'un répertoire existant. */
export interface ArtifactStoreTarget {
  readonly root: string
}

/**
 * POINT D'INJECTION NOMMÉ (L141), et unique valeur admise.
 *
 * `INTERRUPT_BEFORE_PUBLISH` : les octets sont écrits dans l'aire de transit,
 * puis l'écriture est interrompue AVANT le renommage qui publie l'objet final.
 * C'est un LIVRABLE et non une commodité de test : sans lui, « une écriture
 * interrompue » ne serait pas reproductible et A5 se réduirait à espérer un
 * crash au bon moment.
 */
export type ArtifactFault = 'INTERRUPT_BEFORE_PUBLISH'

export interface PutArtifactOptions {
  readonly fault?: ArtifactFault
}

/**
 * Un magasin local ouvert. Les trois chemins sont publics parce qu'un
 * adaptateur local n'a rien à cacher du disque qu'il gère : la suite
 * d'acceptation recoupe chacune de ses affirmations par une lecture directe de
 * l'arbre de fichiers, et un magasin qui masquerait sa racine rendrait ce
 * recoupement impossible.
 */
export class LocalArtifactStore {
  readonly root: string
  readonly objectsDir: string
  readonly stagingDir: string

  constructor(root: string) {
    this.root = root
    this.objectsDir = path.join(root, OBJECTS_DIR)
    this.stagingDir = path.join(root, STAGING_DIR)
  }
}

export function isLocalArtifactStore(v: unknown): v is LocalArtifactStore {
  return v instanceof LocalArtifactStore
}

/* ─────────────────────────────── contrôles de forme (L80) ──────────────── */

function plainObject(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

/** L80 : « les JSON de domaine sont stricts : propriétés inconnues rejetées ». */
function checkKeys(
  o: Record<string, unknown>,
  allowed: readonly string[],
  code: 'ARTIFACT_STORE_INVALID' | 'ARTIFACT_INPUT_INVALID',
  quoi: string,
): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) {
      throw new ArtifactRefusal(code, `${quoi} n'accepte pas la propriete « ${k} »`, quoi)
    }
  }
}

export function checkStoreTarget(target: unknown): ArtifactStoreTarget {
  const o = plainObject(target)
  if (o === null) {
    throw new ArtifactRefusal(
      'ARTIFACT_STORE_INVALID',
      'openArtifactStore attend un objet plat { root }',
      'openArtifactStore',
    )
  }
  checkKeys(o, ['root'], 'ARTIFACT_STORE_INVALID', 'openArtifactStore')
  const root = o['root']
  if (typeof root !== 'string' || root.length === 0) {
    throw new ArtifactRefusal(
      'ARTIFACT_STORE_INVALID',
      'la propriete root doit etre un chemin de repertoire non vide',
      'openArtifactStore',
    )
  }
  if (!path.isAbsolute(root)) {
    throw new ArtifactRefusal(
      'ARTIFACT_STORE_INVALID',
      'la racine du magasin doit etre un chemin absolu',
      root,
    )
  }
  return { root }
}

function requireStore(handle: unknown, role: string): LocalArtifactStore {
  if (!isLocalArtifactStore(handle)) {
    throw new ArtifactRefusal(
      'ARTIFACT_STORE_INVALID',
      `${role} attend le magasin rendu par openArtifactStore`,
      role,
    )
  }
  return handle
}

function asBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  throw new ArtifactRefusal(
    'ARTIFACT_INPUT_INVALID',
    'putArtifact attend des octets bruts (Uint8Array ou Buffer)',
    'putArtifact',
  )
}

function checkPutOptions(options: unknown): ArtifactFault | null {
  if (options === undefined || options === null) return null
  const o = plainObject(options)
  if (o === null) {
    throw new ArtifactRefusal(
      'ARTIFACT_INPUT_INVALID',
      'les options d ecriture forment un objet plat { fault }',
      'putArtifact',
    )
  }
  checkKeys(o, ['fault'], 'ARTIFACT_INPUT_INVALID', 'putArtifact')
  const fault = o['fault']
  if (fault === undefined) return null
  if (fault !== 'INTERRUPT_BEFORE_PUBLISH') {
    throw new ArtifactRefusal(
      'ARTIFACT_INPUT_INVALID',
      'le seul point d injection declare est INTERRUPT_BEFORE_PUBLISH',
      String(fault),
    )
  }
  return fault
}

/* ────────────────────────────── références de contenu ──────────────────── */

/** `sha256:<64 hexadécimaux>` — la seule forme qu'une écriture publie. */
export function artifactRef(digest: string): string {
  return `${ARTIFACT_DIGEST_ALGORITHM}:${digest}`
}

/**
 * Le digest porté par une référence, ou un refus.
 *
 * Une référence mal formée n'est PAS un objet absent : dire `ARTIFACT_MISSING`
 * ici ferait passer une faute d'appel pour un état du magasin, et A4 perdrait
 * ce qu'il distingue — « l'objet n'est pas là » contre « ce n'est pas une
 * référence ».
 */
export function digestOfRef(ref: unknown, role = 'getArtifact'): string {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new ArtifactRefusal(
      'ARTIFACT_REF_INVALID',
      `${role} attend une reference de contenu non vide`,
      role,
    )
  }
  const prefix = `${ARTIFACT_DIGEST_ALGORITHM}:`
  const digest = ref.startsWith(prefix) ? ref.slice(prefix.length) : ref
  if (!HEX_64.test(digest)) {
    throw new ArtifactRefusal(
      'ARTIFACT_REF_INVALID',
      `une reference de contenu est ${prefix}<64 hexadecimaux>`,
      ref,
    )
  }
  return digest
}

function objectDirOf(store: LocalArtifactStore, digest: string): string {
  return path.join(store.objectsDir, digest.slice(0, 2), digest.slice(2))
}

/* ──────────────────────────────────── ouverture ────────────────────────── */

/**
 * Ouvre l'adaptateur local sur une racine de répertoire EXISTANTE (L267).
 *
 * L'ouverture crée `objects/` et `staging/` : ce sont des répertoires, jamais
 * des objets finaux, et les créer au plus tôt évite qu'une écriture ait à les
 * fabriquer entre ses octets et sa publication.
 */
export function openLocalArtifactStore(target: unknown): LocalArtifactStore {
  const { root } = checkStoreTarget(target)
  let stat: fs.Stats
  try {
    stat = fs.statSync(root)
  } catch {
    throw new ArtifactRefusal(
      'ARTIFACT_STORE_INVALID',
      'la racine du magasin doit exister avant l ouverture',
      root,
    )
  }
  if (!stat.isDirectory()) {
    throw new ArtifactRefusal('ARTIFACT_STORE_INVALID', 'la racine du magasin n est pas un repertoire', root)
  }
  const store = new LocalArtifactStore(root)
  fs.mkdirSync(store.objectsDir, { recursive: true })
  fs.mkdirSync(store.stagingDir, { recursive: true })
  return store
}

/* ──────────────────────────────────── écriture ─────────────────────────── */

let stagingCounter = 0

function newStagingDir(store: LocalArtifactStore): string {
  stagingCounter += 1
  const unique = `${process.pid.toString(36)}-${Date.now().toString(36)}-${stagingCounter.toString(36)}`
  const dir = path.join(store.stagingDir, unique)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeFileDurable(file: string, bytes: Uint8Array): void {
  const fd = fs.openSync(file, 'wx', 0o644)
  try {
    fs.writeSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function manifestBytes(manifest: ArtifactManifest): Uint8Array {
  // Ordre de clés fixe et aucune indentation : le manifeste sur disque est une
  // donnée vérifiée octet par octet à la relecture, pas un fichier d'agrément.
  const json = JSON.stringify({
    ref: manifest.ref,
    digest: manifest.digest,
    size: manifest.size,
    algorithm: manifest.algorithm,
  })
  return Buffer.from(json, 'utf8')
}

/**
 * Écrit des octets bruts et rend le MANIFESTE DE CONTENU de L267.
 *
 * Écriture en deux temps : l'objet complet — octets et manifeste — est
 * constitué sous `staging/`, puis publié par un renommage de répertoire, seul
 * pas visible de l'extérieur. Deux écritures des mêmes octets produisent la
 * même référence ; la seconde constate que l'adresse est déjà publiée et ne
 * réécrit rien : un magasin IMMUABLE (L265) ne réécrit pas une adresse.
 */
export function putLocalArtifact(
  handle: unknown,
  bytes: unknown,
  options?: unknown,
): ArtifactManifest {
  const store = requireStore(handle, 'putArtifact')
  const payload = asBytes(bytes)
  const fault = checkPutOptions(options)

  if (payload.byteLength > ARTIFACT_SIZE_LIMIT_BYTES) {
    throw new ArtifactRefusal(
      'ARTIFACT_TOO_LARGE',
      `la limite declaree est de ${String(ARTIFACT_SIZE_LIMIT_BYTES)} octets, ` +
        `l ecriture en presente ${String(payload.byteLength)}`,
      'putArtifact',
    )
  }

  const digest = sha256Hex(payload)
  const manifest: ArtifactManifest = {
    ref: artifactRef(digest),
    digest,
    size: payload.byteLength,
    algorithm: ARTIFACT_DIGEST_ALGORITHM,
  }
  const finalDir = objectDirOf(store, digest)

  // Déjà publié : la même adresse porte les mêmes octets, par construction.
  if (fault === null && fs.existsSync(path.join(finalDir, BYTES_FILE))) {
    return manifest
  }

  const staging = newStagingDir(store)
  writeFileDurable(path.join(staging, BYTES_FILE), payload)
  writeFileDurable(path.join(staging, MANIFEST_FILE), manifestBytes(manifest))

  if (fault === 'INTERRUPT_BEFORE_PUBLISH') {
    // Les octets SONT écrits ; la publication n'a pas lieu. Ce qui reste sous
    // `staging/` n'est lu ni par la lecture, ni par le listage : il n'est donc
    // pas un objet final, ce qui est exactement ce qu'A5 observe.
    throw new ArtifactRefusal(
      'ARTIFACT_WRITE_INTERRUPTED',
      'ecriture interrompue au point d injection INTERRUPT_BEFORE_PUBLISH, avant publication',
      manifest.ref,
    )
  }

  fs.mkdirSync(path.dirname(finalDir), { recursive: true })
  try {
    fs.renameSync(staging, finalDir)
  } catch {
    // La seule course possible est une publication concurrente de la MÊME
    // adresse : le contenu y est identique, et l'objet déjà en place fait foi.
    if (!fs.existsSync(path.join(finalDir, BYTES_FILE))) {
      throw new ArtifactRefusal(
        'ARTIFACT_CORRUPT',
        'la publication de l objet n a pas pu etre menee a son terme',
        manifest.ref,
      )
    }
    fs.rmSync(staging, { recursive: true, force: true })
  }
  return manifest
}

/* ──────────────────────────────────── lecture ──────────────────────────── */

function readManifestFile(file: string, expected: string): ArtifactManifest {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    throw new ArtifactRefusal(
      'ARTIFACT_CORRUPT',
      'le manifeste de contenu de l objet est illisible',
      artifactRef(expected),
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ArtifactRefusal(
      'ARTIFACT_CORRUPT',
      'le manifeste de contenu n est pas un document JSON valide',
      artifactRef(expected),
    )
  }
  const o = plainObject(parsed)
  const keys = o === null ? [] : Object.keys(o).sort()
  const attendu = ['algorithm', 'digest', 'ref', 'size']
  if (o === null || keys.join(',') !== attendu.join(',')) {
    throw new ArtifactRefusal(
      'ARTIFACT_CORRUPT',
      `le manifeste de contenu ne porte pas exactement [${attendu.join(', ')}]`,
      artifactRef(expected),
    )
  }
  const digest = o['digest']
  const ref = o['ref']
  const size = o['size']
  const algorithm = o['algorithm']
  if (
    typeof digest !== 'string' ||
    digest !== expected ||
    ref !== artifactRef(expected) ||
    algorithm !== ARTIFACT_DIGEST_ALGORITHM ||
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < 0
  ) {
    throw new ArtifactRefusal(
      'ARTIFACT_CORRUPT',
      'le manifeste de contenu ne decrit plus l objet auquel il est joint',
      artifactRef(expected),
    )
  }
  return { ref: artifactRef(expected), digest: expected, size, algorithm: ARTIFACT_DIGEST_ALGORITHM }
}

/**
 * Relit les octets EXACTS d'une référence, ou refuse par un code nommé.
 *
 * L'ORDRE DES CONTRÔLES EST LE CONTRAT. Un objet dont les fichiers ont disparu
 * est ABSENT (`ARTIFACT_MISSING`, L269) ; un objet dont les fichiers sont là
 * mais ne valent plus leur empreinte est CORROMPU (`ARTIFACT_CORRUPT`, L269).
 * Confondre les deux effacerait la distinction que A3 et A4 posent.
 *
 * Aucune de ces deux branches ne rend d'octets. Rendre un tampon vide plutôt
 * que refuser est la permissivité que verification/cases.lock.json désigne
 * comme la perturbation qui doit rendre A4 rouge.
 */
export function getLocalArtifact(handle: unknown, ref: unknown): Uint8Array {
  const store = requireStore(handle, 'getArtifact')
  const digest = digestOfRef(ref)
  const dir = objectDirOf(store, digest)
  const bytesFile = path.join(dir, BYTES_FILE)

  let stat: fs.Stats
  try {
    stat = fs.statSync(bytesFile)
  } catch {
    throw new ArtifactRefusal(
      'ARTIFACT_MISSING',
      'aucun objet final ne porte cette reference sous ce magasin',
      artifactRef(digest),
    )
  }
  if (!stat.isFile()) {
    throw new ArtifactRefusal(
      'ARTIFACT_MISSING',
      'aucun objet final ne porte cette reference sous ce magasin',
      artifactRef(digest),
    )
  }

  const manifest = readManifestFile(path.join(dir, MANIFEST_FILE), digest)

  let bytes: Buffer
  try {
    bytes = fs.readFileSync(bytesFile)
  } catch {
    throw new ArtifactRefusal(
      'ARTIFACT_CORRUPT',
      'les octets de l objet sont presents mais illisibles',
      artifactRef(digest),
    )
  }

  // « EMPREINTES VÉRIFIÉES AVANT USAGE » (L271). La taille seule ne suffirait
  // pas : A3 corrompt un octet SANS changer la longueur, précisément pour
  // qu'un contrôle de taille ne puisse pas tenir lieu de vérification.
  if (bytes.byteLength !== manifest.size) {
    throw new ArtifactRefusal(
      'ARTIFACT_CORRUPT',
      `l objet mesure ${String(bytes.byteLength)} octets la ou son manifeste en annonce ` +
        `${String(manifest.size)}`,
      artifactRef(digest),
    )
  }
  const observed = sha256Hex(bytes)
  if (observed !== digest) {
    throw new ArtifactRefusal(
      'ARTIFACT_CORRUPT',
      `les octets lus ont pour empreinte ${observed}, la reference en attendait ${digest}`,
      artifactRef(digest),
    )
  }
  return bytes
}

/* ──────────────────────────────────── listage ──────────────────────────── */

function readdirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Ce que le magasin publie comme objets FINAUX (L269).
 *
 * Seul `objects/` est parcouru : une écriture restée sous `staging/` n'a
 * jamais été publiée, et la faire apparaître ici reviendrait à appeler « objet
 * final » un objet qui n'a pas franchi son renommage.
 */
export function listLocalArtifacts(handle: unknown): readonly ArtifactManifest[] {
  const store = requireStore(handle, 'listArtifacts')
  const out: ArtifactManifest[] = []
  for (const shard of readdirSafe(store.objectsDir)) {
    if (!shard.isDirectory()) continue
    for (const rest of readdirSafe(path.join(store.objectsDir, shard.name))) {
      if (!rest.isDirectory()) continue
      const digest = `${shard.name}${rest.name}`
      if (!HEX_64.test(digest)) continue
      const bytesFile = path.join(store.objectsDir, shard.name, rest.name, BYTES_FILE)
      let stat: fs.Stats
      try {
        stat = fs.statSync(bytesFile)
      } catch {
        continue
      }
      if (!stat.isFile()) continue
      out.push({
        ref: artifactRef(digest),
        digest,
        size: stat.size,
        algorithm: ARTIFACT_DIGEST_ALGORITHM,
      })
    }
  }
  out.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
  return out
}
