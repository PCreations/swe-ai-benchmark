// ─────────────────────────────────────────────────────────────────────────────
// Validation structurée d'un manifeste de campagne (T03, livrable 2 de L179).
//
// TROIS FAMILLES DE REFUS, ET UNE RAISON POUR CHACUNE :
//
//   FORME      L80 — « les JSON de domaine sont stricts : propriétés inconnues
//              rejetées, enums explicites, nombres non finis interdits ». Le
//              parcours suit `CAMPAIGN_MANIFEST_SCHEMA` et nomme le CHEMIN
//              EXACT de la faute, pas seulement sa nature (T03.A4).
//   IDENTITÉ   L181 — « un id en doublon est rejeté ». Le cahier dit « un id »,
//              sans le restreindre aux configurations : le schéma marque chaque
//              espèce porteuse d'identité, et le contrôle les traverse toutes.
//   EMPREINTE  L82/L181 — « empreinte vérifiée avant toute exécution et mismatch
//              refusé ». Le contrôle compare l'empreinte DÉCLARÉE au SHA-256 des
//              octets canoniques RECALCULÉS : un contrôle qui ne relirait que le
//              champ déclaré laisserait passer un corpus altéré.
//
// POURQUOI UN REFUS LEVÉ, ET NON UN RÉSULTAT RENDU.
// Un refus rendu comme valeur se laisse ignorer par l'appelant, et §D-12 exige
// qu'un `PASS` repose sur des assertions réellement exécutées. Lever oblige
// l'appelant à traiter le refus ; et surtout, cela rend IMPOSSIBLE la production
// d'une cellule après un refus, ce que « avant toute exécution » demande.
//
// POURQUOI LE CHEMIN EST UNE CHAÎNE ET NON UN TABLEAU.
// `path` est lisible dans le message ET disponible comme propriété. Un rapport
// de refus doit rester lisible par un humain qui lit un log ; c'est le sens de
// « rejeté avec chemin exact ».
//
// AUCUN IMPORT DE NODE. Ce paquet compile sous `types: []` : `node:crypto`,
// `node:worker_threads` et `node:child_process` y sont inaccessibles. « Aucune
// création de worker pendant une compilation de manifeste » (L183) n'est donc
// pas une promesse tenue par discipline, mais une impossibilité de typage. Le
// SHA-256 vient de `@bench/contracts`, qui porte FIPS 180-4 écrit sur place.
// ─────────────────────────────────────────────────────────────────────────────
import { CAMPAIGN_MANIFEST_SCHEMA, CORPUS_DIGEST_FIELD, canonicalDigest, isMicroUsd } from '@bench/contracts'
import type { CampaignManifest, CanonicalValue, ManifestSchemaNode } from '@bench/contracts'

/** Les natures de refus que T03 sait produire. */
export const MANIFEST_REJECTION_KINDS = [
  'UNKNOWN_PROPERTY',
  'MISSING_PROPERTY',
  'TYPE_MISMATCH',
  'ENUM_VALUE_UNKNOWN',
  'NON_FINITE_NUMBER',
  'AMOUNT_NOT_NON_NEGATIVE_INTEGER_STRING',
  'SHA256_NOT_HEX64',
  'ARRAY_TOO_SHORT',
  'DUPLICATE_ID',
  'DIGEST_MISMATCH',
] as const

export type ManifestRejectionKind = (typeof MANIFEST_REJECTION_KINDS)[number]

/**
 * Refus d'un manifeste. Porte sa nature ET le chemin exact de la valeur fautive
 * — L181 : « rejeté avec chemin exact ». Le message les réénonce parce qu'un
 * refus n'est utile que s'il se lit sans débogueur.
 */
export class ManifestRejection extends Error {
  readonly kind: ManifestRejectionKind
  readonly path: string
  readonly detail: string

  constructor(kind: ManifestRejectionKind, path: string, detail: string) {
    super(`${kind} @ ${path} : ${detail}`)
    this.name = 'ManifestRejection'
    this.kind = kind
    this.path = path
    this.detail = detail
  }
}

export function isManifestRejection(e: unknown): e is ManifestRejection {
  return e instanceof ManifestRejection
}

/** Chemin d'un enfant. La racine est `''`, si bien qu'un champ racine est `/budgets`. */
const enfant = (base: string, segment: string | number): string => `${base}/${String(segment)}`

const HEX64 = /^[0-9a-f]{64}$/

