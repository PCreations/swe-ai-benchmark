#!/usr/bin/env bash
# Orchestrateur. EXECUTE A L'IDENTIQUE par le devcontainer (postCreateCommand)
# et par un hote nu (`pnpm bench bootstrap`). C'est cette identite qui rend un
# profil degrade honnete : meme provisionnement, capacite moindre, nommee.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY=0; [ "${1:-}" = "--verify-pins" ] && VERIFY=1
echo "bootstrap : $( [ $VERIFY = 1 ] && echo 'verification stricte des empreintes' || echo 'epinglage a la premiere utilisation autorise' )"
for s in 00-apt-base 10-runtimes 20-postgres18 50-runc-oci 30-objectstore 40-temporal; do
  echo "[$s]"
  bash "$DIR/$s.sh" "$VERIFY" || echo "  (echec non fatal : bench doctor nommera la capacite manquante)"
done
echo "[90-verify-pins]"; bash "$DIR/90-verify-pins.sh" || true
echo
# Le bootstrap INSTALLE ; il ne demarre rien. Les deux gestes sont separes
# parce qu'un conteneur qui redemarre garde ses binaires et perd ses serveurs :
# c'est `svc up` qu'il faut alors rejouer, pas un provisionnement complet.
echo "bootstrap termine — lance maintenant : node tools/bench svc up && node tools/bench doctor"
