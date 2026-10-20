/**
 * acceptance/T62.spec.ts — suite d'acceptation de la tache T62.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T62.A1 behaviour — l'enonce de chaque periode decrit chaque regle
 *                      active, et decrit chaque regle remplacee ou retiree
 *                      a cette periode comme telle
 *   T62.A2 behaviour — chaque nom de champ cite par un enonce est un nom du
 *                      contrat, et chaque forme de reponse (erreurs
 *                      comprises) que le modele attendu peut produire a au
 *                      moins un exemple public de cette forme exacte
 *   T62.A3 absence   — aucun exemple public ne reproduit une valeur
 *                      attendue par un controle de la periode
 *   T62.A4 absence   — l'enonce d'une periode ne decrit aucune regle d'une
 *                      periode ulterieure
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T62 EST UNE TACHE D'EXTENSION (ADR-018) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-018-scenario-long-et-contradictoire.md, lignes 182-188),
 * jamais le cahier directement. L'auteur de cette suite est AVEUGLE aux
 * `source_paths` que verification/tasks.extensions.json declare pour T62 —
 * `packages/activities`, `packages/scenario` — et ne les a lus ni
 * directement ni par `git show` (ADR-001 : aveuglement PROCEDURAL,
 * discipline auditable au diff, jamais une barriere technique). Le contrat
 * teste ci-dessous est derive de docs/specs/T62.md et de sa source, le MEME
 * document ACCEPTE, lignes 182-188, AINSI QUE du corps narratif du MEME
 * document hors de cette plage (« Le scenario F-LONG », L77-159) — la meme
 * liberte que prennent deja acceptance/T48.spec.ts a acceptance/T61.spec.ts
 * face a leur propre ADR.
 *
 *   L184  livrables, mot pour mot : « contrat `bench.candidate/3`
 *         (operations de F-LONG, dont la modification de capacite, le
 *         niveau, le solde, l'historique et le transfert) ; enonce de
 *         chaque periode de F-LONG ; exemples publics de chaque forme de
 *         reponse »
 *   L186  les quatre cas d'acceptation, mot pour mot
 *   L188  commande : `pnpm verify:task T62`. « Aucun service externe
 *         requis ; aucun appel reel. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions DEJA FIXEES par les
 * suites ACCEPTEES dont elle etend le socle (jamais les sources de T62) :
 *   - acceptance/T50.spec.ts (III) / acceptance/T52.spec.ts (III) : le
 *     contrat `bench.candidate/2` — six operations `create_tenant`,
 *     `advance_clock`, `write`, `read`, `probe_cancel`, `fingerprint` —
 *     REPRIS A L'IDENTIQUE, jamais re-derive.
 *   - acceptance/T48.spec.ts (III.2) : le protocole de transport NDJSON,
 *     `{"id","op","args"}` -> `{"id","ok":true,"result"}` ou `{"id",
 *     "ok":false,"error":{"code","message"}}` — REPRIS A L'IDENTIQUE : c'est
 *     ce que cette suite entend par « format exact des messages ».
 *   - acceptance/T53.spec.ts (socle) : le chargement ESM direct de
 *     `packages/scenario` et `packages/activities`, et la resolution
 *     tolerante d'un noeud de periode dans un objet ou un tableau —
 *     REIMPLEMENTEE A L'IDENTIQUE ici (meme discipline que acceptance/
 *     T56.spec.ts face a acceptance/T53.spec.ts).
 *   - acceptance/T61.spec.ts (V) : l'ensemble des regles actives par
 *     periode, RECALCULE depuis ADR-018 par une suite deja ACCEPTEE et
 *     PROUVEE a HEAD — repris comme oracle, jamais recalcule une seconde
 *     fois ici.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001 : aucune des valeurs ci-dessous
 * n'a ete obtenue en executant une implementation de T62 — aucun module de
 * T62 n'existe encore au moment ou elle est ecrite)
 *
 * 1. LES CINQ NOUVELLES OPERATIONS DE `bench.candidate/3` (ADR-018 L184 ne
 *    nomme que les CAPACITES, jamais les noms de methode) :
 *      `set_capacity {tenant_id,slot_id,capacity} -> {decision}`   (P5)
 *      `set_level    {tenant_id,actor,level}      -> {decision}`   (P6)
 *      `balance      {tenant_id,actor}            -> {balance}`    (P7)
 *      `history      {tenant_id,key}              -> {events}`     (P10)
 *      `transfer     {tenant_id,key,to_tenant_id} -> {decision}`   (P12)
 *    bench.candidate/3 = les SIX operations de bench.candidate/2 PLUS ces
 *    cinq. Le temoin du contrat (`porteContratV3`) accepte soit le marqueur
 *    litteral `bench.candidate/3`, soit au moins 7 des 11 noms d'operation.
 * 2. LA DESCRIPTION UNIFIEE, resolue par balayage de tous les exports
 *    top-level de `packages/scenario` et `packages/activities` : le premier
 *    objet qui porte A LA FOIS un temoin du contrat ET un noeud par periode
 *    (P1..P12) portant un enonce (meme geste qu'acceptance/T53.spec.ts
 *    III.1).
 * 3. LE TEXTE DE L'ENONCE D'UNE PERIODE : soit le retour d'une fonction
 *    exportee parmi `buildFLongPeriodStatement`, `buildPeriodStatement`,
 *    `statementForPeriod`, `buildCandidateStatement`, `periodStatement`,
 *    `buildFLongPeriodPrompt` (appelee avec la cle de periode sous
 *    plusieurs formes), soit, a defaut, le champ `statement`/`enonce`/
 *    `narrative`/`prose`/`text` du noeud de cette periode dans la
 *    description unifiee (meme double canal qu'acceptance/T53.spec.ts
 *    III.2).
 * 4. L'ENSEMBLE FERME DES JETONS « en_tiret_bas » du contrat
 *    (`FIELD_TOKENS_V3`), meme discipline qu'acceptance/T56.spec.ts (II.1) :
 *    tout jeton en minuscules joint par un ou plusieurs tirets bas que
 *    l'enonce cite doit appartenir a cet ensemble FERME, faute de quoi A2
 *    rougit nommement.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 *   Les 15 identifiants de regle (`reserve@1` .. `transfer@1`) et la table
 *   REGLES_ADR            — acceptance/T61.spec.ts (V), suite ACCEPTEE,
 *                            PROUVEE a HEAD ; recalcules par elle depuis
 *                            ADR-018 L61-65 et L86-155, jamais re-derives ici.
 *   `999`, `1000`, `1999` (P7) — acceptance/reference-long/F-LONG.json:
 *                            valeurs.P7.faits.{b_refund,balance_B,balance_C}
 *                            (ADR-018:L113-116) — le remboursement CONTROLE,
 *                            qu'A3 interdit a un exemple public.
 *   `3000` (P9)            — acceptance/reference-long/F-LONG.json:
 *                            valeurs.P9.faits.refund_at_deadline
 *                            (ADR-018:L130-131).
 *   `QUOTA_EXCEEDED`       — acceptance/reference-long/F-LONG.json:
 *                            valeurs.P8.faits.d_s6_result (ADR-018:L123,
 *                            litteral) — forme d'ERREUR exigee par A2.
 *   `NOT_FOUND`, valeur nulle (P12) — acceptance/reference-long/F-LONG.json:
 *                            valeurs.P12.faits.{b_s1_from_third,
 *                            b_s1_from_legacy} (ADR-018:L154-155).
 *   `bench.candidate/2`, ses six operations — acceptance/T50.spec.ts (III).
 *   protocole NDJSON `{"id","ok",...}` — acceptance/T48.spec.ts (III.2).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie pas les faits de F-LONG eux-memes (deja PROUVE par
 *    acceptance/T61.spec.ts) ni le contrat `bench.candidate/2` (deja PROUVE
 *    par acceptance/T50.spec.ts) : elle les tient pour ACQUIS.
 *  • Elle n'exerce aucune session reelle ni faux executable `claude` : aucun
 *    processus n'est lance (import ESM pur), ce qui fonde L188 (« aucun
 *    appel reel ») de la facon la plus forte possible.
 *  • L'etat qui dure a travers un redemarrage de processus (`BENCH_DATA_DIR`)
 *    est l'objet de T63 ; cette suite n'observe aucune persistance.
 *  • Le script public de verification de forme dans l'espace de travail du
 *    candidat (convention ADR-013/T56) n'est pas l'objet de T62 (ADR-018
 *    L184 ne le liste pas parmi les livrables de T62) : cette suite ne
 *    l'exige pas.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 30_000;

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

/* ═══════════════════ chargement de packages/scenario + packages/activities */

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

