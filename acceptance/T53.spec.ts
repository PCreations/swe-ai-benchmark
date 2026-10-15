/**
 * acceptance/T53.spec.ts — suite d'acceptation de la tache T53.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T53.A1 behaviour — le prompt de chaque periode contient l'enonce des
 *                      regles actives a cette periode — capacite du
 *                      creneau, statuts, file d'attente ordonnee par
 *                      sequence d'admission, annulation et sa frontiere,
 *                      rejeu d'une cle d'operation, isolation des
 *                      locataires — et aucune regle d'une periode suivante
 *   T53.A2 behaviour — chaque valeur de reponse que le modele attendu peut
 *                      produire a cette periode figure litteralement dans
 *                      l'enonce de cette periode
 *   T53.A3 behaviour — chaque parametre employe par le modele attendu a
 *                      cette periode — debut du creneau, preavis
 *                      d'annulation, frontiere incluse ou exclue — figure
 *                      dans l'enonce de cette periode
 *   T53.A4 absence   — le prompt ne contient ni verdict de controle, ni le
 *                      champ `satisfied`, ni valeur attendue calculee pour
 *                      la periode
 *   T53.A5 behaviour — l'enonce et le vocabulaire du modele attendu sont
 *                      declares dans la MEME description exportee que le
 *                      contrat `bench.candidate/2`
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T53 EST UNE TACHE D'EXTENSION (ADR-011) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T53 — `packages/
 * activities` et `packages/scenario` — et ne les a lus ni directement ni
 * par `git show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au
 * diff, pas une barriere technique). Le contrat teste ci-dessous est derive
 * de docs/specs/T53.md et de sa source, docs/adr/ADR-011-enonce-des-
 * exigences-pour-le-candidat.md, lignes 103 a 109 (la plage que la carte de
 * T53 epingle dans verification/tasks.extensions.json#spec_source) :
 *
 *   L103  titre : « Donner au candidat l'enonce des exigences »
 *   L105  dependances T52 ; livrables, mot pour mot : « pour chaque periode
 *         du scenario de demonstration, un enonce en langue naturelle des
 *         regles F-RESERVATION actives a cette periode, avec le vocabulaire
 *         et les parametres du modele attendu, declare dans la description
 *         exportee du contrat et inclus dans le prompt de la periode »
 *   L107  les cinq cas d'acceptation, mot pour mot — seule ligne qui nomme
 *         litteralement `satisfied`
 *   L109  commande : `pnpm verify:task T53`. « Aucun appel reel n'est
 *         necessaire. »
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * POURQUOI CETTE SUITE N'INVOQUE NI LA CLI NI POSTGRESQL NI S3
 *
 * verification/tasks.extensions.json#T53.requires vaut `["node22"]`
 * SEULEMENT — ni `postgres18` ni `s3`, a la difference de T46/T48/T49/T50/
 * T51/T52 (qui conduisent une periode de bout en bout via `apps/cli` et
 * persistent). Le livrable de T53 (L105) est une DESCRIPTION EXPORTEE et un
 * texte de PROMPT qui en derive — deux objets qui existent AVANT toute
 * session, toute persistance ou tout processus candidat. Cette suite les
 * observe donc au niveau du PAQUET (import ESM direct de `packages/
 * scenario` et `packages/activities`, les deux `source_paths` de T53),
 * EXACTEMENT la posture d'acceptance/T47.spec.ts face a `packages/agents`
 * (meme `requires=["node22"]` seul, meme absence de CLI/Postgres/S3) — et
 * JAMAIS celle d'acceptance/T48.spec.ts ou T50.spec.ts, qui exercent
 * `packages/scenario`/`packages/activities` UNIQUEMENT via `apps/cli` parce
 * que LEURS livrables (un espace de travail controle, une session qui
 * developpe) n'existent qu'une fois une periode reellement conduite.
 * Aucune des deux suites precedentes n'important ces paquets directement,
 * cette suite ne peut PAS reprendre un nom d'export deja etabli : les roles
 * ci-dessous (III) sont FIXES ICI, pour la premiere fois.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CE QUI EST FIXE PAR CETTE SUITE (aucun export de T53 n'existe ailleurs
 * dans le depot au moment ou elle est ecrite — ADR-001, meme situation que
 * acceptance/T47.spec.ts face a `packages/agents`)
 *
 * 1. UNE SEULE DESCRIPTION EXPORTEE (A5), resolue par balayage de TOUS les
 *    exports top-level de `packages/scenario` ET `packages/activities` :
 *    le premier objet qui porte A LA FOIS (a) un temoin du contrat
 *    `bench.candidate/2` (le marqueur litteral ou les six noms
 *    d'operation DEJA fixes par acceptance/T50.spec.ts III) et (b) au
 *    moins un noeud par periode (P1..P4, cf. IV) portant un enonce. Si
 *    aucun objet ne porte les deux a la fois — par exemple parce que le
 *    vocabulaire est declare dans un export SEPARE, « une copie locale
 *    divergente » — cette resolution echoue et A1-A5 le signalent tous
 *    nommement : c'est exactement le danger qu'A5 nomme.
 * 2. LE PROMPT D'UNE PERIODE (A1-A4) : soit le retour d'une fonction
 *    exportee parmi `buildPeriodPrompt`, `buildCandidatePeriodPrompt`,
 *    `promptForPeriod`, `buildCandidatePromptForPeriod`, `periodPrompt`,
 *    `buildDemoPeriodPrompt` (appelee avec la cle de periode sous
 *    plusieurs formes, cf. socle), soit, a defaut, le champ `prompt` du
 *    noeud de cette periode dans la description unifiee (1). Les DEUX
 *    canaux sont acceptes car ADR-011 ne nomme aucune fonction — seule la
 *    DESCRIPTION EXPORTEE (L105) est nommee.
 * 3. LES QUATRE PERIODES DU SCENARIO DE DEMONSTRATION, P1..P4 — PAS une
 *    invention de cette suite : acceptance/reference/F-RESERVATION.json
 *    (zone REFERENCE, gelee par docs/FROZEN_ROOTS.json) les nomme
 *    explicitement (`valeurs.horloges_des_periodes.P1..P4`), et
 *    verification/cases.extensions.lock.json#T53.A1/A2 les cite
 *    nommement dans leurs perturbations (« l'enonce de P3 », « l'enonce de
 *    P2 »).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * PROVENANCE DES LITTERAUX — chaque valeur comparee ci-dessous porte un
 * commentaire resolvable.
 *
 *   `bench.candidate/2`, les six operations                — acceptance/T50.spec.ts (III)
 *   P1..P4                                                   — acceptance/reference/F-RESERVATION.json:valeurs.horloges_des_periodes
 *   `S1` (identifiant du creneau)                             — acceptance/reference/F-RESERVATION.json:valeurs.creneau.id (cahier_line 119)
 *   `2030-01-03T12:00:00Z` (debut du creneau)                 — acceptance/reference/F-RESERVATION.json:valeurs.creneau.debut (cahier_line 119)
 *   `waiting`                                                 — cases.extensions.lock.json:T53.A2 (perturbation : « retirer `waiting` de l'enonce de P2 »)
 *   `2030-01-02T12:00:00Z` (frontiere d'annulation, P3)       — acceptance/reference/F-RESERVATION.json:valeurs.P3.frontiere (cahier_line 119)
 *   `24` (preavis d'annulation, heures, P3)                   — acceptance/reference/F-RESERVATION.json:valeurs.P3.delai_heures (cahier_line 119)
 *   frontiere INCLUSE (P3)                                    — acceptance/reference/F-RESERVATION.json:valeurs.P3.frontiere_incluse (cahier_line 119)
 *   `NOT_FOUND` (verdict inter-locataire, P4)                 — acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant (cahier_line 123)
 *   `satisfied`                                               — source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L107
 *
 * Les six noms de role de prompt-builder (III.2) et le nom de role de la
 * description unifiee (III.1) sont FIXES ICI (aucune source ne les nomme) —
 * meme discipline que `launchClaudeCliPeriod` pour acceptance/T47.spec.ts.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie pas que le prompt porte la description complete du
 *    contrat `bench.candidate/2` (nom et forme de chaque operation) : c'est
 *    deja PROUVE par acceptance/T50.spec.ts (A3), tenu pour ACQUIS ici.
 *  • Elle n'exerce aucune session reelle ni faux executable `claude` :
 *    aucun processus n'est lance par cette suite (import ESM pur), ce qui
 *    fonde L109 (« aucun appel reel n'est necessaire ») de la facon la plus
 *    forte possible — il n'existe ici rien qui PUISSE invoquer `claude`.
 *  • Elle n'exige aucune langue precise pour l'enonce en prose (francais ou
 *    anglais) : les assertions portent sur des LITTERAUX geles (identifiants,
 *    horodatages, le mot `waiting` fixe par le registre) et sur le contenu
 *    DYNAMIQUE declare par la description elle-meme (vocabulaire,
 *    parametres), jamais sur un gabarit de phrase.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 30_000;

/* ────────────────────────────────────────────────────────────────── socle
 * (repris sans le reinventer de acceptance/T47.spec.ts / T49.spec.ts / T52.spec.ts)
 */

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

