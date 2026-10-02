/**
 * acceptance/T40.spec.ts — suite d'acceptation de la tache T40.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T40.A1 numeric   — plan 30 projets x 2 scenarios x 3 configurations x 5
 *                      repetitions x 1 budget produit 900 trajectoires et
 *                      21600 periodes
 *   T40.A2 absence   — la validation du plan fait zero appel modele
 *   T40.A3 behaviour — test borne de 100 workflows courts avec Activities
 *                      factices termine avec 100 resultats, sans doublon
 *   T40.A4 absence   — plafond dix jobs actifs jamais depasse, observe avec
 *                      barriere
 *   T40.A5 behaviour — arret/reprise du scheduler ne perd aucun job
 *   T40.A6 absence   — les historiques contiennent des references aux gros
 *                      artefacts et non leur contenu
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T40 — `infra`, `packages/workflows`,
 * `packages/activities`, `apps/cli` — et ne les a lus ni directement ni par
 * `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff,
 * pas une barriere technique). Le contrat teste ci-dessous est derive
 * EXCLUSIVEMENT de docs/specs/T40.md, c'est-a-dire du sous-ensemble du cahier
 * que la carte de specification epingle sur T40 (chaque ligne ci-dessous est
 * un bloc `applies: T40.Ax` reellement present dans ce fichier, jamais une
 * ligne du cahier entier lue par ailleurs) :
 *
 *   L505  titre : « Verifier la capacite de distribution sans facture IA
 *         massive ». Dependances T24, T25, T26, T31 et T38 ; livrables MOT
 *         POUR MOT : « profil de charge, plan de distribution et mesures de
 *         ressources de controle ».
 *   L509  les six cas d'acceptation, mot pour mot — seule ligne qui chiffre
 *         « 30 », « 2 », « 3 », « 5 », « 1 », « 900 », « 21600 », « 100 » et
 *         « dix ».
 *   L511  fin : « nombres et invariants valides ; consommation et duree
 *         mesurees a titre descriptif. Ce test ne garantit ni 900 sandboxes
 *         simultanes sur une machine donnee, ni une acceleration lineaire, ni
 *         un debit fournisseur. » — fonde la section VI.
 *   L78   (identite E, applies A1/A3) : `campaign_id` repris LITTERALEMENT
 *         comme nom de champ de sortie.
 *   L84-95 (table des contrats, applies A1/A6) : `CampaignManifest` exige au
 *         minimum « mode, configurations, budgets [...] periodes [...] » —
 *         fonde les champs `mode`/`trajectories`/`periods` du plan (A1) ;
 *         `CheckpointManifest` exige « [...] fichiers, files [...] » — un
 *         checkpoint REFERENCE ses fichiers, il ne les contient pas, ce qui
 *         fonde directement A6.
 *   L97   (enum de phase, applies A3/A5) : `PENDING, RESTORING, REVEALING,
 *         DEVELOPING, VALIDATING, DEPLOYING, EXERCISING, AUDITING,
 *         CHECKPOINTING, COMPLETED` — repris pour le champ `phase` de chaque
 *         job du run borne ; `COMPLETED` est l'etat final exige par A3/A5.
 *   L28   (applies tout le fichier) : un prerequis absent produit `BLOCKED`,
 *         jamais `PASS` ni `FAILED` — cette suite ne confond jamais une
 *         commande absente (controle d'infrastructure, hors de son ressort)
 *         avec un verdict metier.
 *   L34   (applies tout le fichier) : « le coeur metier ne depend ni de
 *         Temporal, ni de Docker, ni d'un SDK fournisseur. Les interfaces
 *         sont implementees par adaptateurs. » — fonde (section II) le choix
 *         d'observer le systeme par `apps/cli`, jamais par un import direct
 *         de `@temporalio/*` depuis `acceptance/`.
 *   L141  (applies A3/A4) : « les tests d'ordonnancement emploient horloges
 *         controlees, barrieres et points d'injection nommes [...] les
 *         checks d'integration utilisent reellement PostgreSQL, le stockage
 *         et les workers lorsque le contrat porte sur ces composants » —
 *         autorise la barriere HTTP reelle d'A4 et les travailleurs reels
 *         d'A3.
 *   L143  (applies A1) : « les nombres exacts se verifient en entier ou
 *         rationnel » — fonde l'egalite STRICTE d'entiers d'A1, sans aucune
 *         tolerance flottante.
 *   L361-369 (T24, applies A3/A6) : « les appels externes se trouvent dans
 *         les Activities [...] historique de reference versionne [...]
 *         separation [...] entre rejouer une decision et refaire un effet »
 *         — fonde A3 (Activites factices sous l'orchestration reelle) et A6
 *         (l'historique ne porte que des references).
 *   L371-377 (T25, applies A5) : « arret avec deux appels partis et trois en
 *         attente annule les trois, mais conserve le suivi des deux » —
 *         precedent direct pour « arret/reprise ne perd aucun job » : un
 *         arret conserve le SUIVI, il ne l'efface pas.
 *   L379-385 (T26, applies A4) : « dix appels prets, plafond deux et
 *         fournisseur bloque par barriere donnent deux appels actifs [...]
 *         aucun depassement du nombre maximal observe » — precedent direct
 *         de la TECHNIQUE (barriere HTTP bloquante) reprise ici a l'echelle
 *         des JOBS plutot que des appels modele.
 *   L423-429 (T31, applies A6) : « aucun filtre implicite de survivants [...]
 *         la normalisation n'enleve jamais les identifiants » — precedent
 *         pour la discipline « reference jamais contenu » appliquee ici aux
 *         gros artefacts d'historique.
 *   L487-495 (T38, applies A1/A4) : golden-six, verdict chiffre exact
 *         (2720/16320 micro-USD) — precedent de rigueur pour l'egalite
 *         stricte d'A1 ; « un, deux et six workers donnent memes resultats »
 *         — precedent pour l'independance d'A4 vis-a-vis de la duree murale.
 *   L559  (applies A3) : « chaque suite d'integration recoit un test_run_id
 *         technique unique [...] » — fonde le prefixe `RUN` isole par cas.
 *   L561  (applies A1/A4) : « reutiliser des resultats idempotents existants
 *         [...] ne valide pas le parallelisme [...] namespaces vierges
 *         distincts » — fonde l'isolation stricte (base et campagne fraiches)
 *         de chaque cas.
 *   L651, L653-655 (M, applies A3/A5) : determinisme et tests de workflows
 *         Temporal, retries d'Activities necessitant une strategie de
 *         deduplication — fonde le choix d'un moteur Temporal reel ou a saut
 *         de temps (detail d'implementation non impose par cette suite).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * POURQUOI CETTE SUITE N'IMPORTE AUCUN PAQUET — MEME RAISON QUE T24
 *
 * (a) FOND : L34 dit que le coeur metier ne depend d'aucun SDK fournisseur et
 *     que les interfaces passent par des adaptateurs ; le livrable de T40 est
 *     un SYSTEME ASSEMBLE (plan + orchestration + Activites factices +
 *     Temporal reel ou a saut de temps), pas une fonction pure.
 * (b) STRUCTUREL : exercer reellement l'orchestration suppose d'importer le
 *     SDK TypeScript de Temporal (`@temporalio/*`). Ce depot est un workspace
 *     pnpm sans hoist implicite (verification/ownership.json classe
 *     `packages/**`/`apps/**` en zone IMPL ; seul le package.json RACINE est
 *     en zone INFRA) : une suite ACCEPTANCE qui importerait `@temporalio/*`
 *     directement ne resoudrait ce specificateur que si la racine le
 *     declarait elle-meme — PARTITION_VIOLATION. Meme mur que T14 (S3) et
 *     T24 (Temporal) : cette suite observe le systeme par un sous-processus
 *     `apps/cli`, ce qui laisse l'implementeur (zone IMPL) declarer
 *     `@temporalio/*` la ou c'est permis.
 *
 * `apps/cli` N'EST JAMAIS IMPORTE comme module (meme raison que T11/T23/T24 :
 * une entree qui s'execute a l'import emporterait la suite entiere en
 * SUITE_FAILED_TO_RUN). Chaque invocation est un PROCESSUS NEUF.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE DANS LE CAHIER SUR LA
 * FORME EXACTE DES COMMANDES (meme geste que T23/T24/T25/T26 : « points
 * d'injection nommes » de cahier:L141 fabriques par le test-author puisque
 * aucune implementation de T40 n'existe au moment ou cette suite est ecrite).
 *
 * TROIS SOUS-COMMANDES, toutes en sous-processus, TOUTES FABRIQUEES ici :
 *
 * (1) `plan-distribution --campaign-id <id> --mode recorded --parents <N>
 *      --scenarios <N> --configurations <N> --repetitions <N> --budgets <N>
 *      --periods-per-trajectory <N> --postgres-database <db> --plan-id <id>`
 *      — VALIDATION PURE d'un profil de charge : ne demarre, ne planifie et
 *      n'execute AUCUNE trajectoire reelle ; se contente de compter. Doit
 *      faire ZERO appel au fournisseur de modele (A2) et ZERO ecriture
 *      persistante attribuable a ce `--plan-id` (controle independant, cf.
 *      IV.2 — `--plan-id` est un jeton ALEATOIRE fabrique par cette suite,
 *      jamais un litteral du cahier, exactement comme `campaign_id` dans
 *      T24.A2).
 *      Sortie JSON : `{ campaign_id, mode, trajectories, periods,
 *      model_calls_dispatched }`.
 *
 * (2) `distribution-run-bounded --campaign-id <id> --mode recorded --jobs <N>
 *      --postgres-database <db> [--max-concurrent <N>]
 *      [--test-activity-barrier-url <url>]
 *      [--test-stop-after-completions <K>]
 *      [--test-large-artifact-bytes <N>] [--export-history <chemin>]`
 *      — demarre N jobs COURTS, chacun porte par UNE SEULE Activity FACTICE
 *      (aucun modele, aucun scenario reel — cahier:L361-369, les appels
 *      externes vivent dans les Activities) dont le TRAVAIL FIXE par cette
 *      suite est : (i) si `--test-activity-barrier-url` est fourni, faire un
 *      GET HTTP vers cette URL et ATTENDRE la reponse avant de continuer ;
 *      (ii) si `--test-large-artifact-bytes <N>` est fourni, le job d'index 0
 *      (et lui seul) genere N octets ALEATOIRES (incompressibles — une
 *      perturbation qui inlinerait ces octets ne peut pas se cacher derriere
 *      une compression fortuite), les stocke via le magasin d'artefacts deja
 *      fixe par T13/T14 et retourne une REFERENCE courte, jamais les octets ;
 *      (iii) renvoyer son propre index de soumission (0..N-1, cf. A3/A5).
 *      `--max-concurrent <N>` plafonne le nombre de jobs ACTIFS simultanement
 *      (A4 : « quotas par fournisseur » de T26, L379-385, repris ici a
 *      l'echelle des jobs). `--test-stop-after-completions <K>` : des que K
 *      completions sont DURABLEMENT persistees (visibles pour une reprise),
 *      le processus DOIT imprimer sur stdout EXACTEMENT
 *      `{ campaign_id, crash_simulated: true, completions_before_crash: K }`
 *      puis se terminer avec un code de sortie NON NUL, sans traiter les
 *      jobs restants (A5 : simule un arret, cahier:L371-377). Sortie JSON
 *      normale : `{ campaign_id, jobs_submitted, results: [{ job_id,
 *      echoed_index, phase, artifact_reference }] }`, `phase`='COMPLETED'
 *      (cahier:L97) pour chaque job acheve, `artifact_reference` = `null`
 *      sauf pour le job vise par (ii).
 *
 * (3) `distribution-resume --campaign-id <id> --postgres-database <db>
 *      [--export-history <chemin>]` — reprend, depuis l'etat PERSISTE sous
 *      `campaign_id` (meme base), un run interrompu par (2) et acheve tous
 *      les jobs restants. Sortie JSON : `{ campaign_id, jobs_total,
 *      results: [{ job_id, echoed_index, phase }] }` — `jobs_total` est le
 *      compte ORIGINAL de jobs soumis avant l'arret, pas seulement ceux
 *      repris.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T40, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 EST `numeric` SUR UNE ARITHMETIQUE QUI POURRAIT SE TROMPER D'UN :
 *     cases.lock.json cible explicitement un off-by-one (4 repetitions au
 *     lieu de 5, ou 23 periodes au lieu de 24 par trajectoire). L'egalite est
 *     donc STRICTE sur les DEUX nombres a la fois (900 ET 21600), jamais l'un
 *     sans l'autre — une implementation qui compterait juste les trajectoires
 *     mais mal les periodes resterait fausse.
 * (2) A2 EST `absence` : LE DANGER DECISIF generique (cases.lock.json le dit
 *     pour ce genre de cas ailleurs) est qu'une commande qui NE FAIT RIEN du
 *     tout rendrait ce cas vert sans rien prouver sur la VALIDATION elle-meme
 *     — mais A1 et A2 PARTAGENT la meme invocation structurelle (meme
 *     sous-commande) : si `trajectories`/`periods` sont corrects (A1), la
 *     commande a bien FAIT quelque chose. A2 ferme alors le danger restant,
 *     propre a lui : que cette validation, en faisant son travail, ait
 *     QUAND MEME appele un fournisseur de modele ou laisse une trace
 *     persistante. Controle INDEPENDANT : `--plan-id` est un UUID fabrique
 *     par cette suite (jamais un litteral du cahier) ; la base est fraiche
 *     (creee par ce cas, jamais reutilisee) donc tout compte AVANT vaut
 *     trivialement 0, et cette suite exige que le compte APRES (occurrences
 *     de ce jeton dans N'IMPORTE QUELLE table) reste a 0 — une implementation
 *     qui ecrirait une trace quelconque attribuable a cette validation serait
 *     demasquee, meme si son compteur auto-declare `model_calls_dispatched`
 *     ment.
 * (3) A3 EST `behaviour` SUR UN COMPTAGE QUI POURRAIT MENTIR AUTANT PAR PERTE
 *     QUE PAR DOUBLON : l'egalite exigee n'est pas `results.length>=100`
 *     (une borne basse laisserait passer un doublon qui compenserait une
 *     perte) mais la TRIPLE egalite : longueur=100, nombre de `job_id`
 *     DISTINCTS=100, et ensemble trie des `echoed_index` EXACTEMENT
 *     [0..99] — un doublon d'index ET un trou se detectent tous deux sur
 *     cette derniere egalite.
 * (4) A4 EST `absence` : LE DANGER DECISIF (cahier:L509 le nomme : « observe
 *     avec barriere ») est qu'un compteur AUTO-DECLARE par la commande
 *     (`peak_concurrent_jobs` ou equivalent) pourrait mentir. Cette suite ne
 *     fait donc confiance a AUCUN champ de sortie pour cette propriete : elle
 *     heberge sa PROPRE barriere HTTP bloquante (meme principe que le
 *     fournisseur bloquant de T26.A1, cahier:L379-385, mais exposee sur le
 *     reseau puisque le sous-processus tourne hors du processus de test) et
 *     compte les connexions SIMULTANEMENT OUVERTES, jamais fermees tant que
 *     ce test ne le decide pas. A CHAQUE liberation (pas seulement au pic
 *     initial), elle reverifie que ce compte ne depasse JAMAIS le plafond —
 *     une implementation qui admettrait le onzieme job apres quelques
 *     liberations, et non des le depart, est donc attrapee aussi.
 * (5) A5 EST `behaviour` : LE DANGER DECISIF est qu'une implementation qui
 *     IGNORERAIT `--test-stop-after-completions` (traitant tous les jobs
 *     sans jamais s'arreter) ferait passer `distribution-resume` trivialement
 *     (rien a reprendre, tout deja fait) SANS avoir jamais prouve qu'un
 *     arret/reprise fonctionne. Cette suite exige donc, dans le MEME cas,
 *     DEUX choses dans cet ordre : (i) la phase d'arret rend reellement
 *     `crash_simulated=true` avec `completions_before_crash` EGAL AU K
 *     demande (ni 0 ni le total) ET un code de sortie non nul — la preuve
 *     qu'un arret a reellement eu lieu AVANT la fin ; (ii) la reprise rend
 *     ENSUITE `jobs_total` egal au N ORIGINAL et une couverture complete et
 *     sans doublon de `echoed_index` sur [0..N-1] (meme discipline qu'A3).
 * (6) A6 EST `absence` : LE DANGER DECISIF est qu'une implementation pourrait
 *     publier un champ `artifact_reference` tout en inlinant QUAND MEME les
 *     octets bruts AILLEURS dans l'export d'historique. Cette suite n'inspecte
 *     jamais le FORMAT de l'export (au choix de l'implementeur, comme pour
 *     `--export-history` de T24) : elle observe seulement sa TAILLE EN
 *     OCTETS sur disque, et exige qu'elle reste tres en-deca (plafond fixe
 *     par cette suite, documente en II ci-dessous) de la taille du gros
 *     artefact genere — un artefact de contenu ALEATOIRE (donc
 *     INCOMPRESSIBLE) rend cette comparaison insensible a une compression
 *     fortuite du fichier d'export.
 * (7) ISOLATION DES SERVICES REELS (cahier:L559, L561) : chaque cas cree sa
 *     PROPRE base PostgreSQL (`creerBase`) et sa propre `campaign_id`
 *     aleatoire — jamais de reutilisation entre cas, jamais de resultat
 *     idempotent reutilise pour simuler une propriete non observee.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 * (cahier:L511, mot pour mot : « ce test ne garantit ni 900 sandboxes
 * simultanes sur une machine donnee, ni une acceleration lineaire, ni un
 * debit fournisseur »)
 *
 *  • Elle ne fait JAMAIS tourner 900 trajectoires reelles : A1/A2 ne
 *    VALIDENT qu'un PROFIL de cette taille (comptage pur), exactement ce que
 *    le titre de T40 annonce (« sans facture IA massive »).
 *  • Elle n'exige pas que `distribution-run-bounded` passe par un serveur
 *    Temporal reel plutot que par l'environnement a saut de temps : le choix
 *    d'infrastructure est un detail d'implementation (meme note que
 *    T24.spec.ts §VI) ; seul le JSON et la taille d'export observables
 *    comptent ici.
 *  • Elle ne mesure ni duree murale ni acceleration : aucune assertion de
 *    cette suite ne compare un temps d'horloge reelle a un seuil de
 *    performance.
 *  • Elle ne relit jamais elle-meme le FORMAT de `--export-history` : comme
 *    pour T24, seule sa TAILLE sert de temoin pour A6.
 *  • Elle ne reverifie pas le detail metier d'une periode (exigences,
 *    validation, Q/R) : c'est T23/T24/T38, qui ont leurs propres suites. T40
 *    observe la CAPACITE DE DISTRIBUTION — comptage, plafond, reprise,
 *    reference d'artefact — jamais le contenu d'une trajectoire reelle.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 300_000;
const PROC_TIMEOUT_MS = 180_000;
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

/* ═════ litteraux du cahier, chacun avec sa ligne (section III) ══════════ */

