/**
 * acceptance/T52.spec.ts — suite d'acceptation de la tache T52.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T52.A1 behaviour — le prompt d'une periode et l'adaptateur derivent
 *                      d'une meme description exportee, et le prompt
 *                      enonce la commande de lancement, le signal de
 *                      demarrage, la forme des requetes et celle des
 *                      reponses
 *   T52.A2 behaviour — avec un faux `claude` qui ecrit dans l'espace de
 *                      travail un candidat de reference conforme au
 *                      prompt, `bench pilot-conduct --provider claude-cli
 *                      --live` persiste pour chaque periode les statuts de
 *                      controle de l'application scriptee nominale, et un
 *                      candidat de reference fautif ceux de la variante
 *                      fautive
 *   T52.A3 behaviour — le code controle a une periode est exactement le
 *                      commit de fin produit par la session de cette
 *                      periode
 *   T52.A4 behaviour — la session de la periode k+1 demarre dans l'espace
 *                      de travail du commit de fin de la periode k
 *   T52.A5 numeric   — le rapport de fin donne, pour la meme execution,
 *                      les tokens par modele et par categorie et les
 *                      statuts de controle par periode, egaux aux valeurs
 *                      persistees
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T52 EST UNE TACHE D'EXTENSION (ADR-010) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T52 — `packages/
 * activities`, `packages/agents` et `apps/cli` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL,
 * discipline auditable au diff, pas une barriere technique). Le contrat
 * teste ci-dessous est derive de docs/specs/T52.md et de sa source,
 * docs/adr/ADR-010-pilote-reel-de-bout-en-bout.md, lignes 60 a 66 (la plage
 * que la carte de T52 epingle dans
 * verification/tasks.extensions.json#spec_source) :
 *
 *   L60  titre : « Conduire le pilote reel de bout en bout »
 *   L62  dependances T49, T50 et T51 ; livrables, mot pour mot : « une
 *        description unique et exportee du contrat `bench.candidate/2`,
 *        convention de lancement et format des messages compris, dont
 *        derivent le prompt et l'adaptateur ; une periode a candidat reel
 *        qui enchaine la session, le commit, puis le lancement et le
 *        controle du code de ce commit dans le meme espace de travail ; le
 *        rapport de fin qui reunit tokens et statuts de controle »
 *   L64  les cinq cas d'acceptation, mot pour mot
 *   L66  commande : `pnpm verify:task T52`. « PostgreSQL, le stockage objet
 *        et le faux executable `claude` sont requis ; aucun appel reel. »
 *
 * ADR-010 ne developpe PAS de section narrative distincte de la plage
 * epinglee (contrairement a ADR-007/008/009 : titre+livrables+acceptation+
 * commande constituent tout le document pour T52) — cette suite ne lit donc
 * rien hors L60-66.
 *
 * T52 ferme la boucle que trois dependances ont ouverte separement, et que
 * cette suite REPREND SANS LES RELIRE (meme geste que acceptance/
 * T51.spec.ts face a T48/T50) :
 *   - acceptance/T49.spec.ts a DEJA fixe que `run-period` ET `pilot-conduct`
 *     acceptent `--provider claude-cli --live --candidate-workspace-root
 *     <dir>`, qu'une session DEVELOPPE et que son commit de fin est
 *     sauvegarde dans l'espace de travail derive, et que `pilot-conduct`
 *     agrege `candidate_token_report.by_model` CUMULATIVEMENT — mais SON
 *     fixture ne repond JAMAIS au protocole NDJSON (« il simule seulement
 *     l'ECRITURE d'un fichier [...] jamais un candidat exerce en phase
 *     EXERCISING », T49.spec.ts V) : AUCUN de ses six cas ne lance ni ne
 *     controle le code produit.
 *   - acceptance/T50.spec.ts a DEJA fixe que le prompt d'une session
 *     CONTIENT le nom et la forme (arguments, reponse) de chacune des six
 *     operations `bench.candidate/2` — mais ne verifie PAS que ce prompt
 *     enonce aussi la MECANIQUE DE TRANSPORT (comment le processus candidat
 *     sera lance, quel signal de demarrage il doit emettre, la forme de
 *     l'enveloppe de requete/reponse) : ces details de transport sont
 *     hors du perimetre de T50 (sa suite ne lance jamais le candidat).
 *   - acceptance/T51.spec.ts a DEJA fixe et PROUVE `candidate-control-
 *     period`/`candidate-control-report`, le protocole NDJSON qu'ils
 *     emploient (REPRIS A L'IDENTIQUE de acceptance/T48.spec.ts, III.2), et
 *     la REPARTITION EXACTE des statuts de controle sur le scenario de
 *     demonstration : un candidat de reference CORRECT obtient `satisfied=5,
 *     violated=0` a CHAQUE periode (cinq classes metier, TOUTES VERTES), un
 *     candidat de reference FAUTIF (variante `cross-tenant-read`) obtient
 *     EXACTEMENT `satisfied=4, violated=1` (SEULE la classe `isolation`
 *     bascule — T51.spec.ts, test A1, assertion `diff.length===1 &&
 *     diff[0]==='isolation'`) — mais cette commande est appelee
 *     DIRECTEMENT par la suite de T51, JAMAIS enchainee automatiquement
 *     apres une session de developpement : `candidate-control-period`
 *     controle un processus-candidat FOURNI par `--candidate-command`, pas
 *     un commit PRODUIT par une session `claude -p` dans le MEME appel.
 *
 * Ce que NI T49, NI T50, NI T51 n'exercent ensemble, et que T52 ajoute :
 * UN SEUL appel `bench pilot-conduct --provider claude-cli --live` qui, pour
 * chaque periode, (a) lance la session (T49/T50, deja prouve), (b) sauvegarde
 * son commit de fin (T49, deja prouve), PUIS (c) lance et controle CE MEME
 * commit, dans LE MEME espace de travail, avec le protocole NDJSON de T51
 * (jamais exerce par T49/T50), ET persiste le resultat — et un rapport de
 * fin qui reunit les deux comptabilites (tokens, deja fixe par T49 ;
 * statuts de controle, NOUVEAU ici).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUI EST FIXE PAR CETTE SUITE, FAUTE D'ENONCE DANS L'ADR SUR LA FORME
 * EXACTE DE LA COMMANDE ET DU PROTOCOLE (meme geste que T46 fixant
 * `pilot-conduct`, T48 fixant `candidate-period`, T51 fixant
 * `candidate-control-period`). Aucune des valeurs listees ici n'a ete
 * obtenue en executant une implementation de T52 : aucune n'existe au
 * moment ou cette suite est ecrite (ADR-001).
 *
 * 1. AUCUN NOUVEAU DRAPEAU. `bench pilot-conduct <manifest.json>
 *    --campaign-id <id> --postgres-database <db> --s3-bucket <bucket>
 *    --mode recorded --provider claude-cli --live --candidate-workspace-root
 *    <dir> [--test-stop-after-periods <n>]` — EXACTEMENT la surface DEJA
 *    fixee par acceptance/T46.spec.ts (II.1) et etendue par acceptance/
 *    T49.spec.ts (II.2) pour le fournisseur `claude-cli`. T52 n'ajoute AUCUN
 *    drapeau : son unique livrable observable par cette suite est que la
 *    MEME invocation, deja capable de developper et de committer (T49),
 *    controle desormais aussi, et persiste le resultat.
 *
 * 2. UN SEUL CHAMP DE SORTIE AJOUTE (claude-cli uniquement), en plus de
 *    `candidate_token_report` (T49, II.2) :
 *
 *      candidate_control_report: [ { trajectory_key, periods: [
 *        { period_index, satisfied, violated } ] } ]
 *
 *    Nomme PAR PARALLELISME EXACT avec `candidate_token_report` (meme
 *    prefixe `candidate_`, meme geste qui distingue ce canal de celui, SANS
 *    RAPPORT, qu'un `--provider fake` alimenterait). Forme de chaque entree
 *    de periode IDENTIQUE a celle que rend deja `candidate-control-report`
 *    (acceptance/T51.spec.ts, II.3) : `satisfied`/`violated`, le compte,
 *    PARMI LES CINQ controles de cette periode (ADR-009:L34, REPRIS par
 *    T51), de ceux a chaque statut. UNE entree de `periods` par periode
 *    REELLEMENT persistee pour la trajectoire, cumulatif (meme discipline
 *    que `periods`/`candidate_token_report.by_model`, T46/T49).
 *
 * 3. LA PERSISTANCE DE CONTROLE INTERNE A `pilot-conduct` EST LA MEME QUE
 *    CELLE DE `candidate-control-period`/`candidate-control-report` (T51),
 *    adressee par le `trajectory_key` que `pilot-conduct` derive pour
 *    chaque trajectoire COMPILEE (meme identite, meme convention que celle
 *    DEJA exploitee par acceptance/T46.spec.ts, I, et acceptance/
 *    T49.spec.ts, IV.(1), pour rappeler `run-period` directement) : un appel
 *    ULTERIEUR et DIRECT de `bench candidate-control-report --campaign-id
 *    <trajectory_key> --postgres-database <db>` (T51, DEJA PROUVE, JAMAIS
 *    reinvente ici) lit la MEME trajectoire de controle que celle que
 *    `pilot-conduct` vient d'ecrire. Sans cette identite PARTAGEE, aucun
 *    canal INDEPENDANT du self-report de `pilot-conduct` n'existerait pour
 *    A5 — exactement le trou que A1/A5 de T46 et IV.(1)/IV.(4) de T49
 *    refusent deja de laisser ouvert pour leurs propres canaux.
 *
 * 4. CONVENTION DE LANCEMENT DU CANDIDAT CONTROLE, FIXEE ICI (ADR L62 :
 *    « convention de lancement [...] dont derivent le prompt et
 *    l'adaptateur ») : le point d'entree que la session doit produire, a la
 *    RACINE du depot derive, se nomme `candidate.mjs` ; l'adaptateur de
 *    controle le lance par `node candidate.mjs`, CWD = le depot derive de
 *    CETTE periode (meme discipline CWD que acceptance/T48.spec.ts,
 *    III.2.a/T51.spec.ts, REFERENCE_V2_ARGV). C'est EXACTEMENT ce litteral
 *    de lancement que le prompt doit enoncer (A1) : un prompt qui dirait
 *    lancer le candidat par une AUTRE commande que celle que l'adaptateur
 *    emploie reellement serait la « copie locale divergente de la
 *    description exportee » que cases.extensions.lock.json#T52.A1 nomme.
 *
 * 5. PROTOCOLE DE TRANSPORT (NDJSON), REPRIS A L'IDENTIQUE de acceptance/
 *    T48.spec.ts (III.2, DEJA prouve, REPRIS SANS MODIFICATION par
 *    acceptance/T51.spec.ts) :
 *      - signal de demarrage : EXACTEMENT une ligne `{"ready":true}`.
 *      - requete : une ligne `{"id","op","args"}`.
 *      - reponse : `{"id","ok":true,"result"}` ou `{"id","ok":false,
 *        "error":{"code","message"}}`.
 *
 * 6. CONTRAT METIER `bench.candidate/2`, REPRIS A L'IDENTIQUE de acceptance/
 *    T50.spec.ts (III, DEJA fixe par PARALLELISME avec `bench.candidate/1`,
 *    acceptance/T48.spec.ts III.3) : six operations, `create_tenant
 *    {tenant_id}->{}`, `advance_clock {to}->{}`, `write {op,actor,tenant_id,
 *    admission_seq,operation_key}->{decision}`, `read {tenant_id,key}->
 *    {value}`, `probe_cancel {tenant_id,key}->{decision}`, `fingerprint {}->
 *    {sha256}`.
 *
 * 7. EXTENSION ADDITIVE DU FIXTURE `acceptance/fixtures/claude-cli/bin/
 *    claude` (zone ACCEPTANCE, DEJA publie par T47, etendu par T49) : deux
 *    NOUVELLES variables d'environnement, `BENCH_FAKE_CLAUDE_
 *    WORKSPACE_WRITE_PLAN_FILE` et `BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_
 *    PLAN_COUNTER_FILE`, documentees dans le fichier lui-meme. NECESSAIRES
 *    parce que l'environnement d'UN appel `pilot-conduct` est le MEME pour
 *    TOUTES les invocations du faux executable qu'il engendre pendant cet
 *    appel (T49.spec.ts l'observe deja explicitement pour `modelUsage`,
 *    test A4 : « le fixture ne peut pas distinguer P1 de P2 par son propre
 *    etat ») — A3/A4 exigent au contraire un contenu DIFFERENT ecrit a la
 *    periode 1 et a la periode 2 d'UN MEME appel chaine, pour observer que
 *    le code CONTROLE suit bien le commit de SA PROPRE periode (A3) et que
 *    la periode suivante demarre bien dans l'espace de travail LAISSE par
 *    la precedente (A4). Le pair existant `RELPATH`/`CONTENT` (T49, II.3)
 *    reste INCHANGE et prioritaire ; cette extension n'affecte aucun
 *    comportement de T47/T49/T50/T51.
 *
 * 8. FIXTURES DE CANDIDAT REUTILISEES, JAMAIS MODIFIEES (zone ACCEPTANCE,
 *    DEJA publiees par T51, jamais une source de T52) :
 *    `acceptance/fixtures/candidates/reservation-candidate-v2.mjs`
 *    (candidat CORRECT) et `...-faulty-isolation.mjs` (candidat FAUTIF).
 *    Leur CONTENU est lu DYNAMIQUEMENT par cette suite (jamais recopie) et
 *    ecrit, via le mecanisme ci-dessus (point 7), au chemin `candidate.mjs`
 *    de l'espace de travail derive — simulant ce qu'une VRAIE session
 *    `claude -p` aurait ecrit avec ses propres outils d'edition (meme
 *    convention que T49, II.3, pour le pair RELPATH/CONTENT).
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 *   `claude-cli`, `--live`                               — acceptance/T49.spec.ts (II.2)
 *   `pilot-conduct`, `trajectories`, `trajectory_key`,
 *   `token_report`, `by_model`                            — acceptance/T46.spec.ts (II)
 *   `candidate_token_report`                               — acceptance/T49.spec.ts (II.2)
 *   `--candidate-workspace-root`                           — acceptance/T48.spec.ts (III.1)
 *   `candidate-control-report`, `--campaign-id`,
 *   `--postgres-database`, `periods`,`satisfied`,`violated` — acceptance/T51.spec.ts (II.3)
 *   `{"ready":true}`, `{"id","op","args"}`,
 *   `{"id","ok":true,"result"}`,`{"id","ok":false,"error"}`  — acceptance/T48.spec.ts (III.2)
 *   `create_tenant`,`advance_clock`,`write`,`read`,
 *   `probe_cancel`,`fingerprint`, leurs champs              — acceptance/T50.spec.ts (III)
 *   `bench.candidate/2`                                     — acceptance/T50.spec.ts (III)
 *   repartition (5,0) nominal / (4,1) fautif-isolation       — acceptance/T51.spec.ts (test A1)
 *   `reservation-candidate-v2(.mjs|-faulty-isolation.mjs)`   — acceptance/T51.spec.ts (fixtures)
 *
 * Les noms `candidate_control_report`, `candidate.mjs`, `node candidate.mjs`,
 * les deux nouvelles variables d'environnement du fixture (II.7), et le
 * recours direct a la MEME identite de trajectoire pour `candidate-control-
 * report` (II.3) : FIXES ICI (section II), jamais obtenus en executant une
 * implementation de T52.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T52, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 — LE DANGER NOMME : « faire deriver le prompt d'une copie locale du
 *     contrat au lieu de la description exportee ». Une presence BRUTE des
 *     six operations dans le prompt (DEJA exigee par T50.A3, jamais
 *     re-exercee ici a l'identique) ne prouve pas que la MECANIQUE DE
 *     TRANSPORT (lancement, signal, enveloppe) que l'adaptateur emploie
 *     REELLEMENT soit la MEME que celle que le prompt annonce : une
 *     implementation pourrait avoir COPIE le contrat metier dans le prompt
 *     (satisfaisant T50.A3) tout en laissant la description de TRANSPORT
 *     dans une chaine locale, jamais relue par l'adaptateur. Cette suite
 *     exige donc, EN PLUS de la presence des jetons de transport (`candidate.
 *     mjs`, `ready`, `id`/`op`/`args`, `ok`/`result`/`error`), un TEMOIN
 *     COMPARATIF INDEPENDANT : le prompt d'un appel DIRECT de `run-period
 *     --provider claude-cli --live` (deja prouve par T49/T50, SANS rapport
 *     avec `pilot-conduct`) doit porter EXACTEMENT le MEME ensemble de
 *     jetons de contrat que celui de `pilot-conduct` — si l'un des deux
 *     portait une copie STALE (un jeton renomme, un champ omis, une
 *     commande de lancement differente), l'egalite des DEUX ensembles
 *     tomberait, meme si chacun, pris isolement, « contenait quelque
 *     chose ».
 * (2) A2 — LE DANGER NOMME : « ne pas appeler le controle apres la session
 *     dans pilot-conduct ». Cette suite n'accepte pas qu'un champ
 *     `candidate_control_report` simplement PRESENT suffise (meme
 *     avertissement que T00.M3/T51.A3 : une presence sans observation ne
 *     prouve rien) : elle exige, pour DEUX candidats de reference DISTINCTS
 *     (CORRECT puis FAUTIF, chacun sa propre campagne), la repartition EXACTE
 *     `(5,0)`/`(4,1)` DEJA etablie par T51.A1 (I), a CHAQUE periode
 *     persistee. Un moteur qui n'appellerait jamais le controle (le mutant
 *     nomme) laisserait `candidate_control_report` absent, vide, ou a
 *     `(0,0)` constant — incapable de distinguer le candidat correct du
 *     candidat fautif, ce que cette suite exige explicitement (les DEUX
 *     repartitions DOIVENT differer entre les deux campagnes).
 * (3) A3 — LE DANGER NOMME : « controler le code d'un espace de travail
 *     restaure ailleurs que celui de la session ». Cette suite fait ecrire,
 *     par le MECANISME DE PLAN (II.7), un candidat CORRECT a la periode 1 et
 *     un candidat FAUTIF a la periode 2 d'UNE SEULE trajectoire, dans LE
 *     MEME appel chaine. Le danger precis : si le moteur controlait, pour
 *     une periode donnee, un espace de travail SANS RAPPORT avec le commit
 *     de CETTE periode (par exemple le commit de l'autre periode, ou un
 *     clone frais sans historique), soit (a) la repartition de controle de
 *     la periode 1 cesserait d'etre `(5,0)`, soit (b) celle de la periode 2
 *     cesserait d'etre `(4,1)` — ET, de maniere INDEPENDANTE du statut de
 *     controle, `git show <commit_sha(periode)>:candidate.mjs`, lu DIRECTEMENT
 *     (hors de tout CLI), doit rendre EXACTEMENT le contenu que CETTE
 *     periode a ecrit (jamais celui de l'autre periode) : un moteur qui
 *     controlerait le bon contenu par PURE COINCIDENCE sur les statuts
 *     (improbable mais pas exclu) ne pourrait pas survivre au controle de
 *     contenu, independant du canal de controle metier.
 * (4) A4 — LE DANGER NOMME : « demarrer la periode k+1 dans un espace de
 *     travail vierge ». Avec un SECOND mecanisme de plan (deux fichiers-
 *     marqueurs DISTINCTS, l'un ecrit a la periode 1, l'autre a la periode
 *     2, AUCUN rapport avec le candidat metier), cette suite exige (a)
 *     `git merge-base --is-ancestor <commit(P1)> <commit(P2)>` EXIT 0 (P2
 *     descend REELLEMENT de P1, jamais un commit SANS PARENT commun), (b)
 *     les deux commits DIFFERENT (garde anti-degenere : `is-ancestor` est
 *     trivialement vrai pour sha1===sha2, ce qui ne prouverait AUCUNE
 *     progression), et (c) `git show <commit(P2)>:p1-marker.txt` rend
 *     EXACTEMENT le contenu ecrit en P1 — la preuve DECISIVE qu'un
 *     repertoire VIERGE a la periode 2 (le mutant nomme) ne pourrait pas
 *     satisfaire : un espace de travail vierge ne porterait JAMAIS
 *     `p1-marker.txt`, meme si un historique git arbitraire y etait rejoue
 *     par ailleurs.
 * (5) A5 — LE DANGER NOMME : « omettre les statuts de controle du rapport de
 *     fin ». Cette suite ne compare PAS `candidate_control_report` a
 *     lui-meme : elle le compare a une lecture INDEPENDANTE, par un canal
 *     DIFFERENT, de LA MEME trajectoire — `candidate-control-report
 *     --campaign-id <trajectory_key>` (T51, DEJA PROUVE, II.3) — et exige
 *     l'EGALITE EXACTE (meme discipline que T51.A4 : « jamais une
 *     comparaison du rapport a lui-meme »). Un moteur qui omettrait le
 *     champ (le mutant nomme) laisserait `candidate_control_report` vide ou
 *     absent alors que la lecture independante, elle, porte des donnees
 *     REELLES — l'egalite tombe. Le volet tokens REUTILISE, SANS LE
 *     REDERIVER, le mecanisme DEJA prouve par T49.A4 (relecture
 *     INDEPENDANTE par `--test-reread-period`, somme manuelle, egalite avec
 *     `candidate_token_report.by_model`) : cette suite ne re-verifie donc
 *     QUE l'ajout propre a T52, le controle, avec la MEME rigueur
 *     d'independance.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie pas que `run-period`/`pilot-conduct` developpent et
 *    committent correctement sous `--provider claude-cli` (T49), ni les
 *    permissions/le contenu metier du prompt (T50), ni le protocole NDJSON
 *    ou la semantique de reservation (T51) : ce sont des suites distinctes,
 *    DEJA publiees, dont cette suite REUTILISE le resultat sans le
 *    redemontrer.
 *  • Elle n'exerce aucun non-deploiement (candidat qui ne demarre pas, ne
 *    repond pas, viole le protocole) : ces trois motifs sont DEJA prouves
 *    par T51.A3 sur `candidate-control-period` ; T52 ne fait qu'enchainer ce
 *    MEME mecanisme, jamais le re-prouver.
 *  • Elle n'exige aucune valeur par defaut precise pour un delai de
 *    controle : elle n'exerce aucun scenario ou un delai borne importerait.
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : voir la garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T49.
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
 * (repris, sans le reinventer, de acceptance/T51.spec.ts / T49.spec.ts)
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

/* ─────────────────────────────── navigation JSON generique (reprise T49) */

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
const champNombre = (r: unknown, alias: readonly string[]): number | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t52_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

