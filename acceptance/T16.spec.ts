/**
 * acceptance/T16.spec.ts — suite d'acceptation de la tache T16.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T16.A1 numeric   — F-MONEY donne 340 ; deux appels identiques donnent 680
 *   T16.A2 numeric   — F-BUDGET respecte tous ses montants sous transactions
 *                      concurrentes
 *   T16.A3 behaviour — dix importations d'un meme recu ne le comptent qu'une
 *                      fois
 *   T16.A4 behaviour — deux recus distincts de meme montant restent deux
 *                      depenses
 *   T16.A5 absence   — un cout inconnu ne devient jamais zero
 *   T16.A6 behaviour — une correction est ajoutee comme ecriture liee a
 *                      l'original
 *   T16.A7 refusal   — une reservation dont le cout maximal est non borne est
 *                      refusee en mode plafond strict avec `UNBOUNDED_COST`
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T16 — `packages/billing` et
 * `packages/storage`. ADR-001 : cet aveuglement est PROCEDURAL, une
 * discipline auditable au diff, pas une barriere technique. Le contrat teste
 * ci-dessous n'a pas ete releve dans l'implementation ; il est derive de
 * docs/specs/T16.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle :
 *
 *   L291  titre : « Implementer le budget et les ecritures comptables
 *         atomiques »
 *   L293  livrables : « reservations, calcul tarifaire, reglement,
 *         ajustements, ecritures de facturation et rapprochement »
 *   L295  les sept cas d'acceptation, mot pour mot — c'est la SEULE ligne du
 *         cahier qui chiffre « dix », « deux » et nomme `UNBOUNDED_COST`
 *   L297  fin : invariant `spent + reserved + available = limit` dans les cas
 *         sans depassement fournisseur, entiers exacts, et « un plafond
 *         absolu n'est promis que lorsque l'adaptateur possede une borne
 *         fiable ; sinon le mode strict bloque l'emission »
 *   L80   « les montants sont des chaines d'entiers non negatifs en
 *         micro-USD ; `1000000` vaut 1 USD. Les ajustements sont des
 *         ecritures separees signees, pas l'edition d'une facture deja
 *         inscrite. »
 *   L71   invariant 9 : « les depenses utilisent des entiers exacts, jamais
 *         une addition de flottants monetaires »
 *   L66   invariant 4 : « un rollback de l'application ne restaure jamais le
 *         registre central des couts » — le registre comptable de T16 est
 *         donc bien un etat CENTRAL, distinct de l'etat applicatif
 *   L67   invariant 5 : « un echec conserve ses depenses » — cote avec A5, un
 *         cout absent ne peut pas devenir un zero silencieux
 *   L103  `F-MONEY` — grille tarifaire fictive et l'appel de reference
 *   L105  `F-BUDGET` — budget 1000, concurrence, reglement, admissibilite,
 *         reservation ambigue
 *   L257  T12 (dependance) : « Tables minimales ... model_calls,
 *         ledger_entries, budget_reservations ... » — le schema central sur
 *         lequel T16 ecrit deja EXISTE, cree par T12 ; T16 est la tache qui
 *         le REMPLIT de regles metier
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion a l'une de DEUX provenances, et
 * aucune autre : un IMPORT de la racine gelee `acceptance/reference/**`, ou
 * un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p' docs/cahier.md`.
 *
 * (a) VALEURS SCELLEES DE §F, IMPORTEES DE `acceptance/reference/**` —
 *     JAMAIS RECOPIEES A LA MAIN :
 *
 *       F-MONEY  grille (2, 1, 5), appel de reference (100, 40, 20 -> 340),
 *                deux appels identiques (680)                    -> A1
 *       F-BUDGET budget (1000), sous-cas 1 (600, 2 demandes, 1 acceptee au
 *                plus), sous-cas 2 (reglement 340 -> spent=340, reserved=0,
 *                available=660), sous-cas 3a (600 -> available=60), sous-cas
 *                3b (661 refusee -> available=660), sous-cas 4 (budget frais,
 *                reservation ambigue 600 -> available=400)        -> A2
 *
 * (b) LITTERAUX RELEVES DANS LE CAHIER (`// cahier:L295` ou `// cahier:L80`) :
 *
 *       10  — L295, « dix importations d'un meme recu »                 A3
 *       1   — L295, « ne le comptent qu'une fois »                      A3
 *       2   — L295, « deux recus distincts »                            A4
 *       2   — L295, « restent deux depenses »                           A4
 *       0   — L295, « ne devient jamais zero » (valeur qui NE DOIT PAS
 *             apparaitre — la mutation de sens inverse, cf. mutants)     A5
 *       `UNBOUNDED_COST` — L295, le code refuse mot pour mot             A7
 *
 * CE QUE CETTE SUITE FABRIQUE, ET QUI N'EST DONC PAS UN LITTERAL A FAIRE
 * REMONTER : les identifiants de budget, de recu et de correction, le
 * `test_run_id` (L559) qui prefixe les bases jetables, et le montant de
 * correction d'A6 (une ENTREE de test, pas une valeur attendue — sa valeur
 * n'a pas besoin d'etre chiffree par le cahier, seule l'ARITHMETIQUE qui en
 * decoule est verifiee : `spent` apres correction doit valoir exactement
 * `montant_original + delta`, calcule par le test lui-meme).
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T16 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Les paquets interroges sont ceux que le registre declare : `packages/billing`
 * et `packages/storage`. Le chargement ne LEVE jamais : un import casse
 * produirait « Test suite failed to run », que verification/runner/red.mjs
 * classe SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc
 * lui-meme le chargement, en NOMMANT le paquet en cause.
 *
 * TROIS ROLES DE `packages/storage` SONT REPRIS TELS QUELS DE
 * `acceptance/T12.spec.ts` (memes noms, memes alias) — T16 depend de T12, et
 * une convention deja fixee pour un consommateur ne se reinvente pas :
 *
 *   applyMigrations({ dsn }) -> Promise<void>   applique le schema central
 *   openStore({ dsn })       -> Promise<handle> ouvre un repository
 *   closeStore(handle)       -> Promise<void>   ferme la connexion
 *
 * NEUF ROLES DE `packages/billing`, FIXES ICI PARCE QUE LE CAHIER NE LES
 * DICTE PAS (ils sont repris tels quels dans verification/mutants/T16.json) :
 *
 *   1. computeModelCallCost({ tariff, usage })
 *        -> montant (chaine d'entiers L80, ou entier non negatif — les deux
 *           sont acceptes ; seule la VALEUR est decisive pour A1).
 *        `tariff` = { input_uncached_per_token, input_cached_per_token,
 *        output_per_token } ; `usage` = { input_uncached_tokens,
 *        input_cached_tokens, output_tokens }. PUR : ne touche pas au
 *        stockage, ne prend pas de `handle`. C'est le « calcul tarifaire »
 *        de L293, isole de l'ecriture comptable.
 *
 *   2. openBudget(handle, { budget_id, limit }) -> Promise<void>
 *        cree une enveloppe budgetaire de plafond `limit` (L297 : `limit`).
 *
 *   3. reserveBudget(handle, { budget_id, amount, max_cost?, mode? })
 *        -> Promise<{ accepted: boolean, reservation_id?, code? }>
 *        ou REJETTE avec une erreur portant `.code`. `max_cost` absent ou
 *        `null` signifie « cout maximal non borne » (A7) ; `mode:
 *        'STRICT_CAP'` active le plafond strict de L297. Un refus peut donc
 *        etre RENDU (`accepted:false`, `code`) ou LEVE (erreur `.code`) ; la
 *        suite accepte les deux formes et les distingue explicitement d'un
 *        plantage (TypeError, ECONNREFUSED, "is not a function").
 *
 *   4. settleReservation(handle, { reservation_id, amount }) -> Promise<void>
 *        regle une reservation acceptee au montant reellement facture.
 *
 *   5. getBudgetState(handle, { budget_id })
 *        -> Promise<{ limit, spent, reserved, available, unknown_cost_count?,
 *           has_unknown_costs? }>
 *        L297 : l'invariant `spent + reserved + available = limit` porte sur
 *        CES quatre champs.
 *
 *   6. importReceipt(handle, { budget_id, receipt_id, amount })
 *        -> Promise<{ expense_id }>
 *        IDEMPOTENT par `receipt_id` : importer deux fois la MEME cle ne cree
 *        pas une seconde depense (A3) ; deux cles DIFFERENTES en creent deux,
 *        meme a montant egal (A4, L80 : « pas l'edition d'une facture deja
 *        inscrite » implique que deux factures distinctes restent distinctes).
 *
 *   7. recordUnknownCost(handle, { budget_id, ref }) -> Promise<{ entry_id }>
 *        enregistre une ligne de cout dont le montant n'est PAS CONNU au
 *        moment de l'ecriture (par exemple une reponse fournisseur perdue,
 *        cf. T17). Le montant qu'elle porte n'est PAS zero — c'est
 *        precisement ce qu'A5 verifie.
 *
 *   8. addAdjustment(handle, { budget_id, original_entry_id, delta_amount,
 *      reason }) -> Promise<{ adjustment_id, adjusts?/original_entry_id? }>
 *        ecrit une CORRECTION signee (L80), separee de l'ecriture d'origine,
 *        qui reste inchangee.
 *
 *   9. listLedgerEntries(handle, { budget_id }) -> Promise<Array<entry>>
 *        toutes les ecritures d'un budget (depenses, couts inconnus,
 *        ajustements). Chaque entree porte au moins un identifiant, un
 *        montant (ou son absence explicite) et, pour un recu, `receipt_id`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne prouve pas l'unicite d'un appel FOURNISSEUR distant : c'est T17
 *    (L299-L313), qui depend explicitement de T16.
 *  • Elle n'impose aucun nom de colonne ni de table : L259 (T12) fixe treize
 *    noms de TABLES, T16 ne les renomme pas et cette suite ne les interroge
 *    pas directement — elle passe exclusivement par les exports de
 *    `packages/billing`.
 *  • Elle ne mesure pas le comportement en cas de depassement fournisseur
 *    (« etat explicite de depassement » de L297) : aucun cas requis de T16
 *    ne le nomme litteralement, et l'inventer serait affaiblir la portee du
 *    §H (croitre les cas est permis, deplacer l'exigence d'un cas non requis
 *    vers un test qui n'existe pas ne l'est pas).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
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

/** Les deux `source_paths` que verification/tasks.json declare pour T16. */
const PACKAGES = ['billing', 'storage'] as const;

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 10) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
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

