/**
 * acceptance/T06.spec.ts — suite d'acceptation de la tache T06.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T06.A1 absence   — une sentinelle distincte dans chaque evenement futur ne
 *                      figure JAMAIS dans les entrees de l'agent avant sa
 *                      revelation
 *   T06.A2 refusal   — une lecture anticipee renvoie `NOT_RELEASED`
 *   T06.A3 behaviour — une question connue produit la reponse disponible EXACTE
 *   T06.A4 refusal   — une question non couverte donne `UNSPECIFIED`, sans
 *                      inventer de regle
 *   T06.A5 refusal   — une dependance cyclique ou vers un evenement inexistant
 *                      est rejetee
 *   T06.A6 behaviour — remplacer une exigence desactive la bonne version au bon
 *                      instant
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE a `packages/scenario` et a `fixtures` —
 * les `source_paths` que verification/tasks.json declare pour T06. ADR-001 :
 * cet aveuglement est PROCEDURAL, donc une discipline auditable au diff, pas une
 * barriere technique. Le contrat teste ci-dessous n'est pas releve dans
 * l'implementation ; il est derive de docs/specs/T06.md, c'est-a-dire des lignes
 * du cahier que la carte de specification epingle :
 *
 *   L205  livrables : « pack public/prive, index de periodes, table de reponses
 *         client et versionnement des exigences »
 *   L207  les six cas d'acceptation, mot pour mot — dont les deux codes
 *         `NOT_RELEASED` et `UNSPECIFIED`
 *   L209  fin : « un pack reservation quatre periodes est compilable ; le
 *         paquet futur complet ne sera jamais envoye a un workflow ou sandbox
 *         accessible au developpeur »
 *   L63   invariant D-2 : « une revelation de periode k ne contient ni besoins,
 *         ni reponses metier, ni tests prives de k+1 »
 *   L88   `Requirement` : « id, version, capability_id, poids, date de
 *         revelation, echeance, remplacement eventuel, criticite, source »
 *   L80   « les JSON de domaine sont stricts : proprietes inconnues rejetees,
 *         enums explicites, timestamps UTC ISO 8601 »
 *   L119, L123, L125  F-RESERVATION : creneau, acteurs, locataires, regle des
 *         24 h et horloges des quatre periodes
 *   L109  F-QUALITY : « P3 remplace A@1 par A@2 […] P4 retire B »
 *   L129  F-REGRESSION : « `cancel@1` satisfaite en P2 puis remplacee en P3 par
 *         `cancel@2` […] `isolation@1` satisfaite en P3 »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des trois sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/**` — racine gelee,
 *       docs/FROZEN_ROOTS.json. C'est le cas de TOUTES les reponses client
 *       attendues (F-RESERVATION), de tous les identifiants d'exigence et de
 *       tous les instants de bascule (F-QUALITY, F-REGRESSION).
 *   (b) un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p'
 *       docs/cahier.md` — c'est le cas des deux codes `NOT_RELEASED` et
 *       `UNSPECIFIED` (L207) et du nombre de periodes (L209).
 *   (c) une valeur LUE dans la fixture archivee de ce depot
 *       (`acceptance/fixtures/scenarios/`), elle-meme ecrite par ce role et
 *       documentee dans le README de ce dossier. Les sentinelles, les
 *       `event_id` et les `question_id` sont de cette nature : la suite ne les
 *       recopie pas, elle les RELIT de la source soumise au compilateur.
 *
 * LA FIXTURE NE FAIT PAS AUTORITE SUR LES VALEURS METIER. Chaque reponse de la
 * table client porte `source_reference.path`, un chemin dans F-RESERVATION. La
 * suite re-resout ce chemin dans la racine gelee et exige que la fixture y soit
 * conforme (premiere assertion d'A3) AVANT de comparer la sortie de
 * l'implementation. Le meme double controle vaut pour les exigences : les jeux
 * actifs attendus d'A6 sont derives de F-QUALITY et F-REGRESSION, puis
 * confrontes a ce que la fixture declare. Si les deux divergent, A6 echoue sur
 * la fixture, pas sur l'implementation — et le message le dit.
 *
 * Aucune valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET D'APPEL. Le paquet est charge par son SPECIFICATEUR,
 * que jest.config.mjs mappe vers `packages/scenario/src` — jamais vers un
 * `dist/` perime, gitignore et invisible a `git status --porcelain`.
 *
 * Pour chaque ROLE, la suite nomme un export PRIMAIRE puis une courte liste
 * d'alias documentes. Les alias sont une tolerance de NOMMAGE, pas de
 * COMPORTEMENT. Si AUCUN nom ne repond, la suite echoue par une assertion
 * explicite qui nomme le role et la liste attendue — jamais par un import
 * casse, que verification/runner/red.mjs classe MODULE_NOT_FOUND et refuse
 * comme preuve.
 *
 *   compileScenarioPack(source)                 -> pack compile          (L205)
 *   revealPeriod(pack, cible)                   -> vue disponible de `cible`
 *   revealPeriod(pack, cible, curseur)          -> REFUS `NOT_RELEASED` si
 *                                                  cible > curseur       (L207)
 *   answerCustomerQuestion(pack, periode, question)
 *                                               -> reponse disponible, ou refus
 *                                                  `NOT_RELEASED` / `UNSPECIFIED`
 *   activeRequirements(pack, periode)           -> versions d'exigence actives
 *
 * LE TROISIEME ARGUMENT DE `revealPeriod` EST LE CURSEUR DE REVELATION, et il
 * est POSITIONNEL. C'est le seul endroit ou cette suite impose une convention
 * d'appel que le cahier ne dicte pas : « lecture anticipee » (L207) n'a de sens
 * que relativement a une periode courante, et le cahier ne nomme pas le canal.
 * Le choix est documente ici et dans verification/mutants/T06.json ; une
 * implementation qui IGNORE ce troisieme argument sert le contenu d'une periode
 * future et fait tomber A2 — ce qui est exactement la perturbation permissive
 * que le registre des mutants prescrit.
 *
 * FORME DU RESULTAT. Un refus peut etre LEVE ou RENDU (`ok:false`,
 * `errors:[...]`, un champ portant le code) : le cahier prescrit un rejet et un
 * CODE, pas un mecanisme. Ce qui n'est PAS un refus, c'est de rendre le contenu
 * demande — et c'est ce que chaque cas de refus mesure. Le code est cherche
 * dans le rendu TEXTUEL complet du refus (message, champs propres, objet
 * rendu), ce qui n'impose aucun nom de champ.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LE DANGER PROPRE A T06 : LE CAS D'ABSENCE QUI PASSE SUR UN PROGRAMME MORT.
 *
 * A1 affirme qu'une chose N'EST PAS la. Une revelation vide — ou un programme
 * qui ne rend rien du tout — satisfait cet enonce sans rien prouver ;
 * verification/cases.lock.json nomme ce defaut (`absence` / `make-present`).
 * A1 porte donc son CONTROLE POSITIF : la sentinelle de la periode k doit
 * FIGURER dans la revelation de la periode k. Absence et presence sont
 * asserties sur le meme objet, dans le meme cas : une revelation vide fait
 * tomber la presence, une revelation complete fait tomber l'absence, et seule
 * une porte correcte satisfait les deux.
 *
 * Symetriquement, A2, A4 et A5 sont classes `refusal` : « un stub qui leve rend
 * ce cas VERT sans rien prouver ». Chacun porte son VOLET POSITIF — la lecture
 * a l'heure, la question couverte, le pack sain — qui doit REUSSIR. Une
 * implementation qui refuse tout echoue sur le volet positif.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS. L209 exige que « le paquet futur complet ne
 * soit jamais envoye a un workflow ou sandbox accessible au developpeur ». Ce
 * qu'on observe ici, c'est la porte : ce que la fonction de revelation remet a
 * l'agent. Qu'aucun autre chemin du moteur ne recopie le pack prive dans un
 * sandbox est l'objet de T19 et T20 (l.323, l.333), qui exercent l'isolation
 * reelle. Cette suite ne le simule pas.
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
const PACKAGES = ['scenario'] as const;
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');
const SCENARIO_DIR = path.join(REPO, 'acceptance', 'fixtures', 'scenarios');

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Rendu TEXTUEL PROFOND d'une valeur quelconque : c'est sur lui que porte
 * chaque recherche de sentinelle et de code. Il traverse `Map` et `Set` — un
 * pack compile peut parfaitement indexer ses periodes dans une `Map`, que
 * `JSON.stringify` rendrait `{}` et ou une fuite deviendrait invisible. Les
 * piles d'exception sont exclues : elles contiennent des chemins de fichiers et
 * feraient matcher des segments par accident.
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

/* ──────────────────────────── fixtures de reference (racine gelee, L139) */

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
const QUALITY = readReference('F-QUALITY');
const REGRESSION = readReference('F-REGRESSION');

