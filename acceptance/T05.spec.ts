/**
 * acceptance/T05.spec.ts — suite d'acceptation de la tache T05.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T05.A1 behaviour — parcours nominal respecte les phases de E
 *   T05.A2 refusal   — deployer avant validation est REFUSE
 *   T05.A3 absence   — rejouer un evenement d'identite ET de contenu
 *                      identiques est SANS EFFET SUPPLEMENTAIRE
 *   T05.A4 refusal   — meme identite, contenu different -> `IDEMPOTENCY_CONFLICT`
 *   T05.A5 behaviour — budget epuise declenche la MESURE DE LA VERSION
 *                      EXISTANTE, pas un succes fictif
 *   T05.A6 behaviour — sans deploiement, la cloture d'une periode produit les
 *                      demandes non servies prevues par F-FAILURE
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE a `packages/domain` — le `source_paths`
 * que verification/tasks.json declare pour T05. ADR-001 : cet aveuglement est
 * PROCEDURAL, donc une discipline auditable au diff, pas une barriere
 * technique. Le contrat teste ci-dessous n'est pas releve dans
 * l'implementation ; il est derive de docs/specs/T05.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle :
 *
 *   L197  livrables : « machine a etats PURE dans `domain`, evenements,
 *         commandes attendues et erreurs de transition »
 *   L199  les six cas d'acceptation, mot pour mot — dont le seul code d'erreur
 *         que le cahier NOMME pour T05 : `IDEMPOTENCY_CONFLICT`
 *   L201  fin : « table exhaustive des transitions autorisees, erreurs typees
 *         et TEST DE REDUCTION D'UN JOURNAL EN ETAT FINAL. Les effets reseau
 *         sont des COMMANDES a executer par adaptateurs, pas des appels caches
 *         dans le reducer »
 *   L97   les dix phases de E, dans l'ordre : `PENDING`, `RESTORING`,
 *         `REVEALING`, `DEVELOPING`, `VALIDATING`, `DEPLOYING`, `EXERCISING`,
 *         `AUDITING`, `CHECKPOINTING`, `COMPLETED` ; les trois etats d'arret
 *         `BUDGET_EXHAUSTED`, `RUNNER_BLOCKED`, `CANCELLED` qui « n'effacent
 *         pas la periode de l'analyse » ; `attempt_outcome` ∈ {SUCCESS,
 *         FAILED, CANCELLED} ; `deployment_coverage` ∈ {NO_DEPLOYMENT,
 *         PARTIAL, ACCEPTED}
 *   L87   contrat `PeriodState` : phase, identite, snapshot courant,
 *         deploiement courant, contrats actifs, backlog, budget, horloge
 *   L95   contrat `PeriodResult` : depenses, exigences evaluees, intentions
 *         offertes/reussies, incidents, Q, R, G, statut et empreintes
 *   L78   identite : une periode ajoute `period_index` commencant a 1 ; une
 *         operation ajoute `phase`, `operation_kind`, `operation_sequence` et
 *         `logical_attempt`
 *   L68   invariant D.6 : « une tache peut etre rejouee par l'orchestrateur ;
 *         les effets valides sont DEDUPLIQUES PAR CLE D'OPERATION ET EMPREINTE
 *         D'ENTREE » — c'est la definition meme de A3 et A4
 *   L67   invariant D.5 : « un echec conserve ses depenses, ses INTENTIONS NON
 *         SERVIES et son backlog » — c'est la definition de A6
 *   L71   invariant D.9 : « les depenses utilisent des entiers exacts, jamais
 *         une addition de flottants monetaires »
 *   L82   octets canoniques : « objets JSON tries recursivement par cle ; ordre
 *         des tableaux conserve [...] aucun timestamp technique ajoute a un
 *         objet metier deterministe »
 *   L121  F-FAILURE : quatre lignes conservees, Q=0 et R=0, couts
 *         `[100,50,0,0]` totalisant 150, « un arret de calcul apres P2 ne
 *         supprime pas P3 et P4 ; aucune facture imaginaire n'y est ajoutee »
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes [...] un test avec zero assertion [...] ne
 *         satisfait pas le contrat »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des deux sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/**` — racine gelee,
 *       docs/FROZEN_ROOTS.json. C'est le cas de TOUTES les valeurs attendues de
 *       A6 : K, les series Q et R, les couts par periode, leur total et le
 *       nombre de lignes conservees, lus dans
 *       acceptance/reference/F-FAILURE.json ;
 *   (b) un commentaire `// cahier:L<n>` resoluble par
 *       `sed -n '<n>p' docs/cahier.md` — c'est le cas du vocabulaire de phases
 *       et d'enums (L97) et du code `IDEMPOTENCY_CONFLICT` (L199).
 *
 * Les PARAMETRES LIBRES — ceux que le cahier ne fixe pas — sont declares
 * explicitement plus bas avec renvoi a la rubrique `non_fixe_par_le_cahier` de
 * la fixture concernee : nombre d'intentions offertes par periode, identifiants
 * de trajectoire, horloge metier. Ce sont des ENTREES choisies, jamais des
 * valeurs attendues.
 *
 * Aucune valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT DE NOMMAGE ET DE FORME.
 *
 * Le paquet est charge par son SPECIFICATEUR, que jest.config.mjs mappe vers
 * `packages/<nom>/src` — jamais vers un `dist/` perime, gitignore et invisible
 * a `git status --porcelain`.
 *
 * TROIS ROLES, dont deux que L201 nomme explicitement :
 *
 *   applyPeriodEvent(etat, evenement)
 *        -> { state, commands } : la transition PURE. Un refus peut etre LEVE
 *           ou RENDU (`ok:false`, `error`, `errors[]`) — la suite n'impose pas
 *           le mecanisme, elle impose le CODE et l'ABSENCE D'EFFET.
 *   reducePeriodLog(etat, journal)
 *        -> etat final : « test de reduction d'un journal en etat final »
 *           (L201). A1 exige qu'il coincide EXACTEMENT avec le pliage pas a pas.
 *   closePeriod(etat)  [facultatif]
 *        -> PeriodResult (L95). Si le role n'est pas publie, la suite lit les
 *           memes champs dans l'etat final : A6 juge le CONTENU du resultat de
 *           cloture, pas le nom de la fonction qui le rend.
 *
 * Une courte liste d'alias documentee accompagne chaque nom primaire. Les alias
 * sont une tolerance de NOMMAGE, pas de COMPORTEMENT : toutes les assertions
 * restent identiques quel que soit le nom retenu. Cette tolerance sert §H
 * (« rends le test d'acceptation rouge pour la raison attendue ») : un
 * desaccord de vocabulaire entre l'auteur aveugle et l'implementeur produirait
 * un rouge qui ne dit rien du contrat. Si AUCUN nom ne repond, la suite echoue
 * par une assertion explicite qui nomme le role et la liste attendue — jamais
 * par un import casse, que verification/runner/red.mjs classe MODULE_NOT_FOUND
 * et refuse comme preuve.
 *
 * FORME D'UN EVENEMENT. Un evenement porte, en clair :
 *   • son IDENTITE D'OPERATION — `operation_key` (+ alias `idempotency_key`,
 *     `operation_id`, `event_id`, `id`), plus `operation_kind`,
 *     `operation_sequence` et `logical_attempt` (L78) ;
 *   • la TRANSITION demandee — la phase de E dans laquelle il fait entrer,
 *     sous `type` (+ alias `kind`, `name`, `phase`, `to`, `to_phase`,
 *     `target_phase`) ;
 *   • son CONTENU — `payload`, egalement etale a la racine pour tolerance.
 * L'EMPREINTE D'ENTREE de L68 est celle du contenu : deux evenements de meme
 * `operation_key` et de contenus differents sont en conflit, deux evenements
 * identiques octet pour octet ne le sont pas.
 *
 * FORME DE L'ETAT. L'etat initial est l'objet de contexte construit par la
 * suite — phase `PENDING`, identite complete, deploiement courant, exigences
 * actives, backlog, budget, horloge metier (L87). Si le paquet publie un
 * constructeur (`initialPeriodState` et alias), il est utilise ; sinon le
 * contexte fait office d'etat initial. Aucune arborescence n'est imposee : la
 * suite cherche les champs par leurs noms usuels, en profondeur bornee.
 *
 * ────────────────────────────────────────────────────────────────────── IV
 * LE DANGER PROPRE A T05 : LE REFUS UNIVERSEL ET L'ABSENCE GRATUITE.
 *
 * Quatre des six cas peuvent etre satisfaits par une implementation qui ne fait
 * RIEN. Une machine qui refuse tout satisfait A2 et A4 ; une machine qui
 * n'applique jamais rien satisfait A3 (« sans effet supplementaire ») ; une
 * machine qui ne deploie jamais rend A6 trivial. verification/cases.lock.json
 * le dit pour les deux cas `refusal` : « un stub qui leve rend ce cas VERT sans
 * rien prouver ».
 *
 * Chaque cas porte donc son TEMOIN, exige dans le meme test :
 *   A2 exige que le MEME evenement de deploiement, applique APRES validation,
 *      soit ACCEPTE et emette sa commande. Un refus universel tombe la.
 *   A3 exige que le meme evenement, sous une CLE D'OPERATION DIFFERENTE,
 *      reproduise son effet. Une machine inerte tombe la.
 *   A4 exige que le rejeu a contenu IDENTIQUE ne soit PAS un
 *      `IDEMPOTENCY_CONFLICT`, et qu'une cle neuve portant le contenu
 *      divergent soit acceptee. Un conflit universel tombe la.
 *   A5 exige que le MEME journal, budget suffisant, atteigne `COMPLETED` avec
 *      `attempt_outcome=SUCCESS`. Une machine qui echoue toujours tombe la.
 *   A6 exige que la MEME serie, une fois deployee et tous usages servis,
 *      produise ZERO demande non servie. Une machine qui declare tout non servi
 *      tombe la.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS. L201 exige une « table exhaustive des
 * transitions autorisees » : la suite en observe les consequences (A1 pour le
 * chemin nominal, A2 pour quatre interdictions), pas l'exhaustivite formelle
 * d'une table exportee — l'exiger imposerait une structure de donnee que le
 * cahier ne fixe pas. « Les effets reseau sont des commandes [...] pas des
 * appels caches dans le reducer » est en revanche observe pour de bon : A1
 * installe un mouchard sur `fetch` et sur `net.Socket.prototype.connect`
 * pendant tout le parcours nominal et exige ZERO appel sortant, en plus
 * d'exiger que des commandes soient EMISES et serialisables.
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
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

/**
 * Octets canoniques du cahier : « objets JSON tries recursivement par cle ;
 * ordre des tableaux conserve ». C'est la seule maniere de dire « le meme
 * etat » sans supposer l'ordre d'insertion des cles.
 */ // cahier:L82
