"""
Suite d'acceptation T34 -- « Coder la règle de décision économique et ses
limites » (docs/cahier.md L447-L456 ; docs/specs/T34.md).

ROLE : test-author, AVEUGLE A L'IMPLEMENTATION (ADR-001). Ce fichier ne lit ni
n'importe aucune source de `analysis/src/**`, `packages/**` ni `apps/**` par un
autre chemin que l'import public `decision` ci-dessous. Le contrat du module
`decision` (ses fonctions, la forme de leurs entrees et sorties) est DERIVE
des cartes de specification et POSE ICI POUR LA PREMIERE FOIS : c'est la
definition de l'interface que l'implementeur doit satisfaire, pas
l'observation d'un code deja ecrit. `analysis/src/decision.py` n'existe pas
encore a ce stade -- l'etat rouge attendu de cette suite, jusqu'a
l'implementation, est une erreur de collection (`ModuleNotFoundError:
decision`).

CONTRAT POSE (livrables cahier:L449 : « décision structurée, correction des
comparaisons et justification par critères ») :

  decision.evaluate_contrast(ratio_upper_bound, delta_v_lower_bound,
                              delta_u_lower_bound, margin, accounting_status,
                              distinct_parent_count, has_critical_violation) -> dict
      Applique la regle de cahier:L451 a un contraste DEJA borne (les bornes
      d'intervalle -- ratio de cout, delta V, delta U -- sont des entrees de
      cette fonction, pas recalculees ici : T34 depend de T32/T33 qui
      produisent deja ces bornes, cf. cahier:L449 "les politiques sont des
      entrees validees"). Tous les nombres sont des `Fraction` exactes.
      `accounting_status` vaut "RESOLVED" ou "UNKNOWN" (comptabilite
      resolue ou non, cahier:L451 "comptabilite resolue et donnees
      admissibles"). `distinct_parent_count` est le nombre de grappes
      (parents) distinctes disponibles pour l'inference (meme grandeur que
      `bootstrap.interproject_bootstrap_interval` de T33).

      Porte d'admissibilite (cahier:L451, "comptabilite resolue et donnees
      admissibles") : `admissible` est vrai si et seulement si
      `accounting_status == "RESOLVED"` ET `distinct_parent_count >= 2`. Si
      `admissible` est faux, le contraste est `INCONCLUSIVE` quels que soient
      les autres criteres.

      Si admissible, trois criteres INDEPENDANTS et EXPOSES (justification
      par critere, cahier:L449) :
        - `cost_superior`    = `ratio_upper_bound < 1` (frontiere STRICTE,
                                cahier:L451 "borne superieure du ratio <1")
        - `v_non_inferior`   = `delta_v_lower_bound > -margin` (frontiere
                                STRICTE, cahier:L451 "bornes inferieures
                                >-marge")
        - `u_non_inferior`   = `delta_u_lower_bound > -margin` (meme regle,
                                appliquee separement a U)
      et `critical_violation_blocks` = `has_critical_violation` (cahier:L451
      "aucune violation critique interdite").

      `superior` = `cost_superior AND v_non_inferior AND u_non_inferior AND
      (NOT has_critical_violation)`, uniquement si `admissible`.

      `status` vaut "SUPERIOR" si `superior`, "INCONCLUSIVE" si NON
      `admissible`, sinon "NOT_SUPERIOR".

      Renvoie {"status": str, "superior": bool, "admissible": bool,
      "cost_superior": bool, "v_non_inferior": bool, "u_non_inferior": bool,
      "critical_violation_blocks": bool}.

  decision.bonferroni_family(num_contrasts) -> dict
      Correction de Bonferroni de cahier:L451 : « Pour J contrastes et trois
      criteres inferentiels, la famille contient 3J intervalles ; niveau
      marginal 1-0,05/(3J) ». `num_contrasts` est J (un entier >= 1). Renvoie
      {"interval_count": int, "marginal_level": Fraction} avec
      `interval_count = 3 * num_contrasts` et
      `marginal_level = 1 - Fraction(5, 100) / interval_count`.

PROVENANCE DES LITTERAUX. Tout litteral compare dans une assertion provient
soit d'un import de acceptance/reference/** (F-POWER), soit porte un
commentaire `# cahier:L<n>` resolvable par `sed -n '<n>p' docs/cahier.md`.

Portee : les 7 cas requis de T34 (verification/tasks.json, required_cases),
tels que fixes par verification/cases.lock.json. Le livrable T34 depend de
T03, T32 et T33 (cahier:L449). F-POWER (cahier:L127) porte, pour chacune de
ses quatre campagnes, la borne de ratio, la borne de delta V, la borne de
delta U ET la decision T34 attendue ("decision_T34"), ainsi que la liste
complete "decisions_T34_attendues" = [vrai,faux,faux,vrai] -- ce fichier
reprend ces valeurs SANS les recalculer (le "cout plus faible" au numerateur
de chaque campagne A vaut toujours 80, sauf la campagne 2 a 100 ; les valeurs
B sont fixes a cout=100, V=1, U=1 dans les trois preconditions du fixture).
Les cas A3 et A4 exercent des frontieres CONSTRUITES (marge exacte -0,02 pour
A3, ecart -0,04 pour A4) qui ne correspondent PAS aux campagnes F-POWER 3 et 4
elles-memes (dont les bornes reelles sont -0,04 et -0,01) : ce sont les
valeurs explicitement nommees par le texte d'acceptation (cahier:L453) et par
verification/cases.lock.json pour A3/A4, distinctes de la fixture F-POWER qui,
elle, est integralement couverte par A1 (garde-fou des quatre campagnes).
"""
from __future__ import annotations

