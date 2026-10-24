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

import {
  ExpectedModelV4,
  F_LONG_V4_RESPONSE_FIELDS,
  F_LONG_V4_STATUSES,
  activeRulesV4,
  fLongMigratedHistoryFactV4,
  fLongScoringClockV4,
  type SequenceStep,
  type StepExpectation,
} from './discriminating-sequences.js'

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

/* ═══════════ T69 — le CONTRAT D'INTERFACE de chaque periode (ADR-020) ═══════
 * PRINCIPE (ADR-020) : le contrat fait partie de la specification de la
 * periode, comme dans un vrai projet. Ce bloc rend, pour une periode, le
 * contrat d'interface EN VIGUEUR : chaque operation et ses arguments, chaque
 * reponse comparee avec ses valeurs exactes et le champ qui les porte, chaque
 * code d'erreur, un exemple public requete -> reponse (lie par `id`) de chaque
 * forme de reponse, et ce que la periode ajoute, change ou retire.
 *
 * UNE SEULE SOURCE. Aucune valeur n'est ecrite ici a la main : la periode est
 * SONDEE en appliquant une batterie d'etapes-gabarits au modele attendu qui
 * note cette periode (`ExpectedModelV4`, celui-la meme qui calcule l'attendu de
 * chaque etape des lots de T68 et des lots T66-base), a l'horloge du notateur
 * (`fLongScoringClockV4`). Les decisions, statuts et codes cites sont ceux que
 * le modele rend ; une operation que le modele refuse a cette periode (regle
 * inactive) est hors du contrat de la periode. Les noms de champs sont ceux que
 * lit le notateur (`F_LONG_V4_RESPONSE_FIELDS`, `judgeStep`) ; le premier
 * evenement `migrated` est le fait gele que compare le lot de `history@1`
 * (`fLongMigratedHistoryFactV4`).
 *
 * AUCUN EXEMPLE NE REPRODUIT UNE SEQUENCE : les arguments des exemples
 * (locataires `tenant-exemple*`, acteurs `acteur-exemple*`, creneaux
 * `slot-exemple*`, instant d'horloge decale de 7 min 13,5 s) n'apparaissent
 * dans aucune sequence generee.
 */

type ContractStatus = (typeof F_LONG_V4_STATUSES)[number]

interface ContractOperation {
  readonly op: string
  readonly args: readonly string[]
  readonly returns: string
  readonly sense: string
}

const F = F_LONG_V4_RESPONSE_FIELDS

