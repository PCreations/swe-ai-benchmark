/**
 * acceptance/T60.spec.ts — suite d'acceptation de la tache T60.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T60.A1 behaviour — quand le manifeste porte `model.effort` egal a l'une
 *                      des cinq valeurs listees, CHAQUE invocation de la CLI
 *                      `claude` de la campagne recoit `--effort` suivi de
 *                      cette valeur ; quand il ne le porte pas, AUCUNE
 *                      invocation ne recoit `--effort`
 *   T60.A2 refusal   — une valeur de `model.effort` hors de cette liste est
 *                      refusee AVANT toute invocation de la CLI et AVANT
 *                      toute ecriture en base, par une erreur qui nomme la
 *                      valeur
 *   T60.A3 behaviour — chaque periode persistee a candidat reel ET le
 *                      rapport de `bench pilot-conduct` portent l'effort
 *                      utilise, et la valeur nulle quand le manifeste n'en
 *                      porte pas
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T60 EST UNE TACHE D'EXTENSION (ADR-017) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-017-effort-de-raisonnement-du-candidat.md, lignes 40-46),
 * jamais le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths`
 * que verification/tasks.extensions.json declare pour T60 — `packages/
 * agents`, `packages/activities`, `apps/cli` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL,
 * discipline auditable au diff, jamais une barriere technique). Le contrat
 * teste ci-dessous est derive de docs/specs/T60.md et de sa source, le MEME
 * document ACCEPTE, lignes 40-46 (la plage que la carte de T60 epingle dans
 * verification/tasks.extensions.json#spec_source), AINSI QUE du corps
 * narratif du MEME document, hors de cette plage — la meme liberte que
 * prennent deja acceptance/T48.spec.ts a acceptance/T59.spec.ts face a leur
 * propre ADR :
 *
 *   « Décision » (L26-33) : « L'effort est un champ optionnel du manifeste,
 *   `model.effort`. Quand il est présent, chaque invocation de la CLI pour
 *   la campagne reçoit `--effort <niveau>`. Quand il est absent, aucun
 *   drapeau n'est passé et l'effort est enregistré comme non spécifié. Une
 *   valeur hors de la liste est refusée avant toute invocation et toute
 *   écriture. L'effort utilisé est persisté avec chaque période et figure
 *   dans le rapport de la campagne. »
 *   « Contexte » (L16-17) : « La CLI `claude` (2.1.302) expose `--effort
 *   <level>` avec les niveaux `low`, `medium`, `high`, `xhigh` et `max`. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions et contrats DEJA
 * FIXES par les suites ACCEPTEES dont elle depend (jamais des sources de
 * T60) :
 *   - acceptance/T39.spec.ts (II) : le manifeste `bench.pilot.manifest/1`
 *     (corpus/groups/clone_instance_ids, model/price/exposure/budget,
 *     configurations, repetitions, periods_per_trajectory).
 *   - acceptance/T46.spec.ts (II.1, II.2) : la sous-commande `pilot-conduct`
 *     — `bench pilot-conduct <manifest.json> --campaign-id <id>
 *     --postgres-database <db> --s3-bucket <bucket> --provider claude-cli
 *     --mode recorded [--live]` —, DEJA IMPLEMENTEE a HEAD (mesure reelle,
 *     section IV) : cette suite ne la re-prouve pas, elle l'invoque comme un
 *     oracle et observe SEULEMENT ce qu'ADR-017 y ajoute.
 *   - acceptance/T58.spec.ts / T59.spec.ts (socle CLI+PostgreSQL+faux
 *     claude, `envDeBase`, `verifierFauxEnTetePath`) — REPRIS A L'IDENTIQUE.
 *   - acceptance/T39.spec.ts (`tablesDeBase`, recherche structurelle de
 *     toutes les tables d'une base) — REPRIS A L'IDENTIQUE, et ETENDU ICI
 *     par `totalLignes` (compte brut, sans motif, pour A2) et par
 *     `colonnesEffort`/`compterEffort` (recherche d'une COLONNE par ROLE,
 *     pour A3 — voir section II.2).
 *   - acceptance/fixtures/claude-cli/bin/claude (zone ACCEPTANCE, DEJA
 *     PUBLIEE par T47/T49/T52/T55) :
 *     `BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR` +
 *     `BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE` — UN enregistrement
 *     DISTINCT {argv, cwd, hasApiKey, hasAuthToken} par invocation
 *     successive de session (jamais ecrase), et `BENCH_FAKE_CLAUDE_AUTH_
 *     MARKER_FILE` — ecrit uniquement quand l'argv contient "auth status" —
 *     REPRIS A L'IDENTIQUE.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME, FAUTE D'ENONCE DANS L'ADR SUR LA FORME
 * EXACTE (meme geste que T46 fixant `pilot-conduct`, T59 fixant ses propres
 * fixtures candidates) — AUCUNE DES VALEURS CI-DESSOUS N'A ETE OBTENUE EN
 * EXECUTANT UNE IMPLEMENTATION DE T60 : AUCUNE N'EXISTE au moment ou cette
 * suite est ecrite (ADR-001), SAUF au sens precis de la section IV (le
 * SOCLE `pilot-conduct --provider claude-cli --live` est, lui, DEJA
 * implemente et DEJA mesure).
 *
 * 1. Deux manifestes NEUFS, publies par cette tache (zone ACCEPTANCE),
 *    COPIES EXACTES de acceptance/fixtures/pilot-longitudinal/manifest-t52-
 *    claude-cli-four-periods.json (T52, DEJA ACCEPTE), a une seule
 *    difference chacun — jamais une invention du reste du manifeste :
 *      - manifest-t60-claude-cli-effort-xhigh.json    : `model.effort` =
 *        "xhigh" (une des cinq valeurs listees, ADR-017:L17).
 *      - manifest-t60-claude-cli-effort-invalide.json : `model.effort` =
 *        "turbo" (hors de la liste, choisie pour n'etre AUCUNE des cinq
 *        valeurs ADR-017:L17 ni aucun synonyme usuel).
 *    Le manifeste SANS `model.effort` est acceptance/fixtures/pilot-
 *    longitudinal/manifest-t52-claude-cli-four-periods.json LUI-MEME,
 *    REPRIS A L'IDENTIQUE, jamais copie : la branche « absent » de A1/A3
 *    exerce ainsi un manifeste DEJA ACCEPTE par une tache anterieure,
 *    jamais une fixture que cette suite aurait pu biaiser.
 * 2. L'EMPLACEMENT OU EST OBSERVE « chaque periode persistee [...] porte
 *    l'effort » (ADR-017:L32-33, clause DISTINCTE de « le rapport [...]
 *    porte l'effort »). Cette suite a MESURE (section IV) que le tableau
 *    RACINE `periods[]` du rapport de `pilot-conduct` — FIXE par
 *    acceptance/T46.spec.ts (II.2) — reste VIDE sous `--provider claude-cli
 *    --live` MEME quand `periods_persisted` est non nul (comportement
 *    PREEXISTANT a T60, HORS DE SA PORTEE) : y chercher `effort` ferait
 *    rougir A3 pour une raison SANS RAPPORT avec l'effort, et le cas serait
 *    FAUSSEMENT ROUGE y compris apres une implementation correcte de T60.
 *    Cette suite observe donc la PERSISTANCE DIRECTEMENT en base — jamais
 *    seulement le rapport de l'orchestrateur sur lui-meme (meme discipline
 *    que acceptance/T46.spec.ts (IV.1)) : sur la base ISOLEE et FRAICHE
 *    d'un contexte (une par branche, jamais reutilisee), `colonnesEffort`
 *    cherche une colonne dont le nom normalise contient `effort` dans
 *    TOUTES les tables (role de colonne, jamais un nom de table — la
 *    meme discipline que acceptance/T39.spec.ts cherchant un MOTIF dans
 *    TOUTES les tables), et `compterEffort` exige que TOUTES ses lignes
 *    (au moins `periods_per_trajectory`) portent la valeur attendue. Pour
 *    « le rapport [...] porte l'effort », DEUX emplacements DISTINCTS de
 *    la persistance en base : la racine du rapport JSON OU `racine.model`
 *    (le SEUL autre endroit ou le manifeste lui-meme porte cette
 *    information, `model.effort` — ADR-017:L28) — jamais une invention
 *    arbitraire d'un troisieme emplacement.
 * 3. `--effort` (ADR-017:L29, litteral) est le SEUL drapeau cherche dans
 *    l'argv de CHAQUE invocation enregistree du faux executable — jamais un
 *    drapeau synonyme invente par cette suite.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne redemontre ni le manifeste `bench.pilot.manifest/1` (T39), ni la
 *    sous-commande `pilot-conduct` elle-meme au-dela de ce qu'ADR-017 ajoute
 *    (T46/T49/T52/T58), ni le protocole d'authentification (T47) : elle
 *    REUTILISE ces resultats comme des oracles, jamais ne les re-prouve.
 *  • Elle ne pretend rien sur reserve@1/idempotence@1/cancel@1/fifo@1/
 *    isolation@1 : ADR-017 ne touche QUE l'effort, jamais les controles du
 *    scenario scripte (ils restent VIOLATED a HEAD avec le candidat par
 *    defaut du faux executable — mesure IV — sans rapport avec T60).
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T47/.../T59 (A1/A3
 *    l'exercent reellement avec succes ; A2 verifie en outre qu'AUCUNE
 *    invocation n'a lieu du tout, pas meme vers le faux executable).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * MESURE REELLE, A HEAD (T60 NOT_IMPLEMENTED au moment ou cette suite est
 * ecrite — verification/tasks.extensions.json#T60.status)
 *
 * `node --experimental-vm-modules node_modules/jest/bin/jest.js
 * acceptance/T60.spec.ts`, ce boot, PATH prefixe par le faux executable
 * (3 cas, 10.9s au total) :
 *
 *   T60.A1 ROUGE (3.7s) — `pilot-conduct --provider claude-cli --live` EST
 *   reconnue et s'execute (exit 0, 4 periodes persistees) : l'assertion
 *   'chaque-invocation-recoit---effort-suivi-de-la-valeur-du-manifeste'
 *   echoue en nommant precisement 4/4 invocations enregistrees SANS
 *   `--effort xhigh` — l'argv REELLEMENT recu par le faux `claude` ne porte
 *   AUCUN `--effort`, quel que soit `model.effort` du manifeste : ADR-017
 *   n'est pas encore cable dans `launchClaudeCliPeriod`.
 *   T60.A2 ROUGE (3.1s) — 'manifeste-effort-invalide-refuse-code-non-nul'
 *   echoue : `pilot-conduct` avec `model.effort:"turbo"` REUSSIT (exit 0,
 *   JSON `{"schema":"bench.pilot_conduct.result/1",...}`), AUCUN refus —
 *   exactement l'absence de validation que ADR-017:L31 interdit.
 *   T60.A3 (mesure PRELIMINAIRE, section II.2, AVANT la correction qui a
 *   introduit `colonnesEffort`/`compterEffort` — conservee ici pour la
 *   discipline d'audit) : le tableau RACINE `periods[]` du rapport REEL
 *   est VIDE (`"periods":[]`) alors que `periods_persisted` vaut 4 — fait
 *   qui a motive le choix de l'observation directe en base (II.2) plutot
 *   que cette cle. Avec l'observation en base, AUCUNE colonne nommee
 *   `effort` n'existe encore dans le schema a HEAD : 'chaque-periode-
 *   persistee-porte-l-effort-utilise' echoue en nommant precisement
 *   l'absence de colonne.
 *
 * Les perturbations exactes de A1-A3 sont celles de
 * verification/cases.extensions.lock.json#T60, realisees mot pour mot par
 * verification/mutants/T60.json.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * commun — REPRIS, SANS LE REINVENTER, de acceptance/T39.spec.ts/T58.spec.ts/
 * T59.spec.ts (socle CLI+PostgreSQL+faux claude). */

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
  if (v instanceof Error) {
    const code = (v as unknown as Json).code;
    return `${v.name}${typeof code === 'string' ? `(${code})` : ''}: ${v.message}`;
  }
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

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t60_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

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
function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();

