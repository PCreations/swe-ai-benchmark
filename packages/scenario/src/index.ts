// ─────────────────────────────────────────────────────────────────────────────
// @bench/scenario — compilation des scénarios et contrôle de leur révélation
// (cahier L203-L210, tâche T06).
//
// PÉRIMÈTRE ASSUMÉ. Comme `@bench/domain`, ce paquet ne dépend que de
// `@bench/contracts` et compile sous `types: []` : ni `node:fs`, ni
// `node:child_process` ne peuvent y entrer sans faire échouer `tsc`. L'invariant
// D-2 (« une révélation de période k ne contient ni besoins, ni réponses
// métier, ni tests privés de k+1 », L63) se juge sur ce que la fonction de
// révélation REND ; un paquet qui ne sait pas ouvrir un fichier ni lancer un
// processus ne peut pas contourner sa propre porte par un canal latéral.
//
// À ce commit le paquet est un SQUELETTE : les quatre exports existent et
// lèvent `NotImplemented`. Voir `./pack.js` pour ce que ce choix protège.
// ─────────────────────────────────────────────────────────────────────────────
export {
  activeRequirements,
  answerCustomerQuestion,
  compileScenarioPack,
  revealPeriod,
} from './pack.js'
export type { ScenarioPack, ScenarioSource } from './pack.js'
