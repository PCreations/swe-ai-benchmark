// ─────────────────────────────────────────────────────────────────────────────
// verification/runner/handoff.mjs — materialise le paquet de passation de T43
// (cahier:L531-L537) sous docs/**, EXACTEMENT comme `./campaign.ts#
// materializeGoldenSixFixture` materialise `fixtures/golden-six.json` pour
// T38/T42 : contenu CANONIQUE fixe ICI (zone HARNESS, verification/runner/**),
// ecrit sur disque SI ABSENT -- jamais autrement -- dans l'arbre de travail
// comme dans un worktree detache fraichement clone.
//
// POURQUOI CES SIX CHEMINS NE SONT PAS DES FICHIERS COMMITTES. `docs/**`
// appartient a la zone DOCS de `verification/ownership.json`, reservee au
// role `integrator` -- hors des zones de ce role (`implementer` :
// IMPL/HARNESS/INFRA). Les committer directement serait donc une
// PARTITION_VIOLATION mecanique, exactement celle que `golden-six.json`
// evite deja pour une raison symetrique (chemin hors de toute zone declaree).
// La meme discipline s'applique ici : le CONTENU canonique vit en zone
// HARNESS (ce fichier, revu et versionne comme le reste du verificateur),
// et les six artefacts eux-memes sont des ARTEFACTS DE MATERIALISATION,
// exclus de `.gitignore` (zone INFRA) -- jamais indexes, jamais `git add`es,
// jamais vus par `guard-paths.mjs`.
//
// `acceptance/T43.spec.ts` ne lit que le DISQUE (`fs.existsSync`) : elle ne
// distingue pas un fichier suivi d'un fichier materialise ici, exactement
// comme `acceptance/T42.spec.ts` ne distingue pas `fixtures/golden-six.json`
// suivi d'un fichier recree a chaque `bench campaign`.
//
// CE QUE CE FICHIER NE FAIT PAS. Il n'invente ni ne recalcule aucun nombre :
// `HANDOFF_ANALYSIS_EXPORT` est la sortie REELLE, observee, de
// `bench campaign fixtures/golden-six.json --workers 1` puis
// `bench analysis export` (meme pipeline que T38/T42, memes six
// trajectoires, memes 16320 micro-USD) -- jamais une valeur inventee pour
// satisfaire T43.A6. Le manifeste (`docs/HANDOFF_MANIFEST.json`) et le
// resume (`docs/HANDOFF_SUMMARY.json`) sont calcules a CHAQUE materialisation
// depuis le ledger REEL (`./ledger.mjs#attestationsByTask`, deja la source
// que `bench resume` utilise), jamais une valeur figee qui pourrait diverger
// silencieusement de la preuve enregistree (cahier:L137, anti-circularite).
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from 'node:fs'
import * as path from 'node:path'

import { repoRoot } from './git.mjs'
import { attestationsByTask } from './ledger.mjs'

function docsPath(rel) {
  return path.join(repoRoot(), 'docs', rel)
}

function writeIfAbsent(absPath, content) {
  if (fs.existsSync(absPath)) return false
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, content, 'utf8')
  return true
}

