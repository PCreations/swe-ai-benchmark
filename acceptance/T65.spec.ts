/**
 * acceptance/T65.spec.ts — suite d'acceptation de la tache T65.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T65.A1 numeric   — a chaque periode persistee, Q, R, G et G_new sont CEUX
 *                      QUE DONNENT LES FONCTIONS DE T04 sur les controles de
 *                      la periode
 *   T65.A2 behaviour — une regle remplacee ou retiree n'est pas comptee en
 *                      regression ; une regle active autrefois satisfaite
 *                      puis violee L'EST
 *   T65.A3 behaviour — la chronologie d'une regle donne sa premiere periode
 *                      de satisfaction, ses periodes de regression et de
 *                      retablissement
 *   T65.A4 behaviour — chaque periode persistee porte lignes ajoutees et
 *                      supprimees, fichiers touches et nombre de fichiers de
 *                      test du commit du candidat, et ces mesures n'entrent
 *                      dans AUCUN score
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T65 EST UNE TACHE D'EXTENSION (ADR-018) : elle ne vient pas du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json ; son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-018-scenario-long-et-contradictoire.md, lignes 206-212),
 * jamais le cahier directement. L'auteur de cette suite est AVEUGLE aux
 * `source_paths` que verification/tasks.extensions.json declare pour T65 —
 * `packages/activities`, `packages/evaluation` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline
 * auditable au diff, jamais une barriere technique). Le contrat teste
 * ci-dessous est derive de docs/specs/T65.md et de sa source :
 *
 *   L208  livrables, mot pour mot : « Q, R, G et `G_new` par periode,
 *         calcules par les fonctions de T04 sur les controles reels ;
 *         chronologie par regle ; mesures du code par periode. »
 *   L210  les quatre cas d'acceptation, mot pour mot.
 *   L212  commande : `pnpm verify:task T65`. « PostgreSQL et le stockage
 *         objet sont requis ; aucun appel reel. »
 *   ADR-018, Decision point 4 (L59-62) : « Pour chaque periode : Q, R et la
 *         regression G/`G_new` selon les CONVENTIONS DU CAHIER (F-REGRESSION
 *         : une regle retiree n'est pas une regression). Pour chaque regle :
 *         la periode de premiere satisfaction, les periodes de regression et
 *         de retablissement. »
 *   ADR-018, Decision point 5 (L64-67) : « Des mesures du code. A chaque
 *         periode, sur le commit du candidat : lignes ajoutees et
 *         supprimees, fichiers touches, nombre de fichiers de test ecrits
 *         par le candidat. Ces mesures DECRIVENT ; elles n'entrent dans
 *         AUCUN score de qualite. »
 *
 * « les conventions du cahier » renvoie explicitement T04 (docs/specs/T04.md,
 * dont la suite acceptance/T04.spec.ts est ACCEPTEE et PROUVEE a HEAD) :
 *   cahier:L189  « G compte les regressions actuellement ouvertes [...]
 *         exigences actives dues, autrefois satisfaites et actuellement
 *         violees. `G_new` compte celles qui etaient satisfaites a la
 *         periode precedente comparable et deviennent violees. Une
 *         regression persistante contribue a G, sans redevenir nouvelle a
 *         chaque periode. »
 *   cahier:L129  F-REGRESSION : « une exigence remplacee [...] ne produit
 *         pas de regression [...] Compter par id/version active, pas par
 *         nombre d'assertions. »
 *
 * `packages/domain` EST LE PAQUET DE T04 (verification/tasks.json#T04,
 * `source_paths: ["packages/domain"]`) : une tache DISTINCTE de T65, deja
 * PROUVEE a HEAD, et ne figure dans AUCUN `source_paths` de T65. Lire son
 * export public et l'IMPORTER COMME ORACLE n'enfreint donc pas l'aveuglement
 * procedural de T65 — exactement ce que « calcules par les fonctions de T04 »
 * (L208) demande cette suite d'observer : que la tache sous test REUTILISE
 * ces fonctions deja prouvees, jamais qu'elle les reimplemente a cote.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001 : aucune des valeurs ci-dessous
 * n'a ete obtenue en executant une implementation de T65 — aucun module de
 * T65 n'existe encore au moment ou elle est ecrite ; ni le cahier ni
 * ADR-018 ne fixent de signature de fonction)
 *
 * 1. TROIS ROLES, resolus par balayage tolerant des exports top-level de
 *    `packages/activities` et `packages/evaluation` (sections ROLES_* plus
 *    bas), appeles sous PLUSIEURS formes d'arguments — meme tolerance
 *    qu'acceptance/T64.spec.ts :
 *      - « persisteur » : `(opts: {benchDataDir, entries}) => Promise<any>`
 *        ou `entries` est un tableau `{periodKey, period: <MetricPeriod de
 *        @bench/domain>, code: <CodeMetrics>}[]`, un par periode persistee,
 *        dans l'ordre croissant des periodes. Cette suite FIXE que
 *        `period` est EXACTEMENT la forme `MetricPeriod` exportee par
 *        `@bench/domain` (deja PROUVEE a HEAD par T04) : c'est la forme la
 *        plus directe pour une tache dont le livrable dit « calcules par
 *        les fonctions de T04 ».
 *      - « lecteur de periode » : `(opts: {benchDataDir, periodKey}) =>
 *        Promise<{Q, R, G, G_new, regressions?, new_regressions?, code}>`.
 *      - « chronologie de regle » : `(opts: {benchDataDir, ruleId}) =>
 *        Promise<{firstSatisfiedPeriod, regressionPeriods, recoveryPeriods}>`
 *        ou `ruleId` est l'identite `id@version` (cahier:L109, L129).
 * 2. `CodeMetrics` = `{linesAdded, linesRemoved, filesTouched,
 *    testFilesWritten}` (ADR-018 L64-67, mot pour mot : « lignes ajoutees et
 *    supprimees, fichiers touches, nombre de fichiers de test »).
 * 3. UN BENCH_DATA_DIR DISTINCT PAR SCENARIO : chaque cas synthetise son
 *    propre repertoire jetable (reprise du canal deja PROUVE par
 *    acceptance/T63.spec.ts), jamais un repertoire partage entre scenarios.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LE SCENARIO DE CONTROLES REELS COMMUN AUX QUATRE CAS (section IV plus bas,
 * `construireSerie`) :
 *   - l'ensemble des regles actives par periode est `REGLES_ADR`, REPRIS
 *     D'acceptance/T61.spec.ts (section V), suite ACCEPTEE et PROUVEE a
 *     HEAD, RECALCULEE PAR ELLE depuis ADR-018 — jamais recalcule une
 *     seconde fois ici (P1-P4 = L86-90 ; P5-P12 = L91-155) ;
 *   - `isolation@1` (active a partir de P4, ADR-018 L90) est satisfaite en
 *     P4-P6, VIOLEE en P7 et P8 (regression ouverte puis persistante),
 *     RETABLIE en P9-P12 ;
 *   - `cancel@2` (P3-P6) est RETIRE ET REMPLACE par `cancel@3` en P7
 *     (ADR-018 L107, « `cancel@3` remplace `cancel@2` ») — perturbation
 *     nommee par verification/cases.extensions.lock.json#T65.A2 (« compter
 *     cancel@2 retiree en regression en P7 : le cas doit rougir ») ;
 *   - `priority@1` (P6-P10) est RETIRE ET REMPLACE par `fifo@2` en P11
 *     (ADR-018 L142) ;
 *   - `quota@1` (P8-P10) est RETIRE SANS REMPLACEMENT en P11 (ADR-018 L142,
 *     « `quota@1` est retire ») ;
 *   - toute autre regle active est satisfaite a chaque periode ou elle est
 *     due.
 *   Chaque periode porte en outre des mesures de code DISTINCTES
 *   (`CODE_PAR_PERIODE` plus bas), choisies pour que `linesAdded` ne soit
 *   JAMAIS egal a un multiple trivial de `period_index`, afin qu'un mutant
 *   qui ferait fuiter ce champ dans Q soit visible.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * PROVENANCE DES LITTERAUX
 *
 *   `REGLES_ADR` (table complete, 12 periodes) — acceptance/T61.spec.ts
 *     (section V), suite ACCEPTEE, PROUVEE a HEAD ; recalculee par elle
 *     depuis ADR-018 L61-65 et L86-155, jamais re-derivee ici.
 *   Les remplacements et retraits de III ci-dessus — ADR-018 L107
 *     (`cancel@3` remplace `cancel@2`), L142 (`fifo@2` remplace
 *     `priority@1` ; `quota@1` est retire).
 *   Les regles de G/G_new/F-REGRESSION elles-memes — cahier:L189, cahier:L129
 *     (citees mot pour mot en I ci-dessus), et la fonction `computePeriodMetrics`
 *     de `@bench/domain`, qui EST l'oracle contre lequel A1 et A2 comparent :
 *     aucune valeur de Q/R/G/G_new n'est recopiee a la main, chacune est
 *     RECALCULEE par cet import au moment du test.
 *   Les mesures de code (`CODE_PAR_PERIODE`) — valeurs arbitraires choisies
 *     par cette suite (II.3), jamais tirees d'un commit reel : ADR-018 ne
 *     fixe aucun jeu de chiffres, seulement la forme des quatre champs.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * LES DANGERS PROPRES A T65, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) T65.A1 NE DOIT PAS SE CONTENTER D'UNE EGALITE SUR UNE SEULE PERIODE.
 *     Un calcul correct en P1 mais errone a partir de P7 (ou G/G_new
 *     deviennent non nuls) passerait un controle ponctuel. Cette suite
 *     compare donc, periode par periode, TOUTES les periodes P1 a P12, dans
 *     une seule egalite de tableau (meme discipline que T00.M11) : la
 *     premiere divergence apparait dans le diff au lieu d'etre masquee par
 *     un `.toBe` qui s'arreterait a la premiere periode fausse.
 * (2) T65.A2 NE DOIT PAS SE CONTENTER D'OBSERVER UNE ABSENCE DE REGRESSION
 *     SUR UN SCENARIO OU AUCUNE RETRAIT NE SURVIENT JAMAIS : un calcul qui
 *     compterait TOUT retrait en regression resterait invisible si aucune
 *     regle n'etait jamais retiree. Le scenario retire TROIS regles par
 *     TROIS mecanismes distincts (remplacement simple `cancel@2`->`cancel@3`,
 *     remplacement `priority@1`->`fifo@2`, retrait SANS remplacement
 *     `quota@1`), et exige pour chacune `0` regression au moment du retrait
 *     — EN PLUS d'exiger `isolation@1` bel et bien comptee en regression a
 *     P7-P8. Sans ce second volet positif, un calcul qui ne compterait
 *     JAMAIS aucune regression (G toujours 0) passerait la moitie « non
 *     comptee » du cas par defaut.
 * (3) T65.A3 NE DOIT PAS SE CONTENTER D'UNE CHRONOLOGIE A UN SEUL EVENEMENT.
 *     Cette suite exige les TROIS champs de `isolation@1` simultanement
 *     (premiere satisfaction P4, regression P7, retablissement P9) : une
 *     chronologie qui omettrait le retablissement — perturbation nommee par
 *     le cas verrou (« omettre la periode de retablissement ») — echoue sur
 *     ce troisieme champ meme si les deux premiers sont corrects.
 * (4) T65.A4 : LE DANGER EST UNE IMPLEMENTATION QUI PERSISTE LES MESURES DE
 *     CODE MAIS LES LAISSE INFLUENCER LE SCORE (perturbation nommee : « faire
 *     entrer les lignes ajoutees dans Q »), OU QUI OMET LE COMPTE DE
 *     FICHIERS DE TEST SEUL (perturbation : « ne pas persister le nombre de
 *     fichiers de test »). Cette suite exige donc DEUX choses independantes :
 *     (a) les quatre champs de code sont persistes et relus A L'IDENTIQUE de
 *     ce qui a ete fourni, periode par periode ; (b) DEUX series dont les
 *     controles (satisfied/weight/due) sont RIGOUREUSEMENT IDENTIQUES mais
 *     dont les mesures de code DIFFERENT (une serie a `linesAdded` multiplie
 *     par 97 a chaque periode) produisent EXACTEMENT la meme suite Q/R/G/
 *     G_new — une implementation qui laisserait fuiter le code dans le score
 *     echoue (b) meme si elle reussit (a).
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie aucune regle metier de F-LONG, ni la generation ou la
 *    notation des lots caches : proprietes de T61-T64, deja PROUVEES.
 *  • Elle n'exerce ni une session `claude -p` ni un fournisseur `claude-cli`
 *    (ADR-008) : aucun processus nomme `claude` n'est jamais lance.
 *  • Elle n'exige aucun format de stockage precis (fichier, table
 *    PostgreSQL, objet S3) : seul le comportement observable au travers des
 *    trois exports resolus compte.
 *  • Elle ne mesure pas le rapport agrege de repetitions (T66) : tache
 *    distincte, en aval.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computePeriodMetrics } from '@bench/domain';
import type { MetricPeriod, MetricRequirement, PeriodMetrics, RetiredRequirement } from '@bench/domain';

const CASE_TIMEOUT_MS = 60_000;

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
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}
const court = (s: string, n = 900): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ═══════════════════ chargement tolerant de packages/activities + evaluation */

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

