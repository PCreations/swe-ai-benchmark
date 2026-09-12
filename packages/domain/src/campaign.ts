// ─────────────────────────────────────────────────────────────────────────────
// Planificateur de cellules de campagne — SQUELETTE (T03, étage rouge).
//
// CE FICHIER NE CONTIENT AUCUNE RÈGLE MÉTIER, ET C'EST DÉLIBÉRÉ.
// L'étage rouge de T03 doit observer les six cas d'acceptation en échec POUR LA
// RAISON ATTENDUE (cahier L11 : « rends le test d'acceptation rouge pour la
// raison attendue »). Sans ce squelette, `acceptance/T03.spec.ts` échouerait sur
// `CONTRAT-NON-SATISFAIT` — c'est-à-dire sur l'absence d'un nom, pas sur
// l'absence d'un comportement. Le nom résolu, chaque cas échoue désormais sur sa
// propre assertion positive : six cellules attendues, un refus nommant un
// chemin, une provenance propagée. C'est le rouge qui dit quelque chose.
//
// CE QUE LE CONTRAT EXIGERA, quand l'étage vert l'écrira (cahier L177-L183) :
//   • produit cartésien projets × scénarios × configurations × répétitions ×
//     budgets, chaque cellule portant les SIX composantes d'identité de L78
//     (`campaign_id / parent_project_id / scenario_id / configuration_id /
//     repetition_id / budget_id`) ;
//   • fonction PURE : « planificateur pur de cellules » (L179). Deux appels sur
//     le même manifeste rendent le même jeu d'identités, et une option
//     d'exécution — nombre de workers — ne peut pas les changer ;
//   • validation structurée AVANT production : id en doublon, propriété
//     inconnue, budget absent et empreinte de corpus non concordante sont des
//     REFUS, et un refus ne produit aucune cellule ;
//   • aucune création de worker ni de sous-processus pendant la compilation
//     (L183), d'où l'absence totale d'import de `node:worker_threads` et de
//     `node:child_process` dans ce paquet.
//
// `NotImplemented` et non `ContractViolation` : un squelette ne dit rien de la
// valeur qu'on lui soumet, il dit que la règle n'est pas écrite. Lever une
// violation de contrat ferait passer le vide pour la garde qu'il ne contient
// pas — c'est la distinction que `packages/contracts/src/not-implemented.ts`
// existe pour tenir.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/**
 * Options d'EXÉCUTION d'une compilation. Elles ne sont jamais un facteur
 * scientifique : `workers` ne doit pas changer une seule identité de cellule
 * (cas T03.A2). Le type reste ouvert tant que l'étage vert ne l'a pas fixé.
 */
export interface CompileOptions {
  readonly [option: string]: unknown
}

/**
 * Compile un manifeste de campagne en cellules d'exécution.
 *
 * SQUELETTE : lève `NotImplemented`. Aucune validation, aucun produit
 * cartésien, aucune empreinte vérifiée.
 */
export function compileCampaignManifest(_manifest: unknown, _options?: CompileOptions): never {
  throw new NotImplemented('domain.compileCampaignManifest')
}
