// ─────────────────────────────────────────────────────────────────────────────
// Transitions d'une période, sans infrastructure (T05, L195–L202).
//
// CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS. C'est une MACHINE À ÉTATS PURE
// (L197) : un état et un événement entrent, un état suivant et des COMMANDES
// sortent. Les commandes sont des données sérialisables, destinées à des
// adaptateurs ; L201 l'exige mot pour mot — « les effets réseau sont des
// commandes à exécuter par adaptateurs, pas des appels cachés dans le
// reducer ». Le paquet n'a aucun moyen d'en émettre : `types: []` dans
// `packages/domain/tsconfig.json` tient `node:net`, `node:http` et `fetch` hors
// du périmètre de typage, et `acceptance/T05.spec.ts` (T05.A1) l'observe en
// installant un mouchard sur `fetch` et `net.Socket.prototype.connect` pendant
// tout le parcours nominal.
//
// LES QUATRE RÔLES ET LEUR ORIGINE :
//
//   initialPeriodState(contexte)   -> `PeriodState` de départ, phase `PENDING`
//                                     (L87 : champs minimaux d'un état)
//   applyPeriodEvent(état, évén.)  -> { ok, state, commands } ou un REFUS typé
//                                     (L197 : « machine à états pure dans
//                                     `domain`, événements, commandes attendues
//                                     et erreurs de transition »)
//   reducePeriodLog(état, journal) -> état final (L201 : « test de réduction
//                                     d'un journal en état final »)
//   closePeriod(état)              -> `PeriodResult` (L95)
//
// LES TROIS RÈGLES QUE CE FICHIER IMPLÉMENTE, ET D'OÙ ELLES VIENNENT :
//
// 1. LA TABLE DES TRANSITIONS (L201, « table exhaustive des transitions
//    autorisées »). `PERIOD_TRANSITIONS` est cette table, publiée et totale :
//    une entrée par phase de §E, y compris les phases sans successeur. Elle
//    porte la seule interdiction que L199 nomme explicitement — « déployer
//    avant validation est refusé » : `DEPLOYING` n'est atteignable que depuis
//    `VALIDATING`. Les états d'arrêt de calcul (L97) ne sont pas dans la table
//    des phases : ils sont atteignables depuis TOUTE phase non terminale,
//    parce qu'un budget peut s'épuiser n'importe quand.
//
// 2. LA DÉDUPLICATION PAR CLÉ D'OPÉRATION ET EMPREINTE D'ENTRÉE (D.6, L68 :
//    « une tâche peut être rejouée par l'orchestrateur ; les effets valides
//    sont dédupliqués par clé d'opération et empreinte d'entrée »). L'état
//    porte `applied_operations`, qui associe à chaque clé d'opération déjà
//    appliquée l'empreinte de son CONTENU. Trois cas, et trois seulement :
//      • clé inconnue                      -> l'événement s'applique ;
//      • clé connue, même empreinte        -> REJEU : l'état d'entrée est rendu
//        tel quel, AUCUNE commande n'est réémise. Rendre l'objet reçu plutôt
//        qu'un état reconstruit n'est pas une optimisation : c'est ce qui rend
//        « sans effet supplémentaire » observable octet pour octet ;
//      • clé connue, empreinte différente  -> `IDEMPOTENCY_CONFLICT` (L199),
//        sans état ni commande — un conflit n'écrase rien.
//    L'EMPREINTE porte sur le CONTENU, c'est-à-dire l'événement privé de ses
//    seuls champs d'IDENTITÉ. Deux événements qui ne diffèrent que par leur clé
//    ont donc la même empreinte, et deux événements de même clé qui diffèrent
//    par une valeur OU par un champ ajouté en ont deux différentes. L'empreinte
//    est le SHA-256 des octets canoniques de §E (L82), via
//    `canonicalDigest` de `@bench/contracts` : objets triés récursivement par
//    clé, ordre des tableaux conservé, aucun timestamp ajouté.
//
// 3. LA PÉRIODE N'EST JAMAIS EFFACÉE (D.5, L67 : « un échec conserve ses
//    dépenses, ses intentions non servies et son backlog » ; L97 : les états
//    d'arrêt « n'effacent pas la période de l'analyse »). Un arrêt de calcul
//    est donc ENREGISTRÉ dans l'état, et `closePeriod` rend une ligne complète
//    pour une période arrêtée comme pour une période achevée. Les dépenses sont
//    accumulées en ENTIERS EXACTS — `bigint`, jamais une addition de flottants
//    monétaires (D.9, L71) — et rendues sous forme de chaîne d'entier.
//
// CE QUI N'EST PAS DÉCIDÉ ICI. Q et R ne sont pas recalculés : `closePeriod`
// les demande à `computePeriodMetrics` (T04, metrics.ts), qui porte les
// conventions de L109 et L111 — filtre d'échéance, moyenne pondérée,
// dénominateur seul discriminant du `null`. Deux définitions de Q dans le même
// paquet seraient deux définitions de Q.
// ─────────────────────────────────────────────────────────────────────────────
import { COMPUTATION_HALT_STATES, PHASE_STATES, canonicalDigest } from '@bench/contracts'
import type { CanonicalValue } from '@bench/contracts'

