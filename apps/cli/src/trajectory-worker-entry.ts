// ─────────────────────────────────────────────────────────────────────────────
// Entrée forkée de `bench run-trajectory` / `bench replay-trajectory` (T24,
// cahier L361-L370).
//
// POURQUOI UN PROCESSUS ENFANT SÉPARÉ, AVEC SA PROPRE SORTIE STANDARD IGNORÉE.
// Mesuré : quand `Worker.runReplayHistory` détecte une violation de
// déterminisme, le CORE NATIF de Temporal (Rust) écrit un diagnostic
// `[33mWARN[0m temporalio_sdk_core::worker::workflow …` DIRECTEMENT sur la
// sortie standard du processus — ce n'est PAS le logger JS du SDK
// (`DefaultLogger`, qui écrit toujours sur `stderr`, cf. `@temporalio/worker`)
// mais un chemin natif qui le contourne. Cette ligne contient elle-même des
// accolades déséquilibrées (`Failure { failure: Some(Failure { … }) }`), ce
// qui casse l'extraction JSON par recherche de la première/dernière accolade
// que toute suite d'acceptation de ce dépôt emploie (voir `jsonDeSortie` dans
// `acceptance/*.spec.ts`) : la règle de `./index.ts`, « rien d'autre que le
// JSON ne va sur la sortie standard », ne peut donc PAS être garantie par un
// simple logger JS ici.
//
// Ce fichier fait donc tourner `runTrajectory`/`replayTrajectory` (plomberie
// Temporal réelle, `./trajectory.ts`) dans un PROCESSUS FORKÉ dont la sortie
// standard est ENTIÈREMENT IGNORÉE (stdio `'ignore'`, jamais `'pipe'` — un
// pipe non vidangé bloquerait) : quoi que le Core natif y écrive, cela ne
// traverse jamais vers le processus appelant. Le résultat (ou l'échec) revient
// par le canal IPC de `fork()`, jamais par la sortie standard — c'est LUI,
// et lui seul, que `./index.ts` imprime ensuite sur SA PROPRE sortie standard,
// intacte.
// ─────────────────────────────────────────────────────────────────────────────
import { replayTrajectory, runTrajectory } from './trajectory.js'
import type { RunTrajectoryParams } from './trajectory.js'

type Message = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string }

function send(message: Message): void {
  if (typeof process.send === 'function') {
    process.send(message)
  } else {
    // Filet de sécurité si jamais ce fichier est lancé hors `fork()` (il ne
    // devrait jamais l'être) : au moins ne pas écrire sur la sortie standard.
    process.stderr.write(`${JSON.stringify(message)}\n`)
  }
}

async function main(): Promise<void> {
  const kind = process.argv[2]
  const payloadRaw = process.argv[3]
  if (payloadRaw === undefined) throw new Error('trajectory-worker-entry : payload JSON manquant')
  const payload = JSON.parse(payloadRaw) as Record<string, unknown>

  if (kind === 'run') {
    const value = await runTrajectory(payload as unknown as RunTrajectoryParams)
    send({ ok: true, value })
  } else if (kind === 'replay') {
    const historyPath = payload['historyPath']
    if (typeof historyPath !== 'string') throw new Error('trajectory-worker-entry : historyPath manquant')
    const value = await replayTrajectory(historyPath)
    send({ ok: true, value })
  } else {
    throw new Error(`trajectory-worker-entry : mode inconnu (${String(kind)})`)
  }
}

main()
  .then(() => {
    process.exitCode = 0
  })
  .catch((e: unknown) => {
    send({ ok: false, message: e instanceof Error ? e.message : String(e) })
    process.exitCode = 0 // le code de sortie n'est pas le signal : le message IPC l'est.
  })
