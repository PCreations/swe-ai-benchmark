# acceptance/fixtures/campaign-ops/ — manifestes de T41

Fixtures de `acceptance/T41.spec.ts`, zone ACCEPTANCE (test-author). Le cahier
(L513-L521) ne prescrit ni schéma de fichier ni nom de commande pour les
opérations génériques de campagne (`campaign plan`, `campaign preflight`,
`campaign run`, `campaign cancel`) : la convention `bench.campaign.manifest/1`
ci-dessous est FIXÉE par cette suite, au même titre que `bench.pilot.manifest/1`
pour T39 (`acceptance/fixtures/pilot/README.md`) ou `bench.preregistration.bundle/1`
pour T30.

```
{
  schema: "bench.campaign.manifest/1",
  corpus: { groups: [ { source_parent_project_id, source_scenario_id, clone_instance_ids: string[] } ] },
  model: { name } | {},
  price: { tariff_micro_usd } | {},
  budget: { cap_micro_usd } | {},
  configurations: string[],
  repetitions: number,
  periods_per_trajectory: number,
}
```

Un des deux prérequis exécutables (`model`, `budget`) est ABSENT si son objet
est `{}`. Le troisième prérequis des cas `live` (`credential`) n'est pas un
champ du manifeste : il est lu par le CLI dans la variable d'environnement
`ANTHROPIC_API_KEY`, même convention que la sonde `live-credentials` de
`verification/runner/doctor.mjs` — cette suite ne réimplémente pas le nom,
elle réutilise celui qui existe déjà dans ce dépôt.

Volontairement BEAUCOUP plus petits que les manifestes `bench.pilot.manifest/1`
de T39 : T41 n'observe ni le dimensionnement d'une campagne (T39.A1) ni le
regroupement par parent statistique (T39.A3), seulement le GATING
modèle/budget/credential (A2, A3) et la non-destructivité de l'annulation
(A4). Un seul groupe, un seul clone, une seule configuration, une seule
période suffisent à ces propriétés et bornent la durée des cas réels
(PostgreSQL, Temporal, fournisseur factice).

- `manifest-nominal.json` — `model`, `price` et `budget` tous renseignés.
  `price.tariff_micro_usd` (`340`) et `budget.cap_micro_usd` (`1000`) sont
  ceux de `acceptance/reference/F-MONEY.json` et `F-BUDGET.json` (racine
  gelée, cahier L103/L105) — la suite revalide cette égalité au chargement,
  elle ne la recopie jamais à l'aveugle (même garde que `acceptance/T39.spec.ts`).
  `configurations: ["agent-scripted-v1"]` reprend le nom de configuration déjà
  publié par `acceptance/fixtures/pilot/manifest-nominal.json`.
- `manifest-missing-model.json` — ne diffère du nominal QUE par `model: {}`.
- `manifest-missing-budget.json` — ne diffère du nominal QUE par `budget: {}`.
