/**
 * acceptance/T58.spec.ts — suite d'acceptation de la tache T58.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T58.A1 behaviour — pour chaque operation du contrat `bench.candidate/2`
 *                      qui peut echouer, un exemple public montre sa reponse
 *                      d'erreur sous la forme exacte {"ok":false,"error":
 *                      {"code":"NOT_FOUND",...}}
 *   T58.A2 absence   — l'enonce de chaque periode ou une regle produit une
 *                      erreur la decrit comme une reponse d'erreur dont le
 *                      champ `error.code` porte la valeur, et n'emploie pour
 *                      elle ni le mot « verdict » ni le champ `decision`
 *   T58.A3 behaviour — le contrat ET l'enonce disent que l'argument `key` de
 *                      `read` est l'identifiant de l'acteur
 *   T58.A4 behaviour — lance par `bench pilot-conduct --provider claude-cli
 *                      --live`, un candidat de reference dont la structure
 *                      des reponses, erreurs comprises, provient du SEUL
 *                      prompt recu satisfait chaque controle du a chaque
 *                      periode, isolation@1 compris
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T58 EST UNE TACHE D'EXTENSION (ADR-015) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T58 — `packages/
 * activities`, `apps/cli` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff, jamais une
 * barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T58.md et de sa source, docs/adr/ADR-015-reponses-d-erreur-et-
 * cle-de-lecture.md, lignes 45 a 51 (la plage que la carte de T58 epingle
 * dans verification/tasks.extensions.json#spec_source), AINSI QUE du corps
 * narratif du MEME document ACCEPTE (hors de cette plage — la meme liberte
 * que prennent deja acceptance/T48.spec.ts a acceptance/T57.spec.ts face a
 * leur propre ADR) :
 *
 *   « Ce que le second pilote reel a montre » : sur un moteur entierement
 *   prouve, quatre controles sur cinq sont desormais attribuables. Deux
 *   ecarts restent imputables au moteur : (1) « isolation@1 n'est pas
 *   attribuable. Le controle attend [...] une REPONSE D'ERREUR {"id",
 *   "ok":false,"error":{"code":"NOT_FOUND",...}}. Aucun exemple public ne
 *   montre une reponse d'erreur ; l'enonce de P4 dit que toute tentative
 *   "renvoie le verdict NOT_FOUND". Sonnet a repondu {"decision":
 *   "NOT_FOUND"} — une lecture raisonnable du mot "verdict". » (2) « Le sens
 *   de l'argument `key` de `read` n'est ecrit nulle part. Le moteur y place
 *   l'identifiant de l'acteur ; seul l'exemple public le suggere. Haiku l'a
 *   lu comme la cle d'operation. »
 *   « Decision » : « Chaque reponse d'erreur que le modele attendu peut
 *   produire a un exemple public de cette forme exacte. L'enonce dit, pour
 *   chaque regle qui se traduit par une erreur, que la reponse est une
 *   reponse d'erreur et nomme le champ qui porte le code. Le contrat et
 *   l'enonce disent que l'argument `key` de `read` est l'identifiant de
 *   l'acteur. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions et contrats DEJA
 * FIXES par les suites ACCEPTEES dont elle depend (jamais des sources de
 * T58) :
 *   - acceptance/T50.spec.ts (III)/T52.spec.ts (III) : le contrat
 *     `bench.candidate/2` — REPRIS A L'IDENTIQUE, jamais re-derive.
 *   - acceptance/T48.spec.ts (III.2) : le protocole de transport NDJSON,
 *     {"id","op","args"} -> {"id","ok":true,"result"} ou {"id","ok":false,
 *     "error":{"code","message"}} — REPRIS A L'IDENTIQUE. Ce protocole fixe
 *     DEJA les NOMS de champ `error`/`code`/`message` au niveau generique
 *     (observe mot pour mot dans le prompt reel, section « Forme des
 *     reponses ») : ce que T58 ajoute n'est donc PAS un nom de champ, mais UN
 *     EXEMPLE CONCRET liant une VALEUR metier (NOT_FOUND) a cette forme, et
 *     un ENONCE qui la decrit comme une erreur plutot que comme une
 *     decision — exactement ce que l'incident reel documente (Sonnet
 *     CONNAISSAIT deja la forme generique, mais ne l'a pas appliquee a cette
 *     regle precise).
 *   - acceptance/T53.spec.ts (III) : la constante ANCHOR_NOT_FOUND = 'NOT_FOUND'
 *     — acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant
 *     (cahier_line 123) — REPRISE A L'IDENTIQUE (meme valeur, meme ancrage).
 *   - acceptance/T56.spec.ts (II.2)/T57.spec.ts (II.2-3) : le DETECTEUR
 *     D'EXEMPLES par segmentation d'accolades equilibrees et ancrage par les
 *     cles d'argument ET de reponse du contrat — ETENDU ici
 *     (`exempleErreurPourOperation`, section III) pour chercher une reponse
 *     D'ERREUR (ok:false) plutot qu'une reponse de succes.
 *   - acceptance/T53.spec.ts (III)/T56.spec.ts (en-tete)/T57.spec.ts (en-tete) :
 *     la DESCRIPTION UNIFIEE exportee par packages/scenario/packages/
 *     activities comme ORACLE de l'enonce de chaque periode — REIMPLEMENTEE
 *     A L'IDENTIQUE ici (meme discipline que T57 face a T53 : jamais pour
 *     re-tester une suite DEJA ACCEPTEE, mais pour SERVIR D'ORACLE a T58).
 *   - acceptance/T52.spec.ts (II.8) : le manifeste DEUX periodes
 *     `manifest-t49-claude-cli-small.json` (A1, A3 — aucune des deux
 *     n'exige l'isolation@1 elle-meme, seulement un exemple/une mention
 *     d'erreur qui, on l'observe au run reel, apparait DEJA dans le prompt
 *     de P1/P2 — la section « Exemples publics du protocole » et la section
 *     « Contrat d'application » sont STATIQUES, identiques a chaque periode)
 *     et le manifeste QUATRE periodes `manifest-t52-claude-cli-four-periods.json`
 *     (A4, necessaire pour exercer isolation@1, du seulement a P4) — REPRIS
 *     SANS MODIFICATION.
 *   - acceptance/fixtures/candidates/reservation-candidate-v2.mjs (T51, zone
 *     ACCEPTANCE, jamais une source de T58) : le « modele attendu » de A1 —
 *     cette suite l'INVOQUE DIRECTEMENT (NDJSON sur stdin/stdout, protocole
 *     DEJA FIXE par T48/T50/T52) pour OBSERVER qu'il produit REELLEMENT une
 *     reponse d'erreur NOT_FOUND pour `write`/`read`/`probe_cancel` depuis un
 *     locataire autre que le proprietaire — jamais pour en relire le code
 *     source comme une implementation.
 *   - acceptance/reference/F-RESERVATION.json (zone REFERENCE, gelee) :
 *     `valeurs.locataire_initial` (= 'legacy', deja lu programme par T57) et
 *     la mention `` `other` `` de `valeurs.P4.faits[1].valeur` (« creation
 *     d'un locataire `other` ») — SECOND_TENANT ci-dessous reprend cette
 *     valeur telle que la racine gelee la nomme.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE AJOUTE OU FIXE ELLE-MEME (ADR-001 : aucune des valeurs
 * ci-dessous n'a ete obtenue en executant une implementation de T58 — aucune
 * n'existe au moment ou cette suite est ecrite ; verifie en executant cette
 * suite en l'etat actuel du depot : A1-A4 rougissent tous les quatre, exemple
 * public reel observe en section I ci-dessus ne montrant jamais d'erreur et
 * l'enonce reel de P4 disant encore « renvoie le verdict NOT_FOUND »)
 *
 * 1. LE DETECTEUR D'EXEMPLE D'ERREUR PAR OPERATION (`exempleErreurPourOperation`,
 *    section III) : ANCRE une requete par `op`+cles d'argument (mecanisme
 *    DEJA ACCEPTE de T56/T57), la LIE a SA reponse par `id` et par adjacence
 *    (`pairesExemples` — jamais une fenetre de proximite textuelle, qui
 *    laissait l'exemple d'erreur d'une operation voisine « couvrir »
 *    `read` : gate de mutation T58.M4, mesure reelle), et exige que cette
 *    reponse soit `"ok":false` avec une FORME CANONIQUE (`formeDe`, cles et
 *    types, recursivement — REPRIS A L'IDENTIQUE de T57.spec.ts, II.1)
 *    egale EXACTEMENT a celle REELLEMENT observee en appelant le modele attendu
 *    (section IV). Lecture LITTERALE de « cette forme exacte » : la VALEUR
 *    du code n'est jamais comparee ici — chaque exemple existant du
 *    protocole emploie deja des valeurs-gabarit (`tenant-exemple`,
 *    `{"decision":"exemple"}`), et exiger la valeur METIER reelle dans
 *    l'exemple d'erreur serait une exigence qu'aucune source n'etablit (le
 *    risque de FAUX ROUGE qu'ADR-001 met en garde contre).
 * 2. LA BATTERIE D'OBSERVATION DIRECTE DE A1 (section IV) : trois requetes
 *    (`write`,`read`,`probe_cancel`) depuis SECOND_TENANT (jamais le
 *    proprietaire), arguments issus de la racine gelee F-RESERVATION,
 *    verifiant SANITAIREMENT que le modele attendu (reservation-candidate-
 *    v2.mjs, DEJA ACCEPTE) produit bien une reponse d'erreur NOT_FOUND pour
 *    chacune — sans quoi la comparaison avec les exemples publics ne
 *    prouverait rien.
 * 3. LA SECTION « CONTRAT » DU PROMPT REEL (`sectionContrat`, section III) :
 *    bornee par les deux ancres STABLES observees au run reel (« Contrat
 *    d'application » / « Convention de lancement »), jamais une supposition
 *    sur le format — observee directement, jamais devinee.
 * 4. LA VERIFICATION DU VOCABULAIRE INTERDIT DE A2, SCOPEE A LA PHRASE : parmi
 *    toutes les phrases (decoupees sur `. ` suivi d'espace) de l'enonce d'une
 *    periode, celle qui contient l'ancrage ANCHOR_NOT_FOUND est celle qui
 *    decrit la regle d'isolation — SEULE cette phrase est verifiee pour
 *    l'absence de 'verdict'/'decision', jamais l'enonce entier (qui emploie
 *    LEGITIMEMENT 'decision' ailleurs, pour les reponses de succes de
 *    `write`). Une verification non-scopee serait un FAUX ROUGE garanti sur
 *    toute implementation correcte (ADR-001 : jamais de faux rouge invente).
 * 5. LE CANDIDAT DE REFERENCE DE A4, DERIVE DE LA FORME ET DE LA VALEUR
 *    (acceptance/fixtures/claude-cli/t58-derive-reference-candidate.mjs,
 *    publiee PAR CETTE TACHE — jamais une source de T58) : voir son en-tete
 *    pour le detail complet du mecanisme `exempleErreurMontre`/
 *    `isolationEnoncee` (derivation PAR FORME/VALEUR, jamais par lexique).
 *
 * Les perturbations exactes de A1-A4 sont celles de
 * verification/cases.extensions.lock.json#T58, realisees mot pour mot par
 * verification/mutants/T58.json.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne redemontre ni le contrat bench.candidate/2 (T50/T52), ni le
 *    protocole de transport (T48), ni l'enonce/vocabulaire de periode au
 *    niveau de la description exportee pour `decision`/`status`/
 *    `waiting_position` (T56/T57), ni la forme des reponses de succes (T57) :
 *    elle REUTILISE ces resultats comme des oracles, jamais ne les re-prouve.
 *  • Elle ne pretend rien sur les codes CONFLICT/CANCELLATION_TOO_LATE/
 *    NO_ACTIVE_RESERVATION : observes sur reservation-candidate-v2.mjs (DEJA
 *    ACCEPTE), ceux-ci restent des VALEURS DE DECISION (`{"decision":
 *    "CONFLICT"}`, ok:true), jamais des reponses d'erreur protocolaires —
 *    seule l'isolation inter-locataire (NOT_FOUND) en est une, et c'est la
 *    SEULE que ADR-015 nomme. Inventer une exigence sur les trois autres
 *    codes serait un FAUX ROUGE possible sur une implementation correcte.
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T47/T49/.../T57.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * commun — REPRIS, SANS LE REINVENTER, de acceptance/T52.spec.ts/T54.spec.ts/
 * T55.spec.ts/T56.spec.ts/T57.spec.ts (socle CLI+PostgreSQL+faux claude). */

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

