/**
 * acceptance/T56.spec.ts — suite d'acceptation de la tache T56.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T56.A1 absence   — chaque nom de champ, d'argument ou de reponse cite
 *                      par l'enonce d'une periode est un nom du contrat
 *                      `bench.candidate/2`, et l'enonce ne cite aucun autre
 *                      nom de champ
 *   T56.A2 behaviour — le prompt reel de chaque periode contient, pour
 *                      chaque operation du contrat, au moins un exemple de
 *                      requete et de reponse au format exact des messages,
 *                      et aucun de ces exemples ne reproduit une valeur
 *                      attendue par un controle du a cette periode
 *   T56.A3 behaviour — l'espace de travail de chaque periode contient un
 *                      script public qui rejoue ces exemples contre
 *                      `node candidate.mjs` et signale chaque ecart de
 *                      forme, sans connaitre les valeurs attendues des
 *                      controles
 *   T56.A4 behaviour — lance par `bench pilot-conduct --provider claude-cli
 *                      --live`, un candidat de reference dont les noms de
 *                      champs ET les valeurs proviennent du seul prompt
 *                      recu satisfait chaque controle du a chaque periode,
 *                      et ce meme candidat echoue si le prompt nomme un
 *                      champ autrement que le contrat
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T56 EST UNE TACHE D'EXTENSION (ADR-013) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T56 — `packages/
 * activities`, `apps/cli` — et ne les a lus ni directement ni par `git
 * show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff,
 * pas une barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T56.md et de sa source, docs/adr/ADR-013-un-seul-vocabulaire-
 * et-des-exemples-publics.md, lignes 61 a 67 (la plage que la carte de T56
 * epingle dans verification/tasks.extensions.json#spec_source), AINSI QUE
 * du corps narratif du MEME document ACCEPTE (hors de cette plage — la
 * meme liberte que prennent deja acceptance/T48.spec.ts a T55.spec.ts face
 * a leur propre ADR) :
 *
 *   « Ce que le troisieme essai reel a montre » : 56/56 taches prouvees ;
 *   la periode 1 n'est plus controlee que sur ses deux exigences dues, et
 *   le candidat emploie le vocabulaire attendu (`confirmed`). Il obtient
 *   pourtant 0 controle satisfait sur 2 : il repond `{ok, status:
 *   "confirmed", reservation_id}` la ou le contrat attend `{decision:
 *   "confirmed"}`. « Le candidat n'est pas en faute : les deux textes du
 *   prompt se contredisent. L'enonce (T53) dit "chaque reservation porte un
 *   statut" et nomme la cle `idempotency_key` ; le contrat dit
 *   `write(…, operation_key) -> {decision}`. T55.A3 ne pouvait pas le voir :
 *   son candidat de reference tire les valeurs du prompt, mais ses NOMS DE
 *   CHAMPS sont ecrits en dur. »
 *   « Decision » : « Un seul vocabulaire [...] Des exemples publics du
 *   protocole [...] Un verificateur de forme dans l'espace de travail [...]
 *   Un candidat de reference qui tire AUSSI ses noms de champs du prompt. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions et contrats DEJA
 * FIXES par les suites ACCEPTEES dont elle depend (jamais des sources de
 * T56) :
 *   - acceptance/T50.spec.ts (III)/acceptance/T52.spec.ts (III) : le contrat
 *     `bench.candidate/2` — six operations, `create_tenant {tenant_id} {}`,
 *     `advance_clock {to} {}`, `write {op,actor,tenant_id,admission_seq,
 *     operation_key} {decision}`, `read {tenant_id,key} {value}`,
 *     `probe_cancel {tenant_id,key} {decision}`, `fingerprint {} {sha256}` —
 *     REPRIS A L'IDENTIQUE, jamais re-derive.
 *   - acceptance/T48.spec.ts (III.2) : le protocole de transport — NDJSON,
 *     `{"id","op","args"}` -> `{"id","ok":true,"result"}` ou `{"id",
 *     "ok":false,"error":{"code","message"}}` — REPRIS A L'IDENTIQUE : c'est
 *     EXACTEMENT ce que cette suite entend par « format exact des messages »
 *     (A2).
 *   - acceptance/T53.spec.ts (III)/acceptance/T55.spec.ts (II.2) : la
 *     DESCRIPTION UNIFIEE exportee par packages/scenario/packages/activities
 *     (`loadPackage`/`flatten`/`noeudPeriode`/`portecontratV2`/
 *     `resoudreDescriptionUnifiee`/`vocabulaireDe`) comme ORACLE de l'enonce
 *     et du vocabulaire de chaque periode — REIMPLEMENTEE A L'IDENTIQUE ici
 *     (meme discipline que acceptance/T55.spec.ts face a acceptance/
 *     T53.spec.ts : jamais pour re-tester T53/T55, DEJA ACCEPTES, mais pour
 *     SERVIR D'ORACLE a T56).
 *   - acceptance/T51.spec.ts (II.6)/acceptance/T55.spec.ts (II.3) : la table
 *     ECHEANCE_CONTROLE CUMULEE des cinq controles fixes (ADR-009:L34) — 2
 *     dus a P1, 4 dus a P2 — REPRISE A L'IDENTIQUE.
 *   - acceptance/T52.spec.ts (II.8)/acceptance/T55.spec.ts (II.3) : le
 *     manifeste `manifest-t49-claude-cli-small.json` (DEUX periodes) et le
 *     candidat de reference FIXE `reservation-candidate-v2.mjs`, REPRIS SANS
 *     MODIFICATION — pour A2/A3, qui n'ont besoin d'aucune derivation de
 *     champ (le candidat FIXE suffit a observer le PROMPT et l'ESPACE DE
 *     TRAVAIL, jamais le contenu du candidat lui-meme).
 *   - acceptance/T55.spec.ts (II.1, II.5) : le mecanisme de PLAN
 *     d'enregistrement du prompt RECU par chaque invocation successive du
 *     faux `claude` (`BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR`/
 *     `_COUNTER_FILE`), et le mecanisme DE DERIVATION d'un candidat depuis
 *     le SEUL prompt recu (`BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE`) —
 *     REPRIS A L'IDENTIQUE (AUCUNE modification du faux executable lui-meme :
 *     acceptance/fixtures/claude-cli/bin/claude n'est pas touche par cette
 *     suite).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE AJOUTE OU FIXE ELLE-MEME (ADR-001 : aucune des valeurs
 * ci-dessous n'a ete obtenue en executant une implementation de T56 — aucune
 * n'existe au moment ou cette suite est ecrite)
 *
 * 1. LE VOCABULAIRE INTERDIT DE A1 (`BANNED_FIELD_NAMES`), CITE MOT POUR MOT
 *    PAR L'INCIDENT REEL D'ADR-013 : `statut`, `idempotency_key`. Cette
 *    suite n'exige PAS seulement leur absence : elle exige en outre, par un
 *    BALAYAGE GENERIQUE (toute suite de caracteres en minuscules jointe par
 *    UN OU PLUSIEURS tirets bas — le francais n'ecrit jamais ainsi, un tel
 *    jeton est donc PRESQUE SUREMENT une reference a un nom de champ), que
 *    TOUT jeton « en_tiret_bas » cite par l'enonce appartienne a l'ensemble
 *    FERME des jetons du contrat qui en comportent (`tenant_id`,
 *    `admission_seq`, `operation_key`, `create_tenant`, `advance_clock`,
 *    `probe_cancel`) — fermant ainsi la lecture LITTERALE de l'acceptation
 *    (« l'enonce ne cite AUCUN AUTRE nom de champ ») au-dela du seul couple
 *    nomme par l'incident.
 * 2. LE DETECTEUR D'EXEMPLES DE A2 (`exemplesDetectes`) : un segmenteur
 *    d'accolades EQUILIBREES (suffisant ici — aucun argument ni aucune
 *    reponse du contrat v2 n'imbrique d'objet) qui isole, pour CHAQUE
 *    operation, une enveloppe de REQUETE (`{"id",...,"op":"<operation>",
 *    "args":{...}}`) suivie, DANS UNE FENETRE DE PROXIMITE (600 caracteres —
 *    large assez pour un separateur « Reponse : », trop etroit pour sauter a
 *    l'exemple de l'operation SUIVANTE), d'une enveloppe de REPONSE
 *    (`{"id",...,"ok":true,"result":{...}}`). AUCUNE forme de serialisation
 *    n'est imposee au-dela de celle DEJA FIXEE par acceptance/T48.spec.ts
 *    (III.2) : ce detecteur est AUSSI celui, REUTILISE SANS MODIFICATION,
 *    qu'importe acceptance/fixtures/claude-cli/t56-derive-reference-
 *    candidate.mjs (zone ACCEPTANCE, DEJA publiee par cette meme tache) pour
 *    `operationKeyField` — UN SEUL mecanisme de lecture, jamais deux qui
 *    pourraient diverger.
 * 3. LE DECOUVREUR DE SCRIPT DE A3 (`trouverScriptDeVerification`) : cette
 *    suite ne nomme JAMAIS le fichier que l'implementation choisit d'ecrire
 *    (ADR-013 ne le nomme pas non plus) — elle enumere l'espace de travail
 *    (hors `.git`, `node_modules`, et le `candidate.mjs` DEJA ecrit par le
 *    candidat lui-meme) et retient tout fichier `.mjs`/`.js` dont le
 *    contenu mentionne AU MOINS DEUX noms d'operation du contrat ET une
 *    primitive d'interaction process (`spawn`/`readline`/`JSON.parse`) —
 *    assez pour distinguer un verificateur de forme d'un fichier etranger,
 *    jamais assez restrictif pour presupposer un nom.
 * 4. LE CANDIDAT DE REFERENCE DE A4, DERIVE DU PROMPT ET DE SES PROPRES
 *    NOMS DE CHAMPS (acceptance/fixtures/claude-cli/t56-derive-reference-
 *    candidate.mjs, publiee PAR CETTE TACHE — jamais une source de T56).
 *    Contrairement a acceptance/fixtures/claude-cli/t55-derive-reference-
 *    candidate.mjs (T55, qui code `decision`/`operation_key` EN DUR et ne
 *    derive que les VALEURS), ce module derive EN PLUS les DEUX noms de
 *    champ que l'incident reel met en cause : `decisionField` (la PREMIERE
 *    occurrence, n'importe ou dans le prompt, d'un nom de champ qui precede
 *    une valeur de decision — elle-meme DEJA extraite de l'enonce par
 *    CONTEXTE, jamais hypothesee a l'avance) et `operationKeyField` (le
 *    CINQUIEME nom d'argument de l'exemple `write`, par EXCLUSION des quatre
 *    autres, jamais par son propre nom attendu). Voir l'en-tete de ce
 *    fichier pour le detail et la justification complete du mecanisme.
 * 5. LE SCENARIO DE CONTROLE AUTONOME DE A4 (« prompt fabrique »,
 *    `ENONCE_FABRIQUE_CORRECT`/`ENONCE_FABRIQUE_MUTE`) : DEUX textes DE
 *    PROMPT, ECRITS PAR CETTE SUITE SELON LES SEULS GABARITS DE PHRASE DEJA
 *    FIXES PAR acceptance/T55.spec.ts (les `MOTIFS` de capture, REPRIS SANS
 *    MODIFICATION dans acceptance/fixtures/claude-cli/t56-derive-reference-
 *    candidate.mjs), jamais lus depuis une execution de pilot-conduct. Le
 *    premier nomme `decision` partout ; le second nomme le MEME champ
 *    `status` dans la seule section « enonce » (perturbation EXACTE de
 *    cases.extensions.lock.json#T56.A4 : « renommer decision en status dans
 *    l'enonce seulement »), tout en laissant l'exemple JSON de `write`
 *    conforme au contrat. Ce scenario donne a A4 une preuve AUTONOME,
 *    independante de l'existence d'une implementation de T56, que le
 *    MECANISME (derivation + moteur reel de controle) distingue
 *    correctement les deux — EXACTEMENT ce que le cas exige : « le candidat
 *    doit echouer [...] si le moteur ne le detecte pas ».
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 *   `pilot-conduct`,`run-period`,`candidate-control-report`,`--campaign-id`,
 *   `--postgres-database`,`--s3-bucket`,`--mode`,`recorded`,`--provider`,
 *   `claude-cli`,`--live`,`--candidate-workspace-root`,
 *   `--test-stop-after-periods`                                 — apps/cli/README.md (zone DOCS,
 *                                                                 jamais une source de T56 ; DEJA
 *                                                                 ACCEPTEES par T45/T46/T48/T49/
 *                                                                 T51/T52)
 *   `candidate_control_report`,`periods`,`period_index`,
 *   `satisfied`,`violated`,`trajectory_key`,`trajectories`,
 *   `candidate`,`workspace_dir`,`commit_sha`                      — acceptance/T51.spec.ts (II)/T52.spec.ts (II)
 *   `reserve@1`,`idempotence@1`,`cancel@1`,`fifo@1`,`isolation@1`,
 *   table ECHEANCE_CONTROLE                                      — acceptance/T51.spec.ts (II.6, SC-003 option A)
 *   `bench.candidate/2`, OPERATIONS_V2 (six operations, args,
 *   reponses)                                                    — acceptance/T50.spec.ts (III)/T52.spec.ts (III)
 *   `id`,`op`,`args`,`ok`,`result`,`error`,`code`,`message`,
 *   `ready`                                                      — acceptance/T48.spec.ts (III.2)/T52.spec.ts (II.4)
 *   `candidate.mjs`,`node candidate.mjs`                          — acceptance/T52.spec.ts (II.4)
 *   `statut`,`idempotency_key` (vocabulaire INTERDIT),
 *   « les deux textes du prompt se contredisent [...] tire AUSSI
 *   ses noms de champs du prompt »                                — docs/adr/ADR-013-un-seul-vocabulaire-et-des-exemples-publics.md
 *   `S1`,`2030-01-03T12:00:00Z`,`waiting`,`2030-01-02T12:00:00Z`,
 *   `NOT_FOUND`,`satisfied` (absence)                             — acceptance/T53.spec.ts (IV)
 *   `bench-fake-claude-cli-model-a`,`manifest-t49-claude-cli-
 *   small.json`,`periods_per_trajectory=2`                        — acceptance/T49.spec.ts (II)
 *   MOTIFS de capture du francais narratif (`statut parmi X ou Y`,
 *   `devient X dès qu`, `reçoit le statut X`, etc.)                — acceptance/T55.spec.ts (fixture t55-derive-reference-candidate.mjs)
 *
 * Les perturbations exactes de A1-A4 sont celles de
 * verification/cases.extensions.lock.json#T56, realisees mot pour mot par
 * verification/mutants/T56.json.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne redemontre ni le contrat bench.candidate/2 (T50/T52, DEJA
 *    ACCEPTES), ni le protocole de transport (T48), ni l'enonce/vocabulaire
 *    de periode au niveau de la description exportee (T53), ni le fait que
 *    ce prompt atteint reellement la session (T55) : elle REUTILISE ces
 *    resultats comme des oracles, jamais ne les re-prouve.
 *  • Elle n'exerce que P1 et P2 (le manifeste repris n'en porte que deux).
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T47/T49/T51/T52/
 *    T54/T55.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * commun — REPRIS, SANS LE REINVENTER, de acceptance/T52.spec.ts/
 * T54.spec.ts/T55.spec.ts (socle CLI+PostgreSQL+faux claude). */

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
const court = (s: string, n = 900): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t56_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
const WORKSPACES_CREES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of WORKSPACES_CREES) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

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

