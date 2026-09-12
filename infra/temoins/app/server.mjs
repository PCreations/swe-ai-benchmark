// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins/app/server.mjs — LE TÉMOIN, comme PROGRAMME.
//
// Cahier L231 : « les témoins sont des programmes de test du moteur ». Ce
// fichier est lancé dans un PROCESSUS SÉPARÉ, une fois par (fixture, version,
// base). Il n'est jamais importé par la suite d'acceptation : celle-ci ne le
// connaît que par son contrat HTTP public et par la base PostgreSQL qu'il écrit.
//
// CE QUE LA SÉPARATION DE PROCESSUS PROUVE. T09.A1 arrête le témoin entre
// chaque période et redémarre la version suivante sur la MÊME base. Si l'état
// métier vivait en mémoire, il ne survivrait pas à cet arrêt. Le seul endroit
// où il peut survivre est la base applicative — ce qu'exige « des tests sur
// PostgreSQL RÉEL » (cahier L235).
//
// PROTOCOLE DE DÉMARRAGE. argv[2] porte la configuration JSON. Le serveur écoute
// sur 127.0.0.1:0 (port attribué par le noyau, donc pas de collision entre les
// témoins simultanés), puis écrit sur stdout UNE ligne :
//     BENCH_TEMOIN_READY {"baseUrl":"http://127.0.0.1:<port>", …}
// C'est le seul signal de disponibilité ; le parent ne devine rien.
//
// PROTOCOLE D'ARRÊT. SIGTERM ferme l'écoute, attend les appels psql en vol, puis
// sort. L'attente n'est pas de la politesse : une connexion `psql` survivante
// ferait échouer le `CREATE DATABASE … TEMPLATE` par lequel T09.A1 fabrique les
// clones jetables des probes de frontière P3.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { appelsEnVol } from './psql.mjs'
import { operation } from './psql.mjs'
import { migrer, VERSION_MAX } from './migrations.mjs'
import { OPERATIONS } from './operations.mjs'

const CONFIG = JSON.parse(process.argv[2] ?? '{}')
const VERSION = Number(CONFIG.version)
const DSN = String(CONFIG.dsn)
const FAUTES = CONFIG.faults ?? {}

/** Les routes du contrat HTTP public. Le nom de la route est libre (la suite
 *  d'acceptation les accepte déclarées ou conventionnelles) ; l'OPÉRATION, non. */
export const ROUTES = {
  'POST /slots': 'declare_slot',
  'POST /reservations': 'reserve',
  'POST /cancellations': 'cancel',
  'GET /export': 'export',
  'POST /import': 'import',
}

/** Les champs acceptés par opération. Cahier L80 : propriétés inconnues
 *  REJETÉES — un champ ignoré silencieusement est un contrat qui ment. */
const CHAMPS = {
  declare_slot: { requis: ['tenant', 'slot', 'capacity', 'starts_at'], optionnels: [] },
  reserve: {
    requis: ['tenant', 'actor', 'slot', 'at', 'sequence', 'idempotency_key'],
    optionnels: [],
  },
  cancel: {
    requis: ['tenant', 'actor', 'slot', 'at', 'sequence', 'idempotency_key'],
    optionnels: [],
  },
}

const canonique = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`)
    .join(',')}}`
}

/** L'empreinte d'entrée de l'invariant D-6, hors clé d'opération elle-même. */
function empreinteEntree(corps) {
  const sans = { ...corps }
  delete sans.idempotency_key
  return createHash('sha256').update(canonique(sans)).digest('hex')
}

function valider(op, corps) {
  const regle = CHAMPS[op]
  if (regle === undefined) return null
  if (corps === null || typeof corps !== 'object' || Array.isArray(corps)) {
    return { ok: false, code: 'INVALID_BODY' }
  }
  const connus = new Set([...regle.requis, ...regle.optionnels])
  const inconnus = Object.keys(corps).filter((k) => !connus.has(k))
  if (inconnus.length > 0) return { ok: false, code: 'UNKNOWN_FIELDS', fields: inconnus }
  const manquants = regle.requis.filter((k) => corps[k] === undefined || corps[k] === null)
  if (manquants.length > 0) return { ok: false, code: 'MISSING_FIELDS', fields: manquants }
  return null
}