import { computePeriodMetrics } from './metrics.js'
import type { MetricPeriod, MetricRequirement } from './metrics.js'

/**
 * Les dix phases d'une période, dans l'ordre où le cahier les énumère.
 * Transcription de L97 ; l'ordre et les membres viennent de `PHASE_STATES`.
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
 * LA TABLE EXHAUSTIVE DES TRANSITIONS DE PHASE (L201).
 *
 * Elle est TOTALE — une entrée par phase de §E, `COMPLETED` compris, dont la
 * liste vide dit qu'aucune phase ne lui succède. Deux entrées ne sont pas la
 * simple chaîne de §E, et chacune se lit dans le cahier :
 *
 *   VALIDATING -> EXERCISING : une période peut ne rien déployer. F-FAILURE
 *     (L121) mesure précisément ce candidat, « sans déploiement sur les quatre
 *     périodes » : sans cette arête, la série de F-FAILURE serait inatteignable.
 *   EXERCISING -> EXERCISING : les usages d'une période sont plusieurs
 *     opérations distinctes — L78 pose que « les appels 1 et 2 d'une même
 *     période sont distincts ». C'est la seule arête réflexive.
 *
 * `DEPLOYING` n'apparaît QUE dans l'entrée `VALIDATING` : c'est la forme
 * exécutable de « déployer avant validation est refusé » (L199).
 */
export const PERIOD_TRANSITIONS: Readonly<Record<PeriodPhase, readonly PeriodPhase[]>> = {
  PENDING: ['RESTORING'],
  RESTORING: ['REVEALING'],
  REVEALING: ['DEVELOPING'],
  DEVELOPING: ['VALIDATING'],
  VALIDATING: ['DEPLOYING', 'EXERCISING'],
  DEPLOYING: ['EXERCISING'],
  EXERCISING: ['EXERCISING', 'AUDITING'],
  AUDITING: ['CHECKPOINTING'],
  CHECKPOINTING: ['COMPLETED'],
  COMPLETED: [],
}

/**
 * La COMMANDE attendue de chaque phase (L197, « commandes attendues »). Entrer
 * dans une phase, c'est demander à un adaptateur d'exécuter son effet : c'est
 * la seule façon dont ce paquet peut agir sur le monde.
 *
 * `PENDING` n'en a pas : c'est l'état de départ, jamais une cible.
 */
export const PERIOD_PHASE_COMMANDS: Readonly<Record<PeriodPhase, string | null>> = {
  PENDING: null,
  RESTORING: 'RESTORE_SNAPSHOT',
  REVEALING: 'REVEAL_REQUIREMENTS',
  DEVELOPING: 'RUN_DEVELOPMENT',
  VALIDATING: 'RUN_VALIDATION',
  DEPLOYING: 'DEPLOY_VERSION',
  EXERCISING: 'EXERCISE_USAGE',
  AUDITING: 'AUDIT_REQUIREMENTS',
  CHECKPOINTING: 'WRITE_CHECKPOINT',
  COMPLETED: 'EMIT_PERIOD_RESULT',
}

/**
 * Les codes d'erreur de transition (L197 « erreurs de transition », L201
 * « erreurs typées »). `IDEMPOTENCY_CONFLICT` est le seul que le cahier NOMME
 * pour T05 (L199) ; les trois autres nomment les refus que la table et
 * l'identité d'opération rendent inévitables.
 */
export const PERIOD_TRANSITION_ERROR_CODES = [
  /** La cible n'est pas atteignable depuis la phase courante (L201). */
  'TRANSITION_NOT_ALLOWED',
  /** Même clé d'opération, empreinte d'entrée différente (D.6, L68 ; L199). */
  'IDEMPOTENCY_CONFLICT',
  /** L'événement ne nomme ni une phase de §E ni un état d'arrêt (L97). */
  'UNKNOWN_TRANSITION_TARGET',
  /** L'événement ne porte pas de clé d'opération : D.6 serait inapplicable. */
  'OPERATION_KEY_MISSING',
] as const

export type PeriodTransitionErrorCode = (typeof PERIOD_TRANSITION_ERROR_CODES)[number]

/**
 * Un événement de période, tel que le journal le porte.
 *
 * IDENTITÉ D'OPÉRATION ET EMPREINTE D'ENTRÉE (L68, L78). `operation_key` porte
 * l'identité ; le CONTENU — l'événement privé de ses champs d'identité — porte
 * l'empreinte.
 *
 * La forme reste ouverte : le cahier n'en fixe aucune. Seuls les champs que L78
 * nomme sont déclarés.
 */
