/**
 * acceptance/T46.spec.ts — suite d'acceptation de la tache T46.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T46.A1 numeric   — un manifeste de N trajectoires sur P periodes produit
 *                      exactement N×P periodes persistees, lues en base,
 *                      chacune portant le scenario et la configuration de sa
 *                      trajectoire
 *   T46.A2 behaviour — une execution interrompue apres k periodes puis
 *                      relancee reprend a la periode k+1, sans periode
 *                      dupliquee ni sautee
 *   T46.A3 numeric   — le rapport de fin agrege les tokens par modele et par
 *                      categorie, et chaque total egale la somme des appels
 *                      persistes correspondants
 *   T46.A4 refusal   — un budget declare sans plafond ne refuse aucune
 *                      trajectoire et est enregistre comme tel, tandis qu'un
 *                      budget absent reste refuse comme l'exige T39
 *   T46.A5 behaviour — chaque periode persistee est rattachee a une
 *                      trajectoire et a une campagne existantes, sans
 *                      periode orpheline
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T46 EST UNE TACHE D'EXTENSION (ADR-007) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T46 — `packages/activities`,
 * `packages/workflows` et `apps/cli` — et ne les a lus ni directement ni par
 * `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, pas une barriere technique). Le contrat teste ci-dessous est derive
 * de docs/specs/T46.md et de sa source, docs/adr/ADR-007-pilote-longitudinal-
 * et-unite-token.md, lignes 157 a 163 (la plage que la carte de T46 epingle
 * dans verification/tasks.extensions.json#spec_source) :
 *
 *   L157  titre : « Conduire un pilote longitudinal reel »
 *   L159  livrables, mot pour mot : « commande conduisant chaque trajectoire
 *         compilee d'un manifeste de pilote, periode par periode, a travers
 *         `run-period` ; reprise apres interruption ; rapport de fin en
 *         tokens par modele et par categorie ; budget declarable sans
 *         plafond »
 *   L161  les cinq cas d'acceptation, mot pour mot
 *   L163  commande : `pnpm verify:task T46` ; « PostgreSQL, le stockage
 *         objet et le fournisseur factice sont requis ; aucune cle reelle
 *         n'est necessaire »
 *
 * Cette suite reprend, sans les reinventer, les contrats DEJA PUBLIES par les
 * suites d'acceptation des trois dependances directes de T46 — lire le
 * contrat PUBLIE d'une dependance (sa propre suite ACCEPTANCE) n'est pas lire
 * l'implementation de T46, exactement comme acceptance/T45.spec.ts reprend
 * `run-period` de T23 sans lire packages/activities, ou acceptance/T44.spec.ts
 * reprend `getModelCall` de T17 sans lire packages/gateway :
 *
 *   - acceptance/T39.spec.ts (II) : le manifeste `bench.pilot.manifest/1`
 *     (corpus/groups/clone_instance_ids, model/price/exposure/budget,
 *     configurations, repetitions, periods_per_trajectory), et le vocabulaire
 *     de refus `missing_prerequisites` ⊆ ['model','price','corpus','exposure',
 *     'budget'] — REPRIS A L'IDENTIQUE pour A4 (moitie « budget absent »).
 *     Cette suite AJOUTE une troisieme forme au prerequis `budget`,
 *     `{ unbounded: true }` (FIXEE ici, section II, requise par L159/L161 —
 *     T39 n'avait aucune raison de la prevoir).
 *   - acceptance/T45.spec.ts (II) : `run-period`, sous-commande deja fixee,
 *     accepte `--campaign-id`/`--postgres-database`/`--s3-bucket`/`--mode`
 *     recorded, et SELON ADR:L121 (section « Ce que j'ai mesure », pas une
 *     lecture d'implementation : l'ADR lui-meme le cite pour justifier la
 *     decision de proposer T46) « `--campaign-id` <id> espace de noms d'une
 *     TRAJECTOIRE » — run-period est donc INVOQUE UNE FOIS PAR TRAJECTOIRE,
 *     jamais une fois par campagne. C'est exactement le fait que cette suite
 *     exploite pour verifier INDEPENDAMMENT, par un second canal que celui du
 *     futur orchestrateur, qu'une trajectoire compilee par T46 est reellement
 *     persistee (A1, A5) : rappeler `run-period` directement sur l'identite
 *     de trajectoire que l'orchestrateur rend doit continuer EXACTEMENT a
 *     `period_index` suivant.
 *   - acceptance/T44.spec.ts (III) : `getModelCall(handle, { model_call_id })`
 *     (packages/gateway), qui lit un enregistrement regle et rend
 *     `{ provider, model, usage: { input_fresh, cache_write_5m,
 *     cache_write_1h, cache_read, output, ... } }` — REPRIS A L'IDENTIQUE
 *     pour A3, afin de ne jamais faire confiance au seul rapport que
 *     l'orchestrateur produit sur lui-meme.
 *
 * ADR-007, section « Ce que j'ai mesure » (PAS la plage L157-163, mais le
 * MEME document de spec, cite comme T45.spec.ts cite ADR:L117 pour la meme
 * raison) nomme en outre deux faits qui bornent le CONTRAT de cette suite :
 *
 *   L51-L61  « `campaign` ne conduit pas `run-period` » : `campaign` ecrit
 *            `trajectories` (UNE campagne, PLUSIEURS trajectoires), tandis
 *            que `run-period` ecrit `bench_run_period_trajectories` (UNE
 *            invocation = UNE trajectoire, L121). C'est PRECISEMENT l'ecart
 *            que T46 doit combler : une commande qui conduit chaque
 *            trajectoire compilee d'UN manifeste de pilote, PERIODE PAR
 *            PERIODE, A TRAVERS run-period. Elle ne peut donc pas reutiliser
 *            tel quel `bench campaign run` (T41, autre manifeste, autre
 *            schema, AUCUNE dependance de T46 sur T41) ni `bench pilot
 *            --execute` seul (T39, schema disjoint de run-period, cf. L59) :
 *            elle introduit une identite de CAMPAGNE au-dessus de l'identite
 *            de TRAJECTOIRE que run-period connait deja (L121), et c'est
 *            cette identite superieure, PERSISTEE, que A5 exige « existante ».
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUI EST FIXE PAR CETTE SUITE, FAUTE D'ENONCE DANS L'ADR SUR LA FORME
 * EXACTE DE LA COMMANDE (meme geste que T39 fixant `bench pilot`, T45 fixant
 * `--scenario-id`/`--configuration-id`, T41 fixant `bench campaign`)
 *
 * 1. SOUS-COMMANDE, `pilot-conduct` (FIXEE ici — nom NEUF, distinct de
 *    `pilot` (T39) et de `campaign` (T41), pour ne modifier le comportement
 *    EXISTANT d'AUCUNE des deux : T46 AJOUTE une troisieme porte, elle n'en
 *    detourne aucune) :
 *
 *      bench pilot-conduct <manifest.json> --campaign-id <id>
 *          --postgres-database <db> --s3-bucket <bucket>
 *          --provider fake --mode recorded|live
 *          [--test-stop-after-periods <n>]
 *
 *    `<manifest.json>` : `bench.pilot.manifest/1` (T39, II.1), budget etendu
 *    (ci-dessus). `--campaign-id` : l'identite SUPERIEURE, celle de la
 *    CAMPAGNE au sens de A5 — PAS l'identite de trajectoire de run-period
 *    (L121) : l'orchestrateur derive, pour chaque trajectoire compilee, sa
 *    PROPRE identite de trajectoire (`trajectory_key`, ci-dessous) et
 *    l'utilise comme `--campaign-id` de ses propres invocations internes de
 *    `run-period`. `--test-stop-after-periods <n>` : POINT D'INJECTION NOMME
 *    (meme convention que `--test-stop-after-phase`, T23 ; `--test-inject-
 *    failure`, T38 ; `--test-force-all-candidates-fail`, T39) — arrete le
 *    processus APRES avoir persiste exactement `n` periodes au total pour
 *    cette campagne (compte global, toutes trajectoires confondues), jamais
 *    une branche activee par un hasard d'environnement, et les `n` periodes
 *    restent reellement persistees (pas annulees) — c'est ce qui rend la
 *    reprise testable deterministiquement, sans attendre un vrai SIGKILL.
 *
 * 2. SORTIE JSON (stdout), presente a CHAQUE invocation, qu'elle se termine
 *    normalement ou qu'elle s'arrete sur l'injection ci-dessus :
 *
 *      campaign_id            string  — echo de --campaign-id
 *      trajectory_count       number  — meme regle de calcul que T39 (II.1) :
 *                              Σ(clone_instance_ids.length) × configurations.length
 *                              × repetitions
 *      period_count           number  — trajectory_count × periods_per_trajectory
 *                              (la CIBLE, derivee du manifeste, jamais observee)
 *      periods_persisted       number  — nombre de periodes REELLEMENT
 *                              persistees a date pour cette campagne, LU EN
 *                              BASE (cumule sur toutes les invocations passees
 *                              de cette campagne, jamais recalcule depuis le
 *                              manifeste)
 *      ready                  boolean — aucun prerequis manquant
 *      missing_prerequisites  string[] — meme vocabulaire que T39 (II.2) :
 *                              sous-ensemble de ['model','price','corpus',
 *                              'exposure','budget'], TOUS les manquants
 *      interrupted             boolean — true SEULEMENT si
 *                              --test-stop-after-periods a ecourte CETTE
 *                              invocation avant period_count
 *      budget                  objet  — echo de la forme EFFECTIVE du
 *                              prerequis budget (section ci-dessus)
 *      trajectories: [ { trajectory_key, parent_project_id, scenario_id,
 *                         configuration_id, periods_persisted } ]
 *                              — UNE entree par trajectoire COMPILEE depuis
 *                              le manifeste (meme si ses periodes ne sont pas
 *                              toutes persistees encore)
 *      periods: [ { trajectory_key, period_index, model_call_ids } ]
 *                              — UNE entree par periode REELLEMENT persistee
 *                              a date pour cette campagne (cumulatif)
 *      token_report: { by_model: { <model>: { input_fresh, cache_write_5m,
 *                      cache_write_1h, cache_read, output } } }
 *                              — agregat CUMULATIF, par modele, des tokens de
 *                              TOUS les appels regles persistes a date pour
 *                              cette campagne (L159/A3)
 *
 *    REFUS (missing_prerequisites non vide) : exit non nul, AVANT TOUTE
 *    ecriture — ni trajectoire ni periode persistee pour ce `campaign_id`
 *    (meme discipline que T39.A2/T41.A3 : verifie par une invocation ULTERIEURE
 *    et VALIDE sur la MEME campagne, qui doit repartir de `periods_persisted=0`).
 *
 * LA RAISON POUR LAQUELLE `trajectory_key` EST UNE SORTIE, JAMAIS UNE ENTREE.
 * Cette suite ne fabrique AUCUN identifiant de trajectoire : le manifeste ne
 * nomme que des GROUPES/clones/configurations/repetitions (comme pour T39),
 * et c'est l'orchestrateur qui DECIDE comment les combiner en identites de
 * trajectoire run-period. `trajectory_key` est donc LU dans la sortie, jamais
 * devine, puis REINJECTE comme `--campaign-id` d'un rappel DIRECT de
 * `run-period` (I) — exactement le canal independant que A1/A5 exploitent.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 * T46 n'a pas de ligne de cahier : sa source est l'ADR epingle par
 * verification/tasks.extensions.json#spec_source. Chaque litteral COMPARE
 * porte donc un commentaire `// source:docs/adr/ADR-007-pilote-longitudinal-
 * et-unite-token.md:L<n>` resolvable par `sed -n '<n>p'`, OU une reference
 * explicite a la suite d'acceptation DEJA PUBLIEE d'une dependance dont le
 * vocabulaire est repris a l'identique (meme discipline que la note de III
 * de acceptance/T45.spec.ts : un vocabulaire qu'une dependance a elle-meme
 * FIXE, section II(d) de son propre fichier, n'a pas de ligne de cahier/ADR a
 * citer — seule sa source est la suite qui l'a fixe) :
 *
 *   `TRAJECTORY_IDENTITY_CONFLICT`, `SCN-F-RESERVATION`,
 *   `CFG-RECORDED-LOCAL`                                — jamais compares ici
 *                                                          (hors du perimetre
 *                                                          de T46 : voir V)
 *   `missing_prerequisites`, ['model','price','corpus',
 *   'exposure','budget']                                — acceptance/T39.spec.ts
 *                                                          (II.2)
 *   `input_fresh`,`cache_write_5m`,`cache_write_1h`,
 *   `cache_read`,`output`                                — acceptance/T44.spec.ts
 *                                                          (III.2/3), lui-meme
 *                                                          source:ADR:L145
 *   « espace de noms d'une TRAJECTOIRE » (le fait qu'une
 *   invocation de run-period porte sur UNE trajectoire)   — source:ADR:L121
 *   « campaign ecrit trajectories, run-period ecrit
 *   bench_run_period_trajectories » (schemas disjoints)   — source:ADR:L59-L61
 *
 * Les noms `pilot-conduct`, `trajectory_key`, `periods_persisted`,
 * `token_report`, `--test-stop-after-periods`, le manifeste etendu
 * (`budget.unbounded`) : FIXES ICI (section II), jamais obtenus en executant
 * une implementation de T46 et en figeant ce qu'on a vu passer — aucune
 * implementation de T46 n'existe au moment ou cette suite est ecrite
 * (ADR-001).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T46, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER DE CROIRE LE RAPPORT DE L'ORCHESTRATEUR SUR
 *     LUI-MEME (« lues en base », L161). Pour CHAQUE trajectoire compilee,
 *     cette suite rappelle `run-period` DIRECTEMENT (I) sur son
 *     `trajectory_key`, drapeaux scenario/configuration omis expres (relecture
 *     depuis l'etat persistant, meme discipline que T45.A1), et exige que le
 *     `period_index` ainsi obtenu soit EXACTEMENT `periods_per_trajectory + 1`
 *     — la preuve que les P periodes existent reellement dans `run-period`,
 *     pas seulement dans le JSON du conducteur. Le manifeste fixe (II) donne
 *     en outre a chaque trajectoire une configuration DISTINCTE : un
 *     conducteur qui ecrirait une configuration constante echouerait sur CE
 *     manifeste, pas seulement sur un cas degenere a une seule trajectoire.
 * (2) A2 EST UN CAS `behaviour`, ET LE DANGER EST LA DUPLICATION SILENCIEUSE.
 *     cases.extensions.lock.json le nomme : « reprendre a la periode 1 au
 *     lieu de k+1 ». Cette suite n'exige donc pas seulement
 *     `periods_persisted = period_count` apres reprise (un compte correct
 *     survivrait a une duplication suivie d'une troncature accidentelle) :
 *     elle reconstruit, PAR TRAJECTOIRE, l'ensemble EXACT des `period_index`
 *     persistes (tries, deduits de `periods[]`) et exige l'egalite ensembliste
 *     avec `[1..periods_per_trajectory]` — ni trou, ni doublon, ni depassement.
 * (3) A3 EST UN CAS `numeric` : LE DANGER DECISIF. cases.extensions.lock.json
 *     le nomme : « omettre les tokens d'un appel dans l'agregat ». Un rapport
 *     qui s'auto-certifierait correct ne prouverait rien : cette suite relit
 *     donc, pour CHAQUE `model_call_id` cite par `periods[]`, l'enregistrement
 *     REGLE par `getModelCall` (DEJA PROUVE par T44, importe directement,
 *     JAMAIS par le CLI) et reconstruit l'agregat par modele a la main. La
 *     comparaison porte sur l'EGALITE STRUCTURELLE complete (memes modeles,
 *     memes cinq categories, memes sommes) — pas seulement sur une somme
 *     globale, qu'une permutation entre modeles ferait passer a tort.
 * (4) A4 EST UN CAS `refusal` : LE DANGER CLASSIQUE (meme avertissement que
 *     T00.M3/T39.A2/T45.A3) — un stub qui LEVE systematiquement laisserait la
 *     moitie « budget absent » vraie a tort, SANS que la moitie « budget sans
 *     plafond n'est JAMAIS refuse » soit vraie du tout (elle leverait aussi).
 *     Cette suite exerce donc les TROIS formes du prerequis dans le MEME cas :
 *     plafonne (temoin, doit REUSSIR, flag « sans plafond » ABSENT/faux — sans
 *     ce temoin, un conducteur qui annoncerait toujours « sans plafond »
 *     passerait trivialement), sans plafond (doit REUSSIR, flag PRESENT/vrai),
 *     absent (doit ECHOUER, `missing_prerequisites` contient `budget`, ET
 *     controle de non-ecriture : `periods_persisted` reste a 0 pour cette
 *     campagne apres le refus).
 * (5) A5 : LE DANGER EST UNE PERIODE DONT LE `trajectory_key` NE CORRESPOND A
 *     AUCUNE trajectoire compilee (cases.extensions.lock.json : « ecrire une
 *     periode sans trajectoire rattachee »). Cette suite exige, pour CHAQUE
 *     entree de `periods[]`, que son `trajectory_key` apparaisse dans
 *     `trajectories[].trajectory_key` DE LA MEME REPONSE — une egalite
 *     ensembliste cote trajectoires, une inclusion cote periodes, jamais un
 *     simple decompte qu'une periode orpheline laisserait inchange. Pour la
 *     « campagne existante », cette suite rappelle le conducteur UNE SECONDE
 *     FOIS, apres achevement complet, sur la MEME campagne : il doit RENDRE
 *     EXACTEMENT LE MEME ensemble de `trajectory_key` (jamais un ensemble
 *     fraichement recompile), preuve que l'identite de campagne a bien ete
 *     PERSISTEE et relue, pas reconstruite a chaque appel.
 * (6) ISOLATION DES SERVICES REELS. Chaque cas cree sa PROPRE base PostgreSQL
 *     et son propre bucket S3, namespaces par un `campaign_id` aleatoire
 *     (cahier:L557) — aucun cas ne depend de l'ordre d'execution d'un autre.
 * (7) CHAQUE INVOCATION CLI EST UN PROCESSUS NEUF (`execFileSync`), jamais un
 *     rappel en memoire — meme discipline que T23/T39/T45.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne revalide pas la compilation d'un manifeste de pilote en N
 *    trajectoires (deja couvert par acceptance/T39.spec.ts.A1/A3), ni le
 *    parametrage scenario/configuration d'UNE invocation de run-period (deja
 *    couvert par acceptance/T45.spec.ts) : elle observe seulement que
 *    l'orchestrateur relie correctement les deux, periode par periode, avec
 *    reprise et agregat.
 *  • Elle n'exerce ni `TRAJECTORY_IDENTITY_CONFLICT` (T45.A3 seul) ni le
 *    comportement de `bench campaign`/`bench pilot --execute` existants
 *    (T39/T41) : T46 AJOUTE une porte, elle n'en modifie aucune.
 *  • Elle ne fixe aucune valeur precise pour `trajectory_key` : seulement
 *    qu'il identifie, de facon STABLE entre invocations, une trajectoire
 *    REELLEMENT retrouvable par `run-period`.
 *  • Elle n'exige aucun credential reel : `--provider fake`, jamais un reseau
 *    reel (meme discipline que T39/T41/T45).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/* ─────────────────────────────── navigation JSON generique (reprise de T45) */

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

