/**
 * acceptance/T74.spec.ts — suite d'acceptation de la tache T74.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T74.A1 behaviour — chaque attente d'une sequence ciblee cite une clause
 *                      active a la periode et presente dans `docs/spec.md`
 *   T74.A2 numeric   — a chaque periode, au moins dix flux differentiels d'au
 *                      moins mille operations chacun sont generes de facon
 *                      deterministe a partir d'une graine, et le score
 *                      differentiel est la fraction de flux sans divergence
 *   T74.A3 behaviour — chaque echec cible ou differentiel persiste porte
 *                      l'operation, l'attendu, la reponse recue et la clause
 *   T74.A4 behaviour — un candidat de reference qui implemente la source obtient
 *                      1 partout, et le meme candidat prive d'une clause obtient
 *                      moins de 1 sur cette clause et sur le score differentiel
 *                      d'au moins une periode ou elle est active
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 * T74 est une tache d'extension ; son `spec_source` epingle ADR-021 L198-204
 * (docs/specs/T74.md). Le contrat ci-dessous derive :
 *   - d'ADR-021 decision 3 (« Des controles qui departagent ») : sequences
 *     ciblees par clause ; « a chaque periode, de longs flux d'operations
 *     generes au hasard (plusieurs milliers d'operations, graine fixe) sont
 *     joues contre le candidat et le modele attendu. Le score est la fraction
 *     de flux sans divergence, et la premiere divergence est diagnostiquee avec
 *     sa clause » ; « chaque clause encore active est recontrolee a chaque
 *     periode » (regressions). Performance (P20+) et concurrence (P21+) sont
 *     T75 : cette suite ne les mesure pas ;
 *   - d'ADR-021 decision 5 : « resultat : score par clause (sequences ciblees
 *     et tests differentiels) » ;
 *   - d'ADR-019 decision 3, repris par T68 : « le critere, mecanique, est un
 *     candidat de reference prive de cette seule regle » ; et de la correction
 *     6dc3bb9 de T68 : les candidats sont des FIXTURES du test-author, la
 *     generation et la notation sont le livrable de l'implementation, la
 *     commande de lancement ne trahit pas la variante ;
 *   - d'ADR-020 decision 4 et d'acceptance/T69.spec.ts (A4) : un diagnostic
 *     porte l'operation, l'attendu et la reponse recue ; « persiste » = present
 *     dans les lignes de la base PostgreSQL (toutes les tables du schema
 *     `public`, JSON imbrique compris) ;
 *   - de la source de clauses EXPORTEE (role `platformClauses`, T70 III) et du
 *     generateur de documents de periode (role `platformPeriodDocs`, T73 II),
 *     lus par leurs exports ; l'auteur a lu packages/oracle/src/f-platform-*.ts
 *     (en lecture seule) pour connaitre le modele attendu (`createPlatformModel`,
 *     `apply(step)`, la forme d'une etape) ;
 *   - des racines gelees acceptance/reference-platform/F-PLATFORM-*.json
 *     (trajectoire principale et faits calcules a la main).
 * Aveuglement PROCEDURAL (ADR-001) : aucune implementation de T74 n'existait a
 * l'ecriture.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CONTRAT DE NOMMAGE ET D'APPEL — FIXE ICI (ADR-021 ne fixe aucun export ; les
 * noms suivent les conventions de T68 et de T73). Chaque role est cherche dans
 * `@bench/scenario` puis `@bench/activities` (les `source_paths` de T74), alias
 * dans l'ordre, premier exporte gagne. `n` designe une periode 1..24 ; chaque
 * appel recoit `{ period: n, periodIndex: n, periodId: 'Pn', seed, ... }`.
 *
 *   SEQUENCES CIBLEES (role `platformTargetedSequences`) :
 *     generatePlatformTargetedSequences | buildPlatformTargetedSequences |
 *     platformTargetedSequences | generateFPlatformTargetedSequences |
 *     generatePlatformClauseSequences.
 *     `f({period, seed})` -> sequence[] | { sequences }. Une sequence :
 *     `{ clause, steps }` ; `clause` est la clause qu'elle cible. Une etape est
 *     une etape du modele attendu `{ op, args, at, tenant?, actor?, version? }`
 *     et porte au plus une ATTENTE sous `expect` (alias expected, expectation,
 *     attendu) : un objet (ou un tableau d'objets) qui cite sa clause sous
 *     `clause` (alias clause_id, clauseId) ; le reste de l'attente est libre.
 *
 *   FLUX DIFFERENTIELS (role `platformDifferentialStreams`) :
 *     generatePlatformDifferentialStreams | buildPlatformDifferentialStreams |
 *     platformDifferentialStreams | generateFPlatformDifferentialStreams |
 *     generatePlatformRandomStreams.
 *     `f({period, seed})` -> flux[] | { streams } ; un flux : etape[] | { steps }.
 *     Sans autre option, au moins 10 flux d'au moins 1000 etapes (A2).
 *
 *   NOTATEUR CIBLE (role `scorePlatformTargeted`) :
 *     scorePlatformTargeted | scorePlatformClauses | scorePlatformTargetedSequences |
 *     scoreFPlatformTargeted.
 *     `f({period, seed, candidateCommand, benchDataDir, clause?, postgresDatabase?})`
 *     -> Promise<{ clauses, failures }>. Il joue les sequences de
 *     `platformTargetedSequences({period, seed})` (seulement celles de `clause`
 *     si elle est donnee) contre le candidat lance par `candidateCommand` et
 *     juge chaque attente. `clauses` : objet (ou tableau de `{clause, ...}`)
 *     clause -> `{ score, satisfied, total }`, score = satisfied / total sur les
 *     sequences qui ciblent la clause ; avec `clause`, au moins cette clause.
 *
 *   NOTATEUR DIFFERENTIEL (role `scorePlatformDifferential`) :
 *     scorePlatformDifferential | scorePlatformStreams |
 *     scorePlatformDifferentialStreams | scoreFPlatformDifferential.
 *     `f({period, seed, candidateCommand, benchDataDir, postgresDatabase?})`
 *     -> Promise<{ score, satisfied, total, failures }>. Il joue CHAQUE flux de
 *     `platformDifferentialStreams({period, seed})` contre un processus
 *     candidat NEUF dont BENCH_DATA_DIR est un repertoire VIDE propre a ce flux
 *     (sous `benchDataDir` ou ailleurs), et contre un modele attendu neuf.
 *     Un flux diverge des que la reponse du candidat differe de celle du
 *     modele (egalite JSON profonde, ordre des cles indifferent) ; total = nombre
 *     de flux, satisfied = flux sans divergence, score = satisfied / total.
 *
 *   ECHEC (A3) — chaque element de `failures` (alias divergences, diagnostics,
 *     echecs ; cherches a toute profondeur du resultat) porte, AU PREMIER NIVEAU :
 *     l'operation (`op` | `operation` | `request` | `step` : nom, ou objet
 *     `{op}`), l'attendu (`expected` | `expect` | `attendu` | `expectation`), la
 *     reponse recue TELLE QUE RECUE (`received` | `actual` | `got` | `observed` |
 *     `response` | `recu`) et la clause (`clause` | `clause_id` | `clauseId`). Un
 *     echec differentiel est la premiere divergence de son flux : `expected` y
 *     est la reponse ENTIERE du modele attendu, `received` celle du candidat.
 *     Un echec cible cite sous `clause` la clause de l'attente non satisfaite.
 *   PERSISTANCE (A3) — avec `postgresDatabase`, le resultat est persiste dans
 *     cette base (schema `public`, table et forme libres, JSON imbrique admis).
 *
 *   PROTOCOLE DU PROCESSUS CANDIDAT `bench.platform/1` (FIXE ICI ; le chemin
 *     F-LONG de T63/T68 en est le modele : argv, BENCH_DATA_DIR, NDJSON) :
 *     le notateur lance `candidateCommand` (argv) avec BENCH_DATA_DIR ; premiere
 *     ligne de stdout `{"ready":true,"protocol":"bench.platform/1"}` ; puis une
 *     requete JSON par ligne sur stdin, l'etape du modele plus `id` et `period`
 *     (`{id, period:'Pn', at, op, args, tenant?, actor?, version?}`) ; une
 *     reponse par requete, dans l'ordre : `{"id": <id>, "response": {ok, ...}}` ;
 *     l'etat survit au redemarrage du processus sur le meme BENCH_DATA_DIR.
 *
 *   MODELE ATTENDU (role `platformModel`, lu dans `@bench/oracle`) :
 *     createPlatformModel() -> { apply(step) } — seulement pour A3 (l'attendu de
 *     la divergence provoquee par la faute unique, III).
 *
 * ────────────────────────────────────────────────────────────────────── III
 * LE CANDIDAT DE REFERENCE (FIXTURE DU TEST-AUTHOR) ET POURQUOI CE N'EST PAS LE
 * MODELE ATTENDU LUI-MEME
 *
 *   acceptance/fixtures/candidates/f-platform-reference-candidate.mjs execute un
 *   INSTANTANE de la source de clauses : acceptance/fixtures/candidates/
 *   f-platform-reference/{f-platform-engine,f-platform-clauses}.mjs, produits
 *   par generer.mjs (meme repertoire) a partir de packages/oracle/src/
 *   f-platform-{engine,clauses}.ts LUS PAR GIT au commit epingle dans
 *   MANIFEST.json (3e8b664, HEAD de T73), transpiles (types effaces, rien
 *   d'autre). C'est le mecanisme FIXE ICI. L'instantane est COMMITTE avec la
 *   suite ; il n'importe pas @bench/oracle (la suite le verifie).
 *
 *   Ce n'est pas « le modele attendu lui-meme », au sens qui compte pour A4 :
 *     1. il est FIGE : le modele attendu que le notateur emploie est celui de
 *        packages/oracle a HEAD, que l'implementeur peut modifier ; tout ecart
 *        de comportement entre les deux rend la reference < 1 (A4 rougit). Un
 *        notateur ne peut donc pas obtenir 1 en faisant co-varier le candidat
 *        et l'attendu ;
 *     2. sa conformite a la source est etablie SANS le modele : A4 le rejoue
 *        d'abord, processus reel et redemarrage a chaque periode, sur toute la
 *        trajectoire principale des racines gelees, et exige chacun des faits
 *        calcules a la main (494 a l'ecriture) ;
 *     3. il s'execute en conditions reelles : processus distinct, protocole
 *        bench.platform/1, etat persiste dans BENCH_DATA_DIR (journal rejoue au
 *        demarrage), enveloppe v1/v2 telle qu'elle arrive sur le fil ;
 *     4. la PRIVATION est faite dans la fixture (BENCH_DROP_CLAUSE), jamais dans
 *        le modele ni dans le notateur : la clause retiree, si elle en remplace
 *        une, laisse la remplacee en vigueur (comme BENCH_DROP_RULE en T68) ;
 *     5. la commande ne trahit pas la variante : un lanceur au nom aleatoire,
 *        ecrit par cette suite, pose les variables puis importe la fixture.
 *   Ce qu'il N'EST PAS : une seconde implementation independante du CODE des
 *   clauses. A identite de code, « 1 partout » etalonne l'instrument (transport,
 *   serialisation, formes v1/v2, comparaison) ; la privation en mesure la
 *   sensibilite. Une reference derivee des seuls documents remis est l'objet
 *   de T77 (calibration).
 *
 *   Instrumentation de la fixture (suite seulement) : BENCH_TRAFFIC_LOG (une
 *   ligne par requete : repertoire d'etat, empreinte sha256 de la requete
 *   {at, op, args, tenant, actor, version} et de la reponse envoyee) et
 *   BENCH_FAULT_LOCK (faute unique : le premier repertoire d'etat qui prend le
 *   verrou voit sa toute premiere reponse inversee).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * DEFINITIONS (FIXEES ICI)
 *
 *   ACTIVITE — une clause est active a n si entree <= n < sortie (T70).
 *   PRESENTE DANS docs/spec.md — son texte normalise (NFC, blancs ramenes a une
 *     espace) est une sous-chaine de la spec normalisee rendue par
 *     `platformPeriodDocs(n)` (definition de T73 IV).
 *   OPERATIONS ACTIVES a n — celles que les racines gelees introduisent de P1 a
 *     n (`periodes.Pm.operations_introduites`, m <= n ; a P24, les noms v2). Une
 *     valeur TEXTE de `contract.operations` d'une clause active est le nom v2
 *     d'une operation (P24.R2) : pour le seuil par flux, nom v1 et nom v2 d'une
 *     meme operation comptent pour une.
 *   CHAMPS D'ENVELOPPE a n — les cles de `contract.enveloppe` des clauses actives
 *     (tenant a partir de P3, actor de P4, version de P24).
 *   COUVERTURE MINIMALE (A2) — sur les flux d'une periode : chaque operation
 *     active apparait (a P24 : sous son nom v1 ET sous son nom v2) ; chaque flux
 *     emploie au moins la moitie (arrondie au superieur) des operations actives ; chaque champ d'enveloppe prend au
 *     moins deux valeurs distinctes (deux locataires, deux acteurs, v1 et v2).
 *   DETERMINISME (A2) — deux appels a la meme graine rendent des flux
 *     identiques octet pour octet (JSON.stringify) ; a la graine voisine, aucun
 *     flux n'est identique a un flux de la premiere.
 *   FLUX JOUE (A2) — le journal de trafic de la fixture montre, pour chaque flux
 *     genere, un repertoire d'etat distinct qui a recu exactement ses etapes, dans
 *     l'ordre (empreintes egales).
 *   FRACTION (A2) — avec la faute unique, le notateur doit rendre exactement
 *     satisfied = total - 1 et score = (total - 1) / total.
 *   RECU AUTHENTIQUE (A3) — l'empreinte de la reponse recue d'un echec figure
 *     parmi les reponses que la fixture a reellement envoyees pendant ce notage,
 *     et l'attendu en differe.
 *   ECHANTILLON DE A4 (FIXE ICI, deterministe : une table) — une entree
 *     (clause, periode) par periode P1..P24 : la clause est active a la periode,
 *     en general y ENTRE (sinon : controle de regression d'une clause encore
 *     active) ; les familles de regles decision, erreur, calcul monetaire, ordre
 *     de file et contrat v2 y figurent toutes. Choix de la table : parmi les
 *     clauses entrant a la periode, une clause dont la privation est observable
 *     sans faire lever la source (etalonnage hors suite par flux aleatoires,
 *     10 x 1000 operations a l'entree de chaque clause) ; P12 n'a qu'une
 *     clause entrante, P12.R1, qui « precise sans en changer le sens » P11.R4
 *     (meme mise en oeuvre) : sa privation n'est pas observable, P12 est donc
 *     couverte par la regression de P6.R2. Voir ECHANTILLON_A4 ci-dessous.
 *   « < 1 SUR CETTE CLAUSE » — score cible de la clause, a la periode de son
 *     entree dans l'echantillon, notateur restreint a cette clause.
 *   « < 1 SUR LE DIFFERENTIEL D'UNE PERIODE OU ELLE EST ACTIVE » — on essaie la
 *     periode de l'entree, puis les autres periodes actives par ordre croissant ;
 *     la premiere < 1 suffit. Temoin a chaque fois : la reference a 1 a la meme
 *     (periode, graine) (sans lui, un lot qui fait echouer tout candidat
 *     passerait).
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CONTROLES NEGATIFS (sans eux un cas pourrait etre creux)
 *
 *   A1 : le predicat refuse une attente sans clause, une attente qui cite une
 *        clause inconnue, une clause inactive (sortie ou pas encore entree), une
 *        clause absente de la spec ; une periode sans aucune attente.
 *   A2 : le predicat refuse 9 flux, des flux de 999 operations, des flux de la
 *        seule operation `reserve`, un generateur non deterministe
 *        (Math.random), un generateur qui ignore la graine, un notateur qui
 *        rend 1 malgre la faute unique, un notateur qui note par operation.
 *   A3 : le predicat refuse un echec sans clause, sans operation, sans attendu,
 *        sans reponse recue, une reponse recue jamais envoyee par la fixture, un
 *        attendu egal au recu, un echec rendu mais jamais persiste.
 *   A4 : la reference doit noter 1 (un notateur constant 0, ou qui ne lance pas
 *        le candidat — trafic nul — rougit) ; le prive doit noter < 1 (un
 *        notateur constant 1 rougit).
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Que les sequences ciblees soient « ancrees sur les frontieres » de chaque
 *    clause : seul l'echantillon de A4 (24 clauses) le montre par privation.
 *  • Que la clause d'un echec differentiel soit LA bonne : A3 exige une clause
 *    de la source, active a la periode ; et, pour l'echec cible du prive, la
 *    clause privee parmi les clauses citees.
 *  • Performance et concurrence (T75), calibration sur les seuls documents (T77).
 *  • Elle ne lance aucun processus `claude`.
 *
 * DUREE — bornee par le notateur de l'implementation : 24 notations ciblees et
 * 24 differentielles de la reference (10 x 1000 operations au moins chacune),
 * 24 ciblees restreintes et au moins 24 differentielles des prives, 2 fautes
 * uniques (A2), et les 5 notations de A3. Aucun seuil de la carte n'est reduit.
 * Mesure contre une reference jetable hors depot (4 coeurs) : 7 min 42 s (A1 96 s,
 * A2 130 s, A3 7 s, A4 224 s). Sous la limite de 20 minutes : aucune reduction.
 *
 * DEFAUT CONSTATE DU MODELE ATTENDU (hors portee de T74, packages/oracle) : la
 * verification de rapprochement de P14 (`comptabilite.rapprochement`) leve
 * RAPPROCHEMENT-ROMPU des qu'un membre a un solde non nul a l'ouverture de sa
 * PREMIERE facture (mois anterieurs jamais emis, permis par Q19) ; ex. : top_up
 * 777 en juin, top_up 2500 en juillet, issue_invoices '2031-07' -> leve, alors
 * que 777 + 2500 = 3277. Le modele leve alors en cours d'operation. Un generateur
 * de flux doit en tenir compte tant que le proprietaire de la source ne l'a pas
 * corrige ; le candidat de reference (meme code) repond alors INTERNAL_ERROR.
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

const NOMBRE_DE_PERIODES = 24;
const GRAINE = 7474; // FIXE ICI (convention de T68 : 6868)
const GRAINE_VOISINE = 7475;
const MIN_FLUX = 10; // ADR-021 L202 : « au moins dix flux »
const MIN_OPERATIONS = 1000; // ADR-021 L202 : « d'au moins mille operations »
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
/** Une liste de defauts doit etre vide ; sinon le cas rougit en les nommant. */
function aucunDefaut(defauts: string[], sain: string): void {
  const n = defauts.length;
  exige(n === 0, sain, `${String(n)} DEFAUT(S) : ${defauts.slice(0, 40).join(' || ')}${n > 40 ? ' || …' : ''}`);
}

