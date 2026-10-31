/**
 * acceptance/T75.spec.ts — suite d'acceptation de la tache T75.
 *
 * Cas requis (verification/tasks.extensions.json, ADR-021 L210) :
 *   T75.A1 — a partir de P20, cinquante mille reservations sont importees, la latence au
 *            95e centile de chaque operation est mesuree et comparee au plafond de sa
 *            clause, et un candidat de reference qui parcourt toutes les reservations a
 *            chaque operation depasse le plafond et echoue
 *   T75.A2 — a partir de P21, sur au moins cent essais de requetes paralleles, aucun
 *            depassement de capacite ni doublon idempotent n'est tolere, et un candidat
 *            de reference sans exclusion mutuelle echoue
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 *   - ADR-021 carte T75 (L206-L212, docs/specs/T75.md) et decision 3 : « Performance
 *     (P20 et suivantes) : latence au 95e centile par operation sur le volume importe,
 *     contre un plafond declare dans une clause. Concurrence (P21 et suivantes) : aucun
 *     depassement de capacite ni doublon idempotent sous requetes paralleles, sur de
 *     nombreux essais » ;
 *   - la racine gelee acceptance/reference-platform/F-PLATFORM-P17-P24.json : regles
 *     P20.R3 (plafonds par operation ; precisions Q67 et Q68, decision du mandant du
 *     31/10/2026), bloc `periodes.P20.volume` (profil d'import, `repartition`,
 *     `erase_member`), regles P21.R1-R4 et bloc `periodes.P21.concurrence` (essais,
 *     clients, scenarios). Le `$comment` de la racine les reserve a T75 ;
 *   - la source de clauses EXPORTEE (role `platformClauses`, T70 III ; lue comme en T74) :
 *     `P20.R3.contract.valeurs` (plafonds_p95_ms, import_50000_lignes_ms,
 *     volume_reservations) et `P21.R3.contract.valeurs` (essais_paralleles_min,
 *     clients_paralleles). Aucune valeur n'est recopiee ici : la suite les LIT dans la
 *     source et dans la racine et exige qu'elles concordent ;
 *   - les conventions d'acceptance/T74.spec.ts : roles cherches dans `@bench/scenario`
 *     puis `@bench/activities`, protocole bench.platform/1, candidats-fixtures lances par
 *     un lanceur au nom aleatoire, journal de trafic, persistance PostgreSQL lue dans
 *     toutes les tables du schema `public`. L'auteur a lu packages/oracle/src/
 *     f-platform-*.ts en lecture seule.
 * Aveuglement PROCEDURAL (ADR-001) : aucune implementation de T75 n'existait a l'ecriture.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CONTRAT — FIXE ICI (ADR-021 ne nomme aucun export). `n` designe une periode ; chaque
 * appel recoit `{ period: n, periodIndex: n, periodId: 'Pn', seed, candidateCommand,
 * benchDataDir, postgresDatabase? }` (comme en T74).
 *
 *   MESURE DE LATENCE (role `platformLatency`) :
 *     measurePlatformLatency | measureFPlatformLatency | runPlatformLatencyBench |
 *     platformLatencyBench | measurePlatformPerformance.
 *     Appelee avec n = 20 -> Promise<{ pass, import, operations }> :
 *       operations : objet op -> mesure, ou tableau de mesures portant `op` ;
 *         une mesure = { p95_ms, ceiling_ms, clause, samples, warmup, latencies_ms,
 *         request_ids, pass } ;
 *       import : { latency_ms, ceiling_ms, request_id, pass } (l'import de volume) ;
 *       pass : true si et seulement si chaque mesure et l'import sont sous leur plafond.
 *     Avec `postgresDatabase`, chaque mesure est persistee (schema public, forme libre,
 *     JSON imbrique admis) sous un objet qui porte `op` (ou `operation`), `p95_ms` et
 *     `ceiling_ms` egaux a ceux rendus.
 *
 *   ESSAIS PARALLELES (role `platformConcurrency`) :
 *     runPlatformConcurrencyTrials | runPlatformConcurrency | platformConcurrencyTrials |
 *     runFPlatformConcurrencyTrials | checkPlatformConcurrency.
 *     Appelee avec n = 21 -> Promise<{ pass, trials, violations }> :
 *       trials : [{ scenario, clients, request_ids, violations? }] — `scenario` est un nom
 *         du bloc `concurrence.scenarios` de la racine ; `request_ids` les `id` (protocole)
 *         des requetes PARALLELES de l'essai (la preparation et les verifications n'y
 *         figurent pas) ;
 *       violations : [{ trial, scenario, kind, ... }] (cherchees a toute profondeur sous
 *         `violations` ; `trial` = rang 0-base dans `trials`) ; `kind` dit l'invariant
 *         rompu : 'capacity' (alias capacite, overbooking) pour un depassement de capacite,
 *         'idempotency' (alias idempotence, duplicate, doublon) pour un doublon idempotent,
 *         libre sinon ;
 *       pass : true si et seulement si aucune violation.
 *     Avec `postgresDatabase`, chaque violation est persistee sous un objet portant
 *     `trial`, `scenario` et `kind` egaux a ceux rendus.
 *
 *   PROTOCOLE bench.platform/1 — EXTENSION « CONNEXIONS MULTIPLES » (FIXEE ICI, compatible
 *   avec T74 : un candidat qui l'ignore reste conforme a T74, mais echoue A2). Le protocole
 *   de T74 (une requete par ligne sur stdin, reponses dans l'ordre) ne permet pas deux
 *   requetes en vol a la fois ; un essai parallele en exige vingt. Donc :
 *     - le banc pose BENCH_PLATFORM_SOCKET = chemin d'un socket Unix (flux) qu'il choisit
 *       (<= 100 octets, sun_path) ; le candidat ECOUTE sur ce chemin AVANT d'ecrire sa
 *       ligne prete, qui porte alors `"socket": <chemin>` :
 *       {"ready":true,"protocol":"bench.platform/1","socket":"/tmp/x.sock"} ;
 *     - chaque connexion acceptee est un client independant, au cadrage de stdin : une
 *       requete JSON par ligne `{id, period, at, op, args, tenant?, actor?, version?}`,
 *       une reponse `{"id", "response"}` par requete, DANS L'ORDRE DE CETTE CONNEXION ;
 *     - les `id` sont choisis par le banc et UNIQUES sur tout le processus (texte) ;
 *     - des requetes de connexions distinctes peuvent etre traitees concurremment ; chaque
 *       operation est atomique et le resultat serialisable (P21.R3) ;
 *     - stdin reste un client ; sa fermeture termine le processus apres les reponses en
 *       attente ; le banc ferme ses connexions avant stdin. BENCH_DATA_DIR : comme T74.
 *     C'est cette extension que l'implementation et docs/api.md doivent suivre.
 *
 *   PROTOCOLE DE MESURE (A1) — FIXE ICI :
 *     - machine : banc et candidat sur le meme hote ; une seule mesure a la fois (cette
 *       suite ne lance jamais deux mesures en parallele) ; aucune autre charge du banc ;
 *     - periode P20 pour toutes les requetes ; un candidat NEUF sur un BENCH_DATA_DIR vide ;
 *     - volume, d'apres `periodes.P20.volume` : le locataire `tenant_id`, `membres` membres,
 *       `creneaux` creneaux de `capacite` places, puis UN import_bookings de `reservations`
 *       lignes d'une place, dont les `reservations` sont ACCEPTEES (accepted = 50 000).
 *       Repartition FIXEE PAR LA RACINE (`periodes.P20.volume.repartition`, precision Q67,
 *       decision du mandant du 31/10/2026) : ligne i (0-base) -> creneau i mod creneaux,
 *       membre (i + floor(i / membres)) mod membres (50 000 couples distincts, exactement
 *       100 reservations par creneau, 50 par membre). La lecture litterale (membre i mod
 *       membres, creneau i mod creneaux) ne donnait que ppcm(1000, 500) = 1000 couples
 *       distincts (49 000 lignes ALREADY_BOOKED, P1.R2) : la suite exige accepted = 50 000 ;
 *     - erase_member (precision Q68 de P20.R3, bloc `periodes.P20.volume.erase_member`) :
 *       chacune de ses requetes mesurees (echantillons) vise un membre qui DETIENT, juste
 *       avant l'operation, des reservations creees par l'import de volume (chemin
 *       d'effacement couteux, RGPD), jamais un membre sans reservation ; la suite le lit
 *       au journal du candidat (champs `member` et `held`, III.c). Plus generalement,
 *       toute operation que le profil nomme par un bloc portant `cibles` est soumise a
 *       cette exigence ;
 *     - operations mesurees : chaque operation ACTIVE a P20 (introduite par la racine de P1
 *       a P20) sauf import_bookings, qui est mesure par l'import de volume lui-meme contre
 *       `import_50000_lignes_ms` ; plafond d'une operation = `plafonds_p95_ms[op]`, a
 *       defaut `plafonds_p95_ms.autre` ; clause = celle qui declare ces plafonds (P20.R3) ;
 *     - apres l'import, pour chaque operation : au moins ECHAUFFEMENT_MIN requetes non
 *       comptees, puis au moins ECHANTILLONS_MIN echantillons, tous des SUCCES (ok: true) :
 *       la latence d'une operation est celle de l'operation faite, pas d'un refus precoce ;
 *     - un echantillon = duree mesuree COTE BANC, de l'instant qui precede l'ecriture de la
 *       requete a celui ou sa reponse complete est lue, horloge monotone
 *       `performance.now()` du banc (ms, fraction admise) ; UNE requete en vol a la fois ;
 *     - p95 = rang le plus proche : echantillons tries, valeur de rang ceil(0,95 x S)
 *       (1-base) ; 60 echantillons -> le 57e : trois valeurs aberrantes sont tolerees.
 *
 *   ESSAIS PARALLELES (A2) — FIXE ICI :
 *     - periode P21 ; un candidat NEUF, BENCH_PLATFORM_SOCKET pose ; au moins
 *       `essais_min` essais en tout, chaque scenario de `concurrence.scenarios` au moins
 *       ceil(essais_min / nombre de scenarios) fois ;
 *     - un essai = `clients_paralleles` requetes, une par connexion DISTINCTE, au meme
 *       processus, toutes ecrites avant qu'aucune reponse de l'essai ne soit attendue
 *       (barriere), puis les verifications (sequentielles) de l'essai ;
 *     - scenarios et invariants : ceux du bloc `concurrence` et de P21.R3/P21.R4.
 *
 *   MODELE ATTENDU : non requis ici. Les invariants se lisent sur les reponses et l'etat.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * LES CANDIDATS (FIXTURES DU TEST-AUTHOR)
 *
 *   acceptance/fixtures/candidates/f-platform-t75/candidat.mjs : le candidat de reference
 *   de T74 (meme instantane epingle de la source, ../f-platform-reference/), plus :
 *     (a) des INDEX TRANSPARENTS (accelerateur.mjs). Le candidat de T74 tel quel ECHOUE
 *         P20.R3 (mesure hors suite apres import de 50 000 reservations, instantane
 *         29cdd0d : import 31,1 s > 30 s, report_occupancy p95 350 ms > 200, erase_member
 *         p95 226 ms > 100) : la source est
 *         ecrite pour l'exactitude et parcourt toutes les reservations du locataire dans
 *         plusieurs decisions. Les index restreignent ces parcours aux entrees que la
 *         decision retient de toute facon ; A1 VERIFIE qu'il rend, sur toute la trajectoire
 *         gelee (P1 a P24, 776 etapes), les memes reponses que le candidat de T74 octet pour
 *         octet (les faits geles relevent de T74.A4, voir VI) ;
 *     (b) l'extension « connexions multiples » ci-dessus ; le moteur est synchrone, la
 *         boucle d'evenements sert d'exclusion mutuelle : chaque operation est atomique ;
 *     (c) l'instrumentation BENCH_TRAFFIC_LOG (une ligne par requete : pid, data_dir, conn,
 *         id, op, period, ok, status, t_in, t_out, lot, rid, slot, member, held, args_h,
 *         rows, accepted ; `held` : pour erase_member, nombre de reservations creees par un
 *         import_bookings reussi que args.member_id detient juste avant l'operation).
 *   VARIANTES FAUTIVES (meme candidat, une transformation chacune, documentee dans le
 *   fichier) :
 *     - variante-balayage.mjs (A1) : AVANT chaque operation, relit chaque reservation de
 *       chaque locataire (copie JSON), deux passes. Memes reponses, latence en O(volume) ;
 *     - variante-sans-exclusion.mjs (A2) : reserve et import_bookings en
 *       lire-calculer-ecrire SANS verrou ; fenetre de course DETERMINISTE de 150 ms (la
 *       premiere requete ouvre un lot ; celles qui arrivent pendant la fenetre sont
 *       calculees chacune sur sa copie du meme etat ; la derniere ecriture l'emporte ; les
 *       reponses du lot partent a sa fermeture). Envoyees une a une, ces requetes recoivent
 *       les reponses de la reference : seul un banc reellement parallele la fait echouer.
 *   Lancement : un lanceur au nom aleatoire, ecrit par cette suite, pose BENCH_TRAFFIC_LOG
 *   puis importe la fixture ; la commande ne trahit pas la variante (T74 III.5).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * MESURES DE REFERENCE ET MARGES (verdict STABLE)
 *
 *   Mesure hors suite (4 coeurs, Node 22), banc jetable conforme au protocole ci-dessus
 *   (10 + 60 requetes par operation), instantane 29cdd0d, racine apres la decision du
 *   mandant du 31/10/2026 (repartition decalee Q67 ; erase_member sur 70 membres qui
 *   detiennent chacun 50 reservations importees, Q68 : `held` = 50 au journal) :
 *     - reference, deux executions : import de 50 000 lignes 4,0 a 4,3 s (plafond 30 s,
 *       rapport <= 0,15) ; pire operation merge_tenants, p95 11,5 a 16,1 ms (plafond 100,
 *       rapport 0,12 a 0,16) ; report_occupancy 23 ms (200, 0,12) ; erase_member 10,9 a
 *       11,0 ms (100, 0,11) ; get_* <= 0,63 ms (20). Mesure complete : ~ 8 a 9 s. Avec les
 *       index de 6a849f4 (entrepot import.memoire recopie a chaque effacement d'un membre
 *       importe), erase_member montait a 56 ms (0,56 > MARGE_REFERENCE) : voir
 *       accelerateur.mjs. (Avant Q68, 29cdd0d : pire rapport 0,14 a 0,16.)
 *     - variante-balayage : get_booking, get_slot, get_wallet 11,8 a 13,7 fois leur
 *       plafond, reserve et cancel 5,1 a 6,0 fois, close_slot 3,1, erase_member 2,95 ; pire
 *       rapport 13,7. Mesure : 334 s. (Avant Q68, 29cdd0d : pire rapport 9,2, 371 s.)
 *   La suite EXIGE la marge, pas seulement le verdict : reference -> chaque rapport
 *   p95 / plafond <= MARGE_REFERENCE (0,5) et import / plafond <= 0,5 ; variante lente ->
 *   au moins une operation a p95 >= MARGE_LENTE (2) x plafond. Un hote trop lent ou trop
 *   charge pour departager rougit en le disant, au lieu de rendre un verdict de hasard.
 *   A2 : reference, 100 essais en ~ 0,5 s, aucune violation ; variante sans exclusion,
 *   ~ 17 s, violation dans 25/25 essais derniere_place (20 confirmed pour 1 place),
 *   25/25 rejeux_en_conflit (20 creations distinctes), 25/25 import_et_reserve
 *   (capacite) ; dans le journal, chacun des 100 essais forme UN lot de 20 requetes sur
 *   20 connexions, ecart d'arrivee <= 1,2 ms (fenetre 150 ms), premiere reponse >= 153 ms
 *   apres la derniere arrivee. Le meme banc rendu sequentiel ne la fait pas echouer
 *   (100 essais, 0 violation, 311 s).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * DEFINITIONS ET CONTROLES NEGATIFS (sans eux un cas pourrait etre creux)
 *
 *   ECHANTILLON AUTHENTIQUE (A1) — son `request_id` figure une fois dans le journal du
 *     candidat, dans le repertoire d'etat de l'import, apres l'import, avec la bonne
 *     operation, P20 et ok: true ; pour erase_member (Q68), son membre detient au moins une
 *     reservation importee (`held` >= 1) ; sa latence rendue est >= la duree de traitement
 *     journalisee par le candidat (t_out - t_in, a TOLERANCE_MS pres) : une mesure cote
 *     banc de la requete a la reponse ne peut pas etre plus courte. Les echantillons d'une
 *     operation ne se chevauchent pas cote candidat (une requete en vol a la fois).
 *   ESSAI PARALLELE AUTHENTIQUE (A2) — ses `request_ids` (>= clients_paralleles) figurent
 *     au journal, au meme pid, en P21, sur autant de connexions distinctes ; contre la
 *     variante sans exclusion, ils forment UN SEUL lot (arrives dans la meme fenetre, donc
 *     tous en vol avant qu'aucun ne recoive sa reponse). Forme par scenario (journal) :
 *     derniere_place = reserve de request_id distincts sur un meme creneau ;
 *     rejeux_simultanes = meme request_id, memes args ; rejeux_en_conflit = meme
 *     request_id, au moins deux args distincts ; import_et_reserve = au moins un
 *     import_bookings et au moins un reserve. Contre la reference, l'issue est verifiee
 *     sur le journal : derniere_place -> exactement 1 confirmed et le reste waiting ;
 *     rejeux_simultanes -> reponses identiques ; rejeux_en_conflit -> une seule reponse ok
 *     distincte (empreinte), les autres sont des refus (IDEMPOTENCY_CONFLICT).
 *
 *   A1 : le predicat refuse une mesure qui ignore la latence (latences < traitement), un
 *        p95 qui est la mediane, un plafond unique recopie, une clause absente, 59
 *        echantillons, un echantillon refuse (ok: false), aucun echauffement, des
 *        echantillons concurrents, un import de 1 000 reservations, un verdict incoherent
 *        (constant), une operation manquante, un effacement mesure sur des membres sans
 *        reservation importee (Q68) ; la reference doit passer avec marge, la
 *        variante lente echouer avec marge ; et l'echec doit etre persiste.
 *   A2 : le predicat refuse 99 essais, un scenario absent, un essai a 19 clients, un essai
 *        sur une seule connexion, des essais sequentiels deguises (un lot par requete
 *        contre la variante sans exclusion), une violation sans `kind`, un verdict constant
 *        (la reference doit passer, la variante sans exclusion echouer, DEUX fois, dans
 *        CHAQUE essai derniere_place et import_et_reserve (capacite) et rejeux_en_conflit
 *        (idempotence)) ; et chaque violation doit etre persistee.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS ; QUESTIONS OUVERTES
 *
 *  • La mesure est faite a P20 seulement (« a partir de P20 » : la clause est active ensuite,
 *    les periodes suivantes ne changent ni le volume ni les plafonds) ; la concurrence a P21.
 *  • Repartition de l'import et cibles de erase_member : questions closes par la decision du
 *    mandant du 31/10/2026 (Q67, Q68), ecrites dans la racine (II). La suite ne verifie pas
 *    la repartition ligne par ligne : elle exige 50 000 lignes et 50 000 acceptees.
 *  • rejeux_simultanes n'est pas mis en defaut par la variante sans exclusion (la cle
 *    request_id = booking_id rend les ecritures perdues indiscernables) : la detection du
 *    doublon idempotent est prouvee par rejeux_en_conflit.
 *  • Le plafond d'un import_bookings de moins de 50 000 lignes (« autre » ?) n'est pas mesure.
 *  • Que le candidat de reference reproduise les faits geles : c'est la precondition de
 *    T74.A4 sur l'instantane partage (29cdd0d : 543 faits, 776 etapes, tous reproduits).
 *    Le candidat de T75 l'importe tel quel et suit toute regeneration ; sa transparence est
 *    verifiee contre le candidat de T74, quel que soit l'instantane.
 *  • Elle ne lance aucun processus `claude`.
 *
 * DUREE — mesuree contre la reference jetable (4 coeurs), instantane 29cdd0d, racine du
 * 31/10/2026 : 7 min 3 s (A1 ~ 381 s, dont ~ 335 s pour la variante lente ; A2 ~ 37 s).
 * Aucun seuil de la carte n'est reduit. Contre l'implementation de ef48fa4 (effacements
 * mesures sur des membres ajoutes sans reservation) : ~ 6 min, A1 ROUGE sur le seul defaut
 * Q68 (« erase_member : 60 echantillon(s) sur un membre qui ne detient aucune reservation
 * importee »), A2 vert.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LOAD_TIMEOUT_MS = 180_000;
const CASE_TIMEOUT_MS = 7_200_000;
const FIXTURE_TIMEOUT_MS = 600_000;

const GRAINE = 7575; // FIXE ICI (convention de T74 : 7474)
const PERIODE_VOLUME = 20;
const PERIODE_CONCURRENCE = 21;
const ECHAUFFEMENT_MIN = 10;
const ECHANTILLONS_MIN = 60;
const MARGE_REFERENCE = 0.5;
const MARGE_LENTE = 2;
const TOLERANCE_MS = 0.05;
const PROTOCOLE = 'bench.platform/1';

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;
type Fonction = (...a: unknown[]) => unknown;

/* ────────────────────────────────────────────────────────────────── socle */

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
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
  if (t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}
