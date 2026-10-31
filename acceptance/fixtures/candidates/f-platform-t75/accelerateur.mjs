// acceptance/fixtures/candidates/f-platform-t75/accelerateur.mjs — zone ACCEPTANCE (T75, test-author).
//
// INDEX TRANSPARENTS DU CANDIDAT DE REFERENCE DE T75. Pourquoi ils existent :
// l'instantane de la source de clauses qu'execute le candidat de reference de T74
// (../f-platform-reference/, commit 29cdd0d) est ecrit pour l'exactitude, pas pour le
// volume : plusieurs decisions parcourent TOUTES les reservations du locataire. Mesure
// (hors suite, en processus, 4 coeurs) apres import de 50 000 reservations selon le
// profil `volume` de P20 (instantane 29cdd0d) : import 31,1 s (plafond 30 s), report_occupancy
// p95 350 ms (plafond 200), erase_member p95 226 ms (plafond 100). Ce candidat-la ECHOUE donc
// P20.R3 : il ne peut pas servir de « candidat de reference normal » a T75.A1.
//
// Ce module ne change AUCUNE regle. Il restreint, pendant l'appel de quatre decisions
// seulement, le parcours d'une table aux entrees que la decision aurait de toute facon
// retenues :
//   - `creneau.occupation`, `creneau.places_libres`, `reserve.etape.deja_reserve` : leur
//     boucle `for (const b of ctx.locataire.bookings.values())` ne retient que les
//     reservations dont `b.slot_id` est celui du creneau en cause ; le parcours est
//     restreint au compartiment de ce creneau (index par slot_id, ordre d'insertion
//     conserve). Somme, ensemble et test d'existence ne dependent pas de l'ordre ;
//   - `membre.renommer` (P18.R2) : `remplacerMembre(v, m, pseudo)` ne change que les
//     valeurs des cles de membre egales a m et le suffixe m des invoice_id ; les boucles
//     sur `t.memo` et l'entrepot `idempotence.arguments` sont restreintes aux entrees qui
//     contiennent m a une telle place (les autres seraient reecrites a l'identique, a la
//     meme cle, sans changer l'ordre de la Map) ;
//   - `membre.renommer`, entrepot `import.memoire` (classe ImportsIndexes) : un import de
//     volume y garde ses 50 000 lignes dans UNE entree, que l'effacement d'un membre
//     importe recopiait en entier (`remplacerMembre` sur les 50 000 lignes, puis
//     re-indexation : erase_member p95 ~ 119 ms en processus, au-dessus du plafond de 100,
//     des que la mesure efface des membres qui detiennent des reservations importees,
//     precision Q68 de la racine, decision du mandant du 31/10/2026). Le parcours de
//     l'entrepot est MASQUE pendant l'appel ; a sa fin, chaque entree qui cite m recoit la
//     valeur que `remplacerMembre` aurait rendue : chaque cle hors `rows` y passe, et dans
//     `rows` seules les lignes qui citent m (index par membre des rangs de ligne) sont
//     remplacees ; une ligne qui ne cite pas m est rendue egale par `remplacerMembre`.
//     Meme cle, meme rang dans la Map, valeur profondement egale. Le tableau `rows`
//     memorise (copie propre a l'entrepot, P20.R4) est mis a jour en place.
// La restriction est A USAGE UNIQUE : elle s'applique au premier parcours de la table
// pendant l'appel, qui est la boucle de la decision elle-meme (verifie par lecture), et
// tombe a la fin de l'appel. Aucune affectation `b.slot_id = ...` d'une reservation deja
// rangee n'existe dans la source (la fusion P17 cree de NOUVEAUX objets) ; le
// compartiment re-verifie neanmoins `b.slot_id` a chaque lecture.
//
// Transparence VERIFIEE : (1) par acceptance/T75.spec.ts, qui rejoue toute la trajectoire
// gelee (776 etapes, P1 a P24) contre ce candidat ET contre celui de T74 et exige des
// reponses identiques octet pour octet ; (2) hors suite, en processus, les operations du
// profil `volume` (repartition decalee Q67, import compris, erase_member sur 70 membres
// importes Q68) : empreinte des reponses identique sans index (moteur du candidat de
// T74), avec les index de 6a849f4 et avec ceux-ci ; etat de l'entrepot `import.memoire`
// identique apres les 70 effacements (3 500 lignes renommees), et un rejeu de l'import en
// P21 (P21.R2, rows egaux en profondeur) rend la reponse memorisee. Avec ces index
// (29cdd0d, en processus) : import 3,6 s, erase_member 10 ms (119 ms avant), report_occupancy
// 22 ms, merge_tenants 24 ms (p95).

