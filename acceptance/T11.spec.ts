/**
 * acceptance/T11.spec.ts — suite d'acceptation de la tache T11.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T11.A1 behaviour — quatre periodes dans l'ordre
 *   T11.A2 behaviour — remplacement de regle en P3 visible, ancienne regle
 *                      retiree
 *   T11.A3 behaviour — historique metier present en P4
 *   T11.A4 numeric   — F-FAILURE conserve quatre resultats
 *   T11.A5 behaviour — deux executions identiques ont le meme resultat
 *                      canonique
 *   T11.A6 refusal   — la variante `cross-tenant-read` fait echouer le
 *                      controle metier associe
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T11 — `apps/cli`, `packages/domain`,
 * `packages/scenario`, `packages/workload`. ADR-001 : cet aveuglement est
 * PROCEDURAL, donc une discipline auditable au diff, pas une barriere
 * technique. Le contrat teste ci-dessous n'a pas ete releve dans
 * l'implementation ; il est derive de docs/specs/T11.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle :
 *
 *   L245  titre : « Livrer une premiere trajectoire verticale en memoire »
 *   L247  livrables : « commande `bench demo --mode recorded --storage
 *         memory`, pilote de periode scripte, resultats JSON »
 *   L249  « assembler revelation, decision de fixture, validation, usages et
 *         metriques sans dependre encore de Temporal ni du stockage
 *         distribue »
 *   L251  les six cas d'acceptation, mot pour mot
 *   L253  fin : « une demonstration de bout en bout du domaine fonctionne.
 *         Les couts non encore exerces sont explicitement fictifs et ce jalon
 *         ne valide ni persistence reelle ni isolation. Cette limite apparait
 *         dans le resultat. »
 *   L21   mode `recorded` : « agent scripte, reponses et couts fictifs
 *         archives »
 *   L24   « les resultats portent TOUJOURS `execution_mode`, `cost_origin` et
 *         `corpus_provenance` »
 *   L63   D-1 : « l'etat applicatif d'une trajectoire persiste ; aucun retour
 *         automatique a une base ideale » — c'est ce que A3 observe en P4
 *   L78   identite complete d'une trajectoire, et `period_index` « commencant
 *         a 1 »
 *   L80   JSON de domaine stricts ; « les montants sont des chaines d'entiers
 *         non negatifs »
 *   L82   empreintes SHA-256 sur octets canoniques : objets tries
 *         RECURSIVEMENT par cle, ordre des tableaux conserve, UTF-8
 *   L86   `Requirement` : id, version, poids, date de revelation, echeance,
 *         REMPLACEMENT EVENTUEL — le champ dont A2 verifie l'effet
 *   L95   `PeriodResult` : depenses, exigences evaluees, intentions
 *         offertes/reussies, incidents, Q, R, G, statut et empreintes
 *   L119  F-RESERVATION : horloge initiale, acteurs A/B/C, locataire `legacy`,
 *         creneau S1, migration P4 et interdiction de lecture intertenant
 *   L121  F-FAILURE : quatre lignes conservees, Q=0 et R=0, couts [100,50,0,0]
 *         totalisant 150, « aucune facture imaginaire n'y est ajoutee »
 *   L123  etat persistant a l'entree de P4 ; « le contrat intertenant de la
 *         fixture renvoie `NOT_FOUND` sans donnee metier divulguee »
 *   L125  horloges principales des quatre periodes de F-RESERVATION
 *   L129  F-REGRESSION : `cancel@1` satisfaite en P2 puis REMPLACEE en P3 par
 *         `cancel@2` sans regression ; `isolation@1` satisfaite en P3 puis
 *         violee en P4 en produit une
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *   L143  « les nombres exacts se verifient en entier ou rationnel »
 *   L559  « les comparaisons canonisent uniquement les ids de lancement et
 *         metadonnees EXPLICITEMENT volatiles, en conservant projet, scenario,
 *         configuration, budget, repetition, periode et resultat »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion provient soit d'un import de
 * `acceptance/reference/**` (racine gelee, docs/FROZEN_ROOTS.json), soit porte
 * un commentaire `// cahier:L<n>` resoluble par `sed -n '<n>p' docs/cahier.md`.
 *
 * LUS DANS LA RACINE GELEE, jamais recopies ici :
 *   F-RESERVATION — acteurs [A,B,C], locataire `legacy`, creneau `S1` de
 *                   capacite 1, les quatre horloges metier, l'etat persistant
 *                   a l'entree de P4, le verdict intertenant `NOT_FOUND`
 *   F-FAILURE     — K=4, lignes conservees=4, Q=[0,0,0,0], R=[0,0,0,0],
 *                   couts=[100,50,0,0], total=150, factures ajoutees=0
 *   F-REGRESSION  — `cancel@1`, `cancel@2`, `isolation@1`, et le fait que le
 *                   retrait de `cancel@1` ne produit PAS de regression
 *
 * PORTANT UN `// cahier:L<n>` : `recorded`, `memory`, `demo`, les noms de
 * drapeaux `--mode` et `--storage` (L247), `execution_mode` / `cost_origin` /
 * `corpus_provenance` (L24), les six identifiants d'identite et `period_index`
 * (L78), `cross-tenant-read` (L251), et le premier index de periode, 1 (L78).
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * les options d'appel (`{ mode, storage, variant }`), qui sont des ENTREES.
 *
 * DEUX MOTS FRANCAIS DE LA RACINE GELEE SONT LUS COMME DES ETATS, PAS COMME
 * DES CHAINES. F-RESERVATION scelle l'etat de P4 en francais (« annule »,
 * « confirme », « en attente »). Le cahier n'impose aucun vocabulaire d'etat de
 * reservation ; la suite compare donc ces etats par un MOTIF derive du mot
 * scelle et acceptant sa forme anglaise (annule -> /annul|cancel/i). C'est une
 * tolerance de NOMMAGE, jamais de COMPORTEMENT : le nombre d'etats attendus,
 * leur acteur et leur periode restent exactement ceux de la racine gelee.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T11 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * DEUX SURFACES, ET POURQUOI DEUX.
 *
 *  (a) UN EXPORT DE PAQUET, role `runDemo`. Il est cherche dans les paquets que
 *      le registre declare — `packages/domain`, `packages/scenario`,
 *      `packages/workload` — et nulle part ailleurs. C'est lui que les six cas
 *      exercent, et c'est sur lui que mord la porte de necessite des cas
 *      `behaviour` (stuber les exports doit rendre le cas rouge).
 *
 *      apps/cli N'EST JAMAIS IMPORTE. Une entree de commande qui s'execute a
 *      l'import (`main()` au niveau du module, `process.exit`) emporterait la
 *      suite entiere — « Test suite failed to run », que
 *      verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et refuse comme
 *      preuve. La commande est donc observee comme un PROCESSUS, jamais comme
 *      un module.
 *
 *  (b) LA COMMANDE `bench demo --mode recorded --storage memory` (L247),
 *      lancee en sous-processus par A1. Elle ecrit son resultat JSON sur la
 *      sortie standard. Sans cette moitie, le livrable nomme par L247 ne
 *      serait jamais observe.
 *
 * APPEL. `runDemo(options)` recoit un objet PLAT et rend le resultat, ou une
 * promesse de resultat :
 *
 *     runDemo({ mode: 'recorded', storage: 'memory' })            // nominal
 *     runDemo({ mode: 'recorded', storage: 'memory',
 *               variant: 'F-FAILURE' })                           // A4
 *     runDemo({ mode: 'recorded', storage: 'memory',
 *               variant: 'cross-tenant-read' })                   // A6
 *
 * `mode` et `storage` reprennent litteralement les deux drapeaux de L247.
 * `variant` designe la trajectoire jouee par le pilote scripte ; ses deux
 * seules valeurs employees ici sont des LITTERAUX DU CAHIER — le nom de la
 * fixture `F-FAILURE` (L121) et le nom de variante `cross-tenant-read` (L251).
 * Variante absente = trajectoire nominale, celle du temoin conforme.
 *
 * RESULTAT. Un objet JSON portant au moins :
 *
 *   execution_mode, cost_origin, corpus_provenance   (L24, obligatoires)
 *   les six identifiants d'identite de L78            (campaign_id,
 *       parent_project_id, scenario_id, configuration_id, repetition_id,
 *       budget_id)
 *   une sequence ORDONNEE de quatre periodes, chacune portant `period_index`
 *       (L78), son horloge metier (L88), ses exigences evaluees, ses
 *       exigences remplacees, ses depenses, Q, R, G (L95)
 *   les controles metier executes, chacun NOMME et portant un statut
 *       (T10 : « chacun detecte par son controle NOMME », L241)
 *   la declaration EXPLICITE de ses metadonnees volatiles (L559)
 *   la limite de ce jalon : « ne valide ni persistence reelle ni isolation »
 *       (L253)
 *
 * Les noms de champs que le cahier ECRIT sont exiges tels quels ; ceux qu'il
 * ne fait que decrire en prose sont resolus par une courte liste d'alias.
 * Les alias sont une tolerance de NOMMAGE, jamais de COMPORTEMENT — et ils
 * sont repris a l'identique dans verification/mutants/T11.json.
 *
 * CINQ ROLES DE CHAMP, nommes par leur FONCTION :
 *   periodes(resultat)           la sequence des quatre periodes
 *   exigences(periode)           les exigences ACTIVES ET DUES a la periode
 *   remplacees(periode)          les exigences retirees par remplacement
 *   controles(resultat)          les controles metier executes et leur statut
 *   volatiles(resultat)          la liste des chemins volatils declares
 *
 * SEPARATION EXIGEE ENTRE `exigences` ET `remplacees` (A2). « Remplacement
 * visible ET ancienne regle retiree » (L251) demande DEUX observations
 * opposees sur le meme identifiant : `cancel@1` doit avoir quitte les
 * exigences actives de P3 et figurer dans le registre des remplacements de P3,
 * lie a `cancel@2`. Une implementation qui melangerait les deux collections
 * rendrait l'une des deux assertions impossible a satisfaire — c'est
 * volontaire, L86 fixant « remplacement eventuel » comme champ du contrat
 * `Requirement`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne prouve ni la persistance reelle ni l'isolation : L253 le dit en
 *    toutes lettres pour ce jalon. Elle exige seulement que le resultat PORTE
 *    cette limite (A6). La persistance est T12/T23, l'isolation T20/T21.
 *  • Elle ne reverifie pas l'arithmetique de Q, R, V, U et G : c'est T04, dont
 *    T11 depend. A4 ne compare que les valeurs que F-FAILURE scelle pour la
 *    trajectoire sans deploiement.
 *  • Elle ne reverifie pas la machine a etats de periode (T05) ni la
 *    revelation (T06) : elle observe leur ASSEMBLAGE, ce que L249 demande.
 *  • Elle n'impose aucun schema de stockage : `--storage memory` (L247) exclut
 *    toute base, et la comparaison de A5 porte sur le resultat canonique, pas
 *    sur une structure interne.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 600_000;
const PROC_TIMEOUT_MS = 180_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle */

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

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
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
  if (v instanceof Error) {
    const code = (v as unknown as Json).code;
    return `${v.name}${typeof code === 'string' ? `(${code})` : ''}: ${v.message}`;
  }
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 900): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/**
 * Octets canoniques de L82 : objets tries RECURSIVEMENT par cle, ordre des
 * tableaux conserve, UTF-8.
 */
