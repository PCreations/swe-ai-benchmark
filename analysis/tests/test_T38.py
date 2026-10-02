"""
Suite d'acceptation T38 -- « Valider six trajectoires completes avec un
resultat chiffre exact » (docs/cahier.md L487-L496 ; docs/specs/T38.md).

ROLE : test-author, AVEUGLE A L'IMPLEMENTATION (ADR-001). Ce fichier ne lit ni
n'importe aucune source de `packages/**`, `apps/**` ni `analysis/src/**`, et ne
les a lus ni directement ni par `git show`. Le contrat teste ci-dessous est
DERIVE de docs/specs/T38.md / docs/cahier.md, et des contrats DEJA PUBLIES par
les suites d'acceptation des dependances directes de T38 (T31/T32, via
analysis/tests/test_T31.py et analysis/tests/test_T32.py) -- lire le contrat
PUBLIE d'une dependance (sa propre suite ACCEPTANCE) n'est pas lire
l'implementation de T38, exactement comme acceptance/T37.spec.ts a repris
`dispatchModelCall` de T17 sans lire packages/gateway.

-----------------------------------------------------------------------------
I. CE QUE LE CAHIER FIXE, MOT POUR MOT

  L489  livrables : « fixture `golden-six`, commande `bench campaign
        fixtures/golden-six.json` et attestation CORE_VERIFIED ». Le CHEMIN
        LITTERAL `fixtures/golden-six.json` et le nom de la commande
        (`campaign`) sont donc PRESCRITS par le cahier -- cette suite les
        reprend tels quels, elle ne les invente pas.
  L491  fixture : « un projet, un scenario de quatre periodes, deux
        configurations scriptees conformes, trois repetitions, deux appels
        F-MONEY par periode. Tous les autres tarifs valent explicitement
        zero [...] Tous les parcours valides et exigences actives sont
        satisfaits. » -> 2 configurations x 3 repetitions = 6 trajectoires,
        6 x 4 = 24 periodes, 6 x 4 x 2 = 48 appels, 2 appels x 340 (F-MONEY,
        cahier:L103) x 4 periodes = 2720 par trajectoire, x 6 = 16320.
  L493  les huit cas d'acceptation, mot pour mot.
  L495  « attestation uniquement apres tous les cas [...] 16320 micro-USD
        sont une verite de TEST, pas une estimation d'une experience reelle. »
  L78   identite complete d'une trajectoire, VERBATIM : « campaign_id /
        parent_project_id / scenario_id / configuration_id / repetition_id
        / budget_id » -- repris tel quel comme noms de champs de sortie.
  L97   enum `attempt_outcome` VERBATIM : `SUCCESS`, `FAILED`, `CANCELLED`.
  L80   montants : chaines d'entiers non negatifs en micro-USD.
  L103  F-MONEY : grille tarifaire et appel de reference (340 ; deux appels
        identiques -> 680) -- racine gelee, importee, jamais retranscrite.
  L111  « une trajectoire indisponible face a des intentions prevues a R=0,
        jamais `null` » -- fonde A6.
  L121  F-FAILURE : K=4, Q_par_periode=[0,0,0,0], R_par_periode=[0,0,0,0],
        lignes_conservees=4 -- racine gelee, importee, reutilisee pour A7.
  L189  « G compte les regressions actuellement ouvertes » -- fonde A4.
  L28   « un echec de prerequis produit BLOCKED, jamais PASS. Une vraie IA
        qui echoue a developper produit un resultat candidat FAILED dans une
        execution du moteur eventuellement valide. Ne pas confondre ces deux
        niveaux. » -- fonde A7 au mot pres : FAILED est un resultat PRODUIT,
        pas un refus d'executer.

-----------------------------------------------------------------------------
II. CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE SUR LA FORME EXACTE (meme geste
    que acceptance/T23.spec.ts fixant les drapeaux de `bench run-period`,
    acceptance/T37.spec.ts fixant `runFaultDrill` : rien de ce qui suit n'a
    ete obtenu en executant une implementation de T38 -- aucune n'existe au
    moment ou cette suite est ecrite)

COMMANDE, en sous-processus, jamais importee comme module (meme raison que
T23/T37 : apps/cli n'a pas a compiler pour que A1 observe un comportement) :

    <entree-cli> campaign fixtures/golden-six.json \\
        --mode recorded --campaign-id <id> \\
        --postgres-database <db> --s3-bucket <bucket> \\
        --workers <1|2|6> \\
        [--test-force-unavailable-period <periode>]   (A6, injection nommee)
        [--test-inject-failure]                        (A7, injection nommee)

`--mode recorded` reprend L21/L247. `--workers` est FIXE ici pour A5, meme
vocabulaire que T26.A5 (« consommation attendue identique avec un, deux ou
six workers »). Les deux drapeaux `--test-*` suivent la convention deja
etablie par `--test-stop-after-phase` de T23 : un POINT D'INJECTION NOMME,
jamais une branche activee par hasard d'environnement.

SORTIE : un unique objet JSON sur stdout, portant AU MOINS :

  execution_mode, cost_origin, corpus_provenance   (L24, toujours)
  worker_count                                     echo de --workers
  trajectory_count, period_count                   (A1)
  model_calls_settled_count                        (A2)
  total_cost_micro_usd                             chaine d'entiers (L80, A3)
  Q, R, V, U, G                                     agregats de campagne (A4)
  trajectories: [ {
      campaign_id, parent_project_id, scenario_id, configuration_id,
      repetition_id, budget_id                      (L78, VERBATIM)
      repetition_index                              entier 1..3, FIXE PAR
                                                     CETTE SUITE pour
                                                     apparier une trajectoire
                                                     entre deux PROCESSUS
                                                     distincts (A5, A6) alors
                                                     que campaign_id/
                                                     repetition_id changent
                                                     a chaque invocation
      attempt_outcome                               litteral de L97
      cost_micro_usd                                chaine d'entiers (L80)
      periods: [ {
          period_index, Q, R, cost_micro_usd, model_calls_settled,
          intents_offered, intents_succeeded
      } ]  -- exactement K=4 entrees (F-FAILURE, L121), MEME pour une
           trajectoire FAILED (« aucune facture imaginaire », L121 ; mais
           aucune ligne supprimee non plus)
  } ]

-----------------------------------------------------------------------------
III. LES DANGERS PROPRES A T38, ET LEUR CONTROLE DANS CETTE SUITE

 (1) A1-A4 PORTENT SUR LA MEME EXECUTION. Le cahier les enonce comme quatre
     proprietes d'UNE fixture (« golden-six »), pas quatre executions
     distinctes -- cette suite execute la campagne nominale UNE SEULE FOIS
     (`_nominal_run`, memoise) et les quatre cas en lisent des facettes
     differentes, exactement comme T11.spec.ts reutilise un seul `bench demo`
     pour plusieurs assertions.
 (2) A5 DOIT COMPARER DES PROCESSUS DIFFERENTS, PAS LA MEME EXECUTION TROIS
     FOIS. `repetition_index` (fixe par cette suite, II) permet d'apparier
     une trajectoire entre trois PROCESSUS independants (1, 2 et 6 workers),
     chacun avec son propre `--campaign-id` / base / bucket -- une execution
     partagee rendrait la comparaison triviale (le meme calcul compare a
     lui-meme), ce que cases.lock.json nomme explicitement comme la
     perturbation a detecter en negatif (totaux partitionnes par worker).
 (3) A6 EXIGE UN CONTROLE POSITIF EN PLUS DE L'OBSERVATION NEGATIVE : avant
     de constater R=0 sous indisponibilite forcee, le cas verifie que LA
     MEME periode, EN NOMINAL, a bien R=1 et des intentions offertes > 0 --
     sans ce controle, une implementation qui renverrait toujours R=0 (ou
     jamais d'intention) verdirait le cas a tort.
 (4) A7 EST UN CAS `behaviour`, PAS `numeric` : F-FAILURE porte une unite de
     cout NON SPECIFIEE (acceptance/reference/F-FAILURE.json,
     `non_fixe_par_le_cahier` / `arbitrages_appliques` SC-001) -- cette
     suite n'exige donc JAMAIS un montant [100,50,0,0] en micro-USD pour la
     trajectoire injectee, seulement les proprietes dimensionless (K=4
     lignes conservees, Q et R nuls par periode) et la terminaison normale
     du PROCESSUS (exit 0) -- la distinction L28 entre BLOCKED et FAILED.
 (5) A8 NE RE-EXECUTE PAS LA CLI : il reutilise les SIX trajectoires de
     l'execution nominale (meme fixture, « cette fixture a un seul parent »,
     cahier:L493) comme entree d'une fonction d'agregation inter-projets
     NOUVELLE (`aggregate.aggregate_across_parents`, FIXEE ICI -- aucun
     contrat existant de T32 ne la couvre, verifie en lisant
     analysis/tests/test_T32.py). Cas `refusal` : un stub qui leve
     systematiquement rendrait le cas vert sans rien prouver -- le CONTROLE
     DE CAPACITE (deux parents distincts n'est PAS refuse) est donc
     obligatoire, meme garde-fou que T00.A4/A5.
 (6) PROVENANCE DES LITTERAUX : tout chiffre compare porte soit un import
     direct de acceptance/reference/F-MONEY.json ou F-FAILURE.json, soit un
     commentaire `# cahier:L<n>`. Les noms de drapeaux/champs FIXES PAR
     CETTE SUITE (section II) ne portent pas de ligne de cahier : ils ne
     sont pas une verite enoncee par le cahier, mais une entree/un nom que
     cette suite choisit, au meme titre que T23 fixant `--campaign-id` ou
     T37 fixant `RECEIPT_RECONCILIATION_REJECTED`.

-----------------------------------------------------------------------------
IV. IDENTIFIANTS PYTHON ET COMPTEUR D'ASSERTIONS (lecons mesurees sur T31)

Chaque cas est nomme `test_T38_A<n>_...` (underscore : un identifiant Python
ne peut pas contenir de point). Le cas A8 (`refusal`) n'utilise jamais
`pytest.raises` seul : le hook `pytest_assertion_pass` ne compte que les
instructions `assert`, donc chaque verification porte un `assert` explicite
sur le contenu de l'exception (son type, le parent nomme, le compte de
trajectoires), jamais seulement sa levee (lecon T31.A7).
"""
from __future__ import annotations

