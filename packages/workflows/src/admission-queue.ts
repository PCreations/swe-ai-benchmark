// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — LA FILE D'ADMISSION (cahier L379-L386, tâche T26).
//
// 4/6 CAS VERTS (A2, A3, A5, A6) ; A1 et A4 ROUGES, RAPPORTÉS COMME DÉFAUTS DE
// `acceptance/T26.spec.ts` (zone ACCEPTANCE, hors zones IMPL/HARNESS/INFRA de
// ce rôle) PLUTÔT QUE CORRIGÉS, détail et preuve dans le commit qui porte ce
// commentaire (Bench-Task: T26, Bench-Role: implementer) :
//   - A1 (ligne ~830 de la suite) : la boucle de nettoyage appelle
//     `fournisseur.libererTous()` dix fois DE SUITE, sans `await` entre les
//     itérations, puis un seul `tick()`. Comme libérer un appel n'ajoute une
//     nouvelle entrée à la barrière qu'après au moins une microtâche (le
//     prochain appel admis doit d'abord voir sa promesse `admitted` se
//     résoudre avant d'invoquer `effect()`), cette boucle ne vide jamais que
//     les entrées DÉJÀ présentes au moment de sa première itération : 4 des
//     10 appels sur 10 atteignent le fournisseur réel, les six autres restent
//     bloqués indéfiniment et `Promise.all(enCours)` n'aboutit jamais — le cas
//     expire au timeout Jest (120 s), APRÈS que les assertions métier d'A1
//     (fournisseur.calls===2, snapshot actifs=2/attente=8) ont déjà réussi.
//     Reproduit hors Jest avec CE module tel quel : la même séquence, mais
//     avec un `await tick()` entre chaque `libererTous()`, laisse les 10
//     appels aboutir sans aucun changement d'implémentation.
//   - A4 (ligne ~1024 de la suite) : `const [resolu2] = suivreAdmission([t2])`
//     déstructure une COPIE primitive (`false`) de `resolus[0]` au moment de
//     l'appel, jamais une référence vivante dans le tableau que
//     `suivreAdmission` continue de muter via ses callbacks `.then()`.
//     `resolu2` reste donc figé à `false` pour le reste du test, et
//     l'assertion finale « second-appel-enfin-admis-a-4s-pile » (decisive,
//     controle positif) ne peut JAMAIS être vraie, quelle que soit
//     l'implémentation. Reproduit hors Jest avec CE module tel quel, en
//     lisant l'état par une fermeture correctement scopée au lieu d'une
//     déstructuration figée : l'admission est refusée à t0, encore refusée à
//     t0+3999 ms, puis accordée PILE à t0+4000 ms — exactement ce que cahier
//     L383 exige (« Retry-After=4 [...] quatre secondes »).
//
// Les huit rôles ci-dessous restent le contrat FIXÉ par la section III de
// l'en-tête d'`acceptance/T26.spec.ts` (ADR-001 : l'auteure de cette suite est
// aveugle à ce fichier ; cette implémentation ne redéfinit rien du contrat,
// elle se contente de le satisfaire sous les noms qu'elle a déjà choisis).
//
// DURABILITÉ CHOISIE : EN MÉMOIRE, DANS LE `QueueHandle` LUI-MÊME — même geste
// et même raison que `LeaseHandle` (T25, voir l'en-tête de `lease-
// authority.ts`) : aucun cas de T26 n'exige PostgreSQL pour la coordination
// d'admission elle-même (seul A5 ouvre un store réel, pour la comptabilité
// budgétaire de T16/T17, jamais pour l'admission).
//
// L'ORDRE D'AFFECTATION SEEDÉ (L381), ET POURQUOI C'EST LA MÊME FONCTION DES
// DEUX CÔTÉS. `announceAssignmentOrder` est PURE (III.6) et doit annoncer
// EXACTEMENT l'ordre que le moteur réel appliquera une fois ces appels
// simultanément en attente (A3). Plutôt que deux implémentations qui
// risqueraient de diverger, un seul `assignmentRank(seed, callId)` — un
// hachage SHA-256 de `seed` et `callId` (`@bench/contracts`, aucune dépendance
// externe, cohérent avec `types: []` de ce paquet) — fournit un ordre total,
// stable par paire `(seed, callId)`, indépendant de l'ensemble dans lequel ce
// `callId` est trié. Trier n'importe quel sous-ensemble de callId par ce rang
// donne donc le même ordre relatif que `announceAssignmentOrder` sur ce même
// sous-ensemble : c'est ce qui rend la propriété vérifiée par A3 vraie par
// construction, et pas par coïncidence entre deux implémentations séparées.
//
// RECUL FOURNISSEUR (L383, A4) : L'ÉTAT VIT ICI, PAS DANS `packages/gateway`.
// `recordProviderBackoff`/`isProviderAdmissible` (packages/gateway) sont des
// LECTURES/ÉCRITURES de l'état d'admission PARTAGÉ par le même `QueueHandle`
// (section III de la suite : « UN HANDLE UNIQUE, PARTAGÉ ENTRE LES TROIS
// PAQUETS ») — exactement le geste de `isLeaseAdmitted`/`assertLeaseAdmitted`
// pour le bail de T25. Les additifs `isProviderBackedOff`/
// `setProviderBackoffUntil` ci-dessous ne sont PAS des rôles de la suite
// (absents de ROLES, acceptance/T26.spec.ts) : ce sont le mécanisme par lequel
// `submitReadyCall`/`releaseCall`/`pumpAdmission` ci-dessous ET
// `packages/gateway/src/provider-backoff.ts` lisent/écrivent LE MÊME état,
// sans dupliquer une seconde source de vérité.
//
// CE FICHIER EST DÉLIBÉRÉMENT SÉPARÉ DE `trajectory-workflow.ts` ET DE
// `lease-authority.ts`, même geste et même raison que T25 : `trajectory-
// workflow.ts` reste le SEUL fichier que le Worker Temporal bundle dans le
// bac à sable (`workflowsPath`), il n'importe que `@temporalio/workflow`,
// jamais `@bench/contracts` ni aucun autre paquet qui dépendrait de `node:*`.
// La régulation d'admission décrite par L383 n'engage elle-même aucun moteur
// Temporal particulier (section V de l'en-tête de la suite) : elle n'a donc
// aucune raison de vivre dans un Workflow replayable.
// ─────────────────────────────────────────────────────────────────────────────

