/**
 * acceptance/T14.spec.ts — suite d'acceptation de la tache T14.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T14.A1 behaviour — tous les cas du contrat ArtifactStore passent sur le
 *                      service reel de test
 *   T14.A2 absence   — un transfert interrompu puis repris ne cree pas deux
 *                      objets logiques
 *   T14.A3 behaviour — deux uploads simultanes des memes octets donnent la
 *                      meme reference
 *   T14.A4 refusal   — une identite limitee a un prefixe ne peut pas lire le
 *                      prefixe prive d'evaluation
 *   T14.A5 refusal   — expiration d'une autorisation donne un refus explicite,
 *                      jamais un fallback anonyme
 *   T14.A6 absence   — les erreurs ne publient aucun secret dans les rapports
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T14 — `packages/storage` et `infra`.
 * ADR-001 : cet aveuglement est PROCEDURAL, donc une discipline auditable au
 * diff, pas une barriere technique. Le contrat teste ci-dessous n'a ete releve
 * NI dans l'implementation, NI dans `infra/`, NI par `git show` ; il est derive
 * de docs/specs/T14.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle :
 *
 *   L273  titre : « Ajouter l'adaptateur S3 et son test de contrat reel »
 *   L275  livrables : « adaptateur S3, SERVICE S3 COMPATIBLE POUR LES TESTS
 *         LOCAUX et IDENTITES LIMITEES PAR USAGE »
 *   L277  les six cas d'acceptation, mot pour mot
 *   L279  fin : « empreintes des images et preuves d'appels enregistrees. LES
 *         PREFIXES NE SONT PAS, SEULS, UN MECANISME D'AUTORISATION ; LE
 *         CONTROLE DOIT ETRE EXERCE PAR LE STOCKAGE OU UN SERVICE D'ACCES. »
 *   L269  les six cas du contrat ArtifactStore (T13), que A1 rejoue sur le
 *         service reel — et les trois seuls litteraux que le cahier fixe pour
 *         ce contrat : `ARTIFACT_CORRUPT`, `ARTIFACT_MISSING`, `../escape`
 *   L267  « port `ArtifactStore`, adaptateur local et manifeste de contenu » —
 *         c'est le contrat dont A1 exige la validite sur S3
 *   L271  « interface testee en contrat, LIMITES DE TAILLE DECLAREES,
 *         EMPREINTES VERIFIEES AVANT USAGE »
 *   L82   « les empreintes utilisent SHA-256 » — l'algorithme de la reference
 *         de contenu n'est pas au choix de l'implementation
 *   L80   JSON de domaine stricts, « timestamps UTC ISO 8601 » — d'ou la forme
 *         de l'echeance d'une autorisation en A5
 *   L65   invariant 3 : « le candidat n'a pas les identifiants du stockage de
 *         recherche, de la base centrale ou de l'evaluateur » — c'est le sens
 *         du « prefixe prive d'evaluation » de A4
 *   L34   « les interfaces sont implementees par adaptateurs »
 *   L141  « points d'injection nommes » — c'est ce qui rend A2 reproductible :
 *         un « transfert interrompu » ne s'obtient pas en esperant une panne
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *   L559  chaque suite d'integration recoit un `test_run_id` technique unique
 *         et ses PREFIXES D'ARTEFACTS ; il ne modifie aucune valeur metier
 *   L519  (T41.A6, rattache a A5/A6 par la carte) « nettoyage ne cible que les
 *         ressources portant l'identite de test »
 *   L28   « un defaut de prerequis produit BLOCKED, jamais PASS »
 *   L631  « les listes de cas definissent un minimum : des tests
 *         supplementaires sont possibles lorsqu'ils couvrent un risque
 *         concret »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Aucune fixture de §F ne porte sur T14 : la racine gelee
 * `acceptance/reference/**` ne contient que les dix fixtures arithmetiques
 * F-BOOTSTRAP … F-RESERVATION, dont aucune ne decrit le stockage objet. Tout
 * litteral COMPARE dans une assertion porte donc un commentaire `// cahier:L<n>`
 * resoluble par `sed -n '<n>p' docs/cahier.md`, et il n'y en a que dix :
 *
 *   `ARTIFACT_CORRUPT` — L269, refus de lecture apres corruption
 *   `ARTIFACT_MISSING` — L269, refus de lecture d'un objet absent
 *   `../escape`        — L269, le nom d'entree d'archive, cite tel quel
 *   `sha256`           — L82, l'algorithme des empreintes
 *   1 (octet)          — L269, « UN octet change »
 *   0 (ecriture)       — L269, « SANS ecriture hors destination »
 *   0 (visibilite)     — L269, « n'est pas visible comme objet final »
 *   1 / 2 (objets)     — L277, « ne cree pas DEUX objets logiques »
 *   2 (uploads)        — L277, « DEUX uploads simultanes »
 *   0 (secret)         — L277, « les erreurs ne publient AUCUN secret »
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * ses charges utiles, ses prefixes derives du `test_run_id` (L559), ses
 * archives, ses durees d'expiration et les empreintes SHA-256 qu'elle CALCULE
 * elle-meme selon L82 : ce sont des ENTREES de la suite, jamais des valeurs
 * attendues. La reference de contenu n'est JAMAIS codee en dur — le cahier
 * n'en fixe pas le format, et l'inventer serait affirmer une regle qu'il
 * n'enonce pas. La suite n'observe que ses PROPRIETES.
 *
 * LES CODES HTTP NE SONT PAS DES VALEURS DU CAHIER. Ce sont les constantes du
 * protocole que « le service reel de test » (L277) parle. La suite ne fige donc
 * aucun code exact pour un refus : elle exige la CLASSE 4xx, parce que le
 * cahier dit « refuse » et non « 403 ». Mesure faite sur le service de test du
 * socle : un GET anonyme repond 403, une URL signee perimee repond 400
 * (`InvalidRequest`), une signature invalide repond 403 (`AccessDenied`). Fixer
 * 403 aurait rendu A5 rouge pour la mauvaise raison.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * LE TEMOIN INDEPENDANT : LE SERVICE LUI-MEME, HORS DE L'API DE L'ADAPTATEUR.
 *
 * T13 recoupait chaque fait par une lecture directe de l'arbre de fichiers.
 * L'equivalent ici est une lecture directe du service objet : la suite embarque
 * son PROPRE client S3 (signature AWS SigV4, `node:http`, aucune dependance
 * ajoutee) et interroge le service sans passer par un seul export de
 * l'implementation.
 *
 *   objets(prefixe)   — ListObjectsV2 : les cles reellement presentes
 *   uploads(prefixe)  — ListMultipartUploads : les transferts EN SUSPENS
 *   lireBrut(cle)     — GET signe : les octets reellement stockes
 *   ecrireBrut(cle)   — PUT signe
 *   anonyme(cle)      — GET SANS aucune signature
 *   urlSignee(cle, n) — URL pre-signee expirant dans n secondes
 *
 * C'est ce recoupement qui interdit l'implementation qui simulerait S3 en
 * memoire ou sur disque : ses octets n'apparaitraient jamais dans le service.
 * C'est aussi lui qui donne son sens a L279 — « le controle doit etre exerce
 * par le stockage ou un service d'acces » : A4 et A5 exigent le refus sur des
 * requetes SIGNEES QUE LA SUITE EMET ELLE-MEME, hors de portee de toute
 * verification cote client.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CONTRAT — CE QUE T14 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Le paquet interroge est celui que le registre declare : `packages/storage`.
 * Il est charge par le nom de son manifeste, sinon par `src/index.ts`. Le
 * chargement ne LEVE jamais : un import casse produirait « Test suite failed to
 * run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et refuse
 * comme preuve. Chaque cas asserte donc lui-meme le chargement.
 *
 * HUIT ROLES ET UNE CONSTANTE, nommes par leur FONCTION et resolus par une
 * courte liste d'alias. Les alias sont une tolerance de NOMMAGE, jamais de
 * COMPORTEMENT.
 *
 *   s3TestServiceConfig()                  -> les coordonnees du service de
 *                                             test local                (L275)
 *   openS3ArtifactStore(opts)              -> ouvre l'adaptateur S3      (L275)
 *   createScopedIdentity(opts)             -> une identite limitee par usage
 *                                                                       (L275)
 *   putArtifact(h, octets, opts?)          -> ecrit, rend un manifeste   (L267)
 *   getArtifact(h, ref)                    -> relit les octets           (L269)
 *   listArtifacts(h)                       -> ce qui est VISIBLE         (L269)
 *   extractArchive(h, {archive_path, dest_dir}) -> extraction bornee     (L269)
 *   artifactSizeLimit                      -> la limite declaree         (L271)
 *
 * ONZE CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC FIXEES
 * ICI (elles sont reprises telles quelles dans verification/mutants/T14.json) :
 *
 *   1. COORDONNEES DU SERVICE. `s3TestServiceConfig()` rend un objet plat
 *      portant au moins `endpoint` (URL http/https), `region`, `bucket`,
 *      `access_key_id` et `secret_access_key`. Sans lui, « service S3
 *      compatible pour les tests locaux » (L275) ne serait pas un livrable
 *      OBSERVABLE : la suite ne saurait pas ou regarder. A defaut de ce role,
 *      la suite retombe sur l'environnement (`S3_ENDPOINT`, `S3_BUCKET`,
 *      `S3_REGION`, `S3_ACCESS_KEY_ID`/`AWS_ACCESS_KEY_ID`,
 *      `S3_SECRET_ACCESS_KEY`/`AWS_SECRET_ACCESS_KEY`). Elle ne SAUTE jamais
 *      pour autant : faute de coordonnees, elle ECHOUE en nommant ce qui
 *      manque — un cas qui se desactiverait tout seul serait exactement le
 *      « retour anticipe conditionne par l'environnement » que §G interdit, et
 *      l'absence de prerequis se decide au niveau de la TACHE (L28), pas au
 *      niveau du cas (`blockable: false` pour les six).
 *
 *   2. OUVERTURE. `openS3ArtifactStore` recoit un objet PLAT et STRICT
 *      (L80 : proprietes inconnues rejetees) :
 *        { endpoint, region, bucket, prefix, access_key_id, secret_access_key }
 *      et, pour A5 seulement, la propriete optionnelle `expires_at` — un
 *      timestamp UTC ISO 8601 (L80) au-dela duquel l'autorisation est perimee.
 *      `prefix` est le PREFIXE D'ARTEFACTS de L559 : il isole les executions,
 *      il n'est PAS un mecanisme d'autorisation (L279).
 *
 *   3. ECRITURE ET MANIFESTE DE CONTENU. `putArtifact(h, octets)` recoit des
 *      octets BRUTS et rend le MANIFESTE DE CONTENU de L267 : un objet portant
 *      au moins `ref` (chaine non vide), `digest` (SHA-256 hexadecimal des
 *      octets, L82) et `size`.
 *
 *   4. OCTETS STOCKES TELS QUELS. Les octets d'un artefact se retrouvent, a
 *      l'identique, dans AU MOINS UN objet du service sous le prefixe du
 *      magasin. L'adaptateur ne comprime ni ne chiffre : sans cette convention,
 *      « passent sur le service REEL de test » (L277) n'aurait aucun temoin
 *      independant, et un magasin en memoire serait indistinguable.
 *
 *   5. RELECTURE. `getArtifact(h, ref)` rend les octets EXACTS, ou REFUSE.
 *      Rendre un buffer vide, `null` ou `undefined` a la place d'un refus n'est
 *      pas une tolerance : c'est le defaut que le contrat condamne.
 *
 *   6. VISIBILITE. `listArtifacts(h)` rend ce que le magasin publie comme
 *      objets finaux — une liste de references, ou de manifestes portant une
 *      `ref`.
 *
 *   7. DEUX POINTS D'INJECTION NOMMES (L141). Le troisieme argument de
 *      `putArtifact` est un objet plat optionnel `{ fault }`, qui prend
 *      exactement l'une de ces deux valeurs :
 *        'INTERRUPT_BEFORE_PUBLISH'  les octets sont transferes, puis
 *                                    l'ecriture est interrompue AVANT la
 *                                    publication de l'objet final  (contrat,
 *                                    rejoue par A1)
 *        'INTERRUPT_DURING_UPLOAD'   le transfert est interrompu EN COURS, de
 *                                    sorte qu'un appel ULTERIEUR des memes
 *                                    octets soit une REPRISE              (A2)
 *      Un point d'injection est un LIVRABLE, pas une commodite de test.
 *      L'appel interrompu peut LEVER ou RENDRE un refus : la suite tolere les
 *      deux, parce que le cas ne porte pas sur la forme de l'interruption mais
 *      sur ce qui reste apres elle.
 *
 *   8. REPRISE. Rappeler `putArtifact(h, octets)` avec les MEMES octets, apres
 *      une interruption, est la REPRISE du transfert interrompu. Le cahier ne
 *      nomme pas d'autre geste : « un transfert interrompu puis repris »
 *      (L277) est la meme demande, reemise.
 *
 *   9. IDENTITES LIMITEES PAR USAGE. `createScopedIdentity({ usage, prefix })`
 *      rend un descripteur plat portant au moins `access_key_id`,
 *      `secret_access_key`, et les coordonnees sous lesquelles cette identite
 *      est valide (`endpoint`, `region`, `bucket`, `prefix`, a defaut
 *      heritees de `s3TestServiceConfig()`). `usage` est la chaine que la suite
 *      passe pour distinguer deux usages ; elle n'en impose aucune valeur
 *      canonique. Le MECANISME n'est pas impose : condition de prefixe,
 *      seau distinct ou service d'acces, L279 laisse le choix — la suite
 *      n'observe que le refus, sur des requetes qu'elle signe elle-meme.
 *
 *  10. REFUS. Un refus peut etre LEVE ou RENDU. Dans les deux cas il porte un
 *      CODE qui NOMME sa cause. Un `TypeError`, un « is not a function » ou un
 *      `ENOENT` brut n'est PAS un refus : c'est un plantage, et la suite le
 *      distingue explicitement. C'est le defaut decisif du mode de preuve
 *      `refusal` : un stub qui leve rendrait A4 et A5 verts sans rien prouver.
 *      C'est pourquoi A4 et A5 portent chacun un CONTROLE DE CAPACITE — la
 *      demonstration qu'un NON-refus existe dans le meme mecanisme.
 *
 *  11. LIMITE DECLAREE. `artifactSizeLimit` est soit un nombre, soit une
 *      fonction sans argument qui en rend un (L271). La suite exige que ce soit
 *      un entier fini strictement positif ; elle ne lui impose aucune valeur.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne prouve pas la coherence d'un checkpoint entre base, fichiers et
 *    files : c'est la barriere de T15 (L281).
 *  • Elle ne prouve pas l'isolation du candidat — sentinelle privee illisible
 *    depuis un conteneur, sortie reseau bloquee : c'est T19 (L317). Elle prouve
 *    la part de cette propriete qui vit dans le STOCKAGE : une identite limitee
 *    par usage ne lit pas le prefixe prive d'evaluation (L65).
 *  • Elle ne prouve pas les « empreintes des images » de L279 : une image de
 *    conteneur n'est pas un objet du contrat ArtifactStore, et les six cas
 *    requis n'en parlent pas.
 *  • Elle n'impose AUCUNE disposition de cles, aucun format de reference : L275
 *    nomme un adaptateur, un service de test et des identites, et rien d'autre.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import * as https from 'node:https';
import { createHash, createHmac } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 240_000;

/* ────────────────────────────────────────────────────────────────── socle */

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (
      fs.existsSync(path.join(dir, '.git')) ||
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO = findRepoRoot();

/** Le `source_path` de code que verification/tasks.json declare pour T14. */
const PACKAGES = ['storage'] as const;

/** SHA-256 hexadecimal — L82. C'est la suite qui CALCULE, jamais l'implementation. */
function sha256(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex'); // cahier:L82
}

function hmac(cle: Buffer | string, donnee: string): Buffer {
  return createHmac('sha256', cle).update(donnee, 'utf8').digest();
}

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 12) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (ArrayBuffer.isView(v)) {
    const b = Buffer.from(
      (v as Uint8Array).buffer,
      (v as Uint8Array).byteOffset,
      (v as Uint8Array).byteLength,
    );
    return `<${String(b.length)} octets sha256=${sha256(b).slice(0, 16)}>`;
  }
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'symbol') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) {
    const code = (v as unknown as Json).code;
    return `${v.name}${typeof code === 'string' ? `(${code})` : ''}: ${v.message}`;
  }
  if (v instanceof Map) {
    return `Map{${[...v.entries()]
      .map(([k, x]) => `${rendu(k, profondeur + 1, vus)}:${rendu(x, profondeur + 1, vus)}`)
      .join(',')}}`;
  }
  if (v instanceof Set) return `Set[${[...v].map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

const dormir = (ms: number): Promise<void> =>
  new Promise((resoudre) => {
    setTimeout(resoudre, ms);
  });

/* ═══════════════ les litteraux du cahier, et rien d'autre ══════════════ */

/** L269 : « lecture apres corruption donne `ARTIFACT_CORRUPT` ». */
const CODE_CORROMPU = 'ARTIFACT_CORRUPT'; // cahier:L269
const MOTIF_CORROMPU = /ARTIFACT_CORRUPT/i;

/** L269 : « fichier absent donne `ARTIFACT_MISSING` ». */
const CODE_ABSENT = 'ARTIFACT_MISSING'; // cahier:L269
const MOTIF_ABSENT = /ARTIFACT_MISSING/i;

/** L269 : le nom d'entree d'archive, cite tel quel par le cahier. */
const ENTREE_TRAVERSEE = '../escape'; // cahier:L269

/** L269 : « un octet change ». */
const UN_OCTET = 1; // cahier:L269

/** L269 : « sans ecriture hors destination ». */
const AUCUNE_ECRITURE = 0; // cahier:L269

/** L269 : « n'est pas visible comme objet final » — zero occurrence. */
const AUCUNE_VISIBILITE = 0; // cahier:L269

/** L277 : « ne cree pas DEUX objets logiques » — donc exactement un. */
const UN_SEUL_OBJET = 1; // cahier:L277

/**
 * L277 : les DEUX objets logiques que le cahier interdit. La suite s'en sert
 * comme TEMOIN : elle fabrique deliberement deux objets distincts et exige que
 * son compteur en voie deux. Sans ce temoin, « il n'y en a pas deux » serait
 * vrai d'un compteur casse.
 */
const DEUX_OBJETS = 2; // cahier:L277

/** L277 : « DEUX uploads simultanes des memes octets ». */
const DEUX_UPLOADS = 2; // cahier:L277

/** L277 : un transfert repris ne laisse AUCUN transfert en suspens derriere lui. */
const AUCUN_UPLOAD_EN_SUSPENS = 0; // cahier:L277

/** L277 : « les erreurs ne publient AUCUN secret dans les rapports ». */
const AUCUN_SECRET = 0; // cahier:L277

/**
 * Codes HTTP : constantes du PROTOCOLE, pas valeurs du cahier. La suite ne fige
 * aucun code exact de refus — seulement la classe 4xx, parce que L277 dit
 * « refuse », pas « 403 ».
 */
const HTTP_OK = 200;
const HTTP_REFUS_MIN = 400;
const HTTP_REFUS_MAX = 500;

const estRefusHttp = (s: number): boolean => s >= HTTP_REFUS_MIN && s < HTTP_REFUS_MAX;

/** Un refus d'autorisation, nomme. L277/L279 n'en fixent pas le code. */
const MOTIF_DENI =
  /DENIED|DENI|FORBID|INTERDIT|UNAUTHOR|NON_AUTORIS|NOT_AUTHORIZ|ACCESS|ACCES|SCOPE|PORTEE|PREFIX|PREFIXE|PERMISSION|POLICY|POLITIQUE|REFUS|REJECT|NO_SUCH_BUCKET|NOSUCHBUCKET/i;

/** Un refus d'autorisation PERIMEE, nomme. L277 n'en fixe pas le code non plus. */
const MOTIF_EXPIRE =
  /EXPIR|PERIME|OUTDATED|STALE|CREDENTIAL|IDENTIFIANT|AUTHORIZ|AUTORISATION|AUTH|DENIED|DENI|FORBID|UNAUTHOR|INTERDIT|REFUS|REJECT/i;

/**
 * L269 ne nomme pas le code du refus d'extraction. La suite n'en invente pas
 * un : elle exige un refus qui NOMME sa cause parmi celles que L269 et L271
 * enoncent. Ce qu'elle refuse est le refus MUET.
 */
const MOTIF_CHEMIN_REFUSE =
  /TRAVERS|ESCAPE|ECHAPP|OUTSIDE|HORS|UNSAFE|INVALID_PATH|BAD_PATH|PATH|CHEMIN|ABSOLUT|ABSOLU|SYMLINK|LIEN|LINK|DENIED|FORBID|INTERDIT|REFUS|REJECT|ARCHIVE|ENTRY|ENTREE/i;

/** Ce qui n'est PAS un refus : un plantage. La distinction est decisive. */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ENOENT|EACCES|ECONNREFUSED|undefined is not/;

/* ══════════════════════════ namespace d'execution ═════════════════════ */

/**
 * `test_run_id` technique de L559 : tous les prefixes d'artefacts de cette
 * execution en derivent, de sorte que deux executions simultanees
 * n'interferent pas. Il n'entre dans AUCUNE assertion — c'est un namespace,
 * pas une valeur metier.
 */
const RUN = `t14_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const RACINE_S3 = `acceptance/${RUN}`;