const BASES_CREEES: string[] = [];
const WORKSPACES_CREES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of WORKSPACES_CREES) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/** Nombre total de LIGNES (sans motif) dans TOUTES les tables de base de `db` — pour A2 :
 *  « avant toute ecriture en base ». Extension, pour ce besoin precis, de `occurrences`
 *  (acceptance/T39.spec.ts), qui compte un MOTIF textuel plutot qu'un total brut. */
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
function totalLignes(db: string): number {
  const tables = tablesDeBase(db);
  if (tables.length === 0) return 0;
  const parts = tables.map((t) => `SELECT count(*) AS n FROM "${t.schema}"."${t.nom}"`);
  const r = psql(db, parts.join(' UNION ALL '));
  if (!r.ok) return -1;
  return r.out
    .split('\n')
    .map((l) => Number.parseInt(l.trim(), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => a + b, 0);
}
/** Les colonnes dont le nom normalise contient `effort`, dans TOUTES les tables de base
 *  de `db` — base ISOLEE et FRAICHE (une par contexte, jamais reutilisee), de sorte
 *  qu'aucune colonne candidate ne puisse provenir d'autre chose que de la persistance de
 *  `model.effort` (ADR-017:L32, « L'effort [...] est persisté avec chaque période »).
 *  Jamais une recherche par NOM DE TABLE : le schema de persistance est une source de
 *  T60 (packages/activities, non lue), ce qui se nomme ici est un ROLE de colonne. */
function colonnesEffort(db: string): { schema: string; table: string; colonne: string }[] {
  const r = psql(
    db,
    `SELECT table_schema || '|' || table_name || '|' || column_name FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND lower(column_name) LIKE '%effort%'
      ORDER BY 1`,
  );
  if (!r.ok || r.out.length === 0) return [];
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.split('|').length === 3)
    .map((l) => {
      const [schema, table, colonne] = l.split('|');
      return { schema: schema as string, table: table as string, colonne: colonne as string };
    });
}

