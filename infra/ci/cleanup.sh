#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/ci/cleanup.sh <test_run_id> — nettoyage ciblé (cahier L513-L521, T41,
# A6).
#
# SUPPRIME les bases PostgreSQL dont le nom correspond EXACTEMENT au préfixe
# `bench_<test_run_id>_*` (même convention de nommage que
# `acceptance/T37.spec.ts`/`T39.spec.ts`, déjà établie dans ce dépôt), ET RIEN
# D'AUTRE : aucune base sans ce préfixe exact, aucune base d'un AUTRE
# `test_run_id`, même préfixée `bench_`.
#
# POURQUOI UN FILTRE BASH (`case "$db" in "${PREFIX}"*)`), PAS UN `LIKE` SQL.
# `test_run_id` est repris TEL QUEL dans le motif : un `LIKE` SQL traiterait
# `_` comme un joker à un caractère (très probable dans un identifiant de
# test) et élargirait silencieusement la cible -- exactement le mutant que
# cases.lock.json nomme (« retirer le filtre d'identité de test »). Un
# préfixe littéral comparé par le shell n'a pas ce défaut : seules les bases
# dont le nom commence OCTET POUR OCTET par `bench_<test_run_id>_` sont
# retenues.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TEST_RUN_ID="${1:?usage: cleanup.sh <test_run_id>}"
PREFIX="bench_${TEST_RUN_ID}_"

ADMIN_DB=""
for cand in postgres "${PGUSER:-$(id -un)}" template1; do
  if psql -tAc 'SELECT 1' -d "$cand" >/dev/null 2>&1; then
    ADMIN_DB="$cand"
    break
  fi
done
if [ -z "$ADMIN_DB" ]; then
  echo "cleanup.sh: aucune base PostgreSQL admin joignable" >&2
  exit 1
fi

psql -tAqX -d "$ADMIN_DB" -c 'SELECT datname FROM pg_database' | while IFS= read -r db; do
  db="${db%$'\r'}"
  [ -z "$db" ] && continue
  case "$db" in
    "${PREFIX}"*)
      psql -v ON_ERROR_STOP=1 -d "$ADMIN_DB" -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)"
      ;;
    *) ;;
  esac
done
