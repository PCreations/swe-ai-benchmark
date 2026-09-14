"""
Dimensionnement par simulation -- T35 (docs/cahier.md L457-L465 ;
docs/specs/T35.md).

ROLE : implementer, ETAGE RED. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T35.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas -- aucun des trois exports
ci-dessous n'existait avant que la suite T35 les pose.

A ce stade, chaque export est un SQUELETTE : il leve `NotImplemented_`
immediatement, sans calculer quoi que ce soit. C'est le rouge legitime que
`bench red T35` attend (STUB_NOT_IMPLEMENTED / ASSERTION_FAILED), a
distinguer d'un rouge illegitime (ModuleNotFoundError avant que ce fichier
n'existe, TypeError d'une signature qui ne correspond pas a l'appel du test) :
verification/runner/red.mjs classe ces deux dernieres formes comme
SUITE_FAILED_TO_RUN, qui n'est pas une preuve.
"""
from __future__ import annotations


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
    sqrt(power*(1-power)/n) (cahier:L461, L463). Squelette : non
    implemente."""
    raise NotImplemented_("power.decision_series_power")


def select_from_grid(grid_results: list, target_power, max_se) -> dict:
    """Selectionne, dans une grille croissante par effectif deja triee, le
    plus petit effectif dont la puissance estimee atteint `target_power` ET
    dont l'erreur standard respecte `max_se`, ou TARGET_NOT_REACHED si aucun
    ne satisfait les deux (cahier:L461). Squelette : non implemente."""
    raise NotImplemented_("power.select_from_grid")


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
    (cahier:L461). Squelette : non implemente."""
    raise NotImplemented_("power.simulate_power")