const estObjet = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);
const normaliser = (s: string): string => s.normalize('NFC').replace(/\s+/gu, ' ').trim();
const PERIODES = Array.from({ length: NOMBRE_DE_PERIODES }, (_, i) => i + 1);

/** JSON canonique : cles triees, champs `undefined` omis (meme definition que la fixture). */
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
const CHAMPS_DE_REQUETE = ['at', 'op', 'args', 'tenant', 'actor', 'version'] as const;
function corpsDe(step: unknown): Json {
  const out: Json = {};
  if (!estObjet(step)) return out;
  for (const k of CHAMPS_DE_REQUETE) if (step[k] !== undefined) out[k] = step[k];
  return out;
}

/** Egalite partielle des faits (T70 A2). */
function correspond(attendu: unknown, recu: unknown): boolean {
  if (Array.isArray(attendu)) {
    return Array.isArray(recu) && recu.length === attendu.length && attendu.every((a, i) => correspond(a, recu[i]));
  }
  if (attendu !== null && typeof attendu === 'object') {
    if (recu === null || typeof recu !== 'object' || Array.isArray(recu)) return false;
    return Object.entries(attendu as Json).every(([k, v]) => k in (recu as Json) && correspond(v, (recu as Json)[k]));
  }
  return Object.is(attendu, recu);
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
interface Fait {
  id: string;
  etape: string;
  attendu: Json;
}
const TRAJECTOIRE = new Map<number, EtapeGelee[]>();
const OPERATIONS_INTRODUITES = new Map<number, string[]>();
const FAITS_PAR_ETAPE = new Map<string, Fait[]>();
const DEFAUTS_RACINES: string[] = [];
for (const f of RACINES) {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
    for (const [p, e] of Object.entries((d.periodes ?? {}) as Json)) {
      const n = Number(/^P(\d+)$/.exec(p)?.[1] ?? NaN);
      if (!Number.isInteger(n) || !estObjet(e)) continue;
      TRAJECTOIRE.set(n, (e.trajectoire ?? []) as EtapeGelee[]);
      OPERATIONS_INTRODUITES.set(n, Array.isArray(e.operations_introduites) ? e.operations_introduites.map(String) : []);
      for (const x of (e.faits ?? []) as Fait[]) FAITS_PAR_ETAPE.set(x.etape, [...(FAITS_PAR_ETAPE.get(x.etape) ?? []), x]);
    }
  } catch (e) {
    DEFAUTS_RACINES.push(`RACINE-ILLISIBLE ${f} : ${rendu(e)}`);
  }
}
for (const n of PERIODES) if ((TRAJECTOIRE.get(n) ?? []).length === 0) DEFAUTS_RACINES.push(`RACINE-SANS-TRAJECTOIRE P${n}`);

