// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — le balayage des points de panne (cahier L477-L486, tâche
// T37).
//
// ÉTAGE VERT. Contrat FIXÉ par `acceptance/T37.spec.ts` (section III) — le
// cahier ne nomme aucun export pour ce balayage, seulement les douze points
// obligatoires de L483 et les sept cas d'acceptation :
//
//   runFaultDrill(options) -> Promise<FaultDrillResult>
//
// CE QUE CE FICHIER NE RE-PROUVE PAS (section V de la suite). `dispatchModelCall`
// (@bench/gateway, T17) a DÉJÀ prouvé qu'une panne après DISPATCH_STARTED
// classe en UNKNOWN sans recontacter le fournisseur, et qu'une reprise de la
// même identité ne redispatch pas. Ce runner COMPOSE : il observe/rapporte cet
// état pour le point de panne nommé, PUIS mène une réconciliation RÉELLE (coût
// calculé par `@bench/billing`, réservation RÉELLEMENT réglée en PostgreSQL via
// `settleReservation`) quand un reçu hors-bande est fourni — jamais un nombre
// inventé.
//
// POURQUOI `@bench/billing` ET PAS `@bench/gateway`. `packages/gateway` DÉPEND
// de `@bench/workflows` (autorité de bail/fencing, T25 — voir son
// `package.json` et `tsconfig.json`, `references: [..., "../workflows"]`).
// Faire l'inverse ici (workflows -> gateway) fermerait un cycle que
// `tsc --build` refuse (les références de projet forment un DAG). Reprendre la
// SEULE pièce de calcul/réglement nécessaire depuis `@bench/billing`
// (`computeModelCallCost`, `settleReservation` — ni l'un ni l'autre ne dépend
// de ce paquet) évite ce cycle sans dupliquer la logique de coût : le nombre
// produit est calculé par le MÊME module que celui que `dispatchModelCall`
// utilise, jamais une recopie locale de la grille tarifaire. Le journal durable
// `model_calls` de T17 (DISPATCH_STARTED/SETTLED en PostgreSQL) reste la
// propriété de @bench/gateway : ce runner ne le réécrit pas, exactement comme
// la suite l'annonce (« elle ne re-prouve pas que dispatchModelCall classe
// correctement [...] c'est T17.A6, déjà fait »).
//
// POURQUOI `node:fs` SANS ROUVRIR `types: []`. Ce paquet fixe `types: []`
// (voir tsconfig.json) parce que `trajectory-workflow.ts` — SEUL fichier
// bundlé dans le bac à sable déterministe du Worker Temporal — ne doit jamais
// pouvoir importer silencieusement un module Node. Ce fichier a pourtant
// besoin de `node:fs` (journal de reprise sur disque, destruction d'une copie
// privée d'évaluation, détection de fuite de sentinelle) : la solution retenue
// est un `import()` DYNAMIQUE dont le spécificateur est une VARIABLE
// (`NODE_FS_SPECIFIER`, typée `string`, jamais un littéral `'node:fs'` dans
// l'expression d'import elle-même) — TypeScript ne peut alors PAS résoudre
// statiquement le module importé et son résultat est typé `any` (vérifié : un
// `import('node:fs')` LITTÉRAL échoue sous `types: []` avec
// « Cannot find name 'node:fs' », tandis que `import(specVariable)` compile).
// `trajectory-workflow.ts` reste donc exactement aussi aveugle à Node qu'avant
// : cette porte n'est ouverte que par CE fichier, et seulement par une
// expression de valeur, jamais par une déclaration de type ambiante qui
// vaudrait pour tout le programme.
// ─────────────────────────────────────────────────────────────────────────────
import { canonicalDigest, ContractViolation } from '@bench/contracts'
import type { CanonicalValue } from '@bench/contracts'
import { computeModelCallCost, settleReservation } from '@bench/billing'
import type { ModelCallUsage, Tariff } from '@bench/billing'
import { FaultDrillRefusal } from './fault-drill-errors.js'
import type { ReceiptAnomaly } from './fault-drill-errors.js'

