"""
Suite d'acceptation T35 -- « Programmer le dimensionnement par simulation »
(docs/cahier.md L457-L465 ; docs/specs/T35.md).

ROLE : test-author, AVEUGLE A L'IMPLEMENTATION (ADR-001). Ce fichier ne lit ni
n'importe aucune source de `analysis/src/**`, `packages/**` ni `apps/**` par un
autre chemin que les imports publics `power` et `decision` ci-dessous. Le
contrat du module `power` (ses fonctions, la forme de leurs entrees et
sorties) est DERIVE des cartes de specification et POSE ICI POUR LA PREMIERE
FOIS : c'est la definition de l'interface que l'implementeur doit satisfaire,
pas l'observation d'un code deja ecrit. `analysis/src/power.py` n'existe pas
encore a ce stade -- l'etat rouge attendu de cette suite, jusqu'a
l'implementation, est une erreur de collection (`ModuleNotFoundError: power`).
`decision` (analysis/src/decision.py), en revanche, est une DEPENDANCE deja
validee par T34 (cahier:L459 « Dépendances : T02, T32, T33 et T34 ») : ce
fichier l'importe et reutilise son contrat public tel que pose par
analysis/tests/test_T34.py, sans jamais lire son code source.

CONTRAT POSE (livrables cahier:L459 : « générateur de campagnes statistiques,
grille d'effectifs, sélection prédéfinie et estimation d'erreur Monte-Carlo » ;
travail cahier:L461) :

  power.decision_series_power(decisions: list[bool]) -> dict
      Estimation Monte-Carlo de la puissance a partir d'une serie de
      decisions DEJA CALCULEES (une par simulation ou, pour A1, une par
      campagne d'une fixture deterministe). `successes` = nombre de `True`,
      `n` = longueur de la liste. `power` = Fraction(successes, n) (exact).
      `se` = sqrt(power*(1-power)/n) (float, tolerance 1e-12, cahier:L143 --
      « les fonctions statistiques utilisant des flottants precisent leur
      tolerance, au maximum 1e-12 »). Renvoie {"power": Fraction, "se": float,
      "successes": int, "n": int}.

  power.select_from_grid(grid_results: list[dict], target_power, max_se) -> dict
      `grid_results` : liste de {"n": int, "power": Fraction, "se": float},
      DEJA TRIEE par `n` CROISSANT (cahier:L461 -- « grille croissante du
      nombre de parents » est un parametre d'ENTREE, pas recalcule ici).
      Renvoie le PREMIER (donc le plus petit `n`) dont `power >= target_power`
      ET `se <= max_se` : {"status": "OK", "selected_n": int,
      "selected": <l'entree retenue>}. Si aucune entree ne satisfait les deux
      conditions : {"status": "TARGET_NOT_REACHED", "selected_n": None,
      "selected": None} (cahier:L461 -- « ou TARGET_NOT_REACHED »).

  power.simulate_power(parent_count, repetition_count, simulation_count,
                        generator, generator_kwargs, seed, margin) -> dict
      Execute EXACTEMENT `simulation_count` simulations, jamais moins
      (cahier:L463 A6 -- l'arret anticipe a la premiere significativite est
      INTERDIT dans un plan a effectif fixe). Pour chaque indice de
      simulation `i` de `0` a `simulation_count-1` (dans cet ordre) :
        campaign = generator(seed=seed, simulation_index=i,
                              parent_count=parent_count,
                              repetition_count=repetition_count,
                              **generator_kwargs)
      `generator` est le GENERATEUR INJECTABLE DE CAMPAGNES du livrable
      (cahier:L461 -- « La première implémentation accepte un générateur
      injectable de campagnes ») : il renvoie un dict
      {"ratio_bound": Fraction, "delta_v_bound": Fraction,
       "delta_u_bound": Fraction, "accounting_status": str (defaut
       "RESOLVED"), "has_critical_violation": bool (defaut False)} --
      les bornes DEJA agregees d'UNE campagne simulee (meme forme d'entree
      que `decision.evaluate_contrast` de T34, dependance deja validee).
      Pour chaque campagne, `simulate_power` appelle REELLEMENT
      `decision.evaluate_contrast(ratio_upper_bound=campaign["ratio_bound"],
      delta_v_lower_bound=campaign["delta_v_bound"],
      delta_u_lower_bound=campaign["delta_u_bound"], margin=margin,
      accounting_status=campaign.get("accounting_status", "RESOLVED"),
      distinct_parent_count=parent_count,
      has_critical_violation=campaign.get("has_critical_violation", False))`
      et accumule `d["superior"]`. Le SEUIL DE DECISION (la frontiere `<1` du
      ratio, et `margin` pour V/U) est un parametre FIXE de `simulate_power`,
      jamais derive de l'« effet supposé » que `generator_kwargs` peut porter
      (cahier:L461 -- « Séparer effet supposé, seuil de décision et précision
      recherchée » : trois grandeurs distinctes, dont deux seulement --
      seuil et precision -- sont des parametres de cette fonction ; l'effet
      suppose n'existe que comme parametre du GENERATEUR, jamais transmis a
      `decision.evaluate_contrast`). Renvoie
      `decision_series_power(decisions)` complete par
      {"decisions": [bool,...], "seed": seed, "parent_count": parent_count,
      "repetition_count": repetition_count,
      "simulation_count": simulation_count}.
      Determinisme (cahier:L463 A5, cahier:L143 -- « une version et un
      algorithme pseudo-aléatoire figés sont requis pour les sorties
      simulées ») : deux appels avec exactement les memes
      (generator, generator_kwargs, seed, parent_count, repetition_count,
      simulation_count, margin) renvoient la MEME liste `decisions` et donc
      la meme `power`/`se`.

PROVENANCE DES LITTERAUX. Tout litteral compare dans une assertion provient
soit d'un import de acceptance/reference/** (F-POWER), soit porte un
commentaire `# cahier:L<n>` resolvable par `sed -n '<n>p' docs/cahier.md`.

Portee : les 7 cas requis de T35 (verification/tasks.json, required_cases),
tels que fixes par verification/cases.lock.json. Le livrable T35 depend de
T02, T32, T33 et T34 (cahier:L459). A1 traverse le VRAI pipeline d'analyse en
reutilisant `decision.evaluate_contrast` (T34, dependance deja validee) sur
les bornes DEJA SCELLEES de F-POWER (cahier:L127) -- exactement la meme
construction que le garde-fou des quatre campagnes de
analysis/tests/test_T34.py::test_T34_A1, reprise ici independamment -- puis
applique `power.decision_series_power` (module de CETTE tache) a la serie de
decisions qui en resulte. A2 a A7 exercent `power` seul (A2, A4, A7) ou
`power.simulate_power` avec un generateur ENTIEREMENT defini par ce fichier de
test (A3, A5, A6), conformement a « générateur injectable » : l'auteur du
generateur concret calibre sur donnees pilote appartient a une tache
ulterieure (cahier:L461 -- « le générateur calibré sur données du pilote est
versionné ultérieurement, sans inventer ses paramètres »), pas a T35 ni a ce
role.
"""
from __future__ import annotations

