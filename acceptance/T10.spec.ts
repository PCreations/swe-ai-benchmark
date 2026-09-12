/**
 * acceptance/T10.spec.ts — suite d'acceptation de la tache T10.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T10.A1 behaviour — le temoin CONFORME est ACCEPTE par le pipeline de
 *                      qualification
 *   T10.A2 refusal   — les six mutants semantiques nommes par L241 sont
 *                      chacun REJETES par leur controle NOMME
 *   T10.A3 refusal   — un scenario dont une assertion CONTREDIT le contrat est
 *                      mis en QUARANTAINE
 *   T10.A4 refusal   — un evaluateur factice qui alterne succes et echec est
 *                      reconnu INSTABLE
 *   T10.A5 absence   — AUCUN cas mis en quarantaine n'entre dans un manifeste
 *                      confirmatoire
 *   T10.A6 behaviour — raisons et proportions d'exclusion restent EXPORTABLES
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T10 — `packages/evaluation` et
 * `fixtures`. ADR-001 : cet aveuglement est PROCEDURAL, donc une discipline
 * auditable au diff, pas une barriere technique. Le contrat teste ci-dessous
 * n'a PAS ete releve dans l'implementation ; il est derive de
 * docs/specs/T10.md, c'est-a-dire des lignes du cahier que la carte de
 * specification epingle :
 *
 *   L239  livrables : « pipeline de qualification, registre de mutants
 *         semantiques et file de quarantaine »
 *   L241  les six cas d'acceptation, mot pour mot — dont les SIX NOMS de
 *         fautes metier : surbooking, doublon idempotent, FIFO inverse,
 *         frontiere 24 h fausse, fuite intertenant, perte de migration
 *   L243  fin : « matrice temoin/mutant/controle enregistree. Il ne suffit pas
 *         que le mutant plante au build : pour les fautes metier obligatoires,
 *         le programme doit DEMARRER PUIS ECHOUER sur la propriete ciblee.
 *         DIX REPETITIONS detectent l'instabilite de la fixture. »
 *   L119  F-RESERVATION : creneau S1 de capacite 1, acteurs A/B/C, locataire
 *         `legacy`, regle d'annulation a 24 h frontiere INCLUSE
 *   L123  l'etat persistant a l'entree de P4 ; FIFO ordonne par SEQUENCE
 *         d'admission explicite ; verdict intertenant `NOT_FOUND`
 *   L111  « une campagne confirmatoire exige une exposition predefinie non
 *         nulle » — le manifeste confirmatoire d'A5 n'est pas un objet vide
 *   L139  « une preuve comporte des sorties effectivement observees et des
 *         assertions independantes ; un test avec zero assertion [...] ne
 *         satisfait pas le contrat »
 *   L141  « les checks d'integration utilisent REELLEMENT PostgreSQL [...]
 *         lorsque le contrat porte sur ces composants »
 *   L143  « les nombres exacts se verifient en entier ou rationnel [...]
 *         tolerance au maximum 1e-12 »
 *   L559  chaque suite d'integration recoit un `test_run_id` technique unique
 *         et ses propres bases
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Tout litteral COMPARE dans une assertion vient de l'une des deux sources
 * suivantes, et d'aucune autre :
 *
 *   (a) un import de `acceptance/reference/F-RESERVATION.json` — racine gelee,
 *       docs/FROZEN_ROOTS.json. C'est le cas de la capacite du creneau, de son
 *       identifiant et de son debut, des acteurs, du locataire `legacy`, des
 *       horloges des quatre periodes, de l'instant de frontiere, du delai de
 *       24 h et de l'etat attendu de P1 et P2. Ce sont les valeurs qui rendent
 *       un scenario COHERENT ou CONTRADICTOIRE : la contradiction d'A3 et A6
 *       est construite en INVERSANT une issue attendue de la racine gelee,
 *       jamais en inventant une valeur.
 *   (b) un commentaire `// cahier:L<n>` resoluble par
 *       `sed -n '<n>p' docs/cahier.md`. Quatre valeurs seulement sont dans ce
 *       cas, et aucune n'est fixee par §F :
 *         les six noms de fautes — L241
 *         6 (leur nombre)        — L241
 *         10 (les repetitions)   — L243
 *         « demarrer puis echouer », donc `started` — L243
 *
 * AUCUNE valeur attendue n'a ete obtenue en lancant l'implementation et en
 * figeant ce qu'on a vu passer. Les seules valeurs que la suite FABRIQUE sont
 * ses propres identifiants de scenario, ses sentinelles, les noms de ses bases
 * PostgreSQL et la sequence de son evaluateur factice : ce sont des ENTREES de
 * la suite, jamais des valeurs attendues.
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T10 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Les roles de T10 sont cherches dans les deux `source_paths` du registre, et
 * nulle part ailleurs : `packages/evaluation` (par le nom de son package.json,
 * puis `src/index.ts`, puis `index.ts`) et les points d'entree de `fixtures/`.
 * Le SEUL role cherche hors de la, `listWitnesses`, appartient a T09 : il est
 * charge A PART, aux emplacements que l'en-tete de `acceptance/T09.spec.ts`
 * PUBLIE (section III) — du contrat, pas du code lu. Les roles sont resolus
 * par une courte liste d'ALIAS documentee : une tolerance de NOMMAGE, jamais
 * de COMPORTEMENT. Si aucun nom ne repond, la suite echoue par
 * une ASSERTION qui nomme le role et les alias attendus — jamais par un import
 * casse, que verification/runner/red.mjs classe MODULE_NOT_FOUND et refuse
 * comme preuve.
 *
 *   qualifyWitness({ witness, dsn })        pipeline de qualification   (L239)
 *   listSemanticMutants()                   registre des mutants        (L239)
 *   qualifyScenario(scenario)               pipeline, volet scenario    (L239)
 *   listQuarantine()                        file de quarantaine         (L239)
 *   detectInstability({ evaluate })         dix repetitions             (L243)
 *   buildConfirmatoryManifest(rapports)     manifeste confirmatoire     (L241)
 *   exportExclusions(rapports)              raisons et proportions      (L241)
 *   qualificationMatrix()                   matrice temoin/mutant/ctrl  (L243)
 *
 * Le nom du temoin CONFORME n'est PAS invente ici : il est lu dans le
 * catalogue publie par T09 (`listWitnesses()`, contrat deja valide — L147
 * « une dependance signifie un contrat deja valide »), en prenant l'unique
 * entree `conforming === true`.
 *
 * SEPT CONVENTIONS D'APPEL QUE LE CAHIER NE DICTE PAS, ET QUI SONT DONC
 * FIXEES ICI (elles sont reprises telles quelles dans
 * verification/mutants/T10.json) :
 *
 *   1. QUALIFICATION D'UN TEMOIN. `qualifyWitness({ witness, dsn })` — objet
 *      PLAT et STRICT (L80 : proprietes inconnues rejetees). `witness` est un
 *      nom du catalogue T09 ou du registre de mutants. `dsn` est l'URI libpq
 *      d'une base VIDE que la SUITE a creee — c'est le `test_run_id` de L559.
 *      Le pipeline execute le temoin sur CETTE base ; il peut en deriver
 *      d'autres (les clones jetables de P3, L123), mais la base fournie ne
 *      doit pas rester vide : c'est ce qui interdit une qualification « sur
 *      papier », que L141 refuse.
 *
 *   2. RAPPORT DE QUALIFICATION. Objet portant au moins :
 *        verdict|status   chaine — ACCEPTE / REJETE (synonymes admis)
 *        started          booleen — le programme a DEMARRE (L243)
 *        control          chaine NON VIDE quand le temoin est REJETE : le NOM
 *                         du controle qui l'a rejete (L241, « detecte par son
 *                         controle NOMME »)
 *      Un rapport qui n'accepte ni ne rejette (verdict absent, vide ou
 *      indecidable) est un rapport ABSENT : la suite le dit et vire au rouge.
 *
 *   3. REGISTRE DES MUTANTS. `listSemanticMutants()` rend une liste d'entrees
 *      PLATES portant au moins `name` (le nom accepte par `qualifyWitness`) et
 *      la FAUTE qu'elles injectent — dans `fault`, `faute`, `kind`, `type`, ou
 *      a defaut lisible dans `name`. Les six fautes de L241 doivent chacune y
 *      etre representee, sans ambiguite : une entree dont le nom evoque DEUX
 *      fautes est refusee en nommant les deux.
 *
 *   4. SCENARIO SOUMIS A QUALIFICATION. `bench.qualification.scenario/1` :
 *        { schema, scenario_id, tenant, business_clock,
 *          slots: [{ slot_id, capacity, starts_at }],
 *          steps: [{ step_id, at, operation, actor, slot, sequence,
 *                    expect: { outcome } }] }
 *      `operation` vaut `reserve` ou `cancel` ; `expect.outcome` vaut
 *      `accepted` ou `refused`. C'est l'ASSERTION du scenario : ce que son
 *      auteur PRETEND que le contrat metier repond. Le pipeline la confronte
 *      au contrat (l'oracle T07) ; une assertion qui le contredit met le
 *      scenario en quarantaine.
 *
 *   5. QUALIFICATION D'UN SCENARIO. `qualifyScenario(scenario)` rend un
 *      rapport portant `scenario_id`, un verdict (QUALIFIE / QUARANTAINE,
 *      synonymes admis ; ou un booleen `quarantined`) et, en quarantaine, un
 *      `reason` NON VIDE qui nomme la contradiction.
 *
 *   6. INSTABILITE. `detectInstability({ evaluate })` — `evaluate` est une
 *      fonction FOURNIE PAR LA SUITE qui rend un BOOLEEN : `true` = succes,
 *      `false` = echec. Sans compte de repetitions demande, le pipeline
 *      l'appelle DIX fois (L243) et rend `{ stable, repetitions }`.
 *      L'INSTABILITE EST UNE PROPRIETE DE VARIANCE, PAS D'ECHEC : un
 *      evaluateur qui echoue TOUJOURS est deterministe, donc STABLE (et non
 *      qualifie). C'est la decision de contrat que la suite publie, et elle
 *      est ce qui distingue un detecteur d'instabilite d'un simple compteur
 *      d'echecs.
 *
 *   7. MANIFESTE ET EXCLUSIONS. `buildConfirmatoryManifest(rapports)` et
 *      `exportExclusions(rapports)` recoivent EXACTEMENT le tableau des
 *      rapports rendus par `qualifyScenario`, dans l'ordre de soumission.
 *      L'export rend une liste d'entrees `{ reason, count, proportion }` :
 *      `count` est un entier, `proportion` un rationnel exact de ce compte sur
 *      un denominateur COMMUN a toutes les entrees (le nombre de cas soumis,
 *      ou le nombre de cas exclus — les deux sont admis, mais un seul a la
 *      fois, et la suite le verifie par le calcul, a 1e-12 pres, L143).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES QUATRE DANGERS PROPRES A T10.
 *
 * (1) LES TROIS CAS DE REFUS QU'UN STUB QUI LEVE REND VERTS. A2, A3 et A4 sont
 *     classes `refusal`. Un pipeline mort rejette tout : tous les mutants sont
 *     « detectes », tout scenario part en quarantaine, tout evaluateur est
 *     « instable ». Chacun porte donc son CONTROLE POSITIF dans le MEME cas :
 *     A2 exige que le temoin CONFORME soit ACCEPTE par le meme pipeline ;
 *     A3 exige qu'un scenario COHERENT ne soit PAS mis en quarantaine et
 *     n'apparaisse PAS dans la file ; A4 exige qu'un evaluateur CONSTANT —
 *     succes constant ET echec constant — soit reconnu STABLE.
 *
 * (2) L'ABSENCE QUI SE SATISFAIT DU VIDE. A5 est classe `absence` : « aucun cas
 *     mis en quarantaine n'entre dans un manifeste confirmatoire ». Un
 *     constructeur qui rend un manifeste VIDE le satisfait sans rien prouver,
 *     et L111 l'interdit deja (« une campagne confirmatoire exige une
 *     exposition predefinie NON NULLE »). A5 exige donc, AVANT l'assertion
 *     d'absence, que les cinq scenarios QUALIFIES soient tous PRESENTS dans le
 *     manifeste. L'absence, elle, est cherchee sur la serialisation COMPLETE
 *     du manifeste, par une sentinelle de 16 hexadecimaux qui ne peut pas
 *     apparaitre par accident.
 *
 * (3) LE MUTANT QUI PLANTE AU BUILD. L243 le nomme explicitement : « il ne
 *     suffit pas que le mutant plante au build ; le programme doit DEMARRER
 *     PUIS ECHOUER sur la propriete ciblee ». Un pipeline qui compilerait les
 *     six mutants et les declarerait « detectes » sur une erreur de
 *     compilation satisferait l'enonce naif d'A2. A2 exige donc, pour CHAQUE
 *     mutant, `started === true` ET un controle nomme qui designe la faute
 *     injectee — pas une panne de demarrage.
 *
 * (4) LES DIX REPETITIONS RECOPIEES. A4 pourrait se contenter de lire un champ
 *     `repetitions: 10` que l'implementation ecrirait sans rien repeter. La
 *     suite COMPTE elle-meme les appels de son evaluateur factice : c'est son
 *     compteur, pas le champ du rapport, qui doit valoir 10. Le champ est
 *     verifie en plus, et doit concorder.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI.
 *
 *  • « matrice temoin/mutant/controle ENREGISTREE » (L243) : la suite exige
 *    que la matrice soit RELISIBLE — par `qualificationMatrix()` ou par un
 *    champ du rapport — et qu'elle porte les six lignes observees. Elle ne
 *    prescrit ni son format de stockage ni sa persistance sur disque : ce
 *    serait mesurer un format d'artefact, pas l'enregistrement.
 *  • L'instabilite « rare » : L243 dit lui-meme « sans pretendre exclure
 *    toutes les instabilites rares ». A4 mesure le cas alternant, qui est
 *    celui que le cahier nomme, et rien d'autre.
 *  • La suite n'observe pas le CONTENU des mutants (leur code) : elle observe
 *    qu'ils demarrent, qu'ils sont rejetes, et par quel controle nomme. Le
 *    reste est dans `source_paths`, auxquels elle est aveugle.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 300_000;
const CASE_TIMEOUT_LOURD_MS = 900_000;

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
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');

/** Rendu TEXTUEL PROFOND. Traverse Map/Set, exclut les piles d'exception. */
function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 8) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'symbol') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (v instanceof Map) {
    return `Map{${[...v.entries()]
      .map(([k, x]) => `${rendu(k, profondeur + 1, vus)}:${rendu(x, profondeur + 1, vus)}`)
      .join(',')}}`;
  }
  if (v instanceof Set) return `Set[${[...v].map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}

const court = (s: string, n = 700): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

/* ────────────────────── fixture de reference (racine gelee, L139) */

function readReference(name: string): Json {
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, `${name}.json`), 'utf8')) as Json;
}

function refValue(doc: Json, dotted: string): unknown {
  let cur: unknown = doc;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      throw new Error(`REFERENCE-CHEMIN-ABSENT ${dotted} (bloque a ${seg})`);
    }
    cur = (cur as Json)[seg];
  }
  if (cur === undefined) throw new Error(`REFERENCE-VALEUR-ABSENTE ${dotted}`);
  return cur;
}

const RESERVATION = readReference('F-RESERVATION');
const S = (chemin: string): string => String(refValue(RESERVATION, chemin));
const N = (chemin: string): number => Number(refValue(RESERVATION, chemin));

/* ── les valeurs scellees de F-RESERVATION, et rien d'autre ─────────────── */

const ACTEURS = (refValue(RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
const [ACTEUR_A, ACTEUR_B, ACTEUR_C] = ACTEURS as [string, string, string];
const LOCATAIRE = S('valeurs.locataire_initial.valeur');
const CRENEAU_ID = S('valeurs.creneau.id.valeur');
const CAPACITE = N('valeurs.creneau.capacite.valeur');
const DEBUT = S('valeurs.creneau.debut.valeur');

const P1_H = S('valeurs.horloges_des_periodes.P1.valeur');
const P2_H = S('valeurs.horloges_des_periodes.P2.valeur');

const P1_CONFIRMEES = N('valeurs.P1.etat_attendu.confirmees.valeur');
const P1_TITULAIRE = S('valeurs.P1.etat_attendu.titulaire.valeur');
const P1_SURBOOKING = refValue(RESERVATION, 'valeurs.P1.etat_attendu.surbooking.valeur') as boolean;
const P2_ORDRE_ATTENTE = (
  refValue(RESERVATION, 'valeurs.P2.ordre_d_attente.valeur') as unknown[]
).map(String);

const DELAI_HEURES = N('valeurs.P3.delai_heures.valeur');
const FRONTIERE_INCLUSE = refValue(RESERVATION, 'valeurs.P3.frontiere_incluse.valeur') as boolean;
const FRONTIERE = S('valeurs.P3.frontiere.valeur');
const PROBE_FRONTIERE_ACTEUR = S('valeurs.P3.probes.clone_1_frontiere_exacte.acteur.valeur');

/* ── les litteraux que §F ne scelle pas, releves dans le cahier ─────────── */

/**
 * Les SIX fautes metier de L241, dans l'ordre du cahier. Le motif est une
 * tolerance de NOMMAGE : il reconnait la faute dans le nom que
 * l'implementation donne a son mutant et a son controle. Il ne tolere aucun
 * comportement : l'assertion porte sur le REJET et sur le NOM du controle.
 */
const FAUTES = [
  { id: 'surbooking', motif: /surbook|overbook|capacit/i },
  { id: 'doublon-idempotent', motif: /idempot|doublon|duplicate|replay|rejeu/i },
  { id: 'fifo-inverse', motif: /fifo|ordre|order|attente|wait|queue|promot/i },
  { id: 'frontiere-24h-fausse', motif: /frontier|boundary|cutoff|deadline|delai|24/i },
  { id: 'fuite-intertenant', motif: /tenant|locataire|isolat|leak|fuite|cloison/i },
  { id: 'perte-de-migration', motif: /migrat|perte|loss|lost|drop/i },
] as const; // cahier:L241

const NB_FAUTES = 6; // cahier:L241 — six mutants nommes
const REPETITIONS_ATTENDUES = 10; // cahier:L243 — « dix repetitions »

/** Vocabulaire d'issue des assertions de scenario (convention III.4). */
const ISSUE_ACCEPTEE = 'accepted';
const ISSUE_REFUSEE = 'refused';

/* ──────────────────────────────────────── sentinelles (convention III.4) */

/**
 * Une sentinelle est `sha256("bench.T10.sentinelle:<etiquette>")` tronque a
 * 16 hexadecimaux : reproductible, et impossible a produire par accident dans
 * une sortie. Elle sert les deux assertions d'ABSENCE (A3 et A5), qui sont
 * cherchees sur la SERIALISATION COMPLETE de la file de quarantaine et du
 * manifeste — donc insensibles au format que l'implementation choisit.
 */
function sentinelle(etiquette: string): string {
  return createHash('sha256').update(`bench.T10.sentinelle:${etiquette}`).digest('hex').slice(0, 16);
}

function idScenario(etiquette: string): string {
  return `T10-SCN-${etiquette}-${sentinelle(etiquette)}`;
}

/* ══════════════════════════════ PostgreSQL reel (L141) ═════════════════ */

/**
 * `test_run_id` technique de L559 : toutes les bases de cette execution en
 * derivent, de sorte que deux executions simultanees n'interferent pas. Il
 * n'entre dans AUCUNE assertion de valeur metier — c'est un namespace.
 */
const RUN = `t10_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
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