const CLES_DE_MEMBRE = new Set(['member_id', 'payer_member_id', 'from_member_id', 'to_member_id'])
const FACTURE_ID = /^INV-\d{4}-\d{2}-/
const ENTREPOTS_INDEXES = new Set(['idempotence.arguments'])
const ENTREPOT_IMPORTS = 'import.memoire'

/** Table des reservations d'un locataire, indexee par slot_id. */
export class ReservationsIndexees extends Map {
  constructor(entrees) {
    super()
    this.parCreneau = new Map()
    this.creneauDe = new Map()
    this.restriction = null
    if (entrees) for (const [k, v] of entrees) this.set(k, v)
  }
  set(k, b) {
    const s = b !== null && typeof b === 'object' ? b.slot_id : undefined
    if (this.creneauDe.has(k) && this.creneauDe.get(k) !== s) this.parCreneau.get(this.creneauDe.get(k))?.delete(k)
    if (!this.parCreneau.has(s)) this.parCreneau.set(s, new Set())
    this.parCreneau.get(s).add(k)
    this.creneauDe.set(k, s)
    return super.set(k, b)
  }
  delete(k) {
    if (this.creneauDe.has(k)) {
      this.parCreneau.get(this.creneauDe.get(k))?.delete(k)
      this.creneauDe.delete(k)
    }
    return super.delete(k)
  }
  clear() {
    this.parCreneau.clear()
    this.creneauDe.clear()
    return super.clear()
  }
  *compartiment(s) {
    for (const k of [...(this.parCreneau.get(s) ?? [])]) {
      const b = Map.prototype.get.call(this, k)
      if (b !== undefined && b.slot_id === s) yield b
    }
  }
  values() {
    const r = this.restriction
    if (r !== null) {
      this.restriction = null
      return this.compartiment(r)
    }
    return super.values()
  }
}

function membresCites(v, cle, out) {
  if (typeof v === 'string') {
    if (cle !== undefined && CLES_DE_MEMBRE.has(cle)) out.add(v)
    else if ((cle === 'invoice_id' || cle === 'invoice_ids') && FACTURE_ID.test(v)) out.add(v.slice(12))
    return
  }
  if (Array.isArray(v)) {
    for (const x of v) membresCites(x, cle, out)
    return
  }
  if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) membresCites(x, k, out)
}

/** Map cle -> valeur JSON, indexee par les membres que la valeur cite (cles de membre, suffixe d'invoice_id). */
export class ValeursIndexees extends Map {
  constructor(entrees) {
    super()
    this.parMembre = new Map()
    this.membresDe = new Map()
    this.restriction = null
    if (entrees) for (const [k, v] of entrees) this.set(k, v)
  }
  set(k, v) {
    for (const m of this.membresDe.get(k) ?? []) this.parMembre.get(m)?.delete(k)
    const ms = new Set()
    membresCites(v, undefined, ms)
    this.membresDe.set(k, ms)
    for (const m of ms) {
      if (!this.parMembre.has(m)) this.parMembre.set(m, new Set())
      this.parMembre.get(m).add(k)
    }
    return super.set(k, v)
  }
  delete(k) {
    for (const m of this.membresDe.get(k) ?? []) this.parMembre.get(m)?.delete(k)
    this.membresDe.delete(k)
    return super.delete(k)
  }
  clear() {
    this.parMembre.clear()
    this.membresDe.clear()
    return super.clear()
  }
  [Symbol.iterator]() {
    return this.entries()
  }
  entries() {
    const r = this.restriction
    if (r === null) return super.entries()
    this.restriction = null
    const cles = [...(this.parMembre.get(r) ?? [])]
    const self = this
    return (function* () {
      for (const k of cles) if (Map.prototype.has.call(self, k)) yield [k, Map.prototype.get.call(self, k)]
    })()
  }
}

/** Copie conforme de `renommerFacture` et `remplacerMembre` de la source (P18.R2). */
const renommerFacture = (id, de, vers) => (typeof id === 'string' && FACTURE_ID.test(id) && id.slice(12) === de ? `${id.slice(0, 12)}${vers}` : id)
function remplacerMembre(v, de, vers, cle) {
  if (typeof v === 'string') {
    if (cle !== undefined && CLES_DE_MEMBRE.has(cle)) return v === de ? vers : v
    if (cle === 'invoice_id' || cle === 'invoice_ids') return renommerFacture(v, de, vers)
    return v
  }
  if (Array.isArray(v)) return v.map((x) => remplacerMembre(x, de, vers, cle))
  if (v !== null && typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) out[k] = remplacerMembre(x, de, vers, k)
    return out
  }
  return v
}