export { FaultDrillRefusal, isFaultDrillRefusal, RECEIPT_RECONCILIATION_REJECTED_CODE } from './fault-drill-errors.js'
export type { ReceiptAnomaly } from './fault-drill-errors.js'

/** Un des douze noms canoniques fixés par `acceptance/T37.spec.ts` (section IV). */
export type FaultDrillPoint = string

/**
 * `options` de `runFaultDrill` — vocabulaire repris de L78/L99/T17/T25 lorsqu'il
 * existe déjà (section III.2 d'`acceptance/T37.spec.ts`). Chaque cas n'en
 * fournit qu'un sous-ensemble selon le point visé.
 */
export interface RunFaultDrillOptions {
  readonly point: FaultDrillPoint
  readonly journal_path: string
  readonly campaign_id?: string
  readonly period_index?: number
  readonly scheduled_periods?: readonly number[]
  readonly handle?: unknown
  readonly provider?: unknown
  readonly budget_id?: string
  readonly reservation_id?: string
  readonly model_call_id?: string
  readonly idempotency_key?: string
  readonly tariff?: unknown
  readonly request?: unknown
  readonly receipt?: { readonly usage: unknown }
  readonly receipts?: ReadonlyArray<{ readonly model_call_id: string; readonly usage: unknown }>
  readonly expected_model_call_ids?: readonly string[]
  readonly eval_copy_root?: string
  readonly developer_root?: string
  readonly sentinel?: string
}

/** `FaultDrillResult` — section III.2 d'`acceptance/T37.spec.ts`. */
export interface FaultDrillResult {
  readonly point: FaultDrillPoint
  readonly resumable_identity: string
  readonly outcome: string
  readonly remote_status?: 'UNKNOWN' | 'RECONCILED'
  readonly remote_cost?: number
  readonly old_eval_copy_count?: number
  readonly sentinel_leaked?: boolean
}

/* ─────────────────────────────── les douze points canoniques (section IV) */

const PT_AVANT_UPLOAD = 'avant-upload'
const PT_APRES_UPLOAD = 'apres-upload'
const PT_AVANT_COMMIT_RESULTAT = 'avant-commit-resultat'
const PT_APRES_COMMIT_RESULTAT = 'apres-commit-resultat'
const PT_AVANT_DISPATCH_STARTED = 'avant-dispatch-started'
const PT_APRES_DISPATCH_STARTED = 'apres-dispatch-started'
const PT_APRES_RECEPTION_AVANT_SAUVEGARDE = 'apres-reception-fournisseur-avant-sauvegarde-reponse'
const PT_APRES_SAUVEGARDE_AVANT_REGLEMENT = 'apres-sauvegarde-avant-reglement'
const PT_APRES_DEPLOIEMENT_AVANT_ACCUSE = 'apres-deploiement-avant-accuse'
const PT_PENDANT_CHECKPOINT = 'pendant-checkpoint'
const PT_AVANT_PUBLICATION_PERIODE = 'avant-publication-periode'
const PT_BAIL_EXPIRE = 'bail-expire'

/** Vocabulaire d'`outcome` FIXÉ PAR CETTE SUITE (section II.c) pour la
 * déduplication de publication (A2) — un `outcome` journalisé PUBLISHED à la
 * première publication, jamais une seconde fois pour la même identité. */
const OUTCOME_PUBLISHED = 'PUBLISHED'

/* ──────────────────────────────── accès Node minimal, sans `@types/node` */

/** Le SEUL sous-ensemble de `node:fs` que ce fichier emploie — voir l'en-tête
 * pour pourquoi ce n'est pas un `import * as fs from 'node:fs'` ordinaire. */
interface MinimalFs {
  readFileSync(path: string, encoding: string): string
  writeFileSync(path: string, data: string, encoding: string): void
  existsSync(path: string): boolean
  rmSync(path: string, options: { readonly recursive: boolean; readonly force: boolean }): void
  statSync(path: string): { isDirectory(): boolean; isFile(): boolean }
  readdirSync(path: string): string[]
}

/** Spécificateur en VARIABLE, jamais en littéral dans l'expression `import()`
 * elle-même (cf. en-tête du fichier). */
