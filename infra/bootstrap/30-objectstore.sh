#!/usr/bin/env bash
# Garage (Apache-2.0) — ADR-003. MinIO est en AGPL-3.0 ; a contrat egal, la
# licence permissive est retenue. Binaire statique unique : aucun demon Docker.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
URL="$(node -e "console.log(require('$LOCK').artifacts.garage.url)")"
tofu_fetch garage "$URL" "$BENCH_HOME/bin/garage" "${1:-0}"
"$BENCH_HOME/bin/garage" --version 2>/dev/null | head -1 || true
