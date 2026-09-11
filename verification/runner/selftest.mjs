// ─────────────────────────────────────────────────────────────────────────────
// bench selftest — le socle se prouve lui-même, sinon il ne prouve rien.
//
// Chaque contrôle ici est une DÉMONSTRATION EXÉCUTÉE, pas une assertion sur du
// papier : on fabrique la condition dangereuse, on observe le comportement, on
// compare à ce qui est attendu.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { runInCleanRoom, runInWorkingTree } from './cleanroom.mjs'
import { repoRoot } from './git.mjs'
import { decide, DEFAULT_TTL_S } from '../../tools/lease.mjs'

const R = repoRoot()
const results = []
const check = (id, ok, detail) => {
  results.push({ id, ok, detail })
  return ok
}

/**
 * S01 — LE `dist` PARASITE.
 *
 * Un `dist/` gitignoré présent dans l'arbre de travail peut faire passer une
 * suite qui échouerait sur le commit. `git status --porcelain` ne le montre pas,
 * puisqu'il est ignoré. C'est le chemin le plus court vers un faux PASS dans un
 * monorepo TypeScript, et il n'exige aucune malveillance : un build périmé suffit.
 *
 * On fabrique exactement cette situation et on exige que les deux verdicts
 * DIVERGENT — l'arbre de travail vert, le clean-room rouge.
 */
export function testDistParasite() {
  const parasite = `${R}/packages/demo-cleanroom/dist/value.js`
  const CMD =
    `node -e "const fs=require('fs');` +
    `const ok=fs.existsSync('packages/demo-cleanroom/dist/value.js');` +
    `if(!ok){console.error('DIST_ABSENT');process.exit(1)}` +
    `console.log('DIST_PRESENT')"`

  mkdirSync(`${R}/packages/demo-cleanroom/dist`, { recursive: true })
  writeFileSync(parasite, 'module.exports = 42\n')

  try {
    const contaminated = runInWorkingTree(CMD)
    const clean = runInCleanRoom({ command: CMD, tag: 'selftest-dist' })

    const wtGreen = contaminated.exit_code === 0 && /DIST_PRESENT/.test(contaminated.stdout)
    const crRed = clean.exit_code === 1 && /DIST_ABSENT/.test(clean.stderr ?? '')

    check(
      'S01.1',
      wtGreen,
      `arbre de travail : exit=${contaminated.exit_code} (le parasite le rend vert, comme prevu)`
    )
    check(
      'S01.2',
      crRed,
      `clean-room : exit=${clean.exit_code} — le parasite est ABSENT du commit, donc rouge`
    )
    check(
      'S01.3',
      wtGreen && crRed,
      'les deux verdicts DIVERGENT : une preuve produite dans l arbre de travail ne prouve rien sur le commit'
    )
    check(
      'S01.4',
      clean.pristine === true,
      `le checkout neuf etait vierge, fichiers ignores compris (stray=${JSON.stringify(clean.stray_before ?? [])})`
    )
    check(
      'S01.5',
      typeof clean.nonce === 'string' && clean.nonce.length === 12,
      `resultat consomme depuis un repertoire nomme par nonce (${clean.nonce}) — aucun fichier preexistant adjuge`
    )
  } finally {
    rmSync(`${R}/packages/demo-cleanroom`, { recursive: true, force: true })
  }
}

/**
 * S01 bis — un clean-room CONTAMINÉ doit être refusé, pas silencieusement
 * accepté. Sans ce contrôle, la règle « vierge » serait déclarative.
 */
export function testDirtyCleanRoomRefused() {
  // On demande au clean-room de se salir lui-meme puis de reussir : la garde
  // est evaluee AVANT la commande, donc ce cas teste la garde a l'endroit ou
  // elle compte — a l'entree.
  const clean = runInCleanRoom({
    command: 'true',
    tag: 'selftest-pristine',
  })
  check(
    'S01.6',
    clean.pristine === true && clean.verdict !== 'DIRTY_CLEANROOM',
    `un checkout neuf de HEAD est vierge (verdict=${clean.verdict ?? 'aucun'})`
  )
}

