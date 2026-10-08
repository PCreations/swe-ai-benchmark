# acceptance/fixtures/pilot-longitudinal/ — manifestes de T46 (et T49)

Fixtures de `acceptance/T46.spec.ts`, zone ACCEPTANCE (test-author). T46 réutilise
VERBATIM le schéma `bench.pilot.manifest/1` déjà fixé par `acceptance/T39.spec.ts`
(section II.1) — T46 dépend de T39, pas l'inverse — et lui ajoute UNE forme
supplémentaire pour le prérequis `budget`, FIXÉE par `acceptance/T46.spec.ts`
(section II), requise par ADR-007:L161 (T46.A4, « budget déclarable sans
plafond ») et absente du contrat de T39 :

```
budget: { cap_micro_usd } | { unbounded: true } | {}
```

`{ unbounded: true }` est une troisième forme, distincte de `{ cap_micro_usd }`
(plafonné) et de `{}` (absent — refusé, T39.A2 et T46.A4). Les deux autres
champs du manifeste (`model`, `price`, `exposure`, `corpus`, `configurations`,
`repetitions`, `periods_per_trajectory`) gardent exactement la règle de T39.

- `manifest-t46-small.json` — UN groupe, UN clone, DEUX configurations
  distinctes (`cfg-t46-alpha`, `cfg-t46-beta`), une répétition, trois périodes
  par trajectoire : compile en 2 trajectoires (une par configuration, même
  scénario, même parent) et 6 périodes (T46.A1, A2, A3, A5). Les deux
  configurations distinctes sur le MÊME groupe/scénario rendent décisif le
  contrôle « chacune portant le scénario et la configuration de SA
  trajectoire » (A1) : une implémentation qui écrirait une configuration
  constante échouerait sur ce manifeste, pas seulement sur celui de T45.
  `budget.cap_micro_usd` (`100000`) est delibérément large devant
  `price.tariff_micro_usd` (`340`, F-MONEY) × 6 périodes, pour qu'aucun refus
  de plafond n'interfère avec les propriétés observées par A1/A2/A3/A5.
- `manifest-t46-small-budget-unbounded.json` — même forme réduite (UN groupe,
  UN clone, UNE configuration, UNE répétition, DEUX périodes : 1 trajectoire,
  2 périodes), `budget: { unbounded: true }` (T46.A4, moitié positive : aucun
  refus, et le budget sans plafond est enregistré comme tel).
- `manifest-t46-small-missing-budget.json` — même corpus réduit que
  `manifest-t46-small.json`, `budget: {}` : moitié négative de T46.A4, « un
  budget absent reste refusé comme l'exige T39 ». Un refus n'exécute aucune
  trajectoire quelle que soit l'échelle du manifeste ; cette suite utilise
  néanmoins une échelle réduite (et non `acceptance/fixtures/pilot/manifest-
  missing-budget.json`, 36×12, déjà scellé par T39) pour que le pire cas —
  une mutation qui rendrait ce refus PERMISSIF (T46.M4, cf.
  `verification/mutants/T46.json`) — ne fasse pas réellement exécuter 432
  périodes avant que l'assertion de refus échoue.

- `manifest-t49-claude-cli-small.json` — fixture de `acceptance/T49.spec.ts`
  (ADR-008, T49.A4) : même schéma `bench.pilot.manifest/1`, UN groupe, UN
  clone, UNE configuration, une répétition, DEUX périodes (1 trajectoire,
  2 périodes) — assez petit pour exécuter deux sessions `claude -p` (fausses,
  fixture `acceptance/fixtures/claude-cli/bin/claude`) sans que la taille du
  manifeste masque le mutant visé (omission d'un modèle secondaire dans
  l'agrégat, T49.M4). `budget: { unbounded: true }` pour la même raison que
  `manifest-t46-small-budget-unbounded.json` : aucun refus de plafond
  n'interfère avec ce que T49.A4 observe. `acceptance/T49.spec.ts` réutilise
  en outre VERBATIM `manifest-t46-small.json` pour T49.A5 (« avec le
  fournisseur factice, le comportement de T46 est inchangé ») : le même
  manifeste, le même `--provider fake`, jamais un manifeste propre à T49 pour
  ce cas précis — c'est la régression elle-même qui l'exige.
