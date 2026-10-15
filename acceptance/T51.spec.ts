/**
 * acceptance/T51.spec.ts — suite d'acceptation de la tache T51.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T51.A1 behaviour — une application de reference respectant
 *                      `bench.candidate/2`, exercee periode par periode sur
 *                      le scenario de demonstration, obtient EXACTEMENT les
 *                      statuts de controle de l'application scriptee
 *                      nominale ; une application de reference FAUTIVE
 *                      obtient EXACTEMENT ceux de la variante fautive
 *   T51.A2 behaviour — chaque periode persistee a candidat reel porte, pour
 *                      CHAQUE controle, son identifiant, son statut et les
 *                      DEUX TERMES COMPARES, calcules sur le code de son
 *                      commit de fin
 *   T51.A3 refusal   — un candidat qui ne demarre pas, ne repond pas dans le
 *                      delai ou viole le format du contrat produit une
 *                      periode persistee comme NON DEPLOYEE avec un motif
 *                      nomme, dont les controles sont EVALUES ET ECHOUENT,
 *                      sans qu'aucun soit omis
 *   T51.A4 numeric   — le rapport de fin donne, par trajectoire et par
 *                      periode, le nombre de controles satisfaits et
 *                      violes, EGAL aux statuts persistes
 *   T51.A5 absence   — aucun fichier de l'oracle, des controles ou des
 *                      exigences d'une periode suivante n'est ecrit dans
 *                      l'espace de travail du candidat
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T51 EST UNE TACHE D'EXTENSION (ADR-009) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T51 — `packages/scenario`,
 * `packages/activities` et `apps/cli` — et ne les a lus ni directement ni
 * par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, pas une barriere technique). Le contrat teste ci-dessous est derive
 * de docs/specs/T51.md et de sa source, docs/adr/ADR-009-candidat-qui-
 * developpe-et-qu-on-controle.md, lignes 92 a 98 (la plage que la carte de
 * T51 epingle) :
 *
 *   L92  titre : « Exercer et controler le code du candidat a chaque
 *        periode »
 *   L94  dependances T11, T48, T50 ; livrables, mot pour mot : « contrat
 *        `bench.candidate/2` aligne sur l'application scriptee ; adaptateur
 *        qui presente le processus du candidat aux controles existants ;
 *        apres le developpement de chaque periode a candidat reel,
 *        lancement du code du commit de fin, execution du plan d'usages et
 *        des controles, statuts persistes avec la periode et agreges dans
 *        le rapport de fin »
 *   L96  les cinq cas d'acceptation, mot pour mot
 *   L98  commande : `pnpm verify:task T51`. « PostgreSQL, le stockage objet
 *        et le faux executable `claude` sont requis ; aucun appel reel. »
 *
 * Cette suite lit en outre, dans le corps narratif du MEME document ACCEPTE
 * (hors de la plage L92-98 epinglee par la carte — exactement la liberte
 * que prend deja acceptance/T48.spec.ts et acceptance/T50.spec.ts face au
 * meme ADR) :
 *
 *   L43-51 « Decision proposee » : « Un contrat aligne sur l'application
 *          controlee : `bench.candidate/2`. Le processus du candidat
 *          expose [...] exactement les operations de `ScriptedApplication` :
 *          creer un locataire, avancer l'horloge metier, soumettre une
 *          ecriture (`reserve` ou `cancel`, avec acteur, locataire,
 *          sequence d'admission et cle d'operation), lire une vue, sonder
 *          une annulation sans effet, rendre une empreinte de l'etat. [...]
 *          Un adaptateur presente ce processus aux controles existants
 *          comme l'application scriptee ; les controles ne changent pas. »
 *          « Une seule description du contrat. Le prompt du candidat et
 *          l'adaptateur lisent la meme description. »
 *   L63-67 « Chaque periode est exercee et controlee. Apres le
 *          developpement, le moteur lance le code du commit de fin, joue le
 *          plan d'usages de la periode et applique les controles. Les
 *          statuts sont persistes avec la periode. Un code qui ne demarre
 *          pas est controle comme une application non deployee : ses
 *          controles echouent, ils ne sont jamais omis. »
 *   L14-18 (« Ce que la relecture a trouve », fait n°3) : « Les controles du
 *          scenario (`reserve@1`, `idempotence@1`, `cancel@1`, `fifo@1`,
 *          `isolation@1`, `packages/scenario/src/demo-controls.ts`) portent
 *          sur une application de reservation [...] Un candidat qui
 *          respecterait le contrat actuel ne pourrait pas etre controle. »
 *          — SEUL endroit qui NOMME, entre BACKTICKS, les cinq identifiants
 *          de controle. Ce sont les cinq seuls LITTERAUX d'identifiant de
 *          controle que cette suite compare, et ils viennent de cette ligne
 *          de l'ADR, jamais d'une implementation lue.
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions deja FIXEES par
 * trois suites ACCEPTANCE anterieures (jamais des sources de T51) :
 *   - acceptance/T11.spec.ts : `bench demo --mode recorded --storage
 *     memory [--variant <variante>]` (cahier L247, L251), et la
 *     DECOUVERTE FLOUE d'une collection de controles metier NOMMES
 *     n'importe ou dans un resultat JSON (`controlesDe`, `ALIAS_CONTROLES`,
 *     `ALIAS_NOM`, `ALIAS_STATUT`, `statutDe` : VERT/ROUGE/INCONNU) — cette
 *     suite copie ce mecanisme a l'IDENTIQUE pour lire le resultat de
 *     `bench demo`, jamais pour lire le sien (le sien est FIXE, III).
 *   - acceptance/T48.spec.ts : le socle PostgreSQL REEL (`creerBase`,
 *     `psql`, `occurrences`), la decouverte de l'entree CLI
 *     (`entreesCli`), l'invocation en PROCESSUS NEUF (`executer`,
 *     `lancer`), le protocole NDJSON (probe `{"ready":true}`, requete
 *     `{id,op,args}`, reponse `{id,ok,result|error}`) et les TROIS motifs
 *     de non-deploiement, `CANDIDATE_START_FAILED` / `CANDIDATE_TIMEOUT` /
 *     `CANDIDATE_PROTOCOL_VIOLATION` — identiques pour `bench.candidate/2`,
 *     puisque ce sont des motifs de TRANSPORT (demarrage, delai, format de
 *     ligne), independants de la forme des operations. Les fixtures
 *     `not-starting.mjs`/`unresponsive.mjs`/`malformed.mjs` sont REPRISES
 *     A L'IDENTIQUE (fichiers existants, zone ACCEPTANCE, jamais modifies).
 *   - acceptance/T50.spec.ts (section III) : le contrat `bench.candidate/2`
 *     lui-meme, FIXE par cette suite ANTERIEURE par parallelisme avec
 *     `bench.candidate/1` :
 *
 *       OPERATION        ARGUMENTS                                   REPONSE
 *       create_tenant     {tenant_id}                                 {}
 *       advance_clock     {to}                                        {}
 *       write             {op,actor,tenant_id,admission_seq,
 *                          operation_key}                             {decision}
 *       read              {tenant_id,key}                             {value}
 *       probe_cancel      {tenant_id,key}                             {decision}
 *       fingerprint       {}                                          {sha256}
 *
 *     Cette suite ne refixe donc PAS ce contrat : elle l'IMPORTE par copie
 *     documentee depuis T50.spec.ts (III), exactement comme T50.spec.ts
 *     avait lui-meme repris les cinq noms `create_tenant`/`read`/
 *     `probe_cancel`/`fingerprint`/`tenant_id`/`key`/`value`/`decision`/
 *     `sha256` de `bench.candidate/1` (T48.spec.ts III.3) SANS les refixer.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME, FAUTE D'IMPLEMENTATION A CONSULTER
 * (ADR-001 : aucune des valeurs ci-dessous n'a ete obtenue en executant une
 * implementation de T51 et en figeant ce qu'on a vu passer — aucune
 * n'existe au moment ou cette suite est ecrite)
 *
 * 1. DEUX SOUS-COMMANDES NEUVES, DISTINCTES de `bench candidate-period`
 *    (T48, contrat v1) et de `bench run-period --provider claude-cli`
 *    (T49/T50, developpement) — meme geste que T48 fixant `candidate-period`
 *    plutot que de surcharger `run-period`, et T46 fixant `pilot-conduct`
 *    plutot que `campaign` (raison identique : isoler le contrat etroit de
 *    CETTE tache sans traverser des etapes sans rapport — revelation,
 *    validation, admission — qu'elle ne depend pas de T18/T19/T20/T21) :
 *
 *      bench candidate-control-period
 *          --campaign-id <id> --postgres-database <db> --s3-bucket <bucket>
 *          --candidate-workspace-root <dir> --candidate-command <json-argv>
 *          [--candidate-timeout-ms <n>]
 *
 *    Avance la trajectoire `--campaign-id` de la PERIODE SUIVANTE (lue
 *    depuis l'etat persistant, jamais un drapeau `--period` — meme
 *    discipline que `candidate-period`/`run-period`) : lance le code du
 *    commit de fin de la periode precedente (meme mecanique de restauration
 *    de depot PAR TRAJECTOIRE que T48.A1/A2, REPRISE A L'IDENTIQUE — cette
 *    suite ne la retestée pas), joue le plan d'usages INTERNE du scenario de
 *    demonstration (F-RESERVATION, celui que `bench demo` joue aussi — cette
 *    suite ne passe donc JAMAIS d'operations explicites : contrairement a
 *    `--candidate-ops` de `candidate-period` v1, AUCUN drapeau n'offre cette
 *    possibilite ici, pour que le MEME scenario soit exerce des deux cotes
 *    de la comparaison A1) puis applique, parmi les cinq controles nommes
 *    par ADR-009:L34, ceux DUS a la periode (II.6), un par un, contre le
 *    PROCESSUS candidat.
 *
 *      bench candidate-control-report --campaign-id <id> --postgres-database <db>
 *
 *    Lit l'etat persistant d'UNE trajectoire et rend l'agregat « par
 *    periode » du nombre de controles satisfaits et violes — « par
 *    trajectoire » (A4) est donc realise par l'identite `--campaign-id`
 *    elle-meme (meme convention que toutes les commandes `--campaign-id`
 *    de ce depot, jamais un agregat multi-trajectoires).
 *
 * 2. SORTIE JSON DE `candidate-control-period` (stdout), forme PLATE (comme
 *    T48.spec.ts III.2, aucune tolerance d'alias : cette suite n'a aucune
 *    prose de cahier a reconcilier avec une implementation existante) :
 *
 *      campaign_id             string
 *      period_index             number — 1-based, lu depuis l'etat persistant
 *      candidate: {
 *        deployed               boolean
 *        not_deployed_reason    string | null — un des trois motifs de
 *                                CANDIDATE_RAISON (II.3), null SEULEMENT si
 *                                deployed===true
 *        workspace_dir          string | null — chemin ABSOLU REEL du depot
 *                                derive
 *        commit_sha             string | null — commit SAUVEGARDE A LA FIN
 *                                de CETTE periode
 *      }
 *      controls: [ { id, status, actual, expected } ]
 *                               — EXACTEMENT une entree par controle DU a la
 *                               periode (II.6, SC-003 option A : deux a P1,
 *                               quatre a P2 et P3, cinq a P4), aucune pour un
 *                               controle non encore du, MEME quand
 *                               deployed===false (A3 : « sans qu'aucun soit
 *                               omis », des controles dus). [Avant SC-003 :
 *                               « toujours cinq entrees » — lecture que
 *                               T54.A2 a rendue fausse et que le mandant a
 *                               tranchee le 2026-10-16.]
 *                               `status` ∈ {'satisfied','violated'}.
 *                               `actual`/`expected` : LES DEUX TERMES
 *                               COMPARES (A2) — `actual` ce que le candidat a
 *                               effectivement produit (ou un marqueur de
 *                               non-deploiement quand deployed===false),
 *                               `expected` ce que la regle metier du
 *                               controle exige. EGAUX (deep) ssi
 *                               status==='satisfied' ; DIFFERENTS (deep) ssi
 *                               status==='violated' — c'est ce lien,
 *                               jamais affirme par construction du test,
 *                               que A2 verifie.
 *
 * 3. SORTIE JSON DE `candidate-control-report` : { campaign_id, periods: [
 *    { period_index, satisfied, violated } ] }, une entree par periode
 *    REELLEMENT persistee, `satisfied`/`violated` etant le compte, PARMI
 *    LES CONTROLES DUS a cette periode (II.6), de ceux a chaque statut.
 *
 * 4. LES CINQ IDENTIFIANTS DE CONTROLE (ADR-009:L34, entre backticks) :
 *    `reserve@1`, `idempotence@1`, `cancel@1`, `fifo@1`, `isolation@1`.
 *    `bench demo` (T11) ne les NOMME pas forcement a l'IDENTIQUE dans son
 *    propre resultat (son cahier source, L241, dit seulement « chacun
 *    detecte par son controle NOMME », sans fixer de chaine) : cette suite
 *    COMPARE donc par CLASSE METIER reconnue par un MOTIF (meme tolerance
 *    de NOMMAGE que `MOTIF_CONTROLE_ISOLATION` de T11.spec.ts, jamais de
 *    COMPORTEMENT), section IV.1.
 *
 * 5. SEMANTIQUE METIER DU DOMAINE DE RESERVATION portee par les fixtures
 *    `acceptance/fixtures/candidates/reservation-candidate-v2*.mjs` — voir
 *    leur propre en-tete. FIXEE a partir des SEULS faits scelles par la
 *    racine gelee `acceptance/reference/F-RESERVATION.json`, jamais d'une
 *    implementation lue.
 *
 * 6. LES CONTROLES DUS A CHAQUE PERIODE (ajout tracé par docs/spec-
 *    conflicts/SC-003-controles-dus-ou-tous-les-controles.md, option A) :
 *    `reserve@1`/`idempotence@1` dus a P1, `cancel@1`/`fifo@1` a P2,
 *    `isolation@1` a P4 — table `ECHEANCE_CONTROLE`, ancree ligne a ligne
 *    dans la racine gelee F-RESERVATION (cahier L119/L123), dans ADR-011:
 *    L55-57 et dans la suite acceptee T53 (isolation enoncee a P4 seulement),
 *    et RELUE contre la racine gelee a chaque cas A2/A3/A4. Un controle DU
 *    reste du aux periodes suivantes (« due a une periode inferieure ou egale
 *    a k », T54.A2). A2, A3 et A4 portent sur cet ensemble, a CHAQUE periode.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LES DANGERS PROPRES A T51, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 : LE DANGER NOMME PAR cases.extensions.lock.json#T51.A1 — « faire
 *     repondre l'adaptateur par l'application scriptee au lieu du
 *     processus » (meme risque que T48.M3). Comparer SEULEMENT les statuts
 *     de controle ne distinguerait pas un adaptateur qui route REELLEMENT
 *     vers le processus-candidat d'un adaptateur qui, silencieusement,
 *     retombe sur sa propre application scriptee tout en affichant les
 *     memes statuts (puisque les deux produiraient alors des controles
 *     identiques si l'application scriptee interne est correcte). Cette
 *     suite exige donc, EN PLUS de l'egalite des statuts, un TEMOIN
 *     INDEPENDANT DU PROTOCOLE : les deux fixtures de reference ecrivent
 *     une ligne dans `ops-received.log`, DANS LEUR PROPRE repertoire de
 *     travail, pour CHAQUE operation RECUE — un canal hors-contrat que seul
 *     un VRAI sous-processus peut remplir.
 * (2) A1/A4 : COMPARAISON PAR CLASSE, PAS PAR STRING EXACTE, mais la
 *     DETECTION DOIT RESTER CIBLEE (meme discipline que T11.A6.5) : la
 *     classe `isolation` doit ETRE LA SEULE a differer entre le candidat
 *     correct et le candidat fautif — les quatre autres classes doivent
 *     rester IDENTIQUES entre les deux runs. Un moteur qui ferait tout
 *     echouer sous le candidat fautif satisferait « isolation violee » sans
 *     rien discriminer ; cette suite l'exclut explicitement.
 * (3) A2 EST UN CAS `behaviour` DONT LE DANGER EST LA PRESENCE SANS LIEN —
 *     cases.extensions.lock.json le nomme : « persister la periode sans les
 *     deux termes compares de chaque controle ». Une implementation qui
 *     ecrirait `actual`/`expected` PRESENTS mais SANS RAPPORT avec `status`
 *     (par exemple deux constantes fixes) satisferait une verification de
 *     presence sans rien prouver. Cette suite exige donc le LIEN decisif :
 *     `status==='satisfied'` ⟺ `actual` et `expected` sont EGAUX (deep,
 *     canonique) ; `status==='violated'` ⟺ ils DIFFERENT — verifie sur UN
 *     controle satisfait (candidat correct) ET sur UN controle viole
 *     (candidat fautif), jamais affirme par construction.
 * (4) A3 EST UN CAS `refusal` : LE DANGER CLASSIQUE (meme avertissement que
 *     T48.M4/T46.A4) — un adaptateur qui echouerait TOUJOURS la periode sur
 *     un candidat defaillant rendrait « motif nomme » trivialement vrai sans
 *     que « la periode n'echoue pas » le soit. Cette suite exerce donc les
 *     TROIS formes de defaillance ET un candidat CORRECT dans le MEME cas
 *     (temoin anti-refus-universel), PUIS rappelle la MEME trajectoire une
 *     periode supplementaire et exige que `period_index` ait avance — la
 *     preuve que le non-deploiement n'a PAS fait echouer la periode.
 *     cases.extensions.lock.json nomme en outre un second danger, DISTINCT :
 *     « omettre les controles d'un candidat non deploye » — cette suite
 *     exige donc, SEPAREMENT et a CHACUNE des quatre periodes, que
 *     `controls` contienne EXACTEMENT les controles dus (II.6) et que
 *     chacun soit `'violated'`, MEME quand `deployed===false`.
 * (5) A4 : LE DANGER EST DE NE CROIRE QUE LE RAPPORT SUR LUI-MEME —
 *     cases.extensions.lock.json : « compter un controle viole comme
 *     satisfait dans le rapport ». Cette suite calcule donc, de son propre
 *     cote, les sommes PAR PERIODE a partir des reponses DEJA RECUES de
 *     `candidate-control-period` (temoin INDEPENDANT du rapport), puis
 *     exige l'EGALITE EXACTE avec ce que `candidate-control-report` rend —
 *     jamais une comparaison du rapport a lui-meme.
 * (6) A5 : LE DANGER EST DE NE REGARDER QUE CE QUE LE CANDIDAT A ECRIT
 *     LUI-MEME — cases.extensions.lock.json : « ecrire les exigences de la
 *     periode suivante dans l'espace de travail ». Les deux fixtures de
 *     reference de cette suite n'ecrivent JAMAIS, de leur propre initiative,
 *     ni un identifiant de controle, ni le nom d'une fixture de reference,
 *     ni l'horloge d'une periode future : TOUT occurrence de ces litteraux
 *     dans l'espace de travail, apres UNE SEULE periode, prouve donc une
 *     fuite du MOTEUR, jamais du candidat.
 * (7) ISOLATION DES SERVICES REELS. Chaque cas cree sa PROPRE base
 *     PostgreSQL (`creerBase`), son propre nom de bucket S3 et son propre
 *     repertoire de travail temporaire (`fs.mkdtempSync`) — cahier:L557.
 * (8) CHAQUE INVOCATION EST UN PROCESSUS NEUF (`execFileSync`), jamais un
 *     rappel en memoire — meme discipline que T11/T23/T45/T46/T47/T48/T49/T50.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * NOTES COMPLEMENTAIRES
 *
 * (1) CLASSES DE CONTROLE RECONNUES PAR MOTIF (II.4) : reserve, idempotence,
 *     cancel, fifo, isolation — chacune un motif insensible a la casse sur
 *     le NOM publie par `bench demo`, jamais sur son statut.
 * (2) Cette suite N'IMPOSE AUCUNE VALEUR PAR DEFAUT precise a
 *     `--candidate-timeout-ms` : elle le fournit explicitement partout ou un
 *     delai borne importe (A3).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne revalide ni la restauration de depot par trajectoire (T48.A1),
 *    ni son isolation entre deux trajectoires (T48.A2), ni le developpement
 *    par session `claude -p` (T49/T50) : ce sont des suites distinctes.
 *  • Elle n'exerce aucune session `claude -p`, reelle ou fausse : le code
 *    « du commit de fin » qu'elle lance est ecrit directement par cette
 *    suite (fixtures ACCEPTANCE), jamais developpe par un agent.
 *  • Elle ne fixe aucune regle precise de derivation du sous-repertoire
 *    d'une trajectoire sous `--candidate-workspace-root` (deja prouve par
 *    T48.A2).
 *  • Elle ne verifie pas le contenu S3 directement : le mecanisme de
 *    persistance exact reste a l'implementation.
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

/* ────────────────────────────────────────────────────────────────── socle
 * (repris, sans le reinventer, de acceptance/T48.spec.ts — meme discipline
 * que acceptance/T48.spec.ts citant son propre socle comme repris de T23.)
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
const REFERENCE_V2 = path.join(FIXTURES_DIR, 'reservation-candidate-v2.mjs');
const REFERENCE_V2_FAUTIF = path.join(FIXTURES_DIR, 'reservation-candidate-v2-faulty-isolation.mjs');
const NOT_STARTING = path.join(FIXTURES_DIR, 'not-starting.mjs');
const UNRESPONSIVE = path.join(FIXTURES_DIR, 'unresponsive.mjs');
const MALFORMED = path.join(FIXTURES_DIR, 'malformed.mjs');
for (const f of [REFERENCE_V2, REFERENCE_V2_FAUTIF, NOT_STARTING, UNRESPONSIVE, MALFORMED]) {
  if (!fs.existsSync(f)) throw new Error(`FIXTURE-ABSENTE : ${f}`);
}
const REFERENCE_V2_ARGV = ['node', REFERENCE_V2];
const REFERENCE_V2_FAUTIF_ARGV = ['node', REFERENCE_V2_FAUTIF];

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

/** cahier:L82 — objets tries RECURSIVEMENT par cle, ordre des tableaux conserve, UTF-8. */
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
const egalesCanonique = (a: unknown, b: unknown): boolean => JSON.stringify(canonique(a)) === JSON.stringify(canonique(b));

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t51_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

