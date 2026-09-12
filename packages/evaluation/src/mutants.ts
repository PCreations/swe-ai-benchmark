// ─────────────────────────────────────────────────────────────────────────────
// LE REGISTRE DES MUTANTS SÉMANTIQUES (livrable L239), et ce qu'un mutant EST
// ici.
//
// L241 nomme SIX fautes métier obligatoires : surbooking, doublon idempotent,
// FIFO inversé, frontière 24 h fausse, fuite intertenant, perte de migration.
// L243 ajoute la contrainte qui décide de la forme de ce fichier : « il ne
// suffit pas que le mutant plante au build : pour les fautes métier
// obligatoires, le programme doit DÉMARRER PUIS ÉCHOUER sur la propriété
// ciblée ».
//
// UN MUTANT EST DONC UNE ALTÉRATION DE SOURCE, PAS UN DRAPEAU. Chaque entrée
// ci-dessous décrit une ÉDITION TEXTUELLE nommée, appliquée à une COPIE du
// programme témoin de T09 (`infra/temoins/app/**`). La copie est compilée —
// c'est-à-dire chargée par Node — et DÉMARRÉE ; elle annonce son adresse comme
// le témoin conforme ; puis elle échoue sur UNE propriété métier, et sur une
// seule. C'est cette unicité qui rend « détecté par SON contrôle nommé »
// (L241) observable : si une mutation faisait tomber deux contrôles, le mutant
// ne nommerait plus rien.
//
// POURQUOI UNE COPIE, ET JAMAIS LE PROGRAMME DE T09 LUI-MÊME. T09 est une
// dépendance, donc « un contrat déjà validé » (L147). Le muter en place
// reviendrait à faire dépendre le verdict de T10 d'une modification de
// l'arbre ; la copie est jetée à la fin de chaque qualification, et le
// programme de T09 reste octet pour octet celui que T09 a prouvé.
//
// POURQUOI CHAQUE ÉDITION PORTE SON RANG D'OCCURRENCE. Deux anchors
// apparaissent deux fois dans `operations.mjs` — une fois dans la branche
// morte d'une fixture de T09, une fois dans le corps réellement généré.
// Éditer la mauvaise produirait un mutant qui démarre et ne ment jamais,
// c'est-à-dire un mutant « détecté » par personne. Le rang est donc obligatoire
// et vérifié : une édition qui ne s'applique pas exactement une fois lève
// `MUTATION_NOT_APPLICABLE` au lieu de produire un verdict.
// ─────────────────────────────────────────────────────────────────────────────
import { QualificationViolation } from './errors.js'

/** Une édition textuelle nommée, appliquée à un fichier du programme témoin. */
export interface SourceEdit {
  /** Chemin relatif à `infra/temoins/app/`. */
  readonly file: string
  /** Le texte à remplacer, tel qu'il apparaît dans la source. */
  readonly find: string
  /** Le texte de remplacement. */
  readonly replace: string
  /** Rang (1-based) de l'occurrence à éditer. */
  readonly occurrence: number
}

/** Une entrée du registre des mutants sémantiques. */
export interface SemanticMutant {
  /** Nom accepté par `qualifyWitness` (convention d'appel III.3). */
  readonly name: string
  /** La faute métier injectée — l'une des six de L241. */
  readonly fault: string
  /** Le contrôle qui doit la détecter, et lui seul (L241). */
  readonly control: string
  /** Ce que la mutation change, en clair. */
  readonly description: string
  /** La ligne du cahier qui EXIGE cette faute. */
  readonly cahier_line: number
  readonly edits: readonly SourceEdit[]
}

const OPERATIONS = 'operations.mjs'
const MIGRATIONS = 'migrations.mjs'

/**
 * Les six mutants. L'ordre est celui de L241 ; il est aussi celui dans lequel
 * la matrice les enregistre.
 */