function specifiersForPackage(pkgDirName: string): string[] {
  const dir = path.join(REPO, 'packages', pkgDirName);
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

async function loadPackage(pkgDirName: string): Promise<{ ns: Ns | null; attempts: string[] }> {
  const attempts: string[] = [];
  for (const s of specifiersForPackage(pkgDirName)) {
    try {
      const mod = (await import(s)) as Ns;
      return { ns: mod, attempts };
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  attempts.push(`paquet packages/${pkgDirName} : aucun specificateur n'a repondu`);
  return { ns: null, attempts };
}

let LOADED: { charge: boolean; flat: Map<string, unknown>; attempts: string[] } = {
  charge: false,
  flat: new Map(),
  attempts: ['beforeAll non execute'],
};

beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  let unCharge = false;
  for (const pkg of ['activities', 'evaluation']) {
    const { ns, attempts: a } = await loadPackage(pkg);
    attempts.push(...a);
    if (ns !== null) {
      flatten(ns, flat);
      unCharge = true;
    }
  }
  LOADED = { charge: unCharge, flat, attempts };
}, CASE_TIMEOUT_MS);

function assertPackagesLoaded(): void {
  exige(
    LOADED.charge,
    'packages-activities-ou-evaluation-charges',
    `AUCUN-DES-DEUX-PAQUETS-N-A-PU-ETRE-CHARGE : ${LOADED.attempts.join(' | ')}`,
  );
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await thunk() };
  } catch {
    return { ok: false };
  }
}

