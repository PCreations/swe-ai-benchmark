/**
 * acceptance/T76.spec.ts — suite d'acceptation de la tache T76.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T76.A1 behaviour — le prompt du bras B est identique octet pour octet a
 *                      celui du bras A a la meme periode, a l'ajout pres de la
 *                      consigne de methode declaree par le manifeste (ATDD et
 *                      principes SOLID)
 *   T76.A2 behaviour — lance par `bench pilot-conduct --provider claude-cli
 *                      --live` avec le faux executable `claude`, sur 24
 *                      periodes et deux trajectoires par bras, chaque periode
 *                      persistee porte les couts, les scores cibles et
 *                      differentiels, les regressions, et les mesures de
 *                      qualite du code (complexite, duplication, taille des
 *                      fonctions et des fichiers, nombre de tests ecrits par le
 *                      candidat, couverture)
 *   T76.A3 numeric   — le rapport donne, par bras et par periode, la moyenne,
 *                      le minimum, le maximum et l'effectif de chaque mesure, et
 *                      le rapport du cout de B sur celui de A par periode et
 *                      cumule, avec la methode de reechantillonnage de T33 sur
 *                      les trajectoires
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 * T76 est une tache d'extension ; son `spec_source` epingle ADR-021 L214-220
 * (docs/specs/T76.md). Le contrat ci-dessous derive :
 *   - d'ADR-021 L216 (livrables) : « bras declares dans le manifeste avec leur
 *     consigne de methode ; pilote F-PLATFORM de 24 periodes par trajectoire ;
 *     mesures de qualite du code ; rapport comparatif des bras » ;
 *   - d'ADR-021 L220 : « PostgreSQL, le stockage objet et le faux executable
 *     `claude` sont requis ; aucun appel reel » ;
 *   - d'ADR-021 decision 5 (« Ce qu'on mesure ») : deux bras partis de zero,
 *     memes 24 tickets, meme modele, meme outil ; « la seule difference est une
 *     phrase de methode ajoutee a chaque prompt du bras B » ; bras A « naturel :
 *     seulement le ticket, la spec et le contrat », bras B « developper en ATDD
 *     (tests d'acceptation ecrits d'abord, a partir des criteres du ticket) et
 *     respecter les principes SOLID » ; chaque bras repete (trajectoires
 *     independantes) ; mesures par periode : cout (tokens par categorie, tours,
 *     duree), resultat (score par clause cible et differentiel, regressions),
 *     qualite du code ; analyse : « le cout par periode et le cout cumule de B
 *     rapporte a A [...] avec les outils statistiques du cahier (rapport de
 *     couts, bootstrap, calcul de puissance) » ;
 *   - d'ADR-021 decision 3 : « Regressions : chaque clause encore active est
 *     recontrolee a chaque periode (G et `G_new` du cahier) » ;
 *   - du cahier T33 (L439-445) et d'analysis/src/bootstrap.py (PROUVE) : le
 *     reechantillonneur APPARIE (un meme tirage d'indices sert aux deux bras,
 *     T33.A2), les moyennes par unite avant tirage, le rapport des MOYENNES
 *     d'un tirage, le manifeste de tirages, et la bande ponctuelle par quantile
 *     empirique inverse (rang ceil(q n), sans interpolation, jamais etiquetee
 *     simultanee, T33.A1/A7) ;
 *   - des suites PROUVEES dont cette suite reprend le socle sans le reinventer :
 *     acceptance/T66.spec.ts (pilot-conduct claude-cli, PostgreSQL, faux
 *     `claude`, lecture tolerante du rapport, enregistrements de periode et
 *     objets de statistiques {mean, min, max, n}) ; acceptance/T73.spec.ts
 *     (documents de periode et prompt F-PLATFORM, scenario `F-PLATFORM` choisi
 *     par `source_scenario_id`) ; acceptance/T74.spec.ts (protocole
 *     bench.platform/1, notateurs cible et differentiel, candidat de reference
 *     et sa privation BENCH_DROP_CLAUSE) ; acceptance/T49.spec.ts (categories
 *     de tokens `input_fresh`, `cache_read`, `output`, `cache_write_*` tirees de
 *     `modelUsage`) ; acceptance/T55.spec.ts (module de derivation du faux
 *     `claude`).
 * Aveuglement PROCEDURAL (ADR-001) : aucune implementation de T76 n'existait a
 * l'ecriture. L'auteur a lu, en lecture seule, le code EXISTANT anterieur a T76
 * qu'empruntent deja T73/T74 (prompt F-PLATFORM, chemin claude-cli de
 * pilot-conduct) pour savoir ce que HEAD produit ; aucune valeur attendue n'en
 * est tiree.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CONTRAT FIXE ICI (ni ADR-021 ni le registre ne fixent de noms ; ils suivent
 * T39/T46/T49/T66)
 *
 * 1. LES BRAS SONT DECLARES DANS LE MANIFESTE, par un champ ADDITIF du schema
 *    `bench.pilot.manifest/1` (T39) :
 *      arms: [ { arm: "A" | "B", configuration: <id de `configurations`>,
 *                label?, method_instruction: string | null } ]
 *    Chaque bras est UNE configuration ; `repetitions` donne le nombre de
 *    trajectoires par bras. `method_instruction` est le texte EXACT ajoute au
 *    prompt de chaque periode du bras ; `null` : aucune consigne (bras A).
 *    Fixture : acceptance/fixtures/pilot-longitudinal/
 *    manifest-t76-claude-cli-f-platform-two-arms.json (un groupe F-PLATFORM, un
 *    clone, `cfg-t76-bras-a` / `cfg-t76-bras-b`, `repetitions: 2`,
 *    `periods_per_trajectory: 24`, soit 4 trajectoires et 96 periodes).
 *
 * 2. LE PROMPT (A1). Pour chaque periode n et chaque couple (session du bras A,
 *    session du bras B) a n, il existe un decoupage A = X + Y tel que
 *    B = X + M + Y, ou M, debarrasse de ses blancs de tete et de queue, est
 *    EXACTEMENT `method_instruction` du bras B (octets UTF-8). Les blancs de M
 *    (separateurs) sont libres ; rien d'autre ne peut differer. Le prompt est
 *    donc le meme pour les deux trajectoires d'un bras. Le prompt du bras A ne
 *    contient pas la consigne et renvoie, comme a T73, a `docs/spec.md`,
 *    `docs/api.md` et `docs/tickets/Pnn.md` de sa periode. Le prompt observe est
 *    celui que recoit le faux `claude` (argument de `-p`). La consigne est LUE
 *    DANS LE MANIFESTE : A1 relance un pilote court (2 periodes, 1 repetition)
 *    sur une copie du manifeste dont la consigne porte un jeton aleatoire.
 *    Rattachement d'un espace de travail a son bras : la ligne PostgreSQL que
 *    le chemin claude-cli persiste deja (T49 : identite de trajectoire et
 *    `workspace_dir`), puis la configuration de la trajectoire dans
 *    `trajectories[]` du rapport (T46), puis le bras de cette configuration
 *    dans le manifeste.
 *
 * 3. LE CANDIDAT EST UNE FIXTURE DU TEST-AUTHOR ECRITE PAR LE FAUX `claude`
 *    (module de derivation acceptance/fixtures/claude-cli/t76-two-arms-derive.mjs,
 *    mecanisme BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE de T55). Il LIT SON
 *    PROMPT : s'il contient la consigne du bras B (passee au module par
 *    BENCH_FAKE_CLAUDE_T76_INSTRUCTION), il « obeit » (un module par ticket,
 *    petites fonctions sans branche, tests `node:test` ecrits d'abord, k+1 par
 *    ticket pour la trajectoire de rang k) ; sinon il code « naturellement » (un
 *    seul module, une seule fonction ramifiee qui grossit de deux blocs
 *    copies-colles par ticket, aucun test). La plateforme elle-meme est le
 *    candidat de reference de T74, importe par `candidate.mjs` : 1 partout,
 *    SAUF la trajectoire de rang 2 du bras A, qui prive P6.R2 a partir de P9
 *    (une regression). La qualite du code depend donc du bras REELLEMENT
 *    servi par le prompt, jamais d'une etiquette.
 *    Extension ADDITIVE du faux executable (fichier bin/claude, en-tete) : le
 *    module de derivation peut rendre `stdout` ; T76 y place un JSON « success »
 *    dont tokens, `num_turns`, `duration_ms` et `total_cost_usd` sont tous
 *    proportionnels a un facteur entier f(bras, rang, periode), distinct pour
 *    les deux rangs d'un bras a une periode donnee.
 *
 * 4. LA FORME DU RAPPORT (stdout JSON de `pilot-conduct`), lue de maniere
 *    TOLERANTE (cles normalisees : minuscules, sans `_`/`-`/`.`) :
 *    a) `periods_persisted` (T60) vaut 96 ; `trajectories[]` (T46) porte
 *       `trajectory_key` et `configuration_id` ;
 *    b) ENREGISTREMENT DE PERIODE : tout objet qui porte une PERIODE (`period`,
 *       `period_id`, `period_key`, `period_index` ; « P7 », « P07 » ou 7) et des
 *       SCORES CIBLES (`targeted_scores`, `targeted`, `clause_scores`,
 *       `scores_by_clause`, `targeted_clause_scores` : table clause -> nombre ou
 *       {score}, ou objet {clauses}, ou liste [{clause, score}]), et qui a, lui
 *       ou un objet englobant, un BRAS (`arm` = "A"/"B", ou `configuration`,
 *       `configuration_id`, `config`, `config_id` = une configuration du
 *       manifeste) et une REPETITION (`repetition`, `repetition_index`, `rep`,
 *       `repetition_id`). Dans son sous-arbre (premier trouve en largeur) :
 *         couts      : tokens (`usage`, `tokens`, `token_usage` : liste par
 *                      modele, table par modele, ou objet) aux categories
 *                      `input_fresh`, `output`, `cache_read`, `cache_write*`
 *                      (sommees) ; tours (`turns`, `num_turns`) ; duree
 *                      (`duration_ms`, `session_duration_ms`, `duration`) ;
 *         differentiel : `differential_score` | `differential` (nombre ou
 *                      {score}) ;
 *         regressions : `regressions` | `open_regressions` | `regressed_clauses`
 *                      (liste d'identifiants de clause, texte ou {clause}) ;
 *         qualite    : six NOMBRES — complexite (`complexity`,
 *                      `cyclomatic_complexity`), duplication (`duplication`,
 *                      `duplicated_lines`, `duplication_ratio`), taille des
 *                      fonctions (`function_size`, `function_length`,
 *                      `function_lines`, `mean_function_lines`,
 *                      `max_function_lines`), taille des fichiers
 *                      (`file_size`, `file_length`, `file_lines`,
 *                      `mean_file_lines`, `max_file_lines`), tests
 *                      (`tests_written`, `test_count`, `tests`,
 *                      `candidate_tests`), couverture (`coverage`,
 *                      `test_coverage`, `line_coverage`).
 *    c) STATISTIQUE : objet {mean|avg|average|moyenne, min, max,
 *       n|count|effectif|sample_size} sous un BRAS (champ `arm`/configuration
 *       d'un objet englobant, ou cle "A"/"B"/`arm_a`/`arm_b`/id de
 *       configuration) et sous une PERIODE (champ `period`... d'un objet
 *       englobant, ou cle « P7 »/« P07 »). Son ETIQUETTE : les cles du chemin
 *       et les champs `measure`/`name`/`metric`/`clause`/`key`.
 *    d) RAPPORT DE COUT : sous la cle `cost_ratio` (alias `cost_ratio_b_over_a`,
 *       `ratio_b_over_a`, `b_over_a`, `cost_ratios`), deux series
 *       `per_period` (alias `by_period`, `periods`) et `cumulative` (alias
 *       `cumulated`, `cumul`), chacune liste [{period, ...}] ou table periode ->
 *       entree. Une entree : `ratio` (alias `value`, `estimate`, `point`) et le
 *       reechantillonnage (sous `resampling`/`bootstrap`, ou a meme l'entree) :
 *       `draws` (liste de tirages, chacun une liste de REPETITIONS — les valeurs
 *       du champ repetition des enregistrements ; ou, comme le manifeste de
 *       tirages de T33, une table {arm_a: [...], arm_b: [...]} de listes
 *       EGALES), `ratios` (un par tirage) et `interval` {lower, upper}.
 *
 * 5. DEFINITIONS (FIXEES ICI)
 *    - Clause ACTIVE a n : entree <= n < sortie, dans l'instantane de la source
 *      de clauses de T74 (acceptance/fixtures/candidates/f-platform-reference/).
 *      Les scores cibles d'une periode couvrent EXACTEMENT les clauses actives
 *      (c'est ce que rend le generateur de T74).
 *    - Clause SATISFAITE a n : score cible egal a 1. REGRESSIONS d'une periode
 *      n (G, cahier L189, F-REGRESSION par identifiant) : les clauses actives a
 *      n, non satisfaites a n, satisfaites a une periode anterieure de la MEME
 *      trajectoire. La liste persistee doit etre EXACTEMENT cet ensemble.
 *    - Tests du candidat : ce que `node --test` decouvre et execute a la racine
 *      du depot (conventions de Node 22) ; leur NOMBRE est celui des cas
 *      executes (`# tests`), et la COUVERTURE la fraction (0..1) du code du
 *      candidat executee par ces tests ; sans test, 0.
 *    - Les quatre autres mesures de qualite sont des nombres dont la definition
 *      exacte est laissee a l'implementation (somme, moyenne ou maximum) : la
 *      fixture est construite pour que le bras A les depasse STRICTEMENT sous
 *      toute definition raisonnable (A : une fonction de 2 + 26 n lignes et
 *      ~16 n branches dans un seul fichier, blocs identiques ; B : fonctions de
 *      trois lignes sans branche, un fichier court par ticket).
 *    - COUT d'une session pour le rapport B/A : une mesure LINEAIRE des comptes
 *      que rend la session (tokens, eventuellement valorises au tarif, tours) —
 *      jamais une duree d'horloge. La fixture rendant des comptes tous
 *      proportionnels a f, le rapport attendu est celui des f.
 *    - RAPPORT a n : moyenne des couts de B a n sur ses trajectoires divisee
 *      par celle de A (RAPPORT DES MOYENNES, jamais moyenne des rapports).
 *      CUMULE a n : idem sur les couts sommes de P1 a n.
 *    - TIRAGE (T33) : une liste de repetitions, de la taille du nombre de
 *      trajectoires par bras, appliquee aux DEUX bras ; son rapport = moyenne
 *      des couts de B sur les repetitions tirees / moyenne de A sur les memes.
 *      Bande : 2,5 % et 97,5 % par quantile empirique inverse sur les rapports
 *      des tirages ; si elle porte `simultaneous`, il vaut false.
 *    - « persistee » (A2) : les six mesures de qualite de chaque enregistrement
 *      se retrouvent, egales, dans un meme objet des lignes PostgreSQL de la
 *      base de la campagne (toutes les tables du schema `public`, JSON imbrique
 *      compris), comme T74.A3.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CE QUE CHAQUE CAS ASSERTE
 *
 *   A1 — sur les 96 sessions du pilote principal : quatre espaces de travail,
 *        24 sessions chacun (P1..P24, ticket present), deux par bras ; pour
 *        chaque periode et chaque couple (A, B), B = A + consigne (II.2) ; A ne
 *        contient pas la consigne et renvoie aux trois documents. Puis le
 *        pilote court a consigne jetonnee : meme predicat avec la consigne
 *        jetonnee, et la consigne du manifeste principal absente.
 *   A2 — 96 periodes persistees ; un enregistrement par (bras, repetition,
 *        periode) ; COUTS : tokens par categorie et tours egaux a ceux que la
 *        session de cette periode a rendus, duree presente ; les 24
 *        enregistrements d'une trajectoire viennent du meme espace de travail ;
 *        le notateur a lance le `candidate.mjs` de chaque periode (journal de
 *        demarrage) ; SCORES : clauses actives exactement, 1 partout sauf la
 *        trajectoire privee (1 jusqu'a P8, P6.R2 < 1 a P9), differentiel 1 sur
 *        les trajectoires fideles ; REGRESSIONS : exactement G (II.5), vide sur
 *        les fideles, P6.R2 a P9 sur la privee ; QUALITE : tests = nombre de cas
 *        ecrits, couverture 0 en A et dans ]0, 1[ en B, et A > B sur
 *        complexite, duplication, taille des fonctions et des fichiers a chaque
 *        periode ; PERSISTANCE des six mesures dans PostgreSQL.
 *   A3 — pour chaque bras et chaque periode, une statistique {mean, min, max,
 *        n = 2} par mesure : chaque clause active (score cible), le differentiel,
 *        le nombre de regressions, `input_fresh`, `output`, `cache_read`, les
 *        tours, la duree et les six mesures de qualite, egale a celle que la
 *        suite calcule sur les deux enregistrements ; puis le rapport B/A par
 *        periode et cumule, ses tirages (meme liste pour les deux bras), le
 *        rapport de chaque tirage recalcule et la bande par quantile inverse.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CONTROLES NEGATIFS (sans eux un cas pourrait etre creux)
 *
 *   A1 : le predicat d'insertion refuse B = A, B = A + consigne + un octet,
 *        B = A + consigne paraphrasee, et B = A modifie ailleurs + consigne.
 *   A2 : la fixture rend des sextuplets de qualite distincts (sinon la
 *        recherche en base serait creuse) ; la trajectoire privee doit
 *        presenter une regression (sinon « regressions vides » serait creux).
 *   A3 : a chaque periode, la moyenne des rapports (appariement par repetition
 *        ou croise) differe du rapport des moyennes attendu : la perturbation
 *        nommee par le registre est donc observable ; les rapports attendus
 *        different de 1 (le sens B/A est observable).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Ni la generation ni la notation des controles (T74), ni la performance et
 *    la concurrence (T75) — le pilote n'est pas tenu de les mesurer ici.
 *  • La definition exacte de la complexite, de la duplication et des tailles :
 *    seulement leur sens (A > B) sur une fixture extreme.
 *  • Le calcul de puissance (T35) : aucune exigence d'effectif n'est posee.
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde
 *    `verifierFauxEnTetePath`, reprise de T47/.../T73.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * DUREE
 *
 *   Domine par la notation de T74 sur 4 trajectoires x 24 periodes (environ
 *   2 min 30 s par trajectoire sur 4 coeurs) et par le pilote court de A1
 *   (2 x 2 periodes). Les sessions du faux `claude` sont immediates. Les trois
 *   cas partagent le pilote principal (execute une fois).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROC_TIMEOUT_MS = 14_400_000;
const CASE_TIMEOUT_MS = 15_000_000;
const BUILD_TIMEOUT_MS = 600_000;

const NOMBRE_DE_PERIODES = 24;
const TRAJECTOIRES_PAR_BRAS = 2;
const CLAUSE_PRIVEE = 'P6.R2';
const PERIODE_DE_PRIVATION = 9;
const RANG_PRIVE = 2; // du bras A (fixture t76-two-arms-derive.mjs)
const Q_BAS = 0.025;
const Q_HAUT = 0.975;
const EPS = 1e-9;

type Json = Record<string, unknown>;
type Bras = 'A' | 'B';
const BRAS: readonly Bras[] = ['A', 'B'];
const PERIODES = Array.from({ length: NOMBRE_DE_PERIODES }, (_, i) => i + 1);
const nn = (n: number): string => String(n).padStart(2, '0');

/* ────────────────────────────────────────────────────────────────── socle
 * commun — REPRIS de acceptance/T66.spec.ts. */

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