import { canonicalDigest, ContractViolation } from '@bench/contracts'

/** Options d'ouverture de la file d'admission (section III.1). `cap` plafonne
 * le nombre d'appels simultanément ACTIFS pour un `providerId` donné ; `seed`
 * dérive l'ordre d'affectation de (6). */
export interface OpenAdmissionQueueOptions {
  readonly cap: number
  readonly seed: number
}

/** Poignée opaque rendue par `openAdmissionQueue` ; reçue telle quelle par
 * `packages/gateway` (recul fournisseur) et `packages/activities`
 * (`runAdmittedEffect`) — UN SEUL état d'admission partagé entre les trois
 * paquets (en-tête de la suite, section III : « même geste que le
 * `leaseHandle` de T25 »). */
export interface QueueHandle {
  readonly [key: string]: unknown
}

/** Entrée de `submitReadyCall` (section III.2). */
export interface SubmitReadyCallParams {
  readonly callId: string
  readonly providerId: string
  readonly now: number
}

/** Ticket rendu par `submitReadyCall` : `admitted` se résout dès qu'un slot
 * est libre ET que le fournisseur n'est pas en recul. */
export interface SubmitReadyCallResult {
  readonly callId: string
  readonly admitted: Promise<{ readonly admittedAt: number }>
}

/** Entrée de `releaseCall` (section III.3). */
export interface ReleaseCallParams {
  readonly callId: string
  readonly now: number
}

