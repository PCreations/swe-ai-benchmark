// ─────────────────────────────────────────────────────────────────────────────
// La projection métier canonique (L213), servie SOUS UNE VUE.
//
// « Évaluer l'état métier exporté, pas un nom de table imposé » (§F, L119). La
// projection est donc le SEUL contrat observable de ce paquet : la forme de
// l'état interne ne regarde personne, celle-ci regarde tout le monde.
//
// CANONIQUE VEUT DIRE ORDONNÉE. Les réservations sortent triées par créneau,
// puis par rang d'admission, puis par identifiant. Deux rejeux du même journal
// rendent donc des octets identiques, ce qui est ce qui permet de comparer deux
// projections par empreinte plutôt qu'à l'œil.
//
// ─────────────────────────────────────────────────── la vue, et ce qu'elle est
// La vue porte le locataire, et éventuellement l'acteur qui interroge. Le
// locataire est DÉCISIF : §F P4 dit « les acteurs de `other` ne peuvent ni lire
// ni modifier les réservations `legacy` », et L123 fixe le verdict — `NOT_FOUND`
// sans donnée métier divulguée. Une implémentation qui ignorerait ce second
// argument servirait les réservations `legacy` à un acteur de `other`.
//
// L'ACTEUR N'EST PAS UN FILTRE. À l'intérieur de son propre locataire, un
// acteur voit l'état métier du créneau — sans quoi « C reste premier en
// attente » (§F P2) ne serait observable par personne, et la file cesserait
// d'être un objet métier pour devenir un secret par participant. L'acteur sert
// à vérifier l'appartenance au locataire, rien de plus.
//
// UN REFUS NE PORTE AUCUNE DONNÉE. Le `NOT_FOUND` levé ici ne cite ni instant
// métier, ni identifiant de réservation, ni même le locataire propriétaire : un
// refus bavard apprendrait par son message ce que le refus prétend cacher.
// ─────────────────────────────────────────────────────────────────────────────
import { ReservationRejection } from './errors.js'
import type { ReservationView } from './contract.js'
import { validateView } from './contract.js'
import type { ReservationOracleState, ReservationRecord } from './machine.js'

/** Un créneau vu du métier : sa capacité, et les trois comptes qui s'y rapportent. */
export interface ProjectedSlot {
  readonly id: string
  readonly capacity: number
  readonly start: string
  readonly confirmed_count: number
  readonly waiting_count: number
  readonly cancelled_count: number
}

/** La projection métier canonique. */
export interface BusinessProjection {
  readonly tenant: string
  readonly slots: readonly ProjectedSlot[]
  readonly reservations: readonly ReservationRecord[]
}

function compareRecords(a: ReservationRecord, b: ReservationRecord): number {
  if (a.slot !== b.slot) return a.slot < b.slot ? -1 : 1
  if (a.rank !== b.rank) return a.rank - b.rank
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Projection métier canonique de l'état, servie sous la vue donnée (L213, L119).
 *
 * @throws ReservationRejection `NOT_FOUND` si la vue ne relève pas du locataire
 *         de cet oracle — sans divulguer quoi que ce soit de son contenu.
 */
export function projectBusinessState(
  state: ReservationOracleState,
  view: ReservationView,
): BusinessProjection {
  const v = validateView(view as unknown)

  if (v.tenant !== state.tenant) {
    throw new ReservationRejection('NOT_FOUND', '/view/tenant', 'aucune donnée sous cette vue')
  }
  if (v.actor !== undefined && !state.actors.includes(v.actor)) {
    throw new ReservationRejection('NOT_FOUND', '/view/actor', 'aucune donnée sous cette vue')
  }

  const reservations = [...state.reservations].sort(compareRecords)

  const slots = state.slots.map((s) => {
    const mine = reservations.filter((r) => r.slot === s.id)
    return {
      id: s.id,
      capacity: s.capacity,
      start: s.start,
      confirmed_count: mine.filter((r) => r.status === 'confirmed').length,
      waiting_count: mine.filter((r) => r.status === 'waiting').length,
      cancelled_count: mine.filter((r) => r.status === 'cancelled').length,
    }
  })

  return { tenant: state.tenant, slots, reservations }
}
