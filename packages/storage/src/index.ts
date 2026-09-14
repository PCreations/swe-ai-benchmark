// ─────────────────────────────────────────────────────────────────────────────
// @bench/storage — persistance des événements et résultats dans PostgreSQL
// (cahier L255-L263, tâche T12).
//
// LIVRABLES, ET OÙ ILS VIVENT.
//   migrations du schéma central   migrations/*.sql  +  src/migrations.ts
//   repositories                   src/store.ts
//   outbox et publication transactionnelle
//                                  src/publish.ts  (une transaction, trois
//                                  tables : périodes, événements, outbox)
//
// LES SIX RÔLES PUBLIÉS. Ils portent les noms que la tâche leur donne, sans
// alias : un alias est une tolérance de NOMMAGE du côté de qui appelle, jamais
// une invitation à en inventer un ici.
//
//   applyMigrations({ dsn })                  schéma central          (L257)
//   openStore({ dsn })                        repository              (L257)
//   closeStore(handle)                        arrêt observable        (L261 A1)
//   publishPeriodResult(h, env, opts?)        publication transac.    (L257)
//   readPeriodResult(h, { idempotency_key })  relecture               (L261 A1)
//   publishRetryLimit()                       la limite fixée         (L261 A6)
//
// LES SIX RÔLES D'ARTEFACTS de T13 (L265-L272) sont publiés plus bas, et les
// TROIS RÔLES DE T14 (L273-L279) à leur suite. Aucun des quinze rôles de T12,
// T13 et T14 ne lève `NotImplemented` : leurs squelettes ont disparu avec les
// implémentations qu'ils annonçaient. Ce que les rôles d'artefacts lèvent est
// un `ArtifactRefusal`, qui porte un code nommant sa cause — src/artifacts.ts
// décrit le port, src/artifact-local.ts son adaptateur sur un répertoire,
// src/artifact-s3.ts son adaptateur sur un service objet réel, et
// src/s3-test-service.ts le service de test local et ses identités limitées
// par usage. LES SIX RÔLES DE T15 (L281-L290, src/checkpoint.ts) sont publiés
// à la suite de T14 : eux LÈVENT `NotImplemented` — c'est le squelette ROUGE
// de la tâche en cours, pas encore rempli de règles.
//
// CE QUE CE PAQUET NE PRÉTEND PAS FAIRE. Une transaction garantit les effets
// LOCAUX ; elle ne rend pas une requête fournisseur distante exactement unique
// (L263 le dit en toutes lettres — c'est T17). La cohérence d'un point de
// reprise entre base, fichiers et files est la barrière de T15 ; les invariants
// comptables sont ceux de T16. `@bench/storage` porte les tables de ces trois
// tâches parce que L259 les énumère dans le schéma central, et les laisse
// vides.
// ─────────────────────────────────────────────────────────────────────────────

import { CentralStore, isCentralStore } from './store.js'
import { checkTarget } from './envelope.js'
import { StorageRefusal } from './errors.js'

export { applyMigrations, migrationFiles } from './migrations.js'
export type { MigrationFile, MigrationReport } from './migrations.js'

export { publishPeriodResult, publishRetryLimit, PUBLISH_RETRY_LIMIT } from './publish.js'

export { readPeriodResult } from './read.js'

export { CentralStore, isCentralStore } from './store.js'

export { STORAGE_REFUSAL_CODES, StorageRefusal, isStorageRefusal } from './errors.js'
export type { StorageRefusalCode } from './errors.js'