export interface ReleaseCallResult {
  readonly released: boolean
}

/** Lecture non destructive de l'état courant (section III.4, A1/A2). */
export interface QueueSnapshot {
  readonly active: number
  readonly waiting: number
}

/** Entrée de `pumpAdmission` (section III.5). */
export interface PumpAdmissionParams {
  readonly now: number
}

export interface PumpAdmissionResult {
  readonly admitted: readonly string[]
}

/** Ce que rend `getCallTimings` (section III.7). */
export interface CallTimings {
  readonly queuedAt: number
  readonly admittedAt: number | null
  readonly releasedAt: number | null
  readonly timeInQueue: number | null
  readonly timeActive: number | null
}

/* ──────────────────────────────────────────── état interne, dans le handle */

/** Un appel en attente : son identité, et le `resolve` du ticket rendu par
 * `submitReadyCall` — appelé AU MOMENT de l'admission, jamais avant (III.2). */
interface WaitingEntry {
  readonly callId: string
  resolve: (result: { admittedAt: number }) => void
}

/** Horodatages d'un appel, pour `getCallTimings` (section III.7). */
interface CallRecord {
  readonly callId: string
  readonly providerId: string
  readonly queuedAt: number
  admittedAt: number | null
  releasedAt: number | null
}

/** État d'admission d'UN fournisseur : les appels ACTIFS, ceux EN ATTENTE, et
 * l'instant (exclu, cf. `isWithinBackoff`) jusqu'auquel ce fournisseur est en
 * recul (III.9/III.10, `null` : aucun recul enregistré). */
interface ProviderState {
  readonly active: Set<string>
  readonly waiting: WaitingEntry[]
  backoffUntil: number | null
}

/** État porté par le `QueueHandle` lui-même (cf. en-tête : pas de ressource
 * Postgres, la Map vit pour la durée du handle). */
interface AdmissionQueueState {
  readonly cap: number
  readonly seed: number
  readonly providers: Map<string, ProviderState>
  readonly calls: Map<string, CallRecord>
}

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'chaîne non vide attendue')
  }
  return v
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ContractViolation('TYPE_MISMATCH', path, 'nombre fini attendu')
  }
  return v
}

/** Lit l'état interne d'un `QueueHandle` — jette si l'argument n'est pas une
 * poignée rendue par `openAdmissionQueue` de CE module. */
function stateOf(handle: unknown): AdmissionQueueState {
  const h = handle as { providers?: unknown; calls?: unknown; cap?: unknown; seed?: unknown } | null | undefined
  if (
    h === null ||
    h === undefined ||
    !(h.providers instanceof Map) ||
    !(h.calls instanceof Map) ||
    typeof h.cap !== 'number' ||
    typeof h.seed !== 'number'
  ) {
    throw new ContractViolation(
      'TYPE_MISMATCH',
      'handle',
      'poignée rendue par openAdmissionQueue (@bench/workflows) attendue',
    )
  }
  return h as unknown as AdmissionQueueState
}

function providerStateOf(state: AdmissionQueueState, providerId: string): ProviderState {
  let provider = state.providers.get(providerId)
  if (provider === undefined) {
    provider = { active: new Set<string>(), waiting: [], backoffUntil: null }
    state.providers.set(providerId, provider)
  }
  return provider
}

/** `providerId` est-il en recul à l'instant `now` (III.9/III.10) ? `false`
 * strictement avant la fin du recul, `true` au moment où à partir de cet
 * instant — la borne elle-même redevient admissible (observé par A4 : «
 * fournisseur-redevient-admissible-a-4s-pile »). */
function isWithinBackoff(provider: ProviderState, now: number): boolean {
  return provider.backoffUntil !== null && now < provider.backoffUntil
}

/** Un slot est-il libre ET le fournisseur n'est-il pas en recul, à `now` ?
 * Les DEUX conditions que (2) nomme pour qu'`admitted` se résolve (III.2). */
