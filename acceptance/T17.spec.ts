/**
 * acceptance/T17.spec.ts — suite d'acceptation de la tache T17.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T17.A1 behaviour — une requete recue par le fournisseur possede deja
 *                      DISPATCH_STARTED
 *   T17.A2 behaviour — panne apres facture 340 et avant reception de reponse
 *                      donne UNKNOWN, un seul appel, reservation maintenue
 *   T17.A3 absence   — reprise de la meme operation n'emet pas un deuxieme
 *                      appel
 *   T17.A4 numeric   — ingestion du recu regle 340 sans inventer de reponse
 *                      textuelle
 *   T17.A5 absence   — panne avant DISPATCH_STARTED permet reprise avec zero
 *                      reception prealable
 *   T17.A6 behaviour — panne juste apres DISPATCH_STARTED reste
 *                      conservativement UNKNOWN meme a zero appel recu
 *   T17.A7 refusal   — meme cle avec autre requete est rejetee
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T17 — `packages/gateway` et
 * `packages/billing` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff). Le
 * contrat teste ci-dessous est derive de docs/specs/T17.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle sur T17 :
 *
 *   L301  livrables : « journal durable d'appel, fournisseur factice avec
 *         compteurs, idempotence logique et endpoint de reconciliation »
 *   L303  les sept cas d'acceptation, mot pour mot — seule ligne qui chiffre
 *         « 340 », « un seul appel », « zero reception prealable », « zero
 *         appel »
 *   L305  fin : « nouvelles tentatives scientifiques creees avec nouvelles
 *         identites et couts. Les ambiguites non reconciliees restent dans
 *         l'export »
 *   L99   etats d'appel `RESERVED, DISPATCH_STARTED, RESPONSE_STORED,
 *         SETTLED, UNKNOWN, CANCELLED_BEFORE_DISPATCH` ; « L'ecriture
 *         DISPATCH_STARTED precede l'envoi reseau ; meme un crash
 *         immediatement apres cette ecriture est traite comme potentiellement
 *         facture. » — la regle que A1 et A6 verifient directement.
 *   L69   invariant 7 : « Un appel fournisseur dont la reponse est perdue
 *         n'est pas relance aveuglement. Son etat reste ambigu tant qu'il
 *         n'est pas reconcilie. » — A2, A3, A5, A6.
 *   L68   invariant 6 : « rejouee par l'orchestrateur ; les effets valides
 *         sont dedupliques par cle d'operation et empreinte d'entree » — A3,
 *         A7.
 *   L67   invariant 5 : « un echec conserve ses depenses » — la reservation
 *         maintenue d'A2 n'est pas silencieusement liberee.
 *   L71   invariant 9 : « entiers exacts, jamais une addition de flottants
 *         monetaires » — A4.
 *   L78   identite d'operation : « une nouvelle demande apres resultat perdu
 *         recoit une nouvelle tentative logique suivant la politique figee »
 *   L80   « les montants sont des chaines d'entiers non negatifs en
 *         micro-USD » ; « les ajustements sont des ecritures separees
 *         signees »
 *   L103  `F-MONEY` — grille tarifaire fictive et l'appel de reference (340,
 *         680)
 *   L257  T12 (dependance) : tables minimales incluant `model_calls` — le
 *         schema central sur lequel T17 ecrit
 *   L295  T16 (dependance) : F-BUDGET, `reserveBudget`/`settleReservation`/
 *         `getBudgetState` deja fixes par acceptance/T16.spec.ts
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion a l'une de DEUX provenances :
 *
 * (a) VALEURS SCELLEES DE §F, IMPORTEES DE `acceptance/reference/F-MONEY.json`
 *     — JAMAIS RECOPIEES A LA MAIN : grille (2, 1, 5), appel de reference
 *     (100, 40, 20 -> 340), deux appels identiques (680). -> A2, A4.
 *
 * (b) LITTERAUX RELEVES DANS LE CAHIER (`// cahier:L<n>`) :
 *
 *       `RESERVED`, `DISPATCH_STARTED`, `RESPONSE_STORED`, `SETTLED`,
 *       `UNKNOWN`, `CANCELLED_BEFORE_DISPATCH` — L99, l'enum entier         A1,A2,A5,A6
 *       1 — L303, « un seul appel »                                        A2
 *       0 — L303, « zero reception prealable » / « zero appel »            A5,A6
 *
 * CE QUE CETTE SUITE FABRIQUE, ET QUI N'EST DONC PAS UN LITTERAL A FAIRE
 * REMONTER : les identifiants de campagne/appel/budget/reservation/cle
 * d'idempotence, le `test_run_id` (L559) qui prefixe les bases jetables, le
 * contenu texte des requetes de test (`prompt`), et le montant de reservation
 * (une ENTREE de test suffisamment large pour couvrir 340 — seule
 * l'ARITHMETIQUE qui en decoule, `reserved -= reservation`, `spent += 340`,
 * est verifiee). Le code de refus d'A7 (`IDEMPOTENCY_KEY_CONFLICT`) et les
 * noms des points d'injection nommes ci-dessous (III.3) ne sont PAS enonces
 * par le cahier : ils sont FIXES ici, comme T16 a fixe les 9 noms de
 * `packages/billing` avant que l'implementation n'existe — c'est le cas pour
 * `packages/gateway` aussi, puisque T17 n'est pas encore implementee au
 * moment ou cette suite est ecrite.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T17 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Les paquets interroges sont `packages/gateway`, `packages/billing` (les
 * `source_paths` que le registre declare pour T17) et `packages/storage`
 * (T12, dont T17 depend pour ouvrir la meme base centrale — convention deja
 * fixee par acceptance/T12.spec.ts et reprise telle quelle par
 * acceptance/T16.spec.ts). Le chargement ne LEVE jamais : chaque cas asserte
 * lui-meme le chargement du paquet dont il a besoin, en le NOMMANT
 * (verification/runner/red.mjs classerait sinon un import casse
 * SUITE_FAILED_TO_RUN, refuse comme preuve).
 *
 * 1. `createFakeProvider({ responses, onRequest? })` -> `{ complete(request)
 *    -> Promise<response>, calls: number }`
 *      CONTRAT DEJA FIXE PAR LE HARNESS, PAS PAR CETTE SUITE : c'est
 *      exactement celui que verification/runner/doctor.mjs exerce pour la
 *      sonde de capacite `fake-provider` (`p.complete({prompt:'x'})` fait
 *      passer `p.calls` de N a N+1, reponse scriptee sans reseau). Cette
 *      suite se contente d'AJOUTER un champ optionnel `onRequest(request,
 *      index)`, appele de facon SYNCHRONE au tout debut de chaque
 *      `complete()`, avant toute resolution — un point d'observation qui ne
 *      retire rien au contrat de la sonde (elle ne le passe jamais) et ne
 *      change donc rien a ce que `fake-provider` verifie deja.
 *      `responses[i]` peut etre un objet `{ text, usage: {
 *      input_uncached_tokens, input_cached_tokens, output_tokens } }` — la
 *      sonde n'utilise que des chaines et ne regarde jamais la valeur de
 *      retour, donc les deux formes sont compatibles avec elle.
 *
 * 2. `dispatchModelCall(handle, params, hooks?)` ->
 *    `Promise<{ model_call_id, status, cost?, usage?, response? }>`
 *      `params` = `{ model_call_id, idempotency_key, budget_id,
 *      reservation_id, provider, request, tariff }`. FONCTION UNIQUE ET
 *      IDEMPOTENTE : c'est a la fois le premier envoi ET la « reprise » de
 *      L303/L68 — rappelee avec le meme `model_call_id`, elle examine le
 *      journal durable au lieu de redispatcher aveuglement (L69) :
 *        - aucune trace de DISPATCH_STARTED pour ce `model_call_id`  ->
 *          dispatch complet (cas frais, ou reprise apres panne AVANT
 *          DISPATCH_STARTED : A5) ;
 *        - DISPATCH_STARTED present, aucun etat terminal              ->
 *          rend `{ status: 'UNKNOWN' }` SANS contacter le fournisseur
 *          (A2, A6) ;
 *        - etat terminal deja atteint (SETTLED)                       ->
 *          rend le meme resultat SANS recontacter le fournisseur (A3).
 *      `idempotency_key` reutilisee avec une requete DIFFERENTE (contenu de
 *      `request` different) est REJETEE — REJET (erreur `.code ===
 *      'IDEMPOTENCY_KEY_CONFLICT'`) plutot que silencieusement acceptee ou
 *      silencieusement ignoree (A7). `IDEMPOTENCY_KEY_CONFLICT` n'est pas un
 *      code du cahier : il est FIXE ici (cf. II).
 *
 *      `hooks` (optionnels, appeles pour la duree du SEUL appel courant —
 *      jamais persistes) : POINTS D'INJECTION NOMMES, exactement ceux que le
 *      cahier liste pour T37 (L365, dependance directe de T17) — « avant/
 *      apres DISPATCH_STARTED ; apres reception fournisseur avant sauvegarde
 *      de reponse » — et qu'aucune tache avant T17 ne peut exercer, puisque
 *      DISPATCH_STARTED n'existe qu'ici :
 *        `beforeDispatchStarted()`  — juste AVANT l'ecriture durable de
 *           DISPATCH_STARTED ; une exception y simule un crash dont AUCUNE
 *           trace ne persiste (A5).
 *        `afterDispatchStarted()`   — juste APRES cette ecriture, AVANT tout
 *           envoi au fournisseur ; une exception y simule le crash que L99
 *           qualifie « potentiellement facture » (A1 l'utilise sans jeter,
 *           pour observer l'ordre ; A6 l'utilise pour jeter).
 *        `afterProviderResponse()`  — juste APRES que le fournisseur a
 *           repondu, AVANT la sauvegarde de la reponse ; une exception y
 *           simule la reponse perdue de L303/A2.
 *      Une exception levee dans un hook fait REJETER `dispatchModelCall`
 *      pour cet appel ; les ecritures durables anterieures au point du hook
 *      restent committees (c'est ce qui rend le crash observable a la
 *      reprise), celles posterieures ne se produisent jamais.
 *
 * 3. `getModelCall(handle, { model_call_id })` -> `Promise<record | null>`
 *      lecture directe, utilisee pour verifier l'ABSENCE d'un champ (A4 :
 *      aucun texte de reponse invente).
 *
 * 4. `reconcileModelCall(handle, { model_call_id, tariff, receipt: { usage
 *    } })` -> `Promise<{ model_call_id, status, cost }>`
 *      « endpoint de reconciliation » de L301 : ingere un recu de
 *      facturation arrive hors bande pour un appel UNKNOWN et le regle, sans
 *      jamais fabriquer de contenu de reponse (A4).
 *
 * Roles repris tels quels de `packages/billing` (fixes par
 * acceptance/T16.spec.ts, non reinventes ici) : `openBudget`, `reserveBudget`,
 * `getBudgetState`. Roles repris tels quels de `packages/storage` (fixes par
 * acceptance/T12.spec.ts) : `applyMigrations`, `openStore`, `closeStore`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne prouve pas le comportement sous Temporal ni sous un worker
 *    perime : c'est T24/T25, qui dependent explicitement de T17 (L310 : « Le
 *    journal externe de T17 protege les appels modeles lors des reprises »).
 *  • Elle n'exerce pas de vrai fournisseur reseau (L15 : « Les tests
 *    ordinaires n'appellent aucun fournisseur externe ») — uniquement le
 *    fournisseur factice a compteurs de la sonde `fake-provider`.
 *  • Elle ne fixe aucun nom de colonne ni de table : L259 (T12) nomme les
 *    tables, cette suite passe exclusivement par les exports de
 *    `packages/gateway`/`packages/billing`/`packages/storage`.
 *  • Elle n'exerce pas le catalogue complet de points de panne de T37 (L365) :
 *    seuls les trois points que T17 introduit elle-meme sont exerces ici.
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
 * les `source_paths` de T17 ; storage est la dependance T12 deja fixee). */
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

