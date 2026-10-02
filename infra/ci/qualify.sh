#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/ci/qualify.sh — la CI de qualification (cahier L513-L521, T41, A5).
#
# SANS ARGUMENT : exécute la batterie complète -- `pnpm test` (Jest, les
# suites TypeScript) puis, SEULEMENT SI elle réussit, `pnpm test:py` (pytest,
# `analysis/`) -- et PROPAGE un code de sortie NON NUL si L'UNE des deux
# échoue (A5 : « un échec d'acceptation fait échouer la CI »). `set -e` fait
# tout le travail ici : la première commande qui échoue termine le script
# avec SON code de sortie, sans exécuter la suivante.
#
# AVEC DES ARGUMENTS : point d'injection de TEST (cahier:L141), même
# convention que `--test-stop-after-phase` (T23) ou
# `--test-force-all-candidates-fail` (T39) -- transmet ces arguments TELS
# QUELS à `pnpm exec jest` SEUL (la moitié Python n'est alors pas exécutée).
# `acceptance/T41.spec.ts` (A5) l'utilise pour isoler la PROPAGATION du code
# de sortie sur deux sondes jetables et synthétiques, sans dépendre de l'état
# des 44 tâches réelles du registre (dont la plupart sont NOT_IMPLEMENTED
# aujourd'hui, pour une raison légitime qui n'a rien à voir avec ce test-ci).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ "$#" -gt 0 ]; then
  exec pnpm exec jest "$@"
fi

pnpm test
pnpm test:py
