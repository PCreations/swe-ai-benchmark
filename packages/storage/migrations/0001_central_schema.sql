-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_central_schema — schéma central de T12 (cahier L257, L259).
--
-- L259 énumère les TREIZE tables minimales, et cette migration les crée toutes,
-- y compris celles qu'aucune écriture de T12 ne touche encore : le cahier parle
-- du SCHÉMA CENTRAL, pas du sous-ensemble qu'un premier jalon exerce. Les
-- tâches suivantes (T13 artifact_refs, T15 checkpoints, T16 ledger_entries et
-- budget_reservations, T17 model_calls) y écriront sans nouvelle migration de
-- structure.
--
-- CE FICHIER NE SERA JAMAIS RÉÉCRIT. L257 : « les migrations futures sont
-- ajoutées comme nouveaux fichiers, jamais réécriture d'une migration
-- appliquée ». `schema_migrations` enregistre l'empreinte du fichier appliqué ;
-- une réécriture serait donc visible, pas silencieuse.
--
-- SÉPARATION SCHÉMA CENTRAL / BASES DES APPLICATIONS (L259). Ce fichier ne
-- décrit QUE le schéma central du moteur. Les applications témoins ont leurs
-- propres bases et leurs propres migrations (infra/temoins, T09) ; rien ici ne
-- les référence.
--
-- L'INDEX UNIQUE QUI DÉCIDE D'A3. `periods.idempotency_key` est la clé primaire
-- de la table qui porte le résultat ET son empreinte : c'est PostgreSQL, et non
-- le code applicatif, qui arbitre « une seule ligne par clé » sous concurrence.
-- L'unicité est MONOCOLONNE à dessein — un index composite `(clé, autre_chose)`
-- autoriserait deux lignes de même clé, c'est-à-dire le contraire de ce que
-- L261 affirme.
--
-- LES MONTANTS SONT DES `text`, PAS DES `numeric` (L80 : « les montants sont
-- des chaînes d'entiers non négatifs en micro-USD »). Un `numeric` ferait
-- traverser le stockage à un montant en changeant son type, et une somme
-- flottante réapparaîtrait au premier `SELECT`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Campagnes et trajectoires : l'identité de L78, décomposée.

CREATE TABLE campaigns (
  campaign_id      text        PRIMARY KEY,
  manifest_digest  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trajectories (
  trajectory_id     text        PRIMARY KEY,
  campaign_id       text        NOT NULL REFERENCES campaigns (campaign_id),
  parent_project_id text        NOT NULL,
  scenario_id       text        NOT NULL,
  configuration_id  text        NOT NULL,
  repetition_id     text        NOT NULL,
  budget_id         text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trajectories_identity_unique UNIQUE (
    campaign_id, parent_project_id, scenario_id,
    configuration_id, repetition_id, budget_id
  )
);

-- ── Le résultat de période : la ligne que « même clé / autre empreinte » (A3)
--    met en jeu. `identity` et `result` sont stockés VERBATIM en jsonb, de
--    sorte qu'une relecture rende exactement ce qui a été publié.

CREATE TABLE periods (
  idempotency_key text        PRIMARY KEY,
  input_digest    text        NOT NULL,
  trajectory_id   text        NOT NULL REFERENCES trajectories (trajectory_id),
  period_index    integer     NOT NULL CHECK (period_index >= 1),
  identity        jsonb       NOT NULL,
  result          jsonb       NOT NULL,
  published_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periods_position_unique UNIQUE (trajectory_id, period_index)
);

-- ── Opérations : D-6, « les effets valides sont dédupliqués par clé
--    d'opération ET empreinte d'entrée ». T12 crée la table ; T17 l'alimente.

CREATE TABLE operations (
  operation_id            text        PRIMARY KEY,
  period_key              text        REFERENCES periods (idempotency_key),
  operation_idempotency_key text      UNIQUE,
  input_digest            text,
  phase                   text,
  operation_kind          text,
  operation_sequence      integer,
  logical_attempt         integer,
  outcome                 text,
  recorded_at             timestamptz NOT NULL DEFAULT now()
);

-- ── Événements de domaine, écrits DANS LA MÊME TRANSACTION que le résultat.
--    L'unicité `(clé, rang)` est ce qui fait qu'une reprise ne duplique rien
--    (A5) même si le code applicatif se trompait.

CREATE TABLE domain_events (
  event_id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text        NOT NULL,
  event_seq       integer     NOT NULL CHECK (event_seq >= 1),
  event_type      text        NOT NULL,
  occurred_at     timestamptz,
  payload         jsonb       NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domain_events_unique UNIQUE (idempotency_key, event_seq)
);

-- ── Outbox : la publication transactionnelle de L257. Une entrée par événement,
--    dans la transaction du résultat — jamais avant, jamais après.

CREATE TABLE outbox (
  outbox_id       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text        NOT NULL,
  event_seq       integer     NOT NULL CHECK (event_seq >= 1),
  topic           text        NOT NULL,
  payload         jsonb       NOT NULL,
  delivery_state  text        NOT NULL DEFAULT 'PENDING',
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  CONSTRAINT outbox_unique UNIQUE (idempotency_key, event_seq)
);

-- ── Les huit tables restantes de L259. Créées ici parce que L259 les nomme ;
--    alimentées par les tâches auxquelles le cahier les confie.

CREATE TABLE deployments (
  deployment_id text        PRIMARY KEY,
  trajectory_id text        REFERENCES trajectories (trajectory_id),
  period_index  integer,
  coverage      text,
  artifact_ref  text,
  deployed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  incident_id   text        PRIMARY KEY,
  trajectory_id text        REFERENCES trajectories (trajectory_id),
  period_index  integer,
  incident_kind text,
  detail        jsonb,
  detected_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artifact_refs (
  artifact_ref   text        PRIMARY KEY,
  content_digest text        NOT NULL,
  media_type     text,
  byte_size      bigint,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checkpoints (
  checkpoint_id text        PRIMARY KEY,
  trajectory_id text        REFERENCES trajectories (trajectory_id),
  period_index  integer,
  state_digest  text        NOT NULL,
  taken_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_calls (
  call_id          text        PRIMARY KEY,
  period_key       text        REFERENCES periods (idempotency_key),
  provider         text,
  model            text,
  call_state       text,
  input_tokens     bigint,
  output_tokens    bigint,
  cost_micro_usd   text,
  requested_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  entry_id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  budget_id        text        NOT NULL,
  period_key       text        REFERENCES periods (idempotency_key),
  cost_origin      text,
  amount_micro_usd text        NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE budget_reservations (
  reservation_id   text        PRIMARY KEY,
  budget_id        text        NOT NULL,
  period_key       text        REFERENCES periods (idempotency_key),
  amount_micro_usd text        NOT NULL,
  reservation_state text       NOT NULL,
  reserved_at      timestamptz NOT NULL DEFAULT now(),
  released_at      timestamptz
);

-- ── Index de lecture. Aucun n'est unique : l'unicité est une propriété du
--    contrat, pas une commodité de plan d'exécution, et elle est déclarée
--    ci-dessus là où elle décide de quelque chose.

CREATE INDEX periods_trajectory_idx      ON periods (trajectory_id, period_index);
CREATE INDEX domain_events_key_idx       ON domain_events (idempotency_key);
CREATE INDEX outbox_pending_idx          ON outbox (delivery_state, enqueued_at);
CREATE INDEX ledger_entries_budget_idx   ON ledger_entries (budget_id);
CREATE INDEX budget_reservations_budget_idx ON budget_reservations (budget_id);
