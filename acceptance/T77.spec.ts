/**
 * acceptance/T77.spec.ts — suite d'acceptation de la tache T77.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T77.A1 refusal   — `bench pilot-conduct --live` sur F-PLATFORM refuse de
 *                      demarrer, avant toute session, s'il n'existe pas de
 *                      calibration reussie pour l'empreinte de la source de
 *                      clauses en vigueur
 *   T77.A2 behaviour — une calibration reussit quand un candidat de reference,
 *                      dont les noms, valeurs et formes proviennent des seuls
 *                      `docs/spec.md`, `docs/api.md` et `docs/tickets/Pnn.md`
 *                      remis, obtient 1 sur chaque clause a chaque periode
 *   T77.A3 refusal   — une calibration sur une source ou une clause comparee
 *                      manque de `docs/spec.md` echoue en nommant la clause et
 *                      la periode
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 * T77 est une tache d'extension ; son `spec_source` epingle ADR-021 L222-228
 * (docs/specs/T77.md). Le contrat ci-dessous derive :
 *   - d'ADR-021 L224 (livrables) : « calibration d'une source de clauses par un
 *     candidat de reference derive des seuls documents remis ; refus de lancer
 *     une campagne sans calibration reussie pour la source en vigueur » ;
 *   - d'ADR-021 decision 6 (« Le garde-fou avant tout pilote ») : « un candidat
 *     de reference, implemente a partir du seul enonce, doit obtenir 1 sur
 *     chaque clause a chaque periode. Tout echec de calibration est un defaut de
 *     l'enonce, jamais du candidat, et bloque la campagne » ;
 *   - d'ADR-021 decision 1 (« complétude : toute clause citee par une attente
 *     d'une periode figure dans l'enonce de cette periode ») et de l'historique
 *     qui l'a motivee (« une autre [regle] manquait ») : c'est le defaut que A3
 *     fabrique ;
 *   - d'ADR-021 L228 : « PostgreSQL, le stockage objet et le faux executable
 *     `claude` sont requis ; aucun appel reel » ;
 *   - des suites PROUVEES dont elle reprend le socle sans le reinventer :
 *     acceptance/T73.spec.ts (generateur de documents, role
 *     `platformPeriodDocs`, `docs/spec.md` porte le texte de chaque clause
 *     active), acceptance/T74.spec.ts (protocole bench.platform/1, notateurs
 *     cible et differentiel, « 1 partout » = chaque clause active notee 1 et le
 *     differentiel note 1 ; privation BENCH_DROP_CLAUSE ; lanceur au nom
 *     aleatoire ; journal de trafic BENCH_TRAFFIC_LOG), acceptance/T76.spec.ts
 *     (`pilot-conduct --provider claude-cli --live` sur F-PLATFORM, faux
 *     `claude`, module de derivation t76-two-arms-derive.mjs, PostgreSQL reel,
 *     garde `verifierFauxEnTetePath`).
 * Aveuglement PROCEDURAL (ADR-001) : aucune implementation de T77 n'existait a
 * l'ecriture. L'auteur a lu, en lecture seule, le code EXISTANT anterieur a T77
 * (commande pilot-conduct, notateurs de T74, generateur de T73) pour savoir ce
 * que HEAD produit ; aucune valeur attendue n'en est tiree.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CONTRAT FIXE ICI (ni ADR-021 ni le registre ne fixent de noms ; ils suivent
 * T46/T49/T66/T74/T76)
 *
 * 1. LA COMMANDE DE CALIBRATION (CLI apps/cli, memes entrees que T76) :
 *      bench calibrate --scenario-id F-PLATFORM
 *                      --candidate-command <tableau JSON argv>
 *                      [--clause-source <module ES>]
 *                      [--postgres-database <base>]
 *    - Elle calibre la source de clauses EN VIGUEUR (l'export `platformClauses`
 *      de @bench/oracle) ou, avec --clause-source, la source exportee par ce
 *      module (`clauses`, alias `PLATFORM_CLAUSES`, `platformClauses`,
 *      `default` ; un tableau de clauses de meme forme que la source en
 *      vigueur). Fixtures : acceptance/fixtures/f-platform-calibration/.
 *    - Pour chaque periode n de 1 a 24, elle note le candidat lance par
 *      --candidate-command (protocole bench.platform/1 de T74) avec les
 *      notateurs cible et differentiel de T74, sur les sequences et le modele
 *      attendu de CETTE source, et verifie la COMPLETUDE : chaque clause
 *      comparee a n (citee par une attente des sequences ciblees de n — en
 *      pratique chaque clause active) figure dans `docs/spec.md` rendu, a n, a
 *      partir de CETTE source (definition en II.4).
 *    - REUSSIE si et seulement si, a chaque periode, chaque clause active est
 *      notee 1, le differentiel est note 1 et la completude tient.
 *    - --postgres-database : la base de la campagne ; l'implementation peut y
 *      persister ses echecs (T74.A3) ; la suite en cree une neuve par appel.
 *    - Sortie : un objet JSON (le dernier de stdout), le RAPPORT, lu de maniere
 *      TOLERANTE (cles normalisees : minuscules, sans `_`/`-`/`.`) :
 *        succes      : booleen `success` | `succeeded` | `ok` | `passed` |
 *                      `calibrated`, ou texte `status` | `outcome` | `verdict` |
 *                      `result` parmi success, succeeded, passed, pass, ok,
 *                      calibrated (sinon : echec) — au premier niveau ou sous
 *                      `calibration` ;
 *        empreinte   : texte non vide `fingerprint` | `source_fingerprint` |
 *                      `clause_source_fingerprint` | `clauses_fingerprint` |
 *                      `empreinte` | `source_digest` | `clause_source_digest` |
 *                      `digest` | `source_sha256` (premier trouve en largeur) ;
 *        periodes    : tout objet qui porte une PERIODE (`period`, `period_id`,
 *                      `period_key`, `period_index`, `periode` : « P7 », « P07 »
 *                      ou 7) et des SCORES CIBLES (`targeted`,
 *                      `targeted_scores`, `clause_scores`, `scores_by_clause`,
 *                      `targeted_clause_scores` : table clause -> nombre ou
 *                      {score}, liste [{clause, score}], ou resultat de T74
 *                      {clauses}) ; son DIFFERENTIEL : `differential` |
 *                      `differential_score` (nombre ou {score}) ;
 *        echecs      : tout element objet d'une liste rangee, a toute
 *                      profondeur, sous `failures` | `defects` | `errors` |
 *                      `problems` | `missing` | `missing_clauses` |
 *                      `incomplete` | `incomplete_clauses` | `echecs` |
 *                      `defauts`, qui porte une CLAUSE (`clause` | `clause_id`
 *                      | `clauseId`) et une PERIODE (memes alias).
 *    - Code de sortie : 0 si et seulement si la calibration est reussie.
 *
 * 2. LE REGISTRE DES CALIBRATIONS. Chaque calibration (reussie ou non) y est
 *    inscrite avec l'empreinte de sa source. Il est designe par la variable
 *    d'environnement BENCH_CALIBRATION_DIR (un repertoire), lue par
 *    `bench calibrate` ET par `bench pilot-conduct`. La suite la pose TOUJOURS
 *    (repertoire jetable) et ne lit jamais son contenu : seuls comptent les
 *    effets sur pilot-conduct. Sans la variable, l'emplacement par defaut est
 *    laisse a l'implementation — mais acceptance/T76.spec.ts (et toute suite
 *    qui lance un pilote F-PLATFORM) ne la pose pas : le registre par defaut
 *    doit donc porter une calibration REUSSIE de la source en vigueur (celle du
 *    candidat de reference de II.5), sans quoi T76 regresse. Cette suite ne le
 *    verifie pas (VI).
 *
 * 3. L'EMPREINTE DE LA SOURCE EN VIGUEUR. Sa definition exacte est laissee a
 *    l'implementation ; la suite exige seulement : (a) deux calibrations de la
 *    MEME source rendent la meme empreinte ; (b) une source dont seul le TEXTE
 *    d'une clause change, et (c) une source dont seule la MISE EN OEUVRE d'une
 *    clause dans le modele attendu change (T70.A1 : la mise en oeuvre fait
 *    partie de la clause), ont chacune une empreinte differente de celle de la
 *    source en vigueur.
 *
 * 4. LE REFUS (A1). `bench pilot-conduct <manifeste> ... --provider claude-cli
 *    --live` dont un groupe porte `source_scenario_id: "F-PLATFORM"` et pour
 *    lequel le registre n'a AUCUNE calibration reussie de l'empreinte de la
 *    source en vigueur :
 *      - sort avec un code NON NUL ;
 *      - ecrit (stdout ou stderr) un motif parmi CALIBRATION_REQUIRED,
 *        CALIBRATION_MISSING, NOT_CALIBRATED, UNCALIBRATED,
 *        UNCALIBRATED_SOURCE, CALIBRATION_NOT_FOUND, et l'empreinte en vigueur
 *        (celle que `bench calibrate` rend pour la source en vigueur) ;
 *      - AVANT TOUTE SESSION : le faux `claude` n'a enregistre AUCUNE
 *        invocation, aucun espace de travail n'existe sous
 *        --candidate-workspace-root, et aucune table du schema `public` de la
 *        base de la campagne (neuve) n'a de ligne — sauf une table dont le nom
 *        contient `calibrat` (l'implementation peut y journaliser le refus).
 *    Une calibration ECHOUEE de l'empreinte en vigueur, ou REUSSIE d'une autre
 *    empreinte, ne leve pas le refus ; une calibration reussie de l'empreinte
 *    en vigueur le leve : le meme pilote demarre (code 0, deux periodes
 *    persistees, deux sessions du faux `claude`).
 *
 * 5. LE CANDIDAT DE REFERENCE DERIVE DES SEULS DOCUMENTS (A2) — FIXTURE DU
 *    TEST-AUTHOR : acceptance/fixtures/candidates/f-platform-doc-reference/
 *    (candidat.mjs : protocole bench.platform/1 ; plateforme.mjs : les regles).
 *    Il a ete ECRIT a partir des 72 documents que `platformPeriodDocs(n)` rend
 *    pour n = 1..24 (spec, contrat d'interface avec ses exemples, ticket), sans
 *    lire packages/oracle (source de clauses, moteur) ni le candidat de T74.
 *    Provenance APPLIQUEE MECANIQUEMENT par A2 (sur le texte du repertoire,
 *    commentaires retires) :
 *      a) il n'importe que des modules `node:` et des fichiers de son propre
 *         repertoire ; aucun fichier n'y est autre que `.mjs` ;
 *      b) aucune mention de `@bench`, `packages/`, `oracle`,
 *         `reference-platform`, `f-platform-reference`, `f-platform-clauses`,
 *         `PlatformEngine`, `PLATFORM_CLAUSES`, `createPlatformModel` ;
 *      c) chaque chaine litterale qui contient une lettre figure, comme MOT
 *         entier, dans la reunion des documents remis des 24 periodes (chaque
 *         fragment fixe d'un gabarit `...` y figure comme sous-chaine), sauf la
 *         liste FERMEE TECHNIQUE ci-dessous (aucune n'est une valeur du
 *         contrat) ; les specificateurs d'import sont juges par a) ;
 *      d) chaque identifiant en snake_case minuscule (les NOMS de champs des
 *         reponses et des arguments) figure dans ces documents, sauf `data_dir`
 *         (champ du journal de trafic de la suite).
 *    Instrumentation (suite seulement) : BENCH_TRAFFIC_LOG (meme format que la
 *    fixture de T74 : une ligne par requete {pid, data_dir, id, op, period, req,
 *    resp, ok}) et BENCH_DROP_CLAUSE=P6.R2 (le meme candidat PRIVE de P6.R2 :
 *    il ne refuse plus les groupes trop grands). Le lanceur, au nom aleatoire,
 *    pose ces variables puis importe la fixture (T74 III.5).
 *    Ce que la fixture REVELE des documents est consigne dans l'en-tete de
 *    candidat.mjs (journal des divergences trouvees pendant son ecriture, et la
 *    phrase des documents qui a tranche chacune).
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CE QUE CHAQUE CAS ASSERTE
 *
 *   SCENARIO COMMUN (execute une fois, dans cet ordre, registre R jetable ;
 *   chaque pilote : base neuve, racine d'espaces neuve, etat du faux neuf) :
 *     P1  pilot-conduct, R vide                         -> refuse
 *     K1  calibrate source en vigueur, candidat PRIVE   -> echoue, empreinte E
 *     P2  pilot-conduct                                 -> refuse
 *     K2  calibrate source au texte augmente, candidat  -> reussit, E' != E
 *     K3  calibrate source a la mise en oeuvre alteree,
 *         candidat qui ne demarre pas                   -> echoue, E'' != E
 *     P3  pilot-conduct                                 -> refuse
 *     K4  calibrate source en vigueur, candidat         -> reussit, empreinte E
 *     P4  pilot-conduct                                 -> DEMARRE
 *     P5  pilot-conduct avec un registre R' vide        -> refuse
 *   A1 — P1, P2, P3, P5 refusent selon II.4 (motif et empreinte E, zero
 *        invocation du faux `claude`, zero espace de travail, zero ligne) ;
 *        K1 et K4 rendent la meme empreinte E, K2 et K3 une autre ; K2 reussit
 *        (une calibration reussie d'une AUTRE empreinte existe donc quand P3
 *        refuse) ; P4 demarre et persiste les deux periodes du manifeste
 *        acceptance/fixtures/pilot-longitudinal/
 *        manifest-t77-claude-cli-f-platform-calibration.json.
 *   A2 — la provenance II.5 du candidat ; K4 : code 0, reussite, pour chaque
 *        periode 1..24 un enregistrement dont les scores cibles couvrent
 *        EXACTEMENT les clauses actives de la source en vigueur, tous egaux a 1,
 *        et un differentiel egal a 1 ; le journal de trafic du candidat montre
 *        qu'il a ete REELLEMENT joue a chaque periode (au moins 10 repertoires
 *        d'etat distincts et 10 000 requetes par periode). Temoin : K1 (le meme
 *        candidat prive de P6.R2) echoue, code non nul, et un echec nomme P6.R2
 *        a une periode ou elle est active.
 *   A3 — la fixture source-clause-absente-de-la-spec.mjs prive P4.R4 de son
 *        texte : la suite verifie d'abord, avec le generateur de T73, que
 *        `docs/spec.md` rendu a partir de cette source ne porte plus le texte
 *        de P4.R4 a P4 (et le porte a partir de la source en vigueur). La
 *        calibration de cette source avec le candidat de reference (qui, lui,
 *        obtiendrait 1 partout : le modele attendu n'a pas change) : code non
 *        nul, echec, au moins un echec nommant P4.R4 a P4 (sa periode
 *        d'entree), chaque echec nommant P4.R4 a une periode ou elle est active,
 *        et aucun echec nommant une autre clause.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * DEFINITIONS (FIXEES ICI)
 *
 *   ACTIVE a n — entree <= n < sortie, dans la source en vigueur (role
 *     `platformClauses`, @bench/oracle), comme T74 IV.
 *   NOTEE 1 — score cible (nombre ou {score}) egal a 1 ; differentiel egal a 1.
 *   PRESENTE DANS docs/spec.md (A3, completude) — le texte de la clause, non
 *     vide, normalise (NFC, blancs ramenes a une espace), est une sous-chaine de
 *     la spec normalisee rendue a n (T74 IV) ; un texte vide ou absent MANQUE.
 *   « AVANT TOUTE SESSION » — II.4 ; les invocations du faux `claude` sont les
 *     fichiers `record-<k>.json` de BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR et
 *     les journaux de session du module de derivation de T76.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CONTROLES NEGATIFS (sans eux un cas pourrait etre creux)
 *
 *   A1 : P4 DEMARRE avec exactement la meme commande que les pilotes refuses :
 *        un refus qui viendrait d'autre chose que la calibration (manifeste,
 *        base, faux `claude`) rougit A1. P5 (registre vide APRES une
 *        calibration reussie ailleurs) : le registre est bien celui de
 *        BENCH_CALIBRATION_DIR, pas un etat global. K2 reussit : sans elle,
 *        « une autre empreinte ne compte pas » serait creux.
 *   A2 : le predicat de provenance (II.5) doit refuser une copie du candidat a
 *        laquelle on ajoute un import de packages/oracle, une valeur et un nom
 *        inventes (sinon la provenance serait creuse) ;
 *        le candidat prive doit faire echouer la calibration (un calibrateur
 *        qui reussit toujours, ou qui note un candidat connaissant la source au
 *        lieu de celui qu'on lui donne, rougit) ; le trafic doit venir du
 *        candidat donne (un calibrateur qui ne le lance pas rougit) ; les scores
 *        doivent couvrir exactement les clauses actives (un rapport vide ou
 *        partiel rougit).
 *   A3 : la source alteree doit vraiment priver docs/spec.md du texte de P4.R4
 *        (sinon A3 serait creux) ; « aucun echec sur une autre clause » refuse
 *        un calibrateur qui echouerait sur tout.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Que le registre PAR DEFAUT (sans BENCH_CALIBRATION_DIR) porte une
 *    calibration reussie de la source en vigueur : c'est ce qui garde
 *    acceptance/T76.spec.ts vert, et c'est cette suite-la qui le prouve.
 *  • La performance et la concurrence (T75) : la calibration n'est jugee que
 *    sur les notateurs de T74 (« score par clause, sequences ciblees et tests
 *    differentiels », ADR-021 decision 5).
 *  • Que le candidat de reference soit derive des documents au-dela de ce que
 *    II.5 verifie mecaniquement : les NOMBRES litteraux (centimes, points de
 *    base, durees) et la LOGIQUE ne sont pas confrontes aux documents ; la
 *    preuve de fond est qu'il obtient 1 partout sans rien importer de la
 *    source (A2), et le journal de son en-tete.
 *  • Le refus pour un autre scenario (F-LONG, F-RESERVATION) n'est pas exige ;
 *    il n'est pas non plus interdit par cette suite (T66/T69 le gardent).
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde
 *    `verifierFauxEnTetePath`, reprise de T47/.../T76.
 *
 * DUREE — dominee par trois calibrations completes du candidat de reference
 * (K2, K4, A3 : 24 periodes, notations ciblee et differentielle de T74), la
 * calibration du candidat prive (K1) et le pilote court P4 (deux sessions).
 * Mesure contre une reference jetable hors depot (4 coeurs) : 10 min 55 s (A1
 * ~8 min 40 s, scenario commun compris ; A2 < 1 s, le scenario etant deja joue ;
 * A3 ~2 min 10 s). A HEAD (T77 non implementee) : ~45 s. Details :
 * verification/mutants/T77.json.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROC_TIMEOUT_MS = 5_400_000;
const CASE_TIMEOUT_MS = 14_400_000;
const LOAD_TIMEOUT_MS = 180_000;
const BUILD_TIMEOUT_MS = 600_000;

const NOMBRE_DE_PERIODES = 24;
const SCENARIO = 'F-PLATFORM';
const CLAUSE_PRIVEE = 'P6.R2'; // candidat prive (A2, K1)
const CLAUSE_ABSENTE = 'P4.R4'; // source-clause-absente-de-la-spec.mjs (A3)
const MIN_FLUX = 10; // T74 : au moins dix flux differentiels par periode
const MIN_REQUETES = 10_000; // ... d'au moins mille operations
const MOTIFS_DE_REFUS = ['CALIBRATION_REQUIRED', 'CALIBRATION_MISSING', 'NOT_CALIBRATED', 'UNCALIBRATED', 'UNCALIBRATED_SOURCE', 'CALIBRATION_NOT_FOUND'];

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;
type Fonction = (...a: unknown[]) => unknown;
const PERIODES = Array.from({ length: NOMBRE_DE_PERIODES }, (_, i) => i + 1);

/* ────────────────────────────────────────────────────────────────── socle
 * commun — REPRIS de acceptance/T76.spec.ts. */

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
const REPO = findRepoRoot();

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
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}
const court = (s: string, n = 900): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut, 8000)).toBe(sain);
}
/** Une liste de defauts doit etre vide ; sinon le cas rougit en les nommant. */
function aucunDefaut(defauts: string[], sain: string): void {
  const n = defauts.length;
  exige(n === 0, sain, `${String(n)} DEFAUT(S) : ${defauts.slice(0, 40).join(' || ')}${n > 40 ? ' || …' : ''}`);
}
const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);
const normaliser = (s: string): string => s.normalize('NFC').replace(/\s+/gu, ' ').trim();

