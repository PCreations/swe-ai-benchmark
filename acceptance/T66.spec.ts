/**
 * acceptance/T66.spec.ts — suite d'acceptation de la tache T66.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T66.A1 behaviour — lance avec le faux executable `claude` sur douze
 *                      periodes et trois repetitions, un candidat de
 *                      reference qui implemente F-LONG obtient un score de 1
 *                      sur chaque regle active a chaque periode
 *   T66.A2 behaviour — le rapport donne, par configuration, la moyenne, le
 *                      minimum, le maximum et l'effectif de chaque mesure, et
 *                      n'affiche aucun intervalle de confiance en dessous de
 *                      l'effectif fixe par T35
 *   T66.A3 behaviour — un candidat de reference qui implemente fidelement P1
 *                      a P6 puis ignore les remplacements de P7 et P11 obtient
 *                      des scores inferieurs a 1 sur `cancel@3` et `fifo@2`,
 *                      sans regression comptee pour `cancel@2` ni `priority@1`
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T66 EST UNE TACHE D'EXTENSION (ADR-018, L214-220 ; dependance T68 ajoutee
 * par ADR-019, « Effet sur T66 »). L'auteur de cette suite est AVEUGLE aux
 * `source_paths` de T66 (`packages/activities`, `packages/agents`,
 * `apps/cli`) — ADR-001, aveuglement PROCEDURAL. La sous-commande est
 * observee comme un PROCESSUS (stdout JSON, code de sortie), exactement comme
 * acceptance/T46.spec.ts a T60.spec.ts le font deja.
 *
 *   ADR-018 L216 livrables : « `bench pilot-conduct --provider claude-cli
 *          --live` sur F-LONG, avec plusieurs repetitions par configuration ;
 *          rapport agrege par configuration. »
 *   ADR-018 L218 les trois cas, mot pour mot (ci-dessus).
 *   ADR-018 L220 « PostgreSQL, le stockage objet et le faux executable
 *          `claude` sont requis ; aucun appel reel. »
 *   ADR-018 decision 6 (L72-75) : « Le rapport agrege, par configuration, les
 *          repetitions d'une campagne : moyenne, minimum et maximum de chaque
 *          mesure, avec leur effectif. Aucun intervalle de confiance n'est
 *          affiche en dessous de l'effectif que fixe T35. »
 *   ADR-018 decision 4 (L61-65) : Q, R, G/`G_new` par periode (F-REGRESSION :
 *          une regle retiree n'est pas une regression) — livre par T65.
 *   ADR-018 decision 5 (L67-70) : mesures du code par periode — livre par T65.
 *   ADR-019 decision 1 : les enonces F-LONG passent au contrat
 *          `bench.candidate/4`.
 *
 * Cette suite REPREND, SANS LES REINVENTER :
 *   - le socle CLI + PostgreSQL + faux `claude` d'acceptance/T60.spec.ts
 *     (`lancer`, `envFauxClaude`, `verifierFauxEnTetePath`, `creerBase`,
 *     `conduire`, `lireEnregistrements`) ;
 *   - le schema `bench.pilot.manifest/1` (T39) et la sous-commande
 *     `pilot-conduct` (T46), dont le champ racine `periods_persisted`
 *     (mesure par T60, section IV) ;
 *   - l'entree `candidate.mjs` de l'espace de travail (FIXEE par
 *     acceptance/T52.spec.ts, II.4) et les mecanismes du faux executable
 *     `BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_FILE`/`..._COUNTER_FILE` (T52)
 *     et `BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR`/`..._COUNTER_FILE` (T55) —
 *     le faux executable n'est PAS modifie ;
 *   - le candidat de reference v4 d'acceptance/T68.spec.ts
 *     (acceptance/fixtures/candidates/f-long-reference-candidate-v4.mjs),
 *     sa privation BENCH_DROP_RULE et son journal BENCH_TRAFFIC_LOG ;
 *   - `REGLES_ADR`, table des regles actives par periode, reprise
 *     d'acceptance/T61.spec.ts (V) via T65/T68 — jamais recalculee.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001 ; aucune valeur ci-dessous n'a
 * ete obtenue en executant une implementation de T66)
 *
 * 1. LE SCENARIO EST CHOISI PAR LE MANIFESTE, par un champ DEJA PREVU par le
 *    schema de T39 : `corpus.groups[].source_scenario_id = "F-LONG"`, avec
 *    `periods_per_trajectory: 12`. Deux manifestes NEUFS (zone ACCEPTANCE),
 *    copies de manifest-t52-claude-cli-four-periods.json a ces seules
 *    differences pres (README du repertoire) :
 *      - manifest-t66-claude-cli-f-long-three-repetitions.json (A1, A2) :
 *        UNE configuration `cfg-t66-alpha`, `repetitions: 3` ;
 *      - manifest-t66-claude-cli-f-long-one-repetition.json (A3) :
 *        `repetitions: 1`.
 * 2. LES CANDIDATS SONT DES FIXTURES DE TEST, ECRITS PAR LE FAUX `claude`.
 *    A chaque session (une par periode), le faux executable ecrit
 *    `candidate.mjs` dans l'espace de travail : le SOURCE COMPLET de
 *    f-long-reference-candidate-v4.mjs (sans sa ligne shebang), precede de
 *    deux affectations `process.env.BENCH_DROP_RULE = ...` et
 *    `process.env.BENCH_TRAFFIC_LOG = ...` et d'un commentaire qui porte le
 *    rang de la session (pour que chaque periode produise un commit non vide,
 *    comme une vraie session qui retoucherait son code). Le candidat ne
 *    depend donc d'aucune variable d'environnement que l'orchestrateur
 *    devrait laisser passer. A1 : BENCH_DROP_RULE vide (FIDELE). A3 :
 *    BENCH_DROP_RULE = `cancel@3,fifo@2` — la fixture (ajout ADDITIF de
 *    cette tache, T68 inchange) prive alors chacune des deux regles et
 *    laisse en vigueur celle qu'elle remplacait : cancel@2 en P7-P8,
 *    priority@1 en P11-P12. C'est « un candidat qui implemente fidelement P1
 *    a P6 puis ignore les remplacements de P7 et P11 ».
 *    L'implementation ne fournit NI le candidat NI sa note : la note vient de
 *    l'execution reelle du candidat ecrit dans l'espace de travail ; le
 *    journal BENCH_TRAFFIC_LOG doit en temoigner (requetes recues, sur plus
 *    d'un repertoire de donnees : trajectoire principale ET copies, ADR-018
 *    decisions 2-3).
 * 3. LA FORME DU RAPPORT (stdout JSON de `pilot-conduct`), cherchee de
 *    maniere TOLERANTE (alias normalises : minuscules, sans `_`/`-`) :
 *    a) `periods_persisted` a la racine (deja present a HEAD, T60.IV) vaut
 *       repetitions × 12.
 *    b) ENREGISTREMENT DE PERIODE : tout objet du rapport qui porte (lui-meme
 *       ou par heritage d'un objet englobant) une REPETITION (`repetition`,
 *       `repetition_index`, `repetition_id`, `rep`), une PERIODE (`period`,
 *       `period_id`, `period_key`, `period_index` ; « P7 » ou 7) et des
 *       SCORES PAR REGLE (`rule_scores`, `scores`, `scores_by_rule`) — soit
 *       une table `{ "cancel@3": 0.4, ... }` (valeur nombre ou `{score}`),
 *       soit une liste `[{rule|rule_id|id(+version), score}]`. Pour A3, il
 *       porte en outre la liste des regressions comptees a cette periode
 *       (`regressions`, `open_regressions`, `regressed_rules`) : identites
 *       `id@version`, en texte ou en objet `{rule}`/`{id, version}`.
 *    c) AGREGAT DE CONFIGURATION : l'objet dont un champ `configuration`
 *       (`configuration_id`, `config`, `config_id`) vaut `cfg-t66-alpha`, ou
 *       la valeur rangee sous la cle `cfg-t66-alpha`. Sous lui, un OBJET DE
 *       STATISTIQUES porte `mean` (`avg`, `average`, `moyenne`), `min`,
 *       `max` et l'effectif (`n`, `count`, `effectif`, `sample_size`). Son
 *       ETIQUETTE est le chemin depuis l'agregat, plus ses champs `measure`/
 *       `name`/`metric`/`rule`/`rule_id`.
 *    d) INTERVALLE DE CONFIANCE : toute cle du rapport dont le nom normalise
 *       contient `confidence` ou `interval`, ou vaut `ci`/`ic` suivi ou non
 *       d'un niveau ou d'une borne (`ci95`, `ci_low`, `ic95_upper`...).
 * 4. L'EFFECTIF D'UNE MESURE AGREGEE est le nombre de repetitions agregees :
 *    3 (ADR-018 decision 6 : « Le rapport agrege [...] les repetitions »).
 * 5. LES MESURES EXIGEES dans l'agregat (« chaque mesure ») : le score de
 *    CHAQUE regle de F-LONG ; Q, R, G, G_new (T65.A1) ; les tokens (au moins
 *    une mesure dont l'etiquette contient `token`) ; les quatre mesures du
 *    code (T65.A4 : lines_added, lines_removed, files_touched,
 *    test_files_written).
 * 6. L'EFFECTIF FIXE PAR T35 : T35 (cahier L457-466, analysis/src/power.py,
 *    PROUVEE) ne fixe AUCUN nombre : il selectionne le plus petit effectif
 *    d'une grille qui atteint une puissance cible, ou TARGET_NOT_REACHED, et
 *    le cahier precise (L466) que « l'effectif adequat pour une etude reelle
 *    n'est pas un nombre que cette tache peut fournir avant calibration ».
 *    Aucun effectif issu de T35 n'existe donc pour ce pilote : cette suite
 *    exige qu'a TROIS repetitions le rapport n'affiche AUCUN intervalle de
 *    confiance (3.d), nulle part. Lecture du test-author, signalee comme
 *    telle.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LES DANGERS PROPRES A T66, ET LEUR CONTROLE
 *
 * (1) Une trajectoire arretee a ONZE periodes ou a DEUX repetitions
 *     (perturbation de T66.A1) : A1 exige `periods_persisted === 36`, les 36
 *     couples (repetition, periode) distincts dans le rapport, trois
 *     repetitions exactement, et au moins 36 sessions du faux `claude`.
 * (2) Une note posee sans executer le candidat : A1 et A3 exigent un trafic
 *     reel dans le journal du candidat, sur plusieurs repertoires de donnees.
 * (3) Un intervalle de confiance affiche sur trois repetitions (perturbation
 *     de T66.A2) : A2 balaie TOUT le rapport (3.d).
 * (4) Un agregat sans effectif, ou dont l'effectif n'est pas le nombre de
 *     repetitions : A2 exige `n === 3` sur CHAQUE objet de statistiques, et
 *     min <= moyenne <= max ; et, pour chaque regle, moyenne = min = max = 1
 *     (coherent avec A1, candidat fidele).
 * (5) `cancel@2` ou `priority@1` comptee en regression apres son
 *     remplacement (perturbation de T66.A3) : A3 lit la liste des
 *     regressions de CHAQUE periode et exige qu'aucune ne nomme ces regles.
 * (6) Un candidat A3 casse partout (ce qui rendrait « < 1 » creux) : A3
 *     exige, en temoin, un score de 1 sur chaque regle active de P1 a P6.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Ni la generation ni la notation des sequences (T64, T68), ni le calcul de
 *    Q/R/G/G_new (T65) : reutilises comme oracles, jamais re-prouves.
 *  • Une seule configuration : le « par configuration » est observe par
 *    l'etiquette de configuration de l'agregat, pas par la separation de
 *    deux configurations (le faux executable ecrit le meme candidat quelle
 *    que soit la configuration).
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde
 *    `verifierFauxEnTetePath`, reprise a l'identique de T47/.../T60.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 36 periodes F-LONG (A1) puis 12 (A3), chacune notee sur chaque regle active
// par execution reelle du candidat : bornes larges, jamais plus etroites que
// celles de T68 rapportees au nombre de periodes.
const PROC_TIMEOUT_MS = 14_400_000;
const CASE_TIMEOUT_MS = 15_000_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * commun — REPRIS de acceptance/T60.spec.ts. */

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
  expect(condition ? sain : court(defaut, 4000)).toBe(sain);
}

