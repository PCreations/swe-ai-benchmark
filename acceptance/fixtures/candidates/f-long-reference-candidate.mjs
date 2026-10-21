#!/usr/bin/env node
// acceptance/fixtures/candidates/f-long-reference-candidate.mjs — zone ACCEPTANCE.
//
// CANDIDAT DE REFERENCE FIDELE A F-LONG (ADR-018, section « Le scenario
// `F-LONG` », P1 a P12), parlant `bench.candidate/3`. Ce programme n'est PAS
// une source de T64 ni de T66 (packages/activities, packages/scenario) : c'est
// un temoin ecrit par le test-author, au meme titre que
// reservation-candidate-v2.mjs (T51), t63-persistent-kv-candidate.mjs (T63) ou
// t64-naive-single-case-candidate.mjs (T64). Il est utilise par
// acceptance/T64.spec.ts (T64.A3, volet « candidat fidele : score 1 ») et
// destine a etre reutilise par T66 (T66.A1 : « un candidat de reference qui
// implemente F-LONG obtient un score de 1 sur chaque regle active a chaque
// periode »).
//
// ─────────────────────────────────────────────────────────── PROTOCOLE
// NDJSON `{id,op,args}` -> `{id,ok:true,result}` | `{id,ok:false,error:{code,
// message}}`, probe de demarrage `{ready:true,protocol:"bench.candidate/3"}`
// (acceptance/T48.spec.ts III.2, acceptance/T62.spec.ts II.1). Les onze
// operations et leurs arguments sont ceux de la description publique exportee
// par @bench/activities (CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG.operations) :
//
//   create_tenant {tenant_id}                                       -> {}
//   advance_clock {to}                                              -> {}
//   write         {op,actor,tenant_id,admission_seq,operation_key}  -> {decision}
//   read          {tenant_id,key}                                   -> {value}
//   probe_cancel  {tenant_id,key}                                   -> {decision}
//   fingerprint   {}                                                -> {sha256}
//   set_capacity  {tenant_id,slot_id,capacity}                      -> {decision}
//   set_level     {tenant_id,actor,level}                           -> {decision}
//   balance       {tenant_id,actor}                                 -> {balance}
//   history       {tenant_id,key}                                   -> {events}
//   transfer      {tenant_id,key,to_tenant_id}                      -> {decision}
//
// POINTS QUE LE CONTRAT PUBLIC NE FIXE PAS (signales au rapport, jamais
// presentes comme des faits d'ADR-018) et choix de ce temoin :
//   (a) `write` ne porte aucun identifiant de creneau. Ce temoin lit le
//       creneau dans `args.slot_id` s'il est fourni, sinon dans
//       `args.operation_key` (forme qu'emploie le notateur de T64), sinon
//       `S1` (creneau unique de F-RESERVATION).
//   (b) `read`/`history`/`probe_cancel`/`transfer` designent une reservation
//       par `key` = l'acteur (exemples publics de P12). Le creneau est lu dans
//       `args.slot_id` s'il est fourni ; sinon la reservation la plus recente
//       (sequence d'admission la plus haute) non annulee de l'acteur dans ce
//       locataire, a defaut la plus recente tout court.
//   (c) Les creneaux du scenario (S1 a S8) portent les debuts, capacites et
//       prix d'ADR-018 / F-RESERVATION ; tout autre creneau est cree a sa
//       premiere reservation avec capacite 1, prix 0 et sans debut connu.
//
// ─────────────────────────────────────────────────────────── REGLES
// La periode courante se deduit de l'horloge (`advance_clock`) et des
// horloges de periode d'ADR-018 (L81-L84) ; horloge absente = P1.
//   reserve@1      admission sur un creneau : confirme si une place est libre,
//                  sinon en attente.
//   idempotence@1  rejouer la meme `operation_key` avec les MEMES arguments
//                  renvoie la meme reponse, sans doublon ni nouvel effet.
//   fifo@1/fifo@2  file ordonnee par sequence d'admission (P1-P5 ; P11-P12,
//                  les niveaux n'ont plus d'effet).
//   priority@1     (P6-P10) file ordonnee par niveau (`gold` d'abord) puis par
//                  sequence ; un changement de niveau reordonne immediatement.
//   cancel@1       (P1-P2) annulation sans restriction.
//   cancel@2       (P3-P6) annulation permise jusqu'a 24 h avant le debut,
//                  frontiere incluse ; refus metier au-dela.
//   cancel@3       (P7-P8) annulation permise jusqu'au debut ; remboursement
//                  100 % a >= 48 h, 50 % arrondi au centime inferieur entre
//                  24 h et 48 h, 0 % a < 24 h.
//   cancel@4       (P9-P12) remboursement integral si l'annulation a lieu au
//                  plus tard a 18:00 heure locale (Europe/Paris) la veille du
//                  jour local du creneau, nul sinon.
//   isolation@1    (P4+) un locataire ne lit ni ne modifie les donnees d'un
//                  autre : NOT_FOUND sans donnee divulguee.
//   capacity@1     (P5+) augmenter la capacite promeut les attentes dans
//                  l'ordre de la file ; la reduire sous le nombre de confirmes
//                  retrograde les confirmes les plus recents (sequence
//                  decroissante) en tete de la file d'attente.
//   price@1        (P7+) toute confirmation intervenue a partir de P7 debite
//                  le prix du creneau du solde de l'acteur (initialement 0).
//   quota@1        (P8-P10) au plus deux reservations confirmees par acteur et
//                  par locataire ; au-dela : erreur QUOTA_EXCEEDED, sans
//                  attente ni debit ; les depassements anterieurs sont
//                  conserves.
//   history@1      (P10+) historique ordonne ; chaque reservation existant a
//                  l'entree de P10 commence par un unique evenement
//                  `migrated` portant son statut courant.
//   transfer@1     (P12) transfert d'une reservation du locataire d'origine
//                  vers un autre ; ensuite lisible seulement depuis la
//                  destination (origine : valeur nulle ; tiers : NOT_FOUND).
//
// ETAT PERSISTANT : `${BENCH_DATA_DIR}/state.json` (ADR-018 L46-L49), relu a
// chaque demarrage, reecrit atomiquement apres chaque operation mutante —
// meme discipline que t63-persistent-kv-candidate.mjs.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
import * as path from 'node:path';

