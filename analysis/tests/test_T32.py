"""
Suite d'acceptation T32 -- « Implémenter les estimations au niveau des
projets » (docs/cahier.md L431-L437 ; docs/specs/T32.md).

ROLE : test-author, AVEUGLE A L'IMPLEMENTATION (ADR-001). Ce fichier ne lit ni
n'importe aucune source de `analysis/src/**`, `packages/**` ni `apps/**` par un
autre chemin que l'import public `aggregate` ci-dessous. Le contrat du module
`aggregate` (ses fonctions, la forme de leurs entrees et sorties) est DERIVE
des cartes de specification et POSE ICI POUR LA PREMIERE FOIS : c'est la
definition de l'interface que l'implementeur doit satisfaire, pas
l'observation d'un code deja ecrit. `analysis/src/aggregate.py` n'existe pas
encore a ce stade -- l'etat rouge attendu de cette suite, jusqu'a
l'implementation, est une erreur de collection (`ModuleNotFoundError:
aggregate`).

PROVENANCE DES LITTERAUX. Tout litteral compare dans une assertion provient
soit d'un import de acceptance/reference/** (F-COST-RATIO, F-CLUSTERS,
F-QUALITY), soit porte un commentaire `# cahier:L<n>` resolvable par
`sed -n '<n>p' docs/cahier.md`. Exception documentee : T32.A6 (poids
scenario/parent) n'a AUCUNE valeur chiffree dans le cahier --
verification/cases.lock.json le constate explicitement (« la ligne 435
n'enonce aucune valeur chiffree pour A6, donc `numeric` n'est pas justifie »),
c'est pourquoi ce cas est classe `behaviour` et non `numeric`. Son test reste
ancre : les VALEURS de cout reutilisent les nombres deja scelles de
F-COST-RATIO / F-CLUSTERS, et seuls les POIDS discriminants (absents du
cahier) sont une construction ad hoc, commentee comme telle a chaque usage.

Portee : les 6 cas requis de T32 (verification/tasks.json, required_cases),
tels que fixes par verification/cases.lock.json. Le livrable T32 depend de T04
et T31 (cahier:L431) : « package Python d'analyse, agregation
repetition/scenario/projet et tableaux de contraste ». Les entrees de ce
fichier sont donc des lignes DEJA PERSISTEES (cout par periode/trajectoire,
Q/R par periode, valeur par scenario), representees comme des structures
Python litterales, dans le meme esprit que T31 (cahier:L425 : « les tests
utilisent d'abord des journaux persistes et filiations connus »).
"""
from __future__ import annotations

import copy
from fractions import Fraction

import aggregate  # module a fournir par analysis/src/aggregate.py (zone IMPL, hors de ce role)

from _fixtures import load_reference_fixture

F_COST_RATIO = load_reference_fixture("F-COST-RATIO")
F_CLUSTERS = load_reference_fixture("F-CLUSTERS")
F_QUALITY = load_reference_fixture("F-QUALITY")


def _frac(rationnel: dict | None) -> Fraction | None:
    """Convertit un noeud {"num": n, "den": d} des fixtures en Fraction exacte."""
    if rationnel is None:
        return None
    return Fraction(rationnel["num"], rationnel["den"])


# ---------------------------------------------------------------------------
# T32.A1 -- F-COST-RATIO donne moyennes 50/60 et ratio 5/6, PAS la moyenne des
# ratios 0,7 (cahier:L435, valeurs scellees ligne 113).
# ---------------------------------------------------------------------------