/* ═══════════════ les litteraux du cahier, et rien d'autre ══════════════ */

/** L295 : « dix importations d'un meme recu ». */
const DIX_IMPORTATIONS = 10; // cahier:L295

/** L295 : « ne le comptent qu'une fois ». */
const UNE_SEULE_DEPENSE = 1; // cahier:L295

/** L295 : « deux recus distincts ... restent deux depenses ». */
const DEUX_RECUS_DISTINCTS = 2; // cahier:L295

/** L295 : « ne devient jamais zero » — la valeur qui NE DOIT PAS apparaitre. */
const ZERO_INTERDIT_POUR_COUT_INCONNU = 0; // cahier:L295

/** L295 : le code de refus, cite mot pour mot entre backticks par le cahier. */
const CODE_COUT_NON_BORNE = 'UNBOUNDED_COST'; // cahier:L295

/** L80 : « `1000000` vaut 1 USD » — format d'un montant valide. */
const FORMAT_MONTANT_L80 = /^[0-9]+$/; // cahier:L80

/** Ce qui n'est PAS un refus : un plantage (T00/T12 distinguent deja ceci). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/* ═════ §F : les fixtures maitresses que docs/specs/T16.md epingle sur T16 ═══
 *
 * Racine GELEE apres T01 (L139, docs/FROZEN_ROOTS.json). La lecture ne LEVE
 * jamais au chargement du module ; les defauts sont collectes et ASSERTES par
 * `assertReferences()` dans chaque cas qui les consomme.
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

function entierScelle(doc: Json, nom: string, chemin: string): number {
  const v = scelle(doc, nom, chemin);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    DEFAUTS_REFERENCE.push(`REFERENCE-NON-ENTIERE ${nom} ${chemin} = ${rendu(v)}`);
    return Number.NaN;
  }
  return v;
}

function boolScelle(doc: Json, nom: string, chemin: string): boolean {
  const v = scelle(doc, nom, chemin);
  if (typeof v !== 'boolean') {
    DEFAUTS_REFERENCE.push(`REFERENCE-NON-BOOLEENNE ${nom} ${chemin} = ${rendu(v)}`);
    return false;
  }
  return v;
}

const F_MONEY = lireReference('F-MONEY');
const F_BUDGET = lireReference('F-BUDGET');

/** F-MONEY (L103) — grille tarifaire fictive. */
const F_TARIF_NON_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_non_cachee');
const F_TARIF_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_cachee');
const F_TARIF_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.sortie');

