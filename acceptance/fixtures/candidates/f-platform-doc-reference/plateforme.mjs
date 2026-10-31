// acceptance/fixtures/candidates/f-platform-doc-reference/plateforme.mjs — zone ACCEPTANCE
// (test-author de T77). Les REGLES de la plateforme F-PLATFORM, P1 a P24, ecrites a partir des SEULS
// documents remis au candidat (docs/spec.md, docs/api.md, docs/tickets/Pnn.md des 24 periodes) ;
// chaque regle cite la clause qui la fonde. Provenance et journal : voir l'en-tete de candidat.mjs.
//
// `creerPlateforme({ sansClauses })` rend { apply(requete) } : requete = {period, at, op, args,
// tenant?, actor?, version?} -> reponse. `sansClauses` (instrumentation de la suite) : seule
// 'P6.R2' est reconnue (le candidat ne refuse plus les groupes trop grands).

/* ═══════════════════════════════════════════════════════════════ outils */

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const chaineNonVide = (v) => typeof v === 'string' && v.length > 0
const entier = (v) => typeof v === 'number' && Number.isInteger(v)
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0) // ordinal UTF-16 (P11.R2, P17.R2)
const B = (x) => BigInt(x)
const fdiv = (a, b) => {
  // floor(a / b) en BigInt, b > 0
  const q = a / b
  return a % b !== 0n && a < 0n ? q - 1n : q
}
const N = (x) => Number(x)
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/* ═══════════════════════════════════════════════════════════════ temps */
// 'AAAA-MM-JJTHH:MM:SSZ' (P1.R1), 'AAAA-MM-JJ' (P5.R1), 'AAAA-MM' (P14.R2)

const RE_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const RE_MOIS = /^(\d{4})-(\d{2})$/
const RE_HEURE = /^(\d{2}):(\d{2})$/
const JOUR = 86400000
const HEURE = 3600000

function joursDuMois(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
function lireInstant(s) {
  if (typeof s !== 'string') return null
  const m = RE_INSTANT.exec(s)
  if (m === null) return null
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > joursDuMois(y, mo) || h > 23 || mi > 59 || se > 59) return null
  return Date.UTC(y, mo - 1, d, h, mi, se)
}
function lireDate(s) {
  if (typeof s !== 'string') return null
  const m = RE_DATE.exec(s)
  if (m === null) return null
  const [y, mo, d] = m.slice(1).map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > joursDuMois(y, mo)) return null
  return { y, mo, d }
}
function lireMois(s) {
  if (typeof s !== 'string') return null
  const m = RE_MOIS.exec(s)
  if (m === null) return null
  const [y, mo] = m.slice(1).map(Number)
  if (mo < 1 || mo > 12) return null
  return { y, mo }
}
const p2 = (x) => String(x).padStart(2, '0')
const p4 = (x) => String(x).padStart(4, '0')
function ecrireInstant(ms) {
  const d = new Date(ms)
  return `${p4(d.getUTCFullYear())}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}Z`
}
const ecrireDate = ({ y, mo, d }) => `${p4(y)}-${p2(mo)}-${p2(d)}`