const MODE = 'recorded'; // cahier:L17-24 (table B)
const PHASE_FINALE = 'COMPLETED'; // cahier:L97
const CHAMP_CAMPAGNE = 'campaign_id'; // cahier:L78

const PARENTS = 30; // cahier:L509 — « 30 projets »
const SCENARIOS = 2; // cahier:L509 — « 2 scenarios »
const CONFIGURATIONS = 3; // cahier:L509 — « 3 configurations »
const REPETITIONS = 5; // cahier:L509 — « 5 repetitions »
const BUDGETS = 1; // cahier:L509 — « 1 budget »
const TRAJECTOIRES_ATTENDUES = 900; // cahier:L509
const PERIODES_ATTENDUES = 21_600; // cahier:L509
/** Derive PUREMENT des deux nombres ci-dessus (21600 / 900) — pas une valeur
 * fabriquee : si cette division n'est pas entiere, cases.lock.json lui-meme
 * serait incoherent. */
const PERIODES_PAR_TRAJECTOIRE = ((): number => {
  const q = PERIODES_ATTENDUES / TRAJECTOIRES_ATTENDUES;
  if (!Number.isInteger(q)) throw new Error(`21600/900 non entier : ${q}`);
  return q;
})();

const JOBS_BORNES = 100; // cahier:L509 — « test borne de 100 workflows courts »
const PLAFOND_JOBS_ACTIFS = 10; // cahier:L509 — « plafond dix jobs actifs »

