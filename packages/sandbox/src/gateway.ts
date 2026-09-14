// ─────────────────────────────────────────────────────────────────────────────
// Point de décision « de la passerelle » (L323, A4, §III.3).
//
// PURE LOGIQUE DE PROCESSUS — aucun réseau, aucune E/S. `verifyTrajectoryClaim`
// est le contrôle que « la passerelle » (côté contrôleur, jamais dans le
// candidat — L321) applique quand un jeton lui est présenté avec une
// identité de trajectoire revendiquée : la suite (§III.3) n'exige que la
// PRÉSENCE d'un code de refus non vide, jamais sa valeur exacte, donc le nom
// exact ci-dessous est fixé par CE paquet à titre d'exemple, pas par le
// cahier (cf. T19.spec.ts §II).
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from 'node:crypto'

const tokenToTrajectory = new Map<string, string>()

export function mintGatewayCredential(trajectoryId: string): { token: string } {
  const token = randomBytes(24).toString('hex')
  tokenToTrajectory.set(token, trajectoryId)
  return { token }
}

export interface TrajectoryClaimResult {
  readonly accepted: boolean
  readonly code?: string
}

export function verifyTrajectoryClaim(claimedTrajectoryId: string, token: string): TrajectoryClaimResult {
  const bound = tokenToTrajectory.get(token)
  if (bound === undefined) {
    return { accepted: false, code: 'GATEWAY_TOKEN_UNKNOWN' }
  }
  if (bound !== claimedTrajectoryId) {
    return { accepted: false, code: 'TRAJECTORY_IDENTITY_MISMATCH' }
  }
  return { accepted: true }
}
