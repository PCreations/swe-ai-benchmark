// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins/app/operations.mjs — les cinq OPÉRATIONS MÉTIER du contrat HTTP
// public, écrites en PL/pgSQL et générées par VERSION.
//
// POURQUOI LA GÉNÉRATION EST EN JAVASCRIPT ET LA LOGIQUE EN PL/pgSQL. Ce qui
// dépend de la version (une colonne qui n'existe pas encore, une contrainte qui
// change, un locataire qui n'est pas né) est décidé ICI, à la construction du
// script ; ce qui dépend des DONNÉES est décidé LÀ-BAS, dans la transaction.
// Le partage n'est pas cosmétique : une instruction PL/pgSQL n'est planifiée
// qu'à sa première exécution, si bien qu'un branchement `IF version >= 4` autour
// d'un `SELECT … FROM tenants` passerait — mais un branchement oublié ne serait
// découvert qu'au moment de l'exécuter. En générant le corps par version, une
// version ne peut littéralement pas contenir le SQL d'une autre.
//
// POURQUOI TOUT TIENT DANS UN SEUL APPEL. `psql -c` enveloppe le script dans
// UNE transaction (voir psql.mjs). Le verrou consultatif pris en tête de chaque
// opération est donc tenu jusqu'au COMMIT : deux demandes concurrentes libérées
// par la barrière de T09.A2 sur le MÊME créneau s'exécutent l'une après l'autre,
// et la seconde VOIT la réservation de la première. C'est ce qui rend le
// surbooking impossible sans jamais interroger une horloge.
//
// LES FAUTES SONT DES VARIANTES DE CE GÉNÉRATEUR, pas des copies du programme :
// une fixture fautive est le témoin conforme avec UNE altération nommée, ce qui
// garantit que la différence observée est bien celle que la fixture annonce.
// ─────────────────────────────────────────────────────────────────────────────

/** Rendu ISO-8601 UTC à la milliseconde — la forme que l'export publie. */
const iso = (expr) => `to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

/** Le locataire n'existe comme colonne qu'à partir du palier 4. */
const multi = (v) => v >= 4

/** Cahier L119 : « annulation au moins 24 heures avant le début ». */
export const DELAI_ANNULATION = "interval '24 hours'"

/** Prédicat de créneau, selon que le locataire est matérialisé ou non. */
const predCreneau = (v, alias) =>
  multi(v) ? `${alias}.slot_key = v_slot AND ${alias}.tenant = v_tenant` : `${alias}.slot_key = v_slot`

/* ══════════════════════════════════════════════════════ declare_slot ═══ */

export function declareSlot(v, fautes) {
  void fautes
  const colonnes = ['slot_key', 'capacity', 'starts_at']
  const valeurs = ['v_slot', 'v_cap', 'v_start']
  const majs = ['capacity = EXCLUDED.capacity', 'starts_at = EXCLUDED.starts_at']
  if (v >= 3) {
    colonnes.push('cancellation_deadline')
    valeurs.push(`v_start - ${DELAI_ANNULATION}`)
    majs.push('cancellation_deadline = EXCLUDED.cancellation_deadline')
  }
  if (multi(v)) {
    colonnes.push('tenant')
    valeurs.push('v_tenant')
  }
  return `
DECLARE
  p jsonb; v_tenant text; v_slot text; v_cap integer; v_start timestamptz;
BEGIN
  SELECT j INTO p FROM _p;
  v_tenant := p->>'tenant';
  v_slot   := p->>'slot';
  v_cap    := (p->>'capacity')::integer;
  v_start  := (p->>'starts_at')::timestamptz;

  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_tenant,'') || '/' || coalesce(v_slot,''), 0));
${gardeLocataire(v, 'v_tenant')}
  INSERT INTO slots(${colonnes.join(', ')}) VALUES (${valeurs.join(', ')})
  ON CONFLICT ON CONSTRAINT slots_pk DO UPDATE SET ${majs.join(', ')};

  INSERT INTO _r VALUES (jsonb_build_object('http', 201, 'body', jsonb_build_object(
    'ok', true, 'slot', v_slot, 'capacity', v_cap, 'starts_at', ${iso('v_start')})));