/**
 * Entrepot `import.memoire` (P20.R4/P21.R2) : import_id -> { reponse, rows }. Un import de volume y
 * garde ses 50 000 lignes ; `membre.renommer` (effacement P18.R1/R2, fusion P17) recopie TOUTE valeur
 * qui cite le membre par `remplacerMembre`, donc les 50 000 lignes a chaque effacement d'un membre
 * importe. Index : pour chaque valeur, les membres cites hors `rows`, et pour `rows` (tableau) le
 * rang des lignes qui citent chaque membre (memes regles que `remplacerMembre` : cles de membre,
 * suffixe d'invoice_id). Pendant `membre.renommer`, le parcours de l'entrepot est MASQUE (la
 * decision ne voit aucune entree) ; a la fin de l'appel, `renommer(m, pseudo)` produit, pour
 * chaque entree qui cite m, la valeur que `remplacerMembre` aurait rendue : chaque cle hors `rows`
 * passe par `remplacerMembre`, et dans `rows` seules les lignes qui citent m sont remplacees (par
 * `remplacerMembre(ligne, m, pseudo, 'rows')`) ; une ligne qui ne cite pas m est rendue egale par
 * `remplacerMembre`, elle est donc gardee. Meme cle, meme rang dans la Map, valeur profondement
 * egale : la transparence est celle de la decision.
 */
export class ImportsIndexes extends Map {
  constructor(entrees) {
    super()
    this.parMembre = new Map() // membre -> Set(cle)
    this.lignesDe = new Map() // cle -> Map(membre -> Set(rang de ligne))
    this.masque = false
    if (entrees) for (const [k, v] of entrees) this.set(k, v)
  }
  oublier(k) {
    for (const [m, ks] of this.parMembre) {
      ks.delete(k)
      if (ks.size === 0) this.parMembre.delete(m)
    }
    this.lignesDe.delete(k)
  }
  citer(m, k) {
    if (!this.parMembre.has(m)) this.parMembre.set(m, new Set())
    this.parMembre.get(m).add(k)
  }
  indexer(k, v) {
    const lignes = new Map()
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [kk, x] of Object.entries(v)) {
        if (kk === 'rows' && Array.isArray(x)) {
          x.forEach((ligne, i) => {
            const ms = new Set()
            membresCites(ligne, 'rows', ms)
            for (const m of ms) {
              if (!lignes.has(m)) lignes.set(m, new Set())
              lignes.get(m).add(i)
              this.citer(m, k)
            }
          })
        } else {
          const ms = new Set()
          membresCites(x, kk, ms)
          for (const m of ms) this.citer(m, k)
        }
      }
    } else {
      const ms = new Set()
      membresCites(v, undefined, ms)
      for (const m of ms) this.citer(m, k)
    }
    this.lignesDe.set(k, lignes)
  }
  set(k, v) {
    if (this.lignesDe.has(k)) this.oublier(k)
    this.indexer(k, v)
    return super.set(k, v)
  }
  delete(k) {
    this.oublier(k)
    return super.delete(k)
  }
  clear() {
    this.parMembre.clear()
    this.lignesDe.clear()
    return super.clear()
  }
  [Symbol.iterator]() {
    return this.entries()
  }
  entries() {
    if (!this.masque) return super.entries()
    this.masque = false
    return [][Symbol.iterator]()
  }
  /** Ce que `for (const [k, x] of imports) imports.set(k, remplacerMembre(x, m, pseudo))` aurait laisse. */
  renommer(m, pseudo) {
    for (const k of [...(this.parMembre.get(m) ?? [])]) {
      if (!Map.prototype.has.call(this, k)) continue
      const v = Map.prototype.get.call(this, k)
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        this.set(k, remplacerMembre(v, m, pseudo))
        continue
      }
      const lignes = this.lignesDe.get(k) ?? new Map()
      const rangs = lignes.get(m) ?? new Set()
      const out = {}
      for (const [kk, x] of Object.entries(v)) {
        if (kk === 'rows' && Array.isArray(x)) {
          for (const i of rangs) x[i] = remplacerMembre(x[i], m, pseudo, 'rows')
          out[kk] = x
        } else out[kk] = remplacerMembre(x, m, pseudo, kk)
      }
      // index : seules les lignes remplacees changent de membres cites
      lignes.delete(m)
      for (const ks of lignes.values()) for (const i of rangs) ks.delete(i)
      for (const i of rangs) {
        const ms = new Set()
        membresCites(out.rows[i], 'rows', ms)
        for (const x of ms) {
          if (!lignes.has(x)) lignes.set(x, new Set())
          lignes.get(x).add(i)
        }
      }
      for (const [x, is] of [...lignes]) if (is.size === 0) lignes.delete(x)
      // membres cites par l'entree : recalcules hors rows, plus ceux des lignes
      for (const [x, ks] of this.parMembre) {
        ks.delete(k)
        if (ks.size === 0) this.parMembre.delete(x)
      }
      for (const [kk, x] of Object.entries(out)) {
        if (kk === 'rows' && Array.isArray(x)) continue
        const ms = new Set()
        membresCites(x, kk, ms)
        for (const y of ms) this.citer(y, k)
      }
      for (const x of lignes.keys()) this.citer(x, k)
      Map.prototype.set.call(this, k, out)
    }
  }
}

