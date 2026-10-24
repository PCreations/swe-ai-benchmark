/**
 * acceptance/T69.spec.ts — suite d'acceptation de la tache T69.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T69.A1 absence   — pour chaque periode de F-LONG, chaque decision, statut
 *                      et code d'erreur que le notateur compare pour une regle
 *                      active a cette periode figure litteralement dans le
 *                      prompt de la periode, avec le nom du champ qui le porte
 *   T69.A2 behaviour — pour chaque operation que le notateur juge, chaque
 *                      forme de reponse qu'il compare, succes et erreur, a au
 *                      moins un exemple public de cette forme exacte dans le
 *                      prompt, et aucun exemple ne reproduit une valeur
 *                      attendue par une sequence
 *   T69.A3 behaviour — lance par `bench pilot-conduct --provider claude-cli
 *                      --live` avec le faux executable `claude`, un candidat
 *                      de reference dont les noms de champs, les valeurs et
 *                      les formes proviennent du seul prompt recu obtient un
 *                      score de 1 sur chaque regle active a chaque periode
 *   T69.A4 behaviour — chaque periode persistee porte, pour chaque regle notee
 *                      sous 1, l'operation, l'attendu et la reponse recue de la
 *                      premiere etape non satisfaite d'au moins une sequence
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T69 EST UNE TACHE D'EXTENSION (ADR-020, L80-86 ; docs/specs/T69.md).
 * L'auteur de cette suite est AVEUGLE aux `source_paths` de T69
 * (`packages/activities`, `packages/scenario`) : il ne les a lus ni
 * directement ni par `git show` (ADR-001, aveuglement PROCEDURAL). Il a
 * observe, en les APPELANT, les exports deja publics que les suites T67/T68
 * resolvent (generateur de sequences v4, modele attendu v4), et le prompt
 * REEL que recoit `claude -p`, enregistre par le faux executable.
 *
 *   ADR-020 « Ce que le pilote F-LONG a montre » : le prompt F-LONG « ne
 *          donne aucune des valeurs que le notateur compare : la decision
 *          d'une reservation en attente, `waiting` [...] ; la forme de la
 *          reponse de `read` (`{status, waiting_position}`) ; les codes
 *          d'erreur `QUOTA_EXCEEDED`, `CANCELLATION_TOO_LATE` et `NOT_FOUND` ;
 *          la forme de `balance` et de `history` (`{type, status, at}`). »
 *          « T66.A1 ne pouvait pas le voir : son candidat fixture connait le
 *          vocabulaire par construction. Et le rapport ne garde pas la
 *          raison d'un echec. »
 *   ADR-020 decisions 1 a 4 : vocabulaire, formes, critere mecanique,
 *          diagnostic — les quatre cas, dans cet ordre.
 *   docs/pilot/pilote-reel-2026-10-24-f-long.json, champ `validite` : le
 *          defaut constate (« Sonnet medium : `waitlisted` »).
 *
 * Cette suite REPREND, SANS LES REINVENTER :
 *   - le socle CLI + PostgreSQL + faux `claude` d'acceptance/T66.spec.ts
 *     (`lancer`, `envFauxClaude`, `verifierFauxEnTetePath` A L'IDENTIQUE,
 *     `creerBase`, `conduire`, `lireEnregistrements`, la lecture tolerante
 *     des enregistrements de periode du rapport) ;
 *   - l'enregistrement du prompt de CHAQUE session (BENCH_FAKE_CLAUDE_RECORD_
 *     FILE_PLAN_DIR, T55), la derivation du candidat depuis le prompt recu
 *     (BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE, T55.A3) et le plan
 *     d'ecriture (T52) — le faux executable n'est PAS modifie ;
 *   - la resolution tolerante des roles v4 d'acceptance/T68.spec.ts
 *     (ROLES_GENERATEUR_V4, chargement de packages/scenario + activities) ;
 *   - le candidat v4 (acceptance/fixtures/candidates/f-long-reference-
 *     candidate-v4.mjs) et sa privation BENCH_DROP_RULE (liste, T66) ;
 *   - `pairesExemples` (acceptance/T58.spec.ts, t58-derive) ;
 *   - REGLES_ADR (reprise gelee de T61.V, via T66/T68).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001)
 *
 * 1. CE QUE LE NOTATEUR COMPARE A UNE PERIODE P est DERIVE, a l'execution, du
 *    MODELE ATTENDU EXPORTE — jamais recopie d'une observation :
 *      a) pour chaque regle de REGLES_ADR[P] que le generateur v4 couvre (les
 *         regles introduites a partir de P5, T68) : les attentes (`expect`)
 *         de CHAQUE etape de CHAQUE sequence du lot rendu par le generateur
 *         v4 pour (regle, P, graine) ;
 *      b) pour les regles que le generateur v4 ne couvre pas (P1 a P4 :
 *         reserve@1, idempotence@1, fifo@1, cancel@1/2, isolation@1), notees
 *         par un notateur qu'aucun export ne decrit : les attentes que rend
 *         le modele attendu v4 (`ExpectedModelV4`, `new X(P)` puis
 *         `apply(etape)`) sur des SONDES ecrites par cette suite
 *         (acceptance/fixtures/claude-cli/t69-contrat-compare.mjs, `sondes`) :
 *         deux reservations sur un creneau de capacite 1, leurs lectures, une
 *         annulation, et — si isolation@1 est active a P — une lecture depuis
 *         un autre locataire. Les ETAPES sont de cette suite ; les VALEURS et
 *         les FORMES sont celles du modele.
 *    L'horloge des sondes est celle de la periode dans la racine gelee
 *    acceptance/reference-long/F-LONG.json (`valeurs.horloges_des_periodes`).
 * 2. A1 — UNE VALEUR « FIGURE AVEC LE NOM DU CHAMP QUI LA PORTE » si le
 *    prompt contient la valeur entre guillemets ou accents graves, precedee
 *    SUR LA MEME LIGNE, a moins de 120 caracteres, du nom du champ comme
 *    identifiant entier (`pairesChampValeur`, definition PARTAGEE avec le
 *    generateur de A3) : `"decision":"waiting"`, « `decision` vaut
 *    `waiting` », « `error.code` vaut `NOT_FOUND` » conviennent. Le champ
 *    est la cle de l'attente qui porte la valeur (`decision`, `status`,
 *    `code`, `type`) ; les valeurs sont les feuilles texte des attentes qui
 *    sont des jetons de vocabulaire (`valeursComparees`).
 * 3. A2 — LA FORME COMPAREE d'une attente (`formeAttendue`) : enveloppe et
 *    `result` fermes, `error` et element d'evenements ouverts, `ok` dans la
 *    forme (succes/erreur), valeurs exceptees ; une valeur de `read` est
 *    fermee (`{status}` et `{status, waiting_position}` sont deux formes).
 *    UN EXEMPLE PUBLIC est une paire requete -> reponse JSON du prompt, liee
 *    par `id` (`pairesExemples`). « Aucun exemple ne reproduit une valeur
 *    attendue par une sequence » : aucune paire dont l'operation et les
 *    arguments sont ceux d'une etape d'une sequence generee (II.1.a) ET dont
 *    la reponse satisfait l'attente de cette etape (`satisfait`).
 * 4. A3 — LE CANDIDAT DERIVE est ecrit, a chaque session, par le faux
 *    `claude` au moyen de acceptance/fixtures/claude-cli/t69-derive-
 *    reference-candidate.mjs (son en-tete documente ce qui est derive : noms
 *    de champs et formes depuis les exemples publics, valeurs depuis les
 *    paires champ -> valeur ; comportement de v4 embarque, traduit a la
 *    sortie). La suite l'appelle au travers d'un petit module d'emballage
 *    qu'elle ecrit dans un repertoire temporaire (chemin du journal de
 *    trafic ; renommage du temoin negatif). TEMOIN NEGATIF (sans lui A3
 *    serait creux) : le MEME generateur, sur un prompt ou la decision
 *    d'attente — la valeur que le modele attendu rend pour la seconde
 *    reservation d'un creneau de capacite 1 en P1 — est renommee
 *    `waitlisted` (le mot de Sonnet, pilote reel), doit etre note sous 1 sur
 *    au moins une regle active. Manifeste NEUF :
 *    acceptance/fixtures/pilot-longitudinal/manifest-t69-claude-cli-f-long-
 *    one-repetition.json (une repetition de 12 periodes).
 * 5. A4 — LE CANDIDAT EN ECHEC est v4 prive de `cancel@2`, `capacity@1` et
 *    `quota@1` (PRIVATION_A4), ecrit par le plan du faux `claude` comme en
 *    T66. Pour chaque enregistrement de periode du rapport (II.3.b de T66)
 *    et chaque regle notee sous 1, cette suite cherche, sous cet
 *    enregistrement, un DIAGNOSTIC rattache a la regle (range sous une cle
 *    egale a l'identifiant de la regle, ou dans un objet dont `rule`/
 *    `rule_id` la nomme) qui porte : l'OPERATION (`operation`, `op`,
 *    `request`, `step` : nom d'operation du contrat v4, ou objet `{op}`),
 *    l'ATTENDU (`expected`, `expect`, `attendu`, `expectation`) et la
 *    REPONSE RECUE (`received`, `actual`, `got`, `observed`, `response`,
 *    `recu`), non nuls, et distincts l'un de l'autre. « Persistee » : chaque
 *    diagnostic retenu doit aussi figurer (memes trois valeurs, a l'ordre
 *    des cles pres) dans les lignes de la base PostgreSQL de la campagne
 *    (toutes les tables du schema `public`, JSON imbrique compris), la ou
 *    `pilot-conduct` persiste ses periodes (`periods_persisted`).
 *    Temoin : chaque regle privee doit etre notee sous 1 a au moins une
 *    periode, sinon A4 serait creux.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LES DANGERS PROPRES A T69, ET LEUR CONTROLE
 *
 * (1) Une liste de valeurs recopiee de l'ADR ou d'une observation, qui
 *     manquerait une valeur ajoutee plus tard au notateur : II.1 la recalcule
 *     depuis le modele exporte a chaque execution.
 * (2) Un prompt qui cite `waiting` sans son champ, ou une forme sans exemple :
 *     A1 exige la paire champ -> valeur ; A2 exige la forme EXACTE, par
 *     operation (un exemple de `write` ne couvre pas `read`).
 * (3) Un candidat de A3 qui connaitrait le vocabulaire : le generateur n'a
 *     aucune valeur de repli ; le temoin negatif montre qu'un prompt au
 *     vocabulaire different fait echouer le meme generateur.
 * (4) Un diagnostic present au rapport mais jamais persiste, ou sans attendu
 *     ni reponse recue (perturbation de T69.A4) : A4 lit les deux.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Les valeurs comparees par le notateur des regles P1-P4 (aucun export ne
 *    le decrit) ne sont connues de A1/A2 qu'au travers des sondes de II.1.b ;
 *    A3 les couvre de bout en bout (le notateur reel juge le candidat derive).
 *  • Que l'etape diagnostiquee soit bien la PREMIERE non satisfaite de sa
 *    sequence : les sequences d'une periode ne sont pas exposees par le
 *    rapport ; A4 exige un attendu et une reponse recue distincts.
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde
 *    `verifierFauxEnTetePath`, reprise a l'identique de T47/.../T66.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROC_TIMEOUT_MS = 7_200_000;
const CASE_TIMEOUT_MS = 15_000_000;
const BUILD_TIMEOUT_MS = 300_000;
const LOAD_TIMEOUT_MS = 120_000;

const CONTRAT_V4 = 'bench.candidate/4';
const GRAINE = 6969;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

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

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ════════════════════════════════════ PostgreSQL REEL (ADR-020 L86) */