/* ════════════════════════════════════ PostgreSQL REEL (ADR-018 L220) */

const RUN = `t66_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `t66-${prefixe}-`));
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
      maxBuffer: 256 * 1024 * 1024,
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

/* ════════════════════════ faux executable claude (reprise T47/.../T60) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');

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
  // Le candidat porte lui-meme sa privation et son journal (II.2) : rien ne
  // doit fuiter de l'environnement de la suite vers lui.
  delete env.BENCH_DROP_RULE;
  delete env.BENCH_TRAFFIC_LOG;
  verifierFauxEnTetePath(env);
  return env;
}

type Enregistrement = { argv: string[]; cwd: string };
function lireEnregistrements(dir: string): Enregistrement[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^record-\d+\.json$/.test(f))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Enregistrement;
      } catch {
        return null;
      }
    })
    .filter((x): x is Enregistrement => x !== null);
}

/* ═══════ candidats FIXTURES (II.2) — hors de portee de l'implementeur ════ */

const FIXTURE_CANDIDAT_V4 = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-long-reference-candidate-v4.mjs');
const ENTREE_CANDIDATE = 'candidate.mjs'; // FIXE par acceptance/T52.spec.ts (II.4)
const PRIVATION_A3 = 'cancel@3,fifo@2'; // II.2 — remplacements de P7 (cancel@3) et de P11 (fifo@2)

function sourceCandidatV4(): string {
  const brut = fs.readFileSync(FIXTURE_CANDIDAT_V4, 'utf8');
  return brut.startsWith('#!') ? brut.slice(brut.indexOf('\n') + 1) : brut;
}

function contenuCandidat(dropRule: string, journal: string, rang: number): string {
  return [
    `// candidate.mjs — ecrit par le faux \`claude\` (acceptance/T66.spec.ts), session ${rang}.`,
    `// Source : acceptance/fixtures/candidates/f-long-reference-candidate-v4.mjs.`,
    `process.env.BENCH_DROP_RULE = ${JSON.stringify(dropRule)};`,
    `process.env.BENCH_TRAFFIC_LOG = ${JSON.stringify(journal)};`,
    sourceCandidatV4(),
  ].join('\n');
}