function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 10) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'symbol') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}
const court = (s: string, n = 900): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut, 6000)).toBe(sain);
}
/** Une liste de defauts doit etre vide ; sinon le cas rougit en les nommant. */
function aucunDefaut(defauts: string[], sain: string): void {
  const n = defauts.length;
  exige(n === 0, sain, `${String(n)} DEFAUT(S) : ${defauts.slice(0, 40).join(' || ')}${n > 40 ? ' || …' : ''}`);
}
const proche = (x: unknown, e: number): boolean =>
  typeof x === 'number' && Number.isFinite(x) && Math.abs(x - e) <= EPS * Math.max(1, Math.abs(e));

/* ════════════════════════════════════ PostgreSQL REEL (ADR-021 L220) */

const RUN = `t76_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
      timeout: 120_000,
      maxBuffer: 512 * 1024 * 1024,
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
const REPERTOIRES_CREES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`);
  BASES_CREEES.push(nom);
  return nom;
}

function repertoireJetable(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `t76-${prefixe}-`));
  REPERTOIRES_CREES.push(d);
  return d;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of REPERTOIRES_CREES) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/** Toutes les lignes du schema `public`, en objets (JSON imbrique et textes JSON compris). */
function lignesDeLaBase(db: string): unknown[] {
  const t = psql(db, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1");
  if (!t.ok) return [];
  const out: unknown[] = [];
  for (const table of t.out.split('\n').map((s) => s.trim()).filter((s) => s.length > 0)) {
    const r = psql(db, `SELECT row_to_json(t)::text FROM "${table.replace(/"/g, '""')}" t`);
    if (!r.ok) continue;
    for (const ligne of r.out.split('\n')) {
      if (ligne.trim() === '') continue;
      try {
        out.push(JSON.parse(ligne));
      } catch {
        /* ligne illisible : ignoree */
      }
    }
  }
  return out;
}

/** Tous les objets d'une valeur, a toute profondeur ; les textes JSON sont relus. */
function objetsProfonds(v: unknown, out: Json[] = [], profondeur = 0): Json[] {
  if (profondeur > 40) return out;
  if (typeof v === 'string') {
    const s = v.trim();
    if ((s.startsWith('{') || s.startsWith('[')) && s.length < 20_000_000) {
      try {
        objetsProfonds(JSON.parse(s), out, profondeur + 1);
      } catch {
        /* texte ordinaire */
      }
    }
    return out;
  }
  if (Array.isArray(v)) {
    for (const x of v) objetsProfonds(x, out, profondeur + 1);
    return out;
  }
  if (v !== null && typeof v === 'object') {
    out.push(v as Json);
    for (const x of Object.values(v as Json)) objetsProfonds(x, out, profondeur + 1);
  }
  return out;
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

type Tentative = { label: string; argv: string[]; exit: number | null; stdout: string; stderr: string };

function executer(argv: string[], env: NodeJS.ProcessEnv): { exit: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', argv, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { exit: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    return { exit: err.status ?? null, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
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
function construireUneFois(tentatives: Tentative[]): void {
  if (BUILD_TENTE) return;
  BUILD_TENTE = true;
  try {
    execFileSync('pnpm', ['build'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: BUILD_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: 0, stdout: 'build ok', stderr: '' });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    tentatives.push({
      label: 'pnpm build',
      argv: ['pnpm', 'build'],
      exit: err.status ?? null,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? ''),
    });
  }
}

type AppelCli = { resultat: Json | null; exit: number | null; tentatives: Tentative[] };

function lancer(sousCommande: string, drapeaux: string[], env: NodeJS.ProcessEnv): AppelCli {
  const tentatives: Tentative[] = [];
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, argv, exit: r.exit, stdout: r.stdout, stderr: r.stderr });
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
  return `${label} : ${
    appel.tentatives
      .map((t) => `${t.label} [exit ${String(t.exit)}] ${court(`${t.stdout}${t.stderr}`, 600).split('\n').slice(0, 3).join(' / ')}`)
      .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ════════════════════════ faux executable claude (reprise T47/.../T73) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');
const MODULE_DE_DERIVATION = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't76-two-arms-derive.mjs');
const CANDIDAT_REFERENCE = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-platform-reference-candidate.mjs');
const SOURCE_DE_CLAUSES = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-platform-reference', 'f-platform-clauses.mjs');

/** Garde explicite — JAMAIS la vraie CLI (`/opt/node22/bin/claude` ou toute autre). */
function verifierFauxEnTetePath(env: NodeJS.ProcessEnv): void {
  const pathVal = env.PATH ?? '';
  const dirs = pathVal.split(path.delimiter).filter((d) => d.length > 0);
  let trouve: string | null = null;
  for (const d of dirs) {
    const cand = path.join(d, 'claude');
    if (fs.existsSync(cand)) {
      trouve = cand;
      break;
    }
  }
  exige(
    trouve !== null && path.resolve(trouve) === path.resolve(CLAUDE_FIXTURE_BIN),
    'claude-resout-vers-le-faux-executable-de-cette-suite',
    `DANGER-APPEL-REEL-POSSIBLE : claude resout vers ${rendu(trouve)}, attendu ${rendu(CLAUDE_FIXTURE_BIN)}`,
  );
}

function envFauxClaude(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: SOCKET_DIR,
    PGUSER: PG_USER,
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    ...extra,
  };
  // Aucun appel reel, et rien de la suite ne fuit vers le candidat.
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.BENCH_DROP_CLAUSE;
  delete env.BENCH_TRAFFIC_LOG;
  delete env.BENCH_FAULT_LOCK;
  verifierFauxEnTetePath(env);
  return env;
}

/* ═══════════════════════════════════ manifeste et bras (II.1) ═══════════ */

const MANIFESTE_PRINCIPAL = path.join(
  REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t76-claude-cli-f-platform-two-arms.json',
);

interface DeclarationBras {
  arm: Bras;
  configuration: string;
  method_instruction: string | null;
}

function lireManifeste(f: string): { brut: Json; bras: DeclarationBras[] } {
  const brut = JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
  const bras = (Array.isArray(brut.arms) ? brut.arms : []) as DeclarationBras[];
  return { brut, bras };
}

function consigneDe(bras: DeclarationBras[]): string {
  const b = bras.find((x) => x.arm === 'B');
  return typeof b?.method_instruction === 'string' ? b.method_instruction : '';
}

/* ═══════════════════════════ source de clauses (instantane de T74) ═════ */

interface Clause {
  id: string;
  entree: number;
  sortie: number | null;
}
let CLAUSES: Clause[] | null = null;
function clauses(): Clause[] {
  if (CLAUSES !== null) return CLAUSES;
  const code = `import(${JSON.stringify(`file://${SOURCE_DE_CLAUSES}`)}).then((m) => process.stdout.write(JSON.stringify(m.PLATFORM_CLAUSES.map((c) => ({ id: c.id, enters: c.enters, exits: c.exits })))))`;
  const out = execFileSync('node', ['--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const num = (x: unknown): number | null => (x === null || x === undefined ? null : Number(String(x).replace(/^P/i, '')));
  CLAUSES = (JSON.parse(out) as { id: string; enters: unknown; exits: unknown }[]).map((c) => ({
    id: c.id,
    entree: num(c.enters) ?? 0,
    sortie: num(c.exits),
  }));
  return CLAUSES;
}
function activesA(n: number): string[] {
  return clauses()
    .filter((c) => c.entree <= n && (c.sortie === null || n < c.sortie))
    .map((c) => c.id)
    .sort();
}

/* ══════════════════════════════════════════ execution d'un pilote ═════ */

interface Session {
  prompt: string;
  cwd: string;
  bras: Bras;
  bras_de_la_trajectoire: Bras;
  rang: number;
  periode: number;
  session_de_la_trajectoire: number;
  f: number;
  comptes: { input_fresh: number; output: number; cache_read: number; cache_write: number; turns: number; duration_ms: number };
  tests_ecrits: number;
  privation: string;
}

interface Execution {
  appel: AppelCli;
  db: string;
  sessions: Session[];
  lancements: Map<string, number>; // `${bras}-${rang}-Pnn` -> demarrages du candidat
  enregistrementsFaux: number;
}

function executerPilote(suffixe: string, manifeste: string, consigne: string): Execution {
  for (const f of [manifeste, MODULE_DE_DERIVATION, CANDIDAT_REFERENCE, CLAUDE_FIXTURE_BIN]) {
    exige(fs.existsSync(f), `fixture-presente-${path.basename(f)}`, `FIXTURE-ABSENTE : ${f}`);
  }
  const db = creerBase(suffixe);
  const etat = repertoireJetable(`etat-${suffixe}`);
  const racine = repertoireJetable(`ws-${suffixe}`);
  const env = envFauxClaude({
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: MODULE_DE_DERIVATION,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: path.join(etat, 'derive-log'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: path.join(etat, 'records'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: path.join(etat, 'record-counter.txt'),
    BENCH_FAKE_CLAUDE_T76_INSTRUCTION: consigne,
    BENCH_FAKE_CLAUDE_T76_STATE_DIR: etat,
  });
  const appel = lancer(
    'pilot-conduct',
    [
      manifeste,
      '--campaign-id', `t76-${RUN}-${suffixe}-${randomUUID()}`,
      '--postgres-database', db,
      '--s3-bucket', `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
      '--mode', 'recorded',
      '--provider', 'claude-cli',
      '--live',
      '--candidate-workspace-root', racine,
    ],
    env,
  );
  const sessions: Session[] = [];
  const dirSessions = path.join(etat, 'sessions');
  if (fs.existsSync(dirSessions)) {
    for (const f of fs.readdirSync(dirSessions).sort()) {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(dirSessions, f), 'utf8')) as Session;
        s.cwd = fs.existsSync(s.cwd) ? fs.realpathSync(s.cwd) : s.cwd;
        sessions.push(s);
      } catch {
        /* journal partiel : ignore */
      }
    }
  }
  const lancements = new Map<string, number>();
  const dirLancements = path.join(etat, 'lancements');
  if (fs.existsSync(dirLancements)) {
    for (const f of fs.readdirSync(dirLancements)) {
      const m = /^([AB]-\d+-P\d{2})\.log$/.exec(f);
      if (m === null) continue;
      const lignes = fs.readFileSync(path.join(dirLancements, f), 'utf8').split('\n').filter((l) => l.trim() !== '');
      lancements.set(m[1] as string, lignes.length);
    }
  }
  const dirRecords = path.join(etat, 'records');
  const enregistrementsFaux = fs.existsSync(dirRecords) ? fs.readdirSync(dirRecords).filter((f) => /^record-\d+\.json$/.test(f)).length : 0;
  return { appel, db, sessions, lancements, enregistrementsFaux };
}

