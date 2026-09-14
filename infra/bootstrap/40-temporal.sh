#!/usr/bin/env bash
# CLI Temporal + serveur de test a saut de temps, TOUS DEUX PRE-TELECHARGES.
#
# Le serveur de test doit etre pre-telecharge : le SDK TypeScript le recupere
# paresseusement par defaut, ce qui (a) ferait passer le test de replay de
# T24.A2 pour la mauvaise raison si le telechargement echoue silencieusement,
# et (b) serait perdu au recyclage du conteneur.
#
# IL N'Y A PLUS DE DRAPEAU `--with-test-server`. Il existait dans les remedes
# affiches par `bench doctor`, et il n'etait pas implemente : $1 est le drapeau
# `verify_only` passe a tofu_fetch par run-all.sh, donc `--with-test-server`
# atterrissait a sa place et etait lu comme « ni 0 ni 1 » — le serveur de test
# n'etait JAMAIS telecharge, quelle que soit la ligne de commande. L'en-tete
# ci-dessus disait pourtant « TOUS DEUX ». Le script fait desormais ce qu'il
# annonce, sans condition.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
VERIFY="${1:-0}"

url_de() { node -e "console.log(require('$LOCK').artifacts['$1'].url ?? '')"; }

# ── CLI
tofu_fetch temporal-cli "$(url_de temporal-cli)" "$BENCH_HOME/bin/temporal-cli.tar.gz" "$VERIFY"
tar -xzf "$BENCH_HOME/bin/temporal-cli.tar.gz" -C "$BENCH_HOME/bin" temporal 2>/dev/null || true
[ -x "$BENCH_HOME/bin/temporal" ] && "$BENCH_HOME/bin/temporal" --version | head -1

# ── SERVEUR DE TEST A SAUT DE TEMPS
TTS_URL="$(url_de temporal-test-server)"
[ -n "$TTS_URL" ] || die "temporal-test-server sans url dans $LOCK — T24.A2 ne peut pas etre prouvee"
tofu_fetch temporal-test-server "$TTS_URL" "$BENCH_HOME/bin/temporal-test-server.tar.gz" "$VERIFY"
# L'archive porte un repertoire versionne (temporal-test-server_<v>_linux_amd64/) :
# --strip-components=1 pour poser le binaire directement dans bin/.
tar -xzf "$BENCH_HOME/bin/temporal-test-server.tar.gz" -C "$BENCH_HOME/bin" \
    --strip-components=1 --wildcards '*/temporal-test-server'
chmod +x "$BENCH_HOME/bin/temporal-test-server"
log "serveur de test a saut de temps pose dans $BENCH_HOME/bin/temporal-test-server"
