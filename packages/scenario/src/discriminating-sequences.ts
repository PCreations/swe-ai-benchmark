// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — T68, ADR-019 (L100-L106) : generation de sequences par
// regle qui exercent les operations et les frontieres de CETTE regle, sur le
// contrat `bench.candidate/4`.
//
// ETAGE ROUGE. SQUELETTE : le seul role de ce fichier leve `NotImplemented`.
// Nom primaire choisi parmi `ROLES_SEQUENCES_PAR_REGLE` d'`acceptance/
// T68.spec.ts` (section III.3 de son en-tete) — `generateSequencesForRule`,
// le premier de la liste d'alias ; aucune source ne fixe ce nom, ADR-019
// decrit un CRITERE (decision 3, L87-91 : « les sequences d'une regle
// exercent cette regle »), jamais une signature de fonction.
//
// CE QUE CE ROLE DEVRA PRODUIRE (ETAGE VERT, PAS ICI). Pour une regle donnee,
// un lot de sequences qui, structurellement, appelle AU MOINS UNE FOIS
// l'operation dediee de cette regle (ADR-019:L24-29, enumeration litterale) —
// `T68.A3` parcourt GENERIQUEMENT la valeur rendue (noeuds JSON, jamais le
// document entier) et exige que cette operation y figure comme valeur
// litterale. Le detail exact de la sequence (quelles frontieres, combien
// d'etapes) n'est fixe par AUCUNE source : une decision du futur etage VERT,
// documentee a ce moment-la, pas ici.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/** Sequence discriminante d'une regle — forme encore OUVERTE (ADR-001 : aucune
 *  source ne la fixe ; `generateSequencesForRule` reste a ecrire). */
export type DiscriminatingSequence = Record<string, unknown>

/**
 * Genere le lot de sequences discriminantes d'une regle (ADR-019 decision 3,
 * L87-91). SQUELETTE : leve `NotImplemented` — aucune regle metier n'est
 * encore ecrite a cet etage.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function generateSequencesForRule(ruleId: string): Promise<readonly DiscriminatingSequence[]> {
  throw new NotImplemented(`scenario.generateSequencesForRule(${ruleId})`)
}