/** FABRIQUES PAR CETTE SUITE (cahier ne chiffre ni le nombre de jobs du test
 * de plafond, ni celui du test d'arret/reprise, ni la taille des gros
 * artefacts) : */
const JOBS_POUR_TEST_PLAFOND = 22; // > PLAFOND_JOBS_ACTIFS, sans rapport avec un autre nombre du fichier
const JOBS_POUR_TEST_REPRISE = 9;
const ARRET_APRES_COMPLETIONS = 4; // < JOBS_POUR_TEST_REPRISE
const TAILLE_GROS_ARTEFACT_OCTETS = 4_000_000; // 4 Mo
const PLAFOND_TAILLE_HISTORIQUE_OCTETS = 150_000; // 150 Ko — tres en-deca de 4 Mo

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L559) */

const RUN = `t40_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

/** Toutes les tables de base d'une base (hors catalogues systeme). */
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
/** Nombre total d'occurrences textuelles de `cle` dans TOUTES les tables de `db`. */
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
function construireUneFois(): void {
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
  } catch {
    /* un echec de build ne change rien : les tentatives suivantes echoueront
     * avec leur propre message, observe par `messageEchec`. */
  }
}

type Tentative = { label: string; argv: string[]; exit: number | null; sortie: string };
type Invocation = { resultat: Json | null; exit: number | null; tentatives: Tentative[] };

/** La premiere entree `apps/cli`/`tools/bench` qui a repondu, memorisee pour
 * eviter de rescanner/rebuild a chaque appel. */
let entreeGagnante: string[] | null = null;

function envCli(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

function invoquer(sousCommande: string, drapeaux: string[]): Invocation {
  const tentatives: Tentative[] = [];
  const env = envCli();
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
  construireUneFois();
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

/** Resout l'entree gagnante (apps/cli ou tools/bench) sans invoquer de
 * sous-commande, pour les besoins du `spawn` asynchrone d'A4. Reutilise
 * `entreeGagnante` s'il a deja ete fixe par un cas precedent. */
function resoudreEntreePourSpawn(): string[] | null {
  if (entreeGagnante !== null) return entreeGagnante;
  for (const c of entreesCli()) {
    if (fs.existsSync(c.argv[0])) {
      entreeGagnante = c.argv;
      return c.argv;
    }
  }
  construireUneFois();
  for (const c of entreesCli()) {
    if (fs.existsSync(c.argv[0])) {
      entreeGagnante = c.argv;
      return c.argv;
    }
  }
  return null;
}

/* ───────────────────────── invocation asynchrone (A4, interaction vivante) */

type ProcessusVivant = {
  attendre: () => Promise<{ exit: number | null; stdout: string; stderr: string }>;
  /** Instantane NON BLOQUANT de ce qui a deja ete observe — utilise par les
   * messages d'echec d'un `attendreCondition` encore en cours, pour NOMMER
   * ce qui s'est reellement passe (argv tente, sortie deja recue) plutot
   * qu'un texte generique. */
  diagnostic: () => string;
};

function lancerEnTacheDeFond(sousCommande: string, drapeaux: string[]): ProcessusVivant {
  const entree = resoudreEntreePourSpawn();
  if (entree === null) {
    return {
      attendre: async () => ({ exit: null, stdout: '', stderr: 'AUCUNE-ENTREE-CANDIDATE apps/cli ni tools/bench' }),
      diagnostic: () => `${sousCommande} : AUCUNE-ENTREE-CANDIDATE dans apps/cli ni tools/bench`,
    };
  }
  const argv = [...entree, sousCommande, ...drapeaux];
  const child = spawn('node', argv, { cwd: REPO, env: envCli(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let sorti: { code: number | null } | null = null;
  child.stdout.on('data', (d: Buffer) => {
    stdout += d.toString('utf8');
  });
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString('utf8');
  });
  const fini = new Promise<{ exit: number | null; stdout: string; stderr: string }>((resolve) => {
    child.on('close', (code) => {
      sorti = { code };
      resolve({ exit: code, stdout, stderr });
    });
    child.on('error', (e) => {
      sorti = { code: null };
      resolve({ exit: null, stdout, stderr: `${stderr}\n${String(e)}` });
    });
  });
  return {
    attendre: () => fini,
    diagnostic: () =>
      `${argv.join(' ')} [${sorti === null ? 'en cours' : `sorti, exit ${rendu(sorti.code)}`}] stdout=${court(stdout, 300)} stderr=${court(stderr, 300)}`,
  };
}

/* ─────────────────────────────────── barriere HTTP reelle (IV.4, cahier L379-385) */

/** Barriere HTTP bloquante, FABRIQUEE PAR CETTE SUITE et hebergee par le
 * PROCESSUS DE TEST (pas par le sous-processus CLI) : chaque requete GET
 * recue reste EN SUSPENS (la reponse n'est jamais ecrite) jusqu'a ce que ce
 * test appelle explicitement `libererUn()`. `active` est le nombre de
 * requetes SIMULTANEMENT ouvertes — il ne diminue JAMAIS tout seul, ce qui
 * rend tout pic observe durable, pas une fenetre de course. */
function demarrerBarriereHttp(): Promise<{
  url: string;
  active: () => number;
  totalArrivees: () => number;
  libererUn: () => boolean;
  fermer: () => Promise<void>;
}> {
  const enAttente: Array<http.ServerResponse> = [];
  let totalArrivees = 0;
  const serveur = http.createServer((_req, res) => {
    totalArrivees += 1;
    enAttente.push(res);
  });
  return new Promise((resolve) => {
    serveur.listen(0, '127.0.0.1', () => {
      const addr = serveur.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/barriere-t40`,
        active: () => enAttente.length,
        totalArrivees: () => totalArrivees,
        libererUn: (): boolean => {
          const res = enAttente.shift();
          if (res === undefined) return false;
          res.end('libere');
          return true;
        },
        fermer: () =>
          new Promise<void>((r) => {
            for (const res of enAttente.splice(0)) res.end('fermeture');
            serveur.close(() => r());
          }),
      });
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function attendreCondition(predicat: () => boolean, timeoutMs: number, intervalleMs = 50): Promise<boolean> {
  const debut = Date.now();
  for (;;) {
    if (predicat()) return true;
    if (Date.now() - debut >= timeoutMs) return false;
    await delay(intervalleMs);
  }
}