async function traiter(op, corps, requete) {
  const refus = valider(op, corps)
  if (refus !== null) return { http: 400, body: refus }
  const generateur = OPERATIONS[op]
  const params =
    op === 'export'
      ? { tenant: requete.tenant, actor: requete.actor }
      : op === 'import'
        ? { tenant: requete.tenant ?? corps?.tenant ?? null, document: corps }
        : { ...corps, input_digest: empreinteEntree(corps) }
  return operation(DSN, generateur(VERSION, FAUTES), params)
}

function lireCorps(req) {
  return new Promise((resolve) => {
    const morceaux = []
    req.on('data', (c) => morceaux.push(c))
    req.on('error', () => resolve({ ok: false, valeur: null }))
    req.on('end', () => {
      const texte = Buffer.concat(morceaux).toString('utf8')
      if (texte.length === 0) return resolve({ ok: true, valeur: null })
      try {
        resolve({ ok: true, valeur: JSON.parse(texte) })
      } catch {
        resolve({ ok: false, valeur: null })
      }
    })
  })
}

const repondre = (res, http, body) => {
  const texte = JSON.stringify(body)
  res.writeHead(http, { 'content-type': 'application/json; charset=utf-8' })
  res.end(texte)
}

const serveur = createServer((req, res) => {
  void (async () => {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1')
    } catch {
      return repondre(res, 400, { ok: false, code: 'INVALID_URL' })
    }
    const cle = `${String(req.method).toUpperCase()} ${url.pathname.replace(/\/+$/, '') || '/'}`
    if (cle === 'GET /healthz' || cle === 'GET /') {
      return repondre(res, 200, {
        ok: true,
        witness: CONFIG.witness,
        version: VERSION,
        routes: ROUTES,
      })
    }
    const op = ROUTES[cle]
    if (op === undefined) return repondre(res, 404, { ok: false, code: 'NO_SUCH_ROUTE', route: cle })
    const corps = await lireCorps(req)
    if (!corps.ok) return repondre(res, 400, { ok: false, code: 'INVALID_JSON' })
    try {
      const r = await traiter(op, corps.valeur, {
        tenant: url.searchParams.get('tenant'),
        actor: url.searchParams.get('actor'),
      })
      return repondre(res, r.http, r.body)
    } catch (e) {
      return repondre(res, 500, { ok: false, code: 'WITNESS_FAILURE', detail: String(e?.message ?? e) })
    }
  })()
})

/* ────────────────────────────────────────────────────── démarrage ────── */

async function demarrer() {
  if (!Number.isInteger(VERSION) || VERSION < 1 || VERSION > VERSION_MAX) {
    process.stderr.write(`BENCH_TEMOIN_ERREUR version invalide : ${String(CONFIG.version)}\n`)
    process.exit(2)
  }
  const m = await migrer(DSN, VERSION)
  if (!m.ok) {
    process.stderr.write(`BENCH_TEMOIN_ERREUR migration ${m.erreur}\n`)
    process.exit(3)
  }
  serveur.listen(0, '127.0.0.1', () => {
    const adresse = serveur.address()
    process.stdout.write(
      `BENCH_TEMOIN_READY ${JSON.stringify({
        baseUrl: `http://127.0.0.1:${String(adresse.port)}`,
        witness: CONFIG.witness,
        version: VERSION,
        schema_from: m.de,
        schema_to: m.a,
        migrations_applied: m.paliers,
        routes: ROUTES,
      })}\n`,
    )
  })
}

async function arreter() {
  serveur.close()
  for (let i = 0; i < 600 && appelsEnVol() > 0; i += 1) {
    await new Promise((r) => setTimeout(r, 50))
  }
  process.exit(0)
}

process.on('SIGTERM', () => void arreter())
process.on('SIGINT', () => void arreter())

void demarrer()
