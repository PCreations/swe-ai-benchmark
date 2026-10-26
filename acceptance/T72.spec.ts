/**
 * acceptance/T72.spec.ts — suite d'acceptation de la tache T72.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T72.A1 behaviour — le modele attendu rejoue sur la trajectoire principale
 *                      de P1 a P24 reproduit chaque fait gele
 *   T72.A2 behaviour — la fusion de locataires de P17 conserve l'historique de
 *                      chaque reservation et resout chaque collision
 *                      d'identifiants selon sa clause
 *   T72.A3 behaviour — a partir de P24, chaque operation du contrat v1 et son
 *                      equivalent v2 produisent le meme effet et des reponses
 *                      equivalentes selon la correspondance declaree
 *   T72.A4 numeric   — l'effacement de P18 anonymise le membre sans changer le
 *                      total d'aucune facture
 *   T72.A5 refusal   — les verifications de T70 passent sur P1 a P24
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 * T72 est une tache d'extension (verification/tasks.extensions.json), dont le
 * `spec_source` epingle ADR-021 L182-188 (docs/specs/T72.md). Le contrat
 * derive :
 *   - d'ADR-021 decision 1 (L29-52) et du tableau des periodes (L77-84) ;
 *   - des racines gelees acceptance/reference-platform/F-PLATFORM-P1-P8.json
 *     (T70, 138 faits), F-PLATFORM-P9-P16.json (T71, 133 faits) et
 *     F-PLATFORM-P17-P24.json, ecrite par le fixture-transcriber de T72 AVANT
 *     cette suite : regles P17-P24 sous leurs identifiants Pn.Rk, trajectoire
 *     qui PROLONGE celle de P1-P16 sur le meme etat, 148 faits calcules a la
 *     main citant chacun ses clauses actives, blocs `fusion` (P17),
 *     `effacement` (P18), `contrat_v2` (P24), `frontieres` ;
 *   - du contrat d'exports d'acceptance/T70.spec.ts (section III), REPRIS A
 *     L'IDENTIQUE ci-dessous (comme acceptance/T71.spec.ts) : memes roles,
 *     memes alias, memes formes.
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
 * Toute valeur ATTENDUE comparee est lue dans les racines gelees : faits,
 * blocs `fusion`, `effacement` et `contrat_v2` (dont la table de
 * correspondance v1 <-> v2 et la forme des erreurs v2). Les seuls litteraux
 * propres a la suite sont des identifiants de construction (clauses et
 * grandeurs fabriquees par A5, suffixees `T72`), les alias de nommage, l'ordre
 * des `kind` de renommage et sa forme '<source>:<id>' (P17.R2), et les champs
 * de forme que la racine P17-P24 declare (invoices, credit_notes, renamed,
 * origin, version, error.code).
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET D'APPEL — celui d'acceptance/T70.spec.ts section III,
 * inchange : SOURCE (role `platformClauses`), CLAUSE (id, entree, sortie,
 * remplacement, texte, contrat, mise en oeuvre, decisions gouvernees,
 * grandeurs comparees, declarations d'unites), MODELE ATTENDU (role
 * `replayPlatform`, a defaut `createPlatformModel`), NON-CONTRADICTION (role
 * `checkNonContradiction`), UNITES (role `checkUnits`), VERDICT. Les etapes
 * sont passees telles que les racines les ecrivent, dans l'ordre P1 -> P24,
 * sur UN SEUL etat ; a partir de P24 une etape peut porter `version`
 * ('v1' | 'v2') au niveau de l'enveloppe, et une reponse d'erreur v2 a la
 * forme { ok: false, error: { code } }.
 *
 * Trois precisions propres a T72 :
 *   - « deux rejeux » (A2) = deux appels independants de `replayPlatform` sur
 *     deux copies profondes, ou deux modeles fabriques ; aucun etat ne fuit ;
 *   - « bascule » (A3) d'une etape de P24 : son op et les cles de ses args
 *     sont renommes, a toute profondeur, par la table `contrat_v2`
 *     (v1 -> v2 si l'etape est v1 ou sans version, v2 -> v1 sinon) et sa
 *     version est posee ; la reponse attendue est la reponse d'origine
 *     traduite de la meme facon (cles renommees, erreur de premier niveau
 *     CODE <-> { code: CODE }) ;
 *   - une grandeur comparee (A5) est nommee par sa FEUILLE ou par un chemin
 *     pointe dont les tableaux sont elides, comme a T71.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS QUE CETTE SUITE FERME
 *
 *  (1) Un replay qui ne reproduit que P17-P24 sur un etat neuf : A1 rejoue
 *      P1-P24 d'un trait et compare les 419 faits (138 + 133 + 148).
 *  (2) Une fusion qui « marche » mais perd l'historique : A2 compare, champ
 *      pour champ, la vue de chaque reservation de la source AVANT la fusion
 *      et sa vue dans la cible APRES (memes cles, memes valeurs, hors
 *      booking_id/slot_id renommes) ; chaque renommage doit suivre la forme
 *      declaree, l'ordre declare, et ne viser qu'une collision reelle.
 *  (3) Un v2 plaque en surface (cles de premier niveau seulement, idempotence
 *      par version, effets differents) : A3 rejoue toute la trajectoire en
 *      basculant toutes les etapes de P24, puis une sur deux (melange v1/v2
 *      sur les memes cles), et exige reponses traduites et effets identiques
 *      sur TOUTES les autres etapes.
 *  (4) Un effacement qui « nettoie » aussi des lignes ou des montants : A4
 *      compare les documents de chaque membre avant et apres, facture par
 *      facture, et la somme des totaux ; et exige qu'aucune lecture
 *      posterieure ne laisse fuir l'identifiant efface.
 *  (5) Des verifications de T70 qui ne regardent que P1-P16 : A5 fabrique ses
 *      refus a partir de clauses qui ENTRENT a P17 ou apres.
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
const RACINE_P17_P24 = path.join(REPO, 'acceptance', 'reference-platform', 'F-PLATFORM-P17-P24.json');
const PLATFORM_A = JSON.parse(fs.readFileSync(RACINE_P1_P8, 'utf8')) as Json;
const PLATFORM_B = JSON.parse(fs.readFileSync(RACINE_P9_P16, 'utf8')) as Json;
const PLATFORM_C = JSON.parse(fs.readFileSync(RACINE_P17_P24, 'utf8')) as Json;
const PERIODES_A = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] as const;
const PERIODES_B = ['P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16'] as const;
const PERIODES_C = ['P17', 'P18', 'P19', 'P20', 'P21', 'P22', 'P23', 'P24'] as const;
const PERIODES = [...PERIODES_A, ...PERIODES_B, ...PERIODES_C];

interface Etape {
  id: string;
  period: string;
  at: string;
  op: string;
  tenant?: string;
  actor?: string;
  version?: string;
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
  const racine = (PERIODES_A as readonly string[]).includes(p)
    ? PLATFORM_A
    : (PERIODES_B as readonly string[]).includes(p)
      ? PLATFORM_B
      : PLATFORM_C;
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
const NOMBRE_DE_FAITS = [PLATFORM_A, PLATFORM_B, PLATFORM_C].reduce(
  (s, r) => s + Number(((r.scellement as Json).comptes as Json).total_faits),
  0,
);
const FRONTIERES = (PLATFORM_C.frontieres ?? {}) as Record<string, string[]>;
const numero = (p: string): number => Number(p.slice(1));
const faitParId = (id: string): (Fait & { periode: string }) | undefined => FAITS.find((f) => f.id === id);

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
  const decl = { unit: 'unite-de-construction-T72', format: 'entier' };
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

/* ──────────────────────────────────────────────── outils propres a T72 */

