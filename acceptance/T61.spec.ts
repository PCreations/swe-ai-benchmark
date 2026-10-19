/**
 * acceptance/T61.spec.ts — suite d'acceptation de la tache T61.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T61.A1 behaviour — le modele attendu produit chaque fait de F-LONG enonce
 *                      dans ADR-018, periode par periode, et P1 a P4
 *                      produisent les faits de F-RESERVATION
 *   T61.A2 behaviour — a chaque periode, l'ensemble des regles actives est
 *                      celui d'ADR-018 ; une regle remplacee ou retiree n'est
 *                      plus active
 *   T61.A3 numeric   — sur deux copies de l'etat de P9, l'annulation de F a
 *                      2030-03-30T17:00:00Z rembourse 3000 et a
 *                      2030-03-30T17:00:00.001Z ne rembourse rien
 *   T61.A4 numeric   — le remboursement de P7 arrondit au centime inferieur
 *                      et les montants restent des entiers
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T61 EST UNE TACHE D'EXTENSION : elle ne vient PAS du cahier. Le registre qui
 * la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-018-scenario-long-et-contradictoire.md, lignes 174-180),
 * jamais le cahier directement. L'auteur de cette suite est AVEUGLE aux
 * `source_paths` que verification/tasks.extensions.json declare pour T61 —
 * `packages/scenario`, `packages/oracle` — et ne les a lus ni directement ni
 * par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, jamais une barriere technique). Le contrat teste ci-dessous est
 * derive de docs/specs/T61.md et de sa source, le MEME document ACCEPTE,
 * lignes 174-180, AINSI QUE du corps narratif du MEME document hors de cette
 * plage — le scenario `F-LONG` lui-meme (L77-L159) — la meme liberte que
 * prennent deja acceptance/T48.spec.ts a acceptance/T60.spec.ts face a leur
 * propre ADR.
 *
 * CONTROLE DE LA SOURCE ELLE-MEME (ADR-018 L157-159 : « le test-author de T61
 * [recalcule] independamment [les faits] avant le gel ; tout desaccord ouvre
 * un SPEC_CONFLICT »). Cette suite a recalcule, sans lancer d'implementation :
 *   - P7 : 50 % de 1999 = 999,5, arrondi au centime inferieur = 999 (ADR-018
 *     L110-114, litteral) ; solde de B = -1999 (debit) + 999 (remboursement)
 *     = -1000 (ADR-018 L116, litteral) ; solde de C = -1999 + 0 = -1999.
 *   - P9 : le 31 mars 2030 est un dimanche ; le changement d'heure d'ete en
 *     Europe/Paris a lieu ce jour-la a 01:00 UTC. La veille locale, 30 mars,
 *     est donc ENCORE a l'heure d'hiver (UTC+1) : 18:00 heure locale le 30
 *     mars vaut 17:00:00Z, exactement la valeur qu'ADR-018 L130-131 enonce.
 *     Aucun desaccord : aucun SPEC_CONFLICT n'est ouvert.
 * Ces deux recalculs sont les SEULS endroits ou cette suite derive un
 * litteral par calcul plutot que par lecture directe ; le calcul lui-meme est
 * repris en commentaire a cote de chaque constante qui en depend, ci-dessous.
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions DEJA FIXEES par la
 * suite ACCEPTEE dont elle etend le socle (jamais les sources de T61) :
 *   - acceptance/T07.spec.ts (III) : F-RESERVATION — l'oracle metier
 *     independant — et sa racine gelee acceptance/reference/F-RESERVATION.json,
 *     DEJA IMPLEMENTEE et PROUVEE a HEAD. Cette suite ne re-prouve PAS
 *     F-RESERVATION : elle importe les memes litteraux geles (acteurs,
 *     horloges, creneau, etats attendus P1-P4) et observe SEULEMENT qu'un
 *     modele etendu pour F-LONG les reproduit a l'identique, comme ADR-018
 *     L86-89 l'exige explicitement (« P1 a P4 — F-RESERVATION, inchange »).
 *   - La tolerance de NOMMAGE par alias (createReservationOracle / alias),
 *     REPRISE A L'IDENTIQUE pour le role unique que cette suite resout.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des deux sources
 * suivantes, et d'aucune autre :
 *   (a) un import de `acceptance/reference/F-RESERVATION.json` — racine gelee,
 *       docs/FROZEN_ROOTS.json — pour TOUT ce qui concerne P1 a P4 ;
 *   (b) un commentaire `// ADR-018:L<n>` resoluble par
 *       `sed -n '<n>p' docs/adr/ADR-018-scenario-long-et-contradictoire.md`,
 *       pour P5 a P12.
 * AUCUNE valeur attendue n'a ete obtenue en lancant une implementation de T61
 * et en figeant ce qu'on a vu passer : packages/oracle et packages/scenario
 * n'ont pas ete lus, et aucun module de T61 n'existe encore au moment ou
 * cette suite est ecrite (ADR-001).
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET D'APPEL — FIXE ICI, faute d'enonce dans ADR-018 sur la
 * forme exacte du modele attendu (meme geste que T07 fixant
 * `createReservationOracle`/`applyOperation`/`projectBusinessState`, T60
 * fixant `pilot-conduct`). AUCUNE DES VALEURS CI-DESSOUS N'A ETE OBTENUE EN
 * EXECUTANT UNE IMPLEMENTATION DE T61.
 *
 * Le paquet est charge par son SPECIFICATEUR, que jest.config.mjs mappe vers
 * `packages/oracle/src` — jamais vers un `dist/` perime.
 *
 *   replayFLong()  -> le replay ENTIER et DETERMINISTE du scenario F-LONG,
 *                     SANS ARGUMENT (ADR-018 fixe un scenario PARTICULIER,
 *                     pas un moteur generique : l'horloge, les acteurs, le
 *                     locataire et chaque operation sont internes au module).
 *                     Alias tolerés : runFLong, replayLongScenario,
 *                     playFLong, executeFLong, buildFLong, runLongScenario,
 *                     createLongScenarioOracle.
 *
 * FORME DU RESULTAT — FIXE ICI. `replayFLong()` rend (eventuellement via une
 * promesse) soit un TABLEAU de 12 enregistrements, soit un OBJET indexe par
 * nom de periode (directement, ou sous `periods`/`periodes`). Chaque
 * enregistrement porte :
 *   - une periode identifiee par `period` (alias : `periode`, `id`, `name`) —
 *     une des chaines `P1`..`P12` ;
 *   - `active_rules` (alias : `activeRules`, `regles_actives`, `rules`) — le
 *     TABLEAU des identifiants de regle actifs PENDANT cette periode (ex.
 *     `cancel@2`), au sens d'ADR-018 L61-65 et L86-155 : une regle remplacee
 *     ou retiree disparait de ce tableau a partir de la periode qui la
 *     remplace ou la retire ;
 *   - `facts` (alias : `faits`) — un objet qui porte, sous les noms de champ
 *     que cette suite fixe periode par periode (section IV), la valeur
 *     attendue de chaque controle que cette periode introduit ou confirme.
 * Cette suite tolere les DEUX formes de conteneur et les QUATRE alias de
 * chaque champ ; elle echoue par une assertion explicite si AUCUNE des formes
 * ne produit un enregistrement exploitable pour la periode demandee — jamais
 * par un acces a une propriete `undefined`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES CHAMPS DE `facts` PAR PERIODE — FIXES ICI, periode par periode, et
 * leur provenance.
 *
 *   P1 (= F-RESERVATION P1, reference geleee) :
 *     s1_owner, s1_status, duplicate_idempotent_no_dup, b_rejected_no_overbooking
 *   P2 (= F-RESERVATION P2) : s1_owner, s1_status, waiting_order
 *   P3 (= F-RESERVATION P3, deux clones jetables) :
 *     clone_at_boundary_allowed, clone_at_boundary_new_owner,
 *     clone_after_boundary_allowed
 *   P4 (= F-RESERVATION P4) :
 *     base_a_status, base_b_status, base_c_status, other_tenant_read_legacy_s1
 *   P5 (ADR-018 L91-98) : s2_capacity_final, s2_owner, s2_waiting_order
 *   P6 (ADR-018 L100-105) : s2_owner, s2_waiting_order, s2_a_status
 *   P7 (ADR-018 L107-116) :
 *     b_refund, c_refund, c_cancel_allowed, balance_B, balance_C
 *   P8 (ADR-018 L118-123) :
 *     d_s4_status, d_s5_status, d_s6_result, d_s6_waiting, d_s6_debited
 *   P9 (ADR-018 L125-133) : refund_at_deadline, refund_after_deadline
 *   P10 (ADR-018 L135-140) : e_s2_history_first_event, e_s2_history_first_status
 *   P11 (ADR-018 L142-147) : s8_owner, s8_waiting_order, d_s6_status
 *   P12 (ADR-018 L149-155) :
 *     b_s1_from_other, b_s1_from_legacy, b_s1_from_third
 *
 * ──────────────────────────────────────────────────────────────────────── V
 * LES ENSEMBLES DE REGLES ACTIVES PAR PERIODE — RECALCULES ICI depuis
 * ADR-018 L61-65 (regle 4, F-REGRESSION), L86 (bloc P1-P4) et L91-155 (P5-P12),
 * jamais obtenus en executant une implementation.
 *
 * P1-P2 : `cancel@1` est actif (pas encore de regle d'annulation a 24h,
 * conformement a la fixture F-REGRESSION du cahier : « cancel@1 satisfaite en
 * P2 »). P3 : `cancel@2` LE REMPLACE (« puis remplacee en P3 par cancel@2 »,
 * meme fixture) — c'est la regle des 24h, frontiere incluse, qu'ADR-018 L86-87
 * nomme. P4 : `isolation@1` s'ajoute (creation du locataire `other`,
 * cahier L119 : « P4 : [...] creation d'un locataire other »).
 *
 * ────────────────────────────────────────────────────────────────────── VI
 * LES DEUX DANGERS PROPRES A T61.
 *
 * (1) UN REPLAY QUI NE PRODUIT RIEN POUR P5-P12 PASSERAIT SUR UN PROGRAMME
 *     MORT SI CETTE SUITE NE VERIFIAIT QUE P1-P4. A1 et A2 exigent donc, pour
 *     CHACUNE des douze periodes, un enregistrement EXPLOITABLE (periode
 *     resolue, `active_rules` non vide, `facts` qui porte CHAQUE champ fixe
 *     en section IV) avant de comparer la moindre valeur : un replay qui
 *     s'arrete a P4 echoue des la premiere periode manquante, par un message
 *     qui la nomme.
 * (2) UN MODELE QUI IGNORE LE REMPLACEMENT ET LAISSE S'ACCUMULER LES REGLES.
 *     A2 ne se contente pas de verifier la PRESENCE des regles attendues a
 *     chaque periode : il verifie aussi l'ABSENCE explicite de chaque regle
 *     remplacee ou retiree, periode par periode (`fifo@1` absent a partir de
 *     P6, `cancel@1`/`cancel@2`/`cancel@3` absents a partir de leur
 *     remplacement, `priority@1` et `quota@1` absents a partir de P11). Un
 *     modele qui se contente d'AJOUTER des regles sans jamais en retirer
 *     passerait les controles de presence et echouerait sur ces controles
 *     d'absence — exactement la perturbation que
 *     verification/cases.extensions.lock.json prescrit pour T61.A2
 *     (« laisser priority@1 active en P11 »).
 *
 * ─────────────────────────────────────────────────────────────────────── VII
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • Les metriques du cahier (Q, R, G, G_new), la chronologie par regle, les
 *    mesures de code et les repetitions (ADR-018, decisions 4-6) sont l'objet
 *    de T65 et T66 ; cette suite ne les observe pas.
 *  • Le contrat `bench.candidate/3` et l'enonce candidat de chaque periode
 *    sont l'objet de T62 ; le modele attendu teste ici est un module
 *    INTERNE, jamais le contrat que le candidat recoit.
 *  • L'etat qui dure a travers un redemarrage de processus (`BENCH_DATA_DIR`)
 *    est l'objet de T63 ; `replayFLong()` est pur et deterministe, sans
 *    aucune E/S — ADR-018 ne l'exige de T61 qu'« aucun service externe
 *    requis ; aucun appel reel » (docs/specs/T61.md).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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
const PACKAGES = ['oracle'] as const;
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 12) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (v instanceof Map) {
    return `Map{${[...v.entries()]
      .map(([k, x]) => `${rendu(k, profondeur + 1, vus)}:${rendu(x, profondeur + 1, vus)}`)
      .join(',')}}`;
  }
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 600): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/* ────────────────────── fixture de reference (racine gelee, F-RESERVATION) */

