// ─────────────────────────────────────────────────────────────────────────────
// Dérivation d'identifiants courts et stables à partir de `trajectoryId`.
//
// POURQUOI UN HACHAGE, PAS `trajectoryId` TEL QUEL. Les noms d'interface Linux
// sont bornés à 15 octets (IFNAMSIZ - 1) : `trajectoryId` (fabriqué par la
// suite, cf. T19.spec.ts `nomUnique`) est bien plus long. Un identifiant court
// et déterministe évite aussi toute collision de sous-réseau entre deux
// sandboxes provisionnés dans la même suite.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'

export function shortId(trajectoryId: string): string {
  return createHash('sha1').update(trajectoryId).digest('hex').slice(0, 10)
}

export interface NetPlan {
  readonly netnsName: string
  readonly hostVeth: string
  readonly ctrVeth: string
  readonly hostIp: string
  readonly ctrIp: string
}

/** Sous-réseau /30 dédié, dérivé du hachage — jamais 127.0.0.0/8 (cf. suite
 * §IV : une adresse de loopback n'est routable depuis aucun netns isolé). */
export function netPlanFor(short: string): NetPlan {
  const n = parseInt(short.slice(0, 4), 16) % 16384
  const third = Math.floor(n / 64) % 256
  const fourthBase = (n % 64) * 4
  return {
    netnsName: `bench-${short}`,
    hostVeth: `bs${short.slice(0, 6)}h`,
    ctrVeth: `bs${short.slice(0, 6)}c`,
    hostIp: `10.77.${third}.${fourthBase + 1}`,
    ctrIp: `10.77.${third}.${fourthBase + 2}`,
  }
}
