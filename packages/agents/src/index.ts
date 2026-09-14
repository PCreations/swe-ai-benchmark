// ─────────────────────────────────────────────────────────────────────────────
// @bench/agents — contrat AgentRunner avec un agent scripte (cahier L307-L316,
// tache T18).
//
// CE QUE CE PAQUET AJOUTE, ET SUR QUOI IL S'APPUIE. T18 depend de T03, T06,
// T15, T17 (verification/tasks.json) ; source_paths ne nomme que
// `packages/agents`. A l'etage VERT, ce fichier importe reellement
// `isCentralStore` de `@bench/storage` (T12 — le repository que `start`,
// `observe`, `submit`, `stop`, `resume`, `getSessionEvents` et
// `getSubmissions` recoivent en premier argument) et `answerCustomerQuestion`
// de `@bench/scenario` (T06 — le chemin d'acces au service client qu'ASK_CLIENT
// ouvre, section III.2/A6 de acceptance/T18.spec.ts : « le runner resout
// LUI-MEME answerCustomerQuestion(pack, period_index, question) »). Il
// n'importe PAS `@bench/billing` ni `@bench/gateway` : L313.A5 exige qu'une
// reponse invalide « conserve la depense deja engagee », et la maniere la
// plus sure de garantir cette absence de mutation est de ne JAMAIS toucher au
// budget depuis ce paquet — dispatchModelCall (T17) reste le seul chemin qui
// regle une reservation.
//
// DEUX REGISTRES, POUR DEUX NATURES DE DONNEES. Le schema central
// (`packages/storage/migrations/0004_agent_runs.sql`, NOUVEAU FICHIER) porte
// ce qui doit survivre a un `resume` sur une session DIFFERENTE (la memoire
// AUTORISEE ecrite par REMEMBER, A2) et ce qui doit rester lisible pour
// l'audit apres coup (le journal brut d'evenements, A7 ; les Submissions
// persistees, A4/A7). Le script de l'agent (`Agent.steps`), le fournisseur
// factice et le pack du service client sont des valeurs JS NON SERIALISABLES
// (des fonctions) recues a `start`/`resume` : elles vivent dans `RUNTIME`, un
// registre en memoire du processus — voir `packages/agents/src/psql.ts` pour
// la justification complete de cette separation.
//
// operation_sequence (L78) EST LE RANG FIXE DE L'ETAPE DANS LE SCRIPT
// (`cursor + 1`), jamais un horodatage ni un identifiant genere ailleurs :
// c'est ce qui rend A1 deterministe entre deux executions independantes du
// meme script (verification/mutants/T18.json, T18.M1).
//
// LA SUBMISSION NE PORTE PAS `session_id`. La suite d'acceptation (§III.4)
// decrit `{ session_id, claimed_requirements, artifact_fingerprint, attempt,
// status }`, mais A1 compare par egalite textuelle (`rendu`) deux Submissions
// issues de DEUX SESSIONS DISTINCTES (deux `session_id` differents, generes
// par l'appelant) pour le MEME script — l'assertion decisive de l'invariance
// que L15 exige (« memes appels logiques »). Un champ `session_id` VARIABLE
// romprait cette egalite pour toute implementation, correcte ou non ; la
// Submission ne porte donc que ce que le script determine
// (`claimed_requirements`, `artifact_fingerprint`, `attempt`, `status`) —
// l'identite de la session reste recuperable par construction (c'est la cle
// de `getSubmissions(handle, session_id)`), sans etre un champ de la valeur
// elle-meme.
// ─────────────────────────────────────────────────────────────────────────────

import { isCentralStore } from '@bench/storage'
import { answerCustomerQuestion } from '@bench/scenario'
import type { ScenarioPack } from '@bench/scenario'
import { AgentsRefusal } from './errors.js'
import { runScript } from './psql.js'
import type { ScriptResult } from './psql.js'

export { AGENTS_REFUSAL_CODES, AgentsRefusal, isAgentsRefusal } from './errors.js'
export type { AgentsRefusalCode } from './errors.js'