/* ════════════════════════════════════ PostgreSQL REEL (ADR-021 L228) */

const RUN = `t77_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
const REPERTOIRES_CREES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`);
  BASES_CREEES.push(nom);
  return nom;
}

function repertoireJetable(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `t77-${prefixe}-`));
  REPERTOIRES_CREES.push(d);
  return d;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of REPERTOIRES_CREES) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/** Nombre de lignes de chaque table du schema `public` (II.4). */
function lignesParTable(db: string): { parTable: Map<string, number>; defaut: string } {
  const parTable = new Map<string, number>();
  const t = psql(db, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1");
  if (!t.ok) return { parTable, defaut: `TABLES-ILLISIBLES ${db} : ${court(t.out, 300)}` };
  for (const table of t.out.split('\n').map((s) => s.trim()).filter((s) => s.length > 0)) {
    const r = psql(db, `SELECT count(*) FROM "${table.replace(/"/g, '""')}"`);
    parTable.set(table, r.ok ? Number(r.out) : -1);
  }
  return { parTable, defaut: '' };
}

/* ─────────────────────────────── la commande, observee comme un PROCESSUS */

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
  for (const rel of ['dist/index.js', 'dist/cli.js', 'bin/bench.js', 'index.js']) {
    ajouter(`apps/cli:${rel}`, path.join(dir, rel));
  }
  return out;
}

