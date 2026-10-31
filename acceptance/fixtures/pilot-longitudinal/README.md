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

- `manifest-t52-claude-cli-four-periods.json` — fixture de `acceptance/T52.spec.ts`
  (ADR-010, T52.A2 et T52.A3, SC-003 option A) : copie de
  `manifest-t49-claude-cli-small.json` à une seule différence près,
  `periods_per_trajectory: 4`. Depuis SC-003, seuls les contrôles DUS à la
  période k sont évalués ; `isolation@1`, le seul contrôle que la variante
  fautive `cross-tenant-read` viole, n'est dû qu'en P4. Sur deux périodes, le
  candidat correct et le candidat fautif seraient indiscernables ; quatre
  périodes rendent à A2 sa discrimination et à A3 son témoin de contrôle.
  `manifest-t49-claude-cli-small.json` reste inchangé (T49, T52.A1/A4/A5, T55).

- `manifest-t66-claude-cli-f-long-three-repetitions.json` — fixture de
  `acceptance/T66.spec.ts` (ADR-018, T66.A1 et T66.A2) : copie de
  `manifest-t52-claude-cli-four-periods.json` dont le groupe porte
  `source_scenario_id: "F-LONG"` (le scénario d'ADR-018, choisi par CE champ
  déjà prévu par le schéma de T39, jamais par un champ nouveau), UNE
  configuration `cfg-t66-alpha`, `repetitions: 3` et
  `periods_per_trajectory: 12` — soit 36 périodes persistées attendues.
- `manifest-t66-claude-cli-f-long-one-repetition.json` — même manifeste à
  `repetitions: 1` (12 périodes), pour T66.A3 : le candidat qui ignore les
  remplacements de P7 et P11 n'a besoin que d'une trajectoire pour montrer
  ses scores < 1 et l'absence de régression comptée sur les règles retirées.
- `manifest-t69-claude-cli-f-long-one-repetition.json` — fixture de
  `acceptance/T69.spec.ts` (ADR-020, T69.A1 à A4) : copie de
  `manifest-t66-claude-cli-f-long-one-repetition.json` (F-LONG, 12 périodes,
  une répétition) à ces seules différences près : le projet
  `PRJ-PILOT-T69-F-LONG` et la configuration `cfg-t69-alpha`. Le candidat de
  T69.A3 est dérivé du seul prompt reçu (acceptance/fixtures/claude-cli/
  t69-derive-reference-candidate.mjs) ; celui de T69.A4 est le candidat v4
  privé de `cancel@2`, `capacity@1` et `quota@1`.

- `manifest-t76-claude-cli-f-platform-two-arms.json` — fixture de
  `acceptance/T76.spec.ts` (ADR-021 décision 5, T76.A1 à A3) : un groupe
  `source_scenario_id: "F-PLATFORM"`, un clone, DEUX configurations
  (`cfg-t76-bras-a`, `cfg-t76-bras-b`), `repetitions: 2` et
  `periods_per_trajectory: 24` — soit 4 trajectoires (deux par bras) et 96
  périodes persistées attendues. Il porte le champ ADDITIF `arms` que fixe
  `acceptance/T76.spec.ts` (II.1) : `[{arm, configuration, label,
  method_instruction}]`, un bras par configuration ; bras A « naturel »
  (`method_instruction: null`), bras B « discipliné » dont la consigne (ATDD et
  principes SOLID, ADR-021 décision 5) est le texte EXACT ajouté à chaque
  prompt du bras. T76.A1 en dérive aussi, à l'exécution, une copie jetable à
  consigne jetonnée (2 périodes, 1 répétition), jamais committée.
