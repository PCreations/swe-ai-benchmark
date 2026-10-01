/**
 * acceptance/T26.spec.ts — suite d'acceptation de la tache T26.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T26.A1 numeric   — dix appels prets, plafond deux et fournisseur bloque
 *                      par barriere donnent deux appels actifs et huit en
 *                      attente
 *   T26.A2 numeric   — liberer un slot n'en admet qu'un
 *   T26.A3 behaviour — ordre de file annonce respecte
 *   T26.A4 refusal   — Retry-After=4 interdit tout nouvel essai avant quatre
 *                      secondes d'horloge controlee
 *   T26.A5 behaviour — la consommation attendue est identique avec un, deux
 *                      ou six workers pour des agents scriptes
 *   T26.A6 behaviour — temps en file et temps actif sont enregistres
 *                      separement
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T26 — `packages/gateway`,
 * `packages/workflows` et `packages/activities` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline
 * auditable au diff, pas une barriere technique). Le contrat teste ci-dessous
 * est derive de docs/specs/T26.md, c'est-a-dire des lignes du cahier que la
 * carte de specification epingle sur T26 :
 *
 *   L379  titre : « Reguler le parallelisme et les quotas equitablement ».
 *   L381  dependances T03, T17, T24 et T25 ; livrables MOT POUR MOT :
 *         « admission globale, quotas par fournisseur, ordre d'affectation
 *         seede et metriques de file ».
 *   L383  les six cas d'acceptation, mot pour mot — seule ligne qui chiffre
 *         « dix », « deux », « huit », « Retry-After=4 », « quatre secondes »
 *         et « un, deux ou six workers ».
 *   L385  fin : « aucun depassement du nombre maximal observe. Les tests
 *         n'exigent pas une duree murale identique ni que la meme
 *         transaction remporte une course lorsque l'ordre n'est pas
 *         specifie. La file d'admission suit une politique fixe,
 *         independante des scores. » — fonde le choix (section IV) d'une
 *         horloge ENTIEREMENT explicite (jamais `Date.now()`, jamais de
 *         course sur une resolution de promesse) et d'un ordre d'affectation
 *         ANNONCE puis verifie, plutot que devine depuis la latence reelle.
 *   L36-L59 (table C) : « `packages/gateway` | Passerelle modeles, outils,
 *         QUOTAS et journal d'appel » — fonde le choix (section III) de
 *         placer la politique de recul fournisseur (Retry-After) dans
 *         `packages/gateway`, aux cotes de `createFakeProvider` et
 *         `dispatchModelCall` deja fixes par T17 ; « `packages/workflows` |
 *         Orchestration Temporal deterministe » — fonde le choix de placer
 *         la coordination d'admission (comptage, ordre, metriques) dans
 *         `packages/workflows`, aux cotes de `openLeaseAuthority` deja fixe
 *         par T25 ; « `packages/activities` | Effets externes des
 *         workflows » — fonde le choix de placer l'effet qui execute
 *         reellement un appel une fois admis dans `packages/activities`.
 *   L365  (T24, L361-L369) : « les appels externes se trouvent dans les
 *         Activities » — deja repris par T25 pour `publishCheckpointActivity`
 *         ; fonde ici `runAdmittedEffect`.
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         barrieres et points d'injection nommes [...] les checks
 *         d'integration utilisent reellement PostgreSQL [...] lorsque le
 *         contrat porte sur ces composants » — autorise PostgreSQL reel pour
 *         A5 (comptabilite budgetaire, deja etablie par T16/T17) et
 *         l'horloge entierement simulee des cinq autres cas.
 *   L28   un prerequis absent produit BLOCKED, jamais PASS ni FAILED — cette
 *         suite ne confond jamais une commande absente (controle
 *         d'infrastructure, hors de son ressort) avec un verdict metier.
 *   L301  T17 (dependance) : « journal durable d'appel, fournisseur factice
 *         avec compteurs [...] » — `createFakeProvider`/`dispatchModelCall`
 *         repris TELS QUELS (acceptance/T17.spec.ts), jamais rouverts ici.
 *   L295  T16 (dependance, via T17) : `openBudget`/`reserveBudget`/
 *         `getBudgetState` deja fixes par acceptance/T16.spec.ts.
 *   L9    invariant du cahier : « 44 taches [...] cas de reservation et
 *         montants sont des donnees de test fictives » — fonde les
 *         constantes de tarif/usage fabriquees en section II.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion a l'une de DEUX provenances :
 *
 * (a) LITTERAUX RELEVES DANS LE CAHIER (`// cahier:L383`) :
 *       10 — « dix appels prets »                                      A1
 *       2  — « plafond deux »                                          A1
 *       2  — « deux appels actifs »                                    A1
 *       8  — « huit en attente »                                       A1
 *       1  — « n'en admet qu'un »                                      A2
 *       4  — « Retry-After=4 » / « quatre secondes »                   A4
 *       1, 2, 6 — « un, deux ou six workers »                          A5
 *
 * (b) AUCUNE RACINE GELEE (acceptance/reference/**) N'EST CONSOMMEE : comme
 *     pour T19/T25, le cahier ne scelle aucune valeur numerique ou enum
 *     propre a T26 au-dela des sept nombres ci-dessus — §H ne nomme aucun
 *     export ni code de refus specifique a T26.
 *
 * FABRIQUE PAR CETTE SUITE, ET SERVANT D'ENTREE JAMAIS DE VALEUR ATTENDUE :
 * les dix-huit noms d'export de la section III, l'unite de l'horloge
 * logique (entier arbitraire interprete en MILLISECONDES — le cahier ne fixe
 * pas d'unite, seulement « horloge controlee »), les identifiants de
 * campagne/appel/fournisseur/budget/reservation, la grille tarifaire
 * factice `TARIF_TEST`/`USAGE_TEST` (qui ne reproduit aucune valeur de
 * F-MONEY — T26 ne verifie aucun montant absolu, seulement une EGALITE entre
 * trois executions), et la graine numerique passee a `openAdmissionQueue`.
 * Le code de refus `STALE... ` n'est pas reinvente ici ; T26 n'a besoin
 * d'aucun code de refus specifique (A4 observe une NON-admission par
 * l'absence de resolution d'une promesse et par `isProviderAdmissible`, pas
 * par une exception typee).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T26 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Les paquets interroges sont `packages/workflows`, `packages/gateway`,
 * `packages/activities` (les `source_paths` que le registre declare pour
 * T26, FIXES ICI), plus `packages/billing` et `packages/storage` (deja fixes
 * par acceptance/T16.spec.ts et acceptance/T12.spec.ts, repris TELS QUELS
 * pour A5 uniquement). Le chargement ne LEVE jamais : chaque cas asserte
 * lui-meme le chargement des paquets dont il a besoin, en les NOMMANT.
 * Les noms sont resolus par ROLE, pas par paquet precis (meme geste que
 * T17/T19/T25) : seul le CONTRAT OBSERVABLE compte.
 *
 * UN HANDLE UNIQUE, PARTAGE ENTRE LES TROIS PAQUETS (meme geste que le
 * `leaseHandle` de T25) : `openAdmissionQueue` rend un `QueueHandle` opaque,
 * passe TEL QUEL aux fonctions de `packages/gateway` et `packages/activities`
 * ci-dessous — c'est le MEME etat d'admission qui est lu et ecrit des trois
 * paquets, jamais trois etats independants.
 *
 * `packages/workflows` — LA COORDINATION D'ADMISSION (NOUVEAU, T26) :
 *
 * 1. `openAdmissionQueue({ cap, seed })` -> `Promise<QueueHandle>`.
 *    `cap` (entier >= 1) est le nombre maximal d'appels simultanement ACTIFS
 *    pour un `providerId` donne (L36-L59 : « quotas par fournisseur » ; cette
 *    suite n'instancie qu'UN SEUL `providerId` par cas, donc `cap` y joue
 *    aussi le role du plafond GLOBAL de L383 — aucun cas requis ne distingue
 *    les deux quand un seul fournisseur est en jeu). `seed` (entier) derive
 *    l'ordre d'affectation de (6).
 *
 * 2. `submitReadyCall(handle, { callId, providerId, now })` ->
 *    `Promise<{ callId, admitted: Promise<{ admittedAt: number }> }>`.
 *    Enregistre l'appel comme PRET. NE LEVE JAMAIS. La promesse `admitted`
 *    se resout DES QUE le fournisseur `providerId` a un slot libre (moins de
 *    `cap` appels actifs) ET n'est pas en recul (cf. 8/9) — IMMEDIATEMENT si
 *    les deux conditions tiennent deja au moment de l'appel, sinon plus
 *    tard, quand (3) ou (7) la font tenir.
 *
 * 3. `releaseCall(handle, { callId, now })` -> `Promise<{ released: boolean
 *    }>`. Libere le slot tenu par `callId` (prealablement admis). AVANT que
 *    la promesse rendue ne se resolve, reevalue la file d'attente de ce
 *    `providerId` et admet, dans l'ORDRE ANNONCE par (6), EXACTEMENT UN
 *    appel en attente desormais eligible (L383, A2 : « liberer un slot n'en
 *    admet qu'un »).
 *
 * 4. `getQueueSnapshot(handle)` -> `Promise<{ active: number; waiting:
 *    number }>`. Lecture non destructive de l'etat courant (A1, A2).
 *
 * 5. `pumpAdmission(handle, { now })` -> `Promise<{ admitted: string[] }>`.
 *    Reevalue la file a l'instant `now` SANS qu'aucun appel ne vienne d'etre
 *    soumis ni libere — le seul moyen d'observer qu'un recul fournisseur
 *    expire SANS attente fragile au temps reel (L141, L377 repris de T25) :
 *    aucun minuteur interne n'existe, c'est cette fonction qui fait avancer
 *    l'horloge logique de l'admission. Rend les `callId` nouvellement admis.
 *
 * 6. `announceAssignmentOrder(handle, callIds)` -> `Promise<string[]>`.
 *    PURE, SANS EFFET DE BORD : etant donne un lot de `callId`, rend l'ordre
 *    dans lequel l'admission les servira une fois qu'ils seront simultanement
 *    en attente pour le MEME `providerId`, derive de `seed` (L381 : « ordre
 *    d'affectation seede »). Cette fonction est un export SEPARE du moteur
 *    d'admission reel — A3 verifie leur SYNCHRONISATION, pas seulement
 *    l'existence de chacun.
 *
 * 7. `getCallTimings(handle, callId)` -> `Promise<{ queuedAt: number;
 *    admittedAt: number | null; releasedAt: number | null; timeInQueue:
 *    number | null; timeActive: number | null }>`. `timeInQueue =
 *    admittedAt - queuedAt` ; `timeActive = releasedAt - admittedAt` — DEUX
 *    CHAMPS DISTINCTS (L383, A6 : « temps en file et temps actif [...]
 *    enregistres separement »), `null` tant que l'evenement correspondant ne
 *    s'est pas produit.
 *
 * 8. `closeAdmissionQueue(handle)` -> `Promise<void>` (optionnel, meme
 *    discipline tolerante que `closeLeaseAuthority` de T25).
 *
 * `packages/gateway` — QUOTAS ET RECUL FOURNISSEUR (L36-L59 : responsabilite
 * deja nommee pour ce paquet ; additifs a T17, ne touche ni ne reouvre
 * `createFakeProvider`/`dispatchModelCall` deja fixes par
 * acceptance/T17.spec.ts) :
 *
 * 9. `recordProviderBackoff(handle, { providerId, retryAfterSeconds, now })`
 *    -> `Promise<void>`. Enregistre qu'a l'instant `now`, `providerId` a
 *    signale un recul de `retryAfterSeconds` SECONDES (L383 : « Retry-
 *    After=4 ») — `providerId` devient inadmissible jusqu'a
 *    `now + retryAfterSeconds * 1000` (unite FIXEE ICI, cf. II) INCLUS.
 *
 * 10. `isProviderAdmissible(handle, { providerId, now })` -> `Promise<
 *     boolean>`. NE LEVE JAMAIS. `false` strictement avant la fin du recul
 *     enregistre par (9), `true` au moment ou a partir de cet instant (et en
 *     l'absence de tout recul enregistre).
 *
 * `packages/activities` — L'EFFET EXTERNE ADMIS (NOUVEAU, T26 ; cf. L365) :
 *
 * 11. `runAdmittedEffect(handle, { callId, providerId, now }, effect)` ->
 *     `Promise<T>` ou `effect: () => Promise<T>`. Appelle (2) pour `callId`,
 *     ATTEND que l'admission soit accordee, puis ET SEULEMENT ALORS invoque
 *     `effect()` — jamais avant. Que `effect()` reussisse ou echoue, libere
 *     ensuite le slot via (3) avec le MEME `now`, puis repercute le resultat
 *     ou l'erreur de `effect()` sans la transformer. C'est le point unique
 *     ou « l'appel externe » (L365) a lieu, une fois l'admission accordee —
 *     jamais avant, ce que A1 verifie via un compteur INDEPENDANT du
 *     fournisseur lui-meme (section IV).
 *
 * Roles repris tels quels de `packages/gateway` (fixes par
 * acceptance/T17.spec.ts) : `createFakeProvider`, `dispatchModelCall`. Roles
 * repris tels quels de `packages/billing` (fixes par acceptance/T16.spec.ts) :
 * `openBudget`, `reserveBudget`, `getBudgetState`. Roles repris tels quels de
 * `packages/storage` (fixes par acceptance/T12.spec.ts) : `applyMigrations`,
 * `openStore`, `closeStore`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T26, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 EST UN CAS `numeric` SUR UN COMPTAGE QUI POURRAIT ETRE MENTI : une
 *     implementation pourrait rendre `getQueueSnapshot` correct (2 actifs /
 *     8 en attente) SANS reellement limiter les appels au FOURNISSEUR lui-
 *     meme. Cette suite ne fait donc pas confiance a (4) seule : elle
 *     construit son PROPRE fournisseur factice bloquant (« barriere »,
 *     cahier L383) dont le compteur d'appels REELLEMENT recus est
 *     INDEPENDANT de l'admission — si (4) ment, ce compteur la contredit. Ce
 *     fournisseur est FABRIQUE PAR CETTE SUITE (pas `createFakeProvider` de
 *     T17, dont le contrat etabli ne promet aucun mecanisme de blocage) :
 *     cf. section « fabrique » ci-dessous.
 * (2) A2 EST ISOLE D'UN BIAIS POSSIBLE DE A1 PAR UNE ASSERTION EN DELTA : si
 *     l'admission initiale admettait deja TROP d'appels (un bogue distinct,
 *     couvert par A1), une assertion de A2 qui comparerait a une valeur
 *     ABSOLUE ('2 actifs') tomberait pour la MAUVAISE raison. A2 compare
 *     donc l'etat AVANT et APRES liberation EN DELTA (« actif inchange,
 *     attente moins un ») — la mutation ciblee par A2 (drainage qui admet
 *     deux appels pour une liberation) reste seule a faire tomber cette
 *     delta-la, meme si l'admission initiale etait par ailleurs fautive.
 * (3) A3/A6 PARTAGENT LA MEME BARRIERE DE CAPACITE QUE A1 (`cap`) : une
 *     mutation de la regle d'admission (A1) peut, EN PLUS de A1, faire
 *     tomber A3 et A6 si elle admet un appel de trop des la soumission —
 *     c'est assume et documente dans verification/mutants/T26.json
 *     (`tue_aussi`), au lieu d'etre dissimule par une suite qui eviterait
 *     tout plafond bas.
 * (4) A4 EST UN CAS `refusal` : LE DANGER DECISIF generique (cases.lock.json
 *     le nomme : « un stub qui leve ou ne dispatche rien laisserait
 *     l'assertion faussement verte ») est qu'une implementation qui
 *     N'ADMETTRAIT JAMAIS PLUS RIEN rendrait le cas vert sans rien prouver.
 *     Cette suite porte donc un CONTROLE POSITIF dans le MEME test :
 *     `isProviderAdmissible` ET l'admission reelle doivent redevenir vraies
 *     PILE au terme des quatre secondes, pas rester fausses indefiniment.
 * (5) A5 : UN STUB CONSTANT NE SUFFIRAIT PAS (cases.lock.json le dit
 *     explicitement) — trois executions qui renverraient toujours le meme
 *     cout FORFAITAIRE resteraient egales sans rien prouver sur le
 *     parallelisme. Cette suite fait donc REELLEMENT executer 6 appels
 *     factices a cout non nul via `dispatchModelCall`/`reserveBudget` reels
 *     (PostgreSQL reel, L141) sous 1, 2 puis 6 « travailleurs » (fonctions
 *     concurrentes cote TEST, jamais cote SUT), et exige en PLUS que la
 *     depense totale soit STRICTEMENT POSITIVE avant de comparer les trois
 *     — sans quoi un cas ou les trois executions echoueraient silencieusement
 *     a zero passerait aussi l'egalite.
 * (6) A6 : UN STUB QUI RENVERRAIT TOUJOURS LA MEME DUREE POUR LES DEUX CHAMPS
 *     serait demasque par la construction du scenario : `timeInQueue` et
 *     `timeActive` y sont fixes a des valeurs EXPLICITEMENT DIFFERENTES
 *     (2500 vs 5000) par l'horloge que cette suite pilote elle-meme — une
 *     implementation qui fusionnerait les deux champs ne pourrait pas
 *     rendre les deux valeurs correctement a la fois.
 * (7) AUCUNE ATTENTE FRAGILE AU TEMPS REEL (L141, L377 de T25) : tout `now`
 *     transmis est une valeur ENTIERE choisie et avancee par cette suite —
 *     jamais `Date.now()`. Le seul arret reel sur l'horloge de la machine
 *     est le vidage de microtaches (`tick()`, section socle), necessaire
 *     pour observer un etat deja decide par le SUT, jamais pour ATTENDRE
 *     qu'il se decide.
 * (8) ISOLATION ENTRE CAS : chaque cas ouvre sa PROPRE file d'admission
 *     (`openAdmissionQueue` frais) et ses propres identifiants aleatoires
 *     (meme discipline que T12/T21/T23/T24/T25).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle n'exige PAS que l'admission passe par un serveur Temporal reel ni
 *    par `temporal-timeskip` : comme T25 (L377), la regulation du
 *    parallelisme decrite par L383 est verifiee par des horloges et
 *    barrieres ENTIEREMENT controlees par le test, jamais par un service de
 *    scheduling reel — l'invariant L32 (« les workflows [...] sont des
 *    programmes deterministes ») n'impose pas que CE controle d'acceptation
 *    engage un moteur Temporal particulier, seulement que le resultat le
 *    soit.
 *  • Elle ne teste pas deux `providerId` distincts avec des plafonds
 *    differents : aucun cas requis de L383 ne l'exige (cf. III.1) ; «
 *    quotas par fournisseur » est realise par construction (le plafond est
 *    attache a un `providerId`), pas demontre sur plusieurs fournisseurs a
 *    la fois.
 *  • Elle ne reprouve pas le calcul de cout, l'idempotence logique ni la
 *    reconciliation de T17 : `dispatchModelCall` reste EXACTEMENT le contrat
 *    deja fixe par acceptance/T17.spec.ts ; A5 l'utilise comme un EFFET
 *    ordinaire sous admission, jamais une modification de ce qui existait.
 *  • Elle ne verifie aucune duree murale ni l'ordre de resolution de
 *    promesses concurrentes sans plafond : L385 le dit explicitement
 *    (« les tests n'exigent pas une duree murale identique ni que la meme
 *    transaction remporte une course lorsque l'ordre n'est pas specifie »).
 *  • Elle ne fixe aucune valeur absolue de cout pour A5 (cf. II) : seule
 *    l'EGALITE entre trois executions est exigee, jamais un montant precis.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

const DIX_APPELS_PRETS = 10; // cahier:L383 — « dix appels prets »
const PLAFOND_DEUX = 2; // cahier:L383 — « plafond deux »
const DEUX_ACTIFS = 2; // cahier:L383 — « deux appels actifs »
const HUIT_EN_ATTENTE = 8; // cahier:L383 — « huit en attente »
const UN_SEUL_ADMIS = 1; // cahier:L383 — « n'en admet qu'un »
const RETRY_AFTER_SECONDES = 4; // cahier:L383 — « Retry-After=4 », « quatre secondes »
const WORKERS_TESTES = [1, 2, 6] as const; // cahier:L383 — « un, deux ou six workers »

/** Grille tarifaire et usage FACTICES — entree de test (cf. II), T26 ne
 * verifie aucun montant absolu : seule l'EGALITE entre trois executions
 * (A5) est exigee. */
