# ADR-009 — Un candidat qui peut développer, et dont on contrôle le code

    statut : PROPOSÉ — en attente de la décision du mandant
    ouvert : 12/10/2026
    porte  : la session `claude -p` (T47), le contrat d'application (T48),
             le pilote à candidat réel (T49), les contrôles de période (T11)
    origine : relecture du chemin `claude-cli` avant le premier essai réel ;
              le mandant a répondu « Oui » à la rédaction de cet ADR

## Ce que la relecture a trouvé

Les 50 tâches étaient prouvées à HEAD (`bench resume` exit 3, à `451ee02`).
Avant de consommer l'abonnement du mandant, j'ai lu le chemin réellement
exécuté par `bench pilot-conduct --provider claude-cli --live`. Trois défauts
le vident de son sens. Les tests passent parce que les cas d'ADR-008 ne les
exigeaient pas : la faiblesse est dans la spécification, pas dans
l'implémentation.

**1. Le candidat ne peut rien écrire.** La session est lancée avec `-p
--output-format json --no-session-persistence --model <m>` seulement
(`packages/agents/src/index.ts`, `launchClaudeCliPeriod`). Sans mode de
permission ni liste d'outils autorisés, un `claude -p` refuse les outils qui
demandent une permission, dont l'édition de fichiers. ADR-008 prévoyait ces
options dans sa décision ; aucun cas ne les exigeait.

**2. Le code produit n'est jamais exercé.** `run-period-claude-cli.ts` le
déclare lui-même : « le code écrit par la session est COMMIS, jamais DÉPLOYÉ
ni EXERCÉ ». Le pilote mesurerait des tokens, aucune qualité.

**3. Le contrat ne correspond pas au domaine contrôlé.** Le contrat de T48
(`candidate-period.ts`) est un stockage clé-valeur — `create_tenant`,
`write`, `read`, `probe_cancel`, `fingerprint`. Les contrôles du scénario
(`reserve@1`, `idempotence@1`, `cancel@1`, `fifo@1`, `isolation@1`,
`packages/scenario/src/demo-controls.ts`) portent sur une application de
réservation (`ScriptedApplication`, `demo-application.ts`). Un candidat qui
respecterait le contrat actuel ne pourrait pas être contrôlé. Et le prompt de
T49 annonce un échange d'opérations `{op,args}` sans en donner la liste ni la
forme.

## Décision proposée

**Un contrat aligné sur l'application contrôlée : `bench.candidate/2`.** Le
processus du candidat expose, en JSON ligne à ligne sur l'entrée et la sortie
standard, exactement les opérations de `ScriptedApplication` : créer un
locataire, avancer l'horloge métier, soumettre une écriture (`reserve` ou
`cancel`, avec acteur, locataire, séquence d'admission et clé d'opération),
lire une vue, sonder une annulation sans effet, rendre une empreinte de
l'état. Formes des arguments et des réponses : celles des types de
`packages/scenario`. Un adaptateur présente ce processus aux contrôles
existants comme l'application scriptée ; les contrôles ne changent pas.

**Une seule description du contrat.** Le prompt du candidat et l'adaptateur
lisent la même description : ce qu'on demande au candidat est, par
construction, ce qu'on exercera.

**Le candidat peut développer, dans son espace de travail seulement.** La
session reçoit un mode de permission non interactif et une liste explicite
d'outils : lire, chercher, éditer et créer des fichiers, lancer des
commandes. Aucun répertoire supplémentaire, aucun contournement des
permissions.

**Chaque période est exercée et contrôlée.** Après le développement, le
moteur lance le code du commit de fin, joue le plan d'usages de la période et
applique les contrôles. Les statuts sont persistés avec la période. Un code
qui ne démarre pas est contrôlé comme une application non déployée : ses
contrôles échouent, ils ne sont jamais omis.

## Limites assumées

- **Toujours hors sandbox T19.** Le code du candidat et les commandes de la
  session tournent sur l'hôte, bornés par la liste d'outils et le répertoire
  de travail, pas isolés (ADR-008).
- **Les contrôles sont ceux du scénario de démonstration.** Ils comparent le
  candidat à l'oracle de réservation ; ils ne disent rien d'un autre domaine.
- **Le contrat v1 de T48 reste en place** pour ses propres cas ; `v2` s'y
  ajoute, il ne le remplace pas.

## Spécification des tâches T50 et T51

Format calqué sur le cahier. Ces blocs sont la source verbatim des cartes de
spec de T50 et T51, et `bench spec-lint` les vérifie contre ce fichier.

**T50 — Permettre au candidat de développer**

Dépendances : T47 et T49. Livrables : la session `claude -p` d'une période reçoit un mode de permission non interactif et une liste explicite d'outils de lecture, d'édition et de commande, limitée à l'espace de travail ; le prompt contient la description complète du contrat `bench.candidate/2`.

Acceptation : `T50.A1` chaque session est lancée avec un mode de permission non interactif et une liste explicite d'outils autorisés couvrant la lecture, la recherche, l'édition et la création de fichiers et l'exécution de commandes ; `A2` aucune session n'est lancée avec un répertoire supplémentaire, avec un mode qui contourne les permissions ni avec une option qui les désactive ; `A3` le prompt d'une période contient le nom de chaque opération du contrat `bench.candidate/2` et la forme de ses arguments et de sa réponse, identiques à la description qu'emploie l'adaptateur de T51 ; `A4` un fichier écrit dans l'espace de travail pendant la session figure dans le commit de fin de la période.

Commande : `pnpm verify:task T50`. Un faux exécutable `claude` placé en tête du `PATH` remplace la CLI ; aucun appel réel.

**T51 — Exercer et contrôler le code du candidat à chaque période**

Dépendances : T11, T48 et T50. Livrables : contrat `bench.candidate/2` aligné sur l'application scriptée ; adaptateur qui présente le processus du candidat aux contrôles existants ; après le développement de chaque période à candidat réel, lancement du code du commit de fin, exécution du plan d'usages et des contrôles, statuts persistés avec la période et agrégés dans le rapport de fin.

Acceptation : `T51.A1` une application de référence respectant `bench.candidate/2`, exercée période par période sur le scénario de démonstration, obtient exactement les statuts de contrôle de l'application scriptée nominale, et une application de référence fautive obtient exactement ceux de la variante fautive ; `A2` chaque période persistée à candidat réel porte, pour chaque contrôle, son identifiant, son statut et les deux termes comparés, calculés sur le code de son commit de fin ; `A3` un code candidat qui ne démarre pas, ne répond pas dans le délai ou viole le format du contrat produit une période persistée comme non déployée avec un motif nommé, dont les contrôles sont évalués et échouent, sans qu'aucun soit omis ; `A4` le rapport de fin donne, par trajectoire et par période, le nombre de contrôles satisfaits et violés, égal aux statuts persistés ; `A5` aucun fichier de l'oracle, des contrôles ou des exigences d'une période suivante n'est écrit dans l'espace de travail du candidat.

Commande : `pnpm verify:task T51`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
