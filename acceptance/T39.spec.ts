/**
 * acceptance/T39.spec.ts — suite d'acceptation de la tache T39.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T39.A1 numeric   — compile 36 trajectoires et 432 periodes
 *   T39.A2 refusal   — modele/prix/corpus/exposition/budget manquant produit
 *                      la liste COMPLETE des prerequis absents, avant tout appel
 *   T39.A3 behaviour — six clones d'un meme scenario conservent un seul
 *                      parent statistique
 *   T39.A4 behaviour — le profil recorded teste la mecanique du pilote avec
 *                      ses labels fictifs
 *   T39.A5 behaviour — une campagne live autorisee respecte ses plafonds et
 *                      laisse des resultats meme si tous les candidats echouent
 *   T39.A6 absence   — le preflight ne lance jamais implicitement la campagne
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux sources de T39 — `fixtures`,
 * `apps/cli`, `docs` (verification/tasks.json#T39) — et ne les a lues ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline
 * auditable au diff, pas une barriere technique). Le contrat teste ci-dessous
 * est derive de docs/specs/T39.md / docs/cahier.md, et des contrats DEJA
 * PUBLIES par les suites d'acceptation des dependances directes de T39 (T28,
 * T29, T30, T35, T38) — lire le contrat PUBLIE d'une dependance (sa propre
 * suite ACCEPTANCE) n'est pas lire l'implementation de T39, exactement comme
 * acceptance/T37.spec.ts reprend `dispatchModelCall` de T17 sans lire
 * packages/gateway, ou acceptance/T38.spec.ts reprend `applyMigrations` et
 * les enums de phase sans lire packages/activities.
 *
 *   L499  dependances T28, T29, T30, T35, T38 ; livrables VERBATIM :
 *         « manifeste modele pour six projets sources, douze periodes, deux
 *         configurations et trois repetitions ; commande de preparation et
 *         export d'hypotheses ».
 *   L501  les six cas d'acceptation, mot pour mot.
 *   L503  fin : « recette executable et admission testee avec fournisseur
 *         factice. Le lancement reel, le corpus representatif et les
 *         parametres de puissance calibres sont des operations de recherche
 *         separees. Leur absence ne doit pas etre masquee par une attestation
 *         de preparation. »
 *   L15   « les appels de developpement et de generation passent par des
 *         interfaces substituables » — fonde l'usage du fournisseur factice
 *         (deja etabli par T17/T28) pour A4/A5, sans credential reelle
 *         (`requires_live_credentials: false`, verification/tasks.json#T39).
 *   L17-24 §B, VERBATIM : mode `recorded` = « agent scripte, reponses et
 *         couts fictifs archives » ; mode `live` = « fournisseur reel
 *         explicitement configure » ; « les resultats portent TOUJOURS
 *         execution_mode, cost_origin et corpus_provenance » — fonde A4/A5.
 *   L28   « un defaut de prerequis produit BLOCKED, jamais PASS » — fonde A2 :
 *         un prerequis manquant est un REFUS du preflight, pas une execution
 *         partielle.
 *   L78   identite complete d'une trajectoire, VERBATIM : campaign_id /
 *         parent_project_id / scenario_id / configuration_id / repetition_id
 *         / budget_id — repris tel quel pour la forme d'une trajectoire
 *         compilee ou executee (A1, A3, A4, A5).
 *   L80   montants : chaines d'entiers non negatifs en micro-USD — fonde le
 *         format de `total_cost_micro_usd` (A4, A5).
 *   L97   enum `attempt_outcome` VERBATIM (deja fixe par T38) : `SUCCESS`,
 *         `FAILED`, `CANCELLED` — reutilise pour A4/A5.
 *   L103  F-MONEY, racine gelee — tarif de reference 340 micro-USD, reutilise
 *         comme `price.tariff_micro_usd` du manifeste (jamais recopie a la
 *         main dans une assertion).
 *   L105  F-BUDGET, racine gelee — plafond de reference 1000 micro-USD,
 *         reutilise comme `budget.cap_micro_usd` du manifeste.
 *   L111  « une campagne confirmatoire exige une exposition predefinie non
 *         nulle » — fonde le champ `exposure.predefined`/`exposure.value` du
 *         manifeste et son statut de prerequis (A2).
 *   L103/L105 EXPOSITION et CORPUS n'ont pas de litteral chiffre propre dans
 *         le cahier pour T39 : seule leur PRESENCE (predefinie / corpus
 *         materialise) est un prerequis, pas une valeur numerique epinglee —
 *         d'ou `price`/`budget` seuls au rang `numeric` indirect (via F-MONEY/
 *         F-BUDGET), et `corpus`/`exposure`/`model` au rang `refusal` pur.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CONTRAT — CE QUE T39 DOIT PUBLIER, ET SOUS QUELLE FORME
 *
 * Aucun de ces noms, drapeaux ou schemas n'est enonce par le cahier : ils sont
 * la CONVENTION que cette suite fixe, au meme titre que `runFaultDrill` pour
 * T37 ou `--test-stop-after-phase` pour T23. Source_paths de T39 ne declarant
 * AUCUN `packages/**` (seulement `fixtures`, `apps/cli`, `docs`), le contrat
 * est entierement au niveau de la COMMANDE `bench pilot`, observee comme un
 * PROCESSUS (jamais importee) — meme raison que T23/T37/T38 : `apps/cli` n'a
 * pas a compiler pour que cette suite observe un comportement, et un rouge
 * d'import (MODULE_NOT_FOUND) ne prouverait rien (cahier:L139).
 *
 * 1. MANIFESTE, convention `bench.pilot.manifest/1` (FIXEE par cette suite,
 *    fixtures archivees sous `acceptance/fixtures/pilot/`, README inclus) :
 *
 *      corpus: { groups: [ { source_parent_project_id, source_scenario_id,
 *                            clone_instance_ids: string[] } ] }
 *      model: { name } | {}
 *      price: { tariff_micro_usd } | {}
 *      exposure: { predefined, value } | {}
 *      budget: { cap_micro_usd } | {}
 *      configurations: string[]
 *      repetitions: number
 *      periods_per_trajectory: number
 *
 *    Un prerequis (`model`, `price`, `exposure`, `budget`) est ABSENT si son
 *    objet est `{}` ; `corpus` est ABSENT si `groups` est vide. Le nombre de
 *    trajectoires compilees est la somme, sur tous les groupes, de
 *    `clone_instance_ids.length`, multipliee par `configurations.length` et
 *    `repetitions` ; le nombre de periodes est ce total multiplie par
 *    `periods_per_trajectory`. L'identite `parent_project_id` d'une
 *    trajectoire compilee a partir d'un clone est `source_parent_project_id`
 *    du groupe — JAMAIS l'identifiant d'instance du clone lui-meme (A3).
 *
 * 2. COMMANDE, sous-commande `pilot` (FIXEE par cette suite) :
 *
 *      bench pilot <manifest.json> --campaign-id <id>
 *          --postgres-database <db> --s3-bucket <bucket>
 *          [--execute --mode recorded|live --provider fake
 *            [--test-force-all-candidates-fail]]
 *
 *    SANS `--execute` : mode PREFLIGHT, lecture seule, AUCUN appel modele,
 *    AUCUNE ecriture de trajectoire. Sortie JSON sur stdout, portant AU MOINS :
 *      ready                     boolean — tous les prerequis sont presents
 *      missing_prerequisites     string[] — sous-ensemble de
 *                                 ['model','price','corpus','exposure','budget'],
 *                                 TOUS les manquants, pas seulement le premier
 *      trajectory_count          number — cf. 1. (A1)
 *      period_count              number — cf. 1. (A1)
 *      parent_project_ids        string[] — parents statistiques distincts (A3)
 *      execution_started         boolean — DOIT valoir `false` (A6)
 *
 *    AVEC `--execute` : lance reellement les trajectoires compilees via le
 *    fournisseur factice deja etabli (T17/T28), en mode `recorded` ou `live`
 *    (§B). Sortie JSON sur stdout, portant AU MOINS :
 *      execution_mode, cost_origin, corpus_provenance   (L24, TOUJOURS)
 *      trajectory_count, period_count                   memes regles que 1.
 *      total_cost_micro_usd                              chaine d'entiers (L80)
 *      trajectories: [ { parent_project_id, scenario_id, configuration_id,
 *                         repetition_id, budget_id, attempt_outcome,
 *                         cost_micro_usd } ]                (L78, L97, L80)
 *
 *    `--test-force-all-candidates-fail` est un POINT D'INJECTION NOMME, meme
 *    convention que `--test-stop-after-phase` (T23) et `--test-inject-failure`
 *    (T38) : jamais une branche activee par hasard d'environnement.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 * (a) F-MONEY (340, `price.tariff_micro_usd`) et F-BUDGET (1000,
 *     `budget.cap_micro_usd`) — importes de `acceptance/reference/**` (racine
 *     gelee), et la suite verifie que les fixtures de manifeste les
 *     CONTIENNENT bien avant de les utiliser, elle ne les recopie jamais a
 *     l'aveugle.
 * (b) 36, 432 (A1) — cahier:L501, verbatim, et recalcules ici a partir de la
 *     structure du manifeste nominal (6 clones x 2 configurations x 3
 *     repetitions = 36 ; x 12 periodes/trajectoire = 432) : un desaccord entre
 *     le calcul et le litteral du cahier signalerait une erreur dans CETTE
 *     SUITE, avant meme d'interroger une implementation (meme discipline que
 *     test_T38.py, IV).
 * (c) `recorded`/`live` (L21), `execution_mode`/`cost_origin`/`corpus_provenance`
 *     (L24), l'enum `attempt_outcome` (L97) — litteraux du cahier, chacun avec
 *     son `// cahier:L<n>`.
 * (d) Les noms de drapeaux, le schema du manifeste, les noms de champs de
 *     sortie NE SONT PAS enonces par le cahier : FIXES ICI (section II),
 *     jamais obtenus en executant une implementation de T39 et en figeant ce
 *     qu'on a vu passer — aucune implementation de T39 n'existe au moment ou
 *     cette suite est ecrite (ADR-001).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * DANGERS PROPRES A T39, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT RIEN EXECUTER (« avant tout appel », L501/L503) : le manifeste
 *     nominal (36/432) n'est utilise QUE pour un appel PREFLIGHT (sans
 *     `--execute`), jamais pour une execution reelle a cette echelle — les
 *     executions reelles (A4, A5) utilisent des manifestes REDUITS (meme
 *     schema, moins de clones/periodes) pour rester bornees en duree sans
 *     affaiblir ce que A1 observe (README, acceptance/fixtures/pilot/).
 * (2) A2 EST UN CAS `refusal` : un stub qui LEVE le garderait VERT sans rien
 *     prouver (meme defaut que T30, cases.lock.json). Chaque variante porte
 *     donc son VOLET POSITIF (le manifeste nominal, complet, est `ready:true`)
 *     AVANT le refus, et une boucle isole CHACUN des cinq prerequis pour
 *     eviter qu'une exigence universelle (refuser des qu'UN champ manque,
 *     peu importe lequel) ne masque une case non verifiee.
 * (3) A3 PORTE UN CONTROLE ANTI-CONSTANTE : un compilateur qui regrouperait
 *     TOUJOURS tout sous un seul parent (quel que soit le manifeste) passerait
 *     la moitie positive sans rien prouver. `manifest-two-parents.json` (deux
 *     groupes, parents distincts) doit rendre DEUX parents distincts.
 * (4) A6 PORTE UN CONTROLE POSITIF (meme garde-fou que T38.A6, T00.A4/A5) :
 *     avant de constater qu'un appel PREFLIGHT seul ne touche aucune table
 *     Postgres (recherche directe en base, pas seulement la valeur de retour
 *     du processus), cette suite verifie qu'un appel `--execute` SUR LA MEME
 *     base EN ECRIT bien quelque chose — sans ce controle, une implementation
 *     qui n'ecrirait jamais rien nulle part verdirait A6 par accident.
 * (5) A5 SEPARE DEUX PROPRIETES QUE LE CAHIER ENONCE ENSEMBLE (« respecte ses
 *     plafonds ET laisse des resultats meme si tous les candidats echouent ») :
 *     un plafond GENEREUX avec panne forcee de tous les candidats (temoin
 *     « resultats conserves »), puis un plafond SERRE (`1`, sous le tarif
 *     unitaire `340`) sans panne forcee, en execution ordinaire (temoin
 *     « plafond respecte ») — deux manifestes distincts, pour que la panne
 *     forcee ne soit jamais la cause apparente d'un plafond simplement non
 *     atteint.
 * (6) CHAQUE INVOCATION CLI EST UN PROCESSUS NEUF (`execFileSync`), jamais un
 *     rappel direct — meme discipline que T23/T27/T38 : un etat partage en
 *     memoire JS ne prouverait rien sur une commande destinee a tourner en
 *     sous-processus reel.
 * (7) ISOLATION : chaque appel recoit son propre `--campaign-id`, sa propre
 *     base PostgreSQL (`creerBase`) et son propre bucket S3 — cahier:L557.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI
 *
 *  • Elle ne reprouve pas l'arithmetique interne d'un cout de campagne (T16),
 *    la boucle d'outils d'un appel modele (T28) ni la qualification d'un
 *    scenario (T29) : elle observe leur ASSEMBLAGE au niveau du pilote, pas
 *    leurs proprietes internes, exactement comme T23 observe l'assemblage de
 *    T12/T15/T18-T22 sans les reprouver.
 *  • Elle n'exige aucun credential reel ni corpus representatif : L503 le dit
 *    explicitement, « le lancement reel, le corpus representatif et les
 *    parametres de puissance calibres sont des operations de recherche
 *    separees ». Le mode `live` de A5 est exerce avec le fournisseur FACTICE,
 *    jamais un fournisseur reseau reel.
 *  • Elle n'impose aucun format pour l'export d'hypotheses (L499) au-dela de
 *    ce que les six cas requis observent : aucun cas requis ne porte
 *    specifiquement sur son contenu.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 600_000;
const PROC_TIMEOUT_MS = 240_000;
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
const MANIFEST_DIR = path.join(REPO, 'acceptance', 'fixtures', 'pilot');

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

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

/* ═══════════════ §F : racines gelees apres T01, jamais recopiees a la main ══ */

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