def test_T32_A1_f_cost_ratio_gives_ratio_of_means_not_mean_of_ratios():
    couts_a = F_COST_RATIO["valeurs"]["couts_bras_A"]["valeur"]  # [10, 90], importe
    couts_b = F_COST_RATIO["valeurs"]["couts_bras_B"]["valeur"]  # [20, 100], importe
    assert F_COST_RATIO["valeurs"]["poids_des_projets"]["valeur"] == "egal"  # importe, controle

    project_arms = [
        {"project_id": "P1", "cost_a": couts_a[0], "cost_b": couts_b[0]},
        {"project_id": "P2", "cost_a": couts_a[1], "cost_b": couts_b[1]},
    ]

    result = aggregate.aggregate_arm_cost_ratio(project_arms)

    expected_mean_a = F_COST_RATIO["valeurs"]["moyenne_A"]["valeur"]  # 50, importe
    expected_mean_b = F_COST_RATIO["valeurs"]["moyenne_B"]["valeur"]  # 60, importe
    expected_ratio = _frac(F_COST_RATIO["valeurs"]["ratio_principal_A_sur_B"]["rationnel"])  # 5/6, importe
    incorrect_ratio = _frac(F_COST_RATIO["valeurs"]["resultat_incorrect_a_detecter"]["rationnel"])  # 7/10, importe

    assert result["mean_a"] == Fraction(expected_mean_a)
    assert result["mean_b"] == Fraction(expected_mean_b)
    assert result["ratio_status"] == "OK"
    assert result["ratio_a_over_b"] == expected_ratio

    # Garde-fou explicite : le resultat DECLARE incorrect par le cahier
    # (moyenne des ratios projet par projet) ne doit pas etre celui rendu.
    assert result["ratio_a_over_b"] != incorrect_ratio
    per_project_ratio_mean = (
        Fraction(couts_a[0], couts_b[0]) + Fraction(couts_a[1], couts_b[1])
    ) / 2
    assert per_project_ratio_mean == incorrect_ratio  # controle : la valeur incorrecte est bien 7/10
    assert result["ratio_a_over_b"] != per_project_ratio_mean


# ---------------------------------------------------------------------------
# T32.A2 -- F-CLUSTERS ne change pas apres duplication des repetitions de P1
# (cahier:L435, valeurs scellees ligne 115).
# ---------------------------------------------------------------------------


def _clusters_rows() -> list[dict]:
    projets = F_CLUSTERS["valeurs"]["projets"]  # importe
    rows: list[dict] = []
    for projet in projets:
        project_id = projet["id"]["valeur"]
        cout_a = projet["cout_A"]["valeur"]
        cout_b = projet["cout_B"]["valeur"]
        repetitions = projet["repetitions"]["valeur"]
        for _ in range(repetitions):
            rows.append({"project_id": project_id, "metric_a": cout_a, "metric_b": cout_b})
    return rows


def test_T32_A2_f_clusters_point_estimate_survives_p1_repetition_duplication():
    rows = _clusters_rows()
    expected_total_rows = F_CLUSTERS["valeurs"]["lignes_totales"]["valeur"]  # 11, importe
    assert len(rows) == expected_total_rows

    expected_mean_a = F_CLUSTERS["valeurs"]["moyenne_interprojets_A"]["valeur"]  # 50, importe
    expected_mean_b = F_CLUSTERS["valeurs"]["moyenne_interprojets_B"]["valeur"]  # 60, importe

    result = aggregate.aggregate_repetition_rows_by_project(rows, metrics=["metric_a", "metric_b"])

    assert result["grand_mean"]["metric_a"] == Fraction(expected_mean_a)
    assert result["grand_mean"]["metric_b"] == Fraction(expected_mean_b)

    # Garde-fou explicite (cahier:L115) : une moyenne naive sur les onze
    # lignes NE DOIT PAS remplacer cette agregation par projet.
    naive_pooled_a = Fraction(sum(row["metric_a"] for row in rows), len(rows))
    assert result["grand_mean"]["metric_a"] != naive_pooled_a
    assert naive_pooled_a != Fraction(expected_mean_a)  # controle : la valeur naive differe bien de la valeur correcte

    # Dupliquer TOUTES les repetitions de P1 (cahier:L115) : l'estimation
    # ponctuelle par projet doit rester inchangee.
    p1 = F_CLUSTERS["valeurs"]["projets"][0]
    assert p1["id"]["valeur"] == "P1"  # controle
    duplicated_rows = rows + [
        {"project_id": "P1", "metric_a": p1["cout_A"]["valeur"], "metric_b": p1["cout_B"]["valeur"]}
        for _ in range(p1["repetitions"]["valeur"])
    ]
    assert len(duplicated_rows) != len(rows)  # controle : la duplication a bien change le nombre de lignes

    duplicated_result = aggregate.aggregate_repetition_rows_by_project(
        duplicated_rows, metrics=["metric_a", "metric_b"]
    )
    assert duplicated_result["grand_mean"]["metric_a"] == result["grand_mean"]["metric_a"]
    assert duplicated_result["grand_mean"]["metric_b"] == result["grand_mean"]["metric_b"]
    assert duplicated_result["grand_mean"]["metric_a"] == Fraction(expected_mean_a)


