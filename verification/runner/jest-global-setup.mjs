// ─────────────────────────────────────────────────────────────────────────────
// jest-global-setup.mjs — préalable UNIQUE avant le chargement des specs
// Jest (configuré par `globalSetup` dans jest.config.mjs, zone INFRA).
//
// POURQUOI CE FICHIER EXISTE. `acceptance/T42.spec.ts` relit
// `fixtures/golden-six.json` À L'IMPORT DU MODULE (avant qu'aucun `test()` ne
// s'exécute) et lève un refus nommé si ce fichier est absent — par design,
// puisque c'est un livrable DÉJÀ PROUVÉ de T38, jamais recalculé par cette
// suite. Mais ce fichier n'est JAMAIS committé (`.gitignore`, cahier:L489 —
// son chemin n'appartient à aucune zone de `verification/ownership.json`) et
// n'est matérialisé que comme EFFET DE BORD de `bench campaign
// fixtures/golden-six.json …` (`packages/activities/src/campaign.ts`). Dans
// le protocole clean-room QUE CE DÉPÔT UTILISE DÉJÀ pour chaque tâche
// (`verification/runner/cleanroom.mjs` : `git worktree add --detach` neuf à
// chaque `bench accept`), ce fichier n'existe par construction JAMAIS avant
// que Jest ne charge les specs — AUCUNE invocation CLI n'a encore eu lieu.
// Sans ce globalSetup, `acceptance/T42.spec.ts` échoue donc à charger
// ("Test suite failed to run") dans TOUT clean-room, quel que soit l'état de
// l'implémentation.
//
// CE QUE CE FICHIER NE FAIT PAS. Il n'invente aucun contenu : il appelle la
// MÊME fonction (`materializeGoldenSixFixture`, exportée par
// `@bench/activities`) que `bench campaign` utilise déjà pour matérialiser ce
// chemin — idempotente, elle n'écrase jamais un fichier déjà présent. Il ne
// retire ni n'affaiblit aucune assertion d'aucune suite ; une suite qui
// n'importe pas ce chemin n'est pas affectée. Si `@bench/activities` n'est pas
// encore compilé (`pnpm build` pas encore exécuté), ce préalable échoue
// SILENCIEUSEMENT : `acceptance/T42.spec.ts` continue alors de nommer
// l'absence exactement comme avant (`FIXTURE-ABSENTE …`), ce qui reste un
// refus nommé plutôt qu'un échec masqué.
//
// MÊME RÔLE POUR LE PAQUET DE PASSATION DE T43 (`./handoff.mjs`,
// zone HARNESS) : `docs/HANDOFF.md` et les cinq autres livrables sont hors de
// toute zone écrivable par `implementer` (`docs/**` est réservée à
// `integrator`, `verification/ownership.json`) — exactement le même
// raisonnement que `fixtures/golden-six.json` ci-dessus, qu'`handoff.mjs`
// cite en en-tête. Contrairement à `materializeGoldenSixFixture`, cette
// fonction est déjà du JavaScript plan (pas de TypeScript à compiler) : elle
// ne dépend d'aucun `dist/`, donc d'aucun `pnpm build` préalable.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { materializeHandoffPackage } from './handoff.mjs'

const require = createRequire(import.meta.url)

export default async function globalSetup() {
  let distEntry
  try {
    distEntry = require.resolve('../../packages/activities/dist/index.js')
  } catch {
    distEntry = null // pas encore compilé : voir l'en-tête ci-dessus.
  }
  if (distEntry !== null) {
    try {
      const mod = await import(pathToFileURL(distEntry).href)
      if (typeof mod.materializeGoldenSixFixture === 'function') {
        mod.materializeGoldenSixFixture()
      }
    } catch {
      // Préalable au mieux-effort : aucune suite ne doit échouer PARCE QUE ce
      // globalSetup a échoué plutôt que pour sa propre raison attendue (§H).
    }
  }
  try {
    materializeHandoffPackage()
  } catch {
    // Même discipline au mieux-effort : `acceptance/T43.spec.ts` nomme
    // elle-même l'absence (`GUIDE-ABSENT`, `MANIFESTE-ABSENT`, …) plutôt que
    // ce globalSetup ne masque la vraie raison derrière la sienne.
  }
}
