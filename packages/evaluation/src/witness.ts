// ─────────────────────────────────────────────────────────────────────────────
// LE PIPELINE DE QUALIFICATION, VOLET TÉMOIN (livrable L239).
//
// `qualifyWitness({ witness, dsn })` fait tourner un PROGRAMME contre la base
// PostgreSQL que l'appelant lui désigne, puis rend un verdict.
//
// CE QUE LE VERDICT REPOSE SUR, ET CE QU'IL NE REPOSE PAS SUR.
//
//  • Il repose sur SIX CONTRÔLES NOMMÉS exécutés contre le programme démarré.
//    Un témoin est ACCEPTÉ quand les six sont satisfaits, REJETÉ dès qu'un seul
//    ne l'est pas — et le rapport NOMME celui-là (L241).
//  • Il ne repose sur AUCUN drapeau du catalogue. Le pipeline ne demande jamais
//    « ce témoin est-il conforme ? » : il l'exécute. Lire `conforming` pour
//    décider du verdict serait qualifier sur papier, ce que L141 refuse et ce
//    que T10.M12 mute.
//
// DEUX DÉMARRAGES, UNE SEULE BASE. Le premier au palier initial, le second au
// palier multi-locataire SUR LA MÊME base : c'est la migration connue de T09
// (L231), et c'est aussi ce qui garantit que la base FOURNIE porte des lignes —
// L559 (« chaque suite d'intégration reçoit un `test_run_id` technique unique et
// ses propres bases ») ne veut rien dire si le programme écrit ailleurs.
//
// `started` EST OBSERVÉ, JAMAIS SUPPOSÉ. Il vaut `true` seulement si les deux
// démarrages ont annoncé leur adresse. Un programme qui ne démarre pas est
// REJETÉ par un contrôle nommé `controle-de-demarrage`, qui n'est AUCUNE des
// six fautes métier : L243 refuse explicitement qu'un mutant « détecté » le soit
// parce qu'il plante avant de tourner.
// ─────────────────────────────────────────────────────────────────────────────
import {
  CONTROL_ORDER,
  controleCapacite,
  controleCloisonnement,
  controleFifo,
  controleFrontiere,
  controleIdempotence,
  controleIntegriteMigration,
  semerAvantMigration,
  type ControlOutcome,
} from './controls.js'
import {
  QualificationViolation,
  requireExactKeys,
  requireFlatObject,
  requireNonEmptyString,
} from './errors.js'
import { recordMatrixRow, qualificationMatrix, type MatrixRow } from './matrix.js'
import { mutantByName, type SemanticMutant } from './mutants.js'
import {
  materializeMutant,
  startCatalogueWitness,
  startProgram,
  type WitnessHandle,
} from './program.js'
import { VERSION_INITIALE, VERSION_MULTI_LOCATAIRE } from './reference.js'

/** Convention d'appel III.1 : objet PLAT et STRICT (L80). */
export interface QualifyWitnessInput {
  readonly witness: string
  readonly dsn: string
}

/** Convention d'appel III.2 : le rapport de qualification d'un témoin. */
export interface WitnessQualificationReport {
  readonly schema: 'bench.qualification.witness/1'
  readonly witness: string
  readonly kind: 'temoin' | 'mutant'
  readonly fault: string | null
  readonly verdict: 'ACCEPTE' | 'REJETE'
  readonly started: boolean
  readonly control: string | null
  readonly reason: string | null
  readonly dsn: string
  readonly versions: readonly number[]
  readonly controls: readonly ControlOutcome[]
  readonly matrix: readonly MatrixRow[]
}

/** Le contrôle qui nomme un échec de DÉMARRAGE — et aucune faute métier. */
const CONTROL_DEMARRAGE = 'controle-de-demarrage'

type Lanceur = (version: number) => Promise<WitnessHandle>

function lanceurDeMutant(mutant: SemanticMutant, dsn: string): { lancer: Lanceur; jeter: () => void } {
  const copie = materializeMutant(mutant)
  return {
    lancer: (version: number): Promise<WitnessHandle> =>
      startProgram(copie.server, {
        witness: mutant.name,
        version,
        dsn,
        faults: {},
      }),
    jeter: copie.dispose,
  }
}

function lanceurDeCatalogue(witness: string, dsn: string): { lancer: Lanceur; jeter: () => void } {
  return {
    lancer: (version: number): Promise<WitnessHandle> =>
      startCatalogueWitness(witness, version, dsn),
    jeter: (): void => {
      /* le catalogue de T09 n'a rien materialise */
    },
  }
}

/**
 * Exécute les six contrôles. Les cinq derniers tournent sur l'instance migrée ;
 * le premier a besoin des deux paliers, et c'est lui qui les enchaîne.
 */
