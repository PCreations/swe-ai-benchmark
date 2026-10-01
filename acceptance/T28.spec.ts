/**
 * acceptance/T28.spec.ts — suite d'acceptation de la tache T28.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T28.A1 behaviour — serveur HTTP factice conforme au contrat recoit la
 *                      bonne requete
 *   T28.A2 behaviour — reponse avec appel d'outil validee, executee dans le
 *                      sandbox puis renvoyee au modele
 *   T28.A3 refusal   — outil inconnu ou arguments invalides refuses
 *   T28.A4 behaviour — usage/cache normalises sans double comptage
 *   T28.A5 refusal   — erreurs 429, authentification et reponse tronquee
 *                      classees correctement
 *   T28.A6 behaviour — perte de reponse respecte T17
 *   T28.A7 absence   — aucune cle dans le sandbox ou les traces publiables
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T28 — `packages/agents` et
 * `packages/gateway` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff). Le
 * contrat teste ci-dessous est derive de docs/specs/T28.md, c'est-a-dire des
 * lignes du cahier que la carte de specification epingle sur T28 :
 *
 *   L395  titre : « Ajouter un premier adaptateur de modele reel »
 *   L397  dependances T17, T18, T19, T25 ; livrables MOT POUR MOT :
 *         « adaptateur natif Anthropic Messages via SDK TypeScript
 *         verrouille, boucle d'outils et configuration de modele sans
 *         identifiant invente » — c'est cette derniere clause qui fonde
 *         l'assertion d'A1 sur le `model` REELLEMENT envoye (III.1).
 *   L399  perimetre initial : « reponses non streamees, outils
 *         lecture/ecriture/execution dans le sandbox, question client et
 *         soumission [...] Les autres connecteurs doivent satisfaire le
 *         meme contrat AgentRunner. » — « non streamees » motive le choix
 *         d'un corps JSON complet plutot qu'un flux SSE (III.1) ; « outils
 *         lecture/ecriture/execution » fixe les trois noms d'outils de
 *         III.4 (A2, A3, A7).
 *   L401  les sept cas d'acceptation, mot pour mot.
 *   L403  fin : « contrat HTTP et boucle d'outils valides sans appel payant.
 *         bench smoke-live est separe [...] » — fonde l'usage exclusif du
 *         serveur HTTP FACTICE (jamais un reseau reel) dans cette suite.
 *   L15   « Les appels de developpement et de generation passent par des
 *         interfaces substituables [...] deterministes » et (implicitement,
 *         meme regle que T17/T18/T19) « les tests ordinaires n'appellent
 *         aucun fournisseur externe ».
 *   L65   invariant D3 : « Le candidat n'a pas les identifiants du stockage
 *         de recherche, de la base centrale ou de l'evaluateur » — fonde,
 *         avec L321 (T19, ci-dessous), A7.
 *   L69   invariant D7 : « Un appel fournisseur dont la reponse est perdue
 *         n'est pas relance aveuglement. Son etat reste ambigu tant qu'il
 *         n'est pas reconcilie. » — A6, par delegation a T17.
 *   L80   « les montants sont des chaines d'entiers non negatifs en
 *         micro-USD » — le format que `interpretMontant` accepte dans A4.
 *   L99   etats d'appel `DISPATCH_STARTED ... UNKNOWN ...` — le statut
 *         qu'A6 exige apres la panne simulee.
 *   L103  `F-MONEY` — grille tarifaire fictive et appel de reference (100
 *         non caches, 40 caches, 20 sortie -> 340) ; « si un fournisseur
 *         inclut le cache dans un total, son adaptateur le normalise avant
 *         facturation » — le fondement litteral d'A4.
 *   L301, L303 (T17, dependance directe) : « journal durable d'appel [...]
 *         idempotence logique » ; les sept cas de T17, deja proves par
 *         acceptance/T17.spec.ts — A6 ne les reproduit pas, il verifie que
 *         le CONNECTEUR REEL, branche dans ce meme journal, obtient le meme
 *         verdict qu'un fournisseur factice en panne.
 *   L309, L311, L313 (T18, dependance directe) : contrat AgentRunner
 *         (`start/observe/submit/stop/resume`) deja fixe et prouve par
 *         acceptance/T18.spec.ts. Le perimetre de L399 (« les autres
 *         connecteurs doivent satisfaire le meme contrat ») est un objectif
 *         D'INTEGRATION FUTURE du moteur ; aucun des sept cas de T28 ne
 *         nomme `session_id`, `observe` ni `submit` — cette suite exerce
 *         donc le connecteur et sa boucle d'outils EN ISOLATION, au meme
 *         niveau que acceptance/T17.spec.ts exerce `dispatchModelCall` sans
 *         jamais passer par une session T18 (cf. IV).
 *   L319, L321, L323 (T19, dependance directe) : « SandboxRunner Linux
 *         [...] pas de cles fournisseurs [...] Le candidat n'accede qu'a
 *         ses services, au miroir autorise et a la passerelle » — le
 *         contrat `execShell`/`buildSandboxProfile`/`provisionSandbox` deja
 *         fixe par acceptance/T19.spec.ts, repris tel quel ici pour A2 et
 *         A7. « pas de cles fournisseurs » est la clause textuelle qui
 *         fonde directement A7.
 *   L649  « Un connecteur contractuellement verifie sans credential est une
 *         implementation disponible, pas une integration live deja
 *         observee » — justifie que cette suite n'exige JAMAIS
 *         `requires_live_credentials` (verification/tasks.json le confirme :
 *         `false`) et n'appelle qu'un serveur factice.
 *   L658  (§M) : « Le SDK TypeScript officiel Anthropic fournit le premier
 *         connecteur propose ; sa version, son schema de reponse et ses
 *         options effectives doivent etre verrouilles lors de
 *         l'implementation » — fonde le choix des noms de champs HTTP
 *         (`x-api-key`, blocs `content` typés `text`/`tool_use`/
 *         `tool_result`, `usage.{input_tokens,cache_creation_input_tokens,
 *         cache_read_input_tokens,output_tokens}`, `stop_reason`) : ce sont
 *         les conventions PUBLIQUEMENT DOCUMENTEES du Messages API que le
 *         SDK verrouille, pas une invention de cette suite (cf. II).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * (a) VALEURS SCELLEES DE §F, IMPORTEES DE `acceptance/reference/F-MONEY.json`
 *     — JAMAIS RECOPIEES A LA MAIN : grille (2, 1, 5), appel de reference
 *     (100, 40, 20 -> 340). -> A4.
 *
 * (b) LITTERAUX RELEVES DANS LE CAHIER (`// cahier:L<n>`) :
 *       `UNKNOWN` — L99                                                  A6
 *       1 (« un seul appel »), par delegation a T17 — L303               A6
 *
 * (c) CONVENTIONS PUBLIQUES DU MESSAGES API ANTHROPIC (L658, SDK officiel) —
 *     ni une fixture gelee, ni une invention de cette suite : la forme des
 *     champs transport (`x-api-key`, `/v1/messages`, `model`, `max_tokens`,
 *     `messages`, `tools`, `content[].type in {text,tool_use,tool_result}`,
 *     `stop_reason in {end_turn,tool_use,max_tokens}`, `usage.{input_tokens,
 *     cache_creation_input_tokens,cache_read_input_tokens,output_tokens}`)
 *     documentee publiquement par le depot que L658 nomme.
 *
 * CE QUI EST FIXE PAR CETTE SUITE, ET DOCUMENTE COMME TEL (packages/agents
 * n'a pas encore ces exports au moment ou cette suite est ecrite — la
 * situation exacte de packages/gateway au moment ou acceptance/T17.spec.ts a
 * ete ecrite) :
 *   `UNKNOWN_TOOL`, `INVALID_TOOL_ARGUMENTS`   — codes de refus d'A3
 *   `RATE_LIMITED`, `AUTHENTICATION_ERROR`,
 *   `TRUNCATED_RESPONSE`                        — codes de refus d'A5
 *   les trois outils `read_file`/`write_file`/`run_command` et leurs
 *     schemas minimaux (III.4) — une instanciation concrete de « lecture/
 *     ecriture/execution » (L399)
 *   le decoupage de la boucle en primitives COMPOSABLES plutot qu'un
 *     orchestrateur opaque (III.1-III.5) — cette suite teste le CONNECTEUR,
 *     pas un executeur de session complet (deja le role de T18)
 *
 * CE QUE CETTE SUITE FABRIQUE ET QUI N'EST DONC PAS UN LITTERAL A FAIRE
 * REMONTER : les identifiants de campagne/appel/budget/reservation/cle
 * d'idempotence, le `test_run_id` qui prefixe les bases et sandboxes
 * jetables, les cles API et modeles SENTINELLES generees par test (leur
 * PRESENCE/ABSENCE est verifiee, jamais leur valeur comparee a un litteral
 * du cahier), le contenu texte des messages de test.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T28 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Paquets interroges : `packages/agents` (source_paths de T28, la majorite
 * FIXEE ICI), `packages/gateway` (source_paths de T28 egalement — seul
 * `getModelCall`, deja fixe par acceptance/T17.spec.ts, est repris tel
 * quel), `packages/billing` (T16, `openBudget`/`reserveBudget`/
 * `getBudgetState` repris tels quels), `packages/storage` (T12,
 * `applyMigrations`/`openStore`/`closeStore` repris tels quels),
 * `packages/sandbox` (T19, `buildSandboxProfile`/`provisionSandbox` repris
 * tels quels). Le chargement ne LEVE jamais : chaque cas asserte lui-meme
 * le chargement du paquet dont il a besoin.
 *
 * 1. `createAnthropicMessagesProvider(config)` -> `AnthropicProvider`
 *    `config` = `{ baseURL, apiKey, model, maxTokens }`. SANS IDENTIFIANT
 *    INVENTE (L397) : le `model` envoye sur le fil DOIT etre exactement
 *    celui de `config`, jamais une valeur par defaut codee en dur — A1 le
 *    verifie avec un `model` SENTINELLE improbable comme defaut accidentel.
 *    `AnthropicProvider` = `{ complete(request) -> Promise<AnthropicResponse> }`.
 *    `complete` emet UNE requete HTTP `POST <baseURL>/v1/messages`,
 *    header `x-api-key: <apiKey>`, corps JSON
 *    `{ model, max_tokens: maxTokens, messages: request.messages,
 *    tools?: request.tools, system?: request.system }` (L399 : « reponses
 *    non streamees », donc un corps JSON complet, jamais un flux). Elle
 *    NE RELANCE PAS automatiquement sur 429/401/troncature — chacune de ces
 *    reponses est CLASSEE et REJETEE (A5), jamais absorbee silencieusement
 *    par une politique de retry qui masquerait sa classe a l'appelant.
 *    `AnthropicResponse` = `{ content: ContentBlock[], stop_reason: string,
 *    usage: { input_uncached_tokens, input_cached_tokens, output_tokens } }`
 *    — le champ `usage` est le resultat de `normalizeAnthropicUsage` (point
 *    4) applique a l'`usage` brut du corps de reponse, PAS une recopie
 *    directe (A4).
 *    `ContentBlock` = `{type:'text',text}` | `{type:'tool_use',id,name,
 *    input}` | `{type:'tool_result',tool_use_id,content,is_error?}` (L658).
 *    Classes de refus (toutes des `Error` avec un champ `.code`) :
 *      HTTP 429           -> `.code === 'RATE_LIMITED'`
 *      HTTP 401 (ou 403)  -> `.code === 'AUTHENTICATION_ERROR'`
 *      corps tronque/connexion coupee avant reception complete du corps
 *      declare (independant du code HTTP) -> `.code === 'TRUNCATED_RESPONSE'`
 *
 * 2. `normalizeAnthropicUsage(rawUsage)` -> `{ input_uncached_tokens,
 *    input_cached_tokens, output_tokens }` — PURE, aucune E/S. `rawUsage` a
 *    la forme publique du Messages API (L658) : `{ input_tokens,
 *    cache_creation_input_tokens?, cache_read_input_tokens?, output_tokens }`.
 *    `input_uncached_tokens = input_tokens` (deja disjoint des deux champs
 *    de cache cote fournisseur reel) ; `input_cached_tokens =
 *    cache_creation_input_tokens + cache_read_input_tokens` (les DEUX
 *    compteurs de cache, sommes — pas un seul) ; `output_tokens` recopie.
 *    AUCUN double comptage : un champ agrege eventuel (type `total_tokens`)
 *    n'est jamais lu par cette fonction (cahier:L103, F-MONEY, regle 2).
 *
 * 3. `validateAndNormalizeToolCall(toolDefs, block)` -> `{ name, args }` —
 *    PURE. `toolDefs` = tableau de `ToolDef` (point 4). `block` est un
 *    `ContentBlock` de type `tool_use`. Rejette (`Error`, `.code`) :
 *      nom absent de `toolDefs`                      -> `UNKNOWN_TOOL`
 *      `input` ne satisfait pas `input_schema` du nom
 *      trouve (champ requis absent, ou type incorrect
 *      pour un champ declare)                        -> `INVALID_TOOL_ARGUMENTS`
 *    N'EXECUTE RIEN — la validation est strictement separee de
 *    l'execution (point 4), condition necessaire pour qu'A3 puisse prouver
 *    le refus SANS toucher au sandbox.
 *
 * 4. Les trois `ToolDef` que L399 nomme (« lecture/ecriture/execution dans
 *    le sandbox »), FIXES PAR CETTE SUITE :
 *      `read_file`    { path: string }
 *      `write_file`   { path: string, content: string }
 *      `run_command`  { command: string }
 *    `executeToolInSandbox(sandboxHandle, name, args)` ->
 *    `Promise<{ content: string, is_error: boolean }>` — execute l'outil
 *    DEJA VALIDE dans le sandbox REEL via `sandboxHandle.execShell` (contrat
 *    deja fixe par acceptance/T19.spec.ts, repris tel quel) : `run_command`
 *    execute `args.command` ; `write_file` ecrit `args.content` au chemin
 *    `args.path` PUIS le rend relisible par `read_file` au meme chemin ;
 *    `read_file` rend le contenu du chemin `args.path`. `is_error:true` si
 *    la commande/le fichier echoue, SANS jeter (le refus de validation,
 *    lui, jette — point 3).
 *
 * 5. `dispatchAnthropicModelCall(handle, params, hooks?)` ->
 *    `Promise<{ model_call_id, status, cost?, usage?, response? }>` —
 *    DELEGUE a `dispatchModelCall` de `packages/gateway` (T17, meme
 *    signature exacte : `params = { model_call_id, idempotency_key,
 *    budget_id, reservation_id, provider, request, tariff }`, memes hooks
 *    `beforeDispatchStarted`/`afterDispatchStarted`/`afterProviderResponse`)
 *    avec `params.provider` un `AnthropicProvider` (point 1). C'est le
 *    point D'INTEGRATION que `packages/agents` possede et que cette suite
 *    nomme : le journal durable d'appel d'A6 N'EST PAS recontourne en
 *    appelant `provider.complete()` directement hors de ce chemin.
 *
 * Roles repris tels quels de `packages/storage` (T12, acceptance/T17.spec.ts) :
 * `applyMigrations`, `openStore`, `closeStore`. De `packages/billing` (T16,
 * idem) : `openBudget`, `reserveBudget`, `getBudgetState`. De
 * `packages/gateway` (T17, idem) : `getModelCall`. De `packages/sandbox`
 * (T19, acceptance/T19.spec.ts) : `buildSandboxProfile`, `provisionSandbox`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle n'exerce AUCUN fournisseur reseau reel (L15, L403, L649) —
 *    uniquement un serveur HTTP local que cette suite heberge et scripte
 *    elle-meme, jamais `api.anthropic.com`. `requires_live_credentials` de
 *    T28 vaut `false` (verification/tasks.json) : aucune assertion ici ne
 *    depend d'une cle reelle.
 *  • Elle n'exerce pas le contrat AgentRunner complet de T18
 *    (`start`/`observe`/`submit`/`stop`/`resume`) — ces fonctions sont deja
 *    prouvees par acceptance/T18.spec.ts, et aucun des sept cas de T28 ne
 *    nomme `session_id`. Le fait que « les autres connecteurs doivent
 *    satisfaire le meme contrat AgentRunner » (L399) est un objectif
 *    d'INTEGRATION du moteur, verifiable au jalon J5/l'integrateur, pas une
 *    clause que les sept cas d'acceptation de T28 chiffrent eux-memes.
 *  • Elle ne juge pas la resistance a toute panne reseau transitoire
 *    (timeouts, DNS, TLS) — seules les trois classes que L401 nomme (429,
 *    authentification, troncature) sont exercees.
 *  • A1, A2, A3, A4, A5 et A7 n'exercent pas PostgreSQL : ils appellent le
 *    connecteur et (pour A2/A7) le sandbox directement, sans passer par le
 *    journal durable de T17. Seul A6, qui verifie explicitement « perte de
 *    reponse respecte T17 », ouvre un budget PostgreSQL reel — meme
 *    discipline que acceptance/T18.spec.ts documente pour `s3` : une
 *    capacite heritee de la chaine de dependances n'est exercee bit a bit
 *    que par le cas qui la requiert reellement.
 *  • A1, A3, A4, A5, A6 n'exercent pas le sandbox reel (`containers.runc`/
 *    `containers.userns`) : seuls A2 et A7 provisionnent un sandbox, parce
 *    que ce sont les deux seuls cas dont l'enonce (L401) porte sur ce que le
 *    sandbox produit ou isole. `fake-provider` (sonde heritee de T17) n'est
 *    pas davantage exerce : cette suite construit son PROPRE serveur HTTP
 *    factice, parce que L401.A1 exige un « serveur HTTP » — une forme que
 *    `createFakeProvider` (objet en memoire, sans HTTP) ne fournit pas.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 180_000;

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

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

function codeDe(err: unknown): string | undefined {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    if (typeof code === 'string') return code;
  }
  if (typeof err === 'object' && err !== null) {
    const code = (err as Json).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

async function essayer<T>(
  thunk: () => T | Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

/** Ce qui n'est PAS un refus : un plantage (meme convention que T00/T16/T17). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|undefined is not/;

/* ═══════════════ les litteraux du cahier, et rien d'autre ══════════════ */