import math
import random
from fractions import Fraction

import decision  # dependance deja validee (T34), zone IMPL hors de ce role
import power  # module a fournir par analysis/src/power.py (zone IMPL, hors de ce role)

from _fixtures import load_reference_fixture

F_POWER = load_reference_fixture("F-POWER")

# Marge d'exemple de la regle de non-inferiorite (cahier:L451, reprise par
# T34 : « Marges d'exemple 0,02 »). T35 ne redefinit pas cette marge, il la
# transmet telle quelle a `decision.evaluate_contrast` via `simulate_power`.
MARGIN = Fraction(1, 50)  # 0,02

# Tolerance des comparaisons flottantes (cahier:L143 : « au maximum 1e-12 »).
FLOAT_TOL = 1e-12


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


def _f_power_decisions() -> list[bool]:
    """Rejoue les QUATRE decisions T34 sur les bornes DEJA SCELLEES de
    F-POWER (cahier:L127), par le meme mecanisme que le garde-fou de
    analysis/tests/test_T34.py::test_T34_A1, independamment reconstruit ici :
    ce fichier traverse reellement `decision.evaluate_contrast` (T34), il ne
    reimporte pas le resultat de l'autre suite."""
    decisions: list[bool] = []
    for rang in (1, 2, 3, 4):
        c = _campaign(rang)
        result = decision.evaluate_contrast(
            ratio_upper_bound=_frac(c["borne_de_ratio"]["rationnel"]),
            delta_v_lower_bound=_frac(c["borne_de_delta_V"]["rationnel"]),
            delta_u_lower_bound=_frac(c["borne_de_delta_U"]["rationnel"]),
            margin=MARGIN,
            accounting_status="RESOLVED",
            distinct_parent_count=2,
            has_critical_violation=False,
        )
        decisions.append(result["superior"])
    return decisions


