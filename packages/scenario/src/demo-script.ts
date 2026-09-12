// ─────────────────────────────────────────────────────────────────────────────
// LE SCRIPT DU PILOTE DE T11 — les ENTRÉES connues de la trajectoire verticale.
//
// L249 : « Le pilote fournit des observations connues ; il n'a pas le droit de
// lire les valeurs finales attendues du test. » Ce fichier porte exactement la
// première moitié de cette phrase, et rien de la seconde :
//
//   • il déclare les ENTRÉES du scénario — horloges métier, acteurs, créneau,
//     exigences et leurs remplacements, catalogue d'usages, opérations métier
//     soumises à l'application, et le journal de dépenses FICTIVES de l'agent
//     scripté (mode `recorded`, L21) ;
//   • il ne déclare AUCUN résultat : ni Q, ni R, ni G, ni statut de contrôle, ni
//     état final de réservation. Tout cela est CALCULÉ par le pilote à partir de
//     ces entrées, et c'est ce qui rend les mutants de
//     verification/mutants/T11.json capables de le faire mentir.
//
// CE PAQUET NE SAIT PAS LIRE UN FICHIER. `packages/scenario/tsconfig.json` fixe
// `types: []` : ni `node:fs`, ni `node:child_process` ne sont nommables ici.
// L'interdiction de L249 (« il n'a pas le droit de lire les valeurs finales
// attendues ») est donc mécanique et non déclarative — `acceptance/reference/**`
// est hors d'atteinte de ce code, quel que soit le zèle de qui l'écrit.
//
// D'OÙ VIENNENT LES VALEURS CI-DESSOUS. Du CAHIER, et de lui seul :
//
//   L119  horloge initiale, acteurs A/B/C, locataire `legacy`, créneau S1 de
//         capacité 1 débutant le 3 janvier 2030 à 12:00 UTC, règle d'annulation
//         « au moins 24 heures avant le début, frontière incluse », migration
//         P4 et création du locataire `other`
//   L123  la séquence d'admission explicite (et non l'égalité des timestamps),
//         les probes de frontière P3 jetables, le verdict intertenant
//   L125  les quatre horloges métier des périodes
//   L129  `cancel@1` satisfaite en P2 puis REMPLACÉE en P3 par `cancel@2` ;
//         `isolation@1` satisfaite en P3 puis violée en P4
//   L121  le journal de dépenses de la variante `F-FAILURE` : [100, 50, 0, 0],
//         « un arrêt de calcul après P2 ne supprime pas P3 et P4 ; aucune
//         facture imaginaire n'y est ajoutée »
//   L21   mode `recorded` : « agent scripté, réponses et COÛTS FICTIFS ARCHIVÉS »
//
// Les dépenses de la trajectoire nominale ne sont fixées par AUCUNE ligne du
// cahier : elles sont un journal fictif archivé, et le résultat le dit par son
// `cost_origin` plutôt que de le laisser deviner.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReservationOracleSetup } from '@bench/oracle'
import type { UsageTemplate } from '@bench/workload'

/** Les trois trajectoires que le pilote sait jouer. */
export const DEMO_VARIANTS = ['nominal', 'F-FAILURE', 'cross-tenant-read'] as const
export type DemoVariant = (typeof DEMO_VARIANTS)[number]

/** Le scénario joué : celui du §F, `F-RESERVATION`. */
export const DEMO_SCENARIO_ID = 'SCN-F-RESERVATION'

/** Le locataire d'origine (L119) et celui que P4 crée (L119). */
export const TENANT_ORIGIN = 'legacy'
export const TENANT_OTHER = 'other'

/** Le créneau du scénario (L119). */
export const SLOT_ID = 'S1'

/**
 * La configuration de l'oracle métier — entrée de `createReservationOracle`.
 * Les 24 heures et l'inclusion de la frontière sont des PARAMÈTRES et non des
 * constantes de code : c'est ce qui permet à `frontiere-24h` de contrôler la
 * règle plutôt que de la réécrire.
 */
export const RESERVATION_SETUP: ReservationOracleSetup = {
  clock: '2030-01-01T00:00:00Z', // cahier:L119
  tenant: TENANT_ORIGIN, // cahier:L119
  actors: ['A', 'B', 'C'], // cahier:L119
  slots: [{ id: SLOT_ID, capacity: 1, start: '2030-01-03T12:00:00Z' }], // cahier:L119
  cancellation_notice_hours: 24, // cahier:L119
  cancellation_boundary_inclusive: true, // cahier:L119
}

/**
 * Les deux instants des probes de frontière de P3 (L119). Ce sont des ENTRÉES —
 * ce que le contrôle `frontiere-24h` soumet à des clones jetables — et non des
 * verdicts : le verdict est ce que l'application répond.
 */
