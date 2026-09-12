/**
 * acceptance/T09.spec.ts — suite d'acceptation de la tache T09.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T09.A1 behaviour — le temoin CONFORME realise F-RESERVATION (P1..P4) sur
 *                      un PostgreSQL reel
 *   T09.A2 refusal   — double reservation concurrente liberee par une BARRIERE
 *                      ne depasse pas la capacite
 *   T09.A3 numeric   — la migration P4 preserve 100 reservations et les
 *                      rattache a `legacy`
 *   T09.A4 refusal   — le temoin `drop-one-row` perd EXACTEMENT une
 *                      reservation et est DISTINGUABLE de l'etat attendu
 *   T09.A5 behaviour — la restauration d'un export metier retrouve les memes
 *                      faits sans exiger un schema SQL identique
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T09 — `fixtures` et `infra`. ADR-001 :
 * cet aveuglement est PROCEDURAL, donc une discipline auditable au diff, pas
 * une barriere technique. Le contrat teste ci-dessous n'a pas ete releve dans
 * l'implementation ; il est derive de docs/specs/T09.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle :
 *
 *   L229  livrables : « quatre versions d'une petite API de reservation, base
 *         PostgreSQL applicative, contrat HTTP public et fixtures fautives
 *         nommees »
 *   L231  travail : « exposer des operations metier et une exportation
 *         canonique controlee. Les migrations portent sur les donnees
 *         REELLEMENT CREEES aux periodes precedentes. »
 *   L233  les cinq cas d'acceptation, mot pour mot — dont les deux seuls
 *         litteraux que §F ne scelle pas : le nombre `100` et le nom
 *         `drop-one-row`
 *   L235  fin : « tests sur PostgreSQL REEL, images temoins identifiees par
 *         DIGEST et resultats oracle independants »
 *   L119  F-RESERVATION : horloge initiale, acteurs A/B/C, locataire `legacy`,
 *         creneau S1 de capacite 1 debutant 2030-01-03T12:00:00Z, P1..P4, et
 *         « evaluer l'etat metier EXPORTE, pas un nom de table impose »
 *   L123  probes de frontiere P3 = clones JETABLES ; etat persistant a
 *         l'entree de P4 ; FIFO ordonne par SEQUENCE D'ADMISSION EXPLICITE ;
 *         le contrat intertenant rend `NOT_FOUND` sans donnee divulguee
 *   L125  horloges des quatre periodes
 *   L135  « l'heure et la duree sont des metadonnees volatiles, exclues de la
 *         comparaison canonique des resultats metier »
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         BARRIERES et points d'injection nommes. [...] Les checks
 *         d'integration utilisent REELLEMENT PostgreSQL »
 *   L559  chaque suite d'integration recoit un `test_run_id` technique unique,
 *         ses bases/schemas ; « les comparaisons canonisent uniquement les ids
 *         de lancement et metadonnees explicitement volatiles »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des deux sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/F-RESERVATION.json` — racine gelee,
 *       docs/FROZEN_ROOTS.json. C'est le cas de TOUS les instants metier, de
 *       la capacite du creneau, des acteurs, du locataire `legacy`, de l'ordre
 *       d'attente attendu, des comptes attendus et de tous les statuts.
 *   (b) un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p'
 *       docs/cahier.md`. Trois valeurs seulement sont dans ce cas, et §F dit
 *       explicitement ne pas les fixer (`non_fixe_par_le_cahier`,
 *       `ambiguites_reportees.AMB-RESERVATION-1`) :
 *         100            — L233, « migration P4 preserve 100 reservations »
 *         1              — L233, « perd EXACTEMENT une reservation »
 *         `drop-one-row` — L233, le nom de la fixture fautive
 *         4              — L229, « quatre versions »
 *         `other`        — L119, le locataire cree en P4
 *         `NOT_FOUND`    — L123, le verdict intertenant
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * les cles d'idempotence, les numeros de sequence d'admission, les noms de
 * bases du `test_run_id` et les identifiants du jeu de 100 reservations : ce
 * sont des ENTREES de la suite, jamais des valeurs attendues.
 *
 * CONTROLE DE LA REFERENCE ELLE-MEME. A1 exige que `debut - frontiere` vaille
 * exactement `delai_heures` heures. Si la racine gelee se contredisait, c'est
 * elle qui tomberait, et le message le dit.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T09 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Les temoins sont des PROGRAMMES, pas des fonctions : ils parlent HTTP et
 * ecrivent dans une base PostgreSQL applicative. La suite a donc besoin d'un
 * point d'entree pour les DEMARRER. Il est cherche, dans l'ordre, sous
 * `fixtures/temoins/`, `fixtures/witnesses/`, `fixtures/`, `infra/temoins/`,
 * `infra/witnesses/` (index.mjs, index.js, index.ts, src/index.*) — les deux
 * `source_paths` que le registre declare pour T09, et rien d'autre.
 *
 * TROIS ROLES, nommes par leur FONCTION et resolus par une courte liste
 * d'alias documentee. Les alias sont une tolerance de NOMMAGE, jamais de
 * COMPORTEMENT. Si aucun nom ne repond, la suite echoue par une ASSERTION qui
 * nomme le role et la liste attendue — jamais par un import casse, que
 * verification/runner/red.mjs classe MODULE_NOT_FOUND et refuse comme preuve.
 *
 *   listWitnesses()        -> catalogue des temoins                     (L229)
 *   startWitness(options)  -> demarre un temoin, rend un handle         (L229)
 *   compareBusinessState(observe, attendu) -> verdict de conformite     (L235)
 *
 * QUATRE CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC
 * FIXEES ICI (elles sont reprises telles quelles dans
 * verification/mutants/T09.json) :
 *
 *   1. CATALOGUE. `listWitnesses()` rend une liste d'entrees PLATES :
 *        { name, conforming, digest }
 *      `name` est le nom de la fixture — `drop-one-row` est impose par L233 ;
 *      `conforming` distingue le temoin CONFORME des fixtures FAUTIVES ;
 *      `digest` est l'identification par empreinte exigee par L235. La suite
 *      n'impose aucun nom au temoin conforme : elle prend l'unique entree
 *      `conforming === true`.
 *
 *   2. DEMARRAGE. `startWitness({ witness, version, dsn })` — objet PLAT et
 *      STRICT (L80 : proprietes inconnues rejetees). `version` est un entier
 *      de 1 a 4 : la version k est l'application de la periode k, puisque
 *      « les migrations portent sur les donnees reellement creees aux
 *      periodes precedentes » (L231). `dsn` est l'URI libpq d'une base que la
 *      SUITE a creee — c'est le `test_run_id` de L559.
 *      DEMARRER LA VERSION k SUR UNE BASE QUI PORTE LES DONNEES DE LA VERSION
 *      j < k APPLIQUE LES MIGRATIONS CONNUES j -> k. C'est le seul mecanisme
 *      de migration que la suite connait, et c'est celui qu'A3 mesure.
 *      Le handle rendu porte `baseUrl` (contrat HTTP public), `digest`, et
 *      `stop()`.
 *
 *   3. CONTRAT HTTP PUBLIC. Cinq operations metier. Leur route est DECLAREE
 *      par le temoin (`handle.http` ou l'entree de catalogue), sous la forme
 *      { operation: { method, path } } ou { operation: "POST /chemin" } ; a
 *      defaut de declaration, la suite emploie les routes conventionnelles
 *      ci-dessous. C'est la meme tolerance que les alias d'export : le nom de
 *      la route est libre, l'OPERATION ne l'est pas.
 *        declare_slot  POST /slots          { tenant, slot, capacity, starts_at }
 *        reserve       POST /reservations   { tenant, actor, slot, at, sequence, idempotency_key }
 *        cancel        POST /cancellations  { tenant, actor, slot, at, sequence, idempotency_key }
 *        export        GET  /export         ?tenant=&actor=
 *        import        POST /import         <le document rendu par export>
 *      `export` est l'« exportation canonique CONTROLEE » de L231 : controlee
 *      veut dire que la vue servie depend du couple (tenant, actor) demande —
 *      c'est par elle que le contrat intertenant de P4 s'observe.
 *
 *   4. REFUS. Un refus METIER est un statut HTTP 4xx, ou un 2xx dont le corps
 *      porte un signal de refus (`ok:false`, `errors:[...]`, un champ de code).
 *      Un 5xx, une connexion refusee ou un corps illisible sont des PLANTAGES,
 *      pas des refus : A2 et A4 l'exigent explicitement.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES TROIS DANGERS PROPRES A T09.
 *
 * (1) LES CAS DE REFUS QU'UN STUB QUI LEVE REND VERTS. A2 et A4 sont classes
 *     `refusal` : « un stub qui leve rend ce cas VERT sans rien prouver » —
 *     zero reservation ne depasse jamais la capacite, et un programme mort
 *     differe toujours de l'etat attendu. Chacun porte donc son CONTROLE
 *     POSITIF dans le MEME cas : A2 exige qu'EXACTEMENT UNE des deux demandes
 *     concurrentes soit ACCEPTEE et confirmee ; A4 exige que deux executions
 *     INDEPENDANTES du temoin conforme soient declarees CONFORMES par le meme
 *     comparateur avant d'exiger que `drop-one-row` soit rejete.
 *
 * (2) LA BASE QUI N'EN EST PAS UNE. L235 impose « des tests sur PostgreSQL
 *     REEL ». Un temoin qui garderait son etat en memoire satisferait tous les
 *     enonces metier. A1 le refuse en ARRETANT le processus entre chaque
 *     periode et en reprojetant l'etat apres redemarrage : ce qui n'a pas ete
 *     ecrit dans la base applicative ne survit pas. La suite observe en outre
 *     la base par `psql`, independamment du temoin — sans jamais nommer une
 *     table, puisque L119 impose d'« evaluer l'etat metier exporte, pas un nom
 *     de table impose ».
 *
 * (3) LE CHIFFRE 100 RECOPIE. A3 est un cas `numeric` : un test qui n'encode
 *     que le litteral survit a une regle de calcul faussee. A3 ne compare donc
 *     pas seulement un compte : il compare l'ENSEMBLE des identites metier
 *     (acteur|creneau) avant et apres la migration. Un OFFSET 1 / LIMIT 99
 *     deplace le compte ET l'ensemble ; une migration qui perdrait une ligne
 *     et en dupliquerait une autre garderait le compte et perdrait l'ensemble.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • « les temoins sont des programmes de test du moteur, pas les solutions a
 *    transmettre aux candidats » (L231) est une propriete de DESTINATION du
 *    code, pas du comportement observable ici. Elle se constate au diff.
 *  • « images temoins identifiees par digest » (L235) : la suite exige que
 *    chaque temoin porte un digest, que les digests soient DISTINCTS d'une
 *    fixture a l'autre et STABLES d'un demarrage a l'autre. Elle ne recalcule
 *    pas l'empreinte d'une image OCI : ce serait mesurer le format de
 *    l'artefact, pas l'identification du temoin.
 *  • Le nombre de reservations existant avant la migration P4 n'est PAS fixe
 *    par §F (`non_fixe_par_le_cahier`). Les 100 d'A3 sont le jeu de donnees de
 *    T09, cree par la suite elle-meme a travers les operations metier — et non
 *    une fixture posee directement en base, ce que L231 interdit en exigeant
 *    que « les migrations portent sur les donnees reellement creees aux
 *    periodes precedentes ».
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 300_000;

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

/** Rendu TEXTUEL PROFOND. Traverse Map/Set, exclut les piles d'exception. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 10) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'symbol') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
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

/* ────────────────────── fixture de reference (racine gelee, L139) */

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