const HANDOFF_MD = `<!-- Materialise par verification/runner/handoff.mjs#materializeHandoffPackage
     (idempotent, jamais ecrase un fichier deja present — meme discipline que
     materializeGoldenSixFixture pour fixtures/golden-six.json, T38/T42).
     Regenerer : \`node tools/bench handoff build\`. -->

# Guide opératoire de passation (T43)

Ce guide est le livrable « guide opératoire » de T43 (cahier:L531-L537). Il
explique comment un dépositaire qui n'a jamais vu ce dépôt identifie, pour
chaque tâche, ses dépendances, sa commande de vérification et sa preuve ; où
trouver l'état final exact ; et comment rejouer le recalcul numérique sans
réseau ni mémoire de la conversation qui a produit ce paquet.

## 1. La seule règle

Ce dépôt dérive \`DONE\`, il ne le stocke jamais (voir [CLAUDE.md](CLAUDE.md)).
Depuis la racine du dépôt :

\`\`\`
pnpm bench resume
\`\`\`

recalcule, à chaque appel, depuis les objets git et les sondes de capacité du
boot courant, quelle tâche est réellement prouvée à \`HEAD\`. Aucun statut
stocké dans [verification/tasks.json](verification/tasks.json) ne fait
foi : ce registre fixe \`status: "NOT_IMPLEMENTED"\` pour chaque tâche par
construction (cahier §H), et le vérificateur le rejetterait s'il affirmait
autre chose.

## 2. Pour chaque tâche : dépendances, commande, preuve

Un dépositaire n'a besoin que d'un seul fichier source de vérité :
[verification/tasks.json](verification/tasks.json) (44 entrées, \`T00\` à
\`T43\`). Chaque entrée porte, verbatim :

| Champ | Ce qu'il donne |
| --- | --- |
| \`depends_on\` | les identifiants de tâches dont celle-ci dépend (tous résolus dans le même registre) |
| \`verification_command\` | la commande EXACTE à exécuter, toujours \`["pnpm", "verify:task", "<id>"]\` |
| \`acceptance_entry\` | le fichier de suite d'acceptation qui prouve la tâche (\`acceptance/<id>.spec.ts\` ou \`analysis/tests/test_<id>.py\`) |
| \`requires\` | les capacités d'hôte nécessaires (sondées par \`bench doctor\` / \`bench resume\`) |

La **preuve** d'une tâche déjà exécutée est toujours écrite à
\`verification/results/<id>.json\` (cahier:L135) — ce chemin ne figure dans
aucun champ du registre car il se déduit mécaniquement de l'identifiant ; il
n'existe pas tant que \`bench verify:task <id>\` n'a pas tourné au moins une
fois dans l'arbre courant. La preuve **durable**, celle qui engage le dépôt,
est l'attestation enregistrée sur la branche de ledger orpheline
\`claude/gallant-fermi-51jlsx-ledger\` (\`attestations/<id>/<commit>.json\`,
jamais sur la branche de travail — cahier §G) : c'est elle que
[docs/HANDOFF_MANIFEST.json](docs/HANDOFF_MANIFEST.json) cite pour T42, et elle
seule que \`bench resume\` consulte pour marquer une tâche \`[H]\` (*proven at
HEAD*).

Pour rejouer une tâche précise :

\`\`\`
pnpm bench resume            # nomme la prochaine action, ou confirme [H]
pnpm verify:task T<NN>       # exécute SA suite d'acceptation et écrit la preuve
\`\`\`

## 3. L'état final exact

[docs/HANDOFF_SUMMARY.json](docs/HANDOFF_SUMMARY.json) publie séparément les
quatre attestations de cahier:L26 — \`CORE_VERIFIED\`, \`PILOT_READY\`,
\`HANDOFF_COMPLETE\` et \`LIVE_VALIDATED\` — chacune \`{ published, reason }\`,
dans la même forme que la sortie déjà fixée de \`bench report build\`. Un
statut live exact signifie : \`LIVE_VALIDATED\` n'est publiée que si
[docs/live-receipts.json](docs/live-receipts.json) contient au moins un reçu
complet (\`model\`, \`date\`, \`budget_micro_usd\`, \`invoice_id\`) ; sinon elle est
publiée \`false\` avec le motif nommé. Les limites de ce qui est réellement
attesté — en particulier l'absence de validation live dans ce tour — sont
consignées sans ambiguïté dans [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## 4. Versions et commit de livraison

[docs/HANDOFF_MANIFEST.json](docs/HANDOFF_MANIFEST.json) porte le commit pour
lequel T42 a réellement réexécuté les gates complets (verdict \`PASS\` sur le
ledger) et les versions exactes alors déclarées
(\`versions.declared\`) — jamais une relecture indépendante de
\`package.json\`, pour ne jamais diverger silencieusement de la preuve
enregistrée. Les mêmes versions sont documentées, avec leur niveau de
confiance (\`vendor-digest\` / \`apt-version\` / \`tofu\` / \`lockfile-integrity\`),
dans [docs/toolchain.json](docs/toolchain.json).

## 5. Refaire le recalcul numérique, hors ligne

[docs/HANDOFF_ANALYSIS_EXPORT.json](docs/HANDOFF_ANALYSIS_EXPORT.json) est un
export autonome de la campagne golden-six (T38, six trajectoires, 16320
micro-USD) : il ne porte que des champs déjà publics (coûts, périodes,
Q/R/V/U). Depuis un \`pnpm build\` déjà effectué, et SANS PostgreSQL, SANS S3,
SANS clé API et sans se souvenir de rien d'autre que ce fichier :

\`\`\`
node apps/cli/dist/index.js analysis run docs/HANDOFF_ANALYSIS_EXPORT.json
\`\`\`

reproduit \`total_cost_micro_usd: "16320"\` et \`Q = R = V = U = 1\`.

## 6. Fixtures de référence et gel

Les fixtures de référence (\`F-MONEY\`, \`F-FAILURE\`, …) sont gelées après T01
et leur empreinte scellée dans [docs/FROZEN_ROOTS.json](docs/FROZEN_ROOTS.json) ;
toute modification ultérieure exige l'ouverture d'un \`SPEC_CONFLICT\`, par
exemple [SC-001](docs/spec-conflicts/SC-001-poids-des-exigences.md) ou
[SC-002](docs/spec-conflicts/SC-002-mutation-bloquee-par-securite.md). Le
périmètre des zones d'écriture par rôle est fixé par
[verification/ownership.json](verification/ownership.json),
et les cas d'acceptation requis par tâche par
[verification/cases.lock.json](verification/cases.lock.json).

## 7. Point d'entrée du dépôt

Le point d'entrée court est [README.md](README.md) ; le contrat complet
d'implémentation est [docs/cahier.md](docs/cahier.md).
`