export const BOUNDARY_PROBE_EXACT = '2030-01-02T12:00:00Z' // cahier:L119
export const BOUNDARY_PROBE_AFTER = '2030-01-02T12:00:00.001Z' // cahier:L119

/* ───────────────────────────────────────── la source de scénario compilée */

/**
 * La source que `compileScenarioPack` (T06) compile. Elle porte le
 * VERSIONNEMENT des exigences — `cancel@2` remplace `cancel@1` en P3 — et c'est
 * le compilateur, pas ce fichier, qui en déduit le jeu actif de chaque période.
 */
export const DEMO_SCENARIO_SOURCE = {
  schema: 'bench.scenario.source/1',
  scenario_id: DEMO_SCENARIO_ID,
  corpus_provenance: 'synthetic',
  business_domain: 'reservation',
  period_count: 4,
  periods: [
    {
      period_index: 1,
      business_clock: '2030-01-01T00:00:00Z', // cahier:L125
      sentinel: 'SENT-P1',
      events: [
        {
          event_id: 'EV-P1-ouverture',
          depends_on: [],
          sentinel: 'SENT-EV-P1',
          payload: { slot: SLOT_ID, tenant: TENANT_ORIGIN, capacity: 1 },
        },
      ],
      requirements: [
        {
          requirement_id: 'reserve',
          version: 1,
          key: 'reserve@1',
          capability_id: 'reservation.create',
          weight: 1,
          due_at_period: 1,
          replaces: null,
          criticality: 'BLOCKER',
          source: 'cahier:L119',
          sentinel: 'SENT-REQ-reserve-1',
        },
        {
          requirement_id: 'idempotence',
          version: 1,
          key: 'idempotence@1',
          capability_id: 'reservation.idempotency',
          weight: 1,
          due_at_period: 1,
          replaces: null,
          criticality: 'MAJOR',
          source: 'cahier:L119',
          sentinel: 'SENT-REQ-idempotence-1',
        },
      ],
      requirement_withdrawals: [],
      customer_answers: [],
    },
    {
      period_index: 2,
      business_clock: '2030-01-01T01:00:00Z', // cahier:L125
      sentinel: 'SENT-P2',
      events: [
        {
          event_id: 'EV-P2-file',
          depends_on: ['EV-P1-ouverture'],
          sentinel: 'SENT-EV-P2',
          payload: { queue: true },
        },
      ],
      requirements: [
        {
          requirement_id: 'cancel',
          version: 1,
          key: 'cancel@1',
          capability_id: 'reservation.cancel',
          weight: 1,
          due_at_period: 2,
          replaces: null,
          criticality: 'MAJOR',
          source: 'cahier:L129',
          sentinel: 'SENT-REQ-cancel-1',
        },
        {
          requirement_id: 'fifo',
          version: 1,
          key: 'fifo@1',
          capability_id: 'reservation.queue',
          weight: 1,
          due_at_period: 2,
          replaces: null,
          criticality: 'MAJOR',
          source: 'cahier:L123',
          sentinel: 'SENT-REQ-fifo-1',
        },
      ],
      requirement_withdrawals: [],
      customer_answers: [],
    },
    {
      period_index: 3,
      business_clock: '2030-01-02T11:00:00Z', // cahier:L125
      sentinel: 'SENT-P3',
      events: [
        {
          event_id: 'EV-P3-preavis',
          depends_on: ['EV-P2-file'],
          sentinel: 'SENT-EV-P3',
          payload: { notice_hours: 24, boundary_inclusive: true },
        },
      ],
      requirements: [
        {
          requirement_id: 'cancel',
          version: 2,
          key: 'cancel@2',
          capability_id: 'reservation.cancel',
          weight: 1,
          due_at_period: 3,
          // Le REMPLACEMENT de L86 : c'est ce champ, et lui seul, qui retire
          // `cancel@1` du jeu actif de P3 (T06, `compileScenarioPack`).
          replaces: 'cancel@1', // cahier:L129
          criticality: 'MAJOR',
          source: 'cahier:L119',
          sentinel: 'SENT-REQ-cancel-2',
        },
        {
          requirement_id: 'isolation',
          version: 1,
          key: 'isolation@1',
          capability_id: 'tenant.isolation',
          weight: 1,
          due_at_period: 3,
          replaces: null,
          criticality: 'BLOCKER',
          source: 'cahier:L123',
          sentinel: 'SENT-REQ-isolation-1',
        },
      ],
      requirement_withdrawals: [],
      customer_answers: [],
    },
    {
      period_index: 4,
      business_clock: '2030-01-02T13:00:00Z', // cahier:L125
      sentinel: 'SENT-P4',
      events: [
        {
          event_id: 'EV-P4-migration',
          depends_on: ['EV-P3-preavis'],
          sentinel: 'SENT-EV-P4',
          payload: { migrated_to: TENANT_ORIGIN, created_tenant: TENANT_OTHER },
        },
      ],
      // P4 n'introduit aucune exigence : elle exerce celles de P3 sur un
      // deuxième locataire (L119).
      requirements: [],
      requirement_withdrawals: [],
      customer_answers: [],
    },
  ],
}

