// ─────────────────────────────────────────────────────────────────────────────
// EXÉCUTION d'un plan d'usage : résolution d'identifiants externes (L221),
// statuts d'intention, et comptages séparés.
//
// ── TROIS RÈGLES, ET LA LIGNE DU CAHIER QUI LES IMPOSE ─────────────────────
//
// (1) UNE INTENTION N'EST JAMAIS SUPPRIMÉE. Le résultat porte une issue par
//     intention du plan, dans l'ordre du plan — `outcomes.length ===
//     plan.intents.length`, toujours. Invariant D-5 (L67) : « un échec conserve
//     ses dépenses, ses INTENTIONS NON SERVIES et son backlog » ; phrase de fin
//     de T08 (L225) : « conservation du nombre d'intentions offertes ».
//     Une intention dont une référence externe manque à la suite d'un échec
//     antérieur reçoit le statut `UNSERVED` — elle reste là, et le monde n'est
//     pas appelé pour elle (T08.A3, L223). La supprimer donnerait un plan qui
//     rétrécit à mesure que le candidat échoue, c'est-à-dire un taux de réussite
//     qui monte quand l'application se dégrade.
//
// (2) LA RÉSOLUTION D'IDENTIFIANTS EXTERNES EST RÉELLE. Un handle n'est résolu
//     que si une intention ANTÉRIEURE l'a effectivement produit ET que le monde
//     a rendu l'identifiant externe correspondant. L'identifiant transmis à
//     l'intention dépendante est celui que le MONDE a rendu, pas un symbole
//     fabriqué ici : c'est ce que « résolution d'identifiants externes » (L221)
//     désigne, et une résolution symbolique verdirait sans rien prouver.
//     C'est aussi pourquoi les intentions sont servies EN SÉQUENCE : le nombre
//     de workers est une option d'exécution, mais l'ordre dans lequel un handle
//     devient disponible est une donnée du plan, pas du parallélisme.
//
// (3) LES COMPTAGES SONT SÉPARÉS À LA SOURCE. T08.A4 (L223) : « les essais
//     négatifs de sécurité alimentent conformité/criticité SANS gonfler
//     artificiellement les échecs des parcours métier valides ». La séparation
//     n'est pas un filtrage à la lecture : une intention appartient à l'une ou
//     l'autre famille selon le `kind` de son usage, et chaque famille tient ses
//     propres compteurs. Un essai intertenant correctement refusé (`NOT_FOUND`
//     sans donnée divulguée, L123) est le RÉSULTAT ATTENDU d'un essai négatif ;
//     le compter comme échec métier ferait baisser le score d'un candidat
//     précisément parce qu'il respecte l'isolation des locataires.
//
// CE QUE CE MODULE NE FAIT PAS. Il ne décide d'aucune mise hors service : la
// politique de criticité est T22 (L349). Il ne mesure ni attente technique ni
// temps de calcul : L225 les sépare du temps métier, et T26 (L383) les
// enregistre. Ici, le seul temps est celui de l'horloge métier, déjà inscrit
// dans chaque intention.
// ─────────────────────────────────────────────────────────────────────────────
import { isComplianceKind } from './catalog.js'
import { WorkloadRejection, childPath } from './errors.js'
import type { Intent, IntentPlan } from './plan.js'
import { requireNonEmptyString, requireObject } from './shapes.js'

/** Ce que le MONDE — l'application témoin candidate — rend pour une intention. */
export interface WorldReply {
  readonly ok: boolean
  readonly external_id?: string
  readonly denied?: boolean
  readonly code?: string
}

/**
 * Le monde contre lequel un plan s'exécute. Une fonction, ou un objet portant
 * l'un des points d'entrée usuels : le moteur ne prescrit pas le nom sous
 * lequel une application témoin s'expose, et refuser sur ce nom ferait échouer
 * une campagne pour une raison qui n'est pas métier.
 */
export type World =
  | ((intent: IntentInvocation) => WorldReply | Promise<WorldReply>)
  | Readonly<Record<string, unknown>>

/**
 * Ce qui est SOUMIS au monde pour une intention. C'est l'intention elle-même,
 * augmentée des identifiants externes réellement résolus : sans eux, une
 * intention dépendante ne saurait pas sur QUOI agir.
 */
