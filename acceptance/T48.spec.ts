/**
 * acceptance/T48.spec.ts — suite d'acceptation de la tache T48.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T48.A1 behaviour — la periode k+1 d'une trajectoire part EXACTEMENT du
 *                      commit sauvegarde a la fin de la periode k, relu
 *                      depuis l'etat PERSISTANT (jamais depuis ce qui se
 *                      trouve, par accident ou corruption, sur le disque)
 *   T48.A2 absence   — deux trajectoires ne partagent ni espace de travail
 *                      ni commit ecrit pendant une periode
 *   T48.A3 behaviour — une application de reference respectant le contrat,
 *                      exercee par le moteur, obtient EXACTEMENT les memes
 *                      statuts de controle que l'application scriptee sur
 *                      le meme scenario
 *   T48.A4 refusal   — un candidat qui ne demarre pas, ne repond pas dans
 *                      le delai ou viole le format du contrat est declare
 *                      NON DEPLOYE avec un motif nomme, SANS que la periode
 *                      elle-meme echoue
 *   T48.A5 behaviour — la sonde d'annulation ne modifie pas l'etat du
 *                      candidat, constate par son empreinte avant et apres
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T48 EST UNE TACHE D'EXTENSION (ADR-008) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T48 — `packages/scenario`
 * et `packages/activities` — et ne les a lus ni directement ni par
 * `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, pas une barriere technique). Le contrat teste ci-dessous est derive
 * de docs/specs/T48.md et de sa source, docs/adr/ADR-008-candidat-reel-par-
 * session-claude-p.md, lignes 139 a 145 (la plage que la carte de T48
 * epingle) ET du paragraphe de decision qui la motive (meme document,
 * lignes 86-94, cite verbatim plus bas) :
 *
 *   L139  titre : « Donner au candidat un espace de travail et un contrat
 *         d'application »
 *   L141  dependances T11 et T23 ; livrables, mot pour mot : « un depot git
 *         par trajectoire, restaure au debut de chaque periode depuis
 *         l'etat persistant et sauvegarde a la fin ; un contrat
 *         d'application par lequel le moteur lance le code du candidat
 *         comme un processus et l'exerce avec les operations de
 *         l'application scriptee ; un adaptateur qui presente ce processus
 *         aux controles existants comme l'application scriptee »
 *   L143  les cinq cas d'acceptation, mot pour mot
 *   L145  commande : `pnpm verify:task T48`. « PostgreSQL et le stockage
 *         objet reels sont requis ; aucun appel de modele. »
 *   L86-94 (meme ADR, section « Decision proposee ») — le SEUL endroit qui
 *         nomme les operations du contrat, verbatim : « Le candidat ecrit
 *         du vrai code, que le moteur exerce. Un depot git par trajectoire,
 *         restaure au debut de chaque periode et sauvegarde a la fin. Un
 *         contrat d'application : le moteur lance le code du candidat comme
 *         un processus qui echange du JSON ligne par ligne sur l'entree et
 *         la sortie standard, avec les operations de l'application
 *         scriptee (creer un locataire, ecrire, lire, sonder une
 *         annulation, rendre une empreinte). Un adaptateur fait passer ce
 *         processus pour l'application scriptee auprès des controles
 *         existants : les controles ne changent pas, seul ce qu'ils
 *         controlent devient reel. »
 *   L82   (cahier, cite par l'ADR via T23/T11) : empreintes SHA-256 sur des
 *         octets canoniques — objets JSON tries RECURSIVEMENT par cle,
 *         ordre des tableaux conserve, UTF-8 — fonde la canonicalisation de
 *         `fingerprint` (A5).
 *   L123  (cahier, F-RESERVATION) : « les probes [...] sont des clones
 *         jetables ; elles ne modifient pas l'etat persistant principal »
 *         — le precedent EXACT que `probe_cancel` reprend pour un candidat
 *         reel (A5) : ce que le cahier garantissait par construction d'un
 *         oracle pur devient, pour un processus opaque, une PROPRIETE A
 *         OBSERVER plutot qu'a presupposer.
 *   D-1   « l'etat applicatif d'une trajectoire persiste ; aucun retour
 *         automatique a une base ideale » — fonde A1.
 *
 * Cette suite reprend, SANS les relire, les conventions deja fixees par
 * acceptance/T23.spec.ts (`bench run-period`, PostgreSQL REEL par `psql` /
 * `creerBase`, invocation de la commande comme PROCESSUS neuf, jamais un
 * import) et par acceptance/T11.spec.ts (`bench demo`, la fixture gelee
 * F-RESERVATION comme vocabulaire de locataire/creneau). Elle n'importe
 * NI `packages/scenario` NI `packages/activities` : ce sont exactement les
 * `source_paths` de T48, et le lire — meme pour en stuber un export — serait
 * lire son implementation.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * POURQUOI UNE COMMANDE NEUVE, `candidate-period`, ET NON `run-period` ELLE-
 * MEME (meme geste que T46 fixant `pilot-conduct` plutot que de surcharger
 * `campaign` ou `pilot`)
 *
 * `bench run-period` (T23) assemble la PERIODE ENTIERE : revelation, AGENT
 * SCRIPTE (T18), validation (T20), deploiement (T21), usage, audit,
 * checkpoint. Le "candidat" que T48 doit outiller n'est PAS cet agent de
 * developpement (T47/T49 s'en chargeront, par une VRAIE session `claude -p`)
 * — c'est, au sens de l'ADR (fait constate n°1, « le candidat est une
 * application simulee en memoire (`createScriptedApplication`) ») ce que le
 * moteur EXERCE : l'application qui sert les operations metier. Donner a CE
 * point un espace de travail reel et un contrat de processus, puis prouver
 * que l'adaptateur resultant rend les memes statuts qu'avant, n'exige NI
 * d'invoquer un agent scripte NI de rejouer la validation/l'admission de T20/
 * T21 — qui ont deja leurs propres suites et que cette tache ne touche pas
 * (elle ne depend que de T11 et T23, jamais de T18/T19/T20/T21 directement).
 * Surcharger `run-period` aurait donc force cette suite a traverser des
 * controles sans rapport avec T48 pour observer son propre contrat ; une
 * commande dediee l'isole exactement comme le prescrit l'ADR (« les
 * controles ne changent pas, seul ce qu'ils controlent devient reel ») sans
 * pretendre revalider ces controles-la.
 *
 * `apps/cli` N'EST PAS dans les `source_paths` de T48 (packages/scenario,
 * packages/activities seulement) : cette suite ne s'interdit donc PAS de
 * lire son repertoire pour y LOCALISER le point d'entree (meme fonction
 * `entreesCli` que T23/T45/T46, qui ne lit que des noms de fichiers et
 * `package.json`, jamais une ligne de logique) — exactement comme T45 a pu
 * fixer deux drapeaux NOUVEAUX sur `run-period` (T23) sans que `run-period`
 * soit dans les `source_paths` de T45. La commande est observee comme un
 * PROCESSUS, jamais importee comme module (meme raison que T11/T23 : un
 * point d'entree qui s'execute a l'import emporterait la suite entiere en
 * SUITE_FAILED_TO_RUN).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE DANS L'ADR SUR LA FORME
 * EXACTE DE LA COMMANDE ET DU PROTOCOLE (meme geste que T11 fixant `variant`,
 * T19 fixant les six roles du sandbox, T46 fixant `pilot-conduct`). Aucune
 * des valeurs listees ici n'a ete obtenue en executant une implementation de
 * T48 : aucune n'existe au moment ou cette suite est ecrite (ADR-001).
 *
 * 1. SOUS-COMMANDE, `candidate-period` (NOM NEUF — FIXE ICI) :
 *
 *      bench candidate-period
 *          --campaign-id <id> --postgres-database <db> --s3-bucket <bucket>
 *          [--candidate-workspace-root <dir>]
 *          [--candidate-command <json-argv>]
 *          [--candidate-timeout-ms <n>]
 *          [--candidate-ops <json>]
 *
 *    `--campaign-id`/`--postgres-database`/`--s3-bucket` : MEME convention
 *    que T23 (II) — l'identite de TRAJECTOIRE, et les deux services reels.
 *    Chaque appel porte sur LA PERIODE SUIVANTE de cette trajectoire, lue
 *    depuis l'etat persistant (meme discipline que `run-period`, jamais un
 *    drapeau `--period`).
 *
 *    `--candidate-workspace-root <dir>` (FIXE ICI) : repertoire de base,
 *    REEL, sur disque. Quand il est fourni, le moteur DERIVE lui-meme, a
 *    partir de l'identite de la trajectoire, le depot git qu'il gere pour
 *    elle sous ce repertoire — l'appelant ne nomme JAMAIS le sous-repertoire
 *    d'une trajectoire : c'est cette derivation, proprietaire du moteur, que
 *    A2 exerce (le mutant T48.M2 la rend defaillante en faisant collapser
 *    deux trajectoires sur le meme sous-repertoire). Omis : aucun espace de
 *    travail reel n'est gere (mode `scripted`, ci-dessous).
 *
 *    `--candidate-command <json-argv>` (FIXE ICI) : un tableau JSON, UN seul
 *    jeton shell, nommant l'executable et ses arguments qui lancent le
 *    processus-candidat ; lance avec CWD = le depot derive ci-dessus.
 *    ABSENT : le moteur sert lui-meme les operations avec exactement la
 *    meme semantique metier que celle fixee au point 3 ci-dessous — c'est le
 *    mode `scripted`, l'« application scriptee » a laquelle A3 compare le
 *    mode `process`.
 *
 *    `--candidate-timeout-ms <n>` (FIXE ICI) : delai, en millisecondes,
 *    pour la probe de demarrage ET pour CHAQUE echange protocolaire
 *    ulterieur. Omis : cette suite ne fixe pas de valeur par defaut precise
 *    (non exercee numeriquement) ; elle fournit toujours ce drapeau quand le
 *    cas exige un delai borne (A4).
 *
 *    `--candidate-ops <json>` (FIXE ICI) : tableau JSON `{op, args}[]`, les
 *    operations metier a emettre CETTE PERIODE, dans l'ordre. Omis : `[]`.
 *
 * 2. SORTIE JSON (stdout), UN SEUL OBJET, forme PLATE (FIXEE ICI — cette
 *    suite n'a aucune prose de cahier a reconcilier avec une implementation
 *    existante, donc AUCUNE tolerance d'alias n'est accordee, a la
 *    difference de T23/T11 sur les champs que le cahier ne nomme qu'en
 *    prose) :
 *
 *      campaign_id            string  — echo de --campaign-id
 *      period_index            number  — 1-based, lu depuis l'etat persistant
 *      candidate: {
 *        mode                  'scripted' | 'process'
 *        deployed              boolean
 *        not_deployed_reason   string | null — un des trois motifs de 3(c),
 *                               null SEULEMENT si deployed===true
 *        workspace_dir         string | null — chemin ABSOLU REEL du depot
 *                               derive (null si --candidate-workspace-root
 *                               absent) ; LU ici, JAMAIS devine par la suite
 *        commit_sha            string | null — commit SAUVEGARDE A LA FIN
 *                               de CETTE periode (null hors mode `process`
 *                               ou si rien n'a jamais ete deploye)
 *      }
 *      operations: [ { op, args, ok, result, error,
 *                       fingerprint_before?, fingerprint_after? } ]
 *                               — UNE entree par operation de
 *                               --candidate-ops REELLEMENT tentee, DANS
 *                               L'ORDRE ; VIDE si deployed===false (3(c)).
 *                               `fingerprint_before`/`fingerprint_after`
 *                               PRESENTS SEULEMENT sur l'entree dont
 *                               `op==='probe_cancel'` (A5).
 *
 * 3. CONTRAT D'APPLICATION (protocole du processus), FIXE ICI, derive mot
 *    pour mot de L90 (« creer un locataire, ecrire, lire, sonder une
 *    annulation, rendre une empreinte ») :
 *
 *    (a) NDJSON sur stdin/stdout (« JSON ligne par ligne », L89).
 *    (b) PROBE DE DEMARRAGE : dans `--candidate-timeout-ms`, le candidat
 *        doit ecrire EXACTEMENT une ligne `{"ready":true}` sur stdout.
 *        Tout le reste avant ce delai — rien, sortie du processus, une
 *        autre forme — est « ne demarre pas ».
 *    (c) REGIME NOMINAL : le moteur ecrit une ligne par requete,
 *        `{"id","op","args"}` ; le candidat doit repondre, dans le meme
 *        delai, par UNE ligne portant le MEME `id` :
 *        `{"id","ok":true,"result"}` ou `{"id","ok":false,"error":{"code",
 *        "message"}}`. Trois motifs de non-deploiement, EXACTEMENT ces
 *        chaines (FIXEES ICI) :
 *          `CANDIDATE_START_FAILED`        — (b) non observee a temps
 *          `CANDIDATE_TIMEOUT`              — une reponse manque a l'appel
 *          `CANDIDATE_PROTOCOL_VIOLATION`   — une ligne recue n'est pas du
 *                                             JSON valide, ou omet `id`/`ok`,
 *                                             ou porte un `id` qui ne
 *                                             correspond a aucune requete en
 *                                             attente
 *    (d) LES CINQ OPERATIONS, DANS L'ORDRE OU L'ADR LES NOMME (L90) :
 *          `create_tenant` {tenant_id}              -> {}
 *          `write`         {tenant_id,key,value}    -> {}
 *          `read`          {tenant_id,key}           -> {value}  (`null` si absent)
 *          `probe_cancel`  {tenant_id,key}           -> {decision:
 *                                                        'cancelled'|'refused'}
 *                           DOIT rester SANS EFFET sur l'etat relu par un
 *                           `read`/`fingerprint` ulterieur (cahier:L123).
 *          `fingerprint`   {}                        -> {sha256} — SHA-256
 *                                                        hexadecimal sur les
 *                                                        octets canoniques
 *                                                        (cahier:L82) de
 *                                                        `{tenants:<etat>}`.
 *        Le mode `scripted` (1) DOIT implementer EXACTEMENT cette semantique
 *        — c'est ce que A3 compare.
 *
 * Application de reference FIXEE ICI, zone ACCEPTANCE (jamais une source de
 * T48) : acceptance/fixtures/candidates/reference-app.mjs, et trois candidats
 * fautifs pour A4 : not-starting.mjs, unresponsive.mjs, malformed.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T48, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER DE CROIRE QUE LE DISQUE EST RESTE INTACT
 *     ENTRE DEUX PERIODES. cases.extensions.lock.json le nomme : « restaurer
 *     la periode k+1 depuis un depot vierge au lieu du commit sauvegarde ».
 *     Entre P1 et P2, cette suite DETRUIT reellement le repertoire de
 *     travail rendu par P1 et y recree un depot git SANS RAPPORT (un fichier
 *     `etranger.txt`, un historique distinct) — puis exige que P2 (a) relise
 *     EXACTEMENT la valeur ecrite en P1 par le protocole et (b) que
 *     `etranger.txt` ait disparu du repertoire RE-DERIVE. Un moteur qui se
 *     contenterait de laisser le repertoire tel quel entre deux appels (au
 *     lieu de le RESTAURER depuis Postgres/S3) laisserait les DEUX
 *     assertions tomber. Controle independant : la trajectoire reste lisible
 *     en PostgreSQL apres la corruption (`occurrences`).
 * (2) A2 EST UN CAS `absence`, ET LE DANGER EST UN FAUX VERT PAR CONSTRUCTION
 *     (meme avertissement que T00.M3/T23 V.3) : si CETTE SUITE choisissait
 *     elle-meme deux repertoires distincts pour ses deux trajectoires, rien
 *     ne prouverait que le MOTEUR sait les isoler. Cette suite ne nomme donc
 *     JAMAIS le sous-repertoire d'une trajectoire : les deux appels partagent
 *     la MEME racine `--candidate-workspace-root`, et c'est le moteur qui
 *     derive deux chemins distincts — LUS dans `workspace_dir`, jamais
 *     devines. Les deux periodes sont en outre lancees CONCURREMMENT (deux
 *     processus OS reels, `spawn`, jamais `execFileSync` sequentiel) pour
 *     exercer reellement « pendant une periode », pas seulement « entre deux
 *     periodes ». Le temoin DECISIF est une lecture directe de
 *     `state.json` sur le disque de CHAQUE repertoire, independamment du
 *     protocole : une contamination y laisserait la valeur de l'AUTRE
 *     trajectoire.
 * (3) A3 : LE DANGER CLASSIQUE DES CAS `behaviour` SOUS UN ADAPTATEUR —
 *     cases.extensions.lock.json le nomme : « faire repondre l'adaptateur de
 *     processus par l'application scriptee au lieu du processus ». Comparer
 *     SEULEMENT les resultats ne distinguerait pas un adaptateur qui route
 *     reellement vers le processus d'un adaptateur qui, silencieusement,
 *     retombe sur le mode `scripted` tout en affichant `mode:"process"` —
 *     les DEUX produiraient la MEME sortie si le mode scripted est correct.
 *     Cette suite exige donc, EN PLUS de l'egalite des resultats, un TEMOIN
 *     INDEPENDANT DU PROTOCOLE : `acceptance/fixtures/candidates/
 *     reference-app.mjs` ecrit une ligne dans `ops-received.log`, DANS SON
 *     PROPRE REPERTOIRE DE TRAVAIL, pour CHAQUE operation RECUE — un canal
 *     hors-contrat que seul un VRAI processus peut remplir. L'egalite des
 *     resultats (y compris l'empreinte finale, BIT POUR BIT) et ce journal
 *     non vide doivent etre vrais ENSEMBLE.
 * (4) A4 EST UN CAS `refusal` : LE DANGER CLASSIQUE (meme avertissement que
 *     T00.M3/T39.A2/T46.A4) — un adaptateur qui echouerait TOUJOURS la
 *     periode sur un candidat qui ne demarre pas rendrait la moitie
 *     « nomme » trivialement vraie (n'importe quel motif suffirait) SANS que
 *     la moitie « la periode elle-meme n'echoue pas » soit vraie. Cette
 *     suite exerce donc les TROIS formes de defaillance ET un candidat
 *     CORRECT dans le MEME cas (temoin anti-refus-universel : sans lui, un
 *     adaptateur qui repondrait toujours `deployed:false` satisferait les
 *     trois premieres assertions sans rien prouver), PUIS rappelle la MEME
 *     trajectoire une periode supplementaire et exige que `period_index` ait
 *     bien avance — la preuve que le non-deploiement n'a PAS fait echouer la
 *     periode.
 * (5) A5 : LE DANGER EST DE NE CROIRE QUE LE RAPPORT DE L'ADAPTATEUR SUR LUI-
 *     MEME. `fingerprint_before`/`fingerprint_after` sont les valeurs que le
 *     MOTEUR dit avoir observees ; cette suite les compare pour EGALITE
 *     stricte (chaine SHA-256 complete, jamais un prefixe), et ajoute un
 *     SECOND temoin, independant du bracket automatique : une lecture
 *     protocolaire EXPLICITE apres la sonde, qui doit encore rendre la
 *     valeur ecrite avant elle. Les deux temoins doivent concorder.
 * (6) ISOLATION DES SERVICES REELS. Chaque cas cree sa PROPRE base
 *     PostgreSQL (`creerBase`) et son propre nom de bucket S3, et son PROPRE
 *     repertoire de travail temporaire (`fs.mkdtempSync`) — cahier:L557.
 *     Aucun cas ne depend de l'ordre d'execution d'un autre.
 * (7) CHAQUE INVOCATION EST UN PROCESSUS NEUF — meme discipline que
 *     T11/T23/T45/T46.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne revalide ni l'agent scripte (T18), ni la validation (T20), ni
 *    l'admission/deploiement (T21), ni `run-period` (T23) elle-meme : ce
 *    sont des suites distinctes, et T48 ne depend QUE de T11 et T23 (pas de
 *    T18/T19/T20/T21 directement) — voir II.
 *  • Elle ne fixe aucune regle de derivation precise du sous-repertoire
 *    qu'un `--candidate-workspace-root` donne : seulement qu'elle isole
 *    reellement deux trajectoires (A2) et qu'elle est STABLE pour une meme
 *    trajectoire entre deux periodes (A1).
 *  • Elle n'exerce ni T47 ni T49 : aucune session `claude -p`, aucun
 *    fournisseur `claude-cli`, aucun appel de modele (ADR:L145). Les
 *    candidats exerces sont tous des fixtures ACCEPTANCE ecrites par cette
 *    suite, jamais un agent reel.
 *  • Elle ne verifie pas le contenu S3 directement (objets, manifeste) : le
 *    mecanisme de persistance exact (Postgres seul, S3 seul, ou les deux)
 *    reste a l'implementation ; cette suite observe seulement qu'une
 *    RESTAURATION REELLE a lieu depuis un etat qui SURVIT a la corruption du
 *    disque local (A1).
 *  • Elle n'impose aucune valeur par defaut precise a
 *    `--candidate-timeout-ms` : elle le fournit explicitement partout ou un
 *    delai borne importe (A4).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * (repris, sans le reinventer, de acceptance/T23.spec.ts — meme discipline
 * que acceptance/T46.spec.ts citant son propre socle comme repris de T45.)
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
const FIXTURES_DIR = path.join(REPO, 'acceptance', 'fixtures', 'candidates');
const REFERENCE_APP = path.join(FIXTURES_DIR, 'reference-app.mjs');
const NOT_STARTING = path.join(FIXTURES_DIR, 'not-starting.mjs');
const UNRESPONSIVE = path.join(FIXTURES_DIR, 'unresponsive.mjs');
const MALFORMED = path.join(FIXTURES_DIR, 'malformed.mjs');
for (const f of [REFERENCE_APP, NOT_STARTING, UNRESPONSIVE, MALFORMED]) {
  if (!fs.existsSync(f)) throw new Error(`FIXTURE-ABSENTE : ${f}`);
}
const REFERENCE_ARGV = ['node', REFERENCE_APP];

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

/** cahier:L82 — objets tries RECURSIVEMENT par cle, ordre des tableaux conserve. */
function canonique(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonique);
  if (v !== null && typeof v === 'object') {
    const o = v as Json;
    const out: Json = {};
    for (const k of Object.keys(o).sort()) out[k] = canonique(o[k]);
    return out;
  }
  return v;
}

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t48_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of WORKSPACES_CREES) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort — ne jamais faire echouer la suite sur un nettoyage */
    }
  }
});

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;
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

