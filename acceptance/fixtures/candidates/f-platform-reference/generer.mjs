#!/usr/bin/env node
// acceptance/fixtures/candidates/f-platform-reference/generer.mjs — zone ACCEPTANCE (T74, test-author).
//
// MECANISME QUI PRODUIT L'INSTANTANE DE LA SOURCE DE CLAUSES qu'execute le candidat de
// reference F-PLATFORM (../f-platform-reference-candidate.mjs). Fixe par
// acceptance/T74.spec.ts (en-tete, section III) :
//
//   1. lire, PAR GIT, a un commit EPINGLE (et non dans l'arbre de travail), les deux
//      fichiers de la source de clauses : packages/oracle/src/f-platform-engine.ts et
//      packages/oracle/src/f-platform-clauses.ts ;
//   2. les transpiler en JavaScript (typescript.transpileModule, ES2022, ESM : types
//      effaces, rien d'autre) et reecrire l'unique import relatif ('./f-platform-engine.js'
//      -> './f-platform-engine.mjs') ;
//   3. ecrire f-platform-engine.mjs, f-platform-clauses.mjs et MANIFEST.json (commit,
//      empreintes sha256 des deux sources .ts et des deux fichiers produits).
//
// L'instantane est COMMITTE par le test-author : il ne suit pas les modifications
// ulterieures de packages/oracle (c'est voulu, voir l'en-tete de la suite). Le rejouer
// sur le meme commit redonne les memes octets (verifie par `node generer.mjs --check`).
//
// Usage : node generer.mjs [--commit <sha>] [--check]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(ICI, '..', '..', '..', '..')
const COMMIT_PAR_DEFAUT = 'HEAD'

const argv = process.argv.slice(2)
const check = argv.includes('--check')
const i = argv.indexOf('--commit')
let commit = i >= 0 ? argv[i + 1] : null
if (commit === null) {
  try {
    commit = JSON.parse(fs.readFileSync(path.join(ICI, 'MANIFEST.json'), 'utf8')).commit
  } catch {
    commit = COMMIT_PAR_DEFAUT
  }
}
commit = execFileSync('git', ['rev-parse', `${commit}^{commit}`], { cwd: REPO, encoding: 'utf8' }).trim()

const ts = (await import(path.join(REPO, 'node_modules', 'typescript', 'lib', 'typescript.js'))).default
const sha = (b) => createHash('sha256').update(b).digest('hex')
const SOURCES = [
  ['packages/oracle/src/f-platform-engine.ts', 'f-platform-engine.mjs'],
  ['packages/oracle/src/f-platform-clauses.ts', 'f-platform-clauses.mjs'],
]

const manifest = { schema: 'bench.t74.platform-snapshot/1', commit, typescript: ts.version, sources: {}, fichiers: {} }
const produits = {}
for (const [src, sortie] of SOURCES) {
  const texte = execFileSync('git', ['show', `${commit}:${src}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  manifest.sources[src] = sha(texte)
  let js = ts.transpileModule(texte, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false, sourceMap: false },
    fileName: path.basename(src),
  }).outputText
  js = js.replace(/from '\.\/f-platform-engine\.js'/g, "from './f-platform-engine.mjs'")
  const entete = `// GENERE par acceptance/fixtures/candidates/f-platform-reference/generer.mjs depuis ${src} au commit ${commit}. NE PAS EDITER.\n`
  produits[sortie] = entete + js
  manifest.fichiers[sortie] = sha(produits[sortie])
}

if (check) {
  const ecarts = []
  for (const [f, c] of Object.entries(produits)) {
    let vu = ''
    try {
      vu = fs.readFileSync(path.join(ICI, f), 'utf8')
    } catch {
      /* absent */
    }
    if (vu !== c) ecarts.push(f)
  }
  if (ecarts.length > 0) {
    console.error(`INSTANTANE-DIFFERENT de la generation au commit ${commit} : ${ecarts.join(', ')}`)
    process.exit(1)
  }
  console.log(`instantane conforme au commit ${commit}`)
} else {
  for (const [f, c] of Object.entries(produits)) fs.writeFileSync(path.join(ICI, f), c)
  fs.writeFileSync(path.join(ICI, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify(manifest, null, 2))
}
