// ─────────────────────────────────────────────────────────────────────────────
// bench svc — cycle de vie des services dont dépendent les sondes de capacité.
//
// POURQUOI CE FICHIER EXISTE. `bench doctor` nommait déjà `bench svc up` dans
// le remède de `postgres18`, `s3` et `temporal` ; la commande, elle, n'existait
// pas. Ces trois capacités n'étaient donc présentes que parce qu'un humain (ou
// un agent) avait lancé les serveurs À LA MAIN dans ce conteneur. Au boot
// suivant, `readEvidence()` refuse l'évidence d'un autre `boot_id`, les sondes
// repassent ABSENT, les tâches attestées avec elles deviennent STALE — et RIEN
// ne savait les rétablir. La règle « une capacité absente donne BLOCKED, jamais
// un PASS affaibli » suppose qu'une absence soit RÉCUPÉRABLE : sans remède
// exécutable, elle ne laisse le choix qu'entre rester bloqué pour toujours et
// affaiblir la preuve. Ce fichier est le remède.
//
// POURQUOI DANS `tools/` ET PAS DANS `verification/runner/`. `verification/
// runner` est une entrée GLOBALE d'`input_digest` (input-digest.mjs) : y
// ajouter un fichier re-périme les 44 tâches, dont les 6 déjà prouvées à HEAD.
// `svc` ne juge rien — il ne décide jamais qu'un test passe, seulement qu'un
// port répond. Le mettre dans le runner coûterait 6 ré-attestations pour zéro
// garantie supplémentaire. C'est le même raisonnement que pour `tools/lease.mjs`.
//
// POURQUOI ON RÉUTILISE LES SONDES DE `doctor.mjs` PLUTÔT QUE DE LES RÉÉCRIRE.
// Un `up` qui attendrait « le port 5432 est ouvert » rendrait la main sur un
// PostgreSQL 16, ou sur un 18 où le rôle de l'utilisateur courant n'existe pas
// encore : `bench doctor` dirait ABSENT juste après un `up` qui se croit
// réussi. La condition d'arrêt de `up` est donc LA SONDE ELLE-MÊME, importée,
// pas une approximation qui pourrait diverger d'elle au premier changement.
// `probes` est pur (il n'écrit pas `.bench/doctor.json` — c'est `writeEvidence`
// qui le fait), donc `status` peut l'appeler sans rien écrire.
//
// CE QUE `up` NE FAIT PAS : installer. Un binaire manquant déclenche le script
// `infra/bootstrap/*.sh` correspondant — celui-là même qui épingle l'empreinte
// TOFU — jamais un téléchargement improvisé qui contournerait le verrou.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { userInfo } from 'node:os'
import { repoRoot } from '../verification/runner/git.mjs'
import { probes } from '../verification/runner/doctor.mjs'

const R = repoRoot()

// Même défaut que `infra/bootstrap/lib.sh` : les binaires et les configs que
// `svc` démarre sont ceux que le bootstrap a produits, pas une seconde copie.
export const BENCH_HOME = process.env.BENCH_HOME ?? `${R}/.bench/home`
const BIN = `${BENCH_HOME}/bin`
const RUN = `${BENCH_HOME}/run`

// Les sondes lisent S3_ENDPOINT / TEMPORAL_ADDRESS ; démarrer sur un port figé
// pendant que la sonde en interroge un autre ferait attendre `up` jusqu'au
// délai de garde puis échouer sans raison lisible. On dérive donc les ports de
// la même source que les sondes.
const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000'
const S3_URL = new URL(S3_ENDPOINT)
const S3_HOST = S3_URL.hostname
const S3_PORT = Number(S3_URL.port || (S3_URL.protocol === 'https:' ? 443 : 80))
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233'
const TEMPORAL_HOST = TEMPORAL_ADDRESS.split(':')[0] || '127.0.0.1'
const TEMPORAL_PORT = Number(TEMPORAL_ADDRESS.split(':')[1] ?? 7233)

const PG_VERSION = '18'
const PG_CLUSTER = 'main'
const PG_BINDIR = `/usr/lib/postgresql/${PG_VERSION}/bin`
const PG_PORT = 5432

