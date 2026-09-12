// ─────────────────────────────────────────────────────────────────────────────
// Transitions d'une période, sans infrastructure (T05, L195–L202) — SQUELETTE.
//
// CE FICHIER NE DÉCIDE D'AUCUNE TRANSITION, ET C'EST SON RÔLE À CE COMMIT.
//
// L'étage ROUGE exige que les six cas de `acceptance/T05.spec.ts` échouent
// POUR LA RAISON ATTENDUE. Avant ce fichier, les six échouaient tous sur la
// même assertion — `assertContrat()`, acceptance/T05.spec.ts:695 :
//
//   Expected: "contrat-resolu"
//   Received: "CONTRAT-NON-SATISFAIT roles=[applyPeriodEvent] : aucun export
//    parmi applyPeriodEvent:[applyPeriodEvent|applyEvent|…|transitionDePeriode]
//    (53 exports de premier niveau observes dans @bench/domain, @bench/contracts)"
//
// c'est-à-dire sur l'absence d'un NOM. Un rouge de cette forme est à la
// résolution de rôles ce que `MODULE_NOT_FOUND` est au chargement : la forme
// par défaut du TDD en monorepo TypeScript, qui ne dit rien de ce que la suite
// vérifie. `verification/runner/red.mjs` ne retient que `ASSERTION_FAILED` et
// `STUB_NOT_IMPLEMENTED` comme rouge légitime, et refuse explicitement
// `MODULE_NOT_FOUND`, `TYPE_ERROR` et `SUITE_FAILED_TO_RUN`.
//
// En DÉCLARANT les rôles et en les faisant LEVER, le rouge se déplace là où il
// prouve quelque chose : la suite résout les quatre rôles, appelle réellement
// la transition sur un état réel, et tombe sur les assertions qui exigent un
// parcours sans refus, un refus typé, une déduplication et un résultat de
// clôture. Aucune de ces assertions n'est satisfaisable par ce fichier.
//
// LES QUATRE RÔLES, ET D'OÙ VIENNENT LEURS NOMS. Ils ne sont pas choisis ici :
// `acceptance/T05.spec.ts` §III les nomme, et `verification/mutants/T05.json`
// les reprend comme cibles. Deux d'entre eux sont nommés par le cahier lui-même
// (L201) ; les deux autres sont la forme minimale que L87 et L95 imposent.
//
//   initialPeriodState(contexte)   -> `PeriodState` de départ, phase `PENDING`
//                                     (L87 : champs minimaux d'un état)
//   applyPeriodEvent(état, évén.)  -> { state, commands } — la transition PURE
//                                     (L197 : « machine à états pure dans
//                                     `domain`, événements, commandes attendues
//                                     et erreurs de transition »)
//   reducePeriodLog(état, journal) -> état final (L201 : « test de réduction
//                                     d'un journal en état final »)
//   closePeriod(état)              -> `PeriodResult` (L95)
//
// CE QUE CE SQUELETTE S'INTERDIT DÉJÀ, ET QUI N'EST PAS UNE PROMESSE.
// L201 : « les effets réseau sont des COMMANDES à exécuter par adaptateurs, pas
// des appels cachés dans le reducer ». `packages/domain/tsconfig.json` fixe
// `types: []` : ni `node:net`, ni `node:http`, ni `fetch` typé ne peuvent
// entrer dans ce paquet sans faire échouer `tsc`. L'interdiction est donc une
// impossibilité de typage, pas une intention — et `acceptance/T05.spec.ts`
// (T05.A1) l'observe pour de bon en installant un mouchard sur `fetch` et sur
// `net.Socket.prototype.connect` pendant tout le parcours nominal.
//
// POURQUOI `NotImplemented` DE `@bench/contracts`, ET PAS UNE ERREUR DE
// TRANSITION. Quatre des six cas de T05 peuvent être verdis par une machine qui
// ne fait RIEN : « une machine qui refuse tout satisfait A2 et A4 ; une machine
// qui n'applique jamais rien satisfait A3 » (acceptance/T05.spec.ts §IV). Un
// stub qui lèverait une erreur de transition typée — a fortiori
// `IDEMPOTENCY_CONFLICT` — se ferait passer pour la garde qu'il ne contient
// pas. `NotImplemented` porte le préfixe `NOT_IMPLEMENTED`, qu'aucun cas ne
// confond avec un refus métier, et dont le vocabulaire n'est ni une phase de E
// ni un code que la suite attend.
//
// Tous les exports ci-dessous lèveront jusqu'à ce que T05 soit écrite.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/**
 * Les dix phases d'une période, dans l'ordre où le cahier les énumère.
 * Transcription de L97 ; aucune valeur n'est décidée ici.
 */
export type PeriodPhase =
  | 'PENDING'
  | 'RESTORING'
  | 'REVEALING'
  | 'DEVELOPING'
  | 'VALIDATING'
  | 'DEPLOYING'
  | 'EXERCISING'
  | 'AUDITING'
  | 'CHECKPOINTING'
  | 'COMPLETED'

/**
 * Les trois états d'arrêt de calcul. L97 : ils « n'effacent pas la période de
 * l'analyse » — une période arrêtée garde donc sa ligne de résultat.
 */
export type PeriodHaltState = 'BUDGET_EXHAUSTED' | 'RUNNER_BLOCKED' | 'CANCELLED'

/** `attempt_outcome` vaut `SUCCESS`, `FAILED` ou `CANCELLED` (L97). */
export type AttemptOutcome = 'SUCCESS' | 'FAILED' | 'CANCELLED'

