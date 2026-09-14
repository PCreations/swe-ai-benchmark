"""
Rend `analysis/src` (zone IMPL, non ecrite par ce role) importable depuis les
suites d'acceptation situees dans `analysis/tests` (zone ACCEPTANCE), sans
faire de `analysis` un paquet installable — le pyproject du depot fixe
deliberement `package = false` (analysis/pyproject.toml) tant qu'aucune
source n'existe sous `analysis/src`. Ce fichier se contente d'un ajout de
`sys.path` ; il n'importe et n'execute aucun module d'implementation
lui-meme, donc ne viole pas l'aveuglement d'ADR-001 (le contenu de
`analysis/src/export.py` n'est jamais lu par ce role).
"""
from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))