const GARAGE_BIN = `${BIN}/garage`
const GARAGE_DIR = `${BENCH_HOME}/garage`
const GARAGE_CFG = `${GARAGE_DIR}/garage.toml`
const TEMPORAL_BIN = `${BIN}/temporal`
const TEMPORAL_DB = `${RUN}/temporal.db`

/** Ordre stable : c'est celui de l'affichage et celui du démarrage. */
export const SERVICES = ['postgres18', 's3', 'temporal']

const LABEL = {
  postgres18: `PostgreSQL ${PG_VERSION} (${PG_PORT})`,
  s3: `Garage S3 (${S3_PORT})`,
  temporal: `Temporal dev (${TEMPORAL_PORT})`,
}

// ── Primitives ──────────────────────────────────────────────────────────────

/** Attente synchrone : tout le socle est synchrone, une promesse ici serait une
 *  exception de style qui obligerait `tools/bench` à devenir asynchrone. */
const sleep = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 180000, ...opts })
  return {
    ok: r.status === 0,
    code: r.status,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
  }
}

const have = (bin) => sh('sh', ['-c', `command -v ${bin}`]).ok
/** Échappement shell : les configs vivent sous BENCH_HOME, qui peut contenir
 *  n'importe quoi — une concaténation naïve casserait sur un espace. */