const estObjetSimple = (v: unknown): v is { readonly [k: string]: unknown } =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Type observé, pour un message de refus qui dit ce qu'il a vu. */
function typeObserve(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/**
 * Collecteur d'identités : par espèce (`configuration_id`, `budget_id`, …), la
 * valeur déjà vue et le chemin où elle l'a été. Le refus nomme LES DEUX
 * occurrences — un doublon dont on ne montre qu'une moitié n'est pas localisé.
 */
type Identites = Map<string, Map<string, string>>

/**
 * Parcourt la valeur contre le nœud de schéma. Lève au PREMIER écart : le
 * cahier demande un refus nommant un chemin, pas un rapport exhaustif, et
 * s'arrêter garantit qu'aucune règle ultérieure ne s'exécute sur une valeur
 * déjà connue comme mal formée.
 */
function valider(valeur: unknown, noeud: ManifestSchemaNode, chemin: string, ids: Identites): void {
  switch (noeud.type) {
    case 'string':
      if (typeof valeur !== 'string') {
        throw new ManifestRejection('TYPE_MISMATCH', chemin, `chaine attendue, recu ${typeObserve(valeur)}`)
      }
      return

    case 'boolean':
      if (typeof valeur !== 'boolean') {
        throw new ManifestRejection('TYPE_MISMATCH', chemin, `booleen attendu, recu ${typeObserve(valeur)}`)
      }
      return

    case 'enum': {
      if (typeof valeur !== 'string') {
        throw new ManifestRejection('TYPE_MISMATCH', chemin, `chaine attendue, recu ${typeObserve(valeur)}`)
      }
      if (!noeud.members.includes(valeur)) {
        // L80 : « enums explicites ». Le refus énumère les membres admis, sans
        // quoi corriger le manifeste exigerait de lire le code.
        throw new ManifestRejection(
          'ENUM_VALUE_UNKNOWN',
          chemin,
          `${JSON.stringify(valeur)} hors de [${noeud.members.join(', ')}]`,
        )
      }
      return
    }

    case 'integer': {
      if (typeof valeur !== 'number') {
        throw new ManifestRejection('TYPE_MISMATCH', chemin, `entier attendu, recu ${typeObserve(valeur)}`)
      }
      // L80 : « nombres non finis interdits ». Contrôlé AVANT l'intégrité, parce
      // que `Number.isInteger(NaN)` est faux pour la mauvaise raison.
      if (!Number.isFinite(valeur)) {
        throw new ManifestRejection('NON_FINITE_NUMBER', chemin, String(valeur))
      }
      if (!Number.isInteger(valeur) || valeur < noeud.minimum) {
        throw new ManifestRejection(
          'TYPE_MISMATCH',
          chemin,
          `entier >= ${String(noeud.minimum)} attendu, recu ${String(valeur)}`,
        )
      }
      return
    }

    case 'amount_micro_usd':
      // L80 : « chaînes d'entiers non négatifs en micro-USD ». La règle vient de
      // `@bench/contracts` (T02) ; la réécrire ici ferait deux définitions d'un
      // même invariant monétaire.
      if (!isMicroUsd(valeur)) {
        throw new ManifestRejection(
          'AMOUNT_NOT_NON_NEGATIVE_INTEGER_STRING',
          chemin,
          `${JSON.stringify(valeur)} n est pas une chaine d entier non negatif en micro-USD`,
        )
      }
      return

    case 'sha256_hex':
      if (typeof valeur !== 'string' || !HEX64.test(valeur)) {
        throw new ManifestRejection(
          'SHA256_NOT_HEX64',
          chemin,
          `64 hexadecimaux minuscules attendus, recu ${JSON.stringify(valeur)}`,
        )
      }
      return

    case 'array': {
      if (!Array.isArray(valeur)) {
        throw new ManifestRejection('TYPE_MISMATCH', chemin, `tableau attendu, recu ${typeObserve(valeur)}`)
      }
      if (valeur.length < noeud.minItems) {
        throw new ManifestRejection(
          'ARRAY_TOO_SHORT',
          chemin,
          `au moins ${String(noeud.minItems)} element(s) attendu(s), recu ${String(valeur.length)}`,
        )
      }
      // Ordre conservé (L82) : l'index EST une information de chemin.
      valeur.forEach((item, i) => {
        valider(item, noeud.items, enfant(chemin, i), ids)
      })
      return
    }

    case 'object': {
      if (!estObjetSimple(valeur)) {
        throw new ManifestRejection('TYPE_MISMATCH', chemin, `objet attendu, recu ${typeObserve(valeur)}`)
      }

      // (1) CHAMPS ABSENTS D'ABORD. « budget absent rejeté avec chemin exact »
      //     (L181) : le chemin d'un champ absent est celui qu'il OCCUPERAIT.
      //     Contrôlé avant les propriétés inconnues, parce qu'un manifeste
      //     tronqué se diagnostique mieux par ce qui lui manque.
      for (const nom of Object.keys(noeud.properties)) {
        if (!Object.prototype.hasOwnProperty.call(valeur, nom)) {
          throw new ManifestRejection(
            'MISSING_PROPERTY',
            enfant(chemin, nom),
            `propriete obligatoire absente du contrat CampaignManifest`,
          )
        }
      }

      // (2) PROPRIÉTÉS INCONNUES. L80 : « propriétés inconnues rejetées ». Le
      //     chemin porte le nom fautif en dernier segment, ce qui le localise
      //     jusque dans un tableau : `/configurations/1/cadence_de_rafale`.
      for (const nom of Object.keys(valeur)) {
        if (!Object.prototype.hasOwnProperty.call(noeud.properties, nom)) {
          throw new ManifestRejection(
            'UNKNOWN_PROPERTY',
            enfant(chemin, nom),
            `propriete non declaree par le contrat CampaignManifest`,
          )
        }
      }

      // (3) IDENTITÉ. Enregistrée AVANT la descente, pour que le doublon soit
      //     rapporté sur la propriété qui le porte et non sur un descendant.
      const espece = noeud.identity
      if (espece !== undefined) {
        const brut = valeur[espece]
        if (typeof brut === 'string') {
          const vues = ids.get(espece) ?? new Map<string, string>()
          const deja = vues.get(brut)
          if (deja !== undefined) {
            throw new ManifestRejection(
              'DUPLICATE_ID',
              enfant(chemin, espece),
              `${JSON.stringify(brut)} deja declare a ${deja}`,
            )
          }
          vues.set(brut, enfant(chemin, espece))
          ids.set(espece, vues)
        }
      }

      for (const [nom, sous] of Object.entries(noeud.properties)) {
        valider(valeur[nom], sous, enfant(chemin, nom), ids)
      }
      return
    }
  }
}

/**
 * Vérifie l'empreinte du corpus (L82, T03.A6).
 *
 * L'empreinte porte sur les octets canoniques du corpus PRIVÉ de son champ
 * `digest` — un champ ne peut pas entrer dans le calcul de sa propre valeur.
 * Elle est RECALCULÉE, jamais relue : c'est ce qui distingue « le manifeste
 * déclare une empreinte » de « le corpus est celui qu'il prétend être », et ce
 * qui fait tomber un corpus altéré dont le digest déclaré serait resté juste.
 *
 * Corollaire de la canonisation : deux rédactions du même corpus, aux clés
 * permutées à tous les niveaux, donnent la MÊME empreinte et restent donc
 * acceptées. Ce qui est refusé est un contenu différent, pas une mise en page
 * différente.
 */
function verifierEmpreinteDuCorpus(corpus: { readonly [k: string]: unknown }): void {
  const sansDigest: { [k: string]: CanonicalValue } = {}
  for (const [k, v] of Object.entries(corpus)) {
    if (k !== CORPUS_DIGEST_FIELD) sansDigest[k] = v as CanonicalValue
  }

  const recalculee = canonicalDigest(sansDigest)
  const declaree = corpus[CORPUS_DIGEST_FIELD]

  if (declaree !== recalculee) {
    throw new ManifestRejection(
      'DIGEST_MISMATCH',
      `/corpus/${CORPUS_DIGEST_FIELD}`,
      `empreinte SHA-256 declaree ${JSON.stringify(declaree)}, empreinte recalculee sur octets canoniques ${JSON.stringify(recalculee)}`,
    )
  }
}

/**
 * Valide un document et le rend comme `CampaignManifest`, ou LÈVE une
 * `ManifestRejection`.
 *
 * ORDRE DES CONTRÔLES, ET IL COMPTE :
 *   1. la forme et les identités, en un seul parcours du schéma ;
 *   2. l'empreinte du corpus.
 * L'empreinte vient après la forme parce qu'elle se calcule sur une structure —
 * un corpus dont `entries` ne serait pas un tableau ne se hache pas, il se
 * refuse. Les deux précèdent toute production de cellule : « empreinte vérifiée
 * AVANT toute exécution » (L181).
 */
export function validateCampaignManifest(document: unknown): CampaignManifest {
  valider(document, CAMPAIGN_MANIFEST_SCHEMA, '', new Map())

  // Le parcours ci-dessus a déjà prouvé la forme ; la conversion ne fait donc
  // que nommer ce qui est désormais connu.
  const manifeste = document as unknown as CampaignManifest
  verifierEmpreinteDuCorpus(manifeste.corpus as unknown as { readonly [k: string]: unknown })
  return manifeste
}
