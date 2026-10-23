#!/usr/bin/env node
// acceptance/fixtures/candidates/f-long-reference-candidate-v4.mjs — zone ACCEPTANCE.
//
// CANDIDAT DE REFERENCE FIDELE A F-LONG (ADR-018, section « Le scenario
// `F-LONG` », P1 a P12), parlant `bench.candidate/4` (ADR-019, decision 1) et
// appliquant les huit points tranches par ADR-019 (decision 2). Ce programme
// n'est PAS une source de T68 (packages/activities, packages/scenario) : c'est
// un temoin ecrit par le test-author, HORS DE PORTEE DE L'IMPLEMENTEUR, utilise
// par acceptance/T68.spec.ts :
//   - T68.A1 : lance tel quel, il doit obtenir 1 sur chaque regle active a
//     partir de P5, a chaque periode ou elle est active ;
//   - T68.A2 : lance avec BENCH_DROP_RULE=<regle>, il est « le meme candidat
//     prive de cette seule regle » et doit obtenir < 1 sur elle ;
//   - T68.A3 : avec BENCH_TRAFFIC_LOG=<fichier>, il journalise chaque requete
//     recue — c'est le TRAFIC REEL, jamais une lecture des sequences par l'API
//     de l'implementation, qui prouve qu'une regle appelle ses operations.
//
// Le candidat v3 (f-long-reference-candidate.mjs) reste inchange pour T64.
//
// ─────────────────────────────────────────────────────────── PROTOCOLE
// NDJSON `{id,op,args}` -> `{id,ok:true,result}` | `{id,ok:false,error:{code,
// message}}`, probe de demarrage `{ready:true,protocol:"bench.candidate/4"}`.
// Operations (description publique CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG) :
//
//   create_tenant {tenant_id}                                            -> {}
//   advance_clock {to}                                                   -> {}
//   create_slot   {tenant_id,slot_id,start,capacity,price}               -> {decision:"created"}
//   write         {op,actor,tenant_id,admission_seq,operation_key,slot_id} -> {decision}
//   read          {tenant_id,key,slot_id}                                -> {value}
//   probe_cancel  {tenant_id,key,slot_id}                                -> {decision}
//   fingerprint   {}                                                     -> {sha256}
//   set_capacity  {tenant_id,slot_id,capacity}                           -> {decision}
//   set_level     {tenant_id,actor,level}                                -> {decision}
//   balance       {tenant_id,actor}                                      -> {balance}
//   history       {tenant_id,key,slot_id}                                -> {events}
//   transfer      {tenant_id,key,slot_id,to_tenant_id}                   -> {decision}
//
// ─────────────────────────────────────────────────────────── LES HUIT POINTS
// (ADR-019, decision 2) — appliques tels quels :
//   1. une reservation est designee par (tenant_id, key, slot_id) ; pour
//      `write`, la cle est `actor`. Si plusieurs reservations portent ce
//      triplet (annulee puis re-reservee), la plus recente non annulee, a
//      defaut la plus recente.
//   2. tous les locataires sont a l'heure d'Europe/Paris.
//   3. annulation permise STRICTEMENT avant le debut du creneau ; a partir du
//      debut (instant inclus) : erreur `CANCELLATION_TOO_LATE` (sauf sous
//      cancel@1, « sans restriction »).
//   4. remboursement calcule sur le montant effectivement debite (`paid`).
//   5. sous quota@1, une promotion depuis la file saute l'acteur qui detient
//      deja deux confirmes dans le locataire ; il reste en attente.
//   6. une reservation en attente peut etre annulee ; remboursement = montant
//      debite, donc 0 pour une reservation jamais confirmee.
//   7. un evenement d'historique est EXACTEMENT {type, status, at}.
//   8. un confirme retrograde (capacity@1) garde la tete de la file jusqu'a la
//      prochaine reordonnance imposee par une regle : `set_level` sous
//      priority@1, ou passage a fifo@2. Entre-temps, une nouvelle attente
//      s'insere APRES les retrogrades epingles, quel que soit son niveau.
//
// ─────────────────────────────────────────────────────────── REGLES
// La periode courante se deduit de l'horloge (`advance_clock`) et des
// horloges de periode d'ADR-018 (L81-L84) ; horloge absente = P1.
//   reserve@1      admission : confirme si la file est vide et une place est
//                  libre, sinon en attente. Un acteur qui a deja une
//                  reservation vivante sur le creneau recoit son statut, sans
//                  doublon.
//   idempotence@1  rejouer la meme `operation_key` (dans le meme locataire)
//                  avec les MEMES arguments renvoie la reponse enregistree,
//                  sans nouvel effet ; la meme cle avec d'autres arguments est
//                  traitee comme une operation nouvelle.
//   fifo@1/fifo@2  file ordonnee par sequence d'admission.
//   priority@1     file ordonnee par niveau (`gold` d'abord) puis sequence ;
//                  `set_level` reordonne immediatement toutes les files.
//   cancel@1       annulation sans restriction, remboursement = paid.
//   cancel@2       permise jusqu'a 24 h avant le debut, frontiere incluse ;
//                  entre 24 h avant et le debut : `{decision:"refused"}`
//                  (« refus metier », F-RESERVATION) ; a partir du debut :
//                  CANCELLATION_TOO_LATE (point 3).
//   cancel@3       permise avant le debut ; 100 % a >= 48 h, 50 % arrondi au
//                  centime inferieur a >= 24 h, 0 % sinon.
//   cancel@4       permise avant le debut ; integral si l'annulation a lieu
//                  au plus tard a 18:00 heure locale la veille du jour local
//                  du creneau, nul sinon.
//   isolation@1    chaque locataire a son propre espace de creneaux ; un
//                  creneau ou une reservation d'un autre locataire est
//                  NOT_FOUND, sans donnee divulguee.
//   capacity@1     `set_capacity` : augmenter promeut dans l'ordre de la file ;
//                  reduire sous le nombre de confirmes retrograde les
//                  confirmes les plus recents (sequence decroissante), places
//                  en tete de file (entre eux par sequence croissante), et
//                  epingles (point 8).
//   price@1        toute confirmation (y compris une promotion) intervenue a
//                  partir de P7 debite le prix du creneau du solde de
//                  l'acteur dans le locataire (solde initial 0).
//   quota@1        au plus deux confirmes par acteur et par locataire ; une
//                  reservation au-dela : erreur QUOTA_EXCEEDED, sans attente ni
//                  debit ; promotion : point 5.
//   history@1      a l'entree de P10, chaque reservation existante recoit un
//                  unique evenement `migrated` portant son statut courant ;
//                  ensuite un evenement par changement : `reserved` (statut
//                  confirmed ou waiting), `promoted`, `demoted`, `cancelled`,
//                  `transferred`. `at` = horloge courante (ISO 8601).
//   transfer@1     `transfer` deplace la reservation du locataire d'origine
//                  vers `to_tenant_id` (`{decision:"transferred"}`) ; ensuite
//                  `read` depuis la destination la voit, depuis l'origine rend
//                  `{value:null}`, depuis un tiers NOT_FOUND. Avant P12 (regle
//                  inactive) : `{decision:"refused"}` sans effet.
//
// ─────────────────────────────────────────────────────────── PRIVATION
// BENCH_DROP_RULE=<id de regle> (ou l'argument `--drop-rule <id>`) produit
// « le meme candidat prive de cette seule regle » (ADR-019, decision 3). La
// regle privee est retiree de l'ensemble actif de CHAQUE periode ; si elle
// REMPLACE une regle precedente, celle-ci reste en vigueur a sa place :
//   capacity@1  -> retiree : `set_capacity` rend {decision:"refused"} sans effet.
//   priority@1  -> fifo@1 reste en vigueur ; `set_level` est memorise sans effet.
//   price@1     -> retiree : aucune confirmation ne debite (solde 0, paid 0).
//   cancel@3    -> cancel@2 reste en vigueur.
//   quota@1     -> retiree : ni QUOTA_EXCEEDED ni saut de promotion.
//   cancel@4    -> cancel@3 reste en vigueur.
//   history@1   -> retiree : aucune migration, aucun evenement ; `history` rend
//                  {events:[]}.
//   fifo@2      -> priority@1 reste en vigueur (les niveaux comptent encore).
//   transfer@1  -> retiree : `transfer` rend {decision:"refused"} sans effet.
//   toute autre -> retiree de l'ensemble actif.
// Valeur vide ou absente : candidat FIDELE.
//
// AJOUTE PAR acceptance/T66.spec.ts (ADDITIF, T68 inchange) : BENCH_DROP_RULE
// peut porter PLUSIEURS regles separees par des virgules, chacune privee selon
// la table ci-dessus. T66.A3 l'emploie avec `cancel@3,fifo@2` : « un candidat
// qui implemente fidelement P1 a P6 puis ignore les remplacements de P7 et
// P11 » — cancel@2 reste en vigueur en P7-P8 a la place de cancel@3, et
// priority@1 en P11-P12 a la place de fifo@2 ; cancel@4 (P9-P12) n'est pas
// touchee, n'etant pas le remplacement de P7 ni de P11.
//
// ─────────────────────────────────────────────────────────── JOURNAL
// BENCH_TRAFFIC_LOG=<chemin> (ou `--traffic-log <chemin>`) : une ligne NDJSON
// `{pid, data_dir, op}` est AJOUTEE a ce fichier pour chaque requete recue,
// avant son traitement. Sans cette variable, rien n'est ecrit.
//
// ETAT PERSISTANT : `${BENCH_DATA_DIR}/state.json`, relu a chaque demarrage,
// reecrit atomiquement apres chaque operation mutante.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import * as path from 'node:path';

