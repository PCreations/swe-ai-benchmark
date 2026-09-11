// ─────────────────────────────────────────────────────────────────────────────
// references — LA VÉRIFICATION DES FIXTURES MAÎTRESSES GELÉES.
//
// §G l.139 : « La racine des fixtures de référence est gelée après T01 ; toute
// modification est visible dans le diff et invalide les preuves précédentes. »
// §T01 l.165 : « la corruption de F-MONEY, par exemple attendu 341 au lieu de
// 340, est détectée par la vérification des références. »
//
// CE QUE CE FICHIER REFUSE DE FAIRE, PARCE QUE ÇA NE PROUVERAIT RIEN.
//
// Contrôler la PRÉSENCE et le NOM des fichiers de `acceptance/reference` ne
// détecte pas 341 : le fichier corrompu porte le même nom, au même endroit, et
// reste du JSON bien formé. Contrôler sa seule validité syntaxique non plus.
// Enregistrer une empreinte la première fois qu'on la voit, puis la
// réenregistrer silencieusement quand elle change (« tofu permanent »), revient
// à n'avoir aucun contrôle : la référence devient ce que le dernier écrivain a
// écrit.
//
// DEUX CONTRÔLES INDÉPENDANTS, ET ILS NE SE RECOUVRENT PAS.
//
//   1. LE GEL. L'arbre de travail est confronté à HEAD sur chaque racine gelée.
//      L'autorité n'est pas un fichier d'empreintes que le même agent pourrait
//      réécrire dans le même commit : c'est l'objet git, et la modification
//      apparaît « dans le diff » — le dispositif littéral de l.139. Ce contrôle
//      attrape 341 quelle que soit la forme du fichier, y compris une
//      corruption qui laisserait par ailleurs toutes les valeurs attendues
//      présentes quelque part.
//
//   2. LE CONTENU. Les valeurs que le cahier ASSIGNE aux fixtures maîtresses
//      sont confrontées à ce que les fichiers portent. Ce contrôle attrape ce
//      que le premier ne peut pas voir : une corruption déjà COMMITTÉE, où
//      l'arbre de travail et HEAD s'accordent sur une valeur fausse. Les
//      nombres ci-dessous sont recopiés du cahier, ligne citée, jamais relevés
//      sur une exécution.
//
// UNE RACINE ABSENTE N'EST PAS UNE RACINE CORROMPUE. Tant que
// `acceptance/reference` n'existe ni dans l'arbre ni dans HEAD, il n'y a rien à
// geler : l'état est `ABSENT`, il est inscrit au rapport comme livrable
// manquant, et il ne refuse pas — refuser ici ferait échouer toute tâche pour
// un fixture qu'elle n'utilise pas. Dès que la racine existe, les deux
// contrôles s'appliquent et l'absence d'une fixture maîtresse nommée par le
// cahier devient, elle, un refus.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { gitOrNull, repoRoot, oidAt, ABSENT } from './git.mjs'
import { scopeFiles } from './fixtures.mjs'

const R = repoRoot()

/** La racine que §G gèle, à défaut de déclaration explicite. */
export const DEFAULT_FROZEN_ROOTS = ['acceptance/reference']

/**
 * Les racines gelées. `docs/FROZEN_ROOTS.json` est en zone REFERENCE : il fait
 * autorité quand il existe. Son absence ne désarme PAS le contrôle — elle le
 * ramène à la racine que le cahier nomme, sans quoi supprimer le fichier de
 * déclaration suffirait à désactiver la vérification des références.
 */
export function frozenRoots() {
  let doc = null
  try {
    doc = JSON.parse(readFileSync(`${R}/docs/FROZEN_ROOTS.json`, 'utf8'))
  } catch {
    return { source: 'defaut (docs/FROZEN_ROOTS.json absent)', roots: [...DEFAULT_FROZEN_ROOTS] }
  }
  const raw = Array.isArray(doc) ? doc : (doc?.roots ?? doc?.frozen_roots ?? [])
  const list = (Array.isArray(raw) ? raw : [])
    .map((r) => (typeof r === 'string' ? r : r?.path))
    .filter((p) => typeof p === 'string' && p.trim() !== '')
  // Fail-closed : une déclaration vide ou illisible ne peut pas RÉDUIRE le
  // périmètre gelé en dessous de ce que le cahier impose.
  const roots = [...new Set([...DEFAULT_FROZEN_ROOTS, ...list])].sort()
  return { source: 'docs/FROZEN_ROOTS.json', roots }
}