function canonique(v: unknown): string {
  const trie = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(trie);
    if (x !== null && typeof x === 'object') {
      const o = x as Json;
      const out: Json = {};
      for (const k of Object.keys(o).sort()) out[k] = trie(o[k]);
      return out;
    }
    if (typeof x === 'bigint') return x.toString();
    if (typeof x === 'function') return '[function]';
    return x;
  };
  try {
    return JSON.stringify(trie(v)) ?? String(v);
  } catch {
    return String(v);
  }
}

/* ───────────────── vocabulaire de E, transcrit du cahier (L97) */

/** Les dix phases d'une periode, DANS L'ORDRE ou le cahier les enumere. */ // cahier:L97
const PHASES_E = [
  'PENDING',
  'RESTORING',
  'REVEALING',
  'DEVELOPING',
  'VALIDATING',
  'DEPLOYING',
  'EXERCISING',
  'AUDITING',
  'CHECKPOINTING',
  'COMPLETED',
] as const;

/** Les trois etats d'arret « qui n'effacent pas la periode de l'analyse ». */ // cahier:L97
const ARRETS = ['BUDGET_EXHAUSTED', 'RUNNER_BLOCKED', 'CANCELLED'] as const;

/** `attempt_outcome` vaut SUCCESS, FAILED ou CANCELLED. */ // cahier:L97
const OUTCOMES = ['SUCCESS', 'FAILED', 'CANCELLED'] as const;

/** `deployment_coverage` vaut NO_DEPLOYMENT, PARTIAL ou ACCEPTED. */ // cahier:L97
const COUVERTURES = ['NO_DEPLOYMENT', 'PARTIAL', 'ACCEPTED'] as const;

/** Le seul code d'erreur que le cahier NOMME pour T05. */ // cahier:L199
const CODE_IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';

/** Vocabulaire reserve : ces jetons majuscules ne sont pas des CODES d'erreur. */
const VOCABULAIRE = new Set<string>([...PHASES_E, ...ARRETS, ...OUTCOMES, ...COUVERTURES]);

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

const F_FAILURE = readReference('F-FAILURE');

/** F-FAILURE : K=4 periodes. */ // cahier:L121
const K_FAILURE = Number(refValue(F_FAILURE, 'valeurs.K.valeur'));
/** F-FAILURE : quatre lignes conservees. */ // cahier:L121
const LIGNES_FAILURE = Number(refValue(F_FAILURE, 'valeurs.lignes_conservees.valeur'));
/** F-FAILURE : Q=[0,0,0,0]. */ // cahier:L121
const Q_FAILURE = (refValue(F_FAILURE, 'valeurs.Q_par_periode.valeur') as unknown[]).map(Number);
/** F-FAILURE : R=[0,0,0,0]. */ // cahier:L121
const R_FAILURE = (refValue(F_FAILURE, 'valeurs.R_par_periode.valeur') as unknown[]).map(Number);
/** F-FAILURE : couts [100,50,0,0]. */ // cahier:L121
const COUTS_FAILURE = (refValue(F_FAILURE, 'valeurs.couts.valeur') as unknown[]).map(Number);
/** F-FAILURE : cout total 150. */ // cahier:L121
const COUT_TOTAL_FAILURE = Number(refValue(F_FAILURE, 'valeurs.cout_total.valeur'));
/** F-FAILURE : « aucune facture imaginaire n'y est ajoutee » -> 0. */ // cahier:L121
const FACTURES_AJOUTEES = Number(
  refValue(F_FAILURE, 'valeurs.arret_de_calcul_apres_P2.factures_ajoutees.valeur'),
);
/** F-FAILURE : les periodes conservees apres l'arret, ['P3','P4']. */ // cahier:L121
const PERIODES_CONSERVEES = (
  refValue(F_FAILURE, 'valeurs.arret_de_calcul_apres_P2.periodes_conservees.valeur') as unknown[]
).map(String);
/** F-FAILURE : le candidat mesure est « sans deploiement sur les quatre periodes ». */ // cahier:L121
const CANDIDAT_FAILURE = String(refValue(F_FAILURE, 'valeurs.candidat.valeur'));

/* ───────────────────────────── PARAMETRES LIBRES, declares et non deduits */

/**
 * F-FAILURE inscrit en `non_fixe_par_le_cahier` : « le nombre d'intentions
 * offertes par periode ». C'est donc une ENTREE choisie. Elle doit seulement
 * etre > 0 pour que les usages soient « presents » au sens de la ligne 121 —
 * sans quoi la convention de la ligne 111 donnerait R=null et non R=0.
 */
const INTENTIONS_PAR_PERIODE = 4;

/**
 * F-FAILURE inscrit aussi en `non_fixe_par_le_cahier` : « lequel des etats
 * d'arret porte l'arret apres P2 ». La suite n'en modelise donc AUCUN : les
 * deux seuls effets scelles de cet arret — P3 et P4 conservees, aucune facture
 * ajoutee — sont obtenus et verifies par des periodes a depense nulle.
 */
const ARRET_MODELISE = false;

/** Identifiants de trajectoire : aucune valeur attendue n'en depend (L78). */
const IDENTITE = {
  campaign_id: 'camp-T05',
  parent_project_id: 'proj-T05',
  scenario_id: 'scen-T05',
  configuration_id: 'conf-T05',
  repetition_id: 'rep-1',
  budget_id: 'budg-T05',
} as const;

/** Horloge metier : timestamp UTC ISO 8601 (L80). Aucune valeur attendue n'en depend. */
const HORLOGE = '2030-01-01T00:00:00Z';

/** Sentinelle du deploiement DEJA EN PLACE, herite d'une periode anterieure. */
const DEPLOIEMENT_EXISTANT = 'deployment-existant-P0-SENTINELLE';

/** Sentinelle du deploiement tente DANS la periode courante. */
const DEPLOIEMENT_COURANT = 'deployment-courant-P1-SENTINELLE';

/* ─────────────────────────────── construction des entrees */

interface ChargeEvenement {
  [k: string]: unknown;
}

interface OptionsEvenement {
  phase: string;
  sequence: number;
  key?: string;
  payload?: ChargeEvenement;
}

/**
 * Un evenement de periode. Entierement determine par (phase, sequence, cle,
 * contenu) : deux appels de memes arguments produisent deux objets EGAUX octet
 * pour octet, ce dont A3 a besoin, et un changement de `payload` a cle
 * constante produit exactement la situation de A4.
 */
function evenement(o: OptionsEvenement): Json {
  const cle = o.key ?? `op-${o.phase}-${String(o.sequence)}`;
  const charge: ChargeEvenement = o.payload ?? {};
  return {
    // identite d'operation — L68 (cle d'operation) et L78 (phase,
    // operation_kind, operation_sequence, logical_attempt)
    operation_key: cle,
    idempotency_key: cle,
    operation_id: cle,
    event_id: cle,
    id: cle,
    operation_kind: o.phase,
    operation_sequence: o.sequence,
    logical_attempt: 1,
    // la transition demandee : la phase de E dans laquelle l'evenement fait entrer
    type: o.phase,
    kind: o.phase,
    name: o.phase,
    phase: o.phase,
    to: o.phase,
    to_phase: o.phase,
    target_phase: o.phase,
    // contenu — c'est lui, et lui seul, que l'empreinte d'entree de L68 couvre
    payload: clone(charge),
    ...clone(charge),
  };
}

