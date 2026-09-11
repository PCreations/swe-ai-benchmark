#!/usr/bin/env bash
# Fonctions communes aux scripts de bootstrap.
set -euo pipefail
ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || echo /workspaces/swe-ai-benchmark)"
LOCK="$ROOT/infra/toolchain.lock.json"
BENCH_HOME="${BENCH_HOME:-$ROOT/.bench/home}"
log() { printf '  %s\n' "$*"; }
die() { printf 'ECHEC: %s\n' "$*" >&2; exit 1; }

# Trust On First Use : telecharge, calcule le sha256, puis
#   - si le verrou ne contient rien : l'INSCRIT ;
#   - s'il contient une valeur differente : REFUSE.
# Ce n'est pas un digest editeur et ne doit jamais etre presente comme tel :
# cela prouve que rien n'a change depuis la premiere machine, pas que
# l'artefact est celui que l'editeur a publie.
tofu_fetch() {
  local key="$1" url="$2" dest="$3" verify_only="${4:-0}"
  local want got
  want=$(node -e "const l=require('$LOCK');console.log(l.artifacts['$key'].sha256 ?? '')" 2>/dev/null || echo '')
  mkdir -p "$(dirname "$dest")"
  log "telechargement $key"
  curl -sSLf --retry 3 --retry-delay 2 -o "$dest.part" "$url" || die "telechargement $key impossible ($url)"
  got=$(sha256sum "$dest.part" | cut -d' ' -f1)
  if [ -n "$want" ]; then
    [ "$want" = "$got" ] || { rm -f "$dest.part"; die "PIN_MISMATCH $key: verrou=$want obtenu=$got"; }
    log "$key verifie contre le verrou (${got:0:12}...)"
  elif [ "$verify_only" = "1" ]; then
    rm -f "$dest.part"; die "$key non epingle et --verify-pins exige un verrou rempli"
  else
    node -e "
      const fs=require('fs'); const l=JSON.parse(fs.readFileSync('$LOCK','utf8'));
      l.artifacts['$key'].sha256='$got';
      fs.writeFileSync('$LOCK', JSON.stringify(l,null,2)+'\n');
    "
    log "$key EPINGLE a la premiere utilisation (${got:0:12}...) — inscrit dans le verrou"
  fi
  mv "$dest.part" "$dest"; chmod +x "$dest" 2>/dev/null || true
}