/* ═══════════════════ navigation JSON generique (reprise T53/T56) ═══════ */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 10): Noeud[] {
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

function champTexte(r: unknown, alias: readonly string[]): string | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(r)) {
    if (
      n.cle !== '' &&
      cible.has(normKey(n.cle)) &&
      typeof n.valeur === 'string' &&
      n.valeur.length > 0
    ) {
      return n.valeur;
    }
  }
  return null;
}

/* ═══════════════════ contrat bench.candidate/3 (II.1) ══════════════════ */

const MARQUEUR_CONTRAT_V3 = 'bench.candidate/3';
const OPS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint']; // acceptance/T50.spec.ts (III)
const OPS_V3_NOUVELLES = ['set_capacity', 'set_level', 'balance', 'history', 'transfer']; // FIXE ICI (II.1)
const OPS_V3 = [...OPS_V2, ...OPS_V3_NOUVELLES];

/** Un noeud porte-t-il un temoin DIRECT du contrat bench.candidate/3 — soit
 * le marqueur litteral, soit au moins 7 des 11 noms d'operation ? */
function porteContratV3(racine: unknown): boolean {
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && n.valeur === MARQUEUR_CONTRAT_V3) return true;
  }
  const vues = new Set<string>();
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && OPS_V3.includes(n.valeur)) vues.add(n.valeur);
  }
  return vues.size >= 7;
}

