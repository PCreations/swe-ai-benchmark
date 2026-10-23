/**
 * acceptance/T68.spec.ts — suite d'acceptation de la tache T68.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T68.A1 behaviour — pour chaque regle active a partir de P5, un candidat
 *                      de reference qui implemente TOUTES les regles de
 *                      F-LONG obtient un score de 1 sur chaque regle active
 *                      a chaque periode.
 *   T68.A2 behaviour — pour chaque regle active a partir de P5, le MEME
 *                      candidat PRIVE de cette seule regle obtient sur elle
 *                      un score strictement inferieur a 1.
 *   T68.A3 behaviour — les sequences de chaque regle appellent au moins une
 *                      fois chaque operation que la regle introduit.
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T68 EST UNE TACHE D'EXTENSION : elle ne vient PAS du cahier. Le registre
 * qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-019-creneaux-dans-le-contrat-et-controles-discriminants.md,
 * lignes 100-106), jamais le cahier directement. L'auteur de cette suite est
 * AVEUGLE aux `source_paths` que verification/tasks.extensions.json declare
 * pour T68 — `packages/activities`, `packages/scenario` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline
 * auditable au diff, jamais une barriere technique). Le contrat teste
 * ci-dessous est derive de docs/specs/T68.md et de sa source, le MEME
 * document ACCEPTE, lignes 100-106, AINSI QUE du corps narratif du MEME
 * document hors de cette plage (sections « Ce que le renforcement de T64 a
 * montre » L9-37, et « Decision » point 3, L87-91) — la meme liberte que
 * prend deja acceptance/T67.spec.ts face a son propre ADR.
 *
 *   L24-29 ANCRAGE DECISIF : « toutes les sequences, pour toutes les regles,
 *          creent un locataire, envoient deux reservations et verifient que
 *          la seconde attend. Aucune n'appelle set_capacity, set_level,
 *          balance, history ni transfer. » — ces cinq operations sont donc
 *          les operations DEDIEES de capacity@1, priority@1, price@1,
 *          history@1 et transfer@1 respectivement (meme ordre d'enumeration
 *          que les regles qui les introduisent dans REGLES_ADR, reprise
 *          d'acceptance/T61.spec.ts et d'acceptance/T67.spec.ts).
 *   L87-91 decision 3, mot pour mot : « Les sequences d'une regle exercent
 *          cette regle : elles appellent ses operations, et placent ses
 *          frontieres [...] la ou une implementation qui l'ignore se trompe.
 *          Le critere, mecanique, est un candidat de reference prive de
 *          cette seule regle. » — c'est exactement A1/A2.
 *   L102   livrable, mot pour mot (docs/specs/T68.md).
 *   L104   les trois cas d'acceptation, mot pour mot (docs/specs/T68.md).
 *   L106   commande : `pnpm verify:task T68`. « PostgreSQL et le stockage
 *          objet sont requis ; aucun appel reel. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions DEJA FIXEES par les
 * suites ACCEPTEES dont elle etend le socle (jamais les sources de T68) :
 *   - acceptance/T62.spec.ts / acceptance/T67.spec.ts : le chargement ESM
 *     direct de `packages/scenario` et `packages/activities`, la navigation
 *     JSON generique (`noeuds`/`champTexte`/`champValeur`), la resolution
 *     tolerante par liste d'alias de role (`essayer`, `exige`, `egal`).
 *   - acceptance/T61.spec.ts (V) : la table `REGLES_ADR` des regles actives
 *     par periode — REPRISE A L'IDENTIQUE, jamais recalculee une seconde
 *     fois ici (ADR-001). C'est la SEULE racine dont T68.A1/A2 derivent
 *     « regle active a partir de P5 » et « periode ou la regle est active ».
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001 : aucune des valeurs ci-dessous
 * n'a ete obtenue en executant une implementation de T68 — aucun module de
 * generation de sequences discriminantes n'existe encore au moment ou elle
 * est ecrite ; ADR-019 decide un CRITERE, jamais une signature de fonction).
 *
 * 1. « REGLE ACTIVE A PARTIR DE P5 » est DERIVE de REGLES_ADR (reprise
 *    gelee) : une regle est « active a partir de P5 » si et seulement si
 *    elle n'apparait dans AUCUNE des listes P1 a P4, et apparait dans au
 *    moins une liste P5 a P12. Ceci EXCLUT les regles deja actives avant P5
 *    (reserve@1, idempotence@1, fifo@1, cancel@1, cancel@2, isolation@1),
 *    meme si elles restent actives au-dela de P5 — exactement la lecture
 *    litterale de « regle active A PARTIR de P5 », jamais « regle active
 *    PENDANT P5 ou apres ». Calcule PROGRAMMATIQUEMENT ci-dessous (fonction
 *    `reglesActivesAPartirDeP5`), jamais une liste ecrite a la main : toute
 *    evolution future de REGLES_ADR (improbable, c'est une racine gelee)
 *    serait suivie sans divergence silencieuse.
 * 2. OPERATION DEDIEE PAR REGLE (`OPERATION_DEDIEE`, FIXE ICI) — la ou les
 *    operations du contrat `bench.candidate/4` que la regle introduit, au
 *    sens de I.L24-29 ci-dessus :
 *      capacity@1  -> set_capacity   (ADR-019:L27, enumeration litterale)
 *      priority@1  -> set_level      (ADR-019:L27, enumeration litterale)
 *      price@1     -> balance        (ADR-019:L27, enumeration litterale)
 *      history@1   -> history        (ADR-019:L27, enumeration litterale)
 *      transfer@1  -> transfer       (ADR-019:L27, enumeration litterale)
 *    Pour les quatre regles qui RAFFINENT une operation deja existante au
 *    lieu d'en introduire une nouvelle (aucune n'est nommee par L24-29, donc
 *    aucune n'a droit a une des cinq operations ci-dessus) :
 *      quota@1     -> write          (la promotion de quota s'observe sur
 *                                      une tentative de reservation, ADR-019
 *                                      point 5 narratif)
 *      cancel@3    -> probe_cancel   (nouvelle frontiere d'annulation,
 *                                      meme operation que cancel@1/@2)
 *      cancel@4    -> probe_cancel   (idem)
 *      fifo@2      -> write          (reordonnance observee sur une nouvelle
 *                                      reservation qui bascule la file)
 *    Ce choix est un JUGEMENT du test-author, documente au meme titre que
 *    `resolveAdr019Points` l'est dans acceptance/T67.spec.ts (II.4) — aucune
 *    source ne nomme de fonction ni d'operation pour ces quatre regles.
 * 3. ROLES TOLERES RESOLUS PAR ALIAS (aucun n'est impose, un seul suffit par
 *    famille) :
 *      generation de sequences par regle — `SEQUENCES_PAR_REGLE` ci-dessous.
 *      candidat de reference fidele a F-LONG — `CANDIDAT_FIDELE` ci-dessous.
 *      candidat prive d'une seule regle — `CANDIDAT_PRIVE` ci-dessous.
 *      notation d'un candidat sur une regle a une periode — `NOTATION`
 *      ci-dessous.
 *    Le contrat EXACT d'arguments de chacun n'est fixe par AUCUNE source :
 *    cette suite essaie plusieurs ARITES et plusieurs FORMES d'argument
 *    (identifiant seul, objet `{ruleId}`/`{rule}`, objet `{ruleId,
 *    periodId}`) et retient la premiere qui rend une valeur exploitable —
 *    meme discipline que `essayer`/ROLES_* d'acceptance/T67.spec.ts.
 * 4. UN SCORE EST UN NOMBRE DE [0,1]. Un candidat FIDELE doit rendre
 *    EXACTEMENT 1 (ADR-019:L104, « un score de 1 »), un candidat PRIVE doit
 *    rendre un nombre STRICTEMENT INFERIEUR A 1 (ADR-019:L104, « un score
 *    strictement inferieur a 1 ») — jamais une comparaison approchee qui
 *    masquerait un score de 1 renvoye par erreur sous une tolerance.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LES DANGERS PROPRES A T68, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER D'UNE SEULE REGLE OU D'UNE SEULE PERIODE.
 *     Elle boucle sur CHAQUE regle de `reglesActivesAPartirDeP5()` et, pour
 *     chacune, sur CHAQUE periode ou `REGLES_ADR` la declare active — jamais
 *     un echantillon choisi a la main.
 * (2) A2 NE DOIT PAS ACCEPTER UN SCORE EGAL A 1 COMME UN FAUX NEGATIF SILENCE
 *     : l'assertion exige nommement `< 1`, et echoue avec le score OBTENU en
 *     clair si le candidat prive note malgre tout parfait — c'est exactement
 *     le defaut qu'ADR-019 (L24-29) denonce pour les sequences NAIVES
 *     d'avant ce renforcement.
 * (3) A3 NE DOIT PAS SE CONTENTER DE CHERCHER L'OPERATION N'IMPORTE OU DANS
 *     LE DOCUMENT : elle exige que l'operation dediee apparaisse DANS LA
 *     STRUCTURE MEME des sequences rendues par `SEQUENCES_PAR_REGLE` pour
 *     cette regle (parcours JSON generique de CETTE valeur seule, jamais du
 *     document entier) — une mention de `history` ailleurs dans le module ne
 *     ferait pas passer A3 a tort.
 * (4) NI A1 NI A2 NE REUSSISSENT SI LE ROLE RESOLU NE REND QU'UN OBJET VIDE
 *     OU `undefined` : `requireNotation` echoue NOMMEMENT, jamais par un
 *     acces a une propriete absente qui laisserait l'assertion suivante
 *     tourner sur `NaN === 1` (toujours faux, mais pour la mauvaise raison)
 *     ou `undefined < 1` (`false`, qui masquerait l'absence de notation
 *     comme un FAUX A2 reussi).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie aucune regle metier de F-LONG deja PROUVEE par
 *    T07/T61/T62/T67 : `REGLES_ADR` est tenue pour ACQUISE.
 *  • Elle n'exerce ni un contrat NDJSON reel ni une session `claude -p`
 *    (ADR-008) : aucun processus nomme `claude` n'est jamais lance, et aucun
 *    executable candidat n'est invoque — import ESM pur.
 *  • Elle ne juge PAS si l'operation dediee choisie en II.2 pour quota@1,
 *    cancel@3, cancel@4 et fifo@2 est la SEULE lecture possible d'ADR-019 —
 *    elle documente son choix et verifie exactement ce choix.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 60_000;

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
  if (v instanceof Error) return `${v.name}: ${v.message}`;
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

/* ═══════════════ chargement de packages/scenario + activities ══════════ */

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

