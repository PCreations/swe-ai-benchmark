// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — geler et préenregistrer les campagnes (cahier L415-L421,
// tâche T30).
//
// SQUELETTE. Étage RED : les cinq rôles ci-dessous sont la CONVENTION D'APPEL
// que `acceptance/T30.spec.ts` publie dans son en-tête (section III) — reprise
// ici à l'identique, nom pour nom. Aucun n'est encore implémenté : chacun lève
// `NotImplemented`, ce que `verification/runner/red.mjs` classe
// `STUB_NOT_IMPLEMENTED`, un rouge légitime (au même titre que
// `ASSERTION_FAILED`) qui prouve que la suite s'exécute réellement plutôt que
// d'échouer au chargement (`MODULE_NOT_FOUND`).
//
//   preflightCampaign(bundle)                le préflight            (L417)
//   freezeCampaign(bundle)                   export signé/haché       (L417)
//   verifyFreezeIntegrity(frozen, bundle)    détection de mismatch    (L69)
//   issueLocalTestReceipt(frozen)            reçu LOCAL DE TEST       (L421)
//   verifyRegistrationReceipt(frozen, recu)  vérification du reçu     (L421)
//
// Aucune règle métier ici : ni comparaison de projets parents, ni hash
// canonique, ni signature, ni dérivation de `registration_status`. Écrire ces
// règles appartient à l'étage GREEN.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

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

/**
 * Préflight d'un bundle de préenregistrement (L417) : disjonction des projets
 * parents entre les splits `calibration`/`test` (A1), qualification et
 * tarification des scénarios (A2), complétude des champs exigés par le mode
 * `confirmed` (A4).
 */
export function preflightCampaign(bundle: PreregistrationBundle): PreregistrationVerdict {
  void bundle
  throw new NotImplemented('scenario.preflightCampaign')
}

/**
 * Gèle et exporte canoniquement un bundle : hash et signature sur les octets
 * canoniques (cahier L82, L417).
 */
export function freezeCampaign(bundle: PreregistrationBundle): FrozenCampaign {
  void bundle
  throw new NotImplemented('scenario.freezeCampaign')
}

/**
 * Revérifie un bundle contre son gel : détecte un mismatch (graine, marge —
 * cahier L69) et nomme le champ fautif.
 */
export function verifyFreezeIntegrity(
  frozen: FrozenCampaign,
  bundle: PreregistrationBundle,
): VerificationReport {
  void frozen
  void bundle
  throw new NotImplemented('scenario.verifyFreezeIntegrity')
}

/**
 * Émet un reçu d'horodatage LOCAL DE TEST (`test_only: true`, L421) — le port
 * d'horodatage substituable qui ne suppose aucune destination externe
 * accessible.
 */
export function issueLocalTestReceipt(frozen: FrozenCampaign): RegistrationReceipt {
  void frozen
  throw new NotImplemented('scenario.issueLocalTestReceipt')
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
  void frozen
  void receipt
  throw new NotImplemented('scenario.verifyRegistrationReceipt')
}
