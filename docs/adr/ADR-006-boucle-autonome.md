# ADR-006 — La boucle autonome : trois écarts entre le pseudocode et ce qui tourne

Statut : accepté · 11/09/2026.

Base : §A du cahier — « Les décisions de conception non précisées ici peuvent
être résolues sans interrompre le travail ; consigne-les dans un ADR. »

Le plan initial fixe un modèle de boucle (`bench-driver`, sept étages, reprise
par Routine après coupure de quota). Ce modèle est conservé **intégralement** :
les étages, leur ordre, l'idempotence de chacun, le push à chaque étage, le cap
de deux tâches de front, et l'axiome qui les fonde — *l'historique du workflow
est un cache ; les refs git sont la vérité.*

Trois points du pseudocode ne pouvaient pas être implémentés littéralement.
Aucun n'est une contradiction du cahier ; ce sont des lacunes découvertes en
écrivant `.claude/workflows/bench-driver.mjs`.

---

## 1. Le script d'un workflow n'a ni shell ni système de fichiers

**Lacune.** Le pseudocode appelle `sh('bench red T')`, `sh('git push …')`,
`readWorldFromGit()`. Le script d'un Workflow s'exécute dans un contexte
JavaScript isolé : il ne dispose que de `agent()`, `parallel()`, `pipeline()`,
`phase()`, `log()`. Pas de `child_process`, pas de `fs`. `Date.now()` et
`Math.random()` y lèvent même — ils casseraient la reprise par cache.

**Décision.** Chaque `sh()` devient un **agent dont l'unique tâche est de lancer
la commande et d'en rendre l'issue structurée**. La structure de la boucle
survit sans modification ; seul le mécanisme d'exécution change.

**Ce qu'on y gagne, plutôt que ce qu'on y perd.** `sh()` n'aurait rendu qu'un
code de sortie. Un agent voit la sortie complète, peut la diagnostiquer, et
distingue un refus nommé (`PROOF_TAINTED`, `NO_RED_GATE`) d'une panne
d'environnement. Le schéma `OUTCOME` l'oblige à rendre `ok`, l'état atteint et
ce qui a été **observé** — jamais une impression.

---

## 2. Les portes 2 à 4 n'existent pas encore, et on ne les simule pas

**Lacune.** Le plan décrit quatre portes fatales : RED, NÉCESSITÉ, MUTATION,
GÉNÉRALISATION. Seule RED existe (`bench red`, livrée avec T00). `bench
necessity`, `bench mutate` et `bench integrate` sont des livrables de **T01** —
« rendre le système de preuve non contournable par accident ». La boucle qui les
appellerait aujourd'hui échouerait à chaque tâche, y compris T01 elle-même.

**Décision.** L'étage `Gates` **exécute ce qui existe et nomme ce qui manque**.
Il vérifie la présence des commandes (`bench help`) ; si elles sont absentes, il
les rapporte comme portes absentes, destinées aux `limitations` de
l'attestation. Il ne fabrique aucun substitut.

**Pourquoi c'est la seule option honnête.** Une porte simulée est pire qu'une
porte absente : elle produit du vert sans rien vérifier, et §B l'interdit
explicitement — « un défaut de prérequis produit `BLOCKED`, jamais `PASS` ». Une
limitation inscrite est un fait vérifiable ; une porte simulée est un mensonge
qui se propage à toutes les tâches en aval.

**Ce qui reste couvert dès maintenant** : la porte MUTATION est exécutée à la
main par l'étage `Gates` (appliquer chaque mutant, exiger le rouge sur le cas
nommé, restaurer). C'est la même propriété, sans l'automatisation que T01
apportera.

---

## 3. `cases.lock.json` est une entrée GLOBALE — la classification doit être un passage unique

**Lacune, et c'est la plus coûteuse.** Le pseudocode place la classification des
modes de preuve dans l'étage `Spec`, donc **tâche par tâche**.

`verification/cases.lock.json` figure dans `GLOBAL_PATHS`
(`verification/runner/input-digest.mjs`). Toute écriture y change l'`input_digest`
des **44 tâches** à la fois. Classer au fil de l'eau ferait donc passer `STALE`
toutes les tâches déjà prouvées à chaque tâche nouvellement classée — et chaque
re-preuve coûte un clean-room complet : worktree neuf, `pnpm install
--frozen-lockfile`, `uv sync --frozen`, suite entière. Le coût total est
**quadratique**, pour une raison purement procédurale.

Mesure à l'instant de la décision : 273 des 279 cas sont `UNCLASSIFIED` ; seule
T00 est classée.

**Décision.** La classification des `proof_kind` est un **passage unique, en
préflight**, avant toute autre tâche. Les extracteurs travaillent par lots et
rendent des **données** ; un seul agent écrit et produit **un seul commit**.

**Conséquence assumée, pas masquée.** Ce commit re-périme l'attestation de T00,
qui passe `STALE`. L'étage de classification relance donc `bench accept T00` et
vérifie par `bench resume` que T00 revient en `[H]`. C'est le comportement
correct du dispositif, pas un défaut à contourner : `input-digest.mjs` le dit
déjà — « modifier le runner lui-même re-périme les 44 tâches. C'est voulu —
sous un diff qui nomme qui a changé les règles. »

**Ce qui n'est PAS décidé ici.** Sortir `cases.lock.json` de `GLOBAL_PATHS`
serait un affaiblissement : le verrou des cas décide de ce que chaque preuve
affirme, et une preuve qui survivrait à sa modification ne prouverait plus rien.
L'entrée reste globale ; c'est l'ORDRE du travail qui s'adapte.

---

## Ce que la boucle ne prétend pas être

ADR-001 a déjà tranché : l'aveuglement est **procédural**. Des sous-agents à
contexte frais le rendent plus coûteux à violer — le `test-author` n'a pas lu
l'implémentation, parce qu'il n'a jamais eu son contexte — mais rien ne l'en
empêche techniquement : `git show` reste à une commande. Tant que l'export vers
un dépôt neuf décrit par ADR-001 §2 n'est pas implémenté, toute attestation
produite par cette boucle porte `blinding: "procedural"`, et rien de plus.

Ce qui reste **structurel**, et que la boucle ne peut pas affaiblir : la règle
des deux clés. Elle porte sur ce qu'un commit *écrit*, pas sur ce qu'un agent
*lit*. `bench accept` la re-dérive sur la plage issue du ledger, que la boucle
ne peut pas réécrire.