/** Un patch temoin applique par l'agent (section III.1, L311). */
export interface ScriptStepApplyPatch {
  readonly kind: 'APPLY_PATCH'
  readonly path: string
  readonly content: string
}

/** Consomme la PROCHAINE reponse archivee du fournisseur factice. */
export interface ScriptStepModelCall {
  readonly kind: 'MODEL_CALL'
}

/** Interroge le service client via le tools autorise (section III.1, L313.A6). */
export interface ScriptStepAskClient {
  readonly kind: 'ASK_CLIENT'
  readonly question: string
}

/** Ecrit la memoire AUTORISEE (section III.1, L313.A2). */
export interface ScriptStepRemember {
  readonly kind: 'REMEMBER'
  readonly key: string
  readonly value: unknown
}

/** Un evenement de session EMIS PAR L'AGENT (section III.1, L313.A7). */
export interface ScriptStepSelfReport {
  readonly kind: 'SELF_REPORT'
  readonly accepted: boolean
}

/** Etape terminale : produit une soumission (section III.1, L311). */
export interface ScriptStepSubmit {
  readonly kind: 'SUBMIT'
  readonly claimed_requirements: unknown
  readonly artifact_fingerprint: unknown
}

export type ScriptStep =
  | ScriptStepApplyPatch
  | ScriptStepModelCall
  | ScriptStepAskClient
  | ScriptStepRemember
  | ScriptStepSelfReport
  | ScriptStepSubmit

/** Agent scripte : opaque, pur (aucune E/S), section III.1. */
export interface Agent {
  readonly steps: readonly ScriptStep[]
}

/** Fournisseur de modele scripte — la forme minimale que `observe` exerce. */
export interface AgentModelProvider {
  complete(request: unknown): Promise<unknown>
}

/** AgentRun (section III.2, L84-95). */
export interface AgentRunParams {
  readonly session_id: string
  readonly agent: Agent
  readonly workspace: unknown
  readonly facts: unknown
  readonly tools?: { readonly clientService?: { readonly pack: unknown } }
  readonly limits?: unknown
  readonly period_index: number
  readonly memory_scope: string
  readonly budget_id?: string
  readonly modelProvider?: AgentModelProvider
}

/** Ce que l'agent voit — jamais d'historique conversationnel brut (A3). */
export interface AgentContext {
  readonly workspace: unknown
  readonly facts: unknown
  readonly memory: Record<string, unknown>
}

/** Ce que rendent `start`/`resume` (section III.2, III.6). */
export interface AgentRunHandle {
  readonly session_id: string
  readonly context: AgentContext
}

/** Une action rendue par `observe` (section III.3). */
export interface AgentAction {
  readonly operation_sequence: number
  readonly kind: ScriptStep['kind']
  readonly [key: string]: unknown
}

/** Ce que rend `observe` (section III.3). */
export interface ObserveResult {
  readonly done: boolean
  readonly actions: readonly AgentAction[]
}

/**
 * Submission persistee (section III.4, L84-95). Ne porte PAS `session_id` —
 * voir l'en-tete du fichier : c'est ce qui rend A1 comparable entre deux
 * sessions distinctes du meme script.
 */
export interface Submission {
  readonly claimed_requirements: unknown
  readonly artifact_fingerprint: unknown
  readonly attempt: number
  readonly status: string
  readonly accepted?: boolean
  readonly validation_result?: unknown
}

/** Un evenement du journal brut de session (section III.7). */
export interface AgentEvent {
  readonly operation_sequence: number
  readonly kind: ScriptStep['kind']
  readonly [key: string]: unknown
}

/* ─────────────────────────────────────────────────────────────── validation */

function requireNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new AgentsRefusal('INVALID_PARAMETER', `${path} : chaîne non vide attendue`)
  }
  return v
}

function requirePositiveInteger(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new AgentsRefusal('INVALID_PARAMETER', `${path} : entier >= 1 attendu`)
  }
  return v
}

function dsnOf(handle: unknown): string {
  if (!isCentralStore(handle)) {
    throw new AgentsRefusal(
      'STORAGE_UNAVAILABLE',
      'le premier argument doit être un repository rendu par openStore (@bench/storage)',
    )
  }
  if (handle.closed) {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', 'repository déjà fermé')
  }
  return handle.dsn
}

