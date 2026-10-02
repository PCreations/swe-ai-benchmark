// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — le balayage des points de panne (cahier L477-L486, tâche
// T37).
//
// ÉTAGE ROUGE. Aucune règle métier n'est écrite ici : ni classification d'une
// réponse distante ambiguë (UNKNOWN/RECONCILED), ni déduplication de
// publication de période, ni nettoyage de copie privée d'évaluation, ni rejet
// d'un lot de reçus ambigu, ni préservation du calendrier de périodes, ni
// tenue du journal de reprise. Le seul rôle que `acceptance/T37.spec.ts`
// nomme (section III.2) LÈVE `NotImplemented` (@bench/contracts), message
// préfixé `NOT_IMPLEMENTED` que `verification/runner/red.mjs` sait lire.
//
// Nom et forme FIXÉS PAR `acceptance/T37.spec.ts` (section III) — le cahier ne
// nomme aucun export pour ce balayage, seulement les douze points obligatoires
// de L483 et les sept cas d'acceptation :
//
//   runFaultDrill(options) -> Promise<FaultDrillResult>
//
// L'ARTEFACT STATIQUE `packages/workflows/fault-catalog.json` (section III.1,
// cas `artifact` T37.A1) N'EST PAS LIVRÉ À CET ÉTAGE : son contenu réel (un
// scénario et une attente par point, cahier:L483) EST précisément la règle
// métier que cet étage ne doit pas écrire. Son absence fait déjà échouer
// T37.A1 sur un refus nommé (`CATALOGUE-ILLISIBLE`) — un rouge légitime,
// obtenu sans qu'aucun export ne soit appelé : A1 ne lit ce fichier que par
// `fs.readFileSync` pur (section III.1 de la suite, « sans exécuter de code
// métier »).
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/** Un des douze noms canoniques fixés par `acceptance/T37.spec.ts` (section IV). */
export type FaultDrillPoint = string

/**
 * `options` de `runFaultDrill` — vocabulaire repris de L78/L99/T17/T25 lorsqu'il
 * existe déjà (section III.2 d'`acceptance/T37.spec.ts`). Tous les champs sont
 * optionnels ici : chaque cas n'en fournit qu'un sous-partiel, et l'étage ROUGE
 * ne lit aucun d'eux avant de lever.
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

/**
 * Balaie UN point de panne nommé et rend l'état de reprise observé.
 *
 * ÉTAGE ROUGE : lève toujours `NotImplemented`. Restent à écrire à l'étage
 * VERT : la classification UNKNOWN/RECONCILED à coût non nul (A3), la
 * déduplication de publication de période (A2), le nettoyage de la copie
 * privée d'évaluation sans fuite de sentinelle (A4), le rejet en bloc d'un lot
 * de reçus portant perte ou doublon (A5), la préservation du calendrier sous
 * arrêt répété (A6), et la tenue du journal de reprise à identités stables
 * (A7, et le contrôle indépendant que relisent déjà A2/A6).
 */
export async function runFaultDrill(_options: RunFaultDrillOptions): Promise<FaultDrillResult> {
  throw new NotImplemented('workflows.runFaultDrill')
}
