// ─────────────────────────────────────────────────────────────────────────────
// La publication transactionnelle (L257).
//
// CE QUE « TRANSACTIONNELLE » VEUT DIRE ICI, ET COMMENT ON LE VOIT. Le
// résultat de période, ses événements de domaine et ses entrées d'outbox sont
// écrits dans UNE seule transaction, dont le `BEGIN` et le `COMMIT` sont
// pilotés depuis ce module. Conséquences directes, chacune observable :
//
//   • une panne AVANT le commit ne laisse ni résultat, ni événement, ni entrée
//     d'outbox — pas parce que le code « pense » à ne rien écrire, mais parce
//     que PostgreSQL annule tout (A4) ;
//   • une panne APRÈS le commit laisse exactement ce qu'une publication saine
//     aurait laissé, et la reprise n'y ajoute rien (A5) ;
//   • vingt publications concurrentes de la même enveloppe produisent une
//     seule ligne logique, arbitrée par la base et non par une vérification
//     applicative qui aurait sa fenêtre (A2).
//
// LE VERROU CONSULTATIF, ET POURQUOI IL N'EST PAS UN RACCOURCI.
// `pg_advisory_xact_lock(hash(clé))` sérialise les transactions qui portent la
// MÊME clé d'idempotence, et elles seules. Il ferme la fenêtre entre « je
// regarde si la clé existe » et « je l'insère » — fenêtre qui, sous vingt
// appelants simultanés, décide entre un refus mutuel et un rejeu propre. Il ne
// REMPLACE pas l'unicité : `periods.idempotency_key` reste clé primaire, et
// c'est elle qui arbitre si deux processus différents (donc deux verrous
// différents, par exemple après un redémarrage) arrivaient ensemble. L'un est
// une politique d'attente, l'autre une garantie ; T12.M3 et T12.M5 tuent la
// seconde, pas la première.
//
// LES QUATRE POINTS D'INJECTION SONT DES LIVRABLES (L141), pas des commodités
// de test. Trois d'entre eux agissent CÔTÉ SERVEUR ou sur la frontière
// transactionnelle réelle :
//   BEFORE_COMMIT          le travail est fait, puis `ROLLBACK` — la panne est
//                          celle d'une transaction, pas celle d'un `if` ;
//   AFTER_COMMIT           `COMMIT` réussit, puis le reçu n'est pas rendu ;
//   CONFLICT_*             le serveur lève un vrai `40001`
//                          (`serialization_failure`) à l'intérieur du bloc, et
//                          la boucle de reprise l'absorbe comme elle absorbe
//                          un conflit non provoqué.
// Un point d'injection qui court-circuiterait le chemin réel ne prouverait que
// lui-même.
//
// LA LIMITE DE REPRISE EST PUBLIÉE. L261 dit « selon une limite FIXÉE » sans
// en donner la valeur ; le paquet l'annonce donc (`publishRetryLimit`) et la
// RESPECTE exactement : un refus « limite atteinte » porte `attempts` égal à
// cette limite. Annoncer un nombre que la boucle ne suit pas serait le nom
// d'une borne, pas une borne (T12.M9).
// ─────────────────────────────────────────────────────────────────────────────

import { jsonParameter } from './psql.js'
import type { PsqlSession } from './psql.js'
import { CentralStore, isCentralStore } from './store.js'
import { StorageRefusal } from './errors.js'
import { checkEnvelope, checkOptions, trajectoryIdOf } from './envelope.js'
import type { PublishEnvelope, PublishOptions, PublishReceipt } from './envelope.js'

/**
 * La limite fixée de reprise sur conflit de transaction (L261, A6).
 *
 * CINQ, et le nombre est arbitraire au sens où le cahier n'en fixe aucun : ce
 * qui est contraint, c'est qu'il en existe un, qu'il soit fini, qu'il autorise
 * au moins une reprise, et que le comportement l'observe. Une borne trop basse
 * transformerait une contention passagère en échec ; une borne absente
 * transformerait un conflit permanent en attente sans fin.
 */
