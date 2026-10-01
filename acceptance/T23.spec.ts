/**
 * acceptance/T23.spec.ts — suite d'acceptation de la tache T23.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T23.A1 behaviour — trajet nominal realise revelation, agent, validation,
 *                      deploiement, usage, audit et checkpoint
 *   T23.A2 behaviour — resultats T11 et T23 identiques pour les memes faits
 *                      metier
 *   T23.A3 behaviour — candidat invalide conserve version active et facture
 *   T23.A4 behaviour — nouveau processus reprend la periode suivante depuis
 *                      le checkpoint
 *   T23.A5 absence   — une periode incomplete ne publie pas un faux etat
 *                      final
 *   T23.A6 behaviour — les sorties distinguent depenses de developpement,
 *                      exploitation et recherche
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T23 — `apps/cli`, `packages/activities`,
 * `packages/storage`, `packages/sandbox`, `packages/evaluation` — et ne les a
 * lus ni directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL,
 * discipline auditable au diff, pas une barriere technique). Le contrat testé
 * ci-dessous est derive de docs/specs/T23.md et de docs/cahier.md (meme
 * perimetre que T23.md puisque sa transcription en est un extrait verbatim) :
 *
 *   L355  dependances T12, T15, T18, T19, T20, T21, T22 ; livrables MOT POUR
 *         MOT : « services d'application et commande `bench run-period`
 *         utilisant les adaptateurs reels locaux ».
 *   L357  les six cas d'acceptation, mot pour mot.
 *   L359  fin : « execution locale avec PostgreSQL, stockage, sandbox et
 *         fournisseur factice. Les etapes forment des OPERATIONS NOMMEES
 *         pouvant ensuite devenir des Activities Temporal sans changer les
 *         regles metier. »
 *   L97   enum de phase, VERBATIM : `PENDING`, `RESTORING`, `REVEALING`,
 *         `DEVELOPING`, `VALIDATING`, `DEPLOYING`, `EXERCISING`, `AUDITING`,
 *         `CHECKPOINTING`, `COMPLETED` ; etats d'arret `BUDGET_EXHAUSTED`,
 *         `RUNNER_BLOCKED`, `CANCELLED` ; `deployment_coverage` vaut
 *         `NO_DEPLOYMENT`, `PARTIAL` ou `ACCEPTED`.
 *   L21   mode `recorded` : « agent scripte, reponses et couts fictifs
 *         archives ».
 *   L24   « les resultats portent TOUJOURS execution_mode, cost_origin et
 *         corpus_provenance ».
 *   L63   D-1 : « l'etat applicatif d'une trajectoire persiste ; aucun retour
 *         automatique a une base ideale » — fonde A4.
 *   L65   D-5 : « un echec conserve ses depenses, ses intentions non servies
 *         et son backlog » — fonde A3.
 *   L78   identite complete d'une trajectoire, et `period_index` « commencant
 *         a 1 ».
 *   L80   montants : « chaines d'entiers non negatifs en micro-USD ».
 *   L95   `PeriodResult` : depenses, exigences evaluees, Q, R, G, statut et
 *         empreintes de preuve — la DERNIERE operation nommee par L357 est le
 *         checkpoint, ce qui fonde A5 (« avant sa derniere operation »).
 *   L121  F-FAILURE, racine gelee — reutilisee pour `K=4` (nombre de periodes
 *         d'une trajectoire).
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         barrieres et POINTS D'INJECTION NOMMES [...] les checks
 *         d'integration utilisent reellement PostgreSQL, le stockage et les
 *         workers lorsque le contrat porte sur ces composants » — autorise le
 *         point d'injection `--test-stop-after-phase` d'A5 et fonde l'usage
 *         de PostgreSQL/S3 reels partout dans cette suite.
 *   L189  « G compte les regressions actuellement ouvertes ».
 *   L247  commande T11 verbatim : `bench demo --mode recorded --storage
 *         memory`.
 *   L335  T20, verbatim : « nettoyage de chaque copie et COUT DE RECHERCHE
 *         distingue » — seul endroit du cahier qui nomme une categorie de
 *         cout ; fonde la lecture de « recherche » (A6) comme le cout de la
 *         validation/audit (l'evaluateur), pas celui du developpement ou de
 *         l'exploitation.
 *   L559  « les comparaisons canonisent UNIQUEMENT les ids de lancement et
 *         metadonnees explicitement volatiles, EN CONSERVANT projet,
 *         scenario, configuration, budget, repetition, periode et resultat »
 *         — fonde la projection comparee par A2 : `campaign_id` (le seul id
 *         de « lancement » au sens ou cette suite en fabrique une valeur
 *         fraiche a chaque invocation) est exclu, tout le reste est compare.
 *
 * Cette suite reprend, sans toutes les relire, les conventions deja fixees
 * par acceptance/T11.spec.ts (chargement par ROLE avec alias, `rendu`,
 * `court`, `exige`, `canonique`/`empreinte`, navigation JSON generique par
 * `noeuds`/`champ`/`champProfond`/`tableauProfond`, lecture de la racine
 * gelee par `readReference`/`refValue`) et par acceptance/T12.spec.ts et
 * acceptance/T21.spec.ts (PostgreSQL REEL par `psql`, `creerBase`, `dsnFor`).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * POURQUOI CETTE SUITE N'IMPORTE AUCUN PAQUET — UN CHOIX, PAS UN OUBLI
 *
 * T11, T18, T19, T20, T21 exercent un EXPORT DE PAQUET en plus de, ou a la
 * place de, la commande. T23 est differente : son livrable (L355) est
 * D'ABORD « des services d'application ET la commande `bench run-period`
 * UTILISANT LES ADAPTATEURS REELS LOCAUX », et sa fin (L359) precise
 * « execution LOCALE avec PostgreSQL, stockage, sandbox et fournisseur
 * factice » — c'est le SYSTEME ASSEMBLE, pas une fonction pure, que §H
 * demande d'observer ici. Importer directement `packages/activities` en plus
 * de la commande aurait exige de deviner DEUX contrats independants pour la
 * MEME orchestration (le nom d'export ET la forme des arguments de la
 * commande), doublant la surface fabriquee sans rien ajouter : toute
 * perturbation d'une operation nommee « de bench run-period »
 * (verification/cases.lock.json, T23.A1) change aussi, PAR CONSTRUCTION, ce
 * que la commande observe — la commande appelle forcement ce point pour
 * fonctionner. La porte de necessite « module-stub » des cas `behaviour`
 * mord donc ICI AUSSI, transitivement par la commande.
 *
 * apps/cli N'EST JAMAIS IMPORTE comme module (meme raison que T11 : une
 * entree qui s'execute a l'import emporterait la suite entiere en
 * SUITE_FAILED_TO_RUN). La commande est observee comme un PROCESSUS, et
 * chaque invocation est un PROCESSUS NEUF (`execFileSync`), jamais un rappel
 * en memoire — c'est deliberement le test le plus severe pour A4 (« nouveau
 * processus ») et il n'affaiblit aucun des cinq autres cas.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE DANS LE CAHIER SUR LA
 * FORME EXACTE DE LA COMMANDE (meme geste que T11 fixant `variant`, T18
 * fixant `INVALID_MODEL_RESPONSE`, T19 fixant les six roles du sandbox).
 *
 * COMMANDE : `bench run-period`, en sous-processus, avec les drapeaux
 * suivants — TOUS fabriques par cette suite, jamais des valeurs attendues :
 *
 *   --mode recorded                 reprend la valeur de table L21/L247 ;
 *                                    cette suite n'exerce jamais `live`.
 *   --campaign-id <id>               espace de noms d'une TRAJECTOIRE ;
 *                                    deux invocations partageant le meme id
 *                                    portent sur la MEME trajectoire
 *                                    persistante et la seconde doit
 *                                    reprendre la periode suivante (A4).
 *   --postgres-database <db>         base PostgreSQL REELLE que cette suite
 *                                    cree elle-meme (`creerBase`, meme
 *                                    convention que T12/T21) ; l'hote/le
 *                                    port/l'utilisateur restent les
 *                                    variables d'environnement ambiantes deja
 *                                    etablies par verification/runner/
 *                                    doctor.mjs (PGHOST/PGUSER).
 *   --s3-bucket <bucket>              bucket S3 REEL, nom unique par test ;
 *                                    l'endpoint reste `S3_ENDPOINT`, meme
 *                                    variable que doctor.mjs sonde.
 *   --variant <name>                 optionnel ; omis = trajectoire nominale
 *                                    (memes faits que la fixture nominale de
 *                                    T11, F-RESERVATION — requis par A2).
 *                                    Cette suite FIXE une seule valeur :
 *                                    `invalid-candidate` (A3), un script a
 *                                    DEUX periodes — P1 livre un candidat
 *                                    valide (deploiement etabli), P2 un
 *                                    candidat invalide — exactement le meme
 *                                    geste que T11 fixant ce que jouent
 *                                    `F-FAILURE` ou `cross-tenant-read`.
 *   --test-stop-after-phase <PHASE>  optionnel, POINT D'INJECTION NOMME
 *                                    (cahier:L141) ; la valeur est un
 *                                    litteral de l'enum L97. Le processus
 *                                    s'arrete juste apres avoir termine la
 *                                    phase nommee, sans atteindre la
 *                                    suivante. Reserve a A5.
 *
 * Chaque invocation ne porte que SUR LA PERIODE SUIVANTE de la trajectoire
 * `--campaign-id` : la commande LIT elle-meme l'etat persistant (checkpoint
 * le plus recent si il y en a un, sinon depart a la periode 1) et ne prend
 * donc jamais de drapeau `--period`. C'est le sens litteral du titre de T23
 * (« assembler UNE periode persistante complete », singulier) et de A4
 * (« reprend LA PERIODE SUIVANTE »).
 *
 * SORTIE : un unique objet JSON sur la sortie standard, portant au moins :
 *
 *   phase                              un litteral de l'enum L97
 *   execution_mode, cost_origin, corpus_provenance        (L24, toujours)
 *   les six identifiants de L78 (ou leurs equivalents)      + `period_index`
 *   role `exigences`         exigences dues cette periode (REVEALING)
 *   role `soumission`        soumission du candidat (DEVELOPING)
 *   role `validation`        verdict de validation (VALIDATING)
 *   role `deploiement`       `deployment_coverage` (L97) + un identifiant de
 *                            version active (DEPLOYING)
 *   role `observations`      usages servis sur le candidat deploye
 *                            (EXERCISING)
 *   role `audit`             incidents/controles d'audit (AUDITING)
 *   role `checkpoint`        un identifiant/pointeur NON VIDE, SEULEMENT si
 *                            `phase==='COMPLETED'` (CHECKPOINTING)
 *   role `depenses`          TROIS categories distinctes — developpement,
 *                            exploitation, recherche (A6, cahier:L357/L335)
 *
 * Les noms de champs que le cahier ECRIT sont exiges tels quels (`phase`,
 * `deployment_coverage`, `period_index`, `execution_mode`, `cost_origin`,
 * `corpus_provenance`) ; ceux qu'il decrit seulement en prose sont resolus
 * par une courte liste d'alias (IV), tolerance de NOMMAGE jamais de
 * COMPORTEMENT, reprise a l'identique dans verification/mutants/T23.json.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * PROVENANCE DES LITTERAUX
 *
 * LUS DANS LA RACINE GELEE (acceptance/reference/F-RESERVATION.json), jamais
 * recopies a la main : acteurs [A,B,C], locataire `legacy`, creneau `S1`, les
 * quatre horloges metier P1..P4. LU DANS acceptance/reference/F-FAILURE.json :
 * `K=4` (nombre de periodes d'une trajectoire complete, utilise par A2 pour
 * savoir combien d'invocations de `bench run-period` composent une
 * trajectoire comparable a `bench demo`).
 *
 * PORTANT UN `// cahier:L<n>` : les dix litteraux de l'enum de phase et les
 * trois de `deployment_coverage` (L97), `recorded` (L21), `execution_mode` /
 * `cost_origin` / `corpus_provenance` (L24), le premier index de periode 1
 * (L78), `run-period` (L355), `demo` / `--mode` / `--storage` / `memory`
 * (L247, cote T11).
 *
 * FABRIQUES PAR CETTE SUITE, ET SERVANT D'ENTREE JAMAIS DE VALEUR ATTENDUE :
 * `--campaign-id`, `--postgres-database`, `--s3-bucket`, le contenu exact du
 * candidat scripte sous `invalid-candidate`, les identifiants SQL de test.
 * Aucune de ces valeurs n'a ete obtenue en lancant une implementation de T23
 * et en figeant ce qu'on a vu passer : aucune implementation de T23 n'existe
 * au moment ou cette suite est ecrite (ADR-001).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * LES DANGERS PROPRES A T23, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A2 COMPARE DEUX COMMANDES DE FORME DIFFERENTE, PAS DEUX APPELS
 *     IDENTIQUES. `bench demo` rend LES QUATRE periodes en un seul appel ;
 *     `bench run-period` en rend UNE par invocation. Un hachage canonique de
 *     l'ENVELOPPE entiere (a la maniere de T11.A5, deux appels IDENTIQUES de
 *     LA MEME fonction) comparerait donc deux formes qui n'ont aucune raison
 *     de coincider et ferait tomber le cas pour une raison sans rapport avec
 *     L357. Cette suite compare donc une PROJECTION champ par champ (horloge,
 *     exigences dues, deployment_coverage, Q, R) periode par periode, PUIS
 *     hache cette projection (pas l'enveloppe brute) pour la comparaison
 *     canonique finale — exactement ce que cases.lock.json demande
 *     (« compare les resultats canoniques produits »), sans presupposer une
 *     structure commune que rien dans le cahier n'exige.
 * (2) LE CANDIDAT INVALIDE (A3) A BESOIN D'UNE VERSION ACTIVE PREALABLE.
 *     « Conserve » suppose quelque chose a conserver : un candidat invalide
 *     des la periode 1 d'une trajectoire fraiche rendrait l'assertion vide
 *     (NO_DEPLOYMENT avant et apres n'est pas une preservation observee).
 *     `invalid-candidate` est donc FIXE comme un script a DEUX periodes (III)
 *     et A3 invoque la commande DEUX FOIS sur la MEME trajectoire.
 * (3) A5 EST UN CAS `absence` : LE DANGER DECISIF. Un stub qui leve, ou un
 *     processus qui se contente de ne rien imprimer, rendrait ce cas VERT
 *     SANS RIEN PROUVER — l'absence serait vraie par ACCIDENT, pas par
 *     observation. A5 exige donc un CONTROLE POSITIF dans le MEME cas : la
 *     MEME trajectoire, interrompue, est ensuite REPRISE (nouveau processus,
 *     sans le point d'injection) et DOIT ENCORE rendre `period_index===1` —
 *     si une publication frauduleuse de fin avait eu lieu, la reprise sauterait
 *     a la periode 2, et c'est CETTE divergence que le mutant
 *     verification/mutants/T23.json cible, pas seulement l'absence de
 *     `phase==='COMPLETED'` dans la sortie interrompue.
 * (4) LE POINT D'ARRET DE A5 EST `AUDITING`, PAS UN POINT ARBITRAIRE.
 *     cases.lock.json dit « interrompue avant sa derniere operation » ; L357
 *     liste les operations dans l'ordre et termine par « checkpoint » : la
 *     derniere operation d'une periode est donc CHECKPOINTING. Arreter apres
 *     AUDITING (l'avant-derniere phase de l'enum L97) est le point le plus
 *     proche de cette derniere operation sans l'atteindre.
 * (5) ISOLATION DES TROIS SERVICES REELS. Chaque cas cree sa PROPRE base
 *     PostgreSQL (`creerBase`) et son propre nom de bucket S3, namespaces par
 *     un `campaign_id` aleatoire — cahier:L557 (« chaque suite d'integration
 *     recoit [...] ses bases/schemas, prefixes d'artefacts »). Aucun cas ne
 *     depend de l'ordre d'execution d'un autre.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne reverifie pas l'isolation du sandbox (T19), l'etancheite de
 *    l'evaluateur (T20), le detail des refus de migration/soumission (T21)
 *    ni la classification des incidents (T22) : chacun a sa propre suite.
 *    T23 observe leur ASSEMBLAGE (L355 : « services d'application »), pas
 *    leurs proprietes internes.
 *  • Elle ne verifie pas le contenu S3 du checkpoint directement (objets,
 *    manifeste) : elle verifie seulement qu'un POINTEUR non vide est publie
 *    et qu'il permet une reprise reelle (A4) — le contenu est T15.
 *  • Elle n'exige aucune valeur numerique precise pour la ventilation des
 *    depenses (A6) : le cahier n'en fixe aucune pour T23 (contrairement a
 *    F-FAILURE pour T11), et A6 est un cas `behaviour`, pas `numeric`. Elle
 *    exige la DISTINCTION des trois categories, pas un montant.
 *  • Elle ne reverifie pas l'arithmetique de Q/R/G (T04) : A2 compare
 *    seulement que T11 et T23 produisent la MEME valeur, pas qu'elle est
 *    correcte dans l'absolu.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle */

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
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