const BASES_CREEES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  expect(r.ok ? 'base-creee' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 300)}`).toBe(
    'base-creee',
  );
  BASES_CREEES.push(nom);
  return nom;
}

/**
 * Nombre total de lignes d'une base, SANS NOMMER AUCUNE TABLE : L119 impose
 * d'« evaluer l'etat metier exporte, pas un nom de table impose ». Sert
 * uniquement a etablir qu'un PROGRAMME a reellement ecrit dans la base fournie
 * (L141), pas a juger son contenu.
 */
function nbLignes(db: string): number {
  const r = psql(
    db,
    `SELECT coalesce(sum(n), 0)::bigint FROM (
       SELECT (xpath('/row/c/text()', query_to_xml(
                format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                false, true, '')))[1]::text::bigint AS n
       FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         AND table_type = 'BASE TABLE'
     ) s`,
  );
  return r.ok && /^\d+$/.test(r.out) ? Number(r.out) : -1;
}

/** Les bases du serveur portant le jeton de CETTE execution (L559). */
function basesDuRun(): string[] {
  const r = psql(ADMIN_DB, `SELECT datname FROM pg_database WHERE datname LIKE '%${RUN}%'`);
  return r.ok ? r.out.split('\n').filter((x) => x.trim() !== '') : [];
}

/**
 * « Un programme a-t-il ecrit quelque part sous mon namespace ? » — la base
 * FOURNIE d'abord, puis toute base derivee portant le jeton du run (le
 * pipeline a le droit de cloner, L123 ; il n'a pas le droit de ne rien ecrire).
 */
function ecritureObservee(db: string): { ok: boolean; detail: string } {
  const direct = nbLignes(db);
  if (direct > 0) return { ok: true, detail: `${db}:${String(direct)} lignes` };
  const autres = basesDuRun().filter((d) => d !== db);
  const details: string[] = [`${db}:${String(direct)}`];
  for (const d of autres) {
    const n = nbLignes(d);
    details.push(`${d}:${String(n)}`);
    if (n > 0) return { ok: true, detail: details.join(' ') };
  }
  return { ok: false, detail: details.join(' ') };
}

/* ═══════════════════ chargement des deux source_paths de T10 ═══════════ */

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

/** Specificateurs d'un paquet : son nom publie, puis ses sources. */
function specifiersForPackage(pkg: string): string[] {
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

/** Fichiers d'entree cherches dans un dossier, dans cet ordre. */
const ENTREES = [
  'index.mjs',
  'index.js',
  'index.ts',
  'src/index.mjs',
  'src/index.js',
  'src/index.ts',
] as const;

function entreesDe(...segments: string[]): string[] {
  const out: string[] = [];
  const dir = path.join(REPO, ...segments);
  for (const rel of ENTREES) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}

/**
 * LE SUJET : les deux `source_paths` que verification/tasks.json declare pour
 * T10, et rien d'autre — `packages/evaluation` et `fixtures/**`.
 */
