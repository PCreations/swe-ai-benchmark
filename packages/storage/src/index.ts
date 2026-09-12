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
// PLUS AUCUN EXPORT NE LÈVE `NotImplemented` : le squelette a disparu avec
// l'implémentation qu'il annonçait.
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

export type {
  PeriodRecord,
  PublishEnvelope,
  PublishFault,
  PublishOptions,
  PublishReceipt,
  ReadQuery,
  StoreTarget,
} from './envelope.js'

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