let BUILD_TENTE = false;
function construireUneFois(): string {
  if (BUILD_TENTE) return 'deja tente';
  BUILD_TENTE = true;
  try {
    execFileSync('pnpm', ['build'], { cwd: REPO, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return 'build ok';
  } catch (e) {
    const err = e as { status?: number | null; stderr?: unknown };
    return `build en echec (${String(err.status)}) : ${court(String(err.stderr ?? ''), 300)}`;
  }
}

/** L'entree de la CLI : la premiere entree d'apps/cli (bin du paquet). */
function entreeCli(): { argv: string[] | null; note: string } {
  let e = entreesCli();
  let note = '';
  if (e.length === 0) {
    note = construireUneFois();
    e = entreesCli();
  }
  return { argv: e[0]?.argv ?? null, note };
}

interface Appel {
  exit: number | null;
  stdout: string;
  stderr: string;
  rapport: Json | null;
  argv: string[];
}

function executer(argv: string[], env: NodeJS.ProcessEnv): { exit: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', argv, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { exit: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    return { exit: err.status ?? null, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
  }
}

function jsonDeSortie(s: string): Json | null {
  const essai = (t: string): Json | null => {
    try {
      const v = JSON.parse(t) as unknown;
      return estObjet(v) ? v : null;
    } catch {
      return null;
    }
  };
  const direct = essai(s.trim());
  if (direct !== null) return direct;
  for (const ligne of s.split('\n').reverse()) {
    const l = essai(ligne.trim());
    if (l !== null) return l;
  }
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) return essai(s.slice(i, j + 1));
  return null;
}

function lancer(sousCommande: string, drapeaux: string[], env: NodeJS.ProcessEnv): Appel {
  const { argv, note } = entreeCli();
  if (argv === null) return { exit: null, stdout: '', stderr: `aucune entree CLI dans apps/cli (${note})`, rapport: null, argv: [] };
  const complet = [...argv, sousCommande, ...drapeaux];
  const r = executer(complet, env);
  return { ...r, rapport: jsonDeSortie(r.stdout), argv: complet };
}

const resume = (a: Appel): string => `[exit ${String(a.exit)}] stdout ${court(a.stdout, 700)} | stderr ${court(a.stderr, 700)}`;

/* ════════════════════════ faux executable claude (reprise T47/.../T76) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');
const MODULE_DE_DERIVATION = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't76-two-arms-derive.mjs');
const MANIFESTE = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t77-claude-cli-f-platform-calibration.json');

/** Garde explicite — JAMAIS la vraie CLI (`/opt/node22/bin/claude` ou toute autre). */
function verifierFauxEnTetePath(env: NodeJS.ProcessEnv): void {
  const pathVal = env.PATH ?? '';
  const dirs = pathVal.split(path.delimiter).filter((d) => d.length > 0);
  let trouve: string | null = null;
  for (const d of dirs) {
    const cand = path.join(d, 'claude');
    if (fs.existsSync(cand)) {
      trouve = cand;
      break;
    }
  }
  exige(
    trouve !== null && path.resolve(trouve) === path.resolve(CLAUDE_FIXTURE_BIN),
    'claude-resout-vers-le-faux-executable-de-cette-suite',
    `DANGER-APPEL-REEL-POSSIBLE : claude resout vers ${rendu(trouve)}, attendu ${rendu(CLAUDE_FIXTURE_BIN)}`,
  );
}

function envDeBase(registre: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: SOCKET_DIR,
    PGUSER: PG_USER,
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_CALIBRATION_DIR: registre,
    ...extra,
  };
  // Aucun appel reel, et rien de la suite ne fuit vers un candidat.
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.BENCH_DROP_CLAUSE;
  delete env.BENCH_TRAFFIC_LOG;
  delete env.BENCH_FAULT_LOCK;
  verifierFauxEnTetePath(env);
  return env;
}

