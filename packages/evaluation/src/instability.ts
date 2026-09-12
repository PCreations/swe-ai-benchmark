// ─────────────────────────────────────────────────────────────────────────────
// LA DÉTECTION D'INSTABILITÉ — « DIX RÉPÉTITIONS détectent l'instabilité de la
// fixture, sans prétendre exclure toutes les instabilités rares » (cahier
// L243).
//
// L'INSTABILITÉ EST UNE PROPRIÉTÉ DE VARIANCE, PAS D'ÉCHEC. Un évaluateur qui
// échoue DIX fois sur DIX est parfaitement déterministe : il est STABLE, et
// non qualifié. Confondre « a échoué » et « est instable » ferait de ce
// détecteur un compteur d'échecs, qui déclarerait instable tout ce qui est
// rouge et n'apprendrait rien sur la fixture. C'est la seule décision de
// contrat de ce fichier, et c'est elle qui est mesurable : les deux évaluateurs
// CONSTANTS — succès constant ET échec constant — doivent ressortir STABLES.
//
// LES DIX RÉPÉTITIONS SONT EXÉCUTÉES, PAS DÉCLARÉES. `repetitions` est rendu
// APRÈS la boucle, à partir du nombre d'appels réellement faits : écrire `10`
// sans appeler dix fois est exactement le mutant que
// `verification/mutants/T10.json` pose sur ce rôle (M4a).
//
// CE QUE CE DÉTECTEUR NE PRÉTEND PAS. L243 le dit lui-même : il n'exclut pas
// « toutes les instabilités rares ». Dix tirages voient l'alternance ; ils ne
// voient pas un échec sur mille. Le rapport publie donc la SÉQUENCE OBSERVÉE,
// de sorte qu'un lecteur sache sur quoi la conclusion porte.
// ─────────────────────────────────────────────────────────────────────────────
import {
  QualificationViolation,
  requireExactKeys,
  requireFlatObject,
} from './errors.js'

/** « Dix répétitions » (cahier L243). */
export const REPETITIONS_PAR_DEFAUT = 10

/** Convention d'appel III.6 : `evaluate` rend un booléen — `true` = succès. */
export interface InstabilityInput {
  readonly evaluate: () => boolean | Promise<boolean>
  readonly repetitions?: number
}

export interface InstabilityReport {
  readonly schema: 'bench.qualification.instability/1'
  readonly repetitions: number
  readonly unstable: boolean
  readonly stable: boolean
  readonly verdict: 'STABLE' | 'INSTABLE'
  readonly successes: number
  readonly failures: number
  readonly observations: readonly boolean[]
}

export async function detectInstability(input: InstabilityInput): Promise<InstabilityReport> {
  const o = requireFlatObject(input, '/detectInstability')
  requireExactKeys(o, ['evaluate'], ['repetitions'], '/detectInstability')
  const evaluate = o['evaluate']
  if (typeof evaluate !== 'function') {
    throw new QualificationViolation(
      'TYPE_MISMATCH',
      '/detectInstability/evaluate',
      'fonction rendant un booleen attendue',
    )
  }
  const demandees = o['repetitions']
  if (demandees !== undefined && (!Number.isInteger(demandees) || (demandees as number) < 1)) {
    throw new QualificationViolation(
      'TYPE_MISMATCH',
      '/detectInstability/repetitions',
      'entier strictement positif attendu',
    )
  }
  const cible = demandees === undefined ? REPETITIONS_PAR_DEFAUT : (demandees as number)

  const observations: boolean[] = []
  for (let i = 0; i < cible; i += 1) {
    const brut: unknown = await Promise.resolve((evaluate as () => unknown)())
    if (typeof brut !== 'boolean') {
      throw new QualificationViolation(
        'TYPE_MISMATCH',
        `/detectInstability/evaluate/${String(i)}`,
        `booleen attendu, ${typeof brut} rendu`,
      )
    }
    observations.push(brut)
  }

  const successes = observations.filter((x) => x).length
  const failures = observations.length - successes
  // VARIANCE, et rien d'autre : instable si les répétitions ne s'accordent pas.
  const unstable = successes > 0 && failures > 0

  return {
    schema: 'bench.qualification.instability/1',
    repetitions: observations.length,
    unstable,
    stable: !unstable,
    verdict: unstable ? 'INSTABLE' : 'STABLE',
    successes,
    failures,
    observations,
  }
}
