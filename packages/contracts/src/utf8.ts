// ─────────────────────────────────────────────────────────────────────────────
// Encodage UTF-8 — écrit ici, et non emprunté.
//
// §E (cahier L82) : « Les empreintes utilisent SHA-256 sur des octets
// canoniques documentés. Objets JSON triés récursivement par clé ; ordre des
// tableaux conservé ; UTF-8 [...] »
//
// POURQUOI PAS `TextEncoder` NI `Buffer`. `packages/contracts/tsconfig.json`
// fixe `types: []` et `lib: ES2023` pour rendre MÉCANIQUE l'indépendance
// d'ADR-005 §3 : ni `Buffer` (Node) ni `TextEncoder` (WHATWG) n'y sont
// déclarés, donc les employer exigerait de rouvrir cette porte pour tout le
// paquet. L'encodage UTF-8 tient en vingt lignes ; la porte, elle, ne se
// rouvre pas à moitié.
//
// Les paires de substitution sont recomposées ; une demi-paire isolée est
// remplacée par U+FFFD. `JSON.stringify` étant « well-formed » depuis ES2019,
// il échappe déjà les demi-paires en `\uXXXX` : le cas ne se présente donc pas
// sur la sortie canonique, mais le laisser produire des octets invalides
// rendrait l'empreinte dépendante d'un détail non documenté.
// ─────────────────────────────────────────────────────────────────────────────

/** Octets UTF-8 d'une chaîne. Aucune dépendance, aucun état. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i)

    if (cp >= 0xd800 && cp <= 0xdbff) {
      const low = i + 1 < text.length ? text.charCodeAt(i + 1) : 0
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = (cp - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
        i += 1
      } else {
        cp = 0xfffd
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd
    }

    if (cp < 0x80) {
      out.push(cp)
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
    }
  }
  return Uint8Array.from(out)
}

/** Hexadécimal minuscule d'une suite d'octets. */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] as number
    out += (b >>> 4).toString(16) + (b & 0x0f).toString(16)
  }
  return out
}