function outcomeOf(r: ScriptResult, role: string): string {
  if (!r.ok || r.payload === null) {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `${role} : ${r.error || 'résultat illisible'}`)
  }
  const outcome = r.payload['outcome']
  if (typeof outcome !== 'string') {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `${role} : issue sans 'outcome' (${JSON.stringify(r.payload)})`)
  }
  return outcome
}

function detailOf(r: ScriptResult): string {
  const d = r.payload?.['detail']
  return typeof d === 'string' ? d : ''
}

/** Rend une valeur sérialisable en `jsonb` : une `Error` (refus T06 capturé)
 * devient un objet plat, tout le reste passe tel quel. */
function toJsonSafe(v: unknown): unknown {
  if (v instanceof Error) {
    const code = (v as unknown as { code?: unknown }).code
    return {
      name: v.name,
      ...(typeof code === 'string' ? { code } : {}),
      message: v.message,
    }
  }
  return v
}

/* ──────────────────────────────────────────────────────── registre en memoire */

interface SessionRuntime {
  readonly memoryScope: string
  readonly periodIndex: number
  status: 'RUNNING' | 'STOPPED'
  done: boolean
  cursor: number
  readonly steps: readonly ScriptStep[]
  readonly modelProvider: AgentModelProvider | undefined
  readonly clientPack: unknown
  readonly workspace: unknown
  readonly facts: unknown
  submitStep: ScriptStepSubmit | undefined
}

const RUNTIME = new Map<string, SessionRuntime>()

function requireRuntime(sessionId: string): SessionRuntime {
  const rt = RUNTIME.get(sessionId)
  if (rt === undefined) {
    throw new AgentsRefusal('SESSION_NOT_FOUND', `aucune session ouverte par start/resume sous ${sessionId}`)
  }
  return rt
}

/* ────────────────────────────────────────────────────────────── acces DB : memoire */

async function insertMemory(
  dsn: string,
  memoryScope: string,
  sessionId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const r = await runScript(
    dsn,
    { memory_scope: memoryScope, session_id: sessionId, key, value },
    `
DO $bench$
DECLARE
  p jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  INSERT INTO agent_memory (memory_scope, session_id, key, value)
    VALUES (p->>'memory_scope', p->>'session_id', p->>'key', p->'value');
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'REMEMBER')
  if (outcome !== 'OK') {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `écriture REMEMBER : ${detailOf(r) || outcome}`)
  }
}

/** Dernieres ecritures REMEMBER par cle, pour le `memory_scope` demande (A2). */
async function readMemoryObject(dsn: string, memoryScope: string): Promise<Record<string, unknown>> {
  const r = await runScript(
    dsn,
    { memory_scope: memoryScope },
    `
DO $bench$
DECLARE
  p   jsonb;
  obj jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO obj
  FROM (
    SELECT DISTINCT ON (key) key, value
    FROM agent_memory
    WHERE memory_scope = p->>'memory_scope'
    ORDER BY key, id DESC
  ) t;
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK', 'memory', obj));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'resume(memory)')
  if (outcome !== 'OK') {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `lecture mémoire : ${detailOf(r) || outcome}`)
  }
  const memory = (r.payload as Record<string, unknown>)['memory']
  return memory !== null && typeof memory === 'object' ? (memory as Record<string, unknown>) : {}
}

/* ──────────────────────────────────────────────────────── acces DB : evenements */

