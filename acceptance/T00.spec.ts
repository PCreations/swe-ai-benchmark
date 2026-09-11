/**
 * acceptance/T00.spec.ts — suite d'acceptation de la tache T00.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T00.A1 behaviour — installe depuis les lockfiles et compile packages/contracts
 *   T00.A2 behaviour — un test vrai donne 0
 *   T00.A3 refusal   — sa variante volontairement fausse donne 1
 *   T00.A4 refusal   — T99 est refuse
 *   T00.A5 refusal   — T01 non implementee dans un registre synthetique isole
 *                      n'est jamais declaree reussie
 *   T00.A6 artifact  — les lockfiles restent inchanges apres installation figee
 *
 * Contrat teste (cahier L133 + ADR-005 point 1) :
 *   succes                 -> code 0, reason PASS
 *   assertion echouee      -> code 1, reason ASSERTION_FAILED
 *   tache non implementee  -> code 2, reason NOT_IMPLEMENTED
 *   tache inconnue         -> code 2, reason UNKNOWN_TASK
 *   registre invalide      -> code 2, reason REGISTRY_INVALID
 *
 * DEUX REGLES STRUCTURANTES.
 *
 * 1. Le code de sortie ne suffit pas. Invariant 12 (cahier L74) : « ni test
 *    saute, ni rapport absent, ni simple code de sortie d'un sous-processus ne
 *    suffisent ». Chaque cas qui invoque le runner efface d'abord le rapport
 *    cible, puis exige que CE run le reecrive, et verifie son contenu :
 *    `reason`, cas attendus, cas executes, statuts individuels.
 *
 * 2. Les cas `refusal` (A3, A4, A5) doivent mourir si l'implementation devient
 *    PERMISSIVE. Un stub qui leve les rendrait verts sans rien prouver : c'est
 *    le defaut decisif signale par verification/cases.lock.json. Ils sont donc
 *    ecrits « en tenaille » — le refus attendu est assorti d'un CONTROLE qui
 *    echoue si le runner refuse tout indistinctement.
 */

// La chaine tourne en ESM reel (jest.config.mjs : useESM + extensionsToTreatAsEsm,
// lance par `node --experimental-vm-modules`). En ESM, `describe`, `test`,
// `expect`, `beforeAll` et `afterAll` restent injectes comme globaux, mais
// l'objet `jest` ne l'est PAS : il faudrait l'importer de '@jest/globals', que
// pnpm ne hisse pas a la racine et que package.json — hors de la zone
// ACCEPTANCE — ne declare pas. Cette suite n'utilise donc jamais `jest.*` :
// les delais sont passes en troisieme argument de chaque hook et de chaque cas,
// ce qui est de toute facon plus explicite que jest.setTimeout.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const FIXTURE_T01_DONE = path.join(REGISTRY_DIR, 'synthetic-44-t01-declared-done.json');
const CASES_LOCK = path.join(REPO, 'verification', 'cases.lock.json');
const PNPM_LOCK = path.join(REPO, 'pnpm-lock.yaml');
const UV_LOCK = path.join(REPO, 'analysis', 'uv.lock');

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
    timeout: opts.timeoutMs ?? 15 * 60 * 1000,
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

