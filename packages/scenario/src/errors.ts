// ─────────────────────────────────────────────────────────────────────────────
// Refus de `@bench/scenario` (T06).
//
// DEUX FAMILLES, UN SEUL TYPE PORTEUR.
//
//   COMPILATION — la source ne respecte pas le contrat de forme (L80 : « les
//   JSON de domaine sont stricts : propriétés inconnues rejetées, enums
//   explicites, timestamps UTC ISO 8601 ») ou son graphe est mal formé (L207,
//   cas A5 : « une dépendance cyclique ou vers un événement inexistant est
//   rejetée »).
//
//   RÉVÉLATION — la lecture est prématurée (`NOT_RELEASED`) ou la question
//   n'est couverte par aucune entrée de la table (`UNSPECIFIED`). Ce sont les
//   DEUX codes que L207 écrit littéralement, et ils ne se substituent JAMAIS
//   l'un à l'autre : répondre `UNSPECIFIED` à une question couverte mais non
//   encore publiée nierait son existence, ce que le cahier ne dit pas.
//
// POURQUOI UN REFUS LEVÉ, ET NON RENDU. Même raison qu'en T03 : un refus rendu
// comme valeur se laisse ignorer, et §D-12 exige qu'un `PASS` repose sur des
// assertions réellement exécutées. Lever rend IMPOSSIBLE la lecture d'un
// contenu après refus — la porte de révélation ne peut pas « refuser puis
// joindre quand même la charge utile ».
//
// CE QU'UN REFUS NE PORTE JAMAIS. Ni la valeur demandée, ni la sentinelle de
// l'objet protégé, ni la période où il sera publié : un refus bavard rendrait
// la porte inutile, puisque l'agent apprendrait par le message ce que le
// silence devait lui cacher (D-2, L63). Le refus nomme le CODE, le CHEMIN et la
// NATURE de l'obstacle — rien du contenu.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Natures de refus que T06 sait produire. Les deux dernières sont les codes du
 * cahier L207 ; les autres transcrivent les règles de forme du §E et les deux
 * défauts de graphe nommés par le cas A5.
 */
export const SCENARIO_REJECTION_KINDS = [
  // ── forme (L80)
  'SCHEMA_UNKNOWN',
  'UNKNOWN_PROPERTY',
  'MISSING_PROPERTY',
  'TYPE_MISMATCH',
  'ENUM_VALUE_UNKNOWN',
  'NON_FINITE_NUMBER',
  'TIMESTAMP_NOT_UTC_ISO8601',
  'EMPTY_STRING',
  // ── identité et cohérence d'ensemble (L78, L88)
  'PERIOD_COUNT_MISMATCH',
  'PERIOD_INDEX_NOT_SEQUENTIAL',
  'DUPLICATE_ID',
  'REQUIREMENT_KEY_MISMATCH',
  'REPLACED_REQUIREMENT_UNKNOWN',
  'WITHDRAWN_REQUIREMENT_UNKNOWN',
  // ── graphe des événements (L207, cas A5)
  'MISSING_DEPENDENCY',
  'FORWARD_DEPENDENCY',
  'CYCLIC_DEPENDENCY',
  // ── interrogation d'un pack compilé
  'PACK_MALFORMED',
  'PERIOD_UNKNOWN',
  // ── les deux codes de révélation du cahier (L207)
  'NOT_RELEASED',
  'UNSPECIFIED',
] as const

export type ScenarioRejectionKind = (typeof SCENARIO_REJECTION_KINDS)[number]

/**
 * Refus de scénario. Porte son `code` et le chemin exact de la valeur fautive,
 * pour la raison qui vaut déjà en T03 : un message libre ne se teste pas, et
 * §G refuse une preuve qui reposerait sur du texte plutôt que sur une
 * observation.
 */
export class ScenarioRejection extends Error {
  readonly code: ScenarioRejectionKind
  readonly path: string
  readonly detail: string

  constructor(code: ScenarioRejectionKind, path: string, detail: string) {
    super(`${code} @ ${path} : ${detail}`)
    this.name = 'ScenarioRejection'
    this.code = code
    this.path = path
    this.detail = detail
  }
}

export function isScenarioRejection(e: unknown): e is ScenarioRejection {
  return e instanceof ScenarioRejection
}

/** Chemin d'un enfant. La racine est `''`, si bien qu'un champ racine est `/periods`. */
export const childPath = (base: string, segment: string | number): string =>
  `${base}/${String(segment)}`