function readReference(name: string): Json {
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${name}.json`), 'utf8')) as Json;
}

function refValue(doc: Json, dotted: string): unknown {
  let cur: unknown = doc;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      throw new Error(`REFERENCE-CHEMIN-ABSENT ${dotted} (bloque a ${seg})`);
    }
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) throw new Error(`REFERENCE-VALEUR-ABSENTE ${dotted}`);
  return cur;
}

const RESERVATION = readReference('F-RESERVATION');
const S = (chemin: string): string => String(refValue(RESERVATION, chemin));

const ACTEURS = (refValue(RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
const [ACTEUR_A, ACTEUR_B, ACTEUR_C] = ACTEURS as [string, string, string];
const P2_C = S('valeurs.P2.etat_attendu.C.valeur'); // libelle de statut d'attente, racine gelee
const P4_ENTREE_A = S('valeurs.P4.etat_persistant_a_l_entree.A.valeur');
const P4_ENTREE_B = S('valeurs.P4.etat_persistant_a_l_entree.B.valeur');
const P4_ENTREE_C = S('valeurs.P4.etat_persistant_a_l_entree.C.valeur');
const CODE_NOT_FOUND = 'NOT_FOUND'; // cahier:L123, repris par T07

/** Statuts normalises, meme vocabulaire que T07, pour comparer les libelles de la reference a ceux que facts porte. */
type Statut = 'confirme' | 'attente' | 'annule';
function normaliser(brut: string): Statut | string {
  const t = brut.toLowerCase();
  if (/annul|cancel/.test(t)) return 'annule';
  if (/confirm|booked|reserved|held/.test(t)) return 'confirme';
  if (/attente|wait|queue|pending/.test(t)) return 'attente';
  return `STATUT-ILLISIBLE(${brut})`;
}

/* ── les acteurs nommes litteralement par ADR-018 (D a H), jamais inventes */

// ADR-018:L79 — "Acteurs A à H"
const ACTEUR_D = 'D';
const ACTEUR_E = 'E';
const ACTEUR_F = 'F';
const ACTEUR_G = 'G';
const ACTEUR_H = 'H';

/* ─────────────────────────────────────────── chargement du paquet teste */

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
        attempts.push(`import(${s}) -> ${(e as Error).message.split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet ${pkg} : aucun specificateur n'a repondu`);
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
  // Le chargement ne LEVE pas : un import casse produirait « Test suite
  // failed to run », que verification/runner/red.mjs classe
  // SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc
  // lui-meme le chargement, ce qui rend le rouge ASSERTION_FAILED.
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

/* ───────────────────────────────────────────── resolution du role unique */

const ROLES: Record<string, readonly string[]> = {
  replayFLong: [
    'replayFLong',
    'runFLong',
    'replayLongScenario',
    'playFLong',
    'executeFLong',
    'buildFLong',
    'runLongScenario',
    'createLongScenarioOracle',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role] ?? [];
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
          manquants.map((r) => `${r}:[${(ROLES[r] ?? []).join('|')}]`).join(' ; ') +
          ` (${String(LOADED.exportCount)} exports de premier niveau observes dans ` +
          `${LOADED.via.join(', ') || 'aucun paquet'})`,
  ).toBe('contrat-resolu');
}

/* ───────────────────────── lecture tolerante du resultat de replayFLong() */

let REPLAY_CACHE: unknown[] | undefined;
let REPLAY_ERROR: string | undefined;

async function obtenirReplay(): Promise<unknown[]> {
  if (REPLAY_CACHE !== undefined) return REPLAY_CACHE;
  const f = resolveOpt('replayFLong');
  if (f === null) {
    REPLAY_ERROR = 'ROLE-NON-RESOLU replayFLong';
    REPLAY_CACHE = [];
    return REPLAY_CACHE;
  }
  let brut: unknown;
  try {
    brut = await Promise.resolve(f());
  } catch (e) {
    REPLAY_ERROR = `LEVE ${rendu(e)}`;
    REPLAY_CACHE = [];
    return REPLAY_CACHE;
  }
  REPLAY_CACHE = [brut];
  return REPLAY_CACHE;
}

interface PeriodeLue {
  trouvee: boolean;
  activeRules: string[];
  facts: Json;
  diagnostic: string;
}

function conteneurDePeriodes(brut: unknown): Json {
  if (Array.isArray(brut)) {
    const out: Json = {};
    for (const el of brut) {
      if (el !== null && typeof el === 'object') {
        const o = el as Json;
        const p = o.period ?? o.periode ?? o.id ?? o.name;
        if (typeof p === 'string') out[p] = el;
      }
    }
    return out;
  }
  if (brut !== null && typeof brut === 'object') {
    const o = brut as Json;
    for (const k of ['periods', 'periodes']) {
      const sous = o[k];
      if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) {
        return sous as Json;
      }
    }
    return o;
  }
  return {};
}

