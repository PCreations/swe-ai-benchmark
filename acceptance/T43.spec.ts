/**
 * acceptance/T43.spec.ts — suite d'acceptation de la tache T43.
 *
 * Cas requis (verification/cases.lock.json, gele, cahier_line 535) :
 *   T43.A1 artifact — toutes les references documentaires pointent vers des
 *                     fichiers existants
 *   T43.A2 artifact — un utilisateur du depot peut identifier pour chaque
 *                     tache dependances, commande et preuve
 *   T43.A3 absence  — aucun marqueur de tache non resolu sur un chemin suivi
 *                     par git, ni test saute dans les suites d'acceptation
 *   T43.A4 artifact — resume final liste CORE_VERIFIED, PILOT_READY,
 *                     HANDOFF_COMPLETE et un statut live exact
 *   T43.A5 artifact — versions et commit de livraison correspondent aux
 *                     preuves
 *   T43.A6 absence  — refaire le recalcul numerique depuis le paquet ne
 *                     necessite ni cle API ni memoire de la conversation
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux sources que T43 produira sous
 * `docs/**`, `verification/**` et `fixtures/**` (verification/tasks.json#T43
 * declare `source_paths: ["docs","verification","fixtures","acceptance"]`) :
 * aucun de ces chemins n'a ete lu au-dela de ce que des taches DEJA PROUVEES
 * (T00, T38, T41, T42) y ont deja publie, et jamais par `git show` sur un
 * commit d'implementation. ADR-001 : aveuglement PROCEDURAL, discipline
 * auditable au diff, pas barriere technique. Le contrat ci-dessous est
 * derive de docs/specs/T43.md et du cahier :
 *
 *   L531-L537  titre, dependances (T42), livrables (« depot versionne, guide
 *              operatoire, manifeste des taches, fixtures, contrats,
 *              preuves, limitations et exemples de commandes ») et les six
 *              cas d'acceptation, mot pour mot.
 *   L8         « Il comporte 44 taches, T00 a T43 » — fonde le compte exact
 *              verifie par A2.
 *   L17-L24    §B : modes `recorded`/`live`, `execution_mode` /
 *              `cost_origin` / `corpus_provenance`.
 *   L26        « Etats a publier separement : CORE_VERIFIED apres T38 ;
 *              PILOT_READY apres T39 et T40 ; HANDOFF_COMPLETE apres T43.
 *              LIVE_VALIDATED est une attestation SUPPLEMENTAIRE, seulement
 *              si un smoke test reel a effectivement ete execute [...] » —
 *              fonde A4 au mot pres, et le schema `report build` deja FIXE
 *              par acceptance/T42.spec.ts (section II.4 de ce fichier),
 *              relu ici tel quel et jamais rededuit.
 *   L135       « Chaque tache possede acceptance/Txx.spec.ts ou
 *              analysis/tests/test_Txx.py [...] et ecrit
 *              verification/results/Txx.json » — fonde le « pointeur de
 *              preuve » qu'A2 verifie par tache.
 *   L137       « archiver les attestations avec subject_commit. Produire
 *              cette archive ne change donc pas le commit certifie » —
 *              fonde A5 : le commit de livraison est celui d'une preuve DEJA
 *              ENREGISTREE (le ledger), jamais HEAD lui-meme (circularite).
 *   L139       « une preuve comporte des sorties effectivement observees
 *              [...] un test avec zero assertion [...] ne satisfait pas le
 *              contrat » — fonde le refus de toute assertion vide ici, et
 *              le volet « test saute » d'A3.
 *   L561/L641  « T42 reexecute les gates complets sur le commit de
 *              qualification ; aucun ancien rapport ne prouve le commit
 *              final » — identifie LE commit de qualification auquel A5
 *              compare le manifeste de livraison : l'attestation de T42
 *              elle-meme, jamais une moyenne ou un consensus sur les 43
 *              autres (qui PEUVENT diverger en commit sans etre perimees :
 *              `bench resume` les garde PROVEN par empreinte, pas par
 *              identite de commit — observe directement sur ce depot,
 *              section 0).
 *   §C (L30-32) « T00 choisit et verrouille les versions exactes [...]
 *              elles ne sont pas remplacees par latest » — fonde la
 *              comparaison de versions d'A5 contre celles PUBLIEES par
 *              l'attestation (`report.versions.declared`), jamais contre
 *              une relecture independante de package.json : la preuve fait
 *              foi, pas une seconde lecture qui pourrait diverger sans
 *              qu'aucun cas ne le remarque.
 *
 * Contrats DEJA PUBLIES par des dependances directes, relus (jamais
 * l'implementation) et REUTILISES tels quels :
 *   - `verification/tasks.json` (REGISTRY, deja la seule autorite du depot
 *     pour les dependances/commande/cas requis — A2 l'inspecte, ne le
 *     reecrit pas).
 *   - Le schema d'attestation du ledger (`attestations/<Txx>/<sha>.json`,
 *     champs `commit`, `verdict`, `report.versions.declared`) — OBSERVE en
 *     lisant reellement le ledger de ce depot (`git show <ref>:<chemin>`),
 *     jamais en importanat `verification/runner/ledger.mjs` (zone HARNESS) :
 *     cette suite reste, comme ses soeurs T41/T42, decouplee des modules
 *     internes du verificateur et ne parle qu'a git et au CLI en sous-
 *     processus.
 *   - Le schema de sortie de `report build` (`{ schema, states: {
 *     CORE_VERIFIED, PILOT_READY, HANDOFF_COMPLETE, LIVE_VALIDATED } }`,
 *     chacun `{ published, reason, ... }`) — FIXE par acceptance/
 *     T42.spec.ts, relu ici VERBATIM (A4 l'exige d'un fichier STATIQUE du
 *     paquet, jamais d'une invocation : voir section III).
 *   - F-MONEY, F-FAILURE (acceptance/reference/**, gelees apres T01) —
 *     memes chemins que T42.spec.ts, pour deriver 16320 micro-USD plutot
 *     que le recopier a la main (« provenance des litteraux »).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE SUR LA FORME EXACTE DU PAQUET
 *
 * Le cahier nomme les livrables de T43 (« guide operatoire, manifeste des
 * taches, fixtures, contrats, preuves, limitations ») sans jamais leur
 * donner un chemin. Aucune implementation de T43 n'existe au moment ou
 * cette suite est ecrite (`verification/tasks.json#T43.status =
 * NOT_IMPLEMENTED`, observe dans ce meme fichier). Cette suite FIXE donc,
 * et le dit :
 *
 *   docs/HANDOFF.md                 guide operatoire (A1, A2)
 *   docs/HANDOFF_MANIFEST.json      manifeste de livraison (A5) :
 *                                   { commit, versions: { declared: {...} } }
 *   docs/HANDOFF_SUMMARY.json       resume final (A4), MEME FORME que la
 *                                   sortie deja fixee de `report build`
 *   docs/live-receipts.json         recus live presents dans le paquet
 *                                   (A4), MEME FORME que `--live-receipts`
 *                                   deja fixee par T42.spec.ts
 *   docs/LIMITATIONS.md             limitations (A1 : cible d'un lien
 *                                   obligatoire du guide)
 *   docs/HANDOFF_ANALYSIS_EXPORT.json  export d'analyse autonome (A6),
 *                                   MEME FORME que la sortie deja fixee de
 *                                   `analysis export`
 *
 * Ces six chemins et ces deux schemas (HANDOFF_MANIFEST, HANDOFF_SUMMARY)
 * sont des CHOIX de cette suite, pas des citations du cahier : aucun
 * commentaire `cahier:L<n>` ne leur est appose, par honnetete — exactement
 * la distinction qu'acceptance/T42.spec.ts fait pour ses cinq commandes
 * CLI inventees. Un futur arbitrage qui renommerait l'un de ces chemins
 * n'affaiblirait aucun cas : il deplacerait une constante FIXE, jamais une
 * valeur du cahier.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LE REFUS N'EST PAS UNE COMPETENCE — DANGERS PROPRES A CHAQUE CAS
 *
 * (A1) cases.lock.json : « faire pointer une reference d'un document livre
 *      vers un chemin inexistant [...] exiger le ROUGE ». Un stub qui
 *      leverait ne mord sur rien ici : AUCUN export metier n'est appele.
 *      Cette suite n'invente donc pas sa propre liste de references : elle
 *      PARSE les liens Markdown reellement ecrits dans docs/HANDOFF.md et
 *      resout chacun contre le disque, en nommant celui qui manque — jamais
 *      un simple `toBe(true)` global qui masquerait lequel.
 * (A2) « muter le manifeste des taches [...] retirer [...] sa commande de
 *      verification (ou ses dependances, ou son pointeur de preuve) ».
 *      Cette suite boucle donc sur les 44 identifiants REELS de
 *      verification/tasks.json (jamais une liste recopiee a la main), et
 *      nomme la tache et le champ fautifs dans le message d'echec.
 * (A3) « rendre la chose PRESENTE [...] exiger le ROUGE ». Un cas
 *      d'absence passe trivialement si on ne regarde nulle part : cette
 *      suite parcourt donc `git ls-files` (le depot VERSIONNE, pas un
 *      sous-ensemble choisi a la main) pour les marqueurs de tache non
 *      resolus, et les suites d'acceptation reelles pour les tests sautes.
 * (A4) « en retirer l'une des trois mentions [...] ou y inscrire
 *      LIVE_VALIDATED alors qu'aucun recu live ne figure dans le paquet ».
 *      Danger symetrique : exiger PUBLISHED=false partout satisferait un
 *      refus universel. Cette suite exige donc explicitement
 *      HANDOFF_COMPLETE.published === true (ce paquet EST la livraison) et
 *      verifie LIVE_VALIDATED par CROISEMENT avec docs/live-receipts.json
 *      (jamais la seule valeur du champ, qu'une implementation pourrait
 *      inscrire sans corroboration).
 * (A5) « incrementer la version declaree [...] ou y inscrire un autre sha
 *      de commit, SANS TOUCHER AUX PREUVES ENREGISTREES ». Le danger
 *      propre ici est la circularite (cahier:L137) : cette suite ne compare
 *      donc JAMAIS le manifeste a HEAD ou a package.json relus par elle-
 *      meme (ce qui romprait a chaque commit ulterieur sans rapport), mais
 *      a une attestation REELLEMENT ENREGISTREE sur le ledger pour T42,
 *      verdict PASS — une valeur fabriquee ne correspond a AUCUNE
 *      attestation reelle et tombe necessairement.
 * (A6) « faire lire [...] une cle API [...] ou declencher un appel reseau
 *      [...] pour que la reprise du calcul en salle blanche [...] echoue ».
 *      Cette suite n'exécute donc PAS la commande dans l'environnement
 *      herite (qui porte les vraies variables de l'agent) : elle construit
 *      un environnement MINIMAL et HOSTILE (aucune variable ressemblant a
 *      une cle/jeton/secret, proxy HTTP pointant un port ferme, HOME neuf
 *      et vide) et exige que le recalcul produise malgre tout les valeurs
 *      EXACTES de la fixture golden-six deja gelee par T38.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reprouve pas la fidelite table-§J <-> verification/tasks.json
 *    (deja PROUVEE par T00.A4/T00.M11) ni la coherence PROVEN/STALE de
 *    `bench resume` (deja PROUVEE par T00/T01) : A2 et A5 lisent le
 *    registre et le ledger reels, mais ne re-derivent rien que ces taches
 *    etablissent deja.
 *  • Elle n'exerce aucun fournisseur reel : A6 tourne `--mode`-less sur un
 *    export deja materialise, jamais un appel modele ; les « recus live »
 *    d'A4 sont des donnees de test explicitement fictives.
 *  • Elle ne verifie pas l'exhaustivite de TOUT lien de TOUT fichier sous
 *    `docs/**` : A1 porte sur le guide operatoire, seul document que le
 *    cahier (L531) designe comme livrable de passation.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 900_000;
const PROC_TIMEOUT_MS = 300_000;
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

function existe(rel: string): boolean {
  return fs.existsSync(path.join(REPO, rel));
}
function lireTexte(rel: string): string {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}
function lireJson(rel: string): Json {
  return JSON.parse(lireTexte(rel)) as Json;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function gitOuNull(args: string[]): string | null {
  try {
    return git(args);
  } catch {
    return null;
  }
}

/* ═══════════════ racine gelee apres T01, jamais recopiee a la main ═════ */

