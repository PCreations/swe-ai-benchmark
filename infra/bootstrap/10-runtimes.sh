#!/usr/bin/env bash
# Runtimes : Node 22 LTS + pnpm via corepack, Python 3.12 via uv.
# Les versions sont celles du verrou, jamais « latest » : le cahier §C interdit
# qu'elles soient remplacees a chaque execution.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
PNPM="$(node -e "console.log(require('$LOCK').artifacts.pnpm.version)")"
PY="$(node -e "console.log(require('$LOCK').artifacts.python.version)")"
corepack enable >/dev/null 2>&1 || true
corepack prepare "pnpm@$PNPM" --activate
command -v uv >/dev/null || curl -sSLf https://astral.sh/uv/install.sh | sh
uv python install "$PY"
git config core.hooksPath .githooks
log "node $(node -v)  pnpm $(pnpm -v)  python $(uv run --python "$PY" python -V 2>&1)"