const shq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`

const probe = (name) => {
  try {
    return probes[name]()
  } catch (e) {
    return { present: false, reason: `sonde en erreur : ${String(e.message).slice(0, 120)}` }
  }
}

/**
 * Attend que LA SONDE — pas le port — réponde présent. `timeoutMs` est généreux
 * pour Temporal, dont le serveur de dev migre son schéma au premier démarrage.
 */
function waitProbe(name, timeoutMs, log) {
  const t0 = Date.now()
  let last = probe(name)
  while (!last.present && Date.now() - t0 < timeoutMs) {
    sleep(500)
    last = probe(name)
  }
  const waited = Math.round((Date.now() - t0) / 100) / 10
  if (last.present) log(`    sonde ${name} presente apres ${waited}s : ${last.detail}`)
  else log(`    sonde ${name} TOUJOURS absente apres ${waited}s : ${last.reason}`)
  return last
}

/** Attend l'ABSENCE de la sonde : `down` doit prouver qu'il a arrêté, pas
 *  supposer qu'un SIGTERM a suffi. */
function waitProbeGone(name, timeoutMs, log) {
  const t0 = Date.now()
  let last = probe(name)
  while (last.present && Date.now() - t0 < timeoutMs) {
    sleep(400)
    last = probe(name)
  }
  if (last.present) log(`    sonde ${name} repond ENCORE : ${last.detail}`)
  return last
}

/**
 * Processus dont la ligne de commande contient TOUS les fragments donnés.
 *
 * POURQUOI PAS SEULEMENT UN FICHIER DE PID. Les serveurs que `svc down` doit
 * pouvoir arrêter aujourd'hui ont été lancés à la main, sans pidfile — et c'est
 * précisément le cas que cette commande existe pour réparer. Le pidfile reste
 * la voie normale ; l'inspection de `ps` est le filet qui rend `down` capable
 * d'adopter ce qui tournait avant lui. Les fragments sont ancrés sur BENCH_HOME,
 * donc deux BENCH_HOME distincts ne se tuent jamais l'un l'autre.
 */
function pidsMatching(...needles) {
  const r = sh('ps', ['-eo', 'pid=,args='])
  if (!r.ok) return []
  const self = process.pid
  return r.out
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
    .filter(Boolean)
    .filter(([, , args]) => needles.every((n) => args.includes(n)))
    .map(([, pid]) => Number(pid))
    .filter((p) => p !== self)
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** SIGTERM, puis SIGKILL seulement si le processus s'obstine : « proprement »
 *  veut dire laisser Garage fermer sa base sqlite et Temporal son WAL. */
function stopPids(pids, log, graceMs = 15000) {
  for (const p of pids) {
    try {
      process.kill(p, 'SIGTERM')
    } catch {}
  }
  const t0 = Date.now()
  while (Date.now() - t0 < graceMs && pids.some(alive)) sleep(250)
  for (const p of pids.filter(alive)) {
    log(`    pid ${p} ignore SIGTERM — SIGKILL`)
    try {
      process.kill(p, 'SIGKILL')
    } catch {}
  }
  return pids
}

/**
 * Démarre un serveur détaché, journal en append sous BENCH_HOME/run.
 * `detached + unref` est indispensable : sans lui, le serveur meurt avec le
 * processus `bench`, et `up` rendrait la main sur un service déjà mort.
 */
function spawnDetached(name, cmd, args) {
  mkdirSync(RUN, { recursive: true })
  const logFile = `${RUN}/${name}.log`
  const fd = openSync(logFile, 'a')
  const child = spawn(cmd, args, { detached: true, stdio: ['ignore', fd, fd] })
  child.unref()
  writeFileSync(`${RUN}/${name}.pid`, `${child.pid}\n`)
  return { pid: child.pid, logFile }
}

const readPid = (name) => {
  try {
    const p = Number(readFileSync(`${RUN}/${name}.pid`, 'utf8').trim())
    return Number.isFinite(p) && alive(p) ? p : null
  } catch {
    return null
  }
}

// ── PostgreSQL 18 ───────────────────────────────────────────────────────────

/**
 * Répertoires de sockets à servir. Le devcontainer pose `PGHOST=/bench/run/pg` :
 * la sonde s'y connectera, donc un cluster qui n'écoute que sur
 * /var/run/postgresql y serait invisible. On sert les deux.
 */
function pgSocketDirs() {
  const dirs = ['/var/run/postgresql']
  const h = process.env.PGHOST
  if (h && h.startsWith('/')) dirs.unshift(h)
  return [...new Set(dirs)]
}

/** `online` | `down` | null (le cluster n'existe pas). */
function pgClusterState() {
  const r = sh('pg_lsclusters', ['-h'])
  if (!r.ok) return null
  for (const line of r.out.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f[0] === PG_VERSION && f[1] === PG_CLUSTER) return f[3]
  }
  return null
}

/**
 * SQL en superutilisateur. La session courante marche dès que le rôle existe ;
 * sinon il faut passer par le compte `postgres` (authentification peer). On ne
 * lance JAMAIS `su` sans être root : hors root, `su` réclamerait un mot de passe
 * et ferait pendre `svc up` indéfiniment.
 */
function psqlSuper(sql) {
  const direct = sh('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-c', sql])
  if (direct.ok) return direct
  const inner = `psql -tAqX -v ON_ERROR_STOP=1 -c ${shq(sql)}`
  if (process.getuid?.() === 0) return sh('su', ['postgres', '-c', inner])
  if (have('sudo')) return sh('sudo', ['-n', '-u', 'postgres', 'sh', '-c', inner])
  return direct
}

/**
 * La sonde lance `psql` SANS argument de connexion : elle atterrit donc sur le
 * rôle et la base nommés comme l'utilisateur du système. Un cluster fraîchement
 * créé par apt n'a ni l'un ni l'autre, et la sonde dirait « aucun serveur
 * PostgreSQL joignable » alors que le serveur tourne. C'est exactement le genre
 * d'absence non récupérable que cette commande doit supprimer.
 */
function pgEnsureRole(log) {
  const user = userInfo().username
  if (user === 'postgres') return true
  const q = (sql) => psqlSuper(sql)
  // Littéral SQL : le doublement de l'apostrophe est la seule échappatoire
  // portable, et un nom d'utilisateur système n'est pas une donnée de confiance.
  const lit = `'${user.replaceAll("'", "''")}'`
  const hasRole = q(`SELECT 1 FROM pg_roles WHERE rolname = ${lit}`)
  if (!hasRole.ok) {
    log(`    impossible d interroger pg_roles : ${hasRole.out.slice(0, 160)}`)
    return false
  }
  if (hasRole.out.trim() !== '1') {
    const c = q(`CREATE ROLE "${user}" LOGIN SUPERUSER`)
    log(c.ok ? `    role "${user}" cree` : `    creation du role "${user}" refusee : ${c.out.slice(0, 160)}`)
  }
  const hasDb = q(`SELECT 1 FROM pg_database WHERE datname = ${lit}`)
  if (hasDb.ok && hasDb.out.trim() !== '1') {
    const c = q(`CREATE DATABASE "${user}" OWNER "${user}"`)
    log(c.ok ? `    base "${user}" creee` : `    creation de la base "${user}" refusee : ${c.out.slice(0, 160)}`)
  }
  return true
}

