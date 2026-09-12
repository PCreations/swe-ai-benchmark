// ─────────────────────────────────────────────────────────────────────────────
// LES SIX CONTRÔLES NOMMÉS (cahier L241).
//
// « `A2` mutants surbooking, doublon idempotent, FIFO inversé, frontière 24 h
// fausse, fuite intertenant et perte de migration chacun DÉTECTÉS PAR SON
// CONTRÔLE NOMMÉ. » Six fautes, donc six contrôles, et chaque contrôle porte le
// nom de la faute qu'il sait voir. Un contrôle unique qui dirait « non
// conforme » les détecterait tous les six sans en nommer aucun : ce serait
// perdre exactement ce que L241 demande.
//
// CE QU'UN CONTRÔLE OBSERVE. Le programme témoin est interrogé par son CONTRAT
// HTTP public et par l'état qu'il EXPORTE — jamais par un nom de table (L119 :
// « évaluer l'état métier exporté, pas un nom de table imposé »). Chaque
// contrôle déclare ses propres créneaux et ses propres acteurs : deux contrôles
// ne se marchent pas dessus, et un mutant ne peut pas faire tomber le contrôle
// d'un autre par ricochet. C'est cette indépendance qui rend les six contrôles
// DISTINCTS observables plutôt que déclarés.
//
// L'ORDRE DES CONTRÔLES EST UNE DÉCISION, ET ELLE EST MESURABLE. L'intégrité de
// migration passe en premier parce qu'elle est la seule à exiger deux
// démarrages (le palier initial, puis le palier multi-locataire sur LA MÊME
// base) : elle est donc aussi celle qui garantit que la base FOURNIE par
// l'appelant a réellement été écrite (L141, L559). Les cinq autres s'exécutent
// ensuite sur l'instance migrée.
// ─────────────────────────────────────────────────────────────────────────────
import {
  DELAI_ANNULATION_HEURES,
  FRONTIERE_INCLUSE,
  LOCATAIRE_ETRANGER,
  LOCATAIRE_PRINCIPAL,
  PROBE_DEBUT_CRENEAU,
  PROBE_HORLOGE,
  frontiereAnnulation,
  instantDecale,
} from './reference.js'
import type { WitnessHandle } from './program.js'

/** Les six noms. Ils sont le vocabulaire par lequel un rejet se justifie. */
export const CONTROL_CAPACITE = 'controle-de-capacite'
export const CONTROL_IDEMPOTENCE = 'controle-d-idempotence'
export const CONTROL_FIFO = 'controle-fifo'
export const CONTROL_FRONTIERE = 'controle-de-frontiere-24h'
export const CONTROL_CLOISONNEMENT = 'controle-de-cloisonnement-intertenant'
export const CONTROL_MIGRATION = 'controle-d-integrite-de-migration'

/** L'ordre d'exécution ; c'est aussi l'ordre des lignes de la matrice. */
export const CONTROL_ORDER = [
  CONTROL_MIGRATION,
  CONTROL_CAPACITE,
  CONTROL_IDEMPOTENCE,
  CONTROL_FIFO,
  CONTROL_FRONTIERE,
  CONTROL_CLOISONNEMENT,
] as const

/** Le verdict d'UN contrôle : satisfait ou non, et ce qui a été observé. */
export interface ControlOutcome {
  readonly control: string
  readonly satisfied: boolean
  readonly detail: string
}

const HTTP_TIMEOUT_MS = 120_000

interface Reponse {
  readonly http: number
  readonly body: Record<string, unknown>
}