type AppelCli = {
  resultat: Json | null;
  exit: number | null;
  tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[];
};

function envDeBase(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

function lancer(sousCommande: string, drapeaux: string[], envSupp: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env = { ...envDeBase(), ...envSupp };
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 500) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, exit: dernierExit, tentatives };
  construireUneFois(tentatives);
  const second = essayer();
  return { resultat: second, exit: dernierExit, tentatives };
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ───────────────────────────── extraction de champs — FORME SOUPLE */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 10): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [{ chemin: '$', cle: '', v: racine, p: 0 }];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
    }
  }
  return out;
}
function champProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== null && n.valeur !== undefined) return n;
  }
  return null;
}
function tableauProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && Array.isArray(n.valeur)) return n;
  }
  return null;
}
const nombre = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : NaN;
const champTexte = (r: unknown, alias: readonly string[]): string | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
};
const champNombre = (r: unknown, alias: readonly string[]): number | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};

/* ════════════════════════ fixture claude-cli (reprise T47/T49/T52/T54/T55) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');

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

/** Environnement avec le pair RELPATH/CONTENT (T49, II.3) — UN seul contenu
 *  constant, pour A2/A3 (le candidat FIXE reservation-candidate-v2.mjs suffit
 *  a observer le prompt et l'espace de travail). */
