// acceptance/fixtures/f-platform-calibration/source-texte-augmente.mjs — zone ACCEPTANCE (T77).
//
// SOURCE SANS EFFET SUR AUCUNE REGLE, MAIS DIFFERENTE : le texte de P1.R1 recoit une phrase de
// plus. Le modele attendu est inchange (meme mise en oeuvre), chaque clause comparee reste dans
// docs/spec.md : une calibration du candidat de reference derive des documents y REUSSIT, pour une
// empreinte qui n'est PAS celle de la source en vigueur (T77.A1 : elle ne doit pas ouvrir la campagne).
import { sourceAlteree } from './source-commune.mjs'

export const PHRASE_AJOUTEE = ' Phrase ajoutee par acceptance/T77.spec.ts : elle ne change aucune regle.'

export const clauses = sourceAlteree('P1.R1', (c) => ({ ...c, text: `${c.text}${PHRASE_AJOUTEE}` }))
export default clauses
