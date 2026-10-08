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
// n'importe PAS `@bench/billing` : L313.A5 exige qu'une reponse invalide
// « conserve la depense deja engagee », et la maniere la plus sure de
// garantir cette absence de mutation est de ne JAMAIS toucher au budget
// depuis la surface AgentRunner de T18 — dispatchModelCall (T17) reste le
// seul chemin qui regle une reservation. La section T28 plus bas IMPORTE
// `dispatchModelCall` de `@bench/gateway` (et seulement cet export) : c'est
// exactement le meme chemin, jamais recontourne (voir son en-tete).
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

import * as http from 'node:http'
import * as https from 'node:https'
import { spawn } from 'node:child_process'
import { isCentralStore } from '@bench/storage'
import { answerCustomerQuestion } from '@bench/scenario'
import type { ScenarioPack } from '@bench/scenario'
import { dispatchModelCall } from '@bench/gateway'
import type { DispatchModelCallResult } from '@bench/gateway'
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

/* ═══════════════════════════════════════════════════════════════════════════
 * T28 — connecteur Anthropic Messages reel (cahier L395-L404).
 *
 * ETAGE VERT. Les cinq roles ci-dessous sont IMPLEMENTES. Noms et formes
 * FIXES PAR `acceptance/T28.spec.ts` (section III de son en-tete) — le
 * cahier ne nomme aucun export pour ce connecteur, exactement comme T18 et
 * T19 avant lui. Noms primaires sans alias.
 *
 *   createAnthropicMessagesProvider(config) -> AnthropicProvider
 *   normalizeAnthropicUsage(rawUsage)       -> NormalizedAnthropicUsage  (PURE)
 *   validateAndNormalizeToolCall(toolDefs, block) -> ValidatedToolCall   (PURE)
 *   executeToolInSandbox(sandboxHandle, name, args) -> Promise<ToolExecutionResult>
 *   dispatchAnthropicModelCall(handle, params, hooks?) -> Promise<DispatchAnthropicModelCallResult>
 *
 * UNE SEULE REQUETE HTTP, JAMAIS UNE RELANCE SILENCIEUSE (L399, section
 * III.1). `createAnthropicMessagesProvider(...).complete()` emet UN `POST
 * <baseURL>/v1/messages` via `node:http`/`node:https` (choisi par le
 * protocole de `baseURL`, jamais un client tiers) et CLASSE la reponse :
 * 429 -> `RATE_LIMITED`, 401/403 -> `AUTHENTICATION_ERROR`, corps tronque au
 * niveau transport (deconnexion avant reception complete, independamment du
 * code HTTP) -> `TRUNCATED_RESPONSE`. Aucune de ces trois classes n'est
 * absorbee par une politique de retry : chacune est un REFUS type, rendu a
 * l'appelant (section III.1, A5).
 *
 * LA TRONCATURE SE DETECTE AU TRANSPORT, PAS AU CODE HTTP. Le serveur factice
 * d'A5 annonce un `content-length` COMPLET puis detruit la socket apres un
 * PREFIXE du corps : Node emet alors `aborted` sur la reponse (jamais `end`)
 * — c'est ce signal, et lui seul, qui distingue un corps tronque d'une fin de
 * reponse normale ; un JSON.parse qui echouerait sur un corps vide/partiel
 * est traite de la meme facon, en aval.
 *
 * `dispatchAnthropicModelCall` DELEGUE A `dispatchModelCall` DE
 * `@bench/gateway` (T17, meme journal durable) — c'est le SEUL export de
 * `@bench/gateway` que ce fichier importe. `dispatchModelCall` attend un
 * `provider.complete(request) -> {text, usage}` (sa forme historique, celle
 * du fournisseur factice de T17) ; comme l'`AnthropicProvider` reel rend
 * `{content[], stop_reason, usage}`, un adaptateur local traduit l'un vers
 * l'autre a l'INTERIEUR de `dispatchAnthropicModelCall`, SANS jamais appeler
 * `provider.complete()` par un autre chemin (T28.M6 : court-circuiter cette
 * delegation ferait perdre DISPATCH_STARTED, les hooks et la reprise
 * idempotente que T17 a deja prouves).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Configuration du connecteur — SANS IDENTIFIANT INVENTE (L397, section III.1). */