# ---------------------------------------------------------------------------
# T35.A1 -- F-POWER traversant le vrai pipeline d'analyse produit decisions
# [vrai,faux,faux,vrai], puissance 0,5 et erreur standard 0,25 (cahier:L127,
# L463).
# ---------------------------------------------------------------------------


def test_T35_A1_f_power_pipeline_gives_decisions_power_and_standard_error():
    expected_decisions = F_POWER["valeurs"]["decisions_T34_attendues"]["valeur"]  # importe
    assert expected_decisions == [True, False, False, True]  # controle

    decisions = _f_power_decisions()
    assert decisions == expected_decisions  # controle : le vrai pipeline reproduit F-POWER

    result = power.decision_series_power(decisions)

    assert result["successes"] == 2  # cahier:L463 "puissance 0,5" sur n=4 -> k=2
    assert result["n"] == 4
    assert result["power"] == Fraction(1, 2)  # cahier:L463 "puissance 0,5"
    assert abs(result["se"] - 0.25) < FLOAT_TOL  # cahier:L463 "erreur standard 0,25"

    # Garde-fou explicite contre les deux variantes nommees par
    # verification/cases.lock.json pour A1.
    # (a) off-by-one sur le compte de decisions vraies : (k+1)/n = 3/4.
    off_by_one_power = Fraction(result["successes"] + 1, result["n"])
    assert off_by_one_power == Fraction(3, 4)  # controle
    assert result["power"] != off_by_one_power
    # (b) diviser par n-1 dans la puissance ET dans l'erreur standard.
    n_minus_one_power = Fraction(result["successes"], result["n"] - 1)
    assert n_minus_one_power == Fraction(2, 3)  # controle
    assert result["power"] != n_minus_one_power
    p = float(result["power"])
    n_minus_one_se = math.sqrt(p * (1 - p) / (result["n"] - 1))
    assert abs(n_minus_one_se - result["se"]) > FLOAT_TOL


# ---------------------------------------------------------------------------
# T35.A2 -- 1800 succes sur 2000 donnent 0,9 et sqrt(0,09/2000) (cahier:L463).
# ---------------------------------------------------------------------------


def test_T35_A2_eighteen_hundred_of_two_thousand_gives_point_nine_and_its_standard_error():
    successes = 1800  # cahier:L463
    total = 2000  # cahier:L463
    decisions = [True] * successes + [False] * (total - successes)

    result = power.decision_series_power(decisions)

    assert result["successes"] == 1800
    assert result["n"] == 2000
    assert result["power"] == Fraction(9, 10)  # cahier:L463 "0,9" == 1800/2000 reduit
    expected_se = math.sqrt(0.09 / 2000)  # cahier:L463 "sqrt(0,09/2000)" littéral
    assert abs(result["se"] - expected_se) < FLOAT_TOL

    # Garde-fou explicite contre les deux variantes nommees par
    # verification/cases.lock.json pour A2.
    # (a) off-by-one du denominateur : diviser par 1999 dans p ET dans se.
    p_wrong = Fraction(successes, total - 1)
    assert p_wrong != Fraction(9, 10)  # controle
    se_wrong_denominator = math.sqrt(float(p_wrong) * float(1 - p_wrong) / (total - 1))
    assert result["power"] != p_wrong
    assert abs(result["se"] - se_wrong_denominator) > FLOAT_TOL
    # (b) remplacer p(1-p) par p au numerateur de se.
    se_wrong_variance = math.sqrt(0.9 / 2000)
    assert abs(se_wrong_variance - expected_se) > FLOAT_TOL  # controle : bien differente
    assert abs(result["se"] - se_wrong_variance) > FLOAT_TOL


# ---------------------------------------------------------------------------
# T35.A3 -- l'effet attendu (20 %) ne transforme pas le seuil de decision sur
# le cout en 0,8 (cahier:L461, L463 -- separation effet suppose / seuil).
# ---------------------------------------------------------------------------