function specifiersForPackage(pkgDirName: string): string[] {
  const dir = path.join(REPO, 'packages', pkgDirName);
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

interface Loaded {
  charge: boolean;
  flat: Map<string, unknown>;
  attempts: string[];
}

async function loadPackage(pkgDirName: string): Promise<{ ns: Ns | null; attempts: string[] }> {
  const attempts: string[] = [];
  for (const s of specifiersForPackage(pkgDirName)) {
    try {
      const mod = (await import(s)) as Ns;
      return { ns: mod, attempts };
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  attempts.push(`paquet packages/${pkgDirName} : aucun specificateur n'a repondu`);
  return { ns: null, attempts };
}

let LOADED: Loaded = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  let unCharge = false;
  for (const pkg of ['scenario', 'activities']) {
    const { ns, attempts: a } = await loadPackage(pkg);
    attempts.push(...a);
    if (ns !== null) {
      flatten(ns, flat);
      unCharge = true;
    }
  }
  LOADED = { charge: unCharge, flat, attempts };
}, CASE_TIMEOUT_MS);

function assertPackagesLoaded(): void {
  exige(
    LOADED.charge,
    'packages-scenario-ou-activities-charges',
    `AUCUN-DES-DEUX-PAQUETS-N-A-PU-ETRE-CHARGE : ${LOADED.attempts.join(' | ')}`,
  );
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await thunk() };
  } catch {
    return { ok: false };
  }
}

