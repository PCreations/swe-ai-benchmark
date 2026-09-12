// ─────────────────────────────────────────────────────────────────────────────
// Le MODÈLE D'INTENTION et le PLAN D'USAGE SEEDÉ (livrables de L221).
//
// ── CE QUI DÉTERMINE UN PLAN, ET CE QUI NE LE DÉTERMINE PAS ────────────────
//
// Entrent dans le plan : le scénario, la graine, le catalogue d'usages, le
// locataire, les acteurs, et l'instant lu sur l'HORLOGE MÉTIER fournie.
//
// N'entrent PAS dans le plan, et ne peuvent pas y entrer :
//
//   • LE NOMBRE DE WORKERS. C'est l'énoncé de T08.A1 : « même scénario/graine
//     donne les mêmes intentions, même avec un nombre de workers différent »
//     (L223). Il est accepté, contrôlé, puis ignoré — il qualifie l'EXÉCUTION,
//     pas la génération. Le piège que ce cas nomme est connu : partitionner la
//     graine par worker, ou ordonner les intentions par ordre d'achèvement.
//     Ici l'ordre est topologique — un producteur de handle précède ses
//     consommateurs — et départagé par une clé dérivée de (flux, scénario,
//     graine, usage). Ni l'un ni l'autre ne lit le nombre de workers : il
//     n'existe aucun chemin par lequel il atteindrait l'ordre ou le contenu.
//
//   • L'ÉTAT DU CANDIDAT. T08.A2 (L223) et l'en-tête de `catalog.ts`.
//
//   • L'HORLOGE SYSTÈME. L'instant métier des intentions vient de l'horloge
//     métier passée en entrée (L88, L221). `Date.now()` n'existe nulle part
//     dans ce paquet.
//
//   • TOUTE ENTROPIE. Pas de `Math.random`, pas de compteur de module, pas
//     d'identifiant tiré d'une source externe. Rejouer la même entrée rend le
//     même plan, ce que L143 exige d'une suite seedée : « rejouer une suite
//     avec la même graine et version d'algorithme donne la même suite ».
//
// ── CONSERVATION DU NOMBRE D'INTENTIONS OFFERTES (L225) ────────────────────
//
// Le plan porte EXACTEMENT une intention par usage du catalogue. Ni filtrage,
// ni déduplication, ni expansion : `intents.length === usages.length`, toujours.
// C'est la phrase de fin de T08, et c'est aussi ce qui donne un sens aux
// cardinaux de §F — un plan qui déciderait lui-même du nombre d'intentions
// offertes rendrait « intentions offertes [4,4,0,2] » invérifiable.
// ─────────────────────────────────────────────────────────────────────────────
import { readBusinessClock } from './clock.js'
import type { BusinessClock } from './clock.js'
import { normalizeCandidateState, normalizeCatalog } from './catalog.js'
import type { CandidateState, NormalizedUsage, UsageTemplate } from './catalog.js'
import {
  fnv1a32,
  hex8,
  requireNonEmptyString,
  requireNonNegativeInteger,
  requireObject,
  requireOnlyKeys,
  requireStringArray,
  seedKey,
} from './shapes.js'

/**
 * Une intention. Contrat `Intent` du §E (L88) : « id stable, acteur externe,
 * locataire, instant métier, opération, arguments, cible métier attendue ».
 *
 * `requires` et `produces` sont la « cible métier attendue » côté références :
 * ce que l'intention consomme et ce qu'elle crée. C'est sur eux que
 * l'exécution résout les identifiants externes (L221).
 */
export interface Intent {
  readonly id: string
  readonly usage: string
  readonly operation: string
  readonly actor: string
  readonly tenant: string
  readonly at: string
  readonly usage_kind: string
  readonly requires: readonly string[]
  readonly produces: string | null
}

/**
 * Entrée du générateur. Objet PLAT et STRICT (L80 : « propriétés inconnues
 * rejetées ») — la liste close est `PLAN_INPUT_KEYS`.
 */
export interface IntentPlanInput {
  readonly scenario: string
  readonly seed: string
  readonly usages: readonly UsageTemplate[]
  readonly clock: BusinessClock
  readonly tenant?: string
  readonly actors?: readonly string[]
  readonly slot?: string
  readonly candidate_state?: CandidateState
  readonly workers?: number
  readonly worker_count?: number
  readonly concurrency?: number
}

/** Le plan rendu par le générateur : les intentions OFFERTES (L95, L225). */
export interface IntentPlan {
  readonly scenario: string
  readonly seed: string
  readonly tenant: string
  readonly business_instant: string
  readonly intents: readonly Intent[]
}

