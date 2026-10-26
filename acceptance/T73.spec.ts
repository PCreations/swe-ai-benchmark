/**
 * acceptance/T73.spec.ts — suite d'acceptation de la tache T73.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T73.A1 behaviour — a chaque periode, `docs/spec.md` contient le texte de
 *                      chaque clause active et d'aucune clause inactive, et
 *                      `docs/api.md` contient chaque valeur comparee avec le
 *                      nom de son champ et au moins un exemple de chaque forme
 *                      de reponse comparee
 *   T73.A2 behaviour — `docs/tickets/Pnn.md` liste exactement les clauses
 *                      ajoutees, remplacees et retirees par rapport a la
 *                      periode precedente, avec des criteres d'acceptation
 *                      illustres d'exemples
 *   T73.A3 absence   — le prompt de la periode renvoie a ces trois fichiers et
 *                      ne contient le texte d'aucune clause
 *   T73.A4 behaviour — une modification par le candidat de l'un de ces trois
 *                      fichiers est remplacee a la periode suivante, et tout
 *                      autre fichier du depot est conserve
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * D'OU CETTE SUITE TIENT CE QU'ELLE OBSERVE
 *
 * T73 est une tache d'extension ; son `spec_source` epingle ADR-021 L190-196
 * (docs/specs/T73.md). Le contrat ci-dessous derive :
 *   - d'ADR-021 decision 4 (« Comme un vrai projet ») : a chaque periode, le
 *     moteur ecrit dans le depot du candidat, a partir de la source de
 *     clauses, `docs/spec.md` (specification consolidee), `docs/api.md`
 *     (contrat d'interface : operations, reponses, valeurs exactes, codes
 *     d'erreur, exemples) et `docs/tickets/Pnn.md` (ajoute, modifie, retire,
 *     criteres d'acceptation avec exemples) ; « le prompt est court [...] il
 *     renvoie au ticket, a la spec et au contrat. Le moteur reecrit ces trois
 *     emplacements a chaque periode ; le reste du depot (code, tests, notes)
 *     appartient au candidat » ;
 *   - d'ADR-021 decision 1 : la source unique de clauses (identifiant,
 *     periode d'entree, de sortie, remplacement, texte, fragment de contrat) ;
 *   - d'ADR-020 decisions 1 et 2 (reprises par A1 pour `docs/api.md`) : chaque
 *     valeur comparee citee avec le nom de son champ ; un exemple public de
 *     chaque forme de reponse comparee, succes et erreur, cles et types
 *     recursivement ; aucun exemple ne reproduit une valeur attendue ;
 *   - des racines gelees acceptance/reference-platform/F-PLATFORM-P1-P8.json,
 *     -P9-P16.json, -P17-P24.json : trajectoire principale et faits (ce que le
 *     notateur compare, periode par periode) ;
 *   - de la source de clauses EXPORTEE (role `platformClauses`, fixe par
 *     acceptance/T70.spec.ts III), lue en lecture seule ; l'auteur a lu
 *     packages/oracle/src/f-platform-*.ts pour connaitre la forme des clauses
 *     (`contract.exemples` : { requete: {op, args}, reponse }).
 *   - du chemin reel de materialisation d'une periode candidate :
 *     `bench run-period --provider claude-cli --live --candidate-workspace-root`
 *     (T49), `--scenario-id` (T45), le faux executable `claude`
 *     (acceptance/fixtures/claude-cli/bin/claude : enregistrement du prompt de
 *     chaque session, T55 ; module de derivation qui recoit `{prompt, cwd, fs,
 *     path}` et ecrit dans l'espace de travail, T55.A3). Pour comprendre
 *     comment ce chemin materialise l'espace du candidat (depot git sous la
 *     racine, derive de l'identite de campagne, repris d'une periode a
 *     l'autre, commis apres la session), l'auteur a lu, a la demande de
 *     l'orchestrateur, le code EXISTANT du pilote F-LONG
 *     (buildFLongPilotPrompt, run-period-claude-cli) — code anterieur a T73,
 *     qui n'en contient aucune mise en oeuvre. Aveuglement PROCEDURAL
 *     (ADR-001) : aucune implementation de T73 n'existait a l'ecriture.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CONTRAT DE NOMMAGE ET D'APPEL — FIXE ICI (ni ADR-021 ni l'entree T73 du
 * registre ne fixent d'exports ; ces noms suivent les conventions des roles de
 * T70 et de `buildFLongPilotPrompt(periodIndex)`).
 *
 *   SOURCE (role `platformClauses`) — repris A L'IDENTIQUE de T70 III, charge
 *     depuis `@bench/scenario` ou `@bench/oracle`.
 *
 *   GENERATEUR (role `platformPeriodDocs`) — charge depuis `@bench/scenario`
 *     ou `@bench/activities` (les `source_paths` de T73). Alias, premier
 *     exporte gagne : renderPlatformPeriodDocs, buildPlatformPeriodDocs,
 *     generatePlatformPeriodDocs, platformPeriodDocs, renderFPlatformPeriodDocs,
 *     buildFPlatformPeriodDocs, renderPlatformDocs, buildPlatformDocs.
 *     Appel : `f(periodIndex, options?)`, periodIndex entier 1..24, resultat
 *     eventuellement asynchrone. `options.clauses`, s'il est fourni, est la
 *     source de clauses a utiliser A LA PLACE de la source exportee (meme
 *     forme) : c'est ce qui prouve que les documents DERIVENT de la source et
 *     ne sont pas ecrits a la main (A1 et A2 l'exercent sur une source
 *     fabriquee). Resultat, au choix :
 *       - un objet (ou une Map) indexe par chemin relatif : 'docs/spec.md',
 *         'docs/api.md', 'docs/tickets/Pnn.md' (nn sur DEUX chiffres : P01..P24)
 *         -> contenu texte ;
 *       - un tableau de { path | relPath, content } aux memes chemins ;
 *       - un objet { spec, api, ticket } (alias specMd/apiMd/ticketMd).
 *     Le contenu est du Markdown UTF-8, deterministe pour une periode et une
 *     source donnees.
 *
 *   MATERIALISATION (A3, A4) — `bench run-period --mode recorded --provider
 *     claude-cli --live --model <m> --scenario-id F-PLATFORM
 *     --candidate-workspace-root <racine> --campaign-id <c>
 *     --postgres-database <db> --s3-bucket <b>`, appele 24 fois de suite sur la
 *     meme campagne (une periode par appel, comme pour F-LONG). Avant la
 *     session de la periode n, l'espace du candidat porte `docs/spec.md`,
 *     `docs/api.md` et `docs/tickets/Pnn.md` IDENTIQUES octet pour octet a ce
 *     que rend le generateur pour n ; le prompt passe a `claude -p` est celui
 *     de la periode. L'identifiant de scenario `F-PLATFORM` est FIXE ICI
 *     (convention de `F-LONG`).
 *
 * ────────────────────────────────────────────────────────────────────── III
 * CE QUE CHAQUE CAS CALCULE LUI-MEME (jamais en relisant le generateur)
 *
 *   ACTIVITE — une clause est active a n si entree <= n < sortie (T70).
 *   DIFFERENCE de n avec n-1 (n = 1 : avec l'ensemble vide) :
 *     ajoutees    = entrent a n sans rien remplacer ;
 *     remplacantes = entrent a n en remplacant une clause ; remplacees = celles
 *                   qu'elles remplacent ;
 *     retirees    = actives a n-1, inactives a n, et remplacees par aucune
 *                   clause entrant a n. (La source reelle n'en a aucune :
 *                   toute sortie y est un remplacement. A2 fabrique donc une
 *                   source ou une clause sort sans remplacante.)
 *   VALEURS COMPAREES a n — pour chaque fait de la periode n (racine gelee),
 *     chaque feuille texte de `attendu` portee par un champ `error` ou `code`
 *     (codes d'erreur), par un champ dont une clause active a n declare
 *     l'unite « enumeration » (status, role, tier, reason...), ou par un champ
 *     qu'aucune clause ne declare et dont la valeur est un mot en minuscules
 *     (type, kind) : le couple (champ, valeur).
 *   FORMES COMPAREES a n — pour chaque fait de la periode n : l'operation de
 *     son etape et son `attendu` (les faits comparent un sous-ensemble de
 *     champs : conventions.forme_des_reponses.comparaison des racines).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * DEFINITIONS DE LECTURE (FIXEES ICI)
 *
 *   TEXTE NORMALISE : NFC, toute suite de blancs ramenee a une espace. « Le
 *     document contient le texte d'une clause » : son texte normalise est une
 *     sous-chaine du document normalise (le generateur ne doit donc ni
 *     echapper ni couper le texte).
 *   VALEUR CITEE AVEC SON CHAMP (ADR-020, definition de T69 II.2) : la valeur
 *     entre guillemets ou accents graves, precedee SUR LA MEME LIGNE, a moins
 *     de 120 caracteres, du nom du champ comme identifiant entier. Pour un code
 *     d'erreur, le champ `error` ou `code` convient.
 *   EXEMPLE : dans un bloc de code clos (``` ou ~~~), un JSON (le bloc entier,
 *     ou chacune de ses lignes) portant un objet { requete|request:
 *     {op, args?}, reponse|response: {ok, ...} } (la forme de
 *     `contract.exemples` de la source), ou une requete {op, ...}
 *     immediatement suivie d'une reponse {ok, ...} dans le meme bloc.
 *   EXEMPLE D'UNE FORME : meme operation ; la reponse porte chaque cle de
 *     l'attendu, recursivement, avec le meme type JSON (null est un type) ;
 *     `ok` a la meme valeur ; un tableau attendu non vide exige que chacun de
 *     ses elements ait sa forme parmi les elements du tableau de l'exemple.
 *   REPRODUCTION D'UN FAIT : un exemple dont l'operation et les arguments sont
 *     ceux de l'etape d'un fait (de N'IMPORTE QUELLE periode) et dont la
 *     reponse satisfait l'attendu de ce fait (egalite partielle de T70).
 *     INTERDITE DANS LES TROIS DOCUMENTS (decision de l'orchestrateur) : les
 *     trois fichiers forment tout l'enonce que voit le candidat, et 119
 *     exemples de `contract.exemples` reproduisent un fait gele. A1 l'exige
 *     de docs/spec.md et docs/api.md, A2 de docs/tickets/Pnn.md (criteres
 *     compris) : un ticket ne peut pas recopier `contract.exemples` tels quels.
 *   TICKET : trois sections, chacune ouverte par le PREMIER titre Markdown dont
 *     le texte (sans accents, en minuscules) ne designe qu'une categorie :
 *     `ajout|added` ; `remplac|replac` ; `retir|removed|retired|supprim` —
 *     un titre qui contient `critere|acceptance|acceptation` est un titre de
 *     criteres, jamais de categorie. Une section court jusqu'au titre suivant
 *     de niveau inferieur ou egal. Une ENTREE est une ligne dont le premier
 *     jeton (apres marqueurs Markdown : #, >, -, *, +, |, `1.`, emphase,
 *     accents graves, crochets) est l'identifiant d'une clause de la source.
 *     Exigences : ajoutees ⊆ entrees(Ajoutees) ⊆ ajoutees ∪ remplacantes ;
 *     entrees(Remplacees) ⊆ remplacantes ∪ remplacees, et chaque couple
 *     (remplacante, remplacee) a une entree qui nomme l'une en premier jeton
 *     et l'autre sur la meme ligne ; retirees ⊆ entrees(Retirees) ⊆ retirees
 *     ∪ remplacees. Les trois sections existent toujours (vides au besoin).
 *     CRITERES : l'ensemble des sections dont le titre contient
 *     `critere|acceptance|acceptation` ; chaque clause ajoutee ou remplacante
 *     y est nommee, et, si la source lui donne des exemples, un exemple y
 *     porte l'operation de l'un d'eux.
 *   PROMPT SANS TEXTE DE CLAUSE : aucune fenetre de 60 caracteres consecutifs
 *     du texte normalise (en minuscules) d'une clause de la source, quelle
 *     que soit sa periode, n'apparait dans le prompt normalise.
 *   CONSERVATION (A4) : un module de derivation, ecrit par cette suite et
 *     passe au faux `claude`, releve TOUT l'espace de travail (hors .git) a
 *     l'entree de chaque session, puis le modifie comme un candidat : il
 *     reecrit, vide, complete ou supprime `docs/spec.md` et `docs/api.md`
 *     (en alternance), cree d'avance le ticket de la periode suivante, ecrit
 *     son code (src/, tests/, candidate.mjs), des notes a la racine, dans
 *     docs/ et dans docs/tickets/, et ANNOTE son ticket courant Pnn.md ; il
 *     releve l'espace a la sortie. REGLE DES TICKETS ANTERIEURS (decision de
 *     l'orchestrateur) : a la periode n+1, le ticket Pnn.md devient de
 *     l'historique ; il est CONSERVE tel que le candidat l'a laisse, seuls
 *     les trois fichiers courants sont reecrits. A
 *     l'entree de la session n : les trois fichiers de n sont ceux du
 *     generateur pour n et ne portent aucune marque du candidat ; tout autre
 *     fichier present a la sortie de n-1 (tickets anterieurs compris) est
 *     present et identique octet pour octet.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CONTROLES NEGATIFS (sans eux un cas pourrait etre creux)
 *
 *   Chaque predicat est d'abord applique a des documents PARESSEUX calcules
 *   par la suite, et doit les REFUSER :
 *     A1 : spec = tous les textes de la source (copie tout), spec vide, spec
 *          augmentee des exemples de la source ; api
 *          = exemples de la source recopies (reproduisent des faits), api vide ;
 *          source fabriquee : une clause FABRIQUEE (texte inedit) doit figurer
 *          dans la spec a partir de son entree, et une clause dont la source
 *          fabriquee avance la sortie ne doit plus y figurer.
 *     A2 : ticket vide ; ticket qui range toutes les clauses actives dans
 *          « Ajoutees » ; ticket qui ignore les remplacements ; ticket exact
 *          qui recopie `contract.exemples` (refuse pour la seule
 *          reproduction) ; source
 *          fabriquee : la clause retiree et la clause ajoutee doivent etre
 *          listees a leur periode, et nulle part a la suivante.
 *     A3 : le prompt recu augmente du texte d'une clause ; le prompt prive de
 *          la reference au ticket.
 *     A4 : les transitions « le moteur ne reecrit rien », « le moteur efface
 *          docs/ puis le regenere » et « le moteur regenere le ticket
 *          anterieur annote » rejouees sur les releves REELS de la campagne.
 *
 * ─────────────────────────────────────────────────────────────────────── VI
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Que les valeurs comparees par les controles de T74 (sequences ciblees,
 *    flux differentiels) figurent dans `docs/api.md` : seuls les faits de la
 *    racine sont connus a T73.
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde
 *    `verifierFauxEnTetePath`, reprise a l'identique de T47/.../T69.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROC_TIMEOUT_MS = 600_000;
const CASE_TIMEOUT_MS = 3_600_000;
const BUILD_TIMEOUT_MS = 600_000;
const LOAD_TIMEOUT_MS = 180_000;

const NOMBRE_DE_PERIODES = 24;
const SCENARIO_ID = 'F-PLATFORM'; // FIXE ICI (II), convention de F-LONG
const FENETRE_CHAMP = 120; // definition de T69 II.2
const FENETRE_PROMPT = 60; // FIXE ICI (IV)

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
const sansAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();
const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function nomme(texte: string, mot: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_@.-])${echapper(mot)}(?![A-Za-z0-9_@-]|\\.[A-Za-z0-9_])`).test(texte);
}
const nn = (n: number): string => String(n).padStart(2, '0');
const cheminTicket = (n: number): string => `docs/tickets/P${nn(n)}.md`;
const PERIODES = Array.from({ length: NOMBRE_DE_PERIODES }, (_, i) => i + 1);

function trie(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(trie);
  if (estObjet(v)) {
    const o: Json = {};
    for (const k of Object.keys(v).sort()) o[k] = trie(v[k]);
    return o;
  }
  return v;
}

/** Egalite partielle des faits (T70 A2) : chaque champ attendu present et egal ; tableaux : meme longueur, meme ordre. */
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

