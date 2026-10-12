/**
 * acceptance/T50.spec.ts — suite d'acceptation de la tache T50.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T50.A1 behaviour — chaque session est lancee avec un mode de permission
 *                      non interactif et une liste explicite d'outils
 *                      autorises couvrant la lecture, la recherche,
 *                      l'edition et la creation de fichiers et l'execution
 *                      de commandes
 *   T50.A2 absence   — aucune session n'est lancee avec un repertoire
 *                      supplementaire, avec un mode qui contourne les
 *                      permissions ni avec une option qui les desactive
 *   T50.A3 behaviour — le prompt d'une periode contient le nom de chaque
 *                      operation du contrat `bench.candidate/2` et la forme
 *                      de ses arguments et de sa reponse
 *   T50.A4 behaviour — un fichier ecrit dans l'espace de travail pendant la
 *                      session figure dans le commit de fin de la periode
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T50 EST UNE TACHE D'EXTENSION (ADR-009) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T50 — `packages/agents`,
 * `packages/activities` et `packages/scenario` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL,
 * discipline auditable au diff, pas une barriere technique). Le contrat
 * teste ci-dessous est derive de docs/specs/T50.md et de sa source,
 * docs/adr/ADR-009-candidat-qui-developpe-et-qu-on-controle.md, lignes 84 a
 * 90 (la plage que la carte de T50 epingle dans
 * verification/tasks.extensions.json#spec_source) :
 *
 *   L84  titre : « Permettre au candidat de developper »
 *   L86  dependances T47 et T49 ; livrables, mot pour mot : « la session
 *        `claude -p` d'une periode recoit un mode de permission non
 *        interactif et une liste explicite d'outils de lecture, d'edition
 *        et de commande, limitee a l'espace de travail ; le prompt contient
 *        la description complete du contrat `bench.candidate/2` »
 *   L88  les quatre cas d'acceptation, mot pour mot
 *   L90  commande : `pnpm verify:task T50`. « Un faux executable `claude`
 *        place en tete du `PATH` remplace la CLI ; aucun appel reel » —
 *        fonde le reemploi integral du fixture
 *        acceptance/fixtures/claude-cli/bin/claude (zone ACCEPTANCE, DEJA
 *        publie par T47 et etendu par T49) que cette suite place en tete de
 *        PATH, et JAMAIS la vraie CLI.
 *
 * Cette suite lit en outre, dans le corps narratif du MEME document ACCEPTE
 * (hors de la plage L84-90 epinglee par la carte, exactement la liberte que
 * prend deja acceptance/T48.spec.ts face a L86-94 de ADR-008, et
 * acceptance/T49.spec.ts face a L96-101 du meme ADR-008) :
 *
 *   L22-25 « Le candidat ne peut rien ecrire. La session est lancee avec
 *          `-p --output-format json --no-session-persistence --model <m>`
 *          seulement [...] Sans mode de permission ni liste d'outils
 *          autorises, un `claude -p` refuse les outils qui demandent une
 *          permission, dont l'edition de fichiers. ADR-008 prevoyait ces
 *          options dans sa decision ; aucun cas ne les exigeait. » — ADR-008
 *          est le document que cette phrase designe comme ayant DEJA prevu
 *          les options manquantes ; sa section « Limites assumees »
 *          (L105-109, deja citee et REPRISE A L'IDENTIQUE par
 *          acceptance/T47.spec.ts pour le MEME ADR) nomme litteralement :
 *          « Les outils autorises sont restreints par `--allowedTools` et
 *          `--permission-mode dontAsk` ». Ces deux litteraux fondent A1/A2
 *          ci-dessous — ils ne sont PAS invente par cette suite, ils sont
 *          REPRIS d'un ADR ACCEPTE que ADR-009 cite nommement comme sa
 *          propre source (L24 : « ADR-008 prevoyait ces options »).
 *   L44-48 « Un contrat aligne sur l'application controlee :
 *          `bench.candidate/2`. Le processus du candidat expose [...]
 *          exactement les operations de `ScriptedApplication` : creer un
 *          locataire, avancer l'horloge metier, soumettre une ecriture
 *          (`reserve` ou `cancel`, avec acteur, locataire, sequence
 *          d'admission et cle d'operation), lire une vue, sonder une
 *          annulation sans effet, rendre une empreinte de l'etat. » — fonde
 *          la LISTE des six operations que A3 exige, et les DEUX litteraux
 *          `reserve`/`cancel` (seuls noms d'operation que l'ADR cite entre
 *          BACKTICKS, donc litteralement, L46).
 *   L49-51 « Une seule description du contrat. Le prompt du candidat et
 *          l'adaptateur lisent la meme description » — motive POURQUOI A3
 *          exige que le prompt porte la description COMPLETE (nom + forme
 *          des arguments + forme de la reponse) de CHAQUE operation, pas
 *          seulement son nom : une description partielle ne pourrait pas
 *          etre « la meme » que celle qu'un futur adaptateur devra lire.
 *   L58-61 « Le candidat peut developper, dans son espace de travail
 *          seulement. La session recoit un mode de permission non
 *          interactif et une liste explicite d'outils : lire, chercher,
 *          editer et creer des fichiers, lancer des commandes. Aucun
 *          repertoire supplementaire, aucun contournement des
 *          permissions. » — « chercher » et « creer des fichiers » ajoutent
 *          deux categories a la liste d'outils, au-dela de L86 (lecture,
 *          edition, commande) ; A1 exige donc CINQ categories couvertes
 *          (lire/chercher/editer/creer/commander), pas trois — c'est la
 *          formulation la PLUS STRICTE qui fait foi (L88/A1 reprend
 *          d'ailleurs explicitement « la recherche » et « la creation de
 *          fichiers »).
 *
 * Tache T47 (`depends_on` de T50) a DEJA fixe, sous acceptance/T47.spec.ts,
 * `-p`, `--output-format json`, `--no-session-persistence`, `--model`, et la
 * purge de `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` — cette suite ne les
 * re-exerce PAS, elle les tient pour ACQUIS (meme geste que
 * acceptance/T49.spec.ts face a T47). Tache T49 (autre `depends_on` de T50)
 * a DEJA fixe `--provider claude-cli`, `--live`, `--candidate-workspace-root`
 * et la convention « le prompt est l'argument d'argv qui suit `-p` » — cette
 * suite les REPREND A L'IDENTIQUE, sans les re-deriver.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX
 *
 * T50 n'a pas de ligne de cahier : sa source est l'ADR epingle par
 * verification/tasks.extensions.json#spec_source. Chaque litteral COMPARE
 * porte donc un commentaire `// source:docs/adr/ADR-0NN-...md:L<n>`
 * resolvable par `sed -n '<n>p'`, ou une reference explicite a une suite
 * d'acceptation DEJA PUBLIEE dont le vocabulaire est repris a l'identique :
 *
 *   `--allowedTools`, `--permission-mode`, `dontAsk`  — source:ADR-008:L108
 *                                                        (cite par ADR-009:L24)
 *   `reserve`, `cancel`                                — source:ADR-009:L46
 *   `claude-cli`, `--live`                              — acceptance/T49.spec.ts (III)
 *   `--candidate-workspace-root`                        — acceptance/T48.spec.ts (III.1)
 *   `--model`, `-p`                                     — acceptance/T47.spec.ts (III.1)
 *   `create_tenant`,`read`,`probe_cancel`,`fingerprint`,
 *   `tenant_id`,`key`,`value`,`decision`,`sha256`        — acceptance/T48.spec.ts (III.3,
 *                                                          contrat `bench.candidate/1`)
 *   `bench.candidate/2`                                  — FIXE ICI, par parallelisme
 *                                                          EXACT avec `bench.candidate/1`
 *                                                          (acceptance/T48.spec.ts, III.3)
 *
 * Les noms `--add-dir`, `--dangerously-skip-permissions`, `bypassPermissions`,
 * `advance_clock`, `to`, `actor`, `admission_seq`, `operation_key`, `op`
 * (discriminant reserve/cancel de l'operation `write` v2) : FIXES ICI (section
 * III), jamais obtenus en executant une implementation de T50 et en figeant
 * ce qu'on a vu passer — aucune implementation de T50 n'existe au moment ou
 * cette suite est ecrite (ADR-001). `--add-dir` et
 * `--dangerously-skip-permissions` sont les noms REELS, PUBLICS, du CLI
 * `claude` pour « repertoire supplementaire » et « option qui desactive les
 * permissions » (exactement ce que A2/L61 nomme en prose sans jamais les
 * epeler) ; `bypassPermissions` est la valeur REELLE, PUBLIQUE, de
 * `--permission-mode` pour « un mode qui contourne les permissions »
 * (L61) — AUCUN des trois n'est invente sans fondement, mais aucun des trois
 * n'est non plus cite LITTERALEMENT par ADR-008 ou ADR-009, d'ou leur
 * statut FIXE ICI plutot que `source:ADR`.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CE QUI EST FIXE PAR CETTE SUITE — LE CONTRAT `bench.candidate/2`
 *
 * ADR-009:L44-48 NOMME les six operations en PROSE FRANCAISE, sans jamais
 * leur donner d'identifiant de protocole (exactement la situation qu'a
 * affrontee acceptance/T48.spec.ts pour `bench.candidate/1`, dont le
 * paragraphe de decision — ADR-008:L86-94 — ne nomme pas non plus
 * `create_tenant`/`write`/`read`/`probe_cancel`/`fingerprint`
 * litteralement). Cette suite FIXE le contrat v2 par PARALLELISME avec v1,
 * SANS LE REMPLACER (ADR-009:L62-64 : « Le contrat v1 de T48 reste en place
 * pour ses propres cas ; v2 s'y ajoute, il ne le remplace pas ») :
 *
 *   OPERATION         ARGUMENTS                                    REPONSE
 *   `create_tenant`   {tenant_id}                                  {}
 *     — REPRIS A L'IDENTIQUE de `bench.candidate/1` (acceptance/T48.spec.ts,
 *       III.3) : « creer un locataire » est LA MEME operation metier dans
 *       les deux contrats.
 *   `advance_clock`   {to}                                         {}
 *     — NOUVEAU (ADR-009:L45 : « avancer l'horloge metier », ABSENT de
 *       `bench.candidate/1`). `to` FIXE ICI : la valeur cible de l'horloge
 *       metier (`PeriodState.horloge metier`, cahier:L87), par parallelisme
 *       avec la forme la plus simple possible d'une avance d'horloge.
 *   `write`           {op,actor,tenant_id,admission_seq,operation_key}  {decision}
 *     — FORME MODIFIEE pour v2 (ADR-009:L46-47 : « soumettre une ecriture
 *       (`reserve` ou `cancel`, avec acteur, locataire, sequence
 *       d'admission et cle d'operation) »). DISTINCT du `write`
 *       {tenant_id,key,value}->{} de v1 (T48) : v1 n'avait ni acteur ni
 *       sequence d'admission, v2 les EXIGE tous les deux, mot pour mot.
 *       `op` FIXE ICI comme discriminant entre `reserve` et `cancel` (les
 *       DEUX seuls litteraux d'operation que l'ADR cite entre backticks,
 *       L46) ; `actor` FIXE ICI par traduction directe de « acteur » ;
 *       `admission_seq` FIXE ICI pour « sequence d'admission » ;
 *       `operation_key` FIXE ICI pour « cle d'operation ». `decision` REPRIS
 *       de la reponse de `probe_cancel` v1 (`{decision:
 *       'cancelled'|'refused'}`, acceptance/T48.spec.ts III.3) : une
 *       ecriture `reserve`/`cancel` rend la MEME forme de decision qu'une
 *       sonde d'annulation.
 *   `read`            {tenant_id,key}                              {value}
 *     — REPRIS A L'IDENTIQUE de `bench.candidate/1` (« lire une vue »,
 *       ADR-009:L47, meme semantique que « lire », ADR-008:L90).
 *   `probe_cancel`    {tenant_id,key}                               {decision}
 *     — REPRIS A L'IDENTIQUE de `bench.candidate/1` (« sonder une
 *       annulation sans effet », ADR-009:L47-48, meme semantique EXACTE que
 *       `bench.candidate/1`, cahier:L123).
 *   `fingerprint`     {}                                            {sha256}
 *     — REPRIS A L'IDENTIQUE de `bench.candidate/1` (« rendre une empreinte
 *       de l'etat », ADR-009:L48).
 *
 * A3 n'exige PAS que le prompt serialise ce contrat sous une forme
 * syntaxique precise (JSON Schema, tableau, prose) : ADR-009:L49-51 n'impose
 * que « la meme description » entre le prompt et un futur adaptateur, jamais
 * un FORMAT. Elle exige, pour CHAQUE operation, la PRESENCE (sous-chaine,
 * apres normalisation des espaces et de la casse) de son nom ET de chacun
 * de ses noms de champ d'arguments ET de chacun de ses noms de champ de
 * reponse — ce qui suffit a distinguer une description COMPLETE d'une
 * description qui ne nommerait que l'operation sans sa forme (le danger
 * nomme par cases.extensions.lock.json#T50.A3 : « omettre une operation du
 * contrat bench.candidate/2 dans le prompt »).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T50, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER D'UNE PRESENCE BRUTE DE `--allowedTools`.
 *     cases.extensions.lock.json le nomme : « lancer la session sans
 *     --allowedTools ». Mais L58-61/L88 exigent une liste qui COUVRE cinq
 *     categories distinctes (lire/chercher/editer/creer/commander) ; une
 *     liste qui ne porterait, par exemple, qu'un seul outil de lecture
 *     satisferait une verification de PRESENCE sans rien prouver sur sa
 *     COUVERTURE. Cette suite exige donc, pour les CINQ categories, au
 *     moins un nom d'outil reconnu dans la valeur REELLEMENT transmise a
 *     l'executable (jamais une constante de ce test) — cf. V pour les noms
 *     d'outils reconnus et pourquoi ils ne sont pas eux-memes des litteraux
 *     a faire remonter (ils decrivent des OUTILS DU CLI `claude` lui-meme,
 *     hors de portee de packages/agents : le CLI reel documente ses propres
 *     noms d'outils, aucune implementation de T50 ne peut les renommer).
 * (2) A2 EST UN CAS `absence`, ET LE DANGER EST L'AJOUT, PAS L'OMISSION
 *     (meme avertissement que T47.M3, proof_kind `absence`) : un stub qui
 *     ferait lever le lancement de la session laisserait A2 vert SANS RIEN
 *     PROUVER (aucun `--add-dir` n'aurait ete ajoute, pour la mauvaise
 *     raison — la session n'aurait simplement jamais tourne). Cette suite
 *     exige donc un APPEL REELLEMENT ABOUTI (meme garde que A1 : la session
 *     doit avoir ete invoquee, `BENCH_FAKE_CLAUDE_RECORD_FILE` doit exister)
 *     AVANT de verifier l'absence de `--add-dir`, de
 *     `--dangerously-skip-permissions`, et de la valeur `bypassPermissions`
 *     pour `--permission-mode` — une acceptation qui refuserait TOUJOURS la
 *     periode ne produirait jamais cet enregistrement et serait rejetee par
 *     cette garde, jamais faussement validee.
 * (3) A3 EST UN CAS `behaviour` SUR UN CONTRAT QUI N'EXISTE PAS ENCORE
 *     AILLEURS DANS LE DEPOT (ADR-009:L49-51 : « une seule description »,
 *     mais `bench.candidate/2` n'a NUL AUTRE lieu de verite au moment ou
 *     cette suite est ecrite — T51, qui construira l'adaptateur, est HORS
 *     de ce lot). Cette suite ne peut donc PAS comparer le prompt a un
 *     export important depuis une dependance deja prouvee (a la difference
 *     de, par exemple, T49.A2 comparant au `requirements` deja publie par
 *     T23/T45) : elle FIXE elle-meme, section III, le contrat complet que
 *     l'implementation DOIT publier dans le prompt, par PARALLELISME
 *     EXPLICITE et JUSTIFIE avec `bench.candidate/1` (DEJA publie et prouve
 *     par T48) plutot que par invention libre. C'est la MEME discipline que
 *     acceptance/T48.spec.ts a appliquee pour fixer v1 face au MEME manque
 *     de litteraux dans ADR-008.
 * (4) A4 EST UN CAS `behaviour` DONT LE DANGER EST UN FAUX POSITIF PAR
 *     ORDONNANCEMENT (cases.extensions.lock.json : « commiter l'espace de
 *     travail avant la fin de la session »). Un moteur qui committerait le
 *     depot AVANT de lancer la session produirait un `commit_sha` present
 *     et NON VIDE — une verification qui se contenterait de l'existence du
 *     champ passerait a tort. Cette suite exige donc une lecture GIT
 *     DIRECTE, hors de tout CLI : `git -C <workspace_dir> show
 *     <commit_sha>:<chemin>` doit rendre EXACTEMENT le contenu que le
 *     fixture a ecrit PENDANT l'appel (`BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_*`,
 *     publie par T49, repris A L'IDENTIQUE ici) — un commit pris AVANT
 *     l'ecriture ne contient PAS ce chemin dans son arbre, et `git show`
 *     echoue au lieu de rendre le contenu attendu : l'egalite tombe.
 * (5) ISOLATION DES SERVICES REELS. Chaque cas cree sa PROPRE base
 *     PostgreSQL (`creerBase`), son propre nom de bucket S3 (cahier:L557) et
 *     son propre repertoire temporaire pour `--candidate-workspace-root`
 *     (`fs.mkdtempSync`) — aucun cas ne depend de l'ordre d'execution d'un
 *     autre.
 * (6) CHAQUE INVOCATION CLI EST UN PROCESSUS NEUF (`execFileSync`), jamais
 *     un rappel en memoire — meme discipline que T23/T39/T45/T46/T47/T48/T49.
 * (7) AUCUN APPEL REEL. `PATH` est TOUJOURS prefixe par le repertoire du
 *     fixture `acceptance/fixtures/claude-cli/bin/claude` avant toute
 *     invocation `--provider claude-cli` ; un garde explicite
 *     (`verifierFauxEnTetePath`, repris A L'IDENTIQUE de T47/T49) resout
 *     `claude` dans l'environnement CONSTRUIT par cette suite et exige
 *     qu'il pointe vers CE fixture, jamais vers `/opt/node22/bin/claude` ni
 *     un autre `claude` du systeme — AVANT tout appel qui pourrait invoquer
 *     `--provider claude-cli`.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * OUTILS RECONNUS PAR CETTE SUITE (A1), ET POURQUOI ILS NE SONT PAS DES
 * LITTERAUX A PROVENANCE
 *
 * Le CLI reel `claude` publie ses propres noms d'outils (Read, Grep, Glob,
 * Edit, Write, Bash, etc. — la MEME convention de nommage que les outils de
 * CET agent, visibles dans sa propre liste de capacites). Ces noms ne sont
 * ni une donnee du cahier, ni une donnee de l'ADR, ni une invention de ce
 * test : ils decrivent une API EXTERNE (le CLI `claude` lui-meme, hors de
 * packages/agents) que packages/agents ne peut qu'INVOQUER, jamais
 * RENOMMER. Cette suite reconnait, pour chaque categorie exigee par
 * ADR-009:L58-61/L88, PLUSIEURS graphies acceptables (jamais une seule
 * constante stricte) afin de ne pas figer un choix syntaxique
 * (`Read,Edit,Write,Bash` vs `Read Edit Write Bash` vs `["Read",...]`) que
 * ni l'ADR ni le cahier ne fixent :
 *   lecture    : /^read$/i
 *   recherche  : /^(grep|glob|search)$/i
 *   edition    : /^(edit|multiedit)$/i
 *   creation   : /^(write|create)$/i
 *   commande   : /^(bash|shell|exec)$/i
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 600_000;
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

/** Ce qui N'EST PAS un refus : un plantage (meme convention que T00/T17/T25/T37/T39/T45/T46/T47/T49). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* ─────────────────────────────── navigation JSON generique (reprise de T45/T46/T49) */

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

