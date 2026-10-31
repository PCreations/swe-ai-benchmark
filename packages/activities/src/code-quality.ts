// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T76, ADR-021 décision 5 (« qualité du code ») : les six
// mesures de qualité du code qu'un candidat a commis à la fin d'une période.
//
// Elles portent sur l'ARBRE DU COMMIT (`git ls-tree`/`git show`), jamais sur
// l'espace de travail tel qu'il est après coup, et sont indépendantes du
// scénario : elles serviront telles quelles au pilote réel.
//
//   CODE DU CANDIDAT  les fichiers JavaScript/TypeScript du commit (.js .mjs
//                     .cjs .jsx .ts .mts .cts .tsx), hors répertoires cachés,
//                     `node_modules/` et `docs/`, et hors fichiers de TEST
//                     (conventions de découverte de `node --test` de Node 22,
//                     plus `tests/`, `__tests__/`, `spec/`, `*.spec.*`).
//   complexity        complexité cyclomatique MOYENNE par unité (McCabe :
//                     1 + points de décision — if, for, while, case, catch,
//                     ternaire, &&, ||, ??). Une unité est une fonction à corps
//                     en bloc (déclaration, expression, méthode, flèche) ; le
//                     code de premier niveau d'un fichier forme une unité de
//                     plus s'il porte au moins une décision.
//   duplication       fraction (0..1) des lignes de code significatives
//                     (commentaires retirés, lignes vides ignorées) couvertes
//                     par une fenêtre de DUPLICATION_WINDOW lignes
//                     consécutives qui apparaît au moins deux fois.
//   function_size     nombre MOYEN de lignes par fonction (de la ligne de
//                     l'accolade ouvrante à celle de l'accolade fermante).
//   file_size         nombre MOYEN de lignes par fichier de code.
//   tests_written     le nombre de cas que `node --test` découvre ET exécute à
//                     la racine d'une copie de l'arbre du commit (`# tests`).
//   coverage          fraction (0..1) des lignes de code significatives du
//                     candidat exécutées par ces tests (lcov de
//                     `--experimental-test-coverage`) ; un fichier jamais
//                     chargé par les tests compte pour 0 ; sans test, 0.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface CodeQualityMeasures {
  readonly complexity: number
  readonly duplication: number
  readonly function_size: number
  readonly file_size: number
  readonly tests_written: number
  readonly coverage: number
}

export interface MeasureCodeQualityInput {
  readonly workspaceDir: string
  readonly commitSha: string
  /** Délai maximal de `node --test` (ms, défaut 300 s). */
  readonly testTimeoutMs?: number
}

const SOURCE_EXTENSION = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/
/** Node 22 : `**\/*.test.*`, `*-test.*`, `*_test.*`, `test-*.*`, `test.*`, `test/**` ; plus les usages courants. */
const TEST_FILE =
  /(^|\/)(tests?|__tests__|spec)\/|(^|\/)test[-_.][^/]*$|(^|\/)test\.[^/]*$|[._-](test|spec)\.[A-Za-z0-9]+$/
const EXCLUDED_DIR = /(^|\/)(\.[^/]+|node_modules|docs)\//

export const DUPLICATION_WINDOW = 5

export function isCandidateSourceFile(rel: string): boolean {
  return SOURCE_EXTENSION.test(rel) && !EXCLUDED_DIR.test(rel) && !rel.startsWith('.') && !TEST_FILE.test(rel)
}

/* ══════════════════════════════════════════════ lexique JavaScript (léger) */

type CharClass = 0 | 1 | 2 // 0 code, 1 commentaire, 2 chaîne

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await',
])

/**
 * Classe chaque caractère d'un source JavaScript : code, commentaire ou
 * littéral (chaîne, gabarit hors `${…}`, expression régulière). Heuristique
 * (pas un analyseur complet), suffisante pour compter accolades et mots-clés.
 */
