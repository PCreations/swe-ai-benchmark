// ─────────────────────────────────────────────────────────────────────────────
// LES CONTRÔLES MÉTIER NOMMÉS de la trajectoire T11.
//
// « Chacun détecté par son contrôle NOMMÉ » (T10, L241). Un contrôle porte donc
// ici trois choses, et jamais un simple booléen :
//
//   `id`        le NOM sous lequel il est publié et sous lequel un échec se
//               lit dans un rapport ;
//   `expected`  ce que le MODÈLE INDÉPENDANT (`@bench/oracle`, T07) impose ;
//   `observed`  ce que l'APPLICATION CANDIDATE a réellement répondu.
//
// LE STATUT EST LA COMPARAISON DES DEUX, jamais une valeur écrite à la main.
// C'est ce qui rend les deux mutants de A6 discriminants :
//   • T11.M11 rend le contrôle d'isolation PERMISSIF — il conclurait PASS alors
//     que l'observation diffère de l'attente ;
//   • T11.M12 rend TOUS les contrôles refusants — la trajectoire conforme ne
//     publierait plus aucun contrôle vert, ce que A6 exige explicitement.
// Aucune des deux ne peut se produire tant que le statut EST la comparaison.
//
// CHAQUE CONTRÔLE JUGE UNE EXIGENCE, ET UNE SEULE. La table
// `CONTROL_BY_REQUIREMENT` est le lien : une exigence active et due d'une
// période est SATISFAITE si et seulement si son contrôle passe à cette période.
// `Q` en découle (T04) ; aucune ligne de ce fichier ne fixe `Q`.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReservationRecord } from '@bench/oracle'

import {
  BOUNDARY_PROBE_AFTER,
  BOUNDARY_PROBE_EXACT,
  SLOT_ID,
  TENANT_ORIGIN,
  TENANT_OTHER,
} from './demo-script.js'
import type { ReadObservation, ReferenceModel, ScriptedApplication } from './demo-application.js'

/** Les six contrôles, dans l'ordre où la trajectoire les rencontre. */
export const CONTROL_IDS = [
  'capacite-creneau',
  'idempotence-reservation',
  'annulation-acceptee',
  'fifo-attente',
  'frontiere-24h',
  'isolation-intertenant',
] as const
export type ControlId = (typeof CONTROL_IDS)[number]

/** Le contrôle qui juge chaque exigence du scénario, par clé `id@version`. */
export const CONTROL_BY_REQUIREMENT: Readonly<Record<string, ControlId>> = {
  'reserve@1': 'capacite-creneau',
  'idempotence@1': 'idempotence-reservation',
  'cancel@1': 'annulation-acceptee',
  'fifo@1': 'fifo-attente',
  'cancel@2': 'frontiere-24h',
  'isolation@1': 'isolation-intertenant',
}

export type ControlStatus = 'PASS' | 'VIOLATED'

/** Le résultat d'un contrôle : son nom, son statut, et les DEUX termes comparés. */
export interface ControlOutcome {
  readonly id: ControlId
  readonly status: ControlStatus
  readonly requirement: string
  readonly expected: string
  readonly observed: string
}

/** Ce que la sonde intertenant a observé — publié en clair dans la période. */
export interface ForeignReadProbe {
  readonly view_tenant: string
  readonly verdict: string
  readonly disclosed_records: number
}

export interface ControlContext {
  readonly app: ScriptedApplication
  readonly model: ReferenceModel
  /** Les clés d'opération de réservation que le modèle a réellement admises (D-6). */
  readonly admitted_reserve_keys: readonly string[]
}

/* ──────────────────────────────────────────────────── petits formateurs */

const actorsWithStatus = (records: readonly ReservationRecord[], status: string): string[] =>
  records
    .filter((r) => r.slot === SLOT_ID && r.status === status)
    .map((r) => r.actor)
    .sort()

const statusOf = (records: readonly ReservationRecord[], actor: string): string => {
  const mine = records.filter((r) => r.slot === SLOT_ID && r.actor === actor)
  const last = mine.length === 0 ? undefined : mine[mine.length - 1]
  return last === undefined ? 'ABSENT' : last.status
}