function specifiersDuSujet(): string[] {
  return [
    ...specifiersForPackage('evaluation'),
    ...entreesDe('fixtures'),
    ...entreesDe('fixtures', 'evaluation'),
    ...entreesDe('fixtures', 'qualification'),
    ...entreesDe('fixtures', 'mutants'),
  ];
}

/**
 * LA DEPENDANCE T09, chargee SEPAREMENT et interrogee pour un seul role :
 * `listWitnesses`, qui donne le nom du temoin CONFORME (A1, A2). La liste de
 * points d'entree ci-dessous n'a pas ete relevee dans l'implementation de T09 :
 * c'est celle que `acceptance/T09.spec.ts` PUBLIE dans son en-tete, section III.
 * Elle est donc du contrat, au sens de L147 (« une dependance signifie un
 * contrat deja valide »), et non du code lu.
 */
function specifiersDeT09(): string[] {
  return [
    ...entreesDe('fixtures', 'temoins'),
    ...entreesDe('fixtures', 'witnesses'),
    ...entreesDe('fixtures'),
    ...entreesDe('infra', 'temoins'),
    ...entreesDe('infra', 'witnesses'),
  ];
}

async function charger(specs: string[], quoi: string): Promise<Loaded> {
  const attempts: string[] = [];
  const via: string[] = [];
  const flat = new Map<string, unknown>();
  let exportCount = 0;
  if (specs.length === 0) attempts.push(`aucun point d entree ${quoi}`);
  for (const s of specs) {
    try {
      const mod = (await import(s)) as Ns;
      flatten(mod, flat);
      exportCount += Object.keys(mod).filter((k) => k !== '__esModule').length;
      via.push(s.replace(pathToFileURL(REPO).href, '<repo>'));
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  return { ok: via.length > 0, via, exportCount, flat, attempts };
}

const VIDE: Loaded = {
  ok: false,
  via: [],
  exportCount: 0,
  flat: new Map(),
  attempts: ['beforeAll non execute'],
};

let LOADED: Loaded = VIDE;
let LOADED_T09: Loaded = VIDE;

beforeAll(async () => {
  // Le chargement ne LEVE pas : un import casse produirait « Test suite failed
  // to run », que verification/runner/red.mjs classe SUITE_FAILED_TO_RUN et
  // refuse comme preuve. Chaque cas asserte donc lui-meme le chargement, ce qui
  // rend le rouge ASSERTION_FAILED — la seule forme de rouge qui prouve quelque
  // chose (cahier L139).
  LOADED = await charger(
    specifiersDuSujet(),
    'sous packages/evaluation ni fixtures/** (les deux source_paths de T10)',
  );
  LOADED_T09 = await charger(
    specifiersDeT09(),
    'aux emplacements que acceptance/T09.spec.ts publie pour les temoins',
  );
}, CASE_TIMEOUT_MS);

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});