/** 340 micro-USD, tarif de reference (cahier:L103). */
const TARIF_DE_REFERENCE = String(refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.cout_attendu.valeur'));
/** 1000 micro-USD, plafond de reference (cahier:L105). */
const PLAFOND_DE_REFERENCE = String(refValue(readReference('F-BUDGET'), 'valeurs.budget.valeur'));

/* ─────────────────────────────── litteraux du cahier, chacun avec sa ligne */

const MODE_RECORDED = 'recorded'; // cahier:L21
const MODE_LIVE = 'live'; // cahier:L21
const CHAMP_MODE_EXECUTION = 'execution_mode'; // cahier:L24
const CHAMP_ORIGINE_COUTS = 'cost_origin'; // cahier:L24
const CHAMP_PROVENANCE = 'corpus_provenance'; // cahier:L24
const ISSUES_TENTATIVE = ['SUCCESS', 'FAILED', 'CANCELLED'] as const; // cahier:L97
const ISSUE_ECHEC = 'FAILED'; // cahier:L97
const FORMAT_MONTANT_L80 = /^[0-9]+$/; // cahier:L80

/** Ce qui N'EST PAS un refus : un plantage (meme convention que T00/T17/T25/T37). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* ────────────────────────────────── fixtures de manifeste (acceptance/fixtures/pilot) */

function lireManifeste(nom: string): Json {
  return JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, `${nom}.json`), 'utf8')) as Json;
}

