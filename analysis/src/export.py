"""
Export d'analyse traçable -- T31 (docs/cahier.md L423-L429 ; docs/specs/T31.md).

ROLE : implementer. Zone IMPL (verification/ownership.json). Le contrat de ce
module (noms de fonctions, forme des entrees/sorties, ModeConflictError) est
fixe par analysis/tests/test_T31.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas.

Principes suivis (cahier:L427-L429) :
  - aucun filtre implicite de survivants : toute ligne source produit une
    ligne exportee, y compris les periodes a cout nul ;
  - les montants sont des chaines d'entiers exacts (cahier:L80, invariant
    D.9) -- jamais un transit par un flottant (`/1e6*1e6`, arrondi) ;
  - un cout UNKNOWN garde son statut et ses bornes ; il n'est jamais coalesce
    a "0" ni prive de ses champs ;
  - une ligne de branche declare toujours son `parent_id` et son cout
    MARGINAL propre, jamais le cout total cumule ;
  - l'export canonique est trie par une cle d'identite stable, donc invariant
    a l'ordre des lignes source ;
  - un rapport `live` (execution reelle) ne peut pas porter des couts
    `recorded` (fictifs/archives) : cahier:L21-L24.
"""
from __future__ import annotations

import json


class ModeConflictError(Exception):
    """Leve quand un rapport declare `execution_mode` et `cost_origin`
    incoherents (cahier:L21-L24) -- un rapport reel avec des couts fictifs."""


def export_period_results(rows: list[dict]) -> list[dict]:
    """Projette des lignes de periode persistees vers l'export (cahier:L425).

    Aucune ligne n'est ecartee (cahier:L429 : « aucun filtre implicite de
    survivants »). Les montants connus sont recopies tels quels, en chaine,
    sans transit par un flottant. Une ligne UNKNOWN garde son statut, un
    `cost_micro_usd` a `None` (jamais coalesce a "0") et ses `cost_bounds`.
    """
    exported = []
    for row in rows:
        requirements_present = row.get("requirements_present", False)
        usage_present = row.get("usage_present", False)
        exported.append(
            {
                "trajectory_id": row["trajectory_id"],
                "period_index": row["period_index"],
                "cost_status": row["cost_status"],
                # cahier:L80/D.9 -- recopie de chaine intacte, jamais de
                # division/multiplication flottante sur le montant.
                "cost_micro_usd": row["cost_micro_usd"],
                "cost_bounds": row.get("cost_bounds"),
                "requirements_present": requirements_present,
                "usage_present": usage_present,
                # cahier:L121 -- Q et R ne valent 0 que si exigences/usages
                # sont presents ; sinon ils restent absents (None), jamais
                # coalesces a 0 non plus.
                "Q": row.get("Q") if requirements_present else None,
                "R": row.get("R") if usage_present else None,
            }
        )
    return exported


def reconcile_billed_calls(model_calls: list[dict], ledger_entries: list[dict]) -> dict:
    """Concilie les appels factures avec le registre, ajustements compris
    (cahier:L427, ecritures d'ajustement separees et signees : cahier:L80).

    `billed_total_micro_usd` : somme brute des appels `SETTLED`.
    `ledger_total_micro_usd` : somme nette du registre (CHARGE + ADJUSTMENT).
    `reconciled` : chaque appel `SETTLED` a exactement une somme de charges
    (`kind == "CHARGE"`) au registre egale a son montant facture -- une
    charge qui derive du montant reellement facture rend la conciliation
    fausse, meme si les totaux globaux paraissent coherents par ailleurs.
    """
    billed_total = 0
    per_call_billed: dict[str, int] = {}
    for call in model_calls:
        if call.get("state") == "SETTLED":
            amount = int(call["billed_micro_usd"])
            billed_total += amount
            per_call_billed[call["call_id"]] = per_call_billed.get(call["call_id"], 0) + amount

    ledger_total = 0
    per_call_charged: dict[str, int] = {}
    for entry in ledger_entries:
        amount = int(entry["amount_micro_usd"])
        ledger_total += amount
        if entry["kind"] == "CHARGE":
            ref = entry["ref_call_id"]
            per_call_charged[ref] = per_call_charged.get(ref, 0) + amount

    reconciled = all(
        per_call_charged.get(call_id) == amount for call_id, amount in per_call_billed.items()
    )

    return {
        "billed_total_micro_usd": str(billed_total),
        "ledger_total_micro_usd": str(ledger_total),
        "reconciled": reconciled,
    }


def export_branch_lineage(branch: dict) -> dict:
    """Exporte une ligne de branche declarant son parent et son cout
    MARGINAL propre, jamais son cout total cumule (cahier:L427, L429)."""
    return {
        "branch_id": branch["branch_id"],
        "parent_id": branch["parent_id"],
        "marginal_cost_micro_usd": branch["marginal_cost_micro_usd"],
    }


def canonical_export(rows: list[dict]) -> str:
    """Serialise `rows` en une forme canonique triee (cahier:L427), invariante
    a l'ordre des lignes source : le tri porte sur une cle d'identite stable
    (`trajectory_id`, `period_index`), pas sur l'ordre de reception."""
    ordered = sorted(rows, key=lambda row: (row["trajectory_id"], row["period_index"]))
    return json.dumps(ordered, sort_keys=True, separators=(",", ":"))


def validate_mode_consistency(report: dict) -> None:
    """Refuse un rapport `live` (execution reelle) qui porte des couts
    `recorded` (fictifs/archives) -- cahier:L21 (`recorded`), L22 (`live`),
    L24 (« un rapport reel ne peut contenir des couts fictifs sans etre
    rejete »). Les combinaisons coherentes (`live`/`live`, `recorded`/
    `recorded`) sont acceptees sans lever."""
    if report.get("execution_mode") == "live" and report.get("cost_origin") == "recorded":
        raise ModeConflictError(
            "rapport live avec couts recorded : melange interdit (cahier:L24)"
        )
