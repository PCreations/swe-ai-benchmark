/**
 * acceptance/T07.spec.ts — suite d'acceptation de la tache T07.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T07.A1 behaviour — F-RESERVATION P1 n'a QU'UNE reservation confirmee et
 *                      AUCUN doublon idempotent
 *   T07.A2 behaviour — P2 promeut B avant C
 *   T07.A3 behaviour — annulation permise EXACTEMENT a 24 h (frontiere incluse)
 *   T07.A4 refusal   — refus metier 1 ms apres la frontiere
 *   T07.A5 absence   — un acteur du locataire `other` ne voit AUCUNE donnee
 *                      `legacy` (NOT_FOUND sans donnee metier divulguee)
 *   T07.A6 refusal   — repetition d'une operation avec MEME cle et arguments
 *                      DIFFERENTS : conflit explicite
 *   T07.A7 absence   — une annulation repetee ne promeut PAS deux personnes
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE a `packages/oracle` — le `source_paths`
 * que verification/tasks.json declare pour T07. ADR-001 : cet aveuglement est
 * PROCEDURAL, donc une discipline auditable au diff, pas une barriere
 * technique. Le contrat teste ci-dessous n'a pas ete releve dans
 * l'implementation ; il est derive de docs/specs/T07.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle :
 *
 *   L213  livrables : « machine a etats de reservation, projection metier
 *         canonique et catalogue de resultats attendus, sans SQL ni HTTP »
 *   L215  les sept cas d'acceptation, mot pour mot
 *   L217  fin : « toutes les transitions sont deterministes. L'oracle ne
 *         reutilise ni les handlers, ni les requetes SQL, ni les validateurs
 *         metier des applications temoins. »
 *   L119  F-RESERVATION : horloge initiale, acteurs A/B/C, locataire `legacy`,
 *         creneau S1 de capacite 1 debutant 2030-01-03T12:00:00Z, et les quatre
 *         periodes P1..P4
 *   L123  les probes de frontiere P3 sont des clones JETABLES ; l'etat
 *         persistant a l'entree de P4 ; « FIFO est ordonne par SEQUENCE
 *         D'ADMISSION EXPLICITE, pas par egalite possible de timestamps » ; le
 *         contrat intertenant renvoie `NOT_FOUND` sans donnee metier divulguee
 *   L125  horloges des quatre periodes
 *   L68   invariant D-6 : « les effets valides sont dedupliques par CLE
 *         D'OPERATION et empreinte d'entree » — l'idempotence de A1 et A6
 *   L80   « les JSON de domaine sont stricts : proprietes inconnues rejetees,
 *         enums explicites, timestamps UTC ISO 8601 »
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des deux sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/F-RESERVATION.json` — racine gelee,
 *       docs/FROZEN_ROOTS.json. C'est le cas de TOUS les instants metier (les
 *       quatre horloges de periode, le debut du creneau, la frontiere des 24 h
 *       et la frontiere + 1 ms), de la capacite du creneau, des acteurs, du
 *       locataire, de l'ordre d'attente attendu, des comptes attendus
 *       (`confirmees` = 1, `doublons` = 0) et de tous les statuts attendus.
 *   (b) un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p'
 *       docs/cahier.md`.
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * les cles d'idempotence et les numeros de sequence d'admission, que
 * F-RESERVATION declare explicitement NON FIXES par le cahier
 * (`non_fixe_par_le_cahier`) : elles sont des ENTREES de la suite, jamais des
 * valeurs attendues.
 *
 * CONTROLE DE LA REFERENCE ELLE-MEME. A3 ne se contente pas de relire la
 * frontiere : il exige que `debut - frontiere` vaille exactement
 * `delai_heures` heures. Si la racine gelee se contredisait, c'est elle qui
 * tomberait, et le message le dit.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET D'APPEL. Le paquet est charge par son SPECIFICATEUR,
 * que jest.config.mjs mappe vers `packages/oracle/src` — jamais vers un
 * `dist/` perime, gitignore et invisible a `git status --porcelain`.
 *
 * Pour chaque ROLE, la suite nomme un export PRIMAIRE puis une courte liste
 * d'alias documentes. Les alias sont une tolerance de NOMMAGE, pas de
 * COMPORTEMENT. Si aucun nom ne repond, la suite echoue par une assertion
 * explicite qui nomme le role et la liste attendue — jamais par un import
 * casse, que verification/runner/red.mjs classe MODULE_NOT_FOUND et refuse
 * comme preuve.
 *
 *   createReservationOracle(setup)      -> etat initial de l'oracle      (L213)
 *   applyOperation(etat, operation)     -> etat suivant, ou REFUS metier (L213)
 *   projectBusinessState(etat, vue)     -> projection metier canonique   (L213)
 *
 * TROIS CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC
 * FIXEES ICI (elles sont reprises telles quelles dans
 * verification/mutants/T07.json) :
 *
 *   1. `applyOperation` prend l'ETAT EN PREMIER et l'operation en second, et
 *      rend un etat NOUVEAU. L123 exige que les probes de frontiere soient des
 *      clones jetables « qui ne modifient pas l'etat persistant principal » :
 *      A3 mesure exactement cela en reprojetant l'etat de base APRES la probe.
 *
 *   2. L'operation est un objet PLAT et STRICT (L80 : proprietes inconnues
 *      rejetees), donc sans alias redondants :
 *        { kind, tenant, actor, slot, at, sequence, idempotency_key }
 *      `kind` vaut `reserve` ou `cancel`. `at` est l'instant METIER UTC ISO
 *      8601. `sequence` est la SEQUENCE D'ADMISSION EXPLICITE de L123 : c'est
 *      elle, et non `at`, qui ordonne la file. `idempotency_key` est la cle
 *      d'operation de l'invariant D-6 (L68).
 *
 *   3. `projectBusinessState` prend une VUE en second argument :
 *        { tenant }            — projection canonique du locataire
 *        { tenant, actor }     — projection servie a un acteur donne
 *      Le SECOND argument est positionnel. Une implementation qui l'IGNORE
 *      sert les reservations `legacy` a un acteur du locataire `other` et fait
 *      tomber A5 — ce qui est exactement la perturbation que
 *      verification/cases.lock.json prescrit pour ce cas.
 *
 * FORME DU RESULTAT. Un refus peut etre LEVE ou RENDU (`ok:false`,
 * `errors:[...]`, un champ de code) : le cahier prescrit un rejet, pas un
 * mecanisme. Ce qui n'est PAS un refus, c'est de produire l'effet demande — et
 * c'est ce que chaque cas de refus mesure PAR L'ETAT, independamment de la
 * forme du retour. La detection de forme est un CONFORT de message ; les
 * assertions decisives portent sur la projection.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DEUX DANGERS PROPRES A T07.
 *
 * (1) LES CAS D'ABSENCE QUI PASSENT SUR UN PROGRAMME MORT. A5 et A7 affirment
 *     qu'une chose N'EST PAS la. Une projection vide les satisfait sans rien
 *     prouver ; verification/cases.lock.json nomme ce defaut (`absence` /
 *     `make-present`). Chacun porte donc son CONTROLE POSITIF dans le MEME
 *     cas : A5 exige que la vue `legacy` montre les trois reservations et au
 *     moins une donnee distinctive, avant d'exiger que la vue `other` n'en
 *     montre aucune ; A7 exige que la PREMIERE annulation ait bien promu B,
 *     avant d'exiger que la seconde n'en promeuve pas un deuxieme.
 *
 * (2) LES CAS DE REFUS QU'UN STUB QUI LEVE REND VERTS. A4 et A6 sont classes
 *     `refusal` : « un stub qui leve rend ce cas VERT sans rien prouver ».
 *     Chacun porte son VOLET POSITIF — l'annulation A LA frontiere doit
 *     REUSSIR (A4), le rejeu a arguments IDENTIQUES doit REUSSIR (A6) — de
 *     sorte qu'une implementation qui refuse tout echoue. A4 exige en outre
 *     que le refus ne soit pas un PLANTAGE : un `TypeError` n'est pas un refus
 *     metier.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • « sans SQL ni HTTP » (L213) et « l'oracle ne reutilise ni les handlers,
 *    ni les requetes SQL, ni les validateurs metier des applications temoins »
 *    (L217) sont des proprietes de PROVENANCE du code, pas du comportement
 *    observable ici. Elles se constatent au diff et a la revue d'imports ; les
 *    applications temoins n'existent qu'en T09. Cette suite ne les simule pas.
 *  • Le « catalogue de resultats attendus » (L213) est un livrable dont aucun
 *    des sept cas requis ne fixe la forme. La suite ne lui invente pas de
 *    contrat : elle fournit elle-meme le journal d'operations et confronte la
 *    projection a la racine gelee.
 *  • AMBIGUITE ASSUMEE DE §F. L119 dit de P1 « demande concurrente de B
 *    rejetee sans surbooking » et de P2 « B puis C en attente ». §F ne dit pas
 *    si le refus de P1 laisse B en file ou non. La suite NE TRANCHE PAS : A1
 *    n'affirme de la demande de B que ce que §F affirme — pas de surbooking,
 *    le titulaire reste A, le compte de confirmees reste 1 — et le journal
 *    d'A2 admet B puis C en P2, ce que L119 decrit litteralement.
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

/**
 * Rendu TEXTUEL PROFOND d'une valeur quelconque. Il traverse `Map` et `Set` —
 * une projection peut parfaitement indexer ses reservations dans une `Map`, que
 * `JSON.stringify` rendrait `{}` et ou une fuite intertenant deviendrait
 * invisible. Les piles d'exception sont exclues : elles contiennent des chemins
 * de fichiers et feraient matcher des segments par accident.
 */
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
    const props: string[] = [];
    for (const k of Object.getOwnPropertyNames(v)) {
      if (k === 'stack' || k === 'message') continue;
      props.push(`${JSON.stringify(k)}:${rendu((v as unknown as Json)[k], profondeur + 1, vus)}`);
    }
    return `${v.name}: ${v.message} {${props.join(',')}}`;
  }
  if (v instanceof Map) {
    return `Map{${[...v.entries()]
      .map(([k, x]) => `${rendu(k, profondeur + 1, vus)}:${rendu(x, profondeur + 1, vus)}`)
      .join(',')}}`;
  }
  if (v instanceof Set) {
    return `Set[${[...v].map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  }
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 600): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/* ────────────────────── fixture de reference (racine gelee, L139) */

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
const N = (chemin: string): number => Number(refValue(RESERVATION, chemin));

/* ── les valeurs scellees de F-RESERVATION, et rien d'autre ─────────────── */

const HORLOGE_INITIALE = S('valeurs.horloge_initiale.valeur');
const ACTEURS = (refValue(RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
const LOCATAIRE = S('valeurs.locataire_initial.valeur');
const CRENEAU_ID = S('valeurs.creneau.id.valeur');
const CAPACITE = N('valeurs.creneau.capacite.valeur');
const DEBUT = S('valeurs.creneau.debut.valeur');

const P1_H = S('valeurs.horloges_des_periodes.P1.valeur');
const P2_H = S('valeurs.horloges_des_periodes.P2.valeur');
const P3_H = S('valeurs.horloges_des_periodes.P3.valeur');
const P4_H = S('valeurs.horloges_des_periodes.P4.valeur');

const P1_CONFIRMEES = N('valeurs.P1.etat_attendu.confirmees.valeur');
const P1_TITULAIRE = S('valeurs.P1.etat_attendu.titulaire.valeur');
const P1_DOUBLONS = N('valeurs.P1.etat_attendu.doublons.valeur');
const P1_SURBOOKING = refValue(RESERVATION, 'valeurs.P1.etat_attendu.surbooking.valeur') as boolean;

const P2_ORDRE_ATTENTE = (
  refValue(RESERVATION, 'valeurs.P2.ordre_d_attente.valeur') as unknown[]
).map(String);
const P2_A = S('valeurs.P2.etat_attendu.A.valeur');
const P2_B = S('valeurs.P2.etat_attendu.B.valeur');
const P2_C = S('valeurs.P2.etat_attendu.C.valeur');

const DELAI_HEURES = N('valeurs.P3.delai_heures.valeur');
const FRONTIERE_INCLUSE = refValue(
  RESERVATION,
  'valeurs.P3.frontiere_incluse.valeur',
) as boolean;
const FRONTIERE = S('valeurs.P3.frontiere.valeur');
const PROBE1_ACTEUR = S('valeurs.P3.probes.clone_1_frontiere_exacte.acteur.valeur');
const PROBE1_INSTANT = S('valeurs.P3.probes.clone_1_frontiere_exacte.instant.valeur');
const PROBE1_CONSEQUENCE = S(
  'valeurs.P3.probes.clone_1_frontiere_exacte.consequence_sur_le_clone.valeur',
);
const PROBE2_ACTEUR = S('valeurs.P3.probes.clone_2_frontiere_plus_1ms.acteur.valeur');
const PROBE2_INSTANT = S('valeurs.P3.probes.clone_2_frontiere_plus_1ms.instant.valeur');

const P4_ENTREE_A = S('valeurs.P4.etat_persistant_a_l_entree.A.valeur');
const P4_ENTREE_B = S('valeurs.P4.etat_persistant_a_l_entree.B.valeur');
const P4_ENTREE_C = S('valeurs.P4.etat_persistant_a_l_entree.C.valeur');
const VERDICT_INTERTENANT = S('valeurs.P4.verdict_intertenant.valeur');

/** Le code du contrat intertenant. Present dans le verdict scelle ci-dessus. */
const CODE_NOT_FOUND = 'NOT_FOUND'; // cahier:L123

/** Le locataire cree en P4 et l'un de ses acteurs. */
const LOCATAIRE_AUTRE = 'other'; // cahier:L119
/**
 * §F dit « ses acteurs » sans en nommer aucun : seul le LOCATAIRE porte la
 * propriete testee. Cet identifiant est une ENTREE de la suite, pas une valeur
 * attendue — aucune assertion ne le compare a quoi que ce soit.
 */
const ACTEUR_AUTRE = 'O1';

const [ACTEUR_A, ACTEUR_B, ACTEUR_C] = ACTEURS as [string, string, string];

/* ── statuts : le vocabulaire de la reference, normalise ────────────────── */

type Statut = 'confirme' | 'attente' | 'annule';

/** Le statut que la racine gelee enonce, ramene au vocabulaire de la suite. */
function statutDeLaReference(brut: string): Statut | string {
  const t = brut.toLowerCase();
  if (t.startsWith('annul')) return 'annule';
  if (t.startsWith('confirm')) return 'confirme';
  if (t.startsWith('en attente')) return 'attente';
  return `STATUT-REFERENCE-ILLISIBLE(${brut})`;
}

/** Le statut qu'une projection expose, ramene au meme vocabulaire. */
function statutDeLaProjection(brut: string): Statut | null {
  const t = brut.toLowerCase();
  if (/annul|cancel/.test(t)) return 'annule';
  if (/confirm|booked|reserved|held/.test(t)) return 'confirme';
  if (/attente|wait|queue|pending/.test(t)) return 'attente';
  return null;
}

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
  // Le chargement ne LEVE pas : un import casse produirait « Test suite failed
  // to run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement, ce qui
  // rend le rouge ASSERTION_FAILED — la seule forme de rouge qui prouve quelque
  // chose (cahier L139).
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

/** Premiere assertion de chaque cas : le paquet a bien ete charge. */
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

/* ───────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  createReservationOracle: [
    'createReservationOracle',
    'createOracle',
    'makeReservationOracle',
    'initReservationOracle',
    'newReservationOracle',
    'reservationOracle',
    'createBookingOracle',
    'createInitialState',
    'initialState',
    'creerOracleReservation',
  ],
  applyOperation: [
    'applyOperation',
    'applyOp',
    'apply',
    'applyIntent',
    'handleOperation',
    'transition',
    'step',
    'reduce',
    'reduceOperation',
    'appliquerOperation',
  ],
  projectBusinessState: [
    'projectBusinessState',
    'projectReservations',
    'projection',
    'project',
    'canonicalProjection',
    'businessProjection',
    'exportBusinessState',
    'projectState',
    'projeterEtatMetier',
    'etatMetier',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

/**
 * Resolution par role. NE LEVE PAS : un role introuvable doit produire une
 * ASSERTION rouge qui nomme le contrat manquant, pas une exception que le
 * rapport confondrait avec un plantage.
 */
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

/** Deuxieme assertion de chaque cas : le contrat de nommage est satisfait. */
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

/* ────────────────────── lecture d'un appel, refus compris */

/**
 * JETONS DE REFUS. Tolerance de NOMMAGE, comme les alias d'export : le cahier
 * prescrit un rejet, pas un code, sauf pour le contrat intertenant ou il ecrit
 * `NOT_FOUND` (L123) et pour le « conflit explicite » d'A6 (L215). Cette liste
 * ne sert qu'a QUALIFIER un retour ; aucune assertion decisive n'en depend :
 * les cas de refus mesurent l'ETAT.
 */
const JETONS_REFUS = [
  'NOT_FOUND',
  'CONFLICT',
  'CONFLIT',
  'REFUS',
  'REJECT',
  'REJETE',
  'DENIED',
  'FORBIDDEN',
  'UNAUTHORIZED',
  'NOT_ALLOWED',
  'NOT_PERMITTED',
  'TOO_LATE',
  'TROP_TARD',
  'TARDIF',
  'DEADLINE',
  'EXPIRED',
  'CUTOFF',
  'WINDOW',
  'MISMATCH',
  'DUPLICATE',
  'INVALID',
  'VIOLATION',
  'ERROR',
  'ERREUR',
] as const;

const JETONS_SUCCES = /ACCEPT|SUCCESS|CONFIRM|PROMOT|GRANT|ALLOW|CREATED|APPLIED|REPLAY|IDEMPOTENT/i;

/**
 * Les champs ou un code de refus se cherche. Au PREMIER niveau du retour, un
 * `status`/`outcome` porte le verdict de l'appel ; plus profond, il porte le
 * statut d'une RESERVATION (`full`, `cancelled`), qui n'est pas un verdict
 * d'appel. D'ou deux listes, et pas une.
 */
const CHAMPS_CODE_SOMMET =
  /^(code|error_code|errorcode|reason|motif|refusal|refus|rejection|rejet|error|erreur|outcome|verdict|status|statut)$/i;
const CHAMPS_CODE_PROFOND =
  /^(code|error_code|errorcode|reason|motif|refusal|refus|rejection|rejet|error|erreur)$/i;

/** Un plantage n'est pas un refus metier. */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null/;

function jetonDeRefus(s: string): string | null {
  const up = s.toUpperCase();
  if (JETONS_SUCCES.test(s)) return null;
  for (const j of JETONS_REFUS) if (up.includes(j)) return j;
  return null;
}

/** Cherche un code de refus dans les champs de code, jusqu'a deux niveaux. */
function codeDeRefus(v: unknown, profondeur = 0): string | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || profondeur > 2) return null;
  const o = v as Json;
  const champs = profondeur === 0 ? CHAMPS_CODE_SOMMET : CHAMPS_CODE_PROFOND;
  for (const [k, x] of Object.entries(o)) {
    if (champs.test(k) && typeof x === 'string') {
      const j = jetonDeRefus(x);
      if (j !== null) return `${k}=${x}`;
    }
  }
  for (const x of Object.values(o)) {
    const sous = codeDeRefus(x, profondeur + 1);
    if (sous !== null) return sous;
  }
  return null;
}

interface Issue {
  refuse: boolean;
  via: string;
  texte: string;
  valeur: unknown;
  leve: boolean;
}

async function appeler(role: string, args: unknown[]): Promise<Issue> {
  const f = resolveOpt(role);
  if (f === null) {
    return {
      refuse: true,
      via: 'contrat',
      texte: `ROLE-NON-RESOLU ${role}`,
      valeur: undefined,
      leve: false,
    };
  }
  let brut: unknown;
  try {
    brut = await Promise.resolve(f(...args));
  } catch (e) {
    return { refuse: true, via: 'exception', texte: `LEVE ${rendu(e)}`, valeur: e, leve: true };
  }
  const texte = rendu(brut);
  if (brut === null || brut === undefined) {
    return { refuse: true, via: 'nullish', texte: `RENDU-VIDE ${texte}`, valeur: brut, leve: false };
  }
  if (typeof brut === 'object' && !Array.isArray(brut)) {
    const o = brut as Json;
    for (const drapeau of ['ok', 'valid', 'valide', 'success', 'accepted', 'applied']) {
      if (o[drapeau] === false) {
        return { refuse: true, via: `${drapeau}=false`, texte, valeur: brut, leve: false };
      }
    }
    for (const cle of ['errors', 'issues', 'problems', 'erreurs', 'violations']) {
      const v = o[cle];
      if (Array.isArray(v) && v.length > 0) {
        return { refuse: true, via: `${cle}[${String(v.length)}]`, texte, valeur: brut, leve: false };
      }
    }
    const code = codeDeRefus(brut);
    if (code !== null) return { refuse: true, via: `code:${code}`, texte, valeur: brut, leve: false };
  }
  return { refuse: false, via: 'valeur', texte, valeur: brut, leve: false };
}

/**
 * L'ETAT porte par un retour : rendu directement, ou sous une enveloppe. Rien
 * d'autre n'est suppose de sa structure.
 */
function etatDe(v: unknown): unknown {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  for (const cle of ['state', 'etat', 'next', 'nextState', 'next_state', 'oracle', 'value']) {
    const sous = (v as Json)[cle];
    if (sous !== null && sous !== undefined && typeof sous === 'object') return sous;
  }
  return v;
}

const creer = (setup: Json): Promise<Issue> => appeler('createReservationOracle', [setup]);
const appliquer = (etat: unknown, op: Json): Promise<Issue> =>
  appeler('applyOperation', [etat, op]);
const projeter = (etat: unknown, vue: Json): Promise<Issue> =>
  appeler('projectBusinessState', [etat, vue]);

/** Un appel accepte : il n'a pas refuse. Rend sa valeur. */
function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(
    issue.refuse ? `REFUS-INATTENDU ${quoi} [${issue.via}] : ${court(issue.texte)}` : 'accepte',
  ).toBe('accepte');
  return issue.valeur;
}

/** Un appel refuse. Le mecanisme est libre ; le refus, non. */
function exigerRefuse(issue: Issue, quoi: string): void {
  expect(
    issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(issue.texte)}`,
  ).toBe('refuse');
}