/* ─────────────────────────────── navigation JSON generique (reprise T52) */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 10): Noeud[] {
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
const champTexte = (r: unknown, alias: readonly string[]): string | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'string' && v.valeur.length > 0 ? v.valeur : null;
};
const nombre = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : NaN;
const champNombre = (r: unknown, alias: readonly string[]): number | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
const champBool = (r: unknown, alias: readonly string[]): boolean | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'boolean' ? v.valeur : null;
};
/* ═══════════════════ chargement de packages/scenario + packages/activities ═══ */

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
  for (const rel of ['dist/index.js', 'src/index.ts', 'index.ts']) {
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

/* ═══════════════════════ contrat bench.candidate/2 (repris T50, non reverifie) */

const MARQUEUR_CONTRAT = 'bench.candidate/2'; // acceptance/T50.spec.ts (III)
const NOMS_OPERATIONS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint']; // acceptance/T50.spec.ts (III)

/** Un noeud porte-t-il un temoin DIRECT du contrat bench.candidate/2 — soit
 * le marqueur litteral, soit les six noms d'operation (au moins quatre
 * d'entre eux, pour tolerer une forme qui les repartirait differemment) ? */
function portecontratV2(racine: unknown): boolean {
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && n.valeur === MARQUEUR_CONTRAT) return true;
  }
  let trouvees = 0;
  const vusOps = new Set<string>();
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && NOMS_OPERATIONS_V2.includes(n.valeur) && !vusOps.has(n.valeur)) {
      vusOps.add(n.valeur);
      trouvees += 1;
    }
  }
  return trouvees >= 4;
}

