// ─────────────────────────────────────────────────────────────────────────────
// LE SERVICE S3 DE TEST LOCAL ET LES IDENTITÉS LIMITÉES PAR USAGE
// (tâche T14, cahier L275).
//
// L275 énumère TROIS livrables : « adaptateur S3, service S3 compatible pour
// les tests locaux et identités limitées par usage ». L'adaptateur est
// src/artifact-s3.ts ; les deux autres sont ici.
//
// ── POURQUOI CE FICHIER DÉCLARE UN SERVICE AU LIEU DE LE SUPPOSER ────────────
// Un magasin objet dont les coordonnées ne sont nulle part n'est pas un
// livrable OBSERVABLE : personne d'extérieur ne saurait où regarder pour
// vérifier que les octets sont bien allés dans un service réel. `serviceConfig`
// publie donc `endpoint`, `region`, `bucket` et de quoi signer — et rien
// d'autre. Elle ne DÉMARRE aucun serveur : un prérequis absent doit produire
// BLOCKED (L28), jamais un service improvisé qui ferait passer la tâche pour la
// mauvaise raison. Le cycle de vie du service appartient à `bench svc up`.
//
// ── POURQUOI LE CONTRÔLE D'ACCÈS EST POSÉ DANS LE SERVICE, ET NON ICI ────────
// L279 : « les préfixes ne sont pas, seuls, un mécanisme d'autorisation ; le
// contrôle doit être exercé par le stockage ou un service d'accès. » Une
// identité limitée par usage n'est donc PAS un objet JavaScript qui filtrerait
// les clés avant de signer : c'est une paire de clés RÉELLE, créée dans le
// service, dont les permissions sont posées dans le service. Un appelant qui
// signerait lui-même — c'est exactement ce que fait la suite d'acceptation —
// doit se heurter au même refus, hors de portée de toute vérification côté
// client. C'est la seule lecture de L279 qui résiste à un client hostile.
//
// ── LE MÉCANISME RETENU : UN SEAU PAR USAGE ─────────────────────────────────
// Le service de test du socle (Garage, ADR-003) attribue ses permissions par
// COUPLE (seau, clé) ; il n'offre pas de condition sur préfixe. Le mécanisme
// que L279 laisse au choix de l'implémentation est donc ici le SEAU DISTINCT :
//   usage « evaluation » → seau `<base>-usage-evaluation`, clé propre
//   usage « candidate »  → seau `<base>-usage-candidate`,  clé propre
// Une identité n'a de droits que sur le seau de SON usage. Le préfixe demandé
// est conservé tel quel et rendu à l'appelant : il isole les exécutions (L559),
// il n'autorise rien.
//
// ── DÉCOUVERTE, EN TROIS COUCHES, ET UN REFUS QUI NOMME CE QUI MANQUE ────────
//   1. l'environnement, quand il porte les cinq coordonnées — c'est ce qui
//      permet de brancher la tâche sur un autre service compatible ;
//   2. la configuration du service local (`garage.toml` sous `BENCH_HOME`) et
//      son API d'administration, qui sait créer seau et clé au besoin ;
//   3. à défaut d'API d'administration, le fichier d'identifiants que le
//      provisionnement a laissé.
// Si aucune couche ne répond, la fonction REFUSE en nommant ce qui manque. Elle
// ne rend jamais des coordonnées inventées : un service de test qui n'existe
// pas doit se voir, pas se deviner.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ArtifactRefusal } from './artifact-errors.js'
import type { S3Credentials } from './s3-http.js'

/** Les coordonnées du SERVICE S3 COMPATIBLE POUR LES TESTS LOCAUX (L275). */
export interface S3TestServiceConfig {
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
  readonly access_key_id: string
  readonly secret_access_key: string
}

/** La demande d'une IDENTITÉ LIMITÉE PAR USAGE (L275). */
export interface ScopedIdentityRequest {
  readonly usage: string
  readonly prefix: string
}

/**
 * Ce qu'une identité limitée par usage publie : de quoi SIGNER, et les
 * coordonnées sous lesquelles elle est valide.
 */
