/**
 * acceptance/T41.spec.ts — suite d'acceptation de la tache T41.
 *
 * Cas requis (verification/cases.lock.json, gele, cahier_line 519) :
 *   T41.A1 behaviour — `bench doctor` identifie CHAQUE dependance absente
 *   T41.A2 absence   — aucune cle reelle necessaire pour TOUS les gates recorded
 *   T41.A3 refusal   — `--mode live` sans modele/budget/credential echoue
 *                      AVANT toute emission
 *   T41.A4 absence   — `campaign cancel` ne supprime ni ses artefacts, ni
 *                      ceux d'une autre campagne
 *   T41.A5 refusal   — un echec d'acceptation fait echouer la CI de
 *                      qualification (code de sortie non nul)
 *   T41.A6 absence   — le nettoyage ne cible QUE les ressources portant
 *                      l'identite de test
 *   T41.A7 artifact  — les commandes documentees/figees dans le help
 *                      correspondent aux commandes reellement parsees
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` de T41 —
 * `apps/cli`, `infra`, `docs` (verification/tasks.json#T41) — et ne les a lus
 * ni directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL, une
 * discipline auditable au diff, pas une barriere technique). Le contrat
 * teste ci-dessous est derive de docs/specs/T41.md et des lignes du cahier
 * qu'il epingle, plus des contrats DEJA PUBLIES par les suites d'acceptation
 * des dependances directes de T41 (T30, T36, T37, T38, T39, T40) et par
 * `verification/runner/doctor.mjs` / `tools/svc.mjs` — deux fichiers HARNESS
 * (verification/ownership.json, zone HARNESS = `verification/runner/**`,
 * `tools/**`), donc hors de la zone dont cette suite doit rester aveugle,
 * exactement comme `acceptance/T39.spec.ts` relit `dispatchModelCall` de T17
 * sans lire `packages/gateway`.
 *
 *   L513-L521 titre, dependances, livrables VERBATIM : « CLI complete,
 *         composition locale, CI et nettoyage cible ».
 *   L517  « Commandes minimales » VERBATIM, les 14 commandes et « Syntaxe
 *         exacte et codes de sortie figes dans le help et testes » — fonde
 *         REQUIRED_COMMANDS (section III) et A7.
 *   L519  les sept cas d'acceptation, mot pour mot — et `cahier_line: 519`
 *         dans verification/cases.lock.json pour chacun des sept.
 *   L521  fin : « installation dans un environnement vierge, ... tests avec
 *         reseau externe desactive hors services locaux explicitement
 *         requis » — fonde la nature CLI-en-sous-processus de cette suite et
 *         l'usage exclusif du fournisseur factice (jamais un reseau reel).
 *   L17-L24 §B VERBATIM : mode `recorded` = « agent scripte, reponses et
 *         couts fictifs archives » ; `execution_mode`/`cost_origin`/
 *         `corpus_provenance` TOUJOURS presents ; « les tests ordinaires
 *         n'appellent aucun fournisseur externe » — fonde A2/A3/A4
 *         (`--provider fake`, jamais un reseau reel, meme en mode `live`).
 *   L28   « un defaut de prerequis produit BLOCKED, jamais PASS » — fonde la
 *         forme du refus d'A3 : un ECHEC, jamais une execution partielle.
 *   L78   identite complete d'une trajectoire — repris pour les champs de
 *         sortie d'A2/A3/A4.
 *   L80   montants : chaines d'entiers non negatifs en micro-USD — fonde le
 *         format verifie sur `total_cost_micro_usd` (A2).
 *   L97   enum `attempt_outcome` — repris pour A2/A4.
 *   L103/L105 F-MONEY (340) / F-BUDGET (1000), racine gelee — tarif et
 *         plafond du manifeste nominal (acceptance/fixtures/campaign-ops/).
 *   L559  `test_run_id` technique unique, « ses bases/schemas, prefixes
 *         d'artefacts, files et ressources » — fonde A6 (nettoyage cible) et
 *         le choix d'une base PARTAGEE entre deux campagnes pour A4 (sans
 *         base partagee, « ne touche pas une autre campagne » serait
 *         trivialement vrai : il n'y aurait rien a toucher).
 *
 * `verification/runner/doctor.mjs` est la SEULE implementation existante,
 * dans ce depot, du vocabulaire que `verification/cases.lock.json` emploie
 * pour A1 (« les sondes de capacite de `bench doctor` ») : les sept noms de
 * capacite de T41 (`node22`, `postgres18`, `s3`, `temporal`,
 * `containers.runc`, `containers.userns`, `fake-provider`) y sont deja les
 * cles de l'objet `probes`, et `verification/tasks.json#T41.requires` les
 * emploie a l'identique. Cette suite les RELIT depuis le registre (jamais
 * recopies a la main), et ne suppose RIEN de plus sur l'implementation de
 * `bench doctor` du produit (apps/cli) : elle etablit sa PROPRE verite
 * terrain, independamment de doctor.mjs (section III.1), pour ne jamais
 * comparer une sonde a elle-meme.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 *   (a) F-MONEY (340) et F-BUDGET (1000) — importes de `acceptance/
 *       reference/**` (racine gelee), et cette suite verifie que les
 *       manifestes de fixture les CONTIENNENT avant de les utiliser.
 *   (b) `execution_mode`/`cost_origin`/`corpus_provenance` (L24),
 *       `recorded`/`live` (L21), l'enum `attempt_outcome` (L97), le format
 *       des montants (L80), `ANTHROPIC_API_KEY` (nom DEJA etabli par la
 *       sonde `live-credentials` de verification/runner/doctor.mjs, pas
 *       invente ici) — chacun avec sa ligne ou sa source.
 *   (c) Les identifiants des manifestes (`PRJ-OPS-1`, `agent-scripted-v1`,
 *       les `campaign_id`) sont LUS dans les fixtures archivees de ce role
 *       (`acceptance/fixtures/campaign-ops/`), jamais recopies a la main.
 *   (d) Les noms de sous-commandes, les schemas JSON de sortie, les noms de
 *       script d'infrastructure NE SONT PAS enonces par le cahier : ils sont
 *       la CONVENTION que cette suite FIXE (section III), au meme titre que
 *       `bench pilot` pour T39 ou `bench.preregistration.bundle/1` pour T30.
 *       Aucune implementation de T41 n'existe au moment ou cette suite est
 *       ecrite (ADR-001) : aucun nom ci-dessous n'a ete obtenu en executant
 *       quoi que ce soit et en figeant ce qu'on a vu passer.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T41 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * 1. `bench doctor --json` (apps/cli) — MEME VOCABULAIRE que
 *    `verification/runner/doctor.mjs` (section I) : stdout JSON portant au
 *    moins `{ capabilities: { <nom>: { present: boolean, detail?: string,
 *    reason?: string } } }`, une entree par capacite de
 *    `verification/tasks.json#T41.requires`. Cette suite n'exige PAS que
 *    l'implementation reutilise doctor.mjs (elle n'en lit jamais le code
 *    pour construire son verdict) ; elle exige seulement que, pour CHAQUE
 *    capacite, `present` corresponde a une VERITE TERRAIN que cette suite
 *    etablit elle-meme, independamment (psql/curl/TCP/runc/unshare direct),
 *    jamais en import doctor.mjs.
 *
 * 2. MANIFESTE `bench.campaign.manifest/1` (FIXE par cette suite, fixtures
 *    sous `acceptance/fixtures/campaign-ops/`, README inclus) :
 *
 *      corpus: { groups: [ { source_parent_project_id, source_scenario_id,
 *                            clone_instance_ids: string[] } ] }
 *      model: { name } | {}
 *      price: { tariff_micro_usd } | {}
 *      budget: { cap_micro_usd } | {}
 *      configurations: string[]
 *      repetitions: number
 *      periods_per_trajectory: number
 *
 *    `model`/`budget` sont ABSENTS si leur objet est `{}` (meme regle que
 *    `bench.pilot.manifest/1`, T39). Le troisieme prerequis des gates
 *    `live`, `credential`, N'EST PAS un champ du manifeste : il est lu dans
 *    `ANTHROPIC_API_KEY` (section I).
 *
 * 3. SOUS-COMMANDES `campaign` (FIXEES par cette suite) :
 *
 *      bench campaign preflight <manifest.json> --mode recorded|live
 *          --campaign-id <id>
 *        Lecture seule, AUCUNE ecriture, AUCUN appel modele. Stdout JSON :
 *          ready                  boolean
 *          missing_prerequisites  string[] sous-ensemble de
 *                                 ['model','budget'] (+ 'credential' en live)
 *          execution_mode
 *
 *      bench campaign run <manifest.json> --campaign-id <id>
 *          --postgres-database <db> --s3-bucket <bucket>
 *          --mode recorded|live --provider fake
 *        EXECUTE reellement via le fournisseur FACTICE (L17-24, jamais un
 *        reseau reel, meme en mode `live` — meme discipline que T39.A5).
 *        PRET (model+budget presents, + credential si live) : stdout JSON
 *          execution_mode, cost_origin, corpus_provenance   (L24, TOUJOURS)
 *          campaign_id
 *          trajectories: [{ ..., attempt_outcome }]          (L97)
 *          total_cost_micro_usd                              chaine (L80)
 *        REFUSE (un prerequis manque) AVANT toute emission : exit non nul,
 *        stdout/stderr JSON { ready:false, missing_prerequisites: string[],
 *        execution_started:false }, ET AUCUNE ecriture en base pour ce
 *        `campaign_id` (verifie directement en base, pas seulement via la
 *        valeur de retour — meme discipline que T37/T38/T39).
 *
 *      bench campaign cancel --campaign-id <id> --postgres-database <db>
 *          --s3-bucket <bucket>
 *        Ne supprime AUCUNE ligne, d'AUCUNE table, pour AUCUN `campaign_id`
 *        de la base donnee — ni le sien, ni celui d'une autre campagne qui y
 *        vit (L559 : namespace de TEST, pas un silo par campagne).
 *
 * 4. SCRIPTS D'INFRASTRUCTURE (FIXES par cette suite, livrable L515
 *    « CI et nettoyage cible », aucun nom de fichier n'etant impose) :
 *
 *      infra/ci/qualify.sh [jest-args...]
 *        SANS argument : execute la batterie complete (`pnpm test` puis, si
 *        elle reussit, `pnpm test:py`) et PROPAGE un code de sortie non nul
 *        si L'UNE des deux echoue. AVEC des arguments : point d'injection de
 *        TEST, meme convention que `--test-stop-after-phase` (T23) ou
 *        `--test-force-all-candidates-fail` (T39) — transmet ces arguments
 *        tels quels a `pnpm exec jest` SEUL (la moitie Python n'est alors
 *        pas executee), pour permettre de sonder isolement la propagation du
 *        code de sortie sans dependre de l'etat des 44 taches reelles.
 *
 *      infra/ci/cleanup.sh <test_run_id>
 *        Supprime les bases PostgreSQL dont le nom correspond exactement au
 *        prefixe `bench_<test_run_id>_*` (meme convention de nommage que
 *        `acceptance/T37.spec.ts`/`T39.spec.ts`, deja etablie dans ce
 *        depot), et RIEN d'autre : aucune base sans ce prefixe exact, aucune
 *        base d'un AUTRE `test_run_id`, meme prefixee `bench_`.
 *
 * 5. `apps/cli/README.md` (zone IMPL, livrable L517 « figes dans le help »)
 *    : un document contenant, pour chacune des 14 commandes de
 *    REQUIRED_COMMANDS, un span de code `` `bench <commande>` ``.
 *    `bench --help` doit lister, chacune sur sa PROPRE ligne a exactement
 *    DEUX espaces d'indentation (meme convention textuelle que `tools/bench`
 *    — voir sa constante `USAGE` — une discipline deja en vigueur dans ce
 *    depot, pas inventee ici), la forme complete de chaque commande
 *    effectivement parsee.
 *
 *    CORRECTION (etage ARBITRAGE, refus de l'implementeur sur ce commit) :
 *    cette suite fixait a l'origine `docs/cli-reference.md` (zone DOCS,
 *    verification/ownership.json). DOCS n'est ecrivable, dans la partition
 *    des roles, QUE par `integrator` ; or le pipeline qui fait progresser une
 *    tache (.claude/workflows/bench-driver.mjs) ne fait jamais ecrire de code
 *    a `integrator` — ses seules etapes ecrivantes sont IMPL (role
 *    `implementer`, zones IMPL/HARNESS/INFRA) et ARBITRAGE (role
 *    `test-author`, zones ACCEPTANCE/MUTANT/GENERATOR). Fixer le document de
 *    reference dans DOCS rendait donc A7 structurellement IMPOSSIBLE a
 *    satisfaire : aucun role de la boucle n'a jamais le droit d'ecrire ce
 *    fichier, quelle que soit la qualite de l'implementation. Ce n'est pas le
 *    cahier qui impose `docs/cli-reference.md` — section II(d) ci-dessus est
 *    explicite : le nom du document est une CONVENTION que cette suite FIXE,
 *    pas un literal du cahier. La convention est donc corrigee vers
 *    `apps/cli/README.md`, a l'interieur de la zone IMPL (`apps/**`) que le
 *    role `implementer` peut deja ecrire en travaillant sur `apps/cli` — sans
 *    toucher a une seule assertion, a l'egalite ensembliste exigee, ni a
 *    l'ensemble des 14 commandes minimales.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LE REFUS N'EST PAS UNE COMPETENCE — DANGERS PROPRES A CHAQUE CAS
 *
 * (A1) cases.lock.json : « stuber les sondes ... un rapport vide, ou toutes
 *      les dependances declarees presentes, alors qu'une dependance est
 *      reellement retiree ». Cette suite etablit sa PROPRE verite terrain
 *      pour cinq des sept capacites (`postgres18`, `s3`, `temporal` par
 *      redirection d'hote/port ; `containers.runc`, `containers.userns` par
 *      masquage de PATH — jamais une mutation destructive et permanente de
 *      l'hote, qui romprait les suites concurrentes des 43 autres taches) et
 *      compare le rapport de `bench doctor` a CETTE verite, jamais a une
 *      valeur fixe : un hote ou `s3`/`temporal` ne tournent pas encore
 *      echoue pour la bonne raison (verite terrain fausse ET rapport vrai),
 *      jamais pour la mauvaise. `node22` et `fake-provider`, eux, ne sont
 *      verifies que STRUCTURELLEMENT (presents dans le rapport, au moins un
 *      booleen) — les basculer reellement exigerait soit un second
 *      interprete Node hors de la plage `>=22 <23`, soit de corrompre
 *      `packages/gateway` pour la duree du cas, deux mutations qui
 *      romprataient les suites concurrentes des 43 autres taches.
 *
 * (A2) cases.lock.json : « sous un simple stub, la non-necessite resterait
 *      trivialement vraie ». Chaque gate est donc exerce avec
 *      `ANTHROPIC_API_KEY` explicitement ABSENTE de l'environnement ET un
 *      CONTROLE POSITIF independant (occurrence du `campaign_id` en base
 *      apres `run`) qui prouve qu'une execution REELLE a eu lieu — sans ce
 *      controle, une implementation qui n'ecrirait jamais rien nulle part
 *      verdirait ce cas par accident (meme garde que T39.A6).
 *
 * (A3) cases.lock.json : « un stub qui leve ferait echouer la commande et
 *      laisserait le cas vert ». Les trois prerequis (`model`, `budget`,
 *      `credential`) sont donc isoles UN PAR UN (meme boucle que T39.A2),
 *      avec verification que les DEUX AUTRES ne sont PAS nommes manquants ;
 *      un CONTROLE POSITIF (les trois presents, mode `live`, fournisseur
 *      factice) doit aboutir a une execution, pour exclure un refus
 *      universel de `--mode live` ; `sortieNonPlantee` exclut qu'un simple
 *      plantage (TypeError, etc.) soit confondu avec un refus deliberer ;
 *      l'ABSENCE de toute trace en base apres chaque refus est la preuve
 *      d'« avant toute emission ».
 *
 * (A4) cases.lock.json : « une annulation stubee qui ne fait rien laisserait
 *      les artefacts en place et le cas vert » — limite ASSUMEE d'un cas
 *      `absence` : cette suite ne peut pas distinguer une annulation
 *      correcte d'une annulation qui ne fait RIEN. Elle verifie neanmoins
 *      que `cancel` REND un verdict exploitable (pas un plantage silencieux)
 *      et que les deux campagnes, sur une base PARTAGEE (sinon la propriete
 *      serait vide de sens), conservent un nombre d'occurrences IDENTIQUE
 *      avant/apres.
 *
 * (A5) cases.lock.json : « un stub qui leve ferait echouer la CI et
 *      laisserait le cas vert ». Cette suite n'utilise donc PAS le registre
 *      reel (ou TOUT echoue aujourd'hui, pour la raison legitime
 *      NOT_IMPLEMENTED) : elle isole la PROPAGATION du code de sortie sur
 *      DEUX sondes jetables et synthetiques, l'une qui reussit, l'autre qui
 *      echoue, exactement comme T00.A2/A3 isolent le runner sur des
 *      « taches-sonde » plutot que sur le registre des 44 taches.
 *
 * (A6) cases.lock.json : « un nettoyage stube qui ne supprime rien le
 *      laisserait vert ». A la difference d'A4 (deja red aujourd'hui via sa
 *      dependance a `campaign run`), la mise en place d'A6 — creer des bases
 *      PostgreSQL brutes par `psql` — reussit DEJA independamment de toute
 *      implementation de T41 : sans garde-fou, ce cas serait donc VACUOUS
 *      (vert avant meme qu'`infra/ci/cleanup.sh` existe), exactement ce que
 *      `verification/runner/red.mjs` refuse (« un cas VERT a ce stade est
 *      VACUOUS »). Cette suite rend donc DECISIVE la moitie positive (la
 *      base CIBLEE doit reellement disparaitre), sans affaiblir la moitie
 *      qui tue le mutant nomme (« retirer le filtre d'identite de test ») :
 *      un selecteur ELARGI continue de supprimer la cible (donc continue de
 *      satisfaire la moitie positive) et ne peut etre detecte QUE par
 *      l'assertion suivante, qu'une base SANS AUCUN prefixe de test survit
 *      au nettoyage cible sur un `test_run_id` dont elle ne porte pas la
 *      marque.
 *
 * (A7) cases.lock.json : « aucun export metier n'est en jeu, stuber n'y
 *      changerait rien » — cette suite n'importe donc RIEN de business ; elle
 *      extrait DEUX ensembles (texte de `--help`, spans de code de
 *      `apps/cli/README.md`) par deux regles de lecture INDEPENDANTES et
 *      exige leur EGALITE ENSEMBLISTE (pas seulement une inclusion), pour
 *      detecter aussi bien l'ajout d'une commande non parsee que le retrait
 *      d'une commande non documentee.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI
 *
 *  • Elle ne reprouve pas l'arithmetique d'un cout (T16), le calcul Q/R/G
 *    (T31-T34) ni la compilation d'un plan de campagne (T39/T40) : elle
 *    observe des PROPRIETES OPERATIONNELLES du CLI (gating, non-destruction,
 *    propagation d'echec, correspondance documentaire), jamais le contenu
 *    scientifique d'une trajectoire.
 *  • Elle n'exerce `campaign plan`, `scenario validate`, `campaign status`,
 *    `campaign resume`, `checkpoint inspect`/`fork`, `billing reconcile`,
 *    `analysis export`/`run` et `report build` QUE via A7 (existence
 *    documentee/parsee) : aucun des sept cas requis n'exige d'observer leur
 *    comportement metier.
 *  • Elle n'exige aucun credential reel : `ANTHROPIC_API_KEY`, quand il est
 *    pose, est une chaine FACTICE, et `--provider fake` garantit qu'aucun
 *    appel reseau reel n'est jamais tente (L17-24, L521).
 *  • A1 ne couvre `node22` et `fake-provider` que structurellement
 *    (section IV) — un `bench doctor` qui mentirait SPECIFIQUEMENT sur ces
 *    deux capacites, et sur elles seules, echapperait a cette suite.
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 600_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

/* ────────────────────────────────────────────────────────────────── socle */

