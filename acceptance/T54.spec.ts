/**
 * acceptance/T54.spec.ts — suite d'acceptation de la tache T54.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T54.A1 numeric  — une periode dont la sortie brute contient des retours
 *                     a la ligne et le caractere `|` est relue intacte, et
 *                     le rapport de fin agrege son usage exactement
 *   T54.A2 absence  — a la periode k, seuls les controles des exigences
 *                     dues a une periode inferieure ou egale a k sont
 *                     evalues et persistes
 *   T54.A3 numeric  — quand la sortie d'une session declare la ventilation
 *                     de l'ecriture de cache entre 5 minutes et 1 heure et
 *                     que la session n'emploie qu'un seul modele, ces
 *                     tokens sont attribues a `cache_write_5m` et
 *                     `cache_write_1h`
 *   T54.A4 absence  — quand la session emploie plusieurs modeles OU ne
 *                     declare pas cette ventilation, l'ecriture de cache
 *                     reste dans la categorie non ventilee, et aucune de
 *                     ses unites n'est attribuee a une duree
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T54 EST UNE TACHE D'EXTENSION (ADR-011) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T54 — `packages/
 * activities`, `packages/agents` — et ne les a lus ni directement ni par
 * `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, pas une barriere technique). Le contrat teste ci-dessous est derive
 * de docs/specs/T54.md et de sa source, docs/adr/ADR-011-enonce-des-
 * exigences-pour-le-candidat.md, lignes 111 a 117 (la plage que la carte de
 * T54 epingle dans verification/tasks.extensions.json#spec_source) :
 *
 *   L111  titre : « Corriger ce que le premier essai reel a revele »
 *   L113  dependances T52 ; livrables, mot pour mot : « relecture des
 *         periodes a candidat reel independante du contenu de leur sortie
 *         brute ; controle d'une periode restreint aux exigences dues a
 *         cette periode ; attribution de l'ecriture de cache par duree
 *         quand la session la declare »
 *   L115  les quatre cas d'acceptation, mot pour mot
 *   L117  commande : `pnpm verify:task T54`. « PostgreSQL, le stockage
 *         objet et le faux executable `claude` sont requis ; aucun appel
 *         reel. »
 *
 * Cette suite lit en outre, dans le corps narratif du MEME document ACCEPTE
 * (hors de la plage L111-117 epinglee par la carte — exactement la liberte
 * que prennent deja acceptance/T48.spec.ts, T49.spec.ts, T50.spec.ts et
 * T51.spec.ts face a leur propre ADR), la section « Ce que le premier essai
 * reel a montre » qui NOMME les trois defauts que T54 corrige, chacun avec
 * les chiffres et litteraux REELLEMENT observes lors de cet essai :
 *
 *   L47-53 (defaut 4, A1) : « Le rapport de fin perd les tokens. L'usage
 *          est bien persiste [...] mais `candidate_token_report` est vide.
 *          La relecture decoupe la sortie de `psql` sur les retours a la
 *          ligne et sur `|` ; la sortie brute reelle de `claude -p`
 *          contient les deux (le compte rendu du candidat en markdown).
 *          Les colonnes se decalent et l'usage est perdu. »
 *   L55-57 (defaut 5, A2) : « Une periode est controlee sur des regles
 *          futures. A la periode 1, les cinq controles sont evalues, dont
 *          `cancel@1`, `fifo@1` et `isolation@1`, dus en P2 a P4 : le
 *          controle rejoue tout le scenario quelle que soit la periode. »
 *          — SEUL endroit qui NOMME, entre backticks, les trois
 *          identifiants de controle NON dus a la periode 1. `reserve@1` et
 *          `idempotence@1` (ADR-009:L34, repris par acceptance/
 *          T51.spec.ts II.4) ne figurent PAS dans cette liste des controles
 *          « dus en P2 a P4 » : par elimination (cinq controles fixes au
 *          total, trois nommes comme NON dus a P1), ce sont donc les deux
 *          SEULS dus a la periode 1 — c'est la lecture que cette suite
 *          teste, jamais une table complete de « quelle periode pour quel
 *          controle » que ni la carte ni l'ADR ne publient.
 *   L59-62 (defaut 6, A3/A4) : « La ventilation de l'ecriture de cache
 *          existe. Contrairement a la documentation relevee par ADR-008, la
 *          sortie reelle porte `usage.cache_creation.
 *          ephemeral_5m_input_tokens` et `ephemeral_1h_input_tokens` (ici 0
 *          et 35022) — au niveau de la session, pas par modele. »
 *   L84-88 (« Decision proposee », « Corriger ce que l'essai a revele
 *          (T54) ») : « relire les periodes persistees sans dependre du
 *          contenu de la sortie brute ; ne controler a une periode que les
 *          exigences dues a cette periode ; attribuer l'ecriture de cache a
 *          5 min et a 1 h quand la session la declare et n'emploie qu'un
 *          seul modele, la laisser non ventilee sinon. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions et contrats DEJA
 * FIXES par quatre suites ACCEPTANCE anterieures (jamais des sources de
 * T54) :
 *   - acceptance/T47.spec.ts (III) : `launchClaudeCliPeriod(options)` —
 *     fonction UNIQUE, importee directement depuis `packages/agents`
 *     (jamais par CLI), qui rend `{ok:true, raw, usage: Usage[]}` ou
 *     `{ok:false, reason, raw}` pour UNE session ; le vecteur `Usage` a six
 *     categories `input_fresh`/`cache_read`/`output`/`cache_write_5m`/
 *     `cache_write_1h`/`cache_write_unresolved`, derivees de `modelUsage`
 *     (`inputTokens`, `outputTokens`, `cacheReadInputTokens`,
 *     `cacheCreationInputTokens`) ; T47.A3 a DEJA fixe et prouve que, SANS
 *     ventilation declaree, `cacheCreationInputTokens` va ENTIEREMENT dans
 *     `cache_write_unresolved`, jamais dans `cache_write_5m`/`cache_write_
 *     1h` — ce comportement reste INCHANGE par T54 (A4, seconde moitie) :
 *     cette suite REJOUE ce meme fixture, par le meme mecanisme d'import,
 *     pour en temoigner, jamais pour le re-fixer.
 *   - acceptance/T49.spec.ts (II) : `run-period`/`pilot-conduct --provider
 *     claude-cli --live`, `--test-reread-period <n>` (relecture
 *     INDEPENDANTE, processus NEUF, DEPUIS l'etat persistant), le champ de
 *     sortie `candidate` (`session_id`, `raw_output`, `commit_sha`,
 *     `usage: Usage[]`) et `candidate_token_report.by_model`, agrege par
 *     `pilot-conduct` sur toutes les periodes REELLEMENT persistees d'une
 *     trajectoire.
 *   - acceptance/T51.spec.ts (II) : `candidate-control-period
 *     --candidate-command <argv>` (avance la trajectoire d'UNE periode,
 *     lance le code du commit de fin, applique les controles, persiste),
 *     `candidate-control-report --campaign-id <id>` (agregat `{periods:
 *     [{period_index, satisfied, violated}]}`), et les CINQ identifiants de
 *     controle `reserve@1`/`idempotence@1`/`cancel@1`/`fifo@1`/`isolation@1`
 *     (ADR-009:L34).
 *   - acceptance/T52.spec.ts (II.8) : les fixtures de candidat de reference
 *     `acceptance/fixtures/candidates/reservation-candidate-v2.mjs`
 *     (candidat CORRECT, respecte `bench.candidate/2`), reutilisees ICI
 *     SANS MODIFICATION pour A2 — leur contenu n'est jamais lu ni recopie
 *     par cette suite.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME, FAUTE D'IMPLEMENTATION A CONSULTER
 * (ADR-001 : aucune des valeurs ci-dessous n'a ete obtenue en executant une
 * implementation de T54 — aucune n'existe au moment ou cette suite est
 * ecrite).
 *
 * 1. LE CHEMIN DE L'INJECTION HOSTILE POUR A1. L'ADR (L49-53) decrit un
 *    SYMPTOME observe sur un essai reel (« la relecture decoupe la sortie
 *    de `psql` [...] »), jamais un mecanisme que cette suite devrait
 *    imposer a l'implementation : T54 ne fixe donc AUCUN detail de la
 *    relecture interne. Pour faire rougir le defaut SANS en presupposer le
 *    mecanisme, cette suite construit une sortie brute `claude -p` qui (a)
 *    reste un JSON STRICTEMENT VALIDE (le fixture et l'ingestion initiale
 *    continuent de la lire normalement — seule la RELECTURE ulterieure est
 *    en cause), et (b) contient REELEMENT, en octets, au moins un retour a
 *    la ligne ET au moins un caractere `|` : un `session_id` portant un `|`
 *    litteral (JSON n'echappe jamais ce caractere) et une indentation
 *    `JSON.stringify(obj, null, 2)` (de VRAIS octets de retour a la ligne
 *    entre les champs, un JSON pretty-printe restant un JSON valide).
 *    L'assertion `A1` ne porte JAMAIS sur CE choix de construction : elle
 *    porte sur l'EGALITE BYTE A BYTE entre la sortie ECRITE et la sortie
 *    RELUE (processus neuf), et sur l'EGALITE NUMERIQUE du rapport de fin —
 *    deux proprietes qu'une relecture qui decoupe sur `\n`/`|` ne peut pas
 *    satisfaire face a CETTE entree, quel que soit le mecanisme exact par
 *    lequel l'implementation corrigee les satisferait.
 * 2. REUTILISATION DU MANIFESTE DE T49 (jamais une source de T54, zone
 *    ACCEPTANCE, jamais modifie) : `acceptance/fixtures/pilot-longitudinal/
 *    manifest-t49-claude-cli-small.json` — une trajectoire, deux periodes,
 *    modele `bench-fake-claude-cli-model-a`. Les deux periodes d'UN MEME
 *    appel `pilot-conduct` partagent le MEME environnement (meme fixture,
 *    meme sortie brute — observe deja explicitement par acceptance/
 *    T49.spec.ts, test A4 : « le fixture ne peut pas distinguer P1 de P2
 *    par son propre etat ») : A1 en tire que le total agrege du rapport de
 *    fin doit EXACTEMENT doubler chaque categorie d'UNE periode — jamais
 *    une valeur inventee.
 * 3. LA LECTURE DE « DUS EN P2 A P4 » POUR A2 (cf. I ci-dessus) : par
 *    elimination sur les CINQ identifiants fixes par ADR-009:L34, seuls
 *    `reserve@1` et `idempotence@1` sont dus a la periode 1. Cette suite
 *    N'IMPOSE RIEN sur la periode a laquelle `cancel@1`/`fifo@1`/
 *    `isolation@1` deviennent dus (P2, P3 ou P4 — l'ADR ne le precise pas
 *    au-dela de « P2 a P4 ») : A2 n'exerce QUE la periode 1, le SEUL point
 *    ou l'ADR nomme un fait precis et verifiable (ces trois identifiants-la
 *    sont ABSENTS a CETTE periode-la).
 * 4. LE CHAMP `usage.cache_creation.{ephemeral_5m_input_tokens,
 *    ephemeral_1h_input_tokens}` (ADR:L61, SEUL endroit qui le nomme) est,
 *    par construction de cette suite, porte au niveau SESSION (meme cle
 *    `usage` que `input_tokens`/`cache_creation_input_tokens`, jamais a
 *    l'interieur d'une entree de `modelUsage`) — EXACTEMENT ce que l'ADR dit
 *    (« au niveau de la session, pas par modele »). A3/A4 exercent donc
 *    `launchClaudeCliPeriod` (le MEME point d'entree que T47.A2/A3, jamais
 *    reinvente) avec CE champ ajoute a cote de `modelUsage`, puisque c'est
 *    la fonction qui recoit DEJA la sortie `usage`/`modelUsage` complete de
 *    LA SESSION (T47.III.1) et peut donc, par construction, savoir combien
 *    de modeles DISTINCTS cette MEME session a declares — sans qu'aucun
 *    mecanisme PLUS LOIN dans la chaine (persistance, agregation) ait besoin
 *    d'etre suppose.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LES DANGERS PROPRES A T54, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 — LE DANGER NOMME (cases.extensions.lock.json) : « relire les
 *     periodes en decoupant la sortie psql sur `\n` et `|` : le cas doit
 *     rougir ». Cette suite n'accepte PAS qu'une sortie brute ORDINAIRE
 *     (sans `\n` ni `|`) suffise a prouver la relecture — elle verifie
 *     EXPLICITEMENT, avant tout appel CLI, que l'entree qu'elle construit
 *     contient reellement les deux caracteres (garde `CONTROLE-INVALIDE`),
 *     puis exige l'EGALITE BYTE A BYTE entre `raw_output` ECRIT et RELU
 *     (jamais une inclusion partielle, jamais une normalisation d'espaces
 *     qui masquerait une troncature) ET l'egalite numerique EXACTE du
 *     rapport de fin — jamais une comparaison du rapport a lui-meme : les
 *     categories attendues sont calculees depuis les valeurs LITTERALES que
 *     cette suite a elle-meme passees au fixture, pas depuis une relecture
 *     separee qui pourrait partager le meme defaut.
 * (2) A2 — LE DANGER NOMME : « evaluer `cancel@1` a la periode 1 : le cas
 *     doit rougir ». Cette suite n'accepte pas qu'un controle `cancel@1`
 *     present mais marque `violated` (parce que la periode 1 ne porte pas
 *     encore les operations qui le satisferaient) passe pour une preuve de
 *     correction : SEULE l'ABSENCE de l'entree `cancel@1` (et, par le meme
 *     fait ADR, `fifo@1`/`isolation@1`) du tableau `controls` a la periode 1
 *     satisfait A2 — une implementation qui evaluerait ces trois controles
 *     et les marquerait simplement `violated` au lieu de les omettre
 *     resterait ROUGE sous cette suite. Le compte EXACT (`controles.length
 *     === 2`) empeche en outre qu'une implementation omette `cancel@1` seul
 *     tout en omettant AUSSI `reserve@1`/`idempotence@1` par accident (ce
 *     qui laisserait `controles.length` a 2 pour une mauvaise raison) :
 *     cette suite verifie donc les DEUX identites, pas seulement le compte.
 *     Le second temoin, INDEPENDANT (`candidate-control-report`, processus
 *     NEUF), empeche qu'une implementation rende `controls` correctement
 *     filtre a l'appel mais PERSISTE encore les cinq statuts (« evalues ET
 *     persistes » — l'ADR nomme les deux).
 * (3) A3 — LE DANGER NOMME : « laisser l'ecriture de cache non ventilee
 *     malgre une ventilation declaree et un seul modele : le cas doit
 *     rougir ». Cette suite exige l'EGALITE EXACTE (jamais une simple
 *     presence non nulle) entre `cache_write_5m`/`cache_write_1h` et les
 *     deux compteurs `ephemeral_5m_input_tokens`/`ephemeral_1h_input_tokens`
 *     DECLARES, ET que `cache_write_unresolved` retombe a ZERO (rien n'est
 *     PERDU ni DOUBLE-COMPTE : la somme des trois categories de cache-write
 *     reste egale au total `cacheCreationInputTokens` de ce modele).
 * (4) A4 — LE DANGER NOMME : « attribuer a une duree l'ecriture de cache
 *     d'une session a deux modeles : le cas doit rougir ». Cette suite
 *     exerce ce danger EXACTEMENT comme nomme (deux modeles, ventilation
 *     DECLAREE malgre tout) et exige, pour les DEUX modeles, `cache_write_
 *     5m===0`/`cache_write_1h===0` — jamais seulement pour l'un des deux,
 *     ce qu'une implementation qui n'attribuerait la ventilation qu'au
 *     PREMIER modele rencontre de `modelUsage` laisserait passer a tort.
 *     Elle exerce EN OUTRE, dans le MEME cas, la seconde branche du
 *     connecteur « OU » de l'ADR (A4 : « ou ne declare pas cette
 *     ventilation ») — un seul modele, mais SANS le champ `cache_creation`
 *     — pour prouver que le defaut d'attribution ne depend QUE de la
 *     condition « ventilation declaree ET un seul modele », pas d'un
 *     raccourci qui ne regarderait que le nombre de modeles.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * PROVENANCE DES LITTERAUX
 *
 *   `run-period`,`pilot-conduct`,`--mode`,`recorded`,`--provider`,
 *   `claude-cli`,`--live`,`--campaign-id`,`--postgres-database`,
 *   `--s3-bucket`,`--candidate-workspace-root`,`--model`,
 *   `--test-reread-period`,`candidate`,`session_id`,`raw_output`,
 *   `commit_sha`,`usage`,`candidate_token_report`,`by_model`     — acceptance/T49.spec.ts (II)
 *   `candidate-control-period`,`candidate-control-report`,
 *   `--candidate-command`,`--candidate-timeout-ms`,`controls`,
 *   `period_index`,`satisfied`,`violated`,`deployed`             — acceptance/T51.spec.ts (II)
 *   `reserve@1`,`idempotence@1`,`cancel@1`,`fifo@1`,`isolation@1`  — ADR-009:L34, repris acceptance/T51.spec.ts (II.4)
 *   `reservation-candidate-v2.mjs`                                — acceptance/T52.spec.ts (II.8), acceptance/T51.spec.ts (fixtures)
 *   `launchClaudeCliPeriod` (et les cinq autres roles tentes),
 *   `inputTokens`,`outputTokens`,`cacheReadInputTokens`,
 *   `cacheCreationInputTokens`,`cache_write_5m`,`cache_write_1h`,
 *   `cache_write_unresolved`,`input_fresh`,`cache_read`,`output`    — acceptance/T47.spec.ts (III)
 *   `input_tokens`,`output_tokens`,`cache_creation_input_tokens`,
 *   `cache_read_input_tokens`,`modelUsage`                          — acceptance/T47.spec.ts (III) / T49.spec.ts
 *   `usage.cache_creation.ephemeral_5m_input_tokens`,
 *   `ephemeral_1h_input_tokens`                                     — source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L61
 *   « dus en P2 a P4 » (cancel@1, fifo@1, isolation@1)               — source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L55-57
 *   « decoupe [...] sur les retours a la ligne et sur `|` »          — source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L49-50
 *
 * Les perturbations exactes de A1-A4 sont celles de
 * verification/cases.extensions.lock.json#T54, citees mot pour mot dans la
 * section III ci-dessus ; verification/mutants/T54.json les realise.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne redemontre ni le developpement/commit par session claude -p
 *    (T49/T50), ni le contrat `bench.candidate/2` ou le protocole NDJSON
 *    (T51), ni l'enchainement session->controle au sein de `pilot-conduct`
 *    (T52) : ce sont des suites distinctes, DEJA publiees, dont cette suite
 *    REUTILISE le resultat sans le redemontrer.
 *  • Elle n'impose AUCUN mecanisme interne de relecture (A1) : elle observe
 *    seulement que la relecture SURVIT a une entree hostile, jamais COMMENT.
 *  • Elle ne fixe aucune table complete « periode due pour chaque
 *    identifiant de controle » au-dela du seul fait verifiable a la
 *    periode 1 (II.3) : elle n'exerce ni P2, ni P3, ni P4.
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T49/T51/T52, pour le
 *    socle CLI, et de T47 pour le socle d'import direct.
 *  • CONSEQUENCE ASSUMEE, NOMMEE ICI PLUTOT QUE CACHEE : les cas T51.A2/A3/
 *    A4 ont ete ECRITS (avant ADR-011) en supposant « toujours cinq
 *    controles, a chaque periode » — exactement le defaut que cette ADR
 *    documente (« le controle rejoue tout le scenario quelle que soit la
 *    periode »). Une implementation de T54 qui filtre correctement par
 *    periode rendra donc tres probablement certaines assertions de
 *    acceptance/T51.spec.ts rouges aux periodes posterieures a P1. Cette
 *    suite ne modifie PAS acceptance/T51.spec.ts : ce n'est pas son
 *    livrable (T54 ne depend que de T52, et le role test-author de CETTE
 *    tache ne porte que sur T54), et l'ADR qui motive T54 nomme lui-meme ce
 *    defaut comme une correction, pas une preservation, de ce que T51
 *    attendait avant le premier essai reel.
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
type Ns = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * commun (repris, sans le reinventer, de acceptance/T49.spec.ts/T51.spec.ts/
 * T52.spec.ts pour le socle CLI+PostgreSQL, et de acceptance/T47.spec.ts
 * pour le socle d'import direct de packages/agents)
 */

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

