#!/usr/bin/env bash
# PostgreSQL 18 depuis pgdg.
#
# PIEGE DE CET HOTE : PostgreSQL 16.13 est deja installe sous
# /usr/lib/postgresql/16/bin, et le rester pour toujours. S'en servir rendrait
# T09/T12/T15/T16 verts pour la mauvaise raison — la fermeture artificielle que
# le cahier §K interdit. La sonde `postgres18` interroge server_version_num
# DEPUIS SA PROPRE SESSION et exige >= 180000 : aucun raccourci possible.
set -euo pipefail
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO=sudo
export DEBIAN_FRONTEND=noninteractive
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
$SUDO install -d /usr/share/postgresql-common/pgdg
$SUDO curl -sSLf -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main" \
  | $SUDO tee /etc/apt/sources.list.d/pgdg.list >/dev/null
$SUDO apt-get update -qq
VER="$(node -e "console.log(require('$(git rev-parse --show-toplevel)/docs/toolchain.json').artifacts.postgresql.version)")"
$SUDO apt-get install -y -qq "postgresql-18=${VER}" || $SUDO apt-get install -y -qq postgresql-18
/usr/lib/postgresql/18/bin/postgres --version

# PIEGE MESURE LE 12/10/2026 : sur une image ou le cluster PG16 existe deja,
# il detient le port 5432 et pg_createcluster place PG18 sur 5433. Les sondes
# et les suites visent 5432 : postgres18 restait ABSENT alors que PG18
# tournait. On rend le 5432 a PG18, et on ecarte PG16 sans le supprimer.
if command -v pg_lsclusters >/dev/null 2>&1; then
  if pg_lsclusters -h 2>/dev/null | awk '$1==16 && $3==5432 {f=1} END {exit !f}'; then
    $SUDO pg_ctlcluster 16 main stop 2>/dev/null || true
    $SUDO pg_conftool 16 main set port 5434
  fi
  if ! pg_lsclusters -h 2>/dev/null | awk '$1==18 && $3==5432 {f=1} END {exit !f}'; then
    $SUDO pg_conftool 18 main set port 5432
    $SUDO pg_ctlcluster 18 main restart
  fi
  pg_lsclusters
fi