/** Renomme les CLES d'une valeur, a toute profondeur, selon `table` ; les valeurs ne changent pas. */
function renommerCles(v: unknown, table: Record<string, string>): unknown {
  if (Array.isArray(v)) return v.map((x) => renommerCles(x, table));
  if (v !== null && typeof v === 'object') {
    const out: Json = {};
    for (const [k, x] of Object.entries(v as Json)) out[table[k] ?? k] = renommerCles(x, table);
    return out;
  }
  return v;
}
function inverser(table: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k]));
}
/** Valeur, a toute profondeur, dont une chaine satisfait `pred` (chemin rendu pour le diagnostic). */
function chercherChaine(v: unknown, pred: (s: string) => boolean, chemin = '$'): string | null {
  if (typeof v === 'string') return pred(v) ? chemin : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i += 1) {
      const r = chercherChaine(v[i], pred, `${chemin}[${String(i)}]`);
      if (r !== null) return r;
    }
    return null;
  }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Json)) {
      if (pred(k)) return `${chemin}.${k}`;
      const r = chercherChaine(x, pred, `${chemin}.${k}`);
      if (r !== null) return r;
    }
  }
  return null;
}
function remplacerChaines(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === 'string') return f(v);
  if (Array.isArray(v)) return v.map((x) => remplacerChaines(x, f));
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Json).map(([k, x]) => [k, remplacerChaines(x, f)]));
  }
  return v;
}
function codeErreur(attendu: Json): string | null {
  const e = attendu.error;
  if (typeof e === 'string') return e;
  if (e !== null && typeof e === 'object' && typeof (e as Json).code === 'string') return (e as Json).code as string;
  return null;
}

