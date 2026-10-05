// ─────────────────────────────────────────────────────────────────────────────
// `bench` — les commandes de campagne (§C, L52) : `demo` (T11),
// `run-period` (T23, cahier L353-L359), `run-trajectory` / `replay-trajectory`
// (T24, cahier L361-L370), `fork` (T27, cahier L387-L394), `campaign` (T38,
// cahier L487-L496), `pilot` (T39, cahier L497-L504), `plan-distribution` /
// `distribution-run-bounded` / `distribution-resume` (T40, cahier L505-L512)
// et le SQUELETTE rouge de `doctor` / `campaign preflight` / `campaign run` /
// `campaign cancel` (T41, cahier L513-L521).
//
// LA COMMANDE QUE L247 NOMME, MOT POUR MOT :
//
//     bench demo --mode recorded --storage memory
//
// TROIS RÈGLES D'ÉCRITURE, ET CE QU'ELLES ÉVITENT.
//
// (1) LES DRAPEAUX SONT LUS, PAS SUPPOSÉS. `--mode` et `--storage` deviennent
//     les options du pilote ; ils ne sont ni ignorés, ni remplacés par un
//     défaut. Une commande qui lancerait la trajectoire dans un autre mode que
//     celui demandé produirait un résultat portant un `execution_mode` que
//     l'appelant n'a pas demandé — c'est exactement la perturbation T11.M3, et
//     elle doit rester détectable.
//
// (2) LE RÉSULTAT JSON VA SUR LA SORTIE STANDARD, ET RIEN D'AUTRE N'Y VA. Les
//     messages d'erreur partent sur la sortie d'erreur. Un mot de journal mêlé
//     au JSON rendrait la sortie illisible pour qui la rappelle en aval, et
//     c'est ce que `bench demo` est censé fournir : « résultats JSON » (L247).
//
// (3) AUCUNE RÈGLE MÉTIER ICI. Cette entrée ne calcule ni période, ni métrique,
//     ni contrôle : elle lit une ligne de commande et appelle `runDemo` ou
//     `runPeriodOnce`. Le domaine vit dans `@bench/scenario` et
//     `@bench/activities` ; le dupliquer ici donnerait deux vérités, dont une
//     seule serait testée.
//
// `run-period` (T23, L355 : « services d'application et commande `bench
// run-period` utilisant les adaptateurs réels locaux ») délègue la totalité de
// son travail à `runPeriodOnce` (`@bench/activities`, src/run-period.ts) :
// PostgreSQL et S3 réels pour la persistance de la trajectoire, `@bench/
// scenario` (T11) pour la trajectoire nominale. Cette entrée se limite à lire
// les drapeaux (même règle (1) ci-dessus), traduire le point d'injection
// `--test-stop-after-phase` (cahier:L141), et à n'écrire sur la sortie
// standard QUE lorsque la période s'est réellement achevée — une période
// interrompue par ce point d'injection n'imprime rien (A5, cahier L355 :
// « une période incomplète ne publie pas un faux état final »).
// ─────────────────────────────────────────────────────────────────────────────
import { execFile as execFileCb } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import {
  buildReport,
  campaignOpsPreflight,
  cancelCampaignOps,
  exportAnalysis,
  inspectCheckpoint,
  planDistribution,
  resumeDistribution,
  runAnalysisFromExport,
  runCampaign,
  runCampaignOps,
  runDistributionBounded,
  runDoctorProbes,
  runPeriodOnce,
  runPilot,
} from '@bench/activities'
import { NotImplemented } from '@bench/contracts'
import { runDemo } from '@bench/scenario'

import { replayTrajectoryForked, runTrajectoryForked } from './trajectory.js'

const execFileP = promisify(execFileCb)