const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');
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

/** 340 et 680 micro-USD, F-MONEY (cahier:L103) — memes chemins que T42.spec.ts. */
const COUT_UN_APPEL = Number(refValue(readReference('F-MONEY'), 'valeurs.appel_de_reference.cout_attendu.valeur'));
const COUT_DEUX_APPELS = Number(refValue(readReference('F-MONEY'), 'valeurs.deux_appels_identiques.cout_attendu.valeur'));
if (COUT_DEUX_APPELS !== COUT_UN_APPEL * 2) throw new Error('F-MONEY-INCOHERENTE deux_appels != 2x un_appel');

/* cahier:L493 (T38, deja PROUVE) : 6 trajectoires x 4 periodes x 2 appels. */
const EXPECTED_TRAJECTORIES = 6;
const EXPECTED_PERIODS_PAR_TRAJECTOIRE = 4;
const EXPECTED_COST_PAR_TRAJECTOIRE = EXPECTED_PERIODS_PAR_TRAJECTOIRE * COUT_DEUX_APPELS;
const EXPECTED_TOTAL_COST = EXPECTED_COST_PAR_TRAJECTOIRE * EXPECTED_TRAJECTORIES;
if (EXPECTED_TOTAL_COST !== 16320) throw new Error(`EXPECTED_TOTAL_COST inattendu : ${EXPECTED_TOTAL_COST}`);