const PROTOCOL = 'bench.candidate/4';

function argument(nom) {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const DROP_RULE = (argument('--drop-rule') ?? process.env.BENCH_DROP_RULE ?? '').trim();
const TRAFFIC_LOG = argument('--traffic-log') ?? process.env.BENCH_TRAFFIC_LOG ?? '';

const DATA_DIR = path.resolve(process.env.BENCH_DATA_DIR ?? '.');
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  /* deja present, ou impossible : chargerEtat() retombera sur un etat vide */
}
const STATE_PATH = path.join(DATA_DIR, 'state.json');

/* ─────────────────────────────── horloges et regles par periode (ADR-018) */

const PERIOD_CLOCKS = [
  ['P1', '2030-01-01T00:00:00Z'],
  ['P2', '2030-01-01T01:00:00Z'],
  ['P3', '2030-01-02T11:00:00Z'],
  ['P4', '2030-01-02T13:00:00Z'],
  ['P5', '2030-01-03T00:00:00Z'],
  ['P6', '2030-01-04T00:00:00Z'],
  ['P7', '2030-01-05T00:00:00Z'],
  ['P8', '2030-01-07T00:00:00Z'],
  ['P9', '2030-03-30T12:00:00Z'],
  ['P10', '2030-04-01T00:00:00Z'],
  ['P11', '2030-04-02T00:00:00Z'],
  ['P12', '2030-04-03T00:00:00Z'],
].map(([p, t]) => [p, Date.parse(t)]);