async function lirePeriode(periode: string): Promise<PeriodeLue> {
  const enveloppe = await obtenirReplay();
  if (REPLAY_ERROR !== undefined) {
    return { trouvee: false, activeRules: [], facts: {}, diagnostic: REPLAY_ERROR };
  }
  const racine = enveloppe[0];
  const parPeriode = conteneurDePeriodes(racine);
  const rec = parPeriode[periode];
  if (rec === null || rec === undefined || typeof rec !== 'object') {
    return {
      trouvee: false,
      activeRules: [],
      facts: {},
      diagnostic: `PERIODE-ABSENTE ${periode} (resultat : ${court(rendu(racine), 500)})`,
    };
  }
  const o = rec as Json;
  const rulesBrut = o.active_rules ?? o.activeRules ?? o.regles_actives ?? o.rules;
  const activeRules = Array.isArray(rulesBrut) ? rulesBrut.map(String) : [];
  const factsBrut = o.facts ?? o.faits;
  const facts: Json =
    factsBrut !== null && typeof factsBrut === 'object' ? (factsBrut as Json) : {};
  return { trouvee: true, activeRules, facts, diagnostic: 'ok' };
}

/** Premieres assertions de chaque cas : chargement, contrat, et periode exploitable. */
function assertPeriodeExploitable(p: PeriodeLue, periode: string): void {
  expect(p.trouvee ? 'periode-exploitable' : `${p.diagnostic} (periode ${periode})`).toBe(
    'periode-exploitable',
  );
  expect(
    p.activeRules.length > 0
      ? 'regles-non-vides'
      : `AUCUNE-REGLE-ACTIVE periode=${periode}`,
  ).toBe('regles-non-vides');
}

