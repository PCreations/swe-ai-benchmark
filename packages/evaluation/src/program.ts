// ─────────────────────────────────────────────────────────────────────────────
// DÉMARRER UN TÉMOIN, ET SAVOIR QU'IL A DÉMARRÉ.
//
// L243 : « il ne suffit pas que le mutant plante au build : le programme doit
// DÉMARRER PUIS ÉCHOUER sur la propriété ciblée ». Ce fichier est l'endroit où
// « démarrer » devient une observation et non une supposition : un témoin n'est
// démarré que lorsqu'il a ANNONCÉ SON ADRESSE sur stdout. Tant que cette ligne
// n'est pas lue, `started` reste faux et le pipeline le dit.
//
// DEUX LANCEURS, UN SEUL PROTOCOLE.
//   • les témoins du catalogue de T09 sont démarrés par T09 lui-même
//     (`startWitness`), c'est-à-dire par le contrat déjà validé de la
//     dépendance (L147). T10 ne réimplémente pas le démarrage d'un témoin qu'il
//     n'a pas écrit.
//   • les MUTANTS de T10 sont démarrés par T10, depuis une COPIE ÉDITÉE du
//     programme de T09 posée dans un répertoire jetable. Le protocole de
//     démarrage est celui que le programme publie (`BENCH_TEMOIN_READY <json>`),
//     donc le même des deux côtés — sans quoi la comparaison témoin/mutant
//     mesurerait deux harnais, pas deux programmes.
//
// LE CHARGEMENT DE T09 EST DYNAMIQUE, ET C'EST DÉLIBÉRÉ. `infra/temoins` est du
// JavaScript de zone INFRA ; l'importer statiquement depuis un paquet
// TypeScript compilé sous `rootDir: src` ferait sortir `tsc` de son projet. Le
// contrat utilisé se réduit à ce que l'en-tête de `infra/temoins/index.mjs`
// publie : `startWitness({ witness, version, dsn })` rend un handle portant
// `baseUrl` et `stop()`.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { QualificationViolation } from './errors.js'
import { applyEdit, type SemanticMutant } from './mutants.js'

/** Les fichiers qui constituent le programme témoin de T09. */
const FICHIERS_DU_PROGRAMME = ['psql.mjs', 'migrations.mjs', 'operations.mjs', 'server.mjs'] as const

const DEMARRAGE_MS = 120_000
const ARRET_MS = 15_000

/** Handle d'un témoin démarré : ce que le pipeline en observe, et rien de plus. */
export interface WitnessHandle {
  readonly baseUrl: string
  readonly witness: string
  readonly version: number
  stop(): Promise<void>
}

/* ─────────────────────────────────────────────── racine du dépôt */

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

const REPO = repoRoot()

/** Le programme témoin de T09, tel qu'il est sur disque. */
export function temoinAppDir(): string {
  return resolve(REPO, 'infra', 'temoins', 'app')
}

/** Le point d'entrée du harnais de T09 (`listWitnesses`, `startWitness`). */
function temoinHarnessEntry(): string {
  return resolve(REPO, 'infra', 'temoins', 'index.mjs')
}

/* ─────────────────────────────────── matérialisation d'un mutant */

export interface MaterializedMutant {
  readonly dir: string
  readonly server: string
  readonly edits: readonly string[]
  dispose(): void
}

/**
 * Copie le programme témoin dans un répertoire jetable et y applique les
 * éditions du mutant. La copie N'EST PAS un fork : tout fichier non édité est
 * recopié octet pour octet, de sorte que la seule différence observable entre
 * le mutant et le témoin conforme soit la faute que le mutant annonce.
 */
