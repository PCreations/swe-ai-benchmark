/**
 * acceptance/T42.spec.ts — suite d'acceptation de la tache T42.
 *
 * Cas requis (verification/cases.lock.json, gele, cahier_line 527) :
 *   T42.A1 artifact  — les 42 taches precedentes (T00..T41) possedent leurs
 *                      preuves COURANTES
 *   T42.A2 behaviour — le pack golden-six se rejoue depuis une installation
 *                      vierge
 *   T42.A3 refusal   — une version volontairement alteree du calcul de cout,
 *                      de la garde de revelation, du denominateur R, de
 *                      l'appariement statistique et de l'etat UNKNOWN echoue
 *                      CHACUNE au gate concerne
 *   T42.A4 behaviour — reconstruction du rapport depuis les SEULS exports
 *                      donne les memes valeurs
 *   T42.A5 behaviour — verifier un echantillon FIXE de checkpoints sur un
 *                      processus NEUF
 *   T42.A6 absence   — aucune attestation LIVE_VALIDATED si aucun recu live
 *                      n'existe
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T42 — `acceptance`, `verification`,
 * `docs` — et ne les a lus ni directement ni par `git show` (ADR-001 :
 * aveuglement PROCEDURAL, discipline auditable au diff, pas barriere
 * technique). T42 n'a PAS de livrable sous `packages/**`/`apps/**` : ses
 * livrables (cahier:L525) sont « un jeu d'acceptation final [...], des
 * scripts de rejeu et un rapport d'audit », c'est-a-dire ce fichier
 * lui-meme plus du HARNESS/DOCS a venir. Le contrat teste ci-dessous est
 * derive de docs/specs/T42.md et du cahier :
 *
 *   L523-L529  titre, dependances (« T00 a T41 »), livrables et les six cas
 *              d'acceptation, mot pour mot — et la fin : « l'independance
 *              signifie ici donnees de reference et verification exterieure
 *              au candidat [...] aucune derogation subjective aux sorties
 *              attendues ».
 *   L17-L24    §B VERBATIM : modes `recorded`/`live`, `execution_mode` /
 *              `cost_origin` / `corpus_provenance` TOUJOURS presents.
 *   L26        « Etats a publier separement : CORE_VERIFIED apres T38 ;
 *              PILOT_READY apres T39 et T40 ; HANDOFF_COMPLETE apres T43.
 *              LIVE_VALIDATED est une attestation SUPPLEMENTAIRE, seulement
 *              si un smoke test reel a effectivement ete execute [...] » —
 *              fonde A6 au mot pres.
 *   L28        « un defaut de prerequis produit BLOCKED, jamais PASS ».
 *   L139/L153  « une preuve comporte des sorties effectivement observees »,
 *              « un programme qui ecrit seulement passed=true [...] ne
 *              satisfait pas le contrat » — fonde le refus de toute
 *              assertion vide dans cette suite.
 *   L487-L496  T38 VERBATIM : fixture `golden-six`, commande `bench campaign
 *              fixtures/golden-six.json`, 6 trajectoires, 24 periodes, 48
 *              appels, 2720/16320 micro-USD, Q=R=V=U=1, G=0 — repris tel
 *              quel (A2), jamais retranscrit a la main : lu dans
 *              `acceptance/reference/F-MONEY.json` et
 *              `acceptance/reference/F-FAILURE.json`, et verifie contre
 *              `fixtures/golden-six.json` avant tout usage (section 0).
 *   L513-L521  T41 VERBATIM : les 14 commandes minimales de la CLI, dont
 *              `checkpoint inspect`, `checkpoint fork`, `analysis export`,
 *              `analysis run`, `report build` — ces cinq-la ne sont exercees
 *              QUE par A7 dans acceptance/T41.spec.ts (existence documentee/
 *              parsee) : cette suite est la PREMIERE a les exercer
 *              reellement, ce qui est la raison d'etre de T42.
 *   L119/L123/L125  F-RESERVATION : horloge, acteurs, creneau, P1..P4 — fonde
 *              le choix de `run-period` (T23, PROUVEE) comme generateur de
 *              la trajectoire a quatre periodes verifiees par A5.
 *   L78        identite complete d'une trajectoire, VERBATIM — champs
 *              repris pour la correlation (A5).
 *   L157       `CheckpointManifest` : « schema, code, donnees, fichiers,
 *              files, memoire, horloge, exigences, backlog, versions et
 *              empreintes » — fonde les champs compares par A5 (horloge,
 *              exigences, version active).
 *   L525/L567-L612  Table §J : T42 depend de T00 a T41 — verifiee contre le
 *              registre REEL (section 0), jamais une liste recopiee a la
 *              main sans controle.
 *
 * Contrats DEJA PUBLIES par des dependances directes, relus (jamais
 * l'implementation) et REUTILISES tels quels, exactement comme
 * `acceptance/T41.spec.ts` relit `verification/runner/doctor.mjs` et
 * `acceptance/T39.spec.ts` relit `dispatchModelCall` de T17 :
 *
 *   - `verification/runner/resume.mjs` / `ledger.mjs` (HARNESS, deja la
 *     seule autorite de CLAUDE.md : « la seule regle : pnpm bench resume »)
 *     — A1 relit `node tools/bench resume --json`, jamais sa propre
 *     reimplementation du calcul PROVEN/STALE/WAITING.
 *   - `test_T38.py` (dependances T38) — commande et schema JSON de
 *     `bench campaign fixtures/golden-six.json`, VERBATIM (section II.1).
 *   - `acceptance/T23.spec.ts` (dependance de T42 via T38/T41) — commande et
 *     schema JSON de `run-period`, VERBATIM (section II.3), observes en
 *     executant reellement `run-period` quatre fois (jamais en lisant
 *     packages/activities ni apps/cli).
 *   - `acceptance/T16.spec.ts`, `T06.spec.ts`, `T04.spec.ts`, `T17.spec.ts`,
 *     `analysis/tests/test_T33.py` — cette suite ne lit que leur EN-TETE
 *     (nom du cas requis, ligne de cahier) pour construire un filtre `-t`/
 *     `-k`, jamais leur corps : le gate REEL est celui que Jest/pytest
 *     executent, pas une reimplementation.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE SUR LA FORME EXACTE (aucune
 * implementation de ces cinq commandes n'existe au moment ou cette suite est
 * ecrite — `node apps/cli/dist/index.js --help`, observe en executant le
 * binaire reel jamais en lisant son code source, imprime litteralement
 * « PAS ENCORE IMPLEMENTEE : leve NOT_IMPLEMENTED » sous chacune d'elles) :
 *
 * 1. `campaign fixtures/golden-six.json --mode recorded --campaign-id <id>
 *     --postgres-database <db> --s3-bucket <bucket> --workers <1|2|6>` —
 *    REPRIS VERBATIM de T38 (cahier:L489, deja implemente et PROUVE,
 *    confirme par `--help` : AUCUNE mention « PAS ENCORE IMPLEMENTEE » sous
 *    cette entree). Schema de sortie VERBATIM de `test_T38.py` section II :
 *    trajectory_count, period_count, model_calls_settled_count,
 *    total_cost_micro_usd, Q/R/V/U/G, trajectories[{configuration_id,
 *    repetition_index, cost_micro_usd, periods[{period_index, Q, R,
 *    cost_micro_usd, model_calls_settled}]}]. « Installation vierge »
 *    (A2) = base PostgreSQL et seau S3 CREES pour cette suite SEULE (jamais
 *    reutilises d'un run anterieur), namespaces par `RUN` (PID+horodatage).
 *
 * 2. `analysis export --postgres-database <db>` et `analysis run
 *     <export.json>` — SQUELETTE (`--postgres-database <db>` / un chemin de
 *    fichier positionnel) deja fixe par T41 et observe via `--help` ;
 *    AUCUN schema de sortie n'etant publie, cette suite fixe : `analysis
 *    export` imprime sur stdout `{ schema, campaigns: [{ campaign_id,
 *    trajectories: [{ configuration_id, repetition_index, cost_micro_usd,
 *    periods: [{ period_index, Q, R, cost_micro_usd, model_calls_settled
 *    }] }] }] }` ; cette suite l'ecrit dans un fichier temporaire et
 *    l'injecte comme UNIQUE argument de `analysis run`, qui n'accepte NI
 *    `--postgres-database` NI `--s3-bucket` (absents du squelette T41) —
 *    cette absence memee est la garantie structurelle de « depuis les seuls
 *    exports » (A4), renforcee ici en pointant `PGHOST`/`S3_ENDPOINT` vers
 *    des cibles injoignables pendant l'appel. `analysis run` imprime `{
 *    schema, trajectory_count, period_count, model_calls_settled_count,
 *    total_cost_micro_usd, Q, R, V, U, G }` — MEME vocabulaire que le
 *    rapport de `campaign` (section II.1), pour une comparaison directe.
 *
 * 3. `checkpoint inspect --campaign-id <id> --postgres-database <db>
 *     --checkpoint-id <id>` — le squelette T41 (observe via `--help`) ne
 *    porte que `--campaign-id`/`--postgres-database` : CETTE SUITE AJOUTE
 *    `--checkpoint-id`, sans lequel deux checkpoints PUBLIES sous la MEME
 *    campagne seraient indiscernables et l'« echantillon fixe » de deux
 *    checkpoints (A5) retomberait sur un seul. Sortie fixee : `{
 *    checkpoint_id, campaign_id, period_index, business_clock,
 *    active_version_id, Q, R, requirements: [{ id, version, satisfied }] }`
 *    — VOCABULAIRE REPRIS TEL QUEL du rapport DEJA PUBLIE (PROUVE) de
 *    `run-period` (T23, cahier:L353-L359, schema `bench.t23.period_result/1`
 *    observe en executant reellement la commande, jamais en lisant son
 *    code), et des champs minimaux de `CheckpointManifest` (cahier:L157 :
 *    « horloge, exigences [...] versions »).
 *
 * 4. `report build <analysis.json> [--live-receipts <recus.json>]` — le
 *    squelette T41 (observe via `--help`) ne porte qu'un chemin
 *    positionnel : CETTE SUITE AJOUTE `--live-receipts`, sans lequel aucun
 *    gate ne pourrait jamais exercer le COTE PRESENT de cahier:L26 (« [...]
 *    seulement si un smoke test reel a effectivement ete execute avec
 *    modele, date, budgets et factures identifies »). Un recu est `{
 *    model, date, budget_micro_usd, invoice_id }` — les quatre identifiants
 *    nommes par cette meme ligne du cahier, mot pour mot. Sortie fixee :
 *    `{ schema, states: { CORE_VERIFIED: {published, reason},
 *    PILOT_READY: {...}, HANDOFF_COMPLETE: {...}, LIVE_VALIDATED:
 *    {published, reason, receipts_count} } }` — les QUATRE noms d'etat sont
 *    ceux de cahier:L26, verbatim.
 *
 * Aucun de ces noms de drapeau ou de champ n'a ete obtenu en executant une
 * implementation qui les produirait deja : les cinq commandes qu'ils
 * composent levent `NOT_IMPLEMENTED` au moment ou cette suite est ecrite
 * (verifie par `--help`, jamais par lecture de code).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LE REFUS N'EST PAS UNE COMPETENCE — DANGERS PROPRES A CHAQUE CAS
 *
 * (A1) cases.lock.json : « muter l'archive d'attestations [...] sans toucher
 *      aucun export metier : rouge exige ». Cette suite n'invente donc PAS
 *      sa propre notion de « preuve courante » : elle relit la SEULE
 *      autorite du depot (`node tools/bench resume --json`, CLAUDE.md) et
 *      compare, PAR TACHE, les 42 identifiants de `verification/
 *      tasks.json#T42.depends_on` (eux-memes verifies contre cahier:L525
 *      « T00 a T41 », section 0) a `proven`. Une seule egalite d'ensemble
 *      masquerait LAQUELLE des 42 manque ; cette suite boucle donc tache
 *      par tache, avec un message qui NOMME la tache absente ou mal classee
 *      — jamais un simple `toBe(true)`.
 * (A2) « le pack golden-six se rejoue » n'est pas juste « la commande
 *      s'execute » : cette suite exige l'EGALITE EXACTE (chaines d'entiers
 *      comparees en chaine, lecon T31.A2 : un transit flottant produirait
 *      "16320.0000000002") aux valeurs cahier:L493, jamais une tolerance.
 * (A3) cases.lock.json : « un stub qui leve ferait echouer TOUS les mutants
 *      et garderait ce cas vert a TORT ». Cette suite ne stube donc RIEN :
 *      elle fait tourner REELLEMENT les cinq suites deja PROUVEES, filtrees
 *      sur le SEUL cas nomme (meme regex que `verification/runner/
 *      chains.mjs#caseMatcher` : `Txx[._]Ay(?!\d)`), et exige, par le
 *      RAPPORT MACHINE (jamais le code de sortie seul — meme regle que
 *      `verification/runner/red.mjs`) : exactement un test ATTEINT, PASSE,
 *      et nommement celui attendu. Un filtre qui matcherait zero ou deux
 *      tests est un refus EN SOI (TACHE-INATTENDUE), pas un succes par
 *      defaut.
 * (A4) cases.lock.json : « stuber les exports consommes [...] alors que le
 *      rapport de reference reste celui de la fixture : les valeurs
 *      reconstruites ne coincident plus ». Cette suite compare donc les
 *      valeurs RECONSTRUITES par `analysis run` (depuis un fichier
 *      d'export, PostgreSQL deliberement injoignable pendant l'appel) aux
 *      valeurs PUBLIEES par `campaign` (memoire du PROCESSUS campagne,
 *      jamais relu depuis PostgreSQL) : deux CHEMINS DE CODE independants,
 *      jamais la meme valeur comparee a elle-meme.
 * (A5) cases.lock.json : « stuber [...] pour qu'il renvoie un ensemble vide,
 *      donc aucun checkpoint [...] reellement verifie [...] rouge exige ».
 *      Danger symetrique : UN SEUL cas d'instance echantillonnee AMPLIFIE-
 *      RAIT a tort la couverture (`echantillon FIXE`, pas un singleton) —
 *      cette suite en exige explicitement DEUX (apres periode 1, apres
 *      periode 4 — premiere et derniere, cahier:L119 P1..P4), chacun dans
 *      sa PROPRE invocation de processus (jamais le meme appel reutilise).
 *      Elle compare l'horloge metier, la version active, Q/R et l'ENSEMBLE
 *      des exigences satisfaites (pas seulement leur compte, qu'un
 *      melange d'identifiants satisferait a tort).
 * (A6) cases.lock.json : « faire emettre LIVE_VALIDATED alors qu'aucun recu
 *      live n'existe (drapeau par defaut a vrai, ou ensemble de recus vide
 *      accepte) ». Cette suite porte donc TROIS controles negatifs (aucun
 *      drapeau ; recus = `[]` ; recu INCOMPLET — `invoice_id` absent) ET un
 *      CONTROLE POSITIF (un recu COMPLET publie `true`) : sans ce dernier,
 *      une implementation qui refuserait LIVE_VALIDATED EN TOUTE
 *      CIRCONSTANCE verdirait ce cas `absence` a tort (meme garde-fou que
 *      T06.M1 et T00.A4/A5).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI
 *
 *  • Elle ne reprouve pas l'arithmetique de T16, la revelation de T06, les
 *    denominateurs de T04, le bootstrap de T33 ni l'etat UNKNOWN de T17 :
 *    A3 verifie que leurs gates DEJA PROUVES n'ont pas REGRESSE au commit de
 *    qualification, pas qu'ils sont corrects pour la premiere fois.
 *  • Elle n'exerce `checkpoint inspect`/`analysis export`/`analysis run`/
 *    `report build` que sur les proprietes nommees par A4/A5/A6 : ni la
 *    totalite du schema `CheckpointManifest`, ni `checkpoint fork`, ni
 *    `billing reconcile`, ni `scenario validate`, ni `campaign plan/status/
 *    resume` (deja couverts, existence seule, par T41.A7).
 *  • A1 fait confiance au CALCUL de `bench resume` (deja la seule autorite
 *    du depot, CLAUDE.md) : elle ne re-derive pas elle-meme PROVEN/STALE/
 *    WAITING depuis le ledger — ce serait dupliquer T00/T01, deja PROUVES.
 *  • Aucun credential reel : tous les runs sont `--mode recorded`, le
 *    fournisseur est TOUJOURS factice (herite de T38/T41/T17), et les
 *    « recus live » d'A6 sont des DONNEES DE TEST explicitement fictives,
 *    jamais une cle ni un appel reseau reel.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 900_000;
const PROC_TIMEOUT_MS = 300_000;
const BUILD_TIMEOUT_MS = 300_000;

/* ────────────────────────────────────────────────────────────────── socle */

