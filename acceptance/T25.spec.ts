/**
 * acceptance/T25.spec.ts — suite d'acceptation de la tache T25.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T25.A1 refusal   — worker A avec jeton 7, puis B avec jeton 8 : A ne peut
 *                      plus appeler la passerelle ni publier de checkpoint,
 *                      erreurs STALE_EXECUTION
 *   T25.A2 absence   — A n'ecrit pas sur les volumes restaures de B
 *   T25.A3 behaviour — arret avec deux appels partis et trois en attente
 *                      annule les trois, mais conserve le suivi des deux
 *   T25.A4 absence   — aucun nouvel appel admis apres revocation
 *   T25.A5 behaviour — appel ancien potentiellement facture reste dans le
 *                      journal
 *   T25.A6 refusal   — un heartbeat tardif ne reactive pas le jeton 7
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T25 — `packages/workflows`,
 * `packages/activities`, `packages/gateway` et `packages/sandbox` — et ne
 * les a lus ni directement ni par `git show` (ADR-001 : aveuglement
 * PROCEDURAL, discipline auditable au diff, pas une barriere technique). Le
 * contrat teste ci-dessous est derive de docs/specs/T25.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle sur T25 :
 *
 *   L371  titre : « Resister aux workers perimes et a l'annulation ».
 *   L373  dependances T17, T19, T23 et T24 ; livrables MOT POUR MOT : « baux,
 *         jetons de fencing, arret de session et reconciliation apres
 *         annulation ». « arret de session » fonde directement l'export que
 *         cette suite fixe sous le nom `stopSession` (A3).
 *   L375  les six cas d'acceptation, mot pour mot — seule ligne qui nomme
 *         `STALE_EXECUTION`, qui chiffre « jeton 7 », « jeton 8 », « deux
 *         appels partis » et « trois en attente ».
 *   L377  fin : « les services qui protegent les effets controlent le
 *         jeton, pas seulement le scheduler. Utiliser barrieres et horloge
 *         de bail controlees dans les tests, sans attente fragile au temps
 *         reel. » — fonde le choix (section IV) de ne jamais dependre d'un
 *         serveur Temporal reel ni de `Date.now()`, et de faire transiter un
 *         `now` explicite dans CHAQUE appel de bail.
 *   L99   enum d'etat d'appel, VERBATIM, repris de T17/T24 : `RESERVED`,
 *         `DISPATCH_STARTED`, `RESPONSE_STORED`, `SETTLED`, `UNKNOWN`,
 *         `CANCELLED_BEFORE_DISPATCH` ; « meme un crash immediatement apres
 *         [DISPATCH_STARTED] est traite comme potentiellement facture » —
 *         fonde A5 (« appel ancien potentiellement facture ») et le choix de
 *         `CANCELLED_BEFORE_DISPATCH` (deja dans l'enum, jamais invente ici)
 *         comme statut terminal des trois appels annules d'A3.
 *   L68   invariant 6 : « une tache peut etre rejouee par l'orchestrateur ;
 *         les effets valides sont dedupliques par cle d'operation et
 *         empreinte d'entree » — le contexte de rejeu qui rend la
 *         distinction gone/pending d'A3 necessaire.
 *   L69   invariant 7 : « un appel fournisseur dont la reponse est perdue
 *         n'est pas relance aveuglement. Son etat reste ambigu tant qu'il
 *         n'est pas reconcilie. » — fonde A5 : l'ambiguite ne se resout pas
 *         en « disparait », elle reste dans le journal.
 *   L67   invariant 5 : « un echec conserve ses depenses, ses intentions non
 *         servies et son backlog » — fonde A5 : l'annulation du bail ne doit
 *         pas purger le journal des couts potentiels.
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         barrieres et points d'injection nommes [...] les checks
 *         d'integration utilisent reellement PostgreSQL, le stockage et les
 *         workers lorsque le contrat porte sur ces composants » — autorise
 *         l'usage de PostgreSQL reel pour A1/A3/A4/A5 (le journal de
 *         gateway) et l'horloge entierement simulee de section III.
 *   L319  T19 (dependance) : « SandboxRunner Linux, profil d'execution
 *         borne, reseau du candidat et procedure de destruction » ;
 *   L321  « identites et volumes distincts [...] le profil exact est
 *         archive » — fonde le vocabulaire « volume » d'A2.
 *   L301  T17 (dependance) : « journal durable d'appel [...] idempotence
 *         logique » — le journal que A3/A5 interrogent par `getModelCall`,
 *         sans jamais rouvrir le contrat de `dispatchModelCall` lui-meme
 *         (deja fixe par acceptance/T17.spec.ts).
 *   L365  T24 (dependance) : « les appels externes se trouvent dans les
 *         Activities » — fonde le choix de placer la publication de
 *         checkpoint fencee (A1, second volet) dans `packages/activities`
 *         plutot que dans `packages/gateway` ou `packages/storage`.
 *   L28   un prerequis absent produit BLOCKED, jamais PASS ni FAILED — cette
 *         suite ne confond jamais une commande absente (controle
 *         d'infrastructure, hors de son ressort) avec un verdict metier.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion a l'une de DEUX provenances :
 *
 * (a) LITTERAUX RELEVES DANS LE CAHIER (`// cahier:L<n>`) :
 *       `STALE_EXECUTION`                                    L375
 *       `RESERVED, DISPATCH_STARTED, RESPONSE_STORED,
 *        SETTLED, UNKNOWN, CANCELLED_BEFORE_DISPATCH`        L99  (repris de T17/T24)
 *       2 — « deux appels partis »                           L375
 *       3 — « trois en attente »                              L375
 *
 * (b) AUCUNE RACINE GELEE (acceptance/reference/**) N'EST CONSOMMEE : comme
 *     pour T19, le cahier ne scelle aucune valeur numerique ou enum propre a
 *     T25 — §H ne nomme ni export, ni code de refus specifique a T25 au-dela
 *     de `STALE_EXECUTION` lui-meme.
 *
 * CE QUE CETTE SUITE N'ELEVE PAS AU RANG DE LITTERAL, BIEN QUE LE CAHIER LES
 * MENTIONNE : « jeton 7 » et « jeton 8 » (L375) sont une ILLUSTRATION
 * narrative de DEUX JETONS CROISSANTS pour une MEME ressource, pas une
 * fixation de la valeur de depart d'un compteur. Rien dans le cahier
 * n'impose que le premier jeton emis vaille 7 : cette suite exige donc la
 * PROPRIETE (jeton de B strictement superieur a jeton de A, pour la meme
 * ressource) et non la valeur. Fixer `=== 7` echouerait sur toute
 * implementation qui commence a compter a 0 ou 1 sans que le cahier ne
 * tranche laquelle est correcte — exactement le piege que T19/II met en
 * garde (« aucun litteral numerique [...] n'est fixe par le cahier »).
 *
 * FABRIQUE PAR CETTE SUITE, ET SERVANT D'ENTREE JAMAIS DE VALEUR ATTENDUE :
 * les dix noms d'export de la section III, le code `STALE_EXECUTION` est
 * repris du cahier mais le reste du vocabulaire (`resourceId`, `holderId`,
 * `checkpointRef`, `volumeDir`) est fixe ici faute d'enonce ; l'horloge
 * entiere (valeurs `now`), les identifiants de campagne/bail/appel, et la
 * grille tarifaire factice (`TARIF_TEST`/`USAGE_TEST`, qui ne reproduit
 * aucune valeur de F-MONEY — T25 ne teste aucun montant).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T25 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Quatre paquets interroges : `packages/workflows`, `packages/activities`,
 * `packages/gateway`, `packages/sandbox` (les `source_paths` de T25, FIXES
 * ICI), plus `packages/billing` et `packages/storage` (dependances deja
 * fixees par acceptance/T16.spec.ts et acceptance/T12.spec.ts, reprises
 * TELLES QUELLES — memes alias de role, cf. ROLES ci-dessous). Le chargement
 * ne LEVE jamais : chaque cas asserte lui-meme le chargement des paquets
 * dont il a besoin, en les NOMMANT (verification/runner/red.mjs classerait
 * sinon un import casse SUITE_FAILED_TO_RUN, refuse comme preuve). Les noms
 * sont resolus par ROLE, pas par paquet precis : le point d'implantation
 * exact (gateway vs activities vs workflows) est un detail que cette suite
 * NE FIXE PAS, seul le CONTRAT OBSERVABLE compte (meme geste que T17/T19).
 *
 * `packages/workflows` — L'AUTORITE DE BAIL (NOUVEAU, T25) :
 *
 * 1. `openLeaseAuthority(opts?)` -> `Promise<LeaseHandle>` (ou valeur
 *    directe ; cette suite `await`-e dans les deux cas). Aucune ressource
 *    Postgres n'est exigee par cette suite : l'implementeur choisit la
 *    durabilite du bail, cette suite n'observe que le CONTRAT ci-dessous.
 *
 * 2. `acquireLease(leaseHandle, { resourceId, holderId, now })` ->
 *    `Promise<{ resourceId, token, holderId }>`. `token` est un ENTIER
 *    STRICTEMENT CROISSANT par `resourceId` : un second appel sur la MEME
 *    `resourceId` rend un `token` strictement superieur au precedent, et
 *    REND PERIME tout jeton anterieurement emis pour cette ressource
 *    (L375 : « jeton 7, puis jeton 8 » — cf. II pour la valeur non fixee).
 *
 * 3. `heartbeatLease(leaseHandle, { resourceId, token, now })` ->
 *    `Promise<{ accepted: boolean; currentToken: number; code?: string }>`.
 *    NE LEVE JAMAIS (meme discipline que `probeTcp` de T19 : un refus est un
 *    RESULTAT, pas une exception). `accepted=false` et
 *    `code='STALE_EXECUTION'` quand `token` n'est PAS le jeton courant de
 *    `resourceId` (perime par supersession OU par revocation) ; `accepted`
 *    vrai sinon. `currentToken` NOMME TOUJOURS le vrai jeton courant, qu'il
 *    accepte ou refuse la tentative — un heartbeat tardif ne le fait JAMAIS
 *    reculer (L375, A6, le point decisif).
 *
 * 4. `revokeLease(leaseHandle, { resourceId, now })` -> `Promise<{ revoked:
 *    boolean }>`. Apres cet appel, AUCUN jeton — meme celui qui serait
 *    sinon encore courant — n'est plus admis pour `resourceId` : une
 *    revocation explicite (annulation de trajectoire) est DISTINCTE d'une
 *    simple supersession par un jeton plus recent (A4 vs A1 : deux chemins
 *    de code differents, cf. V).
 *
 * 5. `closeLeaseAuthority(leaseHandle)` -> `Promise<void>` (optionnel,
 *    meme discipline tolerante que `closeStore`).
 *
 * `packages/gateway` — ADDITIFS A T17 (ne touche ni ne reouvre
 * `dispatchModelCall`/`getModelCall`/`reconcileModelCall`, deja fixes par
 * acceptance/T17.spec.ts) :
 *
 * 6. `dispatchModelCallFenced(handle, params, fencing, hooks?)` ->
 *    meme forme de resultat que `dispatchModelCall`. `fencing` =
 *    `{ leaseHandle, resourceId, token, now }`. Delegue EXACTEMENT a la
 *    logique de dispatch de T17 SI ET SEULEMENT SI le controle de bail
 *    admet `token` pour `resourceId` ; sinon REJETTE (promesse rejetee) avec
 *    une erreur `.code === 'STALE_EXECUTION'`, SANS jamais contacter
 *    `params.provider` et SANS creer ni muter d'enregistrement durable
 *    (A1, A4).
 *
 * 7. `stopSession(handle, { pendingCalls, dispatchedModelCallIds })` ->
 *    `Promise<{ cancelled: string[]; tracked: string[] }>`. `pendingCalls`
 *    est `Array<{ model_call_id: string }>` — des appels dont AUCUNE trace
 *    durable n'existe encore (jamais passes par `dispatchModelCall`).
 *    Chaque id de `pendingCalls` recoit un enregistrement TERMINAL
 *    `CANCELLED_BEFORE_DISPATCH` (L99, enum deja etabli, jamais invente ici)
 *    et apparait dans `cancelled`. Chaque id de `dispatchedModelCallIds`
 *    n'est PAS touche — son statut durable existant, quel qu'il soit, reste
 *    inchange — et apparait dans `tracked` (A3, L373).
 *
 * `packages/activities` — EFFETS EXTERNES (NOUVEAU, T25 ; cf. L365) :
 *
 * 8. `publishCheckpointActivity(leaseHandle, { resourceId, token, now,
 *    checkpointRef })` -> `Promise<{ ok: true; published: string }>`. MEME
 *    regle d'admission que (6) ; REJETTE avec `.code === 'STALE_EXECUTION'`
 *    quand inadmissible, et dans ce cas `checkpointRef` n'est JAMAIS
 *    enregistre comme publie (A1, second volet).
 *
 * 9. `listPublishedCheckpoints(leaseHandle, resourceId)` ->
 *    `Promise<string[]>`. Lecture INDEPENDANTE de ce que (8) a reellement
 *    enregistre — le controle qui empeche (8) de REJETER en apparence tout
 *    en publiant quand meme (cf. IV).
 *
 * `packages/sandbox` — ADDITIF A T19 (ne touche ni ne reouvre les six
 * exports deja fixes par acceptance/T19.spec.ts) :
 *
 * 10. `writeToRestoredVolume(leaseHandle, { resourceId, token, now,
 *     volumeDir, relPath, content })` -> `Promise<{ written: boolean }>`.
 *     NE LEVE JAMAIS. Ecrit `content` a `volumeDir/relPath` SI ET SEULEMENT
 *     SI le controle de bail admet `token` pour `resourceId` ; `written`
 *     rapporte ce qui s'est passe. `volumeDir` est un repertoire HOTE
 *     ordinaire (meme concept que `workspaceDir` de T19/L321, « volumes
 *     distincts ») : cette suite ne reprouve PAS l'isolation de conteneur de
 *     T19 (deja sa propre suite), seulement le CONTROLE DE JETON sur ce
 *     chemin d'ecriture precis (A2 ; cf. V pour ce choix).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T25, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 ET A6 SONT DES CAS `refusal` : LE DANGER DECISIF generique
 *     (cases.lock.json le repete pour chacun) est qu'une implementation
 *     INERTE qui refuse TOUJOURS tout — peu importe le jeton — les rendrait
 *     verts sans rien prouver. Chaque cas porte donc un CONTROLE POSITIF
 *     dans le MEME test : A1 verifie que l'appel/la publication du worker B
 *     (jeton COURANT) reussit ; A6 verifie qu'un heartbeat portant le jeton
 *     courant est accepte. Sans ce controle, une passerelle qui rejetterait
 *     inconditionnellement verdirait A1/A6 a bon compte.
 * (2) A2 ET A4 SONT DES CAS `absence` : LE DANGER SYMETRIQUE — une fonction
 *     qui n'ECRIT JAMAIS rien (A2) ou qui ne CONTACTE JAMAIS le fournisseur
 *     (A4, deja exerce positivement par le controle d'A1 sur la MEME
 *     fonction `dispatchModelCallFenced`) rendrait ces cas verts sans rien
 *     prouver. A2 porte son propre controle positif : le worker B, jeton
 *     courant, ECRIT reellement et le fichier est relu avec son contenu
 *     exact — un `writeToRestoredVolume` qui ne ferait jamais rien serait
 *     demasque ici.
 * (3) A1, SECOND VOLET (publication de checkpoint) : une
 *     `publishCheckpointActivity` qui REJETTE correctement mais publierait
 *     quand meme en coulisse (effet fantome) laisserait un systeme incorrect
 *     indetectable si seule l'erreur etait observee. `listPublishedCheckpoints`
 *     est le controle INDEPENDANT qui ferme ce trou : le `checkpointRef` du
 *     worker A perime ne doit JAMAIS apparaitre dans cette liste.
 * (4) A3/A5 : UN STUB QUI REND TOUJOURS UN ENREGISTREMENT NON NUL (au lieu
 *     de lire reellement le journal) verdirait trivialement « l'appel reste
 *     dans le journal ». Cette suite n'accepte jamais la seule presence d'un
 *     enregistrement : elle exige en outre le STATUT EXACT attendu
 *     (`CANCELLED_BEFORE_DISPATCH` pour chaque id annule, le statut
 *     INCHANGE — pas forcement cancel — pour chaque id « parti »), issu d'un
 *     scenario que cette suite a elle-meme construit et dont elle connait
 *     donc la valeur attendue AVANT de lire le journal.
 * (5) ISOLATION ENTRE CAS : chaque test genere sa PROPRE `resourceId`
 *     aleatoire (jamais partagee entre cas), de sorte qu'aucune revocation
 *     ou supersession d'un cas ne puisse affecter le bail d'un autre cas
 *     execute en parallele (meme discipline que T12/T21/T23/T24 pour les
 *     bases Postgres jetables).
 * (6) AUCUNE ATTENTE FRAGILE AU TEMPS REEL (L377) : tout `now` transmis aux
 *     fonctions de bail est une valeur ENTIERE que cette suite choisit et
 *     avance elle-meme (`horloge()`/`avancer()`, section socle) — jamais
 *     `Date.now()`. Un test dont la decision dependrait de la vitesse reelle
 *     d'execution serait non deterministe ; celui-ci ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne reprouve PAS l'isolation reseau/filesystem d'un sandbox reel
 *    (sentinelle privee, base centrale injoignable, etc.) : c'est T19, deja
 *    sa propre suite. A2 observe uniquement le CONTROLE DE JETON sur un
 *    chemin d'ecriture, pas l'etancheite d'un conteneur — d'ou le choix d'un
 *    repertoire hote ordinaire plutot que d'un conteneur reellement
 *    provisionne (cf. III.10) : exiger `containers.runc` ici reprouverait
 *    T19.A2/A6 sans ajouter d'observation sur le fencing lui-meme.
 *  • Elle ne reprouve PAS le calcul de cout, l'idempotence logique ni la
 *    reconciliation de T17 : `dispatchModelCall`/`getModelCall`/
 *    `reconcileModelCall` restent EXACTEMENT le contrat deja fixe par
 *    acceptance/T17.spec.ts ; cette suite ajoute seulement une couche
 *    d'ADMISSION par-dessus, jamais une modification de ce qui existait.
 *  • Elle n'exige PAS que la passerelle ou l'activite de checkpoint passent
 *    par un serveur Temporal reel ou par `temporal-timeskip` : L377 dit
 *    explicitement que ce sont « les services qui protegent les effets »,
 *    PAS le scheduler, qui controlent le jeton — cette suite le demontre en
 *    n'invoquant AUCUN workflow Temporal, par choix, pas par omission.
 *  • Elle ne fixe AUCUNE politique de duree de bail (TTL, expiration
 *    automatique sans heartbeat) : aucune valeur temporelle n'est enoncee
 *    par le cahier pour T25 ; seules la SUPERSESSION par un jeton plus
 *    recent et la REVOCATION explicite sont exercees (A1/A6 et A4/A5
 *    respectivement). Un `now` croissant est transmis par discipline
 *    (cf. IV.6), jamais compare a un delai.
 *  • Elle ne verifie pas le detail de la reconciliation d'un appel UNKNOWN
 *    (c'est `reconcileModelCall`, deja couvert par T17.A4) : A5 verifie
 *    seulement que l'enregistrement AMBIGU persiste, pas qu'il est reconcile.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 120_000;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;
type Fn = (...a: unknown[]) => unknown;

/* ────────────────────────────────────────────────────────────────── socle */

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO = findRepoRoot();

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 10) return '"…"';
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
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 600): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/** L'assertion elementaire : une comparaison de chaines, pour nommer ce qui a ete vu. */
function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ═════ litteraux du cahier, chacun avec sa ligne (section II) ═══════════ */

