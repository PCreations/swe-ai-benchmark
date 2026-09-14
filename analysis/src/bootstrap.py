"""
Bootstrap apparie et bandes -- T33 (docs/cahier.md L439-L446 ;
docs/specs/T33.md).

ROLE : implementer, ETAGE IMPL. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T33.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas -- aucun des trois exports
ci-dessous n'existait avant que la suite T33 les pose.

Regles portees par cahier:L443 (et verifiees ci-dessous par les trois
exports) :
  - `paired_parent_bootstrap`   : les lignes sont d'abord moyennees PAR
    PARENT (la strate), puis un meme tirage FORCE de project_id (avec remise)
    sert aux DEUX bras -- jamais un flux d'indices independant par bras
    (bootstrap APPARIE, cahier:L443, A2), et jamais un pooling brut sensible
    au nombre de lignes (cahier:L443, A5).
  - `empirical_inverse_quantile_interval` : convention du RANG INVERSE
    (`ceil(q*n)`, 1-indexe sur les valeurs triees), jamais une interpolation
    lineaire entre deux rangs (cahier:L443, A1) ; les bandes qu'elle produit
    sont toujours ponctuelles, jamais etiquetees simultanees (cahier:L443,
    A7).
  - `interproject_bootstrap_interval` : refuse (`INSUFFICIENT_CLUSTERS`) en
    dessous de deux grappes (project_id) distinctes pour l'inference
    interprojets, jamais un intervalle degenere sur une grappe unique
    (cahier:L443, A6).

Toute l'arithmetique passe par `fractions.Fraction` (meme discipline
d'exactitude que `analysis/src/aggregate.py`, T32) : le ratio des moyennes
par parent est calcule exactement, sans flottant intermediaire, si bien que
multiplier tous les couts d'entree par une constante commune ne change ni les
ratios ni les bandes (cahier:L443, A3).
"""
from __future__ import annotations

import math
from fractions import Fraction


class NotImplemented_(Exception):
    """Levee par un export declare mais non encore implemente.

    Le message porte le prefixe `NOT_IMPLEMENTED`, meme convention que
    `packages/contracts/src/not-implemented.ts` et que
    `analysis/src/aggregate.py::NotImplemented_` (T32) : un rapport d'echec
    qui ne se nomme pas laisse le lecteur incapable de distinguer un refus de
    squelette d'un vrai refus metier.

    Nommee `NotImplemented_` (trait bas final) parce que `NotImplemented` est
    un singleton builtin de Python (utilise par les protocoles de comparaison
    riches) : le reutiliser comme type d'exception instanciable serait un
    piege, pas une economie.
    """

    def __init__(self, capability: str) -> None:
        super().__init__(f"NOT_IMPLEMENTED {capability}")
        self.capability = capability


def _mean(values: list) -> Fraction:
    """Moyenne exacte d'une liste non vide de nombres (int/Fraction). Meme
    definition que `analysis/src/aggregate.py::_mean` (T32), reprise ici pour
    que ce module reste autonome plutot que couple a un import prive d'un
    autre module IMPL."""
    return Fraction(sum(Fraction(v) for v in values), len(values))


def safe_ratio(numerator: int, denominator: int) -> dict:
    """Ratio exact sans lissage epsilon : denominateur nul produit
    `{"value": None, "status": "ZERO_DENOMINATOR"}`, jamais une exception ni
    une valeur numerique approchee. Meme definition que
    `analysis/src/aggregate.py::safe_ratio` (T32)."""
    if denominator == 0:
        return {"value": None, "status": "ZERO_DENOMINATOR"}
    return {"value": Fraction(numerator, denominator), "status": "OK"}


def _mean_per_parent(rows: list[dict], metric: str) -> dict[str, Fraction]:
    """Moyenne PAR PARENT (strate) d'un metric donne, avant tout tirage.

    L'ordre et le nombre de lignes par parent n'influencent pas le resultat
    tant que les valeurs dupliquees sont identiques (cahier:L443, A5) : une
    moyenne par parent, jamais un pooling brut sur toutes les lignes.
    """
    buckets: dict[str, list] = {}
    for row in rows:
        buckets.setdefault(row["project_id"], []).append(row[metric])
    return {project_id: _mean(values) for project_id, values in buckets.items()}


def paired_parent_bootstrap(rows: list[dict], draws: list[list[str]]) -> dict:
    """Reechantillonneur parent APPARIE (memes indices parents pour les deux
    bras) sur des lignes deja moyennees PAR PARENT (strates), a partir d'une
    liste de tirages FORCEE (cahier:L441, L443)."""
    per_parent_a = _mean_per_parent(rows, "cost_a")
    per_parent_b = _mean_per_parent(rows, "cost_b")

    ratios: list[Fraction | None] = []
    ratio_status: list[str] = []

    for draw in draws:
        mean_a = _mean([per_parent_a[parent_id] for parent_id in draw])
        mean_b = _mean([per_parent_b[parent_id] for parent_id in draw])
        ratio = safe_ratio(mean_a.numerator * mean_b.denominator, mean_a.denominator * mean_b.numerator)
        ratios.append(ratio["value"])
        ratio_status.append(ratio["status"])

    return {
        "ratios": ratios,
        "ratio_status": ratio_status,
        "distinct_parent_count": len(per_parent_a),
        "draw_manifest": {
            # Bootstrap APPARIE : le meme tirage sert aux deux bras, jamais un
            # second flux d'indices independant (cahier:L443, A2).
            "arm_a_parent_ids": [list(draw) for draw in draws],
            "arm_b_parent_ids": [list(draw) for draw in draws],
        },
    }


def empirical_inverse_quantile_interval(values: list, lower_q, upper_q) -> dict:
    """Bande ponctuelle par quantile empirique inverse (rang `ceil(q*n)`,
    1-indexe sur les valeurs triees, sans interpolation lineaire) ; jamais
    etiquetee simultanee (cahier:L441, L443)."""
    sorted_values = sorted(values)
    n = len(sorted_values)

    lower_rank = math.ceil(Fraction(lower_q) * n)
    upper_rank = math.ceil(Fraction(upper_q) * n)

    return {
        "lower": sorted_values[lower_rank - 1],
        "upper": sorted_values[upper_rank - 1],
        "kind": "pointwise",
        "simultaneous": False,
    }


def interproject_bootstrap_interval(rows: list[dict], draws: list[list[str]], lower_q, upper_q) -> dict:
    """Compose le reechantillonneur parent et la bande empirique pour
    l'inference interprojets ; refuse (`INSUFFICIENT_CLUSTERS`) en dessous de
    deux grappes distinctes, jamais un `PASS` sur un prerequis absent
    (cahier:L443)."""
    distinct_parent_count = len({row["project_id"] for row in rows})

    if distinct_parent_count < 2:
        return {
            "status": "INSUFFICIENT_CLUSTERS",
            "interval": None,
            "distinct_parent_count": distinct_parent_count,
        }

    result = paired_parent_bootstrap(rows, draws)
    band = empirical_inverse_quantile_interval(result["ratios"], lower_q, upper_q)

    return {
        "status": "OK",
        "interval": band,
        "ratios": result["ratios"],
        "distinct_parent_count": distinct_parent_count,
    }