/* ═══════════════════ les douze ensembles de regles (repris T61.V) ══════ */

const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const;
type Periode = (typeof PERIODES)[number];

// ADR-018:L61-65 et L86-155. Repris d'acceptance/T61.spec.ts (section V),
// suite ACCEPTEE, PROUVEE a HEAD : jamais recalcule ici.
const REGLES_ADR: Record<Periode, string[]> = {
  P1: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P2: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P3: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2'],
  P4: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1'],
  P5: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P6: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P7: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1'],
  P8: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ],
  P9: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ],
  P10: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1', 'history@1',
  ],
  P11: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1',
  ],
  P12: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1', 'transfer@1',
  ],
};

/* ═══════════════════ construction du scenario de controles reels (III) ═ */

function parseRuleId(ruleIdVersion: string): { id: string; version: number } {
  const i = ruleIdVersion.lastIndexOf('@');
  return { id: ruleIdVersion.slice(0, i), version: Number(ruleIdVersion.slice(i + 1)) };
}

// III — insatisfactions exceptionnelles : `isolation@1` violee en P7-P8,
// retablie en P9. Toute autre regle active due est satisfaite.
const INSATISFACTIONS: Partial<Record<Periode, string[]>> = {
  P7: ['isolation@1'],
  P8: ['isolation@1'],
};

