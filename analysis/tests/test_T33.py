"""
Suite d'acceptation T33 -- « Implémenter le bootstrap apparié et les bandes »
(docs/cahier.md L439-L446 ; docs/specs/T33.md).

ROLE : test-author, AVEUGLE A L'IMPLEMENTATION (ADR-001). Ce fichier ne lit ni
n'importe aucune source de `analysis/src/**`, `packages/**` ni `apps/**` par un
autre chemin que l'import public `bootstrap` ci-dessous. Le contrat du module
`bootstrap` (ses fonctions, la forme de leurs entrees et sorties) est DERIVE
des cartes de specification et POSE ICI POUR LA PREMIERE FOIS : c'est la
definition de l'interface que l'implementeur doit satisfaire, pas
l'observation d'un code deja ecrit. `analysis/src/bootstrap.py` n'existe pas
encore a ce stade -- l'etat rouge attendu de cette suite, jusqu'a
l'implementation, est une erreur de collection (`ModuleNotFoundError:
bootstrap`).

CONTRAT POSE (livrables cahier:L441 : « rééchantillonneur parent, strates,
quantile empirique inverse et manifeste de tirages ») :

  bootstrap.paired_parent_bootstrap(rows, draws) -> dict
      `rows` : lignes de repetition deja persistees, une par (parent, essai),
      de la forme {"project_id": str, "cost_a": int|Fraction,
      "cost_b": int|Fraction} -- meme forme que les lignes de T32
      (aggregate_repetition_rows_by_project), reprise ici sans reimport
      puisque T32 est une DEPENDANCE deja validee, pas la tache aveuglee.
      Les lignes d'un meme `project_id` sont d'abord moyennees PAR PARENT
      (une seule valeur par parent et par bras), AVANT tout tirage : c'est la
      strate (« strates » du livrable). `draws` : liste de tirages FORCES
      (pas de generateur aleatoire ici -- cahier:L117, « forcer la liste de
      reechantillonnages »), chaque tirage etant une liste de `project_id`
      de longueur egale au nombre de parents distincts, tiree AVEC REMISE.
      Le meme tirage sert aux DEUX bras (bootstrap APPARIE) : pour un tirage
      donne, le ratio est mean(cost_a des parents tires)/mean(cost_b des
      MEMES parents tires).
      Renvoie {"ratios": [Fraction,...], "ratio_status": [str,...],
      "distinct_parent_count": int,
      "draw_manifest": {"arm_a_parent_ids": [[str,...],...],
                         "arm_b_parent_ids": [[str,...],...]}}
      -- un tirage par entree de `draws`, dans le meme ordre.

  bootstrap.empirical_inverse_quantile_interval(values, lower_q, upper_q) -> dict
      Convention du RANG INVERSE (cahier:L117/L443) : trie `values` par ordre
      croissant (n valeurs), et pour un quantile q retient l'element de rang
      `ceil(q * n)` (1-indexe dans la liste triee) -- PAS d'interpolation
      lineaire entre deux rangs. Renvoie {"lower": Fraction, "upper": Fraction,
      "kind": "pointwise", "simultaneous": False}. `simultaneous` vaut
      toujours False ici : ce module ne calcule que des BANDES PONCTUELLES
      (cahier:L443, A7), jamais une region de confiance jointe sur plusieurs
      quantites a la fois.

  bootstrap.interproject_bootstrap_interval(rows, draws, lower_q, upper_q) -> dict
      Compose les deux exports ci-dessus pour l'INFERENCE INTERPROJETS.
      Si `distinct_parent_count < 2` (une seule grappe), AUCUN intervalle
      n'est produit : {"status": "INSUFFICIENT_CLUSTERS", "interval": None,
      "distinct_parent_count": 1}. Sinon : {"status": "OK",
      "interval": {...meme forme que empirical_inverse_quantile_interval...},
      "ratios": [Fraction,...], "distinct_parent_count": int}.

PROVENANCE DES LITTERAUX. Tout litteral compare dans une assertion provient
soit d'un import de acceptance/reference/** (F-BOOTSTRAP, F-CLUSTERS), soit
porte un commentaire `# cahier:L<n>` resolvable par
`sed -n '<n>p' docs/cahier.md`.

Portee : les 7 cas requis de T33 (verification/tasks.json, required_cases),
tels que fixes par verification/cases.lock.json. Le livrable T33 depend de T02
et T32 (cahier:L439-441) : « rééchantillonneur parent, strates, quantile
empirique inverse et manifeste de tirages ». F-BOOTSTRAP (cahier:L117)
resample explicitement « les deux projets precedents », c'est-a-dire les deux
parents de F-CLUSTERS (cahier:L115, P1 A=10/B=20 x10 repetitions identiques,
P2 A=90/B=100 x1 repetition) : ce fichier construit donc ses lignes de
repetition a partir de F-CLUSTERS, exactement comme T32.A2 le fait deja pour
`aggregate_repetition_rows_by_project`.
"""
from __future__ import annotations

