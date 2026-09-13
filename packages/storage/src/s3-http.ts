// ─────────────────────────────────────────────────────────────────────────────
// LE CLIENT S3 DE L'ADAPTATEUR (tâche T14, cahier L273-L279).
//
// CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS. Il parle le PROTOCOLE S3 —
// signature AWS SigV4, requêtes `node:http`, lecture des documents XML que le
// service renvoie — et rien d'autre. Aucune règle d'artefact n'est écrite ici :
// ni empreinte vérifiée, ni référence de contenu, ni échéance d'autorisation.
// Ces règles vivent dans src/artifact-s3.ts, qui est l'adaptateur du port.
//
// AUCUNE DÉPENDANCE AJOUTÉE. Le SDK AWS pèserait plusieurs dizaines de
// mégaoctets et entrerait dans l'`input_digest` de 44 tâches pour six cas
// d'acceptation ; SigV4 tient en trente lignes de `node:crypto`, et le dépôt
// épingle déjà ses versions exactes (package.json). Un client écrit ici est
// aussi ce qui rend l'adressage par CHEMIN (`/seau/clé`) possible sans
// configuration : le service de test local ne résout aucun sous-domaine.
//
// ── POURQUOI LE CORPS D'UNE RÉPONSE D'ERREUR NE REMONTE JAMAIS TEL QUEL ──────
// L277 : « les erreurs ne publient aucun secret dans les rapports ». Un corps
// d'erreur S3 est du XML fabriqué par le service, et rien ne garantit qu'il ne
// recopie pas la requête qui l'a provoqué — donc, potentiellement, une chaîne
// d'autorisation. Ce fichier n'expose donc aux couches supérieures que :
//   · le STATUT HTTP (un entier),
//   · le `<Code>` de l'erreur, ASSAINI au jeu [A-Za-z0-9_] et borné.
// Le corps complet reste disponible pour l'analyse des réponses de SUCCÈS
// (listages), qui ne sont pas des rapports d'erreur.
//
// ── POURQUOI UNE PANNE DE TRANSPORT NE PORTE PAS SON MESSAGE SYSTÈME ─────────
// `ECONNREFUSED` dans un message de refus ferait passer une règle appliquée
// pour un plantage : la suite d'acceptation distingue explicitement les deux
// (MARQUEURS_DE_PLANTAGE), et elle a raison de le faire. Une panne de transport
// devient donc un statut 0 accompagné d'un drapeau, jamais d'un code errno.
// ─────────────────────────────────────────────────────────────────────────────

import * as http from 'node:http'
import * as https from 'node:https'
import { createHmac } from 'node:crypto'
import { sha256Hex } from '@bench/contracts'

/** De quoi SIGNER : c'est ce qui fait d'un descripteur une identité (L275). */
export interface S3Credentials {
  readonly access_key_id: string
  readonly secret_access_key: string
}

/** Où parler : le service, sa région de signature, et le seau visé. */
export interface S3Coordinates {
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
}

export type S3Method = 'GET' | 'PUT' | 'POST' | 'HEAD' | 'DELETE'

export interface S3Call {
  readonly method: S3Method
  /** Clé d'objet ; vide pour une opération de seau (listage). */
  readonly key?: string
  readonly query?: Readonly<Record<string, string>>
  readonly body?: Uint8Array
}

export interface S3Response {
  /** Statut HTTP, ou 0 quand aucune réponse n'a été obtenue. */
  readonly status: number
  readonly body: Buffer
  /** Corps décodé en UTF-8 — utilisable pour les réponses de SUCCÈS. */
  readonly text: string
  /** ETag renvoyé par le service, guillemets compris, ou chaîne vide. */
  readonly etag: string
  /** `<Code>` de l'erreur S3, assaini ; chaîne vide si la réponse n'en porte pas. */
  readonly errorCode: string
  /** Vraie quand le service n'a pas répondu du tout (panne de transport). */
  readonly unreachable: boolean
}

/** Délai de garde d'une requête. Un transfert de partie de 5 Mio est local. */
const REQUEST_TIMEOUT_MS = 120_000

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest()

const hex = (bytes: Uint8Array): string => sha256Hex(bytes)

const hexText = (s: string): string => sha256Hex(Buffer.from(s, 'utf8'))

/** Encodage RFC 3986, celui que SigV4 exige (et qui diffère de `encodeURIComponent`). */
const encRfc3986 = (s: string): string =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )

/** Un chemin d'objet est une suite de segments encodés : les `/` sont conservés. */
const encPath = (p: string): string => p.split('/').map(encRfc3986).join('/')

function stamps(now: Date): { amz: string; day: string } {
  const amz = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { amz, day: amz.slice(0, 8) }
}

function signingKey(secret: string, day: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request')
}

/* ─────────────────────────── assainissement des rapports ────────────────── */

const SAFE_CODE = /[^A-Za-z0-9_]/g

/**
 * Le `<Code>` d'une erreur S3, ASSAINI. Tout ce qui n'est pas alphanumérique
 * disparaît, et la longueur est bornée : un code est une étiquette de
 * protocole, jamais un canal par lequel un secret pourrait remonter.
 */