async function insertEvent(dsn: string, sessionId: string, action: AgentAction): Promise<void> {
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(action)) payload[k] = toJsonSafe(v)
  const r = await runScript(
    dsn,
    { session_id: sessionId, operation_sequence: action.operation_sequence, kind: action.kind, payload },
    `
DO $bench$
DECLARE
  p jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  INSERT INTO agent_session_events (session_id, operation_sequence, kind, payload)
    VALUES (p->>'session_id', (p->>'operation_sequence')::int, p->>'kind', p->'payload');
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'journal de session')
  if (outcome !== 'OK') {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `écriture du journal de session : ${detailOf(r) || outcome}`)
  }
}

async function readEventsList(dsn: string, sessionId: string): Promise<AgentEvent[]> {
  const r = await runScript(
    dsn,
    { session_id: sessionId },
    `
DO $bench$
DECLARE
  p   jsonb;
  arr jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  SELECT COALESCE(jsonb_agg(payload ORDER BY id), '[]'::jsonb) INTO arr
  FROM agent_session_events WHERE session_id = p->>'session_id';
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK', 'events', arr));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'getSessionEvents')
  if (outcome !== 'OK') {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `lecture du journal de session : ${detailOf(r) || outcome}`)
  }
  const events = (r.payload as Record<string, unknown>)['events']
  return Array.isArray(events) ? (events as AgentEvent[]) : []
}

/* ──────────────────────────────────────────────────────── acces DB : submissions */

interface SubmissionRow {
  readonly claimed_requirements: unknown
  readonly artifact_fingerprint: unknown
  readonly attempt: number
  readonly status: string
}

