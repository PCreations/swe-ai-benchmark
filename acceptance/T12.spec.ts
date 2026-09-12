/**
 * acceptance/T12.spec.ts — suite d'acceptation de la tache T12.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T12.A1 behaviour — arret/reconnexion retrouve le meme etat
 *   T12.A2 behaviour — vingt publications concurrentes d'un meme resultat
 *                      donnent un seul resultat logique
 *   T12.A3 refusal   — meme cle / autre digest donne conflit
 *   T12.A4 absence   — panne avant commit ne laisse ni resultat ni evenement
 *                      orphelin visible
 *   T12.A5 absence   — panne apres commit puis reprise ne duplique rien
 *   T12.A6 behaviour — une transaction concurrente conflictuelle est reprise
 *                      selon une limite fixee, sans perdre l'unicite
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE au `source_path` que
 * verification/tasks.json declare pour T12 — `packages/storage`. ADR-001 : cet
 * aveuglement est PROCEDURAL, donc une discipline auditable au diff, pas une
 * barriere technique. Le contrat teste ci-dessous n'a pas ete releve dans
 * l'implementation ; il est derive de docs/specs/T12.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle :
 *
 *   L255  titre : « Persister les evenements et resultats dans PostgreSQL »
 *   L257  livrables : « migrations du schema central, repositories, outbox et
 *         publication transactionnelle »
 *   L259  « Tables minimales : campaigns, trajectories, periods, operations,
 *         domain_events, deployments, incidents, artifact_refs, checkpoints,
 *         model_calls, ledger_entries, budget_reservations et outbox. »
 *   L261  les six cas d'acceptation, mot pour mot — dont le seul litteral
 *         numerique que le cahier fixe ici : VINGT publications concurrentes,
 *         UN seul resultat logique
 *   L263  fin : « tests sur PostgreSQL REEL et preuves SQL des contraintes
 *         uniques »
 *   L68   D-6 : « les effets valides sont dedupliques par cle d'operation et
 *         empreinte d'entree » — la cle ET le digest, les deux axes de A3
 *   L78   identite complete d'une trajectoire, et `period_index`
 *   L80   « les montants sont des chaines d'entiers non negatifs en micro-USD ;
 *         `1000000` vaut 1 USD »
 *   L82   « les empreintes utilisent SHA-256 sur des octets canoniques
 *         documentes. Objets JSON tries recursivement par cle ; ordre des
 *         tableaux conserve ; UTF-8 »
 *   L95   champs minimaux de `PeriodResult`
 *   L97   etats de phase, dont `COMPLETED`
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         BARRIERES et POINTS D'INJECTION NOMMES. [...] Les checks
 *         d'integration utilisent REELLEMENT PostgreSQL »
 *   L199  T05.A4 : « meme identite avec contenu different donne
 *         `IDEMPOTENCY_CONFLICT` » — T12 depend de T05, le conflit de A3 est
 *         le meme concept au niveau du stockage
 *   L559  chaque suite d'integration recoit un `test_run_id` technique unique
 *         et ses bases ; il ne modifie aucune valeur metier
 *   L657  « l'isolation des transactions PostgreSQL est une propriete du
 *         stockage local [...] les tests T12/T16 exercent les races
 *         pertinentes »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion a l'une de DEUX provenances, et
 * aucune autre : un IMPORT de la racine gelee `acceptance/reference/**`, ou un
 * commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p' docs/cahier.md`.
 *
 * (a) LES LITTERAUX RELEVES DANS LE CAHIER — il y en a huit :
 *
 *   20                       — L261, « vingt publications concurrentes »
 *   1                        — L261, « un seul resultat logique »
 *   les treize noms de table — L259, enumeration litterale
 *   `1000000`                — L80, « `1000000` vaut 1 USD », compare EN TANT
 *                              QUE CHAINE parce que L80 l'impose
 *   `IDEMPOTENCY_CONFLICT`   — L199, le nom du conflit cle/contenu
 *   `COMPLETED`              — L97, un etat de phase
 *   2                        — L261, « est reprise » : une reprise apres un
 *                              conflit, c'est une deuxieme tentative
 *   0                        — L261, « ne laisse NI resultat NI evenement
 *                              orphelin visible »
 *
 * (b) LES VALEURS SCELLEES DE §F. La premiere version de cette suite affirmait
 *     qu'« aucune fixture de §F ne porte sur T12 ». La carte de specification
 *     dit desormais le contraire, et c'est elle qui fait foi : docs/specs/T12.md
 *     epingle QUATRE fixtures maitresses sur les cas de T12 —
 *
 *       F-FAILURE     (L121, L123)  -> A1, A4, A5
 *       F-MONEY       (L103)        -> A1, A5
 *       F-BUDGET      (L105)        -> A1, A2, A6
 *       F-RESERVATION (L119)        -> A1, A2, A5
 *
 *     Ces fixtures ne decrivent pas la persistance : elles decrivent l'ETAT
 *     METIER que la persistance doit rendre intact, et les CARDINAUX que la
 *     concurrence ne doit pas faire bouger. C'est exactement ce dont A1, A2,
 *     A4, A5 et A6 parlent. La suite les IMPORTE donc et compare contre elles :
 *
 *       F-FAILURE  K=4, `lignes_conservees`=4, `Q_par_periode`=[0,0,0,0],
 *                  `R_par_periode`=[0,0,0,0], `couts`=[100,50,0,0],
 *                  `cout_total`=150, `factures_ajoutees`=0
 *                  -> A1 republie ces quatre periodes, les relit APRES
 *                     arret/reconnexion et retrouve Q, R et couts valeur par
 *                     valeur, puis leur SOMME ENTIERE (L143). A4 exige que la
 *                     panne avant commit n'ajoute AUCUNE facture a ce total et
 *                     ne supprime aucune des periodes deja ecrites.
 *       F-MONEY    `appel_de_reference.cout_attendu`=340,
 *                  `deux_appels_identiques.cout_attendu`=680
 *                  -> A5 publie un resultat facture 340, subit la panne APRES
 *                     commit, reprend deux fois, et exige que le total persiste
 *                     vaille encore 340. 680 est la valeur que le cahier donne
 *                     a DEUX appels identiques : c'est, chiffree par le cahier
 *                     lui-meme, la valeur qu'une duplication produirait.
 *       F-BUDGET   `nombre_de_demandes_concurrentes`=2, `acceptees_au_plus`=1
 *                  -> A6 fait courir DEUX ecritures conflictuelles sur la meme
 *                     cle et exige qu'au plus UNE ligne logique en sorte.
 *       F-RESERVATION `creneau.capacite`=1, `P1.etat_attendu.confirmees`=1,
 *                  `P1.etat_attendu.doublons`=0
 *                  -> A2 et A5 mesurent l'ECART de lignes entre la base
 *                     concurrente (ou reprise) et une base ou la meme
 *                     enveloppe n'a ete publiee qu'une fois, et exigent que cet
 *                     ecart vaille `doublons`, c'est-a-dire zero.
 *
 *     CE QUE CES FIXTURES NE DISENT PAS, la suite ne l'affirme pas. L'unite des
 *     couts de F-FAILURE est `null` (SC-001, DIV-1) : la suite compare des
 *     ENTIERS et des CHAINES D'ENTIERS au sens de L80, jamais une unite. Les
 *     montants de F-BUDGET (1000, 600, 660) et la grille tarifaire de F-MONEY
 *     sont le contrat de T16 (L297), pas celui de T12 : la suite n'en tire
 *     aucune regle de calcul, seulement des CARDINAUX de concurrence et une
 *     valeur a transporter sans la deformer.
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * les cles d'idempotence, les identifiants de trajectoire, les noms de bases
 * derives du `test_run_id` (L559) et les empreintes qu'elle CALCULE elle-meme
 * selon L82 : ce sont des ENTREES de la suite, jamais des valeurs attendues.
 *
 * LA LIMITE DE REPRISE N'EST PAS UN LITTERAL. L261 dit « selon une limite
 * FIXEE » sans en donner la valeur. La suite ne l'invente donc pas : elle la
 * LIT dans le contrat publie par l'implementation et verifie que c'en est une
 * — un entier fini superieur ou egal a 2 — puis que le comportement observe la
 * respecte exactement. Un test qui coderait un nombre en dur affirmerait une
 * regle que le cahier n'enonce pas.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * LE TEMOIN INDEPENDANT : `psql`, hors du processus de la suite.
 *
 * L263 exige « des tests sur PostgreSQL REEL et des preuves SQL ». Chaque fait
 * affirme par un export de l'implementation est donc RECOUPE par une requete
 * `psql` lancee dans un autre processus, qui ne partage ni le pool de
 * connexions, ni le cache, ni la memoire de l'implementation. C'est ce recoupe-
 * ment qui interdit l'implementation a etat en memoire : elle satisferait
 * « relire ce qu'on vient d'ecrire » sans qu'aucun octet n'atteigne la base.
 *
 * DEUX SONDES SQL, TOUTES DEUX AGNOSTIQUES AUX NOMS DE COLONNES :
 *
 *   profilDeLaCle(db, cle)  — pour CHAQUE table de base du schema central, le
 *       nombre de lignes dont la representation textuelle contient la cle.
 *       Un profil est une empreinte de ce que la base porte REELLEMENT ; deux
 *       profils egaux disent « la meme chose est ecrite », et la suite ne
 *       nomme jamais la table qui porte le resultat. C'est ainsi que A2, A4 et
 *       A5 comparent des etats sans imposer un schema que le cahier ne fixe
 *       pas.
 *   emplacementsDeLaCle(db, valeur) — les triplets (schema, table, colonne)
 *       dont la VALEUR est exactement celle qu'on cherche. A3 s'en sert deux
 *       fois : une fois sur la cle, une fois sur l'empreinte. La table qui
 *       porte LES DEUX est la ligne de resultat ; A3 demande alors a
 *       `pg_index` si la colonne de la cle y est l'unique colonne de tete d'un
 *       index UNIQUE. C'est la « preuve SQL de la contrainte unique » de L263,
 *       obtenue sans deviner un nom — et elle exige l'unicite PAR CLE, qu'un
 *       index composite `(cle, autre_chose)` ne donne pas.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CONTRAT — CE QUE T12 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Le paquet interroge est celui que le registre declare : `packages/storage`,
 * et rien d'autre. Il est charge par le nom de son manifeste, sinon par
 * `src/index.ts`. Le chargement ne LEVE jamais : un import casse produirait
 * « Test suite failed to run », que verification/runner/red.mjs classe
 * SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc lui-meme
 * le chargement, et echoue par une assertion qui NOMME ce qui manque.
 *
 * SIX ROLES, nommes par leur FONCTION et resolus par une courte liste d'alias.
 * Les alias sont une tolerance de NOMMAGE, jamais de COMPORTEMENT.
 *
 *   applyMigrations({ dsn })            -> applique le schema central   (L257)
 *   openStore({ dsn })                  -> ouvre un repository          (L257)
 *   closeStore(handle)                  -> ferme la connexion           (L261 A1)
 *   publishPeriodResult(h, env, opts?)  -> publication transactionnelle (L257)
 *   readPeriodResult(h, { idempotency_key }) -> relecture               (L261 A1)
 *   publishRetryLimit                   -> la limite fixee              (L261 A6)
 *
 * SEPT CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC FIXEES
 * ICI (elles sont reprises telles quelles dans verification/mutants/T12.json) :
 *
 *   1. ENVELOPPE. `publishPeriodResult` recoit un objet PLAT et STRICT
 *      (L80 : proprietes inconnues rejetees) :
 *        { idempotency_key, input_digest, identity, result, events }
 *      `identity` porte les six identifiants de L78 plus `period_index` ;
 *      `result` porte les champs de `PeriodResult` (L95) ; `events` est la
 *      liste des evenements de domaine a publier DANS LA MEME TRANSACTION
 *      (L257 : « outbox et publication transactionnelle »).
 *
 *   2. RECU. La publication acceptee rend un objet portant au moins
 *      `attempts` — le nombre de tentatives reellement consommees, entier
 *      superieur ou egal a 1. Sans ce compteur, « reprise selon une limite
 *      fixee » (L261) ne serait pas OBSERVABLE, et A6 se reduirait a
 *      « ca n'a pas plante ».
 *
 *   3. POINTS D'INJECTION NOMMES (L141). Le troisieme argument est un objet
 *      plat optionnel `{ fault?, barrier? }`. `fault` prend exactement l'une
 *      des quatre valeurs suivantes, et rien d'autre :
 *        'BEFORE_COMMIT'          la panne survient dans la transaction, avant
 *                                 le COMMIT   (A4)
 *        'AFTER_COMMIT'           le COMMIT a lieu, la panne survient juste
 *                                 apres, avant que le recu ne soit rendu (A5)
 *        'CONFLICT_ONCE'          la premiere tentative subit un conflit de
 *                                 transaction ; les suivantes non        (A6)
 *        'CONFLICT_EVERY_ATTEMPT' toute tentative subit un conflit       (A6)
 *      Un point d'injection est un LIVRABLE, pas une commodite de test : L141
 *      l'exige explicitement pour les tests d'ordonnancement, et sans lui une
 *      panne « avant commit » ne serait pas reproductible.
 *
 *   4. BARRIERE (L141). `barrier` est une fonction sans argument rendant une
 *      promesse ; l'implementation l'attend une fois par tentative, apres
 *      l'ouverture de la transaction et AVANT l'ecriture decisive. Elle sert a
 *      faire arriver vingt publications au meme point avant de les liberer
 *      ensemble (A2, A6). La barriere de cette suite se libere aussi sur
 *      minuterie : une implementation qui l'ignorerait produirait un test
 *      moins concurrent, jamais un test bloque.
 *
 *   5. REFUS. Un refus peut etre LEVE ou RENDU. Dans les deux cas il porte un
 *      CODE qui nomme sa cause : `IDEMPOTENCY_CONFLICT` (L199) pour « meme
 *      cle / autre digest », un code contenant CONFLICT/RETRY/EXHAUST pour la
 *      limite de reprise atteinte. Un `TypeError`, un `ECONNREFUSED` ou un
 *      « is not a function » n'est PAS un refus : c'est un plantage, et la
 *      suite le distingue explicitement.
 *
 *   6. RELECTURE. `readPeriodResult` rend l'enregistrement publie — au moins
 *      `idempotency_key`, `input_digest`, `identity` et `result` — ou une
 *      valeur vide (`null`/`undefined`) si la cle est inconnue. Rendre une
 *      valeur vide pour une cle publiee est un echec, pas une tolerance.
 *
 *   7. LIMITE DE REPRISE. `publishRetryLimit` est soit un nombre, soit une
 *      fonction sans argument qui en rend un. Le refus « limite atteinte »
 *      porte `attempts` egal a cette limite — c'est ce qui distingue une borne
 *      d'une boucle infinie et d'une absence de reprise.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne prouve pas qu'une requete FOURNISSEUR distante est unique : L263
 *    dit le contraire en toutes lettres (« elles ne rendent pas une requete
 *    fournisseur distante exactement unique »). C'est T17.
 *  • Elle ne prouve pas la coherence d'un checkpoint entre base, fichiers et
 *    files : c'est la barriere de T15 (L285), pas la transaction de T12.
 *  • Elle ne prouve pas les invariants comptables (`spent + reserved +
 *    available = limit`) : c'est T16 (L297). Elle se contente d'observer que
 *    les montants TRAVERSENT le stockage sans changer de type, ce que L80
 *    impose.
 *  • Elle n'impose aucun nom de colonne et aucune table porteuse du resultat :
 *    L259 fixe treize noms de TABLES et rien d'autre. Toute autre affirmation
 *    de schema serait une exigence inventee.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 300_000;

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

/** Le seul `source_path` que verification/tasks.json declare pour T12. */
const PACKAGES = ['storage'] as const;

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 12) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
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
 * Octets canoniques de L82 : objets tries RECURSIVEMENT par cle, ordre des
 * tableaux conserve, UTF-8. La suite s'en sert pour CALCULER les empreintes
 * qu'elle fournit en entree, et pour COMPARER deux etats sans que l'ordre des
 * cles rendu par le stockage ne decide du verdict.
 */