const PROTOCOL = 'bench.candidate/3';

const DATA_DIR = process.env.BENCH_DATA_DIR ?? '.';
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  /* deja present, ou impossible : chargerEtat() retombera sur un etat vide */
}
const STATE_PATH = path.join(DATA_DIR, 'state.json');

/* ─────────────────────────────── horloges et regles par periode (ADR-018) */

// ADR-018 L81-L84 (acceptance/reference-long/F-LONG.json valeurs.horloges_des_periodes).
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

// ADR-018 L86-L155 — ensembles de regles actives (meme table que REGLES_ADR
// d'acceptance/T61.spec.ts, section V).
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

// F-RESERVATION (S1, cahier L119) et ADR-018 L91-L145 (S2 a S8). Un champ
// absent de l'ADR (prix de S1/S2/S8, debut de S8) prend la valeur neutre.
const SLOT_CATALOGUE = {
  S1: { capacity: 1, price: 0, start: '2030-01-03T12:00:00Z' },
  S2: { capacity: 1, price: 0, start: '2030-01-10T12:00:00Z' },
  S3: { capacity: 1, price: 1999, start: '2030-01-06T12:00:00Z' },
  S4: { capacity: 5, price: 0, start: '2030-01-20T12:00:00Z' },
  S5: { capacity: 5, price: 0, start: '2030-01-20T12:00:00Z' },
  S6: { capacity: 5, price: 0, start: '2030-01-20T12:00:00Z' },
  S7: { capacity: 1, price: 3000, start: '2030-03-31T10:00:00Z' },
  S8: { capacity: 1, price: 0, start: null },
};

const TIME_ZONE = 'Europe/Paris'; // ADR-018 L126
const HOUR_MS = 3_600_000;
const QUOTA_MAX_CONFIRMED = 2; // ADR-018 L118-L119

/* ─────────────────────────────────────────────────────────────── etat */

