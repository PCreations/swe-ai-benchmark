// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — l'ÉNONCÉ DES DOUZE PÉRIODES de F-LONG, à destination du
// candidat (T62, ADR-018 L184 : « énoncé de chaque période de F-LONG ;
// exemples publics de chaque forme de réponse » ; verification/
// tasks.extensions.json : T62 est une tâche d'EXTENSION, pas du cahier).
//
// CE QUE CE FICHIER FIXE (II.2/II.3 d'acceptance/T62.spec.ts — AUCUNE de ces
// valeurs n'a été obtenue en exécutant une implémentation de T62 : ce fichier
// EST cette implémentation) :
//
//   - un énoncé en prose, par période P1..P12 du scénario F-LONG, qui cite
//     LITTÉRALEMENT chaque identifiant de règle active à cette période
//     (`reserve@1`, `cancel@3`, …, repris À L'IDENTIQUE des identifiants que
//     recalcule déjà acceptance/T61.spec.ts/packages/oracle/src/f-long.ts,
//     suite ACCEPTÉE, PROUVÉE à HEAD — jamais re-dérivés ici) ;
//   - pour chaque période de TRANSITION, l'identifiant de la règle REMPLACÉE
//     ou RETIRÉE, nommé comme tel (« remplacée »/« retirée ») ;
//   - le vocabulaire FERMÉ des noms de champ et d'opération du contrat
//     `bench.candidate/3` (./candidate-protocol-v3.ts) — AUCUN autre jeton
//     « en_tiret_bas » n'est introduit, SAUF les deux formes d'erreur réelles
//     qu'ADR-018 nomme littéralement (`QUOTA_EXCEEDED` L123, `NOT_FOUND`
//     L155) et qu'A2 exige en exemple public de forme EXACTE — ces deux
//     valeurs sont les codes RÉELS que le modèle attendu produit (packages/
//     oracle/src/f-long.ts, déjà PROUVÉ par T61), jamais un gabarit ;
//   - AUCUNE valeur numérique contrôlée (A3) : les montants et remboursements
//     réels de P7/P9 (acceptance/reference-long/F-LONG.json) ne figurent
//     JAMAIS ici — seuls les PARAMÈTRES de règle (barème horaire, échéance
//     locale) sont énoncés, jamais le résultat d'un calcul sur le scénario ;
//   - AUCUNE règle d'une période ULTÉRIEURE (A4) : l'énoncé de P<n> ne cite
//     que les identifiants actifs À P<n> ou plus tôt (y compris une règle
//     tout juste remplacée/retirée À P<n>, jamais une règle qui ne naît
//     qu'après P<n>).
//
// D'OÙ VIENNENT LES IDENTIFIANTS ET LES TRANSITIONS. Table REMPLACEE_A/
// RETIREE_A reprise de la table ADR-018 L86-155, DÉJÀ recalculée et PROUVÉE
// par acceptance/T61.spec.ts (section V) / packages/oracle/src/f-long.ts —
// jamais re-dérivée ici (ADR-001).
// ─────────────────────────────────────────────────────────────────────────────
import { CANDIDATE_OPERATIONS_V3, CANDIDATE_PROTOCOL_MARKER_V3 } from './candidate-protocol-v3.js'

/* ═══════════════════ les douze clés de période ════════════════════════ */

export const CANDIDATE_LONG_PERIOD_KEYS = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12',
] as const
export type CandidateLongPeriodKey = (typeof CANDIDATE_LONG_PERIOD_KEYS)[number]

export interface CandidateLongPeriodStatement {
  /** L'énoncé en langue naturelle des règles actives à cette période (A1),
   *  et exemples publics de forme de réponse quand ADR-018 en impose un (A2). */
  readonly statement: string
  readonly prompt: string
}

/* ═══════════════════ P1-P4 : reprise de F-RESERVATION ══════════════════
 * ADR-018 L86-89 : « P1 à P4 reprennent F-RESERVATION [...] à l'identique »
 * — mêmes identifiants que packages/oracle/src/f-long.ts/REGLES_ADR. */