const SOUS_COMMANDE = 'candidate-period'; // FIXE ICI (III.1)

function env(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

/** Une invocation de `bench candidate-period`, PROCESSUS NEUF SYNCHRONE. */
function lancer(sousCommande: string, drapeaux: string[]): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env());
      const j = jsonDeSortie(r.stdout);
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

/** Variante PROMESSE, pour exercer deux trajectoires reellement CONCURRENTES (IV.2). */
function executerAsync(argv: string[]): Promise<{ exit: number | null; stdout: string; sortie: string }> {
  return new Promise((resolve) => {
    const enfant = spawn('node', argv, { cwd: REPO, env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    enfant.stdout.on('data', (d: Buffer) => {
      out += d.toString('utf8');
    });
    enfant.stderr.on('data', (d: Buffer) => {
      err += d.toString('utf8');
    });
    enfant.on('close', (code) => resolve({ exit: code, stdout: out, sortie: `${out}\n${err}` }));
    enfant.on('error', (e) => resolve({ exit: null, stdout: out, sortie: `${out}\n${err}\n[spawn-error] ${String(e)}` }));
  });
}
async function lancerAsync(sousCommande: string, drapeaux: string[]): Promise<AppelCli> {
  construireUneFois([]); // idempotent, SYNCHRONE : garantit un build avant toute tentative concurrente
  const tentatives: AppelCli['tentatives'] = [];
  for (const c of entreesCli()) {
    const argv = [...c.argv, sousCommande, ...drapeaux];
    // eslint-disable-next-line no-await-in-loop
    const r = await executerAsync(argv);
    const j = jsonDeSortie(r.stdout);
    tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 400) });
    if (j !== null) return { resultat: j, tentatives };
  }
  return { resultat: null, tentatives };
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ─────────────────────────── contexte, drapeaux et operations (III) */