function canonique(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonique);
  if (v !== null && typeof v === 'object') {
    const o = v as Json;
    const out: Json = {};
    for (const k of Object.keys(o).sort()) out[k] = canonique(o[k]);
    return out;
  }
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'function') return '[fonction]';
  return v;
}

/** SHA-256 hexadecimal sur les octets canoniques — L82. */
function empreinte(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonique(v)) ?? 'undefined', 'utf8').digest('hex');
}

/**
 * L'assertion elementaire. Une comparaison de chaines, pour que le message
 * d'echec NOMME ce qui a ete observe au lieu d'afficher `false !== true`.
 */
function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/**
 * ECART ENTRE LES DEUX EXECUTIONS DE A5, ET POURQUOI IL EXISTE.
 *
 * Mesure faite sur une implementation synthetique conforme a laquelle on avait
 * ajoute un horodatage d'execution NON declare volatil : lancees l'une apres
 * l'autre, les deux executions tombaient dans la MEME milliseconde, les deux
 * horodatages etaient egaux, et le cas restait VERT — faux PASS sur exactement
 * la perturbation que ce cas doit detecter. Une source d'horodatage n'est
 * observable que si les executions sont separees par plus que sa resolution ;
 * 1100 ms couvre la seconde, la plus grossiere des resolutions usuelles.
 *
 * Ce n'est pas une preuve d'ordonnancement au sens de L141 : rien n'est deduit
 * d'un delai. C'est un ecart d'ECHANTILLONNAGE, et il ne peut que rendre le
 * cas plus severe.
 */
const ECART_ENTRE_EXECUTIONS_MS = 1100;

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ──────────────────── fixtures de reference (racine gelee, L139) */

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

const F_RESERVATION = readReference('F-RESERVATION');
const F_FAILURE = readReference('F-FAILURE');
const F_REGRESSION = readReference('F-REGRESSION');

/* F-RESERVATION — racine gelee */

/** Acteurs A, B et C. */
const ACTEURS = (refValue(F_RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
/** Locataire initial `legacy`. */
const LOCATAIRE_INITIAL = String(refValue(F_RESERVATION, 'valeurs.locataire_initial.valeur'));
/** Creneau `S1`, de capacite 1. */
const CRENEAU_ID = String(refValue(F_RESERVATION, 'valeurs.creneau.id.valeur'));
/** Les quatre horloges metier, dans l'ordre des periodes. */
const HORLOGES = ['P1', 'P2', 'P3', 'P4'].map((p) =>
  String(refValue(F_RESERVATION, `valeurs.horloges_des_periodes.${p}.valeur`)),
);
/** Etat persistant a l'entree de P4 : A annule, B confirme, C en attente. */
const ETAT_P4: Record<string, string> = {
  A: String(refValue(F_RESERVATION, 'valeurs.P4.etat_persistant_a_l_entree.A.valeur')),
  B: String(refValue(F_RESERVATION, 'valeurs.P4.etat_persistant_a_l_entree.B.valeur')),
  C: String(refValue(F_RESERVATION, 'valeurs.P4.etat_persistant_a_l_entree.C.valeur')),
};
/** « NOT_FOUND sans donnee metier divulguee » — on en retient le code. */
const VERDICT_INTERTENANT = String(refValue(F_RESERVATION, 'valeurs.P4.verdict_intertenant.valeur'));
const CODE_INTERTENANT = VERDICT_INTERTENANT.split(/\s+/)[0];

/**
 * Motifs d'etat derives des mots scelles ci-dessus, forme francaise OU
 * anglaise. Le cahier n'impose aucun vocabulaire d'etat de reservation ; il
 * impose les etats eux-memes (L123).
 */
const MOTIF_ETAT: Record<string, RegExp> = {
  annule: /annul|cancel/i,
  confirme: /confirm/i,
  'en attente': /attente|wait|pending|queue/i,
};

/* F-FAILURE — racine gelee */

/** K=4 periodes. */
const K_FAILURE = Number(refValue(F_FAILURE, 'valeurs.K.valeur'));
/** Quatre lignes conservees. */
const LIGNES_CONSERVEES = Number(refValue(F_FAILURE, 'valeurs.lignes_conservees.valeur'));
/** Q=[0,0,0,0]. */
const Q_FAILURE = (refValue(F_FAILURE, 'valeurs.Q_par_periode.valeur') as unknown[]).map(Number);
/** R=[0,0,0,0]. */
const R_FAILURE = (refValue(F_FAILURE, 'valeurs.R_par_periode.valeur') as unknown[]).map(Number);
/** Couts [100,50,0,0]. */
const COUTS_FAILURE = (refValue(F_FAILURE, 'valeurs.couts.valeur') as unknown[]).map(Number);
/** Cout total 150. */
const COUT_TOTAL_FAILURE = Number(refValue(F_FAILURE, 'valeurs.cout_total.valeur'));

/* F-REGRESSION — racine gelee */

/** `cancel@1`, satisfaite en P2, remplacee en P3. */
const EXIGENCE_REMPLACEE = String(refValue(F_REGRESSION, 'valeurs.exigence_remplacee.id.valeur'));
/** `cancel@2`, la remplacante. */
const EXIGENCE_REMPLACANTE = String(
  refValue(F_REGRESSION, 'valeurs.exigence_remplacee.remplacee_par.valeur'),
);
/** P2 — la periode ou `cancel@1` est satisfaite. */
const PERIODE_SATISFAITE = String(
  refValue(F_REGRESSION, 'valeurs.exigence_remplacee.satisfaite_en.valeur'),
);
/** P3 — la periode du remplacement. */
const PERIODE_REMPLACEMENT = String(
  refValue(F_REGRESSION, 'valeurs.exigence_remplacee.remplacee_en.valeur'),
);
/** « le retrait de `cancel@1` ne produit pas de regression » -> false. */
const REMPLACEMENT_EST_UNE_REGRESSION = Boolean(
  refValue(F_REGRESSION, 'valeurs.exigence_remplacee.produit_une_regression.valeur'),
);
/** `isolation@1`, satisfaite en P3 puis violee en P4. */
const EXIGENCE_ISOLATION = String(refValue(F_REGRESSION, 'valeurs.exigence_violee.id.valeur'));

/** « Pn » -> index de periode, sans arithmetique cachee. */
function indexDePeriode(nom: string): number {
  const m = /^P(\d+)$/.exec(nom.trim());
  if (m === null) throw new Error(`REFERENCE-PERIODE-ILLISIBLE ${nom}`);
  return Number(m[1]);
}

/* ───────────────── litteraux du cahier, chacun avec sa ligne */

/** Le mode de la commande de L247, et le mode de la table de L21. */
const MODE = 'recorded'; // cahier:L247
/** Le stockage de la commande de L247. */
const STOCKAGE = 'memory'; // cahier:L247
/** La sous-commande de L247. */
const SOUS_COMMANDE = 'demo'; // cahier:L247
/** Les deux drapeaux de la commande de L247. */
const DRAPEAU_MODE = '--mode'; // cahier:L247
const DRAPEAU_STOCKAGE = '--storage'; // cahier:L247
/** La variante fautive nommee par le cas A6. */
const VARIANTE_INTERTENANT = 'cross-tenant-read'; // cahier:L251
/** Le nom de la fixture que A4 exerce. */
const VARIANTE_FAILURE = 'F-FAILURE'; // cahier:L121
/** `period_index` « commencant a 1 ». */
const PREMIER_INDEX = 1; // cahier:L78
/** Les six identifiants de l'identite complete d'une trajectoire. */
const IDENTITE = [
  'campaign_id',
  'parent_project_id',
  'scenario_id',
  'configuration_id',
  'repetition_id',
  'budget_id',
]; // cahier:L78
/** Les trois champs que « les resultats portent toujours ». */
const CHAMP_MODE_EXECUTION = 'execution_mode'; // cahier:L24
const CHAMP_ORIGINE_COUTS = 'cost_origin'; // cahier:L24
const CHAMP_PROVENANCE = 'corpus_provenance'; // cahier:L24
/**
 * L21 : en mode `recorded` les couts sont « fictifs archives » ; L253 : « les
 * couts non encore exerces sont explicitement fictifs ». Le cahier ne fixe pas
 * l'enum de `cost_origin` : la suite exige que sa valeur DISE le caractere
 * fictif, par l'un des mots que ces deux lignes emploient.
 */
const MOTIF_COUTS_FICTIFS = /fictif|fictitious|scripted|recorded|simul|synth/i; // cahier:L21 cahier:L253
/** L253 : « ne valide NI persistence reelle NI isolation ». */
const MOTIF_LIMITE_PERSISTANCE = /persist/i; // cahier:L253
const MOTIF_LIMITE_ISOLATION = /isolation/i; // cahier:L253

/* ───────────────────────────────── navigation dans un resultat JSON */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

/** Parcours en largeur, borne en profondeur, avec garde de cycle. */
function noeuds(racine: unknown, profMax = 9): Noeud[] {
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

/** Premiere valeur non vide portee par l'une des cles alias, en surface. */
function champ(o: unknown, alias: readonly string[]): unknown {
  if (o === null || typeof o !== 'object') return undefined;
  const cible = new Set(alias.map(normKey));
  for (const [k, v] of Object.entries(o as Json)) {
    if (cible.has(normKey(k)) && v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** Meme chose, mais en profondeur : rend le premier noeud trouve. */
function champProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== null && n.valeur !== undefined) {
      return n;
    }
  }
  return null;
}

/** Premier tableau d'objets porte par l'une des cles alias, en profondeur. */
function tableauProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && Array.isArray(n.valeur)) return n;
  }
  return null;
}

