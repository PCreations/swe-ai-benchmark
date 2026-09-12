// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION BORNÉE D'UNE ARCHIVE (cahier L269, L271).
//
// L269 : « extraction d'une archive contenant `../escape`, chemin absolu ou
// lien sortant est refusée sans écriture hors destination. »
// L271 : « un nom de fichier fourni par le candidat n'est jamais concaténé
// directement à un chemin du stockage central. »
//
// ── CE QUE « JAMAIS CONCATÉNÉ DIRECTEMENT » VEUT DIRE ICI ────────────────────
// Aucun nom porté par une archive n'est joint à un chemin sans avoir d'abord
// été RÉSOLU puis CONFRONTÉ à la destination réelle. La résolution seule ne
// suffit pas — un lien symbolique sortant fait qu'un chemin textuellement
// interne aboutit à l'extérieur —, d'où trois gardes distinctes, et non une :
//
//   1. FORME DU NOM       un nom absolu, ou qui contient un segment `..`, est
//                         refusé sans même être résolu.
//   2. CONFINEMENT        le chemin résolu doit être la destination réelle ou
//                         vivre dessous. `path.relative` tranche ; une
//                         comparaison de préfixes de chaînes confondrait
//                         `…/dest-bis` avec `…/dest`.
//   3. LIENS              la cible d'un lien symbolique est résolue depuis le
//                         répertoire de l'entrée et doit rester confinée ; et
//                         aucune entrée ne peut passer PAR un lien déclaré plus
//                         haut dans la même archive.
//
// Les deux premières gardes ne se recouvrent pas avec la troisième, et
// verification/mutants/T13.json le mesure : retirer le confinement laisse
// `../escape` s'écrire dehors pendant que le lien reste refusé, et retirer le
// contrôle des liens fait exactement l'inverse.
//
// ── VALIDER TOUTE L'ARCHIVE AVANT D'EN ÉCRIRE UNE SEULE ENTRÉE ───────────────
// « Refusée SANS écriture hors destination » est une propriété de l'archive
// entière, pas de chacune de ses entrées prises à part. Un extracteur qui
// écrirait au fil de la lecture aurait déjà posé les entrées bénignes qui
// précèdent le piège. Les entrées sont donc toutes analysées d'abord ; la
// première fautive fait refuser l'archive, et rien n'a encore été écrit.
//
// ── POURQUOI UN LECTEUR TAR ÉCRIT ICI ────────────────────────────────────────
// Déléguer à `tar(1)` ferait dépendre une règle de sécurité du dépôt des
// options de l'archiveur installé sur la machine, et ces archiveurs RÉÉCRIVENT
// les noms hostiles au lieu de les refuser. Le format ustar est public et
// tient en un en-tête de 512 octets ; le lire ici garde la règle vérifiable et
// la machine hors du contrat.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs'
import * as path from 'node:path'
import { ArtifactRefusal } from './artifact-errors.js'
import { ARTIFACT_SIZE_LIMIT_BYTES } from './artifact-local.js'

/** Les deux chemins ABSOLUS d'une extraction bornée (L269). */
export interface ExtractArchiveRequest {
  readonly archive_path: string
  readonly dest_dir: string
}

/** Ce qu'une extraction acceptée rapporte : les chemins réellement posés. */
export interface ExtractArchiveReport {
  readonly entries: readonly string[]
}

const BLOCK = 512

/** Les types d'entrée que cet extracteur sait poser sûrement. */
const TYPE_FILE = ['0', '\0', '7'] as const
const TYPE_SYMLINK = '2'
const TYPE_DIRECTORY = '5'

interface TarEntry {
  readonly name: string
  readonly typeflag: string
  readonly linkname: string
  readonly size: number
  readonly dataOffset: number
}

/* ──────────────────────────── lecture d'un en-tête ustar ───────────────── */

function readString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8')
}