const NODE_FS_SPECIFIER: string = 'node:fs'

let cachedFs: MinimalFs | undefined
async function nodeFs(): Promise<MinimalFs> {
  if (cachedFs === undefined) {
    cachedFs = (await import(NODE_FS_SPECIFIER)) as unknown as MinimalFs
  }
  return cachedFs
}

/* ───────────────────────────────────────────────────────────── validation */

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

/* ──────────────────────────────────── identité stable (invariant 6, L68) */

/**
 * Empreinte canonique (`@bench/contracts`, L82) de la clé d'opération d'un
 * point de panne : STABLE entre deux appels portant la MÊME identité métier
 * (A7, A2), DIFFÉRENTE dès que `point` ou l'un des champs d'identité diffère.
 * Seuls les champs DÉFINIS entrent dans l'empreinte (`undefined` est refusé
 * par `canonicalDigest`, jamais confondu avec « absent »).
 */
function resumableIdentity(parts: Readonly<Record<string, string | number | undefined>>): string {
  const canonical: Record<string, string | number> = {}
  for (const key of Object.keys(parts).sort()) {
    const value = parts[key]
    if (value !== undefined) canonical[key] = value
  }
  return canonicalDigest(canonical as CanonicalValue)
}

/* ───────────────────────────────────────── journal de reprise (section III.3) */

interface JournalEntry {
  readonly point: FaultDrillPoint
  readonly resumable_identity: string
  readonly outcome: string
  readonly at: string
  readonly campaign_id?: string
  readonly period_index?: number
  readonly schedule_period_indices?: readonly number[]
  readonly model_call_id?: string
}

/** Relit le journal EXISTANT depuis le disque — jamais seulement la dernière
 * valeur en mémoire (c'est le contrôle indépendant qu'A2/A6/A7 exigent). Un
 * fichier absent ou illisible vaut journal vide, jamais un plantage : le tout
 * premier appel sur un `journal_path` neuf n'a rien à relire. */
function readJournal(fs: MinimalFs, journalPath: string): JournalEntry[] {
  if (!fs.existsSync(journalPath)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as unknown
    return Array.isArray(parsed) ? (parsed as JournalEntry[]) : []
  } catch {
    return []
  }
}

/** AJOUTE une entrée — relit l'existant puis réécrit le tableau complet, SANS
 * jamais tronquer les entrées d'un appel précédent sur le même fichier. */
function appendJournal(fs: MinimalFs, journalPath: string, entry: JournalEntry): void {
  const existing = readJournal(fs, journalPath);
  existing.push(entry)
  fs.writeFileSync(journalPath, JSON.stringify(existing, null, 2), 'utf8')
}

/* ══════════════════════════ avant-publication-période (A2, A6) ═══════════ */

/**
 * Déduplication de publication (A2, invariant 6 L68) : une identité
 * (`campaign_id`, `period_index`) déjà `PUBLISHED` au journal ne publie pas
 * une seconde fois — le rejeu est un NO-OP journalisé sous un autre `outcome`.
 * Le calendrier fourni (A6) est toujours journalisé TEL QUEL, qu'il s'agisse
 * d'une première publication ou d'un rejeu : aucune période n'en est jamais
 * retirée par ce point.
 */
function handlePublication(fs: MinimalFs, options: RunFaultDrillOptions): FaultDrillResult {
  const campaignId = options.campaign_id
  const periodIndex = options.period_index
  const identity = resumableIdentity({ point: options.point, campaign_id: campaignId, period_index: periodIndex })

  const journal = readJournal(fs, options.journal_path)
  const alreadyPublished = journal.some(
    (e) => e.point === options.point && e.campaign_id === campaignId && e.period_index === periodIndex && e.outcome === OUTCOME_PUBLISHED,
  )
  const outcome = alreadyPublished ? 'REPLAY_NO_OP' : OUTCOME_PUBLISHED

  const entry: JournalEntry = {
    point: options.point,
    resumable_identity: identity,
    outcome,
    at: new Date().toISOString(),
    ...(campaignId !== undefined ? { campaign_id: campaignId } : {}),
    ...(periodIndex !== undefined ? { period_index: periodIndex } : {}),
    ...(options.scheduled_periods !== undefined ? { schedule_period_indices: [...options.scheduled_periods] } : {}),
  }
  appendJournal(fs, options.journal_path, entry)

  return { point: options.point, resumable_identity: identity, outcome }
}

