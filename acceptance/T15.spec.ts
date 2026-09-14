/**
 * acceptance/T15.spec.ts — suite d'acceptation de la tache T15.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T15.A1 behaviour — snapshot apres operation 42 et avant 43 restaure
 *                      exactement l'etat metier apres 42
 *   T15.A2 absence   — arreter apres chaque upload ne publie aucun checkpoint
 *                      complet
 *   T15.A3 refusal   — objet manquant donne `CHECKPOINT_INCOMPLETE`
 *   T15.A4 refusal   — corruption est refusee
 *   T15.A5 behaviour — deux finalisations identiques renvoient la meme
 *                      identite
 *   T15.A6 absence   — restaurer code/base/memoire ne reduit pas les depenses
 *                      centrales
 *   T15.A7 absence   — aucune ecriture applicative n'echappe a la barriere
 *                      testee
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T15 — `packages/storage` et
 * `packages/contracts`. ADR-001 : cet aveuglement est PROCEDURAL, donc une
 * discipline auditable au diff, pas une barriere technique. Le contrat teste
 * ci-dessous n'a ete releve NI dans l'implementation, NI par `git show` ; il
 * est derive de docs/specs/T15.md, c'est-a-dire des lignes du cahier que la
 * carte de specification epingle, et des CONTRATS DEJA PUBLICS des taches
 * dont T15 depend (T12, T13 : ce sont des suites ACCEPTANCE deja figees, pas
 * de l'implementation — les lire n'est pas lire `packages/storage`) :
 *
 *   L281  titre : « Capturer et restaurer des checkpoints coherents »
 *   L283  dependances T09, T12, T13, T14 ; livrables : « barriere d'ecriture,
 *         export/import base, fichiers, files, code, memoire et publication
 *         du manifeste » — SIX noms, dont CINQ composants capturables
 *   L285  travail : « fermer les entrees d'ecriture, drainer les operations
 *         en vol, capturer les composants, verifier les artefacts, puis
 *         publier le checkpoint par transaction. Le stockage publie un
 *         pointeur ; il ne donne pas une transaction distribuee magique entre
 *         objets et PostgreSQL. »
 *   L287  les sept cas d'acceptation, mot pour mot — dont le seul litteral
 *         que le cahier fixe ici : `CHECKPOINT_INCOMPLETE`
 *   L289  fin : « restauration sur ENVIRONNEMENT VIERGE et VERIFICATION DES
 *         FAITS METIER, plutot qu'egalite binaire de deux exports PostgreSQL
 *         recrees » — c'est ce qui interdit de comparer deux `pg_dump`
 *         octet a octet et impose de relire des FAITS
 *   L66   invariant D.4 : « Un rollback de l'application ne restaure jamais
 *         le registre central des couts » — le sens exact de A6
 *   L28   « un defaut de prerequis produit BLOCKED, jamais PASS »
 *   L34   « les interfaces sont implementees par adaptateurs » — d'ou le
 *         choix, laisse a l'implementation, de l'adaptateur ArtifactStore
 *         sous-jacent (T13 local ou T14 S3) : cette suite n'en impose aucun
 *   L80   JSON de domaine stricts (proprietes inconnues rejetees), montants en
 *         entiers de micro-USD
 *   L82   « les empreintes utilisent SHA-256 sur des octets canoniques
 *         documentes » — c'est ce qui rend une identite de checkpoint
 *         DETERMINISTE plutot qu'un numero de serie arbitraire (A5)
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes »
 *   L141  « les tests d'ordonnancement emploient horloges controlees,
 *         BARRIERES et POINTS D'INJECTION NOMMES [...] les checks
 *         d'integration utilisent REELLEMENT PostgreSQL »
 *   L559  chaque suite d'integration recoit un `test_run_id` technique unique,
 *         ses bases et ses prefixes d'artefacts
 *   L269  les codes `ARTIFACT_MISSING`/`ARTIFACT_CORRUPT` du contrat
 *         ArtifactStore (T13) — le mecanisme dont A3/A4 heritent, cf. II
 *   L631  « les listes de cas definissent un minimum »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Aucune fixture de §F ne porte sur T15 : la racine gelee
 * `acceptance/reference/**` ne contient que les dix fixtures arithmetiques
 * F-BOOTSTRAP … F-RESERVATION, dont aucune ne decrit un checkpoint. Tout
 * litteral COMPARE dans une assertion porte donc un commentaire
 * `// cahier:L<n>` resoluble par `sed -n '<n>p' docs/cahier.md`, et il n'y en
 * a que huit :
 *
 *   `CHECKPOINT_INCOMPLETE` — L287, le nom du refus pour objet manquant
 *   `sha256`                — L82, l'algorithme des empreintes
 *   42 / 43                 — L287, « apres operation 42 et avant 43 »
 *   1 (octet)                — invariant general d'empreinte (L82) : la suite
 *                              reprend ici la convention deja etablie par T13
 *                              (« un octet change ») pour rendre une
 *                              corruption reproductible
 *   1 000 000 / 500 000     — L80, entiers de micro-USD ; valeurs FABRIQUEES
 *                              par la suite pour peupler un registre central
 *                              qu'elle possede elle-meme, jamais une regle de
 *                              calcul empruntee a T16/T17
 *   0                        — L287 (« aucun checkpoint complet »), L66
 *                              (« ne reduit pas » = ecart nul), L287 A7
 *                              (« aucune ecriture » = zero occurrence)
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les operations metier, les cles de
 * marqueur, les noms de base et les composants opaques (code/fichiers/
 * files/memoire) sont des ENTREES que la suite FABRIQUE elle-meme ; l'identite
 * de checkpoint n'est JAMAIS codee en dur — le cahier n'en fixe pas le format
 * (A5 n'observe qu'une PROPRIETE : stable pour un contenu identique,
 * differente pour un contenu different).
 *
 * LE CODE `CHECKPOINT_INCOMPLETE` REUTILISE LE MECANISME DE T13, IL NE LE
 * REMPLACE PAS. L269 nomme deja `ARTIFACT_MISSING` et `ARTIFACT_CORRUPT` pour
 * le port ArtifactStore dont T15 depend (T13/T14). Restaurer un checkpoint
 * relit forcement, a un moment ou un autre, les artefacts qu'il reference : un
 * objet manquant y produit tres normalement `ARTIFACT_MISSING`. L287 exige que
 * CE refus, remonte au niveau du CHECKPOINT, porte le nom `CHECKPOINT_INCOMPLETE`
 * — la suite l'exige donc explicitement a la frontiere de `restoreCheckpoint`,
 * sans jamais interdire qu'`ARTIFACT_MISSING` apparaisse plus bas dans la
 * cause. Pour la corruption (A4), le cahier ne fixe AUCUN nom : la suite
 * accepte alors soit `CHECKPOINT_INCOMPLETE` soit un code nommant la
 * corruption (cf. MOTIF_CORRUPTION_CHECKPOINT), jamais un plantage muet.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * LES TEMOINS INDEPENDANTS : `psql`, hors du processus de la suite, ET
 * L'ARBRE DE FICHIERS DU MAGASIN LOCAL, HORS DE L'API DU CHECKPOINT.
 *
 * Comme T12 pour la persistance et T13 pour le stockage, cette suite ne fait
 * jamais confiance a une valeur rendue par le role qu'elle teste pour juger CE
 * role : chaque fait affirme par le coordinateur de checkpoint est recoupe par
 * une lecture hors de son API.
 *
 *   psql(db, sql)            — une session `psql` lancee dans un AUTRE
 *                              processus (L141 : « les checks d'integration
 *                              utilisent reellement PostgreSQL »)
 *   profilDeMarqueur(db, m)  — le nombre de lignes, TOUTES TABLES DE BASE
 *                              CONFONDUES, dont la representation textuelle
 *                              contient le marqueur `m`. Agnostique au schema
 *                              exact que l'implementation choisit pour
 *                              `applyOperation` : la suite n'impose AUCUN nom
 *                              de table ni de colonne.
 *   arbre(racine) / ajoutes  — repris de T13 : l'etat du magasin ArtifactStore
 *                              local, lu directement sur disque, sans passer
 *                              par un seul export de l'implementation.
 *
 * C'est ce recoupement qui interdit un coordinateur qui MENTIRAIT sur ce qu'il
 * a effectivement ecrit ou restaure — exactement le defaut que L289 vise en
 * exigeant une « verification des faits metier » plutot qu'une confiance
 * aveugle dans le rapport de la fonction testee.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CONTRAT — CE QUE T15 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Les paquets interroges sont ceux que le registre declare : `packages/storage`
 * et `packages/contracts`. Chacun est charge par le nom de son manifeste,
 * sinon par `src/index.ts`. Le chargement ne LEVE jamais : un import casse
 * produirait « Test suite failed to run », que verification/runner/red.mjs
 * classe SUITE_FAILED_TO_RUN et refuse comme preuve. Chaque cas asserte donc
 * lui-meme le chargement.
 *
 * SIX ROLES NOUVEAUX, nommes par leur FONCTION et resolus par une courte liste
 * d'alias. Les alias sont une tolerance de NOMMAGE, jamais de COMPORTEMENT.
 * Aucun alias generique deja employe par T12 (`openStore`, `publishPeriodResult`,
 * `readPeriodResult`…) n'est repris : les quatre taches partagent le paquet
 * `packages/storage`, et un role de CHECKPOINT ne doit pas se resoudre sur un
 * export de PERSISTANCE PostgreSQL de bas niveau. La suite reutilise en
 * revanche EXPLICITEMENT les roles ArtifactStore de T13 (`openArtifactStore`),
 * puisque L283 fait du « stockage » qui « publie un pointeur » un consommateur
 * declare du port de T13.
 *
 *   openCheckpointCoordinator({ admin_dsn, app_database, artifact_store })
 *       -> ouvre un coordinateur de checkpoint sur UNE base applicative et UN
 *          magasin d'artefacts deja ouvert                             (L283)
 *   applyOperation(h, { operation_sequence, fact })
 *       -> ecrit un fait metier, gate par la barriere                  (L285)
 *   beginCheckpoint(h, { after_operation })
 *       -> ferme la barriere d'ecriture, draine, rend un jeton         (L285)
 *   finishCheckpoint(h, token, { components, fault? })
 *       -> capture, verifie, publie par transaction, ROUVRE la barriere,
 *          rend `{ checkpoint_id }`                                    (L285)
 *   listCheckpoints(h)
 *       -> les checkpoints COMPLETS et publies, et eux seuls            (A2)
 *   restoreCheckpoint(h2, { checkpoint_id })
 *       -> restaure code/base/fichiers/files/memoire sur un coordinateur
 *          FRAIS, rend `{ facts, components }`                          (A1)
 *
 * ArtifactStore (T13, reutilise tel quel) :
 *   openArtifactStore({ root }) -> ouvre l'adaptateur local
 *
 * DIX CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC FIXEES
 * ICI (elles sont reprises telles quelles dans verification/mutants/T15.json) :
 *
 *   1. OUVERTURE. `openCheckpointCoordinator` recoit un objet PLAT et STRICT
 *      (L80) : `{ admin_dsn, app_database, artifact_store }`. `admin_dsn` est
 *      un DSN PostgreSQL connecte a une base de MAINTENANCE (celle depuis
 *      laquelle on peut CREATE/DROP toute base du meme cluster) ; `app_database`
 *      est le nom de LA SEULE base que ce coordinateur a le droit de capturer
 *      ou de restaurer ; `artifact_store` est un handle DEJA OUVERT via T13.
 *      Choisir un adaptateur ArtifactStore particulier est un detail
 *      d'implementation (L34) : cette suite se sert de l'adaptateur LOCAL,
 *      elle n'exige pas S3.
 *
 *   2. OPERATION METIER. `applyOperation(h, { operation_sequence, fact })`
 *      ecrit `fact` (JSON arbitraire fourni par la suite) sous une identite
 *      croissante `operation_sequence` (L78 : une operation porte une
 *      `operation_sequence`). Une operation ACCEPTEE rend une valeur qui n'est
 *      PAS un refus (au sens de `qualifier`, cf. code). Une operation REFUSEE
 *      pendant que la barriere est FERMEE (entre `beginCheckpoint` et
 *      `finishCheckpoint`) porte un code nommant la cause (barriere/gate/
 *      checkpoint en cours) — cf. MOTIF_BARRIERE.
 *
 *   3. BARRIERE EN DEUX TEMPS, POINTS D'INJECTION NOMMES (L141). `beginCheckpoint`
 *      FERME la barriere et rend un jeton opaque ; `finishCheckpoint` capture,
 *      verifie, publie, puis ROUVRE la barriere. C'est la forme la plus
 *      directe de « fermer les entrees d'ecriture [...] puis publier » (L285)
 *      qui rend la fenetre FERMEE observable de l'exterieur (A7), sans quoi
 *      « aucune ecriture n'echappe a la barriere » ne serait pas
 *      reproductible — exactement ce que L141 exige des tests
 *      d'ordonnancement. `fault` est un objet plat optionnel du DEUXIEME
 *      argument de `finishCheckpoint`, prenant exactement UNE valeur :
 *        'STOP_AFTER_EACH_UPLOAD'  la capture s'arrete juste apres avoir
 *                                  televerse chaque composant, AVANT la
 *                                  publication transactionnelle du manifeste
 *                                                                      (A2)
 *      Un point d'injection est un LIVRABLE, pas une commodite de test.
 *      L'appel sous fault peut LEVER ou RENDRE un refus : la suite tolere les
 *      deux, elle n'exige que l'ABSENCE d'un checkpoint complet ensuite.
 *
 *   4. COMPOSANTS. `components` (troisieme argument, cle `components` de
 *      `finishCheckpoint`) est un objet PLAT portant EXACTEMENT les quatre
 *      cles que L283 nomme en plus de la base : `code`, `fichiers`, `files`,
 *      `memoire` — chacune des octets BRUTS (`Buffer`/`Uint8Array`) que la
 *      suite fournit elle-meme. Le cinquieme composant, `base` (« export/
 *      import base », L283), n'est PAS fourni par l'appelant : il est derive
 *      par le coordinateur de `app_database` lui-meme, c'est la seule maniere
 *      dont « verification des faits metier » (L289) a un sens.
 *
 *   5. IDENTITE DE CHECKPOINT. `finishCheckpoint` accepte rend un objet
 *      portant au moins `checkpoint_id`, une chaine non vide. Deux appels
 *      capturant un contenu IDENTIQUE (memes `components`, meme etat de
 *      `app_database`) rendent la MEME identite (A5, L82) ; un contenu
 *      different rend une identite differente. La suite n'impose AUCUN
 *      format.
 *
 *   6. LISTAGE. `listCheckpoints(h)` rend un tableau ; chaque element porte au
 *      moins `checkpoint_id`. Seuls les checkpoints dont la publication
 *      transactionnelle a REELLEMENT abouti y figurent (A2).
 *
 *   7. RESTAURATION SUR ENVIRONNEMENT VIERGE (L289). `restoreCheckpoint`
 *      s'appelle sur un coordinateur DISTINCT de celui qui a capture, ouvert
 *      sur un `app_database` NEUF (cree vide par la suite avant l'appel) et
 *      le MEME `artifact_store`. Il rend `{ facts, components }` :
 *        `facts`      — les faits metier restaures ; la suite ne prescrit
 *                       aucune forme au-dela d'un tableau ou d'une valeur
 *                       relisible via le temoin `psql` independant (III)
 *        `components` — les quatre composants opaques restaures, octets EXACTS
 *      ou REFUSE, portant un code qui NOMME sa cause :
 *        `CHECKPOINT_INCOMPLETE`  objet reference absent               (A3)
 *        (code nommant la corruption, cf. II)                          (A4)
 *      Un `TypeError`, un « is not a function » ou un `ENOENT` brut n'est PAS
 *      un refus : c'est un plantage, et la suite le distingue explicitement —
 *      c'est le defaut decisif du mode de preuve `refusal`.
 *
 *   8. PERIMETRE DE RESTAURATION (L66, A6). Restaurer `app_database` ne
 *      touche JAMAIS une autre base du meme cluster PostgreSQL, meme si
 *      `admin_dsn` y a acces. La suite fabrique elle-meme une base centrale
 *      SEPAREE, portant un registre de depenses, pour verifier que ce
 *      perimetre est respecte — sans jamais passer cette base au
 *      coordinateur.
 *
 *   9. MARQUEURS DE FAITS. Chaque `fact` que la suite ecrit porte un champ
 *      `marker`, une chaine UNIQUE par operation et par cas, choisie par la
 *      suite. « L'etat metier apres 42 » (A1) se lit par PRESENCE/ABSENCE de
 *      ces marqueurs, jamais par un schema de colonnes impose.
 *
 *  10. NAMESPACE (L559). Toutes les bases, prefixes et jetons de cette
 *      execution derivent d'un `test_run_id` technique unique. Il n'entre
 *      dans AUCUNE assertion.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle ne prouve pas le contrat ArtifactStore lui-meme (memes octets ->
 *    meme reference, corruption -> ARTIFACT_CORRUPT…) : c'est T13 (L269) et
 *    T14 (L277). Elle en depend et le reutilise sans le rejouer.
 *  • Elle ne prouve pas les invariants comptables de T16/T17 : les valeurs de
 *    registre central qu'elle fabrique pour A6 sont des ENTIERS arbitraires
 *    (L80), jamais une regle tarifaire.
 *  • Elle ne prouve pas l'isolation sandbox d'un candidat (T19/T20) : les
 *    composants « code » et « memoire » sont des octets opaques que la suite
 *    fournit elle-meme, pas un instantane reel d'un conteneur en cours
 *    d'execution.
 *  • Elle n'impose AUCUN nom de table, de colonne ni de schema de fichier sur
 *    le disque du magasin d'artefacts : L283 nomme des composants et un
 *    pointeur, rien d'autre. Toute autre affirmation de schema serait une
 *    exigence inventee.
 *  • Elle ne prouve pas l'orchestration Temporal d'une periode complete
 *    (T23/T24) : la barriere qu'elle exerce est celle de T15 seule.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 300_000;

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

/** Les `source_paths` que verification/tasks.json declare pour T15. */
const PACKAGES = ['storage', 'contracts'] as const;