/** L99 : l'etat conservatif qu'A6 exige apres perte de reponse. */
const ETAT_UNKNOWN = 'UNKNOWN'; // cahier:L99

/** L303 (T17, delegation d'A6) : « un seul appel ». */
const UN_SEUL_APPEL = 1; // cahier:L303

/** Format d'un montant L80 valide (chaine d'entiers) ou entier JS non negatif. */
const FORMAT_MONTANT_L80 = /^[0-9]+$/; // cahier:L80
function interpretMontant(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string' && FORMAT_MONTANT_L80.test(v)) return Number.parseInt(v, 10);
  return null;
}

/** Codes de refus — FIXES PAR CETTE SUITE, le cahier ne les nomme pas (cf. II). */
const CODE_OUTIL_INCONNU = 'UNKNOWN_TOOL';
const CODE_ARGUMENTS_INVALIDES = 'INVALID_TOOL_ARGUMENTS';
const CODE_LIMITE_DEBIT = 'RATE_LIMITED';
const CODE_AUTHENTIFICATION = 'AUTHENTICATION_ERROR';
const CODE_REPONSE_TRONQUEE = 'TRUNCATED_RESPONSE';

/* ═════ §F : F-MONEY, la seule fixture maitresse que T28 consomme ═════════
 *
 * Racine GELEE apres T01 (L139, docs/FROZEN_ROOTS.json). La lecture ne LEVE
 * jamais au chargement du module ; les defauts sont collectes et ASSERTES par
 * `assertReferences()` dans chaque cas qui les consomme. Logique identique a
 * acceptance/T17.spec.ts, non reinventee.
 */

