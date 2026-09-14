// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE — exécuter l'évaluateur sur des copies privées jetables (cahier
// L327-L336, tâche T20). Étage ROUGE : aucune règle métier n'est écrite ici.
//
// Les deux rôles ci-dessous sont ceux que la section III de l'en-tête
// d'`acceptance/T20.spec.ts` publie — le cahier ne nomme aucun export pour ce
// runner (seulement les livrables « runner de validation, runner d'audit et
// canal de retour borné », L327) : ils sont donc FIXÉS PAR LA SUITE, pas lus
// dans le cahier (même geste que T19 fixant `SandboxHandle`, ou T18 fixant
// `INVALID_MODEL_RESPONSE`). Noms primaires sans alias.
//
//   runPrivateEvaluation(input) -> Promise<EvaluationResult>
//       Clone `developerDsn` et `developerFilesDir` dans une copie privée
//       jetable, isolée du développeur (L329 : « ce profil n'hérite ni du
//       credential développeur, ni de la passerelle modèle, ni du miroir
//       documentaire »), y exécute chaque `hiddenTests[].script`, assemble un
//       verdict RÉEL par cas (jamais la prétention de `candidateReportedVerdicts`,
//       A2), détruit la copie, et ne renvoie qu'un `boundedFeedback` qui ne
//       révèle ni chemin ni texte des cas non opérationnels (A4). Le statut
//       `EVALUATION_INCOMPLETE` (cahier:L333, L97) couvre une exécution
//       tronquée (`simulateTruncatedExecution`, point d'injection nommé,
//       cahier L141) — jamais un succès prétendu (A6).
//   listEvaluationScenarioIds(kind) -> Promise<string[]>
//       Le jeu de scénarios CANONIQUE affecté à `validation`, resp. à
//       `audit` — indépendant de tout `hiddenTests` fourni par l'appelant, de
//       sorte que A3 (jeux distincts) ne puisse pas être satisfait par
//       construction (deux jeux vides seraient disjoints à tort).
//
// CE QUE CE SQUELETTE NE PRÉTEND PAS FAIRE. Aucun des deux rôles ne rend de
// valeur plausible : chacun lève immédiatement `NotImplemented`
// (`@bench/contracts`, préfixe `NOT_IMPLEMENTED` que
// `verification/runner/red.mjs` sait lire). Les sept cas de T20 restent
// ROUGES malgré tout : `acceptance/T20.spec.ts` appelle ces deux rôles à
// travers `essayer()`, note l'échec avec un message NOMMÉ
// (EVALUATION-EN-ECHEC / JEU-VALIDATION-EN-ECHEC / JEU-AUDIT-EN-ECHEC), et
// chaque cas échoue donc AVANT d'atteindre son assertion principale — pas un
// faux vert (verification/mutants/T20.json).
//
// Ce fichier ne touche à aucun rôle des tâches T10 (déjà publiés par ce même
// paquet, `mutants.ts`/`index.ts`) ni T19 (`packages/sandbox`) : il les
// COMPOSERA à l'étage VERT (le clonage de la copie privée s'appuiera sur
// `provisionSandbox`/`SandboxHandle` de `@bench/sandbox`, cf. T19), mais
// aucune dépendance n'est ajoutée tant que ces rôles ne sont pas appelés.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Un cas caché fourni par l'appelant (section III.1). */
export interface HiddenTestCase {
  readonly caseId: string
  /** Exécuté via `/bin/sh -c "<script>"` DANS la copie privée isolée. */
  readonly script: string
  /** Cas dont le verdict peut être montré au développeur (retour borné, A4). */
  readonly operational?: boolean
  /** Chemin FACTICE du fichier de test — NE DOIT JAMAIS apparaître dans `boundedFeedback`. */
  readonly hiddenFilePath?: string
}

/** Une prétention de verdict émise par le CANDIDAT — sans aucun effet (A2). */
export interface CandidateReportedVerdict {
  readonly caseId: string
  readonly passed: boolean
}

/** Une destination autorisée en liste blanche d'egress pour la copie privée (A7). */
export interface AllowedEgressEntry {
  readonly label: string
  readonly host: string
  readonly port: number
}

/** Entrée de `runPrivateEvaluation` (section III.1). */
export interface PrivateEvaluationInput {
  readonly trajectoryId: string
  readonly kind: 'validation' | 'audit'
  /** PostgreSQL RÉEL, état produit persistant et visible au développeur (L329). */
  readonly developerDsn: string
  /** Hôte, fichiers persistants du produit, visibles au développeur. */
  readonly developerFilesDir: string
  /** Hôte, logs relisibles par le développeur APRÈS l'évaluation. */
  readonly developerLogsDir: string
  readonly hiddenTests: readonly HiddenTestCase[]
  readonly candidateReportedVerdicts?: readonly CandidateReportedVerdict[]
  readonly allowedEgress?: readonly AllowedEgressEntry[]
  /** Point d'injection NOMMÉ (cahier L141 : pas de course de temps). */
  readonly simulateTruncatedExecution?: boolean
}

/** Un verdict RÉELLEMENT observé — jamais la prétention du candidat (A2). */
export interface EvaluationVerdict {
  readonly caseId: string
  readonly passed: boolean
  readonly origin?: string
}

/** Rendu de `runPrivateEvaluation` (section III.1). */
export interface EvaluationResult {
  /** cahier:L97, L333 — jamais un succès prétendu pour une exécution tronquée (A6). */
  readonly status: 'COMPLETED' | 'EVALUATION_INCOMPLETE'
  readonly reason?: string
  readonly verdicts: readonly EvaluationVerdict[]
  /** Sérialisable JSON — ne révèle ni `hiddenFilePath` ni texte des cas non opérationnels (A4). */
  readonly boundedFeedback: unknown
  readonly privateCopyDestroyed: boolean
}

/**
 * Exécute les `hiddenTests` sur une copie privée jetable du checkpoint
 * développeur, dans une frontière d'accès distincte (L329).
 */
export function runPrivateEvaluation(_input: PrivateEvaluationInput): Promise<EvaluationResult> {
  throw new NotImplemented('evaluation.runPrivateEvaluation')
}

/**
 * Le jeu de scénarios CANONIQUE que le runner affecte à `kind`
 * (`validation` xor `audit`, A3) — indépendant de tout `hiddenTests` fourni
 * par l'appelant.
 */
export function listEvaluationScenarioIds(_kind: 'validation' | 'audit'): Promise<string[]> {
  throw new NotImplemented('evaluation.listEvaluationScenarioIds')
}