function envDeBase(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

/** Une invocation `bench <sous-commande>`, PROCESSUS NEUF SYNCHRONE. */
function lancer(sousCommande: string, drapeaux: string[], envSupp: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env = { ...envDeBase(), ...envSupp };
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
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

/* ════════════════════════ fixture claude-cli (reprise T47, etendue T49/T52) */

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

/** Environnement avec le pair legacy RELPATH/CONTENT (T49, II.3) — UN seul contenu, constant
 *  pour TOUTES les invocations de l'appel qui le recevra (A2). */
function envEcritureConstante(opts: { relPath: string; content: string; recordFile?: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH: opts.relPath,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT: opts.content,
  };
  if (opts.recordFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE = opts.recordFile;
  verifierFauxEnTetePath(env);
  return env;
}

/** Environnement avec le PLAN (II.7, nouveau par T52) — une ecriture DIFFERENTE par
 *  invocation successive de l'appel qui le recevra (A3/A4). */
function envEcriturePlan(opts: { plan: { relPath: string; content: string }[]; recordFile?: string }): NodeJS.ProcessEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't52-plan-'));
  WORKSPACES_CREES.push(dir);
  const planFile = path.join(dir, 'plan.json');
  const counterFile = path.join(dir, 'counter.txt');
  fs.writeFileSync(planFile, JSON.stringify(opts.plan));
  const env: NodeJS.ProcessEnv = {
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_FILE: planFile,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_COUNTER_FILE: counterFile,
  };
  if (opts.recordFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE = opts.recordFile;
  verifierFauxEnTetePath(env);
  return env;
}

/** Un succes `claude -p --output-format json` typique, avec `modelUsage` CONTROLE (reprise T49). */
function resultSucces(sessionId: string, modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }> = {}): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage,
  });
}

