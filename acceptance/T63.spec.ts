/**
 * acceptance/T63.spec.ts — suite d'acceptation de la tache T63.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T63.A1 behaviour — un candidat de reference qui conserve son etat dans
 *                      BENCH_DATA_DIR retrouve en P12 les reservations
 *                      creees en P1 a P11, a travers un redemarrage de son
 *                      processus entre chaque periode
 *   T63.A2 behaviour — un candidat qui garde son etat en memoire seulement
 *                      viole, dès la periode suivante, chaque controle qui
 *                      depend d'un etat anterieur
 *   T63.A3 behaviour — une sonde appliquee a une copie ne modifie pas l'etat
 *                      de la trajectoire principale
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T63 EST UNE TACHE D'EXTENSION (ADR-018) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-018-scenario-long-et-contradictoire.md, lignes 190-196),
 * jamais le cahier directement. L'auteur de cette suite est AVEUGLE aux
 * `source_paths` que verification/tasks.extensions.json declare pour T63 —
 * `packages/activities`, `packages/agents` — et ne les a lus ni directement
 * ni par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable
 * au diff, jamais une barriere technique). Le contrat teste ci-dessous est
 * derive de docs/specs/T63.md et de sa source, le MEME document ACCEPTE,
 * lignes 190-196, AINSI QUE du corps narratif du MEME document hors de
 * cette plage (decision point 2, L46-49 : « Un etat qui doit durer ») —
 * la meme liberte que prennent deja acceptance/T48.spec.ts a acceptance/
 * T62.spec.ts face a leur propre ADR.
 *
 *   L46-49  decision point 2, mot pour mot : « Le candidat recoit un
 *           repertoire de donnees dont le chemin est passe par la variable
 *           d'environnement BENCH_DATA_DIR. Toutes les operations de la
 *           trajectoire principale s'appliquent au meme etat, de P1 a P12,
 *           a travers les redemarrages du processus et les changements de
 *           format. Les sondes de frontiere travaillent sur des copies
 *           jetables de ce repertoire, comme les clones du cahier (L123). »
 *   L192    livrables, mot pour mot : « repertoire de donnees passe au
 *           candidat par BENCH_DATA_DIR, conserve de P1 a P12 ; trajectoire
 *           principale appliquee a cet etat ; sondes appliquees a des
 *           copies jetables »
 *   L194    les trois cas d'acceptation, mot pour mot
 *   L196    commande : `pnpm verify:task T63`. « PostgreSQL et le stockage
 *           objet sont requis ; aucun appel reel. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions DEJA FIXEES par les
 * suites ACCEPTEES dont elle etend le socle (jamais les sources de T63) :
 *   - acceptance/T48.spec.ts (III) : le contrat `bench.candidate/1` — probe
 *     de demarrage `{ready:true,protocol:"bench.candidate/1"}`, protocole
 *     NDJSON `{id,op,args}` -> `{id,ok,...}`, operations create_tenant /
 *     write{tenant_id,key,value} / read{tenant_id,key} / fingerprint — REPRIS
 *     A L'IDENTIQUE, jamais re-derive. C'est le protocole le plus GENERIQUE
 *     deja accepte (write/read d'une valeur arbitraire par cle), et T63 ne
 *     porte que sur le MECANISME DE PERSISTANCE : les regles metier de
 *     F-LONG (T61/T62) ne sont pas son objet (section V).
 *   - acceptance/fixtures/candidates/reference-app.mjs (T48) : le modele
 *     exact d'application temoin, REPRIS ICI dans deux nouvelles fixtures
 *     ACCEPTANCE (jamais une source de T63) — acceptance/fixtures/
 *     candidates/t63-persistent-kv-candidate.mjs (persiste dans
 *     BENCH_DATA_DIR) et t63-memory-only-candidate.mjs (ne persiste rien,
 *     contre-epreuve d'A2) — meme discipline que T51 face a T48.
 *   - acceptance/T09.spec.ts (clonerBase) : le geste de cloner un etat
 *     jetable AVANT d'y appliquer une mutation, pour en etablir l'isolation
 *     — repris ici au niveau d'un repertoire de fichiers (`fs.cpSync`)
 *     exactement comme T09 le fait au niveau d'une base PostgreSQL.
 *   - acceptance/T53.spec.ts (socle) / acceptance/T62.spec.ts (socle) : le
 *     chargement ESM direct de `packages/activities` et `packages/agents`,
 *     et la resolution tolerante d'un role par balayage des exports, PLUTOT
 *     que par un chemin de fichier devine.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001 : aucune des valeurs ci-dessous
 * n'a ete obtenue en executant une implementation de T63 — aucun module de
 * T63 n'existe encore au moment ou elle est ecrite ; l'ADR decrit un
 * MECANISME, jamais une signature de fonction)
 *
 * 1. DEUX ROLES DISTINCTS, correspondant aux deux livrables narratifs de
 *    L46-49 qu'un seul et meme point de code ne peut pas honorer a la fois
 *    (une fonction qui clonerait AVANT CHAQUE appel ne pourrait jamais faire
 *    durer un etat de P1 a P12) :
 *      - « period runner » : execute un lot d'operations contre un candidat
 *        REDEMARRE (processus OS neuf), en pointant BENCH_DATA_DIR sur le
 *        repertoire DONNE, SANS jamais le copier — la trajectoire
 *        principale.
 *      - « probe runner » : execute un lot d'operations contre un candidat
 *        REDEMARRE, mais sur une COPIE JETABLE du repertoire donne, de sorte
 *        que l'original ne soit jamais touche — les sondes de frontiere.
 *    Resolus par balayage des exports top-level de `packages/activities` et
 *    `packages/agents` (meme geste qu'acceptance/T62.spec.ts II.2), parmi un
 *    ensemble de noms plausibles (ROLES_PERIOD_RUNNER / ROLES_PROBE_RUNNER
 *    plus bas), et appeles sous PLUSIEURS formes d'arguments (objet nomme,
 *    puis positionnel) — meme tolerance qu'acceptance/T62.spec.ts (II.3,
 *    `enonceDePeriode`).
 * 2. LA FORME DES ARGUMENTS ET DU RESULTAT (aucune source ne la fixe) :
 *      entree  { candidateCommand: string[], benchDataDir: string,
 *                ops: { id: string, op: string, args?: object }[],
 *                timeoutMs?: number }
 *      sortie  Promise<{ responses: { id: string, ok: boolean,
 *                result?: unknown, error?: { code: string } }[] }>
 *    `candidateCommand` est l'argv du processus candidat (ici toujours
 *    `['node', <fixture>.mjs]`) ; c'est la fonction resolue, jamais cette
 *    suite, qui doit positionner `BENCH_DATA_DIR=<benchDataDir>` dans
 *    l'environnement du processus qu'elle lance — exactement le mecanisme
 *    que L46-49 decrit.
 * 3. LES DEUX CANDIDATS DE REFERENCE (FIXES au I, jamais relus d'une
 *    implementation) : t63-persistent-kv-candidate.mjs (conforme) et
 *    t63-memory-only-candidate.mjs (fautif, contre-epreuve d'A2).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 * Aucun litteral compare ici n'est une valeur METIER protegee par une racine
 * gelee (acceptance/reference/**, acceptance/reference-long/**) : T63 ne
 * porte PAS sur les regles de F-LONG (proprietes de T61/T62), seulement sur
 * le mecanisme de persistance. Les cles/valeurs ('S1'..'S11', 'before',
 * 'mutated-by-probe', 'legacy', 'main', 'absent-parce-que-memoire-seule') sont
 * des TEMOINS SYNTHETIQUES que cette suite choisit et controle ENTIEREMENT
 * des deux cotes (elle les ecrit, puis les relit) — meme statut que
 * `etranger.txt` (acceptance/T48.spec.ts IV.1) ou le registre synthetique
 * `T99` (acceptance/T00.spec.ts) : une sentinelle de test, jamais un fait du
 * cahier ou d'un ADR qu'il faudrait citer `// cahier:L<n>`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T63, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER DE CROIRE QUE LE REPERTOIRE SURVIT PARCE
 *     QU'IL EST SUR DISQUE. Le danger degenere est une implementation qui
 *     IGNORE BENCH_DATA_DIR et fait durer l'etat par un autre canal (variable
 *     de module du moteur, fichier temporaire propre). Cette suite exige donc
 *     que CHAQUE periode soit un APPEL SEPARE a la fonction resolue — jamais
 *     un seul appel « batch » portant toutes les operations de P1 a P12 — et
 *     verifie, via `boot.log` (canal hors-protocole ECRIT PAR LE CANDIDAT LUI-
 *     MEME dans BENCH_DATA_DIR), qu'au moins 11 PID DISTINCTS ont ete vus :
 *     un moteur qui garderait le meme processus vivant d'une periode a
 *     l'autre, ou qui ne positionnerait jamais BENCH_DATA_DIR (le candidat
 *     retombe alors sur CWD et n'ecrit jamais dans le repertoire inspecte),
 *     laisse tomber cette assertion AVANT meme la relecture P12.
 * (2) A2 EST LE CONTROLE INVERSE, ET C'EST LE DANGER DECISIF : si le moteur
 *     NE redemarrait PAS reellement le processus entre deux periodes (le
 *     garde en vie, ou reutilise un etat JS en memoire COTE MOTEUR), le
 *     candidat-memoire-seule RETROUVERAIT quand meme sa valeur a la periode
 *     suivante, et A2 — qui exige au contraire la PERTE — resterait vert sur
 *     un moteur qui ne redemarre RIEN. C'est pourquoi cette suite exige
 *     l'ECHEC DE LECTURE (valeur nulle) comme preuve POSITIVE d'un
 *     redemarrage reel, jamais comme un defaut qu'on tolere. Temoin ANTI-
 *     VACUITE associe (meme periode, memes appels, candidat PERSISTANT a la
 *     place) : la meme sequence sur t63-persistent-kv-candidate.mjs DOIT
 *     retrouver la valeur — sans ce controle, un moteur qui ne transmettrait
 *     JAMAIS rien au disque verdirait A2 pour la mauvaise raison (toute
 *     lecture rendrait nul, candidat persistant compris).
 * (3) A3 : LE DANGER EST QUE CETTE SUITE CLONE ELLE-MEME LE REPERTOIRE (au
 *     lieu de laisser la fonction « probe runner » resolue le faire), ce qui
 *     prouverait l'isolation du systeme de fichiers, jamais celle du MOTEUR —
 *     exactement le piege nomme par acceptance/T48.spec.ts (IV.2) pour A2.
 *     Cette suite appelle donc TOUJOURS le « probe runner » resolu, jamais
 *     `fs.cpSync` elle-meme, pour appliquer la sonde. Temoin ANTI-VACUITE :
 *     la sonde doit d'abord REELLEMENT reussir (`ok:true` sur son ecriture)
 *     avant que l'absence d'effet sur l'original ne soit interrogee — un
 *     « probe runner » qui echouerait silencieusement sur toute ecriture
 *     laisserait l'original intact pour la mauvaise raison.
 * (4) NECESSITE DU MODE `behaviour`. Les trois cas sont `behaviour`
 *     (verification/cases.extensions.lock.json) : ils executent des exports
 *     reels et en observent le resultat. Stuber les deux roles resolus en
 *     fonctions qui renvoient `{responses:[]}` ferait echouer les THREE
 *     assertions positives (reponses `ok:true` absentes) avant meme
 *     d'atteindre une assertion de persistance — la porte generique
 *     (`module-stub`) mord donc deja sur les trois cas, en plus des mutants
 *     cibles qui suivent.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie aucune regle metier de F-LONG (reserve/cancel/
 *    priority/capacity/...) : ce sont des proprietes de T61/T62, deja
 *    PROUVEES par leurs propres suites. Les operations exercees ici sont du
 *    `write`/`read` generique (`bench.candidate/1`), jamais une sequence
 *    F-LONG complete.
 *  • Elle n'exerce ni une session `claude -p` ni un fournisseur `claude-cli`
 *    (ADR-008) : aucun processus nomme `claude` n'est jamais lance. Les deux
 *    candidats exerces sont des fixtures ACCEPTANCE ecrites par cette suite.
 *  • Elle ne mesure ni Q/R/G (T65) ni les lots de sequences caches (T64) :
 *    ce sont des taches distinctes, en aval.
 *  • Elle n'impose aucun nom de fichier precis pour l'etat persistant d'une
 *    implementation reelle (`state.json`, une base SQLite locale, ...) :
 *    seul le comportement observable au travers du protocole candidat
 *    compte. `boot.log` est un canal d'observation des FIXTURES de cette
 *    suite, jamais une exigence posee a l'implementation.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 60_000;

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
  if (v instanceof Error) return `${v.name}: ${v.message}`;
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

/* ═══════════════════ chargement de packages/activities + packages/agents */

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
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