function champ(facts: Json, periode: string, cle: string): unknown {
  if (!(cle in facts)) {
    throw new Error(`CHAMP-ABSENT facts.${cle} periode=${periode} (${court(rendu(facts), 400)})`);
  }
  return facts[cle];
}

/** Egalite nommee, message explicite en cas d'echec — jamais un `toBe` nu. */
function egal(obtenu: unknown, attendu: unknown, quoi: string): void {
  const o = rendu(obtenu);
  const a = rendu(attendu);
  expect(o === a ? 'egal' : `DIVERGENT ${quoi} : obtenu=${o} attendu=${a}`).toBe('egal');
}

function ensembleEgal(obtenu: string[], attendu: string[], periode: string): void {
  const o = [...new Set(obtenu)].sort().join(',');
  const a = [...new Set(attendu)].sort().join(',');
  expect(o === a ? 'ensemble-egal' : `REGLES-DIVERGENTES periode=${periode} obtenu=[${o}] attendu=[${a}]`).toBe(
    'ensemble-egal',
  );
}

function contient(ensemble: string[], valeur: string, quoi: string): void {
  expect(ensemble.includes(valeur) ? 'present' : `ABSENT ${quoi} (ensemble=[${ensemble.join(',')}])`).toBe(
    'present',
  );
}