/* ═══════════════════════════════════ chargement des paquets (T74 II) */

interface Charge {
  parPaquet: Map<string, Map<string, unknown>>;
  tentatives: string[];
}
function specificateurs(pkg: string): string[] {
  const dir = path.join(REPO, 'packages', pkg);
  const out: string[] = [];
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: unknown };
      if (typeof j.name === 'string' && j.name.length > 0) out.push(j.name);
    } catch {
      /* manifeste illisible */
    }
  }
  const f = path.join(dir, 'src', 'index.ts');
  if (fs.existsSync(f)) out.push(pathToFileURL(f).href);
  return out;
}
let CHARGE: Charge = { parPaquet: new Map(), tentatives: ['beforeAll non execute'] };

beforeAll(async () => {
  // Le chargement ne LEVE pas : chaque cas asserte lui-meme ce qui lui manque.
  const c: Charge = { parPaquet: new Map(), tentatives: [] };
  for (const pkg of ['scenario', 'oracle']) {
    const plat = new Map<string, unknown>();
    for (const s of specificateurs(pkg)) {
      try {
        const mod = (await import(s)) as Ns;
        for (const [k, v] of Object.entries(mod)) if (k !== '__esModule' && !plat.has(k)) plat.set(k, v);
        if (estObjet(mod.default)) for (const [k, v] of Object.entries(mod.default)) if (!plat.has(k)) plat.set(k, v);
        break;
      } catch (e) {
        c.tentatives.push(`import(${s}) -> ${String((e as Error)?.message ?? e).split('\n')[0]}`);
      }
    }
    c.parPaquet.set(pkg, plat);
  }
  CHARGE = c;
}, LOAD_TIMEOUT_MS);

const ROLES: Record<string, { alias: readonly string[]; paquets: readonly string[] }> = {
  platformClauses: {
    alias: ['F_PLATFORM_CLAUSES', 'PLATFORM_CLAUSES', 'platformClauses', 'fPlatformClauses', 'getPlatformClauses', 'loadPlatformClauses', 'F_PLATFORM_SOURCE', 'platformSource', 'platformClauseSource'],
    paquets: ['scenario', 'oracle'],
  },
  platformPeriodDocs: {
    alias: ['renderPlatformPeriodDocs', 'buildPlatformPeriodDocs', 'generatePlatformPeriodDocs', 'platformPeriodDocs', 'renderFPlatformPeriodDocs', 'buildFPlatformPeriodDocs', 'renderPlatformDocs', 'buildPlatformDocs'],
    paquets: ['scenario'],
  },
};
function resoudre(role: string): unknown {
  const r = ROLES[role];
  for (const pkg of r.paquets) {
    const plat = CHARGE.parPaquet.get(pkg);
    if (plat === undefined) continue;
    for (const a of r.alias) if (plat.get(a) !== undefined) return plat.get(a);
  }
  return undefined;
}
function contratManquant(role: string): string {
  const r = ROLES[role];
  const n = r.paquets.map((p) => `${p}:${String(CHARGE.parPaquet.get(p)?.size ?? 0)}`).join(', ');
  return `CONTRAT-NON-SATISFAIT role=${role} : aucun export parmi [${r.alias.join('|')}] dans [${r.paquets.join(', ')}] (exports observes ${n} ; ${CHARGE.tentatives.join(' | ')})`;
}

/* ───────────────────────────────────────────── clauses (T70 III, T74 IV) */

type Clause = Json;
const A_ENTREE = ['enters', 'entry', 'entry_period', 'entryPeriod', 'from', 'since', 'introduced_in', 'introducedIn', 'periode_entree'];
const A_SORTIE = ['exits', 'exit', 'exit_period', 'exitPeriod', 'until', 'retired_in', 'retiredIn', 'periode_sortie'];
function lire(o: unknown, alias: readonly string[]): unknown {
  if (!estObjet(o)) return undefined;
  for (const a of alias) if (a in o && o[a] !== undefined) return o[a];
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
const idDe = (c: Clause): string => String(lire(c, ['id', 'clause_id', 'clauseId']));
const texteDe = (c: Clause): string => {
  const t = lire(c, ['text', 'statement', 'enonce', 'texte']);
  return typeof t === 'string' ? t : '';
};
function active(c: Clause, n: number): boolean {
  const e = numeroPeriode(lire(c, A_ENTREE));
  if (e === null) return false;
  const v = lire(c, A_SORTIE);
  const s = v === null || v === undefined ? null : numeroPeriode(v);
  return e <= n && (s === null || n < s);
}

async function sourceEnVigueur(): Promise<Clause[]> {
  let v = resoudre('platformClauses');
  exige(v !== undefined, 'source-de-clauses-exportee', contratManquant('platformClauses'));
  if (typeof v === 'function') v = await Promise.resolve((v as Fonction)());
  if (estObjet(v) && Array.isArray(v.clauses)) v = v.clauses;
  exige(Array.isArray(v) && v.length > 0 && v.every(estObjet), 'source-de-clauses-lue', `SOURCE-PAS-UN-TABLEAU-DE-CLAUSES ${court(rendu(v), 300)}`);
  return v as Clause[];
}
const activesA = (src: Clause[], n: number): string[] => src.filter((c) => active(c, n)).map(idDe).sort();

/** Les trois documents de la periode n rendus par le generateur de T73 (option `clauses` de T73). */
async function documents(n: number, clauses?: unknown[]): Promise<Record<string, string>> {
  const f = resoudre('platformPeriodDocs');
  exige(typeof f === 'function', 'generateur-de-documents-exporte', contratManquant('platformPeriodDocs'));
  const d = await Promise.resolve((f as Fonction)(n, clauses === undefined ? {} : { clauses }));
  const out: Record<string, string> = {};
  if (d instanceof Map) {
    for (const [k, v] of d) out[String(k)] = String(v);
  } else if (Array.isArray(d)) {
    for (const x of d) if (estObjet(x)) out[String(x.path ?? x.relPath)] = String(x.content);
  } else if (estObjet(d)) {
    for (const [k, v] of Object.entries(d)) if (typeof v === 'string') out[k] = v;
  }
  exige(typeof out['docs/spec.md'] === 'string', `documents-de-P${n}-rendus`, `GENERATEUR-DOCS-FORME P${n} : ${court(rendu(Object.keys(out)), 200)}`);
  return out;
}

/* ═══════════════════════════ candidats et sources (fixtures, II.5) ═════ */

const CANDIDAT_DIR = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-platform-doc-reference');
const CANDIDAT = path.join(CANDIDAT_DIR, 'candidat.mjs');
const NE_DEMARRE_PAS = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'not-starting.mjs');
const SOURCES_DIR = path.join(REPO, 'acceptance', 'fixtures', 'f-platform-calibration');
const SOURCE_TEXTE_AUGMENTE = path.join(SOURCES_DIR, 'source-texte-augmente.mjs');
const SOURCE_MISE_EN_OEUVRE_ALTEREE = path.join(SOURCES_DIR, 'source-mise-en-oeuvre-alteree.mjs');
const SOURCE_CLAUSE_ABSENTE = path.join(SOURCES_DIR, 'source-clause-absente-de-la-spec.mjs');

interface Lanceur {
  commande: string[];
  journal: string;
}
/** Lanceur au nom aleatoire (T74 III.5) : le fidele et le prive ont des commandes de meme forme. */
function lanceur(cible: string, drop: string | null): Lanceur {
  const dossier = repertoireJetable('lanceur');
  const journal = path.join(dossier, 'traffic.ndjson');
  const f = path.join(dossier, `candidate-${randomBytes(6).toString('hex')}.mjs`);
  fs.writeFileSync(
    f,
    [
      `process.env.BENCH_DROP_CLAUSE = ${JSON.stringify(drop ?? '')};`,
      `process.env.BENCH_TRAFFIC_LOG = ${JSON.stringify(journal)};`,
      `await import(${JSON.stringify(pathToFileURL(cible).href)});`,
      '',
    ].join('\n'),
  );
  return { commande: ['node', f], journal };
}