async function appel(
  handle: WitnessHandle,
  methode: string,
  chemin: string,
  corps: Record<string, unknown> | null,
): Promise<Reponse> {
  const reponse = await fetch(`${handle.baseUrl}${chemin}`, {
    method: methode,
    headers: corps === null ? {} : { 'content-type': 'application/json' },
    ...(corps === null ? {} : { body: JSON.stringify(corps) }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  const texte = await reponse.text()
  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(texte)
    if (parsed !== null && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    body = { ok: false, code: 'REPONSE_ILLISIBLE', texte: texte.slice(0, 200) }
  }
  return { http: reponse.status, body }
}

const declarerCreneau = (
  h: WitnessHandle,
  slot: string,
  capacity: number,
  startsAt: string,
  tenant = LOCATAIRE_PRINCIPAL,
): Promise<Reponse> =>
  appel(h, 'POST', '/slots', { tenant, slot, capacity, starts_at: startsAt })

const reserver = (
  h: WitnessHandle,
  slot: string,
  actor: string,
  sequence: number,
  key: string,
  at = PROBE_HORLOGE,
  tenant = LOCATAIRE_PRINCIPAL,
): Promise<Reponse> =>
  appel(h, 'POST', '/reservations', {
    tenant,
    actor,
    slot,
    at,
    sequence,
    idempotency_key: key,
  })

const annuler = (
  h: WitnessHandle,
  slot: string,
  actor: string,
  sequence: number,
  key: string,
  at: string,
  tenant = LOCATAIRE_PRINCIPAL,
): Promise<Reponse> =>
  appel(h, 'POST', '/cancellations', {
    tenant,
    actor,
    slot,
    at,
    sequence,
    idempotency_key: key,
  })

const exporter = (
  h: WitnessHandle,
  tenant: string,
  actor: string | null = null,
): Promise<Reponse> =>
  appel(
    h,
    'GET',
    `/export?tenant=${encodeURIComponent(tenant)}${actor === null ? '' : `&actor=${encodeURIComponent(actor)}`}`,
    null,
  )

/** Les réservations de l'état EXPORTÉ, filtrées sur un créneau. */
function reservationsDe(body: Record<string, unknown>, slot: string): Record<string, unknown>[] {
  const brut = body['reservations']
  if (!Array.isArray(brut)) return []
  return brut
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    .filter((r) => r['slot'] === slot)
}

const statutDe = (r: Record<string, unknown>): string => String(r['status'] ?? '')
const acteurDe = (r: Record<string, unknown>): string => String(r['actor'] ?? '')

const ok = (control: string, detail: string): ControlOutcome => ({
  control,
  satisfied: true,
  detail,
})
const ko = (control: string, detail: string): ControlOutcome => ({
  control,
  satisfied: false,
  detail,
})

/* ═════════════════════════ 1. intégrité de migration (L231, L241) ══════ */

/** Le créneau et les acteurs de la probe de migration. */
const MIG_SLOT = 'T10-MIG'
const MIG_ACTEURS = ['MIG-1', 'MIG-2', 'MIG-3', 'MIG-4', 'MIG-5', 'MIG-6', 'MIG-7', 'MIG-8']

/**
 * PHASE 1, au palier initial : des réservations sont RÉELLEMENT créées dans la
 * base fournie. C'est l'écriture que L141 exige (« les checks d'intégration
 * utilisent réellement PostgreSQL »), et ce sont ces lignes-là, et non une base
 * idéale, que le palier suivant devra reprendre.
 */
export async function semerAvantMigration(h: WitnessHandle): Promise<string> {
  const creneau = await declarerCreneau(h, MIG_SLOT, MIG_ACTEURS.length * 2, PROBE_DEBUT_CRENEAU)
  if (creneau.http !== 201) {
    return `declaration du creneau ${MIG_SLOT} refusee : http=${String(creneau.http)} ${JSON.stringify(creneau.body).slice(0, 200)}`
  }
  let creees = 0
  for (const [i, acteur] of MIG_ACTEURS.entries()) {
    const r = await reserver(h, MIG_SLOT, acteur, i + 1, `t10-mig-${String(i + 1)}`)
    if (r.http === 201 && r.body['ok'] === true) creees += 1
  }
  if (creees !== MIG_ACTEURS.length) {
    return `seulement ${String(creees)} reservations creees sur ${String(MIG_ACTEURS.length)} au palier initial`
  }
  return ''
}

/**
 * PHASE 2, au palier multi-locataire : les lignes créées à la phase 1 doivent
 * TOUTES être là, rattachées au locataire d'origine. Une migration qui en perd
 * une réussit pourtant — c'est tout l'objet de la faute nommée par L241.
 */
export async function controleIntegriteMigration(
  h: WitnessHandle,
  erreurDeSemis: string,
): Promise<ControlOutcome> {
  if (erreurDeSemis !== '') {
    return ko(CONTROL_MIGRATION, `semis du palier initial incomplet : ${erreurDeSemis}`)
  }
  const r = await exporter(h, LOCATAIRE_PRINCIPAL)
  if (r.http !== 200) {
    return ko(CONTROL_MIGRATION, `export refuse apres migration : http=${String(r.http)}`)
  }
  const lignes = reservationsDe(r.body, MIG_SLOT)
  const acteurs = lignes.map(acteurDe).sort()
  if (lignes.length !== MIG_ACTEURS.length) {
    const perdus = MIG_ACTEURS.filter((a) => !acteurs.includes(a))
    return ko(
      CONTROL_MIGRATION,
      `${String(MIG_ACTEURS.length)} reservations creees au palier initial, ` +
        `${String(lignes.length)} retrouvees apres migration — perdues : [${perdus.join(', ')}]`,
    )
  }
  const horsLocataire = lignes.filter((l) => l['tenant'] !== LOCATAIRE_PRINCIPAL)
  if (horsLocataire.length > 0) {
    return ko(
      CONTROL_MIGRATION,
      `${String(horsLocataire.length)} reservations non rattachees a ${LOCATAIRE_PRINCIPAL}`,
    )
  }
  return ok(
    CONTROL_MIGRATION,
    `${String(lignes.length)} reservations creees au palier initial retrouvees et rattachees a ${LOCATAIRE_PRINCIPAL}`,
  )
}

/* ═════════════════════════════════════ 2. capacité — surbooking ════════ */

export async function controleCapacite(h: WitnessHandle): Promise<ControlOutcome> {
  const slot = 'T10-CAP'
  const creneau = await declarerCreneau(h, slot, 1, PROBE_DEBUT_CRENEAU)
  if (creneau.http !== 201) {
    return ko(CONTROL_CAPACITE, `declaration du creneau refusee : http=${String(creneau.http)}`)
  }
  const a = await reserver(h, slot, 'CAP-A', 1, 't10-cap-a')
  if (a.body['reservation_status'] !== 'confirmed') {
    return ko(
      CONTROL_CAPACITE,
      `la premiere demande sur un creneau vide n'est pas confirmee : ${JSON.stringify(a.body).slice(0, 200)}`,
    )
  }
  const b = await reserver(h, slot, 'CAP-B', 2, 't10-cap-b')
  const statutB = String(b.body['reservation_status'] ?? '')
  if (statutB === 'confirmed') {
    return ko(
      CONTROL_CAPACITE,
      `demande concurrente CONFIRMEE sur un creneau de capacite 1 : surbooking ` +
        `(${JSON.stringify(b.body).slice(0, 200)})`,
    )
  }
  const etat = await exporter(h, LOCATAIRE_PRINCIPAL)
  const confirmees = reservationsDe(etat.body, slot).filter((r) => statutDe(r) === 'confirmed')
  if (confirmees.length !== 1) {
    return ko(
      CONTROL_CAPACITE,
      `${String(confirmees.length)} reservations confirmees sur un creneau de capacite 1 : ` +
        `[${confirmees.map(acteurDe).join(', ')}]`,
    )
  }
  return ok(
    CONTROL_CAPACITE,
    `capacite 1 respectee : CAP-A confirme, CAP-B ${statutB === '' ? 'refuse' : statutB}`,
  )
}

/* ══════════════════════════════════ 3. idempotence — doublon ═══════════ */

export async function controleIdempotence(h: WitnessHandle): Promise<ControlOutcome> {
  const slot = 'T10-IDEM'
  const creneau = await declarerCreneau(h, slot, 4, PROBE_DEBUT_CRENEAU)
  if (creneau.http !== 201) {
    return ko(CONTROL_IDEMPOTENCE, `declaration du creneau refusee : http=${String(creneau.http)}`)
  }
  const cle = 't10-idem-cle'
  const premier = await reserver(h, slot, 'IDEM-A', 1, cle)
  if (premier.http !== 201 || premier.body['ok'] !== true) {
    return ko(
      CONTROL_IDEMPOTENCE,
      `premiere demande refusee : http=${String(premier.http)} ${JSON.stringify(premier.body).slice(0, 200)}`,
    )
  }
  const rejeu = await reserver(h, slot, 'IDEM-A', 1, cle)
  if (rejeu.body['id'] !== premier.body['id']) {
    return ko(
      CONTROL_IDEMPOTENCE,
      `le rejeu de la meme cle avec les memes arguments rend un AUTRE effet : ` +
        `${String(premier.body['id'])} puis ${String(rejeu.body['id'])}`,
    )
  }
  if (rejeu.body['replayed'] !== true) {
    return ko(
      CONTROL_IDEMPOTENCE,
      `le rejeu n'est pas annonce comme tel : ${JSON.stringify(rejeu.body).slice(0, 200)}`,
    )
  }
  const etat = await exporter(h, LOCATAIRE_PRINCIPAL)
  const lignes = reservationsDe(etat.body, slot).filter((r) => acteurDe(r) === 'IDEM-A')
  if (lignes.length !== 1) {
    return ko(
      CONTROL_IDEMPOTENCE,
      `${String(lignes.length)} reservations pour un acteur ayant rejoue UNE cle : doublon idempotent`,
    )
  }
  return ok(CONTROL_IDEMPOTENCE, 'le rejeu de la meme cle ne produit aucun second effet')
}

/* ═══════════════════════════════════════ 4. FIFO — ordre inversé ═══════ */

/**
 * L'ordre attendu N'EST PAS ÉCRIT D'AVANCE : il est CALCULÉ sur l'état
 * réellement exporté juste avant l'annulation — l'acteur en attente de plus
 * PETITE séquence d'admission (L123). C'est ce qui rend ce contrôle
 * indépendant de la capacité SERVIE : un témoin qui surbooke place d'autres
 * acteurs en file, mais la première promotion doit toujours être celle de la
 * plus petite séquence. Sans ce calcul, la faute de capacité ferait tomber le
 * contrôle FIFO par ricochet, et deux contrôles cesseraient d'être distincts.
 */
export async function controleFifo(h: WitnessHandle): Promise<ControlOutcome> {
  const slot = 'T10-FIFO'
  const acteurs = ['FIFO-A', 'FIFO-B', 'FIFO-C', 'FIFO-D', 'FIFO-E']
  const creneau = await declarerCreneau(h, slot, 2, PROBE_DEBUT_CRENEAU)
  if (creneau.http !== 201) {
    return ko(CONTROL_FIFO, `declaration du creneau refusee : http=${String(creneau.http)}`)
  }
  for (const [i, acteur] of acteurs.entries()) {
    const r = await reserver(h, slot, acteur, i + 1, `t10-fifo-${String(i + 1)}`)
    if (r.http !== 201) {
      return ko(CONTROL_FIFO, `demande de ${acteur} refusee : http=${String(r.http)}`)
    }
  }

  const fileDattente = async (): Promise<{ attente: string[]; confirmes: string[] }> => {
    const etat = await exporter(h, LOCATAIRE_PRINCIPAL)
    const lignes = reservationsDe(etat.body, slot)
    const parSequence = (a: Record<string, unknown>, b: Record<string, unknown>): number =>
      Number(a['sequence'] ?? 0) - Number(b['sequence'] ?? 0)
    return {
      attente: lignes.filter((r) => statutDe(r) === 'waiting').sort(parSequence).map(acteurDe),
      confirmes: lignes.filter((r) => statutDe(r) === 'confirmed').sort(parSequence).map(acteurDe),
    }
  }

  const depart = await fileDattente()
  if (depart.attente.length < 2 || depart.confirmes.length < 1) {
    return ko(
      CONTROL_FIFO,
      `etat de depart inexploitable : confirmes=[${depart.confirmes.join(', ')}] ` +
        `attente=[${depart.attente.join(', ')}]`,
    )
  }

  // On annule des titulaires jusqu'à ce qu'une promotion ait lieu : sous une
  // capacité servie plus large, la première annulation ne libère encore rien.
  let sequence = acteurs.length
  for (const titulaire of depart.confirmes) {
    const avant = await fileDattente()
    if (avant.attente.length === 0) break
    const attendu = avant.attente[0] ?? ''
    sequence += 1
    const annulation = await annuler(
      h,
      slot,
      titulaire,
      sequence,
      `t10-fifo-cancel-${titulaire}`,
      PROBE_HORLOGE,
    )
    if (annulation.http !== 200) {
      return ko(
        CONTROL_FIFO,
        `annulation de ${titulaire} refusee : http=${String(annulation.http)}`,
      )
    }
    const promu = String(annulation.body['promoted'] ?? '')
    if (promu === '') continue
    const apres = await fileDattente()
    if (promu !== attendu || !apres.confirmes.includes(attendu)) {
      return ko(
        CONTROL_FIFO,
        `la promotion n'a pas suivi la sequence d'admission : promu=${promu} attendu=${attendu} ` +
          `(file avant annulation : [${avant.attente.join(', ')}], confirmes apres : ` +
          `[${apres.confirmes.join(', ')}])`,
      )
    }
    return ok(
      CONTROL_FIFO,
      `promotion de ${promu}, plus petite sequence d'admission de la file [${avant.attente.join(', ')}]`,
    )
  }
  return ko(
    CONTROL_FIFO,
    `aucune promotion apres annulation des titulaires [${depart.confirmes.join(', ')}] ` +
      `alors que la file portait [${depart.attente.join(', ')}]`,
  )
}

/* ═════════════════════════════ 5. frontière des 24 h (L119) ════════════ */

export async function controleFrontiere(h: WitnessHandle): Promise<ControlOutcome> {
  const frontiere = frontiereAnnulation(PROBE_DEBUT_CRENEAU, DELAI_ANNULATION_HEURES)
  const juste = instantDecale(frontiere, 1)

  const slotBord = 'T10-BORD'
  const d1 = await declarerCreneau(h, slotBord, 1, PROBE_DEBUT_CRENEAU)
  if (d1.http !== 201) {
    return ko(CONTROL_FRONTIERE, `declaration du creneau refusee : http=${String(d1.http)}`)
  }
  const r1 = await reserver(h, slotBord, 'BORD-A', 1, 't10-bord-a')
  if (r1.body['reservation_status'] !== 'confirmed') {
    return ko(CONTROL_FRONTIERE, `BORD-A n'est pas confirme : ${JSON.stringify(r1.body).slice(0, 200)}`)
  }
  const surLaFrontiere = await annuler(h, slotBord, 'BORD-A', 2, 't10-bord-a-cancel', frontiere)
  if (FRONTIERE_INCLUSE && surLaFrontiere.http !== 200) {
    return ko(
      CONTROL_FRONTIERE,
      `annulation EXACTEMENT a la frontiere des ${String(DELAI_ANNULATION_HEURES)} h refusee ` +
        `(${frontiere}) alors que la frontiere est INCLUSE : http=${String(surLaFrontiere.http)} ` +
        JSON.stringify(surLaFrontiere.body).slice(0, 200),
    )
  }

  const slotTard = 'T10-BORD-TARD'
  const d2 = await declarerCreneau(h, slotTard, 1, PROBE_DEBUT_CRENEAU)
  if (d2.http !== 201) {
    return ko(CONTROL_FRONTIERE, `declaration du second creneau refusee : http=${String(d2.http)}`)
  }
  const r2 = await reserver(h, slotTard, 'BORD-B', 1, 't10-bord-b')
  if (r2.body['reservation_status'] !== 'confirmed') {
    return ko(CONTROL_FRONTIERE, `BORD-B n'est pas confirme : ${JSON.stringify(r2.body).slice(0, 200)}`)
  }
  const apres = await annuler(h, slotTard, 'BORD-B', 2, 't10-bord-b-cancel', juste)
  if (apres.http === 200) {
    return ko(
      CONTROL_FRONTIERE,
      `annulation ACCEPTEE une milliseconde apres la frontiere (${juste}) : ` +
        `la limite des ${String(DELAI_ANNULATION_HEURES)} h ne mord pas`,
    )
  }
  return ok(
    CONTROL_FRONTIERE,
    `frontiere ${frontiere} incluse (annulation acceptee) et depassement d'1 ms refuse ` +
      `(http=${String(apres.http)})`,
  )
}

/* ═══════════════════════ 6. cloisonnement intertenant (L123) ═══════════ */

export async function controleCloisonnement(h: WitnessHandle): Promise<ControlOutcome> {
  const slot = 'T10-ISO'
  const creneau = await declarerCreneau(h, slot, 2, PROBE_DEBUT_CRENEAU)
  if (creneau.http !== 201) {
    return ko(CONTROL_CLOISONNEMENT, `declaration du creneau refusee : http=${String(creneau.http)}`)
  }
  const r = await reserver(h, slot, 'ISO-A', 1, 't10-iso-a')
  if (r.body['reservation_status'] !== 'confirmed') {
    return ko(
      CONTROL_CLOISONNEMENT,
      `ISO-A n'est pas confirme sous ${LOCATAIRE_PRINCIPAL} : ${JSON.stringify(r.body).slice(0, 200)}`,
    )
  }
  const etranger = await exporter(h, LOCATAIRE_ETRANGER, 'ISO-A')
  const serialise = JSON.stringify(etranger.body)
  if (etranger.http === 200 || serialise.includes(slot)) {
    return ko(
      CONTROL_CLOISONNEMENT,
      `l'export sous le locataire ${LOCATAIRE_ETRANGER} divulgue l'etat de ` +
        `${LOCATAIRE_PRINCIPAL} : http=${String(etranger.http)} ${serialise.slice(0, 240)}`,
    )
  }
  if (etranger.body['code'] !== 'NOT_FOUND') {
    return ko(
      CONTROL_CLOISONNEMENT,
      `le refus intertenant ne vaut pas NOT_FOUND : ${serialise.slice(0, 200)}`,
    )
  }
  return ok(
    CONTROL_CLOISONNEMENT,
    `NOT_FOUND sans donnee metier divulguee pour ${LOCATAIRE_ETRANGER}/ISO-A`,
  )
}
