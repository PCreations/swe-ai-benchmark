// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — geler et préenregistrer les campagnes (cahier L415-L421,
// tâche T30).
//
// LES CINQ RÔLES SONT LA CONVENTION D'APPEL que `acceptance/T30.spec.ts`
// publie dans son en-tête (section III) — reprise ici à l'identique, nom pour
// nom :
//
//   preflightCampaign(bundle)                le préflight            (L417)
//   freezeCampaign(bundle)                   export signé/haché       (L417)
//   verifyFreezeIntegrity(frozen, bundle)    détection de mismatch    (L69)
//   issueLocalTestReceipt(frozen)            reçu LOCAL DE TEST       (L421)
//   verifyRegistrationReceipt(frozen, recu)  vérification du reçu     (L421)
//
// EMPREINTE ET SIGNATURE. Le hash canonique réutilise `@bench/contracts`
// (`canonicalDigest`/`canonicalBytes`/`sha256Hex`, cahier L82) plutôt que de
// réimplanter SHA-256 ici. La « signature » d'un gel ou d'un reçu est une
// construction HMAC-like locale : `sha256Hex(canonicalBytes({ key, payload }))`
// sur une clé fixe interne à ce paquet. Ce n'est PAS une primitive
// cryptographique publiée ni un port vers un service de signature externe —
// c'est délibéré : L421 dit qu'un reçu LOCAL DE TEST ne suppose aucune
// destination externe accessible, et cette signature n'a qu'un rôle : détecter
// qu'un octet a changé entre l'émission et la vérification (A5), pas
// authentifier un tiers.
//
// LE GEL PORTE UN INSTANTANÉ DU BUNDLE (`frozen_bundle`), pas seulement son
// empreinte : `verifyFreezeIntegrity` en a besoin pour NOMMER le champ fautif
// d'un mismatch (cahier L69, danger 2 de l'en-tête de suite — « un refus qui ne
// nomme rien ne prouve pas qu'il a vu le bon défaut »). Comparer seulement les
// deux empreintes dirait « ça diffère » sans jamais dire où.
// ─────────────────────────────────────────────────────────────────────────────
import type { CanonicalValue } from '@bench/contracts'
import { canonicalBytes, canonicalDigest, sha256Hex } from '@bench/contracts'

/** Forme `bench.preregistration.bundle/1` — objet plat, cf. README des fixtures. */
export type PreregistrationBundle = Record<string, unknown>

/** Verdict d'un préflight ou d'un gel — cf. convention 2 de l'en-tête de suite. */
export type PreregistrationVerdict = Record<string, unknown>

/** Export gelé (hash + signature), sous une forme tolérée par la suite (convention 2). */
export type FrozenCampaign = Record<string, unknown>

/** Reçu d'horodatage — signature + charge utile (convention 3). */
export type RegistrationReceipt = Record<string, unknown>

/** Rapport de vérification de gel ou de reçu (convention 4). */
export type VerificationReport = Record<string, unknown>

type Json = Record<string, unknown>

const asCanonical = (v: unknown): CanonicalValue => v as unknown as CanonicalValue

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const isPlainObject = (v: unknown): v is Json =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function entriesOf(bundle: PreregistrationBundle, split: 'calibration' | 'test'): Json[] {
  const section = bundle[split]
  if (!isPlainObject(section)) return []
  return asArray(section.entries).filter(isPlainObject)
}

/* ───────────────────────────────────────────────────── clés de signature */

/** Clé HMAC-like interne au gel — cf. note d'en-tête. Pas un secret externe. */
const FREEZE_SIGNING_KEY = 'bench.scenario.preregistration.freeze-signing-key/1'
/** Clé HMAC-like interne au reçu local de test — distincte de celle du gel. */
const RECEIPT_SIGNING_KEY = 'bench.scenario.preregistration.receipt-signing-key/1'

function sign(key: string, payload: CanonicalValue): string {
  return sha256Hex(canonicalBytes({ key, payload }))
}

/* ──────────────────────────────────────────────────────────── préflight */