/**
 * Les propriétés que l'entrée déclare. Trois d'entre elles méritent d'être
 * nommées :
 *
 *   `slot`        le créneau du scénario (F-RESERVATION, `valeurs.creneau.id`).
 *                 Il identifie la cible métier de la campagne ; il ne change ni
 *                 le nombre d'intentions ni leur ordre.
 *   `workers`     l'option d'EXÉCUTION de T08.A1. `worker_count` et
 *                 `concurrency` en sont deux graphies : elles sont acceptées
 *                 parce que refuser une GRAPHIE ferait dépendre d'un nom une
 *                 propriété qui porte sur le NOMBRE. Les trois sont ignorées de
 *                 la même manière — le générateur ne les lit que pour les
 *                 contrôler.
 *   `candidate_state`  contrôlé, jamais filtrant (voir `catalog.ts`).
 */
export const PLAN_INPUT_KEYS = [
  'scenario',
  'seed',
  'tenant',
  'actors',
  'slot',
  'usages',
  'candidate_state',
  'clock',
  'workers',
  'worker_count',
  'concurrency',
] as const

/** Les trois graphies de l'option d'exécution que la génération ignore. */
const WORKER_KEYS = ['workers', 'worker_count', 'concurrency'] as const

/** Le flux de graine de cette tâche (L82 : `scenario`, `workload`, `assignment`, `bootstrap`). */
export const WORKLOAD_SEED_STREAM = 'workload'

/**
 * Le rang d'un usage dans le plan. Dérivé de (flux, scénario, graine, usage) —
 * et de rien qui varie d'une exécution à l'autre. Deux usages de rang égal sont
 * départagés par leur identifiant, puis par leur position dans le catalogue :
 * l'ordre est donc total et ne dépend jamais de l'ordre d'achèvement.
 */
function usageRank(scenario: string, seed: string, usageId: string): number {
  return fnv1a32(seedKey(WORKLOAD_SEED_STREAM, scenario, seed, usageId))
}

/**
 * L'`id` STABLE d'une intention (L88). Il porte l'identifiant d'usage en clair
 * — un rapport de preuve se lit — et une empreinte du quadruplet qui le
 * détermine. Il ne contient ni horodatage, ni compteur, ni rang : sans quoi
 * « stable » ne survivrait pas au premier changement d'ordre.
 */
function intentId(scenario: string, seed: string, usage: NormalizedUsage, index: number): string {
  const empreinte = fnv1a32(
    seedKey(WORKLOAD_SEED_STREAM, scenario, seed, usage.id, usage.operation, String(index)),
  )
  return `I-${usage.id}-${hex8(empreinte)}`
}

/**
 * L'acteur externe d'une intention (L88). Quand le scénario le fixe sur
 * l'usage, c'est lui. Sinon il est tiré de la liste d'acteurs par la même clé
 * seedée que le rang : le tirage est reproductible, donc il ne casse pas A1.
 */
function actorOf(
  usage: NormalizedUsage,
  actors: readonly string[],
  scenario: string,
  seed: string,
): string {
  if (usage.actor !== null) return usage.actor
  if (actors.length === 0) return `${WORKLOAD_SEED_STREAM}:sans-acteur-declare`
  const i = fnv1a32(seedKey(WORKLOAD_SEED_STREAM, scenario, seed, 'actor', usage.id)) % actors.length
  return actors[i] ?? `${WORKLOAD_SEED_STREAM}:sans-acteur-declare`
}

/** Un usage, sa position dans le catalogue, et son rang seedé. */
interface RankedUsage {
  readonly usage: NormalizedUsage
  readonly index: number
  readonly rank: number
}

/** L'ordre total entre deux usages PRÊTS : rang seedé, puis identifiant, puis position. */
function compareRanked(a: RankedUsage, b: RankedUsage): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  if (a.usage.id !== b.usage.id) return a.usage.id < b.usage.id ? -1 : 1
  return a.index - b.index
}

/**
 * L'ORDRE DU PLAN : un ordre topologique, départagé par la graine.
 *
 * POURQUOI TOPOLOGIQUE, ET PAS SEULEMENT SEEDÉ. Un usage qui `produces` un
 * handle doit précéder ceux qui le `requires`. Sans cette contrainte, une chaîne
 * de dépendance ne serait servie que si la graine avait, par chance, rangé le
 * producteur en premier : la « résolution d'identifiants externes » de L221
 * deviendrait un tirage, et T08.A3 ne distinguerait plus une référence manquante
 * À CAUSE D'UN ÉCHEC ANTÉRIEUR d'une référence manquante à cause de l'ordre.
 *
 * POURQUOI SEEDÉ QUAND MÊME. La contrainte topologique n'ordonne que les paires
 * liées par un handle ; tout le reste est libre, et c'est là que la graine
 * choisit. À chaque pas, le plus petit des usages PRÊTS est retenu — « prêt »
 * signifiant que tous ses producteurs sont déjà placés. Le résultat est un ordre
 * total, fonction de (scénario, graine, catalogue) et de rien d'autre : ni
 * nombre de workers, ni ordre d'achèvement (T08.A1, L223).
 *
 * UN CYCLE NE FAIT PAS DISPARAÎTRE D'INTENTION. Si plus aucun usage n'est prêt
 * alors qu'il en reste, le reste est un cycle de handles. Les usages concernés
 * sont placés dans l'ordre seedé et resteront NON SERVIS à l'exécution : leurs
 * prérequis ne seront jamais résolus. Les refuser ici supprimerait des
 * intentions offertes, ce que L225 interdit ; le refus d'un graphe cyclique est
 * d'ailleurs le fait de la compilation du scénario (T06.A5, L207), pas du plan.
 */