/** Prefixe d'artefacts propre a un cas. */
const prefixe = (...parts: string[]): string => `${RACINE_S3}/${parts.join('/')}`;

/** Bac a sable local — uniquement pour les archives du contrat d'extraction. */
const SABLE = fs.mkdtempSync(path.join(os.tmpdir(), 't14-'));

function dossier(...parts: string[]): string {
  const p = path.join(SABLE, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/* ═════════════════ client S3 de la suite — temoin independant ═════════ */

interface Creds {
  accessKeyId: string;
  secretAccessKey: string;
}

interface Svc extends Creds {
  endpoint: string;
  region: string;
  bucket: string;
}

interface Reponse {
  status: number;
  body: Buffer;
  texte: string;
}

const encRfc3986 = (s: string): string =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const encChemin = (p: string): string => p.split('/').map(encRfc3986).join('/');

function horodatages(d: Date): { amz: string; jour: string } {
  const amz = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amz, jour: amz.slice(0, 8) };
}

function cleDeSignature(secret: string, jour: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, jour), region), 's3'), 'aws4_request');
}

interface RequeteSignee {
  url: string;
  headers: Record<string, string>;
}

/** Signature AWS SigV4 en en-tetes, adressage par chemin (`/bucket/cle`). */
function signer(
  svc: Svc,
  creds: Creds,
  methode: string,
  cle: string,
  query: Record<string, string>,
  corps: Buffer,
  maintenant: Date = new Date(),
): RequeteSignee {
  const u = new URL(svc.endpoint);
  const { amz, jour } = horodatages(maintenant);
  const host = u.port === '' ? u.hostname : `${u.hostname}:${u.port}`;
  const chemin = `/${encChemin(svc.bucket)}${cle === '' ? '' : `/${encChemin(cle)}`}`;
  const empreintePayload = sha256(corps);
  const qs = Object.keys(query)
    .sort()
    .map((k) => `${encRfc3986(k)}=${encRfc3986(query[k] as string)}`)
    .join('&');
  const entetes: Record<string, string> = {
    host,
    'x-amz-content-sha256': empreintePayload,
    'x-amz-date': amz,
  };
  const noms = Object.keys(entetes).sort();
  const signedHeaders = noms.join(';');
  const canonHeaders = noms.map((k) => `${k}:${(entetes[k] as string).trim()}\n`).join('');
  const canonique = [methode, chemin, qs, canonHeaders, signedHeaders, empreintePayload].join('\n');
  const portee = `${jour}/${svc.region}/s3/aws4_request`;
  const aSigner = [
    'AWS4-HMAC-SHA256',
    amz,
    portee,
    sha256(Buffer.from(canonique, 'utf8')),
  ].join('\n');
  const signature = createHmac('sha256', cleDeSignature(creds.secretAccessKey, jour, svc.region))
    .update(aSigner, 'utf8')
    .digest('hex');
  return {
    url: `${u.origin}${chemin}${qs === '' ? '' : `?${qs}`}`,
    headers: {
      ...entetes,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${portee}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** URL pre-signee (autorisation portee par la query string) expirant dans n secondes. */
function urlPresignee(
  svc: Svc,
  creds: Creds,
  cle: string,
  expireDans: number,
  maintenant: Date = new Date(),
): string {
  const u = new URL(svc.endpoint);
  const { amz, jour } = horodatages(maintenant);
  const host = u.port === '' ? u.hostname : `${u.hostname}:${u.port}`;
  const chemin = `/${encChemin(svc.bucket)}/${encChemin(cle)}`;
  const portee = `${jour}/${svc.region}/s3/aws4_request`;
  const q: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${creds.accessKeyId}/${portee}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expireDans),
    'X-Amz-SignedHeaders': 'host',
  };
  const qs = Object.keys(q)
    .sort()
    .map((k) => `${encRfc3986(k)}=${encRfc3986(q[k] as string)}`)
    .join('&');
  const canonique = ['GET', chemin, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const aSigner = [
    'AWS4-HMAC-SHA256',
    amz,
    portee,
    sha256(Buffer.from(canonique, 'utf8')),
  ].join('\n');
  const signature = createHmac('sha256', cleDeSignature(creds.secretAccessKey, jour, svc.region))
    .update(aSigner, 'utf8')
    .digest('hex');
  return `${u.origin}${chemin}?${qs}&X-Amz-Signature=${signature}`;
}

/**
 * `node:http` plutot que `fetch` : aucune couche de proxy, aucun agent partage,
 * et un controle exact des en-tetes signes. Une erreur de transport devient une
 * reponse de statut 0, jamais une exception qui ferait « Test suite failed to
 * run ».
 */
function demander(
  url: string,
  o: { methode?: string; headers?: Record<string, string>; body?: Buffer } = {},
): Promise<Reponse> {
  return new Promise((resoudre) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      resoudre({ status: 0, body: Buffer.alloc(0), texte: `URL-INVALIDE ${url}` });
      return;
    }
    const corps = o.body ?? Buffer.alloc(0);
    const transport = u.protocol === 'https:' ? https : http;
    const r = transport.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port === '' ? undefined : Number(u.port),
        path: `${u.pathname}${u.search}`,
        method: o.methode ?? 'GET',
        headers: { ...(o.headers ?? {}), 'content-length': String(corps.length) },
      },
      (rep) => {
        const morceaux: Buffer[] = [];
        rep.on('data', (c: Buffer) => morceaux.push(c));
        rep.on('end', () => {
          const body = Buffer.concat(morceaux);
          resoudre({
            status: rep.statusCode ?? 0,
            body,
            texte: body.subarray(0, 4096).toString('utf8'),
          });
        });
      },
    );
    r.on('error', (e: Error) => {
      resoudre({ status: 0, body: Buffer.alloc(0), texte: `TRANSPORT ${e.message}` });
    });
    if (corps.length > 0) r.write(corps);
    r.end();
  });
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