// III — retraits explicites, avec leur remplacement eventuel.
const RETRAITS: Partial<Record<Periode, RetiredRequirement[]>> = {
  P7: [{ id: 'cancel', version: 2, replaced_by: { id: 'cancel', version: 3 } }], // ADR-018:L107
  P11: [
    { id: 'priority', version: 1, replaced_by: { id: 'fifo', version: 2 } }, // ADR-018:L142
    { id: 'quota', version: 1, replaced_by: null }, // ADR-018:L142, « quota@1 est retire »
  ],
};

interface CodeMetrics {
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly filesTouched: number;
  readonly testFilesWritten: number;
}

// II.3 / III — mesures de code arbitraires, choisies pour ne jamais etre un
// multiple trivial de l'indice de periode (danger V.4).
const CODE_PAR_PERIODE: Record<Periode, CodeMetrics> = {
  P1: { linesAdded: 41, linesRemoved: 3, filesTouched: 5, testFilesWritten: 2 },
  P2: { linesAdded: 17, linesRemoved: 0, filesTouched: 2, testFilesWritten: 0 },
  P3: { linesAdded: 63, linesRemoved: 12, filesTouched: 7, testFilesWritten: 3 },
  P4: { linesAdded: 29, linesRemoved: 8, filesTouched: 4, testFilesWritten: 1 },
  P5: { linesAdded: 88, linesRemoved: 21, filesTouched: 9, testFilesWritten: 4 },
  P6: { linesAdded: 54, linesRemoved: 19, filesTouched: 6, testFilesWritten: 2 },
  P7: { linesAdded: 101, linesRemoved: 37, filesTouched: 11, testFilesWritten: 5 },
  P8: { linesAdded: 46, linesRemoved: 5, filesTouched: 3, testFilesWritten: 1 },
  P9: { linesAdded: 72, linesRemoved: 14, filesTouched: 8, testFilesWritten: 3 },
  P10: { linesAdded: 33, linesRemoved: 9, filesTouched: 5, testFilesWritten: 2 },
  P11: { linesAdded: 59, linesRemoved: 23, filesTouched: 7, testFilesWritten: 3 },
  P12: { linesAdded: 94, linesRemoved: 31, filesTouched: 10, testFilesWritten: 4 },
};

