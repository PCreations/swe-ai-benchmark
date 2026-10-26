# ADR-021 — F-PLATFORM : un scénario beaucoup plus dur, écrit une seule fois

    statut : PROPOSÉ — rédigé le 26/10/2026 à la demande du mandant (« il faut
             très fortement complexifier les scénarios, genre vraiment
             beaucoup beaucoup »), soumis à sa validation
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

## Ce qui n'est pas encore fixé

Les clauses exactes de chaque période, leurs textes et leurs faits attendus
sont écrits dans la première tâche du chantier, puis gelés. La liste des
tâches (T70 et suivantes) sera inscrite au registre une fois ce plan validé.