const champTexte = (r: unknown, alias: readonly string[]): string | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
};

const ALIAS_FAILURE_REASON = ['failure_reason', 'failurereason', 'reason', 'motif'];
const ALIAS_CANDIDATE = ['candidate', 'candidat'];
const ALIAS_COMMIT_SHA = ['commit_sha', 'commitsha'];
const ALIAS_WORKSPACE_DIR = ['workspace_dir', 'workspacedir'];

function candidateDe(r: unknown): { commitSha: string | null; workspaceDir: string | null } | null {
  const c = champProfond(r, ALIAS_CANDIDATE);
  if (c === null || c.valeur === null || typeof c.valeur !== 'object') return null;
  const v = c.valeur;
  return {
    commitSha: champTexte(v, ALIAS_COMMIT_SHA),
    workspaceDir: champTexte(v, ALIAS_WORKSPACE_DIR),
  };
}
const failureReasonDe = (r: unknown): string | null => champTexte(r, ALIAS_FAILURE_REASON);

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t50_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

function lancer(sousCommande: string, drapeaux: string[], envExtra: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER, ...envExtra };
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

/* ════════════════════════════ fixture claude-cli (reprise de T47/T49) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');

function verifierFauxEnTetePath(env: NodeJS.ProcessEnv): void {
  const pathVal = env.PATH ?? '';
  const dirs = pathVal.split(path.delimiter).filter((d) => d.length > 0);
  let trouve: string | null = null;
  for (const d of dirs) {
    const cand = path.join(d, 'claude');
    if (fs.existsSync(cand)) {
      trouve = cand;
      break;
    }
  }
  exige(
    trouve !== null && path.resolve(trouve) === path.resolve(CLAUDE_FIXTURE_BIN),
    'claude-resout-vers-le-faux-executable-de-cette-suite',
    `DANGER-APPEL-REEL-POSSIBLE : claude resout vers ${rendu(trouve)}, attendu ${rendu(CLAUDE_FIXTURE_BIN)}`,
  );
}

type SondeFixture = {
  recordFile: string;
  env: NodeJS.ProcessEnv;
};

function sondeClaudeCli(opts: {
  stdoutRaw?: string;
  exitCode?: number;
  workspaceWrite?: { relPath: string; content: string };
}): SondeFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't50-sonde-'));
  const recordFile = path.join(dir, 'record.json');
  const env: NodeJS.ProcessEnv = {
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_RECORD_FILE: recordFile,
  };
  if (opts.stdoutRaw !== undefined) env.BENCH_FAKE_CLAUDE_STDOUT_RAW = opts.stdoutRaw;
  if (opts.exitCode !== undefined) env.BENCH_FAKE_CLAUDE_EXIT_CODE = String(opts.exitCode);
  if (opts.workspaceWrite !== undefined) {
    env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH = opts.workspaceWrite.relPath;
    env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT = opts.workspaceWrite.content;
  }
  verifierFauxEnTetePath(env);
  return { recordFile, env };
}

function lireJsonSiPresent(p: string): Json | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Json;
  } catch {
    return null;
  }
}

/** Un succes `claude -p --output-format json` typique (forme fixee par T47.spec.ts III.1). */
function resultSucces(sessionId: string): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: { 'bench-fake-claude-cli-model-a': { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
  });
}

