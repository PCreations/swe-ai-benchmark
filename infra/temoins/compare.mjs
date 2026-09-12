// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins/compare.mjs — LE COMPARATEUR D'ÉTAT MÉTIER.
//
// Cahier L235 : « résultats oracle INDÉPENDANTS ». Ce comparateur ne connaît ni
// le schéma SQL des témoins, ni leurs noms de tables, ni leurs identifiants :
// il ne lit que des FAITS métier — qui a réservé quoi, et dans quel état.
//
// CE QU'IL CANONISE, ET POURQUOI IL LE FAUT. Cahier L135 : « l'heure et la durée
// sont des métadonnées volatiles, exclues de la comparaison canonique ». Cahier
// L559 : chaque exécution reçoit un `test_run_id` et ses bases propres, et « les
// comparaisons canonisent uniquement les ids de lancement et métadonnées
// explicitement volatiles ». Deux exécutions INDÉPENDANTES du même témoin
// conforme produisent donc des identifiants de réservation différents, des
// horodatages techniques différents et des numéros de séquence différents ; si
// le comparateur regardait ces valeurs, il déclarerait le témoin conforme
// NON CONFORME à lui-même. C'est exactement le contrôle positif que T09.A4 exige
// avant d'accepter le refus de `drop-one-row`.
//
// CE QU'IL NE CANONISE PAS. L'ORDRE d'admission est un fait métier, pas une
// métadonnée : ce qui est volatil, c'est la VALEUR absolue du numéro de
// séquence, pas le rang qu'elle induit. Quand les deux documents portent des
// séquences, l'ordre de la file d'attente est donc comparé en RANGS.
//
// CE QU'IL DOIT FAIRE QUAND IL REFUSE : NOMMER. Un total agrégé (« 7 au lieu de
// 8 ») situerait l'écart sans le désigner. Chaque différence porte l'acteur et
// le créneau concernés, sous un contrôle nommé — c'est ce dont T10 héritera
// pour exiger que chaque faute soit « détectée par son contrôle nommé ».
// ─────────────────────────────────────────────────────────────────────────────

/** Champs par lesquels un fait métier se reconnaît, quel que soit le producteur. */
const CHAMP_ACTEUR = /^(actor|actor_id|acteur|holder|titulaire|party|owner|client|customer|guest|subject)$/i
const CHAMP_STATUT = /^(status|state|etat|statut|reservation_status|booking_status)$/i
const CHAMP_CRENEAU = /^(slot|slot_id|creneau|resource|resource_id|session|session_id)$/i
const CHAMP_LOCATAIRE = /^(tenant|tenant_id|locataire|org|organisation|organization|account)$/i
const CHAMP_SEQUENCE = /^(sequence|seq|admission_sequence|rank|rang|position|ordre|order)$/i

/** VOLATIL au sens de L135/L559 : jamais comparé. */
const VOLATIL = /^(id|reservation_id|booking_id|uid|uuid|ref|identifier|at|requested_at|created_at|updated_at|promoted_at|timestamp|time|date|duration|duration_ms|elapsed|run_id|test_run_id|database|dsn|schema|version|digest)$/i

export const STATUTS = ['confirmed', 'waiting', 'cancelled']

function normaliserStatut(brut) {
  const t = String(brut).toLowerCase()
  if (/annul|cancel/.test(t)) return 'cancelled'
  if (/attente|wait|queue|pend/.test(t)) return 'waiting'
  if (/confirm|booked|reserved|held/.test(t)) return 'confirmed'
  return `inconnu(${t})`
}

/** Un objet est un FAIT s'il porte un acteur et un statut. */
function lireFait(o, locataireDoc) {
  let acteur = null
  let statut = null
  let creneau = ''
  let locataire = ''
  let sequence = null
  for (const [k, v] of Object.entries(o)) {
    if (VOLATIL.test(k)) continue
    if (acteur === null && CHAMP_ACTEUR.test(k) && typeof v === 'string' && v.length > 0) acteur = v
    if (statut === null && CHAMP_STATUT.test(k) && typeof v === 'string') statut = v
    if (creneau === '' && CHAMP_CRENEAU.test(k) && typeof v === 'string') creneau = v
    if (locataire === '' && CHAMP_LOCATAIRE.test(k) && typeof v === 'string') locataire = v
    if (sequence === null && CHAMP_SEQUENCE.test(k) && typeof v === 'number' && Number.isFinite(v)) {
      sequence = v
    }
  }
  if (acteur === null || statut === null) return null
  return {
    actor: acteur,
    slot: creneau,
    status: normaliserStatut(statut),
    tenant: locataire === '' ? locataireDoc : locataire,
    sequence,
  }
}