/* ═══════════════════ les douze periodes (II.2) ══════════════════════════ */

const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'] as const;
type Periode = (typeof PERIODES)[number];

function noeudPeriode(racine: unknown, cle: Periode): Json | null {
  const cibleNorm = normKey(cle);
  for (const n of noeuds(racine)) {
    if (
      n.cle !== '' &&
      normKey(n.cle) === cibleNorm &&
      n.valeur !== null &&
      typeof n.valeur === 'object' &&
      !Array.isArray(n.valeur)
    ) {
      return n.valeur as Json;
    }
  }
  const indexAttendu = PERIODES.indexOf(cle);
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur)) {
      for (const entree of n.valeur) {
        if (entree === null || typeof entree !== 'object') continue;
        const idTexte = champTexte(entree, ['id', 'key', 'period', 'periode', 'periodid', 'periodkey']);
        if (idTexte !== null && normKey(idTexte) === cibleNorm) return entree as Json;
      }
    }
  }
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur) && n.valeur.length === PERIODES.length) {
      const entree = n.valeur[indexAttendu];
      if (
        entree !== null &&
        typeof entree === 'object' &&
        champTexte(entree, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null
      ) {
        return entree as Json;
      }
    }
  }
  return null;
}

/* ═══════════════ resolution de LA description unifiee (II.2) ═══════════ */

const NOM_AGREGAT_DES_EXPORTS = '(ensemble des exports aplatis)';

function candidatsDescription(): { nom: string; valeur: unknown }[] {
  const out: { nom: string; valeur: unknown }[] = [];
  for (const [k, v] of LOADED.flat.entries()) {
    if (v !== null && typeof v === 'object') out.push({ nom: k, valeur: v });
  }
  out.push({ nom: NOM_AGREGAT_DES_EXPORTS, valeur: Object.fromEntries(LOADED.flat.entries()) });
  return out;
}

function enonceDeNoeud(noeud: Json | null): string | null {
  if (noeud === null) return null;
  return champTexte(noeud, ['statement', 'enonce', 'narrative', 'prose', 'text']);
}

function resoudreDescriptionUnifiee(): { valeur: Json; nom: string } | null {
  for (const c of candidatsDescription()) {
    if (!porteContratV3(c.valeur)) continue;
    let periodesAvecEnonce = 0;
    for (const p of PERIODES) {
      if (enonceDeNoeud(noeudPeriode(c.valeur, p)) !== null) periodesAvecEnonce += 1;
    }
    if (periodesAvecEnonce >= 2) return { valeur: c.valeur as Json, nom: c.nom };
  }
  return null;
}