const USAGE = `bench — commandes de campagne

  demo --mode <mode> --storage <stockage> [--variant <variante>]
        Joue la trajectoire verticale en memoire (T11, cahier L245-L253) et
        ecrit son resultat JSON sur la sortie standard.

        --mode      recorded    agent scripte, reponses et couts fictifs archives
        --storage   memory      aucune base, aucun stockage d'objets
        --variant   nominal | F-FAILURE | cross-tenant-read

  run-period --mode <mode> --campaign-id <id> --postgres-database <db>
             --s3-bucket <bucket> [--variant <variante>]
             [--scenario-id <id>] [--configuration-id <id>]
             [--test-stop-after-phase <phase>]
        Assemble une periode persistante complete avec les adaptateurs reels
        locaux (T23, cahier L353-L359) et ecrit son resultat JSON sur la
        sortie standard. Chaque appel ne porte que sur la PERIODE SUIVANTE de
        la trajectoire --campaign-id : l'etat persistant (PostgreSQL + S3)
        est lu par la commande elle-meme.

        --mode                     recorded
        --campaign-id              identite de la trajectoire (L78)
        --postgres-database        base PostgreSQL reelle a utiliser
        --s3-bucket                bucket S3 (ou compatible) reel a utiliser
        --variant                  nominal | invalid-candidate | ...
        --scenario-id              optionnel (T45, ADR-007:L151) ; fixe a la
                                    1ere periode d'une trajectoire fraiche,
                                    defaut SCN-F-RESERVATION ; relu ensuite
                                    depuis l'etat persistant
        --configuration-id         optionnel (T45, ADR-007:L151) ; meme
                                    contrat, defaut CFG-RECORDED-LOCAL ;
                                    diverger a une periode suivante est
                                    refuse (TRAJECTORY_IDENTITY_CONFLICT,
                                    ADR-007:L153)
        --test-stop-after-phase    point d'injection nomme (cahier:L141)

  run-trajectory --mode <mode> --campaign-id <id> --postgres-database <db>
                 --s3-bucket <bucket> --export-history <chemin>
                 [--test-reorder-commands]
                 [--test-duplicate-activity <nom>]
                 [--test-continue-as-new-after <n>]
        Orchestration Temporal REELLE d'une trajectoire COMPLETE (T24, cahier
        L361-L370) : workflow de campagne/trajectoire (@bench/workflows),
        Activities 'model-call' et 'run-period' (@bench/activities), serveur
        Temporal reel (127.0.0.1:7233 par defaut, TEMPORAL_ADDRESS).

        --mode                       recorded
        --campaign-id                identite de la trajectoire (L78)
        --postgres-database          base PostgreSQL reelle a utiliser
        --s3-bucket                  bucket S3 (ou compatible) reel a utiliser
        --export-history             chemin ou ecrire l'historique rejouable
        --test-reorder-commands      point d'injection nomme (cahier:L141)
        --test-duplicate-activity    point d'injection nomme (cahier:L141)
        --test-continue-as-new-after point d'injection nomme (cahier:L141)

  replay-trajectory --history <chemin> --block-external
        Rejoue un historique exporte par run-trajectory contre le CODE ACTUEL
        du workflow (T24, cahier L361-L370), via Worker.runReplayHistory :
        aucune connexion Temporal, aucune Activity enregistree -- aucun
        adaptateur externe n'est joignable PAR CONSTRUCTION.

        --history         chemin de l'historique a rejouer
        --block-external  aucun adaptateur externe reel ne doit etre joignable

  fork --admin-database <db> --parent-database <db> --branch-ids <idA>,<idB>
        Cree des branches experimentales a partir d'un etat metier parent (T27,
        cahier L387-L394) : une base PostgreSQL neuve par branche, clonee
        depuis --parent-database, puis ecrit son resultat JSON sur la sortie
        standard.

        --admin-database    base PostgreSQL admin, habilitee a CREATE DATABASE
        --parent-database   base PostgreSQL du parent dont on part
        --branch-ids        deux identifiants de branche, separes par une virgule

  campaign <fixture> --mode <mode> --campaign-id <id> --postgres-database <db>
           --s3-bucket <bucket> --workers <1|2|6>
           [--test-force-unavailable-period <periode>]
           [--test-inject-failure]
        Expanse et execute une fixture de campagne (T38, cahier L487-L496),
        <fixture> etant un chemin relatif tel que fixtures/golden-six.json
        (materialisee automatiquement si absente -- voir
        packages/activities/src/campaign.ts).

        --mode                               recorded
        --campaign-id                        identite de la campagne (L78)
        --postgres-database                  base PostgreSQL reelle a utiliser
        --s3-bucket                          bucket S3 (ou compatible) reel
        --workers                            nombre de workers paralleles
        --test-force-unavailable-period      point d'injection nomme (cahier:L141)
        --test-inject-failure                point d'injection nomme (cahier:L141)

  pilot <manifest.json> --campaign-id <id> --postgres-database <db>
        --s3-bucket <bucket>
        [--execute --mode recorded|live --provider fake
          [--test-force-all-candidates-fail]]
        Recette d'un pilote complet et son preflight (T39, cahier L497-L504),
        <manifest.json> etant un chemin de fichier respectant la convention
        bench.pilot.manifest/1 (voir acceptance/fixtures/pilot/README.md).

        SANS --execute : PREFLIGHT lecture seule -- aucun appel modele, aucune
        ecriture de trajectoire. Imprime ready, missing_prerequisites,
        trajectory_count, period_count, parent_project_ids et
        execution_started (toujours false).

        AVEC --execute : lance reellement les trajectoires compilees via le
        fournisseur factice (T17/T28), sous un plafond budgetaire reel partage
        par toute la campagne. Imprime execution_mode, cost_origin,
        corpus_provenance, trajectory_count, period_count,
        total_cost_micro_usd et trajectories[].

        --campaign-id                         identite de la campagne (L78)
        --postgres-database                   base PostgreSQL reelle a utiliser
        --s3-bucket                           bucket S3 (ou compatible) reel
        --execute                             lance reellement la campagne
        --mode                                recorded | live
        --provider                            fake
        --test-force-all-candidates-fail      point d'injection nomme (cahier:L141)

  plan-distribution --campaign-id <id> --mode <mode> --parents <N>
                     --scenarios <N> --configurations <N> --repetitions <N>
                     --budgets <N> --periods-per-trajectory <N>
                     --postgres-database <db> --plan-id <id>
        Valide un profil de charge de distribution (T40, cahier L505-L512) :
        compte les trajectoires et periodes qu'il produirait, SANS demarrer,
        planifier ni executer aucune trajectoire reelle.

        --campaign-id               identite de la campagne (L78)
        --mode                      recorded
        --parents                   nombre de projets
        --scenarios                 nombre de scenarios par projet
        --configurations            nombre de configurations par scenario
        --repetitions                nombre de repetitions par configuration
        --budgets                   nombre de budgets par repetition
        --periods-per-trajectory    periodes par trajectoire
        --postgres-database         base PostgreSQL reelle a utiliser
        --plan-id                   identite du plan valide (controle A2)

  distribution-run-bounded --campaign-id <id> --mode <mode> --jobs <N>
                            --postgres-database <db>
                            [--max-concurrent <N>]
                            [--test-activity-barrier-url <url>]
                            [--test-stop-after-completions <K>]
                            [--test-large-artifact-bytes <N>]
                            [--export-history <chemin>]
        Demarre <N> jobs courts portes chacun par une seule Activity factice
        (T40, cahier L505-L512).

        --campaign-id                     identite de la campagne (L78)
        --mode                            recorded
        --jobs                            nombre de jobs a soumettre
        --postgres-database               base PostgreSQL reelle a utiliser
        --max-concurrent                  plafond de jobs actifs simultanement
        --test-activity-barrier-url       point d'injection nomme (cahier:L141)
        --test-stop-after-completions     point d'injection nomme (cahier:L141)
        --test-large-artifact-bytes       point d'injection nomme (cahier:L141)
        --export-history                  chemin ou ecrire l'historique exporte

  distribution-resume --campaign-id <id> --postgres-database <db>
                       [--export-history <chemin>]
        Reprend, depuis l'etat persiste sous --campaign-id, un run interrompu
        par distribution-run-bounded (T40, cahier L505-L512).

        --campaign-id          identite de la campagne (L78)
        --postgres-database    base PostgreSQL reelle a utiliser
        --export-history       chemin ou ecrire l'historique exporte

  doctor [--json]
        Identifie chaque dependance absente de verification/tasks.json#T41.requires
        (T41, cahier L513-L521) : node22, postgres18, s3, temporal,
        containers.runc, containers.userns, fake-provider -- chaque sonde
        execute reellement la capacite qu'elle rapporte.

        --json    imprime le rapport sur la sortie standard

  scenario validate <scenario.json>
        Valide un scenario compile (T41, cahier L513-L521 -- commande
        minimale). PAS ENCORE IMPLEMENTEE : leve NOT_IMPLEMENTED.

  campaign plan <manifest.json>
        Compile un plan de campagne operationnelle sans l'executer (T41,
        cahier L513-L521 -- commande minimale). PAS ENCORE IMPLEMENTEE :
        leve NOT_IMPLEMENTED.

  campaign preflight <manifest.json> --mode recorded|live --campaign-id <id>
        Controle lecture-seule des prerequis d'une campagne operationnelle
        (T41, cahier L513-L521), <manifest.json> respectant la convention
        bench.campaign.manifest/1 : model/budget toujours requis, credential
        (ANTHROPIC_API_KEY) requis seulement en mode live.

        --mode           recorded | live
        --campaign-id    identite de la campagne (L78)

  campaign run <manifest.json> --campaign-id <id> --postgres-database <db>
               --s3-bucket <bucket> --mode recorded|live --provider fake
        Execute reellement une campagne operationnelle via le fournisseur
        FACTICE (T41, cahier L513-L521) : refuse AVANT toute emission si
        model, budget ou (en mode live) credential manque.

        --campaign-id           identite de la campagne (L78)
        --postgres-database     base PostgreSQL reelle a utiliser
        --s3-bucket             bucket S3 (ou compatible) reel
        --mode                  recorded | live
        --provider              fake

  campaign status --campaign-id <id> --postgres-database <db>
        Rapporte l'etat courant d'une campagne operationnelle (T41, cahier
        L513-L521 -- commande minimale). PAS ENCORE IMPLEMENTEE : leve
        NOT_IMPLEMENTED.

  campaign cancel --campaign-id <id> --postgres-database <db>
                  --s3-bucket <bucket>
        Annule une campagne SANS supprimer ses artefacts ni ceux d'une autre
        campagne (T41, cahier L513-L521) : chemin lecture-seule, aucune
        ecriture n'est jamais executee.

        --campaign-id           identite de la campagne (L78)
        --postgres-database     base PostgreSQL reelle a utiliser
        --s3-bucket             bucket S3 (ou compatible) reel

  campaign resume --campaign-id <id> --postgres-database <db>
        Reprend une campagne operationnelle interrompue (T41, cahier
        L513-L521 -- commande minimale). PAS ENCORE IMPLEMENTEE : leve
        NOT_IMPLEMENTED.

  checkpoint inspect --campaign-id <id> --postgres-database <db>
                     --checkpoint-id <id>
        Inspecte un checkpoint publie par run-period (T23/T42, cahier L157 :
        horloge, exigences, version active). Relit SEULEMENT PostgreSQL --
        aucun --s3-bucket, aucune memoire partagee avec le processus qui a
        produit le checkpoint.

        --campaign-id       identite de la campagne (L78)
        --postgres-database base PostgreSQL reelle a utiliser
        --checkpoint-id     identite du checkpoint (ref publiee par run-period)

  checkpoint fork --campaign-id <id> --postgres-database <db>
        Cree une branche experimentale depuis un checkpoint publie (T41,
        cahier L513-L521 -- commande minimale ; distincte de la commande
        fork de T27, qui clone une base PostgreSQL entiere). PAS ENCORE
        IMPLEMENTEE : leve NOT_IMPLEMENTED.

  billing reconcile --postgres-database <db>
        Reconcilie le registre de facturation (T41, cahier L513-L521 --
        commande minimale). PAS ENCORE IMPLEMENTEE : leve NOT_IMPLEMENTED.

  analysis export --postgres-database <db>
        Exporte, depuis PostgreSQL SEUL, les trajectoires deja publiees par
        bench campaign (T38/T42) sur cette base -- aucun --campaign-id :
        toutes les campagnes ecrites sur <db> sont enumerees.

        --postgres-database base PostgreSQL reelle a lire

  analysis run <export.json>
        Recalcule trajectory_count/period_count/model_calls_settled_count/
        total_cost_micro_usd et Q/R/V/U/G depuis le SEUL fichier d'export
        (T42) -- aucun --postgres-database, aucun --s3-bucket : cette
        commande ne lit jamais autre chose que <export.json>.

  report build <analysis.json> [--live-receipts <recus.json>]
        Construit les quatre etats de cahier:L26 (CORE_VERIFIED, PILOT_READY,
        HANDOFF_COMPLETE, LIVE_VALIDATED) a partir d'un resultat d'analyse.
        LIVE_VALIDATED n'est publiee que si --live-receipts designe au moins
        un recu COMPLET (model, date, budget_micro_usd, invoice_id).

        --live-receipts     fichier JSON de recus { model, date,
                             budget_micro_usd, invoice_id } (optionnel)

  Sorties : 0 la trajectoire a produit un resultat · 1 refus ou erreur
            2 commande inconnue
`