/** « P3 » -> 3. Les instants de bascule de §F sont ecrits sous cette forme. */
function indiceDePeriode(etiquette: unknown): number {
  const m = /^P(\d+)$/.exec(String(etiquette));
  if (m === null) throw new Error(`REFERENCE-PERIODE-ILLISIBLE ${String(etiquette)}`);
  return Number(m[1]);
}

/* ─────────────────────────── fixtures de scenario (archive de T06, zone ACCEPTANCE) */

function lireScenario(nom: string): Json {
  return JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, `${nom}.json`), 'utf8')) as Json;
}

const SAIN = lireScenario('reservation-4-periodes');
const CYCLE = lireScenario('invalide-cycle');
const PENDANTE = lireScenario('invalide-dependance-pendante');

const PERIODES = SAIN.periods as Json[];
/** Quatre periodes : « un pack reservation quatre periodes est compilable ». */ // cahier:L209
const NB_PERIODES = 4;

const periodeDe = (k: number): Json => PERIODES[k - 1];

/** Toutes les sentinelles attachees a quoi que ce soit de la periode k. */
function sentinellesDe(v: unknown, dans: string[] = []): string[] {
  if (Array.isArray(v)) {
    for (const x of v) sentinellesDe(x, dans);
    return dans;
  }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Json)) {
      if (k === 'sentinel' && typeof x === 'string') dans.push(x);
      else sentinellesDe(x, dans);
    }
  }
  return dans;
}

/** Les sentinelles que la revelation de la periode k ne doit JAMAIS porter avant k. */
const SENTINELLES: Record<number, string[]> = {};
/** Les sentinelles de charge utile d'evenement : elles, la revelation de k DOIT les porter. */
const SENTINELLES_EVENEMENT: Record<number, string[]> = {};
for (let k = 1; k <= NB_PERIODES; k += 1) {
  SENTINELLES[k] = [...new Set(sentinellesDe(periodeDe(k)))];
  SENTINELLES_EVENEMENT[k] = (periodeDe(k).events as Json[]).map((e) =>
    String((e.payload as Json).sentinel),
  );
}

/* ───────────────────────────────────────────── les deux codes du cas L207 */

const CODE_NOT_RELEASED = 'NOT_RELEASED'; // cahier:L207
const CODE_UNSPECIFIED = 'UNSPECIFIED'; // cahier:L207

/** Les codes du cahier presents dans un rendu de refus, dans un ordre stable. */
function codesDe(texte: string): string[] {
  const out: string[] = [];
  if (texte.includes(CODE_NOT_RELEASED)) out.push(CODE_NOT_RELEASED);
  if (texte.includes(CODE_UNSPECIFIED)) out.push(CODE_UNSPECIFIED);
  return out;
}

/* ───────────────── la table de reponses attendue, relue de la racine gelee */

interface ReponseAttendue {
  question: string;
  periode: number;
  attendue: string;
  chemin: string;
  sentinelle: string;
}

const REPONSES: ReponseAttendue[] = PERIODES.flatMap((p) =>
  (p.customer_answers as Json[]).map((a) => {
    const src = a.source_reference as Json;
    const chemin = String(src.path);
    return {
      question: String(a.question_id),
      periode: p.period_index as number,
      // L'attendue vient de la RACINE GELEE, pas du champ `answer` de la fixture.
      attendue: String(refValue(RESERVATION, chemin)),
      chemin,
      sentinelle: String(a.sentinel),
    };
  }),
);

