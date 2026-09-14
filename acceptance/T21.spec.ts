/**
 * acceptance/T21.spec.ts — suite d'acceptation de la tache T21.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T21.A1 numeric   — migration correcte conserve 100 enregistrements metier
 *   T21.A2 refusal   — migration perdant un enregistrement donne
 *                      MIGRATION_REJECTED, version active et donnees inchangees
 *   T21.A3 refusal   — livraison qui ne preserve pas une exigence active, ou un
 *                      invariant critique applicable, est refusee
 *   T21.A4 behaviour — exigence remplacee n'empeche pas la livraison
 *   T21.A5 refusal   — quatrieme soumission apres limite de trois donne
 *                      SUBMISSION_LIMIT
 *   T21.A6 behaviour — panne entre preparation et bascule : une seule version
 *                      active coherente est retrouvee
 *   T21.A7 behaviour — couts des refus conserves au registre de couts
 *   T21.A8 behaviour — deploiement partiel admis, exigence restante au
 *                      backlog, Q < 1
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T21 — `packages/evaluation`,
 * `packages/domain` et `packages/activities` — et ne les a lus ni directement
 * ni par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, pas une barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T21.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle sur T21 :
 *
 *   L337  dependances T05, T09, T15, T20 ; livrables MOT POUR MOT : « gestion
 *         des soumissions, version active, validation de compatibilite et
 *         procedure de deploiement ».
 *   L341  les huit cas d'acceptation, mot pour mot — dont les deux litteraux
 *         exacts `MIGRATION_REJECTED` et `SUBMISSION_LIMIT`, et le nombre
 *         `100`.
 *   L343  fin : « contrat de bascule et recuperation documente. La migration
 *         est d'abord eprouvee sur copie ; le deploiement reel utilise
 *         sauvegarde, barriere et reprise idempotente. La plateforme n'impose
 *         pas de livrer tout le backlog pour accepter un sous-ensemble
 *         coherent. »
 *   L97   (applies: T21.A6, T21.A8) enum verbatim : « `deployment_coverage`
 *         vaut `NO_DEPLOYMENT`, `PARTIAL` ou `ACCEPTED` ».
 *   L129  F-REGRESSION (applies: T21.A3, T21.A4), racine gelee
 *         acceptance/reference/F-REGRESSION.json : `cancel@1` satisfaite en
 *         P2 puis remplacee en P3 par `cancel@2` ne produit PAS de regression ;
 *         `isolation@1` satisfaite en P3 puis violee en P4 EN PRODUIT une ;
 *         « compter par id/version active, pas par nombre d'assertions ».
 *   L143  (applies: T21.A8) « les nombres exacts se verifient en entier ou
 *         rationnel » — Q est donc compare comme une PAIRE D'ENTIERS
 *         (numerateur, denominateur), jamais comme un flottant.
 *   L63   invariant D9 : « les depenses utilisent des entiers exacts, jamais
 *         une addition de flottants monetaires ».
 *   L65   invariant D5 : « un echec conserve ses depenses, ses intentions non
 *         servies et son backlog » — fonde A7.
 *   L141  « les checks d'integration utilisent reellement PostgreSQL [...]
 *         lorsque le contrat porte sur ces composants » — fonde A1/A2/A7,
 *         seuls cas de cases.lock.json a requerir `postgres18`/`s3`/conteneurs.
 *
 * Cette suite reprend, sans les relire, les conventions deja fixees par
 * acceptance/T20.spec.ts (chargement par `source_paths`, resolution par
 * ROLE avec alias, `psql`/`creerBase`/`dsnFor`, `rendu`/`court`/`essayer`),
 * au meme titre que T20 reprenait celles de T10/T19.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 * (a) IMPORTS de `acceptance/reference/**` (racine gelee,
 *     docs/FROZEN_ROOTS.json) :
 *       F-REGRESSION.json — `cancel@1`, `cancel@2`, `isolation@1`, les trois
 *       instants (P2/P3/P4) et `regressions_attendues` (A3, A4).
 * (b) COMMENTAIRES `// cahier:L<n>` resolubles par `sed -n '<n>p' docs/cahier.md` :
 *       100                    — L341, « migration correcte conserve 100 »
 *       `MIGRATION_REJECTED`   — L341, mot pour mot
 *       `SUBMISSION_LIMIT`     — L341, mot pour mot
 *       3                      — L341, « limite de trois »
 *       `NO_DEPLOYMENT`/`PARTIAL`/`ACCEPTED` — L97, enum verbatim
 * Tout le reste — identifiants de trajectoire, digests d'artefacts factices,
 * SQL de migration jouet, montants de cout, noms d'invariants critiques — est
 * FABRIQUE PAR CETTE SUITE et sert d'ENTREE, jamais de valeur attendue tiree
 * d'une execution observee : aucune implementation de T21 n'existe au moment
 * ou cette suite est ecrite.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T21 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Paquets interroges : `packages/evaluation`, `packages/domain` et
 * `packages/activities` (les trois `source_paths` de T21). Le chargement ne
 * LEVE jamais : chaque cas asserte lui-meme le chargement, en le NOMMANT.
 * FIXE PAR CETTE SUITE, faute d'enonce dans le cahier sur la forme exacte des
 * appels (meme geste que T20 fixant `EvaluationResult`, ou T09 fixant le
 * contrat HTTP des temoins) :
 *
 * 1. `admitDelivery(input): Promise<AdmitDeliveryResult>`
 *
 *    Le nom `admitDelivery` n'est pas invente au hasard : c'est le nom
 *    d'export que verification/mutants/T21.json (ce meme etage) fixe comme
 *    cible de mutation pour A4 — « l'export d'admission des soumissions de la
 *    gestion de livraisons ». Alias tolerees a la resolution (section IV).
 *
 *    `input` (champs SNAKE_CASE, alignes sur le vocabulaire du cahier —
 *    `deployment_coverage`, `period_index`, `idempotency_key`, etc.) :
 *      trajectory_id: string
 *      period_index: number                 // cahier E : commence a 1
 *      attempt: number                      // cahier E « tentative » —
 *                                            // 1-based ; limite fixee a 3
 *                                            // (cahier:L341, "SUBMISSION_LIMIT")
 *      due_requirements: Array<{
 *        id: string; version: number; weight: number;
 *        prior_satisfied: boolean;          // deja satisfaite par une
 *                                            // soumission ADMISE anterieure,
 *                                            // et donc PROTEGEE contre la
 *                                            // regression a cette meme
 *                                            // version. Une exigence
 *                                            // REMPLACEE (nouvelle version)
 *                                            // n'apparait dans cette liste
 *                                            // qu'a sa version ACTIVE
 *                                            // courante — jamais sous son
 *                                            // ancienne version (cahier L129 :
 *                                            // « compter par id/version
 *                                            // active »).
 *      }>
 *      critical_invariants: string[]        // ids des invariants critiques
 *                                            // applicables cette periode
 *      ledger_dsn: string                   // PostgreSQL REEL — la fonction
 *                                            // publie une ligne de cout dans
 *                                            // une table `ledger_entries`
 *                                            // qu'elle cree si absente
 *                                            // (colonnes : trajectory_id text,
 *                                            // period_index integer,
 *                                            // attempt integer, cost bigint,
 *                                            // verdict text) — MEME quand le
 *                                            // verdict est REJECTED (D5, A7).
 *      submission: {
 *        artifact_digest: string
 *        satisfied_requirement_keys: string[]  // cles "id@version" REELLEMENT
 *                                               // satisfaites par ce candidat
 *                                               // (verdict d'oracle independant,
 *                                               // fabrique par cette suite)
 *        preserved_invariant_ids: string[]
 *        cost: number                          // entier exact (cahier D9)
 *      }
 *
 *    `AdmitDeliveryResult` :
 *      verdict: 'ADMITTED' | 'REJECTED'
 *      reason?: string
 *      deployment_coverage: 'NO_DEPLOYMENT' | 'PARTIAL' | 'ACCEPTED'  // cahier:L97
 *      backlog: Array<{ id: string; version: number }>   // sous-ensemble de
 *                                            // `due_requirements` NON
 *                                            // satisfait par la soumission
 *                                            // ADMISE (vide si REJECTED ou si
 *                                            // tout est satisfait)
 *      q: { num: number; den: number } | null   // rationnel EXACT (cahier:L143) —
 *                                            // somme des poids satisfaits sur
 *                                            // somme des poids dus, null si
 *                                            // `due_requirements` est vide
 *
 *    REGLE DE REFUS (L341 A3, derivee) : la soumission est REJECTED si (a)
 *    `attempt` depasse 3 (`reason` contient exactement `SUBMISSION_LIMIT`,
 *    verbatim cahier:L341) ; SINON si (b) une entree de `due_requirements`
 *    avec `prior_satisfied:true` n'a pas sa cle `id@version` dans
 *    `satisfied_requirement_keys` (regression sur une exigence PROTEGEE) ;
 *    SINON si (c) un invariant de `critical_invariants` est absent de
 *    `preserved_invariant_ids`. Une exigence REMPLACEE (ancienne version
 *    absente de `due_requirements`) ne peut jamais, par construction, causer
 *    (b) — c'est exactement F-REGRESSION (A4).
 *
 * 2. `runProtectedMigration(input): Promise<RunProtectedMigrationResult>`
 *
 *      from_dsn: string             // PostgreSQL REEL, donnees de la version
 *                                    // ACTIVE courante
 *      read_identities_sql: string  // SELECT rendant UNE colonne texte
 *                                    // d'identites metier ; EXECUTEE PAR LA
 *                                    // FONCTION, sur `from_dsn` (avant) puis
 *                                    // sur le CLONE JETABLE (apres) — jamais
 *                                    // par l'appelant
 *      migration_sql: string        // SQL arbitraire, EXECUTE PAR LA
 *                                    // FONCTION sur le clone jetable
 *                                    // uniquement, JAMAIS d'abord sur
 *                                    // `from_dsn` (cahier:L343 « la migration
 *                                    // est d'abord eprouvee sur copie »)
 *
 *    `RunProtectedMigrationResult` :
 *      verdict: 'MIGRATED' | 'MIGRATION_REJECTED'   // cahier:L341 verbatim
 *      reason?: string
 *      record_count_before: number
 *      record_count_after: number
 *
 *    Si et seulement si `verdict==='MIGRATED'`, `migration_sql` a EGALEMENT
 *    ete applique pour de vrai sur `from_dsn` (bascule reelle). Si
 *    `MIGRATION_REJECTED`, `from_dsn` reste OCTETS POUR OCTETS ce qu'il etait
 *    avant l'appel — cette suite le verifie par une requete `psql`
 *    INDEPENDANTE de la fonction (A2).
 *
 * 3. `resumeDeploymentSwitch(input): Promise<ResumeDeploymentSwitchResult>`
 *
 *      active_version_id: string      // version active AVANT la panne
 *      prepared_version_id: string    // version preparee au moment de la panne
 *      switch_committed: boolean      // la bascule avait-elle deja ete rendue
 *                                      // DURABLE avant la panne ?
 *
 *    `ResumeDeploymentSwitchResult` :
 *      active_version_id: string      // LA SEULE version active retenue —
 *                                      // `prepared_version_id` si
 *                                      // `switch_committed`, sinon
 *                                      // `active_version_id` d'entree —
 *                                      // JAMAIS une troisieme valeur, jamais
 *                                      // les deux a la fois.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * ALIAS DE RESOLUTION (tolerance de NOMMAGE, jamais de COMPORTEMENT — meme
 * geste que T09/T20).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * LES DANGERS PROPRES A T21, ET LEUR CONTROLE DANS CETTE SUITE.
 *
 * (1) A2, A3, A5 sont des cas `refusal` (verification/cases.lock.json) : « un
 *     stub qui leve rendrait ce cas VERT sans rien prouver ». Chacun porte
 *     donc son CONTROLE POSITIF dans le MEME cas : A2 exerce d'abord une
 *     migration CORRECTE avant la migration perdante ; A3 exerce d'abord une
 *     soumission qui NE regresse rien (admise) avant celle qui regresse ;
 *     A5 exige que les TROIS premieres tentatives soient admises avant
 *     d'exiger le refus de la quatrieme.
 * (2) LE CHIFFRE 100 RECOPIE (A1, `numeric`) : la suite ne compare pas
 *     seulement un compte, mais aussi l'ENSEMBLE des identites metier avant
 *     et apres, pour qu'un `OFFSET 1`/`LIMIT 99` sur la relecture de la copie
 *     d'epreuve tombe meme s'il preservait un compte par ailleurs recalcule
 *     autrement.
 * (3) Q EN FLOTTANT (A8) : Q est lu comme `{num, den}` et compare par
 *     inequation ENTIERE (`num < den`), jamais par une comparaison
 *     decimale — cahier:L143.
 * (4) LE COUT QUI DISPARAIT AVEC LE REFUS (A7) : la suite verifie le registre
 *     de couts par une requete `psql` INDEPENDANTE, apres un verdict REJECTED,
 *     et exige D'ABORD qu'une ligne ADMISE anterieure soit lisible (controle
 *     que le registre fonctionne du tout) avant d'exiger que la ligne REJECTED
 *     le soit aussi — exactement le piege que verification/mutants/T21.json
 *     nomme (« englober le refus dans la meme transaction [...] et la
 *     rollbacker »).
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • Elle ne fait pas tourner de vrai agent de developpement ni de vrai
 *    temoin HTTP (T09) : les « soumissions » sont des verdicts d'oracle
 *    FABRIQUES directement en entree — T21 porte sur l'ADMISSION d'une
 *    livraison deja evaluee (T20), pas sur l'evaluation elle-meme.
 *  • Elle ne juge pas Temporal, Docker ni un SDK fournisseur (cahier C) : les
 *    trois fonctions sont appelees directement, en processus.
 *  • Elle ne prouve pas l'« idempotence » complete de la reprise (« reprise
 *    idempotente », L343) au-dela du cas de panne A6 : rejouer deux fois un
 *    meme evenement de bascule identique reste hors du perimetre de cette
 *    suite, deja couvert par l'esprit de acceptance/T05.spec.ts (A3/A4).
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 180_000;

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

const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

async function essayer<T>(
  thunk: () => T | Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

const RUN = `t21_${process.pid.toString(36)}_${Date.now().toString(36)}`;
let COMPTEUR = 0;
function nomUnique(suffixe: string): string {
  COMPTEUR += 1;
  return `${RUN}_${COMPTEUR}_${suffixe}`;
}

/* ────────────────────────── fixture de reference (racine gelee, L139) ──── */

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