/* ═══════════════ les litteraux du cahier, et rien d'autre ══════════════ */

/** L99 : l'enum complet des etats d'appel. */
const ETAT_DISPATCH_STARTED = 'DISPATCH_STARTED'; // cahier:L99
const ETAT_UNKNOWN = 'UNKNOWN'; // cahier:L99
const ETAT_SETTLED = 'SETTLED'; // cahier:L99
const ETAT_CANCELLED_BEFORE_DISPATCH = 'CANCELLED_BEFORE_DISPATCH'; // cahier:L99

/** L303 : « un seul appel » (A2). */
const UN_SEUL_APPEL = 1; // cahier:L303

/** L303 : « zero reception prealable » (A5) / « zero appel » (A6). */
const ZERO_APPEL = 0; // cahier:L303

/** Format d'un montant L80 valide (chaine d'entiers). */
const FORMAT_MONTANT_L80 = /^[0-9]+$/; // cahier:L80

/** Ce qui n'est PAS un refus : un plantage (meme convention que T00/T16). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/** Code de refus d'A7 — FIXE PAR CETTE SUITE, le cahier ne le nomme pas (cf. II). */
const CODE_CONFLIT_IDEMPOTENCE = 'IDEMPOTENCY_KEY_CONFLICT';

/* ═════ §F : F-MONEY, la seule fixture maitresse que T17 consomme ═════════
 *
 * Racine GELEE apres T01 (L139, docs/FROZEN_ROOTS.json). La lecture ne LEVE
 * jamais au chargement du module ; les defauts sont collectes et ASSERTES par
 * `assertReferences()` dans chaque cas qui les consomme.
 */

