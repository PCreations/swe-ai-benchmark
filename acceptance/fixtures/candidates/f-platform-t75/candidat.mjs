#!/usr/bin/env node
// acceptance/fixtures/candidates/f-platform-t75/candidat.mjs — zone ACCEPTANCE (T75, test-author).
//
// CANDIDAT DE REFERENCE F-PLATFORM DE T75, DERIVE DE CELUI DE T74
// (../f-platform-reference-candidate.mjs), HORS DE PORTEE DE L'IMPLEMENTEUR, utilise par
// acceptance/T75.spec.ts. Il execute le MEME instantane de la source de clauses
// (../f-platform-reference/, MANIFEST epingle) ; il n'importe pas @bench/*.
//
// Ce qui le distingue du candidat de T74 (et rien d'autre) :
//   1. INDEX TRANSPARENTS (./accelerateur.mjs) : sans eux la reference echoue P20.R3 sur le
//      volume (voir l'en-tete de ce module). La suite verifie qu'il rend, sur toute la
//      trajectoire gelee, les memes reponses que le candidat de T74, octet pour octet.
//   2. CONNEXIONS MULTIPLES (extension de bench.platform/1 fixee par l'en-tete
//      d'acceptance/T75.spec.ts, section II) : si BENCH_PLATFORM_SOCKET est pose, il ecoute
//      sur ce socket Unix AVANT d'ecrire sa ligne prete, qui porte alors "socket" ; chaque
//      connexion est un client NDJSON independant (une requete par ligne, une reponse
//      {id, response} par requete, dans l'ordre de la connexion). stdin reste un client ;
//      sa fermeture termine le processus (reponses en attente ecrites d'abord).
//      Une operation est ATOMIQUE : le moteur est synchrone, la boucle d'evenements de
//      Node sert d'exclusion mutuelle entre connexions.
//   3. INSTRUMENTATION (suite seulement) : BENCH_TRAFFIC_LOG, une ligne NDJSON par requete
//      traitee : {pid, data_dir, conn, id, op, period, req, resp, ok, status, t_in, t_out,
//      lot, rid, slot, member, held, args_h, rows, accepted}. req/resp : sha256 du JSON canonique, comme
//      en T74 ; t_in : instant de lecture de la ligne de requete ; t_out : instant juste
//      avant l'ecriture de la reponse (ms, performance.timeOrigin + performance.now()) ;
//      lot : numero du lot (variante sans exclusion) ou null ; rid/slot : args.request_id
//      et args.slot_id ; member : args.member_id ; held (erase_member seulement, sinon
//      null) : nombre de reservations du locataire qui ont ete CREEES PAR UN import_bookings
//      reussi (ligne dont la reservation porte le request_id et le member_id de la ligne) et
//      que args.member_id detient encore, compte JUSTE AVANT l'operation (precision Q68 de
//      P20.R3 : l'effacement est mesure sur des membres qui detiennent des reservations
//      importees) ; args_h : sha256 des args ; rows : nombre de lignes d'un import ;
//      accepted/status : champs de la reponse.
//
// ─────────────────────────────────────────────────────────────── VARIANTES (FIXTURES)
// BENCH_T75_VARIANT (pose par ./variante-*.mjs ; vide : reference) :
//   - 'balayage' (./variante-balayage.mjs) — T75.A1, « un candidat de reference qui parcourt
//     toutes les reservations a chaque operation » : AVANT chaque operation, il relit
//     chaque reservation de chaque locataire (copie JSON, comme le rechargement d'une
//     table sans index), PASSES_DE_BALAYAGE fois. Rien d'autre ne change : memes reponses.
//   - 'sans-exclusion' (./variante-sans-exclusion.mjs) — T75.A2, « un candidat de reference
//     sans exclusion mutuelle » : les requetes reserve et import_bookings (et leurs noms v2)
//     sont LUES-CALCULEES-ECRITES sans verrou. Fenetre de course elargie de facon
//     DETERMINISTE : la premiere de ces requetes ouvre un lot de FENETRE_MS ; toutes celles
//     qui arrivent pendant la fenetre (de n'importe quelle connexion) sont evaluees sur une
//     copie de l'etat pris a la fermeture du lot (chacune sur sa propre copie, comme si elle
//     etait seule), puis chacune ecrit son etat : la DERNIERE ecriture l'emporte (mise a
//     jour perdue). Les autres operations restent immediates et atomiques. Les requetes d'un
//     meme lot se chevauchent donc toujours : leurs reponses ne partent qu'a la fermeture du
//     lot. Le journal de reprise n'est pas rendu coherent avec cet etat (sans objet pour T75).
//   Les reponses de la variante sans exclusion different de celles de la reference des que
//   deux requetes d'un lot touchent la meme ressource : c'est le defaut a detecter.
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import * as readline from 'node:readline'