const reponsesDe = (k: number): ReponseAttendue[] => REPONSES.filter((r) => r.periode === k);

/**
 * Questions HORS TABLE. Aucune n'apparait dans la source soumise au
 * compilateur — la suite le verifie. Les deux premieres sont choisies pour etre
 * INFERABLES : une implementation permissive qui « invente une regle » (L207)
 * deduirait la seconde de la premiere.
 */
const QUESTIONS_NON_COUVERTES = [
  'capacite_du_creneau_s2',
  'delai_minimal_avant_annulation_minutes',
  'tarif_de_la_reservation_en_micro_usd',
] as const;

/** 24 h en minutes : la valeur qu'une implementation inventerait. */
const DELAI_HEURES = Number(refValue(RESERVATION, 'valeurs.P3.delai_heures.valeur'));
const MINUTES_INVENTEES = String(DELAI_HEURES * 60);

/* ──────────────── les jeux d'exigences actives attendus, periode par periode */

/** F-QUALITY l.109 : les exigences actives dues de la periode k, telles quelles. */
const ACTIVES_F_QUALITY = (k: number): string[] =>
  (refValue(QUALITY, `valeurs.entrees_exactes_de_Q.P${k}.actives_dues`) as Json[]).map((x) =>
    String(x.id),
  );

/** F-REGRESSION l.129 : la famille `cancel` et `isolation`, avec leurs instants. */
const CANCEL_ANCIENNE = String(refValue(REGRESSION, 'valeurs.exigence_remplacee.id.valeur'));
const CANCEL_NOUVELLE = String(
  refValue(REGRESSION, 'valeurs.exigence_remplacee.remplacee_par.valeur'),
);
const P_CANCEL_ACTIVE = indiceDePeriode(
  refValue(REGRESSION, 'valeurs.exigence_remplacee.satisfaite_en.valeur'),
);
const P_REMPLACEMENT = indiceDePeriode(
  refValue(REGRESSION, 'valeurs.exigence_remplacee.remplacee_en.valeur'),
);
const ISOLATION = String(refValue(REGRESSION, 'valeurs.exigence_violee.id.valeur'));
const P_ISOLATION = indiceDePeriode(
  refValue(REGRESSION, 'valeurs.exigence_violee.satisfaite_en.valeur'),
);
/** « P4 retire B » : l'id retire et l'instant du retrait, lus dans F-QUALITY. */
const RETIREE_P4 = String(
  (refValue(QUALITY, 'valeurs.entrees_exactes_de_Q.P4.retirees') as Json[])[0]!.id,
);

/**
 * Le jeu attendu a la periode k, derive de la RACINE GELEE et d'elle seule.
 * Une exigence satisfaite a une periode y est necessairement ACTIVE : c'est la
 * seule inference faite ici, et elle est enoncee pour etre contredite si elle
 * est fausse.
 */
function attenduDepuisLaReference(k: number): string[] {
  const out = [...ACTIVES_F_QUALITY(k)];
  if (k >= P_CANCEL_ACTIVE && k < P_REMPLACEMENT) out.push(CANCEL_ANCIENNE);
  if (k >= P_REMPLACEMENT) out.push(CANCEL_NOUVELLE);
  if (k >= P_ISOLATION) out.push(ISOLATION);
  return [...out].sort();
}

/**
 * Le meme jeu, derive cette fois de ce que la FIXTURE declare : revelation par
 * periode, `replaces` porte par la nouvelle version, `requirement_withdrawals`
 * porte par la periode du retrait. Les deux derivations doivent coincider —
 * sinon la fixture ne dit pas ce que la racine gelee dit, et c'est elle qui est
 * fautive.
 */
function attenduDepuisLaFixture(k: number): string[] {
  const actives = new Set<string>();
  for (let j = 1; j <= k; j += 1) {
    const p = periodeDe(j);
    for (const r of p.requirements as Json[]) {
      actives.add(String(r.key));
      const remplacee = r.replaces;
      if (typeof remplacee === 'string') actives.delete(remplacee);
    }
    for (const retiree of p.requirement_withdrawals as string[]) actives.delete(retiree);
  }
  return [...actives].sort();
}

/* ──────────────────────────────────────────── chargement du paquet teste */

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
  compileScenarioPack: [
    'compileScenarioPack',
    'compileScenario',
    'compilePack',
    'buildScenarioPack',
    'compileScenarioSource',
    'scenarioPack',
    'compile',
  ],
  revealPeriod: [
    'revealPeriod',
    'reveal',
    'revealForPeriod',
    'availableView',
    'agentInputs',
    'releaseForPeriod',
    'disclosePeriod',
    'vueDisponible',
  ],
  answerCustomerQuestion: [
    'answerCustomerQuestion',
    'answerQuestion',
    'askCustomer',
    'customerAnswer',
    'lookupCustomerAnswer',
    'answer',
    'repondreQuestionClient',
  ],
  activeRequirements: [
    'activeRequirements',
    'requirementsAt',
    'activeRequirementVersions',
    'resolveRequirements',
    'requirementsForPeriod',
    'exigencesActives',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

/**
 * Resolution par role. NE LEVE PAS : un role introuvable doit produire une
 * ASSERTION rouge qui nomme le contrat manquant, pas une exception que le
 * rapport confondrait avec un plantage. C'est `assertContrat()` qui porte
 * l'assertion, et elle est la DEUXIEME de chaque cas.
 */
function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role]!;
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
          manquants.map((r) => `${r}:[${ROLES[r]!.join('|')}]`).join(' ; ') +
          ` (${String(LOADED.exportCount)} exports de premier niveau observes dans ` +
          `${LOADED.via.join(', ') || 'aucun paquet'})`,
  ).toBe('contrat-resolu');
}

/* ───────────────────────────────────── lecture d'un appel, refus compris */

interface Issue {
  refuse: boolean;
  via: string;
  texte: string;
  valeur: unknown;
}