export interface PeriodEvent {
  readonly operation_key?: string
  readonly operation_kind?: string
  readonly operation_sequence?: number
  readonly logical_attempt?: number
  /** La phase de §E dans laquelle l'événement fait entrer, ou l'arrêt demandé. */
  readonly type?: string
  readonly payload?: Readonly<Record<string, unknown>>
  readonly [champ: string]: unknown
}

/**
 * L'état d'une période. Champs minimaux de L87 — phase, identité, snapshot
 * courant, déploiement courant, contrats actifs, backlog, budget, horloge
 * métier — plus ce que D.5 et D.6 obligent à CONSERVER : intentions non
 * servies, dépense exacte, et le registre des opérations déjà appliquées.
 */
export interface PeriodState {
  readonly schema?: string
  readonly phase?: string
  readonly halt_state?: string | null
  readonly identity?: Readonly<Record<string, unknown>>
  readonly period_index?: number
  readonly snapshot?: unknown
  readonly deployment?: unknown
  readonly deployed_in_period?: boolean
  readonly requirements?: readonly unknown[]
  readonly backlog?: readonly unknown[]
  readonly budget?: Readonly<Record<string, unknown>>
  readonly business_clock?: string | null
  readonly intents_offered?: number
  readonly intents_succeeded?: number
  readonly unserved_intents?: readonly unknown[]
  /** Dépense de la période, chaîne d'entier exact (D.9, L71). */
  readonly spend_micro_usd?: string
  /** Clé d'opération -> empreinte du contenu déjà appliqué (D.6, L68). */
  readonly applied_operations?: Readonly<Record<string, string>>
  readonly [champ: string]: unknown
}

/**
 * Une COMMANDE : un effet à exécuter par un adaptateur, jamais par le reducer
 * (L201). C'est une donnée sérialisable et TYPÉE.
 */
export interface PeriodCommand {
  readonly type: string
  readonly [champ: string]: unknown
}

/** Le refus d'une transition, porté comme une DONNÉE (L197, L201). */
export interface PeriodTransitionRejection {
  readonly code: PeriodTransitionErrorCode
  readonly message: string
  readonly from: string
  readonly to: string
  readonly operation_key: string | null
  readonly allowed: readonly string[]
}

/** Le rendu d'une transition ACCEPTÉE : l'état suivant et les commandes émises. */
export interface PeriodTransition {
  readonly ok: true
  readonly state: PeriodState
  readonly commands: readonly PeriodCommand[]
}

/**
 * Le rendu d'une transition REFUSÉE. Aucun état n'est republié et aucune
 * commande n'est émise : un refus est sans effet, et c'est ce que
 * `acceptance/T05.spec.ts` observe en comparant l'état d'avant à l'état d'après.
 */
export interface PeriodRejection {
  readonly ok: false
  readonly error: PeriodTransitionRejection
  readonly commands: readonly PeriodCommand[]
}

export type PeriodOutcome = PeriodTransition | PeriodRejection

/**
 * L'erreur levée par `reducePeriodLog` quand le journal soumis contient une
 * transition refusée. Réduire un journal suppose un journal VALIDE : un refus
 * y est une faute de l'appelant, pas un résultat à moyenner silencieusement.
 */
export class PeriodLogRejected extends Error {
  readonly rejection: PeriodTransitionRejection
  readonly event_index: number

  constructor(rejection: PeriodTransitionRejection, eventIndex: number) {
    super(`${rejection.code} @ journal[${String(eventIndex)}] : ${rejection.message}`)
    this.name = 'PeriodLogRejected'
    this.rejection = rejection
    this.event_index = eventIndex
  }
}

/**
 * Le résultat de clôture d'une période (L95) : dépenses, exigences évaluées,
 * intentions offertes/réussies, incidents, Q, R, G, statut et empreintes.
 * Les intentions NON SERVIES en font partie (D.5, L67) : sans déploiement,
 * aucune intention offerte n'est servie.
 */
export interface PeriodResult {
  readonly schema: string
  readonly period_index: number
  readonly identity: Readonly<Record<string, unknown>>
  readonly phase: string
  readonly halt_state: string | null
  readonly attempt_outcome: AttemptOutcome
  readonly deployment_coverage: DeploymentCoverage
  readonly deployment_id: string | null
  readonly intents_offered: number
  readonly intents_succeeded: number
  readonly unserved_intents: readonly unknown[]
  /** Dépense conservée, chaîne d'entier exact (D.5 L67, D.9 L71). */
  readonly spend: string
  readonly spend_micro_usd: string
  readonly Q: number | null
  readonly R: number | null
  readonly G: number
  readonly G_new: number
  readonly regressions: readonly string[]
  readonly new_regressions: readonly string[]
  readonly backlog: readonly string[]
  readonly evaluated_requirements: readonly unknown[]
  readonly incidents: readonly unknown[]
  readonly state_digest: string
}