import { PLATFORM_CLAUSES } from '../f-platform-reference/f-platform-clauses.mjs'
import { PlatformEngine } from '../f-platform-reference/f-platform-engine.mjs'
import { clausesIndexees, indexerEtat, indexerLocataire } from './accelerateur.mjs'

const PROTOCOLE = 'bench.platform/1'
const VARIANTE = process.env.BENCH_T75_VARIANT ?? ''
const PASSES_DE_BALAYAGE = 2
const FENETRE_MS = 150
const OPS_EN_LOT = new Set(['reserve', 'import_bookings', 'create_reservation', 'import_reservations'])

const CLAUSES = clausesIndexees(PLATFORM_CLAUSES)
const engine = new PlatformEngine(CLAUSES)
indexerEtat(engine.etat)

/* ───────────────────────────────────────────── etat persistant (comme T74) */

const DATA_DIR = process.env.BENCH_DATA_DIR && process.env.BENCH_DATA_DIR.length > 0 ? process.env.BENCH_DATA_DIR : null
const JOURNAL = DATA_DIR === null ? null : path.join(DATA_DIR, 'f-platform-journal.ndjson')
if (DATA_DIR !== null) fs.mkdirSync(DATA_DIR, { recursive: true })
let realDataDir = DATA_DIR
try {
  if (DATA_DIR !== null) realDataDir = fs.realpathSync(DATA_DIR)
} catch {
  /* garde le chemin donne */
}

function periodeDe(req) {
  const v = req.period ?? process.env.BENCH_PERIOD
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return `P${v}`
  if (typeof v === 'string' && /^[Pp]?\d{1,2}$/.test(v.trim())) return `P${Number(v.trim().replace(/^[Pp]/, ''))}`
  return null
}

function etapeDe(req, periode) {
  const step = { period: periode, at: req.at, op: req.op, args: req.args ?? {} }
  for (const k of ['tenant', 'actor', 'version']) if (req[k] !== undefined) step[k] = req[k]
  if (req.id !== undefined) step.id = req.id
  return step
}

/* Reservations creees par un import_bookings reussi : locataire -> membre -> Set(booking_id)
   (instrumentation : champ `held` du journal de trafic ; suivi aussi au rejeu). */
const IMPORTEES = new Map()
const locataireDe = (step) => (typeof step.tenant === 'string' ? step.tenant : 'default')
function suivreImport(moteur, step, r) {
  if (step.op !== 'import_bookings' || r?.ok !== true || !Array.isArray(step.args?.rows)) return
  const t = moteur.etat.tenants.get(locataireDe(step))
  if (t === undefined) return
  if (!IMPORTEES.has(locataireDe(step))) IMPORTEES.set(locataireDe(step), new Map())
  const parMembre = IMPORTEES.get(locataireDe(step))
  for (const row of step.args.rows) {
    if (row === null || typeof row !== 'object' || typeof row.request_id !== 'string' || typeof row.member_id !== 'string') continue
    const b = Map.prototype.get.call(t.bookings, row.request_id)
    if (b === undefined || b.member_id !== row.member_id) continue
    if (!parMembre.has(row.member_id)) parMembre.set(row.member_id, new Set())
    parMembre.get(row.member_id).add(row.request_id)
  }
}
/** Reservations importees que `m` detient encore dans le locataire de `req` (avant l'operation). */
function importeesDetenues(req) {
  const m = req?.args?.member_id
  if (typeof m !== 'string') return 0
  const t = engine.etat.tenants.get(locataireDe(req))
  const ids = IMPORTEES.get(locataireDe(req))?.get(m)
  if (t === undefined || ids === undefined) return 0
  let n = 0
  for (const id of ids) if (Map.prototype.get.call(t.bookings, id)?.member_id === m) n += 1
  return n
}

function appliquerSur(moteur, step) {
  try {
    const r = JSON.parse(JSON.stringify(moteur.apply(step)))
    suivreImport(moteur, step, r)
    return r
  } catch (e) {
    return { ok: false, error: 'INTERNAL_ERROR', message: String(e?.message ?? e).slice(0, 300) }
  }
}

