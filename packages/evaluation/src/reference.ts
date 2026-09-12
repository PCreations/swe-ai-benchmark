// ─────────────────────────────────────────────────────────────────────────────
// Les paramètres du contrat métier que T10 exerce, et d'où ils viennent.
//
// CE FICHIER NE LIT PAS `acceptance/reference/**`. Cette racine est GELÉE
// (docs/FROZEN_ROOTS.json) et appartient à la zone de JUGEMENT : une
// implémentation qui s'y alimenterait ferait de la fixture qui la juge une
// entrée de son propre calcul. Les valeurs ci-dessous sont donc relevées dans
// le CAHIER, à la ligne indiquée, exactement comme la suite d'acceptation
// relève de son côté les siennes dans la fixture gelée. Les deux doivent
// coïncider — et c'est précisément ce que T10.A3, A5 et A6 vérifient, puisque
// leurs scénarios contradictoires sont construits en INVERSANT une issue de la
// racine gelée.
//
//   L119  « annulation permise au moins 24 heures avant le début, frontière
//         INCLUSE » ; locataire initial `legacy` ; créneau de capacité 1.
//   L123  le locataire `other` est créé en P4 ; le verdict intertenant est
//         `NOT_FOUND` sans donnée métier divulguée.
//
// LES INSTANTS CI-DESSOUS NE SONT PAS CEUX DE §F. Les contrôles de
// qualification sont des PROBES du pipeline, pas une rejouée de §F : ils
// utilisent leurs propres créneaux et leurs propres acteurs, sur une base qui
// leur appartient. Ce qu'ils partagent avec §F, c'est la RÈGLE — 24 h,
// frontière incluse, capacité stricte, FIFO par séquence d'admission — jamais
// les valeurs de la fixture.
// ─────────────────────────────────────────────────────────────────────────────

/** Locataire d'origine ; il porte les données migrées en P4 (cahier L119). */
export const LOCATAIRE_PRINCIPAL = 'legacy'

/** Locataire créé au palier 4 ; c'est lui qui rend le cloisonnement observable. */
export const LOCATAIRE_ETRANGER = 'other'

/** « Au moins 24 heures avant le début » (cahier L119). */
export const DELAI_ANNULATION_HEURES = 24

/** « Frontière INCLUSE » (cahier L119) : l'égalité stricte est acceptée. */
export const FRONTIERE_INCLUSE = true

/** Le palier de schéma qui matérialise locataires et date limite. */
export const VERSION_MULTI_LOCATAIRE = 4

/** Le palier initial : ni file d'attente, ni date limite, ni locataire. */
export const VERSION_INITIALE = 1

/* ── instants propres aux probes de qualification ────────────────────────── */

/** Instant métier des demandes des probes. */
export const PROBE_HORLOGE = '2030-01-01T00:00:00Z'

/** Début du créneau des probes. */
export const PROBE_DEBUT_CRENEAU = '2030-01-10T12:00:00Z'

/** La frontière d'annulation, CALCULÉE et non recopiée. */
export function frontiereAnnulation(debutCreneau: string, delaiHeures: number): string {
  return new Date(Date.parse(debutCreneau) - delaiHeures * 3_600_000).toISOString()
}

/** Un instant décalé d'un nombre entier de millisecondes. */
export function instantDecale(instant: string, millisecondes: number): string {
  return new Date(Date.parse(instant) + millisecondes).toISOString()
}
