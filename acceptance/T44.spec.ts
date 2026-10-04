/**
 * acceptance/T44.spec.ts — suite d'acceptation de la tache T44.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T44.A1 behaviour — chaque appel regle porte un `provider` et un `model`
 *                      non vides, egaux a ceux que le fournisseur a declares
 *   T44.A2 behaviour — le vecteur d'usage porte exactement `input_fresh`,
 *                      `cache_write_5m`, `cache_write_1h`, `cache_read` et
 *                      `output`, en entiers non negatifs
 *   T44.A3 behaviour — deux fournisseurs factices declarant deux modeles
 *                      distincts produisent deux valeurs de `model` distinctes
 *   T44.A4 absence   — un usage qui ne distingue pas lecture et ecriture de
 *                      cache est conserve dans une categorie explicitement
 *                      non ventilee ; aucune de ses unites n'est attribuee a
 *                      `cache_read`, `cache_write_5m` ou `cache_write_1h`
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T44 EST UNE TACHE D'EXTENSION (ADR-007) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T44 — `packages/gateway`
 * et `packages/billing` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff). Le
 * contrat teste ci-dessous est derive de docs/specs/T44.md, lui-meme extrait
 * verbatim de docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md, lignes
 * 141 a 147 (la plage que la carte de T44 epingle dans
 * verification/tasks.extensions.json#spec_source) :
 *
 *   L141  titre : « Enregistrer le modele et le vecteur de tokens de chaque
 *         appel »
 *   L143  livrables : « chaque appel modele regle porte le fournisseur, le
 *         modele effectivement appele et le vecteur de tokens a cinq
 *         categories d'ADR-002 ; un usage plus grossier que ces cinq
 *         categories est enregistre tel quel et marque non ventile, jamais
 *         redistribue »
 *   L145  les quatre cas d'acceptation, mot pour mot — seule ligne qui nomme
 *         les champs `provider`, `model`, `input_fresh`, `cache_write_5m`,
 *         `cache_write_1h`, `cache_read`, `output`
 *   L147  commande : `pnpm verify:task T44` ; « aucun acces a une API reelle
 *         n'est necessaire »
 *
 * Cette suite n'ouvre PAS docs/adr/ADR-002 (le vecteur a cinq categories que
 * L143 y renvoie) : L145 enonce deja, pour T44, les cinq noms de champs
 * litteralement et c'est la seule ligne dont cette suite a besoin. Les
 * taches T17 et T28 (`depends_on` de T44) sont deja PROUVEES ailleurs ; cette
 * suite reprend sans les reinventer les roles que acceptance/T17.spec.ts a
 * fixes pour `packages/gateway` (`createFakeProvider`, `dispatchModelCall`,
 * `getModelCall`) et ceux que acceptance/T16.spec.ts/T12.spec.ts ont fixes
 * pour `packages/billing`/`packages/storage`.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * La regle du driver (« tout litteral compare porte un commentaire
 * `// cahier:L<n>` resolvable ») est ecrite pour les taches du cahier. T44
 * N'A PAS de ligne de cahier : sa source est l'ADR epingle par
 * verification/tasks.extensions.json#spec_source. Cette suite applique donc
 * la MEME discipline sous la forme que le role spec-extractor emploie deja
 * pour les taches d'extension (`<!-- source:<chemin ADR>:L<a>-L<b> -->` dans
 * docs/specs/T44.md) : chaque litteral COMPARE porte un commentaire
 * `// source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L<n>`
 * resolvable par `sed -n '<n>p'`. Toutes les occurrences ci-dessous visent
 * L145, sauf mention contraire.
 *
 * Litteraux ainsi fixes (L145, l'enum complet des noms de champs) :
 *   `provider`, `model`                                           — A1
 *   `input_fresh`, `cache_write_5m`, `cache_write_1h`, `cache_read`,
 *   `output`                                                      — A2, A4
 *
 * CE QUE CETTE SUITE FABRIQUE, ET QUI N'EST DONC PAS UN LITTERAL A FAIRE
 * REMONTER : les identites de fournisseur/modele factices (`acme-labs`,
 * `acme-large-v1`, `alpha-labs`, `alpha-model-1`, `beta-labs`,
 * `beta-model-2`) sont des ENTREES de test — L145 exige seulement que la
 * valeur ECRITE soit EGALE a celle DECLAREE, jamais une valeur precise ; de
 * meme les grandeurs d'usage choisies pour A2/A4 (7, 3, 5, 11, 13, 9, 6, 4)
 * sont des entrees arbitraires et DISTINCTES entre elles (pour detecter une
 * permutation de champs), jamais des valeurs tirees du texte. Le nom du champ
 * qui recoit les unites non ventilees (`cache_unresolved`, cf. III.3) n'est
 * PAS enonce par L143/L145 — comme `IDEMPOTENCY_KEY_CONFLICT` ne l'etait pas
 * pour T17.A7 — il est FIXE ICI.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T44 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * T44 n'ajoute AUCUN export : elle ETEND la forme des entrees/sorties de
 * `createFakeProvider`, `dispatchModelCall` et `getModelCall`, deja fixes par
 * acceptance/T17.spec.ts (section III), de la meme facon que T17.spec.ts
 * avait deja prevu une extension possible de la reponse du fournisseur
 * factice (« les deux formes sont compatibles avec elle »).
 *
 * 1. `createFakeProvider({ provider?, model?, responses, onRequest? })` —
 *    ROLE REPRIS TEL QUEL de acceptance/T17.spec.ts. Deux options
 *    supplementaires, FIXEES ICI : `provider` (string) et `model` (string),
 *    l'identite que CE fournisseur factice declare pour tout appel qu'il
 *    sert. L'objet rendu expose en outre `.provider` et `.model` (les memes
 *    valeurs, lisibles), en plus de `.complete`/`.calls` deja fixes par T17.
 *    Une suite qui ne les fournit pas (T17.spec.ts, T28.spec.ts) ne change
 *    rien a son propre comportement : ce sont des options et des proprietes
 *    ADDITIONNELLES, jamais requises.
 *
 * 2. `responses[i].usage` — ROLE DEJA PREVU EXTENSIBLE par T17.spec.ts (« la
 *    sonde n'utilise que des chaines et ne regarde jamais la valeur de
 *    retour, donc les deux formes sont compatibles avec elle »). Cette suite
 *    EXERCE DEUX formes, TOUTES DEUX VALIDES :
 *      (a) FINE, FIXEE ICI — `{ input_fresh_tokens, cache_write_5m_tokens,
 *          cache_write_1h_tokens, cache_read_tokens, output_tokens }` :
 *          cinq compteurs qui correspondent un a un au vecteur L145 (A2).
 *      (b) GROSSIERE, REPRISE TELLE QUELLE de acceptance/T17.spec.ts —
 *          `{ input_uncached_tokens, input_cached_tokens, output_tokens }` :
 *          la forme a trois categories deja fixee par T17, qui NE DISTINGUE
 *          PAS lecture et ecriture de cache — exactement le cas que L143/A4
 *          vise (A4).
 *
 * 3. Enregistrement regle, lu par `getModelCall(handle, { model_call_id })`
 *    (ROLE REPRIS TEL QUEL de T17) — porte desormais, en plus des champs deja
 *    fixes par T17 :
 *      `provider` (string)  — copie de `prov.provider` au moment du dispatch
 *                              reussi (A1).
 *      `model`    (string)  — copie de `prov.model` (A1, A3).
 *      `usage`    (objet)   — le vecteur L145, derive de `responses[i].usage`
 *                              SELON LA FORME recue :
 *        - forme FINE  -> copie un a un, SANS suffixe `_tokens` :
 *          `input_fresh`, `cache_write_5m`, `cache_write_1h`, `cache_read`,
 *          `output`. Le vecteur porte EXACTEMENT ces cinq cles (A2).
 *        - forme GROSSIERE -> `input_uncached_tokens -> input_fresh`,
 *          `output_tokens -> output`, et les trois categories de cache que
 *          L143/A4 protege restent a ZERO (`cache_read = cache_write_5m =
 *          cache_write_1h = 0`, cf. A4) : `input_cached_tokens`, AMBIGU entre
 *          lecture et ecriture de cache, n'est JAMAIS redistribue vers l'une
 *          d'elles. Il est conserve TEL QUEL (L143) dans une SIXIEME cle,
 *          FIXEE ICI et non enoncee par l'ADR : `cache_unresolved`. Cette cle
 *          n'apparait QUE lorsque la forme grossiere produit une ambiguite —
 *          c'est ce qui rend A2 (« exactement cinq cles ») et A4 (« une
 *          categorie explicitement non ventilee ») simultanement vrais sans
 *          se contredire : A2 est exerce sur la forme FINE (aucune
 *          ambiguite, cinq cles exactement), A4 sur la forme GROSSIERE (six
 *          cles, la sixieme portant ce que les cinq premieres ne peuvent pas
 *          exprimer).
 *
 * Roles repris tels quels de `packages/billing` (fixes par
 * acceptance/T16.spec.ts) : `openBudget`, `reserveBudget`. Roles repris tels
 * quels de `packages/storage` (fixes par acceptance/T12.spec.ts) :
 * `applyMigrations`, `openStore`, `closeStore`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle n'exerce pas `reconcileModelCall` (le chemin de reconciliation
 *    hors-bande de T17) : L145 ne distingue pas dispatch direct et
 *    reconciliation, et le chemin dispatch direct suffit a observer les
 *    quatre cas sans dependre d'une panne simulee.
 *  • Elle n'exerce aucun vrai fournisseur reseau (L147 : « aucun acces a une
 *    API reelle n'est necessaire ») — uniquement le fournisseur factice de
 *    la sonde `fake-provider`.
 *  • Elle ne fixe aucun nom de colonne ni de table : cette suite passe
 *    exclusivement par les exports de `packages/gateway`/`packages/billing`/
 *    `packages/storage`.
 *  • Elle ne verifie pas la coherence du vecteur avec ADR-002 au-dela de ce
 *    que L145 enonce deja (les cinq noms de champs) : cette suite est AVEUGLE
 *    a ADR-002, qu'elle n'a pas lu (cf. I).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
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

/** Les trois paquets charges par cette suite (cf. III : gateway+billing sont
 * les `source_paths` de T44 ; storage est la dependance transitive via T12,
 * deja fixee par acceptance/T12.spec.ts/T17.spec.ts). */