function balises(xml: string, nom: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`, 'g');
  let m = re.exec(xml);
  while (m !== null) {
    out.push(decodeXml(m[1] as string));
    m = re.exec(xml);
  }
  return out;
}

/* ─────────────────── operations brutes sur le service ────────────────── */

async function ecrireBrut(svc: Svc, creds: Creds, cle: string, octets: Buffer): Promise<Reponse> {
  const s = signer(svc, creds, 'PUT', cle, {}, octets);
  return demander(s.url, { methode: 'PUT', headers: s.headers, body: octets });
}

async function lireBrut(svc: Svc, creds: Creds, cle: string): Promise<Reponse> {
  const s = signer(svc, creds, 'GET', cle, {}, Buffer.alloc(0));
  return demander(s.url, { headers: s.headers });
}

async function supprimerBrut(svc: Svc, creds: Creds, cle: string): Promise<Reponse> {
  const s = signer(svc, creds, 'DELETE', cle, {}, Buffer.alloc(0));
  return demander(s.url, { methode: 'DELETE', headers: s.headers });
}

async function listerBrut(
  svc: Svc,
  creds: Creds,
  prefixeCle: string,
): Promise<{ status: number; cles: string[]; texte: string }> {
  const s = signer(
    svc,
    creds,
    'GET',
    '',
    { 'list-type': '2', prefix: prefixeCle, 'max-keys': '1000' },
    Buffer.alloc(0),
  );
  const r = await demander(s.url, { headers: s.headers });
  return { status: r.status, cles: balises(r.texte, 'Key'), texte: r.texte };
}

async function listerUploads(
  svc: Svc,
  creds: Creds,
  prefixeCle: string,
): Promise<{ status: number; uploads: string[]; texte: string }> {
  const s = signer(svc, creds, 'GET', '', { uploads: '', prefix: prefixeCle }, Buffer.alloc(0));
  const r = await demander(s.url, { headers: s.headers });
  return { status: r.status, uploads: balises(r.texte, 'UploadId'), texte: r.texte };
}

/** GET SANS aucune signature — c'est le « fallback anonyme » que L277 interdit. */
async function anonyme(svc: Svc, cle: string): Promise<Reponse> {
  const u = new URL(svc.endpoint);
  return demander(`${u.origin}/${encChemin(svc.bucket)}/${encChemin(cle)}`);
}

/* ═══════════════════════ chargement du paquet ══════════════════════════ */

interface Loaded {
  ok: boolean;
  via: string[];
  exportCount: number;
  flat: Map<string, unknown>;
  attempts: string[];
}

function flatten(ns: Ns, into: Map<string, unknown>): void {
  const put = (k: string, v: unknown): void => {
    if (!into.has(k)) into.set(k, v);
  };
  for (const [k, v] of Object.entries(ns)) {
    if (k === '__esModule') continue;
    put(k, v);
  }
  const def: unknown = ns.default;
  if (def !== null && def !== undefined && typeof def === 'object') {
    for (const [k, v] of Object.entries(def as Ns)) put(k, v);
  }
  for (const [k, v] of Object.entries(ns)) {
    if (k === '__esModule') continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Ns)) {
        put(`${k}.${k2}`, v2);
        put(k2, v2);
      }
    }
  }
}

function specifiersFor(pkg: string): string[] {
  const dir = path.join(REPO, 'packages', pkg);
  const out: string[] = [];
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: unknown };
      if (typeof j.name === 'string' && j.name.length > 0) out.push(j.name);
    } catch {
      /* manifeste illisible : on retombe sur le chemin de fichier */
    }
  }
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

async function loadPackages(): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  for (const pkg of PACKAGES) {
    let charge = false;
    for (const s of specifiersFor(pkg)) {
      if (charge) break;
      try {
        const mod = (await import(s)) as Ns;
        flatten(mod, flat);
        exportCount += Object.keys(mod).filter((k) => k !== '__esModule').length;
        via.push(s.replace(pathToFileURL(REPO).href, '<repo>'));
        charge = true;
      } catch (e) {
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet packages/${pkg} : aucun specificateur n'a repondu`);
  }
  return { ok: via.length > 0, via, exportCount, flat, attempts };
}

let LOADED: Loaded = {
  ok: false,
  via: [],
  exportCount: 0,
  flat: new Map(),
  attempts: ['beforeAll non execute'],
};

beforeAll(async () => {
  // Le chargement ne LEVE pas : un import casse produirait « Test suite failed
  // to run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement.
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `PAQUET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe(
    'charge',
  );
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ─────────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  s3TestServiceConfig: [
    's3TestServiceConfig',
    's3TestConfig',
    'testS3Config',
    's3TestService',
    'artifactStoreS3TestConfig',
    's3TestEndpoint',
    'localS3TestService',
    'objectStoreTestConfig',
  ],
  openS3ArtifactStore: [
    'openS3ArtifactStore',
    'createS3ArtifactStore',
    'openS3Store',
    'createS3Store',
    's3ArtifactStore',
    'makeS3ArtifactStore',
    'openObjectArtifactStore',
    'createObjectArtifactStore',
    'openArtifactStoreS3',
  ],
  createScopedIdentity: [
    'createScopedIdentity',
    'createScopedCredentials',
    'issueScopedIdentity',
    'issueScopedCredentials',
    'scopedIdentity',
    'createUsageIdentity',
    'createLimitedIdentity',
    'mintScopedIdentity',
    'grantScopedAccess',
  ],
  putArtifact: [
    'putArtifact',
    'writeArtifact',
    'storeArtifact',
    'saveArtifact',
    'addArtifact',
    'createArtifact',
    'putObject',
    'putBlob',
    'putContent',
    'put',
  ],
  getArtifact: [
    'getArtifact',
    'readArtifact',
    'loadArtifact',
    'fetchArtifact',
    'openArtifact',
    'getObject',
    'getBlob',
    'getContent',
    'get',
  ],
  listArtifacts: [
    'listArtifacts',
    'listArtifactRefs',
    'artifactRefs',
    'listObjects',
    'listBlobs',
    'listContent',
    'listRefs',
    'list',
  ],
  extractArchive: [
    'extractArchive',
    'extractArtifactArchive',
    'safeExtract',
    'extractSafely',
    'extractTar',
    'unpackArchive',
    'extractInto',
    'unpack',
    'extract',
  ],
};

/** Le role `artifactSizeLimit` n'est pas forcement une FONCTION (L271). */
const ALIAS_LIMITE_TAILLE = [
  'artifactSizeLimit',
  'ARTIFACT_SIZE_LIMIT',
  'maxArtifactBytes',
  'MAX_ARTIFACT_BYTES',
  'maxArtifactSizeBytes',
  'MAX_ARTIFACT_SIZE_BYTES',
  'artifactMaxBytes',
  'maxObjectBytes',
  'maxObjectSizeBytes',
  'maxContentBytes',
  'sizeLimitBytes',
  'SIZE_LIMIT_BYTES',
] as const;

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role] ?? [];
  for (const c of candidats) {
    const v = LOADED.flat.get(c);
    if (typeof v === 'function') {
      RESOLVED.set(role, v as Fonction);
      return v as Fonction;
    }
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of LOADED.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  for (const c of candidats) {
    const v = lower.get(c.toLowerCase());
    if (typeof v === 'function') {
      RESOLVED.set(role, v as Fonction);
      return v as Fonction;
    }
  }
  RESOLVED.set(role, null);
  return null;
}

function assertContrat(...roles: string[]): void {
  const manquants = roles.filter((r) => resolveOpt(r) === null);
  expect(
    manquants.length === 0
      ? 'contrat-resolu'
      : `CONTRAT-NON-SATISFAIT roles=[${manquants.join(', ')}] : aucun export parmi ` +
          manquants.map((r) => `${r}:[${(ROLES[r] ?? []).join('|')}]`).join(' ; ') +
          ` (${String(LOADED.exportCount)} exports de premier niveau observes dans ` +
          `${LOADED.via.join(', ') || 'aucun paquet'})`,
  ).toBe('contrat-resolu');
}

/** La limite declaree de L271 : un nombre, ou une fonction qui en rend un. */
function limiteDeTaille(): number | null {
  const lower = new Map<string, unknown>();
  for (const [k, v] of LOADED.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  for (const a of ALIAS_LIMITE_TAILLE) {
    const v = LOADED.flat.get(a) ?? lower.get(a.toLowerCase());
    if (typeof v === 'number') return v;
    if (typeof v === 'function') {
      try {
        const n: unknown = (v as Fonction)();
        if (typeof n === 'number') return n;
      } catch {
        /* une limite qui leve n'est pas une limite */
      }
    }
  }
  return null;
}

/* ───────────────────────── appel d'un role, refus compris */

interface Issue {
  refuse: boolean;
  via: string;
  texte: string;
  code: string | null;
  valeur: unknown;
  leve: boolean;
}

const CHAMPS_CODE =
  /^(code|error_code|errorcode|reason|motif|refusal|refus|rejection|rejet|error|erreur|status|statut|outcome|verdict|name|message)$/i;

function chaineDeCode(v: unknown, profondeur = 0): string | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || profondeur > 2) return null;
  if (ArrayBuffer.isView(v)) return null;
  const o = v as Json;
  for (const [k, x] of Object.entries(o)) {
    if (CHAMPS_CODE.test(k) && typeof x === 'string' && x.length > 0) return `${k}=${x}`;
  }
  for (const x of Object.values(o)) {
    const sous = chaineDeCode(x, profondeur + 1);
    if (sous !== null) return sous;
  }
  return null;
}

function qualifier(brut: unknown, leve: boolean, videEstRefus: boolean): Issue {
  const texte = rendu(brut);
  if (leve) {
    const e = brut as Json;
    const morceaux = [
      typeof e?.code === 'string' ? `code=${String(e.code)}` : null,
      brut instanceof Error ? `name=${brut.name}` : null,
      brut instanceof Error ? `message=${brut.message}` : null,
      chaineDeCode(brut),
    ].filter((x): x is string => x !== null);
    return {
      refuse: true,
      via: 'exception',
      texte: `LEVE ${texte}`,
      code: morceaux.join(' ') || texte,
      valeur: brut,
      leve: true,
    };
  }
  // Des octets rendus ne sont JAMAIS un refus : c'est la valeur attendue d'une
  // lecture, y compris vides — et c'est exactement le retour permissif que les
  // cas de refus doivent condamner.
  if (ArrayBuffer.isView(brut)) {
    return { refuse: false, via: 'octets', texte, code: null, valeur: brut, leve: false };
  }
  if (brut === null || brut === undefined) {
    return videEstRefus
      ? {
          refuse: true,
          via: 'nullish',
          texte: `RENDU-VIDE ${texte}`,
          code: null,
          valeur: brut,
          leve: false,
        }
      : { refuse: false, via: 'vide-tolere', texte, code: null, valeur: brut, leve: false };
  }
  if (typeof brut === 'object' && !Array.isArray(brut)) {
    const o = brut as Json;
    for (const drapeau of ['ok', 'valid', 'valide', 'success', 'accepted', 'published', 'written']) {
      if (o[drapeau] === false) {
        return {
          refuse: true,
          via: `${drapeau}=false`,
          texte,
          code: chaineDeCode(brut) ?? `${drapeau}=false`,
          valeur: brut,
          leve: false,
        };
      }
    }
    for (const cle of ['errors', 'issues', 'problems', 'erreurs', 'violations', 'refusals']) {
      const v = o[cle];
      if (Array.isArray(v) && v.length > 0) {
        return {
          refuse: true,
          via: `${cle}[${String(v.length)}]`,
          texte,
          code: rendu(v[0]),
          valeur: brut,
          leve: false,
        };
      }
    }
    const code = chaineDeCode(brut);
    if (
      code !== null &&
      (MOTIF_ABSENT.test(code) || MOTIF_CORROMPU.test(code)) &&
      !/PASS|OK=|SUCCESS|ACCEPT/i.test(code)
    ) {
      return { refuse: true, via: `code:${code}`, texte, code, valeur: brut, leve: false };
    }
  }
  return { refuse: false, via: 'valeur', texte, code: null, valeur: brut, leve: false };
}

async function appeler(role: string, args: unknown[], videEstRefus = true): Promise<Issue> {
  const f = resolveOpt(role);
  if (f === null) {
    return {
      refuse: true,
      via: 'contrat',
      texte: `ROLE-NON-RESOLU ${role}`,
      code: 'ROLE_NON_RESOLU',
      valeur: undefined,
      leve: false,
    };
  }
  try {
    return qualifier(await Promise.resolve(f(...args)), false, videEstRefus);
  } catch (e) {
    return qualifier(e, true, videEstRefus);
  }
}

function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(
    issue.refuse ? `REFUS-INATTENDU ${quoi} [${issue.via}] : ${court(issue.texte)}` : 'accepte',
  ).toBe('accepte');
  return issue.valeur;
}

/**
 * Un refus NOMME. La distinction avec un plantage est decisive : un stub qui
 * leve `TypeError` satisferait « ca a echoue » sans rien prouver, et c'est
 * exactement le faux PASS contre lequel le mode de preuve `refusal` met en
 * garde (verification/cases.lock.json).
 */
function exigerRefusNomme(issue: Issue, motif: RegExp, canonique: string, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(issue.texte)}`).toBe('refuse');
  expect(
    MARQUEURS_DE_PLANTAGE.test(issue.texte)
      ? `PLANTAGE-AU-LIEU-D-UN-REFUS-NOMME ${quoi} : ${court(issue.texte)}`
      : 'refus-et-non-plantage',
  ).toBe('refus-et-non-plantage');
  const code = issue.code ?? '';
  expect(
    motif.test(code) || motif.test(issue.texte)
      ? 'refus-nomme'
      : `REFUS-SANS-CAUSE-NOMMEE ${quoi} : attendu un code decrivant ${String(motif)} ` +
          `(canonique : ${canonique}), observe ${court(issue.code ?? issue.texte, 400)}`,
  ).toBe('refus-nomme');
}

