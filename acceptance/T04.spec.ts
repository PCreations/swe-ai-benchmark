/**
 * acceptance/T04.spec.ts — suite d'acceptation de la tache T04.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T04.A1 numeric   — F-QUALITY donne EXACTEMENT les resultats annonces
 *                      (Q, V, R, U, exposition, reussite agregee par intention)
 *   T04.A2 behaviour — dupliquer les assertions d'une exigence ne change pas Q
 *   T04.A3 behaviour — F-REGRESSION exclut `cancel@1` et compte `isolation@1`
 *   T04.A4 numeric   — deux periodes consecutives cassees donnent G=1 aux deux
 *                      et G_new=1 puis 0
 *   T04.A5 numeric   — zero usage donne R=null, panne avec quatre usages R=0
 *   T04.A6 absence   — exigence non encore due ABSENTE du denominateur de Q
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE a `packages/domain` — le `source_paths`
 * que verification/tasks.json declare pour T04. ADR-001 : cet aveuglement est
 * PROCEDURAL, donc une discipline auditable au diff, pas une barriere
 * technique. Le contrat teste ci-dessous n'est pas releve dans
 * l'implementation ; il est derive de docs/specs/T04.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle :
 *
 *   L187  livrables : « fonctions PURES pour Q, R, V, U, backlog, exigences
 *         remplacees et regressions »
 *   L189  precision : « G compte les regressions actuellement ouvertes,
 *         c'est-a-dire les exigences actives dues, autrefois satisfaites et
 *         actuellement violees. `G_new` compte celles qui etaient satisfaites
 *         a la periode precedente comparable et deviennent violees. Une
 *         regression persistante contribue a G, sans redevenir nouvelle a
 *         chaque periode »
 *   L191  les six cas d'acceptation, mot pour mot
 *   L193  fin : « tests de bornes [0,1], cas vides et sommes exactes ; aucune
 *         note LLM n'intervient »
 *   L107  F-QUALITY : Q=[1,1/2,3/4,1] -> V=13/16 ; R=[1,1/2,null,1/2],
 *         offertes [4,4,0,2], reussies [4,2,0,1] -> U=2/3, exposition 3/4,
 *         reussite agregee par intention 7/10 — « ces trois derniers nombres
 *         sont differents et doivent rester identifies »
 *   L109  entrees exactes de Q, periode par periode, et le TEST NEGATIF :
 *         « une exigence revelee mais non encore due : son poids ne doit pas
 *         entrer dans Q avant son echeance »
 *   L111  conventions de nullite : R=null sans intention admissible ; U est la
 *         moyenne temporelle sur les periodes EXPOSEES ; une trajectoire
 *         indisponible face a des intentions prevues a R=0, jamais null ;
 *         Q est null si aucun poids d'exigence active due
 *   L121  F-FAILURE : quatre lignes conservees avec Q=0 et R=0 « si les
 *         exigences et usages y sont presents »
 *   L129  F-REGRESSION, et la regle de comptage : « compter par id/version
 *         active, pas par nombre d'assertions »
 *   L143  « les nombres exacts se verifient en entier ou rationnel » ;
 *         tolerance flottante « au maximum 1e-12 pour les fixtures
 *         arithmetiques ci-dessus »
 *   L72   invariant D.10 : « le nombre d'assertions ou de tests ne determine
 *         pas le poids d'une fonctionnalite »
 *   L78   « une periode ajoute `period_index` commencant a 1 »
 *   L88   contrat `Requirement` : id, version, capability_id, poids, date de
 *         revelation, echeance, remplacement eventuel, criticite, source
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des deux sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/**` — racine gelee,
 *       docs/FROZEN_ROOTS.json. C'est le cas de TOUTES les valeurs attendues
 *       de A1 (F-QUALITY), du compte de regressions de A3 (F-REGRESSION) et
 *       des series Q/R de la panne en A5 (F-FAILURE) ;
 *   (b) un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p'
 *       docs/cahier.md` — c'est le cas de G=1/G_new=1 puis 0 (L191) et du
 *       « quatre usages » de A5 (L191).
 *
 * Les entrees des fixtures sont elles aussi CONSTRUITES depuis la racine gelee
 * : les poids, les statuts de satisfaction, les remplacements et les cardinaux
 * d'intentions de F-QUALITY sont LUS dans acceptance/reference/F-QUALITY.json,
 * jamais recopies a la main. Les parametres que le cahier ne fixe pas — la
 * duree absolue des periodes, les poids de F-REGRESSION, le contenu d'une P1,
 * le poids de l'exigence du test negatif — sont declares explicitement
 * ci-dessous avec le renvoi a la rubrique `non_fixe_par_le_cahier` de la
 * fixture correspondante : ce sont des ENTREES choisies, jamais des valeurs
 * attendues.
 *
 * Aucune valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer : c'est exactement la fermeture que cette suite
 * existe pour ouvrir.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE. Le paquet est charge par son SPECIFICATEUR, que
 * jest.config.mjs mappe vers `packages/<nom>/src` — jamais vers un `dist/`
 * perime, gitignore et invisible a `git status --porcelain`.
 *
 * UN SEUL ROLE EST RESOLU, ET C'EST VOULU. L187 nomme sept livrables — Q, R,
 * V, U, backlog, exigences remplacees, regressions — mais les six cas de L191
 * les observent tous par la MEME entree : une SERIE de periodes entre, des
 * metriques par periode et des agregats de campagne sortent. G et G_new (L189)
 * comparent une periode a la precedente ; U et l'exposition (L111) agregent
 * sur la serie : aucune de ces grandeurs n'est calculable periode par periode
 * isolement. Exiger sept exports separes imposerait une decomposition que le
 * cahier n'impose pas.
 *
 *   computePeriodMetrics(serie, options?) -> metriques par periode + agregats
 *
 * Une courte liste d'alias documentee accompagne le nom primaire. Les alias
 * sont une tolerance de NOMMAGE, pas de COMPORTEMENT : toutes les assertions
 * restent identiques quel que soit le nom retenu. Cette tolerance sert §H
 * (« rends le test d'acceptation rouge pour la raison attendue ») : un
 * desaccord de vocabulaire entre l'auteur aveugle et l'implementeur produirait
 * un rouge qui ne dit rien du contrat. Si AUCUN nom ne repond, la suite echoue
 * par une assertion explicite qui nomme le role et la liste attendue — jamais
 * par un import casse, que verification/runner/red.mjs classe MODULE_NOT_FOUND
 * et refuse comme preuve.
 *
 * FORME DE L'ENTREE. Une serie est `{ periods: [ ... ] }` ; la forme nue
 * `[ ... ]` est acceptee en repli. Chaque periode porte :
 *
 *   period_index        entier commencant a 1                    (L78)
 *   duration            duree de la periode — egales ici         (L107)
 *   requirements[]      exigences ACTIVES a cette periode, chacune avec
 *                       id, version, capability_id, weight,
 *                       revealed_at_period, due_at_period, criticality,
 *                       source                                   (L88)
 *                       + satisfied : l'issue d'evaluation de la periode,
 *                         c'est-a-dire l'ENTREE de la fonction pure (L187)
 *                       + assertions[] : les assertions qui portent cette
 *                         exigence — leur NOMBRE ne doit rien changer (L72)
 *   retired[]           exigences retirees A cette periode, chacune avec
 *                       id, version et `replaced_by` (« remplacement
 *                       eventuel », L88) — nul si simple retrait
 *   intents_offered     intentions admissibles proposees          (L107)
 *   intents_succeeded   intentions reussies                       (L107)
 *
 * Une exigence est DUE a la periode k si `due_at_period <= k` ; elle est
 * ACTIVE si elle figure dans `requirements`. Les deux conditions ensemble sont
 * ce que L189 appelle « active due ».
 *
 * FORME DE LA SORTIE. Les lignes par periode se trouvent directement (tableau)
 * ou sous une cle (`periods`, `periodes`, `rows`, `per_period`, `results`).
 * Chaque ligne porte Q, R, G et G_new ; les agregats V, U, exposition et
 * reussite agregee se trouvent a la racine ou sous une cle de regroupement.
 * La suite n'impose pas l'arborescence, seulement la presence — et A1 en fait
 * une assertion a part entiere.
 *
 * G PORTE SES IDENTITES, ET CE N'EST PAS UN CAPRICE. A3 exige « exclut
 * `cancel@1` et compte `isolation@1` » : un COMPTE seul ne distingue pas ces
 * deux exigences — une implementation qui compterait le retrait de `cancel@1`
 * et manquerait `isolation@1` rendrait le meme 1. La suite lit donc, pour
 * chaque periode, la liste des exigences en regression, sous n'importe laquelle
 * des formes documentees (G lui-meme tableau, ou une cle voisine).
 *
 * ────────────────────────────────────────────────────────────────────── IV
 * LE DANGER PROPRE A T04 : LA CONSTANTE ET LA TAUTOLOGIE.
 *
 * Quatre des six cas sont des enonces d'EGALITE, d'INVARIANCE ou d'ABSENCE.
 * Une implementation qui rendrait toujours la meme ligne satisferait A2
 * (« ne change pas »), A6 (« absent du denominateur ») et la moitie de A5
 * sans jamais lire sa serie. verification/cases.lock.json nomme le defaut pour
 * A2 — « un stub renvoyant une constante ne suffirait pas, l'egalite
 * avant/apres duplication resterait vraie » — et pour A6 — « un export stube
 * ou vide garderait cette absence vraie ».
 *
 * Chaque cas porte donc un TEMOIN : une entree distincte doit produire une
 * sortie distincte, et la grandeur pretendument invariante doit etre VARIABLE
 * par ailleurs.
 *   A2 exige la serie Q complete [1,1/2,3/4,1] avant ET apres duplication :
 *      quatre valeurs differentes, une constante n'y survit pas ; et il exige
 *      que le nombre d'assertions ait REELLEMENT change entre les deux entrees.
 *   A3 exige qu'une `cancel@1` violee SANS remplacement produise bien une
 *      regression qui la nomme : l'exclusion vient du remplacement, pas d'un
 *      identifiant ignore.
 *   A4 fait reparer puis recasser l'exigence : G redescend a 0 et G_new
 *      redevient 1, ce qu'un « toujours 1 puis 0 » ne peut pas suivre ; et il
 *      exige G=2 quand deux exigences distinctes sont cassees.
 *   A5 exige que la MEME serie, dont la periode sans usage recoit deux
 *      intentions, cesse de valoir null et fasse passer l'exposition a 1.
 *   A6 exige que la MEME exigence, une fois DUE, entre bel et bien dans le
 *      denominateur et fasse strictement baisser Q — « rendre present » est la
 *      contre-epreuve exacte d'un cas d'absence.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS. L187 nomme aussi le `backlog` parmi les
 * livrables ; aucun des six cas requis de L191 ne l'observe, et inventer ici
 * une assertion de backlog imposerait un contrat que le cahier ne donne pas.
 * De meme, L193 exige « aucune note LLM n'intervient » : la preuve complete en
 * est statique — une regle d'import interdisant tout client de modele dans le
 * paquet — et appartient a la chaine de l'implementeur, puisque la relever ici
 * obligerait l'auteur des tests a lire les sources. La part OBSERVABLE en est
 * apportee autrement : toutes les valeurs attendues sont rationnelles et
 * exactes, et la fonction est exercee deux fois sur la meme entree avec
 * exigence d'egalite stricte (purete, L187) — une note stochastique ne
 * survivrait ni a l'une ni a l'autre.
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
const PACKAGES = ['domain', 'contracts'] as const;
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Rendu TEXTUEL d'une valeur quelconque, pour lire une sortie sans supposer sa forme. */
function decrit(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    const t = JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
    return typeof t === 'string' ? t : String(v);
  } catch {
    return String(v);
  }
}