import copy
import math
from fractions import Fraction

import bootstrap  # module a fournir par analysis/src/bootstrap.py (zone IMPL, hors de ce role)

from _fixtures import load_reference_fixture

F_BOOTSTRAP = load_reference_fixture("F-BOOTSTRAP")
F_CLUSTERS = load_reference_fixture("F-CLUSTERS")

# Quantiles 2,5 % et 97,5 % (cahier:L117, L443 : « l'intervalle 2,5 %-97,5 % »).
LOWER_Q = Fraction(1, 40)  # 2,5 % -- cahier:L117
UPPER_Q = Fraction(39, 40)  # 97,5 % -- cahier:L117


def _frac(rationnel: dict | None) -> Fraction | None:
    """Convertit un noeud {"num": n, "den": d} des fixtures en Fraction exacte."""
    if rationnel is None:
        return None
    return Fraction(rationnel["num"], rationnel["den"])


def _clusters_rows() -> list[dict]:
    """Lignes de repetition brutes de F-CLUSTERS -- meme construction que
    T32.A2 (analysis/tests/test_T32.py::_clusters_rows), reprise ici car
    F-BOOTSTRAP (cahier:L117) resample explicitement « les deux projets
    precedents » (cahier:L115 = F-CLUSTERS)."""
    projets = F_CLUSTERS["valeurs"]["projets"]  # importe
    rows: list[dict] = []
    for projet in projets:
        project_id = projet["id"]["valeur"]
        cout_a = projet["cout_A"]["valeur"]
        cout_b = projet["cout_B"]["valeur"]
        repetitions = projet["repetitions"]["valeur"]
        for _ in range(repetitions):
            rows.append({"project_id": project_id, "cost_a": cout_a, "cost_b": cout_b})
    return rows


def _forced_draws() -> list[list[str]]:
    """Liste de tirages FORCEE de F-BOOTSTRAP (cahier:L117) :
    [P1,P1],[P1,P2],[P2,P1],[P2,P2]."""
    return [list(pair) for pair in F_BOOTSTRAP["valeurs"]["liste_de_reechantillonnages_forcee"]["valeur"]]


def _expected_ratios() -> list[Fraction]:
    serie = F_BOOTSTRAP["valeurs"]["ratios_cout_A_sur_B"]["serie"]  # importe
    return [_frac(item["rationnel"]) for item in serie]


# ---------------------------------------------------------------------------
# T33.A1 -- F-BOOTSTRAP donne les quatre ratios [1/2,5/6,5/6,9/10] et
# l'intervalle 2,5%-97,5% [1/2,9/10] par la convention du rang inverse
# (cahier:L117, L443).
# ---------------------------------------------------------------------------


