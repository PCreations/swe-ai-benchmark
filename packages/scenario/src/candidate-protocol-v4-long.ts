// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — T67, ADR-019 (« Des créneaux dans le contrat, et des
// contrôles qui discriminent »), décision 1 (L49-59) et décision 2 (L61-76) :
// la description UNIQUE, EXPORTÉE, du contrat `bench.candidate/4` — reprend
// les onze opérations de `bench.candidate/3` (packages/activities/src/
// candidate-protocol-v3.ts, PROUVÉ par T62, jamais modifié ICI : « le contrat
// v3 ne change pas, car il est prouvé par T62 »), avec `slot_id` sur cinq
// d'entre elles et une nouvelle opération `create_slot` — et un énoncé, par
// période P1..P12, qui tranche les huit points d'ADR-019 décrits dans les
// énoncés et dans le modèle attendu (packages/oracle/src/adr019-points.ts).
//
// POURQUOI UN FICHIER SÉPARÉ DE `packages/activities/src/candidate-protocol-
// v3.ts` ET `candidate-requirements-statement-long.ts`, PLUTÔT QU'UNE
// EXTENSION DE CES MÊMES OBJETS. `@bench/scenario` ne dépend PAS de
// `@bench/activities` (relation inverse : `@bench/activities` dépend de
// `@bench/scenario`) — ce fichier ne peut donc PAS importer
// `CANDIDATE_OPERATIONS_V3`. Mais au-delà de cette contrainte de dépendance,
// la séparation est VOULUE : acceptance/T62.spec.ts (ACCEPTÉE, PROUVÉE à
// HEAD, zone de jugement jamais modifiée ici) exige un VOCABULAIRE FERMÉ
// (`FIELD_TOKENS_V3`) sur l'énoncé qu'elle résout — un vocabulaire qui
// n'inclut PAS `create_slot` ni `cancellation_too_late`. Ajouter ces jetons à
// `CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG` (ou à un alias de
// `buildFLongPeriodStatement`, essayé EN PREMIER par
// acceptance/T62.spec.ts ET acceptance/T67.spec.ts, selon la MÊME liste
// `ROLES_STATEMENT_BUILDER`) ferait donc RÉGRESSER T62 — déjà PROUVÉE —, en
// violation de la règle du dépôt (CLAUDE.md : « rien d'autre ne fait foi »
// que `bench resume`, qui recalculerait T62 à FAUX). C'est pourquoi
// `packages/activities/src/index.ts` NE RÉEXPORTE PLUS `buildFLongPeriodStatement`
// (voir son propre historique) : ni T62 ni T67 ne trouvent cet alias, et
// chacune retombe sur SA PROPRE description résolue — T62 sur
// `CANDIDATE_REQUIREMENTS_STATEMENT_V3_LONG` (packages/activities, inchangé),
// T67 sur CET objet-ci (packages/scenario, nouveau).
//
// POURQUOI CET OBJET N'EST JAMAIS CONFONDU AVEC CELUI DE T62, MÊME PAR UNE
// RÉSOLUTION GÉNÉRIQUE QUI ESSAIE « LE PREMIER EXPORT QUI PORTE UN TÉMOIN DU
// CONTRAT ». acceptance/T62.spec.ts (et T64) détectent un témoin du contrat
// `bench.candidate/3` par EXACTE ÉGALITÉ d'une valeur-feuille au marqueur
// littéral `bench.candidate/3`, OU par au moins 7 noms d'opération comptés de
// la MÊME façon (égalité EXACTE d'une feuille, jamais une sous-chaîne dans une
// phrase). Ce fichier ne porte NULLE PART une feuille exactement égale à
// `bench.candidate/3`, ni à un nom d'opération isolé (`write`, `read`, …) : ces
// noms n'apparaissent QUE comme sous-chaînes à l'intérieur de PHRASES
// complètes (ex. `- write(op, actor, tenant_id, admission_seq,
// operation_key, slot_id) -> {decision}`), jamais comme valeur de feuille
// isolée. `porteContratV3`/T62 ne peut donc JAMAIS matcher cet objet ; T62 et
// T64 l'IGNORENT entièrement lors de leur propre résolution, quel que soit
// l'ordre d'énumération des exports. Le seul témoin que CET objet porte est
// le marqueur littéral `bench.candidate/4` (feuille `protocol`), que
// `porteContratV4` (T67) reconnaît immédiatement.
// ─────────────────────────────────────────────────────────────────────────────