const court = (s: string, n = 900): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut, 8000)).toBe(sain);
}
function aucunDefaut(defauts: string[], sain: string): void {
  const n = defauts.length;
  exige(n === 0, sain, `${String(n)} DEFAUT(S) : ${defauts.slice(0, 40).join(' || ')}${n > 40 ? ' || …' : ''}`);
}

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function canonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Json;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonique(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'undefined';
}
const empreinte = (v: unknown): string => createHash('sha256').update(canonique(v)).digest('hex');

function lire(o: unknown, alias: readonly string[]): unknown {
  if (!estObjet(o)) return undefined;
  for (const a of alias) if (a in o && o[a] !== undefined) return o[a];
  return undefined;
}

/** p95 au rang le plus proche (II) : valeur de rang ceil(0,95 x S), 1-base, des echantillons tries. */
function p95RangLePlusProche(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.95 * s.length) - 1)];
}

/* ───────────────────────── racines gelees acceptance/reference-platform */

const RACINES = ['F-PLATFORM-P1-P8.json', 'F-PLATFORM-P9-P16.json', 'F-PLATFORM-P17-P24.json'].map((f) =>
  path.join(REPO, 'acceptance', 'reference-platform', f),
);
interface EtapeGelee {
  id: string;
  period: string;
  op: string;
  args: Json;
}
const TRAJECTOIRE = new Map<number, EtapeGelee[]>();
const OPERATIONS_INTRODUITES = new Map<number, string[]>();
const PERIODES_GELEES = new Map<number, Json>();
const DEFAUTS_RACINES: string[] = [];
for (const f of RACINES) {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
    for (const [p, e] of Object.entries((d.periodes ?? {}) as Json)) {
      const n = Number(/^P(\d+)$/.exec(p)?.[1] ?? NaN);
      if (!Number.isInteger(n) || !estObjet(e)) continue;
      PERIODES_GELEES.set(n, e);
      TRAJECTOIRE.set(n, (e.trajectoire ?? []) as EtapeGelee[]);
      OPERATIONS_INTRODUITES.set(n, Array.isArray(e.operations_introduites) ? e.operations_introduites.map(String) : []);
    }
  } catch (e) {
    DEFAUTS_RACINES.push(`RACINE-ILLISIBLE ${f} : ${rendu(e)}`);
  }
}
for (let n = 1; n <= 24; n += 1) if ((TRAJECTOIRE.get(n) ?? []).length === 0) DEFAUTS_RACINES.push(`RACINE-SANS-TRAJECTOIRE P${n}`);