import getpass
import json
import os
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import quote

import aggregate  # module a fournir par analysis/src/aggregate.py (zone IMPL, hors de ce role) -- deja requis par T32
import pytest

from _fixtures import load_reference_fixture

# ============================================================================
# socle : litteraux du cahier (imports de racines gelees, ou `# cahier:L<n>`)
# ============================================================================

F_MONEY = load_reference_fixture("F-MONEY")
F_FAILURE = load_reference_fixture("F-FAILURE")

TWO_CALLS_COST = F_MONEY["valeurs"]["deux_appels_identiques"]["cout_attendu"]["valeur"]  # 680, importe (cahier:L103)
K = F_FAILURE["valeurs"]["K"]["valeur"]  # 4, importe (cahier:L121)
F_FAILURE_Q = F_FAILURE["valeurs"]["Q_par_periode"]["valeur"]  # [0,0,0,0], importe
F_FAILURE_R = F_FAILURE["valeurs"]["R_par_periode"]["valeur"]  # [0,0,0,0], importe
F_FAILURE_ROWS_KEPT = F_FAILURE["valeurs"]["lignes_conservees"]["valeur"]  # 4, importe

MODE = "recorded"  # cahier:L21
SOUS_COMMANDE = "campaign"  # cahier:L489, verbatim
FIXTURE_RELATIVE = "fixtures/golden-six.json"  # cahier:L489, chemin VERBATIM

