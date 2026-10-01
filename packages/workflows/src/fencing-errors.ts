// ─────────────────────────────────────────────────────────────────────────────
// @bench/workflows — le refus de bail périmé (cahier L375, tâche T25).
//
// `STALE_EXECUTION` EST LE SEUL CODE QUE LE CAHIER NOMME POUR T25 (L375,
// verbatim). Cette classe est PARTAGÉE entre `packages/workflows`
// (`heartbeatLease` la nomme sans la lever, cf. section III.3 de
// `acceptance/T25.spec.ts`), `packages/gateway` (`dispatchModelCallFenced`) et
// `packages/activities` (`publishCheckpointActivity`) : les services qui
// protègent les effets (L377) rejettent avec LE MÊME code plutôt que trois
// classes d'erreur distinctes qui porteraient chacune `.code ===
// 'STALE_EXECUTION'` par coïncidence de chaîne — une divergence future entre
// elles serait alors un bug silencieux, pas une erreur de compilation.
// ─────────────────────────────────────────────────────────────────────────────

/** cahier:L375, verbatim — le seul code de refus que §H nomme pour T25. */
export const STALE_EXECUTION_CODE = 'STALE_EXECUTION'

export class StaleExecutionError extends Error {
  readonly code: typeof STALE_EXECUTION_CODE = STALE_EXECUTION_CODE
  readonly resourceId: string

  constructor(resourceId: string, detail: string) {
    super(`${STALE_EXECUTION_CODE} : ${detail}`)
    this.name = 'StaleExecutionError'
    this.resourceId = resourceId
  }
}

export function isStaleExecutionError(e: unknown): e is StaleExecutionError {
  return e instanceof StaleExecutionError
}
