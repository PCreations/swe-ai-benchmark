/**
 * acceptance/T59.spec.ts — suite d'acceptation de la tache T59.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T59.A1 behaviour — a candidat reel, la requete de la sonde d'isolation
 *                      lit, depuis le locataire `other`, la cle d'un acteur
 *                      qui detient une reservation dans `legacy` a cette
 *                      periode
 *   T59.A2 behaviour — un candidat de reference qui repond {value:null} a
 *                      une cle inconnue et une reponse d'erreur NOT_FOUND a
 *                      la lecture, depuis un autre locataire, de la cle d'un
 *                      acteur de legacy satisfait isolation@1 ; un candidat
 *                      qui divulgue la reservation de cet acteur la viole
 *   T59.A3 behaviour — lance par `bench pilot-conduct --provider claude-cli
 *                      --live`, un candidat de reference dont la structure
 *                      des reponses provient du SEUL prompt recu satisfait
 *                      chaque controle du a chaque periode, isolation@1
 *                      compris
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T59 EST UNE TACHE D'EXTENSION (ADR-016) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T59 — `packages/
 * activities`, `apps/cli` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff, jamais une
 * barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T59.md et de sa source, docs/adr/ADR-016-sonde-d-isolation-sur-
 * une-cle-legacy.md, lignes 42 a 48 (la plage que la carte de T59 epingle
 * dans verification/tasks.extensions.json#spec_source), AINSI QUE du corps
 * narratif du MEME document ACCEPTE (hors de cette plage — la meme liberte
 * que prennent deja acceptance/T48.spec.ts a acceptance/T58.spec.ts face a
 * leur propre ADR) :
 *
 *   « Ce que le troisieme pilote reel a montre » : sur Haiku 4.5 comme sur
 *   Sonnet 5.5, isolation@1 echoue en P4 — et ce n'est pas imputable aux
 *   candidats. « Dans le scenario scripte, l'usage `sonde-intertenant` est
 *   une lecture faite PAR l'acteur `Z` du locataire `other`. La traduction
 *   vers le contrat (argsForAction, candidate-control-period.ts) place
 *   l'acteur dans l'argument `key` : le candidat recoit read(tenant_id:
 *   "other", key: "Z"), la lecture d'une cle que personne n'a jamais creee.
 *   Selon l'enonce et l'exemple public, une cle inconnue repond {value:
 *   null} ; c'est ce que les deux candidats ont repondu. Le modele attendu,
 *   lui, repond NOT_FOUND a toute lecture dans `other`. Les deux candidats
 *   implementent pourtant l'isolation : lire, depuis un autre locataire, la
 *   cle d'un acteur de legacy renvoie chez eux NOT_FOUND. » « Le cahier
 *   (F-RESERVATION, L119) dit : "ses acteurs ne peuvent ni lire ni modifier
 *   les reservations legacy". La sonde doit donc demander, depuis `other`,
 *   la reservation d'un acteur de legacy. » « Decision » : « A candidat
 *   reel, la sonde d'isolation lit, depuis le locataire `other`, la cle d'un
 *   acteur qui detient une reservation dans `legacy`. Le scenario scripte
 *   (T11) n'est pas modifie : seule la traduction vers le contrat change. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions et contrats DEJA
 * FIXES par les suites ACCEPTEES dont elle depend (jamais des sources de
 * T59) :
 *   - acceptance/T50.spec.ts/T52.spec.ts : le contrat `bench.candidate/2`.
 *   - acceptance/T51.spec.ts (II.1, « candidate-control-period ») : la
 *     sous-commande qui avance la trajectoire d'UNE periode candidate en
 *     jouant le plan d'usages INTERNE du scenario scripte contre le
 *     PROCESSUS CANDIDAT donne (`--candidate-command`) — EXACTEMENT le point
 *     que ADR-016 nomme (`candidate-control-period.ts`) — ainsi que la forme
 *     de son rapport par periode (`candidate.deployed`, `period_index`,
 *     `controls[].{id,status,actual,expected}`) — REPRISE A L'IDENTIQUE,
 *     jamais re-derivee.
 *   - acceptance/T58.spec.ts (socle CLI+PostgreSQL+faux claude, II.5
 *     `envCandidatDerivePar`) : le mecanisme ADDITIF de derivation d'un
 *     candidat de reference DEPUIS LE SEUL PROMPT RECU par le faux `claude`
 *     (BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE) — REPRIS A L'IDENTIQUE.
 *   - acceptance/fixtures/candidates/reservation-candidate-v2.mjs (T51, zone
 *     ACCEPTANCE, jamais une source de T59) : le « modele attendu » — cette
 *     suite l'INVOQUE DIRECTEMENT (A2) pour observer ses reponses REELLES,
 *     jamais pour en relire le code comme une implementation.
 *   - acceptance/fixtures/candidates/reservation-candidate-v2-faulty-
 *     isolation.mjs (T51, zone ACCEPTANCE) : « une application de reference
 *     FAUTIVE », garde d'isolation retiree — cette suite l'INVOQUE
 *     DIRECTEMENT (A2) pour observer qu'elle divulgue REELLEMENT la
 *     reservation d'un acteur de legacy quand on la sonde avec sa VRAIE cle.
 *   - acceptance/reference/F-RESERVATION.json (zone REFERENCE, gelee) :
 *     `valeurs.locataire_initial` (= 'legacy'), `valeurs.acteurs` (= [A,B,C]),
 *     `valeurs.P4.faits[1]` (mention du locataire `other`),
 *     `valeurs.P4.verdict_intertenant` (= 'NOT_FOUND sans donnee metier
 *     divulguee') et, NOUVEAU ICI, `valeurs.P4.etat_persistant_a_l_entree`
 *     (= {A:'annule', B:'confirme', C:'en attente'}, cahier:L123 — « a
 *     l'entree de P4, celui-ci conserve A annule, B confirme et C en
 *     attente ») : HOLDER_LEGACY_AT_P4 ci-dessous DERIVE l'acteur confirme de
 *     CETTE racine geleee, jamais ne l'invente.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE AJOUTE OU FIXE ELLE-MEME (ADR-001 : aucune des valeurs
 * ci-dessous n'a ete obtenue en executant une implementation de T59 — aucune
 * n'existe au moment ou cette suite est ecrite. VERIFIE en executant cette
 * suite en l'etat actuel du depot, `node tools/bench verify:task T59` :
 * A1 et A3 rougissent, mesure reelle rapportee section IV ci-dessous — la
 * traduction actuelle place encore l'acteur LECTEUR (Z, docs/adr/ADR-
 * 016:L19-20) dans `key`, jamais un acteur detenteur dans `legacy`)
 *
 * 1. acceptance/fixtures/candidates/reservation-candidate-v2-log-read-
 *    requests.mjs (zone ACCEPTANCE, publiee par CETTE tache) : COPIE EXACTE
 *    du « modele attendu » (reservation-candidate-v2.mjs), a une seule
 *    addition SANS EFFET sur aucune reponse protocolaire : un canal
 *    d'observation ./read-requests.log, une ligne JSON {tenant_id,key} par
 *    requete `read` RECUE — necessaire parce que ./ops-received.log (T51,
 *    deja ACCEPTE) ne porte que le NOM de l'operation, jamais ses arguments,
 *    et que le « modele attendu » repond NOT_FOUND a TOUTE lecture
 *    intertenant quelle que soit la cle (garde-proprietaire-d'abord) : sa
 *    REPONSE ne distingue donc jamais `key:'Z'` de `key` d'un acteur reel.
 *    SEULE la REQUETE recue en temoigne (A1).
 * 2. acceptance/fixtures/claude-cli/t59-derive-reference-candidate.mjs (zone
 *    ACCEPTANCE, publiee par CETTE tache) : candidat de reference DERIVE DU
 *    SEUL PROMPT RECU pour A3 — voir son en-tete pour le detail complet.
 *    EN RESUME : t58-derive-reference-candidate.mjs decide du refus
 *    d'isolation de `read` INCONDITIONNELLEMENT PAR TENANT, AVANT tout
 *    examen de la cle — un refus qui reussit isolation@1 QUELLE QUE SOIT LA
 *    CLE RECUE, donc AUSSI BIEN sous l'ancien defaut (`key:'Z'`) que sous sa
 *    correction : le reutiliser TEL QUEL rendrait T59.A3 CREUX (il ne
 *    pourrait JAMAIS rougir sous le mutant nomme par verification/
 *    cases.extensions.lock.json#T59.A3). Ce module reproduit donc
 *    FIDELEMENT l'incident reel d'ADR-016 : dans son SEUL cas `read`, la cle
 *    est RESOLUE D'ABORD dans un etat GLOBAL jamais partitionne par
 *    locataire (exactement le modele qu'impose « cle inconnue ->
 *    {value:null} » suivi a la lettre) ; le refus d'isolation n'est decide
 *    QUE SI cette resolution a REUSSI. MESURE REELLE (section IV) : a HEAD,
 *    ce candidat ROUGIT sur isolation@1 a P4 — exactement parce que la
 *    traduction actuelle envoie encore `key:'Z'`, jamais resolue.
 * 3. HOLDER_LEGACY_AT_P4 (section III) : DERIVE, jamais invente, de
 *    acceptance/reference/F-RESERVATION.json:valeurs.P4.
 *    etat_persistant_a_l_entree (cahier:L123) — l'acteur dont le statut y
 *    vaut 'confirme'. MESURE REELLE (section IV) : vaut 'B'.
 * 4. LITERAL_READER_BUG = 'Z' (section III), repris MOT POUR MOT de
 *    docs/adr/ADR-016.md lignes 19-20 (« l'usage `sonde-intertenant` est une
 *    lecture faite par l'acteur `Z` du locataire `other` ») — jamais une
 *    invention de cette suite.
 * 5. La batterie d'observation DIRECTE de A2 (section V) : quatre requetes
 *    NDJSON construites par cette suite (create_tenant, write(reserve) de
 *    HOLDER_LEGACY_AT_P4 dans LOCATAIRE_INITIAL, read d'une cle JAMAIS
 *    ecrite depuis LOCATAIRE_INITIAL, read de HOLDER_LEGACY_AT_P4 depuis
 *    SECOND_TENANT) — invoquees DIRECTEMENT (NDJSON sur stdin/stdout,
 *    protocole DEJA FIXE par T48/T50/T52) contre le modele attendu PUIS
 *    contre la variante fautive, jamais pour en relire le code comme une
 *    implementation.
 *
 * Les perturbations exactes de A1-A3 sont celles de
 * verification/cases.extensions.lock.json#T59, realisees mot pour mot par
 * verification/mutants/T59.json.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne redemontre ni le contrat bench.candidate/2 (T50/T52), ni le
 *    protocole de transport (T48), ni la sous-commande `candidate-control-
 *    period` elle-meme (T51), ni les exemples publics/enonce d'erreur
 *    (T58) : elle REUTILISE ces resultats comme des oracles, jamais ne les
 *    re-prouve.
 *  • Elle ne pretend rien sur reserve@1/idempotence@1/cancel@1/fifo@1 au-dela
 *    de leur PRESERVATION (A3) : ADR-016 ne touche QUE la traduction de la
 *    sonde d'isolation (une LECTURE), jamais les autres actions scriptees.
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T47/T49/.../T58 (A3
 *    seule l'exerce ; A1/A2 passent par `candidate-control-period`, qui
 *    n'invoque aucune CLI claude).
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
 * commun — REPRIS, SANS LE REINVENTER, de acceptance/T51.spec.ts/T58.spec.ts
 * (socle CLI+PostgreSQL+faux claude). */

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
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t59_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
    execFileSync('pnpm', ['build'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: BUILD_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: 0, sortie: 'build ok' });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    tentatives.push({
      label: 'pnpm build',
      argv: ['pnpm', 'build'],
      exit: err.status ?? null,
      sortie: court(`${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}`, 400),
    });
  }
}