function envEcritureConstante(opts: {
  relPath: string;
  content: string;
  recordPlanDir?: string;
  recordPlanCounterFile?: string;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH: opts.relPath,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT: opts.content,
  };
  if (opts.recordPlanDir !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR = opts.recordPlanDir;
  if (opts.recordPlanCounterFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE = opts.recordPlanCounterFile;
  verifierFauxEnTetePath(env);
  return env;
}

function nouveauPlanDeRecord(suffixe: string): { dir: string; counterFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t56-record-plan-${suffixe}-`));
  WORKSPACES_CREES.push(dir);
  return { dir, counterFile: path.join(dir, 'counter.txt') };
}
function recordPlanN(dir: string, n: number): Json | null {
  const f = path.join(dir, `record-${n}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
  } catch {
    return null;
  }
}
function argvPlanN(dir: string, n: number): string[] {
  const enreg = recordPlanN(dir, n);
  return Array.isArray(enreg?.argv) ? (enreg!.argv as unknown[]).map(String) : [];
}
/** Le prompt BRUT (ni normalise ni mis en minuscules) du N-ieme enregistrement —
 *  essentiel ici (contrairement aux suites qui ne comparent que des minuscules) :
 *  les exemples JSON de A2 sont sensibles a la CASSE des guillemets et des cles. */
function promptBrutPlanN(dir: string, n: number): string {
  const argv = argvPlanN(dir, n);
  const idxP = argv.indexOf('-p'); // convention FIXEE par acceptance/T49.spec.ts (II.4)
  return idxP >= 0 && idxP + 1 < argv.length ? (argv[idxP + 1] as string) : '';
}

/** Mecanisme de DERIVATION (acceptance/T55.spec.ts, A3) — REPRIS A L'IDENTIQUE,
 *  pointe vers le module de CETTE tache (acceptance/fixtures/claude-cli/
 *  t56-derive-reference-candidate.mjs). */
function envCandidatDeriveDuPrompt(opts: { deriveLogDir: string; recordPlanDir?: string; recordPlanCounterFile?: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: MODULE_DERIVATION_T56,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: opts.deriveLogDir,
  };
  if (opts.recordPlanDir !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR = opts.recordPlanDir;
  if (opts.recordPlanCounterFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE = opts.recordPlanCounterFile;
  verifierFauxEnTetePath(env);
  return env;
}
function derivedLogN(dir: string, n: number): { prompt: string; content: string; params: Json } | null {
  const f = path.join(dir, `derived-${n}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
    if (typeof j.content !== 'string') return null;
    return { prompt: typeof j.prompt === 'string' ? j.prompt : '', content: j.content, params: (j.params as Json) ?? {} };
  } catch {
    return null;
  }
}

/* ════════════════════ drapeaux et sous-commandes (repris T46/T49/T52/T55) */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21), reprise T49/T52/T55
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008:L149, reprise T49/T52/T55

const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const SOUS_COMMANDE_CONTROL_REPORT = 'candidate-control-report'; // FIXE par acceptance/T51.spec.ts (II.1)
const SOUS_COMMANDE_RUN_PERIOD = 'run-period'; // cahier:L355, repris T23/T45/T46/T49/T52/T55

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008:L98
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // T48 III.1, repris T49/T52/T54/T55
const DRAPEAU_ARRET_PERIODES = '--test-stop-after-periods'; // FIXE par acceptance/T46.spec.ts (II.1)
const DRAPEAU_REREAD = '--test-reread-period'; // FIXE par acceptance/T49.spec.ts (II.1)

const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_CANDIDATE_CONTROL_REPORT = ['candidate_control_report', 'candidatecontrolreport'];
const ALIAS_PERIODS_PERSISTED = ['periods_persisted', 'periodspersisted'];
const ALIAS_CANDIDATE = ['candidate', 'candidat'];
const ALIAS_WORKSPACE_DIR = ['workspace_dir', 'workspacedir'];

const periodsPersistedDe = (r: unknown): number | null => champNombre(r, ALIAS_PERIODS_PERSISTED);

function trajectoryKeyDe(r: unknown): string | null {
  const t = tableauProfond(r, ALIAS_TRAJECTOIRES);
  if (t === null || !Array.isArray(t.valeur) || t.valeur.length === 0) return null;
  return champTexte(t.valeur[0], ALIAS_TRAJECTORY_KEY);
}

function candidateDe(r: unknown): { workspaceDir: string | null } | null {
  const c = champProfond(r, ALIAS_CANDIDATE);
  if (c === null || c.valeur === null || typeof c.valeur !== 'object') return null;
  return { workspaceDir: champTexte(c.valeur, ALIAS_WORKSPACE_DIR) };
}

/** `candidate_control_report[trajectory_key].periods` (forme FIXEE par acceptance/T52.spec.ts, II.2). */
function controlPeriodsDe(r: unknown, trajectoryKey: string): { period_index: number; satisfied: number; violated: number }[] {
  const liste = tableauProfond(r, ALIAS_CANDIDATE_CONTROL_REPORT);
  if (liste === null || !Array.isArray(liste.valeur)) return [];
  for (const entree of liste.valeur as unknown[]) {
    if (champTexte(entree, ALIAS_TRAJECTORY_KEY) === trajectoryKey) {
      const per = tableauProfond(entree, ['periods']);
      if (per !== null && Array.isArray(per.valeur)) {
        return (per.valeur as unknown[]).map((p) => ({
          period_index: champNombre(p, ['period_index']) ?? -1,
          satisfied: champNombre(p, ['satisfied']) ?? -1,
          violated: champNombre(p, ['violated']) ?? -1,
        }));
      }
    }
  }
  return [];
}

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t56-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t56-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

/** `bench pilot-conduct` sur la campagne `ctx`, mode `claude-cli --live` (AUCUN
 *  drapeau nouveau par rapport a T46/T49/T52/T54/T55). */
function conduire(ctx: Contexte, extra: string[], env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [
      MANIFEST_T56,
      DRAPEAU_CAMPAGNE, ctx.campaignId,
      DRAPEAU_PG, ctx.db,
      DRAPEAU_S3, ctx.bucket,
      DRAPEAU_MODE, MODE,
      DRAPEAU_PROVIDER, PROVIDER_CLAUDE_CLI,
      DRAPEAU_LIVE,
      DRAPEAU_WORKSPACE_ROOT, ctx.workspaceRoot,
      ...extra,
    ],
    env,
  );
}
function candidateControlReportDirect(trajectoryKey: string, db: string): AppelCli {
  return lancer(SOUS_COMMANDE_CONTROL_REPORT, [DRAPEAU_CAMPAGNE, trajectoryKey, DRAPEAU_PG, db]);
}
/** `run-period --test-reread-period <n>`, processus NEUF, AUCUNE session — RELIT la periode
 *  N DEJA PERSISTEE par un appel `pilot-conduct` anterieur (REPRIS A L'IDENTIQUE de
 *  acceptance/T49.spec.ts/T52.spec.ts/T55.spec.ts). C'est la SEULE commande dont le resultat
 *  porte `candidate.workspace_dir`/`candidate.commit_sha` (T52, II) : le resultat de
 *  `pilot-conduct` lui-meme ne les porte pas. */
function relirePeriode(trajectoryKey: string, db: string, bucket: string, n: number): AppelCli {
  return lancer(SOUS_COMMANDE_RUN_PERIOD, [
    DRAPEAU_MODE, MODE,
    DRAPEAU_CAMPAGNE, trajectoryKey,
    DRAPEAU_PG, db,
    DRAPEAU_S3, bucket,
    DRAPEAU_REREAD, String(n),
  ]);
}

/* ───────────────── manifeste et fixture de candidat, JAMAIS des sources de T56 */

/** REPRIS A L'IDENTIQUE de acceptance/T49.spec.ts (II)/T52/T54/T55 : UNE
 *  trajectoire, DEUX periodes, modele `bench-fake-claude-cli-model-a`. */
const MANIFEST_T56 = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t49-claude-cli-small.json');

/** REPRIS A L'IDENTIQUE de acceptance/T51.spec.ts (fixtures)/T52/T55 : le
 *  candidat de reference qui respecte `bench.candidate/2` ET satisfait les
 *  cinq classes de controle a chaque periode ou elles sont dues. Contenu
 *  JAMAIS lu ni recopie (A2/A3 n'ont besoin que de l'OBSERVER tourner). */
const REFERENCE_V2 = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'reservation-candidate-v2.mjs');
if (!fs.existsSync(REFERENCE_V2)) throw new Error(`FIXTURE-ABSENTE : ${REFERENCE_V2}`);
const CONTENU_CANDIDAT_CORRECT = fs.readFileSync(REFERENCE_V2, 'utf8');
const ENTREE_CANDIDATE = 'candidate.mjs'; // FIXE par acceptance/T52.spec.ts (II.4)

/** Module de derivation de CETTE tache (zone ACCEPTANCE, publie par T56). */
const MODULE_DERIVATION_T56 = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't56-derive-reference-candidate.mjs');
if (!fs.existsSync(MODULE_DERIVATION_T56)) throw new Error(`FIXTURE-ABSENTE : ${MODULE_DERIVATION_T56}`);

/* Les cinq identifiants FIXES par ADR-009:L34, et leur table d'echeance
 * CUMULEE, REPRISE A L'IDENTIQUE de acceptance/T51.spec.ts (II.6)/
 * T55.spec.ts (II.3). Jamais re-derivee ici. */
const CONTROLES_FIXES = ['reserve@1', 'idempotence@1', 'cancel@1', 'fifo@1', 'isolation@1'] as const;
type IdControle = (typeof CONTROLES_FIXES)[number];
const ECHEANCE_CONTROLE: Record<IdControle, number> = {
  'reserve@1': 1,
  'idempotence@1': 1,
  'cancel@1': 2,
  'fifo@1': 2,
  'isolation@1': 4,
};
function nombreControlesDus(k: number): number {
  return CONTROLES_FIXES.filter((id) => ECHEANCE_CONTROLE[id] <= k).length;
}

/* ════════════════════ oracle de l'enonce/vocabulaire de periode (reprise
 * T53/T55, III.1-2 — JAMAIS re-verifie ici, sert SEULEMENT d'ORACLE) */

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
function specifiersForPackage(pkgDirName: string): string[] {
  const dir = path.join(REPO, 'packages', pkgDirName);
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
  for (const rel of ['dist/index.js', 'src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}
async function loadPackage(pkgDirName: string): Promise<{ ns: Ns | null; attempts: string[] }> {
  const attempts: string[] = [];
  for (const s of specifiersForPackage(pkgDirName)) {
    try {
      const mod = (await import(s)) as Ns;
      return { ns: mod, attempts };
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  attempts.push(`paquet packages/${pkgDirName} : aucun specificateur n'a repondu`);
  return { ns: null, attempts };
}

let ORACLE: { charge: boolean; flat: Map<string, unknown>; attempts: string[] } = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };
beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  let unCharge = false;
  for (const pkg of ['scenario', 'activities']) {
    const { ns, attempts: a } = await loadPackage(pkg);
    attempts.push(...a);
    if (ns !== null) {
      flatten(ns, flat);
      unCharge = true;
    }
  }
  ORACLE = { charge: unCharge, flat, attempts };
}, CASE_TIMEOUT_MS);
function assertOracleLoaded(): void {
  exige(
    ORACLE.charge,
    'oracle-packages-scenario-ou-activities-charges',
    `AUCUN-DES-DEUX-PAQUETS-N-A-PU-ETRE-CHARGE (oracle de l'enonce indisponible) : ${ORACLE.attempts.join(' | ')}`,
  );
}

const MARQUEUR_CONTRAT = 'bench.candidate/2'; // acceptance/T50.spec.ts (III)
const NOMS_OPERATIONS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint']; // acceptance/T50.spec.ts (III)
function portecontratV2(racine: unknown): boolean {
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && n.valeur === MARQUEUR_CONTRAT) return true;
  }
  let trouvees = 0;
  const vusOps = new Set<string>();
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && NOMS_OPERATIONS_V2.includes(n.valeur) && !vusOps.has(n.valeur)) {
      vusOps.add(n.valeur);
      trouvees += 1;
    }
  }
  return trouvees >= 4;
}