const RACINE_REFERENCE = path.join(REPO, 'acceptance', 'reference');
const DEFAUTS_REFERENCE: string[] = [];

function lireReference(nom: string): Json {
  try {
    const doc = JSON.parse(
      fs.readFileSync(path.join(RACINE_REFERENCE, `${nom}.json`), 'utf8'),
    ) as Json;
    if (doc.fixture !== nom) {
      DEFAUTS_REFERENCE.push(
        `FIXTURE-MAL-NOMMEE acceptance/reference/${nom}.json porte fixture=${rendu(doc.fixture)}`,
      );
    }
    return doc;
  } catch (e) {
    DEFAUTS_REFERENCE.push(
      `FIXTURE-ILLISIBLE acceptance/reference/${nom}.json : ${(e as Error).message}`,
    );
    return {};
  }
}

function scelle(doc: Json, nom: string, chemin: string): unknown {
  let cur: unknown = doc;
  for (const seg of `valeurs.${chemin}.valeur`.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      DEFAUTS_REFERENCE.push(`REFERENCE-CHEMIN-ABSENT ${nom} valeurs.${chemin}.valeur`);
      return undefined;
    }
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) {
    DEFAUTS_REFERENCE.push(`REFERENCE-VALEUR-ABSENTE ${nom} valeurs.${chemin}.valeur`);
  }
  return cur;
}

function entierScelle(doc: Json, nom: string, chemin: string): number {
  const v = scelle(doc, nom, chemin);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    DEFAUTS_REFERENCE.push(`REFERENCE-NON-ENTIERE ${nom} ${chemin} = ${rendu(v)}`);
    return Number.NaN;
  }
  return v;
}

const F_MONEY = lireReference('F-MONEY');

const F_TARIF_NON_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_non_cachee');
const F_TARIF_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.entree_cachee');
const F_TARIF_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'grille_tarifaire.sortie');

const F_USAGE_NON_CACHE = entierScelle(
  F_MONEY,
  'F-MONEY',
  'appel_de_reference.tokens_entree_non_caches',
);
const F_USAGE_CACHE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_entree_caches');
const F_USAGE_SORTIE = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.tokens_sortie');
const F_UN_APPEL = entierScelle(F_MONEY, 'F-MONEY', 'appel_de_reference.cout_attendu'); // 340

const F_TARIFF = {
  input_uncached_per_token: F_TARIF_NON_CACHE,
  input_cached_per_token: F_TARIF_CACHE,
  output_per_token: F_TARIF_SORTIE,
};

function assertReferences(): void {
  expect(
    DEFAUTS_REFERENCE.length === 0
      ? 'fixtures-de-reference-lisibles'
      : `FIXTURES-DE-REFERENCE-INEXPLOITABLES : ${DEFAUTS_REFERENCE.join(' | ')}`,
  ).toBe('fixtures-de-reference-lisibles'); // cahier:L139
  const calcule =
    F_USAGE_NON_CACHE * F_TARIF_NON_CACHE +
    F_USAGE_CACHE * F_TARIF_CACHE +
    F_USAGE_SORTIE * F_TARIF_SORTIE;
  expect(calcule).toBe(F_UN_APPEL); // cahier:L103
}

/* ══════════════════════════ PostgreSQL reel (requires: postgres18) ═══════
 * N'est ouvert QUE par A6 (cf. IV). Logique identique a acceptance/T17.spec.ts.
 */

const RUN = `t28_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();

const PG_USER = process.env.PGUSER ?? os.userInfo().username;

interface Psql {
  ok: boolean;
  out: string;
}

function psql(db: string, sql: string): Psql {
  try {
    const out = execFileSync(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql],
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
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
  expect(
    r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`,
  ).toBe('base-creee'); // cahier: requires postgres18 (verification/tasks.json T28)
  BASES_CREEES.push(nom);
  return nom;
}

/* ═══════════════ chargement des paquets declares par le registre ═══════ */

const PACKAGES = ['agents', 'gateway', 'billing', 'storage', 'sandbox'] as const;

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

function assertPackageLoaded(pkg: string): void {
  expect(
    LOADED.chargesPar.has(pkg)
      ? `packages/${pkg}-charge`
      : `PAQUET-NON-CHARGEABLE packages/${pkg} : ${LOADED.attempts.join(' | ')}`,
  ).toBe(`packages/${pkg}-charge`);
}

/* ─────────────────────────────────────────────── resolution par role */

type Fn = (...args: unknown[]) => unknown;