def _constant_ratio_campaign_generator(*, seed, simulation_index, parent_count,
                                        repetition_count, assumed_effect):
    """Generateur de campagnes ENTIEREMENT defini par ce fichier de test
    (cahier:L461 -- generateur injectable). Ignore delibrement `seed` et
    `simulation_index` : chaque campagne porte le MEME ratio de cout 0,85
    (superieur a 1 - assumed_effect = 0,80, mais strictement inferieur a 1),
    quelle que soit la valeur d'`assumed_effect` recue. Si `simulate_power`
    confondait l'effet suppose avec le seuil de decision (cases.lock.json :
    « fixer le seuil a 0,8 dans le pipeline »), ratio=0,85 franchirait ce
    seuil confondu et la decision basculerait a faux ; sous le seuil REEL
    (<1, cahier:L451/T34), elle reste vraie."""
    return {
        "ratio_bound": Fraction(85, 100),  # 0,85 ; > 1-assumed_effect=0,80, < 1
        "delta_v_bound": Fraction(0),
        "delta_u_bound": Fraction(0),
    }


def test_T35_A3_assumed_effect_does_not_become_the_cost_decision_threshold():
    assumed_effect = Fraction(1, 5)  # 20 %, cahier:L463 "effet attendu 20 %"
    forbidden_threshold = Fraction(1) - assumed_effect  # 0,8, cahier:L463 "seuil ... 0,8"
    assert forbidden_threshold == Fraction(4, 5)  # controle

    result = power.simulate_power(
        parent_count=2,
        repetition_count=1,
        simulation_count=5,
        generator=_constant_ratio_campaign_generator,
        generator_kwargs={"assumed_effect": assumed_effect},
        seed=1,
        margin=MARGIN,
    )

    ratio = Fraction(85, 100)
    assert ratio > forbidden_threshold  # controle : 0,85 > 0,8, serait refuse sous le seuil confondu
    assert ratio < 1  # controle : 0,85 < 1, est accepte sous le VRAI seuil (cahier:L451)

    assert result["decisions"] == [True] * 5  # le vrai seuil (<1) accepte 0,85 a chaque simulation
    assert result["power"] == Fraction(1)

    # Garde-fou explicite : sous la confusion nommee par
    # verification/cases.lock.json (seuil <0,8 au lieu de <1), la MEME
    # campagne (ratio=0,85) serait refusee a chaque simulation.
    confused_cost_superior = ratio < forbidden_threshold  # False : 0,85 n'est pas < 0,8
    assert confused_cost_superior is False  # controle
    confused_power = Fraction(1) if confused_cost_superior else Fraction(0)
    assert result["power"] != confused_power


# ---------------------------------------------------------------------------
# T35.A4 -- grille sans effectif satisfaisant renvoie TARGET_NOT_REACHED
# (cahier:L461, L463).
# ---------------------------------------------------------------------------


def _a7_grid() -> list[dict]:
    """Grille N=10/20/30 de cahier:L463 (A7) : reprise ici comme controle de
    capacite pour A4 (une grille SAINE ne doit pas aussi se voir refusee)."""
    return [
        {"n": 10, "power": Fraction(85, 100), "se": 0.01},  # cahier:L463
        {"n": 20, "power": Fraction(91, 100), "se": 0.005},  # cahier:L463
        {"n": 30, "power": Fraction(95, 100), "se": 0.01},  # cahier:L463
    ]


def test_T35_A4_grid_without_a_satisfying_size_returns_target_not_reached():
    target_power = Fraction(9, 10)  # 0,90, cahier:L463 "cible 0,90"
    max_se = 0.01  # cahier:L463 "erreur maximale 0,01"

    # Controle de capacite : la grille saine de A7 doit produire une VRAIE
    # selection -- sinon une implementation qui refuse tout verdirait A4 a
    # tort.
    healthy = power.select_from_grid(_a7_grid(), target_power=target_power, max_se=max_se)
    assert healthy["status"] == "OK"
    assert healthy["selected_n"] == 20

    # Grille dont AUCUN effectif n'atteint la puissance cible 0,90.
    unreachable_grid = [
        {"n": 10, "power": Fraction(1, 2), "se": 0.02},
        {"n": 20, "power": Fraction(3, 5), "se": 0.015},
        {"n": 30, "power": Fraction(7, 10), "se": 0.012},
    ]
    assert all(entry["power"] < target_power for entry in unreachable_grid)  # controle

    result = power.select_from_grid(unreachable_grid, target_power=target_power, max_se=max_se)

    assert result["status"] == "TARGET_NOT_REACHED"  # cahier:L461
    assert result["selected_n"] is None
    assert result["selected"] is None

    # Garde-fou explicite contre la variante PERMISSIVE nommee par
    # verification/cases.lock.json : renvoyer le plus grand effectif de la
    # grille, ou le plus proche de la cible, au lieu de TARGET_NOT_REACHED.
    largest_n = unreachable_grid[-1]["n"]
    assert result["selected_n"] != largest_n
    closest_to_target_n = min(
        unreachable_grid, key=lambda entry: abs(entry["power"] - target_power)
    )["n"]
    assert result["selected_n"] != closest_to_target_n