const PERIODES = ['P1', 'P2', 'P3', 'P4'] as const;
type Periode = (typeof PERIODES)[number];

function noeudPeriode(racine: unknown, cle: Periode): Json | null {
  const cibleNorm = normKey(cle);
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && normKey(n.cle) === cibleNorm && n.valeur !== null && typeof n.valeur === 'object' && !Array.isArray(n.valeur)) {
      return n.valeur as Json;
    }
  }
  const indexAttendu = PERIODES.indexOf(cle);
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur)) {
      for (let i = 0; i < n.valeur.length; i += 1) {
        const entree = n.valeur[i];
        if (entree === null || typeof entree !== 'object') continue;
        const idTexte = champTexte(entree, ['id', 'key', 'period', 'periode', 'periodid', 'periodkey']);
        if (idTexte !== null && normKey(idTexte) === cibleNorm) return entree as Json;
      }
    }
  }
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur) && n.valeur.length === PERIODES.length) {
      const entree = n.valeur[indexAttendu];
      if (entree !== null && typeof entree === 'object' && champTexte(entree, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) {
        return entree as Json;
      }
    }
  }
  return null;
}
const NOM_AGREGAT_DES_EXPORTS = '(ensemble des exports aplatis)';
function candidatsDescription(): { nom: string; valeur: unknown }[] {
  const out: { nom: string; valeur: unknown }[] = [];
  for (const [k, v] of ORACLE.flat.entries()) {
    if (v !== null && typeof v === 'object') out.push({ nom: k, valeur: v });
  }
  out.push({ nom: NOM_AGREGAT_DES_EXPORTS, valeur: Object.fromEntries(ORACLE.flat.entries()) });
  return out;
}
function resoudreDescriptionUnifiee(): { valeur: Json; nom: string } | null {
  for (const c of candidatsDescription()) {
    if (!portecontratV2(c.valeur)) continue;
    let periodesAvecEnonce = 0;
    for (const p of PERIODES) {
      const n = noeudPeriode(c.valeur, p);
      if (n !== null && champTexte(n, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) periodesAvecEnonce += 1;
    }
    if (periodesAvecEnonce >= 2) return { valeur: c.valeur as Json, nom: c.nom };
  }
  return null;
}
function requireDescriptionUnifiee(): Json {
  const r = resoudreDescriptionUnifiee();
  exige(
    r !== null,
    'oracle-description-unifiee-resolue',
    `ORACLE-DESCRIPTION-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT} et au moins deux enonces de periode. Exports vus : ${rendu([...ORACLE.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}
function enonceDe(description: Json, p: Periode): string | null {
  const node = noeudPeriode(description, p);
  if (node === null) return null;
  return champTexte(node, ['statement', 'enonce', 'narrative', 'prose', 'text']);
}
function vocabulaireDe(description: Json, p: Periode): string[] {
  const node = noeudPeriode(description, p);
  if (node === null) return [];
  const vocab = tableauProfond(node, ['vocabulary', 'vocabulaire', 'responsevalues', 'valeursdereponse', 'expectedvalues', 'values']);
  if (vocab === null || !Array.isArray(vocab.valeur)) return [];
  return vocab.valeur.filter((v): v is string => typeof v === 'string');
}

/* ════════════════════════════════════ III — contrat bench.candidate/2, FIXE
 * par acceptance/T50.spec.ts/T52.spec.ts (REPRIS A L'IDENTIQUE) */

type OperationV2 = { op: string; args: string[]; reponse: string[] };
const OPERATIONS_V2: OperationV2[] = [
  { op: 'create_tenant', args: ['tenant_id'], reponse: [] },
  { op: 'advance_clock', args: ['to'], reponse: [] },
  { op: 'write', args: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key'], reponse: ['decision'] },
  { op: 'read', args: ['tenant_id', 'key'], reponse: ['value'] },
  { op: 'probe_cancel', args: ['tenant_id', 'key'], reponse: ['decision'] },
  { op: 'fingerprint', args: [], reponse: ['sha256'] },
];

/** Vocabulaire INTERDIT par A1 — cite MOT POUR MOT par ADR-013 (« Ce que le
 *  troisieme essai reel a montre »). Jamais un nom du contrat. */
const BANNED_FIELD_NAMES = ['statut', 'idempotency_key'] as const; // source:docs/adr/ADR-013:L10-14

/** Les jetons « en_tiret_bas » du contrat (seuls ceux-ci peuvent legitimement
 *  apparaitre sous cette forme dans un enonce francais — voir en-tete II.1). */
const CONTRACT_SNAKE_TOKENS = new Set(['tenant_id', 'admission_seq', 'operation_key', 'create_tenant', 'advance_clock', 'probe_cancel']);

const echapperRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `jeton` figure-t-il dans `source` comme jeton ENTIER (jamais comme fragment
 *  d'un identifiant plus long) ? Insensible a la casse. */
const contientJeton = (source: string, jeton: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_])${echapperRe(jeton)}(?![A-Za-z0-9_])`, 'iu').test(source);

/** Tout jeton `[a-z][a-z0-9]*(_[a-z0-9]+)+` cite par `texte` — le francais
 *  n'ecrit jamais ainsi : un tel jeton est presque surement une reference a
 *  un nom de champ/argument/operation. */
function jetonsEnTiretBas(texte: string): string[] {
  const re = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte)) !== null) out.add(m[0]);
  return [...out];
}