const RUN = `t69_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `t69-${prefixe}-`));
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

/** Toutes les lignes des tables du schema `public`, en JSON (A4, II.5). */
function lignesDeLaBase(db: string): { lignes: unknown[]; erreurs: string[] } {
  const erreurs: string[] = [];
  const tables = psql(db, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  if (!tables.ok) return { lignes: [], erreurs: [`liste des tables : ${court(tables.out, 300)}`] };
  const lignes: unknown[] = [];
  for (const t of tables.out.split('\n').map((x) => x.trim()).filter((x) => x !== '')) {
    const r = psql(db, `SELECT row_to_json(t)::text FROM public."${t.replace(/"/g, '""')}" t`);
    if (!r.ok) {
      erreurs.push(`${t} : ${court(r.out, 200)}`);
      continue;
    }
    for (const l of r.out.split('\n')) {
      if (l.trim() === '') continue;
      try {
        lignes.push(JSON.parse(l) as unknown);
      } catch {
        /* ligne illisible : ignoree */
      }
    }
  }
  return { lignes, erreurs };
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
      return estObjet(v) ? v : null;
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

/* ════════════════════════ faux executable claude (reprise T47/.../T66) */

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
  // Les candidats portent eux-memes leur privation et leur journal : rien ne
  // doit fuiter de l'environnement de la suite vers eux.
  delete env.BENCH_DROP_RULE;
  delete env.BENCH_TRAFFIC_LOG;
  verifierFauxEnTetePath(env);
  return env;
}

