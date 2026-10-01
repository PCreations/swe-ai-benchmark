// ─────────────────────────────────────────────────────────────────────────────
// `bench` — les commandes de campagne (§C, L52). À ce jalon : `demo`, et le
// SQUELETTE rouge de `run-period` (T23, cahier L355).
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
//     ni contrôle : elle lit une ligne de commande et appelle `runDemo`. Le
//     domaine vit dans `@bench/scenario` ; le dupliquer ici donnerait deux
//     vérités, dont une seule serait testée.
//
// `run-period` (T23, L355 : « services d'application et commande `bench
// run-period` utilisant les adaptateurs reels locaux ») N'EST ENCORE QU'UN
// SQUELETTE : elle lit ses drapeaux (jamais ne les ignore — meme regle (1)
// ci-dessus) puis leve `NotImplemented('cli.run-period')`. Aucune regle
// metier n'est ecrite ici — ni phase, ni checkpoint, ni cout — c'est tout
// l'objet de l'etage ROUGE : acceptance/T23.spec.ts doit echouer par cette
// absence nommee, jamais par un module introuvable.
// ─────────────────────────────────────────────────────────────────────────────
import process from 'node:process'

import { NotImplemented } from '@bench/contracts'
import { runDemo } from '@bench/scenario'

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
        locaux (T23, cahier L353-L359). PAS ENCORE IMPLEMENTEE : leve
        NOT_IMPLEMENTED apres lecture des drapeaux.

        --mode                     recorded
        --campaign-id              identite de la trajectoire (L78)
        --postgres-database        base PostgreSQL reelle a utiliser
        --s3-bucket                bucket S3 (ou compatible) reel a utiliser
        --variant                  nominal | invalid-candidate | ...
        --test-stop-after-phase    point d'injection nomme (cahier:L141)

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
 * `run-period` — SQUELETTE (etage ROUGE de T23). Lit les drapeaux requis,
 * refuse si l'un manque (meme discipline que `commandDemo`), puis leve
 * `NotImplemented` : aucune regle metier n'est encore ecrite.
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
  throw new NotImplemented('cli.run-period')
}

async function main(): Promise<number> {
  const [command = '', ...rest] = process.argv.slice(2)
  if (command === 'demo') return commandDemo(rest)
  if (command === 'run-period') return commandRunPeriod(rest)
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
