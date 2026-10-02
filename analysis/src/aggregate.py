"""
Estimations au niveau des projets -- T32 (docs/cahier.md L431-L438 ;
docs/specs/T32.md).

ROLE : implementer, ETAGE IMPL. Zone IMPL (verification/ownership.json). Le
contrat de ce module (noms de fonctions, forme des entrees/sorties) est fixe
par analysis/tests/test_T32.py (zone ACCEPTANCE, ADR-001) : ce fichier
satisfait ce contrat, il ne le redefinit pas.

Regles portees par cahier:L435 (et verifiees ci-dessous par les six exports) :
  - `aggregate_arm_cost_ratio`   : ratio DES MOYENNES, jamais la moyenne des
    ratios projet par projet (cahier:L113).
  - `aggregate_repetition_rows_by_project` : moyenne des moyennes PAR PROJET
    (poids egal par projet), jamais un pooling sur toutes les lignes de
    repetition (cahier:L115).
  - `aggregate_quality_columns`  : V, U et le ratio d'intentions restent trois
    colonnes DISTINCTES (cahier:L107, L111).
  - `aggregate_cost_and_success` : cout moyen sur TOUTES les trajectoires,
    echecs inclus (cahier:L435).
  - `safe_ratio`                 : denominateur nul -> `None`/`ZERO_DENOMINATOR`,
    sans lissage epsilon (cahier:L435).
  - `aggregate_scenarios_then_projects` : ponderation des scenarios A
    L'INTERIEUR du parent AVANT ponderation ENTRE parents (cahier:L435).

Toute l'arithmetique passe par `fractions.Fraction` : les montants et
denombrements sont des entiers exacts (cahier §D.9 : « les depenses utilisent
des entiers exacts, jamais une addition de flottants monetaires »), et les
resultats de ce module heritent de la meme discipline d'exactitude.
"""
from __future__ import annotations

from fractions import Fraction


class NotImplemented_(Exception):
    """Levee par un export declare mais non encore implemente.

    Conservee ici (bien qu'aucun export ne la leve plus) pour compatibilite
    de nommage avec `packages/contracts/src/not-implemented.ts` : un futur
    export ajoute a ce module qui ne serait pas encore pret doit lever cette
    exception plutot qu'un `NotImplementedError` nu, muet sur la capacite en
    cause.
    """

    def __init__(self, capability: str) -> None:
        super().__init__(f"NOT_IMPLEMENTED {capability}")
        self.capability = capability


def _mean(values: list) -> Fraction:
    """Moyenne exacte d'une liste non vide de nombres (int/Fraction)."""
    return Fraction(sum(Fraction(v) for v in values), len(values))


def safe_ratio(numerator: int, denominator: int) -> dict:
    """Ratio exact sans lissage epsilon.

    Denominateur nul (y compris 0/0) produit `{"value": None,
    "status": "ZERO_DENOMINATOR"}`, jamais une exception ni une valeur
    numerique approchee (cahier:L435). Un denominateur sain produit une
    Fraction exacte et `status == "OK"`.
    """
    if denominator == 0:
        return {"value": None, "status": "ZERO_DENOMINATOR"}
    return {"value": Fraction(numerator, denominator), "status": "OK"}


def aggregate_arm_cost_ratio(project_arms: list[dict]) -> dict:
    """Ratio des moyennes (mean_a / mean_b), jamais la moyenne des ratios
    projet par projet (cahier:L435, L113)."""
    costs_a = [row["cost_a"] for row in project_arms]
    costs_b = [row["cost_b"] for row in project_arms]

    mean_a = _mean(costs_a)
    mean_b = _mean(costs_b)

    ratio = safe_ratio(mean_a.numerator * mean_b.denominator, mean_a.denominator * mean_b.numerator)

    return {
        "mean_a": mean_a,
        "mean_b": mean_b,
        "ratio_a_over_b": ratio["value"],
        "ratio_status": ratio["status"],
    }