/* ═══════════════════════════════ periodes P1..P4 (III.3, IV) */

const PERIODES = ['P1', 'P2', 'P3', 'P4'] as const;
type Periode = (typeof PERIODES)[number];

/** Trouve, dans `racine`, le noeud-objet qui represente la periode `cle`
 * (P1..P4) : soit une cle directe normalisee egale a `cle` portant un objet,
 * soit une entree de tableau dont un champ id/key/period/periode egale
 * `cle`, soit une entree de tableau dont l'INDEX (0-based) correspond au
 * numero de periode (P1 -> index 0). */
function noeudPeriode(racine: unknown, cle: Periode): Json | null {
  const cibleNorm = normKey(cle);
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && normKey(n.cle) === cibleNorm && n.valeur !== null && typeof n.valeur === 'object' && !Array.isArray(n.valeur)) {
      return n.valeur as Json;
    }
  }
  const indexAttendu = PERIODES.indexOf(cle);
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur)) {
      for (let i = 0; i < n.valeur.length; i += 1) {
        const entree = n.valeur[i];
        if (entree === null || typeof entree !== 'object') continue;
        const idTexte = champTexte(entree, ['id', 'key', 'period', 'periode', 'periodid', 'periodkey']);
        if (idTexte !== null && normKey(idTexte) === cibleNorm) return entree as Json;
      }
    }
  }
  // dernier recours : tableau dont l'index correspond, SANS id explicite,
  // mais seulement si chaque entree porte un enonce (sinon ce n'est
  // probablement pas le tableau des periodes).
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur) && n.valeur.length === PERIODES.length) {
      const entree = n.valeur[indexAttendu];
      if (entree !== null && typeof entree === 'object' && champTexte(entree, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) {
        return entree as Json;
      }
    }
  }
  return null;
}

/* ═══════════════════ resolution de LA description unifiee (III.1, A5) ═══ */

/** Tous les objets candidats : chaque export top-level, PLUS la map
 * aplatie entiere consideree comme UN SEUL objet (cas d'un module qui
 * exporterait directement les champs au lieu d'un objet nomme). */
