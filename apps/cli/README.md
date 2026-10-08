# @bench/cli

CLI de campagne et de verification (cahier §C, L52 ; figee comme reference
documentaire par `acceptance/T41.spec.ts` — zone IMPL, `apps/**`, voir
section III.5 de cette suite : ce document a remplace `docs/cli-reference.md`,
que seul le role `integrator` pouvait ecrire et qu'aucune etape du pipeline ne
fait jamais ecrire).

Chaque entree ci-dessous reprend, mot pour mot, la syntaxe et l'indentation a
DEUX espaces du texte imprime par `bench --help` (`apps/cli/src/index.ts`,
constante `USAGE`) : `acceptance/T41.spec.ts#T41.A7` extrait les commandes
PARSEES depuis `--help` et les commandes DOCUMENTEES depuis ce fichier, et
exige leur egalite ensembliste exacte — ni une commande parsee de plus, ni une
commande documentee de moins.

Codes de sortie, communs a toutes les commandes : `0` la commande a produit un
resultat, `1` refus ou erreur, `2` commande inconnue.

## Trajectoire verticale et persistance (T11/T23/T24/T27)

### `bench demo --mode <mode> --storage <stockage> [--variant <variante>]`

Joue la trajectoire verticale en memoire (T11, cahier L245-L253) et ecrit son
resultat JSON sur la sortie standard. `--mode recorded` (agent scripte,
reponses et couts fictifs archives), `--storage memory` (aucune base, aucun
stockage d'objets), `--variant nominal | F-FAILURE | cross-tenant-read`.

### `bench run-period --mode <mode> --campaign-id <id> --postgres-database <db> --s3-bucket <bucket> [--variant <variante>] [--scenario-id <id>] [--configuration-id <id>] [--test-stop-after-phase <phase>] [--provider claude-cli --live --model <id> --candidate-workspace-root <dir>] [--test-reread-period <n>]`

Assemble une periode persistante complete avec les adaptateurs reels locaux
(T23, cahier L353-L359) et ecrit son resultat JSON sur la sortie standard.
Chaque appel ne porte que sur la periode suivante de la trajectoire
`--campaign-id` : l'etat persistant (PostgreSQL + S3) est lu par la commande
elle-meme. Avec `--provider claude-cli` (T49, ADR-008 L147-L153) : avance la
trajectoire d'une periode candidate reelle via une session `claude -p`
(T47) dans un espace de travail git reel (T48) ; `--live` (drapeau sans
valeur) est un consentement explicite a invoquer le `claude` du `PATH` —
absent, le fournisseur `claude-cli` est refuse avant tout appel.
`--test-reread-period <n>` relit, depuis l'etat persistant, la periode
`claude-cli` `<n>` d'une trajectoire, sans invoquer aucune session.

### `bench run-trajectory --mode <mode> --campaign-id <id> --postgres-database <db> --s3-bucket <bucket> --export-history <chemin> [--test-reorder-commands] [--test-duplicate-activity <nom>] [--test-continue-as-new-after <n>]`

Orchestration Temporal reelle d'une trajectoire complete (T24, cahier
L361-L370) : workflow de campagne/trajectoire (`@bench/workflows`), Activities
`model-call` et `run-period` (`@bench/activities`), serveur Temporal reel
(`127.0.0.1:7233` par defaut, `TEMPORAL_ADDRESS`).

### `bench replay-trajectory --history <chemin> --block-external`

Rejoue un historique exporte par `run-trajectory` contre le code actuel du
workflow (T24, cahier L361-L370), via `Worker.runReplayHistory` : aucune
connexion Temporal, aucune Activity enregistree — aucun adaptateur externe
n'est joignable par construction.

### `bench fork --admin-database <db> --parent-database <db> --branch-ids <idA>,<idB>`

Cree des branches experimentales a partir d'un etat metier parent (T27, cahier
L387-L394) : une base PostgreSQL neuve par branche, clonee depuis
`--parent-database`, puis ecrit son resultat JSON sur la sortie standard.

## Campagne fixture, pilote et distribution (T38/T39/T40)

### `bench campaign <fixture> --mode <mode> --campaign-id <id> --postgres-database <db> --s3-bucket <bucket> --workers <1|2|6> [--test-force-unavailable-period <periode>] [--test-inject-failure]`

