// ─────────────────────────────────────────────────────────────────────────────
// bench lease — le bail du pilote.
//
// POURQUOI. Une Routine horaire tire dans une session NEUVE, sur un conteneur
// neuf, sans mémoire de la précédente. Si un tir démarre pendant qu'un autre
// travaille encore, deux boucles écrivent les mêmes branches : conflits de
// poussée, attestations concurrentes, et — pire — deux verdicts sur le même
// `input_digest`, c'est-à-dire CONTESTED sur une tâche que personne n'a
// contestée. Le bail existe pour rendre ce scénario impossible, pas improbable.
//
// COMMENT. Le bail est un fichier du ledger. L'ATOMICITÉ N'EST PAS DANS CE
// FICHIER : elle est dans la POUSSÉE. Deux sessions qui lisent le même commit de
// ledger, y ajoutent chacune leur bail et poussent — seule la première réussit ;
// la seconde est refusée pour non-fast-forward et sait ainsi qu'elle a perdu.
// C'est un compare-and-swap emprunté à git, sans inventer de verrou, et sans
// pousser une seule ref hors des deux branches autorisées.
//
// POURQUOI UN BATTEMENT ET PAS UNE EXPIRATION FIXE. Une session tuée par la
// limite de quota ne rend jamais son bail. Avec une expiration fixe, soit elle
// bloque la reprise pour toujours (TTL long), soit un tir vole le bail d'une
// session bien vivante (TTL court). Le titulaire bat donc le cœur à chaque
// étage — il pousse déjà à chaque étage, le battement ne coûte rien — et un
// bail silencieux depuis plus de `ttl_s` devient volable. Une coupure brutale
// se répare donc toute seule, en une TTL.
// OÙ IL VIT, ET POURQUOI PAS DANS LE RUNNER. `verification/runner/` est dans
// GLOBAL : y toucher re-périme les 44 attestations. Le bail ne juge rien — il
// décide QUI pilote, jamais si un test passe. Un bail cassé fait au pire écrire
// deux sessions à la fois, ce que le ledger sanctionne en CONTESTED : un échec
// détecté, jamais un faux PASS. Le geler coûterait 44 re-attestations à chaque
// retouche pour zéro garantie supplémentaire.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { hostname } from 'node:os'
import { git, gitOrNull, repoRoot } from '../verification/runner/git.mjs'
import { ledgerRef, resolveLedger, appendToLedger } from '../verification/runner/ledger.mjs'
import { bootId } from '../verification/runner/doctor.mjs'

const R = repoRoot()
export const LEASE_PATH = 'leases/driver.json'
/** 45 min : plus court que la période du cron, pour qu'un tir suive toujours. */
export const DEFAULT_TTL_S = 45 * 60

/**
 * Identité du titulaire. Stable DANS une session (le fichier vit le temps du
 * conteneur), jamais réutilisable entre deux — c'est exactement la granularité
 * voulue : un tir de Routine = un titulaire.
 */
export function owner() {
  const f = `${R}/.bench/lease-owner`
  if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  const id = `${hostname()}-${bootId().slice(0, 8)}-${randomUUID().slice(0, 8)}`
  mkdirSync(`${R}/.bench`, { recursive: true })
  writeFileSync(f, id + '\n')
  return id
}

/**
 * Aligne le ledger local sur origin. Un bail lu sur un ledger périmé désignerait
 * un titulaire déjà parti — on lit donc TOUJOURS après synchronisation.
 * N'avance jamais par-dessus des événements locaux non poussés : c'est la
 * divergence que `bench resume` sanctionne en 4, pas au bail de la masquer.
 */
export function syncLedger() {
  const name = ledgerRef()
  const fetched = gitOrNull(['fetch', 'origin', `${name}:refs/remotes/origin/${name}`]) !== null
  const local = gitOrNull(['rev-parse', '--verify', `refs/heads/${name}`])
  const remote = gitOrNull(['rev-parse', '--verify', `refs/remotes/origin/${name}`])
  if (!remote) return { fetched, state: 'no-remote' }
  if (!local) {
    git(['update-ref', `refs/heads/${name}`, remote])
    return { fetched, state: 'created' }
  }
  if (local === remote) return { fetched, state: 'in-sync' }
  const behind = Number(gitOrNull(['rev-list', '--count', `${local}..${remote}`]) ?? '0')
  const ahead = Number(gitOrNull(['rev-list', '--count', `${remote}..${local}`]) ?? '0')
  if (ahead === 0 && behind > 0) {
    git(['update-ref', `refs/heads/${name}`, remote])
    return { fetched, state: 'fast-forwarded', behind }
  }
  return { fetched, state: ahead && behind ? 'diverged' : 'ahead', ahead, behind }
}