# ---------------------------------------------------------------------------
# T32.A3 -- F-QUALITY conserve V=13/16, U=2/3 et ratio intentions 7/10 comme
# TROIS colonnes distinctes (cahier:L435, valeurs scellees lignes 107/109/111).
# ---------------------------------------------------------------------------


def test_T32_A3_f_quality_keeps_v_u_and_intent_ratio_as_distinct_columns():
    q_serie = F_QUALITY["valeurs"]["Q_par_periode"]["serie"]  # importe
    r_serie = F_QUALITY["valeurs"]["R_par_periode"]["serie"]  # importe
    offered = F_QUALITY["valeurs"]["intentions_offertes"]["valeur"]  # [4,4,0,2], importe
    succeeded = F_QUALITY["valeurs"]["intentions_reussies"]["valeur"]  # [4,2,0,1], importe

    period_rows = []
    for idx in range(len(q_serie)):
        period_rows.append(
            {
                "period_index": idx + 1,
                "Q": _frac(q_serie[idx]["rationnel"]),
                "R": _frac(r_serie[idx]["rationnel"]),
                "intents_offered": offered[idx],
                "intents_succeeded": succeeded[idx],
            }
        )

    result = aggregate.aggregate_quality_columns(period_rows)

    expected_v = _frac(F_QUALITY["valeurs"]["V"]["rationnel"])  # 13/16, importe
    expected_u = _frac(F_QUALITY["valeurs"]["U"]["rationnel"])  # 2/3, importe
    expected_exposure = _frac(F_QUALITY["valeurs"]["exposition"]["rationnel"])  # 3/4, importe
    expected_intent_ratio = _frac(
        F_QUALITY["valeurs"]["reussite_agregee_par_intention"]["rationnel"]
    )  # 7/10, importe

    assert result["V"] == expected_v
    assert result["U"] == expected_u
    assert result["intent_success_ratio"] == expected_intent_ratio
    assert result["exposure"] == expected_exposure

    # cahier:L107 -- « ces trois derniers nombres sont differents et doivent
    # rester identifies » : U, exposition et reussite agregee par intention.
    assert result["U"] != result["exposure"]
    assert result["U"] != result["intent_success_ratio"]
    assert result["exposure"] != result["intent_success_ratio"]

    # Garde-fou explicite contre le remplacement de U par l'exposition ou la
    # fusion de U avec le ratio d'intentions dans une seule colonne.
    assert result["U"] != expected_exposure
    assert result["U"] != expected_intent_ratio


# ---------------------------------------------------------------------------
# T32.A4 -- quatre trajectoires de couts [4,6,3,5] dont deux reussites donnent
# cout moyen 4,5 et reussite 1/2 (cahier:L435).
# ---------------------------------------------------------------------------


