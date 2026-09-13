// ─────────────────────────────────────────────────────────────────────────────
// L'ADAPTATEUR S3 DU PORT `ArtifactStore` (tâche T14, cahier L273-L279).
//
// L34 : « les interfaces sont implémentées par adaptateurs. » src/artifacts.ts
// est le PORT, src/artifact-local.ts son adaptateur sur un répertoire, et ce
// fichier le second adaptateur — sur un service objet RÉEL. Les deux satisfont
// le même contrat, et c'est tout l'intérêt : L269 ne parle ni de `rename(2)` ni
// de transfert multipart, et aucune de ses six propriétés ne change de sens en
// passant du disque au réseau.
//
// ── ADRESSAGE PAR LE CONTENU, DONC UNE CLÉ PAR CONTENU ──────────────────────
//   <préfixe>/objects/sha256/<64 hexadécimaux>
// La clé ne doit RIEN à l'histoire du magasin : ni horodatage, ni compteur, ni
// suffixe aléatoire. Trois propriétés en découlent, et ce sont exactement
// celles que L269 et L277 exigent :
//   · les mêmes octets donnent la même référence, ici comme dans un autre
//     magasin — donc deux uploads SIMULTANÉS des mêmes octets donnent la même
//     référence (A3) sans qu'aucun verrou soit nécessaire ;
//   · un octet changé change l'empreinte, donc la clé (A1) ;
//   · une reprise vise la MÊME clé que le transfert interrompu, donc ne peut
//     pas créer un second objet logique (A2).
// Un nom fourni par un candidat n'entre jamais dans la clé : seuls 64
// caractères hexadécimaux le font (L271).
//
// UNE SEULE CLÉ PAR ARTEFACT, ET AUCUN MANIFESTE ÉCRIT À CÔTÉ. Le manifeste de
// contenu (L267) est RENDU par l'écriture ; le stocker dans un second objet
// ferait deux objets pour un artefact, et rendrait « ne crée pas deux objets
// logiques » (L277) indémontrable sur le service. Tout ce que le manifeste
// porte — référence, empreinte, taille — se relit de la clé et de la taille de
// l'objet ; le vérifier, c'est recalculer l'empreinte des octets lus, ce que
// « empreintes vérifiées avant usage » (L271) impose de toute façon.
//
// ── PUBLICATION, INTERRUPTION, REPRISE ──────────────────────────────────────
// Un PUT S3 est atomique : l'objet apparaît complet ou pas du tout. C'est la
// publication d'un petit artefact. Au-delà d'une partie (5 Mio), le transfert
// est découpé en parties, et l'objet n'existe qu'au `complete` : c'est ce qui
// rend un transfert INTERRUPTIBLE EN COURS, donc reproductible, donc
// observable (L141).
//
//   INTERRUPT_BEFORE_PUBLISH  toutes les parties sont transférées, le
//                             `complete` n'a pas lieu : rien n'est visible.
//   INTERRUPT_DURING_UPLOAD   la première partie seulement est transférée :
//                             le transfert reste PENDANT, et un appel ultérieur
//                             des mêmes octets le REPREND.
//
// La reprise n'est pas un nouveau transfert : `putArtifact` cherche d'abord un
// transfert pendant sur SA clé, relit les parties déjà reçues et ne réémet que
// celles qui manquent. Comme la clé est celle du contenu, un transfert pendant
// sur cette clé porte forcément les mêmes octets — la reprise est donc sûre par
// construction, et non par convention.
//
// ── CE QUE L279 INTERDIT, ET COMMENT CE FICHIER S'Y PLIE ────────────────────
// « Les préfixes ne sont pas, seuls, un mécanisme d'autorisation ; le contrôle
// doit être exercé par le stockage ou un service d'accès. » Aucune ligne
// ci-dessous ne compare un préfixe pour décider d'un accès : le magasin SIGNE
// et laisse le service répondre. Un refus du service devient un refus NOMMÉ
// (`ARTIFACT_ACCESS_DENIED`), jamais un plantage et jamais un repli anonyme.
// Les identités limitées vivent dans src/s3-test-service.ts, où leurs
// permissions sont posées DANS le service.
//
// ── AUCUN SECRET DANS LES RAPPORTS (L277, cas A6) ───────────────────────────
// Les identifiants du magasin sont des champs PRIVÉS (`#`) : ils n'apparaissent
// ni dans `Object.entries`, ni dans `JSON.stringify`, ni dans l'inspection d'un
// magasin. Aucun message de refus ne recopie un corps de réponse du service
// (src/s3-http.ts n'en laisse remonter que le statut et un `<Code>` assaini).
// Une fuite n'est donc pas évitée par relecture attentive des messages : elle
// n'a pas de chemin.
// ─────────────────────────────────────────────────────────────────────────────

