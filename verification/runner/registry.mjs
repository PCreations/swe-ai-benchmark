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
import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { repoRoot } from './git.mjs'

const R = repoRoot()

/**
 * Les QUATRE règles du §J, et rien d'autre : « le validateur refuse id inconnu,
 * cycle, doublon ou dépendance absente ».
 *
 * Elles sont isolées ici parce qu'elles sont les seules qui s'appliquent aussi
 * à un REGISTRE DE REMPLACEMENT (ADR-005 §2). Les autres contrôles de
 * `loadRegistry` — digest du cahier, 44 tâches, monotonie vis-à-vis de
 * cases.lock.json, status figé — sont des invariants du dépôt réel : les
 * imposer à un registre synthétique le rendrait TOUJOURS invalide, et `T00.A5`
 * ne pourrait jamais atteindre `NOT_IMPLEMENTED`. Un cas qui ne peut pas
 * distinguer deux issues ne teste rien.
 */
export function structuralProblems(tasks) {
  const problems = []
  const byId = new Map()

  for (const t of tasks?.tasks ?? []) {
    if (!/^T([0-3]\d|4[0-3])$/.test(t.id)) problems.push(`ID INCONNU : ${t.id} (attendu T00..T43)`)
    if (byId.has(t.id)) problems.push(`DOUBLON : ${t.id}`)
    byId.set(t.id, t)
  }

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

  return { problems, byId }
}

/**
 * Où `verify:task` lit ses cartes de tâches.
 *
 * ADR-005 §2 : « Une variable d'environnement `BENCH_REGISTRY` désigne un
 * registre de remplacement. Quand elle est posée, le registre réel n'est JAMAIS
 * lu. » C'est ce qui rend `T00.A4` et `T00.A5` insensibles à l'avancement du
 * projet — le cahier l'exige : « réexécuter T00 après T43 doit rester possible ».
 *
 * PORTÉE STRICTEMENT LIMITÉE À `verify:task`. `bench resume` continue de lire
 * le registre réel, et ce n'est pas une inconséquence : resume est l'autorité
 * sur ce qui est fait. Une variable d'environnement capable de la détourner
 * ferait exactement ce que CLAUDE.md interdit — laisser autre chose que les
 * objets git décider si une tâche est terminée.
 */
export function registrySource(env = process.env) {
  const v = env.BENCH_REGISTRY
  if (!v) return { kind: 'repository', path: `${R}/verification/tasks.json` }
  const candidates = isAbsolute(v) ? [v] : [resolve(process.cwd(), v), resolve(R, v)]
  return { kind: 'override', path: candidates.find((p) => existsSync(p)) ?? candidates[0] }
}

/**
 * Charge le registre que `verify:task` doit adjuger, et NE JUGE RIEN d'autre.
 * Le champ `status` n'est même pas lu : §J — « éditer ce champ en DONE ne
 * valide rien ». Un registre de remplacement qui déclarerait T01 terminée doit
 * donc produire exactement le même verdict qu'un registre qui la déclare non
 * implémentée.
 */
export function loadRegistryForVerification(env = process.env) {
  const src = registrySource(env)
  let doc
  try {
    doc = JSON.parse(readFileSync(src.path, 'utf8'))
  } catch (e) {
    return { source: src, problems: [`registre illisible (${src.path}) : ${e.message}`], byId: new Map() }
  }
  if (src.kind === 'repository') {
    const full = loadRegistry()
    return { source: src, problems: full.problems, byId: full.byId ?? new Map(), doc, lock: full.lock }
  }
  const { problems, byId } = structuralProblems(doc)
  return { source: src, problems, byId, doc }
}

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

  const { problems: structural, byId } = structuralProblems(tasks)
  problems.push(...structural)

  for (const [id, t] of byId) {
    if (t.status !== 'NOT_IMPLEMENTED')
      problems.push(
        `STATUS NON FIGE : ${id} porte "${t.status}". ` +
          `Le champ est declaratif ; DONE est derive, jamais stocke.`
      )
  }
  if (byId.size !== 44) problems.push(`NOMBRE DE TACHES : ${byId.size} au lieu de 44`)

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

  // ── EXTENSIONS : taches issues d'un ADR accepte (ADR-007). Le registre du
  // cahier reste intact — 44 taches, toutes les regles ci-dessus inchangees —
  // et les extensions sont validees A PART, avec leurs propres gardes, avant
  // d'etre fusionnees. Pourquoi a part : acceptance/T43.spec.ts leve au
  // chargement si verification/tasks.json ne compte pas exactement 44 taches.
  const ext = loadExtensions(byId)
  problems.push(...ext.problems)
  for (const [id, t] of ext.byId) byId.set(id, t)
  for (const [task, ids] of ext.lockByTask) lockByTask.set(task, ids)
  if (ext.byId.size) problems.push(...mergedGraphProblems(byId))
  const mergedLock = { ...lock, cases: [...(lock.cases ?? []), ...ext.cases] }

  return { problems, tasks, lock: mergedLock, byId, lockByTask, extensions: ext.doc }
}