function argvEnregistre(recordFile: string): string[] {
  if (!fs.existsSync(recordFile)) return [];
  try {
    const r = JSON.parse(fs.readFileSync(recordFile, 'utf8')) as Json;
    return Array.isArray(r.argv) ? (r.argv as unknown[]).map(String) : [];
  } catch {
    return [];
  }
}
const normaliserEspaces = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Le prompt (A1/A2, convention FIXEE par acceptance/T49.spec.ts, II.4 : « l'argument d'argv
 *  qui suit -p »), normalise (espaces, casse). */
function promptDe(recordFile: string): string {
  const argv = argvEnregistre(recordFile);
  const idxP = argv.indexOf('-p');
  if (idxP < 0 || idxP + 1 >= argv.length) return '';
  return normaliserEspaces(argv[idxP + 1] ?? '').toLowerCase();
}

/* ════════════════════════════ drapeaux et sous-commandes (II.1, repris) */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21), reprise T49
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008:L149, reprise T49

const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const SOUS_COMMANDE_RUN_PERIOD = 'run-period'; // cahier:L355, repris de T23/T45/T46/T49
const SOUS_COMMANDE_CONTROL_REPORT = 'candidate-control-report'; // FIXE par acceptance/T51.spec.ts (II.1)

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live';
const DRAPEAU_MODEL = '--model';
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // T48 III.1, repris T49
const DRAPEAU_REREAD = '--test-reread-period'; // FIXE par acceptance/T49.spec.ts (II.1)