def test_T33_A1_f_bootstrap_gives_four_ratios_and_inverse_rank_interval():
    rows = _clusters_rows()
    draws = _forced_draws()
    expected_ratios = _expected_ratios()  # [1/2,5/6,5/6,9/10], importe

    result = bootstrap.paired_parent_bootstrap(rows, draws)

    assert result["ratios"] == expected_ratios
    assert all(status == "OK" for status in result["ratio_status"])

    expected_lower = _frac(F_BOOTSTRAP["valeurs"]["intervalle"]["borne_inferieure"]["rationnel"])  # 1/2, importe
    expected_upper = _frac(F_BOOTSTRAP["valeurs"]["intervalle"]["borne_superieure"]["rationnel"])  # 9/10, importe
    assert expected_lower == Fraction(1, 2)  # controle
    assert expected_upper == Fraction(9, 10)  # controle

    band = bootstrap.empirical_inverse_quantile_interval(result["ratios"], LOWER_Q, UPPER_Q)

    assert band["lower"] == expected_lower
    assert band["upper"] == expected_upper

    # Garde-fou explicite contre l'off-by-one nomme par
    # verification/cases.lock.json (« ceil(q*n) remplace par ceil(q*n)+1 »).
    # Rang correct (1-indexe, valeurs triees) : ceil(2,5%*4)=1, ceil(97,5%*4)=4.
    sorted_ratios = sorted(result["ratios"])
    assert sorted_ratios == [Fraction(1, 2), Fraction(5, 6), Fraction(5, 6), Fraction(9, 10)]
    n = len(sorted_ratios)
    correct_lower_rank = math.ceil(LOWER_Q * n)
    correct_upper_rank = math.ceil(UPPER_Q * n)
    assert correct_lower_rank == 1  # controle
    assert correct_upper_rank == 4  # controle
    off_by_one_lower_value = sorted_ratios[correct_lower_rank]  # rang+1, 0-indexe -> sorted_ratios[1]
    assert off_by_one_lower_value == Fraction(5, 6)  # controle : la valeur off-by-one differe bien de 1/2
    assert band["lower"] != off_by_one_lower_value

    # Garde-fou explicite contre l'interpolation lineaire (autre variante
    # nommee par cases.lock.json) : position = q*(n-1), interpolee entre les
    # deux rangs encadrants, au lieu du rang inverse exact.
    lower_pos = LOWER_Q * (n - 1)
    lower_floor = int(lower_pos)
    lower_frac_part = lower_pos - lower_floor
    interpolated_lower = sorted_ratios[lower_floor] + lower_frac_part * (
        sorted_ratios[lower_floor + 1] - sorted_ratios[lower_floor]
    )
    assert interpolated_lower == Fraction(21, 40)  # controle (0,525 exact)
    assert band["lower"] != interpolated_lower


# ---------------------------------------------------------------------------
# T33.A2 -- les deux bras suivent exactement les memes indices parents
# (bootstrap APPARIE, cahier:L443).
# ---------------------------------------------------------------------------


def test_T33_A2_both_arms_follow_exactly_the_same_parent_draws():
    rows = _clusters_rows()
    draws = _forced_draws()

    result = bootstrap.paired_parent_bootstrap(rows, draws)

    manifest = result["draw_manifest"]
    assert manifest["arm_a_parent_ids"] == draws
    assert manifest["arm_b_parent_ids"] == draws
    assert manifest["arm_a_parent_ids"] == manifest["arm_b_parent_ids"]

    # Garde-fou explicite : un second jeu de tirages FORCES differents doit se
    # refleter identiquement sur les deux bras -- exclut une implementation
    # qui recopierait un manifeste fige plutot que de deriver reellement les
    # deux bras du meme tirage.
    other_draws = [["P2", "P2"], ["P1", "P1"], ["P2", "P1"]]
    other_result = bootstrap.paired_parent_bootstrap(rows, other_draws)
    other_manifest = other_result["draw_manifest"]
    assert other_manifest["arm_a_parent_ids"] == other_draws
    assert other_manifest["arm_b_parent_ids"] == other_draws
    assert other_manifest["arm_a_parent_ids"] != manifest["arm_a_parent_ids"]  # controle : les deux jeux different bien


# ---------------------------------------------------------------------------
# T33.A3 -- multiplier tous les couts par 7 ne change ni ratio ni intervalle
# (cahier:L443 -- invariance d'echelle du ratio des moyennes).
# ---------------------------------------------------------------------------