/* ═══════════ navigation JSON generique (reprise T62/T64/T67) ═══════════ */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 12): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [
    { chemin: '$', cle: '', v: racine, p: 0 },
  ];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) {
        file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
      }
    }
  }
  return out;
}

function champValeur(r: unknown, alias: readonly string[]): unknown {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(r)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== undefined && n.valeur !== null) {
      return n.valeur;
    }
  }
  return undefined;
}

/* ═══════ les douze ensembles de regles — oracle (reprise T61.V/T67) ═════ */
// ADR-018:L61-65 et L86-155. Repris d'acceptance/T61.spec.ts (V) et
// d'acceptance/T67.spec.ts, suites ACCEPTEES, PROUVEES A HEAD : jamais
// recalcule ici.
const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const;
type Periode = (typeof PERIODES)[number];

const REGLES_ADR: Record<Periode, string[]> = {
  P1: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P2: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P3: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2'],
  P4: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1'],
  P5: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P6: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P7: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1'],
  P8: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ],
  P9: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1',
  ],
  P10: [
    'reserve@1', 'idempotence@1', 'priority@1', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'quota@1', 'history@1',
  ],
  P11: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1',
  ],
  P12: [
    'reserve@1', 'idempotence@1', 'fifo@2', 'cancel@4', 'isolation@1', 'capacity@1', 'price@1', 'history@1', 'transfer@1',
  ],
};
const PERIODES_P1_A_P4: Periode[] = ['P1', 'P2', 'P3', 'P4'];
const PERIODES_P5_A_P12: Periode[] = ['P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'];