function requireDescriptionUnifiee(): Json {
  const r = resoudreDescriptionUnifiee();
  exige(
    r !== null,
    'description-unifiee-resolue',
    `DESCRIPTION-UNIFIEE-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT_V3} et au moins deux enonces de periode. Exports vus : ${rendu([...LOADED.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}

/* ═══════════════ le texte de l'enonce d'une periode (II.3) ═════════════ */

const ROLES_STATEMENT_BUILDER = [
  'buildFLongPeriodStatement',
  'buildPeriodStatement',
  'statementForPeriod',
  'buildCandidateStatement',
  'periodStatement',
  'buildFLongPeriodPrompt',
] as const;

function extraireTexte(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (v !== null && typeof v === 'object') return champTexte(v, ['statement', 'enonce', 'prompt', 'text']);
  return null;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await thunk() };
  } catch {
    return { ok: false };
  }
}

async function enonceDePeriode(cle: Periode, description: Json): Promise<string | null> {
  const index0 = PERIODES.indexOf(cle);
  const args: unknown[] = [cle, cle.toLowerCase(), index0, index0 + 1, { period: cle }, { periodKey: cle }];
  for (const nom of ROLES_STATEMENT_BUILDER) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const arg of args) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(arg));
      if (!res.ok) continue;
      const texte = extraireTexte(res.value);
      if (texte !== null) return texte;
    }
  }
  return enonceDeNoeud(noeudPeriode(description, cle));
}

async function requireEnonce(cle: Periode, description: Json): Promise<string> {
  const texte = await enonceDePeriode(cle, description);
  exige(
    texte !== null,
    `enonce-${cle}-resolu`,
    `ENONCE-INTROUVABLE-POUR ${cle} : aucune des fonctions ${rendu([...ROLES_STATEMENT_BUILDER])} n'a rendu de texte, et le noeud de periode de la description unifiee ne porte aucun champ statement/enonce/narrative/prose/text.`,
  );
  return (texte as string).toLowerCase();
}

/* ═══════ les douze ensembles de regles actives — oracle (III) ══════════ */
// Reprise A L'IDENTIQUE de acceptance/T61.spec.ts (V) — suite ACCEPTEE,
// PROUVEE a HEAD, elle-meme recalculee depuis ADR-018 L61-65 et L86-155.
// Jamais re-derivee ici (ADR-001).

const REGLES_ADR: Record<Periode, string[]> = {
  P1: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P2: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@1'],
  P3: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2'],
  P4: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1'],
  P5: ['reserve@1', 'idempotence@1', 'fifo@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P6: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@2', 'isolation@1', 'capacity@1'],
  P7: ['reserve@1', 'idempotence@1', 'priority@1', 'cancel@3', 'isolation@1', 'capacity@1', 'price@1'],
  P8: [
    'reserve@1',
    'idempotence@1',
    'priority@1',
    'cancel@3',
    'isolation@1',
    'capacity@1',
    'price@1',
    'quota@1',
  ],
  P9: [
    'reserve@1',
    'idempotence@1',
    'priority@1',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'quota@1',
  ],
  P10: [
    'reserve@1',
    'idempotence@1',
    'priority@1',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'quota@1',
    'history@1',
  ],
  P11: [
    'reserve@1',
    'idempotence@1',
    'fifo@2',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'history@1',
  ],
  P12: [
    'reserve@1',
    'idempotence@1',
    'fifo@2',
    'cancel@4',
    'isolation@1',
    'capacity@1',
    'price@1',
    'history@1',
    'transfer@1',
  ],
};

/** Periode de PREMIERE introduction de chaque identifiant de regle — deduite
 * de REGLES_ADR (meme accord que ADR-018 L86-155 : un identifiant « neuf »,
 * jamais vu a une periode anterieure, nait a cette periode). */
const INTRO_PERIODE: Record<string, Periode> = (() => {
  const out: Record<string, Periode> = {};
  const vus = new Set<string>();
  for (const p of PERIODES) {
    for (const r of REGLES_ADR[p]) {
      if (!vus.has(r)) {
        vus.add(r);
        out[r] = p;
      }
    }
  }
  return out;
})();

/** Transitions : regle REMPLACEE a la periode donnee (ADR-018 L86-155). */
const REMPLACEE_A: Partial<Record<Periode, string[]>> = {
  P3: ['cancel@1'],
  P6: ['fifo@1'],
  P7: ['cancel@2'],
  P9: ['cancel@3'],
  P11: ['priority@1'],
};
/** Transitions : regle RETIREE a la periode donnee (ADR-018 L142-143). */
const RETIREE_A: Partial<Record<Periode, string[]>> = {
  P11: ['quota@1'],
};