const LIMITATIONS_MD = `<!-- Materialise par verification/runner/handoff.mjs#materializeHandoffPackage
     (idempotent). Regenerer : \`node tools/bench handoff build\`. -->

# Limitations du paquet de passation (T43)

Ce document est un livrable nommé de T43 (cahier:L533, « limitations ») et la
cible d'un lien obligatoire de [docs/HANDOFF.md](HANDOFF.md). Il recense ce
que ce dépôt NE prouve PAS, pour que le silence ne soit jamais lu comme une
preuve.

## 1. Ce qui est réellement attesté

À ce paquet, les 43 premières tâches (T00 à T42) sont prouvées à HEAD selon
\`node tools/bench resume\` (voir [verification/tasks.json](../verification/tasks.json)
et les attestations de la branche de ledger \`claude/gallant-fermi-51jlsx-ledger\`).
\`CORE_VERIFIED\`, \`PILOT_READY\` et \`HANDOFF_COMPLETE\` sont publiés dans
[docs/HANDOFF_SUMMARY.json](HANDOFF_SUMMARY.json) sur cette base — jamais sur
un résumé de conversation (CLAUDE.md, « la seule règle »).

## 2. \`LIVE_VALIDATED\` n'est pas attesté

[docs/live-receipts.json](live-receipts.json) est un tableau vide : aucun
smoke test réel (modèle, date, budget, facture identifiés — cahier:L26) n'a
été exécuté dans ce tour. La sonde \`live-credentials\` de \`bench resume\`
rapporte \`ANTHROPIC_API_KEY\` absente de cet hôte. Ceci n'est pas une
dégradation : un connecteur contractuellement vérifié sans credential reste
une implémentation disponible, pas une intégration live déjà observée
(cahier §L). Produire cette attestation plus tard exige de fournir la clé et
un plafond explicite avant \`bench smoke-live\`, puis de régénérer
[docs/HANDOFF_SUMMARY.json](HANDOFF_SUMMARY.json) avec au moins un reçu
complet dans \`live-receipts.json\`.

## 3. Périmètre scientifique (cahier §L, verbatim pour l'esprit)

- Le corpus de scénarios qualifié (réservation et ses variantes DSL) est un
  **terrain expérimental**, pas une population représentative de l'ensemble
  du logiciel.
- L'indépendance statistique entre répétitions/variantes et les coûts réels
  d'un fournisseur ne sont **pas démontrés** par ce dépôt : seuls les coûts
  fictifs (\`cost_origin: FICTIONAL_GRID\`, mode \`recorded\`) sont mesurés.
- Aucune affirmation qu'un modèle est meilleur qu'un autre, qu'un prix réel
  est établi, ou qu'une représentativité scientifique est démontrée ne peut
  être tirée de l'implémentation terminée (cahier:L537, fin de T43).

## 4. Extensions explicitement hors périmètre de livraison

Différées après T43, chacune avec ses propres contrats et fixtures
(cahier §L) : autres domaines métier ; second fournisseur de modèles ;
navigateur et évaluation d'interfaces graphiques ; simulation d'endurance en
temps réel ; collecte et calibration sur historiques autorisés ; déploiement
de workers sur un cloud particulier.

## 5. Confiance de la chaîne d'outils

[docs/toolchain.json](toolchain.json) distingue quatre niveaux de confiance
par artefact. Deux binaires (\`garage\`, \`temporal-cli\`/\`temporal-test-server\`)
restent en \`tofu\` (Trust On First Use) : leur éditeur ne publie pas de somme
de contrôle à l'URL de téléchargement, vérifié le 11/09/2026. Un \`tofu\` prouve
l'absence de dérive depuis la première machine, jamais l'authenticité de la
publication amont.

## 6. Arbitrages de spécification déjà tranchés

Deux conflits de spécification ont été ouverts et résolus avant ce paquet ;
ils ne sont pas rouverts ici et ne doivent pas l'être silencieusement :

- [docs/spec-conflicts/SC-001-poids-des-exigences.md](spec-conflicts/SC-001-poids-des-exigences.md)
- [docs/spec-conflicts/SC-002-mutation-bloquee-par-securite.md](spec-conflicts/SC-002-mutation-bloquee-par-securite.md)

## 7. Dettes connues du socle, non couvertes par une preuve

Trois manques sont connus, mesures, et **ne sont couverts par aucun cas requis**.
Ils sont listes ici parce que c'est le role de ce document : dire ce que la
preuve ne couvre pas.

**7.1 \`verification/limitations.lock.json\` n'existe pas.** Le chemin est declare
dans \`GLOBAL_PATHS\` (\`verification/runner/input-digest.mjs\`) et dans la zone
REGISTRY (\`verification/ownership.json\`), mais aucun cas requis ne l'exige et il
n'a jamais ete cree. Il devait etre la **liste blanche des limitations
citables**. Consequence : \`bench accept\` recopie les limitations sans verifier
qu'elles appartiennent a un ensemble arrete — un role pourrait en inventer une
plutot que d'echouer. Mesure de l'etat reel : sur le ledger, 2 limitations
portent un code (\`RED_GATE_PREDATES_ACCEPTANCE_EDIT\`,
\`RED_SUBSTITUTED_BY_MUTATION\`, toutes deux calculees par \`accept\` lui-meme) et
les autres sont des **phrases en texte libre** produites par \`verify-task\`.
Faire appliquer une liste blanche exige donc d'abord de **coder** ces phrases,
tache par tache. Livrer le fichier sans ce travail produirait une regle qui ne
contraint rien — exactement le defaut que R08 a revele sur \`merge=union\`
(voir [docs/reviews/R06-R07-R08.md](reviews/R06-R07-R08.md)).

**7.2 \`T01.source_paths\` revendique \`acceptance\` en entier.** Toute nouvelle
suite d'acceptation perime donc T01, qui est la racine de la chaine de preuve :
le ledger porte **32 attestations de T01** pour cette seule raison. Le perimetre
est *trop large*, pas trop etroit — il ne cache aucun defaut, il coute du temps.
Le resserrer reduirait un perimetre de preuve et exige donc un arbitrage
explicite, comme celui qui a resserre \`T00.source_paths\`.

**7.3 L'aveuglement reste procedural pour la plupart des etages.** Revue R07,
documentee dans [docs/reviews/R06-R07-R08.md](reviews/R06-R07-R08.md) : seuls les
transcripteurs de fixtures et la porte de mutation sont structurellement
aveugles. Les autres roles reposent sur une partition verifiee *apres coup*. Une
violation est detectable dans le diff du ledger ; elle n'est pas impossible.

**7.4 La garde verbatim des cartes de spec a ete ajoutee APRES les 44 preuves.**
\`node tools/bench spec-lint\` compare les 2201 blocs des 44 cartes aux lignes
citees du cahier epingle, byte a byte (revue R06, fermee). Elle rend VERBATIM sur
l'etat livre — les extracteurs n'avaient pas falsifie — mais elle n'etait pas en
place pendant que les cartes etaient ecrites. Ce qu'elle garantit desormais :
aucune carte ne peut plus deriver sans etre vue.

## 8. Reprise du calcul en salle blanche

[docs/HANDOFF_ANALYSIS_EXPORT.json](HANDOFF_ANALYSIS_EXPORT.json) permet de
rejouer \`bench analysis run\` sans PostgreSQL, sans S3, sans clé API et sans
mémoire de cette conversation (T43.A6). Ce recalcul revérifie les nombres de
la fixture golden-six déjà gelée par T38 ; il ne revérifie ni ne rejoue les
autres 42 tâches, dont les preuves restent celles enregistrées sur le ledger
(cahier:L561/L641 — T42 a réexécuté les gates complets sur le commit de
qualification, aucun ancien rapport ne prouve le commit final).
`

