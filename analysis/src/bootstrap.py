"""
Bootstrap apparie et bandes -- T33 (docs/cahier.md L439-L446 ;
docs/specs/T33.md).

ROLE : implementer, ETAGE RED. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T33.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas -- aucun des trois exports
ci-dessous n'existait avant que la suite T33 les pose.

A ce stade, chaque export est un SQUELETTE : il leve `NotImplemented_`
immediatement, sans calculer quoi que ce soit. C'est le rouge legitime que
`bench red T33` attend (STUB_NOT_IMPLEMENTED / ASSERTION_FAILED), a
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


def paired_parent_bootstrap(rows: list[dict], draws: list[list[str]]) -> dict:
    """Reechantillonneur parent APPARIE (memes indices parents pour les deux
    bras) sur des lignes deja moyennees PAR PARENT (strates), a partir d'une
    liste de tirages FORCEE (cahier:L441, L443). Squelette : non implemente."""
    raise NotImplemented_("bootstrap.paired_parent_bootstrap")


def empirical_inverse_quantile_interval(values: list, lower_q, upper_q) -> dict:
    """Bande ponctuelle par quantile empirique inverse (rang `ceil(q*n)`,
    1-indexe sur les valeurs triees, sans interpolation lineaire) ; jamais
    etiquetee simultanee (cahier:L441, L443). Squelette : non implemente."""
    raise NotImplemented_("bootstrap.empirical_inverse_quantile_interval")


def interproject_bootstrap_interval(rows: list[dict], draws: list[list[str]], lower_q, upper_q) -> dict:
    """Compose le reechantillonneur parent et la bande empirique pour
    l'inference interprojets ; refuse (`INSUFFICIENT_CLUSTERS`) en dessous de
    deux grappes distinctes, jamais un `PASS` sur un prerequis absent
    (cahier:L443). Squelette : non implemente."""
    raise NotImplemented_("bootstrap.interproject_bootstrap_interval")