import { sha256Hex } from '@bench/contracts'
import { ArtifactRefusal } from './artifact-errors.js'
import {
  ARTIFACT_DIGEST_ALGORITHM,
  ARTIFACT_SIZE_LIMIT_BYTES,
  artifactRef,
  digestOfRef,
} from './artifact-local.js'
import type { ArtifactManifest } from './artifact-local.js'
import { s3Request, xmlBlocks, xmlTag } from './s3-http.js'
import type { S3Coordinates, S3Credentials, S3Response } from './s3-http.js'

export { createScopedIdentity, s3TestServiceConfig } from './s3-test-service.js'
export type {
  S3TestServiceConfig,
  ScopedIdentity,
  ScopedIdentityRequest,
} from './s3-test-service.js'

/**
 * La cible d'ouverture de l'adaptateur S3.
 *
 * `prefix` est le PRÉFIXE D'ARTEFACTS de L559 : il isole les exécutions. Il
 * n'est PAS un mécanisme d'autorisation (L279).
 *
 * `expires_at` est l'ÉCHÉANCE de l'autorisation ouverte — un timestamp UTC
 * ISO 8601 (L80). Au-delà, toute opération est refusée par un code qui nomme sa
 * cause, jamais servie par un repli anonyme (L277, cas A5).
 */
export interface S3ArtifactStoreTarget {
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
  readonly prefix: string
  readonly access_key_id: string
  readonly secret_access_key: string
  readonly expires_at?: string
}

/**
 * LES DEUX POINTS D'INJECTION NOMMÉS (L141), et les seules valeurs admises.
 * Ce sont des LIVRABLES : sans eux, « un transfert interrompu puis repris »
 * (L277) ne serait pas reproductible, et A2 se réduirait à espérer une panne au
 * bon moment.
 */
export type S3ArtifactFault = 'INTERRUPT_BEFORE_PUBLISH' | 'INTERRUPT_DURING_UPLOAD'

export interface S3PutArtifactOptions {
  readonly fault?: S3ArtifactFault
}

/** Taille d'une partie de transfert, et seuil du découpage. */
const PART_SIZE_BYTES = 5 * 1024 * 1024

const OBJECTS_SEGMENT = 'objects'
const HEX_64 = /^[0-9a-f]{64}$/

/* ────────────────────────────────── le magasin ─────────────────────────── */

/**
 * Un magasin S3 ouvert.
 *
 * Les coordonnées sont publiques — un magasin n'a rien à cacher de l'endroit
 * où il écrit, et la suite d'acceptation recoupe ses affirmations par une
 * lecture directe du service. Les IDENTIFIANTS, eux, sont privés : L277 veut
 * qu'aucun rapport ne les publie, et le plus sûr est qu'ils ne soient pas
 * atteignables depuis l'extérieur de cette classe.
 */
export class S3ArtifactStore {
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
  readonly prefix: string
  readonly expiresAt: string | null

  readonly #accessKeyId: string
  readonly #secretAccessKey: string

  constructor(target: S3ArtifactStoreTarget) {
    this.endpoint = target.endpoint
    this.region = target.region
    this.bucket = target.bucket
    this.prefix = target.prefix
    this.expiresAt = target.expires_at ?? null
    this.#accessKeyId = target.access_key_id
    this.#secretAccessKey = target.secret_access_key
  }

