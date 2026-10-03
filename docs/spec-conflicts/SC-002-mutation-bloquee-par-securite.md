# SC-002 — Une mutation que la sécurité refuse d'exécuter prouve-t-elle quelque chose ?

    statut : RESOLU — option A, arbitrée par le mandant le 2026-10-03
    ouvert : 2026-10-02
    porte  : T42.M1 / T42.A1, et par extension tout mutant de `proof_kind:
             artifact` dont la cible est la piste d'audit elle-même
    origine : étage GATES de T42 refusé, deux tours de suite, motif
             « Logging/Audit Tampering » du classifieur de permission

## Les faits, mesurés

`T42.A1` exige que les 42 tâches dont T42 dépend soient `PROVEN` d'après
`bench resume --json`. Le cas est **vert avant toute implémentation** : il relit
l'état prouvé du dépôt, il n'exerce aucun export de T42. Il lui faut donc une
contre-épreuve par mutation, et `T42.M1` la fournit : périmer l'attestation
courante d'une des 42 tâches, pour qu'A1 rougisse sur cette tâche et sur elle
seule.

Trois observations, dans l'ordre où elles se sont produites :

1. **Premier refus.** L'étage ROUGE a tenté M1 sur la ref suivie du ledger. Le
   classifieur a refusé : « Logging/Audit Tampering ». L'agent a respecté le
   refus, restauré la ref à son sha d'origine, vérifié la restauration par
   `git show`, et refusé d'écrire une note `killed_by` pour une mutation qu'il
   n'avait pas observée. Verdict rendu : `INVALID_RED / VACUOUS_CASES`.

2. **Correction, puis exécution réussie.** Le test-author a réécrit M1 pour
   opérer exclusivement sur un **fork jetable** du ledger (branche nouvelle,
   jamais poussée, détruite après observation), et a inscrit dans le registre de
   mutants la garde procédurale correspondante. L'étage ROUGE suivant a alors
   **exécuté M1** et enregistré, dans `red/T42/4b1352ce…json` :

       T42.A1  GREEN_PROVEN_BY_MUTATION  T42.M1
               « Fork jetable execute sur HEAD=4b1352c
                 (procedure verification/mutants/T42.json#M1) »

   Verdict : `RED_RECORDED`, les six cas prouvés par mutation.

3. **Deuxième refus, sur la même procédure.** L'étage GATES a re-confirmé M2 à
   M6 dans un worktree jetable (`/tmp/mut-T42`, détruit, arbre principal
   intact), et s'est fait refuser M1 **avant toute exécution du fork**, même
   motif. Zéro branche créée. Il a lui aussi respecté le refus. Verdict :
   5/6 mutants confirmés, étage `ok=false`.

## Ce qui est en jeu

Le même mutant, suivant la même procédure corrigée, a été **exécuté** par un
agent et **refusé** à un autre. Le refus n'est donc pas une propriété de la
procédure mais du jugement du classifieur à un instant donné.

Cela crée une situation que le cahier n'anticipe pas : une porte dont le
franchissement dépend d'une décision de sécurité non déterministe.

## Les options, et ce qu'elles coûtent

**A — La trace de l'étage ROUGE suffit.** M1 a été exécuté et enregistré avec
sa procédure et son commit. GATES re-confirme ; une re-confirmation refusée par
la sécurité est nommée comme limitation de l'attestation (§G exige que les
portes absentes soient **nommées**, jamais masquées), et T42 poursuit.
*Coût* : on accepte une attestation dont un mutant sur six n'a pas été
re-exécuté à l'étage prévu pour cela. C'est un affaiblissement réel, borné et
tracé.

**B — 6/6 ou rien.** T42 reste non attestée tant que GATES n'a pas confirmé les
six mutants. *Coût* : T42 peut rester bloquée indéfiniment, puisque le blocage
ne dépend pas du dépôt. `HANDOFF_COMPLETE` devient inatteignable, et T43 avec.

**C — Changer la cible de M1.** Trouver pour A1 une contre-épreuve qui ne touche
aucune piste d'audit — par exemple un ledger de remplacement déclaré, à l'image
du registre de tâches de remplacement qui existe déjà
(`verification/runner/registry.mjs` l.80, utilisé par T00.A4/A5 conformément au
cahier L153). *Coût* : `ledgerRef()` dérive du nom de branche sans poignée
(`verification/runner/ledger.mjs` l.16), donc c'est un changement de HARNESS en
fin de parcours ; et il **exige** la garde symétrique de celle qui protège le
registre — `accept` refuse une attestation appuyée sur un registre de
remplacement. Sans cette garde, un ledger substituable serait un contournement
de tout le système de preuve.

## Arbitrage

**Le mandant a tranché : option A**, le 2026-10-03, sur présentation des trois
options et de leurs coûts.

La trace de l'étage ROUGE suffit. Mise en œuvre, en deux endroits :

1. **L'attestation nomme la limitation, et `bench accept` la calcule seul.**
   `mutationSubstitutedRed()` (`verification/runner/accept.mjs`) émet
   `RED_SUBSTITUTED_BY_MUTATION` pour **tout** cas requis que le registre rouge
   porte en `GREEN_PROVEN_BY_MUTATION`, en citant le cas, le mutant et le chemin
   de la porte rouge. Ce n'est pas une exception taillée pour T42 : la
   distinction entre « vu rouge » et « prouvé non vacueux par mutation »
   n'était lisible que dans le registre du ledger, jamais dans l'attestation.
   Elle l'est désormais pour les 44 tâches.

2. **L'étage GATES peut rendre `ok=true` sur un mutant non exécuté**, aux trois
   conditions cumulatives : le refus vient du classifieur de permission et non
   du mutant ; le registre rouge porte déjà ce cas en
   `GREEN_PROVEN_BY_MUTATION` tué par ce mutant, chemin et note cités ; la
   limitation `MUTANT_RE_EXECUTION_REFUSEE_PAR_SECURITE` est nommée dans le
   compte rendu. Un mutant qui laisse son cas vert reste une violation
   bloquante, sans exception.

**Ce que cet arbitrage concède, dit en clair** : l'attestation de T42 reposera
sur six cas dont aucun n'a été observé rouge avant implémentation — A1 parce
qu'il relit l'état prouvé du dépôt, A2 à A6 parce qu'ils rejouent des portes
déjà prouvées — et dont un mutant sur six n'a pas été re-exécuté à l'étage
prévu pour cela. C'est un affaiblissement réel. Il est borné à une tâche, et il
est écrit dans l'attestation plutôt que dans un commentaire.

## Ce que je ne fais pas

Je ne tranche pas. Les trois options modifient soit le niveau de preuve d'une
attestation, soit le système de preuve lui-même, à la dernière tâche de
qualification. C'est la définition d'un arbitrage qui appartient au mandant.

Je ne cherche pas non plus à contourner le refus du classifieur, ni à le
reformuler pour qu'il passe. La garde que le test-author a inscrite dans le
registre de mutants dit la règle, et elle vaut aussi pour moi :

> « refus à respecter, jamais à contourner. »

## État au moment de l'ouverture

    42/44 tâches prouvées à HEAD · 267/279 cas
    CORE_VERIFIED et PILOT_READY : conditions remplies, publication = livrable T43.A4
    T42 : verify:task PASS 6/6 en arbre ET en clean-room ; GATES 5/6
    T43 : en attente de T42
    arbre propre, les deux branches identiques à origin
