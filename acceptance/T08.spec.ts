/**
 * acceptance/T08.spec.ts — suite d'acceptation de la tache T08.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T08.A1 behaviour — meme scenario/graine donne les memes intentions, meme
 *                      avec un nombre de workers different
 *   T08.A2 behaviour — les quatre usages de F-QUALITY sont TOUJOURS proposes si
 *                      le candidat n'a cree aucune donnee
 *   T08.A3 behaviour — reference manquante a cause d'un echec anterieur produit
 *                      une intention NON SERVIE, pas une suppression
 *   T08.A4 absence   — les essais negatifs de securite alimentent
 *                      conformite/criticite SANS gonfler les echecs des
 *                      parcours metier valides
 *   T08.A5 absence   — avance du temps de A ne change PAS celui de B
 *   T08.A6 behaviour — controle de la frontiere 24 h sans attendre 24 heures
 *                      physiques
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE a `packages/workload` — le `source_paths`
 * que verification/tasks.json declare pour T08. ADR-001 : cet aveuglement est
 * PROCEDURAL, donc une discipline auditable au diff, pas une barriere
 * technique. Le contrat teste ci-dessous n'a ete releve NI dans
 * l'implementation, NI par `git show` : il est derive de docs/specs/T08.md,
 * c'est-a-dire des lignes du cahier que la carte de specification epingle :
 *
 *   L221  livrables : « modele d'intention, plan d'usage seede, resolution
 *         d'identifiants externes et horloge metier isolee »
 *   L223  les six cas d'acceptation, mot pour mot
 *   L225  fin : « CONSERVATION DU NOMBRE D'INTENTIONS OFFERTES et separations
 *         entre temps metier, attente technique et temps de calcul »
 *   L88   contrat `Intent` : « id stable, acteur externe, locataire, instant
 *         metier, operation, arguments, cible metier attendue »
 *   L90   contrat `Observation` : « intention, reponse, faits metier observes,
 *         indisponibilite eventuelle, horodatage metier, trace technique »
 *   L95   contrat `PeriodResult` : « […] intentions offertes/reussies […] »
 *   L67   invariant D-5 : « un echec conserve ses depenses, ses INTENTIONS NON
 *         SERVIES et son backlog » — le fondement d'A3
 *   L82   « les graines sont derivees par identifiants et flux (`scenario`,
 *         `workload`, `assignment`, `bootstrap`) » — le flux `workload` est
 *         celui de cette tache
 *   L80   « timestamps UTC ISO 8601 », « enums explicites »
 *   L107  F-QUALITY : intentions offertes `[4,4,0,2]` — les QUATRE usages d'A2
 *   L119  F-RESERVATION : horloge initiale, creneau S1 debutant
 *         2030-01-03T12:00:00Z, regle d'annulation « au moins 24 heures avant
 *         le debut, frontiere incluse », et les instants de frontiere
 *   L123  le contrat intertenant renvoie `NOT_FOUND` sans donnee metier
 *         divulguee — la reponse attendue d'un essai negatif de securite
 *   L125  horloges des quatre periodes
 *   L141  « les tests d'ordonnancement emploient horloges controlees […] ; un
 *         timeout borne un blocage, il ne demontre pas qu'un evenement aurait
 *         du arriver en 100 ms »
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des deux sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/F-QUALITY.json` ou de
 *       `acceptance/reference/F-RESERVATION.json` — racines gelees,
 *       docs/FROZEN_ROOTS.json. C'est le cas du nombre d'usages offerts (4),
 *       de tous les instants metier (horloge initiale, horloge de P3, debut du
 *       creneau, frontiere des 24 h et frontiere + 1 ms), du delai de 24 heures
 *       et des acteurs.
 *   (b) un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p'
 *       docs/cahier.md`.
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant une implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * les identifiants d'usage, de scenario, de graine et de handle externe : §F ne
 * les fixe pas, et ce sont des ENTREES de la suite, jamais des valeurs
 * attendues. Aucune assertion ne les compare a une constante du cahier.
 *
 * CONTROLE DES REFERENCES ELLES-MEMES. A6 n'admet pas la frontiere sur parole :
 * il exige que `debut - frontiere` vaille exactement `delai_heures` heures, et
 * que `frontiere + 1 ms` soit bien l'instant scelle du second clone. Si la
 * racine gelee se contredisait, c'est ELLE qui tomberait, et le message le dit.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET D'APPEL. Le paquet est charge par son SPECIFICATEUR,
 * que jest.config.mjs mappe vers `packages/workload/src` — jamais vers un
 * `dist/` perime, gitignore et invisible a `git status --porcelain`.
 *
 * Pour chaque ROLE, la suite nomme un export PRIMAIRE puis une courte liste
 * d'alias documentes. Les alias sont une tolerance de NOMMAGE, pas de
 * COMPORTEMENT. Si aucun nom ne repond, la suite echoue par une assertion
 * explicite qui nomme le role et la liste attendue — jamais par un import
 * casse, que verification/runner/red.mjs classe MODULE_NOT_FOUND et refuse
 * comme preuve.
 *
 *   createBusinessClock({ start })        -> horloge metier ISOLEE      (L221)
 *   readBusinessClock(horloge)            -> instant metier UTC ISO     (L80)
 *   advanceBusinessClock(horloge, ms)     -> horloge avancee            (L221)
 *   generateIntentPlan(entree)            -> plan d'usage seede         (L221)
 *   executeIntentPlan(plan, monde)        -> resultat d'execution       (L221)
 *
 * SIX CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC FIXEES
 * ICI (elles sont reprises telles quelles dans verification/mutants/T08.json) :
 *
 *   1. `createBusinessClock({ start })` rend une horloge INDEPENDANTE a chaque
 *      appel. Deux horloges creees depuis le meme `start` ne partagent aucune
 *      source de temps : c'est exactement l'enonce d'A5, et le livrable
 *      « horloge metier isolee » de L221.
 *
 *   2. `advanceBusinessClock(horloge, deltaMs)` avance de `deltaMs`
 *      MILLISECONDES de temps METIER et rend l'horloge avancee. La
 *      milliseconde est l'unite du cahier : L119 fixe la frontiere a
 *      `12:00:00Z` et le refus a `12:00:00.001Z`. Une mutation en place est
 *      toleree : la suite relit a travers la valeur rendue quand c'est un
 *      objet, et a travers la poignee d'origine sinon. Trois canaux de delta
 *      sont essayes — `deltaMs` nu, `{ ms }`, `{ milliseconds }` — et au moins
 *      un doit repondre.
 *
 *   3. `readBusinessClock(horloge)` rend l'instant metier courant en UTC ISO
 *      8601 (L80). Un `Date` est tolere et normalise par la suite.
 *
 *   4. `generateIntentPlan(entree)` prend un objet PLAT et STRICT (L80 :
 *      proprietes inconnues rejetees), donc sans alias redondants :
 *        { scenario, seed, workers, tenant, actors, clock, usages,
 *          candidate_state }
 *      `usages` est le CATALOGUE des usages que le scenario offre, chacun
 *      `{ id, operation, requires, produces }` ou `requires` est la liste des
 *      handles externes dont l'usage a besoin et `produces` le handle qu'il
 *      cree (ou `null`). `candidate_state` est `{ created: string[] }` : les
 *      handles que le candidat a DEJA crees. `clock` est l'horloge metier :
 *      c'est elle, et non l'horloge systeme, qui donne l'`instant metier` des
 *      intentions (L88). `workers` est une option d'EXECUTION.
 *      Le plan rend une liste d'intentions portant au minimum un id STABLE, un
 *      instant metier, une operation et l'usage dont elles viennent (L88).
 *
 *   5. `executeIntentPlan(plan, monde)` execute le plan contre le MONDE que la
 *      suite fournit. Le monde est a la fois une fonction et un objet portant
 *      les alias `perform`, `execute`, `run`, `call`, `handle`, `apply`,
 *      `send` : la generosite est du cote de la suite, pour qu'aucune
 *      implementation raisonnable ne soit recalee sur le nom du point
 *      d'entree. Il rend `{ ok, external_id?, denied?, code? }`.
 *      Le resultat expose les issues intention par intention ET des compteurs
 *      agreges. LES COMPTEURS SONT PRODUITS PAR L'IMPLEMENTATION, jamais
 *      recalcules par la suite : A4 porte precisement sur le COMPTAGE.
 *
 *   6. RESOLUTION D'IDENTIFIANTS EXTERNES (L221). Une intention qui `requires`
 *      un handle que nulle intention anterieure n'a effectivement produit est
 *      NON SERVIE : elle reste dans les issues, avec un statut de la famille
 *      `UNSERVED`, et le monde n'est pas appele pour elle. Quand le handle EST
 *      resolu, l'identifiant externe reellement rendu par le monde est celui
 *      qui parvient a l'intention dependante — A3 le mesure des deux cotes.
 *
 * FORME DU RESULTAT. Un refus peut etre LEVE ou RENDU (`ok:false`,
 * `errors:[...]`, un champ de code) : le cahier prescrit un rejet, pas un
 * mecanisme. Les assertions decisives portent sur l'ETAT observe — les
 * intentions, leurs statuts, les compteurs — jamais sur la forme du retour.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES TROIS DANGERS PROPRES A T08.
 *
 * (1) LES CAS D'ABSENCE QUI PASSENT SUR UN PROGRAMME MORT. A4 et A5 affirment
 *     qu'une chose N'EST PAS la. Des compteurs a zero, ou une horloge
 *     constante, les satisfont sans rien prouver ;
 *     verification/cases.lock.json nomme ce defaut (`absence` / `make-present`).
 *     Chacun porte donc son CONTROLE POSITIF dans le MEME cas :
 *       • A4 exige d'abord que les essais negatifs soient PRESENTS dans les
 *         compteurs de conformite/criticite, puis qu'un echec metier REEL fasse
 *         monter le compteur d'echecs metier a 1 — apres quoi seulement il
 *         exige que les deux essais negatifs, eux, le laissent a 0.
 *       • A5 exige d'abord que l'avance de A DEPLACE A de 24 h exactement,
 *         puis que B n'ait pas bouge, puis — par symetrie — qu'avancer B
 *         deplace B et laisse A ou il etait.
 *
 * (2) LE STUB CONSTANT QUI VERDIT UNE INVARIANCE. A1 affirme qu'une sortie ne
 *     depend PAS d'un facteur. Un planificateur constant rendrait les deux
 *     cotes de l'egalite identiques et laisserait le cas VERT —
 *     verification/cases.lock.json le nomme explicitement pour A1. D'ou le
 *     TEMOIN ANTI-CONSTANTE : un catalogue d'usages DIFFERENT doit produire un
 *     plan DIFFERENT. Meme raison pour A2, dont le temoin est un catalogue a
 *     deux usages qui doit produire deux intentions, et non quatre.
 *
 * (3) LE TEMPS PHYSIQUE COMME PREUVE. L141 avertit qu'« un timeout borne un
 *     blocage ; il ne demontre pas qu'un evenement aurait du arriver en
 *     100 ms ». A6 n'affirme donc AUCUNE borne fine : il affirme la seule borne
 *     que le cahier enonce — le controle de la frontiere s'obtient sans
 *     attendre les 24 heures physiques — et il tire sa force de ses assertions
 *     METIER (l'instant lu APRES avance vaut la frontiere scellee au
 *     millieme de seconde pres), pas de son chronometre.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • « separations entre temps metier, attente technique et temps de calcul »
 *    (L225) est enonce dans la phrase de FIN de T08, pas dans un cas requis.
 *    La suite en observe la seule moitie que §H attache a un cas : A5 et A6,
 *    c'est-a-dire l'isolation de l'horloge metier et son independance du temps
 *    physique. L'enregistrement separe du temps en file et du temps actif est
 *    l'objet de T26.A6 (L383), pas de T08.
 *  • L'effet de la GRAINE sur le tirage n'est pas pince par §H : A1 affirme
 *    l'invariance au nombre de workers et la reproductibilite a graine egale,
 *    pas qu'une graine differente DOIVE changer le plan. La suite n'invente
 *    donc pas cette exigence ; elle observe, a graine differente, la seule
 *    propriete que L225 enonce — la CONSERVATION DU NOMBRE d'intentions
 *    offertes.
 *  • Les quatre usages d'A2 sont ceux que le CATALOGUE fourni declare. §F fixe
 *    leur NOMBRE (`intentions offertes [4,4,0,2]`) et non leur nature :
 *    F-QUALITY inscrit d'ailleurs « la nature des intentions derriere les
 *    cardinaux » dans `non_fixe_par_le_cahier`. Le catalogue est donc une
 *    ENTREE de la suite ; seul son cardinal est une valeur attendue.
 *  • A4 ne prouve pas la POLITIQUE de criticite (quelle violation declenche
 *    quelle mise hors service) : c'est T22.A5 (L349). Il prouve la separation
 *    des comptages, qui est ce que L223 enonce.
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
const PACKAGES = ['workload'] as const;
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

/**
 * Rendu TEXTUEL PROFOND d'une valeur quelconque. Il traverse `Map` et `Set` —
 * un plan peut parfaitement indexer ses intentions dans une `Map`, que
 * `JSON.stringify` rendrait `{}` et ou une intention supprimee deviendrait
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
  if (v instanceof Date) return JSON.stringify(v.toISOString());
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

/* ────────────────────── fixtures de reference (racines gelees, L139) */

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

