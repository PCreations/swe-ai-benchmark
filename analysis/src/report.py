"""
Generer un rapport dont les nombres proviennent des resultats -- T36
(docs/cahier.md L467-L476 ; docs/specs/T36.md).

ROLE : implementer, ETAGE RED. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T36.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas -- aucun des exports ci-dessous
n'existait avant que la suite T36 les pose.

A ce stade, chaque export est un SQUELETTE : il leve `NotImplemented_`
immediatement (ou, pour la constante `REQUIRED_CHART_METADATA_FIELDS`, un
tuple vide qui ne satisfait pas encore le contrat), sans calculer quoi que ce
soit. C'est le rouge legitime que `bench red T36` attend
(STUB_NOT_IMPLEMENTED / ASSERTION_FAILED), a distinguer d'un rouge illegitime
(ModuleNotFoundError avant que ce fichier n'existe, TypeError d'une signature
qui ne correspond pas a l'appel du test) : verification/runner/red.mjs classe
ces deux dernieres formes comme SUITE_FAILED_TO_RUN, qui n'est pas une preuve.
"""
from __future__ import annotations


class NotImplemented_(Exception):
    """Levee par un export declare mais non encore implemente.

    Le message porte le prefixe `NOT_IMPLEMENTED`, meme convention que
    `packages/contracts/src/not-implemented.ts` et que
    `analysis/src/aggregate.py::NotImplemented_` (T32), `analysis/src/
    bootstrap.py` (T33), `analysis/src/decision.py::NotImplemented_` (T34) et
    `analysis/src/power.py::NotImplemented_` (T35) : un rapport d'echec qui ne
    se nomme pas laisse le lecteur incapable de distinguer un refus de
    squelette d'un vrai refus metier.

    Nommee `NotImplemented_` (trait bas final) parce que `NotImplemented` est
    un singleton builtin de Python (utilise par les protocoles de comparaison
    riches) : le reutiliser comme type d'exception instanciable serait un
    piege, pas une economie.
    """

    def __init__(self, capability: str) -> None:
        super().__init__(f"NOT_IMPLEMENTED {capability}")
        self.capability = capability


def render_numeric_fact(fact_id, exact_value, precision_digits) -> dict:
    """Arrondit `exact_value` (Fraction exacte) a exactement
    `precision_digits` chiffres apres la virgule et renvoie {"fact_id",
    "exact", "precision_digits", "display"} (cahier:L473). Squelette : non
    implemente."""
    raise NotImplemented_("report.render_numeric_fact")


def render_exact_fact(fact_id, exact_value) -> dict:
    """Rend un fait sans arrondi decimal, par sa representation rationnelle
    exacte : renvoie {"fact_id", "exact", "display"} (cahier:L473). Squelette :
    non implemente."""
    raise NotImplemented_("report.render_exact_fact")


def build_quality_fact_table(V, U, exposure, intent_success_ratio, *, v_precision_digits=4) -> dict:
    """Assemble le tableau de faits de qualite d'une periode a partir de
    valeurs deja calculees (T32), sans les recalculer (cahier:L469).
    Squelette : non implemente."""
    raise NotImplemented_("report.build_quality_fact_table")


def build_cost_ratio_fact_table(mean_a, mean_b, ratio_a_over_b, ratio_status) -> dict:
    """Assemble le tableau de faits de ratio de cout d'une periode
    (cahier:L473). Squelette : non implemente."""
    raise NotImplemented_("report.build_cost_ratio_fact_table")


def build_trajectory_chart_series(trajectory_rows) -> dict:
    """Conserve toutes les lignes de trajectoire recues dans les points de la
    courbe, sans filtre de survivants (cahier:L473). Squelette : non
    implemente."""
    raise NotImplemented_("report.build_trajectory_chart_series")


REQUIRED_CHART_METADATA_FIELDS: tuple = ()
"""Squelette : le tuple exige, ("units", "execution_mode", "population",
"band_kind") (cahier:L473), n'est pas encore pose -- un tuple vide ne
satisfait pas le contrat, ce qui garde T36.A4 rouge pour la bonne raison."""


def build_chart(*, chart_id, series, units, execution_mode, population, band_kind) -> dict:
    """Assemble un graphique portant ses quatre metadonnees obligatoires
    (cahier:L473). Squelette : non implemente."""
    raise NotImplemented_("report.build_chart")


def assemble_report_rows(rows) -> list:
    """Assemble les lignes du rapport sans filtrer les couts non reconcilies
    ni les donnees manquantes (cahier:L473). Squelette : non implemente."""
    raise NotImplemented_("report.assemble_report_rows")


def render_narrative_note(template, fact_refs, fact_table) -> dict:
    """Substitue les espaces reserves du gabarit par les valeurs de
    `fact_table`, et refuse la note si un chiffre est ecrit en dur en dehors
    de tout espace reserve (cahier:L471, L473). Squelette : non implemente."""
    raise NotImplemented_("report.render_narrative_note")