type AppelCli = { resultat: Json | null; tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[] };

function env(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

/** Une invocation `bench <sous-commande>`, PROCESSUS NEUF SYNCHRONE. */
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

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ─────────────────────────── contexte et drapeaux (II.1) */

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };

function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t51-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t51-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

const SOUS_COMMANDE_PERIODE = 'candidate-control-period'; // FIXE ICI (II.1)
const SOUS_COMMANDE_RAPPORT = 'candidate-control-report'; // FIXE ICI (II.1)

function drapeauxPeriode(ctx: Contexte, command: string[], timeoutMs?: number): string[] {
  const out = [
    '--campaign-id', ctx.campaignId,
    '--postgres-database', ctx.db,
    '--s3-bucket', ctx.bucket,
    '--candidate-workspace-root', ctx.workspaceRoot,
    '--candidate-command', JSON.stringify(command),
  ];
  if (timeoutMs !== undefined) out.push('--candidate-timeout-ms', String(timeoutMs));
  return out;
}
function candidateControlPeriod(ctx: Contexte, command: string[], timeoutMs?: number): AppelCli {
  return lancer(SOUS_COMMANDE_PERIODE, drapeauxPeriode(ctx, command, timeoutMs));
}
function candidateControlReport(ctx: Pick<Contexte, 'campaignId' | 'db'>): AppelCli {
  return lancer(SOUS_COMMANDE_RAPPORT, ['--campaign-id', ctx.campaignId, '--postgres-database', ctx.db]);
}