/** Un refus METIER : refus, et pas un plantage du programme. */
function exigerRefusMetier(issue: Issue, quoi: string): void {
  exigerRefuse(issue, quoi);
  expect(
    MARQUEURS_DE_PLANTAGE.test(issue.texte)
      ? `PLANTAGE-AU-LIEU-D-UN-REFUS-METIER ${quoi} : ${court(issue.texte)}`
      : 'refus-metier',
  ).toBe('refus-metier');
}

/* ─────────────────── lecture d'une projection : l'etat metier observe */

const CHAMPS_ACTEUR =
  /^(actor|actor_id|actorid|acteur|holder|titulaire|party|owner|client|customer|guest|subject)$/i;
const CHAMPS_STATUT = /^(status|state|etat|statut|reservation_status|booking_status)$/i;
const CHAMPS_ID = /^(id|reservation_id|reservationid|booking_id|identifier|uid|uuid|ref)$/i;
const CHAMPS_RANG =
  /^(rank|rang|position|ordre|order|place|sequence|seq|admission_sequence|queue_position|waitlist_position)$/i;

interface Enr {
  acteur: string;
  statut: Statut;
  id: string | null;
  rang: number | null;
}

function lireEnregistrement(o: Json): Enr | null {
  let acteur: string | null = null;
  let statutBrut: string | null = null;
  let id: string | null = null;
  let rang: number | null = null;
  for (const [k, v] of Object.entries(o)) {
    if (acteur === null && CHAMPS_ACTEUR.test(k) && typeof v === 'string' && v.length > 0) {
      acteur = v;
    }
    if (statutBrut === null && CHAMPS_STATUT.test(k) && typeof v === 'string') statutBrut = v;
    if (id === null && CHAMPS_ID.test(k) && typeof v === 'string' && v.length > 0) id = v;
    if (rang === null && CHAMPS_RANG.test(k) && typeof v === 'number' && Number.isFinite(v)) {
      rang = v;
    }
  }
  if (acteur === null || statutBrut === null) return null;
  const statut = statutDeLaProjection(statutBrut);
  if (statut === null) return null;
  return { acteur, statut, id, rang };
}