/** `deployment_coverage` vaut `NO_DEPLOYMENT`, `PARTIAL` ou `ACCEPTED` (L97). */
export type DeploymentCoverage = 'NO_DEPLOYMENT' | 'PARTIAL' | 'ACCEPTED'

/**
 * Un événement de période, tel que le journal le porte.
 *
 * IDENTITÉ D'OPÉRATION ET EMPREINTE D'ENTRÉE (L68, L78). `operation_key` porte
 * l'identité ; le CONTENU porte l'empreinte. Deux événements de même clé et de
 * contenus différents sont en conflit — c'est le seul code d'erreur que le
 * cahier nomme pour T05, `IDEMPOTENCY_CONFLICT` (L199) ; deux événements
 * identiques octet pour octet ne le sont pas, et le second est sans effet
 * supplémentaire.
 *
 * La forme reste ouverte : ce squelette ne fixe aucune arborescence, parce que
 * le cahier n'en fixe aucune. Il ne nomme que les champs que L78 nomme.
 */
export interface PeriodEvent {
  readonly operation_key?: string
  readonly operation_kind?: string
  readonly operation_sequence?: number
  readonly logical_attempt?: number
  /** La phase de E dans laquelle l'événement fait entrer, ou l'arrêt demandé. */
  readonly type?: string
  readonly payload?: Readonly<Record<string, unknown>>
  readonly [champ: string]: unknown
}

/**
 * L'état d'une période. Champs minimaux de L87 : phase, identité, snapshot
 * courant, déploiement courant, contrats actifs, backlog, budget, horloge
 * métier. Ouvert pour la même raison que `PeriodEvent`.
 */
export interface PeriodState {
  readonly phase?: string
  readonly identity?: Readonly<Record<string, unknown>>
  readonly snapshot?: unknown
  readonly deployment?: unknown
  readonly requirements?: readonly unknown[]
  readonly backlog?: readonly unknown[]
  readonly budget?: Readonly<Record<string, unknown>>
  readonly business_clock?: string
  readonly [champ: string]: unknown
}

/**
 * Une COMMANDE : un effet à exécuter par un adaptateur, jamais par le reducer
 * (L201). C'est une donnée sérialisable et TYPÉE — la suite exige des deux :
 * `canonique(c)` doit survivre à un aller-retour JSON, et le champ de type doit
 * être une chaîne non vide.
 */
export interface PeriodCommand {
  readonly type: string
  readonly [champ: string]: unknown
}

/**
 * Le rendu d'une transition : l'état suivant et les commandes émises. Un REFUS
 * peut être levé ou rendu ; le cahier n'impose pas le mécanisme, il impose
 * (L197, L201) des « erreurs typées » et l'absence d'effet.
 */
export interface PeriodTransition {
  readonly state: PeriodState
  readonly commands: readonly PeriodCommand[]
}

/**
 * Le résultat de clôture d'une période (L95) : dépenses, exigences évaluées,
 * intentions offertes/réussies, incidents, Q, R, G, statut et empreintes de
 * preuve. Les intentions NON SERVIES en font partie : sans déploiement, aucune
 * intention offerte n'est servie (L67, F-FAILURE).
 */
export interface PeriodResult {
  readonly attempt_outcome?: AttemptOutcome
  readonly deployment_coverage?: DeploymentCoverage
  readonly intents_offered?: number
  readonly unserved_intents?: readonly unknown[] | number
  readonly spend?: number | string
  readonly Q?: number | null
  readonly R?: number | null
  readonly [champ: string]: unknown
}

/**
 * L'état initial d'une période : phase `PENDING`, et les champs minimaux de
 * L87 repris du contexte.
 *
 * @throws NotImplemented tant que T05 n'est pas écrite.
 */
export function initialPeriodState(context: PeriodState): PeriodState {
  void context
  throw new NotImplemented('domain.initialPeriodState')
}

/**
 * La transition PURE (L197) : un état et un événement rendent un état suivant
 * et les commandes que des adaptateurs exécuteront.
 *
 * PURE veut dire trois choses que la suite observe séparément : l'état
 * d'entrée n'est pas muté, deux appels de mêmes arguments rendent exactement la
 * même chose, et aucun appel sortant n'a lieu pendant l'appel.
 *
 * @throws NotImplemented tant que T05 n'est pas écrite.
 */
export function applyPeriodEvent(state: PeriodState, event: PeriodEvent): PeriodTransition {
  void state
  void event
  throw new NotImplemented('domain.applyPeriodEvent')
}

/**
 * La réduction d'un journal en état final (L201). Elle doit coïncider
 * EXACTEMENT avec le pliage pas à pas du même journal : c'est ce que T05.A1
 * compare, octets canoniques contre octets canoniques.
 *
 * @throws NotImplemented tant que T05 n'est pas écrite.
 */
export function reducePeriodLog(state: PeriodState, log: readonly PeriodEvent[]): PeriodState {
  void state
  void log
  throw new NotImplemented('domain.reducePeriodLog')
}

/**
 * La clôture d'une période : l'état final devient un `PeriodResult` (L95).
 * Une période arrêtée garde sa ligne (L97) ; une période sans déploiement porte
 * ses demandes non servies (L67).
 *
 * @throws NotImplemented tant que T05 n'est pas écrite.
 */
export function closePeriod(state: PeriodState): PeriodResult {
  void state
  throw new NotImplemented('domain.closePeriod')
}
