# ADR-005 — Arbitrage des sous-spécifications de T00

Statut : accepté · 11/09/2026.

Base : §A du cahier — « Les décisions de conception non précisées ici peuvent
être résolues sans interrompre le travail ; consigne-les dans un ADR. »
Ce sont des **lacunes**, pas des contradictions : aucune n'ouvre de
`SPEC_CONFLICT`.

Toutes ont été remontées par deux extracteurs aveugles aux cadrages opposés.
Les points 1 et 2 ont été trouvés par les **deux indépendamment**.

---

## 1. Quatre états, trois codes de sortie

**Lacune.** §G n'attribue que trois codes — `0` succès, `1` assertion échouée,
`2` prérequis absent — alors que T00 exige de distinguer **quatre** issues :
« tâche inconnue, non implémentée, échec et succès ». Une tâche inconnue
(`T00.A4`) n'entre dans aucune des trois catégories, et « non implémentée »
(`T00.A5`) non plus.

**Décision.** Ne pas inventer un quatrième code que le cahier ne prévoit pas.
Les quatre états se projettent sur les trois codes, la distinction manquante
vivant dans le champ `reason` du rapport — que §G exige d'écrire de toute façon.

| État | Code | `reason` |
|---|---|---|
| succès | `0` | `PASS` |
| échec d'assertion | `1` | `ASSERTION_FAILED` |
| non implémentée | `2` | `NOT_IMPLEMENTED` |
| tâche inconnue | `2` | `UNKNOWN_TASK` |
| registre invalide | `2` | `REGISTRY_INVALID` |

**Justification du `2` plutôt que du `1`.** `1` signifie qu'une assertion a
échoué, donc que la tâche a **tourné**. Une tâche inconnue ou non implémentée
n'a rien exécuté : la faire sortir en `1` mentirait sur la nature de l'issue.
§B tranche le reste : « Un défaut de prérequis produit `BLOCKED`, jamais
`PASS` » — et l'existence même de la tâche est le premier des prérequis.

**Ce qui est interdit sans ambiguïté** : qu'un de ces deux cas sorte en `0`.
C'est exactement ce que `T00.A4` et `T00.A5` vérifient.

---

## 2. « Registre synthétique isolé »

**Lacune.** Le cahier exige que les cas de statut opèrent sur « des registres de
test indépendants de l'avancement réel », sans dire ni où, ni sous quelle forme,
ni comment l'isolation est obtenue.

**Décision.** Une variable d'environnement `BENCH_REGISTRY` désigne un registre
de remplacement. Quand elle est posée, le registre réel n'est **jamais** lu.
Les registres de test vivent en zone `ACCEPTANCE`, avec les cas qui les
utilisent.

**Pourquoi c'est la propriété qui compte** : `T00.A4` et `T00.A5` deviennent
insensibles à l'avancement du projet. Le cahier l'exige explicitement —
« réexécuter T00 après T43 doit rester possible » — et un test qui interrogerait
le vrai registre changerait de résultat au fil des 44 tâches, donc cesserait de
tester quoi que ce soit.

---

## 3. « Un module de contrat » (`T00.A1`)

**Lacune.** Le cas ne nomme pas le module ; §C qualifie les chemins de
« proposés » et §H de « chemins cibles à créer ».

**Décision.** `packages/contracts`, seul chemin que §C associe aux « schémas de
messages, identités, manifeste, unités et erreurs ». Sa compilation ne doit
dépendre ni de Temporal, ni de Docker, ni d'un SDK fournisseur (§C : « le cœur
métier ne dépend ni de… »), ni d'aucun appel externe (§B).

---

## 4. « Installation figée » (`T00.A6`)

**Lacune.** Aucun drapeau, aucun périmètre, aucune règle de comparaison. §H dit
« le lockfile » au singulier, §G « empreintes des **lockfiles** » au pluriel.

**Décision.** Le pluriel l'emporte : les **deux** chaînes sont verrouillées,
puisque §T00 exige un workspace pnpm *et* un environnement Python verrouillé.

- `pnpm install --frozen-lockfile`
- `uv sync --frozen`
- contrôle par **sha256 avant/après**, sur `pnpm-lock.yaml` et `analysis/uv.lock`.

Une empreinte plutôt qu'une égalité d'octets : c'est ce que §G appelle
« empreintes des lockfiles », et cela reste vérifiable indépendamment.

---

## 5. Nature du « test vrai » et de sa variante (`T00.A2`/`A3`)

**Lacune.** Ni la chaîne, ni le nombre d'assertions ne sont spécifiés.

**Décision.** Les **deux chaînes**, puisque T00 livre Jest *et* pytest : un
contrat de sortie valide pour une seule serait à moitié prouvé. Chaque test
porte **au moins une assertion réelle** — §G interdit le test à zéro assertion,
et un `expect(true).toBe(true)` satisferait la lettre en trahissant l'esprit :
la variante fausse doit échouer **sur son assertion**, pas sur un import cassé.

---

## 6. Tension apparente §G l.135 / l.137

**Lacune signalée par les deux extracteurs.** L135 exige d'écrire
`verification/results/Txx.json` ; L137 exige que `verification/results` soit
hors des fichiers suivis par Git.

**Ce n'est pas une contradiction, et rien ne change.** Le chemin est écrit, et
il est gitignoré. C'est précisément le dispositif d'anti-circularité : la preuve
existe à l'endroit prescrit sans que la produire modifie le commit qu'elle
certifie. Déjà en place.

---

## 7. La CI n'a aucun cas d'acceptation

**Lacune réelle, non comblée.** §T00 livre « première CI » mais aucun des six
cas ne la contraint ; le premier cas qui le fasse est `T41.A5`.

**Décision : ne pas inventer de cas.** Les cas requis sont ceux du cahier ; en
ajouter un rendrait T00 non comparable à sa propre spécification. La CI est
livrée, et le fait qu'elle ne soit pas couverte avant T41 est inscrit comme
**limitation de l'attestation de T00**, pas masqué par un cas maison.