const CONTRACT_OPERATIONS: readonly ContractOperation[] = [
  { op: 'create_tenant', args: ['tenant_id'], returns: '{}', sense: 'cree un locataire (rejouer la creation est sans effet).' },
  { op: 'advance_clock', args: ['to'], returns: '{}', sense: "fixe l'instant courant (ISO 8601) ; toutes les echeances se jugent a cet instant." },
  { op: 'create_slot', args: ['tenant_id', 'slot_id', 'start', 'capacity', 'price'], returns: `{${F.decision}}`, sense: 'cree un creneau du locataire (debut, capacite, prix).' },
  { op: 'write', args: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key', 'slot_id'], returns: `{${F.decision}}`, sense: "reserve ou annule la reservation de l'acteur sur le creneau ; rejouer la meme operation_key rend le meme resultat sans nouvel effet." },
  { op: 'read', args: ['tenant_id', 'key', 'slot_id'], returns: `{${F.value}}`, sense: "lit la reservation de l'acteur `key` sur le creneau, designee par (tenant_id, key, slot_id)." },
  { op: 'probe_cancel', args: ['tenant_id', 'key', 'slot_id'], returns: `{${F.decision}}`, sense: "dit si l'annulation de cette reservation serait permise maintenant, sans rien modifier." },
  { op: 'fingerprint', args: [], returns: '{sha256}', sense: "empreinte de l'etat (non comparee par le notateur)." },
  { op: 'set_capacity', args: ['tenant_id', 'slot_id', 'capacity'], returns: `{${F.decision}}`, sense: "change la capacite d'un creneau (promotion ou retrogradation selon les regles)." },
  { op: 'set_level', args: ['tenant_id', 'actor', 'level'], returns: `{${F.decision}}`, sense: "fixe le niveau d'un acteur (gold ou standard)." },
  { op: 'balance', args: ['tenant_id', 'actor'], returns: `{${F.balance}}`, sense: "solde de l'acteur dans le locataire (debits negatifs, remboursements positifs)." },
  { op: 'history', args: ['tenant_id', 'key', 'slot_id'], returns: `{${F.events}}`, sense: "historique ordonne de la reservation." },
  { op: 'transfer', args: ['tenant_id', 'key', 'slot_id', 'to_tenant_id'], returns: `{${F.decision}}`, sense: 'transfere la reservation vers un autre locataire.' },
]

/** Une etape-gabarit de la batterie et ce que le modele attendu en rend (`null` : hors du contrat de la periode). */
interface ContractProbe {
  readonly step: SequenceStep
  readonly outcome: StepExpectation | null
  readonly label: string
}

const EX_T = 'tenant-exemple'
const EX_T2 = 'tenant-exemple-2'
const EX_UNKNOWN_T = 'tenant-exemple-inconnu'
const EX_S = 'slot-exemple'
const EX_S_STARTED = 'slot-exemple-commence'
const EX_PRICE = 40
const EX_DAY_MS = 24 * 3_600_000
const EX_CLOCK_SHIFT_MS = 433_500 // 7 min 13,5 s : aucun instant d'une sequence generee
const EX_EVENT_AT = '2030-01-01T00:00:00Z' // instant-gabarit d'un evenement d'historique (`at` n'est jamais compare)

const PROBE_HELD = 'premiere reservation sur une place libre'
const PROBE_WAITING = 'seconde reservation sur le creneau plein'

const isoOf = (ms: number): string => new Date(ms).toISOString()

/** La batterie d'etapes-gabarits appliquee au modele attendu de la periode. */
function probeContract(period: string): ContractProbe[] {
  const clock = fLongScoringClockV4(period) + EX_CLOCK_SHIFT_MS
  const model = new ExpectedModelV4(period, clock)
  const out: ContractProbe[] = []
  let n = 0
  let admission = 0
  const run = (op: string, args: Record<string, unknown>, label: string): StepExpectation | null => {
    n += 1
    const step: SequenceStep = { id: `ex-${op}-${String(n)}`, op, args }
    let outcome: StepExpectation | null
    try {
      outcome = model.apply(step)
    } catch {
      outcome = null // le modele refuse l'etape : operation hors des regles actives de la periode
    }
    out.push({ step, outcome, label })
    return outcome
  }
  const reserve = (actor: string, slot: string, label: string, tenant = EX_T): StepExpectation | null => {
    admission += 1
    return run('write', { op: 'reserve', actor, tenant_id: tenant, admission_seq: admission, operation_key: `cle-exemple-${String(admission)}`, slot_id: slot }, label)
  }
  const cancel = (actor: string, slot: string, label: string, tenant = EX_T): StepExpectation | null =>
    run('write', { op: 'cancel', actor, tenant_id: tenant, operation_key: `cle-exemple-annulation-${actor}-${slot}`, slot_id: slot }, label)
  const A1 = 'acteur-exemple-1'
  const A2 = 'acteur-exemple-2'
  const AQ = 'acteur-exemple-quota'

  run('advance_clock', { to: isoOf(clock) }, "fixer l'horloge")
  run('create_tenant', { tenant_id: EX_T }, 'creer un locataire')
  run('create_tenant', { tenant_id: EX_T2 }, 'creer un second locataire')
  run('create_slot', { tenant_id: EX_T, slot_id: EX_S, start: isoOf(clock + 30 * EX_DAY_MS), capacity: 1, price: EX_PRICE }, 'creer un creneau de capacite 1')
  reserve(A1, EX_S, PROBE_HELD)
  reserve(A2, EX_S, PROBE_WAITING)
  run('read', { tenant_id: EX_T, key: A1, slot_id: EX_S }, 'lire une reservation tenue')
  run('read', { tenant_id: EX_T, key: A2, slot_id: EX_S }, 'lire une reservation en attente')
  run('read', { tenant_id: EX_T, key: 'acteur-exemple-sans-reservation', slot_id: EX_S }, "lire l'acteur sans reservation sur un creneau existant")
  run('read', { tenant_id: EX_T2, key: A1, slot_id: EX_S }, "lire depuis un locataire ou ce creneau n'existe pas")
  run('probe_cancel', { tenant_id: EX_T, key: A2, slot_id: EX_S }, "sonder l'annulation d'une attente")
  cancel(A2, EX_S, "annuler l'attente")
  run('read', { tenant_id: EX_T, key: A2, slot_id: EX_S }, 'lire une reservation annulee')
  run('balance', { tenant_id: EX_T, actor: A1 }, "solde de l'acteur dont la reservation est tenue (creneau au prix 40)")
  run('set_level', { tenant_id: EX_T, actor: A1, level: 'gold' }, 'fixer un niveau')
  run('set_capacity', { tenant_id: EX_T, slot_id: EX_S, capacity: 2 }, 'augmenter la capacite')
  run('create_slot', { tenant_id: EX_T, slot_id: EX_S_STARTED, start: isoOf(clock - 3_600_000), capacity: 1, price: 0 }, 'creer un creneau deja commence')
  reserve(A1, EX_S_STARTED, 'reserver un creneau deja commence')
  run('probe_cancel', { tenant_id: EX_T, key: A1, slot_id: EX_S_STARTED }, "sonder l'annulation apres le debut du creneau")
  cancel(A1, EX_S_STARTED, "annuler apres le debut du creneau")
  for (const i of [1, 2, 3]) {
    run('create_slot', { tenant_id: EX_T, slot_id: `slot-exemple-q${String(i)}`, start: isoOf(clock + 30 * EX_DAY_MS), capacity: 1, price: 0 }, `creer le creneau q${String(i)}`)
  }
  for (const i of [1, 2, 3]) reserve(AQ, `slot-exemple-q${String(i)}`, `reservation ${String(i)} du meme acteur sur trois creneaux`)
  run('history', { tenant_id: EX_T, key: A1, slot_id: EX_S }, "historique d'une reservation")
  if (run('transfer', { tenant_id: EX_T, key: A1, slot_id: EX_S, to_tenant_id: EX_T2 }, 'transferer une reservation') !== null) {
    run('read', { tenant_id: EX_T2, key: A1, slot_id: EX_S }, 'lire depuis le locataire de destination apres le transfert')
    run('read', { tenant_id: EX_T, key: A1, slot_id: EX_S }, "lire depuis le locataire d'origine apres le transfert")
  }
  // Une erreur NOT_FOUND par operation qui peut echouer : locataire inconnu.
  const unknownArgs: Readonly<Record<string, Record<string, unknown>>> = {
    create_slot: { tenant_id: EX_UNKNOWN_T, slot_id: EX_S, start: isoOf(clock + 30 * EX_DAY_MS), capacity: 1, price: 0 },
    write: { op: 'reserve', actor: A1, tenant_id: EX_UNKNOWN_T, admission_seq: 99, operation_key: 'cle-exemple-inconnu', slot_id: EX_S },
    read: { tenant_id: EX_UNKNOWN_T, key: A1, slot_id: EX_S },
    probe_cancel: { tenant_id: EX_UNKNOWN_T, key: A1, slot_id: EX_S },
    set_capacity: { tenant_id: EX_UNKNOWN_T, slot_id: EX_S, capacity: 1 },
    set_level: { tenant_id: EX_UNKNOWN_T, actor: A1, level: 'gold' },
    balance: { tenant_id: EX_UNKNOWN_T, actor: A1 },
    history: { tenant_id: EX_UNKNOWN_T, key: A1, slot_id: EX_S },
    transfer: { tenant_id: EX_UNKNOWN_T, key: A1, slot_id: EX_S, to_tenant_id: EX_T2 },
  }
  for (const [op, args] of Object.entries(unknownArgs)) run(op, args, 'locataire inconnu')
  return out
}

/** La reponse NDJSON que le notateur accepte pour l'attendu `e` (forme jugee par `judgeStep`). */
function renderResponse(id: string, e: StepExpectation, eventStatus: ContractStatus, eventAt: string): Record<string, unknown> {
  switch (e.kind) {
    case 'error':
      return { id, ok: false, error: { [F.errorCode]: e.code, [F.errorMessage]: '(texte libre)' } }
    case 'ok':
      return { id, ok: true, result: {} }
    case 'decision':
      return { id, ok: true, result: { [F.decision]: e.decision } }
    case 'value':
      return {
        id,
        ok: true,
        result: {
          [F.value]:
            e.value === null
              ? null
              : e.value.waiting_position === undefined
                ? { [F.status]: e.value.status }
                : { [F.status]: e.value.status, [F.waitingPosition]: e.value.waiting_position },
        },
      }
    case 'balance':
      return { id, ok: true, result: { [F.balance]: e.balance } }
    case 'events': {
      const first = e.first ?? { type: '(libelle libre)', status: eventStatus }
      return { id, ok: true, result: { [F.events]: [{ [F.eventType]: first.type, [F.eventStatus]: first.status, [F.eventAt]: eventAt }] } }
    }
  }
}

/** Ce qu'une operation « libre » rend en cas de succes : sa decision n'est jamais comparee. */
const FREE_DECISION_OPS: ReadonlySet<string> = new Set(['create_slot', 'probe_cancel', 'set_capacity', 'set_level', 'transfer'])

interface ContractFacets {
  readonly period: string
  readonly rules: readonly string[]
  readonly probes: readonly ContractProbe[]
  readonly inForce: readonly string[]
  readonly decisions: readonly string[]
  readonly statuses: readonly string[]
  readonly codes: ReadonlyMap<string, readonly string[]>
  readonly migrated: { readonly type: string; readonly status: ContractStatus } | null
  readonly examples: ReadonlyMap<string, { readonly request: string; readonly response: string; readonly label: string }>
}

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)]