// P9.R2 : 'UTC' +00:00 ; 'Europe/Paris' +01:00, +02:00 du dernier dimanche de mars 01:00:00Z
// (inclus) au dernier dimanche d'octobre 01:00:00Z (exclu).
function dernierDimanche(y, moisIndex0) {
  const dernier = new Date(Date.UTC(y, moisIndex0 + 1, 0))
  return Date.UTC(y, moisIndex0, dernier.getUTCDate() - dernier.getUTCDay(), 1, 0, 0)
}
function decalage(fuseau, ms) {
  if (fuseau !== 'Europe/Paris') return 0
  const y = new Date(ms).getUTCFullYear()
  return ms >= dernierDimanche(y, 2) && ms < dernierDimanche(y, 9) ? 2 * HEURE : HEURE
}
// Heure murale -> instant UTC (P9.R2) : inexistante lue a +01:00, ambigue = premiere occurrence (+02:00).
function muraleVersUtc(fuseau, y, mo, d, h, mi, se) {
  const murale = Date.UTC(y, mo - 1, d, h, mi, se)
  if (fuseau !== 'Europe/Paris') return murale
  const ete = murale - 2 * HEURE
  if (decalage(fuseau, ete) === 2 * HEURE) return ete
  return murale - HEURE
}
function locale(fuseau, ms) {
  const d = new Date(ms + decalage(fuseau, ms))
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), se: d.getUTCSeconds() }
}
function ecrireLocale(fuseau, ms) {
  const l = locale(fuseau, ms)
  const off = decalage(fuseau, ms) / HEURE
  return `${p4(l.y)}-${p2(l.mo)}-${p2(l.d)}T${p2(l.h)}:${p2(l.mi)}:${p2(l.se)}+${p2(off)}:00`
}
const moisLocal = (fuseau, ms) => {
  const l = locale(fuseau, ms)
  return `${p4(l.y)}-${p2(l.mo)}`
}
const dateLocale = (fuseau, ms) => ecrireDate(locale(fuseau, ms))
function debutDuMois(fuseau, y, mo) {
  return muraleVersUtc(fuseau, y, mo, 1, 0, 0, 0)
}
function moisSuivant(y, mo) {
  return mo === 12 ? { y: y + 1, mo: 1 } : { y, mo: mo + 1 }
}
// P22.R2 : meme instant UTC 12 mois civils plus tard ; 29 fevrier -> 28 fevrier.
function douzeMois(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear() + 1
  const mo = d.getUTCMonth()
  let j = d.getUTCDate()
  if (mo === 1 && j === 29) j = 28
  return Date.UTC(y, mo, j, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
}
function jourIso(y, mo, d) {
  return ((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7) + 1
}

/* ═══════════════════════════════════════════ argent (P7.R3, P15.R3, P9.R4) */

// remise = floor((brut x taux + 5000) / 10000) (P7.R3)
function remise(brut, tauxBp) {
  return N(fdiv(B(brut) * B(tauxBp) + 5000n, 10000n))
}
// P15.R3 : arrondi bancaire au centime.
function convertir(usd, rateMicro) {
  const n = B(usd) * B(rateMicro)
  const q = n / 1000000n
  const r = n - q * 1000000n
  const deux = 2n * r
  if (deux > 1000000n) return N(q + 1n)
  if (deux < 1000000n) return N(q)
  return N(q % 2n === 0n ? q : q + 1n)
}
const TAUX_NIVEAU = { none: 0, silver: 1000, gold: 2500 } // P7.R2
const RANG_ROLE = { member: 1, staff: 2, admin: 3 } // P17.R3

/* ═══════════════════════════════════════════════════════════ contrat */

// Operations introduites par periode (docs/api.md de chaque periode).
const OPERATIONS = [
  [1, ['create_slot', 'reserve', 'cancel', 'get_booking', 'get_slot']],
  [3, ['create_tenant']],
  [4, ['add_member']],
  [5, ['create_recurring', 'add_exception', 'list_occurrences']],
  [7, ['set_price', 'set_tier']],
  [8, ['top_up', 'get_wallet']],
  [9, ['set_timezone']],
  [10, ['mark_no_show']],
  [11, ['number_seats']],
  [13, ['close_slot']],
  [14, ['issue_invoices', 'list_documents']],
  [15, ['set_rate']],
  [16, ['change_price']],
  [17, ['merge_tenants']],
  [18, ['erase_member']],
  [19, ['report_occupancy', 'report_revenue']],
  [20, ['import_bookings']],
  [23, ['transfer_booking', 'exchange_bookings']],
]
function operationsV1(n) {
  const s = new Set()
  for (const [p, ops] of OPERATIONS) if (p <= n) for (const o of ops) s.add(o)
  return s
}
// P24.R2 : correspondance v1 <-> v2.
const OP_V2 = {
  reserve: 'create_reservation',
  cancel: 'cancel_reservation',
  get_booking: 'get_reservation',
  get_slot: 'get_session',
  create_slot: 'create_session',
  transfer_booking: 'transfer_reservation',
  exchange_bookings: 'exchange_reservations',
  import_bookings: 'import_reservations',
}
const OP_V1 = Object.fromEntries(Object.entries(OP_V2).map(([a, b]) => [b, a]))
const CLE_V2 = { booking_id: 'reservation_id', slot_id: 'session_id', slot_ids: 'session_ids', seats: 'quantity', with_booking_id: 'with_reservation_id' }
const CLE_V1 = Object.fromEntries(Object.entries(CLE_V2).map(([a, b]) => [b, a]))

function contientCle(v, table) {
  if (Array.isArray(v)) return v.some((x) => contientCle(x, table))
  if (estObjet(v)) return Object.keys(v).some((k) => Object.hasOwn(table, k) || contientCle(v[k], table))
  return false
}
function renommerCles(v, table) {
  if (Array.isArray(v)) return v.map((x) => renommerCles(x, table))
  if (estObjet(v)) {
    const o = {}
    for (const [k, x] of Object.entries(v)) o[Object.hasOwn(table, k) ? table[k] : k] = renommerCles(x, table)
    return o
  }
  return v
}
// Reponse rendue dans la forme d'une version (P24.R2) : seule l'erreur de premier niveau change de forme.
function enVersion(rep, version) {
  if (version !== 'v2') return rep
  const r = renommerCles(rep, CLE_V2)
  if (r.ok === false && typeof r.error === 'string') r.error = { code: r.error }
  return r
}

const echec = (code) => ({ ok: false, error: code })

/* ═══════════════════════════════════════════════════════════ etat */

function nouveauLocataire(id, proprietaire) {
  return {
    id,
    proprietaire: proprietaire ?? null,
    fuseau: 'UTC',
    membres: new Map(), // member_id -> {role, niveau}
    creneaux: new Map(),
    series: new Map(),
    reservations: new Map(),
    memo: new Map(), // request_id -> {rep, args}
    imports: new Map(), // import_id -> {rep, rows}
    portefeuilles: new Map(), // member_id -> {hist}
    suspensions: new Map(), // member_id -> ms
    absences: new Map(), // member_id -> [ms]
    niveaux: new Map(), // member_id -> tier (garde apres effacement)
    mouvements: [],
    moisEmis: new Set(),
    factures: [], // factures emises
    avoirs: [],
    seqAvoir: 0,
    seqPseudo: 0,
    pseudonymes: new Set(),
    taux: new Map(), // date -> rate_micro
    aEmis: false,
  }
}

export function creerPlateforme(options = {}) {
  const sans = new Set(options.sansClauses ?? [])
  const etat = {
    locataires: new Map([['default', nouveauLocataire('default', null)]]),
    reserves: new Set(['default']), // identifiants de locataire pris (P17.R1 : un absorbe reste reserve)
    rang: 0,
    seq: 0,
    ordreLot: 0,
    creation: 0,
  }
  const prochain = () => ++etat.seq

  /* ─────────────────────────────── portefeuille et lots (P8.R1, P22.R2) */

  function portefeuille(t, m) {
    let w = t.portefeuilles.get(m)
    if (w === undefined) {
      w = { hist: [] }
      t.portefeuilles.set(m, w)
    }
    return w
  }
  // Historique du portefeuille : entrees (+) et debits (-) de credits, dates (P8.R1, P17.R3, P22.R2).
  function crediter(t, m, at, montant) {
    if (montant <= 0) return
    portefeuille(t, m).hist.push({ t: at, d: montant, ordre: ++etat.ordreLot })
  }
  function debiter(t, m, at, montant) {
    if (montant <= 0) return
    portefeuille(t, m).hist.push({ t: at, d: -montant, ordre: ++etat.ordreLot })
  }
  // P22.R2 : les lots sont RECONSTITUES sur tout l'historique par la meme regle : chaque entree
  // forme un lot de 12 mois civils ; chaque debit consomme par expires_at croissant puis ordre
  // d'entree ; a partir de P22, un lot expire a expires_at (a instant egal, avant l'operation).
  // borne : on rejoue les evenements d'instant < borne (strict) ou <= borne (sinon).
  function reconstituer(w, borne, n, strict) {
    const evts = [...w.hist].sort((a, b) => a.t - b.t || a.ordre - b.ordre)
    const lots = []
    const expirations = []
    const tries = () => lots.filter((l) => l.reste > 0).sort((a, b) => a.exp - b.exp || a.ordre - b.ordre)
    const expirerJusqua = (ms, inclus) => {
      if (n < 22) return
      for (const l of tries()) {
        if (inclus ? l.exp <= ms : l.exp < ms) {
          expirations.push({ t: l.exp, montant: l.reste })
          l.reste = 0
        }
      }
    }
    for (const e of evts) {
      if (strict ? e.t >= borne : e.t > borne) break
      expirerJusqua(e.t, true)
      if (e.d > 0) lots.push({ acq: e.t, exp: douzeMois(e.t), reste: e.d, ordre: e.ordre })
      else {
        let r = -e.d
        for (const l of tries()) {
          if (r === 0) break
          const pris = Math.min(l.reste, r)
          l.reste -= pris
          r -= pris
        }
      }
    }
    expirerJusqua(borne, !strict)
    return { lots: tries(), expirations: expirations.sort((a, b) => a.t - b.t) }
  }
  const solde = (w, at, n) => reconstituer(w, at, n, false).lots.reduce((s, l) => s + l.reste, 0)
  const soldeA = (w, ms, n) => reconstituer(w, ms, n, true).lots.reduce((s, l) => s + l.reste, 0)
  function expirer() {
    /* les expirations se deduisent de l'historique (reconstituer) */
  }

  /* ─────────────────────────────── mouvements (P14.R1) */

  function mouvement(t, mv) {
    t.mouvements.push({ ...mv, seq: prochain() })
  }

  /* ─────────────────────────────── creneaux et reservations */

  function creneau(t, id) {
    if (typeof id !== 'string') return undefined
    const c = t.creneaux.get(id)
    return c === undefined || c.retire ? undefined : c
  }
  function reservation(t, id) {
    if (typeof id !== 'string') return undefined
    return t.reservations.get(id)
  }
  const deCreneau = (t, c) => [...c.toutes].map((id) => t.reservations.get(id))
  function occupe(t, c) {
    let s = 0
    for (const id of c.confirmees) s += t.reservations.get(id).places
    return s
  }
  // P13.R1 : plafond d'admission.
  function plafond(c, n) {
    if (n < 13 || c.numerote) return c.capacite
    return c.capacite + Math.floor((c.capacite * 1000) / 10000)
  }
  const disponible = (t, c, n) => plafond(c, n) - occupe(t, c)
  function placesLibres(t, c) {
    const prises = new Set()
    for (const id of c.confirmees) for (const s of t.reservations.get(id).numeros ?? []) prises.add(s)
    const out = []
    for (let i = 1; i <= c.capacite; i += 1) if (!prises.has(i)) out.push(i)
    return out
  }
  // P11.R3 : bloc libre de plus petit premier numero.
  function bloc(t, c, k) {
    const libres = new Set(placesLibres(t, c))
    for (let i = 1; i + k - 1 <= c.capacite; i += 1) {
      let ok = true
      for (let j = i; j < i + k; j += 1) if (!libres.has(j)) { ok = false; break }
      if (ok) return Array.from({ length: k }, (_, x) => i + x)
    }
    return null
  }
  // P15.R2 : taux applicable a un instant.
  function tauxA(t, ms) {
    const d = dateLocale(t.fuseau, ms)
    let meilleur = null
    for (const [date, r] of t.taux) if (date <= d && (meilleur === null || date > meilleur[0])) meilleur = [date, r]
    return meilleur === null ? null : meilleur[1]
  }
  // Tient (P11.R4/P12.R1, P13.R1, P15.R6).
  function tient(t, c, b, n) {
    if (n >= 15 && c.devise === 'USD' && tauxA(t, ctxAt.at) === null) return false
    if (n >= 11 && c.numerote) return bloc(t, c, b.places) !== null
    return b.places <= disponible(t, c, n)
  }
  const ctxAt = { at: 0 }

  // Confirmation : montant (P7.R3/P15.R6/P22.R1), paiement (P7.R4/P8.R2), instant et rang (P1.R3).
  function confirmer(t, c, b, at, n) {
    b.statut = 'confirmed'
    b.confirmeA = at
    b.rang = ++etat.rang
    b.payeur = b.membre
    c.confirmees.add(b.id)
    if (n >= 11 && c.numerote) b.numeros = bloc(t, c, b.places)
    let montant = 0
    b.tauxRemise = 0
    b.devise = 'EUR'
    if (n >= 7) {
      const brut = b.places * c.prix
      const taux = n >= 22 ? 0 : TAUX_NIVEAU[t.niveaux.get(b.membre) ?? 'none'] ?? 0
      b.tauxRemise = taux
      const net = brut - remise(brut, taux)
      if (n >= 15 && c.devise === 'USD') {
        const r = tauxA(t, at)
        b.devise = 'USD'
        b.original = net
        b.rateMicro = r
        montant = convertir(net, r)
      } else montant = net
    }
    b.A = montant
    let credits = 0
    if (n >= 8) {
      expirer(t, at, n)
      credits = Math.min(solde(portefeuille(t, b.membre), at, n), montant)
      debiter(t, b.membre, at, credits)
    }
    b.C = credits
    b.D = montant - credits
    if (montant > 0) mouvement(t, { membre: b.membre, instant: at, type: 'charge', booking_id: b.id, montant, credits: b.C, carte: b.D })
  }

  // Promotion premier-qui-tient (P2.R2, P6.R4, P11.R4, P12.R1).
  function promouvoir(t, c, at, n) {
    const promus = []
    if (n < 2 || at >= c.debut) return promus
    ctxAt.at = at
    let encore = true
    while (encore) {
      encore = false
      for (let i = 0; i < c.file.length; i += 1) {
        const b = t.reservations.get(c.file[i])
        const tientIci = n < 6 ? occupe(t, c) + 1 <= c.capacite : tient(t, c, b, n)
        if (tientIci) {
          c.file.splice(i, 1)
          confirmer(t, c, b, at, n)
          promus.push(b.id)
          encore = true
          break
        }
      }
    }
    return promus
  }

  // Mois facture de la charge (P14.R4).
  function moisFacture(t, b) {
    return b.confirmeA !== undefined && t.moisEmis.has(moisLocal(t.fuseau, b.confirmeA))
  }
  // Document d'un remboursement R (P14.R1, P14.R4, P16.R3) ; rend credit_note_id ou null.
  function documenter(t, b, at, n, R, rc, rd, raison) {
    if (R <= 0) return null
    const payeur = n >= 23 ? b.payeur ?? b.membre : b.membre
    if (n >= 14 && moisFacture(t, b)) {
      t.seqAvoir += 1
      const id = `AV-${p4(t.seqAvoir)}`
      t.avoirs.push({
        credit_note_id: id,
        invoice_id: `INV-${moisLocal(t.fuseau, b.confirmeA)}-${payeur}`,
        member_id: payeur,
        booking_id: b.id,
        reason: raison,
        month: moisLocal(t.fuseau, at),
        issued_at: ecrireInstant(at),
        amount_cents: R,
        credits_cents: rc,
        card_cents: rd,
      })
      return id
    }
    mouvement(t, { membre: payeur, instant: at, type: raison === 'price_change' ? 'adjustment' : 'refund', booking_id: b.id, montant: R, credits: rc, carte: rd })
    return null
  }
  // Remboursement de R sur une reservation (P8.R4, P9.R4, P23.R4) : r_c au portefeuille du payeur.
  function rembourser(t, b, at, n, R) {
    const A = b.A
    const rc = A === 0 ? 0 : N(fdiv(B(R) * B(b.C), B(A)))
    const rd = R - rc
    b.A -= R
    b.C -= rc
    b.D -= rd
    const payeur = n >= 23 ? b.payeur ?? b.membre : b.membre
    if (rc > 0) crediter(t, payeur, at, rc)
    return { rc, rd }
  }
  function liberer(t, c, b) {
    c.confirmees.delete(b.id)
  }
  function retirerDeLaFile(c, b) {
    const i = c.file.indexOf(b.id)
    if (i >= 0) c.file.splice(i, 1)
  }

  // P9.R3 : palier d'annulation en heure murale du site.
  function palier(t, c, at, n) {
    if (n < 9) return 10000
    const l = locale(t.fuseau, c.debut)
    const recul = (jours) => {
      const d = new Date(Date.UTC(l.y, l.mo - 1, l.d - jours))
      return muraleVersUtc(t.fuseau, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), l.h, l.mi, l.se)
    }
    if (at < recul(2)) return 10000
    if (at < recul(1)) return 5000
    return 0
  }

  /* ─────────────────────────────── vues */

  function vueReservation(t, b, n) {
    const v = { ok: true, booking_id: b.id, member_id: b.membre, slot_id: b.creneau, status: b.statut }
    const c = t.creneaux.get(b.creneau)
    if (n >= 2 && b.statut === 'waiting' && c !== undefined) v.position = c.file.indexOf(b.id) + 1
    if (n >= 6) v.seats = b.places
    if (n >= 7 && b.statut !== 'waiting') v.amount_cents = b.A ?? 0
    if (n >= 8 && b.statut !== 'waiting') {
      v.paid_credits_cents = b.C ?? 0
      v.paid_card_cents = b.D ?? 0
    }
    if (n >= 10) v.no_show = b.absent === true
    if (n >= 11 && b.statut === 'confirmed' && c !== undefined && c.numerote && b.numeros) v.seat_numbers = [...b.numeros]
    if (n >= 15 && b.devise === 'USD') {
      v.price_currency = 'USD'
      v.original_amount_cents = b.original
      v.rate_micro = b.rateMicro
    }
    if (n >= 17) v.origin = { tenant_id: b.origine.tenant_id, booking_id: b.origine.booking_id }
    if (n >= 23) {
      v.payer_member_id = b.payeur ?? null
      v.transfers = b.transferts.map((x) => ({ ...x }))
    }
    return v
  }
  function vueCreneau(t, c, n) {
    const v = { ok: true, slot_id: c.id, capacity: c.capacite, starts_at: ecrireInstant(c.debut), booked: occupe(t, c), available: 0 }
    v.available = (n >= 13 ? plafond(c, n) : c.capacite) - v.booked
    if (n >= 2) v.waiting = [...c.file]
    if (n >= 9) v.local_starts_at = ecrireLocale(t.fuseau, c.debut)
    if (n >= 11) {
      v.numbered = c.numerote
      if (c.numerote) v.free_seats = placesLibres(t, c)
    }
    if (n >= 13) {
      v.overbook_limit = plafond(c, n)
      v.closed = c.clos
    }
    return v
  }

  /* ─────────────────────────────── membres (P4.R1, P18.R3) */

  function role(t, m, n) {
    if (n < 4 || typeof m !== 'string') return null
    if (t.proprietaire !== null && m === t.proprietaire) return 'admin'
    return t.membres.get(m)?.role ?? null
  }
  const estMembre = (t, m, n) => role(t, m, n) !== null

  /* ─────────────────────────────── reserve (P1.R2 et suivantes) */

  function argsNormalises(a) {
    return { member_id: a.member_id, slot_id: a.slot_id, seats: a.seats === undefined ? 1 : a.seats }
  }
  const memesArgs = (x, y) => JSON.stringify(x) === JSON.stringify(y)

  // Rend {rep, memorise:boolean, cree:booking|null, doublon:boolean}
  function reserver(t, a, at, n) {
    const rid = a.request_id
    const norm = argsNormalises(a)
    // (1) idempotence (P1.R4, P21.R1)
    if (typeof rid === 'string' && t.memo.has(rid)) {
      const m = t.memo.get(rid)
      if (n >= 21 && !memesArgs(m.args, norm)) return { rep: echec('IDEMPOTENCY_CONFLICT'), doublon: false, conflit: true }
      return { rep: clone(m.rep), doublon: true }
    }
    const fin = (rep) => {
      if (typeof rid === 'string') t.memo.set(rid, { rep: clone(rep), args: norm })
      return { rep, doublon: false }
    }
    if (!chaineNonVide(rid)) return { rep: echec('INVALID_ARGUMENT'), doublon: false, nonMemorise: true }
    // (2) creneau inconnu
    const c = creneau(t, a.slot_id)
    if (c === undefined) return fin(echec('NOT_FOUND'))
    // P4.R4 / P18.R3 : membre inconnu
    if (n >= 4 && !estMembre(t, a.member_id, n)) return fin(echec('NOT_FOUND'))
    // P10.R3 : suspension
    if (n >= 10) {
      const s = t.suspensions.get(a.member_id)
      if (s !== undefined && s !== null && at < s) return fin(echec('SUSPENDED'))
    }
    // (3) SLOT_CLOSED
    if (at >= c.debut) return fin(echec('SLOT_CLOSED'))
    let places = 1
    if (n >= 6) {
      // P6.R1 / P13.R1 : seats
      if (a.seats !== undefined) {
        if (!entier(a.seats) || a.seats < 1) return fin(echec('INVALID_ARGUMENT'))
        places = a.seats
      }
      // P6.R2 : groupe trop grand
      if (!sans.has('P6.R2') && places > c.capacite) return fin(echec('GROUP_TOO_LARGE'))
    }
    // (4) ALREADY_BOOKED (P1.R2, P2.R4)
    for (const b of deCreneau(t, c)) {
      if (b.membre === a.member_id && (b.statut === 'confirmed' || b.statut === 'waiting')) return fin(echec('ALREADY_BOOKED'))
    }
    // P15.R6 : RATE_UNAVAILABLE juste avant l'admission
    if (n >= 15 && c.devise === 'USD' && tauxA(t, at) === null) return fin(echec('RATE_UNAVAILABLE'))
    // (5) admission
    const b = {
      id: rid,
      membre: a.member_id,
      creneau: c.id,
      statut: 'waiting',
      places,
      creation: ++etat.creation,
      A: 0,
      C: 0,
      D: 0,
      F: 0,
      origine: { tenant_id: t.id, booking_id: rid },
      payeur: null,
      transferts: [],
      absent: false,
    }
    ctxAt.at = at
    let admis
    if (n < 2) admis = occupe(t, c) + 1 <= c.capacite
    else if (n < 6) admis = occupe(t, c) + 1 <= c.capacite
    else admis = tient(t, c, b, n)
    if (!admis && n < 2) return fin(echec('FULL'))
    t.reservations.set(b.id, b)
    c.toutes.add(b.id)
    if (admis) confirmer(t, c, b, at, n)
    else c.file.push(b.id)
    const rep = vueReservation(t, b, n)
    const r = fin(rep)
    r.cree = b
    return r
  }

  /* ─────────────────────────────── annulation (P1.R6, P8.R3/R4, P9.R3/R4) */

  function annuler(t, a, at, n, acteur, roleActeur) {
    const b = reservation(t, a.booking_id)
    if (b === undefined) return echec('NOT_FOUND')
    if (n >= 4 && roleActeur === 'member' && b.membre !== acteur) return echec('FORBIDDEN')
    if (b.statut === 'cancelled' || b.statut === 'bumped') return echec('ALREADY_CANCELLED')
    const c = t.creneaux.get(b.creneau)
    const nPlaces = b.places
    let k = nPlaces
    if (n >= 8 && a.seats !== undefined) {
      if (!entier(a.seats) || a.seats < 1 || a.seats > nPlaces) return echec('INVALID_ARGUMENT')
      if (a.seats < nPlaces && b.statut !== 'confirmed') return echec('INVALID_ARGUMENT')
      k = a.seats
    }
    const partielle = k < nPlaces
    const taux = palier(t, c, at, n)
    expirer(t, at, n)
    let R = 0
    let rc = 0
    let rd = 0
    let avoir = null
    let promus = []
    if (b.statut === 'waiting') {
      retirerDeLaFile(c, b)
      b.statut = 'cancelled'
    } else if (!partielle) {
      R = N(fdiv(B(b.A) * B(taux), 10000n))
      ;({ rc, rd } = rembourser(t, b, at, n, R))
      b.statut = 'cancelled'
      liberer(t, c, b)
      avoir = documenter(t, b, at, n, R, rc, rd, 'cancellation')
      promus = promouvoir(t, c, at, n)
    } else {
      const A = b.A
      R = N(fdiv(B(A) * B(k) * B(taux), B(nPlaces) * 10000n))
      b.F += N(fdiv(B(A) * B(k), B(nPlaces))) - R
      ;({ rc, rd } = rembourser(t, b, at, n, R))
      b.places = nPlaces - k
      if (b.numeros) b.numeros = b.numeros.slice(0, b.places)
      avoir = documenter(t, b, at, n, R, rc, rd, 'cancellation')
      promus = promouvoir(t, c, at, n)
    }
    const rep = { ok: true, booking_id: b.id, status: partielle ? 'confirmed' : 'cancelled' }
    if (partielle) rep.seats = b.places
    if (n >= 2) rep.promoted = promus
    if (n >= 7) rep.refunded_cents = R
    if (n >= 8) rep.refund = { credits_cents: rc, card_cents: rd }
    if (n >= 9) rep.refund_rate_bp = taux
    if (partielle && n >= 11 && c.numerote) rep.seat_numbers = [...b.numeros]
    if (n >= 14) rep.credit_note_id = avoir
    return rep
  }

  /* ─────────────────────────────── factures (P14.R2, P14.R3, P22.R4, P23.R5, P18.R1) */

  function facture(t, m, mois, n, at) {
    const { y, mo } = lireMois(mois)
    const debut = debutDuMois(t.fuseau, y, mo)
    const s = moisSuivant(y, mo)
    const fin = debutDuMois(t.fuseau, s.y, s.mo)
    const w = portefeuille(t, m)
    const expirations = reconstituer(w, at, n, false)
      .expirations.filter((x) => x.t >= debut && x.t < fin)
      .map((x) => ({ membre: m, instant: x.t, type: 'expiry', booking_id: null, montant: x.montant, credits: 0, carte: 0, seq: 0 }))
    const mvts = [...t.mouvements.filter((x) => x.membre === m && x.instant >= debut && x.instant < fin), ...expirations]
      .sort((a, b) => a.instant - b.instant || (a.type === 'expiry' ? 0 : 1) - (b.type === 'expiry' ? 0 : 1) || a.seq - b.seq)
    const avoirs = t.avoirs.filter((x) => x.member_id === m && x.month === mois)
    if (mvts.length === 0 && avoirs.length === 0) return null
    let charges = 0, refunds = 0, carte = 0, credits = 0, topups = 0, comp = 0, expire = 0, wref = 0
    for (const x of mvts) {
      if (x.type === 'charge' || x.type === 'fee') {
        charges += x.montant
        carte += x.carte
        credits += x.credits
      } else if (x.type === 'refund' || x.type === 'adjustment') {
        refunds += x.montant
        carte -= x.carte
        credits -= x.credits
      } else if (x.type === 'top_up') topups += x.montant
      else if (x.type === 'compensation') comp += x.montant
      else if (x.type === 'expiry') expire += x.montant
      else if (x.type === 'wallet_refund') wref += x.montant
    }
    const f = {
      invoice_id: `INV-${mois}-${m}`,
      member_id: m,
      month: mois,
      lines: mvts.map((x) => ({ type: x.type, booking_id: x.booking_id ?? null, amount_cents: x.montant })),
      charges_cents: charges,
      refunds_cents: refunds,
      total_cents: charges - refunds,
      card_cents: carte,
      credits_used_cents: credits,
      top_ups_cents: topups,
      compensations_cents: comp,
      credit_notes_credits_cents: avoirs.reduce((s2, x) => s2 + x.credits_cents, 0),
      opening_balance_cents: soldeA(w, debut, n),
      closing_balance_cents: soldeA(w, fin, n),
    }
    if (n >= 22) f.expired_cents = expire
    if (n >= 18) f.wallet_refunds_cents = wref
    return f
  }

  function personnes(t) {
    const s = new Set()
    for (const x of t.mouvements) s.add(x.membre)
    for (const x of t.avoirs) s.add(x.member_id)
    for (const m of t.portefeuilles.keys()) s.add(m)
    return [...s].sort(cmp)
  }

  /* ─────────────────────────────── anonymisation (P18.R2) */

  const CLES_MEMBRE = new Set(['member_id', 'payer_member_id', 'from_member_id', 'to_member_id'])
  function anonymiser(v, ancien, nouveau) {
    if (Array.isArray(v)) return v.map((x) => anonymiser(x, ancien, nouveau))
    if (estObjet(v)) {
      const o = {}
      for (const [k, x] of Object.entries(v)) o[k] = CLES_MEMBRE.has(k) && x === ancien ? nouveau : anonymiser(x, ancien, nouveau)
      return o
    }
    return v
  }
  function renommerFacture(id, ancien, nouveau) {
    const suffixe = `-${ancien}`
    if (typeof id === 'string' && id.startsWith('INV-') && id.endsWith(suffixe) && id.length === 4 + 7 + 1 + ancien.length) return `INV-${id.slice(4, 11)}-${nouveau}`
    return id
  }

  /* ─────────────────────────────── operations */

  function argsDe(req) {
    return estObjet(req.args) ? req.args : {}
  }

  const OPS = {}

  OPS.create_slot = (t, a, at, n) => {
    const debut = lireInstant(a.starts_at)
    if (!chaineNonVide(a.slot_id) || !entier(a.capacity) || a.capacity < 1 || a.capacity > 10000 || debut === null) return echec('INVALID_ARGUMENT')
    if (creneau(t, a.slot_id) !== undefined) return echec('ALREADY_EXISTS')
    t.creneaux.set(a.slot_id, nouveauCreneau(a.slot_id, a.capacity, debut))
    return { ok: true, slot_id: a.slot_id }
  }
  function nouveauCreneau(id, capacite, debut) {
    return { id, capacite, debut, prix: 0, devise: 'EUR', numerote: false, clos: false, file: [], confirmees: new Set(), toutes: new Set(), retire: false }
  }

  OPS.reserve = (t, a, at, n) => reserver(t, a, at, n).rep

  OPS.cancel = (t, a, at, n, ctx) => annuler(t, a, at, n, ctx.acteur, ctx.role)

  OPS.get_booking = (t, a, at, n, ctx) => {
    const b = reservation(t, a.booking_id)
    if (b === undefined) return echec('NOT_FOUND')
    if (n >= 4 && ctx.role === 'member' && b.membre !== ctx.acteur) return echec('FORBIDDEN')
    return vueReservation(t, b, n)
  }

  OPS.get_slot = (t, a, at, n) => {
    const c = creneau(t, a.slot_id)
    if (c === undefined) return echec('NOT_FOUND')
    return vueCreneau(t, c, n)
  }

  OPS.add_member = (t, a, at, n) => {
    if (!chaineNonVide(a.member_id) || typeof a.role !== 'string' || !Object.hasOwn(RANG_ROLE, a.role)) return echec('INVALID_ARGUMENT')
    if (a.member_id === t.proprietaire) return echec('INVALID_ARGUMENT')
    if (n >= 18 && t.pseudonymes.has(a.member_id)) return echec('NOT_FOUND')
    const deja = t.membres.get(a.member_id)
    if (deja) deja.role = a.role
    else t.membres.set(a.member_id, { role: a.role })
    return { ok: true, member_id: a.member_id, role: a.role }
  }

  // P5.R1 / P9.R5
  OPS.create_recurring = (t, a, at, n) => {
    const de = lireDate(a.from_date)
    const a2 = lireDate(a.until_date)
    const h = typeof a.start_time === 'string' ? RE_HEURE.exec(a.start_time) : null
    const hh = h ? Number(h[1]) : -1
    const mm = h ? Number(h[2]) : -1
    const invalide =
      !chaineNonVide(a.series_id) ||
      !entier(a.weekday) || a.weekday < 1 || a.weekday > 7 ||
      h === null || hh > 23 || mm > 59 ||
      !entier(a.capacity) || a.capacity < 1 || a.capacity > 10000 ||
      de === null || a2 === null
    if (invalide) return echec('INVALID_ARGUMENT')
    const d0 = Date.UTC(de.y, de.mo - 1, de.d)
    const d1 = Date.UTC(a2.y, a2.mo - 1, a2.d)
    if (d0 > d1 || (d1 - d0) / JOUR > 365) return echec('INVALID_ARGUMENT')
    const occ = []
    for (let x = d0; x <= d1; x += JOUR) {
      const d = new Date(x)
      const y = d.getUTCFullYear()
      const mo = d.getUTCMonth() + 1
      const j = d.getUTCDate()
      if (jourIso(y, mo, j) !== a.weekday) continue
      const date = ecrireDate({ y, mo, d: j })
      const debut = n >= 9 ? muraleVersUtc(t.fuseau, y, mo, j, hh, mm, 0) : Date.UTC(y, mo - 1, j, hh, mm, 0)
      occ.push({ id: `${a.series_id}@${date}`, date, debut })
    }
    if (occ.length === 0) return echec('INVALID_ARGUMENT')
    if (t.series.has(a.series_id) || occ.some((o) => creneau(t, o.id) !== undefined)) return echec('ALREADY_EXISTS')
    t.series.set(a.series_id, { id: a.series_id, occurrences: occ.map((o) => o.id), dates: occ.map((o) => o.date), exceptions: new Set() })
    for (const o of occ) {
      const c = nouveauCreneau(o.id, a.capacity, o.debut)
      c.serie = a.series_id
      c.date = o.date
      t.creneaux.set(o.id, c)
    }
    return { ok: true, series_id: a.series_id, slot_ids: occ.map((o) => o.id) }
  }

  OPS.add_exception = (t, a, at, n) => {
    const s = typeof a.series_id === 'string' ? t.series.get(a.series_id) : undefined
    if (s === undefined) return echec('NOT_FOUND')
    const i = typeof a.date === 'string' ? s.dates.indexOf(a.date) : -1
    if (i < 0 || s.exceptions.has(a.date)) return echec('NOT_FOUND')
    const c = t.creneaux.get(s.occurrences[i])
    if (c === undefined || c.retire) return echec('NOT_FOUND')
    s.exceptions.add(a.date)
    c.retire = true
    expirer(t, at, n)
    const annulees = deCreneau(t, c)
      .filter((b) => b.statut === 'confirmed' || b.statut === 'waiting')
      .sort((x, y) => x.creation - y.creation)
    for (const b of annulees) {
      if (b.statut === 'confirmed') {
        const R = b.A
        const { rc, rd } = rembourser(t, b, at, n, R)
        liberer(t, c, b)
        b.statut = 'cancelled'
        documenter(t, b, at, n, R, rc, rd, 'cancellation')
      } else {
        retirerDeLaFile(c, b)
        b.statut = 'cancelled'
      }
    }
    return { ok: true, series_id: s.id, date: a.date, cancelled: annulees.map((b) => b.id) }
  }

  OPS.list_occurrences = (t, a) => {
    const s = typeof a.series_id === 'string' ? t.series.get(a.series_id) : undefined
    if (s === undefined) return echec('NOT_FOUND')
    const ids = s.occurrences.filter((id, i) => !s.exceptions.has(s.dates[i]))
    return { ok: true, series_id: s.id, slot_ids: ids }
  }

  const prixValide = (p) => entier(p) && p >= 0 && p <= 100000000

  OPS.set_price = (t, a, at, n) => {
    const c = creneau(t, a.slot_id)
    if (c === undefined) return echec('NOT_FOUND')
    if (!prixValide(a.price_cents)) return echec('INVALID_ARGUMENT')
    let devise = 'EUR'
    if (n >= 15 && a.currency !== undefined) {
      if (a.currency !== 'EUR' && a.currency !== 'USD') return echec('INVALID_ARGUMENT')
      devise = a.currency
    }
    c.prix = a.price_cents
    if (n >= 15) c.devise = devise
    const rep = { ok: true, slot_id: c.id, price_cents: a.price_cents }
    if (n >= 15) rep.currency = devise
    return rep
  }

  OPS.set_tier = (t, a, at, n) => {
    if (!estMembre(t, a.member_id, n)) return echec('NOT_FOUND')
    if (typeof a.tier !== 'string' || !Object.hasOwn(TAUX_NIVEAU, a.tier)) return echec('INVALID_ARGUMENT')
    t.niveaux.set(a.member_id, a.tier)
    return { ok: true, member_id: a.member_id, tier: a.tier }
  }

  OPS.top_up = (t, a, at, n) => {
    const montantOk = entier(a.amount_cents) && a.amount_cents >= 1 && a.amount_cents <= 100000000
    let devise = 'EUR'
    if (n >= 15 && a.currency !== undefined) {
      if (a.currency !== 'EUR' && a.currency !== 'USD') return echec('INVALID_ARGUMENT')
      devise = a.currency
    }
    if (!montantOk) return echec('INVALID_ARGUMENT')
    if (!estMembre(t, a.member_id, n)) return echec('NOT_FOUND')
    let credite = a.amount_cents
    let r = null
    if (devise === 'USD') {
      r = tauxA(t, at)
      if (r === null) return echec('RATE_UNAVAILABLE')
      credite = convertir(a.amount_cents, r)
    }
    expirer(t, at, n)
    crediter(t, a.member_id, at, credite)
    mouvement(t, { membre: a.member_id, instant: at, type: 'top_up', booking_id: null, montant: credite, credits: 0, carte: 0 })
    const rep = { ok: true, member_id: a.member_id, balance_cents: solde(portefeuille(t, a.member_id), at, n) }
    if (n >= 15) {
      rep.credited_cents = credite
      rep.currency = devise
      if (devise === 'USD') rep.rate_micro = r
    }
    if (n >= 22) rep.expires_at = ecrireInstant(douzeMois(at))
    return rep
  }

  function vueLots(w, at, n) {
    return reconstituer(w, at, n, false)
      .lots.map((l) => ({ acquired_at: ecrireInstant(l.acq), expires_at: ecrireInstant(l.exp), remaining_cents: l.reste }))
  }

  OPS.get_wallet = (t, a, at, n, ctx) => {
    if (ctx.role === 'member' && a.member_id !== ctx.acteur) return echec('FORBIDDEN')
    const pseudo = n >= 18 && t.pseudonymes.has(a.member_id) && ctx.role !== 'member'
    if (!estMembre(t, a.member_id, n) && !pseudo) return echec('NOT_FOUND')
    expirer(t, at, n)
    const w = portefeuille(t, a.member_id)
    const rep = { ok: true, member_id: a.member_id, balance_cents: solde(w, at, n) }
    if (n >= 22) rep.lots = vueLots(w, at, n)
    return rep
  }

  OPS.set_timezone = (t, a, at, n) => {
    if (a.timezone !== 'UTC' && a.timezone !== 'Europe/Paris') return echec('INVALID_ARGUMENT')
    if (n >= 14 && t.aEmis) return echec('INVALID_ARGUMENT')
    t.fuseau = a.timezone
    return { ok: true, tenant_id: t.id, timezone: a.timezone }
  }

  OPS.mark_no_show = (t, a, at, n) => {
    const b = reservation(t, a.booking_id)
    if (b === undefined) return echec('NOT_FOUND')
    if (b.statut !== 'confirmed') return echec('INVALID_ARGUMENT')
    const c = t.creneaux.get(b.creneau)
    if (at < c.debut) return echec('INVALID_ARGUMENT')
    if (b.absent) return echec('ALREADY_EXISTS')
    b.absent = true
    const T = c.debut
    const liste = t.absences.get(b.membre) ?? []
    liste.push(T)
    t.absences.set(b.membre, liste)
    const n30 = liste.filter((x) => x > T - 30 * JOUR && x <= T).length
    let s = t.suspensions.get(b.membre) ?? null
    if (n30 >= 3) {
      const fin = at + 7 * JOUR
      s = s === null ? fin : Math.max(s, fin)
      t.suspensions.set(b.membre, s)
    }
    return { ok: true, booking_id: b.id, member_id: b.membre, absences_30d: n30, suspended_until: s === null ? null : ecrireInstant(s) }
  }

  OPS.number_seats = (t, a, at, n) => {
    const c = creneau(t, a.slot_id)
    if (c === undefined) return echec('NOT_FOUND')
    if (c.numerote) return echec('ALREADY_EXISTS')
    if (at >= c.debut) return echec('SLOT_CLOSED')
    if (occupe(t, c) > c.capacite) return echec('INVALID_ARGUMENT')
    const bs = [...c.confirmees].map((id) => t.reservations.get(id)).sort((x, y) => y.places - x.places || cmp(x.id, y.id))
    let suivante = 1
    const affect = []
    for (const b of bs) {
      b.numeros = Array.from({ length: b.places }, (_, i) => suivante + i)
      suivante += b.places
      affect.push({ booking_id: b.id, seat_numbers: [...b.numeros] })
    }
    c.numerote = true
    return { ok: true, slot_id: c.id, assignments: affect }
  }

  OPS.close_slot = (t, a, at, n) => {
    const c = creneau(t, a.slot_id)
    if (c === undefined) return echec('NOT_FOUND')
    if (at < c.debut) return echec('INVALID_ARGUMENT')
    if (c.clos) return echec('ALREADY_CLOSED')
    c.clos = true
    expirer(t, at, n)
    const expired = [...c.file]
    for (const id of expired) t.reservations.get(id).statut = 'cancelled'
    c.file = []
    const bumped = []
    let compensation = 0
    while (occupe(t, c) > c.capacite) {
      const b = [...c.confirmees].map((id) => t.reservations.get(id)).sort((x, y) => y.rang - x.rang)[0]
      const R = b.A
      const { rc, rd } = rembourser(t, b, at, n, R)
      liberer(t, c, b)
      b.statut = 'bumped'
      documenter(t, b, at, n, R, rc, rd, 'bump')
      const comp = 1000 * b.places
      crediter(t, b.membre, at, comp)
      mouvement(t, { membre: b.membre, instant: at, type: 'compensation', booking_id: b.id, montant: comp, credits: 0, carte: 0 })
      compensation += comp
      bumped.push(b.id)
    }
    return { ok: true, slot_id: c.id, expired, bumped, compensation_cents: compensation }
  }

  OPS.issue_invoices = (t, a, at, n) => {
    const m = lireMois(a.month)
    if (m === null) return echec('INVALID_ARGUMENT')
    const s = moisSuivant(m.y, m.mo)
    if (at < debutDuMois(t.fuseau, s.y, s.mo)) return echec('INVALID_ARGUMENT')
    if (t.moisEmis.has(a.month)) return echec('ALREADY_EXISTS')
    expirer(t, at, n)
    const ids = []
    for (const p of personnes(t)) {
      const f = facture(t, p, a.month, n, at)
      if (f === null) continue
      t.factures.push(f)
      ids.push(f.invoice_id)
    }
    t.moisEmis.add(a.month)
    t.aEmis = true
    return { ok: true, month: a.month, invoice_ids: ids }
  }

  OPS.list_documents = (t, a, at, n, ctx) => {
    if (ctx.role === 'member' && a.member_id !== ctx.acteur) return echec('FORBIDDEN')
    const pseudo = n >= 18 && t.pseudonymes.has(a.member_id) && ctx.role !== 'member'
    if (!estMembre(t, a.member_id, n) && !pseudo) return echec('NOT_FOUND')
    const invoices = t.factures.filter((f) => f.member_id === a.member_id).sort((x, y) => cmp(x.month, y.month)).map(clone)
    const notes = t.avoirs.filter((x) => x.member_id === a.member_id).sort((x, y) => cmp(x.credit_note_id, y.credit_note_id)).map(clone)
    return { ok: true, member_id: a.member_id, invoices, credit_notes: notes }
  }

  OPS.set_rate = (t, a) => {
    const rOk = entier(a.rate_micro) && a.rate_micro >= 1 && a.rate_micro <= 10000000
    if (a.currency !== 'USD' || lireDate(a.date) === null || !rOk) return echec('INVALID_ARGUMENT')
    if (t.taux.has(a.date)) return echec('ALREADY_EXISTS')
    t.taux.set(a.date, a.rate_micro)
    return { ok: true, currency: 'USD', date: a.date, rate_micro: a.rate_micro }
  }

  OPS.change_price = (t, a, at, n) => {
    const c = creneau(t, a.slot_id)
    if (c === undefined) return echec('NOT_FOUND')
    if (!prixValide(a.price_cents)) return echec('INVALID_ARGUMENT')
    const ef = lireInstant(a.effective_from)
    if (ef === null || ef > at) return echec('INVALID_ARGUMENT')
    c.prix = a.price_cents
    expirer(t, at, n)
    const adjusted = []
    const bs = [...c.confirmees].map((id) => t.reservations.get(id)).filter((b) => b.confirmeA >= ef).sort((x, y) => x.rang - y.rang)
    for (const b of bs) {
      if ((b.devise ?? 'EUR') !== c.devise) continue
      const brut = b.places * c.prix
      const net = brut - remise(brut, b.tauxRemise ?? 0)
      const Ap = (b.devise === 'USD' ? convertir(net, b.rateMicro) : net) + b.F
      const A = b.A
      if (Ap >= A) continue
      const T = A - Ap
      const { rc, rd } = rembourser(t, b, at, n, T)
      const avoir = documenter(t, b, at, n, T, rc, rd, 'price_change')
      adjusted.push({ booking_id: b.id, refunded_cents: T, refund: { credits_cents: rc, card_cents: rd }, credit_note_id: avoir })
    }
    return { ok: true, slot_id: c.id, price_cents: a.price_cents, adjusted }
  }

  OPS.merge_tenants = (t, a, at, n, ctx) => {
    const sid = a.source_tenant_id
    const s = typeof sid === 'string' ? etat.locataires.get(sid) : undefined
    if (s === undefined) return echec('NOT_FOUND')
    if (s === t) return echec('INVALID_ARGUMENT')
    if (role(s, ctx.acteur, n) !== 'admin') return echec('FORBIDDEN')
    if (s.aEmis || t.aEmis) return echec('INVALID_ARGUMENT')
    const pre = (x) => `${sid}:${x}`
    // espaces de noms (P17.R2)
    const renamed = []
    const slotsCibles = (L) => new Set([...L.creneaux.values()].filter((c) => !c.retire).map((c) => c.id))
    const slotsT = slotsCibles(t)
    const slotsS = slotsCibles(s)
    const renSlot = new Map()
    const renSerie = new Map()
    for (const [id, se] of s.series) {
      // occurrences courantes : une occurrence exceptee n'a plus de creneau (P5.R2)
      const courantes = se.occurrences.filter((o, i) => !se.exceptions.has(se.dates[i]))
      if (t.series.has(id) || courantes.some((o) => slotsT.has(o))) {
        renSerie.set(id, pre(id))
        for (const o of courantes) renSlot.set(o, pre(o))
      }
    }
    for (const id of slotsS) if (slotsT.has(id) && !renSlot.has(id)) renSlot.set(id, pre(id))
    const clesT = new Set([...t.reservations.keys(), ...t.memo.keys()])
    const clesS = new Set([...s.reservations.keys(), ...s.memo.keys()])
    const renCle = new Map()
    for (const k of clesS) if (clesT.has(k)) renCle.set(k, pre(k))
    const renImport = new Map()
    for (const k of s.imports.keys()) if (t.imports.has(k)) renImport.set(k, pre(k))
    const membresT = new Set([...(t.proprietaire ? [t.proprietaire] : []), ...t.membres.keys()])
    const renPseudo = new Map()
    for (const p of s.pseudonymes) if (t.pseudonymes.has(p) || membresT.has(p)) renPseudo.set(p, pre(p))
    // (5) renommage deja pris
    const pris = (ens, cible) => ens.has(cible)
    for (const [, v] of renSlot) if (pris(slotsT, v) || pris(slotsS, v) || t.creneaux.has(v) || s.creneaux.has(v)) return echec('INVALID_ARGUMENT')
    for (const [, v] of renSerie) if (t.series.has(v) || s.series.has(v)) return echec('INVALID_ARGUMENT')
    for (const [, v] of renCle) if (clesT.has(v) || clesS.has(v)) return echec('INVALID_ARGUMENT')
    for (const [, v] of renImport) if (t.imports.has(v) || s.imports.has(v)) return echec('INVALID_ARGUMENT')
    const membresS = new Set([...(s.proprietaire ? [s.proprietaire] : []), ...s.membres.keys()])
    for (const [, v] of renPseudo) if (t.pseudonymes.has(v) || s.pseudonymes.has(v) || membresT.has(v) || membresS.has(v)) return echec('INVALID_ARGUMENT')
    // (6) member_id de la source = pseudonyme de la cible (Q64)
    for (const m of membresS) if (t.pseudonymes.has(m)) return echec('INVALID_ARGUMENT')
    expirer(s, at, n)
    expirer(t, at, n)
    const kind = (k, m) => [...m.entries()].sort((x, y) => cmp(x[0], y[0])).map(([from, to]) => ({ kind: k, from, to }))
    renamed.push(...kind('slot', renSlot), ...kind('series', renSerie))
    const book = new Map([...renCle].filter(([k]) => s.reservations.has(k)))
    const req = new Map([...renCle].filter(([k]) => !s.reservations.has(k)))
    renamed.push(...kind('booking', book), ...kind('request', req), ...kind('import', renImport), ...kind('pseudonym', renPseudo))
    const rs = (id) => renSlot.get(id) ?? id
    const rk = (id) => renCle.get(id) ?? id
    const rp = (id) => renPseudo.get(id) ?? id
    // creneaux
    for (const c of s.creneaux.values()) {
      c.id = rs(c.id)
      c.file = c.file.map(rk)
      c.confirmees = new Set([...c.confirmees].map(rk))
      c.toutes = new Set([...c.toutes].map(rk))
      if (c.serie !== undefined) c.serie = renSerie.get(c.serie) ?? c.serie
      t.creneaux.set(c.id, c)
    }
    for (const se of s.series.values()) {
      se.id = renSerie.get(se.id) ?? se.id
      se.occurrences = se.occurrences.map(rs)
      t.series.set(se.id, se)
    }
    for (const b of s.reservations.values()) {
      b.id = rk(b.id)
      b.creneau = rs(b.creneau)
      b.membre = rp(b.membre)
      if (b.payeur) b.payeur = rp(b.payeur)
      b.transferts = b.transferts.map((x) => ({ ...x, from_member_id: rp(x.from_member_id), to_member_id: rp(x.to_member_id) }))
      t.reservations.set(b.id, b)
    }
    for (const [k, v] of s.memo) {
      const rep = clone(v.rep)
      if (typeof rep.booking_id === 'string') rep.booking_id = rk(rep.booking_id)
      if (typeof rep.slot_id === 'string') rep.slot_id = rs(rep.slot_id)
      t.memo.set(rk(k), { rep, args: v.args })
    }
    for (const [k, v] of s.imports) t.imports.set(renImport.get(k) ?? k, v)
    // membres (P17.R3)
    const merged = []
    const added = []
    for (const m of membresS) {
      const rS = role(s, m, n)
      if (membresT.has(m)) {
        merged.push(m)
        if (m !== t.proprietaire) {
          const rT = t.membres.get(m).role
          t.membres.get(m).role = RANG_ROLE[rS] > RANG_ROLE[rT] ? rS : rT
        }
      } else {
        added.push(m)
        t.membres.set(m, { role: rS })
      }
    }
    const tout = new Set([...s.niveaux.keys()])
    for (const m of tout) {
      const nS = s.niveaux.get(m) ?? 'none'
      const nT = t.niveaux.get(rp(m)) ?? 'none'
      t.niveaux.set(rp(m), TAUX_NIVEAU[nS] > TAUX_NIVEAU[nT] ? nS : nT)
    }
    for (const [m, w] of s.portefeuilles) {
      const cible = portefeuille(t, rp(m))
      cible.hist.push(...w.hist)
    }
    for (const [m, v] of s.suspensions) {
      const k = rp(m)
      const x = t.suspensions.get(k) ?? null
      t.suspensions.set(k, x === null ? v : v === null ? x : Math.max(x, v))
    }
    for (const [m, v] of s.absences) t.absences.set(rp(m), [...(t.absences.get(rp(m)) ?? []), ...v])
    for (const x of s.mouvements) t.mouvements.push({ ...x, membre: rp(x.membre), booking_id: x.booking_id === null ? null : rk(x.booking_id) })
    for (const p of s.pseudonymes) t.pseudonymes.add(rp(p))
    for (const [d, r] of s.taux) if (!t.taux.has(d)) t.taux.set(d, r)
    etat.locataires.delete(sid)
    return { ok: true, tenant_id: t.id, source_tenant_id: sid, renamed, merged_members: merged.sort(cmp), added_members: added.sort(cmp) }
  }

  OPS.erase_member = (t, a, at, n, ctx) => {
    const m = a.member_id
    if (!estMembre(t, m, n) || t.pseudonymes.has(m)) return echec('NOT_FOUND')
    if (m === t.proprietaire || m === ctx.acteur) return echec('INVALID_ARGUMENT')
    for (const b of t.reservations.values()) {
      if (b.membre === m && (b.statut === 'confirmed' || b.statut === 'waiting') && t.creneaux.get(b.creneau).debut > at) return echec('INVALID_ARGUMENT')
    }
    // pseudonyme (P18.R1, Q62)
    const pris = (p) => t.pseudonymes.has(p) || p === t.proprietaire || t.membres.has(p)
    let k = t.seqPseudo + 1
    while (pris(`anon-${p4(k)}`)) k += 1
    t.seqPseudo = k
    const p = `anon-${p4(k)}`
    expirer(t, at, n)
    // remboursement du portefeuille (Q38)
    const w = portefeuille(t, m)
    const Bsolde = solde(w, at, n)
    if (Bsolde > 0) {
      debiter(t, m, at, Bsolde)
      mouvement(t, { membre: m, instant: at, type: 'wallet_refund', booking_id: null, montant: Bsolde, credits: 0, carte: 0 })
    }
    let nb = 0
    for (const b of t.reservations.values()) {
      if (b.membre === m || b.payeur === m) nb += 1
      if (b.membre === m) b.membre = p
      if (b.payeur === m) b.payeur = p
      b.transferts = b.transferts.map((x) => ({ ...x, from_member_id: x.from_member_id === m ? p : x.from_member_id, to_member_id: x.to_member_id === m ? p : x.to_member_id }))
    }
    if (t.portefeuilles.has(m)) {
      t.portefeuilles.set(p, t.portefeuilles.get(m))
      t.portefeuilles.delete(m)
    }
    for (const mp of [t.niveaux, t.suspensions, t.absences]) {
      if (mp.has(m)) {
        mp.set(p, mp.get(m))
        mp.delete(m)
      }
    }
    for (const x of t.mouvements) if (x.membre === m) x.membre = p
    for (const [k2, v] of t.memo) t.memo.set(k2, { rep: anonymiser(v.rep, m, p), args: anonymiser(v.args, m, p) })
    for (const [k2, v] of t.imports) t.imports.set(k2, { rep: anonymiser(v.rep, m, p), rows: anonymiser(v.rows, m, p) })
    const factures = []
    for (const f of t.factures) {
      if (f.member_id === m) f.member_id = p
      const id = renommerFacture(f.invoice_id, m, p)
      if (id !== f.invoice_id) f.invoice_id = id
      if (f.member_id === p) factures.push(f.invoice_id)
    }
    const avoirs = []
    for (const x of t.avoirs) {
      if (x.member_id === m) x.member_id = p
      x.invoice_id = renommerFacture(x.invoice_id, m, p)
      if (x.member_id === p) avoirs.push(x.credit_note_id)
    }
    t.membres.delete(m)
    t.pseudonymes.add(p)
    return { ok: true, member_id: p, invoice_ids: factures.sort(cmp), credit_note_ids: avoirs.sort(cmp), bookings_anonymized: nb }
  }

  function pagination(a) {
    const page_size = a.page_size === undefined ? 20 : a.page_size
    const page = a.page === undefined ? 1 : a.page
    if (!entier(page_size) || page_size < 1 || page_size > 100 || !entier(page) || page < 1) return null
    return { page_size, page }
  }
  function paginer(lignes, pg) {
    const total = lignes.length
    return { total, page: pg.page, page_size: pg.page_size, pages: Math.ceil(total / pg.page_size), rows: lignes.slice((pg.page - 1) * pg.page_size, pg.page * pg.page_size) }
  }

  OPS.report_occupancy = (t, a, at, n) => {
    const de = lireInstant(a.from)
    const a2 = lireInstant(a.to)
    if (de === null || a2 === null || de >= a2) return echec('INVALID_ARGUMENT')
    const min = a.min_fill_bp === undefined ? 0 : a.min_fill_bp
    if (!entier(min) || min < 0) return echec('INVALID_ARGUMENT')
    const tri = a.sort === undefined ? 'starts_at' : a.sort
    if (!['starts_at', '-fill_bp', 'slot_id'].includes(tri)) return echec('INVALID_ARGUMENT')
    const pg = pagination(a)
    if (pg === null) return echec('INVALID_ARGUMENT')
    const lignes = []
    for (const c of t.creneaux.values()) {
      if (c.retire || c.debut < de || c.debut >= a2) continue
      const booked = occupe(t, c)
      const fill = Math.floor((booked * 10000) / c.capacite)
      if (fill < min) continue
      lignes.push({ slot_id: c.id, starts_at: ecrireInstant(c.debut), capacity: c.capacite, booked, fill_bp: fill, _d: c.debut })
    }
    const parDebut = (x, y) => x._d - y._d || cmp(x.slot_id, y.slot_id)
    lignes.sort((x, y) => (tri === 'starts_at' ? 0 : tri === '-fill_bp' ? y.fill_bp - x.fill_bp : cmp(x.slot_id, y.slot_id)) || parDebut(x, y))
    for (const l of lignes) delete l._d
    return { ok: true, ...paginer(lignes, pg) }
  }

  OPS.report_revenue = (t, a, at, n) => {
    const de = lireMois(a.from_month)
    const a2 = lireMois(a.to_month)
    if (de === null || a2 === null || a.from_month > a.to_month) return echec('INVALID_ARGUMENT')
    const tri = a.sort === undefined ? 'month' : a.sort
    if (!['month', '-net_cents', 'member_id'].includes(tri)) return echec('INVALID_ARGUMENT')
    const pg = pagination(a)
    if (pg === null) return echec('INVALID_ARGUMENT')
    const lignes = []
    for (const f of t.factures) {
      if (f.month < a.from_month || f.month > a.to_month) continue
      if (a.member_id !== undefined && f.member_id !== a.member_id) continue
      const cn = t.avoirs.filter((x) => x.invoice_id === f.invoice_id).reduce((s2, x) => s2 + x.amount_cents, 0)
      lignes.push({ invoice_id: f.invoice_id, month: f.month, member_id: f.member_id, total_cents: f.total_cents, credit_notes_cents: cn, net_cents: f.total_cents - cn })
    }
    const parMois = (x, y) => cmp(x.month, y.month) || cmp(x.member_id, y.member_id)
    lignes.sort((x, y) => (tri === 'month' ? 0 : tri === '-net_cents' ? y.net_cents - x.net_cents : cmp(x.member_id, y.member_id)) || parMois(x, y))
    const somme = lignes.reduce((s2, x) => s2 + x.net_cents, 0)
    const p = paginer(lignes, pg)
    return { ok: true, total: p.total, page: p.page, page_size: p.page_size, pages: p.pages, sum_net_cents: somme, rows: p.rows }
  }

  OPS.import_bookings = (t, a, at, n) => {
    if (!chaineNonVide(a.import_id)) return echec('INVALID_ARGUMENT')
    if (t.imports.has(a.import_id)) {
      const m = t.imports.get(a.import_id)
      if (n >= 21 && JSON.stringify(canon(m.rows)) !== JSON.stringify(canon(a.rows))) return echec('IDEMPOTENCY_CONFLICT')
      return clone(m.rep)
    }
    if (!Array.isArray(a.rows) || a.rows.length === 0 || a.rows.length > 50000) return echec('INVALID_ARGUMENT')
    let accepted = 0, confirmed = 0, waiting = 0, duplicates = 0
    const rejected = []
    a.rows.forEach((row, i) => {
      if (!estObjet(row) || typeof row.request_id !== 'string') {
        rejected.push({ index: i + 1, request_id: estObjet(row) && row.request_id !== undefined ? row.request_id : null, error: 'INVALID_ARGUMENT' })
        return
      }
      const r = reserver(t, row, at, n)
      if (r.doublon) {
        duplicates += 1
        return
      }
      if (r.rep.ok !== true) {
        rejected.push({ index: i + 1, request_id: row.request_id, error: r.rep.error })
        return
      }
      accepted += 1
      if (r.rep.status === 'confirmed') confirmed += 1
      else waiting += 1
    })
    const rep = { ok: true, import_id: a.import_id, total: a.rows.length, accepted, confirmed, waiting, duplicates, rejected }
    t.imports.set(a.import_id, { rep: clone(rep), rows: clone(a.rows) })
    return rep
  }
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon)
    if (estObjet(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
    return v
  }

  // P23.R3 : frais de transfert.
  function frais(t, b, cedant, at, n) {
    const A = b.A
    const fee = A === 0 ? 0 : Math.max(100, N(fdiv(B(A) * 1000n + 5000n, 10000n)))
    expirer(t, at, n)
    const cr = Math.min(solde(portefeuille(t, cedant), at, n), fee)
    debiter(t, cedant, at, cr)
    if (fee > 0) mouvement(t, { membre: cedant, instant: at, type: 'fee', booking_id: b.id, montant: fee, credits: cr, carte: fee - cr })
    return { fee, cr, cd: fee - cr }
  }
  const active = (b) => b.statut === 'confirmed' || b.statut === 'waiting'

  OPS.transfer_booking = (t, a, at, n, ctx) => {
    const b = reservation(t, a.booking_id)
    if (b === undefined) return echec('NOT_FOUND')
    if (ctx.role === 'member' && b.membre !== ctx.acteur) return echec('FORBIDDEN')
    if (!estMembre(t, a.to_member_id, n)) return echec('NOT_FOUND')
    if (b.statut !== 'confirmed' || a.to_member_id === b.membre) return echec('INVALID_ARGUMENT')
    const c = t.creneaux.get(b.creneau)
    if (at >= c.debut) return echec('SLOT_CLOSED')
    const s = t.suspensions.get(a.to_member_id)
    if (s !== undefined && s !== null && at < s) return echec('SUSPENDED')
    for (const x of deCreneau(t, c)) if (x !== b && x.membre === a.to_member_id && active(x)) return echec('ALREADY_BOOKED')
    const cedant = b.membre
    const f = frais(t, b, cedant, at, n)
    b.membre = a.to_member_id
    b.transferts.push({ from_member_id: cedant, to_member_id: a.to_member_id, at: ecrireInstant(at), fee_cents: f.fee })
    return { ok: true, booking_id: b.id, member_id: b.membre, fee_cents: f.fee, fee: { credits_cents: f.cr, card_cents: f.cd } }
  }

  OPS.exchange_bookings = (t, a, at, n) => {
    const b1 = reservation(t, a.booking_id)
    const b2 = reservation(t, a.with_booking_id)
    if (b1 === undefined || b2 === undefined) return echec('NOT_FOUND')
    if (b1 === b2 || b1.statut !== 'confirmed' || b2.statut !== 'confirmed' || b1.membre === b2.membre) return echec('INVALID_ARGUMENT')
    const c1 = t.creneaux.get(b1.creneau)
    const c2 = t.creneaux.get(b2.creneau)
    if (at >= c1.debut || at >= c2.debut) return echec('SLOT_CLOSED')
    const susp = (m) => {
      const s = t.suspensions.get(m)
      return s !== undefined && s !== null && at < s
    }
    if (susp(b1.membre) || susp(b2.membre)) return echec('SUSPENDED')
    if (c1.id !== c2.id) {
      for (const x of deCreneau(t, c2)) if (x !== b2 && active(x) && x.membre === b1.membre) return echec('ALREADY_BOOKED')
      for (const x of deCreneau(t, c1)) if (x !== b1 && active(x) && x.membre === b2.membre) return echec('ALREADY_BOOKED')
    }
    const m1 = b1.membre
    const m2 = b2.membre
    const f1 = frais(t, b1, m1, at, n)
    const f2 = frais(t, b2, m2, at, n)
    b1.membre = m2
    b2.membre = m1
    b1.transferts.push({ from_member_id: m1, to_member_id: m2, at: ecrireInstant(at), fee_cents: f1.fee })
    b2.transferts.push({ from_member_id: m2, to_member_id: m1, at: ecrireInstant(at), fee_cents: f2.fee })
    return { ok: true, exchanged: [{ booking_id: b1.id, member_id: m2, fee_cents: f1.fee }, { booking_id: b2.id, member_id: m1, fee_cents: f2.fee }] }
  }

  /* ─────────────────────────────── permissions (P4.R3 et fragments roles_autorises) */

  const ROLES = {
    add_member: ['admin'],
    create_slot: ['admin', 'staff'],
    reserve: ['admin', 'staff', 'member'],
    cancel: ['admin', 'staff', 'member'],
    get_booking: ['admin', 'staff', 'member'],
    get_slot: ['admin', 'staff', 'member'],
    create_recurring: ['admin', 'staff'],
    add_exception: ['admin', 'staff'],
    list_occurrences: ['admin', 'staff', 'member'],
    set_price: ['admin'],
    set_tier: ['admin'],
    top_up: ['admin', 'staff'],
    get_wallet: ['admin', 'staff', 'member'],
    set_timezone: ['admin'],
    mark_no_show: ['admin', 'staff'],
    number_seats: ['admin'],
    close_slot: ['admin', 'staff'],
    issue_invoices: ['admin'],
    list_documents: ['admin', 'staff', 'member'],
    set_rate: ['admin'],
    change_price: ['admin'],
    merge_tenants: ['admin'],
    erase_member: ['admin'],
    report_revenue: ['admin'],
    report_occupancy: ['admin', 'staff'],
    import_bookings: ['admin', 'staff'],
    transfer_booking: ['admin', 'staff', 'member'],
    exchange_bookings: ['admin', 'staff'],
  }

  /* ─────────────────────────────── create_tenant (P3.R1) */

  function creerLocataire(a) {
    if (!chaineNonVide(a.tenant_id) || !chaineNonVide(a.owner_id)) return echec('INVALID_ARGUMENT')
    if (etat.reserves.has(a.tenant_id)) return echec('ALREADY_EXISTS')
    etat.reserves.add(a.tenant_id)
    etat.locataires.set(a.tenant_id, nouveauLocataire(a.tenant_id, a.owner_id))
    return { ok: true, tenant_id: a.tenant_id }
  }

  /* ─────────────────────────────── une requete */

  function executer(req, n) {
    const at = lireInstant(req.at) ?? 0
    let op = req.op
    let args = argsDe(req)
    let version = 'v1'
    // P24.R1 : version
    if (n >= 24) {
      if (req.version !== undefined) {
        if (req.version !== 'v1' && req.version !== 'v2') return echec('INVALID_ARGUMENT')
        version = req.version
      }
    }
    const rendre = (rep) => enVersion(rep, version)
    // P1.R8 / P24.R1 / P24.R4 : nom d'operation
    const v1 = operationsV1(n)
    if (version === 'v2') {
      if (typeof op !== 'string') return rendre(echec('INVALID_ARGUMENT'))
      if (Object.hasOwn(OP_V1, op)) op = OP_V1[op]
      else if (Object.hasOwn(OP_V2, op) || !v1.has(op)) return rendre(echec('INVALID_ARGUMENT'))
      if (contientCle(args, CLE_V2)) return rendre(echec('INVALID_ARGUMENT'))
      args = renommerCles(args, CLE_V1)
    } else {
      if (typeof op !== 'string' || !v1.has(op)) return rendre(echec('INVALID_ARGUMENT'))
      if (n >= 24 && contientCle(args, CLE_V1)) return rendre(echec('INVALID_ARGUMENT'))
    }
    if (op === 'create_tenant') return rendre(creerLocataire(args))
    // P3.R2 : locataire
    let t = etat.locataires.get('default')
    if (n >= 3) {
      const id = req.tenant === undefined ? 'default' : req.tenant
      t = typeof id === 'string' ? etat.locataires.get(id) : undefined
      if (t === undefined) return rendre(echec('NOT_FOUND'))
    }
    // P4.R2 / P4.R3 : acteur
    const ctx = { acteur: req.actor, role: null }
    if (n >= 4) {
      const r = role(t, req.actor, n)
      if (r === null) return rendre(echec('FORBIDDEN'))
      if (!ROLES[op].includes(r)) return rendre(echec('FORBIDDEN'))
      ctx.role = r
      if (op === 'reserve' && r === 'member' && args.member_id !== req.actor) return rendre(echec('FORBIDDEN'))
    }
    ctxAt.at = at
    if (n >= 22) expirer(t, at, n)
    return rendre(OPS[op](t, args, at, n, ctx))
  }

  return {
    apply(req) {
      const n = Number(String(req.period).replace(/^[Pp]/, ''))
      return executer(req, n)
    },
  }
}
