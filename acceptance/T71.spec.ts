/**
 * acceptance/T71.spec.ts — suite d'acceptation de la tache T71.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T71.A1 numeric   — le modele attendu rejoue sur la trajectoire principale
 *                      de P1 a P16 reproduit chaque fait gele, dont les
 *                      frontieres d'annulation autour d'un changement d'heure
 *                      et les arrondis de conversion de devises
 *   T71.A2 behaviour — la migration de P11 affecte a chaque reservation
 *                      existante une place deterministe, et deux rejeux de la
 *                      migration sur le meme etat donnent la meme affectation
 *   T71.A3 numeric   — a chaque periode a partir de P14, les factures et avoirs
 *                      de chaque membre se rapprochent exactement de son
 *                      portefeuille
 *   T71.A4 refusal   — les verifications de T70 (completude, non-contradiction,
 *                      unites) passent sur P1 a P16
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 * T71 est une tache d'extension (verification/tasks.extensions.json), dont le
 * `spec_source` epingle ADR-021 L174-180 (docs/specs/T71.md). Le contrat
 * derive :
 *   - d'ADR-021 decision 1 (L29-52) et du tableau des periodes (L69-76) ;
 *   - de la racine gelee acceptance/reference-platform/F-PLATFORM-P1-P8.json
 *     (T70, 138 faits) et de F-PLATFORM-P9-P16.json, ecrite par le
 *     fixture-transcriber de T71 AVANT cette suite : regles P9-P16 sous leurs
 *     identifiants Pn.Rk, trajectoire qui PROLONGE celle de P1-P8 sur le meme
 *     etat, 133 faits calcules a la main, chacun citant ses clauses actives,
 *     blocs `migration` (P11), `rapport_de_bug` (P12), `rapprochement`
 *     (P14-P16) et `frontieres` ;
 *   - du contrat d'exports d'acceptance/T70.spec.ts (section III), REPRIS A
 *     L'IDENTIQUE ci-dessous : memes roles, memes alias, memes formes.
 *
 * Aveuglement (ADR-001, procedural) : l'auteur de cette suite a lu, sur
 * instruction de l'orchestrateur, l'en-tete, la liste des clauses et les
 * `questions_ouvertes` de packages/oracle/src/f-platform-clauses.ts ; aucune
 * assertion n'en derive (toutes les valeurs attendues viennent des racines
 * gelees) et aucune valeur n'a ete obtenue en executant une implementation.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 * Toute valeur ATTENDUE comparee est lue dans les racines gelees. Les seuls
 * litteraux propres a la suite sont des identifiants de construction (clauses
 * et grandeurs fabriquees par A4, suffixees `T71`), les alias de nommage, et
 * les champs de forme que la racine P9-P16 declare (invoices, credit_notes,
 * opening_balance_cents, ..., assignments, seat_numbers).
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET D'APPEL — celui d'acceptance/T70.spec.ts section III,
 * inchange : SOURCE (role `platformClauses`), CLAUSE (id, entree, sortie,
 * remplacement, texte, contrat, mise en oeuvre, decisions gouvernees,
 * grandeurs comparees, declarations d'unites), MODELE ATTENDU (role
 * `replayPlatform`, a defaut `createPlatformModel`), NON-CONTRADICTION (role
 * `checkNonContradiction`), UNITES (role `checkUnits`), VERDICT. Les etapes
 * sont passees telles que les racines les ecrivent, dans l'ordre P1 -> P16,
 * sur UN SEUL etat.
 *
 * Deux precisions propres a T71 :
 *   - « deux rejeux » (A2) = deux appels independants de `replayPlatform` sur
 *     deux copies profondes de la trajectoire, ou deux modeles fabriques par
 *     `createPlatformModel` ; aucun etat ne doit fuir de l'un a l'autre ;
 *   - une grandeur comparee (A4) est nommee par sa FEUILLE (ex.
 *     `closing_balance_cents`) ou par un chemin pointe dont les tableaux sont
 *     elides (ex. `invoices.closing_balance_cents`, `refund.credits_cents`).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS QUE CETTE SUITE FERME
 *
 *  (1) Un replay qui ne reproduit que P9-P16 sur un etat neuf : A1 rejoue
 *      P1-P16 d'un trait et compare les 271 faits (138 + 133).
 *  (2) Une affectation de places qui depend de l'ordre d'iteration : A2
 *      compare t-mig-a et t-mig-b (memes reservations creees dans un autre
 *      ordre) et deux rejeux independants, en plus de la forme (blocs
 *      contigus, disjoints, dans 1..capacity, `seats` places chacun).
 *  (3) Un rapprochement creux (factures coherentes entre elles mais un avoir
 *      omis) : A3 exige que l'ensemble des avoirs listes egale celui des faits
 *      geles, que chaque facture compte exactement les avoirs de son mois, et
 *      que le solde du portefeuille egale la cloture ; et que les factures
 *      deja emises soient identiques d'une periode a l'autre (immuabilite).
 *  (4) Une verification de non-contradiction ou d'unites qui ne regarde que
 *      P1-P8 : A4 fabrique ses refus a partir de clauses qui ENTRENT a P9 ou
 *      apres, et recompte unites et activite periode par periode jusqu'a P16.
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

/* ───────────────────────── racines gelees acceptance/reference-platform */