/* ─────────────────────────────────────────── chargement des paquets */

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
  // Le chargement ne LEVE pas : chaque cas asserte lui-meme ce qui lui manque
  // (le rouge reste ASSERTION_FAILED, jamais SUITE_FAILED_TO_RUN).
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
  platformPeriodDocs: {
    alias: ['renderPlatformPeriodDocs', 'buildPlatformPeriodDocs', 'generatePlatformPeriodDocs', 'platformPeriodDocs', 'renderFPlatformPeriodDocs', 'buildFPlatformPeriodDocs', 'renderPlatformDocs', 'buildPlatformDocs'],
    paquets: ['scenario', 'activities'],
  },
  platformModel: {
    alias: ['createPlatformModel', 'createFPlatformModel', 'createExpectedPlatformModel'],
    paquets: ['oracle', 'scenario'],
  },
  platformTargetedSequences: {
    alias: ['generatePlatformTargetedSequences', 'buildPlatformTargetedSequences', 'platformTargetedSequences', 'generateFPlatformTargetedSequences', 'generatePlatformClauseSequences'],
    paquets: ['scenario', 'activities'],
  },
  platformDifferentialStreams: {
    alias: ['generatePlatformDifferentialStreams', 'buildPlatformDifferentialStreams', 'platformDifferentialStreams', 'generateFPlatformDifferentialStreams', 'generatePlatformRandomStreams'],
    paquets: ['scenario', 'activities'],
  },
  scorePlatformTargeted: {
    alias: ['scorePlatformTargeted', 'scorePlatformClauses', 'scorePlatformTargetedSequences', 'scoreFPlatformTargeted'],
    paquets: ['scenario', 'activities'],
  },
  scorePlatformDifferential: {
    alias: ['scorePlatformDifferential', 'scorePlatformStreams', 'scorePlatformDifferentialStreams', 'scoreFPlatformDifferential'],
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

/* ───────────────────────────────────────────── lecture des clauses (T70 III) */

type Clause = Json;
const A_ID = ['id', 'clause_id', 'clauseId'];
const A_ENTREE = ['enters', 'entry', 'entry_period', 'entryPeriod', 'from', 'since', 'introduced_in', 'introducedIn', 'periode_entree'];
const A_SORTIE = ['exits', 'exit', 'exit_period', 'exitPeriod', 'until', 'retired_in', 'retiredIn', 'periode_sortie'];
const A_TEXTE = ['text', 'statement', 'enonce', 'texte'];
const A_CONTRAT = ['contract', 'contract_fragment', 'contractFragment', 'fragment', 'contrat'];
const A_CLAUSE = ['clause', 'clause_id', 'clauseId'];

function lire(o: unknown, alias: readonly string[]): unknown {
  if (!estObjet(o)) return undefined;
  for (const a of alias) if (a in o && o[a] !== undefined) return o[a];
  return undefined;
}
function numeroPeriode(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const m = /^[Pp]?(\d{1,2})$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
}
const idDe = (c: Clause): string => String(lire(c, A_ID));
const texteDe = (c: Clause): string => {
  const t = lire(c, A_TEXTE);
  return typeof t === 'string' ? t : '';
};
const entreeDe = (c: Clause): number | null => numeroPeriode(lire(c, A_ENTREE));
function sortieDe(c: Clause): number | null {
  const v = lire(c, A_SORTIE);
  return v === null || v === undefined ? null : numeroPeriode(v);
}
function active(c: Clause, n: number): boolean {
  const e = entreeDe(c);
  if (e === null) return false;
  const s = sortieDe(c);
  return e <= n && (s === null || n < s);
}
const contratDe = (c: Clause): Json => {
  const v = lire(c, A_CONTRAT);
  return estObjet(v) ? v : {};
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

/**
 * Operations actives a n (IV) : celles que les racines gelees introduisent de P1 a n
 * (`operations_introduites`), noms v2 de P24 compris ; `alias` : nom v2 -> nom v1, lu
 * dans les clauses actives (valeur TEXTE de `contract.operations`, P24.R2).
 */
function operationsActives(clauses: Clause[], n: number): { ops: Set<string>; alias: Map<string, string> } {
  const ops = new Set<string>();
  for (let m = 1; m <= n; m += 1) for (const o of OPERATIONS_INTRODUITES.get(m) ?? []) ops.add(o);
  const alias = new Map<string, string>();
  for (const c of clauses) {
    if (!active(c, n)) continue;
    const o = contratDe(c).operations;
    if (!estObjet(o)) continue;
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string') alias.set(v, k);
  }
  return { ops, alias };
}
function champsEnveloppe(clauses: Clause[], n: number): string[] {
  const out = new Set<string>();
  for (const c of clauses) {
    if (!active(c, n)) continue;
    const e = contratDe(c).enveloppe;
    if (estObjet(e)) for (const k of Object.keys(e)) out.add(k);
  }
  return [...out].sort();
}

/* ───────────────────────────────────────── appels des roles (II) */

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

interface Sequence {
  clause: string;
  steps: Json[];
}
function sequencesDe(v: unknown): Sequence[] | null {
  const lot = Array.isArray(v) ? v : estObjet(v) && Array.isArray(v.sequences) ? v.sequences : null;
  if (lot === null) return null;
  return lot.map((s) => {
    const o = estObjet(s) ? s : {};
    const steps = Array.isArray(o.steps) ? o.steps : Array.isArray(o.etapes) ? o.etapes : [];
    return { clause: String(lire(o, A_CLAUSE) ?? ''), steps: steps.filter(estObjet) as Json[] };
  });
}
function fluxDe(v: unknown): Json[][] | null {
  const lot = Array.isArray(v) ? v : estObjet(v) && Array.isArray(v.streams) ? v.streams : null;
  if (lot === null) return null;
  return lot.map((s) => {
    const steps = Array.isArray(s) ? s : estObjet(s) && Array.isArray(s.steps) ? s.steps : [];
    return steps as Json[];
  });
}

/* ═══════════════════════ A1 — attentes des sequences ciblees */

const A_ATTENTE = ['expect', 'expected', 'expectation', 'attendu'];

function attentesDe(step: Json): unknown[] {
  const v = lire(step, A_ATTENTE);
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Defauts des attentes de la periode n (A1). `spec` : docs/spec.md normalise de n. */
function defautsAttentes(sequences: Sequence[], clauses: Clause[], n: number, spec: string): string[] {
  const out: string[] = [];
  const parId = new Map(clauses.map((c) => [idDe(c), c]));
  let nb = 0;
  sequences.forEach((s, i) => {
    let dansLaSequence = 0;
    s.steps.forEach((st, j) => {
      for (const a of attentesDe(st)) {
        nb += 1;
        dansLaSequence += 1;
        const ou = `P${n} sequence ${i} (${s.clause}) etape ${j} (${String(st.op)})`;
        const cl = estObjet(a) ? lire(a, A_CLAUSE) : undefined;
        if (typeof cl !== 'string' || cl === '') {
          out.push(`${ou} : attente sans clause ${court(rendu(a), 160)}`);
          continue;
        }
        const c = parId.get(cl);
        if (c === undefined) out.push(`${ou} : attente citant une clause inconnue ${cl}`);
        else if (!active(c, n)) out.push(`${ou} : attente citant la clause INACTIVE ${cl}`);
        else if (!spec.includes(normaliser(texteDe(c)))) out.push(`${ou} : attente citant ${cl}, absente de docs/spec.md`);
      }
    });
    if (dansLaSequence === 0) out.push(`P${n} sequence ${i} (${s.clause}) : aucune attente`);
  });
  if (sequences.length === 0 || nb === 0) out.push(`P${n} : aucune sequence ciblee ou aucune attente`);
  return out;
}

async function specNormalisee(n: number): Promise<{ spec: string; defaut: string }> {
  const f = resoudre('platformPeriodDocs');
  if (typeof f !== 'function') return { spec: '', defaut: contratManquant('platformPeriodDocs') };
  let d: unknown;
  try {
    d = await Promise.resolve((f as Fonction)(n));
  } catch (e) {
    return { spec: '', defaut: `GENERATEUR-DOCS-LEVE P${n} : ${rendu(e)}` };
  }
  let spec: unknown;
  if (d instanceof Map) spec = d.get('docs/spec.md') ?? d.get('spec');
  else if (Array.isArray(d)) spec = (d.find((x) => estObjet(x) && (x.path === 'docs/spec.md' || x.relPath === 'docs/spec.md')) as Json | undefined)?.content;
  else if (estObjet(d)) spec = d['docs/spec.md'] ?? d.spec ?? d.specMd;
  if (typeof spec !== 'string') return { spec: '', defaut: `GENERATEUR-DOCS-FORME P${n} : pas de docs/spec.md` };
  return { spec: normaliser(spec), defaut: '' };
}

/* ═══════════════════════ A2 — flux differentiels */

/** Forme, nombre, longueur et couverture des flux d'une periode (A2). */
function defautsFlux(flux: Json[][] | null, clauses: Clause[], n: number): string[] {
  const out: string[] = [];
  if (flux === null) return [`P${n} : resultat qui n'est pas une liste de flux`];
  if (flux.length < MIN_FLUX) out.push(`P${n} : ${flux.length} flux (< ${MIN_FLUX})`);
  const { ops, alias } = operationsActives(clauses, n);
  const enveloppe = champsEnveloppe(clauses, n);
  const vues = new Set<string>();
  const valeurs = new Map<string, Set<string>>(enveloppe.map((k) => [k, new Set<string>()]));
  const canoniques = new Set([...ops].map((o) => alias.get(o) ?? o));
  const moitie = Math.ceil(canoniques.size / 2);
  flux.forEach((f, i) => {
    if (f.length < MIN_OPERATIONS) out.push(`P${n} flux ${i} : ${f.length} operations (< ${MIN_OPERATIONS})`);
    const dansLeFlux = new Set<string>();
    let malFormees = 0;
    for (const s of f) {
      if (!estObjet(s) || typeof s.op !== 'string' || (s.args !== undefined && !estObjet(s.args))) {
        malFormees += 1;
        continue;
      }
      if (ops.has(s.op)) {
        vues.add(s.op);
        dansLeFlux.add(alias.get(s.op) ?? s.op);
      }
      for (const k of enveloppe) if (s[k] !== undefined) valeurs.get(k)?.add(canonique(s[k]));
    }
    if (malFormees > 0) out.push(`P${n} flux ${i} : ${malFormees} etape(s) sans op texte ou aux args non objet`);
    if (dansLeFlux.size < moitie) out.push(`P${n} flux ${i} : ${dansLeFlux.size} operation(s) active(s) employee(s) (< ${moitie} sur ${canoniques.size}, nom v1 et nom v2 confondus)`);
  });
  const manquantes = [...ops].filter((o) => !vues.has(o));
  if (manquantes.length > 0) out.push(`P${n} : operations actives jamais employees par les flux : ${manquantes.join(', ')}`);
  for (const [k, v] of valeurs) if (v.size < 2) out.push(`P${n} : champ d'enveloppe ${k} : ${v.size} valeur(s) distincte(s) (< 2)`);
  return out;
}

/** Determinisme (A2) : meme graine -> memes octets ; graine voisine -> aucun flux identique. */
function defautsDeterminisme(a: Json[][] | null, b: Json[][] | null, autre: Json[][] | null, n: number): string[] {
  const out: string[] = [];
  if (a === null || b === null || autre === null) return [`P${n} : flux illisibles pour le determinisme`];
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`P${n} : deux appels a la graine ${GRAINE} rendent des flux differents`);
  const deA = new Set(a.map((f) => JSON.stringify(f)));
  const identiques = autre.filter((f) => deA.has(JSON.stringify(f))).length;
  if (identiques > 0) out.push(`P${n} : ${identiques} flux de la graine ${GRAINE_VOISINE} identique(s) a un flux de la graine ${GRAINE}`);
  return out;
}

/* ═══════════════════════ candidat de reference (III) */

const FIXTURE = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-platform-reference-candidate.mjs');
const INSTANTANE = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'f-platform-reference');
const RACINE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't74-'));