export interface AnthropicProviderConfig {
  readonly baseURL: string
  readonly apiKey: string
  readonly model: string
  readonly maxTokens: number
}

/** Bloc de contenu du Messages API (L658, section III.1). */
export type AnthropicContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: unknown }
  | {
      readonly type: 'tool_result'
      readonly tool_use_id: string
      readonly content: string
      readonly is_error?: boolean
    }

/** Les trois `ToolDef` que L399 nomme (lecture/ecriture/execution), section III.4. */
export interface AnthropicToolDef {
  readonly name: string
  readonly description: string
  readonly input_schema: {
    readonly type: 'object'
    readonly properties: Record<string, { readonly type: string }>
    readonly required: readonly string[]
  }
}

/** Requete envoyee par `AnthropicProvider.complete` (section III.1). */
export interface AnthropicCompletionRequest {
  readonly messages: ReadonlyArray<{
    readonly role: 'user' | 'assistant'
    readonly content: readonly AnthropicContentBlock[]
  }>
  readonly tools?: readonly AnthropicToolDef[]
  readonly system?: string
}

/** Usage normalise — jamais une recopie directe du corps brut (section III.2). */
export interface NormalizedAnthropicUsage {
  readonly input_uncached_tokens: number
  readonly input_cached_tokens: number
  readonly output_tokens: number
}

/** Reponse rendue par `AnthropicProvider.complete` (section III.1). */
export interface AnthropicCompletionResponse {
  readonly content: readonly AnthropicContentBlock[]
  readonly stop_reason: string
  readonly usage: NormalizedAnthropicUsage
}

/** Connecteur rendu par `createAnthropicMessagesProvider` (section III.1). */
export interface AnthropicProvider {
  complete(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse>
}

/** Appel d'outil valide et normalise, rendu par `validateAndNormalizeToolCall`. */
export interface ValidatedAnthropicToolCall {
  readonly name: string
  readonly args: unknown
}

/** Le sous-ensemble du `SandboxHandle` (T19) que `executeToolInSandbox` consomme. */
export interface AnthropicSandboxExecHandle {
  execShell(
    command: string,
    opts?: { readonly timeoutMs?: number },
  ): Promise<{
    readonly exitCode: number
    readonly stdout: string
    readonly stderr: string
    readonly terminated: boolean
    readonly terminationReason: string | null
  }>
}

/** Rendu de `executeToolInSandbox` — jamais de throw, `is_error` porte l'echec (section III.4). */
export interface AnthropicToolExecutionResult {
  readonly content: string
  readonly is_error: boolean
}

/** Points d'injection de `dispatchModelCall` (T17), repris tels quels (section III.5). */
export interface DispatchAnthropicModelCallHooks {
  readonly beforeDispatchStarted?: () => void
  readonly afterDispatchStarted?: () => void
  readonly afterProviderResponse?: () => void
}

/** Parametres de `dispatchAnthropicModelCall` — meme forme que T17 (section III.5). */
export interface DispatchAnthropicModelCallParams {
  readonly model_call_id: string
  readonly idempotency_key: string
  readonly budget_id: string
  readonly reservation_id: string
  readonly provider: AnthropicProvider
  readonly request: AnthropicCompletionRequest
  readonly tariff: unknown
}

/** Ce que rend `dispatchAnthropicModelCall`, premier envoi ou reprise. */
export interface DispatchAnthropicModelCallResult {
  readonly model_call_id: string
  readonly status: string
  readonly cost?: string
  readonly usage?: NormalizedAnthropicUsage
  readonly response?: unknown
}

/* ───────────────────────────────────────────────────────── T28.1 : transport */

interface RawAnthropicHttpResponse {
  readonly statusCode: number
  readonly bodyText: string
  readonly truncated: boolean
}

/**
 * Emet UNE requete HTTP `POST <baseURL>/v1/messages`. Ne relance JAMAIS : la
 * classification des statuts et des corps tronques est a la charge de
 * l'appelant (`complete`, ci-dessous) — ce point n'absorbe rien.
 */
function postAnthropicMessages(
  baseURL: string,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<RawAnthropicHttpResponse> {
  return new Promise((resolve, reject) => {
    let target: URL
    try {
      target = new URL('/v1/messages', baseURL)
    } catch (e) {
      reject(new AgentsRefusal('INVALID_PARAMETER', `baseURL invalide : ${(e as Error).message}`))
      return
    }
    const mod = target.protocol === 'https:' ? https : http
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    const req = mod.request(
      target,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
          'x-api-key': apiKey,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        // Fin NORMALE : tout le corps declare a ete recu.
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString('utf8'), truncated: false })
        })
        // `aborted` : la connexion a ete fermee AVANT `end` — le signal de
        // troncature au niveau transport (independant du code HTTP recu).
        res.on('aborted', () => {
          resolve({ statusCode: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString('utf8'), truncated: true })
        })
        res.on('error', () => {
          resolve({ statusCode: res.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString('utf8'), truncated: true })
        })
      },
    )
    req.on('error', (e) => {
      reject(
        new AgentsRefusal(
          'PROVIDER_UNAVAILABLE',
          `connexion au fournisseur Anthropic impossible (${target.toString()}) : ${(e as Error).message}`,
        ),
      )
    })
    req.write(body)
    req.end()
  })
}

