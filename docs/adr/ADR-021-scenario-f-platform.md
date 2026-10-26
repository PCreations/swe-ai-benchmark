# ADR-021 — F-PLATFORM : un scénario beaucoup plus dur, écrit une seule fois

    statut : ACCEPTÉ — par le mandant le 26/10/2026 (« Ok Sonnet medium,
             lance le chantier en autonomie »), après « Ok good » sur le plan,
             « comme un vrai projet avec tickets et docs » et le protocole à
             deux bras (« développer en ATDD et en respectant les principes
             SOLID »). Rédigé à sa demande (« il faut très fortement
             complexifier les scénarios, genre vraiment beaucoup beaucoup »).
    modèle développeur de la première expérience : Sonnet 5.5, effort medium
    ouvert : 26/10/2026
    porte  : un nouveau scénario, son modèle attendu, ses énoncés, ses
             contrôles et le pilote ; F-LONG reste en place
    origine : passage court F-LONG (docs/pilot/pilote-reel-2026-10-25-f-long-court.json)

## Ce que les pilotes F-LONG ont montré

1. **F-LONG ne départage plus.** Une fois retirées les trois règles mal
   énoncées, quatre configurations sur cinq réussissent 100 % des séquences
   cachées. Seul le coût les sépare.
2. **Le même défaut, trois fois.** L'énoncé que reçoit le candidat et le
   modèle attendu qui le note sont écrits séparément. Au premier pilote, le
   vocabulaire manquait (ADR-020). Au passage court, une règle se contredisait
   (`cancel@2` contre le point 3 d'ADR-019), une autre manquait (point 5) et
   l'unité des montants n'était pas dite. Chaque défaut a coûté un pilote. Un
   scénario dix fois plus gros en produirait dix fois plus.

## Décision

### 1. Une seule source exécutable

Le scénario est écrit **une seule fois**, sous forme de **clauses** : chaque
clause a un identifiant, une période d'entrée, éventuellement une période de
sortie et la clause qu'elle remplace, son texte exact pour l'énoncé, le
fragment de contrat qu'elle introduit (opérations, champs, valeurs, codes
d'erreur, exemples) et sa mise en œuvre dans le modèle attendu.

De cette source unique dérivent, mécaniquement :
- l'énoncé et le contrat d'interface de chaque période ;
- le modèle attendu ;
- les séquences de contrôle, dont **chaque attente cite la clause qui la
  justifie**.

Trois propriétés deviennent vérifiables par machine :
- **complétude** : toute clause citée par une attente d'une période figure
  dans l'énoncé de cette période ;
- **non-contradiction** : deux clauses actives ne gouvernent jamais la même
  décision, sauf si l'une remplace explicitement l'autre ;
- **unités et formats** : chaque grandeur comparée (montant, instant, durée,
  identifiant) a son unité et son format déclarés dans une clause active.

Les faits attendus, calculés à la main, sont figés dans une racine gelée,
comme pour F-RESERVATION et F-LONG. Le modèle attendu doit les reproduire.

### 2. Un scénario de 24 périodes : F-PLATFORM

Une plateforme de réservation multi-sites. Chaque période ajoute, change ou
retire des règles, et beaucoup forcent à revoir la conception :

| Période | Ce qui arrive | Difficulté visée |
|---|---|---|
| P1 | Réservation simple, capacité, idempotence | socle |
| P2 | File d'attente, promotion à l'annulation | état |
| P3 | Locataires isolés | sécurité |
| P4 | Membres et rôles (admin, staff, membre), refus `FORBIDDEN` | autorisation transversale |
| P5 | Créneaux récurrents hebdomadaires, avec exceptions (jours fériés) | modèle de données |
| P6 | Réservations de groupe (N places, tout ou rien), file d'attente des groupes | combinatoire |
| P7 | Prix par place, remises par niveau d'abonnement, arrondi au centime déclaré | arithmétique exacte |
| P8 | Portefeuille de crédits : paiement crédits puis carte, remboursement au prorata vers chaque source | comptabilité |
| P9 | Politique d'annulation par paliers, fuseau du site, changements d'heure | temps |
| P10 | Absences : 3 absences en 30 jours valent 7 jours d'interdiction | règles temporelles croisées |
| P11 | **Migration** : les places deviennent numérotées ; affectation déterministe des réservations existantes ; groupes en places contiguës | refonte du modèle |
| P12 | **Rapport de bug** : un scénario de reproduction est fourni, sans la cause | débogage |
| P13 | Surréservation de 10 % sur les créneaux non numérotés, compensation en crédits | exceptions |
| P14 | Factures mensuelles immuables, corrections par avoirs, rapprochement avec le portefeuille | invariants |
| P15 | Multi-devises, table de taux datée, arrondi de conversion déclaré | précision |
| P16 | Changement de prix rétroactif : seules les confirmations futures, avoirs pour les trop-perçus | rétroactivité |
| P17 | **Fusion de deux locataires** : collisions d'identifiants, historique conservé | migration de données |
| P18 | Effacement RGPD d'un membre : anonymisation, totaux de factures intacts | contraintes contradictoires |
| P19 | Rapports d'occupation et de revenus : filtres, pagination, tri stable | requêtes |
| P20 | **Volume** : import de 50 000 réservations, latence bornée par opération | performance |
| P21 | **Concurrence** : clients parallèles, dernière place disputée, rejeux simultanés | concurrence |
| P22 | Retraits : fin des remises par niveau (factures émises inchangées) ; crédits expirant 12 mois après l'achat, y compris les anciens | retrait et rétroactivité |
| P23 | Transferts de réservation entre membres, avec échange de places et frais | interactions |
| P24 | **Contrat v2** : champs renommés, l'ancien contrat doit continuer de fonctionner | évolution d'API |

### 3. Des contrôles qui départagent

- **Séquences ciblées** par clause, comme pour T68, mais ancrées sur les
  frontières de chaque clause et de ses interactions avec les autres.
- **Tests différentiels aléatoires** : à chaque période, de longs flux
  d'opérations générés au hasard (plusieurs milliers d'opérations, graine
  fixe) sont joués contre le candidat et le modèle attendu. Le score est la
  fraction de flux sans divergence, et la première divergence est
  diagnostiquée avec sa clause.