const FAMILLES: { statut: Statut; re: RegExp }[] = [
  { statut: 'annule', re: /annul|cancel/i },
  { statut: 'attente', re: /attente|wait|queue|pending/i },
  { statut: 'confirme', re: /confirm|book|held|holder|titulaire/i },
];

interface EtatObserve {
  confirmes: string[];
  attente: string[];
  annules: string[];
  nbEnregistrements: number;
  instants: string[];
  identifiants: string[];
  texte: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function dedupe(xs: string[]): string[] {
  const vu = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (vu.has(x)) continue;
    vu.add(x);
    out.push(x);
  }
  return out;
}

/**
 * Lit l'etat metier d'une projection, quelle que soit sa forme. Deux sources :
 *   • les ENREGISTREMENTS — tout objet portant a la fois un champ d'acteur et
 *     un champ de statut lisible. Les enfants d'un enregistrement ne sont pas
 *     reexplores : un historique imbrique ne doit pas compter pour une
 *     reservation de plus.
 *   • les LISTES D'ACTEURS — tout tableau de chaines porte par une cle dont le
 *     nom nomme une famille de statut (`waiting: ['C']`).
 * La source « enregistrements » l'emporte des qu'elle rend quelque chose pour
 * la famille consideree.
 */
function lireEtat(projection: unknown): EtatObserve {
  const enr: Enr[] = [];
  const parId = new Set<string>();
  const listes: Record<Statut, string[]> = { confirme: [], attente: [], annule: [] };
  const instants: string[] = [];
  const identifiants: string[] = [];
  const vus = new Set<unknown>();

  const walk = (x: unknown, nomDuChamp: string | null): void => {
    if (typeof x === 'string') {
      if (ISO.test(x)) instants.push(x);
      if (nomDuChamp !== null && CHAMPS_ID.test(nomDuChamp) && x.length >= 3) identifiants.push(x);
      return;
    }
    if (x === null || typeof x !== 'object') return;
    if (vus.has(x)) return;
    vus.add(x);
    if (x instanceof Map) {
      for (const [k, v] of x.entries()) walk(v, typeof k === 'string' ? k : null);
      return;
    }
    if (x instanceof Set) {
      for (const v of x) walk(v, nomDuChamp);
      return;
    }
    if (Array.isArray(x)) {
      if (nomDuChamp !== null && x.every((e) => typeof e === 'string')) {
        for (const f of FAMILLES) {
          if (f.re.test(nomDuChamp)) {
            listes[f.statut].push(...(x as string[]));
            break;
          }
        }
      }
      for (const e of x) walk(e, nomDuChamp);
      return;
    }
    const o = x as Json;
    const e = lireEnregistrement(o);
    if (e !== null) {
      const cle = e.id === null ? null : `id:${e.id}`;
      if (cle === null || !parId.has(cle)) {
        if (cle !== null) parId.add(cle);
        enr.push(e);
      }
      // on ne descend PAS dans un enregistrement : ses champs sont a lui.
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string') walk(v, k);
      }
      return;
    }
    for (const [k, v] of Object.entries(o)) walk(v, k);
  };

  walk(projection, null);

  const parStatut = (s: Statut): string[] => {
    const mine = enr.filter((r) => r.statut === s);
    if (mine.length > 0) {
      const tousRanges = mine.every((r) => r.rang !== null);
      const ordonnes = tousRanges
        ? [...mine].sort((a, b) => (a.rang as number) - (b.rang as number))
        : mine;
      return dedupe(ordonnes.map((r) => r.acteur));
    }
    return dedupe(listes[s]);
  };

  return {
    confirmes: parStatut('confirme'),
    attente: parStatut('attente'),
    annules: parStatut('annule'),
    nbEnregistrements: enr.length,
    instants: dedupe(instants),
    identifiants: dedupe(identifiants),
    texte: rendu(projection),
  };
}

