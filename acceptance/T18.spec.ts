/**
 * acceptance/T18.spec.ts — suite d'acceptation de la tache T18.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T18.A1 behaviour — meme script donne les memes patches et les memes
 *                      appels logiques
 *   T18.A2 behaviour — memoire autorisee restauree a la periode suivante
 *   T18.A3 absence   — contexte neuf ne contient pas d'historique
 *                      conversationnel non autorise
 *   T18.A4 absence   — arret ne produit plus de nouvelle soumission
 *   T18.A5 refusal   — reponses invalides donnent erreur typee et depense
 *                      conservee
 *   T18.A6 refusal   — acces au service client respecte T06
 *   T18.A7 absence   — evenements de l'agent n'ont pas autorite pour fixer
 *                      eux-memes accepted=true
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T18 — `packages/agents` — et ne les a
 * lus ni directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL,
 * discipline auditable au diff). Le contrat teste ci-dessous est derive de
 * docs/specs/T18.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle sur T18 :
 *
 *   L307  titre : « Formaliser le contrat AgentRunner avec un agent scripte »
 *   L309  dependances T03, T06, T15, T17 ; livrables MOT POUR MOT : « start,
 *         observe, submit, stop, resume et evenements de session dans
 *         agents » — les CINQ NOMS D'EXPORT primaires de cette suite sont
 *         donc des LITTERAUX DU CAHIER, pas une invention de test-author.
 *   L311  travail : « l'agent recoit workspace, faits disponibles, outils
 *         autorises et limites. Son script consomme des reponses modele
 *         archivees, applique des patches temoins et produit des
 *         soumissions ; il ne peut pas consulter les oracles. »
 *   L313  les sept cas d'acceptation, mot pour mot.
 *   L315  fin : « suite de contrat reutilisable par l'adaptateur reel, et
 *         script volontairement incapable disponible pour les tests d'echec
 *         du moteur. »
 *   L78   identite : « Une periode ajoute period_index commencant a 1. Une
 *         operation ajoute phase, operation_kind, operation_sequence et
 *         logical_attempt. » — c'est operation_sequence, pas un identifiant
 *         opaque, que A1 compare entre les deux executions (cf. III.3).
 *   L84-95 (table E) — AgentRun : « modele/adaptateur, CONTEXTE AUTORISE,
 *         outillage, budget, idempotency_key, etat de session » ; Submission :
 *         « identite, exigences revendiquees, empreinte artefact, migration,
 *         tentative, resultat de validation ». Le CONTEXTE AUTORISE que A3
 *         inspecte et le BUDGET que A5 inspecte sont des champs minimaux de
 *         cette meme ligne.
 *   L64   invariant D2 : « Une revelation de periode k ne contient ni
 *         besoins, ni reponses metier, ni tests prives de k+1 » — le
 *         fondement de A6 (le service client est un cas particulier de
 *         revelation, deja teste par T06 et respecte ici, pas reproduit).
 *   L67   invariant D5 : « Un echec conserve ses depenses [...] » — le second
 *         volet d'A5 (« depense conservee »).
 *   L99   « L'ecriture DISPATCH_STARTED precede l'envoi reseau [...] » — non
 *         directement exerce ici (T18 ne republie pas les etats d'appel de
 *         T17), mais la meme discipline de non-coercition d'une reponse
 *         perdue/invalide motive A5 : rejeter plutot que fabriquer.
 *   L205-209 (T06) — « A2 lecture anticipee renvoie NOT_RELEASED [...] A4 une
 *         question non couverte donne UNSPECIFIED, sans inventer de regle » —
 *         les deux codes que A6 exige voir PROPAGES, pas remplaces, par le
 *         chemin d'acces que le runner ouvre a l'agent.
 *   L15   « Les workflows [...] sont des programmes deterministes » et
 *         « Les tests ordinaires n'appellent aucun fournisseur externe » —
 *         fonde A1 (determinisme) et l'usage exclusif du fournisseur factice.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Litteraux RELEVES DANS LE CAHIER (`// cahier:L<n>`) :
 *   `start`, `observe`, `submit`, `stop`, `resume`   — L309, mot pour mot
 *   `NOT_RELEASED`, `UNSPECIFIED`                     — L207 (via T06)
 *
 * Litteral IMPORTE D'UNE FIXTURE ACCEPTANCE (jamais recopie a la main) : la
 * reponse client exacte de la periode 1 (`capacite_du_creneau_s1` -> `1`) est
 * RELUE depuis acceptance/fixtures/scenarios/reservation-4-periodes.json —
 * la meme fixture, deja gelee de fait par usage, que acceptance/T06.spec.ts
 * emploie pour ses propres cas.
 *
 * CE QUI EST FIXE PAR CETTE SUITE, ET DOCUMENTE COMME TEL (packages/agents
 * n'existe pas encore au moment ou cette suite est ecrite — exactement la
 * situation de packages/gateway au moment ou acceptance/T17.spec.ts a ete
 * ecrite) :
 *   `INVALID_MODEL_RESPONSE`  — code de refus d'A5, le cahier ne le nomme pas
 *   `PENDING_VALIDATION`      — statut d'une Submission fraiche (jamais
 *                               `ACCEPTED`/`accepted:true` a partir d'un seul
 *                               evenement d'agent, cf. A7)
 *   la forme des ScriptStep (`APPLY_PATCH`, `MODEL_CALL`, `ASK_CLIENT`,
 *   `REMEMBER`, `SELF_REPORT`, `SUBMIT`) et des actions rendues par `observe`
 *   `memory_scope`            — le canal de continuite entre periodes que le
 *                               cahier ne nomme pas (meme geste que le
 *                               troisieme argument positionnel de
 *                               `revealPeriod` dans T06.spec.ts)
 *
 * CE QUE CETTE SUITE FABRIQUE ET QUI N'EST DONC PAS UN LITTERAL A FAIRE
 * REMONTER : les identifiants de session/campagne/acteur, le contenu texte
 * des patches et des reponses modele de test, `test_run_id` qui prefixe les
 * bases jetables.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T18 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Paquets interroges : `packages/agents` (source_paths de T18, FIXE ICI),
 * `packages/storage` (T12, repris tel quel de acceptance/T17.spec.ts),
 * `packages/gateway` (T17, `createFakeProvider` repris tel quel),
 * `packages/billing` (T16, `openBudget`/`reserveBudget`/`getBudgetState`
 * repris tels quels), `packages/scenario` (T06, `compileScenarioPack` repris
 * tel quel). Le chargement ne LEVE jamais : chaque cas asserte lui-meme le
 * chargement du paquet dont il a besoin.
 *
 * 1. `createScriptedAgent(steps)` -> `Agent` (opaque, pur — aucune E/S).
 *    `steps` est un tableau ORDONNE et FIXE de `ScriptStep` :
 *      `{ kind:'APPLY_PATCH', path, content }`   — un patch temoin (L311)
 *      `{ kind:'MODEL_CALL' }`                    — consomme la PROCHAINE
 *                                                    reponse archivee du
 *                                                    fournisseur factice
 *                                                    fourni a `start`/`resume`
 *      `{ kind:'ASK_CLIENT', question }`          — interroge le service
 *                                                    client via le tools
 *                                                    autorise (L311, L313.A6)
 *      `{ kind:'REMEMBER', key, value }`          — ecrit la memoire
 *                                                    AUTORISEE (L313.A2)
 *      `{ kind:'SELF_REPORT', accepted }`         — un evenement de session
 *                                                    EMIS PAR L'AGENT
 *                                                    (L313.A7)
 *      `{ kind:'SUBMIT', claimed_requirements, artifact_fingerprint }` —
 *                                                    etape terminale (L311 :
 *                                                    « produit des
 *                                                    soumissions »)
 *
 * 2. `start(handle, params)` -> `Promise<{ session_id, context }>`
 *    `params` = `{ session_id, agent, workspace, facts, tools, limits,
 *    period_index, memory_scope, budget_id?, modelProvider? }` (AgentRun,
 *    L84-95). `tools.clientService` = `{ pack }` OPTIONNEL, `pack` etant EXACT-
 *    EMENT ce que `compileScenarioPack` (T06) a rendu — le runner resout LUI-
 *    MEME `answerCustomerQuestion(pack, period_index, question)` pour chaque
 *    `ASK_CLIENT` ; cette suite ne construit aucun adaptateur intermediaire,
 *    c'est precisement le chemin que le cahier attribue au runner (L313.A6 :
 *    « acces AU SERVICE CLIENT »). `context` est CE QUE L'AGENT VOIT : au
 *    minimum `{ workspace, facts, memory }` — JAMAIS de champ portant un
 *    historique conversationnel brut d'une periode anterieure (A3). `memory`
 *    est vide sur un `start` frais ; seule `resume` la peuple (A2).
 *
 * 3. `observe(handle, session_id)` -> `Promise<{ done, actions }>`
 *    Consomme la PROCHAINE etape non consommee et rend `actions` (un tableau
 *    a au plus un element ; vide si la session est ARRETEE ou terminee).
 *    Chaque action porte `operation_sequence` (L78), demarrant a 1 et
 *    croissant de 1 par etape, DE FACON DETERMINISTE — c'est l'« appel
 *    logique » que A1 compare, PAS un identifiant opaque genere ailleurs.
 *      MODEL_CALL  -> `{ operation_sequence, kind, response:{ text } }` si la
 *                     reponse archivee est VALIDE (`text` chaine non vide) ;
 *                     REJETTE (throw, `.code==='INVALID_MODEL_RESPONSE'`,
 *                     FIXE ICI cf. II) si elle est invalide, SANS toucher au
 *                     budget deja engage (A5).
 *      APPLY_PATCH -> `{ operation_sequence, kind, path, content }`
 *      ASK_CLIENT  -> `{ operation_sequence, kind, question, ok, result }` —
 *                     NE LEVE JAMAIS elle-meme ; `ok`/`result` refletent ce
 *                     que `answerCustomerQuestion` a rendu OU leve (capture),
 *                     REFUS COMPRIS (A6).
 *      REMEMBER    -> `{ operation_sequence, kind, key, value }`
 *      SELF_REPORT -> `{ operation_sequence, kind, accepted }` — enregistre
 *                     TEL QUEL dans le journal d'evenements (audit, A7) mais
 *                     N'A AUCUNE AUTORITE sur `submit()`.
 *      SUBMIT      -> `{ operation_sequence, kind:'SUBMIT' }`, `done:true` ;
 *                     la Submission elle-meme n'est PERSISTEE que par
 *                     `submit()`.
 *    Apres `stop()`, ou une fois `done`, `observe` rend `{done:true,
 *    actions:[]}` sans lever et SANS consommer d'etape supplementaire.
 *
 * 4. `submit(handle, session_id)` -> `Promise<Submission|null>`
 *    Si l'etape SUBMIT a ete atteinte et que la session n'est PAS arretee :
 *    persiste et rend `{ session_id, claimed_requirements,
 *    artifact_fingerprint, attempt, status:'PENDING_VALIDATION' }` (jamais
 *    `status:'ACCEPTED'` ni `accepted:true` sur la seule foi d'un
 *    `SELF_REPORT`, A7). Sinon (arretee, ou SUBMIT jamais atteinte) : rend
 *    `null`, AUCUNE Submission n'est enregistree.
 *
 * 5. `stop(handle, session_id)` -> `Promise<void>` — arrete la session ;
 *    idempotent.
 *
 * 6. `resume(handle, params)` -> `Promise<{ session_id, context }>` — memes
 *    champs que `start` SAUF `memory` (jamais fourni par l'appelant) :
 *    `context.memory` est reconstruite a partir des DERNIERES ecritures
 *    REMEMBER de toute session ANTERIEURE partageant le meme `memory_scope`
 *    (derniere valeur par cle). Sur un `memory_scope` neuf : memoire vide.
 *
 * 7. `getSessionEvents(handle, session_id)` -> `Promise<Event[]>` — le
 *    journal BRUT, dans l'ordre, de toutes les actions (SELF_REPORT compris).
 *
 * 8. `getSubmissions(handle, session_id)` -> `Promise<Submission[]>` — les
 *    Submissions persistees pour cette session (vide tant que `submit()`
 *    n'a rien enregistre).
 *
 * Roles repris tels quels de `packages/storage` (T12) : `applyMigrations`,
 * `openStore`, `closeStore`. De `packages/billing` (T16) : `openBudget`,
 * `reserveBudget`, `getBudgetState`. De `packages/gateway` (T17) :
 * `createFakeProvider`. De `packages/scenario` (T06) : `compileScenarioPack`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle n'exerce pas de vrai stockage S3 : comme acceptance/T15.spec.ts le
 *    documente explicitement pour son propre cas (« elle n'exige pas S3 »),
 *    la persistance de session/memoire passe ici par `packages/storage`
 *    (PostgreSQL, requires:postgres18, reellement exerce) ; `s3` reste une
 *    capacite de registre HERITEE (de T15) et sondee au boot, pas exercee
 *    bit a bit par cette suite.
 *  • Elle n'exerce pas l'adaptateur fournisseur REEL (L15 : « Les tests
 *    ordinaires n'appellent aucun fournisseur externe ») — uniquement le
 *    fournisseur factice de la sonde `fake-provider`.
 *  • Elle ne juge pas la validite METIER d'une soumission (verdict
 *    d'evaluation independant) : c'est T20. Elle prouve seulement qu'un
 *    evenement AUTO-DECLARE par l'agent n'a pas d'AUTORITE sur ce verdict.
 *  • Elle ne reproduit pas les cas de T06 (NOT_RELEASED/UNSPECIFIED
 *    eux-memes) : ceux-la sont d'ores et deja proves par
 *    acceptance/T06.spec.ts. Elle prouve que le CHEMIN D'ACCES ouvert par le
 *    runner ne les CONTOURNE pas.
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

/** Les cinq paquets que cette suite charge (cf. III). */
const PACKAGES = ['agents', 'storage', 'billing', 'gateway', 'scenario'] as const;

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