/**
 * Lit `--cle valeur`. Un drapeau sans valeur est une ERREUR et non un booléen
 * implicite : `--mode` seul ne peut pas vouloir dire « mode par défaut ».
 */
function parseFlags(argv: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined) continue
    if (!token.startsWith('--')) {
      throw new Error(`argument inattendu : ${token}`)
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`le drapeau ${token} attend une valeur`)
    }
    out.set(token.slice(2), value)
    i += 1
  }
  return out
}

async function commandDemo(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const mode = flags.get('mode')
  const storage = flags.get('storage')
  if (mode === undefined || storage === undefined) {
    process.stderr.write('bench demo exige --mode et --storage\n')
    return 1
  }
  const variant = flags.get('variant')
  const result =
    variant === undefined
      ? await runDemo({ mode, storage })
      : await runDemo({ mode, storage, variant })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

/**
 * `run-period` (T23, cahier L353-L359). Lit les drapeaux requis, refuse si
 * l'un manque (meme discipline que `commandDemo`), puis delegue a
 * `runPeriodOnce` (`@bench/activities`). N'ecrit le resultat JSON que si la
 * periode s'est reellement achevee : une interruption par
 * `--test-stop-after-phase` (cahier:L141) n'ecrit rien sur la sortie standard
 * (A5).
 */
async function commandRunPeriod(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const mode = flags.get('mode')
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  const s3Bucket = flags.get('s3-bucket')
  if (
    mode === undefined ||
    campaignId === undefined ||
    postgresDatabase === undefined ||
    s3Bucket === undefined
  ) {
    process.stderr.write(
      'bench run-period exige --mode, --campaign-id, --postgres-database et --s3-bucket\n'
    )
    return 1
  }
  const variant = flags.get('variant')
  const testStopAfterPhase = flags.get('test-stop-after-phase')
  // T45 (ADR-007:L151) : deux drapeaux optionnels, miroir des champs
  // d'identité qu'ils alimentent (cahier:L78). Omis à la première période
  // d'une trajectoire fraîche, chacun retombe sur le défaut hérité de T23
  // (ADR-007:L117) ; fournis à une période suivante, une divergence avec la
  // valeur enregistrée est refusée par `runPeriodOnce` lui-même.
  const scenarioId = flags.get('scenario-id')
  const configurationId = flags.get('configuration-id')
  const outcome = await runPeriodOnce({
    mode,
    campaignId,
    postgresDatabase,
    s3Bucket,
    variant,
    scenarioId,
    configurationId,
    testStopAfterPhase,
  })
  if (!outcome.ok) {
    process.stderr.write(`bench run-period : ${outcome.reason}\n`)
    return 1
  }
  process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`)
  return 0
}

/**
 * Comme `parseFlags`, mais certains drapeaux de `run-trajectory` et
 * `replay-trajectory` (T24, cahier L361-L370) sont des BOOLEENS sans valeur —
 * `--test-reorder-commands`, `--block-external` : le drapeau est present des
 * qu'il apparait dans argv, jamais suivi d'un token de valeur. Fonction
 * separee de `parseFlags` pour ne rien changer au comportement deja accepte
 * de `demo`/`run-period` (T11/T23), dont AUCUN drapeau n'est booleen.
 */
function parseFlagsAvecBooleens(
  argv: readonly string[],
  booleens: ReadonlySet<string>
): Map<string, string> {
  const out = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined) continue
    if (!token.startsWith('--')) {
      throw new Error(`argument inattendu : ${token}`)
    }
    const nom = token.slice(2)
    if (booleens.has(nom)) {
      out.set(nom, 'true')
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`le drapeau ${token} attend une valeur`)
    }
    out.set(nom, value)
    i += 1
  }
  return out
}

/**
 * `run-trajectory` (T24, cahier L361-L370). Lit les drapeaux requis, refuse si
 * l'un manque (meme discipline que `commandRunPeriod`), puis delegue la
 * totalite de l'orchestration a `runTrajectoryForked` (`./trajectory.ts`) : un
 * processus forke qui heberge le workflow de campagne/trajectoire reel, les
 * Activities reelles, et l'export d'historique -- sa sortie standard est
 * ignoree (`./trajectory.ts`, en-tete) pour que rien d'autre que le JSON final
 * n'atteigne la sortie standard de `bench`.
 */
async function commandRunTrajectory(argv: readonly string[]): Promise<number> {
  const flags = parseFlagsAvecBooleens(argv, new Set(['test-reorder-commands']))
  const mode = flags.get('mode')
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  const s3Bucket = flags.get('s3-bucket')
  const exportHistory = flags.get('export-history')
  if (
    mode === undefined ||
    campaignId === undefined ||
    postgresDatabase === undefined ||
    s3Bucket === undefined ||
    exportHistory === undefined
  ) {
    process.stderr.write(
      'bench run-trajectory exige --mode, --campaign-id, --postgres-database, --s3-bucket et --export-history\n'
    )
    return 1
  }
  const testDuplicateActivity = flags.get('test-duplicate-activity')
  const testContinueAsNewAfterRaw = flags.get('test-continue-as-new-after')
  const testContinueAsNewAfter =
    testContinueAsNewAfterRaw === undefined ? undefined : Number(testContinueAsNewAfterRaw)
  const result = await runTrajectoryForked({
    mode,
    campaignId,
    postgresDatabase,
    s3Bucket,
    exportHistoryPath: exportHistory,
    testReorderCommands: flags.has('test-reorder-commands'),
    testDuplicateActivity,
    testContinueAsNewAfter,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

/**
 * `replay-trajectory` (T24, cahier L361-L370). Lit `--history` (refuse si
 * absent, meme discipline que les autres commandes), puis delegue a
 * `replayTrajectoryForked` (`./trajectory.ts`) : un processus forke (sortie
 * standard ignoree) qui appelle `Worker.runReplayHistory` contre le code
 * ACTUEL du workflow, sans connexion Temporal ni Activity enregistree.
 * Un historique illisible/absent REMONTE (refus, pas un verdict) : seul un
 * replay reellement execute produit `determinism`.
 */
async function commandReplayTrajectory(argv: readonly string[]): Promise<number> {
  const flags = parseFlagsAvecBooleens(argv, new Set(['block-external']))
  const history = flags.get('history')
  if (history === undefined) {
    process.stderr.write('bench replay-trajectory exige --history\n')
    return 1
  }
  const result = await replayTrajectoryForked(history)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result.determinism === 'OK' ? 0 : 1
}

/* ───────────────────────────────────────────────── `fork` (T27, L387-L394) */
//
// PROVISIONNEMENT + CLONAGE, PAS UNE TRANSACTION DISTRIBUÉE MAGIQUE (L34).
// Chaque branche demandée reçoit une base PostgreSQL FRAÎCHEMENT CRÉÉE
// (`CREATE DATABASE`, via `--admin-database`, habilitée à le faire), puis son
// contenu est CLONÉ depuis `--parent-database` par `pg_dump` / `psql -f` —
// le même mécanisme d'export/import que `@bench/storage` (T15,
// `src/checkpoint.ts`) emploie pour restaurer un checkpoint sur un
// environnement vierge, repris ici sans dépendre des internes non exportés
// de ce paquet. Un `CREATE DATABASE ... TEMPLATE` aurait exigé qu'aucune
// AUTRE session ne soit connectée au parent au moment du fork (ce que ce
// paquet ne peut pas garantir côté appelant) ; `pg_dump` n'a pas cette
// contrainte, puisqu'il lit un instantané cohérent sans exclure les autres
// connexions.
//
// `identity` (parent ET chaque branche) est GÉNÉRÉE ICI (`randomUUID`),
// jamais fournie par l'appelant : c'est l'axe, avec le nom de base, que
// T27.A1 exige deux à deux distinct entre le parent et les deux branches.
// `database` du parent est un ÉCHO de `--parent-database` : ce rôle ne
// touche jamais la base du parent (invariant D.4, L66 — « un rollback de
// l'application ne restaure jamais le registre central des coûts », même
// logique de non-ingérence côté fork).

interface ForkBranchResult {
  readonly branch_id: string
  readonly database: string
  readonly identity: string
}

interface ForkResult {
  readonly parent: { readonly database: string; readonly identity: string }
  readonly branches: readonly ForkBranchResult[]
}

const FORK_EXEC_TIMEOUT_MS = 120_000
const FORK_MAX_BUFFER = 256 * 1024 * 1024

function execDetail(e: unknown): string {
  const err = e as { stderr?: unknown; message?: string }
  const stderrText = Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : String(err.stderr ?? '')
  return (stderrText || String(err.message ?? e)).trim()
}

/** `CREATE DATABASE "<database>"`, exécuté contre `adminDatabase` (habilitée à le faire). */
async function createBranchDatabase(adminDatabase: string, database: string): Promise<void> {
  try {
    await execFileP(
      'psql',
      ['-v', 'ON_ERROR_STOP=1', '-d', adminDatabase, '-c', `CREATE DATABASE "${database}"`],
      { encoding: 'utf8', timeout: FORK_EXEC_TIMEOUT_MS, maxBuffer: FORK_MAX_BUFFER },
    )
  } catch (e) {
    throw new Error(`CREATE DATABASE "${database}" refusé via ${adminDatabase} : ${execDetail(e)}`)
  }
}

/** Exporte `database` en octets SQL (`pg_dump`), sans toucher à son contenu. */
async function dumpDatabase(database: string): Promise<Buffer> {
  try {
    const { stdout } = await execFileP('pg_dump', ['-d', database], {
      encoding: 'buffer',
      timeout: FORK_EXEC_TIMEOUT_MS,
      maxBuffer: FORK_MAX_BUFFER,
    })
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as unknown as Uint8Array)
  } catch (e) {
    throw new Error(`pg_dump de ${database} refusé : ${execDetail(e)}`)
  }
}

/** Rejoue un export `pg_dump` sur `database` (déjà créée, vierge). */
async function restoreDump(database: string, bytes: Buffer): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-fork-'))
  const file = path.join(dir, 'dump.sql')
  try {
    fs.writeFileSync(file, bytes)
    await execFileP('psql', ['-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file], {
      encoding: 'utf8',
      timeout: FORK_EXEC_TIMEOUT_MS,
      maxBuffer: FORK_MAX_BUFFER,
    })
  } catch (e) {
    throw new Error(`restauration de ${database} refusée : ${execDetail(e)}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** Nom de base d'une branche : généré ici, jamais dérivé de `branch_id` (pas d'injection SQL via un drapeau appelant). */
function newBranchDatabaseName(): string {
  return `fork_${randomUUID().replace(/-/g, '')}`.slice(0, 63)
}

async function forkLineage(
  adminDatabase: string,
  parentDatabase: string,
  branchIds: readonly string[],
): Promise<ForkResult> {
  const branches: ForkBranchResult[] = []
  for (const branchId of branchIds) {
    const database = newBranchDatabaseName()
    await createBranchDatabase(adminDatabase, database)
    const dump = await dumpDatabase(parentDatabase)
    await restoreDump(database, dump)
    branches.push({ branch_id: branchId, database, identity: randomUUID() })
  }
  return {
    parent: { database: parentDatabase, identity: randomUUID() },
    branches,
  }
}

/**
 * `fork` (T27, cahier L387-L394). Lit les trois drapeaux requis, refuse si
 * l'un manque (même discipline que `commandDemo`), puis délègue à
 * `forkLineage` : provisionnement + clonage réels, un par branche demandée.
 */
async function commandFork(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const adminDatabase = flags.get('admin-database')
  const parentDatabase = flags.get('parent-database')
  const branchIdsRaw = flags.get('branch-ids')
  if (adminDatabase === undefined || parentDatabase === undefined || branchIdsRaw === undefined) {
    process.stderr.write(
      'bench fork exige --admin-database, --parent-database et --branch-ids\n'
    )
    return 1
  }
  const branchIds = branchIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (branchIds.length === 0) {
    process.stderr.write('bench fork exige au moins un identifiant de branche dans --branch-ids\n')
    return 1
  }
  try {
    const result = await forkLineage(adminDatabase, parentDatabase, branchIds)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    process.stderr.write(`bench fork : ${message}\n`)
    return 1
  }
}

/* ─────────────────────────────────────────── `campaign` (T38, L487-L496) */
//
// Lit le chemin de fixture (premier argument positionnel, jamais un drapeau —
// cahier:L489 fixe le chemin littéral `fixtures/golden-six.json`) puis les
// drapeaux requis, refuse si l'un manque (même discipline que
// `commandRunPeriod`/`commandFork`), puis délègue la totalité du travail à
// `runCampaign` (`@bench/activities`, `src/campaign.ts`) : expansion des six
// trajectoires, facturation F-MONEY réelle, agrégation Q/R/V/U/G, partition
// par `--workers`, et les deux points d'injection nommés
// `--test-force-unavailable-period` / `--test-inject-failure` (cahier:L141).
// AUCUNE RÈGLE MÉTIER ICI (même règle que l'en-tête du fichier) : cette
// fonction ne fait que lire des drapeaux et écrire le résultat JSON.

async function commandCampaign(argv: readonly string[]): Promise<number> {
  const [fixturePath, ...rest] = argv
  if (fixturePath === undefined || fixturePath.startsWith('--')) {
    process.stderr.write('bench campaign exige un chemin de fixture en premier argument\n')
    return 1
  }
  const flags = parseFlagsAvecBooleens(rest, new Set(['test-inject-failure']))
  const mode = flags.get('mode')
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  const s3Bucket = flags.get('s3-bucket')
  const workersRaw = flags.get('workers')
  if (
    mode === undefined ||
    campaignId === undefined ||
    postgresDatabase === undefined ||
    s3Bucket === undefined ||
    workersRaw === undefined
  ) {
    process.stderr.write(
      'bench campaign exige --mode, --campaign-id, --postgres-database, --s3-bucket et --workers\n'
    )
    return 1
  }
  const workers = Number.parseInt(workersRaw, 10)
  if (!Number.isInteger(workers) || workers < 1) {
    process.stderr.write(`bench campaign : --workers invalide (${workersRaw})\n`)
    return 1
  }
  const testForceUnavailablePeriodRaw = flags.get('test-force-unavailable-period')
  const testForceUnavailablePeriod =
    testForceUnavailablePeriodRaw === undefined ? undefined : Number.parseInt(testForceUnavailablePeriodRaw, 10)
  const testInjectFailure = flags.has('test-inject-failure')
  try {
    const result = await runCampaign({
      fixturePath,
      mode,
      campaignId,
      postgresDatabase,
      s3Bucket,
      workers,
      testForceUnavailablePeriod,
      testInjectFailure,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    process.stderr.write(`bench campaign : ${message}\n`)
    return 1
  }
}

/* ──────────────────────────────────── `doctor` (T41, L513-L521, cas A1) */
//
// Lit `--json` (seul drapeau connu, optionnel — `doctor` n'a aucun drapeau
// REQUIS) puis délègue entièrement à `runDoctorProbes` (`@bench/activities`,
// `src/doctor.ts`) : sept sondes réellement exécutées (PostgreSQL, S3,
// Temporal, `runc`, `unshare`, le fournisseur factice, la version de Node),
// jamais une recopie de `verification/runner/doctor.mjs` (HARNESS — ce
// serait prouver une capacité du vérificateur, pas celle du produit). Le
// rapport va TOUJOURS sur la sortie standard, `--json` ou non : `doctor`
// n'a pas de forme texte distincte à documenter séparément, et répéter la
// même information deux fois n'ajoute aucune garantie.

async function commandDoctor(argv: readonly string[]): Promise<number> {
  parseFlagsAvecBooleens(argv, new Set(['json']))
  const report = await runDoctorProbes()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  return 0
}

/* ──────────────────────────────── `campaign preflight` (T41, L513-L521) */
//
// Lecture seule par contrat (section III.3 de acceptance/T41.spec.ts) : lit
// le chemin de manifeste (premier argument positionnel, jamais un drapeau —
// même discipline que `commandCampaign`/`commandPilot` pour leur chemin de
// fixture/manifeste) puis les deux drapeaux requis, refuse si l'un manque,
// puis délègue à `campaignOpsPreflight` (`@bench/activities`,
// `src/campaign-ops.ts`) : une fonction PURE qui n'ouvre aucune connexion.

async function commandCampaignPreflight(argv: readonly string[]): Promise<number> {
  const [manifestPath, ...rest] = argv
  if (manifestPath === undefined || manifestPath.startsWith('--')) {
    process.stderr.write('bench campaign preflight exige un chemin de manifeste en premier argument\n')
    return 1
  }
  const flags = parseFlags(rest)
  const mode = flags.get('mode')
  const campaignId = flags.get('campaign-id')
  if (mode === undefined || campaignId === undefined) {
    process.stderr.write('bench campaign preflight exige --mode et --campaign-id\n')
    return 1
  }
  try {
    const result = campaignOpsPreflight({ manifestPath, mode })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    process.stderr.write(`bench campaign preflight : ${message}\n`)
    return 1
  }
}

/* ──────────────────────────────────────── `campaign run` (T41, L513-L521) */
//
// Lit le chemin de manifeste (premier argument positionnel) puis les cinq
// drapeaux requis, refuse si l'un manque, puis délègue à `runCampaignOps`
// (`@bench/activities`, `src/campaign-ops.ts`) : un prérequis manquant (A3)
// REND un refus structuré SUR LA SORTIE STANDARD (jamais seulement un message
// d'erreur sur la sortie d'erreur — un appelant qui ne lirait que stdout doit
// pouvoir lire le refus) et cette commande traduit ce refus en code de sortie
// NON NUL ; prêt (A2), elle imprime le résultat d'exécution réelle et sort en
// 0.

async function commandCampaignRun(argv: readonly string[]): Promise<number> {
  const [manifestPath, ...rest] = argv
  if (manifestPath === undefined || manifestPath.startsWith('--')) {
    process.stderr.write('bench campaign run exige un chemin de manifeste en premier argument\n')
    return 1
  }
  const flags = parseFlags(rest)
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  const s3Bucket = flags.get('s3-bucket')
  const mode = flags.get('mode')
  const provider = flags.get('provider')
  if (
    campaignId === undefined ||
    postgresDatabase === undefined ||
    s3Bucket === undefined ||
    mode === undefined ||
    provider === undefined
  ) {
    process.stderr.write(
      'bench campaign run exige --campaign-id, --postgres-database, --s3-bucket, --mode et --provider\n'
    )
    return 1
  }
  try {
    const result = await runCampaignOps({ manifestPath, campaignId, postgresDatabase, s3Bucket, mode, provider })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return result.ready === false ? 1 : 0
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    process.stdout.write(
      `${JSON.stringify({ ready: false, missing_prerequisites: [], execution_started: false, error: message }, null, 2)}\n`
    )
    return 1
  }
}

/* ─────────────────────────────────────── `campaign cancel` (T41, A4) ──── */
//
// Lit les trois drapeaux requis, refuse si l'un manque, puis délègue à
// `cancelCampaignOps` (`@bench/activities`, `src/campaign-ops.ts`) : un
// chemin STRUCTURELLEMENT incapable d'écrire (voir l'en-tête de ce fichier) —
// aucun artefact, ni le sien ni celui d'une autre campagne, n'est jamais
// touché.

async function commandCampaignCancel(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  const s3Bucket = flags.get('s3-bucket')
  if (campaignId === undefined || postgresDatabase === undefined || s3Bucket === undefined) {
    process.stderr.write('bench campaign cancel exige --campaign-id, --postgres-database et --s3-bucket\n')
    return 1
  }
  const result = await cancelCampaignOps({ campaignId, postgresDatabase, s3Bucket })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

/* ──────────── `scenario validate` / `campaign plan|status|resume` /
   `checkpoint inspect|fork` / `billing reconcile` / `analysis export|run` /
   `report build` (T41, L517 : 14 commandes minimales, SQUELETTE) ─────────
//
// Ces dix commandes complètent les 14 « commandes minimales » du cahier

// (L517) au-delà des quatre que T41 rend réellement vertes ci-dessus
// (`doctor`, `campaign preflight|run|cancel`). `acceptance/T41.spec.ts`
// (section V) est explicite : aucun des sept cas requis de T41 n'exerce leur
// COMPORTEMENT métier — seule A7 (section III.5) exige qu'elles soient
// PARSÉES et DOCUMENTÉES. Leur substance dépend de contrats que d'autres
// tâches du cahier publient (T06 scenario, T15/T27 checkpoint, T16 billing,
// T31-T36 analysis/report) : les implémenter ici, par anticipation d'une
// suite d'acceptation qui n'existe pas encore pour elles, inventerait un
// comportement non testé (cahier §G : « ni test sauté, ni rapport absent »
// vaut aussi à l'envers — un comportement non prouvé ne doit pas se prétendre
// acquis). Chacune lève donc `NotImplemented`, exactement comme `doctor` et
// `campaign preflight|run|cancel` le faisaient avant que CE tour de T41 ne
// les rende vertes.
// ─────────────────────────────────────────────────────────────────────────── */

async function commandScenarioValidate(_argv: readonly string[]): Promise<number> {
  throw new NotImplemented('cli.scenario.validate')
}
async function commandScenarioDispatch(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'validate') return commandScenarioValidate(rest)
  process.stderr.write(`bench scenario : sous-commande inconnue ${JSON.stringify(sub)}\n`)
  return 2
}

async function commandCampaignPlan(_argv: readonly string[]): Promise<number> {
  throw new NotImplemented('cli.campaign.plan')
}
async function commandCampaignStatus(_argv: readonly string[]): Promise<number> {
  throw new NotImplemented('cli.campaign.status')
}
async function commandCampaignResume(_argv: readonly string[]): Promise<number> {
  throw new NotImplemented('cli.campaign.resume')
}

/**
 * `checkpoint inspect` (T42, section II.3) : AJOUTE `--checkpoint-id` au
 * squelette T41 (`--campaign-id`/`--postgres-database`) — sans ce drapeau,
 * deux checkpoints publiés sous la même campagne seraient indiscernables.
 * Relit le manifeste depuis PostgreSQL SEUL (`inspectCheckpoint`,
 * `@bench/activities`) : aucun `--s3-bucket` requis, aucune mémoire partagée
 * avec le processus qui a produit le checkpoint (A5).
 */
async function commandCheckpointInspect(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  const checkpointId = flags.get('checkpoint-id')
  if (campaignId === undefined || postgresDatabase === undefined || checkpointId === undefined) {
    process.stderr.write('bench checkpoint inspect exige --campaign-id, --postgres-database et --checkpoint-id\n')
    return 1
  }
  const result = await inspectCheckpoint({ campaignId, postgresDatabase, checkpointId })
  if (result === null) {
    process.stderr.write(`bench checkpoint inspect : checkpoint introuvable pour campaign-id=${campaignId} checkpoint-id=${checkpointId}\n`)
    return 1
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}
async function commandCheckpointFork(_argv: readonly string[]): Promise<number> {
  throw new NotImplemented('cli.checkpoint.fork')
}
async function commandCheckpointDispatch(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'inspect') return commandCheckpointInspect(rest)
  if (sub === 'fork') return commandCheckpointFork(rest)
  process.stderr.write(`bench checkpoint : sous-commande inconnue ${JSON.stringify(sub)}\n`)
  return 2
}

async function commandBillingReconcile(_argv: readonly string[]): Promise<number> {
  throw new NotImplemented('cli.billing.reconcile')
}
async function commandBillingDispatch(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'reconcile') return commandBillingReconcile(rest)
  process.stderr.write(`bench billing : sous-commande inconnue ${JSON.stringify(sub)}\n`)
  return 2
}

/**
 * `analysis export --postgres-database <db>` (T42, section II.2) : relit la
 * table ad hoc que `bench campaign` (T38, `@bench/activities/campaign.ts`)
 * écrit déjà sur ce même PostgreSQL, sans jamais rouvrir le processus qui a
 * exécuté la campagne.
 */
async function commandAnalysisExport(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const postgresDatabase = flags.get('postgres-database')
  if (postgresDatabase === undefined) {
    process.stderr.write('bench analysis export exige --postgres-database\n')
    return 1
  }
  const result = await exportAnalysis({ postgresDatabase })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

/**
 * `analysis run <export.json>` (T42, section II.2) : AUCUN `--postgres-database`
 * ni `--s3-bucket` dans le squelette T41 — cette commande ne lit QUE le
 * fichier désigné (A4 : « depuis les SEULS exports »).
 */
async function commandAnalysisRun(argv: readonly string[]): Promise<number> {
  const [exportPath] = argv
  if (exportPath === undefined) {
    process.stderr.write("bench analysis run exige un chemin de fichier d'export en premier argument\n")
    return 1
  }
  const result = await runAnalysisFromExport({ exportPath })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}
async function commandAnalysisDispatch(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'export') return commandAnalysisExport(rest)
  if (sub === 'run') return commandAnalysisRun(rest)
  process.stderr.write(`bench analysis : sous-commande inconnue ${JSON.stringify(sub)}\n`)
  return 2
}

/**
 * `report build <analysis.json> [--live-receipts <recus.json>]` (T42, section
 * II.4) : AJOUTE `--live-receipts` au squelette T41 (un chemin positionnel
 * seul) — sans lui, LIVE_VALIDATED (cahier:L26) ne pourrait jamais être
 * exercée côté présent.
 */
async function commandReportBuild(argv: readonly string[]): Promise<number> {
  const [analysisPath, ...rest] = argv
  if (analysisPath === undefined) {
    process.stderr.write("bench report build exige un chemin de fichier d'analyse en premier argument\n")
    return 1
  }
  const restFlags = parseFlags(rest)
  const liveReceiptsPath = restFlags.get('live-receipts')
  const result = await buildReport({ analysisPath, liveReceiptsPath })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}
async function commandReportDispatch(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'build') return commandReportBuild(rest)
  process.stderr.write(`bench report : sous-commande inconnue ${JSON.stringify(sub)}\n`)
  return 2
}

/* ──────────────────────── dispatch `campaign` (T38 verte + T41 squelette) */
//
// `campaign preflight|run|cancel` (T41, SQUELETTE ci-dessus) sont des
// SOUS-COMMANDES distinctes de `campaign <fixture>` (T38, déjà verte) : le
// premier argument positionnel de `campaign <fixture>` est toujours un
// CHEMIN de fixture (p. ex. `fixtures/golden-six.json`), jamais l'un des
// trois mots réservés `preflight`/`run`/`cancel` — la distinction est donc
// sans ambiguïté et ne touche à aucune règle déjà verte de T38.

async function commandCampaignDispatch(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'preflight') return commandCampaignPreflight(rest)
  if (sub === 'run') return commandCampaignRun(rest)
  if (sub === 'cancel') return commandCampaignCancel(rest)
  if (sub === 'plan') return commandCampaignPlan(rest)
  if (sub === 'status') return commandCampaignStatus(rest)
  if (sub === 'resume') return commandCampaignResume(rest)
  return commandCampaign(argv)
}