let PRINCIPAL: Execution | null = null;
function pilotePrincipal(): Execution {
  if (PRINCIPAL === null) {
    PRINCIPAL = executerPilote('main', MANIFESTE_PRINCIPAL, consigneDe(lireManifeste(MANIFESTE_PRINCIPAL).bras));
  }
  return PRINCIPAL;
}

function exigeExecution(ex: Execution, etiquette: string, periodesAttendues: number): Json {
  exige(
    ex.appel.resultat !== null && ex.appel.exit === 0,
    `pilot-conduct-f-platform-execute-${etiquette}`,
    messageEchec(`pilot-conduct(${etiquette})`, ex.appel),
  );
  const rapport = ex.appel.resultat as Json;
  exige(
    rapport.periods_persisted === periodesAttendues,
    `periodes-persistees-${periodesAttendues}-${etiquette}`,
    `PERIODES-PERSISTEES-INATTENDUES (${etiquette}) : periods_persisted=${rendu(rapport.periods_persisted)}, attendu ${periodesAttendues}`,
  );
  exige(
    ex.sessions.length === periodesAttendues && ex.enregistrementsFaux >= periodesAttendues,
    `une-session-claude-par-periode-${etiquette}`,
    `SESSIONS-DU-FAUX-CLAUDE (${etiquette}) : ${ex.sessions.length} session(s) derivee(s), ${ex.enregistrementsFaux} invocation(s) enregistree(s), attendu ${periodesAttendues}`,
  );
  return rapport;
}