/* ───────────────────────────── extraction typee du contrat fixe (III) */

type ResultatJob = { job_id: string; echoed_index: number; phase?: unknown; artifact_reference: string | null };
function commeResultatsJobs(v: unknown): ResultatJob[] | null {
  if (!Array.isArray(v)) return null;
  const out: ResultatJob[] = [];
  for (const e of v) {
    if (e === null || typeof e !== 'object') return null;
    const o = e as Json;
    const id = o.job_id;
    const idx = o.echoed_index;
    if (typeof id !== 'string' || typeof idx !== 'number' || !Number.isInteger(idx)) return null;
    const ref = o.artifact_reference;
    if (ref !== null && typeof ref !== 'string') return null;
    out.push({ job_id: id, echoed_index: idx, phase: o.phase, artifact_reference: ref === undefined ? null : ref });
  }
  return out;
}

/** Verifie, SANS exception sur un index manquant (`noUncheckedIndexedAccess`),
 * que l'ensemble trie des `echoed_index` est EXACTEMENT [0..n-1] : un doublon
 * ET un trou se detectent tous deux sur cette egalite (IV.3). */
function indexCompletsSansDoublon(resultats: ResultatJob[], n: number): boolean {
  const indices = resultats.map((r) => r.echoed_index).slice().sort((a, b) => a - b);
  if (indices.length !== n) return false;
  const attendu = Array.from({ length: n }, (_, i) => i);
  return JSON.stringify(indices) === JSON.stringify(attendu);
}
function jobIdsDistincts(resultats: ResultatJob[]): number {
  return new Set(resultats.map((r) => r.job_id)).size;
}