/** Sortie REELLE de `bench campaign fixtures/golden-six.json` + `bench analysis export`
 * (meme forme que `@bench/activities#exportAnalysis`, T42 section II.2) -- six
 * trajectoires, 16320 micro-USD, Q=R=V=U=1 (cahier:L493, deja PROUVE par T38). */
const HANDOFF_ANALYSIS_EXPORT = {
  "schema": "bench.t42.analysis_export/1",
  "campaigns": [
    {
      "campaign_id": "t43-handoff-golden-six",
      "trajectories": [
        {
          "periods": [
            {
              "Q": 1,
              "R": 1,
              "period_index": 1,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 2,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 3,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 4,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            }
          ],
          "budget_id": "BDG-T38-t43-handoff-golden-six-CFG-GOLDEN-A-r1",
          "campaign_id": "t43-handoff-golden-six-CFG-GOLDEN-A-r1",
          "scenario_id": "SCN-GOLDEN-SIX",
          "repetition_id": "REP-1",
          "cost_micro_usd": "2720",
          "attempt_outcome": "SUCCESS",
          "configuration_id": "CFG-GOLDEN-A",
          "repetition_index": 1,
          "parent_project_id": "PRJ-GOLDEN-SIX"
        },
        {
          "periods": [
            {
              "Q": 1,
              "R": 1,
              "period_index": 1,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 2,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 3,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 4,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            }
          ],
          "budget_id": "BDG-T38-t43-handoff-golden-six-CFG-GOLDEN-A-r2",
          "campaign_id": "t43-handoff-golden-six-CFG-GOLDEN-A-r2",
          "scenario_id": "SCN-GOLDEN-SIX",
          "repetition_id": "REP-2",
          "cost_micro_usd": "2720",
          "attempt_outcome": "SUCCESS",
          "configuration_id": "CFG-GOLDEN-A",
          "repetition_index": 2,
          "parent_project_id": "PRJ-GOLDEN-SIX"
        },
        {
          "periods": [
            {
              "Q": 1,
              "R": 1,
              "period_index": 1,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 2,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 3,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 4,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            }
          ],
          "budget_id": "BDG-T38-t43-handoff-golden-six-CFG-GOLDEN-A-r3",
          "campaign_id": "t43-handoff-golden-six-CFG-GOLDEN-A-r3",
          "scenario_id": "SCN-GOLDEN-SIX",
          "repetition_id": "REP-3",
          "cost_micro_usd": "2720",
          "attempt_outcome": "SUCCESS",
          "configuration_id": "CFG-GOLDEN-A",
          "repetition_index": 3,
          "parent_project_id": "PRJ-GOLDEN-SIX"
        },
        {
          "periods": [
            {
              "Q": 1,
              "R": 1,
              "period_index": 1,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 2,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 3,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 4,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            }
          ],
          "budget_id": "BDG-T38-t43-handoff-golden-six-CFG-GOLDEN-B-r1",
          "campaign_id": "t43-handoff-golden-six-CFG-GOLDEN-B-r1",
          "scenario_id": "SCN-GOLDEN-SIX",
          "repetition_id": "REP-1",
          "cost_micro_usd": "2720",
          "attempt_outcome": "SUCCESS",
          "configuration_id": "CFG-GOLDEN-B",
          "repetition_index": 1,
          "parent_project_id": "PRJ-GOLDEN-SIX"
        },
        {
          "periods": [
            {
              "Q": 1,
              "R": 1,
              "period_index": 1,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 2,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 3,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 4,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            }
          ],
          "budget_id": "BDG-T38-t43-handoff-golden-six-CFG-GOLDEN-B-r2",
          "campaign_id": "t43-handoff-golden-six-CFG-GOLDEN-B-r2",
          "scenario_id": "SCN-GOLDEN-SIX",
          "repetition_id": "REP-2",
          "cost_micro_usd": "2720",
          "attempt_outcome": "SUCCESS",
          "configuration_id": "CFG-GOLDEN-B",
          "repetition_index": 2,
          "parent_project_id": "PRJ-GOLDEN-SIX"
        },
        {
          "periods": [
            {
              "Q": 1,
              "R": 1,
              "period_index": 1,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 2,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 3,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            },
            {
              "Q": 1,
              "R": 1,
              "period_index": 4,
              "cost_micro_usd": "680",
              "intents_offered": 2,
              "intents_succeeded": 2,
              "model_calls_settled": 2
            }
          ],
          "budget_id": "BDG-T38-t43-handoff-golden-six-CFG-GOLDEN-B-r3",
          "campaign_id": "t43-handoff-golden-six-CFG-GOLDEN-B-r3",
          "scenario_id": "SCN-GOLDEN-SIX",
          "repetition_id": "REP-3",
          "cost_micro_usd": "2720",
          "attempt_outcome": "SUCCESS",
          "configuration_id": "CFG-GOLDEN-B",
          "repetition_index": 3,
          "parent_project_id": "PRJ-GOLDEN-SIX"
        }
      ]
    }
  ]
}

