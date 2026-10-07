/**
 * acceptance/T47.spec.ts — suite d'acceptation de la tache T47.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T47.A1 behaviour — chaque session est lancee avec `-p`,
 *                      `--output-format json`, `--no-session-persistence` et
 *                      le modele de la configuration, dans le repertoire de
 *                      l'espace de travail, et SANS `ANTHROPIC_API_KEY` ni
 *                      `ANTHROPIC_AUTH_TOKEN` dans son environnement, meme
 *                      lorsque l'appelant les definit
 *   T47.A2 numeric    — pour chaque modele declare par la session, l'usage
 *                      rendu porte ce modele et ses tokens `input_fresh`,
 *                      `cache_read` et `output`, en entiers egaux a ceux que
 *                      la session a declares
 *   T47.A3 absence    — des tokens d'ecriture de cache dont la duree n'est
 *                      pas declaree sont conserves dans une categorie
 *                      explicite d'ecriture non ventilee ; aucune de leurs
 *                      unites n'est attribuee a `cache_write_5m` ni
 *                      `cache_write_1h`
 *   T47.A4 refusal    — une session terminee en erreur, une sortie illisible
 *                      ou de forme inconnue, ou un code de sortie non nul
 *                      produit un echec nomme qui conserve la sortie brute
 *                      et ne rend aucun usage comme reussi
 *   T47.A5 refusal    — si `claude auth status` declare une authentification
 *                      par cle d'API, la periode est refusee AVANT TOUTE
 *                      session
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T47 EST UNE TACHE D'EXTENSION (ADR-008) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T47 — `packages/agents` —
 * et ne les a lus ni directement ni par `git show` (ADR-001 : aveuglement
 * PROCEDURAL, discipline auditable au diff). Le contrat teste ci-dessous est
 * derive de docs/specs/T47.md, lui-meme extrait verbatim de
 * docs/adr/ADR-008-candidat-reel-par-session-claude-p.md, lignes 131 a 137
 * (la plage que la carte de T47 epingle dans
 * verification/tasks.extensions.json#spec_source) :
 *
 *   L131  titre : « Lancer une periode de candidat par une session
 *         `claude -p` »
 *   L133  dependances T44 ; livrables MOT POUR MOT : « adaptateur qui lance,
 *         pour une periode, une session `claude -p` neuve dans l'espace de
 *         travail donne, avec le modele de la configuration, et rend la
 *         sortie brute ainsi que l'usage par modele ; refus avant tout appel
 *         si l'authentification declaree est une cle d'API »
 *   L135  les cinq cas d'acceptation, mot pour mot — seule ligne qui nomme
 *         `-p`, `--output-format json`, `--no-session-persistence`,
 *         `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `input_fresh`,
 *         `cache_read`, `output`, `cache_write_5m`, `cache_write_1h`
 *   L137  commande : `pnpm verify:task T47` ; « un faux executable `claude`
 *         place en tete du PATH remplace la CLI ; aucun appel reel » — fonde
 *         le fixture acceptance/fixtures/claude-cli/bin/claude (zone
 *         ACCEPTANCE) que cette suite place en tete de PATH, et JAMAIS la
 *         vraie CLI.
 *
 * Cette suite lit en outre, dans le corps narratif de l'ADR (hors de la
 * plage L131-L137 epinglee par la carte, mais a l'interieur du MEME fichier
 * ACCEPTE que la carte designe comme spec_source — exactement la liberte que
 * acceptance/T28.spec.ts prend deja avec des lignes de cahier hors de son
 * propre bloc L395-L404), les passages qui donnent un SCHEMA a ce que L135
 * ne fait que NOMMER :
 *   L30-L33 « `claude auth status` declare `authMethod: oauth_token`,
 *           `apiProvider: firstParty` ; aucune `ANTHROPIC_API_KEY` definie »
 *           — la forme de la reponse que A5 doit lire pour refuser.
 *   L38-L41 « `ANTHROPIC_API_KEY` passe AVANT l'abonnement [...] en mode
 *           `-p`, elle est utilisee sans demander [...] basculerait en
 *           silence la facturation » — motive POURQUOI A1 exige l'absence
 *           STRICTE (pas seulement vide) de la cle, meme quand l'appelant
 *           l'a definie.
 *   L44-L48 « un objet `result` portant `subtype`, `is_error`, `session_id`,
 *           `num_turns`, `usage` (`input_tokens`, `output_tokens`,
 *           `cache_creation_input_tokens`, `cache_read_input_tokens`) et
 *           `modelUsage`, indexe par identifiant de modele. Une meme session
 *           peut employer plusieurs modeles » — la forme de sortie que le
 *           faux executable produit et que l'adaptateur doit lire ; « Une
 *           meme session peut employer plusieurs modeles » fonde le choix
 *           d'A2 d'exercer DEUX modeles a la fois plutot qu'un seul.
 *   L64-L68 « L'environnement de la session est expurgé de
 *           `ANTHROPIC_API_KEY` et de `ANTHROPIC_AUTH_TOKEN`, et `claude
 *           auth status` est lu avant la premiere session » — fonde le
 *           CONTROLE DE CAPACITE d'A5 (le marqueur d'invocation de `auth
 *           status`, cf. III.4) : un refus qui n'aurait jamais interroge
 *           l'authentification ne serait qu'un hasard.
 *   L70-L75 « par periode et par modele declare dans `modelUsage` [...]
 *           `input_fresh` (`inputTokens`), `cache_read`, `output`, et
 *           l'ecriture de cache. La duree de cette ecriture n'etant pas
 *           declaree, ses tokens vont dans une categorie explicite
 *           d'ecriture non ventilee par duree, jamais repartis entre
 *           `cache_write_5m` et `cache_write_1h` : meme discipline que
 *           T44.A4. » — `inputTokens` est le SEUL nom de champ brut que
 *           l'ADR cite litteralement pour une entree de `modelUsage` ; A3
 *           reprend EXPLICITEMENT « meme discipline que T44.A4 » (deja
 *           prouve par acceptance/T44.spec.ts, qui a fixe `cache_unresolved`
 *           pour le MEME probleme sous T44 — cf. III.3 pour le nom distinct
 *           fixe ici).
 *
 * Tache T44 (`depends_on` de T47) est deja PROUVEE ailleurs
 * (acceptance/T44.spec.ts) ; cette suite ne la reinvoque pas — T47 ne
 * persiste rien et n'a pas de budget, elle rend un resultat en memoire que
 * T49 (hors de ce lot) branchera sur la persistance.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * T47 N'A PAS de ligne de cahier : sa source est l'ADR epingle par
 * verification/tasks.extensions.json#spec_source. Cette suite applique la
 * MEME discipline que acceptance/T44.spec.ts (section II) : chaque litteral
 * COMPARE porte soit un commentaire
 * `// source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L<n>`
 * resolvable par `sed -n '<n>p'`, soit — pour l'UNIQUE litteral que
 * verification/cases.extensions.lock.json (zone REGISTRY, gelee) nomme sans
 * que l'ADR le nomme lui-meme — un commentaire
 * `// cases.extensions.lock.json:T47.A4` resolvable par le meme moyen dans ce
 * fichier. Ce second canal n'affaiblit PAS la regle : le registre gele est
 * la prescription EXACTE de la perturbation que A4 doit detecter
 * (« rendre un usage reussi quand subtype vaut error_during_execution : le
 * cas doit rougir ») — l'omettre rendrait A4 aveugle a exactement le mutant
 * que verification/mutants/T47.json doit lui opposer.
 *
 * Litteraux ainsi fixes :
 *   `-p`, `--output-format`, `json`, `--no-session-persistence`  — L135, A1
 *   `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`                  — L135, A1
 *   `input_fresh`, `cache_read`, `output`                        — L135, A2
 *   `cache_write_5m`, `cache_write_1h`                            — L135, A3
 *   `inputTokens` (nom de champ BRUT d'une entree modelUsage)     — L72, A2
 *   `error_during_execution` (valeur de `subtype`)  — cases.extensions.lock.json:T47.A4
 *
 * CE QUE CETTE SUITE FABRIQUE, ET QUI N'EST DONC PAS UN LITTERAL A FAIRE
 * REMONTER : les identifiants de modele factices (`stub-model-alpha`,
 * `stub-model-beta`, `claude-config-unused-in-usage-check`), les grandeurs de
 * tokens choisies pour A2/A3 (entiers DISTINCTS, entrees de test arbitraires
 * pour detecter une permutation de champs — meme discipline que
 * acceptance/T44.spec.ts/II), le contenu de `--model`/`workspaceDir`/
 * `env` de test, et le fixture
 * acceptance/fixtures/claude-cli/bin/claude lui-meme (zone ACCEPTANCE, pas
 * une source de T47 : c'est le faux executable que la commande de L137
 * exige, pas packages/agents).
 *
 * Deux noms NE SONT PAS enonces par l'ADR et sont FIXES ICI, comme
 * `cache_unresolved` l'a ete par acceptance/T44.spec.ts pour T44 :
 *   `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens` — les
 *     trois noms de champs BRUTS d'une entree `modelUsage` qui completent
 *     `inputTokens` (seul nom cite litteralement, L72) par parallelisme de
 *     casse avec lui — exactement le schema que l'ADR designe comme
 *     « deduit des types du SDK, pas publie comme tel » (L50-51), pas une
 *     invention sans fondement.
 *   `cache_write_unresolved` — le nom de la SIXIEME categorie (ADR-002 a
 *     cinq ; T47 n'ecrit jamais `cache_write_5m`/`cache_write_1h`, cf. A3)
 *     qui recoit l'ecriture de cache non ventilee. DISTINCT de
 *     `cache_unresolved` (T44) : celui de T44 resout une ambiguite
 *     LECTURE/ECRITURE, celui-ci une ambiguite de DUREE D'ECRITURE — les
 *     deux problemes que « meme discipline que T44.A4 » (L75) rapproche sans
 *     les confondre.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T47 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Paquet interroge : `packages/agents` (source_paths de T47). Aucun export
 * de T47 n'existe ailleurs dans le depot ; tout ce qui suit est FIXE PAR
 * CETTE SUITE, exactement la situation de acceptance/T17.spec.ts face a
 * packages/gateway au moment ou elle a ete ecrite.
 *
 * 1. `launchClaudeCliPeriod(options)` — fonction asynchrone, UNIQUE point
 *    d'entree de T47 que cette suite exerce.
 *      options.workspaceDir : string — « dans le repertoire de l'espace de
 *        travail » (A1) : le cwd du processus `claude` lance DOIT egaler ce
 *        chemin.
 *      options.model        : string — « le modele de la configuration »
 *        (A1) : la valeur passee a l'option `--model` (nom d'option FIXE ICI
 *        — L135 nomme `-p`/`--output-format`/`--no-session-persistence`
 *        littéralement mais ne nomme aucune option pour le modele, seulement
 *        « le modele de la configuration »).
 *      options.env           : Record<string,string|undefined> — l'
 *        environnement AMBIANT tel que l'appelant le fournirait a la session
 *        s'il n'etait pas purge (« meme lorsque l'appelant les definit »,
 *        A1) ; DOIT porter un `PATH` qui resout `claude` vers le faux
 *        executable de cette suite pour que l'appel reste sans effet reel.
 *        La fonction DOIT retirer `ANTHROPIC_API_KEY` et
 *        `ANTHROPIC_AUTH_TOKEN` de CET environnement avant de lancer le
 *        processus — leur absence totale (pas une valeur vide) est ce
 *        qu'A1 exige.
 *      Rend une promesse qui RESOUT TOUJOURS (ne leve jamais pour les quatre
 *      conditions d'echec de A4 ni pour le refus de A5 — ce sont des
 *      resultats, pas des pannes) vers :
 *        SUCCES : { ok: true, raw: string, usage: Usage[] }
 *        ECHEC  : { ok: false, reason: string, raw: string | null }
 *      ou `Usage` est, par entree de `modelUsage` declaree par la session :
 *        {
 *          model: string,                 // la cle de modelUsage (A2)
 *          input_fresh: number,            // = entry.inputTokens (A2)
 *          cache_read: number,             // = entry.cacheReadInputTokens (A2)
 *          output: number,                 // = entry.outputTokens (A2)
 *          cache_write_5m: number,         // TOUJOURS 0 (A3 : duree jamais declaree)
 *          cache_write_1h: number,         // TOUJOURS 0 (A3)
 *          cache_write_unresolved: number, // = entry.cacheCreationInputTokens (A3)
 *        }
 *      `reason` est un motif NOMME, DISTINCT entre les differentes causes
 *      d'echec (cf. IV — cette suite n'impose PAS de chaine exacte, une
 *      implementation qui rendrait toujours la MEME constante quelle que
 *      soit la cause est rejetee par l'assertion de distinction d'A4).
 *      `raw` est la sortie texte BRUTE de la session (A1/A4 : « rend la
 *      sortie brute » / « conserve la sortie brute »), comparee par son
 *      contenu normalise (espaces de bord retires), jamais retraitee.
 *
 * 2. Avant de lancer toute session, `launchClaudeCliPeriod` DOIT invoquer
 *    `claude auth status` (meme executable resolu via `options.env.PATH`) et
 *    lire son `authMethod` : si sa valeur est `'api_key'`, la fonction REND
 *    `{ ok: false, reason, raw }` SANS JAMAIS invoquer la session `-p` (A5).
 *    Le nom exact `'api_key'` n'est PAS un litteral de l'ADR (authMethod n'y
 *    est observe que valant `oauth_token`, L31) : il est FIXE PAR LE FIXTURE
 *    de cette suite (acceptance/fixtures/claude-cli/bin/claude), au meme
 *    titre que les identites de fournisseur factices d'acceptance/T44.spec.ts
 *    (cf. II) — ce que A5 observe n'est JAMAIS la chaine elle-meme mais DEUX
 *    PREUVES COMPORTEMENTALES (cf. III.4) : le controle a eu lieu, et aucune
 *    session n'a suivi.
 *
 * 3. Le fixture acceptance/fixtures/claude-cli/bin/claude accepte le
 *    pilotage PAR VARIABLE D'ENVIRONNEMENT suivant (documente dans le
 *    fichier lui-meme) : `BENCH_FAKE_CLAUDE_AUTH_MARKER_FILE`,
 *    `BENCH_FAKE_CLAUDE_AUTH_METHOD`, `BENCH_FAKE_CLAUDE_AUTH_PROVIDER`,
 *    `BENCH_FAKE_CLAUDE_RECORD_FILE`, `BENCH_FAKE_CLAUDE_STDOUT_RAW`,
 *    `BENCH_FAKE_CLAUDE_EXIT_CODE`. Ces six variables ne font PAS partie du
 *    contrat de `packages/agents` : `launchClaudeCliPeriod` n'a besoin de les
 *    connaitre pour rien d'autre que de les laisser passer dans
 *    l'environnement qu'il transmet au processus (ce qu'il fait de toute
 *    facon de tout l'environnement, hors des deux cles retirees).
 *
 * 4. PREUVES COMPORTEMENTALES que cette suite lit (jamais une chaine
 *    arbitraire du fournisseur factice) :
 *      - fichier de MARQUEUR D'AUTH (`BENCH_FAKE_CLAUDE_AUTH_MARKER_FILE`) :
 *        sa PRESENCE apres l'appel prouve que `claude auth status` a
 *        reellement ete invoque (pas suppose) — necessaire pour qu'un refus
 *        de A5 ne soit pas un hasard qui refuserait TOUT inconditionnellement.
 *      - fichier d'ENREGISTREMENT DE SESSION (`BENCH_FAKE_CLAUDE_RECORD_FILE`) :
 *        sa PRESENCE prouve qu'une session `-p` a ete lancee ; son ABSENCE
 *        (A5) prouve qu'aucune ne l'a ete. Son contenu (`argv`, `cwd`,
 *        `hasApiKey`, `hasAuthToken`) porte les preuves d'A1.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne fixe ni la presence ni la forme d'un `prompt` (texte envoye a la
 *    session, sur `stdin` ou en argument) : aucun des cinq cas ne le nomme —
 *    c'est l'objet de T49.A2, hors de ce lot. Le fixture ignore tout ce qui
 *    n'est pas `auth status`.
 *  • Elle n'exige AUCUNE chaine exacte pour `reason` (cf. III.1) : seulement
 *    sa presence, son type et sa distinction entre causes — ce que l'ADR
 *    nomme jamais litteralement un « code ».
 *  • Elle n'invoque jamais la vraie CLI `claude` (L96-100, L137) : un GARDE-
 *    FOU (ci-dessous, `verifierFauxEnTetePath`) verifie, pour CHAQUE
 *    environnement construit par cette suite, que `claude` resout vers le
 *    fixture de cette zone AVANT tout appel a `launchClaudeCliPeriod`.
 *  • Elle ne teste pas `--max-budget-usd` (L52-53 : « ne s'applique pas a
 *    l'authentification par abonnement ») ni la ventilation reelle 5 min/1 h
 *    (L49 : « non documente ») — ADR-008 exclut explicitement les deux de ce
 *    qu'on peut observer.
 *  • Elle ne teste pas la persistance d'une periode, un budget ni une
 *    trajectoire : T47 ne persiste rien (III.1 — un resultat en memoire) ;
 *    c'est l'objet de T46 (deja prouve) et T49 (hors de ce lot) qui
 *    branchent ce resultat sur `packages/storage`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 30_000;

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

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 10) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
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

const court = (s: string, n = 600): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/** Ce qui N'EST PAS un refus : un plantage (meme convention que
 * T00/T17/T25/T37/T39/T45/T46). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* ═══════════════════ chargement de packages/agents ═══════════════════ */