function readOctal(block: Buffer, offset: number, length: number): number {
  const text = readString(block, offset, length).trim()
  if (text.length === 0) return 0
  const n = Number.parseInt(text, 8)
  return Number.isFinite(n) ? n : Number.NaN
}

function isZeroBlock(block: Buffer): boolean {
  for (const octet of block) if (octet !== 0) return false
  return true
}

/**
 * Somme de contrôle de l'en-tête : la somme de ses 512 octets, le champ de
 * somme lui-même compté comme huit espaces. Les deux variantes historiques —
 * octets non signés et octets signés — sont acceptées, parce que les deux ont
 * été produites par des archiveurs réels et qu'un refus arbitraire ici
 * ressemblerait à une règle de sécurité sans en être une.
 */
function checksumMatches(block: Buffer, declared: number): boolean {
  let unsigned = 0
  let signed = 0
  for (let i = 0; i < BLOCK; i += 1) {
    const octet = i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0)
    unsigned += octet
    signed += octet > 127 ? octet - 256 : octet
  }
  return declared === unsigned || declared === signed
}

function readEntries(archive: Buffer, subject: string): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK)
    if (isZeroBlock(header)) break

    const declared = readOctal(header, 148, 8)
    if (!Number.isFinite(declared) || !checksumMatches(header, declared)) {
      throw new ArtifactRefusal(
        'ARCHIVE_HEADER_INVALID',
        'un en-tete d archive ne satisfait pas sa propre somme de controle',
        subject,
      )
    }

    const name = readString(header, 0, 100)
    const prefix = readString(header, 345, 155)
    const size = readOctal(header, 124, 12)
    if (!Number.isFinite(size) || size < 0) {
      throw new ArtifactRefusal(
        'ARCHIVE_HEADER_INVALID',
        'un en-tete d archive declare une taille illisible',
        name,
      )
    }
    const typeflag = readString(header, 156, 1)
    const linkname = readString(header, 157, 100)

    offset += BLOCK
    const dataOffset = offset
    if (typeflag === '' || (TYPE_FILE as readonly string[]).includes(typeflag)) {
      offset += Math.ceil(size / BLOCK) * BLOCK
    }

    entries.push({
      name: prefix.length > 0 ? `${prefix}/${name}` : name,
      typeflag: typeflag === '' ? '0' : typeflag,
      linkname,
      size,
      dataOffset,
    })
  }
  return entries
}

/* ─────────────────────────── les trois gardes de chemin ────────────────── */

function isAbsoluteEntryName(name: string): boolean {
  return name.startsWith('/') || /^[A-Za-z]:[\\/]/.test(name) || path.isAbsolute(name)
}

/** Confinement : `p` est-il la destination elle-même, ou vit-il dessous ? */
function isContained(destReal: string, p: string): boolean {
  if (p === destReal) return true
  const rel = path.relative(destReal, p)
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel)
}

interface PlannedEntry {
  readonly entry: TarEntry
  /** Le chemin absolu, résolu depuis la destination réelle. */
  readonly target: string
  /** Les segments du nom, `.` et vides retirés. */
  readonly segments: readonly string[]
}

/**
 * Analyse UNE entrée. Toute anomalie lève : l'appelant n'a alors encore rien
 * écrit, ce qui est la propriété que L269 demande de l'archive entière.
 *
 * `symlinks` porte les noms d'entrée déjà déclarés comme liens : une entrée
 * dont un ancêtre est l'un d'eux est refusée, parce que son chemin passerait
 * par un lien que cette archive vient de poser. C'est la forme que la seule
 * normalisation de chemin ne voit pas — `lien-sortant/charge` reste,
 * textuellement, sous la destination.
 */
