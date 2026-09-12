// ─────────────────────────────────────────────────────────────────────────────
// Horloge injectable — SQUELETTE T02.
//
// Livrable explicite de la tâche (cahier L171 : « montants, identités,
// sérialisation canonique, horloge injectable et dérivation de graines dans
// `contracts` ») et instrument de sa condition de fin (L175 : « absence de
// dépendance à `Date.now()` [...] vérifiée par règle d'import et tests à
// horloge imposée. Les timestamps techniques sont produits uniquement par
// adaptateur »).
//
// POURQUOI UN EXPORT DISTINCT DU GÉNÉRATEUR. Un générateur peut rejouer son
// vecteur pendant qu'une fonction de domaine lit l'heure murale à côté : les
// deux propriétés sont indépendantes, et `verification/mutants/T02.json` leur
// consacre deux contre-épreuves séparées (T02.M6 pour la graine, T02.M7 pour
// l'horloge).
//
// ÉTAT : LÈVE. La variante « rendre une constante » est précisément la mutation
// que T02.M7 braque sur ce point — deux horloges construites sur deux instants
// différents s'y confondraient.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from './not-implemented.js'

/**
 * Lecture d'un instant. §E (cahier L80) : « timestamps UTC ISO 8601 ».
 */
export interface Clock {
  readonly now: () => string
}

/**
 * Horloge qui rend l'instant qu'on lui a imposé, et lui seul.
 * `instant` est un timestamp UTC ISO 8601 (cahier L80).
 */
export function fixedClock(_instant: string): Clock {
  throw new NotImplemented('contracts.fixedClock')
}