/** L'instantane est celui du MANIFEST, et ni lui ni la fixture n'importent @bench/*. */
function defautsInstantane(): string[] {
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
      const c = fs.readFileSync(path.join(INSTANTANE, f));
      if (createHash('sha256').update(c).digest('hex') !== h) out.push(`INSTANTANE ALTERE : ${f}`);
    } catch {
      out.push(`INSTANTANE ABSENT : ${f}`);
    }
  }
  for (const f of [FIXTURE, ...Object.keys(fichiers).map((x) => path.join(INSTANTANE, x))]) {
    try {
      if (/from\s+['"]@bench\/|import\(\s*['"]@bench\/|packages\/oracle/u.test(fs.readFileSync(f, 'utf8').replace(/^\/\/.*$/gmu, ''))) {
        out.push(`${path.relative(REPO, f)} importe un paquet de l'implementation`);
      }
    } catch {
      out.push(`ABSENT : ${path.relative(REPO, f)}`);
    }
  }
  return out;
}

/** Rejoue la trajectoire principale (un processus par periode, meme BENCH_DATA_DIR) et compare aux faits gelés. */
async function defautsFaitsDeLaReference(): Promise<string[]> {
  const dir = fs.mkdtempSync(path.join(RACINE_TMP, 'faits-'));
  const out: string[] = [];
  let nb = 0;
  for (const n of PERIODES) {
    const lot = TRAJECTOIRE.get(n) ?? [];
    const r = await dialoguer(['node', FIXTURE], { BENCH_DATA_DIR: dir }, lot.map((s) => ({ ...s })));
    if (r.defaut !== '') {
      out.push(`P${n} : ${r.defaut}`);
      break;
    }
    lot.forEach((s, i) => {
      for (const f of FAITS_PAR_ETAPE.get(s.id) ?? []) {
        nb += 1;
        if (!correspond(f.attendu, r.reponses[i])) out.push(`${f.id} : attendu ${court(rendu(f.attendu), 200)} ; recu ${court(rendu(r.reponses[i]), 200)}`);
      }
    });
  }
  if (nb === 0 && out.length === 0) out.push('aucun fait compare');
  return out;
}