type AppelCli = {
  resultat: Json | null;
  exit: number | null;
  tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[];
};

function envDeBase(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

function lancer(sousCommande: string, drapeaux: string[], envSupp: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env = { ...envDeBase(), ...envSupp };
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
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
  return `${label} : ${
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ════════════════════════ fixture claude-cli (reprise T47/T49/.../T58) —
 * UTILISEE PAR A3 SEULEMENT (A1/A2 passent par `candidate-control-period`,
 * qui n'invoque aucune CLI claude). */

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

/** Mecanisme de DERIVATION (acceptance/T55.spec.ts, A3 ; .../T58.spec.ts) —
 *  REPRIS A L'IDENTIQUE, parametre par le CHEMIN du module de derivation
 *  propre a CETTE tache. */
function envCandidatDerivePar(modulePath: string, opts: { deriveLogDir: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: modulePath,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: opts.deriveLogDir,
  };
  verifierFauxEnTetePath(env);
  return env;
}

/* ════════════════════ extraction de champs — FORME PLATE (reprise T51) */

function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}
const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');
type Noeud = { chemin: string; cle: string; valeur: unknown };
function noeuds(racine: unknown, profMax = 10): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [{ chemin: '$', cle: '', v: racine, p: 0 }];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
    }
  }
  return out;
}
function tableauProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && Array.isArray(n.valeur)) return n;
  }
  return null;
}
function champProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== null && n.valeur !== undefined) return n;
  }
  return null;
}
const nombre = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : NaN;
const champNombre = (r: unknown, alias: readonly string[]): number | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
const champTexte = (r: unknown, alias: readonly string[]): string | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
};

const estObjetJson = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ════════════════ candidate-control-period (T51, REPRIS A L'IDENTIQUE) —
 * EXACTEMENT le point que ADR-016 nomme (`candidate-control-period.ts`) :
 * avance la trajectoire d'UNE periode candidate en jouant le plan d'usages
 * INTERNE du scenario scripte (T11, inchange par T59) contre le PROCESSUS
 * candidat donne. Utilise DIRECTEMENT par A1/A2, SANS AUCUN `claude`. */

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t59-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t59-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

const SOUS_COMMANDE_PERIODE = 'candidate-control-period'; // FIXE par acceptance/T51.spec.ts (II.1) — le point nomme par ADR-016.
function drapeauxPeriode(ctx: Contexte, command: string[], timeoutMs?: number): string[] {
  const out = [
    '--campaign-id', ctx.campaignId,
    '--postgres-database', ctx.db,
    '--s3-bucket', ctx.bucket,
    '--candidate-workspace-root', ctx.workspaceRoot,
    '--candidate-command', JSON.stringify(command),
  ];
  if (timeoutMs !== undefined) out.push('--candidate-timeout-ms', String(timeoutMs));
  return out;
}
function candidateControlPeriod(ctx: Contexte, command: string[], timeoutMs?: number): AppelCli {
  return lancer(SOUS_COMMANDE_PERIODE, drapeauxPeriode(ctx, command, timeoutMs));
}

function candidatDe(p: unknown): Json {
  return obj(obj(p).candidate);
}
const deployeDe = (p: unknown): unknown => candidatDe(p).deployed;
const indexDe = (p: unknown): unknown => obj(p).period_index;
type ControleMien = { id: string; status: string; actual: unknown; expected: unknown };
function controlesMienDe(p: unknown): ControleMien[] {
  const c = obj(p).controls;
  return Array.isArray(c) ? (c as ControleMien[]) : [];
}

/** Le SEUL sous-repertoire reel que `ctx.workspaceRoot` contient — chaque
 *  contexte de cette suite recoit une racine FRAICHE et n'heberge donc
 *  qu'une trajectoire (REPRIS A L'IDENTIQUE de acceptance/T51.spec.ts). */
function workspaceDirCourant(ctx: Contexte): string {
  const enfants = fs.readdirSync(ctx.workspaceRoot).filter((n) => fs.statSync(path.join(ctx.workspaceRoot, n)).isDirectory());
  exige(enfants.length === 1, 'un-seul-sous-repertoire-de-travail-derive', `vu ${rendu(enfants)} sous ${ctx.workspaceRoot}`);
  return path.join(ctx.workspaceRoot, enfants[0] as string);
}

/* ════════════════ pilot-conduct --live (T58, REPRIS A L'IDENTIQUE) — A3 SEUL */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21)
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008:L149
const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const SOUS_COMMANDE_CONTROL_REPORT = 'candidate-control-report'; // FIXE par acceptance/T51.spec.ts (II.1)

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
      '--live',
      '--candidate-workspace-root', ctx.workspaceRoot,
    ],
    env,
  );
}
function candidateControlReportDirect(trajectoryKey: string, db: string): AppelCli {
  return lancer(SOUS_COMMANDE_CONTROL_REPORT, ['--campaign-id', trajectoryKey, '--postgres-database', db]);
}

const ALIAS_PERIODS_PERSISTED = ['periods_persisted', 'periodspersisted'];
const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_CANDIDATE_CONTROL_REPORT = ['candidate_control_report', 'candidatecontrolreport'];
const periodsPersistedDe = (r: unknown): number | null => champNombre(r, ALIAS_PERIODS_PERSISTED);
function trajectoryKeyDe(r: unknown): string | null {
  const t = tableauProfond(r, ALIAS_TRAJECTOIRES);
  if (t === null || !Array.isArray(t.valeur) || t.valeur.length === 0) return null;
  return champTexte(t.valeur[0], ALIAS_TRAJECTORY_KEY);
}
function controlPeriodsDe(r: unknown, trajectoryKey: string): { period_index: number; satisfied: number; violated: number }[] {
  const liste = tableauProfond(r, ALIAS_CANDIDATE_CONTROL_REPORT);
  if (liste === null || !Array.isArray(liste.valeur)) return [];
  for (const entree of liste.valeur as unknown[]) {
    if (champTexte(entree, ALIAS_TRAJECTORY_KEY) === trajectoryKey) {
      const per = tableauProfond(entree, ['periods']);
      if (per !== null && Array.isArray(per.valeur)) {
        return (per.valeur as unknown[]).map((p) => ({
          period_index: champNombre(p, ['period_index']) ?? -1,
          satisfied: champNombre(p, ['satisfied']) ?? -1,
          violated: champNombre(p, ['violated']) ?? -1,
        }));
      }
    }
  }
  return [];
}

/* Les cinq identifiants FIXES par ADR-009:L34, et leur table d'echeance
 * CUMULEE, REPRISE A L'IDENTIQUE de acceptance/T51.spec.ts/T58.spec.ts. */
const CONTROLES_FIXES = ['reserve@1', 'idempotence@1', 'cancel@1', 'fifo@1', 'isolation@1'] as const;
type IdControle = (typeof CONTROLES_FIXES)[number];
const ECHEANCE_CONTROLE: Record<IdControle, number> = {
  'reserve@1': 1,
  'idempotence@1': 1,
  'cancel@1': 2,
  'fifo@1': 2,
  'isolation@1': 4,
};
function nombreControlesDus(k: number): number {
  return CONTROLES_FIXES.filter((id) => ECHEANCE_CONTROLE[id] <= k).length;
}

/* ════════════════════ III — ancrages geles (acceptance/reference/F-
 * RESERVATION.json), REPRIS de acceptance/T53.spec.ts/T58.spec.ts, et
 * DERIVATION PROPRE A T59 de l'acteur detenteur dans legacy a P4. */

const FIXTURE_RESERVATION = JSON.parse(fs.readFileSync(path.join(REPO, 'acceptance', 'reference', 'F-RESERVATION.json'), 'utf8')) as Json;
function valeurGelee(chemin: readonly string[]): unknown {
  let cur: unknown = FIXTURE_RESERVATION;
  for (const seg of chemin) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[seg];
  }
  return (cur as Json | undefined)?.valeur;
}
const LOCATAIRE_INITIAL = valeurGelee(['valeurs', 'locataire_initial']) as string; // F-RESERVATION.json:valeurs.locataire_initial (cahier:L119) = 'legacy'
const ACTEURS = valeurGelee(['valeurs', 'acteurs']) as string[]; // F-RESERVATION.json:valeurs.acteurs (cahier:L119) = [A,B,C]
/** Ancrage GELE — REPRIS A L'IDENTIQUE de acceptance/T53.spec.ts (L535) /
 *  T58.spec.ts (III) : acceptance/reference/F-RESERVATION.json:
 *  valeurs.P4.verdict_intertenant (cahier_line 123). */
const ANCHOR_NOT_FOUND = 'NOT_FOUND';
/** Second locataire, REPRIS de la racine gelee F-RESERVATION — jamais une
 *  invention de cette suite : acceptance/reference/F-RESERVATION.json:
 *  valeurs.P4.faits[1].valeur (cahier_line 119) = « creation d'un locataire
 *  `other` ». */
const SECOND_TENANT = 'other';
const FAITS_P4 = ((FIXTURE_RESERVATION.valeurs as Json | undefined)?.P4 as Json | undefined)?.faits as { valeur?: string }[] | undefined;
const FAIT_P4_SECOND_TENANT = Array.isArray(FAITS_P4) ? FAITS_P4[1]?.valeur : undefined;

/** L'acteur qui DETIENT une reservation dans `legacy` A LA PERIODE P4 —
 *  DERIVE, jamais invente, de acceptance/reference/F-RESERVATION.json:
 *  valeurs.P4.etat_persistant_a_l_entree (cahier:L123 : « a l'entree de P4,
 *  celui-ci conserve A annule, B confirme et C en attente ») : l'acteur dont
 *  le statut y vaut 'confirme' (« detient » = confirme, par opposition a
 *  'en attente' ou 'annule'). */
const ETAT_P4_ENTREE = obj((FIXTURE_RESERVATION.valeurs as Json | undefined)?.P4);
const ETAT_PERSISTANT_P4_ENTREE = obj(ETAT_P4_ENTREE.etat_persistant_a_l_entree);
const STATUT_CONFIRME = 'confirme'; // cahier:L123 (« B confirme »)
const HOLDER_LEGACY_AT_P4 = ((): string => {
  for (const acteur of Object.keys(ETAT_PERSISTANT_P4_ENTREE)) {
    const v = (ETAT_PERSISTANT_P4_ENTREE[acteur] as Json | undefined)?.valeur;
    if (v === STATUT_CONFIRME) return acteur;
  }
  return '';
})();

/** Litteral du BUG decrit par ADR-016 (lignes 19-20, jamais une invention de
 *  cette suite) : « l'usage `sonde-intertenant` est une lecture faite PAR
 *  l'acteur `Z` du locataire `other` » — la traduction actuelle place
 *  l'acteur LECTEUR (jamais un acteur detenteur de legacy) dans `key`. */
const LITERAL_READER_BUG = 'Z'; // source:docs/adr/ADR-016:L19-20

exige(
  typeof LOCATAIRE_INITIAL === 'string' && LOCATAIRE_INITIAL.length > 0 && Array.isArray(ACTEURS) && ACTEURS.length >= 1,
  'racine-gelee-F-RESERVATION-lisible',
  `valeurs lues : locataire=${rendu(LOCATAIRE_INITIAL)} acteurs=${rendu(ACTEURS)}`,
);
exige(
  typeof FAIT_P4_SECOND_TENANT === 'string' && FAIT_P4_SECOND_TENANT.includes(`\`${SECOND_TENANT}\``),
  'le-second-locataire-SECOND_TENANT-provient-bien-de-la-racine-gelee-F-RESERVATION',
  `vu valeurs.P4.faits[1].valeur = ${rendu(FAIT_P4_SECOND_TENANT)}, attendu qu'il nomme \`${SECOND_TENANT}\``,
);
exige(
  typeof HOLDER_LEGACY_AT_P4 === 'string' && HOLDER_LEGACY_AT_P4.length > 0 && ACTEURS.includes(HOLDER_LEGACY_AT_P4),
  'l-acteur-detenteur-dans-legacy-a-p4-est-derive-de-la-racine-gelee-F-RESERVATION',
  `ETAT_PERSISTANT_P4_ENTREE=${rendu(ETAT_PERSISTANT_P4_ENTREE)} -> HOLDER_LEGACY_AT_P4=${rendu(HOLDER_LEGACY_AT_P4)} ; acteurs=${rendu(ACTEURS)}`,
);
exige(
  HOLDER_LEGACY_AT_P4 !== LITERAL_READER_BUG,
  'l-acteur-detenteur-derive-differe-bien-de-l-acteur-lecteur-du-bug',
  `HOLDER_LEGACY_AT_P4=${rendu(HOLDER_LEGACY_AT_P4)} LITERAL_READER_BUG=${rendu(LITERAL_READER_BUG)} — sans cette difference, A1 ne pourrait distinguer la traduction corrigee de l'ancien defaut`,
);

