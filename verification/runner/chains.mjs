// ─────────────────────────────────────────────────────────────────────────────
// chains — EXÉCUTION des chaînes de test, et rien d'autre.
//
// Ce module lance une suite et rend ce qu'il a VU : un statut par test observé.
// Il n'adjuge pas, il ne connaît pas la notion de « cas requis », et il ne sait
// pas ce qu'est un verdict de tâche. La séparation n'est pas cosmétique :
// `verify-task.mjs` doit pouvoir être relu comme une décision, sans que la
// mécanique d'invocation d'un binaire de test s'y mêle.
//
// DEUX RÈGLES QUI DÉCIDENT DE LA FORME DU FICHIER.
//
// 1. LE RAPPORT MACHINE EST LA SEULE ENTRÉE. §G : « il produit une preuve
//    seulement à partir d'un résultat de test observé », et §D-12 : « ni test
//    sauté, ni rapport absent, ni simple code de sortie d'un sous-processus ne
//    suffisent ». On ne lit donc JAMAIS la sortie console pour décider : Jest
//    écrit un rapport JSON (`--json --outputFile`), pytest un rapport JUnit
//    (`--junitxml`). Le code de sortie est enregistré, mais il ne sert qu'à
//    diagnostiquer ; c'est le rapport qui porte les statuts.
//
// 2. LE RAPPORT CONSOMMÉ EST CELUI QUE CE RUN VIENT D'ÉCRIRE. Le fichier est
//    créé dans un répertoire nommé par nonce, et EFFACÉ avant l'exécution. Un
//    rapport laissé par une exécution antérieure — ou fabriqué — ne peut donc
//    pas témoigner à la place de celle-ci. C'est la même règle que
//    `cleanroom.mjs` applique au checkout : ne jamais adjuger un fichier trouvé
//    sur le disque.
//
// 3. LE NOMBRE D'ASSERTIONS RÉELLEMENT EXÉCUTÉES EST UNE OBSERVATION, PAS UNE
//    DÉDUCTION. §G l.139 : « un programme qui écrit seulement `passed=true`, un
//    test avec zéro assertion […] ne satisfait pas le contrat ». Un test vide
//    sort `passed` dans les deux chaînes : le statut ne distingue pas « a
//    vérifié quelque chose » de « n'a rien vérifié ». Chaque test observé porte
//    donc `asserts`, lu dans la chaîne elle-même — `numPassingAsserts` côté
//    Jest, un compteur de hook côté pytest. `asserts: null` signifie NON
//    OBSERVÉ, et `verify-task.mjs` le traite comme zéro : un compteur absent ne
//    peut pas valoir satisfaction, sinon casser le compteur rendrait le
//    contrôle inopérant sans qu'aucun test ne rougisse.
//
// POURQUOI PAS DE PARSEUR XML EN DÉPENDANCE. Ajouter une dépendance au
// vérificateur pour lire quarante lignes de JUnit élargirait la surface que
// §C demande de verrouiller, pour un gain nul : le format produit par pytest
// est plat (une balise `testcase`, trois enfants possibles). Le lecteur
// ci-dessous est volontairement strict — il ne « devine » rien, et un document
// qu'il ne sait pas lire donne zéro test observé, donc jamais un PASS.
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { repoRoot } from './git.mjs'

const R = repoRoot()

/** Statuts normalisés — le vocabulaire que `verify-task.mjs` adjuge. */
export const TEST_STATUS = { PASS: 'PASS', FAIL: 'FAIL', SKIPPED: 'SKIPPED', VACUOUS: 'VACUOUS' }

/**
 * La chaîne se déduit de l'extension de `acceptance_entry`, et de rien d'autre.
 * ADR-005 §5 : T00 livre Jest ET pytest, donc le registre doit pouvoir désigner
 * l'une ou l'autre par tâche. Une extension inconnue ne se replie PAS sur une
 * chaîne par défaut : un repli silencieux lancerait la mauvaise suite, qui ne
 * trouverait aucun cas, et l'absence de cas serait lue comme « non implémentée »
 * au lieu de « registre incohérent ».
 */
export function detectChain(entry) {
  if (typeof entry !== 'string') return null
  if (/\.(mts|cts|tsx?|jsx?|mjs|cjs)$/.test(entry)) return 'jest'
  if (/\.py$/.test(entry)) return 'pytest'
  return null
}