/** Dialogue bench.platform/1 avec un processus neuf ; rend les reponses dans l'ordre. */
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

interface Lancement {
  candidateCommand: string[];
  benchDataDir: string;
  journal: string;
}

/** Lanceur au nom aleatoire : fidele, prive et fautif ont des commandes de meme forme (III.5). */
function preparerLancement(drop: string | null, faute = false): Lancement {
  const dossier = fs.mkdtempSync(path.join(RACINE_TMP, 'run-'));
  const journal = path.join(dossier, 'traffic.ndjson');
  const lanceur = path.join(dossier, `candidate-${randomBytes(6).toString('hex')}.mjs`);
  const benchDataDir = fs.mkdtempSync(path.join(RACINE_TMP, 'data-'));
  fs.writeFileSync(
    lanceur,
    [
      `process.env.BENCH_DROP_CLAUSE = ${JSON.stringify(drop ?? '')};`,
      `process.env.BENCH_TRAFFIC_LOG = ${JSON.stringify(journal)};`,
      `process.env.BENCH_FAULT_LOCK = ${JSON.stringify(faute ? path.join(dossier, 'faute') : '')};`,
      `await import(${JSON.stringify(pathToFileURL(FIXTURE).href)});`,
      '',
    ].join('\n'),
  );
  return { candidateCommand: ['node', lanceur], benchDataDir, journal };
}

interface Trafic {
  total: number;
  parDossier: Map<string, { req: string[]; resp: string[] }>;
  reponses: Set<string>;
}
function lireTrafic(l: Lancement): Trafic {
  const out: Trafic = { total: 0, parDossier: new Map(), reponses: new Set() };
  if (!fs.existsSync(l.journal)) return out;
  for (const ligne of fs.readFileSync(l.journal, 'utf8').split('\n')) {
    if (ligne.trim() === '') continue;
    let e: Json;
    try {
      e = JSON.parse(ligne) as Json;
    } catch {
      continue;
    }
    out.total += 1;
    const d = String(e.data_dir);
    if (!out.parDossier.has(d)) out.parDossier.set(d, { req: [], resp: [] });
    out.parDossier.get(d)?.req.push(String(e.req));
    out.parDossier.get(d)?.resp.push(String(e.resp));
    out.reponses.add(String(e.resp));
  }
  return out;
}

/* ═══════════════════════ notations */

interface ScoreClause {
  score: number;
  satisfied: number | null;
  total: number | null;
}
function scoreDe(v: unknown): ScoreClause | null {
  if (typeof v === 'number') return { score: v, satisfied: null, total: null };
  if (!estObjet(v)) return null;
  const score = v.score ?? v.fraction ?? v.ratio;
  const satisfied = v.satisfied ?? v.passed ?? v.satisfiedCount;
  const total = v.total ?? v.count;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return { score, satisfied: typeof satisfied === 'number' ? satisfied : null, total: typeof total === 'number' ? total : null };
}
function scoresParClause(r: unknown): Map<string, ScoreClause> {
  const out = new Map<string, ScoreClause>();
  if (!estObjet(r)) return out;
  const v = r.clauses ?? r.scores ?? r.byClause ?? r.par_clause;
  if (Array.isArray(v)) {
    for (const e of v) {
      const id = estObjet(e) ? lire(e, A_CLAUSE) : undefined;
      const s = scoreDe(e);
      if (typeof id === 'string' && s !== null) out.set(id, s);
    }
  } else if (estObjet(v)) {
    for (const [k, e] of Object.entries(v)) {
      const s = scoreDe(e);
      if (s !== null) out.set(k, s);
    }
  }
  return out;
}

interface Notation {
  resultat: unknown;
  defaut: string;
  trafic: Trafic;
  lancement: Lancement;
}

async function noter(role: 'scorePlatformTargeted' | 'scorePlatformDifferential', n: number, opts: { drop?: string | null; clause?: string; faute?: boolean; postgresDatabase?: string }): Promise<Notation> {
  const lancement = preparerLancement(opts.drop ?? null, opts.faute === true);
  const extra: Json = { seed: GRAINE, candidateCommand: lancement.candidateCommand, benchDataDir: lancement.benchDataDir };
  if (opts.clause !== undefined) extra.clause = opts.clause;
  if (opts.postgresDatabase !== undefined) extra.postgresDatabase = opts.postgresDatabase;
  const r = await appeler(role, argsPeriode(n, extra));
  return { resultat: r.valeur, defaut: r.defaut, trafic: lireTrafic(lancement), lancement };
}

const REFERENCE_CIBLEE = new Map<number, Promise<Notation>>();
const REFERENCE_DIFFERENTIELLE = new Map<number, Promise<Notation>>();
function referenceCiblee(n: number): Promise<Notation> {
  let p = REFERENCE_CIBLEE.get(n);
  if (p === undefined) {
    p = noter('scorePlatformTargeted', n, {});
    REFERENCE_CIBLEE.set(n, p);
  }
  return p;
}
function referenceDifferentielle(n: number): Promise<Notation> {
  let p = REFERENCE_DIFFERENTIELLE.get(n);
  if (p === undefined) {
    p = noter('scorePlatformDifferential', n, {});
    REFERENCE_DIFFERENTIELLE.set(n, p);
  }
  return p;
}

/** Defauts d'une notation differentielle de la reference a n (A2, A4). */
function defautsReferenceDifferentielle(no: Notation, flux: Json[][] | null, n: number): string[] {
  const out: string[] = [];
  if (no.defaut !== '') return [`P${n} : ${no.defaut}`];
  const s = scoreDe(no.resultat);
  if (s === null) return [`P${n} : resultat differentiel sans score ${court(rendu(no.resultat), 300)}`];
  if (s.score !== 1 || s.satisfied === null || s.satisfied !== s.total) out.push(`P${n} : reference notee ${rendu(s)} au differentiel (attendu 1, satisfied = total)`);
  if (flux !== null && s.total !== flux.length) out.push(`P${n} : total ${rendu(s.total)} != ${flux.length} flux generes a la meme graine`);
  if (s.total !== null && s.total < MIN_FLUX) out.push(`P${n} : total ${s.total} < ${MIN_FLUX}`);
  // FLUX JOUE (IV) : chaque flux genere a son repertoire d'etat, qui a recu exactement ses etapes.
  if (flux !== null) {
    const libres = [...no.trafic.parDossier.values()].map((d) => d.req.join(','));
    let joues = 0;
    for (const f of flux) {
      const cle = f.map((st) => empreinte(corpsDe(st))).join(',');
      const k = libres.indexOf(cle);
      if (k >= 0) {
        joues += 1;
        libres.splice(k, 1);
      }
    }
    if (joues < flux.length) {
      out.push(`P${n} : ${joues} flux sur ${flux.length} retrouves entiers, chacun dans son propre repertoire d'etat, dans le trafic de la reference (${no.trafic.parDossier.size} repertoire(s), ${no.trafic.total} requete(s))`);
    }
  }
  return out;
}

/** Defauts d'une notation ciblee de la reference a n (A4) : chaque clause active notee 1. */
function defautsReferenceCiblee(no: Notation, clauses: Clause[], n: number): string[] {
  if (no.defaut !== '') return [`P${n} : ${no.defaut}`];
  const out: string[] = [];
  const m = scoresParClause(no.resultat);
  if (no.trafic.total === 0) out.push(`P${n} : aucune requete recue par la reference (le notateur n'a pas lance le candidat)`);
  for (const c of clauses) {
    if (!active(c, n)) continue;
    const s = m.get(idDe(c));
    if (s === undefined) out.push(`P${n} ${idDe(c)} : clause active sans score cible`);
    else if (s.score !== 1 || s.total === null || !Number.isInteger(s.total) || s.total < 1 || s.satisfied !== s.total) {
      out.push(`P${n} ${idDe(c)} : reference notee ${rendu(s)} (attendu 1, total entier >= 1, satisfied = total)`);
    }
  }
  return out;
}

/* ═══════════════════════ A3 — diagnostics */

const A_OP = ['op', 'operation', 'request', 'step'];
const A_ATTENDU = ['expected', 'expect', 'attendu', 'expectation'];
const A_RECU = ['received', 'actual', 'got', 'observed', 'response', 'recu'];
const CLES_ECHECS = ['failures', 'divergences', 'diagnostics', 'echecs'];