const MANIFEST_T52 = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t49-claude-cli-small.json'); // REPRIS A L'IDENTIQUE de T49 (II) — jamais une source de T52, UN clone, periods_per_trajectory=2

/* ─────────────────────────────────── CATEGORIES_USAGE (reprises T47/T49) */

const CATEGORIES_USAGE = ['input_fresh', 'cache_read', 'output', 'cache_write_5m', 'cache_write_1h', 'cache_write_unresolved'] as const;
type CategorieUsage = (typeof CATEGORIES_USAGE)[number];
type VecteurUsage = Record<CategorieUsage, number>;
const vecteurVide = (): VecteurUsage => ({ input_fresh: 0, cache_read: 0, output: 0, cache_write_5m: 0, cache_write_1h: 0, cache_write_unresolved: 0 });

const ALIAS_CANDIDATE = ['candidate', 'candidat'];
const ALIAS_COMMIT_SHA = ['commit_sha', 'commitsha'];
const ALIAS_WORKSPACE_DIR = ['workspace_dir', 'workspacedir'];
const ALIAS_USAGE = ['usage'];
const ALIAS_MODEL = ['model'];
const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_CANDIDATE_TOKEN_REPORT = ['candidate_token_report', 'candidatetokenreport'];
const ALIAS_BY_MODEL = ['by_model', 'bymodel'];
const ALIAS_CANDIDATE_CONTROL_REPORT = ['candidate_control_report']; // FIXE ICI (II.2) — aucun alias, aucune prose de cahier a reconcilier

type Usage = { model: string } & VecteurUsage;
function candidateDe(r: unknown): { commitSha: string | null; workspaceDir: string | null; usage: Usage[] } | null {
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
  return { commitSha: champTexte(v, ALIAS_COMMIT_SHA), workspaceDir: champTexte(v, ALIAS_WORKSPACE_DIR), usage };
}

/* ────────────────────────────────────── bench.candidate/2 (III, reprise T50) */