export const PUBLISH_RETRY_LIMIT = 5

/** La limite, sous la forme d'un rôle interrogeable (convention d'appel IV.7). */
export function publishRetryLimit(): number {
  return PUBLISH_RETRY_LIMIT
}

/* ─────────────────────────────────────────────────────── le bloc décisif */

/**
 * Tout le travail de la publication, côté serveur, dans la transaction ouverte
 * par l'appelant. Le bloc ne LÈVE jamais vers `psql` : il capture son issue
 * dans `_r`. Deux tubes n'ayant pas d'ordre garanti entre eux, lire un verdict
 * sur `stderr` serait une course ; ici l'issue arrive par le même canal que les
 * données, donc dans l'ordre.
 */
const DECISIVE_SQL = `
DO $bench$
DECLARE
  p        jsonb;
  idn      jsonb;
  k        text;
  d        text;
  tid      text;
  inj      text;
  existing text;
  ev       jsonb;
  n        integer := 0;
BEGIN
  SELECT j INTO p FROM _p;
  idn := p->'identity';
  k   := p->>'idempotency_key';
  d   := p->>'input_digest';
  tid := p->>'trajectory_id';
  inj := p->>'inject';

  -- Ferme la fenêtre entre la lecture et l'écriture, pour cette clé seulement.
  PERFORM pg_advisory_xact_lock(hashtextextended(k, 0));

  SELECT pr.input_digest INTO existing FROM periods pr WHERE pr.idempotency_key = k;

  IF existing IS NOT NULL THEN
    IF existing <> d THEN
      -- D-6 : même clé, autre empreinte. L'état enregistré n'est pas touché.
      INSERT INTO _r VALUES (jsonb_build_object(
        'outcome', 'IDEMPOTENCY_CONFLICT',
        'stored_digest', existing,
        'events_written', 0));
      RETURN;
    END IF;
    IF inj = 'CONFLICT' THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'BENCH_INJECTED_SERIALIZATION_FAILURE';
    END IF;
    -- Rejeu à l'identique : accepté, et rien n'est réécrit.
    INSERT INTO _r VALUES (jsonb_build_object('outcome', 'REPLAYED', 'events_written', 0));
    RETURN;
  END IF;

  INSERT INTO campaigns (campaign_id)
    VALUES (idn->>'campaign_id')
    ON CONFLICT (campaign_id) DO NOTHING;

  INSERT INTO trajectories (trajectory_id, campaign_id, parent_project_id,
                            scenario_id, configuration_id, repetition_id, budget_id)
    VALUES (tid, idn->>'campaign_id', idn->>'parent_project_id',
            idn->>'scenario_id', idn->>'configuration_id',
            idn->>'repetition_id', idn->>'budget_id')
    ON CONFLICT (trajectory_id) DO NOTHING;

  INSERT INTO periods (idempotency_key, input_digest, trajectory_id,
                       period_index, identity, result)
    VALUES (k, d, tid, (idn->>'period_index')::integer, idn, p->'result');

  FOR ev IN SELECT value FROM jsonb_array_elements(p->'events') LOOP
    n := n + 1;
    INSERT INTO domain_events (idempotency_key, event_seq, event_type, occurred_at, payload)
      VALUES (k, n, coalesce(ev->>'event_type', 'UNTYPED'),
              (ev->>'occurred_at')::timestamptz, ev)
      ON CONFLICT (idempotency_key, event_seq) DO NOTHING;
    INSERT INTO outbox (idempotency_key, event_seq, topic, payload)
      VALUES (k, n, coalesce(ev->>'event_type', 'UNTYPED'), ev)
      ON CONFLICT (idempotency_key, event_seq) DO NOTHING;
  END LOOP;

  IF inj = 'CONFLICT' THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'BENCH_INJECTED_SERIALIZATION_FAILURE';
  END IF;

  INSERT INTO _r VALUES (jsonb_build_object('outcome', 'PUBLISHED', 'events_written', n));
EXCEPTION
  WHEN serialization_failure OR deadlock_detected OR unique_violation THEN
    INSERT INTO _r VALUES (jsonb_build_object(
      'outcome', 'CONFLICT', 'sqlstate', SQLSTATE, 'detail', SQLERRM, 'events_written', 0));
  WHEN OTHERS THEN
    INSERT INTO _r VALUES (jsonb_build_object(
      'outcome', 'STORAGE_ERROR', 'sqlstate', SQLSTATE, 'detail', SQLERRM, 'events_written', 0));
END
$bench$;
SELECT payload::text FROM _r;`