const NOMINAL = lireManifeste('manifest-nominal');
const MANQUE_MODELE = lireManifeste('manifest-missing-model');
const MANQUE_PRIX = lireManifeste('manifest-missing-price');
const MANQUE_CORPUS = lireManifeste('manifest-missing-corpus');
const MANQUE_EXPOSITION = lireManifeste('manifest-missing-exposure');
const MANQUE_BUDGET = lireManifeste('manifest-missing-budget');
const MANQUE_TOUT = lireManifeste('manifest-missing-all');
const DEUX_PARENTS = lireManifeste('manifest-two-parents');
const PETIT_RECORDED = lireManifeste('manifest-small-recorded');
const PETIT_LIVE_PLAFOND_LARGE = lireManifeste('manifest-small-live-generous-cap');
const PETIT_LIVE_PLAFOND_SERRE = lireManifeste('manifest-small-live-tight-cap');

/** Nombre de clones compiles par un manifeste (somme sur tous les groupes). */
function totalClones(manifeste: Json): number {
  const groupes = ((manifeste.corpus as Json | undefined)?.groups ?? []) as Json[];
  return groupes.reduce((acc, g) => acc + ((g.clone_instance_ids as unknown[] | undefined)?.length ?? 0), 0);
}
function trajectoiresAttendues(manifeste: Json): number {
  return totalClones(manifeste) * (manifeste.configurations as unknown[]).length * (manifeste.repetitions as number);
}
function periodesAttendues(manifeste: Json): number {
  return trajectoiresAttendues(manifeste) * (manifeste.periods_per_trajectory as number);
}
function parentsSources(manifeste: Json): string[] {
  const groupes = ((manifeste.corpus as Json | undefined)?.groups ?? []) as Json[];
  return groupes.map((g) => g.source_parent_project_id as string);
}

/* Controles de coherence INTERNES a cette suite (avant meme d'interroger une
 * implementation) — meme discipline que test_T38.py (IV). */