function tail(text: string, lines = 25): string {
  const parts = text.trimEnd().split('\n');
  return parts.slice(Math.max(0, parts.length - lines)).join('\n');
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

/*
 * Le cahier (L135) enumere le CONTENU du rapport — « assertions
 * attendues/executees, statuts individuels » — sans figer les noms de champs.
 * On assert donc la substance, pas une orthographe inventee : la recherche
 * porte sur un ensemble borne et documente de noms plausibles, et echoue
 * bruyamment en listant les cles reellement presentes.
 */
const EXPECTED_KEYS = [
  'expected_cases', 'required_cases', 'cases_expected',
  'expected_assertions', 'assertions_expected', 'expected',
];
const EXECUTED_KEYS = [
  'executed_cases', 'cases_executed', 'ran_cases', 'observed_cases',
  'executed_assertions', 'assertions_executed', 'executed',
];
const STATUS_KEYS = [
  'case_results', 'case_statuses', 'individual_statuses',
  'cases', 'statuses', 'results',
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

function statusMap(rep: Json): Map<string, string> {
  for (const k of STATUS_KEYS) {
    const v = rep[k];
    const m = new Map<string, string>();
    if (Array.isArray(v)) {
      for (const e of v) {
        if (e === null || typeof e !== 'object') continue;
        const o = e as Json;
        const id = o.id ?? o.case ?? o.case_id ?? o.name;
        const st = o.status ?? o.result ?? o.outcome ?? o.verdict;
        if (typeof id === 'string' && typeof st === 'string') m.set(id, st.toUpperCase());
      }
    } else if (v !== null && typeof v === 'object') {
      for (const [id, st] of Object.entries(v as Json)) {
        if (typeof st === 'string') m.set(id, st.toUpperCase());
        else if (st !== null && typeof st === 'object') {
          const inner = (st as Json).status ?? (st as Json).result ?? (st as Json).outcome;
          if (typeof inner === 'string') m.set(id, inner.toUpperCase());
        }
      }
    }
    if (m.size > 0) return m;
  }
  return new Map<string, string>();
}

/** Assertion reelle : la cle attendue existe, sinon le diff montre le rapport. */
function requireField(rep: Json, keys: string[], what: string): unknown {
  const found = firstPresent(rep, keys);
  const verdict = found
    ? 'present'
    : `ABSENT(${what}) cles-du-rapport=[${Object.keys(rep).join(', ')}]`;
  expect(verdict).toBe('present');
  return found ? found.value : undefined;
}

/* --------------------------------------------------- registres synthetiques */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-t00-'));
const TOUCHED_TASKS = ['T01', 'T13', 'T22', 'T30', 'T43', 'T99'];

type Envelope = 'object' | 'array';
let ENVELOPE: Envelope = 'object';

function loadFixture(file: string): Json {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
}

function materialize(reg: Json, name: string, envelope: Envelope = ENVELOPE): string {
  const p = path.join(TMP, name);
  const payload: unknown = envelope === 'array' ? reg.tasks : reg;
  fs.writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return p;
}

const invocationLog: string[] = [];

function runVerify(taskId: string, registry: string | null): RunResult {
  if (taskId === 'T00') {
    throw new Error('T00.spec.ts ne doit jamais reinvoquer verify:task T00 (recursion).');
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (registry) env.BENCH_REGISTRY = registry;
  else delete env.BENCH_REGISTRY;
  clearReport(taskId); // invariant 12 : le rapport lu doit venir de CE run
  const proc = run('pnpm', ['verify:task', taskId], { env });
  invocationLog.push(
    `verify:task ${taskId} registry=${registry ? path.basename(registry) : '<reel>'} ` +
      `exit=${String(proc.code)} reason=${String(reasonOf(taskId, proc))}`,
  );
  return proc;
}

/**
 * Le cahier ne fixe pas la serialisation d'un registre : ni l'enveloppe
 * (objet portant `tasks`, ou tableau nu), ni l'emplacement. Ce detail n'est pas
 * la propriete testee. Il est donc resolu une fois, a l'execution, en exigeant
 * simplement que le registre ne soit pas rejete comme invalide.
 */
function resolveEnvelope(base: Json): Envelope {
  for (const candidate of ['object', 'array'] as Envelope[]) {
    const p = materialize(base, `envelope-${candidate}.json`, candidate);
    const proc = runVerify('T01', p);
    if (reasonOf('T01', proc) !== 'REGISTRY_INVALID') return candidate;
  }
  return 'object';
}

/* ------------------------------------------------------------- sondes A2/A3 */

interface Probe {
  task: string;
  chain: 'jest' | 'pytest';
  entry: string;
  truthy: boolean;
  cases: string[];
}

function caseIdsOf(task: string): string[] {
  const lock = JSON.parse(fs.readFileSync(CASES_LOCK, 'utf8')) as {
    cases: Array<{ id: string; task: string }>;
  };
  return lock.cases.filter((c) => c.task === task).map((c) => c.id);
}

/*
 * Taches-sonde choisies parmi celles dont verification/cases.lock.json
 * n'exige que la capacite `node22` : un verdict BLOCKED pour capacite absente
 * confondrait A2/A3 avec un tout autre etat.
 */
const PROBES: Probe[] = [
  { task: 'T30', chain: 'jest', entry: 'acceptance/T30.probe.spec.ts', truthy: true, cases: [] },
  { task: 'T43', chain: 'jest', entry: 'acceptance/T43.probe.spec.ts', truthy: false, cases: [] },
  { task: 'T22', chain: 'pytest', entry: 'analysis/tests/test_T22_probe.py', truthy: true, cases: [] },
  { task: 'T13', chain: 'pytest', entry: 'analysis/tests/test_T13_probe.py', truthy: false, cases: [] },
];

function jestProbeSource(p: Probe): string {
  const lines: string[] = [
    '// FICHIER GENERE par acceptance/T00.spec.ts (sondes des cas T00.A2 / T00.A3).',
    '// Supprime automatiquement en fin de suite. Ne jamais committer.',
    '',
  ];
  p.cases.forEach((id, i) => {
    const wrong = !p.truthy && i === 0;
    const label = wrong ? 'assertion volontairement fausse' : 'assertion vraie';
    lines.push(`test('${id} ${label}', () => {`);
    lines.push(`  expect(2 + 2).toBe(${wrong ? 5 : 4});`);
    lines.push('});');
    lines.push('');
  });
  return lines.join('\n');
}

function pytestProbeSource(p: Probe): string {
  const lines: string[] = [
    '# FICHIER GENERE par acceptance/T00.spec.ts (sondes des cas T00.A2 / T00.A3).',
    '# Supprime automatiquement en fin de suite. Ne jamais committer.',
    'import pytest',
    '',
  ];
  p.cases.forEach((id, i) => {
    const wrong = !p.truthy && i === 0;
    const fn = `test_${id.replace('.', '_')}`;
    lines.push(`@pytest.mark.parametrize("case_id", ["${id}"])`);
    lines.push(`def ${fn}(case_id):`);
    lines.push(`    assert case_id == "${id}"`);
    lines.push(`    assert 2 + 2 == ${wrong ? 5 : 4}`);
    lines.push('');
  });
  return lines.join('\n');
}

function writeProbeFiles(p: Probe): void {
  const abs = path.join(REPO, p.entry);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, p.chain === 'jest' ? jestProbeSource(p) : pytestProbeSource(p), 'utf8');
}

function removeProbeFiles(): void {
  for (const p of PROBES) {
    const abs = path.join(REPO, p.entry);
    if (fs.existsSync(abs)) fs.rmSync(abs);
  }
}

function probeRegistry(p: Probe): string {
  const base = loadFixture(FIXTURE_NOT_IMPLEMENTED);
  const tasks = (base.tasks as Json[]).map((t) => ({ ...t }));
  const card = tasks.find((t) => t.id === p.task);
  if (!card) throw new Error(`fixture de registre sans carte ${p.task}`);
  card.acceptance_entry = p.entry;
  card.depends_on = [];
  card.required_cases = p.cases;
  const patched: Json = { ...base, tasks };
  return materialize(patched, `registry-probe-${p.task}.json`);
}

/* ------------------------------------------------ installation figee (A1/A6) */

/**
 * CONTROLE DE CAPACITE, partage par les cas `refusal` A4 et A5.
 *
 * « T99 est refuse » et « T01 non implementee n'est pas declaree reussie » ne
 * prouvent rien tant que le runner ne sait REFUSER QUE PARCE QU'IL NE SAIT RIEN
 * ACCEPTER : un programme qui repond invariablement code 2 satisfait les deux
 * enonces sans rien verifier. C'est la forme, a l'echelle de la commande, du
 * defaut que verification/cases.lock.json signale pour ce mode de preuve —
 * « un stub qui leve rend ce cas VERT sans rien prouver ».
 *
 * Le controle exige donc, par le MEME mecanisme de registre synthetique isole,
 * qu'une tache reellement implementee et vraie obtienne code 0 / reason PASS.
 * Un refus n'est un refus que s'il existe un non-refus.
 */
interface Verdict {
  code: number | null;
  reason: string | null;
}

let capabilityVerdict: Verdict | null = null;

function capabilityOfNonRefusal(): Verdict {
  if (capabilityVerdict === null) {
    const probe = PROBES.find((p) => p.chain === 'jest' && p.truthy);
    if (probe === undefined) throw new Error('sonde de capacite introuvable');
    const proc = runVerify(probe.task, probeRegistry(probe));
    capabilityVerdict = { code: proc.code, reason: reasonOf(probe.task, proc) };
  }
  return capabilityVerdict;
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

interface FrozenInstall {
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  pnpm: RunResult;
  uv: RunResult;
}

let frozen!: FrozenInstall;

function hashLockfiles(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of [PNPM_LOCK, UV_LOCK]) {
    out[path.relative(REPO, f)] = fs.existsSync(f) ? sha256(f) : null;
  }
  return out;
}

/* -------------------------------------------------------------- sauvegarde */

const savedReports = new Map<string, string>();

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
    if (saved !== undefined) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, saved, 'utf8');
    } else if (fs.existsSync(p)) {
      fs.rmSync(p);
    }
  }
}