interface Loaded {
  charge: boolean;
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

function specifiersForAgents(): string[] {
  const dir = path.join(REPO, 'packages', 'agents');
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

async function loadAgents(): Promise<Loaded> {
  const attempts: string[] = [];
  const flat = new Map<string, unknown>();
  let charge = false;
  for (const s of specifiersForAgents()) {
    if (charge) break;
    try {
      const mod = (await import(s)) as Ns;
      flatten(mod, flat);
      charge = true;
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  if (!charge) attempts.push('paquet packages/agents : aucun specificateur n a repondu');
  return { charge, flat, attempts };
}

let LOADED: Loaded = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  LOADED = await loadAgents();
}, CASE_TIMEOUT_MS);

function assertAgentsLoaded(): void {
  expect(
    LOADED.charge ? 'packages/agents-charge' : `PAQUET-NON-CHARGEABLE packages/agents : ${LOADED.attempts.join(' | ')}`,
  ).toBe('packages/agents-charge');
}

/* ─────────────────────────────────────────────── resolution par role */

const ROLES_LAUNCH = [
  'launchClaudeCliPeriod',
  'runClaudeCliPeriod',
  'launchClaudePeriodSession',
  'runClaudeCliSession',
  'launchPeriodWithClaudeCli',
  'runPeriodClaudeCli',
] as const;

type Fn = (...a: unknown[]) => unknown;

function resolveLaunch(): { fn?: Fn; tried: readonly string[] } {
  for (const a of ROLES_LAUNCH) {
    const v = LOADED.flat.get(a);
    if (typeof v === 'function') return { fn: v as Fn, tried: ROLES_LAUNCH };
  }
  return { tried: ROLES_LAUNCH };
}

function requireLaunch(): Fn {
  const { fn, tried } = resolveLaunch();
  expect(
    fn !== undefined ? 'role-launchClaudeCliPeriod-trouve' : `ROLE-INTROUVABLE launchClaudeCliPeriod (essaye : ${tried.join(', ')})`,
  ).toBe('role-launchClaudeCliPeriod-trouve');
  return fn as Fn;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<
  { ok: true; value: T } | { ok: false; err: unknown }
> {
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

/* ═══════════════ les litteraux de L135/L72, et rien d'autre ═══════════════ */

const FLAG_P = '-p'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const FLAG_OUTPUT_FORMAT = '--output-format'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const VALUE_JSON = 'json'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const FLAG_NO_SESSION_PERSISTENCE = '--no-session-persistence'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
/** Nom d'option FIXE PAR CETTE SUITE (cf. III.1) — L135 ne nomme aucune
 * option pour « le modele de la configuration ». */
const FLAG_MODEL = '--model';

const ENV_KEY_API_KEY = 'ANTHROPIC_API_KEY'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const ENV_KEY_AUTH_TOKEN = 'ANTHROPIC_AUTH_TOKEN'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135

const CHAMP_INPUT_FRESH = 'input_fresh'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_CACHE_READ = 'cache_read'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_OUTPUT = 'output'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_CACHE_WRITE_5M = 'cache_write_5m'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_CACHE_WRITE_1H = 'cache_write_1h'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
/** Sixieme categorie — FIXEE PAR CETTE SUITE (cf. II), distincte de
 * `cache_unresolved` (T44). */
const CHAMP_CACHE_WRITE_UNRESOLVED = 'cache_write_unresolved';

const CHAMPS_USAGE_ATTENDUS = [
  'model',
  CHAMP_INPUT_FRESH,
  CHAMP_CACHE_READ,
  CHAMP_OUTPUT,
  CHAMP_CACHE_WRITE_5M,
  CHAMP_CACHE_WRITE_1H,
  CHAMP_CACHE_WRITE_UNRESOLVED,
] as const;

const ZERO_UNITE = 0; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L74 (« jamais repartis »)

/** Nom de champ BRUT d'une entree modelUsage — SEUL cite litteralement par
 * l'ADR. */
const BRUT_INPUT_TOKENS = 'inputTokens'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L72
/** Noms freres, FIXES PAR CETTE SUITE par parallelisme de casse avec
 * `inputTokens` (cf. II). */
const BRUT_OUTPUT_TOKENS = 'outputTokens';
const BRUT_CACHE_READ_TOKENS = 'cacheReadInputTokens';
const BRUT_CACHE_CREATION_TOKENS = 'cacheCreationInputTokens';

/** Valeur de `subtype` prescrite par le registre gele comme perturbation de
 * A4 — litteral dont la provenance n'est PAS l'ADR (cf. II). */
const SUBTYPE_ERROR_DURING_EXECUTION = 'error_during_execution'; // cases.extensions.lock.json:T47.A4

/* ═══════════════ faux executable claude (zone ACCEPTANCE) ═══════════════ */

const FAKE_CLAUDE_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const FAKE_CLAUDE_BIN = path.join(FAKE_CLAUDE_DIR, 'claude');

function assertFixtureReady(): void {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(FAKE_CLAUDE_BIN);
  } catch {
    stat = undefined;
  }
  const executable = stat !== undefined && (stat.mode & 0o111) !== 0;
  expect(
    executable ? 'fixture-claude-executable' : `FIXTURE-CLAUDE-MANQUANTE-OU-NON-EXECUTABLE ${FAKE_CLAUDE_BIN}`,
  ).toBe('fixture-claude-executable');
}

/** Cherche le premier fichier nomme `name` sur `pathEnv`, dans l'ordre des
 * repertoires — c'est EXACTEMENT ce que `command -v`/la resolution PATH
 * d'un spawn sans shell font. */
function firstOnPath(pathEnv: string, name: string): string | undefined {
  for (const dir of pathEnv.split(path.delimiter)) {
    if (dir.length === 0) continue;
    const candidate = path.join(dir, name);
    try {
      const st = fs.statSync(candidate);
      if (st.isFile() && (st.mode & 0o111) !== 0) return candidate;
    } catch {
      /* rien a ce repertoire */
    }
  }
  return undefined;
}

/** GARDE-FOU (cf. IV) : AVANT tout appel a launchClaudeCliPeriod, verifie que
 * `claude` resout bien vers LE FIXTURE de cette zone sur le PATH fourni —
 * jamais une vraie CLI. Echoue l'assertion sinon, au lieu de risquer un
 * appel reel. */
function verifierFauxEnTetePath(pathEnv: string): void {
  const resolu = firstOnPath(pathEnv, 'claude');
  const attendu = fs.realpathSync(FAKE_CLAUDE_BIN);
  const obtenu = resolu !== undefined ? fs.realpathSync(resolu) : undefined;
  expect(
    obtenu === attendu
      ? 'claude-resout-vers-le-faux-executable'
      : `CLAUDE-NE-RESOUT-PAS-VERS-LE-FAUX : attendu=${attendu} obtenu=${rendu(obtenu)} (PATH=${pathEnv})`,
  ).toBe('claude-resout-vers-le-faux-executable');
}

let compteur = 0;
function idFor(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${process.pid.toString(36)}-${compteur}`;
}

const TMP_DIRS: string[] = [];
function tmp(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `t47-${prefixe}-`));
  TMP_DIRS.push(d);
  return d;
}

afterAll(() => {
  for (const d of TMP_DIRS) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* nettoyage au mieux-effort, ne fait pas partie des assertions */
    }
  }
});

/** Construit l'environnement AMBIANT d'un appel de test : PATH avec le faux
 * `claude` EN TETE (verifie avant tout usage), plus les variables de
 * pilotage du fixture et les surcharges demandees (ex. ANTHROPIC_API_KEY
 * pour simuler « l'appelant les definit », A1). */
function buildEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const path_ = `${FAKE_CLAUDE_DIR}${path.delimiter}${process.env.PATH ?? ''}`;
  verifierFauxEnTetePath(path_);
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: path_, ...overrides };
  return env;
}

/** Extrait {reason, raw} d'un resultat d'echec, QUE launchClaudeCliPeriod
 * l'ait rendu normalement ({ok:false,...}) ou qu'il ait leve une erreur
 * PORTANT ces memes champs. Un plantage generique (cf. MARQUEURS_DE_PLANTAGE)
 * echoue l'assertion plutot que d'etre confondu avec un refus NOMME (meme
 * danger que T00/T17/T45/T46). */
async function attendreEchecNomme(
  appel: Promise<unknown>,
): Promise<{ reason: string; raw: string | null }> {
  const issue = await essayer(() => appel);
  if (issue.ok) {
    const v = issue.value as Json;
    expect(
      v.ok === false ? 'resultat-signale-comme-echec' : `RESULTAT-NON-SIGNALE-ECHEC ${rendu(v)}`,
    ).toBe('resultat-signale-comme-echec');
    const reason = v.reason;
    expect(
      typeof reason === 'string' && reason.length > 0 ? 'motif-non-vide' : `MOTIF-VIDE-OU-ABSENT ${rendu(reason)}`,
    ).toBe('motif-non-vide');
    const raw = v.raw;
    expect(
      raw === null || typeof raw === 'string' ? 'raw-de-type-valide' : `RAW-DE-TYPE-INVALIDE ${rendu(raw)}`,
    ).toBe('raw-de-type-valide');
    return { reason: reason as string, raw: (raw as string | null) ?? null };
  }
  const err = issue.err;
  const msg = messageDe(err);
  expect(
    MARQUEURS_DE_PLANTAGE.test(msg) ? `PLANTAGE-GENERIQUE-PAS-UN-REFUS-NOMME ${court(msg, 400)}` : 'pas-un-plantage-generique',
  ).toBe('pas-un-plantage-generique');
  const e = err as Json;
  const reason = (typeof e.reason === 'string' && e.reason) || (typeof e.code === 'string' && e.code) || msg;
  const raw = typeof e.raw === 'string' ? e.raw : null;
  return { reason, raw };
}

/* ══════════════════════════════ T47.A1 ══════════════════════════════════ */

test('T47.A1 — session lancee avec -p/--output-format json/--no-session-persistence/--model, dans le workspace, sans les cles meme definies par l appelant', async () => {
  assertAgentsLoaded();
  assertFixtureReady();
  const launch = requireLaunch();

  const workspaceDir = tmp('a1-workspace');
  const recordFile = path.join(tmp('a1-record'), 'record.json');
  const MODEL_CONFIGURE = 'claude-a1-configured-model';

  const env = buildEnv({
    BENCH_FAKE_CLAUDE_RECORD_FILE: recordFile,
    // L'appelant DEFINIT les deux cles — A1 exige qu'elles n'atteignent PAS
    // la session malgre cela.
    [ENV_KEY_API_KEY]: 'sk-ant-test-caller-defined',
    [ENV_KEY_AUTH_TOKEN]: 'tok-test-caller-defined',
  });

  const res = await essayer(() => launch({ workspaceDir, model: MODEL_CONFIGURE, env }));
  expect(res.ok ? 'appel-execute' : `APPEL-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe('appel-execute');
  const v = (res as { ok: true; value: Json }).value;
  expect(v.ok === true ? 'session-reussie' : `SESSION-EN-ECHEC-INATTENDU ${rendu(v)}`).toBe('session-reussie');

  expect(
    fs.existsSync(recordFile) ? 'session-effectivement-lancee' : 'SESSION-JAMAIS-LANCEE-AUCUN-ENREGISTREMENT',
  ).toBe('session-effectivement-lancee');
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8')) as {
    argv: string[];
    cwd: string;
    hasApiKey: boolean;
    hasAuthToken: boolean;
  };

  // Les quatre drapeaux de L135, litteralement.
  expect(
    record.argv.includes(FLAG_P) ? 'drapeau--p-present' : `DRAPEAU--p-ABSENT argv=${rendu(record.argv)}`,
  ).toBe('drapeau--p-present'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
  const iOutputFormat = record.argv.indexOf(FLAG_OUTPUT_FORMAT);
  expect(
    iOutputFormat !== -1 && record.argv[iOutputFormat + 1] === VALUE_JSON
      ? 'output-format-json-present'
      : `OUTPUT-FORMAT-JSON-ABSENT-OU-MAL-FORME argv=${rendu(record.argv)}`,
  ).toBe('output-format-json-present'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
  expect(
    record.argv.includes(FLAG_NO_SESSION_PERSISTENCE)
      ? 'no-session-persistence-present'
      : `NO-SESSION-PERSISTENCE-ABSENT argv=${rendu(record.argv)}`,
  ).toBe('no-session-persistence-present'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
  const iModel = record.argv.indexOf(FLAG_MODEL);
  expect(
    iModel !== -1 && record.argv[iModel + 1] === MODEL_CONFIGURE
      ? 'modele-de-la-configuration-present'
      : `MODELE-DE-LA-CONFIGURATION-ABSENT-OU-FAUX argv=${rendu(record.argv)}`,
  ).toBe('modele-de-la-configuration-present'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135

  // « dans le repertoire de l'espace de travail ».
  expect(fs.realpathSync(record.cwd)).toBe(fs.realpathSync(workspaceDir)); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135

  // L'ASSERTION DECISIVE : ABSENCE TOTALE, pas vide — meme quand l'appelant
  // a defini les deux cles ci-dessus.
  expect(
    record.hasApiKey === false ? `${ENV_KEY_API_KEY}-absent` : `${ENV_KEY_API_KEY}-PRESENT-MALGRE-LA-PURGE`,
  ).toBe(`${ENV_KEY_API_KEY}-absent`); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
  expect(
    record.hasAuthToken === false ? `${ENV_KEY_AUTH_TOKEN}-absent` : `${ENV_KEY_AUTH_TOKEN}-PRESENT-MALGRE-LA-PURGE`,
  ).toBe(`${ENV_KEY_AUTH_TOKEN}-absent`); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ T47.A2 ══════════════════════════════════ */

test('T47.A2 — pour chaque modele declare par modelUsage, usage rendu avec input_fresh/cache_read/output egaux aux tokens declares', async () => {
  assertAgentsLoaded();
  assertFixtureReady();
  const launch = requireLaunch();

  const workspaceDir = tmp('a2-workspace');

  // Deux modeles DISTINCTS dans modelUsage (« une meme session peut employer
  // plusieurs modeles », L47-48) — le modele de CONFIGURATION ci-dessous est
  // volontairement un TROISIEME nom, absent de modelUsage, pour prouver que
  // l'usage rendu provient des CLES de modelUsage et non de la configuration.
  const MODEL_CONFIGURE_NON_UTILISE_DANS_USAGE = 'claude-config-unused-in-usage-check';
  const MODEL_ALPHA = 'stub-model-alpha';
  const MODEL_BETA = 'stub-model-beta';

  // Six entiers DISTINCTS (entree de test, cf. II) pour detecter une
  // permutation de champs. cacheCreationInputTokens est a ZERO ici : A3
  // (isole) en exerce le routage, pas ce cas.
  const USAGE_ALPHA = { input: 11, output: 7, cacheRead: 13 };
  const USAGE_BETA = { input: 19, output: 5, cacheRead: 17 };

  const stdout = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: idFor('sess'),
    num_turns: 3,
    total_cost_usd: 0.42,
    usage: {
      input_tokens: USAGE_ALPHA.input + USAGE_BETA.input,
      output_tokens: USAGE_ALPHA.output + USAGE_BETA.output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: USAGE_ALPHA.cacheRead + USAGE_BETA.cacheRead,
    },
    modelUsage: {
      [MODEL_ALPHA]: {
        [BRUT_INPUT_TOKENS]: USAGE_ALPHA.input,
        [BRUT_OUTPUT_TOKENS]: USAGE_ALPHA.output,
        [BRUT_CACHE_READ_TOKENS]: USAGE_ALPHA.cacheRead,
        [BRUT_CACHE_CREATION_TOKENS]: 0,
      },
      [MODEL_BETA]: {
        [BRUT_INPUT_TOKENS]: USAGE_BETA.input,
        [BRUT_OUTPUT_TOKENS]: USAGE_BETA.output,
        [BRUT_CACHE_READ_TOKENS]: USAGE_BETA.cacheRead,
        [BRUT_CACHE_CREATION_TOKENS]: 0,
      },
    },
  });

  const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: stdout });

  const res = await essayer(() =>
    launch({ workspaceDir, model: MODEL_CONFIGURE_NON_UTILISE_DANS_USAGE, env }),
  );
  expect(res.ok ? 'appel-execute' : `APPEL-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe('appel-execute');
  const v = (res as { ok: true; value: Json }).value;
  expect(v.ok === true ? 'session-reussie' : `SESSION-EN-ECHEC-INATTENDU ${rendu(v)}`).toBe('session-reussie');

  const usage = v.usage;
  expect(Array.isArray(usage) ? 'usage-est-un-tableau' : `USAGE-N-EST-PAS-UN-TABLEAU ${rendu(usage)}`).toBe(
    'usage-est-un-tableau',
  );
  const liste = usage as Json[];
  expect(liste.length === 2 ? 'deux-entrees-une-par-modele' : `NOMBRE-D-ENTREES-INATTENDU ${rendu(liste)}`).toBe(
    'deux-entrees-une-par-modele',
  ); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L47 (« une meme session peut employer plusieurs modeles »)

  const parModele = new Map(liste.map((e) => [e.model as string, e]));
  for (const [modele, attendu] of [
    [MODEL_ALPHA, USAGE_ALPHA],
    [MODEL_BETA, USAGE_BETA],
  ] as const) {
    const entree = parModele.get(modele);
    expect(
      entree !== undefined ? `entree-${modele}-presente` : `ENTREE-ABSENTE-POUR ${modele} (vu : ${rendu(liste)})`,
    ).toBe(`entree-${modele}-presente`);
    const e = entree as Json;

    // Exactement les sept champs du contrat (III.1), ni plus ni moins.
    expect([...Object.keys(e)].sort()).toEqual([...CHAMPS_USAGE_ATTENDUS].sort());

    for (const champ of CHAMPS_USAGE_ATTENDUS) {
      if (champ === 'model') continue;
      const val = e[champ];
      expect(
        typeof val === 'number' && Number.isInteger(val) && val >= 0
          ? `${champ}-entier-non-negatif`
          : `${champ.toUpperCase()}-INVALIDE ${rendu(val)}`,
      ).toBe(`${champ}-entier-non-negatif`);
    }

    // L'ASSERTION DECISIVE : EGAL aux tokens DECLARES par CE modele.
    expect(e[CHAMP_INPUT_FRESH]).toBe(attendu.input); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L72
    expect(e[CHAMP_CACHE_READ]).toBe(attendu.cacheRead); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
    expect(e[CHAMP_OUTPUT]).toBe(attendu.output); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
  }

  // Les deux valeurs d'input_fresh sont DISTINCTES — garde-fou contre une
  // implementation qui dupliquerait la meme entree pour chaque modele.
  const alpha = parModele.get(MODEL_ALPHA) as Json;
  const beta = parModele.get(MODEL_BETA) as Json;
  expect(
    alpha[CHAMP_INPUT_FRESH] !== beta[CHAMP_INPUT_FRESH]
      ? 'deux-modeles-deux-usages-distincts'
      : `MEME-USAGE-POUR-DEUX-MODELES ${rendu(alpha)}`,
  ).toBe('deux-modeles-deux-usages-distincts');
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ T47.A3 ══════════════════════════════════ */

test('T47.A3 — ecriture de cache non ventilee par duree : jamais attribuee a cache_write_5m/1h', async () => {
  assertAgentsLoaded();
  assertFixtureReady();
  const launch = requireLaunch();

  const workspaceDir = tmp('a3-workspace');
  const MODEL = 'stub-model-cache-writer';

  // L'ADR (L49) : la duree (5 min / 1 h) n'est JAMAIS declaree par la
  // session — il n'existe donc, cote source, qu'UN SEUL compteur d'ecriture
  // de cache (cacheCreationInputTokens), jamais deux.
  const ECRITURE_AMBIGUE = 23;

  const stdout = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: idFor('sess'),
    num_turns: 1,
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: ECRITURE_AMBIGUE,
      cache_read_input_tokens: 0,
    },
    modelUsage: {
      [MODEL]: {
        [BRUT_INPUT_TOKENS]: 0,
        [BRUT_OUTPUT_TOKENS]: 0,
        [BRUT_CACHE_READ_TOKENS]: 0,
        [BRUT_CACHE_CREATION_TOKENS]: ECRITURE_AMBIGUE,
      },
    },
  });

  const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: stdout });

  const res = await essayer(() => launch({ workspaceDir, model: MODEL, env }));
  expect(res.ok ? 'appel-execute' : `APPEL-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe('appel-execute');
  const v = (res as { ok: true; value: Json }).value;
  expect(v.ok === true ? 'session-reussie' : `SESSION-EN-ECHEC-INATTENDU ${rendu(v)}`).toBe('session-reussie');

  const usage = v.usage;
  expect(Array.isArray(usage) ? 'usage-est-un-tableau' : `USAGE-N-EST-PAS-UN-TABLEAU ${rendu(usage)}`).toBe(
    'usage-est-un-tableau',
  );
  const entree = (usage as Json[]).find((e) => e.model === MODEL);
  expect(
    entree !== undefined ? 'entree-presente' : `ENTREE-ABSENTE-POUR ${MODEL} (vu : ${rendu(usage)})`,
  ).toBe('entree-presente');
  const e = entree as Json;

  // L'ASSERTION DECISIVE (proof_kind=absence) : AUCUNE unite attribuee a
  // cache_write_5m NI cache_write_1h — meme quand un total non nul existe.
  expect(e[CHAMP_CACHE_WRITE_5M]).toBe(ZERO_UNITE); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L74
  expect(e[CHAMP_CACHE_WRITE_1H]).toBe(ZERO_UNITE); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L74

  // « conservees dans une categorie explicite d'ecriture non ventilee » —
  // l'unite n'est pas perdue, elle est reportee sous le nom FIXE PAR CETTE
  // SUITE (cf. II).
  const nonVentile = e[CHAMP_CACHE_WRITE_UNRESOLVED];
  expect(
    typeof nonVentile === 'number' && Number.isInteger(nonVentile) && nonVentile >= 0
      ? 'categorie-non-ventilee-presente'
      : `CATEGORIE-NON-VENTILEE-ABSENTE-OU-INVALIDE ${rendu(nonVentile)} (cles : ${rendu(Object.keys(e))})`,
  ).toBe('categorie-non-ventilee-presente'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L73-L75
  expect(nonVentile).toBe(ECRITURE_AMBIGUE); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L73-L75

  // Garde-fou final contre une collision de nom qui ferait passer le mutant
  // T47.M3 (router vers cache_write_5m) pour un succes.
  expect(
    [CHAMP_CACHE_WRITE_5M, CHAMP_CACHE_WRITE_1H].includes(CHAMP_CACHE_WRITE_UNRESOLVED)
      ? `COLLISION-DE-NOM ${CHAMP_CACHE_WRITE_UNRESOLVED}`
      : 'aucune-collision-de-nom',
  ).toBe('aucune-collision-de-nom');
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ T47.A4 ══════════════════════════════════ */

test('T47.A4 — session en erreur, sortie illisible, forme inconnue ou code de sortie non nul : echec nomme, raw conserve, aucun usage reussi', async () => {
  assertAgentsLoaded();
  assertFixtureReady();
  const launch = requireLaunch();
  const MODEL = 'stub-model-a4';

  const motifsObtenus = new Set<string>();

  // (a) SESSION TERMINEE EN ERREUR : subtype prescrit par le registre gele
  //     (cf. II) — usage/modelUsage par ailleurs PARFAITEMENT valides, pour
  //     que seul le controle de `subtype`/`is_error` puisse sauver le cas.
  {
    const workspaceDir = tmp('a4a-workspace');
    const raw = JSON.stringify({
      type: 'result',
      subtype: SUBTYPE_ERROR_DURING_EXECUTION, // cases.extensions.lock.json:T47.A4
      is_error: true,
      session_id: idFor('sess'),
      num_turns: 2,
      total_cost_usd: 0.1,
      usage: { input_tokens: 5, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: { [MODEL]: { [BRUT_INPUT_TOKENS]: 5, [BRUT_OUTPUT_TOKENS]: 5, [BRUT_CACHE_READ_TOKENS]: 0, [BRUT_CACHE_CREATION_TOKENS]: 0 } },
    });
    const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: raw });
    const { reason, raw: rawRendu } = await attendreEchecNomme(
      Promise.resolve(launch({ workspaceDir, model: MODEL, env })),
    );
    motifsObtenus.add(reason);
    expect((rawRendu ?? '').trim()).toBe(raw.trim()); // « conserve la sortie brute »
  }

  // (b) SORTIE ILLISIBLE : pas du JSON.
  {
    const workspaceDir = tmp('a4b-workspace');
    const raw = 'ceci n est pas du JSON {{{ truncated…';
    const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: raw });
    const { reason, raw: rawRendu } = await attendreEchecNomme(
      Promise.resolve(launch({ workspaceDir, model: MODEL, env })),
    );
    motifsObtenus.add(reason);
    expect((rawRendu ?? '').trim()).toBe(raw.trim());
  }

  // (c) SORTIE DE FORME INCONNUE : du JSON valide, mais sans la forme
  //     documentee (ni `subtype`, ni `usage`, ni `modelUsage`).
  {
    const workspaceDir = tmp('a4c-workspace');
    const raw = JSON.stringify({ hello: 'world', unrelated: 42 });
    const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: raw });
    const { reason, raw: rawRendu } = await attendreEchecNomme(
      Promise.resolve(launch({ workspaceDir, model: MODEL, env })),
    );
    motifsObtenus.add(reason);
    expect((rawRendu ?? '').trim()).toBe(raw.trim());
  }

  // (d) CODE DE SORTIE NON NUL : la sortie, elle, A L'AIR d'un succes
  //     parfaitement valide — seul le code de sortie doit suffire a refuser.
  {
    const workspaceDir = tmp('a4d-workspace');
    const raw = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: idFor('sess'),
      num_turns: 1,
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: { [MODEL]: { [BRUT_INPUT_TOKENS]: 1, [BRUT_OUTPUT_TOKENS]: 1, [BRUT_CACHE_READ_TOKENS]: 0, [BRUT_CACHE_CREATION_TOKENS]: 0 } },
    });
    const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: raw, BENCH_FAKE_CLAUDE_EXIT_CODE: '1' });
    const { reason, raw: rawRendu } = await attendreEchecNomme(
      Promise.resolve(launch({ workspaceDir, model: MODEL, env })),
    );
    motifsObtenus.add(reason);
    expect((rawRendu ?? '').trim()).toBe(raw.trim());
  }

  // GARDE-FOU CONTRE UNE CONSTANTE UNIQUE : les quatre motifs observes sont
  // DISTINCTS deux a deux — une implementation qui rendrait toujours la MEME
  // chaine (« FAILED ») quelle que soit la cause satisferait chaque
  // assertion individuelle ci-dessus sans RIEN distinguer.
  expect(
    motifsObtenus.size === 4
      ? 'quatre-motifs-distincts'
      : `MOINS-DE-QUATRE-MOTIFS-DISTINCTS ${rendu([...motifsObtenus])}`,
  ).toBe('quatre-motifs-distincts');
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ T47.A5 ══════════════════════════════════ */