const PACKAGES = ['gateway', 'billing', 'storage'] as const;

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

/* ═══════════════ les litteraux de L145, et rien d'autre ═══════════════ */

/** L145 : les noms de champs de l'enregistrement regle (A1). */
const CHAMP_PROVIDER = 'provider'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
const CHAMP_MODEL = 'model'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

/** L145 : les cinq noms EXACTS du vecteur de tokens a cinq categories. */
const CHAMP_INPUT_FRESH = 'input_fresh'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
const CHAMP_CACHE_WRITE_5M = 'cache_write_5m'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
const CHAMP_CACHE_WRITE_1H = 'cache_write_1h'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
const CHAMP_CACHE_READ = 'cache_read'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
const CHAMP_OUTPUT = 'output'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

const CHAMPS_VECTEUR_L145 = [
  CHAMP_INPUT_FRESH,
  CHAMP_CACHE_WRITE_5M,
  CHAMP_CACHE_WRITE_1H,
  CHAMP_CACHE_READ,
  CHAMP_OUTPUT,
] as const; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

/** Categorie des unites non ventilees — FIXEE PAR CETTE SUITE (cf. II/III.3),
 * L143/L145 ne la nomment pas. */
const CHAMP_CACHE_UNRESOLVED = 'cache_unresolved';