export const SEMANTIC_MUTANTS: readonly SemanticMutant[] = [
  {
    name: 'mutant-capacite-servie-plus-une',
    fault: 'surbooking',
    control: 'controle-de-capacite',
    description:
      "la capacite servie devient la capacite declaree PLUS UNE, pour tout creneau : " +
      "une demande concurrente est confirmee alors que le creneau est plein",
    cahier_line: 241,
    edits: [
      {
        file: OPERATIONS,
        find: "const capaciteServie = fautes.overbook_by_one ? 'v_cap + 1' : 'v_cap'",
        replace: "const capaciteServie = 'v_cap + 1'",
        occurrence: 1,
      },
    ],
  },
  {
    name: 'mutant-doublon-idempotent',
    fault: 'doublon-idempotent',
    control: "controle-d-idempotence",
    description:
      "le registre de deduplication D-6 n'est plus consulte a la reservation et " +
      "n'oppose plus sa cle primaire : rejouer la MEME cle avec les MEMES arguments " +
      'cree une SECONDE reservation au lieu de rendre la reponse conservee',
    cahier_line: 241,
    edits: [
      {
        file: OPERATIONS,
        find: '  SELECT * INTO v_prev FROM operations WHERE idempotency_key = v_key;',
        replace: '  SELECT * INTO v_prev FROM operations WHERE idempotency_key = v_key AND false;',
        occurrence: 1,
      },
      {
        file: OPERATIONS,
        find: "    VALUES (v_key, 'reserve', v_digest, 201, v_body);",
        replace:
          "    VALUES (v_key, 'reserve', v_digest, 201, v_body)\n" +
          '    ON CONFLICT ON CONSTRAINT operations_pk DO NOTHING;',
        occurrence: 2,
      },
    ],
  },
  {
    name: 'mutant-fifo-inverse',
    fault: 'fifo-inverse',
    control: 'controle-fifo',
    description:
      "la promotion depuis la file prend la DERNIERE sequence d'admission au lieu " +
      'de la premiere : FIFO devient LIFO (cahier L123)',
    cahier_line: 241,
    edits: [
      {
        file: OPERATIONS,
        find: "const ordre = fautes.waitlist_lifo ? 'DESC' : 'ASC'",
        replace: "const ordre = 'DESC'",
        occurrence: 1,
      },
    ],
  },
  {
    name: 'mutant-frontiere-24h-fausse',
    fault: 'frontiere-24h-fausse',
    control: 'controle-de-frontiere-24h',
    description:
      "la frontiere des 24 h devient EXCLUSIVE : l'annulation demandee exactement " +
      'a la limite est refusee, alors que L119 la dit INCLUSE',
    cahier_line: 241,
    edits: [
      {
        file: OPERATIONS,
        find: 'IF v_dead IS NOT NULL AND v_at > v_dead THEN',
        replace: 'IF v_dead IS NOT NULL AND v_at >= v_dead THEN',
        occurrence: 1,
      },
    ],
  },
  {
    name: 'mutant-fuite-intertenant',
    fault: 'fuite-intertenant',
    control: 'controle-de-cloisonnement-intertenant',
    description:
      "l'exportation controlee ne filtre plus par locataire : un acteur interroge " +
      "sous un AUTRE locataire recoit les reservations de `legacy` au lieu du " +
      'NOT_FOUND que L123 impose',
    cahier_line: 241,
    edits: [
      {
        file: OPERATIONS,
        find: '`r.tenant = v_tenant AND (v_actor IS NULL OR r.actor = v_actor)`',
        replace: '`(v_actor IS NULL OR r.actor = v_actor)`',
        occurrence: 1,
      },
      {
        file: OPERATIONS,
        find:
          '`SELECT EXISTS(SELECT 1 FROM reservations r WHERE r.actor = v_actor AND r.tenant = v_tenant)`',
        replace: '`SELECT EXISTS(SELECT 1 FROM reservations r WHERE r.actor = v_actor)`',
        occurrence: 1,
      },
    ],
  },
  {
    name: 'mutant-perte-de-migration',
    fault: 'perte-de-migration',
    control: "controle-d-integrite-de-migration",
    description:
      'le palier 4 perd EXACTEMENT une reservation creee aux paliers precedents ' +
      'avant de rattacher les autres au locataire legacy : la migration reussit, ' +
      'et une ligne reellement creee a disparu (cahier L231)',
    cahier_line: 241,
    edits: [
      {
        file: MIGRATIONS,
        find: "UPDATE reservations SET tenant = 'legacy';",
        replace:
          'DELETE FROM reservations WHERE reservation_id IN (\n' +
          '  SELECT reservation_id FROM reservations ORDER BY reservation_id LIMIT 1);\n' +
          "UPDATE reservations SET tenant = 'legacy';",
        occurrence: 1,
      },
    ],
  },
]

export function mutantByName(name: string): SemanticMutant | null {
  return SEMANTIC_MUTANTS.find((m) => m.name === name) ?? null
}

/**
 * Applique UNE édition et rend la source éditée. L'occurrence demandée doit
 * exister : une mutation qui ne s'applique pas n'est pas un mutant permissif,
 * c'est un harnais cassé, et elle est donc LEVÉE, jamais rendue comme verdict.
 */
export function applyEdit(source: string, edit: SourceEdit, mutant: string): string {
  const parts = source.split(edit.find)
  const occurrences = parts.length - 1
  if (occurrences < edit.occurrence) {
    throw new QualificationViolation(
      'MUTATION_NOT_APPLICABLE',
      `/mutants/${mutant}/${edit.file}`,
      `occurrence ${String(edit.occurrence)} demandee, ${String(occurrences)} trouvee(s) pour ` +
        `${JSON.stringify(edit.find.slice(0, 80))}`,
    )
  }
  const avant = parts.slice(0, edit.occurrence).join(edit.find)
  const apres = parts.slice(edit.occurrence).join(edit.find)
  return `${avant}${edit.replace}${apres}`
}