/**
 * LES TACHES D'EXTENSION ne viennent pas du cahier, donc aucune de ses gardes
 * ne les couvre d'office. Chacune des regles ci-dessous remplace une garde que
 * le cahier fournit aux 44 autres :
 *
 *   - ID au-dela de T43 SEULEMENT ici. Une T44 glissee dans tasks.json reste
 *     refusee par `structuralProblems` (ID INCONNU) : la frontiere de
 *     provenance ne se franchit pas par erreur de fichier.
 *   - SOURCE EPINGLEE. `spec_source` doit exister, ne pas etre le cahier, et son
 *     sha256 doit egaler l'empreinte declaree dans les DEUX fichiers d'extension
 *     — exactement comme `cahier_sha256` epingle le cahier. Modifier l'ADR
 *     invalide le registre jusqu'a mise a jour tracee.
 *   - SOURCE ACCEPTEE. Un ADR seulement PROPOSE ne peut pas porter de tache :
 *     sinon n'importe quel brouillon deviendrait une exigence.
 *   - STATUS FIGE et MONOTONIE, comme pour les 44.
 */
export function loadExtensions(cahierById, root = R) {
  const out = { problems: [], byId: new Map(), cases: [], lockByTask: new Map(), doc: null }
  const tasksPath = `${root}/verification/tasks.extensions.json`
  const lockPath = `${root}/verification/cases.extensions.lock.json`
  if (!existsSync(tasksPath)) return out

  let doc, lock
  try {
    doc = JSON.parse(readFileSync(tasksPath, 'utf8'))
  } catch (e) {
    out.problems.push(`verification/tasks.extensions.json illisible : ${e.message}`)
    return out
  }
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch (e) {
    out.problems.push(`verification/cases.extensions.lock.json illisible ou absent : ${e.message}`)
    return out
  }
  out.doc = doc

  const tasks = doc.tasks ?? []
  if (doc.task_count !== tasks.length)
    out.problems.push(`EXTENSIONS : task_count declare ${doc.task_count}, ${tasks.length} cartes presentes`)

  const shaCache = new Map()
  for (const t of tasks) {
    if (!/^T(4[4-9]|[5-9]\d)$/.test(t.id ?? ''))
      out.problems.push(`ID D'EXTENSION INVALIDE : ${t.id} (attendu T44 ou au-dela ; T00..T43 appartiennent au cahier)`)
    if (cahierById.has(t.id) || out.byId.has(t.id)) out.problems.push(`DOUBLON : ${t.id}`)

    const src = t.spec_source?.path
    if (!src) {
      out.problems.push(`EXTENSION SANS SOURCE : ${t.id} ne porte pas spec_source`)
    } else if (src === 'docs/cahier.md') {
      out.problems.push(`EXTENSION SUR LE CAHIER : ${t.id} cite docs/cahier.md — une tache du cahier vit dans tasks.json`)
    } else if (!existsSync(`${root}/${src}`)) {
      out.problems.push(`SOURCE ABSENTE : ${t.id} cite ${src}, introuvable`)
    } else {
      if (!shaCache.has(src)) shaCache.set(src, createHash('sha256').update(readFileSync(`${root}/${src}`)).digest('hex'))
      const sha = shaCache.get(src)
      if (doc.spec_sources?.[src] !== sha || lock.spec_source_sha256?.[src] !== sha)
        out.problems.push(
          `SOURCE_DIGEST_MISMATCH : ${src} vaut ${sha.slice(0, 12)}… mais les fichiers d'extension epinglent ` +
            `${String(doc.spec_sources?.[src]).slice(0, 12)}… / ${String(lock.spec_source_sha256?.[src]).slice(0, 12)}…`
        )
      const entete = readFileSync(`${root}/${src}`, 'utf8').split('\n').slice(0, 12).join('\n')
      if (!/statut\s*:\s*ACCEPT/i.test(entete))
        out.problems.push(`SOURCE NON ACCEPTEE : ${src} ne porte pas « statut : ACCEPTÉ » — un brouillon ne cree pas d'exigence`)
    }
    if (t.status !== 'NOT_IMPLEMENTED')
      out.problems.push(`STATUS NON FIGE : ${t.id} porte "${t.status}". DONE est derive, jamais stocke.`)
    out.byId.set(t.id, t)
  }

  for (const c of lock.cases ?? []) {
    if (!out.lockByTask.has(c.task)) out.lockByTask.set(c.task, [])
    out.lockByTask.get(c.task).push(c.id)
    out.cases.push(c)
  }
  for (const [id, t] of out.byId) {
    const have = new Set(t.required_cases ?? [])
    const missing = (out.lockByTask.get(id) ?? []).filter((c) => !have.has(c))
    if (missing.length) out.problems.push(`ACCEPTANCE_WEAKENED : ${id} ne declare plus ${missing.join(', ')}`)
  }
  return out
}

/** Dependances et cycles sur le registre FUSIONNE : une extension depend du cahier. */
export function mergedGraphProblems(byId) {
  const problems = []
  for (const [id, t] of byId)
    for (const d of t.depends_on ?? []) if (!byId.has(d)) problems.push(`DEPENDANCE ABSENTE : ${id} -> ${d}`)
  const color = new Map()
  const walk = (id, stack) => {
    if (color.get(id) === 2) return
    if (color.get(id) === 1) return void problems.push(`CYCLE : ${[...stack, id].join(' -> ')}`)
    color.set(id, 1)
    for (const d of byId.get(id)?.depends_on ?? []) walk(d, [...stack, id])
    color.set(id, 2)
  }
  for (const id of byId.keys()) walk(id, [])
  return problems
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