/* ───────────────────────── arithmetique exacte (cahier L143) */

interface Rat {
  num: number;
  den: number;
}

/**
 * « Les nombres exacts se verifient en entier ou rationnel. Les fonctions
 * statistiques utilisant des flottants precisent leur tolerance, au maximum
 * 1e-12 pour les fixtures arithmetiques ci-dessus. »
 */ // cahier:L143
const TOLERANCE = 1e-12;

type Lue =
  | { forme: 'nombre'; n: number }
  | { forme: 'rationnel'; r: Rat }
  | { forme: 'nul' }
  | { forme: 'absent' }
  | { forme: 'autre'; texte: string };

/** Lit une grandeur rendue par l'implementation, sans supposer sa representation. */
function lireValeur(v: unknown): Lue {
  if (v === null) return { forme: 'nul' };
  if (v === undefined) return { forme: 'absent' };
  if (typeof v === 'number') {
    return Number.isFinite(v) ? { forme: 'nombre', n: v } : { forme: 'autre', texte: `NON-FINI(${String(v)})` };
  }
  if (typeof v === 'bigint') return { forme: 'nombre', n: Number(v) };
  if (typeof v === 'string') {
    const t = v.trim();
    const fraction = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(t);
    if (fraction !== null) return { forme: 'rationnel', r: { num: Number(fraction[1]), den: Number(fraction[2]) } };
    if (t !== '' && Number.isFinite(Number(t))) return { forme: 'nombre', n: Number(t) };
    return { forme: 'autre', texte: t };
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Json;
    for (const [a, b] of [
      ['num', 'den'],
      ['numerator', 'denominator'],
      ['numerateur', 'denominateur'],
      ['n', 'd'],
    ] as const) {
      if (typeof o[a] === 'number' && typeof o[b] === 'number') {
        return { forme: 'rationnel', r: { num: o[a] as number, den: o[b] as number } };
      }
    }
    for (const cle of ['value', 'valeur', 'decimal', 'decimal_exact', 'amount']) {
      if (o[cle] !== undefined) return lireValeur(o[cle]);
    }
  }
  return { forme: 'autre', texte: decrit(v) };
}

/** L'etiquette CANONIQUE d'une valeur attendue : `Q[P2]=1/2`, `R[P3]=null`. */
function etiquette(attendu: Rat | null, quoi: string): string {
  return attendu === null ? `${quoi}=null` : `${quoi}=${String(attendu.num)}/${String(attendu.den)}`;
}

/**
 * Le verdict d'une valeur observee, rendu SOUS LA MEME ETIQUETTE quand elle est
 * egale a l'attendu et sous sa propre forme sinon. Comparer deux tableaux de
 * verdicts donne un diff Jest qui nomme la periode ET la valeur fautive.
 */
function verdict(observe: unknown, attendu: Rat | null, quoi: string): string {
  const lu = lireValeur(observe);
  if (attendu === null) {
    return lu.forme === 'nul' ? `${quoi}=null` : rendu(lu, quoi);
  }
  if (lu.forme === 'rationnel' && lu.r.num * attendu.den === attendu.num * lu.r.den) {
    return etiquette(attendu, quoi);
  }
  if (lu.forme === 'nombre' && Math.abs(lu.n - attendu.num / attendu.den) <= TOLERANCE) {
    return etiquette(attendu, quoi);
  }
  return rendu(lu, quoi);
}

function rendu(lu: Lue, quoi: string): string {
  switch (lu.forme) {
    case 'nombre':
      return `${quoi}=${String(lu.n)}`;
    case 'rationnel':
      return `${quoi}=${String(lu.r.num)}/${String(lu.r.den)}`;
    case 'nul':
      return `${quoi}=null`;
    case 'absent':
      return `${quoi}=ABSENT`;
    default:
      return `${quoi}=${lu.texte}`;
  }
}

/** La valeur decimale d'une grandeur lue, ou null si elle n'est pas numerique. */
function decimal(v: unknown): number | null {
  const lu = lireValeur(v);
  if (lu.forme === 'nombre') return lu.n;
  if (lu.forme === 'rationnel') return lu.r.den === 0 ? null : lu.r.num / lu.r.den;
  return null;
}

/* ──────────────────────── fixtures de reference (racine gelee, L139) */

