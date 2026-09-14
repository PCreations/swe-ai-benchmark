// ─────────────────────────────────────────────────────────────────────────────
// Réseau du candidat (L321, L323/A2-A3) : un netns dédié par sandbox, une
// paire veth vers l'hôte, et un filtrage nftables en liste blanche appliqué
// DEPUIS L'HÔTE — jamais depuis le processus candidat (L321 : « les
// permissions et le filtrage sont contrôlés hors du processus candidat »).
//
// POURQUOI LE FILTRAGE EST SUR DEUX HOOKS (input ET forward), PAS UN SEUL.
// Une destination « hors liste blanche » de la suite peut être :
//   - une adresse LOCALE à l'hôte (les talons `base-centrale`/`Temporal`/
//     `fournisseur-direct`/`collecteur-interdit` de T19.spec.ts §IV, qui
//     écoutent sur l'interface routable de l'hôte) : le noyau la traite comme
//     un paquet à délivrer localement, donc via le hook INPUT ;
//   - une adresse d'un AUTRE sandbox (netns distinct, joignable seulement en
//     transitant par l'hôte) : le noyau la traite comme un paquet à
//     transmettre, donc via le hook FORWARD.
// Filtrer un seul des deux laisserait l'autre cas grand ouvert. Les deux
// chaînes de base sautent, par interface d'entrée (`iifname`), vers UNE
// chaîne par sandbox — ainsi provisionner/détruire un sandbox n'ajoute/retire
// qu'un seul saut, jamais une renumérotation des règles des autres.
//
// POURQUOI UN NETNS EXTERNE (`ip netns add`), PAS `unshare --net` DANS LE
// CONTENEUR CANDIDAT. Un netns créé par le candidat lui-même (à l'intérieur
// d'un user namespace qu'il possède) lui donnerait CAP_NET_ADMIN sur CE netns
// — donc le pouvoir de supprimer les règles nft qui le contiennent. Le netns
// est ici créé et peuplé par le contrôleur (ce module), qui tourne hors du
// candidat ; `SandboxHandle` ne reçoit qu'un netns déjà scellé.
// ─────────────────────────────────────────────────────────────────────────────
import { sh, trySh } from './sh.js'
import type { NetPlan } from './ids.js'

const NFT_TABLE = 'bench_sandbox'
const NFT_IN = 'ingress_in'
const NFT_FWD = 'ingress_fwd'

let baseReady = false

/** Idempotent : sûr à rappeler à chaque provisionnement. */
export function ensureBaseNetworking(): void {
  sh(`echo 1 > /proc/sys/net/ipv4/ip_forward`)
  if (baseReady) return
  trySh(`nft add table inet ${NFT_TABLE}`)
  trySh(
    `nft add chain inet ${NFT_TABLE} ${NFT_IN} { type filter hook input priority filter\\; policy accept\\; }`,
  )
  trySh(
    `nft add chain inet ${NFT_TABLE} ${NFT_FWD} { type filter hook forward priority filter\\; policy accept\\; }`,
  )
  baseReady = true
}

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

export interface EgressEntry {
  readonly host: string
  readonly port: number
}

function chainNameFor(short: string): string {
  return `sb_${short}`
}

export function createSandboxNetwork(short: string, plan: NetPlan, allowed: readonly EgressEntry[]): void {
  ensureBaseNetworking()
  sh(`ip netns add ${plan.netnsName}`)
  sh(`ip link add ${plan.hostVeth} type veth peer name ${plan.ctrVeth}`)
  sh(`ip link set ${plan.ctrVeth} netns ${plan.netnsName}`)
  sh(`ip addr add ${plan.hostIp}/30 dev ${plan.hostVeth}`)
  sh(`ip link set ${plan.hostVeth} up`)
  sh(`ip netns exec ${plan.netnsName} ip addr add ${plan.ctrIp}/30 dev ${plan.ctrVeth}`)
  sh(`ip netns exec ${plan.netnsName} ip link set ${plan.ctrVeth} up`)
  sh(`ip netns exec ${plan.netnsName} ip link set lo up`)
  sh(`ip netns exec ${plan.netnsName} ip route add default via ${plan.hostIp}`)

  const chain = chainNameFor(short)
  sh(`nft add chain inet ${NFT_TABLE} ${chain}`)
  for (const e of allowed) {
    if (!IPV4_RE.test(e.host) || !Number.isInteger(e.port) || e.port < 1 || e.port > 65535) {
      throw new Error(`allowedEgress invalide : ${e.host}:${e.port}`)
    }
    sh(`nft add rule inet ${NFT_TABLE} ${chain} ip daddr ${e.host} tcp dport ${e.port} accept`)
  }
  sh(`nft add rule inet ${NFT_TABLE} ${chain} drop`)
  sh(`nft add rule inet ${NFT_TABLE} ${NFT_IN} iifname "${plan.hostVeth}" jump ${chain}`)
  sh(`nft add rule inet ${NFT_TABLE} ${NFT_FWD} iifname "${plan.hostVeth}" jump ${chain}`)
}

export function destroySandboxNetwork(short: string, plan: NetPlan): void {
  const chain = chainNameFor(short)
  // Retirer les sauts avant la chaîne elle-même : un handle de règle nft se
  // périme si on supprime la chaîne visée en premier sur certaines versions.
  trySh(`nft flush chain inet ${NFT_TABLE} ${chain}`)
  trySh(
    `sh -c 'nft -a list chain inet ${NFT_TABLE} ${NFT_IN} | grep "${plan.hostVeth}" | grep -o "handle [0-9]*" | while read -r _ h; do nft delete rule inet ${NFT_TABLE} ${NFT_IN} handle "$h"; done'`,
  )
  trySh(
    `sh -c 'nft -a list chain inet ${NFT_TABLE} ${NFT_FWD} | grep "${plan.hostVeth}" | grep -o "handle [0-9]*" | while read -r _ h; do nft delete rule inet ${NFT_TABLE} ${NFT_FWD} handle "$h"; done'`,
  )
  trySh(`nft delete chain inet ${NFT_TABLE} ${chain}`)
  trySh(`ip netns delete ${plan.netnsName}`)
  // La suppression du netns retire déjà l'extrémité côté conteneur ; l'autre
  // moitié de la paire veth (côté hôte) disparaît avec — mais on force au cas
  // où l'ordre du noyau ne l'aurait pas fait.
  trySh(`ip link delete ${plan.hostVeth}`)
}

export function netnsPath(plan: NetPlan): string {
  return `/var/run/netns/${plan.netnsName}`
}
