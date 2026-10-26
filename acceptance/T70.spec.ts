/**
 * acceptance/T70.spec.ts — suite d'acceptation de la tache T70.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T70.A1 behaviour — chaque clause de la source F-PLATFORM porte un
 *                      identifiant, une periode d'entree, une periode de
 *                      sortie eventuelle, la clause qu'elle remplace
 *                      eventuellement, son texte d'enonce, son fragment de
 *                      contrat et sa mise en oeuvre dans le modele attendu
 *   T70.A2 behaviour — le modele attendu rejoue sur la trajectoire principale
 *                      de P1 a P8 reproduit chaque fait gele
 *   T70.A3 refusal   — deux clauses actives a une meme periode ne gouvernent
 *                      jamais la meme decision sauf remplacement explicite ;
 *                      une source ou deux clauses le font est refusee en
 *                      nommant les deux clauses
 *   T70.A4 refusal   — chaque grandeur comparee a son unite et son format
 *                      declares dans une clause active ; une source ou une
 *                      grandeur comparee n'en a pas est refusee en nommant la
 *                      grandeur
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 * T70 est une tache d'extension (verification/tasks.extensions.json), dont le
 * `spec_source` epingle ADR-021 L166-172 (docs/specs/T70.md). L'auteur de
 * cette suite est AVEUGLE aux `source_paths` de T70 (`packages/scenario`,
 * `packages/oracle`) : il ne les a lus ni directement ni par `git show`
 * (ADR-001, aveuglement procedural). Le contrat ci-dessous derive :
 *   - d'ADR-021 decision 1 (L29-52) : « chaque clause a un identifiant, une
 *     periode d'entree, eventuellement une periode de sortie et la clause
 *     qu'elle remplace, son texte exact pour l'enonce, le fragment de contrat
 *     qu'elle introduit (operations, champs, valeurs, codes d'erreur,
 *     exemples) et sa mise en oeuvre dans le modele attendu » ; les trois
 *     proprietes « completude », « non-contradiction », « unites et formats » ;
 *   - du tableau des 24 periodes (L54-79), lignes P1 a P8 (L61-68) ;
 *   - de la racine gelee acceptance/reference-platform/F-PLATFORM-P1-P8.json,
 *     ecrite par le fixture-transcriber de T70 AVANT cette suite : elle fixe
 *     les regles precises de P1 a P8, la trajectoire principale (operations
 *     avec horloge) et 138 faits calcules a la main puis recalcules.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 * Toute valeur ATTENDUE comparee par A2 est lue dans la racine gelee ; cette
 * suite n'en tape aucune. Les seuls litteraux propres a la suite sont des
 * identifiants de construction (clauses et grandeurs fabriquees par A3/A4,
 * suffixees `T70` pour ne pouvoir collisionner avec rien de reel) et les
 * alias de nommage ci-dessous. Aucune valeur n'a ete obtenue en executant une
 * implementation de T70 : au moment de l'ecriture, la source de clauses
 * n'existe pas.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET D'APPEL — FIXE ICI (ADR-021 ne fixe pas la forme du
 * module). Les paquets sont charges par leur specificateur (`@bench/scenario`
 * puis `@bench/oracle`), que jest.config.mjs mappe vers `packages/<p>/src`,
 * jamais vers un `dist/`. Chaque role se resout par le premier alias exporte
 * (comparaison exacte, puis insensible a la casse) dans l'un des deux paquets.
 *
 *   SOURCE (role `platformClauses`) — la source unique de clauses. Valeur
 *     exportee : un TABLEAU de clauses, ou une fonction (eventuellement
 *     asynchrone, sans argument) qui le rend, ou un objet qui le porte sous
 *     `clauses`. Alias : F_PLATFORM_CLAUSES, PLATFORM_CLAUSES, platformClauses,
 *     fPlatformClauses, getPlatformClauses, loadPlatformClauses,
 *     F_PLATFORM_SOURCE, platformSource, platformClauseSource.
 *
 *   CLAUSE — objet simple (les champs sont copies par etalement `{...c}`) :
 *     id             (alias clause_id, clauseId) — chaine non vide, unique ;
 *     periode d'entree (enters, entry, entry_period, entryPeriod, from, since,
 *                    introduced_in, introducedIn, periode_entree) — 'P1'..'P24'
 *                    ou entier 1..24 ;
 *     periode de sortie (exits, exit, exit_period, exitPeriod, until,
 *                    retired_in, retiredIn, periode_sortie) — absente/null, ou
 *                    PREMIERE periode ou la clause n'est plus active
 *                    (activite = [entree, sortie[ ), strictement apres l'entree ;
 *     remplacement  (replaces, supersedes, remplace) — absent/null, un id ou un
 *                    tableau d'ids ; la clause remplacee existe, entre avant,
 *                    et n'est plus active a l'entree de la remplacante ;
 *     texte d'enonce (text, statement, enonce, texte) — chaine non vide ;
 *     fragment de contrat (contract, contract_fragment, contractFragment,
 *                    fragment, contrat) — objet non vide ; son rendu JSON
 *                    nomme les operations et codes d'erreur que la clause
 *                    introduit (A1 le controle contre la trajectoire gelee) ;
 *     mise en oeuvre (implementation, impl, apply, mise_en_oeuvre,
 *                    miseEnOeuvre) — fonction, ou objet portant au moins une
 *                    fonction (profondeur <= 3) ;
 *     decisions gouvernees (governs, decisions, decides, gouverne) — chaine ou
 *                    tableau de chaines, sur la clause ou dans son contrat ;
 *     grandeurs comparees (compares, compared, compared_quantities,
 *                    comparedQuantities, grandeurs_comparees) — tableau de
 *                    noms (ou d'objets {name}), sur la clause ou dans son
 *                    contrat ;
 *     declarations d'unites (quantities, units, grandeurs, declared_quantities,
 *                    declaredQuantities) — sur la clause ou dans son contrat :
 *                    soit un objet { nom: { unit, format } }, soit un tableau
 *                    de { name, unit, format } (alias unite pour unit).
 *
 *   MODELE ATTENDU (A2) — role `replayPlatform` : fonction (steps) -> reponses,
 *     reponses = tableau aligne sur steps, ou objet indexe par `id` d'etape,
 *     ou objet { responses: ... } ; alias replayPlatform, replayFPlatform,
 *     replayPlatformTrajectory, runPlatformTrajectory, playPlatform,
 *     runFPlatform. A DEFAUT, role `createPlatformModel` : fabrique sans
 *     argument d'un objet portant apply|execute|handle|dispatch|step|run
 *     (step) -> reponse ; alias createPlatformModel, createFPlatformModel,
 *     createPlatformOracle, createExpectedPlatformModel. Chaque etape est
 *     passee telle que la racine gelee l'ecrit : { id, period, at, op,
 *     tenant?, actor?, args }, dans l'ordre P1 -> P8, sur UN SEUL etat.
 *     Reponse : { ok: true, ... } ou { ok: false, error: CODE }.
 *
 *   NON-CONTRADICTION (A3) — role `checkNonContradiction` : fonction
 *     (clauses) -> verdict ; alias checkNonContradiction,
 *     verifyNonContradiction, checkContradictions, findContradictions,
 *     checkClauseContradictions, validateNonContradiction.
 *   UNITES (A4) — role `checkUnits` : fonction (clauses) -> verdict ; alias
 *     checkUnits, verifyUnits, checkUnitsAndFormats, verifyUnitsAndFormats,
 *     checkQuantityUnits, validateUnits.
 *   VERDICT — un REFUS est : une exception levee ; ou `false` ; ou un tableau
 *     non vide ; ou un objet avec ok|valid|passed|success === false, ou un
 *     tableau non vide sous violations|errors|problems|contradictions|issues|
 *     findings|conflicts. Tout le reste (undefined, true, [], objet sans echec)
 *     est un PASSAGE. Le refus « nomme » un identifiant si le rendu du verdict
 *     (message et contenu) contient cet identifiant comme mot entier.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS QUE CETTE SUITE FERME
 *
 *  (1) Un verificateur qui refuse tout : A3 et A4 exigent que la source REELLE
 *      passe, et chacun ajoute une construction LEGITIME qui doit passer
 *      (A3 : meme decision a des periodes disjointes ; A4 : grandeur comparee
 *      et declaree dans la meme clause).
 *  (2) Un verificateur qui reconnait la construction de la suite par son nom :
 *      A3 refuse aussi une greffe entre deux clauses REELLES (aucun nom
 *      fabrique), A4 aussi le retrait de l'unite d'une grandeur REELLE.
 *  (3) Un verificateur d'unites qui ne regarde pas la periode : A4 refuse une
 *      grandeur comparee des l'entree d'une clause mais declaree seulement par
 *      une clause qui entre plus tard.
 *  (4) Un replay creux : A2 exige une reponse objet pour CHAQUE etape et
 *      compare CHAQUE fait gele (138), pas un echantillon.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 120_000;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;
type Fonction = (...a: unknown[]) => unknown;

/* ────────────────────────────────────────────────────────────────── socle */

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
const PACKAGES = ['scenario', 'oracle'] as const;

