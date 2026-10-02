// ─────────────────────────────────────────────────────────────────────────────
// `bench` — les commandes de campagne (§C, L52) : `demo` (T11),
// `run-period` (T23, cahier L353-L359), `run-trajectory` / `replay-trajectory`
// (T24, cahier L361-L370), `fork` (T27, cahier L387-L394) et le SQUELETTE rouge
// de `campaign` (T38, cahier L487-L496).
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

import { runCampaign, runPeriodOnce } from '@bench/activities'
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
  const outcome = await runPeriodOnce({
    mode,
    campaignId,
    postgresDatabase,
    s3Bucket,
    variant,
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

async function main(): Promise<number> {
  const [command = '', ...rest] = process.argv.slice(2)
  if (command === 'demo') return commandDemo(rest)
  if (command === 'run-period') return commandRunPeriod(rest)
  if (command === 'run-trajectory') return commandRunTrajectory(rest)
  if (command === 'replay-trajectory') return commandReplayTrajectory(rest)
  if (command === 'fork') return commandFork(rest)
  if (command === 'campaign') return commandCampaign(rest)
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
