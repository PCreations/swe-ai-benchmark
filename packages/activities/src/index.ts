// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities : effets externes de l'admission des livraisons, de la
// migration protégée et de la reprise de bascule (cahier L337-L343, T21).
//
// LES TROIS RÔLES, ET D'OÙ VIENNENT LEURS NOMS. Ils ne sont pas choisis ici :
// la section III de l'en-tête de `acceptance/T21.spec.ts` les fixe (le cahier
// ne nomme aucun export pour T21), et `verification/mutants/T21.json` les
// cible par ce même nom primaire.
//
//   admitDelivery(input) -> Promise<AdmitDeliveryResult>
//       Décide ADMITTED/REJECTED selon, DANS CET ORDRE (section III de la
//       suite) : (a) la limite de tentatives (`SUBMISSION_LIMIT`, L341) ;
//       (b) la protection des exigences actives déjà livrées, comptées par
//       id/version ACTIVE (F-REGRESSION, L129) ; (c) les invariants critiques
//       applicables. Publie ensuite, TOUJOURS — même quand le verdict est
//       REJECTED (D5, L65 : « un échec conserve ses dépenses ») — une ligne de
//       coût dans `ledger_entries` sur `ledger_dsn` (PostgreSQL réel, table
//       créée si absente). Quand la soumission est ADMISE, calcule en plus
//       `deployment_coverage` (L97), `backlog` (le sous-ensemble non
//       satisfait de `due_requirements`) et `q` (rationnel exact `{num,den}`,
//       L143 — jamais un flottant).
//   runProtectedMigration(input) -> Promise<RunProtectedMigrationResult>
//       Éprouve `migration_sql` sur un CLONE JETABLE de `from_dsn` — une base
//       PostgreSQL créée `WITH TEMPLATE` sur le même cluster, jamais d'abord
//       sur `from_dsn` (L343 : « la migration est d'abord éprouvée sur
//       copie ») — compare l'ENSEMBLE (pas seulement le compte) des identités
//       métier lues par `read_identities_sql` avant (sur `from_dsn`) et après
//       (sur le clone), et n'applique la migration pour de vrai sur
//       `from_dsn` que si rien n'a été perdu ni dupliqué ; sinon
//       `MIGRATION_REJECTED` (L341, verbatim) et `from_dsn` reste octets pour
//       octets inchangé. Le clone est détruit dans tous les cas (succès,
//       refus ou erreur).
//   resumeDeploymentSwitch(input) -> Promise<ResumeDeploymentSwitchResult>
//       Arbitre, après une panne entre préparation et bascule, entre
//       `prepared_version_id` (si `switch_committed`) et `active_version_id`
//       d'entrée (sinon) — une seule version active cohérente, jamais une
//       troisième valeur, jamais les deux à la fois.
//
// POURQUOI DU `psql` EN SOUS-PROCESSUS, PAS UN DRIVER `pg`. Aucun driver
// PostgreSQL pour Node n'est présent au lockfile de ce dépôt (`packages/
// evaluation/src/private-pg.ts`, T20, prend déjà ce même parti pour la même
// raison) ; en ajouter un ici toucherait `pnpm-lock.yaml`, une zone INFRA,
// pour un besoin que le binaire `psql` déjà requis par `postgres18` couvre
// entièrement. Les DSN reçus (`from_dsn`, `ledger_dsn`) suivent le format que
// `acceptance/T21.spec.ts` fabrique — `postgresql://user@/db?host=<socket>` —
// et ne sont JAMAIS parsables par le `URL` WHATWG de Node (hôte vide après
// `@` : `ERR_INVALID_URL`) ; `parseDsn`/`withDbName` ci-dessous font ce
// travail par une regex volontairement étroite sur la forme
// `scheme://autorité/base?requête`.
//
// Ce fichier ne redéclare aucun rôle de `packages/evaluation` ni
// `packages/domain` (T10, T05) : aucun fichier de ces paquets n'est touché par
// ce commit.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'

/* ══════════════════════ formes du contrat (section III de la suite) ═══════ */

/** Une exigence due à la période, section III.1 de `acceptance/T21.spec.ts`. */
export interface DueRequirement {
  readonly id: string
  readonly version: number
  readonly weight: number
  /** Déjà satisfaite par une soumission ADMISE antérieure, à cette version. */
  readonly prior_satisfied: boolean
}

