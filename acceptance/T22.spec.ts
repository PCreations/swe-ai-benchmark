/**
 * acceptance/T22.spec.ts — suite d'acceptation de la tache T22.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T22.A1 numeric   — meme symptome/signature observe trois fois produit un
 *                      incident et trois occurrences
 *   T22.A2 behaviour — probleme distinct produit un second incident
 *   T22.A3 absence   — ticket apparait a la periode suivante prevue, sans
 *                      solution cachee
 *   T22.A4 behaviour — panne exterieure prevue distinguee d'un defaut du
 *                      candidat
 *   T22.A5 behaviour — violation critique declenche la politique figee (mise
 *                      hors service, degradation du service mesure)
 *   T22.A6 behaviour — tri du backlog par priorite, echeance puis
 *                      identifiant, independamment de l'ordre des threads
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T22 — `packages/evaluation` et
 * `packages/domain` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff, pas une
 * barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T22.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle sur T22 :
 *
 *   L345  dependances T04, T08, T20, T21 ; livrables MOT POUR MOT : « classi-
 *         fication deterministe des defauts observes, deduplication, poli-
 *         tique de revelation et action critique ».
 *   L349  les six cas d'acceptation, MOT POUR MOT — dont le chiffre exact
 *         « trois » (A1) et l'ordre de tri « priorite, echeance puis identi-
 *         fiant » (A6).
 *   L351  fin : « aucune IA n'invente librement les incidents principaux ; un
 *         resume narratif peut etre ajoute sans modifier les faits
 *         structures, les priorites ou le cout ».
 *   L71   invariant D9 (applicable par principe general) : « les depenses
 *         utilisent des entiers exacts » — par analogie, les compteurs
 *         d'occurrences de ce cahier sont des entiers exacts, jamais une
 *         estimation flottante ; cette suite ne compare donc `occurrences`
 *         qu'en entiers stricts (`toBe`, jamais `toBeCloseTo`).
 *   L64   invariant D2 : « une revelation de periode k ne contient ni
 *         besoins, ni reponses metier, ni tests prives de k+1 » — principe
 *         DONT L349 (A3) est une instance specifique au backlog : un ticket
 *         ne doit reveler ni la periode suivante en avance, ni la solution
 *         cachee du test qui l'a detecte.
 *
 * Les blocs suivants de docs/specs/T22.md, epingles sur T22 par transitivite
 * de dependance mais SANS fournir de littéral exploitable pour CE cahier des
 * charges (aucune fixture `acceptance/reference/**` ne porte sur les
 * incidents ou le backlog — `docs/FROZEN_ROOTS.json` liste dix fixtures F-*,
 * aucune nommee F-INCIDENT ou F-BACKLOG), servent seulement de CONTEXTE :
 *   L185-193 (T04, applies T22.A1/A2/A5/A6) — metriques de periode pures,
 *            dont Q/R/G ; rien n'y fixe un format d'incident.
 *   L219-225 (T08, applies T22.A1-A4) — intentions d'usage et horloge
 *            metier ; rien n'y fixe un format d'observation au-dela de la
 *            table E deja citee plus haut.
 *   L327-336 (T20, applies T22.A1/A2/A4/A5) — evaluateur sur copies privees ;
 *            confirme que les observations examinees par T22 proviennent de
 *            ce runner, sans en fixer le schema de sortie.
 *   L337-343 (T21, applies T22.A3/A5/A6) — admission des livraisons ; publie
 *            son propre `backlog` (exigences dues non satisfaites), DISTINCT
 *            du backlog d'incidents que T22 construit ici.
 * Faute d'enonce du cahier sur la forme exacte des appels de T22 (meme
 * situation que T20 fixant `EvaluationResult` ou T21 fixant `admitDelivery`),
 * cette suite FIXE le contrat ci-dessous (section III) — en le marquant
 * explicitement comme invente, jamais comme extrait du cahier.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 * (a) IMPORTS de `acceptance/reference/**` : AUCUN. Aucune fixture gelee ne
 *     porte sur les incidents, l'origine des defauts ou le tri du backlog ;
 *     `docs/FROZEN_ROOTS.json` le confirme (dix fichiers F-*, aucun dedie a
 *     T22). Toutes les entrees de cette suite sont donc FABRIQUEES.
 * (b) COMMENTAIRES `// cahier:L<n>` resolubles par `sed -n '<n>p' docs/cahier.md` :
 *       3 (SAME_SIGNATURE_TIMES)     — L349, « observe trois fois [...] trois
 *                                      occurrences »
 *       l'ordre « priorite, echeance,
 *       identifiant »                — L349, mot pour mot
 *       la periode de revelation
 *       = periode d'observation + 1  — L349, « periode suivante prevue »
 * Tout le reste — noms de roles (`ingestObservations`, `classifyDefectOrigin`,
 * `applyCriticalViolationPolicy`, `sortBacklog`), noms de champs, valeurs
 * d'enum (`CANDIDATE_DEFECT`/`EXTERNAL_FAILURE`), convention numerique de
 * priorite, signatures et dates fabriquees — est INVENTE PAR CETTE SUITE,
 * faute d'enonce plus precis dans le cahier, et sert d'ENTREE ou de CONTRAT
 * FIXE, jamais d'une valeur de sortie observee sur une implementation
 * existante (aucune implementation de T22 n'existe au moment ou cette suite
 * est ecrite).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T22 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Paquets interroges : `packages/evaluation` et `packages/domain` (les deux
 * `source_paths` de T22). Le chargement ne LEVE jamais : chaque cas asserte
 * lui-meme le chargement, en le NOMMANT.
 *
 * 1. `ingestObservations(input): Promise<IngestResult> | IngestResult`
 *
 *    `input` :
 *      period_index: number            // periode METIER courante (>= 1)
 *      prior_incidents: Incident[]     // etat precedent (vide au depart) —
 *                                      // fonction PURE qui enchaine son
 *                                      // propre etat, sans base (packages/
 *                                      // domain : « metriques pures », §C :
 *                                      // « le coeur metier ne depend ni de
 *                                      // Temporal, ni de Docker [...] »)
 *      observations: Array<{
 *        signature: string             // cle de DEDUPLICATION du symptome
 *        origin: string                // etiquette produite par le role 2
 *                                      // (`classifyDefectOrigin`) — fournie
 *                                      // ici telle quelle, sans etre
 *                                      // reinterpretee par ce role
 *        hidden_test_expectation?: {   // JAMAIS recopie dans le ticket
 *          root_cause: string
 *          expected_fix: string
 *        }
 *      }>
 *
 *    `Incident` (element de `prior_incidents` ET de `IngestResult.incidents`) :
 *      id: string                      // stable, derive de `signature`
 *      signature: string
 *      occurrences: number             // entier exact — cahier D9 (L71), par
 *                                      // analogie
 *      ticket: {
 *        id: string
 *        revealed_at_period: number    // = periode de la PREMIERE
 *                                      // observation + 1 (cahier:L349,
 *                                      // « periode suivante prevue ») —
 *                                      // fige a la premiere observation,
 *                                      // non decale par les occurrences
 *                                      // suivantes
 *      }
 *
 *    `IngestResult` : `{ incidents: Incident[] }`
 *
 * 2. `classifyDefectOrigin(input): Promise<string> | string`
 *
 *      unavailable: boolean            // cahier E, `Observation.indisponi-
 *                                      // bilite eventuelle`
 *      external_outage_window: boolean // vrai si l'indisponibilite tombe
 *                                      // dans une fenetre de panne EXTERNE
 *                                      // PREVUE (injectee par le workload,
 *                                      // T08), jamais imputable au candidat
 *
 *    Retourne une etiquette (chaine) qui DOIT differer entre
 *    `external_outage_window:true` et `external_outage_window:false` a
 *    `unavailable` egal (cahier:L349, A4) — cette suite fixe par convention
 *    les noms `EXTERNAL_FAILURE` / `CANDIDATE_DEFECT` pour SES PROPRES
 *    entrees de controle, mais n'exige pas ces noms exacts en sortie : seule
 *    la DISTINCTION des deux etiquettes produites est verifiee.
 *
 * 3. `applyCriticalViolationPolicy(input): Promise<PolicyResult> | PolicyResult`
 *
 *      critical_violation: boolean         // un invariant critique
 *                                          // applicable a ete viole
 *      measured_service_before: number     // valeur du service mesure avant
 *                                          // application (ex. R, dans
 *                                          // [0,1])
 *
 *    `PolicyResult` :
 *      service_suspended: boolean          // mise hors service jusqu'a
 *                                          // correction (cahier:L349,
 *                                          // « par exemple »)
 *      measured_service_after: number      // valeur APRES application —
 *                                          // STRICTEMENT degradee
 *                                          // (< measured_service_before) si
 *                                          // `critical_violation`, sinon
 *                                          // INCHANGEE
 *
 * 4. `sortBacklog(items): Promise<Item[]> | Item[]`
 *
 *      items: Array<{ id: string; priority: number; due_date: string }>
 *
 *    Trie `items` par `priority` CROISSANTE (convention FIXEE PAR CETTE
 *    SUITE, faute de convention donnee par le cahier sur le sens numerique :
 *    la valeur la plus PETITE est la plus URGENTE, convention usuelle de
 *    file de priorite), puis par `due_date` croissante, puis par `id`
 *    lexicographique (cahier:L349, « priorite, echeance puis identifiant »).
 *    Le resultat ne doit PAS dependre de l'ordre d'entree.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * ALIAS DE RESOLUTION (tolerance de NOMMAGE, jamais de COMPORTEMENT — meme
 * geste que T09/T20/T21).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * LES DANGERS PROPRES A T22, ET LEUR CONTROLE DANS CETTE SUITE.
 *
 * (1) A1 ET A2 PARTAGENT LA MEME FONCTION (`ingestObservations`) : un mutant
 *     qui casse la DEDUPLICATION (A2) pourrait, s'il etait un stub total,
 *     casser aussi le COMPTAGE (A1). Cette suite les isole : A1 n'envoie
 *     jamais qu'UN seul symptome (le comptage seul est exerce), A2 exerce
 *     explicitement la CREATION d'un second incident sans jamais revenir sur
 *     le premier (occurrences du premier verifiees INCHANGEES).
 * (2) A3 EST UN CAS `absence` : un stub total qui supprimerait le ticket
 *     rendrait l'assertion « ne contient pas la solution » vraie par VIDE,
 *     sans rien prouver. Cette suite exige D'ABORD la PRESENCE reelle d'un
 *     ticket (id non vide, periode de revelation correcte) AVANT d'exiger
 *     l'absence de la solution cachee — et cette absence est verifiee sur la
 *     representation PROFONDE entiere du resultat (`rendu`), pas sur un seul
 *     champ nomme, pour resister a un renommage de champ qui deplacerait la
 *     fuite ailleurs.
 * (3) A4 CONTROLE LA DISTINCTION, PAS UN NOM D'ETIQUETTE : le cahier ne fixe
 *     aucun nom d'enum pour l'origine d'un defaut (contrairement a
 *     `deployment_coverage`, fixe par T21). Exiger un nom precis inventerait
 *     une contrainte absente du cahier ; cette suite exige seulement que
 *     DEUX entrees qui ne different QUE par `external_outage_window`
 *     produisent DEUX etiquettes DIFFERENTES, et que la classification soit
 *     STABLE (rejouee, elle redonne la meme etiquette).
 * (4) A5 NE FIGE PAS LA VALEUR CIBLE DE DEGRADATION : le cahier dit
 *     « degrade le service mesure », jamais « ramene a zero ». Cette suite
 *     exige une DEGRADATION STRICTE (`measured_service_after <
 *     measured_service_before`) plutot qu'une valeur exacte non enoncee —
 *     eviter d'inventer une contrainte que le cahier ne pose pas, cf. le
 *     « par exemple » de L349 qui qualifie deja la mise hors service.
 * (5) A6 EST TESTE SUR DEUX ORDRES D'ENTREE DISTINCTS (« threads ») POUR LE
 *     MEME JEU D'ELEMENTS, avec un jeu concu pour exercer LES TROIS NIVEAUX
 *     de la cle de tri a la fois : un element de priorite plus urgente mais
 *     d'echeance plus lointaine (doit passer en tete malgre son echeance),
 *     deux elements de meme priorite departages par l'echeance, et deux
 *     elements de meme priorite ET meme echeance departages par l'identifiant.
 *     Un comparateur qui ne trie que sur la priorite, ou qui renvoie
 *     toujours 0 (ordre d'insertion conserve), echoue sur CE jeu precis.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • Elle n'utilise pas PostgreSQL ni aucun service reel : les cas requis de
 *    T22 (verification/cases.lock.json) ne declarent QUE `node22` dans leurs
 *    `requires` — aucun ne porte `postgres18` ni `s3`, a la difference de
 *    T21.A1/A2/A7. Le contrat de T22, tel que fixe ici, est un ensemble de
 *    fonctions PURES de `packages/domain`/`packages/evaluation` (cahier §C :
 *    « le coeur metier ne depend ni de Temporal, ni de Docker [...] »).
 *  • Elle ne fait pas tourner le runner d'evaluation de T20 ni l'admission
 *    de T21 : les « observations » et le « service mesure » sont des entrees
 *    FABRIQUEES directement, T22 portant sur la TRANSFORMATION d'observations
 *    deja produites en incidents et backlog, pas sur leur production.
 *  • Elle ne verifie pas que le resume narratif optionnel (cahier:L351,
 *    « un resume narratif peut etre ajoute sans modifier les faits
 *    structures ») soit absent ou present : le cahier le rend facultatif:
 *    cette suite n'exige ni sa presence ni son absence, seulement que les
 *    CHAMPS STRUCTURES qu'elle verifie (occurrences, ticket, origine,
 *    suspension, tri) restent corrects.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 15_000;

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

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

async function essayer<T>(
  thunk: () => T | Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

const RUN = `t22_${process.pid.toString(36)}_${Date.now().toString(36)}`;
let COMPTEUR = 0;
function nomUnique(suffixe: string): string {
  COMPTEUR += 1;
  return `${RUN}_${COMPTEUR}_${suffixe}`;
}

/* ══════════════════════ chargement des deux source_paths de T22 ═══════ */

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
}

