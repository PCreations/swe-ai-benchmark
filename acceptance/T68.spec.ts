/**
 * acceptance/T68.spec.ts — suite d'acceptation de la tache T68.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T68.A1 behaviour — pour chaque regle active a partir de P5, un candidat
 *                      de reference qui implemente TOUTES les regles de
 *                      F-LONG obtient un score de 1 sur chaque regle active
 *                      a chaque periode.
 *   T68.A2 behaviour — pour chaque regle active a partir de P5, le MEME
 *                      candidat PRIVE de cette seule regle obtient sur elle
 *                      un score strictement inferieur a 1.
 *   T68.A3 behaviour — les sequences de chaque regle appellent au moins une
 *                      fois chaque operation que la regle introduit.
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T68 EST UNE TACHE D'EXTENSION : son registre est
 * verification/tasks.extensions.json et son `spec_source` epingle ADR-019
 * (docs/adr/ADR-019-creneaux-dans-le-contrat-et-controles-discriminants.md,
 * L100-106), jamais le cahier. L'auteur de cette suite est AVEUGLE aux
 * `source_paths` de T68 (`packages/activities`, `packages/scenario`) : il ne
 * les a lus ni directement ni par `git show` (ADR-001, aveuglement
 * PROCEDURAL). Seule la description PUBLIQUE exportee du contrat
 * `bench.candidate/4` (CANDIDATE_REQUIREMENTS_STATEMENT_V4_LONG, celle que
 * recoit un candidat reel) a ete consultee pour ecrire le candidat temoin.
 *
 *   ADR-019 L24-29 « toutes les sequences, pour toutes les regles, creent un
 *          locataire, envoient deux reservations et verifient que la seconde
 *          attend. Aucune n'appelle set_capacity, set_level, balance, history
 *          ni transfer. Une file d'attente de capacite 1 obtient donc un
 *          score de 1 sur toutes les regles » — le defaut a fermer.
 *   ADR-019 L87-91 decision 3 : « Les sequences d'une regle exercent cette
 *          regle [...] Le critere, mecanique, est un candidat de reference
 *          prive de cette seule regle. » — c'est A1/A2.
 *   ADR-018 L46-51 decision 2 : « Toutes les operations de la trajectoire
 *          principale s'appliquent au meme etat [BENCH_DATA_DIR] [...] Les
 *          sondes de frontiere travaillent sur des copies jetables de ce
 *          repertoire » ; L53-56 decision 3 : les sequences « s'appliquent a
 *          des copies de l'etat ». — c'est ce qui permet a A3 de separer le
 *          trafic des sequences de celui de la trajectoire (II.5).
 *   ADR-019 L102-106 (docs/specs/T68.md) : livrable, cas, commande.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001)
 *
 * 1. LES CANDIDATS SONT DES FIXTURES DE TEST, HORS DE PORTEE DE
 *    L'IMPLEMENTEUR. Le candidat fidele ET le candidat prive d'une regle sont
 *    le MEME programme, ecrit par le test-author :
 *      acceptance/fixtures/candidates/f-long-reference-candidate-v4.mjs
 *    (contrat `bench.candidate/4`, huit points d'ADR-019 appliques ; son
 *    en-tete documente chaque choix). La privation passe par la variable
 *    d'environnement BENCH_DROP_RULE=<regle> : la regle est retiree de
 *    l'ensemble actif, et la regle qu'elle remplacait (fifo@1 pour
 *    priority@1, cancel@2 pour cancel@3, cancel@3 pour cancel@4, priority@1
 *    pour fifo@2) reste en vigueur a sa place.
 *    Une version precedente de cette suite resolvait candidats ET notateur
 *    par alias DANS le code d'implementation : l'implementeur fournissait
 *    alors la copie et la note, et un candidat prive qui echoue expres
 *    passait A2 sans que les sequences discriminent quoi que ce soit.
 * 2. LA GENERATION ET LA NOTATION RESTENT LE LIVRABLE DE L'IMPLEMENTATION.
 *    Deux roles, resolus par balayage tolerant des exports aplatis de
 *    `packages/scenario` et `packages/activities` (meme mecanique
 *    qu'acceptance/T64.spec.ts, II.1), en version `bench.candidate/4` :
 *      - generateur : `(opts: {rule, period, seed, contract}) =>
 *        sequence[] | {sequences|batch: sequence[]}` ;
 *      - notateur : `(opts: {rule, period, seed, candidateCommand,
 *        benchDataDir, contract}) => Promise<{score, satisfied, total}>`.
 *    `contract` (et son alias `protocol`) vaut 'bench.candidate/4'. Comme en
 *    T64, le notateur amene lui-meme l'etat du candidat jusqu'a la periode
 *    en rejouant la trajectoire principale contre `benchDataDir`, PUIS
 *    applique chaque sequence du lot a une COPIE de cet etat (ADR-018
 *    decision 2 et 3), en lancant `candidateCommand` avec BENCH_DATA_DIR
 *    pointant sur la copie. Les noms de role specifiques a v4 sont essayes
 *    AVANT les noms de T64 : un notateur v3 ne peut servir que s'il honore
 *    `contract: 'bench.candidate/4'`.
 * 3. LA COMMANDE DE LANCEMENT NE TRAHIT PAS LA VARIANTE. Chaque notation
 *    recoit `candidateCommand = ['node', <lanceur>]`, ou <lanceur> est un
 *    petit module ecrit par cette suite dans un repertoire temporaire, sous
 *    un nom aleatoire, qui pose BENCH_DROP_RULE et BENCH_TRAFFIC_LOG puis
 *    importe la fixture. Le fidele et le prive ont donc des commandes de
 *    meme forme : un notateur qui lirait la commande pour deviner « prive »
 *    et noter 0 n'a rien a lire.
 * 4. UN SCORE EST UN NOMBRE DE [0,1] ACCOMPAGNE DE `satisfied` ET `total`
 *    (repris de T64.A3). A1 exige `score === 1`, `total` entier >= 1 et
 *    `satisfied === total` ; A2 exige `score < 1` nommement, avec le score
 *    obtenu en clair, ET, comme temoin, que le candidat complet note 1 sur la
 *    meme (regle, periode, graine) — sans quoi un lot qui fait echouer TOUT
 *    candidat (sequences mal formees, contrat v3 envoye a un candidat v4)
 *    passerait A2 sans rien discriminer.
 * 5. LE TRAFIC DES SEQUENCES EST LE TRAFIC SUR LES COPIES. La fixture
 *    journalise `{pid, data_dir, op}` pour chaque requete recue
 *    (BENCH_TRAFFIC_LOG). Le trafic dont `data_dir` differe de
 *    `benchDataDir` est celui des sequences (ADR-018 decisions 2-3 : la
 *    trajectoire principale vit dans BENCH_DATA_DIR, le reste sur des
 *    copies). A3 lit ce journal — jamais les sequences par l'API de
 *    l'implementation — et exige que chaque operation que la regle introduit
 *    y figure. A1 et A2 exigent un trafic de copie non vide : la note doit
 *    venir d'une EXECUTION REELLE du candidat sur les sequences.
 * 6. OPERATION(S) INTRODUITE(S) PAR REGLE (`OPERATION_DEDIEE`, reprise de la
 *    version precedente, jamais reduite) :
 *      capacity@1 -> set_capacity, priority@1 -> set_level,
 *      price@1 -> balance, history@1 -> history, transfer@1 -> transfer
 *      (ADR-019 L27, enumeration litterale) ;
 *      quota@1 -> write, fifo@2 -> write, cancel@3 -> probe_cancel,
 *      cancel@4 -> probe_cancel (jugement du test-author : ces regles
 *      raffinent une operation existante).
 * 7. « REGLE ACTIVE A PARTIR DE P5 » est DERIVE de REGLES_ADR (reprise gelee
 *    de T61.V) : absente de P1-P4, presente dans au moins une periode
 *    P5-P12. Soit : capacity@1, priority@1, cancel@3, price@1, quota@1,
 *    cancel@4, history@1, fifo@2, transfer@1.
 * 8. GRAINE : 6868 (entier, convention de T64.II.2). Aucun `count` n'est
 *    impose : la taille du lot est celle que l'implementation choisit
 *    (T64.A4 en garantit deja au moins 20). A3 exige en outre que le `total`
 *    note egale la longueur du lot rendu par le generateur pour la meme
 *    (regle, periode, graine) : le notateur doit noter CE lot.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LES DANGERS PROPRES A T68, ET LEUR CONTROLE
 *
 * (1) NOTATEUR CONSTANT (toujours 1) : A2 rougit — le prive doit noter < 1.
 * (2) NOTATEUR CONSTANT (toujours 0) ou qui ne lance pas le candidat : A1
 *     rougit — le fidele doit noter 1 avec satisfied === total, et un trafic
 *     de copie doit exister.
 * (3) SEQUENCES TRIVIALES (deux reservations, la seconde attend) : le prive
 *     de chaque regle les satisfait comme le fidele -> A2 rougit ; et ni
 *     set_capacity, ni set_level, ni balance, ni history, ni transfer
 *     n'apparaissent sur les copies -> A3 rougit.
 * (4) A1/A2/A3 bouclent sur CHAQUE regle de REGLES_P5 et CHAQUE periode ou
 *     REGLES_ADR la declare active — jamais un echantillon.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie aucun fait gele de F-LONG : le test-author a rejoue
 *    acceptance/reference-long/F-LONG.json contre la fixture hors suite.
 *  • Aucun processus nomme `claude` n'est lance (ADR-008) : le seul candidat
 *    execute est la fixture ACCEPTANCE ci-dessus.
 *  • Le choix II.6 pour quota@1, fifo@2, cancel@3, cancel@4 n'est pas la
 *    seule lecture possible d'ADR-019 : il est documente et verifie tel quel.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 60_000;
// 34 couples (regle, periode) notes pour le fidele (A1, reutilises par A3) et
// 34 pour les prives (A2), chacun avec rejeu de trajectoire et un lot d'au
// moins 20 sequences sur copies : bornes larges, jamais plus etroites que T64.
const SCORE_TIMEOUT_MS = 2_400_000;

const CONTRAT_V4 = 'bench.candidate/4';
const GRAINE = 6868;

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

/* ═══════════════ chargement de packages/scenario + activities ══════════ */

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