interface OptionsContexte {
  periodIndex?: number;
  deploiementExistant?: string | null;
  budgetDisponible?: number;
  exigences?: Json[];
}

/**
 * Le contexte de depart d'une periode : les champs minimaux que L87 exige de
 * `PeriodState` — phase, identite, snapshot courant, deploiement courant,
 * contrats actifs, backlog, budget, horloge metier.
 */
function contexte(o: OptionsContexte = {}): Json {
  const periodIndex = o.periodIndex ?? 1;
  const exigences =
    o.exigences ??
    ([
      {
        id: 'X',
        version: 1,
        capability_id: 'X',
        weight: 1,
        revealed_at_period: 1,
        due_at_period: 1,
        criticality: 'REQUIRED',
        source: 'T05',
        satisfied: false,
      },
    ] as Json[]);
  const deploiement =
    o.deploiementExistant === undefined
      ? null
      : o.deploiementExistant === null
        ? null
        : { id: o.deploiementExistant, deployment_id: o.deploiementExistant, version: 1 };
  const budget = {
    budget_id: IDENTITE.budget_id,
    total: 1000,
    spent: 0,
    reserved: 0,
    available: o.budgetDisponible ?? 1000,
  };
  return {
    // phase de depart : la premiere de E
    phase: PHASES_E[0], // cahier:L97
    current_phase: PHASES_E[0],
    // identite complete d'une trajectoire, plus `period_index` (L78)
    identity: { ...IDENTITE, period_index: periodIndex },
    identite: { ...IDENTITE, period_index: periodIndex },
    ...IDENTITE,
    period_index: periodIndex,
    // les autres champs minimaux de PeriodState (L87)
    snapshot: { id: `snap-P${String(periodIndex)}`, schema: 'bench.snapshot/1' },
    current_snapshot: { id: `snap-P${String(periodIndex)}`, schema: 'bench.snapshot/1' },
    deployment: deploiement,
    current_deployment: deploiement,
    requirements: clone(exigences),
    active_requirements: clone(exigences),
    contracts: clone(exigences),
    backlog: [],
    budget,
    clock: HORLOGE,
    business_clock: HORLOGE,
    // metadonnees de mode (L19) : aucun appel fournisseur dans les tests ordinaires
    execution_mode: 'recorded',
    cost_origin: 'recorded',
    corpus_provenance: 'synthetic',
    commands: [],
  };
}

/* ────────────────────────── chargement du paquet (jamais un dist/) */

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
  expect(LOADED.ok ? 'charge' : `PAQUETS-NON-CHARGEABLES ${LOADED.attempts.join(' | ')}`).toBe(
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
  applyPeriodEvent: [
    'applyPeriodEvent',
    'applyEvent',
    'applyPeriodTransition',
    'periodTransition',
    'transitionPeriod',
    'transition',
    'stepPeriod',
    'step',
    'reducePeriodEvent',
    'periodReducer',
    'reduceEvent',
    'nextPeriodState',
    'advancePeriod',
    'handlePeriodEvent',
    'apply',
    'appliquerEvenement',
    'transitionDePeriode',
  ],
  reducePeriodLog: [
    'reducePeriodLog',
    'replayPeriodLog',
    'reducePeriodEvents',
    'replayPeriodEvents',
    'applyPeriodEvents',
    'reduceEventLog',
    'reduceEvents',
    'foldPeriodEvents',
    'replayLog',
    'reduceLog',
    'replay',
    'reduceJournal',
    'rejouerJournal',
    'reduireJournal',
  ],
  closePeriod: [
    'closePeriod',
    'finalizePeriod',
    'completePeriod',
    'closePeriodState',
    'periodResult',
    'buildPeriodResult',
    'computePeriodResult',
    'toPeriodResult',
    'finalize',
    'close',
    'cloturerPeriode',
    'resultatDePeriode',
  ],
  initialPeriodState: [
    'initialPeriodState',
    'createPeriodState',
    'initPeriodState',
    'newPeriodState',
    'periodInitialState',
    'makePeriodState',
    'startPeriod',
    'beginPeriod',
    'etatInitialDePeriode',
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

/* ─────────────────────────────── lecture d'une sortie, refus compris */

const CLES_ETAT = [
  'state',
  'etat',
  'next',
  'next_state',
  'nextState',
  'period_state',
  'periodState',
  'newState',
  'value',
] as const;

const CLES_COMMANDES = [
  'commands',
  'commandes',
  'effects',
  'effets',
  'outbox',
  'to_execute',
  'a_executer',
  'pending_commands',
  'emitted',
  'actions',
] as const;

const CLES_ERREUR = ['error', 'erreur', 'failure', 'refus'] as const;
const CLES_LISTE_ERREURS = ['errors', 'erreurs', 'issues', 'problems', 'violations'] as const;
const DRAPEAUX_FAUX = ['ok', 'valid', 'valide', 'success', 'accepted', 'applied', 'appliquee'] as const;

function objet(v: unknown): Json | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}

/** Cherche un champ par ses noms usuels, en largeur et en profondeur bornee. */
function champ(racine: unknown, candidats: readonly string[], profondeur = 3): unknown {
  const bas = new Set(candidats.map((c) => c.toLowerCase()));
  let niveau: unknown[] = [racine];
  for (let d = 0; d <= profondeur; d += 1) {
    const suivant: unknown[] = [];
    for (const n of niveau) {
      const o = objet(n);
      if (o === null) continue;
      for (const [k, v] of Object.entries(o)) {
        if (bas.has(k.toLowerCase()) && v !== undefined) return v;
      }
      for (const v of Object.values(o)) if (objet(v) !== null) suivant.push(v);
    }
    niveau = suivant;
    if (niveau.length === 0) break;
  }
  return undefined;
}

/** Un tableau lu par ses noms usuels, ou [] si absent. */
function tableau(racine: unknown, candidats: readonly string[]): Json[] {
  const v = champ(racine, candidats, 2);
  if (!Array.isArray(v)) return [];
  return v as Json[];
}

/**
 * Les CODES portes par un rendu : jetons `MAJUSCULES_AVEC_UNDERSCORES` d'au
 * moins trois caracteres, prives du vocabulaire de phases et d'enums de E —
 * `DEPLOYING` nomme une phase, pas une erreur.
 */
function codesDe(texte: string): string[] {
  const out = new Set<string>();
  for (const m of texte.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[A-Z]{3,}\b/g)) {
    const jeton = m[0];
    if (VOCABULAIRE.has(jeton)) continue;
    out.add(jeton);
  }
  return [...out].sort();
}

interface Pas {
  refuse: boolean;
  via: string;
  texte: string;
  etat: unknown;
  commandes: Json[];
  codes: string[];
  brut: unknown;
}

/** Une transition, et ce qu'elle a rendu — refus LEVE ou refus RENDU, indistinctement. */
async function appliquer(etat: unknown, ev: Json): Promise<Pas> {
  const f = resolveOpt('applyPeriodEvent');
  if (f === null) {
    return {
      refuse: true,
      via: 'contrat',
      texte: 'ROLE-NON-RESOLU applyPeriodEvent',
      etat,
      commandes: [],
      codes: [],
      brut: undefined,
    };
  }
  let brut: unknown;
  try {
    brut = await Promise.resolve(f(clone(etat), clone(ev)));
  } catch (e) {
    const texte = `LEVE ${decrit(e)}`;
    return { refuse: true, via: 'exception', texte, etat, commandes: [], codes: codesDe(texte), brut: e };
  }
  return lirePas(etat, brut);
}

function lirePas(avant: unknown, brut: unknown): Pas {
  const texte = decrit(brut);
  const codes = codesDe(texte);
  const o = objet(brut);

  // L'etat EXPLICITEMENT publie par la sortie, s'il y en a un. Un refus qui
  // republierait un etat MODIFIE serait un refus a effet : la signature de A2
  // et de A4 doit pouvoir le voir, d'ou cette lecture avant tout verdict.
  let etatExplicite: unknown;
  if (o !== null) {
    for (const c of CLES_ETAT) {
      const v = o[c];
      if (objet(v) !== null) {
        etatExplicite = v;
        break;
      }
    }
  }
  const commandes = [...tableau(brut, CLES_COMMANDES)];
  const refus = (via: string, message?: string): Pas => ({
    refuse: true,
    via,
    texte: message ?? texte,
    etat: etatExplicite ?? avant,
    commandes,
    codes,
    brut,
  });

  if (brut === null || brut === undefined) {
    return {
      refuse: true,
      via: 'nullish',
      texte: `RENDU-VIDE ${texte}`,
      etat: avant,
      commandes: [],
      codes,
      brut,
    };
  }
  if (o !== null) {
    for (const d of DRAPEAUX_FAUX) {
      if (o[d] === false) return refus(`${d}=false`);
    }
    for (const c of CLES_ERREUR) {
      const v = o[c];
      if (v !== undefined && v !== null && v !== false) return refus(c);
    }
    for (const c of CLES_LISTE_ERREURS) {
      const v = o[c];
      if (Array.isArray(v) && v.length > 0) return refus(`${c}[${String(v.length)}]`);
    }
  }
  // Un code du cahier dans le rendu vaut refus, quel que soit le champ qui le
  // porte : `{code:'IDEMPOTENCY_CONFLICT'}` est un refus, pas une transition.
  if (texte.includes(CODE_IDEMPOTENCY_CONFLICT)) return refus(`code:${CODE_IDEMPOTENCY_CONFLICT}`);

  // Sortie acceptee : l'etat suivant, sous son enveloppe ou nu.
  const suivant: unknown = etatExplicite ?? (o !== null ? brut : avant);
  return { refuse: false, via: 'valeur', texte, etat: suivant, commandes, codes, brut };
}