# ---------------------------------------------------------------------------
# T35.A5 -- meme entree/version/graine donne meme sortie (cahier:L143, L463).
# ---------------------------------------------------------------------------


def _seeded_pseudo_random_campaign_generator(*, seed, simulation_index, parent_count,
                                              repetition_count):
    """Generateur de campagnes ENTIEREMENT defini par ce fichier de test
    (cahier:L461 -- generateur injectable) : pseudo-aleatoire FIGE
    (`random.Random`, jamais l'horloge ni une source non seedee, cahier:L461
    "graine" et L143 "un algorithme pseudo-aléatoire figé"), deterministe en
    fonction de `(seed, simulation_index, parent_count, repetition_count)`."""
    rng = random.Random(f"{seed}-{simulation_index}-{parent_count}-{repetition_count}")
    draw_millis = rng.randrange(0, 400)  # quantifie en millièmes pour rester une Fraction exacte
    ratio_bound = Fraction(700 + draw_millis, 1000)  # dans [0,700 ; 1,100)
    return {
        "ratio_bound": ratio_bound,
        "delta_v_bound": Fraction(0),
        "delta_u_bound": Fraction(0),
    }


def test_T35_A5_same_input_version_and_seed_give_the_same_output():
    common_kwargs = dict(
        parent_count=3,
        repetition_count=2,
        simulation_count=30,
        generator=_seeded_pseudo_random_campaign_generator,
        generator_kwargs={},
        margin=MARGIN,
    )

    first = power.simulate_power(seed=99, **common_kwargs)
    second = power.simulate_power(seed=99, **common_kwargs)

    assert first["decisions"] == second["decisions"]
    assert first["power"] == second["power"]
    assert first["se"] == second["se"]  # egalite flottante EXACTE, meme calcul rejoue a l'identique

    # Controle de capacite : une graine DIFFERENTE doit produire une sortie
    # differente -- sinon une implementation qui renverrait une constante
    # ignorant `seed` verdirait ce cas a tort (le "generateur seede injecte"
    # de cases.lock.json doit reellement etre exerce par la graine).
    third = power.simulate_power(seed=100, **common_kwargs)
    assert third["decisions"] != first["decisions"]

    # Garde-fou explicite contre l'injection de non-determinisme nommee par
    # verification/cases.lock.json (source non seedee, horloge ou
    # Math.random) : deux appels avec CE generateur pseudo-aleatoire figE et
    # la meme graine ne doivent jamais tirer deux valeurs `rng.random()`
    # differentes -- controle direct du generateur lui-meme, independamment
    # de `simulate_power`.
    rng_a = random.Random("99-0-3-2")
    rng_b = random.Random("99-0-3-2")
    assert rng_a.randrange(0, 400) == rng_b.randrange(0, 400)  # controle : le RNG figé est reproductible
    draw_a = random.Random("99-0-3-2").randrange(0, 400)
    draw_c = random.Random("100-0-3-2").randrange(0, 400)
    assert draw_a != draw_c  # controle : une graine differente tire une valeur differente (262 != 105, mesure)


# ---------------------------------------------------------------------------
# T35.A6 -- l'arret anticipe a la premiere significativite est INTERDIT dans
# ce plan a effectif fixe (cahier:L463).
# ---------------------------------------------------------------------------


class _CountingGenerator:
    """Enveloppe un generateur de campagnes et compte ses appels, pour
    observer si `simulate_power` s'arrete AVANT `simulation_count`
    invocations (cahier:L463 A6)."""

    def __init__(self, fn):
        self._fn = fn
        self.calls = 0

    def __call__(self, **kwargs):
        self.calls += 1
        return self._fn(**kwargs)