function contractFacets(period: string): ContractFacets {
  const probes = probeContract(period)
  const eventAt = EX_EVENT_AT
  const outcomes = probes.filter((p) => p.outcome !== null) as (ContractProbe & { outcome: StepExpectation })[]
  // Une operation est en vigueur quand le modele accepte son etape de succes.
  const inForce = CONTRACT_OPERATIONS.map((o) => o.op).filter(
    (op) => op === 'fingerprint' || outcomes.some((p) => p.step.op === op && p.outcome.kind !== 'error'),
  )
  const decisions = uniq(outcomes.flatMap((p) => (p.outcome.kind === 'decision' ? [p.outcome.decision] : [])))
  const historyInForce = inForce.includes('history')
  const migrated = historyInForce ? fLongMigratedHistoryFactV4() : null
  const statuses = uniq([
    ...outcomes.flatMap((p) => (p.outcome.kind === 'value' && p.outcome.value !== null ? [p.outcome.value.status] : [])),
    ...(migrated !== null ? [migrated.status] : []),
  ])
  const codes = new Map<string, string[]>()
  for (const p of outcomes) {
    if (p.outcome.kind !== 'error' || !inForce.includes(p.step.op)) continue
    const label = p.step.op === 'write' ? `write (op ${String(p.step.args['op'])})` : p.step.op
    codes.set(p.outcome.code, uniq([...(codes.get(p.outcome.code) ?? []), label]))
  }
  // Statut de la reservation dont l'historique est sonde (dernier `read` de cette reservation avant `history`).
  const examples = new Map<string, { request: string; response: string; label: string }>()
  let lastStatus: ContractStatus = (statuses[0] ?? 'confirmed') as ContractStatus
  for (const p of outcomes) {
    if (p.outcome.kind === 'value' && p.outcome.value !== null && p.step.args['key'] === 'acteur-exemple-1') lastStatus = p.outcome.value.status
    if (!inForce.includes(p.step.op)) continue
    const response = renderResponse(p.step.id, p.outcome, lastStatus, eventAt)
    if (p.outcome.kind === 'ok' && FREE_DECISION_OPS.has(p.step.op)) response['result'] = { [F.decision]: '(libre)' }
    examples.set(p.step.id, { request: JSON.stringify({ id: p.step.id, op: p.step.op, args: p.step.args }), response: JSON.stringify(response), label: p.label })
  }
  if (migrated !== null) {
    const id = 'ex-history-migre'
    const args = { tenant_id: EX_T, key: 'acteur-exemple-migre', slot_id: 'slot-exemple-migre' }
    const response = renderResponse(id, { kind: 'events', first: migrated }, migrated.status, eventAt)
    examples.set(id, {
      request: JSON.stringify({ id, op: 'history', args }),
      response: JSON.stringify(response),
      label: "historique d'une reservation qui existait a l'entree de P10 (son premier evenement)",
    })
  }
  return { period, rules: activeRulesV4(period), probes, inForce, decisions, statuses, codes, migrated, examples }
}