function locataireDuDocument(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return ''
  for (const [k, v] of Object.entries(doc)) {
    if (CHAMP_LOCATAIRE.test(k) && typeof v === 'string') return v
  }
  return ''
}

/** Parcours profond : les faits sont cherchés partout, jamais à un chemin imposé. */
export function faits(doc) {
  const locataireDoc = locataireDuDocument(doc)
  const out = []
  const vus = new Set()
  const marcher = (v, profondeur) => {
    if (profondeur > 10 || v === null || typeof v !== 'object') return
    if (vus.has(v)) return
    vus.add(v)
    if (Array.isArray(v)) {
      for (const x of v) marcher(x, profondeur + 1)
      return
    }
    const f = lireFait(v, locataireDoc)
    if (f !== null) out.push(f)
    for (const x of Object.values(v)) marcher(x, profondeur + 1)
  }
  marcher(doc, 0)
  return out
}

const identite = (f) => `${f.actor}|${f.slot}`

/** L'état canonique : un multiensemble d'identités, chacune avec ses statuts. */
function canoniser(doc) {
  const liste = faits(doc)
  const par = new Map()
  for (const f of liste) {
    const cle = identite(f)
    if (!par.has(cle)) par.set(cle, [])
    par.get(cle).push(f)
  }
  return { liste, par }
}

/** Le rang FIFO : l'ordre induit par les séquences, jamais leur valeur. */
function rangsDAttente(liste) {
  const attente = liste.filter((f) => f.status === 'waiting' && f.sequence !== null)
  if (attente.length === 0) return null
  return attente
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(identite)
}

/**
 * compareBusinessState(observe, attendu) — le verdict de conformité.
 * Rend `{ ok, conforming, verdict, differences, summary, compared }`.
 * `ok:false` et `differences` non vide sont les deux signaux de refus ; le
 * verdict NOMME chaque écart par son acteur et son créneau.
 */
export function compareBusinessState(observe, attendu) {
  if (observe === null || observe === undefined || attendu === null || attendu === undefined) {
    return {
      ok: false,
      conforming: false,
      verdict: 'INVALID_INPUT',
      summary: 'comparaison impossible : un des deux documents est absent',
      differences: [{ control: 'document_absent', observed: observe ?? null, expected: attendu ?? null }],
      compared: 0,
    }
  }

  const o = canoniser(observe)
  const a = canoniser(attendu)
  const differences = []

  const cles = [...new Set([...a.par.keys(), ...o.par.keys()])].sort()
  for (const cle of cles) {
    const [actor, slot] = cle.split('|')
    const attendus = a.par.get(cle) ?? []
    const observes = o.par.get(cle) ?? []
    if (attendus.length > 0 && observes.length === 0) {
      differences.push({
        control: 'reservation_manquante',
        actor,
        slot,
        expected: attendus.map((f) => f.status),
        observed: [],
      })
      continue
    }
    if (attendus.length === 0 && observes.length > 0) {
      differences.push({
        control: 'reservation_en_trop',
        actor,
        slot,
        expected: [],
        observed: observes.map((f) => f.status),
      })
      continue
    }
    const sa = attendus.map((f) => f.status).sort()
    const so = observes.map((f) => f.status).sort()
    if (sa.join(',') !== so.join(',')) {
      differences.push({ control: 'statut_divergent', actor, slot, expected: sa, observed: so })
    }
    const ta = [...new Set(attendus.map((f) => f.tenant))].sort()
    const to = [...new Set(observes.map((f) => f.tenant))].sort()
    if (ta.join(',') !== to.join(',')) {
      differences.push({ control: 'locataire_divergent', actor, slot, expected: ta, observed: to })
    }
  }

  const ra = rangsDAttente(a.liste)
  const ro = rangsDAttente(o.liste)
  if (ra !== null && ro !== null && ra.join('>') !== ro.join('>')) {
    differences.push({
      control: 'ordre_d_attente_divergent',
      actor: '',
      slot: '',
      expected: ra,
      observed: ro,
    })
  }

  if (differences.length === 0) {
    return {
      ok: true,
      conforming: true,
      verdict: 'CONFORM',
      summary: `conforme — ${String(a.liste.length)} fait(s) metier compare(s)`,
      differences: [],
      compared: a.liste.length,
    }
  }
  const nommees = differences
    .filter((d) => d.actor !== '')
    .map((d) => `${d.control}:${d.actor}|${d.slot}`)
  return {
    ok: false,
    conforming: false,
    verdict: 'DIVERGENCE',
    summary:
      `${String(differences.length)} ecart(s) sur ${String(a.liste.length)} fait(s) attendu(s) — ` +
      (nommees.length > 0 ? nommees.join(' ; ') : differences.map((d) => d.control).join(' ; ')),
    differences,
    compared: a.liste.length,
  }
}