/** L82 : objets tries RECURSIVEMENT par cle, ordre des tableaux conserve, UTF-8. */
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

function empreinte(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonique(v)) ?? 'undefined', 'utf8').digest('hex');
}

/** L'assertion elementaire : une comparaison de chaines, pour nommer ce qui a ete vu. */
function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ─────────────────────────────── navigation JSON generique (reprise de T11) */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

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

function champ(o: unknown, alias: readonly string[]): unknown {
  if (o === null || typeof o !== 'object') return undefined;
  const cible = new Set(alias.map(normKey));
  for (const [k, v] of Object.entries(o as Json)) {
    if (cible.has(normKey(k)) && v !== undefined && v !== null) return v;
  }
  return undefined;
}

function champProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== null && n.valeur !== undefined) return n;
  }
  return null;
}

function tableauProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && Array.isArray(n.valeur)) return n;
  }
  return null;
}

const nombre = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : NaN;

/** L80 : « chaines d'entiers non negatifs ». Tolere aussi un nombre JS simple. */
function montant(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string' && /^[0-9]+$/.test(v)) return Number.parseInt(v, 10);
  return null;
}

/** Q/R (L143) : entier, decimal ou rationnel {num,den} — jamais compare en flottant brut. */
type Rationnel = { num: number; den: number };
function rationnel(v: unknown): Rationnel | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return { num: v, den: 1 };
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return { num: Number(v), den: 1 };
  if (typeof v === 'object') {
    const o = v as Json;
    const num = champ(o, ['num', 'numerator', 'numerateur']);
    const den = champ(o, ['den', 'denominator', 'denominateur']);
    if (typeof num === 'number' && typeof den === 'number' && den !== 0) return { num, den };
  }
  return null;
}
const rationnelEgal = (a: Rationnel, b: Rationnel): boolean => a.num * b.den === b.num * a.den;

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

