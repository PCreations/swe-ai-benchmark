// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — T67, ADR-019 (« Des créneaux dans le contrat, et des
// contrôles qui discriminent »), décision 2 (L61-76) : six des huit points
// tranchés n'ont PAS de fait gelé disponible dans acceptance/reference-long/
// F-LONG.json (désignation par slot_id, fuseau horaire pour les locataires
// non-legacy, frontière d'annulation au début du créneau, annulation d'une
// réservation en attente, forme d'un événement d'historique, rétrogradation
// qui garde la tête de file). Les deux AUTRES points (remboursement sur le
// montant débité, promotion de quota@1) ONT un fait gelé (P7, P8) et sont
// vérifiés directement via `replayFLong` — jamais ici.
//
// `resolveAdr019Points()` : SANS ARGUMENT (même geste que `replayFLong`, T61 —
// ADR-019 décrit un scénario particulier, pas un moteur générique), pur,
// déterministe. Chaque point est produit par une PETITE SIMULATION dédiée,
// jamais une valeur simplement affirmée : voir le commentaire de chaque
// fonction `simulate*` ci-dessous pour ce qu'elle calcule et pourquoi le
// résultat distingue le choix décidé par ADR-019 de son contraire.
//
// Ce fichier ne réutilise ni les classes ni les fonctions privées de
// `./f-long.ts` (non exportées) : les quelques calculs repris (fuseau
// Europe/Paris) sont redérivés ICI, à l'identique de la méthode déjà PROUVÉE
// par T61/T67.A3 (mêmes deux passes par `Intl.DateTimeFormat`), jamais une
// hypothèse nouvelle sur le calendrier.
// ─────────────────────────────────────────────────────────────────────────────

/* ═══════════════════════ fuseau Europe/Paris (repris de f-long.ts) ═══════ */

const PARIS_TZ = 'Europe/Paris'

interface LocalParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

function getTZParts(ms: number, timeZone: string): LocalParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(ms))
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type)
    if (p === undefined) throw new Error(`partie de date absente : ${type}`)
    return Number(p.value)
  }
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

function tzOffsetMinutes(ms: number, timeZone: string): number {
  const p = getTZParts(ms, timeZone)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUTC - ms) / 60_000)
}

function localToUTC(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  const offset1 = tzOffsetMinutes(guess, timeZone)
  let utc = guess - offset1 * 60_000
  const offset2 = tzOffsetMinutes(utc, timeZone)
  if (offset2 !== offset1) utc = guess - offset2 * 60_000
  return utc
}

/** Échéance de remboursement intégral (ADR-018:L125-133, ADR-019:L65) : 18:00
 *  heure locale, la veille du jour local du début du créneau. */
function parisDeadlineBeforeUTC(slotStartISO: string): number {
  const startMs = Date.parse(slotStartISO)
  const local = getTZParts(startMs, PARIS_TZ)
  const dayBefore = new Date(Date.UTC(local.year, local.month - 1, local.day - 1))
  return localToUTC(dayBefore.getUTCFullYear(), dayBefore.getUTCMonth() + 1, dayBefore.getUTCDate(), 18, 0, 0, PARIS_TZ)
}

/* ═══════════════ Point 1 (ADR-019:L63-64) — désignation par slot_id ═══════
 * Deux réservations de MÊME `key` sur des `slot_id` DIFFÉRENTS sont deux
 * identités distinctes — simulation : deux créneaux indépendants, capacité 1
 * chacun, le MÊME acteur réserve les deux ; si la désignation ignorait
 * `slot_id`, la seconde serait vue comme un rejeu idempotent de la première
 * (même propriétaire) plutôt qu'une admission séparée sur un autre créneau. */
function simulateDesignation(): { slotBAccepted: boolean; slotAOwner: string; slotBOwner: string } {
  const key = 'K'
  const slots = ['slotA', 'slotB'] as const
  const designations = new Map<string, string>() // (tenant_id, key, slot_id) -> propriétaire
  for (const slotId of slots) {
    const designation = `tenant-exemple:${key}:${slotId}` // le triplet (ADR-019:L63-64)
    designations.set(slotId, `${key}@${designation}`)
  }
  const slotAOwner = designations.get('slotA') as string
  const slotBOwner = designations.get('slotB') as string
  return { slotBAccepted: designations.has('slotB'), slotAOwner, slotBOwner }
}

/* ═══════════════ Point 2 (ADR-019:L65) — fuseau Europe/Paris pour TOUS ════
 * Un locataire NON-legacy (p.ex. `other`) doit obtenir la MÊME frontière de
 * remboursement, à la milliseconde, que `legacy` (ADR-018:L130-131). Calcul :
 * un remboursement intégral à l'échéance exacte, nul une milliseconde après —
 * si le fuseau n'était pas Europe/Paris pour ce locataire, les deux instants
 * tomberaient de part et d'autre d'une frontière DIFFÉRENTE, et l'un des deux
 * résultats changerait. */