function planEntry(entry: TarEntry, destReal: string, symlinks: ReadonlySet<string>): PlannedEntry {
  const name = entry.name
  if (name.length === 0) {
    throw new ArtifactRefusal('ARCHIVE_HEADER_INVALID', 'une entree d archive n a pas de nom', '')
  }
  if (name.includes('\0')) {
    throw new ArtifactRefusal('ARCHIVE_HEADER_INVALID', 'un nom d entree porte un octet nul', name)
  }
  if (isAbsoluteEntryName(name)) {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_ABSOLUTE_PATH',
      'une entree d archive porte un chemin absolu et ne sera pas posee',
      name,
    )
  }

  const segments = name.split('/').filter((s) => s.length > 0 && s !== '.')
  if (segments.includes('..')) {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_PATH_TRAVERSAL',
      'une entree d archive remonte hors de sa destination par « .. »',
      name,
    )
  }
  if (segments.length === 0) {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_PATH_TRAVERSAL',
      'une entree d archive ne designe aucun chemin sous la destination',
      name,
    )
  }

  for (let i = 1; i <= segments.length - 1; i += 1) {
    if (symlinks.has(segments.slice(0, i).join('/'))) {
      throw new ArtifactRefusal(
        'ARCHIVE_ENTRY_PATH_THROUGH_SYMLINK',
        'une entree d archive passerait par un lien declare plus haut dans la meme archive',
        name,
      )
    }
  }

  const target = path.resolve(destReal, segments.join('/'))
  if (!isContained(destReal, target)) {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_OUTSIDE_DESTINATION',
      'une entree d archive se resout hors du repertoire de destination',
      name,
    )
  }

  if (entry.typeflag === TYPE_SYMLINK) {
    const link = entry.linkname
    if (link.length === 0) {
      throw new ArtifactRefusal('ARCHIVE_HEADER_INVALID', 'un lien d archive n a pas de cible', name)
    }
    const resolved = path.resolve(path.dirname(target), link)
    if (isAbsoluteEntryName(link) || !isContained(destReal, resolved)) {
      throw new ArtifactRefusal(
        'ARCHIVE_ENTRY_SYMLINK_ESCAPE',
        'une entree d archive est un lien dont la cible sort de la destination',
        `${name} -> ${link}`,
      )
    }
    return { entry, target, segments }
  }

  if (entry.typeflag === TYPE_DIRECTORY) return { entry, target, segments }

  if (!(TYPE_FILE as readonly string[]).includes(entry.typeflag)) {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_UNSUPPORTED_TYPE',
      `cet extracteur ne pose pas les entrees de type « ${entry.typeflag} »`,
      name,
    )
  }
  if (entry.size > ARTIFACT_SIZE_LIMIT_BYTES) {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_TOO_LARGE',
      `la limite declaree est de ${String(ARTIFACT_SIZE_LIMIT_BYTES)} octets, ` +
        `cette entree en declare ${String(entry.size)}`,
      name,
    )
  }
  if (entry.dataOffset + entry.size > Number.MAX_SAFE_INTEGER) {
    throw new ArtifactRefusal('ARCHIVE_HEADER_INVALID', 'une entree declare une taille aberrante', name)
  }
  return { entry, target, segments }
}

/* ──────────────────────────────── extraction ───────────────────────────── */

/**
 * Crée les répertoires manquants jusqu'à `dir`, en vérifiant à chaque pas que
 * l'on reste sous la destination réelle. La vérification n'est pas redondante
 * avec `planEntry` : la destination peut déjà contenir un lien qu'aucune entrée
 * de cette archive n'a déclaré, et `realpath` est le seul témoin qui le voie.
 */
function mkdirConfined(destReal: string, dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true })
  let real: string
  try {
    real = fs.realpathSync(dir)
  } catch {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_OUTSIDE_DESTINATION',
      'le repertoire d accueil d une entree n a pas pu etre confirme sous la destination',
      name,
    )
  }
  if (!isContained(destReal, real) && real !== destReal) {
    throw new ArtifactRefusal(
      'ARCHIVE_ENTRY_PATH_THROUGH_SYMLINK',
      'le repertoire d accueil d une entree sort de la destination une fois les liens resolus',
      name,
    )
  }
}