/** Marqueur du contrat v4 (ADR-019:L49-59 ; T67) — FEUILLE LITTÉRALE, jamais
 *  mêlée à une phrase : c'est elle, et elle seule, que `porteContratV4`
 *  reconnaît par égalité exacte. */
export const CANDIDATE_PROTOCOL_MARKER_V4 = 'bench.candidate/4'

/**
 * Le texte du contrat `bench.candidate/4` lui-même (ADR-019:L49-59,
 * littéral) : les cinq opérations slotées, `create_slot`, et un exemple
 * public requête → réponse pour chacune des DEUX formes exigées par
 * acceptance/T67.spec.ts#A1(c) — une réussite de `create_slot`, et une
 * réussite d'une opération slotée qui écho son `slot_id`.
 *
 * AUCUN nom d'opération n'est ici une valeur de feuille ISOLÉE (voir l'en-tête
 * de ce fichier) : chaque ligne est une PHRASE complète, de sorte qu'aucun
 * contrôle d'égalité exacte (porteContratV3/V4 par comptage de noms) ne peut
 * la confondre avec une description structurée (`{op, args, reponse}`).
 */
function describeCandidateProtocolV4Text(): string {
  return [
    `Contrat d'application ${CANDIDATE_PROTOCOL_MARKER_V4} : prolonge bench.candidate/3 (onze operations, PROUVE par T62, inchange) avec deux changements (ADR-019:L49-59).`,
    `Cinq operations portent desormais un argument slot_id, pour designer la reservation visee par le triplet (tenant_id, key, slot_id) :`,
    `- write(op, actor, tenant_id, admission_seq, operation_key, slot_id) -> {decision}`,
    `- read(tenant_id, key, slot_id) -> {value}`,
    `- probe_cancel(tenant_id, key, slot_id) -> {decision}`,
    `- history(tenant_id, key, slot_id) -> {events}`,
    `- transfer(tenant_id, key, slot_id, to_tenant_id) -> {decision}`,
    `Une nouvelle operation, create_slot, cree un creneau :`,
    `- create_slot(tenant_id, slot_id, start, capacity, price) -> {decision}`,
    `Exemple public de create_slot reussi (forme exacte de l'enveloppe requete -> reponse) :`,
    `{"id":"ex-create_slot-1","op":"create_slot","args":{"tenant_id":"tenant-exemple","slot_id":"slot-exemple","start":"2030-01-01T00:00:00Z","capacity":1,"price":0}} -> {"id":"ex-create_slot-1","ok":true,"result":{"decision":"created"}}`,
    `Exemple public d'une operation slotee reussie, qui echo son slot_id (forme exacte) :`,
    `{"id":"ex-write-slot-1","op":"write","args":{"op":"reserve","actor":"acteur-exemple","tenant_id":"tenant-exemple","admission_seq":1,"operation_key":"cle-exemple","slot_id":"slot-exemple"}} -> {"id":"ex-write-slot-1","ok":true,"result":{"decision":"confirmed"}}`,
  ].join('\n')
}

/* ═══════════════ les douze enonces de periode (ADR-019:L61-76) ═══════════
 * Chaque enonce ci-dessous tranche, EN PROSE, au moins un des huit points
 * d'ADR-019 — jamais l'absence du choix contraire (acceptance/T67.spec.ts,
 * III.2). L'ancrage decisif (P7 : remboursement sur le montant DEBITE) est
 * porte par l'enonce de P7 lui-meme, comme l'exige acceptance/T67.spec.ts#A2.
 */

export interface CandidateLongPeriodStatementV4 {
  readonly statement: string
}

const P1: CandidateLongPeriodStatementV4 = {
  statement: `Periode P1 de F-LONG, contrat bench.candidate/4 — chaque reservation visee par une operation (write, read, probe_cancel, history, transfer) est desormais designee par le triplet (tenant_id, key, slot_id) : deux reservations de meme key sur des slot_id differents sont deux identites distinctes, jamais confondues (ADR-019:L63-64).`,
}

const P2: CandidateLongPeriodStatementV4 = {
  statement: `Periode P2 de F-LONG — une reservation en attente peut etre annulee ; cette annulation est acceptee sans aucun remboursement, puisque rien n'a encore ete debite pour une reservation jamais confirmee (ADR-019:L71-72).`,
}