interface ServerOutcome {
  readonly outcome: string
  readonly events_written: number
  readonly detail: string
  readonly sqlstate: string
}

function readOutcome(line: string): ServerOutcome | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const outcome = o['outcome']
  if (typeof outcome !== 'string') return null
  const written = o['events_written']
  return {
    outcome,
    events_written: typeof written === 'number' ? written : 0,
    detail: typeof o['detail'] === 'string' ? o['detail'] : '',
    sqlstate: typeof o['sqlstate'] === 'string' ? o['sqlstate'] : '',
  }
}

/* ────────────────────────────────────────────────────────────── le rôle */

function requireStore(handle: unknown): CentralStore {
  if (!isCentralStore(handle)) {
    throw new StorageRefusal(
      'STORAGE_UNAVAILABLE',
      1,
      'le premier argument doit être un repository rendu par openStore',
    )
  }
  if (handle.closed) {
    throw new StorageRefusal('STORAGE_UNAVAILABLE', 1, 'repository déjà fermé')
  }
  return handle
}

function preambleSql(env: PublishEnvelope, trajectoryId: string, inject: boolean): string {
  const params = {
    idempotency_key: env.idempotency_key,
    input_digest: env.input_digest,
    trajectory_id: trajectoryId,
    identity: env.identity,
    result: env.result,
    events: env.events,
    inject: inject ? 'CONFLICT' : null,
  }
  return (
    'BEGIN;\n' +
    'CREATE TEMP TABLE _p (j jsonb) ON COMMIT DROP;\n' +
    `INSERT INTO _p VALUES (${jsonParameter(params)});\n` +
    'CREATE TEMP TABLE _r (payload jsonb) ON COMMIT DROP;'
  )
}

/**
 * La barrière de L141. Elle est attendue UNE FOIS PAR TENTATIVE, après
 * l'ouverture de la transaction et avant l'écriture décisive : c'est ce qui
 * permet à N appelants d'arriver au même point avant d'être libérés ensemble.
 * Une barrière qui échoue n'est pas une raison d'annuler une transaction
 * valide — elle n'appartient pas au domaine.
 */
async function passBarrier(options: PublishOptions): Promise<void> {
  const barrier = options.barrier
  if (barrier === undefined) return
  try {
    await barrier()
  } catch {
    /* une barrière qui lève ne décide de rien : on continue la tentative */
  }
}

async function rollbackQuiet(session: PsqlSession): Promise<void> {
  await session.send('ROLLBACK;')
}

/**
 * Publie un résultat de période, ses événements de domaine et ses entrées
 * d'outbox dans UNE transaction, en reprenant sur conflit jusqu'à la limite
 * publiée.
 */