interface Loaded {
  charge: boolean;
  flat: Map<string, unknown>;
  attempts: string[];
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

let LOADED: Loaded = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  let unCharge = false;
  for (const pkg of ['scenario', 'activities']) {
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
    'packages-scenario-ou-activities-charges',
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

/* ═══════ les douze ensembles de regles — oracle (reprise T61.V/T67) ═════ */
// ADR-018:L61-65 et L86-155. Repris d'acceptance/T61.spec.ts (V), suite
// ACCEPTEE, PROUVEE A HEAD : jamais recalcule ici.
const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const;
type Periode = (typeof PERIODES)[number];

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
const PERIODES_P1_A_P4: Periode[] = ['P1', 'P2', 'P3', 'P4'];
const PERIODES_P5_A_P12: Periode[] = ['P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'];

/** II.7 — « regle active a partir de P5 », derivee de REGLES_ADR. */
function reglesActivesAPartirDeP5(): string[] {
  const avantP5 = new Set<string>();
  for (const p of PERIODES_P1_A_P4) for (const r of REGLES_ADR[p]) avantP5.add(r);
  const vues = new Set<string>();
  const out: string[] = [];
  for (const p of PERIODES_P5_A_P12) {
    for (const r of REGLES_ADR[p]) {
      if (avantP5.has(r) || vues.has(r)) continue;
      vues.add(r);
      out.push(r);
    }
  }
  return out;
}

function periodesActives(ruleId: string): Periode[] {
  return PERIODES.filter((p) => REGLES_ADR[p].includes(ruleId));
}

const REGLES_P5 = reglesActivesAPartirDeP5();

/* ═══════ operation(s) introduite(s) par regle (II.6) ════════════════════ */

const OPERATION_DEDIEE: Record<string, string[]> = {
  'capacity@1': ['set_capacity'],
  'priority@1': ['set_level'],
  'price@1': ['balance'],
  'history@1': ['history'],
  'transfer@1': ['transfer'],
  'quota@1': ['write'],
  'cancel@3': ['probe_cancel'],
  'cancel@4': ['probe_cancel'],
  'fifo@2': ['write'],
};

function operationsDedieesDe(ruleId: string): string[] {
  const ops = OPERATION_DEDIEE[ruleId];
  exige(
    Array.isArray(ops) && ops.length > 0,
    `operation-dediee-connue-pour-${ruleId}`,
    `AUCUNE-OPERATION-DEDIEE-FIXEE-POUR ${ruleId} dans OPERATION_DEDIEE (II.6) — REGLES_P5=${rendu(REGLES_P5)}.`,
  );
  return ops as string[];
}

/* ═══════ candidats FIXTURES (II.1, II.3) — hors de portee de l'implementeur */

const FIXTURE_CANDIDAT = path.join(
  REPO,
  'acceptance',
  'fixtures',
  'candidates',
  'f-long-reference-candidate-v4.mjs',
);

const RACINE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't68-'));

