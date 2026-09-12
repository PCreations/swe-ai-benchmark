/**
 * acceptance/T13.spec.ts — suite d'acceptation de la tache T13.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T13.A1 behaviour — memes octets donnent la meme reference de contenu
 *   T13.A2 behaviour — un octet change donne une autre reference
 *   T13.A3 refusal   — lecture apres corruption donne `ARTIFACT_CORRUPT`
 *   T13.A4 refusal   — fichier absent donne `ARTIFACT_MISSING`
 *   T13.A5 absence   — une ecriture interrompue n'est pas visible comme objet
 *                      final
 *   T13.A6 refusal   — extraction d'une archive contenant `../escape`, chemin
 *                      absolu ou lien sortant est refusee sans ecriture hors
 *                      destination
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE au `source_path` que
 * verification/tasks.json declare pour T13 — `packages/storage`. ADR-001 : cet
 * aveuglement est PROCEDURAL, donc une discipline auditable au diff, pas une
 * barriere technique. Le contrat teste ci-dessous n'a ete releve NI dans
 * l'implementation, NI par `git show` ; il est derive de docs/specs/T13.md,
 * c'est-a-dire des lignes du cahier que la carte de specification epingle :
 *
 *   L265  titre : « Construire le stockage immuable d'artefacts »
 *   L267  livrables : « port `ArtifactStore`, adaptateur local et MANIFESTE DE
 *         CONTENU »
 *   L269  les six cas d'acceptation, mot pour mot — dont les trois seuls
 *         litteraux que le cahier fixe ici : `ARTIFACT_CORRUPT`,
 *         `ARTIFACT_MISSING` et `../escape`
 *   L271  fin : « interface testee en contrat, LIMITES DE TAILLE DECLAREES,
 *         EMPREINTES VERIFIEES AVANT USAGE. Un nom de fichier fourni par le
 *         candidat n'est jamais concatene directement a un chemin du stockage
 *         central. »
 *   L82   « les empreintes utilisent SHA-256 sur des octets canoniques
 *         documentes » — c'est l'algorithme de la reference de contenu, et il
 *         n'est pas au choix de l'implementation
 *   L34   « le coeur metier ne depend ni de Temporal, ni de Docker [...] les
 *         interfaces sont implementees par adaptateurs » — d'ou un ADAPTATEUR
 *         LOCAL interrogeable sur une racine de repertoire fournie
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *   L141  « les tests d'ordonnancement emploient horloges controlees, barrieres
 *         et POINTS D'INJECTION NOMMES » — c'est ce qui rend A5 reproductible :
 *         une « ecriture interrompue » ne s'obtient pas en esperant un crash
 *   L559  chaque suite d'integration recoit un `test_run_id` technique unique
 *         et ses prefixes d'artefacts ; il ne modifie aucune valeur metier
 *   L28   « un defaut de prerequis produit BLOCKED, jamais PASS »
 *   L631  « les listes de cas definissent un minimum : des tests
 *         supplementaires sont possibles lorsqu'ils couvrent un risque
 *         concret »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Aucune fixture de §F ne porte sur T13 : la racine gelee
 * `acceptance/reference/**` ne contient que les dix fixtures arithmetiques
 * F-BOOTSTRAP … F-RESERVATION, dont aucune ne decrit le stockage d'artefacts.
 * Tout litteral COMPARE dans une assertion porte donc un commentaire
 * `// cahier:L<n>` resoluble par `sed -n '<n>p' docs/cahier.md`, et il n'y en a
 * que six :
 *
 *   `ARTIFACT_CORRUPT`  — L269, le nom du refus de lecture apres corruption
 *   `ARTIFACT_MISSING`  — L269, le nom du refus de lecture d'un objet absent
 *   `../escape`         — L269, le nom d'entree d'archive, cite tel quel
 *   `sha256`            — L82, l'algorithme des empreintes
 *   1                   — L269, « UN octet change »
 *   0                   — L269, « SANS ecriture hors destination »
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * ses charges utiles, ses racines de magasin derivees du `test_run_id` (L559),
 * ses archives, et les empreintes SHA-256 qu'elle CALCULE elle-meme selon L82 :
 * ce sont des ENTREES de la suite, jamais des valeurs attendues. La reference
 * de contenu, elle, n'est JAMAIS codee en dur — le cahier n'en fixe pas le
 * format, et l'inventer serait affirmer une regle qu'il n'enonce pas. La suite
 * n'observe que ses PROPRIETES : egale pour les memes octets, differente pour
 * d'autres octets, stable d'un magasin a l'autre.
 *
 * LA LIMITE DE TAILLE N'EST PAS UN LITTERAL. L271 exige des « limites de taille
 * DECLAREES » et ne donne aucun nombre. La suite ne l'invente donc pas : elle
 * LIT la limite que l'implementation publie et exige que c'en soit une (un
 * entier fini strictement positif). Elle n'exerce pas un depassement : allouer
 * `limite + 1` octets dependrait d'une valeur que le cahier ne fixe pas, et un
 * test qui choisirait ce plafond a la place de l'implementation affirmerait
 * une regle absente du cahier.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * LE TEMOIN INDEPENDANT : LE SYSTEME DE FICHIERS, HORS DE L'API DU MAGASIN.
 *
 * L267 nomme un « adaptateur local » : l'etat du magasin est alors OBSERVABLE
 * sans passer par ses exports. Chaque fait affirme par l'implementation est
 * recoupe par une lecture directe de l'arbre de fichiers — c'est ce
 * recoupement qui interdit l'implementation a etat en memoire, laquelle
 * satisferait « relire ce qu'on vient d'ecrire » sans qu'un octet n'atteigne
 * le disque.
 *
 *   arbre(racine)          — chemin relatif -> `fichier <sha256> <taille>`,
 *                            `dossier`, ou `lien -> <cible>`. Agnostique a la
 *                            disposition : la suite n'impose AUCUN nom de
 *                            fichier, aucun schema de repertoire. Deux arbres
 *                            se comparent, se soustraient, et c'est tout.
 *   ajoutes(avant, apres)  — les chemins qu'une operation a CREES. C'est la
 *                            seule notion d'« objet final » que la suite
 *                            emploie, et elle est definie par OBSERVATION :
 *                            l'objet final est ce qu'une ecriture REUSSIE fait
 *                            apparaitre. A5 exige alors qu'une ecriture
 *                            INTERROMPUE ne fasse apparaitre aucun de ces
 *                            memes chemins.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CONTRAT — CE QUE T13 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Le paquet interroge est celui que le registre declare : `packages/storage`,
 * et rien d'autre. Il est charge par le nom de son manifeste, sinon par
 * `src/index.ts`. Le chargement ne LEVE jamais : un import casse produirait
 * « Test suite failed to run », que verification/runner/red.mjs classe
 * SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc lui-meme
 * le chargement, et echoue par une assertion qui NOMME ce qui manque.
 *
 * CINQ ROLES ET UNE CONSTANTE, nommes par leur FONCTION et resolus par une
 * courte liste d'alias. Les alias sont une tolerance de NOMMAGE, jamais de
 * COMPORTEMENT. Aucun alias generique deja employe par la suite T12
 * (`openStore`, `publish`, `read`…) n'est repris : les deux taches partagent le
 * paquet `packages/storage`, et un role d'artefact ne doit pas se resoudre sur
 * un export de persistance PostgreSQL.
 *
 *   openArtifactStore({ root })            -> ouvre l'adaptateur local  (L267)
 *   putArtifact(h, octets, opts?)          -> ecrit, rend un manifeste  (L267)
 *   getArtifact(h, ref)                    -> relit les octets          (L269)
 *   listArtifacts(h)                       -> ce qui est VISIBLE        (L269)
 *   extractArchive(h, { archive_path, dest_dir }) -> extraction bornee  (L269)
 *   artifactSizeLimit                      -> la limite declaree        (L271)
 *
 * HUIT CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC FIXEES
 * ICI (elles sont reprises telles quelles dans verification/mutants/T13.json) :
 *
 *   1. OUVERTURE. `openArtifactStore` recoit un objet PLAT et STRICT
 *      (L80 : proprietes inconnues rejetees) : `{ root }`, ou `root` est le
 *      chemin ABSOLU d'un repertoire EXISTANT, cree par la suite. La suite ne
 *      passe aucune autre propriete, precisement parce qu'un contrat strict
 *      doit pouvoir refuser l'inconnu.
 *
 *   2. ECRITURE ET MANIFESTE DE CONTENU. `putArtifact(h, octets)` recoit des
 *      octets BRUTS (`Buffer`/`Uint8Array`) et rend le MANIFESTE DE CONTENU de
 *      L267 : un objet portant au moins
 *        `ref`    — la reference de contenu, chaine non vide      (L269)
 *        `digest` — l'empreinte SHA-256 des octets, en hexadecimal (L82)
 *        `size`   — la taille en octets
 *      Un manifeste sans empreinte rendrait « empreintes verifiees avant
 *      usage » (L271) inverifiable : l'empreinte doit etre PUBLIEE, pas
 *      seulement interne.
 *
 *   3. RELECTURE. `getArtifact(h, ref)` rend les octets EXACTS qui ont ete
 *      ecrits, ou REFUSE. Rendre un buffer vide, `null` ou `undefined` a la
 *      place d'un refus n'est pas une tolerance : c'est le defaut que A4
 *      condamne.
 *
 *   4. VISIBILITE. `listArtifacts(h)` rend ce que le magasin publie comme
 *      objets finaux — une liste de references, ou de manifestes portant une
 *      `ref`. « N'est pas visible comme objet final » (L269) n'a de sens que
 *      si la VISIBILITE est observable : c'est ce role qui la rend observable.
 *
 *   5. POINT D'INJECTION NOMME (L141). Le troisieme argument de `putArtifact`
 *      est un objet plat optionnel `{ fault }`. `fault` prend exactement UNE
 *      valeur, et rien d'autre :
 *        'INTERRUPT_BEFORE_PUBLISH'  les octets sont ecrits, puis l'ecriture
 *                                    est interrompue AVANT la publication de
 *                                    l'objet final                      (A5)
 *      Un point d'injection est un LIVRABLE, pas une commodite de test : sans
 *      lui, « une ecriture interrompue » ne serait pas reproductible, et A5 se
 *      reduirait a esperer un crash au bon moment. L'appel interrompu peut
 *      LEVER ou RENDRE un refus : la suite tolere les deux, parce que le cas
 *      ne porte pas sur la forme de l'interruption mais sur ce qui reste
 *      apres elle.
 *
 *   6. EXTRACTION. `extractArchive(h, { archive_path, dest_dir })` recoit deux
 *      chemins ABSOLUS : une archive tar POSIX (ustar, non compressee, ecrite
 *      par la suite elle-meme, octet par octet) et un repertoire de
 *      destination EXISTANT. L'implementation peut ignorer `h`. Le format tar
 *      est fixe ici parce que le cahier dit « une archive » sans en nommer un,
 *      et parce que les trois vecteurs que L269 enumere — `../escape`, chemin
 *      absolu, lien sortant — sont exactement les trois formes d'entree qu'un
 *      en-tete tar sait porter. Une extraction REUSSIE peut ne rien rendre :
 *      pour ce seul role, une valeur vide n'est pas lue comme un refus.
 *
 *   7. REFUS. Un refus peut etre LEVE ou RENDU. Dans les deux cas il porte un
 *      CODE qui NOMME sa cause : `ARTIFACT_CORRUPT` (L269) pour la lecture
 *      d'un objet corrompu, `ARTIFACT_MISSING` (L269) pour la lecture d'un
 *      objet absent, et pour l'extraction un code decrivant le chemin refuse
 *      (traversee, chemin absolu, lien sortant). Un `TypeError`, un
 *      « is not a function » ou un `ENOENT` brut n'est PAS un refus : c'est un
 *      plantage, et la suite le distingue explicitement. C'est le defaut
 *      decisif du mode de preuve `refusal` : un stub qui leve rendrait A3, A4
 *      et A6 verts sans rien prouver.
 *
 *   8. LIMITE DECLAREE. `artifactSizeLimit` est soit un nombre, soit une
 *      fonction sans argument qui en rend un — la « limite de taille declaree »
 *      de L271. La suite exige que ce soit un entier fini strictement positif ;
 *      elle ne lui impose aucune valeur.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne prouve rien sur S3 : le contrat sur un service objet reel, les
 *    identites limitees par prefixe et les transferts repris sont T14 (L273),
 *    pas T13. Elle n'ouvre aucune socket.
 *  • Elle ne prouve pas la coherence d'un checkpoint entre base, fichiers et
 *    files : c'est la barriere de T15 (L281).
 *  • Elle ne prouve pas l'isolation du candidat (sentinelle privee illisible,
 *    sortie reseau bloquee) : c'est T19 (L317). Elle prouve seulement qu'un
 *    NOM DE FICHIER porte par une archive n'est jamais concatene directement a
 *    un chemin de destination (L271), ce qui est la part de cette propriete
 *    qui vit dans le stockage.
 *  • Elle n'impose AUCUNE disposition de repertoire, aucun nom de fichier,
 *    aucun format de reference : L267 nomme un port, un adaptateur et un
 *    manifeste, et rien d'autre. Toute autre affirmation de schema serait une
 *    exigence inventee.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 120_000;

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

/** Le seul `source_path` que verification/tasks.json declare pour T13. */
const PACKAGES = ['storage'] as const;

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