/** La phase portee par un etat, telle quelle. */
const CLES_PHASE = ['phase', 'current_phase', 'currentPhase', 'phase_courante', 'period_phase', 'periodPhase'] as const;

function phaseDe(etat: unknown): string {
  const v = champ(etat, CLES_PHASE, 2);
  if (typeof v === 'string' && v.length > 0) return v;
  return `PHASE-ABSENTE(${decrit(etat).slice(0, 160)})`;
}

/** L'etat initial : le constructeur publie s'il existe, sinon le contexte lui-meme. */
async function etatInitial(ctx: Json): Promise<unknown> {
  const f = resolveOpt('initialPeriodState');
  if (f === null) return clone(ctx);
  try {
    const brut = await Promise.resolve(f(clone(ctx)));
    const o = objet(brut);
    if (o === null) return clone(ctx);
    for (const c of CLES_ETAT) {
      const v = o[c];
      if (objet(v) !== null) return v;
    }
    return brut;
  } catch {
    return clone(ctx);
  }
}

interface Parcours {
  etat: unknown;
  phases: string[];
  commandes: Json[];
  refus: string[];
}

/** Plie un journal PAS A PAS, en exigeant que chaque pas soit accepte. */
async function plier(depart: unknown, journal: Json[]): Promise<Parcours> {
  let etat = depart;
  const phases: string[] = [];
  const commandes: Json[] = [];
  const refus: string[] = [];
  for (const ev of journal) {
    const pas = await appliquer(etat, ev);
    if (pas.refuse) {
      refus.push(`${String(ev.type)}:${pas.via}:${pas.texte.slice(0, 200)}`);
      phases.push(`REFUSE(${String(ev.type)})`);
      continue;
    }
    etat = pas.etat;
    commandes.push(...pas.commandes);
    phases.push(phaseDe(etat));
  }
  return { etat, phases, commandes, refus };
}

/* ──────────────────────────── journaux */

/** Le journal NOMINAL : un evenement par phase de E, apres `PENDING`. */ // cahier:L97
function journalNominal(): Json[] {
  return PHASES_E.slice(1).map((phase, i) =>
    evenement({
      phase,
      sequence: i + 1,
      payload:
        phase === 'DEPLOYING'
          ? { deployment_id: DEPLOIEMENT_COURANT, deployment: { id: DEPLOIEMENT_COURANT, version: 1 } }
          : phase === 'EXERCISING'
            ? {
                intents_offered: INTENTIONS_PAR_PERIODE,
                intents_succeeded: INTENTIONS_PAR_PERIODE,
                spend: 0,
              }
            : {},
    }),
  );
}

/**
 * Le journal d'une periode SANS DEPLOIEMENT — celui du candidat de F-FAILURE,
 * « sans deploiement sur les quatre periodes ». `DEPLOYING` en est absent, et
 * A6 le verifie avant de mesurer quoi que ce soit.
 */ // cahier:L121
function journalSansDeploiement(depense: number): Json[] {
  const phases = PHASES_E.slice(1).filter((p) => p !== 'DEPLOYING');
  return phases.map((phase, i) =>
    evenement({
      phase,
      sequence: i + 1,
      payload:
        phase === 'EXERCISING'
          ? {
              intents_offered: INTENTIONS_PAR_PERIODE,
              intents_succeeded: 0,
              intents: Array.from({ length: INTENTIONS_PAR_PERIODE }, (_x, k) => ({
                id: `intent-${String(k + 1)}`,
                served: false,
              })),
              spend: depense,
              spend_micro_usd: String(depense),
              amount: String(depense),
            }
          : {},
    }),
  );
}

/** Le meme journal, mais DEPLOYE et tous usages servis — le temoin de A6. */
function journalDeploye(depense: number): Json[] {
  return PHASES_E.slice(1).map((phase, i) =>
    evenement({
      phase,
      sequence: i + 1,
      payload:
        phase === 'DEPLOYING'
          ? { deployment_id: DEPLOIEMENT_COURANT, deployment: { id: DEPLOIEMENT_COURANT, version: 1 } }
          : phase === 'EXERCISING'
            ? {
                intents_offered: INTENTIONS_PAR_PERIODE,
                intents_succeeded: INTENTIONS_PAR_PERIODE,
                intents: Array.from({ length: INTENTIONS_PAR_PERIODE }, (_x, k) => ({
                  id: `intent-${String(k + 1)}`,
                  served: true,
                })),
                spend: depense,
                spend_micro_usd: String(depense),
                amount: String(depense),
              }
            : {},
    }),
  );
}

/** Avance jusqu'a une phase de E incluse, sans jamais tolerer de refus. */
async function jusqua(phase: (typeof PHASES_E)[number], ctx?: Json): Promise<Parcours> {
  const cible = PHASES_E.indexOf(phase);
  const journal = journalNominal().slice(0, cible);
  const depart = await etatInitial(ctx ?? contexte());
  return plier(depart, journal);
}

/* ─────────────────────── lecture du resultat de cloture */

const CLES_NON_SERVIES = [
  'unserved_intents',
  'unservedIntents',
  'unserved',
  'unserved_requests',
  'unservedRequests',
  'intentions_non_servies',
  'demandes_non_servies',
  'intents_unserved',
  'failed_intents',
  'unmet_intents',
] as const;

const CLES_OFFERTES = ['intents_offered', 'intentsOffered', 'intentions_offertes', 'offered_intents', 'offered'] as const;
const CLES_Q = ['Q', 'q', 'quality', 'qualite'] as const;
const CLES_R = ['R', 'r', 'reliability', 'fiabilite'] as const;
const CLES_DEPENSE = ['spend', 'spent', 'depense', 'depenses', 'cost', 'costs', 'total_spend', 'amount'] as const;
const CLES_COUVERTURE = ['deployment_coverage', 'deploymentCoverage', 'couverture_deploiement', 'coverage'] as const;
const CLES_OUTCOME = ['attempt_outcome', 'attemptOutcome', 'outcome', 'resultat_tentative', 'statut_tentative'] as const;
const CLES_RESULTAT = ['period_result', 'periodResult', 'result', 'resultat', 'resultat_de_periode'] as const;

interface Cloture {
  via: string;
  porteurs: unknown[];
  texte: string;
}

/**
 * La cloture d'une periode. Le role `closePeriod` s'il est publie ; sinon les
 * memes champs sont cherches dans l'etat final et dans le resultat qu'il porte.
 * A6 juge le CONTENU du resultat, pas le nom de la fonction qui le rend.
 *
 * QUAND `closePeriod` REPOND, SON RESULTAT EST LE SEUL PORTEUR. Retomber sur
 * l'etat final serait une porte derobee : une cloture stubee, rendant un
 * resultat AMPUTE de ses demandes non servies, resterait verte parce que l'etat
 * les porte encore. Mesure faite sur oracle jetable — c'est exactement ce que
 * le mutant T05.M11 fait, et la retombee l'absorbait.
 */
async function cloturer(etat: unknown): Promise<Cloture> {
  const f = resolveOpt('closePeriod');
  if (f !== null) {
    let brut: unknown;
    let leve = '';
    try {
      brut = await Promise.resolve(f(clone(etat)));
    } catch (e) {
      leve = decrit(e);
    }
    if (leve !== '') {
      const porteur = { erreur_de_cloture: leve };
      return { via: 'closePeriod-LEVE', porteurs: [porteur], texte: decrit(porteur) };
    }
    if (brut !== null && brut !== undefined) {
      return { via: 'closePeriod', porteurs: [brut], texte: decrit(brut).slice(0, 1200) };
    }
    return { via: 'closePeriod-VIDE', porteurs: [{ resultat_de_cloture: null }], texte: 'RENDU-VIDE' };
  }
  const porteurs: unknown[] = [];
  const interne = champ(etat, CLES_RESULTAT, 2);
  if (interne !== undefined) porteurs.push(interne);
  porteurs.push(etat);
  return { via: 'etat-final', porteurs, texte: porteurs.map((p) => decrit(p)).join(' || ').slice(0, 1200) };
}

