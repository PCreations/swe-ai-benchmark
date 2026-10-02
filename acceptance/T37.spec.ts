/**
 * acceptance/T37.spec.ts — suite d'acceptation de la tache T37.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T37.A1 artifact   — chaque point obligatoire a un scenario et une
 *                       attente explicite dans le catalogue
 *   T37.A2 absence    — effets locaux controles rejoues sans double
 *                       publication
 *   T37.A3 behaviour  — reponse distante ambigue aboutit a UNKNOWN ou
 *                       reconciliation prouvee, jamais a zero
 *   T37.A4 absence    — anciennes copies d'evaluation detruites et aucune
 *                       sentinelle divulguee
 *   T37.A5 refusal    — pertes ou doublons de recus sont detectes
 *   T37.A6 absence    — arret repete ne retire aucune periode du calendrier
 *   T37.A7 behaviour  — journal de reprise complet avec identites stables
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T37 — `packages/activities` et
 * `packages/workflows` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff, pas une
 * barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T37.md (cahier:L477-L485) et des cartes de specification des
 * huit dependances directes (T15, T17, T20, T23, T24, T25, T26, T31), dont
 * cette suite reprend les contrats DEJA FIXES par leurs propres suites
 * d'acceptation — exactement comme acceptance/T24.spec.ts reprend
 * `model-call` de T17, ou acceptance/T25.spec.ts reprend `dispatchModelCall`
 * de T17. Lire le contrat PUBLIE d'une dependance n'est pas lire
 * l'implementation de T37 : rien de T37 n'existe encore au moment ou cette
 * suite est ecrite.
 *
 *   L483  « Points obligatoires : avant/apres upload ; avant/apres commit de
 *         resultat ; avant/apres DISPATCH_STARTED ; apres reception
 *         fournisseur avant sauvegarde de reponse ; apres sauvegarde avant
 *         reglement ; apres deploiement avant accuse ; pendant checkpoint ;
 *         avant publication de periode ; bail expire. » — DOUZE points
 *         distincts (deux par groupe « avant/apres », un par groupe
 *         singulier) ; fonde A1 au mot pres.
 *   L483  les sept cas d'acceptation, mot pour mot.
 *   L483  fin : « tous les cas obligatoires executes. L'equivalence au
 *         nominal porte sur les etats metier lorsque la reprise est
 *         effectivement determinable ; pour un effet distant irreconciliable,
 *         le resultat attendu est l'ambiguite explicite, pas une fausse
 *         equivalence. » — fonde la distinction A2 (effet LOCAL, replaye sans
 *         duplication) / A3 (effet DISTANT, ambigu par construction) : un
 *         effet local est entierement sous notre controle (notre propre
 *         stockage), un effet distant a pu reellement se produire chez un
 *         tiers avant la panne.
 *   L68   invariant 6 : « une tache peut etre rejouee par l'orchestrateur ;
 *         les effets valides sont dedupliques par cle d'operation et
 *         empreinte d'entree » — fonde A2 et A7 (identite stable = la meme
 *         cle d'operation retrouvee a la reprise, pas une cle neuve).
 *   L69   invariant 7 : « un appel fournisseur dont la reponse est perdue
 *         n'est pas relance aveuglement. Son etat reste ambigu tant qu'il
 *         n'est pas reconcilie. » — fonde A3 au mot pres.
 *   L99   etats d'appel `DISPATCH_STARTED`, `UNKNOWN`, `SETTLED` (T17) —
 *         repris pour A3 et A7.
 *   L80   montants en micro-USD, entiers exacts — fonde le `remote_cost`
 *         non nul exige par A3.
 *   L301  L303  T17 (dependance directe) : « journal durable d'appel [...]
 *         endpoint de reconciliation » ; les hooks nommes `afterDispatchStarted`
 *         et `afterProviderResponse` et le role `reconcileModelCall` sont
 *         DEJA FIXES par acceptance/T17.spec.ts (section III) ; cette suite
 *         les reutilise tels quels pour A3 et A5, sans les redefinir.
 *   L305  T17, fin : « les ambiguites non reconciliees restent dans
 *         l'export » — fonde A5 : un lot de recus ambigu est REJETE en bloc,
 *         rien n'est regle a moitie.
 *   L333  T20 (dependance directe) : « nettoyage de chaque copie [...] »,
 *         `EVALUATION_INCOMPLETE` — fonde le vocabulaire « copie d'evaluation »
 *         et « sentinelle » d'A4, deja etabli par acceptance/T20.spec.ts.
 *   L357  T23 (dependance directe) : enum de phase ; « derniere operation
 *         nommee [...] le checkpoint » — fonde `avant publication de
 *         periode` comme l'avant-derniere a derniere ecriture d'une periode.
 *   L375  T25 (dependance directe) : `STALE_EXECUTION`, baux et jetons de
 *         fencing — fonde le point `bail expire` du catalogue (A1).
 *   L121  F-FAILURE, racine gelee — `K=4` periodes, reutilise pour A6 au lieu
 *         d'etre recopie a la main.
 *   L103  F-MONEY, racine gelee — grille tarifaire et appel de reference
 *         (340), reutilise pour A3 au lieu d'etre recopie a la main.
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         barrieres et points d'injection NOMMES [...] les checks
 *         d'integration utilisent reellement PostgreSQL, le stockage et les
 *         workers lorsque le contrat porte sur ces composants » — autorise
 *         l'usage de PostgreSQL reel et du fournisseur factice pour A3/A5, et
 *         dispense A1/A2/A4/A6/A7 (qui ne portent pas sur ces composants, mais
 *         sur le catalogue, le journal et le systeme de fichiers) d'en
 *         dependre.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 * (a) VALEURS SCELLEES, IMPORTEES SANS RECOPIE : `K` (acceptance/reference/
 *     F-FAILURE.json, cahier:L121) ; la grille tarifaire et le cout de
 *     reference 340 (acceptance/reference/F-MONEY.json, cahier:L103).
 * (b) LITTERAUX DU CAHIER, chacun avec son `// cahier:L<n>` : `DISPATCH_STARTED`,
 *     `UNKNOWN`, `SETTLED` (L99) ; `recorded` (L21).
 * (c) LES DOUZE NOMS DE POINTS, LES CHAMPS DU CATALOGUE (`scenario`,
 *     `expected`), LE CHEMIN DU CATALOGUE, LA SIGNATURE DE `runFaultDrill`,
 *     SES CODES D'ERREUR (`RECEIPT_RECONCILIATION_REJECTED`, `RECEIPT_LOST`,
 *     `RECEIPT_DUPLICATE`) ET LE FORMAT DU JOURNAL NE SONT PAS ENONCES PAR LE
 *     CAHIER : ils sont FIXES ICI, comme T17 a fixe `IDEMPOTENCY_KEY_CONFLICT`
 *     et ses trois hooks avant que packages/gateway n'existe. Aucune de ces
 *     valeurs n'a ete obtenue en executant une implementation de T37 et en
 *     figeant ce qu'on a vu passer : aucune implementation de T37 n'existe au
 *     moment ou cette suite est ecrite (ADR-001).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T37 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * 1. UN ARTEFACT STATIQUE, `packages/workflows/fault-catalog.json` — un
 *    tableau JSON, un objet par point obligatoire de L483, CHACUN portant
 *    AU MOINS :
 *      `point`     string — un des douze noms canoniques fixes en IV.1
 *      `scenario`  string non vide (>= 15 caracteres apres trim) decrivant
 *                  CE QUI est interrompu
 *      `expected`  string non vide (>= 15 caracteres apres trim) decrivant
 *                  l'ETAT attendu apres reprise
 *    Ce fichier n'est JAMAIS charge via `import` (il n'a pas besoin de
 *    compiler : A1 est un cas `artifact`, cases.lock.json le dit au mot —
 *    « sans executer de code metier ») : A1 le lit par `fs.readFileSync`
 *    pur, sans jamais appeler un export de paquet.
 *
 * 2. `packages/workflows`, UN SEUL EXPORT NOUVEAU :
 *
 *    `runFaultDrill(options) -> Promise<FaultDrillResult>`
 *
 *    `options` (snake_case, reprenant le vocabulaire deja fixe par L78/L99/
 *    T17/T25 lorsqu'il existe) :
 *      point                   string, un des douze noms canoniques
 *      journal_path            string, obligatoire (cf. 3 ci-dessous)
 *      campaign_id             string (L78) — identite du calendrier (A2, A6)
 *      period_index            number (L78) — periode visee (A2, A6)
 *      scheduled_periods       number[] — calendrier COURANT tel que connu
 *                              au debut de CET appel (A6) ; `runFaultDrill`
 *                              ne le retire JAMAIS d'une periode suite a une
 *                              interruption
 *      handle                  le handle de stockage deja ouvert (T12),
 *                              reutilise tel quel (A3, A5)
 *      provider                le fournisseur factice deja cree (T17),
 *                              reutilise tel quel (A3)
 *      budget_id, reservation_id, model_call_id, idempotency_key, tariff,
 *      request                 memes noms et formes que `dispatchModelCall`
 *                              de T17 (A3)
 *      receipt                 `{ usage }` — un recu hors-bande arrivant pour
 *                              CE `model_call_id`, declenchant la
 *                              reconciliation (A3)
 *      receipts                `Array<{ model_call_id, usage }>` — un LOT de
 *                              reglement (A5)
 *      expected_model_call_ids string[] — les `model_call_id` que ce lot est
 *                              cense couvrir (A5) ; un id present ici sans
 *                              recu correspondant est une PERTE, un
 *                              `model_call_id` reapparaissant plus d'une fois
 *                              dans `receipts` est un DOUBLON
 *      eval_copy_root, developer_root, sentinel
 *                              trois chemins/valeurs FABRIQUES par le cas
 *                              (A4) : `eval_copy_root` simule une copie privee
 *                              d'evaluation deja utilisee (elle contient deja
 *                              la sentinelle), `developer_root` simule
 *                              l'espace visible du developpeur.
 *
 *    `FaultDrillResult` :
 *      point                     echo de `options.point`
 *      resumable_identity        string — IDENTIQUE entre deux appels portant
 *                                la MEME identite metier (A7), DIFFERENTE
 *                                entre deux identites distinctes
 *      outcome                   string libre, journalise tel quel
 *      remote_status             'UNKNOWN' | 'RECONCILED' | undefined (A3)
 *      remote_cost               number | undefined — jamais 0 quand
 *                                `remote_status==='RECONCILED'` (A3)
 *      old_eval_copy_count       number | undefined (A4)
 *      sentinel_leaked           boolean | undefined (A4)
 *
 *    REJET : lorsque `receipts`/`expected_model_call_ids` revelent une perte
 *    ou un doublon, la promesse est REJETEE avec une `Error` portant
 *    `.code === 'RECEIPT_RECONCILIATION_REJECTED'` et `.anomalies:
 *    Array<{ model_call_id: string; code: 'RECEIPT_LOST' | 'RECEIPT_DUPLICATE' }>`
 *    nommant CHAQUE anomalie (A5) — jamais un rejet silencieux partiel, jamais
 *    une acceptation.
 *
 * 3. LE JOURNAL DE REPRISE, `options.journal_path` — un fichier JSON tenu par
 *    `runFaultDrill` lui-meme : CHAQUE appel reussi Y AJOUTE une entree
 *      `{ point, resumable_identity, outcome, at, campaign_id?, period_index?,
 *         schedule_period_indices? }`
 *    SANS jamais tronquer les entrees d'un appel precedent portant sur le
 *    meme fichier — c'est ce que A7 (completude) et A2/A6 (controle
 *    independant, cette suite relit le fichier elle-meme plutot que de ne
 *    croire que la valeur de retour du dernier appel) exigent conjointement.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DOUZE NOMS CANONIQUES (FIXES PAR CETTE SUITE, cf. II.c), ET LEUR
 * CORRESPONDANCE AVEC LE TEXTE DE L483
 *
 *   avant-upload, apres-upload                                   (upload)
 *   avant-commit-resultat, apres-commit-resultat                 (commit)
 *   avant-dispatch-started, apres-dispatch-started                (T17)
 *   apres-reception-fournisseur-avant-sauvegarde-reponse          (T17)
 *   apres-sauvegarde-avant-reglement                              (A5)
 *   apres-deploiement-avant-accuse
 *   pendant-checkpoint                                            (T15)
 *   avant-publication-periode                                     (A2, A6)
 *   bail-expire                                                   (T25)
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne re-prouve pas que `dispatchModelCall` classe correctement une
 *    panne apres DISPATCH_STARTED en UNKNOWN : c'est T17.A6, deja fait.
 *    A3 prouve que le RUNNER DE T37 observe et rapporte fidelement cet etat,
 *    PUIS mene une reconciliation reelle jusqu'a un cout non nul — la
 *    COMPOSITION des deux, pas chaque moitie prise isolement.
 *  • Elle n'exige pas que `avant-upload`, `apres-upload`,
 *    `avant-commit-resultat`, `apres-deploiement-avant-accuse`,
 *    `pendant-checkpoint` et `bail-expire` soient chacun exerces par un appel
 *    reel a `runFaultDrill` dans cette suite : L483 n'exige que leur
 *    PRESENCE au catalogue (A1) ; les sept cas d'acceptation de T37 nomment
 *    des PROPRIETES composites (A2 a A7), pas « un cas par point » — exactement
 *    comme T17 observe le catalogue entier de L365 sans exercer plus que ses
 *    trois points propres (acceptance/T17.spec.ts §IV).
 *  • Elle ne fixe aucune politique de retry Temporal ni aucun mecanisme de
 *    checkpoint reel : ceux-ci restent proprietes de T15/T24, deja prouvees.
 *  • Elle n'exerce aucun fournisseur reseau reel (L15) : uniquement le
 *    fournisseur factice a compteurs deja etabli par T17.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 120_000;

/* ────────────────────────────────────────────────────────────────── socle */

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;
type Fn = (...a: unknown[]) => unknown;

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
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