/* ═══════════════ section 0 : le registre REEL, jamais une liste a la main ═ */

function lireTachesJson(): Json {
  return lireJson('verification/tasks.json');
}
const TACHES_DOC = lireTachesJson();
const TOUTES_TACHES = ((TACHES_DOC.tasks as Json[] | undefined) ?? []).slice();
// cahier:L8 — « Il comporte 44 taches, T00 a T43 ».
const NOMBRE_DE_TACHES_ATTENDU = 44;
if (TOUTES_TACHES.length !== NOMBRE_DE_TACHES_ATTENDU) {
  throw new Error(`REGISTRE-TAILLE-INATTENDUE (cahier:L8 « 44 taches ») : ${TOUTES_TACHES.length}`);
}
const T43_CARTE = TOUTES_TACHES.find((t) => t.id === 'T43');
if (!T43_CARTE) throw new Error('REGISTRE-T43-INTROUVABLE verification/tasks.json');

/** Mirroir MINIMAL, non importe, de verification/runner/chains.mjs#detectChain. */
function detecterChaine(entree: string): 'jest' | 'pytest' | null {
  if (/\.(mts|cts|tsx?|jsx?|mjs|cjs)$/.test(entree)) return 'jest';
  if (/\.py$/.test(entree)) return 'pytest';
  return null;
}

/* ═══════════════════ ledger — lu en sous-processus git, jamais importe ═══ */

/**
 * Nom de la ref de ledger pour la branche courante. Reproduit (sans
 * l'importer) la regle de verification/runner/git.mjs#branchName : HEAD
 * attachee d'abord, puis la branche de travail locale ou distante unique qui
 * pointe sur ce commit (jamais une ref `*-ledger`, orpheline par construction).
 */
