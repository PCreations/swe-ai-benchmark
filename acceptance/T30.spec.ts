/**
 * acceptance/T30.spec.ts — suite d'acceptation de la tache T30.
 *
 * Cas requis (verification/cases.lock.json, gele — TOUS classes `refusal`) :
 *   T30.A1 refusal — meme projet parent dans calibration et test : refuse
 *   T30.A2 refusal — scenario non qualifie, ou modele/tarif non renseigne : refuse
 *   T30.A3 refusal — graine ou marge modifiee apres gel : mismatch
 *   T30.A4 refusal — mode confirme exige metriques, effectif, budgets, regles
 *                    d'arret : refuse si l'un manque
 *   T30.A5 refusal — signature ou recu falsifie : rejete
 *   T30.A6 refusal — recu local de test porte test_only=true et NE PEUT PAS
 *                    etre presente comme horodatage independant reel
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T30 — `packages/scenario`,
 * `packages/contracts`, `apps/cli`. ADR-001 : cet aveuglement est PROCEDURAL,
 * donc une discipline auditable au diff, pas une barriere technique. Le
 * contrat teste ci-dessous n'a PAS ete releve dans une implementation ; il est
 * derive de docs/specs/T30.md, c'est-a-dire des lignes du cahier que la carte
 * de specification epingle :
 *
 *   L417  livrables : « preflight, export canonique signe/hache, split par
 *         projet parent et port d'horodatage »
 *   L419  les six cas d'acceptation, mot pour mot — et `cahier_line: 419` dans
 *         verification/cases.lock.json pour chacun des six
 *   L421  fin : « campagne scellee exportable et `registration_status`
 *         fidele. L'integration vers une archive externe necessite une
 *         destination accessible et configuree ; l'absence de cette preuve
 *         bloque une revendication de preenregistrement, sans empecher les
 *         campagnes de developpement etiquetees comme telles. »
 *   L69   invariant 8 : « les graines, budgets, conditions, versions et
 *         regles de validation sont figes avant une campagne de mesure »
 *   L82   empreintes SHA-256 sur octets canoniques ; graines derivees par
 *         quatre flux : `scenario`, `workload`, `assignment`, `bootstrap`
 *   L95   `PeriodResult` : « ... Q, R, G, statut et empreintes de preuve »
 *   L451  (bloc T34, etiquete applies: T30.A3, T30.A4) « Marges d'exemple
 *         0,02 »
 *   L13   « toute modification d'un resultat attendu ... exige une
 *         modification explicite et tracee de ce cahier, jamais
 *         l'assouplissement silencieux d'un test »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des trois sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/**` — racine gelee,
 *       docs/FROZEN_ROOTS.json. C'est le cas du plafond de budget `1000`
 *       (F-BUDGET, cahier L105) et du tarif `340` (F-MONEY, cahier L103).
 *   (b) un commentaire `// cahier:L<n>` resoluble par
 *       `sed -n '<n>p' docs/cahier.md` — la marge `0.02` (L451), les
 *       metriques `Q`/`R`/`G` (L95), les quatre flux de graine (L82).
 *   (c) une valeur LUE dans la fixture archivee de ce depot
 *       (`acceptance/fixtures/preregistration/`), elle-meme ecrite par ce
 *       role et documentee dans son README. Les identifiants
 *       (`PRJ-CAL-1`, `SCN-CAL-1`, `agent-scripted-v1`, les `campaign_id`)
 *       sont de cette nature : la suite ne les recopie jamais a la main dans
 *       une assertion, elle les RELIT du bundle soumis.
 *
 * Aucune valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. La suite ne reimplemente NI le hash canonique
 * NI la signature : les reimplanter ferait comparer une valeur a elle-meme.
 * Elle observe des PROPRIETES COMPORTEMENTALES (section IV) obtenues en
 * utilisant les fonctions PUBLIEES du contrat sur des entrees qu'elle
 * construit et mute elle-meme.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T30 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Aucun de ces noms, schemas ou conventions d'appel n'existe dans le cahier :
 * ils sont la CONVENTION que cette suite publie, au meme titre que
 * `bench.qualification.scenario/1` pour T10 (acceptance/T10.spec.ts, section
 * III). Un desaccord de vocabulaire entre cette convention et l'implementation
 * produit une ASSERTION rouge qui nomme le role manquant — jamais un import
 * casse, que verification/runner/red.mjs classe MODULE_NOT_FOUND et refuse
 * comme preuve.
 *
 *   preflightCampaign(bundle)                le preflight            (L417)
 *   freezeCampaign(bundle)                   export signe/hache       (L417)
 *   verifyFreezeIntegrity(frozen, bundle)    detection de mismatch    (L69)
 *   issueLocalTestReceipt(frozen)            reçu LOCAL DE TEST       (L421)
 *   verifyRegistrationReceipt(frozen, recu)  verification du reçu     (L421)
 *
 * QUATRE CONVENTIONS QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC FIXEES ICI
 * (elles sont reprises telles quelles dans verification/mutants/T30.json) :
 *
 *   1. BUNDLE DE PREENREGISTREMENT — `bench.preregistration.bundle/1`. Deux
 *      splits `calibration` et `test`, chacun `{ entries: [{
 *      parent_project_id, scenario_id, qualified, model, tariff_micro_usd
 *      }] }`. Le reste du bundle : `registration_mode` (`draft`|`confirmed`),
 *      `seeds` (les quatre flux de L82), `margins`, `metrics`, `sample_size`,
 *      `budgets`, `stopping_rules`. Objet PLAT et documente en detail dans
 *      `acceptance/fixtures/preregistration/README.md`.
 *
 *   2. VERDICT D'UN APPEL. `preflightCampaign` et `freezeCampaign` peuvent
 *      refuser en LEVANT ou en RENDANT un refus (`ok:false`/`valid:false`/
 *      `errors:[...]`) : le cahier prescrit un rejet, pas un mecanisme. Ce qui
 *      N'EST PAS un refus, c'est de rendre une valeur SANS aucun de ces
 *      marqueurs — et c'est exactement ce que chaque volet positif mesure.
 *      `freezeCampaign`, ACCEPTE, rend un objet (a plat ou sous `frozen`/
 *      `export`/`sealed`/`result`) portant au moins `manifest_hash` (alias
 *      `hash`/`digest`/`fingerprint`/`empreinte`) et `signature` (alias
 *      `sig`).
 *
 *   3. RECU D'HORODATAGE. Objet portant `signature` (alias `sig`) et une
 *      CHARGE UTILE — a plat, ou sous `payload`/`body`/`contents`/`data` —
 *      qui porte au moins `manifest_hash`, `test_only` (booleen) et
 *      `campaign_id`. `issueLocalTestReceipt` rend TOUJOURS `test_only: true`
 *      (« reçu LOCAL DE TEST », L421) ; c'est le port d'horodatage
 *      substituable de L15, dans sa variante qui ne suppose aucune
 *      destination externe accessible.
 *
 *   4. RAPPORT DE VERIFICATION. `verifyFreezeIntegrity` rend un objet portant
 *      un verdict booleen (`match`/`matches`/`consistent`/`coherent`/`ok`/
 *      `valid`/`integrity_ok`) ; sa forme textuelle complete est relue pour
 *      verifier qu'elle NOMME le champ fautif (section V, danger 2).
 *      `verifyRegistrationReceipt` rend un objet portant `valid` (memes
 *      alias) et `registration_status` (alias `status`/`statut`).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LE REFUS N'EST PAS UNE COMPETENCE — LE DANGER COMMUN AUX SIX CAS.
 *
 * verification/cases.lock.json le dit pour A1 et A5 explicitement : « un stub
 * qui leve garderait ce cas VERT ». C'est vrai des SIX cas de T30, qui sont
 * TOUS classes `refusal`. Chaque cas porte donc son VOLET POSITIF, dans le
 * MEME test : un bundle qui ne differe du bundle refuse que par l'absence
 * EXACTE du defaut cible doit etre ACCEPTE.
 *
 *   A1 — `bundle-minimale.json` (parents disjoints) est ACCEPTE avant que
 *        `bundle-parent-partage.json` (meme parent) soit REFUSE.
 *   A2 — le meme bundle minimal est ACCEPTE avant les deux variantes
 *        (`non-qualifie`, `tarif-absent`) refusees separement.
 *   A3 — le gel du bundle minimal, REVERIFIE contre lui-meme sans aucune
 *        modification, doit rester COHERENT (match) avant qu'une graine ou une
 *        marge modifiee produise un mismatch.
 *   A4 — le bundle minimal `confirmed`, complet, est ACCEPTE ; ET
 *        `bundle-brouillon-incomplet.json` (`draft`, memes quatre champs
 *        vides) reste ACCEPTE — CONTROLE decisif : sans lui, une exigence
 *        universelle (au lieu de specifique au mode confirme) satisferait
 *        A4 en refusant tout brouillon incomplet, ce que le cahier n'affirme
 *        pas.
 *   A5 — un reçu GENUINE (emis par `issueLocalTestReceipt`, non modifie) est
 *        ACCEPTE avant que ses deux variantes falsifiees (signature alteree,
 *        charge utile alteree) soient REJETEES.
 *   A6 — le reçu genuine porte bien `test_only: true` et EST ACCEPTE (un
 *        verificateur qui rejette tout reçu de test satisferait la moitie
 *        naive de l'enonce sans rien prouver) ; ce qui est refuse, c'est la
 *        REVENDICATION d'un statut independant/reel a partir de lui.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * DEUX AUTRES DANGERS PROPRES A T30.
 *
 * (1) LE CONSTRUCTEUR DE HASH CONSTANT (A3). Un `freezeCampaign` qui rendrait
 *     toujours le meme `manifest_hash` (ou `verifyFreezeIntegrity` qui rend
 *     toujours `match:true`) satisferait un controle qui ne comparerait que le
 *     VERDICT sur le bundle INCHANGE. A3 exige donc un TEMOIN ANTI-CONSTANTE
 *     dans l'autre sens : un bundle dont SEULE la graine change doit produire
 *     un mismatch, et un bundle dont SEULE la marge change egalement — deux
 *     temoins distincts, parce que la mutation ciblee de
 *     verification/cases.lock.json vise « exclure les champs graine ET
 *     marge » (les deux, pas un seul).
 *
 * (2) LE REFUS MUET (A1, A3, A4). Un refus qui ne nomme rien ne prouve pas
 *     qu'il a vu le bon defaut — c'est exactement ce qu'un validateur qui
 *     refuse TOUJOURS produirait, avec un message generique. A1 exige que le
 *     refus NOMME le `parent_project_id` partage ; A3 exige qu'il NOMME
 *     « seed »/« graine » puis « margin »/« marge » separement ; A4 exige
 *     qu'il NOMME AU MOINS un des quatre champs manquants.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • Elle ne prouve PAS qu'une archive externe reelle a ete contactee : L421
 *    dit explicitement que cette preuve exige « une destination accessible et
 *    configuree », absente des tests ordinaires (cahier L24 : « les tests
 *    ordinaires n'appellent aucun fournisseur externe »). Elle prouve
 *    l'INVERSE : qu'un reçu qui n'a PAS ete produit par une telle destination
 *    (`issueLocalTestReceipt`, explicitement local) ne peut pas usurper le
 *    statut qu'elle donnerait.
 *  • Elle n'impose ni format de stockage ni schema JSON Schema formel pour le
 *    bundle ou l'export gele : seulement les champs que les six cas
 *    observent.
 *  • L'algorithme de hash et de signature n'est pas specifie ; seules ses
 *    PROPRIETES (deterministe sur un bundle inchange, sensible a la graine et
 *    a la marge, verifiable, non falsifiable) le sont.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 60_000;

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
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');
const BUNDLE_DIR = path.join(REPO, 'acceptance', 'fixtures', 'preregistration');
const PACKAGES = ['scenario', 'contracts'] as const;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Rendu TEXTUEL PROFOND, pour lire un refus ou un rapport sans supposer sa forme. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 8) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

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

/** 1000 micro-USD, le plafond de budget du §F. Importe de la racine gelee. */
const PLAFOND_DE_BUDGET = String(refValue(readReference('F-BUDGET'), 'valeurs.budget.valeur'));
/** 340 micro-USD, le cout de l'appel de reference du §F. Importe de la racine gelee. */
const TARIF_DE_REFERENCE = String(
  refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.cout_attendu.valeur'),
);

