// ─────────────────────────────────────────────────────────────────────────────
// LE MANIFESTE CONFIRMATOIRE, ET L'EXPORT DES EXCLUSIONS (cahier L241, L111).
//
// DEUX EXIGENCES QUI SE TIENNENT L'UNE L'AUTRE.
//
//  • « A5 : aucun cas mis en quarantaine n'entre dans un manifeste
//    confirmatoire » (L241). C'est une ABSENCE, et une absence se satisfait du
//    vide : un manifeste sans aucun cas ne contient évidemment aucun cas
//    écarté.
//  • « Une campagne confirmatoire exige une EXPOSITION PRÉDÉFINIE NON NULLE »
//    (L111). C'est ce qui interdit le vide.
//
// Les deux ensemble décident de ce fichier : le manifeste porte TOUS les cas
// qualifiés, et un manifeste qui n'en aurait aucun n'est pas rendu — il est
// REFUSÉ, parce qu'une campagne sans exposition n'est pas une campagne.
//
// LE FILTRE EST LA FILE DE QUARANTAINE, PAS UNE OPINION LOCALE. Un cas est
// écarté s'il est en quarantaine — soit parce que son rapport le dit, soit
// parce que la file le porte. Les deux lectures sont gardées : un rapport
// recopié à la main ne doit pas pouvoir rentrer un cas que la file a écarté.
//
// LES PROPORTIONS SONT DES RATIONNELS EXACTS. L143 : « les nombres exacts se
// vérifient en entier ou rationnel […] tolérance au maximum 1e-12 ». Le
// dénominateur est UNIQUE pour toutes les entrées — le lot SOUMIS — et il est
// publié à côté de la proportion : une proportion dont on ignore le
// dénominateur n'est pas une proportion, c'est un nombre.
// ─────────────────────────────────────────────────────────────────────────────
import { QualificationViolation } from './errors.js'
import { listQuarantine } from './scenario.js'

/** Un cas retenu dans le manifeste. */
export interface ManifestCase {
  readonly scenario_id: string
  readonly verdict: string
  readonly steps_observed: number
}

export interface ConfirmatoryManifest {
  readonly schema: 'bench.qualification.confirmatory-manifest/1'
  readonly exposure_submitted: number
  readonly exposure_retained: number
  readonly exposure_excluded: number
  readonly cases: readonly ManifestCase[]
}

/** Une raison d'exclusion, son compte et sa proportion (L241). */
export interface ExclusionShare {
  readonly reason: string
  readonly reason_code: string
  readonly count: number
  readonly proportion: number
  readonly denominator: number
  readonly basis: string
  readonly sample_reason: string
}

interface LuRapport {
  readonly scenario_id: string
  readonly quarantined: boolean
  readonly reason: string
  readonly reason_code: string
  readonly steps: number
}

function lireRapport(raw: unknown, index: number): LuRapport {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new QualificationViolation('TYPE_MISMATCH', `/rapports/${String(index)}`, 'objet attendu')
  }
  const o = raw as Record<string, unknown>
  const id = typeof o['scenario_id'] === 'string' ? o['scenario_id'] : ''
  if (id === '') {
    throw new QualificationViolation(
      'MISSING_PROPERTY',
      `/rapports/${String(index)}/scenario_id`,
      'un rapport de qualification identifie le scenario qu il juge',
    )
  }
  const enFile = listQuarantine().find((e) => e.scenario_id === id) ?? null
  const dit = o['quarantined'] === true
  const code = typeof o['reason_code'] === 'string' ? o['reason_code'] : ''
  const motif = typeof o['reason'] === 'string' ? o['reason'] : ''
  const etapes = Array.isArray(o['steps']) ? o['steps'].length : 0
  return {
    scenario_id: id,
    quarantined: dit || enFile !== null,
    reason: motif !== '' ? motif : (enFile?.reason ?? ''),
    reason_code: code !== '' ? code : (enFile?.reason_code ?? 'CONTRADICTION_ASSERTION_CONTRAT'),
    steps: etapes,
  }
}

function lireLot(rapports: unknown, role: string): LuRapport[] {
  if (!Array.isArray(rapports)) {
    throw new QualificationViolation('TYPE_MISMATCH', `/${role}/rapports`, 'tableau attendu')
  }
  return rapports.map((r, i) => lireRapport(r, i))
}

/* ══════════════════════════════════ manifeste confirmatoire ═══════════ */

export function buildConfirmatoryManifest(rapports: unknown): ConfirmatoryManifest {
  const lot = lireLot(rapports, 'buildConfirmatoryManifest')
  const retenus = lot.filter((r) => !r.quarantined)
  if (retenus.length === 0) {
    throw new QualificationViolation(
      'EMPTY_EXPOSURE',
      '/buildConfirmatoryManifest',
      `aucun cas qualifie sur ${String(lot.length)} soumis : une campagne confirmatoire ` +
        'exige une exposition predefinie non nulle (cahier L111)',
    )
  }
  return {
    schema: 'bench.qualification.confirmatory-manifest/1',
    exposure_submitted: lot.length,
    exposure_retained: retenus.length,
    exposure_excluded: lot.length - retenus.length,
    cases: retenus.map((r) => ({
      scenario_id: r.scenario_id,
      verdict: 'QUALIFIE',
      steps_observed: r.steps,
    })),
  }
}

/* ═══════════════════════════════════ export des exclusions ════════════ */

export function exportExclusions(rapports: unknown): ExclusionShare[] {
  const lot = lireLot(rapports, 'exportExclusions')
  const exclus = lot.filter((r) => r.quarantined)
  const denominateur = lot.length
  if (denominateur === 0 || exclus.length === 0) return []

  const groupes = new Map<string, { count: number; sample: string }>()
  for (const r of exclus) {
    const courant = groupes.get(r.reason_code)
    if (courant === undefined) groupes.set(r.reason_code, { count: 1, sample: r.reason })
    else groupes.set(r.reason_code, { count: courant.count + 1, sample: courant.sample })
  }

  return [...groupes.entries()].map(([code, g]) => ({
    reason: code,
    reason_code: code,
    count: g.count,
    proportion: g.count / denominateur,
    denominator: denominateur,
    basis: 'lot_soumis',
    sample_reason: g.sample,
  }))
}