export interface IntentInvocation {
  readonly id: string
  readonly usage: string
  readonly operation: string
  readonly actor: string
  readonly tenant: string
  readonly at: string
  readonly usage_kind: string
  readonly requires: readonly string[]
  readonly produces: string | null
  readonly resolved_references: Readonly<Record<string, string>>
}

/**
 * Les statuts qu'une intention exécutée peut porter. Ils sont FACTUELS — ils
 * disent ce qui est arrivé, pas si c'était souhaitable. Le jugement, lui, est
 * dans les compteurs : un `DENIED` est le résultat attendu d'un essai négatif
 * et une avarie pour un parcours métier, et c'est la famille de l'usage qui
 * tranche, pas le statut.
 *
 *   SERVED    le monde a été appelé et a accepté.
 *   DENIED    le monde a été appelé et a refusé, par un code de refus d'accès.
 *   FAILED    le monde a été appelé et a échoué pour une autre raison.
 *   UNSERVED  le monde n'a PAS été appelé : une référence externe manquait.
 */
export const INTENT_STATUSES = ['SERVED', 'DENIED', 'FAILED', 'UNSERVED'] as const
export type IntentStatus = (typeof INTENT_STATUSES)[number]

/**
 * L'issue d'une intention. `resolved_reference` est l'identifiant externe sur
 * lequel l'intention a effectivement agi ; `missing_references` nomme ce qui
 * manquait quand elle n'a pas pu l'être — une intention non servie doit dire
 * POURQUOI, sinon elle est indistinguable d'une intention oubliée.
 */
export interface IntentOutcome {
  readonly id: string
  readonly usage: string
  readonly operation: string
  readonly status: IntentStatus
  readonly external_id: string | null
  readonly resolved_reference: string | null
  readonly code: string | null
  readonly missing_references: readonly string[]
}

/**
 * Compteurs agrégés PUBLIÉS par l'exécution. Deux familles disjointes :
 *
 *   `business`    les parcours métier valides. `offered` est leur nombre —
 *                 conservé (L225) —, `served` ceux que le monde a acceptés,
 *                 `failed` ceux qui ont réellement échoué, `unserved` ceux
 *                 qu'une référence manquante a empêchés.
 *   `compliance`  les essais négatifs de sécurité, qui alimentent
 *                 conformité/criticité. `denied` est le nombre d'essais
 *                 correctement refusés ; `not_denied` le nombre d'essais que le
 *                 candidat a laissé passer — c'est LUI qui porte le signal de
 *                 criticité ; `failed` les essais restés sans conclusion à cause
 *                 d'une avarie. Aucun des quatre n'entre dans un compteur
 *                 métier.
 *
 * Aucune intention n'est comptée dans les deux familles, et la somme des deux
 * `offered`/`count` vaut le nombre d'intentions du plan.
 */
export interface IntentExecutionCounters {
  readonly business: {
    readonly offered: number
    readonly served: number
    readonly failed: number
    readonly unserved: number
  }
  readonly compliance: {
    readonly count: number
    readonly denied: number
    readonly not_denied: number
    readonly failed: number
    readonly unserved: number
  }
}

/** Le résultat d'une exécution : les issues, et les compteurs agrégés. */
export interface IntentExecutionResult {
  readonly scenario: string
  readonly seed: string
  readonly outcomes: readonly IntentOutcome[]
  readonly counters: IntentExecutionCounters
}

/** Option d'EXÉCUTION. Elle ne change ni l'ordre des issues, ni leur nombre. */
export interface IntentExecutionOptions {
  readonly workers?: number
}

/**
 * Les codes par lesquels un monde signale un REFUS D'ACCÈS, par opposition à
 * une avarie. §F fixe celui du contrat intertenant : « NOT_FOUND sans donnée
 * métier divulguée » (L123). Les autres sont les formes usuelles du même
 * verdict ; les reconnaître évite qu'un témoin correct soit compté en panne
 * parce qu'il nomme `FORBIDDEN` ce que §F nomme `NOT_FOUND`.
 */
const DENIAL_CODES =
  /^(NOT_FOUND|FORBIDDEN|UNAUTHORIZED|DENIED|ACCESS_DENIED|NOT_ALLOWED|NOT_PERMITTED)$/i

const WORLD_ENTRY_ALIASES = ['perform', 'execute', 'run', 'call', 'handle', 'apply', 'send'] as const

