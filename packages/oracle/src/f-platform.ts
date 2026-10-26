// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — F-PLATFORM : modèle attendu et vérifications de la source de
// clauses (tâche T70, ADR-021 décision 1).
//
//   platformClauses                 la source unique (f-platform-clauses.ts) ;
//   createPlatformModel()           un modèle attendu neuf : { apply(step) } ;
//   replayPlatform(steps)           rejoue une trajectoire sur UN état ;
//   checkNonContradiction(clauses)  deux clauses actives à une même période ne
//                                   gouvernent jamais la même décision, sauf
//                                   remplacement explicite ;
//   checkUnits(clauses)             chaque grandeur comparée par une clause
//                                   active a son unité et son format déclarés
//                                   par une clause active à cette période.
//
// Les vérifications lisent les clauses comme des DONNÉES (champs governs,
// compares, contract.quantities, enters, exits, replaces) : elles jugent aussi
// une source modifiée qu'on leur passe, pas seulement la source du paquet.
// ─────────────────────────────────────────────────────────────────────────────

import { PLATFORM_CLAUSES } from './f-platform-clauses.js'
import {
  type PlatformClause,
  type PlatformResponse,
  type PlatformStep,
  PlatformEngine,
  isActiveAt,
  periodNumber,
} from './f-platform-engine.js'

export { PLATFORM_CLAUSES, PLATFORM_QUANTITIES } from './f-platform-clauses.js'
/** Le moteur générique, pour exécuter une source de clauses FOURNIE (T73 : exemples des documents de période). */
export { PlatformEngine } from './f-platform-engine.js'
export type { PlatformClause, PlatformResponse, PlatformStep, Precision, Quantity } from './f-platform-engine.js'

/** Alias de lecture de la source unique. */
export const platformClauses: readonly PlatformClause[] = PLATFORM_CLAUSES

/** Dernière période que la vérification balaie (F-PLATFORM en compte 24). */
const DERNIERE_PERIODE = 24

export interface PlatformModel {
  apply(step: PlatformStep): PlatformResponse
}

export function createPlatformModel(): PlatformModel {
  const engine = new PlatformEngine(PLATFORM_CLAUSES)
  return { apply: (step) => engine.apply(step) }
}

export function replayPlatform(steps: readonly PlatformStep[]): PlatformResponse[] {
  const model = createPlatformModel()
  return steps.map((s) => model.apply(s))
}

/* ───────────────────────────────────────────── lecture tolérante d'une clause */

type Obj = Record<string, unknown>

function champ(c: Obj, nom: string): unknown {
  if (c[nom] !== undefined) return c[nom]
  const contrat = c.contract
  return contrat !== null && typeof contrat === 'object' ? (contrat as Obj)[nom] : undefined
}

function noms(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x : x !== null && typeof x === 'object' ? (x as Obj).name : undefined))
    .filter((x): x is string => typeof x === 'string')
}

function idDe(c: Obj): string {
  return typeof c.id === 'string' ? c.id : '<sans-id>'
}

function remplacees(c: Obj): string[] {
  const r = c.replaces
  if (typeof r === 'string') return [r]
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
}

function declarations(c: Obj): Map<string, Obj> {
  const out = new Map<string, Obj>()
  const v = champ(c, 'quantities')
  if (Array.isArray(v)) {
    for (const d of v) {
      if (d !== null && typeof d === 'object' && typeof (d as Obj).name === 'string') out.set((d as Obj).name as string, d as Obj)
    }
  } else if (v !== null && typeof v === 'object') {
    for (const [n, d] of Object.entries(v as Obj)) out.set(n, d !== null && typeof d === 'object' ? (d as Obj) : {})
  }
  return out
}

const nonVide = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const uniteDe = (d: Obj): unknown => d.unit ?? d.unite

function periodes(clauses: readonly Obj[]): number[] {
  let fin = DERNIERE_PERIODE
  for (const c of clauses) {
    for (const v of [c.enters, c.exits]) {
      const n = periodNumber(v)
      if (n !== null && n > fin) fin = n
    }
  }
  return Array.from({ length: fin }, (_, i) => i + 1)
}

/* ─────────────────────────────────────────────────── non-contradiction (A3) */

export interface Contradiction {
  readonly decision: string
  readonly clauses: readonly [string, string]
  readonly periodes: readonly string[]
  readonly message: string
}