/** Lit un champ dans le premier porteur qui le publie. */
function lu(c: Cloture, candidats: readonly string[]): unknown {
  for (const p of c.porteurs) {
    const v = champ(p, candidats, 3);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Le CARDINAL d'un champ « demandes non servies » : une liste ou un compte. */
function cardinal(v: unknown): number | null {
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  const o = objet(v);
  if (o !== null) {
    for (const k of ['count', 'compte', 'length', 'total', 'n']) {
      const x = o[k];
      if (typeof x === 'number' && Number.isInteger(x)) return x;
    }
  }
  return null;
}

/**
 * Un montant, lu en ENTIER EXACT : nombre entier ou chaine d'entier. Jamais un
 * flottant — « les depenses utilisent des entiers exacts, jamais une addition
 * de flottants monetaires ».
 */ // cahier:L71
function entier(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  const o = objet(v);
  if (o !== null) {
    for (const k of ['value', 'valeur', 'amount', 'micro_usd', 'total']) {
      if (o[k] !== undefined) return entier(o[k]);
    }
  }
  return null;
}

/** Une valeur numerique quelconque (Q et R peuvent etre rationnels ou nuls). */
function nombre(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const f = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(v.trim());
    if (f !== null) return Number(f[2]) === 0 ? null : Number(f[1]) / Number(f[2]);
    return v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  }
  const o = objet(v);
  if (o !== null) {
    if (typeof o.num === 'number' && typeof o.den === 'number') {
      return o.den === 0 ? null : o.num / o.den;
    }
    for (const k of ['value', 'valeur', 'decimal', 'decimal_exact']) {
      if (o[k] !== undefined) return nombre(o[k]);
    }
  }
  return null;
}

/* ────────────────── mouchard reseau : L201, « pas d'appels caches » */

interface Mouchard<T> {
  valeur: T;
  appels: string[];
}

async function sansReseau<T>(f: () => Promise<T>): Promise<Mouchard<T>> {
  const appels: string[] = [];
  const global = globalThis as unknown as Json;
  const proto = net.Socket.prototype as unknown as Json;
  const vraiFetch = global.fetch;
  const vraiConnect = proto.connect;
  global.fetch = (...a: unknown[]): never => {
    appels.push(`fetch(${String(a[0])})`);
    throw new Error('APPEL-RESEAU-INTERDIT');
  };
  proto.connect = function connect(...a: unknown[]): never {
    appels.push(`socket.connect(${decrit(a[0]).slice(0, 120)})`);
    throw new Error('APPEL-RESEAU-INTERDIT');
  };
  try {
    const valeur = await f();
    return { valeur, appels };
  } finally {
    global.fetch = vraiFetch;
    proto.connect = vraiConnect;
  }
}

/* ─────────────────── signature d'effet : le coeur de A3 */

/**
 * Ce qu'un pas a REELLEMENT fait : l'etat a-t-il change, combien de commandes
 * ont ete emises. Deux signatures comparees donnent un diff Jest qui nomme
 * l'effet, et non une difference de structure.
 */
function signature(avant: unknown, pas: Pas): string {
  const change = canonique(avant) !== canonique(pas.etat);
  return `etat=${change ? 'MODIFIE' : 'INCHANGE'} commandes=${String(pas.commandes.length)}`;
}

const SANS_EFFET = 'etat=INCHANGE commandes=0';

/* ══════════════════════════════════════════════════════════════════════ */

describe('T05 — transitions d une periode sans infrastructure', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T05.A1 parcours nominal respecte les phases de E',
    async () => {
      assertLoaded();
      assertContrat('applyPeriodEvent', 'reducePeriodLog');

      const ctx = contexte();
      const depart = await etatInitial(ctx);
      const journal = journalNominal();

      // (0) L'ENTREE EST CELLE QU'ON CROIT. Sans cette assertion, « respecte les
      //     phases de E » ne serait rattache a rien d'observable.
      expect(phaseDe(depart)).toBe(PHASES_E[0]); // cahier:L97
      expect(journal.map((e) => String(e.type))).toEqual(
        PHASES_E.slice(1).map((p) => String(p)),
      ); // cahier:L97
      expect(new Set(journal.map((e) => String(e.operation_key))).size).toBe(journal.length); // cahier:L78

      // (1) LE PARCOURS NOMINAL, PAS A PAS, SOUS MOUCHARD RESEAU. « Les effets
      //     reseau sont des commandes a executer par adaptateurs, pas des
      //     appels caches dans le reducer » (L201).
      const observe = await sansReseau(async () => plier(depart, journal));
      const parcours = observe.valeur;
      expect(
        parcours.refus.length === 0 ? 'aucun-refus' : `REFUS-DANS-LE-PARCOURS-NOMINAL ${parcours.refus.join(' | ')}`,
      ).toBe('aucun-refus');

      // (2) LA SUITE DE PHASES OBSERVEE EST EXACTEMENT CELLE DE E.
      expect([phaseDe(depart), ...parcours.phases]).toEqual(PHASES_E.map((p) => String(p))); // cahier:L97

      // (3) ZERO APPEL SORTANT PENDANT TOUT LE PARCOURS (L201).
      expect(observe.appels).toEqual([]); // cahier:L201

      // (4) DES COMMANDES ONT ETE EMISES, ET CE SONT DES DONNEES. Un reducer
      //     qui n'emet rien n'a pas d'« effets a executer par adaptateurs » :
      //     il les a caches, ou il ne fait rien.
      expect(
        parcours.commandes.length > 0
          ? 'commandes-emises'
          : `AUCUNE-COMMANDE-EMISE sur ${String(journal.length)} transitions`,
      ).toBe('commandes-emises'); // cahier:L201
      expect(
        parcours.commandes.map((c) => canonique(c) === canonique(clone(c))).every(Boolean)
          ? 'commandes-serialisables'
          : `COMMANDE-NON-SERIALISABLE ${decrit(parcours.commandes).slice(0, 300)}`,
      ).toBe('commandes-serialisables');
      expect(
        parcours.commandes.every((c) => {
          const t = champ(c, ['type', 'kind', 'command', 'commande', 'name'], 1);
          return typeof t === 'string' && t.length > 0;
        })
          ? 'commandes-typees'
          : `COMMANDE-NON-TYPEE ${decrit(parcours.commandes).slice(0, 300)}`,
      ).toBe('commandes-typees'); // cahier:L197

      // (5) REDUCTION D'UN JOURNAL EN ETAT FINAL (L201) : le pliage d'un coup
      //     doit coincider EXACTEMENT avec le pliage pas a pas.
      const reduce = resolveOpt('reducePeriodLog');
      let finalReduit: unknown;
      let erreurReduction = '';
      try {
        const brut = await Promise.resolve((reduce as Fonction)(clone(depart), clone(journal)));
        finalReduit = lirePas(depart, brut).etat;
      } catch (e) {
        erreurReduction = `REDUCTION-LEVE ${decrit(e)}`;
      }
      expect(erreurReduction === '' ? 'reduction-executee' : erreurReduction).toBe('reduction-executee');
      expect(phaseDe(finalReduit)).toBe(PHASES_E[PHASES_E.length - 1]); // cahier:L201
      expect(canonique(finalReduit)).toBe(canonique(parcours.etat)); // cahier:L201

      // (6) PURETE (L197) : la meme transition, appliquee deux fois au meme
      //     etat, rend exactement la meme chose. Une machine impure ne survit
      //     pas a cette egalite.
      const avant = await etatInitial(ctx);
      const un = await appliquer(avant, journal[0]);
      const deux = await appliquer(avant, journal[0]);
      expect(canonique(un.etat)).toBe(canonique(deux.etat)); // cahier:L197
      expect(canonique(un.commandes)).toBe(canonique(deux.commandes)); // cahier:L197

      // (7) PURETE, SECOND VOLET : l'etat d'ENTREE n'est pas mute. L'appel se
      //     fait ici SANS copie defensive — sans quoi l'assertion serait vraie
      //     par construction, c'est-a-dire vide.
      const cible = await etatInitial(ctx);
      const empreinteAvant = canonique(cible);
      let erreurMutation = '';
      try {
        await Promise.resolve((resolveOpt('applyPeriodEvent') as Fonction)(cible, clone(journal[0])));
      } catch (e) {
        erreurMutation = `TRANSITION-LEVE-SUR-ETAT-NON-COPIE ${decrit(e)}`;
      }
      expect(erreurMutation === '' ? 'transition-executee' : erreurMutation).toBe('transition-executee');
      expect(canonique(cible)).toBe(empreinteAvant); // cahier:L197

      console.log(
        `[T05.A1] via=${LOADED.via.join(',')} phases=${[phaseDe(depart), ...parcours.phases].join('>')} ` +
          `commandes=${String(parcours.commandes.length)} appels_reseau=${String(observe.appels.length)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T05.A2 deployer avant validation est refuse',
    async () => {
      assertLoaded();
      assertContrat('applyPeriodEvent');

      // L'evenement de deploiement est le MEME dans les cinq essais : seule la
      // phase de depart change. C'est ce qui fait porter le refus sur la
      // TRANSITION, et non sur le contenu de l'evenement.
      const evDeploiement = (): Json =>
        evenement({
          phase: 'DEPLOYING',
          sequence: PHASES_E.indexOf('DEPLOYING'),
          payload: {
            deployment_id: DEPLOIEMENT_COURANT,
            deployment: { id: DEPLOIEMENT_COURANT, version: 1 },
          },
        });

      // (0) TEMOIN D'ABORD — APRES VALIDATION, LE MEME EVENEMENT PASSE.
      //     Sans lui, une machine qui refuse tout satisferait ce cas sans rien
      //     prouver (verification/cases.lock.json, mode `refusal`).
      const apresValidation = await jusqua('VALIDATING');
      expect(
        apresValidation.refus.length === 0
          ? 'chemin-jusqu-a-VALIDATING'
          : `CHEMIN-IMPOSSIBLE ${apresValidation.refus.join(' | ')}`,
      ).toBe('chemin-jusqu-a-VALIDATING');
      expect(phaseDe(apresValidation.etat)).toBe('VALIDATING'); // cahier:L97

      const pasAutorise = await appliquer(apresValidation.etat, evDeploiement());
      expect(
        pasAutorise.refuse ? `DEPLOIEMENT-REFUSE-APRES-VALIDATION ${pasAutorise.texte.slice(0, 400)}` : 'accepte',
      ).toBe('accepte');
      expect(phaseDe(pasAutorise.etat)).toBe('DEPLOYING'); // cahier:L97
      expect(
        pasAutorise.commandes.length > 0
          ? 'commande-de-deploiement-emise'
          : `AUCUNE-COMMANDE ${pasAutorise.texte.slice(0, 300)}`,
      ).toBe('commande-de-deploiement-emise'); // cahier:L201

      // (1) LES QUATRE PHASES QUI PRECEDENT `VALIDATING` REFUSENT LE MEME
      //     EVENEMENT. La liste comparee nomme la phase fautive.
      const avantValidation = PHASES_E.slice(0, PHASES_E.indexOf('VALIDATING')); // PENDING..DEVELOPING
      const verdicts: string[] = [];
      const codesObserves: string[][] = [];
      const effets: string[] = [];
      for (const phase of avantValidation) {
        const amont = await jusqua(phase);
        expect(
          amont.refus.length === 0 ? `chemin-jusqu-a-${phase}` : `CHEMIN-IMPOSSIBLE ${amont.refus.join(' | ')}`,
        ).toBe(`chemin-jusqu-a-${phase}`);
        expect(phaseDe(amont.etat)).toBe(String(phase));
        const pas = await appliquer(amont.etat, evDeploiement());
        verdicts.push(`${phase}:${pas.refuse ? 'REFUSE' : `ACCEPTE(${phaseDe(pas.etat)})`}`);
        codesObserves.push(pas.codes);
        effets.push(`${phase}:${signature(amont.etat, pas)}`);
      }
      expect(verdicts).toEqual(avantValidation.map((p) => `${p}:REFUSE`)); // cahier:L199

      // (2) LE REFUS EST TYPE (L197 « erreurs de transition », L201 « erreurs
      //     typees ») : un code stable, le MEME pour les quatre phases, et qui
      //     n'est PAS celui de l'idempotence — L199 distingue les deux cas.
      const codes = codesObserves.map((c) => (c.length > 0 ? c.join('+') : 'CODE-ABSENT'));
      expect(codes).toEqual(avantValidation.map(() => codes[0]));
      expect(codes[0]).not.toBe('CODE-ABSENT'); // cahier:L201
      expect(codes[0].includes(CODE_IDEMPOTENCY_CONFLICT)).toBe(false); // cahier:L199

      // (3) UN REFUS N'A PAS D'EFFET : ni transition partielle, ni commande.
      expect(effets).toEqual(avantValidation.map((p) => `${p}:${SANS_EFFET}`)); // cahier:L197

      console.log(
        `[T05.A2] refus=${verdicts.join(' ')} code=${codes[0]} ` +
          `temoin=${phaseDe(pasAutorise.etat)} commandes_temoin=${String(pasAutorise.commandes.length)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T05.A3 rejouer un evenement identique est sans effet supplementaire',
    async () => {
      assertLoaded();
      assertContrat('applyPeriodEvent');

      // L'evenement choisi est une OPERATION d'exercice : L78 pose que « les
      // appels 1 et 2 d'une meme periode sont distincts » — la transition
      // `EXERCISING -> EXERCISING` est donc permise, et c'est la seule forme
      // d'evenement ou un rejeu non deduplique appliquerait REELLEMENT son
      // effet une seconde fois. Un evenement de phase serait refuse par la
      // table des transitions, ce qui masquerait l'absence de deduplication.
      const base = await jusqua('EXERCISING');
      expect(
        base.refus.length === 0 ? 'chemin-jusqu-a-EXERCISING' : `CHEMIN-IMPOSSIBLE ${base.refus.join(' | ')}`,
      ).toBe('chemin-jusqu-a-EXERCISING');

      const charge = {
        intents_offered: 2,
        intents_succeeded: 1,
        spend: 100,
        spend_micro_usd: '100',
        amount: '100',
      };
      const CLE = 'op-exercise-A3';
      const premier = evenement({ phase: 'EXERCISING', sequence: 99, key: CLE, payload: charge });
      const rejeu = evenement({ phase: 'EXERCISING', sequence: 99, key: CLE, payload: charge });
      const autreCle = evenement({
        phase: 'EXERCISING',
        sequence: 99,
        key: 'op-exercise-A3-BIS',
        payload: charge,
      });

      // (0) LE REJEU EST BIEN IDENTIQUE, ET LE TEMOIN BIEN DIFFERENT PAR LA
      //     SEULE CLE. Sans ces deux controles, « identite et contenu
      //     identiques » serait affirme sans etre observe.
      expect(canonique(rejeu)).toBe(canonique(premier)); // cahier:L199
      expect(canonique(autreCle)).not.toBe(canonique(premier));
      expect(canonique({ ...autreCle, operation_key: CLE, idempotency_key: CLE, operation_id: CLE, event_id: CLE, id: CLE })).toBe(
        canonique(premier),
      ); // cahier:L68

      // (1) LA PREMIERE APPLICATION A UN EFFET. C'est le TEMOIN qui interdit de
      //     verdir ce cas avec une machine inerte.
      const pas1 = await appliquer(base.etat, premier);
      expect(pas1.refuse ? `PREMIERE-APPLICATION-REFUSEE ${pas1.texte.slice(0, 400)}` : 'accepte').toBe('accepte');
      const effet1 = signature(base.etat, pas1);
      expect(effet1).not.toBe(SANS_EFFET); // cahier:L68

      // (2) LE REJEU, OCTET POUR OCTET, N'A AUCUN EFFET SUPPLEMENTAIRE.
      const pas2 = await appliquer(pas1.etat, rejeu);
      expect(signature(pas1.etat, pas2)).toBe(SANS_EFFET); // cahier:L68
      expect(pas2.codes.includes(CODE_IDEMPOTENCY_CONFLICT)).toBe(false); // cahier:L199

      // (3) NI LE TROISIEME REJEU. La deduplication est un etat, pas un hasard.
      const pas3 = await appliquer(pas2.etat, clone(rejeu));
      expect(signature(pas2.etat, pas3)).toBe(SANS_EFFET); // cahier:L68
      expect(canonique(pas3.etat)).toBe(canonique(pas1.etat)); // cahier:L68

      // (4) TEMOIN : LA MEME CHARGE SOUS UNE CLE NEUVE REPRODUIT L'EFFET.
      //     « Les appels 1 et 2 d'une meme periode sont distincts » (L78) : la
      //     deduplication porte sur la CLE, pas sur le contenu.
      const pas4 = await appliquer(pas3.etat, autreCle);
      expect(pas4.refuse ? `CLE-NEUVE-REFUSEE ${pas4.texte.slice(0, 400)}` : 'accepte').toBe('accepte');
      expect(signature(pas3.etat, pas4)).toBe(effet1); // cahier:L78

      console.log(
        `[T05.A3] premier=${effet1} rejeu=${signature(pas1.etat, pas2)} ` +
          `troisieme=${signature(pas2.etat, pas3)} cle_neuve=${signature(pas3.etat, pas4)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T05.A4 meme identite et contenu different donne IDEMPOTENCY_CONFLICT',
    async () => {
      assertLoaded();
      assertContrat('applyPeriodEvent');

      const base = await jusqua('EXERCISING');
      expect(
        base.refus.length === 0 ? 'chemin-jusqu-a-EXERCISING' : `CHEMIN-IMPOSSIBLE ${base.refus.join(' | ')}`,
      ).toBe('chemin-jusqu-a-EXERCISING');

      const CLE = 'op-exercise-A4';
      const contenu1 = { intents_offered: 2, intents_succeeded: 1, spend: 100, spend_micro_usd: '100' };
      // Deux divergences de nature differente : une VALEUR changee, et un CHAMP
      // ajoute. Une implementation qui ne comparerait que les cles, ou que les
      // valeurs des cles communes, laisserait passer l'une des deux.
      const contenu2 = { intents_offered: 2, intents_succeeded: 2, spend: 100, spend_micro_usd: '100' };
      const contenu3 = { intents_offered: 2, intents_succeeded: 1, spend: 100, spend_micro_usd: '100', note: 'x' };

      const e1 = evenement({ phase: 'EXERCISING', sequence: 99, key: CLE, payload: contenu1 });
      const e2 = evenement({ phase: 'EXERCISING', sequence: 99, key: CLE, payload: contenu2 });
      const e3 = evenement({ phase: 'EXERCISING', sequence: 99, key: CLE, payload: contenu3 });
      const eIdentique = evenement({ phase: 'EXERCISING', sequence: 99, key: CLE, payload: contenu1 });
      const eCleNeuve = evenement({ phase: 'EXERCISING', sequence: 99, key: `${CLE}-BIS`, payload: contenu2 });

      // (0) LES ENTREES SONT BIEN CELLES DE L'ENONCE : meme identite, contenus
      //     differents. Sans ce controle, le conflit attendu ne serait rattache
      //     a rien d'observable.
      expect([String(e2.operation_key), String(e3.operation_key)]).toEqual([CLE, CLE]); // cahier:L68
      expect(canonique(e2)).not.toBe(canonique(e1));
      expect(canonique(e3)).not.toBe(canonique(e1));
      expect(canonique(eIdentique)).toBe(canonique(e1));

      const pas1 = await appliquer(base.etat, e1);
      expect(pas1.refuse ? `PREMIERE-APPLICATION-REFUSEE ${pas1.texte.slice(0, 400)}` : 'accepte').toBe('accepte');
      expect(signature(base.etat, pas1)).not.toBe(SANS_EFFET);

      // (1) LE CONFLIT, POUR LES DEUX FORMES DE DIVERGENCE, SOUS SON CODE EXACT.
      for (const [nom, ev] of [
        ['valeur-changee', e2],
        ['champ-ajoute', e3],
      ] as const) {
        const pas = await appliquer(pas1.etat, ev);
        expect(pas.refuse ? `${nom}:refuse` : `${nom}:ACCEPTE-A-TORT ${pas.texte.slice(0, 400)}`).toBe(
          `${nom}:refuse`,
        );
        expect(
          pas.codes.includes(CODE_IDEMPOTENCY_CONFLICT)
            ? `${nom}:${CODE_IDEMPOTENCY_CONFLICT}`
            : `${nom}:CODE-ATTENDU-ABSENT codes=[${pas.codes.join(',')}] ${pas.texte.slice(0, 300)}`,
        ).toBe(`${nom}:${CODE_IDEMPOTENCY_CONFLICT}`); // cahier:L199
        // (2) LE CONFLIT N'ECRASE RIEN : ni etat, ni commande.
        expect(`${nom}:${signature(pas1.etat, pas)}`).toBe(`${nom}:${SANS_EFFET}`); // cahier:L68
      }

      // (3) TEMOIN A — LE REJEU IDENTIQUE N'EST PAS UN CONFLIT. Une machine qui
      //     repond `IDEMPOTENCY_CONFLICT` a tout rejeu confondrait A3 et A4.
      const pasIdentique = await appliquer(pas1.etat, eIdentique);
      expect(pasIdentique.codes.includes(CODE_IDEMPOTENCY_CONFLICT)).toBe(false); // cahier:L199
      expect(signature(pas1.etat, pasIdentique)).toBe(SANS_EFFET); // cahier:L68

      // (4) TEMOIN B — LE CONTENU DIVERGENT SOUS UNE CLE NEUVE EST ACCEPTE.
      //     C'est bien la COLLISION D'IDENTITE qui est refusee, pas le contenu.
      const pasCleNeuve = await appliquer(pas1.etat, eCleNeuve);
      expect(
        pasCleNeuve.refuse ? `CLE-NEUVE-REFUSEE ${pasCleNeuve.texte.slice(0, 400)}` : 'accepte',
      ).toBe('accepte'); // cahier:L78
      expect(signature(pas1.etat, pasCleNeuve)).not.toBe(SANS_EFFET);

      console.log(
        `[T05.A4] conflit=${CODE_IDEMPOTENCY_CONFLICT} rejeu_identique=${signature(pas1.etat, pasIdentique)} ` +
          `cle_neuve=${signature(pas1.etat, pasCleNeuve)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T05.A5 budget epuise declenche la mesure de la version existante',
    async () => {
      assertLoaded();
      assertContrat('applyPeriodEvent');

      // Une periode qui HERITE d'un deploiement anterieur : c'est « la version
      // existante » dont A5 exige la mesure. Sa sentinelle est distincte de
      // celle du deploiement que la periode aurait tente.
      const ctx = contexte({ deploiementExistant: DEPLOIEMENT_EXISTANT, budgetDisponible: 0 });
      const depart = await etatInitial(ctx);

      // (0) L'ENTREE PORTE BIEN LA VERSION EXISTANTE, ET ELLE SEULE.
      expect(canonique(depart).includes(DEPLOIEMENT_EXISTANT)).toBe(true);
      expect(canonique(depart).includes(DEPLOIEMENT_COURANT)).toBe(false);

      const amont = journalNominal().slice(0, PHASES_E.indexOf('DEVELOPING'));
      const parcours = await plier(depart, amont);
      expect(
        parcours.refus.length === 0 ? 'chemin-jusqu-a-DEVELOPING' : `CHEMIN-IMPOSSIBLE ${parcours.refus.join(' | ')}`,
      ).toBe('chemin-jusqu-a-DEVELOPING');

      // L'evenement d'epuisement nomme l'etat d'arret de E.
      const epuisement = evenement({
        phase: 'BUDGET_EXHAUSTED', // cahier:L97
        sequence: 50,
        payload: { budget: { total: 1000, spent: 1000, reserved: 0, available: 0 }, available: 0 },
      });

      const pas = await appliquer(parcours.etat, epuisement);
      expect(pas.refuse ? `EPUISEMENT-REFUSE ${pas.texte.slice(0, 400)}` : 'accepte').toBe('accepte');

      // (1) L'ETAT D'ARRET EST ENREGISTRE. « Les etats d'arret de calcul
      //     BUDGET_EXHAUSTED, RUNNER_BLOCKED et CANCELLED n'effacent pas la
      //     periode de l'analyse » (L97) : il est donc PORTE, pas efface.
      expect(canonique(pas.etat).includes(ARRETS[0]) ? ARRETS[0] : `ARRET-NON-ENREGISTRE ${pas.texte.slice(0, 300)}`).toBe(
        ARRETS[0],
      ); // cahier:L97

      // (2) LA MESURE DE LA VERSION EXISTANTE EST COMMANDEE. C'est l'assertion
      //     decisive du cas : des commandes sont emises, et au moins une NOMME
      //     le deploiement deja en place. Un reducer qui se contenterait de
      //     changer de phase n'a rien fait mesurer.
      expect(
        pas.commandes.length > 0 ? 'commandes-emises' : `AUCUNE-COMMANDE ${pas.texte.slice(0, 400)}`,
      ).toBe('commandes-emises'); // cahier:L199
      const nommantLExistant = pas.commandes.filter((c) => canonique(c).includes(DEPLOIEMENT_EXISTANT));
      expect(
        nommantLExistant.length > 0
          ? 'mesure-de-la-version-existante'
          : `COMMANDES-SANS-VERSION-EXISTANTE ${decrit(pas.commandes).slice(0, 400)}`,
      ).toBe('mesure-de-la-version-existante'); // cahier:L199

      // (3) PAS DE SUCCES FICTIF. `attempt_outcome` vaut SUCCESS, FAILED ou
      //     CANCELLED (L97) ; ici il est renseigne et n'est pas SUCCESS.
      const cloture = await cloturer(pas.etat);
      const outcome = lu(cloture, CLES_OUTCOME);
      expect(
        typeof outcome === 'string' && (OUTCOMES as readonly string[]).includes(outcome)
          ? outcome
          : `ATTEMPT-OUTCOME-ILLISIBLE ${decrit(outcome)} dans ${cloture.texte.slice(0, 400)}`,
      ).not.toBe(OUTCOMES[0]); // cahier:L97
      expect(
        typeof outcome === 'string' && (OUTCOMES as readonly string[]).includes(outcome)
          ? 'outcome-de-E'
          : `ATTEMPT-OUTCOME-HORS-ENUM ${decrit(outcome)} attendu parmi [${OUTCOMES.join('|')}]`,
      ).toBe('outcome-de-E'); // cahier:L97

      // (4) LA PERIODE N'EST PAS EFFACEE DE L'ANALYSE (L97) : sa cloture rend
      //     toujours une ligne, avec ses intentions offertes.
      const offertes = cardinal(lu(cloture, CLES_OFFERTES));
      expect(
        offertes !== null ? 'periode-conservee' : `PERIODE-SANS-LIGNE ${cloture.texte.slice(0, 400)}`,
      ).toBe('periode-conservee'); // cahier:L97

      // (5) TEMOIN — LE MEME JOURNAL, BUDGET SUFFISANT, REUSSIT. Sans lui, une
      //     machine qui echoue toujours satisferait le cas.
      const ctxSain = contexte({ deploiementExistant: DEPLOIEMENT_EXISTANT, budgetDisponible: 1000 });
      const sain = await plier(await etatInitial(ctxSain), journalNominal());
      expect(
        sain.refus.length === 0 ? 'parcours-sain' : `PARCOURS-SAIN-REFUSE ${sain.refus.join(' | ')}`,
      ).toBe('parcours-sain');
      expect(phaseDe(sain.etat)).toBe(PHASES_E[PHASES_E.length - 1]); // cahier:L97
      const clotureSaine = await cloturer(sain.etat);
      expect(lu(clotureSaine, CLES_OUTCOME)).toBe(OUTCOMES[0]); // cahier:L97

      console.log(
        `[T05.A5] arret=${ARRETS[0]} commandes=${String(pas.commandes.length)} ` +
          `nommant_existant=${String(nommantLExistant.length)} outcome=${decrit(outcome)} ` +
          `temoin_outcome=${decrit(lu(clotureSaine, CLES_OUTCOME))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T05.A6 sans deploiement la cloture produit les demandes non servies de F-FAILURE',
    async () => {
      assertLoaded();
      assertContrat('applyPeriodEvent');

      // (0) LA SERIE CONSTRUITE EST BIEN CELLE DE F-FAILURE : K periodes, les
      //     couts de la racine gelee, et AUCUN deploiement nulle part.
      expect(K_FAILURE).toBe(COUTS_FAILURE.length);
      expect(LIGNES_FAILURE).toBe(K_FAILURE); // cahier:L121
      expect(PERIODES_CONSERVEES).toEqual(['P3', 'P4']); // cahier:L121
      expect(CANDIDAT_FAILURE.includes('sans deploiement')).toBe(true); // cahier:L121
      expect(COUTS_FAILURE.reduce((a, b) => a + b, 0)).toBe(COUT_TOTAL_FAILURE); // cahier:L121
      expect(ARRET_MODELISE).toBe(false);

      const journaux = COUTS_FAILURE.map((cout) => journalSansDeploiement(cout));
      expect(
        journaux.flatMap((j) => j.map((e) => String(e.type))).filter((t) => t === 'DEPLOYING'),
      ).toEqual([]); // cahier:L121
      expect(journaux.map((j) => j.length)).toEqual(journaux.map(() => PHASES_E.length - 2));

      // Les quatre periodes, closes l'une apres l'autre.
      const clotures: Cloture[] = [];
      const phasesFinales: string[] = [];
      for (let k = 0; k < K_FAILURE; k += 1) {
        const ctx = contexte({ periodIndex: k + 1, deploiementExistant: null });
        const parcours = await plier(await etatInitial(ctx), journaux[k]);
        expect(
          parcours.refus.length === 0
            ? `P${String(k + 1)}:parcours-sans-deploiement`
            : `P${String(k + 1)}:CHEMIN-IMPOSSIBLE ${parcours.refus.join(' | ')}`,
        ).toBe(`P${String(k + 1)}:parcours-sans-deploiement`); // cahier:L121
        phasesFinales.push(phaseDe(parcours.etat));
        clotures.push(await cloturer(parcours.etat));
      }

      // (1) QUATRE LIGNES CONSERVEES (L121) : P3 et P4 comprises, meme a
      //     depense nulle.
      expect(clotures.length).toBe(LIGNES_FAILURE); // cahier:L121
      expect(phasesFinales).toEqual(Array.from({ length: K_FAILURE }, () => PHASES_E[PHASES_E.length - 1]));

      // (2) LES DEMANDES NON SERVIES — L'ASSERTION DECISIVE DU CAS. Sans
      //     deploiement, aucune intention offerte n'est servie : le resultat de
      //     cloture doit les PORTER, une par une.
      const nonServies = clotures.map((c, k) => {
        const n = cardinal(lu(c, CLES_NON_SERVIES));
        return n === null
          ? `P${String(k + 1)}:CHAMP-ABSENT parmi [${CLES_NON_SERVIES.join('|')}] dans ${c.texte.slice(0, 300)}`
          : `P${String(k + 1)}:${String(n)}`;
      });
      expect(nonServies).toEqual(
        Array.from({ length: K_FAILURE }, (_x, k) => `P${String(k + 1)}:${String(INTENTIONS_PAR_PERIODE)}`),
      ); // cahier:L67
      const offertes = clotures.map((c, k) => `P${String(k + 1)}:${String(cardinal(lu(c, CLES_OFFERTES)))}`);
      expect(offertes).toEqual(
        Array.from({ length: K_FAILURE }, (_x, k) => `P${String(k + 1)}:${String(INTENTIONS_PAR_PERIODE)}`),
      );

      // (3) Q ET R VALENT ZERO AUX QUATRE PERIODES (F-FAILURE, racine gelee) —
      //     « si les exigences et usages y sont presents », ce que la serie
      //     construite garantit : une exigence active due violee, quatre usages.
      expect(clotures.map((c, k) => `Q[P${String(k + 1)}]=${String(nombre(lu(c, CLES_Q)))}`)).toEqual(
        Q_FAILURE.map((q, k) => `Q[P${String(k + 1)}]=${String(q)}`),
      ); // cahier:L121
      expect(clotures.map((c, k) => `R[P${String(k + 1)}]=${String(nombre(lu(c, CLES_R)))}`)).toEqual(
        R_FAILURE.map((r, k) => `R[P${String(k + 1)}]=${String(r)}`),
      ); // cahier:L121

      // (4) LES DEPENSES SONT CONSERVEES, EN ENTIERS EXACTS, ET AUCUNE FACTURE
      //     IMAGINAIRE N'EST AJOUTEE A P3 NI P4 (L121, invariants D.5 et D.9).
      const depenses = clotures.map((c, k) => `P${String(k + 1)}=${String(entier(lu(c, CLES_DEPENSE)))}`);
      expect(depenses).toEqual(COUTS_FAILURE.map((v, k) => `P${String(k + 1)}=${String(v)}`)); // cahier:L121
      const total = clotures.reduce((a, c) => a + (entier(lu(c, CLES_DEPENSE)) ?? Number.NaN), 0);
      expect(total).toBe(COUT_TOTAL_FAILURE); // cahier:L121
      expect(
        PERIODES_CONSERVEES.map((nom) => {
          const k = Number(nom.slice(1)) - 1;
          return `${nom}=${String(entier(lu(clotures[k], CLES_DEPENSE)))}`;
        }),
      ).toEqual(PERIODES_CONSERVEES.map((nom) => `${nom}=${String(FACTURES_AJOUTEES)}`)); // cahier:L121

      // (5) LA COUVERTURE DE DEPLOIEMENT EST `NO_DEPLOYMENT` (L97).
      expect(clotures.map((c, k) => `P${String(k + 1)}:${String(lu(c, CLES_COUVERTURE))}`)).toEqual(
        Array.from({ length: K_FAILURE }, (_x, k) => `P${String(k + 1)}:${COUVERTURES[0]}`),
      ); // cahier:L97

      // (6) TEMOIN — LA MEME PERIODE, DEPLOYEE ET TOUS USAGES SERVIS, NE PRODUIT
      //     AUCUNE DEMANDE NON SERVIE. Sans lui, une machine qui declare tout
      //     non servi satisferait le cas sans rien mesurer.
      const ctxTemoin = contexte({ periodIndex: 1, deploiementExistant: null });
      const temoin = await plier(await etatInitial(ctxTemoin), journalDeploye(COUTS_FAILURE[0]));
      expect(
        temoin.refus.length === 0 ? 'temoin-deploye' : `TEMOIN-REFUSE ${temoin.refus.join(' | ')}`,
      ).toBe('temoin-deploye');
      const clotureTemoin = await cloturer(temoin.etat);
      expect(cardinal(lu(clotureTemoin, CLES_NON_SERVIES))).toBe(0); // cahier:L67
      expect(String(lu(clotureTemoin, CLES_COUVERTURE))).not.toBe(COUVERTURES[0]); // cahier:L97

      console.log(
        `[T05.A6] lignes=${String(clotures.length)} non_servies=${nonServies.join(' ')} ` +
          `depenses=${depenses.join(' ')} total=${String(total)} temoin_non_servies=` +
          `${String(cardinal(lu(clotureTemoin, CLES_NON_SERVIES)))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