from fractions import Fraction

import decision  # module a fournir par analysis/src/decision.py (zone IMPL, hors de ce role)

from _fixtures import load_reference_fixture

F_POWER = load_reference_fixture("F-POWER")

# Marge d'exemple de la regle de non-inferiorite (cahier:L451 : « Marges
# d'exemple 0,02 »).
MARGIN = Fraction(1, 50)  # 0,02


def _frac(rationnel: dict | None) -> Fraction | None:
    """Convertit un noeud {"num": n, "den": d} des fixtures en Fraction exacte."""
    if rationnel is None:
        return None
    return Fraction(rationnel["num"], rationnel["den"])


def _campaign(rang: int) -> dict:
    """Renvoie la campagne F-POWER (cahier:L127) de rang donne (1 a 4)."""
    for campagne in F_POWER["valeurs"]["campagnes"]:
        if campagne["rang"] == rang:
            return campagne
    raise AssertionError(f"campagne de rang {rang} absente de F-POWER")


def _evaluate(ratio_upper, delta_v_lower, delta_u_lower, *, accounting_status="RESOLVED",
              distinct_parent_count=2, has_critical_violation=False):
    """Raccourci qui fixe les parametres d'admissibilite « sains » par
    defaut (comptabilite resolue, deux grappes, aucune violation critique),
    pour que chaque cas ne fasse varier explicitement que ce qu'il exerce."""
    return decision.evaluate_contrast(
        ratio_upper_bound=ratio_upper,
        delta_v_lower_bound=delta_v_lower,
        delta_u_lower_bound=delta_u_lower,
        margin=MARGIN,
        accounting_status=accounting_status,
        distinct_parent_count=distinct_parent_count,
        has_critical_violation=has_critical_violation,
    )


# ---------------------------------------------------------------------------
# T34.A1 -- bornes ratio 0,8, dV=0, dU=0 et critiques absentes donnent
# supériorité sur la fixture F-POWER (cahier:L127, L453).
# ---------------------------------------------------------------------------