def aggregate_repetition_rows_by_project(rows: list[dict], metrics: list[str]) -> dict:
    """Moyenne des moyennes PAR PROJET (poids egal par projet), jamais une
    moyenne mise en commun sur toutes les lignes de repetition (cahier:L435,
    L115)."""
    per_project: dict[str, dict[str, Fraction]] = {}
    order: list[str] = []
    buckets: dict[str, dict[str, list]] = {}

    for row in rows:
        project_id = row["project_id"]
        if project_id not in buckets:
            buckets[project_id] = {metric: [] for metric in metrics}
            order.append(project_id)
        for metric in metrics:
            buckets[project_id][metric].append(row[metric])

    for project_id in order:
        per_project[project_id] = {
            metric: _mean(buckets[project_id][metric]) for metric in metrics
        }

    grand_mean = {
        metric: _mean([per_project[project_id][metric] for project_id in order])
        for metric in metrics
    }

    return {"per_project": per_project, "grand_mean": grand_mean}


def aggregate_quality_columns(period_rows: list[dict]) -> dict:
    """V, U et le ratio d'intentions restent trois colonnes distinctes
    (cahier:L435, L107, L111).

    V est la moyenne temporelle de Q sur toutes les periodes fournies. U est
    la moyenne temporelle de R restreinte aux periodes EXPOSEES (R non
    `None`) ; l'exposition est la proportion de periodes exposees. Le ratio
    de reussite par intention agrege les intentions offertes/reussies sur
    l'ensemble des periodes, independamment de U et de l'exposition.
    """
    q_values = [row["Q"] for row in period_rows]
    v = _mean(q_values)

    exposed_r = [row["R"] for row in period_rows if row["R"] is not None]
    exposure = Fraction(len(exposed_r), len(period_rows))
    u = _mean(exposed_r) if exposed_r else None

    total_offered = sum(row["intents_offered"] for row in period_rows)
    total_succeeded = sum(row["intents_succeeded"] for row in period_rows)
    intent_ratio_result = safe_ratio(total_succeeded, total_offered)

    return {
        "V": v,
        "U": u,
        "exposure": exposure,
        "intent_success_ratio": intent_ratio_result["value"],
    }


def aggregate_cost_and_success(trajectory_rows: list[dict]) -> dict:
    """Cout moyen sur TOUTES les trajectoires (echecs inclus) et taux de
    reussite (cahier:L435)."""
    costs = [row["cost"] for row in trajectory_rows]
    succeeded_count = sum(1 for row in trajectory_rows if row["succeeded"])

    mean_cost = _mean(costs)
    success_rate = Fraction(succeeded_count, len(trajectory_rows))

    return {"mean_cost": mean_cost, "success_rate": success_rate}


def aggregate_scenarios_then_projects(parents: list[dict]) -> dict:
    """Ponderation des scenarios A L'INTERIEUR de chaque parent avant
    ponderation ENTRE parents (cahier:L435)."""
    per_parent: dict[str, Fraction] = {}
    order: list[str] = []
    parent_weights: dict[str, Fraction] = {}

    for parent in parents:
        parent_id = parent["parent_id"]
        order.append(parent_id)
        parent_weights[parent_id] = Fraction(parent["parent_weight"])

        weighted_sum = Fraction(0)
        total_weight = Fraction(0)
        for scenario in parent["scenarios"]:
            weight = Fraction(scenario["weight"])
            weighted_sum += Fraction(scenario["value"]) * weight
            total_weight += weight
        per_parent[parent_id] = weighted_sum / total_weight

    grand_weighted_sum = Fraction(0)
    grand_total_weight = Fraction(0)
    for parent_id in order:
        weight = parent_weights[parent_id]
        grand_weighted_sum += per_parent[parent_id] * weight
        grand_total_weight += weight
    grand_mean = grand_weighted_sum / grand_total_weight

    return {"per_parent": per_parent, "grand_mean": grand_mean}