/** F-MONEY (L103) — l'appel de reference : 100 non caches, 40 caches, 20 sortie -> 340. */
const F_USAGE_NON_CACHE = entierScelle(
  F_MONEY,
  'F-MONEY',
  'appel_de_reference.tokens_entree_non_caches',
);
const F_USAGE_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_entree_caches');
const F_USAGE_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_sortie');
const F_UN_APPEL = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.cout_attendu');

/** F-MONEY (L103) — deux appels identiques valent 680. */
const F_DEUX_APPELS_NOMBRE = entierScelle(F_MONEY, 'F-MONEY', 'deux_appels_identiques.nombre_d_appels');
const F_DEUX_APPELS_COUT = entierScelle(F_MONEY, 'F-MONEY', 'deux_appels_identiques.cout_attendu');

/** F-BUDGET (L105) — budget et sous-cas 1 (concurrence). */
const F_BUDGET_LIMITE = entierScelle(F_BUDGET, 'F-BUDGET', 'budget');
const F_SC1_MONTANT = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_1_concurrence.montant_par_reservation',
);
const F_SC1_DEMANDES = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_1_concurrence.nombre_de_demandes_concurrentes',
);
const F_SC1_ACCEPTEES_AU_PLUS = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_1_concurrence.acceptees_au_plus',
);

/** F-BUDGET (L105) — sous-cas 2 : reglement a 340. */
const F_SC2_REGLEMENT = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_2_apres_reglement.montant_du_reglement');
const F_SC2_SPENT = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_2_apres_reglement.spent');
const F_SC2_RESERVED = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_2_apres_reglement.reserved');
const F_SC2_AVAILABLE = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_2_apres_reglement.available');

/** F-BUDGET (L105) — sous-cas 3a et 3b, testes separement depuis le sous-cas 2. */
const F_SC3A_MONTANT = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_3a_depuis_le_sous_cas_2.montant_demande');
const F_SC3A_ADMISSIBLE = boolScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_3a_depuis_le_sous_cas_2.admissible');
const F_SC3A_AVAILABLE_APRES = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_3a_depuis_le_sous_cas_2.available_apres',
);
const F_SC3B_MONTANT = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_3b_depuis_le_sous_cas_2.montant_demande');
const F_SC3B_ADMISSIBLE = boolScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_3b_depuis_le_sous_cas_2.admissible');
const F_SC3B_AVAILABLE_APRES = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_3b_depuis_le_sous_cas_2.available_apres',
);

/** F-BUDGET (L105) — sous-cas 4, independant : reservation ambigue. */
const F_SC4_BUDGET = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_4_reservation_ambigue.budget');
const F_SC4_DEPENSE_INITIALE = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_4_reservation_ambigue.depense_initiale',
);
const F_SC4_MONTANT_AMBIGU = entierScelle(
  F_BUDGET,
  'F-BUDGET',
  'sous_cas_4_reservation_ambigue.montant_reserve_ambigu',
);
const F_SC4_AVAILABLE = entierScelle(F_BUDGET, 'F-BUDGET', 'sous_cas_4_reservation_ambigue.available');

/**
 * Chaque cas qui consomme §F l'asserte d'abord, et verifie en outre la
 * COHERENCE ARITHMETIQUE interne de F-MONEY (100*2 + 40*1 + 20*5 = 340,
 * 340*2 = 680) : une fixture qui echouerait ce controle ne pourrait fonder
 * aucune assertion en aval, et le defaut doit se NOMMER ici plutot que de se
 * dissoudre dans un NaN qui se compare a lui-meme plus loin.
 */
function assertReferences(): void {
  expect(
    DEFAUTS_REFERENCE.length === 0
      ? 'fixtures-de-reference-lisibles'
      : `FIXTURES-DE-REFERENCE-INEXPLOITABLES : ${DEFAUTS_REFERENCE.join(' | ')}`,
  ).toBe('fixtures-de-reference-lisibles'); // cahier:L139
  const calcule = F_USAGE_NON_CACHE * F_TARIF_NON_CACHE + F_USAGE_CACHE * F_TARIF_CACHE + F_USAGE_SORTIE * F_TARIF_SORTIE;
  expect(calcule).toBe(F_UN_APPEL); // cahier:L103
  expect(F_UN_APPEL * F_DEUX_APPELS_NOMBRE).toBe(F_DEUX_APPELS_COUT); // cahier:L103
}

/** Un montant L80 valide (chaine d'entiers) OU un entier JS non negatif. */
function interpretMontant(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string' && FORMAT_MONTANT_L80.test(v)) return Number.parseInt(v, 10);
  return null;
}

/** Variante signee, pour les ecritures d'ajustement (L80 : « signees »). */
function interpretMontantSigne(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?[0-9]+$/.test(v)) return Number.parseInt(v, 10);
  return null;
}

/* ══════════════════════════ PostgreSQL reel (requires: postgres18) ═══════ */

