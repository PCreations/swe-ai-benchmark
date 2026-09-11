#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// guard-paths — partition de chemins par rôle (« règle des deux clés »).
//
// Utilisé à deux endroits, avec deux statuts très différents :
//   • .githooks/commit-msg  → retour rapide, contournable, sans autorité ;
//   • bench accept          → AUTORITÉ, re-dérivé sur la plage de commits issue
//                             du ledger, que l'implémenteur ne peut pas écrire.
//
// Deux vérifications distinctes :
//   1. le rôle n'écrit que dans ses zones ;
//   2. INTERDICTION ABSOLUE, quel que soit le rôle, qu'un même commit touche à
//      la fois la zone IMPL et une zone de jugement (ACCEPTANCE / REFERENCE /
//      MUTANT / GENERATOR). C'est le cœur de l'anti-biais coder-reviewer : le
//      code et le test qui le juge ne peuvent jamais entrer ensemble.
//
// Usage: guard-paths.mjs <role> <file>...      (sortie 0 = conforme, 1 = refus)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'

const [, , role, ...files] = process.argv
if (!role || files.length === 0) {
  console.error('usage: guard-paths.mjs <role> <file>...')
  process.exit(2)
}

let ownership
try {
  ownership = JSON.parse(readFileSync('verification/ownership.json', 'utf8'))
} catch {
  console.error('✗ verification/ownership.json illisible — fail-closed')
  process.exit(2)
}

/**
 * Glob minimal, sans dépendance : `**` traverse les `/`, `*` reste dans un
 * segment, `**\/` accepte zéro répertoire (`a/**\/b` couvre `a/b`).
 */
const toRe = (glob) => {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          out += '(?:.*/)?'
        } else {
          out += '.*'
        }
      } else {
        out += '[^/]*'
      }
    } else if ('.+^${}()|[]\\?'.includes(c)) {
      out += '\\' + c
    } else {
      out += c
    }
  }
  return new RegExp('^' + out + '$')
}

const zoneOf = (file) => {
  for (const [zone, globs] of Object.entries(ownership.zones)) {
    if (globs.some((g) => toRe(g).test(file))) return zone
  }
  return null
}

const JUDGEMENT = new Set(['ACCEPTANCE', 'REFERENCE', 'MUTANT', 'GENERATOR'])

if (!ownership.roles[role]) {
  console.error(`✗ rôle inconnu : ${role}`)
  console.error(`  rôles déclarés : ${Object.keys(ownership.roles).join(', ')}`)
  process.exit(1)
}
const allowed = new Set(ownership.roles[role])

const seen = new Map()
const unclaimed = []
const outOfZone = []

for (const f of files) {
  const z = zoneOf(f)
  if (z === null) {
    unclaimed.push(f)
    continue
  }
  if (!seen.has(z)) seen.set(z, [])
  seen.get(z).push(f)
  if (!allowed.has(z)) outOfZone.push([f, z])
}

let failed = false

// Tripwire fail-closed : un chemin qu'aucune zone ne revendique n'est pas
// « neutre », il est hors de toute partition — donc hors de tout digest.
if (unclaimed.length) {
  failed = true
  console.error('✗ UNCLAIMED_PATHS — chemins revendiqués par aucune zone :')
  unclaimed.forEach((f) => console.error(`    ${f}`))
  console.error('  Ajoute-les à une zone de verification/ownership.json, ou retire-les.')
}

if (outOfZone.length) {
  failed = true
  console.error(`✗ PARTITION_VIOLATION — le rôle « ${role} » n'écrit pas dans ces zones :`)
  outOfZone.forEach(([f, z]) => console.error(`    ${f}  [${z}]`))
  console.error(`  Zones autorisées pour ce rôle : ${[...allowed].join(', ')}`)
}

const touchedJudgement = [...seen.keys()].filter((z) => JUDGEMENT.has(z))
if (seen.has('IMPL') && touchedJudgement.length) {
  failed = true
  console.error('✗ PROOF_TAINTED — ce commit mêle implémentation et jugement :')
  seen.get('IMPL').forEach((f) => console.error(`    ${f}  [IMPL]`))
  touchedJudgement.forEach((z) => seen.get(z).forEach((f) => console.error(`    ${f}  [${z}]`)))
  console.error('  Le code et le test qui le juge ne peuvent jamais entrer dans le même commit.')
  console.error('  Sépare-les en deux commits portant chacun leur Bench-Role.')
}

process.exit(failed ? 1 : 0)
