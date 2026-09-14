-- ─────────────────────────────────────────────────────────────────────────────
-- 0003_gateway_model_calls — T17 remplit `model_calls` de règles (cahier
-- L299-L306). NOUVEAU FICHIER, comme L259/0001 l'exige : 0001 a déjà créé
-- `model_calls` (colonnes minimales, vide de règles) et 0002 a rempli
-- `ledger_entries`/`budget_reservations` pour T16 sans y toucher — 0003
-- COMPLÈTE `model_calls`, elle ne la réécrit pas.
--
-- POURQUOI CES COLONNES. Le journal durable d'appel de L301 doit porter, pour
-- chaque `model_call_id` (= `call_id`, déjà clé primaire depuis 0001) :
--   `idempotency_key`, `budget_id`, `reservation_id` — les trois identifiants
--     que dispatchModelCall reçoit et doit pouvoir relire à la reprise ;
--   `request_digest` — l'empreinte de la requête, pas la requête elle-même :
--     c'est TOUT ce que L69/A7 exigent pour détecter « même clé, requête
--     différente » ; il n'y a aucune raison de dupliquer le contenu de la
--     requête dans le journal de facturation ;
--   `response_text` — NULLABLE, écrit seulement par un dispatch qui a reçu et
--     sauvegardé une vraie réponse. reconcileModelCall (L301, A4) ne l'écrit
--     JAMAIS : c'est ce qui rend « sans inventer de réponse textuelle »
--     vérifiable après coup par une simple lecture ;
--   `usage` — jsonb, les trois champs disjoints de F-MONEY (L103) tels que
--     factures, conservés pour l'export (L305 : « les ambiguïtés non
--     réconciliées restent dans l'export ») ;
--   `dispatch_started_at`/`settled_at` — horodatage de chaque écriture
--     durable, pour que l'ordre de L99 soit relisible sans dépendre d'une
--     horloge murale au moment du test (cahier:L141).
--
-- `call_state` (déjà présent depuis 0001) porte l'état d'émission de L99. Ce
-- fichier ne redéfinit PAS ses valeurs par une contrainte CHECK figée : les
-- six états de L99 sont un contrat applicatif (`packages/gateway`), pas un
-- contrat de schéma — comme `ledger_entries.entry_kind` (0002) ne l'est pas
-- non plus.
--
-- `model_call_idempotency` — TABLE SÉPARÉE, PAS UNE COLONNE UNIQUE SUR
-- `model_calls`. La même `idempotency_key` doit continuer à pointer vers le
-- MÊME `model_call_id` pour être acceptée en rejeu (A3, A7 « rejoue ») ; une
-- clé déjà vue avec une empreinte de requête DIFFÉRENTE doit être REJETÉE
-- (A7 « conflit ») — c'est PostgreSQL, via la clé primaire de cette table, qui
-- arbitre l'unicité de la clé, pas une vérification applicative qui aurait sa
-- fenêtre (même schéma d'arbitrage que `ledger_entries_budget_receipt_uk` en
-- 0002).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE model_calls
  ADD COLUMN idempotency_key     text,
  ADD COLUMN budget_id           text,
  ADD COLUMN reservation_id      text,
  ADD COLUMN request_digest      text,
  ADD COLUMN response_text       text,
  ADD COLUMN usage               jsonb,
  ADD COLUMN dispatch_started_at timestamptz,
  ADD COLUMN settled_at          timestamptz;

CREATE TABLE model_call_idempotency (
  idempotency_key text        PRIMARY KEY,
  call_id         text        NOT NULL REFERENCES model_calls (call_id),
  request_digest  text        NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX model_calls_budget_idx       ON model_calls (budget_id);
CREATE INDEX model_calls_reservation_idx  ON model_calls (reservation_id);