const RACINE_REFERENCE = path.join(REPO, 'acceptance', 'reference');
const DEFAUTS_REFERENCE: string[] = [];

function lireReference(nom: string): Json {
  try {
    const doc = JSON.parse(
      fs.readFileSync(path.join(RACINE_REFERENCE, `${nom}.json`), 'utf8'),
    ) as Json;
    if (doc.fixture !== nom) {
      DEFAUTS_REFERENCE.push(
        `FIXTURE-MAL-NOMMEE acceptance/reference/${nom}.json porte fixture=${rendu(doc.fixture)}`,
      );
    }
    return doc;
  } catch (e) {
    DEFAUTS_REFERENCE.push(
      `FIXTURE-ILLISIBLE acceptance/reference/${nom}.json : ${(e as Error).message}`,
    );
    return {};
  }
}

function scelle(doc: Json, nom: string, chemin: string): unknown {
  let cur: unknown = doc;
  for (const seg of `valeurs.${chemin}.valeur`.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      DEFAUTS_REFERENCE.push(`REFERENCE-CHEMIN-ABSENT ${nom} valeurs.${chemin}.valeur`);
      return undefined;
    }
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) {
    DEFAUTS_REFERENCE.push(`REFERENCE-VALEUR-ABSENTE ${nom} valeurs.${chemin}.valeur`);
  }
  return cur;
}

