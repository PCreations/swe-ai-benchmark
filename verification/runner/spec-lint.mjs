/**
 * LA GARDE VERBATIM DES CARTES DE SPEC — elle n'existait pas.
 *
 * Le plan la nommait comme la fermeture de « l'attaque la plus probable » :
 *
 *   « sept roles independants lisant une paraphrase ecrite en 90 secondes par un
 *     seul agent. Supprimer "et Q inferieur a 1" de T21.A8 suffit a corrompre
 *     toute la chaine. Fermeture : `bench registry lint` verifie que chaque bloc
 *     est byte-egal a `sed -n '<a>,<b>p' docs/cahier.md`, et refuse toute prose
 *     propre a l'extracteur. »
 *
 * Elle n'a jamais ete ecrite. `input-digest.mjs` ne fait que HACHER la carte
 * (`spec_card: oidAt(...)`) : le hachage detecte un CHANGEMENT, jamais une
 * FALSIFICATION initiale. La verification verbatim a donc ete faite par les
 * agents extracteurs eux-memes, qui rapportaient « 99/99 blocs corrects » —
 * c'est-a-dire par celui-la meme dont le travail etait en cause.
 *
 * Trois choses sont verifiees, et chacune ferme un chemin distinct :
 *
 *   1. BYTE-EGALITE. Le contenu de chaque bloc clos est byte-egal aux lignes
 *      `La-Lb` du cahier epingle. Ferme la paraphrase et la reecriture.
 *   2. COMPLETUDE. C'est R06. Un bloc TRONQUE est byte-egal a un PREFIXE des
 *      lignes citees : retirer « et Q inferieur a 1 » de la fin de T21.A8 passe
 *      une comparaison naive. On compare donc la plage ENTIERE, jamais un
 *      prefixe, et on l'exige exacte des deux bouts.
 *   3. AUCUNE PROSE DE L'EXTRACTEUR. Hors des blocs clos et des marqueurs
 *      `<!-- cahier:… -->` / `<!-- applies:… -->`, seules les lignes vides sont
 *      admises. Ferme le commentaire glisse entre deux citations exactes.
 */

import { readFileSync, existsSync } from 'node:fs'
import { repoRoot } from './git.mjs'

const R = repoRoot()
const CLOTURE = '````'

/** Les lignes `a..b` du cahier, 1-indexees et inclusives, comme `sed -n 'a,bp'`. */
function lignesDuCahier(cahier, a, b) {
  return cahier.slice(a - 1, b).join('\n')
}

/**
 * Analyse une carte. Rend les problemes, jamais une exception : un lint qui
 * plante sur une carte mal formee ne dit pas si les AUTRES sont bonnes.
 */
export function lintSpecCard(taskId, { cahierPath = `${R}/docs/cahier.md`, cardPath } = {}) {
  const chemin = cardPath ?? `${R}/docs/specs/${taskId}.md`
  if (!existsSync(chemin)) return { task: taskId, blocks: 0, problems: [`carte absente : ${chemin}`] }
  if (!existsSync(cahierPath)) return { task: taskId, blocks: 0, problems: [`cahier absent : ${cahierPath}`] }

  const cahier = readFileSync(cahierPath, 'utf8').split('\n')
  const lignes = readFileSync(chemin, 'utf8').split('\n')
  const problems = []
  let blocks = 0

  let i = 0
  let plage = null // { a, b, ligne }
  while (i < lignes.length) {
    const l = lignes[i]
    const m = /^<!--\s*cahier:L(\d+)(?:-L(\d+))?\s*-->\s*$/.exec(l)
    if (m) {
      plage = { a: Number(m[1]), b: Number(m[2] ?? m[1]), ligne: i + 1 }
      i += 1
      continue
    }
    if (/^<!--\s*applies:[^>]*-->\s*$/.test(l) || l.trim() === '') {
      i += 1
      continue
    }
    if (l.startsWith(CLOTURE)) {
      const debut = i + 1
      let j = debut
      while (j < lignes.length && !lignes[j].startsWith(CLOTURE)) j += 1
      if (j >= lignes.length) {
        problems.push(`bloc non ferme a partir de la ligne ${i + 1}`)
        break
      }
      const cite = lignes.slice(debut, j).join('\n')
      blocks += 1
      if (!plage) {
        problems.push(`bloc ligne ${i + 1} sans marqueur <!-- cahier:L… --> qui le precede`)
      } else {
        const attendu = lignesDuCahier(cahier, plage.a, plage.b)
        if (cite !== attendu) {
          // On NOMME la forme de l'ecart, parce qu'un « DIFFERENT » sec ne dit pas
          // ou regarder. Et surtout : une suppression INTERNE est aussi une
          // troncature au sens de R06 — l'exemple du plan (« et Q inferieur a 1 »)
          // tombe au MILIEU d'un bloc de sept lignes, pas a sa fin. Classer sur la
          // seule position aurait rate exactement le cas qui motive ce lint.
          let commun = 0
          while (commun < cite.length && commun < attendu.length && cite[commun] === attendu[commun]) commun += 1
          const ou = `premier ecart a l'octet ${commun}`
          const quoi =
            cite.length < attendu.length
              ? `RACCOURCI : ${attendu.length - cite.length} octet(s) manquants (R06), ${ou}`
              : cite.length > attendu.length
                ? `ALLONGE : ${cite.length - attendu.length} octet(s) ajoutes, ${ou}`
                : `REECRIT a longueur egale, ${ou}`
          problems.push(
            `bloc L${plage.a}-L${plage.b} (carte ligne ${plage.ligne}) ${quoi} ; ` +
              `attendu ${attendu.length} octets, lu ${cite.length}`
          )
        }
      }
      plage = null
      i = j + 1
      continue
    }
    problems.push(`prose propre a l'extracteur, carte ligne ${i + 1} : ${l.slice(0, 70)}`)
    i += 1
  }
  return { task: taskId, blocks, problems }
}

/** Lint de toutes les cartes du registre. */
export function lintAllSpecCards(taskIds, opts = {}) {
  const results = taskIds.map((id) => lintSpecCard(id, opts))
  return { results, ok: results.every((r) => r.problems.length === 0) }
}
