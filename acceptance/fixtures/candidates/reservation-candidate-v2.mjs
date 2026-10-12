#!/usr/bin/env node
// acceptance/fixtures/candidates/reservation-candidate-v2.mjs — zone ACCEPTANCE.
//
// « Une application de reference respectant `bench.candidate/2` » (T51.A1,
// verification/cases.extensions.lock.json). Comme acceptance/fixtures/
// candidates/reference-app.mjs pour `bench.candidate/1` (T48), ce programme
// n'est PAS le candidat que T49/un vrai agent produira : c'est un temoin
// ecrit par le test-author de T51, jamais une source de T51 (packages/
// scenario, packages/activities).
//
// CONTRAT `bench.candidate/2`, FIXE par acceptance/T50.spec.ts (section III)
// par PARALLELISME avec `bench.candidate/1` (acceptance/T48.spec.ts, III.3) :
//
//   create_tenant   {tenant_id}                                         {}
//   advance_clock   {to}                                                {}
//   write           {op,actor,tenant_id,admission_seq,operation_key}    {decision}
//   read            {tenant_id,key}                                     {value}
//   probe_cancel    {tenant_id,key}                                     {decision}
//   fingerprint     {}                                                  {sha256}
//
// SEMANTIQUE METIER DU DOMAINE DE RESERVATION, FIXEE ICI par acceptance/
// T51.spec.ts (section III) a partir des SEULS faits scelles par la racine
// gelee F-RESERVATION (acceptance/reference/F-RESERVATION.json) — jamais une
// implementation lue :
//
//   - Le PREMIER locataire jamais cree par `create_tenant` devient le seul
//     locataire autorise a voir/ecrire la reservation du creneau S1 (modele
//     le locataire `legacy` de F-RESERVATION). Tout AUTRE locataire qui lit,
//     ecrit ou sonde une annulation recoit `NOT_FOUND` SANS donnee metier
//     divulguee (F-RESERVATION valeurs.P4.verdict_intertenant, cahier:L123).
//   - `write` avec `op:'reserve'` : premier arrivant confirme ; les suivants
//     entrent en liste d'attente, ORDONNEE par `admission_seq` (FIFO), jamais
//     par un ordre d'arrivee implicite (regle explicite de F-RESERVATION).
//   - `write` avec `op:'cancel'` : seul le titulaire courant peut annuler, et
//     seulement si l'horloge courante (`advance_clock`) ne depasse PAS la
//     frontiere — 24 h avant le debut du creneau, FRONTIERE INCLUSE
//     (F-RESERVATION valeurs.P3.regle/delai_heures/frontiere_incluse). Une
//     annulation reussie PROMEUT le premier de la liste d'attente.
//   - `operation_key` rend CHAQUE ecriture idempotente : un rejeu avec la
//     MEME cle renvoie la MEME decision, sans reappliquer l'effet.
//   - `probe_cancel` evalue la MEME regle de delai, SANS MUTER l'etat
//     (cahier:L123 : « les probes [...] ne modifient pas l'etat persistant
//     principal »).
//
// ETAT PERSISTANT (./state.json), RELU au demarrage et REECRIT apres chaque
// operation mutante — meme discipline que reference-app.mjs (T48), pour
// qu'une restauration git (checkout du commit sauvegarde) retrouve l'etat
// exact de la periode precedente sans aucune memoire du processus.
//
// CANAL D'OBSERVATION (./ops-received.log) — ligne par operation RECUE,
// utilise par acceptance/T51.spec.ts (T51.A1) pour distinguer « le
// processus a reellement repondu » de « l'adaptateur a fait repondre
// l'application scriptee a sa place » (meme role que pour T48.A3). Ce canal
// n'est PAS protocolaire.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const STATE_PATH = './state.json';
const LOG_PATH = './ops-received.log';

// F-RESERVATION valeurs.creneau.debut.valeur et valeurs.P3.delai_heures —
// litteraux REPRIS de la racine gelee (pas inventes ici).
const SLOT_BEGIN = '2030-01-03T12:00:00Z';
const BOUNDARY = '2030-01-02T12:00:00Z'; // SLOT_BEGIN - 24h, frontiere incluse

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

/** cahier:L82 — objets JSON tries RECURSIVEMENT par cle, ordre des tableaux conserve, UTF-8. */
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
  // Le fingerprint porte sur l'etat METIER (titulaire, attente, annules), pas
  // sur l'horloge ni sur le cache d'idempotence (bookkeeping protocolaire).
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
      // SANS MUTATION (cahier:L123) : ni sauverEtat(), ni ecriture de etat.
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