function canonique(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonique);
  if (v !== null && typeof v === 'object') {
    const o = v as Json;
    const out: Json = {};
    for (const k of Object.keys(o).sort()) out[k] = canonique(o[k]);
    return out;
  }
  return v;
}

/** SHA-256 hexadecimal sur les octets canoniques — L82. */
function empreinte(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonique(v)), 'utf8').digest('hex');
}

/* ═══════════════ les litteraux du cahier, et rien d'autre ══════════════ */

/** L261 : « vingt publications concurrentes d'un meme resultat ». */
const PUBLICATIONS_CONCURRENTES = 20; // cahier:L261

/** L261 : « ... donnent un SEUL resultat logique ». */
const RESULTAT_LOGIQUE_UNIQUE = 1; // cahier:L261

/** L261 : « ne laisse NI resultat NI evenement orphelin visible ». */
const AUCUNE_TRACE = 0; // cahier:L261

/** L261 : « est REPRISE » — un conflit, puis une deuxieme tentative. */
const TENTATIVES_APRES_UN_CONFLIT = 2; // cahier:L261

/** L259 : enumeration litterale des tables minimales du schema central. */
const TABLES_MINIMALES = [
  'campaigns',
  'trajectories',
  'periods',
  'operations',
  'domain_events',
  'deployments',
  'incidents',
  'artifact_refs',
  'checkpoints',
  'model_calls',
  'ledger_entries',
  'budget_reservations',
  'outbox',
] as const; // cahier:L259

/** L259 : les deux tables que A4 interroge NOMMEMENT — resultat et evenement. */
const TABLE_EVENEMENTS = 'domain_events'; // cahier:L259
const TABLE_OUTBOX = 'outbox'; // cahier:L259

/** L80 : « les montants sont des chaines d'entiers ... `1000000` vaut 1 USD ». */
const UN_USD_EN_MICRO = '1000000'; // cahier:L80

/** L97 : un etat de phase, employe comme statut du `PeriodResult` publie. */
const PHASE_TERMINALE = 'COMPLETED'; // cahier:L97

/**
 * L199 (T05.A4) : « meme identite avec contenu different donne
 * `IDEMPOTENCY_CONFLICT` ». T12 depend de T05 ; A3 est le meme concept au
 * niveau du stockage. Le nom canonique est exige comme JETON RECONNAISSABLE :
 * la suite accepte les variantes qui le contiennent ou qui nomment la meme
 * cause, et refuse tout ce qui ne nomme pas une cause.
 */
const CONFLIT_CANONIQUE = 'IDEMPOTENCY_CONFLICT'; // cahier:L199
const MOTIF_CONFLIT_DE_CLE = /CONFLICT|CONFLIT|MISMATCH|DIVERGENCE|DUPLICATE|DOUBLON/i;
const MOTIF_LIMITE_ATTEINTE = /CONFLICT|CONFLIT|RETRY|REPRISE|EXHAUST|EPUIS|LIMIT|BORNE|SERIAL/i;

/** Ce qui n'est PAS un refus : un plantage. La distinction est decisive (A3, A6). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/* ═════ §F : les fixtures maitresses que docs/specs/T12.md epingle sur T12 ═══
 *
 * Racine GELEE apres T01 (L139, docs/FROZEN_ROOTS.json). La lecture ne LEVE
 * jamais au chargement du module : une exception ici produirait
 * « Test suite failed to run », que verification/runner/red.mjs classe
 * SUITE_FAILED_TO_RUN et refuse comme preuve. Les defauts sont donc collectes
 * et ASSERTES par `assertReferences()` dans chaque cas qui les consomme.
 */

const RACINE_REFERENCE = path.join(REPO, 'acceptance', 'reference');

const DEFAUTS_REFERENCE: string[] = [];

function lireReference(nom: string): Json {
  try {
    const doc = JSON.parse(
      fs.readFileSync(path.join(RACINE_REFERENCE, `${nom}.json`), 'utf8'),
    ) as Json;
    if (doc.fixture !== nom) {
      DEFAUTS_REFERENCE.push(
        `FIXTURE-MAL-NOMMEE acceptance/reference/${nom}.json porte fixture=${rendu(doc.fixture)}`,
      );
    }
    return doc;
  } catch (e) {
    DEFAUTS_REFERENCE.push(
      `FIXTURE-ILLISIBLE acceptance/reference/${nom}.json : ${(e as Error).message}`,
    );
    return {};
  }
}

/** `valeurs.<chemin>.valeur` — le chemin est celui du transcripteur de T00. */
function scelle(doc: Json, nom: string, chemin: string): unknown {
  let cur: unknown = doc;
  for (const seg of `valeurs.${chemin}.valeur`.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      DEFAUTS_REFERENCE.push(`REFERENCE-CHEMIN-ABSENT ${nom} valeurs.${chemin}.valeur`);
      return undefined;
    }
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) {
    DEFAUTS_REFERENCE.push(`REFERENCE-VALEUR-ABSENTE ${nom} valeurs.${chemin}.valeur`);
  }
  return cur;
}

const F_FAILURE = lireReference('F-FAILURE');
const F_MONEY = lireReference('F-MONEY');
const F_BUDGET = lireReference('F-BUDGET');
const F_RESERVATION = lireReference('F-RESERVATION');

const entierScelle = (doc: Json, nom: string, chemin: string): number => {
  const v = scelle(doc, nom, chemin);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    DEFAUTS_REFERENCE.push(`REFERENCE-NON-ENTIERE ${nom} ${chemin} = ${rendu(v)}`);
    return Number.NaN;
  }
  return v;
};

const tableauScelle = (doc: Json, nom: string, chemin: string): number[] => {
  const v = scelle(doc, nom, chemin);
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number' || !Number.isInteger(x))) {
    DEFAUTS_REFERENCE.push(`REFERENCE-NON-TABLEAU-D-ENTIERS ${nom} ${chemin} = ${rendu(v)}`);
    return [];
  }
  return v as number[];
};

