# acceptance/fixtures/pilot/ — manifestes de T39

Fixtures de `acceptance/T39.spec.ts`, zone ACCEPTANCE (test-author). Convention
`bench.pilot.manifest/1`, FIXEE par cette suite (le cahier, L499, ne prescrit
aucun format de fichier) :

```
{
  schema: "bench.pilot.manifest/1",
  corpus: { groups: [ { source_parent_project_id, source_scenario_id, clone_instance_ids: string[] } ] },
  model: { name } | {},
  price: { tariff_micro_usd } | {},
  exposure: { predefined, value } | {},
  budget: { cap_micro_usd } | {},
  configurations: string[],
  repetitions: number,
  periods_per_trajectory: number,
}
```

Un des cinq prerequis (`model`, `price`, `corpus`, `exposure`, `budget`) est
considere ABSENT si son objet est `{}` (ou `groups: []` pour `corpus`) — c'est
la regle que `acceptance/T39.spec.ts` applique et que l'implementation doit
donc detecter pour satisfaire T39.A2.

- `manifest-nominal.json` — six clones de `SCN-PILOT-1` sous le parent
  `PRJ-PILOT-1`, deux configurations, trois repetitions, douze periodes :
  compile en 36 trajectoires et 432 periodes (cahier:L501, T39.A1). Les
  valeurs `340` (`price.tariff_micro_usd`) et `1000` (`budget.cap_micro_usd`)
  sont celles de `acceptance/reference/F-MONEY.json` et `F-BUDGET.json`
  (racine gelee) — la suite les revalide, elle ne les recopie pas a l'aveugle.
- `manifest-missing-{model,price,corpus,exposure,budget}.json` — chacun ne
  differe du nominal QUE par le prerequis nomme, vide (T39.A2).
- `manifest-missing-all.json` — les cinq prerequis vides simultanement (T39.A2,
  liste complete).
- `manifest-two-parents.json` — DEUX groupes, trois clones chacun, parents
  distincts `PRJ-PILOT-CTRL-A`/`-B` : controle anti-constante de T39.A3 (le
  compilateur ne doit pas toujours rendre un seul parent).
- `manifest-small-recorded.json` — echelle reduite (2 trajectoires, 4
  periodes) pour l'EXECUTION reelle en profil `recorded` (T39.A4) : T39.A1 fixe
  deja la cardinalite a l'echelle du cahier sur un compile seul (aucun appel),
  ce qui n'exige pas de faire tourner 36 trajectoires completes pour observer
  la mecanique du profil recorded.
- `manifest-small-live-generous-cap.json` / `-tight-cap.json` — meme echelle
  reduite, pour T39.A5 : plafond large (`100000`) sous panne forcee de tous les
  candidats, puis plafond serre (`1`, inferieur au tarif unitaire `340`) en
  execution normale, pour observer separement « laisse des resultats meme en
  echec total » et « respecte ses plafonds ».