/** Un appel, et ce qu'il a rendu — refus LEVE ou refus RENDU, indistinctement. */
async function appeler(role: string, args: unknown[]): Promise<Issue> {
  const f = resolveOpt(role);
  if (f === null) {
    return { refuse: true, via: 'contrat', texte: `ROLE-NON-RESOLU ${role}`, valeur: undefined };
  }
  let brut: unknown;
  try {
    brut = await Promise.resolve(f(...args));
  } catch (e) {
    return { refuse: true, via: 'exception', texte: `LEVE ${rendu(e)}`, valeur: e };
  }
  const texte = rendu(brut);
  if (brut === null || brut === undefined) {
    return { refuse: true, via: 'nullish', texte: `RENDU-VIDE ${texte}`, valeur: brut };
  }
  if (typeof brut === 'object' && !Array.isArray(brut)) {
    const o = brut as Json;
    for (const drapeau of ['ok', 'valid', 'valide', 'success', 'accepted', 'released']) {
      if (o[drapeau] === false) {
        return { refuse: true, via: `${drapeau}=false`, texte, valeur: brut };
      }
    }
    for (const cle of ['errors', 'issues', 'problems', 'erreurs', 'violations']) {
      const v = o[cle];
      if (Array.isArray(v) && v.length > 0) {
        return { refuse: true, via: `${cle}[${String(v.length)}]`, texte, valeur: brut };
      }
    }
  }
  // Un code du cahier dans le rendu vaut refus, quel que soit le champ qui le
  // porte : `{code:'UNSPECIFIED'}` est un refus, pas une reponse.
  if (codesDe(texte).length > 0) {
    return { refuse: true, via: `code:${codesDe(texte).join('+')}`, texte, valeur: brut };
  }
  return { refuse: false, via: 'valeur', texte, valeur: brut };
}

/**
 * Le pack, degage de son eventuelle enveloppe de compilation. Une compilation
 * peut rendre le pack directement, ou sous une cle ; les deux formes sont
 * acceptees, et rien d'autre n'est suppose de sa structure.
 */
function packDe(v: unknown): unknown {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  for (const cle of ['pack', 'scenario_pack', 'scenarioPack', 'compiled', 'result', 'value']) {
    const sous = (v as Json)[cle];
    if (sous !== null && sous !== undefined && typeof sous === 'object') return sous;
  }
  return v;
}

const compiler = (source: Json): Promise<Issue> => appeler('compileScenarioPack', [source]);

const reveler = (pack: unknown, cible: number, curseur?: number): Promise<Issue> =>
  appeler('revealPeriod', curseur === undefined ? [pack, cible] : [pack, cible, curseur]);

const repondre = (pack: unknown, periode: number, question: string): Promise<Issue> =>
  appeler('answerCustomerQuestion', [pack, periode, question]);

const actives = (pack: unknown, periode: number): Promise<Issue> =>
  appeler('activeRequirements', [pack, periode]);

/** Un appel accepte : il n'a pas refuse. Rend sa valeur. */
function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(issue.refuse ? `REFUS-INATTENDU ${quoi} : ${issue.texte.slice(0, 400)}` : 'accepte').toBe(
    'accepte',
  );
  return issue.valeur;
}