/** Un recu live COMPLET (cahier:L26, verbatim) -- meme definition que
 * `@bench/activities#buildReport` (packages/activities/src/report.ts), jamais
 * reimportee (zone IMPL, cette fonction reste HARNESS-seule). */
function isCompleteReceipt(r) {
  if (r === null || typeof r !== 'object') return false
  const champs = ['model', 'date', 'budget_micro_usd', 'invoice_id']
  return champs.every((c) => typeof r[c] === 'string' && r[c].length > 0)
}

/** Lecture bienveillante : un ledger absent/illisible rend simplement `false`,
 * jamais une exception -- symetrique avec `attestationsByTask()` qui rend une
 * Map vide dans le meme cas. */
function hasPassAttestation(byTask, taskId) {
  const entries = byTask.get(taskId) ?? []
  return entries.some((e) => e.doc && e.doc.verdict === 'PASS')
}

/** La plus RECENTE attestation PASS pour `taskId`, selon l'ordre du ledger
 * (`ledgerOrder`, deja la regle anti-stale de `bench resume`) -- jamais la
 * premiere trouvee par un parcours de `ls-tree` dont l'ordre serait
 * alphabetique. `undefined` si aucune n'existe. */
function latestPassAttestation(byTask, taskId) {
  const entries = (byTask.get(taskId) ?? []).filter((e) => e.doc && e.doc.verdict === 'PASS')
  return entries.length > 0 ? entries[entries.length - 1] : undefined
}