export interface ScopedIdentity {
  readonly access_key_id: string
  readonly secret_access_key: string
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
  readonly prefix: string
}

const DEFAULT_BUCKET = 'bench'
const DEFAULT_KEY_NAME = 'bench-key'
const ADMIN_TIMEOUT_MS = 30_000

/* ────────────────────────── localisation du socle ───────────────────────── */

function repoRoot(): string {
  let dir: string
  try {
    dir = path.dirname(fileURLToPath(import.meta.url))
  } catch {
    dir = process.cwd()
  }
  for (let i = 0; i < 12; i += 1) {
    if (
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(dir, '.git'))
    ) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

/** Même défaut que `infra/bootstrap/lib.sh` et `tools/svc.mjs`. */
function benchHome(): string {
  const declared = process.env['BENCH_HOME']
  return declared !== undefined && declared !== '' ? declared : path.join(repoRoot(), '.bench/home')
}

/* ──────────────────── lecture de la configuration du service ────────────── */

interface LocalService {
  readonly endpoint: string
  readonly region: string
  readonly adminBase: string
  readonly adminToken: string
  readonly credentialsFile: string
}

/**
 * Lecture ciblée de la configuration du service local : trois clés dans deux
 * sections. Ce n'est pas un analyseur TOML général — il n'y en a pas besoin, et
 * un analyseur complet serait une dépendance de plus pour lire quatre lignes.
 */
function readLocalService(): LocalService | null {
  const file = path.join(benchHome(), 'garage/garage.toml')
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let section = ''
  const values = new Map<string, string>()
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    const header = /^\[([^\]]+)\]$/.exec(trimmed)
    if (header !== null) {
      section = header[1] ?? ''
      continue
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/.exec(trimmed)
    if (pair === null) continue
    values.set(`${section}.${pair[1] ?? ''}`, pair[2] ?? '')
  }
  const api = values.get('s3_api.api_bind_addr')
  const region = values.get('s3_api.s3_region')
  const adminAddr = values.get('admin.api_bind_addr')
  const adminToken = values.get('admin.admin_token')
  if (api === undefined || region === undefined) return null
  return {
    endpoint: `http://${api}`,
    region,
    adminBase: adminAddr === undefined ? '' : `http://${adminAddr}`,
    adminToken: adminToken ?? '',
    credentialsFile: path.join(benchHome(), 'garage/credentials.txt'),
  }
}

/** Les identifiants que le provisionnement a laissés, quand l'API est muette. */
function readCredentialsFile(file: string): S3Credentials | null {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const id = /Key ID:\s*(\S+)/.exec(raw)
  const secret = /Secret key:\s*(\S+)/.exec(raw)
  if (id === null || secret === null) return null
  return { access_key_id: id[1] ?? '', secret_access_key: secret[1] ?? '' }
}

/* ───────────────────── API d'administration du service ──────────────────── */

interface AdminReply {
  readonly status: number
  readonly json: unknown
}

function adminRequest(
  service: LocalService,
  method: 'GET' | 'POST',
  route: string,
  body?: unknown,
): Promise<AdminReply> {
  return new Promise((resolve) => {
    let u: URL
    try {
      u = new URL(`${service.adminBase}${route}`)
    } catch {
      resolve({ status: 0, json: null })
      return
    }
    const payload = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), 'utf8')
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port === '' ? undefined : Number(u.port),
        path: `${u.pathname}${u.search}`,
        method,
        headers: {
          authorization: `Bearer ${service.adminToken}`,
          'content-type': 'application/json',
          'content-length': String(payload.length),
        },
      },
      (rep) => {
        const chunks: Buffer[] = []
        rep.on('data', (c: Buffer) => chunks.push(c))
        rep.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json: unknown = null
          try {
            json = JSON.parse(text)
          } catch {
            json = null
          }
          resolve({ status: rep.statusCode ?? 0, json })
        })
      },
    )
    req.setTimeout(ADMIN_TIMEOUT_MS, () => {
      req.destroy()
    })
    // Aucun message système ne remonte : voir le bandeau de src/s3-http.ts.
    req.on('error', () => {
      resolve({ status: 0, json: null })
    })
    if (payload.length > 0) req.write(payload)
    req.end()
  })
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const asText = (v: unknown): string => (typeof v === 'string' ? v : '')