/* --------------------------------------------------------------- cycle de vie */

beforeAll(() => {
  removeProbeFiles(); // residus d'un run interrompu
  saveReports();

  for (const p of PROBES) {
    p.cases = caseIdsOf(p.task);
    writeProbeFiles(p);
  }

  // L'installation figee d'abord : les invocations imbriquees du runner en
  // dependent, et A1/A6 lisent les empreintes calculees ici.
  const before = hashLockfiles();
  const pnpmInstall = run('pnpm', ['install', '--frozen-lockfile'], {
    cwd: REPO,
    timeoutMs: 20 * 60 * 1000,
  });
  const uvSync = run('uv', ['sync', '--frozen'], {
    cwd: path.join(REPO, 'analysis'),
    timeoutMs: 20 * 60 * 1000,
  });
  const after = hashLockfiles();
  frozen = { before, after, pnpm: pnpmInstall, uv: uvSync };

  ENVELOPE = resolveEnvelope(loadFixture(FIXTURE_NOT_IMPLEMENTED));
}, SUITE_TIMEOUT_MS);

afterAll(() => {
  removeProbeFiles();
  restoreReports();
  fs.rmSync(TMP, { recursive: true, force: true });
  if (invocationLog.length > 0) {
    // trace des sous-invocations : « sorties effectivement observees » (L139)
    console.log(`[T00] invocations du runner :\n  ${invocationLog.join('\n  ')}`);
  }
}, 5 * 60 * 1000);