/* ═══════════════════ litteraux de cette suite, chacun avec sa provenance (II) */

const MODE = 'recorded'; // convention T23/T39/T45/T46/T49 (cahier:L21)
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L149, repris de acceptance/T49.spec.ts (III)

const SOUS_COMMANDE_RUN_PERIOD = 'run-period'; // cahier:L355, repris de T23/T45/T46/T49

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L98, repris de acceptance/T49.spec.ts (III)
const DRAPEAU_MODEL = '--model'; // repris de acceptance/T47.spec.ts (III.1) / T49.spec.ts (II.1)
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // repris de acceptance/T48.spec.ts (III.1)

/** ADR-008:L108 (« Les outils autorises sont restreints par `--allowedTools` et
 *  `--permission-mode dontAsk` »), explicitement cite par ADR-009:L24 comme la decision
 *  qui « prevoyait ces options ». */
const DRAPEAU_ALLOWED_TOOLS = '--allowedTools'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L108
const DRAPEAU_PERMISSION_MODE = '--permission-mode'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L108
const VALEUR_PERMISSION_MODE_ATTENDUE = 'dontAsk'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L108

/** FIXES ICI (section II) : noms REELS du CLI `claude` pour les deux dangers que A2/ADR-009:L58-61 nomme
 *  en prose sans les epeler. */
