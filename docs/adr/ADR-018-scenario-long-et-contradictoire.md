# ADR-018 — Un scénario long, contradictoire et à état persistant

    statut : PROPOSÉ — rédigé à la demande du mandant le 19/10/2026 (« Oui
             vas-y, rédige l'ADR-018 »), en réponse à « Il faut rendre
             l'évolution des fonctionnalités beaucoup plus complexe, là ça
             reste vraiment trop trop simple pour prouver quoique ce soit »
    ouvert : 19/10/2026
    porte  : scénario du pilote à candidat réel, contrat du candidat, modèle
             attendu des contrôles, mesures persistées et rapport du pilote
    origine : cinquième pilote réel (docs/pilot/pilote-reel-2026-10-18-b.json)

## Ce que le cinquième pilote réel a montré

Haiku 5.5, Sonnet 5.5 et Opus 5.5 aux efforts medium et xhigh obtiennent
tous 15/15 contrôles dus. **Le scénario ne discrimine plus rien** : seul le
coût sépare les configurations. Cinq faiblesses l'expliquent.

1. **Quatre périodes, cinq règles, qui s'ajoutent sans jamais se
   contredire.** Ajouter une règle est facile. Ce qui rend difficile
   l'évolution d'un logiciel, c'est de changer le sens d'une règle déjà
   implémentée, puis d'en retirer une, sans casser le reste.
2. **Un cas par contrôle.** Chaque règle est vérifiée par une seule séquence
   scriptée. Une implémentation très partielle la passe.
3. **Aucun état à faire durer.** Le candidat ne doit jamais conserver de
   données d'une période à l'autre à travers un changement de format, donc
   jamais écrire de migration.
4. **Rien ne mesure le code.** On ne sait ni combien le candidat réécrit à
   chaque période, ni s'il écrit des tests.
5. **Une répétition par configuration.** Aucune variance n'est mesurée.

En outre, les métriques du cahier (Q, R, V, U, G, `G_new` ; T04) existent
mais ne sont pas calculées sur le chemin réel : le pilote ne rapporte que
des comptes satisfaits/violés.

## Décision

**1. Un scénario de douze périodes, `F-LONG`, qui prolonge F-RESERVATION.**
Les périodes P1 à P4 reprennent F-RESERVATION (cahier L119-L125) à
l'identique. Les périodes P5 à P12 ajoutent des règles, en **remplacent**
d'autres et en **retirent** : capacité modifiable, priorités, argent,
quotas, fuseau horaire et changement d'heure, historique, transfert entre
locataires. Le détail et les faits attendus sont fixés plus bas. Le scénario
ne figure pas dans le cahier ; la racine gelée `acceptance/reference` n'est
pas touchée. Ses faits sont figés dans une **nouvelle** racine,
`acceptance/reference-long`, ajoutée à `docs/FROZEN_ROOTS.json` après
acceptation de T61.

**2. Un état qui doit durer.** Le candidat reçoit un répertoire de données
dont le chemin est passé par la variable d'environnement
`BENCH_DATA_DIR`. Toutes les opérations de la trajectoire principale
s'appliquent au même état, de P1 à P12, à travers les redémarrages du
processus et les changements de format. Les sondes de frontière travaillent
sur des copies jetables de ce répertoire, comme les clones du cahier (L123).

**3. Des contrôles larges et cachés.** Chaque règle active est vérifiée par
la trajectoire principale **et** par un lot de séquences générées à partir
d'une graine. Ces séquences s'appliquent à des copies de l'état et ne sont
jamais montrées au candidat. Le score d'une règle à une période est la
fraction de ses séquences satisfaites. Les exemples publics restent
distincts : ils fixent la forme des messages, jamais un cas contrôlé.

**4. Les métriques du cahier sur le chemin réel, et une chronologie par
règle.** Pour chaque période : Q, R et la régression G/`G_new` selon les
conventions du cahier (F-REGRESSION : une règle retirée n'est pas une
régression). Pour chaque règle : la période de première satisfaction, les
périodes de régression et de rétablissement.

**5. Des mesures du code.** À chaque période, sur le commit du candidat :
lignes ajoutées et supprimées, fichiers touchés, nombre de fichiers de test
écrits par le candidat. Ces mesures décrivent ; elles n'entrent dans aucun
score de qualité.

**6. Des répétitions.** Le rapport agrège, par configuration, les
répétitions d'une campagne : moyenne, minimum et maximum de chaque mesure,
avec leur effectif. Aucun intervalle de confiance n'est affiché en dessous
de l'effectif que fixe T35.

## Le scénario `F-LONG`

Horloge initiale `2030-01-01T00:00:00Z`. Acteurs A à H ; locataire initial
`legacy`. Les montants sont des centimes entiers. Les horloges de période
sont : P1 `2030-01-01T00:00Z`, P2 `01:00Z`, P3 `2030-01-02T11:00Z`, P4
`13:00Z`, P5 `2030-01-03T00:00Z`, P6 `2030-01-04T00:00Z`, P7
`2030-01-05T00:00Z`, P8 `2030-01-07T00:00Z`, P9 `2030-03-30T12:00Z`, P10
`2030-04-01T00:00Z`, P11 `2030-04-02T00:00Z`, P12 `2030-04-03T00:00Z`.

**P1 à P4** — F-RESERVATION, inchangé : `reserve@1`, `idempotence@1`,
`fifo@1`, `cancel@1` puis `cancel@2` (24 heures, frontière incluse),
`isolation@1`. À l'entrée de P5, sur S1 : A annulé, B confirmé, C en
attente.

**P5 — capacité modifiable (`capacity@1`).** Nouveau créneau S2, capacité 1,
début `2030-01-10T12:00Z`. Augmenter une capacité promeut les attentes dans
l'ordre de la file. La réduire sous le nombre de confirmés rétrograde les
confirmés les plus récents, par séquence d'admission décroissante, en tête de
la file d'attente. Fait : A réserve S2 (confirmé) ; D réserve S2 (en
attente) ; capacité de S2 portée à 2 (D confirmé) ; E réserve S2 (en
attente) ; capacité ramenée à 1. **S2 : A confirmé, D en attente en position
1, E en position 2.**

