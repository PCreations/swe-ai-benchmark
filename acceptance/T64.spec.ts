/**
 * acceptance/T64.spec.ts — suite d'acceptation de la tache T64.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T64.A1 behaviour — meme graine, meme lot de sequences ; deux graines
 *                      differentes donnent deux lots differents
 *   T64.A2 absence   — aucune sequence generee ne figure dans l'enonce
 *                      (le prompt) de la periode
 *   T64.A3 numeric   — le score d'une regle a une periode est la fraction
 *                      de ses sequences satisfaites, et un candidat qui ne
 *                      traite que le cas de la trajectoire principale
 *                      obtient un score < 1 sur au moins une regle de
 *                      chaque periode a partir de P5
 *   T64.A4 numeric   — le lot de chaque regle compte au moins 20 sequences
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T64 EST UNE TACHE D'EXTENSION (ADR-018) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-018-scenario-long-et-contradictoire.md, lignes 198-204),
 * jamais le cahier directement. L'auteur de cette suite est AVEUGLE aux
 * `source_paths` que verification/tasks.extensions.json declare pour T64 —
 * `packages/activities`, `packages/scenario` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL,
 * discipline auditable au diff, jamais une barriere technique). Le contrat
 * teste ci-dessous est derive de docs/specs/T64.md et de sa source, le MEME
 * document ACCEPTE, lignes 198-204, AINSI QUE du corps narratif du MEME
 * document hors de cette plage (Decision point 3, L54-58 : « Des controles
 * larges et caches ») — la meme liberte que prennent deja acceptance/
 * T48.spec.ts a acceptance/T63.spec.ts face a leur propre ADR.
 *
 *   L54-58 decision point 3, mot pour mot : « Chaque regle active est
 *           verifiee par la trajectoire principale et par un lot de
 *           sequences generees a partir d'une graine. Ces sequences
 *           s'appliquent a des copies de l'etat et ne sont jamais montrees
 *           au candidat. Le score d'une regle a une periode est la fraction
 *           de ses sequences satisfaites. Les exemples publics restent
 *           distincts : ils fixent la forme des messages, jamais un cas
 *           controle. »
 *   L200   livrables, mot pour mot : « generation, a partir d'une graine,
 *           d'un lot de sequences par regle active, appliquees a des
 *           copies de l'etat ; score par regle et par periode »
 *   L202   les quatre cas d'acceptation, mot pour mot
 *   L204   commande : `pnpm verify:task T64`. « PostgreSQL et le stockage
 *           objet sont requis ; aucun appel reel. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions DEJA FIXEES par les
 * suites ACCEPTEES dont elle etend le socle (jamais les sources de T64) :
 *   - acceptance/T62.spec.ts (socle) : le chargement ESM direct de
 *     `packages/scenario` et `packages/activities`, la navigation JSON
 *     generique (`noeuds`/`champTexte`), le marqueur `bench.candidate/3`
 *     (`porteContratV3`), la resolution de LA description unifiee et la
 *     resolution tolerante du texte d'enonce d'une periode
 *     (`ROLES_STATEMENT_BUILDER`, `enonceDePeriode`) — REPRISES A
 *     L'IDENTIQUE.
 *   - acceptance/T61.spec.ts (section V, `REGLES_ADR`) : l'ensemble des
 *     regles actives par periode, RECALCULE depuis ADR-018 par une suite
 *     deja ACCEPTEE et PROUVEE a HEAD — repris comme oracle, jamais
 *     recalcule une seconde fois ici.
 *   - acceptance/T63.spec.ts (socle) : `candidateCommand`/`benchDataDir`
 *     comme canal d'entree d'un candidat sous test, et la convention qu'un
 *     candidat de reference ACCEPTANCE (jamais une source de la tache) est
 *     le temoin d'un comportement, jamais une implementation de T64.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001 : aucune des valeurs ci-dessous
 * n'a ete obtenue en executant une implementation de T64 — aucun module de
 * T64 n'existe encore au moment ou elle est ecrite ; ADR-018 decrit un
 * MECANISME, jamais une signature de fonction)
 *
 * 1. DEUX ROLES, resolus par balayage tolerant des exports top-level de
 *    `packages/scenario` et `packages/activities` (ROLES_GENERATE_SEQUENCES
 *    / ROLES_SCORE_RULE plus bas), appeles sous PLUSIEURS formes
 *    d'arguments (objet nomme, puis plusieurs ordres positionnels) — meme
 *    tolerance qu'acceptance/T63.spec.ts (II, `essayerAppel`) :
 *      - « generateur » : `(opts: {rule, period, seed, count?}) =>
 *        sequence[] | {sequences: sequence[]} | {batch: sequence[]}` — une
 *        `sequence` est une valeur opaque (jamais inspectee par cette
 *        suite, seulement comparee par egalite structurelle JSON) ;
 *      - « notateur » : `(opts: {rule, period, seed, candidateCommand,
 *        benchDataDir, count?}) => Promise<{score, satisfied?, total?} |
 *        number>`. Cette suite FIXE que le notateur est responsable, s'il
 *        en a besoin, d'amener lui-meme l'etat du candidat jusqu'a la
 *        periode demandee en rejouant la trajectoire principale contre
 *        `candidateCommand`/`benchDataDir` (reprise du mecanisme deja
 *        PROUVE par acceptance/T63.spec.ts) AVANT de generer et noter le
 *        lot cache sur des copies — ADR-018 L54-58 lie explicitement les
 *        deux (« chaque regle active est verifiee par la trajectoire
 *        principale ET par un lot »), et aucune source ne fixe de
 *        signature distincte pour une etape de mise en etat separee.
 * 2. LA GRAINE est un entier JavaScript ordinaire (`number`), jamais une
 *    chaine : aucune source ne le dit, mais c'est la forme la plus simple
 *    compatible avec « meme graine » / « deux graines differentes ».
 * 3. L'ENSEMBLE DES REGLES ACTIVES PAR PERIODE est `REGLES_ADR` (section
 *    III), repris d'acceptance/T61.spec.ts (section V) — jamais recalcule.
 * 4. LE CANDIDAT « QUI NE TRAITE QUE LE CAS DE LA TRAJECTOIRE PRINCIPALE »
 *    (T64.A3) est `t64-naive-single-case-candidate.mjs` (FIXE ICI, section
 *    IV) : il repond ok:true a toute operation du contrat
 *    `bench.candidate/3` avec un resultat FIXE et IDENTIQUE quels que
 *    soient les arguments — jamais de file d'attente, de refus, de solde ou
 *    d'historique reels. C'est la forme degeneree, mais SUFFISANTE pour la
 *    clause « score < 1 » : un lot cache d'au moins 20 sequences variees
 *    contient quasi surement un cas qui exige davantage qu'une confirmation
 *    immediate.
 * 5. POUR CHAQUE PERIODE DE P5 A P12, LA REGLE SOUS TEST DE T64.A3
 *    (`REGLE_SOUS_TEST`, section V) est la regle NOUVELLEMENT introduite ou
 *    REMPLACEE a cette periode (ADR-018, section « Le scenario F-LONG ») —
 *    celle qui exige le plus surement une capacite que le candidat
 *    degenere n'a pas : `capacity@1` (P5, L91), `priority@1` (P6, L100),
 *    `price@1` (P7, L107), `quota@1` (P8, L118), `cancel@4` (P9, L125),
 *    `history@1` (P10, L135), `fifo@2` (P11, L142), `transfer@1` (P12,
 *    L149).
 * 6. LE CANDIDAT FIDELE DE T64.A3 est `f-long-reference-candidate.mjs`
 *    (FIXE ICI, zone ACCEPTANCE) : il implemente P1 a P12 d'ADR-018 et
 *    persiste son etat dans BENCH_DATA_DIR. Pour chaque periode de P5 a P12
 *    et CHAQUE regle active (`REGLES_ADR`), A3 exige total >= 20,
 *    satisfied === total et score === 1 ; et, sur la regle sous test (II.5),
 *    score naif < score fidele. Sans ce volet positif, un notateur qui ne
 *    lance jamais le candidat et rend {score:0, satisfied:0, total:20}
 *    passait A3 (defaut constate par un auditeur).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 *   `REGLES_ADR` (table complete, 12 periodes) — acceptance/T61.spec.ts
 *     (section V), suite ACCEPTEE, PROUVEE a HEAD ; recalculee par elle
 *     depuis ADR-018 L61-65 et L86-155, jamais re-derivee ici.
 *   `bench.candidate/3`, ses onze operations, `porteContratV3`,
 *     `ROLES_STATEMENT_BUILDER` — acceptance/T62.spec.ts (II.1, II.3).
 *   protocole NDJSON `{"id","ok",...}` — acceptance/T48.spec.ts (III.2).
 *   Les identifiants de regle cites en II.5 (`capacity@1` ... `transfer@1`)
 *     — REGLES_ADR elle-meme (ci-dessus), jamais inventes.
 *   Le seuil `20` (T64.A4) — ADR-018:L202, mot pour mot (« au moins 20
 *     sequences »).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T64, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) T64.A1 NE DOIT PAS SE CONTENTER D'UN GENERATEUR QUI IGNORE LA GRAINE
 *     EN RENVOYANT TOUJOURS LE MEME LOT. Cette suite exige donc, EN PLUS de
 *     l'egalite a graine fixee, une INEGALITE stricte entre deux graines
 *     differentes (perturbation prescrite par verification/
 *     cases.extensions.lock.json#T64.A1 : « ignorer la graine dans la
 *     generation : le cas doit rougir »). Sans ce second volet, un
 *     generateur constant passerait le premier volet par accident.
 * (2) T64.A2 NE DOIT PAS SE CONTENTER D'UN ENONCE VIDE. Avant de chercher
 *     l'ABSENCE d'une sequence dans l'enonce, cette suite exige que
 *     l'enonce resolu soit non vide ET que le lot genere soit non vide : un
 *     enonce vide ou un lot vide rendrait l'absence VRAIE PAR DEFAUT, pour
 *     la mauvaise raison (perturbation prescrite : « inclure une sequence
 *     generee dans les exemples du prompt : le cas doit rougir » — un
 *     mutant qui le fait DOIT etre attrape, ce qui exige un enonce et un
 *     lot tous deux reels et non vides au moment de la comparaison).
 * (3) T64.A3 : LE DANGER EST UN NOTATEUR QUI RENVOIE UN SCORE CONSTANT (par
 *     exemple toujours 0) SANS JAMAIS GENERER NI EVALUER REELLEMENT DE
 *     SEQUENCE — ce qui satisferait trivialement « score < 1 ». Cette
 *     suite exige donc, EN PLUS de « score < 1 », que `total` (le nombre de
 *     sequences evaluees) soit un entier STRICTEMENT POSITIF et que `score`
 *     EGALE EXACTEMENT `satisfied / total` (a 1e-9 pres) lorsque ces deux
 *     champs sont rendus — un notateur qui renverrait `{score:0}` SANS
 *     `satisfied`/`total` echoue donc cette seconde exigence, qui est
 *     requise sur CHAQUE periode de P5 a P12 (jamais une seule suffit,
 *     ADR-018:L202 : « sur au moins une regle de chaque periode »).
 * (4) T64.A4 : meme danger qu'ADR-018 nomme pour le pilote (§ "Ce que le
 *     cinquieme pilote reel a montre", point 2 — « un cas par controle,
 *     une implementation tres partielle la passe ») transpose au lot
 *     cache : cette suite verifie la longueur du lot pour TOUTE regle
 *     active de TOUTE periode (`REGLES_ADR` complet), jamais une seule
 *     paire (regle, periode) choisie a la main.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie aucune regle metier de F-LONG (reserve/cancel/
 *    priority/capacity/...) : proprietes de T61/T62, deja PROUVEES par
 *    leurs propres suites.
 *  • Elle n'exerce ni une session `claude -p` ni un fournisseur `claude-cli`
 *    (ADR-008) : aucun processus nomme `claude` n'est jamais lance. Le seul
 *    candidat exerce est une fixture ACCEPTANCE ecrite par cette suite.
 *  • Elle ne mesure ni Q/R/G (T65) ni le rapport agrege de repetitions
 *    (T66) : taches distinctes, en aval.
 *  • Elle n'exige aucun format de stockage precis des lots caches (fichier,
 *    table PostgreSQL, objet S3) : seul le comportement observable au
 *    travers des deux exports resolus compte.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 60_000;
const SCORE_TIMEOUT_MS = 240_000;
// T64.A3 note en outre le candidat FIDELE sur CHAQUE regle active de P5 a P12
// (63 lots de 20 sequences au moins, chacune dans un processus neuf) : borne
// propre a A3, plus large que SCORE_TIMEOUT_MS, jamais plus etroite.
const SCORE_TIMEOUT_A3_MS = 1_200_000;

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

/* ═══════════════════ chargement de packages/scenario + packages/activities */

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