const DRAPEAU_ADD_DIR = '--add-dir';
const DRAPEAU_SKIP_PERMISSIONS = '--dangerously-skip-permissions';
const VALEUR_PERMISSION_MODE_BYPASS = 'bypassPermissions';

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };

function nouveauContexte(suffixe: string): Contexte {
  return {
    campaignId: `t50-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: fs.mkdtempSync(path.join(os.tmpdir(), `t50-ws-${suffixe}-`)),
  };
}

function runPeriodClaudeCli(ctx: Contexte, env: NodeJS.ProcessEnv): AppelCli {
  const drapeaux = [
    DRAPEAU_MODE,
    MODE,
    DRAPEAU_CAMPAGNE,
    ctx.campaignId,
    DRAPEAU_PG,
    ctx.db,
    DRAPEAU_S3,
    ctx.bucket,
    DRAPEAU_PROVIDER,
    PROVIDER_CLAUDE_CLI,
    DRAPEAU_WORKSPACE_ROOT,
    ctx.workspaceRoot,
    DRAPEAU_MODEL,
    'bench-fake-claude-cli-model-a',
    DRAPEAU_LIVE,
  ];
  return lancer(SOUS_COMMANDE_RUN_PERIOD, drapeaux, env);
}

/** Lit l'enregistrement de session (argv/cwd, publie par T47, REPRIS tel quel) et rend son
 *  tableau `argv`, ou une liste vide si l'enregistrement est absent/illisible. */
function argvEnregistre(recordFile: string): string[] {
  const enreg = lireJsonSiPresent(recordFile);
  return Array.isArray(enreg?.argv) ? (enreg!.argv as unknown[]).map(String) : [];
}

/** Toutes les valeurs qui suivent IMMEDIATEMENT une occurrence de `drapeau` dans argv —
 *  tolere les drapeaux repetes (convention de parseur d'arguments de type yargs/array). */
function valeursDuDrapeau(argv: string[], drapeau: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === drapeau && i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
      out.push(argv[i + 1]!);
    }
  }
  return out;
}

/** Decoupe la valeur de `--allowedTools` en noms d'outils individuels, que la forme soit un
 *  tableau JSON (`["Read","Edit"]`), une liste separee par des virgules, ou par des espaces —
 *  aucune de ces trois graphies n'est fixee par l'ADR ni par le cahier (section V). */
function parseListeOutils(valeurs: string[]): string[] {
  const out: string[] = [];
  for (const brut of valeurs) {
    const t = brut.trim();
    if (t.startsWith('[')) {
      try {
        const arr = JSON.parse(t) as unknown[];
        for (const x of arr) out.push(String(x));
        continue;
      } catch {
        /* pas du JSON : retombe sur le decoupage textuel ci-dessous */
      }
    }
    for (const morceau of t.split(/[,\s]+/)) {
      if (morceau.length > 0) out.push(morceau.replace(/^["'[]+|["'\]]+$/g, ''));
    }
  }
  return out;
}

const CATEGORIES_OUTILS: { nom: string; motif: RegExp }[] = [
  { nom: 'lecture', motif: /^read$/i },
  { nom: 'recherche', motif: /^(grep|glob|search)$/i },
  { nom: 'edition', motif: /^(edit|multiedit)$/i },
  { nom: 'creation', motif: /^(write|create)$/i },
  { nom: 'commande', motif: /^(bash|shell|exec)$/i },
];

const normaliserEspaces = (s: string): string => s.replace(/\s+/g, ' ').trim();

/* ═══════════════════ III — contrat bench.candidate/2, FIXE PAR CETTE SUITE ═══════════════════ */

type OperationV2 = { op: string; args: string[]; reponse: string[] };

const MARQUEUR_CONTRAT = 'bench.candidate/2'; // FIXE ICI, parallelisme avec "bench.candidate/1" (T48.spec.ts III.3)

const OPERATIONS_V2: OperationV2[] = [
  { op: 'create_tenant', args: ['tenant_id'], reponse: [] },
  { op: 'advance_clock', args: ['to'], reponse: [] },
  { op: 'write', args: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key'], reponse: ['decision'] },
  { op: 'read', args: ['tenant_id', 'key'], reponse: ['value'] },
  { op: 'probe_cancel', args: ['tenant_id', 'key'], reponse: ['decision'] },
  { op: 'fingerprint', args: [], reponse: ['sha256'] },
];

/** Les deux SEULS litteraux d'operation que ADR-009 cite entre backtiques (L46) : les deux
 *  formes de l'ecriture `write`. */
const FORMES_WRITE = ['reserve', 'cancel']; // source:docs/adr/ADR-009-candidat-qui-developpe-et-qu-on-controle.md:L46

/** Rend, pour CHAQUE operation du contrat v2, les jetons (nom + champs d'arguments + champs de
 *  reponse) qui doivent TOUS apparaitre (sous-chaine, apres normalisation) dans le prompt. */
function jetonsAttendus(): { operation: string; jetons: string[] }[] {
  const out = OPERATIONS_V2.map((o) => ({
    operation: o.op,
    jetons: [o.op, ...o.args, ...o.reponse],
  }));
  out.push({ operation: 'write (formes)', jetons: FORMES_WRITE });
  out.push({ operation: 'marqueur de contrat', jetons: [MARQUEUR_CONTRAT] });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T50 — permettre au candidat de developper', () => {
  test(
    'T50.A1 chaque session est lancee avec un mode de permission non interactif et une liste explicite d outils autorises couvrant la lecture, la recherche, l edition et la creation de fichiers et l execution de commandes',
    () => {
      const ctx = nouveauContexte('a1');
      const sonde = sondeClaudeCli({ stdoutRaw: resultSucces('sess-t50-a1') });

      const p1 = runPeriodClaudeCli(ctx, sonde.env);
      exige(p1.resultat !== null && p1.exit === 0, 'p1-claude-cli-executee', messageEchec('run-period(claude-cli)', p1));

      const argv = argvEnregistre(sonde.recordFile);
      exige(
        argv.length > 0,
        'enregistrement-de-session-present',
        `AUCUN enregistrement a ${sonde.recordFile} — la session n a jamais ete lancee, argv vu ${rendu(argv)}`,
      );

      const modes = valeursDuDrapeau(argv, DRAPEAU_PERMISSION_MODE);
      exige(
        modes.length > 0,
        'permission-mode-present',
        `AUCUN ${DRAPEAU_PERMISSION_MODE} trouve dans argv ${rendu(argv)}`,
      );
      exige(
        modes[0] === VALEUR_PERMISSION_MODE_ATTENDUE,
        `permission-mode-vaut-${VALEUR_PERMISSION_MODE_ATTENDUE}`,
        `vu ${DRAPEAU_PERMISSION_MODE} ${rendu(modes[0])} dans argv ${rendu(argv)} (source:ADR-008:L108)`,
      );

      const valeursOutils = valeursDuDrapeau(argv, DRAPEAU_ALLOWED_TOOLS);
      exige(
        valeursOutils.length > 0,
        'allowedTools-present',
        `AUCUN ${DRAPEAU_ALLOWED_TOOLS} trouve dans argv ${rendu(argv)}`,
      );
      const outils = parseListeOutils(valeursOutils);
      const manquantes = CATEGORIES_OUTILS.filter((c) => !outils.some((o) => c.motif.test(o)));
      exige(
        manquantes.length === 0,
        'allowedTools-couvre-les-cinq-categories',
        `categorie(s) MANQUANTE(S) : ${manquantes.map((m) => m.nom).join(', ')} — outils vus ${rendu(outils)} (argv ${rendu(argv)})`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T50.A2 aucune session n est lancee avec un repertoire supplementaire, avec un mode qui contourne les permissions ni avec une option qui les desactive',
    () => {
      const ctx = nouveauContexte('a2');
      const sonde = sondeClaudeCli({ stdoutRaw: resultSucces('sess-t50-a2') });

      const p1 = runPeriodClaudeCli(ctx, sonde.env);
      exige(p1.resultat !== null && p1.exit === 0, 'p1-claude-cli-executee', messageEchec('run-period(claude-cli)', p1));

      const argv = argvEnregistre(sonde.recordFile);
      exige(
        argv.length > 0,
        'enregistrement-de-session-present',
        `AUCUN enregistrement a ${sonde.recordFile} — la session n a jamais ete lancee : une acceptation qui refuserait TOUJOURS ne prouverait rien, argv vu ${rendu(argv)}`,
      );

      exige(
        !argv.includes(DRAPEAU_ADD_DIR),
        'aucun-repertoire-supplementaire',
        `${DRAPEAU_ADD_DIR} TROUVE dans argv ${rendu(argv)}`,
      );
      exige(
        !argv.includes(DRAPEAU_SKIP_PERMISSIONS),
        'aucune-option-qui-desactive-les-permissions',
        `${DRAPEAU_SKIP_PERMISSIONS} TROUVE dans argv ${rendu(argv)}`,
      );

      const modes = valeursDuDrapeau(argv, DRAPEAU_PERMISSION_MODE);
      exige(
        !modes.includes(VALEUR_PERMISSION_MODE_BYPASS),
        'aucun-mode-qui-contourne-les-permissions',
        `${DRAPEAU_PERMISSION_MODE} ${VALEUR_PERMISSION_MODE_BYPASS} TROUVE dans argv ${rendu(argv)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T50.A3 le prompt d une periode contient le nom de chaque operation du contrat bench.candidate/2 et la forme de ses arguments et de sa reponse',
    () => {
      const ctx = nouveauContexte('a3');
      const sonde = sondeClaudeCli({ stdoutRaw: resultSucces('sess-t50-a3') });

      const p1 = runPeriodClaudeCli(ctx, sonde.env);
      exige(p1.resultat !== null && p1.exit === 0, 'p1-claude-cli-executee', messageEchec('run-period(claude-cli)', p1));

      const argv = argvEnregistre(sonde.recordFile);
      const idxP = argv.indexOf('-p'); // source:acceptance/T47.spec.ts (III.1) / cahier de T49 (II.4)
      exige(idxP >= 0 && idxP + 1 < argv.length, 'argv-contient-p-suivi-d-un-argument', `argv vu ${rendu(argv)}`);
      const prompt = normaliserEspaces(argv[idxP + 1] ?? '').toLowerCase();

      const manquants: string[] = [];
      for (const { operation, jetons } of jetonsAttendus()) {
        for (const jeton of jetons) {
          if (!prompt.includes(jeton.toLowerCase())) manquants.push(`${operation}:${jeton}`);
        }
      }
      exige(
        manquants.length === 0,
        'prompt-contient-le-contrat-bench.candidate-2-complet',
        `jeton(s) MANQUANT(S) : ${manquants.join(', ')} — prompt ${rendu(court(prompt, 2500))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T50.A4 un fichier ecrit dans l espace de travail pendant la session figure dans le commit de fin de la periode',
    () => {
      const ctx = nouveauContexte('a4');
      const relPath = 'candidate-written-during-session.txt';
      const content = `bench-t50-a4-${randomUUID()}`;
      const sonde = sondeClaudeCli({
        stdoutRaw: resultSucces('sess-t50-a4'),
        workspaceWrite: { relPath, content },
      });

      const p1 = runPeriodClaudeCli(ctx, sonde.env);
      exige(p1.resultat !== null && p1.exit === 0, 'p1-claude-cli-executee', messageEchec('run-period(claude-cli)', p1));
      exige(
        !MARQUEURS_DE_PLANTAGE.test(texteComplet(p1)),
        'appel-aboutit-proprement-pas-un-plantage',
        `plantage detecte dans ${court(texteComplet(p1), 600)}`,
      );

      const cand1 = candidateDe(p1.resultat);
      exige(cand1 !== null, 'p1-champ-candidate-present', `AUCUN champ candidate dans ${rendu(p1.resultat)}`);
      exige(
        typeof cand1?.commitSha === 'string' && cand1.commitSha.length > 0,
        'p1-commit_sha-present',
        `vu ${rendu(cand1?.commitSha)} dans ${rendu(p1.resultat)}`,
      );
      exige(
        typeof cand1?.workspaceDir === 'string' && fs.existsSync(cand1.workspaceDir),
        'p1-workspace_dir-reel',
        `vu ${rendu(cand1?.workspaceDir)} dans ${rendu(p1.resultat)}`,
      );

      // LECTURE GIT DIRECTE, hors de tout CLI (IV.(4)) : un commit pris AVANT l'ecriture de la
      // session ne contient PAS ce chemin dans son arbre, et `git show` echoue au lieu de
      // rendre exactement ce que le fixture a ecrit PENDANT l'appel.
      let montre = '';
      let gitEchec: string | null = null;
      try {
        montre = execFileSync('git', ['-C', cand1!.workspaceDir!, 'show', `${cand1!.commitSha}:${relPath}`], {
          encoding: 'utf8',
        }).trim();
      } catch (e) {
        gitEchec = messageDeErreur(e);
      }
      exige(
        gitEchec === null,
        'git-show-reussit-sur-le-commit-de-fin',
        `git show ${cand1?.commitSha}:${relPath} a ECHOUE dans ${cand1?.workspaceDir} : ${rendu(gitEchec)} — le fichier ecrit PENDANT la session n'est pas dans ce commit (il a ete pris trop tot)`,
      );
      exige(
        montre === content,
        'p1-commit-de-fin-contient-reellement-l-ecriture-de-la-session',
        `vu ${rendu(montre)} attendu ${rendu(content)} (git show ${cand1!.commitSha}:${relPath} dans ${cand1!.workspaceDir})`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});

function messageDeErreur(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.split('\n')[0] ?? String(e);
  return rendu(e);
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});