export function materializeMutant(mutant: SemanticMutant): MaterializedMutant {
  const source = temoinAppDir()
  for (const f of FICHIERS_DU_PROGRAMME) {
    const p = join(source, f)
    if (!existsSync(p) || !statSync(p).isFile()) {
      throw new QualificationViolation(
        'MUTATION_NOT_APPLICABLE',
        `/programme/${f}`,
        `programme temoin introuvable sous ${source}`,
      )
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'bench-t10-mutant-'))
  const contenus = new Map<string, string>()
  for (const f of FICHIERS_DU_PROGRAMME) contenus.set(f, readFileSync(join(source, f), 'utf8'))

  const journal: string[] = []
  for (const edit of mutant.edits) {
    const avant = contenus.get(edit.file)
    if (avant === undefined) {
      throw new QualificationViolation(
        'MUTATION_NOT_APPLICABLE',
        `/mutants/${mutant.name}/${edit.file}`,
        `fichier hors du programme temoin (${FICHIERS_DU_PROGRAMME.join(', ')})`,
      )
    }
    const apres = applyEdit(avant, edit, mutant.name)
    contenus.set(edit.file, apres)
    journal.push(`${edit.file}#${String(edit.occurrence)} ${JSON.stringify(edit.find.slice(0, 60))}`)
  }
  for (const [f, texte] of contenus) writeFileSync(join(dir, f), texte, 'utf8')

  return {
    dir,
    server: join(dir, 'server.mjs'),
    edits: journal,
    dispose: (): void => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* le répertoire jetable a déjà disparu */
      }
    },
  }
}

/* ───────────────────────────────────────── démarrage d'un programme */

interface Annonce {
  readonly baseUrl?: unknown
}

/**
 * Démarre `server.mjs` dans un processus séparé et ne rend la main que lorsque
 * le programme a ANNONCÉ son adresse. Toute autre issue — sortie prématurée,
 * annonce illisible, silence — est un ÉCHEC DE DÉMARRAGE nommé, jamais un
 * verdict métier.
 */
