// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE — SandboxRunner Linux : profil d'execution borne, reseau du
// candidat et procedure de destruction (cahier L317-L326, tache T19).
//
// Etage ROUGE : aucune regle metier n'est ecrite ici. Ni conteneur reel, ni
// cgroup, ni netns, ni passerelle de jetons. Les trois roles ci-dessous
// LEVENT `NotImplemented` (@bench/contracts), dont le message porte le
// prefixe `NOT_IMPLEMENTED` que `verification/runner/red.mjs` sait lire.
//
// CE QUE CE FICHIER AJOUTE, ET SUR QUOI IL S'APPUIE. T19 depend de T14, T15,
// T17, T18 (verification/tasks.json) ; source_paths ne nomme que
// `packages/sandbox` et `infra` — ce squelette ne touche pas `infra/` (la
// topologie reseau reelle n'entre qu'a l'etage VERT) et n'importe aucun role
// d'un autre paquet.
//
// Les trois noms exportes ci-dessous sont ceux que la section III de l'en-tete
// de `acceptance/T19.spec.ts` publie — le cahier ne nomme aucun export pour
// SandboxRunner (contrairement a T17/§F ou T18/L309) : ils sont donc FIXES
// PAR LA SUITE, pas lus dans le cahier (meme geste que T18 fixant
// `createScriptedAgent`, `getSessionEvents`, `getSubmissions`). Noms
// primaires sans alias : la liste d'alias que la suite tolere est une
// tolerance de NOMMAGE cote appelant, jamais une invitation a en inventer un
// ici.
//
//   buildSandboxProfile(input) -> Profile
//       PURE — aucune E/S. Republie `memoryLimitBytes`, `pidsMax` et
//       `allowedEgress` tels que fournis (L321 : « le profil exact est
//       archive ») ; `Profile` doit rester serialisable JSON sans perte.
//   provisionSandbox(profile) -> Promise<SandboxHandle>
//       Provisionne le conteneur candidat non privilegie et rend un
//       `SandboxHandle` : `execShell`, `probeTcp`, `exposeProbeListener`,
//       `mintGatewayCredential`, `readResourceEvidence`, `destroy` — la forme
//       exacte que la section III fixe. Ces six methodes ne sont pas des
//       exports separes : elles n'existent qu'une fois `provisionSandbox`
//       reellement implemente, puisqu'aucune ne peut etre atteinte tant que
//       cet appel leve.
//   verifyTrajectoryClaim(claimedTrajectoryId, token) ->
//       Promise<{ accepted: boolean; code?: string }>
//       Point de decision de « la passerelle » (L323, A4) : verifie la
//       liaison jeton -> trajectoire emise par `mintGatewayCredential()`.
//
// CE QUE CE SQUELETTE NE PRETEND PAS FAIRE. Aucun des trois roles ne rend de
// valeur plausible : chacun leve immediatement. Les cinq cas `refusal` et le
// cas `absence` de T19 restent ROUGES malgre tout : `acceptance/T19.spec.ts`
// appelle `buildSandboxProfile`/`provisionSandbox` a travers `essayer()`,
// note l'echec avec un message NOMME (PROFIL-EN-ECHEC /
// PROVISIONNEMENT-EN-ECHEC), et chaque cas echoue donc AVANT d'atteindre son
// assertion principale — pas un faux vert (verification/mutants/T19.json).
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Une destination autorisee en liste blanche d'egress (L321, L323/A3). */
export interface AllowedEgressEntry {
  readonly label: string
  readonly host: string
  readonly port: number
}

/** Entree de `buildSandboxProfile` (section III.1). */
export interface SandboxProfileInput {
  readonly trajectoryId: string
  /** Hote, monte rw comme cwd du candidat. */
  readonly workspaceDir: string
  readonly memoryLimitBytes: number
  readonly pidsMax: number
  readonly allowedEgress: readonly AllowedEgressEntry[]
  /** JAMAIS monte dans le conteneur candidat (L321). */
  readonly controlRepoRoot: string
  /** JAMAIS lisible depuis le conteneur candidat (L321, D3/L65). */
  readonly privateSentinelPath: string
}

/**
 * Profil archivable — serialisable JSON sans perte, et qui republie
 * `memoryLimitBytes`, `pidsMax` et `allowedEgress` tels que fournis
 * (L321 : « le profil exact est archive », section III.1).
 */
export interface Profile {
  readonly trajectoryId: string
  readonly workspaceDir: string
  readonly memoryLimitBytes: number
  readonly pidsMax: number
  readonly allowedEgress: readonly AllowedEgressEntry[]
  readonly controlRepoRoot: string
  readonly privateSentinelPath: string
}

/** Rendu de `execShell` (section III.2). */
export interface ExecResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  /** `true` UNIQUEMENT si le processus a ete arrete par une limite de
   * ressource (memoire ou pids), jamais sur une fin normale. */
  readonly terminated: boolean
  /** NON VIDE quand `terminated` est vrai — rendue par le controleur,
   * jamais auto-declaree par le candidat (L321). */
  readonly terminationReason: string | null
}

/** Rendu de `probeTcp` — ne leve jamais (section III.2). */
export interface ProbeResult {
  readonly reachable: boolean
}

/** Rendu de `exposeProbeListener` (section III.2). */
export interface ProbeListener {
  readonly host: string
  readonly port: number
}

/** Rendu de `mintGatewayCredential` (section III.2). */
export interface GatewayCredential {
  readonly token: string
}

/** Rendu de `readResourceEvidence` — observation INDEPENDANTE des limites,
 * jamais deduite du seul code de sortie (section III.2). */
export interface ResourceEvidence {
  readonly memoryFailcnt: number
  readonly pidsLimitHit: boolean
}

/** Handle du conteneur candidat provisionne (section III.2). */
export interface SandboxHandle {
  readonly trajectoryId: string
  execShell(command: string, opts?: { readonly timeoutMs?: number }): Promise<ExecResult>
  probeTcp(host: string, port: number, opts?: { readonly timeoutMs?: number }): Promise<ProbeResult>
  exposeProbeListener(): Promise<ProbeListener>
  mintGatewayCredential(): Promise<GatewayCredential>
  readResourceEvidence(): Promise<ResourceEvidence>
  /** Destruction REELLE (L319) : apres `destroy()`, tout appel a
   * `execShell`/`probeTcp` sur CE handle doit echouer. */
  destroy(): Promise<void>
}

/** Rendu de `verifyTrajectoryClaim` (section III.3). */
export interface TrajectoryClaimResult {
  readonly accepted: boolean
  readonly code?: string
}

/**
 * Construit le profil d'execution — PURE, aucune E/S, aucune ressource
 * ouverte (section III.1).
 */
export function buildSandboxProfile(input: SandboxProfileInput): Profile {
  void input
  throw new NotImplemented('sandbox.buildSandboxProfile')
}

/**
 * Provisionne le conteneur candidat non privilegie a partir d'un `Profile`
 * archive et rend un `SandboxHandle` (section III.2).
 */
export function provisionSandbox(profile: Profile): Promise<SandboxHandle> {
  void profile
  throw new NotImplemented('sandbox.provisionSandbox')
}

/**
 * Point de decision de la passerelle : verifie qu'un jeton emis par
 * `mintGatewayCredential()` est presente avec l'identite de trajectoire a
 * laquelle il est REELLEMENT lie (section III.3, L323/A4).
 */
export function verifyTrajectoryClaim(
  claimedTrajectoryId: string,
  token: string,
): Promise<TrajectoryClaimResult> {
  void claimedTrajectoryId
  void token
  throw new NotImplemented('sandbox.verifyTrajectoryClaim')
}