/* ═══════════════════ navigation JSON generique (reprise T62) ═══════════ */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 10): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [
    { chemin: '$', cle: '', v: racine, p: 0 },
  ];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) {
        file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
      }
    }
  }
  return out;
}

function champTexte(r: unknown, alias: readonly string[]): string | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(r)) {
    if (
      n.cle !== '' &&
      cible.has(normKey(n.cle)) &&
      typeof n.valeur === 'string' &&
      n.valeur.length > 0
    ) {
      return n.valeur;
    }
  }
  return null;
}

/* ═══════════════════ contrat bench.candidate/3 (T62.II.1) ══════════════ */

const MARQUEUR_CONTRAT_V3 = 'bench.candidate/3';
const OPS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint'];
const OPS_V3_NOUVELLES = ['set_capacity', 'set_level', 'balance', 'history', 'transfer'];
const OPS_V3 = [...OPS_V2, ...OPS_V3_NOUVELLES];

function porteContratV3(racine: unknown): boolean {
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && n.valeur === MARQUEUR_CONTRAT_V3) return true;
  }
  const vues = new Set<string>();
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && OPS_V3.includes(n.valeur)) vues.add(n.valeur);
  }
  return vues.size >= 7;
}

/* ═══════════════════ les douze periodes (T62.II.2) ══════════════════════ */