/* ════════════════════ IV — observation DIRECTE du « modele attendu » et de
 * la variante fautive (acceptance/fixtures/candidates/...), REPRISE DU
 * MECANISME de acceptance/T58.spec.ts (IV) : jamais une relecture de code
 * candidat comme une implementation. */

function appellerCandidatDirectement(cheminCandidat: string, requetes: Json[]): Map<string, Json> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 't59-direct-candidat-'));
  WORKSPACES_CREES.push(cwd);
  const entree = `${requetes.map((r) => JSON.stringify(r)).join('\n')}\n`;
  let sortie = '';
  try {
    sortie = execFileSync('node', [cheminCandidat], {
      cwd,
      input: entree,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stdout?: unknown };
    sortie = String(err.stdout ?? '');
  }
  const parId = new Map<string, Json>();
  for (const ligne of sortie.split('\n')) {
    const t = ligne.trim();
    if (t.length === 0) continue;
    try {
      const j = JSON.parse(t) as Json;
      if (typeof j.id === 'string') parId.set(j.id, j);
    } catch {
      /* ligne non-JSON (bruit de demarrage, ex. {"ready":true}) : ignoree */
    }
  }
  return parId;
}

/* ───────────────── manifestes et fixtures, JAMAIS des sources de T59 */

const MANIFEST_QUATRE_PERIODES = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t52-claude-cli-four-periods.json');
if (!fs.existsSync(MANIFEST_QUATRE_PERIODES)) throw new Error(`FIXTURE-ABSENTE : ${MANIFEST_QUATRE_PERIODES}`);