const ETAT_UNKNOWN = 'UNKNOWN'; // cahier:L99
const ETAT_CANCELLED_BEFORE_DISPATCH = 'CANCELLED_BEFORE_DISPATCH'; // cahier:L99
const CODE_STALE_EXECUTION = 'STALE_EXECUTION'; // cahier:L375
const DEUX_APPELS_PARTIS = 2; // cahier:L375 — « deux appels partis »
const TROIS_EN_ATTENTE = 3; // cahier:L375 — « trois en attente »

/** Ce qui n'est PAS un refus : un plantage (meme convention que T00/T16/T17). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/** Grille tarifaire et usage FACTICES — entree de test (cf. II), T25 ne
 * verifie aucun montant : seule la plomberie budget/reservation de T17 est
 * requise pour que `dispatchModelCallFenced` accepte des parametres valides. */
const TARIF_TEST = { input_uncached_per_token: 1, input_cached_per_token: 1, output_per_token: 1 };
const USAGE_TEST = { input_uncached_tokens: 1, input_cached_tokens: 0, output_tokens: 1 };

/* ══════════════════════════ PostgreSQL reel (requires: postgres18, L141) ═ */

const RUN = `t25_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}
function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
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
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

/* ═══════════════ chargement des paquets declares par le registre ═══════ */

const PACKAGES = ['workflows', 'activities', 'gateway', 'sandbox', 'billing', 'storage'] as const;

interface Loaded {
  chargesPar: Set<string>;
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
  const chargesPar = new Set<string>();
  const flat = new Map<string, unknown>();
  for (const pkg of PACKAGES) {
    let charge = false;
    for (const s of specifiersFor(pkg)) {
      if (charge) break;
      try {
        const mod = (await import(s)) as Ns;
        flatten(mod, flat);
        chargesPar.add(pkg);
        charge = true;
      } catch (e) {
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet packages/${pkg} : aucun specificateur n'a repondu`);
  }
  return { chargesPar, flat, attempts };
}