type OperationV2 = { op: string; args: string[]; reponse: string[] };
const OPERATIONS_V2: OperationV2[] = [
  { op: 'create_tenant', args: ['tenant_id'], reponse: [] },
  { op: 'advance_clock', args: ['to'], reponse: [] },
  { op: 'write', args: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key'], reponse: ['decision'] },
  { op: 'read', args: ['tenant_id', 'key'], reponse: ['value'] },
  { op: 'probe_cancel', args: ['tenant_id', 'key'], reponse: ['decision'] },
  { op: 'fingerprint', args: [], reponse: ['sha256'] },
];
const MARQUEUR_CONTRAT = 'bench.candidate/2'; // acceptance/T50.spec.ts (III)

/** Jetons de TRANSPORT (II.4/II.5) que le prompt doit enoncer — propres a T52, JAMAIS exerces
 *  par T50.A3 (qui ne verifie que le contrat METIER, pas le transport). */
const ENTREE_CANDIDATE = 'candidate.mjs'; // FIXE ICI (II.4)
const COMMANDE_LANCEMENT = 'node candidate.mjs'; // FIXE ICI (II.4)
const SIGNAL_DEMARRAGE = '{"ready":true}'; // acceptance/T48.spec.ts (III.2.b)
const JETONS_TRANSPORT = [ENTREE_CANDIDATE, 'ready', 'id', 'op', 'args', 'ok', 'result', 'error']; // acceptance/T48.spec.ts (III.2.c) + II.4 ci-dessus

/** Tous les jetons (metier + transport) que le prompt DOIT enoncer (A1). */
function jetonsAttendus(): string[] {
  const jetons: string[] = [MARQUEUR_CONTRAT, ...JETONS_TRANSPORT];
  for (const o of OPERATIONS_V2) jetons.push(o.op, ...o.args, ...o.reponse);
  return [...new Set(jetons)];
}
function jetonsManquants(prompt: string): string[] {
  return jetonsAttendus().filter((j) => !prompt.includes(j.toLowerCase()));
}

/* ════════════════════════════════ contextes et invocations (II.1) */

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };

function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t52-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t52-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

/** `bench pilot-conduct` en mode `claude-cli --live`, avec un manifeste et un environnement
 *  explicite (II.1 — AUCUN drapeau nouveau par rapport a T46/T49). */
function conduireClaudeCli(ctx: Contexte, env: NodeJS.ProcessEnv, extra: string[] = []): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [
      MANIFEST_T52,
      DRAPEAU_CAMPAGNE, ctx.campaignId,
      DRAPEAU_PG, ctx.db,
      DRAPEAU_S3, ctx.bucket,
      DRAPEAU_MODE, MODE,
      DRAPEAU_PROVIDER, PROVIDER_CLAUDE_CLI,
      DRAPEAU_LIVE,
      DRAPEAU_WORKSPACE_ROOT, ctx.workspaceRoot,
      ...extra,
    ],
    env,
  );
}

/** `bench run-period --provider claude-cli --live` DIRECT (I/IV.(1) — temoin comparatif
 *  independant de `pilot-conduct`, meme surface que acceptance/T49.spec.ts). */
function runPeriodClaudeCliDirect(ctx: Contexte, env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    SOUS_COMMANDE_RUN_PERIOD,
    [
      DRAPEAU_MODE, MODE,
      DRAPEAU_CAMPAGNE, ctx.campaignId,
      DRAPEAU_PG, ctx.db,
      DRAPEAU_S3, ctx.bucket,
      DRAPEAU_PROVIDER, PROVIDER_CLAUDE_CLI,
      DRAPEAU_WORKSPACE_ROOT, ctx.workspaceRoot,
      DRAPEAU_MODEL, 'bench-fake-claude-cli-model-a',
      DRAPEAU_LIVE,
    ],
    env,
  );
}

/** `bench run-period --test-reread-period <n>`, processus NEUF, AUCUNE session (reprise T49). */
function relirePeriode(trajectoryKey: string, db: string, bucket: string, n: number): AppelCli {
  return lancer(SOUS_COMMANDE_RUN_PERIOD, [
    DRAPEAU_MODE, MODE,
    DRAPEAU_CAMPAGNE, trajectoryKey,
    DRAPEAU_PG, db,
    DRAPEAU_S3, bucket,
    DRAPEAU_REREAD, String(n),
  ]);
}

/** `bench candidate-control-report` DIRECT sur l'identite de TRAJECTOIRE (II.3 — temoin
 *  independant de `pilot-conduct`, commande DEJA prouvee par acceptance/T51.spec.ts). */
function candidateControlReportDirect(trajectoryKey: string, db: string): AppelCli {
  return lancer(SOUS_COMMANDE_CONTROL_REPORT, [DRAPEAU_CAMPAGNE, trajectoryKey, DRAPEAU_PG, db]);
}

function trajectoryKeyDe(r: unknown): string | null {
  const t = tableauProfond(r, ALIAS_TRAJECTOIRES);
  if (t === null || !Array.isArray(t.valeur) || t.valeur.length === 0) return null;
  return champTexte(t.valeur[0], ALIAS_TRAJECTORY_KEY);
}

/** `candidate_control_report[trajectory_key].periods` (II.2, FIXE ICI). */
function controlPeriodsDe(r: unknown, trajectoryKey: string): { period_index: number; satisfied: number; violated: number }[] {
  const liste = tableauProfond(r, ALIAS_CANDIDATE_CONTROL_REPORT);
  if (liste === null || !Array.isArray(liste.valeur)) return [];
  for (const entree of liste.valeur as unknown[]) {
    if (champTexte(entree, ALIAS_TRAJECTORY_KEY) === trajectoryKey) {
      const per = tableauProfond(entree, ['periods']);
      if (per !== null && Array.isArray(per.valeur)) {
        return (per.valeur as unknown[]).map((p) => ({
          period_index: champNombre(p, ['period_index']) ?? -1,
          satisfied: champNombre(p, ['satisfied']) ?? -1,
          violated: champNombre(p, ['violated']) ?? -1,
        }));
      }
    }
  }
  return [];
}
function controlPeriodsRapportDirectDe(r: unknown): { period_index: number; satisfied: number; violated: number }[] {
  const per = tableauProfond(r, ['periods']);
  if (per === null || !Array.isArray(per.valeur)) return [];
  return (per.valeur as unknown[]).map((p) => ({
    period_index: champNombre(p, ['period_index']) ?? -1,
    satisfied: champNombre(p, ['satisfied']) ?? -1,
    violated: champNombre(p, ['violated']) ?? -1,
  }));
}

/* ───────────────────────────── git REEL, hors de tout CLI (IV.(3)/(4)) */

