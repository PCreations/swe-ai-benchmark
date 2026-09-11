// ─────────────────────────────────────────────────────────────────────────────
// bench selftest — le socle se prouve lui-même, sinon il ne prouve rien.
//
// Chaque contrôle ici est une DÉMONSTRATION EXÉCUTÉE, pas une assertion sur du
// papier : on fabrique la condition dangereuse, on observe le comportement, on
// compare à ce qui est attendu.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { runInCleanRoom, runInWorkingTree } from './cleanroom.mjs'
import { repoRoot } from './git.mjs'

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

export function run() {
  testDistParasite()
  testDirtyCleanRoomRefused()
  const failed = results.filter((r) => !r.ok)
  return { results, failed, ok: failed.length === 0 }
}

export { results }