END`
}

/* ═══════════════════════════════════════════════════════════ reserve ═══ */

export function reserve(v, fautes) {
  const capaciteServie = fautes.overbook_by_one ? 'v_cap + 1' : 'v_cap'
  const auDela =
    v >= 2
      ? `    v_status := 'waiting';`
      : `    INSERT INTO _r VALUES (jsonb_build_object('http', 409, 'body', jsonb_build_object(
      'ok', false, 'code', 'CAPACITY_FULL', 'slot', v_slot)));
    RETURN;`
  const colonnes = ['reservation_id', 'actor', 'slot_key', 'status', 'admission_sequence', 'requested_at']
  const valeurs = ['v_id', 'v_actor', 'v_slot', 'v_status', 'v_seq', 'v_at']
  if (multi(v)) {
    colonnes.push('tenant')
    valeurs.push('v_tenant')
  }
  // `drop-one-row` : la réponse annonce le succès, la ligne n'est jamais
  // écrite, et cela n'arrive QU'UNE FOIS par base — d'où le témoin de
  // `bench_meta`. La perte est donc EXACTEMENT d'une réservation, silencieuse,
  // et invisible du client qui l'a demandée.
  const perteSilencieuse = fautes.drop_one_row
    ? `
  IF NOT EXISTS (SELECT 1 FROM bench_meta WHERE k = 'fault_drop_one_row') THEN
    INSERT INTO bench_meta(k, v) VALUES ('fault_drop_one_row', v_id);
    v_body := jsonb_build_object('ok', true, 'id', v_id, 'actor', v_actor,
      'slot', v_slot, 'reservation_status', v_status, 'sequence', v_seq);
    INSERT INTO operations(idempotency_key, operation, input_digest, http_status, response)
      VALUES (v_key, 'reserve', v_digest, 201, v_body);
    INSERT INTO _r VALUES (jsonb_build_object('http', 201, 'body', v_body));
    RETURN;
  END IF;
`
    : ''
  return `
DECLARE
  p jsonb; v_tenant text; v_actor text; v_slot text; v_at timestamptz;
  v_seq bigint; v_key text; v_digest text;
  v_prev operations%ROWTYPE; v_cap integer; v_conf integer;
  v_status text; v_id text; v_body jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  v_tenant := p->>'tenant';
  v_actor  := p->>'actor';
  v_slot   := p->>'slot';
  v_at     := (p->>'at')::timestamptz;
  v_seq    := (p->>'sequence')::bigint;
  v_key    := p->>'idempotency_key';
  v_digest := p->>'input_digest';

  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_tenant,'') || '/' || coalesce(v_slot,''), 0));

  -- Invariant D-6 : même clé + même empreinte d'entrée = même réponse, sans
  -- second effet. Même clé + entrée différente = refus métier.
  SELECT * INTO v_prev FROM operations WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_prev.input_digest = v_digest THEN
      INSERT INTO _r VALUES (jsonb_build_object('http', v_prev.http_status,
        'body', v_prev.response || jsonb_build_object('replayed', true)));
    ELSE
      INSERT INTO _r VALUES (jsonb_build_object('http', 409, 'body', jsonb_build_object(
        'ok', false, 'code', 'IDEMPOTENCY_MISMATCH')));
    END IF;
    RETURN;
  END IF;
${gardeLocataire(v, 'v_tenant')}
  SELECT s.capacity INTO v_cap FROM slots s WHERE ${predCreneau(v, 's')};
  IF NOT FOUND THEN
    INSERT INTO _r VALUES (jsonb_build_object('http', 404, 'body', jsonb_build_object(
      'ok', false, 'code', 'SLOT_NOT_FOUND', 'slot', v_slot)));
    RETURN;
  END IF;

  SELECT count(*) INTO v_conf FROM reservations r
   WHERE ${predCreneau(v, 'r')} AND r.status = 'confirmed';

  IF v_conf < ${capaciteServie} THEN
    v_status := 'confirmed';
  ELSE
${auDela}
  END IF;

  v_id := 'resv_' || lpad(nextval('reservation_ids')::text, 9, '0');
