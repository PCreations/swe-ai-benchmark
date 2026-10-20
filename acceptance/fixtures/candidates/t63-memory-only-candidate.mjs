#!/usr/bin/env node
// acceptance/fixtures/candidates/t63-memory-only-candidate.mjs — zone ACCEPTANCE.
//
// Candidat FAUTIF de T63 (verification/cases.extensions.lock.json#T63.A2) :
// « un candidat qui garde son etat en memoire seulement ». Temoin ecrit par
// le test-author, jamais une source de T63. Meme PROTOCOLE que t63-persistent-
// kv-candidate.mjs (bench.candidate/1, repris a l'identique de reference-app.
// mjs) — SEULE difference, et c'est exactement ce que ce candidat est cense
// faire mal : `BENCH_DATA_DIR` n'est NI LU NI ECRIT. L'etat vit dans une
// variable de module, donc ne survit a AUCUN redemarrage de processus — ce
// que le moteur de T63 doit infliger entre chaque periode (ADR-018 L48-49).
//
// Ce candidat ne pretend pas etre correct : c'est la contre-epreuve d'A2, le
// « candidat qui viole, dès la periode suivante, chaque controle qui depend
// d'un etat anterieur ».
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

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

// AUCUNE lecture de disque, AUCUNE lecture de BENCH_DATA_DIR : l'etat nait
// toujours vide a chaque demarrage de processus.
const etat = {};

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
      // PAS de sauverEtat() : rien n'est ecrit sur disque, nulle part.
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
