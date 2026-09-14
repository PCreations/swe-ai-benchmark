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

import re
from fractions import Fraction


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


def _round_to_decimal_string(exact_value: Fraction, precision_digits: int) -> str:
    """Arrondit `exact_value` a `precision_digits` chiffres apres la virgule
    et renvoie une chaine decimale a point avec EXACTEMENT ce nombre de
    chiffres apres le point (cahier:L473). Arrondi au plus proche, moitie
    arrondie vers le haut en valeur absolue -- les fixtures exercees ici sont
    exactement representables a la precision demandee, donc cette convention
    ne change aucun resultat observe (docstring du contrat, test_T36.py)."""
    scale = 10**precision_digits
    scaled = exact_value * scale
    numerator = scaled.numerator
    denominator = scaled.denominator
    sign = "-" if numerator < 0 else ""
    numerator = abs(numerator)
    # Fraction moitie-vers-le-haut : floor(numerator/denominator + 1/2).
    rounded = (numerator * 2 + denominator) // (denominator * 2)
    digits = str(rounded).zfill(precision_digits + 1)
    if precision_digits == 0:
        return f"{sign}{digits}"
    int_part, frac_part = digits[:-precision_digits], digits[-precision_digits:]
    return f"{sign}{int_part}.{frac_part}"


def render_numeric_fact(fact_id, exact_value, precision_digits) -> dict:
    """Arrondit `exact_value` (Fraction exacte) a exactement
    `precision_digits` chiffres apres la virgule et renvoie {"fact_id",
    "exact", "precision_digits", "display"} (cahier:L473)."""
    exact_value = Fraction(exact_value)
    return {
        "fact_id": fact_id,
        "exact": exact_value,
        "precision_digits": precision_digits,
        "display": _round_to_decimal_string(exact_value, precision_digits),
    }


def render_exact_fact(fact_id, exact_value) -> dict:
    """Rend un fait sans arrondi decimal, par sa representation rationnelle
    exacte : renvoie {"fact_id", "exact", "display"} (cahier:L473)."""
    exact_value = Fraction(exact_value)
    if exact_value.denominator == 1:
        display = str(exact_value.numerator)
    else:
        display = f"{exact_value.numerator}/{exact_value.denominator}"
    return {"fact_id": fact_id, "exact": exact_value, "display": display}


def build_quality_fact_table(V, U, exposure, intent_success_ratio, *, v_precision_digits=4) -> dict:
    """Assemble le tableau de faits de qualite d'une periode a partir de
    valeurs deja calculees (T32), sans les recalculer (cahier:L469). Le
    fact_id "U" reste lie a `U`, jamais a `intent_success_ratio` (piege
    cahier:L107)."""
    return {
        "V": render_numeric_fact("V", V, v_precision_digits),
        "U": render_exact_fact("U", U),
        "exposure": render_exact_fact("exposure", exposure),
        "intent_success_ratio": render_exact_fact("intent_success_ratio", intent_success_ratio),
    }


def build_cost_ratio_fact_table(mean_a, mean_b, ratio_a_over_b, ratio_status) -> dict:
    """Assemble le tableau de faits de ratio de cout d'une periode
    (cahier:L473). `ratio_a_over_b` n'est rendu que si `ratio_status ==
    "OK"` ; sinon le fait porte `exact`/`display` a `None`, sans valeur
    numerique de secours (meme convention que T32 `safe_ratio`)."""
    if ratio_status == "OK":
        ratio_fact = render_exact_fact("ratio_a_over_b", ratio_a_over_b)
    else:
        ratio_fact = {"fact_id": "ratio_a_over_b", "exact": None, "display": None}
    return {
        "mean_a": render_exact_fact("mean_a", mean_a),
        "mean_b": render_exact_fact("mean_b", mean_b),
        "ratio_a_over_b": ratio_fact,
        "ratio_status": ratio_status,
    }


def build_trajectory_chart_series(trajectory_rows) -> dict:
    """Conserve toutes les lignes de trajectoire recues dans les points de la
    courbe, sans filtre de survivants sur `attempt_outcome` (cahier:L473 :
    « une trajectoire echouee reste dans les courbes »)."""
    return {"points": list(trajectory_rows)}


REQUIRED_CHART_METADATA_FIELDS: tuple = ("units", "execution_mode", "population", "band_kind")
"""Les quatre metadonnees exigees par graphique (cahier:L473 : « chaque
graphique porte unites, mode, population et nature des bandes »)."""


def build_chart(*, chart_id, series, units, execution_mode, population, band_kind) -> dict:
    """Assemble un graphique portant ses quatre metadonnees obligatoires,
    toujours presentes et non None (cahier:L473)."""
    return {
        "chart_id": chart_id,
        "series": series,
        "metadata": {
            "units": units,
            "execution_mode": execution_mode,
            "population": population,
            "band_kind": band_kind,
        },
    }


def assemble_report_rows(rows) -> list:
    """Assemble les lignes du rapport sans filtrer les couts non reconcilies
    (`cost_status == "UNKNOWN"`) ni les lignes a `missing_data` vrai
    (cahier:L473 : « cout non reconcilie et donnees manquantes apparaissent
    dans le rapport » ; meme statut que T31.A4)."""
    return list(rows)


_PLACEHOLDER_RE = re.compile(r"\{[^{}]*\}")


def render_narrative_note(template, fact_refs, fact_table) -> dict:
    """Substitue les espaces reserves `{nom}` du gabarit par
    `fact_table[fact_refs[nom]]["display"]`, et refuse la note entiere si un
    chiffre est ecrit en dur dans `template` EN DEHORS de tout espace
    reserve (cahier:L471 : « le moteur insere lui-meme les nombres [...] du
    texte libre contenant des affirmations numeriques non rattachees a un
    fait calcule n'entre pas dans le rapport certifie »). N'altere jamais
    `fact_table` (cahier:L473)."""
    template_without_placeholders = _PLACEHOLDER_RE.sub("", template)
    if re.search(r"\d", template_without_placeholders):
        return {"accepted": False, "rendered": None, "reason": "UNBOUND_NUMERIC_LITERAL"}

    rendered = template
    for name, fact_id in fact_refs.items():
        rendered = rendered.replace("{" + name + "}", str(fact_table[fact_id]["display"]))
    return {"accepted": True, "rendered": rendered, "reason": None}