/* ─────────────────────────────── fixtures de bundle (archive de T30) */

function lireBundle(nom: string): Json {
  return JSON.parse(fs.readFileSync(path.join(BUNDLE_DIR, `${nom}.json`), 'utf8')) as Json;
}

const MINIMALE = lireBundle('bundle-minimale');
const PARENT_PARTAGE = lireBundle('bundle-parent-partage');
const SCENARIO_NON_QUALIFIE = lireBundle('bundle-scenario-non-qualifie');
const TARIF_ABSENT = lireBundle('bundle-tarif-absent');
const CONFIRME_INCOMPLET = lireBundle('bundle-confirme-incomplet');
const BROUILLON_INCOMPLET = lireBundle('bundle-brouillon-incomplet');

/** Valeurs RELUES de l'archive — jamais recopiees a la main dans une assertion. */
const PARENT_PARTAGE_ID = (
  (PARENT_PARTAGE.calibration as Json).entries as Json[]
)[0]!.parent_project_id as string;

/* ─────────────────────────── chargement des source_paths de T30 ────────── */

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

/** Fichiers d'entree cherches sous apps/cli, dans cet ordre. */
function specifiersForApp(app: string): string[] {
  const dir = path.join(REPO, 'apps', app);
  const out: string[] = [];
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

/** LE SUJET : les trois `source_paths` que verification/tasks.json declare pour T30. */
function specifiersDuSujet(): string[] {
  return [...PACKAGES.flatMap((p) => specifiersForPackage(p)), ...specifiersForApp('cli')];
}

async function charger(specs: string[]): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  if (specs.length === 0) attempts.push('aucun point d entree sous packages/scenario, packages/contracts ni apps/cli');
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

beforeAll(async () => {
  // Le chargement ne LEVE pas : un import casse produirait « Test suite failed
  // to run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement, ce qui
  // rend le rouge ASSERTION_FAILED — la seule forme de rouge qui prouve quelque
  // chose (cahier L139).
  LOADED = await charger(specifiersDuSujet());
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `SUJET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ───────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  preflightCampaign: [
    'preflightCampaign',
    'campaignPreflight',
    'preflight',
    'runPreflight',
    'preflightCheck',
    'preflightRegistration',
    'preflightBundle',
  ],
  freezeCampaign: [
    'freezeCampaign',
    'freezeAndRegisterCampaign',
    'sealCampaign',
    'freezeRegistration',
    'preregisterCampaign',
    'freezeAndExportCampaign',
    'exportFrozenCampaign',
    'freezeBundle',
  ],
  verifyFreezeIntegrity: [
    'verifyFreezeIntegrity',
    'verifyCampaignFreeze',
    'checkFreezeMismatch',
    'verifySeal',
    'verifyFrozenIntegrity',
    'checkFreezeIntegrity',
    'verifyFreeze',
  ],
  issueLocalTestReceipt: [
    'issueLocalTestReceipt',
    'issueTestReceipt',
    'localTestReceipt',
    'issueReceipt',
    'createLocalTestReceipt',
    'mintLocalTestReceipt',
    'emitLocalTestReceipt',
  ],
  verifyRegistrationReceipt: [
    'verifyRegistrationReceipt',
    'verifyReceipt',
    'validateReceipt',
    'checkTimestampReceipt',
    'verifyPreregistrationReceipt',
    'verifyTimestampReceipt',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role]!;
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
  RESOLVED.set(role, null);
  return null;
}

function assertContrat(...roles: string[]): void {
  const manquants = roles.filter((r) => resolveOpt(r) === null);
  expect(
    manquants.length === 0
      ? 'contrat-resolu'
      : `CONTRAT-NON-SATISFAIT roles=[${manquants.join(', ')}] : aucun export parmi ` +
          manquants.map((r) => `${r}:[${ROLES[r]!.join('|')}]`).join(' ; ') +
          ` (${String(LOADED.exportCount)} exports de premier niveau observes dans ` +
          `${LOADED.via.join(', ') || 'aucun module'})`,
  ).toBe('contrat-resolu');
}

/* ─────────────────────────── appel d'un role : un jet N'EST PAS un refus */

interface Appel {
  ok: boolean;
  valeur: unknown;
  erreur: string;
}

async function appeler(role: string, ...args: unknown[]): Promise<Appel> {
  const f = resolveOpt(role);
  if (f === null) return { ok: false, valeur: undefined, erreur: `role ${role} non resolu` };
  try {
    const v: unknown = await Promise.resolve(f(...args));
    return { ok: true, valeur: v, erreur: '' };
  } catch (e) {
    const err = e as Error;
    return { ok: true, valeur: err, erreur: '' }; // un LEVE est un REFUS legitime (convention 2)
  }
}

/* ───────────────────────── lecture tolerante d'un rapport (convention 2, 4) */

function champ(o: unknown, motif: RegExp, profondeur = 2): unknown {
  if (o === null || typeof o !== 'object') return undefined;
  const niveaux: unknown[][] = [[o]];
  for (let d = 0; d <= profondeur; d += 1) {
    const courant = niveaux[d] ?? [];
    const suivant: unknown[] = [];
    for (const n of courant) {
      if (n === null || typeof n !== 'object' || Array.isArray(n)) continue;
      for (const [k, v] of Object.entries(n as Json)) {
        if (motif.test(k) && v !== undefined && v !== null) return v;
      }
      for (const v of Object.values(n as Json)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) suivant.push(v);
      }
    }
    niveaux.push(suivant);
  }
  return undefined;
}

function champBooleen(o: unknown, motif: RegExp): boolean | null {
  const v = champ(o, motif);
  return typeof v === 'boolean' ? v : null;
}

function champChaine(o: unknown, motif: RegExp): string | null {
  const v = champ(o, motif);
  if (typeof v === 'string') return v;
  return null;
}

const CLE_REFUS_BOOL = /^(ok|valid|valide|success|accepted|accepte|ready|pret|passed)$/i;
const CLE_ERREURS = /^(errors|issues|problems|erreurs|violations|reasons|raisons)$/i;
const CLE_HASH = /^(manifest_hash|hash|digest|fingerprint|empreinte)$/i;
const CLE_SIGNATURE = /^(signature|sig)$/i;
const CLE_STATUT = /^(registration_status|status|statut)$/i;
const CLE_MATCH = /^(match|matches|consistent|coherent|integrity_ok|identique)$/i;

/** Un jet est un REFUS (convention 2) ; sinon lit les marqueurs ok/errors usuels. */
interface Issue {
  refuse: boolean;
  texte: string;
  brut: unknown;
}

function lireIssue(a: Appel): Issue {
  if (a.valeur instanceof Error) return { refuse: true, texte: `LEVE ${a.valeur.name}: ${a.valeur.message}`, brut: a.valeur };
  const v = a.valeur;
  const texte = rendu(v);
  if (v === null || v === undefined) return { refuse: true, texte: `RENDU-VIDE ${texte}`, brut: v };
  if (typeof v === 'object') {
    const o = v as Json;
    for (const k of Object.keys(o)) {
      if (CLE_REFUS_BOOL.test(k) && o[k] === false) return { refuse: true, texte: `${k}=false ${texte}`, brut: v };
    }
    for (const k of Object.keys(o)) {
      const val = o[k];
      if (CLE_ERREURS.test(k) && Array.isArray(val) && val.length > 0) {
        return { refuse: true, texte: `${k}[${String(val.length)}] ${texte}`, brut: v };
      }
    }
  }
  return { refuse: false, texte, brut: v };
}

function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(issue.refuse ? `REFUS-INATTENDU ${quoi} : ${court(issue.texte)}` : 'accepte').toBe('accepte');
  return issue.brut;
}

function exigerRefuse(issue: Issue, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(issue.texte)}`).toBe('refuse');
}

/** Recherche l'objet frozen sous le brut accepte, quelle que soit la cle. */
function frozenDe(brut: unknown): Json {
  if (brut !== null && typeof brut === 'object') {
    const o = brut as Json;
    if (champ(o, CLE_HASH, 0) !== undefined) return o;
    for (const cle of ['frozen', 'export', 'sealed', 'result', 'gel']) {
      const sous = o[cle];
      if (sous !== null && typeof sous === 'object' && !Array.isArray(sous) && champ(sous, CLE_HASH, 0) !== undefined) {
        return sous as Json;
      }
    }
  }
  return (brut ?? {}) as Json;
}

/* ─────────────────── decomposition et alteration d'un reçu (convention 3) */

function decomposerRecu(recu: Json): { payload: Json; payloadKey: string | null; signatureKey: string | null } {
  let signatureKey: string | null = null;
  for (const k of Object.keys(recu)) if (CLE_SIGNATURE.test(k)) signatureKey = k;
  for (const cle of ['payload', 'body', 'contents', 'data']) {
    const v = recu[cle];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return { payload: v as Json, payloadKey: cle, signatureKey };
    }
  }
  return { payload: recu, payloadKey: null, signatureKey };
}