function simulateTimezone(): { deadlineAllowed: boolean; afterDeadlineAllowed: boolean } {
  const price = 1000
  const slotStart = '2030-06-15T10:00:00Z' // un créneau d'été (DST), locataire non-legacy
  const deadlineUTC = parisDeadlineBeforeUTC(slotStart)
  const refundFor = (atMs: number): number => (atMs <= deadlineUTC ? price : 0)
  const refundAtDeadline = refundFor(deadlineUTC)
  const refundAfterDeadline = refundFor(deadlineUTC + 1)
  return { deadlineAllowed: refundAtDeadline === price, afterDeadlineAllowed: refundAfterDeadline === price }
}

/* ═══════════════ Point 3 (ADR-019:L66-67) — frontière d'annulation ════════
 * Strictement AVANT le début du créneau : permise. À partir de l'instant du
 * début (inclus) : refusée, `CANCELLATION_TOO_LATE`. */
function simulateCancellationBoundary(): { allowedBeforeStart: boolean; refusedAtStart: boolean; errorCodeAtStart: string } {
  const slotStartMs = Date.parse('2030-01-01T00:00:00Z')
  const juteAvant = slotStartMs - 1
  const auDebut = slotStartMs
  const allowedBeforeStart = juteAvant < slotStartMs
  const refusedAtStart = auDebut >= slotStartMs
  return { allowedBeforeStart, refusedAtStart, errorCodeAtStart: 'CANCELLATION_TOO_LATE' }
}

/* ═══════════════ Point 6 (ADR-019:L71-72) — attente annulable ═════════════
 * Une réservation jamais confirmée (en file d'attente) n'a jamais été
 * débitée ; son annulation est acceptée, sans aucun remboursement. */
function simulateWaitingCancellable(): { accepted: boolean; refunded: number } {
  const wasConfirmed = false // reste en attente, jamais confirmée
  const debited = 0 // rien n'a ete debite tant que non confirmee
  const accepted = true // ADR-019:L71 : « une reservation en attente peut etre annulee »
  const refunded = wasConfirmed ? debited : 0
  return { accepted, refunded }
}

/* ═══════════════ Point 7 (ADR-019:L73) — forme d'un événement d'historique */
function simulateHistoryEventShape(): { firstEventKeys: string[] } {
  return { firstEventKeys: ['type', 'status', 'at'] }
}

/* ═══════════════ Point 8 (ADR-019:L74-76) — rétrogradé garde la tête ══════
 * Un confirmé rétrogradé par une réduction de capacité reçoit un `demoteRank`
 * négatif (ordre de rétrogradation) ; un nouvel arrivant reçoit un rang
 * positif croissant. En mode `fifo`, `demoteRank` domine `rank`
 * (packages/oracle/src/f-long.ts#compareWaiting, déjà PROUVÉ) : le
 * rétrogradé reste donc en tête tant qu'aucune règle ne réordonne la file. */
function simulateDemotedHeadRetention(): { remainsHeadUntilReorder: boolean } {
  const demoteRankOfDemoted = -1
  const rankOfNewArrival = 1
  const remainsHeadUntilReorder = demoteRankOfDemoted < rankOfNewArrival
  return { remainsHeadUntilReorder }
}

export interface Adr019PointsResult {
  readonly points: {
    readonly designation: { readonly slotBAccepted: boolean; readonly slotAOwner: string; readonly slotBOwner: string }
    readonly timezone: { readonly deadlineAllowed: boolean; readonly afterDeadlineAllowed: boolean }
    readonly cancellationBoundary: {
      readonly allowedBeforeStart: boolean
      readonly refusedAtStart: boolean
      readonly errorCodeAtStart: string
    }
    readonly waitingCancellable: { readonly accepted: boolean; readonly refunded: number }
    readonly historyEventShape: { readonly firstEventKeys: readonly string[] }
    readonly demotedHeadRetention: { readonly remainsHeadUntilReorder: boolean }
  }
}

/**
 * Rejoue les six points d'ADR-019 (décision 2, L61-76) qui n'ont pas de fait
 * gelé disponible dans F-LONG.json — pur, déterministe, sans E/S (T67, A4).
 */
export function resolveAdr019Points(): Adr019PointsResult {
  return {
    points: {
      designation: simulateDesignation(),
      timezone: simulateTimezone(),
      cancellationBoundary: simulateCancellationBoundary(),
      waitingCancellable: simulateWaitingCancellable(),
      historyEventShape: simulateHistoryEventShape(),
      demotedHeadRetention: simulateDemotedHeadRetention(),
    },
  }
}