/** F-FAILURE (L121, L123) — l'etat metier de quatre periodes sans deploiement. */
const F_K = entierScelle(F_FAILURE, 'F-FAILURE', 'K');
const F_LIGNES_CONSERVEES = entierScelle(F_FAILURE, 'F-FAILURE', 'lignes_conservees');
const F_Q = tableauScelle(F_FAILURE, 'F-FAILURE', 'Q_par_periode');
const F_R = tableauScelle(F_FAILURE, 'F-FAILURE', 'R_par_periode');
const F_COUTS = tableauScelle(F_FAILURE, 'F-FAILURE', 'couts');
const F_COUT_TOTAL = entierScelle(F_FAILURE, 'F-FAILURE', 'cout_total');
const F_FACTURES_AJOUTEES = entierScelle(
  F_FAILURE,
  'F-FAILURE',
  'arret_de_calcul_apres_P2.factures_ajoutees',
);

/** F-MONEY (L103) — un appel vaut 340 ; DEUX appels identiques valent 680. */
const F_UN_APPEL = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.cout_attendu');
const F_DEUX_APPELS = entierScelle(F_MONEY, 'F-MONEY', 'deux_appels_identiques.cout_attendu');

/** F-BUDGET (L105) — deux demandes concurrentes, au plus une acceptee. */
const F_DEMANDES_CONCURRENTES = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_1_concurrence.nombre_de_demandes_concurrentes',
);
const F_ACCEPTEES_AU_PLUS = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_1_concurrence.acceptees_au_plus',
);

/** F-RESERVATION (L119) — capacite 1, une confirmee, ZERO doublon. */
const F_CAPACITE = entierScelle(F_RESERVATION, 'F-RESERVATION', 'creneau.capacite');
const F_CONFIRMEES = entierScelle(F_RESERVATION, 'F-RESERVATION', 'P1.etat_attendu.confirmees');
const F_DOUBLONS = entierScelle(F_RESERVATION, 'F-RESERVATION', 'P1.etat_attendu.doublons');

/**
 * Chaque cas qui consomme §F l'asserte d'abord. Une fixture illisible doit
 * NOMMER son defaut, pas produire un `undefined` qui se compare a lui-meme.
 */
function assertReferences(): void {
  expect(
    DEFAUTS_REFERENCE.length === 0
      ? 'fixtures-de-reference-lisibles'
      : `FIXTURES-DE-REFERENCE-INEXPLOITABLES : ${DEFAUTS_REFERENCE.join(' | ')}`,
  ).toBe('fixtures-de-reference-lisibles'); // cahier:L139
  expect(
    F_COUTS.length === F_K && F_Q.length === F_K && F_R.length === F_K
      ? 'F-FAILURE-coherente'
      : `F-FAILURE-INCOHERENTE K=${String(F_K)} couts=${rendu(F_COUTS)} Q=${rendu(F_Q)} R=${rendu(F_R)}`,
  ).toBe('F-FAILURE-coherente');
}

/**
 * Somme ENTIERE d'une liste de montants au sens de L80 : « chaines d'entiers
 * non negatifs ». Un montant qui n'est pas une telle chaine ne devient pas
 * zero — il rend `null`, et l'appelant echoue en le NOMMANT (L143 : « les
 * nombres exacts se verifient en entier »).
 */
function sommeEntiere(montants: unknown[]): number | null {
  let total = 0;
  for (const m of montants) {
    if (typeof m !== 'string' || !/^[0-9]+$/.test(m)) return null;
    total += Number.parseInt(m, 10);
  }
  return total;
}

/* ══════════════════════════ PostgreSQL reel (L141, L263) ═══════════════ */

/**
 * `test_run_id` technique de L559 : toutes les bases de cette execution en
 * derivent, de sorte que deux executions simultanees n'interferent pas. Il
 * n'entre dans AUCUNE assertion — c'est un namespace, pas une valeur metier.
 */
const RUN = `t12_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();

const PG_USER = process.env.PGUSER ?? os.userInfo().username;

interface Psql {
  ok: boolean;
  out: string;
}

function psql(db: string, sql: string): Psql {
  try {
    const out = execFileSync(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql],
      { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}

/** Base de maintenance : celle qui existe forcement, pour CREATE/DROP DATABASE. */
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();

const BASES_CREEES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(
    r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`,
  ).toBe('base-creee'); // cahier:L263
  BASES_CREEES.push(nom);
  return nom;
}

interface Table {
  schema: string;
  nom: string;
}

/** Tables de base du schema central, hors catalogues systeme. */
function tablesDeBase(db: string): Table[] {
  const r = psql(
    db,
    `SELECT table_schema || '|' || table_name FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  if (!r.ok || r.out.length === 0) return [];
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [schema, nom] = l.split('|');
      return { schema, nom };
    });
}

/** Un litteral SQL pour une valeur que la suite a elle-meme fabriquee. */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * PROFIL D'UNE CLE : pour chaque table du schema central, le nombre de lignes
 * dont la representation textuelle contient la cle. Agnostique aux colonnes,
 * agnostique a la table porteuse — donc n'impose aucun schema au-dela des
 * treize noms que L259 fixe. Deux profils egaux disent « la base porte la meme
 * chose » ; un profil entierement nul dit « rien n'est visible ».
 */
function profilDeLaCle(db: string, cle: string): Record<string, number> {
  const tables = tablesDeBase(db);
  if (tables.length === 0) return {};
  const parts = tables.map(
    (t) =>
      `SELECT ${lit(`${t.schema}.${t.nom}`)} AS t, count(*) AS n ` +
      `FROM "${t.schema}"."${t.nom}" x WHERE x::text LIKE ${lit(`%${cle}%`)}`,
  );
  const r = psql(db, `${parts.join(' UNION ALL ')} ORDER BY 1`);
  if (!r.ok) return { 'SONDE-SQL-EN-ECHEC': -1 };
  const out: Record<string, number> = {};
  for (const ligne of r.out.split('\n')) {
    const i = ligne.lastIndexOf('|');
    if (i < 0) continue;
    out[ligne.slice(0, i)] = Number(ligne.slice(i + 1));
  }
  return out;
}

const totalDuProfil = (p: Record<string, number>): number =>
  Object.values(p).reduce((a, b) => a + b, 0);

/** Lignes d'une table NOMMEE par L259 portant la cle. -1 si la table manque. */
function lignesPortantLaCle(db: string, table: string, cle: string): number {
  const t = tablesDeBase(db).find((x) => x.nom === table);
  if (t === undefined) return -1;
  const r = psql(
    db,
    `SELECT count(*) FROM "${t.schema}"."${t.nom}" x WHERE x::text LIKE ${lit(`%${cle}%`)}`,
  );
  return r.ok ? Number(r.out) : -1;
}

interface Emplacement {
  schema: string;
  table: string;
  colonne: string;
}

/**
 * Les colonnes dont la VALEUR est exactement la cle. C'est ainsi que A3 trouve
 * la colonne d'idempotence sans en deviner le nom, avant de demander a
 * `pg_index` si elle est couverte par un index UNIQUE (preuve SQL, L263).
 */
function emplacementsDeLaCle(db: string, cle: string): Emplacement[] {
  const r0 = psql(
    db,
    `SELECT table_schema || '|' || table_name || '|' || column_name
       FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND data_type IN ('text', 'character varying', 'character', 'name', 'uuid')
      ORDER BY 1`,
  );
  if (!r0.ok || r0.out.length === 0) return [];
  const candidats = r0.out
    .split('\n')
    .map((l) => l.trim().split('|'))
    .filter((p) => p.length === 3)
    .map((p) => ({ schema: p[0], table: p[1], colonne: p[2] }));
  if (candidats.length === 0) return [];
  const parts = candidats.map(
    (c) =>
      `SELECT ${lit(`${c.schema}|${c.table}|${c.colonne}`)} AS e, count(*) AS n ` +
      `FROM "${c.schema}"."${c.table}" WHERE "${c.colonne}"::text = ${lit(cle)}`,
  );
  const r = psql(db, `SELECT e, n FROM (${parts.join(' UNION ALL ')}) s WHERE n > 0 ORDER BY 1`);
  if (!r.ok) return [];
  const out: Emplacement[] = [];
  for (const ligne of r.out.split('\n')) {
    const i = ligne.lastIndexOf('|');
    if (i < 0) continue;
    const p = ligne.slice(0, i).split('|');
    if (p.length === 3) out.push({ schema: p[0], table: p[1], colonne: p[2] });
  }
  return out;
}

/**
 * PREUVE SQL de la contrainte unique (L263) : PostgreSQL lui-meme est
 * interroge sur l'existence d'un index UNIQUE dont la cle d'idempotence est
 * la SEULE colonne de tete. On demande au catalogue, pas a l'implementation.
 *
 * POURQUOI MONOCOLONNE, ET POURQUOI CE N'EST PAS UNE EXIGENCE INVENTEE. Un
 * index unique COMPOSITE `(cle, autre_chose)` autorise deux lignes portant la
 * meme cle — il ne prouve donc rien de ce que L261 affirme (« meme cle / autre
 * digest donne CONFLIT »). La mesure l'a montre : sur la sonde jetable,
 * supprimer l'unicite de la table du resultat laissait le cas VERT tant que la
 * requete acceptait l'index `(idempotency_key, seq)` de la table des
 * evenements. C'est l'unicite PAR CLE, sur la table qui porte le resultat, qui
 * est la propriete du cahier.
 */
function indexUniquesSur(db: string, e: Emplacement): string[] {
  const r = psql(
    db,
    `SELECT ic.relname
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN pg_namespace ns ON ns.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
      WHERE i.indisunique
        AND i.indnkeyatts = 1
        AND ns.nspname = ${lit(e.schema)}
        AND c.relname = ${lit(e.table)}
        AND a.attname = ${lit(e.colonne)}
      ORDER BY 1`,
  );
  if (!r.ok || r.out.length === 0) return [];
  return r.out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * LES TABLES QUI PORTENT LA LIGNE DE RESULTAT — celles qui portent A LA FOIS la
 * cle d'idempotence et son empreinte. C'est la meme identification que la
 * preuve SQL d'A3 (L263), extraite ici pour que A2, A5 et A6 puissent COMPTER
 * les lignes logiques sans imposer un nom de table que L259 ne fixe pas.
 * Rend `schema.table -> nombre de lignes portant la cle`.
 */
function lignesLogiques(db: string, cle: string, digest: string): Record<string, number> {
  const parTable = new Set(
    emplacementsDeLaCle(db, digest).map((e) => `${e.schema}.${e.table}`),
  );
  const out: Record<string, number> = {};
  for (const e of emplacementsDeLaCle(db, cle)) {
    const q = `${e.schema}.${e.table}`;
    if (!parTable.has(q)) continue;
    if (q in out) continue;
    out[q] = lignesPortantLaCle(db, e.table, cle);
  }
  return out;
}

/* ═══════════════ chargement du paquet declare par le registre ══════════ */

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
  applyMigrations: [
    'applyMigrations',
    'applyCentralMigrations',
    'runMigrations',
    'migrate',
    'migrateCentral',
    'migrateUp',
    'ensureSchema',
    'createSchema',
    'initSchema',
    'setupSchema',
    'up',
  ],
  openStore: [
    'openStore',
    'openCentralStore',
    'createStore',
    'openRepository',
    'createRepository',
    'connect',
    'createPool',
    'openDatabase',
    'open',
  ],
  closeStore: [
    'closeStore',
    'closeRepository',
    'disconnect',
    'shutdown',
    'dispose',
    'close',
    'end',
  ],
  publishPeriodResult: [
    'publishPeriodResult',
    'publishResult',
    'publishTransactional',
    'publishPeriod',
    'savePeriodResult',
    'writePeriodResult',
    'recordPeriodResult',
    'commitPeriodResult',
    'appendPeriodResult',
    'publish',
  ],
  readPeriodResult: [
    'readPeriodResult',
    'getPeriodResult',
    'loadPeriodResult',
    'findPeriodResult',
    'fetchPeriodResult',
    'readResult',
    'getResult',
    'loadResult',
    'findResult',
    'read',
  ],
};

/** Le role `publishRetryLimit` n'est pas forcement une FONCTION (L261, A6). */
const ALIAS_LIMITE = [
  'publishRetryLimit',
  'PUBLISH_RETRY_LIMIT',
  'maxPublishAttempts',
  'MAX_PUBLISH_ATTEMPTS',
  'conflictRetryLimit',
  'serializationRetryLimit',
  'retryLimit',
  'maxAttempts',
  'maxRetries',
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

/** La limite fixee de L261 : un nombre, ou une fonction qui en rend un. */
function limiteDeReprise(): number | null {
  const lower = new Map<string, unknown>();
  for (const [k, v] of LOADED.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  for (const a of ALIAS_LIMITE) {
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

const CHAMPS_CODE = /^(code|error_code|errorcode|reason|motif|refusal|refus|rejection|rejet|error|erreur|status|statut|outcome|verdict|name)$/i;

function chaineDeCode(v: unknown, profondeur = 0): string | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || profondeur > 2) return null;
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

function qualifier(brut: unknown, leve: boolean): Issue {
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
  if (brut === null || brut === undefined) {
    return { refuse: true, via: 'nullish', texte: `RENDU-VIDE ${texte}`, code: null, valeur: brut, leve: false };
  }
  if (typeof brut === 'object' && !Array.isArray(brut)) {
    const o = brut as Json;
    for (const drapeau of ['ok', 'valid', 'valide', 'success', 'accepted', 'published', 'committed']) {
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
    for (const cle of ['errors', 'issues', 'problems', 'erreurs', 'violations', 'conflicts']) {
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
    if (code !== null && MOTIF_CONFLIT_DE_CLE.test(code)) {
      return { refuse: true, via: `code:${code}`, texte, code, valeur: brut, leve: false };
    }
    if (code !== null && MOTIF_LIMITE_ATTEINTE.test(code) && !/PASS|OK|SUCCESS|ACCEPT|PUBLISH|COMMIT/i.test(code)) {
      return { refuse: true, via: `code:${code}`, texte, code, valeur: brut, leve: false };
    }
  }
  return { refuse: false, via: 'valeur', texte, code: null, valeur: brut, leve: false };
}

async function appeler(role: string, args: unknown[]): Promise<Issue> {
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
    return qualifier(await Promise.resolve(f(...args)), false);
  } catch (e) {
    return qualifier(e, true);
  }
}

function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(
    issue.refuse ? `REFUS-INATTENDU ${quoi} [${issue.via}] : ${court(issue.texte)}` : 'accepte',
  ).toBe('accepte');
  return issue.valeur;
}

function exigerRefuse(issue: Issue, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(issue.texte)}`).toBe('refuse');
}