function assertLoaded(): void {
  expect(LOADED.ok ? 'charge' : `SUJET-NON-CHARGEABLE ${LOADED.attempts.join(' | ')}`).toBe(
    'charge',
  );
  expect(
    LOADED.via.some((v) => /\/dist\/|\/build\/|\/lib\//.test(v))
      ? `CHARGE-DEPUIS-UN-ARTEFACT-COMPILE ${LOADED.via.join(', ')}`
      : 'charge-depuis-la-source',
  ).toBe('charge-depuis-la-source');
}

/* ───────────────────────────────────────────── resolution par role */

const ROLES: Record<string, readonly string[]> = {
  qualifyWitness: [
    'qualifyWitness',
    'qualifierTemoin',
    'qualifyTemoin',
    'runQualification',
    'qualificationPipeline',
    'qualifyApplication',
    'evaluateWitness',
    'screenWitness',
    'qualify',
  ],
  listSemanticMutants: [
    'listSemanticMutants',
    'semanticMutants',
    'listMutants',
    'mutantRegistry',
    'registreDesMutants',
    'registreMutants',
    'catalogueMutants',
    'mutantCatalogue',
    'mutantCatalog',
    'listerMutants',
    'mutants',
  ],
  qualifyScenario: [
    'qualifyScenario',
    'qualifierScenario',
    'screenScenario',
    'checkScenario',
    'validateScenario',
    'qualifyCase',
    'qualifierCas',
    'qualifyFixture',
  ],
  listQuarantine: [
    'listQuarantine',
    'quarantineQueue',
    'fileDeQuarantaine',
    'listerQuarantaine',
    'listQuarantined',
    'getQuarantine',
    'quarantined',
    'quarantaine',
    'quarantine',
  ],
  detectInstability: [
    'detectInstability',
    'detecterInstabilite',
    'qualifyEvaluator',
    'qualifierEvaluateur',
    'checkStability',
    'assessStability',
    'stabilityCheck',
    'repeatEvaluator',
  ],
  buildConfirmatoryManifest: [
    'buildConfirmatoryManifest',
    'confirmatoryManifest',
    'construireManifesteConfirmatoire',
    'manifesteConfirmatoire',
    'makeConfirmatoryManifest',
    'assembleConfirmatoryManifest',
    'buildManifest',
  ],
  exportExclusions: [
    'exportExclusions',
    'exporterExclusions',
    'exclusionsExport',
    'exclusionReport',
    'rapportDExclusions',
    'exportExclusionReasons',
    'exclusionSummary',
    'exclusions',
  ],
  qualificationMatrix: [
    'qualificationMatrix',
    'matriceDeQualification',
    'matriceTemoinMutantControle',
    'witnessMutantControlMatrix',
    'recordedMatrix',
    'getMatrix',
    'matrix',
    'matrice',
  ],
  // Contrat DEJA VALIDE de T09 (L147) : le nom du temoin conforme n'est pas
  // invente ici, il est lu dans le catalogue que T09 publie.
  listWitnesses: [
    'listWitnesses',
    'witnessCatalogue',
    'witnessCatalog',
    'listTemoins',
    'catalogueTemoins',
    'catalogue',
    'catalog',
    'witnesses',
    'temoins',
    'listApplications',
  ],
};

type Fonction = (...a: unknown[]) => unknown;

const RESOLVED = new Map<string, Fonction | null>();

/** `listWitnesses` appartient a T09 : il est cherche dans SON chargement. */
const ROLES_DE_T09 = new Set(['listWitnesses']);

function resolveOpt(role: string): Fonction | null {
  const memo = RESOLVED.get(role);
  if (memo !== undefined) return memo;
  const candidats = ROLES[role];
  const sources = ROLES_DE_T09.has(role) ? [LOADED_T09, LOADED] : [LOADED];
  for (const src of sources) {
    for (const c of candidats) {
      const v = src.flat.get(c);
      if (typeof v === 'function') {
        RESOLVED.set(role, v as Fonction);
        return v as Fonction;
      }
    }
    const lower = new Map<string, unknown>();
    for (const [k, v] of src.flat) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
    for (const c of candidats) {
      const v = lower.get(c.toLowerCase());
      if (typeof v === 'function') {
        RESOLVED.set(role, v as Fonction);
        return v as Fonction;
      }
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
          manquants.map((r) => `${r}:[${ROLES[r].join('|')}]`).join(' ; ') +
          ` (sujet : ${String(LOADED.exportCount)} exports dans ` +
          `${LOADED.via.join(', ') || 'aucun module'} ; temoins T09 : ` +
          `${String(LOADED_T09.exportCount)} exports dans ` +
          `${LOADED_T09.via.join(', ') || 'aucun module'} — ${LOADED_T09.attempts.join(' | ')})`,
  ).toBe('contrat-resolu');
}

/* ─────────────────────────── appel d'un role : un jet N'EST PAS un refus */

interface Appel {
  ok: boolean;
  valeur: unknown;
  erreur: string;
}

async function appeler(role: string, ...args: unknown[]): Promise<Appel> {
  const f = resolveOpt(role);
  if (f === null) return { ok: false, valeur: undefined, erreur: `role ${role} non resolu` };
  try {
    const v: unknown = await Promise.resolve(f(...args));
    return { ok: true, valeur: v, erreur: '' };
  } catch (e) {
    const err = e as Error;
    return { ok: false, valeur: undefined, erreur: `${err.name}: ${err.message}`.split('\n')[0] };
  }
}

/** Un PLANTAGE n'est pas un verdict : A2, A3 et A4 l'exigent explicitement. */
function assertPasDePlantage(a: Appel, quoi: string): void {
  expect(a.ok ? 'appel-abouti' : `PLANTAGE-AU-LIEU-D-UN-VERDICT ${quoi} : ${a.erreur}`).toBe(
    'appel-abouti',
  );
}

/* ───────────────────────── lecture tolerante d'un rapport (convention III.2) */

/** Premiere valeur dont la CLE correspond au motif, en largeur, profondeur 2. */
function champ(o: unknown, motif: RegExp, profondeur = 2): unknown {
  if (o === null || typeof o !== 'object') return undefined;
  const niveaux: unknown[][] = [[o]];
  for (let d = 0; d <= profondeur; d += 1) {
    const courant = niveaux[d] ?? [];
    const suivant: unknown[] = [];
    for (const n of courant) {
      if (n === null || typeof n !== 'object' || Array.isArray(n)) continue;
      for (const [k, v] of Object.entries(n as Json)) {
        if (motif.test(k) && v !== undefined && v !== null) return v;
      }
      for (const v of Object.values(n as Json)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) suivant.push(v);
      }
    }
    niveaux.push(suivant);
  }
  return undefined;
}

function champBooleen(o: unknown, motif: RegExp): boolean | null {
  const v = champ(o, motif);
  return typeof v === 'boolean' ? v : null;
}

function champChaine(o: unknown, motif: RegExp): string | null {
  const v = champ(o, motif);
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'string') return v[0];
  return null;
}

const CLE_ACCEPTE = /^(accepted|accepte|acceptee|conforming|conforme|qualified|qualifie|qualifiee|ok|passed)$/i;
const CLE_VERDICT = /^(verdict|status|statut|outcome|resultat|result|decision|etat|state)$/i;
const CLE_DEMARRE = /^(started|start|booted|boot|launched|demarre|demarree|boot_ok|startup_ok|program_started|has_started)$/i;
const CLE_CONTROLE = /^(control|controle|named_control|controle_nomme|detected_by|detecte_par|failing_control|failed_control|violated_control|check|gate)$/i;
const CLE_MOTIF = /^(reason|motif|raison|cause|why|explanation|detail|details|message)$/i;
const CLE_QUARANTAINE = /^(quarantined|quarantine|quarantaine|in_quarantine|mis_en_quarantaine|isole)$/i;
const CLE_STABLE = /^(stable|is_stable|deterministic|deterministe)$/i;
const CLE_INSTABLE = /^(unstable|instable|flaky|is_unstable|instability)$/i;
const CLE_REPETITIONS =
  /^(repetitions|repeats|repeat_count|runs|iterations|attempts|executions|samples)$/i;
const CLE_ID_SCENARIO = /^(scenario_id|case_id|id|scenario|subject|sujet)$/i;

const MOTS_ACCEPTE = /ACCEPT|CONFORM|QUALIF|VALID|PASS(ED)?$|^OK$|GREEN|RETENU/i;
const MOTS_REJETE =
  /REJECT|REJET|REFUS|DENIED|NON.?CONFORM|DISQUALIF|UNQUALIF|(NOT|NON).?QUALIF|(NOT|NON).?ACCEPT|FAIL|DETECT|KILL|EXCLU|QUARANT|RED/i;

/**
 * Verdict d'acceptation d'un rapport : `true` ACCEPTE, `false` REJETE, `null`
 * INDECIDABLE. `null` n'est jamais silencieux — chaque cas l'affiche.
 */
function estAccepte(r: unknown): boolean | null {
  const b = champBooleen(r, CLE_ACCEPTE);
  if (b !== null) return b;
  const v = champChaine(r, CLE_VERDICT);
  if (v !== null && v.trim() !== '') {
    if (MOTS_REJETE.test(v)) return false;
    if (MOTS_ACCEPTE.test(v)) return true;
  }
  return null;
}

function aDemarre(r: unknown): boolean | null {
  const b = champBooleen(r, CLE_DEMARRE);
  if (b !== null) return b;
  const s = champChaine(r, CLE_DEMARRE);
  if (s !== null) return /^(ok|up|started|running|success|true|yes)$/i.test(s.trim());
  return null;
}