# ============================================================================
# T38 -- inference inter-projets (docs/cahier.md L487-L496 ; docs/specs/T38.md)
#
# ETAGE ROUGE pour cette section : `aggregate_across_parents` et
# `CrossProjectInferenceError` sont le SEUL nouveau contrat qu'analysis/tests/
# test_T38.py (zone ACCEPTANCE, ADR-001) fixe sur ce module (T38.A8, section
# III.5 de la suite) -- aucun export de T32 ci-dessus n'est touche. La forme
# (nom de la fonction, nom et attributs de l'exception) est fixee par cette
# suite ; la regle qui decide QUAND refuser (un seul parent_project_id parmi
# les lignes) reste a ecrire a l'etage VERT. `aggregate_across_parents` leve
# donc immediatement `NotImplemented_`, meme convention que les six exports
# T32 ci-dessus a leur propre etage rouge.
# ============================================================================


class CrossProjectInferenceError(Exception):
    """Refus nomme d'une inference inter-projets (T38.A8, cahier:L493).

    Fixee ici par la forme que la suite exige (section III.5, IV) : deux
    attributs nommes -- `parent_project_id` (le parent unique de l'entree
    refusee) et `trajectory_count` (son nombre de trajectoires) -- et un
    message qui les nomme tous les deux en texte, pour qu'un `str(error)`
    seul suffise a diagnostiquer le refus. La regle qui decide QUAND lever
    cette exception n'est pas encore ecrite (etage ROUGE) : seule la forme
    est fixee, exactement comme `packages/workflows/src/fault-drill.ts` a
    fixe `RunFaultDrillOptions`/`FaultDrillResult` sans implementer
    `runFaultDrill`.
    """

    def __init__(self, parent_project_id: str, trajectory_count: int) -> None:
        super().__init__(
            f"CROSS_PROJECT_INFERENCE_REJECTED parent_project_id={parent_project_id} "
            f"trajectory_count={trajectory_count}"
        )
        self.parent_project_id = parent_project_id
        self.trajectory_count = trajectory_count


def aggregate_across_parents(trajectory_rows: list[dict]) -> dict:
    """Agregation inter-projets a partir de lignes de trajectoire portant
    chacune un `parent_project_id` (T38.A8, cahier:L493) : refuse une entree
    a un seul parent malgre plusieurs trajectoires, accepte une entree a
    plusieurs parents distincts.

    La regle qui decide QUAND refuser (fixee a l'etage VERT, forme deja
    scellee par CrossProjectInferenceError ci-dessus) : le nombre de
    `parent_project_id` DISTINCTS observes, jamais le nombre de trajectoires
    -- golden-six porte six trajectoires pour un seul parent (cahier:L491,
    « un projet ») et doit rester refuse malgre ce compte (T38.A8, « malgre
    six trajectoires », cahier:L493). Un jeu a deux parents distincts ou plus
    n'est PAS refuse (controle de capacite, T38.A8 section III.5) : il produit
    une agregation reelle, groupee par parent, plutot qu'un stub qui leverait
    systematiquement.
    """
    distinct_parents: list[str] = []
    seen: set[str] = set()
    for row in trajectory_rows:
        parent_id = row["parent_project_id"]
        if parent_id not in seen:
            seen.add(parent_id)
            distinct_parents.append(parent_id)

    if len(distinct_parents) <= 1:
        single_parent = distinct_parents[0] if distinct_parents else None
        raise CrossProjectInferenceError(single_parent, len(trajectory_rows))

    per_parent: dict[str, list[str]] = {parent_id: [] for parent_id in distinct_parents}
    for row in trajectory_rows:
        per_parent[row["parent_project_id"]].append(row["trajectory_id"])

    return {
        "parent_project_ids": distinct_parents,
        "trajectory_count": len(trajectory_rows),
        "trajectory_ids_by_parent": per_parent,
    }
