// ─────────────────────────────────────────────────────────────────────────────
// Clean-room — AUCUNE vérification probante ne s'exécute dans l'arbre de
// travail de l'agent.
//
// POURQUOI, CONCRÈTEMENT. Dans un monorepo TypeScript, la résolution de modules
// atteint `packages/*/dist`, qui est gitignoré. Un `dist/` périmé — ou fabriqué
// — peut donc faire passer une suite qui échouerait sur un clone propre, et
// `git status --porcelain` ne le montre PAS, puisqu'il est ignoré. Une preuve
// produite dans l'arbre de travail ne prouve donc rien sur le commit.
//
// Trois règles, chacune fermant un chemin distinct vers un faux PASS :
//   1. l'exécution a lieu dans un `git worktree add --detach` neuf à HEAD ;
//   2. le résultat consommé est UNIQUEMENT celui que cette fonction vient de
//      produire, dans un répertoire nommé par nonce — jamais un fichier trouvé
//      sur le disque ;
//   3. l'état ignoré du clean-room est capturé (`--ignored=matching`) et doit
//      être vide hors liste blanche explicite.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { repoRoot, git, headSha } from './git.mjs'

const R = repoRoot()

/** Nonce déterministe pour ce run : pas de Math.random, mais unique par pid+HEAD. */
function nonce(tag) {
  return createHash('sha256').update(`${tag}:${process.pid}:${headSha()}`).digest('hex').slice(0, 12)
}

/**
 * Exécute `command` sur un checkout neuf de `rev`, et rend ce qui a été
 * réellement observé. N'interprète rien : l'adjudication appartient à l'appelant.
 */
export function runInCleanRoom({ rev = 'HEAD', command, tag = 'accept', allowIgnored = [] }) {
  const id = nonce(tag)
  const dir = `${R}/.bench/scratch/${id}`
  const runDir = `${R}/.bench/run/${id}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(runDir, { recursive: true })

  const observed = {
    nonce: id,
    rev: git(['rev-parse', rev]),
    clean_room: true,
    worktree: dir,
    run_dir: runDir,
  }

  try {
    git(['worktree', 'add', '--detach', '--quiet', dir, rev])

    // L'etat du clean-room AVANT execution : il doit etre vierge, fichiers
    // ignores compris. C'est ici qu'un dist/ parasite se verrait.
    const before = execSync('git status --porcelain --ignored=matching', {
      cwd: dir,
      encoding: 'utf8',
    }).trim()
    const strayBefore = before
      .split('\n')
      .filter(Boolean)
      .filter((l) => !allowIgnored.some((a) => l.includes(a)))
    observed.pristine = strayBefore.length === 0
    observed.stray_before = strayBefore

    if (!observed.pristine) {
      observed.verdict = 'DIRTY_CLEANROOM'
      observed.reason = `le checkout neuf n'est pas vierge : ${strayBefore.join(', ')}`
      return observed
    }

    let stdout = '',
      stderr = '',
      code = 0
    try {
      stdout = execSync(command, {
        cwd: dir,
        encoding: 'utf8',
        timeout: 15 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      code = e.status ?? 1
      stdout = String(e.stdout ?? '')
      stderr = String(e.stderr ?? '')
    }

    observed.command = command
    observed.exit_code = code
    observed.stdout = stdout
    observed.stderr = stderr
    observed.stdout_sha256 = createHash('sha256').update(stdout).digest('hex')

    // Le resultat consomme est celui que NOUS venons de produire, dans un
    // repertoire nomme par nonce. Aucun fichier preexistant n'est adjuge.
    writeFileSync(`${runDir}/observed.json`, JSON.stringify(observed, null, 2))
    return observed
  } catch (e) {
    observed.verdict = 'CLEANROOM_FAILED'
    observed.reason = String(e.message).slice(0, 200)
    return observed
  } finally {
    try {
      git(['worktree', 'remove', '--force', dir])
    } catch {
      rmSync(dir, { recursive: true, force: true })
    }
    try {
      git(['worktree', 'prune'])
    } catch {}
  }
}

/**
 * Même commande dans l'arbre de travail de l'agent — UNIQUEMENT pour la
 * démonstration du contraste. Jamais pour attester quoi que ce soit.
 */
export function runInWorkingTree(command) {
  try {
    const stdout = execSync(command, { cwd: R, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { exit_code: 0, stdout, contaminated: true }
  } catch (e) {
    return {
      exit_code: e.status ?? 1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
      contaminated: true,
    }
  }
}

export { repoRoot, existsSync, readFileSync }