const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const;
type Periode = (typeof PERIODES)[number];

function noeudPeriode(racine: unknown, cle: Periode): Json | null {
  const cibleNorm = normKey(cle);
  for (const n of noeuds(racine)) {
    if (
      n.cle !== '' &&
      normKey(n.cle) === cibleNorm &&
      n.valeur !== null &&
      typeof n.valeur === 'object' &&
      !Array.isArray(n.valeur)
    ) {
      return n.valeur as Json;
    }
  }
  const indexAttendu = PERIODES.indexOf(cle);
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur)) {
      for (const entree of n.valeur) {
        if (entree === null || typeof entree !== 'object') continue;
        const idTexte = champTexte(entree, ['id', 'key', 'period', 'periode', 'periodid', 'periodkey']);
        if (idTexte !== null && normKey(idTexte) === cibleNorm) return entree as Json;
      }
    }
  }
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur) && n.valeur.length === PERIODES.length) {
      const entree = n.valeur[indexAttendu];
      if (
        entree !== null &&
        typeof entree === 'object' &&
        champTexte(entree, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null
      ) {
        return entree as Json;
      }
    }
  }
  return null;
}

const NOM_AGREGAT_DES_EXPORTS = '(ensemble des exports aplatis)';

function candidatsDescription(): { nom: string; valeur: unknown }[] {
  const out: { nom: string; valeur: unknown }[] = [];
  for (const [k, v] of LOADED.flat.entries()) {
    if (v !== null && typeof v === 'object') out.push({ nom: k, valeur: v });
  }
  out.push({ nom: NOM_AGREGAT_DES_EXPORTS, valeur: Object.fromEntries(LOADED.flat.entries()) });
  return out;
}