/**
 * Construit le connecteur Anthropic Messages reel (section III.1). `model` et
 * `max_tokens` transmis sur le fil sont EXACTEMENT ceux de `config` — jamais
 * un identifiant invente ou une valeur par defaut codee en dur (L397).
 */
export function createAnthropicMessagesProvider(config: AnthropicProviderConfig): AnthropicProvider {
  const { baseURL, apiKey, model, maxTokens } = config

  return {
    async complete(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse> {
      const payload: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: request.messages,
      }
      if (request.tools !== undefined) payload['tools'] = request.tools
      if (request.system !== undefined) payload['system'] = request.system

      const raw = await postAnthropicMessages(baseURL, apiKey, payload)

      if (raw.truncated) {
        throw new AgentsRefusal(
          'TRUNCATED_RESPONSE',
          'corps de reponse tronque avant reception complete (connexion fermee avant la fin annoncee)',
        )
      }
      if (raw.statusCode === 429) {
        throw new AgentsRefusal('RATE_LIMITED', 'HTTP 429 recu du fournisseur Anthropic')
      }
      if (raw.statusCode === 401 || raw.statusCode === 403) {
        throw new AgentsRefusal('AUTHENTICATION_ERROR', `HTTP ${raw.statusCode} recu du fournisseur Anthropic`)
      }
      if (raw.statusCode < 200 || raw.statusCode >= 300) {
        throw new AgentsRefusal('PROVIDER_ERROR', `HTTP ${raw.statusCode} inattendu du fournisseur Anthropic`)
      }

      let parsed: unknown
      try {
        parsed = raw.bodyText.length > 0 ? JSON.parse(raw.bodyText) : {}
      } catch {
        // Un 200 dont le corps ne parse pas est, par construction, un corps
        // recu incomplet : meme classe que la troncature detectee au transport.
        throw new AgentsRefusal('TRUNCATED_RESPONSE', 'corps de reponse illisible (JSON invalide ou incomplet)')
      }

      const body = (parsed !== null && typeof parsed === 'object' ? parsed : {}) as {
        readonly content?: unknown
        readonly stop_reason?: unknown
        readonly usage?: unknown
      }
      const content = Array.isArray(body.content) ? (body.content as readonly AnthropicContentBlock[]) : []
      const stopReason = typeof body.stop_reason === 'string' ? body.stop_reason : 'end_turn'
      const usage = normalizeAnthropicUsage(body.usage)

      return { content, stop_reason: stopReason, usage }
    },
  }
}

/* ───────────────────────────────────────────────────────── T28.2 : usage */

function toNonNegativeInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.trunc(v)
  return 0
}

/**
 * Normalise l'usage brut du Messages API — PURE, aucune E/S (section III.2).
 * `input_cached_tokens` SOMME les deux compteurs de cache reels du fournisseur
 * (`cache_creation_input_tokens` + `cache_read_input_tokens`) : lire un seul
 * des deux sous-compterait le cache (cahier:L103, F-MONEY, regle 2).
 */
