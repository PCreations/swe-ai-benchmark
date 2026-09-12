// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins — T09 « Fournir les applications témoins et les migrations
// connues ». POINT D'ENTRÉE DU HARNAIS.
//
// Ce module ne contient AUCUNE règle métier. Il publie les trois rôles que la
// suite d'acceptation résout, et rien d'autre :
//   listWitnesses()                         -> catalogue des témoins   (L229)
//   startWitness({ witness, version, dsn }) -> démarre un témoin       (L229)
//   compareBusinessState(observe, attendu)  -> verdict de conformité   (L235)
//
// Le métier vit dans `app/`, exécuté dans un PROCESSUS SÉPARÉ qui parle HTTP et
// écrit dans une base PostgreSQL réelle. Cette séparation n'est pas un choix de
// style : cahier L231, « les témoins sont des PROGRAMMES de test du moteur » ;
// cahier L235, « tests sur PostgreSQL RÉEL ». Un témoin qui vivrait dans le
// processus de la suite pourrait garder son état en mémoire et satisfaire tous
// les énoncés métier sans jamais écrire une ligne.
//
// LA MIGRATION EST UN DÉMARRAGE. Démarrer la version k sur une base qui porte
// les données de la version j < k applique les paliers j+1 … k (voir
// app/migrations.mjs). C'est le seul mécanisme de migration publié, et c'est
// celui que T09.A3 mesure sur 100 réservations créées aux périodes précédentes.
//
// EMPLACEMENT. `verification/tasks.json` déclare pour T09 les `source_paths`
// `fixtures` et `infra`. `fixtures/**` n'est revendiqué par AUCUNE zone de
// `verification/ownership.json` : un chemin hors partition déclenche
// UNCLAIMED_PATHS (fail-closed) et n'entre dans aucun input_digest. La racine
// retenue est donc `infra/temoins/`, zone INFRA.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { catalogue, digestDeLaVersion, fixtureParNom, VERSIONS } from './catalogue.mjs'
import { compareBusinessState } from './compare.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const PROGRAMME = join(ICI, 'app', 'server.mjs')

const DEMARRAGE_MS = 120_000
const ARRET_MS = 15_000

/** Le contrat HTTP public, DÉCLARÉ par le handle : le nom de la route est
 *  libre, l'opération ne l'est pas. */
export const CONTRAT_HTTP = {
  declare_slot: 'POST /slots',
  reserve: 'POST /reservations',
  cancel: 'POST /cancellations',
  export: 'GET /export',
  import: 'POST /import',
}

/** Levée quand l'appel lui-même est mal formé — jamais pour un refus métier. */
export class ContratTemoinViole extends Error {
  constructor(detail) {
    super(`CONTRAT_TEMOIN_VIOLE ${detail}`)
    this.name = 'ContratTemoinViole'
    this.code = 'CONTRAT_TEMOIN_VIOLE'
    this.task = 'T09'
  }
}

/* ════════════════════════════════════════════════════ listWitnesses ════ */

/**
 * Le catalogue : une entrée PLATE par fixture, `{ name, conforming, digest }`,
 * plus les versions disponibles et la description de l'altération. Une seule
 * entrée porte `conforming: true`.
 */
export function listWitnesses() {
  return catalogue()
}

/* ═════════════════════════════════════════════════════ startWitness ════ */

const VIVANTS = new Set()

/** Options PLATES et STRICTES (cahier L80 : propriétés inconnues rejetées). */
function validerOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ContratTemoinViole('startWitness attend un objet plat { witness, version, dsn }')
  }
  const connus = new Set(['witness', 'version', 'dsn'])
  const inconnus = Object.keys(options).filter((k) => !connus.has(k))
  if (inconnus.length > 0) {
    throw new ContratTemoinViole(`proprietes inconnues : ${inconnus.join(', ')}`)
  }
  const { witness, version, dsn } = options
  const fixture = typeof witness === 'string' ? fixtureParNom(witness) : null
  if (fixture === null) {
    throw new ContratTemoinViole(
      `temoin inconnu ${JSON.stringify(witness)} — catalogue : ${catalogue().map((e) => e.name).join(', ')}`,
    )
  }
  if (!Number.isInteger(version) || !VERSIONS.includes(version)) {
    throw new ContratTemoinViole(
      `version ${JSON.stringify(version)} hors des versions publiees ${JSON.stringify(VERSIONS)}`,
    )
  }
  if (typeof dsn !== 'string' || dsn.length === 0) {
    throw new ContratTemoinViole('dsn absent : le temoin ecrit dans une base PostgreSQL reelle')
  }
  return { fixture, version, dsn }
}