type Json = Record<string, unknown>;

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
const MANIFEST_DIR = path.join(REPO, 'acceptance', 'fixtures', 'campaign-ops');

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Rendu TEXTUEL PROFOND, pour que les messages d'echec NOMMENT ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 8) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}
const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/* ═══════════════ racines gelees apres T01, jamais recopiees a la main ══ */

function readReference(nom: string): Json {
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${nom}.json`), 'utf8')) as Json;
}
function refValue(doc: Json, dotted: string): unknown {
  let cur: unknown = doc;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') throw new Error(`REFERENCE-CHEMIN-ABSENT ${dotted} (bloque a ${seg})`);
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) throw new Error(`REFERENCE-VALEUR-ABSENTE ${dotted}`);
  return cur;
}

/** 340 micro-USD, tarif de reference (cahier:L103). */
const TARIF_DE_REFERENCE = String(refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.cout_attendu.valeur'));
/** 1000 micro-USD, plafond de reference (cahier:L105). */
const PLAFOND_DE_REFERENCE = String(refValue(readReference('F-BUDGET'), 'valeurs.budget.valeur'));

/* ─────────────────────────────── litteraux du cahier, chacun avec sa ligne */

const MODE_RECORDED = 'recorded'; // cahier:L21
const MODE_LIVE = 'live'; // cahier:L21
const CHAMP_MODE_EXECUTION = 'execution_mode'; // cahier:L24
const CHAMP_ORIGINE_COUTS = 'cost_origin'; // cahier:L24
const CHAMP_PROVENANCE = 'corpus_provenance'; // cahier:L24
const ISSUES_TENTATIVE = ['SUCCESS', 'FAILED', 'CANCELLED'] as const; // cahier:L97
const FORMAT_MONTANT_L80 = /^[0-9]+$/; // cahier:L80
/** Nom DEJA etabli par verification/runner/doctor.mjs (sonde `live-credentials`), pas invente ici. */
const VARIABLE_CREDENTIAL = 'ANTHROPIC_API_KEY';

/** Ce qui N'EST PAS un refus : un plantage (meme convention que T00/T17/T25/T37/T39). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* cahier:L517, verbatim — les 14 commandes minimales de T41. */
const REQUIRED_COMMANDS = [
  'doctor',
  'scenario validate',
  'campaign plan',
  'campaign preflight',
  'campaign run',
  'campaign status',
  'campaign cancel',
  'campaign resume',
  'checkpoint inspect',
  'checkpoint fork',
  'billing reconcile',
  'analysis export',
  'analysis run',
  'report build',
] as const;

/* ────────────────────────────────── fixtures de manifeste (campaign-ops) */

function lireManifeste(nom: string): Json {
  return JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, `${nom}.json`), 'utf8')) as Json;
}
const NOMINAL = lireManifeste('manifest-nominal');
const MANQUE_MODELE = lireManifeste('manifest-missing-model');
const MANQUE_BUDGET = lireManifeste('manifest-missing-budget');

if (((NOMINAL.price as Json).tariff_micro_usd as string) !== TARIF_DE_REFERENCE) {
  throw new Error(`FIXTURE-DESYNCHRONISEE manifest-nominal.price != F-MONEY (${TARIF_DE_REFERENCE})`);
}
if (((NOMINAL.budget as Json).cap_micro_usd as string) !== PLAFOND_DE_REFERENCE) {
  throw new Error(`FIXTURE-DESYNCHRONISEE manifest-nominal.budget != F-BUDGET (${PLAFOND_DE_REFERENCE})`);
}
if (Object.keys(MANQUE_MODELE.model as Json).length !== 0) throw new Error('FIXTURE-INCORRECTE manifest-missing-model.model doit etre {}');
if (Object.keys(MANQUE_BUDGET.budget as Json).length !== 0) throw new Error('FIXTURE-INCORRECTE manifest-missing-budget.budget doit etre {}');

/* ═══════════════════════ registre reel : les 7 capacites de T41 ═══════ */

function lireRequiresT41(): string[] {
  const reg = JSON.parse(fs.readFileSync(path.join(REPO, 'verification', 'tasks.json'), 'utf8')) as Json;
  const tasks = (reg.tasks as Json[] | undefined) ?? [];
  const t = tasks.find((x) => x.id === 'T41');
  if (!t || !Array.isArray(t.requires)) throw new Error('REGISTRE-T41-REQUIRES-INTROUVABLE verification/tasks.json');
  return (t.requires as unknown[]).map(String);
}
const T41_REQUIRES = lireRequiresT41();
for (const attendu of ['node22', 'postgres18', 's3', 'temporal', 'containers.runc', 'containers.userns', 'fake-provider']) {
  if (!T41_REQUIRES.includes(attendu)) throw new Error(`REGISTRE-T41-INATTENDU requires ne contient pas ${attendu} : ${rendu(T41_REQUIRES)}`);
}

/* ══════════════════════════ PostgreSQL REEL (requires: postgres18) ═══════ */

const RUN = `t41_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function trySh(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeout = 6000): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], env });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown };
    return { ok: false, out: `${String(err.stdout ?? '')}${String(err.stderr ?? '')}`.trim() };
  }
}