/* ───────────────────────────── extraction de champs — FORME PLATE (II.2) */

function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}
function candidatDe(p: unknown): Json {
  return obj(obj(p).candidate);
}
const deployeDe = (p: unknown): unknown => candidatDe(p).deployed;
const motifDe = (p: unknown): unknown => candidatDe(p).not_deployed_reason;
const workspaceDirDe = (p: unknown): unknown => candidatDe(p).workspace_dir;
const indexDe = (p: unknown): unknown => obj(p).period_index;
function controlesMienDe(p: unknown): Json[] {
  const c = obj(p).controls;
  return Array.isArray(c) ? (c as Json[]) : [];
}
function periodesRapportDe(p: unknown): Json[] {
  const per = obj(p).periods;
  return Array.isArray(per) ? (per as Json[]) : [];
}

const RAISON = {
  START_FAILED: 'CANDIDATE_START_FAILED',
  TIMEOUT: 'CANDIDATE_TIMEOUT',
  PROTOCOL_VIOLATION: 'CANDIDATE_PROTOCOL_VIOLATION',
} as const; // REPRIS A L'IDENTIQUE de T48.spec.ts III.3.c (motifs de TRANSPORT)

/** II.4 — les cinq identifiants, ADR-009:L34, entre backticks. */
const CONTROLES_FIXES = ['reserve@1', 'idempotence@1', 'cancel@1', 'fifo@1', 'isolation@1'] as const;
type IdControle = (typeof CONTROLES_FIXES)[number];