/* ─────────────────────────────────── lecture défensive d'entrées ouvertes */

type Sac = Record<string, unknown>

function objet(v: unknown): Sac | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Sac) : null
}

function lireChaine(source: Sac, noms: readonly string[]): string | null {
  for (const nom of noms) {
    const v = source[nom]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

function lireNombre(source: Sac, noms: readonly string[]): number | null {
  for (const nom of noms) {
    const v = source[nom]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim())
  }
  return null
}

function lireCardinal(source: Sac, noms: readonly string[]): number {
  const n = lireNombre(source, noms)
  if (n === null || !Number.isInteger(n) || n < 0) return 0
  return n
}

function lireTableau(source: Sac, noms: readonly string[]): readonly unknown[] {
  for (const nom of noms) {
    const v = source[nom]
    if (Array.isArray(v)) return v as readonly unknown[]
  }
  return []
}

function lireObjet(source: Sac, noms: readonly string[]): Sac | null {
  for (const nom of noms) {
    const o = objet(source[nom])
    if (o !== null) return o
  }
  return null
}

function estPhase(v: string): v is PeriodPhase {
  return (PHASE_STATES as readonly string[]).includes(v)
}

function estArret(v: string): v is PeriodHaltState {
  return (COMPUTATION_HALT_STATES as readonly string[]).includes(v)
}

/**
 * Un MONTANT lu en entier exact (D.9, L71). Jamais un flottant : une valeur non
 * entière est ignorée plutôt qu'arrondie, parce qu'un arrondi silencieux est
 * exactement la « facture imaginaire » que F-FAILURE interdit (L121).
 */
function lireMontant(source: Sac, noms: readonly string[]): bigint {
  for (const nom of noms) {
    const v = source[nom]
    if (typeof v === 'bigint') return v
    if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v)
    if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return BigInt(v.trim())
  }
  return 0n
}

/**
 * Octets canoniques de §E (L82) appliqués à une valeur quelconque : objets
 * triés récursivement par clé, ordre des tableaux conservé. Les valeurs qu'un
 * JSON ne peut pas porter (fonction, symbole, nombre non fini) deviennent une
 * chaîne explicite plutôt que de disparaître : une disparition ferait coïncider
 * deux contenus distincts, donc rendrait deux conflits d'idempotence égaux.
 */
function valeurCanonique(v: unknown): CanonicalValue {
  if (v === null || v === undefined) return null
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return v
    case 'number':
      return Number.isFinite(v) ? v : `#non-fini:${String(v)}`
    case 'bigint':
      return v.toString()
    case 'object':
      break
    default:
      return `#${typeof v}`
  }
  if (Array.isArray(v)) return (v as readonly unknown[]).map(valeurCanonique)
  const source = v as Sac
  const sortie: Record<string, CanonicalValue> = {}
  for (const k of Object.keys(source).sort()) sortie[k] = valeurCanonique(source[k])
  return sortie
}

/* ───────────────────────────────── identité et empreinte d'un événement */

/**
 * Les champs qui portent l'IDENTITÉ d'une opération, et eux seuls. Ce sont
 * exactement les champs que l'empreinte d'entrée EXCLUT : « dédupliqués par clé
 * d'opération ET empreinte d'entrée » (D.6, L68) suppose que les deux soient
 * séparables.
 */
const CHAMPS_IDENTITE_OPERATION = [
  'operation_key',
  'idempotency_key',
  'operation_id',
  'event_id',
  'id',
] as const

/** Les noms sous lesquels un événement peut nommer sa transition. */
const CHAMPS_CIBLE = ['type', 'kind', 'name', 'phase', 'to', 'to_phase', 'target_phase'] as const

/** La vue de lecture d'un événement : sa racine, complétée par son `payload`. */
function vueEvenement(event: PeriodEvent): Sac {
  const racine = event as unknown as Sac
  const charge = objet(racine['payload'])
  return charge === null ? racine : { ...charge, ...racine }
}

function cleOperation(event: PeriodEvent): string | null {
  return lireChaine(event as unknown as Sac, CHAMPS_IDENTITE_OPERATION)
}

/**
 * L'EMPREINTE D'ENTRÉE d'un événement (D.6 L68, octets canoniques L82) : le
 * SHA-256 du contenu, c'est-à-dire de l'événement privé de ses seuls champs
 * d'identité. Deux événements qui ne diffèrent que par leur clé ont donc la
 * même empreinte ; une valeur changée comme un champ ajouté en changent une.
 */
