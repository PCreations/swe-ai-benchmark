// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T68, ADR-019 (L100-L106) : un candidat de reference
// fidele a TOUTES les regles de F-LONG, un candidat PRIVE d'une seule regle,
// et la notation de l'un ou l'autre sur une regle a une periode donnee.
//
// ETAGE ROUGE. SQUELETTE : les trois roles de ce fichier levent
// `NotImplemented`. Noms primaires choisis parmi les listes d'alias
// correspondantes d'`acceptance/T68.spec.ts` (section III) —
// `createFullReferenceCandidate` (ROLES_CANDIDAT_FIDELE),
// `createReferenceCandidateWithoutRule` (ROLES_CANDIDAT_PRIVE),
// `scoreCandidateOnRule` (ROLES_NOTATION) — aucune source ne fixe ces noms,
// ADR-019 decrit un CRITERE (decision 3, L87-91 : « un candidat de reference
// prive de cette seule regle »), jamais une signature de fonction.
//
// CE QUE CES ROLES DEVRONT PRODUIRE (ETAGE VERT, PAS ICI). `T68.A1` exige
// qu'un candidat fidele note EXACTEMENT 1 sur chaque regle active a chaque
// periode ou elle l'est (ADR-019:L104) ; `T68.A2` exige que le MEME candidat,
// prive d'une seule regle, note STRICTEMENT MOINS DE 1 sur elle. Le detail
// exact de la construction d'un candidat et du mecanisme de notation n'est
// fixe par AUCUNE source : une decision du futur etage VERT, documentee a ce
// moment-la, pas ici.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/** Candidat de reference — forme encore OUVERTE (ADR-001 : aucune source ne
 *  la fixe ; les trois roles de ce fichier restent a ecrire). */
export type ReferenceCandidate = Record<string, unknown>

/**
 * Construit un candidat de reference fidele a TOUTES les regles de F-LONG
 * (ADR-019 decision 3, L87-91). SQUELETTE : leve `NotImplemented`.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function createFullReferenceCandidate(): Promise<ReferenceCandidate> {
  throw new NotImplemented('activities.createFullReferenceCandidate')
}

/**
 * Construit le MEME candidat de reference, prive d'une seule regle
 * (ADR-019 decision 3, L87-91). SQUELETTE : leve `NotImplemented`.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function createReferenceCandidateWithoutRule(ruleId: string): Promise<ReferenceCandidate> {
  throw new NotImplemented(`activities.createReferenceCandidateWithoutRule(${ruleId})`)
}

/**
 * Note un candidat (fidele ou prive) sur une regle a une periode donnee —
 * un nombre dans [0,1] (ADR-019:L104). SQUELETTE : leve `NotImplemented`.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function scoreCandidateOnRule(
  candidate: ReferenceCandidate,
  ruleId: string,
  periodId: string,
): Promise<number> {
  throw new NotImplemented(`activities.scoreCandidateOnRule(${ruleId}, ${periodId})`)
}
