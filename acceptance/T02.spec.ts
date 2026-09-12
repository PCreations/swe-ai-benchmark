/**
 * acceptance/T02.spec.ts — suite d'acceptation de la tache T02.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T02.A1 behaviour — deux objets aux memes cles en ordre different donnent
 *                      les memes octets canoniques
 *   T02.A2 behaviour — inverser un tableau change l'empreinte
 *   T02.A3 numeric   — le SHA-256 des octets `abc` vaut ba7816bf...15ad
 *   T02.A4 refusal   — montants negatifs hors ecriture d'ajustement, decimaux
 *                      et NaN sont rejetes
 *   T02.A5 behaviour — deriver le flux workload est independant du nombre de
 *                      tirages du flux bootstrap
 *   T02.A6 behaviour — rejouer une suite avec la meme graine et la meme version
 *                      d'algorithme donne la meme suite, avec vecteur publie
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE a `packages/contracts` (ADR-001 :
 * aveuglement procedural). Le contrat teste ci-dessous n'est pas releve dans
 * l'implementation ; il est derive de docs/specs/T02.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle :
 *
 *   L171  livrables : « montants, identites, serialisation canonique, horloge
 *         injectable et derivation de graines dans `contracts` »
 *   L173  les six cas d'acceptation, mot pour mot
 *   L175  fin : « absence de dependance a `Date.now()` ou au hasard global
 *         dans les fonctions de domaine, verifiee par regle d'import et tests
 *         a horloge imposee »
 *   L80   montants : « chaines d'entiers non negatifs en micro-USD ;
 *         `1000000` vaut 1 USD » ; « les ajustements sont des ecritures
 *         separees signees » ; « nombres non finis interdits »
 *   L82   empreintes : « SHA-256 sur des octets canoniques documentes. Objets
 *         JSON tries recursivement par cle ; ordre des tableaux conserve ;
 *         UTF-8 » ; « les graines sont derivees par identifiants et flux
 *         (`scenario`, `workload`, `assignment`, `bootstrap`) pour que l'ajout
 *         d'un tirage dans un composant ne change pas tous les autres »
 *   L78   identite complete d'une trajectoire, six composantes
 *   L71   invariant 9 : « les depenses utilisent des entiers exacts, jamais une
 *         addition de flottants monetaires »
 *   L143  « une version et un algorithme pseudo-aleatoire figes sont requis »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient soit d'un import de
 * `acceptance/reference/**` (racine gelee, docs/FROZEN_ROOTS.json), soit porte
 * un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p' docs/cahier.md`.
 * Aucun litteral n'a ete obtenu en lancant le code et en figeant ce qu'on a vu
 * passer : c'est exactement la fermeture que cette suite existe pour ouvrir.
 *
 * Le vecteur pseudo-aleatoire d'A6 illustre la regle plutot que de l'enfreindre :
 * le cahier (L173) exige « un vecteur publie » sans le chiffrer. La suite ne
 * fabrique donc AUCUNE valeur attendue — elle exige que l'implementation
 * PUBLIE son vecteur, puis le rejoue par l'API publique et compare le rejeu au
 * vecteur publie. La valeur comparee est produite par l'implementation, pas par
 * l'auteur des tests ; ce que la suite impose, c'est la reproductibilite.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE. Le paquet est charge par son SPECIFICATEUR, que
 * jest.config.mjs mappe vers `packages/<nom>/src` — jamais vers un `dist/`
 * perime, gitignore et invisible a `git status --porcelain`.
 *
 * Pour chaque ROLE du contrat, la suite nomme un export PRIMAIRE puis une
 * courte liste d'alias documentes. Les alias sont une tolerance de NOMMAGE, pas
 * de COMPORTEMENT : toutes les assertions restent identiques quel que soit le
 * nom retenu. Cette tolerance sert §H (« rends le test d'acceptation rouge pour
 * la raison attendue ») : un desaccord de vocabulaire entre l'auteur aveugle et
 * l'implementeur produirait un rouge qui ne dit rien du contrat. Si AUCUN nom
 * ne repond, la suite echoue par une assertion explicite qui nomme le role et
 * la liste attendue — jamais par un import casse, que `verification/runner/
 * red.mjs` classe `MODULE_NOT_FOUND` et refuse comme preuve.
 *
 *   canonicalBytes(valeur)            -> octets canoniques (L82)
 *   sha256Hex(octets)                 -> empreinte hexadecimale (L82, L173)
 *   canonicalDigest(valeur)           -> SHA-256 des octets canoniques (L82)
 *   parseAmountMicroUsd(x)            -> montant, refuse le non conforme (L80)
 *   parseAdjustmentMicroUsd(x)        -> ecriture d'ajustement signee (L80)
 *   deriveSeed(identite, flux)        -> graine par identifiants et flux (L82)
 *   createRng(graine, version)        -> generateur seede et versionne (L143)
 *   PRNG_TEST_VECTOR                  -> vecteur publie (L173)
 *   fixedClock(instant)               -> horloge injectable (L171, L175)
 *
 * ────────────────────────────────────────────────────────────────────── IV
 * A6 EST PORTE PAR DEUX TESTS, PAS UN. Le cas enonce le rejeu (L173) ; sa
 * condition de fin (L175) y ajoute l'absence de `Date.now()` et de hasard
 * global, et L171 nomme l'horloge injectable comme livrable. Ces exigences
 * echouent pour des raisons differentes, et les separer donne un rapport
 * d'echec qui dit LAQUELLE est tombee. La projection du runner
 * (verification/runner/chains.mjs, `projectCases`) reconnait un cas a la
 * presence de son identifiant dans le nom du test et agrege FAIL-CLOSED : un
 * seul des deux tests rouge suffit a noircir T02.A6.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS. L175 demande la propriete « pas de
 * `Date.now()` ni de hasard global » par DEUX moyens : une regle d'import et
 * des tests a horloge imposee. La regle d'import est un controle STATIQUE sur
 * les sources : elle appartient a la chaine de l'implementeur (lint/HARNESS),
 * et la relever ici obligerait l'auteur des tests a lire `packages/contracts`.
 * A6 apporte donc la seconde moitie, par OBSERVATION : le rejeu est exige alors
 * que `Math.random` leve et que `Date.now` rend deux instants differents.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const CONTRACTS_DIR = path.join(REPO, 'packages', 'contracts');
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

/**
 * Empreinte lisible d'une valeur quelconque. Sert a comparer des suites de
 * tirages, des graines et des montants SANS supposer leur type : un generateur
 * peut rendre des nombres, des BigInt, des chaines ou des octets, et le contrat
 * teste est la REPRODUCTIBILITE, pas la representation.
 */
