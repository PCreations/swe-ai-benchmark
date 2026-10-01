// ─────────────────────────────────────────────────────────────────────────────
// @bench/evaluation — incidents et backlog (cahier L345-L352, tâche T22).
//
// Les quatre rôles ci-dessous sont NOMMÉS par la section III de l'en-tête de
// `acceptance/T22.spec.ts` — le cahier ne fixe aucun nom d'export pour T22,
// exactement comme pour `admitDelivery` (T21) ou `EvaluationResult` (T20).
//
//   ingestObservations(input)             déduplication par signature,
//                                         compteur d'occurrences, ticket de
//                                         révélation à la période N+1, sans
//                                         jamais recopier la solution cachée
//                                         (A1, A2, A3).
//   classifyDefectOrigin(input)           distingue une panne extérieure
//                                         prévue d'un défaut du candidat (A4).
//   applyCriticalViolationPolicy(input)   politique figée sur violation
//                                         critique : mise hors service,
//                                         dégradation du service mesuré (A5).
//   sortBacklog(items)                    tri priorité, échéance puis
//                                         identifiant, indépendant de l'ordre
//                                         d'entrée (A6).
//
// QUATRE FONCTIONS PURES (packages/domain : « métriques pures » ; §C : « le
// coeur métier ne dépend ni de Temporal, ni de Docker [...] »). Aucun état
// mutable module-scope : `ingestObservations` enchaîne EXPLICITEMENT l'état
// reçu en argument (`prior_incidents`) plutôt que de le garder en mémoire —
// c'est ce qui permet à la suite de rejouer un enchaînement à travers deux
// appels indépendants (A1) et constitue la garantie de D1 (« aucun retour
// automatique à une base idéale » : ici, aucune base du tout).
//
// IDENTIFIANTS. `Incident.id` et `Incident.ticket.id` sont dérivés par
// `canonicalDigest` (§E, cahier L82 : SHA-256 sur octets canoniques) à partir
// de la seule `signature` — jamais d'horloge ni de compteur global, pour que
// deux enchaînements indépendants sur la même signature produisent le même
// identifiant (déterminisme inter-process, pas seulement intra-process).
// ─────────────────────────────────────────────────────────────────────────────

import { canonicalDigest } from '@bench/contracts'

/* ══════════════════════ formes du contrat (section III de la suite) ═══════ */

/** Une observation entrante, section III.1 de `acceptance/T22.spec.ts`. */
export interface IncidentObservation {
  readonly signature: string
  readonly origin: string
  readonly hidden_test_expectation?: {
    readonly root_cause: string
    readonly expected_fix: string
  }
}

/** Entrée de `ingestObservations`, section III.1. */
export interface IngestObservationsInput {
  readonly period_index: number
  readonly prior_incidents: readonly Incident[]
  readonly observations: readonly IncidentObservation[]
}

/** Ticket de révélation d'un incident, section III.1. */
export interface IncidentTicket {
  readonly id: string
  readonly revealed_at_period: number
}

/** Un incident, élément de `prior_incidents` ET de `IngestResult.incidents`. */
export interface Incident {
  readonly id: string
  readonly signature: string
  readonly occurrences: number
  readonly ticket: IncidentTicket
}

/** Sortie de `ingestObservations`, section III.1. */
export interface IngestResult {
  readonly incidents: readonly Incident[]
}

/** Entrée de `classifyDefectOrigin`, section III.2. */
export interface ClassifyDefectOriginInput {
  readonly unavailable: boolean
  readonly external_outage_window: boolean
}

/** Entrée de `applyCriticalViolationPolicy`, section III.3. */
export interface ApplyCriticalViolationPolicyInput {
  readonly critical_violation: boolean
  readonly measured_service_before: number
}

/** Sortie de `applyCriticalViolationPolicy`, section III.3. */
export interface PolicyResult {
  readonly service_suspended: boolean
  readonly measured_service_after: number
}

/** Un élément du backlog à trier, section III.4. */
export interface BacklogItem {
  readonly id: string
  readonly priority: number
  readonly due_date: string
}

/* ══════════════════════════════════ rôles ══════════════════════════════════ */

/** `Incident.id` : dérivé de la signature seule, stable d'un appel à l'autre. */
function incidentIdFor(signature: string): string {
  return `inc_${canonicalDigest(signature).slice(0, 24)}`
}

