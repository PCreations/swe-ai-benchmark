// ─────────────────────────────────────────────────────────────────────────────
// Chargement et VALIDATION du registre.
//
// §J exige que le validateur refuse : id inconnu, cycle, doublon, dépendance
// absente. On y ajoute deux règles que le cahier impose ailleurs :
//   • `status` est figé à NOT_IMPLEMENTED — §J : « éditer ce champ en DONE ne
//     valide rien ». Le laisser modifiable inviterait à le croire ;
//   • la carte de chaque tâche doit être un SUR-ENSEMBLE de cases.lock.json —
//     les cas ne peuvent que croître, jamais être retirés (monotonie).
//
// Toute anomalie ici produit la sortie 2 : registre invalide, rien n'est
// actionnable tant qu'il n'est pas réparé. Fail-closed.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { repoRoot } from './git.mjs'

const R = repoRoot()

export function loadRegistry() {
  const problems = []
  let tasks, lock

  try {
    tasks = JSON.parse(readFileSync(`${R}/verification/tasks.json`, 'utf8'))
  } catch (e) {
    return { problems: [`verification/tasks.json illisible : ${e.message}`] }
  }
  try {
    lock = JSON.parse(readFileSync(`${R}/verification/cases.lock.json`, 'utf8'))
  } catch (e) {
    return { problems: [`verification/cases.lock.json illisible : ${e.message}`] }
  }

  // Le cahier est la racine de toute provenance. Un digest qui ne correspond
  // plus invalide chaque citation de ligne du registre.
  const cahierSha = createHash('sha256').update(readFileSync(`${R}/docs/cahier.md`)).digest('hex')
  if (tasks.cahier_sha256 !== cahierSha)
    problems.push(
      `CAHIER_DIGEST_MISMATCH : tasks.json cite ${tasks.cahier_sha256?.slice(0, 12)}… ` +
        `mais docs/cahier.md vaut ${cahierSha.slice(0, 12)}…`
    )
  if (lock.cahier_sha256 !== cahierSha)
    problems.push('CAHIER_DIGEST_MISMATCH : cases.lock.json ne cite pas le cahier courant')

  const byId = new Map()
  for (const t of tasks.tasks ?? []) {
    if (!/^T([0-3]\d|4[0-3])$/.test(t.id)) problems.push(`ID INCONNU : ${t.id} (attendu T00..T43)`)
    if (byId.has(t.id)) problems.push(`DOUBLON : ${t.id}`)
    byId.set(t.id, t)
    if (t.status !== 'NOT_IMPLEMENTED')
      problems.push(
        `STATUS NON FIGE : ${t.id} porte "${t.status}". ` +
          `Le champ est declaratif ; DONE est derive, jamais stocke.`
      )
  }
  if (byId.size !== 44) problems.push(`NOMBRE DE TACHES : ${byId.size} au lieu de 44`)

  for (const [id, t] of byId)
    for (const d of t.depends_on ?? [])
      if (!byId.has(d)) problems.push(`DEPENDANCE ABSENTE : ${id} -> ${d}`)

  // Détection de cycle par coloration (blanc/gris/noir).
  const color = new Map()
  const walk = (id, stack) => {
    if (color.get(id) === 2) return
    if (color.get(id) === 1) {
      problems.push(`CYCLE : ${[...stack, id].join(' -> ')}`)
      return
    }
    color.set(id, 1)
    for (const d of byId.get(id)?.depends_on ?? []) walk(d, [...stack, id])
    color.set(id, 2)
  }
  for (const id of byId.keys()) walk(id, [])

  // Monotonie : la carte doit couvrir tout ce que le verrou exige.
  const lockByTask = new Map()
  for (const c of lock.cases ?? []) {
    if (!lockByTask.has(c.task)) lockByTask.set(c.task, [])
    lockByTask.get(c.task).push(c.id)
  }
  for (const [id, t] of byId) {
    const need = lockByTask.get(id) ?? []
    const have = new Set(t.required_cases ?? [])
    const missing = need.filter((c) => !have.has(c))
    if (missing.length)
      problems.push(`ACCEPTANCE_WEAKENED : ${id} ne declare plus ${missing.join(', ')}`)
  }

  return { problems, tasks, lock, byId, lockByTask }
}

/**
 * Une tâche est ATTESTABLE seulement si chacun de ses cas requis porte un mode
 * de preuve établi. FAIL-CLOSED : `UNCLASSIFIED` bloque l'attestation.
 *
 * Ce garde-fou existe parce que la porte « nécessité » N'EST PAS universelle.
 * Mesuré sur T00 : 2 cas sur 6 seulement relèvent du stub de module ; 3 sont
 * des cas de REFUS, qu'un stub qui lève rendrait verts à tort, et 1 est un cas
 * d'ARTEFACT qu'aucun stub ne peut casser. Appliquer la règle universelle
 * produirait donc un faux PASS sur 4 cas sur 6 des la premiere tache.
 */
export function attestability(taskId, lock) {
  const mine = (lock.cases ?? []).filter((c) => c.task === taskId)
  const unclassified = mine.filter((c) => !c.proof_kind || c.proof_kind === 'UNCLASSIFIED')
  return {
    attestable: unclassified.length === 0 && mine.length > 0,
    total: mine.length,
    unclassified: unclassified.map((c) => c.id),
    kinds: mine.reduce((a, c) => ((a[c.proof_kind] = (a[c.proof_kind] ?? 0) + 1), a), {}),
  }
}

/** Vocabulaire de capacités effectivement requis par le registre. */
export function requiredCapabilities(byId) {
  const s = new Set()
  for (const t of byId.values()) for (const c of t.requires ?? []) s.add(c)
  return [...s].sort()
}