/** Un appel refuse, AVEC le code attendu et lui seul. */
function exigerRefuse(issue: Issue, code: string, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${issue.texte.slice(0, 400)}`).toBe(
    'refuse',
  );
  expect(
    codesDe(issue.texte).length > 0
      ? codesDe(issue.texte)
      : [`CODE-ABSENT ${quoi} : ${issue.texte.slice(0, 400)}`],
  ).toEqual([code]);
}

/** La reponse portee par une valeur de succes, quel que soit le champ qui la porte. */
function reponseDe(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v === null || typeof v !== 'object') return null;
  const portes: Json[] = [v as Json];
  for (const cle of ['answer', 'reponse', 'result', 'data', 'payload', 'value']) {
    const sous = (v as Json)[cle];
    if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) portes.push(sous as Json);
  }
  for (const porte of portes) {
    for (const k of ['answer', 'reponse', 'value', 'valeur', 'text', 'texte', 'contenu']) {
      const x = porte[k];
      if (typeof x === 'string') return x;
      if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    }
  }
  return null;
}

/** Les cles d'exigence portees par un resultat, quelle que soit leur forme. */
function clesExigences(v: unknown): string[] {
  const liste = ((): unknown[] => {
    if (Array.isArray(v)) return v;
    if (v instanceof Set) return [...v];
    if (v instanceof Map) return [...v.values()];
    if (v !== null && typeof v === 'object') {
      for (const cle of ['requirements', 'active', 'actives', 'exigences', 'items', 'versions']) {
        const sous = (v as Json)[cle];
        if (Array.isArray(sous)) return sous;
        if (sous instanceof Set) return [...sous];
        if (sous instanceof Map) return [...sous.values()];
      }
    }
    return [];
  })();
  const out: string[] = [];
  for (const x of liste) {
    if (typeof x === 'string') {
      out.push(x);
      continue;
    }
    if (x === null || typeof x !== 'object') continue;
    const o = x as Json;
    const cle = o.key ?? o.cle;
    if (typeof cle === 'string') {
      out.push(cle);
      continue;
    }
    const id = o.requirement_id ?? o.requirementId ?? o.id;
    const version = o.version;
    if (typeof id === 'string' && (typeof version === 'number' || typeof version === 'string')) {
      out.push(`${id}@${String(version)}`);
    } else if (typeof id === 'string') {
      out.push(id);
    }
  }
  return [...new Set(out)].sort();
}

/* ══════════════════════════════════════════════════════════════════════ */

describe('T06 — compilation des scenarios et controle de leur revelation', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T06.A1 une sentinelle d evenement futur ne figure jamais dans les entrees de l agent',
    async () => {
      assertLoaded();
      assertContrat('compileScenarioPack', 'revealPeriod');

      // (0) LA SOURCE EST BIEN CELLE QUE LE CAHIER DECRIT : quatre periodes, et
      //     une sentinelle DISTINCTE par evenement. Sans ce controle, « ne
      //     figure jamais » ne serait rattache a rien d'observable.
      expect(PERIODES.length).toBe(NB_PERIODES); // cahier:L209
      expect(SAIN.period_count).toBe(NB_PERIODES); // cahier:L209
      const toutes = Object.values(SENTINELLES).flat();
      expect(toutes.length).toBeGreaterThan(NB_PERIODES);
      expect(new Set(toutes).size).toBe(toutes.length); // sentinelles deux a deux distinctes
      expect(
        toutes.filter((s) => !/^SENTINELLE-T06-P[1-4]-[A-Z]+(-\d+)?-[0-9a-f]{16}$/.test(s)),
      ).toEqual([]);

      // (1) le pack des quatre periodes est COMPILABLE.
      const pack = packDe(exigerAccepte(await compiler(SAIN), 'pack reservation 4 periodes')); // cahier:L209

      // (2) CONTROLE POSITIF, sans lequel l'absence serait triviale : la
      //     revelation de la periode k PORTE les sentinelles de ses propres
      //     evenements. Une revelation vide — ou un programme mort — fait
      //     tomber cette assertion.
      const manquantes: string[] = [];
      const vues: Record<number, string> = {};
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        const issue = await reveler(pack, k);
        vues[k] = rendu(exigerAccepte(issue, `revelation de la periode ${String(k)}`));
        for (const s of SENTINELLES_EVENEMENT[k]!) {
          if (!vues[k]!.includes(s)) manquantes.push(`P${String(k)} n a pas revele ${s}`);
        }
      }
      expect(manquantes).toEqual([]); // cahier:L63

      // (3) L'ENONCE DU CAS. Aucune sentinelle d'une periode POSTERIEURE ne
      //     figure dans les entrees remises a l'agent.
      const fuites: string[] = [];
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        for (let j = k + 1; j <= NB_PERIODES; j += 1) {
          for (const s of SENTINELLES[j]!) {
            if (vues[k]!.includes(s)) {
              fuites.push(`la revelation de P${String(k)} porte la sentinelle de P${String(j)} ${s}`);
            }
          }
        }
      }
      expect(fuites).toEqual([]); // cahier:L207

      // (4) LA MEME CHOSE, DITE PAR LE CONTENU ET NON PAR LA SENTINELLE : une
      //     reponse client publiee en P3 — un instant metier, litteral de la
      //     racine gelee, assez long pour ne pas apparaitre par hasard —
      //     n'apparait dans aucune revelation anterieure.
      const tardive = REPONSES.find((r) => r.periode >= 3 && r.attendue.length >= 16);
      expect(
        tardive === undefined
          ? 'AUCUNE-REPONSE-TARDIVE-DISTINCTIVE-DANS-LA-FIXTURE'
          : 'reponse-tardive-trouvee',
      ).toBe('reponse-tardive-trouvee');
      const valeurTardive = tardive!.attendue;
      expect(
        [1, 2].filter((k) => vues[k]!.includes(valeurTardive)).map((k) => `P${String(k)}`),
      ).toEqual([]); // cahier:L63

      console.log(
        `[T06.A1] via=${LOADED.via.join(',')} sentinelles=${String(toutes.length)} ` +
          `revelations=${Object.keys(vues).join(',')} tardive=${valeurTardive}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T06.A2 une lecture anticipee renvoie NOT_RELEASED',
    async () => {
      assertLoaded();
      assertContrat('compileScenarioPack', 'revealPeriod', 'answerCustomerQuestion');

      const pack = packDe(exigerAccepte(await compiler(SAIN), 'pack reservation 4 periodes'));

      // VOLET POSITIF D'ABORD. Le refus n'est pas une competence : une porte qui
      // refuserait TOUT satisferait l'enonce sans rien verifier. Lire une
      // periode a l'heure, ou une periode DEJA passee, doit REUSSIR.
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        exigerAccepte(await reveler(pack, k, k), `lecture a l heure de P${String(k)}`);
      }
      exigerAccepte(
        await reveler(pack, 1, NB_PERIODES),
        'relecture de P1 alors que le curseur est en P4',
      );
      const premiere = reponsesDe(1)[0]!;
      exigerAccepte(
        await repondre(pack, 1, premiere.question),
        `question ${premiere.question} posee en P1, ou elle est disponible`,
      );

      // (1) L'ENONCE DU CAS, sur la porte de revelation : toute cible
      //     POSTERIEURE au curseur est refusee, et avec le code du cahier.
      const anticipations: Array<[number, number]> = [
        [2, 1],
        [3, 1],
        [4, 1],
        [3, 2],
        [4, 3],
      ];
      for (const [cible, curseur] of anticipations) {
        const issue = await reveler(pack, cible, curseur);
        exigerRefuse(
          issue,
          CODE_NOT_RELEASED,
          `lecture de P${String(cible)} depuis P${String(curseur)}`,
        ); // cahier:L207
        // (2) LE REFUS NE FUIT PAS. Un refus qui joint le contenu demande ne
        //     protege rien : aucune sentinelle de la cible ne doit y figurer.
        expect(
          SENTINELLES[cible]!.filter((s) => issue.texte.includes(s)),
        ).toEqual([]); // cahier:L209
      }

      // (3) LA MEME PORTE, SUR LE SERVICE CLIENT. C'est le chemin que T18
      //     (l.313) declare devoir « respecter T06 » : une question COUVERTE
      //     mais publiee plus tard est refusee NOT_RELEASED — pas UNSPECIFIED,
      //     qui dirait faussement qu'elle n'existe pas.
      const tardives = REPONSES.filter((r) => r.periode >= 3);
      expect(tardives.length).toBeGreaterThan(0);
      for (const r of tardives) {
        for (const avant of [1, 2]) {
          const issue = await repondre(pack, avant, r.question);
          exigerRefuse(
            issue,
            CODE_NOT_RELEASED,
            `question ${r.question} (publiee en P${String(r.periode)}) posee en P${String(avant)}`,
          ); // cahier:L207
          // le refus ne livre ni la reponse, ni la sentinelle de l'entree
          expect(
            issue.texte.includes(r.attendue) ? `FUITE ${r.question} -> ${r.attendue}` : 'sans-fuite',
          ).toBe('sans-fuite');
          expect(issue.texte.includes(r.sentinelle) ? `FUITE-SENTINELLE ${r.question}` : 'sans-fuite').toBe(
            'sans-fuite',
          );
          expect(reponseDe(issue.valeur)).toBeNull();
        }
      }

      // (4) LA MEME QUESTION, UNE FOIS PUBLIEE, EST SERVIE. Sans ce controle,
      //     un service client qui refuse tout resterait vert.
      for (const r of tardives) {
        exigerAccepte(
          await repondre(pack, r.periode, r.question),
          `question ${r.question} posee en P${String(r.periode)}`,
        );
      }

      console.log(
        `[T06.A2] anticipations=${String(anticipations.length)} ` +
          `questions tardives=${tardives.map((r) => r.question).join(',')}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T06.A3 une question connue produit la reponse disponible exacte',
    async () => {
      assertLoaded();
      assertContrat('compileScenarioPack', 'answerCustomerQuestion');

      // (0) L'ARCHIVE EST CONFORME A LA RACINE GELEE. Chaque entree de la table
      //     porte le chemin F-RESERVATION dont elle est tiree ; la valeur
      //     attendue est RE-RESOLUE ici, jamais recopiee.
      const ecarts = PERIODES.flatMap((p) =>
        (p.customer_answers as Json[])
          .map((a) => {
            const chemin = String((a.source_reference as Json).path);
            const geleee = String(refValue(RESERVATION, chemin));
            return String(a.answer) === geleee
              ? null
              : `${String(a.question_id)} : fixture=${String(a.answer)} racine-gelee=${geleee}`;
          })
          .filter((x): x is string => x !== null),
      );
      expect(ecarts).toEqual([]); // cahier:L119
      expect(REPONSES.length).toBeGreaterThanOrEqual(NB_PERIODES);

      const pack = packDe(exigerAccepte(await compiler(SAIN), 'pack reservation 4 periodes'));

      // (1) L'ENONCE DU CAS : pour chaque question couverte et publiee, la
      //     reponse rendue est EXACTEMENT celle de la racine gelee.
      const observees: string[] = [];
      const attendues: string[] = [];
      for (const r of REPONSES) {
        const issue = await repondre(pack, r.periode, r.question);
        exigerAccepte(issue, `question ${r.question} en P${String(r.periode)}`);
        observees.push(`${r.question}=${String(reponseDe(issue.valeur))}`);
        attendues.push(`${r.question}=${r.attendue}`);
      }
      expect(observees).toEqual(attendues); // cahier:L207

      // (2) TEMOIN ANTI-CONSTANTE. Une table qui rendrait toujours la meme
      //     chaine satisferait (1) si toutes les reponses etaient egales : les
      //     valeurs attendues sont donc verifiees DISTINCTES, et le nombre de
      //     valeurs distinctes observees doit l'egaler.
      const distinctesAttendues = new Set(REPONSES.map((r) => r.attendue));
      expect(distinctesAttendues.size).toBeGreaterThan(2);
      const distinctesObservees = new Set(observees.map((o) => o.slice(o.indexOf('=') + 1)));
      expect(distinctesObservees.size).toBe(distinctesAttendues.size);

      // (3) LA REPONSE NE DEPEND PAS DE LA PERIODE OU L'ON DEMANDE, DES LORS
      //     QU'ELLE EST PUBLIEE : une question de P1 rend la meme valeur en P4.
      for (const r of reponsesDe(1)) {
        const tard = await repondre(pack, NB_PERIODES, r.question);
        exigerAccepte(tard, `question ${r.question} relue en P${String(NB_PERIODES)}`);
        expect(reponseDe(tard.valeur)).toBe(r.attendue);
      }

      // (4) LA TABLE EST PURE. Deux lectures de la meme question rendent la
      //     meme chaine, et une SECONDE compilation des memes octets rend la
      //     meme table — sans quoi « la reponse disponible exacte » designerait
      //     une valeur qui depend du moment ou on la demande.
      const packBis = packDe(exigerAccepte(await compiler(clone(SAIN)), 'recompilation'));
      const relues: string[] = [];
      const reluesBis: string[] = [];
      for (const r of REPONSES) {
        const encore = await repondre(pack, r.periode, r.question);
        const surBis = await repondre(packBis, r.periode, r.question);
        exigerAccepte(encore, `relecture de ${r.question}`);
        exigerAccepte(surBis, `${r.question} sur le pack recompile`);
        relues.push(`${r.question}=${String(reponseDe(encore.valeur))}`);
        reluesBis.push(`${r.question}=${String(reponseDe(surBis.valeur))}`);
      }
      expect(relues).toEqual(attendues);
      expect(reluesBis).toEqual(attendues);

      console.log(`[T06.A3] ${observees.join(' | ')}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T06.A4 une question non couverte donne UNSPECIFIED sans inventer de regle',
    async () => {
      assertLoaded();
      assertContrat('compileScenarioPack', 'answerCustomerQuestion');

      // (0) LES QUESTIONS SONDEES SONT BIEN HORS TABLE — sinon le refus
      //     mesurerait autre chose que la couverture.
      const couvertes = new Set(REPONSES.map((r) => r.question));
      expect(QUESTIONS_NON_COUVERTES.filter((q) => couvertes.has(q))).toEqual([]);
      const source = rendu(SAIN);
      expect(QUESTIONS_NON_COUVERTES.filter((q) => source.includes(q))).toEqual([]);

      const pack = packDe(exigerAccepte(await compiler(SAIN), 'pack reservation 4 periodes'));

      // VOLET POSITIF. Une question COUVERTE et publiee doit etre SERVIE : une
      // table qui repondrait UNSPECIFIED a tout satisferait l'enonce sans rien
      // verifier. Ce volet observe qu'une reponse existe, pas laquelle —
      // l'exactitude est l'objet d'A3, et la lui emprunter ferait tuer ce cas
      // par un mutant qui n'a rien a voir avec la couverture.
      for (const r of reponsesDe(1)) {
        const issue = await repondre(pack, 1, r.question);
        exigerAccepte(issue, `question couverte ${r.question}`);
        expect(
          typeof reponseDe(issue.valeur) === 'string'
            ? 'servie'
            : `SANS-REPONSE ${r.question} : ${issue.texte.slice(0, 200)}`,
        ).toBe('servie');
      }

      // (1) L'ENONCE DU CAS. Une question hors table donne UNSPECIFIED — et non
      //     NOT_RELEASED, qui pretendrait a tort qu'elle existe et attend son
      //     tour. Le controle vaut a TOUTES les periodes : ce n'est pas une
      //     affaire de calendrier.
      for (const q of QUESTIONS_NON_COUVERTES) {
        for (let k = 1; k <= NB_PERIODES; k += 1) {
          const issue = await repondre(pack, k, q);
          exigerRefuse(issue, CODE_UNSPECIFIED, `question hors table ${q} en P${String(k)}`); // cahier:L207

          // (2) « SANS INVENTER DE REGLE » : le refus ne porte AUCUNE reponse.
          expect(reponseDe(issue.valeur)).toBeNull(); // cahier:L207

          // (3) et il n'infere pas la valeur plausible depuis une entree
          //     voisine : 24 h ne devient pas 1440 minutes.
          expect(
            issue.texte.includes(MINUTES_INVENTEES)
              ? `REGLE-INVENTEE ${q} -> ${MINUTES_INVENTEES}`
              : 'sans-invention',
          ).toBe('sans-invention'); // cahier:L207
          const plausibles = REPONSES.filter((r) => r.periode <= k).map((r) => r.attendue);
          expect(
            plausibles.filter((v) => v.length >= 6 && issue.texte.includes(v)),
          ).toEqual([]);
        }
      }

      // (4) UNE QUESTION COUVERTE MAIS NON PUBLIEE N'EST PAS « NON COUVERTE ».
      //     Les deux refus du cahier sont distincts et ne se substituent pas
      //     l'un a l'autre — c'est ce qu'un code unique ferait tomber.
      const tardive = REPONSES.find((r) => r.periode >= 3)!;
      const anticipee = await repondre(pack, 1, tardive.question);
      exigerRefuse(anticipee, CODE_NOT_RELEASED, `question ${tardive.question} posee trop tot`); // cahier:L207

      console.log(
        `[T06.A4] hors table=${QUESTIONS_NON_COUVERTES.join(',')} ` +
          `inference interdite=${MINUTES_INVENTEES}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T06.A5 une dependance cyclique ou vers un evenement inexistant est rejetee',
    async () => {
      assertLoaded();
      assertContrat('compileScenarioPack');

      // VOLET POSITIF. Le pack sain compile : sans cela, « rejete » ne
      // distinguerait pas un validateur d'un programme qui refuse tout.
      exigerAccepte(await compiler(SAIN), 'pack sain'); // cahier:L209

      // (0) LES DEUX VARIANTES NE DIFFERENT DU PACK SAIN QUE PAR LE DEFAUT
      //     NOMME. On le prouve en les REPARANT : la reparation doit rendre un
      //     document identique, au sens de l'egalite profonde.
      const cycleRepare = clone(CYCLE);
      const evtsP3 = (cycleRepare.periods as Json[])[2]!.events as Json[];
      const idExacte = 'EVT-P3-PROBE-FRONTIERE-EXACTE';
      const idPlus1ms = 'EVT-P3-PROBE-FRONTIERE-PLUS-1MS';
      const exacte = evtsP3.find((e) => e.event_id === idExacte)!;
      const plus1ms = evtsP3.find((e) => e.event_id === idPlus1ms)!;
      expect((exacte.depends_on as string[]).includes(idPlus1ms)).toBe(true);
      expect((plus1ms.depends_on as string[]).includes(idExacte)).toBe(true);
      exacte.depends_on = (exacte.depends_on as string[]).filter((d) => d !== idPlus1ms);
      plus1ms.depends_on = (plus1ms.depends_on as string[]).filter((d) => d !== idExacte);
      expect(cycleRepare).toEqual(SAIN);

      const ID_PENDANT = 'EVT-INEXISTANT-T06';
      const pendanteReparee = clone(PENDANTE);
      const migration = ((pendanteReparee.periods as Json[])[3]!.events as Json[]).find(
        (e) => e.event_id === 'EVT-P4-MIGRATION-LEGACY',
      )!;
      expect((migration.depends_on as string[]).includes(ID_PENDANT)).toBe(true);
      const tousLesIds = new Set(
        (SAIN.periods as Json[]).flatMap((p) =>
          (p.events as Json[]).map((e) => String(e.event_id)),
        ),
      );
      expect(tousLesIds.has(ID_PENDANT)).toBe(false);
      migration.depends_on = (migration.depends_on as string[]).filter((d) => d !== ID_PENDANT);
      expect(pendanteReparee).toEqual(SAIN);

      // (1) L'ENONCE DU CAS, premiere moitie : LE CYCLE est rejete, et le refus
      //     NOMME les deux evenements qui le forment. Un refus muet ne dit pas
      //     ce qu'il a vu.
      const issueCycle = await compiler(CYCLE);
      expect(
        issueCycle.refuse ? 'refuse' : `ACCEPTE-A-TORT cycle : ${issueCycle.texte.slice(0, 400)}`,
      ).toBe('refuse'); // cahier:L207
      expect(
        [idExacte, idPlus1ms].filter((id) => !issueCycle.texte.includes(id)),
      ).toEqual([]);

      // (2) seconde moitie : LA DEPENDANCE PENDANTE est rejetee, et le refus
      //     nomme l'evenement inexistant.
      const issuePendante = await compiler(PENDANTE);
      expect(
        issuePendante.refuse
          ? 'refuse'
          : `ACCEPTE-A-TORT dependance pendante : ${issuePendante.texte.slice(0, 400)}`,
      ).toBe('refuse'); // cahier:L207
      expect(
        issuePendante.texte.includes(ID_PENDANT)
          ? 'nomme'
          : `REFUS-MUET ${issuePendante.texte.slice(0, 400)}`,
      ).toBe('nomme');

      // (3) LE REFUS TIENT AU DEFAUT, ET A RIEN D'AUTRE : les deux reparations
      //     compilent. Sans ce controle, (1) et (2) seraient satisfaits par un
      //     compilateur qui refuse tout document qu'il n'a pas deja vu.
      exigerAccepte(await compiler(cycleRepare), 'variante cycle reparee');
      exigerAccepte(await compiler(pendanteReparee), 'variante pendante reparee');

      // (4) UN CYCLE D'UN SEUL ARC — un evenement qui se depend de lui-meme —
      //     est la forme degeneree du meme defaut, et tombe aussi.
      const autoCycle = clone(SAIN);
      const premier = ((autoCycle.periods as Json[])[0]!.events as Json[])[0]!;
      premier.depends_on = [String(premier.event_id)];
      const issueAuto = await compiler(autoCycle);
      expect(
        issueAuto.refuse ? 'refuse' : `ACCEPTE-A-TORT auto-cycle : ${issueAuto.texte.slice(0, 400)}`,
      ).toBe('refuse'); // cahier:L207

      console.log(
        `[T06.A5] cycle=${issueCycle.via} pendante=${issuePendante.via} auto=${issueAuto.via}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T06.A6 remplacer une exigence desactive la bonne version au bon instant',
    async () => {
      assertLoaded();
      assertContrat('compileScenarioPack', 'activeRequirements');

      // (0) LES DEUX DERIVATIONS DU JEU ATTENDU COINCIDENT — celle de la racine
      //     gelee (F-QUALITY l.109 et F-REGRESSION l.129) et celle de la source
      //     soumise au compilateur. Si elles divergent, c'est la fixture qui est
      //     fautive, et le message le dit avant toute assertion sur
      //     l'implementation.
      const reference: string[][] = [];
      const fixture: string[][] = [];
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        reference.push(attenduDepuisLaReference(k));
        fixture.push(attenduDepuisLaFixture(k));
      }
      expect(fixture).toEqual(reference); // cahier:L109 cahier:L129

      // (1) les instants de bascule sont bien ceux de la racine gelee : le
      //     remplacement a lieu en P3, le retrait en P4.
      expect([CANCEL_ANCIENNE, CANCEL_NOUVELLE, ISOLATION]).toEqual([
        'cancel@1',
        'cancel@2',
        'isolation@1',
      ]); // cahier:L129
      expect([P_CANCEL_ACTIVE, P_REMPLACEMENT, P_ISOLATION]).toEqual([2, 3, 3]); // cahier:L129
      // « P4 retire B » (cahier:L109) : la racine gelee transcrit l'id retire
      // avec sa version active. On epingle cette transcription, parce que toutes
      // les assertions de retrait ci-dessous s'y appuient.
      expect(RETIREE_P4).toBe('B@1');

      const pack = packDe(exigerAccepte(await compiler(SAIN), 'pack reservation 4 periodes'));

      // (2) L'ENONCE DU CAS : a chaque periode, le jeu des versions actives est
      //     EXACTEMENT celui que la racine gelee prescrit. Decaler d'une periode
      //     l'instant de bascule change au moins un de ces quatre jeux ;
      //     desactiver la version de remplacement au lieu de l'ancienne aussi.
      const observes: string[][] = [];
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        const issue = await actives(pack, k);
        exigerAccepte(issue, `exigences actives en P${String(k)}`);
        observes.push(clesExigences(issue.valeur));
      }
      expect(observes).toEqual(reference); // cahier:L207

      // (3) LE REMPLACEMENT, DIT DANS LES DEUX SENS. L'ancienne version est
      //     active AVANT et absente APRES ; la nouvelle, l'inverse. Une seule
      //     des deux moities survivrait a une inversion.
      const avant = observes[P_REMPLACEMENT - 2]!;
      const apres = observes[P_REMPLACEMENT - 1]!;
      expect([
        avant.includes(CANCEL_ANCIENNE),
        avant.includes(CANCEL_NOUVELLE),
        apres.includes(CANCEL_ANCIENNE),
        apres.includes(CANCEL_NOUVELLE),
      ]).toEqual([true, false, false, true]); // cahier:L129

      // le meme remplacement, sur l'autre famille attestee par la racine gelee
      const A_ANCIENNE = String(
        (refValue(QUALITY, 'valeurs.entrees_exactes_de_Q.P3.retirees') as Json[])[0]!.id,
      );
      const A_NOUVELLE = String(
        (refValue(QUALITY, 'valeurs.entrees_exactes_de_Q.P3.actives_dues') as Json[])[0]!.id,
      );
      expect([A_ANCIENNE, A_NOUVELLE]).toEqual(['A@1', 'A@2']); // cahier:L109
      expect([
        observes[1]!.includes(A_ANCIENNE),
        observes[1]!.includes(A_NOUVELLE),
        observes[2]!.includes(A_ANCIENNE),
        observes[2]!.includes(A_NOUVELLE),
      ]).toEqual([true, false, false, true]); // cahier:L109

      // (4) LE RETRAIT N'EST PAS UN REMPLACEMENT : « P4 retire B » desactive
      //     B@1 sans lui substituer quoi que ce soit.
      expect([observes[2]!.includes(RETIREE_P4), observes[3]!.includes(RETIREE_P4)]).toEqual([
        true,
        false,
      ]); // cahier:L109
      expect(observes[3]!.filter((c) => c.startsWith('B@'))).toEqual([]);

      // (5) TEMOIN ANTI-CONSTANTE. Un resolveur qui rendrait toujours le meme
      //     jeu satisferait (3) et (4) si les quatre jeux etaient egaux : ils
      //     sont donc verifies deux a deux distincts, cote attendu ET cote
      //     observe.
      expect(new Set(reference.map((j) => j.join('|'))).size).toBe(NB_PERIODES);
      expect(new Set(observes.map((j) => j.join('|'))).size).toBe(NB_PERIODES);

      console.log(
        `[T06.A6] ` +
          observes.map((j, i) => `P${String(i + 1)}={${j.join(',')}}`).join(' '),
      );
    },
    CASE_TIMEOUT_MS,
  );
});