function entierScelle(doc: Json, nom: string, chemin: string): number {
  const v = scelle(doc, nom, chemin);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    DEFAUTS_REFERENCE.push(`REFERENCE-NON-ENTIERE ${nom} ${chemin} = ${rendu(v)}`);
    return Number.NaN;
  }
  return v;
}

const F_MONEY = lireReference('F-MONEY');

const F_TARIF_NON_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_non_cachee');
const F_TARIF_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_cachee');
const F_TARIF_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.sortie');

const F_USAGE_NON_CACHE = entierScelle(
  F_MONEY,
  'F-MONEY',
  'appel_de_reference.tokens_entree_non_caches',
);
const F_USAGE_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_entree_caches');
const F_USAGE_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_sortie');
const F_UN_APPEL = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.cout_attendu'); // 340

/** Grille et usage F-MONEY sous la forme que `computeModelCallCost`/le
 * fournisseur factice de cette suite consomment (cf. III). */
const F_TARIFF = {
  input_uncached_per_token: F_TARIF_NON_CACHE,
  input_cached_per_token: F_TARIF_CACHE,
  output_per_token: F_TARIF_SORTIE,
};
const F_USAGE = {
  input_uncached_tokens: F_USAGE_NON_CACHE,
  input_cached_tokens: F_USAGE_CACHE,
  output_tokens: F_USAGE_SORTIE,
};

/**
 * Chaque cas qui consomme §F l'asserte d'abord, et verifie en outre la
 * COHERENCE ARITHMETIQUE interne de F-MONEY (100*2 + 40*1 + 20*5 = 340) —
 * une fixture qui echouerait ce controle ne pourrait fonder aucune assertion
 * en aval.
 */
function assertReferences(): void {
  expect(
    DEFAUTS_REFERENCE.length === 0
      ? 'fixtures-de-reference-lisibles'
      : `FIXTURES-DE-REFERENCE-INEXPLOITABLES : ${DEFAUTS_REFERENCE.join(' | ')}`,
  ).toBe('fixtures-de-reference-lisibles'); // cahier:L139
  const calcule =
    F_USAGE_NON_CACHE * F_TARIF_NON_CACHE + F_USAGE_CACHE * F_TARIF_CACHE + F_USAGE_SORTIE * F_TARIF_SORTIE;
  expect(calcule).toBe(F_UN_APPEL); // cahier:L103
}

/** Un montant L80 valide (chaine d'entiers) OU un entier JS non negatif. */
function interpretMontant(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string' && FORMAT_MONTANT_L80.test(v)) return Number.parseInt(v, 10);
  return null;
}

/* ══════════════════════════ PostgreSQL reel (requires: postgres18) ═══════ */