/** Les quatre paquets charges par cette suite : trois dependances deja
 * fixees (storage/T12, billing/T16, gateway/T17), et `workflows` — les
 * `source_paths` reels de T37. */
const PACKAGES = ['storage', 'billing', 'gateway', 'workflows'] as const;

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
const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/* ═══════════════ litteraux du cahier, et rien d'autre (cf. II.b) ═══════ */

const ETAT_DISPATCH_STARTED = 'DISPATCH_STARTED'; // cahier:L99
const ETAT_UNKNOWN = 'UNKNOWN'; // cahier:L99
const MODE_RECORDED = 'recorded'; // cahier:L21

/** Codes et vocabulaire FIXES PAR CETTE SUITE (cf. II.c). */
const CODE_RECEIPTS_REJECTED = 'RECEIPT_RECONCILIATION_REJECTED';
const ANOMALIE_PERTE = 'RECEIPT_LOST';
const ANOMALIE_DOUBLON = 'RECEIPT_DUPLICATE';
const ISSUE_PUBLIE = 'PUBLISHED';

/** Les douze points obligatoires de cahier:L483 (cf. IV). */
const PT_AVANT_UPLOAD = 'avant-upload'; // cahier:L483
const PT_APRES_UPLOAD = 'apres-upload'; // cahier:L483
const PT_AVANT_COMMIT_RESULTAT = 'avant-commit-resultat'; // cahier:L483
const PT_APRES_COMMIT_RESULTAT = 'apres-commit-resultat'; // cahier:L483
const PT_AVANT_DISPATCH_STARTED = 'avant-dispatch-started'; // cahier:L483
const PT_APRES_DISPATCH_STARTED = 'apres-dispatch-started'; // cahier:L483
const PT_APRES_RECEPTION_AVANT_SAUVEGARDE = 'apres-reception-fournisseur-avant-sauvegarde-reponse'; // cahier:L483
const PT_APRES_SAUVEGARDE_AVANT_REGLEMENT = 'apres-sauvegarde-avant-reglement'; // cahier:L483
const PT_APRES_DEPLOIEMENT_AVANT_ACCUSE = 'apres-deploiement-avant-accuse'; // cahier:L483
const PT_PENDANT_CHECKPOINT = 'pendant-checkpoint'; // cahier:L483
const PT_AVANT_PUBLICATION_PERIODE = 'avant-publication-periode'; // cahier:L483
const PT_BAIL_EXPIRE = 'bail-expire'; // cahier:L483