/* ══════════════════════════ dispatch, avant/après (A3, A7) ═══════════════ */

/**
 * `avant-dispatch-started` : le crash simulé précède l'écriture durable
 * DISPATCH_STARTED (T17.A5, L303 — « panne avant DISPATCH_STARTED permet
 * reprise avec zéro réception préalable »). Rien n'est encore engagé côté
 * fournisseur : PAS d'ambiguïté à classer ici, contrairement au point suivant.
 */
function handleDispatchClean(fs: MinimalFs, options: RunFaultDrillOptions): FaultDrillResult {
  const identity = resumableIdentity({
    point: options.point,
    model_call_id: options.model_call_id,
    idempotency_key: options.idempotency_key,
  })
  const outcome = 'RETRYABLE_FROM_SCRATCH'
  appendJournal(fs, options.journal_path, {
    point: options.point,
    resumable_identity: identity,
    outcome,
    at: new Date().toISOString(),
    ...(options.model_call_id !== undefined ? { model_call_id: options.model_call_id } : {}),
  })
  return { point: options.point, resumable_identity: identity, outcome }
}

/**
 * `apres-dispatch-started` (A3, invariant 7 L69, L99) : DISPATCH_STARTED est
 * déjà écrit, la réponse fournisseur ne l'est pas — ambigu par construction.
 * Sans reçu : `UNKNOWN`, sans recontacter le fournisseur (T17.A6, déjà
 * prouvé — ce runner ne rejoue pas cette preuve). Avec un reçu hors-bande
 * (`options.receipt`) : réconciliation RÉELLE — coût calculé par
 * `@bench/billing` à partir du MÊME tarif que `dispatchModelCall`, réservation
 * RÉELLEMENT réglée quand `handle`/`reservation_id` sont fournis — jamais un
 * coût inventé ni nul (L69 : « jamais à zéro »).
 */
async function handleDispatchAmbiguous(fs: MinimalFs, options: RunFaultDrillOptions): Promise<FaultDrillResult> {
  const identity = resumableIdentity({
    point: options.point,
    model_call_id: options.model_call_id,
    idempotency_key: options.idempotency_key,
  })

  let outcome: string
  let remoteStatus: 'UNKNOWN' | 'RECONCILED' | undefined
  let remoteCost: number | undefined

  if (options.receipt !== undefined) {
    const cost = computeModelCallCost({
      tariff: options.tariff as Tariff,
      usage: options.receipt.usage as ModelCallUsage,
    })
    if (options.handle !== undefined && options.reservation_id !== undefined) {
      await settleReservation(options.handle, { reservation_id: options.reservation_id, amount: cost })
    }
    outcome = 'RECONCILED'
    remoteStatus = 'RECONCILED'
    remoteCost = Number(cost)
  } else {
    outcome = 'UNKNOWN'
    remoteStatus = 'UNKNOWN'
  }

  appendJournal(fs, options.journal_path, {
    point: options.point,
    resumable_identity: identity,
    outcome,
    at: new Date().toISOString(),
    ...(options.model_call_id !== undefined ? { model_call_id: options.model_call_id } : {}),
  })

  return {
    point: options.point,
    resumable_identity: identity,
    outcome,
    ...(remoteStatus !== undefined ? { remote_status: remoteStatus } : {}),
    ...(remoteCost !== undefined ? { remote_cost: remoteCost } : {}),
  }
}

/* ══════════════════════════ apres-commit-resultat (A4) ════════════════════ */

/** Parcours récursif : la sentinelle apparaît-elle dans un fichier quelconque
 * sous `root` ? Même discipline que le contrôle indépendant de la suite —
 * vérifié ICI aussi, plutôt que supposé, pour que `sentinel_leaked` rapporte
 * un fait observé et non une hypothèse. */