function dsnFor(db: string, host = SOCKET_DIR, user = PG_USER): string {
  return `postgresql://${encodeURIComponent(user)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(host)}`;
}
function psql(db: string, sql: string, host = SOCKET_DIR, user = PG_USER): { ok: boolean; out: string } {
  return trySh('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db, host, user), '-c', sql], process.env, 15000);
}
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();
const BASES_CREEES: string[] = [];
function dropBase(nom: string): void {
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
}
function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  dropBase(nom);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(r.ok ? 'base-postgresql-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`).toBe('base-postgresql-creee'); // cahier:L141 (controles reels)
  BASES_CREEES.push(nom);
  return nom;
}
function baseExiste(nom: string): boolean {
  return psql(ADMIN_DB, `SELECT 1 FROM pg_database WHERE datname = '${nom.replace(/'/g, "''")}'`).out.trim() === '1';
}

/** Occurrences textuelles de `cle` dans TOUTES les tables de `db` (meme technique que T23/T37/T39). */
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
      return { schema: schema as string, nom: nom as string };
    });
}
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;
function occurrences(db: string, cle: string): number {
  const tables = tablesDeBase(db);
  if (tables.length === 0) return 0;
  const parts = tables.map((t) => `SELECT count(*) AS n FROM "${t.schema}"."${t.nom}" x WHERE x::text LIKE ${lit(`%${cle}%`)}`);
  const r = psql(db, parts.join(' UNION ALL '));
  if (!r.ok) return -1;
  return r.out
    .split('\n')
    .map((l) => Number.parseInt(l.trim(), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => a + b, 0);
}

/* ─────────────────────────────── la commande, observee comme un PROCESSUS */

/**
 * Candidats d'entree pour apps/cli UNIQUEMENT — contrairement a
 * `acceptance/T39.spec.ts`, cette liste n'inclut PAS `tools/bench` : ce
 * fichier HARNESS porte deja sa PROPRE commande `doctor` (capacites du
 * verificateur, section I), sans rapport avec le `bench doctor` du PRODUIT
 * que T41 doit livrer. L'inclure ferait croire, sous A1, qu'une capacite du
 * produit est prouvee alors que seul le verificateur a repondu.
 */
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
  return out;
}

