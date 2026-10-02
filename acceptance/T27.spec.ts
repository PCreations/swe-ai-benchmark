/**
 * acceptance/T27.spec.ts — suite d'acceptation de la tache T27.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T27.A1 behaviour — deux branches partent du meme etat metier mais de
 *                      volumes et identites distincts
 *   T27.A2 behaviour — modifier A ne change ni B ni le parent
 *   T27.A3 numeric   — parent a cout 10000, depense supplementaire 2000,
 *                      branches a 300 et 500 : depenses physiques globales
 *                      12800, cout marginal des branches 300/500
 *   T27.A4 absence   — le prefixe ancestral n'est pas facture deux fois dans
 *                      ce total
 *   T27.A5 numeric   — politique reservant 15 % d'un budget 1000 identifie
 *                      150 pour maintenance sans porter le budget a 1150
 *   T27.A6 refusal   — etat ineligible au controle est signale, pas efface
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T27 — `apps/cli`, `packages/storage`
 * et `packages/billing`. ADR-001 : cet aveuglement est PROCEDURAL, une
 * discipline auditable au diff, pas une barriere technique. Le contrat teste
 * ci-dessous n'a ete releve NI dans l'implementation, NI par `git show` ; il
 * est derive de docs/specs/T27.md (donc des lignes du cahier que la carte de
 * specification epingle) et des CONTRATS DEJA PUBLICS des taches dont T27
 * depend (T12, T15, T16 : des suites ACCEPTANCE deja figees, pas de
 * l'implementation) :
 *
 *   L387  titre : « Creer les branches experimentales et les politiques de
 *         maintenance »
 *   L389  dependances T15, T16, T24, T26 ; livrables : « commande `bench
 *         fork`, filiation des branches et configuration de politique de
 *         travail »
 *   L391  les six cas d'acceptation, mot pour mot — c'est la SEULE ligne du
 *         cahier qui chiffre 10000, 2000, 300, 500, 12800, 15 %, 1000 et 150
 *   L393  fin : « les branches ne reinjectent jamais leurs solutions dans la
 *         trajectoire principale [...] le test verifie le budget,
 *         l'assignation et la trace, pas que l'agent devient plus
 *         maintenable » — c'est cette phrase qui borne la portee : budget
 *         (A3/A4/A5), assignation/provisionnement (A1/A2), trace/signal (A6)
 *   L97   etats de phase : « les etats d'arret de calcul `BUDGET_EXHAUSTED`,
 *         `RUNNER_BLOCKED` et `CANCELLED` n'effacent pas la periode de
 *         l'analyse » — c'est le sens exact du « pas efface » de L391/A6 ;
 *         carte de specification : applique specifiquement a T27.A6
 *   L34   « les interfaces sont implementees par adaptateurs » — ce qui
 *         autorise cette suite a choisir l'adaptateur de stockage le plus
 *         simple (PostgreSQL direct, comme T12/T16) sans exiger S3 ni runc en
 *         direct, cf. IV
 *   L80   « les montants sont des chaines d'entiers non negatifs [...]
 *         `1000000` vaut 1 USD » — format d'un montant valide, repris de T16
 *   L71   invariant 9 : « les depenses utilisent des entiers exacts, jamais
 *         une addition de flottants monetaires »
 *   L66   invariant 4 : « un rollback de l'application ne restaure jamais le
 *         registre central des couts » — le registre comptable de T16 (donc
 *         le budget consulte ici) est un etat CENTRAL, distinct de l'etat
 *         applicatif d'une branche
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *   acceptance/T12.spec.ts — `applyMigrations`, `openStore`, `closeStore`
 *   acceptance/T16.spec.ts — `openBudget`, `importReceipt`,
 *         `listLedgerEntries`, `getBudgetState`, repris a l'identique
 *         puisque T27 depend de T16 et qu'une convention deja fixee pour un
 *         consommateur ne se reinvente pas
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Aucune fixture de §F ne porte sur T27 : la racine gelee
 * `acceptance/reference/**` ne contient que les dix fixtures arithmetiques
 * F-BOOTSTRAP … F-RESERVATION, dont aucune ne decrit une filiation de
 * branches ni une politique de maintenance. Tout litteral COMPARE dans une
 * assertion porte donc un commentaire `// cahier:L<n>` resoluble par
 * `sed -n '<n>p' docs/cahier.md` :
 *
 *   10000, 2000, 300, 500, 12800       — L391, l'arithmetique de A3
 *   22800                               — L391, le total SI le prefixe
 *                                         ancestral etait compte deux fois
 *                                         (valeur qui NE DOIT PAS apparaitre)
 *   14800                               — L391, le total SI la depense
 *                                         supplementaire etait comptee deux
 *                                         fois (valeur qui NE DOIT PAS
 *                                         apparaitre)
 *   15 % (0.15), 1000, 150              — L391, la politique de maintenance
 *   1150                                — L391, le budget NE DOIT PAS
 *                                         atteindre cette valeur
 *   151                                 — L391, l'arrondi errone a eviter
 *   `BUDGET_EXHAUSTED`, `DEVELOPING`    — L97, les phases utilisees pour A6
 *
 * CE QUE CETTE SUITE FABRIQUE, ET QUI N'EST DONC PAS UN LITTERAL A FAIRE
 * REMONTER : les noms de bases jetables, les identifiants de budget et de
 * branche (prefixes par `RUN`), le montant de la depense ancetre servant de
 * marqueur d'etat metier et le montant de la modification posee sur la
 * branche A en A2 — ce sont des ENTREES de test, le cahier n'en chiffre
 * aucune ; seule l'ABSENCE de leur propagation est verifiee (A2), jamais une
 * valeur qu'il aurait fallu deviner.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T27 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * (a) `apps/cli` — JAMAIS IMPORTE comme module, pour la meme raison que
 *     T11/T23 : une entree de commande qui s'execute a l'import romprait la
 *     frontiere processus/API. Chaque invocation est un PROCESSUS NEUF
 *     (`execFileSync('node', […])`), jamais un rappel direct. Les candidats
 *     d'entree et la boucle de construction (`pnpm build` tente une seule
 *     fois si aucun candidat ne repond) sont repris tels quels de
 *     `acceptance/T23.spec.ts`.
 *
 *     Sous-commande FIXEE ICI, puisque le cahier (L389) nomme la commande
 *     (« `bench fork` ») mais pas ses drapeaux :
 *
 *       fork --admin-database <db> --parent-database <db> \
 *            --branch-ids <idA>,<idB>
 *
 *     rend sur stdout un objet JSON (meme extraction tolerante que T23 :
 *     JSON direct, ou le dernier bloc `{…}` / la derniere ligne JSON) :
 *
 *       { parent:   { database, identity },
 *         branches: [ { branch_id, database, identity },
 *                     { branch_id, database, identity } ] }
 *
 *     `branch_id` est ECHO du drapeau `--branch-ids` (fourni par l'appelant,
 *     donc trivialement distinct entre les deux branches — ce n'est PAS
 *     l'axe observe). `database` (la base PostgreSQL NOUVELLEMENT
 *     provisionnee pour cette branche ou ce parent) et `identity` (un
 *     identifiant interne, genere par `bench fork`, PAS fourni par
 *     l'appelant) sont les DEUX axes que A1 exige distincts deux a deux
 *     (parent, branche A, branche B) — c'est exactement ce que la mutation
 *     prescrite par verification/cases.lock.json (« sauter le provisionnement
 *     par branche ») fait collapser sur une seule valeur partagee. Les noms
 *     de champs tolerent un alias usuel (`db`/`db_name` pour `database`,
 *     `branch_identity`/`lineage_id` pour `identity`, `id`/`name` pour
 *     `branch_id`), comme les suites precedentes le font pour un contrat
 *     qu'aucune autre tache ne fixe deja.
 *
 * (b) `packages/storage` — TROIS ROLES REPRIS TELS QUELS DE
 *     `acceptance/T12.spec.ts` :
 *
 *       applyMigrations({ dsn }) -> Promise<void>
 *       openStore({ dsn })       -> Promise<handle>
 *       closeStore(handle)       -> Promise<void>
 *
 * (c) `packages/billing` — QUATRE ROLES REPRIS TELS QUELS DE
 *     `acceptance/T16.spec.ts` (T27 depend de T16) :
 *
 *       openBudget(handle, { budget_id, limit })                 -> Promise<void>
 *       importReceipt(handle, { budget_id, receipt_id, amount }) -> Promise<{ expense_id }>
 *       listLedgerEntries(handle, { budget_id })                 -> Promise<Array<entry>>
 *       getBudgetState(handle, { budget_id })                    -> Promise<{ spent, reserved, available, limit }>
 *
 *     TROIS ROLES NOUVEAUX DE `packages/billing`, FIXES ICI PARCE QUE LE
 *     CAHIER NE LES DICTE PAS (repris tels quels dans verification/mutants/T27.json) :
 *
 *   1. computeLineagePhysicalCost({ ancestor_cost, fork_overhead_cost, branch_costs })
 *        -> { total_physical_cost, marginal_cost_by_branch }
 *      PUR. `ancestor_cost` est le cout deja engage par le parent avant le
 *      fork (le « prefixe ancestral » de L391/A4) ; `fork_overhead_cost` est
 *      la « depense supplementaire » de L391, engagee UNE SEULE FOIS pour la
 *      famille (pas par branche) ; `branch_costs` est un objet plat
 *      `{ A, B }` (memes lettres que le cahier : « modifier A… », « branches
 *      a 300 et 500 »). `total_physical_cost` = somme des QUATRE termes,
 *      chacun compte UNE SEULE fois. `marginal_cost_by_branch` reprend
 *      `branch_costs` tel quel : le cout marginal d'une branche EXCLUT le
 *      prefixe ancestral et la depense partagee (c'est la distinction que
 *      A3 nomme explicitement : « 12800 de depenses physiques globales »
 *      contre « 300/500 de cout marginal »).
 *
 *   2. planMaintenanceReserve({ budget_limit, reserve_rate })
 *        -> { budget_limit, reserved_for_maintenance }
 *      PUR, sans stockage. `reserve_rate` est une fraction (0.15 pour 15 %).
 *      `budget_limit` est ECHO, INCHANGE (L391 : « sans porter le budget a
 *      1150 ») ; `reserved_for_maintenance` = la part identifiee pour la
 *      maintenance, sans etre AJOUTEE au budget.
 *
 *   3. checkMaintenanceEligibility({ period_state })
 *        -> { eligible: boolean, signal?: { code, reason? } }
 *      ou REJETTE avec une erreur portant `.code` (meme tolerance double
 *      forme que `reserveBudget` en T16). `period_state` porte au moins
 *      `phase` (une des valeurs de L97). Un etat INELIGIBLE (ici
 *      `BUDGET_EXHAUSTED`) doit etre SIGNALE : `eligible:false` ET un code
 *      nommant la cause, RENDU ou LEVE — jamais un plantage (TypeError,
 *      ECONNREFUSED…). La fonction NE MUTE NI N'EFFACE l'objet
 *      `period_state` qu'on lui passe (L391 : « pas efface ») — le test le
 *      reinspecte par REFERENCE apres l'appel. Un etat ELIGIBLE (ici
 *      `DEVELOPING`) ne doit, symetriquement, PAS etre signale a tort : sans
 *      ce controle de capacite, une implementation qui signalerait
 *      indistinctement tout etat verdirait la moitie « signale » du cas sans
 *      rien prouver — le meme defaut que celui que T00 nomme pour un refus
 *      universel.
 *
 * ────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle n'exerce ni S3 ni les conteneurs runc/userns en direct, bien que
 *    verification/tasks.json les liste dans `requires` pour T27. Meme choix
 *    que `acceptance/T15.spec.ts` (qui requiert aussi `s3` et ne l'exerce
 *    pas) : L34 autorise explicitement un choix d'ADAPTATEUR qui n'est pas
 *    impose par le cahier, et aucun des six cas requis ne nomme S3 ni runc
 *    litteralement. L'isolation PAR PROCESSUS/CONTENEUR que ces capacites
 *    annoncent est un detail d'implementation de la frontiere « volumes
 *    distincts » que A1/A2 observent au niveau du RESULTAT (PostgreSQL),
 *    pas du mecanisme.
 *  • Elle ne verifie pas que les branches sont orchestrees par Temporal
 *    (T24) ni qu'elles respectent les quotas de parallelisme (T26) : ce sont
 *    des contrats deja valides par les suites de ces taches, pas des cas
 *    requis de T27.
 *  • Elle ne mesure pas l'effet REEL d'une consigne de maintenance sur la
 *    qualite de l'agent (L393 : « pas que l'agent devient plus
 *    maintenable ») — seuls le budget, l'assignation et la trace du signal
 *    sont observes.
 *  • Elle n'impose aucun nom de colonne ni de table : L259 (T12) fixe deja
 *    les noms de TABLES du schema central : T27 ne les renomme pas et cette
 *    suite ne les interroge pas directement — elle passe exclusivement par
 *    les exports de `packages/billing`/`packages/storage` et par le JSON de
 *    `bench fork`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 600_000;
const PROC_TIMEOUT_MS = 180_000;
const BUILD_TIMEOUT_MS = 300_000;

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

/** Les deux `source_paths` paquets que verification/tasks.json declare pour T27. */
const PACKAGES = ['billing', 'storage'] as const;

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

