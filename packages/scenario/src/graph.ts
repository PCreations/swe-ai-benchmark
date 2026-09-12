// ─────────────────────────────────────────────────────────────────────────────
// Le graphe de dépendances des événements (T06, cas A5 de L207 : « une
// dépendance cyclique ou vers un événement inexistant est rejetée »).
//
// TROIS DÉFAUTS DISTINCTS, TROIS PARCOURS DISTINCTS. Un compilateur peut
// parfaitement détecter un cycle et laisser passer une référence pendante, ou
// l'inverse : ce sont deux propriétés indépendantes du même graphe, et
// verification/mutants/T06.json les traite comme telles (M6, M7).
//
//   1. RÉFÉRENCE PENDANTE — `depends_on` nomme un `event_id` qu'aucune période
//      ne porte. Refus `MISSING_DEPENDENCY`, qui NOMME l'identifiant absent :
//      un refus muet ne dit pas ce qu'il a vu, et n'aide personne à réparer la
//      source.
//
//   2. DÉPENDANCE VERS L'AVENIR — un événement de la période k dépend d'un
//      événement de k+1. Ce n'est pas un cycle, et pourtant c'est la même
//      faute : la révélation de k devrait alors joindre un antécédent que D-2
//      (L63) interdit d'y faire figurer. Refus `FORWARD_DEPENDENCY`.
//
//   3. CYCLE — y compris la forme dégénérée d'un seul arc, un événement qui se
//      dépend de lui-même. Refus `CYCLIC_DEPENDENCY`, qui ÉNUMÈRE les
//      événements du cycle dans l'ordre où on les parcourt.
//
// POURQUOI L'ÉPLUCHAGE PUIS UNE MARCHE, ET NON UN SIMPLE DRAPEAU. Un tri
// topologique (Kahn) dit qu'un cycle EXISTE ; il ne dit pas LEQUEL. L'ensemble
// non épluché contient le cycle mais aussi tout ce qui en descend, si bien que
// l'énumérer tel quel nommerait des innocents. La marche qui suit part du
// premier non épluché dans l'ordre de la source et suit ses dépendances non
// épluchées jusqu'au premier sommet déjà visité : le segment ainsi refermé EST
// un cycle, et rien d'autre.
// ─────────────────────────────────────────────────────────────────────────────
import { ScenarioRejection, childPath } from './errors.js'
import type { ScenarioSource } from './source.js'

/** Un événement situé : son identifiant, sa période de révélation, son chemin. */
export interface PlacedEvent {
  readonly event_id: string
  readonly revealed_at_period: number
  readonly depends_on: readonly string[]
  readonly path: string
}

/**
 * Vérifie les trois propriétés du graphe. Ne rend rien : sa valeur est le refus
 * qu'elle lève, ou le silence qui autorise la compilation à continuer.
 */
export function checkEventGraph(source: ScenarioSource, placed: readonly PlacedEvent[]): void {
  const periodOf = new Map<string, number>()
  for (const e of placed) periodOf.set(e.event_id, e.revealed_at_period)

  // 1 & 2 — chaque arête est résolue, et aucune ne remonte le temps.
  for (const e of placed) {
    e.depends_on.forEach((d, i) => {
      const arete = childPath(childPath(e.path, 'depends_on'), i)
      const cible = periodOf.get(d)
      if (cible === undefined) {
        throw new ScenarioRejection(
          'MISSING_DEPENDENCY',
          arete,
          `l evenement "${d}" n existe dans aucune periode du scenario ${source.scenario_id}`,
        )
      }
      if (cible > e.revealed_at_period) {
        throw new ScenarioRejection(
          'FORWARD_DEPENDENCY',
          arete,
          `"${e.event_id}" (periode ${String(e.revealed_at_period)}) depend de "${d}", revele plus tard`,
        )
      }
    })
  }

  // 3 — épluchage topologique. Un sommet tombe quand toutes ses dépendances
  //     sont déjà tombées ; ce qui reste ne peut atteindre aucune fin.
  const resolu = new Set<string>()
  let progresse = true
  while (progresse) {
    progresse = false
    for (const e of placed) {
      if (resolu.has(e.event_id)) continue
      if (e.depends_on.every((d) => resolu.has(d))) {
        resolu.add(e.event_id)
        progresse = true
      }
    }
  }
  const bloques = placed.filter((e) => !resolu.has(e.event_id))
  if (bloques.length === 0) return

  // La marche qui referme un cycle concret parmi les sommets bloqués.
  const bloqueParId = new Map<string, PlacedEvent>()
  for (const e of bloques) bloqueParId.set(e.event_id, e)
  const depart = bloques[0]
  if (depart === undefined) return
  const chemin: string[] = []
  const rang = new Map<string, number>()
  let courant: PlacedEvent | undefined = depart
  while (courant !== undefined) {
    const deja = rang.get(courant.event_id)
    if (deja !== undefined) {
      const cycle = [...chemin.slice(deja), courant.event_id]
      throw new ScenarioRejection(
        'CYCLIC_DEPENDENCY',
        courant.path,
        `dependance cyclique : ${cycle.join(' -> ')}`,
      )
    }
    rang.set(courant.event_id, chemin.length)
    chemin.push(courant.event_id)
    const suivantId: string | undefined = courant.depends_on.find((d) => bloqueParId.has(d))
    courant = suivantId === undefined ? undefined : bloqueParId.get(suivantId)
  }

  // Inatteignable si l'épluchage est correct : un sommet bloqué a toujours au
  // moins une dépendance bloquée. Le refus reste fail-closed plutôt que muet.
  throw new ScenarioRejection(
    'CYCLIC_DEPENDENCY',
    depart.path,
    `dependances non resolubles : ${bloques.map((e) => e.event_id).join(', ')}`,
  )
}