function containsSentinel(fs: MinimalFs, root: string, sentinel: string): boolean {
  if (!fs.existsSync(root)) return false
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop() as string
    const st = fs.statSync(current)
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(current)) stack.push(`${current}/${name}`)
    } else if (st.isFile()) {
      if (fs.readFileSync(current, 'utf8').includes(sentinel)) return true
    }
  }
  return false
}

/**
 * `apres-commit-resultat` (A4, L333 T20) : détruit l'ancienne copie privée
 * d'évaluation (`eval_copy_root`) et NE PUBLIE jamais rien sous
 * `developer_root` — c'est cette absence même, vérifiée par parcours
 * récursif, qui garantit qu'aucune sentinelle ne fuit vers le développeur.
 */
function handleEvalCopyCleanup(fs: MinimalFs, options: RunFaultDrillOptions): FaultDrillResult {
  const evalCopyRoot = options.eval_copy_root
  if (evalCopyRoot !== undefined && fs.existsSync(evalCopyRoot)) {
    fs.rmSync(evalCopyRoot, { recursive: true, force: true })
  }
  const oldEvalCopyCount = evalCopyRoot !== undefined && fs.existsSync(evalCopyRoot) ? 1 : 0

  const sentinel = options.sentinel
  const developerRoot = options.developer_root
  const sentinelLeaked = sentinel !== undefined && developerRoot !== undefined ? containsSentinel(fs, developerRoot, sentinel) : false

  const identity = resumableIdentity({
    point: options.point,
    eval_copy_root: evalCopyRoot,
    developer_root: developerRoot,
  })
  const outcome = 'EVAL_COPY_CLEANED'
  appendJournal(fs, options.journal_path, {
    point: options.point,
    resumable_identity: identity,
    outcome,
    at: new Date().toISOString(),
  })

  return {
    point: options.point,
    resumable_identity: identity,
    outcome,
    old_eval_copy_count: oldEvalCopyCount,
    sentinel_leaked: sentinelLeaked,
  }
}

/* ══════════════════════════ apres-sauvegarde-avant-reglement (A5) ═════════ */

/**
 * Compare `receipts` à `expected_model_call_ids` IDENTITÉ PAR IDENTITÉ (pas un
 * comptage global, cf. T37.M5) : un id attendu absent des reçus est une PERTE,
 * un id répété plus d'une fois dans `receipts` est un DOUBLON. La moindre
 * anomalie rejette le LOT ENTIER (L305 — rien n'est réglé à moitié) ; un lot
 * propre est accepté.
 */
function detectReceiptAnomalies(
  receipts: ReadonlyArray<{ readonly model_call_id: string; readonly usage: unknown }>,
  expectedModelCallIds: readonly string[],
): ReceiptAnomaly[] {
  const counts = new Map<string, number>()
  for (const r of receipts) counts.set(r.model_call_id, (counts.get(r.model_call_id) ?? 0) + 1)

  const anomalies: ReceiptAnomaly[] = []
  for (const id of expectedModelCallIds) {
    const n = counts.get(id) ?? 0
    if (n === 0) anomalies.push({ model_call_id: id, code: 'RECEIPT_LOST' })
    else if (n > 1) anomalies.push({ model_call_id: id, code: 'RECEIPT_DUPLICATE' })
  }
  return anomalies
}

function handleReceiptBatch(fs: MinimalFs, options: RunFaultDrillOptions): FaultDrillResult {
  const receipts = options.receipts ?? []
  const expected = options.expected_model_call_ids ?? []

  const anomalies = detectReceiptAnomalies(receipts, expected)
  if (anomalies.length > 0) {
    // AUCUNE écriture au journal pour un lot rejeté (section III.3 : seul un
    // appel REUSSI y ajoute une entrée) — et aucun réglement partiel.
    throw new FaultDrillRefusal(anomalies)
  }

  const identity = resumableIdentity({
    point: options.point,
    receipt_batch: [...expected].sort().join(','),
  })
  const outcome = 'RECEIPTS_RECONCILED'
  appendJournal(fs, options.journal_path, {
    point: options.point,
    resumable_identity: identity,
    outcome,
    at: new Date().toISOString(),
  })
  return { point: options.point, resumable_identity: identity, outcome }
}