function candidatsDescription(): { nom: string; valeur: unknown }[] {
  const out: { nom: string; valeur: unknown }[] = [];
  for (const [k, v] of LOADED.flat.entries()) {
    if (v !== null && typeof v === 'object') out.push({ nom: k, valeur: v });
  }
  out.push({ nom: '(ensemble des exports aplatis)', valeur: Object.fromEntries(LOADED.flat.entries()) });
  return out;
}

/** LA description unifiee (III.1) : le PREMIER candidat qui porte a la fois
 * un temoin du contrat bench.candidate/2 ET au moins DEUX noeuds de
 * periode distincts portant un enonce. Absence : aucun candidat ne
 * satisfait les deux a la fois (danger nomme par A5). */
function resoudreDescriptionUnifiee(): { valeur: Json; nom: string } | null {
  for (const c of candidatsDescription()) {
    if (!portecontratV2(c.valeur)) continue;
    let periodesAvecEnonce = 0;
    for (const p of PERIODES) {
      const n = noeudPeriode(c.valeur, p);
      if (n !== null && champTexte(n, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) periodesAvecEnonce += 1;
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
    `DESCRIPTION-UNIFIEE-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT} et au moins deux enonces de periode. Exports vus : ${rendu([...LOADED.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}

/* ═══════════════════ le prompt d'une periode (III.2) ═══════════════════ */

const ROLES_PROMPT_BUILDER = [
  'buildPeriodPrompt',
  'buildCandidatePeriodPrompt',
  'promptForPeriod',
  'buildCandidatePromptForPeriod',
  'periodPrompt',
  'buildDemoPeriodPrompt',
] as const;

function extraireTexte(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (v !== null && typeof v === 'object') return champTexte(v, ['prompt', 'prompttext', 'text', 'p']);
  return null;
}

async function essayer<T>(thunk: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    return { ok: true, value: await thunk() };
  } catch (err) {
    return { ok: false, err };
  }
}

/** Le texte du prompt d'une periode (III.2) : essaie chaque fonction-role
 * candidate avec plusieurs formes d'argument, puis retombe sur le champ
 * `prompt` du noeud de periode de la description unifiee. */
async function promptDePeriode(cle: Periode, description: Json): Promise<{ texte: string; via: string } | null> {
  const index0 = PERIODES.indexOf(cle);
  const arguments_: unknown[] = [cle, cle.toLowerCase(), index0, index0 + 1, { period: cle }, { periodKey: cle }, { period: cle, description }];
  for (const nom of ROLES_PROMPT_BUILDER) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    for (const arg of arguments_) {
      const res = await essayer(() => (fn as (...a: unknown[]) => unknown)(arg));
      if (!res.ok) continue;
      const texte = extraireTexte(res.value);
      if (texte !== null) return { texte, via: `${nom}(${rendu(arg)})` };
    }
  }
  const node = noeudPeriode(description, cle);
  if (node !== null) {
    const texte = champTexte(node, ['prompt', 'fullprompt', 'periodprompt', 'prompttext']);
    if (texte !== null) return { texte, via: 'description.periode.prompt' };
  }
  return null;
}

function requirePromptNode(cle: Periode, description: Json, resultat: { texte: string; via: string } | null): string {
  exige(
    resultat !== null,
    `prompt-${cle}-resolu`,
    `PROMPT-INTROUVABLE-POUR ${cle} : aucune des fonctions ${rendu([...ROLES_PROMPT_BUILDER])} n'a rendu de texte, et description.periode.${cle}.prompt est absent.`,
  );
  return (resultat as { texte: string }).texte;
}

/* ════════════════════ litteraux geles (IV) ═══════════════════════════ */

const ANCHOR_SLOT_ID = 'S1'; // acceptance/reference/F-RESERVATION.json:valeurs.creneau.id (cahier_line 119)
const ANCHOR_DEBUT_CRENEAU = '2030-01-03T12:00:00Z'; // acceptance/reference/F-RESERVATION.json:valeurs.creneau.debut (cahier_line 119)
const ANCHOR_WAITING = 'waiting'; // cases.extensions.lock.json:T53.A2
const ANCHOR_FRONTIERE = '2030-01-02T12:00:00Z'; // acceptance/reference/F-RESERVATION.json:valeurs.P3.frontiere (cahier_line 119)
const ANCHOR_PREAVIS_HEURES = 24; // acceptance/reference/F-RESERVATION.json:valeurs.P3.delai_heures (cahier_line 119)
const ANCHOR_NOT_FOUND = 'NOT_FOUND'; // acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant (cahier_line 123)
const CHAMP_SATISFIED = 'satisfied'; // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L107
const CHAMP_VIOLATED = 'violated'; // acceptance/T51.spec.ts (II.3), pair de `satisfied`
const CHAMP_PERIOD_INDEX = 'period_index'; // acceptance/T52.spec.ts (II.2), forme de candidate_control_report

/* ═══════════════════════════════ T53.A1 ══════════════════════════════ */

test('T53.A1 — chaque prompt de periode enonce les regles actives et aucune regle d une periode suivante', async () => {
  assertPackagesLoaded();
  const description = requireDescriptionUnifiee();

  const prompts = new Map<Periode, string>();
  for (const p of PERIODES) {
    const r = await promptDePeriode(p, description);
    prompts.set(p, requirePromptNode(p, description, r).toLowerCase());
  }

  // Presence cumulative : capacite/identite du creneau (active depuis P1).
  for (const p of PERIODES) {
    exige(
      (prompts.get(p) as string).includes(ANCHOR_SLOT_ID.toLowerCase()),
      `${p}-enonce-le-creneau`,
      `${p}-N-ENONCE-PAS-LE-CRENEAU ${ANCHOR_SLOT_ID} : ${court(prompts.get(p) as string)}`,
    ); // acceptance/reference/F-RESERVATION.json:valeurs.creneau.id
  }

  // Presence cumulative : file d'attente ordonnee (active depuis P2) — et
  // ABSENCE a P1 (regle d'une periode suivante, danger nomme par A1).
  exige(
    !(prompts.get('P1') as string).includes(ANCHOR_WAITING),
    'P1-n-enonce-pas-encore-la-file-d-attente',
    `P1-ENONCE-DEJA-${ANCHOR_WAITING} (regle de P2, fuite vers une periode anterieure) : ${court(prompts.get('P1') as string)}`,
  );
  for (const p of ['P2', 'P3', 'P4'] as const) {
    exige(
      (prompts.get(p) as string).includes(ANCHOR_WAITING),
      `${p}-enonce-la-file-d-attente`,
      `${p}-N-ENONCE-PAS ${ANCHOR_WAITING} : ${court(prompts.get(p) as string)}`,
    ); // cases.extensions.lock.json:T53.A2
  }

  // Presence cumulative : annulation et sa frontiere (active depuis P3) —
  // et ABSENCE a P1/P2 (c'est EXACTEMENT la perturbation nommee pour A1 :
  // « omettre la frontiere d'annulation de l'enonce de P3 »).
  for (const p of ['P1', 'P2'] as const) {
    exige(
      !(prompts.get(p) as string).includes(ANCHOR_FRONTIERE.toLowerCase()),
      `${p}-n-enonce-pas-encore-la-frontiere-d-annulation`,
      `${p}-ENONCE-DEJA-LA-FRONTIERE-D-ANNULATION (regle de P3, fuite) : ${court(prompts.get(p) as string)}`,
    );
  }
  for (const p of ['P3', 'P4'] as const) {
    exige(
      (prompts.get(p) as string).includes(ANCHOR_FRONTIERE.toLowerCase()),
      `${p}-enonce-la-frontiere-d-annulation`,
      `${p}-N-ENONCE-PAS-LA-FRONTIERE-D-ANNULATION ${ANCHOR_FRONTIERE} : ${court(prompts.get(p) as string)}`,
    ); // acceptance/reference/F-RESERVATION.json:valeurs.P3.frontiere
  }

  // Presence stricte : isolation des locataires (active a P4 seulement) —
  // et ABSENCE a P1/P2/P3.
  for (const p of ['P1', 'P2', 'P3'] as const) {
    exige(
      !(prompts.get(p) as string).includes(ANCHOR_NOT_FOUND.toLowerCase()),
      `${p}-n-enonce-pas-encore-l-isolation-inter-locataires`,
      `${p}-ENONCE-DEJA-L-ISOLATION (regle de P4, fuite) : ${court(prompts.get(p) as string)}`,
    );
  }
  exige(
    (prompts.get('P4') as string).includes(ANCHOR_NOT_FOUND.toLowerCase()),
    'P4-enonce-l-isolation-inter-locataires',
    `P4-N-ENONCE-PAS ${ANCHOR_NOT_FOUND} : ${court(prompts.get('P4') as string)}`,
  ); // acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant
}, CASE_TIMEOUT_MS);

/* ═══════════════════════════════ T53.A2 ══════════════════════════════ */

test('T53.A2 — chaque valeur de reponse du modele attendu figure litteralement dans l enonce de sa periode', async () => {
  assertPackagesLoaded();
  const description = requireDescriptionUnifiee();

  // Ancrage gele (cases.extensions.lock.json:T53.A2) : `waiting` DOIT
  // figurer, litteralement, dans l'enonce de P2 (et, cumulativement, de P3
  // et P4).
  for (const p of ['P2', 'P3', 'P4'] as const) {
    const r = await promptDePeriode(p, description);
    const texte = requirePromptNode(p, description, r);
    exige(
      texte.toLowerCase().includes(ANCHOR_WAITING),
      `${p}-enonce-contient-${ANCHOR_WAITING}`,
      `${p}-ENONCE-NE-CONTIENT-PAS ${ANCHOR_WAITING} : ${court(texte)}`,
    ); // cases.extensions.lock.json:T53.A2
  }

  // Ancrage gele independant : `NOT_FOUND` (verdict inter-locataire) DOIT
  // figurer dans l'enonce de P4.
  {
    const r = await promptDePeriode('P4', description);
    const texte = requirePromptNode('P4', description, r);
    exige(
      texte.toUpperCase().includes(ANCHOR_NOT_FOUND),
      'P4-enonce-contient-NOT_FOUND',
      `P4-ENONCE-NE-CONTIENT-PAS ${ANCHOR_NOT_FOUND} : ${court(texte)}`,
    ); // acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant
  }

  // Controle NON VACUEUX et DYNAMIQUE : pour CHAQUE periode, le vocabulaire
  // que LA DESCRIPTION ELLE-MEME declare pour cette periode (champ
  // vocabulary/vocabulaire/valeursDeReponse, quelle que soit la forme
  // exacte choisie par l'implementation) est NON VIDE, et CHAQUE valeur
  // qu'il porte figure litteralement dans l'enonce de la MEME periode —
  // sans que cette suite ait besoin de connaitre ces valeurs a l'avance.
  for (const p of PERIODES) {
    const node = noeudPeriode(description, p);
    exige(node !== null, `${p}-noeud-de-periode-present`, `${p}-NOEUD-DE-PERIODE-INTROUVABLE dans la description unifiee`);
    const vocab = tableauProfond(node, ['vocabulary', 'vocabulaire', 'responsevalues', 'valeursdereponse', 'expectedvalues', 'values']);
    exige(
      vocab !== null && Array.isArray(vocab.valeur) && vocab.valeur.length > 0,
      `${p}-vocabulaire-declare-non-vide`,
      `${p}-VOCABULAIRE-ABSENT-OU-VIDE dans le noeud de periode : ${rendu(node)}`,
    );
    const r = await promptDePeriode(p, description);
    const texte = requirePromptNode(p, description, r).toLowerCase();
    const valeurs = (vocab as { valeur: unknown[] }).valeur.filter((v): v is string => typeof v === 'string');
    const manquantes = valeurs.filter((v) => !texte.includes(v.toLowerCase()));
    exige(
      manquantes.length === 0,
      `${p}-toutes-les-valeurs-de-vocabulaire-dans-l-enonce`,
      `${p}-VALEURS-DE-VOCABULAIRE-ABSENTES-DE-L-ENONCE ${rendu(manquantes)} (vocabulaire declare : ${rendu(valeurs)})`,
    );
  }
}, CASE_TIMEOUT_MS);

/* ═══════════════════════════════ T53.A3 ══════════════════════════════ */

test('T53.A3 — chaque parametre du modele attendu figure dans l enonce de sa periode', async () => {
  assertPackagesLoaded();
  const description = requireDescriptionUnifiee();

  // Ancrage gele, generique (A3 nomme explicitement « debut du creneau ») :
  // DOIT figurer dans l'enonce de CHAQUE periode — c'est la perturbation
  // nommee par cases.extensions.lock.json:T53.A3.
  for (const p of PERIODES) {
    const r = await promptDePeriode(p, description);
    const texte = requirePromptNode(p, description, r);
    exige(
      texte.includes(ANCHOR_DEBUT_CRENEAU),
      `${p}-enonce-le-debut-du-creneau`,
      `${p}-N-ENONCE-PAS-LE-DEBUT-DU-CRENEAU ${ANCHOR_DEBUT_CRENEAU} : ${court(texte)}`,
    ); // acceptance/reference/F-RESERVATION.json:valeurs.creneau.debut
  }

  // Preavis d'annulation et frontiere incluse/exclue — parametres propres a
  // la regle d'annulation, actifs depuis P3 (cf. A1). La description DOIT
  // les declarer (existence requise, pas seulement toleree) a P3, et leur
  // VALEUR declaree doit figurer dans l'enonce de P3.
  const nodeP3 = noeudPeriode(description, 'P3');
  exige(nodeP3 !== null, 'P3-noeud-de-periode-present', 'P3-NOEUD-DE-PERIODE-INTROUVABLE');
  const preavis = champNombre(nodeP3, [
    'cancellationnoticehours',
    'preavisannulationheures',
    'noticehours',
    'delaiheures',
    'cancellationnotice',
    'preavisannulation',
  ]);
  exige(
    preavis === ANCHOR_PREAVIS_HEURES,
    'P3-preavis-d-annulation-declare-egal-a-24',
    `P3-PREAVIS-D-ANNULATION-ABSENT-OU-DIFFERENT-DE-24 (vu ${rendu(preavis)} dans ${rendu(nodeP3)})`,
  ); // acceptance/reference/F-RESERVATION.json:valeurs.P3.delai_heures

  const frontiereIncluse = champBool(nodeP3, ['boundaryinclusive', 'frontiereincluse', 'inclusive', 'bordinclus']);
  exige(
    frontiereIncluse === true,
    'P3-frontiere-declaree-incluse',
    `P3-FRONTIERE-INCLUSE-ABSENTE-OU-FAUSSE (vu ${rendu(frontiereIncluse)} dans ${rendu(nodeP3)})`,
  ); // acceptance/reference/F-RESERVATION.json:valeurs.P3.frontiere_incluse

  const rP3 = await promptDePeriode('P3', description);
  const texteP3 = requirePromptNode('P3', description, rP3);
  exige(
    texteP3.includes(String(ANCHOR_PREAVIS_HEURES)),
    'P3-enonce-contient-le-preavis-24',
    `P3-N-ENONCE-PAS-LE-PREAVIS-D-ANNULATION 24 : ${court(texteP3)}`,
  ); // acceptance/reference/F-RESERVATION.json:valeurs.P3.delai_heures
  exige(
    /inclu|inclusive/i.test(texteP3),
    'P3-enonce-indique-la-frontiere-incluse',
    `P3-N-INDIQUE-PAS-LA-FRONTIERE-INCLUSE (ni « inclu » ni « inclusive ») : ${court(texteP3)}`,
  ); // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L107 (« frontiere incluse ou exclue »)
}, CASE_TIMEOUT_MS);

/* ═══════════════════════════════ T53.A4 ══════════════════════════════ */

test('T53.A4 — aucun prompt de periode ne contient un verdict de controle, le champ satisfied, ou une valeur attendue calculee', async () => {
  assertPackagesLoaded();
  const description = requireDescriptionUnifiee();

  for (const p of PERIODES) {
    const r = await promptDePeriode(p, description);
    const texte = requirePromptNode(p, description, r).toLowerCase();

    // L'ASSERTION DECISIVE (proof_kind=absence) : `satisfied` est le SEUL
    // litteral que l'ADR nomme explicitement (L107) — c'est aussi la
    // perturbation prescrite par le registre (« laisser passer `satisfied`
    // dans le prompt »).
    exige(
      !texte.includes(CHAMP_SATISFIED),
      `${p}-prompt-sans-le-champ-satisfied`,
      `${p}-PROMPT-CONTIENT ${CHAMP_SATISFIED} : ${court(texte)}`,
    ); // source:docs/adr/ADR-011-enonce-des-exigences-pour-le-candidat.md:L107

    // Deux gardes supplementaires, de meme nature (verdict de controle /
    // valeur attendue precalculee), par PARALLELISME avec `satisfied` —
    // `violated` et `period_index` sont la forme EXACTE de
    // `candidate_control_report` deja etablie par acceptance/T52.spec.ts
    // (II.2) : un prompt qui les porterait livrerait au candidat le
    // VOCABULAIRE du rapport de controle, pas seulement le champ nomme par
    // l'ADR.
    exige(
      !texte.includes(CHAMP_VIOLATED),
      `${p}-prompt-sans-le-champ-violated`,
      `${p}-PROMPT-CONTIENT ${CHAMP_VIOLATED} : ${court(texte)}`,
    ); // acceptance/T52.spec.ts (II.2), pair de `satisfied`
    exige(
      !texte.includes(CHAMP_PERIOD_INDEX),
      `${p}-prompt-sans-period_index`,
      `${p}-PROMPT-CONTIENT ${CHAMP_PERIOD_INDEX} : ${court(texte)}`,
    ); // acceptance/T52.spec.ts (II.2)
  }
}, CASE_TIMEOUT_MS);

/* ═══════════════════════════════ T53.A5 ══════════════════════════════ */

test('T53.A5 — l enonce et le vocabulaire du modele attendu sont declares dans la MEME description exportee que bench.candidate/2', async () => {
  assertPackagesLoaded();

  // L'ASSERTION DECISIVE : la resolution de III.1 reussit — c'est-a-dire
  // qu'il existe UN objet, parmi tous les exports de packages/scenario et
  // packages/activities, qui porte A LA FOIS un temoin du contrat
  // bench.candidate/2 ET au moins deux enonces de periode. Si le
  // vocabulaire/les parametres etaient declares dans « une copie locale »
  // (un export SEPARE, jamais rejoint au contrat), AUCUN candidat ne
  // porterait les deux signaux a la fois et cette resolution echouerait —
  // exactement le danger que A5 nomme.
  const r = resoudreDescriptionUnifiee();
  exige(
    r !== null,
    'une-seule-description-exportee-porte-contrat-et-enonces',
    `AUCUNE-DESCRIPTION-UNIQUE-NE-PORTE-A-LA-FOIS-LE-CONTRAT-ET-LES-ENONCES : exports vus ${rendu([...LOADED.flat.keys()])}, attempts=${rendu(LOADED.attempts)}`,
  );
  const description = (r as { valeur: Json }).valeur;

  // Controle de capacite : CE MEME objet porte REELEMENT le temoin du
  // contrat (pas seulement « quelque chose ») — sans ce controle, un objet
  // qui porterait des enonces mais AUCUN temoin de bench.candidate/2
  // pourrait, par une erreur de la resolution elle-meme, sembler satisfaire
  // A5 pour la mauvaise raison.
  exige(
    portecontratV2(description),
    'la-description-resolue-porte-bien-le-contrat-v2',
    `LA-DESCRIPTION-RESOLUE-NE-PORTE-PAS-LE-CONTRAT : ${rendu(description)}`,
  ); // acceptance/T50.spec.ts (III)

  // Controle de capacite : CE MEME objet porte, pour CHAQUE periode P1..P4
  // (pas seulement deux), un noeud avec un enonce ET un vocabulaire non
  // vide — la description unifiee couvre bien TOUT le scenario, pas
  // seulement un fragment qui aurait suffi a la resolution.
  for (const p of PERIODES) {
    const node = noeudPeriode(description, p);
    exige(node !== null, `${p}-present-dans-la-description-unifiee`, `${p}-ABSENT-DE-LA-DESCRIPTION-UNIFIEE : ${rendu(description)}`);
    const enonce = champTexte(node, ['statement', 'enonce', 'narrative', 'prose', 'text']);
    exige(enonce !== null, `${p}-porte-un-enonce-dans-la-description-unifiee`, `${p}-SANS-ENONCE-DANS-LA-DESCRIPTION-UNIFIEE : ${rendu(node)}`);
    const vocab = tableauProfond(node, ['vocabulary', 'vocabulaire', 'responsevalues', 'valeursdereponse', 'expectedvalues', 'values']);
    exige(
      vocab !== null && Array.isArray(vocab.valeur) && vocab.valeur.length > 0,
      `${p}-porte-un-vocabulaire-dans-la-description-unifiee`,
      `${p}-SANS-VOCABULAIRE-DANS-LA-DESCRIPTION-UNIFIEE : ${rendu(node)}`,
    );
  }
}, CASE_TIMEOUT_MS);
