#!/usr/bin/env node
// acceptance/fixtures/candidates/f-platform-reference-candidate.mjs — zone ACCEPTANCE.
//
// CANDIDAT DE REFERENCE F-PLATFORM (ADR-021, P1 a P24), ecrit par le test-author de T74,
// HORS DE PORTEE DE L'IMPLEMENTEUR, utilise par acceptance/T74.spec.ts :
//   - T74.A4 : lance tel quel, il doit obtenir 1 sur chaque clause active a chaque
//     periode (sequences ciblees) et 1 sur le score differentiel de chaque periode ;
//   - T74.A4 : lance avec BENCH_DROP_CLAUSE=<clause>, il est « le meme candidat prive de
//     cette clause » et doit obtenir < 1 sur elle et sur le differentiel d'une periode
//     ou elle est active ;
//   - T74.A2/A3 : journal de trafic (BENCH_TRAFFIC_LOG) et faute unique (BENCH_FAULT_LOCK).
//
// CE QU'IL EXECUTE. L'instantane ./f-platform-reference/ de la source de clauses, produit
// par ./f-platform-reference/generer.mjs a un commit EPINGLE (MANIFEST.json) : il
// N'IMPORTE PAS @bench/oracle et ne suit pas ses modifications. Pourquoi ce n'est pas
// « le modele attendu lui-meme » : voir l'en-tete d'acceptance/T74.spec.ts, section III.
//
// ─────────────────────────────────────────────────────────── PROTOCOLE bench.platform/1
// (fixe par acceptance/T74.spec.ts, section II)
//   - lancement : argv quelconque, BENCH_DATA_DIR = repertoire d'etat (persiste a travers
//     les redemarrages : chaque requete y est journalisee, puis rejouee au demarrage) ;
//   - premiere ligne de stdout : {"ready":true,"protocol":"bench.platform/1"} ;
//   - stdin, une requete JSON par ligne : l'etape du modele attendu plus son `id` :
//       {id, period, at, op, args, tenant?, actor?, version?}   (period : 'Pn' ou n) ;
//   - stdout, une reponse par requete, dans l'ordre : {"id": <id>, "response": {ok, ...}} ;
//   - fin de stdin : le processus se termine (code 0).
//   Une requete sans periode lisible (champ `period`, a defaut BENCH_PERIOD) recoit
//   {ok:false, error:'INVALID_ARGUMENT'}. Une exception de la source de clauses donne
//   {ok:false, error:'INTERNAL_ERROR', message} (l'etape reste journalisee : le rejeu
//   reproduit le meme etat).
//
// ─────────────────────────────────────────────────────────── PRIVATION
// BENCH_DROP_CLAUSE=<id>[,<id>...] : chaque clause nommee est retiree de la source ; si
// elle REMPLACE une clause, celle-ci reste en vigueur a sa place (sa sortie est reportee a
// celle de la clause retiree), comme en T68 (BENCH_DROP_RULE). Valeur vide : candidat fidele.
//
// ─────────────────────────────────────────────────────────── INSTRUMENTATION (suite T74)
// BENCH_TRAFFIC_LOG=<fichier> : une ligne NDJSON par requete traitee
//   {pid, data_dir, id, op, period, req, resp, ok}
//   req  = sha256 du JSON canonique (cles triees) de {at, op, args, tenant, actor, version}
//          de la requete (champs absents omis) ;
//   resp = sha256 du JSON canonique de la reponse ENVOYEE.
// BENCH_FAULT_LOCK=<chemin> : le PREMIER repertoire d'etat (BENCH_DATA_DIR) qui prend ce
//   verrou (mkdir atomique) est fautif : la toute premiere reponse produite dans ce
//   repertoire est inversee ({ok:true,...} -> {ok:false, error:'BENCH_FAULT'} ;
//   {ok:false,...} -> {ok:true}). Tout autre repertoire est fidele. Sert a verifier que le
//   score differentiel est la FRACTION de flux sans divergence (un flux fautif sur N).
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

import { PLATFORM_CLAUSES } from './f-platform-reference/f-platform-clauses.mjs'
import { PlatformEngine } from './f-platform-reference/f-platform-engine.mjs'

const PROTOCOLE = 'bench.platform/1'

/* ───────────────────────────────────────────── source, eventuellement privee */

function source(drop) {
  const retirees = new Set(drop)
  const parId = new Map(PLATFORM_CLAUSES.map((c) => [c.id, c]))
  const report = new Map() // clause remplacee -> nouvelle sortie
  for (const id of retirees) {
    const c = parId.get(id)
    if (c === undefined || c.replaces === null) continue
    let remplacee = c.replaces
    // Si la remplacee est elle-meme retiree, la privation remonte a la precedente.
    while (retirees.has(remplacee) && parId.get(remplacee)?.replaces) remplacee = parId.get(remplacee).replaces
    if (!retirees.has(remplacee)) report.set(remplacee, c.exits)
  }
  return PLATFORM_CLAUSES.filter((c) => !retirees.has(c.id)).map((c) => (report.has(c.id) ? { ...c, exits: report.get(c.id) } : c))
}