interface Preparation {
  env: NodeJS.ProcessEnv;
  journal: string;
  enregistrements: string;
}

/** Un plan d'ecriture par session (T52) et un enregistrement par session (T55). */
function preparerFauxClaude(suffixe: string, dropRule: string, sessions: number): Preparation {
  const dir = repertoireJetable(`plan-${suffixe}`);
  const journal = path.join(dir, 'traffic.ndjson');
  const plan = Array.from({ length: sessions }, (_, i) => ({
    relPath: ENTREE_CANDIDATE,
    content: contenuCandidat(dropRule, journal, i + 1),
  }));
  const planFile = path.join(dir, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const enregistrements = path.join(dir, 'records');
  const env = envFauxClaude({
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_FILE: planFile,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_COUNTER_FILE: path.join(dir, 'write-counter.txt'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: enregistrements,
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: path.join(dir, 'record-counter.txt'),
  });
  return { env, journal, enregistrements };
}

interface Trafic {
  total: number;
  repertoires: Set<string>;
  ops: Set<string>;
}

function lireTrafic(journal: string): Trafic {
  const out: Trafic = { total: 0, repertoires: new Set(), ops: new Set() };
  if (!fs.existsSync(journal)) return out;
  for (const ligne of fs.readFileSync(journal, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue;
    try {
      const e = JSON.parse(ligne) as { data_dir?: unknown; op?: unknown };
      out.total += 1;
      if (typeof e.data_dir === 'string') out.repertoires.add(e.data_dir);
      if (typeof e.op === 'string') out.ops.add(e.op);
    } catch {
      /* ligne partielle : ignoree */
    }
  }
  return out;
}

/* ════════════════════ les douze ensembles de regles (repris T61.V) ═════ */

const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const;
type Periode = (typeof PERIODES)[number];

const REGLES_ADR: Record<Periode, string[]> = {
  P1: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P2: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P3: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2'],
  P4: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1'],
  P5: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P6: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P7: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1'],
  P8: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ],
  P9: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ],
  P10: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1', 'history@1',
  ],
  P11: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1',
  ],
  P12: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1', 'transfer@1',
  ],
};
const TOUTES_LES_REGLES: string[] = [...new Set(PERIODES.flatMap((p) => REGLES_ADR[p]))];