/* ════════════════════ IV — detecteur d'exemples « format exact des messages »
 * (A2) — MEME mecanisme, SANS MODIFICATION, que celui qu'importe
 * acceptance/fixtures/claude-cli/t56-derive-reference-candidate.mjs pour
 * `operationKeyField` (UN SEUL lecteur d'enveloppes, jamais deux). */

function segmentsAccolades(texte: string): { texte: string; debut: number; fin: number }[] {
  const out: { texte: string; debut: number; fin: number }[] = [];
  let profondeur = 0;
  let debut = -1;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (c === '{') {
      if (profondeur === 0) debut = i;
      profondeur += 1;
    } else if (c === '}') {
      profondeur -= 1;
      if (profondeur === 0 && debut >= 0) {
        out.push({ texte: texte.slice(debut, i + 1), debut, fin: i + 1 });
        debut = -1;
      } else if (profondeur < 0) {
        profondeur = 0;
      }
    }
  }
  return out;
}
function clesDe(fragment: string): string[] {
  const out: string[] = [];
  const re = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) out.push(m[1] as string);
  return out;
}
function sousObjet(enveloppe: string, nomChamp: string): string | null {
  const re = new RegExp(`"${nomChamp}"\\s*:\\s*(\\{[^{}]*\\})`, 'u');
  const m = re.exec(enveloppe);
  return m !== null ? (m[1] as string) : null;
}

type ExempleDetecte = { requete: { texte: string; debut: number; fin: number; argsKeys: string[] }; reponse: { texte: string; resultKeys: string[] } };
const FENETRE_PROXIMITE_EXEMPLE = 600;

/** Pour l'operation `op`, l'EXEMPLE requete->reponse « format exact des
 *  messages » le plus proche dans `promptBrut`, ou `null` si absent —
 *  exactement le mecanisme que la perturbation lock'ee de A2 nomme (« retirer
 *  l'exemple de l'operation write du prompt : le cas doit rougir »). */
function exempleDetecte(promptBrut: string, operation: OperationV2): ExempleDetecte | null {
  const enveloppes = segmentsAccolades(promptBrut);
  for (const req of enveloppes) {
    if (!new RegExp(`"op"\\s*:\\s*"${operation.op}"`, 'u').test(req.texte)) continue;
    const argsTexte = sousObjet(req.texte, 'args');
    if (argsTexte === null) continue;
    const argsKeys = clesDe(argsTexte);
    if (!operation.args.every((a) => argsKeys.includes(a))) continue;
    // Reponse : la PROCHAINE enveloppe `{"ok":true,"result":{...}}` dans la
    // fenetre de proximite, APRES la fin de la requete.
    for (const res of enveloppes) {
      if (res.debut < req.fin || res.debut - req.fin > FENETRE_PROXIMITE_EXEMPLE) continue;
      if (!/"ok"\s*:\s*true/u.test(res.texte)) continue;
      const resultTexte = sousObjet(res.texte, 'result');
      if (resultTexte === null) continue;
      const resultKeys = clesDe(resultTexte);
      if (!operation.reponse.every((r) => resultKeys.includes(r))) continue;
      return { requete: { texte: req.texte, debut: req.debut, fin: req.fin, argsKeys }, reponse: { texte: res.texte, resultKeys } };
    }
  }
  return null;
}

/* ════════════════════ V — decouvreur de script de verification (A3) */

