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
VER="$(node -e "console.log(require('$(git rev-parse --show-toplevel)/infra/toolchain.lock.json').artifacts.postgresql.version)")"
$SUDO apt-get install -y -qq "postgresql-18=${VER}" || $SUDO apt-get install -y -qq postgresql-18
/usr/lib/postgresql/18/bin/postgres --version