/* ═══════════════ les litteraux du cahier, et rien d'autre ══════════════ */

/** L391 : « parent a cout 10000 » — le prefixe ancestral. */
const COUT_PARENT = 10000; // cahier:L391

/** L391 : « depense supplementaire 2000 » — engagee une seule fois pour la famille. */
const DEPENSE_SUPPLEMENTAIRE = 2000; // cahier:L391

/** L391 : « branches a 300 et 500 ». */
const COUT_BRANCHE_A = 300; // cahier:L391
const COUT_BRANCHE_B = 500; // cahier:L391

/** L391 : « depenses physiques globales 12800 ». */
const DEPENSES_PHYSIQUES_GLOBALES = 12800; // cahier:L391

/** L391 : total SI la depense supplementaire etait comptee deux fois (interdit, A3). */
const TOTAL_SURFACTURE_OVERHEAD = 14800; // cahier:L391

/** L391 : total SI le prefixe ancestral etait facture a chaque branche (interdit, A4). */
const TOTAL_SURFACTURE_PREFIXE_ANCESTRAL = 22800; // cahier:L391

/** L391 : « politique reservant 15 % d'un budget 1000 ». */
const BUDGET_MAINTENANCE = 1000; // cahier:L391
const TAUX_MAINTENANCE = 0.15; // cahier:L391