if (((NOMINAL.price as Json).tariff_micro_usd as string) !== TARIF_DE_REFERENCE) {
  throw new Error(`FIXTURE-DESYNCHRONISEE manifest-nominal.price != F-MONEY (${TARIF_DE_REFERENCE})`);
}
if (((NOMINAL.budget as Json).cap_micro_usd as string) !== PLAFOND_DE_REFERENCE) {
  throw new Error(`FIXTURE-DESYNCHRONISEE manifest-nominal.budget != F-BUDGET (${PLAFOND_DE_REFERENCE})`);
}
if (trajectoiresAttendues(NOMINAL) !== 36) throw new Error(`FIXTURE-NOMINALE-INCORRECTE trajectoires=${trajectoiresAttendues(NOMINAL)} attendu 36 (cahier:L501)`);
if (periodesAttendues(NOMINAL) !== 432) throw new Error(`FIXTURE-NOMINALE-INCORRECTE periodes=${periodesAttendues(NOMINAL)} attendu 432 (cahier:L501)`);
if (Number(PETIT_LIVE_PLAFOND_SERRE.budget && (PETIT_LIVE_PLAFOND_SERRE.budget as Json).cap_micro_usd) >= Number(TARIF_DE_REFERENCE)) {
  throw new Error('FIXTURE-PLAFOND-SERRE-NON-SERRE : doit rester sous le tarif unitaire (cahier:L103)');
}

/* ══════════════════════════ PostgreSQL REEL (requires: postgres18) ═══════ */

const RUN = `t39_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();
const BASES_CREEES: string[] = [];
function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(r.ok ? 'base-postgresql-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`).toBe('base-postgresql-creee'); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

