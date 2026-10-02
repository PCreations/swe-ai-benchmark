/**
 * acceptance/T29.spec.ts — suite d'acceptation de la tache T29.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T29.A1 behaviour — une reponse modele ENREGISTREE produit un pack
 *                      COMPILABLE et QUALIFIE
 *   T29.A2 refusal   — une source citee mais absente du paquet disponible
 *                      donne `SOURCE_UNVERIFIED`
 *   T29.A3 refusal   — un cycle, une regle hors DSL ou une contradiction avec
 *                      l'oracle mene a la QUARANTAINE
 *   T29.A4 absence   — les regles des periodes FUTURES sont absentes du
 *                      paquet de revelation COURANT
 *   T29.A5 behaviour — refaire la compilation des memes octets donne le
 *                      MEME hash
 *   T29.A6 refusal   — une sortie stochastique rejetee peut etre regeneree,
 *                      mais PAS indefiniment ; tentatives et couts sont
 *                      enregistres
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T29 — `packages/scenario`,
 * `packages/agents`, `fixtures` — et ne les a lus ni directement ni par
 * `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, pas une barriere technique). Le contrat teste ci-dessous est derive
 * de docs/specs/T29.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle :
 *
 *   L405  titre : « Automatiser la fabrique de scenarios sans
 *         auto-certification libre »
 *   L407  dependances T06, T07, T10, T17, T28 ; livrables MOT POUR MOT :
 *         « generateur de scenarios via modele, parser de source, DSL
 *         metier borne et qualification automatique »
 *   L409  travail : « premiere version limitee au DSL reservation et
 *         VARIANTES COMPATIBLES AVEC LES TRANSITIONS DE L'ORACLE. L'IA
 *         choisit besoins, textes, parametres et ordre admissible ; elle ne
 *         remplace pas arbitrairement le moteur de verite. [...] Les
 *         documents historiques sont fournis par paquets EXPLICITEMENT
 *         DISPONIBLES, pas recuperes dans des comptes prives supposes
 *         accessibles. » — « transitions de l'oracle » ancre le DSL dans le
 *         schema DEJA PROUVE de T10 (reserve/cancel, slots, steps), pas dans
 *         le schema de revelation de T06 (qui ne touche jamais l'oracle) ;
 *         « paquets explicitement disponibles » fonde A2 ; « elle ne
 *         remplace pas arbitrairement le moteur de verite » est le TITRE
 *         fait assertion : A1 et A3 exigent une QUALIFICATION INDEPENDANTE,
 *         rejouee par cette suite via le contrat DEJA VALIDE de T10, jamais
 *         un champ que T29 se contenterait de s'auto-attribuer.
 *   L411  les six cas d'acceptation, mot pour mot — dont le SEUL code
 *         explicite, `SOURCE_UNVERIFIED`.
 *   L413  fin : « la generation est automatisee et bornee, sa provenance
 *         reste synthetique ou hybride selon les sources. Un grand nombre de
 *         variantes de reservation ne vaut pas plusieurs familles metier
 *         independantes. » — fonde A6 (bornee) et le choix de ne JAMAIS
 *         produire plus d'une famille a partir des memes transitions.
 *   L15   « les appels de developpement et de generation passent par des
 *         interfaces SUBSTITUABLES [...] deterministes » et « les tests
 *         ordinaires n'appellent aucun fournisseur externe » — fonde
 *         `draw_model_response`, fourni par la suite, jamais un reseau reel.
 *   L63   invariant D-2, deja exploite par T06 (acceptance/T06.spec.ts,
 *         A1) : une revelation de periode k ne contient ni besoins ni
 *         regles de k+1 — meme invariant, applique ici a la revelation que
 *         T29 remet au MODELE pendant la generation (A4), pas a celle que
 *         T06 remet au CANDIDAT.
 *   L82   « les empreintes utilisent SHA-256 sur des octets canoniques
 *         [...] objets JSON tries recursivement par cle [...] aucun
 *         horodatage technique ajoute a un objet metier deterministe » —
 *         fonde A5.
 *   L110  invariant D-9 : « les depenses utilisent des entiers exacts,
 *         jamais une addition de flottants monetaires » — fonde le format
 *         chaine-d'entier du cout cumule d'A6.
 *   L119, L123  F-RESERVATION : creneau S1 de capacite 1, acteurs A/B/C,
 *         locataire `legacy`, horloge P1 — deja le socle de
 *         acceptance/T10.spec.ts ; cette suite le re-derive independamment
 *         de la meme racine gelee, jamais en import du code source d'une
 *         autre suite.
 *   L147  « une dependance signifie un contrat deja valide » — fonde le
 *         chargement SEPARE de `packages/evaluation` (T10) pour rejouer
 *         `qualifyScenario` sur la sortie de T29, exactement comme
 *         acceptance/T10.spec.ts rejoue `listWitnesses` de T09.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des trois sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/F-RESERVATION.json` — racine
 *       gelee, docs/FROZEN_ROOTS.json : les acteurs, le creneau `S1` et sa
 *       capacite 1, le locataire `legacy`, l'horloge de P1. C'est ce qui
 *       rend un scenario DSL COHERENT ou CONTRADICTOIRE : la contradiction
 *       d'A3 et A6 est construite en INVERSANT l'issue attendue de la racine
 *       gelee (« demande concurrente de B rejetee sans surbooking »,
 *       L119), jamais en inventant une valeur metier.
 *   (b) un commentaire `// cahier:L<n>` resoluble par
 *       `sed -n '<n>p' docs/cahier.md` — un seul litteral dans ce cas :
 *       `SOURCE_UNVERIFIED` (L411).
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE —
 * les identifiants de scenario et de regle, les sources citees, le cout par
 * tentative, le nombre maximal de tentatives — sont des ENTREES qu'elle
 * construit elle-meme, jamais des valeurs attendues comparees a un litteral
 * du cahier.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T29 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Aucun de ces noms, schemas ou conventions d'appel n'existe dans le cahier :
 * ils sont la CONVENTION que cette suite publie, au meme titre que
 * `bench.qualification.scenario/1` pour T10 (acceptance/T10.spec.ts,
 * section III) — dont cette suite REUTILISE d'ailleurs le schema tel quel
 * pour le champ `scenario` ci-dessous, puisque L409 ancre le DSL dans « les
 * transitions de l'oracle ». Un desaccord de vocabulaire entre cette
 * convention et l'implementation produit une ASSERTION rouge qui nomme le
 * role manquant — jamais un import casse, que verification/runner/red.mjs
 * classe MODULE_NOT_FOUND et refuse comme preuve.
 *
 *   generateScenarioFromModel(request)   generateur + parser + DSL + qualif. (L407)
 *   buildRevelationPackage(input)        paquet de revelation du generateur  (L409, L63)
 *
 * Roles DEJA VALIDES, charges SEPAREMENT depuis `packages/evaluation` (T10,
 * contrat fixe par acceptance/T10.spec.ts, section III) et rejoues ici pour
 * ne jamais faire confiance a la seule auto-declaration de T29 :
 *
 *   qualifyScenario(scenario)            pipeline de qualification de T10
 *
 * SIX CONVENTIONS QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC FIXEES ICI
 * (reprises telles quelles dans verification/mutants/T29.json) :
 *
 *   1. DOCUMENT DSL — `bench.scenario.dsl/1`, le texte que le modele ECRIT
 *      (`model_response.text`, serialise JSON) :
 *        { schema, scenario_id, tenant, business_clock,
 *          slots: [{ slot_id, capacity, starts_at }],
 *          rules: [{ rule_id, at, operation, actor, slot, sequence,
 *                    expect: { outcome }, depends_on: [rule_id] }] }
 *      `operation` DOIT valoir `reserve` ou `cancel` (vocabulaire deja fixe
 *      par T10, III.4) ; toute autre valeur est une regle HORS DSL (A3).
 *      `depends_on` ordonne les regles ; un circuit est un CYCLE (A3).
 *
 *   2. REQUETE DE GENERATION — `bench.scenario.generation.request/1` :
 *        { schema, draw_model_response: () => ModelResponse | undefined,
 *          available_sources: string[], max_attempts, cost_per_attempt_micro_usd }
 *      `draw_model_response` est FOURNI PAR LA SUITE (L15, substituable) et
 *      PEUT etre appele plusieurs fois : une sortie REJETEE peut en tirer une
 *      autre, jusqu'a `max_attempts` fois et PAS AU-DELA (A6).
 *      `ModelResponse` = `{ text: string, cited_sources: string[] }`.
 *
 *   3. PACK EN SORTIE, SUCCES. Objet portant au moins (a plat, ou sous
 *      `pack`/`result`/`value`) :
 *        ok: true (alias success/accepted)
 *        scenario                 — EXACTEMENT `bench.qualification.scenario/1`
 *                                    (schema, scenario_id, tenant,
 *                                    business_clock, slots, steps), relu TEL
 *                                    QUEL par `qualifyScenario` (point 5).
 *        qualification            — le rapport que T29 a lui-meme obtenu
 *        manifest_hash             — hex sha256 (64 caracteres) des octets
 *                                    canoniques du DOCUMENT DSL ACCEPTE (L82)
 *        attempts                  — entier, nombre de tirages consommes
 *        total_cost_micro_usd      — chaine d'entier (L110)
 *      `steps[i]` reprend `rule_id`->`step_id`, `at`, `operation`, `actor`,
 *      `slot`, `sequence`, `expect` de la regle DSL correspondante, sans
 *      `depends_on` (consomme a la compilation, pas transmis a l'oracle).
 *
 *   4. REFUS. Un appel refuse en LEVANT ou en RENDANT (`ok:false`, alias
 *      `success:false`/`accepted:false`) : le cahier prescrit un rejet, pas
 *      un mecanisme.
 *        SOURCE CITEE ABSENTE (A2) : le rendu TEXTUEL complet du refus
 *          contient `SOURCE_UNVERIFIED` (L411) et nomme la source manquante.
 *        QUARANTAINE (A3) : `quarantined: true` (alias `quarantine`,
 *          `in_quarantine`) et un `reason` non vide qui NOMME la regle
 *          fautive ; le rendu textuel contient un mot-cle reconnaissable de
 *          la famille de defaut (`cycle`, `dsl`/`operation` pour « hors
 *          DSL », `contradict`/`contradi` pour la contradiction) — tolerance
 *          de NOMMAGE, jamais de comportement, au meme titre que les
 *          `FAUTES` de T10 (acceptance/T10.spec.ts, section III.3).
 *        TENTATIVES EPUISEES (A6) : `ok:false`, `attempts` egal a
 *          `max_attempts` pile (ni plus, ni moins) et `total_cost_micro_usd`
 *          coherent (point 6).
 *
 *   5. QUALIFICATION INDEPENDANTE (A1, A3 contradiction, A6). Cette suite ne
 *      fait JAMAIS confiance au seul champ `qualification` de T29 : elle
 *      extrait `scenario` du pack rendu et le soumet A NOUVEAU au
 *      `qualifyScenario` DEJA PROUVE de T10 (L147). Un pack qui se
 *      pretendrait qualifie sans que l'oracle independant en convienne est
 *      exactement l'« auto-certification libre » que le TITRE de T29
 *      interdit.
 *
 *   6. COMPTABILITE DES TENTATIVES ET DU COUT (A6). `total_cost_micro_usd`
 *      doit valoir EXACTEMENT `cost_per_attempt_micro_usd * attempts`, en
 *      arithmetique ENTIERE (`BigInt`, jamais `Number`, L110). `attempts`
 *      est en outre verifie contre le nombre de FOIS ou `draw_model_response`
 *      a ete reellement appele — son propre compteur, jamais un champ du
 *      rapport seul (meme danger que T10.A4, acceptance/T10.spec.ts, IV.4).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T29.
 *
 * (1) L'AUTO-CERTIFICATION LIBRE (A1, A3, A6). C'est le titre meme de la
 *     tache : un generateur qui s'auto-declare « qualifie » sans que
 *     l'oracle independant de T10 en convienne satisferait A1 sur un champ
 *     vide de sens. D'ou le point III.5 : CHAQUE succes est reverifie par un
 *     second appel, independant, a `qualifyScenario`.
 *
 * (2) LE REFUS QUI NE PROUVE RIEN (A2, A3, A6, classes `refusal`). Un
 *     generateur qui refuse TOUT serait vert sur A2 (toute citation serait
 *     « non verifiee ») et sur A3 (tout DSL serait « en quarantaine »).
 *     Chacun porte donc son VOLET POSITIF, DANS LE MEME cas : A2 exige
 *     qu'ajouter la source manquante a `available_sources`, et RIEN
 *     D'AUTRE, fasse REUSSIR le meme DSL ; A3 exige que la REPARATION de
 *     chacun des trois defauts (cycle retire, operation reparee, issue
 *     rendue conforme a l'oracle) compile et se qualifie ; A6 exige qu'une
 *     sequence de tirages ou le DERNIER est coherent reussisse DANS la
 *     limite, et pas seulement qu'une sequence entierement contradictoire
 *     s'arrete.
 *
 * (3) L'EPUISEMENT QUI NE PROUVE PAS LA BORNE (A6). Un generateur qui
 *     s'arrete simplement parce que la suite a FOURNI un nombre fini de
 *     reponses ne demontre aucune borne : il se serait arrete de la meme
 *     facon sans aucun plafond. `draw_model_response`, dans le volet negatif
 *     d'A6, ne tarit donc JAMAIS — il rend une NOUVELLE regle contradictoire
 *     distincte a chaque appel — et c'est le COMPTEUR de la suite, pas
 *     l'epuisement d'un tableau, qui doit s'arreter exactement a
 *     `max_attempts`.
 *
 * (4) LE HASH CONSTANT OU HORODATE (A5). Un `manifest_hash` constant
 *     satisferait la stabilite sans rien prouver ; un hash qui integre un
 *     horodatage technique ou un ordre d'iteration instable (L82) varierait
 *     a tort entre deux compilations du MEME contenu. A5 porte donc les deux
 *     temoins : IDENTITE sur un contenu CLONE (deux fois, a deux instants
 *     differents) et DIFFERENCE des que le contenu SEMANTIQUE change — y
 *     compris quand seul l'ORDRE DES CLES du JSON source differe, ce que
 *     L82 (« objets JSON tries recursivement par cle ») exige d'ignorer.
 *
 * (5) L'ABSENCE QUI SE SATISFAIT DU VIDE (A4). Un `buildRevelationPackage`
 *     qui rend un paquet VIDE a toute periode satisferait l'absence de
 *     regles futures sans rien prouver. A4 exige donc, par periode, que la
 *     regle DE CETTE PERIODE (sentinelle distincte) soit PRESENTE, avant de
 *     verifier qu'aucune regle de periode STRICTEMENT POSTERIEURE ne l'est —
 *     exactement la methode de acceptance/T06.spec.ts, A1.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • Elle ne prouve pas que le texte ecrit par un modele REEL (mode `live`)
 *    produirait un DSL syntaxiquement conforme : L15 impose des interfaces
 *    substituables et des tests ordinaires sans fournisseur externe ;
 *    `draw_model_response` EST cette substitution, au meme titre que le
 *    serveur HTTP factice de acceptance/T28.spec.ts.
 *  • Elle n'impose aucun format de stockage pour le registre de mutants
 *    semantiques que T10 utilise en interne : `qualifyScenario` est rejoue
 *    tel quel, en boite noire, jamais reimplemente.
 *  • « Un grand nombre de variantes de reservation ne vaut pas plusieurs
 *    familles metier independantes » (L413) est une affirmation sur
 *    l'INTERPRETATION d'une campagne, pas une propriete que cette suite d'un
 *    seul generateur peut observer ; elle n'est pas testee ici.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Rendu TEXTUEL PROFOND. Traverse Map/Set, exclut les piles d'exception. */
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
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (v instanceof Map) {
    return `Map{${[...v.entries()]
      .map(([k, x]) => `${rendu(k, profondeur + 1, vus)}:${rendu(x, profondeur + 1, vus)}`)
      .join(',')}}`;
  }
  if (v instanceof Set) return `Set[${[...v].map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
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

const ACTEURS = (refValue(RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
const [ACTEUR_A, ACTEUR_B] = ACTEURS as [string, string];
const LOCATAIRE = S('valeurs.locataire_initial.valeur'); // cahier:L119 — non compare, utilise comme entree
const CRENEAU_ID = S('valeurs.creneau.id.valeur');
const CAPACITE = N('valeurs.creneau.capacite.valeur');
const DEBUT = S('valeurs.creneau.debut.valeur');
const P1_H = S('valeurs.horloges_des_periodes.P1.valeur');
const P1_CONFIRMEES = N('valeurs.P1.etat_attendu.confirmees.valeur');
const P1_SURBOOKING = refValue(RESERVATION, 'valeurs.P1.etat_attendu.surbooking.valeur') as boolean;

/** « demande concurrente de B rejetee sans surbooking » (L119), relu, pas recopie. */
function verifierSocleReference(): void {
  expect([CAPACITE, P1_CONFIRMEES, P1_SURBOOKING]).toEqual([1, 1, false]); // cahier:L119
}

/** Vocabulaire d'issue deja fixe par T10 (acceptance/T10.spec.ts, III.4). */
const ISSUE_ACCEPTEE = 'accepted';
const ISSUE_REFUSEE = 'refused';

const CODE_SOURCE_UNVERIFIED = 'SOURCE_UNVERIFIED'; // cahier:L411

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Sentinelle reproductible, impossible a produire par accident dans une sortie. */
function sentinelle(etiquette: string): string {
  return createHash('sha256').update(`bench.T29.sentinelle:${etiquette}`).digest('hex').slice(0, 16);
}

const idDe = (prefixe: string, etiquette: string): string => `${prefixe}-${etiquette}-${sentinelle(etiquette)}`;

/* ═══════════════════ chargement des sources de T29 et de T10 (dependance) ═ */

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
  }
  for (const rel of ['src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

const ENTREES = [
  'index.mjs',
  'index.js',
  'index.ts',
  'src/index.mjs',
  'src/index.js',
  'src/index.ts',
] as const;

function entreesDe(...segments: string[]): string[] {
  const out: string[] = [];
  const dir = path.join(REPO, ...segments);
  for (const rel of ENTREES) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

/** LE SUJET : les source_paths que verification/tasks.json declare pour T29. */
function specifiersDuSujet(): string[] {
  return [
    ...specifiersForPackage('scenario'),
    ...specifiersForPackage('agents'),
    ...entreesDe('fixtures'),
    ...entreesDe('fixtures', 'scenarios'),
    ...entreesDe('fixtures', 'generation'),
  ];
}

async function charger(specs: string[], quoi: string): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  if (specs.length === 0) attempts.push(`aucun point d entree ${quoi}`);
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

const VIDE: Loaded = {
  ok: false,
  via: [],
  exportCount: 0,
  flat: new Map(),
  attempts: ['beforeAll non execute'],
};

let LOADED: Loaded = VIDE;
let LOADED_T10: Loaded = VIDE;

beforeAll(async () => {
  // Le chargement ne LEVE pas : un import casse produirait « Test suite
  // failed to run », que verification/runner/red.mjs classe
  // SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc
  // lui-meme le chargement (assertLoaded), ce qui rend le rouge
  // ASSERTION_FAILED — la seule forme de rouge qui prouve quelque chose
  // (cahier L139).
  LOADED = await charger(specifiersDuSujet(), 'sous packages/scenario, packages/agents ni fixtures/** (T29)');
  LOADED_T10 = await charger(specifiersForPackage('evaluation'), 'sous packages/evaluation (T10, dependance)');
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `SUJET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ───────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  generateScenarioFromModel: [
    'generateScenarioFromModel',
    'generateScenario',
    'generateFromModel',
    'autoGenerateScenario',
    'generateQualifiedScenario',
    'generateAndQualifyScenario',
    'runScenarioGenerator',
    'scenarioFactory',
  ],
  buildRevelationPackage: [
    'buildRevelationPackage',
    'buildModelRevelationPackage',
    'revelationPackageForPeriod',
    'revealRulesForPeriod',
    'currentRevelationPackage',
    'revealForGeneration',
    'generationRevelationPackage',
  ],
  // Contrat DEJA VALIDE de T10 (L147) : rejoue ici, jamais reimplemente.
  qualifyScenario: [
    'qualifyScenario',
    'qualifierScenario',
    'screenScenario',
    'checkScenario',
    'validateScenario',
    'qualifyCase',
    'qualifierCas',
    'qualifyFixture',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();
const ROLES_DE_T10 = new Set(['qualifyScenario']);

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role];
  const sources = ROLES_DE_T10.has(role) ? [LOADED_T10] : [LOADED];
  for (const src of sources) {
    for (const c of candidats) {
      const v = src.flat.get(c);
      if (typeof v === 'function') {
        RESOLVED.set(role, v as Fonction);
        return v as Fonction;
      }
    }
    const lower = new Map<string, unknown>();
    for (const [k, v] of src.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
    for (const c of candidats) {
      const v = lower.get(c.toLowerCase());
      if (typeof v === 'function') {
        RESOLVED.set(role, v as Fonction);
        return v as Fonction;
      }
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
          manquants.map((r) => `${r}:[${ROLES[r].join('|')}]`).join(' ; ') +
          ` (sujet : ${String(LOADED.exportCount)} exports dans ` +
          `${LOADED.via.join(', ') || 'aucun module'} ; T10 : ${String(LOADED_T10.exportCount)} ` +
          `exports dans ${LOADED_T10.via.join(', ') || 'aucun module'} — ${LOADED_T10.attempts.join(' | ')})`,
  ).toBe('contrat-resolu');
}

/* ─────────────────────────── appel d'un role : un jet N'EST PAS un refus */

interface Issue {
  refuse: boolean;
  via: string;
  texte: string;
  valeur: unknown;
}

async function appeler(role: string, ...args: unknown[]): Promise<Issue> {
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
    for (const drapeau of ['ok', 'valid', 'success', 'accepted']) {
      if (o[drapeau] === false) return { refuse: true, via: `${drapeau}=false`, texte, valeur: brut };
    }
    for (const drapeau of ['quarantined', 'quarantine', 'in_quarantine']) {
      if (o[drapeau] === true) return { refuse: true, via: `${drapeau}=true`, texte, valeur: brut };
    }
  }
  if (texte.includes(CODE_SOURCE_UNVERIFIED)) {
    return { refuse: true, via: 'code:SOURCE_UNVERIFIED', texte, valeur: brut };
  }
  return { refuse: false, via: 'valeur', texte, valeur: brut };
}

