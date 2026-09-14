"""
Suite d'acceptation T31 -- « Exporter des donnees d'analyse completes et
tracables » (docs/cahier.md L423-L429 ; docs/specs/T31.md).

ROLE : test-author, AVEUGLE A L'IMPLEMENTATION (ADR-001). Ce fichier ne lit ni
n'importe aucune source de `analysis/src/**`, `packages/**` ni `apps/**` par un
autre chemin que l'import public `export` ci-dessous. Le contrat du module
`export` (ses fonctions, la forme de leurs entrees et sorties) est DERIVE des
cartes de specification et POSE ICI POUR LA PREMIERE FOIS : c'est la
definition de l'interface que l'implementeur doit satisfaire, pas
l'observation d'un code deja ecrit. `analysis/src` n'existe pas encore a ce
stade (analysis/pyproject.toml : « `analysis/src` n'existe pas encore, il
appartient a T31+ ») -- l'etat rouge attendu de cette suite, jusqu'a
l'implementation, est une erreur de collection (`ModuleNotFoundError: export`).

PROVENANCE DES LITTERAUX. Tout litteral compare dans une assertion provient
soit d'un import de acceptance/reference/** (F-FAILURE, F-MONEY), soit porte
un commentaire `# cahier:L<n>` resolvable par `sed -n '<n>p' docs/cahier.md`.
Aucune valeur n'est recopiee a la main depuis une execution observee.

Portee : les 7 cas requis de T31 (verification/tasks.json, required_cases),
tels que fixes par verification/cases.lock.json. Le livrable T31 depend de
T04, T12 et T16 (cahier:L425), mais cahier:L425 precise explicitement que
« les tests utilisent d'abord des journaux persistes et filiations connus » --
c'est pourquoi cette suite alimente l'export avec des enregistrements DEJA
PERSISTES, representes ici comme des structures Python litterales, plutot que
d'exiger une base PostgreSQL ou une trajectoire moteur completes (celles-ci
sont exercees a T38 et T42, cahier:L426).
"""
from __future__ import annotations

import copy

import pytest

import export  # module a fournir par analysis/src/export.py (zone IMPL, hors de ce role)

from _fixtures import load_reference_fixture

F_FAILURE = load_reference_fixture("F-FAILURE")
F_MONEY = load_reference_fixture("F-MONEY")