/* ─────────────────────────────── contexte d'une invocation isolee (IV.7) */

type Contexte = { campaignId: string; db: string };
let compteurId = 0;
function idFor(prefixe: string): string {
  compteurId += 1;
  return `${prefixe}-${RUN}-${compteurId}`;
}
function nouveauContexte(suffixe: string): Contexte {
  return { campaignId: `t40-${RUN}-${suffixe}-${randomUUID()}`, db: creerBase(suffixe) };
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T40 — verifier la capacite de distribution sans facture IA massive', () => {
  test(
    'T40.A1 plan 30x2x3x5x1 produit 900 trajectoires et 21600 periodes (cahier:L509)',
    () => {
      const ctx = nouveauContexte('a1');
      const appel = invoquer('plan-distribution', [
        '--campaign-id', ctx.campaignId,
        '--mode', MODE,
        '--parents', String(PARENTS),
        '--scenarios', String(SCENARIOS),
        '--configurations', String(CONFIGURATIONS),
        '--repetitions', String(REPETITIONS),
        '--budgets', String(BUDGETS),
        '--periods-per-trajectory', String(PERIODES_PAR_TRAJECTOIRE),
        '--postgres-database', ctx.db,
        '--plan-id', idFor('plan-a1'),
      ]);
      exige(appel.resultat !== null, 'commande-plan-distribution-executee', messageEchec('plan-distribution', appel));
      exige(appel.exit === 0, 'plan-distribution-sort-en-0', `exit observe ${rendu(appel.exit)} : ${messageEchec('plan-distribution', appel)}`);
      const p = appel.resultat as Json;

      exige(p[CHAMP_CAMPAGNE] === ctx.campaignId, `${CHAMP_CAMPAGNE}-echo (cahier:L78)`, `vu ${rendu(p[CHAMP_CAMPAGNE])}`);
      exige(
        p.trajectories === TRAJECTOIRES_ATTENDUES,
        `trajectories=${TRAJECTOIRES_ATTENDUES} (cahier:L509)`,
        `vu ${rendu(p.trajectories)} dans ${rendu(p)}`,
      );
      exige(
        p.periods === PERIODES_ATTENDUES,
        `periods=${PERIODES_ATTENDUES} (cahier:L509)`,
        `vu ${rendu(p.periods)} dans ${rendu(p)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T40.A2 la validation du plan fait zero appel modele (cahier:L509, controle independant IV.2)',
    () => {
      const ctx = nouveauContexte('a2');
      const planId = idFor('plan-a2');
      const appel = invoquer('plan-distribution', [
        '--campaign-id', ctx.campaignId,
        '--mode', MODE,
        '--parents', String(PARENTS),
        '--scenarios', String(SCENARIOS),
        '--configurations', String(CONFIGURATIONS),
        '--repetitions', String(REPETITIONS),
        '--budgets', String(BUDGETS),
        '--periods-per-trajectory', String(PERIODES_PAR_TRAJECTOIRE),
        '--postgres-database', ctx.db,
        '--plan-id', planId,
      ]);
      exige(appel.resultat !== null, 'commande-plan-distribution-executee', messageEchec('plan-distribution', appel));
      exige(appel.exit === 0, 'plan-distribution-sort-en-0', `exit observe ${rendu(appel.exit)}`);
      const p = appel.resultat as Json;

      // Compteur auto-declare : necessaire mais PAS suffisant (IV.2).
      exige(p.model_calls_dispatched === 0, 'model_calls_dispatched=0 (auto-declare)', `vu ${rendu(p.model_calls_dispatched)} dans ${rendu(p)}`);

      // CONTROLE INDEPENDANT DECISIF : base fraiche (creee par ce cas), donc
      // tout compte AVANT valait trivialement 0 ; le jeton `planId` est
      // fabrique par cette suite (jamais un litteral du cahier). Si la
      // validation avait ecrit quoi que ce soit d'attribuable a CE plan
      // (par exemple une trace d'appel modele portant cet id), ce compte
      // serait > 0.
      const apres = occurrences(ctx.db, planId);
      exige(apres === 0, 'zero-trace-persistante-attribuable-a-ce-plan (controle independant)', `occurrences(${rendu(planId)})=${rendu(apres)} dans ${ctx.db}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T40.A3 test borne de ${JOBS_BORNES} workflows courts avec Activites factices : ${JOBS_BORNES} resultats, sans doublon (cahier:L509, L361-369)`,
    () => {
      const ctx = nouveauContexte('a3');
      const appel = invoquer('distribution-run-bounded', [
        '--campaign-id', ctx.campaignId,
        '--mode', MODE,
        '--jobs', String(JOBS_BORNES),
        '--postgres-database', ctx.db,
      ]);
      exige(appel.resultat !== null, 'commande-distribution-run-bounded-executee', messageEchec('distribution-run-bounded', appel));
      exige(appel.exit === 0, 'distribution-run-bounded-sort-en-0', `exit observe ${rendu(appel.exit)} : ${messageEchec('distribution-run-bounded', appel)}`);
      const p = appel.resultat as Json;

      exige(p.jobs_submitted === JOBS_BORNES, `jobs_submitted=${JOBS_BORNES}`, `vu ${rendu(p.jobs_submitted)}`);
      const resultats = commeResultatsJobs(p.results);
      exige(resultats !== null, 'results-present-et-bien-forme', `vu ${rendu(p.results)} dans ${rendu(p)}`);
      const r = resultats as ResultatJob[];

      exige(r.length === JOBS_BORNES, `results.length=${JOBS_BORNES} (decisif)`, `vu ${r.length}`);
      exige(jobIdsDistincts(r) === JOBS_BORNES, `${JOBS_BORNES}-job_id-distincts (aucun doublon, decisif)`, `vu ${jobIdsDistincts(r)} distincts sur ${r.length}`);
      exige(
        indexCompletsSansDoublon(r, JOBS_BORNES),
        `echoed_index-couvre-exactement-[0..${JOBS_BORNES - 1}]-sans-trou-ni-doublon (decisif, IV.3)`,
        `vu ${rendu(r.map((x) => x.echoed_index).sort((a, b) => a - b))}`,
      );
      for (const job of r) {
        exige(job.phase === PHASE_FINALE, `chaque-job-en-phase=${PHASE_FINALE} (cahier:L97)`, `job ${rendu(job.job_id)} phase=${rendu(job.phase)}`);
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T40.A4 plafond de ${PLAFOND_JOBS_ACTIFS} jobs actifs jamais depasse, observe avec barriere HTTP reelle (cahier:L509, L379-385)`,
    async () => {
      const ctx = nouveauContexte('a4');
      const barriere = await demarrerBarriereHttp();
      try {
        const proc = lancerEnTacheDeFond('distribution-run-bounded', [
          '--campaign-id', ctx.campaignId,
          '--mode', MODE,
          '--jobs', String(JOBS_POUR_TEST_PLAFOND),
          '--max-concurrent', String(PLAFOND_JOBS_ACTIFS),
          '--test-activity-barrier-url', barriere.url,
          '--postgres-database', ctx.db,
        ]);
        const fini = proc.attendre();

        // Attend que le pic initial soit atteint (temoin positif : la
        // barriere a bien ete contactee, donc une admission a bien eu lieu).
        const atteint = await attendreCondition(() => barriere.active() >= PLAFOND_JOBS_ACTIFS, 60_000, 100);
        exige(
          atteint,
          `au-moins-${PLAFOND_JOBS_ACTIFS}-admissions-observees-sur-la-barriere (temoin positif)`,
          `active=${barriere.active()} apres 60s — ${proc.diagnostic()}`,
        );
        // Laisse une eventuelle sur-admission tardive se produire avant de juger.
        await delay(500);

        // LE CONTROLE DECISIF (IV.4) : a chaque liberation, jamais plus de
        // PLAFOND_JOBS_ACTIFS connexions simultanement ouvertes sur la
        // barriere — verifie a CHAQUE iteration, pas seulement au premier pic.
        for (let i = 0; i < JOBS_POUR_TEST_PLAFOND; i += 1) {
          exige(
            barriere.active() <= PLAFOND_JOBS_ACTIFS,
            `jamais-plus-de-${PLAFOND_JOBS_ACTIFS}-actifs-simultanement (iteration ${i}, decisif)`,
            `active=${barriere.active()} au lieu de <= ${PLAFOND_JOBS_ACTIFS}`,
          );
          if (i === 0) {
            exige(
              barriere.active() === PLAFOND_JOBS_ACTIFS,
              `pic-initial-exactement-${PLAFOND_JOBS_ACTIFS} (le plafond est reellement atteint, pas sous-utilise)`,
              `active=${barriere.active()}`,
            );
          }
          const liberee = barriere.libererUn();
          exige(liberee, `liberation-${i}-reussie (une connexion etait en attente)`, `active=${barriere.active()} totalArrivees=${barriere.totalArrivees()}`);
          // Laisse une admission de remplacement, s'il en reste, atteindre la barriere.
          await delay(120);
        }

        const sortie = await fini;
        const j = jsonDeSortie(sortie.stdout);
        exige(sortie.exit === 0, 'distribution-run-bounded-sort-en-0-apres-drainage-complet', `exit=${rendu(sortie.exit)} stdout=${court(sortie.stdout)} stderr=${court(sortie.stderr)}`);
        exige(j !== null, 'sortie-json-presente-apres-drainage', `stdout=${court(sortie.stdout)}`);
        const p = j as Json;
        exige(p.jobs_submitted === JOBS_POUR_TEST_PLAFOND, `jobs_submitted=${JOBS_POUR_TEST_PLAFOND}`, `vu ${rendu(p.jobs_submitted)}`);
        const resultats = commeResultatsJobs(p.results);
        exige(resultats !== null, 'results-present-et-bien-forme', `vu ${rendu(p.results)}`);
        const r = resultats as ResultatJob[];
        exige(jobIdsDistincts(r) === JOBS_POUR_TEST_PLAFOND, `${JOBS_POUR_TEST_PLAFOND}-job_id-distincts-malgre-le-plafond`, `vu ${jobIdsDistincts(r)}`);
        exige(
          indexCompletsSansDoublon(r, JOBS_POUR_TEST_PLAFOND),
          `echoed_index-couvre-[0..${JOBS_POUR_TEST_PLAFOND - 1}]-malgre-le-plafond`,
          `vu ${rendu(r.map((x) => x.echoed_index).sort((a, b) => a - b))}`,
        );
      } finally {
        await barriere.fermer();
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T40.A5 arret/reprise du scheduler ne perd aucun job (cahier:L509, L371-377)`,
    () => {
      const ctx = nouveauContexte('a5');

      // PHASE 1 : provoque un arret force apres exactement ARRET_APRES_COMPLETIONS
      // completions durablement persistees (point d'injection NOMME, III).
      const arret = invoquer('distribution-run-bounded', [
        '--campaign-id', ctx.campaignId,
        '--mode', MODE,
        '--jobs', String(JOBS_POUR_TEST_REPRISE),
        '--test-stop-after-completions', String(ARRET_APRES_COMPLETIONS),
        '--postgres-database', ctx.db,
      ]);
      exige(arret.resultat !== null, 'commande-distribution-run-bounded-a-produit-du-json-avant-l-arret', messageEchec('distribution-run-bounded (arret)', arret));
      const a = arret.resultat as Json;
      exige(a[CHAMP_CAMPAGNE] === ctx.campaignId, `${CHAMP_CAMPAGNE}-echo-sur-l-arret (cahier:L78)`, `vu ${rendu(a[CHAMP_CAMPAGNE])}`);
      exige(a.crash_simulated === true, 'crash_simulated=true (l-arret-a-reellement-eu-lieu, decisif)', `vu ${rendu(a.crash_simulated)} dans ${rendu(a)}`);
      exige(
        a.completions_before_crash === ARRET_APRES_COMPLETIONS,
        `completions_before_crash=${ARRET_APRES_COMPLETIONS} (exactement le K demande, ni 0 ni le total)`,
        `vu ${rendu(a.completions_before_crash)} dans ${rendu(a)}`,
      );
      exige(arret.exit !== 0, "l-arret-force-sort-en-code-non-nul (preuve qu-il n-a pas simplement fini)", `exit observe ${rendu(arret.exit)}`);

      // PHASE 2 : reprise, MEME campagne, MEME base — doit retrouver TOUS les
      // jobs d'origine, pas seulement ceux restes en attente.
      const reprise = invoquer('distribution-resume', [
        '--campaign-id', ctx.campaignId,
        '--postgres-database', ctx.db,
      ]);
      exige(reprise.resultat !== null, 'commande-distribution-resume-executee', messageEchec('distribution-resume', reprise));
      exige(reprise.exit === 0, 'distribution-resume-sort-en-0', `exit observe ${rendu(reprise.exit)} : ${messageEchec('distribution-resume', reprise)}`);
      const p = reprise.resultat as Json;

      exige(p[CHAMP_CAMPAGNE] === ctx.campaignId, `${CHAMP_CAMPAGNE}-echo-sur-la-reprise (cahier:L78)`, `vu ${rendu(p[CHAMP_CAMPAGNE])}`);
      exige(
        p.jobs_total === JOBS_POUR_TEST_REPRISE,
        `jobs_total=${JOBS_POUR_TEST_REPRISE} (le compte ORIGINAL, pas seulement les jobs repris, decisif)`,
        `vu ${rendu(p.jobs_total)} dans ${rendu(p)}`,
      );
      const resultats = commeResultatsJobs(p.results);
      exige(resultats !== null, 'results-present-et-bien-forme-apres-reprise', `vu ${rendu(p.results)}`);
      const r = resultats as ResultatJob[];
      exige(jobIdsDistincts(r) === JOBS_POUR_TEST_REPRISE, `${JOBS_POUR_TEST_REPRISE}-job_id-distincts-apres-reprise (aucun doublon)`, `vu ${jobIdsDistincts(r)}`);
      exige(
        indexCompletsSansDoublon(r, JOBS_POUR_TEST_REPRISE),
        `echoed_index-couvre-exactement-[0..${JOBS_POUR_TEST_REPRISE - 1}]-apres-reprise (aucun-job-perdu, decisif)`,
        `vu ${rendu(r.map((x) => x.echoed_index).sort((a, b) => a - b))}`,
      );
      for (const job of r) {
        exige(job.phase === PHASE_FINALE, `chaque-job-en-phase=${PHASE_FINALE}-apres-reprise (cahier:L97)`, `job ${rendu(job.job_id)} phase=${rendu(job.phase)}`);
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    `T40.A6 les historiques referencent les gros artefacts, ils n'en portent pas le contenu (cahier:L84-95, L361-369)`,
    () => {
      const ctx = nouveauContexte('a6');
      const cheminHistorique = path.join(os.tmpdir(), `t40-${RUN}-a6-${randomUUID()}.history.json`);

      const appel = invoquer('distribution-run-bounded', [
        '--campaign-id', ctx.campaignId,
        '--mode', MODE,
        '--jobs', '2',
        '--test-large-artifact-bytes', String(TAILLE_GROS_ARTEFACT_OCTETS),
        '--export-history', cheminHistorique,
        '--postgres-database', ctx.db,
      ]);
      exige(appel.resultat !== null, 'commande-distribution-run-bounded-executee', messageEchec('distribution-run-bounded', appel));
      exige(appel.exit === 0, 'distribution-run-bounded-sort-en-0', `exit observe ${rendu(appel.exit)} : ${messageEchec('distribution-run-bounded', appel)}`);
      const p = appel.resultat as Json;

      const resultats = commeResultatsJobs(p.results);
      exige(resultats !== null, 'results-present-et-bien-forme', `vu ${rendu(p.results)}`);
      const r = resultats as ResultatJob[];
      exige(r.length === 2, 'results.length=2', `vu ${r.length}`);
      const jobAvecArtefact = r.find((x) => x.echoed_index === 0);
      exige(jobAvecArtefact !== undefined, 'job-d-index-0-present (porteur du gros artefact)', `vu ${rendu(r)}`);
      const ja = jobAvecArtefact as ResultatJob;
      exige(
        typeof ja.artifact_reference === 'string' && ja.artifact_reference.length > 0 && ja.artifact_reference.length <= 256,
        'artifact_reference-est-une-reference-courte-non-vide (presente, cahier:L84-95 CheckpointManifest.fichiers/files)',
        `vu ${rendu(ja.artifact_reference)}`,
      );

      exige(fs.existsSync(cheminHistorique), 'fichier-d-historique-exporte-present', `chemin absent : ${cheminHistorique}`);
      const tailleOctets = fs.statSync(cheminHistorique).size;

      // LE CONTROLE DECISIF (IV.6, absence) : la taille de l'export reste tres
      // en-deca de la taille du gros artefact — un artefact de ${TAILLE_GROS_ARTEFACT_OCTETS}
      // octets ALEATOIRES (donc incompressible) qui serait inline dans
      // l'historique ferait exploser cette taille, meme compresse.
      exige(
        tailleOctets < PLAFOND_TAILLE_HISTORIQUE_OCTETS,
        `taille-export-historique < ${PLAFOND_TAILLE_HISTORIQUE_OCTETS} octets (vs artefact de ${TAILLE_GROS_ARTEFACT_OCTETS} octets, decisif)`,
        `taille observee ${tailleOctets} octets`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});