/* ────────────────────────────────────── `pilot` (T39, L497-L504) */
//
// Lit le chemin de manifeste (premier argument positionnel, jamais un
// drapeau — même discipline que `commandCampaign` pour son chemin de
// fixture), puis les drapeaux requis, refuse si l'un manque, puis délègue la
// totalité du travail à `runPilot` (`@bench/activities`, `src/pilot.ts`) :
// préflight pur (sans `--execute`) ou exécution réelle bornée par un plafond
// budgétaire réel (avec `--execute`). AUCUNE RÈGLE MÉTIER ICI (même règle que
// l'en-tête du fichier).

async function commandPilot(argv: readonly string[]): Promise<number> {
  const [manifestPath, ...rest] = argv
  if (manifestPath === undefined || manifestPath.startsWith('--')) {
    process.stderr.write('bench pilot exige un chemin de manifeste en premier argument\n')
    return 1
  }
  const flags = parseFlagsAvecBooleens(rest, new Set(['execute', 'test-force-all-candidates-fail']))
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  const s3Bucket = flags.get('s3-bucket')
  if (campaignId === undefined || postgresDatabase === undefined || s3Bucket === undefined) {
    process.stderr.write('bench pilot exige --campaign-id, --postgres-database et --s3-bucket\n')
    return 1
  }
  const execute = flags.has('execute')
  const mode = flags.get('mode')
  const provider = flags.get('provider')
  const testForceAllCandidatesFail = flags.has('test-force-all-candidates-fail')
  try {
    const result = await runPilot({
      manifestPath,
      campaignId,
      postgresDatabase,
      s3Bucket,
      execute,
      testForceAllCandidatesFail,
      ...(mode === undefined ? {} : { mode }),
      ...(provider === undefined ? {} : { provider }),
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    process.stderr.write(`bench pilot : ${message}\n`)
    return 1
  }
}

/* ──────────────────────────────── `plan-distribution` (T40, L505-L512) */
//
// Lit les dix drapeaux requis, refuse si l'un manque (même discipline que
// `commandRunPeriod`/`commandFork`/`commandCampaign`), puis délègue la
// totalité du calcul à `planDistribution` (`@bench/activities`,
// `src/distribution.ts`) : AUCUNE RÈGLE MÉTIER ICI (même règle que l'en-tête
// du fichier) — `--postgres-database` est lu et validé présent (le contrat le
// liste) mais jamais transmis à une fonction qui écrirait quoi que ce soit ;
// `--plan-id` n'est lu que pour exiger sa présence (le contrôle A2 de la
// suite le fabrique lui-même pour vérifier, de l'extérieur, qu'aucune trace
// n'est attribuable à ce jeton).

async function commandPlanDistribution(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const campaignId = flags.get('campaign-id')
  const mode = flags.get('mode')
  const parentsRaw = flags.get('parents')
  const scenariosRaw = flags.get('scenarios')
  const configurationsRaw = flags.get('configurations')
  const repetitionsRaw = flags.get('repetitions')
  const budgetsRaw = flags.get('budgets')
  const periodsPerTrajectoryRaw = flags.get('periods-per-trajectory')
  const postgresDatabase = flags.get('postgres-database')
  const planId = flags.get('plan-id')
  if (
    campaignId === undefined ||
    mode === undefined ||
    parentsRaw === undefined ||
    scenariosRaw === undefined ||
    configurationsRaw === undefined ||
    repetitionsRaw === undefined ||
    budgetsRaw === undefined ||
    periodsPerTrajectoryRaw === undefined ||
    postgresDatabase === undefined ||
    planId === undefined
  ) {
    process.stderr.write(
      'bench plan-distribution exige --campaign-id, --mode, --parents, --scenarios, ' +
        '--configurations, --repetitions, --budgets, --periods-per-trajectory, ' +
        '--postgres-database et --plan-id\n'
    )
    return 1
  }
  const parseCount = (raw: string, flag: string): number | null => {
    const n = Number.parseInt(raw, 10)
    if (!Number.isInteger(n) || n < 0) {
      process.stderr.write(`bench plan-distribution : --${flag} invalide (${raw})\n`)
      return null
    }
    return n
  }
  const parents = parseCount(parentsRaw, 'parents')
  const scenarios = parseCount(scenariosRaw, 'scenarios')
  const configurations = parseCount(configurationsRaw, 'configurations')
  const repetitions = parseCount(repetitionsRaw, 'repetitions')
  const budgets = parseCount(budgetsRaw, 'budgets')
  const periodsPerTrajectory = parseCount(periodsPerTrajectoryRaw, 'periods-per-trajectory')
  if (
    parents === null ||
    scenarios === null ||
    configurations === null ||
    repetitions === null ||
    budgets === null ||
    periodsPerTrajectory === null
  ) {
    return 1
  }
  const result = await planDistribution({
    campaignId,
    mode,
    parents,
    scenarios,
    configurations,
    repetitions,
    budgets,
    periodsPerTrajectory,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

/* ───────────────────────── `distribution-run-bounded` (T40, L505-L512) */
//
// Lit les quatre drapeaux requis (les cinq points d'injection nommés
// `--max-concurrent`/`--test-activity-barrier-url`/
// `--test-stop-after-completions`/`--test-large-artifact-bytes`/
// `--export-history` restent optionnels, comme `--variant` ailleurs), refuse
// si l'un des requis manque, puis délègue la totalité du travail à
// `runDistributionBounded` (`@bench/activities`, `src/distribution.ts`) :
// soumission des jobs, Activity factice, plafond d'admission (même file que
// T26), arrêt simulé et export d'historique. AUCUNE RÈGLE MÉTIER ICI (même
// règle que l'en-tête du fichier). Un arrêt simulé (`--test-stop-after-
// completions`) termine le PROCESSUS depuis l'intérieur de
// `runDistributionBounded` lui-même (`crashExit`, cahier L371-377) : cette
// fonction ne rend alors jamais la main.

async function commandDistributionRunBounded(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const campaignId = flags.get('campaign-id')
  const mode = flags.get('mode')
  const jobsRaw = flags.get('jobs')
  const postgresDatabase = flags.get('postgres-database')
  if (
    campaignId === undefined ||
    mode === undefined ||
    jobsRaw === undefined ||
    postgresDatabase === undefined
  ) {
    process.stderr.write(
      'bench distribution-run-bounded exige --campaign-id, --mode, --jobs et --postgres-database\n'
    )
    return 1
  }
  const jobs = Number.parseInt(jobsRaw, 10)
  if (!Number.isInteger(jobs) || jobs < 0) {
    process.stderr.write(`bench distribution-run-bounded : --jobs invalide (${jobsRaw})\n`)
    return 1
  }
  const maxConcurrentRaw = flags.get('max-concurrent')
  const maxConcurrent = maxConcurrentRaw === undefined ? undefined : Number.parseInt(maxConcurrentRaw, 10)
  if (maxConcurrent !== undefined && (!Number.isInteger(maxConcurrent) || maxConcurrent < 1)) {
    process.stderr.write(`bench distribution-run-bounded : --max-concurrent invalide (${String(maxConcurrentRaw)})\n`)
    return 1
  }
  const testStopAfterCompletionsRaw = flags.get('test-stop-after-completions')
  const testStopAfterCompletions =
    testStopAfterCompletionsRaw === undefined ? undefined : Number.parseInt(testStopAfterCompletionsRaw, 10)
  const testLargeArtifactBytesRaw = flags.get('test-large-artifact-bytes')
  const testLargeArtifactBytes =
    testLargeArtifactBytesRaw === undefined ? undefined : Number.parseInt(testLargeArtifactBytesRaw, 10)
  const testActivityBarrierUrl = flags.get('test-activity-barrier-url')
  const exportHistory = flags.get('export-history')
  const result = await runDistributionBounded({
    campaignId,
    mode,
    jobs,
    postgresDatabase,
    ...(maxConcurrent === undefined ? {} : { maxConcurrent }),
    ...(testActivityBarrierUrl === undefined ? {} : { testActivityBarrierUrl }),
    ...(testStopAfterCompletions === undefined ? {} : { testStopAfterCompletions }),
    ...(testLargeArtifactBytes === undefined ? {} : { testLargeArtifactBytes }),
    ...(exportHistory === undefined ? {} : { exportHistoryPath: exportHistory }),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

/* ──────────────────────────────── `distribution-resume` (T40, L505-L512) */
//
// Lit les deux drapeaux requis (`--export-history` reste optionnel), refuse
// si l'un manque, puis délègue la totalité du travail à `resumeDistribution`
// (`@bench/activities`, `src/distribution.ts`) : lecture de l'état persisté
// sous `--campaign-id` et achèvement des jobs restants. AUCUNE RÈGLE MÉTIER
// ICI (même règle que l'en-tête du fichier).

async function commandDistributionResume(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv)
  const campaignId = flags.get('campaign-id')
  const postgresDatabase = flags.get('postgres-database')
  if (campaignId === undefined || postgresDatabase === undefined) {
    process.stderr.write('bench distribution-resume exige --campaign-id et --postgres-database\n')
    return 1
  }
  const exportHistory = flags.get('export-history')
  const result = await resumeDistribution({
    campaignId,
    postgresDatabase,
    ...(exportHistory === undefined ? {} : { exportHistoryPath: exportHistory }),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

async function main(): Promise<number> {
  const [command = '', ...rest] = process.argv.slice(2)
  if (command === 'demo') return commandDemo(rest)
  if (command === 'run-period') return commandRunPeriod(rest)
  if (command === 'run-trajectory') return commandRunTrajectory(rest)
  if (command === 'replay-trajectory') return commandReplayTrajectory(rest)
  if (command === 'fork') return commandFork(rest)
  if (command === 'doctor') return commandDoctor(rest)
  if (command === 'campaign') return commandCampaignDispatch(rest)
  if (command === 'pilot') return commandPilot(rest)
  if (command === 'plan-distribution') return commandPlanDistribution(rest)
  if (command === 'distribution-run-bounded') return commandDistributionRunBounded(rest)
  if (command === 'distribution-resume') return commandDistributionResume(rest)
  if (command === 'scenario') return commandScenarioDispatch(rest)
  if (command === 'checkpoint') return commandCheckpointDispatch(rest)
  if (command === 'billing') return commandBillingDispatch(rest)
  if (command === 'analysis') return commandAnalysisDispatch(rest)
  if (command === 'report') return commandReportDispatch(rest)
  if (command === '' || command === '--help' || command === 'help') {
    process.stdout.write(USAGE)
    return command === '' ? 2 : 0
  }
  process.stderr.write(`commande inconnue : ${command}\n${USAGE}`)
  return 2
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