const resume = (e: EtatObserve): string =>
  `confirmes=[${e.confirmes.join(',')}] attente=[${e.attente.join(',')}] ` +
  `annules=[${e.annules.join(',')}] enregistrements=${String(e.nbEnregistrements)}`;

/* ───────────────────────── le journal d'operations de F-RESERVATION */

const SETUP: Json = {
  clock: HORLOGE_INITIALE,
  tenant: LOCATAIRE,
  actors: ACTEURS,
  slots: [{ id: CRENEAU_ID, capacity: CAPACITE, start: DEBUT }],
  cancellation_notice_hours: DELAI_HEURES,
  cancellation_boundary_inclusive: FRONTIERE_INCLUSE,
};

interface Op extends Json {
  kind: 'reserve' | 'cancel';
  tenant: string;
  actor: string;
  slot: string;
  at: string;
  sequence: number;
  idempotency_key: string;
}

function op(
  kind: 'reserve' | 'cancel',
  actor: string,
  at: string,
  sequence: number,
  idempotency_key: string,
  tenant: string = LOCATAIRE,
): Op {
  return { kind, tenant, actor, slot: CRENEAU_ID, at, sequence, idempotency_key };
}

/**
 * Cles d'operation et sequences d'admission. F-RESERVATION les declare
 * `non_fixe_par_le_cahier` : ce sont des ENTREES de la suite. `sequence` est la
 * « sequence d'admission explicite » de L123 — c'est elle qui ordonne la file,
 * et B et C sont admis au MEME instant metier pour que rien d'autre ne puisse
 * le faire.
 */
