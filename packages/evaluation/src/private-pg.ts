// ─────────────────────────────────────────────────────────────────────────────
// Clone PostgreSQL jetable pour T20 (cahier L327-L336).
//
// CE QUE « CLONER developerDsn » VEUT DIRE ICI, ET POURQUOI CE N'EST PAS UNE
// SIMPLE BASE SUR LE MÊME SERVEUR. L329 exige une « frontière d'accès
// distincte » : ni le credential développeur, ni le serveur qui le sert, ne
// doivent être exposés à la copie privée. On ne crée donc pas juste une
// nouvelle base sur le cluster PostgreSQL 18 partagé (`postgres18`, la
// capacité déjà utilisée par T09/T15/etc.) : on lance un cluster ÉPHÉMÈRE
// séparé (initdb + pg_ctl), dont le seul rôle valable ignore tout du
// developerDsn d'origine, et qu'on détruit à la fin de CHAQUE évaluation
// (« copie jetable », littéralement).
//
// POURQUOI CE CLUSTER TOURNE SOUS L'UTILISATEUR SYSTÈME `postgres`, PAS SOUS
// ROOT. `postgres`/`initdb` refusent de s'exécuter en tant que root — et ce
// paquet tourne en root dans ce conteneur, comme `packages/sandbox` (cf.
// runtime.ts, même contrainte). On abaisse donc le privilège du sous-processus
// via `uid`/`gid` (équivalent mesuré de `su postgres -c …`) vers
// l'utilisateur système `postgres` que `infra/bootstrap/20-postgres18.sh` a
// déjà installé — sans quoi le cluster partagé `postgres18` (capacité déjà
// sondée par `bench doctor`) ne tournerait pas non plus.
//
// POURQUOI LE CANDIDAT S'Y CONNECTE PAR TCP SUR L'ADRESSE ROUTABLE DE
// L'HÔTE, JAMAIS PAR SOCKET UNIX NI PAR 127.0.0.1. Le candidat tourne dans un
// netns dédié (`@bench/sandbox`, `net.ts`) : sa boucle locale n'est PAS celle
// de l'hôte, et son `/tmp` est un tmpfs FRAIS (rootfs.ts) qui ne voit jamais
// le socket Unix de l'hôte. Le seul chemin qui traverse la paire veth est une
// adresse IPv4 explicite — la même adresse « routable de l'hôte » que les
// talons de test de T19/T20 utilisent déjà pour se faire joindre depuis le
// netns du candidat (cf. `net.ts`, en-tête : « hook INPUT » pour une adresse
// locale à l'hôte). C'est pour ça que ce cluster écoute aussi sur cette
// adresse, en plus de 127.0.0.1 (pratique pour le clonage lui-même, exécuté
// hors sandbox).
//
// POURQUOI `pg_hba.conf` FAIT CONFIANCE À 10.77.0.0/16 SANS MOT DE PASSE.
// C'est exactement le sous-réseau que `packages/sandbox/src/ids.ts`
// (`netPlanFor`) attribue à TOUTE paire veth candidat — jamais autre chose.
// Le cloisonnement réel ne vient pas de l'authentification PostgreSQL : il
// vient de la règle nftables PAR SANDBOX que `net.ts` installe (chaîne
// `sb_<short>`, politique implicite « drop ») et qui n'autorise CE port
// éphémère que pour LE candidat de CETTE évaluation (`allowedEgress`, ajouté
// par `private-run.ts`) — un autre sandbox n'a simplement aucune règle
// d'acceptation vers ce port, donc son trafic tombe sur le `drop` de sa
// propre chaîne avant même d'atteindre PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import { appendFileSync, chownSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'

interface SpawnIds {
  readonly uid: number
  readonly gid: number
}

function discoverPgBinDir(): string {
  const base = '/usr/lib/postgresql'
  if (existsSync(base)) {
    const versions = readdirSync(base)
      .filter((v) => existsSync(path.join(base, v, 'bin', 'initdb')))
      .sort((a, b) => Number(b) - Number(a))
    const top = versions[0]
    if (top !== undefined) return path.join(base, top, 'bin')
  }
  return ''
}

function postgresIds(): SpawnIds | null {
  try {
    const uid = Number(execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).trim())
    const gid = Number(execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).trim())
    if (Number.isFinite(uid) && Number.isFinite(gid)) return { uid, gid }
  } catch {
    /* pas d'utilisateur système « postgres » : on retente sans abaissement */
  }
  return null
}

function hostRoutableIp(): string {
  const nets = os.networkInterfaces()
  for (const list of Object.values(nets)) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return '127.0.0.1'
}

function freeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr === null || typeof addr === 'string') {
        srv.close()
        reject(new Error('freeTcpPort : adresse invalide'))
        return
      }
      const port = addr.port
      srv.close(() => resolve(port))
    })
  })
}

export interface PrivatePostgresEgress {
  readonly label: string
  readonly host: string
  readonly port: number
}

export interface PrivatePostgresCopy {
  /** DSN joignable DEPUIS LE NETNS DU CANDIDAT (adresse routable + TCP). */
  readonly dsn: string
  readonly egress: PrivatePostgresEgress
  /** Arrête le cluster éphémère et efface son répertoire de données. */
  destroy(): void
}

let counter = 0
function uniqueSuffix(): string {
  counter += 1
  return `${process.pid.toString(36)}_${Date.now().toString(36)}_${counter.toString(36)}`
}

/**
 * Clone `developerDsn` (schéma + données) dans un cluster PostgreSQL
 * ÉPHÉMÈRE et isolé, joignable uniquement par TCP sur l'adresse routable de
 * l'hôte. Le cluster développeur d'origine n'est jamais modifié ni exposé.
 */
export async function provisionPrivatePostgres(developerDsn: string): Promise<PrivatePostgresCopy> {
  const binDir = discoverPgBinDir()
  const bin = (name: string): string => (binDir === '' ? name : path.join(binDir, name))
  const ids = postgresIds()
  const dropPrivileges = process.getuid !== undefined && process.getuid() === 0 && ids !== null
  const spawnIds: { uid?: number; gid?: number } = dropPrivileges
    ? { uid: (ids as SpawnIds).uid, gid: (ids as SpawnIds).gid }
    : {}

  const dataDir = mkdtempSync(path.join(os.tmpdir(), `bench-eval-pgcopy-${uniqueSuffix()}-`))
  if (dropPrivileges) chownSync(dataDir, (ids as SpawnIds).uid, (ids as SpawnIds).gid)

  const dbUser = 'bench_eval'
  const dbName = 'private_copy'
  const host = hostRoutableIp()
  const port = await freeTcpPort()

  const run = (cmd: string, args: readonly string[], input?: string): void => {
    execFileSync(bin(cmd), [...args], {
      ...spawnIds,
      encoding: 'utf8',
      stdio: input === undefined ? ['ignore', 'ignore', 'pipe'] : ['pipe', 'ignore', 'pipe'],
      ...(input === undefined ? {} : { input }),
    })
  }

  try {
    run('initdb', ['-D', dataDir, '--auth=trust', '-U', dbUser, '--no-sync'])
    appendFileSync(
      path.join(dataDir, 'postgresql.conf'),
      `\nlisten_addresses = '${host},127.0.0.1'\nport = ${port}\nunix_socket_directories = '${dataDir}'\nfsync = off\n`,
    )
    // cahier L323/A2-A3 (T19) : même sous-réseau que `netPlanFor` — jamais un
    // hôte de développeur, jamais autre chose (cf. en-tête de ce fichier).
    appendFileSync(path.join(dataDir, 'pg_hba.conf'), '\nhost all all 10.77.0.0/16 trust\n')

    run('pg_ctl', ['-D', dataDir, '-l', path.join(dataDir, 'server.log'), '-w', 'start'])
    run('psql', ['-h', dataDir, '-p', String(port), '-U', dbUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${dbName}`])

    // `--no-owner --no-privileges` : le développeur a pu se connecter sous
    // n'importe quel rôle OS (le harnais de test se connecte en root) ; ce
    // rôle n'existe pas forcément dans le cluster éphémère fraîchement créé,
    // et la copie n'a besoin d'hériter ni de la propriété ni des ACL
    // d'origine (mesuré : sans ces deux options, la restauration échoue sur
    // `role "…" does not exist`).
    const dump = execFileSync(bin('pg_dump'), ['--no-owner', '--no-privileges', developerDsn], { encoding: 'utf8' })
    run('psql', ['-h', dataDir, '-p', String(port), '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', '-'], dump)
  } catch (e) {
    try {
      run('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop'])
    } catch {
      /* jamais démarré, ou déjà arrêté */
    }
    rmSync(dataDir, { recursive: true, force: true })
    throw e
  }

  let destroyed = false
  return {
    dsn: `postgresql://${dbUser}@${host}:${port}/${dbName}`,
    egress: { label: 'eval-private-postgres', host, port },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      try {
        run('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop'])
      } catch {
        /* au mieux : on efface le répertoire malgré tout */
      }
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