/* ══════════════════════════ lecture tolerante du rapport (II.4) ═════════ */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');
function obj(v: unknown): Json | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function champ(o: Json, alias: readonly string[]): { present: boolean; valeur: unknown } {
  const cible = new Set(alias.map(normKey));
  for (const [k, v] of Object.entries(o)) {
    if (cible.has(normKey(k))) return { present: true, valeur: v };
  }
  return { present: false, valeur: undefined };
}
/** Premier champ (parcours en largeur du sous-arbre) dont la cle est un alias et la valeur accepte. */
function enLargeur(racine: unknown, alias: readonly string[], accepte: (v: unknown) => boolean): unknown {
  const cible = new Set(alias.map(normKey));
  const file: unknown[] = [racine];
  let vus = 0;
  while (file.length > 0 && vus < 20_000) {
    const v = file.shift();
    vus += 1;
    if (Array.isArray(v)) {
      file.push(...v);
      continue;
    }
    const o = obj(v);
    if (o === null) continue;
    for (const [k, x] of Object.entries(o)) {
      if (cible.has(normKey(k)) && accepte(x)) return x;
    }
    for (const x of Object.values(o)) if (x !== null && typeof x === 'object') file.push(x);
  }
  return undefined;
}
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const ALIAS_PERIODE = ['period', 'period_id', 'period_key', 'period_index', 'period_name'];
const ALIAS_REPETITION = ['repetition', 'repetition_index', 'repetition_id', 'repetition_number', 'rep', 'rep_index'];
const ALIAS_CONFIGURATION = ['configuration', 'configuration_id', 'config', 'config_id'];
const ALIAS_BRAS = ['arm', 'arm_id', 'bras'];
const ALIAS_TRAJECTOIRE = ['trajectory_key', 'trajectory', 'trajectory_id'];
const ALIAS_CIBLE = ['targeted_scores', 'targeted', 'clause_scores', 'scores_by_clause', 'targeted_clause_scores', 'scores_cibles'];
const ALIAS_DIFFERENTIEL = ['differential_score', 'differential', 'score_differentiel', 'differential_scores'];
const ALIAS_REGRESSIONS = ['regressions', 'open_regressions', 'regressed_clauses', 'regression_clauses'];
const ALIAS_USAGE = ['usage', 'tokens', 'token_usage', 'tokens_by_category'];
const ALIAS_TOURS = ['turns', 'num_turns', 'turn_count', 'tours'];
const ALIAS_DUREE = ['duration_ms', 'session_duration_ms', 'duration', 'duree_ms', 'wall_ms'];

const MESURES_QUALITE = {
  complexite: ['complexity', 'cyclomatic_complexity', 'complexite', 'cyclomatic'],
  duplication: ['duplication', 'duplicated_lines', 'duplication_ratio', 'duplicate_lines', 'duplicated_line_ratio'],
  taille_fonctions: ['function_size', 'function_length', 'function_lines', 'mean_function_lines', 'max_function_lines', 'avg_function_lines', 'taille_des_fonctions'],
  taille_fichiers: ['file_size', 'file_length', 'file_lines', 'mean_file_lines', 'max_file_lines', 'avg_file_lines', 'taille_des_fichiers'],
  tests: ['tests_written', 'test_count', 'tests', 'candidate_tests', 'tests_written_by_candidate', 'nombre_de_tests', 'test_cases'],
  couverture: ['coverage', 'test_coverage', 'line_coverage', 'couverture', 'coverage_ratio'],
} as const;
type MesureQualite = keyof typeof MESURES_QUALITE;
const NOMS_QUALITE = Object.keys(MESURES_QUALITE) as MesureQualite[];

function normPeriode(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : null;
  if (s === null) return null;
  const m = /^p?(\d{1,2})$/i.exec(s);
  if (m === null) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= NOMBRE_DE_PERIODES ? n : null;
}
function normRepetition(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return null;
}

function clauseDe(v: unknown): string | null {
  if (typeof v === 'string' && /^P\d+\.R\d+$/.test(v.trim())) return v.trim();
  const o = obj(v);
  if (o === null) return null;
  const c = champ(o, ['clause', 'clause_id', 'clauseId', 'id']);
  return typeof c.valeur === 'string' && /^P\d+\.R\d+$/.test(c.valeur) ? c.valeur : null;
}

function scoresCibles(v: unknown): Map<string, number> | null {
  const out = new Map<string, number>();
  const score = (x: unknown): number | null => {
    if (estNombre(x)) return x;
    const o = obj(x);
    if (o === null) return null;
    const s = champ(o, ['score', 'fraction', 'ratio']);
    return estNombre(s.valeur) ? s.valeur : null;
  };
  if (Array.isArray(v)) {
    for (const e of v) {
      const c = clauseDe(e);
      const s = score(e);
      if (c !== null && s !== null) out.set(c, s);
    }
    return out.size > 0 ? out : null;
  }
  const o = obj(v);
  if (o === null) return null;
  const sous = champ(o, ['clauses', 'by_clause', 'scores']);
  if (sous.present && sous.valeur !== v) {
    const r = scoresCibles(sous.valeur);
    if (r !== null) return r;
  }
  for (const [k, x] of Object.entries(o)) {
    if (!/^P\d+\.R\d+$/.test(k)) continue;
    const s = score(x);
    if (s !== null) out.set(k, s);
  }
  return out.size > 0 ? out : null;
}

function regressionsDe(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((e) => clauseDe(e) ?? rendu(e));
}

interface Jetons {
  input_fresh: number;
  output: number;
  cache_read: number;
  cache_write: number;
}
function jetonsDe(enreg: Json): Jetons | null {
  const somme = (objets: Json[]): Jetons | null => {
    const t: Jetons = { input_fresh: 0, output: 0, cache_read: 0, cache_write: 0 };
    let vu = false;
    for (const o of objets) {
      for (const [k, x] of Object.entries(o)) {
        if (!estNombre(x)) continue;
        const nk = normKey(k);
        if (nk === 'inputfresh') { t.input_fresh += x; vu = true; }
        else if (nk === 'output') { t.output += x; vu = true; }
        else if (nk === 'cacheread') { t.cache_read += x; vu = true; }
        else if (nk.startsWith('cachewrite')) { t.cache_write += x; vu = true; }
      }
    }
    return vu ? t : null;
  };
  const aCategories = (o: Json): boolean => Object.keys(o).some((k) => normKey(k) === 'inputfresh');
  const u = enLargeur(enreg, ALIAS_USAGE, (x) => x !== null && typeof x === 'object');
  if (Array.isArray(u)) return somme(u.map(obj).filter((o): o is Json => o !== null));
  const ou = obj(u);
  if (ou !== null) {
    if (aCategories(ou)) return somme([ou]);
    const parModele = Object.values(ou).map(obj).filter((o): o is Json => o !== null && aCategories(o));
    if (parModele.length > 0) return somme(parModele);
  }
  const direct = objetsProfonds(enreg).find(aCategories);
  return direct !== undefined ? somme([direct]) : null;
}

interface Enregistrement {
  bras: Bras;
  repetition: string;
  trajectoire: string | null;
  periode: number;
  cibles: Map<string, number>;
  differentiel: number | null;
  regressions: string[] | null;
  jetons: Jetons | null;
  tours: number | null;
  duree: number | null;
  qualite: Record<MesureQualite, number | null>;
  chemin: string;
}

function brasDe(o: Json, configurations: Map<string, Bras>): Bras | null {
  const a = champ(o, ALIAS_BRAS);
  if (a.present && (a.valeur === 'A' || a.valeur === 'B')) return a.valeur;
  const c = champ(o, ALIAS_CONFIGURATION);
  if (c.present && typeof c.valeur === 'string' && configurations.has(c.valeur)) return configurations.get(c.valeur) ?? null;
  return null;
}

/** II.4.b — enregistrements de periode, avec heritage du bras, de la repetition et de la trajectoire. */
function enregistrementsDePeriode(rapport: unknown, configurations: Map<string, Bras>): Enregistrement[] {
  const out: Enregistrement[] = [];
  const visiter = (v: unknown, chemin: string, bras: Bras | null, rep: string | null, traj: string | null, profondeur: number): void => {
    if (profondeur > 16) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => visiter(x, `${chemin}[${i}]`, bras, rep, traj, profondeur + 1));
      return;
    }
    const o = obj(v);
    if (o === null) return;
    const brasIci = brasDe(o, configurations) ?? bras;
    const r = champ(o, ALIAS_REPETITION);
    const repIci = r.present ? normRepetition(r.valeur) ?? rep : rep;
    const t = champ(o, ALIAS_TRAJECTOIRE);
    const trajIci = t.present && typeof t.valeur === 'string' ? t.valeur : traj;
    const p = champ(o, ALIAS_PERIODE);
    const c = champ(o, ALIAS_CIBLE);
    if (p.present && c.present && brasIci !== null && repIci !== null) {
      const periode = normPeriode(p.valeur);
      const cibles = scoresCibles(c.valeur);
      if (periode !== null && cibles !== null) {
        const d = enLargeur(o, ALIAS_DIFFERENTIEL, (x) => estNombre(x) || (obj(x) !== null && estNombre(champ(obj(x) as Json, ['score']).valeur)));
        const differentiel = estNombre(d) ? d : obj(d) !== null ? (champ(obj(d) as Json, ['score']).valeur as number) : null;
        const g = enLargeur(o, ALIAS_REGRESSIONS, (x) => Array.isArray(x));
        const tours = enLargeur(o, ALIAS_TOURS, estNombre);
        const duree = enLargeur(o, ALIAS_DUREE, estNombre);
        const qualite = {} as Record<MesureQualite, number | null>;
        for (const m of NOMS_QUALITE) {
          const x = enLargeur(o, MESURES_QUALITE[m], estNombre);
          qualite[m] = estNombre(x) ? x : null;
        }
        out.push({
          bras: brasIci,
          repetition: repIci,
          trajectoire: trajIci,
          periode,
          cibles,
          differentiel,
          regressions: regressionsDe(g),
          jetons: jetonsDe(o),
          tours: estNombre(tours) ? tours : null,
          duree: estNombre(duree) ? duree : null,
          qualite,
          chemin,
        });
        return;
      }
    }
    for (const [k, x] of Object.entries(o)) visiter(x, `${chemin}.${k}`, brasIci, repIci, trajIci, profondeur + 1);
  };
  visiter(rapport, '$', null, null, null, 0);
  return out;
}