class EntrepotIndexe extends Map {
  set(k, v) {
    if (k === ENTREPOT_IMPORTS && v instanceof Map && !(v instanceof ImportsIndexes)) return super.set(k, new ImportsIndexes(v))
    return super.set(k, ENTREPOTS_INDEXES.has(k) && v instanceof Map && !(v instanceof ValeursIndexees) ? new ValeursIndexees(v) : v)
  }
}

/** Pose les index sur un locataire (idempotent). */
export function indexerLocataire(t) {
  if (t === null || typeof t !== 'object') return t
  if (t.bookings instanceof Map && !(t.bookings instanceof ReservationsIndexees)) t.bookings = new ReservationsIndexees(t.bookings)
  if (t.memo instanceof Map && !(t.memo instanceof ValeursIndexees)) t.memo = new ValeursIndexees(t.memo)
  if (t.donnees instanceof Map && !(t.donnees instanceof EntrepotIndexe)) {
    const d = new EntrepotIndexe()
    for (const [k, v] of t.donnees) d.set(k, v)
    t.donnees = d
  }
  return t
}

class LocatairesIndexes extends Map {
  set(k, t) {
    return super.set(k, indexerLocataire(t))
  }
}

/** Pose les index sur l'etat d'un moteur (et sur tout locataire cree ensuite). */
export function indexerEtat(etat) {
  const ts = new LocatairesIndexes()
  for (const [k, t] of etat.tenants) ts.set(k, t)
  etat.tenants = ts
  return etat
}

function restreindre(table, valeur) {
  if (table instanceof ReservationsIndexees || table instanceof ValeursIndexees) table.restriction = valeur
}
function lever(table) {
  if (table instanceof ReservationsIndexees || table instanceof ValeursIndexees) table.restriction = null
}

/** Les clauses de la source, les quatre decisions ci-dessus enveloppees ; rien d'autre ne change. */
export function clausesIndexees(clauses) {
  return clauses.map((c) => {
    const impl = { ...c.implementation }
    let touchee = false
    for (const d of ['creneau.occupation', 'creneau.places_libres']) {
      if (typeof impl[d] !== 'function') continue
      const f = impl[d]
      impl[d] = (ctx, slot, ...reste) => {
        if (slot !== null && typeof slot === 'object') restreindre(ctx.locataire.bookings, slot.slot_id)
        try {
          return f(ctx, slot, ...reste)
        } finally {
          lever(ctx.locataire.bookings)
        }
      }
      touchee = true
    }
    const e = impl['reserve.etape.deja_reserve']
    if (e !== undefined && typeof e.etape === 'function') {
      impl['reserve.etape.deja_reserve'] = {
        ...e,
        etape: (ctx) => {
          if (ctx.d.slot !== null && typeof ctx.d.slot === 'object') restreindre(ctx.locataire.bookings, ctx.d.slot.slot_id)
          try {
            return e.etape(ctx)
          } finally {
            lever(ctx.locataire.bookings)
          }
        },
      }
      touchee = true
    }
    if (typeof impl['membre.renommer'] === 'function') {
      const f = impl['membre.renommer']
      impl['membre.renommer'] = (ctx, t, m, pseudo, ...reste) => {
        const tables = [t.memo, t.donnees.get('idempotence.arguments')]
        const imports = t.donnees.get(ENTREPOT_IMPORTS)
        for (const x of tables) restreindre(x, m)
        if (imports instanceof ImportsIndexes) imports.masque = true
        let r
        try {
          r = f(ctx, t, m, pseudo, ...reste)
        } finally {
          for (const x of tables) lever(x)
          if (imports instanceof ImportsIndexes) imports.masque = false
        }
        if (imports instanceof ImportsIndexes) imports.renommer(m, pseudo)
        return r
      }
      touchee = true
    }
    return touchee ? { ...c, implementation: impl } : c
  })
}