  get coordinates(): S3Coordinates {
    return { endpoint: this.endpoint, region: this.region, bucket: this.bucket }
  }

  get credentials(): S3Credentials {
    return { access_key_id: this.#accessKeyId, secret_access_key: this.#secretAccessKey }
  }
}

export function isS3ArtifactStore(v: unknown): v is S3ArtifactStore {
  return v instanceof S3ArtifactStore
}

/* ─────────────────────────── contrôles de forme (L80) ──────────────────── */

function plainObject(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

const OPEN_KEYS = [
  'endpoint',
  'region',
  'bucket',
  'prefix',
  'access_key_id',
  'secret_access_key',
  'expires_at',
] as const

function invalidTarget(detail: string, subject: string): ArtifactRefusal {
  return new ArtifactRefusal('ARTIFACT_STORE_INVALID', detail, subject)
}

function requiredText(o: Record<string, unknown>, name: string): string {
  const v = o[name]
  if (typeof v !== 'string' || v.length === 0) {
    throw invalidTarget(`la propriete ${name} doit etre une chaine non vide`, 'openS3ArtifactStore')
  }
  return v
}

/** L80 : timestamp UTC ISO 8601. Une échéance illisible n'est pas une échéance. */
function checkDeadline(value: unknown): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw invalidTarget(
      'la propriete expires_at doit etre un timestamp UTC ISO 8601',
      'openS3ArtifactStore',
    )
  }
  return value
}

/**
 * Ouvre l'adaptateur S3 sur un seau et un préfixe (L275).
 *
 * L'ouverture ne contacte PAS le service : elle vérifie la forme de sa cible et
 * rien d'autre. Ouvrir un magasin sous une autorisation déjà échue est donc
 * permis — c'est à l'OPÉRATION de refuser, parce que c'est l'opération qui
 * aurait servi les octets (A5).
 */
export function openS3ArtifactStore(target: unknown): S3ArtifactStore {
  const o = plainObject(target)
  if (o === null) {
    throw invalidTarget(
      'openS3ArtifactStore attend un objet plat { endpoint, region, bucket, prefix, ' +
        'access_key_id, secret_access_key }',
      'openS3ArtifactStore',
    )
  }
  for (const k of Object.keys(o)) {
    if (!(OPEN_KEYS as readonly string[]).includes(k)) {
      throw invalidTarget(
        `openS3ArtifactStore n accepte pas la propriete « ${k} »`,
        'openS3ArtifactStore',
      )
    }
  }
  const endpoint = requiredText(o, 'endpoint')
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw invalidTarget('l endpoint du service doit etre une URL http ou https', 'endpoint')
    }
  } catch (e) {
    if (e instanceof ArtifactRefusal) throw e
    throw invalidTarget('l endpoint du service doit etre une URL http ou https', 'endpoint')
  }
  const prefix = requiredText(o, 'prefix').replace(/\/+$/, '')
  if (prefix.length === 0) {
    throw invalidTarget('le prefixe d artefacts ne peut pas se reduire a des separateurs', 'prefix')
  }
  const deadline = checkDeadline(o['expires_at'])
  const base = {
    endpoint,
    region: requiredText(o, 'region'),
    bucket: requiredText(o, 'bucket'),
    prefix,
    access_key_id: requiredText(o, 'access_key_id'),
    secret_access_key: requiredText(o, 'secret_access_key'),
  }
  return new S3ArtifactStore(deadline === null ? base : { ...base, expires_at: deadline })
}

function requireStore(handle: unknown, role: string): S3ArtifactStore {
  if (!isS3ArtifactStore(handle)) {
    throw invalidTarget(`${role} attend le magasin rendu par openS3ArtifactStore`, role)
  }
  return handle
}

/**
 * L'ÉCHÉANCE DE L'AUTORISATION (L277, cas A5).
 *
 * Le refus est posé AVANT tout appel au service : servir des octets sous une
 * autorisation périmée parce que le service, lui, n'en sait rien serait
 * exactement le repli silencieux que L277 interdit.
 */