const DROP = (process.env.BENCH_DROP_CLAUSE ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
const engine = new PlatformEngine(source(DROP))

/* ───────────────────────────────────────────── etat persistant */

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

function appliquer(step) {
  try {
    return JSON.parse(JSON.stringify(engine.apply(step)))
  } catch (e) {
    return { ok: false, error: 'INTERNAL_ERROR', message: String(e?.message ?? e).slice(0, 300) }
  }
}

// Rejeu du journal : l'etat d'un BENCH_DATA_DIR survit au redemarrage du processus.
let deja = 0
if (JOURNAL !== null && fs.existsSync(JOURNAL)) {
  for (const ligne of fs.readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue
    try {
      appliquer(JSON.parse(ligne))
      deja += 1
    } catch {
      /* ligne tronquee : ignoree */
    }
  }
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
/** Les champs d'une requete qui font l'etape (ni `id`, ni `period`) : at, op, args, tenant, actor, version. */
function corpsDe(req) {
  const out = {}
  if (req === null || typeof req !== 'object') return out
  for (const k of ['at', 'op', 'args', 'tenant', 'actor', 'version']) if (req[k] !== undefined) out[k] = req[k]
  return out
}

const TRAFIC = process.env.BENCH_TRAFFIC_LOG && process.env.BENCH_TRAFFIC_LOG.length > 0 ? process.env.BENCH_TRAFFIC_LOG : null
const VERROU = process.env.BENCH_FAULT_LOCK && process.env.BENCH_FAULT_LOCK.length > 0 ? process.env.BENCH_FAULT_LOCK : null

let fautif = null // null : pas encore decide
function estFautif() {
  if (VERROU === null || realDataDir === null) return false
  if (fautif !== null) return fautif
  const marque = path.join(VERROU, 'data_dir')
  try {
    fs.mkdirSync(VERROU)
    fs.writeFileSync(marque, realDataDir)
    fautif = true
    return true
  } catch {
    /* pris par un autre (ou par nous lors d'un demarrage precedent) */
  }
  for (let i = 0; i < 200; i += 1) {
    try {
      const v = fs.readFileSync(marque, 'utf8')
      if (v.length > 0) {
        fautif = v === realDataDir
        return fautif
      }
    } catch {
      /* pas encore ecrit */
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
  }
  fautif = false
  return false
}
function fauter(r) {
  if (!estFautif()) return r
  const deja = path.join(VERROU, 'faute-emise')
  try {
    fs.mkdirSync(deja)
  } catch {
    return r
  }
  return r.ok === true ? { ok: false, error: 'BENCH_FAULT' } : { ok: true }
}

/* ───────────────────────────────────────────── boucle NDJSON */

process.stdout.write(`${JSON.stringify({ ready: true, protocol: PROTOCOLE, replayed: deja })}\n`)

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const sortie = []
let traficTampon = []
function vider() {
  // Le journal de trafic d'abord : une reponse lue par le notateur est toujours journalisee.
  if (TRAFIC !== null && traficTampon.length > 0) {
    fs.appendFileSync(TRAFIC, traficTampon.join(''))
    traficTampon = []
  }
  if (sortie.length > 0) {
    process.stdout.write(sortie.join(''))
    sortie.length = 0
  }
}
let planifie = false
function planifier() {
  if (planifie) return
  planifie = true
  setImmediate(() => {
    planifie = false
    vider()
  })
}

rl.on('line', (ligne) => {
  if (ligne.trim() === '') return
  let req
  try {
    req = JSON.parse(ligne)
  } catch {
    sortie.push(`${JSON.stringify({ id: null, response: { ok: false, error: 'INVALID_ARGUMENT' } })}\n`)
    planifier()
    return
  }
  const id = req?.id ?? null
  const periode = req !== null && typeof req === 'object' ? periodeDe(req) : null
  let response
  if (periode === null || typeof req.op !== 'string') {
    response = { ok: false, error: 'INVALID_ARGUMENT' }
  } else {
    const step = etapeDe(req, periode)
    if (JOURNAL !== null) fs.appendFileSync(JOURNAL, `${JSON.stringify(step)}\n`)
    response = fauter(appliquer(step))
  }
  sortie.push(`${JSON.stringify({ id, response })}\n`)
  if (TRAFIC !== null) {
    traficTampon.push(
      `${JSON.stringify({ pid: process.pid, data_dir: realDataDir, id, op: req?.op ?? null, period: periode, req: empreinte(corpsDe(req)), resp: empreinte(response), ok: response.ok === true })}\n`,
    )
  }
  planifier()
})
rl.on('close', () => {
  vider()
  process.exitCode = 0
})