function undeclared(detail: string, subject: string): ArtifactRefusal {
  return new ArtifactRefusal('ARTIFACT_S3_SERVICE_UNDECLARED', detail, subject)
}

/**
 * La clé nommée, créée si elle n'existe pas.
 *
 * Le service de test accepte DEUX clés du même nom, et sa recherche par nom
 * échoue alors (« 2 matching keys »). On énumère donc, on choisit par
 * identifiant — ordre total, donc décision stable d'une exécution à l'autre —
 * et on ne crée que lorsque le nom est réellement absent. Sans cette
 * précaution, une identité limitée changerait d'identifiants à chaque appel et
 * le service accumulerait des clés orphelines.
 */
async function ensureKey(service: LocalService, name: string): Promise<S3Credentials> {
  const listed = await adminRequest(service, 'GET', '/v2/ListKeys')
  if (listed.status !== 200 || !Array.isArray(listed.json)) {
    throw undeclared(
      `l API d administration du service n a pas enumere ses cles (statut ${String(listed.status)})`,
      name,
    )
  }
  const matching = (listed.json as unknown[])
    .map((k) => asRecord(k))
    .filter((k): k is Record<string, unknown> => k !== null && asText(k['name']) === name)
    .map((k) => asText(k['id']))
    .filter((id) => id !== '')
    .sort()
  const chosen = matching[0]
  if (chosen !== undefined) {
    const info = await adminRequest(
      service,
      'GET',
      `/v2/GetKeyInfo?id=${encodeURIComponent(chosen)}&showSecretKey=true`,
    )
    const record = asRecord(info.json)
    const secret = record === null ? '' : asText(record['secretAccessKey'])
    if (info.status === 200 && secret !== '') {
      return { access_key_id: chosen, secret_access_key: secret }
    }
    throw undeclared(
      `le secret de la cle ${name} n est pas lisible par l API d administration ` +
        `(statut ${String(info.status)})`,
      name,
    )
  }
  const created = await adminRequest(service, 'POST', '/v2/CreateKey', { name })
  const record = asRecord(created.json)
  const id = record === null ? '' : asText(record['accessKeyId'])
  const secret = record === null ? '' : asText(record['secretAccessKey'])
  if (created.status !== 200 || id === '' || secret === '') {
    throw undeclared(
      `l API d administration a refuse de creer la cle (statut ${String(created.status)})`,
      name,
    )
  }
  return { access_key_id: id, secret_access_key: secret }
}

/** Le seau nommé, créé s'il n'existe pas. Rend son identifiant interne. */
async function ensureBucket(service: LocalService, alias: string): Promise<string> {
  const info = await adminRequest(
    service,
    'GET',
    `/v2/GetBucketInfo?globalAlias=${encodeURIComponent(alias)}`,
  )
  const existing = asRecord(info.json)
  if (info.status === 200 && existing !== null && asText(existing['id']) !== '') {
    return asText(existing['id'])
  }
  const created = await adminRequest(service, 'POST', '/v2/CreateBucket', { globalAlias: alias })
  const record = asRecord(created.json)
  if (created.status === 200 && record !== null && asText(record['id']) !== '') {
    return asText(record['id'])
  }
  // Course avec une création concurrente : le seau existe désormais.
  const again = await adminRequest(
    service,
    'GET',
    `/v2/GetBucketInfo?globalAlias=${encodeURIComponent(alias)}`,
  )
  const retried = asRecord(again.json)
  if (again.status === 200 && retried !== null && asText(retried['id']) !== '') {
    return asText(retried['id'])
  }
  throw undeclared(
    `l API d administration a refuse de creer le seau (statut ${String(created.status)})`,
    alias,
  )
}

