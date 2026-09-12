// ─────────────────────────────────────────────────────────────────────────────
// Le seul accès à PostgreSQL de @bench/storage.
//
// POURQUOI `psql` ET PAS UN PILOTE NPM. T00 a scellé `pnpm-lock.yaml` avec des
// versions exactes (cahier §C) ; ajouter un pilote au verrou pour faire passer
// T12 déplacerait une décision de toolchain sous couvert d'implémentation. Le
// client en ligne de commande de PostgreSQL 18 est déjà un prérequis DÉCLARÉ de
// T12 (`requires: postgres18` dans verification/tasks.json), sondé à chaque
// boot par verification/runner/doctor.mjs. C'est la même décision que
// `infra/temoins/app/psql.mjs` a prise pour T09, pour la même raison.
//
// DEUX FORMES D'ACCÈS, ET CE QUI LES SÉPARE.
//
//   `psqlOnce` — un processus, une chaîne, une transaction implicite. Suffit
//   aux migrations et aux lectures : PostgreSQL enveloppe un message Query
//   unique dans sa propre transaction, donc une erreur au milieu annule tout ce
//   qui précède.
//
//   `PsqlSession` — un processus PERSISTANT, dont le `BEGIN` et le `COMMIT`
//   sont pilotés depuis JavaScript. C'est ce que T12 exige et qu'un appel
//   one-shot ne peut pas donner : la convention d'appel IV.4 veut que la
//   BARRIÈRE soit attendue « après l'ouverture de la transaction et AVANT
//   l'écriture décisive » (L141), c'est-à-dire au milieu d'une transaction
//   ouverte. Une transaction qui commence et finit à l'intérieur d'un seul
//   `psql -c` ne laisse aucun point où attendre.
//
// LE DÉCOUPAGE DES RÉPONSES. Après chaque envoi, la session écrit
// `\echo <jeton>` ; le jeton est unique par requête, de sorte qu'une réponse en
// retard ne puisse pas être prise pour la suivante. Mesuré sur PostgreSQL 18.6 :
// `psql` vide sa sortie standard après chaque commande même quand elle est un
// tube, donc le jeton arrive sans attendre la fermeture du processus.
//
// LES ERREURS NE SONT PAS LUES SUR `stderr`, SAUF EN DERNIER RECOURS. Deux
// tubes n'ont pas d'ordre garanti entre eux : faire reposer un verdict sur
// l'arrivée d'une ligne `ERROR:` avant un jeton serait une course. Les
// opérations qui DÉCIDENT quelque chose (la publication) capturent donc leur
// propre issue CÔTÉ SERVEUR, dans un bloc PL/pgSQL qui écrit une ligne de
// résultat ; `stderr` ne sert plus qu'à nommer une panne d'infrastructure quand
// aucune ligne n'est rendue.
//
// LES PARAMÈTRES NE SONT JAMAIS CONCATÉNÉS DANS DU SQL. Ils sont sérialisés en
// JSON puis encodés en base64 — un alphabet sans guillemet ni antislash, donc
// littéralement ininjectable — et redécodés côté serveur. C'est la même règle
// que L285 énonce pour les chemins de fichiers : une valeur fournie de
// l'extérieur n'entre jamais dans une syntaxe par concaténation.
// ─────────────────────────────────────────────────────────────────────────────

import { execFile, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_BUFFER = 64 * 1024 * 1024
const CLOSE_GRACE_MS = 5_000

/** Sortie d'un envoi : les lignes rendues, ou l'erreur qui a empêché de rendre. */
export interface PsqlOutcome {
  readonly ok: boolean
  readonly lines: readonly string[]
  readonly error: string
}

/** Une erreur du serveur, telle que `psql` l'écrit sur sa sortie d'erreur. */
const SERVER_ERROR = /^(ERROR|FATAL|PANIC):/m

/**
 * Encode une valeur en un littéral SQL ininjectable : `convert_from(decode(…))`
 * relit du base64, dont l'alphabet ne contient ni `'` ni `\`.
 */
export function jsonParameter(value: unknown): string {
  const b64 = Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
  return `convert_from(decode('${b64}','base64'),'UTF8')::jsonb`
}

/**
 * Un littéral texte pour une CONSTANTE DU PROGRAMME (nom de migration,
 * empreinte hexadécimale). Jamais pour une valeur venue de l'appelant :
 * celles-là passent par `jsonParameter`.
 */
export function sqlLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/** Un processus, une chaîne, une transaction implicite. */
export function psqlOnce(
  dsn: string,
  sql: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<PsqlOutcome> {
  return new Promise<PsqlOutcome>((resolve) => {
    execFile(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsn, '-c', sql],
      { encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err !== null) {
          const detail = `${String(stderr)}\n${err.message}`.trim()
          resolve({ ok: false, lines: [], error: detail })
          return
        }
        resolve({ ok: true, lines: splitLines(String(stdout)), error: '' })
      },
    )
  })
}

function splitLines(s: string): string[] {
  return s.split('\n').filter((l) => l.length > 0)
}

interface Pending {
  readonly token: string
  readonly resolve: (o: PsqlOutcome) => void
}

