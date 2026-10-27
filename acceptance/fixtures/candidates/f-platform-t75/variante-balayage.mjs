#!/usr/bin/env node
// acceptance/fixtures/candidates/f-platform-t75/variante-balayage.mjs — zone ACCEPTANCE (T75, test-author).
//
// VARIANTE LENTE DU CANDIDAT DE REFERENCE (T75.A1) : « un candidat de reference qui parcourt
// toutes les reservations a chaque operation ». Transformation minimale de ./candidat.mjs,
// et seulement elle : AVANT chaque operation, chaque reservation de chaque locataire est
// relue (copie JSON, comme le rechargement d'une table sans index), deux passes
// (PASSES_DE_BALAYAGE de ./candidat.mjs). Les reponses sont exactement celles de la
// reference ; seule la latence change, et elle croit avec le nombre de reservations.
// Cout mesure apres import de 50 000 reservations : voir l'en-tete d'acceptance/T75.spec.ts.
process.env.BENCH_T75_VARIANT = 'balayage'
await import('./candidat.mjs')
