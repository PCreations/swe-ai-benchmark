#!/usr/bin/env node
// acceptance/fixtures/candidates/t63-persistent-kv-candidate.mjs — zone ACCEPTANCE.
//
// Candidat de reference de T63 (verification/cases.extensions.lock.json#T63.A1) :
// « un candidat de reference qui conserve son etat dans BENCH_DATA_DIR ». Ce
// programme n'est PAS une source de T63 (packages/activities, packages/agents) :
// c'est un temoin ecrit par le test-author, au meme titre qu'acceptance/
// fixtures/candidates/reference-app.mjs (T48) ou reservation-candidate-v2.mjs
// (T51).
//
// PROTOCOLE : `bench.candidate/1`, REPRIS A L'IDENTIQUE d'acceptance/
// fixtures/candidates/reference-app.mjs — jamais re-derive ici : probe de
// demarrage `{ready:true,protocol:"bench.candidate/1"}`, puis NDJSON
// `{id,op,args}` -> `{id,ok:true,result}` | `{id,ok:false,error:{code,message}}`,
// avec les operations create_tenant / write / read / fingerprint.
//
// SEULE DIFFERENCE avec reference-app.mjs (et c'est l'OBJET de T63) : l'etat
// persistant ne vit PAS a cote du script (CWD), il vit dans le repertoire que
// l'environnement pointe par BENCH_DATA_DIR (ADR-018 L46-49 : « Le candidat
// recoit un repertoire de donnees dont le chemin est passe par la variable
// d'environnement BENCH_DATA_DIR »). Si BENCH_DATA_DIR est absente, ce
// candidat retombe sur CWD — comportement degrade attendu, jamais un succes
// silencieux : c'est exactement le point que T63.A1 doit observer en
// NEGATIF (perturbation prescrite : « ne pas passer BENCH_DATA_DIR au
// candidat »).
//
// CANAL D'OBSERVATION (boot.log, DANS BENCH_DATA_DIR) — une ligne par
// DEMARRAGE de processus, utilisee par acceptance/T63.spec.ts pour verifier
// qu'un appel par periode correspond bien a un PROCESSUS OS NEUF (ADR-018
// L48-49 : « a travers les redemarrages du processus »), jamais le meme
// processus garde en vie entre deux periodes. Ce canal n'est PAS protocolaire.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import * as path from 'node:path';

const DATA_DIR = process.env.BENCH_DATA_DIR ?? '.';
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  /* repertoire deja present, ou creation impossible — chargerEtat() le constatera */
}
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const BOOT_LOG_PATH = path.join(DATA_DIR, 'boot.log');

function chargerEtat() {
  if (existsSync(STATE_PATH)) {
    try {
      return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
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
  return createHash('sha256').update(JSON.stringify(canonique({ tenants: etat })), 'utf8').digest('hex');
}

const etat = chargerEtat();

try {
  appendFileSync(BOOT_LOG_PATH, `pid:${process.pid}:boot:${Date.now()}\n`);
} catch {
  /* canal d'observation : jamais une condition de reponse */
}

function ecrireLigne(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

ecrireLigne({ ready: true, protocol: 'bench.candidate/1' });

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (ligne) => {
  let req;
  try {
    req = JSON.parse(ligne);
  } catch {
    return;
  }
  const { id, op, args } = req;

  const repondre = (result) => ecrireLigne({ id, ok: true, result });
  const echouer = (code, message) => ecrireLigne({ id, ok: false, error: { code, message } });

  switch (op) {
    case 'create_tenant': {
      const { tenant_id } = args ?? {};
      etat[tenant_id] = etat[tenant_id] ?? {};
      sauverEtat(etat);
      repondre({});
      break;
    }
    case 'write': {
      const { tenant_id, key, value } = args ?? {};
      if (etat[tenant_id] === undefined) {
        echouer('TENANT_NOT_FOUND', String(tenant_id));
        break;
      }
      etat[tenant_id][key] = value;
      sauverEtat(etat);
      repondre({});
      break;
    }
    case 'read': {
      const { tenant_id, key } = args ?? {};
      const valeur = etat[tenant_id]?.[key] ?? null;
      repondre({ value: valeur });
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