/* ──────────────────────────────────────────────────────────────── cas */

describe('T72 — les clauses de F-PLATFORM, periodes P17 a P24 (ADR-021)', () => {
  test(
    'T72.A1 le modele attendu rejoue sur la trajectoire principale de P1 a P24 reproduit chaque fait gele',
    async () => {
      assertLoaded();
      // gardes de la racine : comptes scelles, au moins 8 faits par periode P17-P24, frontieres presentes
      expect(FAITS.length).toBe(NOMBRE_DE_FAITS);
      for (const p of PERIODES_C) {
        const n = FAITS.filter((f) => f.periode === p).length;
        expect(n >= 8 ? `${p}-ok` : `${p}-moins-de-8-faits(${String(n)})`).toBe(`${p}-ok`);
      }
      const idsFaits = new Set(FAITS.map((f) => f.id));
      for (const k of [
        'collision_a_la_fusion',
        'effacement_avec_facture_emise',
        'page_limite_et_tri_a_egalite',
        'import_partiellement_invalide',
        'expiration_de_credit_au_jour_pres',
        'transfert_avec_frais_et_echange',
        'meme_operation_v1_v2',
      ]) {
        const liste = FRONTIERES[k] ?? [];
        expect(liste.length > 0 ? `${k}-present` : `FRONTIERE-ABSENTE ${k}`).toBe(`${k}-present`);
        expect(liste.filter((id) => !idsFaits.has(id))).toEqual([]);
      }
      // une seule horloge, non decroissante, de P1-01 a la derniere etape de P24
      const reculs = TRAJECTOIRE.filter((e, i) => i > 0 && e.at < (TRAJECTOIRE[i - 1] as Etape).at).map((e) => e.id);
      expect(reculs).toEqual([]);

      const { reponses, diagnostic } = await rejeuPrincipal();
      expect(diagnostic).toBe('ok');
      expect(sansReponseObjet(reponses, TRAJECTOIRE)).toEqual([]);

      const divergences: string[] = [];
      const parFrontiere = new Map<string, string>();
      for (const [k, liste] of Object.entries(FRONTIERES)) for (const id of liste) if (!parFrontiere.has(id)) parFrontiere.set(id, k);
      for (const f of FAITS) {
        const recu = reponses.get(f.etape);
        if (!correspond(f.attendu, recu)) {
          const k = parFrontiere.get(f.id);
          divergences.push(
            `${f.id} (${f.etape})${k === undefined ? '' : ` [frontiere ${k}]`} attendu=${court(rendu(f.attendu), 500)} recu=${court(rendu(recu), 400)}`,
          );
        }
      }
      expect(divergences).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T72.A2 la fusion de locataires de P17 conserve l\'historique de chaque reservation et resout chaque collision d\'identifiants selon sa clause',
    async () => {
      assertLoaded();
      const fusion = (periodeRef('P17').fusion ?? {}) as Json;
      const resas = tableau(fusion.reservations) as Array<{
        avant: string;
        apres: string;
        booking_id: string;
        slot_id: string;
        origin: Json;
      }>;
      const source = String(fusion.source);
      const etapeFusion = String(fusion.etape_fusion);
      expect(resas.length > 0 && typeof fusion.etape_fusion === 'string' ? 'fusion-declaree' : 'RACINE-SANS-FUSION').toBe('fusion-declaree');

      const premier = await rejeuPrincipal();
      expect(premier.diagnostic).toBe('ok');
      const second = await rejouer(TRAJECTOIRE);
      expect(second.diagnostic).toBe('ok');

      const problemes: string[] = [];
      const rf = premier.reponses.get(etapeFusion) as Json | undefined;
      // (1) la reponse de fusion est le fait gele
      const faitFusion = faitParId(String(fusion.fait));
      if (faitFusion === undefined) problemes.push(`fait gele ${String(fusion.fait)} absent`);
      else if (!correspond(faitFusion.attendu, rf)) problemes.push(`${etapeFusion}: ${faitFusion.id} attendu=${rendu(faitFusion.attendu)} recu=${court(rendu(rf), 400)}`);
      const renamed = tableau(rf?.renamed) as Json[];
      if (rf?.ok !== true || renamed.length === 0) problemes.push(`${etapeFusion}: fusion sans renommage lisible ${court(rendu(rf), 300)}`);

      // (2) chaque renommage suit la regle declaree : forme '<source>:<id>', ordre des kinds, from croissant
      const ORDRE_DES_KINDS = ['slot', 'series', 'booking', 'request', 'import'];
      let precedent: [number, string] | null = null;
      for (const r of renamed) {
        const kind = String(r.kind);
        const from = String(r.from);
        const rang = ORDRE_DES_KINDS.indexOf(kind);
        if (rang < 0) problemes.push(`renommage de kind inconnu ${rendu(r)}`);
        if (r.to !== `${source}:${from}`) problemes.push(`renommage ${rendu(r)} : attendu to = '${source}:${from}'`);
        if (precedent !== null && (rang < precedent[0] || (rang === precedent[0] && !(precedent[1] < from)))) {
          problemes.push(`renamed hors ordre declare a ${rendu(r)}`);
        }
        precedent = [rang, from];
      }
      const renomme = (kind: string, id: string): string => {
        const r = renamed.find((x) => x.kind === kind && x.from === id);
        return r === undefined ? id : String(r.to);
      };

      // (3) historique conserve : la vue de chaque reservation de la source, avant et apres
      const vuesAvant = new Set<string>();
      for (const r of resas) {
        const av = premier.reponses.get(r.avant) as Json | undefined;
        const ap = premier.reponses.get(r.apres) as Json | undefined;
        if (av?.ok !== true || ap?.ok !== true) {
          problemes.push(`${r.avant}/${r.apres}: vues illisibles ${court(rendu(av), 200)} / ${court(rendu(ap), 200)}`);
          continue;
        }
        const idAvant = String(av.booking_id);
        vuesAvant.add(idAvant);
        // la collision est resolue selon la clause : l'identifiant d'arrivee est celui que la regle donne
        if (renomme('booking', idAvant) !== r.booking_id) problemes.push(`${r.apres}: ${idAvant} devrait devenir ${r.booking_id} selon renamed`);
        if (renomme('slot', String(av.slot_id)) !== r.slot_id) problemes.push(`${r.apres}: creneau ${String(av.slot_id)} devrait devenir ${r.slot_id} selon renamed`);
        if (ap.booking_id !== r.booking_id) problemes.push(`${r.apres}: booking_id ${rendu(ap.booking_id)} au lieu de ${r.booking_id}`);
        if (ap.slot_id !== r.slot_id) problemes.push(`${r.apres}: slot_id ${rendu(ap.slot_id)} au lieu de ${r.slot_id}`);
        if (!egal(ap.origin, r.origin)) problemes.push(`${r.apres}: origin ${rendu(ap.origin)} au lieu de ${rendu(r.origin)}`);
        if (!egal(av.origin, r.origin)) problemes.push(`${r.avant}: origin avant fusion ${rendu(av.origin)} au lieu de ${rendu(r.origin)}`);
        const cles = (o: Json): string => rendu(Object.keys(o).filter((k) => k !== 'ok').sort());
        if (cles(av) !== cles(ap)) problemes.push(`${r.apres}: champs ${cles(ap)} au lieu de ${cles(av)} (historique perdu ou ajoute)`);
        for (const k of Object.keys(av)) {
          if (k === 'booking_id' || k === 'slot_id') continue;
          if (!egal(av[k], ap[k])) problemes.push(`${r.apres}: ${k} ${court(rendu(ap[k]), 120)} au lieu de ${court(rendu(av[k]), 120)} (historique modifie par la fusion)`);
        }
        // deux rejeux independants : meme vue
        if (!egal(ap, second.reponses.get(r.apres))) problemes.push(`${r.apres}: deux rejeux divergent`);
      }
      // toute reservation renommee par la fusion est couverte par une paire avant/apres
      for (const r of renamed.filter((x) => x.kind === 'booking')) {
        if (!vuesAvant.has(String(r.from))) problemes.push(`reservation renommee ${String(r.from)} sans vue avant/apres dans la racine`);
      }
      if (!egal(rf, second.reponses.get(etapeFusion))) problemes.push(`${etapeFusion}: deux rejeux de la fusion divergent`);

      // (4) la cible est inchangee, la reponse memorisee suit son renommage
      for (const x of [...(tableau(fusion.cible_inchangee) as Json[]), fusion.memoire_renommee as Json]) {
        const f = faitParId(String(x?.fait));
        const recu = premier.reponses.get(String(x?.etape));
        if (f === undefined || !correspond(f.attendu, recu)) problemes.push(`${String(x?.etape)}: ${String(x?.fait)} attendu=${rendu(f?.attendu)} recu=${court(rendu(recu), 300)}`);
      }
      // (5) la source n'existe plus
      for (const x of tableau(fusion.source_disparue) as Json[]) {
        const recu = premier.reponses.get(String(x.etape)) as Json | undefined;
        if (recu?.ok !== false || recu.error !== x.error) problemes.push(`${String(x.etape)}: attendu ${String(x.error)}, recu ${court(rendu(recu), 200)}`);
      }
      expect(problemes).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T72.A3 a partir de P24, chaque operation du contrat v1 et son equivalent v2 produisent le meme effet et des reponses equivalentes selon la correspondance declaree',
    async () => {
      assertLoaded();
      const c2 = (periodeRef('P24').contrat_v2 ?? {}) as Json;
      const corr = (c2.correspondance ?? {}) as Json;
      const ops = (corr.operations ?? {}) as Record<string, string>;
      const champs = (corr.champs ?? {}) as Record<string, string>;
      const hors = new Set((tableau(c2.hors_bascule) as unknown[]).map(String));
      expect(Object.keys(ops).length > 0 && Object.keys(champs).length > 0 ? 'correspondance-declaree' : 'RACINE-SANS-CORRESPONDANCE').toBe('correspondance-declaree');
      // la correspondance est bijective
      expect(new Set(Object.values(ops)).size).toBe(Object.keys(ops).length);
      expect(new Set(Object.values(champs)).size).toBe(Object.keys(champs).length);
      const opsInv = inverser(ops);
      const champsInv = inverser(champs);
      const P24 = TRAJECTOIRE.filter((e) => e.period === 'P24');
      expect(P24.some((e) => e.version === 'v2') && P24.some((e) => e.version !== 'v2') ? 'deux-versions' : 'P24-SANS-LES-DEUX-VERSIONS').toBe('deux-versions');

      const versV2 = (e: Etape): boolean => e.version !== 'v2';
      const basculer = (e: Etape): Etape => {
        const copieEtape = JSON.parse(JSON.stringify(e)) as Etape;
        const v2 = versV2(e);
        return {
          ...copieEtape,
          op: (v2 ? ops : opsInv)[e.op] ?? e.op,
          args: renommerCles(copieEtape.args, v2 ? champs : champsInv) as Json,
          version: v2 ? 'v2' : 'v1',
        };
      };
      const traduire = (r: unknown, v2: boolean): unknown => {
        if (r === null || typeof r !== 'object') return r;
        const o = r as Json;
        if (o.ok === false) {
          if (v2 && typeof o.error === 'string') return { ...o, error: { code: o.error } };
          if (!v2 && o.error !== null && typeof o.error === 'object') return { ...o, error: (o.error as Json).code };
          return o;
        }
        return renommerCles(o, v2 ? champs : champsInv);
      };

      const ref = await rejeuPrincipal();
      expect(ref.diagnostic).toBe('ok');
      const problemes: string[] = [];
      // paires declarees : la meme requete (ou la meme lecture) en v2 puis en v1 se correspondent exactement
      const paires = tableau(c2.paires) as Array<{ v1: string; v2: string }>;
      expect(paires.length > 0 ? 'paires-declarees' : 'RACINE-SANS-PAIRES-V1-V2').toBe('paires-declarees');
      for (const p of paires) {
        const r2 = ref.reponses.get(p.v2);
        const r1 = ref.reponses.get(p.v1);
        if (!egal(traduire(r2, false), r1)) problemes.push(`paire ${p.v2}/${p.v1} : v2 traduit=${court(rendu(traduire(r2, false)), 300)} v1=${court(rendu(r1), 300)}`);
      }
      for (const mode of ['toutes', 'une-sur-deux'] as const) {
        let rang = 0;
        const basculees = new Set<string>();
        const traj = TRAJECTOIRE.map((e) => {
          if (e.period !== 'P24' || hors.has(e.id)) return e;
          rang += 1;
          if (mode === 'une-sur-deux' && rang % 2 === 0) return e;
          basculees.add(e.id);
          return basculer(e);
        });
        expect(basculees.size > 0 ? 'bascule' : `${mode}-AUCUNE-ETAPE-BASCULEE`).toBe('bascule');
        const alt = await rejouer(traj);
        if (alt.diagnostic !== 'ok') {
          problemes.push(`${mode}: rejeu bascule ${alt.diagnostic}`);
          continue;
        }
        for (const e of TRAJECTOIRE) {
          const a = ref.reponses.get(e.id);
          const b = alt.reponses.get(e.id);
          if (basculees.has(e.id)) {
            const attendu = traduire(a, versV2(e));
            if (!egal(attendu, b)) {
              problemes.push(`${mode} ${e.id} (${e.op} -> ${versV2(e) ? 'v2' : 'v1'}) : reponse non equivalente, attendu=${court(rendu(attendu), 300)} recu=${court(rendu(b), 300)}`);
            }
          } else if (!egal(a, b)) {
            problemes.push(`${mode} ${e.id} (${e.op}, non basculee) : effet different, avant=${court(rendu(a), 200)} apres=${court(rendu(b), 200)}`);
          }
        }
      }
      expect(problemes).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T72.A4 l\'effacement de P18 anonymise le membre sans changer le total d\'aucune facture',
    async () => {
      assertLoaded();
      const ef = (periodeRef('P18').effacement ?? {}) as Json;
      const membre = String(ef.membre);
      const pseudo = String(ef.pseudonyme);
      const paires = tableau(ef.paires) as Array<{ member_id: string; avant: string; apres: string; devient?: string }>;
      expect(paires.length > 0 && typeof ef.membre === 'string' && typeof ef.pseudonyme === 'string' ? 'effacement-declare' : 'RACINE-SANS-EFFACEMENT').toBe('effacement-declare');

      const { reponses, diagnostic } = await rejeuPrincipal();
      expect(diagnostic).toBe('ok');
      const problemes: string[] = [];
      const f = faitParId(String(ef.fait));
      const re = reponses.get(String(ef.etape_effacement));
      if (f === undefined || !correspond(f.attendu, re)) problemes.push(`${String(ef.etape_effacement)}: ${String(ef.fait)} attendu=${rendu(f?.attendu)} recu=${court(rendu(re), 300)}`);

      const motif = new RegExp(`^(INV-\\d{4}-\\d{2}-)${echapper(membre)}$`);
      const anonymiser = (v: unknown): unknown => remplacerChaines(v, (s) => (s === membre ? pseudo : s.replace(motif, `$1${pseudo}`)));
      const trace = (s: string): boolean => s === membre || motif.test(s);
      let totalAvant = 0;
      let totalApres = 0;
      let nFactures = 0;
      for (const p of paires) {
        const av = reponses.get(p.avant) as Json | undefined;
        const ap = reponses.get(p.apres) as Json | undefined;
        const qui = `${p.member_id}${p.devient === undefined ? '' : ` -> ${p.devient}`}`;
        if (av?.ok !== true || ap?.ok !== true || !Array.isArray(av.invoices) || !Array.isArray(ap.invoices)) {
          problemes.push(`${qui}: documents illisibles ${court(rendu(av), 150)} / ${court(rendu(ap), 150)}`);
          continue;
        }
        const attendu = (p.devient === undefined ? av : anonymiser(av)) as Json;
        const fa = attendu.invoices as Json[];
        const fp = ap.invoices as Json[];
        if (fa.length !== fp.length) problemes.push(`${qui}: ${String(fp.length)} factures apres effacement au lieu de ${String(fa.length)}`);
        fa.forEach((x, i) => {
          const y = fp[i];
          nFactures += 1;
          totalAvant += entier(x.total_cents) ?? Number.NaN;
          totalApres += entier(y?.total_cents) ?? Number.NaN;
          if (y === undefined) return;
          if (x.total_cents !== y.total_cents) problemes.push(`${qui}: ${String(y.invoice_id)} total ${rendu(y.total_cents)} au lieu de ${rendu(x.total_cents)}`);
          if (!egal(x, y)) problemes.push(`${qui}: facture ${String(x.invoice_id)} modifiee au-dela de l'identifiant : attendu=${court(rendu(x), 300)} recu=${court(rendu(y), 300)}`);
        });
        if (!egal(attendu.credit_notes, ap.credit_notes)) problemes.push(`${qui}: avoirs ${court(rendu(ap.credit_notes), 300)} au lieu de ${court(rendu(attendu.credit_notes), 300)}`);
        if (ap.member_id !== (p.devient ?? p.member_id)) problemes.push(`${qui}: member_id ${rendu(ap.member_id)}`);
        if (p.devient !== undefined && p.devient !== pseudo) problemes.push(`${qui}: la paire efface sous ${p.devient}, la racine dit ${pseudo}`);
      }
      expect(nFactures > 0 ? 'factures-comparees' : 'AUCUNE-FACTURE-COMPAREE').toBe('factures-comparees');
      if (totalAvant !== totalApres) problemes.push(`somme des totaux de factures ${String(totalApres)} apres effacement au lieu de ${String(totalAvant)}`);
      // l'identifiant efface ne fuit plus dans aucune lecture posterieure
      const sansTrace = [...(tableau(ef.etapes_sans_trace) as unknown[]).map(String), ...paires.map((p) => p.apres)];
      for (const id of sansTrace) {
        const ou = chercherChaine(reponses.get(id), trace);
        if (ou !== null) problemes.push(`${id}: l'identifiant efface ${membre} apparait encore en ${ou}`);
      }
      expect(problemes).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T72.A5 les verifications de T70 (completude, non-contradiction, unites) passent sur P1 a P24',
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
          if (r.remplace !== undefined) {
            const vieille = parId.get(r.remplace);
            if (vieille !== undefined && active(vieille, numero(r.periode))) reglesManquantes.push(`${r.remplace}: encore active a ${r.periode}, ou ${r.id} la remplace`);
          }
        }
      }
      expect(reglesManquantes).toEqual([]);
      expect(PERIODES_C.filter((p) => !clauses.some((c) => entreeDe(c) === numero(p)))).toEqual([]);

      // ── completude (2) : chaque attente de P17-P24 vient d'une clause ACTIVE a sa periode
      const attentesOrphelines: string[] = [];
      for (const f of FAITS.filter((x) => numero(x.periode) >= 17)) {
        const cites = f.clauses ?? [];
        if (cites.length === 0) attentesOrphelines.push(`${f.id}: ne cite aucune clause (racine)`);
        for (const id of cites) {
          const c = parId.get(id);
          if (c === undefined || !active(c, numero(f.periode))) attentesOrphelines.push(`${f.id}: ${id} inactive ou absente a ${f.periode}`);
        }
      }
      expect(attentesOrphelines).toEqual([]);

      // ── completude (3) : le contrat en vigueur nomme chaque operation et chaque code d'erreur attendu, P1-P24
      const opsManquantes = new Set<string>();
      for (const e of TRAJECTOIRE) {
        const n = numero(e.period);
        if (!clauses.some((c) => active(c, n) && nomme(renduContrat(c), e.op))) opsManquantes.add(`${e.op}@${e.period}`);
      }
      expect([...opsManquantes]).toEqual([]);
      const codesManquants = new Set<string>();
      for (const f of FAITS) {
        const code = codeErreur(f.attendu);
        if (code === null) continue;
        const n = numero(f.periode);
        if (!clauses.some((c) => active(c, n) && nomme(renduContrat(c), code))) codesManquants.add(`${code}@${f.periode}`);
      }
      expect([...codesManquants]).toEqual([]);

      // ── non-contradiction
      const nc = assertFonction('checkNonContradiction');
      attendrePassage(await juger(nc, clauses), 'source reelle P1-P24');
      const tardives = clauses.filter((c) => gouverneDe(c).length > 0 && (entreeDe(c) ?? 0) >= 17);
      expect(tardives.length > 0 ? 'decisions-P17-P24-declarees' : 'AUCUNE-CLAUSE-P17-P24-NE-DECLARE-SES-DECISIONS').toBe(
        'decisions-P17-P24-declarees',
      );
      {
        // doublon d'une clause qui entre a P17 ou apres
        const x = tardives[tardives.length - 1] as Clause;
        const doublon = sansRemplacement(x);
        doublon[cle(x, A_ID) ?? 'id'] = 'T72-CLAUSE-DOUBLON';
        attendreRefusNommant(await juger(nc, [...clauses, doublon]), [idDe(x), 'T72-CLAUSE-DOUBLON'], `doublon de ${idDe(x)}`);
      }
      {
        // greffe entre deux clauses REELLES simultanees a une periode >= 17, dont l'une entre a P17 ou apres
        const gouvernantes = clauses.filter((c) => gouverneDe(c).length > 0 && entreeDe(c) !== null);
        let paire: [Clause, Clause] | undefined;
        for (const a of gouvernantes) {
          for (const b of tardives) {
            if (a === b || remplacementEntre(a, b)) continue;
            const da = gouverneDe(a);
            if (gouverneDe(b).some((d) => da.includes(d))) continue;
            if (!Array.from({ length: 24 }, (_, i) => i + 1).some((n) => n >= 17 && active(a, n) && active(b, n))) continue;
            paire = [a, b];
            break;
          }
          if (paire) break;
        }
        expect(paire ? 'paire-trouvee' : 'AUCUNE-PAIRE-SIMULTANEE-A-P17-P24').toBe('paire-trouvee');
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
      attendrePassage(await juger(cu, clauses), 'source reelle P1-P24');
      const nonDeclarees = new Set<string>();
      for (let n = 1; n <= 24; n += 1) {
        const actives = clauses.filter((c) => active(c, n));
        for (const c of actives) {
          for (const q of comparesDe(c)) {
            if (!actives.some((d) => declarationComplete(declarationsDe(d).get(q)))) nonDeclarees.add(`${q}@P${String(n)}`);
          }
        }
      }
      expect([...nonDeclarees]).toEqual([]);
      // chaque montant, instant, taux (pb), taux de change et duree (ms) compare par un fait P17-P24 est une grandeur comparee active
      const GRANDEUR = /(_cents|_at|_bp|_micro|_ms)$|^suspended_until$|^effective_from$/;
      const feuilles = (o: unknown, chemin: string[] = []): Array<[string, string[]]> => {
        if (Array.isArray(o)) return o.flatMap((x) => feuilles(x, chemin));
        if (o !== null && typeof o === 'object') {
          return Object.entries(o as Json).flatMap(([k, v]) => [[k, [...chemin, k]] as [string, string[]], ...feuilles(v, [...chemin, k])]);
        }
        return [];
      };
      const nonComparees = new Set<string>();
      for (const f of FAITS.filter((x) => numero(x.periode) >= 17)) {
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
        // une grandeur REELLE comparee seulement a partir de P17 : on retire son unite, la verification la nomme
        const anciennes = new Set(clauses.filter((c) => (entreeDe(c) ?? 99) < 17).flatMap(comparesDe));
        const nouvelle = clauses
          .filter((c) => (entreeDe(c) ?? 0) >= 17)
          .flatMap(comparesDe)
          .find((q) => !anciennes.has(q));
        expect(nouvelle !== undefined ? 'grandeur-P17-P24' : 'AUCUNE-GRANDEUR-NOUVELLE-A-P17-P24').toBe('grandeur-P17-P24');
        for (const mode of ['retirer', 'sans-unite'] as const) {
          const src = clauses.map(copie);
          for (const c of src) modifierDeclaration(c, nouvelle as string, mode);
          attendreRefusNommant(await juger(cu, src), [nouvelle as string], `grandeur P17-P24 ${String(nouvelle)} (${mode})`);
        }
      }
      {
        // comparee par une clause de P17-P24, jamais declaree
        const src = clauses.map(copie);
        const cible = src[clauses.indexOf(tardives[0] as Clause)] as Clause;
        ajouterCompare(src, cible, 'grandeur_fantome_t72');
        attendreRefusNommant(await juger(cu, src), ['grandeur_fantome_t72'], 'grandeur comparee a P17-P24 sans declaration');
      }
    },
    CASE_TIMEOUT_MS,
  );
});