/**
 * Les valeurs que le cahier assigne aux fixtures maîtresses. Chaque entrée
 * porte sa ligne : c'est la provenance, pas une observation.
 *
 * Seule F-MONEY est contrainte ici, et c'est délibéré : c'est la fixture que
 * §T01 nomme pour ce contrôle (l.165), et la seule dont le cahier fixe des
 * ENTIERS exacts insensibles à la sérialisation retenue par le transcripteur.
 * Étendre la table à des fixtures dont le cahier donne des rationnels ou des
 * dates rendrait le contrôle dépendant d'un format que le cahier ne fixe pas —
 * il refuserait des transcriptions correctes, ce qui est l'autre façon de ne
 * rien prouver.
 */
export const REFERENCE_INVARIANTS = [
  {
    fixture: 'F-MONEY',
    cahier: 'L103',
    match: /F[-_ ]?MONEY/i,
    // « Un appel de 100 tokens non cachés, 40 cachés et 20 de sortie vaut 340
    // micro-USD. Deux appels identiques valent 680. »
    integers: [340, 680],
  },
]

const hasInteger = (text, n) => new RegExp(`(^|[^0-9])${String(n)}([^0-9]|$)`).test(text)

/**
 * Confronte les racines gelées à HEAD, puis leur contenu aux valeurs du cahier.
 * Rend un état OBSERVÉ ; c'est `verify-task.mjs` qui en tire un refus.
 */
export function checkReferences(roots = frozenRoots()) {
  const problems = []
  const observed = []

  for (const root of roots.roots) {
    const head = oidAt('HEAD', root)
    const files = scopeFiles([root]) ?? []
    if (head === ABSENT && files.length === 0) {
      observed.push({ root, state: 'ABSENT', head_oid: head, files: 0 })
      continue
    }

    // 1. LE GEL — l'arbre de travail contre HEAD. `--porcelain` liste aussi les
    //    fichiers non suivis et les suppressions : les trois façons de bouger.
    const diff = gitOrNull(['status', '--porcelain', '--', root])
    const dirty = diff === null ? ['<git status indisponible>'] : diff.split('\n').filter((l) => l.trim() !== '')
    if (dirty.length) {
      problems.push(
        `racine gelee ${root} : ${dirty.length} chemin(s) different(s) de HEAD — ${dirty.slice(0, 5).join(' | ')}`,
      )
    }

    // 2. LE CONTENU — les valeurs que le cahier assigne.
    const texts = new Map()
    for (const f of files) {
      try {
        texts.set(f, readFileSync(`${R}/${f}`, 'utf8'))
      } catch {
        problems.push(`racine gelee ${root} : ${f} illisible`)
      }
    }

    const fixtures = []
    for (const inv of REFERENCE_INVARIANTS) {
      const carriers = [...texts.entries()].filter(
        ([f, t]) => inv.match.test(t) || inv.match.test(f.split('/').pop() ?? ''),
      )
      if (carriers.length === 0) {
        problems.push(
          `racine gelee ${root} : fixture maitresse ${inv.fixture} (cahier ${inv.cahier}) introuvable parmi ${files.length} fichier(s)`,
        )
        fixtures.push({ fixture: inv.fixture, state: 'INTROUVABLE', files: [] })
        continue
      }
      const missing = []
      for (const n of inv.integers) {
        if (!carriers.some(([, t]) => hasInteger(t, n))) missing.push(n)
      }
      if (missing.length) {
        problems.push(
          `racine gelee ${root} : ${inv.fixture} ne porte plus ${missing.join(', ')} (cahier ${inv.cahier}) — fichiers ${carriers.map(([f]) => f).join(', ')}`,
        )
      }
      fixtures.push({
        fixture: inv.fixture,
        cahier: inv.cahier,
        state: missing.length ? 'CORROMPUE' : 'CONFORME',
        expected_integers: inv.integers,
        missing_integers: missing,
        files: carriers.map(([f]) => f),
      })
    }

    observed.push({
      root,
      state: dirty.length ? 'MODIFIEE' : 'GELEE',
      head_oid: head,
      files: files.length,
      worktree_diff: dirty,
      fixtures,
    })
  }

  return { schema: 'bench.references/1', source: roots.source, roots: roots.roots, observed, problems }
}