const RUN = `t58_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

/* ───────────────────────────── extraction de champs — FORME SOUPLE (reprise
 * T52/T55/T56/T57) : utile pour LIRE la sortie de la CLI, jamais pour comparer
 * une FORME d'exemple ou de reponse directe du candidat. */

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
function champProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== null && n.valeur !== undefined) return n;
  }
  return null;
}
function tableauProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && Array.isArray(n.valeur)) return n;
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

/* ════════════════════════ fixture claude-cli (reprise T47/T49/.../T57) */

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

function envEcritureConstante(opts: {
  relPath: string;
  content: string;
  recordPlanDir?: string;
  recordPlanCounterFile?: string;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH: opts.relPath,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT: opts.content,
  };
  if (opts.recordPlanDir !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR = opts.recordPlanDir;
  if (opts.recordPlanCounterFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE = opts.recordPlanCounterFile;
  verifierFauxEnTetePath(env);
  return env;
}

/** Mecanisme de DERIVATION (acceptance/T55.spec.ts, A3 ; T56/T57.spec.ts) —
 *  REPRIS A L'IDENTIQUE, parametre par le CHEMIN du module de derivation
 *  (jamais fixe en dur ici : A4 pointe vers le module PROPRE a cette tache,
 *  acceptance/fixtures/claude-cli/t58-derive-reference-candidate.mjs). */
function envCandidatDerivePar(modulePath: string, opts: { deriveLogDir: string; recordPlanDir?: string; recordPlanCounterFile?: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: modulePath,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: opts.deriveLogDir,
  };
  if (opts.recordPlanDir !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR = opts.recordPlanDir;
  if (opts.recordPlanCounterFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE = opts.recordPlanCounterFile;
  verifierFauxEnTetePath(env);
  return env;
}

function nouveauPlanDeRecord(suffixe: string): { dir: string; counterFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t58-record-plan-${suffixe}-`));
  WORKSPACES_CREES.push(dir);
  return { dir, counterFile: path.join(dir, 'counter.txt') };
}
function recordPlanN(dir: string, n: number): Json | null {
  const f = path.join(dir, `record-${n}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
  } catch {
    return null;
  }
}
function argvPlanN(dir: string, n: number): string[] {
  const enreg = recordPlanN(dir, n);
  return Array.isArray(enreg?.argv) ? (enreg!.argv as unknown[]).map(String) : [];
}
function promptBrutPlanN(dir: string, n: number): string {
  const argv = argvPlanN(dir, n);
  const idxP = argv.indexOf('-p'); // convention FIXEE par acceptance/T49.spec.ts (II.4)
  return idxP >= 0 && idxP + 1 < argv.length ? (argv[idxP + 1] as string) : '';
}

/* ════════════════════ drapeaux et sous-commandes (repris T46/T49/.../T57) */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21)
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008:L149

const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const SOUS_COMMANDE_CONTROL_REPORT = 'candidate-control-report'; // FIXE par acceptance/T51.spec.ts (II.1)

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008:L98
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // T48 III.1

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

/** `candidate_control_report[trajectory_key].periods` (forme FIXEE par
 *  acceptance/T52.spec.ts, II.2). */
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

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t58-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t58-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

/** `bench pilot-conduct` sur la campagne `ctx`, mode `claude-cli --live`,
 *  manifeste PARAMETRE (A1/A3 reutilisent le manifeste DEUX periodes de T49,
 *  A4 le manifeste QUATRE periodes de T52). */
function conduire(ctx: Contexte, manifest: string, extra: string[], env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [
      manifest,
      DRAPEAU_CAMPAGNE, ctx.campaignId,
      DRAPEAU_PG, ctx.db,
      DRAPEAU_S3, ctx.bucket,
      DRAPEAU_MODE, MODE,
      DRAPEAU_PROVIDER, PROVIDER_CLAUDE_CLI,
      DRAPEAU_LIVE,
      DRAPEAU_WORKSPACE_ROOT, ctx.workspaceRoot,
      ...extra,
    ],
    env,
  );
}
function candidateControlReportDirect(trajectoryKey: string, db: string): AppelCli {
  return lancer(SOUS_COMMANDE_CONTROL_REPORT, [DRAPEAU_CAMPAGNE, trajectoryKey, DRAPEAU_PG, db]);
}

/* ───────────────── manifestes et fixtures, JAMAIS des sources de T58 */

/** REPRIS A L'IDENTIQUE de acceptance/T49.spec.ts (II)/T52/.../T57 : UNE
 *  trajectoire, DEUX periodes — suffit pour A1/A3 (la section « Exemples
 *  publics » et la section « Contrat d'application » du prompt reel sont
 *  STATIQUES, identiques a chaque periode — observe en section I ci-dessus). */
const MANIFEST_DEUX_PERIODES = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t49-claude-cli-small.json');
/** REPRIS A L'IDENTIQUE de acceptance/T52.spec.ts : QUATRE periodes —
 *  necessaire pour A4, qui exige `isolation@1` (du SEULEMENT a P4). */
const MANIFEST_QUATRE_PERIODES = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t52-claude-cli-four-periods.json');
for (const m of [MANIFEST_DEUX_PERIODES, MANIFEST_QUATRE_PERIODES]) {
  if (!fs.existsSync(m)) throw new Error(`FIXTURE-ABSENTE : ${m}`);
}

/** REPRIS A L'IDENTIQUE de acceptance/T51.spec.ts (fixtures)/.../T57 :
 *  le candidat de reference qui respecte `bench.candidate/2`. Section IV :
 *  cette suite l'INVOQUE DIRECTEMENT pour observer qu'il produit REELLEMENT
 *  une reponse d'erreur NOT_FOUND (A1) — jamais pour en relire le code comme
 *  une implementation. */
const REFERENCE_V2 = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'reservation-candidate-v2.mjs');
if (!fs.existsSync(REFERENCE_V2)) throw new Error(`FIXTURE-ABSENTE : ${REFERENCE_V2}`);
const CONTENU_CANDIDAT_CORRECT = fs.readFileSync(REFERENCE_V2, 'utf8');
const ENTREE_CANDIDATE = 'candidate.mjs'; // FIXE par acceptance/T52.spec.ts (II.4)

/** Module de derivation de CETTE tache (zone ACCEPTANCE, publie par T58). */
const MODULE_DERIVATION_T58 = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't58-derive-reference-candidate.mjs');
if (!fs.existsSync(MODULE_DERIVATION_T58)) throw new Error(`FIXTURE-ABSENTE : ${MODULE_DERIVATION_T58}`);

/* Les cinq identifiants FIXES par ADR-009:L34, et leur table d'echeance
 * CUMULEE, REPRISE A L'IDENTIQUE de acceptance/T51.spec.ts (II.6)/
 * T56.spec.ts (II.3)/T57.spec.ts. Jamais re-derivee ici. */
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

/* ════════════════════ oracle de l'enonce de periode (reprise T53/T56/T57 —
 * JAMAIS re-verifie ici, sert SEULEMENT d'ORACLE pour A2/A3) */

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
  for (const rel of ['dist/index.js', 'src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}
async function loadPackage(pkgDirName: string): Promise<{ ns: Ns | null; attempts: string[] }> {
  const attempts: string[] = [];
  for (const s of specifiersForPackage(pkgDirName)) {
    try {
      const mod = (await import(s)) as Ns;
      return { ns: mod, attempts };
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  attempts.push(`paquet packages/${pkgDirName} : aucun specificateur n'a repondu`);
  return { ns: null, attempts };
}

let ORACLE: { charge: boolean; flat: Map<string, unknown>; attempts: string[] } = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };
beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  let unCharge = false;
  for (const pkg of ['scenario', 'activities']) {
    const { ns, attempts: a } = await loadPackage(pkg);
    attempts.push(...a);
    if (ns !== null) {
      flatten(ns, flat);
      unCharge = true;
    }
  }
  ORACLE = { charge: unCharge, flat, attempts };
}, CASE_TIMEOUT_MS);
function assertOracleLoaded(): void {
  exige(
    ORACLE.charge,
    'oracle-packages-scenario-ou-activities-charges',
    `AUCUN-DES-DEUX-PAQUETS-N-A-PU-ETRE-CHARGE (oracle de l'enonce indisponible) : ${ORACLE.attempts.join(' | ')}`,
  );
}