Expanse et execute une fixture de campagne (T38, cahier L487-L496),
`<fixture>` etant un chemin relatif tel que `fixtures/golden-six.json`
(materialisee automatiquement si absente — voir
`packages/activities/src/campaign.ts`). C'est la commande `campaign`
originale, a un seul argument positionnel ; elle se distingue des
sous-commandes `campaign plan|preflight|run|status|cancel|resume` ci-dessous,
dont le premier argument est toujours un des cinq mots reserves, jamais un
chemin de fixture.

### `bench pilot <manifest.json> --campaign-id <id> --postgres-database <db> --s3-bucket <bucket> [--execute --mode recorded|live --provider fake [--test-force-all-candidates-fail]]`

Recette d'un pilote complet et son preflight (T39, cahier L497-L504),
`<manifest.json>` respectant la convention `bench.pilot.manifest/1` (voir
`acceptance/fixtures/pilot/README.md`). Sans `--execute` : preflight lecture
seule. Avec `--execute` : lance reellement les trajectoires compilees via le
fournisseur factice, sous un plafond budgetaire reel partage par toute la
campagne.

### `bench candidate-period --campaign-id <id> --postgres-database <db> --s3-bucket <bucket> [--candidate-workspace-root <dir>] [--candidate-command <json-argv>] [--candidate-timeout-ms <n>] [--candidate-ops <json>]`

Avance une trajectoire d'une periode en exposant au candidat un espace de
travail git reel, restaure depuis l'etat persistant et sauvegarde a la fin,
et un contrat de processus (JSON ligne a ligne) par lequel le moteur lance et
exerce son code (T48, ADR-008 L139-L145). Commande distincte de
`bench run-period` (T23).

### `bench pilot-conduct <manifest.json> --campaign-id <id> --postgres-database <db> --s3-bucket <bucket> --provider fake|claude-cli --mode recorded|live [--test-stop-after-periods <n>] [--live --candidate-workspace-root <dir>]`

Pilote longitudinal reel (T46, ADR-007 L157-L163). Conduit chaque trajectoire
compilee d'un manifeste `bench.pilot.manifest/1`, periode par periode, a
travers `run-period`, avec le scenario et la configuration de la trajectoire
(T45). Reprend apres interruption a la premiere periode non persistee, sans
doublon ni trou, et produit un rapport des tokens par modele et par categorie
egal aux sommes persistees. Commande distincte de `bench pilot` (T39). Avec
`--provider claude-cli` (T49, ADR-008 L147-L153) : conduit chaque trajectoire
a travers une session `claude -p` reelle par periode (T47) dans un espace de
travail git reel derive de `--candidate-workspace-root` (T48), sous `--live`
(drapeau sans valeur, consentement explicite) ; produit en plus
`candidate_token_report.by_model`, l'agregat cumulatif des tokens du
candidat, distinct de `token_report` (fournisseur factice, ADR-008 L18-19).

### `bench plan-distribution --campaign-id <id> --mode <mode> --parents <N> --scenarios <N> --configurations <N> --repetitions <N> --budgets <N> --periods-per-trajectory <N> --postgres-database <db> --plan-id <id>`

Valide un profil de charge de distribution (T40, cahier L505-L512) : compte
les trajectoires et periodes qu'il produirait, sans demarrer, planifier ni
executer aucune trajectoire reelle.

### `bench distribution-run-bounded --campaign-id <id> --mode <mode> --jobs <N> --postgres-database <db> [--max-concurrent <N>] [--test-activity-barrier-url <url>] [--test-stop-after-completions <K>] [--test-large-artifact-bytes <N>] [--export-history <chemin>]`

Demarre `<N>` jobs courts, portes chacun par une seule Activity factice (T40,
cahier L505-L512).

### `bench distribution-resume --campaign-id <id> --postgres-database <db> [--export-history <chemin>]`

Reprend, depuis l'etat persiste sous `--campaign-id`, un run interrompu par
`distribution-run-bounded` (T40, cahier L505-L512).

## Commandes operationnelles et CI de qualification (T41, cahier L513-L521)

Les 14 commandes minimales du cahier (L517), « syntaxe exacte et codes de
sortie figes dans le help et testes ».

### `bench doctor [--json]`

Identifie chaque dependance absente de
`verification/tasks.json#T41.requires` (`node22`, `postgres18`, `s3`,
`temporal`, `containers.runc`, `containers.userns`, `fake-provider`) : chaque
sonde execute reellement la capacite qu'elle rapporte, independamment de
`verification/runner/doctor.mjs` (zone HARNESS). `--json` imprime le rapport
sur la sortie standard sous la forme
`{ capabilities: { <nom>: { present, detail?, reason? } } }`.