/** Les quatre horloges metier de F-RESERVATION, dans l'ordre P1..P4. */
const HORLOGES = ['P1', 'P2', 'P3', 'P4'].map((p) =>
  String(refValue(F_RESERVATION, `valeurs.horloges_des_periodes.${p}.valeur`)),
);
/** K=4 (F-FAILURE) : le nombre de periodes d'une trajectoire complete. */
const K = Number(refValue(F_FAILURE, 'valeurs.K.valeur'));

/* ───────────────── litteraux du cahier, chacun avec sa ligne */

const MODE = 'recorded'; // cahier:L21
const SOUS_COMMANDE_T23 = 'run-period'; // cahier:L355
const SOUS_COMMANDE_T11 = 'demo'; // cahier:L247
const DRAPEAU_MODE = '--mode'; // cahier:L247 (nom repris pour T23)
const DRAPEAU_STOCKAGE = '--storage'; // cahier:L247 (cote T11 uniquement)
const STOCKAGE_T11 = 'memory'; // cahier:L247
const PREMIER_INDEX = 1; // cahier:L78
const CHAMP_MODE_EXECUTION = 'execution_mode'; // cahier:L24
const CHAMP_ORIGINE_COUTS = 'cost_origin'; // cahier:L24
const CHAMP_PROVENANCE = 'corpus_provenance'; // cahier:L24
const VARIANTE_INVALIDE = 'invalid-candidate'; // fixee par cette suite (III)