function stamp(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'bigint') return `bigint:${v.toString()}`;
  if (typeof v === 'number') return Number.isFinite(v) ? `number:${v.toString()}` : `NON-FINI:${String(v)}`;
  if (typeof v === 'string') return `string:${v}`;
  if (typeof v === 'boolean') return `boolean:${String(v)}`;
  if (v instanceof Uint8Array) return `bytes:${Buffer.from(v).toString('hex')}`;
  if (ArrayBuffer.isView(v)) return `bytes:${Buffer.from(v.buffer as ArrayBuffer).toString('hex')}`;
  if (v instanceof ArrayBuffer) return `bytes:${Buffer.from(v).toString('hex')}`;
  try {
    return `json:${JSON.stringify(v)}`;
  } catch {
    return `opaque:${Object.prototype.toString.call(v)}`;
  }
}

function kindOf(v: unknown): string {
  if (v === null) return 'null';
  if (Buffer.isBuffer(v)) return 'Buffer';
  if (v instanceof Uint8Array) return 'Uint8Array';
  if (v instanceof ArrayBuffer) return 'ArrayBuffer';
  if (Array.isArray(v)) return 'Array';
  return typeof v;
}

/** Normalise en octets ce qu'un serialiseur canonique peut legitimement rendre. */
function asBytes(v: unknown): Uint8Array {
  if (Buffer.isBuffer(v)) return new Uint8Array(v);
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer as ArrayBuffer, v.byteOffset, v.byteLength);
  if (typeof v === 'string') return new Uint8Array(Buffer.from(v, 'utf8'));
  throw new Error(`OCTETS-CANONIQUES-DE-TYPE-INATTENDU ${kindOf(v)}`);
}

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const utf8 = (b: Uint8Array): string => Buffer.from(b).toString('utf8');

/* ────────────────────────────────── fixtures de reference (racine gelee) */

/**
 * Les fixtures de reference sont la racine GELEE apres T01
 * (docs/FROZEN_ROOTS.json, cahier L139). Cette suite les LIT, ne les ecrit
 * jamais, et en tire les montants qu'elle compare — c'est la premiere des deux
 * provenances autorisees pour un litteral.
 */
function readReference(name: string): Json {
  const file = path.join(REFERENCE_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
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

const F_MONEY = readReference('F-MONEY');
/** 340 micro-USD, cout de l'appel de reference du §F. Importe, jamais recopie. */
const MONTANT_APPEL_DE_REFERENCE = String(
  refValue(F_MONEY, 'valeurs.appel_de_reference.cout_attendu.valeur'),
);
/** 680 micro-USD, deux appels identiques. Importe de la racine gelee. */
const MONTANT_DEUX_APPELS = String(
  refValue(F_MONEY, 'valeurs.deux_appels_identiques.cout_attendu.valeur'),
);

/* ──────────────────────────────────────────── chargement du paquet teste */

interface Loaded {
  ok: boolean;
  via: string;
  exportCount: number;
  flat: Map<string, unknown>;
  attempts: string[];
}

function packageSpecifier(): string | null {
  const manifest = path.join(CONTRACTS_DIR, 'package.json');
  if (!fs.existsSync(manifest)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: unknown };
    return typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : null;
  } catch {
    return null;
  }
}

/**
 * Aplatit l'espace de noms du module : exports de premier niveau, membres d'un
 * export par defaut objet, puis UN niveau de sous-espaces (`export * as money`).
 * Le nom qualifie (`money.parseAmountMicroUsd`) et le nom simple sont tous deux
 * indexes : le contrat porte sur le ROLE, pas sur l'arborescence choisie.
 */
function flatten(ns: Ns): Map<string, unknown> {
  const flat = new Map<string, unknown>();
  const put = (k: string, v: unknown): void => {
    if (!flat.has(k)) flat.set(k, v);
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
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v)) {
      for (const [k2, v2] of Object.entries(v as Ns)) {
        put(`${k}.${k2}`, v2);
        put(k2, v2);
      }
    }
  }
  return flat;
}

async function loadContracts(): Promise<Loaded> {
  const attempts: string[] = [];
  const specifiers: string[] = [];
  const spec = packageSpecifier();
  if (spec !== null) specifiers.push(spec);
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(CONTRACTS_DIR, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) specifiers.push(pathToFileURL(f).href);
  }
  for (const s of specifiers) {
    try {
      const mod = (await import(s)) as Ns;
      const flat = flatten(mod);
      return {
        ok: true,
        via: s.replace(pathToFileURL(REPO).href, '<repo>'),
        exportCount: Object.keys(mod).filter((k) => k !== '__esModule').length,
        flat,
        attempts,
      };
    } catch (e) {
      attempts.push(`import(${s}) -> ${(e as Error).message.split('\n')[0]}`);
    }
  }
  return { ok: false, via: '', exportCount: 0, flat: new Map(), attempts };
}

let LOADED: Loaded = { ok: false, via: '', exportCount: 0, flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  // Le chargement ne LEVE pas : un import casse produirait « Test suite failed
  // to run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement, ce qui
  // rend le rouge ASSERTION_FAILED — la seule forme de rouge qui prouve quelque
  // chose (cahier L139).
  LOADED = await loadContracts();
}, CASE_TIMEOUT_MS);