/** L391 : « identifie 150 pour maintenance ». */
const RESERVE_MAINTENANCE_ATTENDUE = 150; // cahier:L391

/** L391 : arrondi errone a eviter (151, au lieu de 150). */
const ARRONDI_ERRONE_MAINTENANCE = 151; // cahier:L391

/** L391 : « sans porter le budget a 1150 » — valeur interdite pour le budget rendu. */
const BUDGET_GONFLE_ERRONE = 1150; // cahier:L391

/** L97 : etat d'arret de calcul qui n'efface pas la periode — ineligible au controle. */
const PHASE_INELIGIBLE_CONTROLE = 'BUDGET_EXHAUSTED'; // cahier:L97

/** L97 : une phase active ordinaire — eligible, sert de controle de capacite. */
const PHASE_ELIGIBLE_CONTROLE = 'DEVELOPING'; // cahier:L97

/** L80 : « `1000000` vaut 1 USD » — format d'un montant valide. */
const FORMAT_MONTANT_L80 = /^[0-9]+$/; // cahier:L80

/** Ce qui n'est PAS un refus : un plantage (meme liste que T16/T23). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/** Un montant L80 valide (chaine d'entiers) OU un entier JS. */
function interpretMontant(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && FORMAT_MONTANT_L80.test(v)) return Number.parseInt(v, 10);
  return null;
}