/** Toutes les chaines d'un sous-arbre. */
function chaines(racine: unknown): string[] {
  return noeuds(racine)
    .map((n) => n.valeur)
    .filter((v): v is string => typeof v === 'string');
}

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\@]/g, '\\$&');

/** Un jeton est MENTIONNE s'il apparait comme valeur, seul ou delimite. */
function mentionne(racine: unknown, jeton: string): boolean {
  const re = new RegExp(`(^|[^A-Za-z0-9_])${echapper(jeton)}([^A-Za-z0-9_]|$)`);
  return chaines(racine).some((s) => s === jeton || re.test(s));
}

/** Objets dont un champ IDENTIFIANT vaut exactement cet acteur. */
function objetsDeLActeur(racine: unknown, acteur: string): Json[] {
  const re = new RegExp(`^(?:actor|acteur|client|customer|party)?[-_ ]?${echapper(acteur)}$`, 'i');
  const out: Json[] = [];
  for (const n of noeuds(racine)) {
    const v = n.valeur;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Json;
    const porte = Object.entries(o).some(
      ([k, x]) => typeof x === 'string' && re.test(x) && /acteur|actor|client|customer|party|holder|titulaire|owner|who|id|name|nom/i.test(k),
    );
    if (porte) out.push(o);
  }
  return out;
}

/** Nombre exact : un entier ou une chaine d'entier (L80), jamais un flottant devine. */
function nombre(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  if (v !== null && typeof v === 'object') {
    const n = champ(v, ['value', 'valeur', 'amount', 'montant', 'micro_usd', 'total']);
    if (n !== undefined) return nombre(n);
  }
  return null;
}

/* ────────────────────────── roles de champ (alias documentes en III) */

const ALIAS_PERIODES = [
  'periods',
  'periodes',
  'period_results',
  'periodresults',
  'resultats_periodes',
  'periodes_resultats',
  'results',
  'resultats',
  'trajectory',
  'trajectoire',
];
const ALIAS_INDEX = ['period_index', 'periodindex', 'index', 'numero', 'rang', 'k'];
const ALIAS_HORLOGE = [
  'business_clock',
  'horloge_metier',
  'horloge',
  'clock',
  'business_time',
  'temps_metier',
  'instant_metier',
  'business_instant',
  'business_date',
  'period_clock',
];
const ALIAS_EXIGENCES = [
  'requirements',
  'exigences',
  'evaluated_requirements',
  'exigences_evaluees',
  'active_requirements',
  'exigences_actives',
  'requirements_evaluated',
  'due_requirements',
  'exigences_dues',
];
const ALIAS_REMPLACEES = [
  'replaced_requirements',
  'exigences_remplacees',
  'replacements',
  'remplacements',
  'replaced',
  'remplacees',
  'superseded_requirements',
  'retired_requirements',
  'exigences_retirees',
];
const ALIAS_REGRESSIONS = ['regressions', 'regression', 'g_details', 'regressions_ouvertes', 'open_regressions'];
const ALIAS_CONTROLES = [
  'controls',
  'controles',
  'business_controls',
  'controles_metier',
  'checks',
  'business_checks',
  'oracle_checks',
  'controles_oracle',
  'verifications',
  'audits',
];
const ALIAS_VOLATILES = [
  'volatile',
  'volatiles',
  'volatile_fields',
  'champs_volatils',
  'metadonnees_volatiles',
  'volatile_metadata',
  'volatile_paths',
  'chemins_volatils',
];
const ALIAS_LIMITES = ['limitations', 'limites', 'limite', 'caveats', 'reserves', 'known_limits'];
const ALIAS_COUTS = ['spend', 'depenses', 'cost', 'couts', 'cout', 'costs', 'depense', 'expenditure', 'total_cost'];
const ALIAS_HISTORIQUE = [
  'business_history',
  'historique_metier',
  'historique',
  'history',
  'business_state',
  'etat_metier',
  'business_export',
  'export_metier',
  'domain_history',
  'faits_metier',
  'business_facts',
  'projection',
];
const ALIAS_NOM = ['id', 'name', 'nom', 'control', 'controle', 'check', 'code', 'label', 'libelle'];
const ALIAS_STATUT = ['status', 'statut', 'state', 'etat', 'result', 'resultat', 'outcome', 'verdict', 'passed', 'ok'];
const ALIAS_SATISFAITE = ['satisfied', 'satisfaite', 'met', 'fulfilled', 'passed', 'ok', 'status', 'statut', 'etat', 'state'];

type Periodes = { chemin: string; liste: Json[] };

/**
 * La periode PORTANT cet index, et non la n-ieme du tableau.
 *
 * Seul A1 juge de l'ORDRE. Les autres cas designent leur periode par la valeur
 * de `period_index` (L78), de sorte qu'une permutation de la sequence ne les
 * fasse pas rougir pour la raison d'un autre cas : un mutant doit tuer le cas
 * qu'il vise, pas ses voisins.
 */
function periodeDIndex(liste: Json[], index: number): Json | null {
  const trouvees = liste.filter((p) => nombre(champ(p, ALIAS_INDEX)) === index);
  return trouvees.length === 1 ? trouvees[0] : null;
}

function periodesDe(resultat: unknown): Periodes | null {
  const t = tableauProfond(resultat, ALIAS_PERIODES);
  if (t !== null) {
    const l = t.valeur as unknown[];
    if (l.length > 0 && l.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x))) {
      return { chemin: t.chemin, liste: l as Json[] };
    }
  }
  for (const n of noeuds(resultat)) {
    if (!Array.isArray(n.valeur)) continue;
    const l = n.valeur as unknown[];
    if (
      l.length > 0 &&
      l.every(
        (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && champ(x, ALIAS_INDEX) !== undefined,
      )
    ) {
      return { chemin: n.chemin, liste: l as Json[] };
    }
  }
  return null;
}