function bascule(s: string): string {
  if (s.length === 0) return 'X';
  const dernier = s.slice(-1);
  return `${s.slice(0, -1)}${dernier === 'a' ? 'b' : 'a'}`;
}

/** Variante avec la SIGNATURE alteree, charge utile intacte. */
function recuSignatureAlteree(recu: Json): Json {
  const r = clone(recu);
  const { signatureKey } = decomposerRecu(r);
  if (signatureKey !== null) r[signatureKey] = bascule(String(r[signatureKey]));
  else r.signature = 'FALSIFIEE-AUCUNE-SIGNATURE-TROUVEE';
  return r;
}

/** Variante avec la CHARGE UTILE alteree (manifest_hash), signature INCHANGEE. */
function recuChargeAlteree(recu: Json): Json {
  const r = clone(recu);
  const { payload, payloadKey } = decomposerRecu(r);
  const p = clone(payload);
  const cleHash = Object.keys(p).find((k) => CLE_HASH.test(k));
  if (cleHash !== undefined) p[cleHash] = bascule(String(p[cleHash]));
  else p.manifest_hash = 'ALTEREE-CHAMP-ABSENT';
  if (payloadKey !== null) r[payloadKey] = p;
  else Object.assign(r, p);
  return r;
}

/** Variante ou `test_only` est force a `false`, signature INCHANGEE — tentative de blanchiment. */
function recuTestOnlyForce(recu: Json, val: boolean): Json {
  const r = clone(recu);
  const { payload, payloadKey } = decomposerRecu(r);
  const p = clone(payload);
  const cle = Object.keys(p).find((k) => /^(test_only|testonly|is_test|local_only)$/i.test(k)) ?? 'test_only';
  p[cle] = val;
  if (payloadKey !== null) r[payloadKey] = p;
  else Object.assign(r, p);
  return r;
}