const ACTIVE_RULES = {
  P1: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P2: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P3: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2'],
  P4: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1'],
  P5: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P6: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P7: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1'],
  P8: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1', 'quota@1'],
  P9: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1'],
  P10: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1', 'history@1'],
  P11: ['reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1'],
  P12: ['reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1', 'transfer@1'],
};

// Regle precedente qui reste en vigueur quand la regle privee la remplacait.
const REGLE_PRECEDENTE = {
  'priority@1': 'fifo@1',
  'cancel@3': 'cancel@2',
  'cancel@4': 'cancel@3',
  'fifo@2': 'priority@1',
};

// acceptance/T66.spec.ts (ADDITIF) : BENCH_DROP_RULE accepte une LISTE separee
// par des virgules ; une valeur sans virgule (seul usage de T68) se comporte
// exactement comme avant.
const DROP_RULES = DROP_RULE.split(',').map((r) => r.trim()).filter((r) => r !== '');

function reglesEnVigueur(periode) {
  const base = ACTIVE_RULES[periode];
  if (DROP_RULES.length === 0 || !base.some((r) => DROP_RULES.includes(r))) return base;
  const out = [];
  for (const r of base) {
    if (!DROP_RULES.includes(r)) out.push(r);
    else if (REGLE_PRECEDENTE[r] !== undefined) out.push(REGLE_PRECEDENTE[r]);
  }
  return out;
}

const TIME_ZONE = 'Europe/Paris'; // ADR-019 point 2 : tous les locataires
const HOUR_MS = 3_600_000;
const QUOTA_MAX_CONFIRMED = 2;