/** VERT / ROUGE / INCONNU — jamais de troisieme etat silencieux. */
type Statut = 'VERT' | 'ROUGE' | 'INCONNU';

function statutDe(v: unknown): Statut {
  if (typeof v === 'boolean') return v ? 'VERT' : 'ROUGE';
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^(pass(ed)?|ok|success|succeeded|green|vert|satisfied|satisfaite|conforme|valid|clean|holds)$/i.test(s)) {
      return 'VERT';
    }
    if (
      /^(fail(ed)?|ko|error|red|rouge|violated|violation|breach|broken|detected|non[-_ ]?conforme|invalid|leak(ed)?)$/i.test(
        s,
      )
    ) {
      return 'ROUGE';
    }
  }
  return 'INCONNU';
}

type Controle = { nom: string; statut: Statut; brut: unknown };

function controlesDe(racine: unknown): { chemin: string; liste: Controle[] } | null {
  const t = tableauProfond(racine, ALIAS_CONTROLES);
  const lire = (x: unknown): Controle | null => {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) return null;
    const nom = champ(x, ALIAS_NOM);
    const st = champ(x, ALIAS_STATUT);
    if (typeof nom !== 'string') return null;
    return { nom, statut: statutDe(st), brut: x };
  };
  if (t !== null && Array.isArray(t.valeur)) {
    const liste = (t.valeur as unknown[]).map(lire).filter((c): c is Controle => c !== null);
    if (liste.length > 0) return { chemin: t.chemin, liste };
  }
  // Forme dictionnaire : { 'isolation-intertenant': 'PASS', ... }
  const d = champProfond(racine, ALIAS_CONTROLES);
  if (d !== null && d.valeur !== null && typeof d.valeur === 'object' && !Array.isArray(d.valeur)) {
    const liste: Controle[] = [];
    for (const [k, v] of Object.entries(d.valeur as Json)) {
      const st = statutDe(v);
      liste.push({ nom: k, statut: st === 'INCONNU' ? statutDe(champ(v, ALIAS_STATUT)) : st, brut: v });
    }
    if (liste.length > 0) return { chemin: d.chemin, liste };
  }
  return null;
}

/** Le controle metier d'isolation intertenant, reconnu par son NOM. */
const MOTIF_CONTROLE_ISOLATION = /isolation|tenant|locataire|intertenant|cross[-_ ]?tenant/i;

/** Une exigence est mentionnee soit par `id@version`, soit par la paire (id, version). */
function mentionneExigence(racine: unknown, idVersion: string): boolean {
  if (mentionne(racine, idVersion)) return true;
  const m = /^(.+)@(\d+)$/.exec(idVersion);
  if (m === null) return false;
  const id = m[1];
  const version = Number(m[2]);
  for (const n of noeuds(racine)) {
    const v = n.valeur;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Json;
    const oid = champ(o, ['id', 'requirement_id', 'capability_id', 'name', 'nom', 'code']);
    const over = champ(o, ['version', 'v', 'revision']);
    if (typeof oid === 'string' && oid === id && nombre(over) === version) return true;
  }
  return false;
}

/* ─────────────────────────────────── chargement des paquets de T11 */

/**
 * Les trois paquets que verification/tasks.json declare comme `source_paths`
 * de T11, hors `apps/cli` — que la suite n'importe JAMAIS (voir III.a).
 */
const PAQUETS = ['domain', 'scenario', 'workload'] as const;

type Loaded = { ok: boolean; via: string[]; exportCount: number; flat: Map<string, unknown>; attempts: string[] };

function flatten(ns: Ns, out: Map<string, unknown>): void {
  const put = (k: string, v: unknown): void => {
    if (!out.has(k)) out.set(k, v);
  };
  for (const [k, v] of Object.entries(ns)) {
    if (k === '__esModule') continue;
    put(k, v);
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
  for (const pkg of PAQUETS) {
    let charge = false;
    const specs = specifiersFor(pkg);
    if (specs.length === 0) attempts.push(`paquet packages/${pkg} : aucun specificateur (paquet absent ?)`);
    for (const s of specs) {
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
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement.
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertCharge(): void {
  exige(
    LOADED.ok,
    'paquets-charges',
    `PAQUETS-NON-CHARGEABLES ${LOADED.attempts.join(' | ')}`,
  );
  exige(
    !LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v)),
    'charge-depuis-la-source',
    `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`,
  );
}

/** Les alias du role `runDemo`, du plus specifique au plus general. */
const ALIAS_RUN_DEMO = [
  'runDemo',
  'runDemoTrajectory',
  'runVerticalDemo',
  'runVerticalTrajectory',
  'runInMemoryDemo',
  'runBenchDemo',
  'executeDemo',
  'demoTrajectory',
  'runDemoCommand',
  'runPeriodDriver',
  'runScriptedDriver',
  'runTrajectory',
  'benchDemo',
  'demo',
];

function resoudreRunDemo(): { nom: string; fn: (o: Json) => unknown } | null {
  for (const alias of ALIAS_RUN_DEMO) {
    for (const [k, v] of LOADED.flat) {
      if (normKey(k) === normKey(alias) && typeof v === 'function') {
        return { nom: k, fn: v as (o: Json) => unknown };
      }
    }
  }
  return null;
}

type Issue = { ok: boolean; resultat: Json | null; texte: string };

async function lancerDemo(options: Json): Promise<Issue> {
  const r = resoudreRunDemo();
  if (r === null) {
    const noms = [...LOADED.flat.keys()].filter((k) => !k.includes('.')).slice(0, 40).join(', ');
    return {
      ok: false,
      resultat: null,
      texte: `ROLE-ABSENT runDemo : aucun des alias [${ALIAS_RUN_DEMO.join(', ')}] n'est exporte par packages/{${PAQUETS.join(',')}} — exports vus : ${noms}`,
    };
  }
  try {
    const brut = await Promise.resolve(r.fn(options));
    if (brut === null || typeof brut !== 'object') {
      return { ok: false, resultat: null, texte: `${r.nom}(${rendu(options)}) a rendu ${rendu(brut)}, pas un objet resultat` };
    }
    return { ok: true, resultat: brut as Json, texte: `${r.nom} a rendu un resultat` };
  } catch (e) {
    return { ok: false, resultat: null, texte: `${r.nom}(${rendu(options)}) a LEVE ${rendu(e)}` };
  }
}

const OPTIONS_NOMINALES: Json = { mode: MODE, storage: STOCKAGE };

/* ────────────────────────── la commande, observee comme un PROCESSUS */

type Tentative = { label: string; argv: string[]; exit: number | null; sortie: string };

function entreesCli(): { label: string; argv: string[] }[] {
  const out: { label: string; argv: string[] }[] = [];
  const dir = path.join(REPO, 'apps', 'cli');
  const ajouter = (label: string, f: string): void => {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return;
    if (out.some((c) => c.argv[0] === f)) return;
    out.push({ label, argv: [f] });
  };
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Json;
      const bin = j.bin;
      if (typeof bin === 'string') ajouter('apps/cli:bin', path.resolve(dir, bin));
      else if (bin !== null && typeof bin === 'object') {
        for (const v of Object.values(bin as Json)) {
          if (typeof v === 'string') ajouter('apps/cli:bin', path.resolve(dir, v));
        }
      }
      if (typeof j.main === 'string') ajouter('apps/cli:main', path.resolve(dir, j.main));
    } catch {
      /* manifeste illisible : on retombe sur les chemins usuels */
    }
  }
  for (const rel of [
    'dist/index.js',
    'dist/cli.js',
    'dist/main.js',
    'dist/bin.js',
    'dist/bench.js',
    'bin/bench.js',
    'bin/bench.mjs',
    'index.js',
    'cli.js',
    'src/index.ts',
    'src/cli.ts',
    'src/main.ts',
    'src/bench.ts',
  ]) {
    ajouter(`apps/cli:${rel}`, path.join(dir, rel));
  }
  // Point d'entree unique du depot : `pnpm bench` est `node tools/bench`
  // (package.json). Accepte en dernier recours, la commande restant celle que
  // L247 nomme.
  ajouter('tools/bench', path.join(REPO, 'tools', 'bench'));
  return out;
}

function executer(argv: string[]): { exit: number | null; sortie: string; stdout: string } {
  try {
    const stdout = execFileSync('node', argv, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exit: 0, sortie: stdout, stdout };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    const so = String(err.stdout ?? '');
    const se = String(err.stderr ?? '');
    return { exit: err.status ?? null, sortie: `${so}\n${se}`, stdout: so };
  }
}

/** Extrait le resultat JSON d'une sortie standard qui peut babiller autour. */
function jsonDeSortie(s: string): Json | null {
  const essai = (t: string): Json | null => {
    try {
      const v = JSON.parse(t) as unknown;
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
    } catch {
      return null;
    }
  };
  const direct = essai(s.trim());
  if (direct !== null) return direct;
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) {
    const bloc = essai(s.slice(i, j + 1));
    if (bloc !== null) return bloc;
  }
  for (const ligne of s.split('\n').reverse()) {
    const l = essai(ligne.trim());
    if (l !== null) return l;
  }
  return null;
}