type Enregistrement = { n: number; argv: string[]; cwd: string };
/** Un enregistrement par session (T55), dans l'ordre NUMERIQUE des sessions. */
function lireEnregistrements(dir: string): Enregistrement[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => /^record-(\d+)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, m[0]), 'utf8')) as { argv: string[]; cwd: string };
        return { n: Number(m[1]), argv: r.argv, cwd: r.cwd };
      } catch {
        return null;
      }
    })
    .filter((x): x is Enregistrement => x !== null && Array.isArray(x.argv))
    .sort((a, b) => a.n - b.n);
}

/** Le prompt EXACT recu par la session : l'argument qui suit `-p`. */
function promptDe(e: Enregistrement): string {
  const i = e.argv.indexOf('-p');
  return i >= 0 && i + 1 < e.argv.length ? e.argv[i + 1] : '';
}

interface Trafic {
  total: number;
  repertoires: Set<string>;
}

function lireTrafic(journal: string): Trafic {
  const out: Trafic = { total: 0, repertoires: new Set() };
  if (!fs.existsSync(journal)) return out;
  for (const ligne of fs.readFileSync(journal, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue;
    try {
      const e = JSON.parse(ligne) as { data_dir?: unknown };
      out.total += 1;
      if (typeof e.data_dir === 'string') out.repertoires.add(e.data_dir);
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

/** Regles couvertes par le generateur v4 : celles qui n'existent pas en P1-P4 (T68 II.7). */
const REGLES_P5: Set<string> = ((): Set<string> => {
  const avant = new Set<string>();
  for (const p of ['P1', 'P2', 'P3', 'P4'] as const) for (const r of REGLES_ADR[p]) avant.add(r);
  const out = new Set<string>();
  for (const p of PERIODES) for (const r of REGLES_ADR[p]) if (!avant.has(r)) out.add(r);
  return out;
})();

const OPS_V4 = new Set([
  'create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint',
  'set_capacity', 'set_level', 'balance', 'history', 'transfer', 'create_slot',
]);

/* ═══════════════ racine gelee : horloges des periodes (II.1) ═══════════ */

const REFERENCE_LONG = path.join(REPO, 'acceptance', 'reference-long', 'F-LONG.json');
function horlogeDe(p: Periode): string | null {
  try {
    const j = JSON.parse(fs.readFileSync(REFERENCE_LONG, 'utf8')) as {
      valeurs?: { horloges_des_periodes?: Record<string, { valeur?: unknown }> };
    };
    const v = j.valeurs?.horloges_des_periodes?.[p]?.valeur;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/* ═══════════════ chargement de packages/scenario + activities (T68) ════ */

function flatten(ns: Ns, into: Map<string, unknown>): void {
  const put = (k: string, v: unknown): void => {
    if (!into.has(k)) into.set(k, v);
  };
  for (const [k, v] of Object.entries(ns)) {
    if (k === '__esModule') continue;
    put(k, v);
  }
  const def: unknown = ns.default;
  if (def !== null && def !== undefined && typeof def === 'object') {
    for (const [k, v] of Object.entries(def as Ns)) put(k, v);
  }
}

function specifiersForPackage(pkgDirName: string): string[] {
  const dir = path.join(REPO, 'packages', pkgDirName);
  const out: string[] = [];
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: unknown };
      if (typeof j.name === 'string' && j.name.length > 0) out.push(j.name);
    } catch {
      /* manifeste illisible : on retombe sur le chemin de fichier */
    }
  }
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

interface Charge {
  flat: Map<string, unknown>;
  attempts: string[];
  contrat: Ns | null;
  derive: Ns | null;
}
let CHARGE: Charge = { flat: new Map(), attempts: ['beforeAll non execute'], contrat: null, derive: null };

const MODULE_CONTRAT = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't69-contrat-compare.mjs');
const MODULE_DERIVATION = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't69-derive-reference-candidate.mjs');

beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  for (const pkg of ['scenario', 'activities']) {
    let fait = false;
    for (const s of specifiersForPackage(pkg)) {
      try {
        flatten((await import(s)) as Ns, flat);
        fait = true;
        break;
      } catch (e) {
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    if (!fait) attempts.push(`paquet packages/${pkg} : aucun specificateur n'a repondu`);
  }
  let contrat: Ns | null = null;
  let derive: Ns | null = null;
  try {
    contrat = (await import(pathToFileURL(MODULE_CONTRAT).href)) as Ns;
  } catch (e) {
    attempts.push(`import(${MODULE_CONTRAT}) -> ${String((e as Error).message)}`);
  }
  try {
    derive = (await import(pathToFileURL(MODULE_DERIVATION).href)) as Ns;
  } catch (e) {
    attempts.push(`import(${MODULE_DERIVATION}) -> ${String((e as Error).message)}`);
  }
  CHARGE = { flat, attempts, contrat, derive };
}, LOAD_TIMEOUT_MS);

type Fn = (...a: unknown[]) => unknown;
function fonctionFixture(mod: Ns | null, nom: string): Fn {
  const f = mod?.[nom];
  exige(
    typeof f === 'function',
    `fixture-${nom}-chargee`,
    `FONCTION-FIXTURE-ABSENTE ${nom} : ${CHARGE.attempts.join(' | ')}`,
  );
  return f as Fn;
}
const C = (nom: string): Fn => fonctionFixture(CHARGE.contrat, nom);
const D = (nom: string): Fn => fonctionFixture(CHARGE.derive, nom);

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; erreur: string }> {
  try {
    return { ok: true, value: await thunk() };
  } catch (e) {
    return { ok: false, erreur: String((e as Error)?.message ?? e) };
  }
}

/* ═══════ II.1 — ce que le notateur compare, depuis le modele exporte ═══ */

const ROLES_GENERATEUR_V4 = [
  'generateDiscriminatingSequences',
  'generateSequencesForRule',
  'generateHiddenSequencesV4',
  'generateRuleSequencesV4',
  'buildDiscriminatingSequences',
  'buildDiscriminatingSequencesForRule',
] as const;

const ROLES_MODELE_ATTENDU = ['ExpectedModelV4', 'FLongExpectedModelV4', 'ExpectedModelFLong', 'ExpectedModel'] as const;
const METHODES_MODELE = ['apply', 'applyStep', 'step', 'applyOrThrow'] as const;

interface Attente {
  op: string;
  args: unknown;
  expect: Json;
  source: string;
  generee: boolean;
}

function extraireLot(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (estObjet(v)) {
    for (const k of ['sequences', 'batch', 'lot', 'items']) {
      const x = v[k];
      if (Array.isArray(x)) return x;
    }
  }
  return null;
}

async function lotV4(rule: string, period: Periode): Promise<{ lot: unknown[]; nom: string } | null> {
  const o = { rule, ruleId: rule, period, periodId: period, seed: GRAINE, contract: CONTRAT_V4, protocol: CONTRAT_V4 };
  for (const nom of ROLES_GENERATEUR_V4) {
    const fn = CHARGE.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const args of [[o], [rule, period, GRAINE]] as unknown[][]) {
      const res = await essayer(() => (fn as Fn)(...args));
      if (!res.ok) continue;
      const lot = extraireLot(res.value);
      if (lot !== null && lot.length > 0) return { lot, nom };
    }
  }
  return null;
}