function enonceDeNoeud(noeud: Json | null): string | null {
  if (noeud === null) return null;
  return champTexte(noeud, ['statement', 'enonce', 'narrative', 'prose', 'text']);
}

function resoudreDescriptionUnifiee(): { valeur: Json; nom: string } | null {
  for (const c of candidatsDescription()) {
    if (!porteContratV3(c.valeur)) continue;
    let periodesAvecEnonce = 0;
    for (const p of PERIODES) {
      if (enonceDeNoeud(noeudPeriode(c.valeur, p)) !== null) periodesAvecEnonce += 1;
    }
    if (periodesAvecEnonce >= 2) return { valeur: c.valeur as Json, nom: c.nom };
  }
  return null;
}

function requireDescriptionUnifiee(): Json {
  const r = resoudreDescriptionUnifiee();
  exige(
    r !== null,
    'description-unifiee-resolue',
    `DESCRIPTION-UNIFIEE-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT_V3} et au moins deux enonces de periode. Exports vus : ${rendu([...LOADED.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}

const ROLES_STATEMENT_BUILDER = [
  'buildFLongPeriodStatement',
  'buildPeriodStatement',
  'statementForPeriod',
  'buildCandidateStatement',
  'periodStatement',
  'buildFLongPeriodPrompt',
] as const;

function extraireTexte(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (v !== null && typeof v === 'object') return champTexte(v, ['statement', 'enonce', 'prompt', 'text']);
  return null;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await thunk() };
  } catch {
    return { ok: false };
  }
}

async function enonceDePeriode(cle: Periode, description: Json): Promise<string | null> {
  const index0 = PERIODES.indexOf(cle);
  const args: unknown[] = [cle, cle.toLowerCase(), index0, index0 + 1, { period: cle }, { periodKey: cle }];
  for (const nom of ROLES_STATEMENT_BUILDER) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const arg of args) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(arg));
      if (!res.ok) continue;
      const texte = extraireTexte(res.value);
      if (texte !== null) return texte;
    }
  }
  return enonceDeNoeud(noeudPeriode(description, cle));
}

async function requireEnonce(cle: Periode, description: Json): Promise<string> {
  const texte = await enonceDePeriode(cle, description);
  exige(
    texte !== null && texte.length > 0,
    `enonce-${cle}-resolu`,
    `ENONCE-INTROUVABLE-OU-VIDE-POUR ${cle} (danger IV.2 : un enonce vide rendrait toute absence vraie par defaut).`,
  );
  return texte as string;
}

/* ═══════════════ les douze ensembles de regles (repris T61.V) ══════════ */

// ADR-018:L61-65 et L86-155. Repris d'acceptance/T61.spec.ts (section V),
// suite ACCEPTEE, PROUVEE a HEAD : jamais recalcule ici.
const REGLES_ADR: Record<Periode, string[]> = {
  P1: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P2: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P3: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2'],
  P4: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1'],
  P5: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1', 'capacity@1'], // ADR-018:L91
  P6: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@2', 'isolation@1', 'capacity@1'], // ADR-018:L100
  P7: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1',
  ], // ADR-018:L107
  P8: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ], // ADR-018:L118
  P9: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ], // ADR-018:L125
  P10: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1', 'history@1',
  ], // ADR-018:L135
  P11: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1',
  ], // ADR-018:L142
  P12: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1', 'transfer@1',
  ], // ADR-018:L149
};

const PERIODES_LONGUES: Periode[] = ['P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'];

// II.5 — la regle nouvellement introduite/remplacee a chaque periode P5-P12.
const REGLE_SOUS_TEST: Record<string, string> = {
  P5: 'capacity@1', // ADR-018:L91
  P6: 'priority@1', // ADR-018:L100
  P7: 'price@1', // ADR-018:L107
  P8: 'quota@1', // ADR-018:L118
  P9: 'cancel@4', // ADR-018:L125
  P10: 'history@1', // ADR-018:L135
  P11: 'fifo@2', // ADR-018:L142
  P12: 'transfer@1', // ADR-018:L149
};

for (const p of PERIODES_LONGUES) {
  if (!REGLES_ADR[p].includes(REGLE_SOUS_TEST[p] as string)) {
    throw new Error(`REGLE_SOUS_TEST[${p}] = ${REGLE_SOUS_TEST[p]} n'est pas dans REGLES_ADR[${p}] — erreur de transcription de cette suite.`);
  }
}