const REGRESSION = readReference('F-REGRESSION');
const RS = (chemin: string): string => String(refValue(REGRESSION, chemin));
const RN = (chemin: string): number => Number(refValue(REGRESSION, chemin));
const RB = (chemin: string): boolean => Boolean(refValue(REGRESSION, chemin));

const CANCEL_V1 = RS('valeurs.exigence_remplacee.id.valeur'); // "cancel@1"
const CANCEL_V2 = RS('valeurs.exigence_remplacee.remplacee_par.valeur'); // "cancel@2"
const CANCEL_SATISFAITE_EN = RS('valeurs.exigence_remplacee.satisfaite_en.valeur'); // "P2"
const CANCEL_REMPLACEE_EN = RS('valeurs.exigence_remplacee.remplacee_en.valeur'); // "P3"
const CANCEL_PRODUIT_REGRESSION = RB('valeurs.exigence_remplacee.produit_une_regression.valeur'); // false

const ISOLATION_V1 = RS('valeurs.exigence_violee.id.valeur'); // "isolation@1"
const ISOLATION_SATISFAITE_EN = RS('valeurs.exigence_violee.satisfaite_en.valeur'); // "P3"
const ISOLATION_VIOLEE_EN = RS('valeurs.exigence_violee.violee_en.valeur'); // "P4"
const ISOLATION_PRODUIT_REGRESSION = RB('valeurs.exigence_violee.produit_une_regression.valeur'); // true

