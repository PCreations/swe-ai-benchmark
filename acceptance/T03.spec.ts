/**
 * acceptance/T03.spec.ts — suite d'acceptation de la tache T03.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T03.A1 numeric   — un manifeste 1 projet x 1 scenario x 2 configurations
 *                      x 3 repetitions x 1 budget produit exactement SIX
 *                      identites distinctes
 *   T03.A2 behaviour — changer le nombre de workers ne change pas ces identites
 *   T03.A3 refusal   — un id en doublon est rejete
 *   T03.A4 refusal   — propriete inconnue ou budget absent rejete avec chemin
 *                      exact
 *   T03.A5 behaviour — un scenario de provenance synthetique reste etiquete
 *                      synthetique dans TOUTES les cellules
 *   T03.A6 refusal   — empreinte verifiee avant toute execution, mismatch refuse
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE a `packages/contracts`, `packages/domain`
 * et `fixtures` — les `source_paths` que verification/tasks.json declare pour
 * T03. ADR-001 : cet aveuglement est PROCEDURAL, donc une discipline auditable
 * au diff, pas une barriere technique. Le contrat teste ci-dessous n'est pas
 * releve dans l'implementation ; il est derive de docs/specs/T03.md, c'est-a-dire
 * des lignes du cahier que la carte de specification epingle :
 *
 *   L179  livrables : « schemas des contrats E, validation structuree et
 *         planificateur PUR de cellules »
 *   L181  les six cas d'acceptation, mot pour mot
 *   L183  fin : « fixtures JSON minimales et invalides archivees ; aucune
 *         creation de worker pendant une compilation de manifeste. Ajouter des
 *         cellules ne necessite pas un appel LLM »
 *   L78   identite complete d'une trajectoire, SIX composantes :
 *         `campaign_id / parent_project_id / scenario_id / configuration_id /
 *         repetition_id / budget_id`
 *   L80   « les JSON de domaine sont stricts : proprietes inconnues rejetees,
 *         enums explicites, timestamps UTC ISO 8601, nombres non finis
 *         interdits » ; montants = chaines d'entiers non negatifs en micro-USD
 *   L82   empreintes : « SHA-256 sur des octets canoniques documentes. Objets
 *         JSON tries recursivement par cle ; ordre des tableaux conserve ;
 *         UTF-8 ; aucun timestamp technique ajoute »
 *   L86   `CampaignManifest` : « version, mode, corpus et empreintes,
 *         configurations, budgets, graines, periodes, politiques, metriques,
 *         statut de gel »
 *   L24   « les resultats portent toujours `execution_mode`, `cost_origin` et
 *         `corpus_provenance` »
 *   L20   les deux modes : `recorded` et `live`
 *   L413  la provenance « reste synthetique ou hybride selon les sources »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des trois sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/**` — racine gelee, docs/FROZEN_ROOTS
 *       .json. C'est le cas du plafond de budget `1000` (F-BUDGET, cahier L105).
 *   (b) un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p'
 *       docs/cahier.md` — c'est le cas du SIX de A1 (L181) et de tous les noms
 *       de champs.
 *   (c) une valeur LUE dans la fixture archivee de ce depot
 *       (`acceptance/fixtures/manifests/`), elle-meme ecrite par ce role et
 *       documentee dans le README de ce dossier. Les identifiants `CFG-A`,
 *       `CFG-B`, `synthetic`, `hybrid` sont de cette nature : la suite ne les
 *       recopie pas, elle les RELIT du manifeste soumis et exige que la sortie
 *       les porte.
 *
 * Aucune valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer : c'est exactement la fermeture que cette suite
 * existe pour ouvrir. L'empreinte du corpus, en particulier, est RECALCULEE ici
 * depuis la regle de L82 — la suite verifie d'abord que l'archive est coherente
 * avec cette regle (A6, premiere assertion), puis s'en sert.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE. Les paquets sont charges par leur SPECIFICATEUR, que
 * jest.config.mjs mappe vers `packages/<nom>/src` — jamais vers un `dist/`
 * perime, gitignore et invisible a `git status --porcelain`.
 *
 * Pour chaque ROLE du contrat, la suite nomme un export PRIMAIRE puis une courte
 * liste d'alias documentes. Les alias sont une tolerance de NOMMAGE, pas de
 * COMPORTEMENT : toutes les assertions restent identiques quel que soit le nom
 * retenu. Cette tolerance sert §H (« rends le test d'acceptation rouge pour la
 * raison attendue ») : un desaccord de vocabulaire entre l'auteur aveugle et
 * l'implementeur produirait un rouge qui ne dit rien du contrat. Si AUCUN nom ne
 * repond, la suite echoue par une assertion explicite qui nomme le role et la
 * liste attendue — jamais par un import casse, que verification/runner/red.mjs
 * classe MODULE_NOT_FOUND et refuse comme preuve.
 *
 *   compileCampaignManifest(manifeste, options?) -> plan de cellules (L179)
 *
 * UN SEUL ROLE EST RESOLU, ET C'EST VOULU. L179 nomme trois livrables —
 * schemas, validation structuree, planificateur pur — mais les six cas de L181
 * les observent tous par le MEME point d'entree : compiler un manifeste, c'est
 * le valider puis planifier ses cellules. Exiger un export de validation
 * separe imposerait une decomposition que le cahier n'impose pas. La validation
 * structuree est donc observee par la FORME du refus (chemin exact, A4), pas par
 * l'existence d'une fonction.
 *
 * FORME DU RESULTAT. La compilation peut rendre son plan directement, ou sous
 * une cle (`cells`, `cellules`, `identities`, `plan`, `units`). Elle peut
 * refuser en LEVANT ou en RENDANT un refus (`ok:false`, `errors:[...]`) : le
 * cahier prescrit un rejet, pas un mecanisme. Ce qui n'est PAS un refus, c'est
 * de rendre un plan — et c'est exactement ce que chaque cas de refus mesure.
 *
 * FORME D'UNE CELLULE. Chaque cellule planifiee porte les SIX composantes de
 * L78, a plat ou sous `identity`/`identite`, et son etiquette
 * `corpus_provenance` (L24). La suite n'impose pas l'arborescence, seulement la
 * presence — et A1 en fait une assertion a part entiere.
 *
 * ────────────────────────────────────────────────────────────────────── IV
 * LE DANGER PROPRE A T03 : LE PLAN CONSTANT.
 *
 * Quatre des six cas sont des enonces de COMPTE, d'EGALITE ou d'INVARIANCE. Un
 * planificateur qui rendrait toujours le meme plan de six cellules etiquetees
 * `synthetic` satisferait A1 (« six identites »), A2 (« ne change pas ») et A5
 * (« reste synthetique ») sans jamais lire son manifeste.
 * verification/cases.lock.json nomme ce defaut explicitement pour T03.A2, qu'il
 * range parmi les cas d'INVARIANCE ou « un stub constant rendrait les deux cotes
 * de l'egalite identiques et les laisserait VERTS ».
 *
 * Chaque cas porte donc un TEMOIN ANTI-CONSTANTE : une entree distincte doit
 * produire une sortie distincte. A1 compile deux manifestes de formes
 * differentes et exige 8 puis 1 cellule ; A2 exige qu'un facteur SCIENTIFIQUE
 * (le nombre de repetitions, l'identifiant d'une configuration) change bel et
 * bien le jeu d'identites que le nombre de workers ne change pas ; A5 exige
 * qu'un scenario `hybrid` produise des cellules `hybrid`, et qu'un manifeste
 * melangeant les deux produise les deux.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * LE REFUS N'EST PAS UNE COMPETENCE. A3, A4 et A6 sont classes `refusal`, et
 * verification/cases.lock.json signale le defaut decisif du mode : « un stub qui
 * leve rend ce cas VERT sans rien prouver ». Un compilateur qui refuserait TOUT
 * satisferait litteralement « un id en doublon est rejete ». Chaque cas de refus
 * porte donc son VOLET POSITIF : le manifeste minimal, et la variante dont on a
 * retire exactement le defaut, doivent etre ACCEPTES et produire leurs six
 * cellules. C'est la lecon que la porte rouge de T00 a administree sur A4/A5.
 *
 * ────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS. L183 exige « aucune creation de worker
 * pendant une compilation de manifeste ». La preuve complete serait statique —
 * une regle d'import interdisant `node:worker_threads` et `node:child_process`
 * dans le paquet, controle qui appartient a la chaine de l'implementeur et dont
 * la relever ici obligerait l'auteur des tests a lire les sources. A2 et A6 en
 * apportent la moitie OBSERVABLE, par `async_hooks` : toute ressource `WORKER`
 * ou `PROCESSWRAP` creee pendant la compilation serait vue.
 *
 * DEUX LIMITES NOMMEES, parce qu'une sonde non verifiee ne vaut pas mieux qu'une
 * assertion absente :
 *   • `process.getActiveResourcesInfo()` a d'abord ete essaye et MESURE AVEUGLE
 *     — sur Node 22 il ne liste ni un worker vivant ni un sous-processus. Il a
 *     donc ete remplace, et la sonde retenue porte son propre TEMOIN POSITIF :
 *     A2 cree un vrai worker et exige que la sonde le voie.
 *   • un sous-processus SYNCHRONE (`spawnSync`, `execFileSync`) n'enregistre
 *     aucune ressource asynchrone et echappe a la sonde. C'est la part de L183
 *     que seule la regle d'import statique ferme.
 */