def test_T33_A3_scaling_all_costs_by_seven_changes_neither_ratio_nor_interval():
    rows = _clusters_rows()
    draws = _forced_draws()

    baseline = bootstrap.paired_parent_bootstrap(rows, draws)
    baseline_band = bootstrap.empirical_inverse_quantile_interval(baseline["ratios"], LOWER_Q, UPPER_Q)

    scaled_rows = [
        {"project_id": row["project_id"], "cost_a": row["cost_a"] * 7, "cost_b": row["cost_b"] * 7}
        for row in rows
    ]
    # Controle : la mise a l'echelle a bien change les couts bruts.
    assert scaled_rows[0]["cost_a"] != rows[0]["cost_a"]

    scaled = bootstrap.paired_parent_bootstrap(scaled_rows, draws)
    scaled_band = bootstrap.empirical_inverse_quantile_interval(scaled["ratios"], LOWER_Q, UPPER_Q)

    assert scaled["ratios"] == baseline["ratios"]
    assert scaled_band["lower"] == baseline_band["lower"]
    assert scaled_band["upper"] == baseline_band["upper"]
    assert baseline["ratios"] == _expected_ratios()  # controle : la base reste F-BOOTSTRAP


# ---------------------------------------------------------------------------
# T33.A4 -- A=B donne tous les ratios egaux a 1 (cahier:L443).
# ---------------------------------------------------------------------------


def test_T33_A4_a_equals_b_yields_every_ratio_equal_to_one():
    projets = F_CLUSTERS["valeurs"]["projets"]  # importe, reutilise pour les identites/repetitions
    rows: list[dict] = []
    for projet in projets:
        project_id = projet["id"]["valeur"]
        cout = projet["cout_A"]["valeur"]  # A=B : le meme cout sert aux deux bras
        repetitions = projet["repetitions"]["valeur"]
        for _ in range(repetitions):
            rows.append({"project_id": project_id, "cost_a": cout, "cost_b": cout})

    draws = _forced_draws()
    result = bootstrap.paired_parent_bootstrap(rows, draws)

    assert result["ratios"] == [Fraction(1)] * 4  # cahier:L443
    assert all(status == "OK" for status in result["ratio_status"])

    band = bootstrap.empirical_inverse_quantile_interval(result["ratios"], LOWER_Q, UPPER_Q)
    assert band["lower"] == Fraction(1)  # cahier:L443
    assert band["upper"] == Fraction(1)  # cahier:L443


# ---------------------------------------------------------------------------
# T33.A5 -- permuter les lignes ou dupliquer des repetitions identiques ne
# change pas les resultats avec la meme liste de tirages parents (cahier:L443).
# ---------------------------------------------------------------------------


def test_T33_A5_row_permutation_and_duplicate_repetitions_do_not_change_results():
    rows = _clusters_rows()
    draws = _forced_draws()

    baseline = bootstrap.paired_parent_bootstrap(rows, draws)

    # Permuter l'ordre des lignes.
    permuted_rows = list(reversed(rows))
    assert permuted_rows != rows  # controle : l'ordre a bien change
    permuted = bootstrap.paired_parent_bootstrap(permuted_rows, draws)
    assert permuted["ratios"] == baseline["ratios"]
    assert permuted["draw_manifest"] == baseline["draw_manifest"]

    # Dupliquer TOUTES les repetitions de P1 (meme construction que T32.A2 :
    # duplicate des repetitions IDENTIQUES ne doit pas deplacer l'estimation).
    p1 = F_CLUSTERS["valeurs"]["projets"][0]
    assert p1["id"]["valeur"] == "P1"  # controle
    duplicated_rows = rows + [
        {"project_id": "P1", "cost_a": p1["cout_A"]["valeur"], "cost_b": p1["cout_B"]["valeur"]}
        for _ in range(p1["repetitions"]["valeur"])
    ]
    assert len(duplicated_rows) != len(rows)  # controle : la duplication a bien change le nombre de lignes
    duplicated = bootstrap.paired_parent_bootstrap(duplicated_rows, draws)
    assert duplicated["ratios"] == baseline["ratios"]
    assert duplicated["ratios"] == _expected_ratios()  # controle : toujours F-BOOTSTRAP

    # Garde-fou explicite contre un pooling brut (sensible au nombre de
    # lignes) : pooler TOUTES les lignes de P1 sans passer par la moyenne par
    # parent donnerait une moyenne differente de 10 des que la duplication
    # change le nombre de lignes -- ici elle ne change pas puisque les valeurs
    # dupliquees sont identiques, ce qui est precisement pourquoi ce cas ne
    # peut PAS distinguer pooling et moyenne-par-parent sur la seule egalite ;
    # la permutation, elle, distingue un tirage par INDICE DE LIGNE (que la
    # permutation romprait) d'un tirage par IDENTITE DE PARENT (invariant).
    naive_pooled_a = Fraction(sum(row["cost_a"] for row in permuted_rows), len(permuted_rows))
    assert naive_pooled_a != Fraction(50)  # controle : le pooling brut ne vaut pas la moyenne par parent (F-CLUSTERS)