const QUALITY = readReference('F-QUALITY');
const RESERVATION = readReference('F-RESERVATION');

const SR = (chemin: string): string => String(refValue(RESERVATION, chemin));
const NR = (chemin: string): number => Number(refValue(RESERVATION, chemin));

/* ── les valeurs scellees, et rien d'autre ──────────────────────────────── */

/** F-QUALITY : « intentions offertes [4,4,0,2] » (L107). */
const OFFERTES = (refValue(QUALITY, 'valeurs.intentions_offertes.valeur') as unknown[]).map(Number);
/** F-QUALITY : « intentions reussies [4,2,0,1] » (L107). */
const REUSSIES = (refValue(QUALITY, 'valeurs.intentions_reussies.valeur') as unknown[]).map(Number);
/** Le nombre de periodes de F-QUALITY (L107). */
const NB_PERIODES = Number(refValue(QUALITY, 'valeurs.periodes.nombre.valeur'));
/**
 * « Les QUATRE usages de F-QUALITY » (L223) : le cardinal des intentions
 * offertes en P1. Il n'est pas ecrit `4` ici — il est LU dans la racine gelee.
 */
const USAGES_DE_QUALITY = OFFERTES[0] as number;

/** F-RESERVATION (L119, L125). */
const HORLOGE_INITIALE = SR('valeurs.horloge_initiale.valeur');
const ACTEURS = (refValue(RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
const LOCATAIRE = SR('valeurs.locataire_initial.valeur');
const CRENEAU_ID = SR('valeurs.creneau.id.valeur');
const DEBUT = SR('valeurs.creneau.debut.valeur');
const P3_H = SR('valeurs.horloges_des_periodes.P3.valeur');
const DELAI_HEURES = NR('valeurs.P3.delai_heures.valeur');
const FRONTIERE = SR('valeurs.P3.frontiere.valeur');
const FRONTIERE_INCLUSE = refValue(
  RESERVATION,
  'valeurs.P3.frontiere_incluse.valeur',
) as boolean;
const FRONTIERE_PLUS_1MS = SR(
  'valeurs.P3.probes.clone_2_frontiere_plus_1ms.instant.valeur',
);

const [ACTEUR_A, ACTEUR_B, ACTEUR_C] = ACTEURS as [string, string, string];

/** Une heure en millisecondes. Conversion d'unites, pas un litteral du cahier. */
const H_MS = 3_600_000;

/**
 * Le locataire cree en P4 et le code que le contrat intertenant renvoie
 * (« NOT_FOUND sans donnee metier divulguee »). C'est la REPONSE attendue d'un
 * essai negatif de securite, que le monde d'A4 rend.
 */
const LOCATAIRE_AUTRE = 'other'; // cahier:L119
const CODE_NOT_FOUND = 'NOT_FOUND'; // cahier:L123

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
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
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
  createBusinessClock: [
    'createBusinessClock',
    'createClock',
    'makeBusinessClock',
    'newBusinessClock',
    'initBusinessClock',
    'businessClock',
    'createWorkloadClock',
    'creerHorlogeMetier',
    'horlogeMetier',
  ],
  readBusinessClock: [
    'readBusinessClock',
    'businessNow',
    'readClock',
    'clockNow',
    'currentBusinessTime',
    'currentBusinessInstant',
    'now',
    'lireHorlogeMetier',
    'instantMetier',
  ],
  advanceBusinessClock: [
    'advanceBusinessClock',
    'advanceClock',
    'advanceBy',
    'advance',
    'forwardClock',
    'tick',
    'avancerHorlogeMetier',
    'avancer',
  ],
  generateIntentPlan: [
    'generateIntentPlan',
    'generateUsagePlan',
    'generateWorkloadPlan',
    'generateIntents',
    'generatePlan',
    'buildIntentPlan',
    'createIntentPlan',
    'planIntents',
    'genererPlanDIntentions',
    'planDUsage',
  ],
  executeIntentPlan: [
    'executeIntentPlan',
    'executeUsagePlan',
    'executePlan',
    'runIntentPlan',
    'executeIntents',
    'runIntents',
    'runWorkload',
    'executerPlanDIntentions',
    'executerPlan',
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

/** Deuxieme assertion de chaque cas : le contrat de nommage est satisfait. */
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

/* ────────────────────── lecture d'un appel, refus compris */

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
  'UNSUPPORTED',
  'INVALID',
  'VIOLATION',
  'ERROR',
  'ERREUR',
] as const;

const JETONS_SUCCES = /ACCEPT|SUCCESS|SERVED|OK\b|CONFIRM|APPLIED|PLANNED|GENERATED|EXECUTED/i;

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
  if (typeof brut === 'object' && !Array.isArray(brut) && !(brut instanceof Date)) {
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

/** Un appel accepte : il n'a pas refuse. Rend sa valeur. */
function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(
    issue.refuse ? `REFUS-INATTENDU ${quoi} [${issue.via}] : ${court(issue.texte)}` : 'accepte',
  ).toBe('accepte');
  return issue.valeur;
}

/** Un refus qui n'est pas un plantage du programme. */
function exigerPasDePlantage(issue: Issue, quoi: string): void {
  expect(
    MARQUEURS_DE_PLANTAGE.test(issue.texte)
      ? `PLANTAGE ${quoi} : ${court(issue.texte)}`
      : 'pas-de-plantage',
  ).toBe('pas-de-plantage');
}

/* ───────────────────────────────────── horloge metier : lecture et avance */

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Normalise un instant en millisecondes depuis l'epoque. Accepte la chaine ISO
 * 8601 (L80), un `Date`, ou un objet portant un champ d'instant. Rend `null`
 * quand rien de lisible n'a ete trouve : l'assertion appelante nomme alors ce
 * qu'elle a vu, plutot que de comparer deux `NaN`.
 */
const CHAMPS_INSTANT =
  /^(at|now|instant|iso|time|value|current|business_time|businesstime|business_instant|businessinstant|instant_metier|instantmetier|temps|horodatage|timestamp)$/i;

function instantMs(v: unknown, profondeur = 0): number | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'string') {
    if (!ISO.test(v)) return null;
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || typeof v !== 'object' || profondeur > 3) return null;
  if (typeof (v as { toISOString?: unknown }).toISOString === 'function') {
    try {
      const s = (v as { toISOString: () => unknown }).toISOString();
      if (typeof s === 'string' && ISO.test(s)) return Date.parse(s);
    } catch {
      /* objet qui pretend etre une date sans l'etre : on continue */
    }
  }
  for (const [k, x] of Object.entries(v as Json)) {
    if (!CHAMPS_INSTANT.test(k)) continue;
    const n = instantMs(x, profondeur + 1);
    if (n !== null) return n;
  }
  return null;
}