const REGRESSIONS_ATTENDUES = RN('valeurs.regressions_attendues.valeur'); // 1

/** "cancel@1" -> { id: "cancel", version: 1 }. Format de la reference (§I). */
function scinderCle(cle: string): { id: string; version: number } {
  const m = /^(.+)@(\d+)$/.exec(cle);
  expect(m !== null ? 'cle-valide' : `CLE-REFERENCE-ILLISIBLE ${cle}`).toBe('cle-valide');
  const mm = m as RegExpExecArray;
  return { id: mm[1], version: Number(mm[2]) };
}

/** Numero de periode "P3" -> 3, tel qu'ecrit par la reference. */
function periodeDe(p: string): number {
  const m = /^P(\d+)$/.exec(p);
  expect(m !== null ? 'periode-valide' : `PERIODE-REFERENCE-ILLISIBLE ${p}`).toBe('periode-valide');
  return Number((m as RegExpExecArray)[1]);
}

/* ── les trois litteraux que §F ne scelle pas pour T21, releves au cahier ── */

const MIGRATION_RECORDS = 100; // cahier:L341 — « migration correcte conserve 100 »
const MIGRATION_REJECTED = 'MIGRATION_REJECTED'; // cahier:L341, verbatim
const SUBMISSION_LIMIT = 'SUBMISSION_LIMIT'; // cahier:L341, verbatim
const SUBMISSION_LIMIT_ATTEMPTS = 3; // cahier:L341 — « limite de trois »
const DEPLOYMENT_COVERAGE = {
  NO_DEPLOYMENT: 'NO_DEPLOYMENT', // cahier:L97
  PARTIAL: 'PARTIAL', // cahier:L97
  ACCEPTED: 'ACCEPTED', // cahier:L97
} as const;