/** Les enregistrements, indexes (bras, repetition) -> periode -> enregistrement ; avec les defauts de structure. */
interface Trajectoires {
  parBras: Map<Bras, Map<string, Map<number, Enregistrement>>>;
  defauts: string[];
}
function trajectoiresDu(rapport: unknown, configurations: Map<string, Bras>): Trajectoires {
  const recs = enregistrementsDePeriode(rapport, configurations);
  const parBras = new Map<Bras, Map<string, Map<number, Enregistrement>>>();
  const defauts: string[] = [];
  for (const b of BRAS) parBras.set(b, new Map());
  for (const r of recs) {
    const reps = parBras.get(r.bras) as Map<string, Map<number, Enregistrement>>;
    const parPeriode = reps.get(r.repetition) ?? new Map<number, Enregistrement>();
    const deja = parPeriode.get(r.periode);
    if (deja !== undefined) {
      // Le meme enregistrement peut figurer a deux endroits du rapport ; deux contenus differents, jamais.
      const empreinte = (e: Enregistrement): string => rendu([[...e.cibles].sort(), e.differentiel, e.regressions, e.jetons, e.tours, e.qualite]);
      if (empreinte(deja) !== empreinte(r)) defauts.push(`DEUX ENREGISTREMENTS DIFFERENTS pour bras ${r.bras} rep ${r.repetition} P${r.periode} (${deja.chemin} / ${r.chemin})`);
      continue;
    }
    parPeriode.set(r.periode, r);
    reps.set(r.repetition, parPeriode);
  }
  for (const b of BRAS) {
    const reps = parBras.get(b) as Map<string, Map<number, Enregistrement>>;
    if (reps.size !== TRAJECTOIRES_PAR_BRAS) {
      defauts.push(`bras ${b} : ${reps.size} trajectoire(s) (repetitions ${rendu([...reps.keys()])}), attendu ${TRAJECTOIRES_PAR_BRAS}`);
    }
    for (const [rep, parPeriode] of reps) {
      const manquantes = PERIODES.filter((n) => !parPeriode.has(n));
      if (manquantes.length > 0 || parPeriode.size !== NOMBRE_DE_PERIODES) {
        defauts.push(`bras ${b} rep ${rep} : periodes manquantes ${rendu(manquantes.map((n) => `P${n}`))} (${parPeriode.size} enregistrement(s))`);
      }
    }
  }
  const repsA = [...(parBras.get('A') as Map<string, unknown>).keys()].sort();
  const repsB = [...(parBras.get('B') as Map<string, unknown>).keys()].sort();
  if (JSON.stringify(repsA) !== JSON.stringify(repsB)) {
    defauts.push(`les bras n'ont pas les memes repetitions : A ${rendu(repsA)}, B ${rendu(repsB)} (appariement T33 impossible)`);
  }
  if (recs.length === 0) defauts.push('AUCUN enregistrement de periode (II.4.b) dans le rapport');
  return { parBras, defauts };
}

function configurationsDu(bras: DeclarationBras[]): Map<string, Bras> {
  return new Map(bras.map((b) => [b.configuration, b.arm]));
}

/** Rattache chaque enregistrement a la session du faux `claude` qui l'a produit : (bras, periode, f). */
function sessionDe(r: Enregistrement, sessions: Session[]): Session | null {
  if (r.jetons === null) return null;
  const f = r.jetons.input_fresh / 1000;
  return sessions.find((s) => s.bras === r.bras && s.periode === r.periode && s.f === f) ?? null;
}

/** Regressions attendues (II.5) d'une trajectoire, periode par periode. */
function regressionsAttendues(parPeriode: Map<number, Enregistrement>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const dejaSatisfaites = new Set<string>();
  for (const n of PERIODES) {
    const r = parPeriode.get(n);
    if (r === undefined) continue;
    const g: string[] = [];
    for (const c of activesA(n)) {
      const s = r.cibles.get(c);
      if (s !== undefined && s < 1 && dejaSatisfaites.has(c)) g.push(c);
    }
    out.set(n, g.sort());
    for (const [c, s] of r.cibles) if (s === 1) dejaSatisfaites.add(c);
  }
  return out;
}

/* ═══════════════════════════════════ A1 : predicat d'insertion (II.2) ═══ */

/** B = X + M + Y avec A = X + Y et M.trim() === consigne, compare en octets UTF-8. */
function estInsertion(a: string, b: string, consigne: string): boolean {
  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  const C = Buffer.from(consigne, 'utf8');
  if (C.length === 0 || B.length < A.length + C.length) return false;
  const delta = B.length - A.length;
  let prefixe = 0;
  while (prefixe < A.length && A[prefixe] === B[prefixe]) prefixe += 1;
  let suffixe = 0;
  while (suffixe < A.length && A[A.length - 1 - suffixe] === B[B.length - 1 - suffixe]) suffixe += 1;
  for (let i = Math.max(0, A.length - suffixe); i <= prefixe; i += 1) {
    if (!A.subarray(0, i).equals(B.subarray(0, i))) continue;
    if (!A.subarray(i).equals(B.subarray(i + delta))) continue;
    const milieu = B.subarray(i, i + delta).toString('utf8');
    if (Buffer.from(milieu.trim(), 'utf8').equals(C)) return true;
  }
  return false;
}

/** Espace de travail -> bras, par les lignes PostgreSQL (T49) et `trajectories[]` (T46). */
function brasDesEspaces(ex: Execution, rapport: Json, configurations: Map<string, Bras>): Map<string, Bras> {
  const trajectoires = Array.isArray(rapport.trajectories) ? (rapport.trajectories as unknown[]) : [];
  const brasDeCle = new Map<string, Bras>();
  for (const t of trajectoires) {
    const o = obj(t);
    if (o === null) continue;
    const k = champ(o, ['trajectory_key']);
    const c = champ(o, ALIAS_CONFIGURATION);
    if (typeof k.valeur === 'string' && typeof c.valeur === 'string' && configurations.has(c.valeur)) {
      brasDeCle.set(k.valeur, configurations.get(c.valeur) as Bras);
    }
  }
  const espaces = new Set(ex.sessions.map((s) => s.cwd));
  const out = new Map<string, Bras>();
  for (const ligne of lignesDeLaBase(ex.db)) {
    for (const o of objetsProfonds(ligne)) {
      const textes = Object.values(o).filter((x): x is string => typeof x === 'string');
      const cle = textes.find((x) => brasDeCle.has(x));
      if (cle === undefined) continue;
      for (const x of textes) {
        if (!x.startsWith('/')) continue;
        let reel = x;
        try {
          reel = fs.realpathSync(x);
        } catch {
          /* chemin disparu */
        }
        if (espaces.has(reel)) out.set(reel, brasDeCle.get(cle) as Bras);
      }
    }
  }
  return out;
}

function verifierPrompts(ex: Execution, rapport: Json, bras: DeclarationBras[], periodes: number[], etiquette: string): void {
  const configurations = configurationsDu(bras);
  const consigne = consigneDe(bras);
  const parEspace = new Map<string, Session[]>();
  for (const s of ex.sessions) parEspace.set(s.cwd, [...(parEspace.get(s.cwd) ?? []), s]);
  const brasDe = brasDesEspaces(ex, rapport, configurations);
  const defauts: string[] = [];
  for (const [cwd, ss] of parEspace) {
    const vues = ss.map((s) => s.periode).sort((x, y) => x - y);
    if (JSON.stringify(vues) !== JSON.stringify(periodes)) defauts.push(`espace ${cwd} : periodes ${rendu(vues)}, attendu ${rendu(periodes)}`);
    if (!brasDe.has(cwd)) defauts.push(`espace ${cwd} : aucune trajectoire persistee ne le rattache a un bras (ligne PostgreSQL + trajectories[])`);
  }
  for (const b of BRAS) {
    const n = [...parEspace.keys()].filter((c) => brasDe.get(c) === b).length;
    const attendu = periodes.length === NOMBRE_DE_PERIODES ? TRAJECTOIRES_PAR_BRAS : 1;
    if (n !== attendu) defauts.push(`bras ${b} : ${n} espace(s) de travail, attendu ${attendu}`);
  }
  aucunDefaut(defauts, `sessions-rattachees-aux-bras-${etiquette}`);

  const ecarts: string[] = [];
  for (const n of periodes) {
    const a = ex.sessions.filter((s) => s.periode === n && brasDe.get(s.cwd) === 'A');
    const b = ex.sessions.filter((s) => s.periode === n && brasDe.get(s.cwd) === 'B');
    if (a.length === 0 || b.length === 0) ecarts.push(`P${n} : ${a.length} session(s) A, ${b.length} session(s) B`);
    for (const sa of a) {
      if (sa.prompt.includes(consigne)) ecarts.push(`P${n} : le prompt du bras A contient la consigne de methode`);
      for (const doc of ['docs/spec.md', 'docs/api.md', `docs/tickets/P${nn(n)}.md`]) {
        if (!sa.prompt.includes(doc)) ecarts.push(`P${n} : le prompt du bras A ne renvoie pas a ${doc}`);
      }
      for (const sb of b) {
        if (!estInsertion(sa.prompt, sb.prompt, consigne)) {
          ecarts.push(`P${n} : prompt B != prompt A + consigne (A ${rendu(court(sa.prompt, 300))} ; B ${rendu(court(sb.prompt, 400))})`);
        }
      }
    }
  }
  aucunDefaut(ecarts, `prompt-B-egal-prompt-A-plus-consigne-du-manifeste-${etiquette}`);
}

/* ══════════════════════════ A3 : statistiques par bras et periode ═══════ */

interface Statistique {
  bras: Bras;
  periode: number;
  etiquette: string[]; // normalisees
  mean: number;
  min: number;
  max: number;
  n: number;
}
const ALIAS_MOYENNE = ['mean', 'avg', 'average', 'moyenne'];
const ALIAS_EFFECTIF = ['n', 'count', 'effectif', 'sample_size', 'nobs'];
const ALIAS_ETIQUETTE = ['measure', 'name', 'metric', 'clause', 'clause_id', 'key'];