type WorldEntry = (invocation: IntentInvocation) => unknown

function resolveWorldEntry(world: World): WorldEntry {
  if (typeof world === 'function') return world as WorldEntry
  if (world !== null && typeof world === 'object') {
    const o = world as Record<string, unknown>
    for (const alias of WORLD_ENTRY_ALIASES) {
      const f = o[alias]
      if (typeof f === 'function') {
        const entry = f as WorldEntry
        return (invocation: IntentInvocation): unknown => entry.call(world, invocation)
      }
    }
  }
  throw new WorkloadRejection(
    'WORLD_UNREACHABLE',
    '/world',
    `ni fonction, ni objet portant ${WORLD_ENTRY_ALIASES.join(', ')}`,
  )
}

/** Une intention, telle qu'un plan la publie. */
function readIntent(value: unknown, path: string): Intent {
  const o = requireObject(value, path)
  const requires = o['requires']
  const produces = o['produces']
  return {
    id: requireNonEmptyString(o['id'], childPath(path, 'id')),
    usage: typeof o['usage'] === 'string' ? o['usage'] : '',
    operation: typeof o['operation'] === 'string' ? o['operation'] : '',
    actor: typeof o['actor'] === 'string' ? o['actor'] : '',
    tenant: typeof o['tenant'] === 'string' ? o['tenant'] : '',
    at: typeof o['at'] === 'string' ? o['at'] : '',
    usage_kind: typeof o['usage_kind'] === 'string' ? o['usage_kind'] : '',
    requires: Array.isArray(requires) ? requires.filter((x): x is string => typeof x === 'string') : [],
    produces: typeof produces === 'string' ? produces : null,
  }
}

/** Le plan soumis à l'exécution : celui que le générateur a rendu, ou sa liste nue. */
function readPlan(plan: IntentPlan | readonly Intent[]): {
  scenario: string
  seed: string
  intents: readonly Intent[]
} {
  if (Array.isArray(plan)) {
    return { scenario: '', seed: '', intents: plan.map((x, i) => readIntent(x, `/plan/${String(i)}`)) }
  }
  const o = requireObject(plan, '/plan')
  const intents = o['intents']
  if (!Array.isArray(intents)) {
    throw new WorkloadRejection('PLAN_MALFORMED', '/plan/intents', 'attendu la liste des intentions')
  }
  return {
    scenario: typeof o['scenario'] === 'string' ? o['scenario'] : '',
    seed: typeof o['seed'] === 'string' ? o['seed'] : '',
    intents: intents.map((x, i) => readIntent(x, `/plan/intents/${String(i)}`)),
  }
}

interface NormalizedReply {
  readonly ok: boolean
  readonly externalId: string | null
  readonly denied: boolean
  readonly code: string | null
}

/**
 * Lit la réponse du monde. La lecture est TOLÉRANTE : le monde est
 * l'application candidate, pas un message de domaine du §E, et les propriétés
 * qu'il ajoute ne le disqualifient pas. Une réponse ILLISIBLE n'interrompt pas
 * la campagne : elle produit un échec de CETTE intention — interrompre
 * supprimerait les issues des intentions suivantes, ce que L225 interdit.
 */
function readReply(raw: unknown): NormalizedReply {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, externalId: null, denied: false, code: 'WORLD_REPLY_MALFORMED' }
  }
  const o = raw as Record<string, unknown>
  const code = typeof o['code'] === 'string' ? o['code'] : null
  const ok = o['ok'] === true
  return {
    ok,
    externalId: typeof o['external_id'] === 'string' ? o['external_id'] : null,
    denied: o['denied'] === true || (code !== null && DENIAL_CODES.test(code)),
    code,
  }
}

interface Tally {
  offered: number
  served: number
  failed: number
  denied: number
  notDenied: number
  unserved: number
}

const emptyTally = (): Tally => ({
  offered: 0,
  served: 0,
  failed: 0,
  denied: 0,
  notDenied: 0,
  unserved: 0,
})

/**
 * Exécute le plan contre le monde fourni, en résolvant les identifiants
 * externes que les intentions antérieures ont réellement produits (L221).
 */