function classify(src: string): CharClass[] {
  const cls = new Array<CharClass>(src.length).fill(0)
  // Pile des contextes : 'code' (profondeur d'accolades dans un `${`), ou gabarit.
  const templateDepth: number[] = []
  let braceDepth = 0
  let lastSignificant = ''
  let lastWord = ''
  let i = 0
  const mark = (a: number, b: number, c: CharClass): void => {
    for (let k = a; k < b && k < src.length; k += 1) cls[k] = c
  }
  const scanTemplate = (start: number): number => {
    // `start` pointe sur le caractère suivant le backtick (ou la fin d'un `${…}`).
    let j = start
    while (j < src.length) {
      const ch = src[j]
      if (ch === '\\') {
        j += 2
        continue
      }
      if (ch === '`') {
        mark(start, j + 1, 2)
        return j + 1
      }
      if (ch === '$' && src[j + 1] === '{') {
        mark(start, j + 2, 2)
        templateDepth.push(braceDepth)
        braceDepth += 1
        return j + 2
      }
      j += 1
    }
    mark(start, src.length, 2)
    return src.length
  }
  while (i < src.length) {
    const ch = src[i] as string
    const next = src[i + 1]
    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end < 0 ? src.length : end
      mark(i, stop, 1)
      i = stop
      continue
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      mark(i, stop, 1)
      i = stop
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== ch && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      mark(i, j + 1, 2)
      i = j + 1
      lastSignificant = 'x'
      lastWord = ''
      continue
    }
    if (ch === '`') {
      mark(i, i + 1, 2)
      i = scanTemplate(i + 1)
      lastSignificant = 'x'
      lastWord = ''
      continue
    }
    if (ch === '/') {
      const regexAllowed = lastSignificant === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSignificant) || REGEX_PRECEDING_KEYWORDS.has(lastWord)
      if (regexAllowed) {
        let j = i + 1
        let inClass = false
        while (j < src.length && src[j] !== '\n') {
          const c = src[j]
          if (c === '\\') {
            j += 2
            continue
          }
          if (c === '[') inClass = true
          else if (c === ']') inClass = false
          else if (c === '/' && !inClass) break
          j += 1
        }
        j += 1
        while (j < src.length && /[A-Za-z]/.test(src[j] as string)) j += 1
        mark(i, j, 2)
        i = j
        lastSignificant = 'x'
        lastWord = ''
        continue
      }
    }
    if (ch === '{') braceDepth += 1
    if (ch === '}') {
      if (templateDepth.length > 0 && templateDepth[templateDepth.length - 1] === braceDepth - 1) {
        templateDepth.pop()
        braceDepth -= 1
        mark(i, i + 1, 2)
        i = scanTemplate(i + 1)
        lastSignificant = 'x'
        lastWord = ''
        continue
      }
      braceDepth -= 1
    }
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j] as string)) j += 1
      lastWord = src.slice(i, j)
      lastSignificant = 'x'
      i = j
      continue
    }
    if (!/\s/.test(ch)) {
      lastSignificant = ch
      lastWord = ''
    }
    i += 1
  }
  return cls
}

/** Source sans commentaires (remplacés par des blancs, retours à la ligne conservés). */
function withoutComments(src: string, cls: readonly CharClass[]): string {
  let out = ''
  for (let i = 0; i < src.length; i += 1) out += cls[i] === 1 && src[i] !== '\n' ? ' ' : src[i]
  return out
}

/** Source réduite à sa structure : commentaires ET littéraux blanchis. */
function structural(src: string, cls: readonly CharClass[]): string {
  let out = ''
  for (let i = 0; i < src.length; i += 1) out += cls[i] !== 0 && src[i] !== '\n' ? ' ' : src[i]
  return out
}

/* ═════════════════════════════════════════════ fonctions et complexité ═══ */

interface Unit {
  readonly lines: number
  readonly decisions: number
  readonly isFunction: boolean
}

const NOT_A_FUNCTION_BEFORE_PAREN = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'typeof', 'await', 'yield', 'void', 'delete', 'in', 'of', 'new'])
const DECISION_KEYWORDS = new Set(['if', 'for', 'while', 'case', 'catch'])