function readReference(name: string): Json {
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${name}.json`), 'utf8')) as Json;
}

function refOpt(doc: unknown, dotted: string): unknown {
  let cur: unknown = doc;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[seg];
  }
  return cur;
}

function refValue(doc: unknown, dotted: string): unknown {
  const v = refOpt(doc, dotted);
  if (v === undefined) throw new Error(`REFERENCE-VALEUR-ABSENTE ${dotted}`);
  return v;
}

function refRat(doc: unknown, dotted: string): Rat {
  const v = refValue(doc, dotted) as Json;
  return { num: Number(v.num), den: Number(v.den) };
}

function refNombres(doc: unknown, dotted: string): number[] {
  return (refValue(doc, dotted) as unknown[]).map(Number);
}

const F_QUALITY = readReference('F-QUALITY');
const F_REGRESSION = readReference('F-REGRESSION');
const F_FAILURE = readReference('F-FAILURE');

/** Q=[1, 1/2, 3/4, 1] — serie rationnelle, relue de la racine gelee. */ // cahier:L107
const Q_REF: (Rat | null)[] = (refValue(F_QUALITY, 'valeurs.Q_par_periode.serie') as Json[]).map((e) => {
  const r = e.rationnel;
  return r === null ? null : { num: Number((r as Json).num), den: Number((r as Json).den) };
});

/** R=[1, 1/2, null, 1/2] — le `null` de P3 est PORTE par la racine gelee. */ // cahier:L107
const R_REF: (Rat | null)[] = (refValue(F_QUALITY, 'valeurs.R_par_periode.serie') as Json[]).map((e) => {
  const r = e.rationnel;
  return r === null ? null : { num: Number((r as Json).num), den: Number((r as Json).den) };
});

const V_REF = refRat(F_QUALITY, 'valeurs.V.rationnel'); // 13/16
const U_REF = refRat(F_QUALITY, 'valeurs.U.rationnel'); // 2/3
const EXPOSITION_REF = refRat(F_QUALITY, 'valeurs.exposition.rationnel'); // 3/4
const AGREGEE_REF = refRat(F_QUALITY, 'valeurs.reussite_agregee_par_intention.rationnel'); // 7/10
const OFFERTES_REF = refNombres(F_QUALITY, 'valeurs.intentions_offertes.valeur'); // [4,4,0,2]
const REUSSIES_REF = refNombres(F_QUALITY, 'valeurs.intentions_reussies.valeur'); // [4,2,0,1]
const NB_PERIODES_REF = Number(refValue(F_QUALITY, 'valeurs.periodes.nombre.valeur')); // 4
const MEMES_DUREES_REF = Boolean(refValue(F_QUALITY, 'valeurs.periodes.memes_durees.valeur'));

/** F-FAILURE : K=4, Q=[0,0,0,0], R=[0,0,0,0]. */ // cahier:L121
const K_FAILURE = Number(refValue(F_FAILURE, 'valeurs.K.valeur'));
const Q_FAILURE_REF = refNombres(F_FAILURE, 'valeurs.Q_par_periode.valeur');
const R_FAILURE_REF = refNombres(F_FAILURE, 'valeurs.R_par_periode.valeur');
const LIGNES_FAILURE_REF = Number(refValue(F_FAILURE, 'valeurs.lignes_conservees.valeur'));

/** F-REGRESSION : les deux exigences, et le compte attendu. */ // cahier:L129
const REG_REMPLACEE = String(refValue(F_REGRESSION, 'valeurs.exigence_remplacee.id.valeur')); // cancel@1
const REG_REMPLACANTE = String(refValue(F_REGRESSION, 'valeurs.exigence_remplacee.remplacee_par.valeur')); // cancel@2
const REG_VIOLEE = String(refValue(F_REGRESSION, 'valeurs.exigence_violee.id.valeur')); // isolation@1
const REG_SATISFAITE_EN = String(refValue(F_REGRESSION, 'valeurs.exigence_remplacee.satisfaite_en.valeur')); // P2
const REG_REMPLACEE_EN = String(refValue(F_REGRESSION, 'valeurs.exigence_remplacee.remplacee_en.valeur')); // P3
const REG_VIOLEE_SATISFAITE_EN = String(refValue(F_REGRESSION, 'valeurs.exigence_violee.satisfaite_en.valeur')); // P3
const REG_VIOLEE_VIOLEE_EN = String(refValue(F_REGRESSION, 'valeurs.exigence_violee.violee_en.valeur')); // P4
const REG_ATTENDUES = Number(refValue(F_REGRESSION, 'valeurs.regressions_attendues.valeur')); // 1
const REG_REMPLACEE_PRODUIT = Boolean(
  refValue(F_REGRESSION, 'valeurs.exigence_remplacee.produit_une_regression.valeur'),
); // false
const REG_VIOLEE_PRODUIT = Boolean(
  refValue(F_REGRESSION, 'valeurs.exigence_violee.produit_une_regression.valeur'),
); // true

/* ─────────────────────────────── construction des series d'entree */

interface EntreeExigence {
  id: string;
  version: number;
  capability_id: string;
  weight: number;
  revealed_at_period: number;
  due_at_period: number;
  criticality: string;
  source: string;
  satisfied: boolean;
  assertions: string[];
}

interface EntreeRetrait {
  id: string;
  version: number;
  replaced_by: { id: string; version: number } | null;
}

interface EntreePeriode {
  period_index: number;
  duration: number;
  requirements: EntreeExigence[];
  retired: EntreeRetrait[];
  intents_offered: number;
  intents_succeeded: number;
}

/**
 * PARAMETRES LIBRES, declares et non deduits. F-QUALITY inscrit en
 * `non_fixe_par_le_cahier` : « la duree absolue des quatre periodes : seule
 * leur egalite est enoncee ». DUREE est donc une entree choisie, identique
 * partout — jamais une valeur attendue.
 */
const DUREE = 1;

/** Deux assertions par exigence : le minimum pour que DUPLIQUER soit observable. */
const ASSERTIONS_DE_BASE = ['assert-1', 'assert-2'];

function exigence(p: Partial<EntreeExigence> & { id: string; version: number }): EntreeExigence {
  return {
    capability_id: p.capability_id ?? p.id,
    weight: p.weight ?? 1,
    revealed_at_period: p.revealed_at_period ?? 1,
    due_at_period: p.due_at_period ?? 1,
    criticality: p.criticality ?? 'REQUIRED',
    source: p.source ?? 'acceptance/reference',
    satisfied: p.satisfied ?? true,
    assertions: p.assertions ?? [...ASSERTIONS_DE_BASE],
    id: p.id,
    version: p.version,
  };
}

function periode(p: Partial<EntreePeriode> & { period_index: number }): EntreePeriode {
  return {
    duration: p.duration ?? DUREE,
    requirements: p.requirements ?? [],
    retired: p.retired ?? [],
    intents_offered: p.intents_offered ?? 0,
    intents_succeeded: p.intents_succeeded ?? 0,
    period_index: p.period_index,
  };
}

/** `A@1` -> { id: 'A', version: 1 }. La notation id@version est celle de L109/L129. */
function idVersion(s: string): { id: string; version: number } {
  const m = /^(.+)@(\d+)$/.exec(s.trim());
  if (m === null) throw new Error(`ID-VERSION-ILLISIBLE ${s}`);
  return { id: m[1], version: Number(m[2]) };
}

const cle = (id: string, version: number): string => `${id}@${String(version)}`;

/**
 * F-QUALITY, CONSTRUITE DEPUIS LA RACINE GELEE.
 *
 * Les quatre periodes, leurs exigences actives dues, leurs poids, leurs statuts
 * de satisfaction et leurs retraits sont LUS dans
 * acceptance/reference/F-QUALITY.json (`valeurs.entrees_exactes_de_Q`), qui
 * transcrit L109. Les cardinaux d'intentions viennent de `intentions_offertes`
 * et `intentions_reussies` (L107).
 *
 * L'echeance de chaque exigence est la PREMIERE periode ou elle figure parmi
 * les actives dues : L109 pose que « toutes les exigences citees sont dues a la
 * periode concernee », ce que la fixture rappelle sous
 * `toutes_les_exigences_citees_sont_dues`.
 */
function serieFQuality(): EntreePeriode[] {
  const noms = ['P1', 'P2', 'P3', 'P4'];
  const premiereApparition = new Map<string, number>();
  const actives: { id: string; version: number; poids: number; satisfaite: boolean }[][] = noms.map((nom, i) => {
    const liste = refValue(F_QUALITY, `valeurs.entrees_exactes_de_Q.${nom}.actives_dues`) as Json[];
    return liste.map((e) => {
      const { id, version } = idVersion(String(e.id));
      const k = cle(id, version);
      if (!premiereApparition.has(k)) premiereApparition.set(k, i + 1);
      return {
        id,
        version,
        poids: Number(refValue(e, 'poids.valeur')),
        satisfaite: Boolean(refValue(e, 'satisfaite.valeur')),
      };
    });
  });

  return noms.map((nom, i) => {
    const retirees = (refOpt(F_QUALITY, `valeurs.entrees_exactes_de_Q.${nom}.retirees`) ?? []) as Json[];
    return periode({
      period_index: i + 1,
      requirements: actives[i].map((a) =>
        exigence({
          id: a.id,
          version: a.version,
          weight: a.poids,
          satisfied: a.satisfaite,
          revealed_at_period: premiereApparition.get(cle(a.id, a.version)) ?? 1,
          due_at_period: premiereApparition.get(cle(a.id, a.version)) ?? 1,
          source: 'F-QUALITY',
        }),
      ),
      retired: retirees.map((r) => {
        const { id, version } = idVersion(String(r.id));
        // Le motif de retrait est la seule trace du remplacement dans la
        // fixture : « remplacee par A@2 » pour P3, « retiree » pour P4.
        const motif = String(refValue(r, 'motif.valeur'));
        const m = /par\s+(.+?)@(\d+)/.exec(motif);
        return { id, version, replaced_by: m === null ? null : { id: m[1], version: Number(m[2]) } };
      }),
      intents_offered: OFFERTES_REF[i],
      intents_succeeded: REUSSIES_REF[i],
    });
  });
}

/**
 * F-REGRESSION, CONSTRUITE DEPUIS LA RACINE GELEE.
 *
 * La fixture inscrit en `non_fixe_par_le_cahier` : « les poids de `cancel@1`,
 * `cancel@2` et `isolation@1` », « le statut de satisfaction de `cancel@2` en
 * P3 et P4 », « l'existence et le contenu d'une periode P1 ». Les valeurs
 * choisies ici sont donc des ENTREES declarees :
 *   • poids 1 partout — aucune valeur attendue n'en depend, le compte de
 *     regressions se fait « par id/version active » (L129) ;
 *   • `cancel@2` satisfaite en P3 et P4 — sinon elle introduirait une seconde
 *     regression sans rapport avec l'enonce ;
 *   • P1 existe et porte `cancel@1` NON satisfaite : ainsi sa violation en P1
 *     n'est pas une regression (elle n'a jamais ete satisfaite avant) et la
 *     serie commence bien a period_index 1 (L78).
 */
function serieFRegression(options?: { sansRemplacement?: boolean; isolationReparee?: boolean }): EntreePeriode[] {
  const cancel1 = idVersion(REG_REMPLACEE);
  const cancel2 = idVersion(REG_REMPLACANTE);
  const isolation = idVersion(REG_VIOLEE);
  const sansRemplacement = options?.sansRemplacement === true;
  const isolationReparee = options?.isolationReparee === true;

  const faire = (id: string, version: number, satisfied: boolean, due: number): EntreeExigence =>
    exigence({ id, version, satisfied, revealed_at_period: due, due_at_period: due, source: 'F-REGRESSION' });

  const p1 = periode({
    period_index: 1,
    requirements: [faire(cancel1.id, cancel1.version, false, 1)],
    intents_offered: 1,
    intents_succeeded: 0,
  });

  // `cancel@1` satisfaite en P2 — transcrit de la fixture.
  const p2 = periode({
    period_index: 2,
    requirements: [faire(cancel1.id, cancel1.version, true, 1)],
    intents_offered: 1,
    intents_succeeded: 1,
  });

  // P3 : `cancel@1` remplacee par `cancel@2` ; `isolation@1` revelee, due et
  // satisfaite. Le TEMOIN (`sansRemplacement`) garde `cancel@1` active et
  // violee : elle doit alors produire une regression qui la NOMME.
  const p3 = periode({
    period_index: 3,
    requirements: sansRemplacement
      ? [
          faire(cancel1.id, cancel1.version, false, 1),
          faire(isolation.id, isolation.version, true, 3),
        ]
      : [
          faire(cancel2.id, cancel2.version, true, 3),
          faire(isolation.id, isolation.version, true, 3),
        ],
    retired: sansRemplacement
      ? []
      : [{ id: cancel1.id, version: cancel1.version, replaced_by: { id: cancel2.id, version: cancel2.version } }],
    intents_offered: 2,
    intents_succeeded: 2,
  });

  // P4 : `isolation@1` violee — c'est LA regression attendue.
  const p4 = periode({
    period_index: 4,
    requirements: sansRemplacement
      ? [
          faire(cancel1.id, cancel1.version, false, 1),
          faire(isolation.id, isolation.version, !isolationReparee ? false : true, 3),
        ]
      : [
          faire(cancel2.id, cancel2.version, true, 3),
          faire(isolation.id, isolation.version, !isolationReparee ? false : true, 3),
        ],
    intents_offered: 2,
    intents_succeeded: 1,
  });

  return [p1, p2, p3, p4];
}

/** Duplique `facteur` fois la liste d'assertions de CHAQUE exigence de la serie. */
function dupliquerAssertions(serie: EntreePeriode[], facteur: number): EntreePeriode[] {
  const copie = clone(serie);
  for (const p of copie) {
    for (const r of p.requirements) {
      const base = r.assertions;
      const out: string[] = [];
      for (let i = 0; i < facteur; i += 1) out.push(...base);
      r.assertions = out;
    }
  }
  return copie;
}

function compteAssertions(serie: EntreePeriode[]): number {
  return serie.reduce((s, p) => s + p.requirements.reduce((t, r) => t + r.assertions.length, 0), 0);
}

/* ──────────────────────────────────────────── chargement des paquets */

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

/** Premiere assertion de chaque cas : le paquet a bien ete charge, depuis sa SOURCE. */
function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `PAQUETS-NON-CHARGEABLES ${LOADED.attempts.join(' | ')}`).toBe('charge');
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ───────────────────────────────────────────── resolution par role */

const C_METRIQUES = [
  'computePeriodMetrics',
  'computePeriodMetricsSeries',
  'computeMetrics',
  'computePeriodResults',
  'computeCampaignMetrics',
  'computeSeriesMetrics',
  'computeQualityMetrics',
  'computeTrajectoryMetrics',
  'periodMetrics',
  'evaluatePeriods',
  'measurePeriods',
  'metriquesDePeriodes',
] as const;

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction>();

/**
 * Resolution par role. NE LEVE PAS : un role introuvable doit produire une
 * ASSERTION rouge qui nomme le contrat manquant, pas une exception que le
 * rapport confondrait avec un plantage. C'est `assertContrat()` qui porte
 * l'assertion, et elle est la DEUXIEME de chaque cas.
 */
function resolveOpt(role: string, candidats: readonly string[]): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
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
  return null;
}

/** Deuxieme assertion de chaque cas : le contrat de nommage est satisfait. */
function assertContrat(): void {
  expect(
    resolveOpt('computePeriodMetrics', C_METRIQUES) !== null
      ? 'contrat-resolu'
      : `CONTRAT-NON-SATISFAIT role=computePeriodMetrics : aucun export parmi ` +
          `[${C_METRIQUES.join(', ')}] (${String(LOADED.exportCount)} exports de premier niveau ` +
          `observes dans ${LOADED.via.join(', ') || 'aucun paquet'})`,
  ).toBe('contrat-resolu');
}

/* ───────────────────────────────────────── lecture d'une mesure */

interface Mesure {
  ok: boolean;
  texte: string;
  brut: unknown;
  lignes: Json[];
}

const CLES_LIGNES = ['periods', 'periodes', 'rows', 'per_period', 'par_periode', 'results', 'resultats', 'lines'];
const CLES_AGREGAT = [
  'aggregates',
  'aggregate',
  'agregats',
  'summary',
  'resume',
  'totals',
  'campaign',
  'series',
  'serie',
  'metrics',
  'metriques',
  'overall',
];

const CLES_Q = ['Q', 'q', 'quality', 'qualite'];
const CLES_R = ['R', 'r', 'reliability', 'fiabilite', 'reussite'];
const CLES_G = ['G', 'g', 'regressions', 'open_regressions', 'regressions_open', 'regressions_ouvertes'];
const CLES_G_NEW = [
  'G_new',
  'g_new',
  'Gnew',
  'gNew',
  'new_regressions',
  'regressions_new',
  'nouvelles_regressions',
  'regressions_nouvelles',
];
const CLES_V = ['V', 'v', 'quality_mean', 'mean_quality', 'moyenne_qualite', 'V_mean'];
const CLES_U = ['U', 'u', 'reliability_mean', 'mean_reliability', 'moyenne_fiabilite', 'U_mean'];
const CLES_EXPOSITION = ['exposure', 'exposition', 'exposure_rate', 'taux_exposition', 'exposed_fraction'];
const CLES_AGREGEE = [
  'intent_success_rate',
  'aggregate_intent_success',
  'pooled_intent_success',
  'reussite_agregee_par_intention',
  'reussite_agregee',
  'aggregate_success_rate',
  'success_by_intent',
];

function cherche(porteur: Json, candidats: readonly string[]): { cle: string; valeur: unknown } | null {
  for (const c of candidats) {
    if (Object.prototype.hasOwnProperty.call(porteur, c)) return { cle: c, valeur: porteur[c] };
  }
  const bas = new Map<string, { cle: string; valeur: unknown }>();
  for (const [k, v] of Object.entries(porteur)) if (!bas.has(k.toLowerCase())) bas.set(k.toLowerCase(), { cle: k, valeur: v });
  for (const c of candidats) {
    const hit = bas.get(c.toLowerCase());
    if (hit !== undefined) return hit;
  }
  return null;
}

/** Une grandeur d'AGREGAT : a la racine, ou sous une cle de regroupement documentee. */
function agregat(brut: unknown, candidats: readonly string[]): { chemin: string; valeur: unknown } | null {
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const racine = cherche(brut as Json, candidats);
  if (racine !== null) return { chemin: racine.cle, valeur: racine.valeur };
  for (const groupe of CLES_AGREGAT) {
    const sous = (brut as Json)[groupe];
    if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) {
      const hit = cherche(sous as Json, candidats);
      if (hit !== null) return { chemin: `${groupe}.${hit.cle}`, valeur: hit.valeur };
    }
  }
  return null;
}

const valeurAgregat = (brut: unknown, candidats: readonly string[]): unknown => agregat(brut, candidats)?.valeur;
const cheminAgregat = (brut: unknown, candidats: readonly string[]): string => agregat(brut, candidats)?.chemin ?? 'ABSENT';

/** Une ligne ressemble a une ligne de periode si elle porte Q, R, G ou G_new. */
function ressembleLigne(x: unknown): boolean {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const o = x as Json;
  return [CLES_Q, CLES_R, CLES_G, CLES_G_NEW].some((c) => cherche(o, c) !== null);
}

function lignesDe(brut: unknown): Json[] {
  const tableau = (x: unknown): Json[] | null =>
    Array.isArray(x) && x.length > 0 && x.every(ressembleLigne) ? (x as Json[]) : null;
  const direct = tableau(brut);
  if (direct !== null) return direct;
  if (brut === null || typeof brut !== 'object') return [];
  for (const c of CLES_LIGNES) {
    const hit = tableau((brut as Json)[c]);
    if (hit !== null) return hit;
  }
  for (const v of Object.values(brut as Json)) {
    const hit = tableau(v);
    if (hit !== null) return hit;
  }
  return [];
}

const q = (ligne: Json): unknown => cherche(ligne, CLES_Q)?.valeur;
const r = (ligne: Json): unknown => cherche(ligne, CLES_R)?.valeur;

/**
 * Les regressions d'une ligne : un COMPTE et des IDENTITES.
 *
 * `G` peut etre un nombre (et les identites vivent alors sous une cle voisine)
 * ou directement le tableau des exigences en regression. Une identite se lit
 * comme `id@version`, que l'element soit une chaine ou un objet.
 */
function regressionsDe(ligne: Json, cles: readonly string[]): { compte: number | null; ids: string[] | null } {
  const hit = cherche(ligne, cles);
  if (hit === undefined || hit === null) return { compte: null, ids: null };
  const v = hit.valeur;
  if (Array.isArray(v)) return { compte: v.length, ids: v.map(identiteDe) };
  const lu = lireValeur(v);
  const compte = lu.forme === 'nombre' ? lu.n : lu.forme === 'rationnel' ? lu.r.num / lu.r.den : null;
  // Le compte est la ; les identites sont ailleurs — on cherche un tableau
  // voisin sous une des cles documentees.
  for (const c of cles) {
    for (const suffixe of ['', '_ids', '_list', '_items', '_requirements']) {
      const nom = `${c}${suffixe}`;
      const voisin = ligne[nom];
      if (Array.isArray(voisin)) return { compte, ids: voisin.map(identiteDe) };
    }
  }
  for (const [k, val] of Object.entries(ligne)) {
    if (!Array.isArray(val)) continue;
    if (!/regress/i.test(k)) continue;
    const estNouvelle = /new|nouvelle/i.test(k);
    const veutNouvelle = cles === CLES_G_NEW;
    if (estNouvelle === veutNouvelle) return { compte, ids: val.map(identiteDe) };
  }
  return { compte, ids: null };
}

/** `id@version` depuis une chaine ou un objet. Rend `?` si rien n'est lisible. */
function identiteDe(x: unknown): string {
  if (typeof x === 'string') return x.trim();
  if (x === null || typeof x !== 'object') return `?${decrit(x)}`;
  const o = x as Json;
  const idBrut = o.id ?? o.requirement_id ?? o.requirementId ?? o.exigence ?? o.key;
  const versionBrut = o.version ?? o.requirement_version ?? o.v;
  if (typeof idBrut === 'string' && /@\d+$/.test(idBrut)) return idBrut;
  if (typeof idBrut === 'string' && (typeof versionBrut === 'number' || typeof versionBrut === 'string')) {
    return `${idBrut}@${String(versionBrut)}`;
  }
  if (typeof idBrut === 'string') return idBrut;
  return `?${decrit(x)}`;
}

async function mesurer(serie: EntreePeriode[]): Promise<Mesure> {
  const f = resolveOpt('computePeriodMetrics', C_METRIQUES);
  if (f === null) return { ok: false, texte: 'ROLE-NON-RESOLU', brut: null, lignes: [] };
  const essais: { forme: string; entree: unknown }[] = [
    { forme: '{periods}', entree: { periods: clone(serie) } },
    { forme: 'tableau-nu', entree: clone(serie) },
  ];
  const echecs: string[] = [];
  for (const essai of essais) {
    let brut: unknown;
    try {
      brut = await Promise.resolve(f(essai.entree));
    } catch (e) {
      echecs.push(`${essai.forme} LEVE ${decrit(e)}`);
      continue;
    }
    const lignes = lignesDe(brut);
    if (lignes.length > 0) return { ok: true, texte: decrit(brut).slice(0, 600), brut, lignes };
    echecs.push(`${essai.forme} -> AUCUNE-LIGNE-LISIBLE ${decrit(brut).slice(0, 300)}`);
  }
  return { ok: false, texte: echecs.join(' | '), brut: null, lignes: [] };
}

/** Exige une mesure exploitable, avec le bon nombre de lignes. */
async function mesureDe(serie: EntreePeriode[], quoi: string): Promise<Mesure> {
  const m = await mesurer(serie);
  expect(m.ok ? 'mesure' : `MESURE-ILLISIBLE ${quoi} : ${m.texte.slice(0, 600)}`).toBe('mesure');
  expect(`${quoi} lignes=${String(m.lignes.length)}`).toBe(`${quoi} lignes=${String(serie.length)}`);
  return m;
}

/** Toutes les grandeurs numeriques d'une mesure, pour le controle de bornes L193. */
function bornesHorsIntervalle(m: Mesure, agregats: readonly (readonly string[])[]): string[] {
  const hors: string[] = [];
  const controle = (v: unknown, quoi: string): void => {
    const d = decimal(v);
    if (d !== null && (d < 0 || d > 1)) hors.push(`${quoi}=${String(d)}`);
  };
  m.lignes.forEach((ligne, i) => {
    controle(q(ligne), `Q[P${String(i + 1)}]`);
    controle(r(ligne), `R[P${String(i + 1)}]`);
  });
  for (const cles of agregats) controle(valeurAgregat(m.brut, cles), cles[0]);
  return hors;
}

/* ══════════════════════════════════════════════════════════════════════ */

describe('T04 — metriques de periode et leurs denominateurs', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T04.A1 F-QUALITY donne exactement les resultats annonces',
    async () => {
      assertLoaded();
      assertContrat();

      const serie = serieFQuality();

      // (0) LA FIXTURE CONSTRUITE EST BIEN CELLE DE LA RACINE GELEE. Sans cette
      //     assertion, « exactement les resultats annonces » ne serait rattache
      //     a rien d'observable : on comparerait une sortie a une attente sans
      //     savoir quelle entree l'a produite.
      expect(serie.length).toBe(NB_PERIODES_REF);
      expect(MEMES_DUREES_REF ? new Set(serie.map((p) => p.duration)).size : 0).toBe(1); // cahier:L107
      expect(serie.map((p) => p.period_index)).toEqual([1, 2, 3, 4]); // cahier:L78
      expect(serie.map((p) => p.intents_offered)).toEqual(OFFERTES_REF);
      expect(serie.map((p) => p.intents_succeeded)).toEqual(REUSSIES_REF);
      expect(
        serie.map((p) =>
          p.requirements.map((e) => `${cle(e.id, e.version)}:${String(e.weight)}:${e.satisfied ? 'sat' : 'viol'}`).join(' '),
        ),
      ).toEqual([
        'A@1:1:sat B@1:1:sat',
        'A@1:1:sat B@1:1:sat C@1:2:viol',
        'A@2:1:sat B@1:1:viol C@1:2:sat',
        'A@2:1:sat C@1:2:sat',
      ]); // cahier:L109
      expect(
        serie.map((p) =>
          p.retired
            .map((t) => `${cle(t.id, t.version)}->${t.replaced_by === null ? 'RETIRE' : cle(t.replaced_by.id, t.replaced_by.version)}`)
            .join(' '),
        ),
      ).toEqual(['', '', 'A@1->A@2', 'B@1->RETIRE']); // cahier:L109
      // SOMMES EXACTES (L193) : les cardinaux d'intentions de la racine gelee
      // totalisent bien le numerateur et le denominateur de 7/10.
      expect([
        REUSSIES_REF.reduce((a, b) => a + b, 0),
        OFFERTES_REF.reduce((a, b) => a + b, 0),
      ]).toEqual([AGREGEE_REF.num, AGREGEE_REF.den]); // cahier:L107

      const m = await mesureDe(serie, 'F-QUALITY');

      // (1) Q periode par periode : [1, 1/2, 3/4, 1].
      expect(m.lignes.map((ligne, i) => verdict(q(ligne), Q_REF[i], `Q[P${String(i + 1)}]`))).toEqual(
        Q_REF.map((attendu, i) => etiquette(attendu, `Q[P${String(i + 1)}]`)),
      ); // cahier:L107

      // (2) R periode par periode : [1, 1/2, null, 1/2].
      expect(m.lignes.map((ligne, i) => verdict(r(ligne), R_REF[i], `R[P${String(i + 1)}]`))).toEqual(
        R_REF.map((attendu, i) => etiquette(attendu, `R[P${String(i + 1)}]`)),
      ); // cahier:L107

      // (3) LES QUATRE AGREGATS, chacun sous son propre nom.
      expect(verdict(valeurAgregat(m.brut, CLES_V), V_REF, 'V')).toBe(etiquette(V_REF, 'V'));
      expect(verdict(valeurAgregat(m.brut, CLES_U), U_REF, 'U')).toBe(etiquette(U_REF, 'U'));
      expect(verdict(valeurAgregat(m.brut, CLES_EXPOSITION), EXPOSITION_REF, 'exposition')).toBe(
        etiquette(EXPOSITION_REF, 'exposition'),
      );
      expect(verdict(valeurAgregat(m.brut, CLES_AGREGEE), AGREGEE_REF, 'reussite_agregee')).toBe(
        etiquette(AGREGEE_REF, 'reussite_agregee'),
      );

      // (4) « CES TROIS DERNIERS NOMBRES SONT DIFFERENTS ET DOIVENT RESTER
      //     IDENTIFIES » (L107). Trois chemins DISTINCTS dans la sortie, et
      //     trois valeurs DISTINCTES : une implementation qui republierait U
      //     sous trois noms passerait l'assertion (3) et tombe ici.
      const chemins = [
        cheminAgregat(m.brut, CLES_U),
        cheminAgregat(m.brut, CLES_EXPOSITION),
        cheminAgregat(m.brut, CLES_AGREGEE),
      ];
      expect(new Set(chemins).size).toBe(3); // cahier:L107
      const troisValeurs = [
        decimal(valeurAgregat(m.brut, CLES_U)),
        decimal(valeurAgregat(m.brut, CLES_EXPOSITION)),
        decimal(valeurAgregat(m.brut, CLES_AGREGEE)),
      ];
      expect(troisValeurs.filter((x) => x !== null).length).toBe(3);
      expect(new Set(troisValeurs.map((x) => String(x))).size).toBe(3); // cahier:L107

      // (5) BORNES [0,1] (L193). La liste des hors-bornes doit etre vide, et le
      //     controle doit avoir porte sur des valeurs REELLEMENT lues.
      expect(bornesHorsIntervalle(m, [CLES_V, CLES_U, CLES_EXPOSITION, CLES_AGREGEE])).toEqual([]); // cahier:L193
      expect(
        [
          ...m.lignes.map((ligne) => decimal(q(ligne))),
          ...m.lignes.map((ligne) => decimal(r(ligne))),
          decimal(valeurAgregat(m.brut, CLES_V)),
          decimal(valeurAgregat(m.brut, CLES_U)),
          decimal(valeurAgregat(m.brut, CLES_EXPOSITION)),
          decimal(valeurAgregat(m.brut, CLES_AGREGEE)),
        ].filter((x) => x !== null).length,
      ).toBe(11); // 4 Q + 3 R non nuls + 4 agregats

      // (6) PURETE (L187) : la meme serie, mesuree deux fois, donne exactement
      //     la meme sortie. Une note stochastique ne survivrait pas a cette
      //     egalite — c'est la part observable de « aucune note LLM
      //     n'intervient » (L193).
      const encore = await mesureDe(serieFQuality(), 'F-QUALITY recalculee');
      expect(decrit(encore.brut)).toBe(decrit(m.brut)); // cahier:L187

      console.log(
        `[T04.A1] via=${LOADED.via.join(',')} V=${String(decimal(valeurAgregat(m.brut, CLES_V)))} ` +
          `U=${String(decimal(valeurAgregat(m.brut, CLES_U)))} ` +
          `exposition=${String(decimal(valeurAgregat(m.brut, CLES_EXPOSITION)))} ` +
          `agregee=${String(decimal(valeurAgregat(m.brut, CLES_AGREGEE)))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T04.A2 dupliquer les assertions d une exigence ne change pas Q',
    async () => {
      assertLoaded();
      assertContrat();

      const base = serieFQuality();
      const triple = dupliquerAssertions(base, 3);
      const septuple = dupliquerAssertions(base, 7);
      const vide = clone(base);
      for (const p of vide) for (const e of p.requirements) e.assertions = [];

      // (0) LA DUPLICATION A REELLEMENT EU LIEU. Sans cette assertion,
      //     « l'invariance » serait affirmee entre deux entrees identiques :
      //     une tautologie, exactement ce que §G refuse.
      const comptes = [compteAssertions(base), compteAssertions(triple), compteAssertions(septuple), compteAssertions(vide)];
      expect(comptes).toEqual([
        compteAssertions(base),
        compteAssertions(base) * 3,
        compteAssertions(base) * 7,
        0,
      ]);
      expect(new Set(comptes).size).toBe(4);
      expect(comptes[0] > 0).toBe(true);
      // Les exigences, elles, sont INCHANGEES : meme ids, memes poids, memes
      // statuts. Seule la cardinalite des assertions bouge.
      const signature = (s: EntreePeriode[]): string[] =>
        s.map((p) => p.requirements.map((e) => `${cle(e.id, e.version)}:${String(e.weight)}:${String(e.satisfied)}`).join(' '));
      expect(signature(triple)).toEqual(signature(base));
      expect(signature(septuple)).toEqual(signature(base));
      expect(signature(vide)).toEqual(signature(base));

      // (1) TEMOIN ANTI-CONSTANTE. Q n'est pas une constante : la serie de
      //     reference porte QUATRE valeurs dont trois distinctes. Une
      //     implementation qui rendrait toujours la meme ligne — le defaut que
      //     verification/cases.lock.json nomme pour ce cas — tombe ici AVANT
      //     meme d'atteindre l'invariance.
      const attenduQ = Q_REF.map((a, i) => etiquette(a, `Q[P${String(i + 1)}]`));
      expect(new Set(attenduQ).size).toBeGreaterThan(1);
      const mBase = await mesureDe(base, 'base');
      const qBase = mBase.lignes.map((ligne, i) => verdict(q(ligne), Q_REF[i], `Q[P${String(i + 1)}]`));
      expect(qBase).toEqual(attenduQ); // cahier:L107

      // (2) L'ENONCE DU CAS : dupliquer les assertions ne change pas Q.
      //     « Compter par id/version active, pas par nombre d'assertions »
      //     (L129) ; « le nombre d'assertions ou de tests ne determine pas le
      //     poids d'une fonctionnalite » (L72).
      for (const [nom, serie] of [
        ['x3', triple],
        ['x7', septuple],
        ['x0', vide],
      ] as const) {
        const m = await mesureDe(serie, `assertions ${nom}`);
        expect(m.lignes.map((ligne, i) => verdict(q(ligne), Q_REF[i], `Q[P${String(i + 1)}]`))).toEqual(attenduQ); // cahier:L129
      }

      // (3) DUPLIQUER UNE SEULE EXIGENCE, pas toutes : le cas parle de
      //     « dupliquer les assertions D'UNE exigence ». On le fait pour une
      //     exigence SATISFAITE puis pour une exigence VIOLEE — si le compte
      //     d'assertions entrait dans Q, le sens de la derive differerait selon
      //     le statut, et une seule des deux moities suffirait a le voir.
      const p2 = base[1];
      const satisfaite = p2.requirements.find((e) => e.satisfied);
      const violee = p2.requirements.find((e) => !e.satisfied);
      expect(satisfaite === undefined || violee === undefined ? 'FIXTURE-SANS-LES-DEUX-STATUTS' : 'ok').toBe('ok');
      for (const cible of [satisfaite, violee]) {
        if (cible === undefined) continue;
        const variante = clone(base);
        for (const p of variante) {
          for (const e of p.requirements) {
            if (e.id === cible.id && e.version === cible.version) {
              e.assertions = [...e.assertions, ...e.assertions, ...e.assertions, ...e.assertions];
            }
          }
        }
        expect(compteAssertions(variante) > compteAssertions(base)).toBe(true);
        const m = await mesureDe(variante, `duplication ciblee ${cle(cible.id, cible.version)}`);
        expect(m.lignes.map((ligne, i) => verdict(q(ligne), Q_REF[i], `Q[P${String(i + 1)}]`))).toEqual(attenduQ); // cahier:L129
      }

      // (4) SECOND TEMOIN : ce qui DOIT changer Q change bien Q. Rendre C@1
      //     satisfaite en P2 fait passer Q(P2) de 1/2 a la valeur pleine de
      //     P1 — « toutes satisfaites » — c'est-a-dire a Q_REF[0]. Sans cette
      //     assertion, « Q ne change pas » resterait indistinguable de « Q ne
      //     bouge jamais ».
      const reparee = clone(base);
      for (const e of reparee[1].requirements) e.satisfied = true;
      const mReparee = await mesureDe(reparee, 'C@1 satisfaite en P2');
      expect(verdict(q(mReparee.lignes[1]), Q_REF[0], 'Q[P2]')).toBe(etiquette(Q_REF[0], 'Q[P2]')); // cahier:L109
      expect(verdict(q(mReparee.lignes[1]), Q_REF[1], 'Q[P2]')).not.toBe(etiquette(Q_REF[1], 'Q[P2]'));

      console.log(
        `[T04.A2] assertions base=${String(comptes[0])} x3=${String(comptes[1])} x7=${String(comptes[2])} ` +
          `x0=${String(comptes[3])} ; Q invariant sur ${String(Q_REF.length)} periodes`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T04.A3 F-REGRESSION exclut cancel@1 et compte isolation@1',
    async () => {
      assertLoaded();
      assertContrat();

      // (0) LA FIXTURE EST CELLE DE LA RACINE GELEE : les deux identifiants,
      //     leurs periodes et leur verdict de regression viennent de
      //     acceptance/reference/F-REGRESSION.json.
      expect([REG_REMPLACEE, REG_REMPLACANTE, REG_VIOLEE].map((s) => cle(idVersion(s).id, idVersion(s).version))).toEqual([
        REG_REMPLACEE,
        REG_REMPLACANTE,
        REG_VIOLEE,
      ]);
      expect([REG_REMPLACEE_PRODUIT, REG_VIOLEE_PRODUIT]).toEqual([false, true]); // cahier:L129
      expect([REG_SATISFAITE_EN, REG_REMPLACEE_EN, REG_VIOLEE_SATISFAITE_EN, REG_VIOLEE_VIOLEE_EN]).toEqual([
        'P2',
        'P3',
        'P3',
        'P4',
      ]); // cahier:L129

      const serie = serieFRegression();
      expect(serie.map((p) => p.period_index)).toEqual([1, 2, 3, 4]); // cahier:L78
      // `cancel@1` est bien satisfaite en P2 et retiree-remplacee en P3.
      expect(
        serie[1].requirements.some((e) => cle(e.id, e.version) === REG_REMPLACEE && e.satisfied),
      ).toBe(true);
      expect(
        serie[2].retired.map((t) => `${cle(t.id, t.version)}->${t.replaced_by === null ? 'RETIRE' : cle(t.replaced_by.id, t.replaced_by.version)}`),
      ).toEqual([`${REG_REMPLACEE}->${REG_REMPLACANTE}`]); // cahier:L129
      // `isolation@1` est satisfaite en P3 et violee en P4.
      expect(serie[2].requirements.some((e) => cle(e.id, e.version) === REG_VIOLEE && e.satisfied)).toBe(true);
      expect(serie[3].requirements.some((e) => cle(e.id, e.version) === REG_VIOLEE && !e.satisfied)).toBe(true);

      const m = await mesureDe(serie, 'F-REGRESSION');

      // (1) LES IDENTITES SONT PUBLIEES. Un compte seul ne distinguerait pas
      //     « compte isolation@1 » de « compte le retrait de cancel@1 ».
      const parPeriode = m.lignes.map((ligne) => regressionsDe(ligne, CLES_G));
      expect(
        parPeriode.map((g, i) => (g.ids === null ? `P${String(i + 1)}=IDENTITES-ABSENTES` : `P${String(i + 1)}=ok`)),
      ).toEqual([1, 2, 3, 4].map((i) => `P${String(i)}=ok`));

      // (2) L'ENONCE DU CAS. Sur les quatre periodes reunies, la seule exigence
      //     en regression est `isolation@1` ; `cancel@1` n'y figure NULLE PART.
      const toutes = parPeriode.flatMap((g, i) => (g.ids ?? []).map((id) => `P${String(i + 1)}:${id}`));
      expect(toutes).toEqual([`P4:${REG_VIOLEE}`]); // cahier:L129
      expect(toutes.filter((s) => s.endsWith(`:${REG_REMPLACEE}`))).toEqual([]); // cahier:L129

      // (3) LE COMPTE ATTENDU par la racine gelee : « en produit une ».
      const comptes = parPeriode.map((g) => g.compte);
      expect(comptes.filter((c) => c !== null).length).toBe(4);
      expect(comptes.reduce((a: number, b) => a + (b ?? 0), 0)).toBe(REG_ATTENDUES);
      expect(comptes).toEqual([0, 0, 0, REG_ATTENDUES]); // cahier:L129

      // (4) TEMOIN : L'EXCLUSION VIENT DU REMPLACEMENT, PAS DE L'IDENTIFIANT.
      //     La meme serie ou `cancel@1` reste active et violee en P3 doit, elle,
      //     produire une regression QUI LA NOMME. Sans ce temoin, une
      //     implementation qui ignorerait purement et simplement toute exigence
      //     nommee `cancel` passerait (2) et (3).
      const temoin = serieFRegression({ sansRemplacement: true });
      expect(temoin[2].retired).toEqual([]);
      const mTemoin = await mesureDe(temoin, 'temoin cancel@1 non remplacee');
      const idsTemoin = mTemoin.lignes.flatMap((ligne, i) =>
        (regressionsDe(ligne, CLES_G).ids ?? [])
          .slice()
          .sort()
          .map((id) => `P${String(i + 1)}:${id}`),
      );
      expect(idsTemoin).toEqual([
        `P3:${REG_REMPLACEE}`,
        `P4:${REG_REMPLACEE}`,
        `P4:${REG_VIOLEE}`,
      ]); // cahier:L189

      // (5) SECOND TEMOIN : si `isolation@1` reste satisfaite en P4, plus
      //     aucune regression nulle part. « G=1 » n'est donc pas une constante.
      const reparee = serieFRegression({ isolationReparee: true });
      const mReparee = await mesureDe(reparee, 'temoin isolation@1 reparee');
      expect(mReparee.lignes.flatMap((ligne) => regressionsDe(ligne, CLES_G).ids ?? [])).toEqual([]); // cahier:L189
      expect(mReparee.lignes.map((ligne) => regressionsDe(ligne, CLES_G).compte)).toEqual([0, 0, 0, 0]);

      console.log(
        `[T04.A3] regressions=${JSON.stringify(toutes)} comptes=${JSON.stringify(comptes)} ` +
          `temoin=${JSON.stringify(idsTemoin)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T04.A4 deux periodes consecutives cassees donnent G=1 aux deux et G_new=1 puis 0',
    async () => {
      assertLoaded();
      assertContrat();

      // Serie de cinq periodes sur UNE exigence `X@1`, due des P1 :
      //   P1 satisfaite · P2 violee · P3 violee · P4 reparee · P5 re-violee
      // Les deux periodes consecutives cassees de l'enonce sont P2 et P3.
      // P4 et P5 sont le TEMOIN : une regression reparee puis rouverte
      // redevient NOUVELLE, ce qu'un « 1 puis 0 » fige ne sait pas rendre.
      const statuts = [true, false, false, true, false];
      const serie = statuts.map((satisfied, i) =>
        periode({
          period_index: i + 1,
          requirements: [exigence({ id: 'X', version: 1, satisfied, source: 'T04.A4' })],
          intents_offered: 2,
          intents_succeeded: 1,
        }),
      );
      expect(serie.map((p) => p.requirements[0].satisfied)).toEqual(statuts);
      expect(serie.map((p) => p.period_index)).toEqual([1, 2, 3, 4, 5]); // cahier:L78

      const m = await mesureDe(serie, 'deux periodes consecutives cassees');
      const g = m.lignes.map((ligne) => regressionsDe(ligne, CLES_G));
      const gn = m.lignes.map((ligne) => regressionsDe(ligne, CLES_G_NEW));
      expect(g.map((x) => x.compte).filter((c) => c !== null).length).toBe(5);
      expect(gn.map((x) => x.compte).filter((c) => c !== null).length).toBe(5);

      // (1) L'ENONCE DU CAS, mot pour mot : « deux periodes consecutives
      //     cassees donnent G=1 aux deux et G_new=1 puis 0 ».
      expect([g[1].compte, g[2].compte]).toEqual([1, 1]); // cahier:L191
      expect([gn[1].compte, gn[2].compte]).toEqual([1, 0]); // cahier:L191

      // (2) LA REGRESSION EST PERSISTANTE, PAS RENOUVELEE : c'est la MEME
      //     exigence qui contribue a G en P2 et en P3 (L189).
      expect(g[1].ids).toEqual(['X@1']);
      expect(g[2].ids).toEqual(['X@1']); // cahier:L189
      expect(gn[2].ids ?? []).toEqual([]); // cahier:L189

      // (3) UNE EXIGENCE JAMAIS CASSEE N'EST PAS UNE REGRESSION : P1 est
      //     satisfaite d'emblee, donc G=G_new=0. C'est la moitie « autrefois
      //     satisfaite » de la definition de L189.
      expect([g[0].compte, gn[0].compte]).toEqual([0, 0]); // cahier:L189

      // (4) TEMOIN : reparation puis reouverture. En P4 l'exigence redevient
      //     satisfaite — G retombe a 0 ; en P5 elle casse a nouveau, et comme
      //     elle etait satisfaite « a la periode precedente comparable », la
      //     regression est de nouveau NOUVELLE.
      expect([g[3].compte, gn[3].compte]).toEqual([0, 0]); // cahier:L189
      expect([g[4].compte, gn[4].compte]).toEqual([1, 1]); // cahier:L189
      expect(g[4].ids).toEqual(['X@1']);

      // (5) SECOND TEMOIN : G COMPTE PAR ID/VERSION ACTIVE (L129), ce n'est pas
      //     un booleen. Deux exigences distinctes cassees ensemble donnent G=2 ;
      //     cassees l'une apres l'autre, G_new suit une seule d'entre elles.
      const deux = [
        [true, true],
        [false, true],
        [false, false],
      ].map((paire, i) =>
        periode({
          period_index: i + 1,
          requirements: [
            exigence({ id: 'X', version: 1, satisfied: paire[0], source: 'T04.A4' }),
            exigence({ id: 'Y', version: 1, satisfied: paire[1], source: 'T04.A4' }),
          ],
          intents_offered: 2,
          intents_succeeded: 1,
        }),
      );
      const mDeux = await mesureDe(deux, 'deux exigences');
      const g2 = mDeux.lignes.map((ligne) => regressionsDe(ligne, CLES_G));
      const gn2 = mDeux.lignes.map((ligne) => regressionsDe(ligne, CLES_G_NEW));
      expect(g2.map((x) => x.compte)).toEqual([0, 1, 2]); // cahier:L129
      expect(gn2.map((x) => x.compte)).toEqual([0, 1, 1]); // cahier:L189
      expect((g2[2].ids ?? []).slice().sort()).toEqual(['X@1', 'Y@1']);
      expect(gn2[2].ids).toEqual(['Y@1']); // cahier:L189

      console.log(
        `[T04.A4] G=${JSON.stringify(g.map((x) => x.compte))} G_new=${JSON.stringify(gn.map((x) => x.compte))} ` +
          `deux exigences G=${JSON.stringify(g2.map((x) => x.compte))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T04.A5 zero usage donne R=null et une panne avec quatre usages donne R=0',
    async () => {
      assertLoaded();
      assertContrat();

      // (0) LA FIXTURE : F-QUALITY porte deja la periode SANS usage — P3, dont
      //     `intentions_offertes` vaut 0 et dont la racine gelee inscrit R=null.
      const serie = serieFQuality();
      const sansUsage = serie.findIndex((p) => p.intents_offered === 0);
      expect(sansUsage).toBe(2); // P3, cahier:L107
      expect(R_REF[sansUsage]).toBeNull(); // cahier:L107
      expect(R_REF.filter((x) => x === null).length).toBe(1);

      const m = await mesureDe(serie, 'F-QUALITY');

      // (1) « R vaut null lorsqu'aucune intention admissible n'est proposee »
      //     (L111). STRICTEMENT null : ni 0, ni absent, ni NaN.
      expect(rendu(lireValeur(r(m.lignes[sansUsage])), 'R[P3]')).toBe('R[P3]=null'); // cahier:L111
      expect(decimal(r(m.lignes[sansUsage]))).toBeNull();

      // (2) LA CONSEQUENCE SUR LE DENOMINATEUR : « U est la moyenne temporelle
      //     sur les periodes EXPOSEES, avec l'exposition publiee » (L111).
      //     Coalescer le null en 0 donnerait 2/4 ; l'exposition passerait a 1.
      expect(verdict(valeurAgregat(m.brut, CLES_U), U_REF, 'U')).toBe(etiquette(U_REF, 'U')); // cahier:L107
      expect(verdict(valeurAgregat(m.brut, CLES_EXPOSITION), EXPOSITION_REF, 'exposition')).toBe(
        etiquette(EXPOSITION_REF, 'exposition'),
      ); // cahier:L107

      // (3) TEMOIN : la MEME serie dont P3 recoit deux intentions cesse de
      //     valoir null, et l'exposition passe a 1 — quatre periodes exposees
      //     sur quatre. Sans ce temoin, « R=null » serait indistinguable d'un
      //     R jamais calcule.
      const exposee = clone(serie);
      exposee[sansUsage].intents_offered = 2;
      exposee[sansUsage].intents_succeeded = 1;
      const mExposee = await mesureDe(exposee, 'P3 exposee');
      expect(verdict(r(mExposee.lignes[sansUsage]), { num: 1, den: 2 }, 'R[P3]')).toBe('R[P3]=1/2');
      expect(verdict(valeurAgregat(mExposee.brut, CLES_EXPOSITION), { num: 4, den: 4 }, 'exposition')).toBe(
        'exposition=4/4',
      );
      expect(verdict(valeurAgregat(mExposee.brut, CLES_EXPOSITION), EXPOSITION_REF, 'exposition')).not.toBe(
        etiquette(EXPOSITION_REF, 'exposition'),
      );

      // (4) LA PANNE AVEC QUATRE USAGES : « une trajectoire indisponible face a
      //     des intentions prevues a R=0, jamais null » (L111). Quatre usages,
      //     zero reussi (L191). F-FAILURE fixe le reste : K=4, quatre lignes
      //     conservees, Q=[0,0,0,0] et R=[0,0,0,0] « si les exigences et usages
      //     y sont presents » (L121).
      const USAGES_PANNE = 4; // cahier:L191
      expect([K_FAILURE, LIGNES_FAILURE_REF]).toEqual([4, 4]); // cahier:L121
      const panne = Array.from({ length: K_FAILURE }, (_, i) =>
        periode({
          period_index: i + 1,
          // « si les exigences [...] y sont presents » : une exigence active
          // due et violee, sans quoi L111 donnerait Q=null.
          requirements: [exigence({ id: 'W', version: 1, satisfied: false, source: 'F-FAILURE' })],
          intents_offered: USAGES_PANNE,
          intents_succeeded: 0,
        }),
      );
      const mPanne = await mesureDe(panne, 'F-FAILURE');
      expect(mPanne.lignes.map((ligne, i) => verdict(r(ligne), { num: R_FAILURE_REF[i], den: 1 }, `R[P${String(i + 1)}]`))).toEqual(
        R_FAILURE_REF.map((x, i) => `R[P${String(i + 1)}]=${String(x)}/1`),
      ); // cahier:L121
      expect(mPanne.lignes.map((ligne, i) => verdict(q(ligne), { num: Q_FAILURE_REF[i], den: 1 }, `Q[P${String(i + 1)}]`))).toEqual(
        Q_FAILURE_REF.map((x, i) => `Q[P${String(i + 1)}]=${String(x)}/1`),
      ); // cahier:L121
      // AUCUN de ces R n'est null : c'est la moitie symetrique de l'enonce.
      expect(mPanne.lignes.map((ligne) => lireValeur(r(ligne)).forme)).toEqual(
        R_FAILURE_REF.map(() => 'nombre'),
      ); // cahier:L111
      // Les quatre periodes sont EXPOSEES : U=0 et exposition=1, jamais null.
      expect(verdict(valeurAgregat(mPanne.brut, CLES_U), { num: 0, den: 1 }, 'U')).toBe('U=0/1'); // cahier:L111
      expect(verdict(valeurAgregat(mPanne.brut, CLES_EXPOSITION), { num: 4, den: 4 }, 'exposition')).toBe(
        'exposition=4/4',
      ); // cahier:L111
      expect(bornesHorsIntervalle(mPanne, [CLES_V, CLES_U, CLES_EXPOSITION])).toEqual([]); // cahier:L193

      console.log(
        `[T04.A5] R(F-QUALITY)=${JSON.stringify(m.lignes.map((l) => decimal(r(l))))} ` +
          `R(panne)=${JSON.stringify(mPanne.lignes.map((l) => decimal(r(l))))} ` +
          `exposition=${String(decimal(valeurAgregat(m.brut, CLES_EXPOSITION)))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T04.A6 une exigence non encore due est absente du denominateur de Q',
    async () => {
      assertLoaded();
      assertContrat();

      // PARAMETRES LIBRES, declares. F-QUALITY inscrit en
      // `non_fixe_par_le_cahier` : « identifiant, version, poids, periode de
      // revelation et echeance de l'exigence du test negatif ». Le poids est
      // choisi GRAND devant ceux de la fixture (1, 1, 2) pour que son entree
      // indue soit impossible a confondre avec un arrondi.
      const POIDS_NON_DUE = 5;
      const ECHEANCE = 4;
      const invariant = String(refValue(F_QUALITY, 'valeurs.entrees_exactes_de_Q.test_negatif.invariant.valeur'));
      expect(invariant.length > 0).toBe(true);
      expect(refValue(F_QUALITY, 'valeurs.entrees_exactes_de_Q.test_negatif.poids.valeur')).toBeNull(); // parametre libre

      const base = serieFQuality();
      const attenduQ = Q_REF.map((a, i) => etiquette(a, `Q[P${String(i + 1)}]`));

      // (0) TEMOIN : sans l'exigence ajoutee, la serie donne bien la Q de la
      //     racine gelee. Sans lui, l'egalite de (1) pourrait tenir entre deux
      //     sorties egalement fausses.
      const mBase = await mesureDe(base, 'F-QUALITY sans exigence ajoutee');
      expect(mBase.lignes.map((ligne, i) => verdict(q(ligne), Q_REF[i], `Q[P${String(i + 1)}]`))).toEqual(attenduQ); // cahier:L107

      // (1) L'ENONCE DU CAS. `D@1`, revelee en P1 mais due en P4, est ajoutee
      //     aux quatre periodes. Tant qu'elle n'est pas due, « son poids ne
      //     doit pas entrer dans Q » (L109) : Q(P1..P3) est INCHANGEE.
      const avecNonDue = clone(base);
      for (const p of avecNonDue) {
        p.requirements.push(
          exigence({
            id: 'D',
            version: 1,
            weight: POIDS_NON_DUE,
            revealed_at_period: 1,
            due_at_period: ECHEANCE,
            satisfied: false,
            source: 'test negatif de Q (L109)',
          }),
        );
      }
      expect(avecNonDue.map((p) => p.requirements.length)).toEqual(base.map((p) => p.requirements.length + 1));
      const mNonDue = await mesureDe(avecNonDue, 'exigence revelee non encore due');
      expect(mNonDue.lignes.slice(0, 3).map((ligne, i) => verdict(q(ligne), Q_REF[i], `Q[P${String(i + 1)}]`))).toEqual(
        attenduQ.slice(0, 3),
      ); // cahier:L109

      // (2) ELLE N'EST PAS NON PLUS UNE REGRESSION AVANT SON ECHEANCE : L189
      //     ne compte que les exigences « actives DUES ». Ajouter une exigence
      //     violee mais pas encore due laisse donc G RIGOUREUSEMENT INCHANGE —
      //     et `D@1` n'y figure nulle part.
      const regressionsSignees = (m: Mesure, n: number): string[] =>
        m.lignes.slice(0, n).map((ligne) => (regressionsDe(ligne, CLES_G).ids ?? []).slice().sort().join(','));
      expect(regressionsSignees(mNonDue, 3)).toEqual(regressionsSignees(mBase, 3)); // cahier:L189
      expect(
        mNonDue.lignes
          .slice(0, 3)
          .flatMap((ligne) => regressionsDe(ligne, CLES_G).ids ?? [])
          .filter((id) => /^D@/.test(id)),
      ).toEqual([]); // cahier:L189

      // (3) CONTRE-EPREUVE « RENDRE PRESENT ». La MEME exigence, une fois DUE
      //     en P4 et violee, entre bel et bien dans le denominateur : Q(P4)
      //     passe strictement sous la valeur de la racine gelee, et reste dans
      //     [0,1]. C'est ce qui distingue « filtree par l'echeance » de
      //     « ignoree tout court ».
      const q4 = decimal(q(mNonDue.lignes[3]));
      const q4Ref = Q_REF[3] === null ? null : Q_REF[3].num / Q_REF[3].den;
      expect(q4 === null || q4Ref === null ? 'Q[P4]-ILLISIBLE' : 'lisible').toBe('lisible');
      expect(q4 !== null && q4Ref !== null && q4 < q4Ref - TOLERANCE).toBe(true); // cahier:L109
      expect(q4 !== null && q4 >= 0 && q4 <= 1).toBe(true); // cahier:L193

      // (4) LE FILTRE PORTE SUR L'ECHEANCE, PAS SUR LA SATISFACTION. La meme
      //     exigence, due en P4 mais SATISFAITE, laisse Q(P4) a sa valeur de
      //     reference : ajouter un poids satisfait a un denominateur deja
      //     entierement satisfait ne change rien.
      const avecDueSatisfaite = clone(avecNonDue);
      for (const p of avecDueSatisfaite) {
        for (const e of p.requirements) if (e.id === 'D') e.satisfied = true;
      }
      const mDueSatisfaite = await mesureDe(avecDueSatisfaite, 'exigence due et satisfaite');
      expect(mDueSatisfaite.lignes.map((ligne, i) => verdict(q(ligne), Q_REF[i], `Q[P${String(i + 1)}]`))).toEqual(attenduQ); // cahier:L109

      // (5) CAS VIDE (L193) : une periode dont la SEULE exigence n'est pas
      //     encore due n'a « aucun poids d'exigence active due » — Q vaut donc
      //     null (L111), et non 0 ni 1. Les usages, eux, restent mesures.
      const vide = [
        periode({
          period_index: 1,
          requirements: [
            exigence({
              id: 'D',
              version: 1,
              weight: POIDS_NON_DUE,
              revealed_at_period: 1,
              due_at_period: ECHEANCE,
              satisfied: false,
              source: 'test negatif de Q (L109)',
            }),
          ],
          intents_offered: 2,
          intents_succeeded: 1,
        }),
      ];
      const mVide = await mesureDe(vide, 'periode sans exigence active due');
      expect(rendu(lireValeur(q(mVide.lignes[0])), 'Q[P1]')).toBe('Q[P1]=null'); // cahier:L111
      expect(verdict(r(mVide.lignes[0]), { num: 1, den: 2 }, 'R[P1]')).toBe('R[P1]=1/2'); // cahier:L111

      console.log(
        `[T04.A6] Q(non due)=${JSON.stringify(mNonDue.lignes.map((l) => decimal(q(l))))} ` +
          `Q(due violee P4)=${String(q4)} Q(due satisfaite)=${JSON.stringify(
            mDueSatisfaite.lignes.map((l) => decimal(q(l))),
          )} Q(cas vide)=${String(decimal(q(mVide.lignes[0])))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