const REFERENCE_V2 = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'reservation-candidate-v2.mjs');
const REFERENCE_V2_FAUTIF = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'reservation-candidate-v2-faulty-isolation.mjs');
const REFERENCE_V2_LOG_READS = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'reservation-candidate-v2-log-read-requests.mjs'); // publiee par T59
const REFERENCE_V2_FAUTIF_LOG_READS = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'reservation-candidate-v2-faulty-isolation-log-reads.mjs'); // publiee par T59
for (const f of [REFERENCE_V2, REFERENCE_V2_FAUTIF, REFERENCE_V2_LOG_READS, REFERENCE_V2_FAUTIF_LOG_READS]) {
  if (!fs.existsSync(f)) throw new Error(`FIXTURE-ABSENTE : ${f}`);
}
const REFERENCE_V2_ARGV = ['node', REFERENCE_V2];
const REFERENCE_V2_FAUTIF_ARGV = ['node', REFERENCE_V2_FAUTIF];
const REFERENCE_V2_LOG_READS_ARGV = ['node', REFERENCE_V2_LOG_READS];
const REFERENCE_V2_FAUTIF_LOG_READS_ARGV = ['node', REFERENCE_V2_FAUTIF_LOG_READS];

const MODULE_DERIVATION_T59 = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't59-derive-reference-candidate.mjs'); // publiee par T59
if (!fs.existsSync(MODULE_DERIVATION_T59)) throw new Error(`FIXTURE-ABSENTE : ${MODULE_DERIVATION_T59}`);

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T59 — faire porter la sonde d isolation sur une reservation de legacy', () => {
  test(
    'T59.A1 a candidat reel, la requete de la sonde d isolation lit, depuis le locataire other, la cle d un acteur qui detient une reservation dans legacy a cette periode (ADR-016)',
    () => {
      const ctx = nouveauContexte('a1');
      for (let p = 1; p <= 4; p += 1) {
        const appel = candidateControlPeriod(ctx, REFERENCE_V2_LOG_READS_ARGV, 60_000);
        exige(appel.resultat !== null, `periode-${p}-executee`, messageEchec(`periode ${p}`, appel));
        const r = appel.resultat as Json;
        exige(indexDe(r) === p, `periode-${p}-index-${p}`, `vu ${rendu(indexDe(r))} dans ${rendu(r)}`);
        exige(deployeDe(r) === true, `periode-${p}-candidat-deploye`, `vu ${rendu(deployeDe(r))} dans ${rendu(r)}`);
      }

      const dirCandidat = workspaceDirCourant(ctx);
      const logPath = path.join(dirCandidat, 'read-requests.log');
      exige(fs.existsSync(logPath), 'journal-des-requetes-read-ecrit-par-le-candidat', `ABSENT : ${logPath}`);
      const lignes = fs
        .readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
      const requetes = lignes
        .map((l) => {
          try {
            return JSON.parse(l) as Json;
          } catch {
            return null;
          }
        })
        .filter((x): x is Json => x !== null);
      exige(
        requetes.length > 0 && requetes.length === lignes.length,
        'chaque-ligne-du-journal-est-une-requete-read-json-valide',
        `${lignes.length} ligne(s) brute(s), ${requetes.length} JSON valide(s) : ${rendu(lignes)}`,
      );

      const requetesDepuisOther = requetes.filter((r) => r.tenant_id === SECOND_TENANT);
      exige(
        requetesDepuisOther.length > 0,
        'la-sonde-d-isolation-lit-reellement-depuis-le-locataire-other',
        `AUCUNE requete read n'a tenant_id=${rendu(SECOND_TENANT)} (F-RESERVATION valeurs.P4.faits[1]) parmi ${rendu(requetes)}`,
      );

      const clesUtilisees = requetesDepuisOther.map((r) => r.key);
      exige(
        clesUtilisees.every((k) => k === HOLDER_LEGACY_AT_P4),
        'la-sonde-d-isolation-lit-la-cle-de-l-acteur-qui-detient-une-reservation-dans-legacy',
        `attendu key=${rendu(HOLDER_LEGACY_AT_P4)} (F-RESERVATION valeurs.P4.etat_persistant_a_l_entree, cahier:L123) pour chaque requete depuis ${rendu(SECOND_TENANT)} ; vu ${rendu(clesUtilisees)} dans ${rendu(requetesDepuisOther)}`,
      );
      exige(
        !clesUtilisees.includes(LITERAL_READER_BUG),
        'la-sonde-d-isolation-ne-lit-plus-la-cle-de-l-acteur-lecteur-Z',
        `la cle ${rendu(LITERAL_READER_BUG)} (docs/adr/ADR-016.md:L19-20, « l'acteur Z du locataire other ») figure encore parmi ${rendu(clesUtilisees)} — c'est EXACTEMENT le defaut que ADR-016 documente`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T59.A2 un candidat de reference qui repond {value:null} a une cle inconnue et NOT_FOUND a la lecture intertenant de l acteur legacy satisfait isolation@1 ; un candidat qui divulgue sa reservation la viole (ADR-016)',
    () => {
      const CLE_JAMAIS_ECRITE = 'acteur-jamais-ecrit-t59-a2'; // jamais un acteur de ACTEURS/F-RESERVATION : garantit une cle REELLEMENT inconnue.
      const requetesSonde: Json[] = [
        { id: 'r1', op: 'create_tenant', args: { tenant_id: LOCATAIRE_INITIAL } },
        { id: 'r2', op: 'write', args: { op: 'reserve', actor: HOLDER_LEGACY_AT_P4, tenant_id: LOCATAIRE_INITIAL, admission_seq: 1, operation_key: 't59-a2-reserve' } },
        { id: 'r3', op: 'read', args: { tenant_id: LOCATAIRE_INITIAL, key: CLE_JAMAIS_ECRITE } },
        { id: 'r4', op: 'read', args: { tenant_id: SECOND_TENANT, key: HOLDER_LEGACY_AT_P4 } },
      ];

      // (1) Observation DIRECTE du « modele attendu » (reservation-candidate-v2.mjs, T51, DEJA ACCEPTE).
      const reponsesOk = appellerCandidatDirectement(REFERENCE_V2, requetesSonde);
      const r3ok = reponsesOk.get('r3');
      exige(
        r3ok !== undefined && r3ok.ok === true && estObjetJson(r3ok.result) && (r3ok.result as Json).value === null,
        'le-candidat-de-reference-repond-value-null-a-une-cle-inconnue',
        `vu ${rendu(r3ok)} pour read(tenant_id=${rendu(LOCATAIRE_INITIAL)},key=${rendu(CLE_JAMAIS_ECRITE)})`,
      );
      const r4ok = reponsesOk.get('r4');
      exige(
        r4ok !== undefined && r4ok.ok === false && estObjetJson(r4ok.error) && (r4ok.error as Json).code === ANCHOR_NOT_FOUND,
        'le-candidat-de-reference-repond-une-erreur-NOT_FOUND-a-la-lecture-intertenant-de-l-acteur-legacy',
        `vu ${rendu(r4ok)} pour read(tenant_id=${rendu(SECOND_TENANT)},key=${rendu(HOLDER_LEGACY_AT_P4)})`,
      );

      // (2) Observation DIRECTE de la variante FAUTIVE (reservation-candidate-v2-faulty-isolation.mjs, T51, DEJA ACCEPTEE) :
      // elle divulgue REELLEMENT la reservation de l'acteur legacy quand on la sonde avec sa VRAIE cle.
      const reponsesFautif = appellerCandidatDirectement(REFERENCE_V2_FAUTIF, requetesSonde);
      const r4fautif = reponsesFautif.get('r4');
      exige(
        r4fautif !== undefined &&
          r4fautif.ok === true &&
          estObjetJson(r4fautif.result) &&
          estObjetJson((r4fautif.result as Json).value) &&
          ((r4fautif.result as Json).value as Json).status === 'confirmed',
        'le-candidat-fautif-divulgue-reellement-la-reservation-de-l-acteur-legacy',
        `attendu une FUITE (ok:true, result.value.status==='confirmed' — acceptance/fixtures/candidates/reservation-candidate-v2-faulty-isolation.mjs, case 'read') ; vu ${rendu(r4fautif)}`,
      );

      // (3) Le MEME lien, via le moteur reel (candidate-control-period, T51 — le point nomme par
      // ADR-016), sur quatre periodes : isolation@1 satisfied pour le correct, violated pour le fautif.
      const ctxOk = nouveauContexte('a2-ok');
      let dernierOk: Json | null = null;
      for (let p = 1; p <= 4; p += 1) {
        const appel = candidateControlPeriod(ctxOk, REFERENCE_V2_ARGV, 60_000);
        exige(appel.resultat !== null, `ok-periode-${p}-executee`, messageEchec(`ok periode ${p}`, appel));
        dernierOk = appel.resultat;
      }
      const isoOk = controlesMienDe(dernierOk).find((c) => c.id === 'isolation@1');
      exige(isoOk !== undefined && isoOk.status === 'satisfied', 'isolation@1-satisfied-pour-le-candidat-de-reference', `vu ${rendu(isoOk)} dans ${rendu(controlesMienDe(dernierOk))}`);

      // (4) La variante FAUTIVE, instrumentee (acceptance/fixtures/candidates/
      // reservation-candidate-v2-faulty-isolation-log-reads.mjs, publiee par
      // cette tache), via le CHEMIN REEL de traduction : la DECISIVE n'est
      // jamais le seul statut 'violated' (insensible a la cle recue pour CE
      // candidat, qui ne verifie AUCUN tenant — voir le mutant T59.M1/M3),
      // mais la VALEUR REELLEMENT divulguee par la sonde d'isolation REELLE.
      const ctxFautif = nouveauContexte('a2-fautif');
      let dernierFautif: Json | null = null;
      for (let p = 1; p <= 4; p += 1) {
        const appel = candidateControlPeriod(ctxFautif, REFERENCE_V2_FAUTIF_LOG_READS_ARGV, 60_000);
        exige(appel.resultat !== null, `fautif-periode-${p}-executee`, messageEchec(`fautif periode ${p}`, appel));
        dernierFautif = appel.resultat;
      }
      const isoFautif = controlesMienDe(dernierFautif).find((c) => c.id === 'isolation@1');
      exige(isoFautif !== undefined && isoFautif.status === 'violated', 'isolation@1-violated-pour-le-candidat-fautif', `vu ${rendu(isoFautif)} dans ${rendu(controlesMienDe(dernierFautif))}`);

      const dirFautif = workspaceDirCourant(ctxFautif);
      const logReponsesPath = path.join(dirFautif, 'read-responses.log');
      exige(fs.existsSync(logReponsesPath), 'journal-des-reponses-read-ecrit-par-le-candidat-fautif', `ABSENT : ${logReponsesPath}`);
      const reponsesJournalisees = fs
        .readFileSync(logReponsesPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => {
          try {
            return JSON.parse(l) as Json;
          } catch {
            return null;
          }
        })
        .filter((x): x is Json => x !== null);
      const reponsesDepuisOther = reponsesJournalisees.filter((r) => r.tenant_id === SECOND_TENANT);
      exige(
        reponsesDepuisOther.length > 0,
        'la-sonde-d-isolation-reelle-interroge-reellement-le-candidat-fautif-depuis-other',
        `AUCUNE reponse read journalisee avec tenant_id=${rendu(SECOND_TENANT)} parmi ${rendu(reponsesJournalisees)}`,
      );
      const fuiteReelle = reponsesDepuisOther.some((r) => estObjetJson(r.value) && (r.value as Json).status === 'confirmed');
      exige(
        fuiteReelle,
        'le-candidat-fautif-divulgue-reellement-la-reservation-de-l-acteur-legacy-via-la-sonde-reelle',
        `attendu au moins une reponse {value:{status:'confirmed'}} parmi les lectures depuis ${rendu(SECOND_TENANT)} (la sonde reelle doit lire la cle de ${rendu(HOLDER_LEGACY_AT_P4)}, F-RESERVATION cahier:L123) ; vu ${rendu(reponsesDepuisOther)} — tant que la traduction lit encore la cle de l'acteur lecteur Z (jamais ecrite), cette reponse reste {value:null} et NE DIVULGUE RIEN, exactement le defaut qu'ADR-016 documente`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T59.A3 lance par bench pilot-conduct --provider claude-cli --live, un candidat de reference derive du seul prompt recu satisfait chaque controle du a chaque periode, isolation@1 compris (ADR-016)',
    () => {
      const ctx = nouveauContexte('a3');
      const deriveLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 't59-a3-derive-log-'));
      WORKSPACES_CREES.push(deriveLogDir);
      const env = envCandidatDerivePar(MODULE_DERIVATION_T59, { deriveLogDir });

      const run = conduire(ctx, MANIFEST_QUATRE_PERIODES, env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A3)', run));
      exige(periodsPersistedDe(run.resultat) === 4, 'quatre-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      const trajKey = trajectoryKeyDe(run.resultat);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible', `vu ${rendu(trajKey)} dans ${rendu(run.resultat)}`);
      const periodesSelfReport = controlPeriodsDe(run.resultat, trajKey as string);
      const rapportDirect = candidateControlReportDirect(trajKey as string, ctx.db);
      exige(rapportDirect.resultat !== null && rapportDirect.exit === 0, 'candidate-control-report-direct-execute', messageEchec('candidate-control-report', rapportDirect));

      const echecsParPeriode: string[] = [];
      for (const k of [1, 2, 3, 4]) {
        const duesAK = nombreControlesDus(k);
        const ligne = periodesSelfReport.find((p) => p.period_index === k);
        if (ligne === undefined) {
          echecsParPeriode.push(`${k}:absente(${rendu(periodesSelfReport)})`);
          continue;
        }
        if (ligne.violated !== 0 || ligne.satisfied !== duesAK) {
          echecsParPeriode.push(`${k}:satisfied=${ligne.satisfied},violated=${ligne.violated}(dus=${duesAK})`);
        }
      }
      exige(
        echecsParPeriode.length === 0,
        'le-candidat-derive-du-prompt-seul-satisfait-chaque-controle-du-a-chaque-periode-isolation-comprise',
        `PERIODE(S) EN ECHEC : ${rendu(echecsParPeriode)} — isolation@1 du a compter de P4 ; cet echec est EXACTEMENT celui que ADR-016 documente (la sonde d'isolation lit encore la cle de l'acteur lecteur, jamais celle d'un acteur detenteur dans legacy) tant que la traduction n'est pas corrigee`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