import * as asyncHooks from 'node:async_hooks';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const CASE_TIMEOUT_MS = 120_000;

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
const PACKAGES = ['contracts', 'domain'] as const;
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');
const MANIFEST_DIR = path.join(REPO, 'acceptance', 'fixtures', 'manifests');

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Canonisation du cahier L82, reimplantee ICI et non importee du paquet teste :
 * « objets JSON tries recursivement par cle ; ordre des tableaux conserve ;
 * UTF-8 ». Importer la canonisation de l'implementation ferait comparer une
 * valeur a elle-meme — c'est le contraire d'une preuve.
 */
function octetsCanoniques(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    const brut = JSON.stringify(v);
    return typeof brut === 'string' ? brut : 'null';
  }
  if (Array.isArray(v)) return `[${v.map(octetsCanoniques).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${octetsCanoniques(o[k])}`)
    .join(',')}}`;
}

const sha256hex = (texte: string): string =>
  createHash('sha256').update(Buffer.from(texte, 'utf8')).digest('hex');

/** L'empreinte d'un corpus : SHA-256 de ses octets canoniques PRIVES du champ `digest`. */
function empreinteCorpus(corpus: Json): string {
  const sansDigest: Json = {};
  for (const [k, val] of Object.entries(corpus)) if (k !== 'digest') sansDigest[k] = val;
  return sha256hex(octetsCanoniques(sansDigest));
}

/** Rendu TEXTUEL d'une valeur quelconque, pour lire un refus sans supposer sa forme. */
function rendu(v: unknown): string {
  if (v instanceof Error) {
    const props: Json = {};
    for (const k of Object.getOwnPropertyNames(v)) {
      if (k === 'stack') continue; // une pile contient des chemins de fichiers : elle ferait
      if (k === 'message') continue; // matcher des segments par accident.
      props[k] = (v as unknown as Json)[k];
    }
    let extra = '';
    try {
      extra = JSON.stringify(props);
    } catch {
      extra = '{}';
    }
    return `${v.name}: ${v.message} ${extra}`;
  }
  try {
    const t = JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
    return typeof t === 'string' ? t : String(v);
  } catch {
    return String(v);
  }
}

/**
 * « Chemin exact » (L181, A4) sans imposer un dialecte de chemin. Le rendu du
 * refus est reduit a une suite de jetons alphanumeriques ; les segments attendus
 * doivent y apparaitre DANS L'ORDRE. `/configurations/1/cadence_de_rafale`,
 * `configurations[1].cadence_de_rafale` et `.configurations.1.cadence_de_rafale`
 * satisfont donc tous les trois, et « le mot cadence_de_rafale traine quelque
 * part » ne suffit pas : l'ordre porte l'information de chemin.
 */
function cheminContient(texte: string, segments: readonly string[]): boolean {
  const jetons = texte.split(/[^A-Za-z0-9_]+/).filter((s) => s.length > 0);
  let i = 0;
  for (const seg of segments) {
    const trouve = jetons.indexOf(seg, i);
    if (trouve === -1) return false;
    i = trouve + 1;
  }
  return true;
}

/**
 * Observe la CREATION de workers et de sous-processus pendant une action, par
 * `async_hooks` : le crochet `init` recoit le type de chaque ressource
 * asynchrone creee, et `node:worker_threads` y apparait en `WORKER`,
 * `child_process.spawn` en `PROCESSWRAP`.
 *
 * `process.getActiveResourcesInfo()` a ete essaye d'abord et ECARTE : sur Node
 * 22 il ne liste NI un worker vivant NI un sous-processus, donc une assertion
 * batie dessus n'observe rien. La sonde retenue porte d'ailleurs son propre
 * TEMOIN POSITIF dans A2 — un worker est reellement cree, et la sonde doit le
 * voir — sans quoi « aucun worker cree » serait indistinguable d'une sonde
 * aveugle.
 *
 * LIMITE ASSUMEE : un sous-processus SYNCHRONE (`execFileSync`, `spawnSync`)
 * n'enregistre aucune ressource asynchrone et echappe a cette sonde. La moitie
 * complete de L183 est un controle STATIQUE des imports du paquet, qui
 * appartient a la chaine de l'implementeur.
 */
async function sousObservation<T>(action: () => Promise<T>): Promise<[T, string[]]> {
  const vus: string[] = [];
  const hook = asyncHooks.createHook({
    init: (_id: number, type: string) => {
      if (/WORKER|PROCESSWRAP|CHILDPROCESS|THREAD/i.test(type)) vus.push(type);
    },
  });
  hook.enable();
  try {
    const r = await action();
    return [r, vus];
  } finally {
    hook.disable();
  }
}

/* ──────────────────────────── fixtures de reference (racine gelee, L139) */

function readReference(name: string): Json {
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${name}.json`), 'utf8')) as Json;
}