type Json = Record<string, unknown>;

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO = findRepoRoot();
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

/** Rendu TEXTUEL PROFOND, pour que les messages d'echec NOMMENT ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 8) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}
const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/* ═══════════════ racines gelees apres T01, jamais recopiees a la main ══ */

function readReference(nom: string): Json {
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${nom}.json`), 'utf8')) as Json;
}
function refValue(doc: Json, dotted: string): unknown {
  let cur: unknown = doc;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') throw new Error(`REFERENCE-CHEMIN-ABSENT ${dotted} (bloque a ${seg})`);
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) throw new Error(`REFERENCE-VALEUR-ABSENTE ${dotted}`);
  return cur;
}

/** 340 et 680 micro-USD, F-MONEY (cahier:L103). */
const COUT_UN_APPEL = Number(refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.cout_attendu.valeur'));
const COUT_DEUX_APPELS = Number(refValue(readReference('F-MONEY'), 'valeurs.deux_appels_identiques.cout_attendu.valeur'));
const GRILLE_ENTREE_NON_CACHEE = Number(refValue(readReference('F-MONEY'), 'valeurs.grille_tarifaire.entree_non_cachee.valeur'));
const GRILLE_ENTREE_CACHEE = Number(refValue(readReference('F-MONEY'), 'valeurs.grille_tarifaire.entree_cachee.valeur'));
const GRILLE_SORTIE = Number(refValue(readReference('F-MONEY'), 'valeurs.grille_tarifaire.sortie.valeur'));
const APPEL_TOKENS_NON_CACHES = Number(refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.tokens_entree_non_caches.valeur'));
const APPEL_TOKENS_CACHES = Number(refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.tokens_entree_caches.valeur'));
const APPEL_TOKENS_SORTIE = Number(refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.tokens_sortie.valeur'));

/* ─────────────────────────────── litteraux du cahier, chacun avec sa ligne */

const MODE_RECORDED = 'recorded'; // cahier:L21
const CHAMP_MODE_EXECUTION = 'execution_mode'; // cahier:L24
const CHAMP_ORIGINE_COUTS = 'cost_origin'; // cahier:L24
const CHAMP_PROVENANCE = 'corpus_provenance'; // cahier:L24
const FORMAT_MONTANT = /^[0-9]+$/; // cahier:L80

/* cahier:L493 (T38, deja PROUVE) : 2 configurations x 3 repetitions. */
const EXPECTED_TRAJECTORIES = 6;
const EXPECTED_PERIODS_PAR_TRAJECTOIRE = 4;
const EXPECTED_PERIODS = EXPECTED_TRAJECTORIES * EXPECTED_PERIODS_PAR_TRAJECTOIRE;
const EXPECTED_CALLS_PAR_PERIODE = 2; // cahier:L491
const EXPECTED_TOTAL_CALLS = EXPECTED_PERIODS * EXPECTED_CALLS_PAR_PERIODE;
const EXPECTED_COST_PAR_TRAJECTOIRE = EXPECTED_PERIODS_PAR_TRAJECTOIRE * COUT_DEUX_APPELS;
const EXPECTED_TOTAL_COST = EXPECTED_COST_PAR_TRAJECTOIRE * EXPECTED_TRAJECTORIES;

// Controles de coherence interne (meme discipline que test_T38.py) : une
// erreur ICI signale un defaut DANS CETTE SUITE, avant d'interroger quoi
// que ce soit.
if (COUT_UN_APPEL !== GRILLE_ENTREE_NON_CACHEE * APPEL_TOKENS_NON_CACHES + GRILLE_ENTREE_CACHEE * APPEL_TOKENS_CACHES + GRILLE_SORTIE * APPEL_TOKENS_SORTIE) {
  throw new Error(`F-MONEY-INCOHERENTE cout_un_appel=${COUT_UN_APPEL}`);
}
if (COUT_DEUX_APPELS !== COUT_UN_APPEL * 2) throw new Error('F-MONEY-INCOHERENTE deux_appels != 2x un_appel');
if (EXPECTED_TOTAL_CALLS !== 48) throw new Error(`EXPECTED_TOTAL_CALLS inattendu : ${EXPECTED_TOTAL_CALLS}`);
if (EXPECTED_COST_PAR_TRAJECTOIRE !== 2720) throw new Error(`EXPECTED_COST_PAR_TRAJECTOIRE inattendu : ${EXPECTED_COST_PAR_TRAJECTOIRE}`);
if (EXPECTED_TOTAL_COST !== 16320) throw new Error(`EXPECTED_TOTAL_COST inattendu : ${EXPECTED_TOTAL_COST}`);

/* ═══════════════ fixture maitresse golden-six (livrable T38), relue — ═══
   JAMAIS recalculee : ses champs sont CROISES avec F-MONEY ci-dessus avant
   tout usage, meme discipline que acceptance/T41.spec.ts pour ses propres
   manifestes. */
const GOLDEN_SIX_PATH = path.join(REPO, 'fixtures', 'golden-six.json');
function lireGoldenSix(): Json {
  if (!fs.existsSync(GOLDEN_SIX_PATH)) throw new Error(`FIXTURE-ABSENTE ${GOLDEN_SIX_PATH} (livrable T38, cahier:L489)`);
  return JSON.parse(fs.readFileSync(GOLDEN_SIX_PATH, 'utf8')) as Json;
}
const GOLDEN_SIX = lireGoldenSix();
{
  const g = GOLDEN_SIX;
  if (g.period_count !== EXPECTED_PERIODS_PAR_TRAJECTOIRE) throw new Error(`GOLDEN-SIX-DESYNCHRONISEE period_count=${String(g.period_count)}`);
  const cfgs = (g.configurations as Json[] | undefined) ?? [];
  if (cfgs.length !== 2) throw new Error(`GOLDEN-SIX-DESYNCHRONISEE configurations.length=${cfgs.length}`);
  for (const c of cfgs) if (c.repetition_count !== 3) throw new Error(`GOLDEN-SIX-DESYNCHRONISEE repetition_count=${String(c.repetition_count)}`);
  if (g.model_calls_per_period !== EXPECTED_CALLS_PAR_PERIODE) throw new Error('GOLDEN-SIX-DESYNCHRONISEE model_calls_per_period');
  const tarif = (g.model_call_tariff ?? {}) as Json;
  if (tarif.input_uncached_per_token !== GRILLE_ENTREE_NON_CACHEE || tarif.input_cached_per_token !== GRILLE_ENTREE_CACHEE || tarif.output_per_token !== GRILLE_SORTIE) {
    throw new Error(`GOLDEN-SIX-DESYNCHRONISEE tarif != F-MONEY : ${rendu(tarif)}`);
  }
  const usage = (g.model_call_usage ?? {}) as Json;
  if (usage.input_uncached_tokens !== APPEL_TOKENS_NON_CACHES || usage.input_cached_tokens !== APPEL_TOKENS_CACHES || usage.output_tokens !== APPEL_TOKENS_SORTIE) {
    throw new Error(`GOLDEN-SIX-DESYNCHRONISEE usage != F-MONEY : ${rendu(usage)}`);
  }
}
/* ═══════════════ section 0 : T42.depends_on verifie contre cahier:L525 ═ */

function lireTachesJson(): Json {
  return JSON.parse(fs.readFileSync(path.join(REPO, 'verification', 'tasks.json'), 'utf8')) as Json;
}
const TACHES_DOC = lireTachesJson();
const T42_CARTE = ((TACHES_DOC.tasks as Json[] | undefined) ?? []).find((t) => t.id === 'T42');
if (!T42_CARTE) throw new Error('REGISTRE-T42-INTROUVABLE verification/tasks.json');
const DEPENDS_ON_T42: string[] = ((T42_CARTE.depends_on as unknown[] | undefined) ?? []).map(String);
// cahier:L525 — « Dependances : T00 a T41 » — VERBATIM, verifie ici plutot
// que suppose : un registre dont la table J aurait derive doit faire tomber
// cette suite AVANT qu'elle n'interroge quoi que ce soit.
const EXPECTED_DEPENDS_ON_T42: string[] = Array.from({ length: 42 }, (_, i) => `T${String(i).padStart(2, '0')}`);
if (DEPENDS_ON_T42.length !== 42 || EXPECTED_DEPENDS_ON_T42.some((id, i) => DEPENDS_ON_T42[i] !== id)) {
  throw new Error(`REGISTRE-T42-DEPENDS-ON-INATTENDU (cahier:L525 « T00 a T41 ») : ${rendu(DEPENDS_ON_T42)}`);
}

/* ══════════════════════════ PostgreSQL REEL (requires: postgres18) ═══════ */

const RUN = `t42_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function trySh(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeout = 15000): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], env });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown };
    return { ok: false, out: `${String(err.stdout ?? '')}${String(err.stderr ?? '')}`.trim() };
  }
}
function dsnFor(db: string, host = SOCKET_DIR, user = PG_USER): string {
  return `postgresql://${encodeURIComponent(user)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(host)}`;
}
function psql(db: string, sql: string, host = SOCKET_DIR, user = PG_USER): { ok: boolean; out: string } {
  return trySh('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db, host, user), '-c', sql], process.env, 15000);
}
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) if (psql(cand, 'SELECT 1').ok) return cand;
  return 'postgres';
})();
const BASES_CREEES: string[] = [];
function dropBase(nom: string): void {
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
}
function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  dropBase(nom);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(r.ok ? 'base-postgresql-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`).toBe('base-postgresql-creee'); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}
function creerSeau(suffixe: string): string {
  return `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60);
}
function envAvecPg(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

/* ─────────────────────────────── la commande, observee comme un PROCESSUS */

/** Candidats d'entree pour apps/cli — meme decouverte que T38/T41, jamais tools/bench (HARNESS du verificateur, sans rapport avec le PRODUIT). */
function entreesCli(): string[] {
  const out: string[] = [];
  const dir = path.join(REPO, 'apps', 'cli');
  const ajouter = (f: string): void => {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return;
    if (!out.includes(f)) out.push(f);
  };
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Json;
      const bin = j.bin;
      if (typeof bin === 'string') ajouter(path.resolve(dir, bin));
      else if (bin !== null && typeof bin === 'object') for (const v of Object.values(bin as Json)) if (typeof v === 'string') ajouter(path.resolve(dir, v));
      if (typeof j.main === 'string') ajouter(path.resolve(dir, j.main));
    } catch {
      /* manifeste illisible : on retombe sur les chemins usuels */
    }
  }
  for (const rel of ['dist/index.js', 'dist/cli.js', 'bin/bench.js', 'index.js']) ajouter(path.join(dir, rel));
  return out;
}

function executerBrut(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeout = PROC_TIMEOUT_MS): { exit: number | null; sortie: string } {
  try {
    const stdout = execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env });
    return { exit: 0, sortie: stdout };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    return { exit: err.status ?? null, sortie: `${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}` };
  }
}

function jsonDeSortie(s: string): Json | null {
  const essai = (t: string): Json | null => {
    try {
      const v = JSON.parse(t) as unknown;
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
    } catch {
      return null;
    }
  };
  const direct = essai(s.trim());
  if (direct !== null) return direct;
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) {
    const bloc = essai(s.slice(i, j + 1));
    if (bloc !== null) return bloc;
  }
  for (const ligne of s.split('\n').reverse()) {
    const l = essai(ligne.trim());
    if (l !== null) return l;
  }
  return null;
}

let BUILD_TENTE = false;
function construireUneFois(): void {
  if (BUILD_TENTE) return;
  BUILD_TENTE = true;
  try {
    execFileSync('pnpm', ['build'], { cwd: REPO, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    /* un echec de build se revele dans la seconde tentative d'invocation */
  }
}

type AppelCli = { resultat: Json | null; exit: number | null; tentatives: { argv: string[]; exit: number | null; sortie: string }[] };

/** Une invocation `<cli> <sousArgv...>` — processus NEUF a CHAQUE appel (meme discipline que T23/T38/T41). */
function invoquer(sousArgv: string[], env: NodeJS.ProcessEnv): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const entree of entreesCli()) {
      const argv = [entree, ...sousArgv];
      const r = executerBrut('node', argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.sortie);
      tentatives.push({ argv, exit: r.exit, sortie: court(r.sortie, 500) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, exit: dernierExit, tentatives };
  construireUneFois();
  const second = essayer();
  return { resultat: second, exit: dernierExit, tentatives };
}
function messageEchec(label: string, appel: AppelCli): string {
  const premiereLigneUtile = (s: string): string => (s.trim().split('\n').find((l) => l.trim().length > 0) ?? '').trim();
  return `${label} : ${appel.tentatives.map((t) => `[exit ${String(t.exit)}] ${premiereLigneUtile(t.sortie)}`).join(' | ') || 'aucune entree candidate dans apps/cli'}`;
}

const TMP_DIRS: string[] = [];
function nouveauRepertoire(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `${prefixe}-`));
  TMP_DIRS.push(d);
  return d;
}
function ecrireJsonTemp(prefixe: string, data: unknown): string {
  const d = nouveauRepertoire(prefixe);
  const p = path.join(d, `${prefixe}.json`);
  fs.writeFileSync(p, JSON.stringify(data), 'utf8');
  return p;
}

afterAll(() => {
  for (const db of BASES_CREEES) dropBase(db);
  for (const dir of TMP_DIRS) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* au mieux */
    }
  }
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════════════════════════════════════════════ */

describe('T42 — effectuer une qualification independante de bout en bout', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T42.A1 les 42 taches precedentes possedent leurs preuves courantes',
    () => {
      const headIndependant = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
      const r = executerBrut('node', ['tools/bench', 'resume', '--json'], process.env, PROC_TIMEOUT_MS);
      const board = jsonDeSortie(r.sortie);
      expect(board !== null ? 'resume-json-ok' : `RESUME-EN-ECHEC exit=${String(r.exit)} : ${court(r.sortie)}`).toBe('resume-json-ok');
      const b = board as Json;

      expect(typeof b.head === 'string' && b.head === headIndependant ? 'head-coherent' : `HEAD-DIVERGENT bench=${rendu(b.head)} git=${headIndependant}`).toBe('head-coherent');

      const proven = new Set(((b.proven as string[] | undefined) ?? []));
      const waiting = new Set(((b.waiting as string[] | undefined) ?? []));
      const blocked = new Set(((b.blocked as string[] | undefined) ?? []));
      const stale = new Set(((b.stale as string[] | undefined) ?? []));
      const contested = new Set(((b.contested as string[] | undefined) ?? []));

      const manquantes: string[] = [];
      const ailleurs: string[] = [];
      for (const id of DEPENDS_ON_T42) {
        if (!proven.has(id)) manquantes.push(id);
        const etat = waiting.has(id) ? 'WAITING' : blocked.has(id) ? 'BLOCKED' : stale.has(id) ? 'STALE' : contested.has(id) ? 'CONTESTED' : null;
        if (etat) ailleurs.push(`${id}:${etat}`);
      }
      expect(manquantes.length === 0 ? 'toutes-les-42-prouvees' : `TACHES-NON-PROUVEES-A-HEAD (${manquantes.length}/42) : ${manquantes.join(', ')}`).toBe('toutes-les-42-prouvees');
      expect(ailleurs.length === 0 ? 'aucune-dans-un-autre-etat' : `TACHES-DANS-UN-AUTRE-ETAT-QUE-PROVEN : ${ailleurs.join(', ')}`).toBe('aucune-dans-un-autre-etat');

      console.log(`[T42.A1] head=${headIndependant.slice(0, 12)} proven=${proven.size} manquantes=${manquantes.length}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */

  type RunNominal = { ctx: { campaignId: string; db: string; bucket: string }; report: Json };
  let NOMINAL_CACHE: RunNominal | null = null;
  function runNominalGoldenSix(): RunNominal {
    if (NOMINAL_CACHE) return NOMINAL_CACHE;
    // « installation vierge » (A2) : base et seau CREES pour cette suite,
    // jamais reutilises — creerBase() DROP+CREATE inconditionnellement.
    const db = creerBase('a2');
    const bucket = creerSeau('a2');
    const campaignId = `t42-golden-${RUN}`;
    const appel = invoquer(
      ['campaign', 'fixtures/golden-six.json', '--mode', MODE_RECORDED, '--campaign-id', campaignId, '--postgres-database', db, '--s3-bucket', bucket, '--workers', '1'],
      envAvecPg(),
    );
    expect(appel.resultat !== null ? 'campagne-golden-six-executee' : `CAMPAGNE-GOLDEN-SIX-EN-ECHEC ${messageEchec('T42.A2', appel)}`).toBe('campagne-golden-six-executee');
    NOMINAL_CACHE = { ctx: { campaignId, db, bucket }, report: appel.resultat as Json };
    return NOMINAL_CACHE;
  }

  test(
    'T42.A2 le pack golden-six se rejoue depuis une installation vierge',
    () => {
      const { report } = runNominalGoldenSix();

      expect(report[CHAMP_MODE_EXECUTION] === MODE_RECORDED ? 'mode-correct' : `MODE-INATTENDU ${rendu(report[CHAMP_MODE_EXECUTION])}`).toBe('mode-correct'); // cahier:L21/L24
      expect(report[CHAMP_ORIGINE_COUTS] !== undefined && report[CHAMP_ORIGINE_COUTS] !== null ? 'cost_origin-present' : 'CHAMP-ABSENT cost_origin').toBe('cost_origin-present'); // cahier:L24
      expect(report[CHAMP_PROVENANCE] !== undefined && report[CHAMP_PROVENANCE] !== null ? 'corpus_provenance-present' : 'CHAMP-ABSENT corpus_provenance').toBe('corpus_provenance-present'); // cahier:L24

      expect(report.trajectory_count === EXPECTED_TRAJECTORIES ? 'trajectory_count-ok' : `TRAJECTORY_COUNT-INATTENDU attendu=${EXPECTED_TRAJECTORIES} vu=${rendu(report.trajectory_count)}`).toBe('trajectory_count-ok'); // cahier:L493
      expect(report.period_count === EXPECTED_PERIODS ? 'period_count-ok' : `PERIOD_COUNT-INATTENDU attendu=${EXPECTED_PERIODS} vu=${rendu(report.period_count)}`).toBe('period_count-ok'); // cahier:L493
      expect(report.model_calls_settled_count === EXPECTED_TOTAL_CALLS ? 'calls-ok' : `MODEL_CALLS_SETTLED_COUNT-INATTENDU attendu=${EXPECTED_TOTAL_CALLS} vu=${rendu(report.model_calls_settled_count)}`).toBe('calls-ok'); // cahier:L493

      // Egalite de CHAINE, pas seulement numerique (lecon T31.A2).
      const totalBrut = report.total_cost_micro_usd;
      expect(typeof totalBrut === 'string' && FORMAT_MONTANT.test(totalBrut) ? 'montant-conforme' : `MONTANT-NON-CONFORME (cahier:L80) ${rendu(totalBrut)}`).toBe('montant-conforme');
      expect(totalBrut === String(EXPECTED_TOTAL_COST) ? 'total-cost-ok' : `TOTAL_COST-INATTENDU attendu=${EXPECTED_TOTAL_COST} vu=${rendu(totalBrut)}`).toBe('total-cost-ok'); // cahier:L493

      for (const champ of ['Q', 'R', 'V', 'U'] as const) {
        expect(report[champ] === 1 ? `${champ}-ok` : `${champ}-INATTENDU attendu=1 vu=${rendu(report[champ])}`).toBe(`${champ}-ok`); // cahier:L493
      }
      expect(report.G === 0 ? 'G-ok' : `G-INATTENDU attendu=0 vu=${rendu(report.G)}`).toBe('G-ok'); // cahier:L493

      const trajectoires = (report.trajectories as Json[] | undefined) ?? [];
      expect(trajectoires.length === EXPECTED_TRAJECTORIES ? 'nb-trajectoires-ok' : `NB-TRAJECTOIRES-INATTENDU ${trajectoires.length}`).toBe('nb-trajectoires-ok');
      let sommeCouts = 0;
      for (const t of trajectoires) {
        const c = t.cost_micro_usd;
        expect(typeof c === 'string' && c === String(EXPECTED_COST_PAR_TRAJECTOIRE) ? 'cout-trajectoire-ok' : `COUT-TRAJECTOIRE-INATTENDU ${rendu(c)} pour ${rendu(t.configuration_id)}/${rendu(t.repetition_index)}`).toBe('cout-trajectoire-ok'); // cahier:L493
        sommeCouts += Number(c);
      }
      expect(sommeCouts === EXPECTED_TOTAL_COST ? 'somme-couts-ok' : `SOMME-COUTS-INATTENDUE ${sommeCouts}`).toBe('somme-couts-ok');

      console.log(`[T42.A2] trajectoires=${trajectoires.length} total_cost=${String(totalBrut)} Q=R=V=U=${rendu(report.Q)} G=${rendu(report.G)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */

  function regexCas(id: string): string {
    // Meme regle que verification/runner/chains.mjs#caseMatcher.
    return `${id.replace(/\./g, '[._]')}(?![0-9])`;
  }

  function runJestCase(specRel: string, caseId: string): { ok: boolean; diag: string } {
    const dir = nouveauRepertoire('t42-jest');
    const outFile = path.join(dir, 'out.json');
    const pattern = regexCas(caseId);
    const r = executerBrut('node', ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', specRel, '--runInBand', '-t', pattern, '--json', `--outputFile=${outFile}`], process.env, PROC_TIMEOUT_MS);
    let rep: Json | null = null;
    try {
      rep = JSON.parse(fs.readFileSync(outFile, 'utf8')) as Json;
    } catch {
      /* rep reste null */
    }
    if (rep === null) return { ok: false, diag: `RAPPORT-JEST-ILLISIBLE exit=${String(r.exit)} : ${court(r.sortie)}` };
    const passed = Number(rep.numPassedTests ?? 0);
    const failed = Number(rep.numFailedTests ?? 0);
    const re = new RegExp(pattern);
    const noms = ((rep.testResults as Json[] | undefined) ?? [])
      .flatMap((tr) => (tr.assertionResults as Json[] | undefined) ?? [])
      .filter((a) => a.status !== 'pending')
      .map((a) => String(a.fullName ?? a.title ?? ''));
    const correspondants = noms.filter((n) => re.test(n));
    if (passed !== 1 || failed !== 0 || correspondants.length !== 1) {
      return { ok: false, diag: `JEST-INATTENDU passed=${passed} failed=${failed} correspondants=${rendu(correspondants)} exit=${String(r.exit)}` };
    }
    return { ok: true, diag: `OK : ${correspondants[0]}` };
  }

  function xmlAttr(tag: string, nom: string): string | null {
    const m = tag.match(new RegExp(`${nom}="([^"]*)"`));
    return m ? (m[1] as string) : null;
  }
  function runPytestCase(specRel: string, sousChaine: string): { ok: boolean; diag: string } {
    const dir = nouveauRepertoire('t42-pytest');
    const outFile = path.join(dir, 'out.xml');
    const r = executerBrut('uv', ['--project', 'analysis', 'run', 'pytest', specRel, '-k', sousChaine, `--junit-xml=${outFile}`, '-q'], process.env, PROC_TIMEOUT_MS);
    let xml = '';
    try {
      xml = fs.readFileSync(outFile, 'utf8');
    } catch {
      /* xml reste vide */
    }
    const suiteMatch = xml.match(/<testsuite\b[^>]*>/);
    const suiteTag = suiteMatch ? suiteMatch[0] : '';
    const tests = Number(xmlAttr(suiteTag, 'tests') ?? '0');
    const failures = Number(xmlAttr(suiteTag, 'failures') ?? '0');
    const errors = Number(xmlAttr(suiteTag, 'errors') ?? '0');
    const skipped = Number(xmlAttr(suiteTag, 'skipped') ?? '0');
    const contientLeNom = xml.includes(sousChaine);
    if (r.exit !== 0 || tests !== 1 || failures !== 0 || errors !== 0 || skipped !== 0 || !contientLeNom) {
      return { ok: false, diag: `PYTEST-INATTENDU exit=${String(r.exit)} tests=${tests} failures=${failures} errors=${errors} skipped=${skipped} nom_present=${contientLeNom} xml=${court(xml, 300)}` };
    }
    return { ok: true, diag: `OK : tests=${tests}` };
  }

  test(
    'T42.A3 cinq versions volontairement alterees echouent chacune au gate concerne',
    () => {
      const sousCas: { propriete: string; cas: string; run: () => { ok: boolean; diag: string } }[] = [
        { propriete: 'calcul de cout (T16, cahier:L291-L297)', cas: 'T16.A1', run: () => runJestCase('acceptance/T16.spec.ts', 'T16.A1') },
        { propriete: 'garde de revelation (T06, cahier:L203-L209)', cas: 'T06.A2', run: () => runJestCase('acceptance/T06.spec.ts', 'T06.A2') },
        { propriete: 'denominateur R (T04, cahier:L185-L193)', cas: 'T04.A5', run: () => runJestCase('acceptance/T04.spec.ts', 'T04.A5') },
        { propriete: 'appariement statistique (T33, cahier:L439-L445)', cas: 'T33.A2', run: () => runPytestCase('analysis/tests/test_T33.py', 'test_T33_A2') },
        { propriete: 'etat UNKNOWN (T17, cahier:L299-L305)', cas: 'T17.A2', run: () => runJestCase('acceptance/T17.spec.ts', 'T17.A2') },
      ];

      const resultats = sousCas.map((s) => ({ ...s, res: s.run() }));
      for (const r of resultats) {
        expect(r.res.ok ? `${r.cas}-gate-tient` : `GATE-EN-ECHEC propriete="${r.propriete}" cas=${r.cas} : ${r.res.diag}`).toBe(`${r.cas}-gate-tient`);
      }
      console.log(`[T42.A3] ${resultats.map((r) => `${r.cas}:${r.res.ok ? 'OK' : 'ECHEC'}`).join(' ')}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */

  type AnalysePipeline = { exportPath: string; exportJson: Json; analysisPath: string; runJson: Json };
  let ANALYSE_CACHE: AnalysePipeline | null = null;
  function goldenSixAnalyse(): AnalysePipeline {
    if (ANALYSE_CACHE) return ANALYSE_CACHE;
    const { ctx } = runNominalGoldenSix();

    const appelExport = invoquer(['analysis', 'export', '--postgres-database', ctx.db], envAvecPg());
    expect(appelExport.resultat !== null ? 'analysis-export-execute' : `ANALYSIS-EXPORT-EN-ECHEC ${messageEchec('T42.A4', appelExport)}`).toBe('analysis-export-execute');
    const exportJson = appelExport.resultat as Json;
    const exportPath = ecrireJsonTemp('t42-export', exportJson);

    // « depuis les SEULS exports » (A4) : PostgreSQL et S3 DELIBEREMENT
    // injoignables pour CET appel precis — `analysis run` ne porte de toute
    // facon ni --postgres-database ni --s3-bucket dans son squelette (T41).
    const envCasse: NodeJS.ProcessEnv = { ...process.env, PGHOST: '/nonexistent-bench-t42-a4-postgres', S3_ENDPOINT: 'http://127.0.0.1:1' };
    const appelRun = invoquer(['analysis', 'run', exportPath], envCasse);
    expect(appelRun.resultat !== null ? 'analysis-run-execute' : `ANALYSIS-RUN-EN-ECHEC ${messageEchec('T42.A4', appelRun)}`).toBe('analysis-run-execute');

    ANALYSE_CACHE = { exportPath, exportJson, analysisPath: ecrireJsonTemp('t42-analysis', appelRun.resultat as Json), runJson: appelRun.resultat as Json };
    return ANALYSE_CACHE;
  }

  test(
    'T42.A4 reconstruction du rapport depuis les seuls exports donne les memes valeurs',
    () => {
      const { report } = runNominalGoldenSix();
      const { runJson } = goldenSixAnalyse();

      // Fichier d'export reellement ECRIT et non vide — garde contre un
      // export qui ne produirait rien (vacuite de la reconstruction).
      expect(fs.existsSync(ANALYSE_CACHE!.exportPath) && fs.statSync(ANALYSE_CACHE!.exportPath).size > 0 ? 'export-ecrit' : 'EXPORT-VIDE-OU-ABSENT').toBe('export-ecrit');

      for (const champ of ['trajectory_count', 'period_count', 'model_calls_settled_count'] as const) {
        expect(runJson[champ] === report[champ] ? `${champ}-coincide` : `${champ}-DIVERGE reconstruit=${rendu(runJson[champ])} publie=${rendu(report[champ])}`).toBe(`${champ}-coincide`);
      }
      expect(runJson.total_cost_micro_usd === report.total_cost_micro_usd ? 'total_cost-coincide' : `total_cost-DIVERGE reconstruit=${rendu(runJson.total_cost_micro_usd)} publie=${rendu(report.total_cost_micro_usd)}`).toBe('total_cost-coincide');
      for (const champ of ['Q', 'R', 'V', 'U', 'G'] as const) {
        expect(runJson[champ] === report[champ] ? `${champ}-coincide` : `${champ}-DIVERGE reconstruit=${rendu(runJson[champ])} publie=${rendu(report[champ])}`).toBe(`${champ}-coincide`);
      }

      // Controle independant des valeurs elles-memes (pas seulement de leur
      // egalite reconstruit/publie, qui pourrait coincider sur deux erreurs
      // identiques) : les deux doivent AUSSI valoir les totaux du cahier.
      expect(runJson.trajectory_count === EXPECTED_TRAJECTORIES ? 'reconstruit-conforme-cahier' : `RECONSTRUIT-NON-CONFORME ${rendu(runJson.trajectory_count)}`).toBe('reconstruit-conforme-cahier');
      expect(runJson.total_cost_micro_usd === String(EXPECTED_TOTAL_COST) ? 'reconstruit-cout-conforme-cahier' : `RECONSTRUIT-COUT-NON-CONFORME ${rendu(runJson.total_cost_micro_usd)}`).toBe('reconstruit-cout-conforme-cahier');

      console.log(`[T42.A4] reconstruit total_cost=${rendu(runJson.total_cost_micro_usd)} Q=R=V=U=${rendu(runJson.Q)} G=${rendu(runJson.G)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */

  test(
    'T42.A5 verifier un echantillon fixe de checkpoints sur un processus neuf',
    () => {
      // Golden-six (A2) ne publie aucun checkpoint par trajectoire (verifie
      // directement en base : table `checkpoints` vide pour ce chemin) —
      // cette suite construit donc sa PROPRE trajectoire a quatre periodes
      // via `run-period` (T23, cahier:L353-L359, PROUVEE, schema
      // `bench.t23.period_result/1`), qui publie un checkpoint par periode.
      const db = creerBase('a5');
      const bucket = creerSeau('a5');
      const campaignId = `t42-checkpoint-${RUN}`;
      const PERIODES = 4; // cahier:L119 F-RESERVATION : P1..P4

      const rapportsParPeriode: Json[] = [];
      for (let i = 0; i < PERIODES; i += 1) {
        const appel = invoquer(['run-period', '--mode', MODE_RECORDED, '--campaign-id', campaignId, '--postgres-database', db, '--s3-bucket', bucket], envAvecPg());
        expect(appel.resultat !== null ? `periode-${i + 1}-executee` : `RUN-PERIOD-EN-ECHEC periode=${i + 1} ${messageEchec('T42.A5', appel)}`).toBe(`periode-${i + 1}-executee`);
        const r = appel.resultat as Json;
        expect(r.period_index === i + 1 ? `period_index-${i + 1}-ok` : `PERIOD_INDEX-INATTENDU attendu=${i + 1} vu=${rendu(r.period_index)}`).toBe(`period_index-${i + 1}-ok`);
        const checkpoint = (r.checkpoint ?? {}) as Json;
        expect(typeof checkpoint.checkpoint_id === 'string' && checkpoint.checkpoint_id.length > 0 ? `checkpoint-publie-${i + 1}` : `CHECKPOINT-ABSENT periode=${i + 1} : ${rendu(r.checkpoint)}`).toBe(`checkpoint-publie-${i + 1}`);
        rapportsParPeriode.push(r);
      }

      // Echantillon FIXE (pas exhaustif, pas aleatoire) : premiere et
      // derniere periode — jamais les deux intermediaires.
      const echantillon = [rapportsParPeriode[0] as Json, rapportsParPeriode[PERIODES - 1] as Json];

      for (const periodeSource of echantillon) {
        const checkpointId = String((periodeSource.checkpoint as Json).checkpoint_id);

        // PROCESSUS NEUF : une invocation `node` separee de celle qui a
        // produit le checkpoint, aucun etat en memoire partage.
        const appelInspect = invoquer(['checkpoint', 'inspect', '--campaign-id', campaignId, '--postgres-database', db, '--checkpoint-id', checkpointId], envAvecPg());
        expect(appelInspect.resultat !== null ? `checkpoint-inspecte-periode-${rendu(periodeSource.period_index)}` : `CHECKPOINT-INSPECT-EN-ECHEC periode=${rendu(periodeSource.period_index)} checkpoint=${checkpointId} ${messageEchec('T42.A5', appelInspect)}`).toBe(
          `checkpoint-inspecte-periode-${rendu(periodeSource.period_index)}`,
        );
        const restaure = appelInspect.resultat as Json;

        expect(restaure.period_index === periodeSource.period_index ? 'period_index-restaure-ok' : `PERIOD_INDEX-RESTAURE-DIVERGE restaure=${rendu(restaure.period_index)} source=${rendu(periodeSource.period_index)}`).toBe('period_index-restaure-ok');
        expect(restaure.business_clock === periodeSource.business_clock ? 'horloge-metier-coincide' : `HORLOGE-METIER-DIVERGE restaure=${rendu(restaure.business_clock)} source=${rendu(periodeSource.business_clock)}`).toBe('horloge-metier-coincide'); // cahier:L157
        expect(restaure.active_version_id === periodeSource.active_version_id ? 'version-active-coincide' : `VERSION-ACTIVE-DIVERGE restaure=${rendu(restaure.active_version_id)} source=${rendu(periodeSource.active_version_id)}`).toBe('version-active-coincide');
        expect(restaure.Q === periodeSource.Q ? 'Q-coincide' : `Q-DIVERGE restaure=${rendu(restaure.Q)} source=${rendu(periodeSource.Q)}`).toBe('Q-coincide');
        expect(restaure.R === periodeSource.R ? 'R-coincide' : `R-DIVERGE restaure=${rendu(restaure.R)} source=${rendu(periodeSource.R)}`).toBe('R-coincide');

        const exigencesSource = new Set(
          ((periodeSource.requirements as Json[] | undefined) ?? []).filter((e) => e.satisfied === true).map((e) => `${String(e.id)}@${String(e.version)}`),
        );
        const exigencesRestaurees = new Set(
          ((restaure.requirements as Json[] | undefined) ?? []).filter((e) => e.satisfied === true).map((e) => `${String(e.id)}@${String(e.version)}`),
        );
        const memeEnsemble = exigencesSource.size === exigencesRestaurees.size && [...exigencesSource].every((e) => exigencesRestaurees.has(e));
        expect(memeEnsemble ? 'exigences-satisfaites-coincident' : `EXIGENCES-SATISFAITES-DIVERGENT source=${rendu([...exigencesSource])} restaure=${rendu([...exigencesRestaurees])}`).toBe(
          'exigences-satisfaites-coincident',
        ); // cahier:L157 (CheckpointManifest : « exigences »)
      }

      console.log(`[T42.A5] echantillon=${echantillon.map((p) => rendu(p.period_index)).join(',')} sur ${PERIODES} periodes publiees`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */

  function reportBuild(analysisPath: string, liveReceiptsPath?: string): AppelCli {
    const argv = ['report', 'build', analysisPath];
    if (liveReceiptsPath) argv.push('--live-receipts', liveReceiptsPath);
    return invoquer(argv, envAvecPg());
  }
  function etatsDe(appel: AppelCli, label: string): Json {
    expect(appel.resultat !== null ? `${label}-execute` : `REPORT-BUILD-EN-ECHEC(${label}) ${messageEchec('T42.A6', appel)}`).toBe(`${label}-execute`);
    const r = appel.resultat as Json;
    const etats = (r.states ?? {}) as Json;
    for (const nom of ['CORE_VERIFIED', 'PILOT_READY', 'HANDOFF_COMPLETE', 'LIVE_VALIDATED']) {
      // cahier:L26, les quatre noms d'etat, verbatim.
      expect(etats[nom] !== undefined ? `${label}-${nom}-present` : `${label}-ETAT-ABSENT(${nom})`).toBe(`${label}-${nom}-present`);
    }
    return etats;
  }

  test(
    'T42.A6 aucune attestation LIVE_VALIDATED si aucun recu live n existe',
    () => {
      const { analysisPath } = goldenSixAnalyse();

      // (a) NEGATIF — aucun drapeau --live-receipts.
      const etatsSansDrapeau = etatsDe(reportBuild(analysisPath), 'sans-drapeau');
      const lvA = (etatsSansDrapeau.LIVE_VALIDATED ?? {}) as Json;
      expect(lvA.published === false ? 'absente-sans-drapeau' : `LIVE_VALIDATED-PUBLIEE-A-TORT(sans-drapeau) ${rendu(lvA)}`).toBe('absente-sans-drapeau');
      expect(typeof lvA.reason === 'string' && lvA.reason.length > 0 ? 'motif-present-sans-drapeau' : 'MOTIF-ABSENT(sans-drapeau)').toBe('motif-present-sans-drapeau');

      // (b) NEGATIF — ensemble de recus VIDE (mutant nomme par cases.lock.json).
      const recusVides = ecrireJsonTemp('t42-recus-vides', []);
      const etatsVides = etatsDe(reportBuild(analysisPath, recusVides), 'recus-vides');
      const lvB = (etatsVides.LIVE_VALIDATED ?? {}) as Json;
      expect(lvB.published === false ? 'absente-recus-vides' : `LIVE_VALIDATED-PUBLIEE-A-TORT(recus-vides) ${rendu(lvB)}`).toBe('absente-recus-vides');
      expect(lvB.receipts_count === 0 ? 'receipts_count-zero' : `RECEIPTS_COUNT-INATTENDU ${rendu(lvB.receipts_count)}`).toBe('receipts_count-zero');

      // (c) NEGATIF — un recu INCOMPLET (invoice_id absent) : cahier:L26
      // exige « modele, date, budgets ET factures identifies ».
      const recuIncomplet = [{ model: 'claude-qualification-t42', date: '2026-01-01T00:00:00Z', budget_micro_usd: '1000000' }];
      const recusIncomplets = ecrireJsonTemp('t42-recus-incomplets', recuIncomplet);
      const etatsIncomplets = etatsDe(reportBuild(analysisPath, recusIncomplets), 'recu-incomplet');
      const lvC = (etatsIncomplets.LIVE_VALIDATED ?? {}) as Json;
      expect(lvC.published === false ? 'absente-recu-incomplet' : `LIVE_VALIDATED-PUBLIEE-A-TORT(recu-incomplet) ${rendu(lvC)}`).toBe('absente-recu-incomplet');

      // (d) CONTROLE POSITIF — un recu COMPLET : sans ce controle, un refus
      // UNIVERSEL de LIVE_VALIDATED verdirait ce cas `absence` a tort (meme
      // garde-fou que T06.M1 et T00.A4/A5).
      const recuComplet = [{ model: 'claude-qualification-t42', date: '2026-01-01T00:00:00Z', budget_micro_usd: '1000000', invoice_id: 'INV-T42-CTRL-0001' }];
      const recusComplets = ecrireJsonTemp('t42-recus-complets', recuComplet);
      const etatsComplets = etatsDe(reportBuild(analysisPath, recusComplets), 'recu-complet');
      const lvD = (etatsComplets.LIVE_VALIDATED ?? {}) as Json;
      expect(lvD.published === true ? 'presente-recu-complet' : `CONTROLE-DE-CAPACITE-EN-ECHEC LIVE_VALIDATED non publiee malgre un recu complet : ${rendu(lvD)}`).toBe('presente-recu-complet');
      expect(lvD.receipts_count === 1 ? 'receipts_count-un' : `RECEIPTS_COUNT-INATTENDU(complet) ${rendu(lvD.receipts_count)}`).toBe('receipts_count-un');

      console.log(`[T42.A6] sans-drapeau=${rendu(lvA.published)} vides=${rendu(lvB.published)} incomplet=${rendu(lvC.published)} complet=${rendu(lvD.published)}`);
    },
    CASE_TIMEOUT_MS,
  );
});