function checkAuthorization(store: S3ArtifactStore, role: string): void {
  const deadline = store.expiresAt
  if (deadline === null) return
  const at = Date.parse(deadline)
  if (Number.isNaN(at)) {
    throw invalidTarget('l echeance de l autorisation n est pas un timestamp lisible', role)
  }
  if (at <= Date.now()) {
    throw new ArtifactRefusal(
      'ARTIFACT_AUTHORIZATION_EXPIRED',
      `l autorisation ouverte sur ce magasin a expire le ${deadline}`,
      role,
    )
  }
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

function checkPutOptions(options: unknown): S3ArtifactFault | null {
  if (options === undefined || options === null) return null
  const o = plainObject(options)
  if (o === null) {
    throw new ArtifactRefusal(
      'ARTIFACT_INPUT_INVALID',
      'les options d ecriture forment un objet plat { fault }',
      'putArtifact',
    )
  }
  for (const k of Object.keys(o)) {
    if (k !== 'fault') {
      throw new ArtifactRefusal(
        'ARTIFACT_INPUT_INVALID',
        `putArtifact n accepte pas la propriete « ${k} »`,
        'putArtifact',
      )
    }
  }
  const fault = o['fault']
  if (fault === undefined) return null
  if (fault !== 'INTERRUPT_BEFORE_PUBLISH' && fault !== 'INTERRUPT_DURING_UPLOAD') {
    throw new ArtifactRefusal(
      'ARTIFACT_INPUT_INVALID',
      'les seuls points d injection declares sont INTERRUPT_BEFORE_PUBLISH et ' +
        'INTERRUPT_DURING_UPLOAD',
      String(fault),
    )
  }
  return fault
}

/* ─────────────────────────── clés et disposition ───────────────────────── */

const objectsPrefix = (store: S3ArtifactStore): string =>
  `${store.prefix}/${OBJECTS_SEGMENT}/${ARTIFACT_DIGEST_ALGORITHM}`

const objectKey = (store: S3ArtifactStore, digest: string): string =>
  `${objectsPrefix(store)}/${digest}`

const manifestOf = (digest: string, size: number): ArtifactManifest => ({
  ref: artifactRef(digest),
  digest,
  size,
  algorithm: ARTIFACT_DIGEST_ALGORITHM,
})

/* ──────────────────────── traduction des refus du service ──────────────── */

/**
 * Les codes par lesquels un service objet dit « pas toi ». Ils deviennent un
 * refus d'ACCÈS, jamais un objet absent : confondre les deux ferait croire à
 * l'appelant que l'artefact n'existe pas, là où il ne fait que ne pas avoir le
 * droit de le voir.
 */
const DENIAL_CODES = new Set([
  'AccessDenied',
  'AllAccessDisabled',
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'NoSuchBucket',
  'AccountProblem',
  'Forbidden',
])

const MISSING_CODES = new Set(['NoSuchKey', 'NoSuchUpload', 'NotFound'])

/**
 * Un refus NOMMÉ à partir de la réponse du service.
 *
 * Ni le corps de la réponse, ni un message système ne traversent cette
 * fonction : seuls le statut et un `<Code>` assaini (src/s3-http.ts) entrent
 * dans le rapport. C'est ce qui rend « les erreurs ne publient aucun secret »
 * (L277) vrai par construction plutôt que par relecture.
 */
function refuse(response: S3Response, action: string, subject: string): never {
  if (response.unreachable || response.status === 0) {
    throw new ArtifactRefusal(
      'ARTIFACT_SERVICE_UNREACHABLE',
      `le service objet n a pas repondu lors de ${action}`,
      subject,
    )
  }
  const code = response.errorCode
  const observed = `statut ${String(response.status)}${code === '' ? '' : `, code ${code}`}`
  if (DENIAL_CODES.has(code) || response.status === 403 || response.status === 401) {
    throw new ArtifactRefusal(
      'ARTIFACT_ACCESS_DENIED',
      `le service objet a refuse l autorisation lors de ${action} (${observed})`,
      subject,
    )
  }
  if (MISSING_CODES.has(code) || response.status === 404) {
    throw new ArtifactRefusal(
      'ARTIFACT_MISSING',
      `aucun objet final ne porte cette reference sous ce magasin (${observed})`,
      subject,
    )
  }
  throw new ArtifactRefusal(
    'ARTIFACT_SERVICE_REFUSED',
    `le service objet a refuse ${action} (${observed})`,
    subject,
  )
}

/* ──────────────────────────── transferts multipart ─────────────────────── */

interface PartPlan {
  readonly number: number
  readonly start: number
  readonly end: number
}

function planParts(size: number): PartPlan[] {
  const parts: PartPlan[] = []
  let start = 0
  let number = 1
  do {
    const end = Math.min(start + PART_SIZE_BYTES, size)
    parts.push({ number, start, end })
    start = end
    number += 1
  } while (start < size)
  return parts
}

/** Les transferts PENDANTS sur exactement cette clé, du plus ancien au plus récent. */
async function pendingUploads(store: S3ArtifactStore, key: string): Promise<string[]> {
  const response = await s3Request(store.coordinates, store.credentials, {
    method: 'GET',
    query: { uploads: '', prefix: key },
  })
  if (response.status !== 200) {
    refuse(response, 'l inventaire des transferts en cours', key)
  }
  const out: string[] = []
  for (const block of xmlBlocks(response.text, 'Upload')) {
    if (xmlTag(block, 'Key') !== key) continue
    const id = xmlTag(block, 'UploadId')
    if (id !== '') out.push(id)
  }
  return out
}

async function initiateUpload(store: S3ArtifactStore, key: string): Promise<string> {
  const response = await s3Request(store.coordinates, store.credentials, {
    method: 'POST',
    key,
    query: { uploads: '' },
  })
  if (response.status !== 200) refuse(response, 'l ouverture d un transfert', key)
  const id = xmlTag(response.text, 'UploadId')
  if (id === '') {
    throw new ArtifactRefusal(
      'ARTIFACT_SERVICE_REFUSED',
      'le service objet n a pas nomme le transfert qu il vient d ouvrir',
      key,
    )
  }
  return id
}

interface ReceivedPart {
  readonly etag: string
  readonly size: number
}

/** Les parties DÉJÀ reçues par un transfert pendant : la moitié utile d'une reprise. */
async function receivedParts(
  store: S3ArtifactStore,
  key: string,
  uploadId: string,
): Promise<Map<number, ReceivedPart>> {
  const out = new Map<number, ReceivedPart>()
  const response = await s3Request(store.coordinates, store.credentials, {
    method: 'GET',
    key,
    query: { uploadId },
  })
  // Un transfert disparu n'est pas une panne : il n'y a simplement rien à
  // reprendre, et l'appelant réémettra toutes les parties.
  if (response.status !== 200) return out
  for (const block of xmlBlocks(response.text, 'Part')) {
    const number = Number(xmlTag(block, 'PartNumber'))
    const size = Number(xmlTag(block, 'Size'))
    const etag = xmlTag(block, 'ETag')
    if (Number.isInteger(number) && number > 0 && etag !== '') {
      out.set(number, { etag, size: Number.isFinite(size) ? size : -1 })
    }
  }
  return out
}

async function uploadPart(
  store: S3ArtifactStore,
  key: string,
  uploadId: string,
  part: PartPlan,
  payload: Uint8Array,
): Promise<string> {
  const response = await s3Request(store.coordinates, store.credentials, {
    method: 'PUT',
    key,
    query: { partNumber: String(part.number), uploadId },
    body: payload.subarray(part.start, part.end),
  })
  if (response.status !== 200) {
    refuse(response, `le transfert de la partie ${String(part.number)}`, key)
  }
  if (response.etag === '') {
    throw new ArtifactRefusal(
      'ARTIFACT_SERVICE_REFUSED',
      `le service objet n a pas accuse reception de la partie ${String(part.number)}`,
      key,
    )
  }
  return response.etag
}

async function completeUpload(
  store: S3ArtifactStore,
  key: string,
  uploadId: string,
  parts: ReadonlyArray<{ number: number; etag: string }>,
): Promise<void> {
  const xml =
    '<CompleteMultipartUpload>' +
    parts
      .map(
        (p) =>
          `<Part><PartNumber>${String(p.number)}</PartNumber><ETag>${p.etag}</ETag></Part>`,
      )
      .join('') +
    '</CompleteMultipartUpload>'
  const response = await s3Request(store.coordinates, store.credentials, {
    method: 'POST',
    key,
    query: { uploadId },
    body: Buffer.from(xml, 'utf8'),
  })
  // Un service S3 peut répondre 200 ET signaler l'échec dans le corps : le
  // statut seul ne suffit donc pas à conclure que l'objet est publié.
  if (response.status !== 200 || /<Error>/.test(response.text)) {
    refuse(response, 'la publication du transfert', key)
  }
}

/** Best effort : un transfert orphelin qu'on n'a pas pu annuler ne dément rien. */
async function abortUpload(
  store: S3ArtifactStore,
  key: string,
  uploadId: string,
): Promise<void> {
  await s3Request(store.coordinates, store.credentials, {
    method: 'DELETE',
    key,
    query: { uploadId },
  })
}

/* ────────────────────────────────── écriture ───────────────────────────── */

function interrupted(fault: S3ArtifactFault, ref: string): ArtifactRefusal {
  return new ArtifactRefusal(
    'ARTIFACT_WRITE_INTERRUPTED',
    fault === 'INTERRUPT_BEFORE_PUBLISH'
      ? 'ecriture interrompue au point d injection INTERRUPT_BEFORE_PUBLISH, ' +
        'apres transfert et avant publication'
      : 'transfert interrompu au point d injection INTERRUPT_DURING_UPLOAD, ' +
        'une partie transferee sur plusieurs',
    ref,
  )
}

/**
 * Transfère les octets et publie l'objet, ou s'arrête au point d'injection
 * demandé.
 *
 * REPRISE : un transfert pendant sur cette clé est REPRIS, jamais doublé. Les
 * parties déjà reçues sont relues et conservées ; seules les manquantes sont
 * réémises. Comme la clé est celle du contenu, les octets d'un transfert
 * pendant sont nécessairement les mêmes que ceux qu'on réémet.
 */
async function transferAndPublish(
  store: S3ArtifactStore,
  key: string,
  payload: Uint8Array,
  fault: S3ArtifactFault | null,
  ref: string,
): Promise<void> {
  const pending = await pendingUploads(store, key)
  const first = pending[0]

  // Le chemin court : rien en suspens, un objet qui tient dans une partie, et
  // aucune interruption demandée. Un PUT est atomique — c'est la publication.
  if (fault === null && first === undefined && payload.byteLength <= PART_SIZE_BYTES) {
    const response = await s3Request(store.coordinates, store.credentials, {
      method: 'PUT',
      key,
      body: payload,
    })
    if (response.status !== 200) refuse(response, 'la publication de l objet', key)
    return
  }

  const uploadId = first ?? (await initiateUpload(store, key))
  const already = first === undefined ? new Map<number, ReceivedPart>() : await receivedParts(store, key, uploadId)
  const plan = planParts(payload.byteLength)
  const done: Array<{ number: number; etag: string }> = []

  for (const part of plan) {
    const known = already.get(part.number)
    const expected = part.end - part.start
    const etag =
      known !== undefined && known.size === expected
        ? known.etag
        : await uploadPart(store, key, uploadId, part, payload)
    done.push({ number: part.number, etag })
    if (fault === 'INTERRUPT_DURING_UPLOAD') {
      // Le transfert reste PENDANT : c'est ce qui rend l'appel suivant une
      // reprise, et non un second transfert.
      throw interrupted(fault, ref)
    }
  }

  if (fault === 'INTERRUPT_BEFORE_PUBLISH') throw interrupted(fault, ref)

  await completeUpload(store, key, uploadId, done)

  // Un transfert concurrent laissé derrière la publication serait un transfert
  // ORPHELIN sous le préfixe — ce que A2 observe.
  for (const other of pending) {
    if (other !== uploadId) await abortUpload(store, key, other)
  }
}

/**
 * Écrit des octets bruts et rend le MANIFESTE DE CONTENU de L267.
 *
 * Un magasin IMMUABLE (L265) ne réécrit pas une adresse : si la clé du contenu
 * porte déjà un objet, l'écriture se contente de rendre le manifeste. Deux
 * écritures des mêmes octets — simultanées ou non — laissent donc UN objet.
 */
export async function putS3Artifact(
  handle: unknown,
  bytes: unknown,
  options?: unknown,
): Promise<ArtifactManifest> {
  const store = requireStore(handle, 'putArtifact')
  checkAuthorization(store, 'putArtifact')
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
  const manifest = manifestOf(digest, payload.byteLength)
  const key = objectKey(store, digest)

  if (fault === null) {
    const head = await s3Request(store.coordinates, store.credentials, { method: 'HEAD', key })
    if (head.status === 200) return manifest
    if (head.status !== 404) refuse(head, 'la lecture de l etat de l objet', key)
  }

  await transferAndPublish(store, key, payload, fault, manifest.ref)
  return manifest
}

/* ────────────────────────────────── lecture ────────────────────────────── */

/**
 * Relit les octets EXACTS d'une référence, ou refuse par un code nommé.
 *
 * « EMPREINTES VÉRIFIÉES AVANT USAGE » (L271) : les octets lus sont pesés
 * contre la référence qui les désigne. Une corruption d'un seul octet, à
 * longueur préservée, est donc refusée par `ARTIFACT_CORRUPT` — un contrôle de
 * taille ne la verrait pas.
 *
 * Aucune branche de refus ne rend d'octets. Rendre un tampon vide plutôt que
 * refuser est la permissivité que le contrat condamne : l'appelant ne pourrait
 * plus distinguer un objet vide d'un objet absent, ni d'un objet interdit.
 */
export async function getS3Artifact(handle: unknown, ref: unknown): Promise<Uint8Array> {
  const store = requireStore(handle, 'getArtifact')
  checkAuthorization(store, 'getArtifact')
  const digest = digestOfRef(ref, 'getArtifact')
  const key = objectKey(store, digest)
  const response = await s3Request(store.coordinates, store.credentials, { method: 'GET', key })
  if (response.status !== 200) refuse(response, 'la lecture de l objet', artifactRef(digest))
  const bytes = response.body
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

/* ────────────────────────────────── listage ────────────────────────────── */

/**
 * Ce que le magasin publie comme objets FINAUX (L269).
 *
 * Seules les clés d'objets publiés sont parcourues : un transfert resté en
 * suspens n'a jamais franchi sa publication, et le faire apparaître ici
 * reviendrait à appeler « objet final » quelque chose qui n'existe pas encore
 * pour le service.
 */
export async function listS3Artifacts(handle: unknown): Promise<readonly ArtifactManifest[]> {
  const store = requireStore(handle, 'listArtifacts')
  checkAuthorization(store, 'listArtifacts')
  const prefix = `${objectsPrefix(store)}/`
  const out: ArtifactManifest[] = []
  let cursor: string | null = null
  for (let page = 0; page < 1000; page += 1) {
    const query: Record<string, string> =
      cursor === null
        ? { 'list-type': '2', prefix, 'max-keys': '1000' }
        : { 'list-type': '2', prefix, 'max-keys': '1000', 'continuation-token': cursor }
    const response: S3Response = await s3Request(store.coordinates, store.credentials, {
      method: 'GET',
      query,
    })
    if (response.status !== 200) refuse(response, 'le listage des objets', prefix)
    for (const block of xmlBlocks(response.text, 'Contents')) {
      const key = xmlTag(block, 'Key')
      if (!key.startsWith(prefix)) continue
      const digest = key.slice(prefix.length)
      if (!HEX_64.test(digest)) continue
      const size = Number(xmlTag(block, 'Size'))
      out.push(manifestOf(digest, Number.isFinite(size) ? size : 0))
    }
    if (xmlTag(response.text, 'IsTruncated') !== 'true') break
    const next = xmlTag(response.text, 'NextContinuationToken')
    if (next === '') break
    cursor = next
  }
  out.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
  return out
}
