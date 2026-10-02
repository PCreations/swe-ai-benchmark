// ─────────────────────────────────────────────────────────────────────────────
// Primitives git du vérificateur.
//
// RÈGLE CARDINALE : les empreintes sont lues depuis les OBJETS GIT, jamais
// depuis le système de fichiers. Un parcours de fichiers dans un worktree
// sparse où `acceptance/reference` est absent empreinterait l'ensemble vide, ce
// qui rend `T01.A4` (« fixture modifiée après exécution invalide la preuve »)
// auto-satisfaisant. Lire `git rev-parse HEAD:<chemin>` n'a pas ce défaut : le
// chemin existe dans le commit ou il n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'

/** Marqueur d'absence — distinct de toute empreinte, et stable dans le digest. */
export const ABSENT = '(absent)'

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    cwd: opts.cwd ?? repoRoot(),
    stdio: ['ignore', 'pipe', opts.quiet === false ? 'inherit' : 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    // `env` sert a poser GIT_INDEX_FILE : ecrire sur le ledger ne doit jamais
    // passer par l'index du depot, ou une preparation en cours dans l'arbre de
    // travail se retrouverait dans un commit de preuve (voir ledger.mjs).
    ...(opts.env ? { env: opts.env } : {}),
  }).trimEnd()
}

export function gitOrNull(args, opts = {}) {
  try {
    return git(args, opts)
  } catch {
    return null
  }
}

let _root = null
export function repoRoot() {
  if (_root) return _root
  _root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  return _root
}

/**
 * Empreinte d'un chemin DANS un commit : oid du blob (fichier) ou de l'arbre
 * (répertoire). Renvoie ABSENT si le chemin n'existe pas dans ce commit.
 */
export function oidAt(rev, path) {
  return gitOrNull(['rev-parse', `${rev}:${path}`]) ?? ABSENT
}

export function headSha() {
  return git(['rev-parse', 'HEAD'])
}

export function branchName() {
  const name = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return name === 'HEAD' ? branchNameFromDetachedHead() : name
}

/**
 * HEAD détachée — notamment le clean-room de `bench accept`/`bench
 * verify:task`, qui checkout TOUJOURS via `git worktree add --detach` (voir
 * cleanroom.mjs). Ce worktree partage l'object store ET les refs du dépôt
 * principal ; si ce commit est EXACTEMENT la pointe d'une branche de travail
 * (locale, ou à défaut distante sur origin), c'est elle la réponse — jamais
 * une branche de ledger (`*-ledger`, orpheline, sur un historique disjoint :
 * sa pointe ne peut de toute façon jamais coïncider avec un commit de code).
 *
 * Sans ceci, `bench resume` lancé depuis l'intérieur d'un tel clean-room (ce
 * que T42.A1 fait littéralement, pour une vérification « extérieure au
 * candidat ») renvoie la branche littérale `HEAD`, donc un ledger
 * `HEAD-ledger` absent, donc 0 tâche prouvée — alors que rien, côté
 * objets git, n'a changé.
 */
function branchNameFromDetachedHead() {
  const sha = git(['rev-parse', 'HEAD'])
  const refs = (gitOrNull(['for-each-ref', '--points-at', sha, '--format=%(refname)']) ?? '')
    .split('\n')
    .filter(Boolean)
  const stripped = (prefix) =>
    refs.filter((r) => r.startsWith(prefix) && !r.endsWith('-ledger')).map((r) => r.slice(prefix.length))
  const locals = stripped('refs/heads/')
  if (locals.length === 1) return locals[0]
  const remotes = stripped('refs/remotes/origin/').filter((r) => r !== 'HEAD')
  if (locals.length === 0 && remotes.length === 1) return remotes[0]
  throw new Error(
    `HEAD detachee a ${sha.slice(0, 12)} sans branche de travail univoque ` +
      `(locales=${JSON.stringify(locals)} distantes=${JSON.stringify(remotes)}) — ` +
      `clean-room attendu via 'git worktree add --detach <dir> HEAD' depuis une branche unique`
  )
}

/**
 * L'arbre est-il propre ? §G : « tout diff de source non committé interdit une
 * attestation finale ». On inclut les fichiers non suivis : un fichier oublié
 * peut faire passer une suite qui échouerait sur un clone propre.
 */
export function isClean() {
  return git(['status', '--porcelain']) === ''
}

/** La ref locale est-elle poussée (descendante d'origin) ? */
export function pushState(ref) {
  const local = gitOrNull(['rev-parse', ref])
  if (!local) return { exists: false, pushed: false, ahead: null }
  const remote = gitOrNull(['rev-parse', `origin/${ref}`])
  if (!remote) return { exists: true, pushed: false, ahead: null, neverPushed: true }
  const ahead = gitOrNull(['rev-list', '--count', `origin/${ref}..${ref}`])
  return { exists: true, pushed: ahead === '0', ahead: ahead === null ? null : Number(ahead) }
}

export function isAncestor(a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: repoRoot(), stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