function etapesDe(seq: unknown): { op: string; args: unknown; expect: Json }[] {
  if (!estObjet(seq)) return [];
  const etapes = Array.isArray(seq.steps) ? seq.steps : [];
  const attentes = Array.isArray(seq.expect) ? seq.expect : Array.isArray(seq.expected) ? seq.expected : [];
  const out: { op: string; args: unknown; expect: Json }[] = [];
  etapes.forEach((e: unknown, i: number) => {
    if (!estObjet(e) || typeof e.op !== 'string') return;
    const x = attentes[i] ?? e.expect ?? e.expected;
    if (estObjet(x) && typeof x.kind === 'string') out.push({ op: e.op, args: e.args, expect: x });
  });
  return out;
}

function modeleAttendu(period: Periode): { appliquer: (etape: unknown) => unknown; nom: string } | null {
  for (const nom of ROLES_MODELE_ATTENDU) {
    const K = CHARGE.flat.get(nom);
    if (typeof K !== 'function') continue;
    let m: Json;
    try {
      m = new (K as new (...a: unknown[]) => Json)(period);
    } catch {
      continue;
    }
    for (const meth of METHODES_MODELE) {
      const f = m[meth];
      if (typeof f === 'function') return { appliquer: (e) => (f as Fn).call(m, e), nom: `${nom}#${meth}` };
    }
  }
  return null;
}

interface AttentesPeriode {
  attentes: Attente[];
  problemes: string[];
}

const CACHE_ATTENTES = new Map<Periode, Promise<AttentesPeriode>>();

/** II.1 — les attentes que le notateur compare a la periode `p`. */
function attentesDePeriode(p: Periode): Promise<AttentesPeriode> {
  let r = CACHE_ATTENTES.get(p);
  if (r === undefined) {
    r = (async (): Promise<AttentesPeriode> => {
      const attentes: Attente[] = [];
      const problemes: string[] = [];
      for (const rule of REGLES_ADR[p]) {
        if (!REGLES_P5.has(rule)) continue;
        const lot = await lotV4(rule, p);
        if (lot === null) {
          problemes.push(`GENERATEUR-V4-INTROUVABLE-OU-LOT-VIDE (${rule}, ${p}) parmi ${rendu([...ROLES_GENERATEUR_V4])}`);
          continue;
        }
        let n = 0;
        for (const seq of lot.lot) {
          for (const e of etapesDe(seq)) {
            attentes.push({ ...e, source: `${lot.nom}(${rule})`, generee: true });
            n += 1;
          }
        }
        if (n === 0) problemes.push(`LOT-SANS-ATTENTE-LISIBLE (${rule}, ${p}) : etapes {op,args} et attentes {kind,...} attendues`);
      }
      const horloge = horlogeDe(p);
      const modele = modeleAttendu(p);
      if (horloge === null) problemes.push(`HORLOGE-DE-${p}-ABSENTE de ${REFERENCE_LONG}`);
      if (modele === null) problemes.push(`MODELE-ATTENDU-V4-INTROUVABLE parmi ${rendu([...ROLES_MODELE_ATTENDU])} (new X(periode), methode ${rendu([...METHODES_MODELE])})`);
      if (horloge !== null && modele !== null) {
        const etapes = C('sondes')(horloge, REGLES_ADR[p].includes('isolation@1')) as { op: string; args: unknown }[];
        for (const e of etapes) {
          const res = await essayer(() => modele.appliquer(e));
          if (!res.ok || !estObjet(res.value) || typeof res.value.kind !== 'string') {
            problemes.push(`SONDE-REJETEE-PAR-LE-MODELE (${p}) ${e.op} ${rendu(e.args)} -> ${res.ok ? rendu(res.value) : res.erreur}`);
            continue;
          }
          attentes.push({ op: e.op, args: e.args, expect: res.value, source: `${modele.nom}(sonde)`, generee: false });
        }
      }
      return { attentes, problemes };
    })();
    CACHE_ATTENTES.set(p, r);
  }
  return r;
}

/* ═══════════════════ pilot-conduct (T46/T52/T55/T66, REPRIS) ═══════════ */

const MANIFEST = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t69-claude-cli-f-long-one-repetition.json');
const CONFIGURATION = 'cfg-t69-alpha';
const PERIODES_PAR_TRAJECTOIRE = 12;

