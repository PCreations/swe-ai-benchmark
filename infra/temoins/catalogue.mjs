// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins/catalogue.mjs — LE CATALOGUE DES TÉMOINS ET LEURS EMPREINTES.
//
// Cahier L229 : « quatre versions d'une petite API de réservation […] et
// fixtures fautives NOMMÉES ». Cahier L235 : « images témoins identifiées par
// DIGEST ». Ce fichier tient les deux.
//
// CE QU'EST UN DIGEST ICI, ET CE QU'IL N'EST PAS. Il identifie le TÉMOIN — le
// programme qui sera exécuté — et non le format d'un artefact. Il est calculé
// sur le contenu des fichiers du programme, plus le nom de la fixture et la
// description exacte de son altération. Deux conséquences vérifiables :
//   • deux fixtures ne peuvent pas porter le même digest, puisque leur
//     altération entre dans le calcul ;
//   • le digest d'une fixture ne bouge pas d'un démarrage à l'autre, mais bouge
//     dès qu'une ligne du programme change.
// Recalculer l'empreinte d'une image OCI mesurerait l'emballage, pas le témoin.
//
// UNE SEULE FIXTURE CONFORME. Les autres sont fautives, et chacune porte UNE
// altération nommée, appliquée au même générateur d'opérations : ce qui les
// sépare du témoin conforme est donc exactement ce que leur nom annonce. Seule
// `drop-one-row` est exigée par le cahier (L233) ; les deux autres couvrent les
// deux autres façons dont cette API peut mentir sans planter — accepter au-delà
// de la capacité, et servir la file d'attente à l'envers.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))

/** Les fichiers qui CONSTITUENT le programme témoin. */
const PROGRAMME = [
  'app/psql.mjs',
  'app/migrations.mjs',
  'app/operations.mjs',
  'app/server.mjs',
]

export const VERSIONS = [1, 2, 3, 4]

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/** L'empreinte du programme : contenu de chaque fichier, chemin compris. */
function empreinteDuProgramme() {
  const lignes = PROGRAMME.slice()
    .sort()
    .map((rel) => `${rel}:${sha256(readFileSync(join(ICI, rel)))}`)
  return sha256(lignes.join('\n'))
}

let PROGRAMME_DIGEST = null
function programmeDigest() {
  if (PROGRAMME_DIGEST === null) PROGRAMME_DIGEST = empreinteDuProgramme()
  return PROGRAMME_DIGEST
}

/**
 * Les fixtures. `faults` est le seul écart au témoin conforme ; il est passé
 * tel quel au générateur d'opérations, et il entre dans le digest.
 */
export const FIXTURES = [
  {
    name: 'reservation-api',
    conforming: true,
    faults: {},
    fault: 'aucune — c\'est le temoin CONFORME',
  },
  {
    name: 'drop-one-row',
    conforming: false,
    faults: { drop_one_row: true },
    fault:
      'la premiere reservation acceptee de la base repond en succes sans jamais ' +
      "etre ecrite : EXACTEMENT une reservation est perdue, en silence (cahier L233)",
  },
  {
    name: 'overbook-by-one',
    conforming: false,
    faults: { overbook_by_one: true },
    fault: 'la capacite servie est celle declaree PLUS UNE : un surbooking d\'exactement une place',
  },
  {
    name: 'waitlist-lifo',
    conforming: false,
    faults: { waitlist_lifo: true },
    fault:
      "la promotion depuis la file d'attente prend la DERNIERE sequence d'admission " +
      'au lieu de la premiere : FIFO devient LIFO (cahier L123)',
  },
]

const canonique = (v) =>
  v === null || typeof v !== 'object'
    ? (JSON.stringify(v) ?? 'null')
    : Array.isArray(v)
      ? `[${v.map(canonique).join(',')}]`
      : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`).join(',')}}`

/** Le digest d'une fixture : programme + nom + altération. */
export function digestDeLaFixture(f) {
  return `sha256:${sha256(`${programmeDigest()}\n${f.name}\n${canonique(f.faults)}`)}`
}

/** Le digest d'une VERSION d'une fixture : c'est elle qu'on démarre. */
export function digestDeLaVersion(f, version) {
  return `sha256:${sha256(`${digestDeLaFixture(f)}\nversion=${String(version)}`)}`
}

export function fixtureParNom(nom) {
  return FIXTURES.find((f) => f.name === nom) ?? null
}

/** Le catalogue PLAT que publie `listWitnesses()`. */
export function catalogue() {
  return FIXTURES.map((f) => ({
    name: f.name,
    conforming: f.conforming,
    digest: digestDeLaFixture(f),
    versions: VERSIONS.slice(),
    fault: f.fault,
    program_digest: `sha256:${programmeDigest()}`,
  }))
}