/** `valeurs` d'une regle gelee (la racine les porte sur la regle, la source sous `contract`). */
function valeursGelees(n: number, id: string): Json {
  const r = ((PERIODES_GELEES.get(n)?.regles ?? []) as Json[]).find((x) => estObjet(x) && x.id === id);
  return estObjet(r) && estObjet(r.valeurs) ? r.valeurs : {};
}

/* ─────────────────────────────────────────── chargement des paquets (T74) */

interface Charge {
  parPaquet: Map<string, Map<string, unknown>>;
  tentatives: string[];
}
function specificateurs(pkg: string): string[] {
  const dir = path.join(REPO, 'packages', pkg);
  const out: string[] = [];
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: unknown };
      if (typeof j.name === 'string' && j.name.length > 0) out.push(j.name);
    } catch {
      /* manifeste illisible */
    }
  }
  const f = path.join(dir, 'src', 'index.ts');
  if (fs.existsSync(f)) out.push(pathToFileURL(f).href);
  return out;
}
let CHARGE: Charge = { parPaquet: new Map(), tentatives: ['beforeAll non execute'] };

beforeAll(async () => {
  // Le chargement ne LEVE pas : chaque cas asserte ce qui lui manque (ASSERTION_FAILED).
  const c: Charge = { parPaquet: new Map(), tentatives: [] };
  for (const pkg of ['scenario', 'activities', 'oracle']) {
    const plat = new Map<string, unknown>();
    for (const s of specificateurs(pkg)) {
      try {
        const mod = (await import(s)) as Ns;
        for (const [k, v] of Object.entries(mod)) if (k !== '__esModule' && !plat.has(k)) plat.set(k, v);
        if (estObjet(mod.default)) for (const [k, v] of Object.entries(mod.default)) if (!plat.has(k)) plat.set(k, v);
        break;
      } catch (e) {
        c.tentatives.push(`import(${s}) -> ${String((e as Error)?.message ?? e).split('\n')[0]}`);
      }
    }
    c.parPaquet.set(pkg, plat);
  }
  CHARGE = c;
}, LOAD_TIMEOUT_MS);

const ROLES: Record<string, { alias: readonly string[]; paquets: readonly string[] }> = {
  platformClauses: {
    alias: ['F_PLATFORM_CLAUSES', 'PLATFORM_CLAUSES', 'platformClauses', 'fPlatformClauses', 'getPlatformClauses', 'loadPlatformClauses', 'F_PLATFORM_SOURCE', 'platformSource', 'platformClauseSource'],
    paquets: ['scenario', 'oracle'],
  },
  platformLatency: {
    alias: ['measurePlatformLatency', 'measureFPlatformLatency', 'runPlatformLatencyBench', 'platformLatencyBench', 'measurePlatformPerformance'],
    paquets: ['scenario', 'activities'],
  },
  platformConcurrency: {
    alias: ['runPlatformConcurrencyTrials', 'runPlatformConcurrency', 'platformConcurrencyTrials', 'runFPlatformConcurrencyTrials', 'checkPlatformConcurrency'],
    paquets: ['scenario', 'activities'],
  },
};
function resoudre(role: string): unknown {
  const r = ROLES[role];
  for (const pkg of r.paquets) {
    const plat = CHARGE.parPaquet.get(pkg);
    if (plat === undefined) continue;
    for (const a of r.alias) if (plat.get(a) !== undefined) return plat.get(a);
  }
  return undefined;
}
function contratManquant(role: string): string {
  const r = ROLES[role];
  const n = r.paquets.map((p) => `${p}:${String(CHARGE.parPaquet.get(p)?.size ?? 0)}`).join(', ');
  return `CONTRAT-NON-SATISFAIT role=${role} : aucun export parmi [${r.alias.join('|')}] dans [${r.paquets.join(', ')}] (exports observes ${n} ; ${CHARGE.tentatives.join(' | ')})`;
}
function fonction(role: string): Fonction {
  const f = resoudre(role);
  exige(typeof f === 'function', `role-${role}-exporte`, contratManquant(role));
  return f as Fonction;
}
const argsPeriode = (n: number, extra: Json = {}): Json => ({ period: n, periodIndex: n, periodId: `P${n}`, ...extra });
async function appeler(role: string, arg: Json): Promise<{ valeur: unknown; defaut: string }> {
  const f = resoudre(role);
  if (typeof f !== 'function') return { valeur: undefined, defaut: contratManquant(role) };
  try {
    return { valeur: await Promise.resolve((f as Fonction)(arg)), defaut: '' };
  } catch (e) {
    return { valeur: undefined, defaut: `${role}-LEVE ${court(rendu(e), 600)}` };
  }
}

/* ───────────────────────────────────────────── la source de clauses (T70 III) */

type Clause = Json;
const idDe = (c: Clause): string => String(lire(c, ['id', 'clause_id', 'clauseId']));
function numeroPeriode(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const m = /^[Pp]?(\d{1,2})$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
}
function active(c: Clause, n: number): boolean {
  const e = numeroPeriode(lire(c, ['enters', 'entry', 'entry_period', 'entryPeriod', 'from', 'since', 'introduced_in', 'introducedIn', 'periode_entree']));
  if (e === null) return false;
  const sv = lire(c, ['exits', 'exit', 'exit_period', 'exitPeriod', 'until', 'retired_in', 'retiredIn', 'periode_sortie']);
  const s = sv === null || sv === undefined ? null : numeroPeriode(sv);
  return e <= n && (s === null || n < s);
}
const valeursDe = (c: Clause | undefined): Json => {
  const k = lire(c, ['contract', 'contract_fragment', 'contractFragment', 'fragment', 'contrat']);
  return estObjet(k) && estObjet(k.valeurs) ? k.valeurs : {};
};

async function source(): Promise<Clause[]> {
  aucunDefaut(DEFAUTS_RACINES, 'racines-gelees-lues');
  let v = resoudre('platformClauses');
  exige(v !== undefined, 'source-de-clauses-exportee', contratManquant('platformClauses'));
  try {
    if (typeof v === 'function') v = await Promise.resolve((v as Fonction)());
    if (estObjet(v) && Array.isArray(v.clauses)) v = v.clauses;
  } catch (e) {
    exige(false, 'source-de-clauses-lue', `SOURCE-LEVE ${rendu(e)}`);
  }
  exige(Array.isArray(v) && v.length > 0 && v.every(estObjet), 'source-de-clauses-lue', `SOURCE-PAS-UN-TABLEAU-DE-CLAUSES ${court(rendu(v), 300)}`);
  return v as Clause[];
}

interface AttentesVolume {
  clause: string;
  plafonds: Map<string, number>;
  plafondImport: number;
  reservations: number;
  creneaux: number;
  membres: number;
  ops: string[];
  /** Operations mesurees sur des membres qui detiennent des reservations importees (profil, precision Q68). */
  surImportes: string[];
}