/** SHA-256 hexadecimal — L82. C'est la suite qui CALCULE, jamais l'implementation. */
function sha256(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex'); // cahier:L82
}

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 12) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (ArrayBuffer.isView(v)) {
    const b = Buffer.from(
      (v as Uint8Array).buffer,
      (v as Uint8Array).byteOffset,
      (v as Uint8Array).byteLength,
    );
    return `<${String(b.length)} octets sha256=${sha256(b).slice(0, 16)}>`;
  }
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

const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/* ═══════════════ les litteraux du cahier, et rien d'autre ══════════════ */

/** L287 : « objet manquant donne `CHECKPOINT_INCOMPLETE` ». */
const CODE_INCOMPLET = 'CHECKPOINT_INCOMPLETE'; // cahier:L287
const MOTIF_INCOMPLET = /CHECKPOINT_INCOMPLETE/i;

/**
 * L287 ne nomme pas le code de refus d'une CORRUPTION. La suite exige un refus
 * qui nomme sa cause parmi celles que L287 (le nom du checkpoint incomplet) et
 * le contrat ArtifactStore de L269 (ARTIFACT_CORRUPT) rendent plausibles.
 */
const MOTIF_CORRUPTION_CHECKPOINT =
  /CHECKPOINT_INCOMPLETE|ARTIFACT_CORRUPT|CORRUPT|CORROMPU|INTEGRITY|INTEGRITE|CHECKSUM|DIGEST_MISMATCH|HASH_MISMATCH/i;