function neContientPas(ensemble: string[], valeur: string, quoi: string): void {
  expect(
    ensemble.includes(valeur) ? `PRESENT-A-TORT ${quoi} (ensemble=[${ensemble.join(',')}])` : 'absent',
  ).toBe('absent');
}

/* ───────────────────────────── les douze ensembles de regles (section V) */

// ADR-018:L61-65 (regle 4, fixture F-REGRESSION du cahier) et L86-155.
const REGLES: Record<string, string[]> = {
  P1: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P2: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P3: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2'], // ADR-018:L86-87
  P4: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1'], // ADR-018:L86-89
  P5: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1', 'capacity@1'], // ADR-018:L91
  P6: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@2', 'isolation@1', 'capacity@1'], // ADR-018:L100
  P7: [
    'reserve@1',
    'idempotence@1',
    'priority@1',
    'cancel@3',
    'isolation@1',
    'capacity@1',
    'price@1',
  ], // ADR-018:L107
  P8: [
    'reserve@1',
    'idempotence@1',
    'priority@1',
    'cancel@3',
    'isolation@1',
    'capacity@1',
    'price@1',
    'quota@1',
  ], // ADR-018:L118
  P9: [
    'reserve@1',
    'idempotence@1',
    'priority@1',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'quota@1',
  ], // ADR-018:L125
  P10: [
    'reserve@1',
    'idempotence@1',
    'priority@1',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'quota@1',
    'history@1',
  ], // ADR-018:L135
  P11: [
    'reserve@1',
    'idempotence@1',
    'fifo@2',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'history@1',
  ], // ADR-018:L142 — priority@1 et quota@1 retires
  P12: [
    'reserve@1',
    'idempotence@1',
    'fifo@2',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'history@1',
    'transfer@1',
  ], // ADR-018:L149
};

const TOUTES_PERIODES = Object.keys(REGLES);

/* ──────────────────────────────────────────────────────────────── T61.A1 */