function analyseFile(src: string): { units: Unit[]; topLevelDecisions: number } {
  const code = structural(src, classify(src))
  const lineAt: number[] = new Array<number>(code.length)
  let line = 1
  for (let i = 0; i < code.length; i += 1) {
    lineAt[i] = line
    if (code[i] === '\n') line += 1
  }
  const parenOpen: number[] = []
  const matchingOpen = new Map<number, number>()
  const braces: { fn: boolean; line: number; decisions: number }[] = []
  const units: Unit[] = []
  let topLevelDecisions = 0
  const addDecision = (): void => {
    for (let k = braces.length - 1; k >= 0; k -= 1) {
      const b = braces[k] as { fn: boolean; decisions: number }
      if (b.fn) {
        b.decisions += 1
        return
      }
    }
    topLevelDecisions += 1
  }
  const prevNonSpace = (i: number): number => {
    let j = i - 1
    while (j >= 0 && /\s/.test(code[j] as string)) j -= 1
    return j
  }
  const wordEndingAt = (j: number): string => {
    let k = j
    while (k >= 0 && /[A-Za-z0-9_$]/.test(code[k] as string)) k -= 1
    return code.slice(k + 1, j + 1)
  }
  let i = 0
  while (i < code.length) {
    const ch = code[i] as string
    if (/[A-Za-z_$]/.test(ch) && (i === 0 || !/[A-Za-z0-9_$.]/.test(code[i - 1] as string))) {
      let j = i
      while (j < code.length && /[A-Za-z0-9_$]/.test(code[j] as string)) j += 1
      if (DECISION_KEYWORDS.has(code.slice(i, j))) addDecision()
      i = j
      continue
    }
    if ((ch === '&' && code[i + 1] === '&') || (ch === '|' && code[i + 1] === '|') || (ch === '?' && code[i + 1] === '?')) {
      addDecision()
      i += code[i + 2] === '=' ? 3 : 2
      continue
    }
    if (ch === '?' && code[i + 1] !== '.') {
      addDecision()
      i += 1
      continue
    }
    if (ch === '(') parenOpen.push(i)
    else if (ch === ')') {
      const o = parenOpen.pop()
      if (o !== undefined) matchingOpen.set(i, o)
    } else if (ch === '{') {
      const p = prevNonSpace(i)
      let fn = false
      if (p >= 1 && code[p] === '>' && code[p - 1] === '=') fn = true
      else if (p >= 0 && code[p] === ')') {
        const open = matchingOpen.get(p)
        if (open !== undefined) {
          const q = prevNonSpace(open)
          if (q >= 0 && code[q] === '*') fn = true
          else if (q >= 0 && /[A-Za-z0-9_$]/.test(code[q] as string)) fn = !NOT_A_FUNCTION_BEFORE_PAREN.has(wordEndingAt(q))
        }
      }
      braces.push({ fn, line: lineAt[i] as number, decisions: 0 })
    } else if (ch === '}') {
      const b = braces.pop()
      if (b !== undefined && b.fn) units.push({ lines: (lineAt[i] as number) - b.line + 1, decisions: b.decisions, isFunction: true })
    }
    i += 1
  }
  return { units, topLevelDecisions }
}

/* ══════════════════════════════════════════════════════════ mesures ═════ */

function physicalLines(src: string): number {
  if (src.length === 0) return 0
  const n = src.split('\n').length
  return src.endsWith('\n') ? n - 1 : n
}

/** Numéros (1-indexés) des lignes significatives : du code une fois les commentaires retirés. */
function significantLines(src: string): Map<number, string> {
  const clean = withoutComments(src, classify(src))
  const out = new Map<number, string>()
  clean.split('\n').forEach((l, idx) => {
    const t = l.trim().replace(/\s+/g, ' ')
    if (t !== '') out.set(idx + 1, t)
  })
  return out
}

function duplicationRatio(files: readonly { readonly significant: Map<number, string> }[]): number {
  const windows = new Map<string, { file: number; start: number }[]>()
  const seqs = files.map((f) => [...f.significant.entries()])
  seqs.forEach((seq, fi) => {
    for (let s = 0; s + DUPLICATION_WINDOW <= seq.length; s += 1) {
      const key = seq.slice(s, s + DUPLICATION_WINDOW).map(([, t]) => t).join('\n')
      const list = windows.get(key) ?? []
      list.push({ file: fi, start: s })
      windows.set(key, list)
    }
  })
  const duplicated = seqs.map(() => new Set<number>())
  for (const occurrences of windows.values()) {
    if (occurrences.length < 2) continue
    for (const o of occurrences) for (let k = 0; k < DUPLICATION_WINDOW; k += 1) duplicated[o.file]?.add(o.start + k)
  }
  const total = seqs.reduce((s, q) => s + q.length, 0)
  const dup = duplicated.reduce((s, d) => s + d.size, 0)
  return total === 0 ? 0 : dup / total
}