const readFailure = (o: ReadObservation): string => `lecture refusee (${o.code ?? 'sans code'})`

const verdict = (ok: boolean): ControlStatus => (ok ? 'PASS' : 'VIOLATED')

/* ────────────────────────────────────────────── les six contrôles */

function capaciteCreneau(ctx: ControlContext): ControlOutcome {
  const attendu = ctx.model.expectedRecords(TENANT_ORIGIN)
  const capacite = ctx.model.state().slots.find((s) => s.id === SLOT_ID)?.capacity ?? 0
  const confirmesAttendus = actorsWithStatus(attendu, 'confirmed')
  const vu = ctx.app.read({ tenant: TENANT_ORIGIN })
  const confirmesVus = vu.ok ? actorsWithStatus(vu.records, 'confirmed') : null
  const ok =
    confirmesVus !== null &&
    confirmesVus.length <= capacite &&
    confirmesVus.join(',') === confirmesAttendus.join(',')
  return {
    id: 'capacite-creneau',
    status: verdict(ok),
    requirement: 'reserve@1',
    expected: `confirmes=[${confirmesAttendus.join(',')}] sur ${SLOT_ID}, capacite=${String(capacite)}`,
    observed: confirmesVus === null ? readFailure(vu) : `confirmes=[${confirmesVus.join(',')}]`,
  }
}

function idempotenceReservation(ctx: ControlContext): ControlOutcome {
  const attendu = ctx.model.expectedRecords(TENANT_ORIGIN)
  const clesDistinctes = [...new Set(ctx.admitted_reserve_keys)].length
  const vu = ctx.app.read({ tenant: TENANT_ORIGIN })
  const vues = vu.ok ? vu.records.length : null
  // Le rejeu d'une clé d'opération n'ajoute AUCUNE réservation (D-6, L68) : le
  // nombre d'enregistrements vaut donc exactement le nombre de clés distinctes.
  const ok = vues !== null && vues === attendu.length && attendu.length === clesDistinctes
  return {
    id: 'idempotence-reservation',
    status: verdict(ok),
    requirement: 'idempotence@1',
    expected: `${String(attendu.length)} reservation(s) pour ${String(clesDistinctes)} cle(s) d operation distincte(s)`,
    observed: vues === null ? readFailure(vu) : `${String(vues)} reservation(s)`,
  }
}

function annulationAcceptee(ctx: ControlContext): ControlOutcome {
  const attendu = statusOf(ctx.model.expectedRecords(TENANT_ORIGIN), 'A')
  const vu = ctx.app.read({ tenant: TENANT_ORIGIN })
  const observe = vu.ok ? statusOf(vu.records, 'A') : null
  const ok = observe !== null && observe === attendu && attendu === 'cancelled'
  return {
    id: 'annulation-acceptee',
    status: verdict(ok),
    requirement: 'cancel@1',
    expected: `statut de A = ${attendu}`,
    observed: observe === null ? readFailure(vu) : `statut de A = ${observe}`,
  }
}

function fifoAttente(ctx: ControlContext): ControlOutcome {
  const attendu = ctx.model.expectedRecords(TENANT_ORIGIN)
  const capacite = ctx.model.state().slots.find((s) => s.id === SLOT_ID)?.capacity ?? 0
  const confirmesAttendus = actorsWithStatus(attendu, 'confirmed')
  const vu = ctx.app.read({ tenant: TENANT_ORIGIN })

  // La règle elle-même, rejouée sur CE QUI EST OBSERVÉ : les places confirmées
  // reviennent aux rangs d'admission les plus PETITS parmi les réservations non
  // annulées. L123 : « FIFO est ordonné par séquence d'admission explicite, pas
  // par égalité possible de timestamps » — c'est `rank` qui ordonne, jamais `at`.
  let confirmesVus: string[] | null = null
  let fifoRespecte = false
  if (vu.ok) {
    const actives = vu.records.filter((r) => r.slot === SLOT_ID && r.status !== 'cancelled')
    const parRang = [...actives].sort((a, b) => a.rank - b.rank)
    const doiventEtreConfirmes = parRang
      .slice(0, capacite)
      .map((r) => r.actor)
      .sort()
    confirmesVus = actorsWithStatus(vu.records, 'confirmed')
    fifoRespecte = confirmesVus.join(',') === doiventEtreConfirmes.join(',')
  }
  const ok = confirmesVus !== null && fifoRespecte && confirmesVus.join(',') === confirmesAttendus.join(',')
  return {
    id: 'fifo-attente',
    status: verdict(ok),
    requirement: 'fifo@1',
    expected: `les ${String(capacite)} plus petits rangs d admission non annules sont confirmes : [${confirmesAttendus.join(',')}]`,
    observed: confirmesVus === null ? readFailure(vu) : `confirmes=[${confirmesVus.join(',')}]`,
  }
}