// Multiplicateur du danger V.4(b) : une seconde variante du scenario, dont
// les controles sont IDENTIQUES mais le code DIFFERE partout.
const CODE_PAR_PERIODE_VARIANTE: Record<Periode, CodeMetrics> = Object.fromEntries(
  PERIODES.map((p) => [
    p,
    {
      linesAdded: CODE_PAR_PERIODE[p].linesAdded * 97 + 11,
      linesRemoved: CODE_PAR_PERIODE[p].linesRemoved * 97 + 3,
      filesTouched: CODE_PAR_PERIODE[p].filesTouched + 40,
      testFilesWritten: CODE_PAR_PERIODE[p].testFilesWritten + 9,
    },
  ]),
) as Record<Periode, CodeMetrics>;

interface SeriesEntry {
  readonly periodKey: Periode;
  readonly period: MetricPeriod;
  readonly code: CodeMetrics;
}

function dueAtPeriod(ruleIdVersion: string, uptoIndex: number): number {
  for (let i = 0; i < uptoIndex; i += 1) {
    if (REGLES_ADR[PERIODES[i]].includes(ruleIdVersion)) return i + 1;
  }
  return uptoIndex + 1;
}

function construireSerie(codeParPeriode: Record<Periode, CodeMetrics>): SeriesEntry[] {
  return PERIODES.map((periodKey, idx) => {
    const actives = REGLES_ADR[periodKey];
    const insatisfaites = new Set(INSATISFACTIONS[periodKey] ?? []);
    const requirements: MetricRequirement[] = actives.map((ruleIdVersion) => {
      const { id, version } = parseRuleId(ruleIdVersion);
      return {
        id,
        version,
        capability_id: id,
        weight: 1,
        revealed_at_period: dueAtPeriod(ruleIdVersion, idx),
        due_at_period: dueAtPeriod(ruleIdVersion, idx),
        criticality: 'normal',
        source: 'ADR-018',
        satisfied: !insatisfaites.has(ruleIdVersion),
        assertions: [`${ruleIdVersion}#assert`],
      };
    });
    const period: MetricPeriod = {
      period_index: idx + 1,
      duration: 1,
      requirements,
      retired: RETRAITS[periodKey] ?? [],
      intents_offered: 1,
      intents_succeeded: 1,
    };
    return { periodKey, period, code: codeParPeriode[periodKey] };
  });
}

const SERIE_PRINCIPALE = construireSerie(CODE_PAR_PERIODE);
const SERIE_CODE_VARIANTE = construireSerie(CODE_PAR_PERIODE_VARIANTE);

/** L'oracle T04 — jamais recalcule a la main, toujours importe. */
function oracle(serie: SeriesEntry[]): readonly PeriodMetrics[] {
  return computePeriodMetrics(serie.map((e) => e.period)).periods;
}

/* ═══════════════════ roles invente par cette suite (II.1) ══════════════ */

type OptsPersisteur = { benchDataDir: string; entries: SeriesEntry[] };

const ROLES_PERSIST_SERIES = [
  'persistPeriodMeasures',
  'persistLongitudinalMeasures',
  'persistPeriodMetricsSeries',
  'persistMeasuresSeries',
  'persistEvaluationSeries',
  'recordLongitudinalMeasures',
  'persistRealControlMeasures',
] as const;

async function essayerPersister(fn: unknown, o: OptsPersisteur): Promise<boolean> {
  if (typeof fn !== 'function') return false;
  const variantes: unknown[][] = [[o], [o.benchDataDir, o.entries], [o.entries, o.benchDataDir]];
  for (const args of variantes) {
    const res = await essayer(() => (fn as (...x: unknown[]) => unknown)(...args));
    if (res.ok) return true;
  }
  return false;
}

async function resoudrePersisteur(o: OptsPersisteur): Promise<string | null> {
  for (const nom of ROLES_PERSIST_SERIES) {
    if (await essayerPersister(LOADED.flat.get(nom), o)) return nom;
  }
  return null;
}

type OptsLecteur = { benchDataDir: string; periodKey: string };
interface MesurePersistee {
  Q: number | null;
  R: number | null;
  G: number;
  G_new: number;
  regressions: string[] | null;
  code: CodeMetrics | null;
}

const ROLES_READ_PERIOD = [
  'readPeriodMeasures',
  'getPeriodMeasures',
  'readPersistedPeriodMetrics',
  'loadPeriodMeasures',
  'getPersistedMeasures',
  'readLongitudinalMeasures',
] as const;

