# ADR-007 — Pilote longitudinal réel, et le token comme seule unité enregistrée

    statut : ACCEPTÉ — par le mandant le 04/10/2026 (« oui vas-y, étends le
             registre et lance T44 et T45 »)
    ouvert : 04/10/2026
    porte  : `bench campaign` / `bench pilot` (orchestration), §E `ModelCall`
             (ce qui est enregistré), `verification/runner/registry.mjs`
             (nombre de tâches), ADR-002 (unité)
    origine : demande du mandant après le premier pilote en mode `recorded` —
              « il faut absolument un vrai pilote longitudinal », et
              « retire les limites de budget, je suis sur un forfait au token,
              on se contente de noter le nombre de token et sur quel modèle »

## Ce que j'ai mesuré avant de proposer quoi que ce soit

Le premier pilote a tourné. Les quatre faits ci-dessous sont lus en base, pas
déduits.

**1. Les tokens sont déjà enregistrés — mais trop grossièrement pour ADR-002.**
`model_calls.usage` porte, pour chacun des 48 appels de `golden-six` :

    {"output_tokens": 20, "input_cached_tokens": 40, "input_uncached_tokens": 100}

Trois catégories. Or ADR-002 en pondère **cinq** : `input_fresh` (1),
`cache_write_5m` (1,25), `cache_write_1h` (2), `cache_read` (0,1), `output` (5).
« cached » confond donc une catégorie de poids **0,1** avec deux de poids
**1,25** et **2**. En l'état, le vecteur enregistré **ne peut pas être pondéré**
selon la décision déjà prise par ADR-002.

**2. Le modèle n'est pas enregistré du tout.** Les colonnes existent et sont
vides :

    SELECT provider, model, input_tokens, output_tokens FROM model_calls LIMIT 1
    -> NULL | NULL | NULL | NULL      (sur les 48 lignes)

Un banc d'essai qui compare des modèles n'enregistre pas lequel il a appelé.
Les colonnes dédiées `input_tokens` / `output_tokens` sont vides elles aussi,
en doublon inutile du JSON `usage`.

**3. Le plafond budgétaire est déjà retirable, sans une ligne de code.**
Expérience contrôlée sur `manifest-nominal.json`, seul le plafond changeant :

    cap  1 000 micro-USD  ->  SUCCESS  2, FAILED 34, total     680
    cap 20 000 micro-USD  ->  SUCCESS 36, FAILED  0, total  12 240  (= 36 x 340)

Il n'y a donc rien à retirer : il y a un plafond à déclarer assez haut. Et il
faut qu'il reste **déclaré** — T39.A2 exige qu'un budget ABSENT (`{}`) produise
un refus listant les prérequis manquants. « Pas de limite » doit s'écrire, pas
s'omettre.

**4. `campaign` ne conduit pas `run-period`.** Après `golden-six` :

    model_calls 48 · budget_reservations 48 · ledger_entries 48 (somme 16 320)
    trajectories 0 · periods 0 · agent_submissions 0 · deployments 0
    checkpoints 0 · artifact_refs 0

Et `run-period`, lui, persiste et reprend réellement : deux appels successifs
sur la même trajectoire rendent `period_index` 1 puis 2, l'état étant relu en
base. Mais les deux chemins écrivent dans des schémas **disjoints** —
`campaign` crée `trajectories`, `run-period` crée
`bench_run_period_trajectories`. On ne peut donc ni continuer une campagne
période par période, ni agréger des périodes en campagne.

**Ce n'est pas un défaut au sens du cahier** : T39.A1 dit « **compile** 36
trajectoires et 432 périodes », T39.A4 « teste la **mécanique** ». Les 279 cas
passent. Mais le corpus longitudinal que le programme pilote doit étudier n'est
pas produit.

## La décision à prendre

Les quatre travaux ci-dessous sont **hors des 279 cas**. Aucun n'est couvert, et
trois touchent le chemin de mesure — c'est-à-dire exactement le code dont ce
dépôt existe pour garantir qu'il est prouvé.

| # | Travail | Zone | Couvert par un cas ? |
|---|---|---|---|
| A | enregistrer `provider` et `model` sur chaque appel | IMPL | non |
| B | affiner `usage` aux cinq catégories d'ADR-002 | IMPL + §E | non |
| C | orchestrateur longitudinal conduisant `run-period` par trajectoire | IMPL | non |
| D | rapport en tokens pondérés, l'argent devenant une vue dérivée | IMPL | non |

**Ce que je propose, et pourquoi je ne le fais pas sans accord :** les livrer
comme **tâches T44 à T47**, avec leurs cas d'acceptation, leur porte rouge,
leurs mutants et leurs auditeurs — le même chemin que les 44 autres.

Deux raisons, dont la seconde est la vraie.

1. `verification/runner/registry.mjs` ligne 144 code en dur
   `if (byId.size !== 44)`. Une 45ᵉ tâche rend le registre **invalide** (sortie
   2) et arrête tout. Étendre le registre est donc un geste explicite, pas un
   ajout silencieux — et le cahier §A l'exige en ces termes : « toute
   modification d'un résultat attendu ou d'une règle scientifique exige une
   modification explicite et tracée de ce cahier ».

2. Le point 2 ci-dessus est la démonstration vivante de pourquoi ces quatre
   travaux doivent être prouvés : la colonne `model` **existait déjà**, personne
   n'a jamais prouvé qu'elle était remplie, et elle est vide. Écrire
   l'orchestrateur longitudinal hors des portes reproduirait exactement cette
   erreur, sur le code qui produira les chiffres de l'étude.