/** II.1 — « regle active a partir de P5 » : absente de P1-P4, presente dans
 *  au moins une periode P5-P12. DERIVE de REGLES_ADR, jamais une liste ecrite
 *  a la main. */
function reglesActivesAPartirDeP5(): string[] {
  const avantP5 = new Set<string>();
  for (const p of PERIODES_P1_A_P4) for (const r of REGLES_ADR[p]) avantP5.add(r);
  const vues = new Set<string>();
  const out: string[] = [];
  for (const p of PERIODES_P5_A_P12) {
    for (const r of REGLES_ADR[p]) {
      if (avantP5.has(r) || vues.has(r)) continue;
      vues.add(r);
      out.push(r);
    }
  }
  return out;
}

/** Periodes ou une regle donnee est active, selon REGLES_ADR. */
function periodesActives(ruleId: string): Periode[] {
  return PERIODES.filter((p) => REGLES_ADR[p].includes(ruleId));
}

const REGLES_P5 = reglesActivesAPartirDeP5();

/* ═══════ operation dediee par regle (II.2, FIXE ICI) ════════════════════ */

const OPERATION_DEDIEE: Record<string, string[]> = {
  'capacity@1': ['set_capacity'],
  'priority@1': ['set_level'],
  'price@1': ['balance'],
  'history@1': ['history'],
  'transfer@1': ['transfer'],
  'quota@1': ['write'],
  'cancel@3': ['probe_cancel'],
  'cancel@4': ['probe_cancel'],
  'fifo@2': ['write'],
};

function operationsDedieesDe(ruleId: string): string[] {
  const ops = OPERATION_DEDIEE[ruleId];
  exige(
    Array.isArray(ops) && ops.length > 0,
    `operation-dediee-connue-pour-${ruleId}`,
    `AUCUNE-OPERATION-DEDIEE-FIXEE-POUR ${ruleId} dans OPERATION_DEDIEE (II.2) — REGLES_P5=${rendu(REGLES_P5)}.`,
  );
  return ops as string[];
}

/* ═══════ roles tolerants (III, FIXES ICI — aucune source ne les nomme) ══ */

const ROLES_SEQUENCES_PAR_REGLE = [
  'generateSequencesForRule',
  'buildDiscriminatingSequences',
  'buildDiscriminatingSequencesForRule',
  'discriminatingSequencesForRule',
  'sequencesForRule',
  'buildRuleSequences',
  'generateDiscriminatingSequences',
  'buildHiddenSequencesForRule',
] as const;

async function resoudreSequencesPourRegle(ruleId: string): Promise<unknown | null> {
  const args: unknown[] = [ruleId, { ruleId }, { rule: ruleId }, { ruleId, periodId: undefined }];
  for (const nom of ROLES_SEQUENCES_PAR_REGLE) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const arg of args) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(arg));
      if (res.ok && res.value !== null && res.value !== undefined) return res.value;
    }
  }
  return null;
}