const CLE_A_RESERVE = 'op-p1-reserve-A';
const CLE_B_RESERVE = 'op-p2-reserve-B';
const CLE_C_RESERVE = 'op-p2-reserve-C';
const CLE_A_ANNULE = 'op-p2-cancel-A';
const CLE_B_ANNULE_FRONTIERE = 'op-p3-cancel-B-frontiere';

const OP_A_RESERVE = op('reserve', ACTEUR_A, P1_H, 1, CLE_A_RESERVE);
const OP_A_RESERVE_REJEU = op('reserve', ACTEUR_A, P1_H, 1, CLE_A_RESERVE);
const OP_B_CONCURRENT = op('reserve', ACTEUR_B, P1_H, 2, 'op-p1-reserve-B-concurrent');
const OP_B_RESERVE = op('reserve', ACTEUR_B, P2_H, 2, CLE_B_RESERVE);
const OP_C_RESERVE = op('reserve', ACTEUR_C, P2_H, 3, CLE_C_RESERVE);
const OP_A_ANNULE = op('cancel', ACTEUR_A, P2_H, 4, CLE_A_ANNULE);

/** Journal menant a l'etat persistant d'entree de P4 (L123). */
const JOURNAL_JUSQU_A_P2: Op[] = [
  OP_A_RESERVE,
  OP_A_RESERVE_REJEU,
  OP_B_RESERVE,
  OP_C_RESERVE,
  OP_A_ANNULE,
];

interface Construction {
  etat: unknown;
  echecs: string[];
}

/**
 * Rejoue un journal depuis l'etat initial. Chaque clone est construit par un
 * REJEU COMPLET, jamais par une copie de l'objet d'etat : aucune assertion ne
 * depend alors de la purete du reducteur, que A3 mesure separement et pour
 * elle-meme.
 */
async function construire(journal: Op[]): Promise<Construction> {
  const echecs: string[] = [];
  const initial = await creer(SETUP);
  if (initial.refuse) {
    return { etat: undefined, echecs: [`creation refusee [${initial.via}] ${court(initial.texte)}`] };
  }
  let etat = etatDe(initial.valeur);
  for (const o of journal) {
    const issue = await appliquer(etat, o);
    if (issue.refuse) {
      echecs.push(`${o.kind}/${o.actor}@${o.at} refuse [${issue.via}] ${court(issue.texte, 240)}`);
      continue;
    }
    etat = etatDe(issue.valeur);
  }
  return { etat, echecs };
}

/** Le journal complet doit passer : c'est le socle observable de chaque cas. */
function exigerJournalAccepte(c: Construction, quoi: string): unknown {
  expect(c.echecs.length === 0 ? 'journal-accepte' : `JOURNAL-REFUSE ${quoi} : ${c.echecs.join(' | ')}`).toBe(
    'journal-accepte',
  );
  return c.etat;
}

const VUE_CANONIQUE: Json = { tenant: LOCATAIRE };

async function etatDeLaProjection(etat: unknown, vue: Json, quoi: string): Promise<EtatObserve> {
  const issue = await projeter(etat, vue);
  return lireEtat(exigerAccepte(issue, quoi));
}

/* ═══════════════════════════════════════════════════════════════════════ */