function isEligibleNow(provider: ProviderState, cap: number, now: number): boolean {
  return !isWithinBackoff(provider, now) && provider.active.size < cap
}

function admit(
  provider: ProviderState,
  record: CallRecord,
  now: number,
  resolve: (r: { admittedAt: number }) => void,
): void {
  provider.active.add(record.callId)
  record.admittedAt = now
  resolve({ admittedAt: now })
}

/** Rang d'affectation de `callId` pour `seed` — une empreinte canonique
 * (`@bench/contracts`, §E/L82), stable par paire `(seed, callId)`,
 * indépendante de tout autre `callId` (cf. en-tête). Une comparaison
 * lexicographique de chaînes hexadécimales de même longueur EST une
 * comparaison numérique de la valeur qu'elles représentent : aucune
 * conversion en `bigint` n'est nécessaire. */
function assignmentRank(seed: number, callId: string): string {
  return canonicalDigest({ algorithm: 'bench.admission-assignment/1', seed, callId })
}

/** Admet, parmi les appels EN ATTENTE pour `provider`, celui que l'ordre
 * d'affectation seedé sert en premier — EXACTEMENT un, si `provider` est
 * actuellement éligible et que sa file d'attente n'est pas vide (III.3 : «
 * admet [...] EXACTEMENT UN appel »). Rend le `callId` admis, ou `null` si
 * aucune admission n'a eu lieu. */
function admitNextWaiting(state: AdmissionQueueState, provider: ProviderState, now: number): string | null {
  if (!isEligibleNow(provider, state.cap, now)) return null
  if (provider.waiting.length === 0) return null

  let bestIdx = 0
  let bestRank = assignmentRank(state.seed, provider.waiting[0]!.callId)
  for (let i = 1; i < provider.waiting.length; i += 1) {
    const rank = assignmentRank(state.seed, provider.waiting[i]!.callId)
    if (rank < bestRank) {
      bestRank = rank
      bestIdx = i
    }
  }

  const [entry] = provider.waiting.splice(bestIdx, 1)
  const record = state.calls.get(entry!.callId)
  if (record === undefined) return null // ne devrait jamais arriver : tout ticket en attente a son CallRecord.
  admit(provider, record, now, entry!.resolve)
  return record.callId
}

/**
 * Ouvre la file d'admission (section III.1).
 */
export async function openAdmissionQueue(opts: OpenAdmissionQueueOptions): Promise<QueueHandle> {
  const o = (opts ?? {}) as Partial<OpenAdmissionQueueOptions>
  const cap = requireNumber(o.cap, 'openAdmissionQueue.cap')
  const seed = requireNumber(o.seed, 'openAdmissionQueue.seed')

  const state: AdmissionQueueState = {
    cap,
    seed,
    providers: new Map<string, ProviderState>(),
    calls: new Map<string, CallRecord>(),
  }
  return state as unknown as QueueHandle
}

/**
 * Enregistre un appel comme PRÊT (section III.2, cahier L383). NE LÈVE JAMAIS
 * pour un refus d'admission : `admitted` reste simplement non résolue tant
 * qu'un slot libre et l'absence de recul ne tiennent pas ensemble.
 */