const POINTS_OBLIGATOIRES = [
  PT_AVANT_UPLOAD,
  PT_APRES_UPLOAD,
  PT_AVANT_COMMIT_RESULTAT,
  PT_APRES_COMMIT_RESULTAT,
  PT_AVANT_DISPATCH_STARTED,
  PT_APRES_DISPATCH_STARTED,
  PT_APRES_RECEPTION_AVANT_SAUVEGARDE,
  PT_APRES_SAUVEGARDE_AVANT_REGLEMENT,
  PT_APRES_DEPLOIEMENT_AVANT_ACCUSE,
  PT_PENDANT_CHECKPOINT,
  PT_AVANT_PUBLICATION_PERIODE,
  PT_BAIL_EXPIRE,
] as const;

/** Format d'un montant L80 valide (chaine d'entiers) ou entier JS non negatif. */
const FORMAT_MONTANT_L80 = /^[0-9]+$/;
function interpretMontant(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string' && FORMAT_MONTANT_L80.test(v)) return Number.parseInt(v, 10);
  return null;
}

/** Ce qui n'est PAS un refus : un plantage (meme convention que T00/T17/T25). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/* ═════ §F : racines gelees apres T01, jamais recopiees a la main ════════ */

const DEFAUTS_REFERENCE: string[] = [];
function lireReference(nom: string): Json {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${nom}.json`), 'utf8')) as Json;
    if (doc.fixture !== nom) DEFAUTS_REFERENCE.push(`FIXTURE-MAL-NOMMEE ${nom} porte fixture=${rendu(doc.fixture)}`);
    return doc;
  } catch (e) {
    DEFAUTS_REFERENCE.push(`FIXTURE-ILLISIBLE acceptance/reference/${nom}.json : ${(e as Error).message}`);
    return {};
  }
}
function scelle(doc: Json, nom: string, chemin: string): unknown {
  let cur: unknown = doc;
  for (const seg of `valeurs.${chemin}.valeur`.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      DEFAUTS_REFERENCE.push(`REFERENCE-CHEMIN-ABSENT ${nom} valeurs.${chemin}.valeur`);
      return undefined;
    }
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) DEFAUTS_REFERENCE.push(`REFERENCE-VALEUR-ABSENTE ${nom} valeurs.${chemin}.valeur`);
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

const F_FAILURE = lireReference('F-FAILURE');
const K = entierScelle(F_FAILURE, 'F-FAILURE', 'K'); // 4, cahier:L121

const F_MONEY = lireReference('F-MONEY');
const F_TARIF_NON_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_non_cachee');
const F_TARIF_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_cachee');
const F_TARIF_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.sortie');
const F_USAGE_NON_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_entree_non_caches');
const F_USAGE_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_entree_caches');
const F_USAGE_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_sortie');
const F_UN_APPEL = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.cout_attendu'); // 340

const F_TARIFF = {
  input_uncached_per_token: F_TARIF_NON_CACHE,
  input_cached_per_token: F_TARIF_CACHE,
  output_per_token: F_TARIF_SORTIE,
};
const F_USAGE = {
  input_uncached_tokens: F_USAGE_NON_CACHE,
  input_cached_tokens: F_USAGE_CACHE,
  output_tokens: F_USAGE_SORTIE,
};

function assertReferences(): void {
  expect(
    DEFAUTS_REFERENCE.length === 0
      ? 'fixtures-de-reference-lisibles'
      : `FIXTURES-DE-REFERENCE-INEXPLOITABLES : ${DEFAUTS_REFERENCE.join(' | ')}`,
  ).toBe('fixtures-de-reference-lisibles'); // cahier:L139
  const calcule = F_USAGE_NON_CACHE * F_TARIF_NON_CACHE + F_USAGE_CACHE * F_TARIF_CACHE + F_USAGE_SORTIE * F_TARIF_SORTIE;
  expect(calcule).toBe(F_UN_APPEL); // cahier:L103
}

/* ══════════════════════════ PostgreSQL reel (requires: postgres18) ═══════ */

const RUN = `t37_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
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
  expect(r.ok ? 'base-postgresql-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`).toBe(
    'base-postgresql-creee',
  ); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

/* ═══════════════════ chargement par ROLE (meme discipline que T17/T25) ═══ */

type Loaded = { chargesPar: Set<string>; flat: Map<string, unknown>; attempts: string[] };

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

function flatten(mod: Ns, into: Map<string, unknown>): void {
  const put = (k: string, v: unknown): void => {
    if (!into.has(k)) into.set(k, v);
  };
  for (const [k, v] of Object.entries(mod)) put(k, v);
  const def = (mod as { default?: unknown }).default;
  if (def !== null && typeof def === 'object') {
    for (const [k, v] of Object.entries(def as Ns)) put(k, v);
  }
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
  expect(
    LOADED.chargesPar.has(pkg) ? `packages/${pkg}-charge` : `PAQUET-NON-CHARGEABLE packages/${pkg} : ${LOADED.attempts.join(' | ')}`,
  ).toBe(`packages/${pkg}-charge`);
}

const ROLES: Record<string, readonly string[]> = {
  // packages/storage — repris tel quel de acceptance/T12.spec.ts (via T17).
  applyMigrations: ['applyMigrations', 'applyCentralMigrations', 'runMigrations', 'migrate', 'migrateCentral', 'migrateUp', 'ensureSchema', 'createSchema', 'initSchema', 'setupSchema', 'up'],
  openStore: ['openStore', 'openCentralStore', 'createStore', 'openRepository', 'createRepository', 'connect', 'createPool', 'openDatabase', 'open'],
  closeStore: ['closeStore', 'closeRepository', 'disconnect', 'shutdown', 'dispose', 'close', 'end'],
  // packages/billing — repris tel quel de acceptance/T16.spec.ts (via T17).
  openBudget: ['openBudget', 'createBudget', 'initBudget', 'ensureBudget', 'openBudgetLedger', 'createBudgetLedger'],
  reserveBudget: ['reserveBudget', 'reserve', 'createReservation', 'requestReservation', 'reserveAmount'],
  getBudgetState: ['getBudgetState', 'budgetState', 'readBudgetState', 'getBudget', 'budgetSnapshot', 'readBudget'],
  // packages/gateway — repris tel quel de acceptance/T17.spec.ts.
  createFakeProvider: ['createFakeProvider', 'makeFakeProvider', 'newFakeProvider', 'fakeProvider'],
  dispatchModelCall: ['dispatchModelCall', 'dispatchCall', 'dispatch', 'sendModelCall', 'executeModelCall'],
  getModelCall: ['getModelCall', 'readModelCall', 'fetchModelCall', 'getCall', 'loadModelCall'],
  reconcileModelCall: ['reconcileModelCall', 'reconcileCall', 'reconcile', 'applyReceiptToModelCall', 'settleFromReceipt'],
  // packages/workflows — FIXE PAR CETTE SUITE (section III).
  runFaultDrill: ['runFaultDrill', 'runFaultScenario', 'runFaultSweepDrill', 'executeFaultDrill', 'runFaultInjectionDrill', 'driveFaultPoint'],
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
  expect(fn !== undefined ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`).toBe(
    `role-${name}-trouve`,
  );
  return fn as Fn;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    return { ok: true, value: await thunk() };
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
function anomaliesDe(err: unknown): Array<{ model_call_id?: unknown; code?: unknown }> {
  if (err instanceof Error) {
    const a = (err as unknown as Json).anomalies;
    if (Array.isArray(a)) return a as Array<{ model_call_id?: unknown; code?: unknown }>;
  }
  if (typeof err === 'object' && err !== null) {
    const a = (err as Json).anomalies;
    if (Array.isArray(a)) return a as Array<{ model_call_id?: unknown; code?: unknown }>;
  }
  return [];
}

/* ══════════════════════════ mise en place par cas ═══════════════════════ */

const HANDLES: unknown[] = [];
const SABLE = fs.mkdtempSync(path.join(os.tmpdir(), 't37-'));
let compteur = 0;
function idFor(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${RUN}-${compteur}`;
}
function cheminSable(...parts: string[]): string {
  return path.join(SABLE, ...parts);
}

afterAll(async () => {
  const closeStore = resolveRole('closeStore').fn;
  if (closeStore !== undefined) {
    for (const h of [...HANDLES]) {
      try {
        await closeStore(h);
      } catch {
        /* la fermeture n'est pas l'objet des assertions */
      }
    }
  }
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  try {
    fs.rmSync(SABLE, { recursive: true, force: true });
  } catch {
    /* un bac a sable non supprime ne change aucun verdict */
  }
}, CASE_TIMEOUT_MS);

async function ouvrirStore(suffixe: string): Promise<unknown> {
  const applyMigrations = requireRole('applyMigrations');
  const openStore = requireRole('openStore');
  const db = creerBase(suffixe);
  const dsn = dsnFor(db);
  const mig = await essayer(() => applyMigrations({ dsn }));
  expect(mig.ok ? 'migrations-appliquees' : `MIGRATIONS-EN-ECHEC ${messageDe((mig as { err: unknown }).err)}`).toBe('migrations-appliquees');
  const ouv = await essayer(() => openStore({ dsn }));
  expect(ouv.ok ? 'store-ouvert' : `OUVERTURE-STORE-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe('store-ouvert');
  const handle = (ouv as { ok: true; value: unknown }).value;
  HANDLES.push(handle);
  return handle;
}

async function preparerBudgetEtReservation(
  suffixe: string,
  montant = 500,
  limite = 10_000,
): Promise<{ handle: unknown; budgetId: string; reservationId: string }> {
  const handle = await ouvrirStore(suffixe);
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');
  const budgetId = idFor('bud');
  const ouv = await essayer(() => openBudget(handle, { budget_id: budgetId, limit: limite }));
  expect(ouv.ok ? 'budget-ouvert' : `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`).toBe('budget-ouvert');
  const r = await essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: montant }));
  expect(r.ok ? 'reservation-acceptee' : `RESERVATION-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe('reservation-acceptee');
  const val = (r as { ok: true; value: Json }).value;
  const reservationId = val.reservation_id as string | undefined;
  expect(typeof reservationId === 'string' ? 'reservation-a-son-identifiant' : `RESERVATION-SANS-IDENTIFIANT ${rendu(val)}`).toBe(
    'reservation-a-son-identifiant',
  );
  return { handle, budgetId, reservationId: reservationId as string };
}

/** Lit le journal de reprise (III.3) — TOUJOURS depuis le disque, jamais
 * depuis la derniere valeur de retour : c'est le controle independant que
 * A2, A6 et A7 exigent (meme discipline que l'`occurrences` SQL de T23/T24). */
function lireJournal(cheminJournal: string): Array<Json> {
  if (!fs.existsSync(cheminJournal)) return [];
  try {
    const v = JSON.parse(fs.readFileSync(cheminJournal, 'utf8')) as unknown;
    return Array.isArray(v) ? (v as Array<Json>) : [];
  } catch {
    return [];
  }
}

/* ══════════════════════════════ T37.A1 ══════════════════════════════════
 * artifact — cases.lock.json : « inspecte la completude du catalogue [...]
 * sans executer de code metier ». Lecture `fs` pure, AUCUN import. */

test(
  "T37.A1 — chaque point obligatoire de L483 a un scenario et une attente explicite dans le catalogue",
  () => {
    const cheminCatalogue = path.join(REPO, 'packages', 'workflows', 'fault-catalog.json');
    const lu = (() => {
      try {
        return { ok: true as const, texte: fs.readFileSync(cheminCatalogue, 'utf8') };
      } catch (e) {
        return { ok: false as const, err: (e as Error).message };
      }
    })();
    expect(lu.ok ? 'catalogue-lisible' : `CATALOGUE-ILLISIBLE ${cheminCatalogue} : ${court((lu as { err: string }).err)}`).toBe(
      'catalogue-lisible',
    );

    const parse = (() => {
      try {
        return { ok: true as const, valeur: JSON.parse((lu as { texte: string }).texte) as unknown };
      } catch (e) {
        return { ok: false as const, err: (e as Error).message };
      }
    })();
    expect(parse.ok ? 'catalogue-json-valide' : `CATALOGUE-JSON-INVALIDE : ${court((parse as { err: string }).err)}`).toBe(
      'catalogue-json-valide',
    );
    const liste = (parse as { valeur: unknown }).valeur;
    expect(Array.isArray(liste) ? 'catalogue-est-un-tableau' : `CATALOGUE-N-EST-PAS-UN-TABLEAU ${rendu(liste)}`).toBe(
      'catalogue-est-un-tableau',
    );
    const entrees = liste as Json[];

    const nonVide = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 15;
    const parPoint = new Map<string, Json[]>();
    for (const e of entrees) {
      const p = typeof e.point === 'string' ? e.point : null;
      if (p === null) continue;
      const arr = parPoint.get(p) ?? [];
      arr.push(e);
      parPoint.set(p, arr);
    }

    const manquants: string[] = [];
    const sansScenario: string[] = [];
    const sansAttente: string[] = [];
    const dupliques: string[] = [];
    for (const point of POINTS_OBLIGATOIRES) {
      const occ = parPoint.get(point) ?? [];
      if (occ.length === 0) {
        manquants.push(point);
        continue;
      }
      if (occ.length > 1) dupliques.push(point);
      const e = occ[0] as Json;
      if (!nonVide(e.scenario) || e.scenario === point) sansScenario.push(point);
      if (!nonVide(e.expected) || e.expected === point) sansAttente.push(point);
    }

    expect(
      manquants.length === 0
        ? 'douze-points-presents'
        : `POINTS-ABSENTS-DU-CATALOGUE : ${manquants.join(', ')} (presents : ${[...parPoint.keys()].join(', ')})`,
    ).toBe('douze-points-presents'); // cahier:L483
    expect(dupliques.length === 0 ? 'aucun-point-duplique' : `POINTS-DUPLIQUES : ${dupliques.join(', ')}`).toBe('aucun-point-duplique');
    expect(
      sansScenario.length === 0 ? 'chaque-point-a-un-scenario' : `SCENARIO-ABSENT-OU-TRIVIAL : ${sansScenario.join(', ')}`,
    ).toBe('chaque-point-a-un-scenario'); // cahier:L483
    expect(
      sansAttente.length === 0 ? 'chaque-point-a-une-attente-explicite' : `ATTENTE-ABSENTE-OU-TRIVIALE : ${sansAttente.join(', ')}`,
    ).toBe('chaque-point-a-une-attente-explicite'); // cahier:L483
  },
);

/* ══════════════════════════════ T37.A2 ══════════════════════════════════
 * absence — effet LOCAL (publication de periode) rejoue apres panne :
 * exactement UNE entree de journal `outcome==='PUBLISHED'` pour la meme
 * identite, jamais deux (cf. cases.lock.json : « desactiver la cle
 * d'idempotence [...] pour que le rejeu publie une seconde fois »). */

test(
  'T37.A2 — effet local (publication de periode) rejoue apres panne sans double publication',
  async () => {
    assertPackageLoaded('workflows');
    const runFaultDrill = requireRole('runFaultDrill');

    const campaignId = idFor('camp-a2');
    const periodIndex = 1;
    const cheminJournal = cheminSable('t37-a2-journal.json');

    // Premier appel : publication nominale.
    const r1 = await essayer(() =>
      runFaultDrill({
        point: PT_AVANT_PUBLICATION_PERIODE,
        journal_path: cheminJournal,
        campaign_id: campaignId,
        period_index: periodIndex,
      }),
    );
    expect(r1.ok ? 'premier-appel-execute' : `PREMIER-APPEL-EN-ECHEC ${messageDe((r1 as { err: unknown }).err)}`).toBe(
      'premier-appel-execute',
    );

    // Second appel : REJEU de la MEME operation (simule une reprise apres
    // panne juste apres la publication) — doit etre un NO-OP de publication.
    const r2 = await essayer(() =>
      runFaultDrill({
        point: PT_AVANT_PUBLICATION_PERIODE,
        journal_path: cheminJournal,
        campaign_id: campaignId,
        period_index: periodIndex,
      }),
    );
    expect(r2.ok ? 'rejeu-execute' : `REJEU-EN-ECHEC ${messageDe((r2 as { err: unknown }).err)}`).toBe('rejeu-execute');

    // CONTROLE INDEPENDANT : relecture du journal depuis le disque, jamais
    // seulement la valeur de retour du second appel.
    const journal = lireJournal(cheminJournal);
    const pourCetteIdentite = journal.filter((e) => e.campaign_id === campaignId && e.period_index === periodIndex);
    const publications = pourCetteIdentite.filter((e) => e.outcome === ISSUE_PUBLIE);

    expect(
      publications.length === 1
        ? 'une-seule-publication'
        : `DOUBLE-PUBLICATION-DETECTEE n=${publications.length} journal=${rendu(pourCetteIdentite)}`,
    ).toBe('une-seule-publication'); // cahier:L68

    // Identite stable entre les deux appels (prefigure A7, verifie ici pour
    // ce point precis) : les deux entrees partagent le MEME resumable_identity.
    expect(pourCetteIdentite.length >= 2 ? 'deux-entrees-journalisees' : `ENTREES-MANQUANTES ${rendu(pourCetteIdentite)}`).toBe(
      'deux-entrees-journalisees',
    );
    const identites = new Set(pourCetteIdentite.map((e) => e.resumable_identity));
    expect(identites.size === 1 ? 'identite-stable-sur-rejeu' : `IDENTITE-INSTABLE ${rendu([...identites])}`).toBe(
      'identite-stable-sur-rejeu',
    );
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T37.A3 ══════════════════════════════════
 * behaviour — reponse distante ambigue : UNKNOWN (panne apres
 * DISPATCH_STARTED, zero reception) OU reconciliation prouvee a un cout
 * NON NUL (340, F-MONEY) — jamais un effet nul/absent. */

test(
  'T37.A3 — reponse distante ambigue : UNKNOWN ou reconciliation prouvee, jamais zero',
  async () => {
    assertReferences();
    assertPackageLoaded('storage');
    assertPackageLoaded('billing');
    assertPackageLoaded('gateway');
    assertPackageLoaded('workflows');

    const runFaultDrill = requireRole('runFaultDrill');
    const createFakeProvider = requireRole('createFakeProvider');
    const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a3');

    const provider1 = await essayer(() => createFakeProvider({ responses: [{ text: 'r', usage: F_USAGE }] }));
    expect(provider1.ok ? 'fournisseur-cree' : `FOURNISSEUR-EN-ECHEC ${messageDe((provider1 as { err: unknown }).err)}`).toBe(
      'fournisseur-cree',
    );
    const prov1 = (provider1 as { ok: true; value: { complete: Fn; calls: number } }).value;

    const cheminJournal = cheminSable('t37-a3-journal.json');

    // Branche 1 : panne APRES DISPATCH_STARTED, le fournisseur ne repond
    // jamais (ou n'a jamais ete contacte) -> UNKNOWN, zero reception (T17.A6).
    const idA = idFor('call-a3-unknown');
    const resA = await essayer(() =>
      runFaultDrill({
        point: PT_APRES_DISPATCH_STARTED,
        journal_path: cheminJournal,
        handle,
        provider: prov1,
        budget_id: budgetId,
        reservation_id: reservationId,
        model_call_id: idA,
        idempotency_key: idFor('idem-a3-unknown'),
        tariff: F_TARIFF,
        request: { prompt: 'T37-A3-unknown' },
      }),
    );
    expect(resA.ok ? 'branche-unknown-executee' : `BRANCHE-UNKNOWN-EN-ECHEC ${messageDe((resA as { err: unknown }).err)}`).toBe(
      'branche-unknown-executee',
    );
    const valA = (resA as { ok: true; value: Json }).value;
    expect(valA.remote_status === ETAT_UNKNOWN ? 'remote-status-unknown' : `REMOTE-STATUS-INATTENDU ${rendu(valA.remote_status)}`).toBe(
      'remote-status-unknown',
    ); // cahier:L69/L99

    // Branche 2 : MEME scenario de panne, mais un recu hors-bande arrive ->
    // reconciliation prouvee, cout EXACTEMENT 340 (F-MONEY), jamais zero.
    const provider2 = await essayer(() => createFakeProvider({ responses: [{ text: 'r', usage: F_USAGE }] }));
    expect(provider2.ok).toBe(true);
    const prov2 = (provider2 as { ok: true; value: { complete: Fn; calls: number } }).value;

    const idB = idFor('call-a3-reconciled');
    const resB = await essayer(() =>
      runFaultDrill({
        point: PT_APRES_DISPATCH_STARTED,
        journal_path: cheminJournal,
        handle,
        provider: prov2,
        budget_id: budgetId,
        reservation_id: reservationId,
        model_call_id: idB,
        idempotency_key: idFor('idem-a3-reconciled'),
        tariff: F_TARIFF,
        request: { prompt: 'T37-A3-reconciled' },
        receipt: { usage: F_USAGE },
      }),
    );
    expect(resB.ok ? 'branche-reconciliee-executee' : `BRANCHE-RECONCILIEE-EN-ECHEC ${messageDe((resB as { err: unknown }).err)}`).toBe(
      'branche-reconciliee-executee',
    );
    const valB = (resB as { ok: true; value: Json }).value;
    expect(
      valB.remote_status === 'RECONCILED' ? 'remote-status-reconcilie' : `REMOTE-STATUS-INATTENDU ${rendu(valB.remote_status)}`,
    ).toBe('remote-status-reconcilie');
    const coutB = interpretMontant(valB.remote_cost);
    expect(coutB !== null && coutB > 0 ? 'cout-non-nul' : `COUT-NUL-OU-INVALIDE ${rendu(valB.remote_cost)}`).toBe('cout-non-nul'); // cahier:L69 « jamais a zero »
    expect(coutB === F_UN_APPEL ? 'cout-egal-340' : `COUT-INATTENDU ${rendu(coutB)} attendu=${F_UN_APPEL}`).toBe('cout-egal-340'); // cahier:L103
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T37.A4 ══════════════════════════════════
 * absence — double assertion de non-presence : la copie privee d'evaluation
 * ne subsiste pas, et la sentinelle qu'elle contenait n'apparait nulle part
 * dans l'espace visible du developpeur (cahier:L333/L239-L245). */

test(
  "T37.A4 — anciennes copies d'evaluation detruites et aucune sentinelle divulguee",
  async () => {
    assertPackageLoaded('workflows');
    const runFaultDrill = requireRole('runFaultDrill');

    const sentinel = `bench-T37-A4-sentinel-${randomUUID()}`;
    const evalCopyRoot = cheminSable('a4-eval-copy');
    const developerRoot = cheminSable('a4-developer');
    fs.mkdirSync(evalCopyRoot, { recursive: true });
    fs.mkdirSync(developerRoot, { recursive: true });
    // La copie privee a deja execute ses tests caches et porte la sentinelle.
    fs.writeFileSync(path.join(evalCopyRoot, 'hidden-test-output.txt'), sentinel, 'utf8');

    const cheminJournal = cheminSable('t37-a4-journal.json');
    const res = await essayer(() =>
      runFaultDrill({
        point: PT_APRES_COMMIT_RESULTAT,
        journal_path: cheminJournal,
        eval_copy_root: evalCopyRoot,
        developer_root: developerRoot,
        sentinel,
      }),
    );
    expect(res.ok ? 'drill-execute' : `DRILL-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe('drill-execute');

    // CONTROLE INDEPENDANT 1 : la copie privee n'existe plus sur le disque.
    const copieRestante = fs.existsSync(evalCopyRoot);
    expect(!copieRestante ? 'copie-privee-detruite' : 'COPIE-PRIVEE-NON-DETRUITE').toBe('copie-privee-detruite'); // cahier:L333

    // CONTROLE INDEPENDANT 2 : la sentinelle n'apparait NULLE PART sous
    // l'espace developpeur — parcours recursif, pas une simple lecture d'un
    // seul fichier attendu.
    function contientSentinelle(racine: string): boolean {
      if (!fs.existsSync(racine)) return false;
      const pile = [racine];
      while (pile.length > 0) {
        const cur = pile.pop() as string;
        const st = fs.statSync(cur);
        if (st.isDirectory()) {
          for (const nom of fs.readdirSync(cur)) pile.push(path.join(cur, nom));
        } else if (st.isFile()) {
          if (fs.readFileSync(cur, 'utf8').includes(sentinel)) return true;
        }
      }
      return false;
    }
    const fuite = contientSentinelle(developerRoot);
    expect(!fuite ? 'sentinelle-absente-du-developpeur' : 'SENTINELLE-PRESENTE-A-TORT-CHEZ-LE-DEVELOPPEUR').toBe(
      'sentinelle-absente-du-developpeur',
    ); // cahier:L333

    const val = (res as { ok: true; value: Json }).value;
    expect(val.old_eval_copy_count === 0 ? 'rapport-coherent-copies' : `RAPPORT-INCOHERENT old_eval_copy_count=${rendu(val.old_eval_copy_count)}`).toBe(
      'rapport-coherent-copies',
    );
    expect(val.sentinel_leaked === false ? 'rapport-coherent-sentinelle' : `RAPPORT-INCOHERENT sentinel_leaked=${rendu(val.sentinel_leaked)}`).toBe(
      'rapport-coherent-sentinelle',
    );
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T37.A5 ══════════════════════════════════
 * refusal — un lot de reglement portant une perte et un doublon de recu est
 * REJETE EN BLOC et NOMME les deux anomalies ; un lot propre, lui, est
 * ACCEPTE (controle positif, meme discipline que T17.A7 : un stub qui leve
 * toujours ferait « detecter » a tort). */

test(
  'T37.A5 — pertes et doublons de recus sont detectes et rejettent le lot',
  async () => {
    assertReferences();
    assertPackageLoaded('storage');
    assertPackageLoaded('billing');
    assertPackageLoaded('gateway');
    assertPackageLoaded('workflows');

    const runFaultDrill = requireRole('runFaultDrill');
    const createFakeProvider = requireRole('createFakeProvider');
    const dispatchModelCall = requireRole('dispatchModelCall');
    const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a5', 5_000, 50_000);
    const cheminJournal = cheminSable('t37-a5-journal.json');

    /** Produit un ModelCall UNKNOWN reel : panne apres reception fournisseur,
     * avant sauvegarde de reponse (T17.A2/`afterProviderResponse`). */
    async function creerAppelUnknown(etiquette: string): Promise<string> {
      const id = idFor(`call-a5-${etiquette}`);
      const provider = await essayer(() => createFakeProvider({ responses: [{ text: 'r', usage: F_USAGE }] }));
      expect(provider.ok).toBe(true);
      const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;
      const r = await essayer(() =>
        dispatchModelCall(
          handle,
          {
            model_call_id: id,
            idempotency_key: idFor(`idem-a5-${etiquette}`),
            budget_id: budgetId,
            reservation_id: reservationId,
            provider: prov,
            request: { prompt: `T37-A5-${etiquette}` },
            tariff: F_TARIFF,
          },
          {
            afterProviderResponse: () => {
              throw new Error('PANNE-SIMULEE-T37-A5');
            },
          },
        ),
      );
      // La panne simulee doit avoir interrompu l'appel (comportement deja
      // prouve par T17.A2) — sinon la suite ne construirait pas un UNKNOWN reel.
      expect(r.ok ? `APPEL-${etiquette}-N-A-PAS-ECHOUE-COMME-ATTENDU` : 'panne-simulee-propagee').toBe('panne-simulee-propagee');
      return id;
    }

    const idPerdu = await creerAppelUnknown('perdu'); // ne recevra JAMAIS de recu
    const idDouble = await creerAppelUnknown('double'); // recevra DEUX recus conflictuels

    // Lot AMBIGU : idPerdu absent, idDouble present deux fois.
    const lotAmbigu = [
      { model_call_id: idDouble, usage: F_USAGE },
      { model_call_id: idDouble, usage: { ...F_USAGE, output_tokens: F_USAGE_SORTIE + 1 } },
    ];
    const rAmbigu = await essayer(() =>
      runFaultDrill({
        point: PT_APRES_SAUVEGARDE_AVANT_REGLEMENT,
        journal_path: cheminJournal,
        handle,
        tariff: F_TARIFF,
        receipts: lotAmbigu,
        expected_model_call_ids: [idPerdu, idDouble],
      }),
    );
    expect(rAmbigu.ok ? 'LOT-AMBIGU-ACCEPTE-A-TORT' : 'lot-ambigu-rejete').toBe('lot-ambigu-rejete'); // cahier:L305
    const err = (rAmbigu as { err: unknown }).err;
    expect(
      !MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? 'rejet-propre-pas-un-plantage' : `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}`,
    ).toBe('rejet-propre-pas-un-plantage');
    expect(codeDe(err) === CODE_RECEIPTS_REJECTED ? 'code-rejet-attendu' : `CODE-INATTENDU ${rendu(codeDe(err))}`).toBe(
      'code-rejet-attendu',
    );
    const anomalies = anomaliesDe(err);
    const aPerte = anomalies.some((a) => a.model_call_id === idPerdu && a.code === ANOMALIE_PERTE);
    const aDoublon = anomalies.some((a) => a.model_call_id === idDouble && a.code === ANOMALIE_DOUBLON);
    expect(aPerte ? 'perte-nommee' : `PERTE-NON-NOMMEE anomalies=${rendu(anomalies)}`).toBe('perte-nommee');
    expect(aDoublon ? 'doublon-nomme' : `DOUBLON-NON-NOMME anomalies=${rendu(anomalies)}`).toBe('doublon-nomme');

    // CONTROLE POSITIF : un lot PROPRE (un recu par appel, aucun absent, aucun
    // doublon) pour deux AUTRES appels est, lui, ACCEPTE.
    const idPropreA = await creerAppelUnknown('propre-a');
    const idPropreB = await creerAppelUnknown('propre-b');
    const lotPropre = [
      { model_call_id: idPropreA, usage: F_USAGE },
      { model_call_id: idPropreB, usage: F_USAGE },
    ];
    const rPropre = await essayer(() =>
      runFaultDrill({
        point: PT_APRES_SAUVEGARDE_AVANT_REGLEMENT,
        journal_path: cheminJournal,
        handle,
        tariff: F_TARIFF,
        receipts: lotPropre,
        expected_model_call_ids: [idPropreA, idPropreB],
      }),
    );
    expect(
      rPropre.ok ? 'lot-propre-accepte' : `LOT-PROPRE-REJETE-A-TORT ${messageDe((rPropre as { err: unknown }).err)}`,
    ).toBe('lot-propre-accepte'); // defense contre un stub qui refuse tout
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T37.A6 ══════════════════════════════════
 * absence — un arret simule a repetition, au meme point et sur la meme
 * periode, ne retire JAMAIS cette periode (ni aucune autre) du calendrier. */

test(
  "T37.A6 — arret repete n'retire aucune periode du calendrier",
  async () => {
    assertReferences();
    assertPackageLoaded('workflows');
    const runFaultDrill = requireRole('runFaultDrill');

    const campaignId = idFor('camp-a6');
    const periodIndex = 2;
    const calendrierInitial = Array.from({ length: K }, (_, i) => i + 1); // [1,2,3,4], cahier:L121
    const cheminJournal = cheminSable('t37-a6-journal.json');

    const NOMBRE_ARRETS = 3; // « repete » : plus d'une fois, cf. cases.lock.json
    for (let tentative = 1; tentative <= NOMBRE_ARRETS; tentative += 1) {
      const r = await essayer(() =>
        runFaultDrill({
          point: PT_AVANT_PUBLICATION_PERIODE,
          journal_path: cheminJournal,
          campaign_id: campaignId,
          period_index: periodIndex,
          scheduled_periods: calendrierInitial,
        }),
      );
      expect(r.ok ? `arret-${tentative}-execute` : `ARRET-${tentative}-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe(
        `arret-${tentative}-execute`,
      );
    }

    // CONTROLE INDEPENDANT : relecture du journal, pas la seule derniere
    // valeur de retour.
    const journal = lireJournal(cheminJournal);
    const entrees = journal.filter((e) => e.campaign_id === campaignId && e.period_index === periodIndex);
    expect(entrees.length >= NOMBRE_ARRETS ? 'journal-complet' : `JOURNAL-INCOMPLET n=${entrees.length} attendu>=${NOMBRE_ARRETS}`).toBe(
      'journal-complet',
    );

    for (const [i, e] of entrees.entries()) {
      const cal = Array.isArray(e.schedule_period_indices) ? (e.schedule_period_indices as unknown[]) : null;
      expect(cal !== null ? `calendrier-present-${i}` : `CALENDRIER-ABSENT-ENTREE-${i} ${rendu(e)}`).toBe(`calendrier-present-${i}`);
      const tri = [...(cal as number[])].slice().sort((a, b) => a - b);
      const attendu = calendrierInitial.slice().sort((a, b) => a - b);
      expect(
        JSON.stringify(tri) === JSON.stringify(attendu)
          ? `calendrier-intact-${i}`
          : `PERIODE-RETIREE-DU-CALENDRIER entree=${i} calendrier=${rendu(cal)} attendu=${rendu(attendu)}`,
      ).toBe(`calendrier-intact-${i}`); // cahier:L483 « n'retire aucune periode »
    }
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T37.A7 ══════════════════════════════════
 * behaviour — le journal de reprise, lu depuis le disque, est COMPLET
 * (une entree par point drille) et porte des IDENTITES STABLES : meme
 * identite metier -> meme resumable_identity, identites distinctes ->
 * resumable_identity distincts. */

test(
  'T37.A7 — journal de reprise complet avec identites stables',
  async () => {
    assertReferences();
    assertPackageLoaded('storage');
    assertPackageLoaded('billing');
    assertPackageLoaded('gateway');
    assertPackageLoaded('workflows');

    const runFaultDrill = requireRole('runFaultDrill');
    const createFakeProvider = requireRole('createFakeProvider');
    const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a7');
    const cheminJournal = cheminSable('t37-a7-journal.json');

    // Point 1, exerce DEUX fois avec la MEME identite d'operation (repetition
    // d'un meme appel resumable) : meme model_call_id/idempotency_key.
    const idemA = idFor('idem-a7-dispatch');
    const modelCallIdA = idFor('call-a7-dispatch');
    async function drillDispatch(): Promise<Json> {
      const provider = await essayer(() => createFakeProvider({ responses: [{ text: 'r', usage: F_USAGE }] }));
      expect(provider.ok).toBe(true);
      const prov = (provider as { ok: true; value: { complete: Fn; calls: number } }).value;
      const r = await essayer(() =>
        runFaultDrill({
          point: PT_AVANT_DISPATCH_STARTED,
          journal_path: cheminJournal,
          handle,
          provider: prov,
          budget_id: budgetId,
          reservation_id: reservationId,
          model_call_id: modelCallIdA,
          idempotency_key: idemA,
          tariff: F_TARIFF,
          request: { prompt: 'T37-A7-dispatch' },
        }),
      );
      expect(r.ok ? 'drill-dispatch-execute' : `DRILL-DISPATCH-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`).toBe(
        'drill-dispatch-execute',
      );
      return (r as { ok: true; value: Json }).value;
    }
    await drillDispatch();
    await drillDispatch(); // meme identite, exerce une seconde fois

    // Point 2, DISTINCT du premier, avec une identite elle aussi distincte.
    const campaignId = idFor('camp-a7');
    const periodIndex = 1;
    const rCheckpoint = await essayer(() =>
      runFaultDrill({
        point: PT_PENDANT_CHECKPOINT,
        journal_path: cheminJournal,
        campaign_id: campaignId,
        period_index: periodIndex,
      }),
    );
    expect(
      rCheckpoint.ok ? 'drill-checkpoint-execute' : `DRILL-CHECKPOINT-EN-ECHEC ${messageDe((rCheckpoint as { err: unknown }).err)}`,
    ).toBe('drill-checkpoint-execute');

    // CONTROLE INDEPENDANT : relecture du journal depuis le disque.
    const journal = lireJournal(cheminJournal);

    const entreesPourModelCallA = journal.filter(
      (e) => e.point === PT_AVANT_DISPATCH_STARTED && JSON.stringify(e).includes(modelCallIdA),
    );
    expect(entreesPourModelCallA.length >= 2 ? 'completude-point-dispatch' : `JOURNAL-INCOMPLET-DISPATCH n=${entreesPourModelCallA.length}`).toBe(
      'completude-point-dispatch',
    ); // cahier:L68/L483

    const identitesDispatch = new Set(entreesPourModelCallA.map((e) => e.resumable_identity));
    expect(
      identitesDispatch.size === 1 ? 'identite-stable-entre-deux-reprises' : `IDENTITE-INSTABLE ${rendu([...identitesDispatch])}`,
    ).toBe('identite-stable-entre-deux-reprises'); // cahier:L68 « deduplique par cle d'operation »

    const entreesCheckpoint = journal.filter((e) => e.point === PT_PENDANT_CHECKPOINT && e.campaign_id === campaignId && e.period_index === periodIndex);
    expect(entreesCheckpoint.length >= 1 ? 'completude-point-checkpoint' : `JOURNAL-INCOMPLET-CHECKPOINT ${rendu(entreesCheckpoint)}`).toBe(
      'completude-point-checkpoint',
    ); // cahier:L483

    const identiteDispatch = [...identitesDispatch][0];
    const identiteCheckpoint = entreesCheckpoint[0]?.resumable_identity;
    expect(
      identiteDispatch !== undefined && identiteCheckpoint !== undefined && identiteDispatch !== identiteCheckpoint
        ? 'identites-distinctes-pour-points-distincts'
        : `IDENTITES-NON-DISTINGUEES dispatch=${rendu(identiteDispatch)} checkpoint=${rendu(identiteCheckpoint)}`,
    ).toBe('identites-distinctes-pour-points-distincts');
  },
  CASE_TIMEOUT_MS,
);