export function normalizeAnthropicUsage(rawUsage: unknown): NormalizedAnthropicUsage {
  const raw = (rawUsage !== null && typeof rawUsage === 'object' ? rawUsage : {}) as Record<string, unknown>
  const inputUncachedTokens = toNonNegativeInt(raw['input_tokens'])
  const cacheCreation = toNonNegativeInt(raw['cache_creation_input_tokens'])
  const cacheRead = toNonNegativeInt(raw['cache_read_input_tokens'])
  const outputTokens = toNonNegativeInt(raw['output_tokens'])
  return {
    input_uncached_tokens: inputUncachedTokens,
    input_cached_tokens: cacheCreation + cacheRead,
    output_tokens: outputTokens,
  }
}

/* ───────────────────────────────────────────────────── T28.3 : validation */

function jsonSchemaTypeMatches(expected: string, value: unknown): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string'
    case 'number':
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    case 'array':
      return Array.isArray(value)
    default:
      return true
  }
}

/**
 * Valide un bloc `tool_use` REÇU contre `toolDefs` — PURE, n'execute rien
 * (section III.3). Separe de l'execution (section III.4) pour qu'un refus
 * puisse etre prouve sans toucher au sandbox.
 */
export function validateAndNormalizeToolCall(
  toolDefs: readonly AnthropicToolDef[],
  block: AnthropicContentBlock,
): ValidatedAnthropicToolCall {
  const b = block as { readonly name?: unknown; readonly input?: unknown }
  const name = typeof b.name === 'string' ? b.name : ''
  const def = toolDefs.find((t) => t.name === name)
  if (def === undefined) {
    throw new AgentsRefusal('UNKNOWN_TOOL', `outil inconnu : ${JSON.stringify(name)}`)
  }

  const input: Record<string, unknown> =
    b.input !== null && typeof b.input === 'object' ? (b.input as Record<string, unknown>) : {}

  for (const requiredKey of def.input_schema.required) {
    if (!Object.prototype.hasOwnProperty.call(input, requiredKey)) {
      throw new AgentsRefusal('INVALID_TOOL_ARGUMENTS', `argument requis absent : ${requiredKey} (outil ${name})`)
    }
  }
  for (const [key, propSchema] of Object.entries(def.input_schema.properties)) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue
    if (!jsonSchemaTypeMatches(propSchema.type, input[key])) {
      throw new AgentsRefusal(
        'INVALID_TOOL_ARGUMENTS',
        `type invalide pour l'argument ${key} (outil ${name}) : ${propSchema.type} attendu`,
      )
    }
  }

  return { name, args: input }
}

/* ────────────────────────────────────────────────── T28.4 : execution outils */