const ROLES: Record<string, readonly string[]> = {
  // packages/storage — repris tels quels de acceptance/T17.spec.ts.
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
  // packages/billing — repris tels quels de acceptance/T17.spec.ts.
  openBudget: [
    'openBudget', 'createBudget', 'initBudget', 'ensureBudget', 'openBudgetLedger',
    'createBudgetLedger',
  ],
  reserveBudget: [
    'reserveBudget', 'reserve', 'createReservation', 'requestReservation', 'reserveAmount',
  ],
  getBudgetState: [
    'getBudgetState', 'budgetState', 'readBudgetState', 'getBudget', 'budgetSnapshot', 'readBudget',
  ],
  // packages/gateway — repris tel quel de acceptance/T17.spec.ts.
  getModelCall: [
    'getModelCall', 'readModelCall', 'fetchModelCall', 'getCall', 'loadModelCall',
  ],
  // packages/sandbox — repris tels quels de acceptance/T19.spec.ts.
  buildSandboxProfile: [
    'buildSandboxProfile', 'createSandboxProfile', 'defineSandboxProfile', 'buildProfile',
  ],
  provisionSandbox: [
    'provisionSandbox', 'createSandbox', 'startSandbox', 'openSandbox',
  ],
  // packages/agents — FIXES PAR CETTE SUITE (section III ci-dessus).
  createAnthropicMessagesProvider: [
    'createAnthropicMessagesProvider', 'createAnthropicProvider', 'createAnthropicAdapter',
    'createAnthropicHttpProvider', 'createAnthropicClient', 'createMessagesProvider',
  ],
  normalizeAnthropicUsage: [
    'normalizeAnthropicUsage', 'normalizeUsage', 'normalizeModelUsage',
    'normalizeAnthropicModelUsage',
  ],
  validateAndNormalizeToolCall: [
    'validateAndNormalizeToolCall', 'validateToolCall', 'validateToolUse', 'normalizeToolCall',
  ],
  executeToolInSandbox: [
    'executeToolInSandbox', 'executeTool', 'runToolInSandbox', 'dispatchToolCall',
  ],
  dispatchAnthropicModelCall: [
    'dispatchAnthropicModelCall', 'dispatchAnthropicCall', 'dispatchRealModelCall',
    'dispatchAgentModelCall',
  ],
};

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
  expect(
    fn !== undefined ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fn;
}

/* ══════════════════════════ identifiants jetables ═══════════════════════ */

let compteur = 0;
function idFor(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${RUN}-${compteur}`;
}

/* ══════════════════════════ budget + storage (A6 seulement) ═════════════ */

const HANDLES_STORE: unknown[] = [];

async function ouvrirStore(suffixe: string): Promise<unknown> {
  const applyMigrations = requireRole('applyMigrations');
  const openStore = requireRole('openStore');
  const db = creerBase(suffixe);
  const dsn = dsnFor(db);
  const mig = await essayer(() => applyMigrations({ dsn }));
  expect(
    mig.ok ? 'migrations-appliquees' : `MIGRATIONS-EN-ECHEC ${messageDe((mig as { err: unknown }).err)}`,
  ).toBe('migrations-appliquees');
  const ouv = await essayer(() => openStore({ dsn }));
  expect(
    ouv.ok ? 'store-ouvert' : `OUVERTURE-STORE-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`,
  ).toBe('store-ouvert');
  const handle = (ouv as { ok: true; value: unknown }).value;
  HANDLES_STORE.push(handle);
  return handle;
}

async function preparerBudgetEtReservation(
  suffixe: string,
  montant = 500,
  limite = 10_000,
): Promise<{ handle: unknown; budgetId: string; reservationId: string }> {
  const handle = await ouvrirStore(suffixe);
  const openBudget = requireRole('openBudget');
  const reserveBudget = requireRole('reserveBudget');

  const budgetId = idFor('bud');
  const ouv = await essayer(() => openBudget(handle, { budget_id: budgetId, limit: limite }));
  expect(
    ouv.ok ? 'budget-ouvert' : `OUVERTURE-BUDGET-EN-ECHEC ${messageDe((ouv as { err: unknown }).err)}`,
  ).toBe('budget-ouvert');

  const r = await essayer(() => reserveBudget(handle, { budget_id: budgetId, amount: montant }));
  expect(
    r.ok ? 'reservation-acceptee' : `RESERVATION-EN-ECHEC ${messageDe((r as { err: unknown }).err)}`,
  ).toBe('reservation-acceptee');
  const val = (r as { ok: true; value: Json }).value;
  const reservationId = val.reservation_id as string | undefined;
  expect(
    typeof reservationId === 'string'
      ? 'reservation-a-son-identifiant'
      : `RESERVATION-SANS-IDENTIFIANT ${rendu(val)}`,
  ).toBe('reservation-a-son-identifiant');

  return { handle, budgetId, reservationId: reservationId as string };
}

async function lireDisponible(
  handle: unknown,
  budgetId: string,
): Promise<{ spent: number | null; reserved: number | null }> {
  const getBudgetState = requireRole('getBudgetState');
  const etat = await essayer(() => getBudgetState(handle, { budget_id: budgetId }));
  expect(etat.ok ? 'etat-lu' : `LECTURE-ETAT-EN-ECHEC ${messageDe((etat as { err: unknown }).err)}`).toBe(
    'etat-lu',
  );
  const e = (etat as { ok: true; value: Json }).value;
  return { spent: interpretMontant(e.spent), reserved: interpretMontant(e.reserved) };
}

afterAll(async () => {
  const closeStore = resolveRole('closeStore').fn;
  if (closeStore !== undefined) {
    for (const h of [...HANDLES_STORE]) {
      try {
        await closeStore(h);
      } catch {
        /* la fermeture n'est pas l'objet des assertions ; la base est de toute facon droppee. */
      }
    }
  }
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}, CASE_TIMEOUT_MS);

/* ══════════════════════════ sandbox reel (A2, A7 seulement) ═════════════ */

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  terminated: boolean;
  terminationReason: string | null;
}
interface SandboxHandleT28 {
  trajectoryId: string;
  execShell: (command: string, opts?: { timeoutMs?: number }) => Promise<ExecResult>;
  destroy: () => Promise<void>;
}

function assertSandboxHandleShape(h: unknown, contexte: string): SandboxHandleT28 {
  const o = h as Json | null;
  expect(
    typeof o?.execShell === 'function'
      ? `handle-${contexte}-conforme`
      : `HANDLE-NON-CONFORME ${contexte} : execShell manquant (recu : ${court(rendu(h))})`,
  ).toBe(`handle-${contexte}-conforme`);
  return h as SandboxHandleT28;
}

const HANDLES_SANDBOX_A_DETRUIRE: SandboxHandleT28[] = [];
const REPERTOIRES_A_SUPPRIMER: string[] = [];

async function provisionnerSandbox(suffixe: string): Promise<{ handle: SandboxHandleT28 }> {
  const buildSandboxProfile = requireRole('buildSandboxProfile');
  const provisionSandbox = requireRole('provisionSandbox');

  const trajectoryId = idFor(`traj-${suffixe}`);
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t28-ws-${suffixe}-`));
  REPERTOIRES_A_SUPPRIMER.push(workspaceDir);
  const sentinelDir = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t28-priv-${suffixe}-`));
  REPERTOIRES_A_SUPPRIMER.push(sentinelDir);
  const sentinelPath = path.join(sentinelDir, 'sentinel.txt');
  fs.writeFileSync(sentinelPath, 'sentinel-non-exploite-par-T28\n', 'utf8');

  const input = {
    trajectoryId,
    workspaceDir,
    memoryLimitBytes: 256 * 1024 * 1024,
    pidsMax: 256,
    allowedEgress: [],
    controlRepoRoot: REPO,
    privateSentinelPath: sentinelPath,
  };

  const profil = await essayer(() => buildSandboxProfile(input));
  expect(
    profil.ok ? 'profil-construit' : `PROFIL-EN-ECHEC ${messageDe((profil as { err: unknown }).err)}`,
  ).toBe('profil-construit');

  const handleRes = await essayer(() => provisionSandbox((profil as { ok: true; value: unknown }).value));
  expect(
    handleRes.ok
      ? 'sandbox-provisionne'
      : `PROVISIONNEMENT-EN-ECHEC ${messageDe((handleRes as { err: unknown }).err)}`,
  ).toBe('sandbox-provisionne');

  const handle = assertSandboxHandleShape(
    (handleRes as { ok: true; value: unknown }).value,
    `provision-${suffixe}`,
  );
  HANDLES_SANDBOX_A_DETRUIRE.push(handle);
  return { handle };
}

afterAll(async () => {
  for (const h of HANDLES_SANDBOX_A_DETRUIRE.splice(0)) {
    try {
      await h.destroy();
    } catch {
      /* deja detruit ou jamais provisionne correctement : ne bloque pas le nettoyage */
    }
  }
  for (const dir of REPERTOIRES_A_SUPPRIMER.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}, CASE_TIMEOUT_MS);

/* ══════════════════════ serveur HTTP Anthropic factice (§III.1) ═════════ */

interface RequeteRecue {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Json | null;
  bodyRaw: string;
}
interface ReponseScriptee {
  status: number;
  body?: Json;
  headers?: Record<string, string>;
  /** Si vrai : n'envoie qu'un PREFIXE du corps, Content-Length promettant le
   * corps ENTIER, puis detruit la socket — simule une reponse tronquee au
   * niveau transport, independamment du code HTTP (cf. III.1, A5). */
  tronquer?: boolean;
}
interface ServeurFactice {
  baseURL: string;
  requetes: RequeteRecue[];
  close: () => Promise<void>;
}

function demarrerServeurAnthropicFactice(
  repondre: (req: RequeteRecue, index: number) => ReponseScriptee,
): Promise<ServeurFactice> {
  return new Promise((resolve, reject) => {
    const requetes: RequeteRecue[] = [];
    let index = 0;
    const srv = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const bodyRaw = Buffer.concat(chunks).toString('utf8');
        let body: Json | null = null;
        try {
          body = bodyRaw.length > 0 ? (JSON.parse(bodyRaw) as Json) : null;
        } catch {
          body = null;
        }
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(',');
        }
        const recue: RequeteRecue = {
          method: req.method ?? '',
          url: req.url ?? '',
          headers,
          body,
          bodyRaw,
        };
        requetes.push(recue);
        const i = index;
        index += 1;
        let reponse: ReponseScriptee;
        try {
          reponse = repondre(recue, i);
        } catch (e) {
          reponse = {
            status: 500,
            body: { type: 'error', error: { message: String((e as Error).message) } },
          };
        }
        const payload = JSON.stringify(reponse.body ?? {});
        if (reponse.tronquer === true) {
          // Le statut et les en-tetes sont recus NORMALEMENT (le client voit
          // un 200) ; seule la LECTURE DU CORPS echoue, Content-Length
          // promettant plus d'octets que ce qui est reellement envoye avant
          // destruction de la socket — simule une troncature au niveau
          // transport, distincte d'un refus de connexion precoce.
          const prefixe = payload.slice(0, Math.max(1, Math.floor(payload.length / 3)));
          res.writeHead(reponse.status, {
            'content-type': 'application/json',
            'content-length': String(payload.length),
          });
          res.write(prefixe, () => {
            setTimeout(() => res.socket?.destroy(), 20);
          });
          return;
        }
        res.writeHead(reponse.status, {
          'content-type': 'application/json',
          ...(reponse.headers ?? {}),
        });
        res.end(payload);
      });
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('serveur Anthropic factice : adresse invalide'));
        return;
      }
      resolve({
        baseURL: `http://127.0.0.1:${addr.port}`,
        requetes,
        close: () => new Promise((res2) => srv.close(() => res2())),
      });
    });
  });
}

