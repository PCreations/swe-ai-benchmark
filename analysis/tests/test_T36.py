"""
Suite d'acceptation T36 -- « Générer un rapport dont les nombres proviennent
des résultats » (docs/cahier.md L467-L476 ; docs/specs/T36.md).

ROLE : test-author, AVEUGLE A L'IMPLEMENTATION (ADR-001). Ce fichier ne lit ni
n'importe aucune source de `analysis/src/**`, `packages/**` ni `apps/**` par un
autre chemin que l'import public `report` ci-dessous. Le contrat du module
`report` (ses fonctions, la forme de leurs entrees et sorties) est DERIVE des
cartes de specification et POSE ICI POUR LA PREMIERE FOIS : c'est la
definition de l'interface que l'implementeur doit satisfaire, pas
l'observation d'un code deja ecrit. `analysis/src/report.py` n'existe pas
encore a ce stade -- l'etat rouge attendu de cette suite, jusqu'a
l'implementation, est une erreur de collection (`ModuleNotFoundError: report`).

CONTRAT POSE (livrables cahier:L469 : « rapport Markdown/HTML et graphiques
statiques exportables, tous lies au manifeste de donnees » ; regle du rendu
narratif cahier:L471 : « le moteur insere lui-meme les nombres [...] du texte
libre contenant des affirmations numeriques non rattachees a un fait calcule
n'entre pas dans le rapport certifie ») :

  report.render_numeric_fact(fact_id, exact_value, precision_digits) -> dict
      `exact_value` est une `Fraction` exacte. Arrondit `exact_value` a
      exactement `precision_digits` chiffres apres la virgule (les fixtures
      exercees ici sont exactement representables a cette precision, aucune
      ambiguite d'arrondi). Renvoie {"fact_id": str, "exact": Fraction,
      "precision_digits": int, "display": str}, ou `display` est une chaine
      decimale a POINT ("0.8125"), comportant EXACTEMENT `precision_digits`
      chiffres apres le point -- l'arrondi annonce (cahier:L473) doit etre
      un arrondi reellement applique a cette precision, pas une precision
      revendiquee mais non tenue.

  report.render_exact_fact(fact_id, exact_value) -> dict
      Rend un fait SANS arrondi decimal, par sa representation rationnelle
      exacte : `display` vaut str(numerateur) si le denominateur reduit vaut
      1, sinon f"{numerateur}/{denominateur}". Renvoie {"fact_id": str,
      "exact": Fraction, "display": str}. Usage : valeurs a developpement
      decimal infini (U=2/3, cahier:L107, note fixture : « comparer en
      rationnel ») ou entieres (moyennes de cout).

  report.build_quality_fact_table(V, U, exposure, intent_success_ratio, *,
                                   v_precision_digits=4) -> dict
      Assemble le tableau de faits de qualite d'une periode. Chaque
      parametre est une `Fraction` deja calculee en amont (T32 -- ce module
      ne recalcule ni V ni U, cahier:L469 : le rapport LIT des resultats).
      Renvoie {"V": render_numeric_fact("V", V, v_precision_digits),
               "U": render_exact_fact("U", U),
               "exposure": render_exact_fact("exposure", exposure),
               "intent_success_ratio": render_exact_fact("intent_success_ratio",
                                                          intent_success_ratio)}.
      Le fact_id "U" DOIT rester lie a la valeur `U` recue, jamais a
      `intent_success_ratio` (piege nomme cahier:L107 et
      verification/cases.lock.json pour T36.A1).

  report.build_cost_ratio_fact_table(mean_a, mean_b, ratio_a_over_b,
                                      ratio_status) -> dict
      `ratio_a_over_b` est `None` quand `ratio_status != "OK"` (denominateur
      nul, meme convention que T32 `safe_ratio`/`ZERO_DENOMINATOR`). Renvoie
      {"mean_a": render_exact_fact("mean_a", mean_a),
       "mean_b": render_exact_fact("mean_b", mean_b),
       "ratio_a_over_b": render_exact_fact("ratio_a_over_b", ratio_a_over_b)
                         si ratio_status == "OK" sinon
                         {"fact_id": "ratio_a_over_b", "exact": None, "display": None},
       "ratio_status": ratio_status}.

  report.build_trajectory_chart_series(trajectory_rows) -> dict
      `trajectory_rows` : liste de {"trajectory_id": str,
      "attempt_outcome": "SUCCESS"|"FAILED"|"CANCELLED", "period_index": int,
      "value": Fraction}. Renvoie {"points": list(trajectory_rows)} -- TOUTES
      les lignes recues sont conservees dans les points de la courbe, sans
      filtre de survivants sur `attempt_outcome` (cahier:L473 : « une
      trajectoire echouee reste dans les courbes »).

  report.REQUIRED_CHART_METADATA_FIELDS -> tuple[str, ...]
      Constante = ("units", "execution_mode", "population", "band_kind"),
      les quatre metadonnees exigees par graphique (cahier:L473 : « chaque
      graphique porte unites, mode, population et nature des bandes »).

  report.build_chart(*, chart_id, series, units, execution_mode, population,
                      band_kind) -> dict
      Renvoie {"chart_id": chart_id, "series": series,
               "metadata": {"units": units, "execution_mode": execution_mode,
                             "population": population, "band_kind": band_kind}}.
      Les quatre champs de `metadata` sont TOUJOURS presents et non None dans
      le graphique produit.

  report.assemble_report_rows(rows) -> list[dict]
      `rows` : liste de {"period_index": int,
      "cost_status": "RESOLVED"|"UNKNOWN", "cost_amount": int | None,
      "missing_data": bool}. Renvoie list(rows) SANS filtrer les lignes
      `cost_status == "UNKNOWN"` ni celles ou `missing_data` est vrai
      (cahier:L473 : « cout non reconcilie et donnees manquantes
      apparaissent dans le rapport » ; meme statut que T31.A4, cahier:L427).

  report.render_narrative_note(template, fact_refs, fact_table) -> dict
      `template` : chaine avec des espaces reserves `{nom}`. `fact_refs` :
      dict nom -> fact_id, cle de `fact_table` (tel que produit par
      `build_quality_fact_table` / `build_cost_ratio_fact_table`).
      Comportement (cahier:L471) : le moteur insere lui-meme les chiffres, a
      partir de `fact_table[fact_id]["display"]`, en substituant chaque
      espace reserve. Tout chiffre ecrit EN DUR dans `template`, EN DEHORS
      des espaces reserves, disqualifie la note entiere -- ce chiffre n'est
      par construction rattache a aucun fait calcule (cahier:L471 : « texte
      libre contenant des affirmations numeriques non rattachees a un fait
      calcule n'entre pas dans le rapport certifie »).
      Renvoie, si accepte : {"accepted": True, "rendered": str, "reason": None}.
      Renvoie, si refuse : {"accepted": False, "rendered": None,
                             "reason": "UNBOUND_NUMERIC_LITERAL"}.
      N'altere jamais `fact_table` (cahier:L473 : « sans changer le tableau
      calcule »).

PROVENANCE DES LITTERAUX. Tout litteral compare dans une assertion provient
soit d'un import de acceptance/reference/** (F-QUALITY, F-COST-RATIO), soit
porte un commentaire `# cahier:L<n>` resolvable par `sed -n '<n>p'
docs/cahier.md`, soit cite directement le texte de
`verification/cases.lock.json` qui nomme la perturbation ciblee pour le cas
(cas des valeurs "pieges" 0,7 pour A1/A2 et "0,813"/"0.9" pour A1/A6, deja
enoncees par ce registre et non recalculees ici). Les identifiants de
trajectoire, de graphique et de gabarit narratif sont des constructions ad
hoc du test-author (aucune valeur chiffree fixee par le cahier pour ces cas,
comme pour T32.A6), commentees comme telles.

Portee : les 6 cas requis de T36 (verification/tasks.json, required_cases),
tels que fixes par verification/cases.lock.json. Le livrable T36 depend de
T31, T32, T33 et T34 (cahier:L469), mais ce module ne les appelle pas : par
construction (cahier:L471, « le moteur insere lui-meme les nombres [...] a
partir de fact_id »), ce module de rapport RECOIT en entree des resultats
DEJA CALCULES (memes structures que celles derivees dans test_T32.py --
V, U, exposure, intent_success_ratio, moyennes et ratio de cout), au meme
titre que T34 a recu des bornes deja calculees par T33 (cahier:L449).
"""
from __future__ import annotations