- **Performance** (P20 et suivantes) : latence au 95ᵉ centile par opération
  sur le volume importé, contre un plafond déclaré dans une clause.
- **Concurrence** (P21 et suivantes) : aucun dépassement de capacité ni
  doublon idempotent sous requêtes parallèles, sur de nombreux essais.
- **Régressions** : chaque clause encore active est recontrôlée à chaque
  période (G et `G_new` du cahier).

### 4. Comme un vrai projet : tickets et documentation dans le dépôt

Le prompt n'empile plus des couches de contrat. À chaque période, le moteur
écrit dans le dépôt du candidat, à partir de la même source de clauses :
- `docs/spec.md` : la spécification consolidée et à jour ;
- `docs/api.md` : le contrat d'interface en vigueur (opérations, réponses,
  valeurs exactes, codes d'erreur, exemples) ;
- `docs/tickets/Pnn.md` : le ticket de la période (ce qui change et pourquoi,
  ce qui est ajouté, modifié ou retiré, critères d'acceptation avec exemples).

Le prompt est court, comme un ticket assigné : il renvoie au ticket, à la spec
et au contrat. Le moteur réécrit ces trois emplacements à chaque période ; le
reste du dépôt (code, tests, notes) appartient au candidat.

### 5. Ce qu'on mesure : l'effet de la qualité du code sur le coût futur

Question de recherche : **la qualité du code produit change-t-elle le coût du
développement futur pour un modèle ?**

Protocole : deux bras, partis de zéro, sur les mêmes 24 tickets, avec le même
modèle, le même effort et le même outil (Claude Code non interactif). La seule
différence est une phrase de méthode ajoutée à chaque prompt du bras B.

| Bras | Consigne ajoutée au prompt |
|---|---|
| A — naturel | aucune : seulement le ticket, la spec et le contrat |
| B — discipliné | développer en ATDD (tests d'acceptation écrits d'abord, à partir des critères du ticket) et respecter les principes SOLID |

Chaque bras est répété (trajectoires indépendantes), pour séparer l'effet de
la méthode du hasard du modèle.

Mesures, à chaque période :
- **coût** : tokens par catégorie, tours, durée de la session ;
- **résultat** : score par clause (séquences ciblées et tests différentiels),
  régressions G et `G_new` ;
- **qualité du code**, comme vérification que la consigne a eu un effet :
  complexité, duplication, taille des fonctions et des fichiers, nombre de
  tests écrits par le candidat et leur couverture.

Analyse : le coût par période et le coût cumulé de B rapporté à A, à résultat
comparable, avec les outils statistiques du cahier (rapport de coûts,
bootstrap, calcul de puissance). L'hypothèse à éprouver : B coûte plus au
début, puis moins quand le projet grossit et que les tickets imposent des
refontes (P11, P17, P24). Le calcul de puissance (T35) fixe le nombre de
répétitions nécessaire.

### 6. Le garde-fou avant tout pilote

Avant une campagne, une **calibration** : un candidat de référence,
implémenté à partir du seul énoncé, doit obtenir 1 sur chaque clause à chaque
période. Tout échec de calibration est un défaut de l'énoncé, jamais du
candidat, et bloque la campagne.

## Coût

F-PLATFORM est un chantier de l'ordre de dix tâches. L'expérience compte
2 bras × R répétitions × 24 périodes sessions pour un modèle ; avec R = 3,
144 sessions. Elle est précédée d'un passage court (1 répétition par bras).

## Spécification des tâches T70 à T77

Format calqué sur le cahier. Chaque bloc est la source verbatim de la carte
de spec de sa tâche, et `bench spec-lint` le vérifie contre ce fichier.

**T70 — La source de clauses de F-PLATFORM, périodes P1 à P8**

Dépendances : T69. Livrables : format de clause ; clauses des périodes P1 à P8 de F-PLATFORM ; modèle attendu qui exécute les clauses ; vérifications de complétude, de non-contradiction et d'unités ; faits attendus de P1 à P8 calculés à la main et gelés dans la racine `acceptance/reference-platform`.

Acceptation : `T70.A1` chaque clause porte un identifiant, une période d'entrée, une période de sortie éventuelle, la clause qu'elle remplace éventuellement, son texte d'énoncé, son fragment de contrat et sa mise en œuvre dans le modèle attendu ; `A2` le modèle attendu rejoué sur la trajectoire principale de P1 à P8 reproduit chaque fait gelé ; `A3` deux clauses actives à une même période ne gouvernent jamais la même décision, sauf si l'une remplace explicitement l'autre, et une source où deux clauses le font est refusée par la vérification en nommant les deux clauses ; `A4` chaque grandeur comparée a son unité et son format déclarés dans une clause active, et une source où une grandeur comparée n'en a pas est refusée en nommant la grandeur.

Commande : `pnpm verify:task T70`. Aucun service externe requis ; aucun appel réel.

**T71 — Les clauses de F-PLATFORM, périodes P9 à P16**

Dépendances : T70. Livrables : clauses des périodes P9 à P16 ; faits attendus de P9 à P16 calculés à la main et gelés.

Acceptation : `T71.A1` le modèle attendu rejoué sur la trajectoire principale de P1 à P16 reproduit chaque fait gelé, dont les frontières d'annulation autour d'un changement d'heure et les arrondis de conversion de devises ; `A2` la migration de P11 affecte à chaque réservation existante une place déterministe, et deux rejeux de la migration sur le même état donnent la même affectation ; `A3` à chaque période à partir de P14, les factures et avoirs de chaque membre se rapprochent exactement de son portefeuille ; `A4` les vérifications de T70 (complétude, non-contradiction, unités) passent sur P1 à P16.

Commande : `pnpm verify:task T71`. Aucun service externe requis ; aucun appel réel.

**T72 — Les clauses de F-PLATFORM, périodes P17 à P24**

Dépendances : T71. Livrables : clauses des périodes P17 à P24 ; faits attendus de P17 à P24 calculés à la main et gelés.

Acceptation : `T72.A1` le modèle attendu rejoué sur la trajectoire principale de P1 à P24 reproduit chaque fait gelé ; `A2` la fusion de locataires de P17 conserve l'historique de chaque réservation et résout chaque collision d'identifiants selon sa clause ; `A3` à partir de P24, chaque opération du contrat v1 et son équivalent v2 produisent le même effet et des réponses équivalentes selon la correspondance déclarée ; `A4` l'effacement de P18 anonymise le membre sans changer le total d'aucune facture ; `A5` les vérifications de T70 passent sur P1 à P24.

Commande : `pnpm verify:task T72`. Aucun service externe requis ; aucun appel réel.

**T73 — Tickets et documentation dans le dépôt du candidat**

Dépendances : T72. Livrables : génération, à chaque période, de `docs/spec.md`, `docs/api.md` et `docs/tickets/Pnn.md` dans le dépôt du candidat, à partir de la source de clauses ; prompt court qui y renvoie.

Acceptation : `T73.A1` à chaque période, `docs/spec.md` contient le texte de chaque clause active et d'aucune clause inactive, et `docs/api.md` contient chaque valeur comparée avec le nom de son champ et au moins un exemple de chaque forme de réponse comparée ; `A2` `docs/tickets/Pnn.md` liste exactement les clauses ajoutées, remplacées et retirées par rapport à la période précédente, avec des critères d'acceptation illustrés d'exemples ; `A3` le prompt de la période renvoie à ces trois fichiers et ne contient le texte d'aucune clause ; `A4` une modification par le candidat de l'un de ces trois fichiers est remplacée à la période suivante, et tout autre fichier du dépôt est conservé.

Commande : `pnpm verify:task T73`. PostgreSQL et le stockage objet sont requis ; aucun appel réel.

**T74 — Contrôles ciblés et tests différentiels**

Dépendances : T73. Livrables : séquences ciblées par clause ; flux différentiels aléatoires joués contre le candidat et le modèle attendu ; diagnostic de chaque échec avec sa clause.

Acceptation : `T74.A1` chaque attente d'une séquence ciblée cite une clause active à la période et présente dans `docs/spec.md` ; `A2` à chaque période, au moins dix flux différentiels d'au moins mille opérations chacun sont générés de façon déterministe à partir d'une graine, et le score différentiel est la fraction de flux sans divergence ; `A3` chaque échec ciblé ou différentiel persisté porte l'opération, l'attendu, la réponse reçue et la clause ; `A4` un candidat de référence qui implémente la source obtient 1 partout, et le même candidat privé d'une clause obtient moins de 1 sur cette clause et sur le score différentiel d'au moins une période où elle est active.

Commande : `pnpm verify:task T74`. PostgreSQL et le stockage objet sont requis ; aucun appel réel.

**T75 — Contrôles de performance et de concurrence**

Dépendances : T74. Livrables : import en volume et mesure de latence à partir de P20 ; essais concurrents à partir de P21.

Acceptation : `T75.A1` à partir de P20, cinquante mille réservations sont importées, la latence au 95e centile de chaque opération est mesurée et comparée au plafond de sa clause, et un candidat de référence qui parcourt toutes les réservations à chaque opération dépasse le plafond et échoue ; `A2` à partir de P21, sur au moins cent essais de requêtes parallèles, aucun dépassement de capacité ni doublon idempotent n'est toléré, et un candidat de référence sans exclusion mutuelle échoue.

Commande : `pnpm verify:task T75`. PostgreSQL et le stockage objet sont requis ; aucun appel réel.

**T76 — Le pilote F-PLATFORM à deux bras**

Dépendances : T75. Livrables : bras déclarés dans le manifeste avec leur consigne de méthode ; pilote F-PLATFORM de 24 périodes par trajectoire ; mesures de qualité du code ; rapport comparatif des bras.

Acceptation : `T76.A1` le prompt du bras B est identique octet pour octet à celui du bras A à la même période, à l'ajout près de la consigne de méthode déclarée par le manifeste (ATDD et principes SOLID) ; `A2` lancé par `bench pilot-conduct --provider claude-cli --live` avec le faux exécutable `claude`, sur 24 périodes et deux trajectoires par bras, chaque période persistée porte les coûts, les scores ciblés et différentiels, les régressions, et les mesures de qualité du code (complexité, duplication, taille des fonctions et des fichiers, nombre de tests écrits par le candidat, couverture) ; `A3` le rapport donne, par bras et par période, la moyenne, le minimum, le maximum et l'effectif de chaque mesure, et le rapport du coût de B sur celui de A par période et cumulé, avec la méthode de rééchantillonnage de T33 sur les trajectoires.

Commande : `pnpm verify:task T76`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.

**T77 — La calibration avant toute campagne**

Dépendances : T76. Livrables : calibration d'une source de clauses par un candidat de référence dérivé des seuls documents remis ; refus de lancer une campagne sans calibration réussie pour la source en vigueur.

Acceptation : `T77.A1` `bench pilot-conduct --live` sur F-PLATFORM refuse de démarrer, avant toute session, s'il n'existe pas de calibration réussie pour l'empreinte de la source de clauses en vigueur ; `A2` une calibration réussit quand un candidat de référence, dont les noms, valeurs et formes proviennent des seuls `docs/spec.md`, `docs/api.md` et `docs/tickets/Pnn.md` remis, obtient 1 sur chaque clause à chaque période ; `A3` une calibration sur une source où une clause comparée manque de `docs/spec.md` échoue en nommant la clause et la période.

Commande : `pnpm verify:task T77`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
