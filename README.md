# Branche de preuve (ledger)

Branche **orpheline** : aucun historique partage avec la branche source.

## Pourquoi orpheline

Le cahier (§G) interdit que les preuves vivent dans l'arbre suivi : sinon,
produire la preuve change le commit qu'elle certifie. Y committer ne modifie
donc jamais le tree hash des sources — c'est litteralement l'anti-circularite
demandee, sans renoncer a la durabilite.

## Ce qu'elle porte

    attestations/Txx/<subject_commit>.json   la preuve durable, seule chose que `bench resume` croit
    red/Txx/<commit>.json                    chaque cas requis observe en echec contre un squelette
    necessity/Txx/<commit>.json              chaque cas echoue quand les exports de la tache sont stubbes
    mutation/Txx/<commit>.json               chaque mutant a demarre puis a ete tue par son cas nomme
    audits/Txx/<commit>/<auditor>.json       refutations aveugles + digest du prompt genere
    spawns/Txx/<phase>/<nonce>.json          recu ecrit AVANT de lancer un role
    oracles/*.py *.ts                        oracles ecrits dans l'autre langage que la tache
    fixtures-transcripts/{A,B}/F-*.json      les deux transcriptions independantes de la section F
    heldout/Txx/*.spec.ts                    cas retenus, jamais checkout dans un worktree d'implementeur

## Regles

- **Append-only.** Le hook pre-push refuse toute poussee qui ne soit pas en
  avance rapide : une reecriture effacerait la trace d'une violation avant
  qu'aucune porte ne voie la plage de commits.
- **Rien n'est durable tant que ce n'est pas pousse.** Le conteneur de session
  est ephemere ; le worktree local est recree depuis origin par
  `bench bootstrap`. `bench resume` sort en 4 s'il reste un evenement non pousse.
- **Aucun `status` ne fait foi.** `DONE` est derive, jamais stocke : recalcule
  a chaque appel depuis les objets git et les sondes de capacite du boot courant.
