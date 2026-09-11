// ─────────────────────────────────────────────────────────────────────────────
// Octets canoniques (§E).
//
// « Les empreintes utilisent SHA-256 sur des octets canoniques documentés.
//   Objets JSON triés récursivement par clé ; ordre des tableaux conservé ;
//   UTF-8 ; aucun timestamp technique ajouté à un objet métier déterministe. »
//
// Ce module produit les OCTETS, pas l'empreinte : le hachage appartient à
// l'appelant, et garder `node:crypto` hors de ce paquet est ce qui rend
// mécanique la propriété d'ADR-005 §3 (aucune dépendance externe).
//
// `undefined` est REFUSÉ plutôt qu'omis. Omettre silencieusement donnerait la
// même empreinte à « champ absent » et « champ présent à undefined » : deux
// objets métier distincts se confondraient, ce qui casserait la comparaison
// canonique que §G impose aux résultats.
// ─────────────────────────────────────────────────────────────────────────────
import { ContractViolation } from './errors.js'

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [k: string]: CanonicalValue }

export function canonicalJson(value: CanonicalValue, path = '$'): string {
  if (value === null) return 'null'

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'string':
      return JSON.stringify(value)
    case 'number':
      // §E : « nombres non finis interdits ».
      if (!Number.isFinite(value)) throw new ContractViolation('NON_FINITE_NUMBER', path, String(value))
      return JSON.stringify(value)
    case 'object':
      break
    default:
      throw new ContractViolation('TYPE_MISMATCH', path, typeof value)
  }

  if (Array.isArray(value)) {
    // Ordre des tableaux CONSERVÉ : un tableau est une séquence, pas un ensemble.
    return '[' + value.map((v, i) => canonicalJson(v, `${path}[${i}]`)).join(',') + ']'
  }

  const obj = value as { readonly [k: string]: CanonicalValue }
  const keys = Object.keys(obj).sort()
  const parts: string[] = []
  for (const k of keys) {
    const v = obj[k]
    if (v === undefined) throw new ContractViolation('TYPE_MISMATCH', `${path}.${k}`, 'undefined')
    parts.push(JSON.stringify(k) + ':' + canonicalJson(v, `${path}.${k}`))
  }
  return '{' + parts.join(',') + '}'
}