interface Loaded {
  charge: boolean;
  flat: Map<string, unknown>;
  attempts: string[];
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

let LOADED: Loaded = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  let unCharge = false;
  for (const pkg of ['activities', 'agents']) {
    const { ns, attempts: a } = await loadPackage(pkg);
    attempts.push(...a);
    if (ns !== null) {
      flatten(ns, flat);
      unCharge = true;
    }
  }
  LOADED = { charge: unCharge, flat, attempts };
}, CASE_TIMEOUT_MS);

function assertPackagesLoaded(): void {
  exige(
    LOADED.charge,
    'packages-activities-ou-agents-charges',
    `AUCUN-DES-DEUX-PAQUETS-N-A-PU-ETRE-CHARGE : ${LOADED.attempts.join(' | ')}`,
  );
}

/* ═══════════ resolution tolerante des deux roles (II.1, II.2) ══════════ */

type Op = { id: string; op: string; args?: Json };
type Reponse = { id: string; ok: boolean; result?: unknown; error?: { code?: string; message?: string } };
type ResultatAppel = { responses: Reponse[] };
type ArgsAppel = {
  candidateCommand: string[];
  benchDataDir: string;
  ops: Op[];
  timeoutMs?: number;
};

const ROLES_PERIOD_RUNNER = [
  'runFLongPeriod',
  'runPeriodWithBenchDataDir',
  'runStatefulCandidatePeriod',
  'runCandidatePeriod',
  'runFLongCandidatePeriod',
  'executeFLongPeriod',
  'runPeriodAgainstCandidate',
] as const;