const RACINE_P1_P8 = path.join(REPO, 'acceptance', 'reference-platform', 'F-PLATFORM-P1-P8.json');
const RACINE_P9_P16 = path.join(REPO, 'acceptance', 'reference-platform', 'F-PLATFORM-P9-P16.json');
const PLATFORM_A = JSON.parse(fs.readFileSync(RACINE_P1_P8, 'utf8')) as Json;
const PLATFORM_B = JSON.parse(fs.readFileSync(RACINE_P9_P16, 'utf8')) as Json;
const PERIODES_A = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] as const;
const PERIODES_B = ['P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16'] as const;
const PERIODES = [...PERIODES_A, ...PERIODES_B];

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
  clauses?: string[];
}
interface Regle {
  id: string;
  remplace?: string;
}

function periodeRef(p: string): Json {
  const racine = (PERIODES_A as readonly string[]).includes(p) ? PLATFORM_A : PLATFORM_B;
  const e = (racine.periodes as Json | undefined)?.[p];
  if (e === null || e === undefined || typeof e !== 'object') {
    throw new Error(`REFERENCE-PERIODE-ABSENTE ${p}`);
  }
  return e as Json;
}
const TRAJECTOIRE: Etape[] = PERIODES.flatMap((p) => periodeRef(p).trajectoire as Etape[]);
const FAITS: Array<Fait & { periode: string }> = PERIODES.flatMap((p) =>
  (periodeRef(p).faits as Fait[]).map((f) => ({ ...f, periode: p })),
);
const REGLES: Array<Regle & { periode: string }> = PERIODES.flatMap((p) =>
  (periodeRef(p).regles as Regle[]).map((r) => ({ ...r, periode: p })),
);
const NOMBRE_DE_FAITS =
  Number(((PLATFORM_A.scellement as Json).comptes as Json).total_faits) +
  Number(((PLATFORM_B.scellement as Json).comptes as Json).total_faits);
const FRONTIERES = (PLATFORM_B.frontieres ?? {}) as Record<string, string[]>;
const numero = (p: string): number => Number(p.slice(1));

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
  const decl = { unit: 'unite-de-construction-T71', format: 'entier' };
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

/* ───────────────────────────────── replay du modele attendu */

const METHODES = ['apply', 'execute', 'handle', 'dispatch', 'step', 'run'];

/** Un rejeu COMPLET et independant de `trajectoire` (copie profonde, modele neuf). */
async function rejouer(trajectoire: Etape[]): Promise<{ reponses: Map<string, unknown>; diagnostic: string }> {
  const etapes = trajectoire.map((e) => JSON.parse(JSON.stringify(e)) as Etape);
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
      etapes.forEach((e, i) => reponses.set(e.id, JSON.parse(JSON.stringify(r[i] ?? null)) as unknown));
    } else if (r !== null && typeof r === 'object') {
      for (const e of etapes) reponses.set(e.id, JSON.parse(JSON.stringify((r as Json)[e.id] ?? null)) as unknown);
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
      // copie profonde : une reponse partagee avec l'etat interne ne doit pas changer apres coup
      reponses.set(e.id, JSON.parse(JSON.stringify((await Promise.resolve((modele[m] as Fonction).call(modele, e))) ?? null)) as unknown);
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

/** Egalite profonde stricte (memes cles, memes valeurs, meme ordre des tableaux). */
function egal(a: unknown, b: unknown): boolean {
  return correspond(a, b) && correspond(b, a);
}

function sansReponseObjet(reponses: Map<string, unknown>, etapes: Etape[]): string[] {
  return etapes
    .filter((e) => {
      const r = reponses.get(e.id);
      return r === null || typeof r !== 'object' || '__leve' in (r as Json);
    })
    .map((e) => `${e.id}=${court(rendu(reponses.get(e.id)), 160)}`);
}

let REJEU_CACHE: { reponses: Map<string, unknown>; diagnostic: string } | undefined;
async function rejeuPrincipal(): Promise<{ reponses: Map<string, unknown>; diagnostic: string }> {
  if (REJEU_CACHE === undefined) REJEU_CACHE = await rejouer(TRAJECTOIRE);
  return REJEU_CACHE;
}

const entier = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);
const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/* ──────────────────────────────────────────────────────────────── cas */