def test_T32_A4_four_trajectories_mean_cost_and_success_rate():
    costs = [4, 6, 3, 5]  # cahier:L435
    succeeded_flags = [True, True, False, False]  # cahier:L435 -- « dont deux reussites »
    trajectory_rows = [
        {"trajectory_id": f"traj-{i}", "cost": cost, "succeeded": ok}
        for i, (cost, ok) in enumerate(zip(costs, succeeded_flags), start=1)
    ]

    result = aggregate.aggregate_cost_and_success(trajectory_rows)

    expected_mean_cost = Fraction(9, 2)  # 4,5 -- cahier:L435
    expected_success_rate = Fraction(1, 2)  # cahier:L435

    assert result["mean_cost"] == expected_mean_cost
    assert result["success_rate"] == expected_success_rate

    # Garde-fou explicite contre l'exclusion des echecs du cout moyen
    # (moyenne sur les 2 reussites seulement -> 5) et contre une division par
    # n-1 (18/3 -> 6) : verification/cases.lock.json nomme ces deux
    # perturbations pour A4.
    successes_only_mean = Fraction(sum(c for c, ok in zip(costs, succeeded_flags) if ok), 2)
    assert successes_only_mean == Fraction(5)  # controle
    assert result["mean_cost"] != successes_only_mean

    n_minus_one_mean = Fraction(sum(costs), len(costs) - 1)
    assert n_minus_one_mean == Fraction(6)  # controle
    assert result["mean_cost"] != n_minus_one_mean


# ---------------------------------------------------------------------------
# T32.A5 -- denominateur nul produit null/`ZERO_DENOMINATOR`, sans epsilon
# (cahier:L435).
# ---------------------------------------------------------------------------


def test_T32_A5_zero_denominator_yields_null_zero_denominator_status_no_epsilon():
    # Controle de capacite : un denominateur SAIN doit produire une valeur
    # numerique reelle -- sinon une implementation qui refuse tout verdirait
    # ce cas a tort (verification/cases.lock.json : « un stub qui leve
    # produirait aussi une erreur et laisserait le cas vert »).
    healthy = aggregate.safe_ratio(6, 3)
    assert healthy["status"] == "OK"
    assert healthy["value"] == Fraction(2)

    zero_denominator = aggregate.safe_ratio(5, 0)
    assert zero_denominator["value"] is None
    assert zero_denominator["status"] == "ZERO_DENOMINATOR"

    also_zero_over_zero = aggregate.safe_ratio(0, 0)
    assert also_zero_over_zero["value"] is None
    assert also_zero_over_zero["status"] == "ZERO_DENOMINATOR"

    # Ancre metier : la meme regle s'applique dans l'export reellement exerce
    # par A1, quand le denominateur du ratio (moyenne du bras B) est nul.
    couts_a = F_COST_RATIO["valeurs"]["couts_bras_A"]["valeur"]  # [10, 90], importe
    zero_arm_b = [
        {"project_id": "P1", "cost_a": couts_a[0], "cost_b": 0},
        {"project_id": "P2", "cost_a": couts_a[1], "cost_b": 0},
    ]
    result = aggregate.aggregate_arm_cost_ratio(zero_arm_b)
    assert result["mean_b"] == Fraction(0)
    assert result["ratio_a_over_b"] is None
    assert result["ratio_status"] == "ZERO_DENOMINATOR"
    # Sans lissage epsilon : mean_a reste exact, aucune valeur numerique
    # n'est produite pour le ratio a sa place.
    expected_mean_a = F_COST_RATIO["valeurs"]["moyenne_A"]["valeur"]  # 50, importe
    assert result["mean_a"] == Fraction(expected_mean_a)


# ---------------------------------------------------------------------------
# T32.A6 -- poids des scenarios appliques a l'interieur du parent avant poids
# entre parents (cahier:L435 ; aucune valeur chiffree fixee pour ce cas,
# cf. verification/cases.lock.json).
# ---------------------------------------------------------------------------