/* ═══════════════════ pilot-conduct (T46/T49/T52/T58/T60, REPRIS) ═══════ */

const MANIFEST_TROIS_REPETITIONS = path.join(
  REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t66-claude-cli-f-long-three-repetitions.json',
);
const MANIFEST_UNE_REPETITION = path.join(
  REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t66-claude-cli-f-long-one-repetition.json',
);
const CONFIGURATION = 'cfg-t66-alpha';
const PERIODES_PAR_TRAJECTOIRE = 12;
const REPETITIONS = 3;

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  return {
    campaignId: `t66-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: repertoireJetable(`ws-${suffixe}`),
  };
}

function conduire(ctx: Contexte, manifest: string, env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    'pilot-conduct',
    [
      manifest,
      '--campaign-id', ctx.campaignId,
      '--postgres-database', ctx.db,
      '--s3-bucket', ctx.bucket,
      '--mode', 'recorded',
      '--provider', 'claude-cli',
      '--live',
      '--candidate-workspace-root', ctx.workspaceRoot,
    ],
    env,
  );
}

interface Execution {
  appel: AppelCli;
  trafic: Trafic;
  sessions: number;
}

function executerPilote(suffixe: string, manifest: string, dropRule: string, sessions: number): Execution {
  for (const f of [manifest, FIXTURE_CANDIDAT_V4]) {
    exige(fs.existsSync(f), `fixture-presente-${path.basename(f)}`, `FIXTURE-ABSENTE : ${f}`);
  }
  const ctx = nouveauContexte(suffixe);
  const prep = preparerFauxClaude(suffixe, dropRule, sessions);
  const appel = conduire(ctx, manifest, prep.env);
  return {
    appel,
    trafic: lireTrafic(prep.journal),
    sessions: lireEnregistrements(prep.enregistrements).length,
  };
}

// La campagne A1 (36 periodes) sert aussi a A2 : executee une fois, a la
// demande de l'un ou de l'autre (chaque cas reste executable seul).
let CAMPAGNE_A1: Execution | null = null;
function campagneTroisRepetitions(): Execution {
  if (CAMPAGNE_A1 === null) {
    CAMPAGNE_A1 = executerPilote('a1', MANIFEST_TROIS_REPETITIONS, '', REPETITIONS * PERIODES_PAR_TRAJECTOIRE);
  }
  return CAMPAGNE_A1;
}

/* ═══════════════════ lecture tolerante du rapport (II.3) ═══════════════ */

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

const ALIAS_REPETITION = ['repetition', 'repetition_index', 'repetition_id', 'repetition_number', 'rep', 'rep_index'];
const ALIAS_PERIODE = ['period', 'period_id', 'period_key', 'period_index', 'period_name'];
const ALIAS_SCORES = ['rule_scores', 'scores', 'scores_by_rule', 'rule_score', 'scores_per_rule'];
const ALIAS_REGRESSIONS = ['regressions', 'open_regressions', 'regressed_rules', 'regression_rules'];
const ALIAS_CONFIGURATION = ['configuration', 'configuration_id', 'config', 'config_id'];
const ALIAS_REGLE = ['rule', 'rule_id', 'requirement', 'requirement_id'];

function normPeriode(v: unknown): Periode | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : null;
  if (s === null) return null;
  const m = /^p?(\d{1,2})$/i.exec(s);
  if (m === null) return null;
  const p = `P${Number(m[1])}`;
  return (PERIODES as readonly string[]).includes(p) ? (p as Periode) : null;
}

function normRepetition(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return null;
}

function identiteRegle(v: unknown): string | null {
  if (typeof v === 'string' && /@\d+$/.test(v.trim())) return v.trim();
  const o = obj(v);
  if (o === null) return null;
  const r = champ(o, ALIAS_REGLE);
  if (r.present && typeof r.valeur === 'string' && /@\d+$/.test(r.valeur)) return r.valeur;
  const id = champ(o, ['id', ...ALIAS_REGLE]);
  const version = champ(o, ['version']);
  if (id.present && typeof id.valeur === 'string' && version.present && typeof version.valeur === 'number') {
    return `${id.valeur}@${version.valeur}`;
  }
  if (id.present && typeof id.valeur === 'string' && /@\d+$/.test(id.valeur)) return id.valeur;
  return null;
}

function scoresParRegle(v: unknown): Map<string, number> | null {
  const out = new Map<string, number>();
  if (Array.isArray(v)) {
    for (const e of v) {
      const o = obj(e);
      if (o === null) continue;
      const r = identiteRegle(o);
      const s = champ(o, ['score', 'fraction', 'ratio']);
      if (r !== null && s.present && typeof s.valeur === 'number') out.set(r, s.valeur);
    }
    return out.size > 0 ? out : null;
  }
  const o = obj(v);
  if (o === null) return null;
  for (const [k, x] of Object.entries(o)) {
    if (!/@\d+$/.test(k)) continue;
    if (typeof x === 'number') out.set(k, x);
    else {
      const ox = obj(x);
      if (ox !== null) {
        const s = champ(ox, ['score', 'fraction', 'ratio']);
        if (s.present && typeof s.valeur === 'number') out.set(k, s.valeur);
      }
    }
  }
  return out.size > 0 ? out : null;
}

function listeRegressions(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const e of v) {
    const r = identiteRegle(e);
    out.push(r ?? rendu(e));
  }
  return out;
}

interface EnregistrementPeriode {
  repetition: string;
  periode: Periode;
  configuration: string | null;
  scores: Map<string, number>;
  regressions: string[] | null;
  chemin: string;
}

/** II.3.b — enregistrements de periode, avec heritage de repetition/configuration. */
function enregistrementsDePeriode(rapport: unknown): EnregistrementPeriode[] {
  const out: EnregistrementPeriode[] = [];
  const visiter = (v: unknown, chemin: string, rep: string | null, cfg: string | null, profondeur: number): void => {
    if (profondeur > 14) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => visiter(x, `${chemin}[${i}]`, rep, cfg, profondeur + 1));
      return;
    }
    const o = obj(v);
    if (o === null) return;
    const r = champ(o, ALIAS_REPETITION);
    const repIci = r.present ? normRepetition(r.valeur) ?? rep : rep;
    const c = champ(o, ALIAS_CONFIGURATION);
    const cfgIci = c.present && typeof c.valeur === 'string' ? c.valeur : cfg;
    const p = champ(o, ALIAS_PERIODE);
    const s = champ(o, ALIAS_SCORES);
    if (p.present && s.present && repIci !== null) {
      const periode = normPeriode(p.valeur);
      const scores = scoresParRegle(s.valeur);
      if (periode !== null && scores !== null) {
        const g = champ(o, ALIAS_REGRESSIONS);
        out.push({
          repetition: repIci,
          periode,
          configuration: cfgIci,
          scores,
          regressions: g.present ? listeRegressions(g.valeur) : null,
          chemin,
        });
      }
    }
    for (const [k, x] of Object.entries(o)) visiter(x, `${chemin}.${k}`, repIci, cfgIci, profondeur + 1);
  };
  visiter(rapport, '$', null, null, 0);
  return out;
}

interface Statistique {
  etiquette: string[];
  mean: number;
  min: number;
  max: number;
  n: number;
}

const ALIAS_MOYENNE = ['mean', 'avg', 'average', 'moyenne'];
const ALIAS_EFFECTIF = ['n', 'count', 'effectif', 'sample_size', 'nobs'];
const ALIAS_ETIQUETTE = ['measure', 'name', 'metric', 'rule', 'rule_id', 'key'];

function lireStatistique(o: Json, etiquette: string[]): Statistique | null {
  const mean = champ(o, ALIAS_MOYENNE);
  const min = champ(o, ['min', 'minimum']);
  const max = champ(o, ['max', 'maximum']);
  const n = champ(o, ALIAS_EFFECTIF);
  if (!mean.present || !min.present || !max.present || !n.present) return null;
  const nombres = [mean.valeur, min.valeur, max.valeur, n.valeur];
  if (!nombres.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const e = [...etiquette];
  for (const a of ALIAS_ETIQUETTE) {
    const x = champ(o, [a]);
    if (x.present && typeof x.valeur === 'string') e.push(x.valeur);
  }
  return { etiquette: e, mean: mean.valeur as number, min: min.valeur as number, max: max.valeur as number, n: n.valeur as number };
}

function statistiquesSous(racine: unknown): Statistique[] {
  const out: Statistique[] = [];
  const visiter = (v: unknown, etiquette: string[], profondeur: number): void => {
    if (profondeur > 14) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visiter(x, etiquette, profondeur + 1));
      return;
    }
    const o = obj(v);
    if (o === null) return;
    const s = lireStatistique(o, etiquette);
    if (s !== null) {
      out.push(s);
      return;
    }
    const ici: string[] = [];
    for (const a of ALIAS_ETIQUETTE) {
      const x = champ(o, [a]);
      if (x.present && typeof x.valeur === 'string') ici.push(x.valeur);
    }
    for (const [k, x] of Object.entries(o)) visiter(x, [...etiquette, ...ici, k], profondeur + 1);
  };
  visiter(racine, [], 0);
  return out;
}

/** II.3.c — les agregats rattaches a la configuration. */
function agregatsDeConfiguration(rapport: unknown, cfg: string): { chemin: string; stats: Statistique[] }[] {
  const out: { chemin: string; stats: Statistique[] }[] = [];
  const visiter = (v: unknown, chemin: string, profondeur: number): void => {
    if (profondeur > 14) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => visiter(x, `${chemin}[${i}]`, profondeur + 1));
      return;
    }
    const o = obj(v);
    if (o === null) return;
    const c = champ(o, ALIAS_CONFIGURATION);
    if (c.present && c.valeur === cfg) {
      const stats = statistiquesSous(o);
      if (stats.length > 0) out.push({ chemin, stats });
    }
    if (Object.prototype.hasOwnProperty.call(o, cfg)) {
      const stats = statistiquesSous(o[cfg]);
      if (stats.length > 0) out.push({ chemin: `${chemin}.${cfg}`, stats });
    }
    for (const [k, x] of Object.entries(o)) visiter(x, `${chemin}.${k}`, profondeur + 1);
  };
  visiter(rapport, '$', 0);
  return out;
}

/** II.3.d — cles d'intervalle de confiance, n'importe ou dans le rapport. */
const MOTIF_IC = /confidence|interval|^(ci|ic)(\d+)?(lo|hi|low|high|lower|upper|bounds?)?$|^(ci|ic)\d*(lo|hi|low|high|lower|upper)?\d*$/;
function clesIntervalle(rapport: unknown): string[] {
  const out: string[] = [];
  const visiter = (v: unknown, chemin: string, profondeur: number): void => {
    if (profondeur > 20) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => visiter(x, `${chemin}[${i}]`, profondeur + 1));
      return;
    }
    const o = obj(v);
    if (o === null) return;
    for (const [k, x] of Object.entries(o)) {
      if (MOTIF_IC.test(normKey(k))) out.push(`${chemin}.${k}`);
      visiter(x, `${chemin}.${k}`, profondeur + 1);
    }
  };
  visiter(rapport, '$', 0);
  return out;
}

function periodesPersistees(rapport: Json | null): unknown {
  return rapport === null ? undefined : champ(rapport, ['periods_persisted']).valeur;
}

function exigeExecution(ex: Execution, etiquette: string, periodesAttendues: number): Json {
  exige(
    ex.appel.resultat !== null && ex.appel.exit === 0,
    `pilot-conduct-f-long-execute-${etiquette}`,
    messageEchec(`pilot-conduct(${etiquette})`, ex.appel),
  );
  const rapport = ex.appel.resultat as Json;
  exige(
    periodesPersistees(rapport) === periodesAttendues,
    `periodes-persistees-${periodesAttendues}-${etiquette}`,
    `PERIODES-PERSISTEES-INATTENDUES (${etiquette}) : periods_persisted=${rendu(periodesPersistees(rapport))}, attendu ${periodesAttendues} ; rapport ${rendu(rapport)}`,
  );
  exige(
    ex.sessions >= periodesAttendues,
    `une-session-claude-par-periode-${etiquette}`,
    `SESSIONS-CLAUDE-INSUFFISANTES (${etiquette}) : ${ex.sessions} session(s) du faux executable pour ${periodesAttendues} periodes`,
  );
  exige(
    ex.trafic.total > 0 && ex.trafic.repertoires.size >= 2,
    `candidat-reellement-execute-${etiquette}`,
    `AUCUNE-EXECUTION-REELLE-DU-CANDIDAT (${etiquette}) : ${ex.trafic.total} requete(s) journalisee(s) sur ${ex.trafic.repertoires.size} repertoire(s) de donnees — la note doit venir de l'execution du candidat ecrit dans l'espace de travail, sur la trajectoire ET sur des copies (ADR-018 decisions 2-3).`,
  );
  return rapport;
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T66 — le pilote F-LONG avec repetitions', () => {
  test(
    'T66.A1 — douze periodes, trois repetitions, faux claude : le candidat de reference fidele a F-LONG obtient 1 sur chaque regle active a chaque periode',
    () => {
      const ex = campagneTroisRepetitions();
      const rapport = exigeExecution(ex, 'a1', REPETITIONS * PERIODES_PAR_TRAJECTOIRE);

      const recs = enregistrementsDePeriode(rapport).filter((r) => r.configuration === null || r.configuration === CONFIGURATION);
      const repetitions = [...new Set(recs.map((r) => r.repetition))].sort();
      exige(
        repetitions.length === REPETITIONS,
        'trois-repetitions-distinctes-dans-le-rapport',
        `REPETITIONS-INATTENDUES : ${rendu(repetitions)} (attendu ${REPETITIONS}) ; ${recs.length} enregistrement(s) de periode trouves (II.3.b) dans ${rendu(rapport)}`,
      );

      const manquants: string[] = [];
      const defauts: string[] = [];
      for (const rep of repetitions) {
        for (const p of PERIODES) {
          const ici = recs.filter((r) => r.repetition === rep && r.periode === p);
          if (ici.length === 0) {
            manquants.push(`rep ${rep} ${p}`);
            continue;
          }
          for (const r of ici) {
            for (const regle of REGLES_ADR[p]) {
              const s = r.scores.get(regle);
              if (s !== 1) defauts.push(`rep ${rep} ${p} ${regle}=${rendu(s)} (${r.chemin})`);
            }
          }
        }
      }
      exige(
        manquants.length === 0,
        'douze-periodes-par-repetition-dans-le-rapport',
        `PERIODES-ABSENTES-DU-RAPPORT : ${rendu(manquants)}`,
      );
      exige(
        defauts.length === 0,
        'score-1-sur-chaque-regle-active-a-chaque-periode-de-chaque-repetition',
        `SCORES-DIFFERENTS-DE-1 (ou absents) pour le candidat fidele : ${rendu(defauts.slice(0, 40))}${defauts.length > 40 ? ` … (${defauts.length} au total)` : ''}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T66.A2 — le rapport donne, par configuration, moyenne, minimum, maximum et effectif de chaque mesure, sans intervalle de confiance a trois repetitions',
    () => {
      const ex = campagneTroisRepetitions();
      const rapport = exigeExecution(ex, 'a2', REPETITIONS * PERIODES_PAR_TRAJECTOIRE);

      const agregats = agregatsDeConfiguration(rapport, CONFIGURATION);
      exige(
        agregats.length > 0,
        'agregat-de-la-configuration-present',
        `AUCUN-AGREGAT-POUR-${CONFIGURATION} (II.3.c : objet {configuration: "${CONFIGURATION}", ...} ou cle "${CONFIGURATION}" portant des objets {mean, min, max, n}) dans ${rendu(rapport)}`,
      );
      const stats = agregats.flatMap((a) => a.stats);
      const etiq = (s: Statistique): string[] => s.etiquette.map((x) => x.toLowerCase());
      const etiqNorm = (s: Statistique): string[] => s.etiquette.map(normKey);

      const absentes: string[] = [];
      for (const regle of TOUTES_LES_REGLES) {
        if (!stats.some((s) => etiq(s).includes(regle))) absentes.push(`score ${regle}`);
      }
      for (const [nom, cle] of [['Q', 'q'], ['R', 'r'], ['G', 'g'], ['G_new', 'gnew']] as const) {
        if (!stats.some((s) => etiqNorm(s).includes(cle))) absentes.push(nom);
      }
      if (!stats.some((s) => etiqNorm(s).some((x) => x.includes('token')))) absentes.push('tokens');
      for (const cle of ['linesadded', 'linesremoved', 'filestouched', 'testfileswritten']) {
        if (!stats.some((s) => etiqNorm(s).includes(cle))) absentes.push(cle);
      }
      exige(
        absentes.length === 0,
        'chaque-mesure-a-sa-moyenne-son-minimum-son-maximum-et-son-effectif',
        `MESURES-SANS-AGREGAT pour ${CONFIGURATION} : ${rendu(absentes)} ; etiquettes vues : ${rendu(stats.map((s) => s.etiquette.join('.')).slice(0, 80))}`,
      );

      const effectifs = stats.filter((s) => s.n !== REPETITIONS);
      exige(
        effectifs.length === 0,
        'effectif-egal-au-nombre-de-repetitions',
        `EFFECTIF-DIFFERENT-DE-${REPETITIONS} : ${rendu(effectifs.slice(0, 20).map((s) => [s.etiquette.join('.'), s.n]))}`,
      );
      const desordonnees = stats.filter((s) => !(s.min <= s.mean + 1e-9 && s.mean <= s.max + 1e-9));
      exige(
        desordonnees.length === 0,
        'minimum-moyenne-maximum-ordonnes',
        `STATISTIQUES-INCOHERENTES (min <= moyenne <= max) : ${rendu(desordonnees.slice(0, 20))}`,
      );
      const reglesPasA1: string[] = [];
      for (const regle of TOUTES_LES_REGLES) {
        for (const s of stats.filter((x) => etiq(x).includes(regle))) {
          if (s.mean !== 1 || s.min !== 1 || s.max !== 1) reglesPasA1.push(`${s.etiquette.join('.')}: ${rendu(s)}`);
        }
      }
      exige(
        reglesPasA1.length === 0,
        'scores-par-regle-agreges-egaux-a-1-pour-le-candidat-fidele',
        `AGREGATS-DE-SCORE-DIFFERENTS-DE-1 (le candidat fidele note 1 partout, A1) : ${rendu(reglesPasA1.slice(0, 20))}`,
      );

      const ic = clesIntervalle(rapport);
      exige(
        ic.length === 0,
        'aucun-intervalle-de-confiance-a-trois-repetitions',
        `INTERVALLE-DE-CONFIANCE-AFFICHE avec ${REPETITIONS} repetitions, alors qu'aucun effectif fixe par T35 n'est atteint (II.6) : ${rendu(ic.slice(0, 20))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T66.A3 — un candidat fidele de P1 a P6 qui ignore les remplacements de P7 et P11 note < 1 sur cancel@3 et fifo@2, sans regression comptee pour cancel@2 ni priority@1',
    () => {
      const ex = executerPilote('a3', MANIFEST_UNE_REPETITION, PRIVATION_A3, PERIODES_PAR_TRAJECTOIRE);
      const rapport = exigeExecution(ex, 'a3', PERIODES_PAR_TRAJECTOIRE);

      const recs = enregistrementsDePeriode(rapport).filter((r) => r.configuration === null || r.configuration === CONFIGURATION);
      const parPeriode = new Map<Periode, EnregistrementPeriode[]>();
      for (const p of PERIODES) parPeriode.set(p, recs.filter((r) => r.periode === p));
      const manquants = PERIODES.filter((p) => (parPeriode.get(p) ?? []).length === 0);
      exige(
        manquants.length === 0,
        'douze-periodes-dans-le-rapport-a3',
        `PERIODES-ABSENTES-DU-RAPPORT-A3 : ${rendu(manquants)} ; ${recs.length} enregistrement(s) trouves dans ${rendu(rapport)}`,
      );

      // Temoin (III.6) : fidele de P1 a P6.
      const temoin: string[] = [];
      for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const) {
        for (const r of parPeriode.get(p) ?? []) {
          for (const regle of REGLES_ADR[p]) {
            if (r.scores.get(regle) !== 1) temoin.push(`${p} ${regle}=${rendu(r.scores.get(regle))}`);
          }
        }
      }
      exige(
        temoin.length === 0,
        'temoin-candidat-a3-fidele-de-p1-a-p6',
        `TEMOIN-CASSE : le candidat A3 doit noter 1 sur chaque regle active de P1 a P6 ; vu ${rendu(temoin)}`,
      );

      const nonInferieurs: string[] = [];
      for (const [regle, periodes] of [['cancel@3', ['P7', 'P8']], ['fifo@2', ['P11', 'P12']]] as const) {
        for (const p of periodes) {
          for (const r of parPeriode.get(p) ?? []) {
            const s = r.scores.get(regle);
            if (!(typeof s === 'number' && s < 1)) nonInferieurs.push(`${p} ${regle}=${rendu(s)}`);
          }
        }
      }
      exige(
        nonInferieurs.length === 0,
        'scores-inferieurs-a-1-sur-cancel@3-et-fifo@2',
        `SCORES-NON-INFERIEURS-A-1 : ${rendu(nonInferieurs)} — un candidat qui ignore les remplacements de P7 et P11 doit etre distingue (ADR-018 L218).`,
      );

      const sansListe = recs.filter((r) => r.regressions === null).map((r) => r.periode);
      exige(
        sansListe.length === 0,
        'chaque-periode-porte-ses-regressions',
        `LISTE-DE-REGRESSIONS-ABSENTE (II.3.b) aux periodes ${rendu(sansListe)}`,
      );
      const comptees: string[] = [];
      for (const r of recs) {
        for (const g of r.regressions ?? []) {
          if (g === 'cancel@2' || g === 'priority@1') comptees.push(`${r.periode}: ${g}`);
        }
      }
      exige(
        comptees.length === 0,
        'aucune-regression-comptee-pour-cancel@2-ni-priority@1',
        `REGLE-RETIREE-COMPTEE-EN-REGRESSION (F-REGRESSION, ADR-018 decision 4) : ${rendu(comptees)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
