// ─────────────────────────────────────────────────────────────────────────────
// Horloge injectable.
//
// Livrable explicite de la tâche (cahier L171 : « montants, identités,
// sérialisation canonique, horloge injectable et dérivation de graines dans
// `contracts` ») et instrument de sa condition de fin (L175 : « absence de
// dépendance à `Date.now()` [...] vérifiée par règle d'import et tests à
// horloge imposée. Les timestamps techniques sont produits uniquement par
// adaptateur »).
//
// CE QUE CE MODULE NE CONTIENT PAS : aucune horloge murale. `Date.now()`
// n'apparaît nulle part dans ce paquet, et c'est la moitié statique de L175 —
// la règle se lit au diff d'un fichier de vingt lignes. Une horloge système est
// un ADAPTATEUR ; elle vit au bord du programme, jamais dans un contrat, sans
// quoi toute fonction de domaine pourrait lire l'heure sans qu'aucun appelant
// ne l'ait voulu.
//
// POURQUOI UN EXPORT DISTINCT DU GÉNÉRATEUR. Un générateur peut rejouer son
// vecteur pendant qu'une fonction de domaine lit l'heure murale à côté : les
// deux propriétés sont indépendantes, et `verification/mutants/T02.json` leur
// consacre deux contre-épreuves séparées (T02.M6 pour la graine, T02.M7 pour
// l'horloge).
// ─────────────────────────────────────────────────────────────────────────────
import { ContractViolation } from './errors.js'

/**
 * Lecture d'un instant. §E (cahier L80) : « timestamps UTC ISO 8601 ».
 */
export interface Clock {
  readonly now: () => string
}

/**
 * §E : timestamps UTC ISO 8601. Le `Z` final est OBLIGATOIRE — un décalage
 * `+02:00` désignerait le même instant sous deux textes différents, donc deux
 * empreintes canoniques pour un seul fait.
 */
const UTC_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/

/**
 * Horloge qui rend l'instant qu'on lui a imposé, et lui seul.
 * `instant` est un timestamp UTC ISO 8601 (cahier L80).
 *
 * L'instant est rendu TEL QUEL, sans passer par `Date` : une normalisation
 * silencieuse ferait dépendre le texte d'un fuseau ou d'une version de moteur,
 * alors que §G compare les résultats métier octet à octet.
 */
export function fixedClock(instant: string): Clock {
  if (typeof instant !== 'string' || !UTC_ISO_8601.test(instant)) {
    throw new ContractViolation('TIMESTAMP_NOT_UTC_ISO8601', '$', String(instant))
  }
  return { now: () => instant }
}