function executerBrut(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout = PROC_TIMEOUT_MS,
): { exit: number | null; stdout: string; sortie: string } {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd: REPO,
      encoding: 'utf8',
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { exit: 0, stdout, sortie: stdout };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    const so = String(err.stdout ?? '');
    const se = String(err.stderr ?? '');
    return { exit: err.status ?? null, stdout: so, sortie: `${so}\n${se}` };
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
    execFileSync('pnpm', ['build'], { cwd: REPO, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: 0, sortie: 'build ok' });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: err.status ?? null, sortie: court(`${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}`, 400) });
  }
}

type AppelCli = { resultat: Json | null; exit: number | null; tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[] };

/** Une invocation `bench <sousArgv...>` — processus NEUF a chaque appel (meme discipline que T23/T27/T38/T39). */
function invoquer(sousArgv: string[], env: NodeJS.ProcessEnv): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, ...sousArgv];
      const r = executerBrut('node', argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 500) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, exit: dernierExit, tentatives };
  construireUneFois(tentatives);
  const second = essayer();
  return { resultat: second, exit: dernierExit, tentatives };
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') || 'aucune entree candidate dans apps/cli'}`;
}

function sortieNonPlantee(appel: AppelCli): void {
  const dernier = appel.tentatives[appel.tentatives.length - 1];
  expect(
    dernier !== undefined && MARQUEURS_DE_PLANTAGE.test(dernier.sortie) ? `PLANTAGE-DETECTE ${court(dernier.sortie)}` : 'pas-de-plantage',
  ).toBe('pas-de-plantage');
}

function interpretMontant(v: unknown): number | null {
  if (typeof v === 'string' && FORMAT_MONTANT_L80.test(v)) return Number.parseInt(v, 10);
  return null;
}

/** Texte brut de `bench --help` (jamais du JSON) — meme logique de decouverte+build que `invoquer`. */
function obtenirAide(): { texte: string; tentatives: AppelCli['tentatives'] } {
  const tentatives: AppelCli['tentatives'] = [];
  const essayer = (): string | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, '--help'];
      const r = executerBrut('node', argv, process.env);
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 2000) });
      if (r.sortie.trim().length > 0) return r.sortie;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { texte: premier, tentatives };
  construireUneFois(tentatives);
  const second = essayer();
  return { texte: second ?? '', tentatives };
}

function ecrireManifesteTemporaire(nomBase: string, manifeste: Json): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't41-'));
  TMP_DIRS.push(dir);
  const p = path.join(dir, `${nomBase}.json`);
  fs.writeFileSync(p, JSON.stringify(manifeste), 'utf8');
  return p;
}

const TMP_DIRS: string[] = [];