/**
 * Un refus NOMME. La distinction avec un plantage est decisive : un stub qui
 * leve `TypeError` satisferait « ca a echoue » sans rien prouver, et c'est
 * exactement le faux PASS contre lequel le mode de preuve `refusal` met en
 * garde (verification/cases.lock.json).
 */
function exigerRefusNomme(issue: Issue, motif: RegExp, quoi: string): void {
  exigerRefuse(issue, quoi);
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
          `(canonique : ${CONFLIT_CANONIQUE}), observe ${court(issue.code ?? issue.texte, 400)}`,
  ).toBe('refus-nomme');
}

/** Lecture tolerante d'un champ, au sommet ou sous un enveloppement usuel. */
function champ(v: unknown, noms: readonly string[]): unknown {
  if (v === null || typeof v !== 'object') return undefined;
  const o = v as Json;
  for (const n of noms) if (o[n] !== undefined) return o[n];
  for (const conteneur of ['record', 'row', 'value', 'data', 'result', 'receipt', 'recu']) {
    const sous = o[conteneur];
    if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) {
      const s = sous as Json;
      for (const n of noms) if (s[n] !== undefined) return s[n];
    }
  }
  return undefined;
}

const NOMS_TENTATIVES = ['attempts', 'attempt_count', 'attemptCount', 'tentatives', 'tries'] as const;

/** Le compteur de tentatives, au besoin releve dans le texte du refus. */
function tentatives(v: unknown, texte = ''): number | null {
  const direct = champ(v, NOMS_TENTATIVES);
  if (typeof direct === 'number') return direct;
  const m = /attempts?[^0-9]{0,12}(\d+)|tentatives?[^0-9]{0,12}(\d+)/i.exec(texte);
  if (m !== null) return Number(m[1] ?? m[2]);
  return null;
}

/* ═══════════════ ouverture, publication, relecture, arret ══════════════ */

const HANDLES: unknown[] = [];

async function ouvrir(db: string): Promise<unknown> {
  const h = exigerAccepte(
    await appeler('openStore', [{ dsn: dsnFor(db) }]),
    `ouverture du store sur ${db}`,
  );
  HANDLES.push(h);
  return h;
}

/** Rend la VOIE d'arret reellement employee — `aucune` est un echec, pas un repli. */
async function fermer(h: unknown): Promise<string> {
  const i = HANDLES.indexOf(h);
  if (i >= 0) HANDLES.splice(i, 1);
  if (h !== null && typeof h === 'object') {
    for (const m of ['close', 'end', 'disconnect', 'dispose', 'shutdown', 'stop']) {
      const f = (h as Json)[m];
      if (typeof f === 'function') {
        try {
          await Promise.resolve((f as Fonction).call(h));
          return `handle.${m}()`;
        } catch (e) {
          return `handle.${m}() A LEVE ${court(rendu(e), 200)}`;
        }
      }
    }
  }
  const issue = await appeler('closeStore', [h]);
  if (issue.via === 'contrat') return 'aucune';
  return issue.leve ? `closeStore A LEVE ${court(issue.texte, 200)}` : 'closeStore()';
}

async function migrer(db: string): Promise<void> {
  exigerAccepte(
    await appeler('applyMigrations', [{ dsn: dsnFor(db) }]),
    `migrations du schema central sur ${db}`,
  );
}

async function publier(h: unknown, env: Json, options?: Json): Promise<Issue> {
  return appeler(
    'publishPeriodResult',
    options === undefined ? [h, env] : [h, env, options],
  );
}

async function lire(h: unknown, cle: string): Promise<Issue> {
  return appeler('readPeriodResult', [h, { idempotency_key: cle }]);
}

/**
 * BARRIERE de L141 : les N appelants se donnent rendez-vous puis sont liberes
 * ensemble. La minuterie garantit qu'une implementation qui IGNORE le point
 * d'injection produit un test moins concurrent, jamais un test bloque — un
 * timeout ne prouverait rien (L141 : « un timeout borne un blocage ; il ne
 * demontre pas qu'un evenement aurait du arriver »).
 */
function rendezVous(n: number, delaiMs = 5_000): () => Promise<void> {
  let arrives = 0;
  let liberer: () => void = () => {};
  const attente = new Promise<void>((res) => {
    liberer = res;
  });
  const minuterie: { unref?: () => void } = setTimeout(() => liberer(), delaiMs);
  if (typeof minuterie.unref === 'function') minuterie.unref();
  return async (): Promise<void> => {
    arrives += 1;
    if (arrives >= n) liberer();
    await attente;
  };
}

/* ═══════════════ enveloppes : identite L78, resultat L95, L82 ══════════ */

/**
 * L'identite complete de L78, plus `period_index`. `trajectoire` distingue DEUX
 * trajectoires independantes dans une meme base : L78 dit que les periodes
 * d'une meme trajectoire se distinguent par `period_index`, donc deux periodes
 * de MEME identite et MEME index sont la meme periode. Les quatre periodes de
 * F-FAILURE decrivent UN candidat ; elles recoivent leur propre trajectoire
 * plutot que de se superposer aux periodes deja publiees par le meme cas.
 */
function identite(periodIndex: number, trajectoire = '1'): Json {
  return {
    campaign_id: `${RUN}-campaign`,
    parent_project_id: `${RUN}-project`,
    scenario_id: `${RUN}-scenario`,
    configuration_id: `${RUN}-configuration`,
    repetition_id: `${RUN}-repetition-${trajectoire}`,
    budget_id: `${RUN}-budget`,
    period_index: periodIndex,
  }; // cahier:L78
}

function resultat(periodIndex: number, depense: string): Json {
  return {
    spend_micro_usd: depense, // cahier:L80 — chaine d'entiers en micro-USD
    requirements_evaluated: 2,
    intents_offered: 4,
    intents_succeeded: 4,
    incidents: 0,
    Q: 1,
    R: 1,
    G: 0.5,
    status: PHASE_TERMINALE, // cahier:L97
    proof_digests: [empreinte({ periode: periodIndex, flux: 'proof' })], // cahier:L82
  }; // cahier:L95
}

interface Enveloppe extends Json {
  idempotency_key: string;
  input_digest: string;
  identity: Json;
  result: Json;
  events: Json[];
}

function enveloppe(
  cle: string,
  periodIndex: number,
  depense = UN_USD_EN_MICRO,
  trajectoire = '1',
): Enveloppe {
  const identity = identite(periodIndex, trajectoire);
  const result = resultat(periodIndex, depense);
  const events: Json[] = [
    {
      event_type: 'PERIOD_RESULT_PUBLISHED',
      occurred_at: '2030-01-01T00:00:00Z',
      payload: { period_index: periodIndex, idempotency_key: cle },
    },
  ];
  const corps = { identity, result, events };
  return { idempotency_key: cle, input_digest: empreinte(corps), ...corps }; // cahier:L82
}

/**
 * L'ENVELOPPE D'UNE PERIODE DE F-FAILURE (index 0..K-1).
 *
 * Le `PeriodResult` (L95) porte les valeurs SCELLEES de la fixture : Q et R de
 * la periode, et son cout transporte comme chaine d'entiers au sens de L80.
 * F-FAILURE laisse explicitement NON FIXES le nombre d'exigences actives et le
 * nombre d'intentions offertes (`non_fixe_par_le_cahier`) : seule leur PRESENCE
 * est requise pour que Q vaille 0 et non null. Ces deux cardinaux sont donc des
 * ENTREES de la suite, jamais des valeurs attendues — a la difference de Q, R
 * et du cout, qui sont compares contre la fixture apres relecture.
 */
