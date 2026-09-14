// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE — contrat AgentRunner avec un agent scripte (cahier L307-L316,
// tache T18).
//
// Etage ROUGE : aucune regle metier n'est ecrite ici. Ni execution reelle
// d'un ScriptStep, ni journal d'evenements de session, ni restitution de
// memoire entre periodes, ni acces au service client via T06, ni persistance
// de Submission. Les huit roles ci-dessous LEVENT `NotImplemented`
// (@bench/contracts), dont le message porte le prefixe `NOT_IMPLEMENTED` que
// `verification/runner/red.mjs` sait lire.
//
// CE QUE CE FICHIER AJOUTE, ET SUR QUOI IL S'APPUIE. T18 depend de T03, T06,
// T15, T17 (verification/tasks.json) ; source_paths ne nomme que
// `packages/agents` — aucun role de packages/storage (T12), packages/billing
// (T16), packages/gateway (T17) ou packages/scenario (T06) n'est redeclare
// ici, et ce squelette ne les importe pas encore (meme discipline que
// `packages/gateway/src/index.ts` a l'etage ROUGE de T17 : les dependances
// reelles n'entrent qu'a l'etage VERT, quand la logique qui les appelle
// existe).
//
// Les huit noms ci-dessous sont ceux que `acceptance/T18.spec.ts` fixe en
// section III de son en-tete — `start`, `observe`, `submit`, `stop`,
// `resume` sont des litteraux du cahier (L309, mot pour mot) ;
// `createScriptedAgent`, `getSessionEvents`, `getSubmissions` sont fixes par
// la suite elle-meme puisque `packages/agents` n'existait pas avant ce
// commit. Noms primaires sans alias : la liste d'alias que la suite tolere
// est une tolerance de NOMMAGE cote appelant, jamais une invitation a en
// inventer un ici.
//
//   createScriptedAgent(steps)
//       agent OPAQUE et PUR (aucune E/S) construit a partir d'un tableau
//       ORDONNE et FIXE de ScriptStep (APPLY_PATCH, MODEL_CALL, ASK_CLIENT,
//       REMEMBER, SELF_REPORT, SUBMIT).
//   start(handle, params) / resume(handle, params)
//       ouvrent une session (AgentRun, L84-95) et rendent `{ session_id,
//       context }` — `context` est CE QUE L'AGENT VOIT, jamais un historique
//       conversationnel brut d'une periode anterieure (A3) ; `resume`
//       reconstruit `context.memory` a partir des dernieres ecritures
//       REMEMBER du `memory_scope` partage (A2), `start` la rend toujours
//       vide.
//   observe(handle, session_id)
//       consomme la PROCHAINE etape non consommee et rend `{ done, actions
//       }` ; chaque action porte `operation_sequence` (L78), deterministe
//       (A1). Rejette une reponse MODEL_CALL invalide sans toucher au budget
//       deja engage (A5) ; resout ASK_CLIENT via le service client (T06),
//       sans en contourner le regime de revelation (A6) ; rend `{done:true,
//       actions:[]}` sans lever apres `stop()` (A4).
//   submit(handle, session_id)
//       persiste une Submission `PENDING_VALIDATION` si l'etape SUBMIT a ete
//       atteinte et que la session n'est pas arretee ; `null` sinon. Jamais
//       `ACCEPTED`/`accepted:true` sur la seule foi d'un SELF_REPORT (A7).
//   stop(handle, session_id)
//       arrete la session, idempotent.
//   getSessionEvents(handle, session_id)
//       journal BRUT, dans l'ordre, de toutes les actions (SELF_REPORT
//       compris, pour l'audit — mais sans autorite sur `submit`, A7).
//   getSubmissions(handle, session_id)
//       Submissions persistees pour cette session.
//
// CE QUE CE SQUELETTE NE PRETEND PAS FAIRE. Aucun de ces huit roles ne rend
// de valeur plausible : chacun leve immediatement. Les cas d'absence (A3,
// A4, A7) et de refus (A5, A6) de T18 restent ROUGES malgre tout,
// exactement comme pour T17 : `verification/mutants/T18.json` documente pour
// chacun un CONTROLE POSITIF qu'une exception ne peut pas simuler.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

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
  readonly modelProvider?: unknown
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

/** Submission persistee (section III.4, L84-95). */
export interface Submission {
  readonly session_id: string
  readonly claimed_requirements: unknown
  readonly artifact_fingerprint: unknown
  readonly attempt: number
  readonly status: string
}

/** Un evenement du journal brut de session (section III.7). */
export interface AgentEvent {
  readonly operation_sequence: number
  readonly kind: ScriptStep['kind']
  readonly [key: string]: unknown
}

/**
 * Cree un agent scripte, opaque et pur — aucune E/S (section III.1, L311).
 */
export function createScriptedAgent(steps: readonly ScriptStep[]): Agent {
  void steps
  throw new NotImplemented('agents.createScriptedAgent')
}

/**
 * Ouvre une session neuve (AgentRun, L84-95). `context.memory` est
 * TOUJOURS vide sur un `start` frais (A2) ; `context` ne porte jamais
 * d'historique conversationnel brut d'une periode anterieure (A3).
 */
export function start(handle: unknown, params: AgentRunParams): Promise<AgentRunHandle> {
  void handle
  void params
  throw new NotImplemented('agents.start')
}

/**
 * Consomme la prochaine etape non consommee et rend `{ done, actions }`
 * (section III.3). Chaque action porte `operation_sequence` deterministe
 * (L78, A1).
 */
export function observe(handle: unknown, session_id: string): Promise<ObserveResult> {
  void handle
  void session_id
  throw new NotImplemented('agents.observe')
}

/**
 * Persiste et rend la Submission si l'etape SUBMIT a ete atteinte et que la
 * session n'est pas arretee ; `null` sinon (section III.4). Jamais
 * `status:'ACCEPTED'` ni `accepted:true` sur la seule foi d'un SELF_REPORT
 * (A7).
 */
export function submit(handle: unknown, session_id: string): Promise<Submission | null> {
  void handle
  void session_id
  throw new NotImplemented('agents.submit')
}

/** Arrete la session ; idempotent (section III.5). */
export function stop(handle: unknown, session_id: string): Promise<void> {
  void handle
  void session_id
  throw new NotImplemented('agents.stop')
}

/**
 * Reouvre une session sur le meme `memory_scope` : `context.memory` est
 * reconstruite a partir des dernieres ecritures REMEMBER de toute session
 * anterieure partageant ce scope (derniere valeur par cle) — vide sur un
 * scope neuf (section III.6, A2).
 */
export function resume(handle: unknown, params: AgentRunParams): Promise<AgentRunHandle> {
  void handle
  void params
  throw new NotImplemented('agents.resume')
}

/** Journal brut, dans l'ordre, de toutes les actions (section III.7). */
export function getSessionEvents(handle: unknown, session_id: string): Promise<readonly AgentEvent[]> {
  void handle
  void session_id
  throw new NotImplemented('agents.getSessionEvents')
}

/** Submissions persistees pour cette session (section III.8). */
export function getSubmissions(handle: unknown, session_id: string): Promise<readonly Submission[]> {
  void handle
  void session_id
  throw new NotImplemented('agents.getSubmissions')
}