function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(issue.refuse ? `REFUS-INATTENDU ${quoi} : ${court(issue.texte)}` : 'accepte').toBe('accepte');
  return issue.valeur;
}

function exigerRefuse(issue: Issue, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(issue.texte)}`).toBe('refuse');
}

/** Premiere valeur dont la CLE correspond au motif, en largeur, profondeur 3. */
function champ(o: unknown, motif: RegExp, profondeur = 3): unknown {
  if (o === null || typeof o !== 'object') return undefined;
  let niveau: unknown[] = [o];
  for (let d = 0; d <= profondeur; d += 1) {
    const suivant: unknown[] = [];
    for (const n of niveau) {
      if (n === null || typeof n !== 'object' || Array.isArray(n)) continue;
      for (const [k, v] of Object.entries(n as Json)) {
        if (motif.test(k) && v !== undefined && v !== null) return v;
      }
      for (const v of Object.values(n as Json)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) suivant.push(v);
      }
    }
    niveau = suivant;
  }
  return undefined;
}

function champChaine(o: unknown, motif: RegExp): string | null {
  const v = champ(o, motif);
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function champNombre(o: unknown, motif: RegExp): number | null {
  const v = champ(o, motif);
  return typeof v === 'number' ? v : null;
}

/** Le pack, degage de son eventuelle enveloppe (point III.3). */
function packDe(v: unknown): Json {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
  for (const cle of ['pack', 'result', 'value']) {
    const sous = (v as Json)[cle];
    if (sous !== null && sous !== undefined && typeof sous === 'object') return sous as Json;
  }
  return v as Json;
}

/** Le `scenario` bench.qualification.scenario/1 porte par un pack. */
function scenarioDe(pack: Json): Json | null {
  const s = champ(pack, /^(scenario|scenario_pack|scenarioPack)$/i, 1);
  return s !== undefined && s !== null && typeof s === 'object' ? (s as Json) : null;
}

/* ───────────────────────── les objets DSL que la suite construit elle-meme */

interface DslRule {
  rule_id: string;
  at: string;
  operation: string;
  actor: string;
  slot: string;
  sequence: number;
  expect: { outcome: string };
  depends_on: string[];
}

interface DslDoc {
  schema: 'bench.scenario.dsl/1';
  scenario_id: string;
  tenant: string;
  business_clock: string;
  slots: { slot_id: string; capacity: number; starts_at: string }[];
  rules: DslRule[];
}

interface ModelResponse {
  text: string;
  cited_sources: string[];
}

/**
 * Le DSL COHERENT : reprend P1 de F-RESERVATION (A reserve et est accepte, B
 * demande le meme creneau de capacite 1 et est refuse — « demande concurrente
 * de B rejetee sans surbooking », L119). Chaque issue attendue vient de la
 * racine gelee ; aucune n'est ecrite a la main.
 */
function dslCoherent(etiquette: string): DslDoc {
  return {
    schema: 'bench.scenario.dsl/1',
    scenario_id: idDe('T29-SCN', etiquette),
    tenant: LOCATAIRE,
    business_clock: P1_H,
    slots: [{ slot_id: CRENEAU_ID, capacity: CAPACITE, starts_at: DEBUT }],
    rules: [
      {
        rule_id: `${etiquette}-r1`,
        at: P1_H,
        operation: 'reserve',
        actor: ACTEUR_A,
        slot: CRENEAU_ID,
        sequence: 1,
        expect: { outcome: ISSUE_ACCEPTEE },
        depends_on: [],
      },
      {
        rule_id: `${etiquette}-r2`,
        at: P1_H,
        operation: 'reserve',
        actor: ACTEUR_B,
        slot: CRENEAU_ID,
        sequence: 2,
        expect: { outcome: ISSUE_REFUSEE },
        depends_on: [`${etiquette}-r1`],
      },
    ],
  };
}

/** Variante CYCLE : r1 et r2 se dependent mutuellement. */
function dslAvecCycle(etiquette: string): DslDoc {
  const doc = dslCoherent(etiquette);
  doc.rules[0]!.depends_on = [doc.rules[1]!.rule_id];
  return doc;
}

/** Variante HORS DSL : une operation qui n'est ni `reserve` ni `cancel`. */
function dslHorsDsl(etiquette: string): DslDoc {
  const doc = dslCoherent(etiquette);
  doc.rules[1]!.operation = 'teleport';
  return doc;
}

/**
 * Variante CONTRADICTION : le DSL pretend que la demande concurrente de B
 * (capacite 1, deja prise par A) est ACCEPTEE. La racine gelee dit l'inverse
 * (`surbooking = false`, `confirmees = 1`) : c'est l'inverse exact de
 * dslCoherent, et rien d'autre ne change.
 */
function dslContradiction(etiquette: string): DslDoc {
  const doc = dslCoherent(etiquette);
  doc.rules[1]!.expect = { outcome: ISSUE_ACCEPTEE };
  return doc;
}

const reponseDe = (doc: DslDoc, sourcesCitees: string[]): ModelResponse => ({
  text: JSON.stringify(doc),
  cited_sources: sourcesCitees,
});

/** Tirage COMPTE : expose son nombre d'appels, pour A6 (danger IV.3). */
interface Tirage {
  fn: () => ModelResponse | undefined;
  appels: number;
}

/** Tirage a partir d'une liste FINIE, consommee dans l'ordre. */
function tirageFini(reponses: ModelResponse[]): Tirage {
  const t = { appels: 0 } as Tirage;
  let i = 0;
  t.fn = (): ModelResponse | undefined => {
    t.appels += 1;
    const r = reponses[i];
    i += 1;
    return r;
  };
  return t;
}

/**
 * Tirage QUI NE TARIT JAMAIS : rend une variante contradictoire DISTINCTE a
 * chaque appel. Sert le volet negatif d'A6 — un generateur sans plafond doit
 * pouvoir continuer indefiniment, et c'est le COMPTEUR qui doit l'arreter.
 */
function tirageInfiniContradictoire(etiquette: string, sources: string[]): Tirage {
  const t = { appels: 0 } as Tirage;
  t.fn = (): ModelResponse => {
    t.appels += 1;
    return reponseDe(dslContradiction(`${etiquette}-${String(t.appels)}`), sources);
  };
  return t;
}

function requete(overrides: Partial<Json> & { draw_model_response: () => ModelResponse | undefined }): Json {
  return {
    schema: 'bench.scenario.generation.request/1',
    available_sources: [],
    max_attempts: 1,
    cost_per_attempt_micro_usd: '1000000',
    ...overrides,
  };
}

const genere = (req: Json): Promise<Issue> => appeler('generateScenarioFromModel', req);
const qualifieIndependamment = (scenario: Json): Promise<Issue> => appeler('qualifyScenario', scenario);

/* ══════════════════════════════════════════════════════════════════ cas ═ */

describe('T29 — automatiser la fabrique de scenarios sans auto-certification libre', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T29.A1 une reponse modele enregistree produit un pack compilable et qualifie',
    async () => {
      assertLoaded();
      assertContrat('generateScenarioFromModel', 'qualifyScenario');
      verifierSocleReference();

      const SRC = 'SRC-HIST-T29-A1';
      const doc = dslCoherent('a1');
      const req = requete({
        draw_model_response: tirageFini([reponseDe(doc, [SRC])]).fn,
        available_sources: [SRC],
        max_attempts: 1,
      });

      // (1) L'ENONCE DU CAS : la reponse modele ENREGISTREE produit un succes.
      const issue = await genere(req);
      const sortie = exigerAccepte(issue, 'DSL coherent cite+disponible');

      // (2) LE PACK N'EST PAS VIDE : il porte un `scenario` au schema deja
      //     prouve de T10, qui reprend les DEUX regles soumises.
      const pack = packDe(sortie);
      const scenario = scenarioDe(pack);
      expect(
        scenario === null ? `PACK-SANS-SCENARIO ${court(rendu(pack))}` : 'scenario-present',
      ).toBe('scenario-present');
      const steps = Array.isArray((scenario as Json).steps) ? ((scenario as Json).steps as unknown[]) : [];
      expect(steps.length).toBeGreaterThanOrEqual(2); // cahier:L407 « parser de source »
      expect(rendu(scenario).includes(ACTEUR_A)).toBe(true); // cahier:L119
      expect(rendu(scenario).includes(CRENEAU_ID)).toBe(true); // cahier:L119

      // (3) QUALIFICATION INDEPENDANTE (danger IV.1, point III.5) : ce
      //     scenario, REJOUE tel quel dans le pipeline DEJA PROUVE de T10,
      //     est ACCEPTE — pas seulement declare qualifie par T29 lui-meme.
      const reverif = await qualifieIndependamment(scenario as Json);
      expect(
        reverif.refuse
          ? `OSCILLATION-AUTO-CERTIFICATION pack qualifie par T29 mais rejete par T10 : ${court(reverif.texte)}`
          : 'qualifie-independamment',
      ).toBe('qualifie-independamment'); // cahier:L409 « elle ne remplace pas arbitrairement le moteur de verite »

      // (4) LA FORME DU PACK EST CELLE DOCUMENTEE EN III.3 : `manifest_hash`
      //     est bien un hash sha256 hex.
      const hash = champChaine(pack, /^(manifest_hash|hash|digest|fingerprint|empreinte)$/i);
      expect(hash !== null && SHA256_HEX.test(hash) ? 'hash-valide' : `HASH-ABSENT-OU-INVALIDE ${String(hash)}`).toBe(
        'hash-valide',
      ); // cahier:L82

      console.log(`[T29.A1] via=${issue.via} steps=${String(steps.length)} hash=${String(hash)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T29.A2 une source citee mais absente du paquet disponible donne SOURCE_UNVERIFIED',
    async () => {
      assertLoaded();
      assertContrat('generateScenarioFromModel');

      const SRC_CITEE = 'SRC-HIST-T29-A2-ABSENTE';
      const SRC_AUTRE = 'SRC-HIST-T29-A2-SANS-RAPPORT';
      const doc = dslCoherent('a2');

      // (1) L'ENONCE DU CAS : la source citee n'est PAS dans les sources
      //     disponibles -> SOURCE_UNVERIFIED, et le refus NOMME la source.
      const issueAbsente = await genere(
        requete({
          draw_model_response: tirageFini([reponseDe(doc, [SRC_CITEE])]).fn,
          available_sources: [SRC_AUTRE],
          max_attempts: 1,
        }),
      );
      exigerRefuse(issueAbsente, `citation de ${SRC_CITEE}, absente de [${SRC_AUTRE}]`);
      expect(issueAbsente.texte.includes(CODE_SOURCE_UNVERIFIED) ? 'code-present' : `CODE-ABSENT ${court(issueAbsente.texte)}`).toBe(
        'code-present',
      ); // cahier:L411
      expect(
        issueAbsente.texte.includes(SRC_CITEE) ? 'source-nommee' : `SOURCE-NON-NOMMEE ${court(issueAbsente.texte)}`,
      ).toBe('source-nommee'); // cahier:L409

      // (2) VOLET POSITIF (danger IV.2) : AJOUTER la source manquante aux
      //     sources disponibles, et RIEN D'AUTRE, fait reussir le MEME DSL.
      const issuePresente = await genere(
        requete({
          draw_model_response: tirageFini([reponseDe(clone(doc), [SRC_CITEE])]).fn,
          available_sources: [SRC_AUTRE, SRC_CITEE],
          max_attempts: 1,
        }),
      );
      exigerAccepte(issuePresente, 'meme DSL, source desormais disponible'); // cahier:L409

      // (3) une reponse qui ne cite AUCUNE source n'a rien a verifier :
      //     SOURCE_UNVERIFIED ne doit pas tomber sans citation.
      const issueSansCitation = await genere(
        requete({
          draw_model_response: tirageFini([reponseDe(clone(doc), [])]).fn,
          available_sources: [],
          max_attempts: 1,
        }),
      );
      exigerAccepte(issueSansCitation, 'DSL sans aucune citation');

      console.log(`[T29.A2] absente=${issueAbsente.via} presente=${issuePresente.via}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T29.A3 un cycle, une regle hors DSL ou une contradiction avec l oracle mene a la quarantaine',
    async () => {
      assertLoaded();
      assertContrat('generateScenarioFromModel', 'qualifyScenario');
      verifierSocleReference();

      const SRC = 'SRC-HIST-T29-A3';

      async function sondeDefaut(
        etiquette: string,
        construire: (e: string) => DslDoc,
        motifDefaut: RegExp,
        nomsAttendus: (doc: DslDoc) => string[],
      ): Promise<void> {
        const doc = construire(etiquette);
        const issue = await genere(
          requete({
            draw_model_response: tirageFini([reponseDe(doc, [SRC])]).fn,
            available_sources: [SRC],
            max_attempts: 1,
          }),
        );
        exigerRefuse(issue, `DSL ${etiquette}`);
        expect(
          motifDefaut.test(issue.texte) ? 'defaut-nomme' : `DEFAUT-NON-RECONNAISSABLE ${court(issue.texte)}`,
        ).toBe('defaut-nomme'); // cahier:L411
        const manquants = nomsAttendus(doc).filter((id) => !issue.texte.includes(id));
        expect(manquants).toEqual([]); // le refus NOMME la regle fautive (cf. T06.A5)
      }

      // (1) CYCLE.
      await sondeDefaut('a3-cycle', dslAvecCycle, /cycl/i, (d) => d.rules.map((r) => r.rule_id));

      // (2) REGLE HORS DSL.
      await sondeDefaut(
        'a3-hors-dsl',
        dslHorsDsl,
        /dsl|op[eé]ration|operation|teleport/i,
        (d) => [d.rules[1]!.rule_id, d.rules[1]!.operation],
      );

      // (3) CONTRADICTION AVEC L'ORACLE. Le DSL seul ne suffit pas a la
      //     detecter (cahier L409) : la suite verifie d'abord, INDEPENDAMMENT,
      //     que T10 refuserait bien ce scenario, avant d'exiger que T29 le
      //     mette en quarantaine pour la MEME raison.
      const docContradiction = dslContradiction('a3-contradiction');
      const scenarioSeul: Json = {
        schema: 'bench.qualification.scenario/1',
        scenario_id: docContradiction.scenario_id,
        tenant: docContradiction.tenant,
        business_clock: docContradiction.business_clock,
        slots: docContradiction.slots,
        steps: docContradiction.rules.map((r) => ({
          step_id: r.rule_id,
          at: r.at,
          operation: r.operation,
          actor: r.actor,
          slot: r.slot,
          sequence: r.sequence,
          expect: r.expect,
        })),
      };
      const verifOracle = await qualifieIndependamment(scenarioSeul);
      expect(
        verifOracle.refuse ? 'oracle-refuse-aussi' : `TEMOIN-INVALIDE l oracle accepte ${court(verifOracle.texte)}`,
      ).toBe('oracle-refuse-aussi');
      await sondeDefaut(
        'a3-contradiction',
        dslContradiction,
        /contradi/i,
        (d) => [d.rules[1]!.rule_id],
      );

      // (4) VOLET POSITIF (danger IV.2) : les trois REPARATIONS — defaut
      //     retire et rien d'autre change — compilent et se qualifient.
      const cycleRepare = dslCoherent('a3-cycle-repare');
      const horsDslRepare = dslCoherent('a3-hors-dsl-repare');
      const contradictionReparee = dslCoherent('a3-contradiction-reparee');
      for (const [nom, doc] of [
        ['cycle', cycleRepare],
        ['hors-dsl', horsDslRepare],
        ['contradiction', contradictionReparee],
      ] as const) {
        const issue = await genere(
          requete({
            draw_model_response: tirageFini([reponseDe(doc, [SRC])]).fn,
            available_sources: [SRC],
            max_attempts: 1,
          }),
        );
        exigerAccepte(issue, `variante ${nom} reparee`);
      }

      console.log('[T29.A3] cycle, hors-dsl et contradiction mis en quarantaine ; reparations acceptees');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T29.A4 les regles des periodes futures sont absentes du paquet de revelation courant',
    async () => {
      assertLoaded();
      assertContrat('buildRevelationPackage');

      const NB_PERIODES = 4;
      const catalogue = Array.from({ length: NB_PERIODES }, (_, i) => {
        const k = i + 1;
        return {
          rule_id: `T29-A4-P${String(k)}`,
          reveal_period: k,
          sentinel: sentinelle(`A4-P${String(k)}`),
          operation: k % 2 === 0 ? 'cancel' : 'reserve',
          actor: ACTEUR_A,
          slot: CRENEAU_ID,
        };
      });
      const sentinellesDe = (k: number): string => catalogue.find((r) => r.reveal_period === k)!.sentinel;

      const paquets: Record<number, string> = {};
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        const issue = await appeler('buildRevelationPackage', { rule_catalog: catalogue, period_index: k });
        const sortie = exigerAccepte(issue, `revelation pour P${String(k)}`);
        paquets[k] = rendu(sortie);
      }

      // (1) CONTROLE POSITIF, sans lequel l'absence serait triviale : la
      //     revelation de la periode k porte SA PROPRE regle.
      const manquantes: string[] = [];
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        if (!paquets[k]!.includes(sentinellesDe(k))) manquantes.push(`P${String(k)} ne porte pas sa propre regle`);
      }
      expect(manquantes).toEqual([]); // cahier:L409

      // (2) L'ENONCE DU CAS : aucune regle d'une periode STRICTEMENT
      //     POSTERIEURE ne figure dans la revelation de la periode k.
      const fuites: string[] = [];
      for (let k = 1; k <= NB_PERIODES; k += 1) {
        for (let j = k + 1; j <= NB_PERIODES; j += 1) {
          if (paquets[k]!.includes(sentinellesDe(j))) {
            fuites.push(`P${String(k)} porte la sentinelle de P${String(j)}`);
          }
        }
      }
      expect(fuites).toEqual([]); // cahier:L63, applique a la revelation du generateur

      console.log(`[T29.A4] ${Object.keys(paquets).length} revelations verifiees, aucune fuite future`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T29.A5 refaire la compilation des memes octets donne le meme hash',
    async () => {
      assertLoaded();
      assertContrat('generateScenarioFromModel');

      const SRC = 'SRC-HIST-T29-A5';
      const docA = dslCoherent('a5-a');
      const docB = dslCoherent('a5-b'); // contenu semantique DIFFERENT (scenario_id, rule_id)

      const hashDe = async (doc: DslDoc, texte?: string): Promise<string> => {
        const issue = await genere(
          requete({
            draw_model_response: tirageFini([{ text: texte ?? JSON.stringify(doc), cited_sources: [SRC] }]).fn,
            available_sources: [SRC],
            max_attempts: 1,
          }),
        );
        const pack = packDe(exigerAccepte(issue, 'compilation pour hash'));
        const hash = champChaine(pack, /^(manifest_hash|hash|digest|fingerprint|empreinte)$/i);
        expect(hash !== null && SHA256_HEX.test(hash) ? 'hash-valide' : `HASH-INVALIDE ${String(hash)}`).toBe(
          'hash-valide',
        );
        return hash!;
      };

      // (1) IDENTITE : les MEMES octets, compiles deux fois SEPAREMENT,
      //     donnent le MEME hash.
      const hash1 = await hashDe(clone(docA));
      const hash2 = await hashDe(clone(docA));
      expect(hash2).toBe(hash1); // cahier:L411

      // (2) MEME CONTENU SEMANTIQUE, ORDRE DES CLES JSON DIFFERENT : le hash
      //     canonique l'ignore (cahier:L82 « objets JSON tries recursivement
      //     par cle »).
      const reordonne = {
        rules: docA.rules.map((r) => ({
          depends_on: r.depends_on,
          expect: r.expect,
          sequence: r.sequence,
          slot: r.slot,
          actor: r.actor,
          operation: r.operation,
          at: r.at,
          rule_id: r.rule_id,
        })),
        slots: docA.slots,
        business_clock: docA.business_clock,
        tenant: docA.tenant,
        scenario_id: docA.scenario_id,
        schema: docA.schema,
      };
      const hash3 = await hashDe(docA, JSON.stringify(reordonne));
      expect(hash3).toBe(hash1); // cahier:L82

      // (3) TEMOIN ANTI-CONSTANTE : un contenu SEMANTIQUEMENT different
      //     produit un hash DIFFERENT.
      const hashB = await hashDe(clone(docB));
      expect(hashB).not.toBe(hash1); // cahier:L411

      console.log(`[T29.A5] hash(A)=${hash1} hash(A reordonne)=${hash3} hash(B)=${hashB}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T29.A6 une sortie stochastique rejetee peut etre regeneree, mais pas indefiniment',
    async () => {
      assertLoaded();
      assertContrat('generateScenarioFromModel');

      const SRC = 'SRC-HIST-T29-A6';
      const COUT = '1000000';
      const MAX = 3;

      // (1) VOLET POSITIF (danger IV.2) : deux tentatives contradictoires
      //     puis une DERNIERE coherente reussit DANS la limite — un
      //     generateur qui rejetterait TOUJOURS serait vert sur le volet
      //     negatif sans rien prouver.
      const reponsesMixtes = [
        reponseDe(dslContradiction('a6-pos-1'), [SRC]),
        reponseDe(dslContradiction('a6-pos-2'), [SRC]),
        reponseDe(dslCoherent('a6-pos-3'), [SRC]),
      ];
      const tirageMixte = tirageFini(reponsesMixtes);
      const issuePositive = await genere(
        requete({
          draw_model_response: tirageMixte.fn,
          available_sources: [SRC],
          max_attempts: MAX,
          cost_per_attempt_micro_usd: COUT,
        }),
      );
      const sortiePositive = exigerAccepte(issuePositive, 'succes a la derniere tentative');
      const packPositif = packDe(sortiePositive);
      const tentativesPositives = champNombre(packPositif, /^(attempts|tentatives|attempt_count)$/i);
      expect(tentativesPositives).toBe(tirageMixte.appels); // compteur de la suite, pas un champ seul
      expect(tentativesPositives).toBe(MAX);
      const coutPositif = champChaine(packPositif, /^(total_cost_micro_usd|total_cost|cout_total_micro_usd)$/i);
      expect(coutPositif !== null && /^\d+$/.test(coutPositif) ? 'cout-entier' : `COUT-NON-ENTIER ${String(coutPositif)}`).toBe(
        'cout-entier',
      ); // cahier:L110
      expect(BigInt(coutPositif!)).toBe(BigInt(COUT) * BigInt(MAX));

      // (2) L'ENONCE DU CAS, volet negatif : un tirage qui NE TARIT JAMAIS
      //     (danger IV.3) — chaque sortie est une contradiction DISTINCTE.
      //     Sans plafond, le generateur continuerait a en consommer ;
      //     `max_attempts` doit l'arreter EXACTEMENT a MAX appels.
      const tirageInfini = tirageInfiniContradictoire('a6-neg', [SRC]);
      const issueNegative = await genere(
        requete({
          draw_model_response: tirageInfini.fn,
          available_sources: [SRC],
          max_attempts: MAX,
          cost_per_attempt_micro_usd: COUT,
        }),
      );
      exigerRefuse(issueNegative, 'source infinie de sorties contradictoires');
      expect(
        tirageInfini.appels === MAX
          ? 'borne-respectee'
          : `BORNE-NON-RESPECTEE appels=${String(tirageInfini.appels)} max_attempts=${String(MAX)}`,
      ).toBe('borne-respectee'); // cahier:L413 « bornee »
      const packNegatif = packDe(issueNegative.valeur);
      const tentativesNegatives = champNombre(packNegatif, /^(attempts|tentatives|attempt_count)$/i);
      expect(tentativesNegatives).toBe(MAX);
      const coutNegatif = champChaine(packNegatif, /^(total_cost_micro_usd|total_cost|cout_total_micro_usd)$/i);
      expect(coutNegatif !== null && /^\d+$/.test(coutNegatif) ? 'cout-entier' : `COUT-NON-ENTIER ${String(coutNegatif)}`).toBe(
        'cout-entier',
      ); // cahier:L110
      expect(BigInt(coutNegatif!)).toBe(BigInt(COUT) * BigInt(MAX));

      console.log(
        `[T29.A6] positif attempts=${String(tentativesPositives)} cout=${String(coutPositif)} ; ` +
          `negatif appels=${String(tirageInfini.appels)} cout=${String(coutNegatif)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