function aUneCle(o: Json, alias: readonly string[]): boolean {
  return alias.some((a) => a in o && o[a] !== undefined);
}
function opDe(o: Json): string | null {
  const v = lire(o, A_OP);
  if (typeof v === 'string' && v !== '') return v;
  if (estObjet(v) && typeof v.op === 'string') return v.op;
  return null;
}
function echecsDe(r: unknown, profondeur = 0): Json[] {
  if (profondeur > 6 || r === null || typeof r !== 'object') return [];
  const out: Json[] = [];
  if (Array.isArray(r)) {
    for (const x of r) out.push(...echecsDe(x, profondeur + 1));
    return out;
  }
  for (const [k, v] of Object.entries(r as Json)) {
    if (CLES_ECHECS.includes(k) && Array.isArray(v)) out.push(...(v.filter(estObjet) as Json[]));
    else out.push(...echecsDe(v, profondeur + 1));
  }
  return out;
}
/** Le quadruplet compare entre rendu et persiste (ordre des cles indifferent). */
const quadruplet = (e: Json): string => canonique([opDe(e), lire(e, A_ATTENDU), lire(e, A_RECU), lire(e, A_CLAUSE)]);

/** Defauts d'un echec (A3). `envoyees` : empreintes des reponses envoyees par la fixture pendant ce notage. */
function defautsEchec(e: Json, ids: Set<string>, envoyees: Set<string> | null, ou: string): string[] {
  const out: string[] = [];
  if (opDe(e) === null) out.push(`${ou} : echec sans operation ${court(rendu(e), 200)}`);
  const att = lire(e, A_ATTENDU);
  const recu = lire(e, A_RECU);
  if (att === undefined || att === null) out.push(`${ou} : echec sans attendu`);
  if (recu === undefined) out.push(`${ou} : echec sans reponse recue`);
  const cl = lire(e, A_CLAUSE);
  if (typeof cl !== 'string' || !ids.has(cl)) out.push(`${ou} : echec sans clause de la source (${rendu(cl)})`);
  if (att !== undefined && recu !== undefined) {
    const attenduReponse = estObjet(att) ? (att.response ?? att.reponse ?? att) : att;
    if (canonique(attenduReponse) === canonique(recu) || canonique(att) === canonique(recu)) out.push(`${ou} : attendu egal a la reponse recue`);
  }
  if (envoyees !== null && recu !== undefined && !envoyees.has(empreinte(recu))) {
    out.push(`${ou} : reponse recue ${court(rendu(recu), 160)} jamais envoyee par le candidat`);
  }
  return out;
}

/* ─────────────────────────────────────────── PostgreSQL REEL (A3) */