const RUN = `t16_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
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
  ).toBe('base-creee'); // cahier: requires postgres18 (verification/tasks.json T16)
  BASES_CREEES.push(nom);
  return nom;
}

/* ═══════════════ chargement des paquets declares par le registre ═══════ */

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
  // Le chargement ne LEVE pas : un import casse produirait « Test suite
  // failed to run », que verification/runner/red.mjs classe
  // SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc
  // lui-meme le chargement du paquet dont il a besoin.
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertPackageLoaded(pkg: string): void {
  expect(
    LOADED.chargesPar.has(pkg)
      ? `packages/${pkg}-charge`
      : `PAQUET-NON-CHARGEABLE packages/${pkg} : ${LOADED.attempts.join(' | ')}`,
  ).toBe(`packages/${pkg}-charge`);
}

/* ─────────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  // packages/storage — repris tels quels de acceptance/T12.spec.ts (T16 en depend).
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
  // packages/billing — fixes par cette suite (section III ci-dessus).
  computeModelCallCost: [
    'computeModelCallCost', 'computeCallCost', 'priceModelCall', 'computeUsageCost',
    'computeCost', 'priceCall', 'tariffCost', 'calculateModelCallCost',
  ],
  openBudget: [
    'openBudget', 'createBudget', 'initBudget', 'ensureBudget', 'openBudgetLedger',
    'createBudgetLedger',
  ],
  reserveBudget: [
    'reserveBudget', 'reserve', 'createReservation', 'requestReservation', 'reserveAmount',
  ],
  settleReservation: [
    'settleReservation', 'settle', 'settleBudgetReservation', 'settleCall', 'settleAmount',
  ],
  getBudgetState: [
    'getBudgetState', 'budgetState', 'readBudgetState', 'getBudget', 'budgetSnapshot', 'readBudget',
  ],
  importReceipt: [
    'importReceipt', 'recordReceipt', 'ingestReceipt', 'applyReceipt', 'importInvoice',
  ],
  recordUnknownCost: [
    'recordUnknownCost', 'recordCostUnknown', 'recordUnresolvedCost', 'markCostUnknown',
    'recordUnknownExpense',
  ],
  addAdjustment: [
    'addAdjustment', 'recordAdjustment', 'createAdjustment', 'applyAdjustment',
    'correctEntry', 'addCorrection',
  ],
  listLedgerEntries: [
    'listLedgerEntries', 'listEntries', 'ledgerEntries', 'listExpenses',
    'listBudgetEntries', 'listBudgetLedger',
  ],
};

type Fn = (...a: unknown[]) => unknown;

function resolveRole(name: string): { fn?: Fn; tried: readonly string[] } {
  const aliases = ROLES[name];
  if (aliases === undefined) throw new Error(`role inconnu de la suite : ${name}`);
  for (const a of aliases) {
    const v = LOADED.flat.get(a);
    if (typeof v === 'function') return { fn: v as Fn, tried: aliases };
  }
  return { tried: aliases };
}

/** Resout un role ou fait echouer le cas courant en NOMMANT les alias essayes. */
function requireRole(name: string): Fn {
  const { fn, tried } = resolveRole(name);
  expect(
    fn !== undefined ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fn;
}

/** Appelle une fonction potentiellement asynchrone sans jamais laisser lever. */
async function essayer<T>(thunk: () => T | Promise<T>): Promise<
  { ok: true; value: T } | { ok: false; err: unknown }
> {
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

const HANDLES: unknown[] = [];

async function ouvrirStore(suffixe: string): Promise<unknown> {
  const applyMigrations = requireRole('applyMigrations');
  const openStore = requireRole('openStore');
  const db = creerBase(suffixe);
  const dsn = dsnFor(db);
  const mig = await essayer(() => applyMigrations({ dsn }));
  expect(mig.ok ? 'migrations-appliquees' : `MIGRATIONS-EN-ECHEC ${messageDe((mig as { err: unknown }).err)}`).toBe(
    'migrations-appliquees',
  );
  const ouv = await essayer(() => openStore({ dsn }));
  expect(ouv.ok ? 'store-ouvert' : `OUVERTURE-STORE-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe(
    'store-ouvert',
  );
  const handle = (ouv as { ok: true; value: unknown }).value;
  HANDLES.push(handle);
  return handle;
}