function gitShow(dir: string, sha: string, relPath: string): string | null {
  try {
    return execFileSync('git', ['-C', dir, 'show', `${sha}:${relPath}`], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}
function gitEstAncetre(dir: string, ancetre: string, descendant: string): boolean {
  try {
    execFileSync('git', ['-C', dir, 'merge-base', '--is-ancestor', ancetre, descendant], { timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

/* ──────────────────────────── fixtures de candidat (II.8, reprises T51) */

const FIXTURES_DIR = path.join(REPO, 'acceptance', 'fixtures', 'candidates');
const REFERENCE_V2_PATH = path.join(FIXTURES_DIR, 'reservation-candidate-v2.mjs');
const REFERENCE_V2_FAUTIF_PATH = path.join(FIXTURES_DIR, 'reservation-candidate-v2-faulty-isolation.mjs');
for (const f of [REFERENCE_V2_PATH, REFERENCE_V2_FAUTIF_PATH]) {
  if (!fs.existsSync(f)) throw new Error(`FIXTURE-ABSENTE : ${f}`);
}
const CONTENU_CORRECT = fs.readFileSync(REFERENCE_V2_PATH, 'utf8');
const CONTENU_FAUTIF = fs.readFileSync(REFERENCE_V2_FAUTIF_PATH, 'utf8');

/** Repartition DEJA ETABLIE par acceptance/T51.spec.ts (test A1) : (5,0) nominal / (4,1)
 *  fautif-isolation — reprise ICI, jamais re-derivee (I). */
const REPARTITION_CORRECTE = { satisfied: 5, violated: 0 };
const REPARTITION_FAUTIVE = { satisfied: 4, violated: 1 };

/* ══════════════════════════════════════════════════════════════════ cas */

describe('T52 — conduire le pilote reel de bout en bout', () => {
  test(
    'T52.A1 le prompt d une periode et l adaptateur derivent d une meme description exportee, et le prompt enonce la commande de lancement, le signal de demarrage, la forme des requetes et celle des reponses (ADR:L64)',
    () => {
      // (1) `pilot-conduct --provider claude-cli --live`, UNE SEULE periode (ADR L64) —
      //     capture du prompt REEL envoye a la session.
      const ctxConduct = nouveauContexte('a1-conduct');
      const recConduct = path.join(ctxConduct.workspaceRoot, '..', `record-conduct-${randomUUID()}.json`);
      const envConduct = envEcritureConstante({ relPath: ENTREE_CANDIDATE, content: CONTENU_CORRECT, recordFile: recConduct });
      const runConduct = conduireClaudeCli(ctxConduct, envConduct, ['--test-stop-after-periods', '1']);
      exige(runConduct.resultat !== null && runConduct.exit === 0, 'pilot-conduct-a1-executee', messageEchec('pilot-conduct(claude-cli,A1)', runConduct));

      const promptConduct = promptDe(recConduct);
      exige(promptConduct.length > 0, 'prompt-pilot-conduct-enregistre', `AUCUN prompt capture dans ${recConduct} — argv ${rendu(argvEnregistre(recConduct))}`);

      const manquantsConduct = jetonsManquants(promptConduct);
      exige(
        manquantsConduct.length === 0,
        'prompt-pilot-conduct-enonce-contrat-et-transport-complets',
        `jeton(s) MANQUANT(S) : ${manquantsConduct.join(', ')} — prompt ${rendu(court(promptConduct, 2500))}`,
      );

      // (2) TEMOIN COMPARATIF INDEPENDANT (IV.(1)) : le MEME ensemble de jetons doit
      //     apparaitre dans le prompt d'un appel DIRECT de `run-period --provider
      //     claude-cli --live` (DEJA prouve par T49/T50, SANS rapport avec pilot-conduct).
      //     Si pilot-conduct derivait son prompt d'une COPIE LOCALE divergente de la
      //     description EXPORTEE que run-period emploie deja, les deux ensembles de
      //     jetons REELLEMENT presents cesseraient d'etre EGAUX.
      const ctxDirect = nouveauContexte('a1-direct');
      const recDirect = path.join(ctxDirect.workspaceRoot, '..', `record-direct-${randomUUID()}.json`);
      const envDirect = envEcritureConstante({ relPath: ENTREE_CANDIDATE, content: CONTENU_CORRECT, recordFile: recDirect });
      const runDirect = runPeriodClaudeCliDirect(ctxDirect, envDirect);
      exige(runDirect.resultat !== null && runDirect.exit === 0, 'run-period-direct-a1-executee', messageEchec('run-period(claude-cli,direct,A1)', runDirect));

      const promptDirect = promptDe(recDirect);
      exige(promptDirect.length > 0, 'prompt-run-period-direct-enregistre', `AUCUN prompt capture dans ${recDirect}`);

      const presentsConduct = new Set(jetonsAttendus().filter((j) => promptConduct.includes(j.toLowerCase())));
      const presentsDirect = new Set(jetonsAttendus().filter((j) => promptDirect.includes(j.toLowerCase())));
      const diff = [...presentsConduct].filter((j) => !presentsDirect.has(j)).concat([...presentsDirect].filter((j) => !presentsConduct.has(j)));
      exige(
        diff.length === 0,
        'pilot-conduct-et-run-period-enoncent-exactement-le-meme-contrat',
        `jeton(s) qui DIFFERENT entre les deux prompts (copie locale divergente suspectee) : ${rendu(diff)} — ` +
          `pilot-conduct=${rendu(court(promptConduct, 1200))} run-period=${rendu(court(promptDirect, 1200))}`,
      );

      // (3) La commande de lancement elle-meme, litteralement (II.4).
      exige(
        promptConduct.includes(COMMANDE_LANCEMENT.toLowerCase()) || (promptConduct.includes('node') && promptConduct.includes(ENTREE_CANDIDATE)),
        'prompt-enonce-la-commande-de-lancement',
        `commande ${rendu(COMMANDE_LANCEMENT)} ABSENTE de ${rendu(court(promptConduct, 1500))}`,
      );
      exige(
        promptConduct.includes(SIGNAL_DEMARRAGE) || (promptConduct.includes('ready') && promptConduct.includes('true')),
        'prompt-enonce-le-signal-de-demarrage',
        `signal ${rendu(SIGNAL_DEMARRAGE)} ABSENT de ${rendu(court(promptConduct, 1500))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T52.A2 avec un faux claude qui ecrit un candidat conforme au prompt, pilot-conduct --provider claude-cli --live persiste pour chaque periode les statuts de controle de l application scriptee nominale, et un candidat fautif ceux de la variante fautive (ADR:L64)',
    () => {
      // Candidat CORRECT, campagne A.
      const ctxOk = nouveauContexte('a2-ok');
      const envOk = envEcritureConstante({ relPath: ENTREE_CANDIDATE, content: CONTENU_CORRECT });
      const runOk = conduireClaudeCli(ctxOk, envOk);
      exige(runOk.resultat !== null && runOk.exit === 0, 'pilot-conduct-correct-executee', messageEchec('pilot-conduct(claude-cli,correct)', runOk));
      const trajOk = trajectoryKeyDe(runOk.resultat);
      exige(typeof trajOk === 'string' && trajOk.length > 0, 'trajectory_key-correct-lisible', `vu ${rendu(trajOk)} dans ${rendu(runOk.resultat)}`);
      const periodesOk = controlPeriodsDe(runOk.resultat, trajOk as string);
      exige(periodesOk.length >= 2, 'au-moins-deux-periodes-de-controle-persistees-correct', `vu ${rendu(periodesOk)} dans ${rendu(runOk.resultat)}`);
      for (const p of periodesOk) {
        exige(
          p.satisfied === REPARTITION_CORRECTE.satisfied && p.violated === REPARTITION_CORRECTE.violated,
          `periode-${p.period_index}-correct-repartition-nominale`,
          `vu satisfied=${p.satisfied} violated=${p.violated}, attendu ${rendu(REPARTITION_CORRECTE)} — periodes ${rendu(periodesOk)}`,
        );
      }

      // Candidat FAUTIF (isolation), campagne B — DISTINCTE.
      const ctxFautif = nouveauContexte('a2-fautif');
      const envFautif = envEcritureConstante({ relPath: ENTREE_CANDIDATE, content: CONTENU_FAUTIF });
      const runFautif = conduireClaudeCli(ctxFautif, envFautif);
      exige(runFautif.resultat !== null && runFautif.exit === 0, 'pilot-conduct-fautif-executee', messageEchec('pilot-conduct(claude-cli,fautif)', runFautif));
      const trajFautif = trajectoryKeyDe(runFautif.resultat);
      exige(typeof trajFautif === 'string' && trajFautif.length > 0, 'trajectory_key-fautif-lisible', `vu ${rendu(trajFautif)} dans ${rendu(runFautif.resultat)}`);
      const periodesFautif = controlPeriodsDe(runFautif.resultat, trajFautif as string);
      exige(periodesFautif.length >= 2, 'au-moins-deux-periodes-de-controle-persistees-fautif', `vu ${rendu(periodesFautif)} dans ${rendu(runFautif.resultat)}`);
      for (const p of periodesFautif) {
        exige(
          p.satisfied === REPARTITION_FAUTIVE.satisfied && p.violated === REPARTITION_FAUTIVE.violated,
          `periode-${p.period_index}-fautif-repartition-de-la-variante`,
          `vu satisfied=${p.satisfied} violated=${p.violated}, attendu ${rendu(REPARTITION_FAUTIVE)} — periodes ${rendu(periodesFautif)}`,
        );
      }

      // DISCRIMINATION (IV.(2)) : les deux repartitions DOIVENT differer — un moteur
      // qui n'appellerait jamais le controle (mutant nomme) ne pourrait pas les
      // distinguer.
      exige(
        REPARTITION_CORRECTE.satisfied !== REPARTITION_FAUTIVE.satisfied,
        'repartitions-correcte-et-fautive-distinctes',
        `les deux repartitions sont IDENTIQUES : ${rendu(REPARTITION_CORRECTE)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T52.A3 le code controle a une periode est exactement le commit de fin produit par la session de cette periode (ADR:L64)',
    () => {
      const ctx = nouveauContexte('a3');
      const env = envEcriturePlan({
        plan: [
          { relPath: ENTREE_CANDIDATE, content: CONTENU_CORRECT },
          { relPath: ENTREE_CANDIDATE, content: CONTENU_FAUTIF },
        ],
      });
      const run = conduireClaudeCli(ctx, env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-a3-executee', messageEchec('pilot-conduct(claude-cli,A3)', run));

      const traj = trajectoryKeyDe(run.resultat);
      exige(typeof traj === 'string' && traj.length > 0, 'trajectory_key-a3-lisible', `vu ${rendu(traj)} dans ${rendu(run.resultat)}`);

      const periodes = controlPeriodsDe(run.resultat, traj as string);
      const p1 = periodes.find((p) => p.period_index === 1);
      const p2 = periodes.find((p) => p.period_index === 2);
      exige(p1 !== undefined && p2 !== undefined, 'deux-periodes-de-controle-presentes-a3', `vu ${rendu(periodes)}`);

      // (1) Les STATUTS doivent suivre le candidat de LEUR PROPRE periode.
      exige(
        p1!.satisfied === REPARTITION_CORRECTE.satisfied && p1!.violated === REPARTITION_CORRECTE.violated,
        'periode-1-controlee-avec-le-candidat-correct-ecrit-en-periode-1',
        `vu ${rendu(p1)}, attendu ${rendu(REPARTITION_CORRECTE)}`,
      );
      exige(
        p2!.satisfied === REPARTITION_FAUTIVE.satisfied && p2!.violated === REPARTITION_FAUTIVE.violated,
        'periode-2-controlee-avec-le-candidat-fautif-ecrit-en-periode-2',
        `vu ${rendu(p2)}, attendu ${rendu(REPARTITION_FAUTIVE)}`,
      );

      // (2) TEMOIN INDEPENDANT DU CANAL DE CONTROLE (IV.(3)) : relecture du commit de
      //     CHAQUE periode, et comparaison DIRECTE par `git show` (hors de tout CLI) au
      //     contenu REELLEMENT ecrit a CETTE periode (jamais celui de l'autre periode).
      const relu1 = relirePeriode(traj as string, ctx.db, ctx.bucket, 1);
      exige(relu1.resultat !== null && relu1.exit === 0, 'periode-1-relue', messageEchec('run-period(--test-reread-period 1)', relu1));
      const cand1 = candidateDe(relu1.resultat);
      exige(
        cand1 !== null && typeof cand1.commitSha === 'string' && typeof cand1.workspaceDir === 'string',
        'periode-1-commit-et-workspace-lisibles',
        `vu ${rendu(cand1)} dans ${rendu(relu1.resultat)}`,
      );

      const relu2 = relirePeriode(traj as string, ctx.db, ctx.bucket, 2);
      exige(relu2.resultat !== null && relu2.exit === 0, 'periode-2-relue', messageEchec('run-period(--test-reread-period 2)', relu2));
      const cand2 = candidateDe(relu2.resultat);
      exige(
        cand2 !== null && typeof cand2.commitSha === 'string' && typeof cand2.workspaceDir === 'string',
        'periode-2-commit-et-workspace-lisibles',
        `vu ${rendu(cand2)} dans ${rendu(relu2.resultat)}`,
      );

      const contenuAuCommit1 = gitShow(cand1!.workspaceDir as string, cand1!.commitSha as string, ENTREE_CANDIDATE);
      exige(
        contenuAuCommit1 === CONTENU_CORRECT,
        'commit-de-la-periode-1-contient-exactement-le-candidat-correct',
        `git show ${cand1!.commitSha}:${ENTREE_CANDIDATE} a rendu ${rendu(court(contenuAuCommit1 ?? '', 300))}`,
      );
      const contenuAuCommit2 = gitShow(cand2!.workspaceDir as string, cand2!.commitSha as string, ENTREE_CANDIDATE);
      exige(
        contenuAuCommit2 === CONTENU_FAUTIF,
        'commit-de-la-periode-2-contient-exactement-le-candidat-fautif',
        `git show ${cand2!.commitSha}:${ENTREE_CANDIDATE} a rendu ${rendu(court(contenuAuCommit2 ?? '', 300))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T52.A4 la session de la periode k+1 demarre dans l espace de travail du commit de fin de la periode k (ADR:L64)',
    () => {
      const ctx = nouveauContexte('a4');
      const marqueur1 = `periode-1-${randomUUID()}`;
      const marqueur2 = `periode-2-${randomUUID()}`;
      const env = envEcriturePlan({
        plan: [
          { relPath: 'p1-marker.txt', content: marqueur1 },
          { relPath: 'p2-marker.txt', content: marqueur2 },
        ],
      });
      const run = conduireClaudeCli(ctx, env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-a4-executee', messageEchec('pilot-conduct(claude-cli,A4)', run));

      const traj = trajectoryKeyDe(run.resultat);
      exige(typeof traj === 'string' && traj.length > 0, 'trajectory_key-a4-lisible', `vu ${rendu(traj)} dans ${rendu(run.resultat)}`);

      const relu1 = relirePeriode(traj as string, ctx.db, ctx.bucket, 1);
      exige(relu1.resultat !== null && relu1.exit === 0, 'periode-1-relue-a4', messageEchec('run-period(--test-reread-period 1)', relu1));
      const cand1 = candidateDe(relu1.resultat);
      exige(cand1 !== null && typeof cand1.commitSha === 'string' && typeof cand1.workspaceDir === 'string', 'periode-1-commit-lisible-a4', `vu ${rendu(cand1)}`);

      const relu2 = relirePeriode(traj as string, ctx.db, ctx.bucket, 2);
      exige(relu2.resultat !== null && relu2.exit === 0, 'periode-2-relue-a4', messageEchec('run-period(--test-reread-period 2)', relu2));
      const cand2 = candidateDe(relu2.resultat);
      exige(cand2 !== null && typeof cand2.commitSha === 'string' && typeof cand2.workspaceDir === 'string', 'periode-2-commit-lisible-a4', `vu ${rendu(cand2)}`);

      // (a) les deux commits DOIVENT differer (garde anti-degenere, IV.(4)).
      exige(
        cand1!.commitSha !== cand2!.commitSha,
        'les-deux-commits-de-fin-sont-distincts',
        `commit(P1)=${rendu(cand1!.commitSha)} commit(P2)=${rendu(cand2!.commitSha)} — identiques, aucune progression observee`,
      );

      // (b) P2 descend REELLEMENT de P1.
      exige(
        gitEstAncetre(cand2!.workspaceDir as string, cand1!.commitSha as string, cand2!.commitSha as string),
        'le-commit-de-la-periode-1-est-un-ancetre-du-commit-de-la-periode-2',
        `git merge-base --is-ancestor ${cand1!.commitSha} ${cand2!.commitSha} (dans ${cand2!.workspaceDir}) a echoue — aucun historique commun`,
      );

      // (c) LA PREUVE DECISIVE (IV.(4)) : le marqueur ecrit en P1 est TOUJOURS present
      //     dans l'arbre du commit de P2 — un espace de travail VIERGE a la periode 2
      //     (le mutant nomme) ne pourrait jamais porter ce fichier.
      const marqueur1AuCommit2 = gitShow(cand2!.workspaceDir as string, cand2!.commitSha as string, 'p1-marker.txt');
      exige(
        marqueur1AuCommit2 === marqueur1,
        'le-marqueur-de-la-periode-1-est-present-dans-le-commit-de-la-periode-2',
        `git show ${cand2!.commitSha}:p1-marker.txt a rendu ${rendu(marqueur1AuCommit2)}, attendu ${rendu(marqueur1)} — un espace vierge omettrait ce fichier`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T52.A5 le rapport de fin donne, pour la meme execution, les tokens par modele et par categorie et les statuts de controle par periode, egaux aux valeurs persistees (ADR:L64)',
    () => {
      const ctx = nouveauContexte('a5');
      const modelUsageParPeriode = {
        'bench-fake-claude-cli-model-a': { inputTokens: 7, outputTokens: 3, cacheReadInputTokens: 2, cacheCreationInputTokens: 1 },
      };
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't52-a5-sondes-'));
      WORKSPACES_CREES.push(dir);
      const env: NodeJS.ProcessEnv = {
        PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
        BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH: ENTREE_CANDIDATE,
        BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT: CONTENU_CORRECT,
        BENCH_FAKE_CLAUDE_STDOUT_RAW: resultSucces('sess-t52-a5', modelUsageParPeriode),
      };
      verifierFauxEnTetePath(env);

      const run = conduireClaudeCli(ctx, env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-a5-executee', messageEchec('pilot-conduct(claude-cli,A5)', run));

      const traj = trajectoryKeyDe(run.resultat);
      exige(typeof traj === 'string' && traj.length > 0, 'trajectory_key-a5-lisible', `vu ${rendu(traj)} dans ${rendu(run.resultat)}`);

      // ─── VOLET TOKENS (REPRIS A L'IDENTIQUE du mecanisme DEJA prouve par T49.A4) ───
      const attendu = vecteurVide();
      for (const n of [1, 2]) {
        const relue = relirePeriode(traj as string, ctx.db, ctx.bucket, n);
        exige(relue.resultat !== null && relue.exit === 0, `periode-${n}-relue-a5`, messageEchec(`run-period(--test-reread-period ${n})`, relue));
        const cand = candidateDe(relue.resultat);
        exige(cand !== null && cand.usage.length > 0, `periode-${n}-usage-present-a5`, `vu ${rendu(relue.resultat)}`);
        for (const u of cand!.usage) for (const cat of CATEGORIES_USAGE) attendu[cat] += u[cat];
      }
      const rapportTokens = champProfond(run.resultat, ALIAS_CANDIDATE_TOKEN_REPORT);
      exige(rapportTokens !== null, 'candidate_token_report-present-a5', `AUCUN candidate_token_report dans ${rendu(run.resultat)}`);
      const parModele = champProfond(rapportTokens!.valeur, ALIAS_BY_MODEL);
      exige(parModele !== null, 'candidate_token_report.by_model-present-a5', `AUCUN by_model dans ${rendu(rapportTokens!.valeur)}`);
      const noeudModele = champProfond(parModele!.valeur, ['bench-fake-claude-cli-model-a']);
      exige(noeudModele !== null, 'modele-present-dans-le-rapport-a5', `ABSENT de ${rendu(parModele!.valeur)}`);
      for (const cat of CATEGORIES_USAGE) {
        const vu = champNombre(noeudModele!.valeur, [cat]) ?? 0;
        exige(
          vu === attendu[cat],
          `rapport-tokens.${cat}=${attendu[cat]}`,
          `vu ${vu} (somme independante des periodes relues, categorie ${cat}) dans ${rendu(noeudModele!.valeur)}`,
        );
      }

      // ─── VOLET CONTROLE (NOUVEAU, IV.(5)) : comparaison avec une lecture INDEPENDANTE,
      //     JAMAIS le rapport a lui-meme — `candidate-control-report` DIRECT (T51, II.3).
      const rapportControleDirect = candidateControlReportDirect(traj as string, ctx.db);
      exige(rapportControleDirect.resultat !== null && rapportControleDirect.exit === 0, 'candidate-control-report-direct-executee-a5', messageEchec('candidate-control-report(direct,A5)', rapportControleDirect));
      const periodesDirect = controlPeriodsRapportDirectDe(rapportControleDirect.resultat);
      exige(periodesDirect.length >= 2, 'candidate-control-report-direct-porte-au-moins-deux-periodes-a5', `vu ${rendu(rapportControleDirect.resultat)}`);

      const periodesPilotConduct = controlPeriodsDe(run.resultat, traj as string);
      exige(periodesPilotConduct.length >= 2, 'candidate_control_report-de-pilot-conduct-porte-au-moins-deux-periodes-a5', `vu ${rendu(run.resultat)}`);

      const parIndex = new Map(periodesDirect.map((p) => [p.period_index, p]));
      for (const p of periodesPilotConduct) {
        const independant = parIndex.get(p.period_index);
        exige(
          independant !== undefined,
          `periode-${p.period_index}-presente-cote-independant`,
          `periode ${p.period_index} ABSENTE de la lecture independante ${rendu(periodesDirect)}`,
        );
        exige(
          independant !== undefined && independant.satisfied === p.satisfied && independant.violated === p.violated,
          `rapport-controle-periode-${p.period_index}-egal-a-la-lecture-independante`,
          `pilot-conduct=${rendu(p)} independant=${rendu(independant)}`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );
});