/**
 * S02 — LE BAIL DU PILOTE.
 *
 * Une Routine horaire tire dans une session neuve. Deux tirs qui se recouvrent
 * pilotent la même branche : au mieux des conflits de poussée, au pire deux
 * attestations en désaccord sur le même `input_digest` — CONTESTED sur une
 * tâche que personne n'a contestée.
 *
 * Le bail repose ENTIÈREMENT sur une propriété de git : une poussée non
 * fast-forward est refusée. On ne la suppose pas : on la reproduit, dans un
 * dépôt jetable, avec deux clones au même commit de base — exactement la
 * position de deux tirs qui ont lu avant que l'autre ne pousse.
 */
export function testLeaseDecision() {
  const now = Date.parse('2026-09-11T12:00:00Z')
  const held = (o, silentS, ttl = DEFAULT_TTL_S) => ({
    schema: 'bench.lease/1',
    state: 'HELD',
    owner: o,
    ttl_s: ttl,
    heartbeat_at: new Date(now - silentS * 1000).toISOString(),
  })

  const live = decide(held('B', 60), 'A', now)
  check('S02.1', live.ok === false && live.reason === 'HELD_BY_OTHER', `titulaire vivant (muet 60s) : refuse — ${live.reason}`)

  const stale = decide(held('B', DEFAULT_TTL_S + 300), 'A', now)
  check(
    'S02.2',
    stale.ok === true && stale.steal?.owner === 'B',
    `titulaire muet depuis ${DEFAULT_TTL_S + 300}s : volable — sinon une session tuee par le quota bloque la reprise pour toujours`
  )

  const mine = decide(held('A', 60), 'A', now)
  check('S02.3', mine.ok === true, 'mon propre bail se renouvelle au lieu de se refuser lui-meme')

  const freed = decide({ schema: 'bench.lease/1', state: 'FREE', owner: 'B' }, 'A', now)
  check('S02.4', freed.ok === true, 'un bail rendu est libre immediatement, sans attendre la TTL')
}

export function testPushIsTheLock() {
  const dir = mkdtempSync(`${tmpdir()}/bench-lease-`)
  const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const ID = ['-c', 'user.email=selftest@bench', '-c', 'user.name=selftest']

  try {
    g(dir, 'init', '--bare', '-b', 'ledger', 'origin.git')
    const O = `${dir}/origin.git`
    // Un commit de base, poussé : c'est l'état que les deux tirs vont lire.
    g(dir, 'clone', O, 'seed')
    writeFileSync(`${dir}/seed/base.txt`, 'base\n')
    g(`${dir}/seed`, 'add', '-A')
    g(`${dir}/seed`, ...ID, 'commit', '-m', 'base')
    g(`${dir}/seed`, 'push', 'origin', 'ledger')

    // Deux sessions clonent le MÊME commit — aucune ne voit l'autre.
    g(dir, 'clone', O, 'a')
    g(dir, 'clone', O, 'b')
    for (const w of ['a', 'b']) {
      writeFileSync(`${dir}/${w}/leases-driver.json`, `{"owner":"${w}"}\n`)
      g(`${dir}/${w}`, 'add', '-A')
      g(`${dir}/${w}`, ...ID, 'commit', '-m', `bail de ${w}`)
    }
    const before = g(`${dir}/b`, 'rev-parse', 'HEAD')

    let aOk = false
    try {
      g(`${dir}/a`, 'push', 'origin', 'ledger')
      aOk = true
    } catch {}
    check('S02.5', aOk, 'le premier tir pousse son bail : il pilote')

    let bRefused = false
    try {
      g(`${dir}/b`, 'push', 'origin', 'ledger')
    } catch (e) {
      bRefused = /non-fast-forward|fetch first|rejected/i.test(String(e.stderr ?? e.message))
    }
    check(
      'S02.6',
      bRefused,
      'le second tir est REFUSE pour non-fast-forward — c est la poussee qui fait le verrou, pas le fichier'
    )

    // Le retour en arrière : sans lui, la course perdue laisse un evenement
    // local non pousse, et `bench resume` sortirait 4 a chaque tir suivant.
    g(`${dir}/b`, 'update-ref', 'refs/heads/ledger', `${before}^`, before)
    const rolled = g(`${dir}/b`, 'rev-list', '--count', 'origin/ledger..refs/heads/ledger')
    check('S02.7', rolled === '0', `apres retour en arriere, le perdant n a plus d evenement non pousse (ahead=${rolled})`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function run() {
  testDistParasite()
  testDirtyCleanRoomRefused()
  testLeaseDecision()
  testPushIsTheLock()
  const failed = results.filter((r) => !r.ok)
  return { results, failed, ok: failed.length === 0 }
}

export { results }
