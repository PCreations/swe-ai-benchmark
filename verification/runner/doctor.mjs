// ─────────────────────────────────────────────────────────────────────────────
// bench doctor — sondes de capacité.
//
// DEUX RÈGLES, ET ELLES SONT LA RAISON D'ÊTRE DU FICHIER :
//
// 1. UNE SONDE EXÉCUTE LA CAPACITÉ. Elle ne teste jamais la présence d'un
//    binaire ni l'accessibilité en écriture d'un fichier. Mesuré sur cet hôte :
//    /sys/fs/cgroup/unified n'expose que `hugetlb`, donc `memory.max` n'y existe
//    pas ; une sonde qui se contenterait de stat-er un chemin déclarerait la
//    limite mémoire disponible alors qu'elle serait un no-op silencieux — et
//    T19.A5 (« dépassement mémoire terminé avec raison observable ») passerait
//    pour la mauvaise raison. La sonde lance donc un vrai consommateur et lit
//    memory.failcnt AVANT de détruire le conteneur.
//
// 2. AUCUN CACHE ENTRE DEUX BOOTS. L'évidence est indexée sur
//    /proc/sys/kernel/random/boot_id. Il n'existe pas de `--fast`.
//    Une attestation produite sur un hôte ne doit jamais être lue comme valide
//    sur un autre.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { repoRoot } from './git.mjs'

const R = repoRoot()

const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, ...opts }).trim()

const trySh = (cmd, opts = {}) => {
  try {
    return { ok: true, out: sh(cmd, opts) }
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? ''), code: e.status }
  }
}

export function bootId() {
  try {
    return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
  } catch {
    return 'unknown'
  }
}

const ABSENT = (reason, remedy) => ({ present: false, reason, remedy })
const PRESENT = (detail) => ({ present: true, detail })

// ── Sondes ──────────────────────────────────────────────────────────────────