/* ═══════════════ resolution tolerante du generateur (II.1) ═════════════ */

type OptsGenerer = { rule: string; period: string; seed: number; count?: number };
type Sequence = unknown;

const ROLES_GENERATE_SEQUENCES = [
  'generateHiddenSequences',
  'generateRuleSequences',
  'generateSequencesForRule',
  'generateFLongHiddenBatch',
  'buildHiddenSequenceBatch',
  'generateBatchForRule',
  'generateSequenceBatch',
  'generateHiddenBatchForRule',
] as const;

function extraireLot(v: unknown): Sequence[] | null {
  if (Array.isArray(v)) return v;
  if (v !== null && typeof v === 'object') {
    for (const k of ['sequences', 'batch', 'lot', 'items']) {
      const x = (v as Json)[k];
      if (Array.isArray(x)) return x;
    }
  }
  return null;
}

async function essayerGenerer(fn: unknown, o: OptsGenerer): Promise<Sequence[] | null> {
  if (typeof fn !== 'function') return null;
  const variantes: unknown[][] = [
    [o],
    [o.rule, o.period, o.seed, o.count],
    [o.period, o.rule, o.seed, o.count],
    [o.seed, o.rule, o.period, o.count],
  ];
  for (const args of variantes) {
    const res = await essayer(() => (fn as (...x: unknown[]) => unknown)(...args));
    if (!res.ok) continue;
    const lot = extraireLot(res.value);
    if (lot !== null) return lot;
  }
  return null;
}