const RESERVATION = readReference('F-RESERVATION');
const S = (chemin: string): string => String(refValue(RESERVATION, chemin));
const N = (chemin: string): number => Number(refValue(RESERVATION, chemin));

/* ── les valeurs scellees de F-RESERVATION, et rien d'autre ─────────────── */

const ACTEURS = (refValue(RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
const [ACTEUR_A, ACTEUR_B, ACTEUR_C] = ACTEURS as [string, string, string];
const LOCATAIRE = S('valeurs.locataire_initial.valeur');
const CRENEAU_ID = S('valeurs.creneau.id.valeur');
const CAPACITE = N('valeurs.creneau.capacite.valeur');
const DEBUT = S('valeurs.creneau.debut.valeur');

const P1_H = S('valeurs.horloges_des_periodes.P1.valeur');
const P2_H = S('valeurs.horloges_des_periodes.P2.valeur');
const P3_H = S('valeurs.horloges_des_periodes.P3.valeur');
const P4_H = S('valeurs.horloges_des_periodes.P4.valeur');

const P1_CONFIRMEES = N('valeurs.P1.etat_attendu.confirmees.valeur');
const P1_TITULAIRE = S('valeurs.P1.etat_attendu.titulaire.valeur');
const P1_DOUBLONS = N('valeurs.P1.etat_attendu.doublons.valeur');
const P1_SURBOOKING = refValue(RESERVATION, 'valeurs.P1.etat_attendu.surbooking.valeur') as boolean;

const P2_ORDRE_ATTENTE = (
  refValue(RESERVATION, 'valeurs.P2.ordre_d_attente.valeur') as unknown[]
).map(String);

const DELAI_HEURES = N('valeurs.P3.delai_heures.valeur');
const FRONTIERE_INCLUSE = refValue(RESERVATION, 'valeurs.P3.frontiere_incluse.valeur') as boolean;
const FRONTIERE = S('valeurs.P3.frontiere.valeur');
const PROBE1_ACTEUR = S('valeurs.P3.probes.clone_1_frontiere_exacte.acteur.valeur');
const PROBE1_INSTANT = S('valeurs.P3.probes.clone_1_frontiere_exacte.instant.valeur');
const PROBE2_ACTEUR = S('valeurs.P3.probes.clone_2_frontiere_plus_1ms.acteur.valeur');
const PROBE2_INSTANT = S('valeurs.P3.probes.clone_2_frontiere_plus_1ms.instant.valeur');

const P4_ENTREE_A = S('valeurs.P4.etat_persistant_a_l_entree.A.valeur');
const P4_ENTREE_B = S('valeurs.P4.etat_persistant_a_l_entree.B.valeur');
const P4_ENTREE_C = S('valeurs.P4.etat_persistant_a_l_entree.C.valeur');
const VERDICT_INTERTENANT = S('valeurs.P4.verdict_intertenant.valeur');

/* ── les six litteraux que §F ne scelle pas, releves dans le cahier ─────── */

const CODE_NOT_FOUND = 'NOT_FOUND'; // cahier:L123
const LOCATAIRE_AUTRE = 'other'; // cahier:L119
const ACTEUR_AUTRE = 'O1'; // ENTREE de la suite : §F dit « ses acteurs » sans en nommer aucun
const TEMOIN_FAUTIF = 'drop-one-row'; // cahier:L233
const MIGRATION_RESERVATIONS = 100; // cahier:L233
const PERTE_ATTENDUE = 1; // cahier:L233 — « perd EXACTEMENT une reservation »
const NB_VERSIONS = 4; // cahier:L229 — « quatre versions »

/* ── statuts : le vocabulaire de la reference, normalise ────────────────── */

type Statut = 'confirme' | 'attente' | 'annule';

function statutDeLaReference(brut: string): Statut | string {
  const t = brut.toLowerCase();
  if (t.startsWith('annul')) return 'annule';
  if (t.startsWith('confirm')) return 'confirme';
  if (t.startsWith('en attente')) return 'attente';
  return `STATUT-REFERENCE-ILLISIBLE(${brut})`;
}

function statutDeLaProjection(brut: string): Statut | null {
  const t = brut.toLowerCase();
  if (/annul|cancel/.test(t)) return 'annule';
  if (/confirm|booked|reserved|held/.test(t)) return 'confirme';
  if (/attente|wait|queue|pending/.test(t)) return 'attente';
  return null;
}

/* ══════════════════════════════ PostgreSQL reel (L141, L235) ═══════════ */

/**
 * `test_run_id` technique de L559 : toutes les bases de cette execution en
 * derivent, de sorte que deux executions simultanees n'interferent pas. Il
 * n'entre dans AUCUNE assertion — c'est un namespace, pas une valeur metier.
 */
const RUN = `t09_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

/** Base de maintenance : celle qui existe forcement, pour CREATE/DROP DATABASE. */
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
  expect(r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 300)}`).toBe(
    'base-creee',
  );
  BASES_CREEES.push(nom);
  return nom;
}

/** Clone JETABLE d'une base (L123 : « les probes P3 sont des clones jetables »). */
function clonerBase(source: string, suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}" TEMPLATE "${source}"`);
  expect(r.ok ? 'clone-cree' : `CLONE-IMPOSSIBLE ${nom} <- ${source} : ${court(r.out, 300)}`).toBe(
    'clone-cree',
  );
  BASES_CREEES.push(nom);
  return nom;
}

/**
 * Empreinte du SCHEMA SQL d'une base. Sert uniquement a etablir que deux bases
 * n'ont PAS le meme schema (A5). Aucune assertion ne nomme une table : L119
 * impose d'« evaluer l'etat metier exporte, pas un nom de table impose ».
 */
function empreinteSchema(db: string): string {
  const r = psql(
    db,
    `SELECT coalesce(string_agg(x, '|' ORDER BY x), '') FROM (
       SELECT table_name || '.' || column_name || ':' || data_type AS x
       FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
     ) s`,
  );
  return r.ok ? r.out : `SCHEMA-ILLISIBLE(${court(r.out, 200)})`;
}