/**
 * II.6 — LES CONTROLES DUS A LA PERIODE k (SC-003, option A, arbitree le
 * 2026-10-16 : docs/spec-conflicts/SC-003-controles-dus-ou-tous-les-
 * controles.md). « Chaque controle » (A2) et « sans qu'aucun soit omis »
 * (A3) s'entendent des controles DUS a la periode, au sens de T54.A2
 * (ADR-011:L115 : « a la periode k, seuls les controles des exigences dues a
 * une periode inferieure ou egale a k sont evalues et persistes ») ; les
 * comptes de A4 portent sur ce meme ensemble.
 *
 * La periode a partir de laquelle chaque controle est DU est FIXEE ICI a
 * partir de sources INDEPENDANTES de toute implementation, jamais d'une
 * sortie observee :
 *   reserve@1, idempotence@1 -> P1  F-RESERVATION.json:valeurs.P1.faits
 *                                   (cahier L119 : « reservation de A
 *                                   acceptee, rejeu de sa cle idempotente ») ;
 *                                   ADR-011:L55-57, par elimination (les trois
 *                                   autres sont « dus en P2 a P4 ») — le seul
 *                                   point que T54.A2 fixe deja
 *   cancel@1, fifo@1         -> P2  F-RESERVATION.json:valeurs.P2.faits
 *                                   (« annulation de A ») et
 *                                   valeurs.P2.ordre_d_attente (« B puis C en
 *                                   attente », cahier L119)
 *   isolation@1              -> P4  F-RESERVATION.json:valeurs.P4.faits
 *                                   (« creation d'un locataire `other` [...]
 *                                   ne peuvent ni lire ni modifier »,
 *                                   cahier L119) et valeurs.P4.
 *                                   verdict_intertenant (cahier L123) ; la
 *                                   suite ACCEPTEE acceptance/T53.spec.ts fixe
 *                                   deja que l'isolation n'est enoncee au
 *                                   candidat qu'a P4, jamais a P1/P2/P3 — la
 *                                   controler avant serait juger le candidat
 *                                   sur une regle qu'il n'a pas recue
 *                                   (ADR-011:L55-57, defaut n°5).
 * `echeancesAncreesDansLaRacineGelee` relit la racine gelee a chaque cas et
 * ROUGIT si cette table cessait de lui correspondre.
 */
const ECHEANCE_CONTROLE: Record<IdControle, number> = {
  'reserve@1': 1,
  'idempotence@1': 1,
  'cancel@1': 2,
  'fifo@1': 2,
  'isolation@1': 4,
};
/** Les identifiants de controle DUS a la periode k, dans l'ordre de CONTROLES_FIXES. */
function controlesDus(k: number): IdControle[] {
  return CONTROLES_FIXES.filter((id) => ECHEANCE_CONTROLE[id] <= k);
}
/** Les identifiants de controle NON ENCORE dus a la periode k. */
function controlesNonDus(k: number): IdControle[] {
  return CONTROLES_FIXES.filter((id) => ECHEANCE_CONTROLE[id] > k);
}

/** Relit acceptance/reference/F-RESERVATION.json (racine gelee) et exige que ECHEANCE_CONTROLE lui corresponde. */
function echeancesAncreesDansLaRacineGelee(label: string): void {
  const brut = JSON.parse(fs.readFileSync(path.join(REPO, 'acceptance', 'reference', 'F-RESERVATION.json'), 'utf8')) as Json;
  const valeurs = obj(brut.valeurs);
  const texte = (p: string): string => JSON.stringify(valeurs[p] ?? null).toLowerCase();
  const [t1, t2, t3, t4] = [texte('P1'), texte('P2'), texte('P3'), texte('P4')];
  exige(
    t1.includes('reservation') && t1.includes('idempotente') && ECHEANCE_CONTROLE['reserve@1'] === 1 && ECHEANCE_CONTROLE['idempotence@1'] === 1,
    `${label}-echeance-reserve-et-idempotence-P1-ancree`,
    `P1=${court(t1, 300)} table=${rendu(ECHEANCE_CONTROLE)}`,
  );
  exige(
    !t1.includes('annulation') && t2.includes('annulation') && ECHEANCE_CONTROLE['cancel@1'] === 2,
    `${label}-echeance-cancel-P2-ancree`,
    `P1=${court(t1, 200)} P2=${court(t2, 300)} table=${rendu(ECHEANCE_CONTROLE)}`,
  );
  const ordre = obj(obj(valeurs.P2).ordre_d_attente).valeur;
  exige(
    obj(valeurs.P1).ordre_d_attente === undefined && Array.isArray(ordre) && ordre.length >= 2 && ECHEANCE_CONTROLE['fifo@1'] === 2,
    `${label}-echeance-fifo-P2-ancree`,
    `P2.ordre_d_attente=${rendu(ordre)} table=${rendu(ECHEANCE_CONTROLE)}`,
  );
  exige(
    t4.includes('locataire') && t4.includes('intertenant') && ECHEANCE_CONTROLE['isolation@1'] === 4,
    `${label}-echeance-isolation-P4-ancree`,
    `P4=${court(t4, 300)} table=${rendu(ECHEANCE_CONTROLE)}`,
  );
  exige(
    ![t1, t2, t3].some((t) => t.includes('locataire') || t.includes('intertenant')),
    `${label}-isolation-absente-de-P1-P2-P3-dans-la-racine-gelee`,
    `P1..P3 mentionnent deja les locataires : ${court(`${t1} ${t2} ${t3}`, 400)}`,
  );
  // ADR-011:L55-57 : cancel@1/fifo@1/isolation@1 « dus en P2 a P4 » ; a P4,
  // les cinq sont dus (la classification A1 par classe reste donc complete).
  exige(
    (['cancel@1', 'fifo@1', 'isolation@1'] as const).every((id) => ECHEANCE_CONTROLE[id] >= 2 && ECHEANCE_CONTROLE[id] <= 4) &&
      rendu(controlesDus(1)) === rendu(['reserve@1', 'idempotence@1']) &&
      rendu(controlesDus(4)) === rendu([...CONTROLES_FIXES]),
    `${label}-table-des-echeances-conforme-a-ADR-011-L55-57`,
    `table=${rendu(ECHEANCE_CONTROLE)}`,
  );
}