/* ==================================================================== cas */

describe('T00 — depot initialise et verificateur minimal', () => {
  test('T00.A1 installe depuis les lockfiles et compile le module de contrat packages/contracts', async () => {
    // (a) l'installation figee des deux chaines doit reussir
    expect({
      pnpm: frozen.pnpm.code,
      uv: frozen.uv.code,
      pnpmErr: frozen.pnpm.code === 0 ? '' : tail(frozen.pnpm.stderr, 15),
      uvErr: frozen.uv.code === 0 ? '' : tail(frozen.uv.stderr, 15),
    }).toEqual({ pnpm: 0, uv: 0, pnpmErr: '', uvErr: '' });

    // (b) le module de contrat existe et compile sans diagnostic TypeScript
    const contractsDir = path.join(REPO, 'packages', 'contracts');
    expect(fs.existsSync(path.join(contractsDir, 'package.json'))).toBe(true);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(contractsDir, 'package.json'), 'utf8'),
    ) as { name?: string; main?: string; module?: string; types?: string; exports?: unknown; scripts?: Record<string, string> };

    const compile =
      pkg.scripts && typeof pkg.scripts.build === 'string' && typeof pkg.name === 'string'
        ? run('pnpm', ['--filter', pkg.name, 'run', 'build'])
        : run('pnpm', ['exec', 'tsc', '-p', 'packages/contracts']);

    const diagnostics = `${compile.stdout}\n${compile.stderr}`.match(/error TS\d+/g) ?? [];
    expect({ exit: compile.code, diagnostics, out: compile.code === 0 ? '' : tail(compile.stdout, 20) })
      .toEqual({ exit: 0, diagnostics: [], out: '' });

    // (c) LE MODULE CHARGE DOIT ETRE LA SOURCE, JAMAIS UN dist/ PERIME.
    //
    // jest.config.mjs documente le chemin le plus court vers un faux PASS dans
    // un monorepo TypeScript : un `dist/` perime, gitignore, invisible a
    // `git status --porcelain`. Charger packages/contracts/dist/index.js
    // laisserait un artefact obsolete temoigner a la place du code. On charge
    // donc par ordre de preference la SOURCE — via le specificateur du paquet,
    // que jest mappe vers packages/<nom>/src —, et le chemin construit n'est
    // qu'un dernier recours, trace explicitement.
    const sourceEntry = ['src/index.ts', 'index.ts']
      .map((c) => path.join(contractsDir, c))
      .find((f) => fs.existsSync(f) && fs.statSync(f).isFile());

    const builtCandidates: string[] = [];
    const push = (v: unknown): void => {
      if (typeof v === 'string') builtCandidates.push(v);
    };
    push(pkg.main);
    push(pkg.module);
    if (pkg.exports !== null && typeof pkg.exports === 'object') {
      const exp = pkg.exports as Json;
      const dot: unknown = exp['.'] ?? exp;
      if (typeof dot === 'string') push(dot);
      else if (dot !== null && typeof dot === 'object') {
        const d = dot as Json;
        push(d.require);
        push(d.import);
        push(d.default);
      }
    }
    if (typeof pkg.types === 'string') builtCandidates.push(pkg.types.replace(/\.d\.ts$/, '.js'));
    builtCandidates.push('dist/index.js', 'build/index.js', 'lib/index.js', 'index.js');
    const builtEntry = builtCandidates
      .map((c) => path.join(contractsDir, c))
      .find((f) => fs.existsSync(f) && fs.statSync(f).isFile());

    const entry = sourceEntry ?? builtEntry;
    expect(
      entry === undefined
        ? `ENTREE-INTROUVABLE src=[src/index.ts, index.ts] build=[${builtCandidates.join(', ')}]`
        : 'trouve',
    ).toBe('trouve');

    const attempts: string[] = [];
    const specifiers: string[] = [];
    // Le specificateur d'abord : jest.config.mjs le mappe vers les sources.
    if (typeof pkg.name === 'string' && pkg.name.length > 0) specifiers.push(pkg.name);
    if (sourceEntry !== undefined) specifiers.push(pathToFileURL(sourceEntry).href);
    if (builtEntry !== undefined) specifiers.push(pathToFileURL(builtEntry).href);

    let mod: Record<string, unknown> | null = null;
    let loadedVia = '';
    for (const spec of specifiers) {
      try {
        mod = (await import(spec)) as Record<string, unknown>;
        loadedVia = spec;
        break;
      } catch (e) {
        attempts.push(`import(${spec}) -> ${(e as Error).message.split('\n')[0]}`);
      }
    }
    if (mod === null && builtEntry !== undefined) {
      try {
        mod = createRequire(path.join(REPO, 'package.json'))(builtEntry) as Record<string, unknown>;
        loadedVia = `require:${builtEntry}`;
      } catch (e) {
        attempts.push(`require(${builtEntry}) -> ${(e as Error).message.split('\n')[0]}`);
      }
    }
    expect(mod === null ? `CHARGEMENT-IMPOSSIBLE ${attempts.join(' | ')}` : 'charge').toBe('charge');

    // Le module charge doit etre la source : un dist/ ne prouve rien sur l'arbre
    // source courant, qui est le seul objet que le commit certifie (L137).
    expect(
      /\/dist\/|\/build\/|\/lib\//.test(loadedVia)
        ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${loadedVia}`
        : 'charge-depuis-la-source',
    ).toBe('charge-depuis-la-source');

    const loaded = mod as Record<string, unknown>;
    const exported = Object.keys(loaded).filter((k) => k !== '__esModule');
    expect(
      exported.length > 0 ? 'exporte' : `AUCUN-EXPORT depuis ${loadedVia}`,
    ).toBe('exporte');

    // Trace de ce qui a ete effectivement observe (cahier L139). On journalise
    // le NOMBRE d'exports et le specificateur, jamais les noms : l'auteur des
    // tests n'a pas le droit de lire packages/contracts.
    console.log(
      `[T00.A1] compile=\`${compile.command}\` exit=${String(compile.code)} | ` +
        `charge-via=${loadedVia.replace(pathToFileURL(REPO).href, '')} | exports=${exported.length}`,
    );
  }, SUITE_TIMEOUT_MS);

  test('T00.A2 un test vrai donne 0, sur les deux chaines, avec un rapport qui le prouve', () => {
    const passing = PROBES.filter((p) => p.truthy);
    expect(passing.map((p) => p.chain).sort()).toEqual(['jest', 'pytest']); // ADR-005 point 5

    // Les DEUX chaines sont OBSERVEES avant toute assertion de verdict. Une
    // assertion posee dans la boucle interromprait le cas des la premiere
    // chaine rouge, et le rapport d'echec ne dirait rien de la seconde : la
    // porte RED enregistrerait une preuve a moitie lue.
    const observed = passing.map((probe) => {
      const proc = runVerify(probe.task, probeRegistry(probe));
      const rep = readReport(probe.task);
      if (rep === null) {
        return {
          chaine: probe.chain,
          sortie: proc.code,
          rapport: `ABSENT ${path.relative(REPO, reportPath(probe.task))}`,
          reason: reasonOf(probe.task, proc) ?? 'INTROUVABLE',
          casAttendus: 'non-evaluable',
          casExecutes: 'non-evaluable',
          statuts: 'non-evaluable',
          sautes: 'non-evaluable',
        };
      }
      const cles = `cles=[${Object.keys(rep).join(', ')}]`;
      const attendus = firstPresent(rep, EXPECTED_KEYS);
      const executes = firstPresent(rep, EXECUTED_KEYS);
      const attendusIds = idsFrom(attendus?.value);
      const executesIds = idsFrom(executes?.value);
      const statuses = statusMap(rep);
      const manquantsA = probe.cases.filter((id) => !attendusIds.includes(id));
      const manquantsE = probe.cases.filter((id) => !executesIds.includes(id));
      const nonVerts = probe.cases.filter((id) => !PASS_TOKENS.has(statuses.get(id) ?? 'ABSENT'));
      const sautes = probe.cases.filter((id) => SKIP_TOKENS.has(statuses.get(id) ?? ''));
      return {
        chaine: probe.chain,
        sortie: proc.code,
        rapport: 'present',
        reason: typeof rep.reason === 'string' ? rep.reason.toUpperCase() : `CHAMP-reason-ABSENT ${cles}`,
        casAttendus:
          attendus === null
            ? `CHAMP-ABSENT ${cles}`
            : manquantsA.length === 0
              ? 'complets'
              : `MANQUANTS ${manquantsA.join(',')}`,
        casExecutes:
          executes === null
            ? `CHAMP-ABSENT ${cles}`
            : manquantsE.length === 0
              ? 'complets'
              : `MANQUANTS ${manquantsE.join(',')}`,
        statuts:
          statuses.size === 0
            ? `AUCUN-STATUT-INDIVIDUEL ${cles}`
            : nonVerts.length === 0
              ? 'tous-verts'
              : `NON-VERTS ${JSON.stringify(Object.fromEntries(statuses))}`,
        sautes: sautes.length === 0 ? 'aucun' : `SAUTES ${sautes.join(',')}`,
      };
    });

    // Code de sortie ET contenu du rapport, pour chaque chaine (invariant 12).
    expect(observed).toEqual(
      passing.map((probe) => ({
        chaine: probe.chain,
        sortie: 0,
        rapport: 'present',
        reason: 'PASS',
        casAttendus: 'complets',
        casExecutes: 'complets',
        statuts: 'tous-verts',
        sautes: 'aucun',
      })),
    );
  }, SUITE_TIMEOUT_MS);

  test('T00.A3 la variante volontairement fausse donne 1 — le runner ne doit pas devenir permissif', () => {
    const failing = PROBES.filter((p) => !p.truthy);
    expect(failing.map((p) => p.chain).sort()).toEqual(['jest', 'pytest']); // ADR-005 point 5
    expect(failing.filter((p) => p.cases.length === 0)).toEqual([]);

    // Comme en A2 : les deux chaines sont observees avant toute assertion.
    const observed = failing.map((probe) => {
      const broken = probe.cases[0] as string;
      const proc = runVerify(probe.task, probeRegistry(probe));
      const rep = readReport(probe.task);
      if (rep === null) {
        return {
          chaine: probe.chain,
          sortie: proc.code,
          rapport: `ABSENT ${path.relative(REPO, reportPath(probe.task))}`,
          reason: reasonOf(probe.task, proc) ?? 'INTROUVABLE',
          casFauxExecute: 'non-evaluable',
          verdictCasFaux: 'non-evaluable',
          autresCas: 'non-evaluable',
        };
      }
      const cles = `cles=[${Object.keys(rep).join(', ')}]`;
      const executes = firstPresent(rep, EXECUTED_KEYS);
      const executesIds = idsFrom(executes?.value);
      const statuses = statusMap(rep);
      const verdict = statuses.get(broken) ?? 'ABSENT';
      const noircis = probe.cases.slice(1).filter((id) => FAIL_TOKENS.has(statuses.get(id) ?? 'PASS'));
      return {
        chaine: probe.chain,
        sortie: proc.code,
        rapport: 'present',
        reason: typeof rep.reason === 'string' ? rep.reason.toUpperCase() : `CHAMP-reason-ABSENT ${cles}`,
        // Le cas faux a TOURNE : ni saute, ni absent du rapport.
        casFauxExecute: executesIds.includes(broken) ? 'oui' : `NON executes=[${executesIds.join(',')}]`,
        // Le coeur du refus : jamais un statut vert sur le cas faux.
        verdictCasFaux: PASS_TOKENS.has(verdict)
          ? `PERMISSIF(${verdict})`
          : SKIP_TOKENS.has(verdict)
            ? `SAUTE(${verdict})`
            : FAIL_TOKENS.has(verdict)
              ? 'echec-declare'
              : `INATTENDU(${verdict})`,
        // Les autres cas de la sonde sont vrais : un runner qui noircit tout
        // rendrait A3 vert sans rien prouver.
        autresCas: noircis.length === 0 ? 'intacts' : `NOIRCIS ${noircis.join(',')}`,
      };
    });

    expect(observed).toEqual(
      failing.map((probe) => ({
        chaine: probe.chain,
        sortie: 1,
        rapport: 'present',
        reason: 'ASSERTION_FAILED',
        casFauxExecute: 'oui',
        verdictCasFaux: 'echec-declare',
        autresCas: 'intacts',
      })),
    );
  }, SUITE_TIMEOUT_MS);

  test('T00.A4 T99 est refuse par le registre synthetique isole', () => {
    const registry = materialize(loadFixture(FIXTURE_NOT_IMPLEMENTED), 'registry-a4.json');

    const proc = runVerify('T99', registry);
    const reason = reasonOf('T99', proc);

    // REFUS : une implementation qui accepte un id inconnu meurt sur les deux
    // assertions suivantes (elle sortirait 0 / PASS).
    expect({ exit: proc.code, reason }).toEqual({ exit: 2, reason: 'UNKNOWN_TASK' });
    expect(proc.code).not.toBe(0);

    const rep = readReport('T99');
    if (rep !== null) {
      expect(String(rep.reason).toUpperCase()).toBe('UNKNOWN_TASK');
      const executed = idsFrom(firstPresent(rep, EXECUTED_KEYS)?.value);
      expect(executed).toEqual([]); // rien n'a tourne : aucune preuve ne peut etre fabriquee
      const statuses = statusMap(rep);
      const green = [...statuses.values()].filter((v) => PASS_TOKENS.has(v));
      expect(green).toEqual([]);
    }

    // CONTROLE — un runner qui refuserait TOUT rendrait ce cas vert sans rien
    // prouver. Le meme registre, interroge sur une tache qu'il contient, ne doit
    // pas repondre UNKNOWN_TASK.
    const control = runVerify('T01', registry);
    const controlReason = reasonOf('T01', control);
    expect({ tache: 'T01', reason: controlReason }).not.toEqual({ tache: 'T01', reason: 'UNKNOWN_TASK' });
    expect(controlReason).not.toBeNull();

    // CONTROLE DE CAPACITE — un runner incapable de conclure PASS refuserait T99
    // par pure impuissance, et ce cas serait vide de sens.
    const capable = capabilityOfNonRefusal();
    expect({ controle: 'capacite-de-non-refus', exit: capable.code, reason: capable.reason })
      .toEqual({ controle: 'capacite-de-non-refus', exit: 0, reason: 'PASS' });
  }, SUITE_TIMEOUT_MS);

  test('T00.A5 T01 non implementee dans un registre synthetique isole n est jamais declaree reussie', () => {
    const registry = materialize(loadFixture(FIXTURE_NOT_IMPLEMENTED), 'registry-a5.json');

    const proc = runVerify('T01', registry);
    const reason = reasonOf('T01', proc);

    // REFUS : une implementation permissive (PASS a vide, faute de resultat
    // observe) meurt sur ces deux assertions.
    expect({ exit: proc.code, reason }).toEqual({ exit: 2, reason: 'NOT_IMPLEMENTED' });
    expect(proc.code).not.toBe(0);

    const rep = readReport('T01');
    if (rep !== null) {
      expect(String(rep.reason).toUpperCase()).not.toBe('PASS');
      const statuses = statusMap(rep);
      const green = [...statuses.entries()].filter(([, v]) => PASS_TOKENS.has(v));
      expect(green).toEqual([]); // aucune preuve sans resultat de test observe
    }

    // REFUS, second volet — « editer ce champ en DONE ne valide rien » (L631).
    // Meme registre, T01 declaree DONE, toujours rien d'implemente.
    const declaredDone = materialize(loadFixture(FIXTURE_T01_DONE), 'registry-a5-done.json');
    const procDone = runVerify('T01', declaredDone);
    const reasonDone = reasonOf('T01', procDone);
    expect(procDone.code).not.toBe(0);
    expect(reasonDone).not.toBe('PASS');
    expect(['NOT_IMPLEMENTED', 'REGISTRY_INVALID']).toContain(String(reasonDone));

    // CONTROLE — un runner qui refuserait toute tache indistinctement rendrait
    // A5 vert sans rien prouver. Le meme registre, interroge sur un id absent,
    // doit donner un verdict DIFFERENT de celui de T01.
    const unknown = runVerify('T99', registry);
    expect(reasonOf('T99', unknown)).not.toBe(reason);

    // CONTROLE DE CAPACITE — NOT_IMPLEMENTED doit etre cause par l'absence de
    // resultat observe, pas rendu inconditionnellement. Le meme mecanisme de
    // registre isole, applique a une tache reellement implementee et vraie, doit
    // donner PASS.
    const capable = capabilityOfNonRefusal();
    expect({ controle: 'capacite-de-non-refus', exit: capable.code, reason: capable.reason })
      .toEqual({ controle: 'capacite-de-non-refus', exit: 0, reason: 'PASS' });
  }, SUITE_TIMEOUT_MS);

  test('T00.A6 les lockfiles restent inchanges apres installation figee', () => {
    // Les deux chaines sont verrouillees (ADR-005 point 4).
    const tracked: readonly [string, string] = ['pnpm-lock.yaml', path.join('analysis', 'uv.lock')];

    for (const rel of tracked) {
      const abs = path.join(REPO, rel);
      expect(fs.existsSync(abs) ? 'present' : `LOCKFILE-ABSENT ${rel}`).toBe('present');
      expect(fs.statSync(abs).size).toBeGreaterThan(0);
    }

    // L'installation figee doit reussir : un lockfile desynchronise fait echouer
    // --frozen-lockfile / --frozen, et c'est deja une violation du cas.
    expect({
      pnpm: frozen.pnpm.code,
      uv: frozen.uv.code,
      pnpmErr: frozen.pnpm.code === 0 ? '' : tail(frozen.pnpm.stderr, 15),
      uvErr: frozen.uv.code === 0 ? '' : tail(frozen.uv.stderr, 15),
    }).toEqual({ pnpm: 0, uv: 0, pnpmErr: '', uvErr: '' });

    // Comparaison par empreinte sha256 avant/apres, sur les DEUX lockfiles.
    for (const rel of tracked) {
      const before = frozen.before[rel];
      const after = frozen.after[rel];
      expect(before).toMatch(/^[0-9a-f]{64}$/);
      expect({ lockfile: rel, sha256: after }).toEqual({ lockfile: rel, sha256: before });
    }

    console.log(
      `[T00.A6] ${tracked[0]}=${String(frozen.after[tracked[0]]).slice(0, 16)}... ` +
        `${tracked[1]}=${String(frozen.after[tracked[1]]).slice(0, 16)}... ` +
        `(inchangees apres pnpm install --frozen-lockfile + uv sync --frozen)`,
    );

    // Et la mutation doit etre detectable : l'empreinte depend bien du contenu.
    const witness = path.join(TMP, 'witness.lock');
    fs.writeFileSync(witness, fs.readFileSync(path.join(REPO, tracked[0])));
    const witnessBefore = sha256(witness);
    fs.appendFileSync(witness, '\n# mutation temoin\n');
    expect(sha256(witness)).not.toBe(witnessBefore);
  }, SUITE_TIMEOUT_MS);
});