/**
 * Démarre un témoin et rend son handle `{ baseUrl, digest, http, stop() }`.
 * La promesse ne se résout QUE lorsque le programme a annoncé son adresse : les
 * migrations sont donc déjà appliquées quand la première requête part.
 */
export function startWitness(options) {
  const { fixture, version, dsn } = validerOptions(options)
  const config = {
    witness: fixture.name,
    version,
    dsn,
    faults: fixture.faults,
  }
  const enfant = spawn(process.execPath, [PROGRAMME, JSON.stringify(config)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  VIVANTS.add(enfant)

  let sortie = ''
  let erreur = ''
  enfant.stdout.setEncoding('utf8')
  enfant.stderr.setEncoding('utf8')
  enfant.stderr.on('data', (c) => {
    erreur += c
  })

  const arreter = () =>
    new Promise((resolve) => {
      VIVANTS.delete(enfant)
      if (enfant.exitCode !== null || enfant.signalCode !== null) return resolve()
      const massue = setTimeout(() => {
        try {
          enfant.kill('SIGKILL')
        } catch {
          /* déjà mort */
        }
      }, ARRET_MS)
      enfant.once('exit', () => {
        clearTimeout(massue)
        resolve()
      })
      try {
        enfant.kill('SIGTERM')
      } catch {
        clearTimeout(massue)
        resolve()
      }
    })

  return new Promise((resolve, reject) => {
    const minuterie = setTimeout(() => {
      void arreter()
      reject(
        new ContratTemoinViole(
          `demarrage de ${fixture.name} v${String(version)} : aucune adresse annoncee en ` +
            `${String(DEMARRAGE_MS)} ms — stdout=${JSON.stringify(sortie.slice(0, 400))} ` +
            `stderr=${JSON.stringify(erreur.slice(0, 400))}`,
        ),
      )
    }, DEMARRAGE_MS)

    let resolu = false
    const fini = (fn) => {
      if (resolu) return
      resolu = true
      clearTimeout(minuterie)
      fn()
    }

    enfant.stdout.on('data', (morceau) => {
      sortie += morceau
      const ligne = sortie.split('\n').find((l) => l.startsWith('BENCH_TEMOIN_READY '))
      if (ligne === undefined) return
      let annonce
      try {
        annonce = JSON.parse(ligne.slice('BENCH_TEMOIN_READY '.length))
      } catch (e) {
        return fini(() => {
          void arreter()
          reject(new ContratTemoinViole(`annonce de demarrage illisible : ${String(e.message)}`))
        })
      }
      fini(() =>
        resolve({
          witness: fixture.name,
          conforming: fixture.conforming,
          version,
          baseUrl: annonce.baseUrl,
          digest: digestDeLaVersion(fixture, version),
          witness_digest: digestDeLaVersion(fixture, version),
          program_digest: annonce.program_digest ?? null,
          dsn,
          pid: enfant.pid,
          schema_from: annonce.schema_from,
          schema_to: annonce.schema_to,
          migrations_applied: annonce.migrations_applied ?? [],
          http: { ...CONTRAT_HTTP },
          stop: arreter,
        }),
      )
    })

    enfant.once('error', (e) => {
      fini(() => {
        VIVANTS.delete(enfant)
        reject(new ContratTemoinViole(`spawn impossible : ${String(e.message)}`))
      })
    })

    enfant.once('exit', (code, signal) => {
      fini(() => {
        VIVANTS.delete(enfant)
        reject(
          new ContratTemoinViole(
            `${fixture.name} v${String(version)} s'est arrete avant d'annoncer son adresse ` +
              `(code=${String(code)} signal=${String(signal)}) : ${erreur.slice(0, 600) || '<stderr vide>'}`,
          ),
        )
      })
    })
  })
}

/** Arrêt global : utile si un handle a été perdu. */
export async function stopWitness(handle) {
  if (handle !== null && typeof handle === 'object' && typeof handle.stop === 'function') {
    await handle.stop()
    return
  }
  for (const enfant of [...VIVANTS]) {
    VIVANTS.delete(enfant)
    try {
      enfant.kill('SIGKILL')
    } catch {
      /* déjà mort */
    }
  }
}

// Filet de sécurité : aucun témoin ne survit au processus qui l'a démarré.
process.on('exit', () => {
  for (const enfant of VIVANTS) {
    try {
      enfant.kill('SIGKILL')
    } catch {
      /* déjà mort */
    }
  }
})

/* ══════════════════════════════════════════════ compareBusinessState ═══ */

export { compareBusinessState }

export default { listWitnesses, startWitness, stopWitness, compareBusinessState, CONTRAT_HTTP }