/**
 * Préflight d'un bundle de préenregistrement (L417) : disjonction des projets
 * parents entre les splits `calibration`/`test` (A1), qualification et
 * tarification des scénarios (A2), complétude des champs exigés par le mode
 * `confirmed` (A4).
 */
export function preflightCampaign(bundle: PreregistrationBundle): PreregistrationVerdict {
  const errors: string[] = []

  const calibration = entriesOf(bundle, 'calibration')
  const test = entriesOf(bundle, 'test')

  // A1 — cahier L419 : même projet parent dans calibration et test refuse.
  const calibrationParents = new Set(calibration.map((e) => String(e.parent_project_id)))
  const sharedParents = test
    .map((e) => String(e.parent_project_id))
    .filter((p) => calibrationParents.has(p))
  for (const p of new Set(sharedParents)) {
    errors.push(
      `PARENT_PROJET_PARTAGE : parent_project_id="${p}" présent à la fois dans calibration et test`,
    )
  }

  // A2 — cahier L419 : scénario non qualifié, ou modèle/tarif non renseigné.
  for (const e of [...calibration, ...test]) {
    const scenarioId = String(e.scenario_id ?? '(scenario_id absent)')
    if (e.qualified !== true) {
      errors.push(`SCENARIO_NON_QUALIFIE : scenario_id="${scenarioId}" n'est pas qualified`)
    }
    const model = typeof e.model === 'string' ? e.model : ''
    const tariff = typeof e.tariff_micro_usd === 'string' ? e.tariff_micro_usd : ''
    if (model === '' || tariff === '') {
      errors.push(
        `MODELE_OU_TARIF_NON_RENSEIGNE : scenario_id="${scenarioId}" model="${model}" tariff_micro_usd="${tariff}"`,
      )
    }
  }

  // A4 — cahier L419 : mode confirmé exige métriques, effectif, budgets, règles d'arrêt.
  if (bundle.registration_mode === 'confirmed') {
    const missing: string[] = []
    if (!Array.isArray(bundle.metrics) || bundle.metrics.length === 0) missing.push('metrics')
    if (typeof bundle.sample_size !== 'number' || bundle.sample_size <= 0) missing.push('sample_size')
    if (!Array.isArray(bundle.budgets) || bundle.budgets.length === 0) missing.push('budgets')
    if (!Array.isArray(bundle.stopping_rules) || bundle.stopping_rules.length === 0) {
      missing.push('stopping_rules')
    }
    if (missing.length > 0) {
      errors.push(
        `MODE_CONFIRME_INCOMPLET : champ(s) manquant(s) = ${missing.join(', ')}`,
      )
    }
  }

  return { ok: errors.length === 0, errors }
}

/* ────────────────────────────────────────────────────────────────── gel */

/**
 * Gèle et exporte canoniquement un bundle : hash et signature sur les octets
 * canoniques (cahier L82, L417). L'instantané du bundle est conservé dans
 * `frozen_bundle` pour permettre à `verifyFreezeIntegrity` de nommer le champ
 * fautif d'un mismatch ultérieur.
 */
export function freezeCampaign(bundle: PreregistrationBundle): FrozenCampaign {
  const snapshot = clone(bundle)
  const manifestHash = canonicalDigest(asCanonical(snapshot))
  const signature = sign(FREEZE_SIGNING_KEY, asCanonical({ manifest_hash: manifestHash }))

  return {
    schema: 'bench.frozen-campaign/1',
    campaign_id: typeof bundle.campaign_id === 'string' ? bundle.campaign_id : '',
    manifest_hash: manifestHash,
    signature,
    frozen_bundle: snapshot,
  }
}

/* ─────────────────────────────────────────────── vérification d'intégrité */

/** Chemins (notation pointée) où deux valeurs JSON divergent. */
function diffPaths(a: unknown, b: unknown, prefix: string, out: string[]): void {
  const aObj = isPlainObject(a)
  const bObj = isPlainObject(b)
  const aArr = Array.isArray(a)
  const bArr = Array.isArray(b)

  if (aArr && bArr) {
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i += 1) diffPaths(a[i], b[i], `${prefix}[${String(i)}]`, out)
    return
  }
  if (aObj && bObj) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) diffPaths(a[k], b[k], prefix === '' ? k : `${prefix}.${k}`, out)
    return
  }
  if (aArr !== bArr || aObj !== bObj || JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(prefix === '' ? '$' : prefix)
  }
}