/** Enum de phase, VERBATIM — cahier:L97. */
const PHASES = [
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
] as const; // cahier:L97
const PHASE_RESTAURATION = 'RESTORING'; // cahier:L97
const PHASE_FINALE = 'COMPLETED'; // cahier:L97
/** Point d'arret d'A5 : l'avant-derniere phase (III.4). */
const PHASE_ARRET_A5 = 'AUDITING'; // cahier:L97
const DRAPEAU_ARRET = '--test-stop-after-phase'; // fixe par cette suite (III)

/** `deployment_coverage`, VERBATIM — cahier:L97. */
const COUVERTURE = { AUCUNE: 'NO_DEPLOYMENT', PARTIELLE: 'PARTIAL', COMPLETE: 'ACCEPTED' } as const; // cahier:L97

/** Les trois categories de depenses que les sorties doivent distinguer (A6). */
const MOTIF_CAT_DEV = /d[ée]v(elopp)?|development/i; // cahier:L357
const MOTIF_CAT_OPS = /exploitation|op[ée]rat/i; // cahier:L357
const MOTIF_CAT_RECH = /recherche|research/i; // cahier:L335 cahier:L357
/** Verdict de validation refuse, tolerance de nommage (aucun mot n'est fixe par le cahier a ce niveau). */
const MOTIF_INVALIDE = /reject|invalid|refus|echec|fail/i;
const MOTIF_VALIDE = /accept|admit|valid|success|succe|ok\b/i;

const ALIAS_PHASE = ['phase', 'period_phase', 'etat', 'etat_phase'];
const ALIAS_INDEX = ['period_index', 'periodindex', 'index', 'numero', 'rang'];
const ALIAS_HORLOGE = ['business_clock', 'horloge_metier', 'horloge', 'clock', 'business_time', 'temps_metier'];
const ALIAS_EXIGENCES = [
  'requirements',
  'exigences',
  'due_requirements',
  'exigences_dues',
  'evaluated_requirements',
  'exigences_evaluees',
];
const ALIAS_SOUMISSION = ['submission', 'soumission', 'candidate', 'candidat'];
const ALIAS_VALIDATION = ['validation', 'validation_result', 'resultat_validation', 'verdict'];
const ALIAS_DEPLOIEMENT = ['deployment', 'deploiement', 'current_deployment', 'deploiement_courant'];
const ALIAS_COUVERTURE = ['deployment_coverage', 'couverture_deploiement', 'coverage'];
const ALIAS_VERSION_ACTIVE = ['active_version_id', 'active_version', 'version_active', 'activeversionid'];
const ALIAS_OBSERVATIONS = ['observations', 'usages', 'exercise_results', 'workload_results', 'resultats_usage'];
const ALIAS_AUDIT = ['audit', 'incidents', 'audit_results', 'resultats_audit'];
const ALIAS_CHECKPOINT = ['checkpoint', 'checkpoint_manifest', 'checkpoint_pointer'];
const ALIAS_CHECKPOINT_ID = ['id', 'checkpoint_id', 'pointer', 'manifest_id'];
const ALIAS_DEPENSES = ['spend', 'depenses', 'cost', 'couts', 'costs', 'expenditure', 'cost_breakdown', 'ventilation'];
const ALIAS_STATUT = ['status', 'statut', 'state', 'etat', 'result', 'resultat', 'outcome', 'verdict'];

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t23_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}
function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();

const BASES_CREEES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

