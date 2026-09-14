-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_billing_ledger — T16 remplit le schéma central de règles comptables
-- (cahier L291-L298). NOUVEAU FICHIER, comme L259 l'exige : 0001 n'est pas
-- réécrite, elle a déjà créé `ledger_entries` et `budget_reservations` (vides)
-- et cette migration les COMPLÈTE.
--
-- `budgets` — L297 : l'enveloppe budgétaire (`limit`) que T16 introduit.
-- 0001 ne la créait pas : aucune tâche avant T16 n'avait besoin d'un plafond.
--
-- `ledger_entries` — trois natures d'écriture cohabitent dans la même table
-- (une dépense de reçu, un coût inconnu, un ajustement) : `entry_kind` les
-- distingue. `amount_micro_usd` perd son `NOT NULL` : un coût inconnu (A5)
-- n'a, par définition, aucun montant à écrire — son absence doit rester
-- EXPLICITE (NULL), jamais un zéro substitué. L'unicité `(budget_id,
-- receipt_id)` partielle (receipt_id NOT NULL) est ce qui rend l'import de
-- reçu IDEMPOTENT (A3) sans fenêtre entre lecture et écriture : c'est
-- PostgreSQL qui arbitre, comme L257/A2 le fait déjà pour `periods`.
--
-- `budget_reservations` — `max_cost_micro_usd`/`mode` portent le plafond
-- optionnel et le mode d'admission de L297 (« plafond strict »).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE budgets (
  budget_id       text        PRIMARY KEY,
  limit_micro_usd text        NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ledger_entries
  ALTER COLUMN amount_micro_usd DROP NOT NULL,
  ADD COLUMN entry_kind  text NOT NULL DEFAULT 'EXPENSE',
  ADD COLUMN receipt_id  text,
  ADD COLUMN ref         text,
  ADD COLUMN adjusts     bigint REFERENCES ledger_entries (entry_id),
  ADD COLUMN reason      text;

ALTER TABLE ledger_entries ALTER COLUMN entry_kind DROP DEFAULT;

CREATE UNIQUE INDEX ledger_entries_budget_receipt_uk
  ON ledger_entries (budget_id, receipt_id)
  WHERE receipt_id IS NOT NULL;

ALTER TABLE budget_reservations
  ADD COLUMN max_cost_micro_usd text,
  ADD COLUMN mode                text;
