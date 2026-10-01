/**
 * acceptance/T24.spec.ts — suite d'acceptation de la tache T24.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T24.A1 behaviour — quatre periodes demarrent dans l'ordre et chacune
 *                      apres checkpoint de la precedente
 *   T24.A2 absence   — replay d'un historique termine sans adaptateur
 *                      externe accessible produit zero nouvel appel et zero
 *                      nouvelle ecriture
 *   T24.A3 refusal   — une fixture changeant volontairement l'ordre de
 *                      commandes produit une erreur de determinisme
 *   T24.A4 behaviour — retry d'une Activity deja publiee retrouve son
 *                      resultat
 *   T24.A5 behaviour — un test de continuation avec seuil artificiellement
 *                      bas conserve identite et etat sans refaire les
 *                      periodes
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T24 — `packages/workflows` et
 * `packages/activities` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff, pas une
 * barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T24.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle sur T24 :
 *
 *   L361  titre : « Orchestrer les trajectoires avec Temporal et tester le
 *         replay ».
 *   L363  dependances T05 et T23 ; livrables MOT POUR MOT : « workflow de
 *         campagne, workflow de trajectoire, Activities, parametres
 *         explicites de retry et tests de replay ».
 *   L365  travail : « faire une chaine sequentielle par trajectoire ; passer
 *         des references et petits resultats dans l'historique [...]. Les
 *         appels externes se trouvent dans les Activities. Le journal
 *         externe de T17 protege les appels modeles lors des reprises. » —
 *         fonde A4 : l'Activity dont cette suite force la relecture est
 *         precisement un APPEL MODELE, celui que T17 journalise.
 *   L367  les cinq cas d'acceptation, mot pour mot.
 *   L369  fin : « historique de reference versionne, replay en CI et
 *         separation demontree entre rejouer une decision et refaire un
 *         effet » + note Temporal (determinisme des workflows) — fonde A2
 *         et A3.
 *   L97   enum de phase, VERBATIM, reprise de T23 : `PENDING`, `RESTORING`,
 *         `REVEALING`, `DEVELOPING`, `VALIDATING`, `DEPLOYING`,
 *         `EXERCISING`, `AUDITING`, `CHECKPOINTING`, `COMPLETED`. Le champ
 *         `phase` de la sortie de `run-trajectory` doit valoir `COMPLETED`
 *         une fois la trajectoire entiere achevee.
 *   L99   etats d'appel `RESERVED, DISPATCH_STARTED, RESPONSE_STORED,
 *         SETTLED, UNKNOWN, CANCELLED_BEFORE_DISPATCH` (T17, ModelCall) —
 *         fonde le choix de l'operation `model-call` comme Activity cible
 *         d'A4 : c'est l'Activity qui ecrit dans ce meme journal.
 *   L68   invariant 6 : « une tache peut etre rejouee par l'orchestrateur ;
 *         les effets valides sont dedupliques par cle d'operation et
 *         empreinte d'entree » — l'assertion decisive d'A4.
 *   L69   invariant 7 : « un appel fournisseur dont la reponse est perdue
 *         n'est pas relance aveuglement » — le contexte qui rend la
 *         deduplication d'A4 necessaire : un retry d'Activity est exactement
 *         le mecanisme qui pourrait relancer aveuglement sans elle.
 *   L63   invariant 1 : « l'etat applicatif d'une trajectoire persiste ;
 *         aucun retour automatique a une base ideale » — fonde A5 : une
 *         continuation ne doit pas repartir d'une base ideale (identite
 *         neuve, etat vide).
 *   L78   identite complete d'une trajectoire : `campaign_id / [...] /
 *         period_index`, litteraux repris TELS QUELS comme noms de champ de
 *         sortie (pas une description en prose : ce sont les noms du
 *         cahier).
 *   L121  F-FAILURE, racine gelee — `K` (nombre de periodes d'une
 *         trajectoire complete), reutilise pour A1 au lieu d'etre recopie a
 *         la main (meme discipline que T23.spec.ts).
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         barrieres et POINTS D'INJECTION NOMMES [...] les checks
 *         d'integration utilisent reellement PostgreSQL, le stockage et les
 *         workers lorsque le contrat porte sur ces composants » — autorise
 *         les quatre drapeaux `--test-*` de la section III et l'usage de
 *         PostgreSQL/S3/Temporal reels partout dans cette suite.
 *   L28   un prerequis absent produit BLOCKED, jamais PASS ni FAILED — cette
 *         suite ne confond jamais une commande absente (controle
 *         d'infrastructure, hors de son ressort) avec un verdict metier.
 *   L653  « les workflows Temporal doivent rester compatibles avec le
 *         replay ; les interactions externes appartiennent aux Activities »
 *         (applies T24.A2, T24.A3) — fonde directement A2 et A3.
 *   L655  « les executions d'Activities peuvent connaitre reprises et
 *         retries ; leurs effets distants necessitent une strategie
 *         explicite de deduplication ou de reconciliation » (applies T24.A4)
 *         — fonde directement A4.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * POURQUOI CETTE SUITE N'IMPORTE AUCUN PAQUET — UN CHOIX, PAS UN OUBLI
 *
 * Deux raisons, l'une de fond, l'une structurelle.
 *
 * (a) FOND, meme argument que T23.spec.ts §II : L365 dit que « les appels
 *     externes se trouvent dans les Activities » et que le livrable est un
 *     SYSTEME ASSEMBLE (workflow de campagne + workflow de trajectoire +
 *     Activities + Temporal reel ou a saut de temps), pas une fonction pure
 *     a appeler en memoire. Observer ce systeme par ses EXPORTS de paquet
 *     obligerait a deviner la forme d'un client Temporal ET d'un worker EN
 *     PLUS de la forme du resultat — double surface fabriquee pour un seul
 *     comportement.
 *
 * (b) STRUCTUREL, propre a T24 et absent de T23. Exercer reellement un
 *     workflow Temporal (demarrage, replay, continue-as-new) suppose
 *     d'importer le SDK TypeScript de Temporal (`@temporalio/*`). Ce depot
 *     est un workspace pnpm sans hoist implicite : un paquet ne voit que les
 *     dependances que SON PROPRE package.json declare (verification/
 *     ownership.json classe `packages/**`/`apps/**` en zone IMPL, et seul le
 *     package.json RACINE est en zone INFRA). Si cette suite importait
 *     `@temporalio/testing` ou `@temporalio/worker` directement depuis
 *     `acceptance/`, elle ne resoudrait ces specificateurs QUE si la racine
 *     du depot les declarait elle-meme — une ecriture hors zone ACCEPTANCE
 *     qu'un role test-author n'a pas le droit de faire (PARTITION_VIOLATION).
 *     Exactement le meme mur a ete mesure sur T14.spec.ts pour le client S3 :
 *     aucune suite de ce depot n'importe `@aws-sdk/*` depuis `acceptance/`,
 *     T14 reimplemente un client S3 minimal plutot que d'en declarer un.
 *     Pour T24, reimplementer un client Temporal depuis la suite serait
 *     disproportionne et fragile face a un protocole gRPC entier ; la suite
 *     observe donc le systeme par la MEME porte que T23 — un sous-processus
 *     `apps/cli` — ce qui laisse l'implementeur (zone IMPL, package.json de
 *     `apps/cli` inclus) declarer `@temporalio/*` la ou c'est permis.
 *
 * `apps/cli` N'EST JAMAIS IMPORTE comme module (meme raison que T11/T23 :
 * une entree qui s'execute a l'import emporterait la suite entiere en
 * SUITE_FAILED_TO_RUN). Chaque invocation est un PROCESSUS NEUF
 * (`execFileSync`), jamais un rappel en memoire.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE DANS LE CAHIER SUR LA
 * FORME EXACTE DES COMMANDES (meme geste que T23 fixant les drapeaux de
 * `bench run-period`, T11 fixant `variant`, T18 fixant
 * `INVALID_MODEL_RESPONSE`).
 *
 * DEUX SOUS-COMMANDES, toutes deux en sous-processus, TOUTES DEUX FABRIQUEES
 * par cette suite :
 *
 * (1) `bench run-trajectory` — execute UNE trajectoire COMPLETE (les `K`
 *     periodes de F-FAILURE, mode `recorded`, adaptateurs reels locaux —
 *     memes trois flags que T23 : `--mode`, `--campaign-id`,
 *     `--postgres-database`, `--s3-bucket`, repris VERBATIM pour ne pas
 *     « reintroduire une autre convention implicitement » (cahier:L363))
 *     orchestree par le workflow de campagne / workflow de trajectoire de
 *     T24, PAS periode par periode depuis l'exterieur comme `run-period`.
 *
 *     Drapeaux supplementaires, fixes ICI :
 *       --export-history <chemin>            obligatoire ; la commande DOIT
 *                                             y ecrire un historique rejouable
 *                                             de la trajectoire (format au
 *                                             choix de l'implementeur : cette
 *                                             suite ne le relit JAMAIS
 *                                             elle-meme, seule `bench
 *                                             replay-trajectory`, (2), le
 *                                             consomme).
 *       --test-reorder-commands              point d'injection NOMME
 *                                             (cahier:L141) : force la
 *                                             commande a permuter l'ORDRE de
 *                                             deux commandes enregistrees
 *                                             avant d'ecrire l'export, de
 *                                             sorte que rejouer cet export
 *                                             contre le CODE REEL du workflow
 *                                             soit non deterministe. Fixe A3.
 *       --test-duplicate-activity <nom>      point d'injection NOMME : force
 *                                             l'Activity nommee a etre
 *                                             invoquee une SECONDE fois, avec
 *                                             la MEME identite d'operation
 *                                             (meme cle, L68), apres sa
 *                                             premiere execution reussie
 *                                             (« deja publiee »). Cette suite
 *                                             fixe `<nom>` a `model-call`
 *                                             (L99/L365 : l'Activity qui
 *                                             passe par le journal de T17).
 *                                             Fixe A4.
 *       --test-continue-as-new-after <n>     point d'injection NOMME : force
 *                                             une continuation
 *                                             (continue-as-new) apres chaque
 *                                             tranche de `n` periodes
 *                                             completees, au lieu du seuil de
 *                                             production. Fixe A5.
 *
 *     Sortie : un unique objet JSON sur la sortie standard, avec EXACTEMENT
 *     les champs suivants (noms FIXES, pas d'alias — aucun n'est decrit en
 *     prose par le cahier avec une liberte de nommage ; `campaign_id` et
 *     `period_index` sont deux exceptions reprises LITTERALEMENT de L78) :
 *
 *       campaign_id               string, echo de --campaign-id (L78)
 *       phase                     un litteral de l'enum L97 ; `COMPLETED`
 *                                 une fois les K periodes achevees
 *       period_starts             Array<{ period_index: number (L78),
 *                                 after_checkpoint_of: number|null }>, DANS
 *                                 L'ORDRE REEL de demarrage (A1)
 *       continuation_chain        Array<{ run_id: string, campaign_id:
 *                                 string (L78), periods: number[] }> — une
 *                                 entree par execution Temporal distincte de
 *                                 la trajectoire (une seule entree si aucune
 *                                 continuation n'a eu lieu) (A5)
 *       continued_as_new_count    integer >= 0 (A5)
 *       history_export_path       string, echo de --export-history
 *       fake_provider_calls       integer, nombre total d'appels au
 *                                 fournisseur factice sur TOUTE la
 *                                 trajectoire
 *       duplicated_activity       { operation: string, calls_observed:
 *                                 number, results_identical: boolean } |
 *                                 null — present SEULEMENT quand
 *                                 --test-duplicate-activity est passe (A4)
 *
 * (2) `bench replay-trajectory --history <chemin> --block-external` —
 *     rejoue l'historique exporte par (1) contre le CODE ACTUEL du workflow,
 *     SANS demarrer une execution fraiche et SANS qu'aucun adaptateur
 *     externe reel ne soit joignable (`--block-external`, toujours passe par
 *     cette suite). Sortie JSON :
 *
 *       determinism                  'OK' | 'VIOLATION'
 *       violation_reason              string | null — DOIT NOMMER le
 *                                     desaccord quand determinism='VIOLATION'
 *       external_calls_during_replay  integer
 *       new_writes_during_replay      integer
 *       history_path                  string, echo de --history
 *
 *     Code de sortie FIXE par cette suite : 0 quand determinism='OK' ; non
 *     nul quand determinism='VIOLATION' OU quand --history designe un
 *     historique illisible/absent (controle positif d'A2, V.2).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * PROVENANCE DES LITTERAUX
 *
 * LU DANS LA RACINE GELEE (acceptance/reference/F-FAILURE.json), jamais
 * recopie a la main : `K` (nombre de periodes d'une trajectoire complete,
 * cahier:L121) — reconfirme par le mot « quatre » de l'enonce d'A1 lui-meme.
 *
 * PORTANT UN `// cahier:L<n>` : les dix litteraux de l'enum de phase (L97),
 * `recorded` (L21), `campaign_id`/`period_index` (L78), `model-call` comme
 * nom d'Activity fixe par cette suite mais justifie par L99/L365.
 *
 * FABRIQUES PAR CETTE SUITE, ET SERVANT D'ENTREE JAMAIS DE VALEUR ATTENDUE :
 * les deux noms de sous-commande, les six drapeaux `--export-history`,
 * `--test-reorder-commands`, `--test-duplicate-activity`,
 * `--test-continue-as-new-after`, `--history`, `--block-external`, et les
 * noms de champ de sortie qui ne viennent pas de L78/L97. Aucune de ces
 * valeurs n'a ete obtenue en lancant une implementation de T24 et en figeant
 * ce qu'on a vu passer : aucune implementation de T24 n'existe au moment ou
 * cette suite est ecrite (ADR-001).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * LES DANGERS PROPRES A T24, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A2 EST UN CAS `absence` : LE DANGER DECISIF. Un `replay-trajectory` qui
 *     ne fait RIEN (processus qui se contente d'imprimer des zeros) rendrait
 *     ce cas VERT SANS RIEN PROUVER. Cette suite ferme cette porte de DEUX
 *     facons dans le MEME cas : (i) un controle INDEPENDANT du compteur
 *     auto-declare — le nombre de lignes de la base PostgreSQL de la
 *     trajectoire contenant `campaign_id` est compte AVANT et APRES le
 *     replay et doit etre EXACTEMENT egal (pas seulement « le CLI dit 0 ») ;
 *     (ii) un CONTROLE POSITIF : rejouer un chemin d'historique qui n'existe
 *     PAS DU TOUT doit faire echouer la commande (code de sortie non nul) —
 *     une implementation qui ignorerait purement et simplement --history et
 *     repondrait toujours OK serait demasquee ici.
 * (2) A3 EST UN CAS `refusal` : meme danger inverse que T00 l'explique pour
 *     ce mode de preuve — un stub qui leve laisserait A3 vert sans rien
 *     prouver sur le CONTROLE DE DETERMINISME lui-meme. cases.lock.json le
 *     dit explicitement : la mutation qui doit tuer A3 est « desactiver le
 *     controle de determinisme », pas casser le replay. A3 porte donc un
 *     CONTROLE SYMETRIQUE dans le meme cas : le MEME mecanisme de replay,
 *     invoque sur un historique NON reordonne (meme trajectoire fraiche,
 *     context separe), doit rendre determinism='OK' — sans ce controle, une
 *     implementation qui repondrait invariablement VIOLATION satisferait la
 *     moitie du cas sans rien demontrer sur l'ordre des commandes.
 * (3) A4 EXIGE UNE EGALITE STRICTE A 1, PAS UNE BORNE INFERIEURE.
 *     `calls_observed === 1` attrape LES DEUX directions de la panne : 0
 *     (le fournisseur factice n'a jamais ete reellement appele — rien ne
 *     prouve que l'Activity testee existe) ET 2 (le retry a rejoue l'effet
 *     externe au lieu de retrouver le resultat deja publie — exactement la
 *     mutation que cases.lock.json cible pour A4). Une assertion `>= 1` ne
 *     distinguerait pas ces deux echecs de la reussite.
 * (4) A5 PORTE L'IDENTITE AU NIVEAU DE CHAQUE MAILLON DE LA CHAINE, PAS
 *     SEULEMENT AU NIVEAU GLOBAL. Si `campaign_id` n'etait verifie qu'au
 *     sommet de la reponse, une implementation ou la continuation repart
 *     effectivement avec une identite neuve (la mutation ciblee par
 *     cases.lock.json pour A5 : « la nouvelle execution repart avec une
 *     identite neuve ou un etat vide ») pourrait quand meme publier un champ
 *     racine fidele sans que RIEN ne garantisse que les executions
 *     continuees elles-memes aient connu cette identite. Chaque entree de
 *     `continuation_chain` porte donc son PROPRE `campaign_id`, verifie
 *     individuellement. « Sans refaire les periodes » est verifie en
 *     concatenant `periods` de toutes les entrees DANS L'ORDRE et en exigeant
 *     l'egalite stricte avec `[1..K]` : une periode rejouee apparaitrait deux
 *     fois et romprait cette egalite.
 * (5) ISOLATION DES SERVICES REELS. Chaque cas (et, pour A3, chacune de ses
 *     DEUX trajectoires) cree sa PROPRE base PostgreSQL (`creerBase`) et son
 *     propre nom de bucket S3, namespaces par un `campaign_id` aleatoire —
 *     cahier:L557 et meme discipline que T12/T21/T23.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne reverifie pas le contenu metier d'une periode (exigences,
 *    validation, deploiement, Q/R, ventilation des depenses) : c'est T23,
 *    qui a sa propre suite. T24 observe l'ORCHESTRATION — ordre, rejouabilite,
 *    determinisme, idempotence au retry, continuation — pas le contenu.
 *  • Elle n'exige pas que `run-trajectory` passe par le serveur Temporal reel
 *    (`bench svc up`, capacite `temporal`) plutot que par l'environnement a
 *    saut de temps (capacite `temporal-timeskip`) : le choix d'infrastructure
 *    est un detail d'implementation ; seul le JSON observable compte ici.
 *  • Elle ne lit jamais elle-meme le format de l'historique exporte par
 *    --export-history : seule `bench replay-trajectory` le consomme, ce qui
 *    laisse l'implementeur choisir n'importe quel format serialisable.
 *  • Elle ne verifie pas le detail du mecanisme de retry Temporal cote
 *    serveur (nombre de tentatives, politique de backoff) : seule l'EFFET
 *    observable de L68/L655 (le resultat retrouve, pas rejoue) est exige.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
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

/** L'assertion elementaire : une comparaison de chaines, pour nommer ce qui a ete vu. */
function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ──────────────────── fixture de reference (racine gelee, L139) */

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
/** K=4 (F-FAILURE, cahier:L121) : le nombre de periodes d'une trajectoire complete. */
const K = Number(refValue(F_FAILURE, 'valeurs.K.valeur'));