function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t54_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
const WORKSPACES_CREES: string[] = [];
const TMP_DIRS: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

function tmp(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `t54-${prefixe}-`));
  TMP_DIRS.push(d);
  return d;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of [...WORKSPACES_CREES, ...TMP_DIRS]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

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

function envDeBase(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

function lancer(sousCommande: string, drapeaux: string[], envSupp: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env = { ...envDeBase(), ...envSupp };
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
  return `${label} : ${
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ───────────────────────────── extraction de champs — FORME SOUPLE */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 9): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [{ chemin: '$', cle: '', v: racine, p: 0 }];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
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
const champTexte = (r: unknown, alias: readonly string[]): string | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
};
const champBool = (r: unknown, alias: readonly string[]): boolean | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  return typeof v.valeur === 'boolean' ? v.valeur : v.valeur === 'true' ? true : v.valeur === 'false' ? false : null;
};
const champNombre = (r: unknown, alias: readonly string[]): number | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

/* ════════════════════════ fixture claude-cli (reprise T47/T49/T51/T52) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');

/** Garde explicite — JAMAIS la vraie CLI (`/opt/node22/bin/claude` ou toute autre). */
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

let compteurId = 0;
function idFor(prefixe: string): string {
  compteurId += 1;
  return `${prefixe}-${process.pid.toString(36)}-${compteurId}`;
}

/* ─────────────────── litteraux de cette suite, chacun avec sa provenance */

const MODE = 'recorded'; // convention T23/T39/T45/T46/T49 (cahier:L21)
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L149, repris T49

const SOUS_COMMANDE_RUN_PERIOD = 'run-period'; // cahier:L355, repris T23/T45/T46/T49
const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const SOUS_COMMANDE_PERIODE = 'candidate-control-period'; // FIXE par acceptance/T51.spec.ts (II.1)
const SOUS_COMMANDE_RAPPORT = 'candidate-control-report'; // FIXE par acceptance/T51.spec.ts (II.1)

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L98
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // T48 III.1, repris T49/T51/T52
const DRAPEAU_REREAD = '--test-reread-period'; // FIXE par acceptance/T49.spec.ts (II.1)
const DRAPEAU_CANDIDATE_COMMAND = '--candidate-command'; // FIXE par acceptance/T51.spec.ts (II.1)
const DRAPEAU_CANDIDATE_TIMEOUT = '--candidate-timeout-ms'; // FIXE par acceptance/T51.spec.ts (II.1)

const CHAMP_INPUT_FRESH = 'input_fresh'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_CACHE_READ = 'cache_read'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_OUTPUT = 'output'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_CACHE_WRITE_5M = 'cache_write_5m'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_CACHE_WRITE_1H = 'cache_write_1h'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L135
const CHAMP_CACHE_WRITE_UNRESOLVED = 'cache_write_unresolved'; // FIXE par acceptance/T47.spec.ts (II)

const ALIAS_CANDIDATE = ['candidate', 'candidat'];
const ALIAS_SESSION_ID = ['session_id', 'sessionid'];
const ALIAS_RAW_OUTPUT = ['raw_output', 'rawoutput', 'raw'];
const ALIAS_COMMIT_SHA = ['commit_sha', 'commitsha'];
const ALIAS_WORKSPACE_DIR = ['workspace_dir', 'workspacedir'];
const ALIAS_USAGE = ['usage'];
const ALIAS_MODEL = ['model'];
const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_CANDIDATE_TOKEN_REPORT = ['candidate_token_report', 'candidatetokenreport'];
const ALIAS_BY_MODEL = ['by_model', 'bymodel'];
const ALIAS_PERIODS_PERSISTED = ['periods_persisted', 'periodspersisted'];
const ALIAS_PERIOD_INDEX = ['period_index', 'periodindex', 'index', 'numero', 'rang'];
const ALIAS_DEPLOYED = ['deployed'];
const ALIAS_PERIODES = ['periods'];

const CATEGORIES_USAGE = ['input_fresh', 'cache_read', 'output', 'cache_write_5m', 'cache_write_1h', 'cache_write_unresolved'] as const;
type CategorieUsage = (typeof CATEGORIES_USAGE)[number];
type VecteurUsage = Record<CategorieUsage, number>;
const vecteurVide = (): VecteurUsage => ({ input_fresh: 0, cache_read: 0, output: 0, cache_write_5m: 0, cache_write_1h: 0, cache_write_unresolved: 0 });

type Usage = { model: string } & VecteurUsage;
function candidateDe(r: unknown): { sessionId: string | null; rawOutput: string | null; commitSha: string | null; workspaceDir: string | null; usage: Usage[] } | null {
  const c = champProfond(r, ALIAS_CANDIDATE);
  if (c === null || c.valeur === null || typeof c.valeur !== 'object') return null;
  const v = c.valeur;
  const usageNoeud = tableauProfond(v, ALIAS_USAGE);
  const usage: Usage[] = usageNoeud !== null && Array.isArray(usageNoeud.valeur)
    ? (usageNoeud.valeur as unknown[]).map((x) => {
        const modele = champTexte(x, ALIAS_MODEL) ?? '';
        const vecteur = vecteurVide();
        for (const cat of CATEGORIES_USAGE) {
          const n = champNombre(x, [cat]);
          if (n !== null) vecteur[cat] = n;
        }
        return { model: modele, ...vecteur };
      })
    : [];
  return {
    sessionId: champTexte(v, ALIAS_SESSION_ID),
    rawOutput: champTexte(v, ALIAS_RAW_OUTPUT),
    commitSha: champTexte(v, ALIAS_COMMIT_SHA),
    workspaceDir: champTexte(v, ALIAS_WORKSPACE_DIR),
    usage,
  };
}
const periodsPersistedDe = (r: unknown): number | null => champNombre(r, ALIAS_PERIODS_PERSISTED);
const indexDe = (p: unknown): unknown => obj(p).period_index;
const deployeDe = (p: unknown): unknown => obj(obj(p).candidate).deployed;
function controlesMienDe(p: unknown): Json[] {
  const c = obj(p).controls;
  return Array.isArray(c) ? (c as Json[]) : [];
}
function periodesRapportDe(p: unknown): Json[] {
  const per = obj(p).periods;
  return Array.isArray(per) ? (per as Json[]) : [];
}

/* ════════════════════════════════ contextes et invocations CLI (A1/A2) */

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };

function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t54-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t54-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

/** `bench pilot-conduct` sur la campagne `ctx`, avec un manifeste et un environnement
 *  explicite (AUCUN drapeau nouveau par rapport a T46/T49/T52). */
function conduire(ctx: Contexte, manifest: string, extra: string[], env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [manifest, DRAPEAU_CAMPAGNE, ctx.campaignId, DRAPEAU_PG, ctx.db, DRAPEAU_S3, ctx.bucket, DRAPEAU_MODE, MODE, ...extra],
    env,
  );
}

/** `bench run-period --test-reread-period <n>`, processus NEUF, AUCUNE invocation de
 *  session (relecture STRICTEMENT depuis l'etat persistant — FIXE par T49, II.1). */
function relirePeriode(ctx: Contexte, n: number): AppelCli {
  return lancer(SOUS_COMMANDE_RUN_PERIOD, [
    DRAPEAU_MODE, MODE,
    DRAPEAU_CAMPAGNE, ctx.campaignId,
    DRAPEAU_PG, ctx.db,
    DRAPEAU_S3, ctx.bucket,
    DRAPEAU_REREAD, String(n),
  ]);
}

function drapeauxPeriode(ctx: Contexte, command: string[], timeoutMs: number): string[] {
  return [
    DRAPEAU_CAMPAGNE, ctx.campaignId,
    DRAPEAU_PG, ctx.db,
    DRAPEAU_S3, ctx.bucket,
    DRAPEAU_WORKSPACE_ROOT, ctx.workspaceRoot,
    DRAPEAU_CANDIDATE_COMMAND, JSON.stringify(command),
    DRAPEAU_CANDIDATE_TIMEOUT, String(timeoutMs),
  ];
}
function candidateControlPeriod(ctx: Contexte, command: string[], timeoutMs: number): AppelCli {
  return lancer(SOUS_COMMANDE_PERIODE, drapeauxPeriode(ctx, command, timeoutMs));
}
function candidateControlReport(ctx: Pick<Contexte, 'campaignId' | 'db'>): AppelCli {
  return lancer(SOUS_COMMANDE_RAPPORT, [DRAPEAU_CAMPAGNE, ctx.campaignId, DRAPEAU_PG, ctx.db]);
}

/* ───────────────── manifeste et fixtures de candidat, JAMAIS des sources de T54 */

/** REPRIS A L'IDENTIQUE de acceptance/T49.spec.ts (II)/T52.spec.ts (MANIFEST_T52) :
 *  UNE trajectoire, DEUX periodes, modele `bench-fake-claude-cli-model-a`. */
const MANIFEST_T54 = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t49-claude-cli-small.json');
const MODELE_MANIFESTE = 'bench-fake-claude-cli-model-a'; // champ model.name du manifeste ci-dessus

/** REPRIS A L'IDENTIQUE de acceptance/T51.spec.ts (fixtures)/T52.spec.ts (II.8) : le
 *  candidat de reference qui respecte `bench.candidate/2`. Contenu JAMAIS lu ni recopie. */
const FIXTURES_CANDIDATS_DIR = path.join(REPO, 'acceptance', 'fixtures', 'candidates');
const REFERENCE_V2 = path.join(FIXTURES_CANDIDATS_DIR, 'reservation-candidate-v2.mjs');
if (!fs.existsSync(REFERENCE_V2)) throw new Error(`FIXTURE-ABSENTE : ${REFERENCE_V2}`);
const REFERENCE_V2_ARGV = ['node', REFERENCE_V2];

/* Les cinq identifiants FIXES par ADR-009:L34, repris par acceptance/T51.spec.ts (II.4). */
const CONTROLE_RESERVE = 'reserve@1';
const CONTROLE_IDEMPOTENCE = 'idempotence@1';
const CONTROLE_CANCEL = 'cancel@1';
const CONTROLE_FIFO = 'fifo@1';
const CONTROLE_ISOLATION = 'isolation@1';
/** Dus a la periode 1 — par elimination sur ADR-011:L55-57 (cf. I ci-dessus). */
const CONTROLES_DUS_PERIODE_1 = [CONTROLE_RESERVE, CONTROLE_IDEMPOTENCE] as const;
/** Nommes par ADR-011:L55-57 comme dus en P2 a P4 — donc PAS a la periode 1. */
const CONTROLES_NON_DUS_PERIODE_1 = [CONTROLE_CANCEL, CONTROLE_FIFO, CONTROLE_ISOLATION] as const;

/* ════════════════════════ socle d'IMPORT DIRECT de packages/agents (A3/A4)
 * REPRIS A L'IDENTIQUE de acceptance/T47.spec.ts (III/IV) : launchClaudeCliPeriod
 * est le MEME point d'entree que T47.A2/A3 exercent deja, jamais reinvente ici.
 */

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
  exige(LOADED.charge, 'packages/agents-charge', `PAQUET-NON-CHARGEABLE packages/agents : ${LOADED.attempts.join(' | ')}`);
}

const ROLES_LAUNCH = [
  'launchClaudeCliPeriod',
  'runClaudeCliPeriod',
  'launchClaudePeriodSession',
  'runClaudeCliSession',
  'launchPeriodWithClaudeCli',
  'runPeriodClaudeCli',
] as const; // REPRIS A L'IDENTIQUE de acceptance/T47.spec.ts (III.1)

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
  exige(fn !== undefined, 'role-launchClaudeCliPeriod-trouve', `ROLE-INTROUVABLE launchClaudeCliPeriod (essaye : ${tried.join(', ')})`);
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

function assertFixtureReady(): void {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(CLAUDE_FIXTURE_BIN);
  } catch {
    stat = undefined;
  }
  const executable = stat !== undefined && (stat.mode & 0o111) !== 0;
  exige(executable, 'fixture-claude-executable', `FIXTURE-CLAUDE-MANQUANTE-OU-NON-EXECUTABLE ${CLAUDE_FIXTURE_BIN}`);
}

/** Construit l'environnement AMBIANT d'un appel direct a `launchClaudeCliPeriod`
 *  (jamais un processus CLI) — PATH prefixe par le fixture, verifie AVANT usage. */
function buildEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    ...overrides,
  };
  verifierFauxEnTetePath(env);
  return env;
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T54 — corriger ce que le premier essai reel a revele', () => {
  test(
    'T54.A1 une periode dont la sortie brute contient des retours a la ligne et le caractere | est relue intacte, et le rapport de fin agrege son usage exactement (ADR-011:L115)',
    () => {
      const ctx = nouveauContexte('a1');
      const USAGE = { inputTokens: 11, outputTokens: 22, cacheReadInputTokens: 33, cacheCreationInputTokens: 44 };

      // SORTIE BRUTE HOSTILE (I.1) : JSON valide, mais contenant REELLEMENT des
      // octets de retour a la ligne (indentation) ET un caractere | litteral
      // (dans session_id) — exactement les deux caracteres qu'ADR-011:L49-50
      // nomme comme source de la corruption de relecture.
      const sessionIdHostile = `${idFor('sess-t54-a1')} | compte-rendu-markdown : statut | valeur`;
      const brut = JSON.stringify(
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: sessionIdHostile,
          num_turns: 1,
          total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          modelUsage: { [MODELE_MANIFESTE]: USAGE },
        },
        null,
        2,
      );
      exige(
        brut.includes('\n') && brut.includes('|'),
        'sortie-brute-hostile-contient-bien-retour-a-la-ligne-et-pipe',
        `CONTROLE-INVALIDE : la sortie construite par ce cas ne contient ni le retour a la ligne ni le | attendus : ${rendu(court(brut, 300))}`,
      );

      const env: NodeJS.ProcessEnv = {
        PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
        BENCH_FAKE_CLAUDE_STDOUT_RAW: brut,
      };
      verifierFauxEnTetePath(env);

      const run = conduire(
        ctx,
        MANIFEST_T54,
        [DRAPEAU_PROVIDER, PROVIDER_CLAUDE_CLI, DRAPEAU_LIVE, DRAPEAU_WORKSPACE_ROOT, ctx.workspaceRoot],
        env,
      );
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-execute', messageEchec('pilot-conduct(claude-cli, A1)', run));
      exige(
        periodsPersistedDe(run.resultat) === 2,
        'deux-periodes-persistees',
        `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`,
      );

      const trajectoires = tableauProfond(run.resultat, ALIAS_TRAJECTOIRES);
      exige(
        trajectoires !== null && Array.isArray(trajectoires.valeur) && trajectoires.valeur.length === 1,
        'une-trajectoire-compilee',
        `vu ${rendu(run.resultat)}`,
      );
      const trajKey = champTexte((trajectoires!.valeur as unknown[])[0], ALIAS_TRAJECTORY_KEY);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible', `vu ${rendu(trajKey)} dans ${rendu(run.resultat)}`);

      // RELECTURE INDEPENDANTE, processus NEUF, de CHAQUE periode : l'assertion
      // DECISIVE d'A1 — EGALITE BYTE A BYTE, jamais une inclusion partielle.
      for (const n of [1, 2]) {
        const ctxTraj: Contexte = { ...ctx, campaignId: trajKey as string };
        const relue = relirePeriode(ctxTraj, n);
        exige(relue.resultat !== null && relue.exit === 0, `periode-${n}-relue`, messageEchec(`run-period(--test-reread-period ${n})`, relue));
        const cand = candidateDe(relue.resultat);
        exige(cand !== null, `periode-${n}-candidate-present`, `vu ${rendu(relue.resultat)}`);
        exige(
          cand!.rawOutput === brut,
          `periode-${n}-raw-output-relu-intact`,
          `ecrit (${brut.length} caracteres) vs relu ${rendu(court(cand!.rawOutput ?? '', 400))} — divergence apres decoupage sur \\n/| ?`,
        );
        exige(
          cand!.usage.length === 1 && cand!.usage[0]?.model === MODELE_MANIFESTE,
          `periode-${n}-usage-un-modele-present`,
          `vu ${rendu(cand!.usage)}`,
        );
        exige(
          cand!.usage[0]?.input_fresh === USAGE.inputTokens &&
            cand!.usage[0]?.cache_read === USAGE.cacheReadInputTokens &&
            cand!.usage[0]?.output === USAGE.outputTokens,
          `periode-${n}-usage-categories-exactes`,
          `vu ${rendu(cand!.usage[0])} — attendu input_fresh=${USAGE.inputTokens} cache_read=${USAGE.cacheReadInputTokens} output=${USAGE.outputTokens}`,
        );
      }

      // LE RAPPORT DE FIN AGREGE SON USAGE EXACTEMENT (seconde moitie d'A1) :
      // deux periodes IDENTIQUES (meme environnement partage par `pilot-conduct`,
      // observation deja faite par acceptance/T49.spec.ts A4) -> total = 2x chaque
      // categorie d'UNE periode. Comparaison a une valeur CALCULEE depuis les
      // litteraux PASSES au fixture par cette suite, jamais au rapport lui-meme.
      const rapport = champProfond(run.resultat, ALIAS_CANDIDATE_TOKEN_REPORT);
      exige(rapport !== null, 'candidate_token_report-present', `AUCUN candidate_token_report dans ${rendu(run.resultat)}`);
      const parModele = champProfond(rapport!.valeur, ALIAS_BY_MODEL);
      exige(parModele !== null, 'candidate_token_report.by_model-present', `AUCUN by_model dans ${rendu(rapport!.valeur)}`);
      const noeud = champProfond(parModele!.valeur, [MODELE_MANIFESTE]);
      exige(noeud !== null, `rapport-contient-le-modele-${MODELE_MANIFESTE}`, `modele ABSENT de ${rendu(parModele!.valeur)}`);
      exige(
        champNombre(noeud!.valeur, [CHAMP_INPUT_FRESH]) === USAGE.inputTokens * 2,
        'rapport-input-fresh-double-exactement',
        `vu ${rendu(champNombre(noeud!.valeur, [CHAMP_INPUT_FRESH]))} attendu ${USAGE.inputTokens * 2} dans ${rendu(noeud!.valeur)}`,
      );
      exige(
        champNombre(noeud!.valeur, [CHAMP_CACHE_READ]) === USAGE.cacheReadInputTokens * 2,
        'rapport-cache-read-double-exactement',
        `vu ${rendu(champNombre(noeud!.valeur, [CHAMP_CACHE_READ]))} attendu ${USAGE.cacheReadInputTokens * 2} dans ${rendu(noeud!.valeur)}`,
      );
      exige(
        champNombre(noeud!.valeur, [CHAMP_OUTPUT]) === USAGE.outputTokens * 2,
        'rapport-output-double-exactement',
        `vu ${rendu(champNombre(noeud!.valeur, [CHAMP_OUTPUT]))} attendu ${USAGE.outputTokens * 2} dans ${rendu(noeud!.valeur)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T54.A2 a la periode k, seuls les controles des exigences dues a une periode inferieure ou egale a k sont evalues et persistes (ADR-011:L115)',
    () => {
      const ctx = nouveauContexte('a2');

      // UNE SEULE periode (k=1), candidat de REFERENCE CORRECT.
      const p1 = candidateControlPeriod(ctx, REFERENCE_V2_ARGV, 60_000);
      exige(p1.resultat !== null && p1.exit === 0, 'periode-1-executee', messageEchec('candidate-control-period(P1)', p1));
      const r1 = p1.resultat as Json;
      exige(indexDe(r1) === 1, 'periode-1-index-1', `vu ${rendu(indexDe(r1))} dans ${rendu(r1)}`);
      exige(deployeDe(r1) === true, 'periode-1-deployee', `vu ${rendu(deployeDe(r1))} dans ${rendu(r1)}`);

      const controles1 = controlesMienDe(r1);
      const ids1 = controles1.map((c) => c.id);

      // LES DEUX EXIGENCES DUES A LA PERIODE 1 (I.3) SONT EVALUEES.
      for (const id of CONTROLES_DUS_PERIODE_1) {
        const c = controles1.find((x) => x.id === id);
        exige(c !== undefined, `controle-${id}-present-a-la-periode-1`, `absent de ${rendu(ids1)}`);
        const statut = (c as Json).status;
        exige(statut === 'satisfied' || statut === 'violated', `controle-${id}-statut-reconnu`, `vu ${rendu(statut)} dans ${rendu(c)}`);
      }

      // LES TROIS EXIGENCES NOMMEES PAR ADR-011:L55-57 COMME DUES EN P2 A P4
      // SONT ABSENTES DU TABLEAU `controls` A LA PERIODE 1 — l'assertion
      // DECISIVE (perturbation cases.extensions.lock.json#T54.A2 : « evaluer
      // cancel@1 a la periode 1 »). Un statut quelconque (meme 'violated') ne
      // satisfait PAS ce cas : seule l'ABSENCE de l'entree compte.
      for (const id of CONTROLES_NON_DUS_PERIODE_1) {
        const trouve = controles1.find((x) => x.id === id);
        exige(
          trouve === undefined,
          `controle-${id}-absent-a-la-periode-1`,
          `TROUVE a la periode 1 malgre ADR-011:L55-57 (« dus en P2 a P4 ») : ${rendu(trouve)}`,
        );
      }
      exige(
        controles1.length === CONTROLES_DUS_PERIODE_1.length,
        'exactement-les-controles-dus-a-la-periode-1',
        `vu ${controles1.length} controle(s) : ${rendu(ids1)} — attendu seulement ${rendu([...CONTROLES_DUS_PERIODE_1])}`,
      );

      // EVALUES *ET* PERSISTES (l'ADR nomme les deux) : relecture INDEPENDANTE,
      // processus NEUF, jamais une comparaison du rapport a lui-meme (meme
      // discipline que acceptance/T51.spec.ts, III.5).
      const rapport = candidateControlReport(ctx);
      exige(rapport.resultat !== null && rapport.exit === 0, 'rapport-execute', messageEchec('candidate-control-report', rapport));
      const periodes = periodesRapportDe(rapport.resultat);
      const ligne1 = periodes.find((x) => Number(x.period_index) === 1);
      exige(ligne1 !== undefined, 'rapport-periode-1-presente', `absente de ${rendu(periodes)}`);
      const satisfied = Number((ligne1 as Json).satisfied);
      const violated = Number((ligne1 as Json).violated);
      exige(
        satisfied + violated === CONTROLES_DUS_PERIODE_1.length,
        'rapport-periode-1-seuls-les-controles-dus-sont-persistes',
        `vu satisfied=${satisfied} violated=${violated} (somme ${satisfied + violated}) dans ${rendu(ligne1)} — attendu ${CONTROLES_DUS_PERIODE_1.length} (${rendu([...CONTROLES_DUS_PERIODE_1])} seulement)`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T54.A3 quand la session declare la ventilation de l ecriture de cache entre 5 minutes et 1 heure et n emploie qu un seul modele, ces tokens sont attribues a cache_write_5m et cache_write_1h (ADR-011:L115)',
    async () => {
      assertAgentsLoaded();
      assertFixtureReady();
      const launch = requireLaunch();

      const workspaceDir = tmp('a3-workspace');
      const MODEL = 'stub-model-t54-a3-ventile';
      const CINQ_MIN = 30; // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L61 (ephemeral_5m_input_tokens, « ici 0 et 35022 »)
      const UNE_HEURE = 70; // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L61 (ephemeral_1h_input_tokens)
      const TOTAL_ECRITURE = CINQ_MIN + UNE_HEURE;

      const stdout = JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: idFor('sess-t54-a3'),
        num_turns: 1,
        total_cost_usd: 0,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: TOTAL_ECRITURE,
          cache_read_input_tokens: 0,
          // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L61
          // « au niveau de la session, pas par modele » — UN SEUL modele ici.
          cache_creation: { ephemeral_5m_input_tokens: CINQ_MIN, ephemeral_1h_input_tokens: UNE_HEURE },
        },
        modelUsage: {
          [MODEL]: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: TOTAL_ECRITURE },
        },
      });

      const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: stdout });
      const res = await essayer(() => launch({ workspaceDir, model: MODEL, env }));
      exige(res.ok, 'appel-execute', res.ok ? '' : `APPEL-EN-ECHEC ${messageDe((res as { ok: false; err: unknown }).err)}`);
      const v = (res as { ok: true; value: Json }).value;
      exige(v.ok === true, 'session-reussie', `SESSION-EN-ECHEC-INATTENDU ${rendu(v)}`);

      const usage = v.usage;
      exige(Array.isArray(usage), 'usage-est-un-tableau', `vu ${rendu(usage)}`);
      const entree = (usage as Json[]).find((e) => e.model === MODEL);
      exige(entree !== undefined, 'entree-presente', `ABSENTE de ${rendu(usage)}`);
      const e = entree as Json;

      // L'ASSERTION DECISIVE (proof_kind=numeric) : attribution EXACTE, jamais
      // approximative, aux deux categories ventilees.
      exige(
        e[CHAMP_CACHE_WRITE_5M] === CINQ_MIN,
        'cache-write-5m-attribue-exactement',
        `vu ${rendu(e[CHAMP_CACHE_WRITE_5M])} attendu ${CINQ_MIN} dans ${rendu(e)}`,
      );
      exige(
        e[CHAMP_CACHE_WRITE_1H] === UNE_HEURE,
        'cache-write-1h-attribue-exactement',
        `vu ${rendu(e[CHAMP_CACHE_WRITE_1H])} attendu ${UNE_HEURE} dans ${rendu(e)}`,
      );
      // RIEN N'EST PERDU NI DOUBLE-COMPTE : la categorie non ventilee retombe a
      // zero une fois la totalite ventilee entre les deux durees declarees.
      exige(
        e[CHAMP_CACHE_WRITE_UNRESOLVED] === 0,
        'cache-write-unresolved-vide-une-fois-tout-ventile',
        `vu ${rendu(e[CHAMP_CACHE_WRITE_UNRESOLVED])} dans ${rendu(e)} — attendu 0 (5m=${CINQ_MIN} + 1h=${UNE_HEURE} = total ${TOTAL_ECRITURE})`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T54.A4 avec plusieurs modeles, ou sans ventilation declaree, l ecriture de cache reste non ventilee et aucune unite n est attribuee a une duree (ADR-011:L115)',
    async () => {
      assertAgentsLoaded();
      assertFixtureReady();
      const launch = requireLaunch();

      // (a) DEUX MODELES, VENTILATION DECLAREE MALGRE TOUT (perturbation nommee :
      //     « attribuer a une duree l'ecriture de cache d'une session a deux
      //     modeles »). L'ambiguite (quel modele a ecrit dans quelle fenetre ?)
      //     interdit toute attribution, POUR LES DEUX modeles.
      {
        const workspaceDir = tmp('a4a-workspace-multi-modeles');
        const MODEL_ALPHA = 'stub-model-t54-a4-alpha';
        const MODEL_BETA = 'stub-model-t54-a4-beta';
        const ECRITURE_ALPHA = 60;
        const ECRITURE_BETA = 40;
        const CINQ_MIN = 30; // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L61
        const UNE_HEURE = 70; // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L61

        const stdout = JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: idFor('sess-t54-a4a'),
          num_turns: 1,
          total_cost_usd: 0,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: ECRITURE_ALPHA + ECRITURE_BETA,
            cache_read_input_tokens: 0,
            cache_creation: { ephemeral_5m_input_tokens: CINQ_MIN, ephemeral_1h_input_tokens: UNE_HEURE },
          },
          modelUsage: {
            [MODEL_ALPHA]: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: ECRITURE_ALPHA },
            [MODEL_BETA]: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: ECRITURE_BETA },
          },
        });

        const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: stdout });
        const res = await essayer(() => launch({ workspaceDir, model: MODEL_ALPHA, env }));
        exige(res.ok, 'a4a-appel-execute', res.ok ? '' : `APPEL-EN-ECHEC ${messageDe((res as { ok: false; err: unknown }).err)}`);
        const v = (res as { ok: true; value: Json }).value;
        exige(v.ok === true, 'a4a-session-reussie', `SESSION-EN-ECHEC-INATTENDU ${rendu(v)}`);

        const usage = v.usage;
        exige(Array.isArray(usage) && usage.length === 2, 'a4a-deux-entrees-une-par-modele', `vu ${rendu(usage)}`);
        for (const [modele, ecriture] of [[MODEL_ALPHA, ECRITURE_ALPHA], [MODEL_BETA, ECRITURE_BETA]] as const) {
          const e = (usage as Json[]).find((x) => x.model === modele);
          exige(e !== undefined, `a4a-entree-${modele}-presente`, `ABSENTE de ${rendu(usage)}`);
          exige(
            (e as Json)[CHAMP_CACHE_WRITE_5M] === 0,
            `a4a-${modele}-cache-write-5m-zero`,
            `vu ${rendu((e as Json)[CHAMP_CACHE_WRITE_5M])} dans ${rendu(e)} — AUCUNE attribution n'est valide avec deux modeles`,
          );
          exige(
            (e as Json)[CHAMP_CACHE_WRITE_1H] === 0,
            `a4a-${modele}-cache-write-1h-zero`,
            `vu ${rendu((e as Json)[CHAMP_CACHE_WRITE_1H])} dans ${rendu(e)} — AUCUNE attribution n'est valide avec deux modeles`,
          );
          exige(
            (e as Json)[CHAMP_CACHE_WRITE_UNRESOLVED] === ecriture,
            `a4a-${modele}-cache-write-unresolved-conserve`,
            `vu ${rendu((e as Json)[CHAMP_CACHE_WRITE_UNRESOLVED])} attendu ${ecriture} dans ${rendu(e)} — rien ne doit etre PERDU`,
          );
        }
      }

      // (b) UN SEUL MODELE, AUCUNE VENTILATION DECLAREE (branche « OU » de
      //     l'ADR) — EXACTEMENT le comportement DEJA fixe et prouve par
      //     acceptance/T47.spec.ts (A3), rejoue ICI pour temoigner qu'il reste
      //     inchange sous T54.
      {
        const workspaceDir = tmp('a4b-workspace-sans-ventilation');
        const MODEL = 'stub-model-t54-a4-sans-ventilation';
        const ECRITURE_AMBIGUE = 23; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L49 (« duree jamais declaree »), repris acceptance/T47.spec.ts (A3)

        const stdout = JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: idFor('sess-t54-a4b'),
          num_turns: 1,
          total_cost_usd: 0,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: ECRITURE_AMBIGUE,
            cache_read_input_tokens: 0,
            // AUCUN champ `cache_creation` : la session ne declare pas la ventilation.
          },
          modelUsage: {
            [MODEL]: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: ECRITURE_AMBIGUE },
          },
        });

        const env = buildEnv({ BENCH_FAKE_CLAUDE_STDOUT_RAW: stdout });
        const res = await essayer(() => launch({ workspaceDir, model: MODEL, env }));
        exige(res.ok, 'a4b-appel-execute', res.ok ? '' : `APPEL-EN-ECHEC ${messageDe((res as { ok: false; err: unknown }).err)}`);
        const v = (res as { ok: true; value: Json }).value;
        exige(v.ok === true, 'a4b-session-reussie', `SESSION-EN-ECHEC-INATTENDU ${rendu(v)}`);

        const usage = v.usage;
        exige(Array.isArray(usage), 'a4b-usage-est-un-tableau', `vu ${rendu(usage)}`);
        const e = (usage as Json[]).find((x) => x.model === MODEL);
        exige(e !== undefined, 'a4b-entree-presente', `ABSENTE de ${rendu(usage)}`);
        exige((e as Json)[CHAMP_CACHE_WRITE_5M] === 0, 'a4b-cache-write-5m-zero', `vu ${rendu((e as Json)[CHAMP_CACHE_WRITE_5M])} dans ${rendu(e)}`);
        exige((e as Json)[CHAMP_CACHE_WRITE_1H] === 0, 'a4b-cache-write-1h-zero', `vu ${rendu((e as Json)[CHAMP_CACHE_WRITE_1H])} dans ${rendu(e)}`);
        exige(
          (e as Json)[CHAMP_CACHE_WRITE_UNRESOLVED] === ECRITURE_AMBIGUE,
          'a4b-cache-write-unresolved-conserve',
          `vu ${rendu((e as Json)[CHAMP_CACHE_WRITE_UNRESOLVED])} attendu ${ECRITURE_AMBIGUE} dans ${rendu(e)}`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );
});