const probes = {
  node22() {
    const v = process.versions.node
    const major = Number(v.split('.')[0])
    return major >= 22 && major < 23
      ? PRESENT(`node ${v}`)
      : ABSENT(`node ${v} hors de la plage >=22 <23`, 'installer Node 22 LTS (infra/bootstrap/10-runtimes.sh)')
  },

  python312() {
    for (const c of ['python3.12 -V', 'uv run --python 3.12 python -V']) {
      const r = trySh(c)
      if (r.ok && /3\.12\./.test(r.out)) return PRESENT(r.out)
    }
    const sys = trySh('python3 -V')
    return ABSENT(
      `python 3.12 introuvable (systeme : ${sys.ok ? sys.out : 'aucun'})`,
      'uv python install 3.12 (infra/bootstrap/10-runtimes.sh)'
    )
  },

  // Le piège le plus dangereux de cet hôte : PostgreSQL 16.13 est déjà installé.
  // S'en servir rendrait T09/T12/T15/T16 verts pour la mauvaise raison — la
  // fermeture artificielle que §K interdit. La sonde interroge le serveur
  // DEPUIS SA PROPRE SESSION et exige >= 180000, pas un numéro de version lu
  // sur un binaire.
  postgres18() {
    const r = trySh('psql -tAc "SHOW server_version_num" 2>/dev/null')
    if (!r.ok || !r.out) {
      const bin = trySh('ls -d /usr/lib/postgresql/*/bin 2>/dev/null')
      return ABSENT(
        `aucun serveur PostgreSQL joignable${bin.ok ? ` (binaires presents : ${bin.out.replace(/\n/g, ' ')})` : ''}`,
        'infra/bootstrap/20-postgres18.sh (pgdg) puis bench svc up'
      )
    }
    const num = Number(r.out)
    return num >= 180000
      ? PRESENT(`server_version_num=${num}`)
      : ABSENT(
          `server_version_num=${num} < 180000 — le cahier §C exige PostgreSQL 18`,
          'infra/bootstrap/20-postgres18.sh ; ne JAMAIS se rabattre sur le 16 deja installe'
        )
  },

  s3() {
    const ep = process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000'
    const r = trySh(`curl -sS -o /dev/null -w '%{http_code}' --max-time 3 ${ep} 2>/dev/null`)
    return r.ok && r.out !== '000'
      ? PRESENT(`${ep} repond ${r.out}`)
      : ABSENT(`aucun service S3 sur ${ep}`, 'infra/bootstrap/30-objectstore.sh (Garage) puis bench svc up')
  },

  temporal() {
    const addr = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233'
    const r = trySh(`timeout 3 bash -c '</dev/tcp/${addr.replace(':', '/')}' 2>/dev/null && echo open`)
    return r.ok && r.out === 'open'
      ? PRESENT(`${addr} ouvert`)
      : ABSENT(`aucun serveur Temporal sur ${addr}`, 'infra/bootstrap/40-temporal.sh puis bench svc up')
  },

  // Le serveur de test à saut de temps doit être PRÉ-TÉLÉCHARGÉ : le laisser se
  // télécharger paresseusement ferait passer le test de replay de T24 pour la
  // mauvaise raison, et perdrait le cache au recyclage du conteneur.
  'temporal-timeskip'() {
    const p = process.env.TEMPORAL_TEST_SERVER ?? `${process.env.BENCH_HOME ?? '/bench'}/bin/temporal-test-server`
    return existsSync(p)
      ? PRESENT(`binaire pre-telecharge : ${p}`)
      : ABSENT(
          'serveur de test a saut de temps absent (un telechargement paresseux invaliderait T24.A2)',
          'infra/bootstrap/40-temporal.sh --with-test-server'
        )
  },

  'containers.runc'() {
    const r = trySh('runc --version')
    if (!r.ok) return ABSENT('runc introuvable', 'apt-get install -y runc')
    const d = `${R}/.bench/probe/runc-${process.pid}`
    try {
      mkdirSync(`${d}/rootfs/bin`, { recursive: true })
      sh(`cp /bin/busybox ${d}/rootfs/bin/ 2>/dev/null || cp /bin/sh ${d}/rootfs/bin/sh`)
      for (const lib of trySh("ldd /bin/sh | grep -o '/[^ ]*\\.so[^ ]*'").out.split('\n').filter(Boolean)) {
        sh(`mkdir -p ${d}/rootfs$(dirname ${lib}) && cp ${lib} ${d}/rootfs${lib} 2>/dev/null || true`)
      }
      sh(`cd ${d} && runc spec`)
      const spec = JSON.parse(readFileSync(`${d}/config.json`, 'utf8'))
      spec.process.terminal = false
      spec.process.args = ['/bin/sh', '-c', 'echo BENCH-RUNC-OK']
      writeFileSync(`${d}/config.json`, JSON.stringify(spec))
      const out = sh(`cd ${d} && runc run probe-${process.pid}`)
      return out.includes('BENCH-RUNC-OK')
        ? PRESENT(`${r.out.split('\n')[0]} — conteneur execute, sentinelle observee`)
        : ABSENT('runc a demarre mais la sentinelle est absente', 'verifier le profil OCI infra/oci/')
    } catch (e) {
      return ABSENT(`runc n'a pas execute de conteneur : ${String(e.message).slice(0, 120)}`, 'verifier runc et les namespaces')
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  },

  'containers.userns'() {
    const r = trySh('unshare --user --map-root-user --net --pid --mount --fork /bin/sh -c "echo BENCH-USERNS-OK"')
    if (r.ok && r.out.includes('BENCH-USERNS-OK')) {
      const max = trySh('cat /proc/sys/user/max_user_namespaces')
      return PRESENT(`namespaces user/net/pid/mount OK${max.ok ? ` (max=${max.out})` : ''}`)
    }
    return ABSENT('unshare --user a echoue', 'activer les user namespaces non privilegies')
  },

  // Sonde la plus importante du fichier : elle EXÉCUTE un consommateur de
  // mémoire réel et vérifie que le noyau l'a bien tué, puis lit failcnt AVANT
  // toute destruction. Trouver le fichier writable ne prouverait rien.
  'containers.cgroup-mem'() {
    const v1 = '/sys/fs/cgroup/memory'
    const v2 = '/sys/fs/cgroup/unified'
    const hasV1 = existsSync(`${v1}/memory.limit_in_bytes`)
    const v2ctl = existsSync(`${v2}/cgroup.controllers`)
      ? readFileSync(`${v2}/cgroup.controllers`, 'utf8').trim()
      : ''
    if (!hasV1 && !v2ctl.includes('memory'))
      return ABSENT(
        `aucun controleur memoire utilisable (cgroup2 n'expose que « ${v2ctl || 'rien'} »)`,
        'demarrer dans le devcontainer (--cgroupns=host) ou activer le controleur memory'
      )

    const name = `bench-probe-${process.pid}`
    const dir = `${v1}/${name}`
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${dir}/memory.limit_in_bytes`, '33554432') // 32 Mio
      // Le consommateur doit REELLEMENT allouer. Une forme qui echoue au
      // demarrage (erreur de syntaxe, binaire absent) produirait un code non nul
      // que l'on pourrait confondre avec une mise a mort par le noyau — la sonde
      // rendrait alors un verdict juste pour la mauvaise raison. On ecrit donc
      // le consommateur dans un fichier, et on exige failcnt > 0 : seul le
      // controleur memoire peut l'incrementer.
      // /sys/fs/cgroup n'accepte pas de fichier ordinaire : le consommateur
      // vit dans .bench/ (non suivi), pas dans le cgroup lui-meme.
      mkdirSync(`${R}/.bench/probe`, { recursive: true })
      const hogPy = `${R}/.bench/probe/hog-${process.pid}.py`
      writeFileSync(
        hogPy,
        'import sys\nb = []\nsys.stderr.write("HOG-START\\n"); sys.stderr.flush()\nwhile True:\n    b.append(bytearray(4 * 1024 * 1024))\n'
      )
      const r = trySh(`bash -c 'echo $$ > ${dir}/cgroup.procs; exec python3 ${hogPy}' 2>&1`, {
        timeout: 20000,
      })
      if (!/HOG-START/.test(r.out ?? ''))
        return ABSENT(
          `le consommateur de memoire n'a pas demarre (code=${r.code}) — sonde non concluante`,
          'verifier python3 dans la sonde containers.cgroup-mem'
        )
      const failcnt = Number(readFileSync(`${dir}/memory.failcnt`, 'utf8').trim())
      const killed = !r.ok && (r.code === 137 || r.code === null || failcnt > 0)
      return killed && failcnt > 0
        ? PRESENT(`driver=cgroupfs-v1 limite 32Mio appliquee (failcnt=${failcnt}, code=${r.code})`)
        : ABSENT(
            `la limite n'a PAS tue le consommateur (failcnt=${failcnt}, code=${r.code}) — limite silencieusement inoperante`,
            'epingler runc au driver cgroupfs v1 (infra/profiles.json)'
          )
    } catch (e) {
      return ABSENT(`sonde memoire impossible : ${String(e.message).slice(0, 100)}`, 'verifier les droits sur /sys/fs/cgroup')
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
        rmSync(`${R}/.bench/probe/hog-${process.pid}.py`, { force: true })
      } catch {}
    }
  },

  'containers.cgroup-pids'() {
    const base = '/sys/fs/cgroup/pids'
    if (!existsSync(base)) return ABSENT('controleur pids absent', 'devcontainer --cgroupns=host')
    const dir = `${base}/bench-probe-${process.pid}`
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${dir}/pids.max`, '16')
      const r = trySh(
        `bash -c 'echo $$ > ${dir}/cgroup.procs; for i in $(seq 1 40); do sleep 5 & done; wait' 2>&1`,
        { timeout: 15000 }
      )
      const events = existsSync(`${dir}/pids.events`) ? readFileSync(`${dir}/pids.events`, 'utf8').trim() : ''
      const hitLimit = /fork|Resource temporarily unavailable|retry/i.test(r.out) || /max (\d+)/.test(events)
      return hitLimit
        ? PRESENT(`pids.max=16 applique (${events.replace(/\n/g, ' ') || 'EAGAIN observe'})`)
        : ABSENT('pids.max n a pas bloque la creation de processus', 'epingler runc au driver cgroupfs v1')
    } catch (e) {
      return ABSENT(`sonde pids impossible : ${String(e.message).slice(0, 100)}`, 'verifier /sys/fs/cgroup/pids')
    } finally {
      try {
        sh(`pkill -f 'sleep 5' 2>/dev/null || true`)
        rmSync(dir, { recursive: true, force: true })
      } catch {}
    }
  },

  'net.netns-loopback'() {
    const r = trySh(
      'unshare --user --map-root-user --net --fork /bin/sh -c "cat /proc/net/dev | grep -c lo"'
    )
    return r.ok && Number(r.out) >= 1
      ? PRESENT('namespace reseau isole, loopback seul')
      : ABSENT('impossible de creer un namespace reseau isole', 'activer les user+net namespaces')
  },

  // Moitié positive de T19.A3 : autoriser explicitement une destination et
  // refuser le reste exige une vraie paire veth et une liste blanche nft.
  'net.veth-egress'() {
    const ip = trySh('command -v ip')
    if (!ip.ok)
      return ABSENT(
        'iproute2 absent (`ip` introuvable) : veth invérifiable, noyau sans /lib/modules',
        'apt-get install -y iproute2 (infra/bootstrap/00-apt-base.sh)'
      )
    const nft = trySh('command -v nft')
    if (!nft.ok) return ABSENT('nftables absent', 'apt-get install -y nftables')
    const r = trySh(
      'unshare --user --map-root-user --net --fork /bin/sh -c "ip link add v0 type veth peer name v1 && ip link show v0 >/dev/null && echo VETH-OK"'
    )
    return r.ok && r.out.includes('VETH-OK')
      ? PRESENT('paire veth creee dans un namespace isole')
      : ABSENT(`creation veth impossible : ${r.out.slice(0, 80)}`, 'noyau sans support veth ou droits insuffisants')
  },

  'fake-provider'() {
    return ABSENT(
      'fournisseur factice pas encore implemente (livrable T17)',
      'implementer packages/gateway (T17)'
    )
  },

  'live-credentials'() {
    return process.env.ANTHROPIC_API_KEY
      ? PRESENT('ANTHROPIC_API_KEY presente')
      : ABSENT(
          'ANTHROPIC_API_KEY absente — LIVE_VALIDATED restera non attestee',
          'fournir la cle et un plafond explicite avant `bench smoke-live`'
        )
  },
}

export function runProbes(only = null) {
  const names = only ?? Object.keys(probes)
  const results = {}
  for (const n of names) {
    if (!probes[n]) {
      results[n] = ABSENT('sonde inconnue', `ajouter une sonde ${n} dans verification/runner/doctor.mjs`)
      continue
    }
    try {
      results[n] = probes[n]()
    } catch (e) {
      results[n] = ABSENT(`sonde en erreur : ${String(e.message).slice(0, 140)}`, 'corriger la sonde')
    }
  }
  return results
}

export function writeEvidence(results) {
  const doc = {
    schema: 'bench.doctor/1',
    boot_id: bootId(),
    machine_id: (() => {
      try {
        return readFileSync('/etc/machine-id', 'utf8').trim()
      } catch {
        return 'unknown'
      }
    })(),
    capabilities: results,
  }
  mkdirSync(`${R}/.bench`, { recursive: true })
  writeFileSync(`${R}/.bench/doctor.json`, JSON.stringify(doc, null, 2))
  return doc
}

export function readEvidence() {
  try {
    const doc = JSON.parse(readFileSync(`${R}/.bench/doctor.json`, 'utf8'))
    // Aucun cache entre deux boots : une preuve de capacite d'un autre boot
    // n'est pas une preuve de capacite.
    return doc.boot_id === bootId() ? doc : null
  } catch {
    return null
  }
}

export { probes }