/** Pose les permissions DANS le service : c'est ce que L279 exige. */
async function allowKeyOnBucket(
  service: LocalService,
  bucketId: string,
  accessKeyId: string,
  owner: boolean,
): Promise<void> {
  const reply = await adminRequest(service, 'POST', '/v2/AllowBucketKey', {
    bucketId,
    accessKeyId,
    permissions: { read: true, write: true, owner },
  })
  if (reply.status !== 200) {
    throw undeclared(
      `l API d administration a refuse d autoriser la cle sur le seau ` +
        `(statut ${String(reply.status)})`,
      bucketId,
    )
  }
}

/* ─────────────────────────── coordonnées du service ─────────────────────── */

const env = (name: string): string | null => {
  const v = process.env[name]
  return v === undefined || v === '' ? null : v
}

let CONFIG: Promise<S3TestServiceConfig> | null = null

async function resolveConfig(): Promise<S3TestServiceConfig> {
  // (1) L'environnement, quand il porte les CINQ coordonnées.
  const fromEnv = {
    endpoint: env('S3_ENDPOINT'),
    region: env('S3_REGION') ?? env('AWS_REGION'),
    bucket: env('S3_BUCKET'),
    access_key_id: env('S3_ACCESS_KEY_ID') ?? env('AWS_ACCESS_KEY_ID'),
    secret_access_key: env('S3_SECRET_ACCESS_KEY') ?? env('AWS_SECRET_ACCESS_KEY'),
  }
  if (
    fromEnv.endpoint !== null &&
    fromEnv.region !== null &&
    fromEnv.bucket !== null &&
    fromEnv.access_key_id !== null &&
    fromEnv.secret_access_key !== null
  ) {
    return {
      endpoint: fromEnv.endpoint,
      region: fromEnv.region,
      bucket: fromEnv.bucket,
      access_key_id: fromEnv.access_key_id,
      secret_access_key: fromEnv.secret_access_key,
    }
  }

  const service = readLocalService()
  if (service === null) {
    throw undeclared(
      'aucun service S3 de test declare : ni les cinq variables d environnement ' +
        '(S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY), ' +
        'ni la configuration du service local sous BENCH_HOME',
      's3TestServiceConfig',
    )
  }
  const endpoint = fromEnv.endpoint ?? service.endpoint
  const region = fromEnv.region ?? service.region
  const bucket = fromEnv.bucket ?? DEFAULT_BUCKET

  // (2) L'API d'administration : elle sait créer ce qui manque.
  if (service.adminBase !== '' && service.adminToken !== '') {
    const creds = await ensureKey(service, env('S3_TEST_KEY_NAME') ?? DEFAULT_KEY_NAME)
    const bucketId = await ensureBucket(service, bucket)
    await allowKeyOnBucket(service, bucketId, creds.access_key_id, true)
    return {
      endpoint,
      region,
      bucket,
      access_key_id: creds.access_key_id,
      secret_access_key: creds.secret_access_key,
    }
  }

  // (3) Les identifiants laissés par le provisionnement.
  const fromFile = readCredentialsFile(service.credentialsFile)
  if (fromFile !== null) {
    return {
      endpoint,
      region,
      bucket,
      access_key_id: fromFile.access_key_id,
      secret_access_key: fromFile.secret_access_key,
    }
  }
  throw undeclared(
    'le service S3 local est configure mais aucune identite n est lisible : ' +
      'ni API d administration, ni fichier d identifiants',
    service.endpoint,
  )
}

/**
 * Les coordonnées du service S3 de test local (L275).
 *
 * Le résultat est mémorisé : la découverte peut créer seau et clé, et la
 * refaire à chaque appel multiplierait les appels d'administration sans rien
 * changer. Un échec n'est PAS mémorisé — un service démarré entre deux appels
 * doit pouvoir être vu.
 */
export function s3TestServiceConfig(): Promise<S3TestServiceConfig> {
  if (CONFIG === null) {
    CONFIG = resolveConfig().catch((e: unknown) => {
      CONFIG = null
      throw e
    })
  }
  return CONFIG
}

/* ─────────────────────── identités limitées par usage ───────────────────── */

