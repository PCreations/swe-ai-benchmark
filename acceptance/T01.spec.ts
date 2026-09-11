/**
 * acceptance/T01.spec.ts — suite d'acceptation de la tache T01.
 *
 * « Rendre le systeme de preuve non contournable par accident » (cahier L159).
 *
 * Cas requis (verification/cases.lock.json, gele — les six sont `refusal`) :
 *   T01.A1 rapport vide refuse
 *   T01.A2 assertion sautee refusee
 *   T01.A3 identifiant obligatoire absent refuse
 *   T01.A4 fixture modifiee apres execution invalide la preuve
 *   T01.A5 rapport d'un ancien commit ne valide pas le commit courant
 *   T01.A6 corruption de F-MONEY (341 au lieu de 340) detectee par la
 *          verification des references
 *
 * -------------------------------------------------------------------------
 * LA FORME DE CHAQUE CAS : DEUX JUMEAUX QUI NE DIFFERENT QUE PAR UN POINT.
 *
 * verification/cases.lock.json classe les six cas en `refusal` et documente le
 * defaut decisif de ce mode de preuve : « un stub qui leve rend ce cas VERT
 * sans rien prouver ». Un verificateur qui refuserait TOUT satisferait la
 * lettre des six enonces sans rien verifier.
 *
 * Chaque cas est donc ecrit comme une PAIRE de runs du meme verificateur, sur
 * la meme tache-sonde, avec le meme registre synthetique isole, ne differant
 * que par la propriete nommee par le cas :
 *
 *   jumeau SAIN     -> exige exit 0 et reason PASS   (capacite de non-refus)
 *   jumeau VICIE    -> exige exit != 0, reason != PASS, et aucun statut vert
 *
 * Une implementation permissive verdit le jumeau VICIE : le cas tombe.
 * Une implementation universellement refusante noircit le jumeau SAIN : le cas
 * tombe aussi. C'est la tenaille ; aucun des deux cotes n'est decoratif.
 *
 * -------------------------------------------------------------------------
 * LE CODE DE SORTIE NE SUFFIT PAS.
 *
 * Invariant 12 (cahier L74) : « ni test saute, ni rapport absent, ni simple
 * code de sortie d'un sous-processus ne suffisent ». Chaque run efface d'abord
 * le rapport cible, puis exige que CE run le reecrive, et lit son contenu :
 * `reason`, cas executes, statuts individuels. Un refus qui laisserait
 * subsister un statut vert sur un cas requis est traite comme un echec.
 *
 * -------------------------------------------------------------------------
 * PROVENANCE DES LITTERAUX.
 *
 * Tout nombre compare ici vient de l'une des deux sources admises, et d'aucune
 * autre :
 *   - la grille du cahier l.103, recalculee dans la suite (100 x 2 + 40 x 1 +
 *     20 x 5 = 340 ; deux appels = 680), chaque terme portant `// cahier:L103` ;
 *   - la fixture maitresse acceptance/reference/F-MONEY.json, LUE a son chemin
 *     canonique dans la racine gelee et confrontee a la grille ci-dessus — A4
 *     et A6 ferment la boucle des deux cotes.
 * Les comptes de taches et de cas (44 taches ; le total des cas) ne sont pas
 * ecrits en dur : 44 vient de la l.5, et le total est COMPTE dans docs/cahier.md
 * puis confronte a ce que verification/tasks.json declare. Le contrat de sortie
 * (0 / PASS) vient de l.133 et d'ADR-005 point 1. Aucun litteral n'a ete releve
 * sur une execution.
 *
 * -------------------------------------------------------------------------
 * AVEUGLEMENT (ADR-001). Cette suite a ete ecrite depuis docs/specs/T01.md,
 * docs/cahier.md, verification/cases.lock.json, verification/tasks.json, la
 * racine gelee acceptance/reference/** avec sa declaration de gel
 * docs/FROZEN_ROOTS.json, et la surface publique deja livree par T00
 * (`bench help`). Elle ne nomme aucun chemin de module de
 * verification/runner/**, et n'importe rien de l'implementation : tout passe
 * par la commande publique `pnpm verify:task <Txx>` et par le rapport
 * verification/results/<Txx>.json que le cahier (l.135) prescrit.
 *
 * -------------------------------------------------------------------------
 * CE QUI A CHANGE DEPUIS LA PREMIERE ECRITURE DE CETTE SUITE (commit 4935061).
 *
 * 1. acceptance/reference/** N'EXISTAIT PAS. A6 cherchait « un fichier de la
 *    racine contenant 340 ». La racine existe et est scellee : A6 lit desormais
 *    F-MONEY a son chemin canonique, compare l'empreinte constatee a celle que
 *    docs/FROZEN_ROOTS.json declare, et corrompt la VALEUR declaree au lieu de
 *    substituer un motif texte. A4 confronte en outre le total de sa fixture de
 *    sonde a celui que la fixture maitresse declare.
 * 2. LE TABLEAU §J DE LA CARTE ETAIT TRONQUE a quatre lignes (commit 8d0e5ec l'a
 *    porte a L567-L612, et lui a joint L541 et L543-L545). A3 y gagne son
 *    controle de registre : sur quatre lignes, « le registre reference
 *    reellement tous les cas du cahier » (l.167) n'etait pas decidable.
 *
 * Le cahier ne fige pas le NOM des champs du rapport (l.135 en fige le
 * CONTENU). Les lectures portent donc sur un ensemble borne et documente de
 * noms plausibles et echouent bruyamment en listant les cles reellement
 * presentes — jamais en verdissant par defaut.
 */

// La chaine tourne en ESM reel (jest.config.mjs). L'objet `jest` n'est pas
// injecte en ESM et @jest/globals n'est pas hisse a la racine : cette suite
// n'utilise donc jamais `jest.*`. Les delais sont passes en 3e argument.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_TIMEOUT_MS = 25 * 60 * 1000;

/* ------------------------------------------------------------------ socle */

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
const RESULTS_DIR = path.join(REPO, 'verification', 'results');
const REGISTRY_DIR = path.join(REPO, 'acceptance', 'fixtures', 'registries');
const FIXTURE_NOT_IMPLEMENTED = path.join(REGISTRY_DIR, 'synthetic-44-not-implemented.json');
const CASES_LOCK = path.join(REPO, 'verification', 'cases.lock.json');
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');
const PROBE_FIXTURE_DIR = path.join(REPO, 'acceptance', 'fixtures', 'probes');
const PROBE_FIXTURE = path.join(PROBE_FIXTURE_DIR, 'T01-money.probe.json');

type Json = Record<string, unknown>;