function nomControle(r: unknown): string {
  const s = champChaine(r, CLE_CONTROLE);
  if (s !== null && s.trim() !== '') return s.trim();
  const v = champ(r, CLE_CONTROLE);
  if (Array.isArray(v)) {
    const noms = v
      .map((e) => (typeof e === 'string' ? e : champChaine(e, /^(name|nom|id|control|controle)$/i)))
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '');
    if (noms.length === 1) return noms[0].trim();
    if (noms.length > 1) return `AMBIGU[${noms.join('|')}]`;
  }
  return 'AUCUN-CONTROLE-NOMME';
}

/**
 * La FAUTE que ce nom designe, ou `AUCUNE` / `AMBIGU`. C'est la projection qui
 * rend « detecte par son controle NOMME » (L241) observable : un controle
 * appele `garde-de-capacite` nomme la faute `surbooking` ; un controle appele
 * `controle-1` n'en nomme aucune.
 */
function fauteNommee(texte: string): string {
  const touchees = FAUTES.filter((f) => f.motif.test(texte)).map((f) => f.id);
  if (touchees.length === 1) return touchees[0];
  if (touchees.length === 0) return 'AUCUNE';
  return `AMBIGU[${touchees.join('+')}]`;
}

/* ─────────────────────────── scenarios soumis a qualification (III.4) */

interface Etape {
  step_id: string;
  at: string;
  operation: string;
  actor: string;
  slot: string;
  sequence: number;
  expect: { outcome: string };
}

interface Scenario {
  schema: string;
  scenario_id: string;
  tenant: string;
  business_clock: string;
  slots: { slot_id: string; capacity: number; starts_at: string }[];
  steps: Etape[];
}

/**
 * Le scenario COHERENT : il reproduit P1 de F-RESERVATION — A reserve et est
 * accepte, B demande le meme creneau de capacite 1 et est refuse (« demande
 * concurrente de B rejetee sans surbooking », L119) — puis P2, ou C entre en
 * attente derriere B (« B puis C en attente », ordre scelle par la racine).
 * Chaque issue attendue vient de la racine gelee ; aucune n'est ecrite a la
 * main.
 */
function scenarioCoherent(etiquette: string): Scenario {
  return {
    schema: 'bench.qualification.scenario/1',
    scenario_id: idScenario(etiquette),
    tenant: LOCATAIRE,
    business_clock: P1_H,
    slots: [{ slot_id: CRENEAU_ID, capacity: CAPACITE, starts_at: DEBUT }],
    steps: [
      {
        step_id: `${etiquette}-1`,
        at: P1_H,
        operation: 'reserve',
        actor: ACTEUR_A,
        slot: CRENEAU_ID,
        sequence: 1,
        expect: { outcome: ISSUE_ACCEPTEE },
      },
      {
        step_id: `${etiquette}-2`,
        at: P1_H,
        operation: 'reserve',
        actor: ACTEUR_B,
        slot: CRENEAU_ID,
        sequence: 2,
        expect: { outcome: ISSUE_REFUSEE },
      },
      {
        step_id: `${etiquette}-3`,
        at: P2_H,
        operation: 'reserve',
        actor: ACTEUR_C,
        slot: CRENEAU_ID,
        sequence: 3,
        expect: { outcome: ISSUE_REFUSEE },
      },
    ],
  };
}

/**
 * CONTRADICTION 1 — la capacite. Le scenario pretend que la demande
 * concurrente de B sur un creneau de capacite 1 est ACCEPTEE. La racine gelee
 * dit l'inverse (`P1.etat_attendu.confirmees = 1`, `surbooking = false`) : le
 * scenario contredit le contrat, sans qu'aucune autre valeur ne bouge.
 */
function scenarioContradictoireCapacite(etiquette: string): Scenario {
  const s = scenarioCoherent(etiquette);
  s.steps[1].expect = { outcome: ISSUE_ACCEPTEE };
  return s;
}

/**
 * CONTRADICTION 2 — la frontiere des 24 h. Le scenario pretend que
 * l'annulation EXACTEMENT a la frontiere est REFUSEE. La racine gelee dit
 * `frontiere_incluse = true` et `clone_1_frontiere_exacte.verdict =
 * "annulation acceptee"` : c'est l'inverse.
 */
function scenarioContradictoireFrontiere(etiquette: string): Scenario {
  const s = scenarioCoherent(etiquette);
  s.steps.push({
    step_id: `${etiquette}-4`,
    at: FRONTIERE,
    operation: 'cancel',
    actor: PROBE_FRONTIERE_ACTEUR,
    slot: CRENEAU_ID,
    sequence: 4,
    expect: { outcome: ISSUE_REFUSEE },
  });
  return s;
}

/** La sentinelle portee par l'id d'un scenario — pour les deux absences. */
function sentinelleDe(s: Scenario): string {
  const m = /-([0-9a-f]{16})$/.exec(s.scenario_id);
  return m === null ? s.scenario_id : m[1];
}

/* ══════════════════════════════════════════════════════════════════ cas ═ */