async function insertSubmissionRow(dsn: string, sessionId: string, row: SubmissionRow): Promise<void> {
  const r = await runScript(
    dsn,
    {
      session_id: sessionId,
      claimed_requirements: row.claimed_requirements,
      artifact_fingerprint: row.artifact_fingerprint,
      attempt: row.attempt,
      status: row.status,
    },
    `
DO $bench$
DECLARE
  p jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  INSERT INTO agent_submissions (session_id, claimed_requirements, artifact_fingerprint, attempt, status)
    VALUES (p->>'session_id', p->'claimed_requirements', p->'artifact_fingerprint', (p->>'attempt')::int, p->>'status');
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'submit')
  if (outcome !== 'OK') {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `persistance de la soumission : ${detailOf(r) || outcome}`)
  }
}

async function readSubmissionsList(dsn: string, sessionId: string): Promise<Submission[]> {
  const r = await runScript(
    dsn,
    { session_id: sessionId },
    `
DO $bench$
DECLARE
  p   jsonb;
  arr jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'claimed_requirements', claimed_requirements,
      'artifact_fingerprint', artifact_fingerprint,
      'attempt', attempt,
      'status', status
    ) ORDER BY id), '[]'::jsonb) INTO arr
  FROM agent_submissions WHERE session_id = p->>'session_id';
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'OK', 'submissions', arr));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'ERROR', 'detail', SQLERRM));
END
$bench$;`,
  )
  const outcome = outcomeOf(r, 'getSubmissions')
  if (outcome !== 'OK') {
    throw new AgentsRefusal('STORAGE_UNAVAILABLE', `lecture des soumissions : ${detailOf(r) || outcome}`)
  }
  const submissions = (r.payload as Record<string, unknown>)['submissions']
  return Array.isArray(submissions) ? (submissions as Submission[]) : []
}

/* ───────────────────────────────────────────────────────────────── T18.1 */

/**
 * Cree un agent scripte, opaque et pur — aucune E/S (section III.1, L311).
 */
export function createScriptedAgent(steps: readonly ScriptStep[]): Agent {
  if (!Array.isArray(steps)) {
    throw new AgentsRefusal('INVALID_PARAMETER', 'createScriptedAgent.steps : tableau attendu')
  }
  return { steps: [...steps] }
}

/* ───────────────────────────────────────────────────────────────── T18.2/6 */

function openRuntime(handle: unknown, params: AgentRunParams, memory: Record<string, unknown>): AgentRunHandle {
  dsnOf(handle) // valide le repository, meme si cet appel precis n'y ecrit rien
  const sessionId = requireNonEmptyString(params.session_id, 'session_id')
  const agent = params.agent
  if (agent === null || agent === undefined || !Array.isArray(agent.steps)) {
    throw new AgentsRefusal('INVALID_PARAMETER', 'agent : Agent attendu (créé par createScriptedAgent)')
  }
  const memoryScope = requireNonEmptyString(params.memory_scope, 'memory_scope')
  const periodIndex = requirePositiveInteger(params.period_index, 'period_index')

  RUNTIME.set(sessionId, {
    memoryScope,
    periodIndex,
    status: 'RUNNING',
    done: false,
    cursor: 0,
    steps: agent.steps,
    modelProvider: params.modelProvider,
    clientPack: params.tools?.clientService?.pack,
    workspace: params.workspace,
    facts: params.facts,
    submitStep: undefined,
  })

  return {
    session_id: sessionId,
    context: { workspace: params.workspace, facts: params.facts, memory },
  }
}

/**
 * Ouvre une session neuve (AgentRun, L84-95). `context.memory` est
 * TOUJOURS vide sur un `start` frais (A2) ; `context` ne porte jamais
 * d'historique conversationnel brut d'une periode anterieure (A3).
 */
export function start(handle: unknown, params: AgentRunParams): Promise<AgentRunHandle> {
  return Promise.resolve(openRuntime(handle, params, {}))
}

/**
 * Reouvre une session sur le meme `memory_scope` : `context.memory` est
 * reconstruite a partir des dernieres ecritures REMEMBER de toute session
 * anterieure partageant ce scope (derniere valeur par cle) — vide sur un
 * scope neuf (section III.6, A2).
 */
export async function resume(handle: unknown, params: AgentRunParams): Promise<AgentRunHandle> {
  const dsn = dsnOf(handle)
  const memoryScope = requireNonEmptyString(params.memory_scope, 'memory_scope')
  const memory = await readMemoryObject(dsn, memoryScope)
  return openRuntime(handle, params, memory)
}

/* ───────────────────────────────────────────────────────────────── T18.3 */

function extractResponseText(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw
  if (raw !== null && typeof raw === 'object') {
    const t = (raw as { text?: unknown }).text
    return typeof t === 'string' ? t : undefined
  }
  return undefined
}

/**
 * Consomme la prochaine etape non consommee et rend `{ done, actions }`
 * (section III.3). Chaque action porte `operation_sequence` deterministe
 * (L78, A1).
 */
export async function observe(handle: unknown, session_id: string): Promise<ObserveResult> {
  const dsn = dsnOf(handle)
  const rt = requireRuntime(session_id)

  if (rt.status === 'STOPPED' || rt.done) {
    return { done: true, actions: [] }
  }
  if (rt.cursor >= rt.steps.length) {
    rt.done = true
    return { done: true, actions: [] }
  }

  const step = rt.steps[rt.cursor] as ScriptStep
  const operation_sequence = rt.cursor + 1

  switch (step.kind) {
    case 'APPLY_PATCH': {
      const action: AgentAction = {
        operation_sequence,
        kind: 'APPLY_PATCH',
        path: step.path,
        content: step.content,
      }
      rt.cursor += 1
      await insertEvent(dsn, session_id, action)
      return { done: false, actions: [action] }
    }

    case 'MODEL_CALL': {
      if (rt.modelProvider === undefined) {
        throw new AgentsRefusal(
          'INVALID_PARAMETER',
          `étape MODEL_CALL (opération ${operation_sequence}) sans modelProvider fourni à start/resume`,
        )
      }
      const raw = await rt.modelProvider.complete({
        session_id,
        period_index: rt.periodIndex,
        operation_sequence,
      })
      const text = extractResponseText(raw)
      if (typeof text !== 'string' || text.length === 0) {
        // A5 : rejet typé, budget NON touché (ce paquet ne touche jamais au
        // budget — voir l'en-tête du fichier), curseur NON avancé.
        throw new AgentsRefusal(
          'INVALID_MODEL_RESPONSE',
          `réponse modèle vide ou absente à l'opération ${operation_sequence} de la session ${session_id}`,
        )
      }
      const action: AgentAction = {
        operation_sequence,
        kind: 'MODEL_CALL',
        response: { text },
      }
      rt.cursor += 1
      await insertEvent(dsn, session_id, action)
      return { done: false, actions: [action] }
    }

    case 'ASK_CLIENT': {
      let ok: boolean
      let result: unknown
      try {
        result = answerCustomerQuestion(rt.clientPack as ScenarioPack, rt.periodIndex, step.question)
        ok = true
      } catch (e) {
        ok = false
        result = e
      }
      const action: AgentAction = {
        operation_sequence,
        kind: 'ASK_CLIENT',
        question: step.question,
        ok,
        result,
      }
      rt.cursor += 1
      await insertEvent(dsn, session_id, action)
      return { done: false, actions: [action] }
    }

    case 'REMEMBER': {
      await insertMemory(dsn, rt.memoryScope, session_id, step.key, step.value)
      const action: AgentAction = {
        operation_sequence,
        kind: 'REMEMBER',
        key: step.key,
        value: step.value,
      }
      rt.cursor += 1
      await insertEvent(dsn, session_id, action)
      return { done: false, actions: [action] }
    }

    case 'SELF_REPORT': {
      // A7 : enregistré pour l'audit, mais SANS AUCUNE autorité sur `submit`.
      const action: AgentAction = {
        operation_sequence,
        kind: 'SELF_REPORT',
        accepted: step.accepted,
      }
      rt.cursor += 1
      await insertEvent(dsn, session_id, action)
      return { done: false, actions: [action] }
    }

    case 'SUBMIT': {
      rt.submitStep = step
      rt.cursor += 1
      rt.done = true
      const action: AgentAction = { operation_sequence, kind: 'SUBMIT' }
      // Le journal d'audit garde aussi ce que l'etape portait, sans que
      // l'ACTION rendue a l'appelant ne l'expose (section III.3 : « SUBMIT ->
      // { operation_sequence, kind:'SUBMIT' } » — la Submission elle-meme
      // n'est persistee que par `submit()`).
      await insertEvent(dsn, session_id, {
        ...action,
        claimed_requirements: step.claimed_requirements,
        artifact_fingerprint: step.artifact_fingerprint,
      })
      return { done: true, actions: [action] }
    }

    default: {
      const unknownKind: string = (step as { kind: string }).kind
      throw new AgentsRefusal('INVALID_PARAMETER', `ScriptStep.kind inconnu : ${unknownKind}`)
    }
  }
}