function plainObject(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

/** L80 : « les JSON de domaine sont stricts : propriétés inconnues rejetées ». */
function checkIdentityRequest(request: unknown): ScopedIdentityRequest {
  const o = plainObject(request)
  if (o === null) {
    throw new ArtifactRefusal(
      'ARTIFACT_INPUT_INVALID',
      'createScopedIdentity attend un objet plat { usage, prefix }',
      'createScopedIdentity',
    )
  }
  for (const k of Object.keys(o)) {
    if (k !== 'usage' && k !== 'prefix') {
      throw new ArtifactRefusal(
        'ARTIFACT_INPUT_INVALID',
        `createScopedIdentity n accepte pas la propriete « ${k} »`,
        'createScopedIdentity',
      )
    }
  }
  const usage = o['usage']
  const prefix = o['prefix']
  if (typeof usage !== 'string' || usage.trim().length === 0) {
    throw new ArtifactRefusal(
      'ARTIFACT_INPUT_INVALID',
      'l usage d une identite limitee est une chaine non vide',
      'createScopedIdentity',
    )
  }
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new ArtifactRefusal(
      'ARTIFACT_INPUT_INVALID',
      'le prefixe d artefacts est une chaine non vide',
      'createScopedIdentity',
    )
  }
  return { usage, prefix }
}

/**
 * Le nom du seau et de la clé d'un usage. Le service impose des noms de seau
 * en minuscules, bornés : l'usage est donc réduit à sa forme sûre, et tronqué.
 */
function usageSlug(usage: string): string {
  const slug = usage
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return slug === '' ? 'usage' : slug
}

const IDENTITIES = new Map<string, Promise<Omit<ScopedIdentity, 'prefix'>>>()

async function provisionIdentity(
  base: S3TestServiceConfig,
  slug: string,
): Promise<Omit<ScopedIdentity, 'prefix'>> {
  const service = readLocalService()
  if (service === null || service.adminBase === '' || service.adminToken === '') {
    throw undeclared(
      'aucune API d administration n est declaree : une identite limitee par usage exige ' +
        'que ses permissions soient posees DANS le service (L279), jamais cote client',
      slug,
    )
  }
  const name = `${base.bucket}-usage-${slug}`.slice(0, 63)
  const creds = await ensureKey(service, name)
  const bucketId = await ensureBucket(service, name)
  // L'identité limitée n'est PAS propriétaire : elle lit et écrit son seau,
  // rien de plus. Le compte du socle le reste, pour que l'exploitant puisse
  // inspecter et nettoyer ce que les exécutions y déposent (L519).
  await allowKeyOnBucket(service, bucketId, creds.access_key_id, false)
  await allowKeyOnBucket(service, bucketId, base.access_key_id, true)
  return {
    access_key_id: creds.access_key_id,
    secret_access_key: creds.secret_access_key,
    endpoint: base.endpoint,
    region: base.region,
    bucket: name,
  }
}

/**
 * Émet une IDENTITÉ LIMITÉE PAR USAGE (L275).
 *
 * Deux usages distincts reçoivent deux identités distinctes, chacune limitée à
 * son propre seau PAR LE SERVICE. Deux demandes du même usage reçoivent la même
 * identité : c'est l'usage qui limite, pas la demande — et fabriquer une paire
 * de clés par appel accumulerait des identifiants que personne ne révoque.
 *
 * Le `prefix` demandé est rendu tel quel : il isole les exécutions (L559) et
 * n'autorise rien (L279).
 */
export async function createScopedIdentity(request: unknown): Promise<ScopedIdentity> {
  const { usage, prefix } = checkIdentityRequest(request)
  const base = await s3TestServiceConfig()
  const slug = usageSlug(usage)
  let pending = IDENTITIES.get(slug)
  if (pending === undefined) {
    pending = provisionIdentity(base, slug).catch((e: unknown) => {
      IDENTITIES.delete(slug)
      throw e
    })
    IDENTITIES.set(slug, pending)
  }
  const identity = await pending
  return { ...identity, prefix }
}