const SERVEURS_A_FERMER: ServeurFactice[] = [];

afterAll(async () => {
  for (const s of SERVEURS_A_FERMER.splice(0)) {
    try {
      await s.close();
    } catch {
      /* ignore */
    }
  }
}, CASE_TIMEOUT_MS);

/* ══════════════════ outils fixes par cette suite (§III.4) ════════════════ */

interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, { type: string }>; required: string[] };
}

const TOOL_READ_FILE: ToolDef = {
  name: 'read_file',
  description: 'Lit un fichier du workspace candidat.',
  input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
};
const TOOL_WRITE_FILE: ToolDef = {
  name: 'write_file',
  description: 'Ecrit un fichier du workspace candidat.',
  input_schema: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content'],
  },
};
const TOOL_RUN_COMMAND: ToolDef = {
  name: 'run_command',
  description: 'Execute une commande shell dans le sandbox candidat.',
  input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
};
const TOOL_DEFS: ToolDef[] = [TOOL_READ_FILE, TOOL_WRITE_FILE, TOOL_RUN_COMMAND];

/* ══════════════════════ forme des types du connecteur (§III.1) ══════════ */

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Json }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface AnthropicRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }>;
  tools?: ToolDef[];
}
interface NormalizedUsage {
  input_uncached_tokens: number;
  input_cached_tokens: number;
  output_tokens: number;
}
interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string;
  usage: NormalizedUsage;
}
interface AnthropicProvider {
  complete: (request: AnthropicRequest) => Promise<AnthropicResponse>;
}

/* ══════════════════════════════ T28.A1 ══════════════════════════════════ */

test(
  'T28.A1 — serveur HTTP factice conforme au contrat recoit la bonne requete',
  async () => {
    assertPackageLoaded('agents');
    const createAnthropicMessagesProvider = requireRole('createAnthropicMessagesProvider');

    const apiKey = `sk-test-${idFor('key')}`;
    const model = `bench-sentinel-model-${idFor('model')}`; // L397 : pas d'identifiant invente
    const maxTokens = 512;

    const serveur = await demarrerServeurAnthropicFactice(() => ({
      status: 200,
      body: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'bonjour' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 },
      },
    }));
    SERVEURS_A_FERMER.push(serveur);

    const provider = await essayer(() =>
      createAnthropicMessagesProvider({ baseURL: serveur.baseURL, apiKey, model, maxTokens }),
    );
    expect(
      provider.ok ? 'fournisseur-cree' : `FOURNISSEUR-EN-ECHEC ${messageDe((provider as { err: unknown }).err)}`,
    ).toBe('fournisseur-cree');
    const prov = (provider as { ok: true; value: AnthropicProvider }).value;

    const requete: AnthropicRequest = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'ping-A1' }] }],
      tools: TOOL_DEFS,
    };
    const res = await essayer(() => prov.complete(requete));
    expect(res.ok ? 'completion-reussie' : `COMPLETION-EN-ECHEC ${messageDe((res as { err: unknown }).err)}`).toBe(
      'completion-reussie',
    );

    expect(
      serveur.requetes.length === UN_SEUL_APPEL
        ? 'une-seule-requete-recue'
        : `NOMBRE-DE-REQUETES-INATTENDU ${serveur.requetes.length}`,
    ).toBe('une-seule-requete-recue');
    const recue = serveur.requetes[0];

    expect(recue.method).toBe('POST');
    expect(recue.url).toBe('/v1/messages');
    expect(
      recue.headers['x-api-key'] === apiKey
        ? 'cle-transmise'
        : `CLE-NON-TRANSMISE ${rendu(recue.headers['x-api-key'])}`,
    ).toBe('cle-transmise');
    expect(
      recue.body !== null && recue.body.model === model
        ? 'modele-conforme-a-la-configuration'
        : `MODELE-INVENTE-OU-ABSENT recu=${rendu(recue.body?.model)} attendu=${rendu(model)}`,
    ).toBe('modele-conforme-a-la-configuration'); // cahier:L397
    expect(
      recue.body !== null && recue.body.max_tokens === maxTokens
        ? 'max-tokens-conforme'
        : `MAX-TOKENS-NON-CONFORME ${rendu(recue.body?.max_tokens)}`,
    ).toBe('max-tokens-conforme');
    expect(
      recue.body !== null && rendu(recue.body.messages) === rendu(requete.messages)
        ? 'messages-fideles'
        : `MESSAGES-ALTERES ${rendu(recue.body?.messages)}`,
    ).toBe('messages-fideles');

    const toolsEnvoyes = (recue.body?.tools as Json[] | undefined) ?? [];
    const nomsEnvoyes = toolsEnvoyes.map((t) => (t as Json).name).sort();
    const nomsAttendus = TOOL_DEFS.map((t) => t.name).sort();
    expect(
      rendu(nomsEnvoyes) === rendu(nomsAttendus)
        ? 'outils-transmis'
        : `OUTILS-NON-TRANSMIS recu=${rendu(nomsEnvoyes)} attendu=${rendu(nomsAttendus)}`,
    ).toBe('outils-transmis');
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T28.A2 ══════════════════════════════════ */