def test_T34_A1_f_power_campaign1_bounds_give_superiority():
    campaign = _campaign(1)
    ratio_upper = _frac(campaign["borne_de_ratio"]["rationnel"])  # 4/5, importe
    delta_v_lower = _frac(campaign["borne_de_delta_V"]["rationnel"])  # 0, importe
    delta_u_lower = _frac(campaign["borne_de_delta_U"]["rationnel"])  # 0, importe
    assert ratio_upper == Fraction(4, 5)  # controle
    assert delta_v_lower == Fraction(0)  # controle
    assert delta_u_lower == Fraction(0)  # controle
    expected = campaign["decision_T34"]["valeur"]  # true, importe
    assert expected is True  # controle : la campagne 1 est bien la campagne superieure

    result = _evaluate(ratio_upper, delta_v_lower, delta_u_lower)

    assert result["admissible"] is True
    assert result["cost_superior"] is True
    assert result["v_non_inferior"] is True
    assert result["u_non_inferior"] is True
    assert result["critical_violation_blocks"] is False
    assert result["superior"] is True
    assert result["status"] == "SUPERIOR"

    # Garde-fou explicite (cahier:L127) : les QUATRE campagnes de F-POWER,
    # evaluees par la meme fonction avec leurs propres bornes scellees,
    # doivent reproduire exactement decisions_T34_attendues = [vrai,faux,
    # faux,vrai], pas seulement la premiere.
    expected_series = F_POWER["valeurs"]["decisions_T34_attendues"]["valeur"]  # importe
    assert expected_series == [True, False, False, True]  # controle
    observed_series = []
    for rang in (1, 2, 3, 4):
        c = _campaign(rang)
        r = _evaluate(
            _frac(c["borne_de_ratio"]["rationnel"]),
            _frac(c["borne_de_delta_V"]["rationnel"]),
            _frac(c["borne_de_delta_U"]["rationnel"]),
        )
        assert r["status"] == "SUPERIOR" if c["decision_T34"]["valeur"] else r["status"] == "NOT_SUPERIOR"
        observed_series.append(r["superior"])
    assert observed_series == expected_series


# ---------------------------------------------------------------------------
# T34.A2 -- borne ratio=1 refuse (frontiere stricte, cahier:L451, L453).
# ---------------------------------------------------------------------------


def test_T34_A2_ratio_upper_bound_equal_to_one_refuses():
    # Controle de capacite : un contraste sain (campagne 1) doit produire une
    # veritable superiorite -- sinon un refus systematique verdirait ce cas a
    # tort (verification/cases.lock.json).
    good = _evaluate(Fraction(4, 5), Fraction(0), Fraction(0))
    assert good["status"] == "SUPERIOR"
    assert good["superior"] is True

    campaign2 = _campaign(2)
    ratio_upper = _frac(campaign2["borne_de_ratio"]["rationnel"])  # importe
    assert ratio_upper == Fraction(1)  # controle (cahier:L127 -- litteral_cahier "1")
    expected = campaign2["decision_T34"]["valeur"]  # importe
    assert expected is False  # controle

    result = _evaluate(ratio_upper, Fraction(0), Fraction(0))

    assert result["cost_superior"] is False
    assert result["superior"] is False
    assert result["status"] == "NOT_SUPERIOR"

    # Garde-fou explicite contre la variante PERMISSIVE nommee par
    # verification/cases.lock.json : « borne superieure du ratio <=1 au lieu
    # de <1, de sorte que la borne 1 passe ».
    permissive_cost_superior = ratio_upper <= 1
    assert permissive_cost_superior is True  # controle : la variante permissive laisserait passer 1
    assert result["cost_superior"] != permissive_cost_superior


# ---------------------------------------------------------------------------
# T34.A3 -- borne dV=-0,02 (exactement -marge) refuse (frontiere stricte,
# cahier:L451, L453).
# ---------------------------------------------------------------------------


