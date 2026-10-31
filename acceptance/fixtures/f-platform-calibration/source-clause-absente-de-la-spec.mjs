// acceptance/fixtures/f-platform-calibration/source-clause-absente-de-la-spec.mjs — zone ACCEPTANCE (T77).
//
// SOURCE OU UNE CLAUSE COMPAREE MANQUE DE docs/spec.md (T77.A3) : P4.R4 (« Une reponse FORBIDDEN
// n'est jamais memorisee... ») garde sa mise en oeuvre, son contrat et ses bornes — le modele
// attendu la juge toujours, les sequences ciblees la citent toujours — mais n'a plus de texte
// d'enonce (ni de precisions) : docs/spec.md, rendu a partir de cette source, ne la porte plus.
// C'est exactement le defaut qu'ADR-021 decrit (« une autre [regle] manquait ») : un candidat
// derive des seuls documents ne peut pas l'apprendre. La calibration doit echouer en nommant
// P4.R4 et la periode.
import { sourceAlteree } from './source-commune.mjs'

export const CLAUSE_ABSENTE = 'P4.R4'

export const clauses = sourceAlteree(CLAUSE_ABSENTE, (c) => ({ ...c, text: '', precisions: [] }))
export default clauses