import copy
from fractions import Fraction

import report  # module a fournir par analysis/src/report.py (zone IMPL, hors de ce role)

from _fixtures import load_reference_fixture

F_QUALITY = load_reference_fixture("F-QUALITY")
F_COST_RATIO = load_reference_fixture("F-COST-RATIO")


def _frac(rationnel: dict | None) -> Fraction | None:
    """Convertit un noeud {"num": n, "den": d} des fixtures en Fraction exacte."""
    if rationnel is None:
        return None
    return Fraction(rationnel["num"], rationnel["den"])


# ---------------------------------------------------------------------------
# T36.A1 -- F-QUALITY affiche 0,8125 et 2/3 avec arrondi annonce, sans
# remplacer U par 0,7 (cahier:L107, L473).
# ---------------------------------------------------------------------------


def test_T36_A1_f_quality_shows_0_8125_and_2_3_with_disclosed_rounding_not_0_7():
    v = _frac(F_QUALITY["valeurs"]["V"]["rationnel"])  # 13/16, importe
    u = _frac(F_QUALITY["valeurs"]["U"]["rationnel"])  # 2/3, importe
    exposure = _frac(F_QUALITY["valeurs"]["exposition"]["rationnel"])  # 3/4, importe
    intent_ratio = _frac(F_QUALITY["valeurs"]["reussite_agregee_par_intention"]["rationnel"])  # 7/10, importe
    assert v == Fraction(13, 16)  # controle
    assert u == Fraction(2, 3)  # controle
    assert intent_ratio == Fraction(7, 10)  # controle -- la valeur qui NE DOIT PAS remplacer U (cahier:L107)

    table = report.build_quality_fact_table(v, u, exposure, intent_ratio, v_precision_digits=4)

    assert table["V"]["exact"] == Fraction(13, 16)
    assert table["V"]["precision_digits"] == 4
    assert table["V"]["display"] == "0.8125"  # arrondi annonce, 4 chiffres -- cahier:L473

    assert table["U"]["exact"] == Fraction(2, 3)
    assert table["U"]["display"] == "2/3"
    # Garde-fou explicite (cahier:L107, piege nomme par
    # verification/cases.lock.json pour T36.A1) : U ne doit JAMAIS devenir la
    # reussite agregee par intention.
    assert table["U"]["exact"] != intent_ratio
    assert table["U"]["exact"] != Fraction(7, 10)

    # cahier:L107 -- « ces trois derniers nombres sont differents et doivent
    # rester identifies » : U, exposition et reussite agregee par intention.
    assert table["U"]["exact"] != table["exposure"]["exact"]
    assert table["U"]["exact"] != table["intent_success_ratio"]["exact"]
    assert table["exposure"]["exact"] != table["intent_success_ratio"]["exact"]

    # Garde-fou explicite contre l'arrondi non tenu, nomme par
    # verification/cases.lock.json (« arrondir V a 0,813 tout en annoncant
    # quatre decimales »).
    wrong_display_named_by_lock = "0.813"
    assert table["V"]["display"] != wrong_display_named_by_lock
    assert len(table["V"]["display"].split(".")[1]) == table["V"]["precision_digits"]


