// ─────────────────────────────────────────────────────────────────────────────
// fixtures — L'EMPREINTE DE L'ARBRE SUR LEQUEL UNE PREUVE A ÉTÉ OBTENUE.
//
// §G l.135 : le rapport inclut « l'empreinte des fixtures ». §T01 l.165 : « une
// fixture modifiée après exécution invalide la preuve ». Les deux phrases ne
// demandent pas la même chose, et c'est tout le fichier :
//
//   • l.135 demande d'INSCRIRE une empreinte — un nombre au rapport ;
//   • l.165 demande de la CONFRONTER — deux lectures, avant et après, et un
//     refus si elles diffèrent.
//
// Une empreinte calculée une seule fois, à la fin du run, satisfait la première
// et trahit la seconde : une fixture modifiée pendant l'exécution serait
// re-hachée dans son état final et paraîtrait intacte. `verify-task.mjs`
// appelle donc `fixtureDigest()` AVANT la chaîne et APRÈS, et inscrit au
// rapport celle d'AVANT — celle de l'arbre que les assertions ont réellement
// lu.
//
// POURQUOI `git ls-files` ET NON UN PARCOURS DE RÉPERTOIRES.
//
// Le périmètre doit être exactement « ce que le dépôt considère comme du
// contenu ». Un parcours naïf empreinterait `node_modules/`, `.venv/`,
// `__pycache__/` et surtout `verification/results/` — ce dernier étant écrit
// par le vérificateur lui-même pendant qu'il mesure, ce qui rendrait TOUTE
// preuve auto-invalidée. Réimplémenter la liste des exclusions serait une
// deuxième source de vérité à côté de `.gitignore` ; `git ls-files --cached
// --others --exclude-standard` EST cette liste, en un seul sous-processus,
// et `.gitignore` est déjà une composante globale d'`input_digest` : l'élargir
// est un affaiblissement visible au diff, jamais silencieux.
//
// Le contenu est lu dans l'ARBRE DE TRAVAIL, pas dans l'objet git. C'est
// délibéré et c'est l'inverse de `git.mjs`, pour une raison précise : l'objet
// git ne bouge pas quand un test réécrit un fichier pendant qu'il tourne, donc
// il ne peut pas détecter ce que l.165 demande de détecter. Les deux lectures
// coexistent, chacune pour ce qu'elle sait voir — `git.mjs` pour le gel des
// racines de référence (contenu committé), ce module pour la mutation en vol.
//
// Un fichier listé mais illisible vaut ABSENT, jamais « inchangé » : une
// suppression pendant l'exécution est exactement le genre de mouvement que
// l.165 vise.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gitOrNull, repoRoot, ABSENT } from './git.mjs'
import { canonical, sha256 } from './input-digest.mjs'

const R = repoRoot()

/** Le périmètre demandé, normalisé : dédoublonné, trié, sans entrée vide. */
export function normalizeScope(paths) {
  const list = (paths ?? []).filter((p) => typeof p === 'string' && p.trim() !== '')
  return [...new Set(list.map((p) => p.replace(/^\.\//, '').replace(/\/+$/, '')))].sort()
}

/**
 * Les fichiers de contenu sous `paths` : suivis (`--cached`) plus non suivis
 * non ignorés (`--others --exclude-standard`). Rend `null` si git ne répond
 * pas — l'appelant doit traiter ce cas comme une absence d'observation, pas
 * comme un arbre vide (un arbre vide serait une empreinte constante, donc
 * exactement la mutation M4(c) que le registre des mutants interdit).
 */
export function scopeFiles(paths) {
  const scope = normalizeScope(paths)
  if (scope.length === 0) return []
  const out = gitOrNull(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...scope])
  if (out === null) return null
  return [...new Set(out.split('\0').filter((f) => f !== ''))].sort()
}

/**
 * Empreinte SHA-256 de l'arbre de travail restreint à `paths`.
 *
 * §E l.82 : « les empreintes utilisent SHA-256 sur des octets canoniques
 * documentés ; objets JSON triés récursivement par clé ». La sérialisation
 * canonique vient d'`input-digest.mjs`, pas d'un `JSON.stringify` local : deux
 * conventions de canonicité dans le même vérificateur seraient deux empreintes
 * incomparables.
 */
export function fixtureDigest(paths) {
  const scope = normalizeScope(paths)
  const files = scopeFiles(scope)
  if (files === null) {
    return { schema: 'bench.fixtures/1', scope, digest: null, count: 0, files: {}, unreadable: ['<git ls-files indisponible>'] }
  }
  const map = {}
  const unreadable = []
  for (const f of files) {
    try {
      map[f] = createHash('sha256').update(readFileSync(`${R}/${f}`)).digest('hex')
    } catch {
      map[f] = ABSENT
      unreadable.push(f)
    }
  }
  return {
    schema: 'bench.fixtures/1',
    scope,
    digest: sha256(canonical({ schema: 'bench.fixtures/1', scope, files: map })),
    count: files.length,
    files: map,
    unreadable,
  }
}

/** Ce qui a bougé entre deux empreintes — pour que le refus NOMME le fichier. */
export function fixtureDelta(before, after) {
  const a = before?.files ?? {}
  const b = after?.files ?? {}
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const modified = []
  const added = []
  const removed = []
  for (const k of keys) {
    if (!(k in a)) added.push(k)
    else if (!(k in b)) removed.push(k)
    else if (a[k] !== b[k]) modified.push(k)
  }
  return { modified, added, removed, moved: [...modified, ...added, ...removed] }
}