/** Le candidat évalué par `admitDelivery`, section III.1. */
export interface DeliverySubmission {
  readonly artifact_digest: string
  readonly satisfied_requirement_keys: readonly string[]
  readonly preserved_invariant_ids: readonly string[]
  /** Entier exact (cahier D9, L63) : jamais un flottant monétaire. */
  readonly cost: number
}

/** Entrée de `admitDelivery`, section III.1. */
export interface AdmitDeliveryInput {
  readonly trajectory_id: string
  readonly period_index: number
  readonly attempt: number
  readonly due_requirements: readonly DueRequirement[]
  readonly critical_invariants: readonly string[]
  readonly ledger_dsn: string
  readonly submission: DeliverySubmission
}

/** Sortie de `admitDelivery`, section III.1. */
export interface AdmitDeliveryResult {
  readonly verdict: 'ADMITTED' | 'REJECTED'
  readonly reason?: string
  readonly deployment_coverage: 'NO_DEPLOYMENT' | 'PARTIAL' | 'ACCEPTED'
  readonly backlog: ReadonlyArray<{ readonly id: string; readonly version: number }>
  /** Rationnel exact (cahier L143) — `null` si aucune exigence due. */
  readonly q: { readonly num: number; readonly den: number } | null
}

/** Entrée de `runProtectedMigration`, section III.2. */
export interface RunProtectedMigrationInput {
  readonly from_dsn: string
  readonly read_identities_sql: string
  readonly migration_sql: string
}

/** Sortie de `runProtectedMigration`, section III.2. */
export interface RunProtectedMigrationResult {
  readonly verdict: 'MIGRATED' | 'MIGRATION_REJECTED'
  readonly reason?: string
  readonly record_count_before: number
  readonly record_count_after: number
}

/** Entrée de `resumeDeploymentSwitch`, section III.3. */
export interface ResumeDeploymentSwitchInput {
  readonly active_version_id: string
  readonly prepared_version_id: string
  readonly switch_committed: boolean
}

/** Sortie de `resumeDeploymentSwitch`, section III.3. */
export interface ResumeDeploymentSwitchResult {
  readonly active_version_id: string
}

/* ══════════════════════════ socle PostgreSQL (psql) ══════════════════════ */

const SUBMISSION_LIMIT_ATTEMPTS = 3 // cahier:L341 — « limite de trois »
const SUBMISSION_LIMIT = 'SUBMISSION_LIMIT' // cahier:L341, verbatim
const MIGRATION_REJECTED = 'MIGRATION_REJECTED' // cahier:L341, verbatim

interface PsqlResult {
  readonly ok: boolean
  readonly out: string
}

/** Exécute une commande SQL via `psql -c`, jamais interprétée comme un échec silencieux. */
function runPsql(dsn: string, sql: string): PsqlResult {
  try {
    const out = execFileSync(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsn, '-c', sql],
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() }
  }
}

/** Comme `runPsql`, mais lève une erreur NOMMÉE (rôle appelant + extrait psql) en cas d'échec réel. */
function execSqlOrThrow(dsn: string, sql: string, contexte: string): string {
  const r = runPsql(dsn, sql)
  if (!r.ok) throw new Error(`${contexte} : ${r.out.slice(0, 500)}`)
  return r.out
}

interface ParsedDsn {
  readonly scheme: string
  readonly authority: string
  readonly dbname: string
  readonly query: string
}

/**
 * Analyse un DSN `scheme://autorité/base?requête` — jamais via `URL` WHATWG,
 * qui refuse une autorité sans hôte (`postgresql://user@/base?host=…`, la
 * forme socket Unix que fabrique `acceptance/T21.spec.ts`).
 */
function parseDsn(dsn: string): ParsedDsn {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/]*)\/([^?]*)(\?.*)?$/.exec(dsn)
  if (m === null) throw new Error(`DSN illisible : ${dsn}`)
  const [, scheme, authority, dbPath, query] = m
  return {
    scheme: scheme as string,
    authority: authority as string,
    dbname: decodeURIComponent(dbPath as string),
    query: query ?? '',
  }
}

function withDbName(dsn: string, dbname: string): string {
  const p = parseDsn(dsn)
  return `${p.scheme}://${p.authority}/${encodeURIComponent(dbname)}${p.query}`
}

function usernameOf(dsn: string): string | null {
  const { authority } = parseDsn(dsn)
  const at = authority.indexOf('@')
  if (at === -1) return null
  const user = decodeURIComponent(authority.slice(0, at))
  return user === '' ? null : user
}