const q = (v: string): string => `\`${v}\``
const orList = (xs: readonly string[]): string =>
  xs.length <= 1 ? xs.map(q).join('') : `${xs.slice(0, -1).map(q).join(', ')} ou ${q(xs[xs.length - 1] as string)}`

/** Resume d'une reponse d'exemple, sans accolades (aucune confusion avec un exemple public). */
function summaryOf(response: string): string {
  const r = JSON.parse(response) as { ok: boolean; result?: unknown; error?: Record<string, unknown> }
  if (!r.ok) return `l'erreur \`error.${F.errorCode}\` = ${q(String(r.error?.[F.errorCode]))}`
  const parts: string[] = []
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      if (v.length === 0) parts.push(`\`${path}\` = tableau vide`)
      v.forEach((x, i) => walk(x, `${path}[${String(i)}]`))
    } else if (v !== null && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>)
      if (entries.length === 0 && path !== '') parts.push(`\`${path}\` = objet vide`)
      for (const [k, x] of entries) walk(x, path === '' ? k : `${path}.${k}`)
    } else {
      parts.push(`\`${path}\` = ${typeof v === 'string' ? q(v) : JSON.stringify(v)}`)
    }
  }
  walk(r.result, 'result')
  return `un succes (${parts.join(', ')})`
}