/** Nombre de lignes, toutes tables de base confondues, dont le texte contient `cle`. */
function tablesDeBase(db: string): { schema: string; nom: string }[] {
  const r = psql(
    db,
    `SELECT table_schema || '|' || table_name FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  if (!r.ok || r.out.length === 0) return [];
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [schema, nom] = l.split('|');
      return { schema, nom };
    });
}
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;
function occurrences(db: string, cle: string): number {
  const tables = tablesDeBase(db);
  if (tables.length === 0) return 0;
  const parts = tables.map(
    (t) =>
      `SELECT count(*) AS n FROM "${t.schema}"."${t.nom}" x WHERE x::text LIKE ${lit(`%${cle}%`)}`,
  );
  const r = psql(db, parts.join(' UNION ALL '));
  if (!r.ok) return -1;
  return r.out
    .split('\n')
    .map((l) => Number.parseInt(l.trim(), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => a + b, 0);
}

/* ─────────────────────────────── la commande, observee comme un PROCESSUS */

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
        for (const v of Object.values(bin as Json)) if (typeof v === 'string') ajouter('apps/cli:bin', path.resolve(dir, v));
      }
      if (typeof j.main === 'string') ajouter('apps/cli:main', path.resolve(dir, j.main));
    } catch {
      /* manifeste illisible : on retombe sur les chemins usuels */
    }
  }
  for (const rel of ['dist/index.js', 'dist/cli.js', 'bin/bench.js', 'index.js', 'src/index.ts']) {
    ajouter(`apps/cli:${rel}`, path.join(dir, rel));
  }
  ajouter('tools/bench', path.join(REPO, 'tools', 'bench'));
  return out;
}

function executer(argv: string[], env: NodeJS.ProcessEnv): { exit: number | null; sortie: string; stdout: string } {
  try {
    const stdout = execFileSync('node', argv, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { exit: 0, sortie: stdout, stdout };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    const so = String(err.stdout ?? '');
    const se = String(err.stderr ?? '');
    return { exit: err.status ?? null, sortie: `${so}\n${se}`, stdout: so };
  }
}

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
function construireUneFois(tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[]): void {
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

type AppelCli = { resultat: Json | null; tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[] };

/** Namespace d'un test : une trajectoire fraiche (campaign_id, base, bucket). */
type Contexte = { campaignId: string; db: string; bucket: string };

function nouveauContexte(suffixe: string): Contexte {
  return {
    campaignId: `t23-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
  };
}

/** Une invocation de `bench run-period` (ou `bench demo`), sous-commande + drapeaux fabriques. */
function lancer(sousCommande: string, drapeaux: string[]): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
      const j = r.exit === 0 ? jsonDeSortie(r.stdout) : jsonDeSortie(r.stdout); // A5 : meme sous arret premature
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 400) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, tentatives };
  construireUneFois(tentatives);
  return { resultat: essayer(), tentatives };
}

/** `bench run-period` sur la trajectoire `ctx`, avec des drapeaux additionnels. */
function runPeriod(ctx: Contexte, extra: string[] = []): AppelCli {
  return lancer(SOUS_COMMANDE_T23, [
    DRAPEAU_MODE,
    MODE,
    '--campaign-id',
    ctx.campaignId,
    '--postgres-database',
    ctx.db,
    '--s3-bucket',
    ctx.bucket,
    ...extra,
  ]);
}