/* ═══════════════════ les litteraux du cahier, et rien d'autre ═══════════ */

/** L207 (via T06) : les deux codes de refus du regime de revelation. */
const CODE_NOT_RELEASED = 'NOT_RELEASED'; // cahier:L207
const CODE_UNSPECIFIED = 'UNSPECIFIED'; // cahier:L207

/** L309 : les cinq noms d'export, mot pour mot. */
const EXPORT_START = 'start'; // cahier:L309
const EXPORT_OBSERVE = 'observe'; // cahier:L309
const EXPORT_SUBMIT = 'submit'; // cahier:L309
const EXPORT_STOP = 'stop'; // cahier:L309
const EXPORT_RESUME = 'resume'; // cahier:L309

/** Ce qui n'est PAS un refus : un plantage (meme convention que T00/T06/T17). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/** Code de refus d'A5 — FIXE PAR CETTE SUITE, le cahier ne le nomme pas (cf. II). */
const CODE_REPONSE_INVALIDE = 'INVALID_MODEL_RESPONSE';

/** Statut d'une Submission fraiche — FIXE PAR CETTE SUITE (cf. II, A7). */
const STATUT_EN_ATTENTE = 'PENDING_VALIDATION';

/* ═════════════════ §fixture T06 reutilisee, jamais recopiee ═════════════ */