function pgUp(log) {
  if (!existsSync(`${PG_BINDIR}/postgres`)) {
    return { ok: false, reason: `PostgreSQL ${PG_VERSION} absent de ${PG_BINDIR}`, remedy: 'bash infra/bootstrap/20-postgres18.sh' }
  }
  const dirs = pgSocketDirs()
  for (const d of dirs) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true })
      sh('chown', ['postgres:postgres', d])
      sh('chmod', ['0775', d])
      log(`    repertoire de socket cree : ${d}`)
    }
  }

  let state = pgClusterState()
  if (state === null) {
    if (!have('pg_createcluster')) {
      return { ok: false, reason: `aucun cluster ${PG_VERSION}/${PG_CLUSTER} et pg_createcluster absent`, remedy: 'bash infra/bootstrap/20-postgres18.sh' }
    }
    // Créer le cluster n'est PAS installer : les binaires sont déjà là, c'est
    // l'initdb que l'apt de bootstrap aurait fait. Sans ça, un conteneur neuf
    // resterait bloqué avec des binaires et aucun serveur.
    log(`    aucun cluster ${PG_VERSION}/${PG_CLUSTER} — pg_createcluster`)
    const c = sh('pg_createcluster', [PG_VERSION, PG_CLUSTER])
    if (!c.ok) return { ok: false, reason: `pg_createcluster a echoue : ${c.out.slice(0, 200)}`, remedy: 'bash infra/bootstrap/20-postgres18.sh' }
    state = 'down'
  }

  // `-o` n'est passé que pour servir PGHOST en plus du répertoire par défaut ;
  // on ne réécrit jamais postgresql.conf, pour ne pas laisser derrière soi une
  // configuration système que personne n'a demandée.
  const pgctl = ['--', '-o', `-c unix_socket_directories=${dirs.join(',')}`]
  if (state === 'online') {
    const socketOk = dirs.every((d) => existsSync(`${d}/.s.PGSQL.${PG_PORT}`))
    if (!socketOk) {
      log(`    cluster en ligne mais absent de ${dirs.join(',')} — redemarrage`)
      const r = sh('pg_ctlcluster', [PG_VERSION, PG_CLUSTER, 'restart', ...pgctl])
      if (!r.ok) return { ok: false, reason: `restart refuse : ${r.out.slice(0, 200)}` }
    }
  } else {
    log(`    demarrage du cluster ${PG_VERSION}/${PG_CLUSTER}`)
    const r = sh('pg_ctlcluster', [PG_VERSION, PG_CLUSTER, 'start', ...pgctl])
    // Code 2 = « déjà démarré » chez Debian : une course, pas une erreur.
    if (!r.ok && pgClusterState() !== 'online') {
      return { ok: false, reason: `demarrage refuse : ${r.out.slice(0, 200)}`, remedy: 'cat /var/log/postgresql/postgresql-18-main.log' }
    }
  }

  const t0 = Date.now()
  while (Date.now() - t0 < 30000 && !sh('pg_isready', ['-q', '-h', dirs[0], '-p', String(PG_PORT)]).ok) sleep(400)
  pgEnsureRole(log)
  return { ok: true }
}

function pgDown(log) {
  const state = pgClusterState()
  if (state !== 'online') return { ok: true, detail: `cluster ${PG_VERSION}/${PG_CLUSTER} deja ${state ?? 'inexistant'}` }
  let r = sh('pg_ctlcluster', [PG_VERSION, PG_CLUSTER, 'stop', '--', '-m', 'fast'])
  if (!r.ok) r = sh('pg_ctlcluster', [PG_VERSION, PG_CLUSTER, 'stop', '--force'])
  if (!r.ok) return { ok: false, reason: `arret refuse : ${r.out.slice(0, 200)}` }
  return { ok: true, detail: 'cluster arrete' }
}

// ── Garage (S3) ─────────────────────────────────────────────────────────────