/** Contexte frais : campaign_id, base et seau PROPRES (cahier:L559), sauf si `partage` est fourni. */
function nouveauContexte(suffixe: string, partage?: { db: string; bucket: string }): { campaignId: string; db: string; bucket: string } {
  return {
    campaignId: `t41-${RUN}-${suffixe}-${randomUUID()}`,
    db: partage?.db ?? creerBase(suffixe),
    bucket: partage?.bucket ?? `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
  };
}

function campaignPreflight(manifeste: Json, suffixe: string, mode: string, env: NodeJS.ProcessEnv): { ctx: { campaignId: string; db: string; bucket: string }; appel: AppelCli } {
  const ctx = nouveauContexte(suffixe);
  const p = ecrireManifesteTemporaire(suffixe, manifeste);
  const appel = invoquer(['campaign', 'preflight', p, '--mode', mode, '--campaign-id', ctx.campaignId], env);
  return { ctx, appel };
}

function campaignRun(
  manifeste: Json,
  suffixe: string,
  mode: string,
  env: NodeJS.ProcessEnv,
  partage?: { db: string; bucket: string },
): { ctx: { campaignId: string; db: string; bucket: string }; appel: AppelCli } {
  const ctx = nouveauContexte(suffixe, partage);
  const p = ecrireManifesteTemporaire(suffixe, manifeste);
  const appel = invoquer(
    ['campaign', 'run', p, '--campaign-id', ctx.campaignId, '--postgres-database', ctx.db, '--s3-bucket', ctx.bucket, '--mode', mode, '--provider', 'fake'],
    env,
  );
  return { ctx, appel };
}

function campaignCancel(campaignId: string, db: string, bucket: string, env: NodeJS.ProcessEnv): AppelCli {
  return invoquer(['campaign', 'cancel', '--campaign-id', campaignId, '--postgres-database', db, '--s3-bucket', bucket], env);
}

function benchDoctor(env: NodeJS.ProcessEnv): AppelCli {
  return invoquer(['doctor', '--json'], env);
}

function envAvecPg(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}
function envSansCredential(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const e = { ...envAvecPg(base) };
  delete e[VARIABLE_CREDENTIAL];
  return e;
}
function envAvecCredentialFactice(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...envAvecPg(base), [VARIABLE_CREDENTIAL]: 'sk-test-t41-factice-jamais-reseau' };
}

/* ══════════════════════ verite terrain INDEPENDANTE (A1) ══════════════ */

function pgJoignable(env: NodeJS.ProcessEnv): boolean {
  return trySh('psql', ['-tAc', 'SELECT 1'], env, 5000).ok;
}
function s3Joignable(env: NodeJS.ProcessEnv): boolean {
  const ep = env.S3_ENDPOINT ?? 'http://127.0.0.1:9000';
  const r = trySh('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '3', ep], env, 5000);
  return r.ok && r.out !== '000';
}
function temporalJoignable(env: NodeJS.ProcessEnv): Promise<boolean> {
  const addr = env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
  const [host, portStr] = addr.split(':');
  const port = Number(portStr ?? 7233);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: host ?? '127.0.0.1', port, timeout: 3000 });
    const fin = (ok: boolean): void => {
      try {
        socket.destroy();
      } catch {
        /* deja ferme */
      }
      resolve(ok);
    };
    socket.once('connect', () => fin(true));
    socket.once('timeout', () => fin(false));
    socket.once('error', () => fin(false));
  });
}
function runcFonctionne(env: NodeJS.ProcessEnv): boolean {
  return trySh('runc', ['--version'], env, 5000).ok;
}
function usernsFonctionne(env: NodeJS.ProcessEnv): boolean {
  return trySh('unshare', ['--user', '--map-root-user', '--net', '--pid', '--mount', '--fork', '/bin/sh', '-c', 'echo BENCH-T41-USERNS-OK'], env, 6000).out.includes(
    'BENCH-T41-USERNS-OK',
  );
}

/** Repertoire de binaires FACTICES qui echouent toujours, prepende au PATH — jamais une mutation permanente de l'hote. */
function repertoireBinairesMasques(noms: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't41-maskbin-'));
  TMP_DIRS.push(dir);
  for (const nom of noms) {
    const p = path.join(dir, nom);
    fs.writeFileSync(p, '#!/bin/sh\necho "T41.A1 : binaire masque pour le test" >&2\nexit 1\n');
    fs.chmodSync(p, 0o755);
  }
  return dir;
}
function envAvecPathMasque(noms: string[], base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const dir = repertoireBinairesMasques(noms);
  return { ...base, PATH: `${dir}:${base.PATH ?? ''}` };
}

afterAll(() => {
  for (const db of BASES_CREEES) dropBase(db);
  for (const dir of TMP_DIRS) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* au mieux */
    }
  }
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════════════════════════════════════════════ */

describe('T41 — livrer les commandes operationnelles et la CI de qualification', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T41.A1 doctor identifie chaque dependance absente',
    async () => {
      const envNormal = envAvecPg();

      // (0) GARDE « RAPPORT VIDE » : chacune des 7 capacites requises doit
      // apparaitre, avec un `present` booleen — avant toute perturbation.
      const appelBase = benchDoctor(envNormal);
      expect(appelBase.resultat !== null ? 'doctor-execute' : `DOCTOR-EN-ECHEC ${messageEchec('T41.A1 base', appelBase)}`).toBe('doctor-execute');
      sortieNonPlantee(appelBase);
      const rBase = appelBase.resultat as Json;
      const capsBase = (rBase.capabilities ?? {}) as Json;
      for (const nom of T41_REQUIRES) {
        expect(capsBase[nom] !== undefined ? `${nom}-dans-rapport` : `RAPPORT-VIDE(${nom}) ${rendu(capsBase)}`).toBe(`${nom}-dans-rapport`);
        expect(typeof (capsBase[nom] as Json).present).toBe('boolean');
      }

      // (1)-(5) CINQ CAPACITES BASCULABLES SANS MUTATION PERMANENTE DE
      // L'HOTE (section IV.A1). Chacune compare le rapport a une VERITE
      // TERRAIN INDEPENDANTE, etablie AVANT ET APRES la perturbation —
      // jamais a une valeur fixe (robuste a un hote ou s3/temporal ne
      // tournent pas encore).
      type Bascule = { nom: string; casse: (e: NodeJS.ProcessEnv) => NodeJS.ProcessEnv; verite: (e: NodeJS.ProcessEnv) => boolean | Promise<boolean> };
      const bascules: Bascule[] = [
        { nom: 'postgres18', casse: (e) => ({ ...e, PGHOST: '/nonexistent-bench-t41-a1-postgres' }), verite: pgJoignable },
        { nom: 's3', casse: (e) => ({ ...e, S3_ENDPOINT: 'http://127.0.0.1:1' }), verite: s3Joignable },
        { nom: 'temporal', casse: (e) => ({ ...e, TEMPORAL_ADDRESS: '127.0.0.1:1' }), verite: temporalJoignable },
        { nom: 'containers.runc', casse: (e) => envAvecPathMasque(['runc'], e), verite: runcFonctionne },
        { nom: 'containers.userns', casse: (e) => envAvecPathMasque(['unshare'], e), verite: usernsFonctionne },
      ];

      const observations: string[] = [];
      for (const b of bascules) {
        const envCasse = b.casse(envNormal);
        const veriteApres = await b.verite(envCasse);
        expect(veriteApres === false ? `${b.nom}-reellement-casse` : `PERTURBATION-SANS-EFFET(${b.nom}) la verite terrain reste vraie malgre la perturbation`).toBe(
          `${b.nom}-reellement-casse`,
        );

        const appel = benchDoctor(envCasse);
        expect(appel.resultat !== null ? `doctor-execute-${b.nom}` : `DOCTOR-EN-ECHEC(${b.nom}) ${messageEchec('T41.A1', appel)}`).toBe(`doctor-execute-${b.nom}`);
        sortieNonPlantee(appel);
        const r = appel.resultat as Json;
        const caps = (r.capabilities ?? {}) as Json;
        const entree = (caps[b.nom] ?? {}) as Json;
        expect(entree.present === false ? `${b.nom}-nomme-absent` : `ABSENCE-NON-NOMMEE(${b.nom}) ${rendu(entree)}`).toBe(`${b.nom}-nomme-absent`);
        const motif = String(entree.reason ?? entree.detail ?? '');
        expect(motif.length > 0 ? `${b.nom}-motif-present` : `MOTIF-VIDE(${b.nom})`).toBe(`${b.nom}-motif-present`);

        // Les AUTRES capacites, non touchees par CETTE perturbation,
        // doivent rester en accord avec LEUR PROPRE verite terrain
        // ambiante — un rapport qui basculerait tout a ABSENT en meme
        // temps ne nommerait rien de precis.
        for (const autre of bascules) {
          if (autre.nom === b.nom) continue;
          const veriteAutre = await autre.verite(envNormal);
          const presentAutre = ((caps[autre.nom] ?? {}) as Json).present;
          expect(presentAutre === veriteAutre ? `${autre.nom}-non-affecte` : `FAUX-POSITIF-CROISE perturbation=${b.nom} capacite=${autre.nom} rapport=${rendu(presentAutre)} verite=${rendu(veriteAutre)}`).toBe(
            `${autre.nom}-non-affecte`,
          );
        }
        observations.push(`${b.nom}: rapport=ABSENT motif="${court(motif, 60)}"`);
      }

      console.log(`[T41.A1] ${observations.join(' | ')}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T41.A2 aucune cle reelle necessaire pour tous les gates recorded',
    () => {
      const envSansCle = envSansCredential();
      expect(envSansCle[VARIABLE_CREDENTIAL]).toBeUndefined();

      // GATE 1 — `campaign preflight --mode recorded`, sans la cle.
      const { appel: appelPreflight } = campaignPreflight(clone(NOMINAL), 'a2-preflight', MODE_RECORDED, envSansCle);
      expect(appelPreflight.resultat !== null ? 'preflight-execute' : `PREFLIGHT-EN-ECHEC ${messageEchec('T41.A2 preflight', appelPreflight)}`).toBe('preflight-execute');
      sortieNonPlantee(appelPreflight);
      const rPreflight = appelPreflight.resultat as Json;
      expect(rPreflight.ready === true ? 'preflight-recorded-pret-sans-cle' : `PREFLIGHT-RECORDED-REFUSE-SANS-CLE ${rendu(rPreflight)}`).toBe('preflight-recorded-pret-sans-cle');
      const manquantsPreflight = (Array.isArray(rPreflight.missing_prerequisites) ? (rPreflight.missing_prerequisites as unknown[]) : []).map(String);
      expect(manquantsPreflight.length === 0 ? 'aucun-manquant' : `PREREQUIS-FANTOME(credential-sans-cle) ${rendu(manquantsPreflight)}`).toBe('aucun-manquant');

      // GATE 2 — `campaign run --mode recorded`, sans la cle : DOIT
      // reellement executer (controle positif IV.A2), pas un stub.
      const { ctx: ctxRun, appel: appelRun } = campaignRun(clone(NOMINAL), 'a2-run', MODE_RECORDED, envSansCle);
      expect(appelRun.resultat !== null ? 'run-recorded-execute-sans-cle' : `RUN-RECORDED-EN-ECHEC-SANS-CLE ${messageEchec('T41.A2 run', appelRun)}`).toBe('run-recorded-execute-sans-cle');
      sortieNonPlantee(appelRun);
      const rRun = appelRun.resultat as Json;
      expect(rRun[CHAMP_MODE_EXECUTION] === MODE_RECORDED ? 'execution_mode-recorded' : `EXECUTION_MODE-INATTENDU ${rendu(rRun[CHAMP_MODE_EXECUTION])}`).toBe('execution_mode-recorded'); // cahier:L21
      const origine = String(rRun[CHAMP_ORIGINE_COUTS] ?? '');
      const provenance = String(rRun[CHAMP_PROVENANCE] ?? '');
      expect(origine.length > 0 ? 'cost_origin-present' : 'COST_ORIGIN-ABSENT').toBe('cost_origin-present'); // cahier:L24
      expect(provenance.length > 0 ? 'corpus_provenance-present' : 'CORPUS_PROVENANCE-ABSENT').toBe('corpus_provenance-present'); // cahier:L24
      const total = interpretMontant(rRun.total_cost_micro_usd);
      expect(total !== null ? 'total_cost_micro_usd-conforme' : `MONTANT-NON-CONFORME (cahier:L80) ${rendu(rRun.total_cost_micro_usd)}`).toBe('total_cost_micro_usd-conforme');

      // CONTROLE POSITIF INDEPENDANT, en base reelle (IV.A2) : une
      // implementation qui n'ecrirait jamais rien ne doit pas verdir ce cas.
      const occ = occurrences(ctxRun.db, ctxRun.campaignId);
      expect(occ > 0 ? 'run-recorded-a-reellement-ecrit' : `CONTROLE-INVALIDE aucune trace de ${ctxRun.campaignId} apres --mode recorded sans cle (n=${occ})`).toBe(
        'run-recorded-a-reellement-ecrit',
      );

      console.log(`[T41.A2] preflight.ready=${rendu(rPreflight.ready)} run.execution_mode=${rendu(rRun[CHAMP_MODE_EXECUTION])} occurrences=${occ}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    "T41.A3 l option live sans modele, budget ou credential echoue avant emission",
    () => {
      const motifs: Record<string, RegExp> = {
        model: /model|mod[eè]le/i,
        budget: /budget/i,
        credential: /credential|anthropic|cl[eé]/i,
      };

      type Scenario = { cle: keyof typeof motifs; manifeste: Json; env: NodeJS.ProcessEnv };
      const scenarios: Scenario[] = [
        { cle: 'model', manifeste: MANQUE_MODELE, env: envAvecCredentialFactice() },
        { cle: 'budget', manifeste: MANQUE_BUDGET, env: envAvecCredentialFactice() },
        { cle: 'credential', manifeste: NOMINAL, env: envSansCredential() },
      ];

      const observes: string[] = [];
      for (const s of scenarios) {
        const { ctx, appel } = campaignRun(clone(s.manifeste), `a3-${s.cle}`, MODE_LIVE, s.env);
        // Le refus doit etre LU (JSON exploitable), jamais un plantage
        // non structure (IV.A3 : « un stub qui leve... »).
        expect(appel.resultat !== null ? `refus-structure(${s.cle})` : `REFUS-NON-STRUCTURE(${s.cle}) ${messageEchec('T41.A3', appel)}`).toBe(`refus-structure(${s.cle})`);
        sortieNonPlantee(appel);
        expect(appel.exit === 0 ? `CODE-DE-SORTIE-ZERO-A-TORT(${s.cle})` : `refus-exit-non-nul(${s.cle})`).toBe(`refus-exit-non-nul(${s.cle})`);

        const r = appel.resultat as Json;
        expect(r.ready === false ? `${s.cle}-refuse` : `${String(s.cle).toUpperCase()}-MANQUANT-ACCEPTE-A-TORT ${rendu(r)}`).toBe(`${s.cle}-refuse`);
        expect(r.execution_started === false ? `${s.cle}-execution_started-false` : `EXECUTION_STARTED-A-TORT-VRAI(${s.cle}) ${rendu(r.execution_started)}`).toBe(`${s.cle}-execution_started-false`);

        const manquants = (Array.isArray(r.missing_prerequisites) ? (r.missing_prerequisites as unknown[]) : []).map(String);
        const nommeLeBon = manquants.some((m) => motifs[s.cle]!.test(m));
        expect(nommeLeBon ? `${s.cle}-nomme` : `REFUS-MUET(${s.cle}) attendu dans ${rendu(manquants)}`).toBe(`${s.cle}-nomme`);
        const autres = (Object.keys(motifs) as (keyof typeof motifs)[]).filter((k) => k !== s.cle);
        const fauxPositifs = autres.filter((k) => manquants.some((m) => motifs[k]!.test(m)));
        expect(fauxPositifs.length === 0 ? `${s.cle}-isole` : `FAUX-POSITIFS(${s.cle}) ${rendu(fauxPositifs)} dans ${rendu(manquants)}`).toBe(`${s.cle}-isole`);

        // « AVANT TOUTE EMISSION » : aucune trace en base pour CE campaign_id.
        const occ = occurrences(ctx.db, ctx.campaignId);
        expect(occ === 0 ? `${s.cle}-aucune-emission` : `EMISSION-AVANT-REFUS(${s.cle}) ${ctx.campaignId} apparait ${occ} fois en base malgre le refus`).toBe(`${s.cle}-aucune-emission`);

        observes.push(`${s.cle}: exit=${rendu(appel.exit)} manquants=${manquants.join('+')}`);
      }

      // CONTROLE POSITIF (IV.A3) : les trois prerequis presents, `--mode
      // live`, fournisseur FACTICE (jamais un reseau reel, L17-24) DOIT
      // aboutir a une execution — exclut un refus universel de `--mode live`.
      const { ctx: ctxOk, appel: appelOk } = campaignRun(clone(NOMINAL), 'a3-controle-positif', MODE_LIVE, envAvecCredentialFactice());
      expect(appelOk.resultat !== null ? 'controle-positif-execute' : `CONTROLE-POSITIF-EN-ECHEC ${messageEchec('T41.A3 controle', appelOk)}`).toBe('controle-positif-execute');
      sortieNonPlantee(appelOk);
      const rOk = appelOk.resultat as Json;
      expect(rOk[CHAMP_MODE_EXECUTION] === MODE_LIVE ? 'execution_mode-live' : `LIVE-REFUSE-A-TORT-AVEC-TOUT-PRESENT ${rendu(rOk)}`).toBe('execution_mode-live');
      const occOk = occurrences(ctxOk.db, ctxOk.campaignId);
      expect(occOk > 0 ? 'controle-positif-a-reellement-ecrit' : `CONTROLE-POSITIF-INVALIDE aucune trace apres live complet (n=${occOk})`).toBe('controle-positif-a-reellement-ecrit');

      console.log(`[T41.A3] ${observes.join(' | ')} controle_positif.execution_mode=${rendu(rOk[CHAMP_MODE_EXECUTION])}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T41.A4 annuler une campagne ne supprime ni ses artefacts ni ceux d une autre',
    () => {
      // BASE PARTAGEE (IV.A4, cahier:L559) : sans elle, « ne touche pas une
      // autre campagne » serait trivialement vrai faute de cible.
      const dbPartagee = creerBase('a4-partagee');
      const bucketPartage = `bench-${RUN}-a4-partagee`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60);
      const partage = { db: dbPartagee, bucket: bucketPartage };

      const { ctx: ctxX, appel: appelX } = campaignRun(clone(NOMINAL), 'a4-x', MODE_RECORDED, envAvecPg(), partage);
      expect(appelX.resultat !== null ? 'run-X-execute' : `RUN-X-EN-ECHEC ${messageEchec('T41.A4 X', appelX)}`).toBe('run-X-execute');
      sortieNonPlantee(appelX);

      const { ctx: ctxY, appel: appelY } = campaignRun(clone(NOMINAL), 'a4-y', MODE_RECORDED, envAvecPg(), partage);
      expect(appelY.resultat !== null ? 'run-Y-execute' : `RUN-Y-EN-ECHEC ${messageEchec('T41.A4 Y', appelY)}`).toBe('run-Y-execute');
      sortieNonPlantee(appelY);

      const avantX = occurrences(dbPartagee, ctxX.campaignId);
      const avantY = occurrences(dbPartagee, ctxY.campaignId);
      expect(avantX > 0 ? 'X-ecrit' : `CONTROLE-INVALIDE(X) aucune trace de ${ctxX.campaignId} avant annulation`).toBe('X-ecrit');
      expect(avantY > 0 ? 'Y-ecrit' : `CONTROLE-INVALIDE(Y) aucune trace de ${ctxY.campaignId} avant annulation`).toBe('Y-ecrit');

      const appelCancel = campaignCancel(ctxX.campaignId, dbPartagee, bucketPartage, envAvecPg());
      expect(appelCancel.resultat !== null ? 'cancel-structure' : `CANCEL-NON-STRUCTURE ${messageEchec('T41.A4 cancel', appelCancel)}`).toBe('cancel-structure');
      sortieNonPlantee(appelCancel);

      // La base elle-meme doit survivre a l'annulation (sanity minimale).
      expect(baseExiste(dbPartagee) ? 'base-partagee-survit' : 'BASE-PARTAGEE-SUPPRIMEE-A-TORT').toBe('base-partagee-survit');

      const apresX = occurrences(dbPartagee, ctxX.campaignId);
      const apresY = occurrences(dbPartagee, ctxY.campaignId);
      // ASSERTION DECISIVE (IV.A4, cases.lock.json) : ni ses propres
      // artefacts...
      expect(apresX === avantX ? 'artefacts-X-intacts' : `ARTEFACTS-X-ALTERES avant=${avantX} apres=${apresX}`).toBe('artefacts-X-intacts');
      // ...ni ceux d'une AUTRE campagne logee dans la MEME base.
      expect(apresY === avantY ? 'artefacts-Y-intacts' : `ARTEFACTS-Y-ALTERES(voisine) avant=${avantY} apres=${apresY}`).toBe('artefacts-Y-intacts');

      console.log(`[T41.A4] X avant=${avantX} apres=${apresX} | Y(voisine) avant=${avantY} apres=${apresY}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T41.A5 un echec d acceptation fait echouer la CI de qualification',
    () => {
      // Sondes JETABLES et SYNTHETIQUES (IV.A5) — jamais le registre reel
      // des 44 taches, aujourd'hui NOT_IMPLEMENTED pour une raison legitime
      // qui n'a rien a voir avec la propagation du code de sortie ici testee.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't41-ci-probe-'));
      TMP_DIRS.push(dir);
      fs.writeFileSync(
        path.join(dir, 'jest.config.cjs'),
        "module.exports = { testEnvironment: 'node', rootDir: __dirname, testMatch: ['<rootDir>/*.probe.cjs'] };\n",
      );
      fs.writeFileSync(path.join(dir, 'pass.probe.cjs'), "test('sonde-vraie', () => { expect(1 + 1).toBe(2); });\n");
      fs.writeFileSync(path.join(dir, 'fail.probe.cjs'), "test('sonde-fausse', () => { expect(1 + 1).toBe(3); });\n");

      const script = path.join(REPO, 'infra', 'ci', 'qualify.sh');
      const existeAvant = fs.existsSync(script);

      const configArg = path.join(dir, 'jest.config.cjs');
      const rPass = executerBrut('bash', [script, '--config', configArg, 'pass.probe.cjs'], process.env, 120_000);
      const rFail = executerBrut('bash', [script, '--config', configArg, 'fail.probe.cjs'], process.env, 120_000);

      expect(existeAvant ? 'script-ci-present' : `SCRIPT-CI-ABSENT ${script} (attendu : NOT_IMPLEMENTED avant livraison de T41)`).toBe('script-ci-present');

      // VOLET POSITIF D'ABORD : une sonde VRAIE doit sortir en 0 — sans ce
      // volet, un script CI qui echoue INCONDITIONNELLEMENT (et donc
      // satisferait trivialement le volet suivant) passerait ce cas a tort.
      expect(rPass.exit === 0 ? 'ci-sort-0-sur-sonde-vraie' : `CI-ECHOUE-SUR-SONDE-VRAIE exit=${rendu(rPass.exit)} ${court(rPass.sortie)}`).toBe('ci-sort-0-sur-sonde-vraie');

      // ASSERTION DECISIVE (cases.lock.json, A5) : une sonde FAUSSE doit
      // produire un code de sortie NON NUL.
      expect(rFail.exit !== 0 && rFail.exit !== null ? 'ci-sort-non-nul-sur-sonde-fausse' : `CI-PERMISSIVE exit=${rendu(rFail.exit)} ${court(rFail.sortie)}`).toBe(
        'ci-sort-non-nul-sur-sonde-fausse',
      );

      console.log(`[T41.A5] script=${script} existeAvant=${existeAvant} pass.exit=${rendu(rPass.exit)} fail.exit=${rendu(rFail.exit)}`);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T41.A6 le nettoyage ne cible que les ressources portant l identite de test',
    () => {
      const testRunId = `t41a6${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const autreRunId = `t41a6autre${randomUUID().replace(/-/g, '').slice(0, 12)}`;

      const dbCible = `bench_${testRunId}_target`;
      const dbAutreRun = `bench_${autreRunId}_sibling`;
      const dbSansIdentite = `zz_not_a_test_resource_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

      for (const nom of [dbCible, dbAutreRun, dbSansIdentite]) {
        dropBase(nom);
        const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
        expect(r.ok ? `base-creee(${nom})` : `POSTGRESQL-INDISPONIBLE(${nom}) ${court(r.out, 300)}`).toBe(`base-creee(${nom})`);
        BASES_CREEES.push(nom);
      }

      const script = path.join(REPO, 'infra', 'ci', 'cleanup.sh');
      const existeAvant = fs.existsSync(script);
      expect(existeAvant ? 'script-cleanup-present' : `SCRIPT-CLEANUP-ABSENT ${script} (attendu : NOT_IMPLEMENTED avant livraison de T41)`).toBe('script-cleanup-present');
      const r = executerBrut('bash', [script, testRunId], process.env, 60_000);

      // VOLET POSITIF (IV.A6) : la ressource CIBLEE doit reellement
      // disparaitre — SANS cette assertion, un nettoyage qui ne supprime
      // rien du tout (cases.lock.json : « un nettoyage stube ») resterait
      // indetectable, et ce cas serait VACUOUS avant meme toute
      // implementation (verification/runner/red.mjs refuse precisement un
      // vert sans contre-epreuve). La rendre decisive ici n'affaiblit pas
      // l'assertion suivante : un selecteur ELARGI continue de supprimer
      // aussi `dbCible`, donc continue de satisfaire CETTE ligne, et ne peut
      // etre detecte QUE par l'atteinte a `dbSansIdentite` ci-dessous.
      const cibleSubsiste = baseExiste(dbCible);
      expect(cibleSubsiste ? `CIBLE-NON-NETTOYEE ${dbCible} survit a \`infra/ci/cleanup.sh ${testRunId}\` (exit=${rendu(r.exit)} ${court(r.sortie, 200)})` : 'cible-nettoyee').toBe('cible-nettoyee');

      // ASSERTION DECISIVE (cases.lock.json, A6) : une ressource SANS
      // AUCUNE identite de test ne doit JAMAIS etre touchee.
      expect(baseExiste(dbSansIdentite) ? 'ressource-sans-identite-intacte' : `SURPORTEE-DETECTEE ${dbSansIdentite} (sans identite de test) a ete supprimee par le nettoyage de ${testRunId}`).toBe(
        'ressource-sans-identite-intacte',
      );

      // RENFORT (cahier:L559, isolation par test_run_id) : une ressource
      // d'un AUTRE test_run_id, meme prefixee `bench_`, ne doit pas non
      // plus etre touchee.
      expect(baseExiste(dbAutreRun) ? 'ressource-autre-run-intacte' : `ISOLATION-TEST_RUN_ID-ROMPUE ${dbAutreRun} (run ${autreRunId}) a ete supprimee par le nettoyage de ${testRunId}`).toBe(
        'ressource-autre-run-intacte',
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A7 */
  test(
    'T41.A7 les commandes documentees correspondent aux commandes parsees',
    () => {
      // (1) COMMANDES REELLEMENT PARSEES — `bench --help`, AUCUN export
      // metier (IV.A7). Convention FIXEE par cette suite (section III.5) :
      // chaque ligne de commande est indentee par EXACTEMENT deux espaces.
      const { texte: aide, tentatives } = obtenirAide();
      expect(aide.trim().length > 0 ? 'aide-non-vide' : `AIDE-VIDE ${tentatives.map((t) => `${t.label}[${rendu(t.exit)}]`).join(' | ') || 'aucune entree candidate'}`).toBe('aide-non-vide');

      const motifLigneCommande = /^ {2}([a-z][a-z-]*(?: [a-z][a-z-]*)?)(?=[\s[<]|$)/;
      const commandesParsees = new Set<string>();
      for (const ligne of aide.split('\n')) {
        const m = motifLigneCommande.exec(ligne);
        if (m) commandesParsees.add(m[1] as string);
      }

      // (2) COMMANDES DOCUMENTEES ET FIGEES — apps/cli/README.md (zone IMPL,
      // corrige depuis docs/cli-reference.md : section III.5), spans de code
      // `` `bench <commande>` ``.
      const docPath = path.join(REPO, 'apps', 'cli', 'README.md');
      const docExiste = fs.existsSync(docPath);
      const docTexte = docExiste ? fs.readFileSync(docPath, 'utf8') : '';
      const motifSpanDoc = /`bench ((?:[a-z][a-z-]*)(?: (?:[a-z][a-z-]*))?)(?:[ `]|$)/g;
      const commandesDocumentees = new Set<string>();
      for (const m of docTexte.matchAll(motifSpanDoc)) commandesDocumentees.add(m[1] as string);

      // (3) LES 14 COMMANDES MINIMALES (cahier:L517) DOIVENT ETRE DANS LES
      // DEUX ENSEMBLES.
      const manquantesAide = REQUIRED_COMMANDS.filter((c) => !commandesParsees.has(c));
      const manquantesDoc = REQUIRED_COMMANDS.filter((c) => !commandesDocumentees.has(c));
      expect(manquantesAide.length === 0 ? 'toutes-les-commandes-minimales-parsees' : `COMMANDES-NON-PARSEES ${rendu(manquantesAide)} (cahier:L517)`).toBe(
        'toutes-les-commandes-minimales-parsees',
      );
      expect(manquantesDoc.length === 0 ? 'toutes-les-commandes-minimales-documentees' : `COMMANDES-NON-DOCUMENTEES ${rendu(manquantesDoc)} dans ${docPath} (docExiste=${docExiste}, cahier:L517)`).toBe(
        'toutes-les-commandes-minimales-documentees',
      );

      // (4) ASSERTION DECISIVE (cases.lock.json, A7) : EGALITE ENSEMBLISTE
      // entre documente et parse — detecte aussi bien l'AJOUT d'une
      // commande parsee-non-documentee que le RETRAIT d'une commande
      // documentee-non-parsee.
      const seulementAide = [...commandesParsees].filter((c) => !commandesDocumentees.has(c));
      const seulementDoc = [...commandesDocumentees].filter((c) => !commandesParsees.has(c));
      expect(seulementAide.length === 0 ? 'aucune-commande-parsee-non-documentee' : `COMMANDE-PARSEE-NON-DOCUMENTEE ${rendu(seulementAide)}`).toBe('aucune-commande-parsee-non-documentee');
      expect(seulementDoc.length === 0 ? 'aucune-commande-documentee-non-parsee' : `COMMANDE-DOCUMENTEE-NON-PARSEE ${rendu(seulementDoc)}`).toBe('aucune-commande-documentee-non-parsee');

      console.log(`[T41.A7] parsees=${[...commandesParsees].join(',')} documentees=${[...commandesDocumentees].join(',')}`);
    },
    CASE_TIMEOUT_MS,
  );
});