interface Lancement {
  candidateCommand: string[];
  benchDataDir: string;
  journal: string;
}

/** II.3 — lanceur au nom aleatoire : fidele et prive ont des commandes de meme forme. */
function preparerLancement(dropRule: string | null): Lancement {
  const dossier = fs.mkdtempSync(path.join(RACINE_TMP, 'run-'));
  const journal = path.join(dossier, 'traffic.ndjson');
  const lanceur = path.join(dossier, `candidate-${randomBytes(6).toString('hex')}.mjs`);
  const benchDataDir = fs.mkdtempSync(path.join(RACINE_TMP, 'data-'));
  const source = [
    `process.env.BENCH_DROP_RULE = ${JSON.stringify(dropRule ?? '')};`,
    `process.env.BENCH_TRAFFIC_LOG = ${JSON.stringify(journal)};`,
    `await import(${JSON.stringify(pathToFileURL(FIXTURE_CANDIDAT).href)});`,
    '',
  ].join('\n');
  fs.writeFileSync(lanceur, source);
  return { candidateCommand: ['node', lanceur], benchDataDir, journal };
}

function reel(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

interface Trafic {
  total: number;
  surTrajectoire: number;
  surCopies: number;
  opsSurCopies: Set<string>;
}

/** II.5 — trafic reel recu par la fixture, separe trajectoire / copies. */
function lireTrafic(l: Lancement): Trafic {
  const out: Trafic = { total: 0, surTrajectoire: 0, surCopies: 0, opsSurCopies: new Set() };
  if (!fs.existsSync(l.journal)) return out;
  const principal = reel(l.benchDataDir);
  for (const ligne of fs.readFileSync(l.journal, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue;
    let e: { data_dir?: unknown; op?: unknown };
    try {
      e = JSON.parse(ligne) as { data_dir?: unknown; op?: unknown };
    } catch {
      continue;
    }
    out.total += 1;
    const dir = typeof e.data_dir === 'string' ? reel(e.data_dir) : '';
    if (dir === principal) {
      out.surTrajectoire += 1;
    } else {
      out.surCopies += 1;
      if (typeof e.op === 'string') out.opsSurCopies.add(e.op);
    }
  }
  return out;
}

/* ═══════ roles de l'implementation : generateur et notateur v4 (II.2) ═══ */

const ROLES_GENERATEUR_V4 = [
  'generateDiscriminatingSequences',
  'generateSequencesForRule',
  'generateHiddenSequencesV4',
  'generateRuleSequencesV4',
  'buildDiscriminatingSequences',
  'buildDiscriminatingSequencesForRule',
  'generateHiddenSequences',
  'generateRuleSequences',
] as const;

const ROLES_NOTATEUR_V4 = [
  'scoreDiscriminatingRule',
  'scoreRuleV4',
  'scoreRuleOnContractV4',
  'scoreRuleDiscriminating',
  'scoreCandidateOnRule',
  'scoreRule',
  'scoreRuleAtPeriod',
] as const;

function extraireLot(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v !== null && typeof v === 'object') {
    for (const k of ['sequences', 'batch', 'lot', 'items']) {
      const x = (v as Json)[k];
      if (Array.isArray(x)) return x;
    }
  }
  return null;
}

async function resoudreLot(rule: string, period: Periode): Promise<{ lot: unknown[]; nom: string } | null> {
  const o = { rule, ruleId: rule, period, periodId: period, seed: GRAINE, contract: CONTRAT_V4, protocol: CONTRAT_V4 };
  const variantes: unknown[][] = [[o], [rule, period, GRAINE], [period, rule, GRAINE]];
  for (const nom of ROLES_GENERATEUR_V4) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const args of variantes) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(...args));
      if (!res.ok) continue;
      const lot = extraireLot(res.value);
      if (lot !== null && lot.length > 0) return { lot, nom };
    }
  }
  return null;
}