const RUN = `t17_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
  ).toBe('base-creee'); // cahier: requires postgres18 (verification/tasks.json T17)
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
  getBudgetState: [
    'getBudgetState', 'budgetState', 'readBudgetState', 'getBudget', 'budgetSnapshot', 'readBudget',
  ],
  // packages/gateway — fixes par CETTE suite (section III ci-dessus).
  createFakeProvider: [
    'createFakeProvider', 'makeFakeProvider', 'newFakeProvider', 'fakeProvider',
  ],
  dispatchModelCall: [
    'dispatchModelCall', 'dispatchCall', 'dispatch', 'sendModelCall', 'executeModelCall',
  ],
  getModelCall: [
    'getModelCall', 'readModelCall', 'fetchModelCall', 'getCall', 'loadModelCall',
  ],
  reconcileModelCall: [
    'reconcileModelCall', 'reconcileCall', 'reconcile', 'applyReceiptToModelCall',
    'settleFromReceipt',
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
 * `dispatchModelCall`. `montant` est une ENTREE de test (cf. II) — seule
 * l'arithmetique qui en decoule (reserved -= montant, spent += cout reel)
 * est verifiee. */
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

async function lireDisponible(handle: unknown, budgetId: string): Promise<{ spent: number | null; reserved: number | null; available: number | null }> {
  const getBudgetState = requireRole('getBudgetState');
  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  expect(etat.ok ? 'etat-lu' : `LECTURE-ETAT-EN-ECHEC ${messageDe((etat as { err: unknown }).err)}`).toBe('etat-lu');
  const e = (etat as { ok: true; value: Json }).value;
  return {
    spent: interpretMontant(e.spent),
    reserved: interpretMontant(e.reserved),
    available: interpretMontant(e.available),
  };
}

/* ══════════════════════════════ T17.A1 ══════════════════════════════════ */

test('T17.A1 — une requete recue par le fournisseur possede deja DISPATCH_STARTED', async () => {
  assertReferences();
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a1');
  const createFakeProvider = requireRole('createFakeProvider');
  const dispatchModelCall = requireRole('dispatchModelCall');

  // Deux points d'observation NON destructifs (cf. III.1 et III.2), qui
  // poussent dans la MEME liste ordonnee — l'ordre d'insertion, pas
  // l'horloge, tranche : pas de course de resolution millisecondaire.
  const ordre: string[] = [];

  const provider = await essayer(() =>
    createFakeProvider({
      responses: [{ text: 'reponse-modele', usage: F_USAGE }],
      onRequest: () => {
        ordre.push('PROVIDER_RECEIVED');
      },
    }),
  );
  expect(provider.ok ? 'fournisseur-cree' : `FOURNISSEUR-EN-ECHEC ${messageDe((provider as { err: unknown }).err)}`).toBe(
    'fournisseur-cree',
  );
  const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

  const modelCallId = idFor('call');
  const res = await essayer(() =>
    dispatchModelCall(
      handle,
      {
        model_call_id: modelCallId,
        idempotency_key: idFor('idem'),
        budget_id: budgetId,
        reservation_id: reservationId,
        provider: prov,
        request: { prompt: 'A1' },
        tariff: F_TARIFF,
      },
      {
        afterDispatchStarted: () => {
          ordre.push('DISPATCH_STARTED');
        },
      },
    ),
  );
  expect(res.ok ? 'dispatch-reussi' : `DISPATCH-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
    'dispatch-reussi',
  );

  expect(prov.calls).toBe(UN_SEUL_APPEL); // cahier:L303
  // L'ASSERTION DECISIVE : DISPATCH_STARTED est deja dans l'ordre AVANT que
  // le fournisseur ait rien recu — pas l'inverse, et pas absent des deux.
  expect(
    ordre.includes('DISPATCH_STARTED') && ordre.includes('PROVIDER_RECEIVED')
      ? 'deux-marqueurs-presents'
      : `MARQUEUR-MANQUANT ordre=${rendu(ordre)}`,
  ).toBe('deux-marqueurs-presents');
  expect(ordre.indexOf('DISPATCH_STARTED')).toBeLessThan(ordre.indexOf('PROVIDER_RECEIVED')); // cahier:L99
});

/* ══════════════════════════════ T17.A2 ══════════════════════════════════ */

test('T17.A2 — panne apres facture et avant reception : UNKNOWN, un seul appel, reservation maintenue', async () => {
  assertReferences();
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a2');
  const createFakeProvider = requireRole('createFakeProvider');
  const dispatchModelCall = requireRole('dispatchModelCall');

  const avant = await lireDisponible(handle, budgetId);

  const provider = await essayer(() =>
    createFakeProvider({ responses: [{ text: 'reponse-modele', usage: F_USAGE }] }),
  );
  expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
  const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

  const modelCallId = idFor('call');
  const params = {
    model_call_id: modelCallId,
    idempotency_key: idFor('idem'),
    budget_id: budgetId,
    reservation_id: reservationId,
    provider: prov,
    request: { prompt: 'A2' },
    tariff: F_TARIFF,
  };

  // La panne survient APRES que le fournisseur factice a repondu (donc
  // "facture 340", L303) et AVANT la sauvegarde de la reponse — la reponse
  // est PERDUE au sens de L303/L69.
  const panne = await essayer(() =>
    dispatchModelCall(handle, params, {
      afterProviderResponse: () => {
        throw new Error('panne simulee : reponse recue, non sauvegardee');
      },
    }),
  );
  expect(panne.ok ? `DISPATCH-A-TORT-REUSSI ${rendu((panne as { value: unknown }).value)}` : 'panne-observee').toBe(
    'panne-observee',
  );
  expect(prov.calls).toBe(UN_SEUL_APPEL); // cahier:L303 — le fournisseur A ete contacte, une seule fois

  // A LA REPRISE : rappeler la meme operation ne doit ni redispatcher, ni
  // resoudre a tort en SETTLED/FAILED (cf. cases.lock.json, « controle plus
  // fin »). Elle doit rendre UNKNOWN.
  const reprise = await essayer(() => dispatchModelCall(handle, params));
  expect(reprise.ok ? 'reprise-executee' : `REPRISE-EN-ECHEC ${messageDe((reprise as { err: unknown }).err)}`).toBe(
    'reprise-executee',
  );
  const statutReprise = (reprise as { ok: true; value: Json }).value.status;
  expect(statutReprise).toBe(ETAT_UNKNOWN); // cahier:L99, L303
  expect(prov.calls).toBe(UN_SEUL_APPEL); // cahier:L69 — pas relance aveuglement

  // La reservation reste MAINTENUE : ni reglee (spent inchange), ni liberee
  // (reserved inchange).
  const apres = await lireDisponible(handle, budgetId);
  expect(apres.spent).toBe(avant.spent); // cahier:L67
  expect(apres.reserved).toBe(avant.reserved); // cahier:L67
});

