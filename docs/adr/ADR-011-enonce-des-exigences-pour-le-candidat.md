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

## Ce que le premier essai réel a montré

Un essai d'une période (Haiku 4.5, abonnement du mandant, 15/10/2026) a
traversé toute la chaîne : la session a écrit `candidate.mjs`, la période a
été persistée et contrôlée. Il a confirmé le défaut ci-dessus — 0 contrôle
satisfait sur 5, `actual` nul faute du vocabulaire attendu — et en a révélé
trois autres, qu'aucun faux exécutable ne pouvait montrer :

**4. Le rapport de fin perd les tokens.** L'usage est bien persisté
(`input_fresh` 18, `cache_read` 32 466, écriture de cache 35 022, `output`
3 059), mais `candidate_token_report` est vide. La relecture découpe la sortie
de `psql` sur les retours à la ligne et sur `|` ; la sortie brute réelle de
`claude -p` contient les deux (le compte rendu du candidat en markdown). Les
colonnes se décalent et l'usage est perdu. La sortie du faux `claude` tient sur
une ligne sans `|`.

**5. Une période est contrôlée sur des règles futures.** À la période 1, les
cinq contrôles sont évalués, dont `cancel@1`, `fifo@1` et `isolation@1`, dus
en P2 à P4 : le contrôle rejoue tout le scénario quelle que soit la période.

**6. La ventilation de l'écriture de cache existe.** Contrairement à la
documentation relevée par ADR-008, la sortie réelle porte
`usage.cache_creation.ephemeral_5m_input_tokens` et `ephemeral_1h_input_tokens`
(ici 0 et 35 022) — au niveau de la session, pas par modèle.

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

**Corriger ce que l'essai a révélé** (T54) : relire les périodes persistées
sans dépendre du contenu de la sortie brute ; ne contrôler à une période que
les exigences dues à cette période ; attribuer l'écriture de cache à 5 min et
à 1 h quand la session la déclare et n'emploie qu'un modèle, la laisser non
ventilée sinon.

## Limite assumée

Le vocabulaire du contrat `bench.candidate/2` (`refused`) n'est pas celui de
l'oracle du cahier (codes `ALREADY_RESERVED`, `NO_ACTIVE_RESERVATION`,
`CANCELLATION_TOO_LATE`). Le changer casserait les preuves de T50 à T52 ; on
le garde, et on le dit au candidat. Aligner le modèle attendu de T51 sur
l'oracle de T07 reste une dette nommée.

## Spécification des tâches T53 et T54

Format calqué sur le cahier. Ces blocs sont la source verbatim des cartes de
spec de T53 et T54, et `bench spec-lint` les vérifie contre ce fichier.

**T53 — Donner au candidat l'énoncé des exigences**

Dépendances : T52. Livrables : pour chaque période du scénario de démonstration, un énoncé en langue naturelle des règles F-RESERVATION actives à cette période, avec le vocabulaire et les paramètres du modèle attendu, déclaré dans la description exportée du contrat et inclus dans le prompt de la période.

Acceptation : `T53.A1` le prompt de chaque période contient l'énoncé des règles actives à cette période — capacité du créneau, statuts, file d'attente ordonnée par séquence d'admission, annulation et sa frontière, rejeu d'une clé d'opération, isolation des locataires — et aucune règle d'une période suivante ; `A2` chaque valeur de réponse que le modèle attendu peut produire à cette période figure littéralement dans l'énoncé de cette période ; `A3` chaque paramètre employé par le modèle attendu à cette période — début du créneau, préavis d'annulation, frontière incluse ou exclue — figure dans l'énoncé de cette période ; `A4` le prompt ne contient ni verdict de contrôle, ni le champ `satisfied`, ni valeur attendue calculée pour la période ; `A5` l'énoncé et le vocabulaire du modèle attendu sont déclarés dans la même description exportée que le contrat `bench.candidate/2`.

Commande : `pnpm verify:task T53`. Aucun appel réel n'est nécessaire.

**T54 — Corriger ce que le premier essai réel a révélé**

Dépendances : T52. Livrables : relecture des périodes à candidat réel indépendante du contenu de leur sortie brute ; contrôle d'une période restreint aux exigences dues à cette période ; attribution de l'écriture de cache par durée quand la session la déclare.

Acceptation : `T54.A1` une période dont la sortie brute contient des retours à la ligne et le caractère `|` est relue intacte, et le rapport de fin agrège son usage exactement ; `A2` à la période k, seuls les contrôles des exigences dues à une période inférieure ou égale à k sont évalués et persistés ; `A3` quand la sortie d'une session déclare la ventilation de l'écriture de cache entre 5 minutes et 1 heure et que la session n'emploie qu'un modèle, ces tokens sont attribués à `cache_write_5m` et `cache_write_1h` ; `A4` quand la session emploie plusieurs modèles ou ne déclare pas cette ventilation, l'écriture de cache reste dans la catégorie non ventilée, et aucune de ses unités n'est attribuée à une durée.

Commande : `pnpm verify:task T54`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