function changesSince(prev: ContractFacets | null, cur: ContractFacets): string[] {
  if (prev === null) return [`Premiere periode : tout le contrat ci-dessus entre en vigueur a ${cur.period}.`]
  const out: string[] = []
  const added = cur.rules.filter((r) => !prev.rules.includes(r))
  const removed = prev.rules.filter((r) => !cur.rules.includes(r))
  if (added.length > 0) out.push(`AJOUT (regles) : ${added.join(', ')}.`)
  if (removed.length > 0) out.push(`RETRAIT (regles) : ${removed.join(', ')}.`)
  for (const op of cur.inForce.filter((o) => !prev.inForce.includes(o))) out.push(`AJOUT : l'operation ${op} entre en vigueur a ${cur.period}.`)
  for (const op of prev.inForce.filter((o) => !cur.inForce.includes(o))) out.push(`RETRAIT : l'operation ${op} n'est plus en vigueur a ${cur.period}.`)
  for (const [code, ops] of cur.codes) {
    if (!prev.codes.has(code)) out.push(`AJOUT : \`error.${F.errorCode}\` vaut desormais aussi ${q(code)} (${ops.join(', ')}).`)
  }
  for (const code of prev.codes.keys()) {
    if (!cur.codes.has(code)) out.push(`RETRAIT : \`error.${F.errorCode}\` ne vaut plus jamais ${q(code)} a partir de ${cur.period}.`)
  }
  if (cur.migrated !== null && prev.migrated === null) {
    out.push(`AJOUT : le premier evenement de l'historique d'une reservation existant a l'entree de ${cur.period} a \`${F.eventType}\` qui vaut ${q(cur.migrated.type)}.`)
  }
  for (const [id, ex] of cur.examples) {
    const before = prev.examples.get(id)
    if (before !== undefined && before.response !== ex.response && before.request === ex.request) {
      out.push(`CHANGE : pour ${ex.label} (exemple ${id}), la reponse change — avant : ${summaryOf(before.response)} ; desormais : ${summaryOf(ex.response)}.`)
    }
  }
  if (out.length === 0) out.push(`Aucun changement du contrat d'interface par rapport a la periode precedente.`)
  return out
}

const CONTRACT_PERIODS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const
const facetsCache = new Map<string, ContractFacets>()
function facetsOf(period: string): ContractFacets {
  let f = facetsCache.get(period)
  if (f === undefined) {
    f = contractFacets(period)
    facetsCache.set(period, f)
  }
  return f
}

/**
 * T69 (ADR-020) — le CONTRAT D'INTERFACE de la periode `period` (P1..P12),
 * calcule depuis le modele attendu qui la note (voir l'en-tete de ce bloc).
 */