type Score = { score: number; satisfied: number | null; total: number | null };

function extraireScore(v: unknown): Score | null {
  if (typeof v === 'number') return { score: v, satisfied: null, total: null };
  if (v !== null && typeof v === 'object') {
    const o = v as Json;
    const score = o.score ?? o.fraction ?? o.ratio;
    const satisfied = o.satisfied ?? o.passed ?? o.okCount ?? o.satisfiedCount ?? o.nSatisfied;
    const total = o.total ?? o.count ?? o.size ?? o.n ?? o.nTotal;
    if (typeof score === 'number' && Number.isFinite(score)) {
      return {
        score,
        satisfied: typeof satisfied === 'number' ? satisfied : null,
        total: typeof total === 'number' ? total : null,
      };
    }
  }
  return null;
}

interface Notation {
  score: Score | null;
  nom: string | null;
  trafic: Trafic;
  lancement: Lancement;
}

async function noter(rule: string, period: Periode, dropRule: string | null): Promise<Notation> {
  const lancement = preparerLancement(dropRule);
  const o = {
    rule,
    ruleId: rule,
    period,
    periodId: period,
    seed: GRAINE,
    contract: CONTRAT_V4,
    protocol: CONTRAT_V4,
    candidateCommand: lancement.candidateCommand,
    benchDataDir: lancement.benchDataDir,
  };
  const variantes: unknown[][] = [
    [o],
    [o.candidateCommand, o.benchDataDir, rule, period, GRAINE],
    [rule, period, o.candidateCommand, o.benchDataDir, GRAINE],
  ];
  for (const nom of ROLES_NOTATEUR_V4) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const args of variantes) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(...args));
      if (!res.ok) continue;
      const score = extraireScore(res.value);
      if (score !== null) return { score, nom, trafic: lireTrafic(lancement), lancement };
    }
  }
  return { score: null, nom: null, trafic: lireTrafic(lancement), lancement };
}