const P1: CandidateLongPeriodStatement = {
  statement: [
    `Période P1 de F-LONG — règles actives : \`reserve@1\` (admission sur un créneau), \`idempotence@1\` (rejouer la même clé \`operation_key\` avec les mêmes arguments renvoie le même résultat, sans doublon), \`fifo@1\` (file d'attente ordonnée par séquence d'admission, \`admission_seq\`), \`cancel@1\` (annulation sans restriction).`,
    `Aucune autre règle de F-LONG n'est encore active à cette période.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

const P2: CandidateLongPeriodStatement = {
  statement: [
    `Période P2 de F-LONG — mêmes règles actives qu'en P1 : \`reserve@1\`, \`idempotence@1\`, \`fifo@1\`, \`cancel@1\`.`,
    `Aucune règle n'est encore remplacée ni retirée à cette période.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

const P3: CandidateLongPeriodStatement = {
  statement: [
    `Période P3 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`fifo@1\`, et désormais \`cancel@2\` (annulation permise jusqu'à 24 heures avant le début du créneau, frontière incluse), qui remplace \`cancel@1\` : \`cancel@1\` est remplacée par \`cancel@2\` à cette période, sans restriction en deçà de ce délai sous l'ancienne règle.`,
    `Aucune isolation entre locataires n'est encore active.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

const P4: CandidateLongPeriodStatement = {
  statement: [
    `Période P4 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`fifo@1\`, \`cancel@2\`, et désormais \`isolation@1\` (les locataires, distingués par \`tenant_id\`, sont isolés : aucune lecture ni modification d'un autre locataire).`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P5 : capacité modifiable ═══════════════════════════
 * ADR-018 L91-98. Nouvelle opération `set_capacity`. */

const P5: CandidateLongPeriodStatement = {
  statement: [
    `Période P5 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`fifo@1\`, \`cancel@2\`, \`isolation@1\`, et désormais \`capacity@1\` (la capacité d'un créneau peut être modifiée par l'opération \`set_capacity\`, qui prend \`tenant_id\`, \`slot_id\` et la nouvelle capacité, et renvoie une \`decision\`).`,
    `Augmenter une capacité promeut les attentes dans l'ordre de la file (\`fifo@1\`) ; la réduire sous le nombre de réservations confirmées rétrograde les confirmées les plus récentes, par séquence d'admission décroissante, en tête de la file d'attente.`,
    `Aucune règle de priorité, d'argent, de quota, de fuseau horaire, d'historique ni de transfert n'est encore active à cette période.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P6 : priorités ═════════════════════════════════════
 * ADR-018 L100-105. `priority@1` remplace `fifo@1`. Nouvelle opération `set_level`. */

const P6: CandidateLongPeriodStatement = {
  statement: [
    `Période P6 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`cancel@2\`, \`isolation@1\`, \`capacity@1\`, et désormais \`priority@1\`, qui remplace \`fifo@1\` : \`fifo@1\` est remplacée par \`priority@1\` à cette période.`,
    `Chaque acteur a un niveau, \`standard\` par défaut ou \`gold\`, modifiable par l'opération \`set_level\` (\`tenant_id\`, l'acteur, le niveau), qui renvoie une \`decision\`. La file d'attente d'un créneau est désormais ordonnée par niveau (\`gold\` d'abord), puis par séquence d'admission ; un changement de niveau réordonne immédiatement les files existantes.`,
    `Aucune règle d'argent, de quota, de fuseau horaire, d'historique ni de transfert n'est encore active.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P7 : argent ═════════════════════════════════════════
 * ADR-018 L107-116. `price@1` ; `cancel@3` remplace `cancel@2`. Nouvelle
 * opération `balance`. AUCUN montant réel du scénario (A3) : seuls les
 * PARAMÈTRES du barème (48h/24h, 100%/50%/0%) sont énoncés. */

const P7: CandidateLongPeriodStatement = {
  statement: [
    `Période P7 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`priority@1\`, \`isolation@1\`, \`capacity@1\`, et désormais \`price@1\` et \`cancel@3\`, qui remplace \`cancel@2\` : \`cancel@2\` est remplacée par \`cancel@3\` à cette période.`,
    `\`price@1\` : chaque créneau a un prix ; une confirmation intervenue à partir de cette période débite ce prix du solde de l'acteur, consultable par l'opération \`balance\` (\`tenant_id\`, l'acteur), qui renvoie un champ \`balance\`.`,
    `\`cancel@3\` : l'annulation est désormais permise jusqu'au début du créneau, avec un remboursement dégressif selon le délai avant le début — intégral à 48 heures ou plus, moitié (arrondie au centime inférieur) entre 24 et 48 heures, nul en deçà de 24 heures ; ceci est désormais permis, là où \`cancel@2\` le refusait en deçà de 24 heures.`,
    `Aucune règle de quota, de fuseau horaire, d'historique ni de transfert n'est encore active.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P8 : quotas ═════════════════════════════════════════
 * ADR-018 L118-123. `quota@1`. Exemple public d'erreur `QUOTA_EXCEEDED`
 * (forme RÉELLE, pas un gabarit — A2, ancrage décisif). */

const P8: CandidateLongPeriodStatement = {
  statement: [
    `Période P8 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`priority@1\`, \`cancel@3\`, \`isolation@1\`, \`capacity@1\`, \`price@1\`, et désormais \`quota@1\`.`,
    `\`quota@1\` : un acteur ne peut détenir plus de deux réservations confirmées dans un même locataire. Une réservation \`write\` au-delà de ce quota est refusée, sans mise en attente ni débit, par une réponse d'erreur de cette forme exacte :`,
    `{"id":"ex-erreur-quota-1","op":"write","args":{"op":"reserve","actor":"acteur-exemple","tenant_id":"tenant-exemple","admission_seq":1,"operation_key":"cle-exemple"}} -> {"id":"ex-erreur-quota-1","ok":false,"error":{"code":"QUOTA_EXCEEDED","message":"quota depasse"}}`,
    `Aucune règle de fuseau horaire, d'historique ni de transfert n'est encore active.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P9 : fuseau horaire ═════════════════════════════════
 * ADR-018 L125-133. `cancel@4` remplace `cancel@3`. AUCUN montant réel (A3). */

const P9: CandidateLongPeriodStatement = {
  statement: [
    `Période P9 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`priority@1\`, \`isolation@1\`, \`capacity@1\`, \`price@1\`, \`quota@1\`, et désormais \`cancel@4\`, qui remplace \`cancel@3\` : \`cancel@3\` est remplacée par \`cancel@4\` à cette période.`,
    `\`cancel@4\` : pour un locataire à l'heure \`Europe/Paris\`, le remboursement est intégral si l'annulation a lieu au plus tard à 18:00 heure locale la veille du jour local du début du créneau, nul au-delà de cette échéance — y compris à travers un changement d'heure d'été ou d'hiver.`,
    `Aucune règle d'historique ni de transfert n'est encore active.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P10 : historique ════════════════════════════════════
 * ADR-018 L135-140. `history@1`. Nouvelle opération `history`. */

const P10: CandidateLongPeriodStatement = {
  statement: [
    `Période P10 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`priority@1\`, \`cancel@4\`, \`isolation@1\`, \`capacity@1\`, \`price@1\`, \`quota@1\`, et désormais \`history@1\`.`,
    `\`history@1\` : nouvelle opération \`history\` (\`tenant_id\`, la clé), qui renvoie un champ \`events\`, la liste ordonnée des événements d'une réservation. Les événements antérieurs à cette période ne sont pas exigés ; chaque réservation existant à l'entrée de cette période commence par un unique événement \`migrated\` qui porte son statut courant.`,
    `Aucune règle de transfert n'est encore active.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P11 : retraits (fifo@2, retrait de quota@1) ════════
 * ADR-018 L142-147. `fifo@2` remplace `priority@1` ; `quota@1` est retiré. */

const P11: CandidateLongPeriodStatement = {
  statement: [
    `Période P11 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`cancel@4\`, \`isolation@1\`, \`capacity@1\`, \`price@1\`, \`history@1\`, et désormais \`fifo@2\`, qui remplace \`priority@1\` : \`priority@1\` est remplacée par \`fifo@2\` à cette période — les niveaux n'ont plus d'effet sur l'ordre de la file, qui n'est plus ordonnée que par séquence d'admission.`,
    `\`quota@1\` est retirée à cette période : une réservation supplémentaire n'est plus refusée pour ce motif.`,
    `Aucune règle de transfert n'est encore active.`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ P12 : transfert ═════════════════════════════════════
 * ADR-018 L149-155. `transfer@1`. Nouvelle opération `transfer`. Exemples
 * publics RÉELS de `NOT_FOUND` et de valeur nulle (A2, ancrage décisif). */

const P12: CandidateLongPeriodStatement = {
  statement: [
    `Période P12 de F-LONG — règles actives : \`reserve@1\`, \`idempotence@1\`, \`fifo@2\`, \`cancel@4\`, \`isolation@1\`, \`capacity@1\`, \`price@1\`, \`history@1\`, et désormais \`transfer@1\`.`,
    `\`transfer@1\` : nouvelle opération \`transfer\` (\`tenant_id\`, la clé, \`to_tenant_id\`), qui renvoie une \`decision\`, pour transférer une réservation d'un locataire à un autre, à l'initiative du locataire d'origine. Après transfert, la réservation n'est plus lisible, par \`read\`, que depuis le locataire de destination.`,
    `Lue depuis le locataire de destination, la réponse porte le statut réel. Lue depuis le locataire d'origine, la réponse est de cette forme exacte, valeur nulle :`,
    `{"id":"ex-lecture-origine-1","op":"read","args":{"tenant_id":"tenant-exemple-origine","key":"acteur-exemple"}} -> {"id":"ex-lecture-origine-1","ok":true,"result":{"value":null}}`,
    `Lue depuis tout autre locataire, la réponse est une erreur de cette forme exacte :`,
    `{"id":"ex-erreur-lecture-tiers-1","op":"read","args":{"tenant_id":"tenant-exemple-tiers","key":"acteur-exemple"}} -> {"id":"ex-erreur-lecture-tiers-1","ok":false,"error":{"code":"NOT_FOUND","message":"introuvable"}}`,
  ].join(' '),
  get prompt() {
    return this.statement
  },
}

/* ═══════════════════ la description UNIQUE, EXPORTÉE ═══════════════════ */

export interface CandidateRequirementsStatementV3Long {
  readonly protocol: typeof CANDIDATE_PROTOCOL_MARKER_V3
  readonly operations: typeof CANDIDATE_OPERATIONS_V3
  readonly periods: {
    readonly P1: CandidateLongPeriodStatement
    readonly P2: CandidateLongPeriodStatement
    readonly P3: CandidateLongPeriodStatement
    readonly P4: CandidateLongPeriodStatement
    readonly P5: CandidateLongPeriodStatement
    readonly P6: CandidateLongPeriodStatement
    readonly P7: CandidateLongPeriodStatement
    readonly P8: CandidateLongPeriodStatement
    readonly P9: CandidateLongPeriodStatement
    readonly P10: CandidateLongPeriodStatement
    readonly P11: CandidateLongPeriodStatement
    readonly P12: CandidateLongPeriodStatement
  }
}

/**
 * LA description unique et exportée de l'énoncé des douze périodes de F-LONG
 * (T62, ADR-018 L184) — porte, dans le MÊME objet, le témoin du contrat
 * `bench.candidate/3` et les douze énoncés de période, pour que l'énoncé et
 * le vocabulaire du contrat ne puissent jamais diverger (même discipline que
 * `CANDIDATE_REQUIREMENTS_STATEMENT_V2`, T53).
 */
export const CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG: CandidateRequirementsStatementV3Long = {
  protocol: CANDIDATE_PROTOCOL_MARKER_V3,
  operations: CANDIDATE_OPERATIONS_V3,
  periods: { P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12 },
}

function normalizedLongPeriodKey(raw: string): CandidateLongPeriodKey | null {
  const upper = raw.trim().toUpperCase()
  return (CANDIDATE_LONG_PERIOD_KEYS as readonly string[]).includes(upper) ? (upper as CandidateLongPeriodKey) : null
}

/** Résout une période à partir d'une clé (`P1`..`p12`) ou d'un index (1-based). */
function resolveLongPeriodKey(arg: unknown): CandidateLongPeriodKey | null {
  if (typeof arg === 'string') return normalizedLongPeriodKey(arg)
  if (typeof arg === 'number' && Number.isInteger(arg) && arg >= 1 && arg <= CANDIDATE_LONG_PERIOD_KEYS.length) {
    return CANDIDATE_LONG_PERIOD_KEYS[arg - 1] as CandidateLongPeriodKey
  }
  if (arg !== null && typeof arg === 'object') {
    const obj = arg as { readonly period?: unknown; readonly periodKey?: unknown }
    if (typeof obj.period === 'string') return normalizedLongPeriodKey(obj.period)
    if (typeof obj.periodKey === 'string') return normalizedLongPeriodKey(obj.periodKey)
  }
  return null
}

/** Le prompt d'une période de F-LONG (ADR-018 L184) — tel que déclaré par
 *  `CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG`, jamais une reconstruction séparée. */
export function buildFLongPeriodStatement(period: unknown): string {
  const key = resolveLongPeriodKey(period)
  if (key === null) {
    throw new Error(
      `buildFLongPeriodStatement : période non reconnue (${JSON.stringify(period)}) — attendu l'une de ${CANDIDATE_LONG_PERIOD_KEYS.join(', ')}`,
    )
  }
  return CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG.periods[key].prompt
}