/** Premiere assertion de chaque cas : le paquet a bien ete charge. */
function assertLoaded(): void {
  expect(
    LOADED.ok
      ? 'charge'
      : `PAQUET-CONTRACTS-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`,
  ).toBe('charge');
  expect(
    /\/dist\/|\/build\/|\/lib\//.test(LOADED.via)
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ────────────────────────────────────────────── resolution par role */

class ContratNonSatisfait extends Error {
  constructor(role: string, candidats: readonly string[]) {
    super(
      `CONTRAT-NON-SATISFAIT role=${role} : aucun export parmi [${candidats.join(', ')}] ` +
        `(${String(LOADED.exportCount)} exports de premier niveau observes)`,
    );
    this.name = 'ContratNonSatisfait';
  }
}

const RESOLVED = new Map<string, unknown>();

function resolve(role: string, candidats: readonly string[], want: 'function' | 'any'): unknown {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const acceptable = (v: unknown): boolean =>
    want === 'function' ? typeof v === 'function' : v !== undefined && v !== null;

  for (const c of candidats) {
    if (LOADED.flat.has(c)) {
      const v = LOADED.flat.get(c);
      if (acceptable(v)) {
        RESOLVED.set(role, v);
        return v;
      }
    }
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of LOADED.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  for (const c of candidats) {
    const v = lower.get(c.toLowerCase());
    if (v !== undefined && acceptable(v)) {
      RESOLVED.set(role, v);
      return v;
    }
  }
  throw new ContratNonSatisfait(role, candidats);
}

const fn = (role: string, candidats: readonly string[]): ((...a: unknown[]) => unknown) =>
  resolve(role, candidats, 'function') as (...a: unknown[]) => unknown;

/* Les listes de candidats : le PREMIER est le nom primaire du contrat. */
const C_CANONICAL = [
  'canonicalBytes',
  'toCanonicalBytes',
  'canonicalize',
  'canonicalSerialize',
  'serializeCanonical',
  'canonicalJsonBytes',
  'canonicalEncode',
  'encodeCanonical',
] as const;
const C_SHA256 = ['sha256Hex', 'sha256', 'hashSha256', 'sha256Digest', 'toSha256Hex', 'digestHex'] as const;
const C_DIGEST = [
  'canonicalDigest',
  'digestOf',
  'canonicalSha256',
  'fingerprint',
  'empreinte',
  'digestValue',
  'hashValue',
] as const;
const C_AMOUNT = [
  'parseAmountMicroUsd',
  'amountMicroUsd',
  'parseAmount',
  'makeAmount',
  'toAmount',
  'microUsd',
  'amountFromString',
] as const;
const C_ADJUSTMENT = [
  'parseAdjustmentMicroUsd',
  'adjustmentMicroUsd',
  'parseAdjustment',
  'makeAdjustment',
  'toAdjustment',
  'signedAmountMicroUsd',
  'signedAmount',
] as const;
const C_SEED = ['deriveSeed', 'seedFor', 'deriveStreamSeed', 'streamSeed', 'derivedSeed'] as const;
const C_RNG = ['createRng', 'createPrng', 'makeRng', 'seededRng', 'rngFrom', 'createRandom', 'prng'] as const;
const C_STREAM_RNG = ['rngForStream', 'createStreamRng', 'streamRng', 'rngFor'] as const;
const C_VECTOR = [
  'PRNG_TEST_VECTOR',
  'RNG_TEST_VECTOR',
  'PRNG_VECTOR',
  'RNG_VECTOR',
  'SEED_TEST_VECTOR',
  'TEST_VECTOR',
  'publishedVector',
  'PUBLISHED_VECTOR',
] as const;
const C_CLOCK = ['fixedClock', 'createClock', 'staticClock', 'frozenClock', 'clockFrom', 'makeClock'] as const;

/* ───────────────────────────────────────────── adaptateurs d'appel */

/**
 * Les roles sont fixes par le cahier ; la FORME d'appel ne l'est pas. Chaque
 * adaptateur essaie un petit nombre de formes documentees, MEMORISE la premiere
 * qui repond, et la reutilise ensuite — sans quoi deux appels d'un meme cas
 * pourraient emprunter deux chemins differents et leur comparaison ne
 * signifierait rien.
 */
function tryShapes<T>(role: string, shapes: Array<[string, () => T]>, ok: (v: T) => boolean): [string, T] {
  const errs: string[] = [];
  for (const [label, call] of shapes) {
    try {
      const v = call();
      if (ok(v)) return [label, v];
      errs.push(`${label} -> valeur inexploitable ${stamp(v)}`);
    } catch (e) {
      errs.push(`${label} -> ${(e as Error).message.split('\n')[0]}`);
    }
  }
  throw new Error(`FORME-D-APPEL-INTROUVABLE role=${role} : ${errs.join(' | ')}`);
}

const SHAPE = new Map<string, string>();

/** Une graine est exploitable des lors qu'elle est une valeur definie et stable. */
const seedUsable = (v: unknown): boolean => v !== undefined && v !== null && stamp(v) !== 'json:{}';

function deriveSeed(identity: Json, stream: string): unknown {
  const f = fn('deriveSeed', C_SEED);
  const shapes: Array<[string, () => unknown]> = [
    ['(identite, flux)', () => f(identity, stream)],
    ['({...identite, stream})', () => f({ ...identity, stream })],
    ['({identity, stream})', () => f({ identity, stream })],
    ['(flux, identite)', () => f(stream, identity)],
  ];
  const known = SHAPE.get('deriveSeed');
  if (known !== undefined) {
    const hit = shapes.find(([l]) => l === known);
    if (hit !== undefined) return hit[1]();
  }
  const [label, value] = tryShapes('deriveSeed', shapes, seedUsable);
  SHAPE.set('deriveSeed', label);
  return value;
}

/** Un generateur exploitable est une fonction, un objet a methode, ou un iterable. */
function drawer(rngLike: unknown): () => unknown {
  if (typeof rngLike === 'function') {
    const g = rngLike as () => unknown;
    return () => g();
  }
  if (rngLike !== null && typeof rngLike === 'object') {
    const o = rngLike as Ns;
    for (const m of ['next', 'nextFloat', 'nextUint32', 'nextInt', 'float', 'uint32', 'random', 'draw', 'nextNumber']) {
      const cand = o[m];
      if (typeof cand === 'function') {
        const bound = (cand as (...a: unknown[]) => unknown).bind(o);
        return () => {
          const v = bound();
          // Protocole iterateur : { value, done }. On rend la valeur.
          if (v !== null && typeof v === 'object' && 'value' in (v as Ns) && 'done' in (v as Ns)) {
            return (v as Ns).value;
          }
          return v;
        };
      }
    }
    const it = (o as unknown as { [Symbol.iterator]?: unknown })[Symbol.iterator];
    if (typeof it === 'function') {
      const iter = (it as () => Iterator<unknown>).call(o);
      return () => iter.next().value as unknown;
    }
  }
  throw new Error(`GENERATEUR-NON-EXPLOITABLE ${kindOf(rngLike)} ${stamp(rngLike)}`);
}

function take(rngLike: unknown, n: number): string[] {
  const next = drawer(rngLike);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(stamp(next()));
  return out;
}

const drawable = (v: unknown): boolean => {
  try {
    const d = drawer(v);
    const first = d();
    return first !== undefined;
  } catch {
    return false;
  }
};

/** Generateur a partir d'une graine seule ou d'une graine et d'une version. */
function makeRng(seed: unknown, version?: unknown): unknown {
  const f = fn('createRng', C_RNG);
  const shapes: Array<[string, () => unknown]> =
    version === undefined
      ? [
          ['(graine)', () => f(seed)],
          ['({seed})', () => f({ seed })],
        ]
      : [
          ['(graine, version)', () => f(seed, version)],
          ['({seed, algorithm})', () => f({ seed, algorithm: version })],
          ['({seed, version})', () => f({ seed, version })],
          ['(graine, {algorithm})', () => f(seed, { algorithm: version })],
          ['(graine)', () => f(seed)],
          ['({seed})', () => f({ seed })],
        ];
  const key = version === undefined ? 'createRng/seed' : 'createRng/seed+version';
  const known = SHAPE.get(key);
  if (known !== undefined) {
    const hit = shapes.find(([l]) => l === known);
    if (hit !== undefined) return hit[1]();
  }
  const [label, value] = tryShapes('createRng', shapes, drawable);
  SHAPE.set(key, label);
  return value;
}

/**
 * Generateur qui PORTE REELLEMENT la version d'algorithme. A6 enonce « la meme
 * graine ET la meme version d'algorithme » (L173) et L143 exige « une version et
 * un algorithme pseudo-aleatoire figes » : une forme d'appel qui ne transporte
 * pas la version ne peut pas temoigner de ce cas.
 */
function makeRngVersioned(seed: unknown, version: unknown): unknown {
  const f = fn('createRng', C_RNG);
  const shapes: Array<[string, () => unknown]> = [
    ['(graine, version)', () => f(seed, version)],
    ['({seed, algorithm})', () => f({ seed, algorithm: version })],
    ['({seed, version})', () => f({ seed, version })],
    ['({seed, algorithm_version})', () => f({ seed, algorithm_version: version })],
    ['(graine, {algorithm})', () => f(seed, { algorithm: version })],
  ];
  const known = SHAPE.get('createRng/versionne');
  if (known !== undefined) {
    const hit = shapes.find(([l]) => l === known);
    if (hit !== undefined) return hit[1]();
  }
  const [label, value] = tryShapes('createRng(versionne)', shapes, drawable);
  SHAPE.set('createRng/versionne', label);
  return value;
}

/** Generateur d'un FLUX : soit un export dedie, soit graine derivee + createRng. */
function streamRng(identity: Json, stream: string): unknown {
  const errs: string[] = [];
  try {
    const f = fn('rngForStream', C_STREAM_RNG);
    const v = f(identity, stream);
    if (drawable(v)) return v;
    errs.push(`rngForStream(identite, flux) -> non exploitable`);
  } catch (e) {
    errs.push(`rngForStream -> ${(e as Error).message.split('\n')[0]}`);
  }
  try {
    return makeRng(deriveSeed(identity, stream));
  } catch (e) {
    errs.push(`createRng(deriveSeed(...)) -> ${(e as Error).message.split('\n')[0]}`);
  }
  throw new Error(`FLUX-NON-DERIVABLE stream=${stream} : ${errs.join(' | ')}`);
}

/* ─────────────────────────────────────────────── lecture du vecteur publie */

interface Vecteur {
  origine: string;
  seed: unknown;
  algorithm: unknown;
  values: unknown[];
}

const VECTOR_FILES = [
  'vectors/prng.json',
  'vectors/rng.json',
  'src/vectors/prng.json',
  'prng-vector.json',
  'vectors/T02-prng.json',
];

function pickField(o: Ns, names: readonly string[]): unknown {
  for (const n of names) if (o[n] !== undefined) return o[n];
  return undefined;
}

function coerceVector(raw: unknown, origine: string): Vecteur | null {
  let cur: unknown = raw;
  if (Array.isArray(cur) && cur.length > 0 && typeof cur[0] === 'object') cur = cur[0];
  if (cur === null || typeof cur !== 'object') return null;
  const o = cur as Ns;
  const nested = pickField(o, ['vector', 'vecteur', 'cases', 'vectors']);
  if (nested !== undefined && Array.isArray(nested) && nested.length > 0) {
    const inner = coerceVector(nested[0], origine);
    if (inner !== null) return inner;
  }
  const values = pickField(o, ['values', 'valeurs', 'sequence', 'suite', 'draws', 'tirages', 'expected']);
  const seed = pickField(o, ['seed', 'graine']);
  const algorithm = pickField(o, ['algorithm', 'algorithme', 'algorithm_version', 'version', 'algo']);
  if (!Array.isArray(values)) return null;
  return { origine, seed, algorithm, values: values as unknown[] };
}

function lireVecteurPublie(): Vecteur {
  const errs: string[] = [];
  try {
    const raw = resolve('PRNG_TEST_VECTOR', C_VECTOR, 'any');
    const v = coerceVector(raw, 'export');
    if (v !== null) return v;
    errs.push(`export present mais de forme inattendue : ${stamp(raw)}`);
  } catch (e) {
    errs.push((e as Error).message);
  }
  for (const rel of VECTOR_FILES) {
    const f = path.join(CONTRACTS_DIR, rel);
    if (!fs.existsSync(f)) continue;
    try {
      const v = coerceVector(JSON.parse(fs.readFileSync(f, 'utf8')), `fichier:${rel}`);
      if (v !== null) return v;
      errs.push(`${rel} de forme inattendue`);
    } catch (e) {
      errs.push(`${rel} -> ${(e as Error).message.split('\n')[0]}`);
    }
  }
  throw new Error(
    `VECTEUR-NON-PUBLIE : ni export parmi [${C_VECTOR.join(', ')}], ni fichier parmi ` +
      `[${VECTOR_FILES.join(', ')}] — le cahier L173 exige « avec vecteur publie ». ${errs.join(' | ')}`,
  );
}

/* ──────────────────────────────────────────────────── montants (A4) */

interface Observation {
  refuse: boolean;
  comment: string;
}

/**
 * Un refus peut etre LEVE ou RENDU. Les deux sont acceptes, parce que le cahier
 * (L80) prescrit un rejet, pas un mecanisme. Ce qui n'est PAS un refus, c'est
 * de rendre l'entree telle quelle : c'est exactement la mutation permissive que
 * verification/mutants/T02.json braque sur A4.
 */
function observerRefus(call: () => unknown): Observation {
  let v: unknown;
  try {
    v = call();
  } catch (e) {
    return { refuse: true, comment: `leve:${(e as Error).name}` };
  }
  if (v === undefined || v === null) return { refuse: true, comment: 'rend-absent' };
  if (typeof v === 'object') {
    const o = v as Ns;
    if (o.ok === false || o.valid === false || o.accepted === false || o.refused === true) {
      return { refuse: true, comment: 'objet-refus' };
    }
    if (o.error !== undefined && o.error !== null) return { refuse: true, comment: 'objet-erreur' };
  }
  return { refuse: false, comment: `ACCEPTE ${stamp(v)}` };
}

/** Texte decimal d'un montant accepte, quelle que soit sa representation. */
function texteMontant(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isInteger(v) ? v.toString() : `NON-ENTIER:${v.toString()}`;
  if (v !== null && typeof v === 'object') {
    const o = v as Ns;
    const inner = pickField(o, ['micro_usd', 'microUsd', 'micros', 'value', 'valeur', 'amount', 'montant']);
    if (inner !== undefined && inner !== v) return texteMontant(inner);
    const ts = (o as unknown as { toString: () => string }).toString;
    if (typeof ts === 'function' && ts !== Object.prototype.toString) {
      return String(ts.call(o));
    }
  }
  return `NON-TEXTUALISABLE:${stamp(v)}`;
}

function accepter(call: () => unknown): string {
  try {
    return texteMontant(call());
  } catch (e) {
    return `REFUSE:${(e as Error).message.split('\n')[0]}`;
  }
}

/* ══════════════════════════════════════════════════════════════════════ */

describe('T02 — types primitifs deterministes', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    "T02.A1 deux objets aux memes cles en ordre different donnent les memes octets canoniques",
    () => {
      assertLoaded();
      const canonical = fn('canonicalBytes', C_CANONICAL);

      // Deux redactions du MEME objet. Les cles sont permutees a tous les
      // niveaux, la valeur non-ASCII force la question de l'encodage, et le
      // tableau porte un ordre qui n'est pas son ordre trie.
      const direct = { z: 1, alpha: { delta: 4, beta: [3, 1, 2] }, mot: 'crème' };
      const permute = { mot: 'crème', alpha: { beta: [3, 1, 2], delta: 4 }, z: 1 };

      const brut = canonical(direct);
      expect(
        ['Uint8Array', 'Buffer', 'ArrayBuffer', 'string'].includes(kindOf(brut))
          ? 'octets'
          : `OCTETS-CANONIQUES-DE-TYPE-INATTENDU ${kindOf(brut)}`,
      ).toBe('octets');

      const a = asBytes(brut);
      const b = asBytes(canonical(permute));

      // (1) l'enonce meme du cas : memes cles, ordre different, memes octets.
      expect(hex(a)).toBe(hex(b)); // cahier:L173

      // (2) le serialiseur est DETERMINISTE : deux appels, memes octets.
      expect(hex(asBytes(canonical(direct)))).toBe(hex(a));

      // (3) les cles sont triees RECURSIVEMENT. JSON.parse conserve l'ordre
      //     textuel des cles non numeriques : Object.keys revele donc l'ordre
      //     REELLEMENT emis, sans rien supposer des espaces ni des separateurs.
      const texte = utf8(a);
      const relu = JSON.parse(texte) as Json;
      expect(Object.keys(relu)).toEqual(['alpha', 'mot', 'z']); // cahier:L82
      expect(Object.keys(relu.alpha as Json)).toEqual(['beta', 'delta']); // cahier:L82

      // (4) l'ordre des TABLEAUX est conserve — il n'est pas trie avec les cles.
      expect((relu.alpha as Json).beta).toEqual([3, 1, 2]); // cahier:L82

      // (5) aller-retour : la canonisation ne perd ni n'ajoute rien.
      expect(relu).toEqual(direct);

      // (6) UTF-8 : la valeur non-ASCII est encodee en UTF-8, pas en latin-1
      //     ni echappee en \u00XX.
      expect(hex(a).includes(Buffer.from('crème', 'utf8').toString('hex'))).toBe(true); // cahier:L82

      // (7) TEMOIN ANTI-CONSTANTE. Sans lui, un serialiseur qui rendrait
      //     toujours les memes octets satisferait (1) sans rien serialiser.
      expect(hex(asBytes(canonical({ a: 1 })))).not.toBe(hex(asBytes(canonical({ a: 2 }))));

      console.log(
        `[T02.A1] via=${LOADED.via} octets=${String(a.length)} formes=${JSON.stringify([...SHAPE])}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T02.A2 inverser un tableau change l empreinte',
    () => {
      assertLoaded();
      const digest = fn('canonicalDigest', C_DIGEST);

      const base = { serie: [1, 2, 3, 4, 5], etiquette: 'v' };
      const inverse = { serie: [5, 4, 3, 2, 1], etiquette: 'v' };
      const permuteCles = { etiquette: 'v', serie: [1, 2, 3, 4, 5] };
      const autreValeur = { serie: [1, 2, 3, 4, 5], etiquette: 'w' };

      const dBase = String(digest(base));
      const dInverse = String(digest(inverse));

      // (1) l'enonce du cas.
      expect(dInverse).not.toBe(dBase); // cahier:L173

      // (2) l'empreinte est bien un SHA-256 : 64 hexadecimaux minuscules.
      expect(/^[0-9a-f]{64}$/.test(dBase)).toBe(true); // cahier:L82
      expect(/^[0-9a-f]{64}$/.test(dInverse)).toBe(true); // cahier:L82

      // (3) elle est STABLE : meme valeur, meme empreinte, deux appels.
      expect(String(digest(structuredClone(base)))).toBe(dBase);

      // (4) elle ne depend PAS de l'ordre des cles — la contrepartie exacte de
      //     (1) : les cles sont triees, les tableaux ne le sont pas.
      expect(String(digest(permuteCles))).toBe(dBase); // cahier:L82

      // (5) TEMOIN ANTI-CONSTANTE : une empreinte constante rendrait (1) faux
      //     mais (3) et (4) vrais ; changer une valeur doit aussi mordre.
      expect(String(digest(autreValeur))).not.toBe(dBase);

      console.log(`[T02.A2] empreinte=${dBase.slice(0, 12)}… inverse=${dInverse.slice(0, 12)}…`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T02.A3 le SHA-256 des octets abc vaut ba7816bf…f20015ad',
    () => {
      assertLoaded();
      const sha = fn('sha256Hex', C_SHA256);
      const canonical = fn('canonicalBytes', C_CANONICAL);
      const digest = fn('canonicalDigest', C_DIGEST);

      const abc = new Uint8Array(Buffer.from('abc', 'utf8'));

      // (1) la valeur exacte enoncee par le cahier, sur les OCTETS `abc`.
      expect(String(sha(abc)).toLowerCase()).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      ); // cahier:L173

      // (2) TEMOIN ANTI-CONSTANTE : un hacheur qui rendrait toujours la meme
      //     chaine satisferait (1). Deux entrees distinctes doivent differer.
      expect(String(sha(new Uint8Array(Buffer.from('abcd', 'utf8'))))).not.toBe(
        String(sha(abc)),
      );

      // (3) TEMOIN ANTI-TRONCATURE : la mutation « hacher input.slice(0, -1) »
      //     ferait tomber (1) ; on nomme ici explicitement le voisin dont le
      //     digest ne doit pas se confondre avec celui de `abc`.
      expect(String(sha(new Uint8Array(Buffer.from('ab', 'utf8'))))).not.toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      ); // cahier:L173

      // (4) L'EMPREINTE D'UNE VALEUR EST CE SHA-256 SUR SES OCTETS CANONIQUES.
      //     Deux exports, une seule regle : sans cette egalite, A2 pourrait
      //     etre satisfait par une empreinte qui n'est pas celle de L82.
      const valeur = { b: [1, 2], a: 'x' };
      expect(String(digest(valeur)).toLowerCase()).toBe(
        String(sha(asBytes(canonical(valeur)))).toLowerCase(),
      ); // cahier:L82

      // (5) l'empreinte de reference est bien celle du SHA-256 de la
      //     bibliotheque standard : le cas ne mesure pas un dialecte maison.
      expect(createHash('sha256').update(Buffer.from('abc', 'utf8')).digest('hex')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      ); // cahier:L173
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T02.A4 montants negatifs hors ecriture d ajustement, decimaux et NaN sont rejetes',
    () => {
      assertLoaded();
      const montant = fn('parseAmountMicroUsd', C_AMOUNT);

      // ── moitie REFUS. Tout est observe AVANT d'asserter : une assertion
      //    posee dans la boucle arreterait le cas au premier refus manquant et
      //    le rapport d'echec ne dirait rien des suivants.
      const aRefuser: Array<{ cas: string; entree: unknown }> = [
        { cas: 'negatif', entree: '-5' }, // cahier:L173
        { cas: 'negatif-grand', entree: `-${MONTANT_APPEL_DE_REFERENCE}` }, // acceptance/reference/F-MONEY.json
        { cas: 'decimal', entree: '1.5' }, // cahier:L173
        { cas: 'decimal-zero', entree: '0.5' }, // cahier:L173
        { cas: 'NaN-chaine', entree: 'NaN' }, // cahier:L173
        { cas: 'NaN-nombre', entree: Number.NaN }, // cahier:L173
        { cas: 'infini', entree: Number.POSITIVE_INFINITY }, // cahier:L80
        { cas: 'infini-chaine', entree: 'Infinity' }, // cahier:L80
        { cas: 'vide', entree: '' }, // cahier:L80
        { cas: 'exponentielle', entree: '1e6' }, // cahier:L80
      ];
      const refus = aRefuser.map(({ cas, entree }) => {
        const o = observerRefus(() => montant(entree));
        return { cas, refuse: o.refuse, comment: o.refuse ? 'refuse' : o.comment };
      });
      expect(refus).toEqual(
        aRefuser.map(({ cas }) => ({ cas, refuse: true, comment: 'refuse' })),
      );

      // ── moitie ACCEPTATION : LE REFUS N'EST PAS UNE COMPETENCE.
      //    Sans cette moitie, un constructeur qui refuse TOUT satisferait
      //    l'enonce du cas sans rien verifier — c'est, a l'echelle d'un type,
      //    le « stub qui leve » contre lequel le mode `refusal` met en garde.
      const aAccepter: Array<{ cas: string; entree: string }> = [
        { cas: 'zero', entree: '0' }, // cahier:L80 « entiers non negatifs »
        { cas: 'un-usd', entree: '1000000' }, // cahier:L80 « 1000000 vaut 1 USD »
        { cas: 'appel-de-reference', entree: MONTANT_APPEL_DE_REFERENCE }, // acceptance/reference/F-MONEY.json
        { cas: 'deux-appels', entree: MONTANT_DEUX_APPELS }, // acceptance/reference/F-MONEY.json
        { cas: 'au-dela-de-2^53', entree: '9007199254740993' }, // cahier:L71 invariant 9
      ];
      const acceptes = aAccepter.map(({ cas, entree }) => ({
        cas,
        texte: accepter(() => montant(entree)),
      }));
      expect(acceptes).toEqual(aAccepter.map(({ cas, entree }) => ({ cas, texte: entree })));

      // ── le qualificatif « HORS ECRITURE D'AJUSTEMENT ». Le signe negatif
      //    n'est pas interdit en soi : il est interdit a un MONTANT. Une
      //    ecriture d'ajustement est « separee et signee » (L80). Sans ce
      //    volet, le cas serait satisfait par un type qui refuse tout negatif,
      //    y compris la ou le cahier l'exige.
      const ajustement = fn('parseAdjustmentMicroUsd', C_ADJUSTMENT);
      const ajustementsAcceptes: Array<{ cas: string; entree: string }> = [
        { cas: 'reprise-negative', entree: '-5' }, // cahier:L173 « hors ecriture d'ajustement »
        { cas: 'annulation', entree: `-${MONTANT_APPEL_DE_REFERENCE}` }, // acceptance/reference/F-MONEY.json
        { cas: 'nul', entree: '0' }, // cahier:L80
      ];
      const ajustes = ajustementsAcceptes.map(({ cas, entree }) => ({
        cas,
        texte: accepter(() => ajustement(entree)),
      }));
      expect(ajustes).toEqual(ajustementsAcceptes.map(({ cas, entree }) => ({ cas, texte: entree })));

      // ── et l'ajustement ne blanchit QUE le signe : decimaux et NaN restent
      //    refuses de part et d'autre.
      const ajustementsRefuses: Array<{ cas: string; entree: unknown }> = [
        { cas: 'ajustement-decimal', entree: '-1.5' }, // cahier:L173
        { cas: 'ajustement-NaN', entree: 'NaN' }, // cahier:L173
        { cas: 'ajustement-NaN-nombre', entree: Number.NaN }, // cahier:L173
        { cas: 'ajustement-infini', entree: Number.NEGATIVE_INFINITY }, // cahier:L80
      ];
      const refusAjustement = ajustementsRefuses.map(({ cas, entree }) => {
        const o = observerRefus(() => ajustement(entree));
        return { cas, refuse: o.refuse, comment: o.refuse ? 'refuse' : o.comment };
      });
      expect(refusAjustement).toEqual(
        ajustementsRefuses.map(({ cas }) => ({ cas, refuse: true, comment: 'refuse' })),
      );

      console.log(
        `[T02.A4] refuses=${String(refus.length)} acceptes=${String(acceptes.length)} ` +
          `ajustements-acceptes=${String(ajustes.length)} ajustements-refuses=${String(refusAjustement.length)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T02.A5 deriver le flux workload est independant du nombre de tirages du flux bootstrap',
    () => {
      assertLoaded();

      // Identite complete d'une trajectoire, six composantes. cahier:L78
      const identite: Json = {
        campaign_id: 'C-T02',
        parent_project_id: 'P-T02',
        scenario_id: 'S-T02',
        configuration_id: 'K-T02',
        repetition_id: 'R-1',
        budget_id: 'B-1',
      };
      // Les quatre flux nommes par le cahier. cahier:L82
      const FLUX = ['scenario', 'workload', 'assignment', 'bootstrap'] as const;

      // (1) la GRAINE du flux workload ne bouge pas quand on tire du bootstrap.
      const graineAvant = stamp(deriveSeed(identite, 'workload'));
      const bootstrap = streamRng(identite, 'bootstrap');
      const tiragesBootstrap = take(bootstrap, 37);
      const graineApres = stamp(deriveSeed(identite, 'workload'));
      expect(graineApres).toBe(graineAvant); // cahier:L82

      // (2) la SUITE du flux workload non plus. C'est la formulation exacte du
      //     cas : « independant du NOMBRE DE TIRAGES du flux bootstrap ».
      const suiteSansTrafic = take(streamRng(identite, 'workload'), 12);
      const bootstrapBavard = streamRng(identite, 'bootstrap');
      take(bootstrapBavard, 1000);
      const suiteApresTrafic = take(streamRng(identite, 'workload'), 12);
      expect(suiteApresTrafic).toEqual(suiteSansTrafic); // cahier:L173

      // (3) TEMOIN ANTI-CONSTANTE — decisif ici. Une derivation qui rendrait
      //     toujours la meme graine, ou un generateur qui rendrait toujours la
      //     meme valeur, rendrait (1) et (2) VERTS sans rien deriver. Les
      //     quatre flux du cahier doivent donc etre deux a deux distincts.
      const graines = FLUX.map((f) => stamp(deriveSeed(identite, f)));
      expect(new Set(graines).size).toBe(FLUX.length); // cahier:L82

      // (4) et la suite observee doit porter de l'information : au moins deux
      //     valeurs distinctes sur douze tirages.
      expect(new Set(suiteSansTrafic).size).toBeGreaterThan(1);
      expect(new Set(tiragesBootstrap).size).toBeGreaterThan(1);

      // (5) la graine depend bien de l'IDENTITE : changer la seule repetition
      //     change le flux workload. Sinon « derivees par identifiants » (L82)
      //     ne serait pas observe.
      const autreRepetition: Json = { ...identite, repetition_id: 'R-2' };
      expect(stamp(deriveSeed(autreRepetition, 'workload'))).not.toBe(graineAvant); // cahier:L82

      // (6) deux flux differents ne produisent pas la meme suite.
      expect(take(streamRng(identite, 'scenario'), 12)).not.toEqual(suiteSansTrafic); // cahier:L82

      console.log(
        `[T02.A5] graines-distinctes=${String(new Set(graines).size)}/${String(FLUX.length)} ` +
          `formes=${JSON.stringify([...SHAPE])}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T02.A6 rejouer une suite avec la meme graine et version d algorithme donne la meme suite, avec vecteur publie',
    () => {
      assertLoaded();
      const vecteur = lireVecteurPublie();

      // (1) le vecteur est PUBLIE et complet : graine, version d'algorithme,
      //     suite. cahier:L173 « avec vecteur publie » ; cahier:L143 « une
      //     version et un algorithme pseudo-aleatoire figes sont requis ».
      expect({
        graine: vecteur.seed !== undefined && vecteur.seed !== null,
        version: vecteur.algorithm !== undefined && vecteur.algorithm !== null,
      }).toEqual({ graine: true, version: true }); // cahier:L143

      // (2) le vecteur porte de l'information : au moins huit tirages, dont au
      //     moins deux distincts. Un vecteur constant se rejouerait tout seul.
      const attendu = vecteur.values.map(stamp);
      expect(attendu.length).toBeGreaterThanOrEqual(8);
      expect(new Set(attendu).size).toBeGreaterThan(1);

      // (3) LE REJEU. Un generateur neuf, la graine et la version DU VECTEUR,
      //     et la suite doit revenir identique — c'est l'enonce du cas.
      const rejeu = take(makeRngVersioned(vecteur.seed, vecteur.algorithm), attendu.length);
      expect(rejeu).toEqual(attendu); // cahier:L173

      // (4) et une seconde fois, dans le meme processus : deux generateurs
      //     neufs ne partagent aucun compteur.
      const rejeuBis = take(makeRngVersioned(vecteur.seed, vecteur.algorithm), attendu.length);
      expect(rejeuBis).toEqual(attendu); // cahier:L173

      // (5) TEMOIN : la graine compte. Un generateur qui l'ignorerait rendrait
      //     (3) et (4) verts sans rien rejouer.
      const autreGraine = typeof vecteur.seed === 'string' ? `${vecteur.seed}-x` : 'graine-temoin-T02';
      const suiteAutreGraine = accepterSuite(() =>
        take(makeRngVersioned(autreGraine, vecteur.algorithm), attendu.length),
      );
      expect(suiteAutreGraine.join('|')).not.toBe(attendu.join('|'));

      // (6) TEMOIN : la VERSION compte. Sous une version inconnue, deux
      //     comportements sont acceptables — refuser, ou produire une autre
      //     suite. Reproduire le vecteur publie ne l'est pas : cela signifierait
      //     que la version figee de L143 n'est pas lue.
      let versionLue: string;
      try {
        const suiteAutreVersion = take(
          makeRngVersioned(vecteur.seed, 'version-inconnue-T02'),
          attendu.length,
        );
        versionLue = suiteAutreVersion.join('|') === attendu.join('|') ? 'VERSION-IGNOREE' : 'version-lue';
      } catch {
        versionLue = 'version-lue';
      }
      expect(versionLue).toBe('version-lue'); // cahier:L143

      console.log(
        `[T02.A6] vecteur=${vecteur.origine} tirages=${String(attendu.length)} ` +
          `distincts=${String(new Set(attendu).size)} formes=${JSON.stringify([...SHAPE])}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T02.A6 le rejeu ne lit ni Date.now() ni le hasard global ; l horloge est injectee',
    () => {
      assertLoaded();
      const vecteur = lireVecteurPublie();
      const attendu = vecteur.values.map(stamp);

      // On rend le hasard global INUTILISABLE et l'horloge MENTEUSE, sur une
      // fenetre strictement synchrone, puis on rejoue. cahier:L175 : « absence
      // de dependance a Date.now() ou au hasard global dans les fonctions de
      // domaine, verifiee par [...] tests a horloge imposee ».
      const vraiRandom = Math.random;
      const vraiNow = Date.now;
      let sousHorlogeZero: string[] = [];
      let sousHorlogeFuture: string[] = [];
      let incident = '';
      try {
        Math.random = (() => {
          throw new Error('HASARD-GLOBAL-INTERDIT');
        }) as unknown as () => number;
        Date.now = () => 0;
        sousHorlogeZero = take(makeRngVersioned(vecteur.seed, vecteur.algorithm), attendu.length);
        Date.now = () => 1_700_000_000_000;
        sousHorlogeFuture = take(makeRngVersioned(vecteur.seed, vecteur.algorithm), attendu.length);
      } catch (e) {
        incident = (e as Error).message.split('\n')[0];
      } finally {
        Math.random = vraiRandom;
        Date.now = vraiNow;
      }

      expect(incident).toBe(''); // cahier:L175
      expect(sousHorlogeZero).toEqual(attendu); // cahier:L175
      expect(sousHorlogeFuture).toEqual(attendu); // cahier:L175

      // L'HORLOGE EST INJECTABLE (livrable L171) : un instant impose est rendu
      // tel quel, et deux horloges distinctes ne se confondent pas.
      const clock = fn('fixedClock', C_CLOCK);
      const t0 = '2026-09-11T00:00:00.000Z'; // cahier:L80 « timestamps UTC ISO 8601 »
      const t1 = '2026-09-12T00:00:00.000Z'; // cahier:L80
      const lu0 = lireHorloge(clock(t0));
      const lu1 = lireHorloge(clock(t1));
      expect(lu0).not.toBe(lu1); // cahier:L171
      expect(lu0.includes('2026-09-11') || lu0.includes(String(Date.parse(t0)))).toBe(true); // cahier:L80
      expect(lu1.includes('2026-09-12') || lu1.includes(String(Date.parse(t1)))).toBe(true); // cahier:L80

      console.log(`[T02.A6/horloge] t0=${lu0} t1=${lu1}`);
    },
    CASE_TIMEOUT_MS,
  );
});

/* ─────────────────────────────────────────────────── petits utilitaires */

/** Un temoin qui LEVE vaut « suite differente » : c'est aussi un non-rejeu. */
function accepterSuite(call: () => string[]): string[] {
  try {
    return call();
  } catch (e) {
    return [`REFUSE:${(e as Error).message.split('\n')[0]}`];
  }
}

/** Lecture d'une horloge injectee, quelle que soit sa forme. */
function lireHorloge(clockLike: unknown): string {
  if (typeof clockLike === 'function') return stamp((clockLike as () => unknown)());
  if (clockLike !== null && typeof clockLike === 'object') {
    const o = clockLike as Ns;
    for (const m of ['now', 'nowIso', 'instant', 'iso', 'nowMs', 'read']) {
      const c = o[m];
      if (typeof c === 'function') return stamp((c as () => unknown).call(o));
      if (c !== undefined && typeof c !== 'object') return stamp(c);
    }
  }
  return stamp(clockLike);
}