/** Un refus de barriere fermee, nomme. L285/L287 n'en fixent pas le code. */
const MOTIF_BARRIERE =
  /BARRIER|BARRIERE|GATE|PORTE|CHECKPOINT_IN_PROGRESS|CAPTURE_IN_PROGRESS|CLOSED|FERMEE|FERME|WRITE_CLOSED|BLOCKED_BY_CHECKPOINT|CHECKPOINTING/i;

/** Ce qui n'est PAS un refus : un plantage. La distinction est decisive. */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not iterable|Cannot read (?:propert|of)|of undefined|of null|ENOENT|EACCES|ECONNREFUSED|undefined is not/;

/** L287 : « apres operation 42 et avant 43 ». */
const OPERATION_SNAPSHOT = 42; // cahier:L287
const OPERATION_SUIVANTE = 43; // cahier:L287

/** L66 (D.4) / L287 A6 : « ne reduit pas » = un ecart nul. */
const AUCUNE_REDUCTION = 0; // cahier:L66

/** L287 A2 : « aucun checkpoint complet ». */
const AUCUN_CHECKPOINT_COMPLET = 0; // cahier:L287

/** L287 A7 : « aucune ecriture applicative n'echappe » = zero occurrence. */
const AUCUNE_ECRITURE_ECHAPPEE = 0; // cahier:L287

/** Convention de corruption reprise de T13 : « un octet change ». */
const UN_OCTET = 1;

/** L80 : montants en entiers de micro-USD, valeurs FABRIQUEES par la suite. */
const LEDGER_INITIAL_MICRO_USD = 1_000_000; // cahier:L80
const LEDGER_SPEND_MICRO_USD = 500_000; // cahier:L80

/* ══════════════════════════ namespace d'execution (L559) ═══════════════ */

const RUN = `t15_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SABLE = fs.mkdtempSync(path.join(os.tmpdir(), 't15-'));

function dossierMagasin(...parts: string[]): string {
  const p = path.join(SABLE, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

afterAll(() => {
  try {
    fs.rmSync(SABLE, { recursive: true, force: true });
  } catch {
    /* un bac a sable non supprime ne change aucun verdict */
  }
});

/* ═══════════════════════════ PostgreSQL reel (L141) ═════════════════════ */

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

function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}

function psql(db: string, sql: string): Psql {
  try {
    const out = execFileSync(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql],
      { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}

/** Base de maintenance : celle qui existe forcement, pour CREATE/DROP DATABASE. */
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();

const ADMIN_DSN = dsnFor(ADMIN_DB);

const BASES_CREEES: string[] = [];

/** Cree une base VIDE, jetable, nommee d'apres le namespace de L559. */
function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(
    r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`,
  ).toBe('base-creee'); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});

/** Un litteral SQL pour une valeur que la suite a elle-meme fabriquee. */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

interface Table {
  schema: string;
  nom: string;
}