const meanOf = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length)

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

interface TestRun {
  readonly tests: number
  /** Lignes exécutées par fichier (chemin relatif à la racine du dépôt). */
  readonly hits: Map<string, Set<number>>
}

/** `node --test` à la racine d'une copie de l'arbre du commit, avec couverture lcov. */
function runCandidateTests(workspaceDir: string, commitSha: string, timeoutMs: number): TestRun {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-quality-'))
  try {
    const tree = path.join(root, 'tree')
    fs.mkdirSync(tree)
    const archive = execFileSync('git', ['archive', '--format=tar', commitSha], {
      cwd: workspaceDir,
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    execFileSync('tar', ['-x', '-C', tree], { input: archive, stdio: ['pipe', 'ignore', 'pipe'] })
    const lcovFile = path.join(root, 'coverage.lcov')
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env['NODE_OPTIONS']
    delete env['NODE_V8_COVERAGE']
    delete env['NODE_TEST_CONTEXT']
    const r = spawnSync(
      process.execPath,
      [
        '--test',
        '--experimental-test-coverage',
        '--test-reporter=tap',
        '--test-reporter-destination=stdout',
        '--test-reporter=lcov',
        `--test-reporter-destination=${lcovFile}`,
      ],
      { cwd: tree, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 },
    )
    const stdout = typeof r.stdout === 'string' ? r.stdout : ''
    let tests = 0
    for (const m of stdout.matchAll(/^# tests (\d+)\s*$/gm)) tests = Number(m[1])
    const hits = new Map<string, Set<number>>()
    if (tests > 0 && fs.existsSync(lcovFile)) {
      let current: Set<number> | null = null
      for (const l of fs.readFileSync(lcovFile, 'utf8').split('\n')) {
        if (l.startsWith('SF:')) {
          const abs = path.resolve(tree, l.slice(3).trim())
          const rel = path.relative(tree, abs).split(path.sep).join('/')
          current = hits.get(rel) ?? new Set<number>()
          hits.set(rel, current)
        } else if (l.startsWith('DA:') && current !== null) {
          const [ln, count] = l.slice(3).split(',')
          if (Number(count) > 0) current.add(Number(ln))
        } else if (l.startsWith('end_of_record')) current = null
      }
    }
    return { tests, hits }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

/** Les six mesures de qualité du code au commit `commitSha` de `workspaceDir`. */
export function measureCodeQuality(input: MeasureCodeQualityInput): CodeQualityMeasures {
  const files = git(input.workspaceDir, ['ls-tree', '-r', '--name-only', '-z', input.commitSha])
    .split('\0')
    .filter((f) => f !== '' && isCandidateSourceFile(f))
    .sort()
  const analysed = files.map((rel) => {
    const src = git(input.workspaceDir, ['show', `${input.commitSha}:${rel}`])
    const { units, topLevelDecisions } = analyseFile(src)
    return { rel, lines: physicalLines(src), units, topLevelDecisions, significant: significantLines(src) }
  })
  const complexities: number[] = []
  const functionLines: number[] = []
  for (const f of analysed) {
    for (const u of f.units) {
      complexities.push(1 + u.decisions)
      if (u.isFunction) functionLines.push(u.lines)
    }
    if (f.topLevelDecisions > 0) complexities.push(1 + f.topLevelDecisions)
  }
  const run = runCandidateTests(input.workspaceDir, input.commitSha, input.testTimeoutMs ?? 300_000)
  let executable = 0
  let executed = 0
  for (const f of analysed) {
    const hit = run.hits.get(f.rel)
    for (const ln of f.significant.keys()) {
      executable += 1
      if (run.tests > 0 && hit !== undefined && hit.has(ln)) executed += 1
    }
  }
  return {
    complexity: meanOf(complexities),
    duplication: duplicationRatio(analysed),
    function_size: meanOf(functionLines),
    file_size: meanOf(analysed.map((f) => f.lines)),
    tests_written: run.tests,
    coverage: run.tests > 0 && executable > 0 ? executed / executable : 0,
  }
}