/** `IncidentTicket.id` : dérivé de la signature, distinct de `incidentIdFor`
 * (préfixe différent) pour qu'un consommateur ne confonde pas les deux. */
function ticketIdFor(signature: string): string {
  return `tkt_${canonicalDigest(`ticket:${signature}`).slice(0, 24)}`
}

/**
 * Déduplication par signature, comptage, ticket de révélation (A1, A2, A3).
 *
 * `prior_incidents` est l'état reçu — jamais relu ailleurs — et devient la
 * base sur laquelle `observations` s'applique : une signature déjà connue
 * incrémente `occurrences` sans toucher à son `ticket` (D1, et cahier:L349
 * « ticket apparaît à la période suivante PRÉVUE », fixé à la PREMIÈRE
 * observation — A1 vérifie que la réapparition à P2 ne décale pas
 * `revealed_at_period`) ; une signature inédite crée un incident dont le
 * ticket se révèle à `period_index + 1`. `hidden_test_expectation` n'est lu
 * nulle part ici : il n'existe dans le type d'entrée que pour que A3 puisse
 * vérifier son absence de la sortie (cahier:D2, L64).
 */
export function ingestObservations(input: IngestObservationsInput): IngestResult {
  const bySignature = new Map<string, Incident>()
  for (const incident of input.prior_incidents) {
    bySignature.set(incident.signature, incident)
  }

  for (const observation of input.observations) {
    const existing = bySignature.get(observation.signature)
    if (existing !== undefined) {
      bySignature.set(observation.signature, {
        ...existing,
        occurrences: existing.occurrences + 1,
      })
      continue
    }
    bySignature.set(observation.signature, {
      id: incidentIdFor(observation.signature),
      signature: observation.signature,
      occurrences: 1,
      ticket: {
        id: ticketIdFor(observation.signature),
        revealed_at_period: input.period_index + 1,
      },
    })
  }

  return { incidents: Array.from(bySignature.values()) }
}

/**
 * Classification de l'origine d'un défaut observé (A4).
 *
 * Fonction PURE et STABLE : la même entrée redonne toujours la même
 * étiquette. Aucune indisponibilité ne produit aucune étiquette de défaut
 * (`NO_DEFECT_OBSERVED`) ; une indisponibilité qui tombe dans une fenêtre de
 * panne externe PRÉVUE (injectée par le workload, T08) est distinguée d'un
 * défaut imputable au candidat — cahier:L349, « panne extérieure prévue est
 * distinguée d'un défaut du candidat ». Les noms exacts sont une convention
 * de ce paquet : le cahier ne fixe aucun nom d'enum pour l'origine (à la
 * différence de `deployment_coverage`, fixé par T21) ; seule la distinction
 * des deux étiquettes est un engagement de contrat.
 */
export function classifyDefectOrigin(input: ClassifyDefectOriginInput): string {
  if (!input.unavailable) return 'NO_DEFECT_OBSERVED'
  return input.external_outage_window ? 'EXTERNAL_FAILURE' : 'CANDIDATE_DEFECT'
}

/**
 * Politique figée sur violation critique (A5).
 *
 * Sans violation : aucun effet, ni sur `service_suspended` ni sur la valeur
 * mesurée (contrôle de A5). Avec violation : mise hors service jusqu'à
 * correction (cahier:L349, « par exemple ») et dégradation STRICTE du
 * service mesuré — ramené à 0, la valeur d'un service effectivement
 * suspendu, plutôt qu'une fraction non énoncée par le cahier (cf. en-tête de
 * la suite, §V(4) : le cahier ne fixe aucune valeur cible, seulement une
 * dégradation stricte par rapport à l'avant).
 */
export function applyCriticalViolationPolicy(
  input: ApplyCriticalViolationPolicyInput,
): PolicyResult {
  if (!input.critical_violation) {
    return { service_suspended: false, measured_service_after: input.measured_service_before }
  }
  return { service_suspended: true, measured_service_after: 0 }
}

/**
 * Tri du backlog par priorité (croissante — la plus PETITE valeur est la plus
 * URGENTE, convention fixée par la suite faute de convention du cahier), puis
 * échéance croissante, puis identifiant lexicographique (cahier:L349,
 * « priorité, échéance puis identifiant »). Comparateur total et stable : le
 * résultat ne dépend jamais de l'ordre d'entrée, `items` n'est pas muté.
 */
export function sortBacklog(items: readonly BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
    if (a.id !== b.id) return a.id < b.id ? -1 : 1
    return 0
  })
}
