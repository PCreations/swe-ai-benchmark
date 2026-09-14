-- ─────────────────────────────────────────────────────────────────────────────
-- 0004_agent_runs — T18 ajoute au schéma central les trois tables que le
-- contrat AgentRunner persiste durablement (cahier L307-L316). NOUVEAU
-- FICHIER, comme L259/0001 l'exige : 0001-0003 ne sont pas touchées.
--
-- CE QUI EST DURABLE, ET CE QUI NE L'EST PAS (voir packages/agents/src/psql.ts
-- pour la contrepartie). Le script de l'agent (`Agent.steps`), le fournisseur
-- factice et le pack du service client sont des valeurs JS non sérialisables
-- reçues à `start`/`resume` : elles restent dans un registre en mémoire du
-- processus qui tient le run. Ce que ce fichier crée est ce que le contrat
-- exige de retrouver APRÈS un `start`/`resume` distinct (A2 : mémoire
-- restaurée à la période suivante) ou d'auditer après coup (A7 : le journal
-- des événements, `SELF_REPORT` compris) :
--
--   `agent_memory`           chaque écriture REMEMBER, jamais réécrite en
--                             place — `resume` (packages/agents) lit la
--                             DERNIÈRE ligne par `(memory_scope, key)`, dans
--                             l'ORDRE D'INSERTION (`id`), pas dans l'ordre de
--                             l'horloge murale (deux écritures dans le même
--                             script `psql` partagent parfois la même
--                             milliseconde).
--   `agent_session_events`   le journal BRUT, dans l'ordre, de toutes les
--                             actions qu'`observe` a rendues pour une session
--                             — `SELF_REPORT` y figure comme n'importe quelle
--                             autre action (A7 : enregistré, mais sans
--                             autorité sur `submit`).
--   `agent_submissions`      les Submissions que `submit` a effectivement
--                             persistées — jamais celles qu'un `SELF_REPORT`
--                             prétendrait à lui seul avoir validées.
--
-- `memory_scope`, `session_id` sont des `text` LIBRES (fournis par
-- l'appelant, comme `budget_id` en 0002/0003) : ce fichier ne leur impose
-- aucune clé étrangère vers `trajectories`, parce qu'`acceptance/T18.spec.ts`
-- les fabrique sans jamais ouvrir de trajectoire (§IV de son en-tête : la
-- suite exerce le contrat AgentRunner isolément, pas l'orchestration
-- complète).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE agent_memory (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  memory_scope  text        NOT NULL,
  session_id    text        NOT NULL,
  key           text        NOT NULL,
  value         jsonb       NOT NULL,
  written_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_memory_scope_key_idx ON agent_memory (memory_scope, key, id);

CREATE TABLE agent_session_events (
  id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id          text        NOT NULL,
  operation_sequence  integer     NOT NULL,
  kind                text        NOT NULL,
  payload             jsonb       NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_session_events_session_idx ON agent_session_events (session_id, id);

CREATE TABLE agent_submissions (
  id                     bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id             text        NOT NULL,
  claimed_requirements   jsonb,
  artifact_fingerprint   jsonb,
  attempt                integer     NOT NULL,
  status                 text        NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_submissions_session_idx ON agent_submissions (session_id, id);
