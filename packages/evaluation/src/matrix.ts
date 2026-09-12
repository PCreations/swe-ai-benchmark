// ─────────────────────────────────────────────────────────────────────────────
// LA MATRICE TÉMOIN / MUTANT / CONTRÔLE (cahier L243, « Fin : matrice
// témoin/mutant/contrôle enregistrée »).
//
// DEUX MOITIÉS, ET C'EST VOULU.
//
//  • Les lignes DÉCLARÉES viennent du registre des mutants : pour chaque faute
//    de L241, quel mutant l'injecte et quel contrôle doit la voir. Elles
//    existent avant toute exécution, et c'est ce qui fait de la matrice une
//    ATTENTE opposable plutôt qu'un journal de ce qui s'est passé.
//  • Les lignes OBSERVÉES sont ajoutées par le pipeline à chaque qualification :
//    le verdict rendu, le contrôle qui a effectivement rejeté, et le fait que le
//    programme avait DÉMARRÉ (L243).
//
// « ENREGISTRÉE » N'EST PAS « PERSISTÉE SUR DISQUE ». Le cahier demande que la
// matrice existe et soit relisible ; il ne prescrit aucun format de stockage, et
// en inventer un reviendrait à mesurer un artefact plutôt que l'enregistrement.
// Elle est donc tenue en mémoire du processus qui qualifie, et publiée par
// `qualificationMatrix()`.
// ─────────────────────────────────────────────────────────────────────────────
import { SEMANTIC_MUTANTS } from './mutants.js'

/** Une ligne de la matrice : ce qui est attendu, et ce qui a été vu. */
export interface MatrixRow {
  readonly kind: 'declaree' | 'observee'
  readonly witness: string
  readonly mutant: string | null
  readonly fault: string | null
  readonly control: string | null
  readonly expected_verdict: string
  readonly observed_verdict: string | null
  readonly started: boolean | null
  readonly detail: string
}

const OBSERVEES: MatrixRow[] = []

/** Les six lignes déclarées, une par faute obligatoire de L241. */
function lignesDeclarees(): MatrixRow[] {
  return SEMANTIC_MUTANTS.map((m) => ({
    kind: 'declaree' as const,
    witness: m.name,
    mutant: m.name,
    fault: m.fault,
    control: m.control,
    expected_verdict: 'REJETE',
    observed_verdict: null,
    started: null,
    detail: m.description,
  }))
}

export function recordMatrixRow(row: MatrixRow): void {
  OBSERVEES.push(row)
}

/** La matrice publiée : les six attentes, puis tout ce qui a été observé. */
export function qualificationMatrix(): MatrixRow[] {
  return [...lignesDeclarees(), ...OBSERVEES]
}
