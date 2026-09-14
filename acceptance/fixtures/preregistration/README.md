# Fixtures de préenregistrement de campagne — T30

Cahier L419-421 (T30) : « préflight, export canonique signé/haché, split par
projet parent et port d'horodatage » ; les six cas de L419. Ce dossier est
l'archive de ces cas — zone ACCEPTANCE (`verification/ownership.json`), écrite
par le rôle `test-author`.

## Forme d'un bundle (`bench.preregistration.bundle/1`)

Un bundle porte deux splits, `calibration` et `test`, chacun une liste
d'`entries` `{ parent_project_id, scenario_id, qualified, model,
tariff_micro_usd }` — la granularité que A1 (« même parent dans calibration et
test ») et A2 (« scénario non qualifié ou modèle/tarif non renseigné »)
observent. Le reste du bundle porte les champs que le mode `confirmed` exige
(A4) : `metrics`, `sample_size`, `budgets`, `stopping_rules` — et ceux que le
gel fige (A3) : `seeds` (cahier L82, quatre flux) et `margins`.

Ce schéma et ces noms de rôle ne sont PAS relevés dans une implémentation : ils
sont la CONVENTION D'APPEL que `acceptance/T30.spec.ts` publie dans son en-tête
(section III), au même titre que `bench.qualification.scenario/1` pour T10.
Un désaccord de vocabulaire entre cette convention et l'implémentation produit
un rouge nommé (`CONTRAT-NON-SATISFAIT`), jamais un import cassé.

| Fichier | Rôle | Cas |
| --- | --- | --- |
| `bundle-minimale.json` | valide, `confirmed`, parents disjoints, tout qualifié et tarifé, quatre champs de mode confirmé renseignés | volet positif de A1, A2, A3, A4, A5, A6 |
| `bundle-parent-partage.json` | `test.entries[0].parent_project_id` == `calibration.entries[0].parent_project_id` (`PRJ-CAL-1`), rien d'autre ne change | A1 |
| `bundle-scenario-non-qualifie.json` | `calibration.entries[0].qualified = false`, modèle et tarif renseignés | A2 (volet « non qualifié ») |
| `bundle-tarif-absent.json` | `calibration.entries[0].model` et `.tariff_micro_usd` vides, `qualified = true` | A2 (volet « modèle/tarif ») |
| `bundle-confirme-incomplet.json` | `registration_mode: "confirmed"`, `metrics/budgets/stopping_rules` vides, `sample_size: 0` — splits par ailleurs valides | A4 |
| `bundle-brouillon-incomplet.json` | mêmes quatre champs vides QUE `bundle-confirme-incomplet.json`, mais `registration_mode: "draft"` | A4 (contrôle : l'exigence est spécifique au mode confirmé) |

## Provenance des littéraux

- `budgets[0].limit_micro_usd = "1000"` : `acceptance/reference/F-BUDGET.json`,
  `valeurs.budget.valeur` (cahier L105, racine gelée).
- `tariff_micro_usd = "340"` : `acceptance/reference/F-MONEY.json`,
  `valeurs.appel_de_reference.cout_attendu.valeur` (cahier L103, racine gelée).
- `margins.non_inferiority = 0.02` : cahier L451 (bloc T34, étiqueté
  `applies: T30.A3, T30.A4`), « Marges d'exemple 0,02 ».
- `metrics = ["Q", "R", "G"]` : cahier L95 (`PeriodResult` : « Q, R, G, statut
  et empreintes de preuve »).
- `seeds` porte les quatre flux nommés en L82 : `scenario`, `workload`,
  `assignment`, `bootstrap`.

Les identifiants (`PRJ-CAL-1`, `SCN-CAL-1`, `agent-scripted-v1`, les
`campaign_id`…) sont des ENTRÉES fabriquées par ce rôle, pas des valeurs
attendues : comme les identifiants de scénario de `acceptance/T10.spec.ts`,
`acceptance/T30.spec.ts` ne les recopie jamais dans une assertion sans les
relire d'abord du bundle soumis.

`acceptance/T30.spec.ts` ne recalcule ni le hash canonique ni la signature de
l'export gelé : ces primitives appartiennent à l'implémentation
(`packages/scenario`, `packages/contracts`), et les réimplémenter ferait
comparer une valeur à elle-même. La suite observe des PROPRIÉTÉS
comportementales — un bundle inchangé revérifie identique à son gel, un champ
gelé modifié produit un mismatch nommé, un reçu altéré après signature est
rejeté — obtenues en utilisant les fonctions PUBLIÉES du contrat sur des
entrées qu'elle construit et mute elle-même (section IV de l'en-tête).