interface RunResult {
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): RunResult {
  const r: SpawnSyncReturns<string> = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    timeout: opts.timeoutMs ?? 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const spawnError = r.error ? `\n<spawn-error> ${r.error.message}` : '';
  return {
    command: [cmd, ...args].join(' '),
    code: r.status,
    stdout: r.stdout ?? '',
    stderr: (r.stderr ?? '') + spawnError,
  };
}

function git(...args: string[]): string {
  const r = run('git', args);
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} -> ${String(r.code)}\n${r.stderr}`);
  return r.stdout.trim();
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/* --------------------------------------------------------------- rapports */

function reportPath(taskId: string): string {
  return path.join(RESULTS_DIR, `${taskId}.json`);
}

function clearReport(taskId: string): void {
  const p = reportPath(taskId);
  if (fs.existsSync(p)) fs.rmSync(p);
}

function readReport(taskId: string): Json | null {
  const p = reportPath(taskId);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(p, 'utf8'));
    return parsed !== null && typeof parsed === 'object' ? (parsed as Json) : null;
  } catch {
    return null;
  }
}

/**
 * `reason` est le seul nom de champ que le contrat fixe explicitement
 * (ADR-005 point 1). Il est lu dans le rapport ; a defaut de rapport, on
 * accepte qu'il soit expose de facon lisible par une machine sur la sortie.
 * Ce repli ne peut pas verdir un cas a tort : il exige toujours le jeton exact.
 */
function reasonOf(taskId: string, proc: RunResult): string | null {
  const rep = readReport(taskId);
  if (rep && typeof rep.reason === 'string') return rep.reason.toUpperCase();
  const m = /"reason"\s*:\s*"([A-Za-z_]+)"/.exec(`${proc.stdout}\n${proc.stderr}`);
  const captured = m === null ? undefined : m[1];
  return captured === undefined ? null : captured.toUpperCase();
}

const EXECUTED_KEYS = [
  'executed_cases', 'cases_executed', 'ran_cases', 'observed_cases',
  'executed_assertions', 'assertions_executed', 'executed',
];
const STATUS_KEYS = [
  'case_results', 'case_statuses', 'individual_statuses',
  'cases', 'statuses', 'results',
];
const COMMIT_KEYS = [
  'commit', 'subject_commit', 'source_commit', 'head_commit',
  'commit_sha', 'revision', 'head',
];
const FIXTURE_DIGEST_KEYS = [
  'fixtures_digest', 'fixture_digest', 'fixtures_sha256', 'fixtures_hash',
  'fixtures_fingerprint', 'empreinte_fixtures', 'fixtures', 'input_digest',
];

const PASS_TOKENS = new Set(['PASS', 'PASSED', 'OK', 'SUCCESS', 'GREEN']);
const FAIL_TOKENS = new Set(['FAIL', 'FAILED', 'ASSERTION_FAILED', 'ERROR', 'RED', 'KO']);
const SKIP_TOKENS = new Set(['SKIP', 'SKIPPED', 'PENDING', 'TODO', 'NOT_RUN']);

function firstPresent(rep: Json, keys: string[]): { key: string; value: unknown } | null {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(rep, k) && rep[k] !== null && rep[k] !== undefined) {
      return { key: k, value: rep[k] };
    }
  }
  return null;
}

function idsFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === 'string') out.push(v);
      else if (v !== null && typeof v === 'object') {
        const o = v as Json;
        const id = o.id ?? o.case ?? o.case_id ?? o.name;
        if (typeof id === 'string') out.push(id);
      }
    }
    return out;
  }
  if (value !== null && typeof value === 'object') return Object.keys(value as Json);
  return [];
}

/** id de cas -> statut normalise en majuscules. */
function statusMap(rep: Json): Map<string, string> {
  const out = new Map<string, string>();
  const found = firstPresent(rep, STATUS_KEYS);
  if (found === null) return out;
  const v = found.value;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item === null || typeof item !== 'object') continue;
      const o = item as Json;
      const id = o.id ?? o.case ?? o.case_id ?? o.name;
      const st = o.status ?? o.result ?? o.verdict ?? o.state;
      if (typeof id === 'string' && typeof st === 'string') out.set(id, st.toUpperCase());
    }
  } else if (v !== null && typeof v === 'object') {
    for (const [id, raw] of Object.entries(v as Json)) {
      if (typeof raw === 'string') out.set(id, raw.toUpperCase());
      else if (raw !== null && typeof raw === 'object') {
        const o = raw as Json;
        const st = o.status ?? o.result ?? o.verdict ?? o.state;
        if (typeof st === 'string') out.set(id, st.toUpperCase());
      }
    }
  }
  return out;
}

/** Les cas requis portant un statut VERT dans le rapport. */
function greenCases(taskId: string, required: string[]): string[] {
  const rep = readReport(taskId);
  if (rep === null) return [];
  const statuses = statusMap(rep);
  return required.filter((id) => PASS_TOKENS.has(statuses.get(id) ?? ''));
}

function requireField(rep: Json, keys: string[], what: string): unknown {
  const found = firstPresent(rep, keys);
  const verdict = found
    ? 'present'
    : `ABSENT(${what}) cles-du-rapport=[${Object.keys(rep).join(', ')}]`;
  expect(verdict).toBe('present');
  return found ? found.value : undefined;
}

/** Rend comparable une empreinte dont le cahier ne fixe pas la serialisation. */
function digestToken(value: unknown): string {
  if (typeof value === 'string') return value;
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

/* --------------------------------------------------- registres synthetiques */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-t01-'));

/**
 * Taches-sonde. Choisies parmi celles dont verification/cases.lock.json
 * n'exige que la capacite `node22` — un verdict BLOCKED pour capacite absente
 * confondrait un refus de preuve avec un tout autre etat — et DISTINCTES de
 * celles qu'emploie acceptance/T00.spec.ts (T13, T22, T30, T43), pour que les
 * deux suites puissent tourner sans se marcher dessus.
 */
const PROBE_EMPTY = 'T03';
const PROBE_SKIP = 'T04';
const PROBE_MISSING = 'T05';
const PROBE_FIXTURE_TASK = 'T06';
const PROBE_COMMIT = 'T07';
const PROBE_REFERENCE = 'T08';
const TOUCHED_TASKS = [
  PROBE_EMPTY, PROBE_SKIP, PROBE_MISSING, PROBE_FIXTURE_TASK, PROBE_COMMIT, PROBE_REFERENCE,
];

function caseIdsOf(task: string): string[] {
  const lock = JSON.parse(fs.readFileSync(CASES_LOCK, 'utf8')) as {
    cases: Array<{ id: string; task: string }>;
  };
  return lock.cases.filter((c) => c.task === task).map((c) => c.id);
}

function loadFixture(file: string): Json {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
}

/**
 * Un registre synthetique isole (ADR-005 point 2 : BENCH_REGISTRY) ou la carte
 * de la tache-sonde pointe vers l'entree generee.
 *
 * `required_cases` reste le jeu COMPLET du verrou de cas, y compris pour la
 * sonde d'A3 : c'est la SUITE qui omet un identifiant, jamais le registre.
 * Reduire required_cases serait un affaiblissement d'acceptation, pas un test.
 */
function probeRegistry(task: string, entry: string, name: string): string {
  const base = loadFixture(FIXTURE_NOT_IMPLEMENTED);
  const tasks = (base.tasks as Json[]).map((t) => ({ ...t }));
  const card = tasks.find((t) => t.id === task);
  if (!card) throw new Error(`fixture de registre sans carte ${task}`);
  card.acceptance_entry = entry;
  card.depends_on = [];
  card.required_cases = caseIdsOf(task);
  // Le perimetre de source de la sonde : c'est lui qui delimite les fixtures
  // dont le cahier (l.135) exige l'empreinte dans le rapport.
  card.source_paths = ['acceptance'];
  const patched: Json = { ...base, tasks };
  const p = path.join(TMP, name);
  fs.writeFileSync(p, `${JSON.stringify(patched, null, 2)}\n`, 'utf8');
  return p;
}

const invocationLog: string[] = [];

function runVerify(taskId: string, registry: string): RunResult {
  if (taskId === 'T01') {
    throw new Error('T01.spec.ts ne doit jamais reinvoquer verify:task T01 (recursion).');
  }
  const env: NodeJS.ProcessEnv = { ...process.env, BENCH_REGISTRY: registry };
  clearReport(taskId); // invariant 12 : le rapport lu doit venir de CE run
  const proc = run('pnpm', ['verify:task', taskId], { env });
  invocationLog.push(
    `verify:task ${taskId} registre=${path.basename(registry)} ` +
      `exit=${String(proc.code)} reason=${String(reasonOf(taskId, proc))}`,
  );
  return proc;
}

/* ------------------------------------------------------ sondes generees */

const GENERATED_ENTRIES: string[] = [];

function writeProbe(entry: string, source: string): string {
  const abs = path.join(REPO, entry);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, source, 'utf8');
  if (!GENERATED_ENTRIES.includes(entry)) GENERATED_ENTRIES.push(entry);
  return entry;
}

const BANNER = [
  '// FICHIER GENERE par acceptance/T01.spec.ts (sondes des six cas de T01).',
  '// Supprime automatiquement en fin de suite. Ne jamais committer.',
  '',
].join('\n');

/** Une suite dont chaque cas requis porte une assertion reelle et vraie. */
function sourceTruthy(task: string): string {
  const lines = [BANNER];
  for (const id of caseIdsOf(task)) {
    lines.push(`test('${id} assertion vraie', () => {`);
    lines.push('  expect(2 + 2).toBe(4);');
    lines.push('});');
    lines.push('');
  }
  return lines.join('\n');
}

/** Meme suite, mais AUCUNE assertion n'est executee : le rapport est vide. */
function sourceAssertionless(task: string): string {
  const lines = [BANNER];
  for (const id of caseIdsOf(task)) {
    lines.push(`test('${id} aucune assertion executee', () => {`);
    lines.push('  // volontairement vide : la chaine sort en 0 sans rien observer');
    lines.push('});');
    lines.push('');
  }
  return lines.join('\n');
}

/** Meme suite, mais le PREMIER cas requis est saute. */
function sourceSkipped(task: string): string {
  const ids = caseIdsOf(task);
  const lines = [BANNER];
  ids.forEach((id, i) => {
    lines.push(`${i === 0 ? 'test.skip' : 'test'}('${id} assertion vraie', () => {`);
    lines.push('  expect(2 + 2).toBe(4);');
    lines.push('});');
    lines.push('');
  });
  return lines.join('\n');
}

/** Meme suite, mais le DERNIER cas requis n'est jamais emis. */
function sourceMissingId(task: string): string {
  const ids = caseIdsOf(task);
  const lines = [BANNER];
  ids.forEach((id, i) => {
    const last = i === ids.length - 1;
    const title = last ? 'cas sans identifiant declare' : `${id} assertion vraie`;
    lines.push(`test('${title}', () => {`);
    lines.push('  expect(2 + 2).toBe(4);');
    lines.push('});');
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * Sonde d'A4. Chaque cas lit la fixture et asserte sa valeur ; la variante
 * `mutate` modifie EN PLUS le fichier de fixture pendant l'execution, apres
 * son assertion. Les assertions restent vraies et la chaine sort en 0 : seule
 * l'empreinte des fixtures a bouge.
 */
function sourceFixture(task: string, mutate: boolean): string {
  const ids = caseIdsOf(task);
  const lines = [
    BANNER,
    "import * as fs from 'node:fs';",
    '',
    `const FIXTURE = ${JSON.stringify(PROBE_FIXTURE)};`,
    '',
  ];
  ids.forEach((id, i) => {
    lines.push(`test('${id} la fixture porte le total du cahier', () => {`);
    lines.push('  const f = JSON.parse(fs.readFileSync(FIXTURE, \'utf8\'));');
    lines.push('  expect(f.total_micro_usd).toBe(340); // cahier:L103');
    if (mutate && i === 0) {
      lines.push('  // la fixture bouge APRES avoir ete lue et hachee par le runner');
      lines.push('  fs.appendFileSync(FIXTURE, \'\\n\');');
    }
    lines.push('});');
    lines.push('');
  });
  return lines.join('\n');
}

/* ------------------------------------------------------ fixture de reference */

interface MoneyReference {
  file: string;
  original: Buffer;
}

const FROZEN_ROOTS = path.join(REPO, 'docs', 'FROZEN_ROOTS.json');
const F_MONEY = path.join(REFERENCE_DIR, 'F-MONEY.json');

/**
 * LA GRILLE DU CAHIER, RECALCULEE ICI — aucun de ces nombres n'a ete releve sur
 * une execution, ni recopie depuis le fichier que ce test juge.
 *
 * cahier:L103 — « `F-MONEY`. Grille fictive : entree non cachee 2
 * micro-USD/token ; entree cachee 1 ; sortie 5. Un appel de 100 tokens non
 * caches, 40 caches et 20 de sortie vaut 340 micro-USD. Deux appels identiques
 * valent 680. »
 */
const MONEY = {
  prix_entree_non_cachee: 2, // cahier:L103
  prix_entree_cachee: 1, // cahier:L103
  prix_sortie: 5, // cahier:L103
  tokens_entree_non_caches: 100, // cahier:L103
  tokens_entree_caches: 40, // cahier:L103
  tokens_sortie: 20, // cahier:L103
  nombre_d_appels_identiques: 2, // cahier:L103
} as const;

/** 100 x 2 + 40 x 1 + 20 x 5 = 340 micro-USD. cahier:L103 */
const MONEY_UN_APPEL =
  MONEY.tokens_entree_non_caches * MONEY.prix_entree_non_cachee +
  MONEY.tokens_entree_caches * MONEY.prix_entree_cachee +
  MONEY.tokens_sortie * MONEY.prix_sortie;

/** Deux appels identiques : 680 micro-USD. cahier:L103 */
const MONEY_DEUX_APPELS = MONEY.nombre_d_appels_identiques * MONEY_UN_APPEL;

/**
 * Chemins documentes PAR LA FIXTURE elle-meme (`valeurs.<groupe>.<champ>.valeur`).
 * Ils ne sont pas devinables : ils sont lus dans acceptance/reference/F-MONEY.json,
 * fichier de la racine GELEE (cahier:L139, docs/FROZEN_ROOTS.json).
 */
const CHEMIN_COUT_UN_APPEL = ['valeurs', 'appel_de_reference', 'cout_attendu', 'valeur'] as const;
const CHEMIN_COUT_DEUX_APPELS = [
  'valeurs', 'deux_appels_identiques', 'cout_attendu', 'valeur',
] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** Descend un chemin de cles ; rend `undefined` des qu'une etape manque. */
function at(root: unknown, chemin: readonly string[]): unknown {
  let cur: unknown = root;
  for (const k of chemin) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

/**
 * La fixture maitresse F-MONEY, lue A SON CHEMIN CANONIQUE.
 *
 * La version precedente de cette suite cherchait « un fichier de
 * acceptance/reference contenant 340 » : la racine n'existait pas encore et le
 * cahier n'en fixe pas le nom de fichier. Elle existe desormais, scellee par
 * docs/FROZEN_ROOTS.json. La chercher par son contenu reviendrait a laisser le
 * fichier juge choisir lui-meme s'il est le bon — une fixture corrompue au
 * point de ne plus porter 340 deviendrait « introuvable » au lieu d'etre
 * refusee. Echoue bruyamment en listant la racine reellement presente.
 */
function lireFMoney(): { file: string; text: string; objet: Json } | string {
  if (!fs.existsSync(F_MONEY)) {
    const presents = walk(REFERENCE_DIR).map((f) => path.relative(REPO, f));
    return (
      `ABSENT ${path.relative(REPO, F_MONEY)} (livrable T01, cahier L161) — ` +
      `racine=[${presents.join(', ')}]`
    );
  }
  const text = fs.readFileSync(F_MONEY, 'utf8');
  let objet: Json;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return `ILLISIBLE ${path.relative(REPO, F_MONEY)} : racine non objet`;
    objet = parsed as Json;
  } catch (e) {
    return `ILLISIBLE ${path.relative(REPO, F_MONEY)} : ${String(e)}`;
  }
  return { file: F_MONEY, text, objet };
}

/**
 * L'empreinte que docs/FROZEN_ROOTS.json declare pour un fichier de la racine
 * gelee. cahier:L139 — « La racine des fixtures de reference est gelee apres
 * T01 ; toute modification est visible dans le diff et invalide les preuves
 * precedentes. » Rend un diagnostic (jamais une valeur plausible) si la
 * declaration manque : une comparaison ne peut pas verdir par defaut.
 */
function empreinteGelee(relatif: string): string {
  if (!fs.existsSync(FROZEN_ROOTS)) return 'DECLARATION-DE-GEL-ABSENTE';
  const decl: unknown = JSON.parse(fs.readFileSync(FROZEN_ROOTS, 'utf8'));
  const roots = at(decl, ['roots']);
  if (!Array.isArray(roots)) return 'DECLARATION-DE-GEL-SANS-RACINE';
  for (const r of roots) {
    const fichiers = at(r, ['fichiers']);
    if (!Array.isArray(fichiers)) continue;
    for (const f of fichiers) {
      if (at(f, ['chemin']) === relatif) {
        const s = at(f, ['sha256']);
        return typeof s === 'string' ? s : `EMPREINTE-NON-DECLAREE(${relatif})`;
      }
    }
  }
  return `NON-GELE(${relatif})`;
}

/* ------------------------------------- le registre confronte au cahier (L167) */

const CAHIER = path.join(REPO, 'docs', 'cahier.md');
const TASKS_REGISTRY = path.join(REPO, 'verification', 'tasks.json');

interface CarteDeTache {
  id: string;
  depends_on: string[];
  required_cases: string[];
}
interface Registre {
  required_case_count?: number;
  tasks: CarteDeTache[];
}

function lireCahier(): string[] {
  return fs.readFileSync(CAHIER, 'utf8').split('\n');
}

function lireRegistre(): Registre {
  return JSON.parse(fs.readFileSync(TASKS_REGISTRY, 'utf8')) as Registre;
}

/** §H — une section par tache : `**Txx — titre**` jusqu'a l'en-tete suivante. */
function sectionsDeTache(lines: string[]): Array<{ id: string; texte: string }> {
  const debuts: Array<{ id: string; ligne: number }> = [];
  lines.forEach((l, i) => {
    const m = /^\*\*(T\d\d)\s+—/.exec(l);
    if (m !== null) debuts.push({ id: m[1] as string, ligne: i });
  });
  return debuts.map((d, i) => {
    const suivant = debuts[i + 1];
    const fin = suivant === undefined ? lines.length : suivant.ligne;
    return { id: d.id, texte: lines.slice(d.ligne, fin).join('\n') };
  });
}

/**
 * Les identifiants de cas que le CAHIER nomme, tache par tache. Il ecrit le
 * premier en entier (`T01.A1`) puis abrege (`A2` ... `A6`) ; les deux formes
 * sont toujours entre accents graves. Un identifiant pleinement qualifie est
 * attribue a la tache qu'il nomme, jamais a la section qui le cite.
 */
function casNommesParLeCahier(lines: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of sectionsDeTache(lines)) {
    const ids = new Set<string>();
    for (const m of s.texte.matchAll(/`(T\d\d)\.(A\d+)`/g)) {
      ids.add(`${m[1] as string}.${m[2] as string}`);
    }
    for (const m of s.texte.matchAll(/`(A\d+)`/g)) ids.add(`${s.id}.${m[1] as string}`);
    out.set(s.id, [...ids].sort());
  }
  return out;
}

/**
 * §J — le tableau des dependances directes (cahier:L567-L612, de-tronque par la
 * carte de specification). `—` vaut aucune dependance ; « Toutes les taches
 * TAA a TBB » est une plage inclusive, pas deux dependances.
 */
function dependancesDuCahier(lines: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const entete = lines.findIndex((l) => /^\|\s*Tâche\s*\|\s*Dépendances directes\s*\|$/.test(l));
  if (entete < 0) return out;
  for (let i = entete + 1; i < lines.length; i += 1) {
    const l = lines[i] as string;
    if (!l.startsWith('|')) break;
    const m = /^\|\s*(T\d\d)\s*\|\s*(.*?)\s*\|$/.exec(l);
    if (m === null) continue;
    const cellule = m[2] as string;
    const plage = /[Tt]outes les t[âa]ches\s+T(\d\d)\s+[àa]\s+T(\d\d)/.exec(cellule);
    let deps: string[];
    if (plage !== null) {
      deps = [];
      for (let n = Number(plage[1]); n <= Number(plage[2]); n += 1) {
        deps.push(`T${String(n).padStart(2, '0')}`);
      }
    } else if (/^[—–-]?$/.test(cellule)) {
      deps = [];
    } else {
      deps = cellule.match(/T\d\d/g) ?? [];
    }
    out.set(m[1] as string, deps);
  }
  return out;
}

/* ---------------------------------------------------------------- hygiene */

const savedReports = new Map<string, string>();
let referenceBackup: MoneyReference | null = null;

function saveReports(): void {
  for (const t of TOUCHED_TASKS) {
    const p = reportPath(t);
    if (fs.existsSync(p)) savedReports.set(t, fs.readFileSync(p, 'utf8'));
  }
}

function restoreReports(): void {
  for (const t of TOUCHED_TASKS) {
    const p = reportPath(t);
    const saved = savedReports.get(t);
    if (saved === undefined) {
      if (fs.existsSync(p)) fs.rmSync(p);
    } else {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, saved, 'utf8');
    }
  }
}

function restoreReference(): void {
  if (referenceBackup !== null) {
    fs.writeFileSync(referenceBackup.file, referenceBackup.original);
    referenceBackup = null;
  }
}

function removeGenerated(): void {
  for (const entry of GENERATED_ENTRIES) {
    const abs = path.join(REPO, entry);
    if (fs.existsSync(abs)) fs.rmSync(abs);
  }
  if (fs.existsSync(PROBE_FIXTURE_DIR)) fs.rmSync(PROBE_FIXTURE_DIR, { recursive: true, force: true });
}

beforeAll(() => {
  saveReports();
}, 60_000);

afterAll(() => {
  restoreReference();
  removeGenerated();
  restoreReports();
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  // Trace d'execution : ce qui a REELLEMENT ete invoque, pour l'auditeur.
  process.stdout.write(`\n[T01] invocations observees :\n  ${invocationLog.join('\n  ')}\n`);
}, 120_000);

/* ------------------------------------------------------------------ cas */

/**
 * Le jumeau SAIN, partage par les six cas. Un refus n'est un refus que s'il
 * existe un non-refus : si cette invocation ne rend pas 0/PASS, aucun des six
 * cas ne prouve quoi que ce soit, et tous doivent tomber.
 */
interface Verdict {
  exit: number | null;
  reason: string | null;
}

function verdict(taskId: string, registry: string): Verdict {
  const proc = runVerify(taskId, registry);
  return { exit: proc.code, reason: reasonOf(taskId, proc) };
}

describe('T01 — le systeme de preuve n est pas contournable par accident', () => {
  test('T01.A1 un rapport sans aucune assertion executee est refuse', () => {
    const required = caseIdsOf(PROBE_EMPTY);
    const sain = writeProbe(`acceptance/${PROBE_EMPTY}.t01-sain.probe.spec.ts`, sourceTruthy(PROBE_EMPTY));
    const vide = writeProbe(
      `acceptance/${PROBE_EMPTY}.t01-vide.probe.spec.ts`,
      sourceAssertionless(PROBE_EMPTY),
    );

    // JUMEAU SAIN — les memes cas, les memes noms, une assertion reelle chacun.
    const sainVerdict = verdict(PROBE_EMPTY, probeRegistry(PROBE_EMPTY, sain, 'a1-sain.json'));
    const sainGreens = greenCases(PROBE_EMPTY, required);

    // JUMEAU VICIE — seule difference : zero assertion executee.
    const videVerdict = verdict(PROBE_EMPTY, probeRegistry(PROBE_EMPTY, vide, 'a1-vide.json'));
    const videGreens = greenCases(PROBE_EMPTY, required);
    const videReport = readReport(PROBE_EMPTY);

    expect({
      // cahier:L133 — « code 0 si toutes ses assertions requises [...] reussissent »
      sain: { exit: sainVerdict.exit, reason: sainVerdict.reason, verts: sainGreens.length },
      // cahier:L139 — « un test avec zero assertion [...] ne satisfait pas le contrat »
      vide: {
        refuse: videVerdict.exit !== 0 && videVerdict.exit !== null,
        pass: videVerdict.reason !== null && PASS_TOKENS.has(videVerdict.reason),
        verts: videGreens,
      },
    }).toEqual({
      sain: { exit: 0, reason: 'PASS', verts: required.length },
      vide: { refuse: true, pass: false, verts: [] },
    });

    // cahier:L163 — « un sous-processus qui sort avec 0 sans produire ses
    // preuves n'est pas suffisant » : le refus doit etre CONSIGNE, pas seulement
    // signale par un code de sortie.
    expect(videReport === null ? 'RAPPORT-ABSENT' : 'rapport-present').toBe('rapport-present');
  }, SUITE_TIMEOUT_MS);

  test('T01.A2 un rapport contenant une assertion sautee est refuse', () => {
    const required = caseIdsOf(PROBE_SKIP);
    const saute = required[0] as string;
    const sain = writeProbe(`acceptance/${PROBE_SKIP}.t01-sain.probe.spec.ts`, sourceTruthy(PROBE_SKIP));
    const vicie = writeProbe(
      `acceptance/${PROBE_SKIP}.t01-saute.probe.spec.ts`,
      sourceSkipped(PROBE_SKIP),
    );

    const sainVerdict = verdict(PROBE_SKIP, probeRegistry(PROBE_SKIP, sain, 'a2-sain.json'));
    const sainGreens = greenCases(PROBE_SKIP, required);

    const vicieVerdict = verdict(PROBE_SKIP, probeRegistry(PROBE_SKIP, vicie, 'a2-saute.json'));
    const vicieRep = readReport(PROBE_SKIP);
    const statut = vicieRep === null ? 'RAPPORT-ABSENT' : (statusMap(vicieRep).get(saute) ?? 'ABSENT');

    expect({
      sain: { exit: sainVerdict.exit, reason: sainVerdict.reason, verts: sainGreens.length },
      saute: {
        refuse: vicieVerdict.exit !== 0 && vicieVerdict.exit !== null,
        pass: vicieVerdict.reason !== null && PASS_TOKENS.has(vicieVerdict.reason),
        // cahier:L74 — « ni test saute [...] ne suffisent » : un cas saute ne
        // doit jamais etre compte comme reussi.
        casSauteVert: PASS_TOKENS.has(statut),
      },
    }).toEqual({
      sain: { exit: 0, reason: 'PASS', verts: required.length },
      saute: { refuse: true, pass: false, casSauteVert: false },
    });

    // Et il doit rester IDENTIFIABLE comme saute ou manquant, jamais silencieux.
    expect(FAIL_TOKENS.has(statut) || SKIP_TOKENS.has(statut) || statut === 'ABSENT').toBe(true);
  }, SUITE_TIMEOUT_MS);

  test('T01.A3 un rapport auquel manque un identifiant obligatoire est refuse', () => {
    const required = caseIdsOf(PROBE_MISSING);
    const manquant = required[required.length - 1] as string;
    const sain = writeProbe(
      `acceptance/${PROBE_MISSING}.t01-sain.probe.spec.ts`,
      sourceTruthy(PROBE_MISSING),
    );
    const vicie = writeProbe(
      `acceptance/${PROBE_MISSING}.t01-manquant.probe.spec.ts`,
      sourceMissingId(PROBE_MISSING),
    );

    const sainVerdict = verdict(PROBE_MISSING, probeRegistry(PROBE_MISSING, sain, 'a3-sain.json'));
    const sainGreens = greenCases(PROBE_MISSING, required);

    // Le registre declare TOUJOURS les six cas requis : seule la suite en omet un.
    const vicieVerdict = verdict(
      PROBE_MISSING,
      probeRegistry(PROBE_MISSING, vicie, 'a3-manquant.json'),
    );
    const vicieRep = readReport(PROBE_MISSING);
    const executes = vicieRep === null ? [] : idsFrom(firstPresent(vicieRep, EXECUTED_KEYS)?.value);
    const greens = greenCases(PROBE_MISSING, required);

    expect({
      sain: { exit: sainVerdict.exit, reason: sainVerdict.reason, verts: sainGreens.length },
      manquant: {
        refuse: vicieVerdict.exit !== 0 && vicieVerdict.exit !== null,
        pass: vicieVerdict.reason !== null && PASS_TOKENS.has(vicieVerdict.reason),
        // cahier:L139 — « le verificateur refuse [...] les identifiants manquants »
        identifiantExecute: executes.includes(manquant),
        identifiantVert: greens.includes(manquant),
      },
    }).toEqual({
      sain: { exit: 0, reason: 'PASS', verts: required.length },
      manquant: { refuse: true, pass: false, identifiantExecute: false, identifiantVert: false },
    });

    // CONTROLE — le refus doit viser l'identifiant absent, pas noircir la suite
    // entiere : les cinq autres cas ont reellement tourne.
    const autres = required.slice(0, -1);
    expect({
      observes: autres.filter((id) => executes.includes(id)).length,
      attendus: autres.length,
    }).toEqual({ observes: autres.length, attendus: autres.length });

    // ------------------------------------------------------------------
    // CONTROLE — LA LISTE DES IDENTIFIANTS OBLIGATOIRES EST CELLE DU CAHIER.
    //
    // cahier:L167 — « Fin : les six variantes negatives sont detectees, le cas
    // valide passe, et le registre reference REELLEMENT TOUS LES CAS DU
    // CAHIER. » cahier:L541 — « Le registre de dependances fait autorite. »
    //
    // Sans ce controle, tout ce qui precede reste vrai et creux : refuser un
    // rapport auquel manque un identifiant obligatoire ne protege rien si la
    // liste des identifiants obligatoires peut etre amputee a la source. Le
    // verrou de cas (verification/cases.lock.json) ne peut pas servir d'oracle
    // ici — il est lui-meme un fichier du registre. L'oracle est docs/cahier.md,
    // relu et reparse a chaque execution.
    //
    // Le tableau §J (cahier:L567-L612) a ete de-tronque par la carte de
    // specification precisement pour que cet aval puisse le confronter en
    // entier : sur quatre lignes, ni un cycle ni une dependance absente n'est
    // decidable.
    const lignesDuCahier = lireCahier();
    const casDuCahier = casNommesParLeCahier(lignesDuCahier);
    const depsDuCahier = dependancesDuCahier(lignesDuCahier);
    const registre = lireRegistre();
    const cartes = new Map(registre.tasks.map((t) => [t.id, t]));

    const ecartsDeCas: string[] = [];
    for (const [tache, ids] of casDuCahier) {
      const carte = cartes.get(tache);
      const declares = carte === undefined ? [] : [...carte.required_cases].sort();
      if (JSON.stringify(declares) !== JSON.stringify(ids)) {
        ecartsDeCas.push(`${tache} cahier=[${ids.join(',')}] registre=[${declares.join(',')}]`);
      }
    }
    const ecartsDeDependances: string[] = [];
    for (const [tache, deps] of depsDuCahier) {
      const carte = cartes.get(tache);
      const declarees = carte === undefined ? [] : carte.depends_on;
      if (JSON.stringify(declarees) !== JSON.stringify(deps)) {
        ecartsDeDependances.push(
          `${tache} cahier=[${deps.join(',')}] registre=[${declarees.join(',')}]`,
        );
      }
    }
    const casComptesDansLeCahier = [...casDuCahier.values()].reduce((n, ids) => n + ids.length, 0);

    expect({
      tachesNommeesParLeCahier: casDuCahier.size,
      lignesDuTableauJ: depsDuCahier.size,
      cartesDuRegistre: registre.tasks.length,
      // Membre GAUCHE lu dans verification/tasks.json, membre DROIT compte dans
      // docs/cahier.md : l'egalite n'est pas une tautologie.
      casDeclaresParLeRegistre: registre.required_case_count,
      ecartsDeCas,
      ecartsDeDependances,
    }).toEqual({
      tachesNommeesParLeCahier: 44, // cahier:L5 « Il comporte 44 taches, T00 a T43 »
      lignesDuTableauJ: 44, // cahier:L5
      cartesDuRegistre: 44, // cahier:L5
      casDeclaresParLeRegistre: casComptesDansLeCahier,
      ecartsDeCas: [],
      ecartsDeDependances: [],
    });
  }, SUITE_TIMEOUT_MS);

  test('T01.A4 une fixture modifiee apres execution invalide la preuve', () => {
    const required = caseIdsOf(PROBE_FIXTURE_TASK);
    fs.mkdirSync(PROBE_FIXTURE_DIR, { recursive: true });
    // cahier:L103 — F-MONEY : 100 non caches a 2, 40 caches a 1, 20 de sortie a 5.
    // Le total de la sonde est celui de F-MONEY, ferme des DEUX cotes : il est
    // recalcule depuis la grille du cahier (l.103) ET confronte a la valeur que
    // declare la fixture maitresse gelee acceptance/reference/F-MONEY.json. Aucun
    // des deux cotes n'a ete releve sur une execution.
    const total = MONEY_UN_APPEL; // cahier:L103
    const referenceLue = lireFMoney();
    expect({
      recalculeDepuisLaGrille: total,
      declareParLaFixtureDeReference:
        typeof referenceLue === 'string' ? referenceLue : at(referenceLue.objet, CHEMIN_COUT_UN_APPEL),
    }).toEqual({ recalculeDepuisLaGrille: 340, declareParLaFixtureDeReference: 340 }); // cahier:L103
    fs.writeFileSync(PROBE_FIXTURE, `${JSON.stringify({ total_micro_usd: total }, null, 2)}\n`, 'utf8');
    const empreinteInitiale = sha256File(PROBE_FIXTURE);

    const stable = writeProbe(
      `acceptance/${PROBE_FIXTURE_TASK}.t01-stable.probe.spec.ts`,
      sourceFixture(PROBE_FIXTURE_TASK, false),
    );
    const mouvante = writeProbe(
      `acceptance/${PROBE_FIXTURE_TASK}.t01-mouvante.probe.spec.ts`,
      sourceFixture(PROBE_FIXTURE_TASK, true),
    );

    // JUMEAU SAIN — la fixture ne bouge pas pendant l'execution.
    const regStable = probeRegistry(PROBE_FIXTURE_TASK, stable, 'a4-stable.json');
    const sainVerdict = verdict(PROBE_FIXTURE_TASK, regStable);
    const sainGreens = greenCases(PROBE_FIXTURE_TASK, required);
    const repSain = readReport(PROBE_FIXTURE_TASK);
    const empreinte1 = repSain === null
      ? null
      : digestToken(requireField(repSain, FIXTURE_DIGEST_KEYS, 'empreinte des fixtures (cahier L135)'));
    expect(sha256File(PROBE_FIXTURE)).toBe(empreinteInitiale); // rien n'a bouge

    // TEMOIN — l'empreinte du rapport couvre REELLEMENT les fixtures : une
    // fixture differente doit donner une empreinte differente. Sans ce temoin,
    // une empreinte constante (ou absente) satisferait le reste du cas.
    fs.writeFileSync(
      PROBE_FIXTURE,
      `${JSON.stringify({ total_micro_usd: total, temoin: 'A4' }, null, 2)}\n`,
      'utf8',
    );
    const temoinVerdict = verdict(PROBE_FIXTURE_TASK, regStable);
    const repTemoin = readReport(PROBE_FIXTURE_TASK);
    const empreinte2 = repTemoin === null
      ? null
      : digestToken(requireField(repTemoin, FIXTURE_DIGEST_KEYS, 'empreinte des fixtures (cahier L135)'));

    // JUMEAU VICIE — la fixture est modifiee PENDANT l'execution : les
    // assertions restent vraies, la chaine sort en 0, mais l'arbre hache n'est
    // plus celui qui a ete observe.
    fs.writeFileSync(PROBE_FIXTURE, `${JSON.stringify({ total_micro_usd: total }, null, 2)}\n`, 'utf8');
    const vicieVerdict = verdict(
      PROBE_FIXTURE_TASK,
      probeRegistry(PROBE_FIXTURE_TASK, mouvante, 'a4-mouvante.json'),
    );
    const vicieGreens = greenCases(PROBE_FIXTURE_TASK, required);
    const fixtureABouge = sha256File(PROBE_FIXTURE) !== empreinteInitiale;

    expect({
      sain: { exit: sainVerdict.exit, reason: sainVerdict.reason, verts: sainGreens.length },
      temoin: {
        exit: temoinVerdict.exit,
        reason: temoinVerdict.reason,
        // cahier:L135 — le rapport inclut « empreinte des fixtures »
        empreinteSuitLesFixtures: empreinte1 !== null && empreinte2 !== null && empreinte1 !== empreinte2,
      },
      mouvante: {
        // la mutation a bien eu lieu : sans elle le cas n'observerait rien
        fixtureABouge,
        // cahier:L165 — « fixture modifiee apres execution invalide la preuve »
        refuse: vicieVerdict.exit !== 0 && vicieVerdict.exit !== null,
        pass: vicieVerdict.reason !== null && PASS_TOKENS.has(vicieVerdict.reason),
        verts: vicieGreens,
      },
    }).toEqual({
      sain: { exit: 0, reason: 'PASS', verts: required.length },
      temoin: { exit: 0, reason: 'PASS', empreinteSuitLesFixtures: true },
      mouvante: { fixtureABouge: true, refuse: true, pass: false, verts: [] },
    });
  }, SUITE_TIMEOUT_MS);

  test('T01.A5 un rapport d un ancien commit ne valide pas le commit courant', () => {
    const required = caseIdsOf(PROBE_COMMIT);
    const head = git('rev-parse', 'HEAD');
    const ancetre = git('rev-parse', 'HEAD~1');
    expect(head).not.toBe(ancetre);

    const sain = writeProbe(
      `acceptance/${PROBE_COMMIT}.t01-sain.probe.spec.ts`,
      sourceTruthy(PROBE_COMMIT),
    );
    const regSain = probeRegistry(PROBE_COMMIT, sain, 'a5-sain.json');

    // JUMEAU SAIN — la preuve fraiche est LIEE au commit courant.
    const sainVerdict = verdict(PROBE_COMMIT, regSain);
    const sainGreens = greenCases(PROBE_COMMIT, required);
    const repSain = readReport(PROBE_COMMIT);
    const commitInscrit = repSain === null
      ? null
      : String(requireField(repSain, COMMIT_KEYS, 'commit (cahier L135)'));

    // La preuve fraiche, telle quelle, mais datee d'un ANCIEN commit reel.
    const stale: Json = repSain === null ? {} : { ...repSain };
    const commitKey = repSain === null ? 'commit' : (firstPresent(repSain, COMMIT_KEYS)?.key ?? 'commit');
    stale[commitKey] = ancetre;

    // JUMEAU VICIE — seule preuve disponible : ce rapport d'un ancien commit.
    // L'entree d'acceptation est retiree du registre, donc rien ne peut etre
    // reexecute : si le verificateur conclut PASS, il l'a conclu du rapport
    // perime, ce que le cahier interdit (l.163, l.641).
    const regAbsent = probeRegistry(
      PROBE_COMMIT,
      'acceptance/__t01_absent__/probe.spec.ts',
      'a5-perime.json',
    );
    clearReport(PROBE_COMMIT);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(reportPath(PROBE_COMMIT), `${JSON.stringify(stale, null, 2)}\n`, 'utf8');
    const env: NodeJS.ProcessEnv = { ...process.env, BENCH_REGISTRY: regAbsent };
    const perime = run('pnpm', ['verify:task', PROBE_COMMIT], { env });
    const perimeReason = reasonOf(PROBE_COMMIT, perime);
    invocationLog.push(
      `verify:task ${PROBE_COMMIT} registre=a5-perime.json (rapport pre-pose au commit ${ancetre.slice(0, 8)}) ` +
        `exit=${String(perime.code)} reason=${String(perimeReason)}`,
    );
    const perimeGreens = greenCases(PROBE_COMMIT, required);

    expect({
      sain: {
        exit: sainVerdict.exit,
        reason: sainVerdict.reason,
        verts: sainGreens.length,
        // cahier:L135 — le rapport inclut le commit ; l.137 — la preuve est
        // archivee avec son `subject_commit`. Une constante, un champ absent ou
        // une valeur qui ne suit pas HEAD tombe ici.
        commitLieAHead: commitInscrit === head,
        commitPasLAncetre: commitInscrit !== ancetre,
      },
      perime: {
        // cahier:L641 — « aucun ancien rapport ne prouve le commit final »
        refuse: perime.code !== 0 && perime.code !== null,
        pass: perimeReason !== null && PASS_TOKENS.has(perimeReason),
        verts: perimeGreens,
      },
    }).toEqual({
      sain: { exit: 0, reason: 'PASS', verts: required.length, commitLieAHead: true, commitPasLAncetre: true },
      perime: { refuse: true, pass: false, verts: [] },
    });
  }, SUITE_TIMEOUT_MS);

  test('T01.A6 la corruption de F-MONEY (341 au lieu de 340) est detectee par la verification des references', () => {
    const required = caseIdsOf(PROBE_REFERENCE);

    // 1. LA FIXTURE MAITRESSE, LUE A SON CHEMIN CANONIQUE DANS LA RACINE GELEE.
    const lu = lireFMoney();
    expect(typeof lu === 'string' ? lu : 'lue').toBe('lue');
    const money = lu as { file: string; text: string; objet: Json };

    // 2. ELLE PORTE LES VALEURS DU CAHIER. Les deux nombres compares sont
    //    RECALCULES depuis la grille de la l.103 (100 x 2 + 40 x 1 + 20 x 5), pas
    //    releves sur le fichier ni sur une execution. Le troisieme terme lie la
    //    fixture a son GEL : cahier:L139, « la racine des fixtures de reference
    //    est gelee apres T01 ».
    expect(MONEY_UN_APPEL).toBe(340); // cahier:L103
    expect(MONEY_DEUX_APPELS).toBe(680); // cahier:L103
    expect({
      un_appel: at(money.objet, CHEMIN_COUT_UN_APPEL),
      deux_appels: at(money.objet, CHEMIN_COUT_DEUX_APPELS),
      sha256: sha256File(money.file),
    }).toEqual({
      un_appel: MONEY_UN_APPEL,
      deux_appels: MONEY_DEUX_APPELS,
      sha256: empreinteGelee(path.relative(REPO, money.file)),
    });

    referenceBackup = { file: money.file, original: fs.readFileSync(money.file) };

    const sain = writeProbe(
      `acceptance/${PROBE_REFERENCE}.t01-sain.probe.spec.ts`,
      sourceTruthy(PROBE_REFERENCE),
    );
    const registry = probeRegistry(PROBE_REFERENCE, sain, 'a6.json');

    // JUMEAU SAIN — references intactes.
    const sainVerdict = verdict(PROBE_REFERENCE, registry);
    const sainGreens = greenCases(PROBE_REFERENCE, required);

    // 3. LA CORRUPTION EST CHIRURGICALE. cahier:L165 — « la corruption de
    //    F-MONEY, par exemple attendu 341 au lieu de 340 ». La suite le verifie
    //    AVANT d'ecrire : 340 n'apparait qu'une fois dans le fichier, la
    //    substitution ne deplace donc aucune autre valeur ; la taille en octets
    //    ne bouge pas ; le JSON reste bien forme ; le cout des deux appels reste
    //    intact. Le fichier garde son nom et son emplacement : un controle qui ne
    //    verifierait que la presence et le nom des fixtures ne verrait rien.
    const occurrences = money.text.split(String(MONEY_UN_APPEL)).length - 1;
    const corrompu = money.text.replace(String(MONEY_UN_APPEL), String(MONEY_UN_APPEL + 1));
    let objetCorrompu: unknown = null;
    let jsonValide = true;
    try {
      objetCorrompu = JSON.parse(corrompu);
    } catch {
      jsonValide = false;
    }
    expect({
      occurrencesDe340: occurrences,
      memeTaille: Buffer.byteLength(corrompu) === Buffer.byteLength(money.text),
      jsonValide,
      coutUnAppel: at(objetCorrompu, CHEMIN_COUT_UN_APPEL),
      coutDeuxAppels: at(objetCorrompu, CHEMIN_COUT_DEUX_APPELS),
    }).toEqual({
      occurrencesDe340: 1,
      memeTaille: true,
      jsonValide: true,
      coutUnAppel: MONEY_UN_APPEL + 1, // cahier:L165 (341)
      coutDeuxAppels: MONEY_DEUX_APPELS, // cahier:L103 (680) — inchange
    });
    fs.writeFileSync(money.file, corrompu, 'utf8');

    // JUMEAU VICIE — meme registre, meme suite, meme tache-sonde : seule la
    // VALEUR attendue de la fixture maitresse a change.
    let vicieVerdict: Verdict;
    let vicieGreens: string[];
    try {
      vicieVerdict = verdict(PROBE_REFERENCE, registry);
      vicieGreens = greenCases(PROBE_REFERENCE, required);
    } finally {
      restoreReference();
    }

    // 4. LA RACINE GELEE EST RENDUE TELLE QUE HEAD LA PORTE. Octet pour octet,
    //    et confirme par git : la suite ne laisse jamais derriere elle une
    //    racine de reference modifiee, ce qui invaliderait toute attestation
    //    ulterieure (cahier:L137, tout diff de source non committe l'interdit).
    expect(fs.readFileSync(money.file, 'utf8')).toBe(money.text);
    expect(
      run('git', ['status', '--porcelain', '--', path.relative(REPO, REFERENCE_DIR)]).stdout.trim(),
    ).toBe('');

    expect({
      sain: { exit: sainVerdict.exit, reason: sainVerdict.reason, verts: sainGreens.length },
      corrompu: {
        // cahier:L165 — « la corruption de F-MONEY [...] est detectee par la
        // verification des references » ; l.139 — toute modification de la
        // racine gelee « invalide les preuves precedentes ».
        detectee: vicieVerdict.exit !== 0 && vicieVerdict.exit !== null,
        pass: vicieVerdict.reason !== null && PASS_TOKENS.has(vicieVerdict.reason),
        verts: vicieGreens,
      },
    }).toEqual({
      sain: { exit: 0, reason: 'PASS', verts: required.length },
      corrompu: { detectee: true, pass: false, verts: [] },
    });
  }, SUITE_TIMEOUT_MS);
});