interface Etape {
  id: string;
  op: string;
  args: Json;
}
interface Fait {
  id: string;
  etape: string;
  attendu: Json;
  periode: number;
}

const ETAPES = new Map<string, Etape>();
const FAITS_PAR_PERIODE = new Map<number, Fait[]>();
const TOUS_LES_FAITS: Fait[] = [];
const DEFAUTS_RACINES: string[] = [];
for (const f of RACINES) {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
    for (const [p, e] of Object.entries((d.periodes ?? {}) as Json)) {
      const n = Number(/^P(\d+)$/.exec(p)?.[1] ?? NaN);
      if (!Number.isInteger(n) || !estObjet(e)) continue;
      for (const s of (e.trajectoire ?? []) as Etape[]) ETAPES.set(s.id, s);
      const faits = ((e.faits ?? []) as Omit<Fait, 'periode'>[]).map((x) => ({ ...x, periode: n }));
      FAITS_PAR_PERIODE.set(n, faits);
      TOUS_LES_FAITS.push(...faits);
    }
  } catch (e) {
    DEFAUTS_RACINES.push(`RACINE-ILLISIBLE ${f} : ${rendu(e)}`);
  }
}
for (const n of PERIODES) if ((FAITS_PAR_PERIODE.get(n) ?? []).length === 0) DEFAUTS_RACINES.push(`RACINE-SANS-FAIT P${n}`);