/** Plafonds et profil lus dans la source ET la racine (I) ; ils doivent concorder. */
function attentesVolume(clauses: Clause[]): { a: AttentesVolume; defauts: string[] } {
  const defauts: string[] = [];
  const porteuse = clauses.find((c) => active(c, PERIODE_VOLUME) && estObjet(valeursDe(c).plafonds_p95_ms));
  const vs = valeursDe(porteuse);
  const vr = valeursGelees(PERIODE_VOLUME, porteuse === undefined ? 'P20.R3' : idDe(porteuse));
  const profil = (PERIODES_GELEES.get(PERIODE_VOLUME)?.volume ?? {}) as Json;
  if (porteuse === undefined) defauts.push(`aucune clause active a P${PERIODE_VOLUME} ne declare plafonds_p95_ms dans la source`);
  for (const [nom, v] of [
    ['racine (regle)', vr.plafonds_p95_ms],
    ['racine (profil volume)', profil.plafonds_p95_ms],
  ] as const) {
    if (canonique(v) !== canonique(vs.plafonds_p95_ms)) defauts.push(`plafonds de la source ${rendu(vs.plafonds_p95_ms)} != ${nom} ${rendu(v)}`);
  }
  for (const [nom, v] of [
    ['racine (regle)', vr.import_50000_lignes_ms],
    ['racine (profil volume)', profil.import_50000_lignes_ms],
  ] as const) {
    if (v !== vs.import_50000_lignes_ms) defauts.push(`plafond d'import de la source ${rendu(vs.import_50000_lignes_ms)} != ${nom} ${rendu(v)}`);
  }
  if (vs.volume_reservations !== profil.reservations) defauts.push(`volume de la source ${rendu(vs.volume_reservations)} != profil ${rendu(profil.reservations)}`);
  const plafonds = new Map<string, number>();
  const brut = estObjet(vs.plafonds_p95_ms) ? vs.plafonds_p95_ms : {};
  for (const [k, v] of Object.entries(brut)) if (estNombre(v)) plafonds.set(k, v);
  if (!plafonds.has('autre')) defauts.push('plafond « autre » absent de la source');
  const ops = new Set<string>();
  for (let m = 1; m <= PERIODE_VOLUME; m += 1) for (const o of OPERATIONS_INTRODUITES.get(m) ?? []) ops.add(o);
  ops.delete('import_bookings');
  // Precision Q68 (decision du mandant du 31/10/2026) : le profil nomme, par un bloc portant `cibles`,
  // chaque operation mesuree sur des membres qui DETIENNENT des reservations importees ; erase_member en est.
  const surImportes = Object.entries(profil)
    .filter(([k, v]) => ops.has(k) && estObjet(v) && typeof v.cibles === 'string')
    .map(([k]) => k)
    .sort();
  if (ops.has('erase_member') && !surImportes.includes('erase_member')) defauts.push('profil de volume sans bloc erase_member { cibles } (precision Q68 de P20.R3)');
  return {
    a: {
      clause: porteuse === undefined ? '' : idDe(porteuse),
      plafonds,
      plafondImport: estNombre(vs.import_50000_lignes_ms) ? vs.import_50000_lignes_ms : NaN,
      reservations: estNombre(profil.reservations) ? profil.reservations : NaN,
      creneaux: estNombre(profil.creneaux) ? profil.creneaux : NaN,
      membres: estNombre(profil.membres) ? profil.membres : NaN,
      ops: [...ops].sort(),
      surImportes,
    },
    defauts,
  };
}
const plafondDe = (a: AttentesVolume, op: string): number => a.plafonds.get(op) ?? (a.plafonds.get('autre') as number);

interface AttentesConcurrence {
  essais: number;
  clients: number;
  scenarios: string[];
  parScenario: number;
}
function attentesConcurrence(clauses: Clause[]): { a: AttentesConcurrence; defauts: string[] } {
  const defauts: string[] = [];
  const bloc = (PERIODES_GELEES.get(PERIODE_CONCURRENCE)?.concurrence ?? {}) as Json;
  const porteuse = clauses.find((c) => active(c, PERIODE_CONCURRENCE) && estNombre(valeursDe(c).essais_paralleles_min));
  const vs = valeursDe(porteuse);
  const vr = valeursGelees(PERIODE_CONCURRENCE, porteuse === undefined ? 'P21.R3' : idDe(porteuse));
  if (porteuse === undefined) defauts.push(`aucune clause active a P${PERIODE_CONCURRENCE} ne declare essais_paralleles_min dans la source`);
  if (vs.essais_paralleles_min !== bloc.essais_min || vr.essais_paralleles_min !== bloc.essais_min) defauts.push(`essais : source ${rendu(vs.essais_paralleles_min)}, regle gelee ${rendu(vr.essais_paralleles_min)}, bloc ${rendu(bloc.essais_min)}`);
  if (vs.clients_paralleles !== bloc.clients_paralleles || vr.clients_paralleles !== bloc.clients_paralleles) defauts.push(`clients : source ${rendu(vs.clients_paralleles)}, regle gelee ${rendu(vr.clients_paralleles)}, bloc ${rendu(bloc.clients_paralleles)}`);
  const scenarios = Array.isArray(bloc.scenarios) ? bloc.scenarios.map((s) => String((s as Json).nom)) : [];
  if (scenarios.length === 0) defauts.push('bloc concurrence sans scenario');
  const essais = estNombre(bloc.essais_min) ? bloc.essais_min : NaN;
  return {
    a: { essais, clients: estNombre(bloc.clients_paralleles) ? bloc.clients_paralleles : NaN, scenarios, parScenario: Math.ceil(essais / Math.max(1, scenarios.length)) },
    defauts,
  };
}

/* ═══════════════════════ candidats et lancement (III) */

const FIXTURES = path.join(REPO, 'acceptance', 'fixtures', 'candidates');
const T75 = path.join(FIXTURES, 'f-platform-t75');
const CANDIDAT_T74 = path.join(FIXTURES, 'f-platform-reference-candidate.mjs');
const INSTANTANE = path.join(FIXTURES, 'f-platform-reference');
const VARIANTES = {
  reference: path.join(T75, 'candidat.mjs'),
  balayage: path.join(T75, 'variante-balayage.mjs'),
  'sans-exclusion': path.join(T75, 'variante-sans-exclusion.mjs'),
} as const;
type Variante = keyof typeof VARIANTES;
const RACINE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't75-'));

