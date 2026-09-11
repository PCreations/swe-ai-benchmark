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
 * Les seuls nombres compares ici viennent de la fixture maitresse F-MONEY du
 * cahier (l.103) et portent le commentaire `// cahier:L103`. Le contrat de
 * sortie (0 / PASS) vient de l.133 et d'ADR-005 point 1. Aucun litteral n'a
 * ete releve sur une execution.
 *
 * -------------------------------------------------------------------------
 * AVEUGLEMENT (ADR-001). Cette suite a ete ecrite depuis docs/specs/T01.md,
 * docs/cahier.md, verification/cases.lock.json et la surface publique deja
 * livree par T00 (`bench help`). Elle ne nomme aucun chemin de module de
 * verification/runner/**, et n'importe rien de l'implementation : tout passe
 * par la commande publique `pnpm verify:task <Txx>` et par le rapport
 * verification/results/<Txx>.json que le cahier (l.135) prescrit.
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

/**
 * Localise la fixture maitresse F-MONEY dans acceptance/reference/**.
 * Le cahier (l.161) exige sa presence ; il n'en fixe ni le nom de fichier ni la
 * serialisation. La recherche porte donc sur le contenu, et echoue bruyamment.
 */
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

function findMoneyReference(): { file: string; text: string } | string {
  const files = walk(REFERENCE_DIR);
  if (files.length === 0) {
    return `ABSENT acceptance/reference/** est vide ou inexistant (livrable T01, cahier L161)`;
  }
  const candidates: string[] = [];
  for (const f of files) {
    let text: string;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (/F[-_ ]?MONEY/i.test(text) || /f[-_]?money/i.test(path.basename(f))) {
      candidates.push(f);
      if (/(^|[^0-9])340([^0-9]|$)/.test(text)) return { file: f, text };
    }
  }
  return (
    `INTROUVABLE F-MONEY portant 340 — candidats=[${candidates
      .map((c) => path.relative(REPO, c))
      .join(', ')}] fichiers=[${files.map((c) => path.relative(REPO, c)).join(', ')}]`
  );
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
  }, SUITE_TIMEOUT_MS);

  test('T01.A4 une fixture modifiee apres execution invalide la preuve', () => {
    const required = caseIdsOf(PROBE_FIXTURE_TASK);
    fs.mkdirSync(PROBE_FIXTURE_DIR, { recursive: true });
    // cahier:L103 — F-MONEY : 100 non caches a 2, 40 caches a 1, 20 de sortie a 5.
    const total = 100 * 2 + 40 * 1 + 20 * 5; // cahier:L103
    expect(total).toBe(340); // cahier:L103
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

    // 1. La fixture maitresse F-MONEY existe et porte les valeurs du cahier.
    const found = findMoneyReference();
    expect(typeof found === 'string' ? found : 'trouvee').toBe('trouvee');
    const money = found as { file: string; text: string };

    // cahier:L103 — 100 non caches a 2 + 40 caches a 1 + 20 de sortie a 5 = 340,
    // et deux appels identiques valent 680.
    const attendu = 100 * 2 + 40 * 1 + 20 * 5; // cahier:L103
    expect(attendu).toBe(340); // cahier:L103
    expect(new RegExp(`(^|[^0-9])${String(attendu)}([^0-9]|$)`).test(money.text)).toBe(true);
    expect(new RegExp(`(^|[^0-9])${String(attendu * 2)}([^0-9]|$)`).test(money.text)).toBe(true); // cahier:L103 (680)

    referenceBackup = { file: money.file, original: fs.readFileSync(money.file) };

    const sain = writeProbe(
      `acceptance/${PROBE_REFERENCE}.t01-sain.probe.spec.ts`,
      sourceTruthy(PROBE_REFERENCE),
    );
    const registry = probeRegistry(PROBE_REFERENCE, sain, 'a6.json');

    // JUMEAU SAIN — references intactes.
    const sainVerdict = verdict(PROBE_REFERENCE, registry);
    const sainGreens = greenCases(PROBE_REFERENCE, required);

    // JUMEAU VICIE — F-MONEY corrompue : 341 au lieu de 340. Le fichier reste
    // du JSON bien forme, porte le meme nom, au meme endroit : seule la VALEUR
    // attendue a change. Un controle qui ne verifierait que la presence et le
    // nom des fixtures ne verrait rien.
    const corrompu = money.text.replace(
      new RegExp(`(^|[^0-9])${String(attendu)}([^0-9]|$)`),
      (_m, a: string, b: string) => `${a}${String(attendu + 1)}${b}`, // cahier:L165 (341)
    );
    expect(corrompu).not.toBe(money.text);
    fs.writeFileSync(money.file, corrompu, 'utf8');

    let vicieVerdict: Verdict;
    let vicieGreens: string[];
    try {
      vicieVerdict = verdict(PROBE_REFERENCE, registry);
      vicieGreens = greenCases(PROBE_REFERENCE, required);
    } finally {
      restoreReference();
    }
    expect(fs.readFileSync(money.file, 'utf8')).toBe(money.text); // la reference gelee est rendue intacte

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