/** Nombre de tables applicatives, sans en nommer aucune. */
function nbTables(db: string): number {
  const r = psql(
    db,
    `SELECT count(*) FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'`,
  );
  return r.ok ? Number(r.out) : -1;
}

/* ═══════════════════════ chargement du point d'entree des temoins ══════ */

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

/**
 * Les seuls emplacements interroges sont les deux `source_paths` que
 * verification/tasks.json declare pour T09 : `fixtures` et `infra`.
 */
const RACINES = [
  'fixtures/temoins',
  'fixtures/witnesses',
  'fixtures/temoins-reservation',
  'fixtures',
  'infra/temoins',
  'infra/witnesses',
] as const;
const ENTREES = ['index.mjs', 'index.js', 'index.ts', 'src/index.mjs', 'src/index.js', 'src/index.ts'] as const;

function specificateurs(): string[] {
  const out: string[] = [];
  for (const racine of RACINES) {
    for (const entree of ENTREES) {
      const f = path.join(REPO, racine, entree);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
    }
  }
  return out;
}

async function loadHarness(): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  const specs = specificateurs();
  if (specs.length === 0) {
    attempts.push(
      `aucun point d entree sous ${RACINES.join(', ')} (cherche : ${ENTREES.join(', ')})`,
    );
  }
  for (const s of specs) {
    if (via.length > 0) break;
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
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement.
  LOADED = await loadHarness();
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(
    LOADED.ok
      ? 'charge'
      : `TEMOINS-NON-CHARGEABLES ${LOADED.attempts.join(' | ')}`,
  ).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ───────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  listWitnesses: [
    'listWitnesses',
    'witnessCatalogue',
    'witnessCatalog',
    'listTemoins',
    'catalogueTemoins',
    'catalogue',
    'catalog',
    'witnesses',
    'temoins',
    'listApplications',
  ],
  startWitness: [
    'startWitness',
    'startTemoin',
    'launchWitness',
    'runWitness',
    'bootWitness',
    'createWitness',
    'demarrerTemoin',
    'start',
    'launch',
    'run',
  ],
  compareBusinessState: [
    'compareBusinessState',
    'compareToExpected',
    'compareStates',
    'diffBusinessState',
    'diffStates',
    'checkAgainstExpected',
    'qualify',
    'comparerEtatMetier',
    'compare',
    'diff',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role];
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
          manquants.map((r) => `${r}:[${ROLES[r].join('|')}]`).join(' ; ') +
          ` (${String(LOADED.exportCount)} exports de premier niveau observes dans ` +
          `${LOADED.via.join(', ') || 'aucun module'})`,
  ).toBe('contrat-resolu');
}

/* ───────────────────────────── appel d'un role, refus compris */

const JETONS_REFUS = [
  'NOT_FOUND',
  'CONFLICT',
  'CONFLIT',
  'REFUS',
  'REJECT',
  'REJETE',
  'DENIED',
  'FORBIDDEN',
  'UNAUTHORIZED',
  'NOT_ALLOWED',
  'TOO_LATE',
  'TROP_TARD',
  'DEADLINE',
  'EXPIRED',
  'CUTOFF',
  'FULL',
  'CAPACITY',
  'OVERBOOK',
  'MISMATCH',
  'DUPLICATE',
  'INVALID',
  'VIOLATION',
  'DIVERGENCE',
  'MISSING',
  'LOST',
  'ERROR',
  'ERREUR',
] as const;

const JETONS_SUCCES = /ACCEPT|SUCCESS|CONFIRM|PROMOT|GRANT|ALLOW|CREATED|APPLIED|REPLAY|IDEMPOTENT|CONFORM/i;

const CHAMPS_CODE_SOMMET =
  /^(code|error_code|errorcode|reason|motif|refusal|refus|rejection|rejet|error|erreur|outcome|verdict|status|statut)$/i;
const CHAMPS_CODE_PROFOND =
  /^(code|error_code|errorcode|reason|motif|refusal|refus|rejection|rejet|error|erreur)$/i;

const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|fetch failed|socket hang up/;

function jetonDeRefus(s: string): string | null {
  const up = s.toUpperCase();
  if (JETONS_SUCCES.test(s)) return null;
  for (const j of JETONS_REFUS) if (up.includes(j)) return j;
  return null;
}

function codeDeRefus(v: unknown, profondeur = 0): string | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || profondeur > 2) return null;
  const o = v as Json;
  const champs = profondeur === 0 ? CHAMPS_CODE_SOMMET : CHAMPS_CODE_PROFOND;
  for (const [k, x] of Object.entries(o)) {
    if (champs.test(k) && typeof x === 'string') {
      const j = jetonDeRefus(x);
      if (j !== null) return `${k}=${x}`;
    }
  }
  for (const x of Object.values(o)) {
    const sous = codeDeRefus(x, profondeur + 1);
    if (sous !== null) return sous;
  }
  return null;
}

interface Issue {
  refuse: boolean;
  via: string;
  texte: string;
  valeur: unknown;
  leve: boolean;
}

function qualifier(brut: unknown): Issue {
  const texte = rendu(brut);
  if (brut === null || brut === undefined) {
    return { refuse: true, via: 'nullish', texte: `RENDU-VIDE ${texte}`, valeur: brut, leve: false };
  }
  if (typeof brut === 'object' && !Array.isArray(brut)) {
    const o = brut as Json;
    for (const drapeau of ['ok', 'valid', 'valide', 'success', 'accepted', 'applied', 'conforming', 'conforme']) {
      if (o[drapeau] === false) {
        return { refuse: true, via: `${drapeau}=false`, texte, valeur: brut, leve: false };
      }
    }
    for (const cle of ['errors', 'issues', 'problems', 'erreurs', 'violations', 'differences', 'diffs', 'ecarts']) {
      const v = o[cle];
      if (Array.isArray(v) && v.length > 0) {
        return { refuse: true, via: `${cle}[${String(v.length)}]`, texte, valeur: brut, leve: false };
      }
    }
    const code = codeDeRefus(brut);
    if (code !== null) return { refuse: true, via: `code:${code}`, texte, valeur: brut, leve: false };
  }
  return { refuse: false, via: 'valeur', texte, valeur: brut, leve: false };
}

async function appeler(role: string, args: unknown[]): Promise<Issue> {
  const f = resolveOpt(role);
  if (f === null) {
    return {
      refuse: true,
      via: 'contrat',
      texte: `ROLE-NON-RESOLU ${role}`,
      valeur: undefined,
      leve: false,
    };
  }
  let brut: unknown;
  try {
    brut = await Promise.resolve(f(...args));
  } catch (e) {
    return { refuse: true, via: 'exception', texte: `LEVE ${rendu(e)}`, valeur: e, leve: true };
  }
  return qualifier(brut);
}

function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(
    issue.refuse ? `REFUS-INATTENDU ${quoi} [${issue.via}] : ${court(issue.texte)}` : 'accepte',
  ).toBe('accepte');
  return issue.valeur;
}

