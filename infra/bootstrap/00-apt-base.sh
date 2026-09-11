#!/usr/bin/env bash
# Paquets de base. iproute2 n'est pas optionnel : sans `ip`, la moitie positive
# de T19.A3 (autoriser une destination et refuser le reste) ne peut etre
# prouvee qu'avec une liste blanche par socket Unix, dont le transport differe
# de ce que decrit le cahier — une limitation qu'il faudrait alors porter
# jusqu'a T43.A4.
set -euo pipefail
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO=sudo
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq --no-install-recommends \
  ca-certificates curl gnupg jq xz-utils \
  iproute2 nftables iptables uidmap util-linux runc \
  build-essential
echo "  base installee : $(ip -V 2>/dev/null | head -1), nft $(nft -v 2>/dev/null | head -1), runc $(runc --version | head -1)"