### `bench scenario validate <scenario.json>`

Valide un scenario compile. Pas encore implementee a l'issue de T41 : leve
`NOT_IMPLEMENTED` (hors perimetre comportemental des sept cas requis de T41 —
voir section V de `acceptance/T41.spec.ts`).

### `bench campaign plan <manifest.json>`

Compile un plan de campagne operationnelle sans l'executer. Pas encore
implementee a l'issue de T41 : leve `NOT_IMPLEMENTED`.

### `bench campaign preflight <manifest.json> --mode recorded|live --campaign-id <id>`

Controle lecture seule des prerequis d'une campagne operationnelle,
`<manifest.json>` respectant la convention `bench.campaign.manifest/1` :
`model`/`budget` toujours requis, `credential` (`ANTHROPIC_API_KEY`) requis
seulement en mode `live`. Aucune ecriture, aucun appel modele. Stdout JSON :
`ready`, `missing_prerequisites`, `execution_mode`.

### `bench campaign run <manifest.json> --campaign-id <id> --postgres-database <db> --s3-bucket <bucket> --mode recorded|live --provider fake`

Execute reellement une campagne operationnelle via le fournisseur factice :
refuse avant toute emission si `model`, `budget` ou (en mode `live`)
`credential` manque (aucune ecriture en base pour ce `campaign-id`). Pret :
stdout JSON `execution_mode`, `cost_origin`, `corpus_provenance`,
`campaign_id`, `trajectories[]`, `total_cost_micro_usd`. Refuse : code de
sortie non nul, JSON `{ ready:false, missing_prerequisites, execution_started:false }`.

### `bench campaign status --campaign-id <id> --postgres-database <db>`

Rapporte l'etat courant d'une campagne operationnelle. Pas encore implementee
a l'issue de T41 : leve `NOT_IMPLEMENTED`.

### `bench campaign cancel --campaign-id <id> --postgres-database <db> --s3-bucket <bucket>`

Annule une campagne sans supprimer ses artefacts ni ceux d'une autre campagne
logee dans la meme base (cahier L559, namespace de test partage) : chemin
structurellement lecture seule, aucune ecriture n'est jamais executee.

### `bench campaign resume --campaign-id <id> --postgres-database <db>`

Reprend une campagne operationnelle interrompue. Pas encore implementee a
l'issue de T41 : leve `NOT_IMPLEMENTED`.

### `bench checkpoint inspect --campaign-id <id> --postgres-database <db>`

Inspecte un checkpoint publie. Pas encore implementee a l'issue de T41 : leve
`NOT_IMPLEMENTED`.

### `bench checkpoint fork --campaign-id <id> --postgres-database <db>`

Cree une branche experimentale depuis un checkpoint publie — distincte de
`bench fork` (T27), qui clone une base PostgreSQL entiere. Pas encore
implementee a l'issue de T41 : leve `NOT_IMPLEMENTED`.

### `bench billing reconcile --postgres-database <db>`

Reconcilie le registre de facturation. Pas encore implementee a l'issue de
T41 : leve `NOT_IMPLEMENTED`.

### `bench analysis export --postgres-database <db>`

Exporte les resultats pour l'analyse hors-ligne. Pas encore implementee a
l'issue de T41 : leve `NOT_IMPLEMENTED`.

### `bench analysis run <export.json>`

Execute les agregats et tests statistiques sur un export. Pas encore
implementee a l'issue de T41 : leve `NOT_IMPLEMENTED`.

### `bench report build <analysis.json>`

Construit le rapport final a partir d'un resultat d'analyse. Pas encore
implementee a l'issue de T41 : leve `NOT_IMPLEMENTED`.

## CI de qualification et nettoyage cible (livrable L515)

`infra/ci/qualify.sh [jest-args...]` — sans argument, execute la batterie
complete (`pnpm test` puis, si elle reussit, `pnpm test:py`) et propage un
code de sortie non nul si l'une des deux echoue ; avec des arguments, point
d'injection de test qui transmet ces arguments tels quels a `pnpm exec jest`
seul.

`infra/ci/cleanup.sh <test_run_id>` — supprime les bases PostgreSQL dont le
nom correspond exactement au prefixe `bench_<test_run_id>_*`, et rien d'autre.

Ces deux scripts ne sont pas des sous-commandes de `bench` : ils n'apparaissent
donc volontairement dans aucun span `bench <commande>` de ce document.