type Classe = 'reserve' | 'idempotence' | 'cancel' | 'fifo' | 'isolation';
const MOTIFS_CLASSE: Record<Classe, RegExp> = {
  reserve: /reserve/i,
  idempotence: /idempot/i,
  cancel: /cancel|annul/i,
  fifo: /fifo/i,
  isolation: /isolation|tenant|locataire|intertenant|cross[-_ ]?tenant/i, // repris de T11.spec.ts MOTIF_CONTROLE_ISOLATION
};
function classeDeNom(nom: string): Classe | null {
  for (const c of Object.keys(MOTIFS_CLASSE) as Classe[]) if (MOTIFS_CLASSE[c].test(nom)) return c;
  return null;
}
function classeDeId(id: string): Classe {
  const c = classeDeNom(id);
  if (c === null) throw new Error(`CLASSE-INCONNUE pour ${id}`);
  return c;
}
/** Classification d'UN controle de `bench demo` : `exigence` (DECISIF, exact) puis `nom` (repli flou). */
function classeDeControle(c: { nom: string; exigence: string | null }): Classe | null {
  if (c.exigence !== null) {
    const parClexigence = classeDeNom(c.exigence);
    if (parClexigence !== null) return parClexigence;
  }
  return classeDeNom(c.nom);
}

/* ──────────────────── lecture FLOUE de `bench demo` (reprise de T11.spec.ts) */

type Statut = 'VERT' | 'ROUGE' | 'INCONNU';
function statutDe(v: unknown): Statut {
  if (typeof v === 'boolean') return v ? 'VERT' : 'ROUGE';
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^(pass(ed)?|ok|success|succeeded|green|vert|satisfied|satisfaite|conforme|valid|clean|holds)$/i.test(s)) return 'VERT';
    if (/^(fail(ed)?|ko|error|red|rouge|violated|violation|breach|broken|detected|non[-_ ]?conforme|invalid|leak(ed)?)$/i.test(s)) return 'ROUGE';
  }
  return 'INCONNU';
}
const ALIAS_CONTROLES = ['controls', 'controles', 'business_controls', 'controles_metier', 'checks', 'business_checks', 'oracle_checks', 'controles_oracle', 'verifications', 'audits'];
const ALIAS_NOM = ['id', 'name', 'nom', 'control', 'controle', 'check', 'code', 'label', 'libelle'];
const ALIAS_STATUT = ['status', 'statut', 'state', 'etat', 'result', 'resultat', 'outcome', 'verdict', 'passed', 'ok'];
/**
 * Un controle metier peut porter, A COTE de son nom lisible, l'identifiant
 * `id@version` de l'exigence qu'il verifie (ADR-009:L34 : `reserve@1`,
 * `idempotence@1`, `cancel@1`, `fifo@1`, `isolation@1` — observe tel quel,
 * sous ce nom de champ, sur une invocation reelle de `bench demo`, qui est
 * un DELIVRABLE DEJA PROUVE de T11, jamais une source de T51). Quand ce
 * champ est present, il est LA classification DECISIVE (exacte, par
 * prefixe) ; le motif sur le nom lisible (`classeDeNom`) n'est qu'un
 * REPLI pour une sortie qui ne le porterait pas.
 */
const ALIAS_EXIGENCE = ['requirement', 'requirement_id', 'exigence', 'id_exigence', 'capability_id'];

function normKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function champ(o: unknown, alias: readonly string[]): unknown {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const cible = new Set(alias.map(normKey));
  for (const [k, v] of Object.entries(o as Json)) if (cible.has(normKey(k)) && v !== undefined) return v;
  return undefined;
}
type Noeud = { chemin: string; valeur: unknown };
function noeuds(racine: unknown, profMax = 9): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const visiter = (v: unknown, chemin: string, prof: number): void => {
    out.push({ chemin, valeur: v });
    if (prof >= profMax || v === null || typeof v !== 'object' || vus.has(v)) return;
    vus.add(v);
    if (Array.isArray(v)) {
      v.forEach((x, i) => visiter(x, `${chemin}[${i}]`, prof + 1));
    } else {
      for (const [k, x] of Object.entries(v as Json)) visiter(x, `${chemin}.${k}`, prof + 1);
    }
  };
  visiter(racine, '$', 0);
  return out;
}
function tableauProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.valeur === null || typeof n.valeur !== 'object' || Array.isArray(n.valeur)) continue;
    for (const [k, v] of Object.entries(n.valeur as Json)) {
      if (cible.has(normKey(k)) && Array.isArray(v)) return { chemin: `${n.chemin}.${k}`, valeur: v };
    }
  }
  return null;
}
function champProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.valeur === null || typeof n.valeur !== 'object' || Array.isArray(n.valeur)) continue;
    for (const [k, v] of Object.entries(n.valeur as Json)) {
      if (cible.has(normKey(k))) return { chemin: `${n.chemin}.${k}`, valeur: v };
    }
  }
  return null;
}
type Controle = { nom: string; exigence: string | null; statut: Statut };
function controlesDe(racine: unknown): Controle[] | null {
  const t = tableauProfond(racine, ALIAS_CONTROLES);
  const lire = (x: unknown): Controle | null => {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) return null;
    const nom = champ(x, ALIAS_NOM);
    const st = champ(x, ALIAS_STATUT);
    const exigence = champ(x, ALIAS_EXIGENCE);
    if (typeof nom !== 'string') return null;
    return { nom, exigence: typeof exigence === 'string' ? exigence : null, statut: statutDe(st) };
  };
  if (t !== null && Array.isArray(t.valeur)) {
    const liste = (t.valeur as unknown[]).map(lire).filter((c): c is Controle => c !== null);
    if (liste.length > 0) return liste;
  }
  const d = champProfond(racine, ALIAS_CONTROLES);
  if (d !== null && d.valeur !== null && typeof d.valeur === 'object' && !Array.isArray(d.valeur)) {
    const liste: Controle[] = [];
    for (const [k, v] of Object.entries(d.valeur as Json)) {
      const st = statutDe(v);
      const exigence = champ(v, ALIAS_EXIGENCE);
      liste.push({ nom: k, exigence: typeof exigence === 'string' ? exigence : null, statut: st === 'INCONNU' ? statutDe(champ(v, ALIAS_STATUT)) : st });
    }
    if (liste.length > 0) return liste;
  }
  return null;
}

/** La classification par classe metier (II.4/IV.1) d'une liste de controles de `bench demo`. */
function classerDemo(liste: Controle[]): Map<Classe, Statut> {
  const out = new Map<Classe, Statut>();
  for (const c of liste) {
    const classe = classeDeControle(c);
    if (classe === null) continue;
    const prec = out.get(classe);
    // Si plusieurs entrees portent la MEME classe, ROUGE l'emporte (une seule
    // violation suffit a rendre la classe violee sur l'ensemble du run).
    if (prec === undefined || prec === 'VERT') out.set(classe, c.statut);
  }
  return out;
}