/** Pour la PREMIERE colonne trouvee par `colonnesEffort` (base isolee : il ne peut en
 *  exister qu'une famille, celle de cette persistance) : le nombre total de lignes de sa
 *  table, et le nombre de lignes dont la colonne vaut EXACTEMENT `egal` (`null` signifie
 *  litteralement IS NULL — ADR-017:L30, « la valeur nulle quand le manifeste n'en porte
 *  pas », une cle PRESENTE et NULLE, jamais une ligne absente). */
function compterEffort(db: string, egal: string | null): { table: string; total: number; correspond: number } | null {
  const cols = colonnesEffort(db);
  if (cols.length === 0) return null;
  const c = cols[0] as { schema: string; table: string; colonne: string };
  const totalR = psql(db, `SELECT count(*) FROM "${c.schema}"."${c.table}"`);
  const total = totalR.ok ? Number.parseInt(totalR.out.trim(), 10) : -1;
  const condition = egal === null ? `"${c.colonne}" IS NULL` : `"${c.colonne}" = ${lit(egal)}`;
  const matchR = psql(db, `SELECT count(*) FROM "${c.schema}"."${c.table}" WHERE ${condition}`);
  const correspond = matchR.ok ? Number.parseInt(matchR.out.trim(), 10) : -1;
  return { table: `${c.schema}.${c.table}`, total, correspond };
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
      maxBuffer: 64 * 1024 * 1024,
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

function envDeBase(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

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
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${court(`${t.stdout}${t.stderr}`, 300).split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/** Texte COMPLET (non tronque) de toutes les tentatives — pour A2, qui doit observer que le
 *  refus NOMME la valeur, meme si le message est long. */
function texteCompletAppel(appel: AppelCli): string {
  return appel.tentatives.map((t) => `${t.stdout}\n${t.stderr}`).join('\n─────\n');
}

/* ════════════════════════ fixture claude-cli (reprise T47/.../T59) */

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

/** Environnement de base, PATH prefixe par le faux `claude`, garde verifiee a chaque appel. */
function envFauxClaude(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    ...extra,
  };
  verifierFauxEnTetePath(env);
  return env;
}

/** acceptance/T55.spec.ts (ADDITIF) : UN enregistrement DISTINCT {argv,cwd,hasApiKey,
 *  hasAuthToken} par invocation successive de session, jamais ecrase — NECESSAIRE pour
 *  observer CHAQUE invocation d'une campagne de plusieurs periodes (A1), ou pour prouver
 *  qu'AUCUNE n'a eu lieu (A2). */
function envEnregistrementParPlan(planDir: string, counterFile: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return envFauxClaude({
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: planDir,
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: counterFile,
    ...extra,
  });
}

type Enregistrement = { argv: string[]; cwd: string; hasApiKey: boolean; hasAuthToken: boolean };
function lireEnregistrements(dir: string): Enregistrement[] {
  if (!fs.existsSync(dir)) return [];
  const fichiers = fs
    .readdirSync(dir)
    .filter((f) => /^record-\d+\.json$/.test(f))
    .sort((a, b) => Number.parseInt(a.replace(/\D/g, ''), 10) - Number.parseInt(b.replace(/\D/g, ''), 10));
  return fichiers
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Enregistrement;
      } catch {
        return null;
      }
    })
    .filter((x): x is Enregistrement => x !== null);
}

