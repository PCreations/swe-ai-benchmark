# Fixtures de manifeste de campagne — T03

Cahier L183, condition de fin de T03 : « fixtures JSON minimales et invalides
archivées ». Ce dossier EST cette archive. Il est en zone ACCEPTANCE
(`verification/ownership.json`), écrit par le rôle `test-author`.

| Fichier | Rôle | Cas |
|---|---|---|
| `campagne-minimale.json` | manifeste minimal VALIDE, 1 projet × 1 scénario × 2 configurations × 3 répétitions × 1 budget | A1, A2, A5, A6 (volet positif) |
| `invalide-id-doublon.json` | les deux configurations portent `CFG-A` | A3 |
| `invalide-propriete-inconnue.json` | `configurations[1].cadence_de_rafale` n'existe pas au schéma | A4 |
| `invalide-budget-absent.json` | la clé `budgets` est retirée | A4 |
| `invalide-empreinte-mismatch.json` | `corpus.digest` a un caractère hexadécimal permuté, contenu intact | A6 |

## Contrat de forme

Les champs minimaux sont ceux que le cahier L86 impose à `CampaignManifest` —
« version, mode, corpus et empreintes, configurations, budgets, graines,
périodes, politiques, métriques, statut de gel » — et les identifiants sont ceux
de l'identité complète d'une trajectoire (L78) :
`campaign_id / parent_project_id / scenario_id / configuration_id /
repetition_id / budget_id`.

`repetitions` est un COMPTE, pas une liste : L183 exige qu'« ajouter des
cellules ne nécessite pas un appel LLM ». Les `repetition_id` sont donc dérivés
par le planificateur ; la suite n'impose pas leur orthographe, seulement qu'il y
en ait exactement trois, deux à deux distincts.

`corpus_provenance` est porté par le SCÉNARIO (A5 énonce « un scénario de
provenance synthétique »), et aussi par le corpus. L24 nomme le champ ; L413
atteste les valeurs `synthetic` et `hybrid`.

## Empreinte du corpus

`corpus.digest` est le SHA-256, en hexadécimal minuscule, des octets canoniques
du corpus PRIVÉ DE SA PROPRE CLÉ `digest`. Les octets canoniques sont ceux de
L82 : objets JSON triés récursivement par clé, ordre des tableaux conservé,
UTF-8, aucun timestamp technique ajouté.

`acceptance/T03.spec.ts` RECALCULE cette empreinte depuis cette règle et vérifie
que l'archive est cohérente avec elle (première assertion de A6). Aucune valeur
de ce dossier n'a été relevée dans une exécution de l'implémentation.

## Provenance des littéraux

`budgets[0].limit_micro_usd` vaut `1000`, importé de
`acceptance/reference/F-BUDGET.json` (`valeurs.budget.valeur`, cahier L105,
racine gelée par `docs/FROZEN_ROOTS.json`). La suite vérifie cette égalité.