describe('T07 — oracle metier independant de reservation', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T07.A1 F-RESERVATION P1 n a qu une reservation confirmee et aucun doublon idempotent',
    async () => {
      assertLoaded();
      assertContrat('createReservationOracle', 'applyOperation', 'projectBusinessState');

      // (0) LA REFERENCE DIT BIEN CE QUE LE CAS AFFIRME. Sans ce controle, les
      //     trois comptes compares plus bas ne seraient rattaches a rien.
      expect([P1_CONFIRMEES, P1_DOUBLONS, CAPACITE, P1_SURBOOKING, P1_TITULAIRE]).toEqual([
        1,
        0,
        1,
        false,
        ACTEUR_A,
      ]); // cahier:L119

      const initial = await creer(SETUP);
      const etat0 = etatDe(exigerAccepte(initial, 'creation de l oracle'));

      // (1) LA RESERVATION DE A EST ACCEPTEE.
      const apres1 = etatDe(
        exigerAccepte(await appliquer(etat0, OP_A_RESERVE), `reservation de ${ACTEUR_A}`),
      );
      const e1 = await etatDeLaProjection(apres1, VUE_CANONIQUE, 'projection apres la reservation');
      expect(e1.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119
      expect(e1.confirmes.length).toBe(P1_CONFIRMEES); // cahier:L119

      // (2) LE REJEU DE LA CLE IDEMPOTENTE N'AJOUTE RIEN. La comparaison porte
      //     sur l'etat metier AVANT/APRES : un doublon, ou une seconde entree
      //     en file, deplace l'un des quatre compteurs. Une implementation qui
      //     representerait la meme reservation dans deux conteneurs la
      //     representerait DEUX FOIS AVANT COMME APRES : l'egalite tient.
      const apres2 = etatDe(
        exigerAccepte(
          await appliquer(apres1, OP_A_RESERVE_REJEU),
          `rejeu de la cle idempotente ${CLE_A_RESERVE}`,
        ),
      );
      const e2 = await etatDeLaProjection(apres2, VUE_CANONIQUE, 'projection apres le rejeu');
      expect(e2.nbEnregistrements - e1.nbEnregistrements).toBe(P1_DOUBLONS); // cahier:L119
      expect([e2.confirmes, e2.attente, e2.annules]).toEqual([e1.confirmes, e1.attente, e1.annules]); // cahier:L68

      // (3) LA DEMANDE CONCURRENTE DE B NE SURBOOKE PAS. §F ne dit pas si le
      //     refus laisse B en file ; le cas n'affirme donc QUE ce que §F
      //     affirme — le titulaire reste A, et le compte de confirmees reste 1.
      const issueB = await appliquer(apres2, OP_B_CONCURRENT);
      const apres3 = issueB.refuse ? apres2 : etatDe(issueB.valeur);
      const e3 = await etatDeLaProjection(
        apres3,
        VUE_CANONIQUE,
        'projection apres la demande concurrente',
      );
      expect(e3.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119
      expect(e3.confirmes.length).toBe(P1_CONFIRMEES); // cahier:L119
      expect(
        e3.confirmes.length > CAPACITE ? `SURBOOKING ${resume(e3)}` : 'pas-de-surbooking',
      ).toBe('pas-de-surbooking'); // cahier:L119
      expect(e3.confirmes.includes(ACTEUR_B)).toBe(P1_SURBOOKING); // cahier:L119

      console.log(
        `[T07.A1] via=${LOADED.via.join(',')} apres-reservation=${resume(e1)} ` +
          `apres-rejeu=${resume(e2)} apres-concurrent=${resume(e3)} ` +
          `demande-de-B=${issueB.refuse ? `refusee(${issueB.via})` : 'admise-sans-confirmation'}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T07.A2 P2 promeut B avant C',
    async () => {
      assertLoaded();
      assertContrat('createReservationOracle', 'applyOperation', 'projectBusinessState');

      expect(P2_ORDRE_ATTENTE).toEqual([ACTEUR_B, ACTEUR_C]); // cahier:L119

      // (1) B PUIS C EN ATTENTE. Les deux admissions portent le MEME instant
      //     metier et des SEQUENCES distinctes : seule la sequence d'admission
      //     explicite peut ordonner la file. « FIFO est ordonne par sequence
      //     d'admission explicite, pas par egalite possible de timestamps. »
      expect([OP_B_RESERVE.at, OP_C_RESERVE.at]).toEqual([P2_H, P2_H]); // cahier:L125
      expect(OP_B_RESERVE.sequence < OP_C_RESERVE.sequence).toBe(true); // cahier:L123

      const avant = exigerJournalAccepte(
        await construire([OP_A_RESERVE, OP_B_RESERVE, OP_C_RESERVE]),
        'admissions de P2',
      );
      const eAvant = await etatDeLaProjection(avant, VUE_CANONIQUE, 'projection avant l annulation');
      expect(eAvant.attente).toEqual(P2_ORDRE_ATTENTE); // cahier:L119
      expect(eAvant.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119

      // (2) L'ANNULATION DE A PROMEUT B, ET C RESTE PREMIER EN ATTENTE.
      const apres = etatDe(
        exigerAccepte(await appliquer(avant, OP_A_ANNULE), `annulation de ${ACTEUR_A}`),
      );
      const e = await etatDeLaProjection(apres, VUE_CANONIQUE, 'projection apres l annulation');

      expect(e.annules.includes(ACTEUR_A) ? statutDeLaReference(P2_A) : `A=${resume(e)}`).toBe(
        statutDeLaReference(P2_A),
      ); // cahier:L119
      expect(e.confirmes).toEqual([ACTEUR_B]); // cahier:L119 — « B devient confirme »
      expect(e.confirmes.length).toBe(CAPACITE); // cahier:L119
      expect(e.attente).toEqual([ACTEUR_C]); // cahier:L119 — « C reste premier en attente »
      expect(
        e.attente[0] === ACTEUR_C ? statutDeLaReference(P2_C) : `C-non-premier ${resume(e)}`,
      ).toBe(statutDeLaReference(P2_C)); // cahier:L119
      expect(statutDeLaReference(P2_B)).toBe('confirme'); // cahier:L119

      console.log(`[T07.A2] avant=${resume(eAvant)} apres=${resume(e)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T07.A3 annulation permise exactement a 24 h, frontiere incluse',
    async () => {
      assertLoaded();
      assertContrat('createReservationOracle', 'applyOperation', 'projectBusinessState');

      // (0) LA FRONTIERE SCELLEE EST BIEN « debut moins 24 h ». Si la racine
      //     gelee se contredisait, c'est ICI que ca se verrait.
      expect(Date.parse(DEBUT) - Date.parse(FRONTIERE)).toBe(DELAI_HEURES * 3_600_000); // cahier:L119
      expect([PROBE1_ACTEUR, PROBE1_INSTANT, FRONTIERE_INCLUSE]).toEqual([
        ACTEUR_B,
        FRONTIERE,
        true,
      ]); // cahier:L119

      const base = exigerJournalAccepte(
        await construire(JOURNAL_JUSQU_A_P2),
        'journal jusqu a la fin de P2',
      );
      const eBaseAvant = await etatDeLaProjection(base, VUE_CANONIQUE, 'etat persistant avant probe');
      expect([eBaseAvant.confirmes, eBaseAvant.attente]).toEqual([[ACTEUR_B], [ACTEUR_C]]); // cahier:L123

      // (1) L'ANNULATION EXACTEMENT A LA FRONTIERE EST PERMISE.
      const opFrontiere = op(
        'cancel',
        PROBE1_ACTEUR,
        PROBE1_INSTANT,
        5,
        CLE_B_ANNULE_FRONTIERE,
      );
      expect(opFrontiere.at).toBe(FRONTIERE); // cahier:L119
      const issue = await appliquer(base, opFrontiere);
      const clone = etatDe(
        exigerAccepte(issue, `annulation de ${PROBE1_ACTEUR} a la frontiere ${FRONTIERE}`),
      );

      // (2) SUR LE CLONE, C DEVIENT CONFIRME.
      const eClone = await etatDeLaProjection(clone, VUE_CANONIQUE, 'projection du clone frontiere');
      expect(eClone.annules.includes(PROBE1_ACTEUR) ? 'B-annule' : `B-non-annule ${resume(eClone)}`).toBe(
        'B-annule',
      ); // cahier:L119
      expect(eClone.confirmes).toEqual([ACTEUR_C]); // cahier:L123 — « C devient confirme »
      expect(PROBE1_CONSEQUENCE.includes(ACTEUR_C)).toBe(true); // cahier:L123

      // (3) LA PROBE EST UN CLONE JETABLE : l'etat persistant principal n'a pas
      //     bouge. C'est l'enonce meme de L123, et c'est ce qui interdit un
      //     reducteur qui muterait son entree.
      const eBaseApres = await etatDeLaProjection(
        base,
        VUE_CANONIQUE,
        'etat persistant apres la probe',
      );
      expect([eBaseApres.confirmes, eBaseApres.attente, eBaseApres.annules]).toEqual([
        eBaseAvant.confirmes,
        eBaseAvant.attente,
        eBaseAvant.annules,
      ]); // cahier:L123
      expect(eBaseApres.annules.includes(ACTEUR_A)).toBe(true); // cahier:L123
      expect([statutDeLaReference(P4_ENTREE_A), statutDeLaReference(P4_ENTREE_B), statutDeLaReference(P4_ENTREE_C)]).toEqual(
        ['annule', 'confirme', 'attente'],
      ); // cahier:L123

      console.log(
        `[T07.A3] frontiere=${FRONTIERE} clone=${resume(eClone)} ` +
          `base-avant=${resume(eBaseAvant)} base-apres=${resume(eBaseApres)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T07.A4 refus metier 1 ms apres la frontiere des 24 h',
    async () => {
      assertLoaded();
      assertContrat('createReservationOracle', 'applyOperation', 'projectBusinessState');

      // (0) LES DEUX INSTANTS SCELLES NE DIFFERENT QUE D'UNE MILLISECONDE.
      expect(Date.parse(PROBE2_INSTANT) - Date.parse(FRONTIERE)).toBe(1); // cahier:L119
      expect(PROBE2_ACTEUR).toBe(ACTEUR_B); // cahier:L119

      // (1) VOLET POSITIF — sans lui, une implementation qui refuse TOUT
      //     satisferait l'enonce du cas sans rien prouver. Les deux clones sont
      //     construits par deux rejeus complets et independants du meme
      //     journal ; seul l'instant de l'annulation differe.
      const baseA = exigerJournalAccepte(
        await construire(JOURNAL_JUSQU_A_P2),
        'journal du clone frontiere',
      );
      const cloneFrontiere = etatDe(
        exigerAccepte(
          await appliquer(baseA, op('cancel', PROBE2_ACTEUR, FRONTIERE, 5, CLE_B_ANNULE_FRONTIERE)),
          `annulation a la frontiere ${FRONTIERE}`,
        ),
      );
      const eFrontiere = await etatDeLaProjection(
        cloneFrontiere,
        VUE_CANONIQUE,
        'projection du clone frontiere',
      );
      expect(eFrontiere.confirmes).toEqual([ACTEUR_C]); // cahier:L123

      // (2) L'ENONCE DU CAS : 1 ms apres, c'est un REFUS METIER.
      const baseB = exigerJournalAccepte(
        await construire(JOURNAL_JUSQU_A_P2),
        'journal du clone tardif',
      );
      const eAvant = await etatDeLaProjection(baseB, VUE_CANONIQUE, 'clone tardif avant');
      expect([eAvant.confirmes, eAvant.attente]).toEqual([[ACTEUR_B], [ACTEUR_C]]); // cahier:L123

      const tardive = await appliquer(
        baseB,
        op('cancel', PROBE2_ACTEUR, PROBE2_INSTANT, 5, 'op-p3-cancel-B-tardif'),
      );
      exigerRefusMetier(tardive, `annulation a ${PROBE2_INSTANT}`); // cahier:L119

      // (3) ET LE REFUS A DES CONSEQUENCES OBSERVABLES : rien n'a bouge. C'est
      //     l'assertion qui ne depend d'AUCUNE convention de forme du retour —
      //     une implementation permissive promeut C, et elle tombe ici. L'etat
      //     examine est celui d'AVANT l'appel : un refus, par definition, n'en
      //     produit pas de nouveau.
      const eApres = await etatDeLaProjection(baseB, VUE_CANONIQUE, 'clone tardif apres le refus');
      expect(eApres.confirmes).toEqual([ACTEUR_B]); // cahier:L119
      expect(eApres.attente).toEqual([ACTEUR_C]); // cahier:L119
      expect(eApres.confirmes.includes(ACTEUR_C)).toBe(false); // cahier:L119
      expect([eApres.confirmes, eApres.attente, eApres.annules]).toEqual([
        eAvant.confirmes,
        eAvant.attente,
        eAvant.annules,
      ]); // cahier:L123

      console.log(
        `[T07.A4] frontiere=${resume(eFrontiere)} tardif-refus=${tardive.via} ` +
          `tardif-apres=${resume(eApres)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T07.A5 un acteur du locataire other ne voit aucune donnee legacy',
    async () => {
      assertLoaded();
      assertContrat('createReservationOracle', 'applyOperation', 'projectBusinessState');

      // (0) LE CODE COMPARE PLUS BAS EST BIEN CELUI QUE LA RACINE GELEE ENONCE.
      expect(VERDICT_INTERTENANT.includes(CODE_NOT_FOUND)).toBe(true); // cahier:L123
      expect(LOCATAIRE_AUTRE === LOCATAIRE).toBe(false); // cahier:L119

      const etat = exigerJournalAccepte(
        await construire(JOURNAL_JUSQU_A_P2),
        'journal jusqu a l entree de P4',
      );

      // (1) CONTROLE POSITIF — sans lui, « ne voit aucune donnee legacy » serait
      //     satisfait par un programme mort. La vue du locataire `legacy` DOIT
      //     montrer les trois reservations dans l'etat que L123 decrit.
      const eLegacy = await etatDeLaProjection(
        etat,
        { tenant: LOCATAIRE, actor: ACTEUR_A },
        'projection servie au locataire legacy',
      );
      expect(eLegacy.confirmes).toEqual([ACTEUR_B]); // cahier:L123
      expect(eLegacy.attente).toEqual([ACTEUR_C]); // cahier:L123
      expect(eLegacy.annules.includes(ACTEUR_A)).toBe(true); // cahier:L123

      //     Les jetons DISTINCTIFS de la donnee legacy : instants metier et
      //     identifiants de reservation, moins ce que la requete intertenante
      //     fournit elle-meme. Sans au moins un jeton, le controle d'absence
      //     n'aurait aucune prise — et la suite le dit au lieu de passer.
      const fournisParLaRequete = new Set<string>([P4_H, CRENEAU_ID, LOCATAIRE_AUTRE, ACTEUR_AUTRE]);
      const distinctifs = [...eLegacy.instants, ...eLegacy.identifiants].filter(
        (x) => !fournisParLaRequete.has(x),
      );
      expect(
        distinctifs.length > 0
          ? 'donnee-distinctive-observee'
          : `PROJECTION-SANS-DONNEE-DISTINCTIVE (ni instant metier ni identifiant) : ${court(eLegacy.texte)}`,
      ).toBe('donnee-distinctive-observee'); // cahier:L123

      // (2) L'ENONCE DU CAS : la vue du locataire `other` est un NOT_FOUND, et
      //     elle ne porte AUCUNE reservation legacy.
      const vueAutre = await projeter(etat, { tenant: LOCATAIRE_AUTRE, actor: ACTEUR_AUTRE });
      exigerRefusMetier(vueAutre, `lecture par ${ACTEUR_AUTRE} du locataire ${LOCATAIRE_AUTRE}`);
      expect(
        vueAutre.texte.toUpperCase().includes(CODE_NOT_FOUND)
          ? CODE_NOT_FOUND
          : `CODE-ABSENT ${court(vueAutre.texte)}`,
      ).toBe(CODE_NOT_FOUND); // cahier:L123

      const eAutre = lireEtat(vueAutre.valeur);
      expect([eAutre.confirmes, eAutre.attente, eAutre.annules]).toEqual([[], [], []]); // cahier:L119
      expect(eAutre.nbEnregistrements).toBe(0); // cahier:L119
      expect(distinctifs.filter((x) => vueAutre.texte.includes(x))).toEqual([]); // cahier:L123

      // (3) « NI LIRE NI MODIFIER » : la tentative d'annulation intertenante est
      //     refusee, et l'etat legacy n'a pas bouge.
      const modification = await appliquer(
        etat,
        op('cancel', ACTEUR_B, P4_H, 6, 'op-p4-cancel-B-intertenant', LOCATAIRE_AUTRE),
      );
      exigerRefusMetier(modification, `annulation intertenante depuis ${LOCATAIRE_AUTRE}`); // cahier:L119
      const eApres = await etatDeLaProjection(
        etat,
        { tenant: LOCATAIRE, actor: ACTEUR_A },
        'projection legacy apres la tentative intertenante',
      );
      expect([eApres.confirmes, eApres.attente]).toEqual([[ACTEUR_B], [ACTEUR_C]]); // cahier:L119

      console.log(
        `[T07.A5] legacy=${resume(eLegacy)} distinctifs=${String(distinctifs.length)} ` +
          `other=${vueAutre.via} other-etat=${resume(eAutre)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T07.A6 meme cle et arguments differents donnent un conflit explicite',
    async () => {
      assertLoaded();
      assertContrat('createReservationOracle', 'applyOperation', 'projectBusinessState');

      const initial = await creer(SETUP);
      const etat0 = etatDe(exigerAccepte(initial, 'creation de l oracle'));
      const apres1 = etatDe(
        exigerAccepte(await appliquer(etat0, OP_A_RESERVE), `reservation de ${ACTEUR_A}`),
      );
      const e1 = await etatDeLaProjection(apres1, VUE_CANONIQUE, 'projection apres la reservation');
      expect(e1.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119

      // (1) VOLET POSITIF — la MEME cle avec les MEMES arguments est acceptee et
      //     ne cree rien. Sans lui, une implementation qui refuse tout rejeu
      //     satisferait l'enonce du cas sans rien prouver.
      const rejeu = await appliquer(apres1, OP_A_RESERVE_REJEU);
      const apres2 = etatDe(exigerAccepte(rejeu, `rejeu a arguments identiques (${CLE_A_RESERVE})`));
      const e2 = await etatDeLaProjection(apres2, VUE_CANONIQUE, 'projection apres le rejeu');
      expect(e2.nbEnregistrements - e1.nbEnregistrements).toBe(P1_DOUBLONS); // cahier:L68

      // (2) L'ENONCE DU CAS : meme cle, arguments DIFFERENTS (l'acteur change) —
      //     conflit explicite. Renvoyer silencieusement le resultat du premier
      //     appel est une ACCEPTATION, et elle tombe sur la premiere assertion.
      const conflit = await appliquer(
        apres2,
        op('reserve', ACTEUR_C, P1_H, 1, CLE_A_RESERVE),
      );
      exigerRefusMetier(conflit, `meme cle ${CLE_A_RESERVE} avec un acteur different`); // cahier:L215

      //     « EXPLICITE » : le refus NOMME le conflit. C'est le seul mot que
      //     L215 impose ici ; la tolerance de nommage se limite a ses deux
      //     orthographes.
      expect(
        /conflict|conflit/i.test(conflit.texte)
          ? 'conflit-nomme'
          : `CONFLIT-NON-NOMME : ${court(conflit.texte)}`,
      ).toBe('conflit-nomme'); // cahier:L215

      // (3) ET AUCUNE SECONDE OPERATION N'A ETE CREEE. L'etat examine est celui
      //     d'avant l'appel : un refus n'en produit pas de nouveau.
      const e3 = await etatDeLaProjection(apres2, VUE_CANONIQUE, 'projection apres le conflit');
      expect(e3.confirmes).toEqual([P1_TITULAIRE]); // cahier:L119
      expect(e3.confirmes.includes(ACTEUR_C)).toBe(false); // cahier:L68
      expect(e3.attente.includes(ACTEUR_C)).toBe(false); // cahier:L68
      expect(e3.nbEnregistrements).toBe(e2.nbEnregistrements); // cahier:L68

      console.log(
        `[T07.A6] apres-reservation=${resume(e1)} apres-rejeu=${resume(e2)} ` +
          `conflit=${conflit.via} apres-conflit=${resume(e3)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A7 */
  test(
    'T07.A7 une annulation repetee ne promeut pas deux personnes',
    async () => {
      assertLoaded();
      assertContrat('createReservationOracle', 'applyOperation', 'projectBusinessState');

      const etat = exigerJournalAccepte(
        await construire(JOURNAL_JUSQU_A_P2),
        'journal jusqu a la fin de P2',
      );

      // (1) CONTROLE POSITIF — la PREMIERE annulation A BIEN promu B. Sans lui,
      //     « pas de seconde promotion » serait vrai sur un programme mort.
      const eUne = await etatDeLaProjection(etat, VUE_CANONIQUE, 'etat apres la premiere annulation');
      expect(eUne.confirmes).toEqual([ACTEUR_B]); // cahier:L119
      expect(eUne.attente).toEqual([ACTEUR_C]); // cahier:L119
      expect(eUne.annules.includes(ACTEUR_A)).toBe(true); // cahier:L119

      // (2) L'ENONCE DU CAS : la MEME annulation, rejouee a l'identique, ne
      //     promeut personne de plus.
      //     Les deux issues sont admissibles — un rejeu idempotent ACCEPTE qui
      //     ne change rien, ou un REFUS. Ce qui ne l'est pas, c'est une seconde
      //     promotion. L'etat examine est donc celui que l'appel rend s'il
      //     aboutit, et l'etat d'avant s'il refuse.
      const rejeu = await appliquer(etat, OP_A_ANNULE);
      const etatRejeu = rejeu.refuse ? etat : etatDe(rejeu.valeur);
      const eRejeu = await etatDeLaProjection(
        etatRejeu,
        VUE_CANONIQUE,
        'etat apres le rejeu de l annulation',
      );
      expect(eRejeu.confirmes).toEqual([ACTEUR_B]); // cahier:L119
      expect(eRejeu.confirmes.length).toBe(CAPACITE); // cahier:L119
      expect(eRejeu.confirmes.includes(ACTEUR_C)).toBe(false); // cahier:L119
      expect(eRejeu.attente).toEqual([ACTEUR_C]); // cahier:L119
      expect(eRejeu.nbEnregistrements).toBe(eUne.nbEnregistrements); // cahier:L68

      // (3) LA MEME REPETITION AVEC UNE CLE NEUVE — l'autre lecture de
      //     « annulation repetee » — ne promeut pas davantage : A est deja
      //     annule, il n'y a rien a annuler une seconde fois.
      const seconde = await appliquer(
        etat,
        op('cancel', ACTEUR_A, P3_H, 6, 'op-p3-cancel-A-seconde'),
      );
      const etatSeconde = seconde.refuse ? etat : etatDe(seconde.valeur);
      const eSeconde = await etatDeLaProjection(
        etatSeconde,
        VUE_CANONIQUE,
        'etat apres la seconde annulation de A',
      );
      expect(eSeconde.confirmes).toEqual([ACTEUR_B]); // cahier:L119
      expect(eSeconde.confirmes.includes(ACTEUR_C)).toBe(false); // cahier:L119
      expect(eSeconde.attente).toEqual([ACTEUR_C]); // cahier:L119

      // (4) ET L'ETAT PERSISTANT N'A PAS BOUGE NON PLUS.
      const eBase = await etatDeLaProjection(etat, VUE_CANONIQUE, 'etat persistant reprojete');
      expect([eBase.confirmes, eBase.attente]).toEqual([[ACTEUR_B], [ACTEUR_C]]); // cahier:L123

      console.log(
        `[T07.A7] une=${resume(eUne)} rejeu=${resume(eRejeu)} (${rejeu.via}) ` +
          `seconde=${resume(eSeconde)} (${seconde.via})`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