test(
  "T28.A2 — reponse avec appel d'outil validee, executee dans le sandbox, renvoyee au modele",
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('sandbox');
    const createAnthropicMessagesProvider = requireRole('createAnthropicMessagesProvider');
    const validateAndNormalizeToolCall = requireRole('validateAndNormalizeToolCall');
    const executeToolInSandbox = requireRole('executeToolInSandbox');

    const { handle } = await provisionnerSandbox('a2');
    const sentinel = `T28-A2-SENTINEL-${idFor('sentinel')}`;

    const serveur = await demarrerServeurAnthropicFactice((req, index) => {
      if (index === 0) {
        return {
          status: 200,
          body: {
            id: 'msg_1',
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'call_1', name: 'run_command', input: { command: `echo ${sentinel}` } },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 8 },
          },
        };
      }
      // Deuxieme requete : verifie que le resultat REELLEMENT produit par le
      // sandbox est bien revenu au modele, pas un canevas fabrique par un
      // export stube (mutant nomme par cases.lock.json pour A2).
      const body = req.body ?? {};
      const messages = (body.messages as Json[] | undefined) ?? [];
      const dernier = (messages[messages.length - 1] ?? {}) as Json;
      const blocs = (dernier.content as Json[] | undefined) ?? [];
      const toolResultBlock = blocs.find((b) => (b as Json).type === 'tool_result') as Json | undefined;
      const contenuRecu = toolResultBlock !== undefined ? String((toolResultBlock as Json).content ?? '') : '';
      return {
        status: 200,
        body: {
          id: 'msg_2',
          role: 'assistant',
          content: [
            { type: 'text', text: contenuRecu.includes(sentinel) ? 'termine-avec-sentinel' : 'termine-SANS-sentinel' },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 2 },
        },
      };
    });
    SERVEURS_A_FERMER.push(serveur);

    const provider = await essayer(() =>
      createAnthropicMessagesProvider({
        baseURL: serveur.baseURL,
        apiKey: `sk-${idFor('key')}`,
        model: `m-${idFor('model')}`,
        maxTokens: 256,
      }),
    );
    expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
    const prov = (provider as { ok: true; value: AnthropicProvider }).value;

    const premiereRequete: AnthropicRequest = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'execute la commande demandee' }] }],
      tools: TOOL_DEFS,
    };
    const premiere = await essayer(() => prov.complete(premiereRequete));
    expect(
      premiere.ok
        ? 'premiere-completion-reussie'
        : `PREMIERE-COMPLETION-EN-ECHEC ${messageDe((premiere as { err: unknown }).err)}`,
    ).toBe('premiere-completion-reussie');
    const reponse1 = (premiere as { ok: true; value: AnthropicResponse }).value;

    const toolUseBlock = reponse1.content.find((b) => b.type === 'tool_use');
    expect(
      toolUseBlock !== undefined ? 'bloc-tool-use-present' : `BLOC-TOOL-USE-ABSENT ${rendu(reponse1.content)}`,
    ).toBe('bloc-tool-use-present');
    const bloc = toolUseBlock as { type: 'tool_use'; id: string; name: string; input: Json };

    const valide = await essayer(() => validateAndNormalizeToolCall(TOOL_DEFS, bloc));
    expect(
      valide.ok ? 'validation-reussie' : `VALIDATION-EN-ECHEC ${messageDe((valide as { err: unknown }).err)}`,
    ).toBe('validation-reussie');
    const { name, args } = (valide as { ok: true; value: { name: string; args: Json } }).value;

    const resultat = await essayer(() => executeToolInSandbox(handle, name, args));
    expect(
      resultat.ok ? 'execution-reussie' : `EXECUTION-EN-ECHEC ${messageDe((resultat as { err: unknown }).err)}`,
    ).toBe('execution-reussie');
    const toolResult = (resultat as { ok: true; value: { content: string; is_error: boolean } }).value;
    expect(toolResult.is_error).toBe(false);
    expect(
      toolResult.content.includes(sentinel)
        ? 'sentinel-produit-par-le-sandbox'
        : `SENTINEL-ABSENT-DU-RESULTAT ${court(toolResult.content)}`,
    ).toBe('sentinel-produit-par-le-sandbox');

    const deuxiemeRequete: AnthropicRequest = {
      messages: [
        ...premiereRequete.messages,
        { role: 'assistant', content: reponse1.content },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: bloc.id, content: toolResult.content, is_error: toolResult.is_error },
          ],
        },
      ],
      tools: TOOL_DEFS,
    };
    const deuxieme = await essayer(() => prov.complete(deuxiemeRequete));
    expect(
      deuxieme.ok
        ? 'deuxieme-completion-reussie'
        : `DEUXIEME-COMPLETION-EN-ECHEC ${messageDe((deuxieme as { err: unknown }).err)}`,
    ).toBe('deuxieme-completion-reussie');
    const reponse2 = (deuxieme as { ok: true; value: AnthropicResponse }).value;
    const texte = reponse2.content.find((b) => b.type === 'text');
    expect(
      texte !== undefined && (texte as { type: 'text'; text: string }).text === 'termine-avec-sentinel'
        ? 'boucle-complete-avec-sentinel'
        : `BOUCLE-INCOMPLETE ${rendu(reponse2.content)}`,
    ).toBe('boucle-complete-avec-sentinel'); // L'ASSERTION DECISIVE
    expect(
      serveur.requetes.length === 2 ? 'deux-requetes-recues' : `NOMBRE-DE-REQUETES-INATTENDU ${serveur.requetes.length}`,
    ).toBe('deux-requetes-recues');
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T28.A3 ══════════════════════════════════ */