/**
 * Revérifie un bundle contre son gel : détecte un mismatch (graine, marge —
 * cahier L69) et nomme le champ fautif.
 */
export function verifyFreezeIntegrity(
  frozen: FrozenCampaign,
  bundle: PreregistrationBundle,
): VerificationReport {
  const expectedHash = typeof frozen.manifest_hash === 'string' ? frozen.manifest_hash : ''
  const currentHash = canonicalDigest(asCanonical(bundle))

  if (expectedHash !== '' && currentHash === expectedHash) {
    return { match: true, mismatched_fields: [], errors: [] }
  }

  const reference = isPlainObject(frozen.frozen_bundle) ? frozen.frozen_bundle : {}
  const mismatched: string[] = []
  diffPaths(reference, bundle, '', mismatched)

  return {
    match: false,
    mismatched_fields: mismatched,
    errors: [
      `GEL_MODIFIE_APRES_COUP : champ(s) modifié(s) depuis le gel = ${
        mismatched.length > 0 ? mismatched.join(', ') : '(hash different, aucun champ localise)'
      }`,
    ],
  }
}

/* ──────────────────────────────────────────────────────── reçu de test */

/**
 * Émet un reçu d'horodatage LOCAL DE TEST (`test_only: true`, L421) — le port
 * d'horodatage substituable qui ne suppose aucune destination externe
 * accessible.
 */
export function issueLocalTestReceipt(frozen: FrozenCampaign): RegistrationReceipt {
  const manifestHash = typeof frozen.manifest_hash === 'string' ? frozen.manifest_hash : ''
  const campaignId = typeof frozen.campaign_id === 'string' ? frozen.campaign_id : ''

  const payload: Json = {
    manifest_hash: manifestHash,
    campaign_id: campaignId,
    test_only: true,
    receipt_id: `RCT-LOCAL-TEST-${manifestHash.slice(0, 16)}`,
  }
  const signature = sign(RECEIPT_SIGNING_KEY, asCanonical(payload))

  return { schema: 'bench.registration-receipt/1', payload, signature }
}

/**
 * Vérifie un reçu d'horodatage contre l'export gelé : signature, charge
 * utile, et fidélité du `registration_status` rendu (L421 — un reçu de test
 * ne peut pas revendiquer un horodatage indépendant réel).
 */
export function verifyRegistrationReceipt(
  frozen: FrozenCampaign,
  receipt: RegistrationReceipt,
): VerificationReport {
  const signature = typeof receipt.signature === 'string' ? receipt.signature : null
  const payload = isPlainObject(receipt.payload) ? receipt.payload : null

  if (signature === null || payload === null) {
    return { valid: false, registration_status: 'rejected_malformed', errors: ['RECU_MALFORME : payload ou signature absent'] }
  }

  const expectedSignature = sign(RECEIPT_SIGNING_KEY, asCanonical(payload))
  if (expectedSignature !== signature) {
    return {
      valid: false,
      registration_status: 'rejected_signature_mismatch',
      errors: ['SIGNATURE_INVALIDE : la charge utile ou la signature du reçu a été altérée'],
    }
  }

  const expectedHash = typeof frozen.manifest_hash === 'string' ? frozen.manifest_hash : ''
  if (typeof payload.manifest_hash !== 'string' || payload.manifest_hash !== expectedHash) {
    return {
      valid: false,
      registration_status: 'rejected_manifest_mismatch',
      errors: ['MANIFEST_HASH_INVALIDE : le reçu ne référence pas cet export gelé'],
    }
  }

  const testOnly = payload.test_only === true
  return {
    valid: true,
    registration_status: testOnly ? 'local_test_receipt' : 'confirmed_registered',
    errors: [],
  }
}