// Les notations du candidat FIDELE servent a A1 et a A3 : calculees une fois,
// a la demande de l'un ou de l'autre (chaque cas reste executable seul).
const NOTATIONS_FIDELES = new Map<string, Promise<Notation>>();
function noterFidele(rule: string, period: Periode): Promise<Notation> {
  const k = `${rule}|${period}`;
  let p = NOTATIONS_FIDELES.get(k);
  if (p === undefined) {
    p = noter(rule, period, null);
    NOTATIONS_FIDELES.set(k, p);
  }
  return p;
}

function exigeNotation(n: Notation, etiquette: string): Score {
  exige(
    n.score !== null,
    `notateur-v4-resolu-${etiquette}`,
    `NOTATEUR-V4-INTROUVABLE pour ${etiquette} parmi ${rendu([...ROLES_NOTATEUR_V4])} (contract=${CONTRAT_V4}, exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  const s = n.score as Score;
  exige(
    Number.isFinite(s.score) && s.score >= 0 && s.score <= 1,
    `score-dans-0-1-${etiquette}`,
    `SCORE-HORS-INTERVALLE pour ${etiquette} : ${rendu(s)} (notateur ${n.nom}).`,
  );
  exige(
    n.trafic.surCopies > 0,
    `candidat-reellement-execute-sur-copies-${etiquette}`,
    `AUCUN-TRAFIC-DE-SEQUENCE pour ${etiquette} : la fixture n'a recu aucune requete sur une copie de l'etat (trafic total=${n.trafic.total}, sur benchDataDir=${n.trafic.surTrajectoire}) — la note ${rendu(s)} (notateur ${n.nom}) ne vient pas d'une execution reelle du candidat sur les sequences.`,
  );
  return s;
}