/* ══════════════════════════ PostgreSQL reel (requires: postgres18) ═══════ */

const RUN = `t27_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
  ).toBe('base-creee'); // cahier: requires postgres18 (verification/tasks.json T27)
  BASES_CREEES.push(nom);
  return nom;
}

/** Enregistre une base pour le nettoyage sans en exiger la creation ici (ex : branches crees par `bench fork`). */
function enregistrerPourNettoyage(nom: string): void {
  if (nom.length > 0 && !BASES_CREEES.includes(nom)) BASES_CREEES.push(nom);
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
  // Le chargement ne LEVE pas : un import casse produirait « Test suite
  // failed to run », que verification/runner/red.mjs classe
  // SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc
  // lui-meme le chargement du paquet dont il a besoin.
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
  importReceipt: [
    'importReceipt', 'recordReceipt', 'ingestReceipt', 'applyReceipt', 'importInvoice',
  ],
  getBudgetState: [
    'getBudgetState', 'budgetState', 'readBudgetState', 'getBudget', 'budgetSnapshot', 'readBudget',
  ],
  listLedgerEntries: [
    'listLedgerEntries', 'listEntries', 'ledgerEntries', 'listExpenses',
    'listBudgetEntries', 'listBudgetLedger',
  ],
  // packages/billing — fixes par cette suite (section III ci-dessus).
  computeLineagePhysicalCost: [
    'computeLineagePhysicalCost', 'computeForkPhysicalCost', 'aggregateLineageCost',
    'computeLineageCost', 'computeBranchFamilyCost', 'computeLineagePhysicalCosts',
  ],
  planMaintenanceReserve: [
    'planMaintenanceReserve', 'computeMaintenanceReserve', 'planMaintenancePolicy',
    'reserveMaintenanceBudget', 'computeMaintenancePolicy',
  ],
  checkMaintenanceEligibility: [
    'checkMaintenanceEligibility', 'evaluateMaintenanceEligibility',
    'assertMaintenanceEligibility', 'checkMaintenanceControl', 'verifyMaintenanceEligibility',
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

/** Resout un role ou fait echouer le cas courant en NOMMANT les alias essayes. */
function requireRole(name: string): Fn {
  const { fn, tried } = resolveRole(name);
  expect(
    fn !== undefined ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fn;
}

/** Appelle une fonction potentiellement asynchrone sans jamais laisser lever. */
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

function codeDe(err: unknown): string | undefined {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    if (typeof code === 'string') return code;
  }
  if (typeof err === 'object' && err !== null) {
    const code = (err as Json).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/* ══════════════════════════ mise en place par cas (storage/billing) ═══════ */

const HANDLES: unknown[] = [];

async function ouvrirStoreNeuf(suffixe: string): Promise<{ handle: unknown; db: string }> {
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
  return { handle, db };
}

/** Ouvre un store sur une base DEJA EXISTANTE (ex : une branche creee par `bench fork`). */
async function ouvrirStoreSurBase(db: string): Promise<unknown> {
  const openStore = requireRole('openStore');
  const ouv = await essayer(() => openStore({ dsn: dsnFor(db) }));
  expect(
    ouv.ok ? 'store-ouvert' : `OUVERTURE-STORE-EN-ECHEC ${db} ${messageDe((ouv as { err: unknown }).err)}`,
  ).toBe('store-ouvert');
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

let compteurBudget = 0;
function idBudget(prefixe: string): string {
  compteurBudget += 1;
  return `${prefixe}-${RUN}-${compteurBudget}`;
}

/* ═════════════════════════ `apps/cli` : `bench fork`, en PROCESSUS ═══════
 *
 * apps/cli N'EST JAMAIS IMPORTE comme module (meme raison que T11/T23) :
 * chaque invocation est un PROCESSUS NEUF. Les candidats d'entree et la
 * boucle de construction sont repris tels quels de acceptance/T23.spec.ts.
 */

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

type AppelCli = { resultat: Json | null; tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[] };

function lancer(sousCommande: string, drapeaux: string[]): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
  const essayerCli = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 400) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayerCli();
  if (premier !== null) return { resultat: premier, tentatives };
  construireUneFois(tentatives);
  return { resultat: essayerCli(), tentatives };
}

/** `bench fork --admin-database … --parent-database … --branch-ids a,b`. */
function fork(parentDb: string, branchIds: readonly [string, string]): AppelCli {
  return lancer('fork', [
    '--admin-database', ADMIN_DB,
    '--parent-database', parentDb,
    '--branch-ids', branchIds.join(','),
  ]);
}

function messageEchecCli(label: string, appel: AppelCli): string {
  return `${label} : ${appel.tentatives
    .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`)
    .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`;
}