/** L'instant metier d'une horloge, en ms — ou `null`, jamais `NaN`. */
async function lireHorloge(horloge: unknown): Promise<{ ms: number | null; texte: string }> {
  const issue = await appeler('readBusinessClock', [horloge]);
  return { ms: instantMs(issue.valeur), texte: issue.texte };
}

/**
 * Avance une horloge de `deltaMs` millisecondes METIER. Trois canaux de delta
 * documentes sont essayes ; le premier qui DEPLACE REELLEMENT l'horloge gagne.
 * Ce critere n'est pas cosmetique : un `advance` qui accepte `{ ms }` en
 * l'ignorant serait indistinguable d'un canal valide si l'on se contentait
 * d'observer l'absence de refus.
 */
async function avancer(
  horloge: unknown,
  deltaMs: number,
): Promise<{ horloge: unknown; canal: string | null; texte: string }> {
  const avant = (await lireHorloge(horloge)).ms;
  const canaux: [string, unknown][] = [
    ['ms-nu', deltaMs],
    ['{ms}', { ms: deltaMs }],
    ['{milliseconds}', { milliseconds: deltaMs }],
  ];
  let dernier = '';
  for (const [nom, delta] of canaux) {
    const issue = await appeler('advanceBusinessClock', [horloge, delta]);
    dernier = `${nom} -> ${court(issue.texte, 200)}`;
    const suivante =
      issue.valeur !== null && issue.valeur !== undefined && typeof issue.valeur === 'object'
        ? issue.valeur
        : horloge;
    const apres = (await lireHorloge(suivante)).ms;
    if (avant !== null && apres !== null && apres - avant === deltaMs) {
      return { horloge: suivante, canal: nom, texte: dernier };
    }
    if (avant === null && apres !== null) {
      return { horloge: suivante, canal: nom, texte: dernier };
    }
  }
  return { horloge, canal: null, texte: dernier };
}

/**
 * Lit l'instant d'une horloge et le compare a un instant ATTENDU venu d'une
 * racine gelee. Le message nomme les deux cotes : une horloge muette et une
 * horloge fausse ne doivent pas produire le meme diagnostic.
 */
async function exigerInstant(horloge: unknown, attenduIso: string, quoi: string): Promise<void> {
  const lu = await lireHorloge(horloge);
  const attendu = Date.parse(attenduIso);
  expect(
    lu.ms === null
      ? `INSTANT-ILLISIBLE ${quoi} : ${court(lu.texte, 300)}`
      : lu.ms === attendu
        ? 'instant-attendu'
        : `INSTANT-FAUX ${quoi} : lu=${new Date(lu.ms).toISOString()} attendu=${attenduIso}`,
  ).toBe('instant-attendu');
}

/* ──────────────────────────────── lecture d'un plan et de ses intentions */

const CHAMPS_LISTE_INTENTIONS =
  /^(intents|intentions|plan|items|entries|offered|offered_intents|intentions_offertes|usages|schedule|steps)$/i;
const CHAMPS_ID = /^(id|intent_id|intentid|intention_id|uid|key|stable_id|stableid|ref)$/i;
const CHAMPS_USAGE = /^(usage|usage_id|usageid|source_usage|from_usage|template|catalog_id)$/i;
const CHAMPS_OPERATION = /^(operation|op|action|verb|kind|command)$/i;
const CHAMPS_AT =
  /^(at|instant|business_instant|businessinstant|instant_metier|instantmetier|business_time|businesstime|when|occurs_at|scheduled_at|timestamp)$/i;
const CHAMPS_ACTEUR = /^(actor|actor_id|acteur|external_actor|party|subject)$/i;
const CHAMPS_TENANT = /^(tenant|tenant_id|locataire)$/i;

interface Intention {
  id: string;
  usage: string | null;
  operation: string | null;
  at: string | null;
  acteur: string | null;
  tenant: string | null;
  brut: Json;
}

function lireIntention(o: Json): Intention | null {
  let id: string | null = null;
  let usage: string | null = null;
  let operation: string | null = null;
  let at: string | null = null;
  let acteur: string | null = null;
  let tenant: string | null = null;
  for (const [k, v] of Object.entries(o)) {
    if (id === null && CHAMPS_ID.test(k) && typeof v === 'string' && v.length > 0) id = v;
    if (usage === null && CHAMPS_USAGE.test(k) && typeof v === 'string' && v.length > 0) usage = v;
    if (operation === null && CHAMPS_OPERATION.test(k) && typeof v === 'string' && v.length > 0) {
      operation = v;
    }
    if (at === null && CHAMPS_AT.test(k)) {
      const ms = instantMs(v);
      if (ms !== null) at = new Date(ms).toISOString();
    }
    if (acteur === null && CHAMPS_ACTEUR.test(k) && typeof v === 'string' && v.length > 0) {
      acteur = v;
    }
    if (tenant === null && CHAMPS_TENANT.test(k) && typeof v === 'string' && v.length > 0) {
      tenant = v;
    }
  }
  if (id === null) return null;
  return { id, usage, operation, at, acteur, tenant, brut: o };
}

/**
 * Extrait la liste d'intentions d'un plan. Cherche d'abord les champs nommes,
 * puis — a defaut — la premiere liste d'objets LISIBLES COMME INTENTIONS
 * rencontree. Une `Map` est traversee : un plan qui indexerait ses intentions
 * par id serait sinon rendu `{}` et une suppression y deviendrait invisible.
 */
function lireIntentions(v: unknown, profondeur = 0): Intention[] | null {
  if (v === null || v === undefined || profondeur > 4) return null;
  if (v instanceof Map) return lireIntentions([...v.values()], profondeur + 1);
  if (v instanceof Set) return lireIntentions([...v], profondeur + 1);
  if (Array.isArray(v)) {
    const lues: Intention[] = [];
    for (const x of v) {
      if (x === null || typeof x !== 'object' || Array.isArray(x)) return null;
      const i = lireIntention(x as Json);
      if (i === null) return null;
      lues.push(i);
    }
    return lues;
  }
  if (typeof v !== 'object') return null;
  const o = v as Json;
  for (const [k, x] of Object.entries(o)) {
    if (!CHAMPS_LISTE_INTENTIONS.test(k)) continue;
    const l = lireIntentions(x, profondeur + 1);
    if (l !== null && l.length > 0) return l;
  }
  for (const x of Object.values(o)) {
    const l = lireIntentions(x, profondeur + 1);
    if (l !== null && l.length > 0) return l;
  }
  return null;
}

/**
 * La CLE D'IDENTITE d'une intention : ce que « les memes intentions » (L223)
 * designe. Elle retient tout ce que le contrat `Intent` (L88) rend observable
 * et que l'implementation a effectivement publie.
 */
function cleIntention(i: Intention): string {
  return [i.id, i.usage ?? '-', i.operation ?? '-', i.at ?? '-', i.acteur ?? '-', i.tenant ?? '-']
    .join('|');
}

const clesDuPlan = (l: Intention[]): string[] => l.map(cleIntention);

/**
 * Les instants metier DISTINCTS que porte un plan, en millisecondes depuis
 * l'epoque. La comparaison est faite sur l'INSTANT et non sur sa graphie :
 * `2030-01-02T12:00:00Z` et `2030-01-02T12:00:00.000Z` sont le meme instant, et
 * L80 impose l'UTC ISO 8601, pas une graphie unique. Un `null` (aucun instant
 * lisible) est conserve tel quel pour que l'assertion le nomme.
 */
function instantsDuPlan(l: Intention[]): (number | null)[] {
  return [...new Set(l.map((i) => (i.at === null ? null : Date.parse(i.at))))];
}

/** Lit un plan, ou echoue par une assertion qui nomme ce qui a ete rendu. */
function exigerPlan(valeur: unknown, quoi: string): Intention[] {
  const l = lireIntentions(valeur);
  expect(
    l === null || l.length === 0
      ? `PLAN-SANS-INTENTIONS-LISIBLES ${quoi} : ${court(rendu(valeur))}`
      : 'plan-lisible',
  ).toBe('plan-lisible');
  return l ?? [];
}