async function resoudreGenerateur(o: OptsGenerer): Promise<{ lot: Sequence[]; nom: string } | null> {
  for (const nom of ROLES_GENERATE_SEQUENCES) {
    const lot = await essayerGenerer(LOADED.flat.get(nom), o);
    if (lot !== null) return { lot, nom };
  }
  return null;
}

async function requireLot(o: OptsGenerer): Promise<Sequence[]> {
  const r = await resoudreGenerateur(o);
  exige(
    r !== null,
    'generateur-resolu',
    `GENERATEUR-INTROUVABLE pour ${rendu(o)} parmi ${rendu([...ROLES_GENERATE_SEQUENCES])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  return (r as { lot: Sequence[] }).lot;
}

/* ═══════════════ resolution tolerante du notateur (II.1) ════════════════ */

type OptsNoter = {
  rule: string;
  period: string;
  seed: number;
  candidateCommand: string[];
  benchDataDir: string;
  count?: number;
};
type Score = { score: number; satisfied: number | null; total: number | null };

const ROLES_SCORE_RULE = [
  'scoreRule',
  'scoreRuleAtPeriod',
  'scoreFLongRule',
  'computeRuleScore',
  'scoreHiddenBatch',
  'scoreRuleForPeriod',
  'scoreFLongHiddenBatch',
] as const;

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

async function essayerNoter(fn: unknown, o: OptsNoter): Promise<Score | null> {
  if (typeof fn !== 'function') return null;
  const variantes: unknown[][] = [
    [o],
    [o.candidateCommand, o.benchDataDir, o.rule, o.period, o.seed, o.count],
    [o.rule, o.period, o.candidateCommand, o.benchDataDir, o.seed, o.count],
  ];
  for (const args of variantes) {
    const res = await essayer(() => (fn as (...x: unknown[]) => unknown)(...args));
    if (!res.ok) continue;
    const score = extraireScore(res.value);
    if (score !== null) return score;
  }
  return null;
}

async function resoudreNotateur(o: OptsNoter): Promise<{ score: Score; nom: string } | null> {
  for (const nom of ROLES_SCORE_RULE) {
    const score = await essayerNoter(LOADED.flat.get(nom), o);
    if (score !== null) return { score, nom };
  }
  return null;
}

async function requireScore(o: OptsNoter): Promise<Score> {
  const r = await resoudreNotateur(o);
  exige(
    r !== null,
    'notateur-resolu',
    `NOTATEUR-INTROUVABLE pour ${rendu({ rule: o.rule, period: o.period, seed: o.seed })} parmi ${rendu([...ROLES_SCORE_RULE])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  return (r as { score: Score }).score;
}

/* ═══════════════════════════ candidat de reference (II.4) ═══════════════ */

const CANDIDAT_NAIF = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 't64-naive-single-case-candidate.mjs');

// II.6 — candidat de reference FIDELE a F-LONG (P1 a P12, etat persiste dans
// BENCH_DATA_DIR), ecrit par le test-author (zone ACCEPTANCE), reutilisable
// par T66 (T66.A1). C'est le temoin POSITIF de T64.A3 : un notateur qui ne
// lance jamais le candidat (score constant), ou qui ne compte pas les
// sequences reellement satisfaites, ne peut pas lui donner satisfied === total.
const CANDIDAT_FIDELE = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-long-reference-candidate.mjs');

function commandePour(script: string): string[] {
  return ['node', script];
}

function nouveauRepertoireDonnees(suffixe: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `t64-${suffixe}-`));
}

/* ═══════════════════════════════ T64.A1 ════════════════════════════════ */

