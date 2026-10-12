#!/usr/bin/env node
// acceptance/fixtures/candidates/reservation-candidate-v2-faulty-isolation.mjs — zone ACCEPTANCE.
//
// « Une application de reference FAUTIVE » (T51.A1, verification/
// cases.extensions.lock.json : « une application de reference fautive
// obtient exactement [les statuts] de la variante fautive »). COPIE EXACTE
// de reservation-candidate-v2.mjs (meme fichier, meme commentaire de tete
// omis ici pour ne pas le dupliquer — voir ce fichier pour le contrat et la
// semantique complets), a UNE seule difference, deliberee et ISOLEE : la
// garde d'isolation intertenant (`estProprietaire`) est retiree des trois
// operations qui la portaient (`write`, `read`, `probe_cancel`). N'IMPORTE
// QUEL locataire peut donc lire ou modifier la reservation du creneau S1,
// quel que soit le locataire qui l'a cree — exactement le defaut que le
// controle `isolation@1` doit detecter, et exactement l'equivalent, du cote
// candidat, de la variante `cross-tenant-read` de `bench demo` (T11.A6).
//
// Cette fixture n'est PAS une source de T51 : c'est un temoin ACCEPTANCE
// ecrit par le test-author, au meme titre que
// acceptance/fixtures/candidates/not-starting.mjs pour T48.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const STATE_PATH = './state.json';
const LOG_PATH = './ops-received.log';

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

  // FAUTE DELIBEREE, ISOLEE : plus aucune garde de proprietaire. N'IMPORTE
  // QUEL tenant_id est traite comme proprietaire du creneau S1.

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
      const { key } = args ?? {};
      let value = null;
      if (etat.holder === key) {
        value = { status: 'confirmed' };
      } else {
        const pos = etat.queue.findIndex((q) => q.actor === key);
        if (pos >= 0) value = { status: 'waiting', waiting_position: pos + 1 };
        else if (etat.cancelled.includes(key)) value = { status: 'cancelled' };
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