EXPECTED_TRAJECTORIES = 6  # cahier:L493
EXPECTED_PERIODS = 24  # cahier:L493
EXPECTED_CALLS_PER_PERIOD = 2  # cahier:L491 -- « deux appels F-MONEY par periode »
EXPECTED_TOTAL_CALLS = 48  # cahier:L493
EXPECTED_COST_PER_TRAJECTORY = 2720  # cahier:L493
EXPECTED_TOTAL_COST = 16320  # cahier:L493

ATTEMPT_OUTCOME_SUCCESS = "SUCCESS"  # cahier:L97, verbatim
ATTEMPT_OUTCOME_FAILED = "FAILED"  # cahier:L97, verbatim

FORCED_PERIOD_INDEX = 2  # fixe par cette suite (point d'injection arbitraire pour A6, ni P1 ni P4)

PROC_TIMEOUT_S = 900
BUILD_TIMEOUT_S = 300

# Controles de coherence interne : les grandeurs scellees par le cahier (A2,
# A3) doivent concorder avec la description de la fixture (L491) et K
# (F-FAILURE, L121) -- un desaccord ici signalerait une erreur DANS CETTE
# SUITE, avant meme d'interroger une implementation.
assert EXPECTED_PERIODS == EXPECTED_TRAJECTORIES * K
assert EXPECTED_TOTAL_CALLS == EXPECTED_TRAJECTORIES * K * EXPECTED_CALLS_PER_PERIOD
assert EXPECTED_COST_PER_TRAJECTORY == K * TWO_CALLS_COST
assert EXPECTED_TOTAL_COST == EXPECTED_COST_PER_TRAJECTORY * EXPECTED_TRAJECTORIES


def _repo_root() -> Path:
    # analysis/tests/test_T38.py -> parents[1] == analysis/ -> parents[2] == racine
    return Path(__file__).resolve().parents[2]


REPO = _repo_root()
RUN = f"t38_{os.getpid()}_{int(time.time())}"

# ============================================================================
# decouverte de la commande, observee comme un PROCESSUS (jamais importee)
# ============================================================================


def _cli_entries() -> list[list[str]]:
    entries: list[list[str]] = []
    seen: set[str] = set()
    cli_dir = REPO / "apps" / "cli"

    def add(path: Path) -> None:
        if not path.is_file():
            return
        key = str(path)
        if key in seen:
            return
        seen.add(key)
        entries.append([key])

    manifest = cli_dir / "package.json"
    if manifest.is_file():
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        bin_field = data.get("bin")
        if isinstance(bin_field, str):
            add((cli_dir / bin_field).resolve())
        elif isinstance(bin_field, dict):
            for rel in bin_field.values():
                if isinstance(rel, str):
                    add((cli_dir / rel).resolve())
        main_field = data.get("main")
        if isinstance(main_field, str):
            add((cli_dir / main_field).resolve())
    for rel in ("dist/index.js", "dist/cli.js", "bin/bench.js", "index.js", "src/index.ts"):
        add(cli_dir / rel)
    add(REPO / "tools" / "bench")
    return entries