interface Trafic {
  parPeriode: Map<number, { requetes: number; dossiers: Set<string> }>;
  total: number;
}
function lireTrafic(journal: string): Trafic {
  const out: Trafic = { parPeriode: new Map(), total: 0 };
  if (!fs.existsSync(journal)) return out;
  for (const ligne of fs.readFileSync(journal, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue;
    let e: Json;
    try {
      e = JSON.parse(ligne) as Json;
    } catch {
      continue;
    }
    const n = numeroPeriode(e.period);
    if (n === null) continue;
    out.total += 1;
    const p = out.parPeriode.get(n) ?? { requetes: 0, dossiers: new Set<string>() };
    p.requetes += 1;
    p.dossiers.add(String(e.data_dir));
    out.parPeriode.set(n, p);
  }
  return out;
}

/* ══════════════════════════ lecture tolerante du rapport (II.1) ═════════ */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');
function champ(o: Json, alias: readonly string[]): { present: boolean; valeur: unknown } {
  const cible = new Set(alias.map(normKey));
  for (const [k, v] of Object.entries(o)) if (cible.has(normKey(k))) return { present: true, valeur: v };
  return { present: false, valeur: undefined };
}
function enLargeur(racine: unknown, alias: readonly string[], accepte: (v: unknown) => boolean): unknown {
  const cible = new Set(alias.map(normKey));
  const file: unknown[] = [racine];
  let vus = 0;
  while (file.length > 0 && vus < 200_000) {
    const v = file.shift();
    vus += 1;
    if (Array.isArray(v)) {
      file.push(...v);
      continue;
    }
    if (!estObjet(v)) continue;
    for (const [k, x] of Object.entries(v)) if (cible.has(normKey(k)) && accepte(x)) return x;
    for (const x of Object.values(v)) if (x !== null && typeof x === 'object') file.push(x);
  }
  return undefined;
}
function objetsProfonds(v: unknown, out: Json[] = [], profondeur = 0): Json[] {
  if (profondeur > 40) return out;
  if (Array.isArray(v)) {
    for (const x of v) objetsProfonds(x, out, profondeur + 1);
    return out;
  }
  if (estObjet(v)) {
    out.push(v);
    for (const x of Object.values(v)) objetsProfonds(x, out, profondeur + 1);
  }
  return out;
}

const ALIAS_SUCCES = ['success', 'succeeded', 'ok', 'passed', 'calibrated'];
const ALIAS_STATUT = ['status', 'outcome', 'verdict', 'result'];
const STATUTS_REUSSIS = new Set(['success', 'succeeded', 'passed', 'pass', 'ok', 'calibrated']);
const ALIAS_EMPREINTE = ['fingerprint', 'source_fingerprint', 'clause_source_fingerprint', 'clauses_fingerprint', 'empreinte', 'source_digest', 'clause_source_digest', 'digest', 'source_sha256'];
const ALIAS_PERIODE = ['period', 'period_id', 'period_key', 'period_index', 'periode'];
const ALIAS_CIBLE = ['targeted', 'targeted_scores', 'clause_scores', 'scores_by_clause', 'targeted_clause_scores'];
const ALIAS_DIFFERENTIEL = ['differential', 'differential_score'];
const ALIAS_ECHECS = ['failures', 'defects', 'errors', 'problems', 'missing', 'missing_clauses', 'incomplete', 'incomplete_clauses', 'echecs', 'defauts'];
const ALIAS_CLAUSE = ['clause', 'clause_id', 'clauseId'];

/** Succes du rapport (II.1) : null si le rapport ne dit rien. */
function succesDe(r: Json | null): boolean | null {
  if (r === null) return null;
  for (const o of [r, estObjet(r.calibration) ? r.calibration : null]) {
    if (o === null) continue;
    const b = champ(o, ALIAS_SUCCES);
    if (b.present && typeof b.valeur === 'boolean') return b.valeur;
    const s = champ(o, ALIAS_STATUT);
    if (s.present && typeof s.valeur === 'string') return STATUTS_REUSSIS.has(s.valeur.trim().toLowerCase());
  }
  return null;
}
function empreinteDe(r: Json | null): string | null {
  if (r === null) return null;
  const v = enLargeur(r, ALIAS_EMPREINTE, (x) => typeof x === 'string' && x.trim().length > 0);
  return typeof v === 'string' ? v.trim() : null;
}
function periodeDe(o: Json): number | null {
  const p = champ(o, ALIAS_PERIODE);
  if (!p.present) return null;
  const n = numeroPeriode(p.valeur);
  return n !== null && n >= 1 && n <= NOMBRE_DE_PERIODES ? n : null;
}
function scoreDe(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (!estObjet(x)) return null;
  const s = champ(x, ['score', 'fraction', 'ratio']);
  return typeof s.valeur === 'number' && Number.isFinite(s.valeur) ? s.valeur : null;
}
function clauseDe(v: unknown): string | null {
  if (typeof v === 'string' && /^P\d+\.R\d+$/.test(v.trim())) return v.trim();
  if (!estObjet(v)) return null;
  const c = champ(v, [...ALIAS_CLAUSE, 'id']);
  return typeof c.valeur === 'string' && /^P\d+\.R\d+$/.test(c.valeur) ? c.valeur : null;
}
function scoresCibles(v: unknown): Map<string, number> | null {
  const out = new Map<string, number>();
  if (Array.isArray(v)) {
    for (const e of v) {
      const c = clauseDe(e);
      const s = scoreDe(e);
      if (c !== null && s !== null) out.set(c, s);
    }
    return out.size > 0 ? out : null;
  }
  if (!estObjet(v)) return null;
  const sous = champ(v, ['clauses', 'by_clause', 'scores']);
  if (sous.present && sous.valeur !== v) {
    const r = scoresCibles(sous.valeur);
    if (r !== null) return r;
  }
  for (const [k, x] of Object.entries(v)) {
    if (!/^P\d+\.R\d+$/.test(k)) continue;
    const s = scoreDe(x);
    if (s !== null) out.set(k, s);
  }
  return out.size > 0 ? out : null;
}
interface EnregistrementDePeriode {
  cible: Map<string, number>;
  differentiel: number | null;
}
/** Enregistrements de periode du rapport (II.1) : le premier trouve par periode. */
function periodesDe(r: Json | null): Map<number, EnregistrementDePeriode> {
  const out = new Map<number, EnregistrementDePeriode>();
  for (const o of objetsProfonds(r)) {
    const n = periodeDe(o);
    if (n === null || out.has(n)) continue;
    const c = champ(o, ALIAS_CIBLE);
    if (!c.present) continue;
    const cible = scoresCibles(c.valeur);
    if (cible === null) continue;
    const d = champ(o, ALIAS_DIFFERENTIEL);
    out.set(n, { cible, differentiel: d.present ? scoreDe(d.valeur) : null });
  }
  return out;
}
/** Echecs (clause, periode) du rapport (II.1). */
function echecsDe(r: Json | null): { clause: string; periode: number }[] {
  const out: { clause: string; periode: number }[] = [];
  const vus = new Set<string>();
  const cible = new Set(ALIAS_ECHECS.map(normKey));
  for (const o of objetsProfonds(r)) {
    for (const [k, v] of Object.entries(o)) {
      if (!cible.has(normKey(k)) || !Array.isArray(v)) continue;
      for (const e of v) {
        if (!estObjet(e)) continue;
        const c = champ(e, ALIAS_CLAUSE);
        const n = periodeDe(e);
        if (typeof c.valeur !== 'string' || n === null) continue;
        const cle = `${c.valeur}@${n}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        out.push({ clause: c.valeur, periode: n });
      }
    }
  }
  return out;
}

/* ══════════════════════════════════════════ calibrations et pilotes ═════ */

interface Calibration {
  appel: Appel;
  succes: boolean | null;
  empreinte: string | null;
  trafic: Trafic;
}

function calibrer(etiquette: string, registre: string, opts: { source: string | null; candidat: string; drop: string | null }): Calibration {
  const l = lanceur(opts.candidat, opts.drop);
  const db = creerBase(`k_${etiquette}`);
  const drapeaux = ['--scenario-id', SCENARIO, '--candidate-command', JSON.stringify(l.commande), '--postgres-database', db];
  if (opts.source !== null) drapeaux.push('--clause-source', opts.source);
  const appel = lancer('calibrate', drapeaux, envDeBase(registre));
  return { appel, succes: succesDe(appel.rapport), empreinte: empreinteDe(appel.rapport), trafic: lireTrafic(l.journal) };
}

interface Pilote {
  appel: Appel;
  invocations: number;
  sessions: number;
  espaces: string[];
  lignes: Map<string, number>;
  defautBase: string;
}

function piloter(etiquette: string, registre: string): Pilote {
  exige(fs.existsSync(MANIFESTE) && fs.existsSync(MODULE_DE_DERIVATION) && fs.existsSync(CLAUDE_FIXTURE_BIN), 'fixtures-du-pilote-presentes', `FIXTURE-ABSENTE : ${MANIFESTE} | ${MODULE_DE_DERIVATION}`);
  const brut = JSON.parse(fs.readFileSync(MANIFESTE, 'utf8')) as Json;
  const consigne = ((brut.arms as Json[] | undefined) ?? []).find((b) => b.arm === 'B')?.method_instruction;
  const db = creerBase(`p_${etiquette}`);
  const etat = repertoireJetable(`etat-${etiquette}`);
  const racine = repertoireJetable(`ws-${etiquette}`);
  const env = envDeBase(registre, {
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: MODULE_DE_DERIVATION,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: path.join(etat, 'derive-log'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: path.join(etat, 'records'),
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: path.join(etat, 'record-counter.txt'),
    BENCH_FAKE_CLAUDE_T76_INSTRUCTION: typeof consigne === 'string' ? consigne : '',
    BENCH_FAKE_CLAUDE_T76_STATE_DIR: etat,
  });
  const appel = lancer(
    'pilot-conduct',
    [
      MANIFESTE,
      '--campaign-id', `t77-${RUN}-${etiquette}-${randomUUID()}`,
      '--postgres-database', db,
      '--s3-bucket', `bench-${RUN}-${etiquette}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
      '--mode', 'recorded',
      '--provider', 'claude-cli',
      '--live',
      '--candidate-workspace-root', racine,
    ],
    env,
  );
  const compter = (d: string, re: RegExp): number => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => re.test(f)).length : 0);
  const { parTable, defaut } = lignesParTable(db);
  return {
    appel,
    invocations: compter(path.join(etat, 'records'), /^record-\d+\.json$/),
    sessions: compter(path.join(etat, 'sessions'), /\.json$/),
    espaces: fs.existsSync(racine) ? fs.readdirSync(racine) : [],
    lignes: parTable,
    defautBase: defaut,
  };
}