/**
 * SHA-256 hexadecimal — L82 : « les empreintes utilisent SHA-256 ». C'est la
 * suite qui CALCULE, jamais l'implementation qui lui dicte.
 */
function sha256(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex'); // cahier:L82
}

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

/**
 * L269 ne nomme pas le code du refus d'extraction. La suite n'en invente donc
 * pas un : elle exige un refus qui NOMME sa cause parmi les causes que L269 et
 * L271 enoncent — une traversee, un chemin absolu, un lien sortant, un chemin
 * hors destination. Ce qu'elle refuse est le refus MUET.
 */
const MOTIF_CHEMIN_REFUSE =
  /TRAVERS|ESCAPE|ECHAPP|OUTSIDE|HORS|UNSAFE|INVALID_PATH|BAD_PATH|PATH|CHEMIN|ABSOLUT|ABSOLU|SYMLINK|LIEN|LINK|DENIED|FORBID|INTERDIT|REFUS|REJECT|ARCHIVE|ENTRY|ENTREE/i;

/** Ce qui n'est PAS un refus : un plantage. La distinction est decisive. */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ENOENT|EACCES|ECONNREFUSED|undefined is not/;

/* ══════════════════════ bac a sable, et temoin de fichiers ═════════════ */

/**
 * `test_run_id` technique de L559 : toutes les racines de magasin, archives et
 * destinations de cette execution en derivent, de sorte que deux executions
 * simultanees n'interferent pas. Il n'entre dans AUCUNE assertion — c'est un
 * namespace, pas une valeur metier.
 */
