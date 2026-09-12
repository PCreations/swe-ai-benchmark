// ─────────────────────────────────────────────────────────────────────────────
// @bench/evaluation — qualifier les oracles et détecter les tests défectueux
// (cahier L237-L244, tâche T10).
//
// LES HUIT RÔLES PUBLICS, ET CE QU'ILS RÉPONDENT DÉSORMAIS.
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
// LES TROIS LIVRABLES DE L239, ET OÙ ILS VIVENT.
//   • le PIPELINE DE QUALIFICATION a deux volets, parce que L241 lui donne deux
//     sujets : des TÉMOINS (des programmes — `witness.ts`, `controls.ts`) et des
//     SCÉNARIOS (des assertions — `scenario.ts`). Le premier exécute, le second
//     confronte ;
//   • le REGISTRE DE MUTANTS SÉMANTIQUES est `mutants.ts` : six altérations de
//     source nommées, une par faute obligatoire de L241 ;
//   • la FILE DE QUARANTAINE est tenue par `scenario.ts`, et c'est elle — non une
//     opinion locale — qui décide de ce qui n'entre pas au manifeste.
//
// CE QUE CE PAQUET NE FAIT PAS, ET POURQUOI CE N'EST PAS UN MANQUE.
//   • Il n'écrit AUCUN fichier de matrice. L243 demande la matrice
//     « enregistrée », pas persistée : prescrire un format de stockage ferait
//     mesurer un artefact à la place de l'enregistrement.
//   • Il n'invente aucune règle métier. La capacité, le FIFO, la frontière des
//     24 h et le cloisonnement viennent de `@bench/oracle` (T07) pour le volet
//     scénario, et du programme témoin de T09 pour le volet exécution. Un
//     troisième juge écrit ici aurait pu diverger des deux autres — et un juge
//     qui diverge ne qualifie plus rien.
//   • Il ne lit jamais `acceptance/**`. Les paramètres du contrat qu'il exerce
//     sont relevés dans le cahier (`reference.ts`), jamais dans la fixture qui
//     le juge.
// ─────────────────────────────────────────────────────────────────────────────

/* ── refus d'APPEL, jamais de verdict ───────────────────────────────────── */
export {
  QUALIFICATION_ERROR_KINDS,
  QualificationViolation,
  isQualificationViolation,
} from './errors.js'
export type { QualificationErrorKind } from './errors.js'

/* ── les paramètres de contrat relevés dans le cahier ───────────────────── */
export {
  DELAI_ANNULATION_HEURES,
  FRONTIERE_INCLUSE,
  LOCATAIRE_ETRANGER,
  LOCATAIRE_PRINCIPAL,
  VERSION_INITIALE,
  VERSION_MULTI_LOCATAIRE,
} from './reference.js'

/* ── registre des mutants sémantiques (L239) ────────────────────────────── */
import { SEMANTIC_MUTANTS } from './mutants.js'

export { SEMANTIC_MUTANTS, mutantByName } from './mutants.js'
export type { SemanticMutant, SourceEdit } from './mutants.js'

/** Une entrée PUBLIÉE du registre : plate, et sans le détail des éditions. */
export interface SemanticMutantEntry {
  readonly name: string
  readonly fault: string
  readonly control: string
  readonly description: string
  readonly cahier_line: number
}

/** Le registre publié : une entrée par faute obligatoire de L241. */
export function listSemanticMutants(): SemanticMutantEntry[] {
  return SEMANTIC_MUTANTS.map((m) => ({
    name: m.name,
    fault: m.fault,
    control: m.control,
    description: m.description,
    cahier_line: m.cahier_line,
  }))
}

/* ── les six contrôles nommés (L241) ────────────────────────────────────── */
export {
  CONTROL_CAPACITE,
  CONTROL_CLOISONNEMENT,
  CONTROL_FIFO,
  CONTROL_FRONTIERE,
  CONTROL_IDEMPOTENCE,
  CONTROL_MIGRATION,
  CONTROL_ORDER,
} from './controls.js'
export type { ControlOutcome } from './controls.js'

/* ── pipeline de qualification, volet témoin (L239, L241, L243) ─────────── */
export { listControls, qualifyWitness } from './witness.js'
export type { QualifyWitnessInput, WitnessQualificationReport } from './witness.js'

/* ── pipeline de qualification, volet scénario, et file de quarantaine ──── */
export {
  ISSUE_ACCEPTEE,
  ISSUE_REFUSEE,
  SCENARIO_SCHEMA,
  listQuarantine,
  qualifyScenario,
} from './scenario.js'
export type {
  QualificationScenario,
  QualificationScenarioStep,
  QuarantineEntry,
  ScenarioQualificationReport,
  StepVerdict,
} from './scenario.js'

/* ── dix répétitions (L243) ─────────────────────────────────────────────── */
export { REPETITIONS_PAR_DEFAUT, detectInstability } from './instability.js'
export type { InstabilityInput, InstabilityReport } from './instability.js'

/* ── manifeste confirmatoire et export des exclusions (L111, L241) ──────── */
export { buildConfirmatoryManifest, exportExclusions } from './manifest.js'
export type { ConfirmatoryManifest, ExclusionShare, ManifestCase } from './manifest.js'

/* ── matrice témoin/mutant/contrôle (L243) ──────────────────────────────── */
export { qualificationMatrix } from './matrix.js'
export type { MatrixRow } from './matrix.js'
