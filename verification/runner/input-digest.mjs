// ─────────────────────────────────────────────────────────────────────────────
// input_digest — l'empreinte qui décide si une attestation est encore valide.
//
// Principe : TOUT CE QUI PEUT CHANGER CE QU'UN TEST AFFIRME, S'IL S'EXÉCUTE, OU
// COMMENT UN MODULE SE RÉSOUT, EST UNE ENTRÉE. C'est pourquoi `jest.config`,
// `tsconfig`, les helpers de test et `.gitignore` figurent dans la partie
// GLOBALE : factoriser un helper de test est une pratique banale, et sans cette
// règle un changement de helper laisserait 44 attestations valides à tort.
//
// Conséquence assumée : modifier le runner lui-même re-périme les 44 tâches.
// C'est voulu — sous un diff qui nomme qui a changé les règles.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { oidAt, ABSENT } from './git.mjs'

/** JSON canonique : objets triés récursivement par clé, ordre des tableaux conservé. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
}

export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Chemins globaux : leur changement re-périme TOUTES les tâches. */
export const GLOBAL_PATHS = [
  'docs/cahier.md',
  'docs/CAHIER_SHA256',
  'docs/FROZEN_ROOTS.json',
  'verification/cases.lock.json',
  'verification/limitations.lock.json',
  'verification/ownership.json',
  'verification/runner',
  'verification/schemas',
  'acceptance/reference',
  'acceptance/helpers',
  'analysis/tests/conftest.py',
  'docs/toolchain.json',
  'infra/profiles.json',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'jest.config.mjs',
  'analysis/pyproject.toml',
  'analysis/uv.lock',
  '.gitignore',
]

export function globalInputs(rev = 'HEAD') {
  const out = {}
  for (const p of GLOBAL_PATHS) out[p] = oidAt(rev, p)
  return out
}

/**
 * Entrées propres à une tâche.
 *
 * LIMITE ASSUMÉE : `sources` couvre les `source_paths` déclarés, PAS la
 * fermeture transitive des imports first-party. Un utilitaire extrait dans
 * `packages/shared/` serait une entrée de T04 sans y figurer. Le champ
 * `closure_resolver` ci-dessous nomme cette limite ; le jour où le résolveur
 * statique arrive, la valeur change et tout se re-périme — visiblement, ce qui
 * est le comportement correct. Le garde-fou UNCLAIMED_PATHS reste le filet
 * fail-closed pour les chemins qu'aucune zone ne revendique.
 */
export function taskInputs(task, rev = 'HEAD') {
  const card = { ...task }
  delete card.status // déclaratif : ne doit jamais peser sur la validité

  const sources = {}
  for (const p of [...(task.source_paths ?? [])].sort()) sources[p] = oidAt(rev, p)

  return {
    task_card: sha256(canonical(card)),
    spec_card: oidAt(rev, `docs/specs/${task.id}.md`),
    acceptance: oidAt(rev, task.acceptance_entry),
    mutants: oidAt(rev, `verification/mutants/${task.id}.json`),
    generator: oidAt(rev, `verification/generators/${task.id}.json`),
    sources,
    closure_resolver: 'source_paths_only/1',
  }
}

export function inputDigest(task, rev = 'HEAD') {
  return sha256(
    canonical({
      schema: 'bench.inputdigest/1',
      global: globalInputs(rev),
      task: taskInputs(task, rev),
    })
  )
}

export { ABSENT }
