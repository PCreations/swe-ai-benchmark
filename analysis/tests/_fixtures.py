"""
Chargement des fixtures de reference (zone REFERENCE, gelees apres T01) pour
les suites d'acceptation Python. Ce module ne fait que lire du JSON deja
scelle par le role fixture-transcriber ; il ne recalcule ni ne retranscrit
aucune valeur (cf. CLAUDE.md : « Ce qui est interdit — editer
acceptance/reference/** apres le gel »). Fait partie de la zone ACCEPTANCE
(verification/ownership.json : "analysis/tests/**").
"""
from __future__ import annotations

import json
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_REFERENCE_DIR = _REPO_ROOT / "acceptance" / "reference"


def load_reference_fixture(name: str) -> dict:
    """Charge acceptance/reference/<name>.json et renvoie l'objet Python."""
    path = _REFERENCE_DIR / f"{name}.json"
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)