/* ══════════════════════════════════════════════════════════════════════ */

describe('T30 — geler et preenregistrer les campagnes', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T30.A1 meme parent dans calibration et test refuse',
    async () => {
      assertLoaded();
      assertContrat('preflightCampaign');

      // L'ARCHIVE EST BIEN CELLE QUE LE README DECRIT.
      expect((MINIMALE.calibration as Json).entries).not.toEqual([]);
      const calParents = ((MINIMALE.calibration as Json).entries as Json[]).map((e) => e.parent_project_id);
      const testParents = ((MINIMALE.test as Json).entries as Json[]).map((e) => e.parent_project_id);
      expect(calParents.some((p) => testParents.includes(p))).toBe(false); // cahier:L419

      // VOLET POSITIF D'ABORD. Le refus n'est pas une competence : un
      // preflight qui refuserait TOUT satisferait l'enonce sans rien
      // verifier. Le bundle minimal, aux parents disjoints, doit etre ACCEPTE.
      exigerAccepte(lireIssue(await appeler('preflightCampaign', clone(MINIMALE))), 'volet positif');

      // L'ARCHIVE DU DEFAUT NE DIFFERE QUE PAR LE PARENT PARTAGE.
      const calParentsPP = ((PARENT_PARTAGE.calibration as Json).entries as Json[]).map((e) => e.parent_project_id);
      const testParentsPP = ((PARENT_PARTAGE.test as Json).entries as Json[]).map((e) => e.parent_project_id);
      expect(testParentsPP).toEqual(calParentsPP); // cahier:L419 — meme parent

      // (1) L'ENONCE DU CAS.
      const issue = lireIssue(await appeler('preflightCampaign', clone(PARENT_PARTAGE)));
      exigerRefuse(issue, 'parent partage entre calibration et test'); // cahier:L419

      // (2) LE REFUS NOMME LE PARENT FAUTIF.
      expect(
        issue.texte.includes(PARENT_PARTAGE_ID) ? 'nomme' : `REFUS-MUET attendait ${PARENT_PARTAGE_ID} dans ${court(issue.texte)}`,
      ).toBe('nomme');

      // (3) ANTI-DEDUPLICATION SILENCIEUSE : le bundle n'est pas simplement
      //     accepte avec le split de test vide ou fusionne. Aucun champ de
      //     l'issue de refus ne rend un split de test a zero entree — la
      //     suite lit directement l'archive, pas une reponse RECALCULEE.
      expect(((PARENT_PARTAGE.test as Json).entries as Json[]).length).toBe(1);

      // (4) SECOND VOLET POSITIF : ce qui est refuse, c'est L'IDENTITE DU
      //     PARENT, pas la ressemblance des splits. Deux parents d'ids
      //     distincts, memes scenario_id/model/tariff par ailleurs, restent
      //     ACCEPTES.
      const distincts = clone(MINIMALE);
      ((distincts.test as Json).entries as Json[])[0]!.parent_project_id = 'PRJ-TEST-JUMEAU';
      exigerAccepte(lireIssue(await appeler('preflightCampaign', distincts)), 'parents jumeaux mais distincts');

      console.log(`[T30.A1] refus=${court(issue.texte, 200)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T30.A2 scenario non qualifie ou modele/tarif non renseigne refuse',
    async () => {
      assertLoaded();
      assertContrat('preflightCampaign');

      // Les tarifs de l'archive sont ceux de la racine gelee.
      expect(((MINIMALE.calibration as Json).entries as Json[])[0]!.tariff_micro_usd).toBe(TARIF_DE_REFERENCE); // cahier L103
      expect((MINIMALE.budgets as Json[])[0]!.limit_micro_usd).toBe(PLAFOND_DE_BUDGET); // cahier L105

      // VOLET POSITIF.
      exigerAccepte(lireIssue(await appeler('preflightCampaign', clone(MINIMALE))), 'volet positif');

      // (1) SCENARIO NON QUALIFIE. L'archive ne differe du bundle minimal que
      //     par `qualified: false` sur une entree de calibration.
      const entreeNQ = ((SCENARIO_NON_QUALIFIE.calibration as Json).entries as Json[])[0]!;
      expect(entreeNQ.qualified).toBe(false);
      expect(entreeNQ.model).not.toBe('');
      expect(entreeNQ.tariff_micro_usd).not.toBe('');
      const issueNQ = lireIssue(await appeler('preflightCampaign', clone(SCENARIO_NON_QUALIFIE)));
      exigerRefuse(issueNQ, 'scenario non qualifie'); // cahier:L419
      expect(
        /qualif|qualified/i.test(issueNQ.texte) || issueNQ.texte.includes(String(entreeNQ.scenario_id))
          ? 'refus-lisible'
          : `REFUS-HORS-SUJET ${court(issueNQ.texte)}`,
      ).toBe('refus-lisible');

      // (1-bis) LE REFUS TIENT A `qualified`, ET A RIEN D'AUTRE : requalifier
      //         l'entree suffit a la faire accepter.
      const requalifiee = clone(SCENARIO_NON_QUALIFIE);
      ((requalifiee.calibration as Json).entries as Json[])[0]!.qualified = true;
      exigerAccepte(lireIssue(await appeler('preflightCampaign', requalifiee)), 'variante requalifiee');

      // (2) MODELE/TARIF NON RENSEIGNE. L'archive ne differe du bundle
      //     minimal QUE par `model` et `tariff_micro_usd` vides ;
      //     `qualified` reste vrai.
      const entreeTA = ((TARIF_ABSENT.calibration as Json).entries as Json[])[0]!;
      expect(entreeTA.qualified).toBe(true);
      expect(entreeTA.model).toBe('');
      expect(entreeTA.tariff_micro_usd).toBe('');
      const issueTA = lireIssue(await appeler('preflightCampaign', clone(TARIF_ABSENT)));
      exigerRefuse(issueTA, 'modele et tarif non renseignes'); // cahier:L419
      expect(
        /model|modele|tarif|tariff|pric/i.test(issueTA.texte)
          ? 'refus-lisible'
          : `REFUS-HORS-SUJET ${court(issueTA.texte)}`,
      ).toBe('refus-lisible');

      // (2-bis) LE REFUS TIENT A L'ABSENCE, PAS A LA VALEUR PARTICULIERE : la
      //         rendre suffit.
      const tarifRendu = clone(TARIF_ABSENT);
      const e = ((tarifRendu.calibration as Json).entries as Json[])[0]!;
      e.model = 'agent-scripted-v1';
      e.tariff_micro_usd = TARIF_DE_REFERENCE;
      exigerAccepte(lireIssue(await appeler('preflightCampaign', tarifRendu)), 'tarif rendu');

      // (3) SEUL LE MODELE MANQUANT, TARIF PRESENT : refuse aussi (le cahier
      //     dit « modele/tarif », les deux comptent).
      const seulModeleAbsent = clone(MINIMALE);
      ((seulModeleAbsent.calibration as Json).entries as Json[])[0]!.model = '';
      exigerRefuse(
        lireIssue(await appeler('preflightCampaign', seulModeleAbsent)),
        'modele seul absent',
      ); // cahier:L419

      console.log(`[T30.A2] non-qualifie=${court(issueNQ.texte, 160)} | tarif=${court(issueTA.texte, 160)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T30.A3 modification d une graine ou d une marge apres gel donne mismatch',
    async () => {
      assertLoaded();
      assertContrat('freezeCampaign', 'verifyFreezeIntegrity');

      // VOLET POSITIF : le bundle minimal se gele.
      const acc = lireIssue(await appeler('freezeCampaign', clone(MINIMALE)));
      const frozenBrut = exigerAccepte(acc, 'gel du bundle minimal');
      const frozen = frozenDe(frozenBrut);
      const hash = champChaine(frozen, CLE_HASH);
      expect(
        hash !== null && hash.length > 0 ? 'hash-present' : `HASH-ABSENT ${court(rendu(frozen))}`,
      ).toBe('hash-present'); // cahier:L82

      // (0) TEMOIN : deux gels du MEME bundle rendent le MEME hash — sans
      //     quoi « mismatch » ne voudrait rien dire (cahier L82, empreinte
      //     deterministe).
      const acc2 = lireIssue(await appeler('freezeCampaign', clone(MINIMALE)));
      const hash2 = champChaine(frozenDe(exigerAccepte(acc2, 'second gel, meme bundle')), CLE_HASH);
      expect(hash2).toBe(hash);

      // (1) L'ENONCE DU CAS, VOLET POSITIF DE LA VERIFICATION : reverifier le
      //     bundle INCHANGE contre son propre gel doit rester COHERENT.
      const rInchange = await appeler('verifyFreezeIntegrity', frozenBrut, clone(MINIMALE));
      const matchInchange = champBooleen(rInchange.valeur, CLE_MATCH);
      expect(
        matchInchange === true
          ? 'coherent'
          : `MISMATCH-INATTENDU sur bundle inchange : ${court(rendu(rInchange.valeur))}`,
      ).toBe('coherent'); // cahier:L69

      // (2) GRAINE MODIFIEE APRES GEL. cahier:L82 — quatre flux ; celui de
      //     `scenario` est mute, RIEN d'autre.
      const grainesMutees = clone(MINIMALE);
      (grainesMutees.seeds as Json).scenario = `${String((MINIMALE.seeds as Json).scenario)}-MUTEE`;
      const rGraine = await appeler('verifyFreezeIntegrity', frozenBrut, grainesMutees);
      const matchGraine = champBooleen(rGraine.valeur, CLE_MATCH);
      expect(
        matchGraine === false ? 'mismatch' : `MISMATCH-NON-DETECTE (graine) : ${court(rendu(rGraine.valeur))}`,
      ).toBe('mismatch'); // cahier:L69
      expect(
        /seed|graine/i.test(rendu(rGraine.valeur)) ? 'nomme' : `REFUS-MUET (graine) ${court(rendu(rGraine.valeur))}`,
      ).toBe('nomme');

      // (3) MARGE MODIFIEE APRES GEL. La mutation ciblee (cases.lock.json)
      //     vise « exclure LES CHAMPS graine ET marge » : les deux doivent
      //     mordre separement.
      const margeMutee = clone(MINIMALE);
      (margeMutee.margins as Json).non_inferiority = 0.03; // cahier:L451 — 0.02 est la valeur gelee
      const rMarge = await appeler('verifyFreezeIntegrity', frozenBrut, margeMutee);
      const matchMarge = champBooleen(rMarge.valeur, CLE_MATCH);
      expect(
        matchMarge === false ? 'mismatch' : `MISMATCH-NON-DETECTE (marge) : ${court(rendu(rMarge.valeur))}`,
      ).toBe('mismatch'); // cahier:L69
      expect(
        /margin|marge/i.test(rendu(rMarge.valeur)) ? 'nomme' : `REFUS-MUET (marge) ${court(rendu(rMarge.valeur))}`,
      ).toBe('nomme');

      // (4) TEMOIN ANTI-CONSTANTE INVERSE : un verificateur qui rendrait
      //     TOUJOURS mismatch:false satisferait (2) et (3) sans jamais
      //     comparer — (1) l'exclut deja, repete ici sur un DEUXIEME bundle
      //     inchange pour eviter qu'un hasard isole (1) ne suffise.
      const rInchange2 = await appeler('verifyFreezeIntegrity', frozenBrut, clone(MINIMALE));
      expect(champBooleen(rInchange2.valeur, CLE_MATCH)).toBe(true);

      console.log(`[T30.A3] hash=${String(hash).slice(0, 12)}… graine=${court(rendu(rGraine.valeur), 140)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T30.A4 mode confirme exige metriques, effectif, budgets et regles d arret',
    async () => {
      assertLoaded();
      assertContrat('preflightCampaign');

      // Metriques du bundle minimal : Q, R, G (cahier L95).
      expect(MINIMALE.metrics).toEqual(['Q', 'R', 'G']); // cahier:L95
      expect(MINIMALE.registration_mode).toBe('confirmed'); // cahier:L419

      // VOLET POSITIF : le bundle minimal, `confirmed` et complet, est ACCEPTE.
      exigerAccepte(lireIssue(await appeler('preflightCampaign', clone(MINIMALE))), 'confirme et complet');

      // (0) L'ARCHIVE DU DEFAUT NE DIFFERE QUE PAR LES QUATRE CHAMPS.
      expect(CONFIRME_INCOMPLET.registration_mode).toBe('confirmed');
      expect([CONFIRME_INCOMPLET.metrics, CONFIRME_INCOMPLET.sample_size, CONFIRME_INCOMPLET.budgets, CONFIRME_INCOMPLET.stopping_rules]).toEqual(
        [[], 0, [], []],
      );

      // (1) L'ENONCE DU CAS.
      const issue = lireIssue(await appeler('preflightCampaign', clone(CONFIRME_INCOMPLET)));
      exigerRefuse(issue, 'confirme mais incomplet'); // cahier:L419

      // (2) LE REFUS NOMME AU MOINS UN DES QUATRE CHAMPS.
      expect(
        /metric|effectif|sample_size|budget|stopping|arret/i.test(issue.texte)
          ? 'nomme'
          : `REFUS-MUET ${court(issue.texte)}`,
      ).toBe('nomme');

      // (3) CONTROLE DECISIF : le MEME manque, en mode `draft`, reste
      //     ACCEPTE. Sans ce controle, une exigence UNIVERSELLE (et non
      //     specifique au mode confirme) satisferait (1) en refusant tout
      //     brouillon incomplet — ce que le cahier n'affirme pas.
      expect(BROUILLON_INCOMPLET.registration_mode).toBe('draft');
      expect([BROUILLON_INCOMPLET.metrics, BROUILLON_INCOMPLET.sample_size, BROUILLON_INCOMPLET.budgets, BROUILLON_INCOMPLET.stopping_rules]).toEqual(
        [[], 0, [], []],
      );
      exigerAccepte(
        lireIssue(await appeler('preflightCampaign', clone(BROUILLON_INCOMPLET))),
        'brouillon incomplet, mode draft',
      ); // cahier:L419 — l'exigence est specifique au mode confirme

      // (4) CHAQUE CHAMP, ISOLEMENT, REFUSE AU MOINS UN AUTRE MANQUE
      //     n'aurait pas suffi a lui seul : quatre variantes ou UN SEUL des
      //     quatre champs manque, les trois autres restant ceux du bundle
      //     minimal.
      const champs: (keyof Json)[] = ['metrics', 'sample_size', 'budgets', 'stopping_rules'];
      const observes: string[] = [];
      for (const c of champs) {
        const variante = clone(MINIMALE);
        (variante as Json)[c] = c === 'sample_size' ? 0 : [];
        const iss = lireIssue(await appeler('preflightCampaign', variante));
        exigerRefuse(iss, `${c} seul manquant`); // cahier:L419
        observes.push(`${c}=${iss.refuse ? 'refuse' : 'ACCEPTE'}`);
      }
      expect(observes).toEqual(champs.map((c) => `${c}=refuse`));

      console.log(`[T30.A4] refus=${court(issue.texte, 160)} champs=${observes.join(',')}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T30.A5 signature ou recu falsifie rejete',
    async () => {
      assertLoaded();
      assertContrat('freezeCampaign', 'issueLocalTestReceipt', 'verifyRegistrationReceipt');

      const frozenBrut = exigerAccepte(
        lireIssue(await appeler('freezeCampaign', clone(MINIMALE))),
        'gel prealable',
      );

      // Le reçu GENUINE, tel qu'emis par l'implementation — pas construit a
      // la main : la suite ne reimplante pas la signature.
      const rRecu = await appeler('issueLocalTestReceipt', frozenBrut);
      expect(rRecu.valeur instanceof Error ? `EMISSION-EN-ECHEC ${rRecu.valeur.message}` : 'emis').toBe('emis');
      const recu = rRecu.valeur as Json;
      const { signatureKey } = decomposerRecu(recu);
      expect(
        signatureKey !== null ? 'signature-presente' : `SIGNATURE-ABSENTE ${court(rendu(recu))}`,
      ).toBe('signature-presente');

      // VOLET POSITIF : le reçu genuine, NON modifie, est ACCEPTE.
      const rGenuine = await appeler('verifyRegistrationReceipt', frozenBrut, clone(recu));
      const validGenuine = champBooleen(rGenuine.valeur, CLE_REFUS_BOOL);
      expect(
        validGenuine === true ? 'accepte' : `RECU-GENUINE-REJETE ${court(rendu(rGenuine.valeur))}`,
      ).toBe('accepte');

      // (1) SIGNATURE FALSIFIEE, CHARGE UTILE INTACTE.
      const recuSigAlteree = recuSignatureAlteree(recu);
      expect(decomposerRecu(recuSigAlteree).payload).toEqual(decomposerRecu(recu).payload);
      const rSig = await appeler('verifyRegistrationReceipt', frozenBrut, recuSigAlteree);
      const validSig = champBooleen(rSig.valeur, CLE_REFUS_BOOL);
      expect(
        validSig === false || rSig.valeur instanceof Error
          ? 'rejete'
          : `SIGNATURE-FALSIFIEE-ACCEPTEE ${court(rendu(rSig.valeur))}`,
      ).toBe('rejete'); // cahier:L419

      // (2) CHARGE UTILE FALSIFIEE (manifest_hash altere), SIGNATURE INCHANGEE.
      const recuChargeAlt = recuChargeAlteree(recu);
      expect(recuChargeAlt.signature ?? champ(recuChargeAlt, CLE_SIGNATURE, 0)).toEqual(
        recu.signature ?? champ(recu, CLE_SIGNATURE, 0),
      );
      const rCharge = await appeler('verifyRegistrationReceipt', frozenBrut, recuChargeAlt);
      const validCharge = champBooleen(rCharge.valeur, CLE_REFUS_BOOL);
      expect(
        validCharge === false || rCharge.valeur instanceof Error
          ? 'rejete'
          : `RECU-FALSIFIE-ACCEPTE ${court(rendu(rCharge.valeur))}`,
      ).toBe('rejete'); // cahier:L419

      // (3) SECOND VOLET POSITIF : le MEME reçu genuine, revalide APRES les
      //     deux rejets, reste ACCEPTE — les rejets precedents ne
      //     proviennent pas d'un effet de bord global.
      const rGenuineEncore = await appeler('verifyRegistrationReceipt', frozenBrut, clone(recu));
      expect(champBooleen(rGenuineEncore.valeur, CLE_REFUS_BOOL)).toBe(true);

      console.log(`[T30.A5] sig=${court(rendu(rSig.valeur), 140)} charge=${court(rendu(rCharge.valeur), 140)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T30.A6 recu local de test porte test_only=true et ne peut pas etre presente comme horodatage independant reel',
    async () => {
      assertLoaded();
      assertContrat('freezeCampaign', 'issueLocalTestReceipt', 'verifyRegistrationReceipt');

      const frozenBrut = exigerAccepte(
        lireIssue(await appeler('freezeCampaign', clone(MINIMALE))),
        'gel prealable',
      );
      const rRecu = await appeler('issueLocalTestReceipt', frozenBrut);
      expect(rRecu.valeur instanceof Error ? `EMISSION-EN-ECHEC ${rRecu.valeur.message}` : 'emis').toBe('emis');
      const recu = rRecu.valeur as Json;

      // (1) LE RECU LOCAL DE TEST PORTE `test_only: true` — LA PREMIERE
      //     MOITIE DE L'ENONCE, OBSERVABLE SANS AUCUNE VERIFICATION.
      const { payload } = decomposerRecu(recu);
      const testOnly = champBooleen(payload, /^(test_only|testonly|is_test|local_only)$/i);
      expect(
        testOnly === true ? 'test_only' : `TEST_ONLY-ABSENT-OU-FAUX ${court(rendu(payload))}`,
      ).toBe('test_only'); // cahier:L421

      // VOLET POSITIF : le reçu de test, non modifie, EST ACCEPTE (un
      // verificateur qui rejette tout reçu de test satisferait la moitie
      // naive de l'enonce sans rien prouver — c'est la revendication qui est
      // refusee, pas la vérification elle-meme).
      const rAcc = await appeler('verifyRegistrationReceipt', frozenBrut, clone(recu));
      const validAcc = champBooleen(rAcc.valeur, CLE_REFUS_BOOL);
      expect(validAcc === true ? 'accepte' : `RECU-TEST-REJETE ${court(rendu(rAcc.valeur))}`).toBe('accepte');

      // (2) LE STATUT DE PREENREGISTREMENT RESTE FIDELE (cahier L421 :
      //     « registration_status fidele ») : il NOMME l'etat de test, et
      //     NE PORTE AUCUN des mots qui revendiqueraient un horodatage
      //     independant reel.
      const statut = champChaine(rAcc.valeur, CLE_STATUT);
      expect(statut !== null ? 'statut-present' : `STATUT-ABSENT ${court(rendu(rAcc.valeur))}`).toBe('statut-present');
      const s = String(statut);
      expect(/test/i.test(s) ? 'nomme-test' : `STATUT-NE-NOMME-PAS-TEST ${s}`).toBe('nomme-test'); // cahier:L421
      expect(
        /independent|independant|external|extern|real|reel/i.test(s)
          ? `STATUT-REVENDIQUE-INDEPENDANCE ${s}`
          : 'pas-de-revendication',
      ).toBe('pas-de-revendication'); // cahier:L421

      // (3) TENTATIVE DE BLANCHIMENT : forcer `test_only` a `false` SANS
      //     re-signer doit etre REJETEE — sans quoi un bit-flip suffirait a
      //     usurper le statut que (2) refuse.
      const recuBlanchi = recuTestOnlyForce(recu, false);
      const rBlanchi = await appeler('verifyRegistrationReceipt', frozenBrut, recuBlanchi);
      const validBlanchi = champBooleen(rBlanchi.valeur, CLE_REFUS_BOOL);
      expect(
        validBlanchi === false || rBlanchi.valeur instanceof Error
          ? 'rejete'
          : `BLANCHIMENT-ACCEPTE ${court(rendu(rBlanchi.valeur))}`,
      ).toBe('rejete'); // cahier:L421

      console.log(`[T30.A6] test_only=${String(testOnly)} statut=${s} blanchiment=${court(rendu(rBlanchi.valeur), 120)}`);
    },
    CASE_TIMEOUT_MS,
  );
});