function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 14) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) {
    const extra = Object.keys(v).length > 0 ? ` ${rendu({ ...(v as unknown as Json) }, profondeur + 1, vus)}` : '';
    return `${v.name}: ${v.message}${extra}`;
  }
  if (v instanceof Map) {
    return `Map{${[...v.entries()]
      .map(([k, x]) => `${rendu(k, profondeur + 1, vus)}:${rendu(x, profondeur + 1, vus)}`)
      .join(',')}}`;
  }
  if (v instanceof Set) return `Set[${[...v].map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `mot` apparait-il dans `texte` comme mot entier (ni precede ni suivi de [A-Za-z0-9_@.-]) ? */
function nomme(texte: string, mot: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_@.-])${echapper(mot)}(?![A-Za-z0-9_@-]|\\.[A-Za-z0-9_])`).test(texte);
}

/* ───────────────────────── racine gelee acceptance/reference-platform */

const REFERENCE_PLATFORM = path.join(REPO, 'acceptance', 'reference-platform', 'F-PLATFORM-P1-P8.json');
const PLATFORM = JSON.parse(fs.readFileSync(REFERENCE_PLATFORM, 'utf8')) as Json;
const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] as const;

interface Etape {
  id: string;
  period: string;
  at: string;
  op: string;
  tenant?: string;
  actor?: string;
  args: Json;
}
interface Fait {
  id: string;
  etape: string;
  attendu: Json;
}

function periodeRef(p: string): Json {
  const periodes = PLATFORM.periodes as Json | undefined;
  const e = periodes?.[p];
  if (e === null || e === undefined || typeof e !== 'object') {
    throw new Error(`REFERENCE-PERIODE-ABSENTE ${p}`);
  }
  return e as Json;
}
const TRAJECTOIRE: Etape[] = PERIODES.flatMap((p) => periodeRef(p).trajectoire as Etape[]);
const FAITS: Array<Fait & { periode: string }> = PERIODES.flatMap((p) =>
  (periodeRef(p).faits as Fait[]).map((f) => ({ ...f, periode: p })),
);
const NOMBRE_DE_FAITS = Number(
  ((PLATFORM.scellement as Json).comptes as Json).total_faits,
);