/** `bench demo`, invoquee comme PROCESSUS (jamais importee — packages/scenario est un source_path de T51). */
function lancerDemo(options: { variant?: string }): AppelCli {
  const drapeaux = ['--mode', 'recorded', '--storage', 'memory'];
  if (options.variant !== undefined) drapeaux.push('--variant', options.variant);
  return lancer('demo', drapeaux);
}

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T51 — exercer et controler le code du candidat a chaque periode', () => {
  test(
    'T51.A1 une application de reference respectant bench.candidate/2 obtient exactement les statuts de controle de l’application scriptee nominale ; une fautive obtient exactement ceux de la variante fautive (ADR:L96)',
    () => {
      // (1) TEMOINS INDEPENDANTS : l'application scriptee nominale et la
      //     variante fautive `cross-tenant-read` (cahier L251, T11.A6).
      const nominal = lancerDemo({});
      exige(nominal.resultat !== null, 'demo-nominale-executee', messageEchec('demo nominale', nominal));
      const cNominal = controlesDe(nominal.resultat);
      exige(cNominal !== null, 'demo-nominale-controles-publies', `CONTROLES-ABSENTS : ${rendu(nominal.resultat)}`);
      const clNominal = classerDemo(cNominal as Controle[]);

      const variante = lancerDemo({ variant: 'cross-tenant-read' });
      exige(variante.resultat !== null, 'demo-variante-executee', messageEchec('demo cross-tenant-read', variante));
      const cVariante = controlesDe(variante.resultat);
      exige(cVariante !== null, 'demo-variante-controles-publies', `CONTROLES-ABSENTS : ${rendu(variante.resultat)}`);
      const clVariante = classerDemo(cVariante as Controle[]);

      for (const classe of Object.keys(MOTIFS_CLASSE) as Classe[]) {
        exige(clNominal.has(classe), `classe-${classe}-presente-en-nominal`, `classes vues : ${rendu([...clNominal.keys()])}`);
      }

      // (2) QUATRE PERIODES, candidat de reference CORRECT.
      const ctxOk = nouveauContexte('a1-ok');
      const controlesParPeriodeOk: Json[][] = [];
      for (let p = 1; p <= 4; p += 1) {
        const appel = candidateControlPeriod(ctxOk, REFERENCE_V2_ARGV, 60_000);
        exige(appel.resultat !== null, `periode-${p}-ok-executee`, messageEchec(`ok periode ${p}`, appel));
        const r = appel.resultat as Json;
        exige(indexDe(r) === p, `periode-${p}-index-${p}`, `vu ${rendu(indexDe(r))} dans ${rendu(r)}`);
        exige(deployeDe(r) === true, `periode-${p}-ok-deployee`, `vu ${rendu(deployeDe(r))} dans ${rendu(r)}`);
        controlesParPeriodeOk.push(controlesMienDe(r));
      }
      // TEMOIN DECISIF (III.1, mutant T51.M1) : le processus a REELLEMENT
      // repondu — canal hors-contrat que seul un vrai sous-processus remplit.
      const journalOk = fs
        .readFileSync(path.join(workspaceDirCourant(ctxOk), 'ops-received.log'), 'utf8')
        .split('\n')
        .filter((l) => l.length > 0);
      exige(journalOk.length > 0, 'processus-correct-a-reellement-recu-des-operations', `0 ligne dans ops-received.log sous ${workspaceDirCourant(ctxOk)}`);

      const classementOk = classerMesControles(controlesParPeriodeOk);
      for (const classe of Object.keys(MOTIFS_CLASSE) as Classe[]) {
        exige(
          classementOk.get(classe) === clNominal.get(classe),
          `classe-${classe}-identique-au-nominal`,
          `candidat-correct=${rendu(classementOk.get(classe))} nominal=${rendu(clNominal.get(classe))}`,
        );
      }

      // (3) QUATRE PERIODES, candidat de reference FAUTIF (isolation).
      const ctxFautif = nouveauContexte('a1-fautif');
      const controlesParPeriodeFautif: Json[][] = [];
      for (let p = 1; p <= 4; p += 1) {
        const appel = candidateControlPeriod(ctxFautif, REFERENCE_V2_FAUTIF_ARGV, 60_000);
        exige(appel.resultat !== null, `periode-${p}-fautif-executee`, messageEchec(`fautif periode ${p}`, appel));
        const r = appel.resultat as Json;
        exige(deployeDe(r) === true, `periode-${p}-fautif-deployee`, `vu ${rendu(deployeDe(r))} dans ${rendu(r)}`);
        controlesParPeriodeFautif.push(controlesMienDe(r));
      }
      const journalFautif = fs
        .readFileSync(path.join(workspaceDirCourant(ctxFautif) as string, 'ops-received.log'), 'utf8')
        .split('\n')
        .filter((l) => l.length > 0);
      exige(journalFautif.length > 0, 'processus-fautif-a-reellement-recu-des-operations', `0 ligne dans ops-received.log sous ${workspaceDirCourant(ctxFautif)}`);

      const classementFautif = classerMesControles(controlesParPeriodeFautif);

      // (4) L'ASSERTION DECISIVE : EGALITE avec la variante fautive EXACTEMENT.
      for (const classe of Object.keys(MOTIFS_CLASSE) as Classe[]) {
        exige(
          classementFautif.get(classe) === clVariante.get(classe),
          `classe-${classe}-identique-a-la-variante-fautive`,
          `candidat-fautif=${rendu(classementFautif.get(classe))} variante=${rendu(clVariante.get(classe))}`,
        );
      }

      // (5) DETECTION CIBLEE (III.2) : isolation est la SEULE classe qui differe
      //     entre le candidat correct et le candidat fautif.
      const diff = (Object.keys(MOTIFS_CLASSE) as Classe[]).filter((c) => classementOk.get(c) !== classementFautif.get(c));
      exige(diff.length === 1 && diff[0] === 'isolation', 'seule-isolation-differe-entre-correct-et-fautif', `classes differentes : ${rendu(diff)}`);
      exige(classementOk.get('isolation') === 'VERT', 'isolation-vert-pour-le-candidat-correct', `vu ${rendu(classementOk.get('isolation'))}`);
      exige(classementFautif.get('isolation') === 'ROUGE', 'isolation-rouge-pour-le-candidat-fautif', `vu ${rendu(classementFautif.get('isolation'))}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T51.A2 chaque periode porte, pour chaque controle, son identifiant, son statut et les deux termes compares (ADR:L96)',
    () => {
      echeancesAncreesDansLaRacineGelee('A2');

      // SC-003 (option A) : a CHAQUE periode p, CHAQUE controle DU a p porte
      // identifiant, statut et les deux termes compares, lies au statut ; AUCUN
      // controle non du n'est present ; aucun identifiant hors de l'ensemble
      // du ni en double. Exerce a TOUTES les periodes, pour les DEUX
      // candidats de reference (la version anterieure n'observait que P2).
      const verifierPeriode = (label: string, p: number, r: Json): void => {
        exige(indexDe(r) === p, `${label}-periode-${p}-index-${p}`, `vu ${rendu(indexDe(r))} dans ${rendu(r)}`);
        const controles = controlesMienDe(r);
        const dus = controlesDus(p);
        const ids = controles.map((c) => c.id);
        exige(
          controles.length === dus.length,
          `${label}-periode-${p}-${dus.length}-controles-dus-presents`,
          `dus ${rendu(dus)} ; vu ${controles.length} : ${rendu(ids)}`,
        );
        exige(
          ids.every((id) => typeof id === 'string' && (dus as string[]).includes(id)) && new Set(ids).size === ids.length,
          `${label}-periode-${p}-aucun-controle-hors-ensemble-du-ni-en-double`,
          `dus ${rendu(dus)} ; vu ${rendu(ids)}`,
        );
        for (const id of controlesNonDus(p)) {
          exige(!ids.includes(id), `${label}-periode-${p}-controle-${id}-non-du-absent`, `TROUVE a la periode ${p} (du a P${ECHEANCE_CONTROLE[id]}) : ${rendu(ids)}`);
        }
        for (const id of dus) {
          const c = controles.find((x) => x.id === id);
          exige(c !== undefined, `${label}-periode-${p}-controle-${id}-present`, `absent de ${rendu(ids)}`);
          const entree = (c ?? {}) as Json;
          exige(entree.status === 'satisfied' || entree.status === 'violated', `${label}-periode-${p}-controle-${id}-statut-reconnu`, `vu ${rendu(entree.status)}`);
          exige('actual' in entree, `${label}-periode-${p}-controle-${id}-porte-actual`, `absent de ${rendu(entree)}`);
          exige('expected' in entree, `${label}-periode-${p}-controle-${id}-porte-expected`, `absent de ${rendu(entree)}`);
          // LE LIEN DECISIF (III.3, mutant T51.M2) : le statut est COHERENT avec
          // les deux termes, jamais affirme par construction.
          const egaux = egalesCanonique(entree.actual, entree.expected);
          if (entree.status === 'satisfied') {
            exige(egaux, `${label}-periode-${p}-controle-${id}-satisfied-implique-actual-egal-expected`, `actual=${rendu(entree.actual)} expected=${rendu(entree.expected)}`);
          } else {
            exige(!egaux, `${label}-periode-${p}-controle-${id}-violated-implique-actual-different-expected`, `actual=${rendu(entree.actual)} expected=${rendu(entree.expected)}`);
          }
        }
      };

      const ctxOk = nouveauContexte('a2-ok');
      for (let p = 1; p <= 4; p += 1) {
        const appel = candidateControlPeriod(ctxOk, REFERENCE_V2_ARGV, 60_000);
        exige(appel.resultat !== null, `periode-${p}-executee`, messageEchec(`periode ${p}`, appel));
        verifierPeriode('correct', p, (appel.resultat ?? {}) as Json);
      }

      // Le MEME lien, verifie sur un controle REELLEMENT VIOLE (candidat fautif).
      const ctxFautif = nouveauContexte('a2-fautif');
      let dernierFautif: Json | null = null;
      for (let p = 1; p <= 4; p += 1) {
        const appel = candidateControlPeriod(ctxFautif, REFERENCE_V2_FAUTIF_ARGV, 60_000);
        exige(appel.resultat !== null, `fautif-periode-${p}-executee`, messageEchec(`fautif periode ${p}`, appel));
        verifierPeriode('fautif', p, (appel.resultat ?? {}) as Json);
        dernierFautif = appel.resultat as Json;
      }
      const controlesFautif = controlesMienDe(dernierFautif);
      const iso = controlesFautif.find((x) => x.id === 'isolation@1');
      exige(iso !== undefined, 'controle-isolation-present-chez-le-fautif', `absent de ${rendu(controlesFautif.map((x) => x.id))}`);
      const isoEntree = iso as Json;
      exige(isoEntree.status === 'violated', 'controle-isolation-viole-chez-le-fautif', `vu ${rendu(isoEntree.status)}`);
      exige(
        !egalesCanonique(isoEntree.actual, isoEntree.expected),
        'isolation-violee-a-bien-des-termes-differents',
        `actual=${rendu(isoEntree.actual)} expected=${rendu(isoEntree.expected)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T51.A3 un candidat qui ne demarre pas, ne repond pas dans le delai ou viole le format du contrat est declare non deploye avec un motif nomme, controles evalues et violes sans omission, sans faire echouer la periode (ADR:L96)',
    () => {
      const DELAI_MS = 1500;

      const casParMotif: { label: string; argv: string[]; raison: string }[] = [
        { label: 'not-starting', argv: ['node', NOT_STARTING], raison: RAISON.START_FAILED },
        { label: 'unresponsive', argv: ['node', UNRESPONSIVE], raison: RAISON.TIMEOUT },
        { label: 'malformed', argv: ['node', MALFORMED], raison: RAISON.PROTOCOL_VIOLATION },
      ];

      echeancesAncreesDansLaRacineGelee('A3');

      // SC-003 (option A) : « sans qu'aucun soit omis » s'entend des controles
      // DUS a la periode. Chaque forme de defaillance est donc exercee sur les
      // QUATRE periodes (la version anterieure n'observait que P1) : a chaque
      // periode p, CHAQUE controle du a p est evalue et viole, aucun n'est
      // omis, aucun controle non du n'est present — de sorte que l'ensemble
      // des cinq identifiants est couvert au fil de la trajectoire.
      for (const cas of casParMotif) {
        const ctx = nouveauContexte(`a3-${cas.label}`);
        for (let p = 1; p <= 4; p += 1) {
          const appel = candidateControlPeriod(ctx, cas.argv, DELAI_MS);
          exige(appel.resultat !== null, `${cas.label}-periode-${p}-executee`, messageEchec(`${cas.label} periode ${p}`, appel));
          const r = (appel.resultat ?? {}) as Json;
          exige(indexDe(r) === p, `${cas.label}-periode-${p}-index-${p}`, `vu ${rendu(indexDe(r))} dans ${rendu(r)}`);
          exige(deployeDe(r) === false, `${cas.label}-periode-${p}-non-deploye`, `vu ${rendu(deployeDe(r))} dans ${rendu(r)}`);
          exige(motifDe(r) === cas.raison, `${cas.label}-periode-${p}-motif-${cas.raison}`, `vu ${rendu(motifDe(r))} dans ${rendu(r)}`);

          const controles = controlesMienDe(r);
          const ids = controles.map((c) => c.id);
          const dus = controlesDus(p);
          exige(
            controles.length === dus.length,
            `${cas.label}-periode-${p}-${dus.length}-controles-dus-sans-omission`,
            `dus ${rendu(dus)} ; vu ${controles.length} : ${rendu(ids)}`,
          );
          exige(
            ids.every((id) => typeof id === 'string' && (dus as string[]).includes(id)) && new Set(ids).size === ids.length,
            `${cas.label}-periode-${p}-aucun-controle-hors-ensemble-du-ni-en-double`,
            `dus ${rendu(dus)} ; vu ${rendu(ids)}`,
          );
          for (const id of controlesNonDus(p)) {
            exige(!ids.includes(id), `${cas.label}-periode-${p}-controle-${id}-non-du-absent`, `TROUVE a la periode ${p} (du a P${ECHEANCE_CONTROLE[id]}) : ${rendu(ids)}`);
          }
          for (const id of dus) {
            const c = controles.find((x) => x.id === id);
            exige(c !== undefined, `${cas.label}-periode-${p}-controle-${id}-present`, `absent de ${rendu(ids)}`);
            const entree = (c ?? {}) as Json;
            exige(entree.status === 'violated', `${cas.label}-periode-${p}-controle-${id}-viole`, `vu ${rendu(entree.status)}`);
          }
        }
      }

      // CONTROLE ANTI-REFUS-UNIVERSEL (III.4) : un candidat CORRECT, meme
      // trajectoire (tentative) distincte, est deploye, motif null.
      const ctxOk = nouveauContexte('a3-ok');
      const appelOk = candidateControlPeriod(ctxOk, REFERENCE_V2_ARGV, DELAI_MS);
      exige(appelOk.resultat !== null, 'candidat-correct-periode-executee', messageEchec('candidat correct', appelOk));
      const rOk = appelOk.resultat as Json;
      exige(deployeDe(rOk) === true, 'A3-controle-candidat-correct-deploye', `vu ${rendu(deployeDe(rOk))} dans ${rendu(rOk)}`);
      exige(motifDe(rOk) === null, 'A3-controle-aucun-motif', `vu ${rendu(motifDe(rOk))} dans ${rendu(rOk)}`);

      // L'ASSERTION DECISIVE : la MEME trajectoire (not-starting) avance
      // normalement a la periode suivante — le non-deploiement n'a PAS fait
      // echouer la periode.
      const ctxStart = nouveauContexte('a3-not-starting-suite');
      const p1 = candidateControlPeriod(ctxStart, ['node', NOT_STARTING], DELAI_MS);
      exige(p1.resultat !== null, 'not-starting-periode-1-executee', messageEchec('not-starting p1', p1));
      exige(indexDe(p1.resultat) === 1, 'not-starting-periode-1-index-1', `vu ${rendu(indexDe(p1.resultat))}`);
      const p2 = candidateControlPeriod(ctxStart, ['node', NOT_STARTING], DELAI_MS);
      exige(p2.resultat !== null, 'not-starting-periode-2-executee', messageEchec('not-starting p2', p2));
      exige(indexDe(p2.resultat) === 2, 'periode-avance-malgre-le-non-deploiement', `vu ${rendu(indexDe(p2.resultat))} dans ${rendu(p2.resultat)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T51.A4 le rapport de fin donne, par trajectoire et par periode, le nombre de controles satisfaits et violes, egal aux statuts persistes (ADR:L96)',
    () => {
      echeancesAncreesDansLaRacineGelee('A4');

      // SC-003 (option A) : les comptes portent sur les controles DUS a la
      // periode. Les sommes locales sont calculees, comme avant, sur les
      // reponses DEJA RECUES de `candidate-control-period` (temoin
      // INDEPENDANT du rapport, III.5), mais exigees sur l'ensemble du —
      // jamais sur un « cinq » fixe que T54.A2 interdit desormais avant P4.
      for (const [suffixe, argv] of [
        ['a4-ok', REFERENCE_V2_ARGV],
        ['a4-fautif', REFERENCE_V2_FAUTIF_ARGV],
      ] as const) {
        const ctx = nouveauContexte(suffixe);
        const sommesLocales = new Map<number, { satisfied: number; violated: number }>();
        for (let p = 1; p <= 4; p += 1) {
          const appel = candidateControlPeriod(ctx, [...argv], 60_000);
          exige(appel.resultat !== null, `${suffixe}-periode-${p}-executee`, messageEchec(`${suffixe} periode ${p}`, appel));
          exige(indexDe(appel.resultat) === p, `${suffixe}-periode-${p}-index-${p}`, `vu ${rendu(indexDe(appel.resultat))}`);
          const controles = controlesMienDe(appel.resultat);
          const dus = controlesDus(p);
          const ids = controles.map((c) => c.id);
          const satisfied = controles.filter((c) => c.status === 'satisfied').length;
          const violated = controles.filter((c) => c.status === 'violated').length;
          exige(
            satisfied + violated === dus.length,
            `${suffixe}-periode-${p}-${dus.length}-controles-dus-comptes`,
            `dus ${rendu(dus)} ; vu ${satisfied}+${violated} sur ${rendu(ids)}`,
          );
          exige(
            ids.length === dus.length && dus.every((id) => ids.includes(id)),
            `${suffixe}-periode-${p}-comptes-portent-exactement-sur-l-ensemble-du`,
            `dus ${rendu(dus)} ; vu ${rendu(ids)}`,
          );
          sommesLocales.set(p, { satisfied, violated });
        }

        const rapport = candidateControlReport(ctx);
        exige(rapport.resultat !== null, `${suffixe}-rapport-execute`, messageEchec(`${suffixe} rapport`, rapport));
        const periodes = periodesRapportDe(rapport.resultat);
        exige(periodes.length === 4, `${suffixe}-rapport-quatre-periodes`, `vu ${periodes.length} : ${rendu(periodes)}`);

        for (let p = 1; p <= 4; p += 1) {
          const ligne = periodes.find((x) => Number(x.period_index) === p);
          exige(ligne !== undefined, `${suffixe}-rapport-periode-${p}-presente`, `absente de ${rendu(periodes)}`);
          const attendu = sommesLocales.get(p) as { satisfied: number; violated: number };
          exige(
            Number((ligne as Json).satisfied) === attendu.satisfied,
            `${suffixe}-rapport-periode-${p}-satisfied-egal`,
            `rapport=${rendu((ligne as Json).satisfied)} persiste=${attendu.satisfied}`,
          );
          exige(
            Number((ligne as Json).violated) === attendu.violated,
            `${suffixe}-rapport-periode-${p}-violated-egal`,
            `rapport=${rendu((ligne as Json).violated)} persiste=${attendu.violated}`,
          );
          exige(
            Number((ligne as Json).satisfied) + Number((ligne as Json).violated) === controlesDus(p).length,
            `${suffixe}-rapport-periode-${p}-somme-egale-aux-${controlesDus(p).length}-controles-dus`,
            `rapport=${rendu(ligne)} dus=${rendu(controlesDus(p))}`,
          );
        }
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T51.A5 aucun fichier de l’oracle, des controles ou des exigences d’une periode suivante n’est ecrit dans l’espace de travail du candidat (ADR:L96)',
    () => {
      const ctx = nouveauContexte('a5');
      const p1 = candidateControlPeriod(ctx, REFERENCE_V2_ARGV, 60_000);
      exige(p1.resultat !== null, 'periode-1-executee', messageEchec('periode 1', p1));
      const dir = workspaceDirDe(p1.resultat);
      exige(typeof dir === 'string' && dir.length > 0 && fs.existsSync(dir), 'repertoire-de-travail-reel', `vu ${rendu(dir)}`);

      // Litteraux INTERDITS (III.6) : AUCUN n'est jamais ECRIT (stdout,
      // state.json, ops-received.log) par les fixtures de reference
      // elles-memes — verifie ci-dessous sur le CODE de la fixture, ses
      // COMMENTAIRES exclus. Les commentaires de la fixture (zone
      // ACCEPTANCE) citent legitimement le nom de la racine gelee
      // F-RESERVATION et des echeances a des fins de documentation (voir
      // l'en-tete de reservation-candidate-v2.mjs, section « SEMANTIQUE
      // METIER ») ; ils ne sont jamais executes et ne sont donc jamais
      // ecrits dans aucun fichier a l'execution — les inclure dans ce
      // controle ferait echouer la precondition sur du texte qui ne
      // s'execute jamais, independamment de toute implementation de T51, ce
      // qui n'est pas la question que A5 pose. Toute occurrence apres cette
      // exclusion, dans le CODE qui s'execute reellement, prouverait que le
      // temoin lui-meme n'est pas probant ; toute occurrence dans l'espace
      // de travail SCANNE plus bas prouve donc une fuite du MOTEUR, jamais
      // du candidat.
      function sansCommentairesJs(src: string): string {
        return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      }
      const sourceCandidat = sansCommentairesJs(fs.readFileSync(REFERENCE_V2, 'utf8'));
      const interdits = [
        ...CONTROLES_FIXES, // identifiants de controle (ADR-009:L34)
        'F-RESERVATION', // nom de la fixture oracle (racine gelee)
        'F-REGRESSION',
        '2030-01-01T01:00:00Z', // horloge de P2 (F-RESERVATION) — exigence d'une periode FUTURE, avant que P2 ne soit jamais appelee
        '2030-01-02T11:00:00Z', // horloge de P3
        '2030-01-02T13:00:00Z', // horloge de P4
      ];
      for (const litteral of interdits) {
        exige(
          !sourceCandidat.includes(litteral),
          `fixture-candidat-ne-contient-pas-elle-meme-${litteral}`,
          `le litteral ${litteral} apparait dans la fixture candidat elle-meme : le temoin ne serait pas probant`,
        );
      }

      const trouves: string[] = [];
      const scanner = (d: string): void => {
        for (const entree of fs.readdirSync(d, { withFileTypes: true })) {
          if (entree.name === '.git') continue;
          const chemin = path.join(d, entree.name);
          if (entree.isDirectory()) {
            scanner(chemin);
          } else if (entree.isFile()) {
            let contenu = '';
            try {
              contenu = fs.readFileSync(chemin, 'utf8');
            } catch {
              continue; // fichier binaire illisible en UTF-8 : ignore, jamais une preuve de fuite
            }
            for (const litteral of interdits) {
              if (contenu.includes(litteral)) trouves.push(`${chemin} contient ${litteral}`);
            }
          }
        }
      };
      scanner(dir as string);
      exige(trouves.length === 0, 'aucun-litteral-interdit-dans-l-espace-de-travail-apres-une-periode', rendu(trouves));
    },
    CASE_TIMEOUT_MS,
  );
});

/* ───────────────────────────────────────────────── utilitaires de cas (A1) */

const WORKSPACE_PAR_CTX = new Map<string, string>();
function workspaceDirCourant(ctx: Contexte): string {
  const memo = WORKSPACE_PAR_CTX.get(ctx.campaignId);
  if (memo !== undefined) return memo;
  // Derive le workspace_dir en relancant une periode LECTURE-SEULE n'est pas
  // possible (chaque appel avance la periode) : on retrouve donc le chemin en
  // listant le SEUL sous-repertoire reel que la racine fournie contient,
  // puisque chaque contexte de cette suite recoit une racine FRAICHE et
  // n'heberge donc qu'une trajectoire.
  const enfants = fs.readdirSync(ctx.workspaceRoot).filter((n) => fs.statSync(path.join(ctx.workspaceRoot, n)).isDirectory());
  exige(enfants.length === 1, 'un-seul-sous-repertoire-de-travail-derive', `vu ${rendu(enfants)} sous ${ctx.workspaceRoot}`);
  const dir = path.join(ctx.workspaceRoot, enfants[0] as string);
  WORKSPACE_PAR_CTX.set(ctx.campaignId, dir);
  return dir;
}

/** VERT/ROUGE agrege sur les quatre periodes d'UNE classe, pour MES controles. */
function classerMesControles(controlesParPeriode: Json[][]): Map<Classe, Statut> {
  const out = new Map<Classe, Statut>();
  for (const id of CONTROLES_FIXES) {
    const classe = classeDeId(id);
    let statut: Statut = 'INCONNU';
    for (const periode of controlesParPeriode) {
      const entree = periode.find((c) => c.id === id);
      if (entree === undefined) continue;
      const s: Statut = entree.status === 'satisfied' ? 'VERT' : entree.status === 'violated' ? 'ROUGE' : 'INCONNU';
      if (statut === 'INCONNU' || s === 'ROUGE') statut = s;
    }
    out.set(classe, statut);
  }
  return out;
}
