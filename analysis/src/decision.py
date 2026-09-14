"""
Regle de decision economique et ses limites -- T34 (docs/cahier.md L447-L456 ;
docs/specs/T34.md).

ROLE : implementer, ETAGE IMPL. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T34.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas.

Regle (cahier:L451) : superiorite cout si borne superieure du ratio <1 ;
non-inferiorite V/U si leurs bornes inferieures >-marge ; aucune violation
critique interdite ; comptabilite resolue et donnees admissibles.
"""
from __future__ import annotations

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


def evaluate_contrast(
    ratio_upper_bound,
    delta_v_lower_bound,
    delta_u_lower_bound,
    margin,
    accounting_status: str,
    distinct_parent_count: int,
    has_critical_violation: bool,
) -> dict:
    """Applique la regle de decision de cahier:L451 a un contraste deja
    borne : porte d'admissibilite (comptabilite resolue ET >=2 grappes),
    puis trois criteres independants (cost_superior, v_non_inferior,
    u_non_inferior) et le blocage par violation critique.

    Porte d'admissibilite : `accounting_status == "RESOLVED"` ET
    `distinct_parent_count >= 2`. Si non admissible, le contraste est
    INCONCLUSIVE quels que soient les autres criteres (les trois criteres ne
    sont alors pas calcules a partir des bornes -- ils restent `False`, sans
    signification puisque `admissible` est `False`).

    Frontieres strictes (cahier:L451) : `<1` pour le ratio, `>-margin` pour
    les deltas V et U -- pas `<=`/`>=`.
    """
    admissible = accounting_status == "RESOLVED" and distinct_parent_count >= 2

    if admissible:
        cost_superior = ratio_upper_bound < 1
        v_non_inferior = delta_v_lower_bound > -margin
        u_non_inferior = delta_u_lower_bound > -margin
        critical_violation_blocks = has_critical_violation
        superior = (
            cost_superior
            and v_non_inferior
            and u_non_inferior
            and not has_critical_violation
        )
        status = "SUPERIOR" if superior else "NOT_SUPERIOR"
    else:
        cost_superior = False
        v_non_inferior = False
        u_non_inferior = False
        critical_violation_blocks = has_critical_violation
        superior = False
        status = "INCONCLUSIVE"

    return {
        "status": status,
        "superior": superior,
        "admissible": admissible,
        "cost_superior": cost_superior,
        "v_non_inferior": v_non_inferior,
        "u_non_inferior": u_non_inferior,
        "critical_violation_blocks": critical_violation_blocks,
    }


def bonferroni_family(num_contrasts: int) -> dict:
    """Correction de Bonferroni de cahier:L451 : pour J contrastes et trois
    criteres inferentiels, la famille contient 3J intervalles ; niveau
    marginal 1-0,05/(3J)."""
    interval_count = 3 * num_contrasts
    marginal_level = Fraction(1) - Fraction(5, 100) / interval_count
    return {
        "interval_count": interval_count,
        "marginal_level": marginal_level,
    }