function nomDeBranche(): string {
  const direct = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (direct !== 'HEAD') return direct;
  const sha = git(['rev-parse', 'HEAD']);
  const refs = (gitOuNull(['for-each-ref', '--points-at', sha, '--format=%(refname)']) ?? '').split('\n').filter(Boolean);
  const sansLedger = (prefixe: string): string[] =>
    refs.filter((r) => r.startsWith(prefixe) && !r.endsWith('-ledger')).map((r) => r.slice(prefixe.length));
  const locales = sansLedger('refs/heads/');
  if (locales.length === 1) return locales[0] as string;
  const distantes = sansLedger('refs/remotes/origin/').filter((r) => r !== 'HEAD');
  if (locales.length === 0 && distantes.length === 1) return distantes[0] as string;
  throw new Error(`HEAD-DETACHEE-SANS-BRANCHE-UNIVOQUE locales=${rendu(locales)} distantes=${rendu(distantes)}`);
}

/** La ref de ledger reellement lisible (locale, sinon distante), ou null. */
function resoudreLedger(): string | null {
  const nom = `${nomDeBranche()}-ledger`;
  if (gitOuNull(['rev-parse', '--verify', '--quiet', `refs/heads/${nom}`])) return nom;
  if (gitOuNull(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${nom}`])) return `origin/${nom}`;
  return null;
}

/** Toutes les attestations enregistrees pour une tache, telles que publiees sur le ledger. */
function attestationsPour(idTache: string): Json[] {
  const ref = resoudreLedger();
  if (!ref) return [];
  const fichiers = (gitOuNull(['ls-tree', '-r', '--name-only', ref, '--', `attestations/${idTache}`]) ?? '')
    .split('\n')
    .filter(Boolean);
  const docs: Json[] = [];
  for (const f of fichiers) {
    const brut = gitOuNull(['show', `${ref}:${f}`]);
    if (brut === null) continue;
    try {
      docs.push(JSON.parse(brut) as Json);
    } catch {
      /* fichier illisible : ignore, jamais adjuge a tort */
    }
  }
  return docs;
}

/* ══════════════════════════ CLI, en sous-processus, jamais importee ═════ */

/** Candidats d'entree pour apps/cli — meme decouverte que T41/T42. */
function entreesCli(): string[] {
  const out: string[] = [];
  const dir = path.join(REPO, 'apps', 'cli');
  const ajouter = (f: string): void => {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return;
    if (!out.includes(f)) out.push(f);
  };
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Json;
      const bin = j.bin;
      if (typeof bin === 'string') ajouter(path.resolve(dir, bin));
      else if (bin !== null && typeof bin === 'object') for (const v of Object.values(bin as Json)) if (typeof v === 'string') ajouter(path.resolve(dir, v));
      if (typeof j.main === 'string') ajouter(path.resolve(dir, j.main));
    } catch {
      /* manifeste illisible : on retombe sur les chemins usuels */
    }
  }
  for (const rel of ['dist/index.js', 'dist/cli.js', 'bin/bench.js', 'index.js']) ajouter(path.join(dir, rel));
  return out;
}

function executerBrut(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeout = PROC_TIMEOUT_MS): { exit: number | null; sortie: string } {
  try {
    const stdout = execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env });
    return { exit: 0, sortie: stdout };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    return { exit: err.status ?? null, sortie: `${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}` };
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
    execFileSync('pnpm', ['build'], { cwd: REPO, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    /* un echec de build se revele dans la seconde tentative d'invocation */
  }
}

type AppelCli = { resultat: Json | null; exit: number | null; tentatives: { argv: string[]; exit: number | null; sortie: string }[] };

function invoquer(sousArgv: string[], env: NodeJS.ProcessEnv): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const entree of entreesCli()) {
      const argv = [entree, ...sousArgv];
      const r = executerBrut('node', argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.sortie);
      tentatives.push({ argv, exit: r.exit, sortie: r.sortie.slice(0, 500) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, exit: dernierExit, tentatives };
  construireUneFois();
  const second = essayer();
  return { resultat: second, exit: dernierExit, tentatives };
}
function messageEchec(label: string, appel: AppelCli): string {
  const premiereLigneUtile = (s: string): string => (s.trim().split('\n').find((l) => l.trim().length > 0) ?? '').trim();
  return `${label} : ${appel.tentatives.map((t) => `[exit ${String(t.exit)}] ${premiereLigneUtile(t.sortie)}`).join(' | ') || 'aucune entree candidate dans apps/cli'}`;
}

const TMP_DIRS: string[] = [];
function nouveauRepertoire(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `${prefixe}-`));
  TMP_DIRS.push(d);
  return d;
}

afterAll(() => {
  for (const dir of TMP_DIRS) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* au mieux */
    }
  }
});

/* ══════════════════════════════════════════════════════════════════════ */

describe('T43 — produire le paquet de passation et l etat final exact', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */

  // FIXE par cette suite (section II) : le guide operatoire du paquet.
  const GUIDE = 'docs/HANDOFF.md';

  test('T43.A1 toutes les references documentaires du guide operatoire pointent vers des fichiers existants', () => {
    expect(existe(GUIDE) ? 'guide-present' : `GUIDE-ABSENT ${GUIDE} (livrable T43, cahier:L533)`).toBe('guide-present');
    const texte = lireTexte(GUIDE);

    // Liens Markdown [texte](cible) : on exclut les URLs absolues et les
    // ancres pures, qui ne sont pas des « references documentaires » vers un
    // fichier du paquet.
    const re = /\[[^\]]*\]\(([^)\s]+)\)/g;
    const cibles = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(texte)) !== null) {
      const brute = (m[1] as string).trim();
      if (/^[a-z]+:\/\//i.test(brute) || brute.startsWith('mailto:') || brute.startsWith('#')) continue;
      const sansAncre = brute.split('#')[0] as string;
      if (sansAncre.length === 0) continue;
      cibles.add(sansAncre.replace(/^\.\//, ''));
    }

    const MINIMUM_REFERENCES = 5;
    expect(cibles.size >= MINIMUM_REFERENCES ? 'references-suffisantes' : `GUIDE-TROP-PAUVRE ${cibles.size} reference(s) resolue(s), ${MINIMUM_REFERENCES} attendues au minimum : ${rendu([...cibles])}`).toBe(
      'references-suffisantes',
    );

    // cahier:L533 — « manifeste des taches » et « limitations » sont deux
    // livrables NOMMES de T43 : le guide doit au moins y renvoyer.
    for (const obligatoire of ['verification/tasks.json', 'docs/LIMITATIONS.md']) {
      expect(cibles.has(obligatoire) ? `guide-renvoie-vers-${obligatoire}` : `GUIDE-NE-RENVOIE-PAS-VERS ${obligatoire}`).toBe(`guide-renvoie-vers-${obligatoire}`);
    }

    const cassees = [...cibles].filter((c) => !existe(c));
    expect(cassees.length === 0 ? 'toutes-les-references-resolvent' : `REFERENCES-BRISEES ${rendu(cassees)}`).toBe('toutes-les-references-resolvent');
  });

  /* ─────────────────────────────────────────────────────────────── A2 */

  test('T43.A2 chaque tache du registre reel identifie ses dependances, sa commande et sa preuve', () => {
    const idsConnus = new Set(TOUTES_TACHES.map((t) => String(t.id)));
    expect(idsConnus.size === NOMBRE_DE_TACHES_ATTENDU ? 'identifiants-distincts' : `IDENTIFIANTS-EN-DOUBLE ${TOUTES_TACHES.length - idsConnus.size}`).toBe('identifiants-distincts');

    const defauts: string[] = [];
    for (const tache of TOUTES_TACHES) {
      const id = String(tache.id);

      const depends = tache.depends_on;
      if (!Array.isArray(depends)) {
        defauts.push(`${id}:depends_on-absent-ou-non-tableau`);
      } else if (depends.some((d) => typeof d !== 'string' || !idsConnus.has(d))) {
        defauts.push(`${id}:depends_on-reference-un-id-inconnu(${rendu(depends)})`);
      }

      // cahier:L614-L629 — forme VERBATIM de l'exemple de fiche (T17).
      const cmd = tache.verification_command;
      const cmdAttendue = ['pnpm', 'verify:task', id];
      if (!Array.isArray(cmd) || cmd.length !== cmdAttendue.length || cmd.some((v, i) => v !== cmdAttendue[i])) {
        defauts.push(`${id}:verification_command-absente-ou-non-conforme(${rendu(cmd)})`);
      }

      // cahier:L135 — « Chaque tache possede acceptance/Txx.spec.ts ou
      // analysis/tests/test_Txx.py [...] et ecrit verification/results/
      // Txx.json ». Le « pointeur de preuve » est la paire (acceptance_entry
      // existant sur disque, chemin de preuve qui s'en deduit par
      // convention) : aucun champ de registre dedie n'est requis au-dela.
      const entree = tache.acceptance_entry;
      if (typeof entree !== 'string' || entree.length === 0) {
        defauts.push(`${id}:acceptance_entry-absente`);
      } else if (detecterChaine(entree) === null) {
        defauts.push(`${id}:acceptance_entry-extension-non-reconnue(${entree})`);
      } else if (!existe(entree)) {
        defauts.push(`${id}:acceptance_entry-POINTE-VERS-UN-FICHIER-ABSENT(${entree})`);
      }
      const cheminDePreuve = `verification/results/${id}.json`;
      if (!/^verification\/results\/T\d{2}\.json$/.test(cheminDePreuve)) defauts.push(`${id}:pointeur-de-preuve-mal-forme`);
    }

    expect(defauts.length === 0 ? 'toutes-les-44-taches-identifiables' : `TACHES-NON-IDENTIFIABLES (${defauts.length}) : ${defauts.join(', ')}`).toBe('toutes-les-44-taches-identifiables');
  });

  /* ─────────────────────────────────────────────────────────────── A3 */

  test('T43.A3 aucun marqueur de tache non resolu sur un chemin suivi, ni test saute dans les suites d acceptation', () => {
    const suivis = git(['ls-files']).split('\n').filter(Boolean);
    expect(suivis.length > 0 ? 'depot-non-vide' : 'DEPOT-VIDE').toBe('depot-non-vide');

    // Marqueur de tache en commentaire : l'ouvreur de commentaire doit etre
    // en tete de ligne (hors indentation), jamais une occurrence DANS une
    // chaine ou une phrase en prose (docs/cahier.md et les cartes de
    // specification CITENT ce mot sans jamais l'ecrire en commentaire).
    const marqueurDeTache = /^\s*(\/\/|#(?!!)|\/\*{1,2}|\*(?!\/)|<!--)\s*TODO\b/i;
    const binaireOuVerrou = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|pdf|lock)$/i;

    const marqueursTrouves: string[] = [];
    for (const rel of suivis) {
      if (binaireOuVerrou.test(rel)) continue;
      let contenu: string;
      try {
        contenu = lireTexte(rel);
      } catch {
        continue;
      }
      if (contenu.includes('\u0000')) continue; // garde binaire
      const lignes = contenu.split('\n');
      for (let i = 0; i < lignes.length; i += 1) {
        if (marqueurDeTache.test(lignes[i] as string)) marqueursTrouves.push(`${rel}:${i + 1}`);
      }
    }
    expect(marqueursTrouves.length === 0 ? 'aucun-marqueur-de-tache' : `MARQUEURS-DE-TACHE-NON-RESOLUS ${rendu(marqueursTrouves)}`).toBe('aucun-marqueur-de-tache');

    // Tests sautes, strictement dans les suites d'acceptation.
    const suitesJest = suivis.filter((f) => /^acceptance\/.*\.spec\.ts$/.test(f));
    const suitesPytest = suivis.filter((f) => /^analysis\/tests\/test_.*\.py$/.test(f));
    expect(suitesJest.length > 0 ? 'suites-jest-presentes' : 'AUCUNE-SUITE-JEST-TROUVEE').toBe('suites-jest-presentes');
    expect(suitesPytest.length > 0 ? 'suites-pytest-presentes' : 'AUCUNE-SUITE-PYTEST-TROUVEE').toBe('suites-pytest-presentes');

    const sauteJest = /\b(?:describe|it|test|xit|xdescribe)\s*\.\s*(?:skip|todo)\s*\(|\.\s*skip\s*\(\s*\)/;
    const sautePytest = /@\s*pytest\s*\.\s*mark\s*\.\s*skip\b|@\s*unittest\s*\.\s*skip\b|(?<![.\w])pytest\s*\.\s*skip\s*\(/;

    const sautesTrouves: string[] = [];
    for (const rel of suitesJest) {
      const contenu = lireTexte(rel);
      if (sauteJest.test(contenu)) sautesTrouves.push(rel);
    }
    for (const rel of suitesPytest) {
      const contenu = lireTexte(rel);
      if (sautePytest.test(contenu)) sautesTrouves.push(rel);
    }
    // cahier:L139 — « Le verificateur refuse les tests sautes ».
    expect(sautesTrouves.length === 0 ? 'aucune-suite-d-acceptation-sautee' : `SUITES-AVEC-TEST-SAUTE ${rendu(sautesTrouves)}`).toBe('aucune-suite-d-acceptation-sautee');
  }, CASE_TIMEOUT_MS);

  /* ─────────────────────────────────────────────────────────────── A4 */

  // FIXE par cette suite (section II), MEME FORME que `report build` deja
  // fixee par acceptance/T42.spec.ts.
  const RESUME = 'docs/HANDOFF_SUMMARY.json';
  const RECUS = 'docs/live-receipts.json';
  const NOMS_ETAT = ['CORE_VERIFIED', 'PILOT_READY', 'HANDOFF_COMPLETE', 'LIVE_VALIDATED']; // cahier:L26, verbatim

  test('T43.A4 le resume final liste les trois etats et un statut live exact, croise avec les recus du paquet', () => {
    expect(existe(RESUME) ? 'resume-present' : `RESUME-ABSENT ${RESUME} (livrable T43, cahier:L26/L533)`).toBe('resume-present');
    const doc = lireJson(RESUME);
    const etats = (doc.states ?? {}) as Json;

    for (const nom of NOMS_ETAT) {
      expect(etats[nom] !== undefined && typeof (etats[nom] as Json).published === 'boolean' ? `${nom}-present` : `ETAT-ABSENT-OU-MAL-FORME(${nom}) ${rendu(etats[nom])}`).toBe(`${nom}-present`);
    }

    // cahier:L26 — « HANDOFF_COMPLETE apres T43 » : ce paquet EST la
    // livraison, donc cet etat ne peut pas etre publie a faux ici.
    const handoff = etats.HANDOFF_COMPLETE as Json;
    expect(handoff.published === true ? 'handoff-complete-publie' : `HANDOFF_COMPLETE-NON-PUBLIE ${rendu(handoff)}`).toBe('handoff-complete-publie');

    const core = etats.CORE_VERIFIED as Json;
    const pilot = etats.PILOT_READY as Json;
    expect(typeof core.published === 'boolean' && typeof pilot.published === 'boolean' ? 'core-pilot-booleens' : 'CORE-OU-PILOT-NON-BOOLEEN').toBe('core-pilot-booleens');

    // Croisement avec les recus REELLEMENT presents dans le paquet —
    // jamais la seule valeur du champ, cases.lock.json l'exige explicitement.
    const live = etats.LIVE_VALIDATED as Json;
    expect(typeof live.published === 'boolean' ? 'live-validated-booleen' : 'LIVE_VALIDATED-NON-BOOLEEN').toBe('live-validated-booleen');

    let recus: unknown[] = [];
    if (existe(RECUS)) {
      const brut = JSON.parse(lireTexte(RECUS)) as unknown;
      recus = Array.isArray(brut) ? brut : [];
    }
    const CHAMPS_RECU = ['model', 'date', 'budget_micro_usd', 'invoice_id']; // cahier:L26, verbatim
    const recusComplets = recus.filter(
      (r) => r !== null && typeof r === 'object' && CHAMPS_RECU.every((c) => typeof (r as Json)[c] === 'string' && ((r as Json)[c] as string).length > 0),
    );

    if (live.published === true) {
      expect(recusComplets.length > 0 ? 'live-validated-corrobore-par-un-recu-complet' : `LIVE_VALIDATED-PUBLIE-SANS-RECU-COMPLET-DANS-LE-PAQUET recus=${rendu(recus)}`).toBe(
        'live-validated-corrobore-par-un-recu-complet',
      );
      if (typeof live.receipts_count === 'number') {
        expect(live.receipts_count === recusComplets.length ? 'receipts_count-coherent' : `RECEIPTS_COUNT-INCOHERENT declare=${rendu(live.receipts_count)} reels=${recusComplets.length}`).toBe(
          'receipts_count-coherent',
        );
      }
    } else {
      expect(typeof live.reason === 'string' && live.reason.length > 0 ? 'live-validated-motive' : 'LIVE_VALIDATED-SANS-MOTIF').toBe('live-validated-motive');
    }

    console.log(`[T43.A4] HANDOFF_COMPLETE=${rendu(handoff.published)} LIVE_VALIDATED=${rendu(live.published)} recus_complets=${recusComplets.length}`);
  });

  /* ─────────────────────────────────────────────────────────────── A5 */

  // FIXE par cette suite (section II).
  const MANIFESTE = 'docs/HANDOFF_MANIFEST.json';
  const CHAMPS_VERSION = ['node', 'pnpm', 'typescript', 'jest', 'ts-jest', 'python', 'pytest'];

  test('T43.A5 les versions et le commit de livraison du manifeste correspondent a une preuve reellement enregistree', () => {
    expect(existe(MANIFESTE) ? 'manifeste-present' : `MANIFESTE-ABSENT ${MANIFESTE} (livrable T43, cahier:L533)`).toBe('manifeste-present');
    const manifeste = lireJson(MANIFESTE);

    expect(typeof manifeste.commit === 'string' && /^[0-9a-f]{40}$/.test(manifeste.commit) ? 'commit-forme-attendue' : `COMMIT-MAL-FORME ${rendu(manifeste.commit)}`).toBe('commit-forme-attendue');
    const versionsDeclarees = ((manifeste.versions ?? {}) as Json).declared as Json | undefined;
    expect(versionsDeclarees !== undefined ? 'versions-declarees-presentes' : 'VERSIONS-DECLAREES-ABSENTES').toBe('versions-declarees-presentes');

    // cahier:L561/L641 — le commit de qualification est celui ou T42 a
    // REEXECUTE les gates complets : son attestation (verdict PASS) sur le
    // ledger est LA preuve enregistree a laquelle le manifeste correspond.
    const attestationsT42 = attestationsPour('T42').filter((a) => a.verdict === 'PASS');
    expect(attestationsT42.length > 0 ? 'au-moins-une-attestation-t42-reussie' : 'AUCUNE-ATTESTATION-T42-PASS-SUR-LE-LEDGER (T43 depend de T42)').toBe(
      'au-moins-une-attestation-t42-reussie',
    );

    const correspondante = attestationsT42.find((a) => a.commit === manifeste.commit);
    expect(
      correspondante !== undefined
        ? 'commit-correspond-a-une-preuve-enregistree'
        : `COMMIT-NE-CORRESPOND-A-AUCUNE-ATTESTATION-T42 declare=${rendu(manifeste.commit)} enregistres=${rendu(attestationsT42.map((a) => a.commit))}`,
    ).toBe('commit-correspond-a-une-preuve-enregistree');

    const declareesLaPreuve = (((correspondante as Json).report as Json | undefined)?.versions as Json | undefined)?.declared as Json | undefined;
    expect(declareesLaPreuve !== undefined ? 'preuve-porte-des-versions-declarees' : 'PREUVE-SANS-VERSIONS-DECLAREES').toBe('preuve-porte-des-versions-declarees');

    const divergences = CHAMPS_VERSION.filter((c) => (versionsDeclarees as Json)[c] !== (declareesLaPreuve as Json)[c]);
    expect(
      divergences.length === 0
        ? 'versions-conformes-a-la-preuve'
        : `VERSIONS-DIVERGENTES-DE-LA-PREUVE ${divergences.map((c) => `${c}:manifeste=${rendu((versionsDeclarees as Json)[c])},preuve=${rendu((declareesLaPreuve as Json)[c])}`).join(' ')}`,
    ).toBe('versions-conformes-a-la-preuve');

    console.log(`[T43.A5] commit=${String(manifeste.commit).slice(0, 12)} attestations_t42_pass=${attestationsT42.length}`);
  });

  /* ─────────────────────────────────────────────────────────────── A6 */

  // FIXE par cette suite (section II), MEME FORME que `analysis export` /
  // `analysis run` deja fixees par acceptance/T42.spec.ts.
  const EXPORT_ANALYSE = 'docs/HANDOFF_ANALYSIS_EXPORT.json';

  test('T43.A6 refaire le recalcul numerique depuis le paquet ne necessite ni cle API ni memoire de la conversation', () => {
    expect(existe(EXPORT_ANALYSE) ? 'export-present' : `EXPORT-ABSENT ${EXPORT_ANALYSE} (livrable T43 : fixtures/preuves autonomes, cahier:L533)`).toBe('export-present');
    const exportJson = lireJson(EXPORT_ANALYSE);

    // Coherence interne du FICHIER avant tout recalcul — un export vide ou
    // degenere ne doit pas pouvoir verdir ce cas par construction.
    const campagnes = (exportJson.campaigns as Json[] | undefined) ?? [];
    expect(campagnes.length > 0 ? 'export-non-vide' : 'EXPORT-SANS-CAMPAGNE').toBe('export-non-vide');
    let coutTotalDeclare = 0;
    let nbTrajectoires = 0;
    for (const c of campagnes) {
      for (const t of (c.trajectories as Json[] | undefined) ?? []) {
        nbTrajectoires += 1;
        coutTotalDeclare += Number(t.cost_micro_usd ?? 0);
      }
    }
    expect(nbTrajectoires === EXPECTED_TRAJECTORIES ? 'export-six-trajectoires' : `EXPORT-NOMBRE-DE-TRAJECTOIRES-INATTENDU ${nbTrajectoires}`).toBe('export-six-trajectoires');
    expect(coutTotalDeclare === EXPECTED_TOTAL_COST ? 'export-cout-total-conforme-golden-six' : `EXPORT-COUT-TOTAL-INATTENDU ${coutTotalDeclare} (attendu ${EXPECTED_TOTAL_COST}, cahier:L493)`).toBe(
      'export-cout-total-conforme-golden-six',
    );

    // Environnement MINIMAL et HOSTILE : aucune variable ressemblant a une
    // cle/jeton/secret n'est heritee, un proxy HTTP pointe un port ferme (le
    // moindre appel sortant echoue immediatement), et HOME est un
    // repertoire NEUF, vide — aucune « memoire de la conversation ».
    const nomSuspect = /KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|_PAT\b/i;
    const envHostile: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined) continue;
      if (nomSuspect.test(k)) continue;
      if (/^(ANTHROPIC|OPENAI|AWS|PG)_/i.test(k)) continue;
      envHostile[k] = v;
    }
    const homeNeuf = nouveauRepertoire('t43-a6-home');
    envHostile.HOME = homeNeuf;
    envHostile.XDG_CACHE_HOME = path.join(homeNeuf, '.cache');
    envHostile.ANTHROPIC_API_KEY = 'poison-ne-doit-jamais-etre-lue';
    envHostile.OPENAI_API_KEY = 'poison-ne-doit-jamais-etre-lue';
    const proxyFerme = 'http://127.0.0.1:1';
    envHostile.HTTP_PROXY = proxyFerme;
    envHostile.HTTPS_PROXY = proxyFerme;
    envHostile.http_proxy = proxyFerme;
    envHostile.https_proxy = proxyFerme;
    envHostile.ANTHROPIC_BASE_URL = 'http://127.0.0.1:1/injoignable';
    delete envHostile.NO_PROXY;
    delete envHostile.no_proxy;

    const appel = invoquer(['analysis', 'run', path.join(REPO, EXPORT_ANALYSE)], envHostile);
    expect(appel.resultat !== null ? 'recalcul-execute-en-salle-blanche' : `RECALCUL-EN-ECHEC-EN-SALLE-BLANCHE ${messageEchec('T43.A6', appel)}`).toBe('recalcul-execute-en-salle-blanche');
    const r = appel.resultat as Json;

    expect(r.total_cost_micro_usd === String(EXPECTED_TOTAL_COST) ? 'recalcul-cout-conforme' : `RECALCUL-COUT-NON-CONFORME ${rendu(r.total_cost_micro_usd)} (attendu ${EXPECTED_TOTAL_COST})`).toBe(
      'recalcul-cout-conforme',
    );
    for (const champ of ['Q', 'R', 'V', 'U'] as const) {
      // cahier:L491-L496 (T38, deja PROUVE) : golden-six donne Q=R=V=U=1.
      expect(r[champ] === 1 ? `${champ}-conforme` : `${champ}-INATTENDU ${rendu(r[champ])}`).toBe(`${champ}-conforme`);
    }

    console.log(`[T43.A6] exit=${rendu(appel.exit)} total_cost=${rendu(r.total_cost_micro_usd)} home=${homeNeuf}`);
  }, CASE_TIMEOUT_MS);
});