# ---------------------------------------------------------------------------
# T36.A2 -- F-COST-RATIO affiche 5/6 et les deux moyennes (cahier:L113, L473).
# ---------------------------------------------------------------------------


def test_T36_A2_f_cost_ratio_shows_5_6_and_both_means():
    mean_a = F_COST_RATIO["valeurs"]["moyenne_A"]["valeur"]  # 50, importe
    mean_b = F_COST_RATIO["valeurs"]["moyenne_B"]["valeur"]  # 60, importe
    ratio = _frac(F_COST_RATIO["valeurs"]["ratio_principal_A_sur_B"]["rationnel"])  # 5/6, importe
    incorrect = _frac(F_COST_RATIO["valeurs"]["resultat_incorrect_a_detecter"]["rationnel"])  # 7/10, importe
    couts_a = F_COST_RATIO["valeurs"]["couts_bras_A"]["valeur"]  # [10, 90], importe
    couts_b = F_COST_RATIO["valeurs"]["couts_bras_B"]["valeur"]  # [20, 100], importe
    assert ratio == Fraction(5, 6)  # controle
    assert incorrect == Fraction(7, 10)  # controle

    table = report.build_cost_ratio_fact_table(Fraction(mean_a), Fraction(mean_b), ratio, "OK")

    assert table["mean_a"]["exact"] == Fraction(50)
    assert table["mean_a"]["display"] == "50"
    assert table["mean_b"]["exact"] == Fraction(60)
    assert table["mean_b"]["display"] == "60"
    assert table["ratio_a_over_b"]["exact"] == Fraction(5, 6)
    assert table["ratio_a_over_b"]["display"] == "5/6"
    assert table["ratio_status"] == "OK"

    # Garde-fou explicite (cahier:L113) : la moyenne des ratios projet par
    # projet (0,7) ne doit jamais remplacer le ratio des moyennes.
    per_project_ratio_mean = (
        Fraction(couts_a[0], couts_b[0]) + Fraction(couts_a[1], couts_b[1])
    ) / 2
    assert per_project_ratio_mean == incorrect  # controle : la valeur incorrecte est bien 7/10
    assert table["ratio_a_over_b"]["exact"] != per_project_ratio_mean

    # Denominateur nul (T32.A5, meme convention `ZERO_DENOMINATOR`) : statut
    # propage, aucune valeur numerique de secours.
    zero_table = report.build_cost_ratio_fact_table(Fraction(50), Fraction(0), None, "ZERO_DENOMINATOR")
    assert zero_table["ratio_a_over_b"]["exact"] is None
    assert zero_table["ratio_a_over_b"]["display"] is None
    assert zero_table["ratio_status"] == "ZERO_DENOMINATOR"
    # Garde-fou : les moyennes elles-memes restent exactes malgre le ratio absent.
    assert zero_table["mean_a"]["exact"] == Fraction(50)