function garageEnsureBinary(log) {
  if (existsSync(GARAGE_BIN)) return { ok: true }
  // `.bench/` est gitignoré : au premier boot d'un conteneur neuf, le binaire
  // n'existe pas. On rappelle le script de bootstrap — lui seul vérifie
  // l'empreinte TOFU du verrou — plutôt que de retélécharger à côté.
  log('    binaire garage absent — infra/bootstrap/30-objectstore.sh')
  const r = sh('bash', [`${R}/infra/bootstrap/30-objectstore.sh`], { cwd: R })
  if (!existsSync(GARAGE_BIN))
    return { ok: false, reason: `binaire garage introuvable : ${r.out.slice(0, 200)}`, remedy: 'bash infra/bootstrap/30-objectstore.sh' }
  return { ok: true }
}

function garageEnsureConfig(log) {
  if (existsSync(GARAGE_CFG)) return { ok: true }
  mkdirSync(`${GARAGE_DIR}/meta`, { recursive: true })
  mkdirSync(`${GARAGE_DIR}/data`, { recursive: true })
  // Secrets tirés à chaque (re)fabrication : ils n'ont pas à être stables entre
  // deux conteneurs, et un secret en dur dans le dépôt serait un secret public.
  writeFileSync(
    GARAGE_CFG,
    [
      `metadata_dir = "${GARAGE_DIR}/meta"`,
      `data_dir = "${GARAGE_DIR}/data"`,
      `db_engine = "sqlite"`,
      `replication_factor = 1`,
      ``,
      `rpc_bind_addr = "127.0.0.1:3901"`,
      `rpc_public_addr = "127.0.0.1:3901"`,
      `rpc_secret = "${randomBytes(32).toString('hex')}"`,
      ``,
      `[s3_api]`,
      `s3_region = "garage"`,
      `api_bind_addr = "${S3_HOST}:${S3_PORT}"`,
      `root_domain = ".s3.garage.localhost"`,
      ``,
      `[admin]`,
      `api_bind_addr = "127.0.0.1:3903"`,
      `admin_token = "${randomBytes(32).toString('hex')}"`,
      ``,
    ].join('\n')
  )
  log(`    configuration garage fabriquee : ${GARAGE_CFG}`)
  return { ok: true }
}

const garageCli = (...args) => sh(GARAGE_BIN, ['-c', GARAGE_CFG, ...args])

/**
 * Un Garage sans layout répond sur le port (la sonde serait verte) mais renvoie
 * une erreur sur CHAQUE opération S3. Le déclarer « up » serait exactement le
 * PASS affaibli que le socle interdit : on provisionne, ou on échoue en le
 * disant.
 */
function garageProvision(log) {
  const show = garageCli('layout', 'show')
  const version = Number(show.out.match(/layout version:\s*(\d+)/i)?.[1] ?? -1)
  if (version === 0 || /No nodes currently have a role/i.test(show.out)) {
    const id = garageCli('node', 'id', '-q').out.split('@')[0].trim()
    if (!id) return { ok: false, reason: `identifiant de noeud garage illisible : ${show.out.slice(0, 160)}` }
    log(`    layout vide — attribution du role au noeud ${id.slice(0, 16)}`)
    const a = garageCli('layout', 'assign', '-z', 'dc1', '-c', '10G', id)
    if (!a.ok) return { ok: false, reason: `layout assign a echoue : ${a.out.slice(0, 200)}` }
    const ap = garageCli('layout', 'apply', '--version', '1')
    if (!ap.ok) return { ok: false, reason: `layout apply a echoue : ${ap.out.slice(0, 200)}` }
  }

  // Clé et seau : le layout suffit à rendre Garage fonctionnel, ceux-ci rendent
  // la capacité UTILISABLE par une tâche. Un échec ici ne dément pas la sonde,
  // il est donc signalé et non fatal.
  const keys = garageCli('key', 'list')
  if (keys.ok && !keys.out.includes('bench-key')) {
    const c = garageCli('key', 'create', 'bench-key')
    if (c.ok) {
      writeFileSync(`${GARAGE_DIR}/credentials.txt`, `${c.out}\n`, { mode: 0o600 })
      log(`    cle bench-key creee (${GARAGE_DIR}/credentials.txt)`)
    } else log(`    ATTENTION cle bench-key non creee : ${c.out.slice(0, 160)}`)
  }
  const buckets = garageCli('bucket', 'list')
  if (buckets.ok && !/\bbench\b/.test(buckets.out)) {
    const c = garageCli('bucket', 'create', 'bench')
    if (c.ok) {
      garageCli('bucket', 'allow', '--read', '--write', '--owner', 'bench', '--key', 'bench-key')
      log('    seau bench cree et autorise pour bench-key')
    } else log(`    ATTENTION seau bench non cree : ${c.out.slice(0, 160)}`)
  }
  return { ok: true }
}