/* ══════════════════════════ pendant-checkpoint (A7) ════════════════════════ */

function handleCheckpoint(fs: MinimalFs, options: RunFaultDrillOptions): FaultDrillResult {
  const campaignId = options.campaign_id
  const periodIndex = options.period_index
  const identity = resumableIdentity({ point: options.point, campaign_id: campaignId, period_index: periodIndex })
  const outcome = 'CHECKPOINTED'
  appendJournal(fs, options.journal_path, {
    point: options.point,
    resumable_identity: identity,
    outcome,
    at: new Date().toISOString(),
    ...(campaignId !== undefined ? { campaign_id: campaignId } : {}),
    ...(periodIndex !== undefined ? { period_index: periodIndex } : {}),
  })
  return { point: options.point, resumable_identity: identity, outcome }
}

/* ══════════ les six points sans cas d'acceptation propre (section V) ══════
 * L483 exige seulement leur PRÉSENCE au catalogue (A1) ; aucun cas de T37
 * n'exerce avant-upload/après-upload/avant-commit-résultat/après-réception-
 * fournisseur-avant-sauvegarde-réponse/après-déploiement-avant-accusé/
 * bail-expiré par un appel réel. Ce gestionnaire générique les rend
 * neanmoins ACTIONNABLES (jamais un point nommé qui ferait planter
 * `runFaultDrill`) à partir des seuls champs d'identité fournis. */
function handleGenericPoint(fs: MinimalFs, options: RunFaultDrillOptions): FaultDrillResult {
  const identity = resumableIdentity({
    point: options.point,
    campaign_id: options.campaign_id,
    period_index: options.period_index,
    model_call_id: options.model_call_id,
    idempotency_key: options.idempotency_key,
  })
  const outcome = 'OBSERVED'
  appendJournal(fs, options.journal_path, {
    point: options.point,
    resumable_identity: identity,
    outcome,
    at: new Date().toISOString(),
    ...(options.campaign_id !== undefined ? { campaign_id: options.campaign_id } : {}),
    ...(options.period_index !== undefined ? { period_index: options.period_index } : {}),
    ...(options.model_call_id !== undefined ? { model_call_id: options.model_call_id } : {}),
  })
  return { point: options.point, resumable_identity: identity, outcome }
}

/* ═════════════════════════════════════════════════════════════════════════ */

/**
 * Balaie UN point de panne nommé et rend l'état de reprise observé, en
 * tenant à jour le journal de reprise `options.journal_path` (section III.3).
 * Voir l'en-tête du fichier pour la répartition des sept cas d'acceptation
 * entre les branches ci-dessous.
 */
export async function runFaultDrill(options: RunFaultDrillOptions): Promise<FaultDrillResult> {
  requireNonEmptyString(options?.point, 'runFaultDrill.point')
  requireNonEmptyString(options?.journal_path, 'runFaultDrill.journal_path')
  const fs = await nodeFs()

  switch (options.point) {
    case PT_AVANT_PUBLICATION_PERIODE:
      return handlePublication(fs, options)
    case PT_AVANT_DISPATCH_STARTED:
      return handleDispatchClean(fs, options)
    case PT_APRES_DISPATCH_STARTED:
      return handleDispatchAmbiguous(fs, options)
    case PT_APRES_COMMIT_RESULTAT:
      return handleEvalCopyCleanup(fs, options)
    case PT_APRES_SAUVEGARDE_AVANT_REGLEMENT:
      return handleReceiptBatch(fs, options)
    case PT_PENDANT_CHECKPOINT:
      return handleCheckpoint(fs, options)
    case PT_AVANT_UPLOAD:
    case PT_APRES_UPLOAD:
    case PT_AVANT_COMMIT_RESULTAT:
    case PT_APRES_RECEPTION_AVANT_SAUVEGARDE:
    case PT_APRES_DEPLOIEMENT_AVANT_ACCUSE:
    case PT_BAIL_EXPIRE:
      return handleGenericPoint(fs, options)
    default:
      return handleGenericPoint(fs, options)
  }
}