/**
 * Extrait une archive tar ustar non compressée dans `dest_dir`, ou refuse.
 *
 * Le magasin n'est pas consulté : l'extraction est bornée par la destination
 * qu'on lui donne, et non par la racine d'un magasin. Le port l'expose tout de
 * même comme une opération du stockage parce que c'est là que vit la règle de
 * L271 sur les noms fournis par un candidat.
 */
export function extractArchiveInto(request: unknown): ExtractArchiveReport {
  const o =
    request !== null && typeof request === 'object' && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : null
  if (o === null) {
    throw new ArtifactRefusal(
      'ARCHIVE_DESTINATION_INVALID',
      'extractArchive attend un objet plat { archive_path, dest_dir }',
      'extractArchive',
    )
  }
  for (const k of Object.keys(o)) {
    if (k !== 'archive_path' && k !== 'dest_dir') {
      throw new ArtifactRefusal(
        'ARCHIVE_DESTINATION_INVALID',
        `extractArchive n'accepte pas la propriete « ${k} »`,
        'extractArchive',
      )
    }
  }
  const archivePath = o['archive_path']
  const destDir = o['dest_dir']
  if (typeof archivePath !== 'string' || !path.isAbsolute(archivePath)) {
    throw new ArtifactRefusal(
      'ARCHIVE_UNREADABLE',
      'archive_path doit etre un chemin absolu',
      String(archivePath),
    )
  }
  if (typeof destDir !== 'string' || !path.isAbsolute(destDir)) {
    throw new ArtifactRefusal(
      'ARCHIVE_DESTINATION_INVALID',
      'dest_dir doit etre un chemin absolu',
      String(destDir),
    )
  }

  let destReal: string
  try {
    const stat = fs.statSync(destDir)
    if (!stat.isDirectory()) throw new Error('pas un repertoire')
    destReal = fs.realpathSync(destDir)
  } catch {
    throw new ArtifactRefusal(
      'ARCHIVE_DESTINATION_INVALID',
      'la destination d extraction doit etre un repertoire existant',
      destDir,
    )
  }

  let archive: Buffer
  try {
    archive = fs.readFileSync(archivePath)
  } catch {
    throw new ArtifactRefusal('ARCHIVE_UNREADABLE', 'l archive est introuvable ou illisible', archivePath)
  }

  // ── PHASE 1 : analyser TOUTE l'archive. Rien n'est écrit ici.
  const entries = readEntries(archive, archivePath)
  const symlinks = new Set<string>()
  const planned: PlannedEntry[] = []
  for (const entry of entries) {
    const plan = planEntry(entry, destReal, symlinks)
    if (entry.typeflag === TYPE_SYMLINK) symlinks.add(plan.segments.join('/'))
    planned.push(plan)
  }

  // ── PHASE 2 : poser les entrées, chacune confinée à la destination.
  const posees: string[] = []
  for (const plan of planned) {
    const { entry, target } = plan
    const name = entry.name
    if (entry.typeflag === TYPE_DIRECTORY || name.endsWith('/')) {
      mkdirConfined(destReal, target, name)
      posees.push(name)
      continue
    }
    mkdirConfined(destReal, path.dirname(target), name)
    if (entry.typeflag === TYPE_SYMLINK) {
      fs.symlinkSync(entry.linkname, target)
      posees.push(name)
      continue
    }
    const data = archive.subarray(entry.dataOffset, entry.dataOffset + entry.size)
    if (data.length !== entry.size) {
      throw new ArtifactRefusal(
        'ARCHIVE_HEADER_INVALID',
        'une entree annonce plus d octets que l archive n en porte',
        name,
      )
    }
    fs.writeFileSync(target, data, { mode: 0o644 })
    posees.push(name)
  }

  return { entries: posees }
}
