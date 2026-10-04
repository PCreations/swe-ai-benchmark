/**
 * acceptance/T45.spec.ts — suite d'acceptation de la tache T45.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T45.A1 behaviour — deux trajectoires lancees avec deux configurations
 *                      distinctes persistent chacune la sienne, relue a
 *                      chaque periode suivante
 *   T45.A2 behaviour — deux scenarios distincts revelent des exigences
 *                      distinctes a la meme periode
 *   T45.A3 refusal   — relancer une trajectoire existante avec une
 *                      configuration differente de celle enregistree est
 *                      refuse avec `TRAJECTORY_IDENTITY_CONFLICT`, sans
 *                      ecrire de periode
 *   T45.A4 behaviour — sans scenario ni configuration fournis, le scenario
 *                      et la configuration de T23 restent ceux utilises
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T45 EST UNE TACHE D'EXTENSION (ADR-007) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T45 — `packages/activities`
 * et `apps/cli` — et ne les a lus ni directement ni par `git show` (ADR-001 :
 * aveuglement PROCEDURAL, discipline auditable au diff). Le contrat teste
 * ci-dessous est derive de docs/specs/T45.md et de sa source,
 * docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md :
 *
 *   L149  titre : « Parametrer une periode par scenario et par
 *         configuration »
 *   L151  livrables, mot pour mot : « `run-period` accepte un scenario et
 *         une configuration ; la premiere periode d'une trajectoire fixe son
 *         scenario et sa configuration, que chaque periode suivante relit
 *         depuis l'etat persistant »
 *   L153  les quatre cas d'acceptation, mot pour mot — seule ligne qui nomme
 *         le litteral `TRAJECTORY_IDENTITY_CONFLICT`
 *   L155  commande : `pnpm verify:task T45` ; « PostgreSQL et le stockage
 *         objet reels sont requis »
 *   L117  (section « Arbitrage » du MEME document ADR, PAS une lecture de
 *         l'implementation : c'est l'ADR lui-meme qui CITE ces litteraux
 *         pour justifier la decision de parametrer `run-period`) : «
 *         `packages/activities/src/run-period.ts` code en dur `scenario_id:
 *         'SCN-F-RESERVATION'` et `configuration_id: 'CFG-RECORDED-LOCAL'`
 *         (lignes 445-446) ». Ces deux litteraux fixent le COMPORTEMENT PAR
 *         DEFAUT que A4 exige de preserver (« le scenario et la
 *         configuration de T23 restent ceux utilises ») : sans cette phrase
 *         de l'ADR, A4 n'aurait aucune valeur concrete a comparer.
 *
 * Cahier L78 (deja derive par T23, repris ici sans le re-deriver) nomme les
 * six identifiants d'une trajectoire : « campaign_id / parent_project_id /
 * scenario_id / configuration_id / repetition_id / budget_id » — `scenario_id`
 * et `configuration_id` sont donc des champs DEJA NOMMES par le systeme, pas
 * une invention de cette suite. Cahier L40 nomme en outre `packages/scenario`
 * (« Compilation, validation et revelation des scenarios ») : la REVELATION
 * (phase REVEALING, deja observee par acceptance/T23.spec.ts) depend donc du
 * scenario effectif, ce qui fonde A2.
 *
 * Cette suite reprend, sans les relire en detail, les conventions deja
 * fixees par acceptance/T23.spec.ts et acceptance/T39.spec.ts : chargement de
 * la commande par ROLE (`entreesCli`/`executer`/`jsonDeSortie`), PostgreSQL
 * REEL (`psql`/`creerBase`/`dsnFor`), isolation par contexte frais
 * (campaign_id/base/bucket aleatoires, cahier:L557), et le type `AppelCli`
 * portant `{ resultat, exit, tentatives }` (T39) plutot que la forme plus
 * pauvre de T23 (necessaire ici : A3 est un cas `refusal` et a besoin du
 * code de sortie, pas seulement du JSON de sortie).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUI EST FIXE PAR CETTE SUITE, FAUTE D'ENONCE DANS L'ADR SUR LA FORME
 * EXACTE DE LA COMMANDE (meme geste que T23 fixant `--variant`,
 * `--test-stop-after-phase`, etc.)
 *
 * DEUX NOUVEAUX DRAPEAUX de `bench run-period`, optionnels, miroir du nom des
 * champs d'identite qu'ils alimentent (cahier:L78) :
 *
 *   --scenario-id <id>        optionnel ; omis a la premiere periode d'une
 *                              trajectoire fraiche => reprend le defaut de
 *                              T23, `SCN-F-RESERVATION` (ADR:L117, A4) ;
 *                              fourni a la premiere periode => devient le
 *                              `scenario_id` de la trajectoire ; fourni a une
 *                              periode suivante, DOIT concorder avec celui
 *                              enregistre (cette suite ne fait jamais
 *                              diverger le scenario sur une periode suivante :
 *                              seul A3, sur `--configuration-id`, est requis
 *                              par L153).
 *   --configuration-id <id>   meme contrat, pour `configuration_id`, defaut
 *                              `CFG-RECORDED-LOCAL` (ADR:L117, A4) ; une
 *                              divergence sur une periode suivante est
 *                              refusee avec `TRAJECTORY_IDENTITY_CONFLICT`
 *                              (L153, A3) et n'ecrit PAS de periode.
 *
 * LE SECOND SCENARIO D'A2. L153 exige seulement que deux scenarios
 * DISTINCTS revelent des exigences DISTINCTES — elle n'en nomme qu'UN,
 * `SCN-F-RESERVATION` (via ADR:L117, le defaut). Cette suite FIXE le second
 * comme `SCN-F-FAILURE` : c'est, apres F-RESERVATION, la SEULE autre racine
 * gelee de la MEME section du cahier (§F, cahier:L101-129, deja importee par
 * acceptance/T23.spec.ts) a decrire une trajectoire complete de quatre
 * periodes sur le MEME domaine (horloges P1..P4) — par opposition aux autres
 * racines geles (F-BUDGET, F-CLUSTERS, F-MONEY, F-POWER, F-QUALITY,
 * F-REGRESSION, F-BOOTSTRAP, F-COST-RATIO) qui servent des taches d'analyse
 * sans rapport avec `run-period`. Ce choix fixe un NOM d'entree ; il n'exige
 * de l'implementation AUCUN contenu precis pour les exigences de
 * `SCN-F-FAILURE` — seulement qu'elles DIFFERENT de celles de
 * `SCN-F-RESERVATION` a la meme periode, exactement ce que L153 ecrit.
 *
 * LES CONFIGURATIONS D'A1 (`CFG-T45-ALPHA`/`CFG-T45-BETA`) et LE
 * `campaign_id`/les bases/les buckets de contexte : purement FABRIQUES par
 * cette suite, entrees jamais valeurs attendues — aucune implementation de
 * T45 n'existe au moment ou cette suite est ecrite (ADR-001).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 * T45 n'a pas de ligne de cahier : sa source est l'ADR epingle par
 * verification/tasks.extensions.json#spec_source. Cette suite applique donc
 * la discipline du driver sous la forme deja employee par
 * acceptance/T44.spec.ts pour les taches d'extension : chaque litteral
 * COMPARE porte un commentaire
 * `// source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L<n>`
 * resolvable par `sed -n '<n>p'`.
 *
 *   `SCN-F-RESERVATION`, `CFG-RECORDED-LOCAL`        — ADR:L117 (A4)
 *   `TRAJECTORY_IDENTITY_CONFLICT`                    — ADR:L153 (A3)
 *   `scenario_id`, `configuration_id` (noms de champ) — cahier:L78 (deja
 *                                                        derive par T23)
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T45, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER D'UNE EGALITE ENTREE/SORTIE SUR UNE SEULE
 *     TRAJECTOIRE. Une implementation qui ecrirait toujours
 *     `CFG-RECORDED-LOCAL` passerait une verification « la configuration
 *     fournie a P1 est bien celle lue a P1 » si, par accident, elle ignore
 *     l'entree ET que le test ne fournit par accident que CETTE valeur. A1
 *     lance donc DEUX trajectoires sous DEUX configurations differentes et
 *     exige, a la PERIODE SUIVANTE (P2, drapeau omis expres pour prouver la
 *     RELECTURE depuis l'etat persistant, L151), que chacune conserve LA
 *     SIENNE — et que les deux restent DISTINCTES entre elles.
 * (2) A2 EST UN CAS `behaviour`, PAS `numeric` : L153 exige une DIFFERENCE
 *     d'exigences, jamais un contenu precis. Cette suite ne presuppose donc
 *     aucune exigence litterale pour `SCN-F-FAILURE` et compare uniquement
 *     que les deux projections NE SONT PAS identiques — une sur-specification
 *     (exiger un contenu precis non ecrit par l'ADR) serait une invention,
 *     l'inverse exact de ce que ADR-001 interdit.
 * (3) A3 EST UN CAS `refusal` : LE DANGER DECISIF. Un stub qui LEVE
 *     systematiquement laisserait ce cas VERT a tort si la suite ne
 *     verifiait pas d'abord qu'un appel VALIDE est accepte. A3 ouvre donc
 *     TOUJOURS par un CONTROLE POSITIF (P1 acceptee sous `CFG-T45-ALPHA`),
 *     EXACTEMENT la meme discipline que T00.M3/T39.A2 citent pour les cas de
 *     refus. Le refus lui-meme est distingue d'un PLANTAGE generique (meme
 *     motif que T00/T17/T25/T37/T39 : `TypeError`, `ECONNREFUSED`, etc.) —
 *     un plantage n'est pas un refus NOMME. Et surtout : A3 exige un
 *     CONTROLE DE NON-ECRITURE apres le refus — une troisieme invocation,
 *     sous la configuration ORIGINALE, doit reprendre exactement a
 *     `period_index=2`, jamais 3. Sans ce controle, une implementation qui
 *     REFUSE (exit != 0, message nommant le code) mais ECRIT MALGRE TOUT une
 *     periode corrompue passerait quand meme — « sans ecrire de periode »
 *     (L153) est une assertion a part entiere, pas une consequence
 *     automatique du refus observe en sortie.
 * (4) A4 COUVRE LES DEUX CHAMPS, PAS UN SEUL. L153 ecrit « le SCENARIO ET LA
 *     CONFIGURATION de T23 restent ceux utilises » — cette suite exige donc
 *     les deux litteraux (ADR:L117), a P1 ET a P2 (persistance du defaut,
 *     pas seulement son adoption initiale).
 *
 *     OBSERVE A L'ECRITURE DE CETTE SUITE (`node tools/bench red T45` avant
 *     toute implementation de T45) : A1/A2/A3 rougissent reellement, mais A4
 *     passe DEJA — parce que `run-period` (T23) code en dur exactement les
 *     litteraux qu'A4 compare (ADR:L117) et ignore silencieusement les deux
 *     drapeaux inconnus. C'est le MEME phenomene que
 *     verification/mutants/T00.json documente pour T00.A4/A5 (« la porte RED
 *     a montre que ces deux cas restaient VERTS alors que le runner n'etait
 *     pas implemente ») : un vert a ce stade n'est pas une preuve, et
 *     verification/runner/red.mjs le sait — il n'admet un cas vert qu'avec
 *     une CONTRE-EPREUVE PAR MUTATION nommee (`mutationProof`). Ce n'est donc
 *     pas un defaut de ce cas : c'est exactement pourquoi
 *     verification/mutants/T45.json doit fournir, pour A4, un mutant qui
 *     change reellement le defaut (« changer le scenario par defaut quand
 *     aucun n'est fourni ») — la contre-epreuve que la porte rouge exige
 *     avant d'admettre A4.
 * (5) ISOLATION DES SERVICES REELS. Chaque contexte (A1 : deux: A2 : deux ;
 *     A3/A4 : un chacun) cree sa PROPRE base PostgreSQL et son propre bucket
 *     S3, namespaces par un `campaign_id` aleatoire (cahier:L557) — aucun cas
 *     ne depend de l'ordre d'execution d'un autre.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne revalide pas le trajet nominal complet (phases REVEALING a
 *    CHECKPOINTING, deployment_coverage, depenses) : deja couvert par
 *    acceptance/T23.spec.ts. Cette suite n'exerce que l'axe
 *    scenario/configuration que T23 ignorait (ADR, Arbitrage).
 *  • Elle n'exige aucun contenu precis pour les exigences de
 *    `SCN-F-FAILURE` (III/IV.2) : seulement leur difference avec celles de
 *    `SCN-F-RESERVATION`.
 *  • Elle ne verifie pas un refus de SCENARIO divergent sur une periode
 *    suivante : L153/A3 ne nomme que la configuration ; cette suite ne fixe
 *    donc aucune exigence sur ce point symetrique, qui reste a la discretion
 *    de l'implementation.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle */

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

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
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