/* ═══════ litteraux geles de controle — oracle F-LONG (III) ═════════════ */

const REFERENCE_LONG_DIR = path.join(REPO, 'acceptance', 'reference-long');
const LONG = JSON.parse(fs.readFileSync(path.join(REFERENCE_LONG_DIR, 'F-LONG.json'), 'utf8')) as Json;

function refValue(doc: Json, dotted: string): unknown {
  let cur: unknown = doc;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[seg];
  }
  return cur;
}
/** Fait attendu `valeurs.<periode>.faits.<cle>.valeur` de F-LONG.json. */
function FAIT(periode: string, cle: string): unknown {
  return refValue(LONG, `valeurs.${periode}.faits.${cle}.valeur`);
}

/** Valeurs numeriques CONTROLEES par periode (A3) : chaque nombre > 3 en
 * valeur absolue porte par un fait de cette periode — les petits entiers
 * (0,1,2,3) sont exclus, trop frequents dans la prose pour servir d'ancrage
 * sans faux positif. */
function valeursControleesNumeriques(periode: Periode): number[] {
  const noeud = refValue(LONG, `valeurs.${periode}.faits`);
  if (noeud === null || typeof noeud !== 'object') return [];
  const out: number[] = [];
  for (const cle of Object.keys(noeud as Json)) {
    const v = FAIT(periode, cle);
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) > 3) out.push(Math.abs(v));
  }
  return [...new Set(out)];
}

/* ═══════════════════ detecteur de proximite (A2, formes de reponse) ═══ */

/** Vrai si CHAQUE motif de `motifs` apparait dans `texte`, et s'il existe au
 * moins une occurrence du PREMIER motif pour laquelle TOUS les autres
 * apparaissent dans une fenetre de `fenetre` caracteres autour d'elle. */
function motifsProches(texte: string, motifs: string[], fenetre = 400): boolean {
  if (motifs.length === 0) return true;
  const [premier, ...reste] = motifs;
  let depart = 0;
  for (;;) {
    const i = texte.indexOf((premier as string).toLowerCase(), depart);
    if (i === -1) return false;
    const lo = Math.max(0, i - fenetre);
    const hi = Math.min(texte.length, i + (premier as string).length + fenetre);
    const fenetreTexte = texte.slice(lo, hi);
    if (reste.every((m) => fenetreTexte.includes(m.toLowerCase()))) return true;
    depart = i + 1;
  }
}

/* ═══════════════════ ensemble ferme des jetons du contrat (II.4) ═══════ */

const FIELD_TOKENS_V3 = new Set(
  [
    'tenant_id',
    'admission_seq',
    'operation_key',
    'create_tenant',
    'advance_clock',
    'probe_cancel',
    'set_capacity',
    'set_level',
    'slot_id',
    'to_tenant_id',
    // Les deux SEULS codes d'erreur qu'ADR-018 nomme litteralement
    // (QUOTA_EXCEEDED L123, NOT_FOUND L155) et que A2(b), plus bas dans ce
    // meme cas, EXIGE en exemple public de forme EXACTE (FORMES_REQUISES) —
    // sans cette exception le vocabulaire ferme de A2(a) et l'exigence
    // d'exemple public de A2(b) se contrediraient pour TOUTE implementation
    // valide : requireEnonce() renvoie le texte en minuscules, donc ces deux
    // codes, quelle que soit leur casse dans la source, sont systematiquement
    // vus par jetonsSoulignes() comme des jetons "en_tiret_bas". Ce ne sont
    // pas des noms de champ du contrat, mais les deux valeurs d'erreur REELLES
    // que le modele attendu produit (deja PROUVEES par acceptance/
    // T61.spec.ts / packages/oracle/src/f-long.ts) — fermer le vocabulaire
    // sans elles rendrait A2 insatisfiable, jamais discriminant.
    'quota_exceeded',
    'not_found',
  ].map((s) => s.toLowerCase()),
);

/** Tous les jetons "en_tiret_bas" (minuscules, un ou plusieurs `_`) cites par
 * un texte — meme heuristique qu'acceptance/T56.spec.ts (II.1) : le francais
 * n'ecrit jamais ainsi, un tel jeton est donc presque surement une reference
 * a un nom de champ. */