function garageUp(log) {
  const b = garageEnsureBinary(log)
  if (!b.ok) return b
  const c = garageEnsureConfig(log)
  if (!c.ok) return c
  mkdirSync(RUN, { recursive: true })
  const { pid, logFile } = spawnDetached('garage', GARAGE_BIN, ['-c', GARAGE_CFG, 'server'])
  log(`    garage lance (pid ${pid}, journal ${logFile})`)
  return { ok: true }
}

const garagePids = () => {
  const p = readPid('garage')
  const found = pidsMatching(GARAGE_BIN, GARAGE_CFG, 'server')
  return [...new Set([...(p ? [p] : []), ...found])]
}

// ── Temporal ────────────────────────────────────────────────────────────────

function temporalEnsureBinary(log) {
  if (existsSync(TEMPORAL_BIN)) return { ok: true }
  log('    binaire temporal absent — infra/bootstrap/40-temporal.sh')
  const r = sh('bash', [`${R}/infra/bootstrap/40-temporal.sh`], { cwd: R })
  if (!existsSync(TEMPORAL_BIN))
    return { ok: false, reason: `binaire temporal introuvable : ${r.out.slice(0, 200)}`, remedy: 'bash infra/bootstrap/40-temporal.sh' }
  return { ok: true }
}

function temporalUp(log) {
  const b = temporalEnsureBinary(log)
  if (!b.ok) return b
  mkdirSync(RUN, { recursive: true })
  // `--headless` : l'interface web n'est sondée par personne et occuperait 8233
  // sans qu'aucune capacité n'en dépende.
  const { pid, logFile } = spawnDetached('temporal', TEMPORAL_BIN, [
    'server',
    'start-dev',
    '--ip',
    TEMPORAL_HOST,
    '--port',
    String(TEMPORAL_PORT),
    '--headless',
    '--db-filename',
    TEMPORAL_DB,
  ])
  log(`    temporal lance (pid ${pid}, journal ${logFile})`)
  return { ok: true }
}

const temporalPids = () => {
  const p = readPid('temporal')
  const found = pidsMatching(TEMPORAL_BIN, 'start-dev', TEMPORAL_DB)
  return [...new Set([...(p ? [p] : []), ...found])]
}

// ── Table des services ──────────────────────────────────────────────────────

// `pidName` est le nom du couple journal/pidfile sous BENCH_HOME/run : il
// nomme le PROGRAMME (garage), la clef nomme la CAPACITE (s3). Les confondre
// donnerait un journal `s3.log` qu'aucun lecteur de `ps` ne relierait au
// binaire qu'il doit chercher.
const IMPL = {
  postgres18: { up: pgUp, downFn: pgDown, timeout: 60000 },
  s3: { up: garageUp, pids: garagePids, pidName: 'garage', timeout: 60000 },
  temporal: { up: temporalUp, pids: temporalPids, pidName: 'temporal', timeout: 120000 },
}

// ── Commandes ───────────────────────────────────────────────────────────────

/** N'écrit RIEN : ni fichier de preuve, ni pidfile, ni journal. */
export function status() {
  const rows = SERVICES.map((name) => ({ name, label: LABEL[name], ...probe(name) }))
  return { rows, allUp: rows.every((r) => r.present) }
}