function empreinteDuContenu(event: PeriodEvent): string {
  const racine = event as unknown as Sac
  const contenu: Record<string, CanonicalValue> = {}
  for (const k of Object.keys(racine).sort()) {
    if ((CHAMPS_IDENTITE_OPERATION as readonly string[]).includes(k)) continue
    contenu[k] = valeurCanonique(racine[k])
  }
  return canonicalDigest(contenu)
}

/* ───────────────────────────────────────── normalisation de l'état */

type EtatNormalise = {
  readonly schema: string
  readonly phase: string
  readonly halt_state: string | null
  readonly identity: Sac
  readonly period_index: number
  readonly snapshot: unknown
  readonly deployment: unknown
  readonly deployed_in_period: boolean
  readonly requirements: readonly unknown[]
  readonly backlog: readonly unknown[]
  readonly budget: Sac
  readonly business_clock: string | null
  readonly execution_mode: string | null
  readonly cost_origin: string | null
  readonly corpus_provenance: string | null
  readonly intents_offered: number
  readonly intents_succeeded: number
  readonly unserved_intents: readonly unknown[]
  readonly spend_micro_usd: string
  readonly applied_operations: Readonly<Record<string, string>>
}

const SCHEMA_ETAT = 'bench.period_state/1'

/**
 * Ramène un état — ou le CONTEXTE de départ d'une période — à la forme que ce
 * module maintient. L'opération est IDEMPOTENTE : appliquée à sa propre sortie,
 * elle rend la même chose. C'est ce qui permet à `reducePeriodLog` de coïncider
 * exactement avec le pliage pas à pas, ce que T05.A1 compare en octets
 * canoniques.
 *
 * Les alias d'entrée (`current_phase`, `current_deployment`, `clock`…) sont LUS
 * mais jamais réémis : un état normalisé n'a qu'un nom par champ.
 */
function normaliserEtat(state: PeriodState): EtatNormalise {
  const s = state as unknown as Sac

  const phaseLue = lireChaine(s, ['phase', 'current_phase', 'currentPhase'])
  const phase = phaseLue !== null && (estPhase(phaseLue) || estArret(phaseLue)) ? phaseLue : 'PENDING'

  const arretLu = lireChaine(s, ['halt_state', 'haltState'])
  const halt_state = arretLu !== null && estArret(arretLu) ? arretLu : estArret(phase) ? phase : null

  const identiteLue = lireObjet(s, ['identity', 'identite'])
  const identity: Sac = identiteLue ?? {}

  const period_index =
    lireNombre(s, ['period_index', 'periodIndex']) ?? lireNombre(identity, ['period_index']) ?? 1

  const snapshot = 'snapshot' in s ? s['snapshot'] : 'current_snapshot' in s ? s['current_snapshot'] : null
  const deployment =
    'deployment' in s ? s['deployment'] : 'current_deployment' in s ? s['current_deployment'] : null

  const applied: Record<string, string> = {}
  const registre = lireObjet(s, ['applied_operations', 'appliedOperations'])
  if (registre !== null) {
    for (const k of Object.keys(registre).sort()) {
      const v = registre[k]
      if (typeof v === 'string') applied[k] = v
    }
  }

  const depense = lireChaine(s, ['spend_micro_usd'])

  return {
    schema: SCHEMA_ETAT,
    phase,
    halt_state,
    identity,
    period_index,
    snapshot,
    deployment,
    deployed_in_period: s['deployed_in_period'] === true,
    requirements: lireTableau(s, ['requirements', 'active_requirements', 'contracts']),
    backlog: lireTableau(s, ['backlog']),
    budget: lireObjet(s, ['budget']) ?? {},
    business_clock: lireChaine(s, ['business_clock', 'clock']),
    execution_mode: lireChaine(s, ['execution_mode']),
    cost_origin: lireChaine(s, ['cost_origin']),
    corpus_provenance: lireChaine(s, ['corpus_provenance']),
    intents_offered: lireCardinal(s, ['intents_offered']),
    intents_succeeded: lireCardinal(s, ['intents_succeeded']),
    unserved_intents: lireTableau(s, ['unserved_intents']),
    spend_micro_usd: depense !== null && /^-?\d+$/.test(depense) ? depense : '0',
    applied_operations: applied,
  }
}

/* ────────────────────────────────────────────────── refus typés */

function refus(
  code: PeriodTransitionErrorCode,
  message: string,
  from: string,
  to: string,
  operationKey: string | null,
  allowed: readonly string[],
): PeriodRejection {
  return {
    ok: false,
    error: { code, message, from, to, operation_key: operationKey, allowed },
    commands: [],
  }
}

/* ─────────────────────────────────────── effets d'une transition */

function identifiantDeDeploiement(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  const o = objet(v)
  if (o === null) return null
  return lireChaine(o, ['id', 'deployment_id', 'deploymentId'])
}

