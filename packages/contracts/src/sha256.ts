// ─────────────────────────────────────────────────────────────────────────────
// SHA-256 (FIPS 180-4) — implémentation locale, sans aucune dépendance.
//
// §E (cahier L82) : « Les empreintes utilisent SHA-256 sur des octets
// canoniques documentés. »
//
// OÙ VIT SHA-256, ET POURQUOI ICI. ADR-005 §3 veut ce paquet indépendant de
// tout SDK et de tout appel externe, et `packages/contracts/tsconfig.json`
// rend cette propriété mécanique par `types: []` : `node:crypto` n'y est même
// pas typé. Deux issues étaient possibles — rouvrir la porte pour tout le
// paquet, ou écrire l'algorithme. FIPS 180-4 est une spécification publique,
// figée, longue de deux cents lignes, et le cahier en épingle un vecteur de
// contrôle littéral (L173 : les octets `abc` donnent `ba7816bf…15ad`). La
// seconde issue est donc celle qui garde le contrat vérifiable sans élargir
// la surface de confiance du paquet le plus bas de la pile.
//
// Toute l'arithmétique est en entiers 32 bits non signés : `Math.imul` pour la
// multiplication, `>>> 0` pour la renormalisation. Aucun flottant n'intervient,
// aucune lecture d'horloge, aucun état de module — deux appels sur la même
// entrée rendent les mêmes octets, ce que T02.A3 confronte au vecteur du
// cahier et T02.A1/A2 au déterminisme de l'empreinte.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4.2.2 de FIPS 180-4 : les 64 constantes K sont les 32 bits de tête des
 * parties fractionnaires des racines cubiques des 64 premiers nombres premiers.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** §5.3.3 : valeurs initiales H — racines carrées des huit premiers premiers. */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
])

const u32 = (a: Uint32Array, i: number): number => a[i] as number
const byte = (a: Uint8Array, i: number): number => a[i] as number
const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0

/**
 * Empreinte SHA-256 d'une suite d'octets : 32 octets.
 *
 * L'entrée n'est jamais modifiée ; la fonction est pure.
 */
export function sha256(input: Uint8Array): Uint8Array {
  const len = input.length

  // §5.1.1 : bourrage — un bit 1, des zéros, puis la longueur en BITS sur
  // 64 bits gros-boutiens. La longueur est écrite octet par octet plutôt que
  // par un décalage 32 bits : au-delà de 2^29 octets, `len << 3` déborderait.
  const blocks = Math.floor((len + 9 + 63) / 64)
  const total = blocks * 64
  const msg = new Uint8Array(total)
  msg.set(input, 0)
  msg[len] = 0x80
  let bits = len * 8
  for (let i = total - 1; i >= total - 8; i -= 1) {
    msg[i] = bits % 256
    bits = Math.floor(bits / 256)
  }

  const h = new Uint32Array(H0)
  const w = new Uint32Array(64)

  for (let b = 0; b < blocks; b += 1) {
    const off = b * 64

    // §6.2.2 étape 1 : préparation du calendrier de messages.
    for (let t = 0; t < 16; t += 1) {
      const p = off + t * 4
      w[t] =
        ((byte(msg, p) << 24) |
          (byte(msg, p + 1) << 16) |
          (byte(msg, p + 2) << 8) |
          byte(msg, p + 3)) >>>
        0
    }
    for (let t = 16; t < 64; t += 1) {
      const x = u32(w, t - 15)
      const y = u32(w, t - 2)
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0
      w[t] = (u32(w, t - 16) + s0 + u32(w, t - 7) + s1) >>> 0
    }

    let a = u32(h, 0)
    let bb = u32(h, 1)
    let c = u32(h, 2)
    let d = u32(h, 3)
    let e = u32(h, 4)
    let f = u32(h, 5)
    let g = u32(h, 6)
    let hh = u32(h, 7)

    // §6.2.2 étape 3 : les 64 tours.
    for (let t = 0; t < 64; t += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const t1 = (hh + S1 + ch + u32(K, t) + u32(w, t)) >>> 0
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & bb) ^ (a & c) ^ (bb & c)) >>> 0
      const t2 = (S0 + maj) >>> 0

      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = bb
      bb = a
      a = (t1 + t2) >>> 0
    }

    h[0] = (u32(h, 0) + a) >>> 0
    h[1] = (u32(h, 1) + bb) >>> 0
    h[2] = (u32(h, 2) + c) >>> 0
    h[3] = (u32(h, 3) + d) >>> 0
    h[4] = (u32(h, 4) + e) >>> 0
    h[5] = (u32(h, 5) + f) >>> 0
    h[6] = (u32(h, 6) + g) >>> 0
    h[7] = (u32(h, 7) + hh) >>> 0
  }

  const out = new Uint8Array(32)
  for (let i = 0; i < 8; i += 1) {
    const v = u32(h, i)
    out[i * 4] = (v >>> 24) & 0xff
    out[i * 4 + 1] = (v >>> 16) & 0xff
    out[i * 4 + 2] = (v >>> 8) & 0xff
    out[i * 4 + 3] = v & 0xff
  }
  return out
}