/** Répertoire de run, nommé par nonce : voir règle 2 de l'en-tête. */
function runDir(tag) {
  const id = createHash('sha256')
    .update(`${tag}:${process.pid}:${Date.now()}:${process.hrtime.bigint() % 1000000n}`)
    .digest('hex')
    .slice(0, 12)
  const dir = `${R}/.bench/run/${id}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return { id, dir }
}

function exec(command, cwd, env = undefined) {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(env ? { env } : {}),
    })
    return { exit_code: 0, stdout, stderr: '' }
  } catch (e) {
    return {
      exit_code: e.status ?? 1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? '') + (e.killed ? '\n<tue par timeout>' : ''),
    }
  }
}

const tail = (s, n = 60) => s.trimEnd().split('\n').slice(-n).join('\n')

/* ───────────────────────────────────────────────────────────────────── Jest */

/**
 * `--runTestsByPath` et non `--testPathPattern` : le second est une expression
 * régulière, et `acceptance/T00.spec.ts` en est une valide qui matche aussi
 * `acceptance/T00Xspec.ts`. Désigner le fichier par son chemin exact évite
 * qu'une tâche soit adjugée sur la suite d'une autre.
 */
function runJest(entry, out) {
  const command =
    `node --experimental-vm-modules node_modules/jest/bin/jest.js ` +
    `--runTestsByPath ${JSON.stringify(entry)} --json --outputFile ${JSON.stringify(out)}`
  const proc = exec(command, R)

  if (!existsSync(out)) {
    return { command, ...proc, loaded: false, why: 'jest n a produit aucun rapport JSON', tests: [] }
  }
  let doc
  try {
    doc = JSON.parse(readFileSync(out, 'utf8'))
  } catch (e) {
    return { command, ...proc, loaded: false, why: `rapport JSON illisible : ${e.message}`, tests: [] }
  }

  // Une suite qui ne se CHARGE pas (import cassé, erreur de type) produit un
  // rapport où le fichier compte comme « runtime error » et zéro assertion.
  // Ce n'est pas un échec d'assertion : c'est une absence d'observation, et la
  // confondre avec un rouge légitime est exactement ce que `red.mjs` refuse.
  const suiteErrors = (doc.testResults ?? [])
    .filter((tr) => (tr.assertionResults ?? []).length === 0 && (tr.message ?? '').trim() !== '')
    .map((tr) => `${tr.name} : ${tr.message.split('\n')[0]}`)

  const tests = []
  for (const tr of doc.testResults ?? []) {
    for (const a of tr.assertionResults ?? []) {
      // `numPassingAsserts` est le compteur que Jest tient lui-meme : il vaut 0
      // pour un `test('...', () => {})` qui sort pourtant `passed`. Les
      // assertions qui ONT echoue s'y ajoutent — elles ont ete executees, ce
      // qui est la propriete mesuree ici ; le statut FAIL, lui, est porte a
      // part. Un champ absent (version de Jest inattendue) donne `null`, donc
      // NON OBSERVE, jamais zero implicitement satisfaisant.
      const passing = typeof a.numPassingAsserts === 'number' ? a.numPassingAsserts : null
      const failing = Array.isArray(a.failureMessages) ? a.failureMessages.length : 0
      tests.push({
        name: a.fullName || a.title,
        status:
          a.status === 'passed'
            ? TEST_STATUS.PASS
            : a.status === 'failed'
              ? TEST_STATUS.FAIL
              : TEST_STATUS.SKIPPED,
        raw_status: a.status,
        asserts: passing === null ? null : passing + failing,
      })
    }
  }
  return {
    command,
    ...proc,
    loaded: tests.length > 0 || (doc.numTotalTestSuites ?? 0) > 0,
    suite_errors: suiteErrors,
    tests,
    totals: { total: doc.numTotalTests ?? 0, passed: doc.numPassedTests ?? 0, failed: doc.numFailedTests ?? 0 },
  }
}

/* ─────────────────────────────────────────────────────────────────── pytest */

/** Décodage des cinq entités XML que pytest peut produire. Rien de plus. */
function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attr(tagBody, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tagBody)
  return m ? unescapeXml(m[1]) : null
}

/**
 * Lecteur JUnit minimal. Un `testcase` sans enfant est passé ; un enfant
 * `failure` ou `error` le noircit ; `skipped` le marque sauté. FAIL-CLOSED :
 * tout ce qui n'est pas explicitement un `testcase` reconnu est ignoré, donc
 * ne peut pas verdir un cas.
 */
export function parseJUnit(xml) {
  const tests = []
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const head = m[1]
    const body = m[3] ?? ''
    const cls = attr(head, 'classname') ?? ''
    const name = attr(head, 'name') ?? ''
    const failed = /<(failure|error)\b/.test(body)
    const skipped = /<skipped\b/.test(body)
    tests.push({
      name: cls ? `${cls}::${name}` : name,
      status: failed ? TEST_STATUS.FAIL : skipped ? TEST_STATUS.SKIPPED : TEST_STATUS.PASS,
      raw_status: failed ? 'failed' : skipped ? 'skipped' : 'passed',
    })
  }
  return tests
}

/**
 * Rattache à chaque `testcase` JUnit le nombre d'assertions que le plugin a
 * compté pour lui.
 *
 * JUnit et pytest ne nomment pas un test pareil : `classname` + `name` d'un
 * côté, `nodeid` de l'autre. La jointure se fait sur le dernier segment du
 * nodeid, qui EST le `name` JUnit. FAIL-CLOSED sur les deux façons dont elle
 * peut rater : aucun enregistrement trouvé donne `null` (non observé, donc
 * refusé), et plusieurs enregistrements homonymes donnent le MINIMUM — jamais
 * le maximum, qui laisserait un test creux emprunter le compteur de son
 * homonyme.
 */
export function attachPytestAsserts(tests, countsFile) {
  let doc = null
  try {
    doc = JSON.parse(readFileSync(countsFile, 'utf8'))
  } catch {
    return tests.map((t) => ({ ...t, asserts: null }))
  }
  const byName = new Map()
  for (const rec of doc?.tests ?? []) {
    if (typeof rec?.name !== 'string' || typeof rec?.asserts !== 'number') continue
    const prev = byName.get(rec.name)
    byName.set(rec.name, prev === undefined ? rec.asserts : Math.min(prev, rec.asserts))
  }
  return tests.map((t) => {
    const short = t.name.includes('::') ? t.name.slice(t.name.lastIndexOf('::') + 2) : t.name
    const n = byName.get(short)
    return { ...t, asserts: typeof n === 'number' ? n : null }
  })
}

/**
 * `uv --project analysis run` : l'environnement Python est celui qu'`analysis/
 * uv.lock` décrit, jamais l'interpréteur du système. §C épingle 3.12 ; laisser
 * pytest tourner sur l'interpréteur ambiant rendrait le verdict dépendant de
 * l'hôte, ce que `doctor.mjs` existe précisément pour interdire.
 */
function runPytest(entry, out, countsFile) {
  const command =
    `uv --project analysis run pytest ${JSON.stringify(entry)} ` +
    `--junitxml=${JSON.stringify(out)} -p no:cacheprovider -p bench_assert_counts`
  // Le plugin vit en zone HARNESS (verification/runner/pytest) et est atteint
  // par PYTHONPATH, jamais installé : l'ajouter aux dépendances de `analysis`
  // ferait dépendre l'environnement mesuré d'un paquet du mesureur.
  const env = {
    ...process.env,
    BENCH_ASSERT_COUNTS: countsFile,
    PYTHONPATH: [`${R}/verification/runner/pytest`, process.env.PYTHONPATH]
      .filter((x) => typeof x === 'string' && x !== '')
      .join(':'),
  }
  const proc = exec(command, R, env)

  if (!existsSync(out)) {
    return { command, ...proc, loaded: false, why: 'pytest n a produit aucun rapport JUnit', tests: [] }
  }
  const tests = attachPytestAsserts(parseJUnit(readFileSync(out, 'utf8')), countsFile)
  // pytest rend 2..5 pour une erreur de collecte, d'usage ou une interruption :
  // la suite ne s'est pas exécutée, il n'y a rien à adjuger.
  const collectionFailed = proc.exit_code >= 2 && tests.length === 0
  return {
    command,
    ...proc,
    loaded: !collectionFailed,
    why: collectionFailed ? `pytest a echoue avant d executer (code ${proc.exit_code})` : undefined,
    tests,
    totals: {
      total: tests.length,
      passed: tests.filter((t) => t.status === TEST_STATUS.PASS).length,
      failed: tests.filter((t) => t.status === TEST_STATUS.FAIL).length,
    },
  }
}

/* ──────────────────────────────────────────────────────────────────── façade */

/**
 * Exécute l'entrée d'acceptation d'une tâche.
 *
 * `present: false` n'est PAS un échec d'assertion : rien n'a tourné. L'appelant
 * doit en faire `NOT_IMPLEMENTED`, jamais `ASSERTION_FAILED` — ADR-005 §1 :
 * « 1 signifie qu'une assertion a échoué, donc que la tâche a tourné ».
 */
export function runAcceptance(entry) {
  const chain = detectChain(entry)
  const abs = typeof entry === 'string' ? resolve(R, entry) : null
  const present = abs !== null && existsSync(abs) && statSync(abs).isFile()

  if (!present || chain === null) {
    return {
      entry,
      chain,
      present,
      loaded: false,
      tests: [],
      why: !present
        ? `entree d acceptation absente : ${entry ?? '(non declaree)'}`
        : `extension non reconnue pour ${entry} : ni chaine Jest ni chaine pytest`,
      commands: [],
    }
  }

  const { id, dir } = runDir(chain)
  const out = `${dir}/${chain === 'jest' ? 'jest.json' : 'junit.xml'}`
  const counts = `${dir}/asserts.json`
  const r = chain === 'jest' ? runJest(entry, out) : runPytest(entry, out, counts)

  return {
    entry,
    chain,
    present: true,
    run_id: id,
    report_file: existsSync(out) ? out.slice(R.length + 1) : null,
    loaded: r.loaded,
    why: r.why,
    suite_errors: r.suite_errors ?? [],
    exit_code: r.exit_code,
    tests: r.tests,
    totals: r.totals ?? { total: 0, passed: 0, failed: 0 },
    commands: [{ command: r.command, exit_code: r.exit_code }],
    stdout_tail: tail(r.stdout ?? ''),
    stderr_tail: tail(r.stderr ?? '', 30),
  }
}

/**
 * Projette les tests observés sur les cas REQUIS.
 *
 * Un cas est reconnu par la présence de son identifiant dans le nom du test —
 * `T30.A1` dans « T30.A1 assertion vraie » (Jest) comme dans
 * `test_T30_A1[T30.A1]` (pytest, via l'identifiant de paramétrage). Le point
 * est échappé : sans cela `T30.A1` matcherait `T30XA1`.
 *
 * FAIL-CLOSED sur quatre points :
 *   • un cas sans aucun test observé vaut NOT_RUN, jamais PASS ;
 *   • un cas dont UN SEUL test échoue vaut FAIL, même si dix autres passent ;
 *   • un cas sauté vaut SKIPPED, et §G refuse les tests sautés ;
 *   • un cas dont les tests sortent verts SANS avoir exécuté une seule
 *     assertion vaut VACUOUS — §G l.139 : « un test avec zéro assertion […] ne
 *     satisfait pas le contrat ». Un compteur NON OBSERVÉ (`asserts: null`)
 *     compte pour zéro : c'est la seule lecture qui ne récompense pas la panne
 *     du compteur.
 */
export function projectCases(requiredCases, tests) {
  const statuses = []
  for (const id of requiredCases) {
    const re = new RegExp(id.replace(/\./g, '\\.'))
    const mine = tests.filter((t) => re.test(t.name))
    if (mine.length === 0) {
      statuses.push({ id, status: 'NOT_RUN', observed: 0, asserts: 0, asserts_observable: false })
      continue
    }
    const failed = mine.filter((t) => t.status === TEST_STATUS.FAIL).length
    const skipped = mine.filter((t) => t.status === TEST_STATUS.SKIPPED).length
    const observable = mine.every((t) => typeof t.asserts === 'number')
    const asserts = mine.reduce((n, t) => n + (typeof t.asserts === 'number' ? t.asserts : 0), 0)
    const vacuous = !observable || asserts === 0
    statuses.push({
      id,
      status:
        failed > 0
          ? TEST_STATUS.FAIL
          : skipped > 0
            ? TEST_STATUS.SKIPPED
            : vacuous
              ? TEST_STATUS.VACUOUS
              : TEST_STATUS.PASS,
      observed: mine.length,
      asserts,
      asserts_observable: observable,
    })
  }
  return statuses
}