function enveloppeDeFailure(prefixe: string, i: number): Enveloppe {
  const cle = `${prefixe}-p${String(i + 1)}`;
  const identity = identite(i + 1, `failure-${prefixe}`);
  const result: Json = {
    spend_micro_usd: String(F_COUTS[i]), // reference: F-FAILURE couts — L80 impose la chaine
    requirements_evaluated: 2, // presence requise (L121) ; cardinal non fixe par §F
    intents_offered: 4, // idem — « si les exigences et usages y sont presents »
    intents_succeeded: 0, // L121 : « un candidat SANS DEPLOIEMENT »
    incidents: 0,
    Q: F_Q[i], // reference: F-FAILURE Q_par_periode
    R: F_R[i], // reference: F-FAILURE R_par_periode
    G: 0,
    status: PHASE_TERMINALE, // cahier:L97
    proof_digests: [empreinte({ periode: i + 1, flux: 'proof' })], // cahier:L82
  };
  const events: Json[] = [
    {
      event_type: 'PERIOD_RESULT_PUBLISHED',
      occurred_at: '2030-01-01T00:00:00Z',
      payload: { period_index: i + 1, idempotency_key: cle },
    },
  ];
  const corps = { identity, result, events };
  return { idempotency_key: cle, input_digest: empreinte(corps), ...corps }; // cahier:L82
}

/** Le montant relu pour une cle, tel que le stockage le rend. */
function depenseRelue(vue: Json): unknown {
  const r = vue.result as Json | undefined;
  return r === undefined ? undefined : r.spend_micro_usd;
}

/** La vue COMPARABLE d'un enregistrement relu : quatre champs, rien de volatil. */
function vueDuRecord(v: unknown): Json {
  return {
    idempotency_key: champ(v, ['idempotency_key', 'idempotencyKey', 'key', 'cle']),
    input_digest: champ(v, ['input_digest', 'inputDigest', 'digest', 'empreinte']),
    identity: champ(v, ['identity', 'identite', 'ids']),
    result: champ(v, ['result', 'resultat', 'period_result', 'periodResult']),
  };
}

function vueDeLEnveloppe(e: Enveloppe): Json {
  return {
    idempotency_key: e.idempotency_key,
    input_digest: e.input_digest,
    identity: e.identity,
    result: e.result,
  };
}

/* ═════════════════════════════════════════════════ menage ═════════════ */