function statistiques(rapport: unknown, configurations: Map<string, Bras>): Statistique[] {
  const out: Statistique[] = [];
  const brasDeCle = (k: string): Bras | null => {
    const nk = normKey(k);
    if (nk === 'a' || nk === 'arma' || nk === 'brasa') return 'A';
    if (nk === 'b' || nk === 'armb' || nk === 'brasb') return 'B';
    return configurations.get(k) ?? null;
  };
  const visiter = (v: unknown, etiquette: string[], bras: Bras | null, periode: number | null, profondeur: number): void => {
    if (profondeur > 18) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visiter(x, etiquette, bras, periode, profondeur + 1));
      return;
    }
    const o = obj(v);
    if (o === null) return;
    const brasIci = brasDe(o, configurations) ?? bras;
    const p = champ(o, ALIAS_PERIODE);
    const periodeIci = p.present ? normPeriode(p.valeur) ?? periode : periode;
    const ici: string[] = [];
    for (const a of ALIAS_ETIQUETTE) {
      const x = champ(o, [a]);
      if (x.present && typeof x.valeur === 'string') ici.push(normKey(x.valeur));
    }
    const mean = champ(o, ALIAS_MOYENNE);
    const min = champ(o, ['min', 'minimum']);
    const max = champ(o, ['max', 'maximum']);
    const n = champ(o, ALIAS_EFFECTIF);
    if (estNombre(mean.valeur) && estNombre(min.valeur) && estNombre(max.valeur) && estNombre(n.valeur)) {
      if (brasIci !== null && periodeIci !== null) {
        out.push({ bras: brasIci, periode: periodeIci, etiquette: [...etiquette, ...ici], mean: mean.valeur, min: min.valeur, max: max.valeur, n: n.valeur });
      }
      return;
    }
    for (const [k, x] of Object.entries(o)) {
      const b = brasDeCle(k);
      const pk = /^p\d{1,2}$/i.test(k) ? normPeriode(k) : null;
      visiter(x, [...etiquette, ...ici, normKey(k)], b ?? brasIci, pk ?? periodeIci, profondeur + 1);
    }
  };
  visiter(rapport, [], null, null, 0);
  return out;
}

/* ═══════════════════════ A3 : rapport de cout et reechantillonnage ══════ */

const ALIAS_RAPPORT_COUT = ['cost_ratio', 'cost_ratio_b_over_a', 'cost_ratio_b_a', 'ratio_b_over_a', 'b_over_a', 'cost_ratios', 'rapport_des_couts'];
const ALIAS_PAR_PERIODE = ['per_period', 'by_period', 'periods', 'par_periode'];
const ALIAS_CUMUL = ['cumulative', 'cumulated', 'cumul', 'cumule', 'cumulative_by_period'];
const ALIAS_VALEUR = ['ratio', 'value', 'estimate', 'point', 'point_estimate'];
const ALIAS_REECH = ['resampling', 'bootstrap', 'reechantillonnage', 'resample'];
const ALIAS_TIRAGES = ['draws', 'draw_manifest', 'tirages', 'resamples'];
const ALIAS_RATIOS = ['ratios', 'draw_ratios', 'replicates', 'bootstrap_ratios'];
const ALIAS_INTERVALLE = ['interval', 'band', 'bande', 'pointwise_interval', 'intervalle'];

function serieParPeriode(v: unknown): Map<number, Json> {
  const out = new Map<number, Json>();
  if (Array.isArray(v)) {
    for (const e of v) {
      const o = obj(e);
      if (o === null) continue;
      const p = normPeriode(champ(o, ALIAS_PERIODE).valeur);
      if (p !== null) out.set(p, o);
    }
    return out;
  }
  const o = obj(v);
  if (o === null) return out;
  for (const [k, x] of Object.entries(o)) {
    const p = normPeriode(k);
    const ox = obj(x);
    if (p !== null && ox !== null) out.set(p, ox);
    else if (p !== null && estNombre(x)) out.set(p, { ratio: x });
  }
  return out;
}

/** Les tirages d'une entree, en listes de repetitions ; null si les deux bras ne suivent pas les memes indices. */
function tiragesDe(v: unknown, repetitionDe: (bras: Bras, x: unknown) => string | null): { tirages: string[][] | null; defaut: string | null } {
  const liste = (x: unknown, bras: Bras): string[] | null => {
    if (!Array.isArray(x)) return null;
    const r = x.map((e) => repetitionDe(bras, e));
    return r.every((e) => e !== null) ? (r as string[]) : null;
  };
  const listes = (x: unknown, bras: Bras): string[][] | null => {
    if (!Array.isArray(x)) return null;
    const r = x.map((d) => liste(d, bras));
    return r.every((d) => d !== null) ? (r as string[][]) : null;
  };
  const brasDuNom = (k: string): Bras | null => {
    const nk = normKey(k);
    if (nk === 'a' || nk.startsWith('arma') || nk === 'brasa') return 'A';
    if (nk === 'b' || nk.startsWith('armb') || nk === 'brasb') return 'B';
    return null;
  };
  if (Array.isArray(v) && v.every((d) => Array.isArray(d))) {
    const t = listes(v, 'A');
    const tb = listes(v, 'B');
    if (t === null || tb === null) return { tirages: null, defaut: `tirages illisibles ${rendu(court(rendu(v), 300))}` };
    return { tirages: t, defaut: null };
  }
  const parBras = (o: Json): { a: unknown; b: unknown } => {
    let a: unknown;
    let b: unknown;
    for (const [k, x] of Object.entries(o)) {
      const br = brasDuNom(k);
      if (br === 'A' && a === undefined) a = x;
      if (br === 'B' && b === undefined) b = x;
    }
    return { a, b };
  };
  const o = obj(v);
  if (o !== null) {
    const { a, b } = parBras(o);
    const ta = listes(a, 'A');
    const tb = listes(b, 'B');
    if (ta === null || tb === null) return { tirages: null, defaut: `manifeste de tirages illisible ${court(rendu(v), 300)}` };
    if (JSON.stringify(ta) !== JSON.stringify(tb)) return { tirages: null, defaut: `les deux bras ne suivent pas les memes indices (T33.A2) : A ${court(rendu(ta), 200)} B ${court(rendu(tb), 200)}` };
    return { tirages: ta, defaut: null };
  }
  if (Array.isArray(v)) {
    const out: string[][] = [];
    for (const d of v) {
      const od = obj(d);
      if (od === null) return { tirages: null, defaut: `tirage illisible ${court(rendu(d), 200)}` };
      const { a, b } = parBras(od);
      if (a !== undefined || b !== undefined) {
        const la = liste(a, 'A');
        const lb = liste(b, 'B');
        if (la === null || lb === null || JSON.stringify(la) !== JSON.stringify(lb)) {
          return { tirages: null, defaut: `tirage aux indices differents selon le bras (T33.A2) : ${court(rendu(d), 200)}` };
        }
        out.push(la);
        continue;
      }
      const idx = enLargeur(od, ['indices', 'repetitions', 'trajectories', 'draw'], (x) => Array.isArray(x));
      const l = liste(idx, 'A');
      if (l === null) return { tirages: null, defaut: `tirage illisible ${court(rendu(d), 200)}` };
      out.push(l);
    }
    return { tirages: out, defaut: null };
  }
  return { tirages: null, defaut: 'aucun tirage' };
}