const FIXTURE_CANDIDAT_V4 = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-long-reference-candidate-v4.mjs');
const ENTREE_CANDIDATE = 'candidate.mjs'; // FIXE par acceptance/T52.spec.ts (II.4)
const PRIVATION_A4 = 'cancel@2,capacity@1,quota@1';
const RENOMMAGE_NEGATIF = 'waitlisted'; // le mot de Sonnet medium (pilote reel, champ `validite`)

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  return {
    campaignId: `t69-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: repertoireJetable(`ws-${suffixe}`),
  };
}

function conduire(ctx: Contexte, env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    'pilot-conduct',
    [
      MANIFEST,
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
  enregistrements: Enregistrement[];
  erreursDerivation: string;
  db: string;
}

/** II.4 — candidat DERIVE du prompt recu ; `renommer` : temoin negatif. */
function executerDerive(suffixe: string, renommer: { de: string; vers: string } | null): Execution {
  for (const f of [MANIFEST, MODULE_DERIVATION, FIXTURE_CANDIDAT_V4]) {
    exige(fs.existsSync(f), `fixture-presente-${path.basename(f)}`, `FIXTURE-ABSENTE : ${f}`);
  }
  const ctx = nouveauContexte(suffixe);
  const dir = repertoireJetable(`derive-${suffixe}`);
  const journal = path.join(dir, 'traffic.ndjson');
  const emballage = path.join(dir, `derive-${randomBytes(6).toString('hex')}.mjs`);
  fs.writeFileSync(
    emballage,
    [
      `import { deriver as deriverDuPrompt } from ${JSON.stringify(pathToFileURL(MODULE_DERIVATION).href)};`,
      `const DE = ${JSON.stringify(renommer?.de ?? null)};`,
      `const VERS = ${JSON.stringify(renommer?.vers ?? null)};`,
      `const JOURNAL = ${JSON.stringify(journal)};`,
      "const echapper = (t) => t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');",
      'export function deriver(entree) {',
      "  let prompt = typeof entree.prompt === 'string' ? entree.prompt : '';",
      "  if (DE !== null) prompt = prompt.replace(new RegExp('(?<![A-Za-z0-9_])' + echapper(DE) + '(?![A-Za-z0-9_])', 'g'), VERS);",
      '  return deriverDuPrompt({ ...entree, prompt, journal: JOURNAL });',
      '}',
      '',
    ].join('\n'),
  );
  const deriveLog = path.join(dir, 'derive-log');
  const env = envFauxClaude({
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: emballage,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: deriveLog,
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: path.join(dir, 'records'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: path.join(dir, 'record-counter.txt'),
  });
  const appel = conduire(ctx, env);
  let erreursDerivation = '';
  try {
    erreursDerivation = fs.readFileSync(path.join(deriveLog, 'errors.log'), 'utf8');
  } catch {
    /* aucune erreur de derivation */
  }
  return {
    appel,
    trafic: lireTrafic(journal),
    enregistrements: lireEnregistrements(path.join(dir, 'records')),
    erreursDerivation,
    db: ctx.db,
  };
}

/** II.5 — candidat v4 PRIVE, ecrit par le plan du faux `claude` (T66 II.2). */
function executerPrive(suffixe: string, dropRule: string): Execution {
  for (const f of [MANIFEST, FIXTURE_CANDIDAT_V4]) {
    exige(fs.existsSync(f), `fixture-presente-${path.basename(f)}`, `FIXTURE-ABSENTE : ${f}`);
  }
  const ctx = nouveauContexte(suffixe);
  const dir = repertoireJetable(`plan-${suffixe}`);
  const journal = path.join(dir, 'traffic.ndjson');
  const brut = fs.readFileSync(FIXTURE_CANDIDAT_V4, 'utf8');
  const source = brut.startsWith('#!') ? brut.slice(brut.indexOf('\n') + 1) : brut;
  const plan = Array.from({ length: PERIODES_PAR_TRAJECTOIRE }, (_, i) => ({
    relPath: ENTREE_CANDIDATE,
    content: [
      `// candidate.mjs — ecrit par le faux \`claude\` (acceptance/T69.spec.ts, A4), session ${i + 1}.`,
      `process.env.BENCH_DROP_RULE = ${JSON.stringify(dropRule)};`,
      `process.env.BENCH_TRAFFIC_LOG = ${JSON.stringify(journal)};`,
      source,
    ].join('\n'),
  }));
  const planFile = path.join(dir, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const env = envFauxClaude({
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_FILE: planFile,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_COUNTER_FILE: path.join(dir, 'write-counter.txt'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: path.join(dir, 'records'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: path.join(dir, 'record-counter.txt'),
  });
  const appel = conduire(ctx, env);
  return { appel, trafic: lireTrafic(journal), enregistrements: lireEnregistrements(path.join(dir, 'records')), erreursDerivation: '', db: ctx.db };
}

// La campagne derivee positive sert a A1, A2 et A3 : executee une fois, a la
// demande de l'un ou de l'autre (chaque cas reste executable seul).
let CAMPAGNE_DERIVEE: Execution | null = null;
function campagneDerivee(): Execution {
  if (CAMPAGNE_DERIVEE === null) CAMPAGNE_DERIVEE = executerDerive('derive', null);
  return CAMPAGNE_DERIVEE;
}

/* ═══════════════════ lecture tolerante du rapport (T66 II.3) ═══════════ */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');
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

function identiteRegle(v: unknown): string | null {
  if (typeof v === 'string' && /@\d+$/.test(v.trim())) return v.trim();
  if (!estObjet(v)) return null;
  const r = champ(v, ALIAS_REGLE);
  if (r.present && typeof r.valeur === 'string' && /@\d+$/.test(r.valeur)) return r.valeur;
  const id = champ(v, ['id', ...ALIAS_REGLE]);
  const version = champ(v, ['version']);
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
      if (!estObjet(e)) continue;
      const r = identiteRegle(e);
      const s = champ(e, ['score', 'fraction', 'ratio']);
      if (r !== null && s.present && typeof s.valeur === 'number') out.set(r, s.valeur);
    }
    return out.size > 0 ? out : null;
  }
  if (!estObjet(v)) return null;
  for (const [k, x] of Object.entries(v)) {
    if (!/@\d+$/.test(k)) continue;
    if (typeof x === 'number') out.set(k, x);
    else if (estObjet(x)) {
      const s = champ(x, ['score', 'fraction', 'ratio']);
      if (s.present && typeof s.valeur === 'number') out.set(k, s.valeur);
    }
  }
  return out.size > 0 ? out : null;
}

interface EnregistrementPeriode {
  repetition: string | null;
  periode: Periode;
  configuration: string | null;
  scores: Map<string, number>;
  noeud: Json;
  chemin: string;
}