export function up(log = () => {}) {
  const rows = []
  for (const name of SERVICES) {
    const already = probe(name)
    // IDEMPOTENCE : la sonde décide, pas un pidfile. C'est ce qui permet
    // d'adopter sans le dupliquer un serveur lancé hors de `svc` — le cas qui
    // se présente aujourd'hui dans ce conteneur.
    if (already.present) {
      log(`  ${name} : deja en marche`)
      rows.push({ name, label: LABEL[name], action: 'deja', present: true, detail: already.detail })
      continue
    }
    log(`  ${name} : ${already.reason}`)
    const started = IMPL[name].up(log)
    if (!started.ok) {
      log(`    ECHEC : ${started.reason}`)
      rows.push({ name, label: LABEL[name], action: 'echec', present: false, reason: started.reason, remedy: started.remedy })
      continue
    }
    const final = waitProbe(name, IMPL[name].timeout, log)
    // Provisionnement APRÈS que le port réponde : la CLI garage parle à
    // l'admin API du serveur qu'on vient de lancer.
    if (final.present && name === 's3') {
      const p = garageProvision(log)
      if (!p.ok) {
        rows.push({ name, label: LABEL[name], action: 'echec', present: false, reason: p.reason })
        continue
      }
    }
    rows.push({
      name,
      label: LABEL[name],
      action: final.present ? 'demarre' : 'echec',
      present: final.present,
      detail: final.detail,
      reason: final.reason,
    })
  }
  return { rows, ok: rows.every((r) => r.present) }
}

export function down(log = () => {}) {
  const rows = []
  // Ordre inverse du démarrage : rien n'en dépend ici, mais l'asymétrie serait
  // un piège le jour où une dépendance apparaît.
  for (const name of [...SERVICES].reverse()) {
    const impl = IMPL[name]
    if (impl.downFn) {
      const r = impl.downFn(log)
      log(`  ${name} : ${r.ok ? (r.detail ?? 'arrete') : `ECHEC ${r.reason}`}`)
      const after = waitProbeGone(name, 20000, log)
      rows.push({ name, label: LABEL[name], stopped: !after.present, detail: r.detail, reason: r.reason })
      continue
    }
    const pids = impl.pids()
    if (!pids.length) {
      log(`  ${name} : aucun processus a arreter`)
      rows.push({ name, label: LABEL[name], stopped: !probe(name).present, detail: 'aucun processus' })
      continue
    }
    log(`  ${name} : arret des pid ${pids.join(', ')}`)
    stopPids(pids, log)
    rmSync(`${RUN}/${impl.pidName}.pid`, { force: true })
    const after = waitProbeGone(name, 20000, log)
    rows.push({ name, label: LABEL[name], stopped: !after.present, detail: `pid ${pids.join(', ')} arretes` })
  }
  rows.reverse()
  return { rows, ok: rows.every((r) => r.stopped) }
}

// ── Rendu ───────────────────────────────────────────────────────────────────

export function renderStatus(st) {
  const L = [`SERVICES   BENCH_HOME ${BENCH_HOME}`, '']
  for (const r of st.rows) L.push(`  ${r.present ? 'OK ' : 'ABS'}  ${r.label.padEnd(24)} ${r.present ? r.detail : r.reason}`)
  L.push('')
  L.push(
    st.allUp
      ? 'les 3 services repondent a leur sonde.'
      : 'service(s) absent(s) — `node tools/bench svc up` pour les (re)demarrer.'
  )
  return L.join('\n')
}

export function renderUp(res) {
  const L = ['', `SVC UP — ${res.ok ? 'les 3 services repondent' : 'INCOMPLET'}`, '']
  for (const r of res.rows) {
    const mark = r.action === 'deja' ? 'DEJA' : r.action === 'demarre' ? 'UP  ' : 'ECHEC'
    L.push(`  ${mark} ${r.label.padEnd(24)} ${r.present ? r.detail : r.reason}`)
    if (r.remedy) L.push(`        remede : ${r.remedy}`)
  }
  return L.join('\n')
}

export function renderDown(res) {
  const L = ['', `SVC DOWN — ${res.ok ? 'les 3 services sont arretes' : 'INCOMPLET'}`, '']
  for (const r of res.rows)
    L.push(`  ${r.stopped ? 'OFF ' : 'VIVANT'} ${r.label.padEnd(24)} ${r.detail ?? r.reason ?? ''}`)
  return L.join('\n')
}
