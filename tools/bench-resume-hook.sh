#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Hook SessionStart — réinjecte l'état réel au démarrage, sur /clear et /compact.
#
# CONTRAINTE ABSOLUE : AUCUNE DÉPENDANCE hors `git` et coreutils.
# Un hook en node/pnpm échoue silencieusement sur exactement le conteneur
# fraîchement recloné pour lequel il existe (dépendances pas encore installées).
# Il ne doit JAMAIS être silencieux et JAMAIS bloquer la session : toute panne
# imprime RESUME DEGRADED et sort 0.
#
# Ce hook ne décide rien. La décision (`[H]` proven at HEAD) appartient à
# `pnpm bench resume`, qui recalcule tout depuis les objets git et les sondes.
# ─────────────────────────────────────────────────────────────────────────────
set -u

degraded() {
  echo "RESUME DEGRADED: $*"
  echo "  → lance: pnpm bench bootstrap && pnpm bench resume"
  exit 0
}

command -v git >/dev/null 2>&1 || degraded "git introuvable"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || degraded "pas un dépôt git"
cd "$ROOT" 2>/dev/null || degraded "racine du dépôt inaccessible"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || degraded "HEAD illisible"
HEAD_SHA=$(git rev-parse --short HEAD 2>/dev/null) || degraded "HEAD illisible"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then TREE="sale"; else TREE="propre"; fi

echo "BENCH  $BRANCH @ $HEAD_SHA  (arbre $TREE)"

# Le cahier est la racine de toute provenance : un digest qui ne correspond plus
# invalide chaque citation de ligne, chaque provenance.json et T43.A6 lui-même.
if [ -f docs/CAHIER_SHA256 ] && [ -f docs/cahier.md ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    WANT=$(cut -d' ' -f1 docs/CAHIER_SHA256 2>/dev/null)
    GOT=$(sha256sum docs/cahier.md 2>/dev/null | cut -d' ' -f1)
    if [ "$WANT" = "$GOT" ]; then echo "       cahier OK ($(echo "$GOT" | cut -c1-12)…)"
    else echo "       !! CAHIER_DIGEST_MISMATCH — toute provenance est suspecte"; fi
  fi
else
  echo "       cahier absent — socle pas encore amorcé"
fi

# Preuves durables : la branche ledger. Non poussée = non durable.
LEDGER="${BRANCH}-ledger"
if git show-ref --verify --quiet "refs/heads/$LEDGER" 2>/dev/null; then
  LSHA=$(git rev-parse --short "$LEDGER" 2>/dev/null)
  if git show-ref --verify --quiet "refs/remotes/origin/$LEDGER" 2>/dev/null; then
    AHEAD=$(git rev-list --count "origin/$LEDGER..$LEDGER" 2>/dev/null || echo "?")
    echo "       ledger $LSHA — $AHEAD événement(s) non poussé(s)"
  else
    echo "       ledger $LSHA — JAMAIS POUSSÉ (rien n'est durable)"
  fi
else
  echo "       ledger absent localement"
fi

echo "       → pnpm bench resume   (seule source de vérité sur l'avancement)"
exit 0