/** Quantile empirique inverse (T33) : rang ceil(q n), 1-indexe, sur les valeurs triees. */
function quantileInverse(valeurs: number[], q: number): number {
  const tri = [...valeurs].sort((x, y) => x - y);
  const rang = Math.max(1, Math.ceil(q * tri.length - 1e-12));
  return tri[rang - 1] as number;
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T76 — le pilote F-PLATFORM a deux bras', () => {
  test(
    'T76.A1 — le prompt du bras B est celui du bras A, octet pour octet, a l ajout pres de la consigne de methode declaree par le manifeste',
    () => {
      // Controles negatifs du predicat (IV).
      const a = 'Scenario F-PLATFORM, periode P03.\n\nLis docs/tickets/P03.md, docs/spec.md et docs/api.md.';
      const c = consigneDe(lireManifeste(MANIFESTE_PRINCIPAL).bras);
      exige(c.includes('ATDD') && c.includes('SOLID'), 'consigne-du-manifeste-atdd-et-solid', `CONSIGNE-DU-MANIFESTE-INATTENDUE : ${rendu(c)}`);
      exige(estInsertion(a, `${a}\n\n${c}`, c) && estInsertion(a, `${c}\n\n${a}`, c), 'predicat-accepte-une-insertion', 'PREDICAT-TROP-STRICT');
      exige(
        !estInsertion(a, a, c) &&
          !estInsertion(a, `${a}\n\n${c}x`, c) &&
          !estInsertion(a, `${a}\n\n${c.replace('SOLID', 'S.O.L.I.D.')}`, c) &&
          !estInsertion(a, `${a.replace('P03', 'P3')}\n\n${c}`, c),
        'predicat-refuse-toute-autre-difference',
        'PREDICAT-TROP-LACHE : il accepte une difference autre que la consigne',
      );

      // Pilote principal : 24 periodes, deux trajectoires par bras.
      const ex = pilotePrincipal();
      const rapport = exigeExecution(ex, 'a1', TRAJECTOIRES_PAR_BRAS * 2 * NOMBRE_DE_PERIODES);
      verifierPrompts(ex, rapport, lireManifeste(MANIFESTE_PRINCIPAL).bras, PERIODES, 'a1');

      // Pilote court a consigne jetonnee : la consigne est LUE dans le manifeste.
      const jeton = randomBytes(6).toString('hex');
      const { brut, bras } = lireManifeste(MANIFESTE_PRINCIPAL);
      const consigneJetonnee = `${consigneDe(bras)} [consigne du manifeste ${jeton}]`;
      const brasJetonnes = bras.map((b) => (b.arm === 'B' ? { ...b, method_instruction: consigneJetonnee } : b));
      const dir = repertoireJetable('manifeste-jetonne');
      const manifesteJetonne = path.join(dir, 'manifest-t76-jetonne.json');
      fs.writeFileSync(manifesteJetonne, JSON.stringify({ ...brut, arms: brasJetonnes, repetitions: 1, periods_per_trajectory: 2 }, null, 2));
      const court2 = executerPilote('a1jeton', manifesteJetonne, consigneJetonnee);
      const rapportCourt = exigeExecution(court2, 'a1-jeton', 2 * 2);
      verifierPrompts(court2, rapportCourt, brasJetonnes, [1, 2], 'a1-jeton');
      const fuites = court2.sessions.filter((s) => s.prompt.includes(consigneDe(bras)) && !s.prompt.includes(consigneJetonnee));
      aucunDefaut(
        fuites.map((s) => `P${s.periode} ${s.cwd} : la consigne du manifeste PRINCIPAL figure dans un prompt du pilote jetonne`),
        'consigne-lue-dans-le-manifeste-du-pilote',
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T76.A2 — 24 periodes et deux trajectoires par bras : chaque periode persistee porte couts, scores cibles et differentiels, regressions et mesures de qualite du code',
    () => {
      const { bras } = lireManifeste(MANIFESTE_PRINCIPAL);
      const configurations = configurationsDu(bras);
      const ex = pilotePrincipal();
      const rapport = exigeExecution(ex, 'a2', TRAJECTOIRES_PAR_BRAS * 2 * NOMBRE_DE_PERIODES);
      const { parBras, defauts } = trajectoiresDu(rapport, configurations);
      aucunDefaut(defauts, 'un-enregistrement-par-bras-trajectoire-et-periode');

      // ── COUTS : chaque enregistrement porte les comptes de SA session (II.3).
      const couts: string[] = [];
      const rangDe = new Map<string, number>(); // `${bras}|${rep}` -> rang de la fixture
      for (const b of BRAS) {
        for (const [rep, parPeriode] of parBras.get(b) as Map<string, Map<number, Enregistrement>>) {
          const rangs = new Set<number>();
          const espaces = new Set<string>();
          for (const [n, r] of parPeriode) {
            const s = sessionDe(r, ex.sessions);
            if (s === null) {
              couts.push(`${b} rep ${rep} P${n} : tokens ${rendu(r.jetons)} ne sont ceux d'aucune session du bras ${b} a P${n} (${r.chemin})`);
              continue;
            }
            rangs.add(s.rang);
            espaces.add(s.cwd);
            const j = r.jetons as Jetons;
            for (const cat of ['input_fresh', 'output', 'cache_read', 'cache_write'] as const) {
              if (j[cat] !== s.comptes[cat]) couts.push(`${b} rep ${rep} P${n} : ${cat}=${j[cat]}, la session a rendu ${s.comptes[cat]}`);
            }
            if (r.tours !== s.comptes.turns) couts.push(`${b} rep ${rep} P${n} : tours=${rendu(r.tours)}, la session a rendu ${s.comptes.turns}`);
            if (r.duree === null || r.duree < 0) couts.push(`${b} rep ${rep} P${n} : duree de session absente (${rendu(r.duree)})`);
          }
          if (rangs.size !== 1 || espaces.size !== 1) {
            couts.push(`${b} rep ${rep} : ses periodes viennent de ${espaces.size} espace(s) de travail (rangs ${rendu([...rangs])}) — une trajectoire est un seul depot`);
          } else {
            rangDe.set(`${b}|${rep}`, [...rangs][0] as number);
          }
        }
        const rangsDuBras = [...(parBras.get(b) as Map<string, unknown>).keys()].map((rep) => rangDe.get(`${b}|${rep}`));
        if (new Set(rangsDuBras).size !== rangsDuBras.length) couts.push(`bras ${b} : deux trajectoires du rapport viennent du meme depot`);
      }
      aucunDefaut(couts, 'couts-de-chaque-periode-egaux-a-ceux-de-sa-session');

      // ── Le notateur a execute le candidat de CHAQUE periode de CHAQUE trajectoire.
      const nonLances: string[] = [];
      for (const b of BRAS) {
        for (const rep of (parBras.get(b) as Map<string, unknown>).keys()) {
          const k = rangDe.get(`${b}|${rep}`);
          for (const n of PERIODES) {
            if ((ex.lancements.get(`${b}-${String(k)}-P${nn(n)}`) ?? 0) === 0) nonLances.push(`${b} rang ${String(k)} P${n}`);
          }
        }
      }
      aucunDefaut(nonLances, 'candidate-mjs-de-chaque-periode-execute-par-le-notateur');

      // ── SCORES et REGRESSIONS (II.5).
      const scores: string[] = [];
      let regressionPrivee = false;
      for (const b of BRAS) {
        for (const [rep, parPeriode] of parBras.get(b) as Map<string, Map<number, Enregistrement>>) {
          const privee = b === 'A' && rangDe.get(`${b}|${rep}`) === RANG_PRIVE;
          const gAttendu = regressionsAttendues(parPeriode);
          for (const n of PERIODES) {
            const r = parPeriode.get(n);
            if (r === undefined) continue;
            const ici = `${b} rep ${rep}${privee ? ' (privee)' : ''} P${n}`;
            const actives = activesA(n);
            const cles = [...r.cibles.keys()].sort();
            if (JSON.stringify(cles) !== JSON.stringify(actives)) {
              scores.push(`${ici} : scores cibles sur ${rendu(cles.filter((c) => !actives.includes(c)))} en trop et ${rendu(actives.filter((c) => !r.cibles.has(c)))} manquantes`);
            }
            for (const [c, s] of r.cibles) if (!(s >= 0 && s <= 1)) scores.push(`${ici} : score cible ${c}=${s} hors de [0, 1]`);
            if (r.differentiel === null || !(r.differentiel >= 0 && r.differentiel <= 1)) scores.push(`${ici} : score differentiel ${rendu(r.differentiel)}`);
            if (!privee || n < PERIODE_DE_PRIVATION) {
              const pas1 = [...r.cibles].filter(([, s]) => s !== 1).map(([c, s]) => `${c}=${s}`);
              if (pas1.length > 0) scores.push(`${ici} : candidat fidele, scores cibles < 1 : ${pas1.slice(0, 8).join(' ')}`);
              if (!privee && r.differentiel !== 1) scores.push(`${ici} : candidat fidele, differentiel ${rendu(r.differentiel)} != 1`);
            }
            if (privee && n === PERIODE_DE_PRIVATION && !((r.cibles.get(CLAUSE_PRIVEE) ?? 1) < 1)) {
              scores.push(`${ici} : ${CLAUSE_PRIVEE} privee doit noter < 1, vu ${rendu(r.cibles.get(CLAUSE_PRIVEE))}`);
            }
            if (r.regressions === null) {
              scores.push(`${ici} : aucune liste de regressions`);
            } else {
              const vu = [...new Set(r.regressions)].sort();
              const attendu = gAttendu.get(n) ?? [];
              if (JSON.stringify(vu) !== JSON.stringify(attendu)) scores.push(`${ici} : regressions ${rendu(vu)}, attendu ${rendu(attendu)} (II.5)`);
              if (privee && n === PERIODE_DE_PRIVATION && vu.includes(CLAUSE_PRIVEE)) regressionPrivee = true;
            }
          }
        }
      }
      aucunDefaut(scores, 'scores-cibles-differentiels-et-regressions-de-chaque-periode');
      exige(regressionPrivee, 'regression-de-la-clause-privee-a-P9', `la trajectoire privee ne porte pas ${CLAUSE_PRIVEE} parmi ses regressions a P${PERIODE_DE_PRIVATION}`);

      // ── QUALITE DU CODE.
      const qualite: string[] = [];
      for (const b of BRAS) {
        for (const [rep, parPeriode] of parBras.get(b) as Map<string, Map<number, Enregistrement>>) {
          for (const [n, r] of parPeriode) {
            const ici = `${b} rep ${rep} P${n}`;
            for (const m of NOMS_QUALITE) {
              const v = r.qualite[m];
              if (v === null || v < 0) qualite.push(`${ici} : mesure ${m} absente ou negative (${rendu(v)}) — alias ${MESURES_QUALITE[m].join('|')}`);
            }
            const s = sessionDe(r, ex.sessions);
            if (s !== null && r.qualite.tests !== s.tests_ecrits) qualite.push(`${ici} : tests=${rendu(r.qualite.tests)}, le candidat en a ecrit ${s.tests_ecrits}`);
            const cov = r.qualite.couverture;
            if (b === 'A' && cov !== 0) qualite.push(`${ici} : couverture ${rendu(cov)} sans aucun test (attendu 0)`);
            if (b === 'B' && !(cov !== null && cov > 0 && cov < 1)) qualite.push(`${ici} : couverture ${rendu(cov)} hors de ]0, 1[ (une fonction sur deux n'est pas testee)`);
          }
        }
      }
      for (const n of PERIODES) {
        const ra = [...(parBras.get('A') as Map<string, Map<number, Enregistrement>>).values()].map((m) => m.get(n)).filter((x): x is Enregistrement => x !== undefined);
        const rb = [...(parBras.get('B') as Map<string, Map<number, Enregistrement>>).values()].map((m) => m.get(n)).filter((x): x is Enregistrement => x !== undefined);
        for (const m of ['complexite', 'duplication', 'taille_fonctions', 'taille_fichiers'] as const) {
          for (const a of ra) {
            for (const bb of rb) {
              const va = a.qualite[m];
              const vb = bb.qualite[m];
              if (!(va !== null && vb !== null && va > vb)) qualite.push(`P${n} ${m} : A rep ${a.repetition}=${rendu(va)} n'excede pas B rep ${bb.repetition}=${rendu(vb)}`);
            }
          }
        }
      }
      aucunDefaut(qualite, 'mesures-de-qualite-du-code-de-chaque-periode');

      // ── PERSISTANCE des six mesures dans PostgreSQL (II.5).
      const tous = BRAS.flatMap((b) => [...(parBras.get(b) as Map<string, Map<number, Enregistrement>>).values()].flatMap((m) => [...m.values()]));
      const sextuplet = (r: Enregistrement): string => NOMS_QUALITE.map((m) => String(r.qualite[m])).join('|');
      exige(
        new Set(tous.map(sextuplet)).size === tous.length,
        'sextuplets-de-qualite-distincts-controle-de-la-fixture',
        `FIXTURE-NON-DISCRIMINANTE : des enregistrements partagent leurs six mesures, la recherche en base serait creuse`,
      );
      const enBase = objetsProfonds(lignesDeLaBase(ex.db));
      const nonPersistes: string[] = [];
      for (const r of tous) {
        const trouve = enBase.some((o) =>
          NOMS_QUALITE.every((m) => {
            const v = champ(o, MESURES_QUALITE[m]).valeur;
            return r.qualite[m] !== null && proche(v, r.qualite[m] as number);
          }),
        );
        if (!trouve) nonPersistes.push(`${r.bras} rep ${r.repetition} P${r.periode} : ${sextuplet(r)}`);
      }
      aucunDefaut(nonPersistes, 'mesures-de-qualite-persistees-dans-postgresql');
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T76.A3 — par bras et par periode, moyenne, minimum, maximum et effectif de chaque mesure ; rapport du cout de B sur A par periode et cumule, reechantillonne selon T33',
    () => {
      const { bras } = lireManifeste(MANIFESTE_PRINCIPAL);
      const configurations = configurationsDu(bras);
      const ex = pilotePrincipal();
      const rapport = exigeExecution(ex, 'a3', TRAJECTOIRES_PAR_BRAS * 2 * NOMBRE_DE_PERIODES);
      const { parBras, defauts } = trajectoiresDu(rapport, configurations);
      aucunDefaut(defauts, 'enregistrements-de-periode-lisibles-a3');

      // ── STATISTIQUES par bras, periode et mesure.
      const stats = statistiques(rapport, configurations);
      exige(stats.length > 0, 'statistiques-par-bras-et-periode-presentes', `AUCUN objet {mean, min, max, n} sous un bras et une periode (II.4.c) dans ${court(rendu(rapport), 3000)}`);
      type Mesure = { nom: string; alias: string[]; valeur: (r: Enregistrement) => number | null };
      const mesuresDe = (n: number): Mesure[] => [
        ...activesA(n).map((c) => ({ nom: `score cible ${c}`, alias: [c], valeur: (r: Enregistrement) => r.cibles.get(c) ?? null })),
        { nom: 'differentiel', alias: ALIAS_DIFFERENTIEL, valeur: (r) => r.differentiel },
        { nom: 'regressions', alias: [...ALIAS_REGRESSIONS, 'g', 'regression_count'], valeur: (r) => (r.regressions === null ? null : r.regressions.length) },
        { nom: 'input_fresh', alias: ['input_fresh'], valeur: (r) => r.jetons?.input_fresh ?? null },
        { nom: 'output', alias: ['output'], valeur: (r) => r.jetons?.output ?? null },
        { nom: 'cache_read', alias: ['cache_read'], valeur: (r) => r.jetons?.cache_read ?? null },
        { nom: 'tours', alias: ALIAS_TOURS, valeur: (r) => r.tours },
        { nom: 'duree', alias: ALIAS_DUREE, valeur: (r) => r.duree },
        ...NOMS_QUALITE.map((m) => ({ nom: m, alias: [...MESURES_QUALITE[m]], valeur: (r: Enregistrement) => r.qualite[m] })),
      ];
      const ecarts: string[] = [];
      for (const b of BRAS) {
        const trajs = [...(parBras.get(b) as Map<string, Map<number, Enregistrement>>).values()];
        for (const n of PERIODES) {
          const recs = trajs.map((m) => m.get(n)).filter((x): x is Enregistrement => x !== undefined);
          const ici = stats.filter((s) => s.bras === b && s.periode === n);
          for (const m of mesuresDe(n)) {
            const cles = new Set(m.alias.map(normKey));
            const candidates = ici.filter((s) => s.etiquette.some((e) => cles.has(e)));
            const valeurs = recs.map(m.valeur);
            if (valeurs.some((v) => v === null) || valeurs.length !== TRAJECTOIRES_PAR_BRAS) {
              ecarts.push(`${b} P${n} ${m.nom} : valeurs par trajectoire illisibles ${rendu(valeurs)}`);
              continue;
            }
            const vs = valeurs as number[];
            const attendu = { mean: vs.reduce((x, y) => x + y, 0) / vs.length, min: Math.min(...vs), max: Math.max(...vs), n: vs.length };
            if (candidates.length === 0) {
              ecarts.push(`${b} P${n} ${m.nom} : aucune statistique (alias ${m.alias.join('|')})`);
              continue;
            }
            for (const s of candidates) {
              if (!(proche(s.mean, attendu.mean) && proche(s.min, attendu.min) && proche(s.max, attendu.max) && s.n === attendu.n)) {
                ecarts.push(`${b} P${n} ${m.nom} [${s.etiquette.join('.')}] : ${rendu({ mean: s.mean, min: s.min, max: s.max, n: s.n })}, attendu ${rendu(attendu)}`);
              }
            }
          }
        }
      }
      aucunDefaut(ecarts, 'moyenne-minimum-maximum-et-effectif-de-chaque-mesure-par-bras-et-periode');

      // ── RAPPORT DE COUT B/A (II.5) : couts par repetition, depuis les tokens (f = input_fresh / 1000).
      const cout = new Map<Bras, Map<string, number[]>>(); // bras -> rep -> f par periode (index n-1)
      for (const b of BRAS) {
        const m = new Map<string, number[]>();
        for (const [rep, parPeriode] of parBras.get(b) as Map<string, Map<number, Enregistrement>>) {
          m.set(rep, PERIODES.map((n) => (parPeriode.get(n)?.jetons?.input_fresh ?? Number.NaN) / 1000));
        }
        cout.set(b, m);
      }
      const reps = [...(cout.get('A') as Map<string, number[]>).keys()].sort();
      const coutDe = (b: Bras, rep: string, n: number, cumule: boolean): number => {
        const v = (cout.get(b) as Map<string, number[]>).get(rep) as number[];
        return cumule ? v.slice(0, n).reduce((x, y) => x + y, 0) : (v[n - 1] as number);
      };
      const rapportDuTirage = (tirage: string[], n: number, cumule: boolean): number =>
        tirage.reduce((s, r) => s + coutDe('B', r, n, cumule), 0) / tirage.reduce((s, r) => s + coutDe('A', r, n, cumule), 0);

      // Controle negatif (IV) : la perturbation « moyenne des rapports » est observable.
      const fixture: string[] = [];
      for (const cumule of [false, true]) {
        for (const n of PERIODES) {
          const attendu = rapportDuTirage(reps, n, cumule);
          const [r1, r2] = reps as [string, string];
          const apparie = (coutDe('B', r1, n, cumule) / coutDe('A', r1, n, cumule) + coutDe('B', r2, n, cumule) / coutDe('A', r2, n, cumule)) / 2;
          const croise = (coutDe('B', r1, n, cumule) / coutDe('A', r2, n, cumule) + coutDe('B', r2, n, cumule) / coutDe('A', r1, n, cumule)) / 2;
          if (!Number.isFinite(attendu) || Math.abs(attendu - 1) < 1e-6 || Math.abs(attendu - apparie) < 1e-6 || Math.abs(attendu - croise) < 1e-6) {
            fixture.push(`P${n}${cumule ? ' cumule' : ''} : rapport ${attendu}, moyenne des rapports ${apparie} / ${croise}`);
          }
        }
      }
      aucunDefaut(fixture, 'fixture-discriminante-rapport-des-moyennes');

      const noeud = enLargeur(rapport, ALIAS_RAPPORT_COUT, (x) => obj(x) !== null);
      exige(obj(noeud) !== null, 'rapport-de-cout-b-sur-a-present', `AUCUN rapport de cout (cle ${ALIAS_RAPPORT_COUT.join('|')}) dans le rapport`);
      const racine = noeud as Json;
      const repetitionDe = (b: Bras, x: unknown): string | null => {
        const s = normRepetition(x);
        if (s !== null && reps.includes(s)) return s;
        for (const [rep, parPeriode] of parBras.get(b) as Map<string, Map<number, Enregistrement>>) {
          const t = [...parPeriode.values()][0]?.trajectoire;
          if (t !== null && t !== undefined && t === x) return rep;
        }
        return null;
      };
      const ratios: string[] = [];
      for (const [nomSerie, alias, cumule] of [['par periode', ALIAS_PAR_PERIODE, false], ['cumule', ALIAS_CUMUL, true]] as const) {
        const serie = serieParPeriode(champ(racine, alias).valeur);
        for (const n of PERIODES) {
          const e = serie.get(n);
          const ici = `${nomSerie} P${n}`;
          if (e === undefined) {
            ratios.push(`${ici} : entree absente (alias ${alias.join('|')})`);
            continue;
          }
          const attendu = rapportDuTirage(reps, n, cumule);
          const v = champ(e, ALIAS_VALEUR).valeur;
          if (!proche(v, attendu)) ratios.push(`${ici} : rapport ${rendu(v)}, attendu ${attendu} (rapport des moyennes de B sur A)`);
          const re = obj(champ(e, ALIAS_REECH).valeur) ?? e;
          const { tirages, defaut } = tiragesDe(champ(re, ALIAS_TIRAGES).valeur, repetitionDe);
          if (tirages === null) {
            ratios.push(`${ici} : ${defaut ?? 'tirages absents'}`);
            continue;
          }
          if (tirages.length < 2 || tirages.some((t) => t.length !== reps.length)) {
            ratios.push(`${ici} : ${tirages.length} tirage(s) de tailles ${rendu(tirages.map((t) => t.length))}, attendu au moins 2 tirages de ${reps.length} trajectoires`);
            continue;
          }
          const parTirage = tirages.map((t) => rapportDuTirage(t, n, cumule));
          const rendus = champ(re, ALIAS_RATIOS).valeur;
          if (!Array.isArray(rendus) || rendus.length !== tirages.length || !rendus.every((x, i) => proche(x, parTirage[i] as number))) {
            ratios.push(`${ici} : rapports des tirages ${court(rendu(rendus), 200)}, attendu ${court(rendu(parTirage), 200)}`);
          }
          const bande = obj(champ(re, ALIAS_INTERVALLE).valeur);
          const bas = bande === null ? undefined : champ(bande, ['lower', 'low', 'lo', 'inf', 'borne_inferieure']).valeur;
          const haut = bande === null ? undefined : champ(bande, ['upper', 'high', 'hi', 'sup', 'borne_superieure']).valeur;
          const qb = quantileInverse(parTirage, Q_BAS);
          const qh = quantileInverse(parTirage, Q_HAUT);
          if (!proche(bas, qb) || !proche(haut, qh)) ratios.push(`${ici} : bande ${rendu(bande)}, attendu [${qb}, ${qh}] (quantile empirique inverse, T33)`);
          const simultanee = bande === null ? undefined : champ(bande, ['simultaneous']).valeur;
          const genre = bande === null ? undefined : champ(bande, ['kind', 'type']).valeur;
          if (simultanee === true || (typeof genre === 'string' && /simult/i.test(genre))) ratios.push(`${ici} : bande etiquetee simultanee (T33.A7)`);
        }
      }
      aucunDefaut(ratios, 'rapport-du-cout-de-B-sur-A-par-periode-et-cumule-reechantillonne-selon-T33');
    },
    CASE_TIMEOUT_MS,
  );
});