function escapeIdent(ident: string): string {
  return ident.replace(/"/g, '""')
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

let cloneCounter = 0
function uniqueCloneName(): string {
  cloneCounter += 1
  return `bench_clone_${process.pid.toString(36)}_${Date.now().toString(36)}_${cloneCounter.toString(36)}`
}

/**
 * Trouve une base admissible pour émettre `CREATE DATABASE … TEMPLATE`, càd
 * une base DIFFÉRENTE de celle qu'on clone (Postgres refuse un template
 * accédé par la session qui le copie). Essaie `postgres`, `template1` puis le
 * nom d'utilisateur du DSN — l'ordre que `acceptance/T21.spec.ts` (ADMIN_DB)
 * utilise déjà pour la même raison.
 */
function findAdminDsn(dsn: string, excludeDbName: string): string {
  const user = usernameOf(dsn)
  const candidats = ['postgres', 'template1', ...(user !== null ? [user] : [])]
  for (const candidat of candidats) {
    if (candidat === excludeDbName) continue
    const candidatDsn = withDbName(dsn, candidat)
    if (runPsql(candidatDsn, 'SELECT 1').ok) return candidatDsn
  }
  throw new Error(
    `runProtectedMigration : aucune base admin disponible pour cloner ${excludeDbName} (essayé : ${candidats.join(', ')})`,
  )
}

/** Lit une colonne texte d'identités métier — une ligne par identité, cahier §III.2. */
function readIdentities(dsn: string, sql: string): string[] {
  const out = execSqlOrThrow(dsn, sql, 'runProtectedMigration.read_identities_sql')
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** Égalité d'ENSEMBLE (pas seulement de cardinal, cf. verification/mutants/T21.json M1). */
function sameIdentitySet(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return false
  const sb = [...before].sort()
  const sa = [...after].sort()
  for (let i = 0; i < sb.length; i += 1) if (sb[i] !== sa[i]) return false
  return true
}

/* ══════════════════════════════════ rôles ══════════════════════════════════ */

/** Admission d'une soumission de livraison (L341 A3/A4/A5/A7/A8). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function admitDelivery(input: AdmitDeliveryInput): Promise<AdmitDeliveryResult> {
  const { trajectory_id, period_index, attempt, due_requirements, critical_invariants, ledger_dsn, submission } =
    input
  const satisfiedKeys = submission.satisfied_requirement_keys
  const preservedInvariants = submission.preserved_invariant_ids

  let verdict: 'ADMITTED' | 'REJECTED' = 'ADMITTED'
  let reason: string | undefined

  // (a) limite de tentatives — cahier:L341, verbatim, priorité absolue.
  if (attempt > SUBMISSION_LIMIT_ATTEMPTS) {
    verdict = 'REJECTED'
    reason = SUBMISSION_LIMIT
  } else {
    // (b) régression sur une exigence ACTIVE et PROTÉGÉE (F-REGRESSION, L129) —
    // comptée par id/version ACTIVE : une exigence remplacée (absente de
    // `due_requirements`) ne peut jamais déclencher cette branche (A4).
    const regressee = due_requirements.find(
      (r) => r.prior_satisfied && !satisfiedKeys.includes(`${r.id}@${String(r.version)}`),
    )
    if (regressee !== undefined) {
      verdict = 'REJECTED'
      reason = `F-REGRESSION : exigence active protégée ${regressee.id}@${String(regressee.version)} n'est plus satisfaite`
    } else {
      // (c) invariant critique applicable non préservé.
      const invariantViole = critical_invariants.find((inv) => !preservedInvariants.includes(inv))
      if (invariantViole !== undefined) {
        verdict = 'REJECTED'
        reason = `INVARIANT_CRITIQUE_VIOLE : ${invariantViole} n'est pas préservé`
      }
    }
  }

  let deploymentCoverage: 'NO_DEPLOYMENT' | 'PARTIAL' | 'ACCEPTED' = 'NO_DEPLOYMENT'
  let backlog: Array<{ id: string; version: number }> = []
  let q: { num: number; den: number } | null = null

  if (verdict === 'ADMITTED') {
    backlog = due_requirements
      .filter((r) => !satisfiedKeys.includes(`${r.id}@${String(r.version)}`))
      .map((r) => ({ id: r.id, version: r.version }))

    if (due_requirements.length === 0) {
      deploymentCoverage = 'NO_DEPLOYMENT'
    } else if (backlog.length === 0) {
      deploymentCoverage = 'ACCEPTED'
    } else {
      deploymentCoverage = 'PARTIAL'
    }

    if (due_requirements.length > 0) {
      const totalWeight = due_requirements.reduce((sum, r) => sum + r.weight, 0)
      const satisfiedWeight = due_requirements
        .filter((r) => satisfiedKeys.includes(`${r.id}@${String(r.version)}`))
        .reduce((sum, r) => sum + r.weight, 0)
      q = { num: satisfiedWeight, den: totalWeight }
    }
  }

  // D5 (L65) : « un échec conserve ses dépenses » — TOUJOURS écrit, quel que
  // soit le verdict, hors de toute transaction que le refus pourrait annuler
  // (verification/mutants/T21.json, M7).
  execSqlOrThrow(
    ledger_dsn,
    'CREATE TABLE IF NOT EXISTS ledger_entries (trajectory_id text, period_index integer, attempt integer, cost bigint, verdict text)',
    'admitDelivery.ledger_entries(create)',
  )
  execSqlOrThrow(
    ledger_dsn,
    `INSERT INTO ledger_entries(trajectory_id, period_index, attempt, cost, verdict) VALUES ` +
      `('${escapeLiteral(trajectory_id)}', ${String(period_index)}, ${String(attempt)}, ${String(submission.cost)}, '${escapeLiteral(verdict)}')`,
    'admitDelivery.ledger_entries(insert)',
  )

  return {
    verdict,
    ...(reason !== undefined ? { reason } : {}),
    deployment_coverage: deploymentCoverage,
    backlog,
    q,
  }
}

/** Migration éprouvée sur copie avant bascule réelle (L341 A1/A2, L343). */
export async function runProtectedMigration(
  input: RunProtectedMigrationInput,
): Promise<RunProtectedMigrationResult> {
  const { from_dsn, read_identities_sql, migration_sql } = input
  const sourceDbName = parseDsn(from_dsn).dbname

  // AVANT : relu sur `from_dsn`, la version active — jamais touchée par
  // `migration_sql` avant que le verdict ne soit connu (L343).
  const before = readIdentities(from_dsn, read_identities_sql)

  const adminDsn = findAdminDsn(from_dsn, sourceDbName)
  const cloneDbName = uniqueCloneName()
  execSqlOrThrow(
    adminDsn,
    `CREATE DATABASE "${escapeIdent(cloneDbName)}" WITH TEMPLATE "${escapeIdent(sourceDbName)}"`,
    'runProtectedMigration.clone(create)',
  )
  const cloneDsn = withDbName(from_dsn, cloneDbName)

  try {
    // `migration_sql` s'exécute D'ABORD sur le clone jetable, JAMAIS d'abord
    // sur `from_dsn` (L343).
    execSqlOrThrow(cloneDsn, migration_sql, 'runProtectedMigration.migration_sql(clone)')
    const after = readIdentities(cloneDsn, read_identities_sql)

    if (!sameIdentitySet(before, after)) {
      return {
        verdict: MIGRATION_REJECTED,
        reason: MIGRATION_REJECTED,
        record_count_before: before.length,
        record_count_after: after.length,
      }
    }

    // Rien n'a été perdu ni dupliqué sur la copie d'épreuve : la bascule
    // réelle peut avoir lieu sur `from_dsn`.
    execSqlOrThrow(from_dsn, migration_sql, 'runProtectedMigration.migration_sql(from_dsn)')
    return {
      verdict: 'MIGRATED',
      record_count_before: before.length,
      record_count_after: after.length,
    }
  } finally {
    // Le clone est JETABLE, quel que soit l'issue (succès, refus ou erreur).
    runPsql(adminDsn, `DROP DATABASE IF EXISTS "${escapeIdent(cloneDbName)}" WITH (FORCE)`)
  }
}

/** Reprise d'une bascule interrompue par une panne (L341 A6). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function resumeDeploymentSwitch(
  input: ResumeDeploymentSwitchInput,
): Promise<ResumeDeploymentSwitchResult> {
  // Une seule version active retenue, jamais une troisième valeur : la
  // préparée si la bascule avait déjà été rendue durable avant la panne,
  // sinon l'active d'entrée — L341.
  return {
    active_version_id: input.switch_committed ? input.prepared_version_id : input.active_version_id,
  }
}