/* ───────────────── litteraux du cahier, chacun avec sa ligne */

const MODE = 'recorded'; // cahier:L21
const PHASE_FINALE = 'COMPLETED'; // cahier:L97 (enum de phase, repris de T23)
const CHAMP_CAMPAGNE = 'campaign_id'; // cahier:L78 — nom LITTERAL du cahier
const CHAMP_INDEX_PERIODE = 'period_index'; // cahier:L78 — nom LITTERAL du cahier
/** Operation ciblee par A4 : l'Activity qui passe par le journal de T17 (L99/L365). */
const NOM_ACTIVITE_MODELE = 'model-call';

/** Sous-commandes et drapeaux fixes par cette suite (section III). */
const SOUS_COMMANDE_RUN = 'run-trajectory';
const SOUS_COMMANDE_REPLAY = 'replay-trajectory';
const DRAPEAU_MODE = '--mode';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_DB = '--postgres-database';
const DRAPEAU_BUCKET = '--s3-bucket';
const DRAPEAU_EXPORT_HISTORIQUE = '--export-history';
const DRAPEAU_REORDONNER = '--test-reorder-commands';
const DRAPEAU_DUPLIQUER_ACTIVITE = '--test-duplicate-activity';
const DRAPEAU_SEUIL_CONTINUATION = '--test-continue-as-new-after';
const DRAPEAU_HISTORIQUE = '--history';
const DRAPEAU_BLOQUER_EXTERNE = '--block-external';

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t24_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
    (t) => `SELECT count(*) AS n FROM "${t.schema}"."${t.nom}" x WHERE x::text LIKE ${lit(`%${cle}%`)}`,
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