${perteSilencieuse}
  INSERT INTO reservations(${colonnes.join(', ')}) VALUES (${valeurs.join(', ')});

  v_body := jsonb_build_object('ok', true, 'id', v_id, 'actor', v_actor,
    'slot', v_slot, 'reservation_status', v_status, 'sequence', v_seq);
  INSERT INTO operations(idempotency_key, operation, input_digest, http_status, response)
    VALUES (v_key, 'reserve', v_digest, 201, v_body);
  INSERT INTO _r VALUES (jsonb_build_object('http', 201, 'body', v_body));
END`
}

/* ════════════════════════════════════════════════════════════ cancel ═══ */

export function cancel(v, fautes) {
  // Cahier L123 : FIFO ordonné par SÉQUENCE D'ADMISSION EXPLICITE. La fixture
  // `waitlist-lifo` inverse ce seul tri, et rien d'autre.
  const ordre = fautes.waitlist_lifo ? 'DESC' : 'ASC'
  const delai =
    v >= 3
      ? `
  SELECT s.cancellation_deadline INTO v_dead FROM slots s WHERE ${predCreneau(v, 's')};
  -- Frontière INCLUSE (cahier L119) : l'égalité stricte est acceptée.
  IF v_dead IS NOT NULL AND v_at > v_dead THEN
    INSERT INTO _r VALUES (jsonb_build_object('http', 409, 'body', jsonb_build_object(
      'ok', false, 'code', 'TOO_LATE', 'deadline', ${iso('v_dead')})));
    RETURN;
  END IF;
`
      : ''
  const promotion =
    v >= 2
      ? `
  IF v_res.status = 'confirmed' THEN
    SELECT s.capacity INTO v_cap FROM slots s WHERE ${predCreneau(v, 's')};
    LOOP
      SELECT count(*) INTO v_conf FROM reservations r
       WHERE ${predCreneau(v, 'r')} AND r.status = 'confirmed';
      EXIT WHEN v_conf >= v_cap;
      SELECT r.reservation_id, r.actor INTO v_promu, v_promu_actor FROM reservations r
       WHERE ${predCreneau(v, 'r')} AND r.status = 'waiting'
       ORDER BY r.admission_sequence ${ordre}, r.reservation_id ${ordre} LIMIT 1;
      EXIT WHEN v_promu IS NULL;
      UPDATE reservations SET status = 'confirmed', promoted_at = now()
       WHERE reservation_id = v_promu;
      v_promu := NULL;
    END LOOP;
  END IF;
`
      : ''
  return `
DECLARE
  p jsonb; v_tenant text; v_actor text; v_slot text; v_at timestamptz;
  v_seq bigint; v_key text; v_digest text;
  v_prev operations%ROWTYPE; v_res reservations%ROWTYPE;
  v_dead timestamptz; v_cap integer; v_conf integer;
  v_promu text; v_promu_actor text; v_body jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  v_tenant := p->>'tenant';
  v_actor  := p->>'actor';
  v_slot   := p->>'slot';
  v_at     := (p->>'at')::timestamptz;
  v_seq    := (p->>'sequence')::bigint;
  v_key    := p->>'idempotency_key';
  v_digest := p->>'input_digest';

  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_tenant,'') || '/' || coalesce(v_slot,''), 0));

  SELECT * INTO v_prev FROM operations WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_prev.input_digest = v_digest THEN
      INSERT INTO _r VALUES (jsonb_build_object('http', v_prev.http_status,
        'body', v_prev.response || jsonb_build_object('replayed', true)));
    ELSE
      INSERT INTO _r VALUES (jsonb_build_object('http', 409, 'body', jsonb_build_object(
        'ok', false, 'code', 'IDEMPOTENCY_MISMATCH')));
    END IF;
    RETURN;
  END IF;
${gardeLocataire(v, 'v_tenant')}
  -- Le CLOISONNEMENT passe avant la règle de délai : un acteur d'un autre
  -- locataire ne doit pas pouvoir déduire l'existence d'une réservation du
  -- message de refus qu'il reçoit (cahier L123).
  SELECT * INTO v_res FROM reservations r
   WHERE r.actor = v_actor AND ${predCreneau(v, 'r')}
     AND r.status IN ('confirmed','waiting')
   ORDER BY r.admission_sequence LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO _r VALUES (jsonb_build_object('http', 404, 'body', jsonb_build_object(
      'ok', false, 'code', 'NOT_FOUND')));
    RETURN;
  END IF;