const booleen = (v: unknown): boolean | null =>
  typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null;

/* ─────────────────── litteraux de cette suite, chacun avec sa provenance */

const MODE = 'recorded'; // convention T23/T39/T45 (cahier:L21)
const PROVIDER = 'fake'; // convention T39/T41 (cahier:L17-24)
const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par cette suite (II.1)
const SOUS_COMMANDE_RUN_PERIOD = 'run-period'; // cahier:L355, repris de T23/T45

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_ARRET_PERIODES = '--test-stop-after-periods'; // FIXE par cette suite (II.1)

/** Les cinq categories ADR-002, reprises a l'identique de acceptance/T44.spec.ts (III.2/3),
 *  elle-meme source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L145. */
const CATEGORIES_TOKEN = ['input_fresh', 'cache_write_5m', 'cache_write_1h', 'cache_read', 'output'] as const;
type CategorieToken = (typeof CATEGORIES_TOKEN)[number];

const ALIAS_CAMPAGNE = ['campaign_id', 'campaignid'];
const ALIAS_TRAJECTORY_COUNT = ['trajectory_count', 'trajectorycount'];
const ALIAS_PERIOD_COUNT = ['period_count', 'periodcount'];
const ALIAS_PERIODS_PERSISTED = ['periods_persisted', 'periodspersisted'];
const ALIAS_READY = ['ready'];
const ALIAS_MISSING = ['missing_prerequisites', 'missingprerequisites'];
const ALIAS_INTERRUPTED = ['interrupted'];
const ALIAS_BUDGET = ['budget'];
const ALIAS_UNBOUNDED = ['unbounded', 'budget_unbounded', 'sansplafond'];
const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_PERIODES = ['periods'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_PARENT = ['parent_project_id', 'parentprojectid'];
const ALIAS_SCENARIO = ['scenario_id', 'scenarioid', 'scenario'];
const ALIAS_CONFIGURATION = ['configuration_id', 'configurationid', 'configuration', 'config_id', 'configid'];
const ALIAS_PERIOD_INDEX = ['period_index', 'periodindex', 'index', 'numero', 'rang'];
const ALIAS_MODEL_CALL_IDS = ['model_call_ids', 'modelcallids'];
const ALIAS_TOKEN_REPORT = ['token_report', 'tokenreport'];
const ALIAS_BY_MODEL = ['by_model', 'bymodel'];

/** Ce qui N'EST PAS un refus : un plantage (meme convention que T00/T17/T25/T37/T39/T45). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t46_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

type AppelCli = {
  resultat: Json | null;
  exit: number | null;
  tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[];
};

/** Namespace d'un cas : une campagne fraiche (campaign_id, base, bucket). */
type Contexte = { campaignId: string; db: string; bucket: string };

function nouveauContexte(suffixe: string): Contexte {
  return {
    campaignId: `t46-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
  };
}

/** Une invocation `node <entree> <sousCommande> <drapeaux>` (processus neuf, jamais un rappel en memoire). */
function lancer(sousCommande: string, drapeaux: string[]): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
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

/** `bench pilot-conduct` sur la campagne `ctx`, avec un manifeste et des drapeaux additionnels. */
function conduire(ctx: Contexte, manifest: string, extra: string[] = []): AppelCli {
  return lancer(SOUS_COMMANDE_CONDUIRE, [
    manifest,
    DRAPEAU_CAMPAGNE,
    ctx.campaignId,
    DRAPEAU_PG,
    ctx.db,
    DRAPEAU_S3,
    ctx.bucket,
    DRAPEAU_PROVIDER,
    PROVIDER,
    DRAPEAU_MODE,
    MODE,
    ...extra,
  ]);
}

/** `bench run-period` DIRECT (I, canal independant), sur la MEME base/bucket, pour une identite de
 *  trajectoire `trajectoryKey` rendue par `pilot-conduct` — drapeaux scenario/configuration OMIS, pour
 *  relire l'etat persistant (ADR:L121, meme discipline que T45.A1). */
function runPeriodDirect(ctx: Contexte, trajectoryKey: string): AppelCli {
  return lancer(SOUS_COMMANDE_RUN_PERIOD, [
    DRAPEAU_MODE,
    MODE,
    DRAPEAU_CAMPAGNE,
    trajectoryKey,
    DRAPEAU_PG,
    ctx.db,
    DRAPEAU_S3,
    ctx.bucket,
  ]);
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${appel.tentatives
    .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`)
    .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`;
}

function texteComplet(appel: AppelCli): string {
  const j = appel.resultat !== null ? rendu(appel.resultat) : '';
  const brut = appel.tentatives.map((t) => t.sortie).join('\n');
  return `${j}\n${brut}`;
}

/* ───────────────────────────── extraction de champs sur UNE reponse */

const campaignIdDe = (r: unknown): string | null => {
  const v = champProfond(r, ALIAS_CAMPAGNE);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
};
const trajectoryCountDe = (r: unknown): number | null => {
  const v = champProfond(r, ALIAS_TRAJECTORY_COUNT);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
const periodCountDe = (r: unknown): number | null => {
  const v = champProfond(r, ALIAS_PERIOD_COUNT);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
const periodsPersistedDe = (r: unknown): number | null => {
  const v = champProfond(r, ALIAS_PERIODS_PERSISTED);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
const readyDe = (r: unknown): boolean | null => {
  const v = champProfond(r, ALIAS_READY);
  return v !== null ? booleen(v.valeur) : null;
};
const interrompuDe = (r: unknown): boolean | null => {
  const v = champProfond(r, ALIAS_INTERRUPTED);
  return v !== null ? booleen(v.valeur) : null;
};
const manquantsDe = (r: unknown): string[] => {
  const v = tableauProfond(r, ALIAS_MISSING);
  if (v === null || !Array.isArray(v.valeur)) return [];
  return (v.valeur as unknown[]).filter((x): x is string => typeof x === 'string');
};
const unboundedDe = (r: unknown): boolean | null => {
  const budget = champProfond(r, ALIAS_BUDGET);
  const cible = budget !== null ? budget.valeur : r;
  const v = champProfond(cible, ALIAS_UNBOUNDED);
  if (v !== null) return booleen(v.valeur);
  // Repli : recherche profonde sur toute la reponse (au cas ou le flag ne serait pas niche sous `budget`).
  const v2 = champProfond(r, ALIAS_UNBOUNDED);
  return v2 !== null ? booleen(v2.valeur) : null;
};

type Trajectoire = { trajectoryKey: string; parentProjectId: string | null; scenarioId: string | null; configurationId: string | null };
type Periode = { trajectoryKey: string; periodIndex: number | null; modelCallIds: string[] };

function trajectoiresDe(r: unknown): Trajectoire[] {
  const t = tableauProfond(r, ALIAS_TRAJECTOIRES);
  if (t === null || !Array.isArray(t.valeur)) return [];
  return (t.valeur as unknown[]).map((x) => {
    const key = champProfond(x, ALIAS_TRAJECTORY_KEY);
    const parent = champProfond(x, ALIAS_PARENT);
    const scenario = champProfond(x, ALIAS_SCENARIO);
    const config = champProfond(x, ALIAS_CONFIGURATION);
    return {
      trajectoryKey: key !== null && typeof key.valeur === 'string' ? key.valeur : '',
      parentProjectId: parent !== null && typeof parent.valeur === 'string' ? parent.valeur : null,
      scenarioId: scenario !== null && typeof scenario.valeur === 'string' ? scenario.valeur : null,
      configurationId: config !== null && typeof config.valeur === 'string' ? config.valeur : null,
    };
  });
}

function periodesDe(r: unknown): Periode[] {
  const t = tableauProfond(r, ALIAS_PERIODES);
  if (t === null || !Array.isArray(t.valeur)) return [];
  return (t.valeur as unknown[]).map((x) => {
    const key = champProfond(x, ALIAS_TRAJECTORY_KEY);
    const idx = champProfond(x, ALIAS_PERIOD_INDEX);
    const ids = tableauProfond(x, ALIAS_MODEL_CALL_IDS);
    const n = idx !== null ? nombre(idx.valeur) : NaN;
    return {
      trajectoryKey: key !== null && typeof key.valeur === 'string' ? key.valeur : '',
      periodIndex: Number.isFinite(n) ? n : null,
      modelCallIds:
        ids !== null && Array.isArray(ids.valeur) ? (ids.valeur as unknown[]).filter((x2): x2 is string => typeof x2 === 'string') : [],
    };
  });
}

function tokenReportParModeleDe(r: unknown): Map<string, Record<CategorieToken, number>> | null {
  const rapport = champProfond(r, ALIAS_TOKEN_REPORT);
  if (rapport === null) return null;
  const parModele = champProfond(rapport.valeur, ALIAS_BY_MODEL);
  if (parModele === null || parModele.valeur === null || typeof parModele.valeur !== 'object' || Array.isArray(parModele.valeur)) {
    return null;
  }
  const out = new Map<string, Record<CategorieToken, number>>();
  for (const [modele, vecteur] of Object.entries(parModele.valeur as Json)) {
    const rec: Record<string, number> = {};
    for (const cat of CATEGORIES_TOKEN) {
      const champ = champProfond(vecteur, [cat]);
      const n = champ !== null ? nombre(champ.valeur) : NaN;
      rec[cat] = Number.isFinite(n) ? n : NaN;
    }
    out.set(modele, rec as Record<CategorieToken, number>);
  }
  return out;
}

/* ══════════════════════ chargement des paquets (A3 : contre-lecture independante) ══════ */

type Ns = Record<string, unknown>;
const PACKAGES = ['gateway', 'storage'] as const;

interface Loaded {
  chargesPar: Set<string>;
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
  const chargesPar = new Set<string>();
  const flat = new Map<string, unknown>();
  for (const pkg of PACKAGES) {
    let charge = false;
    for (const s of specifiersFor(pkg)) {
      if (charge) break;
      try {
        const mod = (await import(s)) as Ns;
        flatten(mod, flat);
        chargesPar.add(pkg);
        charge = true;
      } catch (e) {
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet packages/${pkg} : aucun specificateur n'a repondu`);
  }
  return { chargesPar, flat, attempts };
}