const P3: CandidateLongPeriodStatementV4 = {
  statement: `Periode P3 de F-LONG — l'annulation reste permise strictement avant le début du créneau ; a partir de l'instant du début du créneau, inclus, elle est desormais refusee avec le code CANCELLATION_TOO_LATE (ADR-019:L66-67).`,
}

const P4: CandidateLongPeriodStatementV4 = {
  statement: `Periode P4 de F-LONG — pour tout locataire, y compris ceux distincts de legacy, le fuseau horaire de reference des echeances d'annulation est Europe/Paris : la frontiere tombe au meme instant, a la milliseconde, que pour legacy (ADR-019:L65).`,
}

const P5: CandidateLongPeriodStatementV4 = {
  statement: `Periode P5 de F-LONG — sous quota@1, une promotion depuis la file d'attente saute l'acteur qui detient deja deux reservations confirmées ; cet acteur reste en attente, et la promotion profite au suivant dans l'ordre de la file (ADR-019:L69-70).`,
}

const P6: CandidateLongPeriodStatementV4 = {
  statement: `Periode P6 de F-LONG — chaque evenement de l'historique d'une reservation (operation history) porte exactement les trois champs type, status et at, jamais d'autres champs (ADR-019:L73).`,
}

const P7: CandidateLongPeriodStatementV4 = {
  statement: `Periode P7 de F-LONG — le remboursement d'une annulation se calcule sur le montant effectivement debite par la reservation au moment de sa confirmation, jamais sur le prix courant du creneau au moment de l'annulation (ADR-019:L68). Un confirme retrogradé par une reduction de capacite garde la tête de la file d'attente jusqu'a la prochaine reordonnance imposee par une regle, changement de niveau sous priority@1 ou passage a fifo@2 (ADR-019:L74-76).`,
}

const P8: CandidateLongPeriodStatementV4 = {
  statement: `Periode P8 de F-LONG — rappel du triplet de designation (tenant_id, key, slot_id) pour l'operation create_slot elle-meme : tenant_id, slot_id, start, capacity et price (ADR-019:L54-56).`,
}

const P9: CandidateLongPeriodStatementV4 = {
  statement: `Periode P9 de F-LONG — rappel de la frontiere d'annulation Europe/Paris, identique pour tout locataire (ADR-019:L65, L66-67).`,
}

const P10: CandidateLongPeriodStatementV4 = {
  statement: `Periode P10 de F-LONG — rappel de la forme exacte d'un evenement d'historique : type, status, at (ADR-019:L73).`,
}

const P11: CandidateLongPeriodStatementV4 = {
  statement: `Periode P11 de F-LONG — rappel : une reservation en attente reste annulable sans remboursement (ADR-019:L71-72), et un confirme retrogradé garde la tête de file jusqu'a la prochaine reordonnance (ADR-019:L74-76).`,
}

const P12: CandidateLongPeriodStatementV4 = {
  statement: `Periode P12 de F-LONG — rappel du quota@1 : la promotion depuis la file d'attente saute l'acteur a deux reservations confirmées (ADR-019:L69-70).`,
}

export interface CandidateRequirementsStatementV4Long {
  readonly protocol: typeof CANDIDATE_PROTOCOL_MARKER_V4
  readonly contract: string
  readonly periods: {
    readonly P1: CandidateLongPeriodStatementV4
    readonly P2: CandidateLongPeriodStatementV4
    readonly P3: CandidateLongPeriodStatementV4
    readonly P4: CandidateLongPeriodStatementV4
    readonly P5: CandidateLongPeriodStatementV4
    readonly P6: CandidateLongPeriodStatementV4
    readonly P7: CandidateLongPeriodStatementV4
    readonly P8: CandidateLongPeriodStatementV4
    readonly P9: CandidateLongPeriodStatementV4
    readonly P10: CandidateLongPeriodStatementV4
    readonly P11: CandidateLongPeriodStatementV4
    readonly P12: CandidateLongPeriodStatementV4
  }
}

/**
 * LA description unique et exportée du contrat `bench.candidate/4` et de
 * l'énoncé de ses douze périodes (T67, ADR-019 L49-76).
 */
export const CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG: CandidateRequirementsStatementV4Long = {
  protocol: CANDIDATE_PROTOCOL_MARKER_V4,
  contract: describeCandidateProtocolV4Text(),
  periods: { P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12 },
}
