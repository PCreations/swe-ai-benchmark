// ─────────────────────────────────────────────────────────────────────────────
// Horloge métier ISOLÉE (livrable de L221, cas T08.A5 et T08.A6).
//
// CE QUE « ISOLÉE » VEUT DIRE ICI, ET COMMENT C'EST RENDU MÉCANIQUE.
//
// (1) AUCUNE SOURCE DE TEMPS PARTAGÉE. Il n'existe dans ce module ni variable
//     de module mutable, ni registre, ni compteur global. L'instant courant
//     d'une horloge vit dans l'objet horloge lui-même et nulle part ailleurs.
//     Deux horloges ouvertes au même instant ne peuvent donc pas s'influencer :
//     il n'y a pas d'écriture qui les atteindrait toutes les deux. C'est
//     exactement l'énoncé de T08.A5 — « avancer le temps métier de A ne change
//     pas celui de B ».
//
// (2) AUCUNE LECTURE DE L'HORLOGE SYSTÈME. `Date.now()` n'apparaît pas dans ce
//     paquet, et `new Date(...)` n'y est appelé qu'avec un argument explicite
//     (`shapes.formatUtcIso`), jamais sans argument. L'instant métier ne vient
//     donc QUE de `start` puis des avances demandées. C'est ce qui permet de
//     contrôler la frontière des 24 h « sans attendre 24 heures physiques »
//     (L223, T08.A6) : franchir 25 heures de temps métier coûte une addition.
//
// (3) AVANCE IMMUABLE. `advanceBusinessClock` ne mute pas l'horloge reçue : il
//     en rend une nouvelle. Une mutation en place serait indistinguable d'une
//     horloge partagée si deux poignées désignaient un jour le même objet ;
//     l'immuabilité retire la question. La valeur RENDUE est celle qui porte le
//     temps avancé — l'ancienne poignée reste à son instant, ce qui est la
//     lecture correcte de « l'horloge A après l'avance de B ».
//
// SÉPARATION DES TROIS TEMPS (L225). Ce module ne connaît que le TEMPS MÉTIER.
// L'attente technique (un `await`, un timeout) et le temps de calcul (une durée
// mesurée) ne s'expriment pas ici et n'ont aucun moyen d'y entrer :
// `packages/workload/tsconfig.json` fixe `types: []`, si bien que `node:timers`
// et les types de `process` ne sont pas même nommables dans ce paquet.
// ─────────────────────────────────────────────────────────────────────────────
import { WorkloadRejection } from './errors.js'
import {
  formatUtcIso,
  requireNonNegativeInteger,
  requireObject,
  requireOnlyKeys,
  requireUtcIsoInstant,
} from './shapes.js'

/**
 * Ouverture d'une horloge métier. `start` est un instant UTC ISO 8601 (L80) :
 * les instants de F-RESERVATION (horloge initiale, horloges de période) sont
 * ceux que les campagnes y passent.
 */
export interface BusinessClockSetup {
  readonly start: string
}

/**
 * Une horloge métier. `start` conserve l'instant d'ouverture — il rend lisible,
 * dans la poignée elle-même, de combien le temps métier a avancé depuis
 * l'ouverture, sans qu'un appelant ait à tenir ce compte à côté.
 */
export interface BusinessClock {
  readonly start: string
  readonly instant: string
}

/** Un delta d'avance, exprimé en MILLISECONDES de temps MÉTIER (L119). */
export type BusinessClockDelta =
  | number
  | { readonly ms: number }
  | { readonly milliseconds: number }

const SETUP_KEYS = ['start'] as const

/**
 * Ouvre une horloge métier isolée à l'instant `start` (L221).
 *
 * Chaque appel rend une poignée NEUVE, gelée. Deux appels au même `start`
 * rendent donc deux objets distincts : il n'y a pas de cache d'horloges, et
 * `créerA === créerB` est faux par construction — la condition sans laquelle
 * l'isolation de T08.A5 ne serait qu'une intention.
 */
export function createBusinessClock(setup: BusinessClockSetup): BusinessClock {
  const o = requireObject(setup, '/setup')
  requireOnlyKeys(o, SETUP_KEYS, '/setup')
  const ms = requireUtcIsoInstant(o['start'], '/setup/start')
  const iso = formatUtcIso(ms)
  return Object.freeze({ start: iso, instant: iso })
}

/** Lit l'instant métier d'une horloge, sans refuser un objet gelé venu d'ailleurs. */
function instantOf(clock: unknown, path: string): number {
  const o = requireObject(clock, path)
  const instant = o['instant']
  if (instant === undefined) {
    throw new WorkloadRejection(
      'CLOCK_MALFORMED',
      `${path}/instant`,
      'une horloge métier porte son instant courant',
    )
  }
  return requireUtcIsoInstant(instant, `${path}/instant`)
}

/**
 * Rend l'instant métier courant de l'horloge, en UTC ISO 8601 (L80).
 *
 * La graphie est canonique (millisecondes explicites) : c'est la même fonction
 * qui date les intentions, si bien qu'un plan daté à la frontière et un plan
 * daté une milliseconde plus tard ne peuvent pas porter le même texte.
 */
export function readBusinessClock(clock: BusinessClock): string {
  return formatUtcIso(instantOf(clock, '/clock'))
}

/**
 * Normalise le delta. Trois graphies sont acceptées — le nombre nu, `{ ms }`,
 * `{ milliseconds }` — parce que l'unité, elle, est fixée par le cahier
 * (la milliseconde, L119) et qu'un refus fondé sur la GRAPHIE ferait dépendre
 * une propriété de temps d'une convention de nommage.
 */
function deltaMilliseconds(delta: BusinessClockDelta, path: string): number {
  if (typeof delta === 'object' && delta !== null) {
    const o = requireObject(delta, path)
    if ('ms' in o) return requireNonNegativeInteger(o['ms'], `${path}/ms`)
    if ('milliseconds' in o) {
      return requireNonNegativeInteger(o['milliseconds'], `${path}/milliseconds`)
    }
    throw new WorkloadRejection(
      'MISSING_PROPERTY',
      path,
      'un delta objet porte `ms` ou `milliseconds`',
    )
  }
  return requireNonNegativeInteger(delta, path)
}

/**
 * Avance l'horloge de `delta` millisecondes de temps MÉTIER et rend l'horloge
 * avancée (L221). L'horloge reçue n'est pas modifiée.
 */
export function advanceBusinessClock(
  clock: BusinessClock,
  delta: BusinessClockDelta,
): BusinessClock {
  const o = requireObject(clock, '/clock')
  const current = instantOf(o, '/clock')
  const start = o['start'] === undefined ? current : requireUtcIsoInstant(o['start'], '/clock/start')
  const ms = deltaMilliseconds(delta, '/delta')
  return Object.freeze({ start: formatUtcIso(start), instant: formatUtcIso(current + ms) })
}

/**
 * Durée de temps MÉTIER écoulée depuis l'ouverture, en millisecondes. Publiée
 * parce que L225 demande de séparer les trois temps : celle-ci est la seule des
 * trois que ce paquet sait produire, et la nommer évite qu'un appelant la
 * reconstruise en soustrayant une durée physique.
 */
export function elapsedBusinessMs(clock: BusinessClock): number {
  const o = requireObject(clock, '/clock')
  const current = instantOf(o, '/clock')
  const start = o['start'] === undefined ? current : requireUtcIsoInstant(o['start'], '/clock/start')
  return current - start
}