afterAll(async () => {
  for (const h of [...HANDLES]) await fermer(h);
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

/** Une relecture VIDE : la cle est inconnue. Un plantage n'est pas un vide. */
function estVide(issue: Issue): boolean {
  if (issue.leve) return false;
  const v = issue.valeur;
  if (v === null || v === undefined) return true;
  const vue = vueDuRecord(v);
  return vue.result === undefined && vue.idempotency_key === undefined;
}

/* ═══════════════════════════════════════════════════════════════════════ */

describe('T12 — persistance des evenements et resultats dans PostgreSQL', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T12.A1 arret/reconnexion retrouve le meme etat, recoupe par psql',
    async () => {
      assertLoaded();
      assertContrat('applyMigrations', 'openStore', 'publishPeriodResult', 'readPeriodResult');

      const db = creerBase('a1');
      await migrer(db);

      // (1) LES TREIZE TABLES MINIMALES DU SCHEMA CENTRAL.
      const presentes = new Set(tablesDeBase(db).map((t) => t.nom));
      const manquantes = TABLES_MINIMALES.filter((t) => !presentes.has(t));
      expect(
        manquantes.length === 0
          ? 'tables-minimales-presentes'
          : `TABLES-MINIMALES-ABSENTES [${manquantes.join(', ')}] — observees : ` +
              `[${[...presentes].sort().join(', ')}]`,
      ).toBe('tables-minimales-presentes'); // cahier:L259

      // (2) PUBLICATION DE TROIS PERIODES.
      const h1 = await ouvrir(db);
      const envs = [
        enveloppe(`${RUN}-a1-p1`, 1, UN_USD_EN_MICRO),
        enveloppe(`${RUN}-a1-p2`, 2, '2000000'),
        enveloppe(`${RUN}-a1-p3`, 3, '3000000'),
      ];
      for (const e of envs) {
        const recu = exigerAccepte(await publier(h1, e), `publication de ${e.idempotency_key}`);
        const n = tentatives(recu, rendu(recu));
        expect(
          n !== null && Number.isInteger(n) && n >= 1
            ? 'recu-avec-compteur-de-tentatives'
            : `RECU-SANS-COMPTEUR-DE-TENTATIVES ${e.idempotency_key} : ${court(rendu(recu), 300)}`,
        ).toBe('recu-avec-compteur-de-tentatives');
      }

      const avant: Json[] = [];
      for (const e of envs) {
        avant.push(
          vueDuRecord(
            exigerAccepte(
              await lire(h1, e.idempotency_key),
              `relecture avant arret de ${e.idempotency_key}`,
            ),
          ),
        );
      }

      // (3) ARRET — il doit etre OBSERVABLE, pas suppose.
      const voie = await fermer(h1);
      expect(
        voie !== 'aucune' && !voie.includes('A LEVE')
          ? 'arret-observe'
          : `ARRET-DU-STORE-IMPOSSIBLE voie=${voie} — aucun `.concat(
              `handle.close()/end()/dispose() et aucun export parmi [${ROLES.closeStore.join('|')}]`,
            ),
      ).toBe('arret-observe'); // cahier:L261

      // (4) RECONNEXION — le meme etat, champ par champ.
      const h2 = await ouvrir(db);
      const apres: Json[] = [];
      for (const e of envs) {
        apres.push(
          vueDuRecord(
            exigerAccepte(
              await lire(h2, e.idempotency_key),
              `relecture apres reconnexion de ${e.idempotency_key}`,
            ),
          ),
        );
      }
      expect(canonique(apres)).toEqual(canonique(avant)); // cahier:L261
      for (let i = 0; i < envs.length; i += 1) {
        expect(canonique(apres[i])).toEqual(canonique(vueDeLEnveloppe(envs[i]))); // cahier:L261
      }
      const r0 = apres[0].result as Json | undefined;
      expect(r0 === undefined ? 'RESULTAT-ABSENT' : r0.spend_micro_usd).toBe(UN_USD_EN_MICRO); // cahier:L80

      // (5) TEMOIN INDEPENDANT — psql, hors du processus de la suite.
      for (const e of envs) {
        const p = profilDeLaCle(db, e.idempotency_key);
        expect(
          totalDuProfil(p) > AUCUNE_TRACE
            ? 'etat-dans-postgresql'
            : `ETAT-ABSENT-DE-POSTGRESQL ${e.idempotency_key} : profil=${rendu(p)} — un etat ` +
                `servi depuis la memoire du processus ne satisfait pas « tests sur PostgreSQL reel »`,
        ).toBe('etat-dans-postgresql'); // cahier:L263
        expect(
          lignesPortantLaCle(db, TABLE_EVENEMENTS, e.idempotency_key) >= 1
            ? 'evenement-persiste'
            : `AUCUN-EVENEMENT-DANS-${TABLE_EVENEMENTS} pour ${e.idempotency_key} ` +
                `(${String(lignesPortantLaCle(db, TABLE_EVENEMENTS, e.idempotency_key))} ligne(s))`,
        ).toBe('evenement-persiste'); // cahier:L259
        expect(
          lignesPortantLaCle(db, TABLE_OUTBOX, e.idempotency_key) >= 1
            ? 'outbox-persistee'
            : `AUCUNE-ENTREE-DANS-${TABLE_OUTBOX} pour ${e.idempotency_key} ` +
                `(${String(lignesPortantLaCle(db, TABLE_OUTBOX, e.idempotency_key))} ligne(s))`,
        ).toBe('outbox-persistee'); // cahier:L257
      }
      const pDigest = profilDeLaCle(db, envs[0].input_digest);
      expect(
        totalDuProfil(pDigest) > AUCUNE_TRACE
          ? 'empreinte-persistee'
          : `EMPREINTE-ABSENTE-DE-POSTGRESQL ${envs[0].input_digest} : profil=${rendu(pDigest)}`,
      ).toBe('empreinte-persistee'); // cahier:L68

      // (6) « LE MEME ETAT » EST UN ETAT METIER SCELLE, PAS UN ALLER-RETOUR.
      //     docs/specs/T12.md epingle F-FAILURE sur A1 : quatre periodes sans
      //     deploiement, Q et R nuls, couts [100,50,0,0] de total 150. La suite
      //     les publie, ferme, rouvre, et compare les valeurs RELUES a la
      //     fixture gelee — jamais a ce qu'elle vient d'ecrire. Une
      //     implementation qui normaliserait, arrondirait ou re-typerait ces
      //     montants passerait un aller-retour contre lui-meme, pas celui-ci.
      assertReferences();
      const envsF = Array.from({ length: F_K }, (_, i) => enveloppeDeFailure(`${RUN}-a1f`, i));
      for (const e of envsF) {
        exigerAccepte(await publier(h2, e), `publication de ${e.idempotency_key}`);
      }
      const voieF = await fermer(h2);
      expect(
        voieF !== 'aucune' && !voieF.includes('A LEVE')
          ? 'deuxieme-arret-observe'
          : `ARRET-DU-STORE-IMPOSSIBLE voie=${voieF}`,
      ).toBe('deuxieme-arret-observe'); // cahier:L261

      const h3 = await ouvrir(db);
      const relusF = envsF.map(() => ({}) as Json);
      let conservees = 0;
      for (let i = 0; i < envsF.length; i += 1) {
        const issue = await lire(h3, envsF[i].idempotency_key);
        if (!estVide(issue)) conservees += 1;
        relusF[i] = vueDuRecord(
          exigerAccepte(issue, `relecture apres reconnexion de ${envsF[i].idempotency_key}`),
        );
      }
      // « conserve quatre lignes » (L121) : le nombre de periodes RELISIBLES est
      // compte, il n'est pas deduit de la taille du tableau qu'on a ecrit.
      expect(conservees).toBe(F_LIGNES_CONSERVEES); // reference: F-FAILURE lignes_conservees
      expect(relusF.map((v) => (v.result as Json | undefined)?.Q)).toEqual(F_Q); // reference: F-FAILURE
      expect(relusF.map((v) => (v.result as Json | undefined)?.R)).toEqual(F_R); // reference: F-FAILURE
      const depenses = relusF.map(depenseRelue);
      expect(depenses).toEqual(F_COUTS.map(String)); // reference: F-FAILURE couts + cahier:L80
      const total = sommeEntiere(depenses);
      expect(
        total !== null
          ? total
          : `MONTANTS-NON-ENTIERS-APRES-RECONNEXION ${rendu(depenses)} — L80 exige des ` +
              `chaines d'entiers non negatifs ; un montant illisible ne devient pas zero`,
      ).toBe(F_COUT_TOTAL); // reference: F-FAILURE cout_total + cahier:L143

      // Le temoin independant voit AUSSI ces quatre periodes.
      for (const e of envsF) {
        expect(
          totalDuProfil(profilDeLaCle(db, e.idempotency_key)) > AUCUNE_TRACE
            ? 'periode-de-failure-en-base'
            : `PERIODE-DE-FAILURE-ABSENTE-DE-POSTGRESQL ${e.idempotency_key}`,
        ).toBe('periode-de-failure-en-base'); // cahier:L263
      }
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T12.A2 vingt publications concurrentes d un meme resultat donnent un seul resultat logique',
    async () => {
      assertLoaded();
      assertContrat('applyMigrations', 'openStore', 'publishPeriodResult', 'readPeriodResult');

      const cle = `${RUN}-a2`;
      const env = enveloppe(cle, 1);

      // REFERENCE : la MEME enveloppe, publiee UNE fois, sur une base vierge.
      const dbRef = creerBase('a2ref');
      await migrer(dbRef);
      const hRef = await ouvrir(dbRef);
      exigerAccepte(await publier(hRef, env), 'publication unique de reference');
      const profilRef = profilDeLaCle(dbRef, cle);
      expect(
        totalDuProfil(profilRef) > AUCUNE_TRACE
          ? 'reference-ecrite'
          : `PUBLICATION-UNIQUE-SANS-EFFET profil=${rendu(profilRef)} — sans effet observable, ` +
              `« un seul resultat logique » serait satisfait par zero resultat`,
      ).toBe('reference-ecrite');
      expect(
        Object.values(profilRef).some((n) => n === RESULTAT_LOGIQUE_UNIQUE)
          ? 'une-ligne-logique-en-reference'
          : `AUCUNE-TABLE-NE-PORTE-UNE-SEULE-LIGNE profil=${rendu(profilRef)}`,
      ).toBe('une-ligne-logique-en-reference'); // cahier:L261

      // VINGT publications concurrentes, liberees ensemble par une barriere.
      const db = creerBase('a2conc');
      await migrer(db);
      const h = await ouvrir(db);
      const barriere = rendezVous(PUBLICATIONS_CONCURRENTES);
      const issues = await Promise.all(
        Array.from({ length: PUBLICATIONS_CONCURRENTES }, () =>
          publier(h, env, { barrier: barriere }),
        ),
      );
      expect(issues.length).toBe(PUBLICATIONS_CONCURRENTES); // cahier:L261
      const refuses = issues.map((x, i) => ({ i, x })).filter(({ x }) => x.refuse);
      expect(
        refuses.length === 0
          ? 'vingt-publications-acceptees'
          : `PUBLICATIONS-REFUSEES ${String(refuses.length)}/${String(PUBLICATIONS_CONCURRENTES)} : ` +
              court(refuses.map(({ i, x }) => `#${String(i)} ${x.texte}`).join(' | '), 800),
      ).toBe('vingt-publications-acceptees'); // cahier:L261

      // UN SEUL RESULTAT LOGIQUE : la base porte exactement ce que porte la reference.
      expect(profilDeLaCle(db, cle)).toEqual(profilRef); // cahier:L261
      expect(lignesPortantLaCle(db, TABLE_EVENEMENTS, cle)).toBe(
        lignesPortantLaCle(dbRef, TABLE_EVENEMENTS, cle),
      ); // cahier:L259
      expect(lignesPortantLaCle(db, TABLE_OUTBOX, cle)).toBe(
        lignesPortantLaCle(dbRef, TABLE_OUTBOX, cle),
      ); // cahier:L257
      expect(
        canonique(
          vueDuRecord(
            exigerAccepte(await lire(h, cle), 'relecture apres les vingt publications'),
          ),
        ),
      ).toEqual(canonique(vueDeLEnveloppe(env))); // cahier:L261

      // « UN SEUL RESULTAT LOGIQUE », CHIFFRE PAR §F. docs/specs/T12.md epingle
      // F-RESERVATION sur A2 : creneau de capacite 1, une confirmee, ZERO
      // doublon. L'ECART de lignes entre la base concurrente et la base ou la
      // meme enveloppe n'a ete publiee qu'UNE fois doit valoir ce `doublons`.
      // L'egalite des profils ci-dessus dit la meme chose ; celle-ci la CHIFFRE
      // contre une fixture gelee et NOMME les tables qui derivent.
      assertReferences();
      const profilConc = profilDeLaCle(db, cle);
      const ecarts = [...new Set([...Object.keys(profilRef), ...Object.keys(profilConc)])]
        .map((t) => ({ t, d: (profilConc[t] ?? 0) - (profilRef[t] ?? 0) }))
        .filter((x) => x.d !== 0);
      expect(
        ecarts.length === 0
          ? F_DOUBLONS
          : `DOUBLONS-APRES-VINGT-PUBLICATIONS ${rendu(ecarts)} — attendu ` +
              `${String(F_DOUBLONS)} (F-RESERVATION P1 « rejeu de sa cle idempotente sans doublon »)`,
      ).toBe(F_DOUBLONS); // reference: F-RESERVATION doublons

      // Et la LIGNE LOGIQUE elle-meme se compte : la table qui porte a la fois
      // la cle et son empreinte (la meme identification que la preuve SQL d'A3)
      // n'en porte qu'une, comme un creneau de capacite 1 n'admet qu'une
      // reservation confirmee.
      const logiquesRef = lignesLogiques(dbRef, cle, env.input_digest);
      expect(
        Object.keys(logiquesRef).length > 0
          ? 'ligne-logique-localisee'
          : `LIGNE-LOGIQUE-INTROUVABLE : aucune table ne porte a la fois ${cle} et ` +
              `${env.input_digest} sur la base de reference`,
      ).toBe('ligne-logique-localisee'); // cahier:L263
      const logiquesConc = lignesLogiques(db, cle, env.input_digest);
      expect(logiquesConc).toEqual(logiquesRef); // cahier:L261
      const surnombre = Object.entries(logiquesConc).filter(([, n]) => n !== F_CONFIRMEES);
      expect(
        surnombre.length === 0
          ? 'une-seule-ligne-logique'
          : `LIGNES-LOGIQUES-EN-SURNOMBRE ${rendu(surnombre)} — attendu ` +
              `${String(F_CONFIRMEES)} par table portant la cle et son empreinte ` +
              `(F-RESERVATION : creneau de capacite ${String(F_CAPACITE)})`,
      ).toBe('une-seule-ligne-logique'); // reference: F-RESERVATION confirmees
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T12.A3 meme cle / autre digest donne conflit, avec preuve SQL de la contrainte unique',
    async () => {
      assertLoaded();
      assertContrat('applyMigrations', 'openStore', 'publishPeriodResult', 'readPeriodResult');

      const db = creerBase('a3');
      await migrer(db);
      const h = await ouvrir(db);

      const cle = `${RUN}-a3`;
      const env1 = enveloppe(cle, 1, UN_USD_EN_MICRO);
      const env2 = enveloppe(cle, 1, '2000000'); // MEME cle, AUTRE contenu
      expect(
        env2.input_digest === env1.input_digest
          ? `SUITE-INCOHERENTE deux contenus distincts portent la meme empreinte ${env1.input_digest}`
          : 'digests-distincts',
      ).toBe('digests-distincts'); // cahier:L82

      exigerAccepte(await publier(h, env1), 'premiere publication');
      const profil1 = profilDeLaCle(db, cle);
      expect(
        totalDuProfil(profil1) > AUCUNE_TRACE
          ? 'premiere-publication-ecrite'
          : `PREMIERE-PUBLICATION-SANS-EFFET profil=${rendu(profil1)}`,
      ).toBe('premiere-publication-ecrite');

      // (i) CONTROLE DE NON-REFUS — meme cle, MEME digest : accepte, sans doublon.
      //     Sans lui, une implementation qui refuse TOUT verdirait ce cas.
      exigerAccepte(await publier(h, env1), 'rejeu a l identique de la meme cle'); // cahier:L68
      expect(profilDeLaCle(db, cle)).toEqual(profil1); // cahier:L68

      // (ii) MEME CLE / AUTRE DIGEST : refus NOMME.
      const issue = await publier(h, env2);
      exigerRefusNomme(
        issue,
        MOTIF_CONFLIT_DE_CLE,
        `publication de ${cle} avec une autre empreinte`,
      ); // cahier:L199

      // (iii) LE CONFLIT N'A RIEN ECRASE.
      expect(
        canonique(vueDuRecord(exigerAccepte(await lire(h, cle), 'relecture apres le conflit'))),
      ).toEqual(canonique(vueDeLEnveloppe(env1))); // cahier:L68
      expect(profilDeLaCle(db, cle)).toEqual(profil1); // cahier:L68
      expect(totalDuProfil(profilDeLaCle(db, env2.input_digest))).toBe(AUCUNE_TRACE); // cahier:L68

      // (iv) PREUVE SQL DE LA CONTRAINTE UNIQUE — PostgreSQL est interroge, pas
      //      l'implementation. La table visee est celle qui porte A LA FOIS la
      //      cle et l'empreinte, c'est-a-dire la ligne de resultat : c'est la
      //      que « meme cle / autre digest » se decide.
      const empCle = emplacementsDeLaCle(db, cle);
      expect(
        empCle.length > 0
          ? 'cle-localisee-en-base'
          : `CLE-INTROUVABLE-EN-BASE ${cle} : aucune colonne textuelle du schema central ne ` +
              `porte cette valeur (tables : ${rendu(tablesDeBase(db).map((t) => t.nom))})`,
      ).toBe('cle-localisee-en-base'); // cahier:L263
      const empDigest = emplacementsDeLaCle(db, env1.input_digest);
      const tablesDuResultat = new Set(
        empDigest.map((e) => `${e.schema}.${e.table}`),
      );
      const cleDansLeResultat = empCle.filter((e) =>
        tablesDuResultat.has(`${e.schema}.${e.table}`),
      );
      expect(
        cleDansLeResultat.length > 0
          ? 'ligne-de-resultat-localisee'
          : `LIGNE-DE-RESULTAT-INTROUVABLE : aucune table ne porte a la fois la cle ${cle} ` +
              `(${rendu(empCle)}) et son empreinte ${env1.input_digest} (${rendu(empDigest)})`,
      ).toBe('ligne-de-resultat-localisee'); // cahier:L68
      const couverts = cleDansLeResultat
        .map((e) => ({ e, idx: indexUniquesSur(db, e) }))
        .filter((x) => x.idx.length > 0);
      expect(
        couverts.length > 0
          ? 'contrainte-unique-prouvee'
          : `AUCUNE-CONTRAINTE-UNIQUE-SUR-LA-CLE : colonnes de la ligne de resultat portant ` +
              `la cle ${rendu(cleDansLeResultat)} — pg_index ne declare, sur aucune d'elles, ` +
              `d'index unique dont elle soit l'unique colonne de tete`,
      ).toBe('contrainte-unique-prouvee'); // cahier:L263
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T12.A4 panne avant commit ne laisse ni resultat ni evenement orphelin visible',
    async () => {
      assertLoaded();
      assertContrat('applyMigrations', 'openStore', 'publishPeriodResult', 'readPeriodResult');

      const db = creerBase('a4');
      await migrer(db);
      const h = await ouvrir(db);

      const clePanne = `${RUN}-a4-panne`;
      const envPanne = enveloppe(clePanne, 1);
      const issue = await publier(h, envPanne, { fault: 'BEFORE_COMMIT' });
      exigerRefuse(issue, 'publication interrompue avant le commit'); // cahier:L141

      // RIEN n'est visible — ni resultat, ni evenement, ni entree d'outbox.
      const profilPanne = profilDeLaCle(db, clePanne);
      expect(totalDuProfil(profilPanne)).toBe(AUCUNE_TRACE); // cahier:L261
      expect(lignesPortantLaCle(db, TABLE_EVENEMENTS, clePanne)).toBe(AUCUNE_TRACE); // cahier:L259
      expect(lignesPortantLaCle(db, TABLE_OUTBOX, clePanne)).toBe(AUCUNE_TRACE); // cahier:L257
      expect(totalDuProfil(profilDeLaCle(db, envPanne.input_digest))).toBe(AUCUNE_TRACE); // cahier:L68
      const reluPanne = await lire(h, clePanne);
      expect(
        estVide(reluPanne)
          ? 'relecture-vide'
          : `RESULTAT-VISIBLE-APRES-PANNE-AVANT-COMMIT : ${court(reluPanne.texte, 400)}`,
      ).toBe('relecture-vide'); // cahier:L261

      // CONTROLE POSITIF. Une absence est vraie de tout programme qui n'ecrit
      // rien : sans ce controle, un stub inerte verdirait le cas. La MEME
      // publication, sans point d'injection, doit etre VISIBLE.
      const cleSaine = `${RUN}-a4-saine`;
      const envSaine = enveloppe(cleSaine, 2);
      exigerAccepte(await publier(h, envSaine), 'publication temoin, sans panne');
      const profilSain = profilDeLaCle(db, cleSaine);
      expect(
        totalDuProfil(profilSain) > AUCUNE_TRACE
          ? 'temoin-visible'
          : `CONTROLE-POSITIF-SANS-EFFET profil=${rendu(profilSain)} — une implementation qui ` +
              `n'ecrit jamais rien satisfait « aucun orphelin » sans rien prouver`,
      ).toBe('temoin-visible'); // cahier:L139
      expect(
        lignesPortantLaCle(db, TABLE_EVENEMENTS, cleSaine) >= 1
          ? 'evenement-temoin-visible'
          : `AUCUN-EVENEMENT-TEMOIN-DANS-${TABLE_EVENEMENTS}`,
      ).toBe('evenement-temoin-visible'); // cahier:L259
      expect(
        lignesPortantLaCle(db, TABLE_OUTBOX, cleSaine) >= 1
          ? 'outbox-temoin-visible'
          : `AUCUNE-ENTREE-TEMOIN-DANS-${TABLE_OUTBOX}`,
      ).toBe('outbox-temoin-visible'); // cahier:L257
      expect(
        canonique(
          vueDuRecord(exigerAccepte(await lire(h, cleSaine), 'relecture du temoin sain')),
        ),
      ).toEqual(canonique(vueDeLEnveloppe(envSaine)));

      // ET la cle interrompue reste absente APRES que le temoin ait ete ecrit :
      // ce n'est donc pas la base entiere qui est muette.
      expect(totalDuProfil(profilDeLaCle(db, clePanne))).toBe(AUCUNE_TRACE); // cahier:L261

      // « AUCUNE FACTURE IMAGINAIRE N'Y EST AJOUTEE » (L121). docs/specs/T12.md
      // epingle F-FAILURE sur A4 : l'arret de calcul ne supprime pas les
      // periodes deja ecrites, et il n'ajoute aucune facture. Une absence se
      // constate ici SUR UN TOTAL SCELLE, pas seulement sur une cle : quatre
      // periodes sont publiees, une cinquieme publication est interrompue avant
      // commit, et le total relu doit valoir exactement ce que la fixture
      // enonce — ni plus (facture imaginaire), ni moins (periode effacee).
      assertReferences();
      const envsF = Array.from({ length: F_K }, (_, i) => enveloppeDeFailure(`${RUN}-a4f`, i));
      for (const e of envsF) {
        exigerAccepte(await publier(h, e), `publication de ${e.idempotency_key}`);
      }
      const avantPanne = sommeEntiere(
        await Promise.all(
          envsF.map(async (e) =>
            depenseRelue(
              vueDuRecord(
                exigerAccepte(await lire(h, e.idempotency_key), `relecture de ${e.idempotency_key}`),
              ),
            ),
          ),
        ),
      );
      expect(avantPanne).toBe(F_COUT_TOTAL); // reference: F-FAILURE cout_total

      // La cinquieme publication porte un cout NON NUL et est interrompue avant
      // commit : si elle laissait quoi que ce soit, le total bougerait.
      const cleImaginaire = `${RUN}-a4f-imaginaire`;
      const envImaginaire = enveloppe(
        cleImaginaire,
        F_K + 1,
        String(F_UN_APPEL),
        `failure-${RUN}-a4f`,
      );
      exigerRefuse(
        await publier(h, envImaginaire, { fault: 'BEFORE_COMMIT' }),
        'facture imaginaire interrompue avant le commit',
      ); // cahier:L141
      expect(totalDuProfil(profilDeLaCle(db, cleImaginaire))).toBe(AUCUNE_TRACE); // cahier:L261

      const apresPanne = sommeEntiere(
        await Promise.all(
          envsF.map(async (e) =>
            depenseRelue(
              vueDuRecord(
                exigerAccepte(
                  await lire(h, e.idempotency_key),
                  `relecture apres panne de ${e.idempotency_key}`,
                ),
              ),
            ),
          ),
        ),
      );
      expect(apresPanne).toBe(F_COUT_TOTAL); // reference: F-FAILURE cout_total
      expect(
        apresPanne !== null && avantPanne !== null
          ? apresPanne - avantPanne
          : `MONTANTS-ILLISIBLES avant=${rendu(avantPanne)} apres=${rendu(apresPanne)}`,
      ).toBe(F_FACTURES_AJOUTEES); // reference: F-FAILURE factures_ajoutees
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T12.A5 panne apres commit puis reprise ne duplique rien',
    async () => {
      assertLoaded();
      assertContrat('applyMigrations', 'openStore', 'publishPeriodResult', 'readPeriodResult');

      const cle = `${RUN}-a5`;
      const env = enveloppe(cle, 1);

      // REFERENCE : la meme enveloppe, publiee UNE fois, sans panne.
      const dbRef = creerBase('a5ref');
      await migrer(dbRef);
      const hRef = await ouvrir(dbRef);
      exigerAccepte(await publier(hRef, env), 'publication unique de reference');
      const profilRef = profilDeLaCle(dbRef, cle);
      expect(
        totalDuProfil(profilRef) > AUCUNE_TRACE
          ? 'reference-ecrite'
          : `PUBLICATION-UNIQUE-SANS-EFFET profil=${rendu(profilRef)}`,
      ).toBe('reference-ecrite');

      // PANNE APRES COMMIT.
      const db = creerBase('a5');
      await migrer(db);
      const h = await ouvrir(db);
      const issue = await publier(h, env, { fault: 'AFTER_COMMIT' });
      exigerRefuse(issue, 'publication interrompue apres le commit'); // cahier:L141
      const profilPanne = profilDeLaCle(db, cle);
      expect(
        totalDuProfil(profilPanne) > AUCUNE_TRACE
          ? 'commit-effectif'
          : `PANNE-APRES-COMMIT-SANS-COMMIT profil=${rendu(profilPanne)} — si rien n'est ` +
              `commite, ce cas n'observe pas « apres commit » mais « avant commit », qui est A4`,
      ).toBe('commit-effectif'); // cahier:L261
      expect(profilPanne).toEqual(profilRef); // cahier:L261

      // REPRISE : republier la MEME enveloppe.
      exigerAccepte(await publier(h, env), 'reprise apres la panne'); // cahier:L68
      expect(profilDeLaCle(db, cle)).toEqual(profilPanne); // cahier:L261
      expect(profilDeLaCle(db, cle)).toEqual(profilRef); // cahier:L261

      // DEUXIEME reprise : « ne duplique rien » ne doit pas tenir au hasard
      // d'un seul rejeu.
      exigerAccepte(await publier(h, env), 'deuxieme reprise');
      expect(profilDeLaCle(db, cle)).toEqual(profilRef); // cahier:L261
      expect(lignesPortantLaCle(db, TABLE_EVENEMENTS, cle)).toBe(
        lignesPortantLaCle(dbRef, TABLE_EVENEMENTS, cle),
      ); // cahier:L259
      expect(lignesPortantLaCle(db, TABLE_OUTBOX, cle)).toBe(
        lignesPortantLaCle(dbRef, TABLE_OUTBOX, cle),
      ); // cahier:L257
      expect(
        canonique(vueDuRecord(exigerAccepte(await lire(h, cle), 'relecture apres reprise'))),
      ).toEqual(canonique(vueDeLEnveloppe(env))); // cahier:L261

      // « NE DUPLIQUE RIEN », CHIFFRE PAR §F. docs/specs/T12.md epingle F-MONEY
      // et F-RESERVATION sur A5. Un resultat facture 340 (F-MONEY, appel de
      // reference) subit la panne APRES commit, puis DEUX reprises. Le cahier
      // donne lui-meme la valeur que produirait une duplication : deux appels
      // identiques valent 680. Le total persiste doit donc valoir 340, et la
      // ligne logique rester unique — ecart de lignes egal a `doublons`, zero.
      assertReferences();
      const cleM = `${RUN}-a5-money`;
      const envM = enveloppe(cleM, 2, String(F_UN_APPEL));

      exigerAccepte(await publier(hRef, envM), 'publication unique de reference, facturee');
      const profilRefM = profilDeLaCle(dbRef, cleM);
      const logiquesRefM = lignesLogiques(dbRef, cleM, envM.input_digest);
      expect(
        Object.keys(logiquesRefM).length > 0
          ? 'ligne-logique-localisee'
          : `LIGNE-LOGIQUE-INTROUVABLE ${cleM} / ${envM.input_digest} sur la base de reference`,
      ).toBe('ligne-logique-localisee'); // cahier:L263

      exigerRefuse(
        await publier(h, envM, { fault: 'AFTER_COMMIT' }),
        'publication facturee interrompue apres le commit',
      ); // cahier:L141
      exigerAccepte(await publier(h, envM), 'premiere reprise de la publication facturee');
      exigerAccepte(await publier(h, envM), 'deuxieme reprise de la publication facturee');

      const vueM = vueDuRecord(
        exigerAccepte(await lire(h, cleM), 'relecture apres les deux reprises'),
      );
      expect(depenseRelue(vueM)).toBe(String(F_UN_APPEL)); // reference: F-MONEY + cahier:L80

      const logiquesM = lignesLogiques(db, cleM, envM.input_digest);
      expect(logiquesM).toEqual(logiquesRefM); // cahier:L261
      const dupliquees = Object.entries(logiquesM).filter(([, n]) => n !== F_CONFIRMEES);
      expect(
        dupliquees.length === 0
          ? 'aucune-ligne-dupliquee'
          : `LIGNES-DUPLIQUEES-APRES-REPRISE ${rendu(dupliquees)} — attendu ` +
              `${String(F_CONFIRMEES)} par table ; a ${String(F_UN_APPEL)} la ligne, deux ` +
              `lignes vaudraient ${String(F_DEUX_APPELS)} (F-MONEY, deux appels identiques)`,
      ).toBe('aucune-ligne-dupliquee'); // reference: F-RESERVATION confirmees

      const totalPersiste = Object.values(logiquesM).map((n) => n * F_UN_APPEL);
      expect(
        totalPersiste.every((t) => t === F_UN_APPEL)
          ? 'total-persiste-egal-a-un-appel'
          : `TOTAL-PERSISTE-DUPLIQUE ${rendu(totalPersiste)} — un seul appel vaut ` +
              `${String(F_UN_APPEL)}, deux appels identiques valent ${String(F_DEUX_APPELS)}`,
      ).toBe('total-persiste-egal-a-un-appel'); // reference: F-MONEY

      const ecartsM = [...new Set([...Object.keys(profilRefM), ...Object.keys(profilDeLaCle(db, cleM))])]
        .map((t) => ({ t, d: (profilDeLaCle(db, cleM)[t] ?? 0) - (profilRefM[t] ?? 0) }))
        .filter((x) => x.d !== 0);
      expect(
        ecartsM.length === 0
          ? F_DOUBLONS
          : `DOUBLONS-APRES-REPRISE ${rendu(ecartsM)} — attendu ${String(F_DOUBLONS)}`,
      ).toBe(F_DOUBLONS); // reference: F-RESERVATION doublons
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T12.A6 transaction concurrente conflictuelle reprise selon une limite fixee, sans perdre l unicite',
    async () => {
      assertLoaded();
      assertContrat('applyMigrations', 'openStore', 'publishPeriodResult', 'readPeriodResult');

      // LA LIMITE EST LUE, PAS INVENTEE : L261 dit « une limite fixee » sans
      // en donner la valeur. La suite exige seulement que c'en soit une.
      const limite = limiteDeReprise();
      expect(
        limite !== null
          ? 'limite-publiee'
          : `LIMITE-DE-REPRISE-NON-PUBLIEE : aucun export parmi [${ALIAS_LIMITE.join('|')}] ` +
              `(${String(LOADED.exportCount)} exports observes dans ${LOADED.via.join(', ') || 'aucun paquet'})`,
      ).toBe('limite-publiee'); // cahier:L261
      expect(
        limite !== null && Number.isInteger(limite) && limite >= TENTATIVES_APRES_UN_CONFLIT
          ? 'limite-finie-et-reprenante'
          : `LIMITE-INVALIDE ${rendu(limite)} : attendu un entier fini >= ` +
              `${String(TENTATIVES_APRES_UN_CONFLIT)} — une limite de 1 n'autorise aucune reprise`,
      ).toBe('limite-finie-et-reprenante'); // cahier:L261
      const L = limite as number;

      const db = creerBase('a6');
      await migrer(db);
      const h = await ouvrir(db);

      // (i) UNE REPRISE EFFECTIVE : un conflit, puis succes a la deuxieme tentative.
      const cle1 = `${RUN}-a6-reprise`;
      const env1 = enveloppe(cle1, 1);
      const recu = exigerAccepte(
        await publier(h, env1, { fault: 'CONFLICT_ONCE' }),
        'publication conflictuelle a la premiere tentative',
      );
      expect(tentatives(recu, rendu(recu))).toBe(TENTATIVES_APRES_UN_CONFLIT); // cahier:L261
      expect(
        totalDuProfil(profilDeLaCle(db, cle1)) > AUCUNE_TRACE
          ? 'reprise-a-publie'
          : `REPRISE-SANS-EFFET ${cle1} : profil=${rendu(profilDeLaCle(db, cle1))}`,
      ).toBe('reprise-a-publie'); // cahier:L261
      expect(
        canonique(vueDuRecord(exigerAccepte(await lire(h, cle1), 'relecture apres reprise'))),
      ).toEqual(canonique(vueDeLEnveloppe(env1)));

      // (ii) LA LIMITE EST UNE BORNE : conflit a CHAQUE tentative.
      const cle2 = `${RUN}-a6-borne`;
      const env2 = enveloppe(cle2, 2);
      const refus = await publier(h, env2, { fault: 'CONFLICT_EVERY_ATTEMPT' });
      exigerRefusNomme(
        refus,
        MOTIF_LIMITE_ATTEINTE,
        'publication conflictuelle a chaque tentative',
      ); // cahier:L261
      expect(tentatives(refus.valeur, refus.texte)).toBe(L); // cahier:L261
      expect(totalDuProfil(profilDeLaCle(db, cle2))).toBe(AUCUNE_TRACE); // cahier:L261
      const relu2 = await lire(h, cle2);
      expect(
        estVide(relu2)
          ? 'rien-de-publie-apres-la-borne'
          : `RESULTAT-VISIBLE-MALGRE-LA-LIMITE-ATTEINTE : ${court(relu2.texte, 400)}`,
      ).toBe('rien-de-publie-apres-la-borne'); // cahier:L261

      // (iii) SANS PERDRE L'UNICITE — course reelle, vingt publications liberees
      //       ensemble. La clause est secondaire ici (A2 et A3 la portent) ;
      //       ce qui est decisif est que la borne tienne AUSSI sous une course.
      const cle3 = `${RUN}-a6-course`;
      const env3 = enveloppe(cle3, 3);
      const dbRef = creerBase('a6ref');
      await migrer(dbRef);
      const hRef = await ouvrir(dbRef);
      exigerAccepte(await publier(hRef, env3), 'publication unique de reference');
      const profilRef = profilDeLaCle(dbRef, cle3);
      expect(
        totalDuProfil(profilRef) > AUCUNE_TRACE
          ? 'reference-ecrite'
          : `PUBLICATION-UNIQUE-SANS-EFFET profil=${rendu(profilRef)}`,
      ).toBe('reference-ecrite');

      const dbCourse = creerBase('a6course');
      await migrer(dbCourse);
      const hCourse = await ouvrir(dbCourse);
      const barriere = rendezVous(PUBLICATIONS_CONCURRENTES);
      const issues = await Promise.all(
        Array.from({ length: PUBLICATIONS_CONCURRENTES }, () =>
          publier(hCourse, env3, { barrier: barriere }),
        ),
      );
      const refuses = issues.map((x, i) => ({ i, x })).filter(({ x }) => x.refuse);
      expect(
        refuses.length === 0
          ? 'course-sans-refus'
          : `COURSE-REFUSEE ${String(refuses.length)}/${String(PUBLICATIONS_CONCURRENTES)} : ` +
              court(refuses.map(({ i, x }) => `#${String(i)} ${x.texte}`).join(' | '), 800),
      ).toBe('course-sans-refus'); // cahier:L261
      const horsBorne = issues
        .map((x, i) => ({ i, n: tentatives(x.valeur, x.texte) }))
        .filter(({ n }) => n === null || !Number.isInteger(n) || n < 1 || n > L);
      expect(
        horsBorne.length === 0
          ? 'tentatives-dans-la-borne'
          : `TENTATIVES-HORS-BORNE limite=${String(L)} : ${rendu(horsBorne)}`,
      ).toBe('tentatives-dans-la-borne'); // cahier:L261
      expect(profilDeLaCle(dbCourse, cle3)).toEqual(profilRef); // cahier:L261

      // (iv) DEUX ECRITURES CONFLICTUELLES, AU PLUS UNE LIGNE LOGIQUE.
      //      docs/specs/T12.md epingle F-BUDGET sur A6 : « deux reservations
      //      concurrentes de 600 ne peuvent pas etre toutes deux acceptees ».
      //      Le montant est le contrat de T16 ; ce que T12 en retient est le
      //      CARDINAL — deux demandes concurrentes, au plus une acceptee. Ici,
      //      les deux ecritures subissent un conflit de serialisation a leur
      //      premiere tentative : elles doivent etre REPRISES dans la borne, et
      //      n'en laisser qu'une seule ligne logique.
      assertReferences();
      const cle4 = `${RUN}-a6-deux`;
      const env4 = enveloppe(cle4, 4);
      const dbDeux = creerBase('a6deux');
      await migrer(dbDeux);
      const hDeux = await ouvrir(dbDeux);
      const barriere2 = rendezVous(F_DEMANDES_CONCURRENTES);
      const deux = await Promise.all(
        Array.from({ length: F_DEMANDES_CONCURRENTES }, () =>
          publier(hDeux, env4, { barrier: barriere2, fault: 'CONFLICT_ONCE' }),
        ),
      );
      expect(deux.length).toBe(F_DEMANDES_CONCURRENTES); // reference: F-BUDGET
      const refusesDeux = deux.map((x, i) => ({ i, x })).filter(({ x }) => x.refuse);
      expect(
        refusesDeux.length === 0
          ? 'deux-ecritures-conflictuelles-reprises'
          : `ECRITURE-CONFLICTUELLE-NON-REPRISE ${String(refusesDeux.length)}/` +
              `${String(F_DEMANDES_CONCURRENTES)} : ` +
              court(refusesDeux.map(({ i, x }) => `#${String(i)} ${x.texte}`).join(' | '), 600),
      ).toBe('deux-ecritures-conflictuelles-reprises'); // cahier:L261
      const horsBorne2 = deux
        .map((x, i) => ({ i, n: tentatives(x.valeur, x.texte) }))
        .filter(({ n }) => n === null || !Number.isInteger(n) || n < TENTATIVES_APRES_UN_CONFLIT || n > L);
      expect(
        horsBorne2.length === 0
          ? 'reprise-effective-et-bornee'
          : `TENTATIVES-HORS-BORNE limite=${String(L)}, attendu >= ` +
              `${String(TENTATIVES_APRES_UN_CONFLIT)} apres un conflit : ${rendu(horsBorne2)}`,
      ).toBe('reprise-effective-et-bornee'); // cahier:L261
      const logiques4 = lignesLogiques(dbDeux, cle4, env4.input_digest);
      expect(
        Object.keys(logiques4).length > 0
          ? 'ligne-logique-localisee'
          : `LIGNE-LOGIQUE-INTROUVABLE ${cle4} / ${env4.input_digest} apres deux ecritures`,
      ).toBe('ligne-logique-localisee'); // cahier:L263
      const enTrop = Object.entries(logiques4).filter(([, n]) => n > F_ACCEPTEES_AU_PLUS);
      expect(
        enTrop.length === 0
          ? 'au-plus-une-ligne-logique'
          : `DEUX-ECRITURES-DEUX-LIGNES ${rendu(enTrop)} — au plus ` +
              `${String(F_ACCEPTEES_AU_PLUS)} (F-BUDGET : deux demandes concurrentes ne peuvent ` +
              `pas etre toutes deux acceptees)`,
      ).toBe('au-plus-une-ligne-logique'); // reference: F-BUDGET acceptees_au_plus
    },
    CASE_TIMEOUT_MS,
  );
});