export async function executeIntentPlan(
  plan: IntentPlan | readonly Intent[],
  world: World,
  options: IntentExecutionOptions = {},
): Promise<IntentExecutionResult> {
  requireObject(options, '/options')
  const { scenario, seed, intents } = readPlan(plan)
  const entry = resolveWorldEntry(world)

  /** Handle externe -> identifiant externe RENDU PAR LE MONDE. */
  const resolved = new Map<string, string>()
  const outcomes: IntentOutcome[] = []
  const business = emptyTally()
  const compliance = emptyTally()

  for (const intent of intents) {
    // La FAMILLE est décidée par le `kind` de l'usage, une fois, avant tout
    // appel au monde : elle ne dépend donc pas de ce que le monde répond, et un
    // essai négatif ne peut pas « devenir » un parcours métier parce qu'il a
    // été refusé (T08.A4, L223).
    const conformite = isComplianceKind(intent.usage_kind)
    const tally = conformite ? compliance : business
    tally.offered += 1

    const missing = intent.requires.filter((h) => !resolved.has(h))
    if (missing.length > 0) {
      // (1) NON SERVIE, ET CONSERVÉE. Le monde n'est pas appelé.
      tally.unserved += 1
      outcomes.push({
        id: intent.id,
        usage: intent.usage,
        operation: intent.operation,
        status: 'UNSERVED',
        external_id: null,
        resolved_reference: null,
        code: 'UNRESOLVED_REFERENCE',
        missing_references: Object.freeze([...missing]),
      })
      continue
    }

    const references: Record<string, string> = {}
    for (const h of intent.requires) {
      const ext = resolved.get(h)
      if (ext !== undefined) references[h] = ext
    }
    const premierHandle = intent.requires[0]
    const premiere = premierHandle === undefined ? null : (references[premierHandle] ?? null)

    const reply = readReply(
      await Promise.resolve(
        entry({
          id: intent.id,
          usage: intent.usage,
          operation: intent.operation,
          actor: intent.actor,
          tenant: intent.tenant,
          at: intent.at,
          usage_kind: intent.usage_kind,
          requires: intent.requires,
          produces: intent.produces,
          resolved_references: Object.freeze({ ...references }),
        }),
      ),
    )

    if (reply.ok) {
      // (2) L'identifiant externe RENDU PAR LE MONDE devient la référence des
      //     intentions ultérieures. Rien n'est fabriqué ici.
      if (intent.produces !== null && reply.externalId !== null) {
        resolved.set(intent.produces, reply.externalId)
      }
      tally.served += 1
      // Un essai négatif que le candidat ACCEPTE est une isolation non tenue :
      // c'est le signal de criticité, et il reste hors du comptage métier.
      if (conformite) compliance.notDenied += 1
      outcomes.push({
        id: intent.id,
        usage: intent.usage,
        operation: intent.operation,
        status: 'SERVED',
        external_id: reply.externalId,
        resolved_reference: premiere,
        code: reply.code,
        missing_references: Object.freeze([]),
      })
      continue
    }

    // (3) UN REFUS D'ACCÈS N'EST PAS UNE AVARIE — et il ne se lit pas de la
    //     même manière selon la famille. Pour un ESSAI NÉGATIF, le refus est le
    //     résultat attendu : il alimente `compliance.denied`. Pour un PARCOURS
    //     MÉTIER VALIDE, être refusé est un échec comme un autre : il alimente
    //     `business.failed`. C'est cette asymétrie que L223 demande, et la
    //     confondre reviendrait à pénaliser un candidat qui isole correctement
    //     ses locataires.
    const status: IntentStatus = reply.denied ? 'DENIED' : 'FAILED'
    if (conformite && reply.denied) compliance.denied += 1
    else tally.failed += 1
    outcomes.push({
      id: intent.id,
      usage: intent.usage,
      operation: intent.operation,
      status,
      external_id: reply.externalId,
      resolved_reference: premiere,
      code: reply.code,
      missing_references: Object.freeze([]),
    })
  }

  const counters: IntentExecutionCounters = Object.freeze({
    business: Object.freeze({
      offered: business.offered,
      served: business.served,
      failed: business.failed,
      unserved: business.unserved,
    }),
    compliance: Object.freeze({
      count: compliance.offered,
      denied: compliance.denied,
      not_denied: compliance.notDenied,
      failed: compliance.failed,
      unserved: compliance.unserved,
    }),
  })

  return Object.freeze({
    scenario,
    seed,
    outcomes: Object.freeze(outcomes),
    counters,
  })
}