function enregistrementsDePeriode(rapport: unknown): EnregistrementPeriode[] {
  const out: EnregistrementPeriode[] = [];
  const visiter = (v: unknown, chemin: string, rep: string | null, cfg: string | null, profondeur: number): void => {
    if (profondeur > 14) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => visiter(x, `${chemin}[${i}]`, rep, cfg, profondeur + 1));
      return;
    }
    if (!estObjet(v)) return;
    const r = champ(v, ALIAS_REPETITION);
    const repIci = r.present && (typeof r.valeur === 'number' || typeof r.valeur === 'string') ? String(r.valeur) : rep;
    const c = champ(v, ALIAS_CONFIGURATION);
    const cfgIci = c.present && typeof c.valeur === 'string' ? c.valeur : cfg;
    const p = champ(v, ALIAS_PERIODE);
    const s = champ(v, ALIAS_SCORES);
    if (p.present && s.present) {
      const periode = normPeriode(p.valeur);
      const scores = scoresParRegle(s.valeur);
      if (periode !== null && scores !== null) {
        out.push({ repetition: repIci, periode, configuration: cfgIci, scores, noeud: v, chemin });
      }
    }
    for (const [k, x] of Object.entries(v)) visiter(x, `${chemin}.${k}`, repIci, cfgIci, profondeur + 1);
  };
  visiter(rapport, '$', null, null, 0);
  return out;
}

function exigeExecution(ex: Execution, etiquette: string): EnregistrementPeriode[] {
  exige(
    ex.appel.resultat !== null && ex.appel.exit === 0,
    `pilot-conduct-f-long-execute-${etiquette}`,
    messageEchec(`pilot-conduct(${etiquette})`, ex.appel),
  );
  const rapport = ex.appel.resultat as Json;
  const persistees = champ(rapport, ['periods_persisted']).valeur;
  exige(
    persistees === PERIODES_PAR_TRAJECTOIRE,
    `periodes-persistees-12-${etiquette}`,
    `PERIODES-PERSISTEES-INATTENDUES (${etiquette}) : periods_persisted=${rendu(persistees)}, attendu ${PERIODES_PAR_TRAJECTOIRE} ; rapport ${rendu(rapport)}`,
  );
  exige(
    ex.enregistrements.length >= PERIODES_PAR_TRAJECTOIRE,
    `une-session-claude-par-periode-${etiquette}`,
    `SESSIONS-CLAUDE-INSUFFISANTES (${etiquette}) : ${ex.enregistrements.length} session(s) enregistree(s) pour ${PERIODES_PAR_TRAJECTOIRE} periodes`,
  );
  exige(
    ex.trafic.total > 0 && ex.trafic.repertoires.size >= 2,
    `candidat-reellement-execute-${etiquette}`,
    `AUCUNE-EXECUTION-REELLE-DU-CANDIDAT (${etiquette}) : ${ex.trafic.total} requete(s) journalisee(s) sur ${ex.trafic.repertoires.size} repertoire(s) de donnees${ex.erreursDerivation !== '' ? ` ; erreurs de derivation : ${court(ex.erreursDerivation, 1500)}` : ''}`,
  );
  const recs = enregistrementsDePeriode(rapport).filter((r) => r.configuration === null || r.configuration === CONFIGURATION);
  const manquantes = PERIODES.filter((p) => !recs.some((r) => r.periode === p));
  exige(
    manquantes.length === 0,
    `douze-periodes-dans-le-rapport-${etiquette}`,
    `PERIODES-ABSENTES-DU-RAPPORT (${etiquette}) : ${rendu(manquantes)} ; ${recs.length} enregistrement(s) {period, rule_scores} trouves dans ${rendu(rapport)}`,
  );
  return recs;
}

/** Les douze prompts de la campagne derivee, P1 a P12 dans l'ordre des sessions. */
function promptsDesPeriodes(etiquette: string): Map<Periode, string> {
  const ex = campagneDerivee();
  exige(
    ex.enregistrements.length >= PERIODES_PAR_TRAJECTOIRE,
    `douze-prompts-enregistres-${etiquette}`,
    `PROMPTS-NON-ENREGISTRES (${etiquette}) : ${ex.enregistrements.length} session(s) du faux \`claude\` enregistree(s) (attendu ${PERIODES_PAR_TRAJECTOIRE}) — ${messageEchec('pilot-conduct', ex.appel)}`,
  );
  const out = new Map<Periode, string>();
  PERIODES.forEach((p, i) => out.set(p, promptDe(ex.enregistrements[i])));
  const vides = PERIODES.filter((p) => (out.get(p) ?? '') === '');
  exige(vides.length === 0, `prompts-non-vides-${etiquette}`, `PROMPT-VIDE (argument de -p absent) aux periodes ${rendu(vides)}`);
  return out;
}

async function exigeAttentes(p: Periode, etiquette: string): Promise<Attente[]> {
  const { attentes, problemes } = await attentesDePeriode(p);
  exige(
    problemes.length === 0,
    `modele-attendu-lisible-${etiquette}-${p}`,
    `MODELE-ATTENDU-ILLISIBLE a ${p} (II.1) : ${problemes.join(' | ')} ; exports vus : ${rendu([...CHARGE.flat.keys()])} ; ${CHARGE.attempts.join(' | ')}`,
  );
  exige(attentes.length > 0, `attentes-non-vides-${etiquette}-${p}`, `AUCUNE-ATTENTE a ${p} (II.1)`);
  return attentes;
}

/* ═══════════════════ A4 — diagnostics (II.5) ════════════════════════════ */

const ALIAS_OPERATION = ['operation', 'op', 'request', 'step', 'requete', 'operation_name', 'step_op'];
const ALIAS_ATTENDU = ['expected', 'expect', 'attendu', 'expectation', 'expected_response', 'want'];
const ALIAS_RECU = ['received', 'actual', 'got', 'observed', 'response', 'recu', 'received_response', 'actual_response'];

interface Diagnostic {
  operation: unknown;
  attendu: unknown;
  recu: unknown;
  chemin: string;
}

function operationValide(v: unknown): boolean {
  if (typeof v === 'string') return OPS_V4.has(v);
  return estObjet(v) && typeof v.op === 'string' && OPS_V4.has(v.op);
}