describe('T61 — le scenario F-LONG et son modele attendu (ADR-018)', () => {
  test(
    'T61.A1 le modele attendu produit chaque fait de F-LONG enonce dans ADR-018, periode par periode, et P1 a P4 produisent les faits de F-RESERVATION',
    async () => {
      assertLoaded();
      assertContrat('replayFLong');

      // Chaque periode doit etre exploitable AVANT toute comparaison de valeur
      // (danger VI.1 : un replay mort ne doit pas passer silencieusement).
      const lues: Record<string, PeriodeLue> = {};
      for (const p of TOUTES_PERIODES) {
        const lue = await lirePeriode(p);
        assertPeriodeExploitable(lue, p);
        lues[p] = lue;
      }

      /* P1 — F-RESERVATION P1, racine gelee */
      {
        const f = lues.P1!.facts;
        egal(champ(f, 'P1', 's1_owner'), ACTEUR_A, 'P1.s1_owner');
        egal(normaliser(String(champ(f, 'P1', 's1_status'))), 'confirme', 'P1.s1_status');
        egal(champ(f, 'P1', 'duplicate_idempotent_no_dup'), true, 'P1.duplicate_idempotent_no_dup');
        egal(champ(f, 'P1', 'b_rejected_no_overbooking'), true, 'P1.b_rejected_no_overbooking');
      }

      /* P2 — F-RESERVATION P2 : B confirme, C premier en attente */
      {
        const f = lues.P2!.facts;
        egal(champ(f, 'P2', 's1_owner'), ACTEUR_B, 'P2.s1_owner');
        egal(normaliser(String(champ(f, 'P2', 's1_status'))), 'confirme', 'P2.s1_status');
        const ordre = champ(f, 'P2', 'waiting_order');
        expect(Array.isArray(ordre) ? 'tableau' : `PAS-UN-TABLEAU ${rendu(ordre)}`).toBe('tableau');
        egal((ordre as unknown[])[0], ACTEUR_C, 'P2.waiting_order[0]');
        egal(normaliser(P2_C), 'attente', 'reference.P2.C'); // controle de la reference elle-meme
      }

      /* P3 — F-RESERVATION P3 : deux clones jetables, frontiere des 24h */
      {
        const f = lues.P3!.facts;
        egal(champ(f, 'P3', 'clone_at_boundary_allowed'), true, 'P3.clone_at_boundary_allowed');
        egal(champ(f, 'P3', 'clone_at_boundary_new_owner'), ACTEUR_C, 'P3.clone_at_boundary_new_owner');
        egal(
          champ(f, 'P3', 'clone_after_boundary_allowed'),
          false,
          'P3.clone_after_boundary_allowed',
        );
      }

      /* P4 — F-RESERVATION P4 : etat persistant a l'entree, isolation */
      {
        const f = lues.P4!.facts;
        egal(normaliser(String(champ(f, 'P4', 'base_a_status'))), normaliser(P4_ENTREE_A), 'P4.base_a_status');
        egal(normaliser(String(champ(f, 'P4', 'base_b_status'))), normaliser(P4_ENTREE_B), 'P4.base_b_status');
        egal(normaliser(String(champ(f, 'P4', 'base_c_status'))), normaliser(P4_ENTREE_C), 'P4.base_c_status');
        egal(
          champ(f, 'P4', 'other_tenant_read_legacy_s1'),
          CODE_NOT_FOUND,
          'P4.other_tenant_read_legacy_s1',
        );
      }

      /* P5 — capacite modifiable (ADR-018:L91-98) */
      {
        const f = lues.P5!.facts;
        egal(champ(f, 'P5', 's2_capacity_final'), 1, 'P5.s2_capacity_final'); // ADR-018:L97-98
        egal(champ(f, 'P5', 's2_owner'), ACTEUR_A, 'P5.s2_owner'); // ADR-018:L97
        const ordre = champ(f, 'P5', 's2_waiting_order') as unknown[];
        egal(ordre.length, 2, 'P5.s2_waiting_order.length');
        egal(ordre[0], ACTEUR_D, 'P5.s2_waiting_order[0]'); // ADR-018:L97-98
        egal(ordre[1], ACTEUR_E, 'P5.s2_waiting_order[1]'); // ADR-018:L98
      }

      /* P6 — priorites (ADR-018:L100-105) */
      {
        const f = lues.P6!.facts;
        egal(champ(f, 'P6', 's2_owner'), ACTEUR_E, 'P6.s2_owner'); // ADR-018:L104
        const ordre = champ(f, 'P6', 's2_waiting_order') as unknown[];
        egal(ordre.length, 1, 'P6.s2_waiting_order.length');
        egal(ordre[0], ACTEUR_D, 'P6.s2_waiting_order[0]'); // ADR-018:L104-105
        egal(normaliser(String(champ(f, 'P6', 's2_a_status'))), 'annule', 'P6.s2_a_status'); // ADR-018:L105
      }

      /* P7 — argent (ADR-018:L107-116) */
      {
        const f = lues.P7!.facts;
        egal(champ(f, 'P7', 'b_refund'), 999, 'P7.b_refund'); // ADR-018:L113-114 (999 litteral)
        egal(champ(f, 'P7', 'c_refund'), 0, 'P7.c_refund'); // ADR-018:L114-116
        egal(champ(f, 'P7', 'c_cancel_allowed'), true, 'P7.c_cancel_allowed'); // ADR-018:L114-115 (« refuse sous cancel@2 »)
        egal(champ(f, 'P7', 'balance_B'), -1000, 'P7.balance_B'); // ADR-018:L116
        egal(champ(f, 'P7', 'balance_C'), -1999, 'P7.balance_C'); // ADR-018:L116
      }

      /* P8 — quotas (ADR-018:L118-123) */
      {
        const f = lues.P8!.facts;
        egal(normaliser(String(champ(f, 'P8', 'd_s4_status'))), 'confirme', 'P8.d_s4_status'); // ADR-018:L122
        egal(normaliser(String(champ(f, 'P8', 'd_s5_status'))), 'confirme', 'P8.d_s5_status'); // ADR-018:L122
        egal(champ(f, 'P8', 'd_s6_result'), 'QUOTA_EXCEEDED', 'P8.d_s6_result'); // ADR-018:L123, litteral
        egal(champ(f, 'P8', 'd_s6_waiting'), false, 'P8.d_s6_waiting'); // ADR-018:L120, « sans attente ni debit »
        egal(champ(f, 'P8', 'd_s6_debited'), false, 'P8.d_s6_debited'); // ADR-018:L120
      }

      /* P9 — fuseau horaire (ADR-018:L125-133) */
      {
        const f = lues.P9!.facts;
        egal(champ(f, 'P9', 'refund_at_deadline'), 3000, 'P9.refund_at_deadline'); // ADR-018:L130-131
        egal(champ(f, 'P9', 'refund_after_deadline'), 0, 'P9.refund_after_deadline'); // ADR-018:L131-132
      }

      /* P10 — historique (ADR-018:L135-140) */
      {
        const f = lues.P10!.facts;
        egal(champ(f, 'P10', 'e_s2_history_first_event'), 'migrated', 'P10.e_s2_history_first_event'); // ADR-018:L137-139, litteral
        egal(
          normaliser(String(champ(f, 'P10', 'e_s2_history_first_status'))),
          'confirme',
          'P10.e_s2_history_first_status',
        ); // ADR-018:L139-140
      }

      /* P11 — retraits (ADR-018:L142-147) */
      {
        const f = lues.P11!.facts;
        egal(champ(f, 'P11', 's8_owner'), ACTEUR_F, 'P11.s8_owner'); // ADR-018:L144
        const ordre = champ(f, 'P11', 's8_waiting_order') as unknown[];
        egal(ordre.length, 2, 'P11.s8_waiting_order.length');
        egal(ordre[0], ACTEUR_G, 'P11.s8_waiting_order[0]'); // ADR-018:L145-146
        egal(ordre[1], ACTEUR_H, 'P11.s8_waiting_order[1]'); // ADR-018:L146
        egal(normaliser(String(champ(f, 'P11', 'd_s6_status'))), 'confirme', 'P11.d_s6_status'); // ADR-018:L146-147
      }

      /* P12 — transfert (ADR-018:L149-155) */
      {
        const f = lues.P12!.facts;
        egal(
          normaliser(String(champ(f, 'P12', 'b_s1_from_other'))),
          'confirme',
          'P12.b_s1_from_other',
        ); // ADR-018:L154
        egal(champ(f, 'P12', 'b_s1_from_legacy'), null, 'P12.b_s1_from_legacy'); // ADR-018:L154-155 (« valeur nulle »)
        egal(champ(f, 'P12', 'b_s1_from_third'), CODE_NOT_FOUND, 'P12.b_s1_from_third'); // ADR-018:L155, litteral
      }
    },
    CASE_TIMEOUT_MS,
  );

  /* ──────────────────────────────────────────────────────────────── T61.A2 */

  test(
    "T61.A2 a chaque periode l'ensemble des regles actives est celui d'ADR-018, une regle remplacee ou retiree n'etant plus active",
    async () => {
      assertLoaded();
      assertContrat('replayFLong');

      for (const p of TOUTES_PERIODES) {
        const lue = await lirePeriode(p);
        assertPeriodeExploitable(lue, p);
        ensembleEgal(lue.activeRules, REGLES[p]!, p);
      }

      // Controles d'absence NOMMES — chaque regle remplacee ou retiree est
      // verifiee absente a partir de la periode qui la remplace/retire
      // (danger VI.2). On relit les periodes deja chargees ci-dessus.
      const p1 = await lirePeriode('P1');
      const p3 = await lirePeriode('P3');
      const p6 = await lirePeriode('P6');
      const p7 = await lirePeriode('P7');
      const p9 = await lirePeriode('P9');
      const p11 = await lirePeriode('P11');

      contient(p1.activeRules, 'cancel@1', 'P1 porte cancel@1'); // ADR-018:L86 / cahier F-REGRESSION
      neContientPas(p3.activeRules, 'cancel@1', 'cancel@1 remplace en P3'); // ADR-018:L86-87
      contient(p3.activeRules, 'cancel@2', 'P3 porte cancel@2');

      contient(p6.activeRules, 'priority@1', 'P6 porte priority@1'); // ADR-018:L100
      neContientPas(p6.activeRules, 'fifo@1', 'fifo@1 remplace par priority@1 en P6'); // ADR-018:L100

      neContientPas(p7.activeRules, 'cancel@2', 'cancel@2 remplace par cancel@3 en P7'); // ADR-018:L107
      contient(p7.activeRules, 'cancel@3', 'P7 porte cancel@3');

      neContientPas(p9.activeRules, 'cancel@3', 'cancel@3 remplace par cancel@4 en P9'); // ADR-018:L125
      contient(p9.activeRules, 'cancel@4', 'P9 porte cancel@4');

      // La perturbation que verification/cases.extensions.lock.json prescrit
      // pour T61.A2 : « laisser priority@1 active en P11 ».
      neContientPas(p11.activeRules, 'priority@1', 'priority@1 retire, remplace par fifo@2 en P11'); // ADR-018:L142
      neContientPas(p11.activeRules, 'quota@1', 'quota@1 retire en P11'); // ADR-018:L142-143
      contient(p11.activeRules, 'fifo@2', 'P11 porte fifo@2');
    },
    CASE_TIMEOUT_MS,
  );

  /* ──────────────────────────────────────────────────────────────── T61.A3 */

  test(
    "T61.A3 sur deux copies de l'etat de P9, l'annulation de F a 2030-03-30T17:00:00Z rembourse 3000 et a 2030-03-30T17:00:00.001Z ne rembourse rien",
    async () => {
      assertLoaded();
      assertContrat('replayFLong');

      const p9 = await lirePeriode('P9');
      assertPeriodeExploitable(p9, 'P9');

      // ADR-018:L128-131 — prix du creneau S7 = 3000, et le remboursement est
      // « integral [...] ou nul » ; les deux copies PARTAGENT cette meme
      // frontiere horaire (ADR-018:L130-131).
      const remboursePile = champ(p9.facts, 'P9', 'refund_at_deadline');
      const rembourseApres = champ(p9.facts, 'P9', 'refund_after_deadline');

      egal(remboursePile, 3000, 'P9.refund_at_deadline (copie 1, 2030-03-30T17:00:00Z)');
      egal(rembourseApres, 0, 'P9.refund_after_deadline (copie 2, 2030-03-30T17:00:00.001Z)');

      // Temoin anti-tautologie : les deux copies partent du MEME etat (meme
      // creneau S7, meme prix 3000) et NE DIFFERENT que par l'instant
      // d'annulation d'1 milliseconde. Si les deux valeurs etaient egales,
      // le modele ignorerait la frontiere — la perturbation qu'un remplacement
      // de la regle de fuseau horaire (ADR-018:L132-133, heure d'ete du
      // lendemain, UTC+2) produit precisement.
      expect(
        remboursePile === rembourseApres
          ? `FRONTIERE-IGNOREE copie1=${rendu(remboursePile)} copie2=${rendu(rembourseApres)}`
          : 'frontiere-observee',
      ).toBe('frontiere-observee');

      // Controle de la source elle-meme (section I) : le 31 mars 2030 est un
      // dimanche, jour du changement d'heure d'ete en Europe ; la veille
      // locale (30 mars) est donc encore a l'heure d'hiver UTC+1, et 18:00
      // heure locale vaut bien 17:00:00Z — jamais 16:00Z (UTC+2), que la
      // mutation prescrite par verification/cases.extensions.lock.json impose.
      const dimancheChangementHeureEte2030 = new Date('2030-03-31T01:00:00Z');
      egal(dimancheChangementHeureEte2030.getUTCDay(), 0, 'controle-source.31-mars-2030-est-un-dimanche');
    },
    CASE_TIMEOUT_MS,
  );

  /* ──────────────────────────────────────────────────────────────── T61.A4 */

  test(
    'T61.A4 le remboursement de P7 arrondit au centime inferieur et les montants restent des entiers',
    async () => {
      assertLoaded();
      assertContrat('replayFLong');

      const p7 = await lirePeriode('P7');
      assertPeriodeExploitable(p7, 'P7');

      const bRefund = champ(p7.facts, 'P7', 'b_refund');
      const cRefund = champ(p7.facts, 'P7', 'c_refund');
      const balanceB = champ(p7.facts, 'P7', 'balance_B');
      const balanceC = champ(p7.facts, 'P7', 'balance_C');

      // ADR-018:L110-111 — « 50 % arrondi au centime inferieur entre 24 et
      // 48 heures ». B annule a 36 heures du debut de S3 (prix 1999,
      // ADR-018:L112-114) : 50 % de 1999 = 999,5 -> 999, jamais 1000 (la
      // perturbation que verification/cases.extensions.lock.json prescrit
      // pour T61.A4 : « arrondir au centime superieur »).
      egal(bRefund, 999, 'P7.b_refund (50% de 1999 arrondi au centime inferieur)');
      expect(bRefund === 1000 ? 'ARRONDI-AU-CENTIME-SUPERIEUR' : 'arrondi-au-centime-inferieur').toBe(
        'arrondi-au-centime-inferieur',
      );

      egal(cRefund, 0, 'P7.c_refund (annulation a moins de 24h)');

      // Les montants restent des ENTIERS (ADR-018:L80, « les montants sont
      // des centimes entiers ») : un flottant du type 999.5 non arrondi
      // trahirait une implementation qui n'applique pas le centime inferieur.
      for (const [label, valeur] of [
        ['b_refund', bRefund],
        ['c_refund', cRefund],
        ['balance_B', balanceB],
        ['balance_C', balanceC],
      ] as const) {
        expect(typeof valeur === 'number' ? 'nombre' : `PAS-UN-NOMBRE ${label}=${rendu(valeur)}`).toBe(
          'nombre',
        );
        expect(
          Number.isInteger(valeur as number)
            ? 'entier'
            : `NON-ENTIER ${label}=${rendu(valeur)}`,
        ).toBe('entier');
      }

      // Coherence comptable independante : solde = -prix (debit a la
      // confirmation, ADR-018:L108-109) + remboursement.
      egal(balanceB, -1999 + 999, 'P7.balance_B (coherence debit+remboursement)');
      egal(balanceC, -1999 + 0, 'P7.balance_C (coherence debit+remboursement)');
    },
    CASE_TIMEOUT_MS,
  );
});