const SCENARIO_DIR = path.join(REPO, 'acceptance', 'fixtures', 'scenarios');
const SOURCE_RESERVATION = ((): Json => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(SCENARIO_DIR, 'reservation-4-periodes.json'), 'utf8'),
    ) as Json;
  } catch {
    return {};
  }
})();

/** La reponse EXACTE de la periode 1 a la question `capacite_du_creneau_s1`,
 * RELUE dans la fixture — jamais recopiee a la main (cf. II). */
function reponseFixtureP1(questionId: string): string | undefined {
  const periods = SOURCE_RESERVATION.periods;
  if (!Array.isArray(periods)) return undefined;
  const p1 = periods.find((p) => (p as Json).period_index === 1) as Json | undefined;
  const reponses = p1?.customer_answers;
  if (!Array.isArray(reponses)) return undefined;
  const entree = reponses.find((r) => (r as Json).question_id === questionId) as Json | undefined;
  return typeof entree?.answer === 'string' ? entree.answer : undefined;
}

const QUESTION_COUVERTE_P1 = 'capacite_du_creneau_s1';
const REPONSE_ATTENDUE_P1 = reponseFixtureP1(QUESTION_COUVERTE_P1);
/** Une question dont la fixture ne publie la reponse qu'en periode 2 —
 * interrogee alors que le curseur est en periode 1, elle doit rester
 * NOT_RELEASED (cf. A6). */
const QUESTION_TARDIVE_P2 = 'etat_de_a_apres_annulation';
/** Une question absente de toute periode — UNSPECIFIED (cf. A6). */
const QUESTION_HORS_TABLE = 'question-hors-table-inexistante-9f21';

/* ══════════════════════════ PostgreSQL reel (requires: postgres18) ═══════ */