/** Les tables de base d'une base, hors catalogues systeme. Agnostique au schema. */
function tablesDeBase(db: string): Table[] {
  const r = psql(
    db,
    `SELECT table_schema || '|' || table_name FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  if (!r.ok || r.out.length === 0) return [];
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [schema, nom] = l.split('|');
      return { schema: schema as string, nom: nom as string };
    });
}

/**
 * PROFIL D'UN MARQUEUR : le nombre TOTAL de lignes, toutes tables de base
 * confondues, dont la representation textuelle contient le marqueur `m`.
 * Agnostique aux colonnes, agnostique a la table porteuse — donc n'impose
 * AUCUN schema au-dela de ce que L285 nomme (« base »). Un marqueur present
 * une fois dit « le fait est ecrit » ; absent dit « il ne l'est pas », que
 * l'implementation choisisse une table `operations`, `facts` ou autre chose.
 */
function profilDeMarqueur(db: string, marqueur: string): number {
  const tables = tablesDeBase(db);
  if (tables.length === 0) return 0;
  const parts = tables.map(
    (t) =>
      `SELECT COUNT(*) AS n FROM ${JSON.stringify(t.schema).replace(/"/g, '"')}.${JSON.stringify(t.nom).replace(/"/g, '"')} WHERE CAST(${`"${t.nom}"`} AS text) ILIKE ${lit(`%${marqueur}%`)}`,
  );
  // La forme `CAST(table AS text)` degrade en JSON-like text pour une ligne
  // entiere sous PostgreSQL lorsque la table est reference dans la clause FROM
  // sous son propre nom — on utilise donc plus surement `t.*::text` via un
  // alias explicite.
  const parts2 = tables.map(
    (t) =>
      `SELECT COUNT(*) AS n FROM "${t.schema}"."${t.nom}" x WHERE CAST(x.* AS text) ILIKE ${lit(`%${marqueur}%`)}`,
  );
  void parts;
  const r = psql(db, `SELECT COALESCE(SUM(n), 0) FROM (${parts2.join(' UNION ALL ')}) s`);
  if (!r.ok) return -1;
  const n = Number(r.out);
  return Number.isFinite(n) ? n : -1;
}

/* ═══════════════════ arbre de fichiers du magasin (repris de T13) ══════ */

function arbre(racine: string): Map<string, string> {
  const out = new Map<string, string>();
  const pile: string[] = [''];
  while (pile.length > 0) {
    const rel = pile.pop() as string;
    const abs = rel === '' ? racine : path.join(racine, rel);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      out.set(rel, 'lien');
      continue;
    }
    if (st.isDirectory()) {
      if (rel !== '') out.set(rel, 'dossier');
      let noms: string[] = [];
      try {
        noms = fs.readdirSync(abs);
      } catch {
        noms = [];
      }
      for (const n of noms.sort()) pile.push(rel === '' ? n : path.join(rel, n));
      continue;
    }
    if (st.isFile()) {
      out.set(rel, `fichier ${String(st.size)}`);
      continue;
    }
    out.set(rel, 'autre');
  }
  return out;
}

/** Les chemins de FICHIER qu'une operation a CREES, tries du plus gros au plus petit. */
function fichiersAjoutesParTaille(
  racine: string,
  avant: Map<string, string>,
  apres: Map<string, string>,
): string[] {
  const ajoutes = [...apres.keys()].filter((k) => !avant.has(k) && (apres.get(k) ?? '').startsWith('fichier '));
  return ajoutes
    .map((rel) => ({ rel, abs: path.join(racine, rel) }))
    .map(({ rel, abs }) => ({ rel, taille: (() => {
      try {
        return fs.statSync(abs).size;
      } catch {
        return -1;
      }
    })() }))
    .sort((a, b) => b.taille - a.taille)
    .map((x) => x.rel);
}

/* ═══════════════════════ chargement des paquets ═════════════════════════ */

interface Loaded {
  ok: boolean;
  via: string[];
  exportCount: number;
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
  for (const [k, v] of Object.entries(ns)) {
    if (k === '__esModule') continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Ns)) {
        put(`${k}.${k2}`, v2);
        put(k2, v2);
      }
    }
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
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  for (const pkg of PACKAGES) {
    let charge = false;
    for (const s of specifiersFor(pkg)) {
      if (charge) break;
      try {
        const mod = (await import(s)) as Ns;
        flatten(mod, flat);
        exportCount += Object.keys(mod).filter((k) => k !== '__esModule').length;
        via.push(s.replace(pathToFileURL(REPO).href, '<repo>'));
        charge = true;
      } catch (e) {
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet packages/${pkg} : aucun specificateur n'a repondu`);
  }
  return { ok: via.length > 0, via, exportCount, flat, attempts };
}

let LOADED: Loaded = {
  ok: false,
  via: [],
  exportCount: 0,
  flat: new Map(),
  attempts: ['beforeAll non execute'],
};

beforeAll(async () => {
  // Le chargement ne LEVE pas : un import casse produirait « Test suite failed
  // to run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement.
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `PAQUET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe(
    'charge',
  );
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ─────────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  openArtifactStore: [
    'openArtifactStore',
    'createArtifactStore',
    'openLocalArtifactStore',
    'createLocalArtifactStore',
    'localArtifactStore',
    'makeArtifactStore',
    'artifactStore',
  ],
  openCheckpointCoordinator: [
    'openCheckpointCoordinator',
    'createCheckpointCoordinator',
    'openCheckpointBarrier',
    'createCheckpointBarrier',
    'openCheckpointService',
    'createCheckpointService',
    'openCheckpointManager',
    'createCheckpointManager',
    'openCheckpointer',
    'createCheckpointer',
  ],
  applyOperation: [
    'applyOperation',
    'recordOperation',
    'submitOperation',
    'applyBusinessOperation',
    'writeOperation',
    'applyWrite',
    'performOperation',
    'applyFact',
  ],
  beginCheckpoint: [
    'beginCheckpoint',
    'startCheckpoint',
    'openCheckpointWindow',
    'beginCheckpointCapture',
    'closeWriteGate',
    'beginCapture',
    'beginCheckpointCapture',
  ],
  finishCheckpoint: [
    'finishCheckpoint',
    'completeCheckpoint',
    'finalizeCheckpoint',
    'publishCheckpoint',
    'commitCheckpoint',
    'endCheckpoint',
    'finishCapture',
  ],
  listCheckpoints: [
    'listCheckpoints',
    'listCheckpointManifests',
    'listPublishedCheckpoints',
    'checkpointList',
    'listCompletedCheckpoints',
  ],
  restoreCheckpoint: [
    'restoreCheckpoint',
    'restoreFromCheckpoint',
    'importCheckpoint',
    'loadCheckpoint',
    'applyCheckpointRestore',
    'restoreFromManifest',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role] ?? [];
  for (const c of candidats) {
    const v = LOADED.flat.get(c);
    if (typeof v === 'function') {
      RESOLVED.set(role, v as Fonction);
      return v as Fonction;
    }
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of LOADED.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  for (const c of candidats) {
    const v = lower.get(c.toLowerCase());
    if (typeof v === 'function') {
      RESOLVED.set(role, v as Fonction);
      return v as Fonction;
    }
  }
  RESOLVED.set(role, null);
  return null;
}

function assertContrat(...roles: string[]): void {
  const manquants = roles.filter((r) => resolveOpt(r) === null);
  expect(
    manquants.length === 0
      ? 'contrat-resolu'
      : `CONTRAT-NON-SATISFAIT roles=[${manquants.join(', ')}] : aucun export parmi ` +
          manquants.map((r) => `${r}:[${(ROLES[r] ?? []).join('|')}]`).join(' ; ') +
          ` (${String(LOADED.exportCount)} exports de premier niveau observes dans ` +
          `${LOADED.via.join(', ') || 'aucun paquet'})`,
  ).toBe('contrat-resolu');
}

/* ───────────────────────── appel d'un role, refus compris */

interface Issue {
  refuse: boolean;
  via: string;
  texte: string;
  code: string | null;
  valeur: unknown;
  leve: boolean;
}

const CHAMPS_CODE =
  /^(code|error_code|errorcode|reason|motif|refusal|refus|rejection|rejet|error|erreur|status|statut|outcome|verdict|name|message)$/i;

function chaineDeCode(v: unknown, profondeur = 0): string | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || profondeur > 2) return null;
  if (ArrayBuffer.isView(v)) return null;
  const o = v as Json;
  for (const [k, x] of Object.entries(o)) {
    if (CHAMPS_CODE.test(k) && typeof x === 'string' && x.length > 0) return `${k}=${x}`;
  }
  for (const x of Object.values(o)) {
    const sous = chaineDeCode(x, profondeur + 1);
    if (sous !== null) return sous;
  }
  return null;
}

function qualifier(brut: unknown, leve: boolean): Issue {
  const texte = rendu(brut);
  if (leve) {
    const e = brut as Json;
    const morceaux = [
      typeof e?.code === 'string' ? `code=${String(e.code)}` : null,
      brut instanceof Error ? `name=${brut.name}` : null,
      brut instanceof Error ? `message=${brut.message}` : null,
      chaineDeCode(brut),
    ].filter((x): x is string => x !== null);
    return {
      refuse: true,
      via: 'exception',
      texte: `LEVE ${texte}`,
      code: morceaux.join(' ') || texte,
      valeur: brut,
      leve: true,
    };
  }
  if (brut !== null && typeof brut === 'object' && !Array.isArray(brut) && !ArrayBuffer.isView(brut)) {
    const o = brut as Json;
    for (const drapeau of ['ok', 'valid', 'valide', 'success', 'accepted', 'published', 'written', 'complete', 'complet']) {
      if (o[drapeau] === false) {
        return {
          refuse: true,
          via: `${drapeau}=false`,
          texte,
          code: chaineDeCode(brut) ?? `${drapeau}=false`,
          valeur: brut,
          leve: false,
        };
      }
    }
    for (const cle of ['errors', 'issues', 'problems', 'erreurs', 'violations', 'refusals']) {
      const v = o[cle];
      if (Array.isArray(v) && v.length > 0) {
        return {
          refuse: true,
          via: `${cle}[${String(v.length)}]`,
          texte,
          code: rendu(v[0]),
          valeur: brut,
          leve: false,
        };
      }
    }
  }
  return { refuse: false, via: 'valeur', texte, code: null, valeur: brut, leve: false };
}

async function appeler(role: string, args: unknown[]): Promise<Issue> {
  const f = resolveOpt(role);
  if (f === null) {
    return {
      refuse: true,
      via: 'contrat',
      texte: `ROLE-NON-RESOLU ${role}`,
      code: 'ROLE_NON_RESOLU',
      valeur: undefined,
      leve: false,
    };
  }
  try {
    return qualifier(await Promise.resolve(f(...args)), false);
  } catch (e) {
    return qualifier(e, true);
  }
}

function exigerAccepte(issue: Issue, quoi: string): unknown {
  expect(
    issue.refuse ? `REFUS-INATTENDU ${quoi} [${issue.via}] : ${court(issue.texte)}` : 'accepte',
  ).toBe('accepte');
  return issue.valeur;
}

/**
 * Un refus NOMME. La distinction avec un plantage est decisive : un stub qui
 * leve `TypeError` satisferait « ca a echoue » sans rien prouver, et c'est
 * exactement le faux PASS contre lequel le mode de preuve `refusal` met en
 * garde (verification/cases.lock.json).
 */
function exigerRefusNomme(issue: Issue, motif: RegExp, canonique: string, quoi: string): void {
  expect(issue.refuse ? 'refuse' : `ACCEPTE-A-TORT ${quoi} : ${court(issue.texte)}`).toBe('refuse');
  expect(
    MARQUEURS_DE_PLANTAGE.test(issue.texte)
      ? `PLANTAGE-AU-LIEU-D-UN-REFUS-NOMME ${quoi} : ${court(issue.texte)}`
      : 'refus-et-non-plantage',
  ).toBe('refus-et-non-plantage');
  const code = issue.code ?? '';
  expect(
    motif.test(code) || motif.test(issue.texte)
      ? 'refus-nomme'
      : `REFUS-SANS-CAUSE-NOMMEE ${quoi} : attendu un code decrivant ${String(motif)} ` +
          `(canonique : ${canonique}), observe ${court(issue.code ?? issue.texte, 400)}`,
  ).toBe('refus-nomme');
}

/** Lecture tolerante d'un champ, au sommet ou sous un enveloppement usuel. */
function champ(v: unknown, noms: readonly string[]): unknown {
  if (v === null || typeof v !== 'object') return undefined;
  const o = v as Json;
  for (const n of noms) if (o[n] !== undefined) return o[n];
  for (const conteneur of ['manifest', 'manifeste', 'result', 'checkpoint', 'value', 'data']) {
    const sous = o[conteneur];
    if (sous !== null && typeof sous === 'object' && !Array.isArray(sous)) {
      const s = sous as Json;
      for (const n of noms) if (s[n] !== undefined) return s[n];
    }
  }
  return undefined;
}

function checkpointIdDe(v: unknown): string | null {
  const id = champ(v, ['checkpoint_id', 'checkpointId', 'id', 'ref']);
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function octetsDe(v: unknown): Buffer | null {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return null;
}

/* ══════════════════ ouverture d'un magasin ArtifactStore local ═════════ */

async function ouvrirMagasin(root: string): Promise<unknown> {
  fs.mkdirSync(root, { recursive: true });
  return exigerAccepte(
    await appeler('openArtifactStore', [{ root }]),
    `ouverture du magasin d'artefacts local sur ${root}`,
  );
}

/* ══════════════════════ composants opaques (L283) ═══════════════════════ */

function composant(nom: string, run: string): Buffer {
  return Buffer.from(
    `T15 composant=${nom} run=${run} sel=${randomBytes(8).toString('hex')}\n${`${nom}-`.repeat(600)}`,
    'utf8',
  );
}

function composants(run: string): { code: Buffer; fichiers: Buffer; files: Buffer; memoire: Buffer } {
  return {
    code: composant('code', run),
    fichiers: composant('fichiers', run),
    files: composant('files', run),
    memoire: composant('memoire', run),
  };
}

/* ══════════════════════════════ LES SEPT CAS ════════════════════════════ */

describe('T15 — capture et restauration de checkpoints coherents', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T15.A1 snapshot apres operation 42 et avant 43 restaure exactement l etat metier apres 42',
    async () => {
      assertLoaded();
      assertContrat(
        'openArtifactStore',
        'openCheckpointCoordinator',
        'applyOperation',
        'beginCheckpoint',
        'finishCheckpoint',
        'restoreCheckpoint',
      );

      const store = await ouvrirMagasin(dossierMagasin('a1', 'artifacts'));
      const appDb = creerBase('a1_app');
      const h = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDb, artifact_store: store },
        ]),
        'ouverture du coordinateur (base source)',
      );

      // (1) OPERATION_SNAPSHOT operations metier, chacune marquee de facon UNIQUE.
      for (let seq = 1; seq <= OPERATION_SNAPSHOT; seq += 1) {
        const marker = `A1_OP_${String(seq)}_${RUN}`;
        exigerAccepte(
          await appeler('applyOperation', [h, { operation_sequence: seq, fact: { marker } }]),
          `applyOperation(${String(seq)})`,
        );
      }

      // (2) SNAPSHOT apres 42, avant 43.
      const token = exigerAccepte(
        await appeler('beginCheckpoint', [h, { after_operation: OPERATION_SNAPSHOT }]),
        'beginCheckpoint(after_operation=42)',
      );
      const comps = composants(`${RUN}_a1`);
      const finApres42 = exigerAccepte(
        await appeler('finishCheckpoint', [h, token, { components: comps }]),
        'finishCheckpoint(after_operation=42)',
      );
      const checkpointId = checkpointIdDe(finApres42);
      expect(
        checkpointId !== null
          ? 'checkpoint-id-present'
          : `CHECKPOINT-SANS-IDENTITE ${court(rendu(finApres42), 300)}`,
      ).toBe('checkpoint-id-present'); // cahier:L287

      // (3) OPERATION 43, APRES le snapshot : la barriere est rouverte.
      const marker43 = `A1_OP_${String(OPERATION_SUIVANTE)}_${RUN}`;
      exigerAccepte(
        await appeler('applyOperation', [h, { operation_sequence: OPERATION_SUIVANTE, fact: { marker: marker43 } }]),
        'applyOperation(43) apres finishCheckpoint',
      );

      // TEMOIN INDEPENDANT (avant restauration) : 43 est bien present dans la
      // base SOURCE, 42 aussi — ce n'est PAS ce que la restauration doit voir.
      expect(profilDeMarqueur(appDb, marker43)).toBeGreaterThan(0);

      // (4) RESTAURATION SUR ENVIRONNEMENT VIERGE (L289) : coordinateur DISTINCT,
      // base FRAICHE, MEME magasin d'artefacts.
      const appDbRestore = creerBase('a1_restore');
      const h2 = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDbRestore, artifact_store: store },
        ]),
        'ouverture du coordinateur (base fraiche)',
      );
      const restaure = exigerAccepte(
        await appeler('restoreCheckpoint', [h2, { checkpoint_id: checkpointId }]),
        'restoreCheckpoint(checkpoint apres 42)',
      );

      // TEMOIN INDEPENDANT (`psql`, hors du coordinateur) : les 42 marqueurs
      // sont PRESENTS dans la base restauree, le marqueur 43 en est ABSENT.
      for (let seq = 1; seq <= OPERATION_SNAPSHOT; seq += 1) {
        const marker = `A1_OP_${String(seq)}_${RUN}`;
        const n = profilDeMarqueur(appDbRestore, marker);
        expect(
          n > 0
            ? 'marqueur-restaure'
            : `MARQUEUR-ABSENT-APRES-RESTAURATION seq=${String(seq)} marker=${marker} n=${String(n)}`,
        ).toBe('marqueur-restaure'); // cahier:L287
      }
      const n43 = profilDeMarqueur(appDbRestore, marker43);
      expect(
        n43 === 0
          ? 'operation-43-absente'
          : `OPERATION-43-VISIBLE-APRES-RESTAURATION-DE-42 n=${String(n43)} — L287 exige exactement ` +
              `l'etat metier APRES 42, pas apres 43`,
      ).toBe('operation-43-absente'); // cahier:L287

      // Le champ `facts` rendu par le role lui-meme doit etre COHERENT avec le
      // temoin independant, pas seulement plausible.
      const factsBruts = champ(restaure, ['facts']);
      const facts = Array.isArray(factsBruts) ? factsBruts : [];
      const markersRendus = facts
        .map((f) =>
          typeof f === 'object' && f !== null ? ((f as Json).marker ?? champ(f, ['fact'])) : undefined,
        )
        .map((m) => rendu(m));
      expect(
        markersRendus.some((m) => m.includes(marker43))
          ? `ROLE-INCOHERENT-AVEC-LE-TEMOIN facts contient l'operation 43 : ${court(rendu(facts), 400)}`
          : 'role-coherent-avec-le-temoin',
      ).toBe('role-coherent-avec-le-temoin');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T15.A2 arreter apres chaque upload ne publie aucun checkpoint complet',
    async () => {
      assertLoaded();
      assertContrat(
        'openArtifactStore',
        'openCheckpointCoordinator',
        'applyOperation',
        'beginCheckpoint',
        'finishCheckpoint',
        'listCheckpoints',
      );

      // CONTROLE POSITIF D'ABORD : sans fault, un coordinateur INDEPENDANT
      // publie bien un checkpoint que `listCheckpoints` denombre — sans ce
      // controle, un stub qui ne publie jamais rien rendrait ce cas vert pour
      // la mauvaise raison (verification/cases.lock.json).
      const storeOk = await ouvrirMagasin(dossierMagasin('a2', 'ok', 'artifacts'));
      const appDbOk = creerBase('a2_ok');
      const hOk = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDbOk, artifact_store: storeOk },
        ]),
        'ouverture du coordinateur (controle positif)',
      );
      exigerAccepte(
        await appeler('applyOperation', [hOk, { operation_sequence: 1, fact: { marker: `A2_OK_${RUN}` } }]),
        'applyOperation controle positif',
      );
      const tokenOk = exigerAccepte(
        await appeler('beginCheckpoint', [hOk, { after_operation: 1 }]),
        'beginCheckpoint controle positif',
      );
      exigerAccepte(
        await appeler('finishCheckpoint', [hOk, tokenOk, { components: composants(`${RUN}_a2ok`) }]),
        'finishCheckpoint controle positif',
      );
      const listeOk = exigerAccepte(await appeler('listCheckpoints', [hOk]), 'listCheckpoints controle positif');
      const nOk = Array.isArray(listeOk) ? listeOk.length : -1;
      expect(
        nOk >= 1
          ? 'controle-positif-detecte'
          : `CONTROLE-POSITIF-SANS-EFFET listCheckpoints=${court(rendu(listeOk), 300)} — une ` +
              'implementation qui ne publierait jamais rien passerait A2 sans rien prouver',
      ).toBe('controle-positif-detecte');

      // MAINTENANT LE CAS REEL : un coordinateur FRAIS, jamais capture avec
      // succes, sous le point d'injection nomme.
      const rootFault = dossierMagasin('a2', 'fault', 'artifacts');
      const storeFault = await ouvrirMagasin(rootFault);
      const appDbFault = creerBase('a2_fault');
      const hFault = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDbFault, artifact_store: storeFault },
        ]),
        'ouverture du coordinateur (fault)',
      );
      exigerAccepte(
        await appeler('applyOperation', [hFault, { operation_sequence: 1, fact: { marker: `A2_FAULT_${RUN}` } }]),
        'applyOperation avant capture faultee',
      );
      const avant = arbre(rootFault);
      const tokenFault = exigerAccepte(
        await appeler('beginCheckpoint', [hFault, { after_operation: 1 }]),
        'beginCheckpoint (fault)',
      );
      // L'appel FAUTE peut LEVER ou RENDRE un refus : la suite tolere les deux
      // (cf. IV.3) et ne juge que ce qui reste ENSUITE.
      await appeler('finishCheckpoint', [
        hFault,
        tokenFault,
        { components: composants(`${RUN}_a2fault`), fault: 'STOP_AFTER_EACH_UPLOAD' },
      ]);
      const apres = arbre(rootFault);

      // Un TEMOIN que le fault a bien produit une progression partielle
      // (au moins un objet televerse) : sinon « aucun checkpoint complet »
      // serait vrai d'une implementation qui n'a RIEN tente.
      const nouveaux = [...apres.keys()].filter((k) => !avant.has(k));
      expect(
        nouveaux.length > 0
          ? 'progression-partielle-observee'
          : 'AUCUNE-PROGRESSION-OBSERVEE le point d injection STOP_AFTER_EACH_UPLOAD n a produit ' +
              'aucun objet televerse : le fault n a pas ete exerce',
      ).toBe('progression-partielle-observee');

      const listeFault = await appeler('listCheckpoints', [hFault]);
      const listeFaultValeur = listeFault.refuse ? [] : listeFault.valeur;
      const nFault = Array.isArray(listeFaultValeur) ? listeFaultValeur.length : 0;
      expect(
        nFault === AUCUN_CHECKPOINT_COMPLET
          ? 'aucun-checkpoint-complet'
          : `CHECKPOINT-COMPLET-PUBLIE-SOUS-FAULT listCheckpoints=${court(rendu(listeFaultValeur), 400)} — ` +
              'L287 exige qu arreter apres chaque upload ne publie AUCUN checkpoint complet',
      ).toBe('aucun-checkpoint-complet'); // cahier:L287
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T15.A3 objet manquant donne CHECKPOINT_INCOMPLETE',
    async () => {
      assertLoaded();
      assertContrat(
        'openArtifactStore',
        'openCheckpointCoordinator',
        'applyOperation',
        'beginCheckpoint',
        'finishCheckpoint',
        'restoreCheckpoint',
      );

      const root = dossierMagasin('a3', 'artifacts');
      const store = await ouvrirMagasin(root);
      const appDb = creerBase('a3_app');
      const h = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDb, artifact_store: store },
        ]),
        'ouverture du coordinateur',
      );
      exigerAccepte(
        await appeler('applyOperation', [h, { operation_sequence: 1, fact: { marker: `A3_${RUN}` } }]),
        'applyOperation',
      );
      const avant = arbre(root);
      const token = exigerAccepte(await appeler('beginCheckpoint', [h, { after_operation: 1 }]), 'beginCheckpoint');
      const fin = exigerAccepte(
        await appeler('finishCheckpoint', [h, token, { components: composants(`${RUN}_a3`) }]),
        'finishCheckpoint',
      );
      const checkpointId = checkpointIdDe(fin);
      expect(checkpointId !== null ? 'id-present' : `SANS-IDENTITE ${court(rendu(fin), 300)}`).toBe('id-present');
      const apres = arbre(root);

      // Retirer UN objet reference — le plus gros fichier NOUVEAU, pour viser
      // un composant plutot qu'un eventuel petit pointeur de manifeste, sans
      // presumer d'aucune disposition de repertoire (cf. T13.IV.6).
      const candidats = fichiersAjoutesParTaille(root, avant, apres);
      expect(
        candidats.length > 0
          ? 'objets-detectes'
          : `AUCUN-OBJET-NOUVEAU-DETECTE apres finishCheckpoint : ${court(rendu([...apres.keys()]), 400)}`,
      ).toBe('objets-detectes');
      const cible = path.join(root, candidats[0] as string);
      fs.rmSync(cible);
      expect(fs.existsSync(cible)).toBe(false);

      const appDbRestore = creerBase('a3_restore');
      const h2 = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDbRestore, artifact_store: store },
        ]),
        'ouverture du coordinateur (restauration)',
      );
      const issue = await appeler('restoreCheckpoint', [h2, { checkpoint_id: checkpointId }]);
      exigerRefusNomme(issue, MOTIF_INCOMPLET, CODE_INCOMPLET, 'restauration d un checkpoint a objet manquant');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T15.A4 corruption est refusee',
    async () => {
      assertLoaded();
      assertContrat(
        'openArtifactStore',
        'openCheckpointCoordinator',
        'applyOperation',
        'beginCheckpoint',
        'finishCheckpoint',
        'restoreCheckpoint',
      );

      const root = dossierMagasin('a4', 'artifacts');
      const store = await ouvrirMagasin(root);
      const appDb = creerBase('a4_app');
      const h = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDb, artifact_store: store },
        ]),
        'ouverture du coordinateur',
      );
      exigerAccepte(
        await appeler('applyOperation', [h, { operation_sequence: 1, fact: { marker: `A4_${RUN}` } }]),
        'applyOperation',
      );
      const avant = arbre(root);
      const token = exigerAccepte(await appeler('beginCheckpoint', [h, { after_operation: 1 }]), 'beginCheckpoint');
      const fin = exigerAccepte(
        await appeler('finishCheckpoint', [h, token, { components: composants(`${RUN}_a4`) }]),
        'finishCheckpoint',
      );
      const checkpointId = checkpointIdDe(fin);
      expect(checkpointId !== null ? 'id-present' : `SANS-IDENTITE ${court(rendu(fin), 300)}`).toBe('id-present');
      const apres = arbre(root);

      const candidats = fichiersAjoutesParTaille(root, avant, apres);
      expect(
        candidats.length > 0
          ? 'objets-detectes'
          : `AUCUN-OBJET-NOUVEAU-DETECTE apres finishCheckpoint : ${court(rendu([...apres.keys()]), 400)}`,
      ).toBe('objets-detectes');
      const cible = path.join(root, candidats[0] as string);
      const original = fs.readFileSync(cible);
      const corrompu = Buffer.from(original);
      corrompu[0] = (corrompu[0] as number) ^ 0xff;
      fs.writeFileSync(cible, corrompu);

      // TEMOIN : exactement UN octet differe (convention de T13 pour rendre
      // une corruption reproductible et minimale).
      let diff = 0;
      for (let i = 0; i < original.length; i += 1) if (original[i] !== corrompu[i]) diff += 1;
      expect(diff).toBe(UN_OCTET);

      const appDbRestore = creerBase('a4_restore');
      const h2 = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDbRestore, artifact_store: store },
        ]),
        'ouverture du coordinateur (restauration)',
      );
      const issue = await appeler('restoreCheckpoint', [h2, { checkpoint_id: checkpointId }]);
      exigerRefusNomme(
        issue,
        MOTIF_CORRUPTION_CHECKPOINT,
        `${CODE_INCOMPLET} ou equivalent de corruption`,
        'restauration d un checkpoint corrompu',
      );
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T15.A5 deux finalisations identiques renvoient la meme identite',
    async () => {
      assertLoaded();
      assertContrat('openArtifactStore', 'openCheckpointCoordinator', 'applyOperation', 'beginCheckpoint', 'finishCheckpoint');

      const store = await ouvrirMagasin(dossierMagasin('a5', 'artifacts'));
      const appDb = creerBase('a5_app');
      const h = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDb, artifact_store: store },
        ]),
        'ouverture du coordinateur',
      );
      for (let seq = 1; seq <= 5; seq += 1) {
        exigerAccepte(
          await appeler('applyOperation', [h, { operation_sequence: seq, fact: { marker: `A5_${String(seq)}_${RUN}` } }]),
          `applyOperation(${String(seq)})`,
        );
      }
      const comps = composants(`${RUN}_a5_identique`);

      // (1) DEUX FINALISATIONS DU MEME ETAT, avec les MEMES composants opaques.
      const token1 = exigerAccepte(await appeler('beginCheckpoint', [h, { after_operation: 5 }]), 'beginCheckpoint#1');
      const fin1 = exigerAccepte(
        await appeler('finishCheckpoint', [h, token1, { components: comps }]),
        'finishCheckpoint#1',
      );
      const cid1 = checkpointIdDe(fin1);
      expect(cid1 !== null ? 'id-present' : `SANS-IDENTITE ${court(rendu(fin1), 300)}`).toBe('id-present');

      const token2 = exigerAccepte(await appeler('beginCheckpoint', [h, { after_operation: 5 }]), 'beginCheckpoint#2');
      const fin2 = exigerAccepte(
        await appeler('finishCheckpoint', [h, token2, { components: comps }]),
        'finishCheckpoint#2',
      );
      const cid2 = checkpointIdDe(fin2);
      expect(
        cid2 === cid1
          ? 'meme-identite'
          : `IDENTITES-DIFFERENTES-POUR-UN-CONTENU-IDENTIQUE : ${court(String(cid1), 200)} puis ` +
              `${court(String(cid2), 200)} — L287 exige la MEME identite`,
      ).toBe('meme-identite'); // cahier:L287

      // (2) CONTROLE : un contenu DIFFERENT (une operation de plus, donc un
      // etat metier different) rend une identite DIFFERENTE — sans ce
      // controle, une implementation qui rendrait toujours la MEME constante
      // passerait A5 sans rien prouver (symetrique de T13.A1).
      exigerAccepte(
        await appeler('applyOperation', [h, { operation_sequence: 6, fact: { marker: `A5_6_${RUN}` } }]),
        'applyOperation(6)',
      );
      const token3 = exigerAccepte(await appeler('beginCheckpoint', [h, { after_operation: 6 }]), 'beginCheckpoint#3');
      const fin3 = exigerAccepte(
        await appeler('finishCheckpoint', [h, token3, { components: comps }]),
        'finishCheckpoint#3',
      );
      const cid3 = checkpointIdDe(fin3);
      expect(
        cid3 !== cid1
          ? 'identite-sensible-au-contenu'
          : `IDENTITE-CONSTANTE-QUEL-QUE-SOIT-LE-CONTENU : ${court(String(cid1), 200)} pour after_operation=5 ` +
              `ET after_operation=6 — une constante ne prouve rien`,
      ).toBe('identite-sensible-au-contenu');
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T15.A6 restaurer code base memoire ne reduit pas les depenses centrales',
    async () => {
      assertLoaded();
      assertContrat(
        'openArtifactStore',
        'openCheckpointCoordinator',
        'applyOperation',
        'beginCheckpoint',
        'finishCheckpoint',
        'restoreCheckpoint',
      );

      // Une base CENTRALE, SEPAREE, que la suite gere ELLE-MEME (jamais passee
      // au coordinateur) — le registre de depenses de l'invariant D.4 (L66).
      const centralDb = creerBase('a6_central');
      psql(centralDb, 'CREATE TABLE ledger_entries (amount_micro_usd BIGINT NOT NULL)');
      const insInit = psql(centralDb, `INSERT INTO ledger_entries VALUES (${String(LEDGER_INITIAL_MICRO_USD)})`);
      expect(insInit.ok ? 'ledger-initialise' : `LEDGER-NON-INITIALISE ${court(insInit.out, 300)}`).toBe(
        'ledger-initialise',
      );

      const store = await ouvrirMagasin(dossierMagasin('a6', 'artifacts'));
      const appDb = creerBase('a6_app');
      const h = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDb, artifact_store: store },
        ]),
        'ouverture du coordinateur',
      );
      exigerAccepte(
        await appeler('applyOperation', [h, { operation_sequence: 1, fact: { marker: `A6_${RUN}` } }]),
        'applyOperation',
      );
      const token = exigerAccepte(await appeler('beginCheckpoint', [h, { after_operation: 1 }]), 'beginCheckpoint');
      const fin = exigerAccepte(
        await appeler('finishCheckpoint', [h, token, { components: composants(`${RUN}_a6`) }]),
        'finishCheckpoint',
      );
      const checkpointId = checkpointIdDe(fin);
      expect(checkpointId !== null ? 'id-present' : `SANS-IDENTITE ${court(rendu(fin), 300)}`).toBe('id-present');

      // ENTRE le checkpoint et la restauration : une VRAIE depense centrale
      // supplementaire (independante du coordinateur).
      const insSpend = psql(centralDb, `INSERT INTO ledger_entries VALUES (${String(LEDGER_SPEND_MICRO_USD)})`);
      expect(insSpend.ok ? 'depense-centrale-enregistree' : `DEPENSE-NON-ENREGISTREE ${court(insSpend.out, 300)}`).toBe(
        'depense-centrale-enregistree',
      );
      const soldeAvantRestauration = Number(psql(centralDb, 'SELECT COALESCE(SUM(amount_micro_usd),0) FROM ledger_entries').out);
      expect(soldeAvantRestauration).toBe(LEDGER_INITIAL_MICRO_USD + LEDGER_SPEND_MICRO_USD);

      // RESTAURER code/base/memoire (L287) — via un coordinateur FRAIS, qui ne
      // recoit JAMAIS `centralDb`.
      const appDbRestore = creerBase('a6_restore');
      const h2 = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDbRestore, artifact_store: store },
        ]),
        'ouverture du coordinateur (restauration)',
      );
      exigerAccepte(
        await appeler('restoreCheckpoint', [h2, { checkpoint_id: checkpointId }]),
        'restoreCheckpoint',
      );

      // TEMOIN INDEPENDANT, apres restauration : le registre central n'a subi
      // AUCUNE reduction — l'ecart avec le solde pre-restauration est nul.
      const soldeApresRestauration = Number(
        psql(centralDb, 'SELECT COALESCE(SUM(amount_micro_usd),0) FROM ledger_entries').out,
      );
      const ecart = soldeAvantRestauration - soldeApresRestauration;
      expect(
        ecart === AUCUNE_REDUCTION
          ? 'aucune-reduction-des-depenses-centrales'
          : `DEPENSES-CENTRALES-REDUITES-PAR-LA-RESTAURATION avant=${String(soldeAvantRestauration)} ` +
              `apres=${String(soldeApresRestauration)} ecart=${String(ecart)} — invariant D.4 (cahier:L66) viole`,
      ).toBe('aucune-reduction-des-depenses-centrales'); // cahier:L66
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A7 */
  test(
    'T15.A7 aucune ecriture applicative n echappe a la barriere testee',
    async () => {
      assertLoaded();
      assertContrat(
        'openArtifactStore',
        'openCheckpointCoordinator',
        'applyOperation',
        'beginCheckpoint',
        'finishCheckpoint',
      );

      const store = await ouvrirMagasin(dossierMagasin('a7', 'artifacts'));
      const appDb = creerBase('a7_app');
      const h = exigerAccepte(
        await appeler('openCheckpointCoordinator', [
          { admin_dsn: ADMIN_DSN, app_database: appDb, artifact_store: store },
        ]),
        'ouverture du coordinateur',
      );
      exigerAccepte(
        await appeler('applyOperation', [h, { operation_sequence: 1, fact: { marker: `A7_BEFORE_${RUN}` } }]),
        'applyOperation avant la fenetre fermee',
      );

      // FERMER LA BARRIERE (L285).
      const token = exigerAccepte(await appeler('beginCheckpoint', [h, { after_operation: 1 }]), 'beginCheckpoint');

      // TEMOIN, AVANT la tentative d'ecriture echappee : zero occurrence.
      const markerEchappe = `A7_ESCAPED_${RUN}`;
      expect(profilDeMarqueur(appDb, markerEchappe)).toBe(AUCUNE_ECRITURE_ECHAPPEE);

      // TENTATIVE D'ECRITURE APPLICATIVE PENDANT LA FENETRE FERMEE.
      const issueEchappee = await appeler('applyOperation', [
        h,
        { operation_sequence: 2, fact: { marker: markerEchappe } },
      ]);
      exigerRefusNomme(
        issueEchappee,
        MOTIF_BARRIERE,
        'un code nommant la barriere/porte fermee',
        'ecriture applicative pendant la fenetre de checkpoint',
      );

      // TEMOIN INDEPENDANT, APRES la tentative : toujours zero occurrence —
      // ce n'est pas seulement que la fonction a PRETENDU refuser, c'est que
      // RIEN n'a atteint la base.
      const nApres = profilDeMarqueur(appDb, markerEchappe);
      expect(
        nApres === AUCUNE_ECRITURE_ECHAPPEE
          ? 'aucune-ecriture-echappee'
          : `ECRITURE-ECHAPPEE-A-LA-BARRIERE marker=${markerEchappe} occurrences=${String(nApres)} — L287 exige ` +
              'qu AUCUNE ecriture applicative n echappe a la barriere',
      ).toBe('aucune-ecriture-echappee'); // cahier:L287

      // ROUVRIR LA BARRIERE et verifier qu'une ecriture LEGITIME redevient
      // possible ensuite — sans ce controle, une barriere qui refuse TOUT,
      // pour toujours, satisferait ce cas sans rien prouver de la barriere
      // elle-meme.
      exigerAccepte(
        await appeler('finishCheckpoint', [h, token, { components: composants(`${RUN}_a7`) }]),
        'finishCheckpoint (reouverture de la barriere)',
      );
      const markerLegitime = `A7_AFTER_${RUN}`;
      exigerAccepte(
        await appeler('applyOperation', [h, { operation_sequence: 2, fact: { marker: markerLegitime } }]),
        'applyOperation apres reouverture de la barriere',
      );
      expect(profilDeMarqueur(appDb, markerLegitime)).toBeGreaterThan(0);
    },
    CASE_TIMEOUT_MS,
  );
});
