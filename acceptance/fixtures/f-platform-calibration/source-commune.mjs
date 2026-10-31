// acceptance/fixtures/f-platform-calibration/source-commune.mjs — zone ACCEPTANCE (test-author de T77).
//
// Socle des SOURCES DE CLAUSES ALTEREES que acceptance/T77.spec.ts passe a `bench calibrate
// --clause-source <module>` (section II de la suite). Chaque source alteree part de la source de
// clauses EN VIGUEUR (l'export `platformClauses` de @bench/oracle, lu dans le paquet construit
// packages/oracle/dist, comme le fait la CLI) et ne change QU'UNE clause, par copie : la source en
// vigueur n'est jamais modifiee en place.
//
// Ces modules sont des sources de clauses, pas des candidats : ils importent legitimement la source.
// Le candidat de reference derive des documents (../candidates/f-platform-doc-reference/) n'importe,
// lui, rien de packages/ (la suite le verifie).
import * as oracle from '../../../packages/oracle/dist/index.js'

/** La source en vigueur (tableau de clauses), telle que @bench/oracle l'exporte. */
export const SOURCE_EN_VIGUEUR = oracle.platformClauses ?? oracle.PLATFORM_CLAUSES

/** Copie de la source dont la clause `id` est remplacee par `alterer(clause)`. */
export function sourceAlteree(id, alterer) {
  let vue = 0
  const out = SOURCE_EN_VIGUEUR.map((c) => {
    if (c.id !== id) return c
    vue += 1
    return alterer(c)
  })
  if (vue !== 1) throw new Error(`source-commune : clause ${id} vue ${vue} fois dans la source en vigueur`)
  return out
}