const TARIF_TEST = { input_uncached_per_token: 3, input_cached_per_token: 1, output_per_token: 2 };
const USAGE_TEST = { input_uncached_tokens: 2, input_cached_tokens: 1, output_tokens: 1 };

/* ══════════════════════════ PostgreSQL reel (requires: postgres18, L141) ═
 * Uniquement necessaire pour A5 (comptabilite budgetaire reelle). Les cinq
 * autres cas n'ouvrent jamais de base : pure coordination d'admission. */

const RUN = `t26_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

const PACKAGES = ['workflows', 'gateway', 'activities', 'billing', 'storage'] as const;

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
  getBudgetState: [
    'getBudgetState', 'budgetState', 'readBudgetState', 'getBudget', 'budgetSnapshot', 'readBudget',
  ],
  // packages/gateway — repris tels quels de acceptance/T17.spec.ts.
  createFakeProvider: [
    'createFakeProvider', 'makeFakeProvider', 'newFakeProvider', 'fakeProvider',
  ],
  dispatchModelCall: [
    'dispatchModelCall', 'dispatchCall', 'dispatch', 'sendModelCall', 'executeModelCall',
  ],
  // packages/gateway — FIXES PAR CETTE SUITE (T26, quotas et recul, section III).
  recordProviderBackoff: [
    'recordProviderBackoff', 'registerProviderBackoff', 'noteProviderBackoff',
    'setProviderBackoff', 'recordRetryAfter', 'applyProviderBackoff',
  ],
  isProviderAdmissible: [
    'isProviderAdmissible', 'providerAdmissible', 'canAdmitProvider',
    'isProviderReady', 'providerIsAdmissible',
  ],
  // packages/workflows — FIXES PAR CETTE SUITE (T26, admission, section III).
  openAdmissionQueue: [
    'openAdmissionQueue', 'createAdmissionQueue', 'openAdmissionAuthority',
    'createAdmissionAuthority', 'openAdmissionController', 'createAdmissionController',
  ],
  submitReadyCall: [
    'submitReadyCall', 'submitCall', 'enqueueReadyCall', 'submitAdmissionRequest',
    'registerReadyCall', 'enqueueCall',
  ],
  releaseCall: [
    'releaseCall', 'releaseAdmission', 'releaseSlot', 'completeCall', 'releaseAdmittedCall',
  ],
  getQueueSnapshot: [
    'getQueueSnapshot', 'queueSnapshot', 'getAdmissionSnapshot', 'snapshotQueue', 'readQueueSnapshot',
  ],
  pumpAdmission: [
    'pumpAdmission', 'advanceAdmissionClock', 'tickAdmission', 'pumpAdmissionQueue', 'reevaluateAdmission',
  ],
  announceAssignmentOrder: [
    'announceAssignmentOrder', 'computeAssignmentOrder', 'announcedOrder',
    'seededAssignmentOrder', 'getAnnouncedOrder',
  ],
  getCallTimings: [
    'getCallTimings', 'callTimings', 'getQueueTimings', 'readCallTimings', 'getCallMetrics',
  ],
  closeAdmissionQueue: [
    'closeAdmissionQueue', 'closeAdmissionAuthority', 'closeAdmissionController',
  ],
  // packages/activities — FIXE PAR CETTE SUITE (T26, effet externe admis, section III).
  runAdmittedEffect: [
    'runAdmittedEffect', 'performAdmittedEffect', 'runAdmittedCall',
    'executeAdmittedEffect', 'dispatchAdmittedEffect',
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

/* ══════════════ horloge de test : vider les microtaches, jamais attendre ═
 *
 * Aucun minuteur reel n'est utilise pour decider un resultat (L141/L377) :
 * `tick()` laisse simplement les continuations DEJA programmees s'executer
 * (y compris une chaine de plusieurs `.then()`), via une macrotache
 * (`setImmediate`) qui, dans Node, ne s'execute qu'apres TOUTES les
 * microtaches en attente. */
async function tick(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await new Promise<void>((r) => {
    setImmediate(r);
  });
}

/** Attache un indicateur bool a chaque promesse `admitted` d'un lot de
 * tickets, pour observer SANS COURSE lesquels sont deja resolus apres un
 * `tick()` (A1, A2, A3). */
function suivreAdmission(tickets: Array<{ callId: string; admitted: Promise<unknown> }>): boolean[] {
  const resolus = new Array<boolean>(tickets.length).fill(false);
  tickets.forEach((t, i) => {
    t.admitted.then(
      () => {
        resolus[i] = true;
      },
      () => {
        resolus[i] = true;
      },
    );
  });
  return resolus;
}

let compteur = 0;
function idFor(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${RUN}-${compteur}`;
}