function orderUsages(
  scenario: string,
  seed: string,
  usages: readonly NormalizedUsage[],
): readonly RankedUsage[] {
  const nodes: readonly RankedUsage[] = usages.map((usage, index) => ({
    usage,
    index,
    rank: usageRank(scenario, seed, usage.id),
  }))

  // Handle -> position de l'usage qui le produit. Un handle produit par
  // plusieurs usages retient le premier : le catalogue reste servable, et le
  // doublon ne crée pas de contrainte contradictoire.
  const producteur = new Map<string, number>()
  nodes.forEach((n, i) => {
    if (n.usage.produces !== null && !producteur.has(n.usage.produces)) {
      producteur.set(n.usage.produces, i)
    }
  })

  const prerequis: readonly Set<number>[] = nodes.map((n, i) => {
    const s = new Set<number>()
    for (const handle of n.usage.requires) {
      const p = producteur.get(handle)
      if (p !== undefined && p !== i) s.add(p)
    }
    return s
  })

  const restants = new Set<number>(nodes.map((_, i) => i))
  const ordre: RankedUsage[] = []
  while (restants.size > 0) {
    const prets: RankedUsage[] = []
    for (const i of restants) {
      const attendus = prerequis[i]
      const node = nodes[i]
      if (node === undefined) continue
      if (attendus === undefined || [...attendus].every((p) => !restants.has(p))) prets.push(node)
    }
    if (prets.length === 0) {
      // Cycle : le reste est placé dans l'ordre seedé, et conservé.
      const bloques = [...restants]
        .map((i) => nodes[i])
        .filter((n): n is RankedUsage => n !== undefined)
        .sort(compareRanked)
      ordre.push(...bloques)
      break
    }
    prets.sort(compareRanked)
    const choisi = prets[0]
    if (choisi === undefined) break
    ordre.push(choisi)
    restants.delete(choisi.index)
  }
  return ordre
}

/**
 * Produit le plan d'usage seedé du scénario (L221).
 *
 * Le plan ne dépend ni du nombre de workers, ni de l'état du candidat, ni de
 * l'horloge système. Son cardinal est celui du catalogue (L225).
 */
export function generateIntentPlan(input: IntentPlanInput): IntentPlan {
  const o = requireObject(input, '/input')
  requireOnlyKeys(o, PLAN_INPUT_KEYS, '/input')

  const scenario = requireNonEmptyString(o['scenario'], '/input/scenario')
  const seed = requireNonEmptyString(o['seed'], '/input/seed')
  const tenant =
    o['tenant'] === undefined ? '' : requireNonEmptyString(o['tenant'], '/input/tenant')
  const actors =
    o['actors'] === undefined ? [] : requireStringArray(o['actors'], '/input/actors')
  if (o['slot'] !== undefined) requireNonEmptyString(o['slot'], '/input/slot')
  const usages = normalizeCatalog(o['usages'], '/input/usages')

  // Contrôlé et DÉLIBÉRÉMENT non utilisé : T08.A2 (L223).
  const candidate: CandidateState = normalizeCandidateState(
    o['candidate_state'],
    '/input/candidate_state',
  )
  void candidate

  // Contrôlées et DÉLIBÉRÉMENT non utilisées : T08.A1 (L223). Les lire ici est
  // ce qui rend visible, au diff, qu'elles n'atteignent pas la suite du corps.
  for (const k of WORKER_KEYS) {
    if (o[k] !== undefined) requireNonNegativeInteger(o[k], `/input/${k}`)
  }

  // L'instant métier vient de l'horloge MÉTIER fournie (L88, L221). Toutes les
  // intentions d'un plan portent le même : le plan est une photographie de ce
  // que le scénario offre à cet instant, et non un échéancier — l'échéancier
  // est le fait de l'exécution.
  const at = readBusinessClock(o['clock'] as BusinessClock)

  const ordered = orderUsages(scenario, seed, usages)

  const intents: readonly Intent[] = ordered.map(({ usage, index }) =>
    Object.freeze({
      id: intentId(scenario, seed, usage, index),
      usage: usage.id,
      operation: usage.operation,
      actor: actorOf(usage, actors, scenario, seed),
      tenant: usage.tenant ?? tenant,
      at,
      usage_kind: usage.kind,
      requires: Object.freeze([...usage.requires]),
      produces: usage.produces,
    }),
  )

  return Object.freeze({
    scenario,
    seed,
    tenant,
    business_instant: at,
    intents: Object.freeze(intents),
  })
}