/** L'assertion elementaire : une comparaison de chaines, pour nommer ce qui a ete vu. */
function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ─────────────────────────────── navigation JSON generique (reprise de T23) */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 9): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [
    { chemin: '$', cle: '', v: racine, p: 0 },
  ];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) {
        file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
      }
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

/* ─────────────────── litteraux de cette suite, chacun avec sa provenance */

const MODE = 'recorded'; // convention T23 (cahier:L21), reprise sans re-derivation
const SOUS_COMMANDE = 'run-period'; // convention T23 (cahier:L355)
const DRAPEAU_MODE = '--mode';
const DRAPEAU_SCENARIO = '--scenario-id'; // FIXE par cette suite (II)
const DRAPEAU_CONFIGURATION = '--configuration-id'; // FIXE par cette suite (II)
const PREMIER_INDEX = 1;
const DEUXIEME_INDEX = 2;

/** Defauts actuels de `run-period` (T23), cites PAR L'ADR LUI-MEME. */
const SCENARIO_DEFAUT = 'SCN-F-RESERVATION'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L117
const CONFIGURATION_DEFAUT = 'CFG-RECORDED-LOCAL'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L117

/** Second scenario d'A2 — FIXE par cette suite (II), racine gelee existante. */
const SCENARIO_ALTERNATIF = 'SCN-F-FAILURE';