/* ──────────────────── lecture tolerante des manifestes ─────────────── */

function champ(v: unknown, noms: readonly string[]): unknown {
  if (v === null || typeof v !== 'object') return undefined;
  const o = v as Json;
  for (const n of noms) if (o[n] !== undefined) return o[n];
  for (const conteneur of [
    'manifest',
    'manifeste',
    'entry',
    'entree',
    'artifact',
    'object',
    'record',
    'value',
    'data',
    'result',
    'receipt',
    'recu',
    'identity',
    'identite',
    'credentials',
    'config',
  ]) {
    const sous = o[conteneur];
    if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) {
      const s = sous as Json;
      for (const n of noms) if (s[n] !== undefined) return s[n];
    }
  }
  return undefined;
}

const NOMS_REF = [
  'ref',
  'reference',
  'content_ref',
  'contentRef',
  'artifact_ref',
  'artifactRef',
  'content_reference',
  'contentReference',
  'uri',
  'url',
  'address',
  'key',
  'cid',
  'id',
] as const;

const NOMS_DIGEST = [
  'digest',
  'sha256',
  'sha_256',
  'content_digest',
  'contentDigest',
  'hash',
  'checksum',
  'fingerprint',
  'empreinte',
] as const;

const NOMS_TAILLE = [
  'size_bytes',
  'sizeBytes',
  'size',
  'byte_length',
  'byteLength',
  'content_length',
  'contentLength',
  'length',
  'taille',
] as const;

const NOMS_ACCESS_KEY = [
  'access_key_id',
  'accessKeyId',
  'access_key',
  'accessKey',
  'key_id',
  'keyId',
] as const;

const NOMS_SECRET_KEY = [
  'secret_access_key',
  'secretAccessKey',
  'secret_key',
  'secretKey',
  'secret',
] as const;

const NOMS_ENDPOINT = ['endpoint', 'endpoint_url', 'endpointUrl', 'url', 'address'] as const;
const NOMS_REGION = ['region', 'aws_region', 'awsRegion', 's3_region', 's3Region'] as const;
const NOMS_BUCKET = ['bucket', 'bucket_name', 'bucketName', 'seau'] as const;
const NOMS_PREFIXE = ['prefix', 'prefixe', 'key_prefix', 'keyPrefix'] as const;

const texteDe = (v: unknown, noms: readonly string[]): string | null => {
  const x = champ(v, noms);
  return typeof x === 'string' && x.length > 0 ? x : null;
};

function refDe(v: unknown): string | null {
  if (typeof v === 'string') return v.length > 0 ? v : null;
  const r = champ(v, NOMS_REF);
  return typeof r === 'string' && r.length > 0 ? r : null;
}

const digestDe = (v: unknown): string | null => texteDe(v, NOMS_DIGEST);

function tailleDe(v: unknown): number | null {
  const t = champ(v, NOMS_TAILLE);
  return typeof t === 'number' ? t : null;
}

function octets(v: unknown): Buffer | null {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  if (v instanceof ArrayBuffer) return Buffer.from(new Uint8Array(v));
  if (v !== null && typeof v === 'object') {
    for (const n of ['bytes', 'octets', 'buffer', 'data', 'content', 'contenu', 'body', 'payload']) {
      const s = (v as Json)[n];
      if (Buffer.isBuffer(s) || s instanceof Uint8Array || s instanceof ArrayBuffer) {
        return octets(s);
      }
    }
  }
  return null;
}

/* ═══════ coordonnees du service de test, et sondage independant ═══════ */

interface ConfigResolue {
  svc: Svc | null;
  source: string;
  manque: string[];
}

let CONFIG: ConfigResolue | null = null;

async function configDuService(): Promise<ConfigResolue> {
  if (CONFIG !== null) return CONFIG;
  const env = process.env;
  let brut: unknown = null;
  let source = 'aucune';
  if (resolveOpt('s3TestServiceConfig') !== null) {
    const issue = await appeler('s3TestServiceConfig', [], false);
    if (!issue.refuse) {
      brut = issue.valeur;
      source = `role s3TestServiceConfig -> ${court(rendu(brut), 200)}`;
    } else {
      source = `role s3TestServiceConfig a REFUSE : ${court(issue.texte, 200)}`;
    }
  }
  const depuisEnv = {
    endpoint: env.S3_ENDPOINT ?? null,
    region: env.S3_REGION ?? env.AWS_REGION ?? null,
    bucket: env.S3_BUCKET ?? null,
    accessKeyId: env.S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID ?? null,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? null,
  };
  const endpoint = texteDe(brut, NOMS_ENDPOINT) ?? depuisEnv.endpoint;
  const region = texteDe(brut, NOMS_REGION) ?? depuisEnv.region;
  const bucket = texteDe(brut, NOMS_BUCKET) ?? depuisEnv.bucket;
  const accessKeyId = texteDe(brut, NOMS_ACCESS_KEY) ?? depuisEnv.accessKeyId;
  const secretAccessKey = texteDe(brut, NOMS_SECRET_KEY) ?? depuisEnv.secretAccessKey;
  const manque = [
    endpoint === null ? 'endpoint' : null,
    region === null ? 'region' : null,
    bucket === null ? 'bucket' : null,
    accessKeyId === null ? 'access_key_id' : null,
    secretAccessKey === null ? 'secret_access_key' : null,
  ].filter((x): x is string => x !== null);
  CONFIG = {
    svc:
      manque.length === 0
        ? {
            endpoint: endpoint as string,
            region: region as string,
            bucket: bucket as string,
            accessKeyId: accessKeyId as string,
            secretAccessKey: secretAccessKey as string,
          }
        : null,
    source:
      source === 'aucune' || manque.length > 0
        ? `${source} ; environnement : ${Object.entries(depuisEnv)
            .map(([k, v]) => `${k}=${v === null ? 'absent' : 'present'}`)
            .join(', ')}`
        : source,
    manque,
  };
  return CONFIG;
}

/**
 * Rend le service, apres avoir EXIGE qu'il reponde. Le sondage est une
 * assertion : faute de coordonnees utilisables, le cas echoue en nommant ce qui
 * manque — il ne se saute pas. §G interdit le retour anticipe conditionne par
 * l'environnement, et l'absence de prerequis se decide au niveau de la TACHE
 * (L28), pas au niveau du cas.
 */
async function service(quoi: string): Promise<Svc> {
  const c = await configDuService();
  expect(
    c.svc !== null
      ? 'coordonnees-du-service-resolues'
      : `SERVICE-S3-DE-TEST-NON-DECLARE (${quoi}) : champs manquants [${c.manque.join(', ')}]. ` +
          `L275 fait du « service S3 compatible pour les tests locaux » un LIVRABLE : il doit ` +
          `etre declare par un export parmi [${(ROLES.s3TestServiceConfig ?? []).join('|')}] ` +
          `rendant { endpoint, region, bucket, access_key_id, secret_access_key }, ou par ` +
          `l'environnement (S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, ` +
          `S3_SECRET_ACCESS_KEY). Source examinee : ${court(c.source, 400)}`,
  ).toBe('coordonnees-du-service-resolues'); // cahier:L275
  const svc = c.svc as Svc;

  // SONDAGE INDEPENDANT : le service repond, et la signature de la suite est
  // correcte. Sans lui, un 403 plus loin serait indistinguable d'un refus
  // metier — et A4/A5 vireraient au vert pour la mauvaise raison.
  const cle = `${prefixe('sonde')}/${quoi.replace(/[^a-z0-9]+/gi, '-')}-${Date.now().toString(36)}`;
  const charge = Buffer.from(`sonde ${RUN} ${quoi}`, 'utf8');
  const ecrit = await ecrireBrut(svc, svc, cle, charge);
  expect(
    ecrit.status === HTTP_OK
      ? 'service-joignable-en-ecriture'
      : `SERVICE-S3-INJOIGNABLE (${quoi}) : PUT ${svc.endpoint}/${svc.bucket}/${cle} a repondu ` +
          `${String(ecrit.status)} ${court(ecrit.texte, 300)}`,
  ).toBe('service-joignable-en-ecriture');
  const relu = await lireBrut(svc, svc, cle);
  expect(
    relu.status === HTTP_OK && sha256(relu.body) === sha256(charge)
      ? 'service-joignable-en-lecture'
      : `SERVICE-S3-INCOHERENT (${quoi}) : GET a repondu ${String(relu.status)}, ` +
          `sha256 relu ${sha256(relu.body)} vs ecrit ${sha256(charge)}`,
  ).toBe('service-joignable-en-lecture');
  await supprimerBrut(svc, svc, cle);
  return svc;
}

/* ═══════════════ ouverture, ecriture, relecture, listage ══════════════ */

interface OuvertureOpts {
  prefix: string;
  creds?: Creds;
  svc?: Svc;
  expires_at?: string;
}

async function ouvrirIssue(base: Svc, o: OuvertureOpts): Promise<Issue> {
  const svc = o.svc ?? base;
  const creds = o.creds ?? base;
  const opts: Json = {
    endpoint: svc.endpoint,
    region: svc.region,
    bucket: svc.bucket,
    prefix: o.prefix,
    access_key_id: creds.accessKeyId,
    secret_access_key: creds.secretAccessKey,
  };
  if (o.expires_at !== undefined) opts.expires_at = o.expires_at;
  return appeler('openS3ArtifactStore', [opts]);
}

async function ouvrir(base: Svc, o: OuvertureOpts, quoi: string): Promise<unknown> {
  return exigerAccepte(await ouvrirIssue(base, o), `ouverture du magasin S3 (${quoi})`);
}

async function ecrire(h: unknown, b: Buffer, opts?: Json): Promise<Issue> {
  return opts === undefined
    ? appeler('putArtifact', [h, b])
    : appeler('putArtifact', [h, b, opts]);
}

async function lire(h: unknown, ref: string): Promise<Issue> {
  return appeler('getArtifact', [h, ref]);
}

function refsDe(v: unknown): string[] {
  let brut: unknown[] = [];
  if (Array.isArray(v)) brut = v;
  else if (v instanceof Set) brut = [...v];
  else if (v !== null && typeof v === 'object') {
    for (const n of ['items', 'refs', 'artifacts', 'objects', 'entries', 'list', 'data']) {
      const s = (v as Json)[n];
      if (Array.isArray(s)) {
        brut = s;
        break;
      }
      if (s instanceof Set) {
        brut = [...s];
        break;
      }
    }
  }
  return brut.map((x) => refDe(x)).filter((x): x is string => x !== null);
}

async function lister(h: unknown, quoi: string): Promise<string[]> {
  return refsDe(exigerAccepte(await appeler('listArtifacts', [h]), quoi));
}

const occurrences = (xs: readonly string[], x: string): number => xs.filter((y) => y === x).length;

/** Le manifeste de contenu de L267, exige champ par champ. */
function manifeste(v: unknown, octetsEcrits: Buffer, quoi: string): string {
  const ref = refDe(v);
  expect(
    ref !== null
      ? 'manifeste-avec-reference'
      : `MANIFESTE-SANS-REFERENCE ${quoi} : aucun champ parmi [${NOMS_REF.join('|')}] ` +
          `dans ${court(rendu(v), 400)}`,
  ).toBe('manifeste-avec-reference'); // cahier:L267
  const digest = digestDe(v);
  expect(
    digest !== null
      ? 'manifeste-avec-empreinte'
      : `MANIFESTE-SANS-EMPREINTE ${quoi} : aucun champ parmi [${NOMS_DIGEST.join('|')}] ` +
          `dans ${court(rendu(v), 400)} — « empreintes verifiees avant usage » exige ` +
          `qu'elle soit PUBLIEE`,
  ).toBe('manifeste-avec-empreinte'); // cahier:L271
  expect(
    (digest ?? '').toLowerCase().includes(sha256(octetsEcrits))
      ? 'empreinte-sha256-des-octets'
      : `EMPREINTE-INCORRECTE ${quoi} : attendu le SHA-256 des octets ecrits ` +
          `(${sha256(octetsEcrits)}), observe ${court(String(digest), 200)}`,
  ).toBe('empreinte-sha256-des-octets'); // cahier:L82
  const taille = tailleDe(v);
  expect(
    taille === octetsEcrits.length
      ? 'manifeste-avec-taille'
      : `MANIFESTE-SANS-TAILLE-EXACTE ${quoi} : attendu ${String(octetsEcrits.length)}, ` +
          `observe ${court(rendu(taille), 120)} dans ${court(rendu(v), 300)}`,
  ).toBe('manifeste-avec-taille');
  return ref as string;
}

function exigerOctets(issue: Issue, attendus: Buffer, quoi: string): void {
  exigerAccepte(issue, quoi);
  const rendus = octets(issue.valeur);
  expect(
    rendus !== null
      ? 'octets-rendus'
      : `AUCUN-OCTET-RENDU ${quoi} : ${court(rendu(issue.valeur), 300)}`,
  ).toBe('octets-rendus');
  const b = rendus ?? Buffer.alloc(0);
  expect(
    Buffer.compare(b, attendus) === 0
      ? 'octets-identiques'
      : `OCTETS-DIFFERENTS ${quoi} : attendu ${String(attendus.length)} octets ` +
          `sha256=${sha256(attendus)}, observe ${String(b.length)} octets sha256=${sha256(b)}`,
  ).toBe('octets-identiques');
}

/**
 * TEMOIN INDEPENDANT : la cle du service qui porte EXACTEMENT ces octets.
 * C'est ce que la convention 4 rend observable, et c'est la seule chose qui
 * distingue « passe sur le service REEL » (L277) d'un magasin simule.
 */
