// ─────────────────────────────────────────────────────────────────────────────
// L'ADAPTATEUR S3 DU PORT `ArtifactStore` (tâche T14, cahier L273-L279).
//
// SQUELETTE. Aucune règle métier n'est écrite ici : ni signature SigV4, ni
// transfert multipart, ni reprise, ni dérivation de clé, ni contrôle
// d'échéance, ni rédaction de rapport d'erreur. Les trois rôles déclarés
// ci-dessous LÈVENT `NotImplemented`, dont le message porte le préfixe
// `NOT_IMPLEMENTED` que `verification/runner/red.mjs` sait lire.
//
// CE QUE L273-L279 DEMANDENT, ET QUI N'EST PAS ICI.
//   L275  « adaptateur S3, service S3 compatible pour les tests locaux et
//         identités limitées par usage » — trois livrables, trois rôles.
//   L277  les six cas d'acceptation : contrat complet sur le service réel,
//         transfert interrompu puis repris, uploads simultanés, identité
//         limitée, expiration d'autorisation, aucun secret dans les rapports.
//   L279  « les préfixes ne sont pas, seuls, un mécanisme d'autorisation ; le
//         contrôle doit être exercé par le stockage ou un service d'accès. »
//         C'est la phrase qui interdit la solution la plus courte — filtrer le
//         préfixe côté client — et elle n'est pas satisfaite par ce fichier.
//
// LES NOMS SONT CEUX DE LA SECTION IV DE `acceptance/T14.spec.ts`, PRIMAIRES ET
// SANS ALIAS. La suite tolère une liste d'alias ; c'est une tolérance de
// NOMMAGE du côté de qui appelle, jamais une invitation à en inventer un ici.
//
// LES TROIS RÔLES QUE T14 AJOUTE AU PAQUET.
//   s3TestServiceConfig()                 coordonnées du service de test  L275
//   openS3ArtifactStore(target)           ouverture de l'adaptateur       L275
//   createScopedIdentity(request)         identité limitée par usage      L275
//
// LES CINQ AUTRES RÔLES QUE LA SUITE APPELLE — putArtifact, getArtifact,
// listArtifacts, extractArchive, artifactSizeLimit — SONT DÉJÀ PUBLIÉS par
// `src/artifacts.ts` (T13) et ne sont pas redéclarés ici : L267 pose UN port,
// et T14 en fournit un second adaptateur, pas un second port.
//
// POURQUOI `s3TestServiceConfig` LÈVE AU LIEU DE RENDRE DES COORDONNÉES.
// La convention d'appel 1 de la suite prévoit un repli sur l'environnement
// (`S3_ENDPOINT`, `S3_BUCKET`, …) et, à défaut, un ÉCHEC qui nomme ce qui
// manque. Publier ici des coordonnées codées en dur ferait passer les cas de la
// plainte « le service de test n'est pas un livrable déclaré » à la plainte
// suivante, sans qu'aucune ligne d'adaptateur n'ait été écrite : ce serait
// avancer le rouge d'un cran en le déguisant en progrès. Le squelette dit la
// vérité — aucun des trois livrables de L275 n'existe encore.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/**
 * Les coordonnées du SERVICE S3 COMPATIBLE POUR LES TESTS LOCAUX (L275).
 *
 * Objet plat : la suite d'acceptation y lit `endpoint`, `region`, `bucket`,
 * `access_key_id` et `secret_access_key`, et rien d'autre.
 */
export interface S3TestServiceConfig {
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
  readonly access_key_id: string
  readonly secret_access_key: string
}

/**
 * La cible d'ouverture de l'adaptateur S3 (convention d'appel 2).
 *
 * `prefix` est le PRÉFIXE D'ARTEFACTS de L559 : il isole les exécutions. Il
 * n'est PAS un mécanisme d'autorisation (L279).
 *
 * `expires_at` est l'ÉCHÉANCE de l'autorisation ouverte — un timestamp UTC
 * ISO 8601 (L80). Au-delà, toute opération doit être refusée par un code qui
 * nomme sa cause, jamais servie par un repli anonyme (L277, cas A5).
 */
export interface S3ArtifactStoreTarget {
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
  readonly prefix: string
  readonly access_key_id: string
  readonly secret_access_key: string
  readonly expires_at?: string
}

/** La demande d'une IDENTITÉ LIMITÉE PAR USAGE (L275, convention d'appel 9). */
export interface ScopedIdentityRequest {
  readonly usage: string
  readonly prefix: string
}

/**
 * Ce qu'une identité limitée par usage doit publier pour être une identité :
 * de quoi SIGNER, et les coordonnées sous lesquelles elle est valide.
 */
export interface ScopedIdentity {
  readonly access_key_id: string
  readonly secret_access_key: string
  readonly endpoint: string
  readonly region: string
  readonly bucket: string
  readonly prefix: string
}

/**
 * Déclare les coordonnées du service S3 de test local (L275).
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function s3TestServiceConfig(): S3TestServiceConfig {
  throw new NotImplemented('storage.s3TestServiceConfig')
}

/**
 * Ouvre l'adaptateur S3 du port `ArtifactStore` sur un seau et un préfixe
 * (L275). Le handle rendu est celui que `putArtifact`, `getArtifact` et
 * `listArtifacts` reçoivent en premier argument.
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function openS3ArtifactStore(_target: unknown): unknown {
  throw new NotImplemented('storage.openS3ArtifactStore')
}

/**
 * Émet une identité limitée par usage (L275). Le MÉCANISME n'est pas imposé —
 * condition de préfixe, seau distinct ou service d'accès — mais L279 exige que
 * le contrôle soit exercé par le STOCKAGE ou un SERVICE D'ACCÈS, et jamais par
 * une vérification côté client.
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function createScopedIdentity(_request: unknown): ScopedIdentity {
  throw new NotImplemented('storage.createScopedIdentity')
}