ENTRIES = _cli_entries()


def _run(argv: list[str], env: dict) -> dict:
    try:
        proc = subprocess.run(
            argv, cwd=REPO, env=env, timeout=PROC_TIMEOUT_S, capture_output=True, text=True
        )
        return {"exit": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
    except subprocess.TimeoutExpired as e:
        return {"exit": None, "stdout": (e.stdout or ""), "stderr": f"TIMEOUT apres {PROC_TIMEOUT_S}s"}
    except OSError as e:
        return {"exit": None, "stdout": "", "stderr": str(e)}


def _json_from(text: str) -> dict | None:
    text = text.strip()
    candidates = [text]
    i, j = text.find("{"), text.rfind("}")
    if i >= 0 and j > i:
        candidates.append(text[i : j + 1])
    for line in reversed(text.splitlines()):
        stripped = line.strip()
        if stripped:
            candidates.append(stripped)
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None


_BUILD_ATTEMPTED = False


def _build_once() -> None:
    global _BUILD_ATTEMPTED
    if _BUILD_ATTEMPTED:
        return
    _BUILD_ATTEMPTED = True
    try:
        subprocess.run(
            ["pnpm", "build"], cwd=REPO, timeout=BUILD_TIMEOUT_S, capture_output=True, text=True
        )
    except (subprocess.TimeoutExpired, OSError):
        pass  # un echec de build se revele dans la seconde tentative d'invocation


# ============================================================================
# PostgreSQL REEL (requires: postgres18) -- meme convention que T23/T37
# ============================================================================


def _socket_dir() -> str:
    host = os.environ.get("PGHOST")
    if host is not None and host.startswith("/") and Path(host).exists():
        return host
    return "/var/run/postgresql"


SOCKET_DIR = _socket_dir()
PG_USER = os.environ.get("PGUSER") or getpass.getuser()


def _dsn(db: str) -> str:
    return f"postgresql://{quote(PG_USER)}@/{quote(db)}?host={quote(SOCKET_DIR)}"


def _psql(db: str, sql: str) -> dict:
    try:
        proc = subprocess.run(
            ["psql", "-tAqX", "-v", "ON_ERROR_STOP=1", "-d", _dsn(db), "-c", sql],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return {"ok": proc.returncode == 0, "out": (proc.stdout + proc.stderr).strip()}
    except (subprocess.TimeoutExpired, OSError) as e:
        return {"ok": False, "out": str(e)}


def _admin_db() -> str:
    for candidate in ("postgres", PG_USER, "template1"):
        if _psql(candidate, "SELECT 1")["ok"]:
            return candidate
    return "postgres"


ADMIN_DB = _admin_db()
_CREATED_DBS: list[str] = []


def _create_db(suffix: str) -> str:
    name = f"bench_{RUN}_{suffix}".lower()[:60]
    _psql(ADMIN_DB, f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    result = _psql(ADMIN_DB, f'CREATE DATABASE "{name}"')
    assert result["ok"], f"POSTGRESQL-INDISPONIBLE {name} : {result['out'][:400]}"  # cahier:L141
    _CREATED_DBS.append(name)
    return name


@pytest.fixture(scope="module", autouse=True)
def _cleanup_databases():
    yield
    for db in list(_CREATED_DBS):
        _psql(ADMIN_DB, f'DROP DATABASE IF EXISTS "{db}" WITH (FORCE)')


# ============================================================================
# invocation de `bench campaign fixtures/golden-six.json`
# ============================================================================

_counter = 0


def _id_for(prefix: str) -> str:
    global _counter
    _counter += 1
    return f"{prefix}-{RUN}-{_counter}"


def _run_campaign(suffix: str, extra_flags: list[str]) -> dict:
    db = _create_db(suffix)
    bucket = f"bench-{RUN}-{suffix}".lower().replace("_", "-")[:60]
    campaign_id = _id_for(f"t38-{suffix}")
    flags = [
        "--mode",
        MODE,
        "--campaign-id",
        campaign_id,
        "--postgres-database",
        db,
        "--s3-bucket",
        bucket,
        *extra_flags,
    ]
    env = {**os.environ, "PGHOST": SOCKET_DIR, "PGUSER": PG_USER}
    attempts: list[str] = []
    fixture_abs = REPO / FIXTURE_RELATIVE
    if not fixture_abs.is_file():
        attempts.append(f"FIXTURE-ABSENTE {fixture_abs} (livrable T38, cahier:L489)")

    def _try_all() -> dict | None:
        for entry in ENTRIES:
            argv = ["node", *entry, SOUS_COMMANDE, FIXTURE_RELATIVE, *flags]
            r = _run(argv, env)
            attempts.append(f"{entry[-1]} exit={r['exit']} : {(r['stdout'] + r['stderr'])[:300]}")
            if r["stdout"]:
                parsed = _json_from(r["stdout"])
                if parsed is not None:
                    return {"ok": True, "json": parsed, "exit": r["exit"]}
        return None

    found = _try_all()
    if found is None:
        _build_once()
        found = _try_all()
    if found is None:
        return {"ok": False, "json": None, "exit": None, "diag": "CAMPAGNE-NON-EXECUTABLE : " + " | ".join(attempts)}
    found["diag"] = " | ".join(attempts)
    return found


_NOMINAL_CACHE: dict | None = None


def _nominal_run() -> dict:
    """La campagne nominale (--workers 1, aucune injection) -- EXECUTEE UNE
    SEULE FOIS et partagee par A1 a A4 (III.1) et comme reference de A5/A6/A8."""
    global _NOMINAL_CACHE
    if _NOMINAL_CACHE is None:
        _NOMINAL_CACHE = _run_campaign("a1a4w1", ["--workers", "1"])
    return _NOMINAL_CACHE


def _periods_sorted(trajectory: dict) -> list[dict]:
    periods = trajectory.get("periods")
    assert isinstance(periods, list), f"PERIODES-ABSENTES dans {trajectory!r}"
    return sorted(periods, key=lambda p: p.get("period_index", 0))


# ============================================================================
# T38.A1 -- six trajectoires et 24 periodes (cahier:L491, L493)
# ============================================================================


def test_T38_A1_six_trajectories_and_24_periods():
    run = _nominal_run()
    assert run["ok"], run["diag"]
    report = run["json"]
    assert isinstance(report, dict), f"SORTIE-NON-OBJET : {report!r}"

    assert report.get("execution_mode") == MODE, f"execution_mode attendu {MODE!r}, vu {report.get('execution_mode')!r}"  # cahier:L24/L21
    assert report.get("cost_origin") is not None, f"cost_origin ABSENT (cahier:L24) : {report!r}"
    assert report.get("corpus_provenance") is not None, f"corpus_provenance ABSENT (cahier:L24) : {report!r}"

    trajectories = report.get("trajectories")
    assert isinstance(trajectories, list), f"TRAJECTOIRES-ABSENTES : {report!r}"
    assert len(trajectories) == EXPECTED_TRAJECTORIES, (
        f"attendu {EXPECTED_TRAJECTORIES} trajectoires (cahier:L493), vu {len(trajectories)}"
    )

    configs: dict[str, set] = {}
    for t in trajectories:
        for champ in ("campaign_id", "parent_project_id", "scenario_id", "configuration_id", "repetition_id", "budget_id"):
            assert t.get(champ) is not None, f"IDENTITE-INCOMPLETE (cahier:L78) champ={champ} manquant dans {t!r}"
        configs.setdefault(t["configuration_id"], set()).add(t["repetition_id"])

    assert len(configs) == 2, f"attendu 2 configurations scriptees (cahier:L491), vu {len(configs)} : {configs!r}"
    for cfg, reps in configs.items():
        assert len(reps) == 3, f"attendu 3 repetitions pour {cfg} (cahier:L491), vu {len(reps)} : {reps!r}"

    total_periods = 0
    for t in trajectories:
        periods = _periods_sorted(t)
        assert len(periods) == K, f"attendu K={K} periodes (F-FAILURE, cahier:L121) pour {t['configuration_id']}, vu {len(periods)}"
        total_periods += len(periods)

    assert total_periods == EXPECTED_PERIODS, f"attendu {EXPECTED_PERIODS} periodes au total (cahier:L493), vu {total_periods}"
    assert report.get("trajectory_count") == EXPECTED_TRAJECTORIES, (
        f"trajectory_count declare {report.get('trajectory_count')!r} != compte reel {EXPECTED_TRAJECTORIES}"
    )
    assert report.get("period_count") == EXPECTED_PERIODS, (
        f"period_count declare {report.get('period_count')!r} != compte reel {EXPECTED_PERIODS}"
    )


# ============================================================================
# T38.A2 -- 48 appels recus et regles (cahier:L493)
# ============================================================================


def test_T38_A2_forty_eight_model_calls_received_and_settled():
    run = _nominal_run()
    assert run["ok"], run["diag"]
    report = run["json"]

    reported_total = report.get("model_calls_settled_count")
    assert reported_total is not None, f"model_calls_settled_count ABSENT : {report!r}"
    assert int(reported_total) == EXPECTED_TOTAL_CALLS, (
        f"attendu {EXPECTED_TOTAL_CALLS} appels regles (cahier:L493), vu {reported_total!r}"
    )

    observed_total = 0
    for t in report["trajectories"]:
        for p in _periods_sorted(t):
            settled = p.get("model_calls_settled")
            assert settled is not None, f"model_calls_settled ABSENT pour periode {p!r}"
            assert int(settled) == EXPECTED_CALLS_PER_PERIOD, (
                f"attendu {EXPECTED_CALLS_PER_PERIOD} appels par periode (cahier:L491), vu {settled!r} dans {p!r}"
            )
            observed_total += int(settled)

    assert observed_total == EXPECTED_TOTAL_CALLS, (
        f"somme reelle des appels par periode ({observed_total}) != {EXPECTED_TOTAL_CALLS} (cahier:L493)"
    )


# ============================================================================
# T38.A3 -- 2720 micro-USD par trajectoire, 16320 au total (cahier:L493)
# ============================================================================


def test_T38_A3_each_trajectory_costs_2720_total_16320():
    run = _nominal_run()
    assert run["ok"], run["diag"]
    report = run["json"]

    per_trajectory_costs = []
    for t in report["trajectories"]:
        raw = t.get("cost_micro_usd")
        assert isinstance(raw, str) and re.fullmatch(r"[0-9]+", raw), (
            f"MONTANT-NON-CONFORME (cahier:L80, chaine d'entiers non negatifs) : {raw!r} dans {t!r}"
        )
        # Egalite de CHAINE, pas seulement numerique (lecon T31.A2) : un
        # transit flottant naif produirait "2720.0000000002" ou "2720.0".
        assert raw == str(EXPECTED_COST_PER_TRAJECTORY), (
            f"attendu cout-trajectoire={EXPECTED_COST_PER_TRAJECTORY} (cahier:L493), vu {raw!r} dans {t!r}"
        )
        per_trajectory_costs.append(int(raw))

        # Controle croise, periode par periode : 2 appels x 340 = 680/periode.
        for p in _periods_sorted(t):
            raw_period = p.get("cost_micro_usd")
            assert isinstance(raw_period, str) and raw_period == str(TWO_CALLS_COST), (
                f"attendu cout-periode={TWO_CALLS_COST} (F-MONEY, cahier:L103), vu {raw_period!r} dans {p!r}"
            )

    assert sum(per_trajectory_costs) == EXPECTED_TOTAL_COST

    reported_total = report.get("total_cost_micro_usd")
    assert isinstance(reported_total, str) and reported_total == str(EXPECTED_TOTAL_COST), (
        f"attendu total_cost_micro_usd={EXPECTED_TOTAL_COST} (cahier:L493), vu {reported_total!r}"
    )


# ============================================================================
# T38.A4 -- Q=R=V=U=1 et G=0 (cahier:L493, L491 : « tous les parcours [...]
# sont satisfaits » ; G : cahier:L189)
# ============================================================================


def test_T38_A4_q_r_v_u_equal_one_and_g_zero():
    run = _nominal_run()
    assert run["ok"], run["diag"]
    report = run["json"]

    for champ in ("Q", "R", "V", "U"):
        value = report.get(champ)
        assert value is not None, f"CHAMP-ABSENT {champ} : {report!r}"
        assert value == 1, f"attendu {champ}=1 (cahier:L493), vu {value!r}"

    g_value = report.get("G")
    assert g_value is not None, f"CHAMP-ABSENT G : {report!r}"
    assert g_value == 0, f"attendu G=0 (cahier:L493 ; G compte les regressions ouvertes, cahier:L189), vu {g_value!r}"

    # Controle independant : chaque periode de chaque trajectoire porte
    # elle-meme Q=1 et R=1, pas seulement l'agregat sommital (qui pourrait
    # moyenner des periodes a 0 et 2 pour retomber sur 1 par accident).
    for t in report["trajectories"]:
        for p in _periods_sorted(t):
            assert p.get("Q") == 1, f"Q-PERIODE != 1 dans {p!r} (trajectoire {t.get('configuration_id')})"
            assert p.get("R") == 1, f"R-PERIODE != 1 dans {p!r} (trajectoire {t.get('configuration_id')})"


# ============================================================================
# T38.A5 -- un, deux et six workers donnent memes resultats, comptes et
# verdicts (cahier:L493 ; meme principe que T26.A5)
# ============================================================================


def _canonical_projection(report: dict) -> dict:
    per_trajectory = {}
    for t in report["trajectories"]:
        key = (t.get("configuration_id"), t.get("repetition_index"))
        assert key[0] is not None and key[1] is not None, f"PROJECTION-SANS-CLE (repetition_index, II) : {t!r}"
        per_trajectory[key] = {
            "attempt_outcome": t.get("attempt_outcome"),
            "cost_micro_usd": t.get("cost_micro_usd"),
            "periods": [
                {"Q": p.get("Q"), "R": p.get("R"), "cost_micro_usd": p.get("cost_micro_usd")}
                for p in _periods_sorted(t)
            ],
        }
    return {
        "trajectory_count": report.get("trajectory_count"),
        "period_count": report.get("period_count"),
        "model_calls_settled_count": report.get("model_calls_settled_count"),
        "total_cost_micro_usd": report.get("total_cost_micro_usd"),
        "Q": report.get("Q"),
        "R": report.get("R"),
        "V": report.get("V"),
        "U": report.get("U"),
        "G": report.get("G"),
        "per_trajectory": per_trajectory,
    }


def test_T38_A5_one_two_six_workers_give_identical_business_results():
    run1 = _nominal_run()  # --workers 1
    assert run1["ok"], run1["diag"]
    run2 = _run_campaign("a5w2", ["--workers", "2"])
    assert run2["ok"], run2["diag"]
    run6 = _run_campaign("a5w6", ["--workers", "6"])
    assert run6["ok"], run6["diag"]

    assert run1["json"].get("worker_count") == 1, f"worker_count non reperecute (run 1) : {run1['json'].get('worker_count')!r}"
    assert run2["json"].get("worker_count") == 2, f"worker_count non reperecute (run 2) : {run2['json'].get('worker_count')!r}"
    assert run6["json"].get("worker_count") == 6, f"worker_count non reperecute (run 6) : {run6['json'].get('worker_count')!r}"

    proj1 = _canonical_projection(run1["json"])
    proj2 = _canonical_projection(run2["json"])
    proj6 = _canonical_projection(run6["json"])

    assert proj1 == proj2, f"DIVERGENCE 1 vs 2 workers (cahier:L493 A5) : {proj1!r} != {proj2!r}"
    assert proj1 == proj6, f"DIVERGENCE 1 vs 6 workers (cahier:L493 A5) : {proj1!r} != {proj6!r}"


# ============================================================================
# T38.A6 -- application indisponible forcee pendant un workload conserve
# toutes ses intentions et fait baisser R (cahier:L493 ; R=0, cahier:L111)
# ============================================================================


def test_T38_A6_forced_unavailability_keeps_intents_and_lowers_r():
    base = _nominal_run()
    assert base["ok"], base["diag"]
    forced = _run_campaign(
        "a6", ["--workers", "1", "--test-force-unavailable-period", str(FORCED_PERIOD_INDEX)]
    )
    assert forced["ok"], forced["diag"]

    def _period_at(report: dict, period_index: int) -> dict:
        out = {}
        for t in report["trajectories"]:
            key = (t.get("configuration_id"), t.get("repetition_index"))
            for p in t["periods"]:
                if p.get("period_index") == period_index:
                    out[key] = p
        return out

    base_periods = _period_at(base["json"], FORCED_PERIOD_INDEX)
    forced_periods = _period_at(forced["json"], FORCED_PERIOD_INDEX)
    assert len(base_periods) == EXPECTED_TRAJECTORIES, f"PROJECTION-NOMINALE-INCOMPLETE : {base_periods!r}"
    assert len(forced_periods) == EXPECTED_TRAJECTORIES, f"PROJECTION-FORCEE-INCOMPLETE : {forced_periods!r}"

    for key, b in base_periods.items():
        f = forced_periods.get(key)
        assert f is not None, f"TRAJECTOIRE-ABSENTE-DU-RUN-FORCE {key!r}"

        # Controle (III.3) : la periode nominale est bien pleinement
        # disponible, sans quoi une baisse de R ne prouverait rien.
        assert b.get("R") == 1, f"CONTROLE-INVALIDE R-nominal != 1 pour {key!r} : {b!r}"
        offered_nominal = b.get("intents_offered")
        assert offered_nominal is not None and offered_nominal > 0, (
            f"CONTROLE-INVALIDE aucune intention offerte en nominal pour {key!r} : {b!r}"
        )

        # cahier:L111 -- « une trajectoire indisponible face a des
        # intentions prevues a R=0, jamais null ».
        assert f.get("R") == 0, f"R-NON-NUL-SOUS-INDISPONIBILITE-FORCEE pour {key!r} : {f!r}"

        # cahier:L493 A6 -- « conserve toutes ses intentions » : le compte
        # d'intentions OFFERTES pendant la panne reste identique au nominal.
        assert f.get("intents_offered") == offered_nominal, (
            f"INTENTIONS-PERDUES pour {key!r} : nominal={offered_nominal} force={f.get('intents_offered')!r}"
        )
        assert f.get("intents_succeeded") == 0, (
            f"REUSSITES-NON-NULLES SOUS INDISPONIBILITE FORCEE pour {key!r} : {f!r}"
        )


# ============================================================================
# T38.A7 -- F-FAILURE produit un echec produit dans une execution moteur
# terminee (cahier:L493 ; distinction BLOCKED/FAILED, cahier:L28)
# ============================================================================


def test_T38_A7_f_failure_profile_yields_a_recorded_failed_outcome_in_a_completed_run():
    run = _run_campaign("a7", ["--workers", "1", "--test-inject-failure"])
    # cahier:L493/L28 -- « un echec PRODUIT [...] dans une execution MOTEUR
    # [...] terminee » : le PROCESSUS lui-meme se termine normalement.
    assert run["ok"], run["diag"]
    assert run["exit"] == 0, f"PROCESSUS-EN-ECHEC exit={run['exit']!r} : {run['diag']}"

    report = run["json"]
    trajectories = report["trajectories"]
    failed = [t for t in trajectories if t.get("attempt_outcome") == ATTEMPT_OUTCOME_FAILED]  # cahier:L97
    succeeded = [t for t in trajectories if t.get("attempt_outcome") == ATTEMPT_OUTCOME_SUCCESS]  # cahier:L97

    assert len(failed) == 1, f"attendu EXACTEMENT une trajectoire FAILED, vu {len(failed)} : {trajectories!r}"
    assert len(succeeded) == EXPECTED_TRAJECTORIES - 1, (
        f"attendu {EXPECTED_TRAJECTORIES - 1} trajectoires SUCCESS inchangees, vu {len(succeeded)}"
    )

    failed_traj = failed[0]
    periods = _periods_sorted(failed_traj)
    assert len(periods) == F_FAILURE_ROWS_KEPT, (
        f"attendu {F_FAILURE_ROWS_KEPT} periodes CONSERVEES meme en echec (F-FAILURE, cahier:L121), vu {len(periods)}"
    )
    observed_q = [p.get("Q") for p in periods]
    observed_r = [p.get("R") for p in periods]
    assert observed_q == F_FAILURE_Q, f"Q_PAR_PERIODE != F-FAILURE (cahier:L121) : {observed_q!r}"
    assert observed_r == F_FAILURE_R, f"R_PAR_PERIODE != F-FAILURE (cahier:L121) : {observed_r!r}"

    # Les autres trajectoires restent nominales : l'echec est LOCAL a la
    # trajectoire injectee, pas une degradation de l'execution entiere.
    for t in succeeded:
        for p in _periods_sorted(t):
            assert p.get("Q") == 1 and p.get("R") == 1, (
                f"CONTAMINATION-TRAJECTOIRE-SAINE {t.get('configuration_id')!r} : {p!r}"
            )


# ============================================================================
# T38.A8 -- inference interprojets refusee sur cette fixture a un seul
# parent, malgre six trajectoires (cahier:L493)
# ============================================================================


def test_T38_A8_cross_project_inference_is_refused_on_a_single_parent_fixture():
    run = _nominal_run()
    assert run["ok"], run["diag"]
    trajectories = run["json"]["trajectories"]

    rows = [
        {
            "parent_project_id": t.get("parent_project_id"),
            "trajectory_id": f"{t.get('configuration_id')}/{t.get('repetition_id')}",
        }
        for t in trajectories
    ]
    assert len(rows) == EXPECTED_TRAJECTORIES, (
        f"attendu {EXPECTED_TRAJECTORIES} trajectoires pour A8 (cahier:L493 « malgre six trajectoires »), vu {len(rows)}"
    )
    parent_ids = {r["parent_project_id"] for r in rows}
    assert all(pid is not None for pid in parent_ids), f"PARENT-ABSENT (cahier:L78) dans {rows!r}"
    assert len(parent_ids) == 1, (
        f"CONTROLE-INVALIDE : golden-six doit avoir UN SEUL parent (cahier:L491 « un projet »), vu {parent_ids!r}"
    )
    single_parent = next(iter(parent_ids))

    # Controle de capacite (III.5) : un jeu a DEUX parents distincts ne doit
    # PAS etre refuse -- sinon une implementation qui refuse systematiquement
    # verdirait ce cas sans rien prouver (meme garde-fou que T00.A4/A5).
    multi_parent_rows = rows + [
        {"parent_project_id": "projet-controle-ad-hoc", "trajectory_id": "controle-1"},
        {"parent_project_id": "projet-controle-ad-hoc", "trajectory_id": "controle-2"},
    ]
    capacity_result = aggregate.aggregate_across_parents(multi_parent_rows)
    assert isinstance(capacity_result, dict), (
        f"CONTROLE-DE-CAPACITE-EN-ECHEC : deux parents distincts n'a produit aucun resultat exploitable : {capacity_result!r}"
    )

    with pytest.raises(aggregate.CrossProjectInferenceError) as exc_info:
        aggregate.aggregate_across_parents(rows)

    # Lecon T31.A7 : `pytest.raises` seul ne compte AUCUNE assertion (le hook
    # `pytest_assertion_pass` ne se declenche que sur `assert`) et n'affirme
    # pas CE QUI est refuse -- ces `assert` explicites observent le contenu
    # de l'erreur : le parent unique et le compte de trajectoires nommes.
    error = exc_info.value
    assert getattr(error, "parent_project_id", None) == single_parent, (
        f"ERREUR-SANS-PARENT-NOMME : attendu {single_parent!r}, vu {getattr(error, 'parent_project_id', None)!r}"
    )
    assert getattr(error, "trajectory_count", None) == EXPECTED_TRAJECTORIES, (
        f"ERREUR-SANS-COMPTE-NOMME : attendu {EXPECTED_TRAJECTORIES}, vu {getattr(error, 'trajectory_count', None)!r}"
    )
    message = str(error)
    assert single_parent in message, f"MESSAGE-NE-NOMME-PAS-LE-PARENT : {message!r}"
    assert str(EXPECTED_TRAJECTORIES) in message, f"MESSAGE-NE-NOMME-PAS-LE-COMPTE : {message!r}"
