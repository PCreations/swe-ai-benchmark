#!/usr/bin/env bash
# Refuse un verrou incomplet. Utilise par run-all.sh --verify-pins, donc par le
# devcontainer : sur une machine qui n'est PAS la premiere, tout artefact « tofu »
# non epingle est une erreur, pas une invitation a re-epingler.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
node -e "
const l=require('$LOCK'); let bad=0;
for (const [k,a] of Object.entries(l.artifacts)) {
  if (a.trust==='tofu' && !a.sha256) { console.error('  NON EPINGLE: '+k); bad++; }
  if (a.trust==='vendor-digest' && !a.digest && !a.pin_on_first_build) { console.error('  DIGEST ABSENT: '+k); bad++; }
}
if (bad) { console.error(bad+' artefact(s) sans empreinte — le verrou ne prouve rien.'); process.exit(1); }
console.log('  verrou complet : chaque artefact porte une empreinte');
"