def _always_superior_campaign_generator(*, seed, simulation_index, parent_count,
                                         repetition_count):
    # Chaque campagne est immediatement et massivement superieure (ratio=0,
    # deltas=0) : un plan a arret anticipe s'arreterait des la PREMIERE
    # simulation, deja significative.
    return {"ratio_bound": Fraction(0), "delta_v_bound": Fraction(0), "delta_u_bound": Fraction(0)}


def _always_inferior_campaign_generator(*, seed, simulation_index, parent_count,
                                         repetition_count):
    # Symetrique : chaque campagne echoue immediatement (ratio=2 > 1), pour
    # exclure un arret anticipe fonde sur une SUITE d'echecs plutot que sur
    # une suite de succes.
    return {"ratio_bound": Fraction(2), "delta_v_bound": Fraction(0), "delta_u_bound": Fraction(0)}


def test_T35_A6_early_stopping_on_first_significance_is_forbidden():
    superior_counted = _CountingGenerator(_always_superior_campaign_generator)
    result_superior = power.simulate_power(
        parent_count=2,
        repetition_count=1,
        simulation_count=12,
        generator=superior_counted,
        generator_kwargs={},
        seed=7,
        margin=MARGIN,
    )

    assert result_superior["decisions"] == [True] * 12  # chaque simulation est deja significative
    assert result_superior["power"] == Fraction(1)
    assert len(result_superior["decisions"]) == 12  # aucune simulation manquante
    assert superior_counted.calls == 12  # le generateur a bien ete appele DOUZE fois, pas une seule

    inferior_counted = _CountingGenerator(_always_inferior_campaign_generator)
    result_inferior = power.simulate_power(
        parent_count=2,
        repetition_count=1,
        simulation_count=9,
        generator=inferior_counted,
        generator_kwargs={},
        seed=7,
        margin=MARGIN,
    )
    assert result_inferior["decisions"] == [False] * 9
    assert len(result_inferior["decisions"]) == 9
    assert inferior_counted.calls == 9

    # Garde-fou explicite contre la variante PERMISSIVE nommee par
    # verification/cases.lock.json : un plan qui s'arreterait des la
    # premiere significativite n'appellerait le generateur qu'UNE seule
    # fois.
    early_stop_call_count = 1
    assert superior_counted.calls != early_stop_call_count
    assert inferior_counted.calls != early_stop_call_count


# ---------------------------------------------------------------------------
# T35.A7 -- cible 0,90 et erreur maximale 0,01 ; N=10/p=0,85/se=0,01,
# N=20/p=0,91/se=0,005, N=30/p=0,95/se=0,01 : selection N=20 (cahier:L463).
# ---------------------------------------------------------------------------


def test_T35_A7_selects_smallest_size_reaching_target_power_within_max_se():
    grid = _a7_grid()

    result = power.select_from_grid(grid, target_power=Fraction(9, 10), max_se=0.01)

    assert result["status"] == "OK"
    assert result["selected_n"] == 20  # cahier:L463 "sélection N=20"
    assert result["selected"]["power"] == Fraction(91, 100)  # cahier:L463
    assert result["selected"]["se"] == 0.005  # cahier:L463

    # N=10 echoue sur la puissance seule (0,85 < 0,90) : controle explicite.
    assert grid[0]["power"] < Fraction(9, 10)
    assert grid[0]["se"] <= 0.01
    # N=30 satisfait aussi les deux conditions mais N'EST PAS le plus petit.
    assert grid[2]["power"] >= Fraction(9, 10)
    assert grid[2]["se"] <= 0.01

    # Garde-fou explicite contre l'off-by-one nomme par
    # verification/cases.lock.json : renvoyer l'effectif SUIVANT dans la
    # grille parmi ceux qui satisfont (N=30 au lieu de N=20).
    assert result["selected_n"] != 30

    # Garde-fou explicite contre l'inversion de la contrainte d'erreur
    # standard nommee par verification/cases.lock.json ("ignorer la
    # contrainte se <= 0,01") : sous une contrainte INVERSEE (se >= 0,01),
    # N=10 (se=0,01) et N=30 (se=0,01) satisferaient tous deux tandis que
    # N=20 (se=0,005) ne satisferait plus aucune des deux versions -- la
    # sortie ne serait alors plus N=20.
    inverted_qualifies = [
        entry for entry in grid if entry["power"] >= Fraction(9, 10) and entry["se"] >= 0.01
    ]
    assert [entry["n"] for entry in inverted_qualifies] == [30]  # controle
    assert result["selected_n"] != 30