const RUN = `t18_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
  ).toBe('base-creee'); // cahier: requires postgres18 (verification/tasks.json T18)
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
  // packages/storage — repris tels quels de acceptance/T17.spec.ts.
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
  // packages/billing — repris tels quels de acceptance/T17.spec.ts.
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
  // packages/gateway — repris tel quel de acceptance/T17.spec.ts.
  createFakeProvider: [
    'createFakeProvider', 'makeFakeProvider', 'newFakeProvider', 'fakeProvider',
  ],
  // packages/scenario — repris tel quel de acceptance/T06.spec.ts.
  compileScenarioPack: [
    'compileScenarioPack', 'compileScenario', 'compilePack', 'buildScenarioPack',
    'compileScenarioSource', 'scenarioPack', 'compile',
  ],
  // packages/agents — FIXES PAR CETTE SUITE (section III ci-dessus). Les
  // cinq noms primaires sont ceux de L309, mot pour mot.
  createScriptedAgent: [
    'createScriptedAgent', 'scriptedAgent', 'makeScriptedAgent', 'newScriptedAgent',
  ],
  start: [EXPORT_START, 'startSession', 'startAgentRun', 'startRun'],
  observe: [EXPORT_OBSERVE, 'observeSession', 'observeAgentRun', 'step'],
  submit: [EXPORT_SUBMIT, 'submitSession', 'submitAgentRun', 'submitRun'],
  stop: [EXPORT_STOP, 'stopSession', 'stopAgentRun', 'stopRun'],
  resume: [EXPORT_RESUME, 'resumeSession', 'resumeAgentRun', 'resumeRun'],
  getSessionEvents: [
    'getSessionEvents', 'sessionEvents', 'readSessionEvents', 'listSessionEvents', 'events',
  ],
  getSubmissions: [
    'getSubmissions', 'listSubmissions', 'readSubmissions', 'submissionsFor', 'submissions',
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

/** Type minimal d'une action rendue par `observe` — cf. III.3. */
interface Action extends Json {
  operation_sequence: unknown;
  kind: unknown;
}

/** Fait tourner un agent scripte jusqu'a `done`, en collectant les actions. */
async function jouer(
  handle: unknown,
  sessionId: string,
): Promise<{ actions: Action[]; failure?: { err: unknown; apresActions: number } }> {
  const observe = requireRole('observe');
  const actions: Action[] = [];
  for (let i = 0; i < 200; i += 1) {
    const r = await essayer(() => observe(handle, sessionId));
    if (!r.ok) return { actions, failure: { err: r.err, apresActions: actions.length } };
    const { done, actions: pas } = r.value as { done: boolean; actions: Action[] };
    for (const a of pas) actions.push(a);
    if (done) break;
  }
  return { actions };
}

/** Ouvre un budget et y engage une reservation, representant une depense deja
 * engagee AVANT que la reponse invalide n'arrive (A5). Reprend le geste de
 * acceptance/T17.spec.ts `preparerBudgetEtReservation`. */
async function preparerBudget(
  handle: unknown,
  suffixe: string,
  montant = 500,
  limite = 10_000,
): Promise<{ budgetId: string }> {
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');
  const budgetId = idFor(`bud-${suffixe}`);
  const ouv = await essayer(() => openBudget(handle, { budget_id: budgetId, limit: limite }));
  expect(ouv.ok ? 'budget-ouvert' : `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe(
    'budget-ouvert',
  );
  const r = await essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: montant }));
  expect(r.ok ? 'reservation-acceptee' : `RESERVATION-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe(
    'reservation-acceptee',
  );
  return { budgetId };
}

async function lireBudget(handle: unknown, budgetId: string): Promise<Json> {
  const getBudgetState = requireRole('getBudgetState');
  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  expect(etat.ok ? 'etat-lu' : `LECTURE-ETAT-EN-ECHEC ${messageDe((etat as { err: unknown }).err)}`).toBe('etat-lu');
  return (etat as { ok: true; value: Json }).value;
}

/* ══════════════════════════════ T18.A1 ══════════════════════════════════ */

test(
  'T18.A1 — meme script donne les memes patches et les memes appels logiques',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('storage');
    assertPackageLoaded('gateway');

    const createScriptedAgent = requireRole('createScriptedAgent');
    const start = requireRole('start');
    const submit = requireRole('submit');
    const createFakeProvider = requireRole('createFakeProvider');

    const steps = [
      { kind: 'APPLY_PATCH', path: 'a.txt', content: 'hello-a1' },
      { kind: 'MODEL_CALL' },
      { kind: 'APPLY_PATCH', path: 'b.txt', content: 'world-a1' },
      { kind: 'MODEL_CALL' },
      { kind: 'SUBMIT', claimed_requirements: ['A'], artifact_fingerprint: 'fp-a1-fixed' },
    ];

    async function uneExecution(suffixe: string): Promise<{ actions: Action[]; soumission: unknown }> {
      const handle = await ouvrirStore(suffixe);
      const provider = await essayer(() =>
        createFakeProvider({ responses: [{ text: 'reponse-1' }, { text: 'reponse-2' }] }),
      );
      expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
      const prov = (provider as { ok: true; value: unknown }).value;

      const agentR = await essayer(() => createScriptedAgent(steps));
      expect(agentR.ok ? 'agent-cree' : `AGENT-EN-ECHEC ${messageDe((agentR as { err: unknown }).err)}`).toBe(
        'agent-cree',
      );
      const agent = (agentR as { ok: true; value: unknown }).value;

      const sessionId = idFor('sess-a1');
      const dep = await essayer(() =>
        start(handle, {
          session_id: sessionId,
          agent,
          workspace: {},
          facts: [],
          tools: {},
          limits: { max_steps: 20 },
          period_index: 1,
          memory_scope: idFor('scope-a1'),
          modelProvider: prov,
        }),
      );
      expect(dep.ok ? 'session-demarree' : `START-EN-ECHEC ${messageDe((dep as { err: unknown }).err)}`).toBe(
        'session-demarree',
      );

      const { actions, failure } = await jouer(handle, sessionId);
      expect(
        failure === undefined ? 'aucune-panne' : `PANNE-INATTENDUE ${messageDe(failure.err)}`,
      ).toBe('aucune-panne');

      const sub = await essayer(() => submit(handle, sessionId));
      expect(sub.ok ? 'submit-reussi' : `SUBMIT-EN-ECHEC ${messageDe((sub as { err: unknown }).err)}`).toBe(
        'submit-reussi',
      );
      return { actions, soumission: (sub as { ok: true; value: unknown }).value };
    }

    const run1 = await uneExecution('a1x');
    const run2 = await uneExecution('a1y');

    expect(run1.actions.length).toBe(run2.actions.length);
    for (let i = 0; i < run1.actions.length; i += 1) {
      const a1 = run1.actions[i]!;
      const a2 = run2.actions[i]!;
      expect(a1.kind).toBe(a2.kind);
      // L78 : operation_sequence est l'identite d'une operation logique —
      // c'est elle, pas un id opaque genere ailleurs, qui doit coincider.
      expect(a1.operation_sequence).toBe(a2.operation_sequence); // cahier:L78
      if (a1.kind === 'APPLY_PATCH') {
        expect(a1.path).toBe(a2.path);
        expect(a1.content).toBe(a2.content);
      }
      if (a1.kind === 'MODEL_CALL') {
        const r1 = a1.response as Json | undefined;
        const r2 = a2.response as Json | undefined;
        expect(r1?.text).toBe(r2?.text);
      }
    }

    expect(rendu(run1.soumission)).toBe(rendu(run2.soumission));
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T18.A2 ══════════════════════════════════ */

test(
  'T18.A2 — memoire autorisee restauree a la periode suivante',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('storage');

    const createScriptedAgent = requireRole('createScriptedAgent');
    const start = requireRole('start');
    const resume = requireRole('resume');

    const handle = await ouvrirStore('a2');
    const scope = idFor('scope-a2');

    const stepsP1 = [
      { kind: 'REMEMBER', key: 'derniere_reservation', value: 'A' },
      { kind: 'REMEMBER', key: 'compteur', value: 1 },
      { kind: 'SUBMIT', claimed_requirements: [], artifact_fingerprint: 'fp-a2-p1' },
    ];
    const agent1 = await essayer(() => createScriptedAgent(stepsP1));
    expect(agent1.ok ? 'agent-cree' : 'AGENT-EN-ECHEC').toBe('agent-cree');

    const sess1 = idFor('sess-a2-p1');
    const dep1 = await essayer(() =>
      start(handle, {
        session_id: sess1,
        agent: (agent1 as { ok: true; value: unknown }).value,
        workspace: {},
        facts: [],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 1,
        memory_scope: scope,
      }),
    );
    expect(dep1.ok ? 'periode-1-demarree' : `START-P1-EN-ECHEC ${messageDe((dep1 as { err: unknown }).err)}`).toBe(
      'periode-1-demarree',
    );
    const { failure: f1 } = await jouer(handle, sess1);
    expect(f1 === undefined ? 'periode-1-jouee' : `PANNE-P1 ${messageDe(f1.err)}`).toBe('periode-1-jouee');

    // PERIODE SUIVANTE, VIA resume — le canal REEL que A2 exerce.
    const stepsP2 = [{ kind: 'SUBMIT', claimed_requirements: [], artifact_fingerprint: 'fp-a2-p2' }];
    const agent2 = await essayer(() => createScriptedAgent(stepsP2));
    expect(agent2.ok ? 'agent-cree' : 'AGENT-EN-ECHEC').toBe('agent-cree');

    const sess2 = idFor('sess-a2-p2');
    const rep = await essayer(() =>
      resume(handle, {
        session_id: sess2,
        agent: (agent2 as { ok: true; value: unknown }).value,
        workspace: {},
        facts: [],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 2,
        memory_scope: scope,
      }),
    );
    expect(rep.ok ? 'resume-reussi' : `RESUME-EN-ECHEC ${messageDe((rep as { err: unknown }).err)}`).toBe(
      'resume-reussi',
    );
    const { context } = (rep as { ok: true; value: Json }).value as { context: Json };
    const memoire = context.memory;
    const texte = rendu(memoire);

    // L'ASSERTION DECISIVE : les DEUX ecritures de la periode 1 sont
    // retrouvees, sous leur cle ET leur valeur.
    expect(texte.includes('derniere_reservation') && texte.includes('"A"') ? 'memoire-A-presente' : `MEMOIRE-A-ABSENTE ${texte}`).toBe(
      'memoire-A-presente',
    );
    expect(texte.includes('compteur') && /\bcompteur[^A-Za-z_]{0,6}1\b/.test(texte) ? 'memoire-compteur-presente' : `MEMOIRE-COMPTEUR-ABSENTE ${texte}`).toBe(
      'memoire-compteur-presente',
    );

    // CONTROLE : un scope JAMAIS utilise ne restaure rien (une implementation
    // qui rendrait TOUJOURS la meme memoire, quel que soit le scope, serait
    // aussi fausse qu'une implementation qui n'en restaure aucune).
    const sess3 = idFor('sess-a2-scope-neuf');
    const agent3 = await essayer(() => createScriptedAgent(stepsP2));
    const rep2 = await essayer(() =>
      resume(handle, {
        session_id: sess3,
        agent: (agent3 as { ok: true; value: unknown }).value,
        workspace: {},
        facts: [],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 1,
        memory_scope: idFor('scope-a2-jamais-vu'),
      }),
    );
    expect(rep2.ok ? 'resume-scope-neuf-reussi' : `RESUME-SCOPE-NEUF-EN-ECHEC ${messageDe((rep2 as { err: unknown }).err)}`).toBe(
      'resume-scope-neuf-reussi',
    );
    const texte2 = rendu(((rep2 as { ok: true; value: Json }).value as { context: Json }).context.memory);
    expect(
      texte2.includes('derniere_reservation') ? `FUITE-INTER-SCOPE ${texte2}` : 'aucune-fuite-inter-scope',
    ).toBe('aucune-fuite-inter-scope');
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T18.A3 ══════════════════════════════════ */

test(
  'T18.A3 — contexte neuf ne contient pas d historique conversationnel non autorise',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('storage');
    assertPackageLoaded('gateway');

    const createScriptedAgent = requireRole('createScriptedAgent');
    const start = requireRole('start');
    const resume = requireRole('resume');
    const createFakeProvider = requireRole('createFakeProvider');

    const handle = await ouvrirStore('a3');
    const scope = idFor('scope-a3');

    // La reponse modele de la periode 1 porte une CHAINE UNIQUE, jamais
    // reprise ailleurs : c'est elle qu'on cherche a ne PAS retrouver dans le
    // contexte neuf de la periode 2. Si elle FIGURAIT dans un champ REMEMBER
    // explicite, ce ne serait pas une fuite — elle n'y figure pas ici.
    const sentinelleTranscript = `TRANSCRIPT-NON-AUTORISE-${idFor('marq')}`;

    const provider = await essayer(() =>
      createFakeProvider({ responses: [{ text: sentinelleTranscript }] }),
    );
    expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');

    const stepsP1 = [
      { kind: 'MODEL_CALL' },
      { kind: 'REMEMBER', key: 'decision_autorisee', value: 'reserver-creneau-1' },
      { kind: 'SUBMIT', claimed_requirements: [], artifact_fingerprint: 'fp-a3-p1' },
    ];
    const agent1 = await essayer(() => createScriptedAgent(stepsP1));
    expect(agent1.ok ? 'agent-cree' : 'AGENT-EN-ECHEC').toBe('agent-cree');

    const sess1 = idFor('sess-a3-p1');
    const dep1 = await essayer(() =>
      start(handle, {
        session_id: sess1,
        agent: (agent1 as { ok: true; value: unknown }).value,
        workspace: { 'notes.txt': 'etat initial' },
        facts: ['fait-p1-disponible'],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 1,
        memory_scope: scope,
        modelProvider: (provider as { ok: true; value: unknown }).value,
      }),
    );
    expect(dep1.ok ? 'periode-1-demarree' : `START-P1-EN-ECHEC ${messageDe((dep1 as { err: unknown }).err)}`).toBe(
      'periode-1-demarree',
    );
    const { failure: f1 } = await jouer(handle, sess1);
    expect(f1 === undefined ? 'periode-1-jouee' : `PANNE-P1 ${messageDe(f1.err)}`).toBe('periode-1-jouee');

    const stepsP2 = [{ kind: 'SUBMIT', claimed_requirements: [], artifact_fingerprint: 'fp-a3-p2' }];
    const agent2 = await essayer(() => createScriptedAgent(stepsP2));
    const sess2 = idFor('sess-a3-p2');
    const rep = await essayer(() =>
      resume(handle, {
        session_id: sess2,
        agent: (agent2 as { ok: true; value: unknown }).value,
        workspace: { 'notes.txt': 'etat periode 2' },
        facts: ['fait-p2-disponible'],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 2,
        memory_scope: scope,
      }),
    );
    expect(rep.ok ? 'resume-reussi' : `RESUME-EN-ECHEC ${messageDe((rep as { err: unknown }).err)}`).toBe(
      'resume-reussi',
    );
    const { context } = (rep as { ok: true; value: Json }).value as { context: Json };
    const texte = rendu(context);

    // CONTROLE POSITIF D'ABORD : le contexte n'est pas vide a vide — la
    // memoire AUTORISEE (ecrite via REMEMBER) doit y figurer.
    expect(
      texte.includes('decision_autorisee') ? 'memoire-autorisee-presente' : `MEMOIRE-AUTORISEE-ABSENTE ${texte}`,
    ).toBe('memoire-autorisee-presente'); // cahier:L84-95 (AgentRun.contexte_autorise)

    // L'ASSERTION DECISIVE (absence) : la sentinelle du transcript BRUT de la
    // periode 1 — jamais passee par REMEMBER — n'apparait NULLE PART dans le
    // contexte neuf.
    expect(
      texte.includes(sentinelleTranscript) ? `HISTORIQUE-NON-AUTORISE-PRESENT ${texte}` : 'aucun-historique-fuite',
    ).toBe('aucun-historique-fuite'); // cahier:L64 (revelation D2), L311
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T18.A4 ══════════════════════════════════ */

test(
  'T18.A4 — arret ne produit plus de nouvelle soumission',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('storage');

    const createScriptedAgent = requireRole('createScriptedAgent');
    const start = requireRole('start');
    const observe = requireRole('observe');
    const submit = requireRole('submit');
    const stop = requireRole('stop');
    const getSubmissions = requireRole('getSubmissions');

    const steps = [
      { kind: 'APPLY_PATCH', path: 'a4.txt', content: 'avant-arret' },
      { kind: 'SUBMIT', claimed_requirements: ['A'], artifact_fingerprint: 'fp-a4' },
    ];

    // CONTROLE POSITIF D'ABORD (cf. cases.lock.json : un stub des exports
    // laisserait ce cas vert a vide). Le MEME script, SANS arret, doit
    // produire une soumission.
    {
      const handle = await ouvrirStore('a4-controle');
      const agent = await essayer(() => createScriptedAgent(steps));
      const sess = idFor('sess-a4-controle');
      const dep = await essayer(() =>
        start(handle, {
          session_id: sess,
          agent: (agent as { ok: true; value: unknown }).value,
          workspace: {},
          facts: [],
          tools: {},
          limits: { max_steps: 10 },
          period_index: 1,
          memory_scope: idFor('scope-a4-controle'),
        }),
      );
      expect(dep.ok ? 'demarre' : 'START-EN-ECHEC').toBe('demarre');
      await jouer(handle, sess);
      const sub = await essayer(() => submit(handle, sess));
      expect(sub.ok ? 'submit-reussi' : 'SUBMIT-EN-ECHEC').toBe('submit-reussi');
      const val = (sub as { ok: true; value: unknown }).value;
      expect(val !== null && val !== undefined ? 'soumission-presente' : `SOUMISSION-ABSENTE-CONTROLE ${rendu(val)}`).toBe(
        'soumission-presente',
      );
      const list = await essayer(() => getSubmissions(handle, sess));
      expect(list.ok ? 'liste-lue' : 'LISTE-EN-ECHEC').toBe('liste-lue');
      expect((list as { ok: true; value: unknown[] }).value.length).toBeGreaterThan(0);
    }

    // LE CAS LUI-MEME : arret AVANT que la session n'atteigne l'etape SUBMIT.
    const handle = await ouvrirStore('a4');
    const agent = await essayer(() => createScriptedAgent(steps));
    const sess = idFor('sess-a4');
    const dep = await essayer(() =>
      start(handle, {
        session_id: sess,
        agent: (agent as { ok: true; value: unknown }).value,
        workspace: {},
        facts: [],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 1,
        memory_scope: idFor('scope-a4'),
      }),
    );
    expect(dep.ok ? 'demarre' : 'START-EN-ECHEC').toBe('demarre');

    // Consomme SEULEMENT le premier pas (le patch), puis arrete AVANT SUBMIT.
    const premier = await essayer(() => observe(handle, sess));
    expect(premier.ok ? 'premier-pas-joue' : `PREMIER-PAS-EN-ECHEC ${messageDe((premier as { err: unknown }).err)}`).toBe(
      'premier-pas-joue',
    );

    const arret = await essayer(() => stop(handle, sess));
    expect(arret.ok ? 'arrete' : `ARRET-EN-ECHEC ${messageDe((arret as { err: unknown }).err)}`).toBe('arrete');

    // APRES L'ARRET : ni observe (qui tenterait d'atteindre SUBMIT) ni submit
    // ne produisent de nouvelle soumission.
    const apres1 = await essayer(() => observe(handle, sess));
    expect(apres1.ok ? 'observe-post-arret-execute' : `OBSERVE-POST-ARRET-EN-ECHEC ${messageDe((apres1 as { err: unknown }).err)}`).toBe(
      'observe-post-arret-execute',
    );
    const { done: doneApres, actions: actionsApres } = (apres1 as { ok: true; value: Json }).value as {
      done: boolean;
      actions: unknown[];
    };
    expect(doneApres).toBe(true);
    expect(actionsApres.length).toBe(0);

    const apres2 = await essayer(() => submit(handle, sess));
    expect(apres2.ok ? 'submit-post-arret-execute' : `SUBMIT-POST-ARRET-EN-ECHEC ${messageDe((apres2 as { err: unknown }).err)}`).toBe(
      'submit-post-arret-execute',
    );
    const valApres = (apres2 as { ok: true; value: unknown }).value;
    expect(
      valApres === null || valApres === undefined ? 'aucune-soumission-post-arret' : `SOUMISSION-A-TORT-CREEE ${rendu(valApres)}`,
    ).toBe('aucune-soumission-post-arret'); // cahier:L313.A4 — le point decisif

    const listeApres = await essayer(() => getSubmissions(handle, sess));
    expect(listeApres.ok ? 'liste-post-arret-lue' : 'LISTE-POST-ARRET-EN-ECHEC').toBe('liste-post-arret-lue');
    expect((listeApres as { ok: true; value: unknown[] }).value.length).toBe(0);
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T18.A5 ══════════════════════════════════ */

test(
  'T18.A5 — reponses invalides donnent erreur typee et depense conservee',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('storage');
    assertPackageLoaded('billing');
    assertPackageLoaded('gateway');

    const createScriptedAgent = requireRole('createScriptedAgent');
    const start = requireRole('start');
    const observe = requireRole('observe');
    const submit = requireRole('submit');
    const getSubmissions = requireRole('getSubmissions');
    const createFakeProvider = requireRole('createFakeProvider');

    const handle = await ouvrirStore('a5');
    const { budgetId } = await preparerBudget(handle, 'a5');
    const avant = await lireBudget(handle, budgetId);

    // CONTROLE POSITIF D'ABORD : une reponse VALIDE, meme sur un budget deja
    // engage, reussit — un stub qui leverait TOUJOURS rendrait ce cas vert
    // sans rien prouver (cases.lock.json : defaut decisif du mode `refusal`).
    {
      const providerValide = await essayer(() => createFakeProvider({ responses: [{ text: 'reponse-valide' }] }));
      expect(providerValide.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
      const steps = [{ kind: 'MODEL_CALL' }, { kind: 'SUBMIT', claimed_requirements: [], artifact_fingerprint: 'fp-a5-valide' }];
      const agent = await essayer(() => createScriptedAgent(steps));
      const sess = idFor('sess-a5-controle');
      const dep = await essayer(() =>
        start(handle, {
          session_id: sess,
          agent: (agent as { ok: true; value: unknown }).value,
          workspace: {},
          facts: [],
          tools: {},
          limits: { max_steps: 10 },
          period_index: 1,
          memory_scope: idFor('scope-a5-controle'),
          budget_id: budgetId,
          modelProvider: (providerValide as { ok: true; value: unknown }).value,
        }),
      );
      expect(dep.ok ? 'demarre' : 'START-EN-ECHEC').toBe('demarre');
      const { failure } = await jouer(handle, sess);
      expect(failure === undefined ? 'reponse-valide-acceptee' : `REPONSE-VALIDE-A-TORT-REFUSEE ${messageDe(failure.err)}`).toBe(
        'reponse-valide-acceptee',
      );
    }

    // LE CAS LUI-MEME : reponse archivee MALFORMEE (texte vide — troncature).
    const providerInvalide = await essayer(() => createFakeProvider({ responses: [{ text: '' }] }));
    expect(providerInvalide.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
    const provInv = (providerInvalide as { ok: true; value: { complete: Fn; calls: number } }).value;

    const stepsInvalides = [{ kind: 'MODEL_CALL' }, { kind: 'SUBMIT', claimed_requirements: [], artifact_fingerprint: 'fp-a5-invalide' }];
    const agentInv = await essayer(() => createScriptedAgent(stepsInvalides));
    const sessInv = idFor('sess-a5');
    const depInv = await essayer(() =>
      start(handle, {
        session_id: sessInv,
        agent: (agentInv as { ok: true; value: unknown }).value,
        workspace: {},
        facts: [],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 1,
        memory_scope: idFor('scope-a5'),
        budget_id: budgetId,
        modelProvider: provInv,
      }),
    );
    expect(depInv.ok ? 'demarre' : 'START-EN-ECHEC').toBe('demarre');

    const rejet = await essayer(() => observe(handle, sessInv));
    expect(
      rejet.ok ? `REPONSE-INVALIDE-A-TORT-ACCEPTEE ${rendu((rejet as { value: unknown }).value)}` : 'rejet-observe',
    ).toBe('rejet-observe'); // cahier:L313.A5
    const err = (rejet as { ok: false; err: unknown }).err;
    expect(
      MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
    ).toBe('refus-authentique');
    expect(
      codeDe(err) === CODE_REPONSE_INVALIDE ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(codeDe(err))} (attendu ${CODE_REPONSE_INVALIDE})`,
    ).toBe('code-conforme');
    expect(provInv.calls).toBe(1);

    // AUCUNE SOUMISSION COERCEE.
    const subInv = await essayer(() => submit(handle, sessInv));
    expect(subInv.ok ? 'submit-execute' : `SUBMIT-EN-ECHEC ${messageDe((subInv as { err: unknown }).err)}`).toBe(
      'submit-execute',
    );
    const valInv = (subInv as { ok: true; value: unknown }).value;
    expect(
      valInv === null || valInv === undefined ? 'aucune-soumission-coercee' : `SOUMISSION-A-TORT-COERCEE ${rendu(valInv)}`,
    ).toBe('aucune-soumission-coercee');
    const listeInv = await essayer(() => getSubmissions(handle, sessInv));
    expect((listeInv as { ok: true; value: unknown[] }).value.length).toBe(0);

    // LE SECOND VOLET : la depense DEJA ENGAGEE (la reservation) reste
    // EXACTEMENT ce qu'elle etait — ni reglee, ni liberee.
    const apres = await lireBudget(handle, budgetId);
    expect(rendu(apres)).toBe(rendu(avant)); // cahier:L67 (invariant D5)
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T18.A6 ══════════════════════════════════ */

