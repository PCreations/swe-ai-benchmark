"""
Estimations au niveau des projets -- T32 (docs/cahier.md L431-L438 ;
docs/specs/T32.md).

ROLE : implementer, ETAGE RED. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T32.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas -- aucune des six fonctions
ci-dessous n'existait avant que la suite T32 les pose.

A ce stade, chaque export est un SQUELETTE : il leve `NotImplemented`
immediatement, sans calculer quoi que ce soit. C'est le rouge legitime que
`bench red T32` attend (STUB_NOT_IMPLEMENTED / ASSERTION_FAILED), a
distinguer d'un rouge illegitime (ModuleNotFoundError avant que ce fichier
n'existe, TypeError d'une signature qui ne correspond pas a l'appel du test) :
verification/runner/red.mjs classe ces deux dernieres formes comme
SUITE_FAILED_TO_RUN, qui n'est pas une preuve.
"""
from __future__ import annotations


class NotImplemented_(Exception):
    """Levee par un export declare mais non encore implemente.

    Le message porte le prefixe `NOT_IMPLEMENTED`, meme convention que
    `packages/contracts/src/not-implemented.ts` : un rapport d'echec qui ne
    se nomme pas laisse le lecteur incapable de distinguer un refus de
    squelette d'un vrai refus metier (cf. ce fichier TS pour la justification
    complete de la distinction).

    Nommee `NotImplemented_` (trait bas final) parce que `NotImplemented` est
    un singleton builtin de Python (utilise par les protocoles de comparaison
    riches) : le reutiliser comme type d'exception instanciable serait un
    piege, pas une economie.
    """

    def __init__(self, capability: str) -> None:
        super().__init__(f"NOT_IMPLEMENTED {capability}")
        self.capability = capability


def aggregate_arm_cost_ratio(project_arms: list[dict]) -> dict:
    """Ratio des moyennes (mean_a / mean_b), jamais la moyenne des ratios
    projet par projet (cahier:L435). Squelette : non implemente."""
    raise NotImplemented_("aggregate.aggregate_arm_cost_ratio")


def aggregate_repetition_rows_by_project(rows: list[dict], metrics: list[str]) -> dict:
    """Moyenne des moyennes PAR PROJET (poids egal par projet), jamais une
    moyenne mise en commun sur toutes les lignes de repetition (cahier:L435).
    Squelette : non implemente."""
    raise NotImplemented_("aggregate.aggregate_repetition_rows_by_project")


def aggregate_quality_columns(period_rows: list[dict]) -> dict:
    """V, U et le ratio d'intentions restent trois colonnes distinctes
    (cahier:L435, L107). Squelette : non implemente."""
    raise NotImplemented_("aggregate.aggregate_quality_columns")


def aggregate_cost_and_success(trajectory_rows: list[dict]) -> dict:
    """Cout moyen sur TOUTES les trajectoires (echecs inclus) et taux de
    reussite (cahier:L435). Squelette : non implemente."""
    raise NotImplemented_("aggregate.aggregate_cost_and_success")


def safe_ratio(numerator: int, denominator: int) -> dict:
    """Ratio exact sans lissage epsilon ; denominateur nul produit
    `{"value": None, "status": "ZERO_DENOMINATOR"}`, jamais une exception ni
    une valeur numerique approchee (cahier:L435). Squelette : non implemente."""
    raise NotImplemented_("aggregate.safe_ratio")


def aggregate_scenarios_then_projects(parents: list[dict]) -> dict:
    """Ponderation des scenarios A L'INTERIEUR de chaque parent avant
    ponderation ENTRE parents (cahier:L435). Squelette : non implemente."""
    raise NotImplemented_("aggregate.aggregate_scenarios_then_projects")