function refValue(doc: Json, dotted: string): unknown {
  let cur: unknown = doc;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      throw new Error(`REFERENCE-CHEMIN-ABSENT ${dotted} (bloque a ${seg})`);
    }
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) throw new Error(`REFERENCE-VALEUR-ABSENTE ${dotted}`);
  return cur;
}

/** 1000 micro-USD, le budget du §F. Importe de la racine gelee, jamais recopie. */
const PLAFOND_DE_BUDGET = String(refValue(readReference('F-BUDGET'), 'valeurs.budget.valeur'));

/* ─────────────────────────────── fixtures de manifeste (archive de T03) */

function lireManifeste(nom: string): Json {
  return JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, `${nom}.json`), 'utf8')) as Json;
}

const MINIMAL = lireManifeste('campagne-minimale');
const INVALIDE_DOUBLON = lireManifeste('invalide-id-doublon');
const INVALIDE_INCONNUE = lireManifeste('invalide-propriete-inconnue');
const INVALIDE_SANS_BUDGET = lireManifeste('invalide-budget-absent');
const INVALIDE_EMPREINTE = lireManifeste('invalide-empreinte-mismatch');

/* Valeurs RELUES de l'archive — jamais recopiees a la main dans une assertion. */
const CORPUS = MINIMAL.corpus as Json;
const PROJETS = MINIMAL.projects as Json[];
const SCENARIOS = PROJETS[0]!.scenarios as Json[];
const CONFIGS = MINIMAL.configurations as Json[];
const BUDGETS = MINIMAL.budgets as Json[];
const REPETITIONS = MINIMAL.repetitions as number;
const ID_CAMPAGNE = MINIMAL.campaign_id as string;
const ID_PROJET = PROJETS[0]!.parent_project_id as string;
const ID_SCENARIO = SCENARIOS[0]!.scenario_id as string;
const IDS_CONFIG = CONFIGS.map((c) => c.configuration_id as string);
const ID_BUDGET = BUDGETS[0]!.budget_id as string;
const PROVENANCE_SYNTHETIQUE = SCENARIOS[0]!.corpus_provenance as string;
/** `hybrid` : l'autre valeur de provenance que le cahier atteste. */ // cahier:L413
const PROVENANCE_HYBRIDE = 'hybrid';

/** 1 projet x 1 scenario x 2 configurations x 3 repetitions x 1 budget. */ // cahier:L181
const CELLULES_ATTENDUES = 6;

/** Les six composantes de l'identite d'une trajectoire. */ // cahier:L78
const COMPOSANTES = [
  'campaign_id',
  'parent_project_id',
  'scenario_id',
  'configuration_id',
  'repetition_id',
  'budget_id',
] as const;

/* ──────────────────────────────────────────── chargement des paquets */

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
  for (const [k, v] of Object.entries(ns)) {
    if (k === '__esModule') continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Ns)) {
        put(`${k}.${k2}`, v2);
        put(k2, v2);
      }
    }
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
  // to run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement, ce qui
  // rend le rouge ASSERTION_FAILED — la seule forme de rouge qui prouve quelque
  // chose (cahier L139).
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