def test_T32_A6_scenario_weights_apply_within_parent_before_between_parent_weights():
    couts_a = F_COST_RATIO["valeurs"]["couts_bras_A"]["valeur"]  # [10, 90], importe
    p1_cout_b = F_CLUSTERS["valeurs"]["projets"][0]["cout_B"]["valeur"]  # 20, importe (F-CLUSTERS P1)

    # Poids : AUCUNE valeur n'est fixee par le cahier pour A6 (cases.lock.json
    # le constate). Les valeurs de cout ci-dessus sont reutilisees depuis des
    # fixtures deja scellees ; seuls les poids 1/3 sont une construction ad
    # hoc, choisie uniquement pour rendre l'agregation ponderee distinguable
    # d'une moyenne non ponderee -- ce que le mutant T32.M6 exerce.
    parents = [
        {
            "parent_id": "P1",
            "parent_weight": 1,
            "scenarios": [
                {"scenario_id": "S1a", "value": couts_a[0], "weight": 1},  # 10 (cahier:L113)
                {"scenario_id": "S1b", "value": couts_a[1], "weight": 3},  # 90 (cahier:L113), poids ad hoc
            ],
        },
        {
            "parent_id": "P2",
            "parent_weight": 1,
            "scenarios": [
                {"scenario_id": "S2a", "value": p1_cout_b, "weight": 1},  # 20 (cahier:L115)
            ],
        },
    ]

    result = aggregate.aggregate_scenarios_then_projects(parents)

    # Moyenne ponderee INTRA-parent : (10*1 + 90*3) / (1+3) = 70 pour P1 ;
    # P2 n'a qu'un scenario -> 20.
    expected_p1 = Fraction(couts_a[0] * 1 + couts_a[1] * 3, 4)
    assert expected_p1 == Fraction(70)
    assert result["per_parent"]["P1"] == expected_p1
    assert result["per_parent"]["P2"] == Fraction(p1_cout_b)

    # Moyenne ENTRE parents, poids egaux ici : (70 + 20) / 2 = 45.
    expected_grand = Fraction(70 + p1_cout_b, 2)
    assert expected_grand == Fraction(45)
    assert result["grand_mean"] == expected_grand

    # Garde-fou explicite : une moyenne NON ponderee des valeurs brutes de
    # scenario ([10, 90, 20] -> 40) ou une moyenne intra-parent non ponderee
    # ([10, 90] -> 50 pour P1) ne doit PAS etre le resultat rendu -- c'est
    # exactement la perturbation nommee par T32.M6 (« renvoyer une
    # agregation non ponderee »).
    naive_grand_mean = Fraction(couts_a[0] + couts_a[1] + p1_cout_b, 3)
    assert naive_grand_mean == Fraction(40)
    assert result["grand_mean"] != naive_grand_mean

    naive_p1_mean = Fraction(couts_a[0] + couts_a[1], 2)
    assert naive_p1_mean == Fraction(50)
    assert result["per_parent"]["P1"] != naive_p1_mean

    # Le poids ENTRE parents doit lui aussi etre observable : en changeant
    # uniquement les poids de parent (3 pour P1, 1 pour P2 -- ad hoc, meme
    # justification que ci-dessus), le resultat agrege doit changer, alors
    # que les moyennes intra-parent restent identiques.
    reweighted_parents = copy.deepcopy(parents)
    reweighted_parents[0]["parent_weight"] = 3
    reweighted_parents[1]["parent_weight"] = 1
    reweighted_result = aggregate.aggregate_scenarios_then_projects(reweighted_parents)

    assert reweighted_result["per_parent"]["P1"] == expected_p1  # intra-parent inchange
    assert reweighted_result["per_parent"]["P2"] == Fraction(p1_cout_b)

    expected_reweighted_grand = Fraction(70 * 3 + p1_cout_b * 1, 4)
    assert expected_reweighted_grand == Fraction(115, 2)
    assert reweighted_result["grand_mean"] == expected_reweighted_grand
    assert reweighted_result["grand_mean"] != result["grand_mean"]