## L'alternative, dite honnêtement

On peut livrer A à D **hors du périmètre prouvé**, en quelques heures au lieu de
plusieurs tours. Le paquet de passation devra alors porter que l'instrumentation
de mesure du pilote n'est pas couverte par les 279 cas — et tout chiffre produit
par le pilote héritera de cette réserve.

Je ne recommande pas cette voie pour A, B et D, qui sont le chemin de mesure.
Elle est défendable pour C seul, l'orchestrateur n'étant qu'une boucle au-dessus
de `run-period`, qui est lui prouvé (T23).

## Arbitrage

Le mandant a retenu la voie prouvée pour les trois pièces, le 04/10/2026, après
la correction suivante : l'orchestrateur n'est **pas** « une simple boucle au-dessus
de `run-period` ». `packages/activities/src/run-period.ts` code en dur
`scenario_id: 'SCN-F-RESERVATION'` et `configuration_id: 'CFG-RECORDED-LOCAL'`
(lignes 445-446) : une boucle produirait N trajectoires du même scénario sous la
même configuration, et ne pourrait rien comparer. L'orchestrateur exige donc de
paramétrer `run-period`, qui est dans le chemin de mesure.

## Où vivent ces tâches, et pourquoi pas dans `verification/tasks.json`

`acceptance/T43.spec.ts` lève une exception **au chargement** si
`verification/tasks.json` ne contient pas exactement 44 tâches (« cahier:L8 —
Il comporte 44 taches, T00 a T43 »). Y ajouter T44 casserait T43 et ferait
perdre `HANDOFF_COMPLETE` — pour une raison juste : ce fichier **est** le
registre du cahier, et le cahier compte 44 tâches.

Les tâches issues de cet ADR vivent donc dans `verification/tasks.extensions.json`
et leurs cas dans `verification/cases.extensions.lock.json`. La frontière de
provenance devient structurelle : on sait au nom du fichier si une tâche vient
du cahier épinglé ou d'un ADR accepté. `bench resume` les fusionne.

## Spécification des tâches T44 à T46

Format calqué sur le cahier. Ces blocs sont la source verbatim des cartes de
spec de T44 à T46, et `bench spec-lint` les vérifie contre ce fichier comme il
vérifie les 44 autres contre le cahier.

**T44 — Enregistrer le modèle et le vecteur de tokens de chaque appel**

Dépendances : T17 et T28. Livrables : chaque appel modèle réglé porte le fournisseur, le modèle effectivement appelé et le vecteur de tokens à cinq catégories d'ADR-002 ; un usage plus grossier que ces cinq catégories est enregistré tel quel et marqué non ventilé, jamais redistribué.

Acceptation : `T44.A1` chaque appel réglé porte un `provider` et un `model` non vides, égaux à ceux que le fournisseur a déclarés pour cet appel ; `A2` le vecteur d'usage porte exactement `input_fresh`, `cache_write_5m`, `cache_write_1h`, `cache_read` et `output`, en entiers non négatifs ; `A3` deux fournisseurs factices déclarant deux modèles distincts produisent deux valeurs de `model` distinctes ; `A4` un usage qui ne distingue pas lecture et écriture de cache est conservé dans une catégorie explicitement non ventilée, et aucune de ses unités n'est attribuée à `cache_read`, `cache_write_5m` ou `cache_write_1h`.

Commande : `pnpm verify:task T44`. Aucun accès à une API réelle n'est nécessaire.

**T45 — Paramétrer une période par scénario et par configuration**

Dépendances : T23. Livrables : `run-period` accepte un scénario et une configuration ; la première période d'une trajectoire fixe son scénario et sa configuration, que chaque période suivante relit depuis l'état persistant.

Acceptation : `T45.A1` deux trajectoires lancées avec deux configurations distinctes persistent chacune la sienne, relue à chaque période suivante ; `A2` deux scénarios distincts révèlent des exigences distinctes à la même période ; `A3` relancer une trajectoire existante avec une configuration différente de celle enregistrée est refusé avec `TRAJECTORY_IDENTITY_CONFLICT`, sans écrire de période ; `A4` sans scénario ni configuration fournis, le scénario et la configuration de T23 restent ceux utilisés.

Commande : `pnpm verify:task T45`. PostgreSQL et le stockage objet réels sont requis.

**T46 — Conduire un pilote longitudinal réel**

Dépendances : T39, T44 et T45. Livrables : commande conduisant chaque trajectoire compilée d'un manifeste de pilote, période par période, à travers `run-period` ; reprise après interruption ; rapport de fin en tokens par modèle et par catégorie ; budget déclarable sans plafond.

Acceptation : `T46.A1` un manifeste de N trajectoires sur P périodes produit exactement N×P périodes persistées, lues en base, chacune portant le scénario et la configuration de sa trajectoire ; `A2` une exécution interrompue après k périodes puis relancée reprend à la période k+1, sans période dupliquée ni sautée ; `A3` le rapport de fin agrège les tokens par modèle et par catégorie, et chaque total égale la somme des appels persistés correspondants ; `A4` un budget déclaré sans plafond ne refuse aucune trajectoire et est enregistré comme tel, tandis qu'un budget absent reste refusé comme l'exige T39 ; `A5` chaque période persistée est rattachée à une trajectoire et à une campagne existantes, sans période orpheline.

Commande : `pnpm verify:task T46`. PostgreSQL, le stockage objet et le fournisseur factice sont requis ; aucune clé réelle n'est nécessaire.