/** Premiere assertion de chaque cas : les paquets ont bien ete charges. */
function assertLoaded(): void {
  expect(
    LOADED.ok ? 'charge' : `PAQUETS-NON-CHARGEABLES ${LOADED.attempts.join(' | ')}`,
  ).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ───────────────────────────────────────────── resolution par role */

const C_COMPILE = [
  'compileCampaignManifest',
  'compileManifest',
  'compileCampaign',
  'planCampaign',
  'planCells',
  'expandCampaign',
  'buildCampaignPlan',
  'campaignPlan',
  'compile',
] as const;

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction>();

/**
 * Resolution par role. NE LEVE PAS : un role introuvable doit produire une
 * ASSERTION rouge qui nomme le contrat manquant, pas une exception que le
 * rapport confondrait avec un plantage. C'est `assertContrat()` qui porte
 * l'assertion, et elle est la DEUXIEME de chaque cas.
 */
function resolveOpt(role: string, candidats: readonly string[]): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  for (const c of candidats) {
    const v = LOADED.flat.get(c);
    if (typeof v === 'function') {
      RESOLVED.set(role, v as Fonction);
      return v as Fonction;
    }
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of LOADED.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  for (const c of candidats) {
    const v = lower.get(c.toLowerCase());
    if (typeof v === 'function') {
      RESOLVED.set(role, v as Fonction);
      return v as Fonction;
    }
  }
  return null;
}

/** Deuxieme assertion de chaque cas : le contrat de nommage est satisfait. */
function assertContrat(): void {
  expect(
    resolveOpt('compileCampaignManifest', C_COMPILE) !== null
      ? 'contrat-resolu'
      : `CONTRAT-NON-SATISFAIT role=compileCampaignManifest : aucun export parmi ` +
        `[${C_COMPILE.join(', ')}] (${String(LOADED.exportCount)} exports de premier niveau ` +
        `observes dans ${LOADED.via.join(', ') || 'aucun paquet'})`,
  ).toBe('contrat-resolu');
}

/* ───────────────────────────────────────── lecture d'une compilation */

interface Issue {
  refuse: boolean;
  texte: string;
  cellules: Json[];
  via: string;
}

/** Trouve le tableau de cellules, quelle que soit la cle qui le porte. */
function cellulesDe(v: unknown): Json[] {
  const ressemble = (x: unknown): boolean => {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
    return COMPOSANTES.filter((c) => composante(x as Json, c) !== undefined).length >= 4;
  };
  const tableau = (x: unknown): Json[] | null =>
    Array.isArray(x) && x.length > 0 && x.every(ressemble) ? (x as Json[]) : null;

  const direct = tableau(v);
  if (direct !== null) return direct;
  if (v === null || typeof v !== 'object') return [];
  for (const cle of ['cells', 'cellules', 'identities', 'identites', 'plan', 'units', 'matrix', 'grid']) {
    const hit = tableau((v as Json)[cle]);
    if (hit !== null) return hit;
  }
  for (const val of Object.values(v as Json)) {
    const hit = tableau(val);
    if (hit !== null) return hit;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      for (const sous of Object.values(val as Json)) {
        const hit2 = tableau(sous);
        if (hit2 !== null) return hit2;
      }
    }
  }
  return [];
}

/** Une composante d'identite, a plat ou sous `identity`/`identite`, snake ou camel. */
function composante(cellule: Json, nom: string): unknown {
  const camel = nom.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const portes: Json[] = [cellule];
  for (const cle of ['identity', 'identite', 'id', 'ids']) {
    const sous = cellule[cle];
    if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) portes.push(sous as Json);
  }
  for (const porte of portes) {
    for (const k of [nom, camel]) {
      const v = porte[k];
      if (v !== undefined && v !== null) return v;
    }
  }
  return undefined;
}

/** L'etiquette de provenance d'une cellule (cahier L24). */
function provenanceDe(cellule: Json): unknown {
  const portes: Json[] = [cellule];
  for (const cle of ['identity', 'identite', 'corpus', 'scenario', 'provenance']) {
    const sous = cellule[cle];
    if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) portes.push(sous as Json);
  }
  for (const porte of portes) {
    for (const k of ['corpus_provenance', 'corpusProvenance', 'provenance']) {
      const v = porte[k];
      if (typeof v === 'string') return v;
    }
  }
  return undefined;
}

/** La cle d'identite d'une cellule : les six composantes, dans l'ordre de L78. */
function cleIdentite(cellule: Json): string {
  return COMPOSANTES.map((c) => {
    const v = composante(cellule, c);
    return v === undefined ? `ABSENT:${c}` : `${c}=${String(v)}`;
  }).join(' | ');
}

async function compiler(manifeste: Json, options?: Json): Promise<Issue> {
  const f = resolveOpt('compileCampaignManifest', C_COMPILE);
  if (f === null) {
    return { refuse: true, texte: 'COMPILATEUR-NON-RESOLU', cellules: [], via: 'contrat' };
  }
  let brut: unknown;
  try {
    brut = await Promise.resolve(options === undefined ? f(manifeste) : f(manifeste, options));
  } catch (e) {
    return { refuse: true, texte: `LEVE ${rendu(e)}`, cellules: [], via: 'exception' };
  }
  const texte = rendu(brut);
  if (brut === null || brut === undefined) {
    return { refuse: true, texte: `RENDU-VIDE ${texte}`, cellules: [], via: 'nullish' };
  }
  const cellules = cellulesDe(brut);
  if (typeof brut === 'object' && !Array.isArray(brut)) {
    const o = brut as Json;
    for (const drapeau of ['ok', 'valid', 'valide', 'success', 'accepted']) {
      if (o[drapeau] === false) return { refuse: true, texte: `${drapeau}=false ${texte}`, cellules, via: drapeau };
    }
    for (const cle of ['errors', 'issues', 'problems', 'erreurs', 'violations']) {
      const v = o[cle];
      if (Array.isArray(v) && v.length > 0) {
        return { refuse: true, texte: `${cle}[${String(v.length)}] ${texte}`, cellules, via: cle };
      }
    }
  }
  return { refuse: false, texte, cellules, via: 'valeur' };
}

/** Un manifeste accepte : la compilation n'a pas refuse. Rend ses cellules. */
function exigerAccepte(issue: Issue, quoi: string): Json[] {
  expect(issue.refuse ? `REFUS-INATTENDU ${quoi} : ${issue.texte.slice(0, 400)}` : 'accepte').toBe('accepte');
  return issue.cellules;
}