/* ─────────────────────────────────────────── chargement des paquets */

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

function specifiersFor(pkg: string): string[] {
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

async function loadPackages(): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  for (const pkg of PACKAGES) {
    let charge = false;
    for (const s of specifiersFor(pkg)) {
      if (charge) break;
      try {
        const mod = (await import(s)) as Ns;
        flatten(mod, flat);
        exportCount += Object.keys(mod).filter((k) => k !== '__esModule').length;
        via.push(s.replace(pathToFileURL(REPO).href, '<repo>'));
        charge = true;
      } catch (e) {
        attempts.push(`import(${s}) -> ${(e as Error).message.split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet ${pkg} : aucun specificateur n'a repondu`);
  }
  return { ok: via.length > 0, via, exportCount, flat, attempts };
}

let LOADED: Loaded = {
  ok: false,
  via: [],
  exportCount: 0,
  flat: new Map(),
  attempts: ['beforeAll non execute'],
};

beforeAll(async () => {
  // Le chargement ne LEVE pas : un import casse produirait « Test suite failed
  // to run » (SUITE_FAILED_TO_RUN, refuse comme preuve). Chaque cas asserte
  // lui-meme le chargement : le rouge reste ASSERTION_FAILED.
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `PAQUET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ───────────────────────────────────────────── resolution des roles */

const ROLES: Record<string, readonly string[]> = {
  platformClauses: [
    'F_PLATFORM_CLAUSES',
    'PLATFORM_CLAUSES',
    'platformClauses',
    'fPlatformClauses',
    'getPlatformClauses',
    'loadPlatformClauses',
    'F_PLATFORM_SOURCE',
    'platformSource',
    'platformClauseSource',
  ],
  replayPlatform: [
    'replayPlatform',
    'replayFPlatform',
    'replayPlatformTrajectory',
    'runPlatformTrajectory',
    'playPlatform',
    'runFPlatform',
  ],
  createPlatformModel: [
    'createPlatformModel',
    'createFPlatformModel',
    'createPlatformOracle',
    'createExpectedPlatformModel',
  ],
  checkNonContradiction: [
    'checkNonContradiction',
    'verifyNonContradiction',
    'checkContradictions',
    'findContradictions',
    'checkClauseContradictions',
    'validateNonContradiction',
  ],
  checkUnits: [
    'checkUnits',
    'verifyUnits',
    'checkUnitsAndFormats',
    'verifyUnitsAndFormats',
    'checkQuantityUnits',
    'validateUnits',
  ],
};

function resolveValeur(role: string): unknown {
  const candidats = ROLES[role] ?? [];
  for (const c of candidats) {
    if (LOADED.flat.has(c) && LOADED.flat.get(c) !== undefined) return LOADED.flat.get(c);
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of LOADED.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  for (const c of candidats) {
    const v = lower.get(c.toLowerCase());
    if (v !== undefined) return v;
  }
  return undefined;
}

function resolveFonction(role: string): Fonction | null {
  const v = resolveValeur(role);
  return typeof v === 'function' ? (v as Fonction) : null;
}

function contratManquant(role: string): string {
  return (
    `CONTRAT-NON-SATISFAIT role=${role} : aucun export parmi [${(ROLES[role] ?? []).join('|')}] ` +
    `(${String(LOADED.exportCount)} exports observes dans ${LOADED.via.join(', ') || 'aucun paquet'})`
  );
}

function assertFonction(role: string): Fonction {
  const f = resolveFonction(role);
  expect(f === null ? contratManquant(role) : 'contrat-resolu').toBe('contrat-resolu');
  return f as Fonction;
}

/* ───────────────────────────────────────────── lecture des clauses */

type Clause = Json;

const A_ID = ['id', 'clause_id', 'clauseId'];
const A_ENTREE = ['enters', 'entry', 'entry_period', 'entryPeriod', 'from', 'since', 'introduced_in', 'introducedIn', 'periode_entree'];
const A_SORTIE = ['exits', 'exit', 'exit_period', 'exitPeriod', 'until', 'retired_in', 'retiredIn', 'periode_sortie'];
const A_REMPLACE = ['replaces', 'supersedes', 'remplace'];
const A_TEXTE = ['text', 'statement', 'enonce', 'texte'];
const A_CONTRAT = ['contract', 'contract_fragment', 'contractFragment', 'fragment', 'contrat'];
const A_IMPL = ['implementation', 'impl', 'apply', 'mise_en_oeuvre', 'miseEnOeuvre'];
const A_GOUVERNE = ['governs', 'decisions', 'decides', 'gouverne'];
const A_COMPARE = ['compares', 'compared', 'compared_quantities', 'comparedQuantities', 'grandeurs_comparees'];
const A_DECL = ['quantities', 'units', 'grandeurs', 'declared_quantities', 'declaredQuantities'];
const A_UNITE = ['unit', 'unite'];
const A_FORMAT = ['format'];

function cle(o: unknown, alias: readonly string[]): string | undefined {
  if (o === null || typeof o !== 'object') return undefined;
  for (const a of alias) if (a in (o as Json) && (o as Json)[a] !== undefined) return a;
  return undefined;
}
function lire(o: unknown, alias: readonly string[]): unknown {
  const k = cle(o, alias);
  return k === undefined ? undefined : (o as Json)[k];
}

function idDe(c: Clause): string {
  const v = lire(c, A_ID);
  return typeof v === 'string' ? v : `<id-illisible:${rendu(v)}>`;
}
function contratDe(c: Clause): unknown {
  return lire(c, A_CONTRAT);
}

/** Emplacement d'un champ : sur la clause, sinon dans son contrat. */
interface Place {
  ou: 'clause' | 'contrat';
  cle: string;
  valeur: unknown;
}
function placer(c: Clause, alias: readonly string[]): Place | undefined {
  const k = cle(c, alias);
  if (k !== undefined) return { ou: 'clause', cle: k, valeur: c[k] };
  const ct = contratDe(c);
  const k2 = cle(ct, alias);
  if (k2 !== undefined) return { ou: 'contrat', cle: k2, valeur: (ct as Json)[k2] };
  return undefined;
}

function numeroPeriode(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const m = /^[Pp]?(\d{1,2})$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
}
/** Meme representation que `modele` (chaine 'Pn' ou entier). */
function periodeComme(modele: unknown, n: number): unknown {
  if (typeof modele === 'number') return n;
  if (typeof modele === 'string' && /^p/.test(modele)) return `p${n}`;
  return `P${n}`;
}

function entreeDe(c: Clause): number | null {
  return numeroPeriode(lire(c, A_ENTREE));
}
function sortieDe(c: Clause): number | null {
  const v = lire(c, A_SORTIE);
  return v === null || v === undefined ? null : numeroPeriode(v);
}
function remplaceDe(c: Clause): string[] {
  const v = lire(c, A_REMPLACE);
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.map(String);
  return [`<remplacement-illisible:${rendu(v)}>`];
}
function active(c: Clause, n: number): boolean {
  const e = entreeDe(c);
  if (e === null) return false;
  const s = sortieDe(c);
  return e <= n && (s === null || n < s);
}

function chaines(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x !== null ? (x as Json).name ?? (x as Json).id : x))
      .filter((x): x is string => typeof x === 'string');
  }
  return [];
}
function gouverneDe(c: Clause): string[] {
  return chaines(placer(c, A_GOUVERNE)?.valeur);
}
function comparesDe(c: Clause): string[] {
  return chaines(placer(c, A_COMPARE)?.valeur);
}
/** Declarations d'unites d'une clause : nom -> declaration (objet). */
function declarationsDe(c: Clause): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const v = placer(c, A_DECL)?.valeur;
  if (Array.isArray(v)) {
    for (const d of v) {
      if (d !== null && typeof d === 'object') {
        const n = (d as Json).name ?? (d as Json).id ?? (d as Json).nom;
        if (typeof n === 'string') out.set(n, d);
      }
    }
  } else if (v !== null && typeof v === 'object') {
    for (const [n, d] of Object.entries(v as Json)) out.set(n, d);
  }
  return out;
}
function declarationComplete(d: unknown): boolean {
  const u = lire(d, A_UNITE);
  const f = lire(d, A_FORMAT);
  return typeof u === 'string' && u.trim().length > 0 && typeof f === 'string' && f.trim().length > 0;
}

function porteUneFonction(v: unknown, profondeur = 0): boolean {
  if (typeof v === 'function') return true;
  if (profondeur >= 3 || v === null || typeof v !== 'object') return false;
  return Object.values(v as Json).some((x) => porteUneFonction(x, profondeur + 1));
}

function renduContrat(c: Clause): string {
  return rendu(contratDe(c));
}

let SOURCE_CACHE: { clauses: Clause[]; diagnostic: string } | undefined;

async function lireSource(): Promise<{ clauses: Clause[]; diagnostic: string }> {
  if (SOURCE_CACHE !== undefined) return SOURCE_CACHE;
  let v = resolveValeur('platformClauses');
  if (v === undefined) {
    SOURCE_CACHE = { clauses: [], diagnostic: contratManquant('platformClauses') };
    return SOURCE_CACHE;
  }
  try {
    if (typeof v === 'function') v = await Promise.resolve((v as Fonction)());
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as Json).clauses)) {
      v = (v as Json).clauses;
    }
  } catch (e) {
    SOURCE_CACHE = { clauses: [], diagnostic: `SOURCE-LEVE ${rendu(e)}` };
    return SOURCE_CACHE;
  }
  if (!Array.isArray(v) || v.length === 0 || !v.every((c) => c !== null && typeof c === 'object')) {
    SOURCE_CACHE = { clauses: [], diagnostic: `SOURCE-PAS-UN-TABLEAU-DE-CLAUSES ${court(rendu(v), 300)}` };
    return SOURCE_CACHE;
  }
  SOURCE_CACHE = { clauses: v as Clause[], diagnostic: 'ok' };
  return SOURCE_CACHE;
}

async function assertSource(): Promise<Clause[]> {
  const s = await lireSource();
  expect(s.diagnostic === 'ok' ? 'source-lue' : s.diagnostic).toBe('source-lue');
  return s.clauses;
}

/* ───────────────────────────────────────────── verdicts des verificateurs */

interface Verdict {
  refus: boolean;
  texte: string;
}

const CLES_ECHEC = ['ok', 'valid', 'passed', 'success'];
const CLES_VIOLATIONS = ['violations', 'errors', 'problems', 'contradictions', 'issues', 'findings', 'conflicts'];

async function juger(f: Fonction, clauses: Clause[]): Promise<Verdict> {
  let r: unknown;
  try {
    r = await Promise.resolve(f(clauses));
  } catch (e) {
    return { refus: true, texte: `${(e as Error)?.message ?? ''} ${rendu(e)}` };
  }
  const texte = rendu(r);
  if (r === false) return { refus: true, texte };
  if (Array.isArray(r)) return { refus: r.length > 0, texte };
  if (r !== null && typeof r === 'object') {
    const o = r as Json;
    if (CLES_ECHEC.some((k) => o[k] === false)) return { refus: true, texte };
    if (CLES_VIOLATIONS.some((k) => Array.isArray(o[k]) && (o[k] as unknown[]).length > 0)) {
      return { refus: true, texte };
    }
  }
  return { refus: false, texte };
}

function attendrePassage(v: Verdict, quoi: string): void {
  expect(v.refus ? `REFUS-A-TORT ${quoi} : ${court(v.texte)}` : 'passe').toBe('passe');
}
function attendreRefusNommant(v: Verdict, noms: string[], quoi: string): void {
  expect(v.refus ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(v.texte)}`).toBe('refuse');
  const absents = noms.filter((n) => !nomme(v.texte, n));
  expect(
    absents.length === 0
      ? 'nomme'
      : `REFUS-SANS-NOMMER [${absents.join(', ')}] ${quoi} : ${court(v.texte)}`,
  ).toBe('nomme');
}

/* ───────────────────────────────── constructions de sources (A3, A4) */

function copie(c: Clause): Clause {
  const out: Clause = { ...c };
  const k = cle(c, A_CONTRAT);
  const ct = k === undefined ? undefined : c[k];
  if (k !== undefined && ct !== null && typeof ct === 'object' && !Array.isArray(ct)) out[k] = { ...(ct as Json) };
  return out;
}
function sansRemplacement(c: Clause): Clause {
  const out = copie(c);
  for (const a of A_REMPLACE) delete out[a];
  return out;
}
function ecrire(c: Clause, p: Place, valeur: unknown): void {
  if (p.ou === 'clause') {
    c[p.cle] = valeur;
  } else {
    const k = cle(c, A_CONTRAT) as string;
    (c[k] as Json)[p.cle] = valeur;
  }
}
/** Ou ecrire un champ absent d'une clause : la ou la source le met ailleurs, sinon a defaut. */
function placeParDefaut(clauses: Clause[], alias: readonly string[], defaut: string): Place {
  for (const c of clauses) {
    const p = placer(c, alias);
    if (p !== undefined) return { ou: p.ou, cle: p.cle, valeur: undefined };
  }
  return { ou: 'clause', cle: defaut, valeur: undefined };
}
function ajouterCompare(clauses: Clause[], c: Clause, nom: string): void {
  const p = placer(c, A_COMPARE) ?? placeParDefaut(clauses, A_COMPARE, 'compares');
  const avant = Array.isArray(p.valeur) ? (p.valeur as unknown[]) : [];
  const objets = avant.length > 0 && typeof avant[0] === 'object';
  ecrire(c, p, [...avant, objets ? { name: nom } : nom]);
}
function ajouterDeclaration(clauses: Clause[], c: Clause, nom: string): void {
  const p = placer(c, A_DECL) ?? placeParDefaut(clauses, A_DECL, 'quantities');
  const decl = { unit: 'unite-de-construction-T70', format: 'entier' };
  let forme: unknown = p.valeur;
  if (forme === undefined) {
    // reprendre la forme (tableau ou objet) des declarations reelles
    const ailleurs = clauses.map((x) => placer(x, A_DECL)?.valeur).find((x) => x !== undefined);
    forme = Array.isArray(ailleurs) ? [] : {};
  }
  if (Array.isArray(forme)) ecrire(c, p, [...forme, { name: nom, ...decl }]);
  else ecrire(c, p, { ...(forme as Json), [nom]: decl });
}
/** Retire (ou ampute de son unite) la declaration de `nom` dans une clause. */
function modifierDeclaration(c: Clause, nom: string, mode: 'retirer' | 'sans-unite'): void {
  const p = placer(c, A_DECL);
  if (p === undefined) return;
  const amputer = (d: unknown): unknown => {
    if (d === null || typeof d !== 'object') return {};
    const o = { ...(d as Json) };
    for (const a of A_UNITE) delete o[a];
    return o;
  };
  if (Array.isArray(p.valeur)) {
    const v = (p.valeur as unknown[]).flatMap((d) => {
      const n = d !== null && typeof d === 'object' ? (d as Json).name ?? (d as Json).id ?? (d as Json).nom : undefined;
      if (n !== nom) return [d];
      return mode === 'retirer' ? [] : [amputer(d)];
    });
    ecrire(c, p, v);
  } else if (p.valeur !== null && typeof p.valeur === 'object') {
    const o = { ...(p.valeur as Json) };
    if (nom in o) {
      if (mode === 'retirer') delete o[nom];
      else o[nom] = amputer(o[nom]);
    }
    ecrire(c, p, o);
  }
}

function remplacementEntre(a: Clause, b: Clause): boolean {
  return remplaceDe(a).includes(idDe(b)) || remplaceDe(b).includes(idDe(a));
}

/* ───────────────────────────────── replay du modele attendu (A2) */

const METHODES = ['apply', 'execute', 'handle', 'dispatch', 'step', 'run'];

async function rejouer(): Promise<{ reponses: Map<string, unknown>; diagnostic: string }> {
  const etapes = TRAJECTOIRE.map((e) => JSON.parse(JSON.stringify(e)) as Etape);
  const reponses = new Map<string, unknown>();
  const replay = resolveFonction('replayPlatform');
  if (replay !== null) {
    let r: unknown;
    try {
      r = await Promise.resolve(replay(etapes));
    } catch (e) {
      return { reponses, diagnostic: `REPLAY-LEVE ${court(rendu(e), 400)}` };
    }
    if (r !== null && typeof r === 'object' && !Array.isArray(r) && 'responses' in (r as Json)) {
      r = (r as Json).responses;
    }
    if (Array.isArray(r)) {
      if (r.length !== etapes.length) {
        return { reponses, diagnostic: `REPLAY-LONGUEUR ${String(r.length)} reponses pour ${String(etapes.length)} etapes` };
      }
      etapes.forEach((e, i) => reponses.set(e.id, r[i]));
    } else if (r !== null && typeof r === 'object') {
      for (const e of etapes) reponses.set(e.id, (r as Json)[e.id]);
    } else {
      return { reponses, diagnostic: `REPLAY-RESULTAT-ILLISIBLE ${court(rendu(r), 300)}` };
    }
    return { reponses, diagnostic: 'ok' };
  }
  const fabrique = resolveFonction('createPlatformModel');
  if (fabrique === null) {
    return { reponses, diagnostic: `${contratManquant('replayPlatform')} ; ${contratManquant('createPlatformModel')}` };
  }
  let modele: Json;
  try {
    modele = (await Promise.resolve(fabrique())) as Json;
  } catch (e) {
    return { reponses, diagnostic: `FABRIQUE-LEVE ${court(rendu(e), 400)}` };
  }
  const m = METHODES.find((k) => modele !== null && typeof modele === 'object' && typeof modele[k] === 'function');
  if (m === undefined) {
    return { reponses, diagnostic: `MODELE-SANS-METHODE [${METHODES.join('|')}] ${court(rendu(modele), 300)}` };
  }
  for (const e of etapes) {
    try {
      reponses.set(e.id, await Promise.resolve((modele[m] as Fonction).call(modele, e)));
    } catch (err) {
      reponses.set(e.id, { __leve: rendu(err) });
    }
  }
  return { reponses, diagnostic: 'ok' };
}

/** Egalite partielle : chaque champ attendu present et egal ; tableaux : meme longueur, meme ordre. */
function correspond(attendu: unknown, recu: unknown): boolean {
  if (Array.isArray(attendu)) {
    return Array.isArray(recu) && recu.length === attendu.length && attendu.every((a, i) => correspond(a, recu[i]));
  }
  if (attendu !== null && typeof attendu === 'object') {
    if (recu === null || typeof recu !== 'object' || Array.isArray(recu)) return false;
    return Object.entries(attendu as Json).every(
      ([k, v]) => k in (recu as Json) && correspond(v, (recu as Json)[k]),
    );
  }
  return Object.is(attendu, recu);
}

/* ──────────────────────────────────────────────────────────────── cas */

describe('T70 — la source de clauses de F-PLATFORM, periodes P1 a P8 (ADR-021)', () => {
  test(
    'T70.A1 chaque clause porte identifiant, periode d\'entree, sortie et remplacement eventuels, texte d\'enonce, fragment de contrat et mise en oeuvre',
    async () => {
      assertLoaded();
      const clauses = await assertSource();

      // (1) forme de chaque clause
      const problemes: string[] = [];
      const ids = new Map<string, Clause>();
      for (const [i, c] of clauses.entries()) {
        const id = lire(c, A_ID);
        const nom = typeof id === 'string' && id.trim().length > 0 ? id : `#${String(i)}`;
        if (typeof id !== 'string' || id.trim().length === 0) problemes.push(`${nom}: identifiant absent ou vide`);
        else if (ids.has(id)) problemes.push(`${nom}: identifiant en double`);
        else ids.set(id, c);
        const e = entreeDe(c);
        if (e === null || e < 1 || e > 24) problemes.push(`${nom}: periode d'entree illisible (${rendu(lire(c, A_ENTREE))})`);
        const sBrut = lire(c, A_SORTIE);
        if (sBrut !== undefined && sBrut !== null) {
          const s = numeroPeriode(sBrut);
          if (s === null || s > 25 || e === null || s <= e) {
            problemes.push(`${nom}: periode de sortie invalide (${rendu(sBrut)}, entree ${rendu(lire(c, A_ENTREE))})`);
          }
        }
        const t = lire(c, A_TEXTE);
        if (typeof t !== 'string' || t.trim().length === 0) problemes.push(`${nom}: texte d'enonce absent ou vide`);
        const ct = contratDe(c);
        if (ct === null || typeof ct !== 'object' || Object.keys(ct as Json).length === 0) {
          problemes.push(`${nom}: fragment de contrat absent ou vide`);
        }
        if (!porteUneFonction(lire(c, A_IMPL))) problemes.push(`${nom}: mise en oeuvre absente (aucune fonction)`);
      }
      // (2) remplacements coherents
      for (const c of clauses) {
        for (const r of remplaceDe(c)) {
          const cible = ids.get(r);
          if (cible === undefined) {
            problemes.push(`${idDe(c)}: remplace une clause inconnue ${r}`);
            continue;
          }
          const e = entreeDe(c);
          const ec = entreeDe(cible);
          if (e === null || ec === null || ec >= e) problemes.push(`${idDe(c)}: remplace ${r} qui n'entre pas avant elle`);
          else if (active(cible, e)) problemes.push(`${idDe(c)}: remplace ${r}, encore active a P${String(e)}`);
        }
      }
      expect(problemes).toEqual([]);

      // (3) chaque periode P1..P8 introduit au moins une clause
      const sansClause = PERIODES.filter((p) => !clauses.some((c) => entreeDe(c) === Number(p.slice(1))));
      expect(sansClause).toEqual([]);

      // (4) le contrat en vigueur nomme chaque operation de la trajectoire gelee
      const opsManquantes = new Set<string>();
      for (const e of TRAJECTOIRE) {
        const n = Number(e.period.slice(1));
        if (!clauses.some((c) => active(c, n) && nomme(renduContrat(c), e.op))) opsManquantes.add(`${e.op}@${e.period}`);
      }
      expect([...opsManquantes]).toEqual([]);

      // (5) ... et chaque code d'erreur qu'un fait gele attend
      const codesManquants = new Set<string>();
      for (const f of FAITS) {
        const code = f.attendu.error;
        if (typeof code !== 'string') continue;
        const n = Number(f.periode.slice(1));
        if (!clauses.some((c) => active(c, n) && nomme(renduContrat(c), code))) codesManquants.add(`${code}@${f.periode}`);
      }
      expect([...codesManquants]).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T70.A2 le modele attendu rejoue sur la trajectoire principale de P1 a P8 reproduit chaque fait gele',
    async () => {
      assertLoaded();
      // garde de la racine elle-meme : 138 faits, au moins 6 par periode
      expect(FAITS.length).toBe(NOMBRE_DE_FAITS);
      for (const p of PERIODES) {
        expect(FAITS.filter((f) => f.periode === p).length >= 6 ? `${p}-ok` : `${p}-moins-de-6-faits`).toBe(`${p}-ok`);
      }

      const { reponses, diagnostic } = await rejouer();
      expect(diagnostic).toBe('ok');

      const sansReponse = TRAJECTOIRE.filter((e) => {
        const r = reponses.get(e.id);
        return r === null || typeof r !== 'object' || '__leve' in (r as Json);
      }).map((e) => `${e.id}=${court(rendu(reponses.get(e.id)), 160)}`);
      expect(sansReponse).toEqual([]);

      const divergences: string[] = [];
      for (const f of FAITS) {
        const recu = reponses.get(f.etape);
        if (!correspond(f.attendu, recu)) {
          divergences.push(`${f.id} (${f.etape}) attendu=${rendu(f.attendu)} recu=${court(rendu(recu), 400)}`);
        }
      }
      expect(divergences).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T70.A3 la verification de non-contradiction refuse, en nommant les deux clauses, deux clauses actives a une meme periode qui gouvernent la meme decision sans remplacement, et la source reelle passe',
    async () => {
      assertLoaded();
      const clauses = await assertSource();
      const verifier = assertFonction('checkNonContradiction');

      // (a) la source reelle passe
      attendrePassage(await juger(verifier, clauses), 'source reelle');

      const gouvernantes = clauses.filter((c) => gouverneDe(c).length > 0 && entreeDe(c) !== null);
      expect(gouvernantes.length > 0 ? 'decisions-declarees' : 'AUCUNE-CLAUSE-NE-DECLARE-SES-DECISIONS').toBe(
        'decisions-declarees',
      );

      // (b) doublon : une copie d'une clause reelle, sans remplacement, active aux memes periodes
      const x = gouvernantes[0] as Clause;
      const doublon = sansRemplacement(x);
      doublon[cle(x, A_ID) ?? 'id'] = 'T70-CLAUSE-DOUBLON';
      attendreRefusNommant(
        await juger(verifier, [...clauses, doublon]),
        [idDe(x), 'T70-CLAUSE-DOUBLON'],
        `doublon de ${idDe(x)}`,
      );

      // (c) greffe entre deux clauses REELLES : Y recoit les decisions de X
      let paire: [Clause, Clause] | undefined;
      for (const a of gouvernantes) {
        for (const b of gouvernantes) {
          if (a === b || remplacementEntre(a, b)) continue;
          const da = gouverneDe(a);
          if (gouverneDe(b).some((d) => da.includes(d))) continue;
          const commune = Array.from({ length: 24 }, (_, i) => i + 1).some((n) => active(a, n) && active(b, n));
          if (!commune) continue;
          paire = [a, b];
          break;
        }
        if (paire) break;
      }
      expect(paire ? 'paire-trouvee' : 'AUCUNE-PAIRE-DE-CLAUSES-SIMULTANEES-A-DECISIONS-DISJOINTES').toBe('paire-trouvee');
      const [a, b] = paire as [Clause, Clause];
      const greffee = copie(b);
      ecrire(greffee, placer(b, A_GOUVERNE) as Place, JSON.parse(JSON.stringify(placer(a, A_GOUVERNE)?.valeur)));
      attendreRefusNommant(
        await juger(verifier, clauses.map((c) => (c === b ? greffee : c))),
        [idDe(a), idDe(b)],
        `greffe des decisions de ${idDe(a)} sur ${idDe(b)}`,
      );

      // (d) meme decision a des periodes DISJOINTES, sans remplacement : legitime, doit passer
      const seule = gouvernantes.find((c) => {
        const e = entreeDe(c);
        return (
          e !== null &&
          e < 8 &&
          sortieDe(c) === null &&
          remplaceDe(c).length === 0 &&
          !clauses.some((o) => remplaceDe(o).includes(idDe(c)))
        );
      });
      expect(seule ? 'clause-isolee-trouvee' : 'AUCUNE-CLAUSE-SANS-SORTIE-NI-REMPLACEMENT').toBe('clause-isolee-trouvee');
      const s = seule as Clause;
      const e = entreeDe(s) as number;
      const modele = lire(s, A_ENTREE);
      const fermee = copie(s);
      // cle de sortie : celle de la clause, sinon celle qu'emploie la source ailleurs
      const cleSortie = cle(s, A_SORTIE) ?? clauses.map((c) => cle(c, A_SORTIE)).find((k) => k !== undefined) ?? 'exits';
      fermee[cleSortie] = periodeComme(modele, e + 1);
      const suivante = sansRemplacement(s);
      suivante[cle(s, A_ID) ?? 'id'] = 'T70-CLAUSE-SUCCESSIVE';
      suivante[cle(s, A_ENTREE) as string] = periodeComme(modele, e + 1);
      for (const k of A_SORTIE) delete suivante[k];
      attendrePassage(
        await juger(verifier, [...clauses.map((c) => (c === s ? fermee : c)), suivante]),
        `${idDe(s)} sortie a P${String(e + 1)} puis T70-CLAUSE-SUCCESSIVE entree a P${String(e + 1)} (periodes disjointes)`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T70.A4 la verification d\'unites refuse, en nommant la grandeur, une source ou une grandeur comparee n\'a pas d\'unite declaree, et la source reelle passe',
    async () => {
      assertLoaded();
      const clauses = await assertSource();
      const verifier = assertFonction('checkUnits');

      // (a) la source reelle passe ...
      attendrePassage(await juger(verifier, clauses), 'source reelle');

      // ... et le satisfait VRAIMENT, recompte ici independamment, periode par periode
      const comparees = new Set<string>();
      const nonDeclarees = new Set<string>();
      for (let n = 1; n <= 8; n += 1) {
        const actives = clauses.filter((c) => active(c, n));
        for (const c of actives) {
          for (const q of comparesDe(c)) {
            comparees.add(q);
            if (!actives.some((d) => declarationComplete(declarationsDe(d).get(q)))) nonDeclarees.add(`${q}@P${String(n)}`);
          }
        }
      }
      expect(comparees.size > 0 ? 'grandeurs-comparees-declarees' : 'AUCUNE-GRANDEUR-COMPAREE').toBe(
        'grandeurs-comparees-declarees',
      );
      expect([...nonDeclarees]).toEqual([]);

      // ... et chaque montant (*_cents) et instant (starts_at) qu'un fait gele compare est une grandeur comparee active
      const feuilles = (o: unknown, prefixe = ''): string[][] =>
        o !== null && typeof o === 'object' && !Array.isArray(o)
          ? Object.entries(o as Json).flatMap(([k, v]) => [[k, `${prefixe}${k}`], ...feuilles(v, `${prefixe}${k}.`)])
          : [];
      const nonComparees = new Set<string>();
      for (const f of FAITS) {
        const n = Number(f.periode.slice(1));
        const actives = new Set(clauses.filter((c) => active(c, n)).flatMap(comparesDe));
        for (const [feuille, chemin] of feuilles(f.attendu)) {
          if (!/_cents$/.test(feuille as string) && feuille !== 'starts_at') continue;
          if (!actives.has(feuille as string) && !actives.has(chemin as string)) nonComparees.add(`${chemin as string}@${f.periode}`);
        }
      }
      expect([...nonComparees]).toEqual([]);

      const premiere = [...clauses].sort((x, y) => (entreeDe(x) ?? 99) - (entreeDe(y) ?? 99))[0] as Clause;

      // (b) une grandeur comparee jamais declaree
      {
        const src = clauses.map(copie);
        const cible = src[clauses.indexOf(premiere)] as Clause;
        ajouterCompare(src, cible, 'grandeur_fantome_t70');
        attendreRefusNommant(await juger(verifier, src), ['grandeur_fantome_t70'], 'grandeur comparee sans declaration');
      }

      // (c) une grandeur REELLE dont on retire la declaration, puis seulement l'unite
      const reelle = clauses.flatMap(comparesDe)[0] as string;
      for (const mode of ['retirer', 'sans-unite'] as const) {
        const src = clauses.map(copie);
        for (const c of src) modifierDeclaration(c, reelle, mode);
        attendreRefusNommant(await juger(verifier, src), [reelle], `grandeur reelle ${reelle} (${mode})`);
      }

      // (d) comparee des l'entree d'une clause, declaree seulement par une clause qui entre plus tard
      {
        const tardive = [...clauses].sort((x, y) => (entreeDe(y) ?? 0) - (entreeDe(x) ?? 0))[0] as Clause;
        expect((entreeDe(tardive) ?? 0) > (entreeDe(premiere) ?? 0) ? 'deux-entrees' : 'UNE-SEULE-PERIODE-D-ENTREE').toBe(
          'deux-entrees',
        );
        const src = clauses.map(copie);
        ajouterCompare(src, src[clauses.indexOf(premiere)] as Clause, 'grandeur_tardive_t70');
        ajouterDeclaration(src, src[clauses.indexOf(tardive)] as Clause, 'grandeur_tardive_t70');
        attendreRefusNommant(
          await juger(verifier, src),
          ['grandeur_tardive_t70'],
          `grandeur comparee a P${String(entreeDe(premiere))}, declaree seulement a P${String(entreeDe(tardive))}`,
        );
      }

      // (e) comparee ET declaree dans la meme clause : legitime, doit passer
      {
        const src = clauses.map(copie);
        const cible = src[clauses.indexOf(premiere)] as Clause;
        ajouterCompare(src, cible, 'grandeur_locale_t70');
        ajouterDeclaration(src, cible, 'grandeur_locale_t70');
        attendrePassage(await juger(verifier, src), 'grandeur comparee et declaree dans la meme clause');
      }
    },
    CASE_TIMEOUT_MS,
  );
});