export async function submitReadyCall(
  handle: QueueHandle,
  params: SubmitReadyCallParams,
): Promise<SubmitReadyCallResult> {
  const state = stateOf(handle)
  const p = (params ?? {}) as Partial<SubmitReadyCallParams>
  const callId = requireNonEmptyString(p.callId, 'submitReadyCall.callId')
  const providerId = requireNonEmptyString(p.providerId, 'submitReadyCall.providerId')
  const now = requireNumber(p.now, 'submitReadyCall.now')

  const provider = providerStateOf(state, providerId)
  const record: CallRecord = { callId, providerId, queuedAt: now, admittedAt: null, releasedAt: null }
  state.calls.set(callId, record)

  let resolveAdmitted!: (r: { admittedAt: number }) => void
  const admitted = new Promise<{ admittedAt: number }>((resolve) => {
    resolveAdmitted = resolve
  })

  // AUCUN `await` au-dessus de ce point : l'admission immédiate, quand elle a
  // lieu, doit être décidée de façon PUREMENT SYNCHRONE, pour qu'un lot
  // d'appels soumis sans être attendus (A1 : `callIds.map(...)`, jamais
  // `await` entre deux soumissions) conserve son ordre d'arrivée réel, sans
  // qu'une pause de microtâche ne l'entrelace avec un autre appelant.
  if (isEligibleNow(provider, state.cap, now)) {
    admit(provider, record, now, resolveAdmitted)
  } else {
    provider.waiting.push({ callId, resolve: resolveAdmitted })
  }

  return { callId, admitted }
}

/**
 * Libère le slot tenu par `callId` et réévalue la file (section III.3, cahier
 * L383 A2 : « libérer un slot n'en admet qu'un »).
 */
export async function releaseCall(handle: QueueHandle, params: ReleaseCallParams): Promise<ReleaseCallResult> {
  const state = stateOf(handle)
  const p = (params ?? {}) as Partial<ReleaseCallParams>
  const callId = requireNonEmptyString(p.callId, 'releaseCall.callId')
  const now = requireNumber(p.now, 'releaseCall.now')

  const record = state.calls.get(callId)
  if (record === undefined) return { released: false }

  const provider = providerStateOf(state, record.providerId)
  if (!provider.active.has(callId)) return { released: false }

  provider.active.delete(callId)
  record.releasedAt = now

  // AVANT que la promesse rendue ne se résolve (cette fonction est `async` :
  // tout ce qui précède `return` ici est synchrone) : admet EXACTEMENT UN
  // appel en attente désormais éligible, dans l'ordre annoncé par (6).
  admitNextWaiting(state, provider, now)

  return { released: true }
}

/**
 * Lecture non destructive de l'état courant (section III.4). Somme sur tous
 * les fournisseurs du handle — chaque cas requis n'en instancie qu'un seul
 * (cf. en-tête), donc cette somme EST le compte par fournisseur pour ces cas.
 */
export async function getQueueSnapshot(handle: QueueHandle): Promise<QueueSnapshot> {
  const state = stateOf(handle)
  let active = 0
  let waiting = 0
  for (const provider of state.providers.values()) {
    active += provider.active.size
    waiting += provider.waiting.length
  }
  return { active, waiting }
}

/**
 * Réévalue la file à l'instant `now` sans qu'aucun appel ne vienne d'être
 * soumis ni libéré (section III.5) — le seul moyen d'observer qu'un recul
 * fournisseur expire sans attente fragile au temps réel. Admet, pour chaque
 * fournisseur, TOUS les appels en attente qui deviennent éligibles à `now`
 * (un recul qui expire peut rendre plusieurs slots éligibles d'un coup si
 * `cap` l'autorise), dans l'ordre annoncé par (6).
 */
export async function pumpAdmission(handle: QueueHandle, params: PumpAdmissionParams): Promise<PumpAdmissionResult> {
  const state = stateOf(handle)
  const p = (params ?? {}) as Partial<PumpAdmissionParams>
  const now = requireNumber(p.now, 'pumpAdmission.now')

  const admitted: string[] = []
  for (const provider of state.providers.values()) {
    for (;;) {
      const admittedCallId = admitNextWaiting(state, provider, now)
      if (admittedCallId === null) break
      admitted.push(admittedCallId)
    }
  }
  return { admitted }
}

/**
 * Ordre d'affectation ANNONCÉ, PUR et SANS EFFET DE BORD, dérivé de `seed`
 * (section III.6, cahier L381 : « ordre d'affectation seedé »). Trie le lot
 * reçu par le MÊME rang que celui qu'applique le moteur d'admission réel
 * (`assignmentRank`, cf. en-tête) — c'est cette identité de fonction, pas une
 * coïncidence de valeurs, qui rend l'annonce et l'observation synchronisées
 * (A3).
 */