async function cleQuiPorte(
  svc: Svc,
  prefixeCle: string,
  attendus: Buffer,
): Promise<{ cle: string | null; cles: string[]; status: number }> {
  const l = await listerBrut(svc, svc, prefixeCle);
  const vise = sha256(attendus);
  for (const c of l.cles) {
    const r = await lireBrut(svc, svc, c);
    if (r.status === HTTP_OK && sha256(r.body) === vise) return { cle: c, cles: l.cles, status: l.status };
  }
  return { cle: null, cles: l.cles, status: l.status };
}

async function exigerOctetsDansLeService(
  svc: Svc,
  prefixeCle: string,
  attendus: Buffer,
  quoi: string,
): Promise<string> {
  const t = await cleQuiPorte(svc, prefixeCle, attendus);
  expect(
    t.cle !== null
      ? 'octets-presents-dans-le-service'
      : `OCTETS-ABSENTS-DU-SERVICE-REEL ${quoi} : aucune cle sous ${prefixeCle} ne porte ` +
          `sha256=${sha256(attendus)} (ListObjectsV2 -> ${String(t.status)}, ` +
          `${String(t.cles.length)} cle(s) : ${court(t.cles.join(', '), 400)})`,
  ).toBe('octets-presents-dans-le-service'); // cahier:L277
  return t.cle ?? '';
}

/* ═══════════════════ archives tar, ecrites octet par octet ════════════ */

/**
 * Les trois vecteurs de L269 sont precisement ceux que les archiveurs du
 * systeme REFUSENT de produire : GNU tar retire le `../` de tete et le `/`
 * initial. Une archive d'attaque obtenue par `tar -cf` ne contiendrait donc PAS
 * l'attaque. Les en-tetes ci-dessous sont ecrits champ par champ, en ustar.
 */
interface Entree {
  nom: string;
  typeflag: '0' | '2';
  contenu?: Buffer;
  lien?: string;
}

const champOctal = (n: number, taille: number): string =>
  `${n.toString(8).padStart(taille - 1, '0')}\0`;