${delai}
  UPDATE reservations SET status = 'cancelled' WHERE reservation_id = v_res.reservation_id;
${promotion}
  v_body := jsonb_build_object('ok', true, 'id', v_res.reservation_id, 'actor', v_actor,
    'slot', v_slot, 'reservation_status', 'cancelled', 'sequence', v_seq,
    'promoted', v_promu_actor);
  INSERT INTO operations(idempotency_key, operation, input_digest, http_status, response)
    VALUES (v_key, 'cancel', v_digest, 200, v_body);
  INSERT INTO _r VALUES (jsonb_build_object('http', 200, 'body', v_body));
END`
}

/* ════════════════════════════════════════════════════════════ export ═══ */

export function exporter(v, fautes) {
  void fautes
  const filtreRes = multi(v)
    ? `r.tenant = v_tenant AND (v_actor IS NULL OR r.actor = v_actor)`
    : `(v_actor IS NULL OR r.actor = v_actor)`
  const filtreSlots = multi(v)
    ? `s.tenant = v_tenant AND (v_actor IS NULL OR s.slot_key IN (
         SELECT r2.slot_key FROM reservations r2 WHERE r2.actor = v_actor AND r2.tenant = v_tenant))`
    : `(v_actor IS NULL OR s.slot_key IN (
         SELECT r2.slot_key FROM reservations r2 WHERE r2.actor = v_actor))`
  const locataireLigne = multi(v) ? 'r.tenant' : 'v_tenant'
  const existeActeur = multi(v)
    ? `SELECT EXISTS(SELECT 1 FROM reservations r WHERE r.actor = v_actor AND r.tenant = v_tenant)`
    : `SELECT EXISTS(SELECT 1 FROM reservations r WHERE r.actor = v_actor)`
  return `
DECLARE
  p jsonb; v_tenant text; v_actor text; v_existe boolean; v_body jsonb;
BEGIN
  SELECT j INTO p FROM _p;
  v_tenant := p->>'tenant';
  v_actor  := p->>'actor';
${gardeLocataire(v, 'v_tenant')}
  -- « Exportation canonique CONTRÔLÉE » (cahier L231) : la vue servie dépend du
  -- couple (locataire, acteur) demandé. Un couple sans aucune réservation reçoit
  -- NOT_FOUND, SANS énoncer ce qui existe ailleurs.
  IF v_actor IS NOT NULL THEN
    ${existeActeur} INTO v_existe;
    IF NOT v_existe THEN
      INSERT INTO _r VALUES (jsonb_build_object('http', 404, 'body', jsonb_build_object(
        'ok', false, 'code', 'NOT_FOUND',
        'message', 'aucune reservation pour le couple demande')));
      RETURN;
    END IF;
  END IF;

  v_body := jsonb_build_object(
    'ok', true,
    'schema', 'bench.temoin.reservation.export/1',
    'version', ${String(v)},
    'tenant', v_tenant,
    'slots', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'slot', s.slot_key, 'capacity', s.capacity,
                'starts_at', ${iso('s.starts_at')}) ORDER BY s.slot_key), '[]'::jsonb)
              FROM slots s WHERE ${filtreSlots}),
    'reservations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', r.reservation_id,
                'tenant', ${locataireLigne},
                'actor', r.actor,
                'slot', r.slot_key,
                'status', r.status,
                'sequence', r.admission_sequence,
                'at', ${iso('r.requested_at')})
                ORDER BY r.admission_sequence, r.reservation_id), '[]'::jsonb)
              FROM reservations r WHERE ${filtreRes})
  );
  INSERT INTO _r VALUES (jsonb_build_object('http', 200, 'body', v_body));