def _failure_period_rows() -> list[dict]:
    """
    Construit les quatre lignes de periode de F-FAILURE (cahier:L121, importe
    depuis acceptance/reference/F-FAILURE.json -- aucune valeur retranscrite a
    la main), au format d'entree de `export.export_period_results`.
    """
    couts = F_FAILURE["valeurs"]["couts"]["valeur"]  # [100, 50, 0, 0], importe
    q_par_periode = F_FAILURE["valeurs"]["Q_par_periode"]["valeur"]  # [0,0,0,0], importe
    r_par_periode = F_FAILURE["valeurs"]["R_par_periode"]["valeur"]  # [0,0,0,0], importe

    rows = []
    for idx, (cout, q, r) in enumerate(zip(couts, q_par_periode, r_par_periode), start=1):
        rows.append(
            {
                "trajectory_id": "T31-F-FAILURE",
                "period_index": idx,
                "cost_status": "KNOWN",
                "cost_micro_usd": str(cout),
                "cost_bounds": None,
                # cahier:L121 -- Q et R ne valent 0 (et non null) QUE « si les
                # exigences et usages y sont presents ».
                "requirements_present": True,
                "usage_present": True,
                "Q": q,
                "R": r,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# T31.A1 -- F-FAILURE exporte quatre periodes et total 150 (cahier:L121, L427)
# ---------------------------------------------------------------------------


def test_T31_A1_f_failure_exports_four_periods_with_total_150():
    rows = _failure_period_rows()
    exported = export.export_period_results(rows)

    expected_period_count = F_FAILURE["valeurs"]["lignes_conservees"]["valeur"]  # 4, importe
    expected_total = F_FAILURE["valeurs"]["cout_total"]["valeur"]  # 150, importe

    assert len(exported) == expected_period_count
    assert {row["period_index"] for row in exported} == {row["period_index"] for row in rows}

    exported_total = sum(int(row["cost_micro_usd"]) for row in exported)
    assert exported_total == expected_total

    # cahier:L429 -- « aucun filtre implicite de survivants » : les periodes a
    # cout nul (P3, P4 de F-FAILURE) doivent rester presentes INDIVIDUELLEMENT,
    # pas seulement fondues dans le total. Un filtre qui les ecarterait
    # laisserait le total a 150 (100+50) tout en reduisant le compte de lignes.
    expected_zero_periods = {row["period_index"] for row in rows if int(row["cost_micro_usd"]) == 0}
    exported_zero_periods = {row["period_index"] for row in exported if int(row["cost_micro_usd"]) == 0}
    assert exported_zero_periods == expected_zero_periods
    assert len(expected_zero_periods) > 0  # controle : la fixture porte bien des periodes a cout nul


# ---------------------------------------------------------------------------
# T31.A2 -- montants conserves exactement (cahier:L427). La grandeur 16320
# (cahier:L493, « 16320 au total ») est le temoin choisi car elle est le seul
# montant du cahier qui NE SURVIT PAS a un transit flottant naif *1e-6/*1e6 :
# `16320 / 1e6 * 1e6 == 16320.000000000002` en IEEE-754 double.
# ---------------------------------------------------------------------------


def test_T31_A2_amounts_survive_export_as_exact_integer_strings():
    call_cost = F_MONEY["valeurs"]["appel_de_reference"]["cout_attendu"]["valeur"]  # 340, importe
    two_calls_cost = F_MONEY["valeurs"]["deux_appels_identiques"]["cout_attendu"]["valeur"]  # 680, importe
    large_amount = 16320  # cahier:L493

    rows = [
        {
            "trajectory_id": "T31-A2",
            "period_index": 1,
            "cost_status": "KNOWN",
            "cost_micro_usd": str(call_cost),
            "cost_bounds": None,
            "requirements_present": True,
            "usage_present": True,
            "Q": None,
            "R": None,
        },
        {
            "trajectory_id": "T31-A2",
            "period_index": 2,
            "cost_status": "KNOWN",
            "cost_micro_usd": str(call_cost),
            "cost_bounds": None,
            "requirements_present": True,
            "usage_present": True,
            "Q": None,
            "R": None,
        },
        {
            "trajectory_id": "T31-A2",
            "period_index": 3,
            "cost_status": "KNOWN",
            "cost_micro_usd": str(large_amount),
            "cost_bounds": None,
            "requirements_present": True,
            "usage_present": True,
            "Q": None,
            "R": None,
        },
    ]

    exported = export.export_period_results(rows)
    by_period = {row["period_index"]: row for row in exported}

    # Egalite de CHAINE, pas seulement numerique : un transit flottant produit
    # "16320.000000000002" (ou un arrondi silencieux vers "16320" qui masque
    # la perte sur des montants moins ronds) -- seule l'egalite de chaine sur
    # cette valeur precise revele le defaut.
    assert isinstance(by_period[3]["cost_micro_usd"], str)
    assert by_period[3]["cost_micro_usd"] == str(large_amount)
    assert by_period[1]["cost_micro_usd"] == str(call_cost)
    assert by_period[2]["cost_micro_usd"] == str(call_cost)

    exported_sum_first_two = int(by_period[1]["cost_micro_usd"]) + int(by_period[2]["cost_micro_usd"])
    assert exported_sum_first_two == two_calls_cost


# ---------------------------------------------------------------------------
# T31.A3 -- somme des appels factures concorde avec le registre selon les
# ajustements (cahier:L427). Ecritures d'ajustement separees et signees :
# cahier:L80. Table `ledger_entries` : cahier:L259. Etats d'appel (SETTLED,
# RESERVED) : cahier:L99.
# ---------------------------------------------------------------------------


def test_T31_A3_billed_calls_reconcile_with_ledger_after_adjustment():
    call_cost = F_MONEY["valeurs"]["appel_de_reference"]["cout_attendu"]["valeur"]  # 340, importe
    two_calls_cost = F_MONEY["valeurs"]["deux_appels_identiques"]["cout_attendu"]["valeur"]  # 680, importe
    # Grandeur de correction : le cahier ne fixe aucun exemple chiffre
    # d'ajustement (verifie : `grep -in 'ajustement\\|correction' docs/cahier.md`
    # ne cite aucun montant) -- on reutilise le seul entier non nul disponible
    # dans F-MONEY plutot que d'en inventer un.
    adjustment_magnitude = F_MONEY["valeurs"]["appel_de_reference"]["tokens_entree_caches"]["valeur"]  # 40, importe

    model_calls = [
        {"call_id": "call-1", "state": "SETTLED", "billed_micro_usd": str(call_cost)},  # cahier:L99
        {"call_id": "call-2", "state": "SETTLED", "billed_micro_usd": str(call_cost)},
        {"call_id": "call-3", "state": "RESERVED", "billed_micro_usd": None},  # cahier:L99, pas encore regle
    ]
    ledger_entries = [
        {"entry_id": "le-1", "ref_call_id": "call-1", "kind": "CHARGE", "amount_micro_usd": str(call_cost)},
        {"entry_id": "le-2", "ref_call_id": "call-2", "kind": "CHARGE", "amount_micro_usd": str(call_cost)},
        # cahier:L80 -- « les ajustements sont des ecritures separees signees,
        # pas l'edition d'une facture deja inscrite » : correction NEGATIVE
        # liee a call-1, jamais une reecriture de le-1.
        {
            "entry_id": "le-3",
            "ref_call_id": "call-1",
            "kind": "ADJUSTMENT",
            "amount_micro_usd": str(-adjustment_magnitude),
        },
    ]

    result = export.reconcile_billed_calls(model_calls, ledger_entries)

    expected_raw_billed = two_calls_cost
    expected_net_total = expected_raw_billed - adjustment_magnitude

    assert int(result["billed_total_micro_usd"]) == expected_raw_billed
    assert int(result["ledger_total_micro_usd"]) == expected_net_total
    assert result["reconciled"] is True

    # Controle de capacite : si le registre DERIVE de l'un des deux appels
    # (une charge qui ne correspond plus au montant reellement facture),
    # l'export ne doit PAS declarer une reconciliation a tort.
    drifted_ledger = copy.deepcopy(ledger_entries)
    drifted_ledger[1]["amount_micro_usd"] = str(call_cost - adjustment_magnitude)
    drifted_result = export.reconcile_billed_calls(model_calls, drifted_ledger)
    assert drifted_result["reconciled"] is False


# ---------------------------------------------------------------------------
# T31.A4 -- cout UNKNOWN reste accompagne de bornes ou statut inconnu
# (cahier:L427) ; « aucune valeur vide convertie en zero » (cahier:L429) ;
# montants entiers non negatifs (cahier:L80).
# ---------------------------------------------------------------------------


def test_T31_A4_unknown_cost_keeps_bounds_and_status_not_coalesced_to_zero():
    upper_bound = F_MONEY["valeurs"]["appel_de_reference"]["cout_attendu"]["valeur"]  # 340, importe, reutilise comme borne

    row = {
        "trajectory_id": "T31-A4",
        "period_index": 1,
        "cost_status": "UNKNOWN",  # cahier:L427
        "cost_micro_usd": None,
        "cost_bounds": {"min_micro_usd": "0", "max_micro_usd": str(upper_bound)},  # cahier:L80, non negatif
        "requirements_present": True,
        "usage_present": True,
        "Q": None,
        "R": None,
    }

    exported = export.export_period_results([row])
    assert len(exported) == 1
    exported_row = exported[0]

    assert exported_row["cost_status"] == "UNKNOWN"
    assert exported_row["cost_micro_usd"] is None
    assert exported_row["cost_micro_usd"] != "0"  # cahier:L429, garde-fou explicite anti-coalescence
    assert exported_row["cost_bounds"] is not None
    assert exported_row["cost_bounds"]["max_micro_usd"] == str(upper_bound)
    assert exported_row["cost_bounds"]["min_micro_usd"] == "0"


# ---------------------------------------------------------------------------
# T31.A5 -- branche declare parent et couts marginaux (cahier:L427). Chiffres
# repris de l'exemple T27.A3 (cahier:L391) : parent 10000, depense
# supplementaire 2000, branches 300 et 500, depenses physiques globales 12800.
# ---------------------------------------------------------------------------


def test_T31_A5_branch_declares_parent_and_marginal_cost_not_total():
    parent_cost = 10000  # cahier:L391
    parent_extra_spend = 2000  # cahier:L391
    marginal_a = 300  # cahier:L391
    marginal_b = 500  # cahier:L391
    expected_global_physical_spend = 12800  # cahier:L391

    branch_a = {
        "branch_id": "branch-a",
        "parent_id": "parent",
        "marginal_cost_micro_usd": str(marginal_a),
        "total_cost_micro_usd": str(parent_cost + parent_extra_spend + marginal_a),
    }
    branch_b = {
        "branch_id": "branch-b",
        "parent_id": "parent",
        "marginal_cost_micro_usd": str(marginal_b),
        "total_cost_micro_usd": str(parent_cost + parent_extra_spend + marginal_b),
    }

    exported_a = export.export_branch_lineage(branch_a)
    exported_b = export.export_branch_lineage(branch_b)

    # cahier:L429 -- « la normalisation n'enleve jamais les identifiants de
    # projet » : le parent doit rester declare sur chaque ligne de branche.
    assert exported_a["parent_id"] == "parent"
    assert exported_b["parent_id"] == "parent"

    assert exported_a["marginal_cost_micro_usd"] == str(marginal_a)
    assert exported_b["marginal_cost_micro_usd"] == str(marginal_b)

    # Garde-fou explicite contre l'export du cout TOTAL a la place du marginal
    # (cahier:L427 : « couts marginaux », pas couts cumules).
    assert exported_a["marginal_cost_micro_usd"] != branch_a["total_cost_micro_usd"]
    assert exported_b["marginal_cost_micro_usd"] != branch_b["total_cost_micro_usd"]

    global_physical_spend = (
        parent_cost
        + parent_extra_spend
        + int(exported_a["marginal_cost_micro_usd"])
        + int(exported_b["marginal_cost_micro_usd"])
    )
    assert global_physical_spend == expected_global_physical_spend


# ---------------------------------------------------------------------------
# T31.A6 -- l'ordre des lignes source ne change pas l'export canonique trie
# (cahier:L427).
# ---------------------------------------------------------------------------


def test_T31_A6_canonical_export_is_invariant_to_source_row_order():
    rows = _failure_period_rows()
    reversed_rows = list(reversed(rows))
    assert reversed_rows != rows  # controle : la permutation change reellement l'ordre source

    canonical_forward = export.canonical_export(rows)
    canonical_reversed = export.canonical_export(reversed_rows)

    assert canonical_forward == canonical_reversed

    # Garde-fou explicite contre un stub constant ou vide (avertissement nomme
    # par verification/cases.lock.json pour ce cas precis) : la sortie doit
    # porter le contenu reel des lignes...
    assert canonical_forward != ""
    for row in rows:
        assert row["trajectory_id"] in canonical_forward
        assert str(row["period_index"]) in canonical_forward

    # ...et changer si leur CONTENU change (pas seulement leur ordre) --
    # sans quoi l'invariance observee ci-dessus serait vraie d'une sortie
    # constante plutot que d'un tri canonique reel.
    mutated_rows = copy.deepcopy(rows)
    mutated_rows[0]["cost_micro_usd"] = str(int(mutated_rows[0]["cost_micro_usd"]) + 1)
    canonical_mutated = export.canonical_export(mutated_rows)
    assert canonical_mutated != canonical_forward


# ---------------------------------------------------------------------------
# T31.A7 -- melange de couts recorded avec un rapport live confirmatoire
# rejete (cahier:L427). Table des modes : cahier:L21 (`recorded`), L22
# (`live`). Regle de rejet : cahier:L24, « un rapport reel ne peut contenir
# des couts fictifs sans etre rejete ».
# ---------------------------------------------------------------------------


def test_T31_A7_mixing_recorded_costs_into_a_live_report_is_rejected():
    live_genuine_report = {
        "execution_mode": "live",  # cahier:L22
        "cost_origin": "live",  # cahier:L22
        "corpus_provenance": "connector-real-run",
    }
    recorded_genuine_report = {
        "execution_mode": "recorded",  # cahier:L21
        "cost_origin": "recorded",  # cahier:L21
        "corpus_provenance": "scripted-agent",
    }
    mixed_report = {
        "execution_mode": "live",  # cahier:L22 -- rapport reel...
        "cost_origin": "recorded",  # cahier:L21 -- ...avec des couts fictifs archives : L24 l'interdit
        "corpus_provenance": "connector-real-run-confirmatory",
    }

    # Controle de capacite : les deux formes coherentes ne doivent PAS etre
    # rejetees -- sinon une implementation qui rejette tout verdirait ce cas a
    # tort (verification/cases.lock.json : « un stub qui leve le garderait
    # vert a tort »).
    export.validate_mode_consistency(live_genuine_report)
    export.validate_mode_consistency(recorded_genuine_report)

    with pytest.raises(export.ModeConflictError):
        export.validate_mode_consistency(mixed_report)