async function requireSequencesPourRegle(ruleId: string): Promise<unknown> {
  const v = await resoudreSequencesPourRegle(ruleId);
  exige(
    v !== null,
    `sequences-${ruleId}-resolues`,
    `SEQUENCES-INTROUVABLES-POUR ${ruleId} parmi ${rendu([...ROLES_SEQUENCES_PAR_REGLE])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  return v;
}

/** Ensemble des noms d'operation (OPS_V4 ou non) presents comme VALEUR
 *  litterale quelque part dans la structure de sequences d'une regle —
 *  parcours de CETTE valeur seule (III.3), jamais du document entier. */
function operationsAppeleesDans(sequences: unknown): Set<string> {
  const vues = new Set<string>();
  for (const n of noeuds(sequences)) {
    if (typeof n.valeur === 'string') vues.add(n.valeur);
  }
  return vues;
}

const ROLES_CANDIDAT_FIDELE = [
  'createFullReferenceCandidate',
  'createReferenceCandidate',
  'buildReferenceCandidate',
  'referenceCandidate',
  'createFLongReferenceCandidate',
  'buildFLongReferenceCandidate',
] as const;

async function resoudreCandidatFidele(): Promise<unknown | null> {
  for (const nom of ROLES_CANDIDAT_FIDELE) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    const res = await essayer(() => (fn as (...a: unknown[]) => unknown)());
    if (res.ok && res.value !== null && res.value !== undefined) return res.value;
  }
  return null;
}

const ROLES_CANDIDAT_PRIVE = [
  'createReferenceCandidateWithoutRule',
  'buildDeprivedCandidate',
  'referenceCandidateWithout',
  'createCandidateMissingRule',
  'buildReferenceCandidateDeprivedOf',
  'createReferenceCandidateDeprivedOfRule',
] as const;

async function resoudreCandidatPrive(ruleId: string): Promise<unknown | null> {
  const args: unknown[] = [ruleId, { ruleId }, { withoutRule: ruleId }, { deprivedOf: ruleId }];
  for (const nom of ROLES_CANDIDAT_PRIVE) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const arg of args) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(arg));
      if (res.ok && res.value !== null && res.value !== undefined) return res.value;
    }
  }
  return null;
}

const ROLES_NOTATION = [
  'scoreCandidateOnRule',
  'scoreRule',
  'scoreSequencesForRule',
  'scoreCandidateForRule',
  'scoreCandidateOnRuleAtPeriod',
  'runAndScoreRule',
] as const;

/** Resout un score (nombre dans [0,1]) pour un couple (candidat, regle,
 *  periode). Plusieurs formes d'argument essayees (II.3) : aucune n'est
 *  imposee par ADR-019, qui decrit un CRITERE, jamais une signature. */
async function resoudreNotation(
  candidat: unknown,
  ruleId: string,
  periodId: Periode,
): Promise<number | null> {
  const argLists: unknown[][] = [
    [candidat, ruleId, periodId],
    [candidat, { ruleId, periodId }],
    [{ candidate: candidat, ruleId, periodId }],
    [{ candidate: candidat, rule: ruleId, period: periodId }],
  ];
  for (const nom of ROLES_NOTATION) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const args of argLists) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(...args));
      if (!res.ok) continue;
      let v: unknown = res.value;
      if (v !== null && typeof v === 'object') v = champValeur(v, ['score', 'ruleScore', 'value']);
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
  }
  return null;
}

async function requireNotation(candidat: unknown, ruleId: string, periodId: Periode): Promise<number> {
  const v = await resoudreNotation(candidat, ruleId, periodId);
  exige(
    v !== null,
    `notation-${ruleId}-${periodId}-resolue`,
    `NOTATION-INTROUVABLE pour regle=${ruleId} periode=${periodId} parmi ${rendu([...ROLES_NOTATION])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  return v as number;
}

/* ═══════════════════════════════ T68.A1 ════════════════════════════════ */

test(
  'T68.A1 — pour chaque regle active a partir de P5, un candidat de reference qui implemente toutes les regles de F-LONG obtient un score de 1 sur chaque regle active a chaque periode',
  async () => {
    assertPackagesLoaded();
    exige(
      REGLES_P5.length > 0,
      'regles-actives-a-partir-de-p5-non-vide',
      `REGLES_P5-VIDE : la derivation de II.1 n'a trouve aucune regle, REGLES_ADR=${rendu(REGLES_ADR)}`,
    );

    const candidat = await resoudreCandidatFidele();
    exige(
      candidat !== null,
      'candidat-fidele-resolu',
      `CANDIDAT-FIDELE-INTROUVABLE parmi ${rendu([...ROLES_CANDIDAT_FIDELE])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
    );

    for (const ruleId of REGLES_P5) {
      const periodes = periodesActives(ruleId);
      exige(
        periodes.length > 0,
        `regle-${ruleId}-a-au-moins-une-periode-active`,
        `${ruleId}-SANS-PERIODE-ACTIVE selon REGLES_ADR, alors qu'elle appartient a REGLES_P5.`,
      );
      for (const periodId of periodes) {
        const score = await requireNotation(candidat, ruleId, periodId);
        exige(
          score === 1,
          `score-fidele-${ruleId}-${periodId}-egal-1`,
          `SCORE-FIDELE-DIFFERENT-DE-1 pour regle=${ruleId} periode=${periodId} : score obtenu=${rendu(score)} (ADR-019:L104, « un score de 1 »).`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS * 2,
);

/* ═══════════════════════════════ T68.A2 ════════════════════════════════ */

test(
  'T68.A2 — pour chaque regle active a partir de P5, le meme candidat prive de cette seule regle obtient sur elle un score strictement inferieur a 1',
  async () => {
    assertPackagesLoaded();
    exige(
      REGLES_P5.length > 0,
      'regles-actives-a-partir-de-p5-non-vide-a2',
      `REGLES_P5-VIDE : la derivation de II.1 n'a trouve aucune regle, REGLES_ADR=${rendu(REGLES_ADR)}`,
    );

    for (const ruleId of REGLES_P5) {
      const prive = await resoudreCandidatPrive(ruleId);
      exige(
        prive !== null,
        `candidat-prive-de-${ruleId}-resolu`,
        `CANDIDAT-PRIVE-INTROUVABLE pour regle=${ruleId} parmi ${rendu([...ROLES_CANDIDAT_PRIVE])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
      );
      const periodes = periodesActives(ruleId);
      for (const periodId of periodes) {
        const score = await requireNotation(prive, ruleId, periodId);
        exige(
          score < 1,
          `score-prive-${ruleId}-${periodId}-strictement-inferieur-a-1`,
          `SCORE-PRIVE-EGAL-OU-SUPERIEUR-A-1 pour regle=${ruleId} periode=${periodId} : score obtenu=${rendu(score)} — exactement le defaut qu'ADR-019 (L24-29) denonce : une sequence qui ne discrimine pas la regle.`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS * 2,
);

/* ═══════════════════════════════ T68.A3 ════════════════════════════════ */

test(
  'T68.A3 — les sequences de chaque regle appellent au moins une fois chaque operation que la regle introduit',
  async () => {
    assertPackagesLoaded();
    exige(
      REGLES_P5.length > 0,
      'regles-actives-a-partir-de-p5-non-vide-a3',
      `REGLES_P5-VIDE : la derivation de II.1 n'a trouve aucune regle, REGLES_ADR=${rendu(REGLES_ADR)}`,
    );

    for (const ruleId of REGLES_P5) {
      const ops = operationsDedieesDe(ruleId);
      const sequences = await requireSequencesPourRegle(ruleId);
      const appelees = operationsAppeleesDans(sequences);
      for (const op of ops) {
        exige(
          appelees.has(op),
          `sequences-${ruleId}-appellent-${op}`,
          `OPERATION-DEDIEE-JAMAIS-APPELEE : regle=${ruleId} n'appelle jamais ${op} dans ses sequences (operations vues : ${rendu([...appelees])}).`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS * 2,
);