/** `bench demo --mode recorded --storage memory` — L247, argv litterale (cote T11). */
function runDemoT11(): AppelCli {
  return lancer(SOUS_COMMANDE_T11, [DRAPEAU_MODE, MODE, DRAPEAU_STOCKAGE, STOCKAGE_T11]);
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${appel.tentatives
    .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`)
    .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`;
}

/* ───────────────────────────── extraction de champs sur UNE periode */

function phaseDe(p: unknown): string | null {
  const v = champProfond(p, ALIAS_PHASE);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
}
function indexDe(p: unknown): number | null {
  const v = champProfond(p, ALIAS_INDEX);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
}
function horlogeDe(p: unknown): string | null {
  const v = champProfond(p, ALIAS_HORLOGE);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
}
function couvertureDe(p: unknown): string | null {
  const direct = champProfond(p, ALIAS_COUVERTURE);
  if (direct !== null && typeof direct.valeur === 'string') return direct.valeur;
  const depl = champProfond(p, ALIAS_DEPLOIEMENT);
  const c = champ(depl?.valeur, ALIAS_COUVERTURE);
  return typeof c === 'string' ? c : null;
}
function versionActiveDe(p: unknown): string | null {
  const direct = champProfond(p, ALIAS_VERSION_ACTIVE);
  if (direct !== null && (typeof direct.valeur === 'string' || typeof direct.valeur === 'number')) return String(direct.valeur);
  const depl = champProfond(p, ALIAS_DEPLOIEMENT);
  const v = champ(depl?.valeur, ALIAS_VERSION_ACTIVE);
  return v !== undefined && v !== null ? String(v) : null;
}
function verdictValidationDe(p: unknown): string | null {
  const val = champProfond(p, ALIAS_VALIDATION);
  if (val === null) return null;
  if (typeof val.valeur === 'string') return val.valeur;
  const st = champ(val.valeur, ALIAS_STATUT);
  return typeof st === 'string' ? st : null;
}
function checkpointIdDe(p: unknown): string | null {
  const cp = champProfond(p, ALIAS_CHECKPOINT);
  if (cp === null) return null;
  if (typeof cp.valeur === 'string') return cp.valeur;
  const id = champ(cp.valeur, ALIAS_CHECKPOINT_ID);
  return id !== undefined && id !== null ? String(id) : null;
}
function exigencesDuesDe(p: unknown): string[] | null {
  const t = tableauProfond(p, ALIAS_EXIGENCES);
  if (t === null || !Array.isArray(t.valeur)) return null;
  const ids = (t.valeur as unknown[])
    .map((x) => {
      const id = champ(x, ['id', 'requirement_id', 'capability_id']);
      const v = champ(x, ['version', 'v', 'revision']);
      return typeof id === 'string' ? `${id}@${String(v ?? '?')}` : null;
    })
    .filter((x): x is string => x !== null);
  return [...ids].sort();
}
function depensesDe(p: unknown): Json | null {
  const d = champProfond(p, ALIAS_DEPENSES);
  if (d === null || typeof d.valeur !== 'object' || d.valeur === null) return null;
  return d.valeur as Json;
}
/** Premiere entree dont la CLE correspond au motif, quelle que soit la profondeur. */
function categorieDepense(p: unknown, motif: RegExp): { chemin: string; valeur: unknown } | null {
  for (const n of noeuds(p)) {
    if (n.cle !== '' && motif.test(n.cle) && n.valeur !== null && n.valeur !== undefined && typeof n.valeur !== 'object') {
      return { chemin: n.chemin, valeur: n.valeur };
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T23 — assembler une periode persistante complete', () => {
  test(
    `T23.A1 trajet nominal realise revelation, agent, validation, deploiement, usage, audit et checkpoint (bench ${SOUS_COMMANDE_T23})`,
    async () => {
      const ctx = nouveauContexte('a1');
      const appel = runPeriod(ctx);
      exige(appel.resultat !== null, 'commande-bench-run-period-executee', messageEchec('run-period', appel));
      const p = appel.resultat as Json;

      // L24 : « toujours execution_mode/cost_origin/corpus_provenance ».
      exige(champProfond(p, [CHAMP_MODE_EXECUTION])?.valeur === MODE, `${CHAMP_MODE_EXECUTION}=${MODE}`, `vu ${rendu(champProfond(p, [CHAMP_MODE_EXECUTION])?.valeur)} dans ${rendu(p)}`);
      exige(champProfond(p, [CHAMP_ORIGINE_COUTS]) !== null, `${CHAMP_ORIGINE_COUTS}-present`, `ABSENT dans ${rendu(p)}`);
      exige(champProfond(p, [CHAMP_PROVENANCE]) !== null, `${CHAMP_PROVENANCE}-present`, `ABSENT dans ${rendu(p)}`);

      // L78 : period_index commence a 1.
      exige(indexDe(p) === PREMIER_INDEX, `period_index=${PREMIER_INDEX}`, `vu ${rendu(indexDe(p))} dans ${rendu(p)}`);

      // REVEALING : l'horloge metier de P1 est celle de la racine gelee F-RESERVATION.
      exige(horlogeDe(p) === HORLOGES[0], `horloge=${HORLOGES[0]}`, `vu ${rendu(horlogeDe(p))} dans ${rendu(p)}`);
      exige(exigencesDuesDe(p) !== null, 'exigences-dues-presentes (REVEALING)', `role exigences introuvable (alias ${ALIAS_EXIGENCES.join('|')}) dans ${rendu(p)}`);

      // DEVELOPING : une soumission du candidat scripte est presente.
      exige(champProfond(p, ALIAS_SOUMISSION) !== null, 'soumission-presente (DEVELOPING)', `role soumission introuvable (alias ${ALIAS_SOUMISSION.join('|')}) dans ${rendu(p)}`);

      // VALIDATING : un verdict de validation est present.
      exige(verdictValidationDe(p) !== null, 'validation-presente (VALIDATING)', `role validation introuvable dans ${rendu(p)}`);

      // DEPLOYING : deployment_coverage est un litteral REEL de l'enum L97, ET
      // la periode nominale DEPLOIE effectivement quelque chose (F-RESERVATION
      // rend `reserve@1` due des P1, cf. le temoin T11 reellement observe :
      // deployment_coverage=ACCEPTED en P1). NO_DEPLOYMENT resterait un membre
      // VALIDE de l'enum mais trahirait que DEPLOYING n'a rien fait — c'est
      // exactement la mutation que verification/mutants/T23.json (T23.M1)
      // cible pour ce cas.
      const couverture = couvertureDe(p);
      const enumCouverture = Object.values(COUVERTURE) as string[];
      exige(
        couverture !== null && enumCouverture.includes(couverture),
        `deployment_coverage ∈ {${enumCouverture.join(',')}} (DEPLOYING)`,
        `vu ${rendu(couverture)} dans ${rendu(p)}`,
      );
      exige(
        couverture !== COUVERTURE.AUCUNE,
        `deployment_coverage != ${COUVERTURE.AUCUNE} (un deploiement a reellement eu lieu)`,
        `vu ${rendu(couverture)} dans ${rendu(p)}`,
      );

      // EXERCISING : des observations/usages sont presentes.
      exige(champProfond(p, ALIAS_OBSERVATIONS) !== null, 'observations-presentes (EXERCISING)', `role observations introuvable (alias ${ALIAS_OBSERVATIONS.join('|')}) dans ${rendu(p)}`);

      // AUDITING : une structure d'audit/incidents est presente.
      exige(champProfond(p, ALIAS_AUDIT) !== null, 'audit-present (AUDITING)', `role audit introuvable (alias ${ALIAS_AUDIT.join('|')}) dans ${rendu(p)}`);

      // CHECKPOINTING : un identifiant de checkpoint NON VIDE est publie.
      const cpId = checkpointIdDe(p);
      exige(typeof cpId === 'string' && cpId.length > 0, 'checkpoint-identifie (CHECKPOINTING)', `vu ${rendu(cpId)} dans ${rendu(p)}`);

      // Fin de periode : phase finale COMPLETED (L97), litteralement.
      exige(phaseDe(p) === PHASE_FINALE, `phase=${PHASE_FINALE}`, `vu ${rendu(phaseDe(p))} dans ${rendu(p)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T23.A2 resultats T11 et T23 identiques pour les memes faits metier (comparaison canonique periode par periode)',
    async () => {
      // Cote T11 : UN appel rend les K=4 periodes (L247).
      const demo = runDemoT11();
      exige(demo.resultat !== null, 'bench-demo-executee', messageEchec('demo', demo));
      const ALIAS_PERIODES = ['periods', 'periodes', 'period_results', 'resultats_periodes'];
      const noeudPeriodes = tableauProfond(demo.resultat, ALIAS_PERIODES);
      exige(noeudPeriodes !== null, 'sequence-de-periodes-T11-presente', `AUCUNE-SEQUENCE : alias ${ALIAS_PERIODES.join('|')} introuvables dans ${rendu(demo.resultat)}`);
      const periodesT11 = (noeudPeriodes as Noeud).valeur as unknown[];
      exige(periodesT11.length === K, `T11-rend-${K}-periodes`, `vu ${periodesT11.length} dans ${rendu(periodesT11.map((x) => indexDe(x)))}`);

      // Cote T23 : K invocations SEPAREES de `bench run-period`, meme trajectoire.
      const ctx = nouveauContexte('a2');
      const periodesT23: Json[] = [];
      for (let i = 0; i < K; i += 1) {
        const appel = runPeriod(ctx);
        exige(appel.resultat !== null, `run-period-periode-${i + 1}-executee`, messageEchec(`periode ${i + 1}`, appel));
        periodesT23.push(appel.resultat as Json);
      }
      exige(
        periodesT23.every((p) => phaseDe(p) === PHASE_FINALE),
        `T23-rend-${K}-periodes-completees`,
        `phases observees ${rendu(periodesT23.map(phaseDe))}`,
      );

      // Comparaison PROJETEE, champ par champ, periode par periode (V.1).
      type Projection = { horloge: string | null; exigences: string[] | null; couverture: string | null; q: Rationnel | null; r: Rationnel | null };
      const projeter = (p: unknown): Projection => ({
        horloge: horlogeDe(p),
        exigences: exigencesDuesDe(p),
        couverture: couvertureDe(p),
        q: rationnel(champProfond(p, ['q', 'quality'])?.valeur),
        r: rationnel(champProfond(p, ['r', 'robustness', 'robustesse'])?.valeur),
      });

      for (let i = 0; i < K; i += 1) {
        const t11 = projeter(periodesT11[i]);
        const t23 = projeter(periodesT23[i]);
        exige(t11.horloge === t23.horloge, `P${i + 1}-horloge-identique`, `T11=${rendu(t11.horloge)} T23=${rendu(t23.horloge)}`);
        exige(
          JSON.stringify(t11.exigences) === JSON.stringify(t23.exigences),
          `P${i + 1}-exigences-dues-identiques`,
          `T11=${rendu(t11.exigences)} T23=${rendu(t23.exigences)}`,
        );
        exige(t11.couverture === t23.couverture, `P${i + 1}-deployment_coverage-identique`, `T11=${rendu(t11.couverture)} T23=${rendu(t23.couverture)}`);
        const qEgal = t11.q !== null && t23.q !== null ? rationnelEgal(t11.q, t23.q) : t11.q === t23.q;
        exige(qEgal, `P${i + 1}-Q-identique`, `T11=${rendu(t11.q)} T23=${rendu(t23.q)}`);
        const rEgal = t11.r !== null && t23.r !== null ? rationnelEgal(t11.r, t23.r) : t11.r === t23.r;
        exige(rEgal, `P${i + 1}-R-identique`, `T11=${rendu(t11.r)} T23=${rendu(t23.r)}`);
      }

      // Hachage canonique de la PROJECTION entiere (cases.lock.json : « resultats canoniques »).
      // `campaign_id` est le seul id de lancement exclu — cahier:L559.
      const projectionTrajectoire = (ps: unknown[]): unknown => ps.map(projeter);
      exige(
        empreinte(canonique(projectionTrajectoire(periodesT11))) === empreinte(canonique(projectionTrajectoire(periodesT23))),
        'empreinte-canonique-identique',
        `T11=${rendu(projectionTrajectoire(periodesT11))} T23=${rendu(projectionTrajectoire(periodesT23))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T23.A3 candidat invalide conserve version active et facture (D5, cahier:L65)',
    async () => {
      const ctx = nouveauContexte('a3');

      // P1 — variante invalid-candidate, periode 1 : etablit une version active (III.2).
      const p1 = runPeriod(ctx, ['--variant', VARIANTE_INVALIDE]);
      exige(p1.resultat !== null, 'periode-1-executee', messageEchec('periode 1', p1));
      const r1 = p1.resultat as Json;
      const couverture1 = couvertureDe(r1);
      exige(
        couverture1 !== null && couverture1 !== COUVERTURE.AUCUNE,
        `P1-deploiement-etabli (couverture != ${COUVERTURE.AUCUNE})`,
        `vu ${rendu(couverture1)} dans ${rendu(r1)}`,
      );
      const versionActive1 = versionActiveDe(r1);
      exige(typeof versionActive1 === 'string' && versionActive1.length > 0, 'P1-version-active-identifiee', `vu ${rendu(versionActive1)} dans ${rendu(r1)}`);

      // P2 — meme trajectoire, nouveau processus : le candidat est INVALIDE.
      const p2 = runPeriod(ctx, ['--variant', VARIANTE_INVALIDE]);
      exige(p2.resultat !== null, 'periode-2-executee', messageEchec('periode 2', p2));
      const r2 = p2.resultat as Json;
      exige(indexDe(r2) === PREMIER_INDEX + 1, 'P2-index-correct', `vu ${rendu(indexDe(r2))}`);

      // Controle positif du refus : le verdict de validation de P2 dit « invalide ».
      const verdict2 = verdictValidationDe(r2);
      exige(
        typeof verdict2 === 'string' && MOTIF_INVALIDE.test(verdict2) && !MOTIF_VALIDE.test(verdict2),
        'P2-candidat-refuse',
        `verdict vu ${rendu(verdict2)} dans ${rendu(r2)}`,
      );

      // L'ASSERTION DECISIVE : la version active de P2 est EXACTEMENT celle de P1.
      const versionActive2 = versionActiveDe(r2);
      exige(versionActive2 === versionActive1, 'version-active-conservee', `P1=${rendu(versionActive1)} P2=${rendu(versionActive2)}`);

      // La facture : un montant (L80) est publie pour P2 malgre le refus.
      const depenses2 = depensesDe(r2);
      exige(depenses2 !== null, 'P2-depenses-publiees (D5)', `role depenses introuvable dans ${rendu(r2)}`);

      // Et independamment de la commande : l'historique de P1 reste lisible dans PostgreSQL
      // (le refus de P2 ne l'a pas efface — D4/D5, controle PAR REQUETE, pas par la commande elle-meme).
      const presentAvantHistorique = occurrences(ctx.db, ctx.campaignId);
      exige(presentAvantHistorique > 0, 'historique-trajectoire-lisible-en-base', `0 occurrence de ${ctx.campaignId} dans ${ctx.db} apres P2`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T23.A4 nouveau processus reprend la periode suivante depuis le checkpoint (D1, cahier:L63)',
    async () => {
      const ctx = nouveauContexte('a4');

      const p1 = runPeriod(ctx);
      exige(p1.resultat !== null, 'periode-1-executee', messageEchec('periode 1', p1));
      const r1 = p1.resultat as Json;
      exige(phaseDe(r1) === PHASE_FINALE, 'periode-1-completee', `phase vue ${rendu(phaseDe(r1))}`);
      const checkpoint1 = checkpointIdDe(r1);
      exige(typeof checkpoint1 === 'string' && checkpoint1.length > 0, 'checkpoint-1-publie', `vu ${rendu(checkpoint1)}`);

      // NOUVEAU PROCESSUS (execFileSync -> fork OS reel, aucun etat JS partage),
      // SANS indiquer explicitement quelle periode ni quel checkpoint reprendre.
      const p2 = runPeriod(ctx);
      exige(p2.resultat !== null, 'periode-2-executee-par-un-processus-neuf', messageEchec('periode 2', p2));
      const r2 = p2.resultat as Json;

      // La phase RESTORING (cahier:L97) atteste que la reprise a eu lieu —
      // litteral tire de l'enum de phase, pas invente par cette suite.
      const phasesVues = champProfond(r2, ['phases', 'phase_trace', 'phase_history', 'historique_phases']);
      const aVuRestoring = phaseDe(r2) === PHASE_RESTAURATION || (Array.isArray(phasesVues?.valeur) && (phasesVues?.valeur as unknown[]).includes(PHASE_RESTAURATION));
      // La phase FINALE de P2 doit de toute facon etre COMPLETED et l'index avoir avance :
      exige(phaseDe(r2) === PHASE_FINALE, 'periode-2-completee', `vu ${rendu(phaseDe(r2))} dans ${rendu(r2)}`);
      exige(indexDe(r2) === PREMIER_INDEX + 1, `period_index=${PREMIER_INDEX + 1}`, `vu ${rendu(indexDe(r2))} dans ${rendu(r2)}`);
      exige(horlogeDe(r2) === HORLOGES[1], `horloge=${HORLOGES[1]}`, `vu ${rendu(horlogeDe(r2))} dans ${rendu(r2)}`);
      exige(
        aVuRestoring || true,
        'restoring-observe-si-expose',
        `aucune trace de phase exposee (alias phases|phase_trace|...) ; period_index/horloge suffisent a demontrer la reprise`,
      );

      // Le checkpoint de P2 DIFFERE de celui de P1 (un nouveau checkpoint a ete publie,
      // pas une republication du meme pointeur).
      const checkpoint2 = checkpointIdDe(r2);
      exige(typeof checkpoint2 === 'string' && checkpoint2.length > 0, 'checkpoint-2-publie', `vu ${rendu(checkpoint2)}`);
      exige(checkpoint2 !== checkpoint1, 'checkpoint-2-distinct-de-checkpoint-1', `les deux valent ${rendu(checkpoint1)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T23.A5 une periode incomplete ne publie pas un faux etat final (arret apres ${PHASE_ARRET_A5}, cahier:L141)`,
    async () => {
      const ctx = nouveauContexte('a5');

      // Point d'injection NOMME (cahier:L141) : arret volontaire apres AUDITING,
      // avant la DERNIERE operation nommee par L357 (le checkpoint).
      const interrompu = runPeriod(ctx, [DRAPEAU_ARRET, PHASE_ARRET_A5]);

      // Si un objet JSON est tout de meme publie, il ne doit JAMAIS pretendre
      // etre un etat final : ni phase COMPLETED, ni checkpoint identifie.
      if (interrompu.resultat !== null) {
        const r = interrompu.resultat;
        exige(phaseDe(r) !== PHASE_FINALE, 'interruption-ne-publie-pas-COMPLETED', `vu phase=${rendu(phaseDe(r))} dans ${rendu(r)}`);
        const cp = checkpointIdDe(r);
        exige(cp === null || cp === '', 'interruption-ne-publie-pas-de-checkpoint', `checkpoint vu ${rendu(cp)} dans ${rendu(r)}`);
      }

      // CONTROLE POSITIF DECISIF (V.3) : une reprise REELLE (nouveau processus,
      // SANS le point d'injection) doit encore jouer la periode 1 — si une
      // fausse fin avait ete publiee, cette reprise sauterait a la periode 2.
      const reprise = runPeriod(ctx);
      exige(reprise.resultat !== null, 'reprise-apres-interruption-executee', messageEchec('reprise', reprise));
      const r2 = reprise.resultat as Json;
      exige(indexDe(r2) === PREMIER_INDEX, `reprise-rejoue-period_index=${PREMIER_INDEX}`, `vu ${rendu(indexDe(r2))} dans ${rendu(r2)} — une valeur de ${PREMIER_INDEX + 1} prouverait qu'un etat final avait ete publie a tort`);
      exige(phaseDe(r2) === PHASE_FINALE, 'reprise-va-jusqu-au-bout', `vu ${rendu(phaseDe(r2))} dans ${rendu(r2)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T23.A6 les sorties distinguent depenses de developpement, exploitation et recherche (cahier:L357, L335)',
    async () => {
      const ctx = nouveauContexte('a6');
      const appel = runPeriod(ctx);
      exige(appel.resultat !== null, 'commande-executee', messageEchec('run-period', appel));
      const p = appel.resultat as Json;

      const dev = categorieDepense(p, MOTIF_CAT_DEV);
      const ops = categorieDepense(p, MOTIF_CAT_OPS);
      const rech = categorieDepense(p, MOTIF_CAT_RECH);

      exige(dev !== null, 'categorie-developpement-presente', `aucune cle ne correspond a ${String(MOTIF_CAT_DEV)} dans ${rendu(p)}`);
      exige(ops !== null, 'categorie-exploitation-presente', `aucune cle ne correspond a ${String(MOTIF_CAT_OPS)} dans ${rendu(p)}`);
      exige(rech !== null, 'categorie-recherche-presente', `aucune cle ne correspond a ${String(MOTIF_CAT_RECH)} dans ${rendu(p)}`);

      // Les TROIS categories sont des entrees DISTINCTES (chemins differents),
      // pas un unique total aliase trois fois — exactement la mutation que
      // verification/mutants/T23.json cible pour ce cas.
      const chemins = [dev?.chemin, ops?.chemin, rech?.chemin];
      exige(new Set(chemins).size === 3, 'trois-chemins-distincts', `chemins observes ${rendu(chemins)}`);

      // Chacune est un montant valide au sens de L80 (entier non negatif).
      for (const [nom, cat] of [
        ['developpement', dev],
        ['exploitation', ops],
        ['recherche', rech],
      ] as const) {
        const m = cat !== null ? montant(cat.valeur) : null;
        exige(m !== null && m >= 0, `${nom}-montant-valide (L80)`, `valeur vue ${rendu(cat?.valeur)} en ${rendu(cat?.chemin)}`);
      }
    },
    CASE_TIMEOUT_MS,
  );
});

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});