/* ───────────────────────────────────────────────────────────────── T18.4 */

/**
 * Persiste et rend la Submission si l'etape SUBMIT a ete atteinte et que la
 * session n'est pas arretee ; `null` sinon (section III.4). Jamais
 * `status:'ACCEPTED'` ni `accepted:true` sur la seule foi d'un `SELF_REPORT`
 * (A7) — ce point n'est meme pas lu ici.
 */
export async function submit(handle: unknown, session_id: string): Promise<Submission | null> {
  const dsn = dsnOf(handle)
  const rt = requireRuntime(session_id)

  if (rt.status === 'STOPPED') return null
  if (rt.submitStep === undefined) return null

  const existing = await readSubmissionsList(dsn, session_id)
  const row: SubmissionRow = {
    claimed_requirements: rt.submitStep.claimed_requirements,
    artifact_fingerprint: rt.submitStep.artifact_fingerprint,
    attempt: existing.length + 1,
    status: 'PENDING_VALIDATION',
  }
  await insertSubmissionRow(dsn, session_id, row)
  return { ...row }
}

/* ───────────────────────────────────────────────────────────────── T18.5 */

/** Arrete la session ; idempotent (section III.5). */
export function stop(handle: unknown, session_id: string): Promise<void> {
  dsnOf(handle)
  const rt = RUNTIME.get(session_id)
  if (rt !== undefined) rt.status = 'STOPPED'
  return Promise.resolve()
}

/* ───────────────────────────────────────────────────────────────── T18.7/8 */

/** Journal brut, dans l'ordre, de toutes les actions (section III.7). */
export async function getSessionEvents(handle: unknown, session_id: string): Promise<readonly AgentEvent[]> {
  const dsn = dsnOf(handle)
  return readEventsList(dsn, session_id)
}

/** Submissions persistees pour cette session (section III.8). */
export async function getSubmissions(handle: unknown, session_id: string): Promise<readonly Submission[]> {
  const dsn = dsnOf(handle)
  return readSubmissionsList(dsn, session_id)
}