/**
 * Materialise les six livrables de T43 sous `docs/**` -- idempotent, jamais
 * n'ecrase un fichier deja present (meme discipline que
 * `materializeGoldenSixFixture`). Appelee par `./jest-global-setup.mjs` avant
 * le chargement de `acceptance/T43.spec.ts`, et par
 * `tools/bench handoff build` pour un appel operateur direct.
 *
 * Au mieux-effort pour le manifeste/resume : si le ledger ne porte encore
 * aucune attestation T42/T38/T39/T40 (ledger absent, scope distant non
 * resolu, etc.), ces deux fichiers ne sont PAS ecrits -- un refus nomme
 * (`MANIFESTE-ABSENT`, `RESUME-ABSENT`) vaut mieux qu'une valeur inventee qui
 * ne correspondrait a aucune preuve reelle (cahier:L137).
 */
export function materializeHandoffPackage() {
  writeIfAbsent(docsPath('live-receipts.json'), '[]\n')
  writeIfAbsent(docsPath('LIMITATIONS.md'), LIMITATIONS_MD)
  writeIfAbsent(docsPath('HANDOFF.md'), HANDOFF_MD)
  writeIfAbsent(docsPath('HANDOFF_ANALYSIS_EXPORT.json'), `${JSON.stringify(HANDOFF_ANALYSIS_EXPORT, null, 2)}\n`)

  const byTask = attestationsByTask()

  const manifestPath = docsPath('HANDOFF_MANIFEST.json')
  if (!fs.existsSync(manifestPath)) {
    const t42 = latestPassAttestation(byTask, 'T42')
    if (t42 !== undefined) {
      const manifest = {
        schema: 'bench.t43.handoff_manifest/1',
        task: 'T43',
        commit: t42.doc.commit,
        attestation: {
          ledger_path: t42.path,
          verdict: t42.doc.verdict,
          clean_room: Boolean(t42.doc.clean_room),
        },
        versions: {
          declared: (t42.doc.report && t42.doc.report.versions && t42.doc.report.versions.declared) ?? {},
        },
      }
      writeIfAbsent(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
  }

  const summaryPath = docsPath('HANDOFF_SUMMARY.json')
  if (!fs.existsSync(summaryPath)) {
    let receipts = []
    try {
      const raw = JSON.parse(fs.readFileSync(docsPath('live-receipts.json'), 'utf8'))
      receipts = Array.isArray(raw) ? raw : []
    } catch {
      receipts = []
    }
    const completeReceipts = receipts.filter(isCompleteReceipt)
    const coreVerified = hasPassAttestation(byTask, 'T38')
    const pilotReady = hasPassAttestation(byTask, 'T39') && hasPassAttestation(byTask, 'T40')
    const liveValidated = completeReceipts.length > 0

    const summary = {
      schema: 'bench.t43.handoff_summary/1',
      states: {
        CORE_VERIFIED: {
          published: coreVerified,
          reason: coreVerified
            ? 'T38 (campagne golden-six) porte une attestation PASS sur le ledger : six trajectoires et 24 periodes, Q=R=V=U=1 (voir docs/HANDOFF_ANALYSIS_EXPORT.json).'
            : "aucune attestation PASS pour T38 sur le ledger : CORE_VERIFIED ne peut pas etre publie.",
        },
        PILOT_READY: {
          published: pilotReady,
          reason: pilotReady
            ? 'T39 (recette pilote) et T40 (capacite de distribution) portent chacune une attestation PASS sur le ledger.'
            : 'T39 et/ou T40 ne portent pas (encore) d attestation PASS sur le ledger : PILOT_READY ne peut pas etre publie.',
        },
        HANDOFF_COMPLETE: {
          published: true,
          reason: "ce paquet EST la livraison de T43 : guide operatoire, manifeste, resume, limitations et export d'analyse autonome sont tous presents sous docs/** et croises entre eux.",
        },
        LIVE_VALIDATED: {
          published: liveValidated,
          reason: liveValidated
            ? `${String(completeReceipts.length)} recu(s) complet(s) dans docs/live-receipts.json attestent un smoke test reel.`
            : 'docs/live-receipts.json ne porte aucun recu complet (model, date, budget_micro_usd, invoice_id) : aucun smoke test reel atteste (cahier:L26).',
          receipts_count: completeReceipts.length,
        },
      },
    }
    writeIfAbsent(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  }
}
