// ─────────────────────────────────────────────────────────────────────────────
// La relecture d'un résultat publié (L261, A1).
//
// CE QUI EST RENDU, ET SOUS QUELLE FORME. `identity` et `result` ont été
// stockés VERBATIM en `jsonb` : la relecture les rend tels qu'ils ont été
// publiés, y compris `spend_micro_usd` qui reste une CHAÎNE (L80 — un montant
// qui traverserait le stockage en `numeric` ressortirait en flottant, et la
// perte serait silencieuse).
//
// UNE CLÉ INCONNUE REND UNE VALEUR VIDE, PAS UNE ERREUR. C'est ce qui distingue
// « rien n'a été publié sous cette clé » (A4, A6) d'une panne. Rendre vide pour
// une clé publiée serait un échec ; lever pour une clé absente en serait un
// autre, de sens opposé.
// ─────────────────────────────────────────────────────────────────────────────

import { jsonParameter } from './psql.js'
import { isCentralStore } from './store.js'
import { StorageRefusal } from './errors.js'
import { checkQuery } from './envelope.js'
import type { PeriodRecord } from './envelope.js'

function readSql(key: string): string {
  return (
    'SELECT jsonb_build_object(' +
    "'idempotency_key', p.idempotency_key," +
    "'input_digest', p.input_digest," +
    "'identity', p.identity," +
    "'result', p.result," +
    "'period_index', p.period_index," +
    `'published_at', to_char(p.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` +
    ')::text FROM periods p, (SELECT ' +
    jsonParameter({ idempotency_key: key }) +
    " AS j) q WHERE p.idempotency_key = q.j->>'idempotency_key';"
  )
}

/**
 * Rend l'enregistrement publié sous cette clé, ou `null` si la clé est
 * inconnue.
 */
export async function readPeriodResult(
  handle: unknown,
  query: unknown,
): Promise<PeriodRecord | null> {
  if (!isCentralStore(handle)) {
    throw new StorageRefusal(
      'STORAGE_UNAVAILABLE',
      1,
      'le premier argument doit être un repository rendu par openStore',
    )
  }
  if (handle.closed) throw new StorageRefusal('STORAGE_UNAVAILABLE', 1, 'repository déjà fermé')
  const { idempotency_key: key } = checkQuery(query)

  const session = await handle.acquire()
  let healthy = true
  try {
    const out = await session.send(readSql(key))
    if (!out.ok) {
      healthy = false
      throw new StorageRefusal('STORAGE_UNAVAILABLE', 1, `relecture impossible : ${out.error}`)
    }
    const line = out.lines.length >= 1 ? out.lines[0] : undefined
    if (line === undefined) return null
    return JSON.parse(line) as PeriodRecord
  } finally {
    handle.release(session, healthy)
  }
}