export function describeFLongInterfaceContractV4(period: string): string {
  const i = CONTRACT_PERIODS.findIndex((p) => p === period)
  if (i < 0) throw new Error(`periode inconnue de F-LONG : ${period}`)
  const cur = facetsOf(period)
  const prev = i === 0 ? null : facetsOf(CONTRACT_PERIODS[i - 1] as string)
  const lines: string[] = []
  lines.push(`CONTRAT D'INTERFACE de la periode ${period} (${CANDIDATE_PROTOCOL_MARKER_V4}) — il fait partie de la specification de cette periode. Chaque valeur et chaque exemple ci-dessous est calcule par le modele attendu qui note cette periode : c'est exactement ce que le notateur compare.`)
  lines.push(`Enveloppe : requete {"id","op","args"} ; reponse de succes {"id","ok":true,"result"} ; reponse d'erreur {"id","ok":false,"error":{"${F.errorCode}","${F.errorMessage}"}}. La reponse reprend le meme \`id\` que sa requete.`)
  lines.push(`Regles actives a ${period} : ${cur.rules.join(', ')}.`)
  lines.push('')
  lines.push(`Operations en vigueur a ${period} (arguments, puis champ(s) de \`result\`) :`)
  for (const o of CONTRACT_OPERATIONS) {
    if (!cur.inForce.includes(o.op)) continue
    lines.push(`- ${o.op}(${o.args.join(', ')}) -> ${o.returns} : ${o.sense}`)
  }
  const notYet = CONTRACT_OPERATIONS.filter((o) => !cur.inForce.includes(o.op)).map((o) => o.op)
  if (notYet.length > 0) lines.push(`Hors du contrat de ${period} (aucune regle active ne les regit ; jamais appelees par le notateur a cette periode) : ${notYet.join(', ')}.`)
  lines.push(`Pour write, l'argument \`op\` vaut \`reserve\` ou \`cancel\`.`)
  lines.push('')
  lines.push(`Reponses comparees par le notateur, avec le champ qui porte chaque valeur :`)
  const decisionOf = (label: string): string => {
    const o = cur.probes.find((p) => p.label === label)?.outcome
    return o !== undefined && o !== null && o.kind === 'decision' ? o.decision : '?'
  }
  lines.push(`- write avec op reserve : \`result.${F.decision}\` vaut ${orList(cur.decisions)} — ${q(decisionOf(PROBE_HELD))} quand la reservation obtient une place, ${q(decisionOf(PROBE_WAITING))} quand elle entre en file d'attente (rejouer la meme operation_key rend la meme decision).`)
  lines.push(`- read : \`result.${F.value}\` vaut null (aucune reservation de cet acteur sur un creneau qui existe dans ce locataire) ou un objet {${F.status}} ; une reservation en attente rend l'objet {${F.status}, ${F.waitingPosition}}, ${F.waitingPosition} etant son rang dans la file (1 = tete). Aucun autre champ dans cet objet.`)
  lines.push(`- \`${F.status}\` vaut ${orList(cur.statuses)}.`)
  if (cur.inForce.includes('balance')) lines.push(`- balance : \`result.${F.balance}\` est un nombre (0 sans aucun mouvement).`)
  if (cur.inForce.includes('history')) {
    lines.push(`- history : \`result.${F.events}\` est un tableau ordonne d'evenements, chacun exactement {${F.eventType}, ${F.eventStatus}, ${F.eventAt}} (aucun autre champ) ; \`${F.eventAt}\` est un instant ISO 8601, \`${F.eventStatus}\` le statut de la reservation apres l'evenement, l'un de ${orList(cur.statuses)}.`)
    if (cur.migrated !== null) lines.push(`- history : pour une reservation qui existait a l'entree de P10, le premier evenement a \`${F.eventType}\` qui vaut ${q(cur.migrated.type)} et \`${F.eventStatus}\` qui vaut ${q(cur.migrated.status)} ; le libelle \`${F.eventType}\` des autres evenements est libre.`)
  }
  lines.push(`- create_tenant, advance_clock, create_slot, probe_cancel, set_capacity, set_level, transfer et write avec op cancel : seul le succes (\`ok\` vrai) ou le code d'erreur est compare ; un champ \`${F.decision}\` eventuel y est libre.`)
  lines.push('')
  lines.push(`Erreurs (champ \`error.${F.errorCode}\`, \`ok\` faux ; \`error.${F.errorMessage}\` est un texte libre) :`)
  for (const [code, ops] of cur.codes) {
    lines.push(`- \`error.${F.errorCode}\` vaut ${q(code)} — rendu a cette periode par : ${ops.join(', ')}.`)
  }
  lines.push('')
  lines.push(`Exemples publics (requete -> reponse, lies par \`id\` ; locataires, acteurs, creneaux et instants sont des gabarits) :`)
  for (const ex of cur.examples.values()) {
    lines.push(`(${ex.label})`)
    lines.push(`${ex.request} -> ${ex.response}`)
  }
  lines.push('')
  lines.push(`Ce que ${period} ajoute, change ou retire dans le contrat d'interface :`)
  for (const c of changesSince(prev, cur)) lines.push(`- ${c}`)
  return lines.join('\n')
}
