// ─────────────────────────────────────────────────────────────────────────────
// Lecture du ledger — la seule source de preuve durable.
//
// Le ledger vit sur une branche ORPHELINE (`<branche>-ledger`) : y committer ne
// change jamais le tree hash des sources, ce qui satisfait littéralement
// l'anti-circularité du §G sans renoncer à la durabilité.
//
// On lit la ref, PAS un worktree : le worktree local est un artefact jetable,
// recréé depuis origin par `bench bootstrap`. Ce qui n'est pas sur la ref
// n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────
import { git, gitOrNull, branchName, pushState } from './git.mjs'

export function ledgerRef() {
  return `${branchName()}-ledger`
}

/** Préfère origin/<ledger> si la ref locale est absente (cas du clone neuf). */
export function resolveLedger() {
  const ref = ledgerRef()
  if (gitOrNull(['rev-parse', '--verify', `refs/heads/${ref}`])) return { ref, scope: 'local' }
  if (gitOrNull(['rev-parse', '--verify', `refs/remotes/origin/${ref}`]))
    return { ref: `origin/${ref}`, scope: 'remote-only' }
  return { ref: null, scope: 'absent' }
}

export function ledgerState() {
  const name = ledgerRef()
  const { ref, scope } = resolveLedger()
  const push = scope === 'local' ? pushState(name) : { exists: scope !== 'absent', pushed: true, ahead: 0 }
  return { name, ref, scope, ...push, sha: ref ? gitOrNull(['rev-parse', '--short', ref]) : null }
}

/** Liste les fichiers d'un répertoire du ledger. */
function lsLedger(ref, dir) {
  const out = gitOrNull(['ls-tree', '-r', '--name-only', ref, '--', dir])
  return out ? out.split('\n').filter(Boolean) : []
}

function readLedger(ref, path) {
  const raw = gitOrNull(['show', `${ref}:${path}`])
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Toutes les attestations par tâche, ordonnées du plus ancien au plus récent
 * selon l'ORDRE DES COMMITS DU LEDGER — pas « une attestation qui a réussi ».
 * Deux attestations en désaccord sur le même input_digest rendent la tâche
 * CONTESTED : le cahier impose des tests de course partout (T09.A2, T12.A2,
 * T16.A2, T26.A1, T40.A4), donc accumuler des verdicts contradictoires est le
 * régime nominal, pas une curiosité.
 */
export function attestationsByTask() {
  const { ref, scope } = resolveLedger()
  const map = new Map()
  if (!ref || scope === 'absent') return map

  for (const f of lsLedger(ref, 'attestations')) {
    const m = f.match(/^attestations\/(T\d{2})\//)
    if (!m) continue
    const doc = readLedger(ref, f)
    if (!doc) continue
    const order = gitOrNull(['rev-list', '--count', ref, '--', f]) ?? '0'
    if (!map.has(m[1])) map.set(m[1], [])
    map.get(m[1]).push({ path: f, order: Number(order), doc })
  }
  for (const arr of map.values()) arr.sort((a, b) => a.order - b.order)
  return map
}

/** Événements du ledger non encore poussés — rien n'est durable tant qu'ils restent. */
export function unpushedEvents() {
  const name = ledgerRef()
  const st = pushState(name)
  if (!st.exists) return 0
  if (st.neverPushed) return -1 // jamais poussé : inconnu mais certainement non durable
  return st.ahead ?? 0
}

export { git }