const MARQUEUR_CONTRAT = 'bench.candidate/2'; // acceptance/T50.spec.ts (III)
const NOMS_OPERATIONS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint']; // acceptance/T50.spec.ts (III)
function portecontratV2(racine: unknown): boolean {
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && n.valeur === MARQUEUR_CONTRAT) return true;
  }
  let trouvees = 0;
  const vusOps = new Set<string>();
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && NOMS_OPERATIONS_V2.includes(n.valeur) && !vusOps.has(n.valeur)) {
      vusOps.add(n.valeur);
      trouvees += 1;
    }
  }
  return trouvees >= 4;
}

const PERIODES = ['P1', 'P2', 'P3', 'P4'] as const;
type Periode = (typeof PERIODES)[number];

function noeudPeriode(racine: unknown, cle: Periode): Json | null {
  const cibleNorm = normKey(cle);
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && normKey(n.cle) === cibleNorm && n.valeur !== null && typeof n.valeur === 'object' && !Array.isArray(n.valeur)) {
      return n.valeur as Json;
    }
  }
  const indexAttendu = PERIODES.indexOf(cle);
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur)) {
      for (let i = 0; i < n.valeur.length; i += 1) {
        const entree = n.valeur[i];
        if (entree === null || typeof entree !== 'object') continue;
        const idTexte = champTexte(entree, ['id', 'key', 'period', 'periode', 'periodid', 'periodkey']);
        if (idTexte !== null && normKey(idTexte) === cibleNorm) return entree as Json;
      }
    }
  }
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur) && n.valeur.length === PERIODES.length) {
      const entree = n.valeur[indexAttendu];
      if (entree !== null && typeof entree === 'object' && champTexte(entree, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) {
        return entree as Json;
      }
    }
  }
  return null;
}
const NOM_AGREGAT_DES_EXPORTS = '(ensemble des exports aplatis)';
function candidatsDescription(): { nom: string; valeur: unknown }[] {
  const out: { nom: string; valeur: unknown }[] = [];
  for (const [k, v] of ORACLE.flat.entries()) {
    if (v !== null && typeof v === 'object') out.push({ nom: k, valeur: v });
  }
  out.push({ nom: NOM_AGREGAT_DES_EXPORTS, valeur: Object.fromEntries(ORACLE.flat.entries()) });
  return out;
}
function resoudreDescriptionUnifiee(): { valeur: Json; nom: string } | null {
  for (const c of candidatsDescription()) {
    if (!portecontratV2(c.valeur)) continue;
    let periodesAvecEnonce = 0;
    for (const p of PERIODES) {
      const n = noeudPeriode(c.valeur, p);
      if (n !== null && champTexte(n, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) periodesAvecEnonce += 1;
    }
    if (periodesAvecEnonce >= 2) return { valeur: c.valeur as Json, nom: c.nom };
  }
  return null;
}
function requireDescriptionUnifiee(): Json {
  const r = resoudreDescriptionUnifiee();
  exige(
    r !== null,
    'oracle-description-unifiee-resolue',
    `ORACLE-DESCRIPTION-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT} et au moins deux enonces de periode. Exports vus : ${rendu([...ORACLE.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}
function enonceDe(description: Json, p: Periode): string | null {
  const node = noeudPeriode(description, p);
  if (node === null) return null;
  return champTexte(node, ['statement', 'enonce', 'narrative', 'prose', 'text']);
}

/* ════════════════════════════════════ III — ancrages geles, detecteur
 * d'exemple d'ERREUR par operation, et section « contrat » du prompt reel. */

/** Ancrage GELE — REPRIS A L'IDENTIQUE de acceptance/T53.spec.ts (L535) :
 *  acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant
 *  (cahier_line 123). */
const ANCHOR_NOT_FOUND = 'NOT_FOUND';

/** Second locataire, REPRIS de la racine gelee F-RESERVATION — jamais une
 *  invention de cette suite : acceptance/reference/F-RESERVATION.json:
 *  valeurs.P4.faits[1].valeur (cahier_line 119) = « creation d'un locataire
 *  `other` ». */
const SECOND_TENANT = 'other';

const FIXTURE_RESERVATION = JSON.parse(fs.readFileSync(path.join(REPO, 'acceptance', 'reference', 'F-RESERVATION.json'), 'utf8')) as Json;
function valeurGelee(chemin: readonly string[]): unknown {
  let cur: unknown = FIXTURE_RESERVATION;
  for (const seg of chemin) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[seg];
  }
  return (cur as Json | undefined)?.valeur;
}
const LOCATAIRE_INITIAL = valeurGelee(['valeurs', 'locataire_initial']) as string; // F-RESERVATION.json:valeurs.locataire_initial
const ACTEURS = valeurGelee(['valeurs', 'acteurs']) as string[]; // F-RESERVATION.json:valeurs.acteurs
const FAITS_P4 = ((FIXTURE_RESERVATION.valeurs as Json | undefined)?.P4 as Json | undefined)?.faits as { valeur?: string }[] | undefined;
const FAIT_P4_SECOND_TENANT = Array.isArray(FAITS_P4) ? FAITS_P4[1]?.valeur : undefined;
exige(
  typeof LOCATAIRE_INITIAL === 'string' && Array.isArray(ACTEURS) && ACTEURS.length >= 1,
  'racine-gelee-F-RESERVATION-lisible',
  `valeurs lues : locataire=${rendu(LOCATAIRE_INITIAL)} acteurs=${rendu(ACTEURS)}`,
);
exige(
  typeof FAIT_P4_SECOND_TENANT === 'string' && FAIT_P4_SECOND_TENANT.includes(`\`${SECOND_TENANT}\``),
  'le-second-locataire-SECOND_TENANT-provient-bien-de-la-racine-gelee-F-RESERVATION',
  `vu valeurs.P4.faits[1].valeur = ${rendu(FAIT_P4_SECOND_TENANT)}, attendu qu'il nomme \`${SECOND_TENANT}\``,
);

const echapperRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `jeton` figure-t-il dans `source` comme jeton ENTIER ? Insensible a la
 *  casse — REPRIS A L'IDENTIQUE de acceptance/T56.spec.ts/T57.spec.ts. */
const contientJeton = (source: string, jeton: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_])${echapperRe(jeton)}(?![A-Za-z0-9_])`, 'iu').test(source);

/** Segments `{...}` equilibres — REPRIS A L'IDENTIQUE de T56/T57.spec.ts. */
function segmentsAccolades(texte: string): { texte: string; debut: number; fin: number }[] {
  const out: { texte: string; debut: number; fin: number }[] = [];
  let profondeur = 0;
  let debut = -1;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (c === '{') {
      if (profondeur === 0) debut = i;
      profondeur += 1;
    } else if (c === '}') {
      profondeur -= 1;
      if (profondeur === 0 && debut >= 0) {
        out.push({ texte: texte.slice(debut, i + 1), debut, fin: i + 1 });
        debut = -1;
      } else if (profondeur < 0) {
        profondeur = 0;
      }
    }
  }
  return out;
}
type EnveloppeJSON = { texte: string; debut: number; fin: number; valeur: Json | null };
function enveloppesJSON(texte: string): EnveloppeJSON[] {
  return segmentsAccolades(texte).map((s) => {
    let valeur: Json | null = null;
    try {
      valeur = JSON.parse(s.texte) as Json;
    } catch {
      valeur = null;
    }
    return { ...s, valeur };
  });
}
function argsOntLesClefs(v: Json, requis: readonly string[]): boolean {
  const args = v.args;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return requis.length === 0;
  return requis.every((a) => Object.prototype.hasOwnProperty.call(args, a));
}

/** La FORME CANONIQUE d'une valeur JSON — cles (triees) et TYPES,
 *  recursivement, jamais les valeurs elles-memes. REPRISE A L'IDENTIQUE de
 *  acceptance/T57.spec.ts (II.1) : lecture LITTERALE de l'acceptation T58.A1
 *  (« cette forme EXACTE » — forme, jamais valeur : un exemple public qui
 *  demontre la forme avec des valeurs-gabarit, comme le fait DEJA chaque
 *  exemple existant du protocole (`{"decision":"exemple"}`,
 *  `tenant-exemple`...), compte EXACTEMENT autant qu'un exemple qui
 *  reproduirait la valeur metier reelle — exiger cette derniere serait une
 *  exigence qu'aucune source n'etablit, le risque de FAUX ROUGE qu'ADR-001
 *  met en garde contre). */
function formeDe(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map((x) => formeDe(x)).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Json;
    const cles = Object.keys(o).sort();
    return `{${cles.map((k) => `${JSON.stringify(k)}:${formeDe(o[k])}`).join(',')}}`;
  }
  return typeof v;
}

type OperationV2 = { op: string; args: string[] };
/** Les TROIS operations qui peuvent produire une reponse d'erreur, observe
 *  sur le modele attendu (section IV ci-dessous) — create_tenant/
 *  advance_clock/fingerprint n'en produisent JAMAIS. */
const OPERATIONS_AVEC_ERREUR: OperationV2[] = [
  { op: 'write', args: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key'] },
  { op: 'read', args: ['tenant_id', 'key'] },
  { op: 'probe_cancel', args: ['tenant_id', 'key'] },
];

const estObjetJson = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Un exemple public requete→reponse, LIE STRUCTURELLEMENT. */
type PaireExemple = { op: string; requete: Json; reponse: Json };
/** Les paires requete→reponse du prompt, LIEES STRUCTURELLEMENT — jamais
 *  par une fenetre de proximite textuelle. Une requete est une enveloppe JSON
 *  VALIDE portant `id` (texte) et `op` (texte) ; SA reponse est l'enveloppe
 *  `{...}` equilibree IMMEDIATEMENT suivante (aucune autre enveloppe entre
 *  les deux), qui doit etre du JSON valide, porter `ok` (booleen), ne porter
 *  AUCUN `op`, et porter le MEME `id` que la requete (le protocole NDJSON de
 *  T48 lie requete et reponse par `id`, et c'est ce lien qu'un exemple
 *  montre).
 *
 *  POURQUOI (mesure reelle, gate de mutation T58.M4) : la version
 *  precedente de ce detecteur ancrait la REQUETE par `op`, puis acceptait la
 *  PREMIERE enveloppe `ok:false` trouvee dans les 600 caracteres suivants —
 *  meme si elle appartenait a l'exemple d'une AUTRE operation. Sous T58.M4
 *  (exemple d'erreur de `read` remplace par une reponse de SUCCES
 *  `{"ok":true,"result":{"decision":"NOT_FOUND"}}`, exemples de `write`/
 *  `probe_cancel` intacts), `read` « avait » encore un exemple d'erreur :
 *  celui de `probe_cancel`, sur la ligne suivante. Les quatre cas restaient
 *  VERTS. Liee par `id` et par adjacence, chaque reponse n'appartient plus
 *  qu'a SA requete. */
function pairesExemples(promptBrut: string): PaireExemple[] {
  const enveloppes = enveloppesJSON(promptBrut);
  const out: PaireExemple[] = [];
  for (let i = 0; i + 1 < enveloppes.length; i += 1) {
    const req = (enveloppes[i] as EnveloppeJSON).valeur;
    const res = (enveloppes[i + 1] as EnveloppeJSON).valeur;
    if (!estObjetJson(req) || typeof req.id !== 'string' || typeof req.op !== 'string') continue;
    if (!estObjetJson(res) || res.id !== req.id || typeof res.ok !== 'boolean') continue;
    if (Object.prototype.hasOwnProperty.call(res, 'op')) continue;
    out.push({ op: req.op, requete: req, reponse: res });
  }
  return out;
}
/** Les paires de `operation` (requete ANCREE par `op`+cles d'argument,
 *  mecanisme DEJA ACCEPTE de T56/T57). */
function pairesDeOperation(promptBrut: string, operation: OperationV2): PaireExemple[] {
  return pairesExemples(promptBrut).filter((p) => p.op === operation.op && argsOntLesClefs(p.requete, operation.args));
}

/** VRAI si le prompt montre, pour `operation`, au moins un exemple public
 *  requete→reponse (LIE par `id`, voir `pairesExemples`) ou la requete ANCRE
 *  sur `op`+cles d'argument et SA reponse est une enveloppe D'ERREUR
 *  (`"ok":false`) dont la FORME CANONIQUE (cles et types, recursivement) est
 *  EXACTEMENT `formeAttendue` — jamais une comparaison de VALEUR (voir
 *  `formeDe` ci-dessus : un exemple a valeurs-gabarit, comme chaque exemple
 *  existant du protocole, compte). Une enveloppe `ok:false` appartenant a
 *  l'exemple d'une AUTRE operation ne compte JAMAIS. */
function exempleErreurPourOperation(promptBrut: string, operation: OperationV2, formeAttendue: string): boolean {
  return pairesDeOperation(promptBrut, operation).some((p) => p.reponse.ok === false && formeDe(p.reponse) === formeAttendue);
}

/** La section « Contrat d'application bench.candidate/2 » du prompt reel,
 *  bornee par les deux ancres STABLES observees au run reel (jamais une
 *  supposition sur le format de buildCandidatePeriodPrompt, jamais lu). */
function sectionContrat(promptBrut: string): string {
  const i = promptBrut.indexOf("Contrat d'application");
  if (i < 0) return '';
  const j = promptBrut.indexOf('Convention de lancement', i);
  return j < 0 ? promptBrut.slice(i) : promptBrut.slice(i, j);
}

/** Decoupe grossiere en phrases (sur `.` suivi d'espace) — suffisant pour
 *  isoler la phrase qui decrit une regle precise au sein d'un enonce de
 *  periode qui en decrit plusieurs (section II.4 de l'en-tete). */
function phrases(texte: string): string[] {
  return texte.split(/(?<=\.)\s+/u).filter((s) => s.trim().length > 0);
}

/* ════════════════════ IV — observation DIRECTE du « modele attendu »
 * (acceptance/fixtures/candidates/reservation-candidate-v2.mjs) : la reponse
 * d'erreur REELLE qu'il produit pour write/read/probe_cancel depuis
 * SECOND_TENANT — jamais une relecture de son code comme une implementation. */

function appellerCandidatDirectement(cheminCandidat: string, requetes: Json[]): Map<string, Json> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 't58-direct-candidat-'));
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

/** Batterie d'ERREUR (section II.2 de l'en-tete) : cree LOCATAIRE_INITIAL
 *  comme proprietaire, puis exerce `write`/`read`/`probe_cancel` depuis
 *  SECOND_TENANT (jamais le proprietaire) — arguments issus de la racine
 *  gelee F-RESERVATION, JAMAIS inventes. */
function batterieErreurs(): { id: string; op: string; args: Json }[] {
  const [acteurA] = ACTEURS;
  return [
    { id: 'e1', op: 'create_tenant', args: { tenant_id: LOCATAIRE_INITIAL } },
    { id: 'e2', op: 'write', args: { op: 'reserve', actor: acteurA, tenant_id: SECOND_TENANT, admission_seq: 1, operation_key: 't58-a1-k-err' } },
    { id: 'e3', op: 'read', args: { tenant_id: SECOND_TENANT, key: acteurA } },
    { id: 'e4', op: 'probe_cancel', args: { tenant_id: SECOND_TENANT, key: acteurA } },
    // Lecture de SUCCES depuis le PROPRIETAIRE (aucune reservation) : fixe
    // les cles REELLES du `result` d'une lecture reussie, pour verifier
    // qu'aucun exemple public de `read` ne montre un refus sous la forme
    // d'une decision (T58.M4).
    { id: 'e5', op: 'read', args: { tenant_id: LOCATAIRE_INITIAL, key: acteurA } },
  ];
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T58 — montrer au candidat les reponses d erreur et le sens de la cle de lecture', () => {
  test(
    'T58.A1 pour chaque operation qui peut echouer, un exemple public montre sa reponse d erreur sous la forme exacte ok:false/error.code (ADR-015)',
    () => {
      const reponses = appellerCandidatDirectement(REFERENCE_V2, batterieErreurs());
      const parOp: Record<string, Json | undefined> = { write: reponses.get('e2'), read: reponses.get('e3'), probe_cancel: reponses.get('e4') };
      // Garde de sanite SUR CETTE SUITE ELLE-MEME : le modele attendu doit
      // REELLEMENT produire une reponse d'erreur NOT_FOUND pour les trois
      // operations, sans quoi la comparaison qui suit ne prouverait rien.
      const formesErreurObservees = new Map<string, string>();
      for (const op of OPERATIONS_AVEC_ERREUR) {
        const r = parOp[op.op];
        const err = (r as Json | undefined)?.error as Json | undefined;
        exige(
          r !== undefined && r.ok === false && err !== undefined && Object.values(err).includes(ANCHOR_NOT_FOUND),
          `le-modele-attendu-produit-reellement-une-reponse-d-erreur-${op.op}`,
          `vu ${rendu(r)} pour ${op.op} depuis SECOND_TENANT=${rendu(SECOND_TENANT)}`,
        );
        formesErreurObservees.set(op.op, formeDe(r as Json));
      }
      const lectureReussie = reponses.get('e5');
      exige(
        lectureReussie !== undefined && lectureReussie.ok === true && estObjetJson(lectureReussie.result) && !Object.prototype.hasOwnProperty.call(lectureReussie, 'error'),
        'le-modele-attendu-produit-reellement-une-lecture-reussie-depuis-le-proprietaire',
        `vu ${rendu(lectureReussie)} pour read depuis LOCATAIRE_INITIAL=${rendu(LOCATAIRE_INITIAL)}`,
      );
      const clesResultatLecture = new Set(Object.keys((lectureReussie as Json).result as Json));

      const ctx = nouveauContexte('a1');
      const plan = nouveauPlanDeRecord('a1');
      const env = envEcritureConstante({
        relPath: ENTREE_CANDIDATE,
        content: CONTENU_CANDIDAT_CORRECT,
        recordPlanDir: plan.dir,
        recordPlanCounterFile: plan.counterFile,
      });
      const run = conduire(ctx, MANIFEST_DEUX_PERIODES, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A1)', run));
      exige(periodsPersistedDe(run.resultat) === 2, 'deux-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      const prompts: string[] = [promptBrutPlanN(plan.dir, 0), promptBrutPlanN(plan.dir, 1)];
      exige(prompts[0]!.length > 0, 'prompt-reel-periode-1-capture', `AUCUN prompt capture a ${plan.dir}/record-0.json`);
      exige(prompts[1]!.length > 0, 'prompt-reel-periode-2-capture', `AUCUN prompt capture a ${plan.dir}/record-1.json`);

      const manquants: string[] = [];
      for (const op of OPERATIONS_AVEC_ERREUR) {
        const formeAttendue = formesErreurObservees.get(op.op) as string;
        const trouve = prompts.some((p) => exempleErreurPourOperation(p, op, formeAttendue));
        if (!trouve) manquants.push(`${op.op}(forme attendue ${formeAttendue})`);
      }
      exige(
        manquants.length === 0,
        'chaque-operation-qui-peut-echouer-a-un-exemple-public-de-sa-reponse-d-erreur-exacte',
        `OPERATION(S) SANS EXEMPLE D'ERREUR PUBLIC : ${rendu(manquants)} — prompts observes : ${rendu(prompts.map((p) => court(p, 1200)))}`,
      );

      // T58.M4, observe DIRECTEMENT : l'exemple d'erreur de `read` (la
      // reponse LIEE par `id` a une requete `read`) est une enveloppe
      // `ok:false` qui porte `error.code` (texte) et AUCUN `result`.
      const OP_READ = OPERATIONS_AVEC_ERREUR.find((o) => o.op === 'read') as OperationV2;
      const pairesRead = prompts.flatMap((p) => pairesDeOperation(p, OP_READ));
      const erreursRead = pairesRead.filter((p) => p.reponse.ok === false);
      const erreursReadBienFormees = erreursRead.filter(
        (p) =>
          estObjetJson(p.reponse.error) &&
          typeof p.reponse.error.code === 'string' &&
          !Object.prototype.hasOwnProperty.call(p.reponse, 'result'),
      );
      exige(
        erreursReadBienFormees.length >= 1,
        'l-exemple-d-erreur-de-read-a-ok-false-un-champ-error-code-et-aucun-result',
        `exemples de read lies par id : ${rendu(pairesRead.map((p) => `${JSON.stringify(p.requete)} -> ${JSON.stringify(p.reponse)}`))}`,
      );
      // ... et aucun exemple de `read` ne montre un refus sous la forme d'une
      // DECISION : toute reponse `ok:true` d'un exemple de `read` n'emploie
      // que les cles de `result` qu'une lecture REUSSIE du modele attendu
      // produit reellement (e5) — jamais `{"decision":...}`.
      const lecturesHorsForme = pairesRead.filter(
        (p) => p.reponse.ok === true && (!estObjetJson(p.reponse.result) || Object.keys(p.reponse.result).some((k) => !clesResultatLecture.has(k))),
      );
      exige(
        lecturesHorsForme.length === 0,
        'aucun-exemple-de-read-ne-montre-un-refus-sous-forme-de-decision',
        `cles de result d'une lecture reussie (modele attendu) : ${rendu([...clesResultatLecture])} ; exemples de read hors forme : ${rendu(lecturesHorsForme.map((p) => `${JSON.stringify(p.requete)} -> ${JSON.stringify(p.reponse)}`))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T58.A2 l enonce de la periode qui enonce une regle produisant une erreur la decrit comme une reponse d erreur (champ error.code), sans le mot verdict ni le champ decision (ADR-015)",
    () => {
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();

      const periodesAvecErreur: Periode[] = [];
      for (const p of PERIODES) {
        const enonce = enonceDe(description, p);
        if (enonce !== null && contientJeton(enonce, ANCHOR_NOT_FOUND)) periodesAvecErreur.push(p);
      }
      // Garde de sanite : au moins une periode doit reellement enoncer la
      // regle d'isolation (sans quoi ce cas n'observerait rien).
      exige(
        periodesAvecErreur.length >= 1,
        'au-moins-une-periode-enonce-la-regle-produisant-NOT_FOUND',
        `aucune periode ne mentionne ${rendu(ANCHOR_NOT_FOUND)} dans son enonce — ${rendu(PERIODES.map((p) => [p, enonceDe(description, p)]))}`,
      );

      const manquantsErreur: string[] = [];
      const motsInterditsTrouves: string[] = [];
      for (const p of periodesAvecErreur) {
        const enonce = enonceDe(description, p) as string;
        const phraseRegle = phrases(enonce).find((ph) => contientJeton(ph, ANCHOR_NOT_FOUND));
        exige(
          phraseRegle !== undefined,
          `la-phrase-qui-enonce-NOT_FOUND-est-isolable-a-${p}`,
          `DECOUPAGE EN PHRASES SANS CELLE QUI CONTIENT ${rendu(ANCHOR_NOT_FOUND)} : ${rendu(phrases(enonce))}`,
        );
        const ph = phraseRegle as string;
        // Decrite comme une reponse d'erreur dont `error.code` porte la
        // valeur : les tokens 'error'/'erreur' ET la notation `error.code`
        // (backticks/guillemets tolyeres entre les deux) doivent y figurer.
        const decriteCommeErreur = (contientJeton(ph, 'erreur') || contientJeton(ph, 'error')) && /error[`'".\s]*\.[`'".\s]*code/iu.test(ph);
        if (!decriteCommeErreur) manquantsErreur.push(`${p}: ${court(ph, 300)}`);
        if (contientJeton(ph, 'verdict')) motsInterditsTrouves.push(`${p}:verdict`);
        if (contientJeton(ph, 'decision')) motsInterditsTrouves.push(`${p}:decision`);
      }

      exige(
        manquantsErreur.length === 0,
        'la-phrase-qui-enonce-NOT_FOUND-la-decrit-comme-une-reponse-d-erreur-portee-par-error.code',
        `PHRASE(S) NE DECRIVANT PAS NOT_FOUND COMME UNE REPONSE D'ERREUR (champ error.code) : ${rendu(manquantsErreur)}`,
      );
      exige(
        motsInterditsTrouves.length === 0,
        "la-phrase-qui-enonce-NOT_FOUND-n-emploie-ni-verdict-ni-le-champ-decision",
        `MOT/CHAMP INTERDIT TROUVE DANS LA PHRASE QUI ENONCE NOT_FOUND : ${rendu(motsInterditsTrouves)} — c'est EXACTEMENT l'incident reel d'ADR-015 (« Sonnet a repondu {"decision":"NOT_FOUND"} — une lecture raisonnable du mot "verdict" »)`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T58.A3 le contrat et l enonce de chaque periode disent que l argument key de read est l identifiant de l acteur (ADR-015)',
    () => {
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();

      const manquantsEnonce: Periode[] = [];
      for (const p of PERIODES) {
        const enonce = enonceDe(description, p);
        if (enonce === null) {
          manquantsEnonce.push(p);
          continue;
        }
        if (!(contientJeton(enonce, 'key') && contientJeton(enonce, 'identifiant') && contientJeton(enonce, 'acteur'))) {
          manquantsEnonce.push(p);
        }
      }
      exige(
        manquantsEnonce.length === 0,
        "l-enonce-de-chaque-periode-dit-que-l-argument-key-de-read-est-l-identifiant-de-l-acteur",
        `PERIODE(S) DONT L'ENONCE NE LE DIT PAS : ${rendu(manquantsEnonce)} — c'est EXACTEMENT l'incident reel d'ADR-015 (« Haiku l'a lu comme la cle d'operation »)`,
      );

      const ctx = nouveauContexte('a3');
      const plan = nouveauPlanDeRecord('a3');
      const env = envEcritureConstante({
        relPath: ENTREE_CANDIDATE,
        content: CONTENU_CANDIDAT_CORRECT,
        recordPlanDir: plan.dir,
        recordPlanCounterFile: plan.counterFile,
      });
      const run = conduire(ctx, MANIFEST_DEUX_PERIODES, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A3)', run));

      const prompt0 = promptBrutPlanN(plan.dir, 0);
      exige(prompt0.length > 0, 'prompt-reel-periode-1-capture', `AUCUN prompt capture a ${plan.dir}/record-0.json`);

      const contrat = sectionContrat(prompt0);
      exige(contrat.length > 0, 'section-contrat-trouvee-dans-le-prompt-reel', `section "Contrat d'application" introuvable dans ${court(prompt0, 1500)}`);
      exige(
        contientJeton(contrat, 'key') && contientJeton(contrat, 'identifiant') && contientJeton(contrat, 'acteur'),
        "le-contrat-dit-que-l-argument-key-de-read-est-l-identifiant-de-l-acteur",
        `SECTION CONTRAT SANS LA REGLE : ${court(contrat, 1500)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T58.A4 un candidat de reference derive du seul prompt recu (erreurs comprises) satisfait chaque controle du a chaque periode, isolation@1 compris (ADR-015)',
    () => {
      const ctx = nouveauContexte('a4');
      const deriveLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 't58-a4-derive-log-'));
      WORKSPACES_CREES.push(deriveLogDir);
      const env = envCandidatDerivePar(MODULE_DERIVATION_T58, { deriveLogDir });

      const run = conduire(ctx, MANIFEST_QUATRE_PERIODES, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A4)', run));
      exige(periodsPersistedDe(run.resultat) === 4, 'quatre-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      // Preuve que la derivation a REELLEMENT inspecte le prompt de P4 (periode
      // ou isolation@1 devient du) pour decider de la FORME de la reponse
      // d'isolation : le journal doit porter `params.isolation.enoncee`.
      const log4 = (() => {
        const f = path.join(deriveLogDir, 'derived-3.json'); // periode 4 = index 3 (0-based)
        if (!fs.existsSync(f)) return null;
        try {
          return JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
        } catch {
          return null;
        }
      })();
      exige(log4 !== null, 'derivation-journalisee-periode-4', `AUCUN journal a ${deriveLogDir}/derived-3.json`);
      const isolationP4 = ((log4 as Json).params as Json | undefined)?.isolation as Json | undefined;
      exige(
        isolationP4 !== undefined && isolationP4.enoncee === true,
        'la-derivation-reelle-p4-detecte-bien-que-l-isolation-est-enoncee',
        `vu ${rendu(isolationP4)} — prompt ${rendu(court(String((log4 as Json).prompt ?? ''), 1500))}`,
      );
      // La derivation est PAR OPERATION (jamais globale au prompt entier) :
      // isolation@1 porte specifiquement sur `read` (ADR-015 : « pour une
      // LECTURE faite depuis un autre locataire »), et l'exemple d'erreur
      // qui le satisfait doit donc etre montre pour `read` SPECIFIQUEMENT.
      const parOperationP4 = isolationP4?.parOperation as Json | undefined;
      exige(
        parOperationP4 !== undefined && typeof parOperationP4.read === 'boolean',
        'la-derivation-reelle-p4-journalise-la-detection-par-operation',
        `vu ${rendu(parOperationP4)} dans ${rendu(isolationP4)}`,
      );

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
        `PERIODE(S) EN ECHEC : ${rendu(echecsParPeriode)} — isolation@1 du a compter de P4 ; cet echec est EXACTEMENT celui qu'ADR-015 documente (reponse d'isolation rendue comme une decision, jamais comme une erreur) tant qu'aucun exemple public de reponse d'erreur n'existe`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