/** Faits indexes par requete (operation + arguments, a l'ordre des cles pres). */
const cleRequete = (op: string, args: unknown): string => `${op}\u0000${JSON.stringify(trie(args ?? {}))}`;
const FAITS_PAR_REQUETE = new Map<string, Fait[]>();
for (const f of TOUS_LES_FAITS) {
  const e = ETAPES.get(f.etape);
  if (e === undefined) continue;
  const k = cleRequete(e.op, e.args);
  FAITS_PAR_REQUETE.set(k, [...(FAITS_PAR_REQUETE.get(k) ?? []), f]);
}

/* ─────────────────────────────────────────── chargement des paquets */

interface Charge {
  via: string[];
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

let CHARGE: Charge = { via: [], parPaquet: new Map(), tentatives: ['beforeAll non execute'] };

beforeAll(async () => {
  // Le chargement ne LEVE pas : chaque cas asserte lui-meme ce qui lui manque
  // (le rouge reste ASSERTION_FAILED, jamais SUITE_FAILED_TO_RUN).
  const c: Charge = { via: [], parPaquet: new Map(), tentatives: [] };
  for (const pkg of ['scenario', 'activities', 'oracle']) {
    const plat = new Map<string, unknown>();
    for (const s of specificateurs(pkg)) {
      try {
        const mod = (await import(s)) as Ns;
        for (const [k, v] of Object.entries(mod)) if (k !== '__esModule' && !plat.has(k)) plat.set(k, v);
        if (estObjet(mod.default)) for (const [k, v] of Object.entries(mod.default)) if (!plat.has(k)) plat.set(k, v);
        c.via.push(s.replace(pathToFileURL(REPO).href, '<repo>'));
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
    alias: [
      'F_PLATFORM_CLAUSES',
      'PLATFORM_CLAUSES',
      'platformClauses',
      'fPlatformClauses',
      'getPlatformClauses',
      'loadPlatformClauses',
      'F_PLATFORM_SOURCE',
      'platformSource',
      'platformClauseSource',
    ],
    paquets: ['scenario', 'oracle'],
  },
  platformPeriodDocs: {
    alias: [
      'renderPlatformPeriodDocs',
      'buildPlatformPeriodDocs',
      'generatePlatformPeriodDocs',
      'platformPeriodDocs',
      'renderFPlatformPeriodDocs',
      'buildFPlatformPeriodDocs',
      'renderPlatformDocs',
      'buildPlatformDocs',
    ],
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

/* ───────────────────────────────────────────── lecture des clauses (T70 III) */

type Clause = Json;
const A_ID = ['id', 'clause_id', 'clauseId'];
const A_ENTREE = ['enters', 'entry', 'entry_period', 'entryPeriod', 'from', 'since', 'introduced_in', 'introducedIn', 'periode_entree'];
const A_SORTIE = ['exits', 'exit', 'exit_period', 'exitPeriod', 'until', 'retired_in', 'retiredIn', 'periode_sortie'];
const A_REMPLACE = ['replaces', 'supersedes', 'remplace'];
const A_TEXTE = ['text', 'statement', 'enonce', 'texte'];
const A_CONTRAT = ['contract', 'contract_fragment', 'contractFragment', 'fragment', 'contrat'];

function cle(o: unknown, alias: readonly string[]): string | undefined {
  if (!estObjet(o)) return undefined;
  for (const a of alias) if (a in o && o[a] !== undefined) return a;
  return undefined;
}
function lire(o: unknown, alias: readonly string[]): unknown {
  const k = cle(o, alias);
  return k === undefined ? undefined : (o as Json)[k];
}
function numeroPeriode(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const m = /^[Pp]?(\d{1,2})$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
}
function periodeComme(modele: unknown, n: number): unknown {
  if (typeof modele === 'number') return n;
  if (typeof modele === 'string' && /^p/.test(modele)) return `p${n}`;
  return `P${n}`;
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
function remplaceDe(c: Clause): string[] {
  const v = lire(c, A_REMPLACE);
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.map(String);
  return [];
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
function exemplesDe(c: Clause): Json[] {
  const v = contratDe(c).exemples ?? contratDe(c).examples;
  return Array.isArray(v) ? (v.filter(estObjet) as Json[]) : [];
}
function opsDesExemples(c: Clause): Set<string> {
  const out = new Set<string>();
  for (const e of exemplesDe(c)) {
    const rq = e.requete ?? e.request;
    if (estObjet(rq) && typeof rq.op === 'string') out.add(rq.op);
  }
  return out;
}

async function lireSource(): Promise<{ clauses: Clause[]; diagnostic: string }> {
  let v = resoudre('platformClauses');
  if (v === undefined) return { clauses: [], diagnostic: contratManquant('platformClauses') };
  try {
    if (typeof v === 'function') v = await Promise.resolve((v as Fonction)());
    if (estObjet(v) && Array.isArray(v.clauses)) v = v.clauses;
  } catch (e) {
    return { clauses: [], diagnostic: `SOURCE-LEVE ${rendu(e)}` };
  }
  if (!Array.isArray(v) || v.length === 0 || !v.every(estObjet)) {
    return { clauses: [], diagnostic: `SOURCE-PAS-UN-TABLEAU-DE-CLAUSES ${court(rendu(v), 300)}` };
  }
  return { clauses: v as Clause[], diagnostic: 'ok' };
}
async function source(): Promise<Clause[]> {
  aucunDefaut(DEFAUTS_RACINES, 'racines-gelees-lues');
  const s = await lireSource();
  exige(s.diagnostic === 'ok', 'source-de-clauses-lue', s.diagnostic);
  return s.clauses;
}

/* ═════════════════════════ III — derivations independantes depuis la source */

interface Difference {
  ajoutees: string[];
  remplacantes: Map<string, string[]>; // remplacante -> remplacees
  remplacees: string[];
  retirees: string[];
  nouvelles: string[]; // ajoutees + remplacantes
}

function difference(clauses: Clause[], n: number): Difference {
  const avant = new Set(n <= 1 ? [] : clauses.filter((c) => active(c, n - 1)).map(idDe));
  const apres = clauses.filter((c) => active(c, n));
  const entrantes = apres.filter((c) => !avant.has(idDe(c)));
  const ajoutees: string[] = [];
  const remplacantes = new Map<string, string[]>();
  for (const c of entrantes) {
    const r = remplaceDe(c);
    if (r.length === 0) ajoutees.push(idDe(c));
    else remplacantes.set(idDe(c), r);
  }
  const remplacees = [...new Set([...remplacantes.values()].flat())];
  const ids = new Set(apres.map(idDe));
  const retirees = [...avant].filter((id) => !ids.has(id) && !remplacees.includes(id));
  return { ajoutees, remplacantes, remplacees, retirees, nouvelles: [...ajoutees, ...remplacantes.keys()] };
}

function unitesEnumerees(clauses: Clause[], n: number): { enumere: Set<string>; declare: Set<string> } {
  const enumere = new Set<string>();
  const declare = new Set<string>();
  for (const c of clauses) {
    const q = contratDe(c).quantities ?? contratDe(c).units;
    if (!estObjet(q)) continue;
    for (const [k, d] of Object.entries(q)) {
      declare.add(k);
      if (active(c, n) && estObjet(d) && typeof d.unit === 'string' && /enum/iu.test(d.unit)) enumere.add(k);
    }
  }
  return { enumere, declare };
}

const CHAMPS_CODE = new Set(['error', 'code']);

/** Les couples (champ, valeur) que les faits de la periode n comparent. */
function valeursComparees(clauses: Clause[], n: number): { champ: string; valeur: string; fait: string }[] {
  const { enumere, declare } = unitesEnumerees(clauses, n);
  const vus = new Map<string, { champ: string; valeur: string; fait: string }>();
  const parcourir = (v: unknown, k: string, fait: string): void => {
    if (Array.isArray(v)) v.forEach((x) => parcourir(x, k, fait));
    else if (estObjet(v)) for (const [kk, x] of Object.entries(v)) parcourir(x, kk, fait);
    else if (typeof v === 'string') {
      const vocab = CHAMPS_CODE.has(k) || enumere.has(k) || (!declare.has(k) && /^[a-z][a-z_]*$/u.test(v));
      if (vocab && /^[A-Za-z][A-Za-z0-9_]*$/u.test(v) && !vus.has(`${k}=${v}`)) vus.set(`${k}=${v}`, { champ: k, valeur: v, fait });
    }
  };
  for (const f of FAITS_PAR_PERIODE.get(n) ?? []) parcourir(f.attendu, '', f.id);
  return [...vus.values()];
}

/* ═════════════════════════ IV — definitions de lecture */

/** Chaque jeton cite avec les identifiants qui le precedent sur la meme ligne (T69 II.2). */
function pairesChampValeur(texte: string): { valeur: string; champs: string[] }[] {
  const out: { valeur: string; champs: string[] }[] = [];
  const re = /(["'`])([A-Za-z][A-Za-z0-9_]*)\1/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte)) !== null) {
    const debutLigne = texte.lastIndexOf('\n', m.index) + 1;
    const avant = texte.slice(Math.max(debutLigne, m.index - FENETRE_CHAMP), m.index);
    const champs: string[] = [];
    const reId = /(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])/gu;
    let k: RegExpExecArray | null;
    while ((k = reId.exec(avant)) !== null) champs.push(k[1]);
    out.push({ valeur: m[2], champs });
    re.lastIndex = m.index + 1;
  }
  return out;
}

interface Exemple {
  op: string;
  args: unknown;
  reponse: Json;
}

function blocsDeCode(md: string): string[] {
  const out: string[] = [];
  const re = /^[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gmu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) out.push(m[2]);
  return out;
}

function exemplesDe_md(md: string): Exemple[] {
  const out: Exemple[] = [];
  const requete = (v: unknown): Json | null => (estObjet(v) && typeof v.op === 'string' ? v : null);
  const reponse = (v: unknown): Json | null => (estObjet(v) && typeof v.ok === 'boolean' ? v : null);
  const ajouter = (rq: Json, rp: Json): void => {
    out.push({ op: rq.op as string, args: rq.args ?? {}, reponse: rp });
  };
  const parcourir = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        const rq = requete(x);
        const rp = reponse(v[i + 1]);
        if (rq !== null && rp !== null && !('ok' in rq)) ajouter(rq, rp);
        parcourir(x);
      });
    } else if (estObjet(v)) {
      const rq = requete(v.requete ?? v.request);
      const rp = reponse(v.reponse ?? v.response);
      if (rq !== null && rp !== null) ajouter(rq, rp);
      for (const x of Object.values(v)) if (x !== null && typeof x === 'object') parcourir(x);
    }
  };
  for (const b of blocsDeCode(md)) {
    let entier: unknown;
    let lu = false;
    try {
      entier = JSON.parse(b);
      lu = true;
    } catch {
      /* lecture ligne a ligne */
    }
    if (lu) {
      parcourir(entier);
      continue;
    }
    const lignes: unknown[] = [];
    for (const l of b.split('\n')) {
      const t = l.trim().replace(/,$/u, '');
      if (t === '') continue;
      try {
        lignes.push(JSON.parse(t));
      } catch {
        /* ligne non JSON */
      }
    }
    parcourir(lignes);
  }
  return out;
}

const typeJson = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** L'exemple `ex` a-t-il la forme comparee `att` (IV) ? */
function couvre(att: unknown, ex: unknown, cleCourante = ''): boolean {
  if (cleCourante === 'ok') return Object.is(att, ex);
  if (typeJson(att) !== typeJson(ex)) return false;
  if (Array.isArray(att)) {
    const e = ex as unknown[];
    return att.every((a) => e.some((x) => couvre(a, x)));
  }
  if (estObjet(att)) {
    const e = ex as Json;
    return Object.entries(att).every(([k, v]) => k in e && couvre(v, e[k], k));
  }
  return true;
}

function cleForme(att: unknown): string {
  if (att === null) return 'null';
  if (Array.isArray(att)) return `[${[...new Set(att.map(cleForme))].sort().join('|')}]`;
  if (estObjet(att)) {
    return `{${Object.keys(att)
      .sort()
      .map((k) => (k === 'ok' ? `ok=${String(att.ok)}` : `${k}:${cleForme(att[k])}`))
      .join(',')}}`;
  }
  return typeof att;
}

/** Defauts d'un `docs/spec.md` pour la periode n (A1). */
function defautsSpec(spec: string, clauses: Clause[], n: number): string[] {
  const doc = normaliser(spec);
  const out: string[] = defautsReproduction(spec, `P${n} spec`);
  for (const c of clauses) {
    const t = normaliser(texteDe(c));
    if (t === '') continue;
    const present = doc.includes(t);
    if (active(c, n) && !present) out.push(`P${n} spec : clause ACTIVE ${idDe(c)} absente`);
    if (!active(c, n) && present) out.push(`P${n} spec : clause INACTIVE ${idDe(c)} presente`);
  }
  return out;
}

/** Defauts d'un `docs/api.md` pour la periode n (A1). */
function defautsApi(api: string, clauses: Clause[], n: number): string[] {
  const out: string[] = [];
  const paires = pairesChampValeur(api);
  for (const v of valeursComparees(clauses, n)) {
    const champs = CHAMPS_CODE.has(v.champ) ? ['error', 'code'] : [v.champ];
    if (!paires.some((p) => p.valeur === v.valeur && champs.some((c) => p.champs.includes(c)))) {
      out.push(`P${n} api : valeur comparee ${v.champ} = "${v.valeur}" (${v.fait}) non citee avec son champ`);
    }
  }
  const exemples = exemplesDe_md(api);
  const formes = new Map<string, Fait>();
  for (const f of FAITS_PAR_PERIODE.get(n) ?? []) {
    const e = ETAPES.get(f.etape);
    if (e === undefined) continue;
    const k = `${e.op} ${cleForme(f.attendu)}`;
    if (!formes.has(k)) formes.set(k, f);
  }
  for (const [k, f] of formes) {
    const op = (ETAPES.get(f.etape) as Etape).op;
    if (!exemples.some((x) => x.op === op && couvre(f.attendu, x.reponse))) {
      out.push(`P${n} api : forme comparee sans exemple ${k} (${f.id})`);
    }
  }
  out.push(...defautsReproduction(api, `P${n} api`));
  return out;
}

/** IV, REPRODUCTION D'UN FAIT : applique aux TROIS documents (spec, api, ticket). */
function defautsReproduction(md: string, ou: string): string[] {
  const out: string[] = [];
  for (const x of exemplesDe_md(md)) {
    for (const f of FAITS_PAR_REQUETE.get(cleRequete(x.op, x.args)) ?? []) {
      if (correspond(f.attendu, x.reponse)) {
        out.push(`${ou} : l'exemple ${x.op} ${court(rendu(x.args), 120)} reproduit le fait ${f.id}`);
      }
    }
  }
  return out;
}

interface Titre {
  ligne: number;
  niveau: number;
  texte: string;
}
type Categorie = 'ajout' | 'remplacement' | 'retrait' | 'criteres' | null;

function categorie(titre: string): Categorie {
  const t = sansAccents(titre);
  if (/critere|acceptance|acceptation/u.test(t)) return 'criteres';
  const c: Categorie[] = [];
  if (/ajout|added/u.test(t)) c.push('ajout');
  if (/remplac|replac/u.test(t)) c.push('remplacement');
  if (/retir|removed|retired|supprim/u.test(t)) c.push('retrait');
  return c.length === 1 ? c[0] : null;
}

function titres(lignes: string[]): Titre[] {
  const out: Titre[] = [];
  let dansBloc = false;
  lignes.forEach((l, i) => {
    if (/^\s*(```|~~~)/u.test(l)) dansBloc = !dansBloc;
    if (dansBloc) return;
    const m = /^(#{1,6})\s+(.*)$/u.exec(l);
    if (m) out.push({ ligne: i, niveau: m[1].length, texte: m[2] });
  });
  return out;
}
function corps(lignes: string[], tous: Titre[], t: Titre): string[] {
  const suivant = tous.find((x) => x.ligne > t.ligne && x.niveau <= t.niveau);
  return lignes.slice(t.ligne + 1, suivant === undefined ? lignes.length : suivant.ligne);
}

/** Premier jeton d'une ligne, s'il est l'identifiant d'une clause de `ids`. */
function entree(ligne: string, ids: Set<string>): string | null {
  let s = ligne;
  for (let i = 0; i < 12; i += 1) {
    const avant = s;
    s = s.replace(/^\s+/u, '').replace(/^(?:#{1,6}|>|[-*+](?=\s)|\||\d+[.)]|\*\*|__|[*_`[(])/u, '');
    if (s === avant) break;
  }
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)/u.exec(s);
  if (m === null) return null;
  const id = m[1].replace(/[._-]+$/u, '');
  return ids.has(id) ? id : null;
}

/** Defauts d'un ticket pour la periode n (A2). */
function defautsTicket(ticket: string, clauses: Clause[], n: number): string[] {
  const out: string[] = [];
  const ids = new Set(clauses.map(idDe));
  const d = difference(clauses, n);
  const lignes = ticket.split('\n');
  const tous = titres(lignes);
  const sectionDe = (cat: Categorie): string[] | null => {
    const t = tous.find((x) => categorie(x.texte) === cat);
    return t === undefined ? null : corps(lignes, tous, t);
  };
  const entrees = (sec: string[]): { id: string; ligne: string }[] =>
    sec.map((l) => ({ id: entree(l, ids), ligne: l })).filter((e): e is { id: string; ligne: string } => e.id !== null);
  const borne = (nom: string, sec: string[] | null, min: string[], max: string[]): void => {
    if (sec === null) {
      out.push(`P${n} ticket : section « ${nom} » absente`);
      return;
    }
    const listees = new Set(entrees(sec).map((e) => e.id));
    for (const id of min) if (!listees.has(id)) out.push(`P${n} ticket : ${id} non liste dans « ${nom} »`);
    for (const id of listees) if (!max.includes(id)) out.push(`P${n} ticket : ${id} liste a tort dans « ${nom} »`);
  };
  const remplacantes = [...d.remplacantes.keys()];
  borne('ajoutees', sectionDe('ajout'), d.ajoutees, [...d.ajoutees, ...remplacantes]);
  const secR = sectionDe('remplacement');
  borne('remplacees', secR, [], [...remplacantes, ...d.remplacees]);
  if (secR !== null) {
    const es = entrees(secR);
    for (const [neuve, anciennes] of d.remplacantes) {
      for (const ancienne of anciennes) {
        const ok = es.some(
          (e) => (e.id === neuve && nomme(e.ligne, ancienne)) || (e.id === ancienne && nomme(e.ligne, neuve)),
        );
        if (!ok) out.push(`P${n} ticket : remplacement ${neuve} -> ${ancienne} non liste dans « remplacees »`);
      }
    }
  }
  borne('retirees', sectionDe('retrait'), d.retirees, [...d.retirees, ...d.remplacees]);
  const criteres = tous
    .filter((t) => categorie(t.texte) === 'criteres')
    .map((t) => corps(lignes, tous, t).join('\n'))
    .join('\n');
  out.push(...defautsReproduction(ticket, `P${n} ticket`));
  if (criteres.trim() === '') out.push(`P${n} ticket : aucune section de criteres d'acceptation`);
  else {
    const exemples = exemplesDe_md(criteres);
    const parId = new Map(clauses.map((c) => [idDe(c), c]));
    for (const id of d.nouvelles) {
      if (!nomme(criteres, id)) out.push(`P${n} ticket : ${id} absente des criteres d'acceptation`);
      const ops = opsDesExemples(parId.get(id) as Clause);
      if (ops.size > 0 && !exemples.some((x) => ops.has(x.op))) {
        out.push(`P${n} ticket : aucun exemple (${[...ops].join('|')}) n'illustre les criteres de ${id}`);
      }
    }
  }
  return out;
}

/** Fenetres de FENETRE_PROMPT caracteres des textes de clauses (A3). */
function fenetres(clauses: Clause[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of clauses) {
    const t = normaliser(texteDe(c)).toLowerCase();
    if (t.length < FENETRE_PROMPT) {
      if (t.length > 0) out.set(t, idDe(c));
      continue;
    }
    for (let i = 0; i + FENETRE_PROMPT <= t.length; i += 1) {
      const w = t.slice(i, i + FENETRE_PROMPT);
      if (!out.has(w)) out.set(w, idDe(c));
    }
  }
  return out;
}

function defautsPrompt(prompt: string, n: number, f: Map<string, string>): string[] {
  const out: string[] = [];
  for (const ref of ['docs/spec.md', 'docs/api.md', cheminTicket(n)]) {
    if (!prompt.includes(ref)) out.push(`P${n} prompt : ne renvoie pas a ${ref}`);
  }
  const p = normaliser(prompt).toLowerCase();
  const cites = new Set<string>();
  for (let i = 0; i + FENETRE_PROMPT <= p.length; i += 1) {
    const id = f.get(p.slice(i, i + FENETRE_PROMPT));
    if (id !== undefined) cites.add(id);
  }
  for (const [w, id] of f) if (w.length < FENETRE_PROMPT && p.includes(w)) cites.add(id);
  for (const id of cites) out.push(`P${n} prompt : contient le texte de la clause ${id}`);
  return out;
}

/* ═════════════════════════ le generateur (role platformPeriodDocs) */

interface Docs {
  spec: string;
  api: string;
  ticket: string;
}

async function docsDe(n: number, clauses?: Clause[]): Promise<{ docs: Docs | null; defaut: string }> {
  const f = resoudre('platformPeriodDocs');
  if (typeof f !== 'function') return { docs: null, defaut: contratManquant('platformPeriodDocs') };
  let r: unknown;
  try {
    r = await Promise.resolve(clauses === undefined ? (f as Fonction)(n) : (f as Fonction)(n, { clauses }));
  } catch (e) {
    return { docs: null, defaut: `GENERATEUR-LEVE P${n} : ${rendu(e)}` };
  }
  const parChemin = new Map<string, unknown>();
  if (r instanceof Map) for (const [k, v] of r) parChemin.set(String(k), v);
  else if (Array.isArray(r)) {
    for (const e of r) if (estObjet(e)) parChemin.set(String(e.path ?? e.relPath ?? ''), e.content);
  } else if (estObjet(r)) for (const [k, v] of Object.entries(r)) parChemin.set(k, v);
  const pick = (chemin: string, alias: string[]): unknown => {
    if (parChemin.has(chemin)) return parChemin.get(chemin);
    for (const a of alias) if (parChemin.has(a)) return parChemin.get(a);
    return undefined;
  };
  const spec = pick('docs/spec.md', ['spec', 'specMd']);
  const api = pick('docs/api.md', ['api', 'apiMd']);
  const ticket = pick(cheminTicket(n), ['ticket', 'ticketMd']);
  if (typeof spec !== 'string' || typeof api !== 'string' || typeof ticket !== 'string') {
    return {
      docs: null,
      defaut: `GENERATEUR-FORME P${n} : attendu docs/spec.md, docs/api.md, ${cheminTicket(n)} (ou spec/api/ticket) en texte ; recu cles [${[...parChemin.keys()].join(', ')}] ${court(rendu(r), 300)}`,
    };
  }
  return { docs: { spec, api, ticket }, defaut: '' };
}

/** Source fabriquee : une clause sort sans remplacante a P5, une clause inedite entre a P5. */
function sourceFabriquee(clauses: Clause[]): { clauses: Clause[]; retiree: string; ajoutee: string; texteAjoute: string } {
  const remplacees = new Set(clauses.flatMap(remplaceDe));
  const cible = clauses.find((c) => (entreeDe(c) ?? 99) <= 3 && sortieDe(c) === null && !remplacees.has(idDe(c)));
  const modele = clauses.find((c) => entreeDe(c) === 5 && remplaceDe(c).length === 0 && exemplesDe(c).length > 0) ?? clauses[0];
  const ids = new Set(clauses.map(idDe));
  let k = 9;
  while (ids.has(`P5.R${String(k)}`)) k += 1;
  const ajoutee = `P5.R${String(k)}`;
  const nonce = randomBytes(6).toString('hex');
  const texteAjoute = `Clause fabriquee par acceptance/T73.spec.ts (${nonce}) : toute reservation porte une note libre, rendue telle quelle par get_booking.`;
  const out = clauses.map((c) => {
    if (cible === undefined || idDe(c) !== idDe(cible)) return c;
    const kS = cle(c, A_SORTIE) ?? 'exits';
    return { ...c, [kS]: periodeComme(lire(c, A_ENTREE), 5) };
  });
  const kId = cle(modele, A_ID) ?? 'id';
  const kT = cle(modele, A_TEXTE) ?? 'text';
  const kE = cle(modele, A_ENTREE) ?? 'enters';
  const kS = cle(modele, A_SORTIE) ?? 'exits';
  const nouvelle: Clause = { ...modele, [kId]: ajoutee, [kT]: texteAjoute, [kE]: periodeComme(lire(modele, A_ENTREE), 5), [kS]: null };
  for (const a of A_REMPLACE) if (a in nouvelle) nouvelle[a] = null;
  out.push(nouvelle);
  return { clauses: out, retiree: cible === undefined ? '<aucune-cible>' : idDe(cible), ajoutee, texteAjoute };
}

/* ═════════════════════════ PostgreSQL REEL, CLI, faux claude (repris de T69) */

const RUN = `t73_${process.pid.toString(36)}_${Date.now().toString(36)}`;
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
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) if (psql(cand, 'SELECT 1').ok) return cand;
  return 'postgres';
})();

const BASES_CREEES: string[] = [];
const REPERTOIRES_CREES: string[] = [];

function creerBase(suffixe: string): { nom: string; erreur: string } {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  if (r.ok) BASES_CREEES.push(nom);
  return { nom, erreur: r.ok ? '' : `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}` };
}
function repertoireJetable(prefixe: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `t73-${prefixe}-`));
  REPERTOIRES_CREES.push(d);
  return d;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of REPERTOIRES_CREES) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

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
      else if (estObjet(bin)) for (const v of Object.values(bin)) if (typeof v === 'string') ajouter('apps/cli:bin', path.resolve(dir, v));
      if (typeof j.main === 'string') ajouter('apps/cli:main', path.resolve(dir, j.main));
    } catch {
      /* manifeste illisible */
    }
  }
  for (const rel of ['dist/index.js', 'dist/cli.js', 'bin/bench.js', 'index.js']) ajouter(`apps/cli:${rel}`, path.join(dir, rel));
  return out;
}