# ---------------------------------------------------------------------------
# T36.A3 -- une trajectoire echouee reste dans les courbes (cahier:L473).
# ---------------------------------------------------------------------------


def test_T36_A3_failed_trajectory_survives_in_chart_series():
    # Lignes ad hoc (aucune valeur chiffree fixee par le cahier pour ce cas,
    # comme pour T32.A6) : deux trajectoires reussies, une trajectoire
    # echouee -- cahier:L473, « une trajectoire echouee reste dans les
    # courbes ».
    rows = [
        {"trajectory_id": "traj-ok-1", "attempt_outcome": "SUCCESS", "period_index": 1, "value": Fraction(4)},
        {"trajectory_id": "traj-ok-2", "attempt_outcome": "SUCCESS", "period_index": 2, "value": Fraction(6)},
        {"trajectory_id": "traj-failed", "attempt_outcome": "FAILED", "period_index": 3, "value": Fraction(3)},
    ]

    result = report.build_trajectory_chart_series(rows)

    # Controle de capacite : les trajectoires reussies doivent rester
    # presentes aussi -- ce cas n'affirme pas seulement l'absence de filtre
    # sur les echecs, mais la conservation de TOUTES les lignes recues.
    assert len(result["points"]) == len(rows)
    ids = {point["trajectory_id"] for point in result["points"]}
    assert ids == {"traj-ok-1", "traj-ok-2", "traj-failed"}
    assert "traj-failed" in ids  # affirmation POSITIVE de presence, cahier:L473

    failed_point = next(p for p in result["points"] if p["trajectory_id"] == "traj-failed")
    assert failed_point["attempt_outcome"] == "FAILED"
    assert failed_point["value"] == Fraction(3)

    # Garde-fou explicite contre le filtre de survivants nomme par
    # verification/cases.lock.json (« ne garder que les trajectoires a
    # attempt_outcome SUCCESS »).
    survivors_only = [p for p in rows if p["attempt_outcome"] == "SUCCESS"]
    assert len(survivors_only) != len(rows)  # controle : le filtre changerait bien le compte
    assert len(result["points"]) != len(survivors_only)