let BUILD_TENTE = false;

function construireUneFois(tentatives: Tentative[]): void {
  if (BUILD_TENTE) return;
  BUILD_TENTE = true;
  try {
    execFileSync('pnpm', ['build'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: BUILD_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: 0, sortie: 'build ok' });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    tentatives.push({
      label: 'pnpm build',
      argv: ['pnpm', 'build'],
      exit: err.status ?? null,
      sortie: court(`${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}`, 400),
    });
  }
}

/** `bench demo --mode recorded --storage memory` — L247, argv litterale. */
function lancerCommande(): { resultat: Json | null; tentatives: Tentative[] } {
  const args = [SOUS_COMMANDE, DRAPEAU_MODE, MODE, DRAPEAU_STOCKAGE, STOCKAGE];
  const tentatives: Tentative[] = [];
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, ...args];
      const r = executer(argv);
      const j = r.exit === 0 ? jsonDeSortie(r.stdout) : null;
      tentatives.push({
        label: c.label,
        argv,
        exit: r.exit,
        sortie: court(r.sortie, 300),
      });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, tentatives };
  construireUneFois(tentatives);
  return { resultat: essayer(), tentatives };
}

/* ─────────────────────────────── projection canonique (A5) */

function volatilesDeclares(resultat: unknown): string[] | null {
  const n = champProfond(resultat, ALIAS_VOLATILES);
  if (n === null) return null;
  if (Array.isArray(n.valeur) && n.valeur.every((x) => typeof x === 'string')) return n.valeur as string[];
  const f = champ(n.valeur, ['fields', 'champs', 'paths', 'chemins']);
  if (Array.isArray(f) && f.every((x) => typeof x === 'string')) return f as string[];
  return null;
}

function projeter(v: unknown, volatils: Set<string>, chemin = ''): unknown {
  if (Array.isArray(v)) return v.map((x) => projeter(x, volatils, chemin));
  if (v !== null && typeof v === 'object') {
    const out: Json = {};
    for (const [k, x] of Object.entries(v as Json)) {
      const p = chemin === '' ? k : `${chemin}.${k}`;
      if (volatils.has(normKey(k)) || volatils.has(normKey(p))) continue;
      out[k] = projeter(x, volatils, p);
    }
    return out;
  }
  return v;
}