type Tentative = { label: string; exit: number | null; sortie: string };
type AppelCli = { resultat: Json | null; tentatives: Tentative[] };

function executer(argv: string[], env: NodeJS.ProcessEnv): { exit: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', argv, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { exit: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    return { exit: err.status ?? null, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
  }
}
function jsonDeSortie(s: string): Json | null {
  const essai = (t: string): Json | null => {
    try {
      const v = JSON.parse(t) as unknown;
      return estObjet(v) ? v : null;
    } catch {
      return null;
    }
  };
  const direct = essai(s.trim());
  if (direct !== null) return direct;
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  return i >= 0 && j > i ? essai(s.slice(i, j + 1)) : null;
}

let BUILD_TENTE = false;
function construireUneFois(tentatives: Tentative[]): void {
  if (BUILD_TENTE) return;
  BUILD_TENTE = true;
  try {
    execFileSync('pnpm', ['build'], { cwd: REPO, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    tentatives.push({ label: 'pnpm build', exit: 0, sortie: 'build ok' });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    tentatives.push({ label: 'pnpm build', exit: err.status ?? null, sortie: court(`${String(err.stdout ?? '')}${String(err.stderr ?? '')}`, 600) });
  }
}

function lancer(sousCommande: string, drapeaux: string[], env: NodeJS.ProcessEnv): AppelCli {
  const tentatives: Tentative[] = [];
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const r = executer([...c.argv, sousCommande, ...drapeaux], env);
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, exit: r.exit, sortie: court(`${r.stdout}${r.stderr}`, 600) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, tentatives };
  construireUneFois(tentatives);
  return { resultat: essayer(), tentatives };
}

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');

/** Garde explicite — JAMAIS la vraie CLI. */
function verifierFauxEnTetePath(env: NodeJS.ProcessEnv): void {
  const dirs = (env.PATH ?? '').split(path.delimiter).filter((d) => d.length > 0);
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

function envFauxClaude(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: SOCKET_DIR,
    PGUSER: PG_USER,
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    ...extra,
  };
  for (const k of Object.keys(env)) {
    if (k.startsWith('BENCH_FAKE_CLAUDE_') && !(k in extra)) delete env[k];
  }
  verifierFauxEnTetePath(env);
  return env;
}

/* ─────────────────── le candidat qui modifie son depot (IV, CONSERVATION) */

const SENTINELLE = `T73-SENTINELLE-${randomBytes(5).toString('hex')}`;

function moduleCandidat(journal: string): string {
  return [
    '// Ecrit par acceptance/T73.spec.ts : candidat simule qui releve puis modifie son depot.',
    `const JOURNAL = ${JSON.stringify(journal)};`,
    `const SENTINELLE = ${JSON.stringify(SENTINELLE)};`,
    'export function deriver({ prompt, cwd, fs, path }) {',
    '  fs.mkdirSync(JOURNAL, { recursive: true });',
    "  const cf = path.join(JOURNAL, 'compteur.txt');",
    '  let n = 0;',
    "  try { n = Number.parseInt(fs.readFileSync(cf, 'utf8'), 10) || 0; } catch { n = 0; }",
    '  n += 1;',
    '  fs.writeFileSync(cf, String(n));',
    '  const lister = () => {',
    '    const out = {};',
    '    const rec = (d, rel) => {',
    '      for (const e of fs.readdirSync(d, { withFileTypes: true })) {',
    "        if (rel === '' && e.name === '.git') continue;",
    "        const r = rel === '' ? e.name : rel + '/' + e.name;",
    '        const p = path.join(d, e.name);',
    '        if (e.isDirectory()) rec(p, r);',
    "        else if (e.isFile()) out[r] = fs.readFileSync(p).toString('base64');",
    '      }',
    '    };',
    "    rec(cwd, '');",
    '    return out;',
    '  };',
    '  fs.writeFileSync(path.join(JOURNAL, `entree-${n}.json`), JSON.stringify({ n, cwd, prompt, fichiers: lister() }));',
    '  const ecrire = (rel, c) => { const p = path.join(cwd, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };',
    "  const lireOu = (rel) => { try { return fs.readFileSync(path.join(cwd, rel), 'utf8'); } catch { return ''; } };",
    '  const suppr = (rel) => { try { fs.rmSync(path.join(cwd, rel)); } catch { /* absent */ } };',
    '  const S = `${SENTINELLE}-${n}`;',
    '  const mode = n % 3;',
    "  if (mode === 1) { ecrire('docs/spec.md', S + '\\n'); suppr('docs/api.md'); }",
    "  else if (mode === 2) { ecrire('docs/api.md', lireOu('docs/api.md') + '\\n' + S + '\\n'); suppr('docs/spec.md'); }",
    "  else { ecrire('docs/spec.md', S + '\\n' + lireOu('docs/spec.md')); ecrire('docs/api.md', S + '\\n' + lireOu('docs/api.md')); }",
    "  ecrire(`docs/tickets/P${String(n + 1).padStart(2, '0')}.md`, S + ' ticket ecrit d avance par le candidat\\n');",
    "  const courant = `docs/tickets/P${String(n).padStart(2, '0')}.md`;",
    "  ecrire(courant, lireOu(courant) + `\\n<!-- ${S} : note du candidat sur son ticket -->\\n`);",
    "  ecrire('src/app.mjs', lireOu('src/app.mjs') + `// periode ${n} ${S}\\n`);",
    '  ecrire(`src/periode-${n}.mjs`, `export const periode = ${n};\\n`);',
    "  ecrire('tests/acceptance.test.mjs', lireOu('tests/acceptance.test.mjs') + `// test de la periode ${n}\\n`);",
    "  ecrire('NOTES.md', lireOu('NOTES.md') + `- periode ${n}\\n`);",
    "  ecrire('docs/notes-candidat.md', lireOu('docs/notes-candidat.md') + `- periode ${n}\\n`);",
    "  ecrire('docs/tickets/notes-candidat.md', lireOu('docs/tickets/notes-candidat.md') + `- periode ${n}\\n`);",
    '  const contenu = `// candidat T73, periode ${n}\\n`;',
    "  ecrire('candidate.mjs', contenu);",
    '  fs.writeFileSync(path.join(JOURNAL, `sortie-${n}.json`), JSON.stringify({ n, fichiers: lister() }));',
    "  return { relPath: 'candidate.mjs', content: contenu, params: { n } };",
    '}',
    '',
  ].join('\n');
}

interface Releve {
  n: number;
  prompt: string;
  fichiers: Map<string, string>; // chemin -> contenu (utf8)
}
function lireReleve(fichier: string): Releve | null {
  try {
    const j = JSON.parse(fs.readFileSync(fichier, 'utf8')) as { n: number; prompt?: string; fichiers: Record<string, string> };
    const fichiers = new Map<string, string>();
    for (const [k, v] of Object.entries(j.fichiers)) fichiers.set(k, Buffer.from(v, 'base64').toString('utf8'));
    return { n: j.n, prompt: j.prompt ?? '', fichiers };
  } catch {
    return null;
  }
}

interface Campagne {
  defauts: string[]; // defauts d'execution (CLI, derivation)
  prompts: Map<number, string>;
  entrees: Map<number, Releve>;
  sorties: Map<number, Releve>;
}

let CAMPAGNE: Campagne | null = null;

/** 24 appels `bench run-period --provider claude-cli --scenario-id F-PLATFORM` sur UNE campagne. */
function campagne(): Campagne {
  if (CAMPAGNE !== null) return CAMPAGNE;
  const defauts: string[] = [];
  const base = creerBase('cli');
  const dir = repertoireJetable('campagne');
  const journal = path.join(dir, 'journal');
  const records = path.join(dir, 'records');
  const deriveLog = path.join(dir, 'derive-log');
  const module = path.join(dir, `candidat-${randomBytes(6).toString('hex')}.mjs`);
  fs.writeFileSync(module, moduleCandidat(journal));
  const workspaceRoot = repertoireJetable('ws');
  const campaignId = `t73-${RUN}-${randomUUID()}`;
  const env = envFauxClaude({
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: module,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: deriveLog,
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: records,
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: path.join(dir, 'record-counter.txt'),
  });
  if (base.erreur !== '') defauts.push(base.erreur);
  else {
    for (const n of PERIODES) {
      const appel = lancer(
        'run-period',
        [
          '--mode', 'recorded',
          '--campaign-id', campaignId,
          '--postgres-database', base.nom,
          '--s3-bucket', `bench-${RUN}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
          '--provider', 'claude-cli',
          '--live',
          '--model', 'bench-fake-claude-cli-model-t73',
          '--scenario-id', SCENARIO_ID,
          '--candidate-workspace-root', workspaceRoot,
        ],
        env,
      );
      const r = appel.resultat;
      if (r === null || r.persisted !== true || Number(r.period_index) !== n) {
        defauts.push(
          `run-period P${n} (--scenario-id ${SCENARIO_ID}) : resultat ${court(rendu(r), 400)} ; ${appel.tentatives
            .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n').slice(0, 4).join(' / ')}`)
            .join(' | ')}`,
        );
        break;
      }
    }
  }
  try {
    const err = fs.readFileSync(path.join(deriveLog, 'errors.log'), 'utf8');
    if (err.trim() !== '') defauts.push(`DERIVATION-EN-ECHEC ${court(err, 600)}`);
  } catch {
    /* aucune erreur de derivation */
  }
  const prompts = new Map<number, string>();
  if (fs.existsSync(records)) {
    for (const f of fs.readdirSync(records)) {
      const m = /^record-(\d+)\.json$/.exec(f);
      if (m === null) continue;
      try {
        const r = JSON.parse(fs.readFileSync(path.join(records, f), 'utf8')) as { argv: string[] };
        const i = r.argv.indexOf('-p');
        prompts.set(Number(m[1]) + 1, i >= 0 && i + 1 < r.argv.length ? r.argv[i + 1] : '');
      } catch {
        /* enregistrement illisible */
      }
    }
  }
  const entrees = new Map<number, Releve>();
  const sorties = new Map<number, Releve>();
  for (const n of PERIODES) {
    const e = lireReleve(path.join(journal, `entree-${n}.json`));
    const s = lireReleve(path.join(journal, `sortie-${n}.json`));
    if (e !== null) entrees.set(n, e);
    if (s !== null) sorties.set(n, s);
  }
  CAMPAGNE = { defauts, prompts, entrees, sorties };
  return CAMPAGNE;
}

const TROIS = (n: number): string[] => ['docs/spec.md', 'docs/api.md', cheminTicket(n)];

/** Defauts de la transition sortie(n-1) -> entree(n) (A4). */
function defautsTransition(n: number, precedente: Map<string, string> | null, entreeN: Map<string, string>, docs: Docs, clauses: Clause[]): string[] {
  const out: string[] = [];
  const attendus: Record<string, string> = { 'docs/spec.md': docs.spec, 'docs/api.md': docs.api, [cheminTicket(n)]: docs.ticket };
  for (const [chemin, contenu] of Object.entries(attendus)) {
    const vu = entreeN.get(chemin);
    if (vu === undefined) out.push(`P${n} : ${chemin} absent a l'entree de la session`);
    else {
      if (vu.includes(SENTINELLE)) out.push(`P${n} : ${chemin} porte encore la modification du candidat`);
      if (vu !== contenu) out.push(`P${n} : ${chemin} differe de la sortie du generateur pour P${n}`);
    }
  }
  const spec = entreeN.get('docs/spec.md');
  if (spec !== undefined) out.push(...defautsSpec(spec, clauses, n).map((d) => `materialise : ${d}`));
  if (precedente !== null) {
    const trois = new Set(TROIS(n));
    for (const [chemin, contenu] of precedente) {
      if (trois.has(chemin)) continue;
      const vu = entreeN.get(chemin);
      if (vu === undefined) out.push(`P${n} : ${chemin} (present a la sortie de P${n - 1}) a disparu`);
      else if (vu !== contenu) out.push(`P${n} : ${chemin} (present a la sortie de P${n - 1}) a change`);
    }
  }
  return out;
}

/* ═════════════════════════════════════════════════════════════ les cas */

describe('T73 — tickets et documentation dans le depot du candidat (ADR-021 decision 4)', () => {
  it(
    'T73.A1 a chaque periode, docs/spec.md contient le texte de chaque clause active et d aucune clause inactive, et docs/api.md contient chaque valeur comparee avec le nom de son champ et au moins un exemple de chaque forme de reponse comparee',
    async () => {
      const clauses = await source();

      // CONTROLES NEGATIFS (V) : les predicats refusent des documents paresseux.
      const tout = clauses.map(texteDe).join('\n\n');
      const copieDesExemples = clauses
        .flatMap(exemplesDe)
        .map((e) => '```json\n' + JSON.stringify(e, null, 2) + '\n```')
        .join('\n');
      const temoins: string[] = [];
      for (const n of PERIODES) {
        if (defautsSpec(tout, clauses, n).length === 0) temoins.push(`P${n} : une spec qui copie TOUTES les clauses passerait`);
        if (defautsSpec('', clauses, n).length === 0) temoins.push(`P${n} : une spec vide passerait`);
        const specAvecExemples = clauses.filter((c) => active(c, n)).map(texteDe).join('\n\n') + '\n' + clauses.filter((c) => active(c, n)).flatMap(exemplesDe).map((e) => '```json\n' + JSON.stringify(e) + '\n```').join('\n');
        if (n === 1 && !defautsSpec(specAvecExemples, clauses, n).some((x) => /reproduit le fait/u.test(x))) temoins.push('P1 : une spec qui recopie les exemples de la source passerait');
        if (defautsApi('', clauses, n).length === 0) temoins.push(`P${n} : une api vide passerait`);
      }
      if (!PERIODES.some((n) => defautsApi(copieDesExemples, clauses, n).some((d) => /reproduit le fait/u.test(d)))) {
        temoins.push('une api qui recopie les exemples de la source ne serait jamais vue reproduire un fait');
      }
      aucunDefaut(temoins, 'predicats-A1-discriminants');

      // Le generateur, periode par periode, sur la source reelle.
      const defauts: string[] = [];
      for (const n of PERIODES) {
        const { docs, defaut } = await docsDe(n);
        if (docs === null) {
          defauts.push(defaut);
          if (n === 1) break;
          continue;
        }
        defauts.push(...defautsSpec(docs.spec, clauses, n), ...defautsApi(docs.api, clauses, n));
      }
      aucunDefaut(defauts, 'spec-et-api-de-chaque-periode-conformes-a-la-source');

      // La spec DERIVE de la source : sur une source fabriquee, elle suit.
      const fab = sourceFabriquee(clauses);
      const defautsFab: string[] = [];
      for (const n of [4, 5, 6]) {
        const { docs, defaut } = await docsDe(n, fab.clauses);
        if (docs === null) {
          defautsFab.push(`source fabriquee : ${defaut}`);
          continue;
        }
        defautsFab.push(...defautsSpec(docs.spec, fab.clauses, n).map((d) => `source fabriquee (${fab.retiree} sort a P5, ${fab.ajoutee} entre a P5) : ${d}`));
      }
      aucunDefaut(defautsFab, 'spec-derivee-de-la-source-fournie');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'T73.A2 docs/tickets/Pnn.md liste exactement les clauses ajoutees, remplacees et retirees par rapport a la periode precedente, avec des criteres d acceptation illustres d exemples',
    async () => {
      const clauses = await source();

      // CONTROLES NEGATIFS (V).
      const temoins: string[] = [];
      for (const n of PERIODES) {
        if (defautsTicket('', clauses, n).length === 0) temoins.push(`P${n} : un ticket vide passerait`);
        const toutAjoute = [
          '# Ticket',
          '## Clauses ajoutees',
          ...clauses.filter((c) => active(c, n)).map((c) => `- ${idDe(c)}`),
          '## Clauses remplacees',
          '## Clauses retirees',
          "## Criteres d'acceptation",
          ...clauses.filter((c) => active(c, n)).map((c) => `- ${idDe(c)}`),
          ...clauses.filter((c) => active(c, n)).flatMap(exemplesDe).map((e) => '```json\n' + JSON.stringify(e) + '\n```'),
        ].join('\n');
        if (n > 1 && !defautsTicket(toutAjoute, clauses, n).some((x) => /liste a tort/u.test(x))) temoins.push(`P${n} : un ticket qui range toutes les clauses actives dans « ajoutees » passerait`);
        const d = difference(clauses, n);
        if (d.remplacantes.size > 0) {
          const sansRemplacement = [
            '## Clauses ajoutees',
            ...d.nouvelles.map((id) => `- ${id}`),
            '## Clauses remplacees',
            '## Clauses retirees',
            ...d.remplacees.map((id) => `- ${id}`),
            "## Criteres d'acceptation",
            ...d.nouvelles.map((id) => `- ${id}`),
            ...clauses.filter((c) => d.nouvelles.includes(idDe(c))).flatMap(exemplesDe).map((e) => '```json\n' + JSON.stringify(e) + '\n```'),
          ].join('\n');
          if (!defautsTicket(sansRemplacement, clauses, n).some((x) => /remplacement .* non liste/u.test(x))) temoins.push(`P${n} : un ticket qui ignore les remplacements passerait`);
        }
      }
      // Un ticket par ailleurs exact qui recopie `contract.exemples` livre les reponses attendues.
      const copieExemples = (n: number): string => {
        const d = difference(clauses, n);
        const parId = new Map(clauses.map((c) => [idDe(c), c]));
        return [
          '## Clauses ajoutees',
          ...d.ajoutees.map((id) => `- ${id}`),
          '## Clauses remplacees',
          ...[...d.remplacantes].flatMap(([neuve, anciennes]) => anciennes.map((a) => `- ${neuve} remplace ${a}`)),
          '## Clauses retirees',
          ...d.retirees.map((id) => `- ${id}`),
          "## Criteres d'acceptation",
          ...d.nouvelles.flatMap((id) => [`### ${id}`, ...exemplesDe(parId.get(id) as Clause).map((e) => '```json\n' + JSON.stringify(e) + '\n```')]),
        ].join('\n');
      };
      if (!PERIODES.some((n) => defautsTicket(copieExemples(n), clauses, n).some((x) => /reproduit le fait/u.test(x)))) {
        temoins.push('un ticket qui recopie les exemples de la source ne serait jamais vu reproduire un fait');
      }
      const reproduitSeul = defautsTicket(copieExemples(2), clauses, 2);
      if (reproduitSeul.length === 0 || !reproduitSeul.every((x) => /reproduit le fait/u.test(x))) {
        temoins.push(`le ticket P02 qui recopie les exemples devrait etre refuse pour la seule reproduction : ${court(reproduitSeul.join(' | '), 400)}`);
      }
      aucunDefaut(temoins, 'predicats-A2-discriminants');

      const defauts: string[] = [];
      for (const n of PERIODES) {
        const { docs, defaut } = await docsDe(n);
        if (docs === null) {
          defauts.push(defaut);
          if (n === 1) break;
          continue;
        }
        defauts.push(...defautsTicket(docs.ticket, clauses, n));
      }
      aucunDefaut(defauts, 'ticket-de-chaque-periode-conforme-a-la-source');

      // Retraits : la source reelle n'en a pas ; une source fabriquee en porte un.
      const fab = sourceFabriquee(clauses);
      exige(fab.retiree !== '<aucune-cible>', 'source-fabriquee-construite', 'SOURCE-FABRIQUEE : aucune clause a retirer');
      const dFab = difference(fab.clauses, 5);
      exige(
        dFab.retirees.includes(fab.retiree) && dFab.ajoutees.includes(fab.ajoutee),
        'difference-fabriquee-calculee',
        `SOURCE-FABRIQUEE : difference P5 inattendue ${rendu({ ...dFab, remplacantes: [...dFab.remplacantes] })}`,
      );
      const defautsFab: string[] = [];
      for (const n of [5, 6]) {
        const { docs, defaut } = await docsDe(n, fab.clauses);
        if (docs === null) {
          defautsFab.push(`source fabriquee : ${defaut}`);
          continue;
        }
        defautsFab.push(...defautsTicket(docs.ticket, fab.clauses, n).map((d) => `source fabriquee (${fab.retiree} sort a P5, ${fab.ajoutee} entre a P5) : ${d}`));
      }
      aucunDefaut(defautsFab, 'ticket-derive-de-la-source-fournie');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'T73.A3 le prompt de la periode renvoie a ces trois fichiers et ne contient le texte d aucune clause',
    async () => {
      const clauses = await source();
      const f = fenetres(clauses);
      const c = campagne();
      aucunDefaut(c.defauts, 'campagne-f-platform-executee-sur-24-periodes');

      // CONTROLES NEGATIFS (V), sur le prompt REEL de P1.
      const p1 = c.prompts.get(1) ?? '';
      const temoins: string[] = [];
      const clauseP1 = clauses.find((x) => active(x, 1)) as Clause;
      if (defautsPrompt(`${p1}\n\n${texteDe(clauseP1)}`, 1, f).length === 0) temoins.push('un prompt augmente du texte d une clause passerait');
      if (defautsPrompt(p1.split(cheminTicket(1)).join('le ticket'), 1, f).length === 0) temoins.push('un prompt sans reference au ticket passerait');
      aucunDefaut(temoins, 'predicats-A3-discriminants');

      const defauts: string[] = [];
      for (const n of PERIODES) {
        const p = c.prompts.get(n);
        if (p === undefined || p.trim() === '') {
          defauts.push(`P${n} : aucun prompt enregistre par le faux claude`);
          continue;
        }
        defauts.push(...defautsPrompt(p, n, f));
      }
      aucunDefaut(defauts, 'prompt-de-chaque-periode-renvoie-aux-trois-fichiers-sans-texte-de-clause');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'T73.A4 une modification par le candidat de l un de ces trois fichiers est remplacee a la periode suivante, et tout autre fichier du depot est conserve',
    async () => {
      const clauses = await source();
      const c = campagne();
      aucunDefaut(c.defauts, 'campagne-f-platform-executee-sur-24-periodes');
      const manquants = PERIODES.filter((n) => !c.entrees.has(n) || !c.sorties.has(n));
      exige(manquants.length === 0, 'releves-de-chaque-session', `RELEVES-ABSENTS pour ${manquants.map((n) => `P${n}`).join(', ')}`);

      // Le candidat simule a bien modifie les trois fichiers (sinon A4 serait creux).
      const modifs = new Set<string>();
      for (const [, s] of c.sorties) {
        for (const ch of ['docs/spec.md', 'docs/api.md']) {
          const v = s.fichiers.get(ch);
          if (v === undefined) modifs.add(`${ch}:supprime`);
          else if (v.includes(SENTINELLE)) modifs.add(`${ch}:modifie`);
        }
        const nnS = String(s.n).padStart(2, '0');
        if ((s.fichiers.get(`docs/tickets/P${String(s.n + 1).padStart(2, '0')}.md`) ?? '').includes(SENTINELLE)) modifs.add('ticket:anticipe');
        if ((s.fichiers.get(`docs/tickets/P${nnS}.md`) ?? '').includes(SENTINELLE)) modifs.add('ticket-courant:annote');
      }
      exige(modifs.size === 6, 'le-candidat-a-modifie-les-trois-fichiers', `CANDIDAT-SIMULE-INACTIF : modifications observees ${rendu([...modifs])}`);

      const docsParPeriode = new Map<number, Docs>();
      const defauts: string[] = [];
      for (const n of PERIODES) {
        const { docs, defaut } = await docsDe(n);
        if (docs === null) defauts.push(defaut);
        else docsParPeriode.set(n, docs);
      }
      aucunDefaut(defauts, 'generateur-disponible-pour-chaque-periode');

      // CONTROLES NEGATIFS (V), rejoues sur les releves REELS.
      const temoins: string[] = [];
      for (const n of PERIODES.slice(1)) {
        const prec = (c.sorties.get(n - 1) as Releve).fichiers;
        const docs = docsParPeriode.get(n) as Docs;
        if (defautsTransition(n, prec, new Map(prec), docs, clauses).length === 0) temoins.push(`P${n} : un moteur qui ne reecrit rien passerait`);
        const efface = new Map([...prec].filter(([k]) => !k.startsWith('docs/')));
        efface.set('docs/spec.md', docs.spec);
        efface.set('docs/api.md', docs.api);
        efface.set(cheminTicket(n), docs.ticket);
        if (defautsTransition(n, prec, efface, docs, clauses).length === 0) temoins.push(`P${n} : un moteur qui efface docs/ puis le regenere passerait`);
        const restaure = new Map(prec);
        for (const [k, v] of TROIS(n).map((ch, i) => [ch, [docs.spec, docs.api, docs.ticket][i]] as [string, string])) restaure.set(k, v);
        restaure.set(cheminTicket(n - 1), (docsParPeriode.get(n - 1) as Docs).ticket);
        if (defautsTransition(n, prec, restaure, docs, clauses).length === 0) temoins.push(`P${n} : un moteur qui regenere le ticket anterieur annote par le candidat passerait`);
      }
      aucunDefaut(temoins, 'predicats-A4-discriminants');

      for (const n of PERIODES) {
        const prec = n === 1 ? null : (c.sorties.get(n - 1) as Releve).fichiers;
        defauts.push(...defautsTransition(n, prec, (c.entrees.get(n) as Releve).fichiers, docsParPeriode.get(n) as Docs, clauses));
      }
      aucunDefaut(defauts, 'trois-fichiers-reecrits-et-reste-du-depot-conserve-a-chaque-periode');
    },
    CASE_TIMEOUT_MS,
  );
});