/**
 * Une connexion PostgreSQL persistante dont la frontière transactionnelle est
 * pilotée depuis JavaScript.
 *
 * Les envois sont SÉRIALISÉS : un seul est en vol à la fois, sans quoi deux
 * jetons pourraient se croiser dans le même tube. Le pool (`store.ts`) garantit
 * déjà qu'une session n'est prêtée qu'à un appelant ; la chaîne interne est la
 * deuxième clé, celle qui ne dépend pas de l'appelant.
 */
export class PsqlSession {
  static #counter = 0

  readonly #child: ChildProcessWithoutNullStreams
  readonly #id: number
  #stdout = ''
  #stderrSinceSend = ''
  #pending: Pending | null = null
  #chain: Promise<unknown> = Promise.resolve()
  #dead = false
  #deadReason = ''

  constructor(dsn: string) {
    PsqlSession.#counter += 1
    this.#id = PsqlSession.#counter
    this.#child = spawn('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=0', '-d', dsn])
    this.#child.stdout.setEncoding('utf8')
    this.#child.stderr.setEncoding('utf8')
    this.#child.stdout.on('data', (chunk: string) => {
      this.#stdout += chunk
      this.#drain()
    })
    this.#child.stderr.on('data', (chunk: string) => {
      this.#stderrSinceSend += chunk
    })
    this.#child.on('error', (e: Error) => this.#die(`psql injoignable : ${e.message}`))
    this.#child.on('exit', (code, signal) =>
      this.#die(`psql a quitté (code=${String(code)}, signal=${String(signal)})`),
    )
    // Une session muette n'empêche pas le processus Node de se terminer.
    this.#child.unref()
  }

  get alive(): boolean {
    return !this.#dead
  }

  /**
   * Envoie du SQL et rend les lignes produites. `ok` est faux quand la session
   * est morte, ou quand le serveur a écrit une erreur sur sa sortie d'erreur —
   * ce dernier signal sert à NOMMER une panne, jamais à décider d'un refus
   * métier, qui est capturé côté serveur.
   */
  send(sql: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<PsqlOutcome> {
    const run = (): Promise<PsqlOutcome> => this.#sendNow(sql, timeoutMs)
    const next = this.#chain.then(run, run)
    this.#chain = next.catch(() => undefined)
    return next
  }

  #sendNow(sql: string, timeoutMs: number): Promise<PsqlOutcome> {
    if (this.#dead) {
      return Promise.resolve({ ok: false, lines: [], error: this.#deadReason })
    }
    const token = `BENCH_SENTINEL_${String(this.#id)}_${String(PsqlSession.#counter)}_${String(Date.now())}_${String(Math.trunc(Math.random() * 1e9))}`
    this.#stderrSinceSend = ''
    return new Promise<PsqlOutcome>((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.#pending = null
        this.#die(`aucune réponse de psql en ${String(timeoutMs)} ms`)
        resolve({ ok: false, lines: [], error: this.#deadReason })
      }, timeoutMs)
      timer.unref()

      this.#pending = {
        token,
        resolve: (o: PsqlOutcome) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(o)
        },
      }
      this.#child.stdin.write(`${sql}\n\\echo ${token}\n`, (e) => {
        if (e !== null && e !== undefined && !settled) {
          this.#pending = null
          this.#die(`écriture vers psql impossible : ${e.message}`)
          settled = true
          clearTimeout(timer)
          resolve({ ok: false, lines: [], error: this.#deadReason })
        }
      })
    })
  }

  #drain(): void {
    const pending = this.#pending
    if (pending === null) return
    const idx = this.#stdout.indexOf(`${pending.token}\n`)
    if (idx < 0) return
    const before = this.#stdout.slice(0, idx)
    this.#stdout = this.#stdout.slice(idx + pending.token.length + 1)
    this.#pending = null
    // Un tour de boucle laisse arriver un `stderr` émis juste avant le jeton :
    // il ne DÉCIDE de rien (l'issue métier est capturée côté serveur), il NOMME.
    setImmediate(() => {
      const err = this.#stderrSinceSend
      const ok = !SERVER_ERROR.test(err)
      pending.resolve({ ok, lines: splitLines(before), error: ok ? '' : err.trim() })
    })
  }

  #die(reason: string): void {
    if (this.#dead) return
    this.#dead = true
    this.#deadReason = reason
    const pending = this.#pending
    this.#pending = null
    if (pending !== null) pending.resolve({ ok: false, lines: [], error: reason })
  }

  /** Ferme la connexion. Rend la main quand le processus a réellement quitté. */
  async close(): Promise<void> {
    if (this.#dead) return
    await new Promise<void>((resolve) => {
      let done = false
      const finish = (): void => {
        if (done) return
        done = true
        resolve()
      }
      const timer = setTimeout(() => {
        this.#child.kill('SIGKILL')
        finish()
      }, CLOSE_GRACE_MS)
      timer.unref()
      this.#child.on('exit', () => {
        clearTimeout(timer)
        finish()
      })
      try {
        this.#child.stdin.end('\\q\n')
      } catch {
        this.#child.kill('SIGKILL')
        finish()
      }
    })
    this.#die('session fermée')
  }
}