function jetonsSoulignes(texte: string): string[] {
  const m = texte.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g);
  return m === null ? [] : [...new Set(m)];
}

/* ═══════════════════════════════ T62.A1 ═══════════════════════════════ */

test(
  "T62.A1 — l'enonce de chaque periode decrit chaque regle active, et decrit chaque regle remplacee ou retiree a cette periode comme telle",
  async () => {
    assertPackagesLoaded();
    const description = requireDescriptionUnifiee();

    const enonces = new Map<Periode, string>();
    for (const p of PERIODES) {
      enonces.set(p, await requireEnonce(p, description));
    }

    // (a) Presence cumulative : chaque regle active a la periode p figure
    // litteralement dans l'enonce de p (identifiant au sens d'ADR-018, ex.
    // `cancel@2`, `capacity@1`).
    for (const p of PERIODES) {
      const texte = enonces.get(p) as string;
      for (const regle of REGLES_ADR[p]) {
        exige(
          texte.includes(regle.toLowerCase()),
          `${p}-enonce-la-regle-active-${regle}`,
          `${p}-N-ENONCE-PAS-LA-REGLE-ACTIVE ${regle} : ${court(texte)}`,
        );
      }
    }

    // (b) Chaque regle REMPLACEE a une periode de transition est decrite
    // COMME TELLE : son identifiant figure encore dans l'enonce de cette
    // periode, ACCOMPAGNE d'un marqueur de remplacement (« remplac… »).
    // ANCRAGE DECISIF (cases.extensions.lock.json#T62.A1) : P7 doit enoncer
    // que cancel@2 est remplacee.
    for (const p of PERIODES) {
      const remplacees = REMPLACEE_A[p] ?? [];
      const texte = enonces.get(p) as string;
      for (const ancienne of remplacees) {
        exige(
          texte.includes(ancienne.toLowerCase()),
          `${p}-enonce-encore-la-regle-remplacee-${ancienne}`,
          `${p}-N-ENONCE-PLUS ${ancienne} (remplacee a cette periode, mais doit encore etre NOMMEE comme telle) : ${court(texte)}`,
        );
        exige(
          /remplac/.test(texte),
          `${p}-enonce-marque-le-remplacement-de-${ancienne}`,
          `${p}-NE-MARQUE-PAS-LE-REMPLACEMENT-DE ${ancienne} (aucun marqueur « remplac… » dans l'enonce) : ${court(texte)}`,
        );
      }
    }

    // (c) Chaque regle RETIREE est decrite comme telle : son identifiant
    // figure encore, accompagne d'un marqueur de retrait (« retir… »).
    for (const p of PERIODES) {
      const retirees = RETIREE_A[p] ?? [];
      const texte = enonces.get(p) as string;
      for (const ancienne of retirees) {
        exige(
          texte.includes(ancienne.toLowerCase()),
          `${p}-enonce-encore-la-regle-retiree-${ancienne}`,
          `${p}-N-ENONCE-PLUS ${ancienne} (retiree a cette periode, mais doit encore etre NOMMEE comme telle) : ${court(texte)}`,
        );
        exige(
          /retir/.test(texte),
          `${p}-enonce-marque-le-retrait-de-${ancienne}`,
          `${p}-NE-MARQUE-PAS-LE-RETRAIT-DE ${ancienne} (aucun marqueur « retir… » dans l'enonce) : ${court(texte)}`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T62.A2 ═══════════════════════════════ */

test(
  "T62.A2 — chaque nom de champ cite par un enonce est un nom du contrat, et chaque forme de reponse (erreurs comprises) a au moins un exemple public de cette forme exacte",
  async () => {
    assertPackagesLoaded();
    const description = requireDescriptionUnifiee();

    // (a) Vocabulaire FERME : tout jeton "en_tiret_bas" cite par l'enonce
    // d'une periode appartient a FIELD_TOKENS_V3.
    for (const p of PERIODES) {
      const texte = await requireEnonce(p, description);
      const jetons = jetonsSoulignes(texte);
      const inconnus = jetons.filter((j) => !FIELD_TOKENS_V3.has(j));
      exige(
        inconnus.length === 0,
        `${p}-vocabulaire-ferme-au-contrat`,
        `${p}-CITE-DES-JETONS-HORS-DU-CONTRAT ${rendu(inconnus)} (jetons vus : ${rendu(jetons)})`,
      );
    }

    // (b) Chaque forme de reponse exigee a un exemple public de forme
    // EXACTE — enveloppe NDJSON etablie par acceptance/T48.spec.ts (III.2).
    // ANCRAGE DECISIF (cases.extensions.lock.json#T62.A2) : P8 doit porter
    // un exemple public de la reponse QUOTA_EXCEEDED.
    const FORMES_REQUISES: { periode: Periode; libelle: string; motifs: string[] }[] = [
      { periode: 'P8', libelle: 'erreur QUOTA_EXCEEDED (quota@1, ADR-018:L123)', motifs: ['ok":false', 'quota_exceeded'] },
      { periode: 'P12', libelle: 'erreur NOT_FOUND (transfer, lecture depuis third, ADR-018:L155)', motifs: ['ok":false', 'not_found'] },
      { periode: 'P12', libelle: 'valeur nulle (transfer, lecture depuis legacy, ADR-018:L154-155)', motifs: ['ok":true', 'null'] },
    ];
    for (const { periode, libelle, motifs } of FORMES_REQUISES) {
      const texte = await requireEnonce(periode, description);
      exige(
        motifsProches(texte, motifs),
        `${periode}-exemple-public-de-${libelle}`,
        `${periode}-SANS-EXEMPLE-PUBLIC-DE ${libelle} (motifs attendus ${rendu(motifs)} co-presents) : ${court(texte)}`,
      );
    }
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T62.A3 ═══════════════════════════════ */

test(
  "T62.A3 — aucun exemple public ne reproduit une valeur attendue par un controle de la periode",
  async () => {
    assertPackagesLoaded();
    const description = requireDescriptionUnifiee();

    // Ancrage gele independant (cases.extensions.lock.json#T62.A3) : 999
    // (b_refund de P7, ADR-018:L113-114) est litteralement la valeur citee
    // par la perturbation prescrite ; elle doit etre absente de l'enonce
    // (donc de tout exemple public) de P7.
    egal(FAIT('P7', 'b_refund'), 999, 'reference-long.P7.b_refund'); // ADR-018:L113-114
    egal(FAIT('P9', 'refund_at_deadline'), 3000, 'reference-long.P9.refund_at_deadline'); // ADR-018:L130-131

    for (const p of PERIODES) {
      const valeurs = valeursControleesNumeriques(p);
      if (valeurs.length === 0) continue;
      const texte = await requireEnonce(p, description);
      for (const v of valeurs) {
        const motif = new RegExp(`\\b${String(v)}\\b`);
        exige(
          !motif.test(texte),
          `${p}-exemple-public-ne-reproduit-pas-${String(v)}`,
          `${p}-EXEMPLE-PUBLIC-REPRODUIT-UNE-VALEUR-CONTROLEE ${String(v)} : ${court(texte)}`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS,
);

function egal(obtenu: unknown, attendu: unknown, quoi: string): void {
  const o = rendu(obtenu);
  const a = rendu(attendu);
  expect(o === a ? 'egal' : `DIVERGENT ${quoi} : obtenu=${o} attendu=${a}`).toBe('egal');
}

/* ═══════════════════════════════ T62.A4 ═══════════════════════════════ */

test(
  "T62.A4 — l'enonce d'une periode ne decrit aucune regle d'une periode ulterieure",
  async () => {
    assertPackagesLoaded();
    const description = requireDescriptionUnifiee();

    // Ancrage gele decisif (cases.extensions.lock.json#T62.A4) : l'enonce de
    // P5 ne doit pas mentionner priority@1 (introduite en P6).
    const indexParPeriode = new Map(PERIODES.map((p, i) => [p, i]));

    for (const p of PERIODES) {
      const texte = await requireEnonce(p, description);
      const futures = Object.entries(INTRO_PERIODE).filter(
        ([, intro]) => (indexParPeriode.get(intro) as number) > (indexParPeriode.get(p) as number),
      );
      for (const [regle] of futures) {
        exige(
          !texte.includes(regle.toLowerCase()),
          `${p}-n-enonce-pas-la-regle-ulterieure-${regle}`,
          `${p}-ENONCE-DEJA-UNE-REGLE-ULTERIEURE ${regle} (introduite a ${INTRO_PERIODE[regle]}) : ${court(texte)}`,
        );
      }
    }
  },
  CASE_TIMEOUT_MS,
);
