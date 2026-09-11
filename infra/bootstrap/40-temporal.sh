#!/usr/bin/env bash
# CLI Temporal + serveur de test a saut de temps, TOUS DEUX PRE-TELECHARGES.
#
# Le serveur de test doit etre pre-telecharge : le SDK TypeScript le recupere
# paresseusement par defaut, ce qui (a) ferait passer le test de replay de
# T24.A2 pour la mauvaise raison si le telechargement echoue silencieusement,
# et (b) serait perdu au recyclage du conteneur.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
URL="$(node -e "console.log(require('$LOCK').artifacts['temporal-cli'].url)")"
tofu_fetch temporal-cli "$URL" "$BENCH_HOME/bin/temporal-cli.tar.gz" "${1:-0}"
tar -xzf "$BENCH_HOME/bin/temporal-cli.tar.gz" -C "$BENCH_HOME/bin" temporal 2>/dev/null || true
[ -x "$BENCH_HOME/bin/temporal" ] && "$BENCH_HOME/bin/temporal" --version | head -1
