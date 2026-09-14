"""
Regle de decision economique et ses limites -- T34 (docs/cahier.md L447-L456 ;
docs/specs/T34.md).

ROLE : implementer, ETAGE RED. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T34.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas -- aucun des deux exports
ci-dessous n'existait avant que la suite T34 les pose.

A ce stade, chaque export est un SQUELETTE : il leve `NotImplemented_`
immediatement, sans calculer quoi que ce soit. C'est le rouge legitime que
`bench red T34` attend (STUB_NOT_IMPLEMENTED / ASSERTION_FAILED), a
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
    u_non_inferior) et le blocage par violation critique. Squelette : non
    implemente."""
    raise NotImplemented_("decision.evaluate_contrast")


def bonferroni_family(num_contrasts: int) -> dict:
    """Correction de Bonferroni de cahier:L451 : pour J contrastes et trois
    criteres inferentiels, la famille contient 3J intervalles ; niveau
    marginal 1-0,05/(3J). Squelette : non implemente."""
    raise NotImplemented_("decision.bonferroni_family")