test(
  'T18.A6 — acces au service client respecte T06',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('storage');
    assertPackageLoaded('scenario');

    expect(REPONSE_ATTENDUE_P1 !== undefined ? 'fixture-lisible' : 'FIXTURE-RESERVATION-ILLISIBLE-OU-INCOMPLETE').toBe(
      'fixture-lisible',
    );

    const handle = await ouvrirStore('a6');
    const compileScenarioPack = requireRole('compileScenarioPack');
    const packR = await essayer(() => compileScenarioPack(SOURCE_RESERVATION));
    expect(packR.ok ? 'pack-compile' : `COMPILATION-EN-ECHEC ${messageDe((packR as { err: unknown }).err)}`).toBe(
      'pack-compile',
    );
    const pack = (packR as { ok: true; value: unknown }).value;

    const createScriptedAgent = requireRole('createScriptedAgent');
    const start = requireRole('start');

    const steps = [
      { kind: 'ASK_CLIENT', question: QUESTION_COUVERTE_P1 },
      { kind: 'ASK_CLIENT', question: QUESTION_TARDIVE_P2 },
      { kind: 'ASK_CLIENT', question: QUESTION_HORS_TABLE },
      { kind: 'SUBMIT', claimed_requirements: [], artifact_fingerprint: 'fp-a6' },
    ];
    const agent = await essayer(() => createScriptedAgent(steps));
    expect(agent.ok ? 'agent-cree' : 'AGENT-EN-ECHEC').toBe('agent-cree');

    const sess = idFor('sess-a6');
    const dep = await essayer(() =>
      start(handle, {
        session_id: sess,
        agent: (agent as { ok: true; value: unknown }).value,
        workspace: {},
        facts: [],
        tools: { clientService: { pack } },
        limits: { max_steps: 10 },
        period_index: 1,
        memory_scope: idFor('scope-a6'),
      }),
    );
    expect(dep.ok ? 'demarre' : `START-EN-ECHEC ${messageDe((dep as { err: unknown }).err)}`).toBe('demarre');

    const { actions, failure } = await jouer(handle, sess);
    expect(failure === undefined ? 'aucune-panne' : `PANNE-INATTENDUE ${messageDe(failure.err)}`).toBe(
      'aucune-panne',
    );
    expect(actions.length).toBeGreaterThanOrEqual(3);

    const [couverte, tardive, horsTable] = actions;

    // VOLET POSITIF D'ABORD (cases.lock.json : un chemin qui refuserait TOUT
    // satisferait A6 sans rien prouver). La question COUVERTE, posee au bon
    // moment, doit REUSSIR avec la reponse EXACTE de la fixture.
    expect(couverte?.kind).toBe('ASK_CLIENT');
    expect(couverte?.ok).toBe(true);
    expect(
      rendu(couverte?.result).includes(REPONSE_ATTENDUE_P1 as string)
        ? 'reponse-fixture-exacte'
        : `REPONSE-NON-CONFORME ${rendu(couverte?.result)} (attendu ${String(REPONSE_ATTENDUE_P1)})`,
    ).toBe('reponse-fixture-exacte');

    // L'ASSERTION DECISIVE (1) : la question TARDIVE (publiee en periode 2,
    // posee alors que le runner est a la periode 1) est refusee NOT_RELEASED
    // — PAS servie, et PAS coercee en UNSPECIFIED (qui dirait faussement
    // qu'elle n'existe pas).
    expect(tardive?.kind).toBe('ASK_CLIENT');
    expect(
      tardive?.ok === false ? 'refuse' : `SERVIE-A-TORT ${rendu(tardive?.result)}`,
    ).toBe('refuse'); // cahier:L313.A6, L207
    expect(
      rendu(tardive?.result).includes(CODE_NOT_RELEASED) ? 'code-not-released-present' : `CODE-ABSENT ${rendu(tardive?.result)}`,
    ).toBe('code-not-released-present');

    // L'ASSERTION DECISIVE (2) : la question HORS TABLE recoit UNSPECIFIED,
    // sans reponse fabriquee.
    expect(horsTable?.kind).toBe('ASK_CLIENT');
    expect(
      horsTable?.ok === false ? 'refuse' : `SERVIE-A-TORT ${rendu(horsTable?.result)}`,
    ).toBe('refuse'); // cahier:L313.A6, L207
    expect(
      rendu(horsTable?.result).includes(CODE_UNSPECIFIED) ? 'code-unspecified-present' : `CODE-ABSENT ${rendu(horsTable?.result)}`,
    ).toBe('code-unspecified-present');

    // Chaque code n'apparait pas a la place de l'autre.
    expect(rendu(tardive?.result).includes(CODE_UNSPECIFIED)).toBe(false);
    expect(rendu(horsTable?.result).includes(CODE_NOT_RELEASED)).toBe(false);
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T18.A7 ══════════════════════════════════ */

test(
  'T18.A7 — evenements de l agent n ont pas autorite pour fixer eux-memes accepted=true',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('storage');

    const createScriptedAgent = requireRole('createScriptedAgent');
    const start = requireRole('start');
    const submit = requireRole('submit');
    const getSessionEvents = requireRole('getSessionEvents');

    const handle = await ouvrirStore('a7');
    const steps = [
      { kind: 'SELF_REPORT', accepted: true },
      { kind: 'SUBMIT', claimed_requirements: ['A'], artifact_fingerprint: 'fp-a7' },
    ];
    const agent = await essayer(() => createScriptedAgent(steps));
    expect(agent.ok ? 'agent-cree' : 'AGENT-EN-ECHEC').toBe('agent-cree');

    const sess = idFor('sess-a7');
    const dep = await essayer(() =>
      start(handle, {
        session_id: sess,
        agent: (agent as { ok: true; value: unknown }).value,
        workspace: {},
        facts: [],
        tools: {},
        limits: { max_steps: 10 },
        period_index: 1,
        memory_scope: idFor('scope-a7'),
      }),
    );
    expect(dep.ok ? 'demarre' : 'START-EN-ECHEC').toBe('demarre');

    const { failure } = await jouer(handle, sess);
    expect(failure === undefined ? 'script-joue' : `PANNE-INATTENDUE ${messageDe(failure.err)}`).toBe(
      'script-joue',
    );

    // CONTROLE POSITIF (cases.lock.json : sous des exports stubes, aucun
    // verdict n'est jamais pose et l'assertion resterait vraie a vide).
    // L'evenement SELF_REPORT DOIT etre enregistre, sans quoi ce n'est pas
    // une preuve d'ABSENCE D'AUTORITE mais une preuve d'absence de journal.
    const evR = await essayer(() => getSessionEvents(handle, sess));
    expect(evR.ok ? 'evenements-lus' : `LECTURE-EVENEMENTS-EN-ECHEC ${messageDe((evR as { err: unknown }).err)}`).toBe(
      'evenements-lus',
    );
    const evenements = (evR as { ok: true; value: unknown[] }).value;
    const texteEv = rendu(evenements);
    expect(
      texteEv.includes('SELF_REPORT') && /accepted["' ]{0,3}:\s*true/.test(texteEv)
        ? 'evenement-self-report-enregistre'
        : `EVENEMENT-SELF-REPORT-ABSENT ${texteEv}`,
    ).toBe('evenement-self-report-enregistre');

    // L'ASSERTION DECISIVE (absence) : la Submission persistee n'a PAS ete
    // acceptee sur la seule foi de cet evenement.
    const subR = await essayer(() => submit(handle, sess));
    expect(subR.ok ? 'submit-execute' : `SUBMIT-EN-ECHEC ${messageDe((subR as { err: unknown }).err)}`).toBe(
      'submit-execute',
    );
    const soumission = (subR as { ok: true; value: Json | null }).value;
    expect(soumission !== null ? 'soumission-presente' : 'SOUMISSION-ABSENTE').toBe('soumission-presente');
    const s = soumission as Json;

    expect(
      s.accepted !== true ? 'accepted-non-force' : `ACCEPTED-A-TORT-FORCE-A-TRUE ${rendu(s)}`,
    ).toBe('accepted-non-force'); // cahier:L313.A7
    expect(
      s.status !== 'ACCEPTED' ? 'statut-non-force' : `STATUT-A-TORT-ACCEPTED ${rendu(s)}`,
    ).toBe('statut-non-force');
    expect(
      s.status === STATUT_EN_ATTENTE ? 'statut-en-attente' : `STATUT-INATTENDU ${rendu(s.status)} (attendu ${STATUT_EN_ATTENTE})`,
    ).toBe('statut-en-attente');

    // La validation_result eventuellement presente ne porte pas non plus
    // `accepted:true` recopie de l'evenement.
    const validation = s.validation_result;
    if (validation !== null && validation !== undefined && typeof validation === 'object') {
      const v = validation as Json;
      expect(
        v.accepted !== true ? 'validation-non-forcee' : `VALIDATION-A-TORT-ACCEPTEE ${rendu(v)}`,
      ).toBe('validation-non-forcee');
    }
  },
  CASE_TIMEOUT_MS,
);