describe('T10 — qualifier les oracles et detecter les tests defectueux', () => {
  /* ─────────────────────────────────────────────────────────────── A1 */
  test(
    'T10.A1 le temoin conforme est ACCEPTE par le pipeline de qualification',
    async () => {
      assertLoaded();
      assertContrat('qualifyWitness', 'listWitnesses');

      // (0) LA REFERENCE DIT BIEN CE QUE LE CAS SUPPOSE.
      expect([CAPACITE, P1_CONFIRMEES, P1_TITULAIRE, P1_SURBOOKING]).toEqual([
        1,
        1,
        ACTEUR_A,
        false,
      ]); // cahier:L119

      // (1) LE TEMOIN CONFORME, nomme par le catalogue de T09 et non par nous.
      const cat = await appeler('listWitnesses');
      assertPasDePlantage(cat, 'listWitnesses()');
      const entrees = Array.isArray(cat.valeur) ? (cat.valeur as unknown[]) : [];
      const conformes = entrees.filter((e) => champBooleen(e, /^(conforming|conforme)$/i) === true);
      expect(
        conformes.length === 1
          ? 'un-temoin-conforme'
          : `CATALOGUE-SANS-TEMOIN-CONFORME-UNIQUE ${String(conformes.length)} sur ` +
              `${String(entrees.length)} entrees : ${court(rendu(entrees), 600)}`,
      ).toBe('un-temoin-conforme');
      const nomConforme = champChaine(conformes[0], /^(name|nom|id|witness|temoin)$/i);
      expect(
        nomConforme !== null && nomConforme.trim() !== ''
          ? 'temoin-nomme'
          : `TEMOIN-CONFORME-SANS-NOM ${court(rendu(conformes[0]), 400)}`,
      ).toBe('temoin-nomme');

      // (2) LA QUALIFICATION, sur une base REELLE et VIDE fournie par la suite.
      const db = creerBase('a1');
      expect(nbLignes(db)).toBe(0);
      const r = await appeler('qualifyWitness', { witness: nomConforme, dsn: dsnFor(db) });
      assertPasDePlantage(r, `qualifyWitness(${String(nomConforme)})`);

      // (3) L'ASSERTION DU CAS : le verdict EXISTE et vaut ACCEPTE.
      const accepte = estAccepte(r.valeur);
      expect(
        accepte === true
          ? 'temoin-conforme-accepte'
          : accepte === null
            ? `VERDICT-ABSENT-OU-INDECIDABLE pour le temoin conforme ${String(nomConforme)} : ` +
              court(rendu(r.valeur), 700)
            : `TEMOIN-CONFORME-REJETE controle=${nomControle(r.valeur)} ` +
              `motif=${String(champChaine(r.valeur, CLE_MOTIF))} : ${court(rendu(r.valeur), 500)}`,
      ).toBe('temoin-conforme-accepte');

      // (4) LE PROGRAMME A DEMARRE (L243) — un temoin accepte sans avoir tourne
      //     serait une qualification sur papier.
      expect(
        aDemarre(r.valeur) === true
          ? 'programme-demarre'
          : `TEMOIN-NON-DEMARRE started=${rendu(aDemarre(r.valeur))} : ${court(rendu(r.valeur), 500)}`,
      ).toBe('programme-demarre'); // cahier:L243

      // (5) AUCUN CONTROLE NE L'A REJETE : le rapport d'un temoin accepte ne
      //     nomme pas de controle fautif.
      const ctrl = nomControle(r.valeur);
      expect(
        ctrl === 'AUCUN-CONTROLE-NOMME' || fauteNommee(ctrl) === 'AUCUNE'
          ? 'aucun-controle-fautif'
          : `TEMOIN-ACCEPTE-MAIS-CONTROLE-DE-FAUTE-NOMME ${ctrl} -> ${fauteNommee(ctrl)}`,
      ).toBe('aucun-controle-fautif');

      // (6) POSTGRESQL A REELLEMENT SERVI (L141) : la base fournie — ou une
      //     base derivee du meme run — porte des lignes.
      const ecrit = ecritureObservee(db);
      expect(
        ecrit.ok
          ? 'base-peuplee'
          : `AUCUNE-ECRITURE-POSTGRESQL sous le run ${RUN} : ${ecrit.detail}`,
      ).toBe('base-peuplee'); // cahier:L141
    },
    CASE_TIMEOUT_LOURD_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A2 */
  test(
    'T10.A2 les six mutants semantiques sont chacun REJETES par leur controle nomme',
    async () => {
      assertLoaded();
      assertContrat('qualifyWitness', 'listSemanticMutants', 'listWitnesses');

      // (0) LE REGISTRE DES MUTANTS COUVRE LES SIX FAUTES DE L241, SANS
      //     AMBIGUITE. La faute est lue dans les champs d'identite de l'entree,
      //     jamais dans une description libre.
      const reg = await appeler('listSemanticMutants');
      assertPasDePlantage(reg, 'listSemanticMutants()');
      const entrees = Array.isArray(reg.valeur) ? (reg.valeur as unknown[]) : [];
      expect(
        entrees.length >= NB_FAUTES
          ? 'registre-peuple'
          : `REGISTRE-DE-MUTANTS-TROP-COURT ${String(entrees.length)} entrees pour ` +
              `${String(NB_FAUTES)} fautes nommees : ${court(rendu(reg.valeur), 600)}`,
      ).toBe('registre-peuple'); // cahier:L241

      const identite = (e: unknown): string =>
        [
          champChaine(e, /^(fault|faute|kind|type|categorie|category)$/i),
          champChaine(e, /^(name|nom|id|mutant|witness|temoin)$/i),
        ]
          .filter((x): x is string => typeof x === 'string')
          .join(' ');

      const choisi = new Map<string, unknown>();
      const projection: string[] = [];
      for (const e of entrees) {
        const f = fauteNommee(identite(e));
        projection.push(`${court(identite(e), 60) || '<sans identite>'} -> ${f}`);
        if (FAUTES.some((x) => x.id === f) && !choisi.has(f)) choisi.set(f, e);
      }
      expect(
        FAUTES.map((f) => `${f.id}:${choisi.has(f.id) ? 'presente' : 'ABSENTE'}`),
      ).toEqual(FAUTES.map((f) => `${f.id}:presente`)); // cahier:L241

      // (1) CONTROLE POSITIF, DANS LE MEME CAS : le meme pipeline ACCEPTE le
      //     temoin conforme. Sans lui, un pipeline qui rejette tout rendrait
      //     les six refus ci-dessous verts sans rien prouver.
      const cat = await appeler('listWitnesses');
      assertPasDePlantage(cat, 'listWitnesses()');
      const catEntrees = Array.isArray(cat.valeur) ? (cat.valeur as unknown[]) : [];
      const conforme = catEntrees.find(
        (e) => champBooleen(e, /^(conforming|conforme)$/i) === true,
      );
      const nomConforme = champChaine(conforme, /^(name|nom|id|witness|temoin)$/i);
      expect(
        nomConforme !== null ? 'temoin-conforme-nomme' : 'CATALOGUE-SANS-TEMOIN-CONFORME',
      ).toBe('temoin-conforme-nomme');
      const dbPos = creerBase('a2pos');
      const rPos = await appeler('qualifyWitness', { witness: nomConforme, dsn: dsnFor(dbPos) });
      assertPasDePlantage(rPos, `qualifyWitness(${String(nomConforme)})`);
      expect(
        estAccepte(rPos.valeur) === true
          ? 'controle-positif-vert'
          : `CONTROLE-POSITIF-TOMBE le temoin conforme n'est pas accepte : ` +
              court(rendu(rPos.valeur), 600),
      ).toBe('controle-positif-vert');

      // (2) LES SIX MUTANTS, un par faute, chacun sur sa propre base.
      const observe: string[] = [];
      const attendu: string[] = [];
      const controles: string[] = [];
      const rapports: unknown[] = [];
      for (const f of FAUTES) {
        const e = choisi.get(f.id);
        const nom = champChaine(e, /^(name|nom|id|mutant|witness|temoin)$/i);
        if (nom === null) {
          observe.push(`${f.id} -> MUTANT-SANS-NOM ${court(rendu(e), 120)}`);
          attendu.push(`${f.id} -> accepte=false demarre=true controle-nomme=${f.id}`);
          continue;
        }
        const db = creerBase(`a2_${f.id.replace(/[^a-z0-9]/g, '')}`.slice(0, 40));
        const r = await appeler('qualifyWitness', { witness: nom, dsn: dsnFor(db) });
        assertPasDePlantage(r, `qualifyWitness(${nom})`);
        rapports.push(r.valeur);
        const ctrl = nomControle(r.valeur);
        controles.push(ctrl);
        observe.push(
          `${f.id} -> accepte=${rendu(estAccepte(r.valeur))} ` +
            `demarre=${rendu(aDemarre(r.valeur))} controle-nomme=${fauteNommee(ctrl)}`,
        );
        attendu.push(`${f.id} -> accepte=false demarre=true controle-nomme=${f.id}`);
      }

      // L'ASSERTION DECISIVE, en une seule egalite de tableau : la faute non
      // detectee y apparait avec son verdict REEL. « Il ne suffit pas que le
      // mutant plante au build : le programme doit demarrer puis echouer sur la
      // propriete ciblee » (L243) — d'ou `demarre=true` a cote de
      // `accepte=false`, et un controle qui NOMME la faute injectee (L241).
      expect(observe).toEqual(attendu); // cahier:L241 cahier:L243

      // (3) SIX CONTROLES DISTINCTS : « chacun detecte par SON controle
      //     nomme ». Un controle unique qui rejetterait les six ne satisfait
      //     pas l'enonce.
      expect(
        new Set(controles).size === NB_FAUTES
          ? 'six-controles-distincts'
          : `CONTROLES-NON-DISTINCTS ${rendu(controles)}`,
      ).toBe('six-controles-distincts'); // cahier:L241

      // (4) LA MATRICE EST ENREGISTREE (L243) : relisible par le role dedie ou
      //     portee par les rapports, et elle nomme les six mutants.
      let matriceTexte = '';
      if (resolveOpt('qualificationMatrix') !== null) {
        const m = await appeler('qualificationMatrix');
        assertPasDePlantage(m, 'qualificationMatrix()');
        matriceTexte = rendu(m.valeur);
      } else {
        matriceTexte = rapports
          .map((r) => rendu(champ(r, /^(matrix|matrice|rows|lignes|cells)$/i)))
          .join(' ');
      }
      const nomsMutants = FAUTES.map((f) =>
        String(champChaine(choisi.get(f.id), /^(name|nom|id|mutant|witness|temoin)$/i)),
      );
      const absentsDeLaMatrice = nomsMutants.filter((n) => !matriceTexte.includes(n));
      expect(
        absentsDeLaMatrice.length === 0
          ? 'matrice-enregistree'
          : `MATRICE-INCOMPLETE mutants absents=[${absentsDeLaMatrice.join(', ')}] ` +
              `(ni qualificationMatrix() ni un champ matrix/rows des rapports ne les porte) : ` +
              court(matriceTexte, 500),
      ).toBe('matrice-enregistree'); // cahier:L243
    },
    CASE_TIMEOUT_LOURD_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A3 */
  test(
    'T10.A3 une assertion contradictoire au contrat met le scenario en QUARANTAINE',
    async () => {
      assertLoaded();
      assertContrat('qualifyScenario', 'listQuarantine');

      // (0) LA REFERENCE DIT BIEN CE QUE LA CONTRADICTION CONTREDIT.
      expect([CAPACITE, P1_CONFIRMEES, P1_SURBOOKING, P2_ORDRE_ATTENTE]).toEqual([
        1,
        1,
        false,
        [ACTEUR_B, ACTEUR_C],
      ]); // cahier:L119
      const coherent = scenarioCoherent('a3-coherent');
      const contradictoire = scenarioContradictoireCapacite('a3-contradictoire');
      // Les deux scenarios ne different QUE par l'issue attendue de l'etape 2 —
      // celle que la racine gelee dit REFUSEE et que le contradictoire pretend
      // ACCEPTEE. C'est la seule difference que la quarantaine peut avoir vue.
      expect([
        coherent.steps.map((e) => e.expect.outcome),
        contradictoire.steps.map((e) => e.expect.outcome),
      ]).toEqual([
        [ISSUE_ACCEPTEE, ISSUE_REFUSEE, ISSUE_REFUSEE],
        [ISSUE_ACCEPTEE, ISSUE_ACCEPTEE, ISSUE_REFUSEE],
      ]);

      // (1) CONTROLE POSITIF, DANS LE MEME CAS : le scenario COHERENT n'est PAS
      //     mis en quarantaine. Sans lui, un pipeline qui met tout en
      //     quarantaine rendrait ce cas vert sans rien prouver.
      const rCoherent = await appeler('qualifyScenario', coherent);
      assertPasDePlantage(rCoherent, 'qualifyScenario(coherent)');
      const quarCoherent =
        champBooleen(rCoherent.valeur, CLE_QUARANTAINE) ??
        (estAccepte(rCoherent.valeur) === null ? null : estAccepte(rCoherent.valeur) === false);
      expect(
        quarCoherent === false
          ? 'coherent-qualifie'
          : `SCENARIO-COHERENT-ECARTE quarantaine=${rendu(quarCoherent)} : ` +
              court(rendu(rCoherent.valeur), 600),
      ).toBe('coherent-qualifie');

      // (2) L'ASSERTION DECISIVE : le scenario CONTRADICTOIRE est ecarte.
      const rContra = await appeler('qualifyScenario', contradictoire);
      assertPasDePlantage(rContra, 'qualifyScenario(contradictoire)');
      const quarContra =
        champBooleen(rContra.valeur, CLE_QUARANTAINE) ??
        (estAccepte(rContra.valeur) === null ? null : estAccepte(rContra.valeur) === false);
      expect(
        quarContra === true
          ? 'contradictoire-en-quarantaine'
          : `CONTRADICTION-NON-DETECTEE quarantaine=${rendu(quarContra)} sur un scenario qui ` +
              `pretend la reservation concurrente ACCEPTEE alors que la capacite vaut ` +
              `${String(CAPACITE)} : ${court(rendu(rContra.valeur), 600)}`,
      ).toBe('contradictoire-en-quarantaine'); // cahier:L241

      // (3) LE MOTIF EST NOMME : une quarantaine muette ne dit pas ce qui a ete
      //     detecte, et L637 exige qu'un blocage identifie sa cause.
      const motif = champChaine(rContra.valeur, CLE_MOTIF) ?? '';
      expect(
        motif.trim() !== ''
          ? 'motif-present'
          : `QUARANTAINE-SANS-MOTIF ${court(rendu(rContra.valeur), 500)}`,
      ).toBe('motif-present');

      // (4) LA FILE DE QUARANTAINE (livrable L239) PORTE LE SCENARIO ECARTE ET
      //     LUI SEUL. Les deux assertions sont cherchees sur la serialisation
      //     COMPLETE de la file, par sentinelle de 16 hexadecimaux : elles ne
      //     dependent d'aucun format.
      const file = await appeler('listQuarantine');
      assertPasDePlantage(file, 'listQuarantine()');
      const texte = rendu(file.valeur);
      expect([
        texte.includes(sentinelleDe(contradictoire)) ? 'contradictoire-en-file' : 'CONTRADICTOIRE-ABSENT-DE-LA-FILE',
        texte.includes(sentinelleDe(coherent)) ? 'COHERENT-EN-FILE' : 'coherent-hors-file',
      ]).toEqual(['contradictoire-en-file', 'coherent-hors-file']); // cahier:L239
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A4 */
  test(
    'T10.A4 un evaluateur factice qui alterne succes et echec est reconnu INSTABLE',
    async () => {
      assertLoaded();
      assertContrat('detectInstability');

      /** Evaluateur factice : la suite COMPTE elle-meme ses appels (danger 4). */
      const factice = (suite: (i: number) => boolean): { evaluate: () => boolean; appels: () => number; vus: () => boolean[] } => {
        let n = 0;
        const vus: boolean[] = [];
        return {
          evaluate: (): boolean => {
            const v = suite(n);
            n += 1;
            vus.push(v);
            return v;
          },
          appels: (): number => n,
          vus: (): boolean[] => vus,
        };
      };

      // (1) L'EVALUATEUR ALTERNANT — celui que L241 nomme.
      const alternant = factice((i) => i % 2 === 0);
      const rAlt = await appeler('detectInstability', { evaluate: alternant.evaluate });
      assertPasDePlantage(rAlt, 'detectInstability(alternant)');

      // (1a) DIX REPETITIONS REELLEMENT EXECUTEES (L243). Le compteur est
      //      CELUI DE LA SUITE : un champ `repetitions: 10` ecrit sans rien
      //      repeter ne peut pas le satisfaire.
      expect(
        alternant.appels() === REPETITIONS_ATTENDUES
          ? 'dix-repetitions-executees'
          : `REPETITIONS-OBSERVEES=${String(alternant.appels())} attendu ` +
              `${String(REPETITIONS_ATTENDUES)} — sequence rendue ${rendu(alternant.vus())}`,
      ).toBe('dix-repetitions-executees'); // cahier:L243

      // (1b) LE RAPPORT CONCORDE avec ce que la suite a compte.
      const repDeclarees = champ(rAlt.valeur, CLE_REPETITIONS);
      expect(
        repDeclarees === undefined || repDeclarees === alternant.appels()
          ? 'repetitions-concordantes'
          : `REPETITIONS-DECLAREES=${rendu(repDeclarees)} mais ${String(alternant.appels())} ` +
              `appels observes`,
      ).toBe('repetitions-concordantes');

      /** Verdict d'instabilite : `true` INSTABLE, `false` STABLE, `null` absent. */
      const instable = (r: unknown): boolean | null => {
        const b = champBooleen(r, CLE_INSTABLE);
        if (b !== null) return b;
        const s = champBooleen(r, CLE_STABLE);
        if (s !== null) return !s;
        const v = champChaine(r, CLE_VERDICT);
        if (v !== null && v.trim() !== '') {
          if (/UNSTABLE|INSTABLE|FLAKY|NON.?DETERMIN/i.test(v)) return true;
          if (/STABLE|DETERMIN|QUALIF|ACCEPT|PASS/i.test(v)) return false;
        }
        return null;
      };

      // (1c) L'ASSERTION DECISIVE : l'alternant est ECARTE comme instable.
      expect(
        instable(rAlt.valeur) === true
          ? 'alternant-instable'
          : `INSTABILITE-NON-DETECTEE verdict=${rendu(instable(rAlt.valeur))} sur la sequence ` +
              `${rendu(alternant.vus())} : ${court(rendu(rAlt.valeur), 600)}`,
      ).toBe('alternant-instable'); // cahier:L241

      // (2) CONTROLES POSITIFS, DANS LE MEME CAS. L'instabilite est une
      //     propriete de VARIANCE, pas d'echec (convention III.6) : les deux
      //     evaluateurs CONSTANTS sont deterministes, donc STABLES. Sans eux,
      //     un detecteur qui declare tout instable — ou qui confond « a
      //     echoue » et « est instable » — rendrait (1c) vert sans rien
      //     prouver.
      const constantVrai = factice(() => true);
      const rVrai = await appeler('detectInstability', { evaluate: constantVrai.evaluate });
      assertPasDePlantage(rVrai, 'detectInstability(constant-succes)');
      const constantFaux = factice(() => false);
      const rFaux = await appeler('detectInstability', { evaluate: constantFaux.evaluate });
      assertPasDePlantage(rFaux, 'detectInstability(constant-echec)');

      expect([
        `succes-constant: appels=${String(constantVrai.appels())} instable=${rendu(instable(rVrai.valeur))}`,
        `echec-constant: appels=${String(constantFaux.appels())} instable=${rendu(instable(rFaux.valeur))}`,
      ]).toEqual([
        `succes-constant: appels=${String(REPETITIONS_ATTENDUES)} instable=false`,
        `echec-constant: appels=${String(REPETITIONS_ATTENDUES)} instable=false`,
      ]); // cahier:L243

      // (3) LES SEQUENCES OBSERVEES SONT BIEN CELLES QUE LA SUITE A FABRIQUEES :
      //     l'alternance a ete vue, et non deduite.
      expect([
        alternant.vus().filter((x) => x).length,
        alternant.vus().filter((x) => !x).length,
        constantVrai.vus().every((x) => x),
        constantFaux.vus().every((x) => !x),
      ]).toEqual([5, 5, true, true]);
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A5 */
  test(
    'T10.A5 aucun cas mis en quarantaine n entre dans un manifeste confirmatoire',
    async () => {
      assertLoaded();
      assertContrat('qualifyScenario', 'buildConfirmatoryManifest');

      // (1) UN LOT MIXTE : cinq scenarios coherents, deux contradictoires.
      const coherents = [1, 2, 3, 4, 5].map((i) => scenarioCoherent(`a5-coherent-${String(i)}`));
      // La seconde contradiction porte sur la frontiere des 24 h : la racine
      // gelee dit qu'elle est INCLUSE et que l'annulation y est acceptee ; le
      // scenario pretend l'inverse. On verifie d'abord que la racine dit bien
      // cela, faute de quoi c'est ELLE qui serait en cause.
      expect([Date.parse(DEBUT) - Date.parse(FRONTIERE), FRONTIERE_INCLUSE]).toEqual([
        DELAI_HEURES * 3_600_000,
        true,
      ]); // cahier:L119
      const ecartes = [
        scenarioContradictoireCapacite('a5-contra-capacite'),
        scenarioContradictoireFrontiere('a5-contra-frontiere'),
      ];
      const lot = [...coherents, ...ecartes];

      const rapports: unknown[] = [];
      for (const s of lot) {
        const r = await appeler('qualifyScenario', s);
        assertPasDePlantage(r, `qualifyScenario(${s.scenario_id})`);
        rapports.push(r.valeur);
      }

      // (2) LE LOT S'EST BIEN SCINDE EN CINQ QUALIFIES ET DEUX ECARTES. Sans
      //     cette observation, l'absence qui suit serait satisfaite par un
      //     pipeline qui ecarte TOUT.
      const estEcarte = (r: unknown): boolean | null =>
        champBooleen(r, CLE_QUARANTAINE) ??
        (estAccepte(r) === null ? null : estAccepte(r) === false);
      expect(rapports.map((r) => rendu(estEcarte(r)))).toEqual([
        'false',
        'false',
        'false',
        'false',
        'false',
        'true',
        'true',
      ]); // cahier:L241

      // (3) LE MANIFESTE CONFIRMATOIRE.
      const m = await appeler('buildConfirmatoryManifest', rapports);
      assertPasDePlantage(m, 'buildConfirmatoryManifest(rapports)');
      const texte = rendu(m.valeur);

      // (3a) EXPOSITION NON NULLE (L111) : les cinq scenarios QUALIFIES sont
      //      TOUS presents. C'est ce qui interdit le manifeste vide, qui
      //      satisferait l'absence sans rien prouver.
      expect(
        coherents.map((s) => `${s.scenario_id}:${texte.includes(sentinelleDe(s)) ? 'present' : 'ABSENT'}`),
      ).toEqual(coherents.map((s) => `${s.scenario_id}:present`)); // cahier:L111

      // (3b) L'ASSERTION D'ABSENCE : aucune trace des deux ecartes, nulle part
      //      dans la serialisation du manifeste — ni leur identifiant complet,
      //      ni leur sentinelle de 16 hexadecimaux.
      expect(
        ecartes.map(
          (s) =>
            `${s.scenario_id}:${
              texte.includes(sentinelleDe(s)) || texte.includes(s.scenario_id) ? 'PRESENT' : 'absent'
            }`,
        ),
      ).toEqual(ecartes.map((s) => `${s.scenario_id}:absent`)); // cahier:L241
    },
    CASE_TIMEOUT_MS,
  );

  /* ─────────────────────────────────────────────────────────────── A6 */
  test(
    'T10.A6 raisons et proportions d exclusion restent exportables',
    async () => {
      assertLoaded();
      assertContrat('qualifyScenario', 'exportExclusions');

      // (1) UN LOT DONT LA SUITE CONNAIT LA COMPOSITION : cinq coherents, trois
      //     contradictoires (deux de capacite, une de frontiere).
      const coherents = [1, 2, 3, 4, 5].map((i) => scenarioCoherent(`a6-coherent-${String(i)}`));
      const ecartes = [
        scenarioContradictoireCapacite('a6-contra-capacite-1'),
        scenarioContradictoireCapacite('a6-contra-capacite-2'),
        scenarioContradictoireFrontiere('a6-contra-frontiere'),
      ];
      const lot = [...coherents, ...ecartes];
      const TOTAL = lot.length;
      const EXCLUS = ecartes.length;

      const rapports: unknown[] = [];
      for (const s of lot) {
        const r = await appeler('qualifyScenario', s);
        assertPasDePlantage(r, `qualifyScenario(${s.scenario_id})`);
        rapports.push(r.valeur);
      }

      // (2) LE LOT S'EST BIEN SCINDE : cinq retenus, trois ecartes.
      const estEcarte = (r: unknown): boolean | null =>
        champBooleen(r, CLE_QUARANTAINE) ??
        (estAccepte(r) === null ? null : estAccepte(r) === false);
      expect([
        rapports.filter((r) => estEcarte(r) === false).length,
        rapports.filter((r) => estEcarte(r) === true).length,
      ]).toEqual([TOTAL - EXCLUS, EXCLUS]);

      // (3) L'EXPORT.
      const ex = await appeler('exportExclusions', rapports);
      assertPasDePlantage(ex, 'exportExclusions(rapports)');

      const brut = ex.valeur;
      const liste: unknown[] = Array.isArray(brut)
        ? brut
        : ((): unknown[] => {
            const v = champ(brut, /^(exclusions|reasons|raisons|motifs|entries|rows|items|par_raison)$/i);
            return Array.isArray(v) ? v : [];
          })();

      expect(
        liste.length > 0
          ? 'export-non-vide'
          : `EXPORT-D-EXCLUSIONS-VIDE ${court(rendu(brut), 700)}`,
      ).toBe('export-non-vide'); // cahier:L241

      // (4) CHAQUE ENTREE PORTE UNE RAISON NON VIDE ET UNE PROPORTION FINIE.
      const lus = liste.map((e) => ({
        raison: champChaine(e, CLE_MOTIF) ?? champChaine(e, /^(reason_code|code|label|etiquette)$/i) ?? '',
        compte: champ(e, /^(count|compte|n|nombre|cases|cas|total_cases)$/i),
        proportion: champ(e, /^(proportion|share|ratio|fraction|part|pourcentage|percent|rate)$/i),
      }));
      expect(
        lus.map(
          (l) =>
            `raison=${l.raison.trim() === '' ? 'VIDE' : 'presente'} ` +
            `compte=${Number.isInteger(l.compte) ? 'entier' : rendu(l.compte)} ` +
            `proportion=${typeof l.proportion === 'number' && Number.isFinite(l.proportion) ? 'finie' : rendu(l.proportion)}`,
        ),
      ).toEqual(lus.map(() => 'raison=presente compte=entier proportion=finie')); // cahier:L241

      // (5) LES COMPTES RENDENT EXACTEMENT LES TROIS EXCLUSIONS QUE LA SUITE A
      //     PROVOQUEES — ni les cinq retenus, ni un total invente.
      const sommeComptes = lus.reduce((n, l) => n + (typeof l.compte === 'number' ? l.compte : 0), 0);
      expect(
        sommeComptes === EXCLUS
          ? 'comptes-exacts'
          : `SOMME-DES-COMPTES=${String(sommeComptes)} attendu ${String(EXCLUS)} ` +
              `(lot de ${String(TOTAL)} scenarios) : ${court(rendu(brut), 500)}`,
      ).toBe('comptes-exacts');

      // (6) LES PROPORTIONS SONT DES RATIONNELS EXACTS DE CES COMPTES, SUR UN
      //     DENOMINATEUR COMMUN — le lot soumis, ou les seuls exclus. Verifie
      //     par le calcul, a 1e-12 pres (L143) : c'est ce qui distingue une
      //     proportion exportee d'un nombre decoratif.
      const denominateurs = [TOTAL, EXCLUS];
      const compatible = denominateurs.filter((d) =>
        lus.every(
          (l) =>
            typeof l.compte === 'number' &&
            typeof l.proportion === 'number' &&
            Math.abs(l.proportion - l.compte / d) <= 1e-12,
        ),
      );
      expect(
        compatible.length >= 1
          ? 'proportions-exactes'
          : `PROPORTIONS-INCOHERENTES aucun denominateur commun parmi ` +
              `[${denominateurs.join(', ')}] : ` +
              lus
                .map((l) => `${l.raison}=${rendu(l.compte)}/?=${rendu(l.proportion)}`)
                .join(' ; '),
      ).toBe('proportions-exactes'); // cahier:L143

      // (7) LES RAISONS NOMMENT CE QUI A ETE EXCLU : une raison qui ne designe
      //     ni la contradiction ni la quarantaine n'est pas une raison.
      const nomme = /contradic|incoheren|incohéren|assertion|contrat|contract|quarantain|quarantin|conflit|conflict|oracle/i;
      expect(
        lus.map((l) => (nomme.test(l.raison) ? 'raison-nommee' : `RAISON-MUETTE ${l.raison}`)),
      ).toEqual(lus.map(() => 'raison-nommee')); // cahier:L241
    },
    CASE_TIMEOUT_MS,
  );
});