function frontiere24h(ctx: ControlContext): ControlOutcome {
  const attenduExact = ctx.model.expectedCancellation(BOUNDARY_PROBE_EXACT)
  const attenduApres = ctx.model.expectedCancellation(BOUNDARY_PROBE_AFTER)

  // Les probes sont des CLONES JETABLES (L123) : l'empreinte de l'état principal
  // est relevée avant et après, et son égalité fait partie du contrôle.
  const avant = ctx.app.digest()
  const exact = ctx.app.probeCancellation('B', BOUNDARY_PROBE_EXACT, 'IDK-PROBE-FRONTIERE')
  const apres = ctx.app.probeCancellation('B', BOUNDARY_PROBE_AFTER, 'IDK-PROBE-APRES')
  const apresDigest = ctx.app.digest()

  const ok =
    exact.accepted === attenduExact &&
    apres.accepted === attenduApres &&
    attenduExact &&
    !attenduApres &&
    avant === apresDigest
  return {
    id: 'frontiere-24h',
    status: verdict(ok),
    requirement: 'cancel@2',
    expected: `${BOUNDARY_PROBE_EXACT} acceptee=${String(attenduExact)}, ${BOUNDARY_PROBE_AFTER} acceptee=${String(attenduApres)}, etat principal inchange`,
    observed: `${BOUNDARY_PROBE_EXACT} acceptee=${String(exact.accepted)} (${exact.code ?? 'sans code'}), ${BOUNDARY_PROBE_AFTER} acceptee=${String(apres.accepted)} (${apres.code ?? 'sans code'}), etat principal ${avant === apresDigest ? 'inchange' : 'MODIFIE'}`,
  }
}

/** La sonde intertenant, jouée par le contrôle d'isolation (L119, L123). */
export function probeForeignTenant(ctx: ControlContext): {
  outcome: ControlOutcome
  probe: ForeignReadProbe
} {
  const codeAttendu = ctx.model.expectedForeignReadCode()
  const vu = ctx.app.read({ tenant: TENANT_OTHER, actor: 'Z' })
  const divulgues = vu.records.length
  const ok = !vu.ok && vu.code === codeAttendu && divulgues === 0
  return {
    outcome: {
      id: 'isolation-intertenant',
      status: verdict(ok),
      requirement: 'isolation@1',
      expected: `refus ${codeAttendu}, 0 enregistrement divulgue`,
      observed: vu.ok
        ? `lecture ACCEPTEE, ${String(divulgues)} enregistrement(s) divulgue(s)`
        : `refus ${vu.code ?? 'sans code'}, ${String(divulgues)} enregistrement(s) divulgue(s)`,
    },
    probe: {
      view_tenant: TENANT_OTHER,
      verdict: vu.ok ? 'DISCLOSED' : (vu.code ?? 'SANS_CODE'),
      disclosed_records: divulgues,
    },
  }
}

/** Exécute UN contrôle nommé. */
export function evaluateControl(id: ControlId, ctx: ControlContext): ControlOutcome {
  switch (id) {
    case 'capacite-creneau':
      return capaciteCreneau(ctx)
    case 'idempotence-reservation':
      return idempotenceReservation(ctx)
    case 'annulation-acceptee':
      return annulationAcceptee(ctx)
    case 'fifo-attente':
      return fifoAttente(ctx)
    case 'frontiere-24h':
      return frontiere24h(ctx)
    case 'isolation-intertenant':
      return probeForeignTenant(ctx).outcome
  }
}
