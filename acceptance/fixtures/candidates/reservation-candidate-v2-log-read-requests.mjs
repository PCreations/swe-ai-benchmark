#!/usr/bin/env node
// acceptance/fixtures/candidates/reservation-candidate-v2-log-read-requests.mjs
// — zone ACCEPTANCE, publiee par T59 (jamais une source de T59 : packages/
// activities, apps/cli).
//
// COPIE EXACTE de acceptance/fixtures/candidates/reservation-candidate-v2.mjs
// (meme contrat `bench.candidate/2`, meme semantique metier, meme fichier
// d'etat ./state.json — voir ce fichier pour le detail complet du contrat et
// de la semantique, omis ici pour ne pas le dupliquer), a UNE seule addition,
// ISOLEE et SANS EFFET sur aucune reponse protocolaire : un second canal
// d'observation, ./read-requests.log, une ligne JSON `{"tenant_id":...,
// "key":...}` par requete `read` RECUE, AVANT toute logique de reponse.
//
// POURQUOI UN CANAL SEPARE DE ./ops-received.log (T51, deja ACCEPTE) : ce
// dernier ne porte que le NOM de l'operation, jamais ses arguments — il ne
// permet donc pas d'observer QUELLE cle la sonde d'isolation a reellement
// demandee. C'est exactement ce que T59.A1 doit observer (verification/
// cases.extensions.lock.json#T59.A1 : « la requete de la sonde d'isolation
// lit [...] la cle d'un acteur qui detient une reservation dans legacy »,
// source : docs/adr/ADR-016, lignes 42-48) : la REQUETE envoyee par la
// traduction du scenario scripte vers le contrat (candidate-control-
// period.ts, non lu), jamais une relecture de code candidat comme une
// implementation de T59.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const STATE_PATH = './state.json';
const LOG_PATH = './ops-received.log';
const READ_REQUEST_LOG_PATH = './read-requests.log'; // CANAL AJOUTE PAR T59 — jamais protocolaire.

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

  const estProprietaire = (tenant_id) => etat.ownerTenant !== null && tenant_id === etat.ownerTenant;

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
      const { op: sousOp, actor, tenant_id, admission_seq, operation_key } = args ?? {};
      if (operation_key !== undefined && etat.seen[operation_key] !== undefined) {
        repondre({ decision: etat.seen[operation_key] });
        break;
      }
      if (!estProprietaire(tenant_id)) {
        echouer('NOT_FOUND', String(tenant_id));
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
      // CANAL AJOUTE PAR T59 (seule addition face a reservation-candidate-v2.mjs) :
      // la requete COMPLETE est journalisee AVANT toute decision de reponse,
      // de sorte qu'elle temoigne de ce que la traduction a REELLEMENT envoye,
      // jamais de ce que ce candidat en a fait.
      try {
        appendFileSync(READ_REQUEST_LOG_PATH, `${JSON.stringify({ tenant_id, key })}\n`);
      } catch {
        /* canal d'observation : jamais une condition de reponse */
      }
      if (!estProprietaire(tenant_id)) {
        echouer('NOT_FOUND', String(tenant_id));
        break;
      }
      let value = null;
      if (etat.holder === key) {
        value = { status: 'confirmed' };
      } else {
        const pos = etat.queue.findIndex((q) => q.actor === key);
        if (pos >= 0) value = { status: 'waiting', waiting_position: pos + 1 };
        else if (etat.cancelled.includes(key)) value = { status: 'cancelled' };
      }
      repondre({ value });
      break;
    }
    case 'probe_cancel': {
      const { tenant_id, key } = args ?? {};
      if (!estProprietaire(tenant_id)) {
        echouer('NOT_FOUND', String(tenant_id));
        break;
      }
      let decision;
      if (etat.holder !== key) decision = 'refused';
      else if (etat.clock !== null && Date.parse(etat.clock) > Date.parse(BOUNDARY)) decision = 'refused';
      else decision = 'accepted';
      repondre({ decision });
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