async function executerControles(lancer: Lanceur): Promise<{
  controls: ControlOutcome[]
  started: boolean
  demarrageEchoue: string
}> {
  let initial: WitnessHandle
  try {
    initial = await lancer(VERSION_INITIALE)
  } catch (e) {
    return { controls: [], started: false, demarrageEchoue: String((e as Error).message) }
  }
  let semis = ''
  try {
    semis = await semerAvantMigration(initial)
  } catch (e) {
    semis = `le palier initial n'a pas repondu : ${String((e as Error).message).slice(0, 300)}`
  } finally {
    await initial.stop()
  }

  let migre: WitnessHandle
  try {
    migre = await lancer(VERSION_MULTI_LOCATAIRE)
  } catch (e) {
    return { controls: [], started: false, demarrageEchoue: String((e as Error).message) }
  }

  const controls: ControlOutcome[] = []
  try {
    controls.push(await controleIntegriteMigration(migre, semis))
    controls.push(await controleCapacite(migre))
    controls.push(await controleIdempotence(migre))
    controls.push(await controleFifo(migre))
    controls.push(await controleFrontiere(migre))
    controls.push(await controleCloisonnement(migre))
  } finally {
    await migre.stop()
  }
  return { controls, started: true, demarrageEchoue: '' }
}

/**
 * Qualifie un témoin. Rend TOUJOURS un rapport quand le programme a pu être
 * lancé ; ne LÈVE que pour un refus d'APPEL (nom inconnu, entrée mal formée,
 * mutation inapplicable) — jamais pour un refus métier.
 */
export async function qualifyWitness(input: QualifyWitnessInput): Promise<WitnessQualificationReport> {
  const o = requireFlatObject(input, '/qualifyWitness')
  requireExactKeys(o, ['witness', 'dsn'], [], '/qualifyWitness')
  const witness = requireNonEmptyString(o, 'witness', '/qualifyWitness')
  const dsn = requireNonEmptyString(o, 'dsn', '/qualifyWitness')

  const mutant = mutantByName(witness)
  const { lancer, jeter } =
    mutant === null ? lanceurDeCatalogue(witness, dsn) : lanceurDeMutant(mutant, dsn)

  const resultat = await executerControles(lancer).finally(jeter)
  const { controls, started, demarrageEchoue } = resultat

  if (!started) {
    const rapport: WitnessQualificationReport = {
      schema: 'bench.qualification.witness/1',
      witness,
      kind: mutant === null ? 'temoin' : 'mutant',
      fault: mutant === null ? null : mutant.fault,
      verdict: 'REJETE',
      started: false,
      control: CONTROL_DEMARRAGE,
      reason: `le programme n'a pas demarre : ${demarrageEchoue.slice(0, 400)}`,
      dsn,
      versions: [VERSION_INITIALE, VERSION_MULTI_LOCATAIRE],
      controls: [],
      matrix: [],
    }
    recordMatrixRow({
      kind: 'observee',
      witness,
      mutant: mutant === null ? null : mutant.name,
      fault: mutant === null ? null : mutant.fault,
      control: CONTROL_DEMARRAGE,
      expected_verdict: mutant === null ? 'ACCEPTE' : 'REJETE',
      observed_verdict: 'REJETE',
      started: false,
      detail: rapport.reason ?? '',
    })
    return { ...rapport, matrix: qualificationMatrix() }
  }

  const manquant = controls.find((c) => !c.satisfied) ?? null
  const verdict = manquant === null ? 'ACCEPTE' : 'REJETE'

  recordMatrixRow({
    kind: 'observee',
    witness,
    mutant: mutant === null ? null : mutant.name,
    fault: mutant === null ? null : mutant.fault,
    control: manquant === null ? null : manquant.control,
    expected_verdict: mutant === null ? 'ACCEPTE' : 'REJETE',
    observed_verdict: verdict,
    started: true,
    detail: manquant === null ? 'les six controles sont satisfaits' : manquant.detail,
  })

  return {
    schema: 'bench.qualification.witness/1',
    witness,
    kind: mutant === null ? 'temoin' : 'mutant',
    fault: mutant === null ? null : mutant.fault,
    verdict,
    started: true,
    control: manquant === null ? null : manquant.control,
    reason: manquant === null ? null : manquant.detail,
    dsn,
    versions: [VERSION_INITIALE, VERSION_MULTI_LOCATAIRE],
    controls,
    matrix: qualificationMatrix(),
  }
}

/** Les six contrôles, dans leur ordre d'exécution — pour un lecteur de rapport. */
export function listControls(): readonly string[] {
  return CONTROL_ORDER
}

/** Réexporté pour les appelants qui distinguent refus d'appel et verdict. */
export { QualificationViolation }