/* ───────────────────────────────── ce que le monde extérieur demande */

/** Une écriture métier soumise à l'application candidate. */
export interface ScriptedWrite {
  readonly kind: 'write'
  readonly operation: 'reserve' | 'cancel'
  readonly actor: string
  readonly tenant: string
  /** La SÉQUENCE D'ADMISSION EXPLICITE de L123, jamais un timestamp. */
  readonly sequence: number
  /** La clé d'opération de D-6 (L68). */
  readonly idempotency_key: string
}

/** Une lecture métier soumise à l'application candidate. */
export interface ScriptedRead {
  readonly kind: 'read'
  readonly actor: string
  readonly tenant: string
}

export type ScriptedAction = ScriptedWrite | ScriptedRead

/** Une période scriptée : son catalogue d'usages et l'action de chaque usage. */
export interface ScriptedPeriod {
  readonly period_index: number
  readonly usages: readonly UsageTemplate[]
  readonly actions: Readonly<Record<string, ScriptedAction>>
}

/**
 * LA NATURE D'USAGE `tenant_isolation` EST UN ESSAI NÉGATIF. `isComplianceKind`
 * (T08) la reconnaît comme telle : son refus alimente conformité/criticité et
 * n'entre PAS dans le dénominateur de R (L223). Un candidat qui isole
 * correctement ses locataires ne doit pas voir son taux de réussite métier
 * baisser pour cette raison.
 */
const KIND_BUSINESS = 'business'
const KIND_COMPLIANCE = 'tenant_isolation'

/**
 * POURQUOI `demande-B` ET `replay-A` DÉPENDENT DE `res-A`.
 *
 * L'ordre du plan est topologique puis seedé (T08). Les deux dépendances
 * ci-dessous ne sont pas un artifice d'ordonnancement : ce sont des
 * dépendances MÉTIER. Le rejeu de la clé idempotente de A (L119) porte sur la
 * réservation de A ; et la « demande concurrente de B » (L119) n'est concurrente
 * que d'une réservation déjà détenue — sans elle, il n'y a pas de créneau plein,
 * donc rien à refuser sans surbooking.
 *
 * En P2 au contraire, `demande-C` et `annulation-A` sont LIBRES l'une de
 * l'autre, et c'est délibéré : la file étant ordonnée par la séquence
 * d'admission explicite (L123) et non par l'instant d'arrivée, les deux ordres
 * possibles donnent le même état métier — B confirmé, C premier en attente.
 * Laisser la graine trancher est donc la façon la moins coûteuse de rendre cet
 * invariant observable à chaque exécution.
 */