/* ─────────────────────────────────────────────────────────────── etat */

function etatInitial() {
  return {
    clock: null,
    seq: 0,
    tenants: {}, // tid -> { levels, balances, idem:{opkey:{args,response}} }
    slots: {}, // `${owner}\u0000${slot_id}` -> { owner, slot_id, capacity, price, start, ordering, queue, pinned, rids }
    reservations: {}, // rid -> { rid, slotKey, slot_id, actor, tenant, seq, status, paid, history }
    tombstones: {}, // `${tid}\u0000${key}\u0000${slot_id}` -> true
    historyMigrated: false,
    nextRid: 1,
  };
}

function chargerEtat() {
  if (!existsSync(STATE_PATH)) return etatInitial();
  try {
    return { ...etatInitial(), ...JSON.parse(readFileSync(STATE_PATH, 'utf8')) };
  } catch {
    return etatInitial();
  }
}

function sauverEtat() {
  const tmp = `${STATE_PATH}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(etat));
  renameSync(tmp, STATE_PATH);
}

const etat = chargerEtat();

/* ─────────────────────────────────────────────────────────── utilitaires */

function periodeCourante() {
  if (etat.clock === null) return 'P1';
  let p = 'P1';
  for (const [nom, t] of PERIOD_CLOCKS) if (etat.clock >= t) p = nom;
  return p;
}
const actif = (regle) => reglesEnVigueur(periodeCourante()).includes(regle);
const maintenant = () => (etat.clock === null ? PERIOD_CLOCKS[0][1] : etat.clock);
const iso = (ms) => new Date(ms).toISOString();

function canonique(v) {
  if (Array.isArray(v)) return v.map(canonique);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonique(v[k]);
    return out;
  }
  return v;
}

function decalage(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const g = (t) => Number(parts.find((x) => x.type === t).value);
  const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return local - Math.floor(ms / 1000) * 1000;
}

function jourLocal(ms) {
  const d = new Date(ms + decalage(ms));
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

function instantLocal(y, m, d, hh) {
  const naif = Date.UTC(y, m, d, hh, 0, 0, 0);
  let t = naif - decalage(naif);
  t = naif - decalage(t);
  return t;
}

function echeanceCancel4(startMs) {
  const [y, m, d] = jourLocal(startMs);
  return instantLocal(y, m, d - 1, 18);
}

/* ─────────────────────────────────────────────────────────── modele */

class Refus extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const tenant = (tid) => etat.tenants[tid];
const cleCreneau = (tid, slotId) => `${tid}\u0000${slotId}`;

function exigerLocataire(tid) {
  if (typeof tid !== 'string' || tenant(tid) === undefined) throw new Refus('NOT_FOUND', 'introuvable');
  return tenant(tid);
}

function exigerCreneau(tid, slotId) {
  const s = etat.slots[cleCreneau(tid, slotId)];
  if (s === undefined) throw new Refus('NOT_FOUND', 'introuvable');
  return s;
}

function niveau(tid, actor) {
  return tenant(tid)?.levels?.[actor] ?? 'standard';
}

const reservationsDuCreneau = (slot) => slot.rids.map((r) => etat.reservations[r]);
const confirmees = (slot) => reservationsDuCreneau(slot).filter((r) => r.status === 'confirmed');

function regleOrdre() {
  if (actif('priority@1')) return 'priority@1';
  if (actif('fifo@2')) return 'fifo@2';
  return 'fifo@1';
}

function cleOrdre(r) {
  const gold = regleOrdre() === 'priority@1' && niveau(r.levelTenant, r.actor) === 'gold' ? 0 : 1;
  return [gold, r.seq];
}
function compare(a, b) {
  const ka = cleOrdre(a);
  const kb = cleOrdre(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || a.rid - b.rid;
}

/** Tri complet (point 8 : une reordonnance imposee leve l'epinglage). */
function trierToutLaFile(slot) {
  const file = slot.queue.map((r) => etat.reservations[r]);
  file.sort(compare);
  slot.queue = file.map((r) => r.rid);
  slot.pinned = 0;
}

/** Tri de la partie non epinglee seulement. */
function trierHorsEpingles(slot) {
  const tete = slot.queue.slice(0, slot.pinned);
  const reste = slot.queue.slice(slot.pinned).map((r) => etat.reservations[r]);
  reste.sort(compare);
  slot.queue = [...tete, ...reste.map((r) => r.rid)];
}

/** Changement de regle d'ordre (P6 : -> priority@1 ; P11 : -> fifo@2). */
function normaliserFile(slot) {
  const regle = regleOrdre();
  if (slot.ordering === regle) return;
  if (regle === 'fifo@2') trierToutLaFile(slot); // point 8 : passage a fifo@2
  else trierHorsEpingles(slot);
  slot.ordering = regle;
}

function retirerDeFile(slot, rid) {
  const i = slot.queue.indexOf(rid);
  if (i < 0) return;
  slot.queue.splice(i, 1);
  if (i < slot.pinned) slot.pinned -= 1;
}

function evenement(r, type) {
  if (!etat.historyMigrated) return;
  r.history.push({ type, status: r.status, at: iso(maintenant()) });
}

function migrerHistorique() {
  if (etat.historyMigrated) return;
  if (!actif('history@1')) return;
  for (const r of Object.values(etat.reservations)) {
    r.history = [{ type: 'migrated', status: r.status, at: iso(maintenant()) }];
  }
  etat.historyMigrated = true;
}

function confirmer(r, slot, motif) {
  r.status = 'confirmed';
  if (actif('price@1') && slot.price > 0) {
    const t = tenant(r.tenant);
    t.balances[r.actor] = (t.balances[r.actor] ?? 0) - slot.price;
    r.paid = (r.paid ?? 0) + slot.price;
  }
  evenement(r, motif);
}

function confirmeesDeLActeur(tid, actor) {
  return Object.values(etat.reservations).filter(
    (r) => r.tenant === tid && r.actor === actor && r.status === 'confirmed',
  ).length;
}

/** Promeut, dans l'ordre de la file, tant qu'il reste de la place (point 5). */
function promouvoir(slot) {
  normaliserFile(slot);
  let i = 0;
  while (confirmees(slot).length < slot.capacity && i < slot.queue.length) {
    const r = etat.reservations[slot.queue[i]];
    if (actif('quota@1') && confirmeesDeLActeur(r.tenant, r.actor) >= QUOTA_MAX_CONFIRMED) {
      i += 1;
      continue;
    }
    retirerDeFile(slot, r.rid);
    confirmer(r, slot, 'promoted');
  }
}

/** capacity@1 : retrograde les confirmes les plus recents en tete de file, epingles. */
function retrograder(slot) {
  const conf = confirmees(slot).sort((a, b) => b.seq - a.seq || b.rid - a.rid);
  const retro = [];
  while (conf.length > slot.capacity) {
    const r = conf.shift();
    r.status = 'waiting';
    evenement(r, 'demoted');
    retro.push(r);
  }
  retro.sort((a, b) => a.seq - b.seq || a.rid - b.rid);
  slot.queue = [...retro.map((r) => r.rid), ...slot.queue];
  slot.pinned += retro.length;
}

function insererEnFile(slot, r) {
  normaliserFile(slot);
  let i = slot.pinned;
  while (i < slot.queue.length && compare(etat.reservations[slot.queue[i]], r) <= 0) i += 1;
  slot.queue.splice(i, 0, r.rid);
}

function positionEnFile(r) {
  const slot = etat.slots[r.slotKey];
  normaliserFile(slot);
  return slot.queue.indexOf(r.rid) + 1;
}

/** Point 1 : designation par (tenant_id, key, slot_id). */
function trouverReservation(tid, key, slotId) {
  const cands = Object.values(etat.reservations).filter(
    (r) => r.tenant === tid && r.actor === key && r.slot_id === slotId,
  );
  if (cands.length === 0) return null;
  const vivantes = cands.filter((r) => r.status !== 'cancelled');
  const pool = vivantes.length > 0 ? vivantes : cands;
  pool.sort((a, b) => b.seq - a.seq || b.rid - a.rid);
  return pool[0];
}

const cleTombe = (tid, key, slotId) => `${tid}\u0000${key}\u0000${slotId}`;

/** Reservation absente : valeur nulle si le locataire « connait » ce triplet, sinon NOT_FOUND. */
function absenceVisible(tid, key, slotId) {
  return etat.tombstones[cleTombe(tid, key, slotId)] === true || etat.slots[cleCreneau(tid, slotId)] !== undefined;
}

/** Points 3, 4, 6 : { verdict: 'accepted'|'refused'|'too_late', refund }. */
function evaluerAnnulation(r) {
  const slot = etat.slots[r.slotKey];
  const now = maintenant();
  const paid = r.paid ?? 0;
  if (actif('cancel@1')) return { verdict: 'accepted', refund: paid };
  if (slot.start === null) return { verdict: 'accepted', refund: paid };
  if (now >= slot.start) return { verdict: 'too_late', refund: 0 };
  if (actif('cancel@2')) {
    return now <= slot.start - 24 * HOUR_MS ? { verdict: 'accepted', refund: paid } : { verdict: 'refused', refund: 0 };
  }
  if (actif('cancel@3')) {
    const avant = slot.start - now;
    let refund = 0;
    if (avant >= 48 * HOUR_MS) refund = paid;
    else if (avant >= 24 * HOUR_MS) refund = Math.floor(paid / 2);
    return { verdict: 'accepted', refund };
  }
  if (actif('cancel@4')) {
    return { verdict: 'accepted', refund: now <= echeanceCancel4(slot.start) ? paid : 0 };
  }
  return { verdict: 'accepted', refund: paid };
}

/* ─────────────────────────────────────────────────────────── operations */

function opCreateSlot(args) {
  const { tenant_id: tid, slot_id: slotId, start, capacity, price } = args;
  exigerLocataire(tid);
  if (typeof slotId !== 'string' || slotId.length === 0) throw new Refus('INVALID_ARGUMENT', 'slot_id');
  if (!Number.isInteger(capacity) || capacity < 0) throw new Refus('INVALID_ARGUMENT', 'capacity');
  const prix = price === undefined || price === null ? 0 : price;
  if (!Number.isInteger(prix) || prix < 0) throw new Refus('INVALID_ARGUMENT', 'price');
  let debut = null;
  if (start !== undefined && start !== null) {
    debut = Date.parse(start);
    if (!Number.isFinite(debut)) throw new Refus('INVALID_ARGUMENT', 'start');
  }
  const k = cleCreneau(tid, slotId);
  const existant = etat.slots[k];
  if (existant !== undefined) {
    if (existant.start === debut && existant.capacity === capacity && existant.price === prix) {
      return { decision: 'created' };
    }
    throw new Refus('SLOT_EXISTS', 'creneau deja cree');
  }
  etat.slots[k] = {
    owner: tid,
    slot_id: slotId,
    capacity,
    price: prix,
    start: debut,
    ordering: regleOrdre(),
    queue: [],
    pinned: 0,
    rids: [],
  };
  return { decision: 'created' };
}

function opWrite(args) {
  const { op: sousOp, actor, tenant_id: tid, admission_seq, slot_id: slotId } = args;
  const t = exigerLocataire(tid);
  if (typeof slotId !== 'string') throw new Refus('INVALID_ARGUMENT', 'slot_id');

  // idempotence@1
  const opKey = typeof args.operation_key === 'string' ? args.operation_key : null;
  const signature = JSON.stringify(canonique(args));
  t.idem = t.idem ?? {};
  if (opKey !== null && t.idem[opKey]?.signature === signature) return t.idem[opKey].response;

  let response;
  if (sousOp === 'reserve') {
    const slot = exigerCreneau(tid, slotId);
    normaliserFile(slot);
    const existante = reservationsDuCreneau(slot).find(
      (r) => r.tenant === tid && r.actor === actor && r.status !== 'cancelled',
    );
    if (existante !== undefined) {
      response = { decision: existante.status };
    } else {
      if (actif('quota@1') && confirmeesDeLActeur(tid, actor) >= QUOTA_MAX_CONFIRMED) {
        throw new Refus('QUOTA_EXCEEDED', 'quota depasse');
      }
      const seq = Number.isFinite(admission_seq) ? admission_seq : etat.seq + 1;
      etat.seq = Math.max(etat.seq, seq);
      const r = {
        rid: etat.nextRid++,
        slotKey: cleCreneau(tid, slotId),
        slot_id: slotId,
        actor,
        tenant: tid,
        levelTenant: tid,
        seq,
        status: 'waiting',
        paid: 0,
        history: [],
      };
      etat.reservations[r.rid] = r;
      slot.rids.push(r.rid);
      if (slot.queue.length === 0 && confirmees(slot).length < slot.capacity) {
        confirmer(r, slot, 'reserved');
      } else {
        insererEnFile(slot, r);
        evenement(r, 'reserved');
        promouvoir(slot);
      }
      response = { decision: r.status };
    }
  } else if (sousOp === 'cancel') {
    const r = trouverReservation(tid, actor, slotId);
    if (r === null) throw new Refus('NOT_FOUND', 'introuvable');
    const slot = etat.slots[r.slotKey];
    if (r.status === 'cancelled') {
      response = { decision: 'cancelled', refund: 0 };
    } else {
      const { verdict, refund } = evaluerAnnulation(r);
      if (verdict === 'too_late') throw new Refus('CANCELLATION_TOO_LATE', 'annulation a partir du debut du creneau');
      if (verdict === 'refused') {
        response = { decision: 'refused' };
      } else {
        const etaitConfirmee = r.status === 'confirmed';
        normaliserFile(slot);
        retirerDeFile(slot, r.rid);
        r.status = 'cancelled';
        if (refund > 0) {
          const tr = tenant(r.tenant);
          tr.balances[r.actor] = (tr.balances[r.actor] ?? 0) + refund;
        }
        r.refund = refund;
        evenement(r, 'cancelled');
        if (etaitConfirmee) promouvoir(slot);
        response = { decision: 'cancelled', refund };
      }
    }
  } else {
    throw new Refus('UNKNOWN_SUB_OP', String(sousOp));
  }

  if (opKey !== null) t.idem[opKey] = { signature, response };
  return response;
}

function valeurDe(r) {
  const v = { status: r.status, slot_id: r.slot_id };
  if (r.status === 'waiting') v.waiting_position = positionEnFile(r);
  return v;
}

function opRead(args) {
  const { tenant_id: tid, key, slot_id: slotId } = args;
  exigerLocataire(tid);
  const r = trouverReservation(tid, key, slotId);
  if (r !== null) return { value: valeurDe(r) };
  if (absenceVisible(tid, key, slotId)) return { value: null };
  throw new Refus('NOT_FOUND', 'introuvable');
}

function opProbeCancel(args) {
  const { tenant_id: tid, key, slot_id: slotId } = args;
  exigerLocataire(tid);
  const r = trouverReservation(tid, key, slotId);
  if (r === null) {
    if (absenceVisible(tid, key, slotId)) return { decision: 'refused' };
    throw new Refus('NOT_FOUND', 'introuvable');
  }
  if (r.status === 'cancelled') return { decision: 'refused' };
  const { verdict, refund } = evaluerAnnulation(r); // SANS mutation
  if (verdict === 'too_late') throw new Refus('CANCELLATION_TOO_LATE', 'annulation a partir du debut du creneau');
  return verdict === 'accepted' ? { decision: 'accepted', refund } : { decision: 'refused' };
}

function opSetCapacity(args) {
  const { tenant_id: tid, slot_id: slotId, capacity } = args;
  exigerLocataire(tid);
  const slot = exigerCreneau(tid, slotId);
  if (!actif('capacity@1')) return { decision: 'refused' };
  if (!Number.isInteger(capacity) || capacity < 0) throw new Refus('INVALID_ARGUMENT', 'capacite invalide');
  normaliserFile(slot);
  slot.capacity = capacity;
  if (confirmees(slot).length > capacity) retrograder(slot);
  else promouvoir(slot);
  return { decision: 'confirmed' };
}

function opSetLevel(args) {
  const { tenant_id: tid, actor, level } = args;
  const t = exigerLocataire(tid);
  if (level !== 'gold' && level !== 'standard') throw new Refus('INVALID_ARGUMENT', 'niveau invalide');
  t.levels[actor] = level;
  // priority@1 : reordonnance immediate de toutes les files (point 8 : leve l'epinglage).
  if (actif('priority@1')) {
    for (const s of Object.values(etat.slots)) {
      trierToutLaFile(s);
      s.ordering = regleOrdre();
    }
  }
  return { decision: 'confirmed' };
}

function opBalance(args) {
  const { tenant_id: tid, actor } = args;
  const t = exigerLocataire(tid);
  return { balance: t.balances[actor] ?? 0 };
}

function opHistory(args) {
  const { tenant_id: tid, key, slot_id: slotId } = args;
  exigerLocataire(tid);
  const r = trouverReservation(tid, key, slotId);
  if (r === null) {
    if (absenceVisible(tid, key, slotId)) return { events: [] };
    throw new Refus('NOT_FOUND', 'introuvable');
  }
  if (!actif('history@1') && !etat.historyMigrated) return { events: [] };
  return { events: r.history.map((e) => ({ type: e.type, status: e.status, at: e.at })) };
}

function opTransfer(args) {
  const { tenant_id: tid, key, slot_id: slotId, to_tenant_id: dest } = args;
  exigerLocataire(tid);
  const r = trouverReservation(tid, key, slotId);
  if (r === null) throw new Refus('NOT_FOUND', 'introuvable');
  if (!actif('transfer@1')) return { decision: 'refused' };
  if (typeof dest !== 'string' || tenant(dest) === undefined) throw new Refus('NOT_FOUND', 'introuvable');
  if (dest === tid) return { decision: 'refused' };
  etat.tombstones[cleTombe(tid, key, slotId)] = true;
  r.tenant = dest;
  evenement(r, 'transferred');
  return { decision: 'transferred' };
}

function empreinte() {
  const metier = {
    slots: etat.slots,
    reservations: Object.values(etat.reservations).map((r) => ({
      slot: r.slotKey,
      actor: r.actor,
      tenant: r.tenant,
      seq: r.seq,
      status: r.status,
    })),
    balances: Object.fromEntries(Object.entries(etat.tenants).map(([k, v]) => [k, v.balances])),
  };
  return createHash('sha256').update(JSON.stringify(canonique(metier)), 'utf8').digest('hex');
}

/* ─────────────────────────────────────────────────────────── boucle NDJSON */

function ecrireLigne(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function journaliser(op) {
  if (TRAFFIC_LOG === '') return;
  try {
    appendFileSync(TRAFFIC_LOG, `${JSON.stringify({ pid: process.pid, data_dir: DATA_DIR, op })}\n`);
  } catch {
    /* journal illisible : le cas de T68.A3 echouera, faute de trafic observe */
  }
}

const MUTANTES = new Set([
  'create_tenant',
  'advance_clock',
  'create_slot',
  'write',
  'set_capacity',
  'set_level',
  'transfer',
]);

function traiter(op, args) {
  switch (op) {
    case 'create_tenant': {
      const tid = args.tenant_id;
      if (typeof tid !== 'string' || tid.length === 0) throw new Refus('INVALID_ARGUMENT', 'tenant_id');
      etat.tenants[tid] = etat.tenants[tid] ?? { levels: {}, balances: {}, idem: {} };
      return {};
    }
    case 'advance_clock': {
      const t = Date.parse(args.to);
      if (!Number.isFinite(t)) throw new Refus('INVALID_ARGUMENT', 'to');
      etat.clock = t;
      migrerHistorique();
      return {};
    }
    case 'create_slot':
      return opCreateSlot(args);
    case 'write':
      return opWrite(args);
    case 'read':
      return opRead(args);
    case 'probe_cancel':
      return opProbeCancel(args);
    case 'fingerprint':
      return { sha256: empreinte() };
    case 'set_capacity':
      return opSetCapacity(args);
    case 'set_level':
      return opSetLevel(args);
    case 'balance':
      return opBalance(args);
    case 'history':
      return opHistory(args);
    case 'transfer':
      return opTransfer(args);
    default:
      throw new Refus('UNKNOWN_OP', String(op));
  }
}

ecrireLigne({ ready: true, protocol: PROTOCOL });

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (ligne) => {
  let req;
  try {
    req = JSON.parse(ligne);
  } catch {
    return;
  }
  const { id, op } = req;
  const args = req.args ?? {};
  journaliser(op);
  migrerHistorique();
  try {
    const result = traiter(op, args);
    if (MUTANTES.has(op)) sauverEtat();
    ecrireLigne({ id, ok: true, result });
  } catch (e) {
    if (e instanceof Refus) {
      ecrireLigne({ id, ok: false, error: { code: e.code, message: e.message } });
    } else {
      ecrireLigne({ id, ok: false, error: { code: 'INTERNAL', message: String(e?.message ?? e) } });
    }
  }
});

rl.on('close', () => process.exit(0));