type Tentative = { label: string; argv: string[]; exit: number | null; sortie: string };
type Invocation = { resultat: Json | null; exit: number | null; tentatives: Tentative[] };

/** La premiere entree `apps/cli`/`tools/bench` qui a repondu, memorisee pour eviter de rescanner/rebuild a chaque appel. */
let entreeGagnante: string[] | null = null;

function invoquer(sousCommande: string, drapeaux: string[]): Invocation {
  const tentatives: Tentative[] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
  const executerAvec = (argv0: string[], label: string): Invocation => {
    const argv = [...argv0, sousCommande, ...drapeaux];
    const r = executer(argv, env);
    const j = jsonDeSortie(r.stdout);
    tentatives.push({ label, argv, exit: r.exit, sortie: court(r.sortie, 400) });
    return { resultat: j, exit: r.exit, tentatives };
  };
  if (entreeGagnante !== null) return executerAvec(entreeGagnante, 'entree-memorisee');
  for (const c of entreesCli()) {
    const r = executerAvec(c.argv, c.label);
    if (r.resultat !== null) {
      entreeGagnante = c.argv;
      return r;
    }
  }
  construireUneFois(tentatives);
  for (const c of entreesCli()) {
    const r = executerAvec(c.argv, c.label);
    if (r.resultat !== null) {
      entreeGagnante = c.argv;
      return r;
    }
  }
  return { resultat: null, exit: null, tentatives };
}

