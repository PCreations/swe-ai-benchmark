// ─────────────────────────────────────────────────────────────────────────────
// NotImplemented — le refus d'un SQUELETTE, jamais celui d'un contrat.
//
// POURQUOI UNE CLASSE À PART, ET PAS `ContractViolation`.
// `ContractViolation` signifie « cette VALEUR ne respecte pas le §E ». Un
// squelette ne dit rien de la valeur : il dit que la règle n'est pas encore
// écrite. Confondre les deux serait ici une faute mesurable, pas une nuance de
// style — `acceptance/T02.spec.ts` compte un `throw` comme un REFUS dans la
// moitié « montants rejetés » de T02.A4. Un stub qui lèverait une
// `ContractViolation` se ferait donc passer pour la garde qu'il ne contient
// pas, et c'est exactement la lecture que `verification/mutants/T02.json`
// interdit en T02.M8 : « le refus n'est pas une compétence ».
//
// Le cas reste ROUGE malgré tout, parce que la même suite exige ensuite que
// cinq montants valides soient ACCEPTÉS et relus à l'identique — ce qu'un stub
// qui lève ne peut pas simuler. C'est la moitié positive qui fait le rouge.
//
// Ce type disparaît quand T02 devient vert : aucun export public du paquet ne
// doit le lever une fois les règles écrites.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Levée par un export déclaré mais non encore implémenté.
 *
 * Le message porte le préfixe `NOT_IMPLEMENTED` : `verification/runner/red.mjs`
 * ne classe comme rouge légitime que `ASSERTION_FAILED` et
 * `STUB_NOT_IMPLEMENTED`, et un message qui ne se nomme pas laisse le lecteur
 * d'un rapport d'échec incapable de distinguer les deux.
 */
export class NotImplemented extends Error {
  /** Nom qualifié de l'export manquant, p. ex. `contracts.canonicalBytes`. */
  readonly capability: string

  constructor(capability: string) {
    super(`NOT_IMPLEMENTED ${capability}`)
    this.name = 'NotImplemented'
    this.capability = capability
  }
}

export function isNotImplemented(e: unknown): e is NotImplemented {
  return e instanceof NotImplemented
}
