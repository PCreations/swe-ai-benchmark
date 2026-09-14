// ─────────────────────────────────────────────────────────────────────────────
// Le seul accès à PostgreSQL de @bench/billing.
//
// POURQUOI UNE COPIE MINIMALE, ET PAS UN IMPORT DE @bench/storage. Le
// repository de @bench/storage (T12) n'expose que applyMigrations, openStore,
// closeStore et les rôles d'artefacts : son PsqlSession interne n'est pas un
// export public, et l'emprunter par un chemin profond ferait dépendre
// @bench/billing d'un détail d'implémentation d'un autre paquet plutôt que de
// son contrat. infra/temoins/app/psql.mjs (T09) a pris la même décision pour
// la même raison — psql est un prérequis DÉCLARÉ (requires: postgres18), pas
// une bibliothèque à réexporter.
//
// UN SEUL PROCESSUS psql PAR OPÉRATION. Chaque rôle de ce paquet (réserver,
// régler, importer un reçu…) tient dans UN script envoyé par -c : plusieurs
// instructions séparées par ; dans un même message Query s'exécutent, sauf
// BEGIN/COMMIT explicites, comme UNE SEULE transaction implicite — c'est
// documenté et déjà exploité par packages/storage/src/migrations.ts. Un
// SELECT ... FOR UPDATE sur la ligne budgets y verrouille donc la ligne pour
// la durée du script entier : deux réservations concurrentes sur le MÊME
// budget se sérialisent sur ce verrou, sans session persistante ni barrière
// applicative.
//
// LES PARAMÈTRES NE SONT JAMAIS CONCATÉNÉS DANS DU SQL. Comme
// packages/storage/src/psql.ts : sérialisés en JSON puis encodés en base64
// (alphabet sans guillemet ni antislash), redécodés côté serveur dans une
// table temporaire _p. Le script lit ses entrées par ->>'champ', jamais par
// interpolation de chaîne.
// ─────────────────────────────────────────────────────────────────────────────

import { execFile } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_BUFFER = 16 * 1024 * 1024

export interface PsqlOutcome {
  readonly ok: boolean
  readonly lines: readonly string[]
  readonly error: string
}

/** Encode une valeur JS en littéral `jsonb` ininjectable. */
export function jsonParam(value: unknown): string {
  const b64 = Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
  return `convert_from(decode('${b64}','base64'),'UTF8')::jsonb`
}

/**
 * Préambule commun : dépose `params` dans une table temporaire `_p` (lue par
 * le bloc PL/pgSQL via `->>'champ'`) et prépare `_r`, où ce bloc écrit
 * l'unique ligne de résultat que ce module relit.
 */
export function preamble(params: Record<string, unknown>): string {
  return (
    'CREATE TEMP TABLE _p (j jsonb) ON COMMIT DROP;\n' +
    `INSERT INTO _p VALUES (${jsonParam(params)});\n` +
    'CREATE TEMP TABLE _r (payload jsonb) ON COMMIT DROP;'
  )
}

/** La ligne finale commune à tous les scripts de ce paquet. */
export const READ_RESULT_SQL = 'SELECT payload::text FROM _r;'

function splitLines(s: string): string[] {
  return s.split('\n').filter((l) => l.length > 0)
}

/** Un processus, un script, une transaction implicite (ou pilotée par le script). */
export function psqlOnce(
  dsn: string,
  sql: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<PsqlOutcome> {
  return new Promise<PsqlOutcome>((resolve) => {
    execFile(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsn, '-c', sql],
      { encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err !== null) {
          const detail = `${String(stderr)}\n${err.message}`.trim()
          resolve({ ok: false, lines: [], error: detail })
          return
        }
        resolve({ ok: true, lines: splitLines(String(stdout)), error: '' })
      },
    )
  })
}

/** Résultat d'un script qui écrit sa réponse dans `_r` (voir `preamble`). */
export interface ScriptResult {
  readonly ok: boolean
  readonly payload: Record<string, unknown> | null
  readonly error: string
}

/** Exécute `body` (le bloc PL/pgSQL) après le préambule et lit `_r`. */
export async function runScript(
  dsn: string,
  params: Record<string, unknown>,
  body: string,
): Promise<ScriptResult> {
  const script = `${preamble(params)}\n${body}\n${READ_RESULT_SQL}`
  const outcome = await psqlOnce(dsn, script)
  if (!outcome.ok) return { ok: false, payload: null, error: outcome.error }
  const line = outcome.lines.length > 0 ? outcome.lines[outcome.lines.length - 1] : undefined
  if (line === undefined) {
    return { ok: false, payload: null, error: 'aucune ligne de résultat rendue' }
  }
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, payload: null, error: `résultat non objet : ${line}` }
    }
    return { ok: true, payload: parsed as Record<string, unknown>, error: '' }
  } catch (e) {
    return { ok: false, payload: null, error: `résultat illisible (${(e as Error).message}) : ${line}` }
  }
}
