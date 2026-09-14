// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE — passerelle modele et reponse perdue (cahier L299-L306, tache T17).
//
// Etage ROUGE : aucune regle metier n'est ecrite ici. Ni journal durable
// d'appel, ni distinction RESERVED/DISPATCH_STARTED/RESPONSE_STORED/SETTLED/
// UNKNOWN/CANCELLED_BEFORE_DISPATCH, ni idempotence logique par
// `model_call_id`/`idempotency_key`, ni endpoint de reconciliation. Les
// quatre roles ci-dessous LEVENT `NotImplemented` (@bench/contracts), dont le
// message porte le prefixe `NOT_IMPLEMENTED` que `verification/runner/red.mjs`
// sait lire.
//
// CE QUE CE FICHIER AJOUTE, ET SUR QUOI IL S'APPUIE. T17 depend de T12
// (schema central PostgreSQL, `packages/storage`) et T16 (budgets et
// reservations, `packages/billing`) — ni l'un ni l'autre n'est redeclare ici.
// Les quatre roles ci-dessous sont ceux que `acceptance/T17.spec.ts` nomme en
// section III de son en-tete, fixes par la suite elle-meme puisque le cahier
// ne dicte pas de noms d'exports pour `packages/gateway` (qui n'existait pas
// avant ce commit) — sans alias : la liste d'alias que la suite tolere est une
// tolerance de NOMMAGE cote appelant, jamais une invitation a en inventer un
// ici.
//
//   createFakeProvider({ responses, onRequest? })
//       fournisseur SCRIPTE, sans reseau (L15, L301 « avec compteurs »),
//       exerce tel quel par la sonde de capacite `fake-provider`
//       (`verification/runner/doctor.mjs`) et par les sept cas de cette
//       tache. Rend `{ complete(request), calls }`.
//   dispatchModelCall(handle, params, hooks?)
//       fonction UNIQUE et idempotente : premier envoi ET reprise apres panne
//       de la MEME operation (`model_call_id`). Examine le journal durable
//       au lieu de redispatcher aveuglement (invariant 7, L69) : aucune trace
//       de DISPATCH_STARTED -> dispatch complet ; DISPATCH_STARTED present
//       sans etat terminal -> `{ status: 'UNKNOWN' }` sans recontacter le
//       fournisseur ; etat terminal deja atteint -> meme resultat rendu sans
//       recontacter le fournisseur. `idempotency_key` reutilisee avec une
//       requete DIFFERENTE est REJETEE.
//   getModelCall(handle, { model_call_id })
//       lecture directe du journal durable d'appel (L301).
//   reconcileModelCall(handle, { model_call_id, tariff, receipt: { usage } })
//       endpoint de reconciliation de L301 : ingere un recu de facturation
//       arrive hors bande pour un appel UNKNOWN et le regle, sans jamais
//       fabriquer de contenu de reponse.
//
// CE QUE CE SQUELETTE NE PRETEND PAS FAIRE. Aucun de ces quatre roles ne rend
// de valeur plausible : chacun leve immediatement. Les cas de refus (A7) et
// d'absence (A5, A6) de T17 restent ROUGES malgre tout, exactement comme pour
// T15 : `verification/mutants/T17.json` documente pour chacun un CONTROLE
// POSITIF qu'une exception ne peut pas simuler.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Reponse scriptee d'un appel de fournisseur factice (cf. III.1). */
export interface FakeProviderResponse {
  readonly text: string
  readonly usage?: {
    readonly input_uncached_tokens: number
    readonly input_cached_tokens: number
    readonly output_tokens: number
  }
}

/** Cible de creation d'un fournisseur factice (L15, L301). */
export interface CreateFakeProviderRequest {
  readonly responses: ReadonlyArray<string | FakeProviderResponse>
  readonly onRequest?: (request: unknown, index: number) => void
}

/** Fournisseur factice rendu : `complete()` scripte, `calls` un compteur vivant. */
export interface FakeProvider {
  complete(request: unknown): Promise<unknown>
  readonly calls: number
}

/** Points d'injection nommes de `dispatchModelCall` (section III.2). */
export interface DispatchModelCallHooks {
  readonly beforeDispatchStarted?: () => void
  readonly afterDispatchStarted?: () => void
  readonly afterProviderResponse?: () => void
}

/** Parametres d'un dispatch, premier envoi ou reprise (section III.2). */
export interface DispatchModelCallParams {
  readonly model_call_id: string
  readonly idempotency_key: string
  readonly budget_id: string
  readonly reservation_id: string
  readonly provider: FakeProvider
  readonly request: unknown
  readonly tariff: unknown
}

/** Ce que rend un dispatch accepte, premier envoi ou reprise. */
export interface DispatchModelCallResult {
  readonly model_call_id: string
  readonly status: string
  readonly cost?: string
  readonly usage?: unknown
  readonly response?: unknown
}

/** Identite d'un appel modele, pour lecture directe (section III.3). */
export interface GetModelCallRequest {
  readonly model_call_id: string
}

/** Un recu de facturation arrive hors bande pour un appel UNKNOWN (section III.4). */
export interface ReconcileModelCallRequest {
  readonly model_call_id: string
  readonly tariff: unknown
  readonly receipt: {
    readonly usage: unknown
  }
}

/** Ce que rend une reconciliation acceptee. */
export interface ReconcileModelCallResult {
  readonly model_call_id: string
  readonly status: string
  readonly cost: string
}

/**
 * Cree un fournisseur factice scripte, sans reseau (L15, L301 « avec
 * compteurs »).
 */
export function createFakeProvider(request: unknown): FakeProvider {
  void request
  throw new NotImplemented('gateway.createFakeProvider')
}

/**
 * Dispatch idempotent d'un appel modele : premier envoi ET reprise de la
 * meme operation apres panne (invariant 7, L69, L303).
 */
export function dispatchModelCall(
  handle: unknown,
  params: unknown,
  hooks?: unknown,
): Promise<DispatchModelCallResult> {
  void handle
  void params
  void hooks
  throw new NotImplemented('gateway.dispatchModelCall')
}

/** Lecture directe du journal durable d'appel (L301). */
export function getModelCall(handle: unknown, request: unknown): Promise<unknown> {
  void handle
  void request
  throw new NotImplemented('gateway.getModelCall')
}

/** Endpoint de reconciliation (L301) : ingere un recu et regle l'appel UNKNOWN. */
export function reconcileModelCall(
  handle: unknown,
  request: unknown,
): Promise<ReconcileModelCallResult> {
  void handle
  void request
  throw new NotImplemented('gateway.reconcileModelCall')
}