interface Scenario {
  registre: string;
  p1: Pilote;
  k1: Calibration;
  p2: Pilote;
  k2: Calibration;
  k3: Calibration;
  p3: Pilote;
  k4: Calibration;
  p4: Pilote;
  p5: Pilote;
}
let SCENARIO_COMMUN: Scenario | null = null;
/** III : le scenario commun, execute une fois, dans cet ordre. */
function scenarioCommun(): Scenario {
  if (SCENARIO_COMMUN !== null) return SCENARIO_COMMUN;
  for (const f of [CANDIDAT, NE_DEMARRE_PAS, SOURCE_TEXTE_AUGMENTE, SOURCE_MISE_EN_OEUVRE_ALTEREE]) {
    exige(fs.existsSync(f), `fixture-presente-${path.basename(f)}`, `FIXTURE-ABSENTE : ${f}`);
  }
  const registre = repertoireJetable('registre');
  const p1 = piloter('p1', registre);
  const k1 = calibrer('k1', registre, { source: null, candidat: CANDIDAT, drop: CLAUSE_PRIVEE });
  const p2 = piloter('p2', registre);
  const k2 = calibrer('k2', registre, { source: SOURCE_TEXTE_AUGMENTE, candidat: CANDIDAT, drop: null });
  const k3 = calibrer('k3', registre, { source: SOURCE_MISE_EN_OEUVRE_ALTEREE, candidat: NE_DEMARRE_PAS, drop: null });
  const p3 = piloter('p3', registre);
  const k4 = calibrer('k4', registre, { source: null, candidat: CANDIDAT, drop: null });
  const p4 = piloter('p4', registre);
  const p5 = piloter('p5', repertoireJetable('registre-vide'));
  SCENARIO_COMMUN = { registre, p1, k1, p2, k2, k3, p3, k4, p4, p5 };
  return SCENARIO_COMMUN;
}

/** Defauts d'un pilote qui devait etre REFUSE avant toute session (II.4). */
function defautsDuRefus(p: Pilote, etiquette: string, empreinte: string | null): string[] {
  const out: string[] = [];
  const texte = `${p.appel.stdout}\n${p.appel.stderr}`;
  if (p.appel.exit === 0) out.push(`${etiquette} : pilot-conduct a reussi (code 0) sans calibration reussie de l'empreinte en vigueur ${resume(p.appel)}`);
  if (!MOTIFS_DE_REFUS.some((m) => texte.includes(m))) out.push(`${etiquette} : aucun motif de refus parmi ${MOTIFS_DE_REFUS.join('|')} ${resume(p.appel)}`);
  if (empreinte === null) out.push(`${etiquette} : empreinte en vigueur inconnue (bench calibrate ne l'a pas rendue)`);
  else if (!texte.includes(empreinte)) out.push(`${etiquette} : le refus ne nomme pas l'empreinte en vigueur ${empreinte} ${resume(p.appel)}`);
  if (p.invocations > 0 || p.sessions > 0) out.push(`${etiquette} : ${p.invocations} invocation(s) du faux claude et ${p.sessions} session(s) derivee(s) AVANT le refus`);
  if (p.espaces.length > 0) out.push(`${etiquette} : espace(s) de travail cree(s) avant le refus : ${p.espaces.join(', ')}`);
  if (p.defautBase !== '') out.push(`${etiquette} : ${p.defautBase}`);
  for (const [table, n] of p.lignes) {
    if (/calibrat/i.test(table)) continue;
    if (n !== 0) out.push(`${etiquette} : table ${table} : ${n} ligne(s) ecrite(s) avant le refus`);
  }
  return out;
}

/**
 * docs/spec.md de la periode n rendu par le generateur de T73 du paquet CONSTRUIT (celui de la CLI),
 * pour la source en vigueur et pour la source source-clause-absente-de-la-spec.mjs (option `clauses`).
 */
function sondeSpecAlteree(n: number): { vigueur: string; alteree: string; defaut: string } {
  const scenario = pathToFileURL(path.join(REPO, 'packages', 'scenario', 'dist', 'index.js')).href;
  const code = [
    `const m = await import(${JSON.stringify(scenario)});`,
    `const f = ${JSON.stringify(ROLES.platformPeriodDocs.alias)}.map((a) => m[a]).find((x) => typeof x === 'function');`,
    `const s = await import(${JSON.stringify(pathToFileURL(SOURCE_CLAUSE_ABSENTE).href)});`,
    `const spec = (d) => (d instanceof Map ? d.get('docs/spec.md') : d['docs/spec.md']);`,
    `process.stdout.write(JSON.stringify({ vigueur: spec(await f(${n}, {})), alteree: spec(await f(${n}, { clauses: s.clauses ?? s.default })) }));`,
  ].join('\n');
  try {
    const out = execFileSync('node', ['--input-type=module', '-e', code], { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 600_000 });
    const j = JSON.parse(out) as { vigueur?: unknown; alteree?: unknown };
    return { vigueur: normaliser(String(j.vigueur ?? '')), alteree: normaliser(String(j.alteree ?? '')), defaut: '' };
  } catch (e) {
    return { vigueur: '', alteree: '', defaut: `SONDE-ILLISIBLE : ${court(rendu(e), 500)}` };
  }
}

/* ═══════════════════════════════════════ provenance du candidat (II.5) */

/** Chaines litterales (mot entier), fragments fixes de gabarits, et code sans chaines ni commentaires. */
function lexemes(src: string): { chaines: string[]; fragments: string[]; code: string; brut: string } {
  const chaines: string[] = [];
  const fragments: string[] = [];
  let code = '';
  let brut = '';
  let i = 0;
  let dernier = '';
  const regexPossible = (): boolean => dernier === '' || /[(,=:[!&|?{};+\-*%<>~^]$/.test(dernier) || /\b(return|typeof|case|in|of|new|delete|void|throw)$/.test(dernier);
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? src.length : j + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') {
          s += src[j + 1];
          j += 2;
          continue;
        }
        s += src[j];
        j += 1;
      }
      chaines.push(s);
      code += ' "" ';
      brut += src.slice(i, j + 1);
      dernier = '"';
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') {
          s += src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === '$' && src[j + 1] === '{') {
          fragments.push(s);
          s = '';
          j += 2;
          let p = 1;
          let expr = '';
          while (j < src.length) {
            if (src[j] === '{') p += 1;
            else if (src[j] === '}') {
              p -= 1;
              if (p === 0) break;
            }
            expr += src[j];
            j += 1;
          }
          const sous = lexemes(expr);
          chaines.push(...sous.chaines);
          fragments.push(...sous.fragments);
          code += ` ${sous.code} `;
          j += 1;
          continue;
        }
        s += src[j];
        j += 1;
      }
      fragments.push(s);
      code += ' "" ';
      brut += src.slice(i, j + 1);
      dernier = '"';
      i = j + 1;
      continue;
    }
    if (c === '/' && regexPossible()) {
      let j = i + 1;
      let classe = false;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '[') classe = true;
        else if (src[j] === ']') classe = false;
        else if (src[j] === '/' && !classe) break;
        j += 1;
      }
      j += 1;
      while (/[a-z]/.test(src[j] ?? '')) j += 1;
      code += ' /re/ ';
      brut += src.slice(i, j);
      dernier = '/';
      i = j;
      continue;
    }
    code += c;
    brut += c;
    if (!/\s/.test(c)) dernier = (dernier + c).slice(-12);
    i += 1;
  }
  return { chaines, fragments, code, brut };
}

