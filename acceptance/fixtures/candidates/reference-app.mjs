#!/usr/bin/env node
// acceptance/fixtures/candidates/reference-app.mjs — zone ACCEPTANCE.
//
// « Une application de reference respectant le contrat » (T48.A3,
// verification/cases.extensions.lock.json). Ce programme n'est PAS le candidat
// que T49/un vrai agent produira : c'est un temoin ecrit par le test-author,
// au meme titre que le script « invalid-candidate » de T23 ou l'agent
// volontairement incapable de T18 — une fixture ACCEPTANCE, jamais une source
// de T48 (packages/scenario, packages/activities).
//
// CONTRAT D'APPLICATION fixe par acceptance/T48.spec.ts (section III), derive
// mot pour mot de docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L88-91 :
// NDJSON sur stdin/stdout, probe de demarrage puis cinq operations, DANS L'ORDRE
// OU L'ADR LES NOMME (L90) : create_tenant, write, read, probe_cancel, fingerprint.
//
// ETAT PERSISTANT (cahier D-1 : « l'etat applicatif d'une trajectoire persiste »).
// Ce fichier est lance avec CWD = le depot git par trajectoire que le moteur
// gere (T48.A1). L'etat metier vit dans ./state.json, RELU au demarrage et
// REECRIT apres chaque operation mutante : c'est ce qui rend une restauration
// git (checkout du commit sauvegarde) suffisante pour retrouver l'etat exact
// de la periode precedente, sans aucune memoire du processus lui-meme (chaque
// periode est un processus NEUF).
//
// CANAL D'OBSERVATION ADDITIONNEL (.ops-received.log). Ligne par operation
// RECUE, utilise par T48.A3 pour distinguer « le processus a reellement
// repondu » de « l'adaptateur a fait repondre l'application scriptee a sa
// place » (le mutant T48.M3 vise exactement cette substitution) — ce canal
// n'existe QUE pour l'observabilite du test, il ne fait pas partie du contrat
// protocolaire lui-meme.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const STATE_PATH = './state.json';
const LOG_PATH = './ops-received.log';

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

function ecrireLigne(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

// Probe de demarrage : UNE ligne, avant tout traitement d'operation.
ecrireLigne({ ready: true, protocol: 'bench.candidate/1' });

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (ligne) => {
  let req;
  try {
    req = JSON.parse(ligne);
  } catch {
    return; // ligne illisible : le contrat (cote moteur) doit la traiter comme une violation de format.
  }
  const { id, op, args } = req;
  try {
    appendFileSync(LOG_PATH, `${op}\n`);
  } catch {
    /* le canal d'observation est un plus, jamais une condition de reponse */
  }

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
    case 'probe_cancel': {
      // cahier:L123 — « les probes [...] sont des clones jetables ; elles ne
      // modifient pas l'etat persistant principal ». Decision SANS mutation :
      // ni ecriture de etat, ni sauverEtat().
      const { tenant_id, key } = args ?? {};
      const decision = etat[tenant_id]?.[key] !== undefined ? 'cancelled' : 'refused';
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
