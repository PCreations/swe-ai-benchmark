#!/usr/bin/env node
// acceptance/fixtures/candidates/not-starting.mjs — zone ACCEPTANCE.
//
// Un candidat qui « ne demarre pas » (T48.A4, cases.extensions.lock.json:T48.A4).
// Sort IMMEDIATEMENT, code non nul, SANS jamais ecrire la probe de demarrage
// `{"ready":true}` que acceptance/T48.spec.ts (III) exige dans le delai
// `--candidate-timeout-ms`. L'adaptateur doit observer cette absence et
// declarer le candidat non deploye avec un motif nomme, sans faire echouer
// la periode elle-meme (A4, ADR:L143).
process.exit(1);