/** Un seul guillemet simple : on echappe les guillemets simples internes. */
function shellQuoteSingle(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`
}

function execResultToToolOutcome(res: {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly terminated: boolean
  readonly terminationReason: string | null
}): AnthropicToolExecutionResult {
  const isError = res.exitCode !== 0 || res.terminated
  if (!isError) return { content: res.stdout, is_error: false }
  const detail = `${res.stdout}${res.stderr}`.trim()
  return { content: detail.length > 0 ? detail : (res.terminationReason ?? `exitCode=${res.exitCode}`), is_error: true }
}

async function execRunCommandTool(
  sandboxHandle: AnthropicSandboxExecHandle,
  args: unknown,
): Promise<AnthropicToolExecutionResult> {
  const a = (args !== null && typeof args === 'object' ? args : {}) as { readonly command?: unknown }
  const command = typeof a.command === 'string' ? a.command : ''
  const res = await sandboxHandle.execShell(command)
  return execResultToToolOutcome(res)
}

async function execWriteFileTool(
  sandboxHandle: AnthropicSandboxExecHandle,
  args: unknown,
): Promise<AnthropicToolExecutionResult> {
  const a = (args !== null && typeof args === 'object' ? args : {}) as {
    readonly path?: unknown
    readonly content?: unknown
  }
  const filePath = typeof a.path === 'string' ? a.path : ''
  const content = typeof a.content === 'string' ? a.content : ''
  const quotedPath = shellQuoteSingle(filePath)
  const quotedB64 = shellQuoteSingle(Buffer.from(content, 'utf8').toString('base64'))
  // Rend le fichier immediatement relisible par `read_file` au meme chemin
  // (section III.4) : le repertoire parent est cree s'il manque.
  const command = `mkdir -p "$(dirname -- ${quotedPath})" && printf '%s' ${quotedB64} | base64 -d > ${quotedPath}`
  const res = await sandboxHandle.execShell(command)
  return execResultToToolOutcome(res)
}

async function execReadFileTool(
  sandboxHandle: AnthropicSandboxExecHandle,
  args: unknown,
): Promise<AnthropicToolExecutionResult> {
  const a = (args !== null && typeof args === 'object' ? args : {}) as { readonly path?: unknown }
  const filePath = typeof a.path === 'string' ? a.path : ''
  const res = await sandboxHandle.execShell(`cat ${shellQuoteSingle(filePath)}`)
  return execResultToToolOutcome(res)
}

/**
 * Execute un outil DEJA VALIDE dans le sandbox reel via
 * `sandboxHandle.execShell` (contrat T19, section III.4) — jamais de throw,
 * `is_error` porte l'echec.
 */
export function executeToolInSandbox(
  sandboxHandle: AnthropicSandboxExecHandle,
  name: string,
  args: unknown,
): Promise<AnthropicToolExecutionResult> {
  switch (name) {
    case 'run_command':
      return execRunCommandTool(sandboxHandle, args)
    case 'write_file':
      return execWriteFileTool(sandboxHandle, args)
    case 'read_file':
      return execReadFileTool(sandboxHandle, args)
    default:
      throw new AgentsRefusal('UNKNOWN_TOOL', `outil inconnu pour execution : ${name}`)
  }
}

/* ────────────────────────────────────────────────── T28.5 : journal durable */

/**
 * Delegue a `dispatchModelCall` de `@bench/gateway` (T17, meme journal
 * durable d'appel) avec `params.provider` un `AnthropicProvider` (section
 * III.5). `dispatchModelCall` appelle `provider.complete(request)` et lit
 * `{text, usage}` sur le resultat (sa forme historique) ; l'adaptateur
 * ci-dessous traduit la reponse REELLE (`content[]`, `usage` deja normalise)
 * vers cette forme, SANS jamais appeler `provider.complete()` par un autre
 * chemin (T28.M6) — le journal durable d'A6 n'est donc jamais recontourne.
 */
export async function dispatchAnthropicModelCall(
  handle: unknown,
  params: DispatchAnthropicModelCallParams,
  hooks?: DispatchAnthropicModelCallHooks,
): Promise<DispatchAnthropicModelCallResult> {
  const provider = params.provider
  if (provider === null || provider === undefined || typeof provider.complete !== 'function') {
    throw new AgentsRefusal(
      'INVALID_PARAMETER',
      'dispatchAnthropicModelCall.params.provider : AnthropicProvider attendu (createAnthropicMessagesProvider)',
    )
  }

  let lastResponse: AnthropicCompletionResponse | undefined

  const gatewayProvider = {
    async complete(request: unknown): Promise<{ readonly text: string; readonly usage: NormalizedAnthropicUsage }> {
      const response = await provider.complete(request as AnthropicCompletionRequest)
      lastResponse = response
      const textBlock = response.content.find(
        (b): b is { readonly type: 'text'; readonly text: string } => b.type === 'text',
      )
      return { text: textBlock !== undefined ? textBlock.text : '', usage: response.usage }
    },
  }

  const result = (await dispatchModelCall(
    handle,
    {
      model_call_id: params.model_call_id,
      idempotency_key: params.idempotency_key,
      budget_id: params.budget_id,
      reservation_id: params.reservation_id,
      provider: gatewayProvider,
      request: params.request,
      tariff: params.tariff,
    },
    hooks,
  )) as DispatchModelCallResult

  const response: unknown = lastResponse !== undefined ? lastResponse : result.response

  return {
    model_call_id: result.model_call_id,
    status: result.status,
    ...(result.cost !== undefined ? { cost: result.cost } : {}),
    ...(result.usage !== undefined ? { usage: result.usage as NormalizedAnthropicUsage } : {}),
    ...(response !== undefined ? { response } : {}),
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * T47 — lancer une periode de candidat par une session `claude -p` reelle
 * (ADR-008-candidat-reel-par-session-claude-p.md L131-L137,
 * verification/tasks.extensions.json : T47 est une tache d'EXTENSION, pas du
 * cahier).
 *
 * ETAGE VERT. Signature et formes FIXEES PAR acceptance/T47.spec.ts (section
 * III de son en-tete) : le cahier ne nomme aucun export pour cette tache
 * d'extension, exactement comme T18/T19/T28 avant elle.
 *
 * `launchClaudeCliPeriod` ne leve JAMAIS pour les quatre conditions d'echec
 * de A4 ni pour le refus de A5 (ce sont des RESULTATS, pas des pannes) : la
 * promesse resout toujours vers `ClaudeCliPeriodResult`. Deroulement :
 *   1. Purge ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN de l'environnement
 *      AMBIANT recu (absence TOTALE, pas une valeur vide, meme quand
 *      l'appelant les a definies -- A1).
 *   2. Invoque `claude auth status` (meme executable resolu via le PATH de
 *      cet environnement purge) AVANT toute session ; si `authMethod` vaut
 *      `'api_key'`, rend un echec nomme SANS JAMAIS invoquer la session `-p`
 *      (A5).
 *   3. Sinon, lance `claude -p --output-format json
 *      --no-session-persistence --model <model>` dans `workspaceDir`, et
 *      classe sa sortie : code de sortie non nul, sortie illisible, forme
 *      inconnue, ou session en erreur (`subtype`/`is_error`) produisent
 *      chacun un echec nomme DISTINCT qui conserve la sortie brute (A4) ;
 *      sinon, construit l'usage par modele depuis `modelUsage` (A2/A3).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Les deux cles d'authentification par API, retirees avant tout lancement
 * (A1) -- memes noms que ceux que `acceptance/T47.spec.ts` compare. */
const ENV_KEY_ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY'
const ENV_KEY_ANTHROPIC_AUTH_TOKEN = 'ANTHROPIC_AUTH_TOKEN'

/** Les quatre drapeaux et le nom d'option fixes par ADR-008 L135 (les trois
 * premiers) et par acceptance/T47.spec.ts (section III.1, `--model`). */
const CLAUDE_FLAG_PRINT = '-p'
const CLAUDE_FLAG_OUTPUT_FORMAT = '--output-format'
const CLAUDE_VALUE_OUTPUT_FORMAT_JSON = 'json'
const CLAUDE_FLAG_NO_SESSION_PERSISTENCE = '--no-session-persistence'
const CLAUDE_FLAG_MODEL = '--model'

/** Motifs d'echec NOMMES, DISTINCTS entre causes (A4 exige quatre motifs
 * distincts pour ses quatre volets ; aucune chaine exacte n'est imposee par
 * la suite, seulement la distinction -- voir son en-tete, section III.1). */
const REASON_AUTH_METHOD_API_KEY =
  "refus : claude auth status declare authMethod='api_key' (periode refusee avant toute session)"
const REASON_EXIT_CODE_NON_ZERO = 'echec : code de sortie non nul de la session claude -p'
const REASON_UNREADABLE_OUTPUT = 'echec : sortie de la session claude -p illisible (JSON invalide)'
const REASON_UNKNOWN_OUTPUT_SHAPE =
  "echec : sortie de la session claude -p de forme inconnue (ni 'subtype' ni 'modelUsage' exploitables)"
const REASON_SESSION_REPORTED_ERROR =
  "echec : session claude -p terminee en erreur (is_error ou subtype != 'success')"

/** Purge ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN de l'environnement AMBIANT
 * recu -- les cles sont ABSENTES du resultat (pas presentes avec une valeur
 * vide), meme lorsque l'appelant les a definies. Les entrees `undefined` de
 * la source sont egalement omises : le resultat est un `ProcessEnv` passable
 * directement a `spawn`. */
function purgeAnthropicCredentials(src: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(src)) {
    if (k === ENV_KEY_ANTHROPIC_API_KEY || k === ENV_KEY_ANTHROPIC_AUTH_TOKEN) continue
    if (v !== undefined) out[k] = v
  }
  return out
}

interface ClaudeProcessResult {
  readonly stdout: string
  readonly exitCode: number
}

/**
 * Lance `claude <args>` SANS SHELL dans `cwd`, avec `env` -- la resolution de
 * l'executable via `PATH` revient donc a `env.PATH`, exactement ce qu'un
 * `execvp` fait (c'est ce qui permet au faux executable de
 * `acceptance/fixtures/claude-cli/bin/claude`, place en tete de ce `PATH`,
 * de remplacer la vraie CLI pour les verifications). Ne rejette JAMAIS : un
 * echec de spawn (executable introuvable, etc.) se replie sur un code de
 * sortie non nul, classe en aval comme n'importe quel autre echec de
 * processus -- aucune des quatre conditions d'A4 ne distingue un spawn
 * impossible d'un code de sortie non nul.
 */
function runClaudeProcess(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<ClaudeProcessResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: ClaudeProcessResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('claude', [...args], { cwd, env })
    } catch {
      finish({ stdout: '', exitCode: -1 })
      return
    }

    const chunks: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', () => {
      finish({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode: -1 })
    })
    child.on('close', (code) => {
      finish({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode: code ?? -1 })
    })
  })
}

/** Lit `authMethod` dans la sortie de `claude auth status` -- `undefined`
 * (jamais `'api_key'`) si la sortie ne parse pas ou ne porte pas ce champ. */
function extractAuthMethod(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { readonly authMethod?: unknown }
    return typeof parsed.authMethod === 'string' ? parsed.authMethod : undefined
  } catch {
    return undefined
  }
}

/** La sortie porte-t-elle la forme documentee (ADR-008 L44-48) assez pour en
 * tirer une decision success/echec ? Ni plus ni moins que `subtype` (chaine)
 * et `modelUsage` (objet) -- les deux champs que la classification en aval
 * lit effectivement. */
function hasKnownClaudeResultShape(
  v: unknown,
): v is { readonly subtype: string; readonly is_error?: unknown; readonly modelUsage: Record<string, unknown> } {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o['subtype'] === 'string' && o['modelUsage'] !== null && typeof o['modelUsage'] === 'object'
}

/** Derive le vecteur d'usage a six categories (acceptance/T47.spec.ts,
 * section III.1) depuis `modelUsage`, une entree par modele declare (A2).
 * L'ecriture de cache, dont la duree n'est jamais declaree (ADR-008 L49),
 * n'est JAMAIS ventilee entre `cache_write_5m`/`cache_write_1h` (TOUJOURS 0,
 * A3) : ses unites vont integralement dans `cache_write_unresolved`. */
function usageFromModelUsage(modelUsage: Record<string, unknown>): ClaudeCliPeriodUsage[] {
  const out: ClaudeCliPeriodUsage[] = []
  for (const [model, rawEntry] of Object.entries(modelUsage)) {
    const entry = (rawEntry !== null && typeof rawEntry === 'object' ? rawEntry : {}) as Record<string, unknown>
    out.push({
      model,
      input_fresh: toNonNegativeInt(entry['inputTokens']),
      cache_read: toNonNegativeInt(entry['cacheReadInputTokens']),
      output: toNonNegativeInt(entry['outputTokens']),
      cache_write_5m: 0,
      cache_write_1h: 0,
      cache_write_unresolved: toNonNegativeInt(entry['cacheCreationInputTokens']),
    })
  }
  return out
}

/** Classe la sortie de la session `claude -p` une fois le processus termine
 * (A4) : code de sortie non nul, sortie illisible, forme inconnue, et
 * session en erreur sont QUATRE verifications DISTINCTES, chacune produisant
 * un motif different -- dans cet ordre, parce que (d) de A4 fournit une
 * sortie par ailleurs parfaitement valide dont seul le code de sortie doit
 * suffire a refuser. */
function interpretClaudeSessionResult(result: ClaudeProcessResult): ClaudeCliPeriodResult {
  const { stdout, exitCode } = result

  if (exitCode !== 0) {
    return { ok: false, reason: REASON_EXIT_CODE_NON_ZERO, raw: stdout }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, reason: REASON_UNREADABLE_OUTPUT, raw: stdout }
  }

  if (!hasKnownClaudeResultShape(parsed)) {
    return { ok: false, reason: REASON_UNKNOWN_OUTPUT_SHAPE, raw: stdout }
  }

  if (parsed.is_error === true || parsed.subtype !== 'success') {
    return { ok: false, reason: REASON_SESSION_REPORTED_ERROR, raw: stdout }
  }

  const sessionId =
    typeof (parsed as Record<string, unknown>)['session_id'] === 'string'
      ? ((parsed as Record<string, unknown>)['session_id'] as string)
      : ''

  return { ok: true, raw: stdout, sessionId, usage: usageFromModelUsage(parsed.modelUsage) }
}

/** Options de `launchClaudeCliPeriod` (acceptance/T47.spec.ts, section III.1 ;
 *  `prompt`, AJOUTE par acceptance/T49.spec.ts, section II.4 -- ADDITIF,
 *  optionnel : omis, le comportement de T47 est inchange -- AUCUN argument
 *  n'est insere apres `-p`). Quand fourni, c'est litteralement l'argument
 *  d'argv qui suit IMMEDIATEMENT `-p` (meme convention shell que
 *  `claude -p "<texte>"`). */
export interface LaunchClaudeCliPeriodOptions {
  readonly workspaceDir: string
  readonly model: string
  readonly prompt?: string | undefined
  readonly env: Record<string, string | undefined>
}

/** Usage par modele declare par `modelUsage` (acceptance/T47.spec.ts, section III.1). */
export interface ClaudeCliPeriodUsage {
  readonly model: string
  readonly input_fresh: number
  readonly cache_read: number
  readonly output: number
  readonly cache_write_5m: number
  readonly cache_write_1h: number
  readonly cache_write_unresolved: number
}

/**
 * Ce que rend `launchClaudeCliPeriod` -- une promesse qui RESOUT TOUJOURS
 * (acceptance/T47.spec.ts, section III.1 : jamais de rejet pour un refus
 * d'authentification ou une session en echec, qui sont des RESULTATS, pas
 * des pannes).
 */
export type ClaudeCliPeriodResult =
  | {
      readonly ok: true
      readonly raw: string
      /** `session_id` declare par la session (acceptance/T49.spec.ts, A1) --
       *  chaine vide si la sortie, pourtant reconnue "success", ne le porte
       *  pas (ne s'est jamais produit avec le faux executable ni la CLI
       *  reelle documentee, mais aucune des quatre verifications de A4 ne
       *  porte sur ce champ -- jamais un refus pour cette seule absence). */
      readonly sessionId: string
      readonly usage: readonly ClaudeCliPeriodUsage[]
    }
  | { readonly ok: false; readonly reason: string; readonly raw: string | null }

/**
 * Lance, pour une periode, une session `claude -p` neuve dans l'espace de
 * travail donne (ADR-008 L133), avec le modele de la configuration, et rend
 * la sortie brute ainsi que l'usage par modele ; refuse avant tout appel si
 * `claude auth status` declare une authentification par cle d'API (ADR-008
 * L133, L135 A5).
 */
export async function launchClaudeCliPeriod(
  options: LaunchClaudeCliPeriodOptions,
): Promise<ClaudeCliPeriodResult> {
  const { workspaceDir, model, prompt } = options
  const env = purgeAnthropicCredentials(options.env)

  const authStatus = await runClaudeProcess(['auth', 'status'], workspaceDir, env)
  const authMethod = extractAuthMethod(authStatus.stdout)
  if (authMethod === 'api_key') {
    return { ok: false, reason: REASON_AUTH_METHOD_API_KEY, raw: null }
  }

  // `prompt`, AJOUTE par acceptance/T49.spec.ts (II.4) : litteralement
  // l'argument qui suit `-p`, omis quand `prompt` est absent -- comportement
  // de T47 inchange dans ce cas (AUCUN argument supplementaire).
  const session = await runClaudeProcess(
    [
      CLAUDE_FLAG_PRINT,
      ...(prompt !== undefined ? [prompt] : []),
      CLAUDE_FLAG_OUTPUT_FORMAT,
      CLAUDE_VALUE_OUTPUT_FORMAT_JSON,
      CLAUDE_FLAG_NO_SESSION_PERSISTENCE,
      CLAUDE_FLAG_MODEL,
      model,
    ],
    workspaceDir,
    env,
  )

  return interpretClaudeSessionResult(session)
}