function lireDiagnostic(o: Json, chemin: string): Diagnostic | null {
  const op = champ(o, ALIAS_OPERATION);
  const at = champ(o, ALIAS_ATTENDU);
  const re = champ(o, ALIAS_RECU);
  if (!op.present || !at.present || !re.present) return null;
  return { operation: op.valeur, attendu: at.valeur, recu: re.valeur, chemin };
}

/** Diagnostics rattaches a `regle` sous un enregistrement de periode. */
function diagnosticsPourRegle(noeud: Json, regle: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const visiter = (v: unknown, chemin: string, dansRegle: boolean, profondeur: number): void => {
    if (profondeur > 12) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => visiter(x, `${chemin}[${i}]`, dansRegle, profondeur + 1));
      return;
    }
    if (!estObjet(v)) return;
    const nomme = champ(v, ALIAS_REGLE);
    const ici = dansRegle || (nomme.present && nomme.valeur === regle);
    if (ici) {
      const d = lireDiagnostic(v, chemin);
      if (d !== null) out.push(d);
    }
    for (const [k, x] of Object.entries(v)) visiter(x, `${chemin}.${k}`, ici || k === regle, profondeur + 1);
  };
  visiter(noeud, '$', false, 0);
  return out;
}

function canonique(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonique);
  if (estObjet(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonique(v[k])]));
  return v;
}
const cle = (v: unknown): string => JSON.stringify(canonique(v)) ?? 'undefined';