/* ═══════════════════════════════ T68.A1 ════════════════════════════════ */

test(
  'T68.A1 — pour chaque regle active a partir de P5, un candidat de reference qui implemente toutes les regles de F-LONG obtient un score de 1 sur chaque regle active a chaque periode',
  async () => {
    assertPackagesLoaded();
    exige(
      REGLES_P5.length > 0,
      'regles-actives-a-partir-de-p5-non-vide',
      `REGLES_P5-VIDE : la derivation de II.7 n'a trouve aucune regle, REGLES_ADR=${rendu(REGLES_ADR)}`,
    );
    exige(
      fs.existsSync(FIXTURE_CANDIDAT),
      'fixture-candidat-v4-presente',
      `FIXTURE-CANDIDAT-ABSENTE : ${FIXTURE_CANDIDAT}`,
    );

    for (const ruleId of REGLES_P5) {
      const periodes = periodesActives(ruleId);
      exige(
        periodes.length > 0,
        `regle-${ruleId}-a-au-moins-une-periode-active`,
        `${ruleId}-SANS-PERIODE-ACTIVE selon REGLES_ADR, alors qu'elle appartient a REGLES_P5.`,
      );
      for (const periodId of periodes) {
        const etiquette = `fidele-${ruleId}-${periodId}`;
        const n = await noterFidele(ruleId, periodId);
        const { score, satisfied, total } = exigeNotation(n, etiquette);
        exige(
          total !== null && Number.isInteger(total) && total >= 1,
          `total-entier-positif-${etiquette}`,
          `TOTAL-ABSENT-OU-NUL pour ${etiquette} : total=${rendu(total)} (notateur ${n.nom}).`,
        );
        exige(
          satisfied !== null && satisfied === total,
          `satisfied-egale-total-${etiquette}`,
          `FIDELE-SEQUENCES-NON-TOUTES-SATISFAITES pour ${etiquette} : satisfied=${rendu(satisfied)}, total=${rendu(total)} (notateur ${n.nom}).`,
        );
        exige(
          score === 1,
          `score-fidele-${ruleId}-${periodId}-egal-1`,
          `SCORE-FIDELE-DIFFERENT-DE-1 pour regle=${ruleId} periode=${periodId} : score=${rendu(score)}, satisfied=${rendu(satisfied)}, total=${rendu(total)} (notateur ${n.nom}) — ADR-019:L104, « un score de 1 ».`,
        );
      }
    }
  },
  SCORE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T68.A2 ════════════════════════════════ */

test(
  'T68.A2 — pour chaque regle active a partir de P5, le meme candidat prive de cette seule regle obtient sur elle un score strictement inferieur a 1',
  async () => {
    assertPackagesLoaded();
    exige(
      REGLES_P5.length > 0,
      'regles-actives-a-partir-de-p5-non-vide-a2',
      `REGLES_P5-VIDE : la derivation de II.7 n'a trouve aucune regle, REGLES_ADR=${rendu(REGLES_ADR)}`,
    );
    exige(
      fs.existsSync(FIXTURE_CANDIDAT),
      'fixture-candidat-v4-presente-a2',
      `FIXTURE-CANDIDAT-ABSENTE : ${FIXTURE_CANDIDAT}`,
    );

    for (const ruleId of REGLES_P5) {
      for (const periodId of periodesActives(ruleId)) {
        // « le MEME candidat » : la privation ne discrimine que si, sur la
        // meme (regle, periode, graine), le candidat complet note 1 (II.4).
        const fidele = await noterFidele(ruleId, periodId);
        const sf = exigeNotation(fidele, `temoin-fidele-a2-${ruleId}-${periodId}`);
        exige(
          sf.score === 1,
          `temoin-fidele-a2-${ruleId}-${periodId}-egal-1`,
          `TEMOIN-FIDELE-DIFFERENT-DE-1 pour regle=${ruleId} periode=${periodId} : score=${rendu(sf.score)}, satisfied=${rendu(sf.satisfied)}, total=${rendu(sf.total)} (notateur ${fidele.nom}) — un score < 1 du prive ne prouve rien si le candidat complet echoue lui aussi.`,
        );

        const etiquette = `prive-de-${ruleId}-${periodId}`;
        const n = await noter(ruleId, periodId, ruleId);
        const { score, satisfied, total } = exigeNotation(n, etiquette);
        exige(
          score < 1,
          `score-prive-${ruleId}-${periodId}-strictement-inferieur-a-1`,
          `SCORE-PRIVE-EGAL-OU-SUPERIEUR-A-1 pour regle=${ruleId} periode=${periodId} : score=${rendu(score)}, satisfied=${rendu(satisfied)}, total=${rendu(total)} (notateur ${n.nom}, operations vues sur les copies : ${rendu([...n.trafic.opsSurCopies].sort())}) — les sequences de ${ruleId} ne distinguent pas un candidat qui l'ignore (ADR-019:L24-29, L87-91).`,
        );
      }
    }
  },
  SCORE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T68.A3 ════════════════════════════════ */

test(
  'T68.A3 — les sequences de chaque regle appellent au moins une fois chaque operation que la regle introduit',
  async () => {
    assertPackagesLoaded();
    exige(
      REGLES_P5.length > 0,
      'regles-actives-a-partir-de-p5-non-vide-a3',
      `REGLES_P5-VIDE : la derivation de II.7 n'a trouve aucune regle, REGLES_ADR=${rendu(REGLES_ADR)}`,
    );

    for (const ruleId of REGLES_P5) {
      const ops = operationsDedieesDe(ruleId);
      for (const periodId of periodesActives(ruleId)) {
        const etiquette = `${ruleId}-${periodId}`;

        const lot = await resoudreLot(ruleId, periodId);
        exige(
          lot !== null,
          `generateur-v4-resolu-${etiquette}`,
          `GENERATEUR-V4-INTROUVABLE-OU-LOT-VIDE pour ${etiquette} parmi ${rendu([...ROLES_GENERATEUR_V4])} (contract=${CONTRAT_V4}, seed=${GRAINE}, exports vus : ${rendu([...LOADED.flat.keys()])})`,
        );

        const n = await noterFidele(ruleId, periodId);
        const { total } = exigeNotation(n, `a3-${etiquette}`);
        exige(
          total !== null && total === (lot as { lot: unknown[] }).lot.length,
          `notateur-note-le-lot-genere-${etiquette}`,
          `TOTAL-NOTE-DIFFERENT-DU-LOT-GENERE pour ${etiquette} : total=${rendu(total)} (notateur ${n.nom}), lot=${(lot as { lot: unknown[] }).lot.length} sequence(s) (generateur ${(lot as { nom: string }).nom}, meme regle, periode et graine).`,
        );

        for (const op of ops) {
          exige(
            n.trafic.opsSurCopies.has(op),
            `sequences-${ruleId}-${periodId}-appellent-${op}`,
            `OPERATION-INTRODUITE-JAMAIS-APPELEE : regle=${ruleId} periode=${periodId} — aucune requete ${op} n'a atteint le candidat sur une copie de l'etat (operations reellement recues sur les copies : ${rendu([...n.trafic.opsSurCopies].sort())} ; ${n.trafic.surCopies} requete(s) sur copies, ${n.trafic.surTrajectoire} sur benchDataDir).`,
          );
        }
      }
    }
  },
  SCORE_TIMEOUT_MS,
);
