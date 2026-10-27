#!/usr/bin/env node
// acceptance/fixtures/candidates/f-platform-t75/variante-sans-exclusion.mjs — zone ACCEPTANCE (T75, test-author).
//
// VARIANTE SANS EXCLUSION MUTUELLE DU CANDIDAT DE REFERENCE (T75.A2). Transformation
// minimale de ./candidat.mjs, et seulement elle : les requetes reserve et import_bookings
// (et leurs noms v2) suivent lire-calculer-ecrire SANS verrou. Fenetre de course elargie de
// facon deterministe : la premiere ouvre un lot de FENETRE_MS (150 ms) ; toutes celles qui
// arrivent pendant la fenetre, de n'importe quelle connexion, sont calculees chacune sur sa
// propre copie du meme etat, puis ecrivent chacune leur etat (la derniere l'emporte).
// Consequences, sans hasard des que les requetes d'un essai arrivent dans la meme fenetre :
// derniere place -> toutes confirmed ; rejeux en conflit -> plusieurs creations pour la meme
// cle ; import et reserve concurrents -> plus de places confirmees que le plafond. Envoyees
// une a une (chaque requete attendant la reponse de la precedente), les memes requetes
// recoivent les reponses de la reference : seul un banc reellement parallele la fait echouer.
process.env.BENCH_T75_VARIANT = 'sans-exclusion'
await import('./candidat.mjs')