test(
  'T28.A3 — outil inconnu ou arguments invalides refuses',
  async () => {
    assertPackageLoaded('agents');
    const validateAndNormalizeToolCall = requireRole('validateAndNormalizeToolCall');

    // CONTROLE POSITIF (necessaire pour un cas `refusal`, cf. cases.lock.json :
    // un stub qui leve inconditionnellement laisserait ce cas vert a tort).
    const valide = await essayer(() =>
      validateAndNormalizeToolCall(TOOL_DEFS, {
        type: 'tool_use',
        id: 'ctrl',
        name: 'run_command',
        input: { command: 'echo ok' },
      }),
    );
    expect(
      valide.ok
        ? 'appel-legitime-accepte'
        : `APPEL-LEGITIME-A-TORT-REFUSE ${messageDe((valide as { err: unknown }).err)}`,
    ).toBe('appel-legitime-accepte');

    // PRINCIPAL (1) : nom d'outil absent de toolDefs.
    const inconnu = await essayer(() =>
      validateAndNormalizeToolCall(TOOL_DEFS, {
        type: 'tool_use',
        id: 'c1',
        name: 'delete_everything',
        input: {},
      }),
    );
    expect(
      inconnu.ok ? `OUTIL-INCONNU-A-TORT-ACCEPTE ${rendu((inconnu as { value: unknown }).value)}` : 'outil-inconnu-refuse',
    ).toBe('outil-inconnu-refuse');
    if (!inconnu.ok) {
      const err = (inconnu as { err: unknown }).err;
      expect(
        MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
      ).toBe('refus-authentique');
      expect(
        codeDe(err) === CODE_OUTIL_INCONNU ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(codeDe(err))}`,
      ).toBe('code-conforme');
    }

    // PRINCIPAL (2) : argument requis absent.
    const manquant = await essayer(() =>
      validateAndNormalizeToolCall(TOOL_DEFS, { type: 'tool_use', id: 'c2', name: 'run_command', input: {} }),
    );
    expect(
      manquant.ok
        ? `ARGUMENT-MANQUANT-A-TORT-ACCEPTE ${rendu((manquant as { value: unknown }).value)}`
        : 'argument-manquant-refuse',
    ).toBe('argument-manquant-refuse');
    if (!manquant.ok) {
      const err = (manquant as { err: unknown }).err;
      expect(
        MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
      ).toBe('refus-authentique');
      expect(
        codeDe(err) === CODE_ARGUMENTS_INVALIDES ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(codeDe(err))}`,
      ).toBe('code-conforme');
    }

    // PRINCIPAL (3) : argument de type incorrect.
    const typeInvalide = await essayer(() =>
      validateAndNormalizeToolCall(TOOL_DEFS, {
        type: 'tool_use',
        id: 'c3',
        name: 'run_command',
        input: { command: 12345 },
      }),
    );
    expect(
      typeInvalide.ok
        ? `ARGUMENT-TYPE-INVALIDE-A-TORT-ACCEPTE ${rendu((typeInvalide as { value: unknown }).value)}`
        : 'argument-type-invalide-refuse',
    ).toBe('argument-type-invalide-refuse');
    if (!typeInvalide.ok) {
      const err = (typeInvalide as { err: unknown }).err;
      expect(
        MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
      ).toBe('refus-authentique');
      expect(
        codeDe(err) === CODE_ARGUMENTS_INVALIDES ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(codeDe(err))}`,
      ).toBe('code-conforme');
    }
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T28.A4 ══════════════════════════════════ */

test(
  'T28.A4 — usage/cache normalises sans double comptage',
  async () => {
    assertReferences();
    assertPackageLoaded('agents');
    const normalizeAnthropicUsage = requireRole('normalizeAnthropicUsage');

    function coutDe(u: Json): number {
      return (
        (interpretMontant(u.input_uncached_tokens) ?? Number.NaN) * F_TARIF_NON_CACHE +
        (interpretMontant(u.input_cached_tokens) ?? Number.NaN) * F_TARIF_CACHE +
        (interpretMontant(u.output_tokens) ?? Number.NaN) * F_TARIF_SORTIE
      );
    }

    // Probe 1 : tout le cache dans cache_creation_input_tokens.
    const raw1 = {
      input_tokens: F_USAGE_NON_CACHE,
      cache_creation_input_tokens: F_USAGE_CACHE,
      cache_read_input_tokens: 0,
      output_tokens: F_USAGE_SORTIE,
    };
    const n1 = await essayer(() => normalizeAnthropicUsage(raw1));
    expect(
      n1.ok ? 'normalisation-1-reussie' : `NORMALISATION-1-EN-ECHEC ${messageDe((n1 as { err: unknown }).err)}`,
    ).toBe('normalisation-1-reussie');
    const u1 = (n1 as { ok: true; value: Json }).value;
    expect(interpretMontant(u1.input_uncached_tokens)).toBe(F_USAGE_NON_CACHE);
    expect(interpretMontant(u1.input_cached_tokens)).toBe(F_USAGE_CACHE);
    expect(interpretMontant(u1.output_tokens)).toBe(F_USAGE_SORTIE);
    expect(coutDe(u1)).toBe(F_UN_APPEL); // cahier:L103 (340) — sans double comptage

    // Probe 2 : cache reparti entre creation et lecture, MEME SOMME — piege
    // d'une implementation qui ne lirait qu'un seul des deux champs de cache
    // reels de l'API (cahier:L658, forme publique du Messages API).
    const creation = Math.floor(F_USAGE_CACHE / 2);
    const lecture = F_USAGE_CACHE - creation;
    const raw2 = {
      input_tokens: F_USAGE_NON_CACHE,
      cache_creation_input_tokens: creation,
      cache_read_input_tokens: lecture,
      output_tokens: F_USAGE_SORTIE,
    };
    const n2 = await essayer(() => normalizeAnthropicUsage(raw2));
    expect(
      n2.ok ? 'normalisation-2-reussie' : `NORMALISATION-2-EN-ECHEC ${messageDe((n2 as { err: unknown }).err)}`,
    ).toBe('normalisation-2-reussie');
    const u2 = (n2 as { ok: true; value: Json }).value;
    expect(interpretMontant(u2.input_uncached_tokens)).toBe(F_USAGE_NON_CACHE);
    expect(interpretMontant(u2.input_cached_tokens)).toBe(F_USAGE_CACHE); // creation+lecture, pas un seul champ
    expect(interpretMontant(u2.output_tokens)).toBe(F_USAGE_SORTIE);
    expect(coutDe(u2)).toBe(F_UN_APPEL);
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T28.A5 ══════════════════════════════════ */

test(
  'T28.A5 — erreurs 429, authentification et reponse tronquee classees correctement',
  async () => {
    assertPackageLoaded('agents');
    const createAnthropicMessagesProvider = requireRole('createAnthropicMessagesProvider');

    const requeteSimple: AnthropicRequest = { messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }] };

    async function creerProvider(serveur: ServeurFactice): Promise<AnthropicProvider> {
      const provider = await essayer(() =>
        createAnthropicMessagesProvider({
          baseURL: serveur.baseURL,
          apiKey: `sk-${idFor('key')}`,
          model: `m-${idFor('model')}`,
          maxTokens: 64,
        }),
      );
      expect(
        provider.ok ? 'fournisseur-cree' : `FOURNISSEUR-EN-ECHEC ${messageDe((provider as { err: unknown }).err)}`,
      ).toBe('fournisseur-cree');
      return (provider as { ok: true; value: AnthropicProvider }).value;
    }

    // CONTROLE POSITIF : une reponse normale n'est pas refusee — SANS ce
    // controle, une implementation qui leve TOUJOURS verdirait les trois
    // cas principaux a tort (cases.lock.json : « un stub qui leve
    // produirait aussi une erreur et laisserait le cas vert »).
    const serveurOk = await demarrerServeurAnthropicFactice(() => ({
      status: 200,
      body: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
    }));
    SERVEURS_A_FERMER.push(serveurOk);
    const provOk = await creerProvider(serveurOk);
    const ok = await essayer(() => provOk.complete(requeteSimple));
    expect(
      ok.ok ? 'reponse-normale-acceptee' : `REPONSE-NORMALE-A-TORT-REFUSEE ${messageDe((ok as { err: unknown }).err)}`,
    ).toBe('reponse-normale-acceptee');

    // Chaque scenario d'erreur a SON PROPRE serveur, qui repond IDENTIQUEMENT
    // a chaque requete recue — robuste a une politique de retry interne du
    // connecteur (le SDK officiel retente par defaut sur 429/5xx ; indexer un
    // seul script partage serait donc fragile a ce nombre de tentatives).
    const serveur429 = await demarrerServeurAnthropicFactice(() => ({
      status: 429,
      body: { type: 'error', error: { type: 'rate_limit_error', message: 'trop de requetes' } },
    }));
    SERVEURS_A_FERMER.push(serveur429);
    const prov429 = await creerProvider(serveur429);
    const limite = await essayer(() => prov429.complete(requeteSimple));
    expect(limite.ok ? `429-A-TORT-ACCEPTE ${rendu((limite as { value: unknown }).value)}` : 'limite-refusee').toBe(
      'limite-refusee',
    );
    if (!limite.ok) {
      const err = (limite as { err: unknown }).err;
      expect(
        MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
      ).toBe('refus-authentique');
      expect(
        codeDe(err) === CODE_LIMITE_DEBIT ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(codeDe(err))}`,
      ).toBe('code-conforme');
    }

    const serveur401 = await demarrerServeurAnthropicFactice(() => ({
      status: 401,
      body: { type: 'error', error: { type: 'authentication_error', message: 'cle invalide' } },
    }));
    SERVEURS_A_FERMER.push(serveur401);
    const prov401 = await creerProvider(serveur401);
    const auth = await essayer(() => prov401.complete(requeteSimple));
    expect(
      auth.ok ? `401-A-TORT-ACCEPTE ${rendu((auth as { value: unknown }).value)}` : 'authentification-refusee',
    ).toBe('authentification-refusee');
    if (!auth.ok) {
      const err = (auth as { err: unknown }).err;
      expect(
        MARQUEURS_DE_PLANTAGE.test(messageDe(err)) ? `PLANTAGE-PAS-UN-REFUS ${messageDe(err)}` : 'refus-authentique',
      ).toBe('refus-authentique');
      expect(
        codeDe(err) === CODE_AUTHENTIFICATION ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(codeDe(err))}`,
      ).toBe('code-conforme');
    }

    const serveurTronque = await demarrerServeurAnthropicFactice(() => ({
      status: 200,
      tronquer: true,
      body: {
        content: [{ type: 'text', text: 'x'.repeat(2000) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    }));
    SERVEURS_A_FERMER.push(serveurTronque);
    const provTronque = await creerProvider(serveurTronque);
    const tronque = await essayer(() => provTronque.complete(requeteSimple));
    expect(
      tronque.ok ? `REPONSE-TRONQUEE-A-TORT-ACCEPTEE ${rendu((tronque as { value: unknown }).value)}` : 'troncature-refusee',
    ).toBe('troncature-refusee');
    if (!tronque.ok) {
      const err = (tronque as { err: unknown }).err;
      expect(
        codeDe(err) === CODE_REPONSE_TRONQUEE ? 'code-conforme' : `CODE-NON-CONFORME ${rendu(codeDe(err))}`,
      ).toBe('code-conforme');
    }
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T28.A6 ══════════════════════════════════ */

test(
  'T28.A6 — perte de reponse respecte T17 (UNKNOWN, un seul appel, reservation maintenue)',
  async () => {
    assertReferences();
    assertPackageLoaded('agents');
    assertPackageLoaded('gateway');
    assertPackageLoaded('billing');
    assertPackageLoaded('storage');

    const { handle, budgetId, reservationId } = await preparerBudgetEtReservation('a6');
    const createAnthropicMessagesProvider = requireRole('createAnthropicMessagesProvider');
    const dispatchAnthropicModelCall = requireRole('dispatchAnthropicModelCall');

    const avant = await lireDisponible(handle, budgetId);

    const serveur = await demarrerServeurAnthropicFactice(() => ({
      status: 200,
      body: {
        content: [{ type: 'text', text: 'reponse-modele' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: F_USAGE_NON_CACHE,
          cache_creation_input_tokens: F_USAGE_CACHE,
          cache_read_input_tokens: 0,
          output_tokens: F_USAGE_SORTIE,
        },
      },
    }));
    SERVEURS_A_FERMER.push(serveur);

    const provider = await essayer(() =>
      createAnthropicMessagesProvider({
        baseURL: serveur.baseURL,
        apiKey: `sk-${idFor('key')}`,
        model: `m-${idFor('model')}`,
        maxTokens: 64,
      }),
    );
    expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
    const prov = (provider as { ok: true; value: AnthropicProvider }).value;

    const params = {
      model_call_id: idFor('call'),
      idempotency_key: idFor('idem'),
      budget_id: budgetId,
      reservation_id: reservationId,
      provider: prov,
      request: { messages: [{ role: 'user', content: [{ type: 'text', text: 'A6' }] }] },
      tariff: F_TARIFF,
    };

    // La panne survient APRES que le connecteur reel a recu la reponse HTTP
    // (donc "facture", par la meme discipline que T17.A2) et AVANT sa
    // sauvegarde — la reponse est PERDUE au sens de cahier:L69.
    const panne = await essayer(() =>
      dispatchAnthropicModelCall(handle, params, {
        afterProviderResponse: () => {
          throw new Error('panne simulee : reponse recue, non sauvegardee');
        },
      }),
    );
    expect(panne.ok ? `DISPATCH-A-TORT-REUSSI ${rendu((panne as { value: unknown }).value)}` : 'panne-observee').toBe(
      'panne-observee',
    );
    expect(
      serveur.requetes.length === UN_SEUL_APPEL
        ? 'une-seule-requete-recue'
        : `NOMBRE-DE-REQUETES-INATTENDU ${serveur.requetes.length}`,
    ).toBe('une-seule-requete-recue');

    // A LA REPRISE : rappeler la meme operation ne doit ni recontacter le
    // serveur HTTP, ni resoudre a tort en SETTLED/FAILED. Elle doit rendre
    // UNKNOWN (cahier:L99, par delegation a T17.A2/A6).
    const reprise = await essayer(() => dispatchAnthropicModelCall(handle, params));
    expect(
      reprise.ok ? 'reprise-executee' : `REPRISE-EN-ECHEC ${messageDe((reprise as { err: unknown }).err)}`,
    ).toBe('reprise-executee');
    const statutReprise = (reprise as { ok: true; value: Json }).value.status;
    expect(statutReprise).toBe(ETAT_UNKNOWN); // cahier:L99
    expect(
      serveur.requetes.length === UN_SEUL_APPEL
        ? 'pas-relance-aveuglement'
        : `RELANCE-AVEUGLE requetes=${serveur.requetes.length}`,
    ).toBe('pas-relance-aveuglement'); // cahier:L69

    // La reservation reste MAINTENUE : ni reglee (spent inchange), ni liberee
    // (reserved inchange) — cahier:L67.
    const apres = await lireDisponible(handle, budgetId);
    expect(apres.spent).toBe(avant.spent);
    expect(apres.reserved).toBe(avant.reserved);
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T28.A7 ══════════════════════════════════ */

test(
  'T28.A7 — aucune cle dans le sandbox ni dans les traces publiables',
  async () => {
    assertPackageLoaded('agents');
    assertPackageLoaded('sandbox');
    const createAnthropicMessagesProvider = requireRole('createAnthropicMessagesProvider');
    const executeToolInSandbox = requireRole('executeToolInSandbox');

    const { handle } = await provisionnerSandbox('a7');
    const apiKeySentinel = `sk-SECRET-SENTINEL-${idFor('key')}`;

    const serveur = await demarrerServeurAnthropicFactice(() => ({
      status: 200,
      body: {
        content: [
          { type: 'tool_use', id: 'call_1', name: 'run_command', input: { command: 'echo verification-a7' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 3, output_tokens: 2 },
      },
    }));
    SERVEURS_A_FERMER.push(serveur);

    const provider = await essayer(() =>
      createAnthropicMessagesProvider({
        baseURL: serveur.baseURL,
        apiKey: apiKeySentinel,
        model: `m-${idFor('model')}`,
        maxTokens: 64,
      }),
    );
    expect(provider.ok ? 'fournisseur-cree' : 'FOURNISSEUR-EN-ECHEC').toBe('fournisseur-cree');
    const prov = (provider as { ok: true; value: AnthropicProvider }).value;

    const requete: AnthropicRequest = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'A7' }] }],
      tools: TOOL_DEFS,
    };
    const rep1 = await essayer(() => prov.complete(requete));
    expect(rep1.ok ? 'completion-reussie' : `COMPLETION-EN-ECHEC ${messageDe((rep1 as { err: unknown }).err)}`).toBe(
      'completion-reussie',
    );
    const reponse1 = (rep1 as { ok: true; value: AnthropicResponse }).value;
    const toolUse = reponse1.content.find((b) => b.type === 'tool_use') as
      | { type: 'tool_use'; id: string; name: string; input: Json }
      | undefined;
    expect(toolUse !== undefined ? 'bloc-tool-use-present' : `BLOC-TOOL-USE-ABSENT ${rendu(reponse1.content)}`).toBe(
      'bloc-tool-use-present',
    );

    const execRes = await essayer(() =>
      executeToolInSandbox(handle, (toolUse as { name: string }).name, (toolUse as { input: Json }).input),
    );
    expect(
      execRes.ok ? 'execution-reussie' : `EXECUTION-EN-ECHEC ${messageDe((execRes as { err: unknown }).err)}`,
    ).toBe('execution-reussie');

    // PRINCIPAL (1) : la cle n'apparait nulle part dans l'environnement du
    // sandbox candidat (cahier:L321, T19 : « pas de cles fournisseurs »).
    const env = await essayer(() => handle.execShell('env; echo FIN-ENV-A7'));
    expect(
      env.ok ? 'lecture-env-reussie' : `LECTURE-ENV-EN-ECHEC ${messageDe((env as { err: unknown }).err)}`,
    ).toBe('lecture-env-reussie');
    const sortieEnv = (env as { ok: true; value: ExecResult }).value.stdout;
    // CONTROLE : le sandbox repond reellement — sans lui, l'absence ci-dessous
    // serait vide de sens (un sandbox inerte la satisferait par accident).
    expect(
      sortieEnv.includes('FIN-ENV-A7') ? 'sandbox-fonctionnel' : 'SANDBOX-NE-REPOND-PAS — controle non concluant',
    ).toBe('sandbox-fonctionnel');
    expect(
      !sortieEnv.includes(apiKeySentinel)
        ? 'cle-absente-du-sandbox'
        : `CLE-PRESENTE-DANS-LE-SANDBOX ${court(sortieEnv)}`,
    ).toBe('cle-absente-du-sandbox');

    // PRINCIPAL (2) : la cle n'apparait pas dans le CORPS JSON de la requete
    // emise au fournisseur — le header de transport la porte legitimement
    // (c'est le canal d'authentification attendu, pas une trace publiable) ;
    // seul le corps, candidat a etre journalise ou exporte, est inspecte ici.
    expect(serveur.requetes.length > 0 ? 'au-moins-une-requete' : 'AUCUNE-REQUETE-RECUE').toBe('au-moins-une-requete');
    for (const r of serveur.requetes) {
      expect(
        !r.bodyRaw.includes(apiKeySentinel)
          ? 'cle-absente-du-corps'
          : `CLE-PRESENTE-DANS-LE-CORPS ${court(r.bodyRaw)}`,
      ).toBe('cle-absente-du-corps');
    }

    // PRINCIPAL (3) : le resultat d'outil renvoye (ce qui alimenterait une
    // trace de boucle publiable) ne contient pas la cle.
    const toolResult = (execRes as { ok: true; value: { content: string } }).value;
    expect(
      !toolResult.content.includes(apiKeySentinel)
        ? 'cle-absente-du-resultat-outil'
        : 'CLE-PRESENTE-DANS-LE-RESULTAT-OUTIL',
    ).toBe('cle-absente-du-resultat-outil');
  },
  CASE_TIMEOUT_MS,
);