function specifiersForPackage(pkg: string): string[] {
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
  } else {
    // Paquet pas encore materialise : le nom conventionnel `@bench/<pkg>`
    // reste tente, jest.config.mjs le reecrit generiquement vers
    // packages/<pkg>/src/index.ts.
    out.push(`@bench/${pkg}`);
  }
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

/** LE SUJET : les deux source_paths de T22, et rien d'autre. */
function specifiersDuSujet(): string[] {
  return [...specifiersForPackage('evaluation'), ...specifiersForPackage('domain')];
}

async function charger(specs: string[], quoi: string): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  if (specs.length === 0) attempts.push(`aucun point d'entree ${quoi}`);
  for (const s of specs) {
    try {
      const mod = (await import(s)) as Ns;
      flatten(mod, flat);
      exportCount += Object.keys(mod).filter((k) => k !== '__esModule').length;
      via.push(s.replace(pathToFileURL(REPO).href, '<repo>'));
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  return { ok: via.length > 0, via, exportCount, flat, attempts };
}

const VIDE: Loaded = { ok: false, via: [], exportCount: 0, flat: new Map(), attempts: ['beforeAll non execute'] };
let LOADED: Loaded = VIDE;

beforeAll(async () => {
  LOADED = await charger(
    specifiersDuSujet(),
    "sous packages/evaluation ni packages/domain (les deux source_paths de T22)",
  );
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `SUJET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ─────────────────────────────────────────────── resolution par role */

type Fonction = (...a: unknown[]) => unknown;

const ROLES: Record<string, readonly string[]> = {
  ingestObservations: [
    'ingestObservations',
    'classifyAndDeduplicateObservations',
    'classifyObservationsIntoIncidents',
    'recordObservationsAsIncidents',
    'processObservationsIntoIncidents',
    'deduplicateDefectObservations',
    'ingestDefectObservations',
  ],
  classifyDefectOrigin: [
    'classifyDefectOrigin',
    'classifyObservationOrigin',
    'classifyFaultOrigin',
    'classifyIncidentOrigin',
    'distinguishDefectOrigin',
    'originOfObservedDefect',
  ],
  applyCriticalViolationPolicy: [
    'applyCriticalViolationPolicy',
    'applyCriticalPolicy',
    'enforceCriticalInvariantPolicy',
    'applyCriticalInvariantPolicy',
    'triggerCriticalViolationPolicy',
    'degradeServiceOnCriticalViolation',
  ],
  sortBacklog: [
    'sortBacklog',
    'orderBacklog',
    'sortBacklogItems',
    'rankBacklog',
    'prioritizeBacklog',
    'compareAndSortBacklog',
  ],
};

const RESOLVED = new Map<string, Fonction | null>();

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role];
  if (candidats === undefined) throw new Error(`role inconnu de la suite : ${role}`);
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

function requireRole(name: string): Fonction {
  const fn = resolveOpt(name);
  expect(
    fn !== null ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${ROLES[name]?.join(', ') ?? ''})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fonction;
}

async function appeler(
  role: string,
  ...args: unknown[]
): Promise<{ ok: true; value: unknown } | { ok: false; err: unknown }> {
  const fn = requireRole(role);
  return essayer(() => fn(...args));
}

/* ═══════════════════════ formes fixees par cette suite (§III) ══════════ */

interface TicketShape {
  id?: unknown;
  revealed_at_period?: unknown;
}

interface IncidentShape {
  id?: unknown;
  signature?: unknown;
  occurrences?: unknown;
  ticket?: TicketShape;
}

interface IngestResult {
  incidents: IncidentShape[];
}

function assertIngestShape(v: unknown, contexte: string): IngestResult {
  const o = v as Json | null;
  const okIncidents = Array.isArray(o?.incidents);
  expect(
    okIncidents
      ? `resultat-${contexte}-conforme`
      : `RESULTAT-NON-CONFORME ${contexte} incidents=${rendu(o?.incidents)} : ${court(rendu(v))}`,
  ).toBe(`resultat-${contexte}-conforme`);
  return v as IngestResult;
}

function trouverIncident(incidents: IncidentShape[], signature: string): IncidentShape | undefined {
  return incidents.find((i) => i.signature === signature);
}

interface BacklogItemIn {
  id: string;
  priority: number;
  due_date: string;
}

/* ══════════════════════════════════════════════════════════════════ cas ═ */

describe('T22 — transformer les observations en incidents et backlog', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T22.A1 — meme symptome/signature observe trois fois produit un incident et trois occurrences',
    async () => {
      assertLoaded();
      requireRole('ingestObservations');

      const SAME_SIGNATURE_TIMES = 3; // cahier:L349 « observe trois fois [...] trois occurrences »
      const signature = nomUnique('sig-a1');
      const obs = (): Json => ({ signature, origin: 'CANDIDATE_DEFECT' });

      // Premier appel : DEUX observations du MEME symptome, en lot, periode 1.
      const r1 = await appeler('ingestObservations', {
        period_index: 1,
        prior_incidents: [],
        observations: [obs(), obs()],
      });
      expect(
        r1.ok ? 'appel-1-execute' : `APPEL-1-EN-ECHEC ${messageDe((r1 as { err: unknown }).err)}`,
      ).toBe('appel-1-execute');
      const res1 = assertIngestShape((r1 as { ok: true; value: unknown }).value, 'A1-lot1');
      expect(res1.incidents.length).toBe(1);
      const inc1 = trouverIncident(res1.incidents, signature);
      expect(inc1 !== undefined ? 'incident-cree' : `INCIDENT-ABSENT ${rendu(res1.incidents)}`).toBe(
        'incident-cree',
      );
      expect((inc1 as IncidentShape).occurrences).toBe(2);

      // Second appel : UNE troisieme observation du MEME symptome, periode 2,
      // en ENCHAINANT l'etat precedent (fonction PURE qui thread son propre
      // etat, sans base — cahier §C).
      const r2 = await appeler('ingestObservations', {
        period_index: 2,
        prior_incidents: res1.incidents,
        observations: [obs()],
      });
      expect(
        r2.ok ? 'appel-2-execute' : `APPEL-2-EN-ECHEC ${messageDe((r2 as { err: unknown }).err)}`,
      ).toBe('appel-2-execute');
      const res2 = assertIngestShape((r2 as { ok: true; value: unknown }).value, 'A1-lot2');
      expect(res2.incidents.length).toBe(1); // TOUJOURS un seul incident pour ce symptome
      const inc2 = trouverIncident(res2.incidents, signature);
      expect(inc2 !== undefined ? 'incident-toujours-present' : `INCIDENT-PERDU ${rendu(res2.incidents)}`).toBe(
        'incident-toujours-present',
      );
      expect((inc2 as IncidentShape).occurrences).toBe(SAME_SIGNATURE_TIMES);

      // Le ticket reste ancre sur la PREMIERE periode d'observation : la
      // reapparition a P2 ne decale pas sa date de revelation.
      expect((inc2 as IncidentShape).ticket?.revealed_at_period).toBe(2);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T22.A2 — probleme distinct produit un second incident',
    async () => {
      assertLoaded();
      requireRole('ingestObservations');

      const sigA = nomUnique('sig-a2-a');
      const sigB = nomUnique('sig-a2-b');

      // CONTROLE : un premier symptome cree bien un premier incident.
      const r1 = await appeler('ingestObservations', {
        period_index: 1,
        prior_incidents: [],
        observations: [{ signature: sigA, origin: 'CANDIDATE_DEFECT' }],
      });
      expect(
        r1.ok ? 'controle-execute' : `CONTROLE-EN-ECHEC ${messageDe((r1 as { err: unknown }).err)}`,
      ).toBe('controle-execute');
      const res1 = assertIngestShape((r1 as { ok: true; value: unknown }).value, 'A2-controle');
      expect(res1.incidents.length).toBe(1);
      const incA1 = trouverIncident(res1.incidents, sigA);
      expect((incA1 as IncidentShape).occurrences).toBe(1);

      // CAS REEL : un symptome DISTINCT, enchaine sur l'etat precedent.
      const r2 = await appeler('ingestObservations', {
        period_index: 1,
        prior_incidents: res1.incidents,
        observations: [{ signature: sigB, origin: 'CANDIDATE_DEFECT' }],
      });
      expect(
        r2.ok ? 'reel-execute' : `REEL-EN-ECHEC ${messageDe((r2 as { err: unknown }).err)}`,
      ).toBe('reel-execute');
      const res2 = assertIngestShape((r2 as { ok: true; value: unknown }).value, 'A2-reel');
      expect(res2.incidents.length).toBe(2); // cahier:L349 « un second incident »

      const incA2 = trouverIncident(res2.incidents, sigA);
      const incB2 = trouverIncident(res2.incidents, sigB);
      expect(
        incA2 !== undefined && incB2 !== undefined
          ? 'deux-incidents-distincts'
          : `INCIDENTS-MANQUANTS ${rendu(res2.incidents)}`,
      ).toBe('deux-incidents-distincts');
      expect((incA2 as IncidentShape).occurrences).toBe(1); // le premier n'est pas altere
      expect((incB2 as IncidentShape).occurrences).toBe(1);
      expect(
        (incA2 as IncidentShape).id !== (incB2 as IncidentShape).id
          ? 'identifiants-distincts'
          : `MEME-IDENTIFIANT-A-TORT ${rendu((incA2 as IncidentShape).id)}`,
      ).toBe('identifiants-distincts');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    "T22.A3 — ticket apparait a la periode suivante prevue, sans solution cachee",
    async () => {
      assertLoaded();
      requireRole('ingestObservations');

      const signature = nomUnique('sig-a3');
      const rootCause = nomUnique('CAUSE-RACINE-SECRETE');
      const expectedFix = nomUnique('CORRECTIF-ATTENDU-SECRET');
      const periodIndex = 5;

      const res = await appeler('ingestObservations', {
        period_index: periodIndex,
        prior_incidents: [],
        observations: [
          {
            signature,
            origin: 'CANDIDATE_DEFECT',
            hidden_test_expectation: { root_cause: rootCause, expected_fix: expectedFix },
          },
        ],
      });
      expect(
        res.ok ? 'appel-execute' : `APPEL-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`,
      ).toBe('appel-execute');
      const r = assertIngestShape((res as { ok: true; value: unknown }).value, 'A3');
      const inc = trouverIncident(r.incidents, signature);
      expect(inc !== undefined ? 'incident-cree' : `INCIDENT-ABSENT ${rendu(r.incidents)}`).toBe(
        'incident-cree',
      );

      // (1) le ticket APPARAIT — avec un identifiant reel, pas un champ vide —
      //     et a la periode SUIVANTE prevue (cahier:L349).
      const ticket = (inc as IncidentShape).ticket;
      expect(
        ticket !== undefined && typeof ticket.id === 'string' && (ticket.id as string).length > 0
          ? 'ticket-present'
          : `TICKET-ABSENT-OU-VIDE ${rendu(ticket)}`,
      ).toBe('ticket-present');
      expect(ticket?.revealed_at_period).toBe(periodIndex + 1); // cahier:L349 « periode suivante prevue »

      // (2) AUCUNE trace de la solution cachee nulle part dans le resultat —
      //     pas seulement dans un champ nomme, mais dans la representation
      //     PROFONDE entiere (protege contre un renommage de champ).
      const texteComplet = rendu(r);
      expect(
        !texteComplet.includes(rootCause)
          ? 'cause-racine-absente'
          : `CAUSE-RACINE-DIVULGUEE dans ${court(texteComplet)}`,
      ).toBe('cause-racine-absente');
      expect(
        !texteComplet.includes(expectedFix)
          ? 'correctif-absent'
          : `CORRECTIF-DIVULGUE dans ${court(texteComplet)}`,
      ).toBe('correctif-absent');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    "T22.A4 — panne exterieure prevue distinguee d'un defaut du candidat",
    async () => {
      assertLoaded();
      requireRole('classifyDefectOrigin');

      // Meme indisponibilite observee (cahier E : indisponibilite eventuelle
      // d'une Observation) ; seule la fenetre de panne EXTERNE PREVUE
      // (injectee par le workload, hors controle du candidat) change.
      const resExterne = await appeler('classifyDefectOrigin', {
        unavailable: true,
        external_outage_window: true,
      });
      expect(
        resExterne.ok
          ? 'classification-externe-executee'
          : `CLASSIFICATION-EXTERNE-EN-ECHEC ${messageDe((resExterne as { err: unknown }).err)}`,
      ).toBe('classification-externe-executee');
      const origineExterne = (resExterne as { ok: true; value: unknown }).value;
      expect(
        typeof origineExterne === 'string' && origineExterne.length > 0
          ? 'etiquette-externe-non-vide'
          : `ETIQUETTE-EXTERNE-INVALIDE ${rendu(origineExterne)}`,
      ).toBe('etiquette-externe-non-vide');

      const resCandidat = await appeler('classifyDefectOrigin', {
        unavailable: true,
        external_outage_window: false,
      });
      expect(
        resCandidat.ok
          ? 'classification-candidat-executee'
          : `CLASSIFICATION-CANDIDAT-EN-ECHEC ${messageDe((resCandidat as { err: unknown }).err)}`,
      ).toBe('classification-candidat-executee');
      const origineCandidat = (resCandidat as { ok: true; value: unknown }).value;
      expect(
        typeof origineCandidat === 'string' && origineCandidat.length > 0
          ? 'etiquette-candidat-non-vide'
          : `ETIQUETTE-CANDIDAT-INVALIDE ${rendu(origineCandidat)}`,
      ).toBe('etiquette-candidat-non-vide');

      // cahier:L349 « panne exterieure prevue est distinguee d'un defaut du
      // candidat » — les deux etiquettes DOIVENT differer.
      expect(
        origineExterne !== origineCandidat
          ? 'origines-distinguees'
          : `ORIGINES-NON-DISTINGUEES externe=${rendu(origineExterne)} candidat=${rendu(origineCandidat)}`,
      ).toBe('origines-distinguees');

      // Et de facon STABLE : rejouer la classification externe redonne la
      // meme etiquette (pas un hasard ni une alternance).
      const resExterne2 = await appeler('classifyDefectOrigin', {
        unavailable: true,
        external_outage_window: true,
      });
      const origineExterne2 = (resExterne2 as { ok: true; value: unknown }).value;
      expect(
        origineExterne2 === origineExterne
          ? 'classification-stable'
          : `CLASSIFICATION-INSTABLE premiere=${rendu(origineExterne)} seconde=${rendu(origineExterne2)}`,
      ).toBe('classification-stable');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T22.A5 — violation critique declenche la politique figee et degrade le service mesure',
    async () => {
      assertLoaded();
      requireRole('applyCriticalViolationPolicy');

      const serviceAvant = 0.75;

      // CONTROLE : aucune violation -> rien ne change.
      const controle = await appeler('applyCriticalViolationPolicy', {
        critical_violation: false,
        measured_service_before: serviceAvant,
      });
      expect(
        controle.ok ? 'controle-execute' : `CONTROLE-EN-ECHEC ${messageDe((controle as { err: unknown }).err)}`,
      ).toBe('controle-execute');
      const rc = (controle as { ok: true; value: unknown }).value as Json;
      expect(
        rc.service_suspended === false
          ? 'controle-service-non-suspendu'
          : `CONTROLE-SERVICE-SUSPENDU-A-TORT ${rendu(rc)}`,
      ).toBe('controle-service-non-suspendu');
      expect(
        rc.measured_service_after === serviceAvant
          ? 'controle-service-inchange'
          : `CONTROLE-SERVICE-ALTERE-A-TORT avant=${String(serviceAvant)} apres=${rendu(rc.measured_service_after)}`,
      ).toBe('controle-service-inchange');

      // CAS REEL : violation critique -> mise hors service ET degradation du
      // service mesure (cahier:L349, « par exemple mise hors service
      // jusqu'a correction, et degrade le service mesure »).
      const res = await appeler('applyCriticalViolationPolicy', {
        critical_violation: true,
        measured_service_before: serviceAvant,
      });
      expect(
        res.ok ? 'politique-executee' : `POLITIQUE-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`,
      ).toBe('politique-executee');
      const r = (res as { ok: true; value: unknown }).value as Json;
      expect(
        r.service_suspended === true ? 'mise-hors-service' : `MISE-HORS-SERVICE-ABSENTE ${rendu(r)}`,
      ).toBe('mise-hors-service'); // cahier:L349
      expect(
        typeof r.measured_service_after === 'number' && r.measured_service_after < serviceAvant
          ? 'service-degrade'
          : `SERVICE-NON-DEGRADE avant=${String(serviceAvant)} apres=${rendu(r.measured_service_after)}`,
      ).toBe('service-degrade'); // cahier:L349
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    "T22.A6 — tri du backlog par priorite, echeance puis identifiant, independamment de l'ordre des threads",
    async () => {
      assertLoaded();
      requireRole('sortBacklog');

      // Convention de priorite FIXEE PAR CETTE SUITE (non donnee par le
      // cahier, §III) : la valeur la plus PETITE est la plus URGENTE.
      const x: BacklogItemIn = { id: 'x', priority: 0, due_date: '2030-02-01T00:00:00Z' }; // plus urgent, echeance pourtant la plus lointaine
      const a: BacklogItemIn = { id: 'a', priority: 1, due_date: '2030-01-05T00:00:00Z' };
      const z: BacklogItemIn = { id: 'z', priority: 1, due_date: '2030-01-05T00:00:00Z' }; // meme priorite ET meme echeance que 'a' -> tranche par id
      const b: BacklogItemIn = { id: 'b', priority: 1, due_date: '2030-01-10T00:00:00Z' };
      const attendu = ['x', 'a', 'z', 'b']; // cahier:L349 « priorite, echeance puis identifiant »

      // Deux ORDRES D'ENTREE differents — deux "threads" distincts
      // (cahier:L349 « independamment de l'ordre des threads ») — doivent
      // produire la MEME sortie triee.
      const threads: Array<[string, BacklogItemIn[]]> = [
        ['thread-1', [b, x, a, z]],
        ['thread-2', [z, a, b, x]],
      ];

      for (const [nomOrdre, entree] of threads) {
        const res = await appeler('sortBacklog', entree);
        expect(
          res.ok
            ? `${nomOrdre}-execute`
            : `${nomOrdre.toUpperCase()}-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`,
        ).toBe(`${nomOrdre}-execute`);
        const trie = (res as { ok: true; value: unknown }).value;
        expect(Array.isArray(trie) ? 'resultat-tableau' : `RESULTAT-NON-TABLEAU ${rendu(trie)}`).toBe(
          'resultat-tableau',
        );
        const idsTries = (trie as BacklogItemIn[]).map((i) => i.id);
        expect(
          idsTries.length === attendu.length
            ? 'longueur-conservee'
            : `LONGUEUR-ALTEREE ${nomOrdre} obtenu=${rendu(idsTries)}`,
        ).toBe('longueur-conservee');
        for (let i = 0; i < attendu.length; i += 1) {
          expect(
            idsTries[i] === attendu[i]
              ? `${nomOrdre}-position-${String(i)}-correcte`
              : `${nomOrdre.toUpperCase()}-POSITION-${String(i)}-INCORRECTE obtenu=${rendu(idsTries)} attendu=${rendu(attendu)}`,
          ).toBe(`${nomOrdre}-position-${String(i)}-correcte`);
        }
      }
    },
    CASE_TIMEOUT_MS,
  );
});
