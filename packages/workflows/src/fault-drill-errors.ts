// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — le refus de réconciliation d'un lot de reçus (cahier
// L483 « pertes ou doublons de reçus sont détectés », tâche T37).
//
// `RECEIPT_RECONCILIATION_REJECTED`, `RECEIPT_LOST` ET `RECEIPT_DUPLICATE`
// SONT FIXÉS PAR acceptance/T37.spec.ts (section II.c de son en-tête), PAS
// PAR LE CAHIER : celui-ci nomme la règle métier (« pertes ou doublons de
// reçus sont détectés », L483) sans nommer son code de refus ni le vocabulaire
// de ses anomalies — exactement comme T17 a fixé `IDEMPOTENCY_KEY_CONFLICT`
// avant que packages/gateway n'existe (packages/gateway/src/errors.ts) et
// comme T25 a fixé `STALE_EXECUTION_CODE` (fencing-errors.ts, ce même
// paquet). Même séparation « erreurs techniques / résultats métier » (§A) :
// un REFUS nommé, jamais un plantage anonyme.
// ─────────────────────────────────────────────────────────────────────────────

/** Fixé par acceptance/T37.spec.ts — cf. en-tête ci-dessus. */
export const RECEIPT_RECONCILIATION_REJECTED_CODE = 'RECEIPT_RECONCILIATION_REJECTED'
export const RECEIPT_LOST_CODE = 'RECEIPT_LOST'
export const RECEIPT_DUPLICATE_CODE = 'RECEIPT_DUPLICATE'

export interface ReceiptAnomaly {
  readonly model_call_id: string
  readonly code: typeof RECEIPT_LOST_CODE | typeof RECEIPT_DUPLICATE_CODE
}

/**
 * Rejet EN BLOC d'un lot de règlement portant au moins une anomalie (cahier
 * L305 : « les ambiguïtés non réconciliées restent dans l'export » — rien
 * n'est réglé à moitié). `anomalies` nomme CHAQUE identifiant fautif et sa
 * nature, jamais un refus muet.
 */
export class FaultDrillRefusal extends Error {
  readonly code: typeof RECEIPT_RECONCILIATION_REJECTED_CODE = RECEIPT_RECONCILIATION_REJECTED_CODE
  readonly anomalies: readonly ReceiptAnomaly[]

  constructor(anomalies: readonly ReceiptAnomaly[]) {
    const detail = anomalies.map((a) => `${a.model_call_id}:${a.code}`).join(', ')
    super(`${RECEIPT_RECONCILIATION_REJECTED_CODE} : ${anomalies.length} anomalie(s) (${detail})`)
    this.name = 'FaultDrillRefusal'
    this.anomalies = anomalies
  }
}

export function isFaultDrillRefusal(e: unknown): e is FaultDrillRefusal {
  return e instanceof FaultDrillRefusal
}