export const SCRIPTED_PERIODS: readonly ScriptedPeriod[] = [
  {
    period_index: 1,
    usages: [
      {
        id: 'reserve-A',
        operation: 'reserve',
        requires: [],
        produces: 'res-A',
        kind: KIND_BUSINESS,
        tenant: TENANT_ORIGIN,
        actor: 'A',
      },
      {
        id: 'replay-A',
        operation: 'reserve-replay',
        requires: ['res-A'],
        produces: null,
        kind: KIND_BUSINESS,
        tenant: TENANT_ORIGIN,
        actor: 'A',
      },
      {
        id: 'demande-B',
        operation: 'reserve',
        requires: ['res-A'],
        produces: null,
        kind: KIND_BUSINESS,
        tenant: TENANT_ORIGIN,
        actor: 'B',
      },
    ],
    actions: {
      'reserve-A': {
        kind: 'write',
        operation: 'reserve',
        actor: 'A',
        tenant: TENANT_ORIGIN,
        sequence: 1,
        idempotency_key: 'IDK-A-RESERVE',
      },
      // MÊME clé, MÊMES arguments : D-6 veut que le rejeu aboutisse sans
      // produire d'effet nouveau (L68).
      'replay-A': {
        kind: 'write',
        operation: 'reserve',
        actor: 'A',
        tenant: TENANT_ORIGIN,
        sequence: 1,
        idempotency_key: 'IDK-A-RESERVE',
      },
      'demande-B': {
        kind: 'write',
        operation: 'reserve',
        actor: 'B',
        tenant: TENANT_ORIGIN,
        sequence: 2,
        idempotency_key: 'IDK-B-RESERVE',
      },
    },
  },
  {
    period_index: 2,
    usages: [
      {
        id: 'demande-C',
        operation: 'reserve',
        requires: [],
        produces: null,
        kind: KIND_BUSINESS,
        tenant: TENANT_ORIGIN,
        actor: 'C',
      },
      {
        id: 'annulation-A',
        operation: 'cancel',
        requires: [],
        produces: null,
        kind: KIND_BUSINESS,
        tenant: TENANT_ORIGIN,
        actor: 'A',
      },
    ],
    actions: {
      'demande-C': {
        kind: 'write',
        operation: 'reserve',
        actor: 'C',
        tenant: TENANT_ORIGIN,
        sequence: 3,
        idempotency_key: 'IDK-C-RESERVE',
      },
      'annulation-A': {
        kind: 'write',
        operation: 'cancel',
        actor: 'A',
        tenant: TENANT_ORIGIN,
        sequence: 4,
        idempotency_key: 'IDK-A-CANCEL',
      },
    },
  },
  {
    period_index: 3,
    usages: [
      {
        id: 'lecture-file',
        operation: 'read',
        requires: [],
        produces: null,
        kind: KIND_BUSINESS,
        tenant: TENANT_ORIGIN,
        actor: 'B',
      },
    ],
    actions: {
      'lecture-file': { kind: 'read', actor: 'B', tenant: TENANT_ORIGIN },
    },
  },
  {
    period_index: 4,
    usages: [
      {
        id: 'lecture-legacy',
        operation: 'read',
        requires: [],
        produces: null,
        kind: KIND_BUSINESS,
        tenant: TENANT_ORIGIN,
        actor: 'C',
      },
      {
        id: 'sonde-intertenant',
        operation: 'read',
        requires: [],
        produces: null,
        kind: KIND_COMPLIANCE,
        tenant: TENANT_OTHER,
        actor: 'Z',
      },
    ],
    actions: {
      'lecture-legacy': { kind: 'read', actor: 'C', tenant: TENANT_ORIGIN },
      'sonde-intertenant': { kind: 'read', actor: 'Z', tenant: TENANT_OTHER },
    },
  },
]

/* ─────────────────────────────────── le journal de dépenses de l'agent */

/**
 * Les dépenses ARCHIVÉES de l'agent scripté, en unités entières (L80 : « des
 * chaînes d'entiers non négatifs »).
 *
 * `F-FAILURE` transcrit littéralement L121 : `[100, 50, 0, 0]`. Les deux zéros
 * finaux ne sont pas décoratifs — ils sont l'énoncé « un arrêt de calcul après
 * P2 ne supprime pas P3 et P4 ; AUCUNE FACTURE IMAGINAIRE n'y est ajoutée ».
 *
 * Le journal nominal n'est fixé par aucune ligne du cahier : c'est un journal
 * FICTIF, et le résultat le déclare par son `cost_origin`. L'unité de ces
 * montants est délibérément absente : §F ne l'énonce pas (SC-001, DIV-1), et
 * l'inventer ferait passer une décision pour une transcription.
 */
export const SCRIPTED_SPEND: Readonly<Record<DemoVariant, readonly string[]>> = {
  nominal: ['100', '80', '60', '40'],
  'cross-tenant-read': ['100', '80', '60', '40'],
  'F-FAILURE': ['100', '50', '0', '0'], // cahier:L121
}

/**
 * La variante `F-FAILURE` porte un ARRÊT DE CALCUL après P2 (L121). L'état
 * d'arrêt lui-même — `BUDGET_EXHAUSTED`, `RUNNER_BLOCKED` ou `CANCELLED` — n'est
 * énoncé nulle part pour cette fixture : il reste `null`, et le champ existe
 * pour que cette absence soit LUE plutôt que comblée.
 */
export const SCRIPTED_HALT: Readonly<
  Record<DemoVariant, { readonly after_period_index: number; readonly state: string | null } | null>
> = {
  nominal: null,
  'cross-tenant-read': null,
  'F-FAILURE': { after_period_index: 2, state: null }, // cahier:L121
}

/**
 * Le candidat de `F-FAILURE` est « sans déploiement sur les quatre périodes »
 * (L121) : son application n'est jamais déployée, et rien de ce que le monde
 * lui soumet n'aboutit.
 */
export const DEPLOYED_BY_VARIANT: Readonly<Record<DemoVariant, boolean>> = {
  nominal: true,
  'cross-tenant-read': true,
  'F-FAILURE': false, // cahier:L121
}