function exigerRefuse(issue: Issue, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(issue.texte)}`).toBe('refuse');
}

function exigerRefusMetier(issue: Issue, quoi: string): void {
  exigerRefuse(issue, quoi);
  expect(
    MARQUEURS_DE_PLANTAGE.test(issue.texte)
      ? `PLANTAGE-AU-LIEU-D-UN-REFUS-METIER ${quoi} : ${court(issue.texte)}`
      : 'refus-metier',
  ).toBe('refus-metier');
}

/* ═══════════════════════════ catalogue et demarrage des temoins ════════ */

interface Entree {
  name: string;
  conforming: boolean;
  digest: string;
  brut: Json;
}

function lireCatalogue(v: unknown): Entree[] {
  const liste: unknown[] = Array.isArray(v)
    ? v
    : v !== null && typeof v === 'object'
      ? ((): unknown[] => {
          const o = v as Json;
          for (const k of ['witnesses', 'temoins', 'entries', 'items', 'catalogue', 'catalog']) {
            if (Array.isArray(o[k])) return o[k] as unknown[];
          }
          return Object.entries(o).map(([k, x]) =>
            x !== null && typeof x === 'object' ? { name: k, ...(x as Json) } : { name: k },
          );
        })()
      : [];
  const out: Entree[] = [];
  for (const e of liste) {
    if (e === null || typeof e !== 'object') continue;
    const o = e as Json;
    const name = [o.name, o.nom, o.id, o.witness, o.fixture].find((x) => typeof x === 'string');
    const digest = [o.digest, o.image_digest, o.imageDigest, o.sha256, o.empreinte].find(
      (x) => typeof x === 'string',
    );
    const conf = [o.conforming, o.conforme, o.is_conforming, o.compliant].find(
      (x) => typeof x === 'boolean',
    );
    out.push({
      name: typeof name === 'string' ? name : '',
      conforming: conf === true,
      digest: typeof digest === 'string' ? digest : '',
      brut: o,
    });
  }
  return out;
}

let CATALOGUE: Entree[] | null = null;

async function catalogue(): Promise<Entree[]> {
  if (CATALOGUE !== null) return CATALOGUE;
  const issue = await appeler('listWitnesses', []);
  CATALOGUE = lireCatalogue(exigerAccepte(issue, 'catalogue des temoins'));
  return CATALOGUE;
}

/** Le temoin CONFORME : l'unique entree `conforming === true`. */
async function nomDuTemoinConforme(): Promise<string> {
  const c = await catalogue();
  const conformes = c.filter((e) => e.conforming && e.name.length > 0);
  expect(
    conformes.length === 1
      ? 'un-seul-temoin-conforme'
      : `CATALOGUE-SANS-TEMOIN-CONFORME-UNIQUE : ${String(conformes.length)} entree(s) ` +
        `conforming=true sur ${String(c.length)} — ${rendu(c.map((e) => [e.name, e.conforming]))}`,
  ).toBe('un-seul-temoin-conforme'); // cahier:L233
  return conformes[0].name;
}

interface Handle {
  baseUrl: string;
  digest: string;
  http: Record<string, { method: string; chemin: string }>;
  brut: Json;
  stop: () => Promise<void>;
}

const HANDLES: Handle[] = [];

const ROUTES_PAR_DEFAUT: Record<string, { method: string; chemin: string }> = {
  declare_slot: { method: 'POST', chemin: '/slots' },
  reserve: { method: 'POST', chemin: '/reservations' },
  cancel: { method: 'POST', chemin: '/cancellations' },
  export: { method: 'GET', chemin: '/export' },
  import: { method: 'POST', chemin: '/import' },
};

const ALIAS_OPERATION: Record<string, readonly string[]> = {
  declare_slot: ['declare_slot', 'declareSlot', 'slots', 'slot', 'creneau', 'declarer_creneau'],
  reserve: ['reserve', 'reservations', 'reservation', 'book', 'create_reservation', 'reserver'],
  cancel: ['cancel', 'cancellations', 'cancellation', 'annuler', 'annulation'],
  export: ['export', 'exportation', 'business_export', 'state', 'etat'],
  import: ['import', 'importation', 'restore', 'restauration', 'restaurer'],
};

function lireRoutes(sources: unknown[]): Record<string, { method: string; chemin: string }> {
  const decl: Json = {};
  for (const src of sources) {
    if (src === null || typeof src !== 'object') continue;
    const o = src as Json;
    for (const k of ['http', 'routes', 'contract', 'contrat', 'operations', 'endpoints']) {
      const v = o[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [op, r] of Object.entries(v as Json)) if (decl[op] === undefined) decl[op] = r;
      }
    }
  }
  const out: Record<string, { method: string; chemin: string }> = {};
  for (const [op, alias] of Object.entries(ALIAS_OPERATION)) {
    let trouve: { method: string; chemin: string } | null = null;
    for (const a of alias) {
      const r = decl[a];
      if (typeof r === 'string') {
        const m = /^\s*([A-Za-z]+)\s+(\/\S*)\s*$/.exec(r);
        if (m) trouve = { method: m[1].toUpperCase(), chemin: m[2] };
      } else if (r !== null && typeof r === 'object') {
        const ro = r as Json;
        const method = [ro.method, ro.verb, ro.methode].find((x) => typeof x === 'string');
        const chemin = [ro.path, ro.chemin, ro.route, ro.url].find((x) => typeof x === 'string');
        if (typeof chemin === 'string') {
          trouve = {
            method: typeof method === 'string' ? method.toUpperCase() : ROUTES_PAR_DEFAUT[op].method,
            chemin,
          };
        }
      }
      if (trouve !== null) break;
    }
    out[op] = trouve ?? ROUTES_PAR_DEFAUT[op];
  }
  return out;
}

function lireHandle(v: unknown, entree: Entree | null): Handle | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Json;
  const url = [o.baseUrl, o.base_url, o.url, o.base, o.origin, o.endpoint, o.address].find(
    (x) => typeof x === 'string' && /^https?:\/\//.test(x),
  );
  if (typeof url !== 'string') return null;
  const digest = [o.digest, o.image_digest, o.imageDigest, o.sha256, o.empreinte].find(
    (x) => typeof x === 'string',
  );
  const stopFn = ['stop', 'close', 'shutdown', 'kill', 'arreter', 'dispose']
    .map((k) => o[k])
    .find((x) => typeof x === 'function') as Fonction | undefined;
  const h: Handle = {
    baseUrl: url.replace(/\/+$/, ''),
    digest: typeof digest === 'string' ? digest : (entree?.digest ?? ''),
    http: lireRoutes([o, entree?.brut]),
    brut: o,
    stop: async (): Promise<void> => {
      if (stopFn === undefined) {
        const global = resolveOpt('stopWitness');
        if (global !== null) await Promise.resolve(global(v));
        return;
      }
      await Promise.resolve(stopFn.call(o));
    },
  };
  return h;
}

async function demarrer(witness: string, version: number, db: string): Promise<Handle> {
  const entrees = CATALOGUE ?? [];
  const entree = entrees.find((e) => e.name === witness) ?? null;
  // Objet PLAT et STRICT (L80) : trois champs, aucun alias redondant.
  const issue = await appeler('startWitness', [{ witness, version, dsn: dsnFor(db) }]);
  const brut = exigerAccepte(issue, `demarrage du temoin ${witness} v${String(version)} sur ${db}`);
  const h = lireHandle(brut, entree);
  expect(
    h !== null
      ? 'handle-lisible'
      : `HANDLE-ILLISIBLE ${witness} v${String(version)} : aucune URL http(s) parmi ` +
        `baseUrl|base_url|url|base|origin|endpoint|address — ${court(rendu(brut))}`,
  ).toBe('handle-lisible');
  const handle = h as Handle;
  HANDLES.push(handle);
  return handle;
}

async function arreter(h: Handle): Promise<void> {
  try {
    await h.stop();
  } catch {
    /* l'arret est un effet de bord du test, pas une assertion */
  }
  const i = HANDLES.indexOf(h);
  if (i >= 0) HANDLES.splice(i, 1);
}

/* ═══════════════════════════════ contrat HTTP public (L229) ═══════════ */

interface Reponse extends Issue {
  status: number;
  corps: unknown;
  plantage: boolean;
}

async function http(
  h: Handle,
  op: string,
  init: { query?: Record<string, string>; body?: unknown } = {},
): Promise<Reponse> {
  const route = h.http[op];
  const url = new URL(h.baseUrl + route.chemin);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(url, {
      method: route.method,
      signal: ctrl.signal,
      ...(init.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
    });
    const texteBrut = await r.text();
    let corps: unknown = texteBrut;
    try {
      corps = texteBrut.length > 0 ? (JSON.parse(texteBrut) as unknown) : null;
    } catch {
      /* corps non JSON : conserve tel quel, qualifie plus bas */
    }
    const plantage = r.status >= 500;
    const base = qualifier(corps);
    const refuse = plantage || r.status >= 400 || base.refuse;
    return {
      status: r.status,
      corps,
      plantage,
      refuse,
      via: plantage
        ? `http-${String(r.status)}-PLANTAGE`
        : r.status >= 400
          ? `http-${String(r.status)}`
          : base.via,
      texte: `HTTP ${String(r.status)} ${court(typeof corps === 'string' ? corps : rendu(corps), 500)}`,
      valeur: corps,
      leve: false,
    };
  } catch (e) {
    return {
      status: 0,
      corps: null,
      plantage: true,
      refuse: true,
      via: 'transport',
      texte: `TRANSPORT ${String((e as Error).message)}`,
      valeur: e,
      leve: true,
    };
  } finally {
    clearTimeout(minuterie);
  }
}

/** Un refus HTTP METIER : refuse, et ni 5xx ni panne de transport. */
function exigerRefusHttp(r: Reponse, quoi: string): void {
  exigerRefuse(r, quoi);
  expect(
    r.plantage
      ? `PLANTAGE-AU-LIEU-D-UN-REFUS-METIER ${quoi} [${r.via}] : ${court(r.texte)}`
      : 'refus-metier',
  ).toBe('refus-metier');
}

/* ── operations metier ─────────────────────────────────────────────────── */

interface OpMetier {
  tenant: string;
  actor: string;
  slot: string;
  at: string;
  sequence: number;
  idempotency_key: string;
}

const declarerCreneau = (
  h: Handle,
  slot: string,
  capacity: number,
  starts_at: string,
  tenant = LOCATAIRE,
): Promise<Reponse> => http(h, 'declare_slot', { body: { tenant, slot, capacity, starts_at } });

const reserver = (h: Handle, op: OpMetier): Promise<Reponse> => http(h, 'reserve', { body: op });
const annuler = (h: Handle, op: OpMetier): Promise<Reponse> => http(h, 'cancel', { body: op });

const exporter = (h: Handle, tenant = LOCATAIRE, actor?: string): Promise<Reponse> =>
  http(h, 'export', { query: actor === undefined ? { tenant } : { tenant, actor } });

const importer = (h: Handle, doc: unknown): Promise<Reponse> => http(h, 'import', { body: doc });

/* ═══════════════════════ lecture de l'etat metier EXPORTE (L119) ══════ */

const CHAMPS_ACTEUR =
  /^(actor|actor_id|actorid|acteur|holder|titulaire|party|owner|client|customer|guest|subject)$/i;
const CHAMPS_STATUT = /^(status|state|etat|statut|reservation_status|booking_status)$/i;
const CHAMPS_ID = /^(id|reservation_id|reservationid|booking_id|identifier|uid|uuid|ref)$/i;
const CHAMPS_RANG =
  /^(rank|rang|position|ordre|order|place|sequence|seq|admission_sequence|queue_position|waitlist_position)$/i;
const CHAMPS_CRENEAU = /^(slot|slot_id|slotid|creneau|resource|resource_id|session|session_id)$/i;
const CHAMPS_LOCATAIRE = /^(tenant|tenant_id|tenantid|locataire|org|organisation|organization|account)$/i;

interface Enr {
  acteur: string;
  statut: Statut;
  creneau: string;
  locataire: string;
  id: string | null;
  rang: number | null;
}

function lireEnregistrement(o: Json, locataireDoc: string): Enr | null {
  let acteur: string | null = null;
  let statutBrut: string | null = null;
  let creneau = '';
  let locataire = '';
  let id: string | null = null;
  let rang: number | null = null;
  for (const [k, v] of Object.entries(o)) {
    if (acteur === null && CHAMPS_ACTEUR.test(k) && typeof v === 'string' && v.length > 0) acteur = v;
    if (statutBrut === null && CHAMPS_STATUT.test(k) && typeof v === 'string') statutBrut = v;
    if (creneau === '' && CHAMPS_CRENEAU.test(k) && typeof v === 'string') creneau = v;
    if (locataire === '' && CHAMPS_LOCATAIRE.test(k) && typeof v === 'string') locataire = v;
    if (id === null && CHAMPS_ID.test(k) && typeof v === 'string' && v.length > 0) id = v;
    if (rang === null && CHAMPS_RANG.test(k) && typeof v === 'number' && Number.isFinite(v)) rang = v;
  }
  if (acteur === null || statutBrut === null) return null;
  const statut = statutDeLaProjection(statutBrut);
  if (statut === null) return null;
  return { acteur, statut, creneau, locataire: locataire === '' ? locataireDoc : locataire, id, rang };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

interface EtatObserve {
  enr: Enr[];
  confirmes: string[];
  attente: string[];
  annules: string[];
  instants: string[];
  jetons: string[];
  texte: string;
}

function lireEtat(doc: unknown, locataireDoc: string): EtatObserve {
  const enr: Enr[] = [];
  const instants: string[] = [];
  const jetons: string[] = [];
  const vus = new Set<unknown>();
  const marcher = (v: unknown, nomDuChamp: string | null, profondeur: number): void => {
    if (profondeur > 10 || v === null || v === undefined) return;
    if (typeof v === 'string') {
      if (ISO.test(v)) instants.push(v);
      if (nomDuChamp !== null && CHAMPS_ID.test(nomDuChamp) && v.length >= 3) jetons.push(v);
      return;
    }
    if (typeof v !== 'object') return;
    if (vus.has(v)) return;
    vus.add(v);
    if (v instanceof Map) {
      for (const [k, x] of v.entries()) marcher(x, typeof k === 'string' ? k : null, profondeur + 1);
      return;
    }
    if (v instanceof Set) {
      for (const x of v) marcher(x, null, profondeur + 1);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) marcher(x, nomDuChamp, profondeur + 1);
      return;
    }
    const o = v as Json;
    const e = lireEnregistrement(o, locataireDoc);
    if (e !== null) enr.push(e);
    for (const [k, x] of Object.entries(o)) marcher(x, k, profondeur + 1);
  };
  marcher(doc, null, 0);
  // FIFO ordonne par SEQUENCE D'ADMISSION EXPLICITE, jamais par timestamp.
  const attente = enr
    .filter((e) => e.statut === 'attente')
    .slice()
    .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0))
    .map((e) => e.acteur);
  return {
    enr,
    confirmes: enr.filter((e) => e.statut === 'confirme').map((e) => e.acteur),
    attente,
    annules: enr.filter((e) => e.statut === 'annule').map((e) => e.acteur),
    instants,
    jetons,
    texte: court(rendu(doc), 900),
  };
}

const resume = (e: EtatObserve): string =>
  `confirmes=${rendu(e.confirmes)} attente=${rendu(e.attente)} annules=${rendu(e.annules)} ` +
  `enr=${String(e.enr.length)}`;

/** L'identite metier STABLE d'une reservation : acteur et creneau. */
const identite = (e: Enr): string => `${e.acteur}|${e.creneau}`;
const identites = (etat: EtatObserve): string[] => etat.enr.map(identite).sort();

async function etatExporte(
  h: Handle,
  quoi: string,
  tenant = LOCATAIRE,
  actor?: string,
): Promise<EtatObserve> {
  const r = await exporter(h, tenant, actor);
  return lireEtat(exigerAccepte(r, `export metier ${quoi}`), tenant);
}

/* ── fabrique d'operations : ENTREES de la suite, jamais valeurs attendues */

let SEQ = 0;
const op = (acteur: string, slot: string, at: string, cle: string, tenant = LOCATAIRE): OpMetier => {
  SEQ += 1;
  return { tenant, actor: acteur, slot, at, sequence: SEQ, idempotency_key: cle };
};

/* ═════════════════════════════════════════════════ menage ═════════════ */

afterAll(async () => {
  for (const h of [...HANDLES]) await arreter(h);
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

/* ═══════════════════════════════════════════════════════════════════════ */

describe('T09 — applications temoins et migrations connues', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T09.A1 temoin conforme realise F-RESERVATION sur PostgreSQL reel',
    async () => {
      assertLoaded();
      assertContrat('listWitnesses', 'startWitness');

      // (0) LA REFERENCE DIT BIEN CE QUE LE CAS AFFIRME.
      expect([P1_CONFIRMEES, P1_DOUBLONS, CAPACITE, P1_SURBOOKING, P1_TITULAIRE]).toEqual([
        1,
        0,
        1,
        false,
        ACTEUR_A,
      ]); // cahier:L119
      expect(Date.parse(DEBUT) - Date.parse(FRONTIERE)).toBe(DELAI_HEURES * 3_600_000); // cahier:L119
      expect(FRONTIERE_INCLUSE).toBe(true); // cahier:L119

      const conforme = await nomDuTemoinConforme();
      const cat = await catalogue();
      // Les quatre versions sont un livrable (L229) ; le digest les identifie (L235).
      expect(
        cat.every((e) => /^[0-9a-f]{16,}$/i.test(e.digest) || e.digest.includes(':'))
          ? 'temoins-identifies-par-digest'
          : `TEMOIN-SANS-DIGEST ${rendu(cat.map((e) => [e.name, e.digest]))}`,
      ).toBe('temoins-identifies-par-digest'); // cahier:L235

      const db = creerBase('a1');

      /* ── P1 : version 1 ────────────────────────────────────────────── */
      let h = await demarrer(conforme, 1, db);
      const digestV1 = h.digest;
      exigerAccepte(
        await declarerCreneau(h, CRENEAU_ID, CAPACITE, DEBUT),
        `declaration du creneau ${CRENEAU_ID}`,
      );

      const opA = op(ACTEUR_A, CRENEAU_ID, P1_H, 'cle-A-reserve');
      exigerAccepte(await reserver(h, opA), `reservation de ${ACTEUR_A}`);
      const e1 = await etatExporte(h, 'apres la reservation de A');
      expect(e1.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119
      expect(e1.confirmes.length).toBe(P1_CONFIRMEES); // cahier:L119

      // Rejeu de la MEME cle avec les MEMES arguments : aucun doublon (D-6, L68).
      exigerAccepte(await reserver(h, { ...opA }), 'rejeu de la cle idempotente de A');
      const e2 = await etatExporte(h, 'apres le rejeu');
      expect(e2.enr.length - e1.enr.length).toBe(P1_DOUBLONS); // cahier:L119
      expect([e2.confirmes, e2.attente, e2.annules]).toEqual([e1.confirmes, e1.attente, e1.annules]);

      // Demande concurrente de B : pas de surbooking. §F ne dit pas si le refus
      // laisse B en file ; le cas n'affirme donc QUE ce que §F affirme.
      await reserver(h, op(ACTEUR_B, CRENEAU_ID, P1_H, 'cle-B-concurrent'));
      const e3 = await etatExporte(h, 'apres la demande concurrente de B');
      expect(e3.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119
      expect(e3.confirmes.length > CAPACITE ? `SURBOOKING ${resume(e3)}` : 'pas-de-surbooking').toBe(
        'pas-de-surbooking',
      ); // cahier:L119
      expect(e3.confirmes.includes(ACTEUR_B)).toBe(P1_SURBOOKING); // cahier:L119

      /* ── P2 : version 2, sur la MEME base ──────────────────────────── */
      await arreter(h);
      h = await demarrer(conforme, 2, db);

      // L'etat a survecu a l'ARRET du processus : il etait dans PostgreSQL.
      const eRelance = await etatExporte(h, 'apres redemarrage en version 2');
      expect(eRelance.confirmes).toEqual([P1_TITULAIRE]); // cahier:L235
      expect(
        nbTables(db) > 0 ? 'base-applicative-peuplee' : `BASE-APPLICATIVE-VIDE ${db}`,
      ).toBe('base-applicative-peuplee'); // cahier:L235

      const opB = op(ACTEUR_B, CRENEAU_ID, P2_H, 'cle-B-attente');
      const opC = op(ACTEUR_C, CRENEAU_ID, P2_H, 'cle-C-attente');
      // Meme instant metier, sequences distinctes : seule la sequence ordonne.
      expect([opB.at, opC.at]).toEqual([P2_H, P2_H]); // cahier:L125
      expect(opB.sequence < opC.sequence).toBe(true); // cahier:L123
      exigerAccepte(await reserver(h, opB), `mise en attente de ${ACTEUR_B}`);
      exigerAccepte(await reserver(h, opC), `mise en attente de ${ACTEUR_C}`);

      const eAvant = await etatExporte(h, 'avant l annulation de A');
      expect(eAvant.attente).toEqual(P2_ORDRE_ATTENTE); // cahier:L119
      expect(eAvant.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119

      exigerAccepte(
        await annuler(h, op(ACTEUR_A, CRENEAU_ID, P2_H, 'cle-A-annule')),
        `annulation de ${ACTEUR_A}`,
      );
      const eP2 = await etatExporte(h, 'apres l annulation de A');
      expect(eP2.annules).toEqual([ACTEUR_A]); // cahier:L119
      expect(eP2.confirmes).toEqual([ACTEUR_B]); // cahier:L119
      expect(eP2.attente).toEqual([ACTEUR_C]); // cahier:L119
      expect(statutDeLaReference(P4_ENTREE_C)).toBe('attente'); // cahier:L123

      /* ── P3 : deux CLONES JETABLES, l'etat principal ne bouge pas ──── */
      await arreter(h);
      const clone1 = clonerBase(db, 'a1c1');
      const clone2 = clonerBase(db, 'a1c2');

      expect([PROBE1_ACTEUR, PROBE1_INSTANT]).toEqual([ACTEUR_B, FRONTIERE]); // cahier:L119
      expect(Date.parse(PROBE2_INSTANT) - Date.parse(PROBE1_INSTANT)).toBe(1); // cahier:L119

      const h1 = await demarrer(conforme, 3, clone1);
      exigerAccepte(
        await annuler(h1, op(PROBE1_ACTEUR, CRENEAU_ID, PROBE1_INSTANT, 'cle-B-annule-frontiere')),
        `annulation de ${PROBE1_ACTEUR} EXACTEMENT a la frontiere ${PROBE1_INSTANT}`,
      );
      const eClone1 = await etatExporte(h1, 'sur le clone de frontiere exacte');
      expect(eClone1.confirmes).toEqual([ACTEUR_C]); // cahier:L123
      expect(eClone1.annules.includes(ACTEUR_B)).toBe(true); // cahier:L119
      await arreter(h1);

      const h2 = await demarrer(conforme, 3, clone2);
      exigerRefusHttp(
        await annuler(h2, op(PROBE2_ACTEUR, CRENEAU_ID, PROBE2_INSTANT, 'cle-B-annule-apres')),
        `annulation de ${PROBE2_ACTEUR} a ${PROBE2_INSTANT} (1 ms apres la frontiere)`,
      ); // cahier:L119
      const eClone2 = await etatExporte(h2, 'sur le clone frontiere + 1 ms');
      expect(eClone2.confirmes).toEqual([ACTEUR_B]); // cahier:L119
      await arreter(h2);

      h = await demarrer(conforme, 3, db);
      const ePrincipal = await etatExporte(h, 'sur l etat persistant principal apres les probes');
      expect([ePrincipal.confirmes, ePrincipal.attente, ePrincipal.annules]).toEqual([
        [ACTEUR_B],
        [ACTEUR_C],
        [ACTEUR_A],
      ]); // cahier:L123

      /* ── P4 : version 4, migration vers `legacy` et locataire `other` */
      await arreter(h);
      h = await demarrer(conforme, 4, db);

      const eP4 = await etatExporte(h, 'a l entree de P4');
      expect([
        statutDeLaReference(P4_ENTREE_A),
        statutDeLaReference(P4_ENTREE_B),
        statutDeLaReference(P4_ENTREE_C),
      ]).toEqual(['annule', 'confirme', 'attente']); // cahier:L123
      expect([eP4.annules, eP4.confirmes, eP4.attente]).toEqual([
        [ACTEUR_A],
        [ACTEUR_B],
        [ACTEUR_C],
      ]); // cahier:L123
      expect(
        eP4.enr.every((e) => e.locataire === LOCATAIRE)
          ? 'migre-vers-legacy'
          : `MIGRATION-INCOMPLETE ${rendu(eP4.enr.map((e) => [e.acteur, e.locataire]))}`,
      ).toBe('migre-vers-legacy'); // cahier:L119

      // Le CONTROLE POSITIF de l'absence : la vue `legacy` montre bien une
      // donnee distinctive, sans quoi l'absence cote `other` ne prouverait rien.
      const distinctifs = [...new Set([...eP4.instants, ...eP4.jetons])].filter(
        (x) => x.length >= 3 && x !== LOCATAIRE,
      );
      expect(
        distinctifs.length > 0
          ? 'donnee-distinctive-cote-legacy'
          : `EXPORT-LEGACY-SANS-DONNEE-DISTINCTIVE ${eP4.texte}`,
      ).toBe('donnee-distinctive-cote-legacy'); // cahier:L123

      // « ses acteurs ne peuvent ni LIRE ni MODIFIER les reservations legacy »
      expect(VERDICT_INTERTENANT.includes(CODE_NOT_FOUND)).toBe(true); // cahier:L123
      const lecture = await exporter(h, LOCATAIRE_AUTRE, ACTEUR_AUTRE);
      exigerRefusHttp(lecture, `lecture intertenant ${LOCATAIRE_AUTRE}/${ACTEUR_AUTRE}`);
      const rendual = court(rendu(lecture.corps), 4000);
      expect(
        rendual.includes(CODE_NOT_FOUND) || lecture.status === 404
          ? 'not-found'
          : `VERDICT-INTERTENANT-INATTENDU attendu ${CODE_NOT_FOUND} : ${rendual}`,
      ).toBe('not-found'); // cahier:L123
      const fuites = distinctifs.filter((x) => rendual.includes(x));
      expect(fuites.length === 0 ? 'aucune-fuite' : `FUITE-INTERTENANT ${rendu(fuites)}`).toBe(
        'aucune-fuite',
      ); // cahier:L123

      const modif = await annuler(
        h,
        op(ACTEUR_B, CRENEAU_ID, P4_H, 'cle-other-annule', LOCATAIRE_AUTRE),
      );
      exigerRefusHttp(modif, `modification intertenant depuis ${LOCATAIRE_AUTRE}`);
      const eApres = await etatExporte(h, 'apres la tentative intertenante');
      expect([eApres.confirmes, eApres.attente, eApres.annules]).toEqual([
        eP4.confirmes,
        eP4.attente,
        eP4.annules,
      ]); // cahier:L119

      expect(
        h.digest.length > 0 && digestV1.length > 0
          ? 'versions-identifiees'
          : `VERSION-SANS-DIGEST v1=${digestV1} v4=${h.digest}`,
      ).toBe('versions-identifiees'); // cahier:L235

      console.log(
        `[T09.A1] via=${LOADED.via.join(',')} temoin=${conforme} base=${db} ` +
          `P1=${resume(e3)} P2=${resume(eP2)} P3-clone1=${resume(eClone1)} ` +
          `P3-clone2=${resume(eClone2)} P4=${resume(eP4)} tables=${String(nbTables(db))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T09.A2 double reservation concurrente synchronisee par barriere ne depasse pas la capacite',
    async () => {
      assertLoaded();
      assertContrat('listWitnesses', 'startWitness');

      expect(CAPACITE).toBe(1); // cahier:L119
      const conforme = await nomDuTemoinConforme();
      const db = creerBase('a2');
      const h = await demarrer(conforme, 1, db);

      const TOURS = 5;
      const journal: string[] = [];
      let totalAcceptes = 0;

      for (let tour = 1; tour <= TOURS; tour += 1) {
        const slot = `${CRENEAU_ID}-BARRIERE-${String(tour)}`;
        exigerAccepte(
          await declarerCreneau(h, slot, CAPACITE, DEBUT),
          `declaration du creneau ${slot}`,
        );

        // BARRIERE (L141) : les deux demandes sont PREPAREES, puis LIBEREES
        // ensemble. Aucune n'est emise avant que l'autre ne soit prete ; c'est
        // ce qui fait de ce tour une course et non une sequence.
        let ouvrir: () => void = () => undefined;
        const barriere = new Promise<void>((r) => {
          ouvrir = r;
        });
        let prets = 0;
        let tousPrets: () => void = () => undefined;
        const attendreLesDeux = new Promise<void>((r) => {
          tousPrets = r;
        });
        const demande = async (acteur: string, cle: string): Promise<Reponse> => {
          prets += 1;
          if (prets === 2) tousPrets();
          await barriere;
          return reserver(h, op(acteur, slot, P1_H, cle));
        };
        const rB = demande(ACTEUR_B, `cle-barriere-${String(tour)}-B`);
        const rC = demande(ACTEUR_C, `cle-barriere-${String(tour)}-C`);
        await attendreLesDeux;
        ouvrir();
        const [repB, repC] = await Promise.all([rB, rC]);

        const acceptes = [repB, repC].filter((r) => !r.refuse);
        const refuses = [repB, repC].filter((r) => r.refuse);

        // CONTROLE POSITIF — sans lui, un temoin qui refuse TOUT (ou qui leve)
        // satisferait « ne depasse pas la capacite » sans rien prouver.
        expect(
          acceptes.length === CAPACITE
            ? 'exactement-un-accepte'
            : `TOUR-${String(tour)}-ACCEPTES=${String(acceptes.length)} attendu ${String(CAPACITE)} : ` +
              `B=[${repB.via}] ${court(repB.texte, 200)} / C=[${repC.via}] ${court(repC.texte, 200)}`,
        ).toBe('exactement-un-accepte'); // cahier:L119

        // Le refus de l'autre demande est l'assertion DECISIVE du cas.
        expect(refuses.length).toBe(2 - CAPACITE); // cahier:L233
        for (const r of refuses) exigerRefusHttp(r, `demande concurrente perdante du tour ${String(tour)}`);

        const etat = lireEtat(
          exigerAccepte(await exporter(h), `export apres le tour ${String(tour)}`),
          LOCATAIRE,
        );
        const surCeCreneau = etat.enr.filter((e) => e.creneau === slot && e.statut === 'confirme');
        expect(
          surCeCreneau.length <= CAPACITE
            ? 'capacite-respectee'
            : `SURBOOKING tour ${String(tour)} : ${String(surCeCreneau.length)} confirmees sur ` +
              `capacite ${String(CAPACITE)} — ${rendu(surCeCreneau.map((e) => e.acteur))}`,
        ).toBe('capacite-respectee'); // cahier:L233
        expect(surCeCreneau.length).toBe(CAPACITE); // cahier:L119
        totalAcceptes += acceptes.length;
        journal.push(
          `tour${String(tour)}:accepte=${surCeCreneau.map((e) => e.acteur).join(',')}` +
            `/refus=${refuses.map((r) => String(r.status)).join(',')}`,
        );
      }

      expect(totalAcceptes).toBe(TOURS * CAPACITE); // cahier:L119
      await arreter(h);
      console.log(`[T09.A2] base=${db} ${journal.join(' ')}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T09.A3 migration P4 preserve 100 reservations et les rattache a legacy',
    async () => {
      assertLoaded();
      assertContrat('listWitnesses', 'startWitness');

      const conforme = await nomDuTemoinConforme();
      const db = creerBase('a3');

      // Les 100 reservations sont CREEES par les operations metier, aux
      // periodes qui PRECEDENT la migration : « les migrations portent sur les
      // donnees reellement creees aux periodes precedentes » (L231). Elles sont
      // reparties sur les versions 1, 2 et 3 — une migration qui ne couvrirait
      // qu'une periode en perdrait les deux tiers.
      const repartition: { version: number; instant: string; de: number; a: number }[] = [
        { version: 1, instant: P1_H, de: 1, a: 34 },
        { version: 2, instant: P2_H, de: 35, a: 67 },
        { version: 3, instant: P3_H, de: 68, a: MIGRATION_RESERVATIONS },
      ];
      expect(repartition[repartition.length - 1].a).toBe(MIGRATION_RESERVATIONS); // cahier:L233
      expect(repartition.length < NB_VERSIONS).toBe(true); // cahier:L229

      const attendues: string[] = [];
      for (const tranche of repartition) {
        const h = await demarrer(conforme, tranche.version, db);
        for (let i = tranche.de; i <= tranche.a; i += 1) {
          const num = String(i).padStart(3, '0');
          const slot = `${CRENEAU_ID}-M${num}`;
          const acteur = `M${num}`;
          exigerAccepte(
            await declarerCreneau(h, slot, CAPACITE, DEBUT),
            `declaration du creneau ${slot} (version ${String(tranche.version)})`,
          );
          exigerAccepte(
            await reserver(h, op(acteur, slot, tranche.instant, `cle-migration-${num}`)),
            `reservation ${num} (version ${String(tranche.version)})`,
          );
          attendues.push(`${acteur}|${slot}`);
        }
        await arreter(h);
      }
      attendues.sort();
      expect(attendues.length).toBe(MIGRATION_RESERVATIONS); // cahier:L233

      // AVANT la migration : le jeu de donnees est bien complet.
      const hAvant = await demarrer(conforme, 3, db);
      const avant = await etatExporte(hAvant, 'avant la migration P4');
      expect(avant.enr.length).toBe(MIGRATION_RESERVATIONS); // cahier:L233
      expect(identites(avant)).toEqual(attendues); // cahier:L231
      const schemaAvant = empreinteSchema(db);
      await arreter(hAvant);

      // LA MIGRATION P4 : demarrer la version 4 sur la base de la version 3.
      const hApres = await demarrer(conforme, NB_VERSIONS, db);
      const apres = await etatExporte(hApres, 'apres la migration P4');

      // (1) LE COMPTE EXACT. C'est ce qu'un OFFSET 1 / LIMIT 99 deplace.
      expect(apres.enr.length).toBe(MIGRATION_RESERVATIONS); // cahier:L233
      expect(apres.confirmes.length).toBe(MIGRATION_RESERVATIONS); // cahier:L233

      // (2) LES MEMES RESERVATIONS. Un test qui n'encoderait que le litteral
      //     100 survivrait a une migration qui perd une ligne et en duplique
      //     une autre ; cette egalite d'ensembles ne survit pas.
      expect(identites(apres)).toEqual(attendues); // cahier:L233

      // (3) RATTACHEES A `legacy`.
      const horsLegacy = apres.enr.filter((e) => e.locataire !== LOCATAIRE);
      expect(
        horsLegacy.length === 0
          ? 'toutes-rattachees-a-legacy'
          : `NON-RATTACHEES ${String(horsLegacy.length)} : ${rendu(horsLegacy.slice(0, 5).map((e) => [e.acteur, e.locataire]))}`,
      ).toBe('toutes-rattachees-a-legacy'); // cahier:L233

      // (4) RIEN N'A FUI VERS UN AUTRE LOCATAIRE : la vue `other` est vide ou
      //     refusee, elle ne peut en aucun cas porter une des 100.
      const autre = await exporter(hApres, LOCATAIRE_AUTRE, ACTEUR_AUTRE);
      const etatAutre = autre.refuse ? null : lireEtat(autre.valeur, LOCATAIRE_AUTRE);
      expect(
        etatAutre === null || etatAutre.enr.length === 0
          ? 'aucune-reservation-hors-legacy'
          : `RESERVATIONS-HORS-LEGACY ${String(etatAutre.enr.length)}`,
      ).toBe('aucune-reservation-hors-legacy'); // cahier:L119

      const schemaApres = empreinteSchema(db);
      await arreter(hApres);

      console.log(
        `[T09.A3] base=${db} avant=${String(avant.enr.length)} apres=${String(apres.enr.length)} ` +
          `attendu=${String(MIGRATION_RESERVATIONS)} schema-change=${String(schemaAvant !== schemaApres)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T09.A4 temoin drop-one-row perd exactement une reservation et est distinguable de l etat attendu',
    async () => {
      assertLoaded();
      assertContrat('listWitnesses', 'startWitness', 'compareBusinessState');

      const cat = await catalogue();
      const conforme = await nomDuTemoinConforme();
      const fautif = cat.find((e) => e.name === TEMOIN_FAUTIF) ?? null;
      expect(
        fautif !== null
          ? 'fixture-fautive-nommee'
          : `FIXTURE-FAUTIVE-ABSENTE ${TEMOIN_FAUTIF} : catalogue = ${rendu(cat.map((e) => e.name))}`,
      ).toBe('fixture-fautive-nommee'); // cahier:L233
      expect((fautif as Entree).conforming).toBe(false); // cahier:L233
      const conformeEntree = cat.find((e) => e.name === conforme) as Entree;
      expect(
        (fautif as Entree).digest !== conformeEntree.digest
          ? 'digests-distincts'
          : `DIGESTS-IDENTIQUES ${conforme} et ${TEMOIN_FAUTIF} portent ${conformeEntree.digest}`,
      ).toBe('digests-distincts'); // cahier:L235

      /* Le meme script, joue trois fois : deux fois sur le temoin conforme
         (sur deux bases independantes), une fois sur `drop-one-row`. */
      const NB = 8;
      const script = async (temoin: string, suffixe: string): Promise<EtatObserve> => {
        const db = creerBase(suffixe);
        const h = await demarrer(temoin, 1, db);
        for (let i = 1; i <= NB; i += 1) {
          const num = String(i).padStart(2, '0');
          const slot = `${CRENEAU_ID}-D${num}`;
          exigerAccepte(await declarerCreneau(h, slot, CAPACITE, DEBUT), `creneau ${slot}`);
          await reserver(h, op(`D${num}`, slot, P1_H, `cle-drop-${suffixe}-${num}`));
        }
        const etat = await etatExporte(h, `script joue sur ${temoin} (${suffixe})`);
        await arreter(h);
        return etat;
      };

      const attendu = await script(conforme, 'a4ref');
      const attendu2 = await script(conforme, 'a4bis');
      const observe = await script(TEMOIN_FAUTIF, 'a4drop');

      // (0) LE SCRIPT A REELLEMENT PRODUIT QUELQUE CHOSE.
      expect(attendu.enr.length).toBe(NB);
      expect(identites(attendu2)).toEqual(identites(attendu)); // cahier:L559

      // (1) EXACTEMENT UNE RESERVATION PERDUE — ni zero, ni deux.
      expect(attendu.enr.length - observe.enr.length).toBe(PERTE_ATTENDUE); // cahier:L233
      const manquantes = identites(attendu).filter((x) => !identites(observe).includes(x));
      expect(manquantes.length).toBe(PERTE_ATTENDUE); // cahier:L233

      // (2) CONTROLE POSITIF DU COMPARATEUR. Deux executions INDEPENDANTES du
      //     temoin conforme doivent etre declarees CONFORMES : sans cela, un
      //     comparateur qui rejette tout satisferait (3) sans rien prouver.
      //     C'est aussi ce qui impose la canonisation des metadonnees volatiles
      //     (L135, L559) : deux bases distinctes, deux jeux d'identifiants.
      const okok = await appeler('compareBusinessState', [
        documentCanonique(attendu2),
        documentCanonique(attendu),
      ]);
      exigerAccepte(
        okok,
        'comparaison de deux executions independantes du temoin conforme (controle positif)',
      ); // cahier:L235

      // (3) L'ASSERTION DECISIVE : `drop-one-row` est REJETE.
      const verdict = await appeler('compareBusinessState', [
        documentCanonique(observe),
        documentCanonique(attendu),
      ]);
      exigerRefusMetier(verdict, `comparaison de ${TEMOIN_FAUTIF} a l etat attendu`); // cahier:L233

      // (4) ET LA DIFFERENCE EST NOMMEE. Un comparateur qui ne rendrait qu'un
      //     total agrege detecterait peut-etre l'ecart sans pouvoir le situer :
      //     T10 exige que chaque faute soit « detectee par son controle nomme ».
      const rapport = rendu(verdict.valeur);
      const perdue = manquantes[0];
      const [acteurPerdu, creneauPerdu] = perdue.split('|');
      expect(
        rapport.includes(acteurPerdu) || rapport.includes(creneauPerdu)
          ? 'difference-nommee'
          : `DIFFERENCE-NON-NOMMEE la reservation perdue est ${perdue} ; rapport = ${court(rapport)}`,
      ).toBe('difference-nommee'); // cahier:L233

      console.log(
        `[T09.A4] attendu=${resume(attendu)} attendu2=${resume(attendu2)} observe=${resume(observe)} ` +
          `perdue=${perdue} verdict=[${verdict.via}]`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T09.A5 restauration d un export metier retrouve les memes faits sans exiger un schema SQL identique',
    async () => {
      assertLoaded();
      assertContrat('listWitnesses', 'startWitness');

      const conforme = await nomDuTemoinConforme();

      /* ── source : version 3 sur sa base ────────────────────────────── */
      const dbSource = creerBase('a5src');
      const hSource = await demarrer(conforme, 3, dbSource);
      exigerAccepte(await declarerCreneau(hSource, CRENEAU_ID, CAPACITE, DEBUT), 'creneau S1');
      exigerAccepte(
        await reserver(hSource, op(ACTEUR_A, CRENEAU_ID, P1_H, 'cle-A-export')),
        `reservation de ${ACTEUR_A}`,
      );
      exigerAccepte(
        await reserver(hSource, op(ACTEUR_B, CRENEAU_ID, P2_H, 'cle-B-export')),
        `mise en attente de ${ACTEUR_B}`,
      );
      exigerAccepte(
        await reserver(hSource, op(ACTEUR_C, CRENEAU_ID, P2_H, 'cle-C-export')),
        `mise en attente de ${ACTEUR_C}`,
      );

      const reponseExport = await exporter(hSource, LOCATAIRE);
      const document = exigerAccepte(reponseExport, 'export metier canonique');
      const source = lireEtat(document, LOCATAIRE);

      // CONTROLE POSITIF : l'export porte REELLEMENT des faits. Sans lui, un
      // export vide restaure en un etat vide satisferait « les memes faits ».
      expect(source.enr.length).toBe(ACTEURS.length); // cahier:L119
      expect(source.confirmes).toEqual([ACTEUR_A]); // cahier:L119
      expect(source.attente).toEqual(P2_ORDRE_ATTENTE); // cahier:L119
      const schemaSource = empreinteSchema(dbSource);
      expect(schemaSource.length > 0).toBe(true);
      await arreter(hSource);

      /* ── cible : version 4, base VIERGE, donc schema different ─────── */
      const dbCible = creerBase('a5dst');
      const hCible = await demarrer(conforme, NB_VERSIONS, dbCible);

      const vide = await etatExporte(hCible, 'sur la cible avant restauration');
      expect(vide.enr.length).toBe(0); // cahier:L139

      exigerAccepte(await importer(hCible, document), 'restauration de l export metier');
      const restaure = await etatExporte(hCible, 'sur la cible apres restauration');

      // (1) LES MEMES FAITS METIER.
      expect(identites(restaure)).toEqual(identites(source)); // cahier:L233
      expect(restaure.confirmes).toEqual(source.confirmes); // cahier:L233
      expect(restaure.attente).toEqual(source.attente); // cahier:L233
      expect(restaure.annules).toEqual(source.annules); // cahier:L233

      // (2) SANS EXIGER UN SCHEMA SQL IDENTIQUE. La cible est la version 4, la
      //     source la version 3 : la migration P4 les separe. Si les deux
      //     schemas etaient identiques, l'enonce du cas ne serait pas observe —
      //     et le cas le DIT, au lieu de passer sans rien prouver.
      const schemaCible = empreinteSchema(dbCible);
      expect(
        schemaCible !== schemaSource
          ? 'schemas-differents'
          : `SCHEMAS-IDENTIQUES entre la version 3 et la version ${String(NB_VERSIONS)} : ` +
            `la restauration n a donc pas franchi de difference de schema (empreinte ${court(schemaCible, 200)})`,
      ).toBe('schemas-differents'); // cahier:L233
      expect(nbTables(dbCible) > 0).toBe(true); // cahier:L235

      await arreter(hCible);
      console.log(
        `[T09.A5] source=${dbSource}(v3) ${resume(source)} cible=${dbCible}(v${String(NB_VERSIONS)}) ` +
          `${resume(restaure)} schemas-differents=${String(schemaCible !== schemaSource)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});

/**
 * Le DOCUMENT metier soumis au comparateur : la liste canonique des
 * reservations observees, debarrassee de tout ce que L135 et L559 declarent
 * volatil (ids de lancement, horodatages techniques, noms de bases). C'est la
 * forme sur laquelle deux executions independantes du temoin conforme peuvent
 * etre comparees — et sur laquelle une reservation perdue se voit.
 */
function documentCanonique(e: EtatObserve): Json {
  return {
    schema: 'bench.temoin.etat/1',
    tenant: LOCATAIRE,
    reservations: e.enr
      .slice()
      .sort((a, b) => (identite(a) < identite(b) ? -1 : identite(a) > identite(b) ? 1 : 0))
      .map((r) => ({ actor: r.acteur, slot: r.creneau, status: r.statut, tenant: r.locataire })),
  };
}