function messageEchec(label: string, appel: Invocation): string {
  return `${label} : ${appel.tentatives
    .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`)
    .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`;
}

/* ─────────────────────────────── contexte d'une trajectoire isolee (V.5) */

type Contexte = { campaignId: string; db: string; bucket: string; historyPath: string };

function nouveauContexte(suffixe: string): Contexte {
  const campaignId = `t24-${RUN}-${suffixe}-${randomUUID()}`;
  return {
    campaignId,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    historyPath: path.join(os.tmpdir(), `t24-${RUN}-${suffixe}.history.json`),
  };
}

function runTrajectory(ctx: Contexte, extra: string[] = [], historyPath: string = ctx.historyPath): Invocation {
  return invoquer(SOUS_COMMANDE_RUN, [
    DRAPEAU_MODE,
    MODE,
    DRAPEAU_CAMPAGNE,
    ctx.campaignId,
    DRAPEAU_DB,
    ctx.db,
    DRAPEAU_BUCKET,
    ctx.bucket,
    DRAPEAU_EXPORT_HISTORIQUE,
    historyPath,
    ...extra,
  ]);
}

function replayTrajectory(historyPath: string, extra: string[] = []): Invocation {
  return invoquer(SOUS_COMMANDE_REPLAY, [DRAPEAU_HISTORIQUE, historyPath, DRAPEAU_BLOQUER_EXTERNE, ...extra]);
}

/* ───────────────────────────── extraction typee du contrat fixe (III) */

type DebutPeriode = { period_index: number; after_checkpoint_of: number | null };
function commeDebutsPeriodes(v: unknown): DebutPeriode[] | null {
  if (!Array.isArray(v)) return null;
  const out: DebutPeriode[] = [];
  for (const e of v) {
    if (e === null || typeof e !== 'object') return null;
    const o = e as Json;
    const idx = o[CHAMP_INDEX_PERIODE];
    const apres = o.after_checkpoint_of;
    if (typeof idx !== 'number' || !Number.isInteger(idx)) return null;
    if (apres !== null && typeof apres !== 'number') return null;
    out.push({ period_index: idx, after_checkpoint_of: apres === null ? null : apres });
  }
  return out;
}

type MaillonContinuation = { run_id: string; campaign_id: string; periods: number[] };
function commeChaineContinuation(v: unknown): MaillonContinuation[] | null {
  if (!Array.isArray(v)) return null;
  const out: MaillonContinuation[] = [];
  for (const e of v) {
    if (e === null || typeof e !== 'object') return null;
    const o = e as Json;
    const runId = o.run_id;
    const campagne = o[CHAMP_CAMPAGNE];
    const periodes = o.periods;
    if (typeof runId !== 'string' || typeof campagne !== 'string' || !Array.isArray(periodes)) return null;
    if (!periodes.every((p) => typeof p === 'number' && Number.isInteger(p))) return null;
    out.push({ run_id: runId, campaign_id: campagne, periods: periodes as number[] });
  }
  return out;
}

type ActiviteDupliquee = { operation: string; calls_observed: number; results_identical: boolean };
function commeActiviteDupliquee(v: unknown): ActiviteDupliquee | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Json;
  if (typeof o.operation !== 'string' || typeof o.calls_observed !== 'number' || typeof o.results_identical !== 'boolean') {
    return null;
  }
  return { operation: o.operation, calls_observed: o.calls_observed, results_identical: o.results_identical };
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T24 — orchestrer les trajectoires avec Temporal et tester le replay', () => {
  test(
    `T24.A1 quatre periodes demarrent dans l'ordre et chacune apres checkpoint de la precedente (bench ${SOUS_COMMANDE_RUN})`,
    () => {
      const ctx = nouveauContexte('a1');
      const appel = runTrajectory(ctx);
      exige(appel.resultat !== null, 'commande-run-trajectory-executee', messageEchec('run-trajectory', appel));
      exige(appel.exit === 0, 'run-trajectory-sort-en-0', `exit observe ${rendu(appel.exit)} : ${messageEchec('run-trajectory', appel)}`);
      const p = appel.resultat as Json;

      exige(p[CHAMP_CAMPAGNE] === ctx.campaignId, `${CHAMP_CAMPAGNE}-echo (L78)`, `vu ${rendu(p[CHAMP_CAMPAGNE])} attendu ${rendu(ctx.campaignId)}`);

      const debuts = commeDebutsPeriodes(p.period_starts);
      exige(debuts !== null, 'period_starts-present-et-bien-forme', `vu ${rendu(p.period_starts)} dans ${rendu(p)}`);
      const liste = debuts as DebutPeriode[];

      const indices = liste.map((d) => d.period_index);
      const attendu = Array.from({ length: K }, (_, i) => i + 1);
      exige(
        JSON.stringify(indices) === JSON.stringify(attendu),
        `les-${K}-periodes-demarrent-dans-l-ordre (A1)`,
        `period_index vus dans l'ordre ${rendu(indices)}, attendu ${rendu(attendu)}`,
      );

      exige(liste[0]?.after_checkpoint_of === null, 'P1-ne-suit-aucun-checkpoint', `vu ${rendu(liste[0]?.after_checkpoint_of)}`);
      for (let i = 1; i < liste.length; i += 1) {
        const courant = liste[i];
        const precedent = liste[i - 1];
        exige(
          courant !== undefined && precedent !== undefined && courant.after_checkpoint_of === precedent.period_index,
          `P${i + 1}-demarre-apres-le-checkpoint-de-P${i}`,
          `after_checkpoint_of vu ${rendu(courant?.after_checkpoint_of)}, attendu ${rendu(precedent?.period_index)}`,
        );
      }

      exige(p.phase === PHASE_FINALE, `phase=${PHASE_FINALE} (cahier:L97)`, `vu ${rendu(p.phase)} dans ${rendu(p)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T24.A2 replay d'un historique termine sans adaptateur externe accessible produit zero nouvel appel et zero nouvelle ecriture (cahier:L653)",
    () => {
      const ctx = nouveauContexte('a2');
      const nominal = runTrajectory(ctx);
      exige(nominal.resultat !== null, 'trajectoire-nominale-executee', messageEchec('run-trajectory', nominal));
      const n = nominal.resultat as Json;
      exige(n.phase === PHASE_FINALE, 'trajectoire-nominale-completee', `vu ${rendu(n.phase)}`);
      exige(n.history_export_path === ctx.historyPath, 'history_export_path-echo', `vu ${rendu(n.history_export_path)} attendu ${rendu(ctx.historyPath)}`);

      // Temoin independant : l'historique persistant contient deja la trace de
      // cette trajectoire avant tout replay (sans quoi « rien de nouveau » ne
      // prouverait rien : il n'y avait deja rien avant).
      const avant = occurrences(ctx.db, ctx.campaignId);
      exige(avant > 0, 'trace-de-la-trajectoire-deja-en-base-avant-replay', `0 occurrence de ${ctx.campaignId} dans ${ctx.db}`);

      const rejoue = replayTrajectory(ctx.historyPath);
      exige(rejoue.resultat !== null, 'replay-trajectory-execute', messageEchec('replay-trajectory', rejoue));
      exige(rejoue.exit === 0, 'replay-sort-en-0-sur-un-historique-sain', `exit observe ${rendu(rejoue.exit)} : ${messageEchec('replay-trajectory', rejoue)}`);
      const r = rejoue.resultat as Json;

      exige(r.determinism === 'OK', "determinism='OK' sur l'historique nominal", `vu ${rendu(r.determinism)} (raison ${rendu(r.violation_reason)}) dans ${rendu(r)}`);
      exige(r.external_calls_during_replay === 0, 'zero-nouvel-appel-externe-pendant-le-replay', `vu ${rendu(r.external_calls_during_replay)} dans ${rendu(r)}`);
      exige(r.new_writes_during_replay === 0, 'zero-nouvelle-ecriture-pendant-le-replay', `vu ${rendu(r.new_writes_during_replay)} dans ${rendu(r)}`);

      // Controle INDEPENDANT du compteur auto-declare (V.1) : la base reelle
      // n'a PAS grossi pendant le replay.
      const apres = occurrences(ctx.db, ctx.campaignId);
      exige(apres === avant, 'postgresql-inchange-par-le-replay (controle independant)', `avant=${rendu(avant)} apres=${rendu(apres)}`);

      // CONTROLE POSITIF DECISIF (V.1) : un historique absent fait ECHOUER la
      // commande — une implementation qui ignorerait --history et repondrait
      // toujours OK serait demasquee ici.
      const cheminAbsent = path.join(os.tmpdir(), `t24-${RUN}-a2-absent-${randomUUID()}.history.json`);
      const bidon = replayTrajectory(cheminAbsent);
      exige(bidon.exit !== 0, 'replay-rejette-un-historique-absent (controle positif)', `exit observe ${rendu(bidon.exit)} resultat ${rendu(bidon.resultat)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T24.A3 une fixture changeant volontairement l'ordre de commandes produit une erreur de determinisme (cahier:L653)",
    () => {
      // Trajectoire de CONTROLE, historique NON reordonne (V.2) — contexte separe.
      const ctxSain = nouveauContexte('a3-sain');
      const sain = runTrajectory(ctxSain);
      exige(sain.resultat !== null, 'trajectoire-de-controle-executee', messageEchec('run-trajectory (controle)', sain));
      exige((sain.resultat as Json).phase === PHASE_FINALE, 'trajectoire-de-controle-completee', `vu ${rendu((sain.resultat as Json).phase)}`);

      const rejoueSain = replayTrajectory(ctxSain.historyPath);
      exige(rejoueSain.resultat !== null, 'replay-de-controle-execute', messageEchec('replay-trajectory (controle)', rejoueSain));
      exige(
        (rejoueSain.resultat as Json).determinism === 'OK',
        "controle : determinism='OK' SANS reordonnancement",
        `vu ${rendu((rejoueSain.resultat as Json).determinism)} — une implementation qui repondrait toujours VIOLATION satisferait ce cas sans rien prouver sur l'ordre des commandes`,
      );

      // Trajectoire REORDONNEE (point d'injection NOMME, III) — contexte separe.
      const ctxReordonne = nouveauContexte('a3-reordonne');
      const reordonne = runTrajectory(ctxReordonne, [DRAPEAU_REORDONNER]);
      exige(reordonne.resultat !== null, 'trajectoire-reordonnee-executee', messageEchec('run-trajectory --test-reorder-commands', reordonne));
      exige((reordonne.resultat as Json).phase === PHASE_FINALE, 'trajectoire-reordonnee-completee-malgre-la-permutation', `vu ${rendu((reordonne.resultat as Json).phase)}`);

      const rejoueReordonne = replayTrajectory(ctxReordonne.historyPath);
      exige(rejoueReordonne.resultat !== null, 'replay-reordonne-execute', messageEchec('replay-trajectory (reordonne)', rejoueReordonne));
      const r = rejoueReordonne.resultat as Json;

      // L'ASSERTION DECISIVE (cases.lock.json) : le replay d'un historique dont
      // l'ordre de commandes a ete change PRODUIT une erreur de determinisme.
      exige(r.determinism === 'VIOLATION', "determinism='VIOLATION' sur l'historique reordonne", `vu ${rendu(r.determinism)} dans ${rendu(r)}`);
      exige(rejoueReordonne.exit !== 0, 'replay-reordonne-sort-en-non-zero', `exit observe ${rendu(rejoueReordonne.exit)}`);
      const raison = r.violation_reason;
      exige(
        typeof raison === 'string' && raison.trim().length >= 8,
        'violation_reason-nomme-le-desaccord (pas un message vide ou generique)',
        `vu ${rendu(raison)} dans ${rendu(r)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T24.A4 retry d'une Activity deja publiee retrouve son resultat (invariant 6, cahier:L68, L655)",
    () => {
      const ctx = nouveauContexte('a4');
      const appel = runTrajectory(ctx, [DRAPEAU_DUPLIQUER_ACTIVITE, NOM_ACTIVITE_MODELE]);
      exige(appel.resultat !== null, 'trajectoire-avec-retry-force-executee', messageEchec('run-trajectory --test-duplicate-activity', appel));
      exige(appel.exit === 0, 'run-trajectory-sort-en-0-malgre-le-retry-force', `exit observe ${rendu(appel.exit)}`);
      const p = appel.resultat as Json;

      exige(p.phase === PHASE_FINALE, 'trajectoire-completee-malgre-le-retry-force', `vu ${rendu(p.phase)}`);
      const debuts = commeDebutsPeriodes(p.period_starts);
      exige(debuts !== null && debuts.length === K, `les-${K}-periodes-ont-quand-meme-lieu`, `vu ${rendu(p.period_starts)}`);

      const dup = commeActiviteDupliquee(p.duplicated_activity);
      exige(dup !== null, 'duplicated_activity-present-et-bien-forme', `vu ${rendu(p.duplicated_activity)} dans ${rendu(p)}`);
      const d = dup as ActiviteDupliquee;

      exige(d.operation === NOM_ACTIVITE_MODELE, `duplicated_activity.operation=${NOM_ACTIVITE_MODELE}`, `vu ${rendu(d.operation)}`);

      // L'ASSERTION DECISIVE (V.3) : EXACTEMENT un appel reel, ni zero (l'Activity
      // n'a jamais ete reellement exercee) ni deux (le retry a rejoue l'effet
      // externe au lieu de retrouver le resultat deja publie — L68).
      exige(d.calls_observed === 1, 'exactement-un-appel-fournisseur-malgre-le-retry (L68)', `calls_observed vu ${rendu(d.calls_observed)}`);
      exige(d.results_identical === true, 'le-retry-retrouve-le-meme-resultat-que-la-premiere-execution', `results_identical vu ${rendu(d.results_identical)}`);

      exige(typeof p.fake_provider_calls === 'number' && (p.fake_provider_calls as number) >= 1, 'fake_provider_calls-publie-et->=1', `vu ${rendu(p.fake_provider_calls)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T24.A5 un test de continuation avec seuil artificiellement bas conserve identite et etat sans refaire les periodes (invariant 1, cahier:L63)',
    () => {
      const ctx = nouveauContexte('a5');
      // Seuil de continuation artificiellement bas (III) : une continuation
      // apres CHAQUE periode garantit, sur K periodes, au moins K-1 continuations.
      const appel = runTrajectory(ctx, [DRAPEAU_SEUIL_CONTINUATION, '1']);
      exige(appel.resultat !== null, 'trajectoire-a-seuil-de-continuation-bas-executee', messageEchec('run-trajectory --test-continue-as-new-after', appel));
      exige(appel.exit === 0, 'run-trajectory-sort-en-0-malgre-les-continuations', `exit observe ${rendu(appel.exit)}`);
      const p = appel.resultat as Json;

      exige(p.phase === PHASE_FINALE, 'trajectoire-achevee-malgre-les-continuations', `vu ${rendu(p.phase)}`);

      const continuations = p.continued_as_new_count;
      exige(
        typeof continuations === 'number' && continuations >= K - 1,
        `continued_as_new_count>=${K - 1} (le seuil bas a reellement declenche des continuations)`,
        `vu ${rendu(continuations)} dans ${rendu(p)}`,
      );

      const chaine = commeChaineContinuation(p.continuation_chain);
      exige(chaine !== null, 'continuation_chain-presente-et-bien-formee', `vu ${rendu(p.continuation_chain)} dans ${rendu(p)}`);
      const maillons = chaine as MaillonContinuation[];
      exige(
        maillons.length === (continuations as number) + 1,
        'continuation_chain.length = continued_as_new_count + 1',
        `longueur vue ${rendu(maillons.length)}, continuations ${rendu(continuations)}`,
      );

      // IDENTITE CONSERVEE A CHAQUE MAILLON (V.4), pas seulement au sommet.
      exige(p[CHAMP_CAMPAGNE] === ctx.campaignId, `${CHAMP_CAMPAGNE}-racine-echo`, `vu ${rendu(p[CHAMP_CAMPAGNE])}`);
      maillons.forEach((m, i) => {
        exige(m.campaign_id === ctx.campaignId, `maillon-${i}-conserve-${CHAMP_CAMPAGNE} (L63 : pas de retour a une base ideale)`, `vu ${rendu(m.campaign_id)} attendu ${rendu(ctx.campaignId)}`);
      });

      // DISTINCTION REELLE DES EXECUTIONS : des run_id distincts, pas une seule
      // execution qui se pretendrait repetee.
      const runIds = maillons.map((m) => m.run_id);
      exige(new Set(runIds).size === maillons.length, 'run_id-distincts-par-maillon (continuation reellement exercee)', `vu ${rendu(runIds)}`);

      // ETAT CONSERVE SANS REFAIRE LES PERIODES : la CONCATENATION, DANS
      // L'ORDRE, des periodes de chaque maillon est EXACTEMENT [1..K] — une
      // periode rejouee apparaitrait deux fois et romprait cette egalite.
      const concatenees = maillons.flatMap((m) => m.periods);
      const attendu = Array.from({ length: K }, (_, i) => i + 1);
      exige(
        JSON.stringify(concatenees) === JSON.stringify(attendu),
        `periodes-concatenees-de-la-chaine=[1..${K}]-sans-doublon-ni-trou`,
        `vu ${rendu(concatenees)}, attendu ${rendu(attendu)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});