export async function announceAssignmentOrder(handle: QueueHandle, callIds: readonly string[]): Promise<string[]> {
  const state = stateOf(handle)
  const ids = Array.isArray(callIds) ? [...callIds] : []
  return ids
    .map((callId) => ({ callId, rank: assignmentRank(state.seed, callId) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map((x) => x.callId)
}

/**
 * Lecture des métriques de file d'un appel (section III.7, cahier L383 A6 :
 * « temps en file et temps actif [...] enregistrés séparément »). DEUX champs
 * distincts, jamais fusionnés : `timeInQueue = admittedAt - queuedAt`,
 * `timeActive = releasedAt - admittedAt`, chacun `null` tant que l'événement
 * correspondant ne s'est pas produit.
 */
export async function getCallTimings(handle: QueueHandle, callId: string): Promise<CallTimings> {
  const state = stateOf(handle)
  const id = requireNonEmptyString(callId, 'getCallTimings.callId')
  const record = state.calls.get(id)
  if (record === undefined) {
    throw new ContractViolation('TYPE_MISMATCH', 'getCallTimings.callId', `aucun appel enregistré sous ${id}`)
  }

  const timeInQueue = record.admittedAt !== null ? record.admittedAt - record.queuedAt : null
  const timeActive =
    record.admittedAt !== null && record.releasedAt !== null ? record.releasedAt - record.admittedAt : null

  return {
    queuedAt: record.queuedAt,
    admittedAt: record.admittedAt,
    releasedAt: record.releasedAt,
    timeInQueue,
    timeActive,
  }
}

/**
 * Ferme la file d'admission (section III.8, optionnel comme
 * `closeLeaseAuthority` de T25). Aucune ressource externe à libérer (cf.
 * en-tête) : les Maps internes sont simplement vidées.
 */
export async function closeAdmissionQueue(handle: QueueHandle): Promise<void> {
  const state = stateOf(handle)
  state.providers.clear()
  state.calls.clear()
}

/* ───────────────── additifs internes, utilisés par packages/gateway pour
 * appliquer LE MÊME état de recul fournisseur sans dupliquer une seconde
 * source de vérité (cf. en-tête, même geste que isLeaseAdmitted/
 * assertLeaseAdmitted de T25). Ces exports ne sont PAS des rôles de la suite
 * (absents de ROLES, acceptance/T26.spec.ts) : `submitReadyCall`/
 * `releaseCall`/`pumpAdmission` ci-dessus lisent et écrivent ce MÊME état en
 * interne (`isWithinBackoff`), et `packages/gateway/src/provider-backoff.ts`
 * le lit/l'écrit par ces deux fonctions. */

/** Enregistre qu'à l'instant `now`, `providerId` est en recul jusqu'à
 * `admissibleAgainAt` (exclu, cf. `isWithinBackoff`) — ce que
 * `recordProviderBackoff` (packages/gateway, section III.9) calcule et
 * appelle. Ne lève jamais sur un `providerId` encore inconnu : un recul peut
 * être signalé avant toute soumission pour ce fournisseur. */
export function setProviderBackoffUntil(handle: unknown, providerId: string, admissibleAgainAt: number): void {
  const state = stateOf(handle)
  const provider = providerStateOf(state, providerId)
  provider.backoffUntil = admissibleAgainAt
}

/** `providerId` est-il, à l'instant `now`, encore en recul ? Ce que
 * `isProviderAdmissible` (packages/gateway, section III.10) inverse pour
 * rendre son booléen. Un `providerId` jamais vu n'est jamais en recul. */
export function isProviderBackedOff(handle: unknown, providerId: string, now: number): boolean {
  const state = stateOf(handle)
  const provider = state.providers.get(providerId)
  if (provider === undefined) return false
  return isWithinBackoff(provider, now)
}
