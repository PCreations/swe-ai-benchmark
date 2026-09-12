// ─────────────────────────────────────────────────────────────────────────────
// Refus de forme de @bench/evaluation (T10).
//
// POURQUOI UN TYPE DISTINCT DE `ContractViolation`. §A : « les erreurs
// techniques et résultats métier sont des champs distincts ». Ici la
// distinction est d'un autre ordre encore, et elle est la raison d'être de la
// tâche : un VERDICT de qualification (ACCEPTÉ / REJETÉ, QUALIFIÉ /
// QUARANTAINE) est une valeur RENDUE ; une erreur d'APPEL du pipeline est
// LEVÉE. Confondre les deux rendrait le pipeline inutilisable comme juge : un
// témoin mal nommé se lirait comme un témoin fautif, et un mutant que le
// harnais n'a pas su lancer se lirait comme « détecté ».
//
// C'est exactement l'écart que L243 refuse : « il ne suffit pas que le mutant
// plante au build ». Un plantage de harnais n'est pas une détection métier, et
// il ne doit donc jamais emprunter le chemin du verdict.
// ─────────────────────────────────────────────────────────────────────────────

/** Natures de refus d'APPEL que le pipeline de qualification sait produire. */
export const QUALIFICATION_ERROR_KINDS = [
  'UNKNOWN_PROPERTY',
  'MISSING_PROPERTY',
  'TYPE_MISMATCH',
  'EMPTY_STRING',
  'UNKNOWN_WITNESS',
  'MUTATION_NOT_APPLICABLE',
  'WITNESS_START_FAILED',
  'EMPTY_EXPOSURE',
  'SCHEMA_UNKNOWN',
] as const

export type QualificationErrorKind = (typeof QUALIFICATION_ERROR_KINDS)[number]

/**
 * Refus d'appel du pipeline. `kind` et `path` sont les deux champs
 * observables ; `detail` est une glose pour le lecteur d'un rapport.
 */
export class QualificationViolation extends Error {
  readonly kind: QualificationErrorKind
  readonly path: string
  readonly detail: string
  readonly task = 'T10'

  constructor(kind: QualificationErrorKind, path: string, detail = '') {
    super(`${kind} ${path}${detail === '' ? '' : ` — ${detail}`}`)
    this.name = 'QualificationViolation'
    this.kind = kind
    this.path = path
    this.detail = detail
  }
}

export function isQualificationViolation(e: unknown): e is QualificationViolation {
  return e instanceof QualificationViolation
}

/* ─────────────────────────────────────────────── stricture des entrées (L80) */

export function requireFlatObject(v: unknown, path: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new QualificationViolation('TYPE_MISMATCH', path, 'objet plat attendu')
  }
  return v as Record<string, unknown>
}

/** « Propriétés inconnues rejetées » (L80), et obligatoires exigées. */
export function requireExactKeys(
  o: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) {
      throw new QualificationViolation('UNKNOWN_PROPERTY', `${path}/${k}`, 'propriété non déclarée')
    }
  }
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(o, k) || o[k] === undefined) {
      throw new QualificationViolation('MISSING_PROPERTY', `${path}/${k}`, 'propriété obligatoire absente')
    }
  }
}

export function requireNonEmptyString(
  o: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const v = o[key]
  if (typeof v !== 'string') {
    throw new QualificationViolation('TYPE_MISMATCH', `${path}/${key}`, `chaîne attendue, ${typeof v} reçu`)
  }
  if (v.length === 0) {
    throw new QualificationViolation('EMPTY_STRING', `${path}/${key}`, 'chaîne vide')
  }
  return v
}
