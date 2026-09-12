// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins — SQUELETTE de T09 « Fournir les applications témoins et les
// migrations connues ». AUCUN CODE MÉTIER ICI.
//
// POURQUOI CE FICHIER EXISTE, ET CE QU'IL N'EST PAS.
//
// acceptance/T09.spec.ts ne peut pas devenir rouge « pour la raison attendue »
// tant qu'elle ne trouve aucun point d'entrée : `verification/runner/red.mjs`
// classe un import cassé en MODULE_NOT_FOUND et le REFUSE comme preuve — c'est
// la forme par défaut du TDD en monorepo, elle ne dit rien de ce que le test
// vérifie. Ce module est donc le strict nécessaire pour que la suite CHARGE,
// RÉSOLVE ses trois rôles, les APPELLE, et échoue sur ses propres assertions.
//
// Les trois rôles ci-dessous sont ceux que la suite déclare (section III de
// acceptance/T09.spec.ts) et qu'elle résout par alias :
//   listWitnesses()                         -> catalogue des témoins   (L229)
//   startWitness({ witness, version, dsn }) -> démarre un témoin       (L229)
//   compareBusinessState(observe, attendu)  -> verdict de conformité   (L235)
//
// Chacun LÈVE. Aucun ne répond en succès, aucun n'écrit en base, aucun ne
// fabrique de verdict : un squelette qui rendrait une valeur plausible
// risquerait de rendre VERT un cas creux, ce que la porte rouge nomme VACUOUS.
// Lever est la seule réponse qui n'affirme rien.
//
// EMPLACEMENT. `verification/tasks.json` déclare pour T09 les `source_paths`
// `fixtures` et `infra`. `fixtures/**` n'est revendiqué par AUCUNE zone de
// `verification/ownership.json` — un chemin hors partition déclenche
// UNCLAIMED_PATHS (fail-closed) et n'entre dans aucun input_digest. La racine
// retenue est donc `infra/temoins/`, zone INFRA, écrivable par `implementer`,
// et présente dans la liste RACINES de la suite.
// ─────────────────────────────────────────────────────────────────────────────

/** Levée par chaque rôle tant que T09 n'est pas implémentée. */
export class NotImplemented extends Error {
  constructor(role, detail) {
    super(`STUB_NOT_IMPLEMENTED ${role} — T09 n'est pas implementee : ${detail}`)
    this.name = 'NotImplemented'
    this.code = 'STUB_NOT_IMPLEMENTED'
    this.role = role
    this.task = 'T09'
  }
}

/**
 * Catalogue des témoins : quatre versions d'une petite API de réservation, plus
 * les fixtures fautives nommées — dont `drop-one-row` (cahier L233). Chaque
 * entrée doit porter `{ name, conforming, digest }`.
 */
export function listWitnesses() {
  throw new NotImplemented(
    'listWitnesses',
    'aucun catalogue de temoins : ni le temoin conforme ni la fixture fautive ' +
      "nommee n'existent, et aucun digest n'identifie d'image"
  )
}

/**
 * Démarre le témoin `witness` en version `version` (1..4) sur la base PostgreSQL
 * désignée par `dsn`. Démarrer la version k sur une base portant les données
 * d'une version j < k applique les migrations connues j -> k (cahier L231).
 * Doit rendre un handle `{ baseUrl, digest, stop() }`.
 */
export function startWitness(_options) {
  throw new NotImplemented(
    'startWitness',
    "aucun programme temoin n'est demarre : pas de contrat HTTP public, pas de " +
      'schema applicatif, pas de migration connue'
  )
}

/**
 * Confronte un état métier exporté à l'état attendu et rend le verdict de
 * conformité sur lequel T10 bâtira sa qualification (cahier L235). La
 * comparaison canonise les métadonnées volatiles (L135, L559) et doit NOMMER la
 * différence quand elle refuse.
 */
export function compareBusinessState(_observe, _attendu) {
  throw new NotImplemented(
    'compareBusinessState',
    "aucun comparateur d'etat metier : aucun verdict de conformite n'est rendu, " +
      'et aucune difference ne peut etre nommee'
  )
}

export default { listWitnesses, startWitness, compareBusinessState, NotImplemented }
