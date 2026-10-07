#!/usr/bin/env node
// acceptance/fixtures/candidates/malformed.mjs — zone ACCEPTANCE.
//
// Un candidat qui demarre normalement mais « viole le format du contrat »
// (T48.A4) a la premiere operation : au lieu d'une ligne JSON portant `id`
// et `ok`, il ecrit une ligne qui n'est PAS du JSON valide. L'adaptateur doit
// le detecter et declarer le candidat non deploye avec un motif nomme, sans
// faire echouer la periode elle-meme.
import { createInterface } from 'node:readline';

process.stdout.write(`${JSON.stringify({ ready: true, protocol: 'bench.candidate/1' })}\n`);

const rl = createInterface({ input: process.stdin, terminal: false });
rl.once('line', () => {
  process.stdout.write('ceci n est pas du JSON — violation de format deliberee\n');
});