def test_T34_A3_delta_v_lower_bound_equal_to_negative_margin_refuses():
    good = _evaluate(Fraction(4, 5), Fraction(0), Fraction(0))
    assert good["v_non_inferior"] is True
    assert good["status"] == "SUPERIOR"

    delta_v_lower = -MARGIN  # -0,02 exactement -- cahier:L453 « borne dV=-0,02 refuse »
    assert delta_v_lower == Fraction(-1, 50)  # controle

    result = _evaluate(Fraction(4, 5), delta_v_lower, Fraction(0))

    assert result["v_non_inferior"] is False
    assert result["cost_superior"] is True  # controle : seul le critere V est en cause ici
    assert result["superior"] is False
    assert result["status"] == "NOT_SUPERIOR"

    # Garde-fou explicite contre la variante PERMISSIVE nommee par
    # verification/cases.lock.json : « borne inferieure >=-marge au lieu de
    # >-marge (ou marge portee a 0,03), de sorte que dV=-0,02 passe ».
    permissive_v_non_inferior = delta_v_lower >= -MARGIN
    assert permissive_v_non_inferior is True  # controle
    assert result["v_non_inferior"] != permissive_v_non_inferior

    widened_margin = Fraction(3, 100)  # 0,03 -- autre variante permissive nommee
    permissive_via_wider_margin = delta_v_lower > -widened_margin
    assert permissive_via_wider_margin is True  # controle
    assert result["v_non_inferior"] != permissive_via_wider_margin


# ---------------------------------------------------------------------------
# T34.A4 -- coût plus faible mais dU=-0,04 refuse (le critère U ne se
# court-circuite pas, cahier:L451, L453).
# ---------------------------------------------------------------------------


def test_T34_A4_lower_cost_but_delta_u_lower_bound_minus_point_zero_four_refuses():
    good = _evaluate(Fraction(4, 5), Fraction(0), Fraction(0))
    assert good["u_non_inferior"] is True
    assert good["status"] == "SUPERIOR"

    ratio_upper = Fraction(4, 5)  # 0,8 -- cout plus faible (cahier:L127, meme borne que la campagne 1)
    delta_u_lower = Fraction(-4, 100)  # -0,04 -- cahier:L453 « dU=-0,04 »
    assert delta_u_lower == Fraction(-1, 25)  # controle

    result = _evaluate(ratio_upper, Fraction(0), delta_u_lower)

    assert result["cost_superior"] is True  # cout bien plus faible
    assert result["v_non_inferior"] is True  # controle : seul le critere U est en cause ici
    assert result["u_non_inferior"] is False
    assert result["superior"] is False
    assert result["status"] == "NOT_SUPERIOR"

    # Garde-fou explicite contre la perturbation nommee par
    # verification/cases.lock.json : « court-circuiter le critere U : accorder
    # la superiorite des que la borne du ratio est <1, sans controler dU ».
    shortcut_on_cost_alone = result["cost_superior"]
    assert shortcut_on_cost_alone is True  # controle : le court-circuit accorderait a tort
    assert result["superior"] != shortcut_on_cost_alone


# ---------------------------------------------------------------------------
# T34.A5 -- comptabilité UNKNOWN ou grappe unique donne INCONCLUSIVE
# (cahier:L451, L453).
# ---------------------------------------------------------------------------


def test_T34_A5_unknown_accounting_or_single_cluster_yields_inconclusive():
    # Controle de capacite : donnees admissibles (comptabilite resolue, deux
    # grappes) doivent produire un veritable verdict -- sinon un refus
    # systematique verdirait ce cas a tort.
    healthy = _evaluate(Fraction(4, 5), Fraction(0), Fraction(0))
    assert healthy["admissible"] is True
    assert healthy["status"] == "SUPERIOR"

    unknown_accounting = _evaluate(
        Fraction(4, 5), Fraction(0), Fraction(0), accounting_status="UNKNOWN", distinct_parent_count=2
    )
    assert unknown_accounting["admissible"] is False
    assert unknown_accounting["status"] == "INCONCLUSIVE"
    assert unknown_accounting["superior"] is False

    single_cluster = _evaluate(
        Fraction(4, 5), Fraction(0), Fraction(0), accounting_status="RESOLVED", distinct_parent_count=1
    )
    assert single_cluster["admissible"] is False
    assert single_cluster["status"] == "INCONCLUSIVE"
    assert single_cluster["superior"] is False

    # Garde-fou explicite contre la variante PERMISSIVE nommee par
    # verification/cases.lock.json : « traiter une comptabilite UNKNOWN comme
    # resolue et une grappe unique comme suffisante ».
    permissive_admissible_unknown = True  # ce que rendrait la variante permissive
    assert unknown_accounting["admissible"] != permissive_admissible_unknown
    permissive_admissible_single = True
    assert single_cluster["admissible"] != permissive_admissible_single