/* ══════════════════════════════ T17.A3 ══════════════════════════════════ */

test('T17.A3 — reprise de la meme operation n emet pas un deuxieme appel', async () => {
  assertReferences();
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a3');
  const createFakeProvider = requireRole('createFakeProvider');
  const dispatchModelCall = requireRole('dispatchModelCall');

  const provider = await essayer(() =>
    createFakeProvider({ responses: [{ text: 'reponse-modele', usage: F_USAGE }] }),
  );
  expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
  const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

  const params = {
    model_call_id: idFor('call'),
    idempotency_key: idFor('idem'),
    budget_id: budgetId,
    reservation_id: reservationId,
    provider: prov,
    request: { prompt: 'A3' },
    tariff: F_TARIFF,
  };

  const premier = await essayer(() => dispatchModelCall(handle, params));
  expect(premier.ok ? 'premier-dispatch-reussi' : `PREMIER-DISPATCH-EN-ECHEC ${messageDe((premier as { err: unknown }).err)}`).toBe(
    'premier-dispatch-reussi',
  );
  expect(prov.calls).toBe(UN_SEUL_APPEL); // cahier:L303

  // REPRISE de la MEME operation (meme model_call_id, meme cle, meme
  // requete) : aucun second appel ne doit atteindre le fournisseur.
  const reprise = await essayer(() => dispatchModelCall(handle, params));
  expect(reprise.ok ? 'reprise-reussie' : `REPRISE-EN-ECHEC ${messageDe((reprise as { err: unknown }).err)}`).toBe(
    'reprise-reussie',
  );
  expect(
    prov.calls === UN_SEUL_APPEL ? 'compteur-inchange' : `SECOND-APPEL-EMIS calls=${prov.calls}`,
  ).toBe('compteur-inchange'); // cahier:L68, L303 — le point decisif d'A3
});

/* ══════════════════════════════ T17.A4 ══════════════════════════════════ */

test('T17.A4 — ingestion du recu regle 340 sans inventer de reponse textuelle', async () => {
  assertReferences();
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a4');
  const createFakeProvider = requireRole('createFakeProvider');
  const dispatchModelCall = requireRole('dispatchModelCall');
  const reconcileModelCall = requireRole('reconcileModelCall');
  const getModelCall = requireRole('getModelCall');

  const avant = await lireDisponible(handle, budgetId);

  const provider = await essayer(() =>
    createFakeProvider({ responses: [{ text: 'reponse-modele', usage: F_USAGE }] }),
  );
  expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
  const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

  const modelCallId = idFor('call');
  const panne = await essayer(() =>
    dispatchModelCall(
      handle,
      {
        model_call_id: modelCallId,
        idempotency_key: idFor('idem'),
        budget_id: budgetId,
        reservation_id: reservationId,
        provider: prov,
        request: { prompt: 'A4' },
        tariff: F_TARIFF,
      },
      {
        afterProviderResponse: () => {
          throw new Error('panne simulee : reponse perdue avant reconciliation');
        },
      },
    ),
  );
  expect(panne.ok ? 'DISPATCH-A-TORT-REUSSI' : 'panne-observee').toBe('panne-observee');

  // ENDPOINT DE RECONCILIATION (L301) : un recu de facturation hors bande
  // arrive et regle le cout, SANS jamais fabriquer de texte de reponse.
  const recon = await essayer(() =>
    reconcileModelCall(handle, {
      model_call_id: modelCallId,
      tariff: F_TARIFF,
      receipt: { usage: F_USAGE },
    }),
  );
  expect(recon.ok ? 'reconciliation-reussie' : `RECONCILIATION-EN-ECHEC ${messageDe((recon as { err: unknown }).err)}`).toBe(
    'reconciliation-reussie',
  );
  const r = (recon as { ok: true; value: Json }).value;
  expect(interpretMontant(r.cost)).toBe(F_UN_APPEL); // cahier:L103 (340)
  expect(r.status).toBe(ETAT_SETTLED); // cahier:L99

  const lu = await essayer(() => getModelCall(handle, { model_call_id: modelCallId }));
  expect(lu.ok ? 'lecture-reussie' : `LECTURE-EN-ECHEC ${messageDe((lu as { err: unknown }).err)}`).toBe(
    'lecture-reussie',
  );
  const enreg = (lu as { ok: true; value: Json | null }).value;
  expect(enreg !== null ? 'enregistrement-present' : 'ENREGISTREMENT-ABSENT').toBe('enregistrement-present');
  const texte = (enreg as Json).response ?? (enreg as Json).text ?? (enreg as Json).response_text;
  expect(
    texte === undefined || texte === null ? 'aucun-texte-invente' : `TEXTE-INVENTE ${rendu(texte)}`,
  ).toBe('aucun-texte-invente'); // cahier:L303 — « sans inventer de reponse textuelle »

  const apres = await lireDisponible(handle, budgetId);
  expect((apres.spent ?? 0) - (avant.spent ?? 0)).toBe(F_UN_APPEL); // cahier:L71, L103
});