/** Liste FERMEE TECHNIQUE (II.5 c) : aucune n'est une valeur du contrat F-PLATFORM. */
const CHAINES_TECHNIQUES = new Set([
  // resultats de typeof
  'object', 'string', 'number', 'boolean', 'function', 'undefined', 'bigint',
  // E/S de Node : encodage, evenements de flux, empreinte du journal de trafic
  'utf8', 'line', 'close', 'error', 'sha256', 'hex',
  // fichier d'etat sous BENCH_DATA_DIR
  'journal.ndjson',
]);
const IDENTIFIANTS_TECHNIQUES = new Set(['data_dir']);
const MOTS_INTERDITS = ['@bench', 'packages/', 'oracle', 'reference-platform', 'f-platform-reference', 'f-platform-clauses', 'PlatformEngine', 'PLATFORM_CLAUSES', 'createPlatformModel'];
const echapper = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let DOCS_REMIS: string | null = null;
/** La reunion des documents remis des 24 periodes (generateur de T73, source en vigueur). */
async function documentsRemis(): Promise<string> {
  if (DOCS_REMIS !== null) return DOCS_REMIS;
  let docs = '';
  for (const n of PERIODES) for (const v of Object.values(await documents(n))) docs += `${v}\n`;
  DOCS_REMIS = docs;
  return docs;
}