let deja = 0
if (JOURNAL !== null && fs.existsSync(JOURNAL)) {
  for (const ligne of fs.readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue
    try {
      appliquerSur(engine, JSON.parse(ligne))
      deja += 1
    } catch {
      /* ligne tronquee : ignoree */
    }
  }
}

/* ───────────────────────────────────────────── VARIANTE 'balayage' */

function balayer() {
  for (let p = 0; p < PASSES_DE_BALAYAGE; p += 1) {
    for (const t of Map.prototype.values.call(engine.etat.tenants)) {
      for (const b of Map.prototype.values.call(t.bookings)) JSON.parse(JSON.stringify(b))
    }
  }
}

/* ───────────────────────────────────────────── traitement d'une requete */

function traiter(req) {
  const periode = req !== null && typeof req === 'object' ? periodeDe(req) : null
  if (periode === null || typeof req.op !== 'string') return { ok: false, error: 'INVALID_ARGUMENT' }
  const step = etapeDe(req, periode)
  if (JOURNAL !== null) fs.appendFileSync(JOURNAL, `${JSON.stringify(step)}\n`)
  if (VARIANTE === 'balayage') balayer()
  return appliquerSur(engine, step)
}

/* ───────────────────────────────────────────── VARIANTE 'sans-exclusion' */

/** Copie de l'etat ou seul le locataire `tenant` (et l'entrepot global) est duplique. */
function copierEtat(base, tenant) {
  const copie = { tenants: new Map(base.tenants), seq: base.seq, journal_seq: base.journal_seq, donnees: structuredClone(base.donnees) }
  const t = base.tenants.get(tenant)
  if (t !== undefined) copie.tenants.set(tenant, indexerLocataire(structuredClone(t)))
  return indexerEtat(copie)
}

let lotOuvert = null
let numeroDeLot = 0
function mettreEnLot(entree) {
  if (lotOuvert === null) {
    const lot = { n: (numeroDeLot += 1), entrees: [] }
    lotOuvert = lot
    setTimeout(() => fermerLot(lot), FENETRE_MS)
  }
  entree.lot = lotOuvert.n
  lotOuvert.entrees.push(entree)
}
function fermerLot(lot) {
  if (lotOuvert === lot) lotOuvert = null
  const base = engine.etat
  let derniere = null
  for (const e of lot.entrees) {
    const periode = periodeDe(e.req)
    const step = etapeDe(e.req, periode)
    if (JOURNAL !== null) fs.appendFileSync(JOURNAL, `${JSON.stringify(step)}\n`)
    const moteur = new PlatformEngine(CLAUSES)
    moteur.tables = engine.tables
    moteur.etat = copierEtat(base, typeof e.req.tenant === 'string' ? e.req.tenant : 'default')
    e.response = appliquerSur(moteur, step)
    e.pret = true
    derniere = moteur.etat
  }
  if (derniere !== null) engine.etat = derniere
  for (const c of connexions) vidanger(c)
  terminerSiPossible()
}

/* ───────────────────────────────────────────── instrumentation */

function canonique(v) {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}
const empreinte = (v) => createHash('sha256').update(canonique(v)).digest('hex')
function corpsDe(req) {
  const out = {}
  if (req === null || typeof req !== 'object') return out
  for (const k of ['at', 'op', 'args', 'tenant', 'actor', 'version']) if (req[k] !== undefined) out[k] = req[k]
  return out
}
const maintenant = () => performance.timeOrigin + performance.now()
const TRAFIC = process.env.BENCH_TRAFFIC_LOG && process.env.BENCH_TRAFFIC_LOG.length > 0 ? process.env.BENCH_TRAFFIC_LOG : null

