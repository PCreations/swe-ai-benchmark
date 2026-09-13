// ─────────────────────────────────────────────────────────────────────────────
// Les refus du stockage d'artefacts (tâche T13, cahier L265-L272).
//
// POURQUOI UNE CLASSE DISTINCTE DE `StorageRefusal`.
// `StorageRefusal` (src/errors.ts) nomme les refus du schéma central : conflit
// d'idempotence, reprise épuisée, serveur absent. Les refus d'artefacts vivent
// dans un autre monde — un objet corrompu, un objet absent, une entrée
// d'archive qui sort de sa destination — et leur champ `attempts` n'aurait
// aucun sens. Deux vocabulaires séparés valent mieux qu'un code fourre-tout :
// §A du cahier veut que « les erreurs techniques et les résultats métier
// soient des champs distincts », et un refus d'artefact est un résultat, pas
// une panne.
//
// POURQUOI UN CODE, ET PAS SEULEMENT UN MESSAGE.
// L269 fixe littéralement deux noms — `ARTIFACT_CORRUPT` et `ARTIFACT_MISSING`
// — et rien d'autre. Un refus qui ne se nomme pas est indistinguable d'un
// plantage : c'est précisément la confusion que le mode de preuve `refusal`
// interdit (verification/cases.lock.json : « un stub qui lève rendrait le cas
// VERT sans rien prouver »). Chaque refus ci-dessous porte donc son code en
// propriété ET dans son message, de sorte qu'aucun lecteur — humain ou
// vérificateur — n'ait à deviner la cause.
//
// POURQUOI LE MESSAGE N'EMPRUNTE PAS LA LANGUE DES PLANTAGES.
// Aucun message ne recopie un code errno (`ENOENT`, `EACCES`) ni un nom
// d'erreur de programmation : un refus qui se déguiserait en panne système
// ferait passer un bug pour une règle appliquée.
// ─────────────────────────────────────────────────────────────────────────────

/** Les causes de refus que le stockage d'artefacts sait nommer. */
export const ARTIFACT_REFUSAL_CODES = [
  /** L269 : lecture d'un objet dont les octets ne valent plus leur empreinte. */
  'ARTIFACT_CORRUPT',
  /** L269 : lecture d'un objet qu'aucun fichier final ne porte sous ce magasin. */
  'ARTIFACT_MISSING',
  /** L271 : la limite de taille déclarée serait dépassée par cette écriture. */
  'ARTIFACT_TOO_LARGE',
  /** L141 : un point d'injection nommé a coupé l'écriture avant sa publication. */
  'ARTIFACT_WRITE_INTERRUPTED',
  /**
   * L279 : le stockage a refusé l'autorisation. C'est le refus qu'une identité
   * limitée par usage rencontre hors de son périmètre — il est prononcé par le
   * SERVICE, jamais par une comparaison de préfixe côté client, et il ne se
   * confond pas avec `ARTIFACT_MISSING` : « je n'ai pas le droit de le voir »
   * n'est pas « il n'existe pas ».
   */
  'ARTIFACT_ACCESS_DENIED',
  /**
   * L277 (A5) : l'autorisation ouverte sur ce magasin a pris fin. Le refus est
   * EXPLICITE et la lecture ne rend aucun octet : un repli anonyme qui servirait
   * quand même la charge utile est exactement ce que le cas interdit.
   */
  'ARTIFACT_AUTHORIZATION_EXPIRED',
  /** Le service objet n'a pas répondu. Une panne n'est jamais un objet absent. */
  'ARTIFACT_SERVICE_UNREACHABLE',
  /** Le service objet a refusé l'opération pour une cause qu'il nomme lui-même. */
  'ARTIFACT_SERVICE_REFUSED',
  /** L275 : aucun service S3 de test local n'est déclaré ni découvrable. */
  'ARTIFACT_S3_SERVICE_UNDECLARED',
  /** L80 : la cible d'ouverture n'est pas `{ root }` sur un répertoire existant. */
  'ARTIFACT_STORE_INVALID',
  /** L80 : les octets ou les options d'écriture ne respectent pas le contrat. */
  'ARTIFACT_INPUT_INVALID',
  /** La référence lue n'a pas la forme qu'une écriture publie. */
  'ARTIFACT_REF_INVALID',
  /** L269 : une entrée d'archive porte un chemin absolu. */
  'ARCHIVE_ENTRY_ABSOLUTE_PATH',
  /** L269 : une entrée d'archive remonte par `..` (le cas `../escape`). */
  'ARCHIVE_ENTRY_PATH_TRAVERSAL',
  /** L269 : une entrée d'archive se résout hors du répertoire de destination. */
  'ARCHIVE_ENTRY_OUTSIDE_DESTINATION',
  /** L269 : une entrée d'archive est un lien dont la cible sort de la destination. */
  'ARCHIVE_ENTRY_SYMLINK_ESCAPE',
  /** L269 : une entrée passerait par un lien déclaré plus haut dans l'archive. */
  'ARCHIVE_ENTRY_PATH_THROUGH_SYMLINK',
  /** Type d'entrée tar que cet extracteur ne sait pas poser sûrement. */
  'ARCHIVE_ENTRY_UNSUPPORTED_TYPE',
  /** L271 : une entrée d'archive dépasse la limite de taille déclarée. */
  'ARCHIVE_ENTRY_TOO_LARGE',
  /** En-tête tar illisible : somme de contrôle, taille ou nom hors format. */
  'ARCHIVE_HEADER_INVALID',
  /** L'archive elle-même est introuvable ou illisible. */
  'ARCHIVE_UNREADABLE',
  /** La destination d'extraction n'est pas un répertoire existant. */
  'ARCHIVE_DESTINATION_INVALID',
] as const

export type ArtifactRefusalCode = (typeof ARTIFACT_REFUSAL_CODES)[number]

/**
 * Refus d'artefact. Le `code` est la cause ; `subject` nomme ce qui a été
 * refusé — une référence de contenu, une entrée d'archive, un chemin —, de
 * sorte qu'un rapport d'échec dise QUOI sans qu'on relise le code.
 *
 * `subject` vaut la chaîne vide quand rien de précis n'est en cause : jamais
 * `undefined`, pour que la forme du refus soit la même à chaque fois.
 */
export class ArtifactRefusal extends Error {
  readonly code: ArtifactRefusalCode
  readonly detail: string
  readonly subject: string

  constructor(code: ArtifactRefusalCode, detail: string, subject = '') {
    super(subject.length > 0 ? `${code} : ${detail} [${subject}]` : `${code} : ${detail}`)
    this.name = 'ArtifactRefusal'
    this.code = code
    this.detail = detail
    this.subject = subject
  }
}

export function isArtifactRefusal(e: unknown): e is ArtifactRefusal {
  return e instanceof ArtifactRefusal
}