/** Le déploiement que porte un événement `DEPLOYING`, ramené à une donnée nommée. */
function deploiementDeLEvenement(vue: Sac): Sac | null {
  const direct = lireObjet(vue, ['deployment', 'deploiement'])
  const id =
    lireChaine(vue, ['deployment_id', 'deploymentId']) ??
    (direct === null ? null : identifiantDeDeploiement(direct))
  if (direct === null && id === null) return null
  const sortie: Sac = direct === null ? {} : { ...direct }
  if (id !== null) {
    sortie['id'] = id
    sortie['deployment_id'] = id
  }
  return sortie
}

/**
 * Les intentions NON SERVIES d'un événement d'exercice (D.5, L67). Si
 * l'événement énumère ses intentions, chacune est jugée sur son propre drapeau
 * `served` ; sinon le cardinal se déduit de l'écart entre offertes et réussies,
 * et chaque manquante est matérialisée — une demande non servie est une LIGNE,
 * pas seulement un compte.
 */
function intentionsNonServies(vue: Sac, cle: string): readonly unknown[] {
  const enumerees = lireTableau(vue, ['intents', 'intentions'])
  if (enumerees.length > 0) {
    return enumerees.filter((i) => {
      const o = objet(i)
      return o === null ? true : o['served'] !== true
    })
  }
  const offertes = lireCardinal(vue, ['intents_offered'])
  const reussies = lireCardinal(vue, ['intents_succeeded'])
  const manquantes = Math.max(0, offertes - reussies)
  const sortie: unknown[] = []
  for (let n = 1; n <= manquantes; n += 1) {
    sortie.push({ id: `${cle}#${String(n)}`, operation_key: cle, served: false })
  }
  return sortie
}

/* ══════════════════════════════════════════════════════════ les quatre rôles */

/**
 * L'état initial d'une période : phase `PENDING`, et les champs minimaux de
 * L87 repris du contexte. Les compteurs que D.5 oblige à conserver — intentions
 * non servies, dépense — partent à zéro, et le registre de déduplication de D.6
 * part vide.
 *
 * FONCTION PURE : le contexte n'est pas muté.
 */
export function initialPeriodState(context: PeriodState): PeriodState {
  const base = normaliserEtat(context)
  return {
    ...base,
    phase: estPhase(base.phase) ? base.phase : 'PENDING',
    halt_state: base.halt_state,
  }
}

/**
 * LA TRANSITION PURE (L197) : un état et un événement rendent un état suivant
 * et les commandes que des adaptateurs exécuteront.
 *
 * PURE veut dire trois choses, observées séparément par T05.A1 : l'état
 * d'entrée n'est pas muté, deux appels de mêmes arguments rendent exactement la
 * même chose, et aucun appel sortant n'a lieu.
 *
 * L'ORDRE DES CONTRÔLES N'EST PAS ARBITRAIRE. La déduplication de D.6 est
 * consultée AVANT la table des transitions : un rejeu est « sans effet
 * supplémentaire » (L199) même lorsque la phase a depuis avancé, sans quoi le
 * rejeu d'une tâche par l'orchestrateur produirait un refus là où le cahier
 * exige un silence.
 */
