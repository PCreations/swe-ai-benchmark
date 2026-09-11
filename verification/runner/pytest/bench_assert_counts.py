# ─────────────────────────────────────────────────────────────────────────────
# bench_assert_counts — le compteur d'assertions de la chaîne pytest.
#
# POURQUOI CE FICHIER EXISTE. §G l.139 : « un programme qui écrit seulement
# `passed=true`, un test avec zéro assertion […] ne satisfait pas le contrat ».
# Le rapport JUnit que pytest produit ne porte AUCUN compteur d'assertions : un
# `def test_x(): pass` y est un `<testcase>` sans enfant, indiscernable d'un
# test qui a réellement vérifié quelque chose. Sans ce plugin, la chaîne pytest
# serait le trou par lequel la règle « zéro assertion ne suffit pas » ne
# s'appliquerait qu'à Jest.
#
# COMMENT. `pytest_assertion_pass` est appelé une fois par `assert` RÉUSSI dans
# un module de test réécrit, quand `enable_assertion_pass_hook = true` est posé
# dans la configuration (analysis/pyproject.toml). Les assertions qui échouent
# ne passent pas par ce hook : elles sont comptées via le rapport d'appel, parce
# qu'elles ont été exécutées elles aussi.
#
# LIMITE ASSUMÉE, ET NOMMÉE. Le hook ne voit que les `assert` réécrits par
# pytest. Un test qui ne vérifierait que par `unittest.TestCase.assertEqual` ou
# par un `with pytest.raises(...)` sans `assert` serait compté à zéro, donc
# refusé comme creux. C'est fail-closed : le refus est bruyant et se corrige en
# écrivant un `assert`, alors que l'erreur inverse — compter une assertion qui
# n'a pas eu lieu — se corrige en ne s'apercevant de rien.
#
# Le compteur est écrit dans le fichier que nomme `BENCH_ASSERT_COUNTS`, sous le
# répertoire de run à nonce : comme tout rapport machine consommé par le
# vérificateur, il est produit PAR CE RUN et par aucun autre.
# ─────────────────────────────────────────────────────────────────────────────
import json
import os

_counts: "dict[str, int]" = {}
_seen: "set[str]" = set()


def pytest_assertion_pass(item, lineno, orig, expl):  # noqa: ARG001
    _counts[item.nodeid] = _counts.get(item.nodeid, 0) + 1


def pytest_runtest_logreport(report):
    if report.when != "call":
        return
    _seen.add(report.nodeid)
    # Une assertion qui échoue a bel et bien été exécutée ; le hook ci-dessus ne
    # la voit pas. Elle est comptée ici pour que le compteur mesure « assertions
    # exécutées » et non « assertions réussies ».
    if report.failed:
        _counts[report.nodeid] = _counts.get(report.nodeid, 0) + 1


def pytest_sessionfinish(session, exitstatus):  # noqa: ARG001
    out = os.environ.get("BENCH_ASSERT_COUNTS")
    if not out:
        return
    records = [
        {
            "nodeid": nodeid,
            "name": nodeid.rsplit("::", 1)[-1],
            "asserts": _counts.get(nodeid, 0),
        }
        for nodeid in sorted(_seen | set(_counts))
    ]
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"schema": "bench.asserts/1", "tests": records}, fh, sort_keys=True)
