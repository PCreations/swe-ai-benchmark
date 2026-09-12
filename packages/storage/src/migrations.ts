// ─────────────────────────────────────────────────────────────────────────────
// Les migrations du schéma central (L257).
//
// L259 : « les migrations futures sont ajoutées comme NOUVEAUX FICHIERS, jamais
// réécriture d'une migration appliquée ». Ce module rend la règle vérifiable
// plutôt que déclarative :
//
//   • les migrations sont des fichiers `.sql` du paquet, appliqués dans l'ordre
//     lexicographique de leur nom ;
//   • `schema_migrations` enregistre, pour chaque migration appliquée, son nom
//     ET L'EMPREINTE SHA-256 DE SON TEXTE. Une réécriture d'un fichier déjà
//     appliqué est donc DÉTECTÉE au prochain démarrage, et refusée — ce qui
//     est la seule façon d'empêcher qu'un schéma diverge silencieusement d'une
//     base à l'autre ;
//   • une migration est appliquée dans UNE transaction implicite (`psql -c`
//     envoie la chaîne entière comme un seul message Query) : son DDL et
//     l'inscription au registre réussissent ou échouent ensemble. PostgreSQL
//     étant transactionnel sur le DDL, une migration interrompue ne laisse pas
//     un schéma à moitié créé.
//
// CE MODULE NE CRÉE PAS LA BASE. La séparation « schéma central / bases des
// applications » (L259) est une décision d'exploitation : `applyMigrations`
// prend une base existante et y installe le schéma central. Créer la base
// serait s'arroger la politique de nommage de l'exploitant.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { psqlOnce, sqlLiteral } from './psql.js'
import { checkTarget } from './envelope.js'
import { StorageRefusal } from './errors.js'

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url))

export interface MigrationFile {
  readonly id: string
  readonly sql: string
  readonly digest: string
}

export interface MigrationReport {
  /** Migrations appliquées PAR CET APPEL, dans l'ordre. */
  readonly applied: readonly string[]
  /** Migrations déjà présentes, laissées telles quelles. */
  readonly already_applied: readonly string[]
  readonly schema_digest: string
}

/** Le registre lui-même, créé hors migration : c'est lui qui les enregistre. */
const REGISTRY_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id text        PRIMARY KEY,
  sql_digest   text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now()
)`

/** Les migrations embarquées dans le paquet, triées par nom. */
export function migrationFiles(): readonly MigrationFile[] {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith('.sql'))
    .sort()
  return names.map((n) => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, n), 'utf8')
    return {
      id: n.replace(/\.sql$/, ''),
      sql,
      digest: createHash('sha256').update(sql, 'utf8').digest('hex'),
    }
  })
}

function unavailable(detail: string): StorageRefusal {
  return new StorageRefusal('STORAGE_UNAVAILABLE', 1, detail)
}

/**
 * Applique le schéma central à la base désignée. Idempotent : une base déjà
 * migrée ne reçoit rien et le rapport le dit.
 */
export async function applyMigrations(target: unknown): Promise<MigrationReport> {
  const { dsn } = checkTarget(target, 'applyMigrations')

  const registry = await psqlOnce(dsn, REGISTRY_DDL)
  if (!registry.ok) throw unavailable(`registre des migrations indisponible : ${registry.error}`)

  const known = await psqlOnce(
    dsn,
    `SELECT migration_id || '|' || sql_digest FROM schema_migrations ORDER BY 1`,
  )
  if (!known.ok) throw unavailable(`registre des migrations illisible : ${known.error}`)

  const seen = new Map<string, string>()
  for (const line of known.lines) {
    const cut = line.lastIndexOf('|')
    if (cut > 0) seen.set(line.slice(0, cut), line.slice(cut + 1))
  }

  const applied: string[] = []
  const alreadyApplied: string[] = []
  const files = migrationFiles()
  if (files.length === 0) throw unavailable(`aucune migration embarquée sous ${MIGRATIONS_DIR}`)

  for (const m of files) {
    const previous = seen.get(m.id)
    if (previous !== undefined) {
      if (previous !== m.digest) {
        // L259 : une migration appliquée ne se réécrit pas. La base porte la
        // preuve de ce qui a réellement été appliqué ; c'est le fichier qui a
        // changé, pas elle.
        throw unavailable(
          `migration ${m.id} réécrite après application ` +
            `(enregistrée ${previous.slice(0, 12)}, embarquée ${m.digest.slice(0, 12)})`,
        )
      }
      alreadyApplied.push(m.id)
      continue
    }
    const script =
      `${m.sql}\nINSERT INTO schema_migrations (migration_id, sql_digest) ` +
      `VALUES (${sqlLiteral(m.id)}, ${sqlLiteral(m.digest)});`
    // eslint-disable-next-line no-await-in-loop -- l'ordre des migrations est le contrat
    const run = await psqlOnce(dsn, script)
    if (!run.ok) throw unavailable(`migration ${m.id} refusée par PostgreSQL : ${run.error}`)
    applied.push(m.id)
  }

  const schemaDigest = createHash('sha256')
    .update(files.map((m) => `${m.id}:${m.digest}`).join('\n'), 'utf8')
    .digest('hex')

  return { applied, already_applied: alreadyApplied, schema_digest: schemaDigest }
}