/** Configurations d'A1 — FABRIQUEES par cette suite, jamais tirees d'une execution observee. */
const CONFIGURATION_ALPHA = 'CFG-T45-ALPHA';
const CONFIGURATION_BETA = 'CFG-T45-BETA';

/** Code de refus d'A3, VERBATIM. */
const CODE_CONFLIT_IDENTITE = 'TRAJECTORY_IDENTITY_CONFLICT'; // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L153

const ALIAS_SCENARIO = ['scenario_id', 'scenarioid', 'scenario'];
const ALIAS_CONFIGURATION = ['configuration_id', 'configurationid', 'configuration', 'config_id', 'configid'];
const ALIAS_INDEX = ['period_index', 'periodindex', 'index', 'numero', 'rang'];
const ALIAS_EXIGENCES = [
  'requirements',
  'exigences',
  'due_requirements',
  'exigences_dues',
  'evaluated_requirements',
  'exigences_evaluees',
];

/** Ce qui N'EST PAS un refus : un plantage (meme convention que T00/T17/T25/T37/T39). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t45_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
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

/** { resultat, exit, tentatives } — forme T39 : A3 a besoin du code de sortie, pas seulement du JSON. */
type AppelCli = {
  resultat: Json | null;
  exit: number | null;
  tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[];
};