function canoniqueDe(resultat: Json, volatils: string[]): unknown {
  return projeter(resultat, new Set(volatils.map(normKey)));
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T11 — premiere trajectoire verticale en memoire', () => {
  test(
    `T11.A1 quatre periodes dans l ordre, et la commande bench ${SOUS_COMMANDE} ${DRAPEAU_MODE} ${MODE} ${DRAPEAU_STOCKAGE} ${STOCKAGE} les produit`,
    async () => {
      assertCharge();

      // (1) L'EXPORT METIER PRODUIT UN RESULTAT.
      const issue = await lancerDemo(OPTIONS_NOMINALES);
      exige(issue.ok, 'demo-executee', issue.texte);
      const resultat = issue.resultat as Json;

      // (2) L24 : « les resultats portent TOUJOURS execution_mode ». L247 fixe
      //     sa valeur pour cette commande : `recorded`.
      const mode = champProfond(resultat, [CHAMP_MODE_EXECUTION]);
      exige(
        mode !== null && mode.valeur === MODE,
        `${CHAMP_MODE_EXECUTION}=${MODE}`,
        `${CHAMP_MODE_EXECUTION} vaut ${rendu(mode?.valeur)} dans ${rendu(resultat)}`,
      );

      // (3) LA SEQUENCE DES PERIODES EXISTE.
      const p = periodesDe(resultat);
      exige(
        p !== null,
        'sequence-de-periodes-presente',
        `AUCUNE-SEQUENCE-DE-PERIODES : ni cle [${ALIAS_PERIODES.join('|')}], ni tableau d'objets portant ${ALIAS_INDEX[0]} dans ${rendu(resultat)}`,
      );
      const periodes = (p as Periodes).liste;

      // (4) QUATRE PERIODES — K de la racine gelee F-FAILURE.
      exige(
        periodes.length === K_FAILURE,
        `${K_FAILURE}-periodes`,
        `${periodes.length} periode(s) en ${(p as Periodes).chemin} : ${rendu(periodes.map((x) => champ(x, ALIAS_INDEX)))}`,
      );

      // (5) DANS L'ORDRE : les index sont 1..K, dans cet ordre d'apparition.
      const attendus = Array.from({ length: K_FAILURE }, (_, i) => PREMIER_INDEX + i);
      const observes = periodes.map((x) => nombre(champ(x, ALIAS_INDEX)));
      exige(
        JSON.stringify(observes) === JSON.stringify(attendus),
        `index-ordonnes ${JSON.stringify(attendus)}`,
        `index observes ${JSON.stringify(observes)} en ${(p as Periodes).chemin}`,
      );

      // (6) L'ORDRE EST CELUI DES HORLOGES METIER DE F-RESERVATION (racine
      //     gelee). Un simple champ `period_index` bien numerote ne suffit
      //     pas : c'est l'ordre du TEMPS METIER qui est observe ici.
      const horloges = periodes.map((x) => {
        const h = champProfond(x, ALIAS_HORLOGE);
        return h === null ? null : h.valeur;
      });
      exige(
        horloges.every((h) => typeof h === 'string'),
        'horloge-metier-par-periode',
        `HORLOGE-METIER-ABSENTE : cles [${ALIAS_HORLOGE.join('|')}] introuvables ; vu ${rendu(horloges)}`,
      );
      exige(
        JSON.stringify(horloges) === JSON.stringify(HORLOGES),
        `horloges ${JSON.stringify(HORLOGES)}`,
        `horloges observees ${JSON.stringify(horloges)}`,
      );

      // (7) LA COMMANDE NOMMEE PAR L247 EXISTE ET PRODUIT CE RESULTAT.
      const cli = lancerCommande();
      exige(
        cli.resultat !== null,
        'commande-bench-demo-executee',
        `COMMANDE-INTROUVABLE-OU-MUETTE : ${cli.tentatives
          .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`)
          .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`,
      );
      const rCli = cli.resultat as Json;

      const modeCli = champProfond(rCli, [CHAMP_MODE_EXECUTION]);
      exige(
        modeCli !== null && modeCli.valeur === MODE,
        `commande:${CHAMP_MODE_EXECUTION}=${MODE}`,
        `la commande a rendu ${CHAMP_MODE_EXECUTION}=${rendu(modeCli?.valeur)}`,
      );

      const pCli = periodesDe(rCli);
      exige(
        pCli !== null && pCli.liste.length === K_FAILURE,
        `commande:${K_FAILURE}-periodes`,
        `la commande a rendu ${String(pCli?.liste.length)} periode(s)`,
      );
      const observesCli = (pCli as Periodes).liste.map((x) => nombre(champ(x, ALIAS_INDEX)));
      exige(
        JSON.stringify(observesCli) === JSON.stringify(attendus),
        `commande:index-ordonnes ${JSON.stringify(attendus)}`,
        `la commande a rendu les index ${JSON.stringify(observesCli)}`,
      );
      const horlogesCli = (pCli as Periodes).liste.map((x) => {
        const h = champProfond(x, ALIAS_HORLOGE);
        return h === null ? null : h.valeur;
      });
      exige(
        JSON.stringify(horlogesCli) === JSON.stringify(HORLOGES),
        `commande:horloges ${JSON.stringify(HORLOGES)}`,
        `la commande a rendu les horloges ${JSON.stringify(horlogesCli)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T11.A2 remplacement de regle en ${PERIODE_REMPLACEMENT} : ${EXIGENCE_REMPLACANTE} visible, ${EXIGENCE_REMPLACEE} retiree`,
    async () => {
      assertCharge();

      const issue = await lancerDemo(OPTIONS_NOMINALES);
      exige(issue.ok, 'demo-executee', issue.texte);
      const p = periodesDe(issue.resultat);
      exige(p !== null, 'sequence-de-periodes-presente', `AUCUNE-SEQUENCE-DE-PERIODES dans ${rendu(issue.resultat)}`);
      const periodes = (p as Periodes).liste;
      exige(
        periodes.length === K_FAILURE,
        `${K_FAILURE}-periodes`,
        `${periodes.length} periode(s) observee(s)`,
      );

      const P2 = periodeDIndex(periodes, indexDePeriode(PERIODE_SATISFAITE));
      const P3 = periodeDIndex(periodes, indexDePeriode(PERIODE_REMPLACEMENT));
      exige(
        P2 !== null && P3 !== null,
        `periodes-${PERIODE_SATISFAITE}-et-${PERIODE_REMPLACEMENT}-designees`,
        `aucune periode unique portant ${ALIAS_INDEX[0]}=${indexDePeriode(PERIODE_SATISFAITE)} ou ${indexDePeriode(PERIODE_REMPLACEMENT)} : ${rendu(periodes.map((x) => champ(x, ALIAS_INDEX)))}`,
      );

      // (1) LES EXIGENCES ACTIVES ET DUES SONT PUBLIEES, periode par periode.
      const actives2 = champProfond(P2, ALIAS_EXIGENCES);
      const actives3 = champProfond(P3, ALIAS_EXIGENCES);
      exige(
        actives2 !== null && actives3 !== null,
        'exigences-actives-publiees',
        `EXIGENCES-ACTIVES-ABSENTES : cles [${ALIAS_EXIGENCES.join('|')}] introuvables en ${PERIODE_SATISFAITE}/${PERIODE_REMPLACEMENT} ; ${PERIODE_REMPLACEMENT}=${rendu(P3)}`,
      );

      // (2) ETAT D'ENTREE (F-REGRESSION) : cancel@1 est active et SATISFAITE
      //     en P2. Sans cette moitie, « retiree en P3 » ne prouverait rien :
      //     une exigence jamais introduite est absente partout.
      exige(
        mentionneExigence((actives2 as Noeud).valeur, EXIGENCE_REMPLACEE),
        `${EXIGENCE_REMPLACEE}-active-en-${PERIODE_SATISFAITE}`,
        `${EXIGENCE_REMPLACEE} absente des exigences actives de ${PERIODE_SATISFAITE} : ${rendu((actives2 as Noeud).valeur)}`,
      );
      const objetsCancel1 = noeuds((actives2 as Noeud).valeur)
        .map((n) => n.valeur)
        .filter((v): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v))
        .filter((o) => {
          const id = champ(o, ['id', 'requirement_id', 'capability_id', 'name', 'nom', 'code']);
          const ver = champ(o, ['version', 'v', 'revision']);
          return (
            id === EXIGENCE_REMPLACEE ||
            (id === EXIGENCE_REMPLACEE.split('@')[0] && nombre(ver) === Number(EXIGENCE_REMPLACEE.split('@')[1]))
          );
        });
      exige(
        objetsCancel1.some((o) => statutDe(champ(o, ALIAS_SATISFAITE)) === 'VERT'),
        `${EXIGENCE_REMPLACEE}-satisfaite-en-${PERIODE_SATISFAITE}`,
        `aucune entree de ${EXIGENCE_REMPLACEE} marquee satisfaite en ${PERIODE_SATISFAITE} : ${rendu(objetsCancel1)}`,
      );

      // (3) LA MOITIE DECISIVE : la NOUVELLE regle est visible en P3.
      exige(
        mentionneExigence((actives3 as Noeud).valeur, EXIGENCE_REMPLACANTE),
        `${EXIGENCE_REMPLACANTE}-active-en-${PERIODE_REMPLACEMENT}`,
        `${EXIGENCE_REMPLACANTE} absente des exigences actives de ${PERIODE_REMPLACEMENT} : ${rendu((actives3 as Noeud).valeur)}`,
      );

      // (4) L'ANCIENNE REGLE EST RETIREE des exigences actives de P3.
      exige(
        !mentionneExigence((actives3 as Noeud).valeur, EXIGENCE_REMPLACEE),
        `${EXIGENCE_REMPLACEE}-retiree-en-${PERIODE_REMPLACEMENT}`,
        `${EXIGENCE_REMPLACEE} encore active en ${PERIODE_REMPLACEMENT} : ${rendu((actives3 as Noeud).valeur)}`,
      );

      // (5) LE RETRAIT EST UN ACTE ENREGISTRE, pas une simple absence : L86
      //     fait du « remplacement eventuel » un champ du contrat Requirement.
      const remplacees = champProfond(P3, ALIAS_REMPLACEES);
      exige(
        remplacees !== null,
        'registre-des-remplacements-publie',
        `REMPLACEMENTS-ABSENTS : cles [${ALIAS_REMPLACEES.join('|')}] introuvables en ${PERIODE_REMPLACEMENT} ; ${rendu(P3)}`,
      );
      exige(
        mentionneExigence((remplacees as Noeud).valeur, EXIGENCE_REMPLACEE),
        `${EXIGENCE_REMPLACEE}-inscrite-comme-remplacee`,
        `${EXIGENCE_REMPLACEE} absente du registre des remplacements de ${PERIODE_REMPLACEMENT} : ${rendu((remplacees as Noeud).valeur)}`,
      );
      exige(
        mentionneExigence((remplacees as Noeud).valeur, EXIGENCE_REMPLACANTE),
        `${EXIGENCE_REMPLACEE}-liee-a-${EXIGENCE_REMPLACANTE}`,
        `le remplacement n'est pas lie a ${EXIGENCE_REMPLACANTE} : ${rendu((remplacees as Noeud).valeur)}`,
      );

      // (6) F-REGRESSION, racine gelee : « le retrait de cancel@1 ne produit
      //     PAS de regression ».
      const regressions = champProfond(P3, ALIAS_REGRESSIONS);
      const compteRegressions =
        regressions === null
          ? null
          : Array.isArray(regressions.valeur)
            ? regressions.valeur.length
            : nombre(regressions.valeur);
      exige(
        regressions === null || !mentionneExigence(regressions.valeur, EXIGENCE_REMPLACEE),
        `${EXIGENCE_REMPLACEE}-non-comptee-en-regression`,
        `${EXIGENCE_REMPLACEE} comptee comme regression en ${PERIODE_REMPLACEMENT} alors que la racine gelee dit ${String(REMPLACEMENT_EST_UNE_REGRESSION)} : ${rendu(regressions?.valeur)} (compte ${String(compteRegressions)})`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T11.A3 historique metier present en P4',
    async () => {
      assertCharge();

      const issue = await lancerDemo(OPTIONS_NOMINALES);
      exige(issue.ok, 'demo-executee', issue.texte);
      const p = periodesDe(issue.resultat);
      exige(p !== null, 'sequence-de-periodes-presente', `AUCUNE-SEQUENCE-DE-PERIODES dans ${rendu(issue.resultat)}`);
      const periodes = (p as Periodes).liste;
      exige(periodes.length === K_FAILURE, `${K_FAILURE}-periodes`, `${periodes.length} periode(s) observee(s)`);

      const P4trouvee = periodeDIndex(periodes, K_FAILURE);
      exige(
        P4trouvee !== null,
        `periode-d-index-${K_FAILURE}-designee`,
        `aucune periode unique portant ${ALIAS_INDEX[0]}=${K_FAILURE} : ${rendu(periodes.map((x) => champ(x, ALIAS_INDEX)))}`,
      );
      const P4 = P4trouvee as Json;

      // (1) L'HISTORIQUE METIER EXISTE EN P4 ET N'EST PAS VIDE.
      const hist = champProfond(P4, ALIAS_HISTORIQUE);
      exige(
        hist !== null,
        'historique-metier-present',
        `HISTORIQUE-ABSENT : cles [${ALIAS_HISTORIQUE.join('|')}] introuvables en P4 ; ${rendu(P4)}`,
      );
      const contenu = (hist as Noeud).valeur;
      const taille = Array.isArray(contenu)
        ? contenu.length
        : contenu !== null && typeof contenu === 'object'
          ? Object.keys(contenu as Json).length
          : 0;
      exige(
        taille > 0,
        'historique-non-vide',
        `HISTORIQUE-VIDE en ${(hist as Noeud).chemin} : ${rendu(contenu)}`,
      );

      // (2) D-1 (L63) : l'etat applicatif PERSISTE. Les trois acteurs de
      //     F-RESERVATION, admis de P1 a P2, sont encore la en P4.
      for (const acteur of ACTEURS) {
        exige(
          objetsDeLActeur(contenu, acteur).length > 0,
          `acteur-${acteur}-present-en-P4`,
          `acteur ${acteur} absent de l'historique metier de P4 : ${rendu(contenu)}`,
        );
      }

      // (3) LE CRENEAU ET LE LOCATAIRE DE LA MIGRATION P4 (L119).
      exige(
        mentionne(contenu, CRENEAU_ID),
        `creneau-${CRENEAU_ID}-present`,
        `creneau ${CRENEAU_ID} absent de l'historique de P4 : ${rendu(contenu)}`,
      );
      exige(
        mentionne(contenu, LOCATAIRE_INITIAL),
        `locataire-${LOCATAIRE_INITIAL}-present`,
        `locataire ${LOCATAIRE_INITIAL} absent de l'historique de P4 (migration L119) : ${rendu(contenu)}`,
      );

      // (4) L'ETAT SCELLE A L'ENTREE DE P4 (L123) : A annule, B confirme,
      //     C en attente. C'est ce qui distingue un historique REEL d'une
      //     collection non vide de faits quelconques.
      for (const acteur of ACTEURS) {
        const attendu = ETAT_P4[acteur];
        const motif = MOTIF_ETAT[attendu];
        exige(
          motif !== undefined,
          `motif-d-etat-connu-pour-${acteur}`,
          `etat scelle « ${attendu} » sans motif declare dans la suite`,
        );
        const objets = objetsDeLActeur(contenu, acteur);
        const textes = objets.flatMap((o) => chaines(o));
        exige(
          textes.some((s) => motif.test(s)),
          `${acteur}-${attendu}-en-P4`,
          `aucun etat « ${attendu} » (motif ${String(motif)}) pour l'acteur ${acteur} en P4 : ${rendu(objets)}`,
        );
      }

      // (5) L'HISTORIQUE PORTE AU MOINS UN FAIT PAR ACTEUR : un historique
      //     reduit a une ligne satisferait (2) sans rien conserver.
      const faits = ACTEURS.reduce((n, a) => n + objetsDeLActeur(contenu, a).length, 0);
      exige(
        faits >= ACTEURS.length,
        `au-moins-${ACTEURS.length}-faits-metier`,
        `${faits} fait(s) metier rattache(s) a un acteur en P4, pour ${ACTEURS.length} acteurs`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T11.A4 la variante ${VARIANTE_FAILURE} conserve ${LIGNES_CONSERVEES} resultats`,
    async () => {
      assertCharge();

      const issue = await lancerDemo({ ...OPTIONS_NOMINALES, variant: VARIANTE_FAILURE });
      exige(issue.ok, `demo-${VARIANTE_FAILURE}-executee`, issue.texte);
      const resultat = issue.resultat as Json;

      const p = periodesDe(resultat);
      exige(p !== null, 'sequence-de-periodes-presente', `AUCUNE-SEQUENCE-DE-PERIODES dans ${rendu(resultat)}`);
      const periodes = (p as Periodes).liste;

      // (1) QUATRE LIGNES CONSERVEES — la valeur scellee, pas un compte devine.
      exige(
        periodes.length === LIGNES_CONSERVEES,
        `${LIGNES_CONSERVEES}-lignes-conservees`,
        `${periodes.length} ligne(s) conservee(s) : ${rendu(periodes.map((x) => champ(x, ALIAS_INDEX)))}`,
      );
      const attendus = Array.from({ length: LIGNES_CONSERVEES }, (_, i) => PREMIER_INDEX + i);
      // Les quatre index sont CONSERVES — l'ordre de la sequence est l'objet de
      // A1, pas de celui-ci : on trie avant de comparer, pour qu'une
      // permutation ne fasse pas rougir deux cas a la fois.
      const ordonnees = [...periodes].sort(
        (a, b) => (nombre(champ(a, ALIAS_INDEX)) ?? 0) - (nombre(champ(b, ALIAS_INDEX)) ?? 0),
      );
      const observes = ordonnees.map((x) => nombre(champ(x, ALIAS_INDEX)));
      exige(
        JSON.stringify(observes) === JSON.stringify(attendus),
        `index-conserves ${JSON.stringify(attendus)}`,
        `index observes ${JSON.stringify(observes)} — un filtre des periodes a Q=0/R=0 se voit ici`,
      );

      // (2) Q=[0,0,0,0] ET R=[0,0,0,0], en nombres exacts (L143) et JAMAIS
      //     null : L121 pose que les exigences et usages y sont presents.
      const qs = ordonnees.map((x) => nombre(champ(x, ['Q', 'q', 'quality', 'qualite'])));
      const rs = ordonnees.map((x) => nombre(champ(x, ['R', 'r', 'reliability', 'reussite', 'usage'])));
      exige(
        JSON.stringify(qs) === JSON.stringify(Q_FAILURE),
        `Q=${JSON.stringify(Q_FAILURE)}`,
        `Q observe ${JSON.stringify(qs)} (null = champ absent ou non numerique)`,
      );
      exige(
        JSON.stringify(rs) === JSON.stringify(R_FAILURE),
        `R=${JSON.stringify(R_FAILURE)}`,
        `R observe ${JSON.stringify(rs)}`,
      );

      // (3) LES COUTS SCELLES, LIGNE PAR LIGNE : [100,50,0,0]. « Un arret de
      //     calcul apres P2 ne supprime pas P3 et P4 ; aucune facture
      //     imaginaire n'y est ajoutee » (L121) — ce sont les deux derniers
      //     zeros, et ils sont compares, pas supposes.
      const couts = ordonnees.map((x) => {
        const c = champProfond(x, ALIAS_COUTS);
        return c === null ? null : nombre(c.valeur);
      });
      exige(
        JSON.stringify(couts) === JSON.stringify(COUTS_FAILURE),
        `couts=${JSON.stringify(COUTS_FAILURE)}`,
        `couts observes ${JSON.stringify(couts)} (cles [${ALIAS_COUTS.join('|')}])`,
      );

      // (4) LE TOTAL : la somme des lignes conservees vaut la valeur scellee.
      //     Conserver K-1 lignes change cette somme ; c'est la perturbation
      //     « arreter la conservation a K-1 » qui doit rougir ici.
      const somme = couts.reduce<number>((a, c) => a + (c ?? Number.NaN), 0);
      exige(
        somme === COUT_TOTAL_FAILURE,
        `somme-des-couts=${COUT_TOTAL_FAILURE}`,
        `somme observee ${String(somme)} sur ${periodes.length} ligne(s)`,
      );

      // (5) L24 + L253 : l'origine des couts est publiee, et elle DIT leur
      //     caractere fictif.
      const origine = champProfond(resultat, [CHAMP_ORIGINE_COUTS]);
      exige(
        origine !== null,
        `${CHAMP_ORIGINE_COUTS}-publie`,
        `${CHAMP_ORIGINE_COUTS} absent du resultat : ${rendu(resultat)}`,
      );
      exige(
        typeof origine?.valeur === 'string' && MOTIF_COUTS_FICTIFS.test(origine.valeur),
        `${CHAMP_ORIGINE_COUTS}-fictif`,
        `${CHAMP_ORIGINE_COUTS} vaut ${rendu(origine?.valeur)}, qui ne dit pas le caractere fictif (motif ${String(MOTIF_COUTS_FICTIFS)})`,
      );
      const provenance = champProfond(resultat, [CHAMP_PROVENANCE]);
      exige(
        provenance !== null,
        `${CHAMP_PROVENANCE}-publie`,
        `${CHAMP_PROVENANCE} absent du resultat (L24) : ${rendu(resultat)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T11.A5 deux executions identiques ont le meme resultat canonique',
    async () => {
      assertCharge();

      const a = await lancerDemo(OPTIONS_NOMINALES);
      // Voir ECART_ENTRE_EXECUTIONS_MS : sans cet ecart, un horodatage injecte
      // dans le resultat canonique reste egal d'une execution a l'autre et la
      // comparaison ci-dessous ne prouve plus rien.
      await attendre(ECART_ENTRE_EXECUTIONS_MS);
      const b = await lancerDemo(OPTIONS_NOMINALES);
      exige(a.ok, 'demo-execution-1', a.texte);
      exige(b.ok, 'demo-execution-2', b.texte);
      const r1 = a.resultat as Json;
      const r2 = b.resultat as Json;

      // (1) LES METADONNEES VOLATILES SONT DECLAREES, pas devinees par le
      //     test. L559 : « les comparaisons canonisent uniquement les ids de
      //     lancement et metadonnees EXPLICITEMENT volatiles ».
      const v1 = volatilesDeclares(r1);
      const v2 = volatilesDeclares(r2);
      exige(
        v1 !== null && v2 !== null,
        'metadonnees-volatiles-declarees',
        `VOLATILES-NON-DECLAREES : cles [${ALIAS_VOLATILES.join('|')}] introuvables (ou valeur non tableau de chaines) ; vu ${rendu(champProfond(r1, ALIAS_VOLATILES)?.valeur)}`,
      );
      exige(
        JSON.stringify(v1) === JSON.stringify(v2),
        'meme-declaration-de-volatiles',
        `declarations differentes : ${rendu(v1)} vs ${rendu(v2)}`,
      );

      const c1 = canoniqueDe(r1, v1 as string[]);
      const c2 = canoniqueDe(r2, v2 as string[]);

      // (2) LA PROJECTION CANONIQUE N'A PAS AVALE LA TRAJECTOIRE. L559
      //     enumere ce qu'elle CONSERVE : projet, scenario, configuration,
      //     budget, repetition, periode et resultat. Sans ce controle, il
      //     suffirait de declarer tout le resultat volatil pour que (3) soit
      //     vraie — c'est exactement le faux PASS que la classe de preuve de
      //     ce cas signale.
      for (const id of IDENTITE) {
        exige(
          champProfond(c1, [id]) !== null,
          `canonique-conserve-${id}`,
          `${id} absent de la projection canonique : ${rendu(c1)}`,
        );
      }
      const pc = periodesDe(c1);
      exige(
        pc !== null && pc.liste.length === K_FAILURE,
        `canonique-conserve-${K_FAILURE}-periodes`,
        `projection canonique : ${String(pc?.liste.length)} periode(s)`,
      );

      // (3) L'EGALITE, sur les octets canoniques de L82.
      const e1 = empreinte(c1);
      const e2 = empreinte(c2);
      exige(
        e1 === e2,
        'resultats-canoniques-identiques',
        `empreintes ${e1.slice(0, 16)} vs ${e2.slice(0, 16)} ; diff visible entre ${court(JSON.stringify(canonique(c1)), 400)} et ${court(JSON.stringify(canonique(c2)), 400)}`,
      );

      // (4) CONTROLE DE DISCRIMINATION. Une implementation qui rendrait une
      //     CONSTANTE satisferait (3) sans rien calculer. Deux trajectoires
      //     differentes doivent donc donner deux resultats canoniques
      //     differents.
      const f = await lancerDemo({ ...OPTIONS_NOMINALES, variant: VARIANTE_FAILURE });
      exige(f.ok, `demo-${VARIANTE_FAILURE}-executee`, f.texte);
      const vf = volatilesDeclares(f.resultat as Json);
      const cf = canoniqueDe(f.resultat as Json, vf ?? []);
      exige(
        empreinte(cf) !== e1,
        'trajectoires-differentes-resultats-differents',
        `la variante ${VARIANTE_FAILURE} rend le MEME resultat canonique que la trajectoire nominale (${e1.slice(0, 16)}) : le resultat ne depend pas de ce qui est execute`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T11.A6 la variante ${VARIANTE_INTERTENANT} fait echouer le controle metier associe`,
    async () => {
      assertCharge();

      // (1) LA TRAJECTOIRE NOMINALE : les controles metier sont publies et
      //     NOMMES (T10, L241), et celui d'isolation intertenant PASSE.
      //     Sans cette moitie, un controle qui echouerait toujours verdirait
      //     le cas sans rien detecter.
      const nominal = await lancerDemo(OPTIONS_NOMINALES);
      exige(nominal.ok, 'demo-nominale-executee', nominal.texte);
      const cn = controlesDe(nominal.resultat);
      exige(
        cn !== null,
        'controles-metier-publies',
        `CONTROLES-ABSENTS : cles [${ALIAS_CONTROLES.join('|')}] introuvables ; ${rendu(nominal.resultat)}`,
      );
      const isoNominal = (cn as { liste: Controle[] }).liste.filter((c) => MOTIF_CONTROLE_ISOLATION.test(c.nom));
      exige(
        isoNominal.length > 0,
        'controle-d-isolation-nomme',
        `aucun controle dont le nom dit l'isolation intertenant (motif ${String(MOTIF_CONTROLE_ISOLATION)}) parmi ${rendu((cn as { liste: Controle[] }).liste.map((c) => c.nom))}`,
      );
      exige(
        isoNominal.every((c) => c.statut === 'VERT'),
        'controle-d-isolation-vert-en-nominal',
        `controle(s) d'isolation non verts sur la trajectoire conforme : ${rendu(isoNominal.map((c) => [c.nom, c.statut]))}`,
      );

      // (2) L123 : le contrat intertenant de la fixture rend NOT_FOUND, sans
      //     donnee metier divulguee. L'essai negatif est donc joue, et son
      //     verdict est inscrit, des la trajectoire conforme.
      const pn = periodesDe(nominal.resultat);
      exige(pn !== null && pn.liste.length === K_FAILURE, `${K_FAILURE}-periodes`, `${String(pn?.liste.length)} periode(s)`);
      const P4n = periodeDIndex((pn as Periodes).liste, K_FAILURE);
      exige(
        P4n !== null,
        `periode-d-index-${K_FAILURE}-designee`,
        `aucune periode unique portant ${ALIAS_INDEX[0]}=${K_FAILURE} : ${rendu((pn as Periodes).liste.map((x) => champ(x, ALIAS_INDEX)))}`,
      );
      exige(
        mentionne(P4n, CODE_INTERTENANT),
        `verdict-${CODE_INTERTENANT}-en-P4`,
        `le verdict intertenant ${CODE_INTERTENANT} (racine gelee) n'apparait pas en P4 : ${rendu(P4n)}`,
      );

      // (3) LA VARIANTE FAUTIVE PRODUIT UN RESULTAT — un plantage n'est pas
      //     une detection.
      const variante = await lancerDemo({ ...OPTIONS_NOMINALES, variant: VARIANTE_INTERTENANT });
      exige(
        variante.ok,
        `variante-${VARIANTE_INTERTENANT}-executee`,
        `la variante n'a pas produit de resultat (un plantage n'est pas une detection) : ${variante.texte}`,
      );
      const cv = controlesDe(variante.resultat);
      exige(
        cv !== null,
        'controles-metier-publies-sous-variante',
        `CONTROLES-ABSENTS sous ${VARIANTE_INTERTENANT} : ${rendu(variante.resultat)}`,
      );

      // (4) L'ASSERTION DECISIVE : le controle associe ECHOUE.
      const isoVariante = (cv as { liste: Controle[] }).liste.filter((c) => MOTIF_CONTROLE_ISOLATION.test(c.nom));
      exige(
        isoVariante.length > 0,
        'controle-d-isolation-nomme-sous-variante',
        `aucun controle d'isolation sous ${VARIANTE_INTERTENANT} parmi ${rendu((cv as { liste: Controle[] }).liste.map((c) => c.nom))}`,
      );
      exige(
        isoVariante.some((c) => c.statut === 'ROUGE'),
        `controle-d-isolation-rouge-sous-${VARIANTE_INTERTENANT}`,
        `la variante ${VARIANTE_INTERTENANT} laisse le controle d'isolation ${rendu(isoVariante.map((c) => [c.nom, c.statut]))} — la lecture intertenant n'est pas detectee`,
      );

      // (5) LA DETECTION EST CIBLEE, pas un echec general : un controle vert
      //     en nominal le reste sous la variante. Une implementation qui
      //     ferait tout echouer satisferait (4) sans rien discriminer.
      const vertsNominal = new Set(
        (cn as { liste: Controle[] }).liste
          .filter((c) => c.statut === 'VERT' && !MOTIF_CONTROLE_ISOLATION.test(c.nom))
          .map((c) => c.nom),
      );
      const encoreVerts = (cv as { liste: Controle[] }).liste.filter(
        (c) => vertsNominal.has(c.nom) && c.statut === 'VERT',
      );
      exige(
        vertsNominal.size > 0,
        'au-moins-un-autre-controle-metier',
        `la trajectoire conforme ne publie aucun controle vert hors isolation : ${rendu((cn as { liste: Controle[] }).liste.map((c) => [c.nom, c.statut]))}`,
      );
      exige(
        encoreVerts.length > 0,
        'detection-ciblee',
        `sous ${VARIANTE_INTERTENANT}, aucun des controles verts en nominal ne le reste : ${rendu((cv as { liste: Controle[] }).liste.map((c) => [c.nom, c.statut]))}`,
      );

      // (6) L'EXIGENCE VIOLEE EST NOMMEE EN P4 (F-REGRESSION, racine gelee :
      //     `isolation@1` satisfaite en P3 puis violee en P4).
      const pv = periodesDe(variante.resultat);
      exige(pv !== null && pv.liste.length === K_FAILURE, `${K_FAILURE}-periodes-sous-variante`, `${String(pv?.liste.length)} periode(s)`);
      const P4v = periodeDIndex((pv as Periodes).liste, K_FAILURE);
      exige(
        P4v !== null,
        `periode-d-index-${K_FAILURE}-designee-sous-variante`,
        `aucune periode unique portant ${ALIAS_INDEX[0]}=${K_FAILURE} sous ${VARIANTE_INTERTENANT}`,
      );
      exige(
        mentionneExigence(P4v, EXIGENCE_ISOLATION),
        `${EXIGENCE_ISOLATION}-nommee-en-P4`,
        `l'exigence ${EXIGENCE_ISOLATION} n'est pas nommee en P4 sous ${VARIANTE_INTERTENANT} : ${rendu(P4v)}`,
      );

      // (7) L253 : ce jalon « ne valide ni persistence reelle ni isolation ».
      //     La limite APPARAIT DANS LE RESULTAT — c'est une exigence du
      //     cahier, et elle interdit de lire la detection ci-dessus comme une
      //     preuve d'isolation reelle.
      const limites = champProfond(variante.resultat, ALIAS_LIMITES);
      exige(
        limites !== null,
        'limite-du-jalon-publiee',
        `LIMITE-ABSENTE : cles [${ALIAS_LIMITES.join('|')}] introuvables ; L253 exige que la limite apparaisse dans le resultat`,
      );
      const texteLimites = chaines((limites as Noeud).valeur).join(' § ');
      exige(
        MOTIF_LIMITE_PERSISTANCE.test(texteLimites) && MOTIF_LIMITE_ISOLATION.test(texteLimites),
        'limite-nomme-persistance-et-isolation',
        `la limite publiee ne nomme pas les deux reserves de L253 : ${court(texteLimites, 300)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