/* ══════════════════════════ mise en place par cas ═══════════════════════ */

const STORE_HANDLES: unknown[] = [];
const QUEUE_HANDLES: unknown[] = [];

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

async function ouvrirFileAdmission(cap: number, seed: number): Promise<unknown> {
  const openAdmissionQueue = requireRole('openAdmissionQueue');
  const ouv = await essayer(() => openAdmissionQueue({ cap, seed }));
  exige(ouv.ok, 'file-d-admission-ouverte', `OUVERTURE-FILE-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`);
  const handle = (ouv as { ok: true; value: unknown }).value;
  QUEUE_HANDLES.push(handle);
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
  const closeAdmissionQueue = resolveRole('closeAdmissionQueue').fn;
  if (closeAdmissionQueue !== undefined) {
    for (const h of [...QUEUE_HANDLES]) {
      try {
        await closeAdmissionQueue(h);
      } catch {
        /* idem : non observe. */
      }
    }
  }
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

/** Ouvre un store, un budget de plafond large et une reservation fraiche.
 * `montant` est une ENTREE de test (cf. II) : seule l'arithmetique qui en
 * decoule (spent/reserved) est comparee, jamais une valeur absolue fixee
 * par le cahier. */
async function ouvrirBudgetEtReservation(
  handle: unknown,
  budgetId: string,
  reserveBudgetFn: Fn,
  openBudgetFn: Fn | null,
): Promise<string> {
  if (openBudgetFn !== null) {
    const ouv = await essayer(() => openBudgetFn(handle, { budget_id: budgetId, limit: 10_000_000 }));
    exige(ouv.ok, 'budget-ouvert', `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`);
  }
  const r = await essayer(() => reserveBudgetFn(handle, { budget_id: budgetId, amount: 1000 }));
  exige(r.ok, 'reservation-acceptee', `RESERVATION-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`);
  const val = (r as { ok: true; value: Json }).value;
  const reservationId = val.reservation_id as string | undefined;
  exige(typeof reservationId === 'string', 'reservation-a-son-identifiant', `RESERVATION-SANS-IDENTIFIANT ${rendu(val)}`);
  return reservationId as string;
}

/** Pool de concurrence cote TEST (jamais cote SUT) : traite `items` avec au
 * plus `n` executions simultanees de `worker`. Fonde A5 (« un, deux ou six
 * workers », cahier:L383) sans jamais introduire de minuteur reel. */
async function executerAvecNWorkers<T>(items: readonly T[], n: number, worker: (item: T, idx: number) => Promise<void>): Promise<void> {
  let curseur = 0;
  async function lane(): Promise<void> {
    for (;;) {
      const idx = curseur;
      curseur += 1;
      if (idx >= items.length) return;
      await worker(items[idx] as T, idx);
    }
  }
  const lanes: Array<Promise<void>> = [];
  for (let i = 0; i < Math.max(1, Math.min(n, items.length)); i += 1) lanes.push(lane());
  await Promise.all(lanes);
}

/** Fournisseur factice BLOQUANT, FABRIQUE PAR CETTE SUITE (cf. IV.1) : son
 * compteur `calls` incremente de facon SYNCHRONE au moment ou `complete()`
 * est reellement invoque, independamment de tout etat auto-declare par
 * l'admission — le canal de verification INDEPENDANT de A1. Les appels ne
 * se resolvent que lorsque le test appelle explicitement `libererUn()`. */
function creerFournisseurBarriere(): {
  complete: (request: unknown) => Promise<unknown>;
  readonly calls: number;
  libererUn: () => boolean;
  libererTous: () => number;
} {
  let calls = 0;
  const enAttente: Array<() => void> = [];
  return {
    complete(_request: unknown): Promise<unknown> {
      calls += 1;
      return new Promise((resolve) => {
        enAttente.push(() => resolve({ text: 'barriere-t26', usage: { input_uncached_tokens: 0, input_cached_tokens: 0, output_tokens: 0 } }));
      });
    },
    get calls() {
      return calls;
    },
    libererUn(): boolean {
      const f = enAttente.shift();
      if (f === undefined) return false;
      f();
      return true;
    },
    libererTous(): number {
      let n = 0;
      while (this.libererUn()) n += 1;
      return n;
    },
  };
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T26 — reguler le parallelisme et les quotas equitablement', () => {
  test(
    'T26.A1 — dix appels prets, plafond deux, fournisseur bloque par barriere : deux actifs, huit en attente (cahier:L383)',
    async () => {
      assertPackageLoaded('workflows');
      assertPackageLoaded('activities');

      const seed = 4242;
      const handle = await ouvrirFileAdmission(PLAFOND_DEUX, seed);
      const runAdmittedEffect = requireRole('runAdmittedEffect');
      const getQueueSnapshot = requireRole('getQueueSnapshot');

      const providerId = idFor('prov-a1');
      const fournisseur = creerFournisseurBarriere();
      const t = 1_000_000;

      const callIds = Array.from({ length: DIX_APPELS_PRETS }, (_, i) => idFor(`call-a1-${i}`));
      // Les dix appels sont LANCES sans etre attendus : ceux qui restent en
      // attente ne contactent JAMAIS `fournisseur.complete`, puisque
      // `runAdmittedEffect` (contrat III.11) n'invoque l'effet qu'APRES
      // admission.
      const enCours = callIds.map((callId) =>
        essayer(() => runAdmittedEffect(handle, { callId, providerId, now: t }, () => fournisseur.complete({ prompt: callId }))),
      );

      await tick();

      // CANAL INDEPENDANT (IV.1) : le fournisseur REEL n'a recu que deux appels.
      exige(
        fournisseur.calls === DEUX_ACTIFS,
        `fournisseur-reellement-contacte-${DEUX_ACTIFS}-fois (decisif, IV.1)`,
        `calls=${rendu(fournisseur.calls)}`,
      ); // cahier:L383

      const snap = await essayer(() => getQueueSnapshot(handle));
      exige(snap.ok, 'lecture-snapshot-reussie', messageDe((snap as { err: unknown }).err));
      const s = (snap as { ok: true; value: Json }).value;
      exige(s.active === DEUX_ACTIFS, `snapshot-actifs=${DEUX_ACTIFS}`, `vu active=${rendu(s.active)}`); // cahier:L383
      exige(s.waiting === HUIT_EN_ATTENTE, `snapshot-attente=${HUIT_EN_ATTENTE}`, `vu waiting=${rendu(s.waiting)}`); // cahier:L383

      // Nettoyage : liberer la barriere pour laisser les dix appels se
      // terminer (meme si T26.A1 n'exige rien de plus au-dela de ce point).
      for (let i = 0; i < DIX_APPELS_PRETS; i += 1) fournisseur.libererTous();
      await tick();
      await Promise.all(enCours);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T26.A2 — liberer un slot n'en admet qu'un (cahier:L383, delta isole de A1 — cf. IV.2)",
    async () => {
      assertPackageLoaded('workflows');

      const seed = 777;
      const handle = await ouvrirFileAdmission(PLAFOND_DEUX, seed);
      const submitReadyCall = requireRole('submitReadyCall');
      const releaseCall = requireRole('releaseCall');
      const getQueueSnapshot = requireRole('getQueueSnapshot');

      const providerId = idFor('prov-a2');
      const t = 2_000_000;

      const tickets: Array<{ callId: string; admitted: Promise<unknown> }> = [];
      for (let i = 0; i < 5; i += 1) {
        const callId = idFor(`call-a2-${i}`);
        const sub = await essayer(() => submitReadyCall(handle, { callId, providerId, now: t }));
        exige(sub.ok, `soumission-${i}-reussie`, messageDe((sub as { err: unknown }).err));
        tickets.push((sub as { ok: true; value: { callId: string; admitted: Promise<unknown> } }).value);
      }
      const resolus = suivreAdmission(tickets);
      await tick();

      const avant = await essayer(() => getQueueSnapshot(handle));
      exige(avant.ok, 'snapshot-avant-lu', messageDe((avant as { err: unknown }).err));
      const a = (avant as { ok: true; value: Json }).value;

      // Liberer le PREMIER appel admis (le premier soumis, puisque le
      // plafond est atteint des la deuxieme soumission).
      const premierAdmisIdx = resolus.findIndex((r) => r);
      exige(premierAdmisIdx >= 0, 'au-moins-un-appel-deja-admis-avant-liberation', `resolus=${rendu(resolus)}`);
      const rel = await essayer(() => releaseCall(handle, { callId: tickets[premierAdmisIdx]!.callId, now: t }));
      exige(rel.ok, 'liberation-reussie', messageDe((rel as { err: unknown }).err));

      await tick();
      const resolusApresCount = resolus.filter(Boolean).length;
      const resolusAvantCount = ((): number => {
        // reconstruit le compte d'AVANT la liberation a partir de la snapshot,
        // independant du tableau `resolus` (qui a deja pu bouger).
        return typeof a.active === 'number' ? a.active : Number.NaN;
      })();

      const apres = await essayer(() => getQueueSnapshot(handle));
      exige(apres.ok, 'snapshot-apres-lu', messageDe((apres as { err: unknown }).err));
      const p = (apres as { ok: true; value: Json }).value;

      // ASSERTION EN DELTA (IV.2, decisive) : actif inchange, attente moins un.
      exige(
        p.active === a.active,
        `actif-inchange-apres-une-liberation (vu avant=${rendu(a.active)})`,
        `active avant=${rendu(a.active)} apres=${rendu(p.active)}`,
      ); // cahier:L383
      exige(
        typeof p.waiting === 'number' && typeof a.waiting === 'number' && p.waiting === a.waiting - UN_SEUL_ADMIS,
        `attente-diminue-de-exactement-${UN_SEUL_ADMIS} (decisif)`,
        `waiting avant=${rendu(a.waiting)} apres=${rendu(p.waiting)}`,
      ); // cahier:L383

      // CONTROLE POSITIF/NEGATIF complementaire, sur le canal des promesses
      // elles-memes : EXACTEMENT un nouveau ticket (parmi ceux qui restaient
      // en attente avant liberation) est resolu.
      exige(
        resolusApresCount === resolusAvantCount + UN_SEUL_ADMIS,
        `exactement-un-nouveau-ticket-resolu (vu ${resolusAvantCount}->${resolusApresCount})`,
        `avant=${resolusAvantCount} apres=${resolusApresCount} resolus=${rendu(resolus)}`,
      ); // cahier:L383
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T26.A3 — l'ordre de file annonce est respecte (cahier:L381, L383)",
    async () => {
      assertPackageLoaded('workflows');

      const seed = 13;
      const handle = await ouvrirFileAdmission(1, seed);
      const submitReadyCall = requireRole('submitReadyCall');
      const releaseCall = requireRole('releaseCall');
      const announceAssignmentOrder = requireRole('announceAssignmentOrder');

      const providerId = idFor('prov-a3');
      const t = 3_000_000;

      // Un porteur occupe l'UNIQUE slot, pour que les cinq appels reels
      // deviennent TOUS simultanement en attente (sans quoi l'ordre
      // d'affectation serait trivialement l'ordre d'arrivee).
      const porteur = idFor('porteur-a3');
      const subPorteur = await essayer(() => submitReadyCall(handle, { callId: porteur, providerId, now: t }));
      exige(subPorteur.ok, 'porteur-soumis', messageDe((subPorteur as { err: unknown }).err));
      const ticketPorteur = (subPorteur as { ok: true; value: { admitted: Promise<unknown> } }).value;
      await ticketPorteur.admitted;

      // Identifiants DELIBEREMENT dans un ordre different de l'ordre
      // alphanumerique ou d'arrivee, pour que la comparaison soit informative.
      const brut = [3, 1, 4, 0, 2].map((n) => `call-a3-${n}-${RUN}`);
      const tickets: Array<{ callId: string; admitted: Promise<unknown> }> = [];
      for (const callId of brut) {
        const sub = await essayer(() => submitReadyCall(handle, { callId, providerId, now: t }));
        exige(sub.ok, `soumission-${callId}-reussie`, messageDe((sub as { err: unknown }).err));
        tickets.push((sub as { ok: true; value: { callId: string; admitted: Promise<unknown> } }).value);
      }

      // L'ANNONCE, calculee AVANT toute admission reelle parmi ces cinq
      // (fonction PURE, contrat III.6).
      const annonce = await essayer(() => announceAssignmentOrder(handle, brut));
      exige(annonce.ok, 'annonce-calculee', messageDe((annonce as { err: unknown }).err));
      const ordreAnnonce = (annonce as { ok: true; value: unknown }).value;
      exige(
        Array.isArray(ordreAnnonce) && ordreAnnonce.length === brut.length && brut.every((c) => (ordreAnnonce as string[]).includes(c)),
        'annonce-est-une-permutation-complete-du-lot',
        `vu ${rendu(ordreAnnonce)} pour ${rendu(brut)}`,
      );

      // OBSERVATION : liberer le porteur, puis a chaque etape le dernier
      // admis, et noter dans quel ORDRE les cinq tickets se resolvent.
      const resolus = suivreAdmission(tickets);
      let porteurCourant = porteur;
      const ordreObserve: string[] = [];
      for (let i = 0; i < brut.length; i += 1) {
        const rel = await essayer(() => releaseCall(handle, { callId: porteurCourant, now: t }));
        exige(rel.ok, `liberation-etape-${i}-reussie`, messageDe((rel as { err: unknown }).err));
        await tick();
        const gagnantIdx = resolus.findIndex((r, idx) => r && !ordreObserve.includes(tickets[idx]!.callId));
        exige(gagnantIdx >= 0, `exactement-un-nouvel-appel-admis-a-l-etape-${i}`, `resolus=${rendu(resolus)} deja-vus=${rendu(ordreObserve)}`);
        const gagnant = tickets[gagnantIdx]!.callId;
        ordreObserve.push(gagnant);
        porteurCourant = gagnant;
      }

      exige(
        JSON.stringify(ordreObserve) === JSON.stringify(ordreAnnonce),
        'ordre-observe-egal-a-l-ordre-annonce (decisif, cahier:L381/L383)',
        `annonce=${rendu(ordreAnnonce)} observe=${rendu(ordreObserve)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T26.A4 — Retry-After=4 interdit tout nouvel essai avant quatre secondes d\'horloge controlee (cahier:L383)',
    async () => {
      assertPackageLoaded('workflows');
      assertPackageLoaded('gateway');

      const seed = 99;
      const handle = await ouvrirFileAdmission(1, seed);
      const submitReadyCall = requireRole('submitReadyCall');
      const releaseCall = requireRole('releaseCall');
      const pumpAdmission = requireRole('pumpAdmission');
      const recordProviderBackoff = requireRole('recordProviderBackoff');
      const isProviderAdmissible = requireRole('isProviderAdmissible');

      const providerId = idFor('prov-a4');
      const t0 = 4_000_000;

      // Un premier appel occupe puis libere le slot, et SIGNALE au passage
      // un recul Retry-After=4 (cahier:L383) a l'instant t0.
      const c1 = idFor('call-a4-1');
      const sub1 = await essayer(() => submitReadyCall(handle, { callId: c1, providerId, now: t0 }));
      exige(sub1.ok, 'premier-appel-soumis', messageDe((sub1 as { err: unknown }).err));
      const t1 = (sub1 as { ok: true; value: { admitted: Promise<unknown> } }).value;
      await t1.admitted;

      const bk = await essayer(() => recordProviderBackoff(handle, { providerId, retryAfterSeconds: RETRY_AFTER_SECONDES, now: t0 }));
      exige(bk.ok, 'recul-fournisseur-enregistre', messageDe((bk as { err: unknown }).err)); // cahier:L383

      const rel = await essayer(() => releaseCall(handle, { callId: c1, now: t0 }));
      exige(rel.ok, 'premier-appel-libere', messageDe((rel as { err: unknown }).err));

      // DECISIF : immediatement apres le recul (t0), le fournisseur n'est PAS admissible.
      const adm0 = await essayer(() => isProviderAdmissible(handle, { providerId, now: t0 }));
      exige(adm0.ok, 'lecture-admissibilite-t0-reussie', messageDe((adm0 as { err: unknown }).err));
      exige(
        (adm0 as { ok: true; value: unknown }).value === false,
        'fournisseur-inadmissible-a-t0 (decisif, cahier:L383)',
        `vu ${rendu((adm0 as { ok: true; value: unknown }).value)}`,
      );

      // Un second appel, meme fournisseur, soumis au MEME instant que le recul :
      // le slot est pourtant LIBRE (on vient de le liberer) — seul le recul
      // fournisseur doit l'empecher.
      const c2 = idFor('call-a4-2');
      const sub2 = await essayer(() => submitReadyCall(handle, { callId: c2, providerId, now: t0 }));
      exige(sub2.ok, 'second-appel-soumis', messageDe((sub2 as { err: unknown }).err));
      const t2 = (sub2 as { ok: true; value: { callId: string; admitted: Promise<unknown> } }).value;
      const [resolu2] = suivreAdmission([t2]);
      await tick();
      exige(
        resolu2 === false,
        'second-appel-non-admis-malgre-slot-libre (decisif, cahier:L383)',
        `resolu=${rendu(resolu2)}`,
      );

      // A t0 + 3999 ms (juste avant 4 s) : toujours refuse.
      const avantBorne = t0 + RETRY_AFTER_SECONDES * 1000 - 1;
      const pump1 = await essayer(() => pumpAdmission(handle, { now: avantBorne }));
      exige(pump1.ok, 'pump-avant-borne-reussi', messageDe((pump1 as { err: unknown }).err));
      const adm1 = await essayer(() => isProviderAdmissible(handle, { providerId, now: avantBorne }));
      exige(adm1.ok, 'lecture-admissibilite-avant-borne-reussie', messageDe((adm1 as { err: unknown }).err));
      exige(
        (adm1 as { ok: true; value: unknown }).value === false,
        'fournisseur-toujours-inadmissible-juste-avant-4s (decisif, cahier:L383)',
        `vu ${rendu((adm1 as { ok: true; value: unknown }).value)}`,
      );
      await tick();
      exige(resolu2 === false, 'second-appel-encore-non-admis-juste-avant-4s', `resolu=${rendu(resolu2)}`);

      // CONTROLE POSITIF (IV.4) : au terme exact des 4 secondes, l'admission
      // redevient possible — une implementation qui refuserait indefiniment
      // ne passerait pas ce volet.
      const borne = t0 + RETRY_AFTER_SECONDES * 1000;
      const pump2 = await essayer(() => pumpAdmission(handle, { now: borne }));
      exige(pump2.ok, 'pump-a-la-borne-reussi', messageDe((pump2 as { err: unknown }).err));
      const adm2 = await essayer(() => isProviderAdmissible(handle, { providerId, now: borne }));
      exige(adm2.ok, 'lecture-admissibilite-a-la-borne-reussie', messageDe((adm2 as { err: unknown }).err));
      exige(
        (adm2 as { ok: true; value: unknown }).value === true,
        'fournisseur-redevient-admissible-a-4s-pile (controle positif, cahier:L383)',
        `vu ${rendu((adm2 as { ok: true; value: unknown }).value)}`,
      );
      await tick();
      exige(
        resolu2 === true,
        'second-appel-enfin-admis-a-4s-pile (controle positif, decisif)',
        `resolu=${rendu(resolu2)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T26.A5 — consommation identique avec un, deux ou six workers pour des agents scriptes (cahier:L383)',
    async () => {
      assertPackageLoaded('workflows');
      assertPackageLoaded('activities');
      assertPackageLoaded('gateway');
      assertPackageLoaded('billing');
      assertPackageLoaded('storage');

      const runAdmittedEffect = requireRole('runAdmittedEffect');
      const createFakeProvider = requireRole('createFakeProvider');
      const dispatchModelCall = requireRole('dispatchModelCall');
      const openBudget = requireRole('openBudget');
      const reserveBudget = requireRole('reserveBudget');
      const getBudgetState = requireRole('getBudgetState');

      const NB_APPELS = 6;
      const totaux: Record<number, number> = {};

      for (const nbWorkers of WORKERS_TESTES) {
        const store = await ouvrirStore(`a5-w${nbWorkers}`);
        const queue = await ouvrirFileAdmission(NB_APPELS, 555); // plafond large : A5 ne teste pas le blocage
        const budgetId = idFor(`bud-a5-w${nbWorkers}`);
        const providerId = idFor(`prov-a5-w${nbWorkers}`);

        const ouvB = await essayer(() => openBudget(store, { budget_id: budgetId, limit: 10_000_000 }));
        exige(ouvB.ok, `budget-ouvert-w${nbWorkers}`, messageDe((ouvB as { err: unknown }).err));

        const items = Array.from({ length: NB_APPELS }, (_, i) => i);

        await executerAvecNWorkers(items, nbWorkers, async (i) => {
          const r = await essayer(() => reserveBudget(store, { budget_id: budgetId, amount: 100 }));
          exige(r.ok, `reservation-${i}-w${nbWorkers}-acceptee`, messageDe((r as { err: unknown }).err));
          const reservationId = (r as { ok: true; value: Json }).value.reservation_id as string;

          const provider = await essayer(() => createFakeProvider({ responses: [{ text: `r-${i}`, usage: USAGE_TEST }] }));
          exige(provider.ok, `fournisseur-${i}-w${nbWorkers}-cree`, messageDe((provider as { err: unknown }).err));
          const prov = (provider as { ok: true; value: { complete: Fn } }).value;

          const callId = idFor(`call-a5-w${nbWorkers}-${i}`);
          const dispatch = await essayer(() =>
            runAdmittedEffect(queue, { callId, providerId, now: 5_000_000 }, () =>
              dispatchModelCall(store, {
                model_call_id: callId,
                idempotency_key: idFor('idem-a5'),
                budget_id: budgetId,
                reservation_id: reservationId,
                provider: prov,
                request: { prompt: `T26-A5-${i}` },
                tariff: TARIF_TEST,
              }),
            ),
          );
          exige(dispatch.ok, `dispatch-${i}-w${nbWorkers}-reussi`, messageDe((dispatch as { err: unknown }).err));
        });

        const etat = await essayer(() => getBudgetState(store, { budget_id: budgetId }));
        exige(etat.ok, `lecture-etat-budget-w${nbWorkers}-reussie`, messageDe((etat as { err: unknown }).err));
        const spentBrut = (etat as { ok: true; value: Json }).value.spent;
        const spent = typeof spentBrut === 'string' ? Number.parseInt(spentBrut, 10) : (spentBrut as number);
        exige(Number.isFinite(spent), `spent-est-un-nombre-w${nbWorkers}`, `vu ${rendu(spentBrut)}`);
        totaux[nbWorkers] = spent;
      }

      // CONTROLE (IV.5) : un stub constant qui renverrait toujours 0 ne
      // doit pas passer l'egalite par defaut — la depense doit etre REELLE.
      exige(
        totaux[1]! > 0,
        'depense-totale-strictement-positive (controle, IV.5)',
        `totaux=${rendu(totaux)}`,
      );

      // DECISIF (cahier:L383) : la consommation est IDENTIQUE a 1, 2 et 6 workers.
      exige(
        totaux[1] === totaux[2] && totaux[2] === totaux[6],
        'consommation-identique-a-1-2-et-6-workers (decisif, cahier:L383)',
        `totaux=${rendu(totaux)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T26.A6 — temps en file et temps actif sont enregistres separement (cahier:L383)',
    async () => {
      assertPackageLoaded('workflows');

      const seed = 2026;
      const handle = await ouvrirFileAdmission(1, seed);
      const submitReadyCall = requireRole('submitReadyCall');
      const releaseCall = requireRole('releaseCall');
      const getCallTimings = requireRole('getCallTimings');

      const providerId = idFor('prov-a6');

      const A = idFor('call-a6-A');
      const subA = await essayer(() => submitReadyCall(handle, { callId: A, providerId, now: 1_500 }));
      exige(subA.ok, 'A-soumis', messageDe((subA as { err: unknown }).err));
      const ticketA = (subA as { ok: true; value: { admitted: Promise<unknown> } }).value;
      await ticketA.admitted; // admis immediatement : queuedAt=1500, admittedAt=1500

      const B = idFor('call-a6-B');
      const subB = await essayer(() => submitReadyCall(handle, { callId: B, providerId, now: 1_500 })); // B attend des 1500
      exige(subB.ok, 'B-soumis', messageDe((subB as { err: unknown }).err));
      const ticketB = (subB as { ok: true; value: { admitted: Promise<unknown> } }).value;

      const relA = await essayer(() => releaseCall(handle, { callId: A, now: 4_000 })); // A liberé a t=4000
      exige(relA.ok, 'A-libere', messageDe((relA as { err: unknown }).err));
      await ticketB.admitted; // B admis a t=4000 : timeInQueue = 4000-1500 = 2500

      const relB = await essayer(() => releaseCall(handle, { callId: B, now: 9_000 })); // B libere a t=9000
      exige(relB.ok, 'B-libere', messageDe((relB as { err: unknown }).err)); // timeActive = 9000-4000 = 5000

      const timings = await essayer(() => getCallTimings(handle, B));
      exige(timings.ok, 'lecture-timings-de-B-reussie', messageDe((timings as { err: unknown }).err));
      const tB = (timings as { ok: true; value: Json }).value;

      exige(tB.queuedAt === 1_500, 'B-queuedAt=1500', `vu ${rendu(tB.queuedAt)}`);
      exige(tB.admittedAt === 4_000, 'B-admittedAt=4000', `vu ${rendu(tB.admittedAt)}`);
      exige(tB.releasedAt === 9_000, 'B-releasedAt=9000', `vu ${rendu(tB.releasedAt)}`);

      // DECISIF (cahier:L383) : deux champs DISTINCTS, avec des valeurs
      // DIFFERENTES (2500 vs 5000) — un export qui les fusionnerait ou
      // supprimerait l'un des deux ne peut pas rendre les deux correctement.
      exige(tB.timeInQueue === 2_500, 'B-timeInQueue=2500 (decisif)', `vu ${rendu(tB.timeInQueue)}`);
      exige(tB.timeActive === 5_000, 'B-timeActive=5000 (decisif)', `vu ${rendu(tB.timeActive)}`);
      exige(
        tB.timeInQueue !== tB.timeActive,
        'timeInQueue-et-timeActif-sont-deux-mesures-distinctes (decisif, cahier:L383)',
        `timeInQueue=${rendu(tB.timeInQueue)} timeActive=${rendu(tB.timeActive)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