**P6 — priorités (`priority@1` remplace `fifo@1`).** Chaque acteur a un
niveau, `standard` par défaut, ou `gold`. La file est ordonnée par niveau
(`gold` d'abord), puis par séquence d'admission. Le changement de niveau
réordonne immédiatement les files existantes. Fait : E passe `gold` (S2 : E
en position 1, D en position 2) ; A annule S2. **S2 : E confirmé, D en
attente en position 1, A annulé.**

**P7 — argent (`price@1`, `cancel@3` remplace `cancel@2`).** Chaque créneau
a un prix ; une confirmation intervenue à partir de P7 débite ce prix du
solde de l'acteur, qui commence à 0. L'annulation est désormais permise
jusqu'au début du créneau, avec remboursement : 100 % à 48 heures ou plus du
début, 50 % arrondi au centime inférieur entre 24 et 48 heures, 0 % à moins
de 24 heures. Fait : nouveau créneau S3, capacité 1, prix 1999, début
`2030-01-06T12:00Z`. À `2030-01-05T00:00Z`, B réserve S3 puis annule (36
heures avant) : remboursement 999. C réserve S3 ; à `2030-01-06T00:00Z` (12
heures avant), C annule — **ce qui était refusé sous `cancel@2`** —
remboursement 0. **Soldes : B −1000, C −1999.**

**P8 — quotas (`quota@1`).** Un acteur ne peut détenir plus de deux
réservations confirmées dans un même locataire. Une réservation au-delà est
refusée avec `QUOTA_EXCEEDED`, sans attente ni débit. Les dépassements
antérieurs sont conservés. Fait : créneaux S4, S5, S6, capacité 5, prix 0,
début `2030-01-20T12:00Z`. D réserve S4 puis S5 (confirmés ; son attente
sur S2 ne compte pas). **D réserve S6 : `QUOTA_EXCEEDED`.**

**P9 — fuseau horaire (`cancel@4` remplace `cancel@3`).** Le locataire
`legacy` est à l'heure de `Europe/Paris`. Le remboursement est intégral si
l'annulation a lieu au plus tard à 18:00 heure locale la veille du jour
local du créneau, nul sinon. Fait : créneau S7, capacité 1, prix 3000, début
`2030-03-31T10:00Z` ; F le réserve. La veille locale est le 30 mars, encore
à l'heure d'hiver (UTC+1) : l'échéance est `2030-03-30T17:00:00Z`. **Sur deux
copies de l'état, F annulant à `2030-03-30T17:00:00Z` reçoit 3000 ; à
`17:00:00.001Z`, 0.** Un candidat qui applique l'heure d'été du lendemain
(UTC+2) placerait l'échéance à 16:00Z et échouerait.

**P10 — historique (`history@1`).** Nouvelle opération : l'historique d'une
réservation, liste ordonnée d'événements. Les événements antérieurs à P10
ne sont pas exigés ; chaque réservation existant à l'entrée de P10 commence
par un unique événement `migrated` qui porte son statut courant. **Fait :
l'historique de E sur S2 commence par `migrated` avec le statut
`confirmed`.**

**P11 — retraits (`fifo@2` remplace `priority@1` ; `quota@1` est
retiré).** Les niveaux n'ont plus d'effet ; les files sont réordonnées par
séquence d'admission seule. Fait : créneau S8, capacité 1 ; F confirmé ;
G (`standard`) puis H (passé `gold` en P10, quand les niveaux comptaient encore) en attente. **S8 : G en
position 1, H en position 2.** D réserve S6 : confirmé (le quota ne
s'applique plus).

**P12 — transfert (`transfer@1`, exception étroite à `isolation@1`).**
Nouvelle opération : transférer une réservation d'un locataire à un autre,
à l'initiative du locataire d'origine. Après transfert, la réservation n'est
lisible que depuis le locataire de destination. Fait : nouveau locataire
`third` ; la réservation de B sur S1 est transférée de `legacy` à `other`.
**La réservation de B sur S1, lue depuis `other` : `confirmed` ; depuis
`legacy` : valeur nulle ; depuis `third` : `NOT_FOUND`.**

Ces faits ont été calculés à la main dans cet ADR. Le test-author de T61 les
recalcule indépendamment avant le gel ; tout désaccord ouvre un
`SPEC_CONFLICT` au lieu d'une correction silencieuse.

## Coût

Un pilote complet compte 12 périodes × 3 répétitions × 5 configurations,
soit 180 sessions `claude -p`. Au rythme du cinquième pilote, Opus 5.5 en
xhigh prendrait à lui seul de l'ordre de trois heures. Le pilote sur
l'abonnement du mandant est lancé configuration par configuration, et peut
être arrêté entre deux.

## Spécification des tâches T61 à T66

Format calqué sur le cahier. Chaque bloc est la source verbatim de la carte
de spec de sa tâche, et `bench spec-lint` le vérifie contre ce fichier.

**T61 — Le scénario F-LONG et son modèle attendu**

Dépendances : T60. Livrables : scénario de douze périodes F-LONG, dont P1 à P4 reprennent F-RESERVATION ; faits attendus figés dans la racine gelée `acceptance/reference-long` ; modèle attendu qui rejoue le scénario et produit, à chaque période, la valeur attendue de chaque contrôle.

Acceptation : `T61.A1` le modèle attendu produit chaque fait de F-LONG énoncé dans ADR-018, période par période, et P1 à P4 produisent les faits de F-RESERVATION ; `A2` à chaque période, l'ensemble des règles actives est celui d'ADR-018, une règle remplacée ou retirée n'étant plus active ; `A3` sur deux copies de l'état de P9, l'annulation de F à `2030-03-30T17:00:00Z` rembourse 3000 et à `2030-03-30T17:00:00.001Z` ne rembourse rien ; `A4` le remboursement de P7 arrondit au centime inférieur et les montants restent des entiers.

Commande : `pnpm verify:task T61`. Aucun service externe requis ; aucun appel réel.

**T62 — Le contrat bench.candidate/3 et l'énoncé des douze périodes**

Dépendances : T61. Livrables : contrat `bench.candidate/3` (opérations de F-LONG, dont la modification de capacité, le niveau, le solde, l'historique et le transfert) ; énoncé de chaque période de F-LONG ; exemples publics de chaque forme de réponse.

Acceptation : `T62.A1` l'énoncé de chaque période décrit chaque règle active, et décrit chaque règle remplacée ou retirée à cette période comme telle ; `A2` chaque nom de champ cité par un énoncé est un nom du contrat, et chaque forme de réponse, erreurs comprises, que le modèle attendu peut produire a au moins un exemple public de cette forme exacte ; `A3` aucun exemple public ne reproduit une valeur attendue par un contrôle de la période ; `A4` l'énoncé d'une période ne décrit aucune règle d'une période ultérieure.

Commande : `pnpm verify:task T62`. Aucun service externe requis ; aucun appel réel.

**T63 — Un état qui dure d'une période à l'autre**

Dépendances : T62. Livrables : répertoire de données passé au candidat par `BENCH_DATA_DIR`, conservé de P1 à P12 ; trajectoire principale appliquée à cet état ; sondes appliquées à des copies jetables.

Acceptation : `T63.A1` un candidat de référence qui conserve son état dans `BENCH_DATA_DIR` retrouve en P12 les réservations créées en P1 à P11, à travers un redémarrage de son processus entre chaque période ; `A2` un candidat qui garde son état en mémoire seulement viole, dès la période suivante, chaque contrôle qui dépend d'un état antérieur ; `A3` une sonde appliquée à une copie ne modifie pas l'état de la trajectoire principale.

Commande : `pnpm verify:task T63`. PostgreSQL et le stockage objet sont requis ; aucun appel réel.

**T64 — Des contrôles larges et cachés**

Dépendances : T63. Livrables : génération, à partir d'une graine, d'un lot de séquences par règle active, appliquées à des copies de l'état ; score par règle et par période.

Acceptation : `T64.A1` même graine, même lot de séquences, et deux graines différentes donnent deux lots différents ; `A2` aucune séquence générée n'est identique à un exemple public ni ne figure dans le prompt ; `A3` le score d'une règle à une période est la fraction de ses séquences satisfaites, et un candidat de référence qui ne traite que le cas de la trajectoire principale obtient un score strictement inférieur à 1 sur au moins une règle de chaque période à partir de P5 ; `A4` le lot de chaque règle compte au moins 20 séquences.

Commande : `pnpm verify:task T64`. PostgreSQL et le stockage objet sont requis ; aucun appel réel.

**T65 — Les mesures longitudinales sur le chemin réel**

Dépendances : T64. Livrables : Q, R, G et `G_new` par période, calculés par les fonctions de T04 sur les contrôles réels ; chronologie par règle ; mesures du code par période.

Acceptation : `T65.A1` à chaque période persistée, Q, R, G et `G_new` sont ceux que donnent les fonctions de T04 sur les contrôles de la période ; `A2` une règle remplacée ou retirée n'est pas comptée en régression, et une règle active autrefois satisfaite puis violée l'est ; `A3` la chronologie d'une règle donne sa première période de satisfaction, ses périodes de régression et de rétablissement ; `A4` chaque période persistée porte les lignes ajoutées et supprimées, les fichiers touchés et le nombre de fichiers de test du commit du candidat, et ces mesures n'entrent dans aucun score.

Commande : `pnpm verify:task T65`. PostgreSQL et le stockage objet sont requis ; aucun appel réel.

**T66 — Le pilote F-LONG avec répétitions**

Dépendances : T65. Livrables : `bench pilot-conduct --provider claude-cli --live` sur F-LONG, avec plusieurs répétitions par configuration ; rapport agrégé par configuration.

Acceptation : `T66.A1` lancé avec le faux exécutable `claude` sur douze périodes et trois répétitions, un candidat de référence qui implémente F-LONG obtient un score de 1 sur chaque règle active à chaque période ; `A2` le rapport donne, par configuration, la moyenne, le minimum, le maximum et l'effectif de chaque mesure, et n'affiche aucun intervalle de confiance en dessous de l'effectif fixé par T35 ; `A3` un candidat de référence qui implémente fidèlement P1 à P6 puis ignore les remplacements de P7 et P11 obtient des scores inférieurs à 1 sur `cancel@3` et `fifo@2`, sans régression comptée pour `cancel@2` ni `priority@1`.

Commande : `pnpm verify:task T66`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