export function applyPeriodEvent(state: PeriodState, event: PeriodEvent): PeriodOutcome {
  const etat = normaliserEtat(state)
  const vue = vueEvenement(event)
  const cible = lireChaine(event as unknown as Sac, CHAMPS_CIBLE) ?? lireChaine(vue, CHAMPS_CIBLE) ?? ''
  const cle = cleOperation(event)

  // (0) SANS CLÉ D'OPÉRATION, D.6 EST INAPPLICABLE. Appliquer quand même
  //     reviendrait à accepter un effet qu'aucun rejeu ne pourrait dédupliquer.
  if (cle === null) {
    return refus(
      'OPERATION_KEY_MISSING',
      'un evenement de periode porte une cle d operation : sans elle, la deduplication de D.6 est impossible',
      etat.phase,
      cible,
      null,
      CHAMPS_IDENTITE_OPERATION,
    )
  }

  // (1) DÉDUPLICATION PAR CLÉ D'OPÉRATION ET EMPREINTE D'ENTRÉE (D.6, L68).
  const empreinte = empreinteDuContenu(event)
  const dejaVue = etat.applied_operations[cle]
  if (dejaVue !== undefined) {
    if (dejaVue === empreinte) {
      // REJEU EXACT : l'état d'entrée est rendu TEL QUEL, aucune commande n'est
      // réémise. Rendre l'objet reçu — et non un état reconstruit — est ce qui
      // rend « sans effet supplementaire » vrai octet pour octet.
      return { ok: true, state, commands: [] }
    }
    return refus(
      'IDEMPOTENCY_CONFLICT',
      'cle d operation deja appliquee avec une empreinte d entree differente',
      etat.phase,
      cible,
      cle,
      [dejaVue],
    )
  }

  // (2) LA CIBLE EST-ELLE UN ÉTAT CONNU DE §E ?
  const versArret = estArret(cible)
  if (!estPhase(cible) && !versArret) {
    return refus(
      'UNKNOWN_TRANSITION_TARGET',
      'la cible ne nomme ni une phase ni un etat d arret',
      etat.phase,
      cible,
      cle,
      [...PHASE_STATES, ...COMPUTATION_HALT_STATES],
    )
  }

  // (3) LA TABLE DES TRANSITIONS (L201). Les états d'arrêt sont atteignables
  //     depuis toute phase non terminale : un budget peut s'épuiser n'importe
  //     quand. Un état terminal, lui, n'a plus de successeur.
  const depuisArret = estArret(etat.phase)
  const terminal = depuisArret || etat.phase === 'COMPLETED'
  const autorisees: readonly string[] = depuisArret
    ? []
    : estPhase(etat.phase)
      ? [...PERIOD_TRANSITIONS[etat.phase], ...(terminal ? [] : COMPUTATION_HALT_STATES)]
      : []
  if (!autorisees.includes(cible)) {
    return refus(
      'TRANSITION_NOT_ALLOWED',
      'transition refusee par la table des transitions de la periode',
      etat.phase,
      cible,
      cle,
      autorisees,
    )
  }

  // (4) L'ÉVÉNEMENT S'APPLIQUE. Le registre de D.6 enregistre la clé et son
  //     empreinte : c'est lui, et lui seul, qui rendra le rejeu silencieux.
  const applied_operations: Record<string, string> = { ...etat.applied_operations, [cle]: empreinte }
  const budgetEvenement = lireObjet(vue, ['budget'])
  const budget: Sac = budgetEvenement === null ? etat.budget : { ...etat.budget, ...budgetEvenement }
  const commands: PeriodCommand[] = []

  let suivant: EtatNormalise = {
    ...etat,
    phase: cible,
    budget,
    applied_operations,
  }

  if (versArret) {
    // ARRÊT DE CALCUL (L97) : il est ENREGISTRÉ, pas subi — « les états d'arrêt
    // n'effacent pas la période de l'analyse ». Et la version DÉJÀ EN PLACE est
    // mise en mesure : c'est ce que L199 exige — « budget épuisé déclenche
    // mesure de la version existante, pas succès fictif ».
    suivant = { ...suivant, halt_state: cible }
    commands.push({
      type: 'RECORD_HALT',
      halt_state: cible,
      period_index: etat.period_index,
      operation_key: cle,
    })
    const existant = identifiantDeDeploiement(etat.deployment)
    if (existant !== null) {
      commands.push({
        type: 'MEASURE_EXISTING_DEPLOYMENT',
        deployment_id: existant,
        halt_state: cible,
        period_index: etat.period_index,
        operation_key: cle,
      })
    }
    return { ok: true, state: suivant, commands }
  }

  const typeCommande = PERIOD_PHASE_COMMANDS[cible]

  if (cible === 'DEPLOYING') {
    const deploiement = deploiementDeLEvenement(vue)
    if (deploiement !== null) {
      suivant = { ...suivant, deployment: deploiement, deployed_in_period: true }
    }
    commands.push({
      type: typeCommande ?? 'DEPLOY_VERSION',
      deployment_id: identifiantDeDeploiement(deploiement ?? etat.deployment),
      period_index: etat.period_index,
      operation_key: cle,
    })
    return { ok: true, state: suivant, commands }
  }

  if (cible === 'EXERCISING') {
    const offertes = lireCardinal(vue, ['intents_offered'])
    const reussies = lireCardinal(vue, ['intents_succeeded'])
    const nonServies = intentionsNonServies(vue, cle)
    const depense = lireMontant(vue, ['spend_micro_usd', 'spend', 'spent', 'amount', 'cost'])
    suivant = {
      ...suivant,
      intents_offered: etat.intents_offered + offertes,
      intents_succeeded: etat.intents_succeeded + reussies,
      unserved_intents: [...etat.unserved_intents, ...nonServies],
      // D.9 (L71) : entiers exacts, jamais une addition de flottants monétaires.
      spend_micro_usd: (BigInt(etat.spend_micro_usd) + depense).toString(),
    }
    commands.push({
      type: typeCommande ?? 'EXERCISE_USAGE',
      period_index: etat.period_index,
      operation_key: cle,
      intents_offered: offertes,
      intents_succeeded: reussies,
      spend_micro_usd: depense.toString(),
    })
    return { ok: true, state: suivant, commands }
  }

  if (typeCommande !== null) {
    commands.push({
      type: typeCommande,
      period_index: etat.period_index,
      operation_key: cle,
      phase: cible,
    })
  }
  return { ok: true, state: suivant, commands }
}