function enteteTar(e: Entree): Buffer {
  const nomOctets = Buffer.byteLength(e.nom, 'utf8');
  if (nomOctets > 100) {
    throw new Error(`nom d'entree tar trop long pour le champ ustar (${String(nomOctets)} > 100)`);
  }
  const taille = e.typeflag === '0' ? (e.contenu?.length ?? 0) : 0;
  const h = Buffer.alloc(512, 0);
  h.write(e.nom, 0, 100, 'utf8');
  h.write(champOctal(0o644, 8), 100, 8, 'ascii');
  h.write(champOctal(0, 8), 108, 8, 'ascii');
  h.write(champOctal(0, 8), 116, 8, 'ascii');
  h.write(champOctal(taille, 12), 124, 12, 'ascii');
  h.write(champOctal(0, 12), 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');
  h.write(e.typeflag, 156, 1, 'ascii');
  if (e.lien !== undefined) h.write(e.lien, 157, 100, 'utf8');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  let somme = 0;
  for (const octet of h) somme += octet;
  h.write(`${somme.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

function tar(entrees: Entree[]): Buffer {
  const blocs: Buffer[] = [];
  for (const e of entrees) {
    blocs.push(enteteTar(e));
    if (e.typeflag === '0') {
      const c = e.contenu ?? Buffer.alloc(0);
      blocs.push(c);
      const reste = c.length % 512;
      if (reste !== 0) blocs.push(Buffer.alloc(512 - reste, 0));
    }
  }
  blocs.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocs);
}

function ecrireArchive(nom: string, entrees: Entree[]): string {
  const dir = dossier('archives');
  const p = path.join(dir, nom);
  fs.writeFileSync(p, tar(entrees));
  return p;
}

function arbreLocal(racine: string): Map<string, string> {
  const out = new Map<string, string>();
  const pile: string[] = [''];
  while (pile.length > 0) {
    const rel = pile.pop() as string;
    const abs = rel === '' ? racine : path.join(racine, rel);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      out.set(rel, 'lien');
      continue;
    }
    if (st.isDirectory()) {
      if (rel !== '') out.set(rel, 'dossier');
      let noms: string[] = [];
      try {
        noms = fs.readdirSync(abs);
      } catch {
        noms = [];
      }
      for (const n of noms.sort()) pile.push(rel === '' ? n : path.join(rel, n));
      continue;
    }
    out.set(rel, `fichier ${String(st.size)}`);
  }
  return out;
}

const ajoutes = (avant: Map<string, string>, apres: Map<string, string>): string[] =>
  [...apres.keys()].filter((k) => !avant.has(k)).sort();

/* ═════════════════════════ nettoyage du namespace ═════════════════════ */

/**
 * L519 : « nettoyage ne cible que les ressources portant l'identite de test ».
 * Le prefixe efface est exactement celui que le `test_run_id` de L559 a
 * fabrique — rien d'autre n'est touche. Un nettoyage rate ne change aucun
 * verdict : il est tente, jamais asserte.
 */
afterAll(async () => {
  try {
    fs.rmSync(SABLE, { recursive: true, force: true });
  } catch {
    /* un bac a sable non supprime ne change aucun verdict */
  }
  try {
    const c = CONFIG;
    if (c?.svc != null) {
      const svc = c.svc;
      const l = await listerBrut(svc, svc, `${RACINE_S3}/`);
      for (const cle of l.cles) await supprimerBrut(svc, svc, cle);
      const u = await listerUploads(svc, svc, `${RACINE_S3}/`);
      for (const id of u.uploads) {
        // best effort : on ne connait pas la cle de chaque upload en suspens.
        void id;
      }
    }
  } catch {
    /* le nettoyage n'est pas une assertion */
  }
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ LES SIX CAS ════════════════════════════ */

describe('T14 — adaptateur S3 et contrat reel', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T14.A1 tous les cas du contrat ArtifactStore passent sur le service reel de test',
    async () => {
      assertLoaded();
      assertContrat(
        'openS3ArtifactStore',
        'putArtifact',
        'getArtifact',
        'listArtifacts',
        'extractArchive',
      );
      const svc = await service('A1');

      const p1 = prefixe('a1', 'magasin-1');
      const p2 = prefixe('a1', 'magasin-2');
      const h1 = await ouvrir(svc, { prefix: p1 }, 'magasin 1');
      const h2 = await ouvrir(svc, { prefix: p2 }, 'magasin 2');

      /* (C1) L269 — memes octets, meme reference de contenu. */
      const charge = Buffer.from(`T14.A1 charge utile ${RUN}\n${'artefact-'.repeat(64)}`, 'utf8');
      const ref1 = manifeste(
        exigerAccepte(await ecrire(h1, charge), 'premiere ecriture'),
        charge,
        'premiere ecriture',
      );
      const ref2 = manifeste(
        exigerAccepte(await ecrire(h1, charge), 'deuxieme ecriture des MEMES octets'),
        charge,
        'deuxieme ecriture des MEMES octets',
      );
      expect(
        ref2 === ref1
          ? 'meme-reference'
          : `REFERENCES-DIFFERENTES-POUR-LES-MEMES-OCTETS : ${court(ref1, 200)} puis ` +
              `${court(ref2, 200)} — L269 exige la MEME reference de contenu`,
      ).toBe('meme-reference'); // cahier:L269
      const ref3 = manifeste(
        exigerAccepte(await ecrire(h2, charge), 'memes octets, autre prefixe'),
        charge,
        'memes octets, autre prefixe',
      );
      expect(
        ref3 === ref1
          ? 'reference-stable-entre-magasins'
          : `REFERENCE-DEPENDANTE-DU-MAGASIN : ${court(ref1, 200)} ici, ${court(ref3, 200)} ` +
              `la-bas, pour des octets identiques (sha256=${sha256(charge)})`,
      ).toBe('reference-stable-entre-magasins'); // cahier:L269

      /* TEMOIN : les octets sont dans le SERVICE, pas dans un magasin simule. */
      await exigerOctetsDansLeService(svc, `${p1}/`, charge, 'apres la premiere ecriture');
      exigerOctets(await lire(h1, ref1), charge, `relecture de ${court(ref1, 80)} (magasin 1)`);
      exigerOctets(await lire(h2, ref3), charge, `relecture de ${court(ref3, 80)} (magasin 2)`);

      const visibles = await lister(h1, 'listage du magasin 1');
      expect(
        occurrences(visibles, ref1) === UN_SEUL_OBJET
          ? 'un-seul-objet-visible'
          : `OBJET-DUPLIQUE-OU-INVISIBLE : ${String(occurrences(visibles, ref1))} occurrence(s) ` +
              `de ${court(ref1, 120)} dans [${court(visibles.join(', '), 400)}] apres DEUX ` +
              `ecritures des memes octets`,
      ).toBe('un-seul-objet-visible'); // cahier:L277

      /* (C2) L269 — un octet change donne une autre reference. */
      const variante = Buffer.from(charge);
      variante[variante.length - UN_OCTET] = (variante[variante.length - UN_OCTET] ?? 0) ^ 0xff;
      expect(
        Buffer.compare(variante, charge) !== 0
          ? 'variante-differente'
          : 'VARIANTE-IDENTIQUE : la suite n a pas reussi a changer un octet',
      ).toBe('variante-differente');
      const refVariante = manifeste(
        exigerAccepte(await ecrire(h1, variante), 'ecriture de la variante d un octet'),
        variante,
        'ecriture de la variante d un octet',
      );
      expect(
        refVariante !== ref1
          ? 'reference-differente'
          : `MEME-REFERENCE-POUR-DES-OCTETS-DIFFERENTS : ${court(ref1, 200)} pour ` +
              `sha256=${sha256(charge)} et pour sha256=${sha256(variante)}`,
      ).toBe('reference-differente'); // cahier:L269

      /* (C3) L269 — lecture apres corruption donne ARTIFACT_CORRUPT. */
      const pCorrompu = prefixe('a1', 'corruption');
      const hc = await ouvrir(svc, { prefix: pCorrompu }, 'magasin de corruption');
      const chargeC = Buffer.from(`T14.A1 corruption ${RUN}\n${'octet-'.repeat(64)}`, 'utf8');
      const refC = manifeste(
        exigerAccepte(await ecrire(hc, chargeC), 'ecriture avant corruption'),
        chargeC,
        'ecriture avant corruption',
      );
      const cleC = await exigerOctetsDansLeService(svc, `${pCorrompu}/`, chargeC, 'avant corruption');
      const corrompu = Buffer.from(chargeC);
      corrompu[0] = (corrompu[0] ?? 0) ^ 0xff;
      const ecritC = await ecrireBrut(svc, svc, cleC, corrompu);
      expect(
        ecritC.status === HTTP_OK
          ? 'corruption-posee-dans-le-service'
          : `CORRUPTION-NON-POSEE : PUT brut sur ${cleC} a repondu ${String(ecritC.status)} ` +
              `${court(ecritC.texte, 200)}`,
      ).toBe('corruption-posee-dans-le-service');
      exigerRefusNomme(
        await lire(hc, refC),
        MOTIF_CORROMPU,
        CODE_CORROMPU,
        `lecture de ${court(refC, 80)} apres corruption de l objet dans le service`,
      ); // cahier:L269

      /* (C4) L269 — fichier absent donne ARTIFACT_MISSING. */
      const jamaisEcrit = Buffer.from(`T14.A1 jamais ecrit ${RUN}`, 'utf8');
      const pVide = prefixe('a1', 'absent');
      const hv = await ouvrir(svc, { prefix: pVide }, 'magasin vide');
      const hRef = await ouvrir(svc, { prefix: prefixe('a1', 'source-ref') }, 'magasin de reference');
      const refAbsente = manifeste(
        exigerAccepte(await ecrire(hRef, jamaisEcrit), 'ecriture ailleurs pour obtenir une ref'),
        jamaisEcrit,
        'ecriture ailleurs pour obtenir une ref',
      );
      exigerRefusNomme(
        await lire(hv, refAbsente),
        MOTIF_ABSENT,
        CODE_ABSENT,
        `lecture de ${court(refAbsente, 80)} dans un magasin qui ne l a jamais recue`,
      ); // cahier:L269

      /* (C5) L269 — une ecriture interrompue n'est pas visible comme objet final. */
      const pInterrompu = prefixe('a1', 'interrompu');
      const hi = await ouvrir(svc, { prefix: pInterrompu }, 'magasin interrompu');
      const chargeI = Buffer.from(`T14.A1 interrompu ${RUN}\n${'partiel-'.repeat(64)}`, 'utf8');
      const refI = manifeste(
        exigerAccepte(
          await ecrire(await ouvrir(svc, { prefix: prefixe('a1', 'ref-i') }, 'ref interrompu'), chargeI),
          'ecriture temoin pour connaitre la reference',
        ),
        chargeI,
        'ecriture temoin pour connaitre la reference',
      );
      await ecrire(hi, chargeI, { fault: 'INTERRUPT_BEFORE_PUBLISH' });
      const visiblesI = await lister(hi, 'listage apres ecriture interrompue');
      expect(
        occurrences(visiblesI, refI) === AUCUNE_VISIBILITE
          ? 'ecriture-interrompue-invisible'
          : `OBJET-PUBLIE-MALGRE-L-INTERRUPTION : ${String(occurrences(visiblesI, refI))} ` +
              `occurrence(s) de ${court(refI, 120)} dans [${court(visiblesI.join(', '), 400)}]`,
      ).toBe('ecriture-interrompue-invisible'); // cahier:L269
      const luI = await lire(hi, refI);
      expect(
        luI.refuse || Buffer.compare(octets(luI.valeur) ?? Buffer.alloc(0), chargeI) !== 0
          ? 'ecriture-interrompue-non-lisible'
          : `OBJET-LISIBLE-MALGRE-L-INTERRUPTION : ${court(refI, 120)} rend les octets complets`,
      ).toBe('ecriture-interrompue-non-lisible'); // cahier:L269

      /* (C6) L269 — extraction refusee sans ecriture hors destination. */
      const vecteurs: Array<{ nom: string; entrees: Entree[] }> = [
        {
          nom: 'traversee',
          entrees: [
            { nom: ENTREE_TRAVERSEE, typeflag: '0', contenu: Buffer.from('charge', 'utf8') },
          ],
        },
        {
          nom: 'chemin-absolu',
          entrees: [
            {
              nom: `${dossier('a1', 'hors')}/absolu.txt`,
              typeflag: '0',
              contenu: Buffer.from('charge', 'utf8'),
            },
          ],
        },
        {
          nom: 'lien-sortant',
          entrees: [{ nom: 'sortie', typeflag: '2', lien: `${dossier('a1', 'hors')}/cible.txt` }],
        },
      ];
      for (const v of vecteurs) {
        const dest = dossier('a1', 'dest', v.nom);
        const hors = dossier('a1', 'hors');
        const archive = ecrireArchive(`${v.nom}.tar`, v.entrees);
        const avantHors = arbreLocal(hors);
        const issue = await appeler(
          'extractArchive',
          [hi, { archive_path: archive, dest_dir: dest }],
          false,
        );
        exigerRefusNomme(
          issue,
          MOTIF_CHEMIN_REFUSE,
          'un code nommant la traversee, le chemin absolu ou le lien sortant',
          `extraction du vecteur ${v.nom}`,
        ); // cahier:L269
        const apresHors = arbreLocal(hors);
        expect(
          ajoutes(avantHors, apresHors).length === AUCUNE_ECRITURE
            ? 'aucune-ecriture-hors-destination'
            : `ECRITURE-HORS-DESTINATION (${v.nom}) : ` +
                `[${ajoutes(avantHors, apresHors).join(', ')}] apparus sous ${hors}`,
        ).toBe('aucune-ecriture-hors-destination'); // cahier:L269
      }

      /* (C7) L271 — la limite de taille est DECLAREE. */
      const limite = limiteDeTaille();
      expect(
        limite !== null && Number.isInteger(limite) && limite > 0
          ? 'limite-de-taille-declaree'
          : `LIMITE-DE-TAILLE-NON-DECLAREE : aucun export parmi ` +
              `[${ALIAS_LIMITE_TAILLE.join('|')}] ne rend un entier fini strictement positif ` +
              `(observe ${rendu(limite)})`,
      ).toBe('limite-de-taille-declaree'); // cahier:L271
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T14.A2 un transfert interrompu puis repris ne cree pas deux objets logiques',
    async () => {
      assertLoaded();
      assertContrat('openS3ArtifactStore', 'putArtifact', 'getArtifact', 'listArtifacts');
      const svc = await service('A2');

      const p = prefixe('a2', 'reprise');
      const h = await ouvrir(svc, { prefix: p }, 'magasin de reprise');

      /**
       * TAILLE : une ENTREE de la suite, pas une valeur du cahier. Elle depasse
       * le seuil de decoupage en parties de l'API S3 (5 MiO), sans quoi un
       * « transfert » tiendrait dans une seule requete et ne serait pas
       * interruptible EN COURS — le cas n'aurait alors rien a observer.
       */
      const charge = Buffer.alloc(6 * 1024 * 1024);
      for (let i = 0; i < charge.length; i += 1) charge[i] = (i * 31 + 7) & 0xff;

      const avantCles = await listerBrut(svc, svc, `${p}/`);
      expect(
        avantCles.status === HTTP_OK
          ? 'listage-initial-possible'
          : `LISTAGE-IMPOSSIBLE : ListObjectsV2 sur ${p}/ a repondu ` +
              `${String(avantCles.status)} ${court(avantCles.texte, 200)}`,
      ).toBe('listage-initial-possible');
      expect(
        avantCles.cles.length === AUCUNE_VISIBILITE
          ? 'prefixe-initialement-vide'
          : `PREFIXE-NON-VIERGE : ${String(avantCles.cles.length)} cle(s) deja sous ${p}/ — ` +
              `le namespace de L559 doit etre vierge`,
      ).toBe('prefixe-initialement-vide'); // cahier:L559

      /* (1) LE TRANSFERT EST INTERROMPU EN COURS. */
      const interrompu = await ecrire(h, charge, { fault: 'INTERRUPT_DURING_UPLOAD' });
      expect(
        interrompu.refuse
          ? 'transfert-interrompu'
          : `TRANSFERT-NON-INTERROMPU : le point d injection ` +
              `'INTERRUPT_DURING_UPLOAD' (L141) a laisse l ecriture aboutir : ` +
              `${court(interrompu.texte, 300)}`,
      ).toBe('transfert-interrompu'); // cahier:L141
      const visiblesApresInterruption = await lister(h, 'listage apres interruption');
      expect(
        visiblesApresInterruption.length === AUCUNE_VISIBILITE
          ? 'aucun-objet-publie-par-l-interruption'
          : `OBJET-PUBLIE-PAR-UN-TRANSFERT-INTERROMPU : ` +
              `[${court(visiblesApresInterruption.join(', '), 400)}]`,
      ).toBe('aucun-objet-publie-par-l-interruption'); // cahier:L269
      const suspensApres = await listerUploads(svc, svc, `${p}/`);
      expect(
        suspensApres.uploads.length <= UN_SEUL_OBJET
          ? 'au-plus-un-transfert-en-suspens'
          : `TRANSFERTS-EN-SUSPENS-MULTIPLES : ${String(suspensApres.uploads.length)} transferts ` +
              `pendants sous ${p}/ apres UNE interruption — une interruption ne peut pas laisser ` +
              `plusieurs transferts derriere elle`,
      ).toBe('au-plus-un-transfert-en-suspens'); // cahier:L277

      /* (2) LA REPRISE : les MEMES octets, redemandes. */
      const repris = exigerAccepte(await ecrire(h, charge), 'reprise du transfert interrompu');
      const ref = manifeste(repris, charge, 'reprise du transfert interrompu');
      exigerOctets(await lire(h, ref), charge, `relecture apres reprise de ${court(ref, 80)}`);

      /* (3) UN SEUL OBJET LOGIQUE — cote magasin, et cote service. */
      const visibles = await lister(h, 'listage apres reprise');
      expect(
        occurrences(visibles, ref) === UN_SEUL_OBJET && visibles.length === UN_SEUL_OBJET
          ? 'un-seul-objet-logique-visible'
          : `DEUX-OBJETS-LOGIQUES-APRES-REPRISE : ${String(visibles.length)} reference(s) ` +
              `visible(s) [${court(visibles.join(', '), 400)}], dont ` +
              `${String(occurrences(visibles, ref))} fois ${court(ref, 120)} — L277 en exige ` +
              `exactement ${String(UN_SEUL_OBJET)}`,
      ).toBe('un-seul-objet-logique-visible'); // cahier:L277
      const apresCles = await listerBrut(svc, svc, `${p}/`);
      expect(
        apresCles.cles.length === UN_SEUL_OBJET
          ? 'une-seule-cle-dans-le-service'
          : `DEUX-CLES-POUR-UN-SEUL-ARTEFACT : ${String(apresCles.cles.length)} cle(s) sous ` +
              `${p}/ apres reprise : [${court(apresCles.cles.join(', '), 400)}]`,
      ).toBe('une-seule-cle-dans-le-service'); // cahier:L277
      await exigerOctetsDansLeService(svc, `${p}/`, charge, 'apres reprise');

      /**
       * (4) AUCUN TRANSFERT ABANDONNE SOUS LE PREFIXE.
       *
       * CE QUE CETTE ASSERTION PROUVE, ET CE QU'ELLE NE PROUVE PAS. Mesure
       * faite sur le service de test du socle : achever un transfert sur une
       * cle ANNULE les autres transferts pendants de la MEME cle (deux uploads
       * ouverts, un acheve -> zero en suspens). La reutilisation de
       * l'identifiant du transfert interrompu n'est donc PAS observable par
       * l'API S3 sur ce service, et cette assertion ne la demontre pas. Elle
       * demontre ce que le cahier exige en propre : la reprise ne laisse aucun
       * transfert orphelin sous le prefixe — ce qu'une reprise dirigee vers une
       * AUTRE cle violerait. verification/mutants/T14.json porte la mesure.
       */
      const suspens = await listerUploads(svc, svc, `${p}/`);
      expect(
        suspens.status === HTTP_OK
          ? 'listage-des-transferts-en-suspens-possible'
          : `TRANSFERTS-EN-SUSPENS-NON-LISTABLES : ListMultipartUploads a repondu ` +
              `${String(suspens.status)} ${court(suspens.texte, 300)} — L275 fait du service ` +
              `S3 COMPATIBLE un livrable`,
      ).toBe('listage-des-transferts-en-suspens-possible'); // cahier:L275
      expect(
        suspens.uploads.length === AUCUN_UPLOAD_EN_SUSPENS
          ? 'aucun-transfert-abandonne'
          : `TRANSFERT-ABANDONNE-LAISSE-DERRIERE : ${String(suspens.uploads.length)} upload(s) ` +
              `en suspens sous ${p}/ apres reprise — la reprise a laisse un transfert orphelin ` +
              `derriere elle`,
      ).toBe('aucun-transfert-abandonne'); // cahier:L277

      /* (5) TEMOIN — le compteur sait compter jusqu'a DEUX. Sans lui,
             « il n'y en a pas deux » serait vrai d'un compteur casse. */
      const autre = Buffer.from(charge);
      autre[0] = (autre[0] ?? 0) ^ 0xff;
      const refAutre = manifeste(
        exigerAccepte(await ecrire(h, autre), 'ecriture d un SECOND objet, deliberee'),
        autre,
        'ecriture d un SECOND objet, deliberee',
      );
      expect(
        refAutre !== ref
          ? 'second-objet-distinct'
          : `TEMOIN-INVALIDE : les deux charges distinctes rendent la meme reference ` +
              `${court(ref, 120)}`,
      ).toBe('second-objet-distinct');
      const visibles2 = await lister(h, 'listage avec le second objet');
      expect(
        visibles2.length === DEUX_OBJETS
          ? 'compteur-de-references-fiable'
          : `COMPTEUR-DE-REFERENCES-INFIABLE : ${String(visibles2.length)} reference(s) visible(s) ` +
              `apres DEUX ecritures d octets distincts : [${court(visibles2.join(', '), 400)}]`,
      ).toBe('compteur-de-references-fiable'); // cahier:L277
      const cles2 = await listerBrut(svc, svc, `${p}/`);
      expect(
        cles2.cles.length === DEUX_OBJETS
          ? 'compteur-de-cles-fiable'
          : `COMPTEUR-DE-CLES-INFIABLE : ${String(cles2.cles.length)} cle(s) sous ${p}/ apres ` +
              `DEUX artefacts distincts : [${court(cles2.cles.join(', '), 400)}]`,
      ).toBe('compteur-de-cles-fiable'); // cahier:L277
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T14.A3 deux uploads simultanes des memes octets donnent la meme reference',
    async () => {
      assertLoaded();
      assertContrat('openS3ArtifactStore', 'putArtifact', 'getArtifact', 'listArtifacts');
      const svc = await service('A3');

      const p = prefixe('a3', 'concurrence');
      const h = await ouvrir(svc, { prefix: p }, 'magasin concurrent');
      const charge = Buffer.from(`T14.A3 charge utile ${RUN}\n${'simultane-'.repeat(256)}`, 'utf8');

      /* (1) DEUX UPLOADS SIMULTANES DES MEMES OCTETS. */
      const [i1, i2] = await Promise.all([ecrire(h, charge), ecrire(h, charge)]);
      const refA = manifeste(exigerAccepte(i1, 'upload simultane nº1'), charge, 'upload simultane nº1');
      const refB = manifeste(exigerAccepte(i2, 'upload simultane nº2'), charge, 'upload simultane nº2');
      expect(
        refA === refB
          ? 'meme-reference-pour-deux-uploads-simultanes'
          : `REFERENCES-DIFFERENTES-POUR-DEUX-UPLOADS-SIMULTANES : ${court(refA, 200)} et ` +
              `${court(refB, 200)} pour les memes octets (sha256=${sha256(charge)}) — une ` +
              `reference derivee d un suffixe aleatoire ou horodate produit exactement cet ecart`,
      ).toBe('meme-reference-pour-deux-uploads-simultanes'); // cahier:L277

      /* (2) ET LA MEME ENCORE, EN SEQUENTIEL : la reference ne depend pas du
             moment ni de l'ordonnancement. */
      const refC = manifeste(
        exigerAccepte(await ecrire(h, charge), 'troisieme upload, sequentiel'),
        charge,
        'troisieme upload, sequentiel',
      );
      expect(
        refC === refA
          ? 'reference-stable-dans-le-temps'
          : `REFERENCE-DEPENDANTE-DU-MOMENT : ${court(refA, 200)} en simultane, ` +
              `${court(refC, 200)} plus tard`,
      ).toBe('reference-stable-dans-le-temps'); // cahier:L277

      /* (3) CONTROLE ANTI-DEGENERESCENCE : une reference CONSTANTE satisferait
             (1) et (2) sans rien prouver. Deux uploads simultanes d octets
             DIFFERENTS doivent donner des references DIFFERENTES. */
      const autre = Buffer.from(charge);
      autre[autre.length - UN_OCTET] = (autre[autre.length - UN_OCTET] ?? 0) ^ 0xff;
      const [j1, j2] = await Promise.all([ecrire(h, autre), ecrire(h, charge)]);
      const refD = manifeste(exigerAccepte(j1, 'upload simultane d octets autres'), autre, 'octets autres');
      const refE = manifeste(exigerAccepte(j2, 'upload simultane des octets initiaux'), charge, 'octets initiaux');
      expect(
        refD !== refE && refE === refA
          ? 'references-distinctes-pour-octets-distincts'
          : `REFERENCE-CONSTANTE-OU-INSTABLE : octets differents -> ${court(refD, 160)} et ` +
              `${court(refE, 160)} (initiale ${court(refA, 160)}) — une reference constante ` +
              `verdirait le cas sans observer le contenu`,
      ).toBe('references-distinctes-pour-octets-distincts'); // cahier:L269

      /* (4) TEMOIN : le service ne porte QUE deux objets logiques — un par
             contenu — malgre quatre uploads des memes octets. */
      exigerOctets(await lire(h, refA), charge, `relecture de ${court(refA, 80)}`);
      exigerOctets(await lire(h, refD), autre, `relecture de ${court(refD, 80)}`);
      const visibles = await lister(h, 'listage apres quatre uploads');
      expect(
        occurrences(visibles, refA) === UN_SEUL_OBJET
          ? 'un-seul-objet-logique-par-contenu'
          : `OBJET-DUPLIQUE-PAR-LA-CONCURRENCE : ${String(occurrences(visibles, refA))} ` +
              `occurrence(s) de ${court(refA, 120)} dans [${court(visibles.join(', '), 400)}] ` +
              `apres ${String(DEUX_UPLOADS)} uploads simultanes des memes octets`,
      ).toBe('un-seul-objet-logique-par-contenu'); // cahier:L277
      const cles = await listerBrut(svc, svc, `${p}/`);
      expect(
        cles.cles.length === DEUX_OBJETS
          ? 'deux-cles-pour-deux-contenus'
          : `CLES-EN-TROP-DANS-LE-SERVICE : ${String(cles.cles.length)} cle(s) sous ${p}/ pour ` +
              `DEUX contenus distincts : [${court(cles.cles.join(', '), 400)}]`,
      ).toBe('deux-cles-pour-deux-contenus'); // cahier:L277
      await exigerOctetsDansLeService(svc, `${p}/`, charge, 'apres uploads simultanes');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T14.A4 une identite limitee a un prefixe ne peut pas lire le prefixe prive d evaluation',
    async () => {
      assertLoaded();
      assertContrat('openS3ArtifactStore', 'putArtifact', 'getArtifact', 'createScopedIdentity');
      const svc = await service('A4');

      const prefixePrive = prefixe('a4', 'evaluation-privee');
      const prefixeCandidat = prefixe('a4', 'candidat');

      /* (1) DEUX IDENTITES LIMITEES PAR USAGE (L275). */
      const idEval = exigerAccepte(
        await appeler('createScopedIdentity', [
          { usage: 'evaluation', prefix: prefixePrive },
        ]),
        'creation de l identite limitee a l usage evaluation',
      );
      const idCand = exigerAccepte(
        await appeler('createScopedIdentity', [{ usage: 'candidate', prefix: prefixeCandidat }]),
        'creation de l identite limitee a l usage candidat',
      );

      const lireIdentite = (v: unknown, quoi: string): { creds: Creds; svc: Svc } => {
        const ak = texteDe(v, NOMS_ACCESS_KEY);
        const sk = texteDe(v, NOMS_SECRET_KEY);
        expect(
          ak !== null && sk !== null
            ? 'identite-avec-identifiants'
            : `IDENTITE-SANS-IDENTIFIANTS ${quoi} : aucun champ parmi ` +
                `[${NOMS_ACCESS_KEY.join('|')}] / [${NOMS_SECRET_KEY.join('|')}] dans ` +
                `${court(rendu(v), 400)} — une « identite limitee par usage » (L275) doit ` +
                `pouvoir SIGNER, sinon elle n est pas une identite`,
        ).toBe('identite-avec-identifiants'); // cahier:L275
        return {
          creds: { accessKeyId: ak ?? '', secretAccessKey: sk ?? '' },
          svc: {
            endpoint: texteDe(v, NOMS_ENDPOINT) ?? svc.endpoint,
            region: texteDe(v, NOMS_REGION) ?? svc.region,
            bucket: texteDe(v, NOMS_BUCKET) ?? svc.bucket,
            accessKeyId: ak ?? '',
            secretAccessKey: sk ?? '',
          },
        };
      };

      const ev = lireIdentite(idEval, 'usage evaluation');
      const ca = lireIdentite(idCand, 'usage candidat');
      const prefixePriveEff = texteDe(idEval, NOMS_PREFIXE) ?? prefixePrive;
      const prefixeCandidatEff = texteDe(idCand, NOMS_PREFIXE) ?? prefixeCandidat;

      expect(
        ca.creds.accessKeyId !== ev.creds.accessKeyId &&
          ca.creds.accessKeyId !== svc.accessKeyId &&
          ca.creds.secretAccessKey !== svc.secretAccessKey
          ? 'identites-reellement-distinctes'
          : `IDENTITE-NON-LIMITEE : l identite candidate partage ses identifiants avec ` +
              `l identite d evaluation ou avec l identite complete du service — « limitee par ` +
              `usage » (L275) exige des identifiants PROPRES`,
      ).toBe('identites-reellement-distinctes'); // cahier:L275

      /* (2) LE SECRET EXISTE VRAIMENT, ET QUELQU UN PEUT LE LIRE. Sans ce
             controle, « le candidat ne peut pas lire » serait vrai d un objet
             absent. */
      const sentinelle = Buffer.from(
        `T14.A4 sentinelle privee ${RUN} ${'evaluation-'.repeat(16)}`,
        'utf8',
      );
      const clePrivee = `${prefixePriveEff}/sentinelle.bin`;
      const posee = await ecrireBrut(ev.svc, ev.creds, clePrivee, sentinelle);
      expect(
        posee.status === HTTP_OK
          ? 'sentinelle-privee-posee'
          : `SENTINELLE-NON-POSEE : PUT signe par l identite d evaluation sur ` +
              `${ev.svc.bucket}/${clePrivee} a repondu ${String(posee.status)} ` +
              `${court(posee.texte, 300)}`,
      ).toBe('sentinelle-privee-posee');
      const relueParEval = await lireBrut(ev.svc, ev.creds, clePrivee);
      expect(
        relueParEval.status === HTTP_OK && Buffer.compare(relueParEval.body, sentinelle) === 0
          ? 'sentinelle-lisible-par-son-usage'
          : `SENTINELLE-ILLISIBLE-PAR-SON-PROPRE-USAGE : GET a repondu ` +
              `${String(relueParEval.status)} ${court(relueParEval.texte, 300)}`,
      ).toBe('sentinelle-lisible-par-son-usage');

      /* (3) CONTROLE DE CAPACITE : l identite candidate N EST PAS impuissante.
             Une identite qui ne peut rien faire satisferait le cas sans rien
             prouver — c est, a l echelle d une cle, le stub qui leve. */
      const cleCandidat = `${prefixeCandidatEff}/propre.bin`;
      const chargeCandidat = Buffer.from(`T14.A4 charge du candidat ${RUN}`, 'utf8');
      const ecritureCandidat = await ecrireBrut(ca.svc, ca.creds, cleCandidat, chargeCandidat);
      expect(
        ecritureCandidat.status === HTTP_OK
          ? 'identite-candidate-operante'
          : `IDENTITE-CANDIDATE-IMPUISSANTE : PUT signe sur son PROPRE prefixe ` +
              `${ca.svc.bucket}/${cleCandidat} a repondu ${String(ecritureCandidat.status)} ` +
              `${court(ecritureCandidat.texte, 300)} — une identite qui ne peut rien faire ` +
              `satisferait ce cas sans rien prouver`,
      ).toBe('identite-candidate-operante');
      const lectureCandidat = await lireBrut(ca.svc, ca.creds, cleCandidat);
      expect(
        lectureCandidat.status === HTTP_OK &&
          Buffer.compare(lectureCandidat.body, chargeCandidat) === 0
          ? 'identite-candidate-lit-son-prefixe'
          : `IDENTITE-CANDIDATE-AVEUGLE-SUR-SON-PREFIXE : GET a repondu ` +
              `${String(lectureCandidat.status)} ${court(lectureCandidat.texte, 300)}`,
      ).toBe('identite-candidate-lit-son-prefixe');

      /* (4) LE REFUS, EXERCE PAR LE STOCKAGE (L279) : la suite signe elle-meme,
             hors de portee de toute verification cote client. */
      const volee = await lireBrut(ev.svc, ca.creds, clePrivee);
      expect(
        estRefusHttp(volee.status)
          ? 'lecture-privee-refusee-par-le-service'
          : `PREFIXE-PRIVE-LU-PAR-L-IDENTITE-CANDIDATE : GET signe par l identite candidate sur ` +
              `${ev.svc.bucket}/${clePrivee} a repondu ${String(volee.status)} — L279 : « les ` +
              `prefixes ne sont pas, seuls, un mecanisme d autorisation ; le controle doit etre ` +
              `exerce par le stockage ou un service d acces »`,
      ).toBe('lecture-privee-refusee-par-le-service'); // cahier:L279
      expect(
        !volee.body.includes(sentinelle.subarray(0, 40))
          ? 'aucun-octet-prive-divulgue'
          : `SENTINELLE-DIVULGUEE-DANS-LA-REPONSE-DE-REFUS : ${court(volee.texte, 300)}`,
      ).toBe('aucun-octet-prive-divulgue'); // cahier:L65
      const ecritureVolee = await ecrireBrut(ev.svc, ca.creds, `${prefixePriveEff}/injecte.bin`, sentinelle);
      expect(
        estRefusHttp(ecritureVolee.status)
          ? 'ecriture-privee-refusee-par-le-service'
          : `PREFIXE-PRIVE-ECRIT-PAR-L-IDENTITE-CANDIDATE : PUT a repondu ` +
              `${String(ecritureVolee.status)}`,
      ).toBe('ecriture-privee-refusee-par-le-service'); // cahier:L279
      const listageVole = await listerBrut(ev.svc, ca.creds, `${prefixePriveEff}/`);
      expect(
        estRefusHttp(listageVole.status) || !listageVole.cles.includes(clePrivee)
          ? 'prefixe-prive-non-enumerable'
          : `PREFIXE-PRIVE-ENUMERE-PAR-L-IDENTITE-CANDIDATE : ListObjectsV2 a repondu ` +
              `${String(listageVole.status)} et liste ${court(listageVole.cles.join(', '), 300)}`,
      ).toBe('prefixe-prive-non-enumerable'); // cahier:L65

      /* (5) LE MEME REFUS, VU PAR L ADAPTATEUR : il le NOMME, il ne plante pas. */
      const hEval = await ouvrir(
        svc,
        { prefix: prefixePriveEff, creds: ev.creds, svc: ev.svc },
        'magasin d evaluation',
      );
      const refPrivee = manifeste(
        exigerAccepte(await ecrire(hEval, sentinelle), 'ecriture de la sentinelle par l evaluateur'),
        sentinelle,
        'ecriture de la sentinelle par l evaluateur',
      );
      const hCand = await ouvrir(
        svc,
        { prefix: prefixeCandidatEff, creds: ca.creds, svc: ca.svc },
        'magasin du candidat',
      );
      const refCand = manifeste(
        exigerAccepte(await ecrire(hCand, chargeCandidat), 'ecriture du candidat dans son prefixe'),
        chargeCandidat,
        'ecriture du candidat dans son prefixe',
      );
      exigerOctets(
        await lire(hCand, refCand),
        chargeCandidat,
        'relecture par le candidat de son PROPRE artefact (controle de capacite)',
      );
      /**
       * Le magasin pointe sur l EMPLACEMENT PRIVE — les coordonnees de l usage
       * evaluation — mais signe avec les identifiants du CANDIDAT. C est la
       * seule combinaison qui exprime « une identite limitee ne peut pas lire
       * le prefixe prive d evaluation » quel que soit le mecanisme retenu
       * (condition de prefixe, seau distinct ou service d acces, L279).
       */
      const hCandSurPrive = await ouvrir(
        svc,
        { prefix: prefixePriveEff, creds: ca.creds, svc: ev.svc },
        'magasin du candidat pointe sur l emplacement prive',
      );
      const volAdaptateur = await lire(hCandSurPrive, refPrivee);
      exigerRefusNomme(
        volAdaptateur,
        MOTIF_DENI,
        'un code nommant le deni d acces ou la portee de l identite',
        `lecture de ${court(refPrivee, 80)} par l identite candidate`,
      ); // cahier:L277
      const octetsVoles = octets(volAdaptateur.valeur);
      expect(
        octetsVoles === null || Buffer.compare(octetsVoles, sentinelle) !== 0
          ? 'adaptateur-ne-rend-pas-la-sentinelle'
          : `SENTINELLE-RENDUE-PAR-L-ADAPTATEUR : ${court(refPrivee, 120)} a rendu les octets prives`,
      ).toBe('adaptateur-ne-rend-pas-la-sentinelle'); // cahier:L65
      /**
       * Le listage du prefixe prive par le candidat peut REFUSER — c est un
       * resultat acceptable, et meme souhaitable. Ce que le cas interdit est
       * qu il REUSSISSE en enumerant l artefact prive. On n exige donc pas
       * l acceptation ici : on n observe que l absence.
       */
      const listageCandidat = await appeler('listArtifacts', [hCandSurPrive], false);
      const visiblesCandidat = listageCandidat.refuse ? [] : refsDe(listageCandidat.valeur);
      expect(
        occurrences(visiblesCandidat, refPrivee) === AUCUNE_VISIBILITE
          ? 'artefact-prive-non-enumere'
          : `ARTEFACT-PRIVE-ENUMERE : ${court(refPrivee, 120)} apparait dans ` +
              `[${court(visiblesCandidat.join(', '), 300)}]`,
      ).toBe('artefact-prive-non-enumere'); // cahier:L65
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T14.A5 expiration d une autorisation donne un refus explicite, jamais un fallback anonyme',
    async () => {
      assertLoaded();
      assertContrat('openS3ArtifactStore', 'putArtifact', 'getArtifact');
      const svc = await service('A5');

      const p = prefixe('a5', 'expiration');
      const h = await ouvrir(svc, { prefix: p }, 'magasin a autorisation valide');
      const charge = Buffer.from(`T14.A5 charge utile ${RUN}\n${'autorisation-'.repeat(32)}`, 'utf8');
      const ref = manifeste(
        exigerAccepte(await ecrire(h, charge), 'ecriture sous autorisation valide'),
        charge,
        'ecriture sous autorisation valide',
      );
      const cle = await exigerOctetsDansLeService(svc, `${p}/`, charge, 'avant expiration');

      /**
       * DUREE D EXPIRATION : une ENTREE de la suite, pas une valeur du cahier.
       * Une seconde, puis une attente strictement superieure.
       */
      const TTL_SECONDES = 1;
      const ATTENTE_MS = 2500;

      /* (1) LE SERVICE APPLIQUE L EXPIRATION — controle positif d abord :
             l autorisation FRAICHE fonctionne. Sans lui, « refuse » serait vrai
             d une URL malformee. */
      const urlLongue = urlPresignee(svc, svc, cle, 600);
      const avant = await demander(urlLongue);
      expect(
        avant.status === HTTP_OK && Buffer.compare(avant.body, charge) === 0
          ? 'autorisation-fraiche-operante'
          : `AUTORISATION-FRAICHE-INOPERANTE : l URL signee valide a repondu ` +
              `${String(avant.status)} ${court(avant.texte, 300)} — un cas de refus qui ne ` +
              `demontre pas l existence d un NON-refus ne prouve rien`,
      ).toBe('autorisation-fraiche-operante');

      const urlCourte = urlPresignee(svc, svc, cle, TTL_SECONDES);
      await dormir(ATTENTE_MS);
      const apres = await demander(urlCourte);
      expect(
        estRefusHttp(apres.status)
          ? 'autorisation-perimee-refusee-par-le-service'
          : `AUTORISATION-PERIMEE-ACCEPTEE : l URL signee expiree depuis ` +
              `${String(ATTENTE_MS - TTL_SECONDES * 1000)} ms a repondu ${String(apres.status)}`,
      ).toBe('autorisation-perimee-refusee-par-le-service'); // cahier:L277
      expect(
        Buffer.compare(apres.body, charge) !== 0
          ? 'aucun-octet-servi-apres-expiration'
          : 'OCTETS-SERVIS-APRES-EXPIRATION : la reponse de refus porte la charge utile complete',
      ).toBe('aucun-octet-servi-apres-expiration'); // cahier:L277

      /* (2) IL N Y A PAS DE FALLBACK ANONYME POSSIBLE : sans aucune signature,
             le service refuse. C est ce qui rend le « fallback anonyme » de
             L277 detectable — s il reussissait, ce serait ici qu on le verrait. */
      const sansSignature = await anonyme(svc, cle);
      expect(
        estRefusHttp(sansSignature.status)
          ? 'acces-anonyme-refuse'
          : `ACCES-ANONYME-ACCEPTE : GET sans aucune signature sur ${svc.bucket}/${cle} a ` +
              `repondu ${String(sansSignature.status)} — un fallback anonyme reussirait alors ` +
              `silencieusement`,
      ).toBe('acces-anonyme-refuse'); // cahier:L277
      expect(
        Buffer.compare(sansSignature.body, charge) !== 0
          ? 'aucun-octet-servi-sans-signature'
          : 'OCTETS-SERVIS-SANS-SIGNATURE : le service publie l objet en clair',
      ).toBe('aucun-octet-servi-sans-signature'); // cahier:L277

      /* (3) L ADAPTATEUR : autorisation perimee -> REFUS NOMME, jamais des
             octets. L echeance est un timestamp UTC ISO 8601 (L80). */
      const echue = new Date(Date.now() - 3600_000).toISOString();
      const hPerime = await ouvrir(
        svc,
        { prefix: p, expires_at: echue },
        'magasin a autorisation perimee',
      );
      const lecturePerimee = await lire(hPerime, ref);
      exigerRefusNomme(
        lecturePerimee,
        MOTIF_EXPIRE,
        'un code nommant l expiration ou le refus d autorisation',
        `lecture de ${court(ref, 80)} sous une autorisation echue le ${echue}`,
      ); // cahier:L277
      const octetsPerimes = octets(lecturePerimee.valeur);
      expect(
        octetsPerimes === null || Buffer.compare(octetsPerimes, charge) !== 0
          ? 'aucun-octet-rendu-sous-autorisation-perimee'
          : `OCTETS-RENDUS-SOUS-AUTORISATION-PERIMEE : ${court(ref, 120)} a rendu la charge ` +
              `utile complete — c est exactement le fallback que L277 interdit`,
      ).toBe('aucun-octet-rendu-sous-autorisation-perimee'); // cahier:L277
      const ecriturePerimee = await ecrire(hPerime, Buffer.from(`T14.A5 apres echeance ${RUN}`, 'utf8'));
      exigerRefusNomme(
        ecriturePerimee,
        MOTIF_EXPIRE,
        'un code nommant l expiration ou le refus d autorisation',
        'ecriture sous une autorisation echue',
      ); // cahier:L277

      /* (4) CONTROLE DE CAPACITE : le meme adaptateur, avec une echeance
             FUTURE, lit la charge utile. Un adaptateur qui refuserait tout
             satisferait (3) sans rien prouver. */
      const future = new Date(Date.now() + 3600_000).toISOString();
      const hValide = await ouvrir(
        svc,
        { prefix: p, expires_at: future },
        'magasin a autorisation encore valide',
      );
      exigerOctets(
        await lire(hValide, ref),
        charge,
        `relecture de ${court(ref, 80)} sous une autorisation valable jusqu au ${future} ` +
          `(controle de capacite)`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T14.A6 les erreurs ne publient aucun secret dans les rapports',
    async () => {
      assertLoaded();
      assertContrat('openS3ArtifactStore', 'putArtifact', 'getArtifact', 'createScopedIdentity');
      const svc = await service('A6');

      const p = prefixe('a6', 'fuite');
      const h = await ouvrir(svc, { prefix: p }, 'magasin observe');
      const charge = Buffer.from(`T14.A6 charge utile ${RUN}\n${'secret-'.repeat(32)}`, 'utf8');
      const ref = manifeste(
        exigerAccepte(await ecrire(h, charge), 'ecriture temoin'),
        charge,
        'ecriture temoin',
      );
      const cle = await exigerOctetsDansLeService(svc, `${p}/`, charge, 'ecriture temoin');

      /* (1) LES SECRETS QUI DOIVENT RESTER HORS DES RAPPORTS. */
      const idJetable = exigerAccepte(
        await appeler('createScopedIdentity', [{ usage: 'candidate', prefix: prefixe('a6', 'jetable') }]),
        'creation d une identite limitee jetable',
      );
      const urlSignee = urlPresignee(svc, svc, cle, 600);
      const queryString = new URL(urlSignee).search;
      const signature = new URL(urlSignee).searchParams.get('X-Amz-Signature') ?? '';
      const credential = new URL(urlSignee).searchParams.get('X-Amz-Credential') ?? '';

      const secrets: Array<{ nom: string; valeur: string }> = [
        { nom: 'secret_access_key du service', valeur: svc.secretAccessKey },
        { nom: 'access_key_id du service', valeur: svc.accessKeyId },
        { nom: 'X-Amz-Signature de l URL signee', valeur: signature },
        { nom: 'X-Amz-Credential de l URL signee', valeur: credential },
        { nom: 'query string de l URL signee', valeur: queryString },
      ];
      const skJetable = texteDe(idJetable, NOMS_SECRET_KEY);
      if (skJetable !== null) {
        secrets.push({ nom: 'secret_access_key de l identite limitee', valeur: skJetable });
      }

      /* (2) LES SECRETS SONT SUBSTANTIELS — un detecteur qui chercherait la
             chaine vide ne prouverait rien. */
      for (const s of secrets) {
        expect(
          s.valeur.length >= 16
            ? 'secret-substantiel'
            : `SECRET-NON-SUBSTANTIEL (${s.nom}) : ${String(s.valeur.length)} caractere(s) — ` +
                `chercher une chaine trop courte rendrait A6 vert sans rien observer`,
        ).toBe('secret-substantiel');
      }

      const fuites = (texte: string): string[] =>
        secrets.filter((s) => s.valeur.length > 0 && texte.includes(s.valeur)).map((s) => s.nom);

      /* (3) TEMOIN DU DETECTEUR : il VOIT une fuite quand il y en a une. Sans
             lui, « aucune fuite » serait vrai d un detecteur casse — c est le
             defaut que le mode de preuve `absence` designe. */
      const fabriquee = `erreur simulee : credentials=${svc.secretAccessKey} url=${queryString}`;
      expect(
        fuites(fabriquee).length >= DEUX_OBJETS
          ? 'detecteur-de-fuite-operant'
          : `DETECTEUR-DE-FUITE-INOPERANT : un texte contenant deliberement le secret et la ` +
              `query string signee n a declenche que [${fuites(fabriquee).join(', ')}]`,
      ).toBe('detecteur-de-fuite-operant');
      const benin = `erreur simulee sans secret : ref=${ref} cle=${cle}`;
      expect(
        fuites(benin).length === AUCUN_SECRET
          ? 'detecteur-sans-faux-positif'
          : `DETECTEUR-A-FAUX-POSITIF : [${fuites(benin).join(', ')}] signale sur un texte ` +
              `qui ne contient aucun secret`,
      ).toBe('detecteur-sans-faux-positif');

      /* (4) LES RAPPORTS D ERREUR REELLEMENT PUBLIES PAR L ADAPTATEUR. */
      const jamaisEcrit = Buffer.from(`T14.A6 jamais ecrit ${RUN}`, 'utf8');
      const hAilleurs = await ouvrir(svc, { prefix: prefixe('a6', 'ailleurs') }, 'magasin ailleurs');
      const refAbsente = manifeste(
        exigerAccepte(await ecrire(hAilleurs, jamaisEcrit), 'ecriture ailleurs'),
        jamaisEcrit,
        'ecriture ailleurs',
      );
      const hVide = await ouvrir(svc, { prefix: prefixe('a6', 'vide') }, 'magasin vide');

      const corrompu = Buffer.from(charge);
      corrompu[0] = (corrompu[0] ?? 0) ^ 0xff;
      await ecrireBrut(svc, svc, cle, corrompu);

      const mauvaisSecret = `${svc.secretAccessKey.slice(0, -1)}${
        svc.secretAccessKey.endsWith('z') ? 'y' : 'z'
      }`;
      const hMauvais = await ouvrirIssue(svc, {
        prefix: p,
        creds: { accessKeyId: svc.accessKeyId, secretAccessKey: mauvaisSecret },
      });
      const hPerime = await ouvrirIssue(svc, {
        prefix: p,
        expires_at: new Date(Date.now() - 3600_000).toISOString(),
      });

      const rapports: Array<{ quoi: string; issue: Issue }> = [
        { quoi: 'lecture d un artefact absent', issue: await lire(hVide, refAbsente) },
        { quoi: 'lecture d un artefact corrompu', issue: await lire(h, ref) },
        {
          quoi: 'lecture sous identifiants invalides',
          issue: hMauvais.refuse ? hMauvais : await lire(hMauvais.valeur, ref),
        },
        {
          quoi: 'lecture sous autorisation perimee',
          issue: hPerime.refuse ? hPerime : await lire(hPerime.valeur, ref),
        },
        {
          quoi: 'ecriture sous identifiants invalides',
          issue: hMauvais.refuse
            ? hMauvais
            : await ecrire(hMauvais.valeur, Buffer.from(`T14.A6 refus ${RUN}`, 'utf8')),
        },
      ];

      let refusObserves = 0;
      for (const r of rapports) {
        if (r.issue.refuse) refusObserves += 1;
        const serialise = [
          r.issue.texte,
          r.issue.code ?? '',
          rendu(r.issue.valeur),
          (() => {
            try {
              return JSON.stringify(
                r.issue.valeur,
                (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
                0,
              ) ?? '';
            } catch {
              return '';
            }
          })(),
          r.issue.valeur instanceof Error ? String(r.issue.valeur.stack ?? '') : '',
        ].join('\n');
        const vues = fuites(serialise);
        expect(
          vues.length === AUCUN_SECRET
            ? 'aucun-secret-publie'
            : `SECRET-PUBLIE-DANS-UN-RAPPORT-D-ERREUR (${r.quoi}) : [${vues.join(', ')}] ` +
                `apparaissent dans ${court(serialise, 600)}`,
        ).toBe('aucun-secret-publie'); // cahier:L277
      }

      /* (5) LES RAPPORTS EXAMINES SONT DE VRAIS REFUS. Un adaptateur qui
             n aurait rien refuse aurait rendu A6 vert en n observant rien. */
      expect(
        refusObserves === rapports.length
          ? 'tous-les-rapports-sont-des-refus'
          : `RAPPORTS-SANS-REFUS : ${String(refusObserves)}/${String(rapports.length)} appels ` +
              `ont refuse ; les autres ont abouti : ` +
              `${rapports
                .filter((r) => !r.issue.refuse)
                .map((r) => `${r.quoi} -> ${court(r.issue.texte, 160)}`)
                .join(' | ')}`,
      ).toBe('tous-les-rapports-sont-des-refus'); // cahier:L139
    },
    CASE_TIMEOUT_MS,
  );
});