function etatInitial() {
  return {
    clock: null, // ms epoch, ou null
    seq: 0, // compteur de secours si admission_seq est absent
    tenants: {}, // tenant_id -> { levels:{actor:level}, balances:{actor:int}, idem:{json:{version,response}} }
    slots: {}, // slot_id -> { owner, capacity, price, start, ordering, reservations:[...] , queue:[rid] }
    reservations: {}, // rid -> { rid, slot, actor, tenant, seq, status, paid, history:[...] , version }
    tombstones: {}, // `${tenant}\u0000${actor}` -> [rid] (reservations transferees hors de ce locataire)
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
const actif = (regle) => ACTIVE_RULES[periodeCourante()].includes(regle);
const indexPeriode = (p) => PERIOD_CLOCKS.findIndex(([n]) => n === p);
const maintenant = () => (etat.clock === null ? PERIOD_CLOCKS[0][1] : etat.clock);

function canonique(v) {
  if (Array.isArray(v)) return v.map(canonique);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonique(v[k]);
    return out;
  }
  return v;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

/** Decalage (ms) de TIME_ZONE par rapport a UTC a l'instant `ms`. */
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

/** Jour local (annee, mois 0-11, jour) de `ms` dans TIME_ZONE. */
function jourLocal(ms) {
  const d = new Date(ms + decalage(ms));
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

/** Instant UTC de `hh:00` heure locale, le jour local (y, m, d). */
function instantLocal(y, m, d, hh) {
  const naif = Date.UTC(y, m, d, hh, 0, 0, 0);
  let t = naif - decalage(naif);
  t = naif - decalage(t);
  return t;
}

/** cancel@4 : 18:00 heure locale la veille du jour local du debut du creneau. */
function echeanceCancel4(startMs) {
  const [y, m, d] = jourLocal(startMs);
  return instantLocal(y, m, d - 1, 18);
}

/* ─────────────────────────────────────────────────────────── modele */

function tenant(tid) {
  return etat.tenants[tid];
}

function niveau(tid, actor) {
  return tenant(tid)?.levels?.[actor] ?? 'standard';
}

function creerCreneau(slotId, owner) {
  const cat = SLOT_CATALOGUE[slotId] ?? { capacity: 1, price: 0, start: null };
  etat.slots[slotId] = {
    owner,
    capacity: cat.capacity,
    price: cat.price,
    start: cat.start === null ? null : Date.parse(cat.start),
    ordering: null,
    queue: [],
    rids: [],
  };
  return etat.slots[slotId];
}

function reservationsDuCreneau(slot) {
  return slot.rids.map((r) => etat.reservations[r]);
}
function confirmees(slot) {
  return reservationsDuCreneau(slot).filter((r) => r.status === 'confirmed');
}

function regleOrdre() {
  return actif('priority@1') ? 'priority@1' : actif('fifo@2') ? 'fifo@2' : 'fifo@1';
}

function cleOrdre(r) {
  const gold = regleOrdre() === 'priority@1' && niveau(r.levelTenant ?? r.tenant, r.actor) === 'gold' ? 0 : 1;
  return [gold, r.seq];
}
function compare(a, b) {
  const ka = cleOrdre(a);
  const kb = cleOrdre(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

/** Retrie la file selon la regle d'ordre active (fifo@1/priority@1/fifo@2). */
function trierFile(slot) {
  const file = slot.queue.map((r) => etat.reservations[r]);
  file.sort(compare);
  slot.queue = file.map((r) => r.rid);
  slot.ordering = regleOrdre();
}

/** A chaque changement de regle d'ordre (P6, P11), les files sont reordonnees. */
function normaliserFile(slot) {
  if (slot.ordering !== regleOrdre()) trierFile(slot);
}

function evenement(r, type, extra = {}) {
  if (!etat.historyMigrated) return;
  r.history.push({ type, event: type, status: r.status, at: iso(maintenant()), ...extra });
}

/** history@1 : a l'entree de P10, chaque reservation existante commence par un unique `migrated`. */
function migrerHistorique() {
  if (etat.historyMigrated) return;
  if (indexPeriode(periodeCourante()) < indexPeriode('P10')) return;
  for (const r of Object.values(etat.reservations)) {
    r.history = [{ type: 'migrated', event: 'migrated', status: r.status, at: iso(maintenant()) }];
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

/** Promeut les attentes, dans l'ordre de la file, tant qu'il reste de la place. */
function promouvoir(slot) {
  normaliserFile(slot);
  let i = 0;
  while (confirmees(slot).length < slot.capacity && i < slot.queue.length) {
    const r = etat.reservations[slot.queue[i]];
    if (actif('quota@1') && confirmeesDeLActeur(r.tenant, r.actor) >= QUOTA_MAX_CONFIRMED) {
      i += 1; // quota@1 : l'acteur ne peut detenir plus de deux confirmees
      continue;
    }
    slot.queue.splice(i, 1);
    confirmer(r, slot, 'promoted');
  }
}

/** capacity@1 : retrograde les confirmes les plus recents, en tete de file. */
function retrograder(slot) {
  const conf = confirmees(slot).sort((a, b) => b.seq - a.seq);
  const retro = [];
  while (conf.length > slot.capacity) {
    const r = conf.shift();
    r.status = 'waiting';
    evenement(r, 'demoted');
    retro.push(r);
  }
  retro.sort((a, b) => a.seq - b.seq);
  slot.queue = [...retro.map((r) => r.rid), ...slot.queue];
}

function insererEnFile(slot, r) {
  normaliserFile(slot);
  const file = slot.queue.map((x) => etat.reservations[x]);
  let i = file.findIndex((x) => compare(r, x) < 0);
  if (i === -1) i = file.length;
  slot.queue.splice(i, 0, r.rid);
}

function positionEnFile(r) {
  const slot = etat.slots[r.slot];
  normaliserFile(slot);
  return slot.queue.indexOf(r.rid) + 1;
}

/** Reservation designee par (tenant, key=acteur[, slot_id]) — note (b) de l'en-tete. */
function trouverReservation(tid, actor, slotId) {
  const candidates = Object.values(etat.reservations).filter(
    (r) => r.tenant === tid && r.actor === actor && (slotId === undefined || r.slot === slotId),
  );
  if (candidates.length === 0) return null;
  const vivantes = candidates.filter((r) => r.status !== 'cancelled');
  const pool = vivantes.length > 0 ? vivantes : candidates;
  pool.sort((a, b) => b.seq - a.seq || b.rid - a.rid);
  return pool[0];
}

function aUneTrace(tid, actor) {
  return (etat.tombstones[`${tid}\u0000${actor}`] ?? []).length > 0;
}

/** Le locataire voit-il un creneau ? (isolation@1) */
function locataireVoitQuelqueChose(tid, slotId) {
  if (slotId !== undefined) return etat.slots[slotId]?.owner === tid;
  return Object.values(etat.slots).some((s) => s.owner === tid);
}

/** Regle d'annulation active : { permise, remboursement } a l'instant courant. */
function evaluerAnnulation(r) {
  const slot = etat.slots[r.slot];
  const now = maintenant();
  const paid = r.paid ?? 0;
  if (actif('cancel@1')) return { permise: true, refund: paid };
  if (slot.start === null) return { permise: true, refund: paid };
  if (actif('cancel@2')) {
    const permise = now <= slot.start - 24 * HOUR_MS;
    return { permise, refund: permise ? paid : 0 };
  }
  if (now > slot.start) return { permise: false, refund: 0 };
  if (actif('cancel@3')) {
    const avant = slot.start - now;
    let refund = 0;
    if (avant >= 48 * HOUR_MS) refund = paid;
    else if (avant >= 24 * HOUR_MS) refund = Math.floor(paid / 2);
    return { permise: true, refund };
  }
  // cancel@4
  return { permise: true, refund: now <= echeanceCancel4(slot.start) ? paid : 0 };
}

/* ─────────────────────────────────────────────────────────── operations */

class Refus extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function exigerLocataire(tid) {
  if (typeof tid !== 'string' || tenant(tid) === undefined) throw new Refus('NOT_FOUND', 'introuvable');
  return tenant(tid);
}

function opWrite(args) {
  const { op: sousOp, actor, tenant_id: tid, admission_seq } = args;
  const slotId = args.slot_id ?? args.slot ?? args.operation_key ?? 'S1';
  const t = exigerLocataire(tid);

  // idempotence@1 : meme cle, memes arguments -> meme reponse, sans effet.
  const idemKey = args.operation_key === undefined ? null : JSON.stringify(canonique(args));
  const versionKey = `${slotId}\u0000${actor}`;
  t.versions = t.versions ?? {};
  if (idemKey !== null) {
    const vu = t.idem?.[idemKey];
    if (vu !== undefined && vu.version === (t.versions[versionKey] ?? 0)) return vu.response;
  }

  let slot = etat.slots[slotId];
  if (slot !== undefined && slot.owner !== tid) {
    // isolation@1 : un creneau d'un autre locataire n'existe pas ici, sauf la
    // reservation transferee vers ce locataire (transfer@1), qu'il peut annuler.
    const transferee = trouverReservation(tid, actor, slotId);
    if (!(sousOp === 'cancel' && transferee !== null)) throw new Refus('NOT_FOUND', 'introuvable');
  }

  let response;
  if (sousOp === 'reserve') {
    if (slot === undefined) slot = creerCreneau(slotId, tid);
    normaliserFile(slot);
    const existante = Object.values(etat.reservations).find(
      (r) => r.slot === slotId && r.tenant === tid && r.actor === actor && r.status !== 'cancelled',
    );
    if (existante !== undefined) {
      response = { decision: existante.status };
    } else {
      if (actif('quota@1') && confirmeesDeLActeur(tid, actor) >= QUOTA_MAX_CONFIRMED) {
        throw new Refus('QUOTA_EXCEEDED', 'quota depasse');
      }
      let seq = Number.isFinite(admission_seq) ? admission_seq : etat.seq + 1;
      etat.seq = Math.max(etat.seq, seq);
      const r = {
        rid: etat.nextRid++,
        slot: slotId,
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
      evenement(r, 'reserved');
      if (slot.queue.length === 0 && confirmees(slot).length < slot.capacity) {
        confirmer(r, slot, 'confirmed');
      } else {
        insererEnFile(slot, r);
        evenement(r, 'waiting');
        promouvoir(slot);
      }
      response = { decision: r.status };
    }
  } else if (sousOp === 'cancel') {
    if (slot === undefined) throw new Refus('NOT_FOUND', 'introuvable');
    const r = trouverReservation(tid, actor, slotId);
    if (r === null) throw new Refus('NOT_FOUND', 'introuvable');
    if (r.status === 'cancelled') {
      response = { decision: 'cancelled', refund: 0 };
    } else {
      const { permise, refund } = evaluerAnnulation(r);
      if (!permise) {
        response = { decision: 'refused' };
      } else {
        const etaitConfirmee = r.status === 'confirmed';
        normaliserFile(slot);
        slot.queue = slot.queue.filter((x) => x !== r.rid);
        r.status = 'cancelled';
        if (refund > 0) {
          const tr = tenant(r.tenant);
          tr.balances[r.actor] = (tr.balances[r.actor] ?? 0) + refund;
        }
        r.refund = refund;
        evenement(r, 'cancelled', { refund });
        if (etaitConfirmee) promouvoir(slot);
        response = { decision: 'cancelled', refund };
      }
    }
  } else {
    throw new Refus('UNKNOWN_SUB_OP', String(sousOp));
  }

  t.versions[versionKey] = (t.versions[versionKey] ?? 0) + 1;
  if (idemKey !== null) {
    t.idem = t.idem ?? {};
    t.idem[idemKey] = { version: t.versions[versionKey], response };
  }
  return response;
}

function valeurDe(r) {
  const v = { status: r.status, slot_id: r.slot };
  if (r.status === 'waiting') v.waiting_position = positionEnFile(r);
  return v;
}

function opRead(args) {
  const { tenant_id: tid, key } = args;
  exigerLocataire(tid);
  const r = trouverReservation(tid, key, args.slot_id);
  if (r !== null) return { value: valeurDe(r) };
  if (aUneTrace(tid, key) || locataireVoitQuelqueChose(tid, args.slot_id)) return { value: null };
  throw new Refus('NOT_FOUND', 'introuvable');
}

function opProbeCancel(args) {
  const { tenant_id: tid, key } = args;
  exigerLocataire(tid);
  const r = trouverReservation(tid, key, args.slot_id);
  if (r === null) {
    if (aUneTrace(tid, key) || locataireVoitQuelqueChose(tid, args.slot_id)) return { decision: 'refused' };
    throw new Refus('NOT_FOUND', 'introuvable');
  }
  if (r.status === 'cancelled') return { decision: 'refused' };
  const { permise, refund } = evaluerAnnulation(r); // SANS mutation
  return permise ? { decision: 'accepted', refund } : { decision: 'refused' };
}

function opSetCapacity(args) {
  const { tenant_id: tid, slot_id: slotId, capacity } = args;
  exigerLocataire(tid);
  if (!actif('capacity@1')) return { decision: 'refused' };
  if (!Number.isInteger(capacity) || capacity < 0) throw new Refus('INVALID_ARGUMENT', 'capacite invalide');
  let slot = etat.slots[slotId];
  if (slot !== undefined && slot.owner !== tid) throw new Refus('NOT_FOUND', 'introuvable');
  if (slot === undefined) slot = creerCreneau(slotId, tid);
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
  // priority@1 : un changement de niveau reordonne immediatement les files.
  if (actif('priority@1')) for (const s of Object.values(etat.slots)) trierFile(s);
  return { decision: 'confirmed' };
}

function opBalance(args) {
  const { tenant_id: tid, actor } = args;
  const t = exigerLocataire(tid);
  return { balance: t.balances[actor] ?? 0 };
}

function opHistory(args) {
  const { tenant_id: tid, key } = args;
  exigerLocataire(tid);
  const r = trouverReservation(tid, key, args.slot_id);
  if (r === null) {
    if (aUneTrace(tid, key) || locataireVoitQuelqueChose(tid, args.slot_id)) return { events: [] };
    throw new Refus('NOT_FOUND', 'introuvable');
  }
  return { events: r.history.map((e) => ({ ...e })) };
}

function opTransfer(args) {
  const { tenant_id: tid, key, to_tenant_id: dest } = args;
  exigerLocataire(tid);
  if (!actif('transfer@1')) return { decision: 'refused' };
  if (typeof dest !== 'string' || tenant(dest) === undefined) throw new Refus('NOT_FOUND', 'introuvable');
  const r = trouverReservation(tid, key, args.slot_id);
  if (r === null) throw new Refus('NOT_FOUND', 'introuvable');
  if (dest === tid) return { decision: 'refused' };
  const cle = `${tid}\u0000${key}`;
  etat.tombstones[cle] = [...(etat.tombstones[cle] ?? []), r.rid];
  r.tenant = dest;
  evenement(r, 'transferred', { from_tenant_id: tid, to_tenant_id: dest });
  return { decision: 'confirmed' };
}

function empreinte() {
  const metier = {
    slots: etat.slots,
    reservations: Object.values(etat.reservations).map((r) => ({
      slot: r.slot,
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

ecrireLigne({ ready: true, protocol: PROTOCOL });

const MUTANTES = new Set(['create_tenant', 'advance_clock', 'write', 'set_capacity', 'set_level', 'transfer']);

function traiter(op, args) {
  switch (op) {
    case 'create_tenant': {
      const tid = args.tenant_id;
      if (typeof tid !== 'string' || tid.length === 0) throw new Refus('INVALID_ARGUMENT', 'tenant_id');
      etat.tenants[tid] = etat.tenants[tid] ?? { levels: {}, balances: {}, idem: {}, versions: {} };
      return {};
    }
    case 'advance_clock': {
      const t = Date.parse(args.to);
      if (!Number.isFinite(t)) throw new Refus('INVALID_ARGUMENT', 'to');
      etat.clock = t;
      migrerHistorique();
      return {};
    }
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