/** Zero unite attribuee a une categorie de cache (A4) — L143 : « jamais
 * redistribue ». */
const ZERO_UNITE = 0; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L143

/* ═══════════════════════════ PostgreSQL reel (requires: postgres18) ══════ */

const RUN = `t44_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(
    r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`,
  ).toBe('base-creee'); // requires postgres18 (verification/tasks.extensions.json T44)
  BASES_CREEES.push(nom);
  return nom;
}

/* ═══════════════ chargement des paquets declares par le registre ═══════ */

interface Loaded {
  chargesPar: Set<string>;
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
  const chargesPar = new Set<string>();
  const flat = new Map<string, unknown>();
  for (const pkg of PACKAGES) {
    let charge = false;
    for (const s of specifiersFor(pkg)) {
      if (charge) break;
      try {
        const mod = (await import(s)) as Ns;
        flatten(mod, flat);
        chargesPar.add(pkg);
        charge = true;
      } catch (e) {
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet packages/${pkg} : aucun specificateur n'a repondu`);
  }
  return { chargesPar, flat, attempts };
}

let LOADED: Loaded = { chargesPar: new Set(), flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertPackageLoaded(pkg: string): void {
  expect(
    LOADED.chargesPar.has(pkg)
      ? `packages/${pkg}-charge`
      : `PAQUET-NON-CHARGEABLE packages/${pkg} : ${LOADED.attempts.join(' | ')}`,
  ).toBe(`packages/${pkg}-charge`);
}

/* ─────────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  // packages/storage — repris tels quels de acceptance/T12.spec.ts.
  applyMigrations: [
    'applyMigrations', 'applyCentralMigrations', 'runMigrations', 'migrate',
    'migrateCentral', 'migrateUp', 'ensureSchema', 'createSchema', 'initSchema',
    'setupSchema', 'up',
  ],
  openStore: [
    'openStore', 'openCentralStore', 'createStore', 'openRepository',
    'createRepository', 'connect', 'createPool', 'openDatabase', 'open',
  ],
  closeStore: [
    'closeStore', 'closeRepository', 'disconnect', 'shutdown', 'dispose', 'close', 'end',
  ],
  // packages/billing — repris tels quels de acceptance/T16.spec.ts.
  openBudget: [
    'openBudget', 'createBudget', 'initBudget', 'ensureBudget', 'openBudgetLedger',
    'createBudgetLedger',
  ],
  reserveBudget: [
    'reserveBudget', 'reserve', 'createReservation', 'requestReservation', 'reserveAmount',
  ],
  // packages/gateway — repris tels quels de acceptance/T17.spec.ts (section III).
  createFakeProvider: [
    'createFakeProvider', 'makeFakeProvider', 'newFakeProvider', 'fakeProvider',
  ],
  dispatchModelCall: [
    'dispatchModelCall', 'dispatchCall', 'dispatch', 'sendModelCall', 'executeModelCall',
  ],
  getModelCall: [
    'getModelCall', 'readModelCall', 'fetchModelCall', 'getCall', 'loadModelCall',
  ],
};

type Fn = (...a: unknown[]) => unknown;

function resolveRole(name: string): { fn?: Fn; tried: readonly string[] } {
  const aliases = ROLES[name];
  if (aliases === undefined) throw new Error(`role inconnu de la suite : ${name}`);
  for (const a of aliases) {
    const v = LOADED.flat.get(a);
    if (typeof v === 'function') return { fn: v as Fn, tried: aliases };
  }
  return { tried: aliases };
}

function requireRole(name: string): Fn {
  const { fn, tried } = resolveRole(name);
  expect(
    fn !== undefined ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fn;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<
  { ok: true; value: T } | { ok: false; err: unknown }
> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

/* ══════════════════════════ mise en place par cas ═══════════════════════ */

const HANDLES: unknown[] = [];

async function ouvrirStore(suffixe: string): Promise<unknown> {
  const applyMigrations = requireRole('applyMigrations');
  const openStore = requireRole('openStore');
  const db = creerBase(suffixe);
  const dsn = dsnFor(db);
  const mig = await essayer(() => applyMigrations({ dsn }));
  expect(mig.ok ? 'migrations-appliquees' : `MIGRATIONS-EN-ECHEC ${messageDe((mig as { err: unknown }).err)}`).toBe(
    'migrations-appliquees',
  );
  const ouv = await essayer(() => openStore({ dsn }));
  expect(ouv.ok ? 'store-ouvert' : `OUVERTURE-STORE-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe(
    'store-ouvert',
  );
  const handle = (ouv as { ok: true; value: unknown }).value;
  HANDLES.push(handle);
  return handle;
}

afterAll(async () => {
  const closeStore = resolveRole('closeStore').fn;
  if (closeStore !== undefined) {
    for (const h of [...HANDLES]) {
      try {
        await closeStore(h);
      } catch {
        /* la fermeture n'est pas l'objet des assertions ; la base est de toute facon droppee. */
      }
    }
  }
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

let compteur = 0;
function idFor(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${RUN}-${compteur}`;
}

/** Ouvre un store, un budget de plafond `limite` et une reservation
 * `montant` sur ce budget. Rend tout ce qu'il faut pour appeler
 * `dispatchModelCall`. `montant`/`limite` sont des ENTREES de test (cf. II),
 * aucune assertion de cette suite ne porte sur le budget : T44 ne teste pas
 * la facturation (deja couverte par T17), seulement le provider/model/usage
 * de l'enregistrement regle. */
async function preparerBudgetEtReservation(
  suffixe: string,
  montant = 500,
  limite = 10_000,
): Promise<{ handle: unknown; budgetId: string; reservationId: string }> {
  const handle = await ouvrirStore(suffixe);
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');

  const budgetId = idFor('bud');
  const ouv = await essayer(() => openBudget(handle, { budget_id: budgetId, limit: limite }));
  expect(ouv.ok ? 'budget-ouvert' : `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe(
    'budget-ouvert',
  );

  const r = await essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: montant }));
  expect(r.ok ? 'reservation-acceptee' : `RESERVATION-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe(
    'reservation-acceptee',
  );
  const val = (r as { ok: true; value: Json }).value;
  const reservationId = val.reservation_id as string | undefined;
  expect(
    typeof reservationId === 'string' ? 'reservation-a-son-identifiant' : `RESERVATION-SANS-IDENTIFIANT ${rendu(val)}`,
  ).toBe('reservation-a-son-identifiant');

  return { handle, budgetId, reservationId: reservationId as string };
}

/** Dispatche un appel via `provider` et rend l'enregistrement REGLE, lu par
 * `getModelCall`. Echoue l'assertion si le dispatch ou la lecture echouent. */
async function dispatcherEtLire(
  handle: unknown,
  budgetId: string,
  reservationId: string,
  provider: unknown,
  requestTag: string,
  tariff: Json,
): Promise<Json> {
  const dispatchModelCall = requireRole('dispatchModelCall');
  const getModelCall = requireRole('getModelCall');

  const modelCallId = idFor('call');
  const res = await essayer(() =>
    dispatchModelCall(handle, {
      model_call_id: modelCallId,
      idempotency_key: idFor('idem'),
      budget_id: budgetId,
      reservation_id: reservationId,
      provider,
      request: { prompt: requestTag },
      tariff,
    }),
  );
  expect(res.ok ? 'dispatch-reussi' : `DISPATCH-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
    'dispatch-reussi',
  );

  const lu = await essayer(() => getModelCall(handle, { model_call_id: modelCallId }));
  expect(lu.ok ? 'lecture-reussie' : `LECTURE-EN-ECHEC ${messageDe((lu as { err: unknown }).err)}`).toBe(
    'lecture-reussie',
  );
  const enreg = (lu as { ok: true; value: Json | null }).value;
  expect(enreg !== null ? 'enregistrement-present' : 'ENREGISTREMENT-ABSENT').toBe('enregistrement-present');
  return enreg as Json;
}

/** Grille tarifaire neutre — T44 ne teste pas la facturation (cf. T17), la
 * valeur n'est jamais comparee dans une assertion de cette suite. */
const TARIFF_NEUTRE: Json = {
  input_uncached_per_token: 1,
  input_cached_per_token: 1,
  output_per_token: 1,
};

/* ══════════════════════════════ T44.A1 ══════════════════════════════════ */

test('T44.A1 — chaque appel regle porte un provider et un model non vides, egaux a ceux declares', async () => {
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a1');
  const createFakeProvider = requireRole('createFakeProvider');

  const PROVIDER_DECLARE = 'acme-labs';
  const MODEL_DECLARE = 'acme-large-v1';

  const provider = await essayer(() =>
    createFakeProvider({
      provider: PROVIDER_DECLARE,
      model: MODEL_DECLARE,
      responses: [
        {
          text: 'reponse-modele',
          usage: { input_uncached_tokens: 2, input_cached_tokens: 0, output_tokens: 1 },
        },
      ],
    }),
  );
  expect(provider.ok ? 'fournisseur-cree' : `FOURNISSEUR-EN-ECHEC ${messageDe((provider as { err: unknown }).err)}`).toBe(
    'fournisseur-cree',
  );
  const prov = (provider as { ok: true; value: unknown }).value;

  const enreg = await dispatcherEtLire(handle, budgetId, reservationId, prov, 'A1', TARIFF_NEUTRE);

  const providerEcrit = enreg[CHAMP_PROVIDER];
  const modelEcrit = enreg[CHAMP_MODEL];

  expect(
    typeof providerEcrit === 'string' && providerEcrit.length > 0
      ? 'provider-non-vide'
      : `PROVIDER-VIDE-OU-ABSENT ${rendu(providerEcrit)}`,
  ).toBe('provider-non-vide'); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
  expect(
    typeof modelEcrit === 'string' && modelEcrit.length > 0
      ? 'model-non-vide'
      : `MODEL-VIDE-OU-ABSENT ${rendu(modelEcrit)}`,
  ).toBe('model-non-vide'); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

  // L'ASSERTION DECISIVE : EGAL a ce que LE FOURNISSEUR a declare, pas a une
  // valeur quelconque non vide.
  expect(providerEcrit).toBe(PROVIDER_DECLARE); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
  expect(modelEcrit).toBe(MODEL_DECLARE); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
});

/* ══════════════════════════════ T44.A2 ══════════════════════════════════ */

test('T44.A2 — le vecteur d usage porte exactement les cinq categories L145, en entiers non negatifs', async () => {
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a2');
  const createFakeProvider = requireRole('createFakeProvider');

  // Cinq entiers DISTINCTS (entree de test, cf. II) pour qu'une permutation
  // de champs soit detectable. `input_uncached_tokens`/`input_cached_tokens`
  // sont AJOUTES en complement, GROSSIERS et coherents (7 ; 3+5+11=19 ; 13) :
  // le calcul de cout deja fixe par T17 (acceptance/T17.spec.ts) en depend
  // et n'est pas l'objet de ce cas — seul `enreg.usage`, le vecteur DERIVE et
  // PERSISTE, est asserte ci-dessous, jamais cette reponse brute.
  const USAGE_FIN = {
    input_fresh_tokens: 7,
    cache_write_5m_tokens: 3,
    cache_write_1h_tokens: 5,
    cache_read_tokens: 11,
    output_tokens: 13,
    input_uncached_tokens: 7,
    input_cached_tokens: 19,
  };

  const provider = await essayer(() =>
    createFakeProvider({
      provider: 'stub-labs',
      model: 'stub-model-fine-v1',
      responses: [{ text: 'reponse-modele', usage: USAGE_FIN }],
    }),
  );
  expect(provider.ok ? 'fournisseur-cree' : `FOURNISSEUR-EN-ECHEC ${messageDe((provider as { err: unknown }).err)}`).toBe(
    'fournisseur-cree',
  );
  const prov = (provider as { ok: true; value: unknown }).value;

  const enreg = await dispatcherEtLire(handle, budgetId, reservationId, prov, 'A2', TARIFF_NEUTRE);
  const usage = enreg.usage;
  expect(
    typeof usage === 'object' && usage !== null ? 'usage-present' : `USAGE-ABSENT ${rendu(usage)}`,
  ).toBe('usage-present');
  const u = usage as Json;

  // L'ASSERTION DECISIVE : EXACTEMENT les cinq cles de L145, ni plus ni moins.
  const clesAttendues = [...CHAMPS_VECTEUR_L145].sort();
  const clesObtenues = Object.keys(u).sort();
  expect(clesObtenues).toEqual(clesAttendues); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

  for (const champ of CHAMPS_VECTEUR_L145) {
    const v = u[champ];
    expect(
      typeof v === 'number' && Number.isInteger(v) && v >= 0
        ? `${champ}-entier-non-negatif`
        : `${champ.toUpperCase()}-INVALIDE ${rendu(v)}`,
    ).toBe(`${champ}-entier-non-negatif`); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
  }

  // Echo-through exact : chaque categorie recue correspond a la categorie
  // ecrite du meme nom (sans suffixe `_tokens`), pas a une autre.
  expect(u[CHAMP_INPUT_FRESH]).toBe(USAGE_FIN.input_fresh_tokens);
  expect(u[CHAMP_CACHE_WRITE_5M]).toBe(USAGE_FIN.cache_write_5m_tokens);
  expect(u[CHAMP_CACHE_WRITE_1H]).toBe(USAGE_FIN.cache_write_1h_tokens);
  expect(u[CHAMP_CACHE_READ]).toBe(USAGE_FIN.cache_read_tokens);
  expect(u[CHAMP_OUTPUT]).toBe(USAGE_FIN.output_tokens);
});

/* ══════════════════════════════ T44.A3 ══════════════════════════════════ */

test('T44.A3 — deux fournisseurs factices declarant deux modeles distincts produisent deux valeurs de model distinctes', async () => {
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const createFakeProvider = requireRole('createFakeProvider');

  const MODEL_ALPHA = 'alpha-model-1';
  const MODEL_BETA = 'beta-model-2';

  const providerAlpha = await essayer(() =>
    createFakeProvider({
      provider: 'alpha-labs',
      model: MODEL_ALPHA,
      responses: [
        {
          text: 'reponse-alpha',
          usage: { input_uncached_tokens: 1, input_cached_tokens: 0, output_tokens: 1 },
        },
      ],
    }),
  );
  expect(
    providerAlpha.ok ? 'fournisseur-alpha-cree' : `FOURNISSEUR-ALPHA-EN-ECHEC ${messageDe((providerAlpha as { err: unknown }).err)}`,
  ).toBe('fournisseur-alpha-cree');
  const provAlpha = (providerAlpha as { ok: true; value: unknown }).value;

  const providerBeta = await essayer(() =>
    createFakeProvider({
      provider: 'beta-labs',
      model: MODEL_BETA,
      responses: [
        {
          text: 'reponse-beta',
          usage: { input_uncached_tokens: 1, input_cached_tokens: 0, output_tokens: 1 },
        },
      ],
    }),
  );
  expect(
    providerBeta.ok ? 'fournisseur-beta-cree' : `FOURNISSEUR-BETA-EN-ECHEC ${messageDe((providerBeta as { err: unknown }).err)}`,
  ).toBe('fournisseur-beta-cree');
  const provBeta = (providerBeta as { ok: true; value: unknown }).value;

  const { handle: handleA, budgetId: budgetA, reservationId: resA } = await preparerBudgetEtReservation('a3-alpha');
  const { handle: handleB, budgetId: budgetB, reservationId: resB } = await preparerBudgetEtReservation('a3-beta');

  const enregAlpha = await dispatcherEtLire(handleA, budgetA, resA, provAlpha, 'A3-alpha', TARIFF_NEUTRE);
  const enregBeta = await dispatcherEtLire(handleB, budgetB, resB, provBeta, 'A3-beta', TARIFF_NEUTRE);

  const modelAlphaEcrit = enregAlpha[CHAMP_MODEL];
  const modelBetaEcrit = enregBeta[CHAMP_MODEL];

  expect(
    typeof modelAlphaEcrit === 'string' && modelAlphaEcrit.length > 0
      ? 'model-alpha-non-vide'
      : `MODEL-ALPHA-INVALIDE ${rendu(modelAlphaEcrit)}`,
  ).toBe('model-alpha-non-vide');
  expect(
    typeof modelBetaEcrit === 'string' && modelBetaEcrit.length > 0
      ? 'model-beta-non-vide'
      : `MODEL-BETA-INVALIDE ${rendu(modelBetaEcrit)}`,
  ).toBe('model-beta-non-vide');

  expect(modelAlphaEcrit).toBe(MODEL_ALPHA); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
  expect(modelBetaEcrit).toBe(MODEL_BETA); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

  // L'ASSERTION DECISIVE : les deux valeurs sont DISTINCTES.
  expect(
    modelAlphaEcrit !== modelBetaEcrit
      ? 'deux-valeurs-distinctes'
      : `MEME-VALEUR-POUR-DEUX-FOURNISSEURS ${rendu(modelAlphaEcrit)}`,
  ).toBe('deux-valeurs-distinctes'); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
});

/* ══════════════════════════════ T44.A4 ══════════════════════════════════ */

test('T44.A4 — usage grossier : categorie explicitement non ventilee, aucune unite attribuee a cache_read/write', async () => {
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a4');
  const createFakeProvider = requireRole('createFakeProvider');

  // Forme GROSSIERE, reprise telle quelle de acceptance/T17.spec.ts : trois
  // categories seulement, `input_cached_tokens` NE DISTINGUE PAS lecture et
  // ecriture de cache (L143) — exactement le cas que A4 vise.
  const FRESH = 9;
  const AMBIGU_CACHE = 6;
  const SORTIE = 4;
  const USAGE_GROSSIER = {
    input_uncached_tokens: FRESH,
    input_cached_tokens: AMBIGU_CACHE,
    output_tokens: SORTIE,
  };

  const provider = await essayer(() =>
    createFakeProvider({
      provider: 'legacy-labs',
      model: 'legacy-model-coarse-v1',
      responses: [{ text: 'reponse-modele', usage: USAGE_GROSSIER }],
    }),
  );
  expect(provider.ok ? 'fournisseur-cree' : `FOURNISSEUR-EN-ECHEC ${messageDe((provider as { err: unknown }).err)}`).toBe(
    'fournisseur-cree',
  );
  const prov = (provider as { ok: true; value: unknown }).value;

  const enreg = await dispatcherEtLire(handle, budgetId, reservationId, prov, 'A4', TARIFF_NEUTRE);
  const usage = enreg.usage;
  expect(
    typeof usage === 'object' && usage !== null ? 'usage-present' : `USAGE-ABSENT ${rendu(usage)}`,
  ).toBe('usage-present');
  const u = usage as Json;

  // L'ASSERTION DECISIVE (A4, proof_kind=absence) : AUCUNE unite ambigue
  // n'est attribuee a cache_read, cache_write_5m ou cache_write_1h — les
  // trois restent a ZERO, MEME si un total non nul existe ailleurs.
  expect(u[CHAMP_CACHE_READ]).toBe(ZERO_UNITE); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
  expect(u[CHAMP_CACHE_WRITE_5M]).toBe(ZERO_UNITE); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
  expect(u[CHAMP_CACHE_WRITE_1H]).toBe(ZERO_UNITE); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

  // Les categories SANS ambiguite restent correctement mappees.
  expect(u[CHAMP_INPUT_FRESH]).toBe(FRESH); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145
  expect(u[CHAMP_OUTPUT]).toBe(SORTIE); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145

  // « enregistre tel quel et marque non ventile » (L143) : la quantite
  // ambigue n'est PAS perdue, elle est conservee dans une categorie
  // EXPLICITEMENT distincte (cache_unresolved, FIXE PAR CETTE SUITE, cf. II).
  const nonVentile = u[CHAMP_CACHE_UNRESOLVED];
  expect(
    typeof nonVentile === 'number' && Number.isInteger(nonVentile) && nonVentile >= 0
      ? 'categorie-non-ventilee-presente'
      : `CATEGORIE-NON-VENTILEE-ABSENTE-OU-INVALIDE ${rendu(nonVentile)} (cles : ${rendu(Object.keys(u))})`,
  ).toBe('categorie-non-ventilee-presente'); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L143
  expect(nonVentile).toBe(AMBIGU_CACHE); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L143

  // Garde-fou final contre un faux PASS de MARQUEURS_DE_PLANTAGE : ce champ
  // ne doit pas lui-meme avoir ete confondu avec une des trois categories
  // protegees.
  expect(
    [CHAMP_CACHE_READ, CHAMP_CACHE_WRITE_5M, CHAMP_CACHE_WRITE_1H].includes(CHAMP_CACHE_UNRESOLVED)
      ? `COLLISION-DE-NOM ${CHAMP_CACHE_UNRESOLVED}`
      : 'aucune-collision-de-nom',
  ).toBe('aucune-collision-de-nom');
});