const ROLES_PROBE_RUNNER = [
  'runFLongProbe',
  'runProbeOnDisposableCopy',
  'applyProbeToCopy',
  'runBoundaryProbe',
  'probeFLongPeriod',
  'runFLongBoundaryProbe',
  'runDisposableProbe',
] as const;

function estResultatPlausible(v: unknown): v is ResultatAppel {
  if (v === null || typeof v !== 'object') return false;
  const r = (v as Json).responses;
  return Array.isArray(r);
}

/** Essaie un export sous PLUSIEURS formes d'appel : objet nomme, puis
 * positionnel (candidateCommand, benchDataDir, ops, timeoutMs) — meme
 * tolerance qu'acceptance/T62.spec.ts (II.3, `enonceDePeriode`), puisqu'aucune
 * source n'impose la signature (ADR-001). */
async function essayerAppel(fn: unknown, a: ArgsAppel): Promise<ResultatAppel | null> {
  if (typeof fn !== 'function') return null;
  const variantes: unknown[][] = [
    [a],
    [a.candidateCommand, a.benchDataDir, a.ops, a.timeoutMs],
    [a.benchDataDir, a.candidateCommand, a.ops, a.timeoutMs],
  ];
  for (const args of variantes) {
    try {
      const res = await (fn as (...x: unknown[]) => unknown)(...args);
      if (estResultatPlausible(res)) return res;
    } catch {
      /* forme d'appel rejetee : on essaie la suivante */
    }
  }
  return null;
}