function journaliser(conn, e) {
  if (TRAFIC === null) return
  const req = e.req !== null && typeof e.req === 'object' ? e.req : {}
  const args = req.args !== null && typeof req.args === 'object' ? req.args : {}
  const r = e.response
  fs.appendFileSync(
    TRAFIC,
    `${JSON.stringify({
      pid: process.pid,
      data_dir: realDataDir,
      conn: conn.n,
      id: e.id,
      op: typeof req.op === 'string' ? req.op : null,
      period: periodeDe(req),
      req: empreinte(corpsDe(req)),
      resp: empreinte(r),
      ok: r?.ok === true,
      status: typeof r?.status === 'string' ? r.status : null,
      t_in: e.t_in,
      t_out: e.t_out,
      lot: e.lot,
      rid: typeof args.request_id === 'string' ? args.request_id : null,
      slot: typeof args.slot_id === 'string' ? args.slot_id : null,
      member: typeof args.member_id === 'string' ? args.member_id : null,
      held: typeof e.held === 'number' ? e.held : null,
      args_h: empreinte(args),
      rows: Array.isArray(args.rows) ? args.rows.length : null,
      accepted: typeof r?.accepted === 'number' ? r.accepted : null,
    })}\n`,
  )
}

/* ───────────────────────────────────────────── connexions */

const connexions = new Set()
function vidanger(c) {
  const sortie = []
  while (c.file.length > 0 && c.file[0].pret) {
    const e = c.file.shift()
    e.t_out = maintenant()
    journaliser(c, e)
    sortie.push(`${JSON.stringify({ id: e.id, response: e.response })}\n`)
  }
  if (sortie.length > 0) c.ecrire(sortie.join(''))
}

function recevoir(c, ligne) {
  const t_in = maintenant()
  if (ligne.trim() === '') return
  let req
  try {
    req = JSON.parse(ligne)
  } catch {
    c.file.push({ id: null, req: null, response: { ok: false, error: 'INVALID_ARGUMENT' }, pret: true, t_in, lot: null })
    vidanger(c)
    return
  }
  const e = { id: req?.id ?? null, req, response: undefined, pret: false, t_in, lot: null }
  c.file.push(e)
  const enLot = VARIANTE === 'sans-exclusion' && req !== null && typeof req === 'object' && OPS_EN_LOT.has(req.op) && periodeDe(req) !== null
  if (enLot) {
    mettreEnLot(e)
    return
  }
  if (TRAFIC !== null && req !== null && typeof req === 'object' && req.op === 'erase_member') e.held = importeesDetenues(req)
  e.response = traiter(req)
  e.pret = true
  vidanger(c)
}

let numeroDeConnexion = 0
function brancher(entree, ecrire) {
  const c = { n: numeroDeConnexion, file: [], ecrire }
  numeroDeConnexion += 1
  connexions.add(c)
  const rl = readline.createInterface({ input: entree, crlfDelay: Infinity })
  rl.on('line', (l) => recevoir(c, l))
  return { c, rl }
}

/* ───────────────────────────────────────────── demarrage */

const SOCKET = process.env.BENCH_PLATFORM_SOCKET && process.env.BENCH_PLATFORM_SOCKET.length > 0 ? process.env.BENCH_PLATFORM_SOCKET : null
let serveur = null
let stdinFerme = false

function terminerSiPossible() {
  if (!stdinFerme || lotOuvert !== null) return
  for (const c of connexions) if (c.file.length > 0) return
  if (serveur !== null) {
    try {
      serveur.close()
    } catch {
      /* deja ferme */
    }
    try {
      fs.unlinkSync(SOCKET)
    } catch {
      /* deja retire */
    }
  }
  process.stdout.write('', () => process.exit(0))
}

function pret() {
  const ligne = { ready: true, protocol: PROTOCOLE, replayed: deja }
  if (SOCKET !== null) ligne.socket = SOCKET
  process.stdout.write(`${JSON.stringify(ligne)}\n`)
  const { c, rl } = brancher(process.stdin, (s) => process.stdout.write(s))
  rl.on('close', () => {
    stdinFerme = true
    connexions.delete(c) // ses reponses en attente restent dans c.file : on les attend
    const attendre = () => {
      if (c.file.length > 0 || lotOuvert !== null) {
        if (c.file.length > 0 && c.file[0].pret) vidanger(c)
        setTimeout(attendre, 2)
        return
      }
      terminerSiPossible()
    }
    attendre()
  })
}

if (SOCKET === null) {
  pret()
} else {
  try {
    fs.unlinkSync(SOCKET)
  } catch {
    /* absent */
  }
  serveur = net.createServer((s) => {
    s.setNoDelay?.(true)
    const { c } = brancher(s, (x) => {
      if (!s.destroyed) s.write(x)
    })
    s.on('close', () => connexions.delete(c))
    s.on('error', () => connexions.delete(c))
  })
  serveur.listen(SOCKET, pret)
}
