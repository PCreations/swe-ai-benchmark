#!/usr/bin/env node
// acceptance/fixtures/candidates/f-platform-doc-reference/candidat.mjs — zone ACCEPTANCE.
//
// CANDIDAT DE REFERENCE F-PLATFORM DERIVE DES SEULS DOCUMENTS REMIS (ADR-021 decision 6), ecrit par
// le test-author de T77, HORS DE PORTEE DE L'IMPLEMENTEUR, utilise par acceptance/T77.spec.ts :
//   - T77.A2 : `bench calibrate` le note sur les 24 periodes ; il doit obtenir 1 sur chaque clause
//     active a chaque periode et 1 au differentiel ; prive de P6.R2 (BENCH_DROP_CLAUSE=P6.R2), la
//     calibration doit echouer ;
//   - T77.A1 : sa calibration reussie de la source en vigueur leve le refus de pilot-conduct ;
//   - T77.A3 : sur une source dont docs/spec.md a perdu le texte d'une clause, sa calibration doit
//     echouer (lui-meme, fige, obtiendrait encore 1 : c'est la completude qui doit le dire).
//
// ───────────────────────────────────────────────────────────── PROVENANCE (comment il a ete ecrit)
// Entree unique : les 72 documents que le generateur de T73 (`renderPlatformPeriodDocs(n)`,
// @bench/scenario) rend pour n = 1..24, a la source de clauses de HEAD (e16b353) : docs/spec.md
// (texte de chaque clause active et ses precisions), docs/api.md (protocole bench.platform/1,
// enveloppe, operations, ordre des controles, valeurs, grandeurs, vocabulaire, exemples calcules)
// et docs/tickets/Pnn.md. Ni packages/oracle (source de clauses, moteur), ni le candidat de T74
// (acceptance/fixtures/candidates/f-platform-reference/), ni les racines gelees
// acceptance/reference-platform/ n'ont ete lus pour l'ecrire. Les noms de champs, les codes
// d'erreur, les valeurs d'enumeration et les formes des reponses sont ceux des documents ;
// acceptance/T77.spec.ts (II.5) le verifie mecaniquement sur le texte de ce repertoire : imports
// limites a node: et a ./, aucune chaine ni aucun nom snake_case absent des documents (hors une
// liste technique fermee).
//
// Le modele attendu n'a servi que de JUGE NOIR : notateurs de T74 (cibles et differentiels, graines
// 7777, 1, 42, 7474, 20261031) et comparaison pas a pas des reponses sur des flux differentiels plus
// longs (40 a 60 flux de 2000 a 3000 operations, graines 3, 5, 11, 13, 21, 77, 99, 314, chaque
// periode). Chaque divergence a ete RAMENEE AUX DOCUMENTS : corrigee seulement quand une phrase des
// documents tranchait, consignee comme defaut de l'enonce sinon.
//
// ───────────────────────────────────────────────────────────── JOURNAL DES DIVERGENCES (toutes
// tranchees par les documents ; AUCUN defaut de l'enonce n'a ete trouve)
//   1. list_occurrences apres re-creation, par create_slot, du slot_id d'une occurrence exceptee :
//      la premiere version derivait la liste de l'existence des creneaux. docs/spec.md P5.R3 : « les
//      slot_id des occurrences courantes de la serie, exceptions exclues » -> la liste exclut les
//      dates exceptees, quel que soit le sort ulterieur du slot_id.
//   2. change_price d'une reservation en USD : la premiere version recalculait aussi
//      original_amount_cents. docs/spec.md P16.R2 : « la reservation garde A', C - r_c, D - r_d »
//      (et Q63 : « garde ... original_amount_cents, rate_micro ») -> seuls ces trois montants
//      changent ; original_amount_cents garde le net de la confirmation. (Phrase SUFFISANTE, mais
//      implicite : rien ne dit qu'original_amount_cents n'est plus le net de amount_cents.)
//   3. merge_tenants d'une serie dont une occurrence est exceptee : la premiere version renommait
//      aussi le slot_id de l'occurrence exceptee. docs/spec.md P5.R2 : « son creneau n'existe plus » ;
//      P17.R2 : « le slot_id de l'une de ses occurrences courantes » -> seules les occurrences
//      courantes sont renommees et figurent dans renamed.
//   4. Lots apres une fusion : la premiere version gardait les lots consommes de chaque cote.
//      docs/spec.md P22.R2 : « Retroactivite : les lots sont reconstitues sur TOUT l'historique du
//      portefeuille » ; P17.R3 : « l'historique du portefeuille de la source (mouvements et lots
//      P22.R2) rejoignant celui de la cible avec ses instants » -> les lots se reconstituent sur
//      l'historique REUNI, dans l'ordre des instants (un debit de la cible consomme un lot plus
//      ancien venu de la source).
//
// ───────────────────────────────────────────────────────────── PROTOCOLE bench.platform/1
// (docs/api.md, « Protocole du processus candidat ») : BENCH_DATA_DIR (etat qui survit au
// redemarrage : chaque requete est journalisee puis rejouee au demarrage) ; premiere ligne
// {"ready":true,"protocol":"bench.platform/1"} ; une requete JSON par ligne, une reponse
// {"id","response"} par requete, dans l'ordre ; BENCH_PLATFORM_SOCKET (connexions multiples : un
// seul fil d'execution, chaque operation est atomique).
//
// ───────────────────────────────────────────────────────────── INSTRUMENTATION (suite T77 seulement)
//   BENCH_TRAFFIC_LOG=<fichier> : une ligne NDJSON par requete {pid, data_dir, id, op, period, req,
//     resp, ok} (req, resp : sha256 du JSON canonique), meme format que la fixture de T74 ;
//   BENCH_DROP_CLAUSE=P6.R2 : le meme candidat PRIVE de P6.R2 (aucun refus GROUP_TOO_LARGE).
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import * as readline from 'node:readline'