async function resoudreRole(
  noms: readonly string[],
  a: ArgsAppel,
): Promise<{ resultat: ResultatAppel; nom: string } | null> {
  for (const nom of noms) {
    const fn = LOADED.flat.get(nom);
    const r = await essayerAppel(fn, a);
    if (r !== null) return { resultat: r, nom };
  }
  return null;
}

async function appelerPeriodRunner(a: ArgsAppel): Promise<ResultatAppel> {
  const r = await resoudreRole(ROLES_PERIOD_RUNNER, a);
  exige(
    r !== null,
    'period-runner-resolu',
    `PERIOD-RUNNER-INTROUVABLE parmi ${rendu([...ROLES_PERIOD_RUNNER])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  return (r as { resultat: ResultatAppel }).resultat;
}

async function appelerProbeRunner(a: ArgsAppel): Promise<ResultatAppel> {
  const r = await resoudreRole(ROLES_PROBE_RUNNER, a);
  exige(
    r !== null,
    'probe-runner-resolu',
    `PROBE-RUNNER-INTROUVABLE parmi ${rendu([...ROLES_PROBE_RUNNER])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  return (r as { resultat: ResultatAppel }).resultat;
}

function reponsePour(res: ResultatAppel, id: string): Reponse | null {
  return res.responses.find((r) => r.id === id) ?? null;
}

/* ═══════════════════════════ candidats de reference (II.3) ═════════════ */

const CANDIDAT_PERSISTANT = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 't63-persistent-kv-candidate.mjs');
const CANDIDAT_MEMOIRE_SEULE = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 't63-memory-only-candidate.mjs');

