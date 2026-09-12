// ─────────────────────────────────────────────────────────────────────────────
// @bench/evaluation — SQUELETTE de la qualification des oracles et de la
// détection des tests défectueux (cahier L237-L244, tâche T10).
//
// CE FICHIER N'IMPLÉMENTE RIEN, ET C'EST SON RÔLE.
//
// L'étage ROUGE exige que `acceptance/T10.spec.ts` échoue POUR LA RAISON
// ATTENDUE. `verification/runner/red.mjs` n'admet que deux formes de rouge —
// `ASSERTION_FAILED` et `STUB_NOT_IMPLEMENTED` — et refuse explicitement
// `MODULE_NOT_FOUND`, `TYPE_ERROR` et `SUITE_FAILED_TO_RUN` : « c'est la forme
// par défaut du TDD en monorepo TypeScript, elle ne dit rien de ce que le test
// vérifie ».
//
// Sans ce squelette, `packages/evaluation` n'existe pas : `specifiersDuSujet()`
// ne rend aucun spécificateur, et les six cas tombent tous sur la même
// assertion `assertLoaded()` — « SUJET-NON-CHARGEABLE aucun point d entree sous
// packages/evaluation ni fixtures/** ». C'est un rouge qui ne prouve que
// l'absence d'un répertoire. Avec ce squelette, le paquet se charge, les huit
// rôles se résolvent, la suite APPELLE réellement les exports, et chaque cas
// échoue sur ce qu'il OBSERVE.
//
// LES HUIT RÔLES, ET D'OÙ VIENNENT LEURS NOMS. Ils ne sont pas choisis ici :
// `acceptance/T10.spec.ts` §III les nomme (export PRIMAIRE puis alias tolérés),
// et `verification/mutants/T10.json` reprend les sept conventions d'appel
// telles quelles. Les noms primaires sont retenus, sans alias : un alias est une
// tolérance de NOMMAGE du côté de la suite, pas une invitation à en inventer un
// ici.
//
//   qualifyWitness({ witness, dsn })     pipeline de qualification      (L239)
//   listSemanticMutants()                registre des mutants           (L239)
//   qualifyScenario(scenario)            pipeline, volet scénario       (L239)
//   listQuarantine()                     file de quarantaine            (L239)
//   detectInstability({ evaluate })      dix répétitions                (L243)
//   buildConfirmatoryManifest(rapports)  manifeste confirmatoire        (L241)
//   exportExclusions(rapports)           raisons et proportions         (L241)
//   qualificationMatrix()                matrice témoin/mutant/contrôle (L243)
//
// POURQUOI AUCUN RÔLE NE REND UNE VALEUR « PLAUSIBLE ».
// T10 porte TROIS cas de refus (A2, A3, A4) et un cas d'absence (A5). Un
// squelette complaisant les verdirait à vide : un registre qui rend `[]` ferait
// passer A2 pour satisfait faute de mutant à examiner, une file de quarantaine
// vide ferait passer A3, un manifeste vide ferait passer A5, un détecteur qui
// répond « instable » à tout ferait passer A4. C'est précisément ce que la
// suite appelle ses contrôles positifs, et ce que `verification/mutants/T10.json`
// transforme en mutants. Lever est donc la seule réponse honnête ici : elle ne
// simule ni acceptation ni refus.
//
// `NotImplemented` vient de `@bench/contracts` et son message porte le préfixe
// `NOT_IMPLEMENTED` — un stub qui lèverait une `ContractViolation` se ferait
// passer pour la garde qu'il ne contient pas.
//
// Ce fichier disparaît quand T10 devient vert : aucun export public ne doit
// lever `NotImplemented` une fois le pipeline écrit.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/* ──────────────────────────────────────────────── formes, déclarées seulement */

/** Convention d'appel III.1 : objet PLAT et STRICT (L80). */
export interface QualifyWitnessInput {
  readonly witness: string
  readonly dsn: string
}

/** Convention d'appel III.4 : `bench.qualification.scenario/1`. */
export interface QualificationScenario {
  readonly schema: string
  readonly scenario_id: string
  readonly tenant: string
  readonly business_clock: string
  readonly slots: readonly {
    readonly slot_id: string
    readonly capacity: number
    readonly starts_at: string
  }[]
  readonly steps: readonly {
    readonly step_id: string
    readonly at: string
    readonly operation: string
    readonly actor: string
    readonly slot: string
    readonly sequence: number
    readonly expect: { readonly outcome: string }
  }[]
}

/** Convention d'appel III.6 : `evaluate` rend un booléen — `true` = succès. */
export interface InstabilityInput {
  readonly evaluate: () => boolean | Promise<boolean>
}

/* ───────────────────────────────────────────────────────── les huit rôles */

/** Pipeline de qualification, volet témoin (L239). */
export function qualifyWitness(_input: QualifyWitnessInput): never {
  throw new NotImplemented('evaluation.qualifyWitness')
}

/** Registre des mutants sémantiques — les six fautes de L241 (L239). */
export function listSemanticMutants(): never {
  throw new NotImplemented('evaluation.listSemanticMutants')
}

/** Pipeline de qualification, volet scénario (L239). */
export function qualifyScenario(_scenario: QualificationScenario): never {
  throw new NotImplemented('evaluation.qualifyScenario')
}

/** File de quarantaine (L239). */
export function listQuarantine(): never {
  throw new NotImplemented('evaluation.listQuarantine')
}

/** Détection d'instabilité par DIX répétitions (L243). */
export function detectInstability(_input: InstabilityInput): never {
  throw new NotImplemented('evaluation.detectInstability')
}

/** Manifeste confirmatoire — exposition prédéfinie NON NULLE (L111, L241). */
export function buildConfirmatoryManifest(_reports: readonly unknown[]): never {
  throw new NotImplemented('evaluation.buildConfirmatoryManifest')
}

/** Raisons et proportions d'exclusion, exportables (L241). */
export function exportExclusions(_reports: readonly unknown[]): never {
  throw new NotImplemented('evaluation.exportExclusions')
}

/** Matrice témoin/mutant/contrôle enregistrée (L243). */
export function qualificationMatrix(): never {
  throw new NotImplemented('evaluation.qualificationMatrix')
}