import { creerPlateforme } from './plateforme.mjs'

const PROTOCOLE = 'bench.platform/1'

const sansClauses = (process.env.BENCH_DROP_CLAUSE ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0)
const plateforme = creerPlateforme({ sansClauses })

/* ─────────────────────────────── etat : BENCH_DATA_DIR, journal rejoue au demarrage */

const DOSSIER = process.env.BENCH_DATA_DIR && process.env.BENCH_DATA_DIR.length > 0 ? process.env.BENCH_DATA_DIR : null
if (DOSSIER !== null) fs.mkdirSync(DOSSIER, { recursive: true })
const JOURNAL = DOSSIER === null ? null : path.join(DOSSIER, 'journal.ndjson')
let dossierReel = DOSSIER
try {
  if (DOSSIER !== null) dossierReel = fs.realpathSync(DOSSIER)
} catch {
  /* chemin donne */
}

function appliquer(etape) {
  try {
    return plateforme.apply(etape)
  } catch {
    return { ok: false, error: 'INVALID_ARGUMENT' }
  }
}

if (JOURNAL !== null && fs.existsSync(JOURNAL)) {
  for (const ligne of fs.readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue
    let etape
    try {
      etape = JSON.parse(ligne)
    } catch {
      continue
    }
    appliquer(etape)
  }
}

/* ─────────────────────────────── instrumentation (suite d'acceptation seulement) */

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
const TRAFIC = process.env.BENCH_TRAFFIC_LOG && process.env.BENCH_TRAFFIC_LOG.length > 0 ? process.env.BENCH_TRAFFIC_LOG : null

/* ─────────────────────────────── une requete */

const CHAMPS = ['at', 'op', 'args', 'tenant', 'actor', 'version']

function traiter(req) {
  if (req === null || typeof req !== 'object' || Array.isArray(req)) return { ok: false, error: 'INVALID_ARGUMENT' }
  const etape = { period: req.period ?? process.env.BENCH_PERIOD }
  for (const k of CHAMPS) if (req[k] !== undefined) etape[k] = req[k]
  if (JOURNAL !== null) fs.appendFileSync(JOURNAL, `${JSON.stringify(etape)}\n`)
  const rep = appliquer(etape)
  if (TRAFIC !== null) {
    const corps = {}
    for (const k of CHAMPS) if (req[k] !== undefined) corps[k] = req[k]
    fs.appendFileSync(TRAFIC, `${JSON.stringify({ pid: process.pid, data_dir: dossierReel, id: req.id ?? null, op: req.op ?? null, period: req.period ?? null, req: empreinte(corps), resp: empreinte(rep), ok: rep.ok === true })}\n`)
  }
  return rep
}

function client(entree, ecrire, finir) {
  const rl = readline.createInterface({ input: entree, crlfDelay: Infinity })
  rl.on('line', (ligne) => {
    if (ligne.trim() === '') return
    let req = null
    try {
      req = JSON.parse(ligne)
    } catch {
      req = null
    }
    const id = req !== null && typeof req === 'object' ? req.id ?? null : null
    ecrire(`${JSON.stringify({ id, response: traiter(req) })}\n`)
  })
  rl.on('close', finir)
}

/* ─────────────────────────────── demarrage (connexions multiples : BENCH_PLATFORM_SOCKET) */

const SOCKET = process.env.BENCH_PLATFORM_SOCKET && process.env.BENCH_PLATFORM_SOCKET.length > 0 ? process.env.BENCH_PLATFORM_SOCKET : null
let serveur = null

function demarrer() {
  const pret = { ready: true, protocol: PROTOCOLE }
  if (SOCKET !== null) pret.socket = SOCKET
  process.stdout.write(`${JSON.stringify(pret)}\n`)
  client(process.stdin, (s) => process.stdout.write(s), () => {
    if (serveur !== null) serveur.close()
    process.exitCode = 0
  })
}

if (SOCKET !== null) {
  try {
    fs.unlinkSync(SOCKET)
  } catch {
    /* absent */
  }
  serveur = net.createServer((sock) => {
    client(sock, (s) => sock.write(s), () => sock.end())
  })
  serveur.listen(SOCKET, demarrer)
} else demarrer()