export function startProgram(
  server: string,
  config: { witness: string; version: number; dsn: string; faults: Record<string, unknown> },
): Promise<WitnessHandle> {
  const enfant = spawn(process.execPath, [server, JSON.stringify(config)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let sortie = ''
  let erreur = ''
  enfant.stdout.setEncoding('utf8')
  enfant.stderr.setEncoding('utf8')
  enfant.stderr.on('data', (c: string) => {
    erreur += c
  })

  const arreter = (): Promise<void> =>
    new Promise<void>((resolveArret) => {
      if (enfant.exitCode !== null || enfant.signalCode !== null) return resolveArret()
      const massue = setTimeout(() => {
        try {
          enfant.kill('SIGKILL')
        } catch {
          /* déjà mort */
        }
      }, ARRET_MS)
      enfant.once('exit', () => {
        clearTimeout(massue)
        resolveArret()
      })
      try {
        enfant.kill('SIGTERM')
      } catch {
        clearTimeout(massue)
        resolveArret()
      }
    })

  return new Promise<WitnessHandle>((resolveDemarrage, rejectDemarrage) => {
    let fini = false
    const minuterie = setTimeout(() => {
      if (fini) return
      fini = true
      void arreter()
      rejectDemarrage(
        new QualificationViolation(
          'WITNESS_START_FAILED',
          `/witness/${config.witness}`,
          `aucune adresse annoncee en ${String(DEMARRAGE_MS)} ms — stderr=${JSON.stringify(erreur.slice(0, 400))}`,
        ),
      )
    }, DEMARRAGE_MS)

    const terminer = (fn: () => void): void => {
      if (fini) return
      fini = true
      clearTimeout(minuterie)
      fn()
    }

    enfant.stdout.on('data', (morceau: string) => {
      sortie += morceau
      const ligne = sortie.split('\n').find((l) => l.startsWith('BENCH_TEMOIN_READY '))
      if (ligne === undefined) return
      let annonce: Annonce
      try {
        annonce = JSON.parse(ligne.slice('BENCH_TEMOIN_READY '.length)) as Annonce
      } catch (e) {
        return terminer(() => {
          void arreter()
          rejectDemarrage(
            new QualificationViolation(
              'WITNESS_START_FAILED',
              `/witness/${config.witness}`,
              `annonce de demarrage illisible : ${String((e as Error).message)}`,
            ),
          )
        })
      }
      const baseUrl = annonce.baseUrl
      if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
        return terminer(() => {
          void arreter()
          rejectDemarrage(
            new QualificationViolation(
              'WITNESS_START_FAILED',
              `/witness/${config.witness}`,
              'annonce de demarrage sans baseUrl',
            ),
          )
        })
      }
      // Le témoin ne doit pas retenir la boucle d'événements du qualificateur :
      // il est arrêté explicitement par `stop()`, jamais par l'attente du parent.
      enfant.unref()
      terminer(() =>
        resolveDemarrage({
          baseUrl,
          witness: config.witness,
          version: config.version,
          stop: arreter,
        }),
      )
    })

    enfant.once('error', (e: Error) => {
      terminer(() =>
        rejectDemarrage(
          new QualificationViolation(
            'WITNESS_START_FAILED',
            `/witness/${config.witness}`,
            `spawn impossible : ${e.message}`,
          ),
        ),
      )
    })

    enfant.once('exit', (code, signal) => {
      terminer(() =>
        rejectDemarrage(
          new QualificationViolation(
            'WITNESS_START_FAILED',
            `/witness/${config.witness}`,
            `arret avant l'annonce d'adresse (code=${String(code)} signal=${String(signal)}) : ` +
              `${erreur.slice(0, 600) || '<stderr vide>'}`,
          ),
        ),
      )
    })
  })
}

/* ─────────────────────────── délégation au harnais de T09 (L147) */

interface HarnaisT09 {
  listWitnesses?: () => unknown
  startWitness?: (o: { witness: string; version: number; dsn: string }) => Promise<unknown>
}

let HARNAIS: HarnaisT09 | null = null

async function harnaisT09(): Promise<HarnaisT09> {
  if (HARNAIS !== null) return HARNAIS
  const entree = temoinHarnessEntry()
  if (!existsSync(entree)) {
    throw new QualificationViolation(
      'UNKNOWN_WITNESS',
      '/temoins',
      `le catalogue de temoins de T09 est introuvable (${entree})`,
    )
  }
  const mod = (await import(pathToFileURL(entree).href)) as HarnaisT09
  HARNAIS = mod
  return mod
}

/** Le catalogue publié par T09 : c'est lui qui nomme le témoin CONFORME. */
export async function catalogueT09(): Promise<readonly Record<string, unknown>[]> {
  const h = await harnaisT09()
  if (typeof h.listWitnesses !== 'function') {
    throw new QualificationViolation('UNKNOWN_WITNESS', '/temoins/listWitnesses', 'role absent')
  }
  const v = h.listWitnesses()
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : []
}

/** Démarre un témoin du catalogue de T09, par son contrat publié. */
export async function startCatalogueWitness(
  witness: string,
  version: number,
  dsn: string,
): Promise<WitnessHandle> {
  const h = await harnaisT09()
  if (typeof h.startWitness !== 'function') {
    throw new QualificationViolation('UNKNOWN_WITNESS', '/temoins/startWitness', 'role absent')
  }
  let handle: unknown
  try {
    handle = await h.startWitness({ witness, version, dsn })
  } catch (e) {
    throw new QualificationViolation(
      'WITNESS_START_FAILED',
      `/witness/${witness}`,
      String((e as Error).message).slice(0, 400),
    )
  }
  const o = handle as { baseUrl?: unknown; stop?: unknown }
  if (typeof o.baseUrl !== 'string' || o.baseUrl.length === 0) {
    throw new QualificationViolation(
      'WITNESS_START_FAILED',
      `/witness/${witness}`,
      'handle sans baseUrl',
    )
  }
  const stop = typeof o.stop === 'function' ? (o.stop as () => unknown) : null
  return {
    baseUrl: o.baseUrl,
    witness,
    version,
    stop: async (): Promise<void> => {
      if (stop !== null) await Promise.resolve(stop.call(handle))
    },
  }
}