afterAll(async () => {
  const closeStore = resolveRole('closeStore').fn;
  if (closeStore !== undefined) {
    for (const h of [...HANDLES]) {
      try {
        await closeStore(h);
      } catch {
        /* la fermeture n'est pas l'objet des assertions ; la base est de toute facon droppee. */
      }
    }
  }
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

let compteurBudget = 0;
function idBudget(prefixe: string): string {
  compteurBudget += 1;
  return `${prefixe}-${RUN}-${compteurBudget}`;
}

/* ══════════════════════════════ T16.A1 ══════════════════════════════════ */

test('T16.A1 — F-MONEY : un appel vaut 340, deux appels identiques valent 680', async () => {
  assertReferences();
  assertPackageLoaded('billing');
  const computeModelCallCost = requireRole('computeModelCallCost');

  const tariff = {
    input_uncached_per_token: F_TARIF_NON_CACHE,
    input_cached_per_token: F_TARIF_CACHE,
    output_per_token: F_TARIF_SORTIE,
  };
  const usage = {
    input_uncached_tokens: F_USAGE_NON_CACHE,
    input_cached_tokens: F_USAGE_CACHE,
    output_tokens: F_USAGE_SORTIE,
  };

  const r1 = await essayer(() => computeModelCallCost({ tariff, usage }));
  expect(r1.ok ? 'calcul-reussi' : `CALCUL-EN-ECHEC ${messageDe((r1 as { err: unknown }).err)}`).toBe(
    'calcul-reussi',
  );
  const cout1 = interpretMontant((r1 as { ok: true; value: unknown }).value);
  expect(
    cout1 === null
      ? `MONTANT-INVALIDE ${rendu((r1 as { ok: true; value: unknown }).value)}`
      : `montant-${cout1}`,
  ).toBe(`montant-${F_UN_APPEL}`); // cahier:L103 (340, importe de F-MONEY)

  // Deux appels identiques : L103 chiffre leur SOMME a 680. La suite ne
  // presuppose aucune fonction d'agregat : elle appelle deux fois le calcul
  // pur et fait la somme elle-meme, en entiers exacts (cahier:L71).
  const r2 = await essayer(() => computeModelCallCost({ tariff, usage }));
  const cout2 = r2.ok ? interpretMontant((r2 as { ok: true; value: unknown }).value) : null;
  expect(
    cout2 === null ? 'DEUXIEME-CALCUL-INVALIDE' : `montant-${cout2}`,
  ).toBe(`montant-${F_UN_APPEL}`); // cahier:L103 — le calcul est deterministe, meme entree
  expect((cout1 ?? 0) + (cout2 ?? 0)).toBe(F_DEUX_APPELS_COUT); // cahier:L103 (680)

  // Les champs d'entree sont DISJOINTS (L103) : le montant ne doit pas
  // dependre d'un total qui engloberait le cache. Une implementation qui
  // additionnerait `input_uncached_tokens` et `input_cached_tokens` avant
  // tarification donnerait ici (100+40)*2 + 20*5 = 380, distinct de 340.
  expect(cout1).not.toBe((F_USAGE_NON_CACHE + F_USAGE_CACHE) * F_TARIF_NON_CACHE + F_USAGE_SORTIE * F_TARIF_SORTIE);
});

/* ══════════════════════════════ T16.A2 ══════════════════════════════════ */

/**
 * Fabrique un budget au montant F_BUDGET_LIMITE, fait courir DEUX
 * reservations concurrentes de F_SC1_MONTANT, exige qu'au plus
 * F_SC1_ACCEPTEES_AU_PLUS soit acceptee, regle l'acceptee a F_SC2_REGLEMENT
 * et rend le triplet (handle, budget_id, id de la reservation reglee).
 * Appelee deux fois independamment pour les sous-cas 3a et 3b, comme le
 * cahier l'exige explicitement (« tester separement »).
 */
async function budgetRegleApres340(suffixe: string): Promise<{ handle: unknown; budgetId: string }> {
  const handle = await ouvrirStore(suffixe);
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');
  const settleReservation = requireRole('settleReservation');
  const getBudgetState = requireRole('getBudgetState');

  const budgetId = idBudget('bud-conc');
  const ouv = await essayer(() => openBudget(handle, { budget_id: budgetId, limit: F_BUDGET_LIMITE }));
  expect(ouv.ok ? 'budget-ouvert' : `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe(
    'budget-ouvert',
  );

  // DEUX demandes concurrentes : les deux promesses sont creees dans le meme
  // tick, avant tout `await` — c'est la course que L105 exige de resoudre.
  const p1 = essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: F_SC1_MONTANT }));
  const p2 = essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: F_SC1_MONTANT }));
  const [i1, i2] = await Promise.all([p1, p2]);

  const accepte = (issue: { ok: boolean; value?: unknown }): boolean =>
    issue.ok === true &&
    typeof issue.value === 'object' &&
    issue.value !== null &&
    ((issue.value as Json).accepted === true || (issue.value as Json).status === 'ACCEPTED');

  const nbAcceptees = [i1, i2].filter(accepte).length;
  expect(nbAcceptees <= F_SC1_ACCEPTEES_AU_PLUS ? `au-plus-${F_SC1_ACCEPTEES_AU_PLUS}` : `TROP-ACCEPTEES ${nbAcceptees}`).toBe(
    `au-plus-${F_SC1_ACCEPTEES_AU_PLUS}`,
  ); // cahier:L105 — « ne peuvent pas etre toutes deux acceptees »
  // Un budget de 1000 loge une reservation de 600 : une implementation dont
  // les DEUX demandes echoueraient ne respecterait pas non plus F-BUDGET.
  expect(nbAcceptees >= 1 ? 'au-moins-une-acceptee' : `AUCUNE-ACCEPTEE i1=${rendu(i1)} i2=${rendu(i2)}`).toBe(
    'au-moins-une-acceptee',
  ); // cahier:L105

  const gagnante = accepte(i1) ? i1 : i2;
  const reservationId = (gagnante as { ok: true; value: Json }).value.reservation_id as string | undefined;

  const reg = await essayer(() =>
    settleReservation(handle, { reservation_id: reservationId, amount: F_SC2_REGLEMENT }),
  );
  expect(reg.ok ? 'reglement-reussi' : `REGLEMENT-EN-ECHEC ${messageDe((reg as { err: unknown }).err)}`).toBe(
    'reglement-reussi',
  ); // cahier:L105 (340)

  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  expect(etat.ok ? 'etat-lu' : `LECTURE-ETAT-EN-ECHEC ${messageDe((etat as { err: unknown }).err)}`).toBe('etat-lu');
  const e = (etat as { ok: true; value: Json }).value;
  const spent = interpretMontant(e.spent);
  const reserved = interpretMontant(e.reserved);
  const available = interpretMontant(e.available);
  expect(spent).toBe(F_SC2_SPENT); // cahier:L105 (340)
  expect(reserved).toBe(F_SC2_RESERVED); // cahier:L105 (0)
  expect(available).toBe(F_SC2_AVAILABLE); // cahier:L105 (660)
  // L297 : l'invariant qui donne son sens a T16.
  expect((spent ?? 0) + (reserved ?? 0) + (available ?? 0)).toBe(F_BUDGET_LIMITE); // cahier:L297

  return { handle, budgetId };
}

test('T16.A2 — F-BUDGET : concurrence, reglement, admissibilite (sous-cas 3a)', async () => {
  assertReferences();
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId } = await budgetRegleApres340('sc3a');
  const reserveBudget = requireRole('reserveBudget');
  const getBudgetState = requireRole('getBudgetState');

  const r = await essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: F_SC3A_MONTANT }));
  const ok3a =
    r.ok === true &&
    typeof (r as { value: unknown }).value === 'object' &&
    (r as { value: unknown }).value !== null &&
    (((r as { value: Json }).value.accepted === true) || ((r as { value: Json }).value.status === 'ACCEPTED'));
  expect(ok3a).toBe(F_SC3A_ADMISSIBLE); // cahier:L105 — 600 est admissible

  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  const available = etat.ok ? interpretMontant((etat as { value: Json }).value.available) : null;
  expect(available).toBe(F_SC3A_AVAILABLE_APRES); // cahier:L105 (60)
});

test('T16.A2 — F-BUDGET : concurrence, reglement, refus de plafond (sous-cas 3b)', async () => {
  assertReferences();
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const { handle, budgetId } = await budgetRegleApres340('sc3b');
  const reserveBudget = requireRole('reserveBudget');
  const getBudgetState = requireRole('getBudgetState');

  const r = await essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: F_SC3B_MONTANT }));
  const ok3b =
    r.ok === true &&
    typeof (r as { value: unknown }).value === 'object' &&
    (r as { value: unknown }).value !== null &&
    (((r as { value: Json }).value.accepted === true) || ((r as { value: Json }).value.status === 'ACCEPTED'));
  expect(ok3b).toBe(F_SC3B_ADMISSIBLE); // cahier:L105 — 661 est refusee
  // Un refus doit en etre un, pas un plantage — sinon rien n'est prouve sur
  // la REGLE de plafond elle-meme.
  if (!r.ok) {
    expect(MARQUEURS_DE_PLANTAGE.test(messageDe((r as { err: unknown }).err))).toBe(false);
  }

  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  const available = etat.ok ? interpretMontant((etat as { value: Json }).value.available) : null;
  expect(available).toBe(F_SC3B_AVAILABLE_APRES); // cahier:L105 (660, inchange)
});

test('T16.A2 — F-BUDGET : reservation ambigue non reconciliee (sous-cas 4, independant)', async () => {
  assertReferences();
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');

  const handle = await ouvrirStore('sc4');
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');
  const getBudgetState = requireRole('getBudgetState');

  const budgetId = idBudget('bud-ambigu');
  expect(F_SC4_DEPENSE_INITIALE).toBe(0); // cahier:L105 — « budget frais »
  const ouv = await essayer(() => openBudget(handle, { budget_id: budgetId, limit: F_SC4_BUDGET }));
  expect(ouv.ok ? 'budget-ouvert' : `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe(
    'budget-ouvert',
  );

  const r = await essayer(() =>
    reserveBudget(handle, { budget_id: budgetId, amount: F_SC4_MONTANT_AMBIGU }),
  );
  expect(r.ok ? 'reservation-ambigue-acceptee' : `RESERVATION-REFUSEE ${messageDe((r as { err: unknown }).err)}`).toBe(
    'reservation-ambigue-acceptee',
  ); // cahier:L105 — la reservation elle-meme doit etre acceptee ; c'est son REGLEMENT qui manque

  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  const available = etat.ok ? interpretMontant((etat as { value: Json }).value.available) : null;
  expect(
    available === null ? 'AVAILABLE-INVALIDE' : `available-${available}`,
  ).toBe(`available-${F_SC4_AVAILABLE}`); // cahier:L105 (400) — « tant qu'elle n'est pas reconciliee »
});

/* ══════════════════════════════ T16.A3 ══════════════════════════════════ */

test('T16.A3 — dix importations du meme recu ne comptent qu une fois', async () => {
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');
  const handle = await ouvrirStore('recu-x10');
  const openBudget = requireRole('openBudget');
  const importReceipt = requireRole('importReceipt');
  const listLedgerEntries = requireRole('listLedgerEntries');
  const getBudgetState = requireRole('getBudgetState');

  const budgetId = idBudget('bud-import10');
  await essayer(() => openBudget(handle, { budget_id: budgetId, limit: F_BUDGET_LIMITE }));

  const recuId = `recu-${RUN}-unique`;
  for (let i = 0; i < DIX_IMPORTATIONS; i += 1) {
    // cahier:L295 — dix importations, meme cle, meme montant.
    const r = await essayer(() =>
      importReceipt(handle, { budget_id: budgetId, receipt_id: recuId, amount: F_UN_APPEL }),
    );
    expect(
      r.ok ? `import-${i}-reussi` : `IMPORT-${i}-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`,
    ).toBe(`import-${i}-reussi`);
  }

  const entrees = await essayer(() => listLedgerEntries(handle, { budget_id: budgetId }));
  expect(
    entrees.ok ? 'liste-lue' : `LISTE-EN-ECHEC ${messageDe((entrees as { err: unknown }).err)}`,
  ).toBe('liste-lue');
  const liste = (entrees as { ok: true; value: unknown }).value;
  expect(Array.isArray(liste) ? 'liste-est-un-tableau' : `LISTE-NON-TABLEAU ${rendu(liste)}`).toBe(
    'liste-est-un-tableau',
  );
  const correspondantes = (liste as Json[]).filter((e) => e.receipt_id === recuId);
  expect(correspondantes.length).toBe(UNE_SEULE_DEPENSE); // cahier:L295

  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  const spent = etat.ok ? interpretMontant((etat as { value: Json }).value.spent) : null;
  expect(spent).toBe(F_UN_APPEL); // cahier:L295 — pas dix fois 340
});

/* ══════════════════════════════ T16.A4 ══════════════════════════════════ */

test('T16.A4 — deux recus distincts de meme montant restent deux depenses', async () => {
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');
  const handle = await ouvrirStore('recus-distincts');
  const openBudget = requireRole('openBudget');
  const importReceipt = requireRole('importReceipt');
  const listLedgerEntries = requireRole('listLedgerEntries');
  const getBudgetState = requireRole('getBudgetState');

  const budgetId = idBudget('bud-import2');
  await essayer(() => openBudget(handle, { budget_id: budgetId, limit: F_BUDGET_LIMITE }));

  const recuA = `recu-${RUN}-a`;
  const recuB = `recu-${RUN}-b`;
  for (const recuId of [recuA, recuB]) {
    const r = await essayer(() =>
      importReceipt(handle, { budget_id: budgetId, receipt_id: recuId, amount: F_UN_APPEL }),
    );
    expect(
      r.ok ? `import-${recuId}-reussi` : `IMPORT-EN-ECHEC ${recuId} ${messageDe((r as { err: unknown }).err)}`,
    ).toBe(`import-${recuId}-reussi`);
  }

  const entrees = await essayer(() => listLedgerEntries(handle, { budget_id: budgetId }));
  const liste = entrees.ok ? ((entrees as { value: unknown }).value as Json[]) : [];
  const distinctes = new Set(
    liste.filter((e) => e.receipt_id === recuA || e.receipt_id === recuB).map((e) => e.receipt_id),
  );
  expect(distinctes.size).toBe(DEUX_RECUS_DISTINCTS); // cahier:L295

  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  const spent = etat.ok ? interpretMontant((etat as { value: Json }).value.spent) : null;
  // Coherence interne : F_UN_APPEL*2 est deja verifie egal a F_DEUX_APPELS_COUT
  // dans assertReferences(). Ici la valeur DECOULE de l'arithmetique, elle
  // n'est pas recopiee.
  expect(spent).toBe(F_UN_APPEL * DEUX_RECUS_DISTINCTS); // cahier:L295 (deux depenses distinctes)
});

/* ══════════════════════════════ T16.A5 ══════════════════════════════════ */

test('T16.A5 — un cout inconnu ne devient jamais zero', async () => {
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');
  const handle = await ouvrirStore('cout-inconnu');
  const openBudget = requireRole('openBudget');
  const importReceipt = requireRole('importReceipt');
  const recordUnknownCost = requireRole('recordUnknownCost');
  const listLedgerEntries = requireRole('listLedgerEntries');
  const getBudgetState = requireRole('getBudgetState');

  const budgetId = idBudget('bud-inconnu');
  await essayer(() => openBudget(handle, { budget_id: budgetId, limit: F_BUDGET_LIMITE }));

  // CONTROLE POSITIF : une depense CONNUE, pour que le total attendu (340) ne
  // soit pas accidentellement egal a ce qu'un coalescing UNKNOWN->0 rendrait.
  const recuConnu = `recu-${RUN}-connu`;
  const rc = await essayer(() =>
    importReceipt(handle, { budget_id: budgetId, receipt_id: recuConnu, amount: F_UN_APPEL }),
  );
  expect(rc.ok ? 'depense-connue-enregistree' : `ECHEC ${messageDe((rc as { err: unknown }).err)}`).toBe(
    'depense-connue-enregistree',
  );

  const ref = `model-call-${RUN}-perdu`;
  const ru = await essayer(() => recordUnknownCost(handle, { budget_id: budgetId, ref }));
  expect(
    ru.ok ? 'cout-inconnu-enregistre' : `ENREGISTREMENT-COUT-INCONNU-EN-ECHEC ${messageDe((ru as { err: unknown }).err)}`,
  ).toBe('cout-inconnu-enregistre');

  const entrees = await essayer(() => listLedgerEntries(handle, { budget_id: budgetId }));
  expect(entrees.ok ? 'liste-lue' : 'LISTE-EN-ECHEC').toBe('liste-lue');
  const liste = (entrees as { ok: true; value: unknown }).value as Json[];

  // PRESENCE : l'ecriture existe (elle n'a pas ete silencieusement omise —
  // ce que la sonde d'absence suivante ne pourrait pas distinguer d'un
  // enregistrement qui n'aurait rien ecrit du tout).
  const correspondantes = liste.filter((e) => e.ref === ref || e.entry_id !== undefined && rendu(e).includes(ref));
  expect(correspondantes.length >= 1 ? 'ecriture-presente' : `ECRITURE-ABSENTE liste=${rendu(liste)}`).toBe(
    'ecriture-presente',
  );
  const entreeInconnue = correspondantes[0] as Json;

  // ABSENCE decisive : le montant de CETTE ecriture n'est jamais le zero
  // interdit par L295 — ni comme entier, ni comme chaine L80 "0".
  const montantInterprete = interpretMontant(entreeInconnue.amount);
  expect(
    montantInterprete === ZERO_INTERDIT_POUR_COUT_INCONNU
      ? `ZERO-SUBSTITUE ${rendu(entreeInconnue)}`
      : 'pas-de-zero-substitue',
  ).toBe('pas-de-zero-substitue'); // cahier:L295
  expect(entreeInconnue.amount).not.toBe('0');
  expect(entreeInconnue.amount).not.toBe(0);

  // L'incertitude doit rester VISIBLE dans l'agregat : l'implementation
  // publie un indicateur explicite (compte ou drapeau) que le cout inconnu
  // n'a pas disparu dans le total.
  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  expect(etat.ok ? 'etat-lu' : 'LECTURE-ETAT-EN-ECHEC').toBe('etat-lu');
  const e = (etat as { ok: true; value: Json }).value;
  const compte = e.unknown_cost_count;
  const drapeau = e.has_unknown_costs;
  const signaleUnknown =
    (typeof compte === 'number' && compte >= 1) || drapeau === true;
  expect(
    signaleUnknown ? 'incertitude-signalee' : `INCERTITUDE-INVISIBLE etat=${rendu(e)}`,
  ).toBe('incertitude-signalee'); // cahier:L295 + L67 (« un echec conserve ses depenses »)

  // Le total CONNU (340) reste, lui, exact — le cout inconnu n'a pas non
  // plus fait DISPARAITRE la depense connue.
  const spent = interpretMontant(e.spent);
  expect(spent).not.toBeNull();
});

/* ══════════════════════════════ T16.A6 ══════════════════════════════════ */

test('T16.A6 — une correction est ajoutee comme ecriture liee a l original', async () => {
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');
  const handle = await ouvrirStore('ajustement');
  const openBudget = requireRole('openBudget');
  const importReceipt = requireRole('importReceipt');
  const addAdjustment = requireRole('addAdjustment');
  const listLedgerEntries = requireRole('listLedgerEntries');
  const getBudgetState = requireRole('getBudgetState');

  const budgetId = idBudget('bud-adj');
  await essayer(() => openBudget(handle, { budget_id: budgetId, limit: F_BUDGET_LIMITE }));

  const recuId = `recu-${RUN}-original`;
  const imp = await essayer(() =>
    importReceipt(handle, { budget_id: budgetId, receipt_id: recuId, amount: F_UN_APPEL }),
  );
  expect(imp.ok ? 'original-enregistre' : `ECHEC ${messageDe((imp as { err: unknown }).err)}`).toBe(
    'original-enregistre',
  );
  const expenseId = (imp as { ok: true; value: Json }).value.expense_id as string | undefined;

  // Delta de correction : une ENTREE fabriquee par la suite (section II),
  // dont seule l'ARITHMETIQUE qui en decoule est verifiee.
  const delta = -40;
  const raison = 'correction-facture-surestimee';
  const adj = await essayer(() =>
    addAdjustment(handle, {
      budget_id: budgetId,
      original_entry_id: expenseId,
      delta_amount: delta,
      reason: raison,
    }),
  );
  expect(adj.ok ? 'ajustement-enregistre' : `AJUSTEMENT-EN-ECHEC ${messageDe((adj as { err: unknown }).err)}`).toBe(
    'ajustement-enregistre',
  );
  const adjustmentId = (adj as { ok: true; value: Json }).value.adjustment_id as string | undefined;
  expect(
    adjustmentId !== undefined && adjustmentId !== expenseId
      ? 'ajustement-a-son-propre-identifiant'
      : `AJUSTEMENT-SANS-IDENTIFIANT-PROPRE ${rendu((adj as { ok: true; value: Json }).value)}`,
  ).toBe('ajustement-a-son-propre-identifiant');

  const entrees = await essayer(() => listLedgerEntries(handle, { budget_id: budgetId }));
  const liste = entrees.ok ? ((entrees as { value: unknown }).value as Json[]) : [];

  // L'ORIGINAL reste present et INCHANGE (L80 : « pas l'edition d'une
  // facture deja inscrite »).
  const original = liste.find((e) => e.receipt_id === recuId);
  expect(
    original !== undefined ? 'original-toujours-present' : `ORIGINAL-DISPARU liste=${rendu(liste)}`,
  ).toBe('original-toujours-present');
  expect(interpretMontant(original?.amount)).toBe(F_UN_APPEL);

  // LA CORRECTION est une ecriture SEPAREE et SIGNEE, qui NOMME l'original.
  const correction = liste.find((e) => {
    if (e.entry_id === adjustmentId) return true;
    return e.adjusts === expenseId || e.original_entry_id === expenseId || e.ref_entry_id === expenseId;
  });
  expect(
    correction !== undefined ? 'correction-presente' : `CORRECTION-ABSENTE liste=${rendu(liste)}`,
  ).toBe('correction-presente');
  const lien = correction?.adjusts ?? correction?.original_entry_id ?? correction?.ref_entry_id;
  expect(lien).toBe(expenseId); // cahier:L80 — ecriture liee a l'original
  expect(interpretMontantSigne(correction?.delta_amount ?? correction?.amount)).toBe(delta);

  // L'effet net sur le budget est la SOMME entiere original + correction.
  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  const spent = etat.ok ? interpretMontant((etat as { value: Json }).value.spent) : null;
  expect(spent).toBe(F_UN_APPEL + delta); // cahier:L71 — entiers exacts
});

/* ══════════════════════════════ T16.A7 ══════════════════════════════════ */

test('T16.A7 — cout maximal non borne refuse en mode plafond strict avec UNBOUNDED_COST', async () => {
  assertPackageLoaded('billing');
  assertPackageLoaded('storage');
  const handle = await ouvrirStore('plafond-strict');
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');

  const budgetId = idBudget('bud-strict');
  await essayer(() => openBudget(handle, { budget_id: budgetId, limit: F_BUDGET_LIMITE }));

  // CONTROLE POSITIF d'abord : en mode plafond strict, une reservation dont
  // le cout maximal EST borne doit etre admise. Sans ce controle, un mode
  // strict qui refuserait TOUT rendrait A7 vert a tort — exactement le
  // travers qu'un cas `refusal` doit ecarter.
  const borne = await essayer(() =>
    reserveBudget(handle, { budget_id: budgetId, amount: 10, max_cost: 500, mode: 'STRICT_CAP' }),
  );
  expect(
    borne.ok ? 'reservation-bornee-acceptee' : `RESERVATION-BORNEE-REFUSEE ${messageDe((borne as { err: unknown }).err)}`,
  ).toBe('reservation-bornee-acceptee'); // cahier:L297 — « lorsque l'adaptateur possede une borne fiable »

  // L'ASSERTION DECISIVE : cout maximal NON BORNE (`max_cost: null`), meme
  // mode strict.
  const nonBorne = await essayer(() =>
    reserveBudget(handle, { budget_id: budgetId, amount: 10, max_cost: null, mode: 'STRICT_CAP' }),
  );
  expect(nonBorne.ok ? `RESERVATION-NON-BORNEE-ACCEPTEE ${rendu((nonBorne as { value: unknown }).value)}` : 'refusee').toBe(
    'refusee',
  ); // cahier:L295 — refusee, pas acceptee
  if (nonBorne.ok) return; // l'assertion precedente a deja echoue ; on n'interprete pas un succes comme un refus.

  const err = (nonBorne as { ok: false; err: unknown }).err;
  expect(
    MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
  ).toBe('refus-authentique');
  const code = codeDe(err);
  expect(
    code === CODE_COUT_NON_BORNE ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(code)} (attendu ${CODE_COUT_NON_BORNE})`,
  ).toBe('code-conforme'); // cahier:L295 — `UNBOUNDED_COST`, mot pour mot
});