describe('T71 — les clauses de F-PLATFORM, periodes P9 a P16 (ADR-021)', () => {
  test(
    'T71.A1 le modele attendu rejoue sur la trajectoire principale de P1 a P16 reproduit chaque fait gele, dont les frontieres du changement d\'heure et les arrondis de conversion',
    async () => {
      assertLoaded();
      // gardes de la racine : comptes scelles, au moins 8 faits par periode P9-P16, frontieres presentes
      expect(FAITS.length).toBe(NOMBRE_DE_FAITS);
      for (const p of PERIODES_B) {
        const n = FAITS.filter((f) => f.periode === p).length;
        expect(n >= 8 ? `${p}-ok` : `${p}-moins-de-8-faits(${String(n)})`).toBe(`${p}-ok`);
      }
      const idsFaits = new Set(FAITS.map((f) => f.id));
      for (const k of ['changement_d_heure', 'arrondi_conversion']) {
        const liste = FRONTIERES[k] ?? [];
        expect(liste.length > 0 ? `${k}-present` : `FRONTIERE-ABSENTE ${k}`).toBe(`${k}-present`);
        expect(liste.filter((id) => !idsFaits.has(id))).toEqual([]);
      }

      const { reponses, diagnostic } = await rejeuPrincipal();
      expect(diagnostic).toBe('ok');
      expect(sansReponseObjet(reponses, TRAJECTOIRE)).toEqual([]);

      const divergences: string[] = [];
      const parFrontiere = new Map<string, string>();
      for (const [k, liste] of Object.entries(FRONTIERES)) for (const id of liste) parFrontiere.set(id, k);
      for (const f of FAITS) {
        const recu = reponses.get(f.etape);
        if (!correspond(f.attendu, recu)) {
          const k = parFrontiere.get(f.id);
          divergences.push(
            `${f.id} (${f.etape})${k === undefined ? '' : ` [frontiere ${k}]`} attendu=${rendu(f.attendu)} recu=${court(rendu(recu), 400)}`,
          );
        }
      }
      expect(divergences).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T71.A2 la migration de P11 affecte a chaque reservation existante des places deterministes, et deux rejeux de la migration sur le meme etat donnent la meme affectation',
    async () => {
      assertLoaded();
      const migration = (periodeRef('P11').migration ?? {}) as Json;
      const etapesMig = tableau(migration.etapes) as Array<{
        etape: string;
        fait: string;
        capacity: number;
        confirmed: Record<string, number>;
      }>;
      const paires = tableau(migration.paires_equivalentes) as Array<[string, string]>;
      expect(etapesMig.length > 0 && paires.length > 0 ? 'migration-declaree' : 'RACINE-SANS-MIGRATION').toBe('migration-declaree');

      const premier = await rejeuPrincipal();
      expect(premier.diagnostic).toBe('ok');
      const second = await rejouer(TRAJECTOIRE);
      expect(second.diagnostic).toBe('ok');

      const problemes: string[] = [];
      for (const m of etapesMig) {
        const r = premier.reponses.get(m.etape) as Json | undefined;
        const r2 = second.reponses.get(m.etape);
        if (r === undefined || r === null || typeof r !== 'object' || r.ok !== true || !Array.isArray(r.assignments)) {
          problemes.push(`${m.etape}: reponse de migration illisible ${court(rendu(r), 300)}`);
          continue;
        }
        const affect = r.assignments as Array<Json>;
        // (1) exactement les reservations confirmed
        const vus = affect.map((a) => String(a.booking_id));
        const attendus = Object.keys(m.confirmed).sort();
        if (rendu([...vus].sort()) !== rendu(attendus)) {
          problemes.push(`${m.etape}: reservations affectees ${rendu(vus)} au lieu de ${rendu(attendus)}`);
        }
        // (2) blocs contigus, disjoints, dans 1..capacity, `seats` places chacun
        const prises = new Set<number>();
        for (const a of affect) {
          const sieges = tableau(a.seat_numbers).map(entier);
          const id = String(a.booking_id);
          const seats = m.confirmed[id];
          if (sieges.some((s) => s === null)) {
            problemes.push(`${m.etape}: ${id} places non entieres ${rendu(a.seat_numbers)}`);
            continue;
          }
          const s = sieges as number[];
          if (seats !== undefined && s.length !== seats) problemes.push(`${m.etape}: ${id} recoit ${String(s.length)} places au lieu de ${String(seats)}`);
          if (s.some((x, i) => i > 0 && x !== (s[i - 1] as number) + 1)) problemes.push(`${m.etape}: ${id} places non contigues ${rendu(s)}`);
          for (const x of s) {
            if (x < 1 || x > m.capacity) problemes.push(`${m.etape}: ${id} place ${String(x)} hors 1..${String(m.capacity)}`);
            if (prises.has(x)) problemes.push(`${m.etape}: place ${String(x)} affectee deux fois`);
            prises.add(x);
          }
        }
        // (3) l'affectation gelee
        const fait = FAITS.find((f) => f.id === m.fait);
        if (fait === undefined) problemes.push(`${m.etape}: fait gele ${m.fait} absent`);
        else if (!correspond(fait.attendu, r)) problemes.push(`${m.etape}: ${m.fait} attendu=${rendu(fait.attendu)} recu=${court(rendu(r), 300)}`);
        // (4) deux rejeux independants : meme affectation
        if (!egal(r.assignments, (r2 as Json | undefined)?.assignments)) {
          problemes.push(`${m.etape}: deux rejeux divergent ${court(rendu(r.assignments), 200)} / ${court(rendu((r2 as Json | undefined)?.assignments), 200)}`);
        }
      }
      // (5) memes reservations creees dans un autre ordre : meme affectation
      for (const [x, y] of paires) {
        const ax = (premier.reponses.get(x) as Json | undefined)?.assignments;
        const ay = (premier.reponses.get(y) as Json | undefined)?.assignments;
        if (ax === undefined || !egal(ax, ay)) problemes.push(`paire ${x}/${y}: ${court(rendu(ax), 200)} != ${court(rendu(ay), 200)}`);
      }
      expect(problemes).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T71.A3 a chaque periode a partir de P14, les factures et avoirs de chaque membre se rapprochent exactement de son portefeuille',
    async () => {
      assertLoaded();
      const { reponses, diagnostic } = await rejeuPrincipal();
      expect(diagnostic).toBe('ok');

      const PERIODES_FACTUREES = ['P14', 'P15', 'P16'] as const;
      const problemes: string[] = [];
      const factureVue = new Map<string, { periode: string; facture: unknown }>();
      const avoirVu = new Map<string, { periode: string; avoir: unknown }>();
      for (const p of PERIODES_FACTUREES) {
        const rap = (periodeRef(p).rapprochement ?? {}) as Json;
        const membres = tableau(rap.membres) as Array<{ member_id: string; etape_documents: string; etape_portefeuille: string }>;
        expect(membres.length > 0 ? `${p}-rapprochement-declare` : `${p}-RACINE-SANS-RAPPROCHEMENT`).toBe(`${p}-rapprochement-declare`);

        // avoirs attendus a cette periode : ceux que les faits geles de P14..p nomment
        const attendus = new Set<string>();
        const collecter = (v: unknown): void => {
          if (Array.isArray(v)) v.forEach(collecter);
          else if (v !== null && typeof v === 'object') {
            for (const [k, x] of Object.entries(v as Json)) {
              if (k === 'credit_note_id' && typeof x === 'string') attendus.add(x);
              else collecter(x);
            }
          }
        };
        for (const f of FAITS) if (numero(f.periode) >= 14 && numero(f.periode) <= numero(p) && f.attendu.ok === true) collecter(f.attendu);
        expect(attendus.size > 0 ? 'avoirs-geles' : `${p}-AUCUN-AVOIR-GELE`).toBe('avoirs-geles');

        const listes = new Set<string>();
        for (const x of membres) {
          const qui = `${p} ${x.member_id}`;
          const d = reponses.get(x.etape_documents) as Json | undefined;
          const w = reponses.get(x.etape_portefeuille) as Json | undefined;
          if (d?.ok !== true || !Array.isArray(d.invoices) || !Array.isArray(d.credit_notes)) {
            problemes.push(`${qui}: documents illisibles ${court(rendu(d), 200)}`);
            continue;
          }
          const solde = entier(w?.ok === true ? w.balance_cents : undefined);
          if (solde === null) {
            problemes.push(`${qui}: portefeuille illisible ${court(rendu(w), 200)}`);
            continue;
          }
          const factures = d.invoices as Json[];
          const avoirs = d.credit_notes as Json[];
          const idsFactures = new Set(factures.map((f) => String(f.invoice_id)));
          for (const a of avoirs) {
            const id = String(a.credit_note_id);
            listes.add(id);
            const [m, c, k] = [entier(a.amount_cents), entier(a.credits_cents), entier(a.card_cents)];
            if (m === null || c === null || k === null || m !== c + k) problemes.push(`${qui}: avoir ${id} montant != credits + carte ${rendu(a)}`);
            if (a.member_id !== x.member_id) problemes.push(`${qui}: avoir ${id} d'un autre membre`);
            if (!idsFactures.has(String(a.invoice_id))) problemes.push(`${qui}: avoir ${id} reference une facture absente ${String(a.invoice_id)}`);
            if (!factures.some((f) => f.month === a.month)) problemes.push(`${qui}: avoir ${id} emis en ${String(a.month)}, mois sans facture`);
            const avant = avoirVu.get(id);
            if (avant !== undefined && !egal(avant.avoir, a)) problemes.push(`${qui}: avoir ${id} modifie depuis ${avant.periode}`);
            avoirVu.set(id, { periode: p, avoir: a });
          }
          let ouverture = 0;
          let mois = '';
          for (const f of factures) {
            const id = String(f.invoice_id);
            const n = (k: string): number => {
              const v = entier(f[k]);
              if (v === null) problemes.push(`${qui}: ${id}.${k} non entier (${rendu(f[k])})`);
              return v ?? Number.NaN;
            };
            if (String(f.month) <= mois) problemes.push(`${qui}: factures hors ordre (${String(f.month)} apres ${mois})`);
            mois = String(f.month);
            if (n('opening_balance_cents') !== ouverture) problemes.push(`${qui}: ${id} s'ouvre a ${String(f.opening_balance_cents)} au lieu de ${String(ouverture)}`);
            const cn = avoirs.filter((a) => a.month === f.month).reduce((s, a) => s + (entier(a.credits_cents) ?? Number.NaN), 0);
            if (n('credit_notes_credits_cents') !== cn) problemes.push(`${qui}: ${id} compte ${String(f.credit_notes_credits_cents)} de credits d'avoirs, les avoirs du mois en portent ${String(cn)}`);
            const cloture = n('opening_balance_cents') + n('top_ups_cents') + n('compensations_cents') + n('credit_notes_credits_cents') - n('credits_used_cents');
            if (n('closing_balance_cents') !== cloture) problemes.push(`${qui}: ${id} cloture ${String(f.closing_balance_cents)} != ${String(cloture)}`);
            if (n('card_cents') + n('credits_used_cents') !== n('total_cents')) problemes.push(`${qui}: ${id} carte + credits != total`);
            if (n('charges_cents') - n('refunds_cents') !== n('total_cents')) problemes.push(`${qui}: ${id} charges - remboursements != total`);
            const avant = factureVue.get(id);
            if (avant !== undefined && !egal(avant.facture, f)) problemes.push(`${qui}: facture ${id} modifiee depuis ${avant.periode} (immuable)`);
            factureVue.set(id, { periode: p, facture: f });
            ouverture = n('closing_balance_cents');
          }
          if (ouverture !== solde) problemes.push(`${qui}: portefeuille ${String(solde)} != cloture de la derniere facture ${String(ouverture)}`);
        }
        const manquants = [...attendus].filter((id) => !listes.has(id));
        const intrus = [...listes].filter((id) => !attendus.has(id));
        if (manquants.length > 0 || intrus.length > 0) {
          problemes.push(`${p}: avoirs listes ${rendu([...listes].sort())} au lieu de ${rendu([...attendus].sort())}`);
        }
      }
      expect(problemes).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T71.A4 les verifications de T70 (completude, non-contradiction, unites) passent sur P1 a P16',
    async () => {
      assertLoaded();
      const clauses = await assertSource();
      const parId = new Map(clauses.map((c) => [idDe(c), c]));

      // ── completude (1) : chaque regle des racines est une clause, entree a sa periode, avec son remplacement
      const reglesManquantes: string[] = [];
      for (const r of REGLES) {
        const c = parId.get(r.id);
        if (c === undefined) reglesManquantes.push(`${r.id}: absente de la source`);
        else {
          if (entreeDe(c) !== numero(r.periode)) reglesManquantes.push(`${r.id}: entre a ${rendu(lire(c, A_ENTREE))} au lieu de ${r.periode}`);
          if (r.remplace !== undefined && !remplaceDe(c).includes(r.remplace)) reglesManquantes.push(`${r.id}: ne remplace pas ${r.remplace}`);
        }
      }
      expect(reglesManquantes).toEqual([]);
      expect(PERIODES_B.filter((p) => !clauses.some((c) => entreeDe(c) === numero(p)))).toEqual([]);

      // ── completude (2) : chaque attente de P9-P16 vient d'une clause ACTIVE a sa periode
      const attentesOrphelines: string[] = [];
      for (const f of FAITS.filter((x) => numero(x.periode) >= 9)) {
        const cites = f.clauses ?? [];
        if (cites.length === 0) attentesOrphelines.push(`${f.id}: ne cite aucune clause (racine)`);
        for (const id of cites) {
          const c = parId.get(id);
          if (c === undefined || !active(c, numero(f.periode))) attentesOrphelines.push(`${f.id}: ${id} inactive ou absente a ${f.periode}`);
        }
      }
      expect(attentesOrphelines).toEqual([]);

      // ── completude (3) : le contrat en vigueur nomme chaque operation et chaque code d'erreur attendu, P1-P16
      const opsManquantes = new Set<string>();
      for (const e of TRAJECTOIRE) {
        const n = numero(e.period);
        if (!clauses.some((c) => active(c, n) && nomme(renduContrat(c), e.op))) opsManquantes.add(`${e.op}@${e.period}`);
      }
      expect([...opsManquantes]).toEqual([]);
      const codesManquants = new Set<string>();
      for (const f of FAITS) {
        const code = f.attendu.error;
        if (typeof code !== 'string') continue;
        const n = numero(f.periode);
        if (!clauses.some((c) => active(c, n) && nomme(renduContrat(c), code))) codesManquants.add(`${code}@${f.periode}`);
      }
      expect([...codesManquants]).toEqual([]);

      // ── non-contradiction
      const nc = assertFonction('checkNonContradiction');
      attendrePassage(await juger(nc, clauses), 'source reelle P1-P16');
      const tardives = clauses.filter((c) => gouverneDe(c).length > 0 && (entreeDe(c) ?? 0) >= 9);
      expect(tardives.length > 0 ? 'decisions-P9-P16-declarees' : 'AUCUNE-CLAUSE-P9-P16-NE-DECLARE-SES-DECISIONS').toBe(
        'decisions-P9-P16-declarees',
      );
      {
        // doublon d'une clause qui entre a P9 ou apres
        const x = tardives[0] as Clause;
        const doublon = sansRemplacement(x);
        doublon[cle(x, A_ID) ?? 'id'] = 'T71-CLAUSE-DOUBLON';
        attendreRefusNommant(await juger(nc, [...clauses, doublon]), [idDe(x), 'T71-CLAUSE-DOUBLON'], `doublon de ${idDe(x)}`);
      }
      {
        // greffe entre deux clauses REELLES simultanees a une periode >= 9, dont l'une entre a P9 ou apres
        const gouvernantes = clauses.filter((c) => gouverneDe(c).length > 0 && entreeDe(c) !== null);
        let paire: [Clause, Clause] | undefined;
        for (const a of gouvernantes) {
          for (const b of tardives) {
            if (a === b || remplacementEntre(a, b)) continue;
            const da = gouverneDe(a);
            if (gouverneDe(b).some((d) => da.includes(d))) continue;
            if (!Array.from({ length: 16 }, (_, i) => i + 1).some((n) => n >= 9 && active(a, n) && active(b, n))) continue;
            paire = [a, b];
            break;
          }
          if (paire) break;
        }
        expect(paire ? 'paire-trouvee' : 'AUCUNE-PAIRE-SIMULTANEE-A-P9-P16').toBe('paire-trouvee');
        const [a, b] = paire as [Clause, Clause];
        const greffee = copie(b);
        ecrire(greffee, placer(b, A_GOUVERNE) as Place, JSON.parse(JSON.stringify(placer(a, A_GOUVERNE)?.valeur)));
        attendreRefusNommant(
          await juger(nc, clauses.map((c) => (c === b ? greffee : c))),
          [idDe(a), idDe(b)],
          `greffe des decisions de ${idDe(a)} sur ${idDe(b)}`,
        );
      }

      // ── unites et formats
      const cu = assertFonction('checkUnits');
      attendrePassage(await juger(cu, clauses), 'source reelle P1-P16');
      const nonDeclarees = new Set<string>();
      for (let n = 1; n <= 16; n += 1) {
        const actives = clauses.filter((c) => active(c, n));
        for (const c of actives) {
          for (const q of comparesDe(c)) {
            if (!actives.some((d) => declarationComplete(declarationsDe(d).get(q)))) nonDeclarees.add(`${q}@P${String(n)}`);
          }
        }
      }
      expect([...nonDeclarees]).toEqual([]);
      // chaque montant, instant, taux (pb) et taux de change compare par un fait P9-P16 est une grandeur comparee active
      const GRANDEUR = /(_cents|_at|_bp|_micro)$|^suspended_until$|^effective_from$/;
      const feuilles = (o: unknown, chemin: string[] = []): Array<[string, string[]]> => {
        if (Array.isArray(o)) return o.flatMap((x) => feuilles(x, chemin));
        if (o !== null && typeof o === 'object') {
          return Object.entries(o as Json).flatMap(([k, v]) => [[k, [...chemin, k]] as [string, string[]], ...feuilles(v, [...chemin, k])]);
        }
        return [];
      };
      const nonComparees = new Set<string>();
      for (const f of FAITS.filter((x) => numero(x.periode) >= 9)) {
        const n = numero(f.periode);
        const actives = new Set(clauses.filter((c) => active(c, n)).flatMap(comparesDe));
        for (const [feuille, chemin] of feuilles(f.attendu)) {
          if (!GRANDEUR.test(feuille)) continue;
          const suffixes = chemin.map((_, i) => chemin.slice(i).join('.'));
          if (!suffixes.some((s) => actives.has(s))) nonComparees.add(`${chemin.join('.')}@${f.periode}`);
        }
      }
      expect([...nonComparees]).toEqual([]);
      {
        // une grandeur REELLE comparee seulement a partir de P9 : on retire son unite, la verification la nomme
        const anciennes = new Set(clauses.filter((c) => (entreeDe(c) ?? 99) < 9).flatMap(comparesDe));
        const nouvelle = clauses
          .filter((c) => (entreeDe(c) ?? 0) >= 9)
          .flatMap(comparesDe)
          .find((q) => !anciennes.has(q));
        expect(nouvelle !== undefined ? 'grandeur-P9-P16' : 'AUCUNE-GRANDEUR-NOUVELLE-A-P9-P16').toBe('grandeur-P9-P16');
        for (const mode of ['retirer', 'sans-unite'] as const) {
          const src = clauses.map(copie);
          for (const c of src) modifierDeclaration(c, nouvelle as string, mode);
          attendreRefusNommant(await juger(cu, src), [nouvelle as string], `grandeur P9-P16 ${String(nouvelle)} (${mode})`);
        }
      }
      {
        // comparee par une clause de P9-P16, jamais declaree
        const src = clauses.map(copie);
        const cible = src[clauses.indexOf(tardives[0] as Clause)] as Clause;
        ajouterCompare(src, cible, 'grandeur_fantome_t71');
        attendreRefusNommant(await juger(cu, src), ['grandeur_fantome_t71'], 'grandeur comparee a P9-P16 sans declaration');
      }
    },
    CASE_TIMEOUT_MS,
  );
});
