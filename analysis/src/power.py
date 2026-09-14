"""
Dimensionnement par simulation -- T35 (docs/cahier.md L457-L465 ;
docs/specs/T35.md).

ROLE : implementer, ETAGE IMPL. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T35.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas.

Dependance deja validee (T34) : `decision.evaluate_contrast` est appelee
telle quelle depuis `simulate_power`, sans reimplementer sa regle.
"""
from __future__ import annotations

import math
from fractions import Fraction

import decision


class NotImplemented_(Exception):
    """Levee par un export declare mais non encore implemente.

    Le message porte le prefixe `NOT_IMPLEMENTED`, meme convention que
    `packages/contracts/src/not-implemented.ts` et que
    `analysis/src/aggregate.py::NotImplemented_` (T32), `analysis/src/
    bootstrap.py` (T33) et `analysis/src/decision.py::NotImplemented_` (T34) :
    un rapport d'echec qui ne se nomme pas laisse le lecteur incapable de
    distinguer un refus de squelette d'un vrai refus metier.

    Nommee `NotImplemented_` (trait bas final) parce que `NotImplemented` est
    un singleton builtin de Python (utilise par les protocoles de comparaison
    riches) : le reutiliser comme type d'exception instanciable serait un
    piege, pas une economie.
    """

    def __init__(self, capability: str) -> None:
        super().__init__(f"NOT_IMPLEMENTED {capability}")
        self.capability = capability


def decision_series_power(decisions: list) -> dict:
    """Estimation Monte-Carlo de la puissance a partir d'une serie de
    decisions deja calculees : `successes` = nombre de vrais, `n` = longueur,
    `power` = Fraction(successes, n) exacte, `se` =
    sqrt(power*(1-power)/n) (cahier:L461, L463)."""
    n = len(decisions)
    successes = sum(1 for d in decisions if d)
    power_fraction = Fraction(successes, n)
    p = float(power_fraction)
    se = math.sqrt(p * (1 - p) / n)
    return {
        "power": power_fraction,
        "se": se,
        "successes": successes,
        "n": n,
    }


def select_from_grid(grid_results: list, target_power, max_se) -> dict:
    """Selectionne, dans une grille croissante par effectif deja triee, le
    plus petit effectif dont la puissance estimee atteint `target_power` ET
    dont l'erreur standard respecte `max_se`, ou TARGET_NOT_REACHED si aucun
    ne satisfait les deux (cahier:L461)."""
    for entry in grid_results:
        if entry["power"] >= target_power and entry["se"] <= max_se:
            return {
                "status": "OK",
                "selected_n": entry["n"],
                "selected": entry,
            }
    return {
        "status": "TARGET_NOT_REACHED",
        "selected_n": None,
        "selected": None,
    }


def simulate_power(
    parent_count,
    repetition_count,
    simulation_count,
    generator,
    generator_kwargs,
    seed,
    margin,
) -> dict:
    """Execute exactement `simulation_count` simulations (aucun arret
    anticipe, cahier:L463 A6), en appelant `generator` pour chaque campagne
    puis `decision.evaluate_contrast` sur les bornes qu'elle renvoie, et
    accumule les decisions resultantes via `decision_series_power`
    (cahier:L461). Le seuil de decision (frontiere <1 du ratio, `margin` pour
    V/U) est fixe par `decision.evaluate_contrast` lui-meme : l'« effet
    suppose » que `generator_kwargs` peut porter n'est jamais transmis a
    `evaluate_contrast`, seulement au generateur."""
    decisions: list = []
    for simulation_index in range(simulation_count):
        campaign = generator(
            seed=seed,
            simulation_index=simulation_index,
            parent_count=parent_count,
            repetition_count=repetition_count,
            **generator_kwargs,
        )
        result = decision.evaluate_contrast(
            ratio_upper_bound=campaign["ratio_bound"],
            delta_v_lower_bound=campaign["delta_v_bound"],
            delta_u_lower_bound=campaign["delta_u_bound"],
            margin=margin,
            accounting_status=campaign.get("accounting_status", "RESOLVED"),
            distinct_parent_count=parent_count,
            has_critical_violation=campaign.get("has_critical_violation", False),
        )
        decisions.append(result["superior"])

    power_result = decision_series_power(decisions)
    return {
        **power_result,
        "decisions": decisions,
        "seed": seed,
        "parent_count": parent_count,
        "repetition_count": repetition_count,
        "simulation_count": simulation_count,
    }