/* ══════════════════════════════ T17.A5 ══════════════════════════════════ */

test('T17.A5 — panne avant DISPATCH_STARTED : reprise avec zero reception prealable', async () => {
  assertReferences();
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a5');
  const createFakeProvider = requireRole('createFakeProvider');
  const dispatchModelCall = requireRole('dispatchModelCall');

  const provider = await essayer(() =>
    createFakeProvider({ responses: [{ text: 'reponse-modele', usage: F_USAGE }] }),
  );
  expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
  const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

  const params = {
    model_call_id: idFor('call'),
    idempotency_key: idFor('idem'),
    budget_id: budgetId,
    reservation_id: reservationId,
    provider: prov,
    request: { prompt: 'A5' },
    tariff: F_TARIFF,
  };

  // La panne survient AVANT que DISPATCH_STARTED ne soit ecrit : aucune
  // trace durable ne peut donc exister.
  const panne = await essayer(() =>
    dispatchModelCall(handle, params, {
      beforeDispatchStarted: () => {
        throw new Error('panne simulee : avant toute ecriture durable');
      },
    }),
  );
  expect(panne.ok ? 'DISPATCH-A-TORT-REUSSI' : 'panne-observee').toBe('panne-observee');
  expect(prov.calls).toBe(ZERO_APPEL); // cahier:L303 — zero reception PREALABLE, le point decisif

  // REPRISE, sans panne cette fois : rien n'ayant ete engage, elle doit
  // aboutir a un dispatch complet et contacter le fournisseur EXACTEMENT une
  // fois.
  const reprise = await essayer(() => dispatchModelCall(handle, params));
  expect(reprise.ok ? 'reprise-reussie' : `REPRISE-EN-ECHEC ${messageDe((reprise as { err: unknown }).err)}`).toBe(
    'reprise-reussie',
  );
  expect((reprise as { ok: true; value: Json }).value.status).toBe(ETAT_SETTLED); // cahier:L99
  expect(prov.calls).toBe(UN_SEUL_APPEL); // cahier:L303
});

/* ══════════════════════════════ T17.A6 ══════════════════════════════════ */