test(
  'T64.A1 — meme graine et meme regle/periode donnent le meme lot de sequences ; deux graines differentes donnent deux lots differents',
  async () => {
    assertPackagesLoaded();

    const paires: { period: Periode; rule: string }[] = [
      { period: 'P5', rule: 'capacity@1' },
      { period: 'P9', rule: 'quota@1' },
    ];

    for (const { period, rule } of paires) {
      const lotA1 = await requireLot({ rule, period, seed: 4242, count: 20 });
      const lotA2 = await requireLot({ rule, period, seed: 4242, count: 20 });
      const lotB = await requireLot({ rule, period, seed: 4243, count: 20 });

      exige(
        lotA1.length > 0,
        `lot-non-vide-${period}-${rule}`,
        `LOT-VIDE pour ${period}/${rule} (seed 4242) : un lot vide ne peut temoigner de rien.`,
      );

      const jA1 = JSON.stringify(lotA1);
      const jA2 = JSON.stringify(lotA2);
      const jB = JSON.stringify(lotB);

      exige(
        jA1 === jA2,
        `meme-graine-meme-lot-${period}-${rule}`,
        `MEME-GRAINE-LOTS-DIFFERENTS pour ${period}/${rule} : ${court(jA1)} != ${court(jA2)} — le generateur n'est pas deterministe sur la graine.`,
      );
      exige(
        jA1 !== jB,
        `graines-differentes-lots-differents-${period}-${rule}`,
        `GRAINES-DIFFERENTES-MEME-LOT pour ${period}/${rule} (seed 4242 vs 4243) : ${court(jA1)} — la graine est ignoree par le generateur.`,
      );
    }
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T64.A2 ════════════════════════════════ */

test(
  "T64.A2 — aucune sequence generee ne figure dans l'enonce (le prompt) de la periode qui la concerne",
  async () => {
    assertPackagesLoaded();
    const description = requireDescriptionUnifiee();

    const paires: { period: Periode; rule: string }[] = [
      { period: 'P5', rule: 'capacity@1' },
      { period: 'P7', rule: 'price@1' },
      { period: 'P10', rule: 'history@1' },
      { period: 'P12', rule: 'transfer@1' },
    ];

    for (const { period, rule } of paires) {
      const enonce = await requireEnonce(period, description);
      const enonceNorm = enonce.toLowerCase();

      const lot = await requireLot({ rule, period, seed: 909090, count: 20 });
      exige(
        lot.length > 0,
        `lot-non-vide-A2-${period}-${rule}`,
        `LOT-VIDE pour ${period}/${rule} : un lot vide rendrait l'absence vraie par defaut (danger IV.2).`,
      );

      for (const [i, sequence] of lot.entries()) {
        const jSeq = JSON.stringify(sequence).toLowerCase();
        exige(
          jSeq.length === 0 || !enonceNorm.includes(jSeq),
          `sequence-${i}-absente-de-l-enonce-${period}-${rule}`,
          `SEQUENCE-TROUVEE-DANS-L-ENONCE ${period}/${rule} #${i} : ${court(jSeq)} apparait dans l'enonce ${court(enonceNorm)} — une sequence cachee a fuite dans le prompt.`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T64.A3 ════════════════════════════════ */

test(
  "T64.A3 — le score d'une regle a une periode est la fraction de ses sequences satisfaites, et un candidat qui ne traite que la trajectoire principale obtient un score < 1 sur au moins une regle de chaque periode a partir de P5",
  async () => {
    assertPackagesLoaded();

    const scoresNaifs = new Map<string, number>();

    for (const period of PERIODES_LONGUES) {
      const rule = REGLE_SOUS_TEST[period] as string;
      const benchDataDir = nouveauRepertoireDonnees(`a3-${period}`);
      const candidateCommand = commandePour(CANDIDAT_NAIF);

      const { score, satisfied, total } = await requireScore({
        rule,
        period,
        seed: 777,
        candidateCommand,
        benchDataDir,
      });

      exige(
        Number.isFinite(score) && score >= 0 && score <= 1,
        `score-dans-linterval-${period}-${rule}`,
        `SCORE-HORS-INTERVALLE pour ${period}/${rule} : ${score} (attendu dans [0,1]).`,
      );

      exige(
        total !== null && total > 0,
        `total-strictement-positif-${period}-${rule}`,
        `TOTAL-ABSENT-OU-NUL pour ${period}/${rule} : total=${rendu(total)} — un notateur qui ne rend pas le decompte reel du lot evalue (ou un lot vide) ne peut temoigner que le score est bien UNE FRACTION DE SEQUENCES (danger IV.3).`,
      );

      if (satisfied !== null && total !== null) {
        const fraction = satisfied / total;
        exige(
          Math.abs(fraction - score) < 1e-9,
          `score-egale-la-fraction-${period}-${rule}`,
          `SCORE-NE-CORRESPOND-PAS-A-LA-FRACTION pour ${period}/${rule} : score=${score}, satisfied/total=${satisfied}/${total}=${fraction}.`,
        );
      }

      exige(
        score < 1,
        `score-strictement-inferieur-a-1-${period}-${rule}`,
        `SCORE-EGAL-OU-SUPERIEUR-A-1 pour ${period}/${rule} (candidat naif, trajectoire principale seule) : score=${score}, satisfied=${rendu(satisfied)}, total=${rendu(total)} — le lot cache ne discrimine pas un candidat qui ne traite que le cas principal.`,
      );

      scoresNaifs.set(period, score);
    }

    // ── Volet POSITIF (danger IV.3, renforce) : « le score est la fraction de
    // ses sequences satisfaites » n'est prouve que si un candidat REELLEMENT
    // EXECUTE et fidele a F-LONG obtient satisfied === total. Un notateur qui
    // ne lance jamais le candidat et rend un score constant (par exemple
    // {score:0, satisfied:0, total:20}) passe toutes les assertions du volet
    // naif ci-dessus, mais pas celles-ci.
    for (const period of PERIODES_LONGUES) {
      const scoresFideles = new Map<string, number>();
      for (const rule of REGLES_ADR[period]) {
        const benchDataDir = nouveauRepertoireDonnees(`a3-fidele-${period}`);
        const candidateCommand = commandePour(CANDIDAT_FIDELE);

        const { score, satisfied, total } = await requireScore({
          rule,
          period,
          seed: 777,
          candidateCommand,
          benchDataDir,
        });

        exige(
          total !== null && Number.isInteger(total) && total >= 20,
          `fidele-total-au-moins-20-${period}-${rule}`,
          `FIDELE-TOTAL-ABSENT-OU-INFERIEUR-A-20 pour ${period}/${rule} : total=${rendu(total)} — ADR-018:L202 exige au moins 20 sequences par regle, et le score doit porter sur elles.`,
        );
        exige(
          satisfied !== null && total !== null && satisfied === total,
          `fidele-satisfied-egale-total-${period}-${rule}`,
          `FIDELE-SEQUENCES-NON-TOUTES-SATISFAITES pour ${period}/${rule} : satisfied=${rendu(satisfied)}, total=${rendu(total)} — un candidat fidele a F-LONG, reellement execute, doit satisfaire chaque sequence du lot ; sinon le notateur ne compte pas les sequences reellement satisfaites (ou le candidat n'a jamais ete lance).`,
        );
        exige(
          score === 1,
          `fidele-score-egal-a-1-${period}-${rule}`,
          `FIDELE-SCORE-DIFFERENT-DE-1 pour ${period}/${rule} : score=${score}, satisfied=${rendu(satisfied)}, total=${rendu(total)}.`,
        );

        scoresFideles.set(rule, score);
      }

      // Au moins une regle par periode separe le candidat naif du candidat
      // fidele : la regle sous test (II.5), notee pour les deux candidats.
      const rule = REGLE_SOUS_TEST[period] as string;
      const naif = scoresNaifs.get(period);
      const fidele = scoresFideles.get(rule);
      exige(
        naif !== undefined && fidele !== undefined && naif < fidele,
        `naif-strictement-inferieur-au-fidele-${period}-${rule}`,
        `NAIF-NON-INFERIEUR-AU-FIDELE pour ${period}/${rule} : naif=${rendu(naif)}, fidele=${rendu(fidele)} — le lot cache ne separe pas un candidat qui ne traite que la trajectoire principale d'un candidat fidele.`,
      );
    }
  },
  SCORE_TIMEOUT_A3_MS,
);

/* ═══════════════════════════════ T64.A4 ════════════════════════════════ */

test(
  'T64.A4 — le lot de chaque regle active compte au moins 20 sequences, pour toute periode',
  async () => {
    assertPackagesLoaded();

    for (const period of PERIODES) {
      for (const rule of REGLES_ADR[period]) {
        const lot = await requireLot({ rule, period, seed: 13, count: 20 });
        exige(
          lot.length >= 20,
          `lot-de-20-sequences-au-moins-${period}-${rule}`,
          `LOT-TROP-PETIT pour ${period}/${rule} : ${lot.length} sequence(s), ADR-018:L202 en exige au moins 20.`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS * 3,
);
