#!/usr/bin/env node
// acceptance/fixtures/candidates/t64-naive-single-case-candidate.mjs — zone ACCEPTANCE.
//
// Candidat de reference de T64 (verification/cases.extensions.lock.json#T64.A3,
// « un candidat de reference qui ne traite que le cas de la trajectoire
// principale »). Ce programme n'est PAS une source de T64 (packages/
// activities, packages/scenario) : c'est un temoin ecrit par le test-author,
// au meme titre qu'acceptance/fixtures/candidates/reservation-candidate-v2.mjs
// (T51) ou t63-persistent-kv-candidate.mjs (T63).
//
// CE QUE CE CANDIDAT FAIT, ET POURQUOI C'EST LE TEMOIN QU'EXIGE T64.A3 :
//
//   Il repond ok:true a TOUTE operation du contrat bench.candidate/3 (les
//   six de bench.candidate/2 — acceptance/T50.spec.ts, III — plus les cinq
//   nouvelles d'ADR-018/acceptance/T62.spec.ts, II.1), avec un resultat FIXE,
//   IDENTIQUE quels que soient les arguments recus : jamais de file d'attente,
//   jamais de refus, jamais de calcul de solde ou d'echeance. C'est la forme
//   DEGENEREE d'un candidat qui « ne traite que le cas de la trajectoire
//   principale » — il ne rate jamais une operation pour cause de protocole
//   (aucun UNKNOWN_OP), mais n'honore AUCUNE regle metier au-dela du cas le
//   plus simple (confirmation immediate). Un lot de sequences cachees d'au
//   moins 20 entrees (T64.A4) variees par construction contient quasi
//   surement au moins un cas qui EXIGE autre chose qu'une confirmation
//   immediate (une file d'attente, un refus, un solde non nul, un historique
//   non vide, un transfert isole) : ce candidat le rate, d'ou un score < 1
//   (T64.A3). C'est un temoin PLUS FAIBLE qu'une implementation correcte de
//   la trajectoire principale et fautive seulement sur les cas caches, mais
//   un temoin SUFFISANT pour la clause « score < 1 » de T64.A3, et il a
//   l'avantage de ne presumer AUCUN detail du protocole specifique a chaque
//   regle que cette suite n'a pas le droit de lire (ADR-001).
//
// PROTOCOLE : NDJSON `{id,op,args}` -> `{id,ok:true,result}`, probe de
// demarrage `{ready:true,protocol:"bench.candidate/3"}` — repris a
// l'identique d'acceptance/T48.spec.ts (III.2) et d'acceptance/T62.spec.ts
// (II.1, marqueur bench.candidate/3).
import { createInterface } from 'node:readline';

const RESULTATS_FIXES = {
  create_tenant: {},
  advance_clock: {},
  write: { decision: 'confirmed' },
  read: { value: { status: 'confirmed' } },
  probe_cancel: { decision: 'accepted' },
  fingerprint: { sha256: '0'.repeat(64) },
  set_capacity: { decision: 'confirmed' },
  set_level: { decision: 'confirmed' },
  balance: { balance: 0 },
  history: { events: [] },
  transfer: { decision: 'confirmed' },
};

process.stdout.write(`${JSON.stringify({ ready: true, protocol: 'bench.candidate/3' })}\n`);

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (ligne) => {
  let req;
  try {
    req = JSON.parse(ligne);
  } catch {
    return;
  }
  const { id, op } = req;
  const result = Object.prototype.hasOwnProperty.call(RESULTATS_FIXES, op)
    ? RESULTATS_FIXES[op]
    : {}; // op inconnue : repondre quand meme, jamais UNKNOWN_OP (II ci-dessus)
  process.stdout.write(`${JSON.stringify({ id, ok: true, result })}\n`);
});

rl.on('close', () => process.exit(0));