test('T17.A6 — panne juste apres DISPATCH_STARTED : conservativement UNKNOWN meme a zero appel recu', async () => {
  assertReferences();
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a6');
  const createFakeProvider = requireRole('createFakeProvider');
  const dispatchModelCall = requireRole('dispatchModelCall');

  const provider = await essayer(() =>
    createFakeProvider({ responses: [{ text: 'reponse-modele', usage: F_USAGE }] }),
  );
  expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
  const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

  const params = {
    model_call_id: idFor('call'),
    idempotency_key: idFor('idem'),
    budget_id: budgetId,
    reservation_id: reservationId,
    provider: prov,
    request: { prompt: 'A6' },
    tariff: F_TARIFF,
  };

  // La panne survient JUSTE APRES l'ecriture de DISPATCH_STARTED, AVANT tout
  // envoi au fournisseur : le fournisseur factice ne recoit RIEN.
  const panne = await essayer(() =>
    dispatchModelCall(handle, params, {
      afterDispatchStarted: () => {
        throw new Error('panne simulee : juste apres DISPATCH_STARTED, avant envoi reseau');
      },
    }),
  );
  expect(panne.ok ? 'DISPATCH-A-TORT-REUSSI' : 'panne-observee').toBe('panne-observee');
  expect(prov.calls).toBe(ZERO_APPEL); // cahier:L303 — le point decisif : le fournisseur factice a recu ZERO appel

  // A LA REPRISE : L99 impose « traite comme potentiellement facture », donc
  // UNKNOWN — PAS un statut definitif (ni CANCELLED_BEFORE_DISPATCH, ni un
  // cout resolu a zero) au seul motif que le compteur du fournisseur factice
  // vaut zero. Une implementation qui lirait ce compteur pour decider serait
  // correcte ICI mais fausse en production (un fournisseur reel n'a pas de
  // compteur local observable) — exactement le defaut que cases.lock.json
  // nomme.
  const reprise = await essayer(() => dispatchModelCall(handle, params));
  expect(reprise.ok ? 'reprise-executee' : `REPRISE-EN-ECHEC ${messageDe((reprise as { err: unknown }).err)}`).toBe(
    'reprise-executee',
  );
  const val = (reprise as { ok: true; value: Json }).value;
  expect(val.status).toBe(ETAT_UNKNOWN); // cahier:L99, L303
  expect(val.status).not.toBe(ETAT_CANCELLED_BEFORE_DISPATCH); // cahier:L99 — pas de resolution optimiste
  expect(prov.calls).toBe(ZERO_APPEL); // cahier:L69 — la reprise elle-meme ne relance pas aveuglement
});

/* ══════════════════════════════ T17.A7 ══════════════════════════════════ */

test('T17.A7 — meme cle avec autre requete est rejetee', async () => {
  assertReferences();
  assertPackageLoaded('gateway');
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a7');
  const createFakeProvider = requireRole('createFakeProvider');
  const dispatchModelCall = requireRole('dispatchModelCall');

  const provider = await essayer(() =>
    createFakeProvider({
      responses: [
        { text: 'reponse-A', usage: F_USAGE },
        { text: 'reponse-B', usage: F_USAGE },
      ],
    }),
  );
  expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
  const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

  const cle = idFor('idem');
  const paramsOriginal = {
    model_call_id: idFor('call'),
    idempotency_key: cle,
    budget_id: budgetId,
    reservation_id: reservationId,
    provider: prov,
    request: { prompt: 'A7-original' },
    tariff: F_TARIFF,
  };
  const original = await essayer(() => dispatchModelCall(handle, paramsOriginal));
  expect(original.ok ? 'original-reussi' : `ORIGINAL-EN-ECHEC ${messageDe((original as { err: unknown }).err)}`).toBe(
    'original-reussi',
  );
  expect(prov.calls).toBe(UN_SEUL_APPEL); // cahier:L303

  // CONTROLE POSITIF (necessaire pour un cas `refusal`, cf. cases.lock.json
  // : « un stub qui leve le garderait vert a tort ») : la MEME cle avec la
  // MEME requete reste, elle, acceptee (c'est A3, rejoue ici).
  const rejoue = await essayer(() => dispatchModelCall(handle, paramsOriginal));
  expect(rejoue.ok ? 'rejeu-accepte' : `REJEU-A-TORT-REFUSE ${messageDe((rejoue as { err: unknown }).err)}`).toBe(
    'rejeu-accepte',
  );
  expect(prov.calls).toBe(UN_SEUL_APPEL); // cahier:L68, L303

  // L'ASSERTION DECISIVE : la MEME cle avec une requete DIFFERENTE (contenu
  // et identite d'operation autres) doit etre REJETEE.
  const conflit = await essayer(() =>
    dispatchModelCall(handle, {
      ...paramsOriginal,
      model_call_id: idFor('call'),
      request: { prompt: 'A7-different' },
    }),
  );
  expect(
    conflit.ok ? `CONFLIT-A-TORT-ACCEPTE ${rendu((conflit as { value: unknown }).value)}` : 'refusee',
  ).toBe('refusee'); // cahier:L303
  if (conflit.ok) return; // l'assertion precedente a deja echoue ; pas de sur-interpretation d'un succes.

  const err = (conflit as { ok: false; err: unknown }).err;
  expect(
    MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
  ).toBe('refus-authentique');
  const code = codeDe(err);
  expect(
    code === CODE_CONFLIT_IDEMPOTENCE ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(code)} (attendu ${CODE_CONFLIT_IDEMPOTENCE})`,
  ).toBe('code-conforme');
  // Le refus ne doit pas avoir atteint le fournisseur : la requete
  // conflictuelle n'a jamais ete dispatchee.
  expect(prov.calls).toBe(UN_SEUL_APPEL);
});