# ---------------------------------------------------------------------------
# T34.A6 -- J=2 donne six intervalles et niveau marginal 1-0,05/6
# (correction de Bonferroni, cahier:L451, L453).
# ---------------------------------------------------------------------------


def test_T34_A6_two_contrasts_give_six_intervals_and_marginal_level():
    result = decision.bonferroni_family(2)

    expected_interval_count = 6  # cahier:L451 "3J" pour J=2 ; cahier:L453
    expected_marginal_level = Fraction(1) - Fraction(5, 100) / 6  # 1-0,05/(3*2) -- cahier:L451
    assert expected_marginal_level == Fraction(119, 120)  # controle

    assert result["interval_count"] == expected_interval_count
    assert result["marginal_level"] == expected_marginal_level

    # Controle de capacite : J=1 doit donner 3 intervalles et un niveau
    # marginal distinct, pour exclure une implementation qui renverrait une
    # constante independante de J.
    baseline = decision.bonferroni_family(1)
    assert baseline["interval_count"] == 3
    assert baseline["marginal_level"] == Fraction(1) - Fraction(5, 100) / 3
    assert baseline["interval_count"] != result["interval_count"]
    assert baseline["marginal_level"] != result["marginal_level"]

    # Garde-fou explicite contre la perturbation nommee par
    # verification/cases.lock.json : « fausser la regle de taille de famille
    # sans toucher la fixture : 3J-1 = 5 intervalles et niveau marginal
    # 1-0,05/5 ».
    wrong_interval_count = 3 * 2 - 1
    assert wrong_interval_count == 5  # controle
    wrong_marginal_level = Fraction(1) - Fraction(5, 100) / wrong_interval_count
    assert wrong_marginal_level == Fraction(99, 100)  # controle
    assert result["interval_count"] != wrong_interval_count
    assert result["marginal_level"] != wrong_marginal_level


# ---------------------------------------------------------------------------
# T34.A7 -- une violation critique bloque le qualificatif de livraison
# fiable (cahier:L451, L453).
# ---------------------------------------------------------------------------


def test_T34_A7_critical_violation_blocks_reliable_delivery_qualifier():
    healthy = _evaluate(Fraction(4, 5), Fraction(0), Fraction(0), has_critical_violation=False)
    assert healthy["critical_violation_blocks"] is False
    assert healthy["status"] == "SUPERIOR"
    assert healthy["superior"] is True

    blocked = _evaluate(Fraction(4, 5), Fraction(0), Fraction(0), has_critical_violation=True)

    assert blocked["cost_superior"] is True  # controle : seule la violation critique est en cause ici
    assert blocked["v_non_inferior"] is True
    assert blocked["u_non_inferior"] is True
    assert blocked["critical_violation_blocks"] is True
    assert blocked["superior"] is False
    assert blocked["status"] == "NOT_SUPERIOR"

    # Garde-fou explicite contre la perturbation nommee par
    # verification/cases.lock.json : « retrograder la violation critique en
    # simple avertissement, de sorte que le qualificatif de livraison fiable
    # soit tout de meme accorde ».
    downgraded_to_warning = blocked["cost_superior"] and blocked["v_non_inferior"] and blocked["u_non_inferior"]
    assert downgraded_to_warning is True  # controle : la retrogradation accorderait a tort
    assert blocked["superior"] != downgraded_to_warning
