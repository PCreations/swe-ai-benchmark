// ─────────────────────────────────────────────────────────────────────────────
// Les refus du stockage.
//
// §A : « les erreurs techniques et les résultats métier sont des champs
// distincts ». Un refus de publication N'EST PAS un plantage : il porte un CODE
// qui nomme sa cause, et le compteur de tentatives réellement consommées.
//
// POURQUOI PAS `ContractViolation`. `@bench/contracts` réserve cette classe aux
// règles de FORME du §E — propriété inconnue, montant mal typé — et T12 s'en
// sert pour ce qu'elle décrit (`envelope.ts`). Un conflit d'idempotence n'est
// pas un défaut de forme : les deux enveloppes sont parfaitement valides, c'est
// leur RENCONTRE qui est refusée. Confondre les deux ferait passer une
// divergence de contenu pour une faute de sérialisation.
//
// POURQUOI LE MESSAGE ÉVITE LE VOCABULAIRE DES PLANTAGES. Le mode de preuve
// `refusal` distingue un refus NOMMÉ d'un `TypeError` : un programme mort
// refuse tout, y compris ce qu'il devrait accepter. Le message d'un
// `StorageRefusal` dit donc ce qui a été refusé et pourquoi, sans emprunter la
// langue des erreurs de programmation.
// ─────────────────────────────────────────────────────────────────────────────

/** Les causes de refus que le stockage sait nommer. */
export const STORAGE_REFUSAL_CODES = [
  /**
   * L199/L68 : même clé d'idempotence, autre empreinte d'entrée. L'état déjà
   * enregistré n'est pas écrasé — c'est la publication entrante qui cède.
   */
  'IDEMPOTENCY_CONFLICT',
  /**
   * L261/A6 : la limite fixée de reprise sur conflit de transaction a été
   * atteinte. `attempts` vaut exactement cette limite.
   */
  'PUBLISH_RETRY_EXHAUSTED',
  /** L141 : point d'injection `BEFORE_COMMIT` — la transaction est annulée. */
  'FAULT_BEFORE_COMMIT',
  /** L141 : point d'injection `AFTER_COMMIT` — le commit a eu lieu. */
  'FAULT_AFTER_COMMIT',
  /** Le serveur ou la connexion a manqué : ni acceptation, ni refus métier. */
  'STORAGE_UNAVAILABLE',
] as const

export type StorageRefusalCode = (typeof STORAGE_REFUSAL_CODES)[number]

/**
 * Refus de stockage. Porte son `code` et le nombre de tentatives consommées :
 * sans ce compteur, « reprise selon une limite fixée » (L261) ne serait pas
 * observable, et la borne ne se distinguerait pas d'une boucle infinie.
 */
export class StorageRefusal extends Error {
  readonly code: StorageRefusalCode
  readonly attempts: number
  readonly detail: string

  constructor(code: StorageRefusalCode, attempts: number, detail: string) {
    super(`${code} : ${detail} [tentatives=${String(attempts)}]`)
    this.name = 'StorageRefusal'
    this.code = code
    this.attempts = attempts
    this.detail = detail
  }
}

export function isStorageRefusal(e: unknown): e is StorageRefusal {
  return e instanceof StorageRefusal
}