function readLease() {
  const { ref } = resolveLedger()
  if (!ref) return null
  const raw = gitOrNull(['show', `${ref}:${LEASE_PATH}`])
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Écrit le bail ET LE POUSSE. La poussée est le test : si elle est refusée,
 * quelqu'un d'autre a avancé le ledger depuis notre lecture.
 *
 * En cas de refus on RECULE la ref locale à ce qu'elle était. Sans ce retour en
 * arrière, une course perdue laisserait un événement local non poussé, et
 * `bench resume` sortirait 4 à chaque tir suivant — la Routine se serait
 * elle-même barré la route.
 */
function commitLease(doc, message, extra = {}) {
  const name = ledgerRef()
  const before = gitOrNull(['rev-parse', '--verify', `refs/heads/${name}`])
  const c = appendToLedger([{ path: LEASE_PATH, content: JSON.stringify(doc, null, 2) + '\n' }], message)
  try {
    git(['push', 'origin', `${name}:${name}`])
  } catch (e) {
    if (before) git(['update-ref', `refs/heads/${name}`, before, c.commit])
    return {
      ok: false,
      reason: 'RACE_LOST',
      detail: String(e.stderr ?? e.message ?? e).slice(-400),
      rolled_back_to: before,
    }
  }
  return { ok: true, lease: doc, commit: c.commit, ...extra }
}

function silence(held, now) {
  const hb = held?.heartbeat_at ? Date.parse(held.heartbeat_at) : 0
  return Math.round((now - hb) / 1000)
}

export function status({ now = Date.now() } = {}) {
  const me = owner()
  const held = readLease()
  if (!held) return { state: 'FREE', owner: null, mine: false, me, lease: null }
  const silent = silence(held, now)
  const ttl = held.ttl_s ?? DEFAULT_TTL_S
  const stale = silent >= ttl
  return {
    state: held.state !== 'HELD' ? 'FREE' : stale ? 'STALE' : 'HELD',
    owner: held.owner,
    mine: held.owner === me,
    me,
    silent_for_s: silent,
    ttl_s: ttl,
    lease: held,
  }
}

/**
 * LA DÉCISION, isolée de toute écriture — c'est ce qui la rend démontrable :
 * `bench selftest` la met en échec sur des baux synthétiques sans pousser une
 * seule fois sur le vrai ledger. Une règle qu'on ne peut éprouver qu'en
 * production n'est pas éprouvée.
 */
export function decide(held, me, now = Date.now()) {
  if (!held || held.state !== 'HELD') return { ok: true, why: 'bail libre' }
  const silent = silence(held, now)
  const ttl = held.ttl_s ?? DEFAULT_TTL_S
  if (held.owner === me) return { ok: true, why: 'deja le mien — renouvellement', silent_for_s: silent }
  if (silent >= ttl)
    return { ok: true, why: `titulaire muet depuis ${silent}s (> ${ttl}s) — volable`, steal: { owner: held.owner, silent_for_s: silent } }
  return {
    ok: false,
    reason: 'HELD_BY_OTHER',
    holder: held.owner,
    silent_for_s: silent,
    stealable_in_s: ttl - silent,
    detail: "une autre session pilote — se retirer SANS notifier, ce n'est pas une anomalie",
  }
}

export function acquire({ ttl = DEFAULT_TTL_S, now = Date.now() } = {}) {
  const sync = syncLedger()
  if (sync.state === 'diverged')
    return { ok: false, reason: 'LEDGER_DIVERGED', sync, detail: 'ledger local et origin ont divergé — `bench resume` sort 4' }
  const me = owner()
  const held = readLease()
  const d = decide(held, me, now)
  if (!d.ok) return d
  const stole = d.steal ?? null
  const iso = new Date(now).toISOString()
  const doc = {
    schema: 'bench.lease/1',
    state: 'HELD',
    owner: me,
    ttl_s: ttl,
    acquired_at: iso,
    heartbeat_at: iso,
    boot_id: bootId(),
    stole_from: stole,
    note:
      'Un bail silencieux depuis plus de ttl_s est volable : une session tuee par ' +
      'la limite de quota ne rend jamais son bail, et la reprise ne doit pas en dependre.',
  }
  return commitLease(doc, `lease: ${me} prend le bail du pilote${stole ? ` (vole a ${stole.owner}, muet depuis ${stole.silent_for_s}s)` : ''}`, {
    stole_from: stole,
  })
}

export function renew({ now = Date.now() } = {}) {
  syncLedger()
  const me = owner()
  const held = readLease()
  if (!held || held.state !== 'HELD' || held.owner !== me)
    return { ok: false, reason: 'NOT_HELD_BY_ME', holder: held?.owner ?? null }
  return commitLease({ ...held, heartbeat_at: new Date(now).toISOString() }, `lease: battement de ${me}`)
}

export function release({ now = Date.now() } = {}) {
  syncLedger()
  const me = owner()
  const held = readLease()
  if (!held || held.state !== 'HELD') return { ok: true, reason: 'ALREADY_FREE', lease: held }
  if (held.owner !== me) return { ok: false, reason: 'NOT_MINE', holder: held.owner }
  return commitLease(
    { ...held, state: 'FREE', released_at: new Date(now).toISOString() },
    `lease: ${me} rend le bail`
  )
}