export async function publishPeriodResult(
  handle: unknown,
  envelope: unknown,
  options?: unknown,
): Promise<PublishReceipt> {
  const store = requireStore(handle)
  const env = checkEnvelope(envelope)
  const opts = checkOptions(options)
  const trajectoryId = trajectoryIdOf(env.identity)
  const limit = PUBLISH_RETRY_LIMIT

  const session = await store.acquire()
  let healthy = true
  let inTransaction = false
  try {
    for (let attempts = 1; attempts <= limit; attempts += 1) {
      const inject =
        opts.fault === 'CONFLICT_EVERY_ATTEMPT' ||
        (opts.fault === 'CONFLICT_ONCE' && attempts === 1)

      const opened = await session.send(preambleSql(env, trajectoryId, inject))
      if (!opened.ok) {
        healthy = false
        throw new StorageRefusal(
          'STORAGE_UNAVAILABLE',
          attempts,
          `ouverture de transaction refusée : ${opened.error}`,
        )
      }
      inTransaction = true

      await passBarrier(opts)

      const decided = await session.send(DECISIVE_SQL)
      const line = decided.lines.length === 1 ? decided.lines[0] : undefined
      const server = line === undefined ? null : readOutcome(line)
      if (!decided.ok || server === null) {
        healthy = decided.ok
        await rollbackQuiet(session)
        inTransaction = false
        throw new StorageRefusal(
          'STORAGE_UNAVAILABLE',
          attempts,
          `publication sans issue lisible : ${decided.error || decided.lines.join(' ')}`,
        )
      }

      if (server.outcome === 'CONFLICT') {
        await rollbackQuiet(session)
        inTransaction = false
        if (attempts >= limit) {
          throw new StorageRefusal(
            'PUBLISH_RETRY_EXHAUSTED',
            attempts,
            `limite de reprise atteinte sur conflit de transaction ` +
              `(dernier SQLSTATE ${server.sqlstate})`,
          )
        }
        continue
      }

      if (server.outcome === 'IDEMPOTENCY_CONFLICT') {
        await rollbackQuiet(session)
        inTransaction = false
        throw new StorageRefusal(
          'IDEMPOTENCY_CONFLICT',
          attempts,
          `la clé ${env.idempotency_key} porte déjà une autre empreinte d entrée`,
        )
      }

      if (server.outcome !== 'PUBLISHED' && server.outcome !== 'REPLAYED') {
        await rollbackQuiet(session)
        inTransaction = false
        throw new StorageRefusal(
          'STORAGE_UNAVAILABLE',
          attempts,
          `PostgreSQL a refusé la publication (${server.sqlstate}) : ${server.detail}`,
        )
      }

      if (opts.fault === 'BEFORE_COMMIT') {
        // L141 : la panne survient DANS la transaction. Rien n'est commité,
        // donc rien n'est visible — pas même l'entrée d'outbox.
        await rollbackQuiet(session)
        inTransaction = false
        throw new StorageRefusal(
          'FAULT_BEFORE_COMMIT',
          attempts,
          'point d injection nommé : la transaction est annulée avant son commit',
        )
      }

      const committed = await session.send('COMMIT;')
      if (!committed.ok) {
        await rollbackQuiet(session)
        inTransaction = false
        if (attempts >= limit) {
          throw new StorageRefusal(
            'PUBLISH_RETRY_EXHAUSTED',
            attempts,
            `limite de reprise atteinte au commit : ${committed.error}`,
          )
        }
        continue
      }
      inTransaction = false

      if (opts.fault === 'AFTER_COMMIT') {
        // L141 : le commit a eu lieu ; c'est le reçu qui se perd. La reprise
        // republie la même enveloppe et ne doit rien dupliquer (A5).
        throw new StorageRefusal(
          'FAULT_AFTER_COMMIT',
          attempts,
          'point d injection nommé : le commit a eu lieu, le reçu ne revient pas',
        )
      }

      return {
        idempotency_key: env.idempotency_key,
        input_digest: env.input_digest,
        attempts,
        inserted: server.outcome === 'PUBLISHED',
        events_written: server.events_written,
      }
    }
    throw new StorageRefusal(
      'PUBLISH_RETRY_EXHAUSTED',
      limit,
      'limite de reprise atteinte sur conflit de transaction',
    )
  } finally {
    if (inTransaction) await rollbackQuiet(session)
    store.release(session, healthy)
  }
}