/** Nombre total d'occurrences textuelles de `cle` dans TOUTES les tables de base de `db` (meme technique que T23/T37). */
function tablesDeBase(db: string): { schema: string; nom: string }[] {
  const r = psql(
    db,
    `SELECT table_schema || '|' || table_name FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  if (!r.ok || r.out.length === 0) return [];
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [schema, nom] = l.split('|');
      return { schema: schema as string, nom: nom as string };
    });
}
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;
function occurrences(db: string, cle: string): number {
  const tables = tablesDeBase(db);
  if (tables.length === 0) return 0;
  const parts = tables.map((t) => `SELECT count(*) AS n FROM "${t.schema}"."${t.nom}" x WHERE x::text LIKE ${lit(`%${cle}%`)}`);
  const r = psql(db, parts.join(' UNION ALL '));
  if (!r.ok) return -1;
  return r.out
    .split('\n')
    .map((l) => Number.parseInt(l.trim(), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => a + b, 0);
}

/* ─────────────────────────────── la commande, observee comme un PROCESSUS */

function entreesCli(): { label: string; argv: string[] }[] {
  const out: { label: string; argv: string[] }[] = [];
  const dir = path.join(REPO, 'apps', 'cli');
  const ajouter = (label: string, f: string): void => {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return;
    if (out.some((c) => c.argv[0] === f)) return;
    out.push({ label, argv: [f] });
  };
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Json;
      const bin = j.bin;
      if (typeof bin === 'string') ajouter('apps/cli:bin', path.resolve(dir, bin));
      else if (bin !== null && typeof bin === 'object') {
        for (const v of Object.values(bin as Json)) if (typeof v === 'string') ajouter('apps/cli:bin', path.resolve(dir, v));
      }
      if (typeof j.main === 'string') ajouter('apps/cli:main', path.resolve(dir, j.main));
    } catch {
      /* manifeste illisible : on retombe sur les chemins usuels */
    }
  }
  for (const rel of ['dist/index.js', 'dist/cli.js', 'bin/bench.js', 'index.js', 'src/index.ts']) {
    ajouter(`apps/cli:${rel}`, path.join(dir, rel));
  }
  ajouter('tools/bench', path.join(REPO, 'tools', 'bench'));
  return out;
}

function executer(argv: string[], env: NodeJS.ProcessEnv): { exit: number | null; sortie: string; stdout: string } {
  try {
    const stdout = execFileSync('node', argv, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { exit: 0, sortie: stdout, stdout };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    const so = String(err.stdout ?? '');
    const se = String(err.stderr ?? '');
    return { exit: err.status ?? null, sortie: `${so}\n${se}`, stdout: so };
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
function construireUneFois(tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[]): void {
  if (BUILD_TENTE) return;
  BUILD_TENTE = true;
  try {
    execFileSync('pnpm', ['build'], { cwd: REPO, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: 0, sortie: 'build ok' });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: err.status ?? null, sortie: court(`${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}`, 400) });
  }
}

type AppelCli = { resultat: Json | null; exit: number | null; tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[] };

/** Une invocation `bench pilot <manifest> ...` — meme discipline que `lancer` (T23/T27/T38) : processus neuf a chaque appel. */
function lancerPilot(manifestePath: string, drapeaux: string[]): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, 'pilot', manifestePath, ...drapeaux];
      const r = executer(argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 500) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, exit: dernierExit, tentatives };
  construireUneFois(tentatives);
  const second = essayer();
  return { resultat: second, exit: dernierExit, tentatives };
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`;
}

/** Namespace d'un appel : une identite fraiche (campaign_id, base, bucket) — cahier:L557. */
function nouveauContexte(suffixe: string): { campaignId: string; db: string; bucket: string } {
  return {
    campaignId: `t39-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
  };
}

function ecrireManifesteTemporaire(nomBase: string, manifeste: Json): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't39-'));
  const p = path.join(dir, `${nomBase}.json`);
  fs.writeFileSync(p, JSON.stringify(manifeste), 'utf8');
  return p;
}

/** Appel PREFLIGHT (sans --execute). */
function preflight(manifeste: Json, suffixe: string): { ctx: { campaignId: string; db: string; bucket: string }; appel: AppelCli } {
  const ctx = nouveauContexte(suffixe);
  const p = ecrireManifesteTemporaire(suffixe, manifeste);
  const appel = lancerPilot(p, ['--campaign-id', ctx.campaignId, '--postgres-database', ctx.db, '--s3-bucket', ctx.bucket]);
  return { ctx, appel };
}

/** Appel D'EXECUTION (--execute --mode ... --provider fake). */
function executerPilote(
  manifeste: Json,
  suffixe: string,
  mode: typeof MODE_RECORDED | typeof MODE_LIVE,
  extra: string[] = [],
): { ctx: { campaignId: string; db: string; bucket: string }; appel: AppelCli } {
  const ctx = nouveauContexte(suffixe);
  const p = ecrireManifesteTemporaire(suffixe, manifeste);
  const appel = lancerPilot(p, [
    '--campaign-id',
    ctx.campaignId,
    '--postgres-database',
    ctx.db,
    '--s3-bucket',
    ctx.bucket,
    '--execute',
    '--mode',
    mode,
    '--provider',
    'fake',
    ...extra,
  ]);
  return { ctx, appel };
}

/* ──────────────────────────────────────────── petites lectures tolerantes */

function interpretMontant(v: unknown): number | null {
  if (typeof v === 'string' && FORMAT_MONTANT_L80.test(v)) return Number.parseInt(v, 10);
  return null;
}
function sortieNonPlantee(appel: AppelCli): void {
  const dernier = appel.tentatives[appel.tentatives.length - 1];
  expect(
    dernier !== undefined && MARQUEURS_DE_PLANTAGE.test(dernier.sortie) ? `PLANTAGE-DETECTE ${court(dernier.sortie)}` : 'pas-de-plantage',
  ).toBe('pas-de-plantage');
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════════════════════════════════════════════ */

describe('T39 — fournir la recette d un pilote complet et son preflight', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T39.A1 compile 36 trajectoires et 432 periodes',
    () => {
      const { appel } = preflight(clone(NOMINAL), 'a1');
      expect(appel.resultat !== null ? 'preflight-execute' : `PREFLIGHT-EN-ECHEC ${messageEchec('T39.A1', appel)}`).toBe('preflight-execute');
      sortieNonPlantee(appel);
      const r = appel.resultat as Json;

      expect(r.ready === true ? 'manifeste-nominal-pret' : `MANIFESTE-NOMINAL-REFUSE ${rendu(r)}`).toBe('manifeste-nominal-pret');

      // L'ENONCE DU CAS, cahier:L501, verbatim — recalcule a partir de la
      // structure du manifeste (36 = 6 clones x 2 configurations x 3
      // repetitions ; 432 = 36 x 12 periodes/trajectoire), pas seulement un
      // litteral recopie (cf. III.b).
      const trajectoiresCalculees = trajectoiresAttendues(NOMINAL);
      const periodesCalculees = periodesAttendues(NOMINAL);
      expect(trajectoiresCalculees).toBe(36); // cahier:L501
      expect(periodesCalculees).toBe(432); // cahier:L501

      expect(r.trajectory_count === trajectoiresCalculees ? 'trajectory_count-correct' : `TRAJECTORY_COUNT-INATTENDU attendu=${trajectoiresCalculees} vu=${rendu(r.trajectory_count)}`).toBe(
        'trajectory_count-correct',
      );
      expect(r.period_count === periodesCalculees ? 'period_count-correct' : `PERIOD_COUNT-INATTENDU attendu=${periodesCalculees} vu=${rendu(r.period_count)}`).toBe('period_count-correct');

      // TEMOIN ANTI-OFF-BY-ONE (cases.lock.json : « periodes-1 » ou
      // « omettre une repetition ») : les deux grandeurs doivent rester dans
      // le rapport EXACT 12 (periodes/trajectoire), pas 11 ni une valeur
      // arrondie.
      expect(r.period_count === (r.trajectory_count as number) * 12 ? 'ratio-12-respecte' : `RATIO-PERIODES-TRAJECTOIRES-INATTENDU ${rendu(r)}`).toBe('ratio-12-respecte');

      console.log(`[T39.A1] trajectory_count=${rendu(r.trajectory_count)} period_count=${rendu(r.period_count)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T39.A2 modele prix corpus exposition ou budget manquant produit la liste complete des prerequis absents',
    () => {
      // VOLET POSITIF D'ABORD (cas `refusal`, cases.lock.json : « un stub qui
      // leve garderait ce cas VERT sans rien prouver »). Le manifeste nominal,
      // complet, doit etre PRET et sans aucun prerequis manquant.
      const { appel: appelNominal } = preflight(clone(NOMINAL), 'a2-positif');
      expect(appelNominal.resultat !== null ? 'preflight-execute' : `PREFLIGHT-EN-ECHEC ${messageEchec('T39.A2 positif', appelNominal)}`).toBe('preflight-execute');
      const rNominal = appelNominal.resultat as Json;
      expect(rNominal.ready === true ? 'pret' : `MANIFESTE-COMPLET-REFUSE ${rendu(rNominal)}`).toBe('pret');
      expect(Array.isArray(rNominal.missing_prerequisites) && (rNominal.missing_prerequisites as unknown[]).length === 0 ? 'aucun-manquant' : `PREREQUIS-FANTOME ${rendu(rNominal.missing_prerequisites)}`).toBe(
        'aucun-manquant',
      );

      // (1) LES CINQ VARIANTES, CHACUNE NE DIFFERANT DU NOMINAL QUE PAR UN
      //     SEUL PREREQUIS VIDE : chacune est REFUSEE et NOMME exactement ce
      //     prerequis-la, aucun autre.
      const motifs: Record<string, RegExp> = {
        model: /model|mod[eè]le/i,
        price: /price|prix|tarif|tariff/i,
        corpus: /corpus/i,
        exposure: /exposure|exposition/i,
        budget: /budget/i,
      };
      const variantes: Record<string, Json> = {
        model: MANQUE_MODELE,
        price: MANQUE_PRIX,
        corpus: MANQUE_CORPUS,
        exposure: MANQUE_EXPOSITION,
        budget: MANQUE_BUDGET,
      };
      const observes: string[] = [];
      for (const [cle, manifeste] of Object.entries(variantes)) {
        const { appel } = preflight(clone(manifeste), `a2-${cle}`);
        expect(appel.resultat !== null ? `preflight-execute-${cle}` : `PREFLIGHT-EN-ECHEC(${cle}) ${messageEchec('T39.A2', appel)}`).toBe(`preflight-execute-${cle}`);
        const r = appel.resultat as Json;
        expect(r.ready === false ? `${cle}-refuse` : `${cle.toUpperCase()}-MANQUANT-ACCEPTE-A-TORT ${rendu(r)}`).toBe(`${cle}-refuse`);
        const manquants = (Array.isArray(r.missing_prerequisites) ? (r.missing_prerequisites as unknown[]) : []).map(String);
        const nommeLeBonPrerequis = manquants.some((m) => motifs[cle]!.test(m));
        expect(nommeLeBonPrerequis ? `${cle}-nomme` : `REFUS-MUET(${cle}) attendu dans ${rendu(manquants)}`).toBe(`${cle}-nomme`);
        // Les QUATRE AUTRES prerequis, eux, sont bien PRESENTS dans ce
        // manifeste et ne doivent donc PAS apparaitre comme manquants.
        const autres = Object.keys(motifs).filter((k) => k !== cle);
        const fauxPositifs = autres.filter((k) => manquants.some((m) => motifs[k]!.test(m)));
        expect(fauxPositifs.length === 0 ? `${cle}-isole` : `FAUX-POSITIFS(${cle}) ${rendu(fauxPositifs)} dans ${rendu(manquants)}`).toBe(`${cle}-isole`);
        observes.push(`${cle}=${manquants.join('+')}`);
      }

      // (2) LES CINQ A LA FOIS : la liste doit nommer LES CINQ, pas
      //     seulement le premier trouve (cahier:L501 : « liste COMPLETE »).
      const { appel: appelTout } = preflight(clone(MANQUE_TOUT), 'a2-tout');
      expect(appelTout.resultat !== null ? 'preflight-execute-tout' : `PREFLIGHT-EN-ECHEC(tout) ${messageEchec('T39.A2', appelTout)}`).toBe('preflight-execute-tout');
      const rTout = appelTout.resultat as Json;
      expect(rTout.ready === false ? 'tout-refuse' : `CINQ-MANQUANTS-ACCEPTES-A-TORT ${rendu(rTout)}`).toBe('tout-refuse');
      const manquantsTout = (Array.isArray(rTout.missing_prerequisites) ? (rTout.missing_prerequisites as unknown[]) : []).map(String);
      const nommesTout = Object.keys(motifs).filter((cle) => manquantsTout.some((m) => motifs[cle]!.test(m)));
      expect(nommesTout.length).toBe(5); // cahier:L501 « liste complete »
      expect(new Set(nommesTout).size).toBe(5);

      console.log(`[T39.A2] isoles=${observes.join(', ')} tous=${manquantsTout.join('+')}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T39.A3 six clones d un meme scenario conservent un seul parent statistique',
    () => {
      // L'ENONCE DU CAS : le manifeste nominal declare SIX clones d'UN SEUL
      // scenario (acceptance/fixtures/pilot/README.md), sous un UNIQUE
      // `source_parent_project_id`.
      expect(totalClones(NOMINAL)).toBe(6); // cahier:L499 « six projets sources »
      expect(parentsSources(NOMINAL)).toEqual(['PRJ-PILOT-1']);

      const { appel } = preflight(clone(NOMINAL), 'a3-clones');
      expect(appel.resultat !== null ? 'preflight-execute' : `PREFLIGHT-EN-ECHEC ${messageEchec('T39.A3', appel)}`).toBe('preflight-execute');
      const r = appel.resultat as Json;
      const parents = Array.isArray(r.parent_project_ids) ? (r.parent_project_ids as unknown[]).map(String) : [];
      expect(
        new Set(parents).size === 1 ? 'un-seul-parent-statistique' : `SIX-PROJETS-INDEPENDANTS-A-TORT parents=${rendu(parents)} (cahier:L501)`,
      ).toBe('un-seul-parent-statistique');
      expect(parents[0]).toBe('PRJ-PILOT-1');
      // Le parent rendu doit etre le PARENT DECLARE, jamais un identifiant
      // d'instance de clone (cases.lock.json : mutation ciblee).
      expect(
        parents.every((p) => !p.includes('-clone-')) ? 'identite-source-pas-identite-de-clone' : `IDENTITE-DE-CLONE-PROMUE-PARENT ${rendu(parents)}`,
      ).toBe('identite-source-pas-identite-de-clone');

      // CONTROLE ANTI-CONSTANTE (IV.3) : un manifeste a DEUX parents
      // REELLEMENT distincts doit rendre DEUX parents distincts, sans quoi
      // un compilateur qui regrouperait TOUJOURS tout sous un seul parent
      // passerait la moitie positive sans rien prouver.
      expect(parentsSources(DEUX_PARENTS)).toEqual(['PRJ-PILOT-CTRL-A', 'PRJ-PILOT-CTRL-B']);
      const { appel: appelControle } = preflight(clone(DEUX_PARENTS), 'a3-controle');
      expect(appelControle.resultat !== null ? 'preflight-execute-controle' : `PREFLIGHT-EN-ECHEC(controle) ${messageEchec('T39.A3', appelControle)}`).toBe('preflight-execute-controle');
      const rControle = appelControle.resultat as Json;
      const parentsControle = Array.isArray(rControle.parent_project_ids) ? (rControle.parent_project_ids as unknown[]).map(String) : [];
      expect(new Set(parentsControle)).toEqual(new Set(['PRJ-PILOT-CTRL-A', 'PRJ-PILOT-CTRL-B']));

      console.log(`[T39.A3] parents(nominal)=${rendu(parents)} parents(controle)=${rendu(parentsControle)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T39.A4 le profil recorded teste la mecanique du pilote avec ses labels fictifs',
    () => {
      // Compile d'abord (preflight) le manifeste REDUIT (IV.1) pour obtenir
      // les comptes ATTENDUS, puis les recompare a ceux de l'execution reelle
      // — deux appels distincts du MEME manifeste doivent s'accorder.
      const { appel: appelCompile } = preflight(clone(PETIT_RECORDED), 'a4-compile');
      expect(appelCompile.resultat !== null ? 'preflight-execute' : `PREFLIGHT-EN-ECHEC ${messageEchec('T39.A4 compile', appelCompile)}`).toBe('preflight-execute');
      const rCompile = appelCompile.resultat as Json;
      expect(rCompile.execution_started).toBe(false);
      const trajCalc = trajectoiresAttendues(PETIT_RECORDED);
      const perCalc = periodesAttendues(PETIT_RECORDED);
      expect(rCompile.trajectory_count).toBe(trajCalc);
      expect(rCompile.period_count).toBe(perCalc);

      const { appel } = executerPilote(clone(PETIT_RECORDED), 'a4-execute', MODE_RECORDED);
      expect(appel.resultat !== null ? 'execution-recorded-executee' : `EXECUTION-RECORDED-EN-ECHEC ${messageEchec('T39.A4', appel)}`).toBe('execution-recorded-executee');
      sortieNonPlantee(appel); // cases.lock.json, variante 2 : « l'adaptateur scripte leve, la mecanique ne tourne plus »
      const r = appel.resultat as Json;

      // LABELS FICTIFS DU PROFIL recorded (§B, cahier:L17-24).
      expect(r[CHAMP_MODE_EXECUTION] === MODE_RECORDED ? 'execution_mode-recorded' : `EXECUTION_MODE-INATTENDU ${rendu(r[CHAMP_MODE_EXECUTION])}`).toBe('execution_mode-recorded'); // cahier:L21
      const origine = String(r[CHAMP_ORIGINE_COUTS] ?? '');
      const provenance = String(r[CHAMP_PROVENANCE] ?? '');
      expect(origine.length > 0 ? 'cost_origin-present' : 'COST_ORIGIN-ABSENT').toBe('cost_origin-present'); // cahier:L24
      expect(provenance.length > 0 ? 'corpus_provenance-present' : 'CORPUS_PROVENANCE-ABSENT').toBe('corpus_provenance-present'); // cahier:L24
      // cases.lock.json, variante 1 : « faire poser execution_mode=live /
      // cost_origin reel » — le profil recorded ne doit REVENDIQUER ni l'un
      // ni l'autre.
      expect(/live|r[ée]el|real/i.test(origine) ? `COST_ORIGIN-REVENDIQUE-LIVE ${origine}` : 'cost_origin-fictif-ou-neutre').toBe('cost_origin-fictif-ou-neutre');

      // LA MECANIQUE A REELLEMENT TOURNE : meme cardinalite que le compile,
      // chaque trajectoire porte son identite complete (L78) et un
      // `attempt_outcome` de l'enum L97, et un cout TOTAL non nul (les
      // couts recorded sont FICTIFS, jamais absents — §B).
      const trajectoires = Array.isArray(r.trajectories) ? (r.trajectories as Json[]) : [];
      expect(trajectoires.length === trajCalc ? 'cardinalite-execution-coherente' : `CARDINALITE-EXECUTION-DIVERGENTE attendu=${trajCalc} vu=${trajectoires.length}`).toBe(
        'cardinalite-execution-coherente',
      );
      for (const t of trajectoires) {
        for (const champ of ['parent_project_id', 'scenario_id', 'configuration_id', 'repetition_id', 'budget_id']) {
          expect(t[champ] !== undefined && t[champ] !== null ? 'identite-complete' : `IDENTITE-INCOMPLETE(${champ}) ${rendu(t)}`).toBe('identite-complete'); // cahier:L78
        }
        expect(
          ISSUES_TENTATIVE.includes(t.attempt_outcome as (typeof ISSUES_TENTATIVE)[number]) ? 'attempt_outcome-connu' : `ATTEMPT_OUTCOME-INCONNU ${rendu(t.attempt_outcome)}`,
        ).toBe('attempt_outcome-connu'); // cahier:L97
      }

      const totalCout = interpretMontant(r.total_cost_micro_usd);
      expect(totalCout !== null ? 'total_cost_micro_usd-conforme' : `MONTANT-NON-CONFORME (cahier:L80) ${rendu(r.total_cost_micro_usd)}`).toBe('total_cost_micro_usd-conforme');
      expect((totalCout as number) > 0 ? 'mecanique-a-reellement-tourne' : `COUT-NUL-MECANIQUE-SUSPECTE ${rendu(r.total_cost_micro_usd)}`).toBe('mecanique-a-reellement-tourne');

      console.log(`[T39.A4] execution_mode=${rendu(r[CHAMP_MODE_EXECUTION])} cost_origin=${origine} total=${rendu(r.total_cost_micro_usd)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T39.A5 une campagne live autorisee respecte ses plafonds et laisse des resultats meme si tous les candidats echouent',
    () => {
      // TEMOIN 1 — « laisse des resultats meme si tous les candidats
      // echouent » : plafond LARGE, panne forcee de TOUS les candidats
      // (point d'injection NOMME, cf. II.2).
      const { appel: appelEchec } = executerPilote(clone(PETIT_LIVE_PLAFOND_LARGE), 'a5-echec-total', MODE_LIVE, ['--test-force-all-candidates-fail']);
      expect(appelEchec.resultat !== null ? 'execution-live-echec-total-executee' : `EXECUTION-LIVE-EN-ECHEC ${messageEchec('T39.A5 echec total', appelEchec)}`).toBe(
        'execution-live-echec-total-executee',
      );
      sortieNonPlantee(appelEchec);
      const rEchec = appelEchec.resultat as Json;
      expect(rEchec[CHAMP_MODE_EXECUTION] === MODE_LIVE ? 'execution_mode-live' : `EXECUTION_MODE-INATTENDU ${rendu(rEchec[CHAMP_MODE_EXECUTION])}`).toBe('execution_mode-live'); // cahier:L21

      const trajCalcEchec = trajectoiresAttendues(PETIT_LIVE_PLAFOND_LARGE);
      const trajectoiresEchec = Array.isArray(rEchec.trajectories) ? (rEchec.trajectories as Json[]) : [];
      // cases.lock.json, variante 1 : « ecarter les trajectoires FAILED de
      // l'export » — le decompte doit rester EGAL au nombre compile, pas
      // vide.
      expect(trajectoiresEchec.length === trajCalcEchec ? 'resultats-conserves-malgre-echec-total' : `RESULTATS-PERDUS attendu=${trajCalcEchec} vu=${trajectoiresEchec.length} (cahier:L501)`).toBe(
        'resultats-conserves-malgre-echec-total',
      );
      expect(trajectoiresEchec.length > 0).toBe(true);
      const tousEnEchec = trajectoiresEchec.every((t) => t.attempt_outcome === ISSUE_ECHEC);
      expect(tousEnEchec ? 'tous-les-candidats-ont-bien-echoue' : `INJECTION-SANS-EFFET ${rendu(trajectoiresEchec.map((t) => t.attempt_outcome))}`).toBe('tous-les-candidats-ont-bien-echoue');

      // TEMOIN 2 — « respecte ses plafonds » : MEME echelle, plafond SERRE
      // (sous le tarif unitaire 340, cahier:L103), execution ORDINAIRE (pas
      // de panne forcee) pour que le plafond, et rien d'autre, limite la
      // depense observee.
      const plafondServe = String((PETIT_LIVE_PLAFOND_SERRE.budget as Json).cap_micro_usd);
      const { appel: appelPlafond } = executerPilote(clone(PETIT_LIVE_PLAFOND_SERRE), 'a5-plafond-serre', MODE_LIVE);
      expect(appelPlafond.resultat !== null ? 'execution-live-plafond-serre-executee' : `EXECUTION-LIVE-EN-ECHEC ${messageEchec('T39.A5 plafond', appelPlafond)}`).toBe(
        'execution-live-plafond-serre-executee',
      );
      sortieNonPlantee(appelPlafond);
      const rPlafond = appelPlafond.resultat as Json;
      const totalPlafond = interpretMontant(rPlafond.total_cost_micro_usd);
      expect(totalPlafond !== null ? 'total_cost_micro_usd-conforme' : `MONTANT-NON-CONFORME (cahier:L80) ${rendu(rPlafond.total_cost_micro_usd)}`).toBe('total_cost_micro_usd-conforme');
      expect(
        (totalPlafond as number) <= Number(plafondServe)
          ? 'plafond-respecte'
          : `PLAFOND-DEPASSE total=${rendu(rPlafond.total_cost_micro_usd)} plafond=${plafondServe} (cahier:L501 « respecte ses plafonds »)`,
      ).toBe('plafond-respecte');

      // La campagne reste neanmoins AUTORISEE et laisse elle aussi des
      // resultats — un plafond serre n'est pas un refus d'admission.
      const trajectoiresPlafond = Array.isArray(rPlafond.trajectories) ? (rPlafond.trajectories as Json[]) : [];
      expect(trajectoiresPlafond.length > 0 ? 'campagne-autorisee-avec-resultats' : `CAMPAGNE-SANS-RESULTAT-SOUS-PLAFOND-SERRE ${rendu(rPlafond)}`).toBe('campagne-autorisee-avec-resultats');

      console.log(`[T39.A5] echec_total.trajectories=${trajectoiresEchec.length} plafond_serre.total=${rendu(rPlafond.total_cost_micro_usd)}/${plafondServe}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T39.A6 le preflight ne lance jamais implicitement la campagne',
    () => {
      // CONTROLE POSITIF D'ABORD (IV.4) : sur une base FRAICHE, une
      // invocation --execute DOIT laisser une trace retrouvable en base —
      // sans ce controle, une implementation qui n'ecrirait jamais rien
      // nulle part verdirait ce cas par accident.
      const { ctx: ctxExecute, appel: appelExecute } = executerPilote(clone(PETIT_RECORDED), 'a6-controle-execute', MODE_RECORDED);
      expect(appelExecute.resultat !== null ? 'execution-controle-executee' : `EXECUTION-CONTROLE-EN-ECHEC ${messageEchec('T39.A6 controle', appelExecute)}`).toBe(
        'execution-controle-executee',
      );
      const occurrencesApresExecution = occurrences(ctxExecute.db, ctxExecute.campaignId);
      expect(
        occurrencesApresExecution > 0 ? 'execute-ecrit-bien-quelque-chose' : `CONTROLE-INVALIDE aucune trace de ${ctxExecute.campaignId} apres --execute (n=${occurrencesApresExecution})`,
      ).toBe('execute-ecrit-bien-quelque-chose');

      // L'ENONCE DU CAS : un appel PREFLIGHT SEUL, sur sa PROPRE base
      // fraiche et son propre campaign_id, ne doit RIEN y ecrire.
      const { ctx: ctxPreflight, appel: appelPreflight } = preflight(clone(PETIT_RECORDED), 'a6-preflight');
      expect(appelPreflight.resultat !== null ? 'preflight-execute' : `PREFLIGHT-EN-ECHEC ${messageEchec('T39.A6', appelPreflight)}`).toBe('preflight-execute');
      const r = appelPreflight.resultat as Json;
      expect(r.execution_started === false ? 'execution_started-false' : `EXECUTION_STARTED-A-TORT-VRAI ${rendu(r.execution_started)}`).toBe('execution_started-false'); // cahier:L501

      // CONTROLE INDEPENDANT, en base reelle, pas seulement la valeur de
      // retour du processus (meme discipline que T23/T37/T38) : aucune
      // table ne doit mentionner ce campaign_id.
      const occurrencesApresPreflight = occurrences(ctxPreflight.db, ctxPreflight.campaignId);
      expect(
        occurrencesApresPreflight === 0
          ? 'aucune-trace-apres-preflight-seul'
          : `LANCEMENT-IMPLICITE-DETECTE ${ctxPreflight.campaignId} apparait ${occurrencesApresPreflight} fois en base apres un preflight sans --execute (cahier:L501)`,
      ).toBe('aucune-trace-apres-preflight-seul');

      console.log(`[T39.A6] occurrences(apres --execute)=${occurrencesApresExecution} occurrences(preflight seul)=${occurrencesApresPreflight}`);
    },
    CASE_TIMEOUT_MS,
  );
});