# ---------------------------------------------------------------------------
# T33.A6 -- une seule grappe donne INSUFFICIENT_CLUSTERS pour l'inference
# interprojets (cahier:L443).
# ---------------------------------------------------------------------------


def test_T33_A6_single_cluster_yields_insufficient_clusters_for_interproject_inference():
    # Controle de capacite : DEUX grappes (F-CLUSTERS) doivent produire un
    # intervalle reel -- sinon un refus systematique verdirait ce cas a tort
    # (meme principe que T32.A5/cases.lock.json : « un cas de refus est
    # incomplet tant qu'il ne demontre pas l'existence d'un non-refus »).
    two_cluster_rows = _clusters_rows()
    two_cluster_draws = _forced_draws()
    healthy = bootstrap.interproject_bootstrap_interval(
        two_cluster_rows, two_cluster_draws, LOWER_Q, UPPER_Q
    )
    assert healthy["status"] == "OK"
    assert healthy["distinct_parent_count"] == 2
    assert healthy["interval"]["lower"] == Fraction(1, 2)
    assert healthy["interval"]["upper"] == Fraction(9, 10)

    # Une seule grappe (P1 seul, reprenant ses repetitions de F-CLUSTERS).
    p1 = F_CLUSTERS["valeurs"]["projets"][0]
    assert p1["id"]["valeur"] == "P1"  # controle
    single_cluster_rows = [
        {"project_id": "P1", "cost_a": p1["cout_A"]["valeur"], "cost_b": p1["cout_B"]["valeur"]}
        for _ in range(p1["repetitions"]["valeur"])
    ]
    single_cluster_draws = [["P1", "P1"], ["P1", "P1"]]

    result = bootstrap.interproject_bootstrap_interval(
        single_cluster_rows, single_cluster_draws, LOWER_Q, UPPER_Q
    )
    assert result["status"] == "INSUFFICIENT_CLUSTERS"  # cahier:L443
    assert result["interval"] is None
    assert result["distinct_parent_count"] == 1


# ---------------------------------------------------------------------------
# T33.A7 -- les bandes ponctuelles ne sont jamais etiquetees simultanees
# (cahier:L443).
# ---------------------------------------------------------------------------


def test_T33_A7_pointwise_bands_are_never_labeled_simultaneous():
    rows = _clusters_rows()
    draws = _forced_draws()

    bootstrap_result = bootstrap.paired_parent_bootstrap(rows, draws)
    direct_band = bootstrap.empirical_inverse_quantile_interval(bootstrap_result["ratios"], LOWER_Q, UPPER_Q)
    assert direct_band["kind"] == "pointwise"
    assert direct_band["simultaneous"] is False

    interproject_result = bootstrap.interproject_bootstrap_interval(rows, draws, LOWER_Q, UPPER_Q)
    assert interproject_result["status"] == "OK"
    assert interproject_result["interval"]["kind"] == "pointwise"
    assert interproject_result["interval"]["simultaneous"] is False

    # Garde-fou explicite sur une autre fixture (A=B), pour exclure qu'une
    # etiquette correcte sur F-BOOTSTRAP seul soit un hasard de cette entree
    # precise plutot qu'une regle du labelleur de bandes.
    a_equals_b_rows = copy.deepcopy(rows)
    for row in a_equals_b_rows:
        row["cost_b"] = row["cost_a"]
    a_equals_b_result = bootstrap.paired_parent_bootstrap(a_equals_b_rows, draws)
    a_equals_b_band = bootstrap.empirical_inverse_quantile_interval(
        a_equals_b_result["ratios"], LOWER_Q, UPPER_Q
    )
    assert a_equals_b_band["kind"] == "pointwise"
    assert a_equals_b_band["simultaneous"] is False

    # L'etiquette n'est ni absente ni sous une autre forme vraie : elle doit
    # etre explicitement False, pas seulement falsy/None.
    assert direct_band["simultaneous"] is not None
    assert interproject_result["interval"]["simultaneous"] is not None