export function s3ErrorCode(text: string): string {
  const m = /<Code>([\s\S]{0,120}?)<\/Code>/.exec(text)
  if (m === null) return ''
  return (m[1] ?? '').replace(SAFE_CODE, '').slice(0, 64)
}

/* ─────────────────────────────── lecture du XML ─────────────────────────── */

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

/** Toutes les valeurs d'une balise, dans l'ordre du document. */
export function xmlTags(xml: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g')
  let m = re.exec(xml)
  while (m !== null) {
    out.push(decodeXml(m[1] ?? ''))
    m = re.exec(xml)
  }
  return out
}

/** La première valeur d'une balise, ou la chaîne vide. */
export const xmlTag = (xml: string, name: string): string => xmlTags(xml, name)[0] ?? ''

/** Les blocs `<name>…</name>`, non décodés : on y relit des balises internes. */
export function xmlBlocks(xml: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g')
  let m = re.exec(xml)
  while (m !== null) {
    out.push(m[1] ?? '')
    m = re.exec(xml)
  }
  return out
}

/* ────────────────────────────────── transport ───────────────────────────── */

interface RawRequest {
  readonly url: string
  readonly method: S3Method
  readonly headers: Record<string, string>
  readonly body: Buffer
}

function perform(req: RawRequest): Promise<S3Response> {
  return new Promise((resolve) => {
    let u: URL
    try {
      u = new URL(req.url)
    } catch {
      resolve({
        status: 0,
        body: Buffer.alloc(0),
        text: '',
        etag: '',
        errorCode: '',
        unreachable: true,
      })
      return
    }
    const transport = u.protocol === 'https:' ? https : http
    const r = transport.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port === '' ? undefined : Number(u.port),
        path: `${u.pathname}${u.search}`,
        method: req.method,
        headers: { ...req.headers, 'content-length': String(req.body.length) },
      },
      (rep) => {
        const chunks: Buffer[] = []
        rep.on('data', (c: Buffer) => chunks.push(c))
        rep.on('end', () => {
          const body = Buffer.concat(chunks)
          const text = body.toString('utf8')
          const etag = rep.headers.etag
          resolve({
            status: rep.statusCode ?? 0,
            body,
            text,
            etag: typeof etag === 'string' ? etag : '',
            errorCode: s3ErrorCode(text),
            unreachable: false,
          })
        })
      },
    )
    r.setTimeout(REQUEST_TIMEOUT_MS, () => {
      r.destroy()
    })
    // Le message système de l'erreur est DÉLIBÉRÉMENT abandonné : voir le
    // bandeau. Un `ECONNREFUSED` remonté dans un refus ferait passer une panne
    // pour une règle appliquée, et réciproquement.
    r.on('error', () => {
      resolve({
        status: 0,
        body: Buffer.alloc(0),
        text: '',
        etag: '',
        errorCode: '',
        unreachable: true,
      })
    })
    if (req.body.length > 0) r.write(req.body)
    r.end()
  })
}

/* ──────────────────────────────── signature SigV4 ───────────────────────── */

/**
 * Signe et exécute un appel S3, en adressage PAR CHEMIN (`/seau/clé`).
 *
 * Les trois en-têtes signés sont `host`, `x-amz-content-sha256` et
 * `x-amz-date` : le strict nécessaire. Signer `content-length` obligerait
 * chaque appelant à le fixer avant nous et n'ajouterait aucune garantie que
 * l'empreinte du corps ne donne déjà.
 */
export async function s3Request(
  coords: S3Coordinates,
  creds: S3Credentials,
  call: S3Call,
): Promise<S3Response> {
  let origin: string
  let host: string
  try {
    const u = new URL(coords.endpoint)
    origin = u.origin
    host = u.port === '' ? u.hostname : `${u.hostname}:${u.port}`
  } catch {
    return {
      status: 0,
      body: Buffer.alloc(0),
      text: '',
      etag: '',
      errorCode: '',
      unreachable: true,
    }
  }
  const body = Buffer.from(call.body ?? new Uint8Array(0))
  const key = call.key ?? ''
  const query = call.query ?? {}
  const { amz, day } = stamps(new Date())
  const canonicalPath = `/${encPath(coords.bucket)}${key === '' ? '' : `/${encPath(key)}`}`
  const payloadHash = hex(body)
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encRfc3986(k)}=${encRfc3986(query[k] ?? '')}`)
    .join('&')
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amz,
  }
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonicalHeaders = names.map((n) => `${n}:${(headers[n] ?? '').trim()}\n`).join('')
  const canonicalRequest = [
    call.method,
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${day}/${coords.region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, hexText(canonicalRequest)].join('\n')
  const signature = createHmac(
    'sha256',
    signingKey(creds.secret_access_key, day, coords.region),
  )
    .update(toSign, 'utf8')
    .digest('hex')
  return perform({
    url: `${origin}${canonicalPath}${canonicalQuery === '' ? '' : `?${canonicalQuery}`}`,
    method: call.method,
    headers: {
      ...headers,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${creds.access_key_id}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  })
}