/** Extrait un champ texte parmi plusieurs noms candidats (tolerance de nommage, pas de comportement). */
const CLES_DATABASE = ['database', 'db', 'db_name', 'dbName', 'volume', 'volume_id', 'volumeId'] as const;
const CLES_IDENTITY = ['identity', 'branch_identity', 'branchIdentity', 'lineage_id', 'lineageId', 'volume_identity'] as const;
const CLES_BRANCH_ID = ['branch_id', 'branchId', 'id', 'name'] as const;

function texteParmi(o: unknown, cles: readonly string[]): string | undefined {
  if (o === null || typeof o !== 'object') return undefined;
  for (const c of cles) {
    const v = (o as Json)[c];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/* ══════════════════════════════ T27.A1 ══════════════════════════════════ */

test('T27.A1 — bench fork : meme etat metier de depart, volumes et identites distincts pour les deux branches', async () => {
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');
  const openBudget = requireRole('openBudget');
  const importReceipt = requireRole('importReceipt');
  const listLedgerEntries = requireRole('listLedgerEntries');
  const getBudgetState = requireRole('getBudgetState');

  // Etat metier de depart du parent : un budget deja ouvert et une depense
  // deja inscrite. Montants et identifiants FABRIQUES par le test (cf. II) :
  // seule leur PRESENCE a l'identique dans les deux branches est decisive.
  const { handle: handleParent, db: dbParent } = await ouvrirStoreNeuf('a1-parent');
  const budgetId = idBudget('bud-a1');
  const limiteBudget = 10_000_000;
  const montantAncetre = 250_000;
  const recuAncetre = `recu-${RUN}-a1-ancetre`;

  await essayer(() => openBudget(handleParent, { budget_id: budgetId, limit: limiteBudget }));
  const seed = await essayer(() =>
    importReceipt(handleParent, { budget_id: budgetId, receipt_id: recuAncetre, amount: montantAncetre }),
  );
  expect(seed.ok ? 'etat-de-depart-ecrit' : `ETAT-DE-DEPART-EN-ECHEC ${messageDe((seed as { err: unknown }).err)}`).toBe(
    'etat-de-depart-ecrit',
  );

  const idA = `branche-${RUN}-a1-A`;
  const idB = `branche-${RUN}-a1-B`;
  const appel = fork(dbParent, [idA, idB]);
  expect(
    appel.resultat !== null ? 'fork-a-repondu' : `FORK-SANS-SORTIE-JSON ${messageEchecCli('bench fork', appel)}`,
  ).toBe('fork-a-repondu');
  const resultat = appel.resultat as Json;

  const parentOut = resultat.parent;
  const branchesOut = resultat.branches;
  expect(Array.isArray(branchesOut) ? 'branches-tableau' : `BRANCHES-NON-TABLEAU ${rendu(branchesOut)}`).toBe(
    'branches-tableau',
  );
  const liste = branchesOut as Json[];
  expect(liste.length).toBe(2); // cahier:L391 — « deux branches »

  const brancheA = liste.find((b) => texteParmi(b, CLES_BRANCH_ID) === idA);
  const brancheB = liste.find((b) => texteParmi(b, CLES_BRANCH_ID) === idB);
  expect(brancheA !== undefined ? 'branche-A-trouvee' : `BRANCHE-A-ABSENTE ${rendu(liste)}`).toBe('branche-A-trouvee');
  expect(brancheB !== undefined ? 'branche-B-trouvee' : `BRANCHE-B-ABSENTE ${rendu(liste)}`).toBe('branche-B-trouvee');

  // VOLUMES distincts deux a deux (parent, A, B) — l'axe que la mutation
  // prescrite (« sauter le provisionnement par branche ») fait collapser.
  const dbA = texteParmi(brancheA, CLES_DATABASE) ?? '';
  const dbB = texteParmi(brancheB, CLES_DATABASE) ?? '';
  const dbParentRendue = texteParmi(parentOut, CLES_DATABASE) ?? dbParent;
  const volumes = [dbParentRendue, dbA, dbB];
  const volumesDistincts = new Set(volumes).size === 3 && volumes.every((v) => v.length > 0);
  expect(
    volumesDistincts ? 'volumes-distincts' : `VOLUMES-NON-DISTINCTS parent=${dbParentRendue} A=${dbA} B=${dbB}`,
  ).toBe('volumes-distincts'); // cahier:L391

  // IDENTITES distinctes deux a deux (parent, A, B) — generees par le fork,
  // pas fournies par l'appelant.
  const idtParent = texteParmi(parentOut, CLES_IDENTITY) ?? '';
  const idtA = texteParmi(brancheA, CLES_IDENTITY) ?? '';
  const idtB = texteParmi(brancheB, CLES_IDENTITY) ?? '';
  const identites = [idtParent, idtA, idtB];
  const identitesDistinctes = new Set(identites).size === 3 && identites.every((v) => v.length > 0);
  expect(
    identitesDistinctes
      ? 'identites-distinctes'
      : `IDENTITES-NON-DISTINCTES parent=${idtParent} A=${idtA} B=${idtB}`,
  ).toBe('identites-distinctes'); // cahier:L391

  enregistrerPourNettoyage(dbA);
  enregistrerPourNettoyage(dbB);

  // MEME ETAT METIER DE DEPART : chaque branche, ouverte INDEPENDAMMENT,
  // retrouve exactement la depense ancetre inscrite avant le fork.
  for (const [label, db] of [['A', dbA], ['B', dbB]] as const) {
    const handle = await ouvrirStoreSurBase(db);
    const entrees = await essayer(() => listLedgerEntries(handle, { budget_id: budgetId }));
    expect(
      entrees.ok ? `liste-lue-${label}` : `LISTE-EN-ECHEC-${label} ${messageDe((entrees as { err: unknown }).err)}`,
    ).toBe(`liste-lue-${label}`);
    const correspondantes = ((entrees as { ok: true; value: unknown }).value as Json[]).filter(
      (e) => e.receipt_id === recuAncetre,
    );
    expect(correspondantes.length).toBe(1); // cahier:L391 — meme etat metier de depart

    const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
    const spent = etat.ok ? interpretMontant((etat as { value: Json }).value.spent) : null;
    expect(spent).toBe(montantAncetre); // cahier:L391
  }
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ T27.A2 ══════════════════════════════════ */

test('T27.A2 — modifier la branche A ne change ni la branche B ni le parent', async () => {
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');
  const openBudget = requireRole('openBudget');
  const importReceipt = requireRole('importReceipt');
  const listLedgerEntries = requireRole('listLedgerEntries');
  const getBudgetState = requireRole('getBudgetState');

  const { handle: handleParent, db: dbParent } = await ouvrirStoreNeuf('a2-parent');
  const budgetId = idBudget('bud-a2');
  const limiteBudget = 10_000_000;
  const montantAncetre = 180_000;
  const recuAncetre = `recu-${RUN}-a2-ancetre`;

  await essayer(() => openBudget(handleParent, { budget_id: budgetId, limit: limiteBudget }));
  await essayer(() =>
    importReceipt(handleParent, { budget_id: budgetId, receipt_id: recuAncetre, amount: montantAncetre }),
  );

  const idA = `branche-${RUN}-a2-A`;
  const idB = `branche-${RUN}-a2-B`;
  const appel = fork(dbParent, [idA, idB]);
  expect(
    appel.resultat !== null ? 'fork-a-repondu' : `FORK-SANS-SORTIE-JSON ${messageEchecCli('bench fork', appel)}`,
  ).toBe('fork-a-repondu');
  const resultat = appel.resultat as Json;
  const liste = resultat.branches as Json[];
  const brancheA = liste.find((b) => texteParmi(b, CLES_BRANCH_ID) === idA);
  const brancheB = liste.find((b) => texteParmi(b, CLES_BRANCH_ID) === idB);
  const dbA = texteParmi(brancheA, CLES_DATABASE) ?? '';
  const dbB = texteParmi(brancheB, CLES_DATABASE) ?? '';
  expect(dbA.length > 0 ? 'base-A-nommee' : `BASE-A-ABSENTE ${rendu(resultat)}`).toBe('base-A-nommee');
  expect(dbB.length > 0 ? 'base-B-nommee' : `BASE-B-ABSENTE ${rendu(resultat)}`).toBe('base-B-nommee');
  enregistrerPourNettoyage(dbA);
  enregistrerPourNettoyage(dbB);

  // Modifier A : une ecriture NOUVELLE, posee directement sur le handle de A.
  const handleA = await ouvrirStoreSurBase(dbA);
  const montantModifA = 999_000; // entree de test (cf. II) ; seule sa PROPAGATION est observee
  const recuModifA = `recu-${RUN}-a2-modif-sur-A`;
  const modif = await essayer(() =>
    importReceipt(handleA, { budget_id: budgetId, receipt_id: recuModifA, amount: montantModifA }),
  );
  expect(modif.ok ? 'modification-sur-A-reussie' : `MODIFICATION-SUR-A-EN-ECHEC ${messageDe((modif as { err: unknown }).err)}`).toBe(
    'modification-sur-A-reussie',
  );

  // B, ouverte INDEPENDAMMENT : la modification n'y apparait pas.
  const handleB = await ouvrirStoreSurBase(dbB);
  const entreesB = await essayer(() => listLedgerEntries(handleB, { budget_id: budgetId }));
  expect(entreesB.ok ? 'liste-B-lue' : `LISTE-B-EN-ECHEC ${messageDe((entreesB as { err: unknown }).err)}`).toBe(
    'liste-B-lue',
  );
  const presenteDansB = ((entreesB as { ok: true; value: unknown }).value as Json[]).some(
    (e) => e.receipt_id === recuModifA,
  );
  expect(presenteDansB).toBe(false); // cahier:L391 — « ne change ni B »
  const etatB = await essayer(() => getBudgetState(handleB, { budget_id: budgetId }));
  const spentB = etatB.ok ? interpretMontant((etatB as { value: Json }).value.spent) : null;
  expect(spentB).toBe(montantAncetre); // cahier:L391 — B reste a son etat de depart

  // Parent, ouvert via un HANDLE FRAIS (temoin independant, pas le handle de
  // seed reutilise) : la modification n'y apparait pas davantage.
  const handleParent2 = await ouvrirStoreSurBase(dbParent);
  const entreesParent = await essayer(() => listLedgerEntries(handleParent2, { budget_id: budgetId }));
  expect(
    entreesParent.ok ? 'liste-parent-lue' : `LISTE-PARENT-EN-ECHEC ${messageDe((entreesParent as { err: unknown }).err)}`,
  ).toBe('liste-parent-lue');
  const presenteDansParent = ((entreesParent as { ok: true; value: unknown }).value as Json[]).some(
    (e) => e.receipt_id === recuModifA,
  );
  expect(presenteDansParent).toBe(false); // cahier:L391 — « ni le parent »
  const etatParent = await essayer(() => getBudgetState(handleParent2, { budget_id: budgetId }));
  const spentParent = etatParent.ok ? interpretMontant((etatParent as { value: Json }).value.spent) : null;
  expect(spentParent).toBe(montantAncetre); // cahier:L391 — le parent reste a son etat de depart
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ T27.A3 ══════════════════════════════════ */

test('T27.A3 — depenses physiques globales 12800, cout marginal des branches 300 et 500', async () => {
  assertPackageLoaded('billing');
  const computeLineagePhysicalCost = requireRole('computeLineagePhysicalCost');

  const r = await essayer(() =>
    computeLineagePhysicalCost({
      ancestor_cost: COUT_PARENT,
      fork_overhead_cost: DEPENSE_SUPPLEMENTAIRE,
      branch_costs: { A: COUT_BRANCHE_A, B: COUT_BRANCHE_B },
    }),
  );
  expect(r.ok ? 'calcul-reussi' : `CALCUL-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe('calcul-reussi');
  const v = (r as { ok: true; value: Json }).value;

  const total = interpretMontant(v.total_physical_cost);
  expect(
    total === null ? `TOTAL-INVALIDE ${rendu(v.total_physical_cost)}` : `total-${total}`,
  ).toBe(`total-${DEPENSES_PHYSIQUES_GLOBALES}`); // cahier:L391 (12800)
  expect(total).not.toBe(TOTAL_SURFACTURE_OVERHEAD); // cahier:L391 — pas de double-compte de la depense supplementaire

  const parBranche = v.marginal_cost_by_branch as Json | undefined;
  expect(
    parBranche !== null && typeof parBranche === 'object'
      ? 'cout-marginal-present'
      : `COUT-MARGINAL-ABSENT ${rendu(v.marginal_cost_by_branch)}`,
  ).toBe('cout-marginal-present');
  const margA = interpretMontant((parBranche as Json).A);
  const margB = interpretMontant((parBranche as Json).B);
  expect(margA).toBe(COUT_BRANCHE_A); // cahier:L391 (300)
  expect(margB).toBe(COUT_BRANCHE_B); // cahier:L391 (500)
  // Le cout marginal d'une branche EXCLUT le prefixe ancestral : il ne doit
  // en aucun cas se rapprocher du total global.
  expect(margA).not.toBe(DEPENSES_PHYSIQUES_GLOBALES);
  expect(margB).not.toBe(DEPENSES_PHYSIQUES_GLOBALES);
});

/* ══════════════════════════════ T27.A4 ══════════════════════════════════ */

test('T27.A4 — le prefixe ancestral (10000) n\'est pas facture deux fois dans le total', async () => {
  assertPackageLoaded('billing');
  const computeLineagePhysicalCost = requireRole('computeLineagePhysicalCost');

  const r = await essayer(() =>
    computeLineagePhysicalCost({
      ancestor_cost: COUT_PARENT,
      fork_overhead_cost: DEPENSE_SUPPLEMENTAIRE,
      branch_costs: { A: COUT_BRANCHE_A, B: COUT_BRANCHE_B },
    }),
  );
  expect(r.ok ? 'calcul-reussi' : `CALCUL-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe('calcul-reussi');
  const v = (r as { ok: true; value: Json }).value;
  const total = interpretMontant(v.total_physical_cost);

  // L'ABSENCE decisive : le prefixe ancestral (10000) n'est pas impute une
  // seconde fois a chacune des deux branches (ce qui porterait le total a
  // 10000*2 + 2000 + 300 + 500 = 22800).
  expect(
    total === TOTAL_SURFACTURE_PREFIXE_ANCESTRAL
      ? `PREFIXE-ANCESTRAL-FACTURE-DEUX-FOIS total=${String(total)}`
      : 'prefixe-ancestral-facture-une-seule-fois',
  ).toBe('prefixe-ancestral-facture-une-seule-fois'); // cahier:L391
  expect(total).not.toBe(TOTAL_SURFACTURE_PREFIXE_ANCESTRAL); // cahier:L391 (22800 interdit)
  expect(
    total === null ? `TOTAL-INVALIDE ${rendu(v.total_physical_cost)}` : `total-${total}`,
  ).toBe(`total-${DEPENSES_PHYSIQUES_GLOBALES}`); // cahier:L391 — c'est CE total (12800) que A4 protege
});

/* ══════════════════════════════ T27.A5 ══════════════════════════════════ */

test('T27.A5 — 15% d\'un budget de 1000 identifie 150 pour maintenance sans porter le budget a 1150', async () => {
  assertPackageLoaded('billing');
  const planMaintenanceReserve = requireRole('planMaintenanceReserve');

  const r = await essayer(() =>
    planMaintenanceReserve({ budget_limit: BUDGET_MAINTENANCE, reserve_rate: TAUX_MAINTENANCE }),
  );
  expect(r.ok ? 'plan-reussi' : `PLAN-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe('plan-reussi');
  const v = (r as { ok: true; value: Json }).value;

  const reserve = interpretMontant(v.reserved_for_maintenance);
  expect(
    reserve === null ? `RESERVE-INVALIDE ${rendu(v.reserved_for_maintenance)}` : `reserve-${reserve}`,
  ).toBe(`reserve-${RESERVE_MAINTENANCE_ATTENDUE}`); // cahier:L391 (150)
  expect(reserve).not.toBe(ARRONDI_ERRONE_MAINTENANCE); // cahier:L391 — pas d'arrondi a 151

  const limiteRendue = interpretMontant(v.budget_limit);
  expect(
    limiteRendue === null ? `BUDGET-RENDU-INVALIDE ${rendu(v.budget_limit)}` : `budget-${limiteRendue}`,
  ).toBe(`budget-${BUDGET_MAINTENANCE}`); // cahier:L391 — « sans porter le budget a 1150 » : reste 1000
  expect(limiteRendue).not.toBe(BUDGET_GONFLE_ERRONE); // cahier:L391 (1150 interdit)
});

/* ══════════════════════════════ T27.A6 ══════════════════════════════════ */

test('T27.A6 — un etat ineligible au controle de maintenance est signale, pas efface', async () => {
  assertPackageLoaded('billing');
  const checkMaintenanceEligibility = requireRole('checkMaintenanceEligibility');

  // L'objet est reinspecte PAR REFERENCE apres l'appel : « pas efface » (L391)
  // se lit ici comme « non mute/vide par le controle », pas comme une
  // affirmation sur un stockage externe que le cahier ne nomme pas pour T27.
  const etatIneligible: Json = { phase: PHASE_INELIGIBLE_CONTROLE, period_index: 7 };
  const r = await essayer(() => checkMaintenanceEligibility({ period_state: etatIneligible }));

  let eligible: unknown;
  let code: string | undefined;
  if (r.ok) {
    const v = (r as { ok: true; value: Json }).value;
    eligible = v.eligible;
    const signal = v.signal;
    code = signal !== null && typeof signal === 'object' && typeof (signal as Json).code === 'string'
      ? ((signal as Json).code as string)
      : undefined;
  } else {
    eligible = false;
    code = codeDe((r as { err: unknown }).err);
    expect(MARQUEURS_DE_PLANTAGE.test(messageDe((r as { err: unknown }).err))).toBe(false);
  }
  expect(eligible).toBe(false); // cahier:L391 — signale, pas silencieusement admis
  expect(
    typeof code === 'string' && code.length > 0 ? 'signal-nomme' : `AUCUN-CODE-DE-SIGNAL ${rendu(r)}`,
  ).toBe('signal-nomme'); // cahier:L391 — « signale »

  // PAS EFFACE : l'etat passe en entree n'a pas ete mute par le controle.
  expect(etatIneligible.phase).toBe(PHASE_INELIGIBLE_CONTROLE); // cahier:L391 + L97
  expect(etatIneligible.period_index).toBe(7);

  // CONTROLE DE CAPACITE : un etat ELIGIBLE n'est pas signale a tort. Sans
  // lui, une implementation qui signalerait indistinctement tout etat
  // verdirait la moitie « signale » du cas sans rien prouver.
  const etatEligible: Json = { phase: PHASE_ELIGIBLE_CONTROLE, period_index: 7 };
  const r2 = await essayer(() => checkMaintenanceEligibility({ period_state: etatEligible }));
  expect(
    r2.ok ? 'controle-eligible-reussi' : `CONTROLE-ELIGIBLE-EN-ECHEC ${messageDe((r2 as { err: unknown }).err)}`,
  ).toBe('controle-eligible-reussi');
  const v2 = (r2 as { ok: true; value: Json }).value;
  expect(v2.eligible).toBe(true); // cahier:L391/L97 — une phase active n'est pas ineligible
});