test('T47.A5 — authMethod api_key declare par claude auth status : periode refusee AVANT toute session', async () => {
  assertAgentsLoaded();
  assertFixtureReady();
  const launch = requireLaunch();

  const workspaceDir = tmp('a5-workspace');
  const sessionRecordFile = path.join(tmp('a5-record'), 'record.json');
  const authMarkerFile = path.join(tmp('a5-auth-marker'), 'marker.json');

  const env = buildEnv({
    BENCH_FAKE_CLAUDE_AUTH_METHOD: 'api_key',
    BENCH_FAKE_CLAUDE_AUTH_PROVIDER: 'firstParty',
    BENCH_FAKE_CLAUDE_AUTH_MARKER_FILE: authMarkerFile,
    BENCH_FAKE_CLAUDE_RECORD_FILE: sessionRecordFile,
  });

  const { reason } = await attendreEchecNomme(
    Promise.resolve(launch({ workspaceDir, model: 'stub-model-a5', env })),
  );
  expect(typeof reason === 'string' && reason.length > 0 ? 'motif-non-vide' : 'MOTIF-VIDE').toBe('motif-non-vide'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L66

  // CONTROLE DE CAPACITE (1/2) : le controle a REELLEMENT eu lieu — sans ce
  // marqueur, un refus inconditionnel (qui refuserait TOUT, meme une
  // authentification saine) satisferait l'assertion ci-dessous sans jamais
  // avoir interroge `claude auth status`.
  expect(
    fs.existsSync(authMarkerFile)
      ? 'auth-status-reellement-invoque'
      : 'AUTH-STATUS-JAMAIS-INVOQUE-REFUS-NON-FONDE',
  ).toBe('auth-status-reellement-invoque'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L65-L66

  // L'ASSERTION DECISIVE (proof_kind=refusal) : AUCUNE session `-p` n'a ete
  // lancee — « refusee avant toute session », litteralement.
  expect(
    fs.existsSync(sessionRecordFile)
      ? 'SESSION-LANCEE-MALGRE-LE-REFUS-ATTENDU'
      : 'aucune-session-lancee',
  ).toBe('aucune-session-lancee'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135

  // CONTROLE DE CAPACITE (2/2) : la MEME fonction, avec une authentification
  // SAINE (oauth_token, le defaut mesure par l'ADR, L31), DOIT au contraire
  // lancer une session — sans ce controle, une implementation qui refuserait
  // TOUJOURS satisferait aussi « aucune-session-lancee » ci-dessus, pour la
  // mauvaise raison.
  const workspaceSain = tmp('a5-workspace-sain');
  const sessionRecordFileSain = path.join(tmp('a5-record-sain'), 'record.json');
  const envSain = buildEnv({
    BENCH_FAKE_CLAUDE_AUTH_METHOD: 'oauth_token',
    BENCH_FAKE_CLAUDE_RECORD_FILE: sessionRecordFileSain,
  });
  const resSain = await essayer(() => launch({ workspaceDir: workspaceSain, model: 'stub-model-a5-sain', env: envSain }));
  expect(
    resSain.ok ? 'appel-sain-execute' : `APPEL-SAIN-EN-ECHEC ${messageDe((resSain as { err: unknown }).err)}`,
  ).toBe('appel-sain-execute');
  const vSain = (resSain as { ok: true; value: Json }).value;
  expect(
    vSain.ok === true ? 'authentification-saine-accepte-la-session' : `AUTHENTIFICATION-SAINE-REFUSEE-A-TORT ${rendu(vSain)}`,
  ).toBe('authentification-saine-accepte-la-session'); // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L30-L32
  expect(
    fs.existsSync(sessionRecordFileSain)
      ? 'session-lancee-avec-authentification-saine'
      : 'SESSION-NON-LANCEE-MALGRE-AUTHENTIFICATION-SAINE',
  ).toBe('session-lancee-avec-authentification-saine');
}, CASE_TIMEOUT_MS);
