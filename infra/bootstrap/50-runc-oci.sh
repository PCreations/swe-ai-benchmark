#!/usr/bin/env bash
# runc + profil OCI de base.
#
# MESURE SUR CET HOTE, ET C'EST LE PIEGE PRINCIPAL : `runc spec` par defaut
# n'emet NI uidMappings, NI user namespace, NI bloc seccomp — le root du
# conteneur EST le root de l'hote. Le profil infra/oci/base-spec.json les
# declare explicitement. Sans cela, T19 produirait un faux PASS confiant sur
# exactement les taches dont l'objet est que l'isolation soit reelle.
set -euo pipefail
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO=sudo
command -v runc >/dev/null || { export DEBIAN_FRONTEND=noninteractive; $SUDO apt-get install -y -qq runc; }
runc --version | head -1
