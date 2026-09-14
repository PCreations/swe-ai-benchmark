// ─────────────────────────────────────────────────────────────────────────────
// Les refus des checkpoints coherents (tache T15, cahier L281-L290).
//
// POURQUOI UNE CLASSE DISTINCTE DE `StorageRefusal` ET DE `ArtifactRefusal`.
// Un refus de checkpoint peut naitre a la frontiere entre trois mondes — la
// barriere d'ecriture, le magasin d'artefacts (T13/T14) et l'export/import de
// la base applicative — et §A veut que « les erreurs techniques et les
// resultats metier soient des champs distincts ». Un code de checkpoint nomme
// la cause AU NIVEAU DU CHECKPOINT, meme quand elle est nee plus bas (un objet
// d'artefact absent devient `CHECKPOINT_INCOMPLETE`, pas `ARTIFACT_MISSING` —
// cf. l'en-tete section II de acceptance/T15.spec.ts, qui fixe cette regle de
// traduction sans jamais interdire que la cause plus bas soit nommee ailleurs).
//
// LE SEUL LITTERAL QUE LE CAHIER FIXE : `CHECKPOINT_INCOMPLETE` (L287, objet
// manquant). Pour la corruption, L287 ne fixe aucun nom ; `CHECKPOINT_CORRUPT`
// est une decision d'implementation, documentee ici, qui satisfait le motif
// que la suite tolere (« CHECKPOINT_INCOMPLETE ou equivalent de corruption »).
// ─────────────────────────────────────────────────────────────────────────────

/** Les causes de refus qu'un coordinateur de checkpoint sait nommer. */
export const CHECKPOINT_REFUSAL_CODES = [
  /** L80 : la cible d'ouverture n'est pas `{ admin_dsn, app_database, artifact_store }`. */
  'CHECKPOINT_TARGET_INVALID',
  /** L80 : un argument d'appel (operation, requete, composants) est mal forme. */
  'CHECKPOINT_INPUT_INVALID',
  /**
   * L285/A7 : une ecriture applicative est tentee pendant que la barriere est
   * FERMEE — entre `beginCheckpoint` et le `finishCheckpoint` qui la rouvre.
   */
  'CHECKPOINT_BARRIER_CLOSED',
  /** `beginCheckpoint` est appele alors qu'une fenetre est deja ouverte. */
  'CHECKPOINT_IN_PROGRESS',
  /** Le jeton passe a `finishCheckpoint` n'est pas celui, encore valide, de ce coordinateur. */
  'CHECKPOINT_TOKEN_INVALID',
  /**
   * L287 : le litteral du cahier. Un objet reference par le manifeste est
   * absent du magasin d'artefacts, ou le pointeur de checkpoint lui-meme
   * n'existe pas — remonte au niveau du CHECKPOINT (cf. bandeau ci-dessus).
   */
  'CHECKPOINT_INCOMPLETE',
  /**
   * L287 (A4) : un objet PRESENT ne vaut plus l'empreinte que son manifeste de
   * contenu porte — une corruption, distincte d'une absence.
   */
  'CHECKPOINT_CORRUPT',
  /** La capture (export de la base applicative) a echoue avant tout televersement. */
  'CHECKPOINT_CAPTURE_FAILED',
  /** La restauration du composant `base` sur l'environnement vierge a echoue. */
  'CHECKPOINT_RESTORE_FAILED',
  /** Le serveur ou la connexion a manque : ni acceptation, ni refus metier. */
  'CHECKPOINT_STORAGE_UNAVAILABLE',
] as const

export type CheckpointRefusalCode = (typeof CHECKPOINT_REFUSAL_CODES)[number]

/**
 * Refus de checkpoint. Porte son `code` et `subject` — ce qui a ete refuse,
 * jamais `undefined` — pour qu'un rapport d'echec dise QUOI sans qu'on relise
 * le code, exactement la convention de `ArtifactRefusal` (src/artifact-errors.ts).
 */
export class CheckpointRefusal extends Error {
  readonly code: CheckpointRefusalCode
  readonly detail: string
  readonly subject: string

  constructor(code: CheckpointRefusalCode, detail: string, subject = '') {
    super(subject.length > 0 ? `${code} : ${detail} [${subject}]` : `${code} : ${detail}`)
    this.name = 'CheckpointRefusal'
    this.code = code
    this.detail = detail
    this.subject = subject
  }
}

export function isCheckpointRefusal(e: unknown): e is CheckpointRefusal {
  return e instanceof CheckpointRefusal
}