const RUN = `t13_${process.pid.toString(36)}_${Date.now().toString(36)}`;

/**
 * Racine jetable, COURTE a dessein : le champ `name` d'un en-tete tar ustar
 * fait 100 octets, et le vecteur « chemin absolu » de L269 doit y tenir en
 * entier.
 */
const SABLE = fs.mkdtempSync(path.join(os.tmpdir(), 't13-'));

function dossier(...parts: string[]): string {
  const p = path.join(SABLE, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

afterAll(() => {
  try {
    fs.rmSync(SABLE, { recursive: true, force: true });
  } catch {
    /* un bac a sable non supprime ne change aucun verdict */
  }
});

/**
 * ARBRE OBSERVE : chemin relatif -> description. Lit le disque directement,
 * sans passer par un seul export de l'implementation. `lstat` et non `stat` :
 * un lien symbolique doit se voir COMME lien, sinon le vecteur « lien sortant »
 * de L269 serait invisible au temoin.
 */
function arbre(racine: string): Map<string, string> {
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
      let cible = '?';
      try {
        cible = fs.readlinkSync(abs);
      } catch {
        /* un lien illisible reste un lien */
      }
      out.set(rel, `lien -> ${cible}`);
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
    if (st.isFile()) {
      let contenu = Buffer.alloc(0);
      try {
        contenu = fs.readFileSync(abs);
      } catch {
        /* un fichier illisible se decrit par sa taille seule */
      }
      out.set(rel, `fichier ${sha256(contenu)} ${String(st.size)}`);
      continue;
    }
    out.set(rel, 'autre');
  }
  return out;
}

/** Les chemins qu'une operation a CREES — la definition observee d'« objet final ». */
function ajoutes(avant: Map<string, string>, apres: Map<string, string>): string[] {
  return [...apres.keys()].filter((k) => !avant.has(k)).sort();
}

/** Les chemins CREES qui sont des fichiers (les dossiers ne portent pas d'octets). */
function fichiersAjoutes(avant: Map<string, string>, apres: Map<string, string>): string[] {
  return ajoutes(avant, apres).filter((k) => (apres.get(k) ?? '').startsWith('fichier '));
}

const vueArbre = (m: Map<string, string>): string =>
  [...m.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(' | ');

/* ═══════════════════ archives tar, ecrites octet par octet ════════════ */

/**
 * POURQUOI LA SUITE FABRIQUE SES ARCHIVES ELLE-MEME, PLUTOT QUE D'APPELER `tar`.
 *
 * Les trois vecteurs de L269 sont precisement ceux que les archiveurs du
 * systeme REFUSENT de produire : GNU tar retire le `../` de tete et le `/`
 * initial en emettant un avertissement. Une archive d'attaque obtenue par
 * `tar -cf` ne contiendrait donc PAS l'attaque, et A6 serait vert sur une
 * archive inoffensive — un faux PASS parfait. Les en-tetes ci-dessous sont
 * ecrits champ par champ, en ustar, de sorte que le vecteur soit dans
 * l'archive et non dans l'intention de son auteur.
 */

interface Entree {
  /** Le nom d'entree, tel qu'il sera lu par l'extracteur. */
  nom: string;
  /** '0' fichier ordinaire, '2' lien symbolique. */
  typeflag: '0' | '2';
  contenu?: Buffer;
  lien?: string;
}

function champOctal(n: number, taille: number): string {
  return `${n.toString(8).padStart(taille - 1, '0')}\0`;
}

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

/** Une archive tar ustar non compressee, terminee par deux blocs nuls. */
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
  openArtifactStore: [
    'openArtifactStore',
    'createArtifactStore',
    'openLocalArtifactStore',
    'createLocalArtifactStore',
    'localArtifactStore',
    'makeArtifactStore',
    'artifactStore',
    'openArtifacts',
    'createArtifacts',
    'openLocalStore',
    'createLocalStore',
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
  const candidats = ROLES[role];
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
          manquants.map((r) => `${r}:[${ROLES[r].join('|')}]`).join(' ; ') +
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
  // lecture, y compris quand ils sont vides — et c'est exactement le retour
  // permissif que A4 doit condamner.
  if (ArrayBuffer.isView(brut)) {
    return { refuse: false, via: 'octets', texte, code: null, valeur: brut, leve: false };
  }
  if (brut === null || brut === undefined) {
    return videEstRefus
      ? { refuse: true, via: 'nullish', texte: `RENDU-VIDE ${texte}`, code: null, valeur: brut, leve: false }
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

/** Lecture tolerante d'un champ, au sommet ou sous un enveloppement usuel. */
function champ(v: unknown, noms: readonly string[]): unknown {
  if (v === null || typeof v !== 'object') return undefined;
  const o = v as Json;
  for (const n of noms) if (o[n] !== undefined) return o[n];
  for (const conteneur of ['manifest', 'manifeste', 'entry', 'entree', 'artifact', 'object', 'record', 'value', 'data', 'result', 'receipt', 'recu']) {
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

/** La reference de contenu portee par un manifeste, ou la chaine elle-meme. */
function refDe(v: unknown): string | null {
  if (typeof v === 'string') return v.length > 0 ? v : null;
  const r = champ(v, NOMS_REF);
  return typeof r === 'string' && r.length > 0 ? r : null;
}

function digestDe(v: unknown): string | null {
  const d = champ(v, NOMS_DIGEST);
  return typeof d === 'string' && d.length > 0 ? d : null;
}

function tailleDe(v: unknown): number | null {
  const t = champ(v, NOMS_TAILLE);
  return typeof t === 'number' ? t : null;
}

/** Des octets rendus par l'implementation, sous l'une des formes usuelles. */
function octets(v: unknown): Buffer | null {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  if (v instanceof ArrayBuffer) return Buffer.from(new Uint8Array(v));
  if (v !== null && typeof v === 'object') {
    for (const n of ['bytes', 'octets', 'buffer', 'data', 'content', 'contenu', 'body', 'payload']) {
      const s = (v as Json)[n];
      if (Buffer.isBuffer(s) || s instanceof Uint8Array || s instanceof ArrayBuffer) return octets(s);
    }
  }
  return null;
}

/* ═══════════ ouverture, ecriture, relecture, listage, extraction ═══════ */

async function ouvrir(racine: string): Promise<unknown> {
  fs.mkdirSync(racine, { recursive: true });
  return exigerAccepte(
    await appeler('openArtifactStore', [{ root: racine }]),
    `ouverture du magasin local sur ${racine}`,
  );
}

async function ecrire(h: unknown, b: Buffer, opts?: Json): Promise<Issue> {
  return opts === undefined
    ? appeler('putArtifact', [h, b])
    : appeler('putArtifact', [h, b, opts]);
}

async function lire(h: unknown, ref: string): Promise<Issue> {
  return appeler('getArtifact', [h, ref]);
}

/** Les references VISIBLES, quelle que soit la forme du listage. */
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

function occurrences(xs: readonly string[], x: string): number {
  return xs.filter((y) => y === x).length;
}

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

/** Relecture EXACTE — la seule lecture qu'une immuabilite rend acceptable. */
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

/** Le nombre d'octets qui different entre deux charges de meme longueur. */
function octetsDifferents(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let n = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) n += 1;
  return n;
}

/** Le plus gros fichier cree par une ecriture : celui qui porte les octets. */
function plusGrosFichier(racine: string, crees: readonly string[]): string | null {
  let meilleur: string | null = null;
  let taille = -1;
  for (const rel of crees) {
    const abs = path.join(racine, rel);
    try {
      const st = fs.statSync(abs);
      if (st.isFile() && st.size > taille) {
        taille = st.size;
        meilleur = abs;
      }
    } catch {
      /* un chemin disparu n'est pas un candidat */
    }
  }
  return meilleur;
}

/* ══════════════════════════════ LES SIX CAS ════════════════════════════ */

describe('T13 — stockage immuable d artefacts', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T13.A1 memes octets donnent la meme reference de contenu',
    async () => {
      assertLoaded();
      assertContrat('openArtifactStore', 'putArtifact', 'getArtifact', 'listArtifacts');

      const charge = Buffer.from(`T13.A1 charge utile ${RUN}\n${'artefact-'.repeat(32)}`, 'utf8');

      const racine1 = dossier('a1', 'magasin-1');
      const racine2 = dossier('a1', 'magasin-2');
      const h1 = await ouvrir(racine1);
      const h2 = await ouvrir(racine2);

      // (1) DEUX ECRITURES DES MEMES OCTETS DANS LE MEME MAGASIN.
      const avant1 = arbre(racine1);
      const m1 = await ecrire(h1, charge);
      const ref1 = manifeste(exigerAccepte(m1, 'premiere ecriture'), charge, 'premiere ecriture');
      const apres1 = arbre(racine1);
      const m2 = await ecrire(h1, charge);
      const ref2 = manifeste(
        exigerAccepte(m2, 'deuxieme ecriture des MEMES octets'),
        charge,
        'deuxieme ecriture des MEMES octets',
      );
      expect(
        ref2 === ref1
          ? 'meme-reference'
          : `REFERENCES-DIFFERENTES-POUR-LES-MEMES-OCTETS : ${court(ref1, 200)} puis ` +
              `${court(ref2, 200)} — L269 exige la MEME reference de contenu`,
      ).toBe('meme-reference'); // cahier:L269

      // (2) LES MEMES OCTETS, DANS UN AUTRE MAGASIN : une reference de CONTENU
      //     ne depend pas de l'histoire du magasin qui l'a recue.
      const ref3 = manifeste(
        exigerAccepte(await ecrire(h2, charge), 'ecriture des memes octets dans un autre magasin'),
        charge,
        'ecriture dans un autre magasin',
      );
      expect(
        ref3 === ref1
          ? 'reference-stable-entre-magasins'
          : `REFERENCE-DEPENDANTE-DU-MAGASIN : ${court(ref1, 200)} ici, ${court(ref3, 200)} ` +
              `la-bas, pour des octets identiques (sha256=${sha256(charge)})`,
      ).toBe('reference-stable-entre-magasins'); // cahier:L269

      // (3) RELECTURE EXACTE, dans les deux magasins.
      exigerOctets(await lire(h1, ref1), charge, `relecture de ${court(ref1, 80)} (magasin 1)`);
      exigerOctets(await lire(h2, ref3), charge, `relecture de ${court(ref3, 80)} (magasin 2)`);

      // (4) UN SEUL OBJET LOGIQUE VISIBLE apres deux ecritures identiques.
      const visibles = await lister(h1, 'listage du magasin 1');
      expect(
        occurrences(visibles, ref1) === 1
          ? 'un-seul-objet-visible'
          : `OBJET-DUPLIQUE-OU-INVISIBLE : ${String(occurrences(visibles, ref1))} occurrence(s) ` +
              `de ${court(ref1, 120)} dans [${court(visibles.join(', '), 400)}] apres DEUX ` +
              `ecritures des memes octets`,
      ).toBe('un-seul-objet-visible'); // cahier:L269

      // (5) TEMOIN INDEPENDANT — le disque, hors de l'API du magasin.
      const crees = fichiersAjoutes(avant1, apres1);
      expect(
        crees.length >= 1
          ? 'objet-sur-le-disque'
          : `AUCUN-FICHIER-CREE-SOUS-LA-RACINE ${racine1} : un adaptateur LOCAL qui ne pose ` +
              `aucun octet sur le disque sert un etat en memoire — arbre observe : ` +
              `${court(vueArbre(apres1), 400)}`,
      ).toBe('objet-sur-le-disque'); // cahier:L267

      // (6) LA LIMITE DE TAILLE EST DECLAREE (L271). La suite la LIT ; elle ne
      //     lui impose aucune valeur.
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
    'T13.A2 un octet change donne une autre reference',
    async () => {
      assertLoaded();
      assertContrat('openArtifactStore', 'putArtifact', 'getArtifact');

      const base = Buffer.from(`T13.A2 charge utile ${RUN}\n${'octet-'.repeat(40)}`, 'utf8');

      // TROIS VARIANTES, ET LA PREMIERE N'EST PAS UN LUXE. Une empreinte qui
      // ignorerait le DERNIER octet survivrait a une difference au milieu :
      // c'est exactement la mutation que verification/mutants/T13.json pose sur
      // ce cas. La variante « dernier octet » est donc la seule qui la tue.
      const dernier = Buffer.from(base);
      dernier[dernier.length - 1] ^= 0xff;
      const milieu = Buffer.from(base);
      milieu[Math.floor(base.length / 2)] ^= 0xff;
      const premier = Buffer.from(base);
      premier[0] ^= 0xff;

      for (const [nom, variante] of [
        ['dernier octet', dernier],
        ['octet du milieu', milieu],
        ['premier octet', premier],
      ] as Array<[string, Buffer]>) {
        expect(
          octetsDifferents(base, variante) === UN_OCTET
            ? 'fixture-a-un-octet-pres'
            : `FIXTURE-INVALIDE ${nom} : ${String(octetsDifferents(base, variante))} octets ` +
                `different, la suite en voulait ${String(UN_OCTET)}`,
        ).toBe('fixture-a-un-octet-pres'); // cahier:L269
      }

      const racine = dossier('a2', 'magasin');
      const h = await ouvrir(racine);

      const refBase = manifeste(
        exigerAccepte(await ecrire(h, base), 'ecriture de la charge de base'),
        base,
        'ecriture de la charge de base',
      );

      for (const [nom, variante] of [
        ['dernier octet', dernier],
        ['octet du milieu', milieu],
        ['premier octet', premier],
      ] as Array<[string, Buffer]>) {
        const m = exigerAccepte(await ecrire(h, variante), `ecriture de la variante « ${nom} »`);
        const refVariante = manifeste(m, variante, `variante « ${nom} »`);
        expect(
          refVariante !== refBase
            ? 'reference-differente'
            : `MEME-REFERENCE-POUR-DES-OCTETS-DIFFERENTS (${nom}) : ${court(refBase, 200)} — ` +
                `sha256 des deux charges : ${sha256(base)} et ${sha256(variante)}`,
        ).toBe('reference-differente'); // cahier:L269
        // Les deux objets coexistent, et aucun n'ecrase l'autre : un magasin
        // IMMUABLE (L265) ne reecrit pas une adresse deja publiee.
        exigerOctets(await lire(h, refVariante), variante, `relecture de la variante « ${nom} »`);
        exigerOctets(await lire(h, refBase), base, `relecture de la base apres « ${nom} »`);
      }

      // UNE CHARGE PROLONGEE D'UN OCTET : une empreinte qui ignore la longueur
      // rendrait ici la meme reference que la base.
      const prolonge = Buffer.concat([base, Buffer.from([0x00])]);
      const refProlonge = manifeste(
        exigerAccepte(await ecrire(h, prolonge), 'ecriture de la charge prolongee'),
        prolonge,
        'charge prolongee d un octet',
      );
      expect(
        refProlonge !== refBase
          ? 'reference-differente-en-longueur'
          : `MEME-REFERENCE-POUR-UNE-CHARGE-PROLONGEE : ${court(refBase, 200)} ` +
              `(${String(base.length)} octets contre ${String(prolonge.length)})`,
      ).toBe('reference-differente-en-longueur'); // cahier:L269
      exigerOctets(await lire(h, refProlonge), prolonge, 'relecture de la charge prolongee');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T13.A3 lecture apres corruption donne ARTIFACT_CORRUPT',
    async () => {
      assertLoaded();
      assertContrat('openArtifactStore', 'putArtifact', 'getArtifact');

      const charge = Buffer.from(`T13.A3 charge utile ${RUN}\n${'corruption-'.repeat(48)}`, 'utf8');
      const racine = dossier('a3', 'magasin');
      const h = await ouvrir(racine);

      const avant = arbre(racine);
      const ref = manifeste(
        exigerAccepte(await ecrire(h, charge), 'ecriture avant corruption'),
        charge,
        'ecriture avant corruption',
      );
      const apres = arbre(racine);
      const crees = fichiersAjoutes(avant, apres);

      // CONTROLE POSITIF : avant toute corruption, la lecture rend les octets.
      // Sans lui, une implementation qui refuse TOUTE lecture verdirait ce cas
      // sans rien prouver.
      exigerOctets(await lire(h, ref), charge, 'lecture AVANT corruption');

      const cible = plusGrosFichier(racine, crees);
      expect(
        cible !== null
          ? 'objet-localise-sur-le-disque'
          : `OBJET-INTROUVABLE-SUR-LE-DISQUE sous ${racine} : fichiers crees par l'ecriture = ` +
              `[${crees.join(', ')}] — un adaptateur local doit poser l'objet sur le disque`,
      ).toBe('objet-localise-sur-le-disque'); // cahier:L267
      const chemin = cible as string;

      // CORRUPTION D'UN SEUL OCTET, LONGUEUR PRESERVEE. Une longueur preservee
      // interdit qu'un simple controle de taille tienne lieu de verification
      // d'empreinte : L271 exige des « empreintes verifiees avant usage ».
      const avantOctets = fs.readFileSync(chemin);
      const corrompus = Buffer.from(avantOctets);
      expect(
        corrompus.length > 0
          ? 'objet-non-vide'
          : `OBJET-VIDE-SUR-LE-DISQUE ${chemin} : rien a corrompre`,
      ).toBe('objet-non-vide');
      const i = Math.floor(corrompus.length / 2);
      corrompus[i] ^= 0xff;
      fs.writeFileSync(chemin, corrompus);
      const relus = fs.readFileSync(chemin);
      expect(
        relus.length === avantOctets.length
          ? 'longueur-preservee'
          : `CORRUPTION-MAL-FORMEE : ${String(avantOctets.length)} octets avant, ` +
              `${String(relus.length)} apres`,
      ).toBe('longueur-preservee');
      expect(
        octetsDifferents(avantOctets, relus) === UN_OCTET
          ? 'un-seul-octet-corrompu'
          : `CORRUPTION-MAL-FORMEE : ${String(octetsDifferents(avantOctets, relus))} octets ` +
              `differents, la suite en voulait ${String(UN_OCTET)}`,
      ).toBe('un-seul-octet-corrompu'); // cahier:L269

      // LECTURE APRES CORRUPTION — sur un magasin REOUVERT, pour qu'aucun cache
      // de processus ne puisse temoigner a la place du disque.
      const h2 = await ouvrir(racine);
      const issue = await lire(h2, ref);
      exigerRefusNomme(
        issue,
        MOTIF_CORROMPU,
        CODE_CORROMPU,
        `lecture de ${court(ref, 80)} apres corruption d un octet`,
      ); // cahier:L269
      const rendus = octets(issue.valeur);
      expect(
        rendus === null
          ? 'aucun-octet-corrompu-rendu'
          : `OCTETS-CORROMPUS-RENDUS : ${String((rendus as Buffer).length)} octets ` +
              `sha256=${sha256(rendus as Buffer)} — une lecture refusee ne rend pas d'octets`,
      ).toBe('aucun-octet-corrompu-rendu'); // cahier:L271
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T13.A4 fichier absent donne ARTIFACT_MISSING',
    async () => {
      assertLoaded();
      assertContrat('openArtifactStore', 'putArtifact', 'getArtifact');

      const charge = Buffer.from(`T13.A4 charge utile ${RUN}\n${'absent-'.repeat(40)}`, 'utf8');

      const racineVide = dossier('a4', 'magasin-vide');
      const racineTemoin = dossier('a4', 'magasin-temoin');
      const hVide = await ouvrir(racineVide);
      const hTemoin = await ouvrir(racineTemoin);

      // Une reference BIEN FORMEE, obtenue d'un magasin qui la porte vraiment :
      // c'est ce qui distingue « objet absent » de « reference illisible ».
      const ref = manifeste(
        exigerAccepte(await ecrire(hTemoin, charge), 'ecriture dans le magasin temoin'),
        charge,
        'ecriture dans le magasin temoin',
      );
      // CONTROLE POSITIF : la meme reference, lue la ou l'objet EST, rend les
      // octets. Une implementation qui refuse tout ne verdit donc pas ce cas.
      exigerOctets(await lire(hTemoin, ref), charge, 'lecture la ou l objet est present');

      // (1) OBJET JAMAIS ECRIT ICI.
      exigerRefusNomme(
        await lire(hVide, ref),
        MOTIF_ABSENT,
        CODE_ABSENT,
        `lecture de ${court(ref, 80)} dans un magasin qui ne l a jamais recu`,
      ); // cahier:L269

      // (2) FICHIER ABSENT AU SENS LITTERAL DE L269 : l'objet a ete ecrit, puis
      //     ses fichiers ont disparu du disque sous le magasin.
      const racineTrouee = dossier('a4', 'magasin-troue');
      const hTroue = await ouvrir(racineTrouee);
      const avant = arbre(racineTrouee);
      const ref2 = manifeste(
        exigerAccepte(await ecrire(hTroue, charge), 'ecriture dans le magasin a trouer'),
        charge,
        'ecriture dans le magasin a trouer',
      );
      const apres = arbre(racineTrouee);
      exigerOctets(await lire(hTroue, ref2), charge, 'lecture avant suppression du fichier');

      const crees = fichiersAjoutes(avant, apres);
      expect(
        crees.length >= 1
          ? 'fichiers-localises'
          : `AUCUN-FICHIER-CREE sous ${racineTrouee} : rien a supprimer — arbre observe ` +
              `${court(vueArbre(apres), 400)}`,
      ).toBe('fichiers-localises'); // cahier:L267
      for (const rel of crees) {
        try {
          fs.rmSync(path.join(racineTrouee, rel), { force: true });
        } catch {
          /* un fichier deja parti est deja absent */
        }
      }
      for (const rel of crees) {
        expect(
          !fs.existsSync(path.join(racineTrouee, rel))
            ? 'fichier-supprime'
            : `FICHIER-NON-SUPPRIME ${rel} : la suite n a pas pu creer la condition du cas`,
        ).toBe('fichier-supprime');
      }

      const hTroue2 = await ouvrir(racineTrouee);
      const issue = await lire(hTroue2, ref2);
      exigerRefusNomme(
        issue,
        MOTIF_ABSENT,
        CODE_ABSENT,
        `lecture de ${court(ref2, 80)} apres disparition de ses fichiers`,
      ); // cahier:L269
      const rendus = octets(issue.valeur);
      expect(
        rendus === null
          ? 'aucun-octet-rendu-pour-un-objet-absent'
          : `OCTETS-RENDUS-POUR-UN-OBJET-ABSENT : ${String((rendus as Buffer).length)} octets — ` +
              `rendre un buffer vide au lieu de ${CODE_ABSENT} est le defaut que ce cas condamne`,
      ).toBe('aucun-octet-rendu-pour-un-objet-absent'); // cahier:L269
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T13.A5 une ecriture interrompue n est pas visible comme objet final',
    async () => {
      assertLoaded();
      assertContrat('openArtifactStore', 'putArtifact', 'getArtifact', 'listArtifacts');

      const charge = Buffer.from(`T13.A5 charge utile ${RUN}\n${'interrompu-'.repeat(48)}`, 'utf8');

      // (1) LE TEMOIN : la MEME charge, ecrite SANS interruption, dans un
      //     magasin jumeau. C'est lui qui DEFINIT, par observation, ce qu'est
      //     un objet final — la reference publiee et les chemins que
      //     l'ecriture fait apparaitre. Sans ce controle positif, une
      //     implementation qui n'ecrit JAMAIS rien satisferait « pas visible »
      //     sans rien prouver.
      const racineTemoin = dossier('a5', 'magasin-temoin');
      const hTemoin = await ouvrir(racineTemoin);
      const avantTemoin = arbre(racineTemoin);
      const refFinale = manifeste(
        exigerAccepte(await ecrire(hTemoin, charge), 'ecriture NON interrompue (temoin)'),
        charge,
        'ecriture NON interrompue (temoin)',
      );
      const apresTemoin = arbre(racineTemoin);
      const cheminsFinaux = fichiersAjoutes(avantTemoin, apresTemoin);
      expect(
        cheminsFinaux.length >= 1
          ? 'objet-final-observe'
          : `AUCUN-OBJET-FINAL-OBSERVE sous ${racineTemoin} : une ecriture REUSSIE doit faire ` +
              `apparaitre au moins un fichier — arbre ${court(vueArbre(apresTemoin), 400)}`,
      ).toBe('objet-final-observe'); // cahier:L267
      exigerOctets(await lire(hTemoin, refFinale), charge, 'relecture du temoin');
      const visiblesTemoin = await lister(hTemoin, 'listage du magasin temoin');
      expect(
        occurrences(visiblesTemoin, refFinale) === 1
          ? 'objet-final-visible'
          : `OBJET-FINAL-NON-VISIBLE : ${court(refFinale, 120)} absent de ` +
              `[${court(visiblesTemoin.join(', '), 400)}] apres une ecriture REUSSIE`,
      ).toBe('objet-final-visible'); // cahier:L269

      // (2) L'ECRITURE INTERROMPUE, au point d'injection nomme de L141.
      const racine = dossier('a5', 'magasin-interrompu');
      const h = await ouvrir(racine);
      const issueEcriture = await ecrire(h, charge, { fault: 'INTERRUPT_BEFORE_PUBLISH' });
      // Lever ou rendre un refus sont tous deux acceptables : le cas ne porte
      // pas sur la FORME de l'interruption, mais sur ce qu'elle laisse.
      const formeInterruption = issueEcriture.refuse
        ? `refus [${issueEcriture.via}]`
        : `valeur ${court(rendu(issueEcriture.valeur), 200)}`;

      // (3) CE QUI NE DOIT PAS ETRE LA. Magasin REOUVERT : aucun cache de
      //     processus ne temoigne a la place du disque.
      const h2 = await ouvrir(racine);
      exigerRefusNomme(
        await lire(h2, refFinale),
        MOTIF_ABSENT,
        CODE_ABSENT,
        `lecture de ${court(refFinale, 80)} apres une ecriture interrompue (${formeInterruption})`,
      ); // cahier:L269

      const visibles = await lister(h2, 'listage du magasin interrompu');
      expect(
        occurrences(visibles, refFinale) === AUCUNE_VISIBILITE
          ? 'objet-interrompu-invisible'
          : `OBJET-INTERROMPU-VISIBLE : ${court(refFinale, 120)} apparait ` +
              `${String(occurrences(visibles, refFinale))} fois dans ` +
              `[${court(visibles.join(', '), 400)}] apres une ecriture INTERROMPUE`,
      ).toBe('objet-interrompu-invisible'); // cahier:L269

      // (4) TEMOIN INDEPENDANT : aucun des chemins qu'une ecriture REUSSIE fait
      //     apparaitre n'existe ici. C'est la propriete que l'ecriture
      //     temporaire suivie d'un renommage atomique donne, et qu'une ecriture
      //     directe sur le chemin final ne donne pas.
      const presents = cheminsFinaux.filter((rel) => fs.existsSync(path.join(racine, rel)));
      expect(
        presents.length === AUCUNE_VISIBILITE
          ? 'aucun-chemin-final-apres-interruption'
          : `CHEMIN-FINAL-PRESENT-APRES-INTERRUPTION [${presents.join(', ')}] sous ${racine} : ` +
              `ces chemins sont exactement ceux qu'une ecriture REUSSIE publie ` +
              `(${cheminsFinaux.join(', ')})`,
      ).toBe('aucun-chemin-final-apres-interruption'); // cahier:L269
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T13.A6 extraction d une archive piegee est refusee sans ecriture hors destination',
    async () => {
      assertLoaded();
      assertContrat('openArtifactStore', 'extractArchive');

      const racine = dossier('a6', 'magasin');
      const h = await ouvrir(racine);

      const charge = Buffer.from(`T13.A6 charge d attaque ${RUN}`, 'utf8');

      /** Ce qui est hors destination : tout sauf le sous-arbre `dest`. */
      const horsDestination = (base: string): Map<string, string> => {
        const out = new Map<string, string>();
        for (const [k, v] of arbre(base)) {
          if (k === 'dest' || k.startsWith(`dest${path.sep}`)) continue;
          out.set(k, v);
        }
        return out;
      };

      interface Vecteur {
        id: string;
        nom: string;
        entrees: Entree[];
        /** Le chemin que l'attaque atteint si l'extracteur est permissif. */
        cible: string;
      }

      const vecteurs: Vecteur[] = [];

      // VECTEUR 1 — l'entree `../escape`, citee mot pour mot par L269.
      {
        const base = dossier('a6', 'v1');
        dossier('a6', 'v1', 'dest');
        vecteurs.push({
          id: 'v1',
          nom: ENTREE_TRAVERSEE,
          entrees: [{ nom: ENTREE_TRAVERSEE, typeflag: '0', contenu: charge }],
          cible: path.join(base, 'escape'),
        });
      }

      // VECTEUR 2 — un chemin ABSOLU. Sa cible est dans le bac a sable de la
      // suite : une attaque de test ne doit rien ecrire ailleurs, meme quand
      // elle reussit.
      {
        const base = dossier('a6', 'v2');
        dossier('a6', 'v2', 'dest');
        const absolu = path.join(base, 'escape-absolu');
        expect(
          Buffer.byteLength(absolu, 'utf8') <= 100
            ? 'nom-absolu-portable'
            : `FIXTURE-INVALIDE : le chemin absolu ${absolu} ne tient pas dans les 100 ` +
                `octets du champ de nom d un en-tete ustar`,
        ).toBe('nom-absolu-portable');
        vecteurs.push({
          id: 'v2',
          nom: absolu,
          entrees: [{ nom: absolu, typeflag: '0', contenu: charge }],
          cible: absolu,
        });
      }

      // VECTEUR 3 — un LIEN SORTANT, puis une ecriture a travers lui. C'est la
      // forme que la normalisation de chemin seule ne voit pas : `lien-sortant/
      // charge` reste, textuellement, sous la destination.
      {
        const base = dossier('a6', 'v3');
        dossier('a6', 'v3', 'dest');
        vecteurs.push({
          id: 'v3',
          nom: 'lien-sortant -> ..',
          entrees: [
            { nom: 'lien-sortant', typeflag: '2', lien: base },
            { nom: 'lien-sortant/charge', typeflag: '0', contenu: charge },
          ],
          cible: path.join(base, 'charge'),
        });
      }

      for (const v of vecteurs) {
        const base = path.join(SABLE, 'a6', v.id);
        const dest = path.join(base, 'dest');
        fs.writeFileSync(path.join(base, 'sentinelle.txt'), `sentinelle ${RUN}`, 'utf8');
        const avant = horsDestination(base);
        const archive = ecrireArchive(`attaque-${v.id}.tar`, v.entrees);

        const issue = await appeler(
          'extractArchive',
          [h, { archive_path: archive, dest_dir: dest }],
          false,
        );
        exigerRefusNomme(
          issue,
          MOTIF_CHEMIN_REFUSE,
          'un code nommant le chemin refuse',
          `extraction de l archive piegee « ${v.nom} »`,
        ); // cahier:L269

        expect(
          !fs.existsSync(v.cible)
            ? 'cible-hors-destination-absente'
            : `ECRITURE-HORS-DESTINATION ${v.cible} : l attaque « ${v.nom} » a atteint ce ` +
                `chemin, hors de la destination ${dest}`,
        ).toBe('cible-hors-destination-absente'); // cahier:L269

        const apres = horsDestination(base);
        const nouveaux = ajoutes(avant, apres);
        expect(
          nouveaux.length === AUCUNE_ECRITURE
            ? 'rien-hors-destination'
            : `ECRITURE-HORS-DESTINATION [${nouveaux.join(', ')}] sous ${base} apres ` +
                `« ${v.nom} » — la destination etait ${dest}`,
        ).toBe('rien-hors-destination'); // cahier:L269
        expect(vueArbre(apres)).toBe(vueArbre(avant)); // cahier:L269
      }

      // CONTROLE POSITIF — sans lui, un extracteur qui refuse TOUTE archive
      // verdirait ce cas sans rien prouver. C'est la lecon de la porte rouge de
      // T00 : un refus n'est un refus que s'il existe un non-refus.
      const baseBenin = dossier('a6', 'benin');
      const destBenin = dossier('a6', 'benin', 'dest');
      const contenuBenin = Buffer.from(`contenu legitime ${RUN}`, 'utf8');
      const archiveBenigne = ecrireArchive('benigne.tar', [
        { nom: 'contenu-ok.txt', typeflag: '0', contenu: contenuBenin },
      ]);
      const issueBenigne = await appeler(
        'extractArchive',
        [h, { archive_path: archiveBenigne, dest_dir: destBenin }],
        false,
      );
      exigerAccepte(issueBenigne, 'extraction d une archive BENIGNE');
      const extrait = path.join(destBenin, 'contenu-ok.txt');
      expect(
        fs.existsSync(extrait)
          ? 'archive-benigne-extraite'
          : `ARCHIVE-BENIGNE-NON-EXTRAITE : ${extrait} absent — arbre ` +
              `${court(vueArbre(arbre(baseBenin)), 400)}`,
      ).toBe('archive-benigne-extraite');
      expect(
        fs.existsSync(extrait) && Buffer.compare(fs.readFileSync(extrait), contenuBenin) === 0
          ? 'contenu-benin-identique'
          : `CONTENU-BENIN-DIFFERENT ${extrait} : attendu sha256=${sha256(contenuBenin)}`,
      ).toBe('contenu-benin-identique');
    },
    CASE_TIMEOUT_MS,
  );
});