/** Namespace d'un test : une trajectoire fraiche (campaign_id, base, bucket). */
type Contexte = { campaignId: string; db: string; bucket: string };

function nouveauContexte(suffixe: string): Contexte {
  return {
    campaignId: `t45-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
  };
}

/** Une invocation de `bench run-period`, sous-commande + drapeaux fabriques (processus neuf, jamais un rappel en memoire). */
function lancer(drapeaux: string[]): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, SOUS_COMMANDE, ...drapeaux];
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

/** `bench run-period` sur la trajectoire `ctx`, avec des drapeaux additionnels (--scenario-id/--configuration-id). */
function runPeriod(ctx: Contexte, extra: string[] = []): AppelCli {
  return lancer([
    DRAPEAU_MODE,
    MODE,
    '--campaign-id',
    ctx.campaignId,
    '--postgres-database',
    ctx.db,
    '--s3-bucket',
    ctx.bucket,
    ...extra,
  ]);
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${appel.tentatives
    .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`)
    .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`;
}

/** Texte COMPLET d'un appel (JSON rendu + sorties brutes de toutes les tentatives) — pour chercher un code de refus
 *  qu'il soit porte par le JSON de sortie ou par un texte brut (stdout/stderr) non JSON. */
function texteComplet(appel: AppelCli): string {
  const j = appel.resultat !== null ? rendu(appel.resultat) : '';
  const brut = appel.tentatives.map((t) => t.sortie).join('\n');
  return `${j}\n${brut}`;
}

/* ───────────────────────────── extraction de champs sur UNE periode */

function scenarioIdDe(p: unknown): string | null {
  const v = champProfond(p, ALIAS_SCENARIO);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
}
function configurationIdDe(p: unknown): string | null {
  const v = champProfond(p, ALIAS_CONFIGURATION);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
}
function indexDe(p: unknown): number | null {
  const v = champProfond(p, ALIAS_INDEX);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
}
/** Projection canonique (triee) des exigences dues — meme technique que acceptance/T23.spec.ts. */
function exigencesCanon(p: unknown): string[] | null {
  const t = tableauProfond(p, ALIAS_EXIGENCES);
  if (t === null || !Array.isArray(t.valeur)) return null;
  const champ = (o: unknown, alias: readonly string[]): unknown => {
    if (o === null || typeof o !== 'object') return undefined;
    const cible = new Set(alias.map(normKey));
    for (const [k, v] of Object.entries(o as Json)) {
      if (cible.has(normKey(k)) && v !== undefined && v !== null) return v;
    }
    return undefined;
  };
  const ids = (t.valeur as unknown[])
    .map((x) => {
      const id = champ(x, ['id', 'requirement_id', 'capability_id']);
      const v = champ(x, ['version', 'v', 'revision']);
      return typeof id === 'string' ? `${id}@${String(v ?? '?')}` : typeof x === 'string' ? x : null;
    })
    .filter((x): x is string => x !== null);
  return [...ids].sort();
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T45 — parametrer une periode par scenario et par configuration', () => {
  test(
    'T45.A1 deux trajectoires sous deux configurations distinctes persistent chacune la sienne, relue a la periode suivante',
    () => {
      const ctxAlpha = nouveauContexte('a1-alpha');
      const ctxBeta = nouveauContexte('a1-beta');

      // Periode 1 : la configuration est FOURNIE explicitement, et distincte entre les deux trajectoires.
      const alphaP1 = runPeriod(ctxAlpha, [DRAPEAU_CONFIGURATION, CONFIGURATION_ALPHA]);
      exige(alphaP1.resultat !== null, 'alpha-p1-executee', messageEchec('run-period(alpha,P1)', alphaP1));
      exige(
        configurationIdDe(alphaP1.resultat) === CONFIGURATION_ALPHA,
        `alpha-p1-configuration=${CONFIGURATION_ALPHA}`,
        `vu ${rendu(configurationIdDe(alphaP1.resultat))} dans ${rendu(alphaP1.resultat)}`,
      );
      exige(indexDe(alphaP1.resultat) === PREMIER_INDEX, `alpha-p1-period_index=${PREMIER_INDEX}`, `vu ${rendu(indexDe(alphaP1.resultat))}`);

      const betaP1 = runPeriod(ctxBeta, [DRAPEAU_CONFIGURATION, CONFIGURATION_BETA]);
      exige(betaP1.resultat !== null, 'beta-p1-executee', messageEchec('run-period(beta,P1)', betaP1));
      exige(
        configurationIdDe(betaP1.resultat) === CONFIGURATION_BETA,
        `beta-p1-configuration=${CONFIGURATION_BETA}`,
        `vu ${rendu(configurationIdDe(betaP1.resultat))} dans ${rendu(betaP1.resultat)}`,
      );

      // Periode 2 : le drapeau est OMIS expres, pour prouver que la configuration est RELUE depuis
      // l'etat persistant (L151), pas redemandee. Cible exacte du mutant (cases.extensions.lock.json,
      // T45.A1) : « relire la configuration codee en dur au lieu de celle persistee ».
      const alphaP2 = runPeriod(ctxAlpha);
      exige(alphaP2.resultat !== null, 'alpha-p2-executee', messageEchec('run-period(alpha,P2)', alphaP2));
      exige(indexDe(alphaP2.resultat) === DEUXIEME_INDEX, `alpha-p2-period_index=${DEUXIEME_INDEX}`, `vu ${rendu(indexDe(alphaP2.resultat))}`);
      const alphaCfgP2 = configurationIdDe(alphaP2.resultat);
      exige(
        alphaCfgP2 === CONFIGURATION_ALPHA,
        `alpha-p2-configuration-relue=${CONFIGURATION_ALPHA}`,
        `vu ${rendu(alphaCfgP2)} dans ${rendu(alphaP2.resultat)}`,
      );

      const betaP2 = runPeriod(ctxBeta);
      exige(betaP2.resultat !== null, 'beta-p2-executee', messageEchec('run-period(beta,P2)', betaP2));
      const betaCfgP2 = configurationIdDe(betaP2.resultat);
      exige(
        betaCfgP2 === CONFIGURATION_BETA,
        `beta-p2-configuration-relue=${CONFIGURATION_BETA}`,
        `vu ${rendu(betaCfgP2)} dans ${rendu(betaP2.resultat)}`,
      );

      // Chacune la SIENNE : une configuration codee en dur (constante, quelle qu'elle soit) ferait
      // converger les deux trajectoires vers la MEME valeur a P2.
      exige(
        alphaCfgP2 !== betaCfgP2,
        'deux-trajectoires-conservent-des-configurations-distinctes-a-p2',
        `alpha=${rendu(alphaCfgP2)} beta=${rendu(betaCfgP2)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T45.A2 deux scenarios distincts revelent des exigences distinctes a la meme periode',
    () => {
      const ctxReservation = nouveauContexte('a2-reservation');
      const ctxFailure = nouveauContexte('a2-failure');

      const pReservation = runPeriod(ctxReservation, [DRAPEAU_SCENARIO, SCENARIO_DEFAUT]);
      exige(pReservation.resultat !== null, 'reservation-p1-executee', messageEchec('run-period(SCN-F-RESERVATION,P1)', pReservation));
      exige(
        scenarioIdDe(pReservation.resultat) === SCENARIO_DEFAUT,
        `reservation-p1-scenario_id=${SCENARIO_DEFAUT}`,
        `vu ${rendu(scenarioIdDe(pReservation.resultat))} dans ${rendu(pReservation.resultat)}`,
      );
      const exigReservation = exigencesCanon(pReservation.resultat);
      exige(
        exigReservation !== null,
        'exigences-dues-presentes-sous-SCN-F-RESERVATION',
        `role exigences introuvable (alias ${ALIAS_EXIGENCES.join('|')}) dans ${rendu(pReservation.resultat)}`,
      );

      const pFailure = runPeriod(ctxFailure, [DRAPEAU_SCENARIO, SCENARIO_ALTERNATIF]);
      exige(pFailure.resultat !== null, 'failure-p1-executee', messageEchec('run-period(SCN-F-FAILURE,P1)', pFailure));
      exige(
        scenarioIdDe(pFailure.resultat) === SCENARIO_ALTERNATIF,
        `failure-p1-scenario_id=${SCENARIO_ALTERNATIF}`,
        `vu ${rendu(scenarioIdDe(pFailure.resultat))} dans ${rendu(pFailure.resultat)} — le scenario fourni doit se refleter, pas rester celui par defaut`,
      );
      const exigFailure = exigencesCanon(pFailure.resultat);
      exige(
        exigFailure !== null,
        'exigences-dues-presentes-sous-SCN-F-FAILURE',
        `role exigences introuvable (alias ${ALIAS_EXIGENCES.join('|')}) dans ${rendu(pFailure.resultat)}`,
      );

      // La propriete exigee par L153 : DISTINCTES, a la MEME periode (P1 des deux cotes). Cible du
      // mutant (cases.extensions.lock.json, T45.A2) : « ignorer le scenario fourni et reveler
      // toujours SCN-F-RESERVATION ».
      exige(
        JSON.stringify(exigReservation) !== JSON.stringify(exigFailure),
        'deux-scenarios-revelent-des-exigences-distinctes-a-P1',
        `SCN-F-RESERVATION=${rendu(exigReservation)} SCN-F-FAILURE=${rendu(exigFailure)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T45.A3 relancer avec une configuration differente de celle enregistree est refuse avec ${CODE_CONFLIT_IDENTITE}, sans ecrire de periode`,
    () => {
      const ctx = nouveauContexte('a3');

      // VOLET POSITIF D'ABORD (cas `refusal` — meme discipline que T39.A2/T00.M3) : un stub qui leve
      // systematiquement rendrait ce cas vert a tort si ce premier appel n'etait pas, lui, exige
      // reussi.
      const p1 = runPeriod(ctx, [DRAPEAU_CONFIGURATION, CONFIGURATION_ALPHA]);
      exige(p1.resultat !== null && p1.exit === 0, 'p1-acceptee-sous-configuration-alpha', messageEchec('run-period(P1,ALPHA)', p1));
      exige(indexDe(p1.resultat) === PREMIER_INDEX, `p1-period_index=${PREMIER_INDEX}`, `vu ${rendu(indexDe(p1.resultat))}`);

      // RELANCE DE LA MEME TRAJECTOIRE SOUS UNE CONFIGURATION DIFFERENTE.
      const conflit = runPeriod(ctx, [DRAPEAU_CONFIGURATION, CONFIGURATION_BETA]);
      const texte = texteComplet(conflit);
      exige(
        !MARQUEURS_DE_PLANTAGE.test(texte),
        'refus-nomme-pas-un-plantage-generique',
        `MARQUEUR-DE-PLANTAGE detecte : ${court(texte, 500)}`,
      );
      exige(conflit.exit !== 0, 'configuration-conflictuelle-refusee (exit non nul)', `exit=${String(conflit.exit)} ${court(texte, 500)}`);
      exige(
        texte.includes(CODE_CONFLIT_IDENTITE),
        `${CODE_CONFLIT_IDENTITE}-nomme-dans-le-refus`,
        `code ABSENT de la sortie : ${court(texte, 500)}`,
      );

      // CONTROLE DE NON-ECRITURE (L153 : « sans ecrire de periode ») : la reprise normale, sous la
      // configuration ORIGINALE, doit continuer exactement a period_index=2 — jamais 3. Cible du
      // mutant (cases.extensions.lock.json, T45.A3) : « accepter une configuration differente de
      // celle enregistree et ecrire la periode ».
      const reprise = runPeriod(ctx, [DRAPEAU_CONFIGURATION, CONFIGURATION_ALPHA]);
      exige(reprise.resultat !== null, 'reprise-sous-configuration-originale-executee', messageEchec('run-period(reprise,ALPHA)', reprise));
      exige(
        indexDe(reprise.resultat) === DEUXIEME_INDEX,
        `aucune-periode-ecrite-par-la-tentative-refusee (period_index=${DEUXIEME_INDEX})`,
        `vu ${rendu(indexDe(reprise.resultat))} dans ${rendu(reprise.resultat)} — une valeur de 3 trahirait une periode ecrite malgre le refus`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T45.A4 sans scenario ni configuration fournis, le scenario (${SCENARIO_DEFAUT}) et la configuration (${CONFIGURATION_DEFAUT}) de T23 restent ceux utilises`,
    () => {
      const ctx = nouveauContexte('a4');

      const p1 = runPeriod(ctx);
      exige(p1.resultat !== null, 'p1-executee-sans-drapeau-scenario-ni-configuration', messageEchec('run-period(P1,defauts)', p1));
      exige(
        scenarioIdDe(p1.resultat) === SCENARIO_DEFAUT,
        `p1-scenario_id-par-defaut=${SCENARIO_DEFAUT}`,
        `vu ${rendu(scenarioIdDe(p1.resultat))} dans ${rendu(p1.resultat)}`,
      );
      exige(
        configurationIdDe(p1.resultat) === CONFIGURATION_DEFAUT,
        `p1-configuration_id-par-defaut=${CONFIGURATION_DEFAUT}`,
        `vu ${rendu(configurationIdDe(p1.resultat))} dans ${rendu(p1.resultat)}`,
      );

      // Persistance du defaut (pas seulement son adoption initiale) : meme verification a P2, drapeau
      // toujours omis. Cible du mutant (cases.extensions.lock.json, T45.A4) : « changer le scenario
      // par defaut quand aucun n'est fourni ».
      const p2 = runPeriod(ctx);
      exige(p2.resultat !== null, 'p2-executee-sans-drapeau-scenario-ni-configuration', messageEchec('run-period(P2,defauts)', p2));
      exige(
        scenarioIdDe(p2.resultat) === SCENARIO_DEFAUT,
        `p2-scenario_id-par-defaut-toujours=${SCENARIO_DEFAUT}`,
        `vu ${rendu(scenarioIdDe(p2.resultat))} dans ${rendu(p2.resultat)}`,
      );
      exige(
        configurationIdDe(p2.resultat) === CONFIGURATION_DEFAUT,
        `p2-configuration_id-par-defaut-toujours=${CONFIGURATION_DEFAUT}`,
        `vu ${rendu(configurationIdDe(p2.resultat))} dans ${rendu(p2.resultat)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});