async function defautsDeProvenance(repertoire: string): Promise<string[]> {
  const out: string[] = [];
  if (!fs.existsSync(repertoire)) return [`CANDIDAT-ABSENT : ${repertoire}`];
  const docs = await documentsRemis();
  const motEntier = (t: string): boolean => new RegExp(`(?<![A-Za-z0-9_])${echapper(t)}(?![A-Za-z0-9_])`, 'u').test(docs);
  const fichiers = fs.readdirSync(repertoire);
  if (!fichiers.includes('candidat.mjs')) out.push('candidat.mjs absent du repertoire du candidat');
  for (const f of fichiers) {
    const chemin = path.join(repertoire, f);
    if (!f.endsWith('.mjs') || !fs.statSync(chemin).isFile()) {
      out.push(`${f} : seul des fichiers .mjs sont admis dans le repertoire du candidat`);
      continue;
    }
    const src = fs.readFileSync(chemin, 'utf8');
    const { chaines, fragments, code, brut } = lexemes(src);
    // a) imports
    const imports = new Set<string>();
    for (const m of brut.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/gmu)) imports.add(m[1] as string);
    for (const m of brut.matchAll(/(?:^|[\s;])import\s*['"]([^'"]+)['"]/gmu)) imports.add(m[1] as string);
    for (const m of brut.matchAll(/import\(\s*([^)]*)\)/gu)) {
      const arg = (m[1] as string).trim();
      if (/^['"][^'"]+['"]$/.test(arg)) imports.add(arg.slice(1, -1));
      else out.push(`${f} : import dynamique d'une expression ${court(arg, 80)}`);
    }
    if (/\brequire\s*\(/u.test(code)) out.push(`${f} : require() interdit`);
    for (const s of imports) {
      if (s.startsWith('node:')) continue;
      if (s.startsWith('./') && path.dirname(path.resolve(repertoire, s)) === repertoire && fs.existsSync(path.resolve(repertoire, s))) continue;
      out.push(`${f} : import hors de node: et du repertoire du candidat : ${s}`);
    }
    // b) mentions interdites (commentaires retires)
    const sansCommentaires = `${code}\n${chaines.join('\n')}\n${fragments.join('\n')}`;
    for (const m of MOTS_INTERDITS) if (sansCommentaires.includes(m)) out.push(`${f} : mention interdite « ${m} »`);
    // c) chaines litterales
    for (const s of chaines) {
      const t = s.trim();
      if (!/[A-Za-z]/.test(t) || imports.has(s) || CHAINES_TECHNIQUES.has(t)) continue;
      if (!motEntier(t)) out.push(`${f} : chaine ${JSON.stringify(t)} absente des documents remis`);
    }
    for (const s of fragments) {
      const t = s.trim();
      if (!/[A-Za-z]/.test(t)) continue;
      if (!docs.includes(t)) out.push(`${f} : fragment de gabarit ${JSON.stringify(t)} absent des documents remis`);
    }
    // d) noms en snake_case
    for (const m of code.matchAll(/(?<![A-Za-z0-9_$.])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![A-Za-z0-9_$])/gu)) {
      const id = m[0];
      if (IDENTIFIANTS_TECHNIQUES.has(id)) continue;
      if (!motEntier(id)) out.push(`${f} : nom ${id} absent des documents remis`);
    }
  }
  return [...new Set(out)];
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T77 — la calibration avant toute campagne', () => {
  test(
    'T77.A1 — bench pilot-conduct --live sur F-PLATFORM refuse de demarrer, avant toute session, sans calibration reussie de l empreinte de la source en vigueur',
    () => {
      const s = scenarioCommun();
      const E = s.k4.empreinte ?? s.k1.empreinte;

      // Les calibrations du scenario (II.3) : meme source -> meme empreinte ; texte ou mise en oeuvre differents -> une autre.
      const defautsK: string[] = [];
      if (s.k4.empreinte === null) defautsK.push(`K4 (source en vigueur) : aucune empreinte dans le rapport ${resume(s.k4.appel)}`);
      if (s.k1.empreinte === null) defautsK.push(`K1 (source en vigueur, candidat prive) : aucune empreinte dans le rapport ${resume(s.k1.appel)}`);
      if (s.k4.empreinte !== null && s.k1.empreinte !== null && s.k4.empreinte !== s.k1.empreinte) defautsK.push(`K1 et K4 calibrent la MEME source mais rendent ${s.k1.empreinte} et ${s.k4.empreinte}`);
      if (s.k2.empreinte === null) defautsK.push(`K2 (texte augmente) : aucune empreinte ${resume(s.k2.appel)}`);
      else if (s.k2.empreinte === E) defautsK.push(`K2 : une source au TEXTE different a l'empreinte de la source en vigueur ${E}`);
      if (s.k3.empreinte === null) defautsK.push(`K3 (mise en oeuvre alteree) : aucune empreinte ${resume(s.k3.appel)}`);
      else if (s.k3.empreinte === E) defautsK.push(`K3 : une source a la MISE EN OEUVRE differente a l'empreinte de la source en vigueur ${E}`);
      if (!(s.k2.appel.exit === 0 && s.k2.succes === true)) defautsK.push(`K2 : la calibration de la source au texte augmente devait REUSSIR (temoin « une autre empreinte ») ${resume(s.k2.appel)}`);
      if (!(s.k1.appel.exit !== 0 && s.k1.succes === false)) defautsK.push(`K1 : la calibration du candidat prive de ${CLAUSE_PRIVEE} devait ECHOUER ${resume(s.k1.appel)}`);
      if (!(s.k3.appel.exit !== 0 && s.k3.succes === false)) defautsK.push(`K3 : la calibration d'un candidat qui ne demarre pas devait ECHOUER ${resume(s.k3.appel)}`);
      if (!(s.k4.appel.exit === 0 && s.k4.succes === true)) defautsK.push(`K4 : la calibration de la source en vigueur par le candidat de reference devait REUSSIR ${resume(s.k4.appel)}`);
      aucunDefaut(defautsK, 'empreintes-et-calibrations-du-scenario');

      // Les refus (II.4).
      aucunDefaut(defautsDuRefus(s.p1, 'P1 (registre vide)', E), 'refus-sans-aucune-calibration');
      aucunDefaut(defautsDuRefus(s.p2, 'P2 (seule une calibration ECHOUEE de l empreinte en vigueur)', E), 'refus-apres-calibration-echouee');
      aucunDefaut(defautsDuRefus(s.p3, 'P3 (calibration REUSSIE d une AUTRE empreinte)', E), 'refus-apres-calibration-d-une-autre-empreinte');
      aucunDefaut(defautsDuRefus(s.p5, 'P5 (registre BENCH_CALIBRATION_DIR vide)', E), 'refus-avec-un-registre-vide');

      // Le temoin : avec une calibration reussie de l'empreinte en vigueur, LE MEME pilote demarre.
      const r = s.p4.appel.rapport;
      const persistees = r === null ? undefined : r.periods_persisted;
      exige(
        s.p4.appel.exit === 0 && persistees === 2 && s.p4.invocations >= 2 && s.p4.sessions === 2,
        'pilote-demarre-apres-calibration-reussie',
        `P4 : avec une calibration reussie de ${String(E)}, pilot-conduct devait demarrer (code 0, periods_persisted 2, deux sessions du faux claude) ; observe exit ${String(s.p4.appel.exit)}, periods_persisted ${rendu(persistees)}, ${s.p4.invocations} invocation(s), ${s.p4.sessions} session(s) ${resume(s.p4.appel)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T77.A2 — une calibration reussit quand un candidat de reference derive des seuls documents remis obtient 1 sur chaque clause a chaque periode',
    async () => {
      // Controle negatif (V) : le predicat de provenance refuse une copie du candidat qui importe la
      // source, cite le paquet, porte une valeur et un nom inventes.
      const temoin = repertoireJetable('candidat-altere');
      for (const f of fs.existsSync(CANDIDAT_DIR) ? fs.readdirSync(CANDIDAT_DIR) : []) fs.copyFileSync(path.join(CANDIDAT_DIR, f), path.join(temoin, f));
      fs.appendFileSync(
        path.join(temoin, 'candidat.mjs'),
        "\nimport * as source from '../../../packages/oracle/dist/index.js'\nexport const champ_invente_t77 = { valeur: 'VALEUR_INVENTEE_T77', n: source }\n",
      );
      const refus = (await defautsDeProvenance(temoin)).join('\n');
      const attendus = ['import hors de node:', 'mention interdite « packages/ »', 'mention interdite « oracle »', '"VALEUR_INVENTEE_T77" absente', 'nom champ_invente_t77 absent'];
      const manques = attendus.filter((a) => !refus.includes(a));
      exige(manques.length === 0, 'predicat-de-provenance-refuse-un-candidat-qui-connait-la-source', `CONTROLE-NEGATIF : le predicat de provenance n'a pas releve ${manques.join(' | ')} (releve : ${court(refus, 1500)})`);

      // Provenance du candidat (II.5), appliquee au texte de la fixture.
      aucunDefaut(await defautsDeProvenance(CANDIDAT_DIR), 'candidat-derive-des-seuls-documents');

      const src = await sourceEnVigueur();
      const s = scenarioCommun();
      const k4 = s.k4;
      exige(k4.appel.exit === 0 && k4.succes === true, 'calibration-du-candidat-de-reference-reussie', `K4 : code ${String(k4.appel.exit)}, succes ${rendu(k4.succes)} ; echecs ${court(rendu(echecsDe(k4.appel.rapport)), 1500)} ${resume(k4.appel)}`);

      // 1 sur chaque clause active a chaque periode, et 1 au differentiel.
      const parPeriode = periodesDe(k4.appel.rapport);
      const defauts: string[] = [];
      for (const n of PERIODES) {
        const e = parPeriode.get(n);
        const attendues = activesA(src, n);
        if (e === undefined) {
          defauts.push(`P${n} : aucun enregistrement de periode (periode + scores cibles) dans le rapport`);
          continue;
        }
        const notees = [...e.cible.keys()].sort();
        const manquantes = attendues.filter((c) => !e.cible.has(c));
        const etrangeres = notees.filter((c) => !attendues.includes(c));
        if (manquantes.length > 0) defauts.push(`P${n} : clause(s) active(s) sans score : ${manquantes.join(', ')}`);
        if (etrangeres.length > 0) defauts.push(`P${n} : score(s) de clause(s) inactive(s) : ${etrangeres.join(', ')}`);
        for (const [c, v] of e.cible) if (v !== 1) defauts.push(`P${n} ${c} : note ${v} (attendu 1)`);
        if (e.differentiel !== 1) defauts.push(`P${n} : differentiel ${rendu(e.differentiel)} (attendu 1)`);
      }
      aucunDefaut(defauts, 'un-sur-chaque-clause-a-chaque-periode');

      // Le candidat donne a ete REELLEMENT joue a chaque periode.
      const trafic: string[] = [];
      for (const n of PERIODES) {
        const p = k4.trafic.parPeriode.get(n);
        if (p === undefined) trafic.push(`P${n} : aucune requete recue par le candidat de reference`);
        else if (p.dossiers.size < MIN_FLUX || p.requetes < MIN_REQUETES) trafic.push(`P${n} : ${p.dossiers.size} repertoire(s) d'etat, ${p.requetes} requete(s) (attendu >= ${MIN_FLUX} et >= ${MIN_REQUETES})`);
      }
      aucunDefaut(trafic, 'candidat-de-reference-reellement-joue');

      // Temoin : le meme candidat prive d'une clause fait echouer la calibration, en nommant la clause.
      const k1 = s.k1;
      const nommees = echecsDe(k1.appel.rapport).filter((x) => x.clause === CLAUSE_PRIVEE);
      const clause = src.find((c) => idDe(c) === CLAUSE_PRIVEE);
      exige(
        k1.appel.exit !== 0 && k1.succes === false && nommees.some((x) => clause !== undefined && active(clause, x.periode)) && k1.trafic.total > 0,
        'calibration-du-candidat-prive-en-echec',
        `K1 (candidat prive de ${CLAUSE_PRIVEE}) : code ${String(k1.appel.exit)}, succes ${rendu(k1.succes)}, echecs nommant ${CLAUSE_PRIVEE} : ${rendu(nommees)}, trafic ${k1.trafic.total} requete(s) ${resume(k1.appel)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T77.A3 — une calibration sur une source ou une clause comparee manque de docs/spec.md echoue en nommant la clause et la periode',
    async () => {
      for (const f of [CANDIDAT, SOURCE_CLAUSE_ABSENTE]) exige(fs.existsSync(f), `fixture-presente-${path.basename(f)}`, `FIXTURE-ABSENTE : ${f}`);
      const src = await sourceEnVigueur();
      const clause = src.find((c) => idDe(c) === CLAUSE_ABSENTE);
      exige(clause !== undefined && active(clause, 4) && !active(clause, 3), 'clause-absente-active-depuis-P4', `${CLAUSE_ABSENTE} introuvable ou non active de P4 dans la source en vigueur`);
      const texte = normaliser(texteDe(clause as Clause));

      // Controle negatif (V) : la source alteree prive vraiment docs/spec.md du texte de la clause. Le
      // generateur de T73 est celui du paquet construit (celui que la CLI emploie), lance a part.
      const sonde = sondeSpecAlteree(4);
      exige(
        texte.length > 0 && sonde.defaut === '' && sonde.vigueur.includes(texte) && !sonde.alteree.includes(texte),
        'source-alteree-prive-la-spec-de-la-clause',
        `CONTROLE-NEGATIF : texte de ${CLAUSE_ABSENTE} ${texte.length > 0 ? '' : 'VIDE '}; dans la spec en vigueur : ${sonde.vigueur.includes(texte)} ; dans la spec alteree : ${sonde.alteree.includes(texte)} ; ${sonde.defaut}`,
      );

      const k = calibrer('a3', repertoireJetable('registre-a3'), { source: SOURCE_CLAUSE_ABSENTE, candidat: CANDIDAT, drop: null });
      const echecs = echecsDe(k.appel.rapport);
      const defauts: string[] = [];
      if (k.appel.exit === 0) defauts.push(`la calibration a reussi (code 0) ${resume(k.appel)}`);
      if (k.succes !== false) defauts.push(`succes ${rendu(k.succes)} (attendu false) ${resume(k.appel)}`);
      const nommant = echecs.filter((x) => x.clause === CLAUSE_ABSENTE);
      if (!nommant.some((x) => x.periode === 4)) defauts.push(`aucun echec ne nomme ${CLAUSE_ABSENTE} a P4, sa periode d'entree (echecs : ${court(rendu(echecs), 1200)})`);
      for (const x of nommant) if (!active(clause as Clause, x.periode)) defauts.push(`echec nommant ${CLAUSE_ABSENTE} a P${x.periode}, ou elle n'est pas active`);
      const autres = echecs.filter((x) => x.clause !== CLAUSE_ABSENTE);
      if (autres.length > 0) defauts.push(`echec(s) nommant une autre clause : ${court(rendu(autres), 800)}`);
      aucunDefaut(defauts, 'calibration-echoue-en-nommant-la-clause-et-la-periode');
    },
    CASE_TIMEOUT_MS,
  );
});