let LOADED: Loaded = { chargesPar: new Set(), flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

/** Role → alias, repris de acceptance/T44.spec.ts (storage : T12 ; gateway : T17/T44). */
const ROLES: Record<string, readonly string[]> = {
  applyMigrations: [
    'applyMigrations', 'applyCentralMigrations', 'runMigrations', 'migrate',
    'migrateCentral', 'migrateUp', 'ensureSchema', 'createSchema', 'initSchema',
    'setupSchema', 'up',
  ],
  openStore: [
    'openStore', 'openCentralStore', 'createStore', 'openRepository',
    'createRepository', 'connect', 'createPool', 'openDatabase', 'open',
  ],
  closeStore: [
    'closeStore', 'closeRepository', 'disconnect', 'shutdown', 'dispose', 'close', 'end',
  ],
  getModelCall: [
    'getModelCall', 'readModelCall', 'fetchModelCall', 'getCall', 'loadModelCall',
  ],
};

type Fn = (...a: unknown[]) => unknown;

function resolveRole(name: string): { fn?: Fn; tried: readonly string[] } {
  const aliases = ROLES[name];
  if (aliases === undefined) throw new Error(`role inconnu de la suite : ${name}`);
  for (const a of aliases) {
    const v = LOADED.flat.get(a);
    if (typeof v === 'function') return { fn: v as Fn, tried: aliases };
  }
  return { tried: aliases };
}

function requireRole(name: string): Fn {
  const { fn, tried } = resolveRole(name);
  exige(fn !== undefined, `role-${name}-trouve`, `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`);
  return fn as Fn;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

const HANDLES: unknown[] = [];

async function ouvrirStoreSur(db: string): Promise<unknown> {
  const applyMigrations = requireRole('applyMigrations');
  const openStore = requireRole('openStore');
  const dsn = dsnFor(db);
  const mig = await essayer(() => applyMigrations({ dsn }));
  exige(mig.ok, 'migrations-appliquees', `MIGRATIONS-EN-ECHEC ${messageDe((mig as { err: unknown }).err)}`);
  const ouv = await essayer(() => openStore({ dsn }));
  exige(ouv.ok, 'store-ouvert', `OUVERTURE-STORE-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`);
  const handle = (ouv as { ok: true; value: unknown }).value;
  HANDLES.push(handle);
  return handle;
}

/** Relit, PAR L'API deja prouvee par T44 (jamais par le CLI), le vecteur `usage` d'un appel regle. */
async function usageRegleIndependant(handle: unknown, modelCallId: string): Promise<{ model: string | null; usage: Record<string, unknown> | null }> {
  const getModelCall = requireRole('getModelCall');
  const lu = await essayer(() => getModelCall(handle, { model_call_id: modelCallId }));
  exige(lu.ok, `getModelCall-reussi(${modelCallId})`, `LECTURE-MODEL-CALL-EN-ECHEC ${messageDe((lu as { err: unknown }).err)}`);
  const val = (lu as { ok: true; value: unknown }).value;
  const modeleNoeud = champProfond(val, ['model']);
  const usageNoeud = champProfond(val, ['usage']);
  return {
    model: modeleNoeud !== null && typeof modeleNoeud.valeur === 'string' ? modeleNoeud.valeur : null,
    usage: usageNoeud !== null && usageNoeud.valeur !== null && typeof usageNoeud.valeur === 'object' ? (usageNoeud.valeur as Record<string, unknown>) : null,
  };
}

afterAll(async () => {
  const closeStore = resolveRole('closeStore').fn;
  if (closeStore !== undefined) {
    for (const h of [...HANDLES]) {
      try {
        await closeStore(h);
      } catch {
        /* la fermeture n'est pas l'objet des assertions ; la base est de toute facon droppee. */
      }
    }
  }
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

/* ─────────────────────────────────────────────────────────── manifestes */

const MANIFEST_SMALL = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t46-small.json');
const MANIFEST_UNBOUNDED = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t46-small-budget-unbounded.json');
const MANIFEST_MISSING_BUDGET = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t46-small-missing-budget.json');

function manifestJson(p: string): Json {
  const contenu = JSON.parse(fs.readFileSync(p, 'utf8')) as Json;
  exige(fs.existsSync(p), `manifeste-present ${path.basename(p)}`, `MANIFESTE-ABSENT ${p}`);
  return contenu;
}

function trajectoryCountAttendu(m: Json): number {
  const groupes = ((m.corpus as Json | undefined)?.groups as unknown[] | undefined) ?? [];
  const clones = groupes.reduce((n, g) => n + (((g as Json).clone_instance_ids as unknown[] | undefined)?.length ?? 0), 0);
  const configs = (m.configurations as unknown[] | undefined)?.length ?? 0;
  const repetitions = nombre(m.repetitions);
  return clones * configs * (Number.isFinite(repetitions) ? repetitions : 0);
}
function periodCountAttendu(m: Json): number {
  const ppt = nombre(m.periods_per_trajectory);
  return trajectoryCountAttendu(m) * (Number.isFinite(ppt) ? ppt : 0);
}

const MANIFEST_SMALL_JSON = manifestJson(MANIFEST_SMALL);
const N_SMALL = trajectoryCountAttendu(MANIFEST_SMALL_JSON); // = 2 (II, README)
const P_SMALL = nombre(MANIFEST_SMALL_JSON.periods_per_trajectory); // = 3
const PERIOD_COUNT_SMALL = periodCountAttendu(MANIFEST_SMALL_JSON); // = 6

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T46 — conduire un pilote longitudinal reel', () => {
  test(
    'T46.A1 un manifeste de N trajectoires sur P periodes produit exactement N×P periodes persistees, lues en base, chacune portant le scenario et la configuration de sa trajectoire',
    () => {
      const ctx = nouveauContexte('a1');

      const appel = conduire(ctx, MANIFEST_SMALL);
      exige(appel.resultat !== null, 'pilot-conduct-executee', messageEchec('pilot-conduct(A1)', appel));

      exige(trajectoryCountDe(appel.resultat) === N_SMALL, `trajectory_count=${N_SMALL}`, `vu ${rendu(trajectoryCountDe(appel.resultat))} dans ${rendu(appel.resultat)}`);
      exige(periodCountDe(appel.resultat) === PERIOD_COUNT_SMALL, `period_count=${PERIOD_COUNT_SMALL}`, `vu ${rendu(periodCountDe(appel.resultat))}`);
      exige(
        periodsPersistedDe(appel.resultat) === PERIOD_COUNT_SMALL,
        `periods_persisted=${PERIOD_COUNT_SMALL} (N×P)`,
        `vu ${rendu(periodsPersistedDe(appel.resultat))} — cible T46.M1 (« persister N*P-1 periodes »)`,
      );

      const trajectoires = trajectoiresDe(appel.resultat);
      exige(trajectoires.length === N_SMALL, `trajectories.length=${N_SMALL}`, `vu ${trajectoires.length} dans ${rendu(appel.resultat)}`);

      const periodes = periodesDe(appel.resultat);
      exige(periodes.length === PERIOD_COUNT_SMALL, `periods.length=${PERIOD_COUNT_SMALL}`, `vu ${periodes.length} dans ${rendu(appel.resultat)}`);

      // Chaque TRAJECTOIRE porte son propre scenario/configuration (L161) — le rattachement
      // periode -> trajectoire (aucune periode orpheline) est la propriete DECISIVE de T46.A5, pas
      // repetee ici pour garder les deux mutants (M1, M5) distincts.
      const configsVues = new Set<string>();
      for (const t of trajectoires) {
        exige(t.trajectoryKey.length > 0, 'trajectory_key-non-vide', `trajectoire sans trajectory_key : ${rendu(t)}`);
        exige(t.scenarioId !== null, `trajectoire(${t.trajectoryKey})-porte-scenario_id`, `absent dans ${rendu(t)}`);
        exige(t.configurationId !== null, `trajectoire(${t.trajectoryKey})-porte-configuration_id`, `absent dans ${rendu(t)}`);
        if (t.configurationId !== null) configsVues.add(t.configurationId);
      }
      // Les DEUX configurations du manifeste (section II, README) doivent se retrouver DISTINCTES —
      // un conducteur qui ecrirait une configuration constante echouerait ici (controle anti-constante).
      exige(configsVues.size === 2, 'deux-configurations-distinctes-portees-par-les-deux-trajectoires', `vu ${rendu([...configsVues])}`);

      // LECTURE INDEPENDANTE EN BASE (L161 « lues en base ») : rappel DIRECT de run-period (I), par
      // trajectoire, drapeaux omis -> doit continuer EXACTEMENT a periods_per_trajectory + 1.
      for (const t of trajectoires) {
        const suite = runPeriodDirect(ctx, t.trajectoryKey);
        exige(suite.resultat !== null, `run-period-direct-reussi(${t.trajectoryKey})`, messageEchec(`run-period(${t.trajectoryKey})`, suite));
        const idxNoeud = champProfond(suite.resultat, ALIAS_PERIOD_INDEX);
        const idx = idxNoeud !== null ? nombre(idxNoeud.valeur) : NaN;
        exige(
          idx === P_SMALL + 1,
          `run-period-direct(${t.trajectoryKey})-period_index=${P_SMALL + 1}`,
          `vu ${rendu(idx)} dans ${rendu(suite.resultat)} — les ${P_SMALL} periodes ne sont pas toutes retrouvables par run-period`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T46.A2 une execution interrompue apres k periodes puis relancee reprend a la periode k+1, sans periode dupliquee ni sautee',
    () => {
      const ctx = nouveauContexte('a2');
      const K = Math.max(1, Math.floor(PERIOD_COUNT_SMALL / 2)); // 3 sur 6 : ni au debut, ni a la fin

      const interrompu = conduire(ctx, MANIFEST_SMALL, [DRAPEAU_ARRET_PERIODES, String(K)]);
      exige(interrompu.resultat !== null, 'pilot-conduct-interrompu-executee', messageEchec('pilot-conduct(A2,interrompu)', interrompu));
      exige(interrompuDe(interrompu.resultat) === true, 'interrupted=true', `vu ${rendu(interrompuDe(interrompu.resultat))} dans ${rendu(interrompu.resultat)}`);
      exige(
        periodsPersistedDe(interrompu.resultat) === K,
        `periods_persisted=${K}-apres-arret`,
        `vu ${rendu(periodsPersistedDe(interrompu.resultat))} dans ${rendu(interrompu.resultat)}`,
      );

      const repris = conduire(ctx, MANIFEST_SMALL);
      exige(repris.resultat !== null, 'pilot-conduct-repris-executee', messageEchec('pilot-conduct(A2,repris)', repris));
      exige(
        periodsPersistedDe(repris.resultat) === PERIOD_COUNT_SMALL,
        `periods_persisted=${PERIOD_COUNT_SMALL}-apres-reprise`,
        `vu ${rendu(periodsPersistedDe(repris.resultat))} dans ${rendu(repris.resultat)} — cible T46.M2 (« reprendre a la periode 1 »)`,
      );

      // NI TROU NI DOUBLON, PAR TRAJECTOIRE : l'ensemble exact des period_index doit egaler [1..P].
      const periodes = periodesDe(repris.resultat);
      const parTrajectoire = new Map<string, number[]>();
      for (const p of periodes) {
        if (p.periodIndex === null) continue;
        const liste = parTrajectoire.get(p.trajectoryKey) ?? [];
        liste.push(p.periodIndex);
        parTrajectoire.set(p.trajectoryKey, liste);
      }
      const trajectoires = trajectoiresDe(repris.resultat);
      exige(parTrajectoire.size === N_SMALL, `periodes-couvrent-les-${N_SMALL}-trajectoires`, `vu ${parTrajectoire.size} trajectoires distinctes dans periods[] : ${rendu([...parTrajectoire.keys()])}`);
      for (const t of trajectoires) {
        const indices = (parTrajectoire.get(t.trajectoryKey) ?? []).slice().sort((a, b) => a - b);
        const attendu = Array.from({ length: P_SMALL }, (_, i) => i + 1);
        exige(
          JSON.stringify(indices) === JSON.stringify(attendu),
          `trajectoire(${t.trajectoryKey})-period_index=[1..${P_SMALL}]-sans-trou-ni-doublon`,
          `vu ${rendu(indices)} — une duplication a la reprise (periode 1 relancee) laisserait un doublon ou un total superieur a ${PERIOD_COUNT_SMALL}`,
        );
      }

      // CONFIRMATION INDEPENDANTE : run-period direct, par trajectoire, doit refleter la MEME absence de trou/doublon.
      for (const t of trajectoires) {
        const suite = runPeriodDirect(ctx, t.trajectoryKey);
        exige(suite.resultat !== null, `run-period-direct-apres-reprise-reussi(${t.trajectoryKey})`, messageEchec(`run-period(${t.trajectoryKey})`, suite));
        const idxNoeud = champProfond(suite.resultat, ALIAS_PERIOD_INDEX);
        const idx = idxNoeud !== null ? nombre(idxNoeud.valeur) : NaN;
        exige(idx === P_SMALL + 1, `run-period-direct(${t.trajectoryKey})-period_index=${P_SMALL + 1}-apres-reprise`, `vu ${rendu(idx)}`);
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T46.A3 le rapport de fin agrege les tokens par modele et par categorie, et chaque total egale la somme des appels persistes correspondants',
    async () => {
      const ctx = nouveauContexte('a3');

      const appel = conduire(ctx, MANIFEST_SMALL);
      exige(appel.resultat !== null, 'pilot-conduct-executee', messageEchec('pilot-conduct(A3)', appel));
      exige(periodsPersistedDe(appel.resultat) === PERIOD_COUNT_SMALL, `periods_persisted=${PERIOD_COUNT_SMALL}`, `vu ${rendu(periodsPersistedDe(appel.resultat))}`);

      const periodes = periodesDe(appel.resultat);
      const idsAppels = [...new Set(periodes.flatMap((p) => p.modelCallIds))];
      exige(idsAppels.length > 0, 'au-moins-un-model_call_id-rapporte', `periods[] sans aucun model_call_id : ${rendu(periodes)}`);

      const rapport = tokenReportParModeleDe(appel.resultat);
      exige(rapport !== null, 'token_report.by_model-present', `absent/mal-forme dans ${rendu(appel.resultat)}`);

      // RELECTURE INDEPENDANTE (IV.3) : getModelCall, deja prouve par T44, JAMAIS la seule auto-declaration du CLI.
      const handle = await ouvrirStoreSur(ctx.db);
      const attendu = new Map<string, Record<CategorieToken, number>>();
      for (const id of idsAppels) {
        const { model, usage } = await usageRegleIndependant(handle, id);
        exige(model !== null && model.length > 0, `model_call(${id})-porte-un-model-non-vide`, `model=${rendu(model)}`);
        exige(usage !== null, `model_call(${id})-porte-un-usage`, `usage=${rendu(usage)}`);
        const m = model as string;
        const rec = attendu.get(m) ?? ({ input_fresh: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 0 } as Record<CategorieToken, number>);
        for (const cat of CATEGORIES_TOKEN) {
          const v = usage !== null ? nombre((usage as Json)[cat]) : NaN;
          rec[cat] += Number.isFinite(v) ? v : 0;
        }
        attendu.set(m, rec);
      }

      exige(rapport !== null && rapport.size === attendu.size, `token_report.by_model-porte-${attendu.size}-modele(s)`, `vu ${rapport !== null ? rapport.size : 0} (${rendu(rapport !== null ? [...rapport.keys()] : [])}) attendu ${rendu([...attendu.keys()])} — cible T46.M3 (« omettre les tokens d'un appel »)`);

      for (const [modele, vecteurAttendu] of attendu) {
        const vecteurObserve = rapport?.get(modele) ?? null;
        exige(vecteurObserve !== null, `token_report.by_model[${modele}]-present`, `absent de ${rendu(rapport !== null ? [...rapport.keys()] : [])}`);
        for (const cat of CATEGORIES_TOKEN) {
          const v = vecteurObserve !== null ? vecteurObserve[cat] : NaN;
          exige(
            v === vecteurAttendu[cat],
            `token_report.by_model[${modele}].${cat}=${vecteurAttendu[cat]}`,
            `vu ${rendu(v)} — somme independante des ${idsAppels.length} appels persistes (getModelCall) desaccordee avec le rapport auto-declare`,
          );
        }
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    "T46.A4 un budget declare sans plafond ne refuse aucune trajectoire et est enregistre comme tel, tandis qu'un budget absent reste refuse comme l'exige T39",
    () => {
      // (a) TEMOIN PLAFONNE : doit reussir, et le flag "sans plafond" doit rester FAUX/absent — sans ce
      // temoin, un conducteur qui annoncerait toujours "sans plafond" passerait trivialement.
      const ctxPlafonne = nouveauContexte('a4-plafonne');
      const appelPlafonne = conduire(ctxPlafonne, MANIFEST_SMALL);
      exige(appelPlafonne.resultat !== null, 'pilot-conduct-plafonne-executee', messageEchec('pilot-conduct(A4,plafonne)', appelPlafonne));
      exige(readyDe(appelPlafonne.resultat) !== false, 'budget-plafonne-nest-pas-refuse', `ready=${rendu(readyDe(appelPlafonne.resultat))} manquants=${rendu(manquantsDe(appelPlafonne.resultat))}`);
      exige(unboundedDe(appelPlafonne.resultat) !== true, 'budget-plafonne-flag-sans-plafond-absent-ou-faux', `vu ${rendu(unboundedDe(appelPlafonne.resultat))} dans ${rendu(appelPlafonne.resultat)}`);

      // (b) SANS PLAFOND : doit reussir, AUCUNE trajectoire refusee, flag enregistre a VRAI.
      const ctxSansPlafond = nouveauContexte('a4-sans-plafond');
      const mUnbounded = manifestJson(MANIFEST_UNBOUNDED);
      const nUnbounded = trajectoryCountAttendu(mUnbounded);
      const periodCountUnbounded = periodCountAttendu(mUnbounded);
      const appelSansPlafond = conduire(ctxSansPlafond, MANIFEST_UNBOUNDED);
      exige(appelSansPlafond.resultat !== null, 'pilot-conduct-sans-plafond-executee', messageEchec('pilot-conduct(A4,sans-plafond)', appelSansPlafond));
      exige(readyDe(appelSansPlafond.resultat) !== false, 'budget-sans-plafond-nest-pas-refuse', `ready=${rendu(readyDe(appelSansPlafond.resultat))} manquants=${rendu(manquantsDe(appelSansPlafond.resultat))}`); // source:docs/adr/ADR-007-pilote-longitudinal-et-unite-token.md:L161
      exige(!manquantsDe(appelSansPlafond.resultat).includes('budget'), "'budget'-absent-de-missing_prerequisites", `vu ${rendu(manquantsDe(appelSansPlafond.resultat))}`);
      exige(
        trajectoryCountDe(appelSansPlafond.resultat) === nUnbounded,
        `trajectory_count=${nUnbounded}-aucune-trajectoire-refusee`,
        `vu ${rendu(trajectoryCountDe(appelSansPlafond.resultat))}`,
      );
      exige(
        periodsPersistedDe(appelSansPlafond.resultat) === periodCountUnbounded,
        `periods_persisted=${periodCountUnbounded}-toutes-les-trajectoires-executees-sans-plafond`,
        `vu ${rendu(periodsPersistedDe(appelSansPlafond.resultat))} dans ${rendu(appelSansPlafond.resultat)}`,
      );
      exige(
        unboundedDe(appelSansPlafond.resultat) === true,
        'budget-sans-plafond-enregistre-comme-tel (flag=true)',
        `vu ${rendu(unboundedDe(appelSansPlafond.resultat))} dans ${rendu(appelSansPlafond.resultat)} — cible T46.M4 (« traiter un budget absent comme sans plafond » exige l'inverse, voir (c) ci-dessous)`,
      );

      // (c) BUDGET ABSENT : refuse AVANT toute ecriture, comme T39.A2 l'exige (ADR:L161 « ... reste
      // refuse comme l'exige T39 »), vocabulaire REPRIS de acceptance/T39.spec.ts (II.2).
      const ctxAbsent = nouveauContexte('a4-absent');
      const refus = conduire(ctxAbsent, MANIFEST_MISSING_BUDGET);
      const texte = texteComplet(refus);
      exige(!MARQUEURS_DE_PLANTAGE.test(texte), 'refus-nomme-pas-un-plantage-generique', `MARQUEUR-DE-PLANTAGE detecte : ${court(texte, 500)}`);
      exige(refus.exit !== 0, 'budget-absent-refuse (exit non nul)', `exit=${String(refus.exit)} ${court(texte, 500)}`);
      exige(
        manquantsDe(refus.resultat).includes('budget') || /budget/i.test(texte),
        "'budget'-nomme-parmi-les-prerequis-manquants",
        `manquants=${rendu(manquantsDe(refus.resultat))} texte=${court(texte, 400)}`,
      );

      // CONTROLE DE NON-ECRITURE : une invocation ULTERIEURE, VALIDE, sur la MEME campagne doit
      // repartir de periods_persisted=0 — le refus n'a rien ecrit (meme discipline que T39.A6/T41.A3).
      const reprise = conduire(ctxAbsent, MANIFEST_SMALL);
      exige(reprise.resultat !== null, 'pilot-conduct-apres-refus-executee', messageEchec('pilot-conduct(A4,apres-refus)', reprise));
      exige(
        periodsPersistedDe(reprise.resultat) === PERIOD_COUNT_SMALL,
        `periods_persisted=${PERIOD_COUNT_SMALL}-aucune-trace-du-refus-anterieur`,
        `vu ${rendu(periodsPersistedDe(reprise.resultat))} — un total superieur trahirait une ecriture malgre le refus`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T46.A5 chaque periode persistee est rattachee a une trajectoire et a une campagne existantes, sans periode orpheline',
    () => {
      const ctx = nouveauContexte('a5');

      const appel = conduire(ctx, MANIFEST_SMALL);
      exige(appel.resultat !== null, 'pilot-conduct-executee', messageEchec('pilot-conduct(A5)', appel));
      exige(periodsPersistedDe(appel.resultat) === PERIOD_COUNT_SMALL, `periods_persisted=${PERIOD_COUNT_SMALL}`, `vu ${rendu(periodsPersistedDe(appel.resultat))}`);

      const trajectoires = trajectoiresDe(appel.resultat);
      const periodes = periodesDe(appel.resultat);
      const clesTrajectoires = new Set(trajectoires.map((t) => t.trajectoryKey));
      exige(clesTrajectoires.size === N_SMALL, `${N_SMALL}-trajectory_key-distincts`, `vu ${rendu([...clesTrajectoires])}`);

      // DECISIF (cible du mutant « ecrire une periode sans trajectoire rattachee ») : CHAQUE periode
      // doit referencer une trajectoire PRESENTE dans la MEME reponse, sans exception.
      let orphelines = 0;
      for (const p of periodes) {
        if (!clesTrajectoires.has(p.trajectoryKey)) orphelines += 1;
      }
      exige(orphelines === 0, 'aucune-periode-orpheline (trajectory_key absent de trajectories[])', `${orphelines} periode(s) orpheline(s) sur ${periodes.length} : ${rendu(periodes.filter((p) => !clesTrajectoires.has(p.trajectoryKey)))}`);

      // RATTACHEMENT INDEPENDANT A UNE TRAJECTOIRE EXISTANTE : run-period direct (I) doit retrouver
      // CHAQUE trajectory_key cite par periods[] (sinon la trajectoire n'existe que dans ce rapport).
      const clesCiteesParPeriodes = new Set(periodes.map((p) => p.trajectoryKey));
      for (const cle of clesCiteesParPeriodes) {
        const suite = runPeriodDirect(ctx, cle);
        exige(suite.resultat !== null, `trajectoire(${cle})-retrouvable-par-run-period-direct`, messageEchec(`run-period(${cle})`, suite));
      }

      // CAMPAGNE EXISTANTE : un second appel, APRES achevement complet, sur la MEME campagne doit
      // rendre EXACTEMENT le MEME ensemble de trajectory_key — preuve que l'identite de campagne a ete
      // PERSISTEE et relue, jamais recompilee a chaque invocation.
      const second = conduire(ctx, MANIFEST_SMALL);
      exige(second.resultat !== null, 'pilot-conduct-seconde-invocation-executee', messageEchec('pilot-conduct(A5,second)', second));
      exige(
        periodsPersistedDe(second.resultat) === PERIOD_COUNT_SMALL,
        `periods_persisted=${PERIOD_COUNT_SMALL}-inchange-a-la-seconde-invocation`,
        `vu ${rendu(periodsPersistedDe(second.resultat))} — une recompilation fraiche ajouterait ou dupliquerait des periodes`,
      );
      const clesSecond = new Set(trajectoiresDe(second.resultat).map((t) => t.trajectoryKey));
      exige(
        JSON.stringify([...clesTrajectoires].sort()) === JSON.stringify([...clesSecond].sort()),
        'meme-ensemble-de-trajectory_key-a-la-seconde-invocation (campagne persistee, pas recompilee)',
        `premiere=${rendu([...clesTrajectoires])} seconde=${rendu([...clesSecond])}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
