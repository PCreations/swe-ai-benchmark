#!/usr/bin/env node
// acceptance/fixtures/candidates/reservation-candidate-v2-faulty-isolation-log-reads.mjs
// — zone ACCEPTANCE, publiee par T59 (jamais une source de T59 : packages/
// activities, apps/cli).
//
// COPIE EXACTE de acceptance/fixtures/candidates/reservation-candidate-v2-
// faulty-isolation.mjs (T51, deja ACCEPTEE — voir ce fichier pour le detail
// complet de la faute deliberee et isolee : la garde `estProprietaire` est
// retiree des trois operations qui la portaient), a UNE seule addition, SANS
// EFFET sur aucune reponse protocolaire : un canal d'observation
// ./read-responses.log, une ligne JSON `{"tenant_id":...,"key":...,
// "value":...}` par requete `read` RECUE, juste AVANT `repondre({ value })`.
//
// POURQUOI : T59.A2 doit observer, via le CHEMIN REEL de traduction
// (`candidate-control-period`, jamais une sequence NDJSON construite a la
// main), que la sonde d'isolation REELLEMENT emise fait REELLEMENT fuiter
// une donnee metier (`value.status==='confirmed'`) quand la cle recue est
// celle d'un acteur qui detient effectivement une reservation dans `legacy`
// — jamais `null`, ce qu'elle produirait si la cle recue restait celle de
// l'acteur LECTEUR (docs/adr/ADR-016.md:L19-20), jamais ecrite nulle part.
// Ce canal est la SEULE fenetre sur la valeur REELLEMENT divulguee par la
// traduction REELLE ; une sequence NDJSON construite par la suite ne
// prouverait rien sur CE QUE LA TRADUCTION ENVOIE REELLEMENT.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const STATE_PATH = './state.json';
const LOG_PATH = './ops-received.log';
const READ_RESPONSE_LOG_PATH = './read-responses.log'; // CANAL AJOUTE PAR T59 — jamais protocolaire.

const SLOT_BEGIN = '2030-01-03T12:00:00Z';
const BOUNDARY = '2030-01-02T12:00:00Z';

function etatInitial() {
  return { ownerTenant: null, clock: null, holder: null, queue: [], cancelled: [], seen: {} };
}
function chargerEtat() {
  if (existsSync(STATE_PATH)) {
    try {
      const e = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
      return { ...etatInitial(), ...e };
    } catch {
      return etatInitial();
    }
  }
  return etatInitial();
}
function sauverEtat(etat) {
  writeFileSync(STATE_PATH, JSON.stringify(etat));
}

function canonique(v) {
  if (Array.isArray(v)) return v.map(canonique);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonique(v[k]);
    return out;
  }
  return v;
}
function empreinteDe(etat) {
  return createHash('sha256')
    .update(JSON.stringify(canonique({ owner: etat.ownerTenant, holder: etat.holder, queue: etat.queue, cancelled: etat.cancelled })), 'utf8')
    .digest('hex');
}

const etat = chargerEtat();

function ecrireLigne(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

ecrireLigne({ ready: true, protocol: 'bench.candidate/2' });

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (ligne) => {
  let req;
  try {
    req = JSON.parse(ligne);
  } catch {
    return;
  }
  const { id, op, args } = req;
  try {
    appendFileSync(LOG_PATH, `${op}\n`);
  } catch {
    /* canal d'observation : jamais une condition de reponse */
  }

  const repondre = (result) => ecrireLigne({ id, ok: true, result });
  const echouer = (code, message) => ecrireLigne({ id, ok: false, error: { code, message } });

  // FAUTE DELIBEREE, ISOLEE (T51) : plus aucune garde de proprietaire.
  // N'IMPORTE QUEL tenant_id est traite comme proprietaire du creneau S1.

  switch (op) {
    case 'create_tenant': {
      const { tenant_id } = args ?? {};
      if (etat.ownerTenant === null) etat.ownerTenant = tenant_id;
      sauverEtat(etat);
      repondre({});
      break;
    }
    case 'advance_clock': {
      const { to } = args ?? {};
      etat.clock = to;
      sauverEtat(etat);
      repondre({});
      break;
    }
    case 'write': {
      const { op: sousOp, actor, admission_seq, operation_key } = args ?? {};
      if (operation_key !== undefined && etat.seen[operation_key] !== undefined) {
        repondre({ decision: etat.seen[operation_key] });
        break;
      }
      let decision;
      if (sousOp === 'reserve') {
        if (etat.holder === null) {
          etat.holder = actor;
          decision = 'confirmed';
        } else if (etat.holder === actor) {
          decision = 'confirmed';
        } else if (etat.queue.some((q) => q.actor === actor)) {
          decision = 'waiting';
        } else {
          etat.queue.push({ actor, admission_seq });
          etat.queue.sort((a, b) => a.admission_seq - b.admission_seq);
          decision = 'waiting';
        }
      } else if (sousOp === 'cancel') {
        if (etat.holder !== actor) {
          decision = 'refused';
        } else if (etat.clock !== null && Date.parse(etat.clock) > Date.parse(BOUNDARY)) {
          decision = 'refused';
        } else {
          etat.holder = null;
          etat.cancelled.push(actor);
          etat.queue.sort((a, b) => a.admission_seq - b.admission_seq);
          const suivant = etat.queue.shift();
          if (suivant !== undefined) etat.holder = suivant.actor;
          decision = 'cancelled';
        }
      } else {
        echouer('UNKNOWN_SUB_OP', String(sousOp));
        break;
      }
      if (operation_key !== undefined) etat.seen[operation_key] = decision;
      sauverEtat(etat);
      repondre({ decision });
      break;
    }
    case 'read': {
      const { tenant_id, key } = args ?? {};
      let value = null;
      if (etat.holder === key) {
        value = { status: 'confirmed' };
      } else {
        const pos = etat.queue.findIndex((q) => q.actor === key);
        if (pos >= 0) value = { status: 'waiting', waiting_position: pos + 1 };
        else if (etat.cancelled.includes(key)) value = { status: 'cancelled' };
      }
      // CANAL AJOUTE PAR T59 (seule addition face a reservation-candidate-v2-
      // faulty-isolation.mjs) : la VALEUR REELLEMENT rendue est journalisee
      // AVANT l'envoi, aux cotes de la requete qui l'a produite.
      try {
        appendFileSync(READ_RESPONSE_LOG_PATH, `${JSON.stringify({ tenant_id, key, value })}\n`);
      } catch {
        /* canal d'observation : jamais une condition de reponse */
      }
      repondre({ value }); // FUITE : aucune verification de tenant_id.
      break;
    }
    case 'probe_cancel': {
      const { key } = args ?? {};
      let decision;
      if (etat.holder !== key) decision = 'refused';
      else if (etat.clock !== null && Date.parse(etat.clock) > Date.parse(BOUNDARY)) decision = 'refused';
      else decision = 'accepted';
      repondre({ decision }); // FUITE : aucune verification de tenant_id.
      break;
    }
    case 'fingerprint': {
      repondre({ sha256: empreinteDe(etat) });
      break;
    }
    default:
      echouer('UNKNOWN_OP', String(op));
  }
});

rl.on('close', () => process.exit(0));
