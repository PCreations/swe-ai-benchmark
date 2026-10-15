# ADR-011 — Un énoncé des exigences que le candidat peut lire

    statut : PROPOSÉ — en attente de la décision du mandant
    ouvert : 15/10/2026
    porte  : le prompt d'une période à candidat réel (T49, T50, T52), le
             contrat `bench.candidate/2`, le modèle attendu des contrôles (T51)
    origine : relecture finale du chemin réel à `658b3fd` (53/53 prouvées) ;
              le mandant a répondu « Oui » à la rédaction de cet ADR

## Ce que la relecture a trouvé

La chaîne est assemblée : la session peut écrire, le prompt donne le contrat
complet, le commit de chaque période est lancé et contrôlé. Mais **le
candidat n'est jamais informé des règles sur lesquelles on le juge.**

**1. Les exigences révélées sont des métadonnées.** Pour la période 1, le
prompt reçoit :
`{"id":"reserve@1","capability_id":"reservation.create","control":"capacite-creneau","satisfied":true,…}`.
Aucune règle n'y figure : capacité d'un créneau, file d'attente ordonnée par
séquence d'admission, annulation au moins 24 heures avant le début frontière
incluse, rejeu d'une clé d'opération sans doublon, `NOT_FOUND` pour un autre
locataire. Ces règles existent pourtant, écrites, dans le cahier (F-RESERVATION,
L119 et L123).

**2. Le vocabulaire des réponses n'est jamais donné.** Les contrôles comparent
les réponses du candidat à l'identique avec le modèle attendu :
`decision` vaut `confirmed`, `waiting`, `cancelled` ou `refused` ; une lecture
rend `{status, waiting_position}` ; un autre locataire reçoit `NOT_FOUND`. Un
candidat qui ne connaît pas ces mots échoue sans que sa capacité soit en cause.

**3. Une fuite.** `satisfied: true` est le verdict de l'application scriptée ;
il est transmis au candidat avec chaque exigence.

Le scénario de démonstration a été écrit pour une application scriptée qui
connaît les règles d'avance : il ne contient aucun énoncé destiné à un agent,
et sa table de réponses du service client est vide.

## Décision proposée

**Un énoncé par période, écrit à partir du cahier.** Pour chaque période, le
prompt contient, en langue naturelle, les règles F-RESERVATION actives à cette
période, et seulement elles : capacité, statuts, file d'attente, annulation et
sa frontière, idempotence, isolation des locataires.

**Le vocabulaire et les paramètres en entier.** Chaque valeur de réponse que
le modèle attendu peut produire à cette période, et chaque paramètre qu'il
emploie (début du créneau, préavis, frontière incluse), figure littéralement
dans l'énoncé.

**Une seule source.** L'énoncé et le vocabulaire du modèle attendu sont
déclarés dans la même description exportée que le contrat
`bench.candidate/2` (ADR-010) : ce qu'on dit au candidat et ce qu'on attend de
lui ne peuvent pas diverger.

**Aucun verdict ni attente dans le prompt.** Ni `satisfied`, ni valeur
attendue calculée, ni règle d'une période suivante.

## Limite assumée

Le vocabulaire du contrat `bench.candidate/2` (`refused`) n'est pas celui de
l'oracle du cahier (codes `ALREADY_RESERVED`, `NO_ACTIVE_RESERVATION`,
`CANCELLATION_TOO_LATE`). Le changer casserait les preuves de T50 à T52 ; on
le garde, et on le dit au candidat. Aligner le modèle attendu de T51 sur
l'oracle de T07 reste une dette nommée.

## Spécification de la tâche T53

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T53, et `bench spec-lint` le vérifie contre ce fichier.

**T53 — Donner au candidat l'énoncé des exigences**

Dépendances : T52. Livrables : pour chaque période du scénario de démonstration, un énoncé en langue naturelle des règles F-RESERVATION actives à cette période, avec le vocabulaire et les paramètres du modèle attendu, déclaré dans la description exportée du contrat et inclus dans le prompt de la période.

Acceptation : `T53.A1` le prompt de chaque période contient l'énoncé des règles actives à cette période — capacité du créneau, statuts, file d'attente ordonnée par séquence d'admission, annulation et sa frontière, rejeu d'une clé d'opération, isolation des locataires — et aucune règle d'une période suivante ; `A2` chaque valeur de réponse que le modèle attendu peut produire à cette période figure littéralement dans l'énoncé de cette période ; `A3` chaque paramètre employé par le modèle attendu à cette période — début du créneau, préavis d'annulation, frontière incluse ou exclue — figure dans l'énoncé de cette période ; `A4` le prompt ne contient ni verdict de contrôle, ni le champ `satisfied`, ni valeur attendue calculée pour la période ; `A5` l'énoncé et le vocabulaire du modèle attendu sont déclarés dans la même description exportée que le contrat `bench.candidate/2`.

Commande : `pnpm verify:task T53`. Aucun appel réel n'est nécessaire.