/** Un manifeste refuse : et AUCUNE cellule produite (le refus precede la production). */
function exigerRefuse(issue: Issue, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${issue.texte.slice(0, 400)}`).toBe('refuse');
  expect(`${quoi} cellules=${String(issue.cellules.length)}`).toBe(`${quoi} cellules=0`);
}

/* ─────────────────────────────────── fabriques de variantes (pures) */

function avecRepetitions(base: Json, n: number, campagne: string): Json {
  const m = clone(base);
  m.repetitions = n;
  m.campaign_id = campagne;
  return m;
}

function avecConfigurations(base: Json, ids: readonly string[], campagne: string): Json {
  const m = clone(base);
  const modele = (m.configurations as Json[])[0]!;
  m.configurations = ids.map((id) => ({ ...clone(modele), configuration_id: id }));
  m.campaign_id = campagne;
  return m;
}

function avecProvenance(base: Json, provenances: readonly string[], campagne: string): Json {
  const m = clone(base);
  const projets = m.projects as Json[];
  const modele = (projets[0]!.scenarios as Json[])[0]!;
  projets[0]!.scenarios = provenances.map((p, i) => ({
    ...clone(modele),
    scenario_id: `${String(modele.scenario_id)}-${String(i + 1)}`,
    corpus_provenance: p,
  }));
  m.campaign_id = campagne;
  return m;
}

/** Reecrit un objet en INVERSANT l'ordre d'insertion de ses cles, recursivement. */
function clesInversees(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clesInversees);
  if (v === null || typeof v !== 'object') return v;
  const o = v as Json;
  const out: Json = {};
  for (const k of Object.keys(o).reverse()) out[k] = clesInversees(o[k]);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════ */

describe('T03 — schemas des contrats E et compilation d un manifeste de campagne', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T03.A1 un manifeste 1x1x2x3x1 produit exactement six identites distinctes',
    async () => {
      assertLoaded();
      assertContrat();

      // (0) L'ARCHIVE EST BIEN CELLE QUE LE CAHIER DECRIT. Sans cette
      //     assertion, « six » ne serait rattache a rien d'observable.
      expect([
        PROJETS.length,
        SCENARIOS.length,
        CONFIGS.length,
        REPETITIONS,
        BUDGETS.length,
      ]).toEqual([1, 1, 2, 3, 1]); // cahier:L181
      expect(
        PROJETS.length * SCENARIOS.length * CONFIGS.length * REPETITIONS * BUDGETS.length,
      ).toBe(CELLULES_ATTENDUES); // cahier:L181
      // Le plafond de la fixture vient de la racine gelee, pas d'une saisie.
      expect(BUDGETS[0]!.limit_micro_usd).toBe(PLAFOND_DE_BUDGET);

      const cellules = exigerAccepte(await compiler(MINIMAL), 'manifeste minimal');

      // (1) l'enonce meme du cas : exactement SIX cellules.
      expect(cellules.length).toBe(CELLULES_ATTENDUES); // cahier:L181

      // (2) chaque cellule porte les SIX composantes de l'identite. Une cle
      //     incomplete se denonce par son marqueur ABSENT:<composante>.
      const cles = cellules.map(cleIdentite);
      expect(cles.filter((k) => k.includes('ABSENT:'))).toEqual([]); // cahier:L78

      // (3) elles sont DEUX A DEUX DISTINCTES — « six identites distinctes ».
      expect(new Set(cles).size).toBe(CELLULES_ATTENDUES); // cahier:L181

      // (4) la decomposition du produit cartesien est celle du cahier : un seul
      //     projet, un seul scenario, DEUX configurations, TROIS repetitions,
      //     un seul budget. C'est ce qui distingue « six cellules » de « six
      //     lignes quelconques » — et c'est ce que la perturbation off-by-one
      //     (boucler les repetitions jusqu'a n-1) fait tomber.
      const distinctes = (c: string): number =>
        new Set(cellules.map((x) => String(composante(x, c)))).size;
      expect(
        COMPOSANTES.map((c) => `${c}=${String(distinctes(c))}`),
      ).toEqual([
        'campaign_id=1',
        'parent_project_id=1',
        'scenario_id=1',
        'configuration_id=2',
        'repetition_id=3',
        'budget_id=1',
      ]); // cahier:L181

      // (5) les identifiants sont ceux du manifeste SOUMIS, pas des inventions.
      expect([...new Set(cellules.map((x) => String(composante(x, 'configuration_id'))))].sort()).toEqual(
        [...IDS_CONFIG].sort(),
      );
      expect([...new Set(cellules.map((x) => String(composante(x, 'campaign_id'))))]).toEqual([ID_CAMPAGNE]);
      expect([...new Set(cellules.map((x) => String(composante(x, 'parent_project_id'))))]).toEqual([ID_PROJET]);
      expect([...new Set(cellules.map((x) => String(composante(x, 'scenario_id'))))]).toEqual([ID_SCENARIO]);
      expect([...new Set(cellules.map((x) => String(composante(x, 'budget_id'))))]).toEqual([ID_BUDGET]);

      // (6) TEMOIN ANTI-CONSTANTE. Un planificateur qui rendrait toujours six
      //     cellules satisferait (1) sans lire son manifeste. Deux formes
      //     differentes doivent donner deux comptes differents — et les deux
      //     comptes sont ceux du produit cartesien, pas des constantes.
      const huit = avecRepetitions(MINIMAL, 4, 'CMP-T03-TEMOIN-HUIT');
      const cellulesHuit = exigerAccepte(await compiler(huit), 'temoin 2x4');
      expect(cellulesHuit.length).toBe(CONFIGS.length * 4);
      expect(new Set(cellulesHuit.map(cleIdentite)).size).toBe(CONFIGS.length * 4);

      const une = avecRepetitions(
        avecConfigurations(MINIMAL, [IDS_CONFIG[0]!], 'CMP-T03-TEMOIN-UNE'),
        1,
        'CMP-T03-TEMOIN-UNE',
      );
      const cellulesUne = exigerAccepte(await compiler(une), 'temoin 1x1');
      expect(cellulesUne.length).toBe(1);

      // (7) le planificateur est PUR (L179) : recompiler le meme manifeste rend
      //     exactement le meme jeu d'identites.
      const encore = exigerAccepte(await compiler(clone(MINIMAL)), 'recompilation');
      expect(encore.map(cleIdentite).sort()).toEqual([...cles].sort()); // cahier:L179

      console.log(
        `[T03.A1] via=${LOADED.via.join(',')} cellules=${String(cellules.length)} ` +
          `temoins=${String(cellulesHuit.length)}/${String(cellulesUne.length)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T03.A2 changer le nombre de workers ne change pas ces identites',
    async () => {
      assertLoaded();
      assertContrat();

      const reference = exigerAccepte(await compiler(MINIMAL), 'reference sans options');
      const clesRef = reference.map(cleIdentite).sort();
      // Le jeu de reference n'est pas trivial : sans cela, « invariant » ne
      // voudrait rien dire.
      expect(clesRef.length).toBe(CELLULES_ATTENDUES); // cahier:L181
      expect(new Set(clesRef).size).toBe(CELLULES_ATTENDUES);

      // (1) l'enonce du cas. Le nombre de workers est une option d'EXECUTION —
      //     L183 : « aucune creation de worker pendant une compilation de
      //     manifeste ». Trois canaux documentes sont essayes ; toute
      //     compilation ACCEPTEE doit rendre le meme jeu d'identites.
      const canaux = ['workers', 'worker_count', 'concurrency'] as const;
      const observes: string[] = [];
      for (const n of [2, 8]) {
        for (const canal of canaux) {
          const issue = await compiler(MINIMAL, { [canal]: n });
          if (issue.refuse) continue;
          observes.push(`${canal}=${String(n)}`);
          expect(issue.cellules.map(cleIdentite).sort()).toEqual(clesRef); // cahier:L181
          expect(issue.cellules.length).toBe(CELLULES_ATTENDUES);
        }
      }
      // Au moins un canal par valeur : sans observation, l'invariance ne serait
      // affirmee sur rien.
      expect(observes.filter((o) => o.endsWith('=2')).length > 0).toBe(true);
      expect(observes.filter((o) => o.endsWith('=8')).length > 0).toBe(true);

      // (2) TEMOIN ANTI-CONSTANTE, decisif ici. verification/cases.lock.json le
      //     nomme : un planificateur constant rendrait les deux cotes de
      //     l'egalite identiques et laisserait le cas VERT. Un facteur
      //     SCIENTIFIQUE doit, lui, changer le jeu d'identites.
      const quatreReps = avecRepetitions(MINIMAL, REPETITIONS + 1, ID_CAMPAGNE);
      const clesQuatre = exigerAccepte(await compiler(quatreReps), 'temoin repetitions+1')
        .map(cleIdentite)
        .sort();
      expect(clesQuatre).not.toEqual(clesRef);
      expect(clesQuatre.length).toBe(CONFIGS.length * (REPETITIONS + 1));

      const autreConfig = avecConfigurations(MINIMAL, [IDS_CONFIG[0]!, 'CFG-Z'], ID_CAMPAGNE);
      const clesAutre = exigerAccepte(await compiler(autreConfig), 'temoin configuration renommee')
        .map(cleIdentite)
        .sort();
      expect(clesAutre).not.toEqual(clesRef);
      expect(clesAutre.length).toBe(CELLULES_ATTENDUES);

      // (3) « aucune creation de worker pendant une compilation de manifeste »
      //     (L183), moitie OBSERVABLE : la sonde existe, et compiler a huit
      //     workers ne fait apparaitre aucune ressource lourde.
      //     TEMOIN DE LA SONDE D'ABORD : un worker est reellement cree, et la
      //     sonde doit le voir. Sans ce temoin, « aucun worker » serait
      //     indistinguable d'une sonde aveugle — c'est exactement le defaut
      //     qu'avait `process.getActiveResourcesInfo()`, ecarte pour cela.
      const [temoin, vusDuTemoin] = await sousObservation(async () => {
        const w = new Worker('0', { eval: true });
        await w.terminate();
        return 'temoin-cree';
      });
      expect(temoin).toBe('temoin-cree');
      expect(
        vusDuTemoin.length > 0
          ? 'sonde-voyante'
          : 'SONDE-AVEUGLE : un worker a ete cree et la sonde n a rien vu',
      ).toBe('sonde-voyante');

      const [pendant, vusDeLaCompilation] = await sousObservation(() =>
        compiler(MINIMAL, { workers: 8 }),
      );
      expect(exigerAccepte(pendant, 'compilation a huit workers').map(cleIdentite).sort()).toEqual(clesRef);
      expect(vusDeLaCompilation).toEqual([]); // cahier:L183

      console.log(
        `[T03.A2] canaux observes=${observes.join(',')} temoin=${vusDuTemoin.join('|')} ` +
          `compilation=${vusDeLaCompilation.join('|') || '(aucune ressource lourde)'}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T03.A3 un id en doublon est rejete',
    async () => {
      assertLoaded();
      assertContrat();

      // VOLET POSITIF D'ABORD. Le refus n'est pas une competence : un
      // compilateur qui refuserait TOUT satisferait l'enonce sans rien
      // verifier. Le manifeste minimal, dont tous les ids sont distincts, doit
      // etre ACCEPTE et produire ses six cellules.
      const sain = exigerAccepte(await compiler(MINIMAL), 'volet positif');
      expect(sain.length).toBe(CELLULES_ATTENDUES); // cahier:L181

      // L'archive porte bien un doublon, et il ne differe du manifeste sain que
      // par cela : sans ce controle, le refus pourrait tenir a autre chose.
      const idsDoublon = (INVALIDE_DOUBLON.configurations as Json[]).map((c) => c.configuration_id);
      expect(idsDoublon).toEqual([IDS_CONFIG[0], IDS_CONFIG[0]]);

      // (1) l'enonce du cas, sur la fixture archivee.
      const issue = await compiler(INVALIDE_DOUBLON);
      exigerRefuse(issue, 'configuration_id en doublon'); // cahier:L181

      // (2) le refus NOMME l'id fautif. Un refus muet ne dit pas ce qu'il a vu.
      const jetonsDeLId = IDS_CONFIG[0]!.split(/[^A-Za-z0-9_]+/).filter((j) => j.length > 0);
      expect(
        cheminContient(issue.texte, jetonsDeLId)
          ? 'nomme'
          : `REFUS-MUET attendait [${jetonsDeLId.join(', ')}] dans ${issue.texte.slice(0, 400)}`,
      ).toBe('nomme');

      // (3) ANTI-DEDUPLICATION SILENCIEUSE. C'est la perturbation que
      //     verification/cases.lock.json prescrit : dedupliquer et compiler avec
      //     succes au lieu de rejeter. Le manifeste dedupliqué donnerait 1
      //     configuration x 3 repetitions = 3 cellules ; aucune ne doit sortir.
      expect(issue.cellules.length).toBe(0);
      expect(issue.cellules.length).not.toBe(CONFIGS.length * REPETITIONS - REPETITIONS);

      // (4) le doublon est refuse sur d'AUTRES porteurs d'id que la
      //     configuration : le cahier dit « un id », pas « un id de
      //     configuration ».
      const budgetDouble = clone(MINIMAL);
      budgetDouble.budgets = [clone(BUDGETS[0]!), clone(BUDGETS[0]!)];
      exigerRefuse(await compiler(budgetDouble), 'budget_id en doublon'); // cahier:L181

      const projetDouble = clone(MINIMAL);
      projetDouble.projects = [clone(PROJETS[0]!), clone(PROJETS[0]!)];
      exigerRefuse(await compiler(projetDouble), 'parent_project_id en doublon'); // cahier:L181

      // (5) SECOND VOLET POSITIF : ce qui est refuse, c'est le DOUBLON D'ID, pas
      //     la ressemblance. Deux configurations d'ids distincts mais de charge
      //     utile identique restent acceptees.
      const jumelles = avecConfigurations(MINIMAL, ['CFG-JUMELLE-1', 'CFG-JUMELLE-2'], ID_CAMPAGNE);
      const cellulesJumelles = exigerAccepte(await compiler(jumelles), 'configurations jumelles');
      expect(cellulesJumelles.length).toBe(CELLULES_ATTENDUES);

      console.log(`[T03.A3] refus=${issue.via} texte=${issue.texte.slice(0, 200)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T03.A4 propriete inconnue ou budget absent rejete avec chemin exact',
    async () => {
      assertLoaded();
      assertContrat();

      // VOLET POSITIF. Le manifeste minimal, sans propriete inconnue et avec son
      // budget, doit etre ACCEPTE — sinon le refus ne mesure rien.
      expect(exigerAccepte(await compiler(MINIMAL), 'volet positif').length).toBe(CELLULES_ATTENDUES);

      // (1) PROPRIETE INCONNUE, NICHEE. L'archive place `cadence_de_rafale`
      //     dans `configurations[1]` : le chemin a donc trois segments.
      const configsInconnue = INVALIDE_INCONNUE.configurations as Json[];
      expect(Object.keys(configsInconnue[1]!)).toContain('cadence_de_rafale');
      const nichee = await compiler(INVALIDE_INCONNUE);
      exigerRefuse(nichee, 'propriete inconnue nichee'); // cahier:L80
      expect(
        cheminContient(nichee.texte, ['configurations', '1', 'cadence_de_rafale'])
          ? 'chemin-exact'
          : `CHEMIN-INEXACT ${nichee.texte.slice(0, 400)}`,
      ).toBe('chemin-exact'); // cahier:L181

      // (2) LE REFUS TIENT A CETTE PROPRIETE, ET A RIEN D'AUTRE : la retirer
      //     rend le manifeste acceptable. Sans ce controle, (1) serait
      //     satisfait par un compilateur qui refuse tout manifeste renomme.
      const reparee = clone(INVALIDE_INCONNUE);
      delete (reparee.configurations as Json[])[1]!.cadence_de_rafale;
      expect(exigerAccepte(await compiler(reparee), 'variante reparee').length).toBe(CELLULES_ATTENDUES);

      // (3) PROPRIETE INCONNUE AU PREMIER NIVEAU.
      const racine = clone(MINIMAL);
      racine.cadence_de_rafale = 7;
      const issueRacine = await compiler(racine);
      exigerRefuse(issueRacine, 'propriete inconnue a la racine'); // cahier:L80
      expect(
        cheminContient(issueRacine.texte, ['cadence_de_rafale'])
          ? 'chemin-exact'
          : `CHEMIN-INEXACT ${issueRacine.texte.slice(0, 400)}`,
      ).toBe('chemin-exact'); // cahier:L181

      // (4) BUDGET ABSENT. L'archive a bien perdu la cle, et rien d'autre.
      expect(Object.keys(INVALIDE_SANS_BUDGET)).not.toContain('budgets');
      expect(Object.keys(MINIMAL)).toContain('budgets');
      const sansBudget = await compiler(INVALIDE_SANS_BUDGET);
      exigerRefuse(sansBudget, 'budget absent'); // cahier:L181
      expect(
        cheminContient(sansBudget.texte, ['budgets'])
          ? 'chemin-exact'
          : `CHEMIN-INEXACT ${sansBudget.texte.slice(0, 400)}`,
      ).toBe('chemin-exact'); // cahier:L181

      // (5) LE REFUS TIENT A L'ABSENCE DU BUDGET : le lui rendre suffit.
      const rendueAuBudget = clone(INVALIDE_SANS_BUDGET);
      rendueAuBudget.budgets = clone(BUDGETS);
      expect(exigerAccepte(await compiler(rendueAuBudget), 'budget rendu').length).toBe(CELLULES_ATTENDUES);

      console.log(
        `[T03.A4] nichee=${nichee.texte.slice(0, 160)} | budget=${sansBudget.texte.slice(0, 160)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T03.A5 un scenario de provenance synthetique reste etiquete synthetique dans toutes les cellules',
    async () => {
      assertLoaded();
      assertContrat();

      // L'archive declare bien une provenance synthetique sur son scenario.
      expect(PROVENANCE_SYNTHETIQUE).toBe('synthetic'); // cahier:L413
      expect((CORPUS as Json).corpus_provenance).toBe(PROVENANCE_SYNTHETIQUE); // cahier:L24

      // (1) l'enonce du cas : TOUTES les cellules, sans exception.
      const cellules = exigerAccepte(await compiler(MINIMAL), 'manifeste synthetique');
      expect(cellules.length).toBe(CELLULES_ATTENDUES);
      expect(cellules.map(provenanceDe)).toEqual(
        Array.from({ length: CELLULES_ATTENDUES }, () => PROVENANCE_SYNTHETIQUE),
      ); // cahier:L181
      // Aucune cellule sans etiquette : `undefined` ne se confond pas avec
      // « synthetique ».
      expect(cellules.filter((c) => provenanceDe(c) === undefined)).toEqual([]); // cahier:L24

      // (2) TEMOIN ANTI-CONSTANTE. Une etiquette constante `synthetic`
      //     satisferait (1) sans rien propager. Un scenario `hybrid` doit
      //     produire des cellules `hybrid`, et AUCUNE `synthetic`.
      const hybride = avecProvenance(MINIMAL, [PROVENANCE_HYBRIDE], 'CMP-T03-HYBRIDE');
      const cellulesHybrides = exigerAccepte(await compiler(hybride), 'scenario hybride');
      expect(cellulesHybrides.length).toBe(CELLULES_ATTENDUES);
      expect([...new Set(cellulesHybrides.map(provenanceDe))]).toEqual([PROVENANCE_HYBRIDE]); // cahier:L413
      expect(cellulesHybrides.filter((c) => provenanceDe(c) === PROVENANCE_SYNTHETIQUE)).toEqual([]);

      // (3) L'ETIQUETTE SUIT LE SCENARIO, pas le manifeste. Deux scenarios de
      //     provenances differentes dans le MEME manifeste : chaque cellule
      //     porte celle de SON scenario. C'est ce qui tue la mutation
      //     « heriter d'une provenance par defaut » aussi bien que
      //     « recopier la provenance du corpus ».
      const melange = avecProvenance(
        MINIMAL,
        [PROVENANCE_SYNTHETIQUE, PROVENANCE_HYBRIDE],
        'CMP-T03-MELANGE',
      );
      const cellulesMelange = exigerAccepte(await compiler(melange), 'deux scenarios');
      expect(cellulesMelange.length).toBe(CELLULES_ATTENDUES * 2);

      const parScenario = new Map<string, Set<string>>();
      for (const c of cellulesMelange) {
        const s = String(composante(c, 'scenario_id'));
        if (!parScenario.has(s)) parScenario.set(s, new Set());
        parScenario.get(s)!.add(String(provenanceDe(c)));
      }
      const scenariosDeclares = (melange.projects as Json[])[0]!.scenarios as Json[];
      expect(
        scenariosDeclares.map(
          (s) => `${String(s.scenario_id)}=>${[...(parScenario.get(String(s.scenario_id)) ?? [])].join('+')}`,
        ),
      ).toEqual(
        scenariosDeclares.map((s) => `${String(s.scenario_id)}=>${String(s.corpus_provenance)}`),
      ); // cahier:L181

      // (4) le corpus du manifeste melange reste `synthetic` : l'etiquette
      //     hybride des cellules du second scenario ne peut donc pas venir de la
      //     provenance du corpus.
      expect((melange.corpus as Json).corpus_provenance).toBe(PROVENANCE_SYNTHETIQUE);

      console.log(
        `[T03.A5] synthetique=${String(cellules.length)} hybride=${String(cellulesHybrides.length)} ` +
          `melange=${[...parScenario.entries()].map(([s, p]) => `${s}:${[...p].join('+')}`).join(' ')}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T03.A6 empreinte verifiee avant toute execution et mismatch refuse',
    async () => {
      assertLoaded();
      assertContrat();

      // (0) L'ARCHIVE EST COHERENTE AVEC LA REGLE DU CAHIER, ET LA REGLE EST
      //     RECALCULEE ICI. L'empreinte comparee plus bas n'a pas ete relevee
      //     d'une execution de l'implementation : elle est le SHA-256 des
      //     octets canoniques de L82, calcules par cette suite.
      const attendue = empreinteCorpus(CORPUS);
      expect(CORPUS.digest).toBe(attendue); // cahier:L82
      expect(/^[0-9a-f]{64}$/.test(attendue)).toBe(true); // cahier:L82

      // VOLET POSITIF. Une empreinte juste ne doit pas etre refusee : sinon le
      // cas serait satisfait par un compilateur qui refuse tout.
      const cellules = exigerAccepte(await compiler(MINIMAL), 'empreinte juste');
      expect(cellules.length).toBe(CELLULES_ATTENDUES);
      const clesRef = cellules.map(cleIdentite).sort();

      // (1) MISMATCH D'EMPREINTE DECLAREE. L'archive ne differe du manifeste
      //     sain que par un caractere hexadecimal du digest ; le contenu du
      //     corpus est intact.
      const corpusFausse = INVALIDE_EMPREINTE.corpus as Json;
      expect(corpusFausse.digest).not.toBe(attendue);
      expect(empreinteCorpus(corpusFausse)).toBe(attendue);
      const mismatch = await compiler(INVALIDE_EMPREINTE);
      exigerRefuse(mismatch, 'empreinte declaree fausse'); // cahier:L181

      // (2) le refus NOMME l'empreinte. Un refus qui tomberait pour une autre
      //     raison ne prouverait pas que l'empreinte a ete verifiee.
      expect(
        /digest|empreinte|fingerprint|checksum|sha-?256|mismatch|hash/i.test(mismatch.texte)
          ? 'nomme-l-empreinte'
          : `REFUS-HORS-SUJET ${mismatch.texte.slice(0, 400)}`,
      ).toBe('nomme-l-empreinte');

      // (3) MISMATCH PAR LE CONTENU. Le digest declare reste celui de l'archive
      //     saine ; c'est le corpus qui a bouge. Un controle qui ne relirait que
      //     le champ declare laisserait passer ce cas.
      const contenuMute = clone(MINIMAL);
      const corpusMute = contenuMute.corpus as Json;
      (corpusMute.entries as Json[])[0]!.entry_id = 'reservation-001-ALTEREE';
      expect(corpusMute.digest).toBe(attendue);
      expect(empreinteCorpus(corpusMute)).not.toBe(attendue);
      exigerRefuse(await compiler(contenuMute), 'contenu du corpus altere'); // cahier:L181

      // (4) « AVANT TOUTE EXECUTION ». Le refus precede la production : aucune
      //     cellule ne sort (assertions portees par exigerRefuse), et aucune
      //     ressource lourde n'apparait — rien n'a ete lance avant le controle.
      const [refuseAvecWorkers, vusPendantLeRefus] = await sousObservation(() =>
        compiler(INVALIDE_EMPREINTE, { workers: 8 }),
      );
      exigerRefuse(refuseAvecWorkers, 'empreinte fausse, huit workers demandes'); // cahier:L181
      expect(vusPendantLeRefus).toEqual([]); // cahier:L183

      // (5) L'EMPREINTE PORTE SUR DES OCTETS CANONIQUES, PAS SUR UN TEXTE. Le
      //     meme corpus, ses cles reecrites en ordre inverse a tous les niveaux,
      //     garde la MEME empreinte declaree et doit rester ACCEPTE — et rendre
      //     le meme plan. C'est la contrepartie exacte de (1) : ce qui est
      //     refuse, c'est un contenu different, pas une redaction differente.
      const permute = clone(MINIMAL);
      permute.corpus = clesInversees(CORPUS) as Json;
      expect(Object.keys(permute.corpus as Json)).toEqual([...Object.keys(CORPUS)].reverse());
      expect((permute.corpus as Json).digest).toBe(attendue);
      const cellulesPermutees = exigerAccepte(await compiler(permute), 'corpus aux cles permutees');
      expect(cellulesPermutees.map(cleIdentite).sort()).toEqual(clesRef); // cahier:L82

      console.log(
        `[T03.A6] attendue=${attendue.slice(0, 12)}… refus=${mismatch.via} ` +
          `texte=${mismatch.texte.slice(0, 160)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