function listerFichiersRecursifs(dir: string, exclure: readonly string[] = ['.git', 'node_modules']): string[] {
  const out: string[] = [];
  const pile = [dir];
  while (pile.length > 0) {
    const d = pile.pop() as string;
    let entrees: fs.Dirent[];
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entrees) {
      if (exclure.includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) pile.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out;
}

/** Un fichier plausiblement verificateur-de-forme : mentionne AU MOINS DEUX
 *  noms d'operation du contrat ET une primitive d'interaction process. */
function estScriptDeVerificationPlausible(contenu: string): boolean {
  const opsVues = NOMS_OPERATIONS_V2.filter((o) => contientJeton(contenu, o)).length;
  const interagitAvecUnProcessus = /spawn|readline|JSON\.parse|execFile/u.test(contenu);
  return opsVues >= 2 && interagitAvecUnProcessus;
}

type ScriptTrouve = { cheminAbsolu: string; cheminRelatif: string; contenu: string };
/** Enumere `workspaceDir` (hors `.git`/`node_modules`/le `candidate.mjs` DEJA
 *  ecrit par le candidat) et retient le premier fichier `.mjs`/`.js`
 *  plausiblement verificateur — cette suite NE NOMME JAMAIS a l'avance le
 *  fichier que l'implementation choisit d'ecrire (voir en-tete II.3). */
function trouverScriptDeVerification(workspaceDir: string): ScriptTrouve | null {
  if (!fs.existsSync(workspaceDir)) return null;
  for (const f of listerFichiersRecursifs(workspaceDir)) {
    if (!/\.(mjs|js)$/u.test(f)) continue;
    const rel = path.relative(workspaceDir, f);
    if (rel === ENTREE_CANDIDATE || rel.endsWith(`${path.sep}${ENTREE_CANDIDATE}`)) continue;
    let contenu: string;
    try {
      contenu = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (estScriptDeVerificationPlausible(contenu)) return { cheminAbsolu: f, cheminRelatif: rel, contenu };
  }
  return null;
}

/* ════════════════════ VI — scenario de prompt FABRIQUE (A4, scenario autonome)
 * — ECRIT PAR CETTE SUITE selon les SEULS gabarits de phrase DEJA FIXES par
 * acceptance/T55.spec.ts (fixture t55-derive-reference-candidate.mjs, MOTIFS,
 * REPRIS SANS MODIFICATION dans acceptance/fixtures/claude-cli/
 * t56-derive-reference-candidate.mjs) — JAMAIS lu depuis une execution de
 * pilot-conduct. Voir en-tete II.5/III. */

const EXEMPLE_WRITE_CONFORME =
  '{"id":"ex-write-1","op":"write","args":{"op":"reserve","actor":"A","tenant_id":"t1","admission_seq":1,"operation_key":"k1"}} -> {"id":"ex-write-1","ok":true,"result":{"decision":"confirmed"}}';

/** Prompt FABRIQUE ou le champ de decision est nomme `decision` PARTOUT —
 *  controle POSITIF autonome de A4. */
const ENONCE_FABRIQUE_CORRECT = [
  'Enoncé des exigences.',
  'Le creneau a une capacité de 1 place.',
  "A la premiere ecriture reserve, la reservation devient confirmed dès qu'une place est libre au creneau.",
  "Un second appelant reçoit le statut waiting en file d'attente, ordonnee par sequence d'admission.",
  "Une reservation annulée porte le statut cancelled apres une ecriture cancel reussie.",
  "Le champ de decision s'appelle `decision`, par exemple `{\"decision\":\"confirmed\"}` pour une reservation confirmee.",
  'Exigences révélées.',
  'Exemples publics du protocole.',
  EXEMPLE_WRITE_CONFORME,
].join(' ');

/** Prompt FABRIQUE ou l'ENONCE (SEULEMENT) nomme ce meme champ `status` —
 *  perturbation EXACTE de cases.extensions.lock.json#T56.A4 (« renommer
 *  decision en status dans l'enonce seulement »). L'exemple JSON de `write`,
 *  dans la section « Exemples publics », RESTE conforme au contrat : le
 *  candidat de reference doit NEANMOINS echouer, puisque c'est l'ENONCE —
 *  et non l'exemple — que cette mutation vise. */
const ENONCE_FABRIQUE_MUTE = [
  'Enoncé des exigences.',
  'Le creneau a une capacité de 1 place.',
  "A la premiere ecriture reserve, la reservation devient confirmed dès qu'une place est libre au creneau.",
  "Un second appelant reçoit le statut waiting en file d'attente, ordonnee par sequence d'admission.",
  "Une reservation annulée porte le statut cancelled apres une ecriture cancel reussie.",
  'Le champ de decision s\'appelle `status`, par exemple `{"status":"confirmed"}` pour une reservation confirmee.',
  'Exigences révélées.',
  'Exemples publics du protocole.',
  EXEMPLE_WRITE_CONFORME,
].join(' ');

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T56 — un seul vocabulaire et des exemples publics du protocole', () => {
  test(
    'T56.A1 chaque nom de champ cite par l enonce d une periode est un nom du contrat bench.candidate/2, et l enonce n en cite aucun autre (ADR-013)',
    () => {
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();

      const periodesAvecEnonce = PERIODES.filter((p) => enonceDe(description, p) !== null);
      exige(
        periodesAvecEnonce.length >= 2,
        'au-moins-deux-periodes-avec-enonce',
        `periodes avec enonce : ${rendu(periodesAvecEnonce)} — description ${rendu(description)}`,
      );

      const violationsBannies: string[] = [];
      const violationsInconnues: string[] = [];
      const absencesCanonique: string[] = [];

      for (const p of periodesAvecEnonce) {
        const enonce = enonceDe(description, p) as string;

        // Vocabulaire INTERDIT, cite mot pour mot par l'incident reel.
        for (const banni of BANNED_FIELD_NAMES) {
          if (contientJeton(enonce, banni)) violationsBannies.push(`${p}:${banni}`);
        }

        // Balayage GENERIQUE « en_tiret_bas » : tout jeton de cette forme doit
        // appartenir a l'ensemble FERME des jetons du contrat qui en comportent.
        for (const jeton of jetonsEnTiretBas(enonce)) {
          if (!CONTRACT_SNAKE_TOKENS.has(jeton)) violationsInconnues.push(`${p}:${jeton}`);
        }

        // Presence des DEUX noms canoniques que l'incident reel oppose aux
        // noms bannis — le write/idempotence est du depuis P1 (table
        // ECHEANCE_CONTROLE), donc l'enonce de CHAQUE periode avec enonce doit
        // deja employer ce vocabulaire.
        if (!contientJeton(enonce, 'operation_key')) absencesCanonique.push(`${p}:operation_key`);
        if (!contientJeton(enonce, 'decision')) absencesCanonique.push(`${p}:decision`);
      }

      exige(
        violationsBannies.length === 0,
        'aucun-nom-de-champ-banni-dans-l-enonce',
        `NOM(S) BANNI(S) TROUVE(S) (ADR-013, incident reel) : ${rendu(violationsBannies)}`,
      );
      exige(
        violationsInconnues.length === 0,
        'aucun-jeton-en-tiret-bas-hors-du-contrat-dans-l-enonce',
        `JETON(S) « en_tiret_bas » HORS DU CONTRAT : ${rendu(violationsInconnues)} (jetons admis : ${rendu([...CONTRACT_SNAKE_TOKENS])})`,
      );
      exige(
        absencesCanonique.length === 0,
        'les-deux-noms-canoniques-operation_key-et-decision-sont-cites',
        `NOM(S) CANONIQUE(S) ABSENT(S) DE L'ENONCE : ${rendu(absencesCanonique)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T56.A2 le prompt reel de chaque periode (pilot-conduct --provider claude-cli --live) contient, pour chaque operation, un exemple requete->reponse au format exact des messages, sans reproduire une valeur attendue par un controle du a cette periode (ADR-013)',
    async () => {
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();

      const ctx = nouveauContexte('a2');
      const plan = nouveauPlanDeRecord('a2');
      const env = envEcritureConstante({
        relPath: ENTREE_CANDIDATE,
        content: CONTENU_CANDIDAT_CORRECT,
        recordPlanDir: plan.dir,
        recordPlanCounterFile: plan.counterFile,
      });
      const run = conduire(ctx, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A2)', run));
      exige(periodsPersistedDe(run.resultat) === 2, 'deux-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      const prompts: Record<'P1' | 'P2', string> = { P1: promptBrutPlanN(plan.dir, 0), P2: promptBrutPlanN(plan.dir, 1) };
      exige(prompts.P1.length > 0, 'prompt-reel-periode-1-capture', `AUCUN prompt capture a ${plan.dir}/record-0.json — argv ${rendu(argvPlanN(plan.dir, 0))}`);
      exige(prompts.P2.length > 0, 'prompt-reel-periode-2-capture', `AUCUN prompt capture a ${plan.dir}/record-1.json — argv ${rendu(argvPlanN(plan.dir, 1))}`);

      const manquants: string[] = [];
      const fuites: string[] = [];
      for (const periode of ['P1', 'P2'] as const) {
        const promptBrut = prompts[periode];
        const vocabDu = vocabulaireDe(description, periode);
        for (const operation of OPERATIONS_V2) {
          const ex = exempleDetecte(promptBrut, operation);
          if (ex === null) {
            manquants.push(`${periode}:${operation.op}`);
            continue;
          }
          const fuite = vocabDu.find((valeur) => contientJeton(ex.reponse.texte, valeur));
          if (fuite !== undefined) fuites.push(`${periode}:${operation.op}:${fuite}`);
        }
      }

      exige(
        manquants.length === 0,
        'chaque-operation-a-un-exemple-requete-reponse-au-format-exact-dans-chaque-periode',
        `EXEMPLE(S) MANQUANT(S) : ${rendu(manquants)} — prompt P1 ${rendu(court(prompts.P1, 1200))} / prompt P2 ${rendu(court(prompts.P2, 1200))}`,
      );
      exige(
        fuites.length === 0,
        'aucun-exemple-ne-reproduit-une-valeur-attendue-par-un-controle-du',
        `FUITE(S) DE VALEUR CONTROLEE DANS UN EXEMPLE : ${rendu(fuites)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T56.A3 l espace de travail de chaque periode contient un script public qui rejoue les exemples contre node candidate.mjs et signale un ecart de forme, sans connaitre les valeurs attendues des controles (ADR-013)',
    () => {
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();

      const ctx = nouveauContexte('a3');
      const env = envEcritureConstante({ relPath: ENTREE_CANDIDATE, content: CONTENU_CANDIDAT_CORRECT });

      // ETAPE 1 — periode 1 SEULE (« reprise », meme discipline que
      // acceptance/T55.spec.ts, A4, II.4 : le script doit exister a CHAQUE
      // periode, pas seulement a la fin de la trajectoire).
      const run1 = conduire(ctx, [DRAPEAU_ARRET_PERIODES, '1'], env);
      exige(run1.resultat !== null && run1.exit === 0, 'pilot-conduct-periode-1-executee', messageEchec('pilot-conduct(claude-cli,--live,A3,p1)', run1));
      const trajKey1 = trajectoryKeyDe(run1.resultat);
      exige(typeof trajKey1 === 'string' && trajKey1.length > 0, 'trajectory_key-lisible-apres-p1', `vu ${rendu(trajKey1)} dans ${rendu(run1.resultat)}`);
      const relue1 = relirePeriode(trajKey1 as string, ctx.db, ctx.bucket, 1);
      exige(relue1.resultat !== null && relue1.exit === 0, 'periode-1-relue-independamment', messageEchec('run-period(--test-reread-period 1)', relue1));
      const workspaceDir1 = candidateDe(relue1.resultat)?.workspaceDir ?? null;
      exige(typeof workspaceDir1 === 'string' && workspaceDir1.length > 0, 'workspace_dir-lisible-apres-p1', `vu ${rendu(workspaceDir1)} dans ${rendu(relue1.resultat)}`);

      const script1 = trouverScriptDeVerification(workspaceDir1 as string);
      exige(
        script1 !== null,
        'script-de-verification-de-forme-present-apres-p1',
        `ABSENT de ${workspaceDir1} — fichiers vus : ${rendu(listerFichiersRecursifs(workspaceDir1 as string).map((f) => path.relative(workspaceDir1 as string, f)))}`,
      );
      const vocabP1 = vocabulaireDe(description, 'P1');
      const fuiteScript1 = vocabP1.find((v) => (script1 as ScriptTrouve).contenu.includes(v));
      exige(
        fuiteScript1 === undefined,
        'script-p1-ne-connait-pas-les-valeurs-attendues-des-controles',
        `VALEUR CONTROLEE TROUVEE EN DUR DANS LE SCRIPT (${(script1 as ScriptTrouve).cheminRelatif}) : ${rendu(fuiteScript1)}`,
      );

      // ETAPE 2 — reprise sur la MEME campagne, jusqu'a la fin (periode 2).
      const run2 = conduire(ctx, [], env);
      exige(run2.resultat !== null && run2.exit === 0, 'pilot-conduct-reprise-jusqu-a-la-fin-executee', messageEchec('pilot-conduct(claude-cli,--live,A3,reprise)', run2));
      exige(periodsPersistedDe(run2.resultat) === 2, 'deux-periodes-persistees-apres-reprise', `vu ${rendu(periodsPersistedDe(run2.resultat))} dans ${rendu(run2.resultat)}`);
      const relue2 = relirePeriode(trajKey1 as string, ctx.db, ctx.bucket, 2);
      exige(relue2.resultat !== null && relue2.exit === 0, 'periode-2-relue-independamment', messageEchec('run-period(--test-reread-period 2)', relue2));
      const workspaceDir2 = candidateDe(relue2.resultat)?.workspaceDir ?? null;
      exige(typeof workspaceDir2 === 'string' && workspaceDir2.length > 0, 'workspace_dir-lisible-apres-p2', `vu ${rendu(workspaceDir2)} dans ${rendu(relue2.resultat)}`);

      const script2 = trouverScriptDeVerification(workspaceDir2 as string);
      exige(
        script2 !== null,
        'script-de-verification-de-forme-present-apres-p2',
        `ABSENT de ${workspaceDir2} — fichiers vus : ${rendu(listerFichiersRecursifs(workspaceDir2 as string).map((f) => path.relative(workspaceDir2 as string, f)))}`,
      );
      const vocabP2 = vocabulaireDe(description, 'P2');
      const fuiteScript2 = vocabP2.find((v) => (script2 as ScriptTrouve).contenu.includes(v));
      exige(
        fuiteScript2 === undefined,
        'script-p2-ne-connait-pas-les-valeurs-attendues-des-controles',
        `VALEUR CONTROLEE TROUVEE EN DUR DANS LE SCRIPT (${(script2 as ScriptTrouve).cheminRelatif}) : ${rendu(fuiteScript2)}`,
      );

      // CONTROLE COMPORTEMENTAL (proof_kind=behaviour, pas seulement un
      // controle d'artefact) : le script REJOUE reellement les exemples —
      // son execution contre le candidat CORRECT doit OBSERVABLEMENT differer
      // de son execution contre un candidat qui renomme `decision`.
      const dirCorrect = fs.mkdtempSync(path.join(os.tmpdir(), 't56-a3-correct-'));
      WORKSPACES_CREES.push(dirCorrect);
      fs.cpSync(workspaceDir2 as string, dirCorrect, { recursive: true });

      const dirErrone = fs.mkdtempSync(path.join(os.tmpdir(), 't56-a3-errone-'));
      WORKSPACES_CREES.push(dirErrone);
      fs.cpSync(workspaceDir2 as string, dirErrone, { recursive: true });
      const candidatErrone = CONTENU_CANDIDAT_CORRECT.replace(/"decision"/g, '"statut_errone"').replace(/\bdecision\b/g, 'statut_errone');
      fs.writeFileSync(path.join(dirErrone, ENTREE_CANDIDATE), candidatErrone);

      const executerScript = (dirBase: string): { exit: number | null; sortie: string } => {
        try {
          const out = execFileSync('node', [(script2 as ScriptTrouve).cheminRelatif], {
            cwd: dirBase,
            encoding: 'utf8',
            timeout: PROC_TIMEOUT_MS,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          return { exit: 0, sortie: out };
        } catch (e) {
          const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
          return { exit: err.status ?? null, sortie: `${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}` };
        }
      };
      const resCorrect = executerScript(dirCorrect);
      const resErrone = executerScript(dirErrone);
      exige(
        resCorrect.exit !== resErrone.exit || resCorrect.sortie !== resErrone.sortie,
        'le-script-distingue-observablement-un-candidat-conforme-d-un-candidat-qui-renomme-decision',
        `MEME OBSERVATION pour le candidat CORRECT et pour un candidat qui renomme 'decision' — exit ${rendu(resCorrect.exit)}/${rendu(resErrone.exit)}, sortie ${rendu(court(resCorrect.sortie, 400))}/${rendu(court(resErrone.sortie, 400))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T56.A4 un candidat de reference dont les noms de champs ET les valeurs proviennent du seul prompt recu satisfait chaque controle du a chaque periode (pilot-conduct --provider claude-cli --live), et le meme mecanisme echoue si le prompt nomme un champ autrement que le contrat (ADR-013)',
    async () => {
      const derivation = (await import(pathToFileURL(MODULE_DERIVATION_T56).href)) as {
        deriver: (e: { prompt: string; cwd: string; fs: typeof fs; path: typeof path }) => { relPath: string; content: string; params: Json };
      };

      /* ─── (1) scenario AUTONOME, controle POSITIF : prompt fabrique ou
       * `decision` est nomme partout — le mecanisme doit satisfaire chaque
       * controle du a la periode 1. */
      const ctxPos = nouveauContexte('a4-fabrique-correct');
      const dirPos = fs.mkdtempSync(path.join(os.tmpdir(), 't56-a4-pos-'));
      WORKSPACES_CREES.push(dirPos);
      const derivePos = derivation.deriver({ prompt: ENONCE_FABRIQUE_CORRECT, cwd: dirPos, fs, path });
      exige(
        typeof (derivePos.params as Json).decisionField === 'string' && (derivePos.params as Json).decisionField === 'decision',
        'scenario-fabrique-correct-derive-decisionField=decision',
        `vu ${rendu((derivePos.params as Json).decisionField)} dans ${rendu(derivePos.params)}`,
      );
      const envPos = envEcritureConstante({ relPath: derivePos.relPath, content: derivePos.content });
      const runPos = conduire(ctxPos, [DRAPEAU_ARRET_PERIODES, '1'], envPos);
      exige(runPos.resultat !== null && runPos.exit === 0, 'pilot-conduct-scenario-fabrique-correct-execute', messageEchec('pilot-conduct(A4,fabrique-correct)', runPos));
      const trajPos = trajectoryKeyDe(runPos.resultat);
      exige(typeof trajPos === 'string' && trajPos.length > 0, 'trajectory_key-lisible-scenario-correct', `vu ${rendu(trajPos)}`);
      const periodesPos = controlPeriodsDe(runPos.resultat, trajPos as string);
      const ligne1Pos = periodesPos.find((p) => p.period_index === 1);
      exige(ligne1Pos !== undefined, 'periode-1-presente-scenario-correct', `ABSENTE de ${rendu(periodesPos)}`);
      exige(
        (ligne1Pos as { satisfied: number; violated: number }).violated === 0 &&
          (ligne1Pos as { satisfied: number; violated: number }).satisfied === nombreControlesDus(1),
        'scenario-fabrique-correct-satisfait-chaque-controle-du-a-p1',
        `vu ${rendu(ligne1Pos)} (dus=${nombreControlesDus(1)})`,
      );

      /* ─── (2) scenario AUTONOME, controle NEGATIF : MEME mecanisme, prompt
       * fabrique ou l'ENONCE (seulement) nomme ce champ `status` — le
       * candidat qui en resulte doit ECHOUER (perturbation EXACTE de
       * cases.extensions.lock.json#T56.A4). */
      const ctxNeg = nouveauContexte('a4-fabrique-mute');
      const dirNeg = fs.mkdtempSync(path.join(os.tmpdir(), 't56-a4-neg-'));
      WORKSPACES_CREES.push(dirNeg);
      const deriveNeg = derivation.deriver({ prompt: ENONCE_FABRIQUE_MUTE, cwd: dirNeg, fs, path });
      exige(
        typeof (deriveNeg.params as Json).decisionField === 'string' && (deriveNeg.params as Json).decisionField === 'status',
        'scenario-fabrique-mute-derive-decisionField=status-depuis-l-enonce-seul',
        `vu ${rendu((deriveNeg.params as Json).decisionField)} dans ${rendu(deriveNeg.params)} — ce scenario simule EXACTEMENT « renommer decision en status dans l'enonce seulement »`,
      );
      const envNeg = envEcritureConstante({ relPath: deriveNeg.relPath, content: deriveNeg.content });
      const runNeg = conduire(ctxNeg, [DRAPEAU_ARRET_PERIODES, '1'], envNeg);
      exige(runNeg.resultat !== null && runNeg.exit === 0, 'pilot-conduct-scenario-fabrique-mute-execute', messageEchec('pilot-conduct(A4,fabrique-mute)', runNeg));
      const trajNeg = trajectoryKeyDe(runNeg.resultat);
      exige(typeof trajNeg === 'string' && trajNeg.length > 0, 'trajectory_key-lisible-scenario-mute', `vu ${rendu(trajNeg)}`);
      const periodesNeg = controlPeriodsDe(runNeg.resultat, trajNeg as string);
      const ligne1Neg = periodesNeg.find((p) => p.period_index === 1);
      exige(ligne1Neg !== undefined, 'periode-1-presente-scenario-mute', `ABSENTE de ${rendu(periodesNeg)}`);
      exige(
        (ligne1Neg as { satisfied: number; violated: number }).violated > 0 ||
          (ligne1Neg as { satisfied: number; violated: number }).satisfied < nombreControlesDus(1),
        'scenario-fabrique-mute-echoue-un-controle-du-a-p1-si-le-moteur-le-detecte',
        `vu ${rendu(ligne1Neg)} (dus=${nombreControlesDus(1)}) — un moteur qui ne distingue pas le nom de champ laisserait ceci entierement satisfait`,
      );

      /* ─── (3) scenario REEL : pilot-conduct --provider claude-cli --live,
       * candidat derive du SEUL prompt REELLEMENT recu par la session — DEUX
       * periodes, plan d'enregistrement pour journaliser params/decisionField
       * reellement derives (preuve que l'extraction a reellement eu lieu,
       * jamais une coincidence de valeur par defaut). */
      const ctx = nouveauContexte('a4-reel');
      const deriveLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 't56-a4-derive-log-'));
      WORKSPACES_CREES.push(deriveLogDir);
      const env = envCandidatDeriveDuPrompt({ deriveLogDir });
      const run = conduire(ctx, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A4)', run));
      exige(periodsPersistedDe(run.resultat) === 2, 'deux-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      const log0 = derivedLogN(deriveLogDir, 0);
      const log1 = derivedLogN(deriveLogDir, 1);
      exige(log0 !== null, 'derivation-journalisee-periode-1', `AUCUN journal a ${deriveLogDir}/derived-0.json`);
      exige(log1 !== null, 'derivation-journalisee-periode-2', `AUCUN journal a ${deriveLogDir}/derived-1.json`);
      exige(
        (log0 as { params: Json }).params.decisionField === 'decision' && (log0 as { params: Json }).params.operationKeyField === 'operation_key',
        'la-derivation-reelle-p1-retrouve-les-deux-noms-canoniques-depuis-le-prompt',
        `vu ${rendu((log0 as { params: Json }).params)} — prompt ${rendu(court((log0 as { prompt: string }).prompt, 1500))}`,
      );

      const trajKey = trajectoryKeyDe(run.resultat);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible', `vu ${rendu(trajKey)} dans ${rendu(run.resultat)}`);
      const periodesSelfReport = controlPeriodsDe(run.resultat, trajKey as string);
      const rapportDirect = candidateControlReportDirect(trajKey as string, ctx.db);
      exige(rapportDirect.resultat !== null && rapportDirect.exit === 0, 'candidate-control-report-direct-execute', messageEchec('candidate-control-report', rapportDirect));

      for (const k of [1, 2]) {
        const duesAK = nombreControlesDus(k);
        const ligne = periodesSelfReport.find((p) => p.period_index === k);
        exige(ligne !== undefined, `periode-${k}-presente-dans-le-self-report`, `ABSENTE de ${rendu(periodesSelfReport)}`);
        exige(
          (ligne as { satisfied: number; violated: number }).violated === 0 && (ligne as { satisfied: number; violated: number }).satisfied === duesAK,
          `periode-${k}-candidat-derive-satisfait-chaque-controle-du-${duesAK}`,
          `vu ${rendu(ligne)} (dus=${duesAK})`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );
});