function champNombre(o: Json, alias: readonly string[]): number | null {
  for (const a of alias) {
    const v = o[a];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}
function champNombreOuNull(o: Json, alias: readonly string[]): number | null | undefined {
  for (const a of alias) {
    if (a in o) {
      const v = o[a];
      if (v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
  }
  return undefined;
}
function champTableauTexte(o: Json, alias: readonly string[]): string[] | null {
  for (const a of alias) {
    const v = o[a];
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  }
  return null;
}

function extraireMesure(v: unknown): MesurePersistee | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Json;
  const Q = champNombreOuNull(o, ['Q', 'q']);
  const R = champNombreOuNull(o, ['R', 'r']);
  const G = champNombre(o, ['G', 'g']);
  const G_new = champNombre(o, ['G_new', 'Gnew', 'g_new', 'gNew']);
  if (Q === undefined || R === undefined || G === null || G_new === null) return null;
  const codeNoeud = (o.code ?? o.codeMetrics ?? o.code_metrics) as Json | undefined;
  let code: CodeMetrics | null = null;
  if (codeNoeud !== null && codeNoeud !== undefined && typeof codeNoeud === 'object') {
    const linesAdded = champNombre(codeNoeud, ['linesAdded', 'lines_added']);
    const linesRemoved = champNombre(codeNoeud, ['linesRemoved', 'lines_removed']);
    const filesTouched = champNombre(codeNoeud, ['filesTouched', 'files_touched']);
    const testFilesWritten = champNombre(codeNoeud, [
      'testFilesWritten',
      'test_files_written',
      'testFileCount',
    ]);
    if (
      linesAdded !== null &&
      linesRemoved !== null &&
      filesTouched !== null &&
      testFilesWritten !== null
    ) {
      code = { linesAdded, linesRemoved, filesTouched, testFilesWritten };
    }
  }
  return {
    Q,
    R,
    G,
    G_new,
    regressions: champTableauTexte(o, ['regressions', 'openRegressions']),
    code,
  };
}

async function essayerLire(fn: unknown, o: OptsLecteur): Promise<MesurePersistee | null> {
  if (typeof fn !== 'function') return null;
  const variantes: unknown[][] = [[o], [o.benchDataDir, o.periodKey]];
  for (const args of variantes) {
    const res = await essayer(() => (fn as (...x: unknown[]) => unknown)(...args));
    if (!res.ok) continue;
    const m = extraireMesure(res.value);
    if (m !== null) return m;
  }
  return null;
}

async function resoudreLecteur(o: OptsLecteur): Promise<MesurePersistee | null> {
  for (const nom of ROLES_READ_PERIOD) {
    const m = await essayerLire(LOADED.flat.get(nom), o);
    if (m !== null) return m;
  }
  return null;
}

type OptsChronologie = { benchDataDir: string; ruleId: string };
interface Chronologie {
  firstSatisfiedPeriod: string | number | null;
  regressionPeriods: (string | number)[];
  recoveryPeriods: (string | number)[];
}

const ROLES_RULE_TIMELINE = [
  'ruleTimeline',
  'getRuleTimeline',
  'readRuleTimeline',
  'computeRuleTimeline',
  'buildRuleTimeline',
  'loadRuleTimeline',
] as const;

function extraireChronologie(v: unknown): Chronologie | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Json;
  const first = o.firstSatisfiedPeriod ?? o.first_satisfied_period ?? o.firstSatisfied;
  const reg = o.regressionPeriods ?? o.regression_periods;
  const rec = o.recoveryPeriods ?? o.recovery_periods;
  if (!Array.isArray(reg) || !Array.isArray(rec)) return null;
  return {
    firstSatisfiedPeriod: (first ?? null) as string | number | null,
    regressionPeriods: reg as (string | number)[],
    recoveryPeriods: rec as (string | number)[],
  };
}

async function essayerChronologie(fn: unknown, o: OptsChronologie): Promise<Chronologie | null> {
  if (typeof fn !== 'function') return null;
  const variantes: unknown[][] = [[o], [o.benchDataDir, o.ruleId]];
  for (const args of variantes) {
    const res = await essayer(() => (fn as (...x: unknown[]) => unknown)(...args));
    if (!res.ok) continue;
    const c = extraireChronologie(res.value);
    if (c !== null) return c;
  }
  return null;
}

async function resoudreChronologie(o: OptsChronologie): Promise<Chronologie | null> {
  for (const nom of ROLES_RULE_TIMELINE) {
    const c = await essayerChronologie(LOADED.flat.get(nom), o);
    if (c !== null) return c;
  }
  return null;
}

/* ═══════════════════ repertoire jetable (reprise T63) ══════════════════ */

function nouveauRepertoireDonnees(suffixe: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `t65-${suffixe}-`));
}