/** Instantane du MANIFEST intact ; ni lui ni les fixtures de T75 n'importent @bench/*. */
function defautsFixtures(): string[] {
  const out: string[] = [];
  let m: Json = {};
  try {
    m = JSON.parse(fs.readFileSync(path.join(INSTANTANE, 'MANIFEST.json'), 'utf8')) as Json;
  } catch (e) {
    return [`MANIFEST illisible : ${rendu(e)}`];
  }
  const fichiers = estObjet(m.fichiers) ? m.fichiers : {};
  if (Object.keys(fichiers).length !== 2) out.push(`MANIFEST : ${Object.keys(fichiers).length} fichier(s) au lieu de 2`);
  for (const [f, h] of Object.entries(fichiers)) {
    try {
      if (createHash('sha256').update(fs.readFileSync(path.join(INSTANTANE, f))).digest('hex') !== h) out.push(`INSTANTANE ALTERE : ${f}`);
    } catch {
      out.push(`INSTANTANE ABSENT : ${f}`);
    }
  }
  const aLire = [...Object.values(VARIANTES), path.join(T75, 'accelerateur.mjs'), ...Object.keys(fichiers).map((x) => path.join(INSTANTANE, x))];
  for (const f of aLire) {
    try {
      if (/from\s+['"]@bench\/|import\(\s*['"]@bench\/|packages\/oracle/u.test(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gmu, ''))) out.push(`${path.relative(REPO, f)} importe un paquet de l'implementation`);
    } catch {
      out.push(`ABSENT : ${path.relative(REPO, f)}`);
    }
  }
  return out;
}

/** Dialogue bench.platform/1 sur stdin avec un processus neuf ; rend les reponses dans l'ordre. */
function dialoguer(argv: string[], env: NodeJS.ProcessEnv, requetes: Json[]): Promise<{ reponses: unknown[]; defaut: string }> {
  return new Promise((resolve) => {
    const c = spawn(argv[0], argv.slice(1), { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let sortie = '';
    let erreurs = '';
    const minuteur = setTimeout(() => c.kill('SIGKILL'), FIXTURE_TIMEOUT_MS);
    c.stdout.on('data', (d: Buffer) => {
      sortie += d.toString('utf8');
    });
    c.stderr.on('data', (d: Buffer) => {
      erreurs += d.toString('utf8');
    });
    c.on('close', (code) => {
      clearTimeout(minuteur);
      const lignes = sortie.split('\n').filter((l) => l.trim() !== '');
      let pret: unknown = null;
      try {
        pret = JSON.parse(lignes[0] ?? 'null');
      } catch {
        pret = null;
      }
      if (!estObjet(pret) || pret.ready !== true || pret.protocol !== PROTOCOLE) {
        resolve({ reponses: [], defaut: `fixture non prete (code ${String(code)}) : ${court(lignes[0] ?? '', 200)} ${court(erreurs, 400)}` });
        return;
      }
      const parId = new Map<string, unknown>();
      for (const l of lignes.slice(1)) {
        try {
          const j = JSON.parse(l) as Json;
          parId.set(String(j.id), j.response);
        } catch {
          /* ligne illisible */
        }
      }
      resolve({ reponses: requetes.map((q) => parId.get(String(q.id))), defaut: parId.size === requetes.length ? '' : `${parId.size} reponse(s) pour ${requetes.length} requete(s) ; ${court(erreurs, 400)}` });
    });
    for (const q of requetes) c.stdin.write(`${JSON.stringify(q)}\n`);
    c.stdin.end();
  });
}

/**
 * Transparence des index (III.a) : la trajectoire gelee entiere, un processus par periode
 * sur un meme BENCH_DATA_DIR, contre le candidat de T75 et contre celui de T74 ; reponses
 * identiques octet pour octet (JSON canonique). Les faits geles ne sont PAS exiges ici :
 * c'est la precondition de T74.A4 sur l'instantane partage (VI).
 */
async function defautsTransparence(): Promise<string[]> {
  const out: string[] = [];
  const dirs = { t74: fs.mkdtempSync(path.join(RACINE_TMP, 'traj74-')), t75: fs.mkdtempSync(path.join(RACINE_TMP, 'traj75-')) };
  let nbEtapes = 0;
  for (let n = 1; n <= 24; n += 1) {
    const lot = (TRAJECTOIRE.get(n) ?? []).map((s) => ({ ...s }));
    const [a, b] = await Promise.all([dialoguer(['node', CANDIDAT_T74], { BENCH_DATA_DIR: dirs.t74 }, lot), dialoguer(['node', VARIANTES.reference], { BENCH_DATA_DIR: dirs.t75 }, lot)]);
    if (a.defaut !== '' || b.defaut !== '') {
      out.push(`P${n} : T74 ${a.defaut || 'ok'} ; T75 ${b.defaut || 'ok'}`);
      break;
    }
    lot.forEach((s, i) => {
      nbEtapes += 1;
      if (a.reponses[i] === undefined || canonique(a.reponses[i]) !== canonique(b.reponses[i])) out.push(`${s.id} : T74 ${court(rendu(a.reponses[i]), 200)} ; T75 ${court(rendu(b.reponses[i]), 200)}`);
    });
  }
  if (nbEtapes === 0 && out.length === 0) out.push('aucune etape comparee');
  return out;
}

interface Lancement {
  candidateCommand: string[];
  benchDataDir: string;
  journal: string;
}
/** Lanceur au nom aleatoire : reference et variantes ont des commandes de meme forme. */
function preparerLancement(v: Variante): Lancement {
  const dossier = fs.mkdtempSync(path.join(RACINE_TMP, 'run-'));
  const journal = path.join(dossier, 'traffic.ndjson');
  const lanceur = path.join(dossier, `candidate-${randomBytes(6).toString('hex')}.mjs`);
  const benchDataDir = fs.mkdtempSync(path.join(RACINE_TMP, 'data-'));
  fs.writeFileSync(lanceur, [`process.env.BENCH_TRAFFIC_LOG = ${JSON.stringify(journal)};`, `await import(${JSON.stringify(pathToFileURL(VARIANTES[v]).href)});`, ''].join('\n'));
  return { candidateCommand: ['node', lanceur], benchDataDir, journal };
}

interface Entree {
  pid: number;
  data_dir: string;
  conn: number;
  id: string;
  op: string | null;
  period: string | null;
  resp: string;
  ok: boolean;
  status: string | null;
  t_in: number;
  t_out: number;
  lot: number | null;
  rid: string | null;
  slot: string | null;
  member: string | null;
  held: number | null;
  args_h: string;
  rows: number | null;
  accepted: number | null;
  rang: number;
}
function lireTrafic(journal: string): Entree[] {
  const out: Entree[] = [];
  if (!fs.existsSync(journal)) return out;
  for (const ligne of fs.readFileSync(journal, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue;
    try {
      const e = JSON.parse(ligne) as Json;
      out.push({ ...(e as unknown as Entree), id: String(e.id), rang: out.length });
    } catch {
      /* ligne tronquee */
    }
  }
  return out;
}
function parId(t: Entree[]): Map<string, Entree[]> {
  const m = new Map<string, Entree[]>();
  for (const e of t) m.set(e.id, [...(m.get(e.id) ?? []), e]);
  return m;
}

/* ═══════════════════════ A1 — mesure de latence */

interface Mesure {
  op: string;
  p95: unknown;
  plafond: unknown;
  clause: unknown;
  samples: unknown;
  warmup: unknown;
  latences: unknown;
  ids: unknown;
  pass: unknown;
}
function mesuresDe(r: unknown): Mesure[] | null {
  if (!estObjet(r)) return null;
  const v = r.operations ?? r.measures ?? r.mesures;
  const lot: [string, unknown][] = Array.isArray(v) ? v.map((x) => [String(lire(x, ['op', 'operation']) ?? ''), x]) : estObjet(v) ? Object.entries(v) : [];
  if (lot.length === 0) return null;
  return lot.map(([op, x]) => ({
    op,
    p95: lire(x, ['p95_ms', 'p95']),
    plafond: lire(x, ['ceiling_ms', 'ceiling', 'plafond_ms']),
    clause: lire(x, ['clause', 'clause_id', 'clauseId']),
    samples: lire(x, ['samples', 'sample_count', 'echantillons']),
    warmup: lire(x, ['warmup', 'warmup_count', 'echauffement']),
    latences: lire(x, ['latencies_ms', 'latencies', 'samples_ms']),
    ids: lire(x, ['request_ids', 'requestIds', 'ids']),
    pass: lire(x, ['pass', 'ok', 'passed']),
  }));
}

/**
 * Defauts d'une mesure de latence (A1) : forme, plafonds et clause lus dans la source,
 * p95 au rang le plus proche, verdicts coherents, et chaque echantillon authentique dans
 * le journal du candidat (V).
 */
function defautsMesure(r: unknown, trafic: Entree[], a: AttentesVolume): string[] {
  const out: string[] = [];
  const ms = mesuresDe(r);
  if (ms === null || !estObjet(r)) return [`resultat sans mesures par operation : ${court(rendu(r), 300)}`];
  const index = parId(trafic);
  // L'import de volume.
  const imp = lire(r, ['import', 'import_bookings', 'volume_import']);
  const latImp = lire(imp, ['latency_ms', 'duration_ms', 'ms']);
  const idImp = lire(imp, ['request_id', 'requestId', 'id']);
  let dossier = '';
  let finImport = Infinity;
  let passImport: boolean | null = null;
  if (!estObjet(imp) || !estNombre(latImp)) out.push(`import : pas de { latency_ms, ceiling_ms, request_id } (${court(rendu(imp), 200)})`);
  else {
    const plaf = lire(imp, ['ceiling_ms', 'ceiling', 'plafond_ms']);
    if (plaf !== a.plafondImport) out.push(`import : plafond ${rendu(plaf)} au lieu de ${a.plafondImport} (source)`);
    passImport = latImp <= a.plafondImport;
    if (lire(imp, ['pass', 'ok', 'passed']) !== passImport) out.push(`import : verdict ${rendu(lire(imp, ['pass', 'ok', 'passed']))} pour ${latImp} ms contre ${a.plafondImport}`);
    const es = index.get(String(idImp)) ?? [];
    if (es.length !== 1) out.push(`import : request_id ${rendu(idImp)} vu ${es.length} fois au journal du candidat`);
    else {
      const e = es[0];
      dossier = e.data_dir;
      finImport = e.t_out;
      if (e.op !== 'import_bookings' || e.rows !== a.reservations || e.accepted !== a.reservations || !e.ok) {
        out.push(`import : ${rendu(e.op)} de ${rendu(e.rows)} lignes, ${rendu(e.accepted)} acceptee(s) (attendu import_bookings de ${a.reservations} lignes, ${a.reservations} acceptees)`);
      }
      if (e.period !== `P${PERIODE_VOLUME}`) out.push(`import : periode ${rendu(e.period)}`);
      if (latImp + TOLERANCE_MS < e.t_out - e.t_in) out.push(`import : latence rendue ${latImp} ms < traitement du candidat ${(e.t_out - e.t_in).toFixed(3)} ms`);
      const avant = trafic.filter((x) => x.data_dir === dossier && x.rang < e.rang && x.ok);
      const nb = (op: string): number => avant.filter((x) => x.op === op).length;
      if (nb('create_slot') < a.creneaux || nb('add_member') < a.membres) out.push(`import : ${nb('create_slot')} creneau(x) et ${nb('add_member')} membre(s) crees avant (profil : ${a.creneaux} et ${a.membres})`);
    }
  }
  // Chaque operation active a P20.
  const vues = new Set(ms.map((m) => m.op));
  for (const op of a.ops) if (!vues.has(op)) out.push(`${op} : operation active a P${PERIODE_VOLUME} non mesuree`);
  let passGlobal = passImport === true;
  for (const m of ms) {
    const ou = m.op;
    if (!a.ops.includes(m.op)) {
      out.push(`${ou} : operation inconnue ou inactive a P${PERIODE_VOLUME}`);
      continue;
    }
    const attendu = plafondDe(a, m.op);
    if (m.plafond !== attendu) out.push(`${ou} : plafond ${rendu(m.plafond)} au lieu de ${attendu} (source, clause ${a.clause})`);
    if (m.clause !== a.clause) out.push(`${ou} : clause ${rendu(m.clause)} au lieu de ${a.clause}`);
    if (!Number.isInteger(m.warmup) || (m.warmup as number) < ECHAUFFEMENT_MIN) out.push(`${ou} : echauffement ${rendu(m.warmup)} (< ${ECHAUFFEMENT_MIN})`);
    const lat = Array.isArray(m.latences) && m.latences.every(estNombre) ? (m.latences as number[]) : null;
    const ids = Array.isArray(m.ids) ? m.ids.map(String) : null;
    if (!Number.isInteger(m.samples) || (m.samples as number) < ECHANTILLONS_MIN) out.push(`${ou} : ${rendu(m.samples)} echantillon(s) (< ${ECHANTILLONS_MIN})`);
    if (lat === null || ids === null || lat.length !== m.samples || ids.length !== m.samples || new Set(ids).size !== ids.length) {
      out.push(`${ou} : latencies_ms et request_ids doivent etre ${rendu(m.samples)} valeurs (ids distincts)`);
      continue;
    }
    if (!estNombre(m.p95) || Math.abs(m.p95 - p95RangLePlusProche(lat)) > 1e-9) out.push(`${ou} : p95 ${rendu(m.p95)} != rang le plus proche ${p95RangLePlusProche(lat)} des echantillons rendus`);
    const passOp = estNombre(m.p95) && m.p95 <= attendu;
    if (m.pass !== passOp) out.push(`${ou} : verdict ${rendu(m.pass)} pour p95 ${rendu(m.p95)} contre ${attendu}`);
    passGlobal = passGlobal && passOp;
    // Authenticite (V).
    const faux: string[] = [];
    const vus: Entree[] = [];
    const sansImport: string[] = [];
    ids.forEach((id, i) => {
      const es = index.get(id) ?? [];
      if (es.length !== 1) return void faux.push(`${id} vu ${es.length} fois`);
      const e = es[0];
      if (e.op !== m.op || !e.ok || e.period !== `P${PERIODE_VOLUME}`) return void faux.push(`${id} : ${rendu(e.op)} ok=${String(e.ok)} ${rendu(e.period)}`);
      if (e.data_dir !== dossier || e.t_in < finImport) return void faux.push(`${id} : hors du volume importe`);
      if (lat[i] + TOLERANCE_MS < e.t_out - e.t_in) faux.push(`${id} : latence rendue ${lat[i]} ms < traitement du candidat ${(e.t_out - e.t_in).toFixed(3)} ms`);
      // Precision Q68 : le membre vise detient, juste avant l'operation, des reservations creees par l'import.
      if (a.surImportes.includes(m.op) && (typeof e.member !== 'string' || !Number.isInteger(e.held) || (e.held as number) < 1)) sansImport.push(`${id} : membre ${rendu(e.member)}, ${rendu(e.held)} reservation(s) importee(s) detenue(s)`);
      vus.push(e);
    });
    if (sansImport.length > 0) out.push(`${ou} : ${sansImport.length} echantillon(s) sur un membre qui ne detient aucune reservation importee (precision Q68 de P20.R3 : chemin d'effacement couteux exige) : ${sansImport.slice(0, 3).join(' ; ')}`);
    vus.sort((x, y) => x.t_in - y.t_in);
    for (let i = 1; i < vus.length; i += 1) if (vus[i].t_in < vus[i - 1].t_out) faux.push(`${vus[i].id} arrive avant la reponse de ${vus[i - 1].id} (echantillons concurrents)`);
    if (vus.length > 0) {
      const debut = vus[0].t_in;
      const chauffe = trafic.filter((x) => x.data_dir === dossier && x.op === m.op && x.t_in >= finImport && x.t_in < debut).length;
      if (chauffe < ECHAUFFEMENT_MIN) faux.push(`${chauffe} requete(s) ${m.op} avant le premier echantillon (< ${ECHAUFFEMENT_MIN})`);
    }
    if (faux.length > 0) out.push(`${ou} : ${faux.length} echantillon(s) non authentique(s) : ${faux.slice(0, 3).join(' ; ')}`);
  }
  if (lire(r, ['pass', 'ok', 'passed']) !== passGlobal) out.push(`verdict global ${rendu(lire(r, ['pass', 'ok', 'passed']))} incoherent (attendu ${String(passGlobal)} d'apres les mesures)`);
  return out;
}

/** Rapports p95 / plafond rendus (et l'import) : pour les marges (IV). */
function rapports(r: unknown, a: AttentesVolume): { op: string; rapport: number }[] {
  const out: { op: string; rapport: number }[] = [];
  for (const m of mesuresDe(r) ?? []) if (estNombre(m.p95)) out.push({ op: m.op, rapport: m.p95 / plafondDe(a, m.op) });
  const li = lire(lire(r, ['import', 'import_bookings', 'volume_import']), ['latency_ms', 'duration_ms', 'ms']);
  if (estNombre(li)) out.push({ op: 'import_bookings (50 000 lignes)', rapport: li / a.plafondImport });
  return out;
}

/** Une mesure et un journal SYNTHETIQUES coherents : temoin des controles negatifs de A1. */
function syntheseA1(a: AttentesVolume): { r: Json; t: Entree[] } {
  const t: Entree[] = [];
  let clock = 1000;
  const ligne = (id: string, op: string, dur: number, extra: Partial<Entree> = {}): Entree => {
    const e: Entree = { pid: 1, data_dir: '/d', conn: 0, id, op, period: `P${PERIODE_VOLUME}`, resp: 'x', ok: true, status: null, t_in: clock, t_out: clock + dur, lot: null, rid: null, slot: null, member: null, held: null, args_h: 'a', rows: null, accepted: null, rang: t.length, ...extra };
    clock += dur + 1;
    t.push(e);
    return e;
  };
  for (let i = 0; i < a.creneaux; i += 1) ligne(`s${i}`, 'create_slot', 0.1);
  for (let i = 0; i < a.membres; i += 1) ligne(`m${i}`, 'add_member', 0.1);
  ligne('imp', 'import_bookings', 2000, { rows: a.reservations, accepted: a.reservations });
  const operations: Json = {};
  for (const op of a.ops) {
    const membre = (k: number): Partial<Entree> => (a.surImportes.includes(op) ? { member: `m${k}`, held: 50 } : {});
    for (let k = 0; k < ECHAUFFEMENT_MIN; k += 1) ligne(`${op}-w${k}`, op, 1, membre(k));
    const ids: string[] = [];
    const lat: number[] = [];
    for (let k = 0; k < ECHANTILLONS_MIN; k += 1) {
      ligne(`${op}-${k}`, op, 1 + (k % 7) * 0.5, membre(ECHAUFFEMENT_MIN + k));
      ids.push(`${op}-${k}`);
      lat.push(1.2 + (k % 7) * 0.5);
    }
    const p = p95RangLePlusProche(lat);
    operations[op] = { p95_ms: p, ceiling_ms: plafondDe(a, op), clause: a.clause, samples: ECHANTILLONS_MIN, warmup: ECHAUFFEMENT_MIN, latencies_ms: lat, request_ids: ids, pass: p <= plafondDe(a, op) };
  }
  return { r: { pass: true, import: { latency_ms: 2000.5, ceiling_ms: a.plafondImport, request_id: 'imp', pass: true }, operations }, t };
}

/* ═══════════════════════ A2 — essais paralleles */

const KIND_CAPACITE = ['capacity', 'capacite', 'capacité', 'overbooking'];
const KIND_IDEMPOTENCE = ['idempotency', 'idempotence', 'duplicate', 'doublon'];

interface Essai {
  scenario: string;
  clients: unknown;
  ids: string[] | null;
}
function essaisDe(r: unknown): Essai[] | null {
  const v = lire(r, ['trials', 'essais']);
  if (!Array.isArray(v)) return null;
  return v.map((x) => {
    const ids = lire(x, ['request_ids', 'requestIds', 'ids']);
    return { scenario: String(lire(x, ['scenario', 'nom']) ?? ''), clients: lire(x, ['clients', 'clients_paralleles', 'parallel']), ids: Array.isArray(ids) ? ids.map(String) : null };
  });
}
/** Les violations du resultat : son tableau `violations` (II), chacune portant trial, scenario, kind. */
function violationsUniques(r: unknown): Json[] {
  const v = lire(r, ['violations']);
  return Array.isArray(v) ? (v.filter(estObjet) as Json[]) : [];
}
const kindDe = (v: Json): string => String(lire(v, ['kind', 'invariant', 'type']) ?? '').toLowerCase();

/**
 * Defauts d'une serie d'essais (A2) : nombre, scenarios, essais paralleles authentiques
 * (V) ; `lots` : exiger qu'un essai forme un seul lot (variante sans exclusion).
 */
function defautsEssais(r: unknown, trafic: Entree[], a: AttentesConcurrence, lots: boolean): string[] {
  const out: string[] = [];
  const es = essaisDe(r);
  if (es === null) return [`resultat sans essais : ${court(rendu(r), 300)}`];
  if (es.length < a.essais) out.push(`${es.length} essai(s) (< ${a.essais})`);
  for (const s of a.scenarios) {
    const n = es.filter((e) => e.scenario === s).length;
    if (n < a.parScenario) out.push(`scenario ${s} : ${n} essai(s) (< ${a.parScenario})`);
  }
  const index = parId(trafic);
  const pids = new Set<number>();
  es.forEach((e, i) => {
    const ou = `essai ${i} (${e.scenario})`;
    if (!a.scenarios.includes(e.scenario)) out.push(`${ou} : scenario inconnu de la racine`);
    if (!Number.isInteger(e.clients) || (e.clients as number) < a.clients) out.push(`${ou} : ${rendu(e.clients)} client(s) (< ${a.clients})`);
    if (e.ids === null || e.ids.length < a.clients) return void out.push(`${ou} : ${e.ids?.length ?? 0} requete(s) parallele(s) (< ${a.clients})`);
    const vus: Entree[] = [];
    for (const id of e.ids) {
      const x = index.get(id) ?? [];
      if (x.length !== 1) return void out.push(`${ou} : requete ${id} vue ${x.length} fois au journal`);
      vus.push(x[0]);
    }
    for (const x of vus) pids.add(x.pid);
    if (vus.some((x) => x.period !== `P${PERIODE_CONCURRENCE}`)) out.push(`${ou} : requete hors P${PERIODE_CONCURRENCE}`);
    const conns = new Set(vus.map((x) => x.conn)).size;
    if (conns < a.clients) out.push(`${ou} : ${conns} connexion(s) distincte(s) (< ${a.clients})`);
    if (lots) {
      const l = new Set(vus.map((x) => x.lot));
      if (l.size !== 1 || l.has(null)) out.push(`${ou} : ${l.size} lot(s) (${[...l].slice(0, 4).join(',')}) : requetes non simultanees (essai sequentiel deguise)`);
    }
    const reserves = vus.filter((x) => x.op === 'reserve');
    const rids = new Set(reserves.map((x) => x.rid));
    const args = new Set(reserves.map((x) => x.args_h));
    const slots = new Set(reserves.map((x) => x.slot));
    if (e.scenario === 'derniere_place' && (reserves.length !== vus.length || rids.size !== vus.length || slots.size !== 1)) out.push(`${ou} : pas ${vus.length} reserve de request_id distincts sur un meme creneau`);
    if (e.scenario === 'rejeux_simultanes' && (reserves.length !== vus.length || rids.size !== 1 || args.size !== 1)) out.push(`${ou} : pas des reserve de meme request_id et memes args`);
    if (e.scenario === 'rejeux_en_conflit' && (reserves.length !== vus.length || rids.size !== 1 || args.size < 2)) out.push(`${ou} : pas des reserve de meme request_id aux args differents`);
    if (e.scenario === 'import_et_reserve' && (!vus.some((x) => x.op === 'import_bookings') || reserves.length === 0 || slots.size !== 1)) out.push(`${ou} : pas un import_bookings et des reserve concurrents sur un creneau`);
  });
  if (pids.size > 1) out.push(`essais contre ${pids.size} processus (attendu : le meme processus candidat)`);
  // Verdict coherent, violations bien formees.
  const vs = violationsUniques(r);
  for (const v of vs) {
    const t = lire(v, ['trial', 'essai']);
    if (!Number.isInteger(t) || (t as number) < 0 || (t as number) >= es.length) out.push(`violation sans essai valide : ${court(rendu(v), 160)}`);
    else if (lire(v, ['scenario']) !== es[t as number].scenario) out.push(`violation de l'essai ${String(t)} : scenario ${rendu(lire(v, ['scenario']))} != ${es[t as number].scenario}`);
    if (kindDe(v) === '') out.push(`violation sans kind : ${court(rendu(v), 160)}`);
  }
  if (lire(r, ['pass', 'ok', 'passed']) !== (vs.length === 0)) out.push(`verdict ${rendu(lire(r, ['pass', 'ok', 'passed']))} avec ${vs.length} violation(s)`);
  return out;
}

/** Issue des essais de la reference, lue au journal (V) : le scenario a vraiment dispute la ressource. */
function defautsIssueReference(r: unknown, trafic: Entree[]): string[] {
  const out: string[] = [];
  const index = parId(trafic);
  (essaisDe(r) ?? []).forEach((e, i) => {
    const vus = (e.ids ?? []).map((id) => (index.get(id) ?? [])[0]).filter((x): x is Entree => x !== undefined);
    if (vus.length === 0) return;
    const ou = `essai ${i} (${e.scenario})`;
    const confirmed = vus.filter((x) => x.status === 'confirmed').length;
    const waiting = vus.filter((x) => x.status === 'waiting').length;
    if (e.scenario === 'derniere_place' && (confirmed !== 1 || waiting !== vus.length - 1)) out.push(`${ou} : ${confirmed} confirmed et ${waiting} waiting (attendu 1 et ${vus.length - 1} : la derniere place n'a pas ete disputee)`);
    if (e.scenario === 'rejeux_simultanes' && (new Set(vus.map((x) => x.resp)).size !== 1 || !vus[0].ok)) out.push(`${ou} : reponses non identiques ou refus`);
    if (e.scenario === 'rejeux_en_conflit') {
      // Une seule reponse ok distincte (la memorisee) ; les autres sont des refus (IDEMPOTENCY_CONFLICT).
      const creations = new Set(vus.filter((x) => x.ok).map((x) => x.resp));
      if (creations.size !== 1) out.push(`${ou} : ${creations.size} reponse(s) ok distincte(s) pour une meme cle (attendu 1)`);
    }
  });
  return out;
}

/** Essais et journal SYNTHETIQUES coherents : temoin des controles negatifs de A2. */
function syntheseA2(a: AttentesConcurrence): { r: Json; t: Entree[] } {
  const t: Entree[] = [];
  const trials: Json[] = [];
  let clock = 1;
  for (let i = 0; i < a.essais; i += 1) {
    const scenario = a.scenarios[i % a.scenarios.length];
    const ids: string[] = [];
    for (let k = 0; k < a.clients; k += 1) {
      const id = `t${i}-${k}`;
      ids.push(id);
      const imp = scenario === 'import_et_reserve' && k === 0;
      t.push({
        pid: 1, data_dir: '/d', conn: k + 1, id, op: imp ? 'import_bookings' : 'reserve', period: `P${PERIODE_CONCURRENCE}`, resp: scenario === 'rejeux_simultanes' ? 'r' : `r${k}`, ok: !(scenario === 'rejeux_en_conflit' && k > 0),
        status: scenario === 'derniere_place' ? (k === 0 ? 'confirmed' : 'waiting') : 'confirmed', t_in: clock + k * 0.01, t_out: clock + 150, lot: i + 1,
        rid: imp ? null : scenario.startsWith('rejeux') ? `x${i}` : `x${i}-${k}`, slot: imp ? null : `s${i}`, member: null, held: null, args_h: scenario === 'rejeux_en_conflit' ? `a${k}` : 'a', rows: imp ? 10 : null, accepted: null, rang: t.length,
      });
    }
    clock += 200;
    trials.push({ scenario, clients: a.clients, request_ids: ids, violations: [] });
  }
  return { r: { pass: true, trials, violations: [] }, t };
}

/* ─────────────────────────────────────────── PostgreSQL REEL (comme T74) */

const RUN = `t75_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;
const dsnFor = (db: string): string => `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], { encoding: 'utf8', timeout: 120_000, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}
let ADMIN_DB: string | null = null;
function adminDb(): string {
  if (ADMIN_DB === null) {
    ADMIN_DB = 'postgres';
    for (const cand of ['postgres', PG_USER, 'template1']) {
      if (psql(cand, 'SELECT 1').ok) {
        ADMIN_DB = cand;
        break;
      }
    }
  }
  return ADMIN_DB;
}
const BASES_CREEES: string[] = [];
function creerBase(suffixe: string): { nom: string; erreur: string } {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(adminDb(), `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(adminDb(), `CREATE DATABASE "${nom}"`);
  if (r.ok) BASES_CREEES.push(nom);
  return { nom, erreur: r.ok ? '' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}` };
}
afterAll(() => {
  for (const db of BASES_CREEES) psql(adminDb(), `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  try {
    fs.rmSync(RACINE_TMP, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});
/** Tous les objets JSON des lignes du schema public (JSON imbrique et chaines JSON compris). */
function objetsPersistes(db: string): { objets: Json[]; defaut: string } {
  const t = psql(db, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1");
  if (!t.ok) return { objets: [], defaut: `lecture des tables : ${court(t.out, 300)}` };
  const objets: Json[] = [];
  const parcourir = (v: unknown, profondeur: number): void => {
    if (profondeur > 40) return;
    if (typeof v === 'string') {
      const s = v.trim();
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        try {
          parcourir(JSON.parse(s), profondeur + 1);
        } catch {
          /* texte */
        }
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) parcourir(x, profondeur + 1);
      return;
    }
    if (estObjet(v)) {
      objets.push(v);
      for (const x of Object.values(v)) parcourir(x, profondeur + 1);
    }
  };
  for (const table of t.out.split('\n').filter((x) => x.trim() !== '')) {
    const r = psql(db, `SELECT row_to_json(t)::text FROM "${table.replace(/"/g, '""')}" t`);
    if (!r.ok) return { objets, defaut: `lecture de ${table} : ${court(r.out, 300)}` };
    for (const l of r.out.split('\n')) {
      if (l.trim() === '') continue;
      try {
        parcourir(JSON.parse(l), 0);
      } catch {
        /* ligne illisible */
      }
    }
  }
  return { objets, defaut: '' };
}

/* ═══════════════════════ executions */

interface Execution {
  resultat: unknown;
  defaut: string;
  trafic: Entree[];
  duree_s: number;
}
async function executer(role: 'platformLatency' | 'platformConcurrency', v: Variante, postgresDatabase?: string): Promise<Execution> {
  const l = preparerLancement(v);
  const extra: Json = { seed: GRAINE, candidateCommand: l.candidateCommand, benchDataDir: l.benchDataDir };
  if (postgresDatabase !== undefined) extra.postgresDatabase = postgresDatabase;
  const t0 = Date.now();
  const r = await appeler(role, argsPeriode(role === 'platformLatency' ? PERIODE_VOLUME : PERIODE_CONCURRENCE, extra));
  return { resultat: r.valeur, defaut: r.defaut, trafic: lireTrafic(l.journal), duree_s: (Date.now() - t0) / 1000 };
}

/* ═════════════════════════════════════════════════════════════ les cas */

describe('T75 — controles de performance et de concurrence (ADR-021 decision 3)', () => {
  it(
    'T75.A1 a partir de P20, cinquante mille reservations sont importees, la latence au 95e centile de chaque operation est mesuree et comparee au plafond de sa clause, et un candidat de reference qui parcourt toutes les reservations a chaque operation depasse le plafond et echoue',
    async () => {
      const clauses = await source();
      const { a, defauts: dv } = attentesVolume(clauses);
      aucunDefaut(dv, 'plafonds-et-profil-lus-dans-la-source-et-la-racine-concordent');
      exige(a.ops.length >= 20 && a.clause !== '', 'operations-actives-a-P20-lues', `operations actives : ${a.ops.join(', ')} ; clause ${a.clause}`);

      // CONTROLES NEGATIFS (V) : le predicat refuse des mesures creuses.
      const temoins: string[] = [];
      const base = syntheseA1(a);
      const d0 = defautsMesure(base.r, base.t, a);
      if (d0.length !== 0) temoins.push(`une mesure correcte serait refusee : ${d0.slice(0, 3).join(' | ')}`);
      const op0 = a.ops.includes('get_booking') ? 'get_booking' : a.ops[0];
      const avec = (f: (r: Json, t: Entree[]) => void): { r: Json; t: Entree[] } => {
        const c = { r: JSON.parse(JSON.stringify(base.r)) as Json, t: base.t.map((e) => ({ ...e })) };
        f(c.r, c.t);
        return c;
      };
      const mes = (r: Json, op = op0): Json => (r.operations as Json)[op] as Json;
      const essais: [string, { r: Json; t: Entree[] }][] = [
        ['une mesure qui ignore la latence (0,05 ms)', avec((r) => {
          const m = mes(r);
          m.latencies_ms = (m.latencies_ms as number[]).map(() => 0.05);
          m.p95_ms = 0.05;
        })],
        ['un p95 qui est la mediane', avec((r) => {
          const m = mes(r);
          const s = [...(m.latencies_ms as number[])].sort((x, y) => x - y);
          m.p95_ms = s[Math.floor(s.length / 2)];
        })],
        ['un plafond unique recopie (100 ms)', avec((r) => {
          for (const op of a.ops) mes(r, op).ceiling_ms = 100;
        })],
        ['une mesure sans clause', avec((r) => {
          delete mes(r).clause;
        })],
        [`${ECHANTILLONS_MIN - 1} echantillons`, avec((r) => {
          const m = mes(r);
          m.samples = ECHANTILLONS_MIN - 1;
          m.latencies_ms = (m.latencies_ms as number[]).slice(1);
          m.request_ids = (m.request_ids as string[]).slice(1);
          m.p95_ms = p95RangLePlusProche(m.latencies_ms as number[]);
        })],
        ['un echantillon refuse (ok: false)', avec((r, t) => {
          const e = t.find((x) => x.id === (mes(r).request_ids as string[])[3]);
          if (e) e.ok = false;
        })],
        ['aucun echauffement', avec((r, t) => {
          mes(r).warmup = 0;
          for (const e of t) if (e.op === op0 && e.id.includes('-w')) e.op = 'autre_chose';
        })],
        ['des echantillons concurrents', avec((r, t) => {
          // Chaque echantillon arrive 1,5 ms plus tot (avant la reponse du precedent) ; latences relevees d'autant.
          for (const e of t) if (e.op === op0 && !e.id.includes('-w')) e.t_in -= 1.5;
          const m = mes(r);
          m.latencies_ms = (m.latencies_ms as number[]).map((x) => x + 2);
          m.p95_ms = p95RangLePlusProche(m.latencies_ms as number[]);
        })],
        ['un import de 1 000 reservations', avec((_r, t) => {
          const e = t.find((x) => x.op === 'import_bookings');
          if (e) e.accepted = 1000;
        })],
        ['un verdict constant (pass malgre un depassement)', avec((r) => {
          const m = mes(r);
          m.latencies_ms = (m.latencies_ms as number[]).map((x) => x + 1000);
          m.p95_ms = p95RangLePlusProche(m.latencies_ms as number[]);
          m.pass = true;
        })],
        ['une operation manquante', avec((r) => {
          delete (r.operations as Json)[op0];
        })],
        ...a.surImportes.map((op): [string, { r: Json; t: Entree[] }] => [
          `${op} mesure sur des membres sans reservation importee (precision Q68)`,
          avec((_r, t) => {
            for (const e of t) if (e.op === op) e.held = 0;
          }),
        ]),
      ];
      exige(a.surImportes.includes('erase_member'), 'erase_member-mesure-sur-des-membres-importes-selon-le-profil', `operations a mesurer sur des membres importes : ${rendu(a.surImportes)}`);
      for (const [nom, c] of essais) if (defautsMesure(c.r, c.t, a).length === 0) temoins.push(`${nom} passerait`);
      aucunDefaut(temoins, 'predicat-A1-discriminant');

      // Les candidats : instantane integre, fixtures independantes, index transparents (III.a).
      aucunDefaut(defautsFixtures(), 'fixtures-integres-et-independantes-des-paquets');
      aucunDefaut(await defautsTransparence(), 'reference-de-T75-identique-a-celle-de-T74-sur-la-trajectoire-gelee');

      // La reference : 50 000 reservations importees, chaque operation mesuree, sous son plafond, avec marge.
      fonction('platformLatency');
      const ref = await executer('platformLatency', 'reference');
      exige(ref.defaut === '', 'mesure-de-la-reference-sans-erreur', ref.defaut);
      aucunDefaut(defautsMesure(ref.resultat, ref.trafic, a), 'mesure-de-la-reference-conforme-au-protocole');
      exige(lire(ref.resultat, ['pass', 'ok', 'passed']) === true, 'reference-sous-chaque-plafond', `verdict ${rendu(lire(ref.resultat, ['pass', 'ok', 'passed']))} ; ${rapports(ref.resultat, a).filter((x) => x.rapport > 1).map((x) => `${x.op}=${x.rapport.toFixed(2)}`).join(', ')}`);
      const loin = rapports(ref.resultat, a).filter((x) => x.rapport > MARGE_REFERENCE);
      aucunDefaut(loin.map((x) => `${x.op} : p95/plafond = ${x.rapport.toFixed(3)} (> ${MARGE_REFERENCE})`), 'reference-loin-sous-les-plafonds');

      // La variante qui parcourt toutes les reservations : au-dessus, avec marge ; verdict persiste.
      const db = creerBase('a1');
      exige(db.erreur === '', 'postgresql-disponible', db.erreur);
      const lente = await executer('platformLatency', 'balayage', db.nom);
      exige(lente.defaut === '', 'mesure-de-la-variante-lente-sans-erreur', lente.defaut);
      aucunDefaut(defautsMesure(lente.resultat, lente.trafic, a), 'mesure-de-la-variante-lente-conforme-au-protocole');
      exige(lire(lente.resultat, ['pass', 'ok', 'passed']) === false, 'variante-lente-echoue', `la variante qui parcourt toutes les reservations passe : ${rapports(lente.resultat, a).map((x) => `${x.op}=${x.rapport.toFixed(2)}`).join(', ')}`);
      const pire = rapports(lente.resultat, a).reduce((m, x) => (x.rapport > m.rapport ? x : m), { op: '-', rapport: 0 });
      exige(pire.rapport >= MARGE_LENTE, 'variante-lente-loin-au-dessus', `pire rapport ${pire.op} = ${pire.rapport.toFixed(3)} (< ${MARGE_LENTE})`);
      const lu = objetsPersistes(db.nom);
      const persistes = new Set(lu.objets.map((o) => canonique([lire(o, ['op', 'operation']), lire(o, ['p95_ms', 'p95']), lire(o, ['ceiling_ms', 'ceiling'])])));
      const absentes = (mesuresDe(lente.resultat) ?? []).filter((m) => !persistes.has(canonique([m.op, m.p95, m.plafond])));
      aucunDefaut([...(lu.defaut === '' ? [] : [`PostgreSQL : ${lu.defaut}`]), ...absentes.map((m) => `${m.op} : mesure jamais persistee (p95 ${rendu(m.p95)}, plafond ${rendu(m.plafond)})`)], 'chaque-mesure-persistee');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'T75.A2 a partir de P21, sur au moins cent essais de requetes paralleles, aucun depassement de capacite ni doublon idempotent n est tolere, et un candidat de reference sans exclusion mutuelle echoue',
    async () => {
      const clauses = await source();
      const { a, defauts: dc } = attentesConcurrence(clauses);
      aucunDefaut(dc, 'parametres-de-concurrence-lus-dans-la-source-et-la-racine-concordent');

      // CONTROLES NEGATIFS (V) : le predicat refuse des essais creux.
      const temoins: string[] = [];
      const base = syntheseA2(a);
      const d0 = [...defautsEssais(base.r, base.t, a, true), ...defautsIssueReference(base.r, base.t)];
      if (d0.length !== 0) temoins.push(`des essais corrects seraient refuses : ${d0.slice(0, 3).join(' | ')}`);
      const avec = (f: (r: Json, t: Entree[]) => void): { r: Json; t: Entree[] } => {
        const c = { r: JSON.parse(JSON.stringify(base.r)) as Json, t: base.t.map((e) => ({ ...e })) };
        f(c.r, c.t);
        return c;
      };
      const trials = (r: Json): Json[] => r.trials as Json[];
      const essais: [string, { r: Json; t: Entree[] }][] = [
        [`${a.essais - 1} essais`, avec((r) => {
          r.trials = trials(r).slice(0, a.essais - 1);
        })],
        [`un scenario absent (${a.scenarios[a.scenarios.length - 1]})`, avec((r) => {
          for (const x of trials(r)) if (x.scenario === a.scenarios[a.scenarios.length - 1]) x.scenario = a.scenarios[0];
        })],
        [`un essai a ${a.clients - 1} clients`, avec((r) => {
          const x = trials(r)[0];
          x.clients = a.clients - 1;
          x.request_ids = (x.request_ids as string[]).slice(1);
        })],
        ['un essai sur une seule connexion', avec((_r, t) => {
          for (const e of t) if (e.id.startsWith('t5-')) e.conn = 1;
        })],
        ['des essais sequentiels deguises (un lot par requete)', avec((_r, t) => {
          t.forEach((e, i) => {
            e.lot = 1000 + i;
          });
        })],
        ['une violation sans kind', avec((r) => {
          r.violations = [{ trial: 0, scenario: trials(r)[0].scenario }];
          r.pass = false;
        })],
        ['un verdict constant (pass malgre une violation)', avec((r) => {
          r.violations = [{ trial: 0, scenario: trials(r)[0].scenario, kind: 'capacity' }];
        })],
      ];
      for (const [nom, c] of essais) if (defautsEssais(c.r, c.t, a, true).length === 0) temoins.push(`${nom} passerait`);
      const dp = avec((_r, t) => {
        for (const e of t) if (e.id.startsWith('t0-')) e.status = 'confirmed';
      });
      if (defautsIssueReference(dp.r, dp.t).length === 0) temoins.push('une derniere place jamais disputee (toutes confirmed) passerait pour la reference');
      aucunDefaut(temoins, 'predicat-A2-discriminant');

      // La reference : au moins cent essais paralleles, aucune violation.
      fonction('platformConcurrency');
      const ref = await executer('platformConcurrency', 'reference');
      exige(ref.defaut === '', 'essais-de-la-reference-sans-erreur', ref.defaut);
      aucunDefaut(defautsEssais(ref.resultat, ref.trafic, a, false), 'essais-de-la-reference-paralleles-et-complets');
      aucunDefaut(defautsIssueReference(ref.resultat, ref.trafic), 'issue-des-essais-de-la-reference-conforme-a-P21-R4');
      const vref = violationsUniques(ref.resultat);
      exige(vref.length === 0 && lire(ref.resultat, ['pass', 'ok', 'passed']) === true, 'reference-sans-violation', `${vref.length} violation(s) contre la reference : ${court(rendu(vref.slice(0, 5)), 600)}`);

      // La variante sans exclusion : echoue, deux fois, dans chaque essai dispute ; violations persistees.
      const db = creerBase('a2');
      exige(db.erreur === '', 'postgresql-disponible', db.erreur);
      const defauts: string[] = [];
      for (const passe of [1, 2]) {
        const x = await executer('platformConcurrency', 'sans-exclusion', passe === 2 ? db.nom : undefined);
        if (x.defaut !== '') {
          defauts.push(`passe ${passe} : ${x.defaut}`);
          continue;
        }
        defauts.push(...defautsEssais(x.resultat, x.trafic, a, true).map((d) => `passe ${passe} : ${d}`));
        const vs = violationsUniques(x.resultat);
        if (lire(x.resultat, ['pass', 'ok', 'passed']) !== false) defauts.push(`passe ${passe} : la variante sans exclusion passe (${vs.length} violation(s))`);
        (essaisDe(x.resultat) ?? []).forEach((e, i) => {
          const kinds = vs.filter((v) => lire(v, ['trial', 'essai']) === i).map(kindDe);
          if ((e.scenario === 'derniere_place' || e.scenario === 'import_et_reserve') && !kinds.some((k) => KIND_CAPACITE.includes(k))) defauts.push(`passe ${passe} essai ${i} (${e.scenario}) : aucun depassement de capacite detecte (kinds ${rendu(kinds)})`);
          if (e.scenario === 'rejeux_en_conflit' && !kinds.some((k) => KIND_IDEMPOTENCE.includes(k))) defauts.push(`passe ${passe} essai ${i} (${e.scenario}) : aucun doublon idempotent detecte (kinds ${rendu(kinds)})`);
        });
        if (passe === 2) {
          const lu = objetsPersistes(db.nom);
          if (lu.defaut !== '') defauts.push(`PostgreSQL : ${lu.defaut}`);
          const enBase = new Set(lu.objets.map((o) => canonique([lire(o, ['trial', 'essai']), lire(o, ['scenario']), kindDe(o)])));
          const absentes = vs.filter((v) => !enBase.has(canonique([lire(v, ['trial', 'essai']), lire(v, ['scenario']), kindDe(v)])));
          if (absentes.length > 0) defauts.push(`${absentes.length} violation(s) jamais persistee(s), ex. ${court(rendu(absentes[0]), 200)}`);
        }
      }
      aucunDefaut(defauts, 'variante-sans-exclusion-echoue-dans-chaque-essai-dispute-de-facon-reproductible');
    },
    CASE_TIMEOUT_MS,
  );
});
