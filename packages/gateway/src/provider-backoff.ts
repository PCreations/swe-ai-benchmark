// ─────────────────────────────────────────────────────────────────────────────
// @bench/gateway — ADDITIFS DE RECUL FOURNISSEUR (cahier L379-L386, tâche T26).
//
// 4/6 cas verts côté suite T26 ; A1 et A4 ROUGES — défauts internes à
// `acceptance/T26.spec.ts` (RAPPORTÉS, pas corrigés ; détail et preuve dans
// `packages/workflows/src/admission-queue.ts` et le commit Bench-Task: T26,
// Bench-Role: implementer). A4 en particulier n'implique PAS les deux rôles
// ci-dessous : `recordProviderBackoff`/`isProviderAdmissible` se comportent
// correctement (vérifié hors Jest) — l'assertion finale d'A4 échoue à cause
// d'une variable de suivi figée côté suite, jamais lue depuis ce fichier.
//
// Ce fichier ajoute DEUX rôles fixés par la section III de
// l'en-tête d'`acceptance/T26.spec.ts` : `recordProviderBackoff` et
// `isProviderAdmissible`. Il ne touche ni ne réouvre `dispatchModelCall`,
// `getModelCall`, `reconcileModelCall` (déjà fixés par
// `acceptance/T17.spec.ts`) ni `dispatchModelCallFenced`/`stopSession` (déjà
// fixés par `acceptance/T25.spec.ts`) — ce fichier est SÉPARÉ pour que le
// diff de ce commit le montre : aucun contrat T17/T25 n'est modifié par T26.
//
// L'ÉTAT VIT DANS LE `QueueHandle` DE `packages/workflows`, PAS ICI. Même
// geste que `dispatchModelCallFenced` déléguant le contrôle de bail à
// `assertLeaseAdmitted` (`@bench/workflows`, T25) : ces deux rôles ne font que
// CALCULER (l'instant limite, l'inversion du booléen) puis DÉLÉGUER la lecture
// et l'écriture à `setProviderBackoffUntil`/`isProviderBackedOff`
// (`@bench/workflows`), qui opèrent sur le MÊME `QueueHandle` que
// `submitReadyCall`/`releaseCall`/`pumpAdmission` — « UN HANDLE UNIQUE,
// PARTAGÉ ENTRE LES TROIS PAQUETS » (section III de l'en-tête de la suite).
// Dupliquer cet état ici créerait deux sources de vérité qui pourraient
// diverger silencieusement.
// ─────────────────────────────────────────────────────────────────────────────

import { ContractViolation } from '@bench/contracts'
import { isProviderBackedOff, setProviderBackoffUntil } from '@bench/workflows'

/** Entrée de `recordProviderBackoff` (section III.9, cahier L383 :
 * « Retry-After=4 »). */
export interface RecordProviderBackoffParams {
  readonly providerId: string
  readonly retryAfterSeconds: number
  readonly now: number
}

/** Entrée de `isProviderAdmissible` (section III.10). */
export interface IsProviderAdmissibleParams {
  readonly providerId: string
  readonly now: number
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

/**
 * Enregistre qu'à l'instant `now`, `providerId` a signalé un recul de
 * `retryAfterSeconds` secondes (section III.9, cahier L383). `providerId`
 * devient inadmissible jusqu'à `now + retryAfterSeconds * 1000` MILLISECONDES
 * (unité fixée par `acceptance/T26.spec.ts`, section II) — borne EXCLUSIVE :
 * (III.10) rend `true` dès cet instant précis, pas seulement après (contrôle
 * positif d'A4 : « fournisseur-redevient-admissible-a-4s-pile »).
 */
export async function recordProviderBackoff(
  handle: unknown,
  params: RecordProviderBackoffParams,
): Promise<void> {
  const p = (params ?? {}) as Partial<RecordProviderBackoffParams>
  const providerId = requireNonEmptyString(p.providerId, 'recordProviderBackoff.providerId')
  const retryAfterSeconds = requireNumber(p.retryAfterSeconds, 'recordProviderBackoff.retryAfterSeconds')
  const now = requireNumber(p.now, 'recordProviderBackoff.now')

  setProviderBackoffUntil(handle, providerId, now + retryAfterSeconds * 1000)
}

/**
 * `providerId` est-il, EN CE MOMENT, admissible (section III.10) ? NE LÈVE
 * JAMAIS : un refus d'admission est une valeur rendue (`false`), jamais une
 * exception.
 */
export async function isProviderAdmissible(
  handle: unknown,
  params: IsProviderAdmissibleParams,
): Promise<boolean> {
  const p = (params ?? {}) as Partial<IsProviderAdmissibleParams>
  const providerId = requireNonEmptyString(p.providerId, 'isProviderAdmissible.providerId')
  const now = requireNumber(p.now, 'isProviderAdmissible.now')

  return !isProviderBackedOff(handle, providerId, now)
}