/* ────────────────────── lecture d'un resultat d'execution */

const CHAMPS_LISTE_ISSUES =
  /^(outcomes|issues|results|observations|executed|intents|intentions|entries|items)$/i;
const CHAMPS_STATUT = /^(status|statut|state|etat|outcome|result|verdict|disposition)$/i;
const CHAMPS_REF_RESOLUE =
  /^(resolved|resolved_id|resolvedid|resolved_reference|external_id|externalid|external_ref|externalref|reference|resolution|target)$/i;

type Famille = 'servie' | 'non_servie' | 'echec' | 'refusee' | null;

/**
 * Ramene un statut publie au vocabulaire du cahier. L'ordre des tests compte :
 * « non servie » (L67) doit etre reconnu AVANT « servie », sans quoi la
 * sous-chaine `serv` classerait les deux du meme cote — et A3 verdirait sur
 * exactement la confusion qu'il existe pour interdire.
 */
function familleDuStatut(brut: string): Famille {
  const t = brut.toLowerCase();
  if (/unserved|not[_\s-]?served|non[_\s-]?servie?|unresolv|unmet|unsatisf|no[_\s-]?reference|missing[_\s-]?ref|blocked|deferred/.test(t)) {
    return 'non_servie';
  }
  if (/denied|refus|reject|forbidden|not[_\s-]?found|unauthorized/.test(t)) return 'refusee';
  if (/fail|echec|error|erreur|ko\b/.test(t)) return 'echec';
  if (/served|success|succeeded|reussi|ok\b|done|applied|fulfilled|completed/.test(t)) {
    return 'servie';
  }
  return null;
}

interface IssueIntention {
  id: string;
  statutBrut: string | null;
  famille: Famille;
  refResolue: string | null;
  brut: Json;
}

function lireIssueIntention(o: Json): IssueIntention | null {
  let id: string | null = null;
  let statutBrut: string | null = null;
  let refResolue: string | null = null;
  const visiter = (x: Json, profondeur: number): void => {
    for (const [k, v] of Object.entries(x)) {
      if (id === null && CHAMPS_ID.test(k) && typeof v === 'string' && v.length > 0) id = v;
      if (statutBrut === null && CHAMPS_STATUT.test(k) && typeof v === 'string' && v.length > 0) {
        statutBrut = v;
      }
      if (refResolue === null && CHAMPS_REF_RESOLUE.test(k) && typeof v === 'string' && v.length > 0) {
        refResolue = v;
      }
      if (profondeur < 2 && v !== null && typeof v === 'object' && !Array.isArray(v)) {
        visiter(v as Json, profondeur + 1);
      }
    }
  };
  visiter(o, 0);
  if (id === null) return null;
  return {
    id,
    statutBrut,
    famille: statutBrut === null ? null : familleDuStatut(statutBrut),
    refResolue,
    brut: o,
  };
}

function lireIssues(v: unknown, profondeur = 0): IssueIntention[] | null {
  if (v === null || v === undefined || profondeur > 4) return null;
  if (v instanceof Map) return lireIssues([...v.values()], profondeur + 1);
  if (v instanceof Set) return lireIssues([...v], profondeur + 1);
  if (Array.isArray(v)) {
    const lues: IssueIntention[] = [];
    for (const x of v) {
      if (x === null || typeof x !== 'object' || Array.isArray(x)) return null;
      const i = lireIssueIntention(x as Json);
      if (i === null) return null;
      lues.push(i);
    }
    return lues;
  }
  if (typeof v !== 'object') return null;
  const o = v as Json;
  for (const [k, x] of Object.entries(o)) {
    if (!CHAMPS_LISTE_ISSUES.test(k)) continue;
    const l = lireIssues(x, profondeur + 1);
    if (l !== null && l.length > 0) return l;
  }
  for (const x of Object.values(o)) {
    const l = lireIssues(x, profondeur + 1);
    if (l !== null && l.length > 0) return l;
  }
  return null;
}

function exigerIssues(valeur: unknown, quoi: string): IssueIntention[] {
  const l = lireIssues(valeur);
  expect(
    l === null || l.length === 0
      ? `RESULTAT-SANS-ISSUES-LISIBLES ${quoi} : ${court(rendu(valeur))}`
      : 'issues-lisibles',
  ).toBe('issues-lisibles');
  return l ?? [];
}

/* ── compteurs agreges : lus par FAMILLE de chemin, jamais recalcules ──── */

const FAMILLE_METIER = /business|metier|m[ée]tier|usage|journey|parcours|functional|fonctionnel/i;
const FAMILLE_CONFORMITE =
  /compliance|conformit|security|securit|s[ée]curit|criticality|criticit|negative|negatif|probe|audit/i;

const CHAMP_OFFERT = /^(offered|offert|offertes|proposed|proposees|planned|total|count)$/i;
const CHAMP_REUSSI = /^(served|succeeded|success|successes|reussi|reussies|passed|ok)$/i;
const CHAMP_ECHEC = /^(failed|failures|failure|echec|echecs|errors|ko)$/i;
const CHAMP_COMPTE = /^(count|total|attempts|essais|probes|checked|evaluated|observed|n)$/i;
const CHAMP_REFUSE = /^(denied|refused|refuses|refusees|rejected|blocked|not_found|notfound)$/i;

interface Compteur {
  valeur: number;
  chemin: string;
}

/**
 * Cherche un compteur NUMERIQUE dont le CHEMIN traverse un segment de la
 * famille demandee et dont la feuille porte un nom de la liste attendue. Les
 * compteurs sont lus chez l'implementation — jamais recalcules par la suite :
 * A4 porte precisement sur le COMPTAGE, et une suite qui recompterait
 * elle-meme ne l'observerait pas.
 */
function compteur(
  racine: unknown,
  famille: RegExp,
  champ: RegExp,
): Compteur | null {
  const trouves: Compteur[] = [];
  const visiter = (v: unknown, chemin: string[], dansLaFamille: boolean, profondeur: number): void => {
    if (v === null || v === undefined || profondeur > 6) return;
    if (v instanceof Map) {
      for (const [k, x] of v.entries()) visiter(x, [...chemin, String(k)], dansLaFamille || famille.test(String(k)), profondeur + 1);
      return;
    }
    if (Array.isArray(v)) return;
    if (typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Json)) {
      const ici = dansLaFamille || famille.test(k);
      if (ici && typeof x === 'number' && Number.isFinite(x) && champ.test(k)) {
        trouves.push({ valeur: x, chemin: [...chemin, k].join('.') });
      }
      visiter(x, [...chemin, k], ici, profondeur + 1);
    }
  };
  visiter(racine, [], false, 0);
  if (trouves.length === 0) return null;
  trouves.sort((a, b) => a.chemin.split('.').length - b.chemin.split('.').length);
  return trouves[0] ?? null;
}

function exigerCompteur(
  racine: unknown,
  famille: RegExp,
  champ: RegExp,
  quoi: string,
): Compteur {
  const c = compteur(racine, famille, champ);
  expect(
    c === null ? `COMPTEUR-ABSENT ${quoi} : ${court(rendu(racine), 900)}` : 'compteur-present',
  ).toBe('compteur-present');
  return c ?? { valeur: Number.NaN, chemin: '(absent)' };
}

/* ─────────────────────────────────────────────── le MONDE que la suite sert */

interface AppelDuMonde {
  intentId: string | null;
  usage: string | null;
  recu: Json;
}

interface Monde {
  handle: (...a: unknown[]) => unknown;
  appels: AppelDuMonde[];
}

/**
 * Fabrique le monde contre lequel un plan s'execute. `verdicts` associe un id
 * d'usage a l'issue que le monde rend.
 *
 * Le monde est a la fois une FONCTION et un OBJET portant sept alias de point
 * d'entree : la generosite est du cote de la suite. Une implementation qui
 * n'appelle aucun de ces noms ne peut pas servir une seule intention, et c'est
 * le CONTENU du resultat — pas le nom du point d'entree — qui la recale.
 */
