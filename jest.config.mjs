// ─────────────────────────────────────────────────────────────────────────────
// Jest — TypeScript ESM sous Node 22.
//
// TROIS CHOIX QUI NE SONT PAS DES DÉTAILS :
//
// 1. ESM RÉEL, pas CommonJS transpilé. Le dépôt est `"type": "module"` et
//    tsconfig.base.json fixe `module: NodeNext` ; faire tourner les tests en
//    CJS testerait une résolution de modules qui n'est pas celle de la
//    production. D'où `useESM` + `extensionsToTreatAsEsm`, et le lancement par
//    `node --experimental-vm-modules` (script `test` de package.json) : Node 22
//    exige encore ce drapeau pour l'API `vm.Module` dont Jest se sert.
//
// 2. LES PAQUETS SONT RÉSOLUS VERS `src/`, JAMAIS VERS `dist/`.
//    verification/runner/cleanroom.mjs documente le chemin le plus court vers
//    un faux PASS dans un monorepo TypeScript : un `dist/` périmé, gitignoré,
//    invisible a `git status --porcelain`. En faisant pointer la resolution sur
//    les sources, un `dist/` parasite ne peut plus rien affirmer — et la
//    compilation reelle reste prouvee separement par `pnpm build`, qui est ce
//    que T00.A1 exige (« installe a partir des lockfiles et compile un module
//    de contrat »).
//
// 3. LE PREMIER MAPPEUR RÉÉCRIT LES SUFFIXES `.js` DES IMPORTS RELATIFS.
//    NodeNext impose d'écrire `./errors.js` depuis `errors.ts` ; Jest doit
//    retrouver le `.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options de compilation des TESTS. Volontairement distinctes de
 * tsconfig.base.json : `strict` est conservé (décision §C du cahier), mais les
 * trois options les plus sévères du dépôt — exactOptionalPropertyTypes,
 * noUncheckedIndexedAccess, verbatimModuleSyntax — ne sont pas imposées aux
 * fichiers de test. Raison : un test d'acceptation qui ne compile pas devient
 * rouge pour une raison de style, pas pour la raison attendue, ce que §H
 * interdit explicitement (« rends le test d'acceptation rouge pour la raison
 * attendue »). Les paquets, eux, restent compilés sous le régime complet.
 */
const testCompilerOptions = {
  target: 'ES2023',
  lib: ['ES2023'],
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  strict: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: true,
  types: ['node', 'jest'],
  isolatedModules: true,
}

/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  rootDir: '.',

  // Les tests d'acceptation vivent en zone ACCEPTANCE et nulle part ailleurs
  // (verification/ownership.json). Élargir ce motif à packages/** laisserait un
  // rôle écrire le code ET le test qui le juge : la règle des deux clés.
  testMatch: ['<rootDir>/acceptance/**/*.spec.ts'],

  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'json', 'node'],

  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@bench/([^/]+)$': '<rootDir>/packages/$1/src/index.ts',
    '^@bench/([^/]+)/(.*)\\.js$': '<rootDir>/packages/$1/src/$2.ts',
    '^@bench/([^/]+)/(.*)$': '<rootDir>/packages/$1/src/$2',
  },

  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: testCompilerOptions }],
  },

  // §G : « le vérificateur refuse les tests sautés ». Jest ne sait pas
  // l'interdire seul ; le runner lit le rapport JSON et refuse tout cas
  // `pending`/`todo`. Ici on se contente de rendre le fait VISIBLE.
  verbose: true,

  // §G : « il produit une preuve seulement à partir d'un résultat de test
  // observé ». Le rapport machine est la seule entrée du vérificateur ; la
  // sortie console ne prouve rien.
  reporters: ['default'],

  clearMocks: true,
  restoreMocks: true,
  testTimeout: 30_000,
  passWithNoTests: false,
}