function nouveauPlan(suffixe: string): { dir: string; counterFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t60-plan-${suffixe}-`));
  WORKSPACES_CREES.push(dir);
  return { dir, counterFile: path.join(dir, 'counter.txt') };
}

/** Le drapeau cherche dans CHAQUE argv enregistre — ADR-017:L29, litteral. */
const DRAPEAU_EFFORT = '--effort';
function argvPorteEffort(argv: string[], valeur: string): boolean {
  const idx = argv.indexOf(DRAPEAU_EFFORT);
  return idx >= 0 && argv[idx + 1] === valeur;
}

/* ════════════════ extraction de champs — FORME PLATE (reprise T46/T49/T59) */

function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}
const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Cherche `alias` SOIT comme cle propre de `racine`, SOIT comme cle propre de
 *  `racine.model` — les DEUX SEULS emplacements ou le manifeste lui-meme porte cette
 *  information (`model.effort`, ADR-017:L28) ou ou un champ de prerequis est deja echo a
 *  la racine (`budget`, T46 II.2). Jamais une recherche profonde dans TOUT le rapport :
 *  celle-ci confondrait « le rapport porte l'effort » (clause distincte, ADR-017:L33) avec
 *  « chaque periode porte l'effort » (verifie separement, par periode, ci-dessus). */
function champRacineOuModele(racine: unknown, alias: readonly string[]): { present: boolean; valeur: unknown; ou: string } {
  const o = obj(racine);
  const cible = new Set(alias.map(normKey));
  for (const [k, v] of Object.entries(o)) {
    if (cible.has(normKey(k))) return { present: true, valeur: v, ou: `racine.${k}` };
  }
  const modele = obj(o.model);
  for (const [k, v] of Object.entries(modele)) {
    if (cible.has(normKey(k))) return { present: true, valeur: v, ou: `racine.model.${k}` };
  }
  return { present: false, valeur: undefined, ou: '(absent de la racine et de racine.model)' };
}

/* ════════════════════ pilot-conduct (T46/T49/T52/T58/T59, REPRIS A L'IDENTIQUE) */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21)
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008:L149
const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008:L98

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t60-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t60-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

function conduire(ctx: Contexte, manifest: string, env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [
      manifest,
      '--campaign-id', ctx.campaignId,
      '--postgres-database', ctx.db,
      '--s3-bucket', ctx.bucket,
      '--mode', MODE,
      '--provider', PROVIDER_CLAUDE_CLI,
      DRAPEAU_LIVE,
      '--candidate-workspace-root', ctx.workspaceRoot,
    ],
    env,
  );
}

const ALIAS_EFFORT = ['effort']; // FIXE ICI (II) — ADR-017:L28 (`model.effort`)
const PERIODS_PAR_TRAJECTOIRE = 4; // acceptance/fixtures/pilot-longitudinal/manifest-t52-...json et manifest-t60-...json : periods_per_trajectory

/* ───────────────── manifestes, JAMAIS des sources de T60 */

const MANIFEST_SANS_EFFORT = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t52-claude-cli-four-periods.json'); // T52, DEJA ACCEPTE
const MANIFEST_EFFORT_XHIGH = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t60-claude-cli-effort-xhigh.json'); // publie par T60
const MANIFEST_EFFORT_INVALIDE = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t60-claude-cli-effort-invalide.json'); // publie par T60
for (const f of [MANIFEST_SANS_EFFORT, MANIFEST_EFFORT_XHIGH, MANIFEST_EFFORT_INVALIDE]) {
  if (!fs.existsSync(f)) throw new Error(`FIXTURE-ABSENTE : ${f}`);
}
/** ADR-017:L17, litteral (« low, medium, high, xhigh et max ») — valeur choisie pour A1/A3. */
const EFFORT_UTILISE = 'xhigh';
/** Hors de la liste ADR-017:L17 — choisie pour A2, jamais un synonyme usuel d'un niveau. */
const EFFORT_INVALIDE = 'turbo';

exige(
  EFFORT_UTILISE === 'xhigh' && !['low', 'medium', 'high', 'xhigh', 'max'].includes(EFFORT_INVALIDE),
  'effort-utilise-valide-et-effort-invalide-hors-de-la-liste-adr-017',
  `EFFORT_UTILISE=${rendu(EFFORT_UTILISE)} EFFORT_INVALIDE=${rendu(EFFORT_INVALIDE)}`,
);

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T60 — faire de l effort de raisonnement du candidat une variable du manifeste', () => {
  test(
    'T60.A1 chaque invocation de la cli claude de la campagne recoit --effort suivi de la valeur du manifeste, et aucune ne le recoit quand le manifeste n en porte pas (ADR-017)',
    () => {
      // ── branche 1 : model.effort = 'xhigh' present dans le manifeste ──
      const ctx1 = nouveauContexte('a1-present');
      const plan1 = nouveauPlan('a1-present');
      const env1 = envEnregistrementParPlan(plan1.dir, plan1.counterFile);
      const run1 = conduire(ctx1, MANIFEST_EFFORT_XHIGH, env1);
      exige(run1.resultat !== null && run1.exit === 0, 'pilot-conduct-claude-cli-live-execute-effort-present', messageEchec('pilot-conduct(effort-present)', run1));

      const enreg1 = lireEnregistrements(plan1.dir);
      exige(enreg1.length > 0, 'au-moins-une-invocation-enregistree-effort-present', `0 enregistrement sous ${plan1.dir}`);
      const sansEffort1 = enreg1.filter((e) => !argvPorteEffort(e.argv, EFFORT_UTILISE));
      exige(
        sansEffort1.length === 0,
        'chaque-invocation-recoit---effort-suivi-de-la-valeur-du-manifeste',
        `${sansEffort1.length}/${enreg1.length} invocation(s) sans --effort ${rendu(EFFORT_UTILISE)} correct : ${rendu(sansEffort1.map((e) => e.argv))}`,
      );

      // ── branche 2 : model.effort absent du manifeste ──
      const ctx2 = nouveauContexte('a1-absent');
      const plan2 = nouveauPlan('a1-absent');
      const env2 = envEnregistrementParPlan(plan2.dir, plan2.counterFile);
      const run2 = conduire(ctx2, MANIFEST_SANS_EFFORT, env2);
      exige(run2.resultat !== null && run2.exit === 0, 'pilot-conduct-claude-cli-live-execute-effort-absent', messageEchec('pilot-conduct(effort-absent)', run2));

      const enreg2 = lireEnregistrements(plan2.dir);
      exige(enreg2.length > 0, 'au-moins-une-invocation-enregistree-effort-absent', `0 enregistrement sous ${plan2.dir}`);
      const avecEffort2 = enreg2.filter((e) => e.argv.includes(DRAPEAU_EFFORT));
      exige(
        avecEffort2.length === 0,
        'aucune-invocation-ne-recoit---effort-quand-le-manifeste-n-en-porte-pas',
        `${avecEffort2.length}/${enreg2.length} invocation(s) avec --effort alors que le manifeste n'en porte pas : ${rendu(avecEffort2.map((e) => e.argv))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T60.A2 une valeur de model.effort hors de la liste low medium high xhigh max est refusee avant toute invocation de la cli et avant toute ecriture en base, par une erreur qui nomme la valeur (ADR-017)',
    () => {
      const ctx = nouveauContexte('a2');
      const plan = nouveauPlan('a2');
      const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 't60-a2-auth-'));
      WORKSPACES_CREES.push(authDir);
      const authMarker = path.join(authDir, 'auth-marker.json');
      const env = envEnregistrementParPlan(plan.dir, plan.counterFile, { BENCH_FAKE_CLAUDE_AUTH_MARKER_FILE: authMarker });

      const run = conduire(ctx, MANIFEST_EFFORT_INVALIDE, env);

      exige(run.exit !== null && run.exit !== 0, 'manifeste-effort-invalide-refuse-code-non-nul', messageEchec('pilot-conduct(effort-invalide)', run));

      const texte = texteCompletAppel(run);
      exige(
        texte.includes(EFFORT_INVALIDE),
        'le-refus-nomme-la-valeur-d-effort-invalide',
        `valeur ${rendu(EFFORT_INVALIDE)} absente du message de refus ; vu ${court(texte, 2000)}`,
      );

      const enreg = lireEnregistrements(plan.dir);
      exige(enreg.length === 0, 'aucune-invocation-de-session-de-la-cli-claude-avant-le-refus', `vu ${rendu(enreg)}`);
      exige(!fs.existsSync(authMarker), 'aucun-appel-auth-status-non-plus-avant-le-refus', `marqueur ecrit a ${authMarker}`);

      const total = totalLignes(ctx.db);
      exige(
        total === 0,
        'aucune-ecriture-en-base-avant-le-refus',
        `la base ${ctx.db} porte ${total} ligne(s) au total alors que le refus doit preceder toute ecriture (ADR-017:L31-32)`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T60.A3 chaque periode persistee a candidat reel et le rapport de pilot-conduct portent l effort utilise, et la valeur nulle quand le manifeste n en porte pas (ADR-017)',
    () => {
      // ── branche 1 : model.effort = 'xhigh' present ──
      const ctx1 = nouveauContexte('a3-present');
      const run1 = conduire(ctx1, MANIFEST_EFFORT_XHIGH, envFauxClaude());
      exige(run1.resultat !== null && run1.exit === 0, 'pilot-conduct-claude-cli-live-execute-effort-present', messageEchec('pilot-conduct(A3,effort-present)', run1));

      // Observation DIRECTE en base (jamais le seul rapport de l'orchestrateur sur
      // lui-meme) : la base de ctx1 est ISOLEE et FRAICHE (une par contexte), de sorte
      // que toute colonne nommee `effort` ne peut provenir que de CETTE persistance
      // (ADR-017:L32). MESURE REELLE (section IV) : le tableau RACINE `periods[]` du
      // rapport de pilot-conduct reste VIDE sous `--provider claude-cli --live` meme a
      // `periods_persisted` non nul (comportement PREEXISTANT, hors de portee de T60) —
      // cette suite n'y cherche donc PAS `effort`, et query la PERSISTANCE directement.
      const compte1 = compterEffort(ctx1.db, EFFORT_UTILISE);
      exige(
        compte1 !== null && compte1.total >= PERIODS_PAR_TRAJECTOIRE && compte1.correspond === compte1.total,
        'chaque-periode-persistee-porte-l-effort-utilise',
        compte1 === null
          ? `aucune colonne nommee 'effort' trouvee dans ${ctx1.db} alors qu'une periode doit persister l'effort utilise (ADR-017:L32)`
          : `table ${compte1.table} : ${compte1.correspond}/${compte1.total} ligne(s) a ${rendu(EFFORT_UTILISE)}, attendu ${compte1.total}/${compte1.total} (>= ${PERIODS_PAR_TRAJECTOIRE})`,
      );

      const rapportEffort1 = champRacineOuModele(run1.resultat, ALIAS_EFFORT);
      exige(
        rapportEffort1.present && rapportEffort1.valeur === EFFORT_UTILISE,
        'le-rapport-de-pilot-conduct-porte-l-effort-utilise',
        `attendu 'effort'=${rendu(EFFORT_UTILISE)} a la racine du rapport ou sous racine.model ; vu ${rendu(rapportEffort1)} dans ${rendu(run1.resultat)}`,
      );

      // ── branche 2 : model.effort absent ──
      const ctx2 = nouveauContexte('a3-absent');
      const run2 = conduire(ctx2, MANIFEST_SANS_EFFORT, envFauxClaude());
      exige(run2.resultat !== null && run2.exit === 0, 'pilot-conduct-claude-cli-live-execute-effort-absent', messageEchec('pilot-conduct(A3,effort-absent)', run2));

      const compte2 = compterEffort(ctx2.db, null);
      exige(
        compte2 !== null && compte2.total >= PERIODS_PAR_TRAJECTOIRE && compte2.correspond === compte2.total,
        'chaque-periode-persistee-porte-une-valeur-nulle-d-effort-quand-le-manifeste-n-en-porte-pas',
        compte2 === null
          ? `aucune colonne nommee 'effort' trouvee dans ${ctx2.db}`
          : `table ${compte2.table} : ${compte2.correspond}/${compte2.total} ligne(s) a NULL, attendu ${compte2.total}/${compte2.total} (>= ${PERIODS_PAR_TRAJECTOIRE}) — ADR-017:L30 exige une cle PRESENTE et NULLE, jamais une valeur de remplacement`,
      );

      const rapportEffort2 = champRacineOuModele(run2.resultat, ALIAS_EFFORT);
      exige(
        rapportEffort2.present && rapportEffort2.valeur === null,
        'le-rapport-de-pilot-conduct-porte-une-valeur-nulle-d-effort-quand-le-manifeste-n-en-porte-pas',
        `attendu 'effort'=null a la racine du rapport ou sous racine.model ; vu ${rendu(rapportEffort2)} dans ${rendu(run2.resultat)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