function monde(verdicts: Record<string, Json>): Monde {
  const appels: AppelDuMonde[] = [];
  const handle = (...a: unknown[]): Json => {
    const premier = a.find((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
    const recu = (premier ?? {}) as Json;
    const lue = lireIntention(recu);
    const usage = lue?.usage ?? lue?.operation ?? lue?.id ?? null;
    appels.push({ intentId: lue?.id ?? null, usage, recu });
    const cle = [lue?.usage, lue?.operation, lue?.id].find(
      (k): k is string => typeof k === 'string' && Object.prototype.hasOwnProperty.call(verdicts, k),
    );
    const verdict = cle === undefined ? undefined : verdicts[cle];
    return verdict ?? { ok: true, external_id: `EXT-${String(lue?.id ?? 'INCONNU')}` };
  };
  const m = handle as unknown as Monde & Record<string, unknown>;
  for (const alias of ['perform', 'execute', 'run', 'call', 'handle', 'apply', 'send']) {
    Object.defineProperty(m, alias, { value: handle, enumerable: true, writable: false });
  }
  Object.defineProperty(m, 'appels', { value: appels, enumerable: false, writable: false });
  return m as unknown as Monde;
}

/* ────────────────────────────────────────────── entrees fabriquees par la suite

   §F n'inscrit « la nature des intentions derriere les cardinaux » nulle part
   (F-QUALITY, `non_fixe_par_le_cahier`). Les catalogues ci-dessous sont donc
   des ENTREES de la suite : aucune assertion ne les compare a une constante du
   cahier. Seuls leurs CARDINAUX, lus dans la racine gelee, sont attendus. */

interface Usage {
  id: string;
  operation: string;
  requires: string[];
  produces: string | null;
  kind?: string;
  tenant?: string;
  actor?: string;
}

/**
 * Les QUATRE usages du catalogue de F-QUALITY. Trois d'entre eux exigent une
 * donnee que le candidat n'a PAS creee : c'est ce qui donne prise a la
 * perturbation d'A2 (« ne proposer que les usages dont le candidat a deja cree
 * la donnee, donc moins de quatre »). Un generateur qui filtrerait sur
 * `candidate_state` n'en offrirait qu'un.
 */
const CATALOGUE_QUALITY: Usage[] = [
  { id: 'U-LISTER', operation: 'list', requires: [], produces: null },
  { id: 'U-LIRE', operation: 'read', requires: ['H-DOSSIER'], produces: null },
  { id: 'U-MODIFIER', operation: 'update', requires: ['H-DOSSIER'], produces: null },
  { id: 'U-SUPPRIMER', operation: 'delete', requires: ['H-DOSSIER'], produces: null },
];

/** Le temoin anti-constante d'A2 : deux usages doivent donner deux intentions. */
const CATALOGUE_DEUX: Usage[] = [
  { id: 'U-LISTER', operation: 'list', requires: [], produces: null },
  { id: 'U-LIRE', operation: 'read', requires: ['H-DOSSIER'], produces: null },
];

/** Le candidat n'a cree AUCUNE donnee (L223). */
const CANDIDAT_VIERGE = { created: [] as string[] };

const GRAINE = 'GRAINE-T08-1';
const GRAINE_AUTRE = 'GRAINE-T08-2';
const SCENARIO = 'SCN-RESERVATION-4P';

/** Le catalogue d'A1 : quatre usages de reservation sur le creneau scelle. */
const CATALOGUE_RESERVATION: Usage[] = [
  { id: 'U-RESERVER-A', operation: 'reserve', requires: [], produces: 'H-RES-A', actor: ACTEUR_A },
  { id: 'U-RESERVER-B', operation: 'reserve', requires: [], produces: 'H-RES-B', actor: ACTEUR_B },
  { id: 'U-RESERVER-C', operation: 'reserve', requires: [], produces: 'H-RES-C', actor: ACTEUR_C },
  { id: 'U-CONSULTER', operation: 'read', requires: [], produces: null, actor: ACTEUR_A },
];

/** Le temoin anti-constante d'A1 : un catalogue DIFFERENT, donc un plan different. */
const CATALOGUE_AUTRE: Usage[] = [
  { id: 'U-ANNULER-A', operation: 'cancel', requires: [], produces: null, actor: ACTEUR_A },
  { id: 'U-CONSULTER-B', operation: 'read', requires: [], produces: null, actor: ACTEUR_B },
];

/** La chaine de dependance d'A3 : U-CREER produit le handle dont U-DEPEND depend. */
const CATALOGUE_CHAINE: Usage[] = [
  { id: 'U-CREER', operation: 'reserve', requires: [], produces: 'H-RES-1', actor: ACTEUR_A },
  { id: 'U-DEPEND', operation: 'cancel', requires: ['H-RES-1'], produces: null, actor: ACTEUR_A },
];

/**
 * Le catalogue d'A4 : deux parcours metier VALIDES et deux ESSAIS NEGATIFS DE
 * SECURITE. Les essais negatifs sont ceux du contrat intertenant de §F : un
 * acteur du locataire `other` qui tente de lire et de modifier une reservation
 * `legacy`, et a qui la fixture repond `NOT_FOUND` (L123).
 */
const CATALOGUE_SECURITE: Usage[] = [
  { id: 'U-METIER-1', operation: 'reserve', requires: [], produces: 'H-RES-1', kind: 'business', actor: ACTEUR_A, tenant: LOCATAIRE },
  { id: 'U-METIER-2', operation: 'read', requires: [], produces: null, kind: 'business', actor: ACTEUR_B, tenant: LOCATAIRE },
  { id: 'U-SECU-LIRE', operation: 'read', requires: [], produces: null, kind: 'security-negative', actor: 'O1', tenant: LOCATAIRE_AUTRE },
  { id: 'U-SECU-ECRIRE', operation: 'cancel', requires: [], produces: null, kind: 'security-negative', actor: 'O1', tenant: LOCATAIRE_AUTRE },
];

interface EntreePlan extends Json {
  scenario: string;
  seed: string;
  tenant: string;
  actors: string[];
  usages: Usage[];
  candidate_state: { created: string[] };
}

function entree(usages: Usage[], options: Partial<EntreePlan> = {}): EntreePlan {
  return {
    scenario: SCENARIO,
    seed: GRAINE,
    tenant: LOCATAIRE,
    actors: ACTEURS,
    slot: CRENEAU_ID,
    usages,
    candidate_state: CANDIDAT_VIERGE,
    ...options,
  } as EntreePlan;
}

const generer = (e: Json): Promise<Issue> => appeler('generateIntentPlan', [e]);
const executer = (plan: unknown, m: Monde): Promise<Issue> =>
  appeler('executeIntentPlan', [plan, m]);

const creerHorloge = (start: string): Promise<Issue> =>
  appeler('createBusinessClock', [{ start }]);

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T08 — generer et executer les intentions d usage', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T08.A1 meme scenario et meme graine donnent les memes intentions, meme avec un nombre de workers different',
    async () => {
      assertLoaded();
      assertContrat('createBusinessClock', 'generateIntentPlan');

      // L'INSTANT METIER DES INTENTIONS VIENT DE L'HORLOGE METIER (L88, L221).
      // La MEME horloge sert a toutes les generations de ce cas : sans cela,
      // deux plans dateraient d'instants differents et l'egalite comparerait
      // autre chose que ce que le cas affirme.
      const horloge = exigerAccepte(
        await creerHorloge(HORLOGE_INITIALE),
        'horloge metier de reference',
      );
      const base = entree(CATALOGUE_RESERVATION, { clock: horloge });

      // (0) LE PLAN DE REFERENCE N'EST PAS TRIVIAL. Sans cela, « invariant » ne
      //     voudrait rien dire : l'egalite de deux plans VIDES est une
      //     tautologie. Le cardinal attendu est celui du catalogue fourni, que
      //     L225 exige CONSERVE (« conservation du nombre d'intentions
      //     offertes »).
      const reference = exigerPlan(
        exigerAccepte(await generer(base), 'plan de reference'),
        'plan de reference',
      );
      const clesRef = clesDuPlan(reference);
      expect(clesRef.length).toBe(CATALOGUE_RESERVATION.length); // cahier:L225
      // « id STABLE » (L88) : deux intentions ne peuvent pas partager le leur.
      expect(new Set(reference.map((i) => i.id)).size).toBe(reference.length); // cahier:L88
      // « instant metier » (L88) : il vient de l'horloge metier fournie.
      expect(instantsDuPlan(reference)).toEqual([Date.parse(HORLOGE_INITIALE)]); // cahier:L88

      // (1) PREMIERE MOITIE DE L'ENONCE : « meme scenario/graine donne les
      //     memes intentions ». Deux appels a entree identique, deux plans
      //     identiques — c'est aussi ce que L143 exige d'une suite seedee :
      //     « rejouer une suite avec la meme graine et version d'algorithme
      //     donne la meme suite ».
      const rejeu = exigerPlan(
        exigerAccepte(
          await generer(entree(CATALOGUE_RESERVATION, { clock: horloge })),
          'rejeu a graine egale',
        ),
        'rejeu a graine egale',
      );
      expect(clesDuPlan(rejeu)).toEqual(clesRef); // cahier:L223

      // (2) SECONDE MOITIE DE L'ENONCE : le nombre de workers ne change rien.
      //     Le nombre de workers est une option d'EXECUTION ; trois canaux
      //     documentes sont essayes, et toute generation ACCEPTEE doit rendre
      //     le meme plan, dans le meme ORDRE — la perturbation que
      //     verification/cases.lock.json prescrit ordonne les intentions « par
      //     ordre d'achevement au lieu d'une cle stable », ce qui ne se voit
      //     que sur une egalite ORDONNEE.
      const canaux = ['workers', 'worker_count', 'concurrency'] as const;
      const observes: string[] = [];
      for (const n of [1, 6]) {
        for (const canal of canaux) {
          const issue = await generer(
            entree(CATALOGUE_RESERVATION, { clock: horloge, [canal]: n }),
          );
          if (issue.refuse) continue;
          const plan = lireIntentions(issue.valeur);
          if (plan === null) continue;
          observes.push(`${canal}=${String(n)}`);
          expect(clesDuPlan(plan)).toEqual(clesRef); // cahier:L223
          expect(plan.length).toBe(CATALOGUE_RESERVATION.length); // cahier:L225
        }
      }
      // Sans observation, l'invariance ne serait affirmee sur rien.
      expect(
        observes.filter((o) => o.endsWith('=1')).length > 0
          ? 'un-worker-observe'
          : `AUCUN-CANAL-DE-WORKERS-ACCEPTE-A-1 essayes=[${canaux.join(',')}]`,
      ).toBe('un-worker-observe');
      expect(
        observes.filter((o) => o.endsWith('=6')).length > 0
          ? 'six-workers-observes'
          : `AUCUN-CANAL-DE-WORKERS-ACCEPTE-A-6 essayes=[${canaux.join(',')}]`,
      ).toBe('six-workers-observes');

      // (3) TEMOIN ANTI-CONSTANTE, decisif ici. verification/cases.lock.json le
      //     nomme pour ce cas : « un stub constant garderait ce cas vert ». Un
      //     catalogue d'usages DIFFERENT doit produire un plan DIFFERENT.
      const autre = exigerPlan(
        exigerAccepte(
          await generer(entree(CATALOGUE_AUTRE, { clock: horloge })),
          'temoin catalogue different',
        ),
        'temoin catalogue different',
      );
      expect(clesDuPlan(autre)).not.toEqual(clesRef);
      expect(autre.length).toBe(CATALOGUE_AUTRE.length); // cahier:L225

      // (4) CONSERVATION A GRAINE DIFFERENTE. §H n'exige pas qu'une graine
      //     differente CHANGE le plan — la suite n'invente donc pas cette
      //     exigence. Elle observe la seule propriete que L225 enonce : le
      //     nombre d'intentions offertes est conserve.
      const autreGraine = exigerPlan(
        exigerAccepte(
          await generer(entree(CATALOGUE_RESERVATION, { clock: horloge, seed: GRAINE_AUTRE })),
          'plan a graine differente',
        ),
        'plan a graine differente',
      );
      expect(autreGraine.length).toBe(clesRef.length); // cahier:L225

      console.log(
        `[T08.A1] via=${LOADED.via.join(',')} canaux=${observes.join(',') || '(aucun)'} ` +
          `reference=${clesRef.length} temoin-autre-catalogue=${autre.length} ` +
          `autre-graine=${autreGraine.length}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T08.A2 les quatre usages de F-QUALITY sont proposes meme si le candidat n a cree aucune donnee',
    async () => {
      assertLoaded();
      assertContrat('createBusinessClock', 'generateIntentPlan');

      const horloge = exigerAccepte(
        await creerHorloge(HORLOGE_INITIALE),
        'horloge metier de reference',
      );

      // (0) LA REFERENCE DIT BIEN CE QUE LE CAS AFFIRME. « Les QUATRE usages »
      //     n'est pas ecrit en dur ici : c'est le cardinal des intentions
      //     offertes en P1, lu dans la racine gelee F-QUALITY.
      expect(OFFERTES.length).toBe(NB_PERIODES); // cahier:L107
      expect(REUSSIES.length).toBe(NB_PERIODES); // cahier:L107
      expect(USAGES_DE_QUALITY).toBe(4); // cahier:L107 — « intentions offertes [4,4,0,2] »
      expect(CATALOGUE_QUALITY.length).toBe(USAGES_DE_QUALITY);
      // Le catalogue donne bien prise a la perturbation : au moins un usage
      // exige une donnee que le candidat n'a pas creee.
      expect(
        CATALOGUE_QUALITY.filter((u) => u.requires.length > 0).length > 0,
      ).toBe(true);
      expect(CANDIDAT_VIERGE.created).toEqual([]); // cahier:L223

      // (1) L'ENONCE : les quatre usages sont TOUJOURS proposes, alors meme que
      //     le candidat n'a cree aucune donnee.
      const plan = exigerPlan(
        exigerAccepte(
          await generer(
            entree(CATALOGUE_QUALITY, { clock: horloge, candidate_state: CANDIDAT_VIERGE }),
          ),
          'plan sur candidat vierge',
        ),
        'plan sur candidat vierge',
      );
      expect(plan.length).toBe(USAGES_DE_QUALITY); // cahier:L107 + L223

      // (2) CE SONT BIEN LES QUATRE USAGES, ET NON QUATRE FOIS LE MEME. Sans
      //     cela, « les quatre usages sont proposes » serait satisfait par un
      //     plan qui repete l'unique usage sans prerequis.
      const usagesProposes = plan
        .map((i) => i.usage ?? i.operation ?? i.id)
        .map(String);
      expect(new Set(usagesProposes).size).toBe(USAGES_DE_QUALITY); // cahier:L223
      for (const u of CATALOGUE_QUALITY) {
        expect(
          usagesProposes.some((p) => p.includes(u.id)) ||
            plan.some((i) => rendu(i.brut).includes(u.id))
            ? `usage-propose:${u.id}`
            : `USAGE-NON-PROPOSE ${u.id} — proposes=[${usagesProposes.join(',')}]`,
        ).toBe(`usage-propose:${u.id}`); // cahier:L223
      }

      // (3) TEMOIN ANTI-CONSTANTE. Un generateur qui rendrait invariablement
      //     quatre intentions satisferait (1) sans rien proposer : un catalogue
      //     de DEUX usages doit donner DEUX intentions. C'est aussi la moitie
      //     manquante de « conservation du nombre d'intentions offertes ».
      const deux = exigerPlan(
        exigerAccepte(
          await generer(
            entree(CATALOGUE_DEUX, { clock: horloge, candidate_state: CANDIDAT_VIERGE }),
          ),
          'temoin catalogue a deux usages',
        ),
        'temoin catalogue a deux usages',
      );
      expect(deux.length).toBe(CATALOGUE_DEUX.length); // cahier:L225
      expect(deux.length).not.toBe(USAGES_DE_QUALITY);

      // (4) LE CANDIDAT AYANT DEJA CREE LA DONNEE N'EN RECOIT PAS PLUS : le
      //     cardinal ne depend pas de l'etat du candidat, dans les deux sens.
      const servi = exigerPlan(
        exigerAccepte(
          await generer(
            entree(CATALOGUE_QUALITY, {
              clock: horloge,
              candidate_state: { created: ['H-DOSSIER'] },
            }),
          ),
          'plan sur candidat ayant cree la donnee',
        ),
        'plan sur candidat ayant cree la donnee',
      );
      expect(servi.length).toBe(USAGES_DE_QUALITY); // cahier:L225

      console.log(
        `[T08.A2] offerts=${plan.length} attendu=${USAGES_DE_QUALITY} ` +
          `usages=[${usagesProposes.join(',')}] temoin-deux=${deux.length} ` +
          `candidat-servi=${servi.length}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T08.A3 une reference manquante apres un echec anterieur produit une intention non servie, pas une suppression',
    async () => {
      assertLoaded();
      assertContrat('createBusinessClock', 'generateIntentPlan', 'executeIntentPlan');

      const horloge = exigerAccepte(
        await creerHorloge(HORLOGE_INITIALE),
        'horloge metier de reference',
      );
      const planBrut = exigerAccepte(
        await generer(entree(CATALOGUE_CHAINE, { clock: horloge })),
        'plan de la chaine de dependance',
      );
      const plan = exigerPlan(planBrut, 'plan de la chaine de dependance');
      expect(plan.length).toBe(CATALOGUE_CHAINE.length); // cahier:L225

      const idDe = (usageId: string): string | null =>
        plan.find((i) => (i.usage ?? i.operation ?? i.id) === usageId || i.id.includes(usageId))
          ?.id ?? null;
      const idCreer = idDe('U-CREER');
      const idDepend = idDe('U-DEPEND');
      expect(
        idCreer !== null && idDepend !== null
          ? 'intentions-identifiees'
          : `INTENTIONS-NON-IDENTIFIEES creer=${String(idCreer)} depend=${String(idDepend)} ` +
              `plan=${court(rendu(plan.map((i) => i.brut)))}`,
      ).toBe('intentions-identifiees');

      // (1) CONTROLE POSITIF — LA RESOLUTION D'IDENTIFIANTS EXTERNES MARCHE.
      //     Sans lui, « non servie » serait indistinguable d'un executeur qui
      //     ne sert jamais rien : verification/cases.lock.json classe ce cas
      //     `behaviour`, mais l'enonce porte sur une PRESENCE conditionnelle,
      //     et un executeur mort la satisferait a vide.
      const EXTERNE = 'EXT-REEL-1';
      const mondeOk = monde({
        'U-CREER': { ok: true, external_id: EXTERNE },
      });
      const resOk = exigerAccepte(
        await executer(planBrut, mondeOk),
        'execution ou la creation reussit',
      );
      const issuesOk = exigerIssues(resOk, 'execution ou la creation reussit');
      expect(issuesOk.length).toBe(plan.length); // cahier:L225
      const okCreer = issuesOk.find((i) => i.id === idCreer);
      const okDepend = issuesOk.find((i) => i.id === idDepend);
      expect(
        okCreer?.famille === 'servie'
          ? 'creation-servie'
          : `CREATION-NON-SERVIE statut=${String(okCreer?.statutBrut)} ` +
              `issues=${court(rendu(issuesOk.map((i) => i.brut)))}`,
      ).toBe('creation-servie');
      expect(
        okDepend?.famille === 'servie'
          ? 'dependante-servie'
          : `DEPENDANTE-NON-SERVIE-ALORS-QUE-LA-REFERENCE-EXISTE statut=${String(okDepend?.statutBrut)}`,
      ).toBe('dependante-servie');
      // L'identifiant externe REELLEMENT rendu par le monde est celui qui
      // parvient a l'intention dependante — c'est la « resolution
      // d'identifiants externes » de L221, et non une resolution symbolique.
      const recuParLaDependante = mondeOk.appels.find((a) => a.intentId === idDepend);
      expect(
        recuParLaDependante !== undefined
          ? 'monde-appele-pour-la-dependante'
          : `MONDE-NON-APPELE-POUR-LA-DEPENDANTE appels=${court(rendu(mondeOk.appels))}`,
      ).toBe('monde-appele-pour-la-dependante');
      expect(
        rendu(recuParLaDependante?.recu ?? {}).includes(EXTERNE) ||
          (okDepend?.refResolue ?? '') === EXTERNE
          ? 'reference-resolue'
          : `REFERENCE-NON-RESOLUE attendu=${EXTERNE} ` +
              `recu=${court(rendu(recuParLaDependante?.recu ?? {}), 400)} ` +
              `resolue=${String(okDepend?.refResolue)}`,
      ).toBe('reference-resolue'); // cahier:L221

      // (2) L'ENONCE — L'ECHEC ANTERIEUR NE SUPPRIME PAS L'INTENTION. Meme
      //     plan, meme monde, une seule difference : la creation echoue.
      const mondeKo = monde({
        'U-CREER': { ok: false, code: 'BACKEND_UNAVAILABLE' },
      });
      const resKo = exigerAccepte(
        await executer(planBrut, mondeKo),
        'execution ou la creation echoue',
      );
      const issuesKo = exigerIssues(resKo, 'execution ou la creation echoue');

      // « pas une suppression » : le CARDINAL est conserve, et l'intention
      // dependante est PRESENTE. C'est l'invariant D-5 (L67 : « un echec
      // conserve […] ses intentions non servies ») et la phrase de fin de T08
      // (L225 : « conservation du nombre d'intentions offertes »).
      expect(issuesKo.length).toBe(plan.length); // cahier:L67 + L225
      expect(issuesKo.length).toBe(issuesOk.length); // cahier:L225
      expect(issuesKo.map((i) => i.id).sort()).toEqual(issuesOk.map((i) => i.id).sort()); // cahier:L67
      const koDepend = issuesKo.find((i) => i.id === idDepend);
      expect(
        koDepend !== undefined
          ? 'intention-dependante-presente'
          : `INTENTION-DEPENDANTE-SUPPRIMEE id=${String(idDepend)} ` +
              `issues=${court(rendu(issuesKo.map((i) => i.brut)))}`,
      ).toBe('intention-dependante-presente'); // cahier:L223

      // « produit une intention NON SERVIE » : le statut publie appartient a la
      // famille `non servie`, et PAS a la famille `servie`.
      expect(
        koDepend?.famille === 'non_servie'
          ? 'non-servie'
          : `STATUT-HORS-FAMILLE-NON-SERVIE statut=${String(koDepend?.statutBrut)} ` +
              `famille=${String(koDepend?.famille)}`,
      ).toBe('non-servie'); // cahier:L67 + L223
      expect(koDepend?.famille).not.toBe('servie');

      console.log(
        `[T08.A3] plan=${plan.length} issues-ok=${issuesOk.length} issues-ko=${issuesKo.length} ` +
          `depend-ok=${String(okDepend?.statutBrut)} depend-ko=${String(koDepend?.statutBrut)} ` +
          `appels-ok=${mondeOk.appels.length} appels-ko=${mondeKo.appels.length}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T08.A4 les essais negatifs de securite alimentent conformite et criticite sans gonfler les echecs des parcours metier valides',
    async () => {
      assertLoaded();
      assertContrat('createBusinessClock', 'generateIntentPlan', 'executeIntentPlan');

      const horloge = exigerAccepte(
        await creerHorloge(HORLOGE_INITIALE),
        'horloge metier de reference',
      );
      const metiers = CATALOGUE_SECURITE.filter((u) => u.kind === 'business');
      const negatifs = CATALOGUE_SECURITE.filter((u) => u.kind === 'security-negative');
      expect([metiers.length, negatifs.length]).toEqual([2, 2]);

      const planBrut = exigerAccepte(
        await generer(entree(CATALOGUE_SECURITE, { clock: horloge })),
        'plan metier + essais negatifs',
      );
      const plan = exigerPlan(planBrut, 'plan metier + essais negatifs');
      expect(plan.length).toBe(CATALOGUE_SECURITE.length); // cahier:L225

      // Le monde repond a chaque essai negatif ce que le contrat intertenant de
      // §F prescrit : « NOT_FOUND sans donnee metier divulguee » (L123). Les
      // deux parcours metier valides, eux, reussissent.
      const refusIntertenant: Json = { ok: false, denied: true, code: CODE_NOT_FOUND };
      const mondeSain = monde({
        'U-SECU-LIRE': refusIntertenant,
        'U-SECU-ECRIRE': refusIntertenant,
      });
      const resSain = exigerAccepte(
        await executer(planBrut, mondeSain),
        'execution avec essais negatifs correctement refuses',
      );

      // (1) CONTROLE POSITIF — « MAKE PRESENT ». verification/cases.lock.json
      //     classe ce cas `absence` : « un cas d'absence passe trivialement
      //     quand tout est casse ». On exige donc D'ABORD que les essais
      //     negatifs soient PRESENTS du cote conformite/criticite.
      const conformite = exigerCompteur(
        resSain,
        FAMILLE_CONFORMITE,
        CHAMP_COMPTE,
        'compteur de conformite/criticite',
      );
      expect(conformite.valeur).toBe(negatifs.length); // cahier:L223
      const refuses = exigerCompteur(
        resSain,
        FAMILLE_CONFORMITE,
        CHAMP_REFUSE,
        'compteur des essais negatifs refuses',
      );
      expect(refuses.valeur).toBe(negatifs.length); // cahier:L123 + L223

      // (2) CONTROLE POSITIF DU COMPTEUR D'ECHECS METIER. Sans lui, « echecs
      //     metier = 0 » serait satisfait par un compteur constamment nul —
      //     exactement le faux PASS que ce mode de preuve existe pour
      //     interdire. Meme plan, meme monde, une seule difference : UN parcours
      //     metier valide echoue reellement.
      const mondeMetierCasse = monde({
        'U-SECU-LIRE': refusIntertenant,
        'U-SECU-ECRIRE': refusIntertenant,
        'U-METIER-2': { ok: false, code: 'BACKEND_UNAVAILABLE' },
      });
      const resMetierCasse = exigerAccepte(
        await executer(planBrut, mondeMetierCasse),
        'execution avec un parcours metier reellement en echec',
      );
      const echecsTemoin = exigerCompteur(
        resMetierCasse,
        FAMILLE_METIER,
        CHAMP_ECHEC,
        'compteur d echecs metier, temoin',
      );
      expect(echecsTemoin.valeur).toBe(1); // cahier:L223

      // (3) L'ENONCE — L'ABSENCE. Les deux essais negatifs, correctement
      //     refuses, NE GONFLENT PAS les echecs des parcours metier valides, et
      //     n'entrent ni au numerateur ni au denominateur du comptage metier.
      const echecs = exigerCompteur(
        resSain,
        FAMILLE_METIER,
        CHAMP_ECHEC,
        'compteur d echecs metier',
      );
      expect(echecs.valeur).toBe(0); // cahier:L223
      const offerts = exigerCompteur(
        resSain,
        FAMILLE_METIER,
        CHAMP_OFFERT,
        'compteur d intentions metier offertes',
      );
      expect(offerts.valeur).toBe(metiers.length); // cahier:L223
      expect(offerts.valeur).not.toBe(CATALOGUE_SECURITE.length);
      const reussis = exigerCompteur(
        resSain,
        FAMILLE_METIER,
        CHAMP_REUSSI,
        'compteur d intentions metier reussies',
      );
      expect(reussis.valeur).toBe(metiers.length); // cahier:L223

      // (4) CONSERVATION MALGRE TOUT : aucune intention n'a disparu du
      //     resultat, essais negatifs compris (L225).
      const issues = exigerIssues(resSain, 'execution avec essais negatifs');
      expect(issues.length).toBe(plan.length); // cahier:L225

      console.log(
        `[T08.A4] conformite=${conformite.valeur}@${conformite.chemin} ` +
          `refuses=${refuses.valeur}@${refuses.chemin} ` +
          `echecs-metier=${echecs.valeur}@${echecs.chemin} ` +
          `temoin-echec=${echecsTemoin.valeur}@${echecsTemoin.chemin} ` +
          `offerts=${offerts.valeur} reussis=${reussis.valeur} issues=${issues.length}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T08.A5 avancer le temps metier de A ne change pas celui de B',
    async () => {
      assertLoaded();
      assertContrat('createBusinessClock', 'readBusinessClock', 'advanceBusinessClock');

      const issueA = await creerHorloge(HORLOGE_INITIALE);
      const issueB = await creerHorloge(HORLOGE_INITIALE);
      exigerPasDePlantage(issueA, 'creation de l horloge A');
      const horlogeA = exigerAccepte(issueA, 'creation de l horloge A');
      const horlogeB = exigerAccepte(issueB, 'creation de l horloge B');

      // (0) LES DEUX HORLOGES PARTENT OU ON LE DEMANDE. Une horloge constante
      //     qui repondrait autre chose que l'instant scelle tombe ici.
      await exigerInstant(horlogeA, HORLOGE_INITIALE, 'horloge A a la creation'); // cahier:L119
      await exigerInstant(horlogeB, HORLOGE_INITIALE, 'horloge B a la creation'); // cahier:L119
      expect(
        horlogeA === horlogeB
          ? 'HORLOGES-PARTAGEES : createBusinessClock a rendu deux fois la meme poignee'
          : 'horloges-distinctes',
      ).toBe('horloges-distinctes'); // cahier:L221

      // (1) CONTROLE POSITIF — « MAKE PRESENT ». verification/cases.lock.json
      //     classe ce cas `absence` : « une horloge stube constante laisserait
      //     le cas vert ». On exige donc D'ABORD que l'avance DEPLACE
      //     REELLEMENT A, du delai scelle par F-RESERVATION.
      const avanceA = await avancer(horlogeA, DELAI_HEURES * H_MS);
      expect(
        avanceA.canal !== null
          ? 'horloge-A-avancee'
          : `AVANCE-SANS-EFFET-SUR-A canaux essayes=[ms-nu,{ms},{milliseconds}] ` +
              `dernier=${court(avanceA.texte, 300)}`,
      ).toBe('horloge-A-avancee'); // cahier:L221
      const attenduA = new Date(Date.parse(HORLOGE_INITIALE) + DELAI_HEURES * H_MS).toISOString();
      await exigerInstant(avanceA.horloge, attenduA, 'horloge A apres 24 h metier'); // cahier:L119

      // (2) L'ENONCE — L'ABSENCE. B n'a pas bouge.
      await exigerInstant(horlogeB, HORLOGE_INITIALE, 'horloge B apres l avance de A'); // cahier:L223

      // (3) SYMETRIE. Sans elle, « B n'a pas bouge » serait satisfait par une
      //     implementation ou seule la PREMIERE horloge est vivante : avancer B
      //     doit deplacer B, et laisser A exactement ou l'avance (1) l'a mis.
      const avanceB = await avancer(horlogeB, H_MS);
      expect(
        avanceB.canal !== null
          ? 'horloge-B-avancee'
          : `AVANCE-SANS-EFFET-SUR-B dernier=${court(avanceB.texte, 300)}`,
      ).toBe('horloge-B-avancee');
      const attenduB = new Date(Date.parse(HORLOGE_INITIALE) + H_MS).toISOString();
      await exigerInstant(avanceB.horloge, attenduB, 'horloge B apres sa propre avance');
      await exigerInstant(avanceA.horloge, attenduA, 'horloge A apres l avance de B'); // cahier:L223

      const lueA = await lireHorloge(avanceA.horloge);
      const lueB = await lireHorloge(avanceB.horloge);
      expect(lueA.ms === lueB.ms ? `HORLOGES-CONFONDUES a ${String(lueA.ms)}` : 'horloges-separees')
        .toBe('horloges-separees'); // cahier:L223

      console.log(
        `[T08.A5] canal-A=${String(avanceA.canal)} canal-B=${String(avanceB.canal)} ` +
          `A=${lueA.ms === null ? 'illisible' : new Date(lueA.ms).toISOString()} ` +
          `B=${lueB.ms === null ? 'illisible' : new Date(lueB.ms).toISOString()} ` +
          `depart=${HORLOGE_INITIALE}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T08.A6 la frontiere des 24 h se controle sans attendre 24 heures physiques',
    async () => {
      assertLoaded();
      assertContrat(
        'createBusinessClock',
        'readBusinessClock',
        'advanceBusinessClock',
        'generateIntentPlan',
      );

      // (0) CONTROLE DE LA RACINE GELEE ELLE-MEME. La frontiere scellee est
      //     bien « debut moins 24 h », et l'instant du second clone est bien
      //     « frontiere + 1 ms ». Si F-RESERVATION se contredisait, c'est ICI
      //     que ca se verrait, et non dans une assertion sur l'implementation.
      expect(Date.parse(DEBUT) - Date.parse(FRONTIERE)).toBe(DELAI_HEURES * H_MS); // cahier:L119
      expect(Date.parse(FRONTIERE_PLUS_1MS) - Date.parse(FRONTIERE)).toBe(1); // cahier:L119
      expect(FRONTIERE_INCLUSE).toBe(true); // cahier:L119

      const debutReel = Date.now();

      const horloge = exigerAccepte(await creerHorloge(P3_H), 'horloge metier de P3');
      await exigerInstant(horloge, P3_H, 'horloge metier a l ouverture de P3'); // cahier:L125

      // (1) LA FRONTIERE EST ATTEINTE PAR AVANCE DU TEMPS METIER. Le delta est
      //     calcule depuis deux instants SCELLES ; l'implementation, elle, doit
      //     rendre exactement la frontiere. Un `advance` neutralise laisse
      //     l'horloge a l'ouverture de P3 et fait tomber cette assertion.
      const versFrontiere = Date.parse(FRONTIERE) - Date.parse(P3_H);
      expect(versFrontiere > 0).toBe(true);
      const aLaFrontiere = await avancer(horloge, versFrontiere);
      expect(
        aLaFrontiere.canal !== null
          ? 'avance-vers-la-frontiere'
          : `AVANCE-SANS-EFFET dernier=${court(aLaFrontiere.texte, 300)}`,
      ).toBe('avance-vers-la-frontiere');
      await exigerInstant(aLaFrontiere.horloge, FRONTIERE, 'horloge a la frontiere des 24 h'); // cahier:L119

      // (2) L'INSTANT METIER DES INTENTIONS SUIT L'HORLOGE METIER, PAS
      //     L'HORLOGE SYSTEME. C'est la seconde moitie de la perturbation que
      //     verification/cases.lock.json prescrit (« les gardes lisent
      //     l'horloge systeme ») : un plan date de l'horloge systeme porterait
      //     l'annee courante, pas 2030.
      const planFrontiere = exigerPlan(
        exigerAccepte(
          await generer(entree(CATALOGUE_RESERVATION, { clock: aLaFrontiere.horloge })),
          'plan date a la frontiere',
        ),
        'plan date a la frontiere',
      );
      const instantsFrontiere = instantsDuPlan(planFrontiere);
      expect(instantsFrontiere).toEqual([Date.parse(FRONTIERE)]); // cahier:L88 + L119

      // (3) LA FRONTIERE SE FRANCHIT D'UNE MILLISECONDE. C'est l'unite du
      //     cahier : L119 oppose `12:00:00Z` a `12:00:00.001Z`.
      const apresFrontiere = await avancer(aLaFrontiere.horloge, 1);
      expect(
        apresFrontiere.canal !== null
          ? 'avance-d-une-milliseconde'
          : `AVANCE-D-UNE-MS-SANS-EFFET dernier=${court(apresFrontiere.texte, 300)}`,
      ).toBe('avance-d-une-milliseconde');
      await exigerInstant(
        apresFrontiere.horloge,
        FRONTIERE_PLUS_1MS,
        'horloge une milliseconde apres la frontiere',
      ); // cahier:L119

      const planApres = exigerPlan(
        exigerAccepte(
          await generer(entree(CATALOGUE_RESERVATION, { clock: apresFrontiere.horloge })),
          'plan date une milliseconde apres la frontiere',
        ),
        'plan date une milliseconde apres la frontiere',
      );
      const instantsApres = instantsDuPlan(planApres);
      expect(instantsApres).toEqual([Date.parse(FRONTIERE_PLUS_1MS)]); // cahier:L88 + L119

      // (4) LES DEUX COTES DE LA REGLE, CALCULES SUR LES INSTANTS QUE
      //     L'IMPLEMENTATION A PRODUITS. « Annulation permise au moins 24 heures
      //     avant le debut, frontiere incluse » : a la frontiere le delai vaut
      //     exactement 24 h, une milliseconde plus tard il est plus court.
      const delaiALaFrontiere = Date.parse(DEBUT) - Number(instantsFrontiere[0]);
      const delaiApres = Date.parse(DEBUT) - Number(instantsApres[0]);
      expect(delaiALaFrontiere).toBe(DELAI_HEURES * H_MS); // cahier:L119
      expect(delaiApres).toBe(DELAI_HEURES * H_MS - 1); // cahier:L119
      expect(delaiALaFrontiere >= DELAI_HEURES * H_MS).toBe(FRONTIERE_INCLUSE); // cahier:L119
      expect(delaiApres < DELAI_HEURES * H_MS).toBe(true); // cahier:L119

      // (5) SANS ATTENDRE 24 HEURES PHYSIQUES. L141 refuse qu'un chronometre
      //     fin serve de preuve ; la seule borne affirmee est donc celle que le
      //     cahier enonce — les 24 heures physiques. Elle est vraie par une
      //     marge de plusieurs ordres de grandeur, et le jeu d'assertions
      //     ci-dessus est ce qui porte la preuve, pas ce chronometre.
      const ecouleReel = Date.now() - debutReel;
      expect(ecouleReel < DELAI_HEURES * H_MS).toBe(true); // cahier:L223
      // La frontiere metier franchie depasse de loin le temps physique consomme.
      expect(Date.parse(FRONTIERE_PLUS_1MS) - Date.parse(P3_H) > ecouleReel).toBe(true); // cahier:L223

      console.log(
        `[T08.A6] P3=${P3_H} frontiere=${FRONTIERE} +1ms=${FRONTIERE_PLUS_1MS} ` +
          `delta-metier=${String(Date.parse(FRONTIERE_PLUS_1MS) - Date.parse(P3_H))}ms ` +
          `ecoule-reel=${String(ecouleReel)}ms ` +
          `plan-frontiere=[${instantsFrontiere.map(String).join(',')}] ` +
          `plan-apres=[${instantsApres.map(String).join(',')}]`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