END`
}

/* ════════════════════════════════════════════════════════════ import ═══ */

export function importer(v, fautes) {
  void fautes
  const statutsAutorises = v >= 2 ? `ARRAY['confirmed','waiting','cancelled']` : `ARRAY['confirmed','cancelled']`
  const colSlots = ['slot_key', 'capacity', 'starts_at']
  const valSlots = [`e->>'slot'`, `(e->>'capacity')::integer`, `(e->>'starts_at')::timestamptz`]
  const majSlots = ['capacity = EXCLUDED.capacity', 'starts_at = EXCLUDED.starts_at']
  if (v >= 3) {
    colSlots.push('cancellation_deadline')
    valSlots.push(`(e->>'starts_at')::timestamptz - ${DELAI_ANNULATION}`)
    majSlots.push('cancellation_deadline = EXCLUDED.cancellation_deadline')
  }
  if (multi(v)) {
    colSlots.push('tenant')
    valSlots.push(`coalesce(e->>'tenant', v_tenant)`)
  }
  const colRes = ['reservation_id', 'actor', 'slot_key', 'status', 'admission_sequence', 'requested_at']
  const valRes = [
    `'resv_' || lpad(nextval('reservation_ids')::text, 9, '0')`,
    `e->>'actor'`,
    `e->>'slot'`,
    `v_status`,
    `coalesce((e->>'sequence')::bigint, 0)`,
    `coalesce((e->>'at')::timestamptz, now())`,
  ]
  if (multi(v)) {
    colRes.push('tenant')
    valRes.push(`coalesce(e->>'tenant', v_tenant)`)
  }
  return `
DECLARE
  p jsonb; d jsonb; v_tenant text; e jsonb; v_status text;
  v_slots integer := 0; v_res integer := 0;
BEGIN
  SELECT j INTO p FROM _p;
  d := p->'document';
  v_tenant := coalesce(p->>'tenant', d->>'tenant');
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN
    INSERT INTO _r VALUES (jsonb_build_object('http', 400, 'body', jsonb_build_object(
      'ok', false, 'code', 'INVALID_DOCUMENT')));
    RETURN;
  END IF;
${gardeLocataire(v, 'v_tenant')}
  FOR e IN SELECT jsonb_array_elements(coalesce(d->'slots', '[]'::jsonb)) LOOP
    INSERT INTO slots(${colSlots.join(', ')}) VALUES (${valSlots.join(', ')})
    ON CONFLICT ON CONSTRAINT slots_pk DO UPDATE SET ${majSlots.join(', ')};
    v_slots := v_slots + 1;
  END LOOP;

  FOR e IN SELECT jsonb_array_elements(coalesce(d->'reservations', '[]'::jsonb)) LOOP
    -- Le vocabulaire de statut est NORMALISÉ, jamais imposé : cahier L119
    -- demande d'évaluer l'état métier exporté, pas un nom de table ni un mot.
    v_status := CASE
      WHEN lower(coalesce(e->>'status','')) ~ '(annul|cancel)'            THEN 'cancelled'
      WHEN lower(coalesce(e->>'status','')) ~ '(attente|wait|queue|pend)' THEN 'waiting'
      ELSE 'confirmed' END;
    IF NOT (v_status = ANY (${statutsAutorises})) THEN
      INSERT INTO _r VALUES (jsonb_build_object('http', 422, 'body', jsonb_build_object(
        'ok', false, 'code', 'UNSUPPORTED_STATUS', 'observed', v_status)));
      RETURN;
    END IF;
    INSERT INTO reservations(${colRes.join(', ')}) VALUES (${valRes.join(', ')});
    v_res := v_res + 1;
  END LOOP;

  INSERT INTO _r VALUES (jsonb_build_object('http', 200, 'body', jsonb_build_object(
    'ok', true, 'imported', jsonb_build_object('slots', v_slots, 'reservations', v_res))));
END`
}

/* ═══════════════════════════════════════════════════════════ commun ════ */

/**
 * Le cloisonnement inter-locataire n'existe qu'à partir du palier 4 : avant P4
 * il n'y a pas de locataire à cloisonner. Cahier L123 : le verdict est
 * `NOT_FOUND`, et le corps ne divulgue aucune donnée métier.
 */
function gardeLocataire(v, variable) {
  if (!multi(v)) return ''
  return `
  IF ${variable} IS NULL OR NOT EXISTS (SELECT 1 FROM tenants t WHERE t.tenant = ${variable}) THEN
    INSERT INTO _r VALUES (jsonb_build_object('http', 404, 'body', jsonb_build_object(
      'ok', false, 'code', 'NOT_FOUND')));
    RETURN;
  END IF;
`
}

export const OPERATIONS = {
  declare_slot: declareSlot,
  reserve,
  cancel,
  export: exporter,
  import: importer,
}