# ---------------------------------------------------------------------------
# T36.A4 -- chaque graphique porte unites, mode, population et nature des
# bandes (cahier:L473).
# ---------------------------------------------------------------------------


def test_T36_A4_every_chart_carries_units_mode_population_and_band_kind():
    required_fields = report.REQUIRED_CHART_METADATA_FIELDS
    # cahier:L473 -- quatre metadonnees exactement.
    assert set(required_fields) == {"units", "execution_mode", "population", "band_kind"}
    assert len(required_fields) == 4

    # Deux graphiques distincts (ad hoc), pour exclure une implementation qui
    # ne renseignerait les quatre champs que sur le premier graphique produit.
    cost_chart = report.build_chart(
        chart_id="cost-curve",
        series={"points": []},
        units="micro-USD",  # cahier:L80 -- unite monetaire du depot
        execution_mode="recorded",  # cahier:L17 -- un des deux modes
        population="n=2 projets",
        band_kind="POINTWISE",  # cahier:L445 -- nature de bande distincte de SIMULTANEOUS
    )
    quality_chart = report.build_chart(
        chart_id="quality-curve",
        series={"points": []},
        units="ratio",
        execution_mode="recorded",
        population="n=4 periodes",
        band_kind="SIMULTANEOUS",
    )

    for chart in (cost_chart, quality_chart):
        for field in required_fields:
            assert field in chart["metadata"]
            assert chart["metadata"][field] is not None

    # Garde-fou : la nature des bandes n'est pas une constante figee,
    # observable independamment sur les deux graphiques.
    assert cost_chart["metadata"]["band_kind"] != quality_chart["metadata"]["band_kind"]

    # Garde-fou explicite contre le retrait d'un champ obligatoire, nomme par
    # verification/cases.lock.json (« retirer un champ de metadonnees
    # obligatoire de chaque graphique »).
    degraded_metadata = dict(cost_chart["metadata"])
    del degraded_metadata["band_kind"]
    assert not set(required_fields).issubset(degraded_metadata.keys())
    assert set(required_fields).issubset(cost_chart["metadata"].keys())


# ---------------------------------------------------------------------------
# T36.A5 -- cout non reconcilie et donnees manquantes apparaissent dans le
# rapport (cahier:L473, meme statut que T31.A4 cahier:L427).
# ---------------------------------------------------------------------------