/* ══════════════════════════════ PostgreSQL reel (cahier:L141) ══════════ */

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

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
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

const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();

const BASES_CREEES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 300)}`).toBe(
    'base-creee',
  );
  BASES_CREEES.push(nom);
  return nom;
}

/** Seme `n` enregistrements metier abstraits — l'« ENTREE » des cas de migration. */
function semerEnregistrements(db: string, n: number, prefixe: string): string[] {
  const r1 = psql(db, 'CREATE TABLE demo_business (id text PRIMARY KEY)');
  expect(r1.ok ? 'table-creee' : `TABLE-DEMO-EN-ECHEC ${court(r1.out, 300)}`).toBe('table-creee');
  const ids = Array.from({ length: n }, (_, i) => `${prefixe}-${String(i).padStart(4, '0')}`);
  const valeurs = ids.map((id) => `('${id}')`).join(',');
  const r2 = psql(db, `INSERT INTO demo_business(id) VALUES ${valeurs}`);
  expect(r2.ok ? 'enregistrements-semes' : `SEMIS-EN-ECHEC ${court(r2.out, 300)}`).toBe(
    'enregistrements-semes',
  );
  return ids;
}

function lireIdentites(db: string): string[] {
  const r = psql(db, 'SELECT id FROM demo_business ORDER BY id');
  return r.ok
    ? r.out.split('\n').map((s) => s.trim()).filter((s) => s !== '')
    : [`PSQL-EN-ECHEC:${r.out}`];
}

function colonneExiste(db: string, table: string, colonne: string): boolean {
  const r = psql(
    db,
    `SELECT count(*) FROM information_schema.columns WHERE table_name='${table}' AND column_name='${colonne}'`,
  );
  return r.ok && r.out.trim() === '1';
}

/** Lit le cout d'une ligne du registre `ledger_entries` (schema FIXE par §III.1). */
function lireCoutLedger(db: string, trajectoryId: string, attempt: number): number | null {
  const r = psql(
    db,
    `SELECT cost FROM ledger_entries WHERE trajectory_id='${trajectoryId}' AND attempt=${String(attempt)}`,
  );
  if (!r.ok || r.out.trim() === '') return null;
  const n = Number(r.out.trim().split('\n')[0]);
  return Number.isFinite(n) ? n : null;
}

/* ══════════════════════ chargement des trois source_paths de T21 ═══════ */

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
  } else {
    // Paquet pas encore materialise (packages/activities avant implementation) :
    // le nom conventionnel `@bench/<pkg>` reste tente, jest.config.mjs le
    // reecrit generiquement vers packages/<pkg>/src/index.ts.
    out.push(`@bench/${pkg}`);
  }
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

/** LE SUJET : les trois source_paths de T21, et rien d'autre. */
function specifiersDuSujet(): string[] {
  return [
    ...specifiersForPackage('evaluation'),
    ...specifiersForPackage('domain'),
    ...specifiersForPackage('activities'),
  ];
}

async function charger(specs: string[], quoi: string): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  if (specs.length === 0) attempts.push(`aucun point d'entree ${quoi}`);
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
  LOADED = await charger(
    specifiersDuSujet(),
    "sous packages/evaluation, packages/domain ni packages/activities (les trois source_paths de T21)",
  );
}, CASE_TIMEOUT_MS);

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `SUJET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ─────────────────────────────────────────────── resolution par role */

type Fonction = (...a: unknown[]) => unknown;

const ROLES: Record<string, readonly string[]> = {
  admitDelivery: [
    'admitDelivery',
    'admitSubmission',
    'submitDelivery',
    'evaluateDeliveryAdmission',
    'admitCandidateDelivery',
    'processDelivery',
    'admitSubmittedDelivery',
  ],
  runProtectedMigration: [
    'runProtectedMigration',
    'protectedMigration',
    'migrateWithProtection',
    'runMigrationWithCompatibilityCheck',
    'applyProtectedMigration',
    'runGuardedMigration',
    'validateAndApplyMigration',
  ],
  resumeDeploymentSwitch: [
    'resumeDeploymentSwitch',
    'resumeSwitchover',
    'recoverDeploymentSwitch',
    'resumeVersionSwitch',
    'reconcileActiveVersion',
    'resumeDeployment',
    'recoverActiveVersion',
  ],
};

const RESOLVED = new Map<string, Fonction | null>();

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role];
  if (candidats === undefined) throw new Error(`role inconnu de la suite : ${role}`);
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

function requireRole(name: string): Fonction {
  const fn = resolveOpt(name);
  expect(
    fn !== null ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${ROLES[name]?.join(', ') ?? ''})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fonction;
}

async function appeler(
  role: string,
  ...args: unknown[]
): Promise<{ ok: true; value: unknown } | { ok: false; err: unknown }> {
  const fn = requireRole(role);
  return essayer(() => fn(...args));
}

/* ═══════════════════════ formes fixees par cette suite (§III) ══════════ */

interface DueRequirement {
  id: string;
  version: number;
  weight: number;
  prior_satisfied: boolean;
}

interface AdmitDeliveryResult {
  verdict: string;
  reason?: string;
  deployment_coverage: string;
  backlog: Array<{ id: string; version: number }>;
  q: { num: number; den: number } | null;
}

function assertAdmitShape(v: unknown, contexte: string): AdmitDeliveryResult {
  const o = v as Json | null;
  const okVerdict = typeof o?.verdict === 'string';
  const okCoverage = typeof o?.deployment_coverage === 'string';
  const okBacklog = Array.isArray(o?.backlog);
  expect(
    okVerdict && okCoverage && okBacklog
      ? `resultat-${contexte}-conforme`
      : `RESULTAT-NON-CONFORME ${contexte} verdict=${rendu(o?.verdict)} ` +
          `deployment_coverage=${rendu(o?.deployment_coverage)} backlog=${rendu(o?.backlog)} : ${court(rendu(v))}`,
  ).toBe(`resultat-${contexte}-conforme`);
  return v as AdmitDeliveryResult;
}

interface MigrationResult {
  verdict: string;
  reason?: string;
  record_count_before: number;
  record_count_after: number;
}

function assertMigrationShape(v: unknown, contexte: string): MigrationResult {
  const o = v as Json | null;
  const okVerdict = typeof o?.verdict === 'string';
  const okBefore = typeof o?.record_count_before === 'number';
  const okAfter = typeof o?.record_count_after === 'number';
  expect(
    okVerdict && okBefore && okAfter
      ? `resultat-${contexte}-conforme`
      : `RESULTAT-NON-CONFORME ${contexte} verdict=${rendu(o?.verdict)} ` +
          `record_count_before=${rendu(o?.record_count_before)} record_count_after=${rendu(o?.record_count_after)} : ${court(rendu(v))}`,
  ).toBe(`resultat-${contexte}-conforme`);
  return v as MigrationResult;
}

/** Un « code » de refus, cherche parmi les noms de champs usuels — la VALEUR
 * exacte, elle, est fixee par le cahier (MIGRATION_REJECTED, SUBMISSION_LIMIT)
 * et comparee au mot pres, jamais par sous-chaine tolerante. */
function codeDe(o: Json): string | null {
  for (const champ of ['reason', 'code', 'error_code', 'motif', 'verdict']) {
    const v = o[champ];
    if (typeof v === 'string') return v;
  }
  return null;
}

function contientBacklog(backlog: Array<{ id: string; version: number }>, id: string, version: number): boolean {
  return backlog.some((b) => b.id === id && b.version === version);
}

/* ══════════════════════════════════════════════════════════════════ cas ═ */

describe('T21 — admettre les livraisons et proteger les migrations', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T21.A1 — migration correcte conserve 100 enregistrements metier',
    async () => {
      assertLoaded();
      requireRole('runProtectedMigration');

      const db = creerBase('a1');
      const attendues = semerEnregistrements(db, MIGRATION_RECORDS, 'r'); // cahier:L341
      expect(attendues.length).toBe(MIGRATION_RECORDS); // cahier:L341

      const res = await appeler('runProtectedMigration', {
        from_dsn: dsnFor(db),
        read_identities_sql: 'SELECT id FROM demo_business',
        // Migration CORRECTE : ne supprime ni ne duplique aucune ligne.
        migration_sql: 'ALTER TABLE demo_business ADD COLUMN migrated boolean DEFAULT true',
      });
      expect(
        res.ok ? 'migration-executee' : `MIGRATION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`,
      ).toBe('migration-executee');
      const r = assertMigrationShape((res as { ok: true; value: unknown }).value, 'A1');

      expect(r.verdict).toBe('MIGRATED');
      expect(r.record_count_before).toBe(MIGRATION_RECORDS); // cahier:L341
      expect(r.record_count_after).toBe(MIGRATION_RECORDS); // cahier:L341

      // CONTROLE INDEPENDANT : la vraie base porte bien les 100 identites ET
      // la migration a REELLEMENT ete appliquee (colonne presente) — pas
      // seulement un rapport optimiste sans effet reel.
      const identitesApres = lireIdentites(db);
      expect([...identitesApres].sort()).toEqual([...attendues].sort()); // cahier:L341
      expect(
        colonneExiste(db, 'demo_business', 'migrated')
          ? 'migration-reellement-appliquee'
          : 'MIGRATION-NON-APPLIQUEE-POUR-DE-VRAI',
      ).toBe('migration-reellement-appliquee');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T21.A2 — migration perdant un enregistrement donne MIGRATION_REJECTED, version active inchangee',
    async () => {
      assertLoaded();
      requireRole('runProtectedMigration');

      const db = creerBase('a2');
      const attendues = semerEnregistrements(db, MIGRATION_RECORDS, 'r'); // cahier:L341

      // CONTROLE POSITIF (le mecanisme peut reellement aboutir) : une
      // migration correcte, sur CE MEME jeu, est acceptee.
      const controle = await appeler('runProtectedMigration', {
        from_dsn: dsnFor(db),
        read_identities_sql: 'SELECT id FROM demo_business',
        migration_sql: "UPDATE demo_business SET id = id", // no-op, preserve tout
      });
      expect(
        controle.ok
          ? 'controle-migration-executee'
          : `CONTROLE-MIGRATION-EN-ECHEC ${messageDe((controle as { err: unknown }).err)}`,
      ).toBe('controle-migration-executee');
      const rc = assertMigrationShape((controle as { ok: true; value: unknown }).value, 'A2-controle');
      expect(rc.verdict).toBe('MIGRATED');

      // CAS REEL : la migration supprime EXACTEMENT une ligne sur la copie
      // d'epreuve.
      const res = await appeler('runProtectedMigration', {
        from_dsn: dsnFor(db),
        read_identities_sql: 'SELECT id FROM demo_business',
        migration_sql: `DELETE FROM demo_business WHERE id = '${attendues[0]}'`,
      });
      expect(
        res.ok ? 'migration-executee' : `MIGRATION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`,
      ).toBe('migration-executee');
      const r = assertMigrationShape((res as { ok: true; value: unknown }).value, 'A2');

      expect(r.verdict).toBe(MIGRATION_REJECTED); // cahier:L341, verbatim
      expect(r.record_count_before).toBe(MIGRATION_RECORDS); // cahier:L341

      // La version active et SES DONNEES restent inchangees — verifie par une
      // requete INDEPENDANTE de la fonction (cahier:L341).
      const identitesFinales = lireIdentites(db);
      expect(identitesFinales.length).toBe(MIGRATION_RECORDS); // cahier:L341
      expect([...identitesFinales].sort()).toEqual([...attendues].sort()); // cahier:L341
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T21.A3 — exigence active regressee ou invariant critique viole : livraison refusee',
    async () => {
      assertLoaded();
      requireRole('admitDelivery');

      const db = creerBase('a3');
      const trajectoryId = nomUnique('traj-a3');
      const { id: isoId, version: isoVersion } = scinderCle(ISOLATION_V1);
      const periodeSatisfaite = periodeDe(ISOLATION_SATISFAITE_EN); // P3
      const periodeViolee = periodeDe(ISOLATION_VIOLEE_EN); // P4

      expect(ISOLATION_PRODUIT_REGRESSION).toBe(true); // cahier:L129

      /* ── volet regression : F-REGRESSION isolation@1 ─────────────────── */

      // CONTROLE POSITIF : isolation@1 reste satisfaite -> admise.
      const controle = await appeler('admitDelivery', {
        trajectory_id: trajectoryId,
        period_index: periodeSatisfaite,
        attempt: 1,
        due_requirements: [
          { id: isoId, version: isoVersion, weight: 1, prior_satisfied: true },
        ],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [ISOLATION_V1],
          preserved_invariant_ids: [],
          cost: 10,
        },
      });
      expect(
        controle.ok ? 'controle-execute' : `CONTROLE-EN-ECHEC ${messageDe((controle as { err: unknown }).err)}`,
      ).toBe('controle-execute');
      const rc = assertAdmitShape((controle as { ok: true; value: unknown }).value, 'A3-controle-regression');
      expect(rc.verdict).toBe('ADMITTED');

      // CAS REEL : isolation@1 devient violee (non satisfaite) alors qu'elle
      // est encore ACTIVE et DUE -> refusee.
      const res = await appeler('admitDelivery', {
        trajectory_id: trajectoryId,
        period_index: periodeViolee,
        attempt: 1,
        due_requirements: [
          { id: isoId, version: isoVersion, weight: 1, prior_satisfied: true },
        ],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [],
          preserved_invariant_ids: [],
          cost: 10,
        },
      });
      expect(res.ok ? 'admission-executee' : `ADMISSION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
        'admission-executee',
      );
      const r = assertAdmitShape((res as { ok: true; value: unknown }).value, 'A3-regression');
      expect(r.verdict).toBe('REJECTED');

      /* ── volet invariant critique ─────────────────────────────────────── */

      const invariantId = nomUnique('invariant-critique');

      // CONTROLE POSITIF : invariant preserve -> admise.
      const controleInv = await appeler('admitDelivery', {
        trajectory_id: nomUnique('traj-a3-inv'),
        period_index: 1,
        attempt: 1,
        due_requirements: [],
        critical_invariants: [invariantId],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [],
          preserved_invariant_ids: [invariantId],
          cost: 10,
        },
      });
      const rci = assertAdmitShape(
        (controleInv as { ok: true; value: unknown }).value,
        'A3-controle-invariant',
      );
      expect(rci.verdict).toBe('ADMITTED');

      // CAS REEL : invariant critique applicable, non preserve -> refusee.
      const resInv = await appeler('admitDelivery', {
        trajectory_id: nomUnique('traj-a3-inv'),
        period_index: 1,
        attempt: 1,
        due_requirements: [],
        critical_invariants: [invariantId],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [],
          preserved_invariant_ids: [],
          cost: 10,
        },
      });
      const ri = assertAdmitShape((resInv as { ok: true; value: unknown }).value, 'A3-invariant');
      expect(ri.verdict).toBe('REJECTED');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T21.A4 — exigence remplacee (F-REGRESSION cancel@1 -> cancel@2) n\'empeche pas la livraison',
    async () => {
      assertLoaded();
      requireRole('admitDelivery');

      const db = creerBase('a4');
      const { id: cancelId, version: v2 } = scinderCle(CANCEL_V2);
      expect(CANCEL_PRODUIT_REGRESSION).toBe(false); // cahier:L129
      const periodeRemplacement = periodeDe(CANCEL_REMPLACEE_EN);

      // cancel@1 est REMPLACEE : elle n'apparait plus dans due_requirements —
      // seule cancel@2 (nouvelle version active) y figure, avec
      // prior_satisfied:false puisqu'elle n'a jamais encore ete livree sous
      // cette version (cahier L129 : « compter par id/version active »).
      const res = await appeler('admitDelivery', {
        trajectory_id: nomUnique('traj-a4'),
        period_index: periodeRemplacement,
        attempt: 1,
        due_requirements: [{ id: cancelId, version: v2, weight: 1, prior_satisfied: false }],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [CANCEL_V2],
          preserved_invariant_ids: [],
          cost: 10,
        },
      });
      expect(res.ok ? 'admission-executee' : `ADMISSION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
        'admission-executee',
      );
      const r = assertAdmitShape((res as { ok: true; value: unknown }).value, 'A4');
      expect(r.verdict).toBe('ADMITTED');

      /* ── controle d'integration : exactement REGRESSIONS_ATTENDUES=1 ──── */
      // Dans UN MEME appel, cancel@2 (remplacement, satisfait) ET isolation@1
      // (active, protegee, violee) : une seule regression doit etre retenue —
      // celle d'isolation, jamais celle de cancel.
      const { id: isoId, version: isoVersion } = scinderCle(ISOLATION_V1);
      expect(REGRESSIONS_ATTENDUES).toBe(1); // cahier:L129
      const combine = await appeler('admitDelivery', {
        trajectory_id: nomUnique('traj-a4-combine'),
        period_index: periodeRemplacement,
        attempt: 1,
        due_requirements: [
          { id: cancelId, version: v2, weight: 1, prior_satisfied: false },
          { id: isoId, version: isoVersion, weight: 1, prior_satisfied: true },
        ],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [CANCEL_V2], // isolation@1 non satisfaite
          preserved_invariant_ids: [],
          cost: 10,
        },
      });
      expect(
        combine.ok ? 'combine-execute' : `COMBINE-EN-ECHEC ${messageDe((combine as { err: unknown }).err)}`,
      ).toBe('combine-execute');
      const rComb = assertAdmitShape((combine as { ok: true; value: unknown }).value, 'A4-combine');
      expect(rComb.verdict).toBe('REJECTED');
      const motif = codeDe(combine.ok ? (combine.value as Json) : {});
      expect(
        motif !== null && motif.includes(isoId)
          ? 'motif-nomme-isolation'
          : `MOTIF-NE-NOMME-PAS-ISOLATION motif=${rendu(motif)}`,
      ).toBe('motif-nomme-isolation');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T21.A5 — quatrieme soumission apres limite de trois donne SUBMISSION_LIMIT',
    async () => {
      assertLoaded();
      requireRole('admitDelivery');

      const db = creerBase('a5');
      const trajectoryId = nomUnique('traj-a5');
      const req = { id: 'req', version: 1, weight: 1, prior_satisfied: false };

      // CONTROLES POSITIFS : les TROIS premieres tentatives sont admises.
      for (let attempt = 1; attempt <= SUBMISSION_LIMIT_ATTEMPTS; attempt += 1) {
        const res = await appeler('admitDelivery', {
          trajectory_id: trajectoryId,
          period_index: 1,
          attempt,
          due_requirements: [req],
          critical_invariants: [],
          ledger_dsn: dsnFor(db),
          submission: {
            artifact_digest: nomUnique(`digest-${String(attempt)}`),
            satisfied_requirement_keys: ['req@1'],
            preserved_invariant_ids: [],
            cost: 1,
          },
        });
        expect(
          res.ok ? `tentative-${String(attempt)}-executee` : `TENTATIVE-${String(attempt)}-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`,
        ).toBe(`tentative-${String(attempt)}-executee`);
        const r = assertAdmitShape((res as { ok: true; value: unknown }).value, `A5-tentative-${String(attempt)}`);
        expect(
          r.verdict === 'ADMITTED'
            ? `tentative-${String(attempt)}-admise`
            : `TENTATIVE-${String(attempt)}-REFUSEE-A-TORT verdict=${r.verdict} reason=${rendu(r.reason)}`,
        ).toBe(`tentative-${String(attempt)}-admise`);
      }

      // CAS REEL : la quatrieme tentative est refusee, EXACTEMENT avec
      // SUBMISSION_LIMIT (cahier:L341, verbatim).
      const res4 = await appeler('admitDelivery', {
        trajectory_id: trajectoryId,
        period_index: 1,
        attempt: SUBMISSION_LIMIT_ATTEMPTS + 1,
        due_requirements: [req],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest-4'),
          satisfied_requirement_keys: ['req@1'],
          preserved_invariant_ids: [],
          cost: 1,
        },
      });
      expect(
        res4.ok ? 'quatrieme-tentative-executee' : `QUATRIEME-TENTATIVE-EN-ECHEC ${messageDe((res4 as { err: unknown }).err)}`,
      ).toBe('quatrieme-tentative-executee');
      const r4 = assertAdmitShape((res4 as { ok: true; value: unknown }).value, 'A5-quatrieme');
      expect(r4.verdict).toBe('REJECTED');
      expect(codeDe(res4.ok ? (res4.value as Json) : {})).toBe(SUBMISSION_LIMIT); // cahier:L341, verbatim
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T21.A6 — panne entre preparation et bascule : une seule version active coherente',
    async () => {
      assertLoaded();
      requireRole('resumeDeploymentSwitch');

      const activeAvant = nomUnique('version-active');
      const preparee = nomUnique('version-preparee');

      // Panne APRES que la bascule ait ete rendue DURABLE : la nouvelle
      // version l'emporte, l'ancienne est abandonnee.
      const resApres = await appeler('resumeDeploymentSwitch', {
        active_version_id: activeAvant,
        prepared_version_id: preparee,
        switch_committed: true,
      });
      expect(
        resApres.ok ? 'reprise-executee' : `REPRISE-EN-ECHEC ${messageDe((resApres as { err: unknown }).err)}`,
      ).toBe('reprise-executee');
      const vApres = resApres.ok ? (resApres.value as Json).active_version_id : undefined;
      expect(
        vApres === preparee
          ? 'bascule-finalisee'
          : `BASCULE-NON-FINALISEE active_version_id=${rendu(vApres)} attendu=${rendu(preparee)}`,
      ).toBe('bascule-finalisee');

      // Panne AVANT que la bascule n'ait ete rendue durable : retour a
      // l'ancienne version, la preparee est abandonnee.
      const resAvant = await appeler('resumeDeploymentSwitch', {
        active_version_id: activeAvant,
        prepared_version_id: preparee,
        switch_committed: false,
      });
      expect(
        resAvant.ok ? 'reprise-executee' : `REPRISE-EN-ECHEC ${messageDe((resAvant as { err: unknown }).err)}`,
      ).toBe('reprise-executee');
      const vAvant = resAvant.ok ? (resAvant.value as Json).active_version_id : undefined;
      expect(
        vAvant === activeAvant
          ? 'bascule-annulee'
          : `BASCULE-NON-ANNULEE active_version_id=${rendu(vAvant)} attendu=${rendu(activeAvant)}`,
      ).toBe('bascule-annulee');

      // UNE SEULE version active coherente dans les deux cas : ni les deux a
      // la fois, ni une troisieme valeur, ni absence.
      for (const v of [vApres, vAvant]) {
        expect(
          v === activeAvant || v === preparee
            ? 'version-active-unique-et-coherente'
            : `VERSION-ACTIVE-INCOHERENTE ${rendu(v)} (attendu l'un de [${activeAvant}, ${preparee}])`,
        ).toBe('version-active-unique-et-coherente');
      }
      expect(vApres === vAvant ? `LES-DEUX-REPRISES-CONVERGENT-A-TORT ${rendu(vApres)}` : 'reprises-distinctes').toBe(
        'reprises-distinctes',
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A7 */
  test(
    'T21.A7 — couts des refus conserves au registre',
    async () => {
      assertLoaded();
      requireRole('admitDelivery');

      const db = creerBase('a7');
      const trajectoryId = nomUnique('traj-a7');
      const coutAdmis = 4242;
      const coutRefuse = 1357;

      // CONTROLE POSITIF : le registre fonctionne du tout, sur une soumission
      // ADMISE (sans quoi une transaction qui annule TOUJOURS rendrait ce cas
      // vert par accident — verification/mutants/T21.json).
      const admis = await appeler('admitDelivery', {
        trajectory_id: trajectoryId,
        period_index: 1,
        attempt: 1,
        due_requirements: [],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [],
          preserved_invariant_ids: [],
          cost: coutAdmis,
        },
      });
      const rAdmis = assertAdmitShape((admis as { ok: true; value: unknown }).value, 'A7-admis');
      expect(rAdmis.verdict).toBe('ADMITTED');
      const lu1 = lireCoutLedger(db, trajectoryId, 1);
      expect(
        lu1 === coutAdmis
          ? 'cout-admis-enregistre'
          : `COUT-ADMIS-NON-ENREGISTRE lu=${rendu(lu1)} attendu=${String(coutAdmis)}`,
      ).toBe('cout-admis-enregistre');

      // CAS REEL : une soumission REFUSEE (regression forcee) conserve
      // NEANMOINS son cout au registre (cahier D5 : « un echec conserve ses
      // depenses »).
      const refuse = await appeler('admitDelivery', {
        trajectory_id: trajectoryId,
        period_index: 2,
        attempt: 2,
        due_requirements: [{ id: 'protegee', version: 1, weight: 1, prior_satisfied: true }],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: [], // regression : "protegee@1" non satisfaite
          preserved_invariant_ids: [],
          cost: coutRefuse,
        },
      });
      const rRefuse = assertAdmitShape((refuse as { ok: true; value: unknown }).value, 'A7-refuse');
      expect(rRefuse.verdict).toBe('REJECTED');
      const lu2 = lireCoutLedger(db, trajectoryId, 2);
      expect(
        lu2 === coutRefuse
          ? 'cout-refuse-conserve'
          : `COUT-REFUSE-NON-CONSERVE lu=${rendu(lu2)} attendu=${String(coutRefuse)}`,
      ).toBe('cout-refuse-conserve'); // cahier D5 (L65)
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A8 */
  test(
    'T21.A8 — deploiement partiel admis, exigence restante au backlog, Q < 1',
    async () => {
      assertLoaded();
      requireRole('admitDelivery');

      const db = creerBase('a8');

      // Deux exigences NOUVELLES dues (X, Y) — jamais encore satisfaites —
      // plus une exigence deja ACTIVE et PROTEGEE (Z), qui reste satisfaite.
      // Une seule des deux nouvelles (X) est revendiquee et livree.
      const res = await appeler('admitDelivery', {
        trajectory_id: nomUnique('traj-a8'),
        period_index: 3,
        attempt: 1,
        due_requirements: [
          { id: 'X', version: 1, weight: 1, prior_satisfied: false },
          { id: 'Y', version: 1, weight: 1, prior_satisfied: false },
          { id: 'Z', version: 1, weight: 1, prior_satisfied: true },
        ],
        critical_invariants: [],
        ledger_dsn: dsnFor(db),
        submission: {
          artifact_digest: nomUnique('digest'),
          satisfied_requirement_keys: ['X@1', 'Z@1'], // Y non revendiquee
          preserved_invariant_ids: [],
          cost: 10,
        },
      });
      expect(res.ok ? 'admission-executee' : `ADMISSION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
        'admission-executee',
      );
      const r = assertAdmitShape((res as { ok: true; value: unknown }).value, 'A8');

      // (1) deploiement partiel admis — la soumission n'est PAS refusee, Y
      //     n'etant ni protegee ni un invariant critique.
      expect(r.verdict).toBe('ADMITTED');
      expect(r.deployment_coverage).toBe(DEPLOYMENT_COVERAGE.PARTIAL); // cahier:L97

      // (2) l'exigence restante (Y) est au backlog — ni X ni Z, qui sont
      //     satisfaites.
      expect(
        contientBacklog(r.backlog, 'Y', 1) ? 'Y-au-backlog' : `Y-ABSENT-DU-BACKLOG ${rendu(r.backlog)}`,
      ).toBe('Y-au-backlog');
      expect(
        !contientBacklog(r.backlog, 'X', 1) && !contientBacklog(r.backlog, 'Z', 1)
          ? 'X-et-Z-absents-du-backlog'
          : `X-OU-Z-A-TORT-AU-BACKLOG ${rendu(r.backlog)}`,
      ).toBe('X-et-Z-absents-du-backlog');

      // (3) Q < 1 — compare en ENTIERS (num/den), jamais en flottant
      //     (cahier:L143). Ici : 2 exigences dues satisfaites (X, Z) sur 3
      //     exigences dues (X, Y, Z), toutes de poids 1.
      expect(r.q !== null ? 'q-non-nul' : `Q-NUL-A-TORT ${rendu(r.q)}`).toBe('q-non-nul');
      const q = r.q as { num: number; den: number };
      expect(Number.isInteger(q.num) && Number.isInteger(q.den) && q.den > 0 ? 'q-rationnel-bien-forme' : `Q-MAL-FORME ${rendu(q)}`).toBe(
        'q-rationnel-bien-forme',
      );
      expect(q.num < q.den ? 'Q-inferieur-a-1' : `Q-NON-INFERIEUR-A-1 ${rendu(q)}`).toBe('Q-inferieur-a-1'); // cahier:L341 « Q inferieur a 1 »
    },
    CASE_TIMEOUT_MS,
  );
});