/** Index de tous les diagnostics (triples) presents dans les lignes de la base. */
function triplesPersistes(lignes: unknown[]): Set<string> {
  const out = new Set<string>();
  const visiter = (v: unknown, profondeur: number): void => {
    if (profondeur > 24) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try {
          visiter(JSON.parse(t) as unknown, profondeur + 1);
        } catch {
          /* texte ordinaire */
        }
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) visiter(x, profondeur + 1);
      return;
    }
    if (!estObjet(v)) return;
    const d = lireDiagnostic(v, '');
    if (d !== null) out.add(cle([d.operation, d.attendu, d.recu]));
    for (const x of Object.values(v)) visiter(x, profondeur + 1);
  };
  for (const l of lignes) visiter(l, 0);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T69 — le vocabulaire et les formes que le notateur compare, dans le prompt F-LONG', () => {
  test(
    'T69.A1 — chaque decision, statut et code d\'erreur compare pour une regle active figure litteralement dans le prompt de la periode, avec le nom du champ qui le porte',
    async () => {
      const prompts = promptsDesPeriodes('a1');
      const pairesChampValeur = D('pairesChampValeur');
      const valeursComparees = C('valeursComparees');
      const manquantes: string[] = [];
      let total = 0;
      for (const p of PERIODES) {
        const attentes = await exigeAttentes(p, 'a1');
        const vues = new Map<string, { champ: string; valeur: string; source: string }>();
        for (const a of attentes) {
          for (const v of valeursComparees(a.expect) as { champ: string; valeur: string }[]) {
            const k = `${v.champ}=${v.valeur}`;
            if (!vues.has(k)) vues.set(k, { ...v, source: `${a.source} ${a.op}` });
          }
        }
        exige(vues.size > 0, `valeurs-comparees-non-vides-${p}`, `AUCUNE-VALEUR-COMPAREE a ${p} : attentes ${rendu(attentes.slice(0, 5))}`);
        const paires = pairesChampValeur(prompts.get(p) ?? '') as { valeur: string; champs: string[] }[];
        for (const v of vues.values()) {
          total += 1;
          if (!paires.some((x) => x.valeur === v.valeur && x.champs.includes(v.champ))) {
            manquantes.push(`${p}: ${v.champ} = ${JSON.stringify(v.valeur)} (comparee par ${v.source})`);
          }
        }
      }
      exige(
        manquantes.length === 0,
        'chaque-valeur-comparee-figure-dans-le-prompt-avec-son-champ',
        `VALEURS-COMPAREES-ABSENTES-DU-PROMPT (${manquantes.length}/${total}, II.2 : valeur entre guillemets ou accents graves, precedee sur la meme ligne du nom de son champ) : ${manquantes.join(' ; ')}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T69.A2 — chaque forme de reponse comparee, succes et erreur, a un exemple public de cette forme exacte, et aucun exemple ne reproduit une valeur attendue par une sequence',
    async () => {
      const prompts = promptsDesPeriodes('a2');
      const pairesExemples = D('pairesExemples');
      const formeAttendue = C('formeAttendue');
      const formeConvient = C('formeConvient');
      const formeLisible = C('formeLisible');
      const cleCanonique = C('cleCanonique');
      const satisfait = C('satisfait');
      const sansExemple: string[] = [];
      const reproductions: string[] = [];
      for (const p of PERIODES) {
        const attentes = await exigeAttentes(p, 'a2');
        const exemples = pairesExemples(prompts.get(p) ?? '') as { op: string; requete: Json; reponse: Json }[];
        const formes = new Map<string, { op: string; forme: unknown; source: string }>();
        for (const a of attentes) {
          const f = formeAttendue(a.expect);
          exige(f !== null, `forme-attendue-lisible-${p}`, `ATTENTE-SANS-FORME a ${p} : ${rendu(a.expect)} (${a.source})`);
          const k = `${a.op} ${String(cleCanonique(f))}`;
          if (!formes.has(k)) formes.set(k, { op: a.op, forme: f, source: a.source });
        }
        for (const { op, forme, source } of formes.values()) {
          if (!exemples.some((e) => e.op === op && formeConvient(e.reponse, forme) === true)) {
            sansExemple.push(`${p}: ${op} -> ${String(formeLisible(forme))} (comparee par ${source})`);
          }
        }
        for (const e of exemples) {
          for (const a of attentes) {
            if (!a.generee || a.op !== e.op) continue;
            if (cleCanonique(a.args) !== cleCanonique(e.requete.args)) continue;
            if (satisfait(a.expect, e.reponse) === true) {
              reproductions.push(`${p}: exemple ${rendu(e.requete)} -> ${rendu(e.reponse)} reproduit l'attente ${rendu(a.expect)} (${a.source})`);
            }
          }
        }
      }
      exige(
        sansExemple.length === 0,
        'chaque-forme-comparee-a-un-exemple-public-exact',
        `FORMES-COMPAREES-SANS-EXEMPLE-PUBLIC (${sansExemple.length}, II.3 : paire requete -> reponse JSON liee par id, meme operation, forme exacte) : ${sansExemple.join(' ; ')}`,
      );
      exige(
        reproductions.length === 0,
        'aucun-exemple-ne-reproduit-une-valeur-attendue-par-une-sequence',
        `EXEMPLES-QUI-REPRODUISENT-UNE-SEQUENCE : ${reproductions.join(' ; ')}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T69.A3 — pilot-conduct --provider claude-cli --live, faux claude : le candidat derive du seul prompt recu obtient 1 sur chaque regle active a chaque periode (et le meme generateur, sur un prompt renomme, est note sous 1)',
    async () => {
      const ex = campagneDerivee();
      const recs = exigeExecution(ex, 'a3');
      const defauts: string[] = [];
      for (const p of PERIODES) {
        for (const r of recs.filter((x) => x.periode === p)) {
          for (const regle of REGLES_ADR[p]) {
            const s = r.scores.get(regle);
            if (s !== 1) defauts.push(`${p} ${regle}=${rendu(s)}`);
          }
        }
      }
      exige(
        defauts.length === 0,
        'candidat-derive-du-prompt-seul-note-1-sur-chaque-regle-active-a-chaque-periode',
        `SCORES-DIFFERENTS-DE-1 pour le candidat derive du seul prompt recu (ADR-020 decision 3) : ${defauts.join(' ; ')}${ex.erreursDerivation !== '' ? ` ; erreurs de derivation : ${court(ex.erreursDerivation, 1500)}` : ''}`,
      );

      // Temoin negatif (II.4) : la decision d'attente, telle que le modele
      // attendu la rend pour la seconde reservation d'un creneau de capacite 1.
      const attentes = await exigeAttentes('P1', 'a3');
      const sondes = attentes.filter((a) => !a.generee);
      const indice = Number((CHARGE.contrat as Ns).SONDE_SECONDE_RESERVATION);
      const attente = sondes[indice]?.expect?.decision;
      exige(
        typeof attente === 'string' && attente !== RENOMMAGE_NEGATIF,
        'decision-d-attente-derivee-du-modele',
        `DECISION-D-ATTENTE-INTROUVABLE dans les sondes de P1 : ${rendu(sondes.map((a) => [a.op, a.expect]))}`,
      );
      const neg = executerDerive('negatif', { de: attente as string, vers: RENOMMAGE_NEGATIF });
      const recsNeg = exigeExecution(neg, 'a3-negatif');
      const sousUn: string[] = [];
      for (const p of PERIODES) {
        for (const r of recsNeg.filter((x) => x.periode === p)) {
          for (const regle of REGLES_ADR[p]) {
            const s = r.scores.get(regle);
            if (typeof s === 'number' && s < 1) sousUn.push(`${p} ${regle}=${s}`);
          }
        }
      }
      exige(
        sousUn.length > 0,
        'temoin-negatif-prompt-renomme-note-sous-1',
        `TEMOIN-NEGATIF-CREUX : sur un prompt ou ${JSON.stringify(attente)} est renomme ${JSON.stringify(RENOMMAGE_NEGATIF)}, le meme generateur obtient 1 partout — A3 ne prouverait pas que le vocabulaire vient du prompt.`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T69.A4 — chaque periode persistee porte, pour chaque regle notee sous 1, l\'operation, l\'attendu et la reponse recue de la premiere etape non satisfaite d\'au moins une sequence',
    () => {
      const ex = executerPrive('a4', PRIVATION_A4);
      const recs = exigeExecution(ex, 'a4');

      const privees = PRIVATION_A4.split(',');
      const jamaisSousUn = privees.filter((regle) => !recs.some((r) => (r.scores.get(regle) ?? 1) < 1));
      exige(
        jamaisSousUn.length === 0,
        'temoin-regles-privees-notees-sous-1',
        `TEMOIN-CASSE : ${rendu(jamaisSousUn)} jamais notee(s) sous 1 par le candidat prive de ${PRIVATION_A4} — A4 serait creux.`,
      );

      const sansDiagnostic: string[] = [];
      const retenus: { ou: string; d: Diagnostic }[] = [];
      for (const r of recs) {
        for (const [regle, s] of r.scores) {
          if (!(s < 1)) continue;
          const ds = diagnosticsPourRegle(r.noeud, regle);
          const valides = ds.filter(
            (d) =>
              operationValide(d.operation) &&
              d.attendu !== null && d.attendu !== undefined &&
              d.recu !== null && d.recu !== undefined &&
              cle(d.attendu) !== cle(d.recu),
          );
          if (valides.length === 0) {
            sansDiagnostic.push(
              `${r.periode} ${regle}=${s} (${r.chemin}) : ${ds.length === 0 ? 'aucun objet {operation, expected, received} rattache a la regle' : `diagnostics incomplets ${rendu(ds.slice(0, 2))}`}`,
            );
          } else {
            retenus.push({ ou: `${r.periode} ${regle}`, d: valides[0] });
          }
        }
      }
      exige(
        sansDiagnostic.length === 0,
        'chaque-regle-sous-1-porte-operation-attendu-et-reponse-recue',
        `DIAGNOSTIC-ABSENT (ADR-020 decision 4 ; II.5 : operation du contrat v4, attendu et reponse recue non nuls et distincts, sous l'enregistrement de periode, rattaches a la regle) : ${sansDiagnostic.join(' ; ')}`,
      );

      const { lignes, erreurs } = lignesDeLaBase(ex.db);
      exige(
        lignes.length > 0,
        'lignes-de-la-base-lisibles',
        `BASE-ILLISIBLE ${ex.db} : ${erreurs.join(' | ')}`,
      );
      const persistes = triplesPersistes(lignes);
      const nonPersistes = retenus
        .filter(({ d }) => !persistes.has(cle([d.operation, d.attendu, d.recu])))
        .map(({ ou, d }) => `${ou} ${rendu({ operation: d.operation, expected: d.attendu, received: d.recu })}`);
      exige(
        nonPersistes.length === 0,
        'diagnostics-persistes-avec-chaque-periode',
        `DIAGNOSTIC-NON-PERSISTE dans la base ${ex.db} (${lignes.length} ligne(s) lues, ${persistes.size} diagnostic(s) trouves) : ${nonPersistes.join(' ; ')}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