const RUN = `t74_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;
function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

/* ═══════════════════════ ECHANTILLON DE A4 (IV) — FIXE ICI */

interface EntreeEchantillon {
  periode: number;
  clause: string;
  famille: 'decision' | 'erreur' | 'calcul monetaire' | 'ordre de file' | 'contrat v2';
  pourquoi: string;
}
const ECHANTILLON_A4: readonly EntreeEchantillon[] = [
  { periode: 1, clause: 'P1.R4', famille: 'decision', pourquoi: 'idempotence : un rejeu rend la reponse memorisee' },
  { periode: 2, clause: 'P2.R2', famille: 'ordre de file', pourquoi: 'promotion de la tete de file a l annulation' },
  { periode: 3, clause: 'P3.R2', famille: 'erreur', pourquoi: 'tenant inconnu -> NOT_FOUND avant tout autre controle' },
  { periode: 4, clause: 'P4.R4', famille: 'erreur', pourquoi: 'membre inconnu -> NOT_FOUND ; FORBIDDEN jamais memorise' },
  { periode: 5, clause: 'P5.R2', famille: 'decision', pourquoi: 'add_exception annule d office les reservations de l occurrence' },
  { periode: 6, clause: 'P6.R3', famille: 'ordre de file', pourquoi: 'admission tout ou rien des groupes, queue de file' },
  { periode: 7, clause: 'P7.R3', famille: 'calcul monetaire', pourquoi: 'montant avec remise de niveau, arrondi demi vers le haut' },
  { periode: 8, clause: 'P8.R2', famille: 'calcul monetaire', pourquoi: 'paiement credits puis carte' },
  { periode: 9, clause: 'P9.R4', famille: 'calcul monetaire', pourquoi: 'remboursement au palier, partage credits/carte' },
  { periode: 10, clause: 'P10.R1', famille: 'decision', pourquoi: 'absences : controles et effet de mark_no_show' },
  { periode: 11, clause: 'P11.R5', famille: 'decision', pourquoi: 'liberation des places numerotees, free_seats' },
  { periode: 12, clause: 'P6.R2', famille: 'erreur', pourquoi: 'REGRESSION a P12 (P12.R1 = P11.R4 en substance) : GROUP_TOO_LARGE' },
  { periode: 13, clause: 'P13.R2', famille: 'ordre de file', pourquoi: 'cloture : expiration de la file, debarquement en ordre inverse de confirmation' },
  { periode: 14, clause: 'P14.R4', famille: 'calcul monetaire', pourquoi: 'avoirs pour un remboursement d un mois facture' },
  { periode: 15, clause: 'P15.R4', famille: 'calcul monetaire', pourquoi: 'portefeuille multi-devises (credit converti)' },
  { periode: 16, clause: 'P16.R1', famille: 'decision', pourquoi: 'changement de prix retroactif' },
  { periode: 17, clause: 'P17.R1', famille: 'decision', pourquoi: 'fusion de locataires : controles et effet' },
  { periode: 18, clause: 'P18.R1', famille: 'decision', pourquoi: 'effacement RGPD : controles et pseudonyme' },
  { periode: 19, clause: 'P19.R3', famille: 'decision', pourquoi: 'rapport de revenus : filtres, tri, pagination' },
  { periode: 20, clause: 'P20.R1', famille: 'decision', pourquoi: 'import en lot traite comme reserve' },
  { periode: 21, clause: 'P21.R1', famille: 'erreur', pourquoi: 'IDEMPOTENCY_CONFLICT sur arguments differents' },
  { periode: 22, clause: 'P22.R1', famille: 'calcul monetaire', pourquoi: 'fin des remises par niveau' },
  { periode: 23, clause: 'P23.R3', famille: 'calcul monetaire', pourquoi: 'frais de transfert 10 %, minimum 100' },
  { periode: 24, clause: 'P24.R1', famille: 'contrat v2', pourquoi: 'champ version de l enveloppe, v1 par defaut' },
];
const FAMILLES = ['decision', 'erreur', 'calcul monetaire', 'ordre de file', 'contrat v2'];

/** A3 : deux privations de l'echantillon, notees avec persistance. */
const PRIVATIONS_A3 = ['P8.R2', 'P21.R1'];

/* ═════════════════════════════════════════════════════════════ les cas */

describe('T74 — controles cibles et tests differentiels (ADR-021 decision 3)', () => {
  it(
    'T74.A1 chaque attente d une sequence ciblee cite une clause active a la periode et presente dans docs/spec.md',
    async () => {
      const clauses = await source();

      // CONTROLES NEGATIFS (V) : le predicat refuse des attentes fautives.
      const sp7 = await specNormalisee(7);
      exige(sp7.defaut === '', 'generateur-de-documents-disponible', sp7.defaut);
      const sortie = clauses.find((c) => (sortieDe(c) ?? 99) <= 7) as Clause;
      const future = clauses.find((c) => (entreeDe(c) ?? 0) > 7) as Clause;
      const actif = clauses.find((c) => active(c, 7)) as Clause;
      const step = (expect: unknown): Json => ({ op: 'reserve', args: {}, at: '2031-03-10T09:00:00Z', expect });
      const temoins: string[] = [];
      const essais: [string, Sequence[], string][] = [
        ['attente sans clause', [{ clause: idDe(actif), steps: [step({ response: { ok: true } })] }], sp7.spec],
        ['clause inconnue', [{ clause: idDe(actif), steps: [step({ clause: 'P7.R99' })] }], sp7.spec],
        [`clause sortie ${idDe(sortie)}`, [{ clause: idDe(sortie), steps: [step({ clause: idDe(sortie) })] }], sp7.spec],
        [`clause future ${idDe(future)}`, [{ clause: idDe(future), steps: [step({ clause: idDe(future) })] }], sp7.spec],
        ['clause absente de la spec', [{ clause: idDe(actif), steps: [step({ clause: idDe(actif) })] }], sp7.spec.split(normaliser(texteDe(actif))).join(' ')],
        ['sequence sans attente', [{ clause: idDe(actif), steps: [{ op: 'reserve', args: {} }] }], sp7.spec],
        ['periode sans sequence', [], sp7.spec],
      ];
      for (const [nom, seqs, spec] of essais) if (defautsAttentes(seqs, clauses, 7, spec).length === 0) temoins.push(`${nom} passerait`);
      if (defautsAttentes([{ clause: idDe(actif), steps: [step({ clause: idDe(actif) })] }], clauses, 7, sp7.spec).length !== 0) {
        temoins.push('une attente correcte serait refusee');
      }
      aucunDefaut(temoins, 'predicat-A1-discriminant');

      fonction('platformTargetedSequences');
      const defauts: string[] = [];
      for (const n of PERIODES) {
        const sp = await specNormalisee(n);
        if (sp.defaut !== '') {
          defauts.push(sp.defaut);
          continue;
        }
        const r = await appeler('platformTargetedSequences', argsPeriode(n, { seed: GRAINE }));
        const seqs = sequencesDe(r.valeur);
        if (r.defaut !== '' || seqs === null) {
          defauts.push(`P${n} : ${r.defaut || `resultat qui n'est pas une liste de sequences ${court(rendu(r.valeur), 300)}`}`);
          continue;
        }
        defauts.push(...defautsAttentes(seqs, clauses, n, sp.spec));
      }
      aucunDefaut(defauts, 'chaque-attente-cite-une-clause-active-presente-dans-la-spec');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'T74.A2 a chaque periode, au moins dix flux differentiels d au moins mille operations sont generes de facon deterministe a partir d une graine, et le score differentiel est la fraction de flux sans divergence',
    async () => {
      const clauses = await source();

      // CONTROLES NEGATIFS (V) : le predicat refuse des flux paresseux.
      const temoins: string[] = [];
      const etape = (op: string, i: number): Json => ({ op, args: {}, at: `2031-03-0${(i % 9) + 1}T09:00:00Z`, tenant: `t${i % 2}`, actor: `m${i % 3}`, version: i % 2 === 0 ? 'v1' : 'v2' });
      const opsP = (n: number): string[] => [...operationsActives(clauses, n).ops];
      const plein = (n: number, nb: number, lg: number): Json[][] => Array.from({ length: nb }, (_, k) => Array.from({ length: lg }, (_, i) => etape(opsP(n)[(i + k) % opsP(n).length], i)));
      for (const n of [1, 12, 24]) {
        if (defautsFlux(plein(n, MIN_FLUX, MIN_OPERATIONS), clauses, n).length !== 0) temoins.push(`P${n} : des flux complets seraient refuses : ${defautsFlux(plein(n, MIN_FLUX, MIN_OPERATIONS), clauses, n).slice(0, 2).join(' | ')}`);
        if (defautsFlux(plein(n, MIN_FLUX - 1, MIN_OPERATIONS), clauses, n).length === 0) temoins.push(`P${n} : 9 flux passeraient`);
        if (defautsFlux(plein(n, MIN_FLUX, MIN_OPERATIONS - 1), clauses, n).length === 0) temoins.push(`P${n} : des flux de 999 operations passeraient`);
        const reserve = Array.from({ length: MIN_FLUX }, () => Array.from({ length: MIN_OPERATIONS }, (_, i) => etape('reserve', i)));
        if (defautsFlux(reserve, clauses, n).length === 0) temoins.push(`P${n} : des flux de la seule operation reserve passeraient`);
      }
      const hasard = (): Json[][] => [[{ op: 'reserve', args: { r: Math.random() } }]];
      if (defautsDeterminisme(hasard(), hasard(), hasard(), 1).length === 0) temoins.push('un generateur non deterministe passerait');
      const fixe = [[{ op: 'reserve', args: {} }]];
      if (defautsDeterminisme(fixe, fixe, fixe, 1).length === 0) temoins.push('un generateur qui ignore la graine passerait');
      aucunDefaut(temoins, 'predicats-A2-discriminants');

      // Generation : nombre, longueur, couverture, determinisme, a chaque periode.
      fonction('platformDifferentialStreams');
      const defauts: string[] = [];
      const fluxParPeriode = new Map<number, Json[][]>();
      for (const n of PERIODES) {
        const a = await appeler('platformDifferentialStreams', argsPeriode(n, { seed: GRAINE }));
        const b = await appeler('platformDifferentialStreams', argsPeriode(n, { seed: GRAINE }));
        const c = await appeler('platformDifferentialStreams', argsPeriode(n, { seed: GRAINE_VOISINE }));
        if (a.defaut !== '' || b.defaut !== '' || c.defaut !== '') {
          defauts.push(`P${n} : ${a.defaut || b.defaut || c.defaut}`);
          continue;
        }
        const fa = fluxDe(a.valeur);
        defauts.push(...defautsFlux(fa, clauses, n), ...defautsDeterminisme(fa, fluxDe(b.valeur), fluxDe(c.valeur), n));
        if (fa !== null) fluxParPeriode.set(n, fa);
      }
      aucunDefaut(defauts, 'flux-de-chaque-periode-nombreux-longs-couvrants-et-deterministes');

      // Score : la reference, a chaque periode, joue chaque flux et note 1.
      fonction('scorePlatformDifferential');
      const joues: string[] = [];
      for (const n of PERIODES) joues.push(...defautsReferenceDifferentielle(await referenceDifferentielle(n), fluxParPeriode.get(n) ?? null, n));
      aucunDefaut(joues, 'chaque-flux-joue-contre-la-reference-dans-son-propre-etat');

      // FRACTION (IV) : une faute unique dans un flux sur N -> exactement (N-1)/N.
      const fraction = (no: Notation, n: number): string[] => {
        if (no.defaut !== '') return [`P${n} faute unique : ${no.defaut}`];
        const s = scoreDe(no.resultat);
        const total = fluxParPeriode.get(n)?.length ?? -1;
        if (s === null) return [`P${n} faute unique : resultat sans score ${court(rendu(no.resultat), 300)}`];
        if (s.total !== total || s.satisfied !== total - 1 || Math.abs(s.score - (total - 1) / total) > 1e-12) {
          return [`P${n} faute unique : note ${rendu(s)}, attendu satisfied=${total - 1}, total=${total}, score=${total - 1}/${total}`];
        }
        return [];
      };
      const nTemoin = fluxParPeriode.get(1)?.length ?? MIN_FLUX;
      if (fraction({ resultat: { score: 1, satisfied: nTemoin, total: nTemoin }, defaut: '', trafic: lireTrafic({ candidateCommand: [], benchDataDir: '', journal: '' }), lancement: { candidateCommand: [], benchDataDir: '', journal: '' } }, 1).length === 0) {
        temoins.push('un notateur qui rend 1 malgre la faute passerait');
      }
      const parOp = 1 - 1 / (nTemoin * MIN_OPERATIONS);
      if (fraction({ resultat: { score: parOp, satisfied: nTemoin * MIN_OPERATIONS - 1, total: nTemoin * MIN_OPERATIONS }, defaut: '', trafic: lireTrafic({ candidateCommand: [], benchDataDir: '', journal: '' }), lancement: { candidateCommand: [], benchDataDir: '', journal: '' } }, 1).length === 0) {
        temoins.push('un notateur qui note par operation passerait');
      }
      aucunDefaut(temoins, 'predicat-de-fraction-discriminant');
      const fractions: string[] = [];
      for (const n of [1, 24]) fractions.push(...fraction(await noter('scorePlatformDifferential', n, { faute: true }), n));
      aucunDefaut(fractions, 'score-differentiel-egal-a-la-fraction-de-flux-sans-divergence');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'T74.A3 chaque echec cible ou differentiel persiste porte l operation, l attendu, la reponse recue et la clause',
    async () => {
      const clauses = await source();
      const ids = new Set(clauses.map(idDe));

      // CONTROLES NEGATIFS (V) : le predicat refuse des diagnostics incomplets.
      const envoye = { ok: false, error: 'NOT_FOUND' };
      const bon: Json = { op: 'reserve', expected: { ok: true, status: 'confirmed' }, received: envoye, clause: 'P1.R2' };
      const envoyees = new Set([empreinte(envoye)]);
      const temoins: string[] = [];
      if (defautsEchec(bon, ids, envoyees, 'temoin').length !== 0) temoins.push('un echec complet serait refuse');
      const sans = (k: string): Json => Object.fromEntries(Object.entries(bon).filter(([x]) => x !== k));
      for (const k of ['op', 'expected', 'received', 'clause']) if (defautsEchec(sans(k), ids, envoyees, 'temoin').length === 0) temoins.push(`un echec sans ${k} passerait`);
      if (defautsEchec({ ...bon, clause: 'P99.R1' }, ids, envoyees, 'temoin').length === 0) temoins.push('une clause inconnue passerait');
      if (defautsEchec({ ...bon, received: { ok: false, error: 'INVENTE' } }, ids, envoyees, 'temoin').length === 0) temoins.push('une reponse recue jamais envoyee passerait');
      if (defautsEchec({ ...bon, expected: envoye }, ids, envoyees, 'temoin').length === 0) temoins.push('un attendu egal au recu passerait');
      aucunDefaut(temoins, 'predicat-A3-discriminant');

      fonction('scorePlatformTargeted');
      fonction('scorePlatformDifferential');
      const modele = fonction('platformModel');
      const base = creerBase('a3');
      exige(base.erreur === '', 'postgresql-disponible', base.erreur);

      // Echecs provoques : prives (cibles et differentiels) et faute unique.
      const notations: { nom: string; no: Notation; type: 'cible' | 'differentiel'; clause?: string; n: number }[] = [];
      for (const id of PRIVATIONS_A3) {
        const e = ECHANTILLON_A4.find((x) => x.clause === id) as EntreeEchantillon;
        notations.push({ nom: `cible prive de ${id} P${e.periode}`, type: 'cible', clause: id, n: e.periode, no: await noter('scorePlatformTargeted', e.periode, { drop: id, clause: id, postgresDatabase: base.nom }) });
        notations.push({ nom: `differentiel prive de ${id} P${e.periode}`, type: 'differentiel', n: e.periode, no: await noter('scorePlatformDifferential', e.periode, { drop: id, postgresDatabase: base.nom }) });
      }
      const nFaute = 13;
      const faute = await noter('scorePlatformDifferential', nFaute, { faute: true, postgresDatabase: base.nom });
      notations.push({ nom: `faute unique P${nFaute}`, type: 'differentiel', n: nFaute, no: faute });

      const defauts: string[] = [];
      const rendus: Json[] = [];
      const parType = { cible: 0, differentiel: 0 };
      for (const x of notations) {
        if (x.no.defaut !== '') {
          defauts.push(`${x.nom} : ${x.no.defaut}`);
          continue;
        }
        const es = echecsDe(x.no.resultat);
        if (es.length === 0) defauts.push(`${x.nom} : aucun echec rendu (resultat ${court(rendu(x.no.resultat), 300)})`);
        parType[x.type] += es.length;
        es.forEach((e, i) => {
          defauts.push(...defautsEchec(e, ids, x.no.trafic.reponses, `${x.nom} echec ${i}`));
          const cl = lire(e, A_CLAUSE);
          const c = clauses.find((k) => idDe(k) === cl);
          if (c !== undefined && !active(c, x.n)) defauts.push(`${x.nom} echec ${i} : clause ${String(cl)} inactive a P${x.n}`);
          rendus.push(e);
        });
        if (x.type === 'cible' && x.clause !== undefined && !es.some((e) => lire(e, A_CLAUSE) === x.clause)) {
          defauts.push(`${x.nom} : aucun echec ne cite la clause privee ${x.clause} (clauses citees : ${rendu([...new Set(es.map((e) => lire(e, A_CLAUSE)))])})`);
        }
      }
      // La faute unique : l'echec porte l'etape fautive, l'attendu du modele et la reponse inversee.
      const fluxFaute = fluxDe((await appeler('platformDifferentialStreams', argsPeriode(nFaute, { seed: GRAINE }))).valeur) ?? [];
      const verrou = path.join(path.dirname(faute.lancement.journal), 'faute', 'data_dir');
      let dossierFautif = '';
      try {
        dossierFautif = fs.readFileSync(verrou, 'utf8');
      } catch {
        defauts.push(`faute unique P${nFaute} : aucun repertoire d'etat n'a pris le verrou (candidat jamais lance ?)`);
      }
      const premiere = faute.trafic.parDossier.get(dossierFautif)?.req[0];
      const etapeFautive = fluxFaute.map((f) => f[0]).find((s) => s !== undefined && empreinte(corpsDe(s)) === premiere);
      if (dossierFautif !== '' && etapeFautive === undefined) defauts.push(`faute unique P${nFaute} : la premiere requete du flux fautif n'ouvre aucun flux genere`);
      if (etapeFautive !== undefined) {
        const m = (modele as () => { apply: (s: Json) => unknown })();
        const attendu = JSON.parse(JSON.stringify(m.apply({ ...etapeFautive, period: (etapeFautive.period as string | undefined) ?? `P${nFaute}` }))) as Json;
        const recu = attendu.ok === true ? { ok: false, error: 'BENCH_FAULT' } : { ok: true };
        const es = echecsDe(faute.resultat);
        const juste = es.filter((e) => opDe(e) === etapeFautive.op && canonique(lire(e, A_RECU)) === canonique(recu) && canonique(lire(e, A_ATTENDU)) === canonique(attendu));
        if (juste.length !== 1) {
          defauts.push(`faute unique P${nFaute} : attendu UN echec {op: ${String(etapeFautive.op)}, expected: ${court(rendu(attendu), 160)}, received: ${rendu(recu)}} ; rendus : ${court(rendu(es), 600)}`);
        }
      }
      if (parType.cible === 0) defauts.push('aucun echec cible rendu');
      if (parType.differentiel === 0) defauts.push('aucun echec differentiel rendu');

      // PERSISTANCE : chaque echec rendu est en base ; chaque echec en base est complet.
      const lu = objetsPersistes(base.nom);
      if (lu.defaut !== '') defauts.push(`PostgreSQL : ${lu.defaut}`);
      const persistes = lu.objets.filter((o) => aUneCle(o, A_ATTENDU) && aUneCle(o, A_RECU) && !aUneCle(o, ['steps', 'sequences', 'streams']));
      const enBase = new Set(persistes.map(quadruplet));
      const absents = rendus.filter((e) => !enBase.has(quadruplet(e)));
      if (absents.length > 0) defauts.push(`${absents.length} echec(s) rendu(s) jamais persiste(s) a l'identique (op, attendu, recu, clause), ex. ${court(rendu(absents[0]), 300)} ; ${persistes.length} echec(s) en base`);
      persistes.forEach((e, i) => defauts.push(...defautsEchec(e, ids, null, `persiste ${i}`)));
      aucunDefaut(defauts, 'chaque-echec-persiste-porte-operation-attendu-recu-et-clause');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'T74.A4 un candidat de reference qui implemente la source obtient 1 partout, et le meme candidat prive d une clause obtient moins de 1 sur cette clause et sur le score differentiel d au moins une periode ou elle est active',
    async () => {
      const clauses = await source();
      const parId = new Map(clauses.map((c) => [idDe(c), c]));

      // L'echantillon (IV) : une entree par periode, clause active, toutes les familles.
      const ech: string[] = [];
      for (const n of PERIODES) if (ECHANTILLON_A4.filter((e) => e.periode === n).length !== 1) ech.push(`P${n} : pas exactement une entree`);
      for (const e of ECHANTILLON_A4) {
        const c = parId.get(e.clause);
        if (c === undefined || !active(c, e.periode)) ech.push(`${e.clause} inactive ou inconnue a P${e.periode}`);
      }
      for (const f of FAMILLES) if (!ECHANTILLON_A4.some((e) => e.famille === f)) ech.push(`famille ${f} absente`);
      aucunDefaut(ech, 'echantillon-A4-couvre-les-24-periodes-et-les-familles');

      // Le candidat de reference implemente la source, sans le modele (III.2).
      aucunDefaut(defautsInstantane(), 'instantane-de-la-source-integre-et-independant-des-paquets');
      aucunDefaut(await defautsFaitsDeLaReference(), 'reference-reproduit-chaque-fait-gele');

      // 1 partout : chaque clause active a chaque periode, et le differentiel.
      fonction('scorePlatformTargeted');
      fonction('scorePlatformDifferential');
      const defauts: string[] = [];
      for (const n of PERIODES) {
        defauts.push(...defautsReferenceCiblee(await referenceCiblee(n), clauses, n));
        defauts.push(...defautsReferenceDifferentielle(await referenceDifferentielle(n), null, n));
      }
      aucunDefaut(defauts, 'reference-notee-1-sur-chaque-clause-active-et-au-differentiel-a-chaque-periode');

      // Le meme candidat prive de chaque clause de l'echantillon.
      const prives: string[] = [];
      for (const e of ECHANTILLON_A4) {
        const c = parId.get(e.clause) as Clause;
        const cible = await noter('scorePlatformTargeted', e.periode, { drop: e.clause, clause: e.clause });
        const s = cible.defaut === '' ? scoresParClause(cible.resultat).get(e.clause) : undefined;
        if (cible.trafic.total === 0) prives.push(`${e.clause} P${e.periode} : aucune requete recue par le prive (cible)`);
        if (s === undefined) prives.push(`${e.clause} P${e.periode} : pas de score cible pour la clause privee (${cible.defaut || court(rendu(cible.resultat), 300)})`);
        else if (!(s.score < 1)) prives.push(`${e.clause} P${e.periode} [${e.famille}] : le prive est note ${rendu(s)} sur sa clause (attendu < 1)`);

        const essais = [e.periode, ...PERIODES.filter((n) => n !== e.periode && active(c, n))];
        let trouve = false;
        const vus: string[] = [];
        for (const n of essais) {
          const d = await noter('scorePlatformDifferential', n, { drop: e.clause });
          const sd = d.defaut === '' ? scoreDe(d.resultat) : null;
          vus.push(`P${n}=${sd === null ? d.defaut || 'sans score' : String(sd.score)}`);
          if (sd !== null && sd.score < 1 && d.trafic.total > 0) {
            trouve = true;
            break;
          }
        }
        if (!trouve) prives.push(`${e.clause} [${e.famille}] : differentiel du prive jamais < 1 sur ses periodes actives (${vus.join(', ')})`);
      }
      aucunDefaut(prives, 'le-prive-de-chaque-clause-de-l-echantillon-note-sous-1-cible-et-differentiel');
    },
    CASE_TIMEOUT_MS,
  );
});