export interface NonContradictionVerdict {
  readonly ok: boolean
  readonly contradictions: readonly Contradiction[]
}

export function checkNonContradiction(clauses: readonly unknown[]): NonContradictionVerdict {
  const cs = clauses.filter((c): c is Obj => c !== null && typeof c === 'object')
  const remplace = (a: Obj, b: Obj): boolean => remplacees(a).includes(idDe(b)) || remplacees(b).includes(idDe(a))
  const trouvees = new Map<string, { decision: string; a: string; b: string; periodes: string[] }>()
  for (const n of periodes(cs)) {
    const actives = cs.filter((c) => isActiveAt(c, n))
    for (let i = 0; i < actives.length; i += 1) {
      const a = actives[i] as Obj
      const da = new Set(noms(champ(a, 'governs')))
      if (da.size === 0) continue
      for (let j = i + 1; j < actives.length; j += 1) {
        const b = actives[j] as Obj
        if (remplace(a, b)) continue
        for (const d of noms(champ(b, 'governs'))) {
          if (!da.has(d)) continue
          const cle = `${idDe(a)}\u0000${idDe(b)}\u0000${d}`
          const f = trouvees.get(cle) ?? { decision: d, a: idDe(a), b: idDe(b), periodes: [] }
          f.periodes.push(`P${String(n)}`)
          trouvees.set(cle, f)
        }
      }
    }
  }
  const contradictions = [...trouvees.values()].map((f) => ({
    decision: f.decision,
    clauses: [f.a, f.b] as const,
    periodes: f.periodes,
    message:
      `les clauses ${f.a} et ${f.b} gouvernent toutes deux la decision ${f.decision} ` +
      `aux periodes ${f.periodes.join(', ')} sans que l'une remplace l'autre`,
  }))
  return { ok: contradictions.length === 0, contradictions }
}

/* ─────────────────────────────────────────────────────── unités et formats (A4) */

export interface UnitViolation {
  readonly grandeur: string
  readonly clause: string
  readonly periodes: readonly string[]
  readonly message: string
}

export interface UnitsVerdict {
  readonly ok: boolean
  readonly violations: readonly UnitViolation[]
}

export function checkUnits(clauses: readonly unknown[]): UnitsVerdict {
  const cs = clauses.filter((c): c is Obj => c !== null && typeof c === 'object')
  const trouvees = new Map<string, { grandeur: string; clause: string; motif: string; periodes: string[] }>()
  const noter = (grandeur: string, clause: string, motif: string, n: number): void => {
    const cle = `${grandeur}\u0000${clause}\u0000${motif}`
    const f = trouvees.get(cle) ?? { grandeur, clause, motif, periodes: [] }
    f.periodes.push(`P${String(n)}`)
    trouvees.set(cle, f)
  }
  for (const n of periodes(cs)) {
    const actives = cs.filter((c) => isActiveAt(c, n))
    // déclarations actives à n : grandeur -> [clause, unité, format]
    const declarees = new Map<string, Array<[string, unknown, unknown]>>()
    for (const c of actives) {
      for (const [g, d] of declarations(c)) {
        const l = declarees.get(g) ?? []
        l.push([idDe(c), uniteDe(d), d.format])
        declarees.set(g, l)
      }
    }
    for (const c of actives) {
      for (const g of noms(champ(c, 'compares'))) {
        const decl = declarees.get(g) ?? []
        const completes = decl.filter(([, u, f]) => nonVide(u) && nonVide(f))
        if (decl.length === 0) {
          noter(g, idDe(c), "n'a aucune unite ni aucun format declares par une clause active", n)
        } else if (completes.length === 0) {
          noter(g, idDe(c), `est declaree sans unite ou sans format (par ${decl.map(([id]) => id).join(', ')})`, n)
        } else {
          const formes = new Set(completes.map(([, u, f]) => `${String(u)}\u0000${String(f)}`))
          if (formes.size > 1) {
            noter(g, idDe(c), `a des unites ou formats divergents (${completes.map(([id]) => id).join(', ')})`, n)
          }
        }
      }
    }
  }
  const violations = [...trouvees.values()].map((f) => ({
    grandeur: f.grandeur,
    clause: f.clause,
    periodes: f.periodes,
    message: `la grandeur ${f.grandeur}, comparee par ${f.clause}, ${f.motif} aux periodes ${f.periodes.join(', ')}`,
  }))
  return { ok: violations.length === 0, violations }
}