/**
 * LA RÉDUCTION D'UN JOURNAL EN ÉTAT FINAL (L201). Elle coïncide EXACTEMENT avec
 * le pliage pas à pas du même journal, parce qu'elle EST ce pliage : il n'y a
 * pas deux chemins d'exécution à tenir d'accord.
 *
 * @throws PeriodLogRejected si une transition du journal est refusée.
 */
export function reducePeriodLog(state: PeriodState, log: readonly PeriodEvent[]): PeriodState {
  let etat: PeriodState = normaliserEtat(state)
  let rang = 0
  for (const evenement of log) {
    const sortie = applyPeriodEvent(etat, evenement)
    if (!sortie.ok) throw new PeriodLogRejected(sortie.error, rang)
    etat = sortie.state
    rang += 1
  }
  return etat
}

/** L'exigence telle que la mesure de T04 la lit (L109, L129). */
function exigenceMesurable(u: unknown): MetricRequirement {
  const o = objet(u) ?? {}
  const id = lireChaine(o, ['id']) ?? ''
  const assertions = lireTableau(o, ['assertions']).map((a) => String(a))
  return {
    id,
    version: lireNombre(o, ['version']) ?? 1,
    capability_id: lireChaine(o, ['capability_id']) ?? id,
    weight: lireNombre(o, ['weight']) ?? 1,
    revealed_at_period: lireNombre(o, ['revealed_at_period']) ?? 1,
    due_at_period: lireNombre(o, ['due_at_period']) ?? 1,
    criticality: lireChaine(o, ['criticality']) ?? 'REQUIRED',
    source: lireChaine(o, ['source']) ?? '',
    satisfied: o['satisfied'] === true,
    assertions,
  }
}

/**
 * LA CLÔTURE D'UNE PÉRIODE : l'état final devient un `PeriodResult` (L95).
 *
 * Elle rend TOUJOURS une ligne, y compris pour une période arrêtée — L97 :
 * les états d'arrêt « n'effacent pas la période de l'analyse ». Elle conserve
 * la dépense telle qu'elle a été observée, sans plancher ni arrondi (D.5 L67,
 * F-FAILURE L121 : « aucune facture imaginaire n'y est ajoutée »), et les
 * intentions non servies une par une.
 *
 * Q et R ne sont pas recalculés ici : ils sont demandés à `computePeriodMetrics`
 * (T04), seul détenteur des conventions de L109 et L111.
 */
export function closePeriod(state: PeriodState): PeriodResult {
  const etat = normaliserEtat(state)

  const periode: MetricPeriod = {
    period_index: etat.period_index,
    // La durée ne pondère qu'une moyenne TEMPORELLE de campagne ; une clôture
    // porte une seule période, donc toute durée strictement positive donne les
    // mêmes Q et R. `1` est le choix neutre, et il est déclaré, pas déduit.
    duration: 1,
    requirements: etat.requirements.map(exigenceMesurable),
    retired: [],
    intents_offered: etat.intents_offered,
    intents_succeeded: etat.intents_succeeded,
  }
  const mesure = computePeriodMetrics([periode])
  const ligne = mesure.periods[0]

  const deploiement = identifiantDeDeploiement(etat.deployment)
  const deployment_coverage: DeploymentCoverage =
    deploiement === null
      ? 'NO_DEPLOYMENT'
      : etat.intents_offered > 0 && etat.unserved_intents.length === 0
        ? 'ACCEPTED'
        : 'PARTIAL'

  const attempt_outcome: AttemptOutcome =
    etat.halt_state === 'CANCELLED'
      ? 'CANCELLED'
      : etat.halt_state !== null
        ? 'FAILED'
        : etat.phase === 'COMPLETED'
          ? 'SUCCESS'
          : 'FAILED'

  return {
    schema: 'bench.period_result/1',
    period_index: etat.period_index,
    identity: etat.identity,
    phase: etat.phase,
    halt_state: etat.halt_state,
    attempt_outcome,
    deployment_coverage,
    deployment_id: deploiement,
    intents_offered: etat.intents_offered,
    intents_succeeded: etat.intents_succeeded,
    unserved_intents: etat.unserved_intents,
    spend: etat.spend_micro_usd,
    spend_micro_usd: etat.spend_micro_usd,
    Q: ligne === undefined ? null : ligne.Q,
    R: ligne === undefined ? null : ligne.R,
    G: ligne === undefined ? 0 : ligne.G,
    G_new: ligne === undefined ? 0 : ligne.G_new,
    regressions: ligne === undefined ? [] : ligne.regressions,
    new_regressions: ligne === undefined ? [] : ligne.new_regressions,
    backlog: ligne === undefined ? [] : ligne.backlog,
    evaluated_requirements: periode.requirements,
    incidents: [],
    state_digest: canonicalDigest(valeurCanonique(etat)),
  }
}