function commandePour(script: string): string[] {
  return ['node', script];
}

function nouveauRepertoireDonnees(suffixe: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `t63-${suffixe}-`));
}

function lireBootLog(dir: string): string[] {
  const p = path.join(dir, 'boot.log');
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0);
}

function pidsDistincts(lignesBoot: string[]): Set<string> {
  const out = new Set<string>();
  for (const l of lignesBoot) {
    const m = /^pid:([^:]+):boot/.exec(l);
    if (m !== null) out.add(m[1] as string);
  }
  return out;
}

/* ═══════════════════════════════ T63.A1 ═══════════════════════════════ */

test(
  "T63.A1 — un candidat de reference qui conserve son etat dans BENCH_DATA_DIR retrouve en P12 les reservations creees en P1 a P11, a travers un redemarrage de son processus entre chaque periode",
  async () => {
    assertPackagesLoaded();
    const benchDataDir = nouveauRepertoireDonnees('a1');
    const candidateCommand = commandePour(CANDIDAT_PERSISTANT);

    // P1 : creation du locataire temoin.
    const resCreation = await appelerPeriodRunner({
      candidateCommand,
      benchDataDir,
      ops: [{ id: 'create', op: 'create_tenant', args: { tenant_id: 'legacy' } }],
    });
    const repCreation = reponsePour(resCreation, 'create');
    exige(
      repCreation !== null && repCreation.ok === true,
      'p1-creation-tenant-ok',
      `P1-CREATION-TENANT-A-ECHOUE : ${rendu(repCreation)}`,
    );

    // P2 a P12 (onze periodes) : chacune ECRIT UNE reservation temoin —
    // chaque appel est une PERIODE SEPAREE, donc un redemarrage de processus
    // distinct (danger IV.1).
    const CLES = Array.from({ length: 11 }, (_, i) => `S${i + 1}`);
    for (let i = 0; i < CLES.length; i += 1) {
      const cle = CLES[i] as string;
      const res = await appelerPeriodRunner({
        candidateCommand,
        benchDataDir,
        ops: [
          {
            id: `ecrire-${cle}`,
            op: 'write',
            args: { tenant_id: 'legacy', key: cle, value: { status: 'confirmed', period: `P${i + 1}` } },
          },
        ],
      });
      const rep = reponsePour(res, `ecrire-${cle}`);
      exige(
        rep !== null && rep.ok === true,
        `ecriture-${cle}-ok`,
        `ECRITURE-${cle}-A-ECHOUE (periode P${i + 1}) : ${rendu(rep)}`,
      );
    }

    // Preuve anti-vacuite (danger IV.1) : au moins 12 PID distincts ont ete
    // observes dans boot.log (1 creation + 11 ecritures), donc chaque appel
    // a bien lance un PROCESSUS OS NEUF, jamais le meme garde en vie.
    const pids = pidsDistincts(lireBootLog(benchDataDir));
    exige(
      pids.size >= 12,
      'au-moins-douze-processus-distincts-observes',
      `MOINS-DE-DOUZE-PROCESSUS-DISTINCTS-OBSERVES (${pids.size}) dans boot.log : ${rendu(lireBootLog(benchDataDir))} — le moteur ne redemarre peut-etre pas le candidat entre periodes.`,
    );

    // P12, PROCESSUS NEUF ENCORE : relecture des onze reservations creees
    // en P1 a P11 — c'est l'enonce meme de T63.A1.
    const resLecture = await appelerPeriodRunner({
      candidateCommand,
      benchDataDir,
      ops: CLES.map((cle) => ({ id: `lire-${cle}`, op: 'read', args: { tenant_id: 'legacy', key: cle } })),
    });
    for (let i = 0; i < CLES.length; i += 1) {
      const cle = CLES[i] as string;
      const rep = reponsePour(resLecture, `lire-${cle}`);
      const valeur = (rep?.result as Json | undefined)?.value as Json | undefined;
      exige(
        rep !== null && rep.ok === true && valeur !== undefined && valeur !== null && valeur.status === 'confirmed' && valeur.period === `P${i + 1}`,
        `p12-retrouve-${cle}`,
        `P12-NE-RETROUVE-PAS ${cle} (ecrit en P${i + 1}) : ${rendu(rep)}`,
      );
    }
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T63.A2 ═══════════════════════════════ */

test(
  "T63.A2 — un candidat qui garde son etat en memoire seulement viole, dès la periode suivante, chaque controle qui depend d'un etat anterieur",
  async () => {
    assertPackagesLoaded();

    // Branche FAUTIVE : le candidat memoire-seule ECRIT a une periode puis
    // doit PERDRE la valeur a la periode suivante (nouveau processus).
    const benchDataDirFautif = nouveauRepertoireDonnees('a2-fautif');
    const commandeFautive = commandePour(CANDIDAT_MEMOIRE_SEULE);

    const resCreationF = await appelerPeriodRunner({
      candidateCommand: commandeFautive,
      benchDataDir: benchDataDirFautif,
      ops: [{ id: 'create', op: 'create_tenant', args: { tenant_id: 'legacy' } }],
    });
    exige(
      reponsePour(resCreationF, 'create')?.ok === true,
      'a2-fautif-creation-tenant-ok',
      `A2-FAUTIF-CREATION-TENANT-A-ECHOUE : ${rendu(resCreationF)}`,
    );

    const resEcritureF = await appelerPeriodRunner({
      candidateCommand: commandeFautive,
      benchDataDir: benchDataDirFautif,
      ops: [{ id: 'ecrire', op: 'write', args: { tenant_id: 'legacy', key: 'S1', value: 'temoin-a2' } }],
    });
    exige(
      reponsePour(resEcritureF, 'ecrire')?.ok === true,
      'a2-fautif-ecriture-ok',
      `A2-FAUTIF-ECRITURE-A-ECHOUE (periode courante) : ${rendu(resEcritureF)}`,
    );

    // PERIODE SUIVANTE, processus NEUF (le moteur redemarre TOUJOURS le
    // candidat entre deux appels — II.1) : create_tenant redevient necessaire
    // AVANT toute lecture, puisque l'etat du candidat (y compris la table
    // des locataires) est reparti de zero.
    const resCreationF2 = await appelerPeriodRunner({
      candidateCommand: commandeFautive,
      benchDataDir: benchDataDirFautif,
      ops: [
        { id: 'create2', op: 'create_tenant', args: { tenant_id: 'legacy' } },
        { id: 'lire', op: 'read', args: { tenant_id: 'legacy', key: 'S1' } },
      ],
    });
    exige(
      reponsePour(resCreationF2, 'create2')?.ok === true,
      'a2-fautif-periode-suivante-demarre',
      `A2-FAUTIF-PERIODE-SUIVANTE-N-A-PAS-DEMARRE : ${rendu(resCreationF2)}`,
    );
    const repLectureF = reponsePour(resCreationF2, 'lire');
    const valeurLueF = (repLectureF?.result as Json | undefined)?.value;
    exige(
      repLectureF !== null && repLectureF?.ok === true && (valeurLueF === null || valeurLueF === undefined),
      'a2-fautif-viole-le-controle-dependant-de-letat-anterieur',
      `A2-FAUTIF-RETROUVE-ENCORE-S1 (${rendu(valeurLueF)}) ALORS QU'IL NE PERSISTE RIEN DANS BENCH_DATA_DIR — le moteur ne redemarre peut-etre pas reellement le candidat entre periodes.`,
    );

    // Temoin ANTI-VACUITE (danger IV.2) : LA MEME sequence, sur le candidat
    // PERSISTANT, DOIT au contraire retrouver sa valeur — sinon un moteur
    // qui ne transmet jamais rien au disque verdirait la perte ci-dessus
    // pour la mauvaise raison (toute lecture rendrait nul, quel que soit le
    // candidat).
    const benchDataDirSain = nouveauRepertoireDonnees('a2-sain');
    const commandeSaine = commandePour(CANDIDAT_PERSISTANT);

    await appelerPeriodRunner({
      candidateCommand: commandeSaine,
      benchDataDir: benchDataDirSain,
      ops: [{ id: 'create', op: 'create_tenant', args: { tenant_id: 'legacy' } }],
    });
    await appelerPeriodRunner({
      candidateCommand: commandeSaine,
      benchDataDir: benchDataDirSain,
      ops: [{ id: 'ecrire', op: 'write', args: { tenant_id: 'legacy', key: 'S1', value: 'temoin-a2' } }],
    });
    const resLectureSain = await appelerPeriodRunner({
      candidateCommand: commandeSaine,
      benchDataDir: benchDataDirSain,
      ops: [{ id: 'lire', op: 'read', args: { tenant_id: 'legacy', key: 'S1' } }],
    });
    const repLectureSain = reponsePour(resLectureSain, 'lire');
    const valeurLueSaine = (repLectureSain?.result as Json | undefined)?.value;
    exige(
      repLectureSain !== null && repLectureSain?.ok === true && valeurLueSaine === 'temoin-a2',
      'a2-sain-retrouve-letat-anterieur',
      `A2-TEMOIN-ANTI-VACUITE-EN-ECHEC : le candidat PERSISTANT ne retrouve pas 'temoin-a2' en periode suivante (${rendu(repLectureSain)}) — la perte observee cote candidat memoire-seule ne prouve alors rien sur ce candidat en particulier.`,
    );
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T63.A3 ═══════════════════════════════ */

test(
  "T63.A3 — une sonde appliquee a une copie ne modifie pas l'etat de la trajectoire principale",
  async () => {
    assertPackagesLoaded();
    const benchDataDir = nouveauRepertoireDonnees('a3');
    const candidateCommand = commandePour(CANDIDAT_PERSISTANT);

    await appelerPeriodRunner({
      candidateCommand,
      benchDataDir,
      ops: [{ id: 'create', op: 'create_tenant', args: { tenant_id: 'legacy' } }],
    });
    await appelerPeriodRunner({
      candidateCommand,
      benchDataDir,
      ops: [{ id: 'ecrire', op: 'write', args: { tenant_id: 'legacy', key: 'main', value: 'before' } }],
    });

    // Sonde : ECRIT une valeur DIFFERENTE sur la MEME cle, via le « probe
    // runner » resolu — JAMAIS via fs.cpSync fait par cette suite elle-meme
    // (danger IV.3) : seul un clonage FAIT PAR LE MOTEUR prouve l'isolation
    // du moteur.
    const resSonde = await appelerProbeRunner({
      candidateCommand,
      benchDataDir,
      ops: [{ id: 'sonde-ecrit', op: 'write', args: { tenant_id: 'legacy', key: 'main', value: 'mutated-by-probe' } }],
    });
    const repSonde = reponsePour(resSonde, 'sonde-ecrit');
    // Anti-vacuite (danger IV.3) : la sonde doit REELLEMENT reussir son
    // ecriture (sur sa copie) avant que l'absence d'effet sur l'original
    // n'ait un sens.
    exige(
      repSonde !== null && repSonde.ok === true,
      'sonde-a-reellement-ecrit-sur-sa-copie',
      `SONDE-N-A-PAS-REUSSI-SON-ECRITURE (meme sur sa propre copie) : ${rendu(repSonde)} — l'absence d'effet sur l'original ne prouverait alors rien.`,
    );

    // L'ORIGINAL, relu par un NOUVEL appel au period runner (processus
    // encore redemarre), doit retrouver EXACTEMENT 'before' — jamais
    // 'mutated-by-probe'.
    const resRelecture = await appelerPeriodRunner({
      candidateCommand,
      benchDataDir,
      ops: [{ id: 'relire', op: 'read', args: { tenant_id: 'legacy', key: 'main' } }],
    });
    const repRelecture = reponsePour(resRelecture, 'relire');
    const valeurRelue = (repRelecture?.result as Json | undefined)?.value;
    exige(
      repRelecture !== null && repRelecture.ok === true && valeurRelue === 'before',
      'original-intact-apres-la-sonde',
      `ORIGINAL-MODIFIE-PAR-LA-SONDE (valeur relue ${rendu(valeurRelue)}, attendue "before") — la sonde a probablement ete appliquee a l'etat principal au lieu d'une copie.`,
    );
  },
  CASE_TIMEOUT_MS,
);
