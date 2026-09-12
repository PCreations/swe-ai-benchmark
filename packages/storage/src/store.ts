// ─────────────────────────────────────────────────────────────────────────────
// Le repository du schéma central : un handle, un pool de connexions
// persistantes, un arrêt OBSERVABLE.
//
// POURQUOI UN POOL, ET PAS UNE CONNEXION. A2 et A6 publient VINGT fois
// concurremment (L261) après une barrière qui ne libère qu'une fois les vingt
// appelants arrivés. Vingt transactions simultanées exigent vingt sessions :
// une connexion unique les sérialiserait avant même que la barrière ne
// s'ouvre, et le test deviendrait moins concurrent sans le dire.
//
// POURQUOI L'ARRÊT EST UNE MÉTHODE DU HANDLE. A1 exige que l'arrêt soit
// observé, pas supposé : « ARRET-DU-STORE-IMPOSSIBLE » est une assertion, pas
// une tolérance. `close()` attend la sortie effective de CHAQUE processus
// `psql` ouvert par ce store — prêté ou au repos ; tant qu'elle n'a pas rendu
// la main, la reconnexion ne prouverait rien.
//
// POURQUOI L'ÉTAT INTERNE EST EN CHAMPS PRIVÉS. Le handle traverse une
// frontière : il est rendu à l'appelant, qui peut l'inspecter, le sérialiser,
// l'imprimer dans un message d'échec. Les champs `#privés` d'ECMAScript ne sont
// pas énumérables — le handle se rend donc comme `{ dsn }`, et aucun détail de
// plomberie ne fuit dans une trace.
// ─────────────────────────────────────────────────────────────────────────────

import { PsqlSession } from './psql.js'

/** Connexions simultanées qu'un store ouvre au plus (PostgreSQL : 100 au total). */
const MAX_SESSIONS = 24

/** Connexions gardées ouvertes au repos ; au-delà, une session rendue est fermée. */
const IDLE_KEPT = 4

type Waiter = (s: PsqlSession | null) => void

/**
 * Repository du schéma central.
 *
 * Ce n'est pas une façade sur une base : c'est le porteur de la frontière
 * transactionnelle. `publishPeriodResult` lui emprunte une session, ouvre la
 * transaction, attend la barrière, écrit, puis décide de commiter ou d'annuler
 * — ce que `psql -c`, dont la transaction commence et finit dans le même
 * processus, ne permet pas.
 */
export class CentralStore {
  readonly dsn: string

  #idle: PsqlSession[] = []
  readonly #all = new Set<PsqlSession>()
  #waiters: Waiter[] = []
  #closed = false

  constructor(dsn: string) {
    this.dsn = dsn
  }

  get closed(): boolean {
    return this.#closed
  }

  #spawn(): PsqlSession {
    const s = new PsqlSession(this.dsn)
    this.#all.add(s)
    return s
  }

  #discard(s: PsqlSession): void {
    this.#all.delete(s)
    void s.close()
  }

  /** Emprunte une session. Attend si les `MAX_SESSIONS` sont déjà prêtées. */
  async acquire(): Promise<PsqlSession> {
    for (;;) {
      if (this.#closed) throw new Error('repository fermé : aucune session à emprunter')
      const reused = this.#idle.pop()
      if (reused !== undefined) {
        if (reused.alive) return reused
        this.#discard(reused)
        continue
      }
      if (this.#all.size < MAX_SESSIONS) return this.#spawn()
      const handed = await new Promise<PsqlSession | null>((resolve) => {
        this.#waiters.push(resolve)
      })
      if (handed === null) throw new Error('repository fermé pendant l attente d une session')
      if (handed.alive) return handed
      this.#discard(handed)
    }
  }

  /**
   * Rend une session. `healthy` est faux quand la session a perdu sa
   * connexion : on ne la remet pas en circulation, parce qu'une session morte
   * rendrait un refus qui n'en est pas un.
   */
  release(session: PsqlSession, healthy: boolean): void {
    if (this.#closed) {
      this.#discard(session)
      return
    }
    if (!healthy || !session.alive) {
      this.#discard(session)
      const orphan = this.#waiters.shift()
      if (orphan !== undefined) orphan(this.#spawn())
      return
    }
    const waiter = this.#waiters.shift()
    if (waiter !== undefined) {
      waiter(session)
      return
    }
    if (this.#idle.length >= IDLE_KEPT) {
      this.#discard(session)
      return
    }
    this.#idle.push(session)
  }

  /** Arrêt observable (A1) : rend la main quand chaque `psql` a quitté. */
  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.#idle = []
    const waiters = this.#waiters
    this.#waiters = []
    for (const w of waiters) w(null)
    const sessions = [...this.#all]
    this.#all.clear()
    await Promise.all(sessions.map(async (s) => s.close()))
  }
}

export function isCentralStore(v: unknown): v is CentralStore {
  return v instanceof CentralStore
}