let LOADED: Loaded = { chargesPar: new Set(), flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertPackageLoaded(pkg: string): void {
  exige(
    LOADED.chargesPar.has(pkg),
    `packages/${pkg}-charge`,
    `PAQUET-NON-CHARGEABLE packages/${pkg} : ${LOADED.attempts.join(' | ')}`,
  );
}

/* ─────────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  // packages/storage — repris tels quels de acceptance/T12.spec.ts.
  applyMigrations: [
    'applyMigrations', 'applyCentralMigrations', 'runMigrations', 'migrate',
    'migrateCentral', 'migrateUp', 'ensureSchema', 'createSchema', 'initSchema',
    'setupSchema', 'up',
  ],
  openStore: [
    'openStore', 'openCentralStore', 'createStore', 'openRepository',
    'createRepository', 'connect', 'createPool', 'openDatabase', 'open',
  ],
  closeStore: [
    'closeStore', 'closeRepository', 'disconnect', 'shutdown', 'dispose', 'close', 'end',
  ],
  // packages/billing — repris tels quels de acceptance/T16.spec.ts.
  openBudget: [
    'openBudget', 'createBudget', 'initBudget', 'ensureBudget', 'openBudgetLedger',
    'createBudgetLedger',
  ],
  reserveBudget: [
    'reserveBudget', 'reserve', 'createReservation', 'requestReservation', 'reserveAmount',
  ],
  // packages/gateway — repris tels quels de acceptance/T17.spec.ts.
  createFakeProvider: [
    'createFakeProvider', 'makeFakeProvider', 'newFakeProvider', 'fakeProvider',
  ],
  dispatchModelCall: [
    'dispatchModelCall', 'dispatchCall', 'dispatch', 'sendModelCall', 'executeModelCall',
  ],
  getModelCall: [
    'getModelCall', 'readModelCall', 'fetchModelCall', 'getCall', 'loadModelCall',
  ],
  // packages/workflows — FIXES PAR CETTE SUITE (section III).
  openLeaseAuthority: [
    'openLeaseAuthority', 'createLeaseAuthority', 'openFencingAuthority',
    'createFencingAuthority', 'openLeaseStore', 'createLeaseStore',
    'openLeaseManager', 'createLeaseManager',
  ],
  acquireLease: ['acquireLease', 'obtainLease', 'issueLease', 'grantLease', 'takeLease'],
  heartbeatLease: ['heartbeatLease', 'renewLease', 'leaseHeartbeat', 'touchLease', 'extendLease'],
  revokeLease: ['revokeLease', 'revokeFencingLease', 'cancelLease', 'invalidateLease', 'revokeWorkerLease'],
  closeLeaseAuthority: ['closeLeaseAuthority', 'closeFencingAuthority', 'closeLeaseStore', 'closeLeaseManager'],
  // packages/gateway — FIXES PAR CETTE SUITE, additifs a T17 (section III).
  dispatchModelCallFenced: [
    'dispatchModelCallFenced', 'dispatchFenced', 'dispatchModelCallWithFencing',
    'fencedDispatchModelCall', 'dispatchCallFenced',
  ],
  stopSession: ['stopSession', 'stopWorkerSession', 'sessionStop', 'shutdownSession', 'endSession'],
  // packages/activities — FIXES PAR CETTE SUITE (section III).
  publishCheckpointActivity: [
    'publishCheckpointActivity', 'publishCheckpointFenced', 'publishCheckpointWithFencing',
    'fencedPublishCheckpoint', 'checkpointPublishFenced',
  ],
  listPublishedCheckpoints: [
    'listPublishedCheckpoints', 'publishedCheckpoints', 'getPublishedCheckpoints',
    'listCheckpointPublications',
  ],
  // packages/sandbox — FIXE PAR CETTE SUITE, additif a T19 (section III).
  writeToRestoredVolume: [
    'writeToRestoredVolume', 'writeToVolumeFenced', 'restoreVolumeWriteFenced',
    'fencedVolumeWrite', 'writeRestoredVolume',
  ],
};

function resolveRole(name: string): { fn?: Fn; tried: readonly string[] } {
  const aliases = ROLES[name];
  if (aliases === undefined) throw new Error(`role inconnu de la suite : ${name}`);
  for (const a of aliases) {
    const v = LOADED.flat.get(a);
    if (typeof v === 'function') return { fn: v as Fn, tried: aliases };
  }
  return { tried: aliases };
}

function requireRole(name: string): Fn {
  const { fn, tried } = resolveRole(name);
  exige(fn !== undefined, `role-${name}-trouve`, `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`);
  return fn as Fn;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

function codeDe(err: unknown): string | undefined {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    if (typeof code === 'string') return code;
  }
  if (typeof err === 'object' && err !== null) {
    const code = (err as Json).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/* ══════════════════════════ mise en place par cas ═══════════════════════ */

const STORE_HANDLES: unknown[] = [];
const LEASE_HANDLES: unknown[] = [];

async function ouvrirStore(suffixe: string): Promise<unknown> {
  const applyMigrations = requireRole('applyMigrations');
  const openStore = requireRole('openStore');
  const db = creerBase(suffixe);
  const dsn = dsnFor(db);
  const mig = await essayer(() => applyMigrations({ dsn }));
  exige(mig.ok, 'migrations-appliquees', `MIGRATIONS-EN-ECHEC ${messageDe((mig as { err: unknown }).err)}`);
  const ouv = await essayer(() => openStore({ dsn }));
  exige(ouv.ok, 'store-ouvert', `OUVERTURE-STORE-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`);
  const handle = (ouv as { ok: true; value: unknown }).value;
  STORE_HANDLES.push(handle);
  return handle;
}

async function ouvrirAutoriteBail(): Promise<unknown> {
  const openLeaseAuthority = requireRole('openLeaseAuthority');
  const ouv = await essayer(() => openLeaseAuthority({}));
  exige(ouv.ok, 'autorite-de-bail-ouverte', `OUVERTURE-BAIL-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`);
  const handle = (ouv as { ok: true; value: unknown }).value;
  LEASE_HANDLES.push(handle);
  return handle;
}

afterAll(async () => {
  const closeStore = resolveRole('closeStore').fn;
  if (closeStore !== undefined) {
    for (const h of [...STORE_HANDLES]) {
      try {
        await closeStore(h);
      } catch {
        /* la fermeture n'est pas l'objet des assertions ; la base est de toute facon droppee. */
      }
    }
  }
  const closeLeaseAuthority = resolveRole('closeLeaseAuthority').fn;
  if (closeLeaseAuthority !== undefined) {
    for (const h of [...LEASE_HANDLES]) {
      try {
        await closeLeaseAuthority(h);
      } catch {
        /* idem : non observe. */
      }
    }
  }
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

let compteur = 0;
function idFor(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${RUN}-${compteur}`;
}

/** Ouvre un store, un budget de plafond large et une reservation. `montant`
 * est une ENTREE de test (cf. II) : T25 ne verifie aucun montant, seulement
 * que `dispatchModelCallFenced` recoit des parametres de plomberie valides. */
async function preparerBudgetEtReservation(
  suffixe: string,
): Promise<{ handle: unknown; budgetId: string; reservationId: string }> {
  const handle = await ouvrirStore(suffixe);
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');

  const budgetId = idFor('bud');
  const ouv = await essayer(() => openBudget(handle, { budget_id: budgetId, limit: 100_000 }));
  exige(ouv.ok, 'budget-ouvert', `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`);

  const r = await essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: 500 }));
  exige(r.ok, 'reservation-acceptee', `RESERVATION-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`);
  const val = (r as { ok: true; value: Json }).value;
  const reservationId = val.reservation_id as string | undefined;
  exige(typeof reservationId === 'string', 'reservation-a-son-identifiant', `RESERVATION-SANS-IDENTIFIANT ${rendu(val)}`);

  return { handle, budgetId, reservationId: reservationId as string };
}

function paramsPourDispatch(overrides: Partial<Json> & { provider: unknown }): Json {
  return {
    model_call_id: idFor('call'),
    idempotency_key: idFor('idem'),
    provider: overrides.provider,
    request: { prompt: 'T25' },
    tariff: TARIF_TEST,
    ...overrides,
  };
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T25 — resister aux workers perimes et a l\'annulation', () => {
  test(
    'T25.A1 — worker A perime (jeton anterieur) : passerelle ET publication de checkpoint refusees en STALE_EXECUTION (cahier:L375)',
    async () => {
      assertPackageLoaded('workflows');
      assertPackageLoaded('activities');
      assertPackageLoaded('gateway');
      assertPackageLoaded('billing');
      assertPackageLoaded('storage');

      const resourceId = idFor('traj');
      const leaseHandle = await ouvrirAutoriteBail();
      const acquireLease = requireRole('acquireLease');
      const dispatchModelCallFenced = requireRole('dispatchModelCallFenced');
      const publishCheckpointActivity = requireRole('publishCheckpointActivity');
      const listPublishedCheckpoints = requireRole('listPublishedCheckpoints');
      const createFakeProvider = requireRole('createFakeProvider');

      let t = 1_000_000;

      // Worker A obtient le PREMIER jeton pour cette ressource.
      const octA = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-A', now: t }));
      exige(octA.ok, 'jeton-de-A-obtenu', `ACQUISITION-A-EN-ECHEC ${messageDe((octA as { err: unknown }).err)}`);
      const jetonA = (octA as { ok: true; value: Json }).value.token as number;

      t += 1_000;
      // Worker B obtient un SECOND jeton pour la MEME ressource (L375 :
      // « jeton 7, puis jeton 8 » — valeur non fixee, cf. II).
      const octB = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-B', now: t }));
      exige(octB.ok, 'jeton-de-B-obtenu', `ACQUISITION-B-EN-ECHEC ${messageDe((octB as { err: unknown }).err)}`);
      const jetonB = (octB as { ok: true; value: Json }).value.token as number;

      exige(
        typeof jetonA === 'number' && typeof jetonB === 'number' && jetonB > jetonA,
        'jeton-de-B-strictement-superieur-a-jeton-de-A (cahier:L375, propriete, pas la valeur — cf. II)',
        `jetonA=${rendu(jetonA)} jetonB=${rendu(jetonB)}`,
      );

      /* ── volet 1 : la passerelle ─────────────────────────────────────── */
      const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a1');
      const providerA = await essayer(() => createFakeProvider({ responses: [{ text: 'r-A', usage: USAGE_TEST }] }));
      exige(providerA.ok, 'fournisseur-A-cree', 'FOURNISSEUR-A-EN-ECHEC');
      const provA = (providerA as { ok: true; value: { complete: Fn; calls: number } }).value;

      const appelA = await essayer(() =>
        dispatchModelCallFenced(
          handle,
          paramsPourDispatch({ provider: provA, budget_id: budgetId, reservation_id: reservationId }),
          { leaseHandle, resourceId, token: jetonA, now: t },
        ),
      );
      exige(
        !appelA.ok,
        'appel-de-A-refuse-par-la-passerelle (decisif)',
        `APPEL-DE-A-A-TORT-ACCEPTE ${rendu((appelA as { value: unknown }).value)}`,
      );
      if (appelA.ok) return;
      const errA = (appelA as { ok: false; err: unknown }).err;
      exige(!MARQUEURS_DE_PLANTAGE.test(messageDe(errA)), 'refus-authentique-pas-un-plantage', messageDe(errA));
      exige(codeDe(errA) === CODE_STALE_EXECUTION, 'code=STALE_EXECUTION (cahier:L375)', `vu ${rendu(codeDe(errA))}`);
      exige(provA.calls === 0, 'fournisseur-jamais-contacte-par-A (admission bloquee)', `calls=${rendu(provA.calls)}`);

      // CONTROLE POSITIF (IV.1) : B, jeton COURANT, est accepte.
      const providerB = await essayer(() => createFakeProvider({ responses: [{ text: 'r-B', usage: USAGE_TEST }] }));
      exige(providerB.ok, 'fournisseur-B-cree', 'FOURNISSEUR-B-EN-ECHEC');
      const provB = (providerB as { ok: true; value: { complete: Fn; calls: number } }).value;
      const appelB = await essayer(() =>
        dispatchModelCallFenced(
          handle,
          paramsPourDispatch({ provider: provB, budget_id: budgetId, reservation_id: reservationId }),
          { leaseHandle, resourceId, token: jetonB, now: t },
        ),
      );
      exige(
        appelB.ok,
        'appel-de-B-accepte (controle positif, IV.1)',
        `APPEL-DE-B-A-TORT-REFUSE ${messageDe((appelB as { err: unknown }).err)}`,
      );
      exige(provB.calls === 1, 'fournisseur-contacte-par-B', `calls=${rendu(provB.calls)}`);

      /* ── volet 2 : la publication de checkpoint ──────────────────────── */
      const checkpointRefA = idFor('ckpt-a');
      const pubA = await essayer(() =>
        publishCheckpointActivity(leaseHandle, { resourceId, token: jetonA, now: t, checkpointRef: checkpointRefA }),
      );
      exige(
        !pubA.ok,
        'publication-de-checkpoint-de-A-refusee (decisif)',
        `PUBLICATION-DE-A-A-TORT-ACCEPTEE ${rendu((pubA as { value: unknown }).value)}`,
      );
      if (pubA.ok) return;
      const errPubA = (pubA as { ok: false; err: unknown }).err;
      exige(!MARQUEURS_DE_PLANTAGE.test(messageDe(errPubA)), 'refus-authentique-checkpoint-pas-un-plantage', messageDe(errPubA));
      exige(codeDe(errPubA) === CODE_STALE_EXECUTION, 'code=STALE_EXECUTION-checkpoint (cahier:L375)', `vu ${rendu(codeDe(errPubA))}`);

      const listeApresA = await essayer(() => listPublishedCheckpoints(leaseHandle, resourceId));
      exige(listeApresA.ok, 'lecture-checkpoints-publies-reussie', messageDe((listeApresA as { err: unknown }).err));
      const lA = (listeApresA as { ok: true; value: unknown }).value;
      exige(
        Array.isArray(lA) && !lA.includes(checkpointRefA),
        'checkpoint-de-A-jamais-enregistre-comme-publie (controle independant, IV.3)',
        `vu ${rendu(lA)}`,
      );

      // CONTROLE POSITIF : B, jeton COURANT, publie reellement.
      const checkpointRefB = idFor('ckpt-b');
      const pubB = await essayer(() =>
        publishCheckpointActivity(leaseHandle, { resourceId, token: jetonB, now: t, checkpointRef: checkpointRefB }),
      );
      exige(pubB.ok, 'publication-de-checkpoint-de-B-acceptee (controle positif)', messageDe((pubB as { err: unknown }).err));
      const listeApresB = await essayer(() => listPublishedCheckpoints(leaseHandle, resourceId));
      exige(listeApresB.ok, 'relecture-checkpoints-publies-reussie', messageDe((listeApresB as { err: unknown }).err));
      const lB = (listeApresB as { ok: true; value: unknown }).value;
      exige(Array.isArray(lB) && lB.includes(checkpointRefB), 'checkpoint-de-B-bien-enregistre', `vu ${rendu(lB)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T25.A2 — A n'ecrit pas sur les volumes restaures de B (cahier:L375, L321)",
    async () => {
      assertPackageLoaded('workflows');
      assertPackageLoaded('sandbox');

      const resourceId = idFor('traj');
      const leaseHandle = await ouvrirAutoriteBail();
      const acquireLease = requireRole('acquireLease');
      const writeToRestoredVolume = requireRole('writeToRestoredVolume');

      let t = 2_000_000;
      const octA = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-A', now: t }));
      exige(octA.ok, 'jeton-de-A-obtenu', messageDe((octA as { err: unknown }).err));
      const jetonA = (octA as { ok: true; value: Json }).value.token as number;

      t += 1_000;
      const octB = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-B', now: t }));
      exige(octB.ok, 'jeton-de-B-obtenu', messageDe((octB as { err: unknown }).err));
      const jetonB = (octB as { ok: true; value: Json }).value.token as number;
      exige(jetonB > jetonA, 'jeton-de-B-superieur-a-jeton-de-A', `jetonA=${rendu(jetonA)} jetonB=${rendu(jetonB)}`);

      const volumeDir = fs.mkdtempSync(path.join(os.tmpdir(), `t25-a2-${RUN}-`));

      // A (perime) tente d'ecrire dans le volume restaure de B.
      const cheminTemoinA = path.join(volumeDir, 'a-witness.txt');
      const ecritureA = await essayer(() =>
        writeToRestoredVolume(leaseHandle, { resourceId, token: jetonA, now: t, volumeDir, relPath: 'a-witness.txt', content: 'A-etait-la' }),
      );
      exige(ecritureA.ok, "l-appel-d-ecriture-de-A-ne-leve-pas (contrat III.10)", messageDe((ecritureA as { err: unknown }).err));
      const resA = (ecritureA as { ok: true; value: Json }).value;
      exige(resA.written === false, 'written=false-rapporte-pour-A', `vu ${rendu(resA.written)}`);

      // ASSERTION DECISIVE (absence, controle INDEPENDANT du champ auto-declare) :
      // le fichier temoin de A est ABSENT du volume.
      exige(
        !fs.existsSync(cheminTemoinA),
        'fichier-de-A-absent-du-volume-restaure-de-B (decisif, IV.2)',
        `fichier present a ${cheminTemoinA} : ${fs.existsSync(cheminTemoinA) ? fs.readFileSync(cheminTemoinA, 'utf8') : ''}`,
      );

      // CONTROLE POSITIF (IV.2) : B, jeton courant, ECRIT reellement.
      const cheminTemoinB = path.join(volumeDir, 'b-witness.txt');
      const ecritureB = await essayer(() =>
        writeToRestoredVolume(leaseHandle, { resourceId, token: jetonB, now: t, volumeDir, relPath: 'b-witness.txt', content: 'B-a-restaure' }),
      );
      exige(ecritureB.ok, "l-appel-d-ecriture-de-B-ne-leve-pas", messageDe((ecritureB as { err: unknown }).err));
      const resB = (ecritureB as { ok: true; value: Json }).value;
      exige(resB.written === true, 'written=true-rapporte-pour-B', `vu ${rendu(resB.written)}`);
      exige(
        fs.existsSync(cheminTemoinB) && fs.readFileSync(cheminTemoinB, 'utf8') === 'B-a-restaure',
        'fichier-de-B-present-avec-son-contenu-exact (controle positif, sans quoi une ecriture universellement bloquee passerait aussi A2)',
        `existsSync=${fs.existsSync(cheminTemoinB)} contenu=${fs.existsSync(cheminTemoinB) ? rendu(fs.readFileSync(cheminTemoinB, 'utf8')) : 'absent'}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T25.A3 — arret avec deux appels partis et trois en attente : annule les trois, conserve le suivi des deux (cahier:L373, L375, L99)',
    async () => {
      assertPackageLoaded('gateway');
      assertPackageLoaded('billing');
      assertPackageLoaded('storage');

      const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a3');
      const createFakeProvider = requireRole('createFakeProvider');
      const dispatchModelCall = requireRole('dispatchModelCall');
      const getModelCall = requireRole('getModelCall');
      const stopSession = requireRole('stopSession');

      // DEUX appels DEJA PARTIS (DISPATCH_STARTED ecrit, reponse perdue —
      // meme injection que T17.A6 : « potentiellement facture », L99).
      const dispatchedIds: string[] = [];
      for (let i = 0; i < DEUX_APPELS_PARTIS; i += 1) {
        const provider = await essayer(() => createFakeProvider({ responses: [{ text: `gone-${i}`, usage: USAGE_TEST }] }));
        exige(provider.ok, `fournisseur-parti-${i}-cree`, 'FOURNISSEUR-EN-ECHEC');
        const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;
        const modelCallId = idFor('gone');
        const panne = await essayer(() =>
          dispatchModelCall(
            handle,
            paramsPourDispatch({ provider: prov, budget_id: budgetId, reservation_id: reservationId, model_call_id: modelCallId }),
            { afterDispatchStarted: () => { throw new Error('panne simulee : appel deja parti, potentiellement facture'); } },
          ),
        );
        exige(!panne.ok, `appel-parti-${i}-observe-en-panne (DISPATCH_STARTED ecrit, cahier:L99)`, `A-TORT-REUSSI ${rendu((panne as { value: unknown }).value)}`);
        dispatchedIds.push(modelCallId);
      }

      // TROIS appels EN ATTENTE : jamais soumis a `dispatchModelCall`, donc
      // aucune trace durable n'existe encore pour eux (cahier:L375).
      const pendingIds = Array.from({ length: TROIS_EN_ATTENTE }, () => idFor('pending'));
      const pendingCalls = pendingIds.map((model_call_id) => ({ model_call_id }));

      const arret = await essayer(() => stopSession(handle, { pendingCalls, dispatchedModelCallIds: dispatchedIds }));
      exige(arret.ok, 'arret-de-session-execute-sans-lever (cahier:L373)', messageDe((arret as { err: unknown }).err));
      const { cancelled, tracked } = (arret as { ok: true; value: { cancelled: unknown; tracked: unknown } }).value;

      exige(Array.isArray(cancelled) && Array.isArray(tracked), 'cancelled-et-tracked-sont-des-tableaux', `vu ${rendu({ cancelled, tracked })}`);

      const tri = (xs: unknown[]): string[] => [...xs].map(String).sort();
      exige(
        JSON.stringify(tri(cancelled as unknown[])) === JSON.stringify(tri(pendingIds)),
        `les-${TROIS_EN_ATTENTE}-appels-en-attente-sont-annules (decisif, cahier:L375)`,
        `cancelled=${rendu(cancelled)} attendu=${rendu(pendingIds)}`,
      );
      exige(
        JSON.stringify(tri(tracked as unknown[])) === JSON.stringify(tri(dispatchedIds)),
        `les-${DEUX_APPELS_PARTIS}-appels-partis-restent-suivis (decisif, cahier:L375)`,
        `tracked=${rendu(tracked)} attendu=${rendu(dispatchedIds)}`,
      );

      // Verification INDEPENDANTE dans le journal durable lui-meme (IV.4) :
      // pas seulement ce que `stopSession` a declare, mais ce qu'il a ECRIT.
      for (const id of pendingIds) {
        const lu = await essayer(() => getModelCall(handle, { model_call_id: id }));
        exige(lu.ok, `lecture-journal-${id}-reussie`, messageDe((lu as { err: unknown }).err));
        const rec = (lu as { ok: true; value: Json | null }).value;
        exige(
          rec !== null && rec.status === ETAT_CANCELLED_BEFORE_DISPATCH,
          `${id}-porte-CANCELLED_BEFORE_DISPATCH-dans-le-journal (cahier:L99)`,
          `vu ${rendu(rec)}`,
        );
      }
      for (const id of dispatchedIds) {
        const lu = await essayer(() => getModelCall(handle, { model_call_id: id }));
        exige(lu.ok, `lecture-journal-${id}-reussie`, messageDe((lu as { err: unknown }).err));
        const rec = (lu as { ok: true; value: Json | null }).value;
        exige(
          rec !== null && rec.status !== ETAT_CANCELLED_BEFORE_DISPATCH,
          `${id}-n-est-PAS-annule-dans-le-journal (cahier:L375 : « conserve le suivi »)`,
          `vu ${rendu(rec)}`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T25.A4 — aucun nouvel appel admis apres revocation (cahier:L375)',
    async () => {
      assertPackageLoaded('workflows');
      assertPackageLoaded('gateway');
      assertPackageLoaded('billing');
      assertPackageLoaded('storage');

      const resourceId = idFor('traj');
      const leaseHandle = await ouvrirAutoriteBail();
      const acquireLease = requireRole('acquireLease');
      const revokeLease = requireRole('revokeLease');
      const dispatchModelCallFenced = requireRole('dispatchModelCallFenced');
      const getModelCall = requireRole('getModelCall');
      const createFakeProvider = requireRole('createFakeProvider');

      let t = 3_000_000;
      const oct = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-A', now: t }));
      exige(oct.ok, 'jeton-obtenu', messageDe((oct as { err: unknown }).err));
      const jeton = (oct as { ok: true; value: Json }).value.token as number;

      t += 500;
      const rev = await essayer(() => revokeLease(leaseHandle, { resourceId, now: t }));
      exige(rev.ok, 'revocation-executee-sans-lever', messageDe((rev as { err: unknown }).err));

      const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a4');
      const provider = await essayer(() => createFakeProvider({ responses: [{ text: 'apres-revocation', usage: USAGE_TEST }] }));
      exige(provider.ok, 'fournisseur-cree', 'FOURNISSEUR-EN-ECHEC');
      const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

      const modelCallId = idFor('call');
      const tentative = await essayer(() =>
        dispatchModelCallFenced(
          handle,
          paramsPourDispatch({ provider: prov, budget_id: budgetId, reservation_id: reservationId, model_call_id: modelCallId }),
          { leaseHandle, resourceId, token: jeton, now: t },
        ),
      );

      // ASSERTION DECISIVE (absence) : le fournisseur factice n'a JAMAIS ete
      // contacte — qu'il s'agisse d'un rejet type ou d'une autre forme de
      // refus, la meme perturbation (retirer le controle de revocation) rend
      // ce compteur > 0 (cf. cases.lock.json).
      exige(
        prov.calls === 0,
        "aucun-nouvel-appel-n-atteint-le-fournisseur-apres-revocation (decisif, IV.2)",
        `calls=${rendu(prov.calls)} resultat=${tentative.ok ? rendu((tentative as { value: unknown }).value) : messageDe((tentative as { err: unknown }).err)}`,
      );

      if (!tentative.ok) {
        const err = (tentative as { ok: false; err: unknown }).err;
        exige(!MARQUEURS_DE_PLANTAGE.test(messageDe(err)), 'si-refus-alors-authentique-pas-un-plantage', messageDe(err));
        exige(codeDe(err) === CODE_STALE_EXECUTION, 'si-refus-alors-code=STALE_EXECUTION', `vu ${rendu(codeDe(err))}`);
      }

      // Controle independant supplementaire : aucun enregistrement durable
      // n'a ete cree pour cette tentative.
      const lu = await essayer(() => getModelCall(handle, { model_call_id: modelCallId }));
      exige(lu.ok, 'lecture-journal-reussie', messageDe((lu as { err: unknown }).err));
      exige(
        (lu as { ok: true; value: Json | null }).value === null,
        'aucun-enregistrement-durable-cree-pour-l-appel-revoque',
        `vu ${rendu((lu as { ok: true; value: Json | null }).value)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T25.A5 — appel ancien potentiellement facture reste dans le journal malgre l\'annulation (cahier:L375, L67, L69, L99)',
    async () => {
      assertPackageLoaded('workflows');
      assertPackageLoaded('gateway');
      assertPackageLoaded('billing');
      assertPackageLoaded('storage');

      const resourceId = idFor('traj');
      const leaseHandle = await ouvrirAutoriteBail();
      const acquireLease = requireRole('acquireLease');
      const revokeLease = requireRole('revokeLease');
      const dispatchModelCallFenced = requireRole('dispatchModelCallFenced');
      const getModelCall = requireRole('getModelCall');
      const createFakeProvider = requireRole('createFakeProvider');

      let t = 4_000_000;
      const oct = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-A', now: t }));
      exige(oct.ok, 'jeton-obtenu', messageDe((oct as { err: unknown }).err));
      const jeton = (oct as { ok: true; value: Json }).value.token as number;

      const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a5');
      const provider = await essayer(() => createFakeProvider({ responses: [{ text: 'ancien-appel', usage: USAGE_TEST }] }));
      exige(provider.ok, 'fournisseur-cree', 'FOURNISSEUR-EN-ECHEC');
      const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;

      const modelCallId = idFor('call');
      // Reponse PERDUE apres facturation (L69) — l'appel reste AMBIGU
      // (UNKNOWN, L99), pendant que son jeton est encore valide.
      const panne = await essayer(() =>
        dispatchModelCallFenced(
          handle,
          paramsPourDispatch({ provider: prov, budget_id: budgetId, reservation_id: reservationId, model_call_id: modelCallId }),
          { leaseHandle, resourceId, token: jeton, now: t },
          { afterProviderResponse: () => { throw new Error('panne simulee : reponse recue, non sauvegardee'); } },
        ),
      );
      exige(!panne.ok, 'panne-observee-reponse-perdue', `A-TORT-REUSSI ${rendu((panne as { value: unknown }).value)}`);

      const avant = await essayer(() => getModelCall(handle, { model_call_id: modelCallId }));
      exige(avant.ok, 'lecture-avant-annulation-reussie', messageDe((avant as { err: unknown }).err));
      const recAvant = (avant as { ok: true; value: Json | null }).value;
      exige(recAvant !== null && recAvant.status === ETAT_UNKNOWN, 'appel-ambigu-UNKNOWN-avant-annulation (cahier:L99)', `vu ${rendu(recAvant)}`);

      // ANNULATION EXPLICITE (revocation du bail — L67, L69, L373) : elle ne
      // doit JAMAIS purger le journal des couts potentiels.
      t += 1_000;
      const rev = await essayer(() => revokeLease(leaseHandle, { resourceId, now: t }));
      exige(rev.ok, 'revocation-executee-sans-lever', messageDe((rev as { err: unknown }).err));

      // ASSERTION DECISIVE : l'enregistrement SURVIT a l'annulation, avec le
      // MEME statut ambigu — pas supprime, pas efface, pas reinterprete.
      const apres = await essayer(() => getModelCall(handle, { model_call_id: modelCallId }));
      exige(apres.ok, 'lecture-apres-annulation-reussie', messageDe((apres as { err: unknown }).err));
      const recApres = (apres as { ok: true; value: Json | null }).value;
      exige(
        recApres !== null,
        "l-appel-ancien-potentiellement-facture-reste-dans-le-journal (decisif, cahier:L375)",
        `enregistrement absent apres annulation (avant annulation : ${rendu(recAvant)})`,
      );
      exige(
        recApres !== null && recApres.status === ETAT_UNKNOWN,
        'statut-reste-UNKNOWN-non-efface-par-l-annulation (cahier:L99, L69)',
        `vu ${rendu(recApres)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T25.A6 — un heartbeat tardif ne reactive pas le jeton de A (cahier:L375, L377)',
    async () => {
      assertPackageLoaded('workflows');

      const resourceId = idFor('traj');
      const leaseHandle = await ouvrirAutoriteBail();
      const acquireLease = requireRole('acquireLease');
      const heartbeatLease = requireRole('heartbeatLease');

      let t = 5_000_000;
      const octA = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-A', now: t }));
      exige(octA.ok, 'jeton-de-A-obtenu', messageDe((octA as { err: unknown }).err));
      const jetonA = (octA as { ok: true; value: Json }).value.token as number;

      t += 1_000;
      const octB = await essayer(() => acquireLease(leaseHandle, { resourceId, holderId: 'worker-B', now: t }));
      exige(octB.ok, 'jeton-de-B-obtenu', messageDe((octB as { err: unknown }).err));
      const jetonB = (octB as { ok: true; value: Json }).value.token as number;
      exige(jetonB > jetonA, 'jeton-de-B-superieur-a-jeton-de-A', `jetonA=${rendu(jetonA)} jetonB=${rendu(jetonB)}`);

      // Heartbeat TARDIF de A, horloge AVANCEE (sans attente reelle, L377),
      // portant l'ANCIEN jeton.
      t += 60_000;
      const battementA = await essayer(() => heartbeatLease(leaseHandle, { resourceId, token: jetonA, now: t }));
      exige(battementA.ok, 'heartbeat-de-A-ne-leve-pas (contrat III.3 : refus type, pas exception)', messageDe((battementA as { err: unknown }).err));
      const resA = (battementA as { ok: true; value: Json }).value;

      exige(resA.accepted === false, 'heartbeat-tardif-de-A-refuse (decisif, cahier:L375)', `vu ${rendu(resA)}`);
      exige(resA.code === CODE_STALE_EXECUTION, 'code=STALE_EXECUTION-sur-le-heartbeat-refuse', `vu ${rendu(resA.code)}`);
      exige(
        resA.currentToken === jetonB,
        'le-jeton-courant-reste-celui-de-B-jeton-de-A-non-reactive (decisif, cahier:L375)',
        `currentToken vu ${rendu(resA.currentToken)} attendu jetonB=${rendu(jetonB)}`,
      );

      // CONTROLE POSITIF (IV.1) : un heartbeat portant le jeton COURANT (B)
      // est accepte — sans quoi un refus universel verdirait A6 a bon compte.
      const battementB = await essayer(() => heartbeatLease(leaseHandle, { resourceId, token: jetonB, now: t }));
      exige(battementB.ok, 'heartbeat-de-B-ne-leve-pas', messageDe((battementB as { err: unknown }).err));
      const resB = (battementB as { ok: true; value: Json }).value;
      exige(resB.accepted === true, 'heartbeat-courant-de-B-accepte (controle positif)', `vu ${rendu(resB)}`);
      exige(resB.currentToken === jetonB, 'currentToken-reste-jetonB-apres-acceptation', `vu ${rendu(resB.currentToken)}`);
    },
    CASE_TIMEOUT_MS,
  );
});
