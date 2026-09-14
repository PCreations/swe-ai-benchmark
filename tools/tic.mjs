#!/usr/bin/env node
/**
 * TIC — journal d'avancement adosse au TRAVAIL REEL, pas a l'horloge.
 *
 * POURQUOI HORS DE `verification/runner/` : le runner est une entree GLOBALE
 * (`GLOBAL_PATHS`). Y placer ce fichier couterait 44 re-attestations a chaque
 * retouche d'un outil qui ne fait qu'AFFICHER. Et il ne peut par construction
 * produire aucun faux PASS : il n'ecrit que `.bench/progress.jsonl`, qu'aucun
 * chemin de verification ne lit. Meme raisonnement que `tools/lease.mjs`.
 *
 * POURQUOI PAS UN CRON : un cron ne tire que quand le REPL est idle. Pendant un
 * tour long — c'est-a-dire exactement quand on veut savoir ou on en est — il ne
 * tire jamais. Un tic ecrit par l'agent qui vient de finir son etage tire, lui,
 * a chaque fois qu'il s'est reellement passe quelque chose.
 *
 * LA MESURE EST LUE SUR LE LEDGER, JAMAIS SUR LE TABLEAU VIVANT. « PROUVE A
 * HEAD » tombe a 0/44 des qu'un commit perime T00 (qui revendique `verification`
 * et `docs` en entier) ; ce n'est pas une regression. Le ledger, lui, ne
 * decroit jamais : une attestation ecrite ne s'efface pas.
 *
 *   node tools/tic.mjs <etage> <tache> <issue> [detail]   -> ajoute une ligne
 *   node tools/tic.mjs --show [n]                          -> affiche l'etat
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const JOURNAL = join(REPO, '.bench', 'progress.jsonl')
const LEDGER = 'claude/gallant-fermi-51jlsx-ledger'

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const lire = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'))

/**
 * JALONS — definis par le cahier L26, pas par le sequencement du plan.
 *
 * Le plan disait « W15 T41 -> PILOT_READY ». Le cahier dit « PILOT_READY apres
 * T39 et T40 ». Le cahier est la reference epinglee : c'est lui qui tranche, et
 * l'ecart est signale ici plutot que resolu en silence.
 */
const JALONS = [
  { nom: 'CORE_VERIFIED', ancres: ['T38'], cahier: 'L26' },
  { nom: 'PILOT_READY', ancres: ['T39', 'T40'], cahier: 'L26' },
  { nom: 'HANDOFF_COMPLETE', ancres: ['T43'], cahier: 'L26' },
]

/** Taches attestees SUR LE LEDGER — la seule mesure qui ne decroit pas. */
function attestees() {
  const sortie = git('ls-tree', '-r', '--name-only', LEDGER, '--', 'attestations')
  const vues = new Set()
  for (const ligne of sortie.split('\n')) {
    const m = /^attestations\/(T\d\d)\/[0-9a-f]{40}\.json$/.exec(ligne)
    if (m) vues.add(m[1])
  }
  return vues
}

/** Fermeture transitive des dependances, ancres comprises. */
function fermeture(ancres, parId) {
  const vus = new Set()
  const pile = [...ancres]
  while (pile.length) {
    const id = pile.pop()
    if (vus.has(id)) continue
    vus.add(id)
    for (const d of parId.get(id)?.depends_on ?? []) pile.push(d)
  }
  return vus
}

function mesure() {
  const taches = lire('verification/tasks.json').tasks
  const cas = lire('verification/cases.lock.json').cases
  const parId = new Map(taches.map((t) => [t.id, t]))

  // POIDS = CAS D'ACCEPTATION, pas nombre de taches. Compter les taches mettrait
  // T38 (« six trajectoires completes avec un resultat chiffre exact ») a
  // egalite avec T02. Les 279 cas sont ce que le cahier exige reellement.
  const casParTache = new Map()
  for (const c of cas) casParTache.set(c.task, (casParTache.get(c.task) ?? 0) + 1)

  const faites = attestees()
  const casTotal = cas.length
  const casFaits = [...faites].reduce((n, id) => n + (casParTache.get(id) ?? 0), 0)

  const jalons = JALONS.map((j) => {
    const cl = fermeture(j.ancres, parId)
    const restantes = [...cl].filter((id) => !faites.has(id))
    const casCl = [...cl].reduce((n, id) => n + (casParTache.get(id) ?? 0), 0)
    const casRestants = restantes.reduce((n, id) => n + (casParTache.get(id) ?? 0), 0)
    return { ...j, pct: casCl ? Math.round(((casCl - casRestants) / casCl) * 100) : 0, restantes: restantes.length, casRestants }
  })

  return { faites: [...faites].sort(), casFaits, casTotal, tachesTotal: taches.length, jalons }
}

const barre = (pct, n = 20) => '#'.repeat(Math.round((pct / 100) * n)).padEnd(n, '.')

function ajouter([etage, tache, issue, ...reste]) {
  if (!etage || !tache || !issue) {
    console.error('usage : node tools/tic.mjs <etage> <tache> <issue> [detail]')
    process.exit(64)
  }
  const m = mesure()
  const ligne = {
    ts: new Date().toISOString(),
    etage,
    tache,
    issue,
    detail: reste.join(' ') || null,
    head: git('rev-parse', '--short', 'HEAD'),
    ledger: git('rev-parse', '--short', LEDGER),
    // La mesure durable au moment du tic : le journal porte sa propre preuve,
    // donc relire l'historique ne demande pas de recalculer le passe.
    durable: { taches: m.faites.length, cas: m.casFaits },
  }
  mkdirSync(dirname(JOURNAL), { recursive: true })
  appendFileSync(JOURNAL, JSON.stringify(ligne) + '\n')
  console.log(`tic ${etage} ${tache} ${issue} — durable ${m.faites.length}/${m.tachesTotal} taches, ${m.casFaits}/${m.casTotal} cas`)
}

function afficher(n) {
  const m = mesure()
  const pct = Math.round((m.casFaits / m.casTotal) * 100)
  console.log(`MOTEUR  ${barre(pct)}  ${String(pct).padStart(2)}%   ${m.casFaits}/${m.casTotal} cas · ${m.faites.length}/${m.tachesTotal} taches`)
  for (const j of m.jalons)
    console.log(`  ${j.nom.padEnd(17)} ${String(j.pct).padStart(3)}%   reste ${j.restantes} taches / ${j.casRestants} cas`)

  if (!existsSync(JOURNAL)) {
    console.log('\n(aucun tic encore — le journal se remplit a chaque fin d etage)')
    return
  }
  const lignes = readFileSync(JOURNAL, 'utf8').trim().split('\n').filter(Boolean).slice(-n)
  console.log(`\nDERNIERS ETAGES (${lignes.length})`)
  for (const l of lignes) {
    const e = JSON.parse(l)
    const h = e.ts.slice(11, 16)
    const marque = e.issue === 'ok' ? ' ' : '!'
    console.log(`  ${h} ${marque} ${e.etage.padEnd(9)} ${e.tache.padEnd(4)} ${e.issue.padEnd(9)} ${(e.detail ?? '').slice(0, 60)}`)
  }
}

const argv = process.argv.slice(2)
if (argv[0] === '--show') afficher(Number(argv[1]) || 8)
else ajouter(argv)
