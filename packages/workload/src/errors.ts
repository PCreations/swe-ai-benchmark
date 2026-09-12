// ─────────────────────────────────────────────────────────────────────────────
// Refus de `@bench/workload` (T08).
//
// POURQUOI UN REFUS LEVÉ, ET NON RENDU. Même raison qu'en T03, T06 et T07 : un
// refus rendu comme valeur se laisse ignorer, et §D-12 exige qu'un `PASS`
// repose sur des assertions réellement exécutées. Lever rend IMPOSSIBLE de
// « refuser puis produire quand même le plan » — une entrée malformée ne peut
// pas se glisser dans un plan par la porte de derrière d'un champ `intents`
// accolé au refus.
//
// UN REFUS DE FORME N'EST PAS UN VERDICT MÉTIER. §A : « les erreurs techniques
// et résultats métier sont des champs distincts ». Ce type couvre la FORME des
// entrées de T08 (L80 : « les JSON de domaine sont stricts : propriétés
// inconnues rejetées, enums explicites, timestamps UTC ISO 8601 »). Le verdict
// d'une intention exécutée, lui, n'est jamais une exception : c'est un STATUT
// publié dans l'issue de l'intention — `UNSERVED` en particulier, que
// l'invariant D-5 (L67) exige CONSERVÉ plutôt que supprimé.
//
// CE QU'UN REFUS NE PORTE JAMAIS. Aucune donnée métier d'un locataire. Le refus
// nomme le CODE et le CHEMIN de la valeur fautive — rien de l'état.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Natures de refus que T08 sait produire.
 *
 * Les sept premières transcrivent les règles de forme du §E (L80). Les
 * suivantes sont propres aux livrables de L221 :
 *
 *   NEGATIVE_DURATION   une avance d'horloge métier va vers l'avant. Le cahier
 *                       ne connaît pas de temps métier qui recule ; un delta
 *                       négatif est une erreur d'appel, pas une remontée.
 *   CLOCK_MALFORMED     la poignée reçue n'est pas une horloge métier : elle ne
 *                       porte pas d'instant lisible. Distinguer ce cas d'un
 *                       `TYPE_MISMATCH` évite de confondre « pas une horloge »
 *                       et « pas un objet ».
 *   PLAN_MALFORMED      le plan soumis à l'exécution ne porte pas d'intentions.
 *   DUPLICATE_USAGE_ID  deux usages du catalogue partagent leur identifiant :
 *                       les `id` d'intention en dériveraient, et « id stable »
 *                       (L88) cesserait d'être une identité.
 *   WORLD_UNREACHABLE   le monde fourni n'expose aucun point d'entrée
 *                       appelable. Aucune intention ne peut être servie ; le
 *                       dire est plus honnête que de tout déclarer non servi.
 *   WORLD_REPLY_MALFORMED  la réponse du monde n'est pas lisible comme un
 *                       résultat d'appel.
 */
export const WORKLOAD_REJECTION_KINDS = [
  // ── forme (L80)
  'UNKNOWN_PROPERTY',
  'MISSING_PROPERTY',
  'TYPE_MISMATCH',
  'EMPTY_STRING',
  'NON_FINITE_NUMBER',
  'NOT_AN_INTEGER',
  'TIMESTAMP_NOT_UTC_ISO8601',
  // ── livrables de L221
  'NEGATIVE_DURATION',
  'CLOCK_MALFORMED',
  'PLAN_MALFORMED',
  'DUPLICATE_USAGE_ID',
  'WORLD_UNREACHABLE',
  'WORLD_REPLY_MALFORMED',
] as const

export type WorkloadRejectionKind = (typeof WORKLOAD_REJECTION_KINDS)[number]

/**
 * Refus de la génération ou de l'exécution des intentions d'usage.
 *
 * `name` vaut `WorkloadRejection` et non `Error` : un lecteur de rapport —
 * humain ou machine — doit pouvoir distinguer d'un coup d'œil ce refus de forme
 * d'un `TypeError`, qui serait un plantage et non un verdict.
 */
export class WorkloadRejection extends Error {
  readonly code: WorkloadRejectionKind
  readonly path: string
  readonly detail: string

  constructor(code: WorkloadRejectionKind, path: string, detail: string) {
    super(`${code} @ ${path} : ${detail}`)
    this.name = 'WorkloadRejection'
    this.code = code
    this.path = path
    this.detail = detail
  }
}

export function isWorkloadRejection(e: unknown): e is WorkloadRejection {
  return e instanceof WorkloadRejection
}

/** Chemin d'un enfant. La racine est `''`, si bien qu'un champ racine est `/seed`. */
export const childPath = (base: string, segment: string | number): string =>
  `${base}/${String(segment)}`