type Operation = { op: string; args?: Json };
type Options = { command?: string[]; timeoutMs?: number; ops?: Operation[] };
type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot?: string };

/** Trajectoire fraiche AVEC un espace de travail reel (le cas commun). */
function nouveauContexte(suffixe: string, racinePartagee?: string): Contexte {
  const racine = racinePartagee ?? fs.mkdtempSync(path.join(os.tmpdir(), `bench-t48-${suffixe}-`));
  if (racinePartagee === undefined) WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t48-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}
/** Trajectoire SANS espace de travail (mode `scripted`, A3 — III.1). */
function nouveauContexteScripte(suffixe: string): Contexte {
  return {
    campaignId: `t48-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
  };
}

function drapeauxDe(ctx: Contexte, opts: Options = {}): string[] {
  const out: string[] = ['--campaign-id', ctx.campaignId, '--postgres-database', ctx.db, '--s3-bucket', ctx.bucket];
  if (ctx.workspaceRoot !== undefined) out.push('--candidate-workspace-root', ctx.workspaceRoot);
  if (opts.command !== undefined) out.push('--candidate-command', JSON.stringify(opts.command));
  if (opts.timeoutMs !== undefined) out.push('--candidate-timeout-ms', String(opts.timeoutMs));
  out.push('--candidate-ops', JSON.stringify(opts.ops ?? []));
  return out;
}
function candidatePeriod(ctx: Contexte, opts: Options = {}): AppelCli {
  return lancer(SOUS_COMMANDE, drapeauxDe(ctx, opts));
}
function candidatePeriodAsync(ctx: Contexte, opts: Options = {}): Promise<AppelCli> {
  return lancerAsync(SOUS_COMMANDE, drapeauxDe(ctx, opts));
}

/* ───────────────────────────── extraction de champs — FORME PLATE (III.2) */

function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}
function candidatDe(p: unknown): Json {
  return obj(obj(p).candidate);
}
const deployeDe = (p: unknown): unknown => candidatDe(p).deployed;
const motifDe = (p: unknown): unknown => candidatDe(p).not_deployed_reason;
const workspaceDirDe = (p: unknown): unknown => candidatDe(p).workspace_dir;
const commitShaDe = (p: unknown): unknown => candidatDe(p).commit_sha;
const modeDe = (p: unknown): unknown => candidatDe(p).mode;
const indexDe = (p: unknown): unknown => obj(p).period_index;
function operationsDe(p: unknown): Json[] {
  const o = obj(p).operations;
  return Array.isArray(o) ? (o as Json[]) : [];
}

const RAISON = {
  START_FAILED: 'CANDIDATE_START_FAILED',
  TIMEOUT: 'CANDIDATE_TIMEOUT',
  PROTOCOL_VIOLATION: 'CANDIDATE_PROTOCOL_VIOLATION',
} as const; // FIXE ICI (III.3.c)

const TENANT = 'T1'; // FIXE ICI — vocabulaire « locataire » (L90)
const CLE = 'K1'; // FIXE ICI — vocabulaire « ecrire/lire » (L90)

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T48 — donner au candidat un espace de travail et un contrat d’application', () => {
  test(
    'T48.A1 la periode k+1 part exactement du commit sauvegarde a la fin de k, relu depuis l’etat persistant (ADR:L86-87)',
    () => {
      const ctx = nouveauContexte('a1');

      const p1 = candidatePeriod(ctx, {
        command: REFERENCE_ARGV,
        ops: [
          { op: 'create_tenant', args: { tenant_id: TENANT } },
          { op: 'write', args: { tenant_id: TENANT, key: CLE, value: 'VALEUR-P1' } },
        ],
      });
      exige(p1.resultat !== null, 'periode-1-executee', messageEchec('periode 1', p1));
      const r1 = p1.resultat as Json;
      exige(indexDe(r1) === 1, 'periode-1-index-1', `vu ${rendu(indexDe(r1))} dans ${rendu(r1)}`);
      exige(deployeDe(r1) === true, 'periode-1-candidat-deploye', `vu ${rendu(deployeDe(r1))} dans ${rendu(r1)}`);
      const dir1 = workspaceDirDe(r1);
      exige(typeof dir1 === 'string' && dir1.length > 0 && fs.existsSync(dir1), 'repertoire-de-travail-reel-rendu', `vu ${rendu(dir1)} dans ${rendu(r1)}`);
      const commit1 = commitShaDe(r1);
      exige(typeof commit1 === 'string' && commit1.length > 0, 'commit-de-fin-de-periode-1-publie', `vu ${rendu(commit1)} dans ${rendu(r1)}`);

      // CORRUPTION DELIBEREE (IV.1, mutant T48.M1) : on remplace le depot par
      // un depot vierge SANS RAPPORT, pour s'assurer que la restauration de
      // P2 relit l'etat PERSISTANT, jamais le disque local.
      const dir = dir1 as string;
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      execFileSync('git', ['init', '--quiet'], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'etranger.txt'), 'depot vierge sans rapport avec la trajectoire');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['-c', 'user.email=t48@bench.test', '-c', 'user.name=t48', 'commit', '--quiet', '-m', 'depot etranger'], { cwd: dir });

      const p2 = candidatePeriod(ctx, { command: REFERENCE_ARGV, ops: [{ op: 'read', args: { tenant_id: TENANT, key: CLE } }] });
      exige(p2.resultat !== null, 'periode-2-executee', messageEchec('periode 2', p2));
      const r2 = p2.resultat as Json;
      exige(indexDe(r2) === 2, 'periode-2-index-2', `vu ${rendu(indexDe(r2))} dans ${rendu(r2)}`);
      exige(deployeDe(r2) === true, 'periode-2-candidat-deploye', `vu ${rendu(deployeDe(r2))} dans ${rendu(r2)}`);

      const lecture = obj(operationsDe(r2)[0]).result;
      exige(obj(lecture).value === 'VALEUR-P1', 'etat-restaure-depuis-la-persistance-pas-le-disque', `vu ${rendu(lecture)} dans ${rendu(r2)}`);

      const dir2 = workspaceDirDe(r2);
      exige(typeof dir2 === 'string' && !fs.existsSync(path.join(dir2, 'etranger.txt')), 'fichier-etranger-efface-par-la-restauration', `dir2=${rendu(dir2)}`);

      // Controle independant : la trajectoire reste lisible en PostgreSQL malgre la corruption du disque.
      exige(occurrences(ctx.db, ctx.campaignId) > 0, 'trajectoire-lisible-en-base-malgre-la-corruption-disque', `0 occurrence de ${ctx.campaignId} dans ${ctx.db}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T48.A2 deux trajectoires ne partagent ni espace de travail ni commit ecrit pendant une periode',
    async () => {
      await (async (): Promise<void> => {
        construireUneFois([]);
        const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-t48-a2-racine-'));
        WORKSPACES_CREES.push(racine);
        const ctxA = nouveauContexte('a2a', racine);
        const ctxB = nouveauContexte('a2b', racine);

        const opsA: Operation[] = [
          { op: 'create_tenant', args: { tenant_id: TENANT } },
          { op: 'write', args: { tenant_id: TENANT, key: CLE, value: 'VALEUR-A' } },
        ];
        const opsB: Operation[] = [
          { op: 'create_tenant', args: { tenant_id: TENANT } },
          { op: 'write', args: { tenant_id: TENANT, key: CLE, value: 'VALEUR-B' } },
        ];

        // CONCURRENCE REELLE (IV.2) : deux processus OS lances SANS attendre
        // l'un l'autre, « pendant une periode », pas seulement entre deux.
        const [appelA1, appelB1] = await Promise.all([
          candidatePeriodAsync(ctxA, { command: REFERENCE_ARGV, ops: opsA }),
          candidatePeriodAsync(ctxB, { command: REFERENCE_ARGV, ops: opsB }),
        ]);
        exige(appelA1.resultat !== null, 'trajectoire-A-periode-1-executee', messageEchec('A/periode 1', appelA1));
        exige(appelB1.resultat !== null, 'trajectoire-B-periode-1-executee', messageEchec('B/periode 1', appelB1));
        const rA1 = appelA1.resultat as Json;
        const rB1 = appelB1.resultat as Json;
        exige(deployeDe(rA1) === true, 'A-deployee', `vu ${rendu(deployeDe(rA1))}`);
        exige(deployeDe(rB1) === true, 'B-deployee', `vu ${rendu(deployeDe(rB1))}`);

        const dirA = workspaceDirDe(rA1);
        const dirB = workspaceDirDe(rB1);
        exige(
          typeof dirA === 'string' && typeof dirB === 'string' && dirA.length > 0 && dirA !== dirB,
          'repertoires-de-travail-distincts-sous-la-meme-racine',
          `A=${rendu(dirA)} B=${rendu(dirB)}`,
        );
        const commitA = commitShaDe(rA1);
        const commitB = commitShaDe(rB1);
        exige(
          typeof commitA === 'string' && typeof commitB === 'string' && commitA !== commitB,
          'commits-de-fin-de-periode-distincts',
          `A=${rendu(commitA)} B=${rendu(commitB)}`,
        );

        // Chacune relit SA PROPRE valeur a la periode suivante — jamais celle de l'autre.
        const [appelA2, appelB2] = await Promise.all([
          candidatePeriodAsync(ctxA, { command: REFERENCE_ARGV, ops: [{ op: 'read', args: { tenant_id: TENANT, key: CLE } }] }),
          candidatePeriodAsync(ctxB, { command: REFERENCE_ARGV, ops: [{ op: 'read', args: { tenant_id: TENANT, key: CLE } }] }),
        ]);
        const valeurA = obj(obj(operationsDe(appelA2.resultat)[0]).result).value;
        const valeurB = obj(obj(operationsDe(appelB2.resultat)[0]).result).value;
        exige(valeurA === 'VALEUR-A', 'trajectoire-A-relit-sa-propre-valeur', `vu ${rendu(valeurA)} dans ${rendu(appelA2.resultat)}`);
        exige(valeurB === 'VALEUR-B', 'trajectoire-B-relit-sa-propre-valeur', `vu ${rendu(valeurB)} dans ${rendu(appelB2.resultat)}`);

        // Temoin DECISIF, independant du protocole : inspection DIRECTE du disque de chaque repertoire.
        const etatA = JSON.parse(fs.readFileSync(path.join(dirA as string, 'state.json'), 'utf8')) as Json;
        const etatB = JSON.parse(fs.readFileSync(path.join(dirB as string, 'state.json'), 'utf8')) as Json;
        const lireDisk = (etat: Json): unknown => obj(obj(etat)[TENANT])[CLE];
        exige(lireDisk(etatA) === 'VALEUR-A', 'disque-A-non-contamine-par-B', `vu ${rendu(lireDisk(etatA))} dans ${path.join(dirA as string, 'state.json')}`);
        exige(lireDisk(etatB) === 'VALEUR-B', 'disque-B-non-contamine-par-A', `vu ${rendu(lireDisk(etatB))} dans ${path.join(dirB as string, 'state.json')}`);
      })();
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T48.A3 une application de reference respectant le contrat obtient exactement les memes statuts de controle que l’application scriptee (ADR:L91-94)',
    () => {
      const ctxScripte = nouveauContexteScripte('a3s');
      const ctxProcessus = nouveauContexte('a3p');

      const OPS: Operation[] = [
        { op: 'create_tenant', args: { tenant_id: TENANT } },
        { op: 'write', args: { tenant_id: TENANT, key: CLE, value: 'VALEUR-A3' } },
        { op: 'read', args: { tenant_id: TENANT, key: CLE } },
        { op: 'probe_cancel', args: { tenant_id: TENANT, key: CLE } },
        { op: 'read', args: { tenant_id: TENANT, key: CLE } },
        { op: 'fingerprint', args: {} },
      ];

      const appelScripte = candidatePeriod(ctxScripte, { ops: OPS }); // ni --candidate-workspace-root ni --candidate-command
      const appelProcessus = candidatePeriod(ctxProcessus, { command: REFERENCE_ARGV, ops: OPS });

      exige(appelScripte.resultat !== null, 'mode-scripted-execute', messageEchec('scripted', appelScripte));
      exige(appelProcessus.resultat !== null, 'mode-process-execute', messageEchec('process', appelProcessus));
      const rS = appelScripte.resultat as Json;
      const rP = appelProcessus.resultat as Json;

      exige(modeDe(rS) === 'scripted', 'mode-annonce-scripted', `vu ${rendu(modeDe(rS))} dans ${rendu(rS)}`);
      exige(modeDe(rP) === 'process', 'mode-annonce-process', `vu ${rendu(modeDe(rP))} dans ${rendu(rP)}`);
      exige(deployeDe(rS) === true, 'scripted-deploye', `vu ${rendu(deployeDe(rS))}`);
      exige(deployeDe(rP) === true, 'process-deploye', `vu ${rendu(deployeDe(rP))}`);

      // TEMOIN DECISIF (IV.3, mutant T48.M3) : le processus a REELLEMENT
      // repondu — canal hors-contrat que seul un VRAI sous-processus remplit.
      const dirP = workspaceDirDe(rP);
      exige(typeof dirP === 'string' && dirP.length > 0, 'process-a-un-repertoire-de-travail', `vu ${rendu(dirP)}`);
      const journal = fs
        .readFileSync(path.join(dirP as string, 'ops-received.log'), 'utf8')
        .split('\n')
        .filter((l) => l.length > 0);
      exige(journal.length === OPS.length, 'le-processus-reel-a-recu-chaque-operation', `vu ${journal.length} ligne(s) : ${rendu(journal)}`);

      // EGALITE EXACTE, operation par operation.
      const opsS = operationsDe(rS);
      const opsP = operationsDe(rP);
      exige(opsS.length === OPS.length, 'scripted-rend-une-entree-par-operation', `vu ${opsS.length} dans ${rendu(rS)}`);
      exige(opsP.length === OPS.length, 'process-rend-une-entree-par-operation', `vu ${opsP.length} dans ${rendu(rP)}`);
      for (let i = 0; i < OPS.length; i += 1) {
        const a = canonique({ ok: obj(opsS[i]).ok, result: obj(opsS[i]).result, error: obj(opsS[i]).error });
        const b = canonique({ ok: obj(opsP[i]).ok, result: obj(opsP[i]).result, error: obj(opsP[i]).error });
        exige(JSON.stringify(a) === JSON.stringify(b), `operation-${i + 1}-${OPS[i]!.op}-statut-identique`, `scripted=${rendu(a)} process=${rendu(b)}`);
      }

      // L'empreinte finale (operation 6, fingerprint) est l'egalite DECISIVE,
      // bit pour bit — cahier:L82.
      const fpS = obj(obj(opsS[5]).result).sha256;
      const fpP = obj(obj(opsP[5]).result).sha256;
      exige(typeof fpS === 'string' && fpS.length > 0, 'empreinte-scripted-presente', `vu ${rendu(fpS)}`);
      exige(fpP === fpS, 'empreinte-finale-identique-bit-pour-bit', `scripted=${rendu(fpS)} process=${rendu(fpP)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T48.A4 un candidat qui ne demarre pas, ne repond pas dans le delai ou viole le format du contrat est declare non deploye avec un motif nomme, sans faire echouer la periode (ADR:L143)',
    () => {
      const DELAI_MS = 1500;
      const UNE_OP: Operation[] = [{ op: 'create_tenant', args: { tenant_id: TENANT } }];

      // (a) ne demarre pas.
      const ctxStart = nouveauContexte('a4-start');
      const aStart = candidatePeriod(ctxStart, { command: ['node', NOT_STARTING], timeoutMs: DELAI_MS, ops: UNE_OP });
      exige(aStart.resultat !== null, 'candidat-non-demarrant-periode-executee', messageEchec('not-starting', aStart));
      const rStart = aStart.resultat as Json;
      exige(deployeDe(rStart) === false, 'A4a-non-deploye', `vu ${rendu(deployeDe(rStart))} dans ${rendu(rStart)}`);
      exige(motifDe(rStart) === RAISON.START_FAILED, `A4a-motif=${RAISON.START_FAILED}`, `vu ${rendu(motifDe(rStart))} dans ${rendu(rStart)}`);
      exige(operationsDe(rStart).length === 0, 'A4a-aucune-operation-tentee', `vu ${rendu(operationsDe(rStart))}`);

      // (b) ne repond pas dans le delai.
      const ctxTimeout = nouveauContexte('a4-timeout');
      const aTimeout = candidatePeriod(ctxTimeout, { command: ['node', UNRESPONSIVE], timeoutMs: DELAI_MS, ops: UNE_OP });
      exige(aTimeout.resultat !== null, 'candidat-muet-periode-executee', messageEchec('unresponsive', aTimeout));
      const rTimeout = aTimeout.resultat as Json;
      exige(deployeDe(rTimeout) === false, 'A4b-non-deploye', `vu ${rendu(deployeDe(rTimeout))} dans ${rendu(rTimeout)}`);
      exige(motifDe(rTimeout) === RAISON.TIMEOUT, `A4b-motif=${RAISON.TIMEOUT}`, `vu ${rendu(motifDe(rTimeout))} dans ${rendu(rTimeout)}`);

      // (c) viole le format du contrat.
      const ctxFormat = nouveauContexte('a4-format');
      const aFormat = candidatePeriod(ctxFormat, { command: ['node', MALFORMED], timeoutMs: DELAI_MS, ops: UNE_OP });
      exige(aFormat.resultat !== null, 'candidat-malforme-periode-executee', messageEchec('malformed', aFormat));
      const rFormat = aFormat.resultat as Json;
      exige(deployeDe(rFormat) === false, 'A4c-non-deploye', `vu ${rendu(deployeDe(rFormat))} dans ${rendu(rFormat)}`);
      exige(motifDe(rFormat) === RAISON.PROTOCOL_VIOLATION, `A4c-motif=${RAISON.PROTOCOL_VIOLATION}`, `vu ${rendu(motifDe(rFormat))} dans ${rendu(rFormat)}`);

      // (d) CONTROLE ANTI-REFUS-UNIVERSEL (IV.4) : un candidat CORRECT est deploye, motif null.
      const ctxOk = nouveauContexte('a4-ok');
      const aOk = candidatePeriod(ctxOk, { command: REFERENCE_ARGV, timeoutMs: DELAI_MS, ops: UNE_OP });
      exige(aOk.resultat !== null, 'candidat-correct-periode-executee', messageEchec('reference-app', aOk));
      const rOk = aOk.resultat as Json;
      exige(deployeDe(rOk) === true, 'A4d-controle-candidat-correct-deploye', `vu ${rendu(deployeDe(rOk))} dans ${rendu(rOk)}`);
      exige(motifDe(rOk) === null, 'A4d-controle-aucun-motif', `vu ${rendu(motifDe(rOk))} dans ${rendu(rOk)}`);

      // L'ASSERTION DECISIVE : le non-deploiement n'a PAS fait echouer la
      // periode — la MEME trajectoire avance normalement a la periode suivante.
      const aStart2 = candidatePeriod(ctxStart, { command: ['node', NOT_STARTING], timeoutMs: DELAI_MS, ops: [] });
      exige(aStart2.resultat !== null, 'periode-suivante-executee', messageEchec('not-starting, periode 2', aStart2));
      exige(indexDe(aStart2.resultat) === 2, 'periode-avance-malgre-le-non-deploiement', `vu ${rendu(indexDe(aStart2.resultat))} dans ${rendu(aStart2.resultat)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T48.A5 la sonde d’annulation ne modifie pas l’etat du candidat, constate par son empreinte avant et apres (cahier:L123)',
    () => {
      const ctx = nouveauContexte('a5');
      const OPS: Operation[] = [
        { op: 'create_tenant', args: { tenant_id: TENANT } },
        { op: 'write', args: { tenant_id: TENANT, key: CLE, value: 'VALEUR-A5' } },
        { op: 'probe_cancel', args: { tenant_id: TENANT, key: CLE } },
        { op: 'read', args: { tenant_id: TENANT, key: CLE } },
      ];
      const appel = candidatePeriod(ctx, { command: REFERENCE_ARGV, ops: OPS });
      exige(appel.resultat !== null, 'periode-executee', messageEchec('a5', appel));
      const r = appel.resultat as Json;
      exige(deployeDe(r) === true, 'candidat-deploye', `vu ${rendu(deployeDe(r))} dans ${rendu(r)}`);

      const ops = operationsDe(r);
      exige(ops.length === OPS.length, 'une-entree-par-operation', `vu ${ops.length} dans ${rendu(r)}`);

      const probe = obj(ops[2]);
      exige(probe.op === 'probe_cancel', 'troisieme-entree-est-probe_cancel', `vu ${rendu(probe.op)} dans ${rendu(probe)}`);
      const avant = probe.fingerprint_before;
      const apres = probe.fingerprint_after;
      exige(typeof avant === 'string' && avant.length > 0, 'empreinte-avant-presente', `vu ${rendu(avant)} dans ${rendu(probe)}`);
      exige(typeof apres === 'string' && apres === avant, 'empreinte-inchangee-par-la-sonde-dannulation', `avant=${rendu(avant)} apres=${rendu(apres)}`);

      // SECOND TEMOIN, independant du bracket automatique (IV.5) : une
      // lecture protocolaire EXPLICITE apres la sonde rend encore la valeur
      // ecrite avant elle.
      const lecture = obj(ops[3]);
      exige(lecture.op === 'read', 'quatrieme-entree-est-read', `vu ${rendu(lecture.op)} dans ${rendu(lecture)}`);
      const valeur = obj(lecture.result).value;
      exige(valeur === 'VALEUR-A5', 'valeur-inchangee-apres-la-sonde-dannulation', `vu ${rendu(valeur)} dans ${rendu(lecture)}`);
    },
    CASE_TIMEOUT_MS,
  );
});