def test_T36_A5_unreconciled_cost_and_missing_data_appear_in_the_report():
    # Lignes ad hoc (aucune valeur chiffree fixee par le cahier pour ce cas) :
    # une ligne saine, une au cout non reconcilie (statut UNKNOWN, meme
    # convention que T31.A4/T32.A5), une aux donnees manquantes.
    rows = [
        {"period_index": 1, "cost_status": "RESOLVED", "cost_amount": 100, "missing_data": False},
        {"period_index": 2, "cost_status": "UNKNOWN", "cost_amount": None, "missing_data": False},
        {"period_index": 3, "cost_status": "RESOLVED", "cost_amount": 50, "missing_data": True},
    ]

    result = report.assemble_report_rows(rows)

    # Controle de capacite : la ligne saine reste presente elle aussi.
    assert len(result) == len(rows)
    healthy_rows = [r for r in result if r["period_index"] == 1]
    assert len(healthy_rows) == 1

    unknown_rows = [r for r in result if r["cost_status"] == "UNKNOWN"]
    assert len(unknown_rows) == 1
    assert unknown_rows[0]["period_index"] == 2  # affirmation POSITIVE de presence, cahier:L473
    assert unknown_rows[0]["cost_amount"] is None

    missing_rows = [r for r in result if r["missing_data"] is True]
    assert len(missing_rows) == 1
    assert missing_rows[0]["period_index"] == 3  # affirmation POSITIVE de presence, cahier:L473

    # Garde-fou explicite contre le filtre a l'assemblage nomme par
    # verification/cases.lock.json (« filtrer les lignes de statut UNKNOWN et
    # les trous de donnees »).
    filtered = [r for r in rows if r["cost_status"] != "UNKNOWN" and not r["missing_data"]]
    assert len(filtered) != len(rows)  # controle : le filtre changerait bien le compte
    assert len(result) != len(filtered)


# ---------------------------------------------------------------------------
# T36.A6 -- une note narrative contenant un chiffre contradictoire est
# refusee ou supprimee sans changer le tableau calcule (cahier:L471, L473).
# ---------------------------------------------------------------------------


def test_T36_A6_narrative_note_with_unbound_numeric_literal_is_refused():
    ratio = _frac(F_COST_RATIO["valeurs"]["ratio_principal_A_sur_B"]["rationnel"])  # 5/6, importe
    fact_table = report.build_cost_ratio_fact_table(Fraction(50), Fraction(60), ratio, "OK")
    frozen_table = copy.deepcopy(fact_table)

    # Controle de capacite : une note dont TOUS les chiffres viennent d'un
    # espace reserve relie a un fact_id doit etre acceptee -- sinon un refus
    # systematique verdirait ce cas a tort (verification/cases.lock.json :
    # « un stub qui leve garderait le cas vert a tort »).
    accepted = report.render_narrative_note(
        template="Le ratio de cout observe est {ratio}, pour des moyennes de {a} et {b}.",
        fact_refs={"ratio": "ratio_a_over_b", "a": "mean_a", "b": "mean_b"},
        fact_table=fact_table,
    )
    assert accepted["accepted"] is True
    assert accepted["reason"] is None
    assert fact_table["ratio_a_over_b"]["display"] in accepted["rendered"]  # "5/6", importe du tableau
    assert fact_table["mean_a"]["display"] in accepted["rendered"]  # "50"

    # cahier:L471 -- « du texte libre contenant des affirmations numeriques
    # non rattachees a un fait calcule n'entre pas dans le rapport certifie ».
    # Chiffre contradictoire ecrit en dur dans le gabarit, hors de tout
    # espace reserve.
    contradictory = report.render_narrative_note(
        template="Le ratio de cout observe est {ratio}, en realite plutot 0.9 sur le terrain.",
        fact_refs={"ratio": "ratio_a_over_b"},
        fact_table=fact_table,
    )
    assert contradictory["accepted"] is False
    assert contradictory["reason"] == "UNBOUND_NUMERIC_LITERAL"
    assert contradictory["rendered"] is None

    # cahier:L473 -- « sans changer le tableau calcule » : le refus n'altere
    # pas le tableau de faits recu.
    assert fact_table == frozen_table

    # Garde-fou explicite contre la garde rendue PERMISSIVE, nommee par
    # verification/cases.lock.json (« supprimer le controle [...] de sorte
    # qu'une note narrative portant un chiffre contradictoire soit rendue
    # telle quelle »).
    permissive_variant_would_render = (
        "Le ratio de cout observe est " + fact_table["ratio_a_over_b"]["display"]
        + ", en realite plutot 0.9 sur le terrain."
    )
    assert "0.9" in permissive_variant_would_render  # controle : le chiffre contradictoire y figure bien
    assert contradictory["rendered"] != permissive_variant_would_render