// ── T13 — stockage immuable d'artefacts (L265-L272).
//
//    openArtifactStore({ root })                    adaptateur local     L267
//    putArtifact(h, octets, opts?)                  manifeste de contenu L267
//    getArtifact(h, ref)                            relecture exacte     L269
//    listArtifacts(h)                               objets FINAUX        L269
//    extractArchive(h, { archive_path, dest_dir })  extraction bornée    L269
//    artifactSizeLimit()                            limite déclarée      L271
export {
  openArtifactStore,
  putArtifact,
  getArtifact,
  listArtifacts,
  extractArchive,
  artifactSizeLimit,
} from './artifacts.js'
export {
  ARTIFACT_DIGEST_ALGORITHM,
  ARTIFACT_SIZE_LIMIT_BYTES,
  LocalArtifactStore,
  isLocalArtifactStore,
} from './artifacts.js'
export type {
  ArtifactFault,
  ArtifactManifest,
  ArtifactStoreTarget,
  ExtractArchiveReport,
  ExtractArchiveRequest,
  PutArtifactOptions,
} from './artifacts.js'

export { ARTIFACT_REFUSAL_CODES, ArtifactRefusal, isArtifactRefusal } from './artifact-errors.js'
export type { ArtifactRefusalCode } from './artifact-errors.js'

// ── T14 — adaptateur S3 et son test de contrat réel (L273-L279).
//    Les cinq autres rôles que la suite d'acceptation de T14 appelle —
//    putArtifact, getArtifact, listArtifacts, extractArchive,
//    artifactSizeLimit — sont ceux de T13, publiés plus haut : L267 pose UN
//    port, T14 lui ajoute un adaptateur, et les trois rôles d'écriture
//    reconnaissent le magasin qu'on leur donne.
//
//    s3TestServiceConfig()          service S3 compatible pour les tests  L275
//    openS3ArtifactStore(target)    adaptateur S3                         L275
//    createScopedIdentity(request)  identité limitée par usage            L275
export { s3TestServiceConfig, openS3ArtifactStore, createScopedIdentity } from './artifact-s3.js'
export { S3ArtifactStore, isS3ArtifactStore } from './artifact-s3.js'
export type {
  S3ArtifactFault,
  S3ArtifactStoreTarget,
  S3PutArtifactOptions,
  S3TestServiceConfig,
  ScopedIdentity,
  ScopedIdentityRequest,
} from './artifact-s3.js'

export type {
  PeriodRecord,
  PublishEnvelope,
  PublishFault,
  PublishOptions,
  PublishReceipt,
  ReadQuery,
  StoreTarget,
} from './envelope.js'

// ── T15 — checkpoints coherents (L281-L290). SQUELETTE : les six roles
//    ci-dessous levent `NotImplemented` (aucune regle metier n'est ecrite).
//    Ils reutilisent le port ArtifactStore de T13/T14 (ci-dessus) sans le
//    redeclarer.
//
//    openCheckpointCoordinator({ admin_dsn, app_database, artifact_store })
//    applyOperation(h, { operation_sequence, fact })
//    beginCheckpoint(h, { after_operation })
//    finishCheckpoint(h, token, { components })
//    listCheckpoints(h)
//    restoreCheckpoint(h, { checkpoint_id })
export {
  openCheckpointCoordinator,
  applyOperation,
  beginCheckpoint,
  finishCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from './checkpoint.js'
export type {
  BeginCheckpointRequest,
  CheckpointCoordinatorTarget,
  CheckpointOperation,
  FinishCheckpointRequest,
  RestoreCheckpointRequest,
} from './checkpoint.js'

/**
 * Ouvre un repository sur le schéma central (L257).
 *
 * L'ouverture ne contacte pas PostgreSQL : les connexions sont créées à la
 * demande, ce qui évite qu'un pool de vingt sessions soit payé par un appelant
 * qui n'en publiera qu'une. Le premier appel réel dira si la base répond.
 */
export function openStore(target: unknown): CentralStore {
  const { dsn } = checkTarget(target, 'openStore')
  return new CentralStore(dsn)
}

/**
 * Ferme le repository. A1 exige que l'arrêt soit OBSERVABLE : cette fonction
 * ne rend la main qu'une fois chaque processus `psql` réellement sorti.
 */
export async function closeStore(handle: unknown): Promise<void> {
  if (!isCentralStore(handle)) {
    throw new StorageRefusal(
      'STORAGE_UNAVAILABLE',
      1,
      'closeStore attend un repository rendu par openStore',
    )
  }
  await handle.close()
}
