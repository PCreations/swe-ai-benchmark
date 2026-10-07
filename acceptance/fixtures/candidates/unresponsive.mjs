#!/usr/bin/env node
// acceptance/fixtures/candidates/unresponsive.mjs — zone ACCEPTANCE.
//
// Un candidat qui demarre normalement (ecrit la probe `{"ready":true}`) mais
// « ne repond pas dans le delai » (T48.A4) a la premiere operation recue :
// il la lit (pour prouver que le protocole est bien respecte jusque-la,
// c'est bien un retard de REPONSE qui est exerce, pas un flux jamais lu) et
// ne repond JAMAIS. L'adaptateur doit expirer apres `--candidate-timeout-ms`
// et declarer le candidat non deploye avec un motif nomme, sans faire
// echouer la periode elle-meme.
import { createInterface } from 'node:readline';

process.stdout.write(`${JSON.stringify({ ready: true, protocol: 'bench.candidate/1' })}\n`);

const rl = createInterface({ input: process.stdin, terminal: false });
// La premiere ligne est lue (donc consommee du flux) puis silencieusement
// ignoree : aucune reponse n'est jamais ecrite sur stdout.
rl.once('line', () => {
  /* silence volontaire */
});
// Empeche le processus de sortir de lui-meme ; seul l'adaptateur (ou le
// timeout du harness de test) le termine.
setInterval(() => {}, 1_000_000_000);