async function persisterEtLireToutesLesPeriodes(
  entries: SeriesEntry[],
  suffixe: string,
): Promise<{ benchDataDir: string; mesures: (MesurePersistee | null)[] }> {
  assertPackagesLoaded();
  const benchDataDir = nouveauRepertoireDonnees(suffixe);
  const nomPersisteur = await resoudrePersisteur({ benchDataDir, entries });
  exige(
    nomPersisteur !== null,
    'persisteur-resolu',
    `PERSISTEUR-INTROUVABLE parmi ${rendu([...ROLES_PERSIST_SERIES])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  const mesures: (MesurePersistee | null)[] = [];
  for (const e of entries) {
    mesures.push(await resoudreLecteur({ benchDataDir, periodKey: e.periodKey }));
  }
  return { benchDataDir, mesures };
}

/* ═══════════════════════════════════════════════════════════════ tests */

describe('T65 — mesures longitudinales sur le chemin reel', () => {
  test(
    'T65.A1 — Q, R, G et G_new persistes a chaque periode sont ceux que donne computePeriodMetrics (@bench/domain, T04) sur les controles reels',
    async () => {
      const attendu = oracle(SERIE_PRINCIPALE);
      const { mesures } = await persisterEtLireToutesLesPeriodes(SERIE_PRINCIPALE, 'a1');

      exige(
        mesures.every((m) => m !== null),
        'toutes-les-periodes-ont-une-mesure-lisible',
        `MESURE-MANQUANTE : ${rendu(mesures.map((m, i) => (m === null ? SERIE_PRINCIPALE[i].periodKey : null)))}`,
      );

      const obtenu = (mesures as MesurePersistee[]).map((m) => [m.Q, m.R, m.G, m.G_new]);
      const voulu = attendu.map((p) => [p.Q, p.R, p.G, p.G_new]);
      expect(obtenu).toEqual(voulu);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T65.A2 — un retrait (remplacement ou non) ne compte jamais en regression ; une regle active satisfaite puis violee est bien comptee',
    async () => {
      const attendu = oracle(SERIE_PRINCIPALE);
      const { mesures } = await persisterEtLireToutesLesPeriodes(SERIE_PRINCIPALE, 'a2');
      exige(
        mesures.every((m) => m !== null),
        'toutes-les-periodes-ont-une-mesure-lisible-a2',
        `MESURE-MANQUANTE-A2 : ${rendu(mesures.map((m, i) => (m === null ? SERIE_PRINCIPALE[i].periodKey : null)))}`,
      );
      const m = mesures as MesurePersistee[];
      const idx = (p: Periode): number => PERIODES.indexOf(p);

      // Oracle : G a P7 et P8 est strictement positif (isolation@1 en
      // regression), jamais nul — temoin que le scenario observe reellement
      // quelque chose (danger V.2).
      exige(
        (attendu[idx('P7')] as PeriodMetrics).G > 0 && (attendu[idx('P8')] as PeriodMetrics).G > 0,
        'oracle-observe-une-regression-reelle',
        `SCENARIO-SANS-REGRESSION-OBSERVEE : G(P7)=${(attendu[idx('P7')] as PeriodMetrics).G}, G(P8)=${(attendu[idx('P8')] as PeriodMetrics).G}`,
      );

      // 1) isolation@1 : G/G_new persistes concordent avec l'oracle a P6-P9
      //    (satisfaite, regression ouverte, persistante, retablie).
      const fenetre = ['P6', 'P7', 'P8', 'P9'] as const;
      const gObtenu = fenetre.map((p) => m[idx(p)].G);
      const gnewObtenu = fenetre.map((p) => m[idx(p)].G_new);
      const gVoulu = fenetre.map((p) => (attendu[idx(p)] as PeriodMetrics).G);
      const gnewVoulu = fenetre.map((p) => (attendu[idx(p)] as PeriodMetrics).G_new);
      expect([gObtenu, gnewObtenu]).toEqual([gVoulu, gnewVoulu]);

      // 2) Les trois retraits (cancel@2->cancel@3 en P7, priority@1->fifo@2
      //    et quota@1 retire sans remplacement en P11) : G a la periode du
      //    retrait persiste egal a l'oracle (donc n'ajoute PAS de regression
      //    propre a ce retrait — perturbation nommee : « compter cancel@2
      //    retiree en regression en P7 »).
      exige(
        m[idx('P7')].G === (attendu[idx('P7')] as PeriodMetrics).G &&
          m[idx('P11')].G === (attendu[idx('P11')] as PeriodMetrics).G,
        'retraits-non-comptes-en-regression',
        `RETRAIT-COMPTE-A-TORT : G(P7) obtenu=${m[idx('P7')].G} attendu=${(attendu[idx('P7')] as PeriodMetrics).G} ; G(P11) obtenu=${m[idx('P11')].G} attendu=${(attendu[idx('P11')] as PeriodMetrics).G}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T65.A3 — la chronologie de isolation@1 donne sa premiere periode de satisfaction (P4), sa regression (P7) et son retablissement (P9)',
    async () => {
      const { benchDataDir } = await persisterEtLireToutesLesPeriodes(SERIE_PRINCIPALE, 'a3');
      const chrono = await resoudreChronologie({ benchDataDir, ruleId: 'isolation@1' });
      exige(
        chrono !== null,
        'chronologie-resolue',
        `CHRONOLOGIE-INTROUVABLE pour isolation@1 parmi ${rendu([...ROLES_RULE_TIMELINE])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
      );
      const c = chrono as Chronologie;

      const normPeriode = (v: string | number): string =>
        typeof v === 'number' ? `P${String(v)}` : v;

      exige(
        c.firstSatisfiedPeriod !== null && normPeriode(c.firstSatisfiedPeriod) === 'P4',
        'premiere-satisfaction-P4',
        `PREMIERE-SATISFACTION-INATTENDUE : ${rendu(c.firstSatisfiedPeriod)} (attendu P4, ADR-018:L90)`,
      );
      exige(
        c.regressionPeriods.map(normPeriode).includes('P7'),
        'regression-P7-presente',
        `REGRESSION-P7-ABSENTE : ${rendu(c.regressionPeriods)}`,
      );
      exige(
        c.recoveryPeriods.map(normPeriode).includes('P9'),
        'retablissement-P9-present',
        `RETABLISSEMENT-P9-ABSENT (danger V.3, perturbation « omettre la periode de retablissement ») : ${rendu(c.recoveryPeriods)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T65.A4 — chaque periode persiste ses mesures de code (lignes ajoutees/supprimees, fichiers touches, fichiers de test), et ces mesures ne changent jamais Q/R/G/G_new',
    async () => {
      const { mesures: mesuresPrincipales } = await persisterEtLireToutesLesPeriodes(
        SERIE_PRINCIPALE,
        'a4-principale',
      );
      exige(
        mesuresPrincipales.every((m) => m !== null && m.code !== null),
        'mesures-de-code-toutes-presentes',
        `CODE-ABSENT (perturbation « ne pas persister le nombre de fichiers de test ») : ${rendu(
          mesuresPrincipales.map((m, i) => (m === null || m.code === null ? SERIE_PRINCIPALE[i].periodKey : null)),
        )}`,
      );
      const codeObtenu = (mesuresPrincipales as MesurePersistee[]).map((m) => m.code);
      const codeVoulu = SERIE_PRINCIPALE.map((e) => e.code);
      expect(codeObtenu).toEqual(codeVoulu);

      // Deuxieme serie : memes controles exacts, mesures de code DIFFERENTES
      // partout (CODE_PAR_PERIODE_VARIANTE). Q/R/G/G_new doivent rester
      // IDENTIQUES a la premiere serie — sans quoi le code a fuite dans le
      // score (perturbation « faire entrer les lignes ajoutees dans Q »).
      const { mesures: mesuresVariante } = await persisterEtLireToutesLesPeriodes(
        SERIE_CODE_VARIANTE,
        'a4-variante',
      );
      exige(
        mesuresVariante.every((m) => m !== null),
        'mesures-variante-toutes-presentes',
        `MESURE-VARIANTE-MANQUANTE : ${rendu(mesuresVariante.map((m, i) => (m === null ? SERIE_PRINCIPALE[i].periodKey : null)))}`,
      );
      const scoreObtenuPrincipale = (mesuresPrincipales as MesurePersistee[]).map((m) => [m.Q, m.R, m.G, m.G_new]);
      const scoreObtenuVariante = (mesuresVariante as MesurePersistee[]).map((m) => [m.Q, m.R, m.G, m.G_new]);
      expect(scoreObtenuVariante).toEqual(scoreObtenuPrincipale);

      // Temoin : les mesures de code de la variante, elles, DIFFERENT
      // reellement du principal (sinon l'egalite ci-dessus serait vide de
      // sens, cf. T04.spec.ts IV, meme discipline du temoin).
      const codeVarianteObtenu = (mesuresVariante as MesurePersistee[]).map((m) => m.code);
      exige(
        JSON.stringify(codeVarianteObtenu) !== JSON.stringify(codeObtenu),
        'code-variante-reellement-different',
        `TEMOIN-CASSE : le code de la variante est identique au code principal, l'egalite de score ci-dessus ne prouve donc rien.`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
