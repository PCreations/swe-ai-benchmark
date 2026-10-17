/**
 * acceptance/T57.spec.ts — suite d'acceptation de la tache T57.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T57.A1 behaviour — pour chaque operation du contrat `bench.candidate/2`,
 *                      chaque FORME de reponse (cles et types, recursivement,
 *                      valeurs exceptees) que le modele attendu peut produire
 *                      est la forme d'au moins un exemple public du prompt
 *                      reel, et aucun exemple n'a une forme que le modele
 *                      attendu ne produit jamais
 *   T57.A2 behaviour — l'enonce de chaque periode decrit, pour chaque
 *                      controle du a cette periode, la forme de la reponse
 *                      qu'il compare, avec ses noms de champs
 *   T57.A3 behaviour — lance par `bench pilot-conduct --provider claude-cli
 *                      --live`, un candidat de reference dont la structure
 *                      des reponses provient des SEULS exemples et enonce
 *                      recus satisfait chaque controle du a chaque periode,
 *                      fifo@1 et isolation@1 compris
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T57 EST UNE TACHE D'EXTENSION (ADR-014) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T57 — `packages/
 * activities`, `apps/cli` — et ne les a lus ni directement ni par `git show`
 * (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff, jamais une
 * barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T57.md et de sa source, docs/adr/ADR-014-forme-des-reponses-
 * montree-au-candidat.md, lignes 38 a 44 (la plage que la carte de T57
 * epingle dans verification/tasks.extensions.json#spec_source), AINSI QUE du
 * corps narratif du MEME document ACCEPTE (hors de cette plage — la meme
 * liberte que prennent deja acceptance/T48.spec.ts a acceptance/T56.spec.ts
 * face a leur propre ADR) :
 *
 *   « Ce que le premier pilote reel a montre » : une trajectoire, quatre
 *   periodes, deux modeles (Haiku 4.5, Sonnet 5.5). `reserve@1`,
 *   `idempotence@1` et `cancel@1` satisfaits a chaque periode pour les deux ;
 *   `isolation@1` en P4 pour Sonnet, pas pour Haiku. Mais « `fifo@1` echoue
 *   pour les deux modeles a chaque periode, a cause du moteur. L'exemple
 *   public de `read` (T56) montre `{"value":"exemple"}` — une chaine — alors
 *   que le controle compare un objet `{"status":…, "waiting_position":…}`.
 *   Sonnet a suivi l'exemple a la lettre et repondu `{"value":"confirmed"}`.
 *   Ni l'enonce ni le contrat ne decrivent la forme de `value`. »
 *   « Decision » : « pour chaque operation, la forme de chaque reponse que
 *   les controles comparent — cles et types, recursivement, valeurs
 *   exceptees — est montree au candidat par un exemple de cette forme
 *   exacte ; quand une operation peut repondre sous plusieurs formes (objet,
 *   valeur nulle, erreur), chacune a son exemple. L'enonce de chaque periode
 *   decrit, pour chaque controle du, la forme qu'il compare. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions et contrats DEJA
 * FIXES par les suites ACCEPTEES dont elle depend (jamais des sources de
 * T57) :
 *   - acceptance/T50.spec.ts (III)/acceptance/T52.spec.ts (III) : le contrat
 *     `bench.candidate/2` — six operations, `create_tenant {tenant_id} {}`,
 *     `advance_clock {to} {}`, `write {op,actor,tenant_id,admission_seq,
 *     operation_key} {decision}`, `read {tenant_id,key} {value}`,
 *     `probe_cancel {tenant_id,key} {decision}`, `fingerprint {} {sha256}` —
 *     REPRIS A L'IDENTIQUE, jamais re-derive.
 *   - acceptance/T48.spec.ts (III.2) : le protocole de transport — NDJSON,
 *     `{"id","op","args"}` -> `{"id","ok":true,"result"}` ou `{"id",
 *     "ok":false,"error":{"code","message"}}` — REPRIS A L'IDENTIQUE.
 *   - acceptance/T56.spec.ts (II.2) : le DETECTEUR D'EXEMPLES (segmentation
 *     d'accolades equilibrees, ancrage par les cles d'argument ET de reponse
 *     du contrat) — ETENDU ici (`formesExemplesPourOperation`, section III
 *     ci-dessous) pour collecter TOUTES les formes distinctes d'une meme
 *     operation (necessaire pour `read`, qui peut en avoir plusieurs),
 *     jamais seulement la premiere comme le faisait `exempleDetecte` de T56
 *     (qui n'avait besoin que d'UNE presence par operation, jamais de sa
 *     FORME).
 *   - acceptance/T51.spec.ts (II.6)/T56.spec.ts (II.3) : la table
 *     ECHEANCE_CONTROLE CUMULEE des cinq controles fixes (ADR-009:L34) — 2
 *     dus a P1, 4 dus a P2 (cancel@1, fifo@1), 5 dus a P4 (isolation@1) —
 *     REPRISE A L'IDENTIQUE.
 *   - acceptance/T53.spec.ts (III)/acceptance/T56.spec.ts (en-tete) : la
 *     DESCRIPTION UNIFIEE exportee par packages/scenario/packages/activities
 *     comme ORACLE de l'enonce de chaque periode — REIMPLEMENTEE A
 *     L'IDENTIQUE ici (meme discipline que T56 face a T53 : jamais pour
 *     re-tester T53, DEJA ACCEPTEE, mais pour SERVIR D'ORACLE a T57).
 *   - acceptance/T52.spec.ts (II.8) : le manifeste DEUX periodes
 *     `manifest-t49-claude-cli-small.json` (A1) et le manifeste QUATRE
 *     periodes `manifest-t52-claude-cli-four-periods.json` (A3, necessaire
 *     pour exercer `isolation@1`, du seulement a P4) — REPRIS SANS
 *     MODIFICATION.
 *   - acceptance/fixtures/candidates/reservation-candidate-v2.mjs (T51, zone
 *     ACCEPTANCE, jamais une source de T57) : le « modele attendu » de A1 —
 *     cette suite l'INVOQUE DIRECTEMENT (NDJSON sur stdin/stdout, protocole
 *     DEJA FIXE par T48/T50/T52, section IV ci-dessous) pour OBSERVER les
 *     formes REELLES qu'il produit, jamais pour en relire le code source
 *     comme une implementation : c'est le MEME fixture que T51/T52/T54/T55/
 *     T56 utilisent deja comme oracle de correction, jamais un chemin de
 *     T57 (`source_paths` de T57 ne le cite pas).
 *   - acceptance/fixtures/claude-cli/t56-derive-reference-candidate.mjs (T56,
 *     zone ACCEPTANCE) : le mecanisme de derivation `decisionField`/
 *     `operationKeyField` depuis le SEUL prompt recu — REUTILISE SANS
 *     MODIFICATION par acceptance/fixtures/claude-cli/
 *     t57-derive-reference-candidate.mjs (A3, zone ACCEPTANCE, publiee PAR
 *     CETTE TACHE), qui AJOUTE SEULEMENT la derivation de la forme imbriquee
 *     de `read` (voir l'en-tete de ce fichier pour le detail complet).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE AJOUTE OU FIXE ELLE-MEME (ADR-001 : aucune des valeurs
 * ci-dessous n'a ete obtenue en executant une implementation de T57 — aucune
 * n'existe au moment ou cette suite est ecrite)
 *
 * 1. LA FORME CANONIQUE (`formeDe`, section III) : une valeur JSON reduite a
 *    ses CLES (triees) et aux TYPES de ses feuilles, recursivement — jamais
 *    ses valeurs. C'est la lecture LITTERALE de l'acceptation (« cles et
 *    types, recursivement, valeurs exceptees ») : deux reponses dont seules
 *    les VALEURS different (`{"decision":"confirmed"}` vs
 *    `{"decision":"waiting"}`) ont la MEME forme (`{"decision":"string"}`) ;
 *    `{"value":{"status":"waiting","waiting_position":1}}` et
 *    `{"value":{"status":"confirmed"}}` ont des formes DIFFERENTES (une cle
 *    de plus).
 * 2. LE SCENARIO D'OBSERVATION DIRECTE DE A1 (section IV) : une batterie de
 *    NEUF appels NDJSON contre acceptance/fixtures/candidates/
 *    reservation-candidate-v2.mjs, invoque comme un PROCESSUS NEUF (meme
 *    discipline que T51/T56), dont les arguments (locataire, acteurs,
 *    creneau) viennent de la racine gelee acceptance/reference/
 *    F-RESERVATION.json — JAMAIS invents par cette suite — et qui exerce
 *    DELIBEREMENT les TROIS formes possibles de `read` (titulaire : un seul
 *    champ ; en attente : deux champs ; cle inconnue : valeur nulle) en MEME
 *    temps que l'UNIQUE forme de chaque autre operation.
 * 3. LE DETECTEUR MULTI-EXEMPLES DE A1 (`formesExemplesPourOperation`,
 *    section III) : extension, DECRITE AU POINT I CI-DESSUS, du detecteur
 *    DEJA ACCEPTE de T56 — AUCUNE forme de serialisation nouvelle, le MEME
 *    protocole NDJSON (T48), la MEME segmentation par accolades equilibrees ;
 *    la seule difference est qu'il ENUMERE, au lieu de s'arreter au premier.
 * 4. LA TABLE DES CHAMPS COMPARES DE A2 (section VI) : `decision` pour
 *    `reserve@1`/`idempotence@1`/`cancel@1` (DEJA etabli par T50/T56, repris
 *    sans discussion) et, NOUVEAU, `status`+`waiting_position` pour
 *    `fifo@1` — litteralement les deux noms de champ que « Ce que le premier
 *    pilote reel a montre » cite (section I ci-dessus). A2 NE PRETEND RIEN
 *    sur `isolation@1` : le controle d'isolation compare l'ENVELOPPE
 *    D'ERREUR `{"code","message"}`, DEJA fixee par le protocole NDJSON T48
 *    (acceptance/T51.spec.ts, REFERENCE_V2_FAUTIF, « verdict intertenant »)
 *    — ADR-014 ne nomme AUCUN champ de reponse SPECIFIQUE a l'isolation
 *    au-dela de cette enveloppe deja universelle, et cette suite n'invente
 *    aucune exigence de vocabulaire que la source n'etablit pas (risque d'un
 *    FAUX ROUGE sur une implementation correcte, exactement ce qu'ADR-001
 *    met en garde contre l'inverse — un faux VERT).
 * 5. LE CANDIDAT DE REFERENCE DE A3, DERIVE DE LA FORME (acceptance/fixtures/
 *    claude-cli/t57-derive-reference-candidate.mjs, publiee PAR CETTE TACHE —
 *    jamais une source de T57) : voir son en-tete pour le detail complet du
 *    mecanisme `extraireFormesLecture` (derivation PAR TYPE/POSITION, jamais
 *    par lexique).
 * 6. LE MANIFESTE QUATRE PERIODES POUR A3 : A1/A2 de T56 (et l'A2 de CETTE
 *    suite) se contentent du manifeste DEUX periodes DEJA REPRIS de T49
 *    (`fifo@1` est du a P2) ; A3 exige en outre `isolation@1` (du
 *    SEULEMENT a P4), donc cette suite reutilise
 *    `manifest-t52-claude-cli-four-periods.json`, DEJA ACCEPTE et publie par
 *    T52, jamais une fixture de T57.
 *
 * Les perturbations exactes de A1-A3 sont celles de
 * verification/cases.extensions.lock.json#T57, realisees mot pour mot par
 * verification/mutants/T57.json.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne redemontre ni le contrat bench.candidate/2 (T50/T52, DEJA
 *    ACCEPTES), ni le protocole de transport (T48), ni l'enonce/vocabulaire
 *    de periode au niveau de la description exportee (T53), ni l'absence du
 *    vocabulaire interdit (T56, A1) : elle REUTILISE ces resultats comme des
 *    oracles, jamais ne les re-prouve.
 *  • Elle ne pretend rien sur la forme comparee par `isolation@1` au-dela de
 *    l'enveloppe d'erreur deja universelle (voir II.4).
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T47/T49/T51/T52/
 *    T54/T55/T56.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * commun — REPRIS, SANS LE REINVENTER, de acceptance/T52.spec.ts/T54.spec.ts/
 * T55.spec.ts/T56.spec.ts (socle CLI+PostgreSQL+faux claude). */

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

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t57_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

type AppelCli = {
  resultat: Json | null;
  exit: number | null;
  tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[];
};

function envDeBase(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

function lancer(sousCommande: string, drapeaux: string[], envSupp: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env = { ...envDeBase(), ...envSupp };
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 500) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, exit: dernierExit, tentatives };
  construireUneFois(tentatives);
  const second = essayer();
  return { resultat: second, exit: dernierExit, tentatives };
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ───────────────────────────── extraction de champs — FORME SOUPLE (reprise
 * T52/T55/T56) : utile pour LIRE la sortie de la CLI, jamais pour comparer
 * une FORME d'exemple ou de reponse directe du candidat (section III/IV, qui
 * exigent une correspondance EXACTE de cles). */

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

/* ════════════════════════ fixture claude-cli (reprise T47/T49/T52/T54/T55/
 * T56) */

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

function envEcritureConstante(opts: {
  relPath: string;
  content: string;
  recordPlanDir?: string;
  recordPlanCounterFile?: string;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH: opts.relPath,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT: opts.content,
  };
  if (opts.recordPlanDir !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR = opts.recordPlanDir;
  if (opts.recordPlanCounterFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE = opts.recordPlanCounterFile;
  verifierFauxEnTetePath(env);
  return env;
}

/** Mecanisme de DERIVATION (acceptance/T55.spec.ts, A3 ; T56.spec.ts, A4) —
 *  REPRIS A L'IDENTIQUE, parametre par le CHEMIN du module de derivation
 *  (jamais fixe en dur ici : A3 pointe vers le module PROPRE a cette tache,
 *  acceptance/fixtures/claude-cli/t57-derive-reference-candidate.mjs). */
function envCandidatDerivePar(modulePath: string, opts: { deriveLogDir: string; recordPlanDir?: string; recordPlanCounterFile?: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: modulePath,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: opts.deriveLogDir,
  };
  if (opts.recordPlanDir !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR = opts.recordPlanDir;
  if (opts.recordPlanCounterFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE = opts.recordPlanCounterFile;
  verifierFauxEnTetePath(env);
  return env;
}

function nouveauPlanDeRecord(suffixe: string): { dir: string; counterFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t57-record-plan-${suffixe}-`));
  WORKSPACES_CREES.push(dir);
  return { dir, counterFile: path.join(dir, 'counter.txt') };
}
function recordPlanN(dir: string, n: number): Json | null {
  const f = path.join(dir, `record-${n}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
  } catch {
    return null;
  }
}
function argvPlanN(dir: string, n: number): string[] {
  const enreg = recordPlanN(dir, n);
  return Array.isArray(enreg?.argv) ? (enreg!.argv as unknown[]).map(String) : [];
}
function promptBrutPlanN(dir: string, n: number): string {
  const argv = argvPlanN(dir, n);
  const idxP = argv.indexOf('-p'); // convention FIXEE par acceptance/T49.spec.ts (II.4)
  return idxP >= 0 && idxP + 1 < argv.length ? (argv[idxP + 1] as string) : '';
}

/* ════════════════════ drapeaux et sous-commandes (repris T46/T49/T52/T55/
 * T56) */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21)
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008:L149

const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const SOUS_COMMANDE_CONTROL_REPORT = 'candidate-control-report'; // FIXE par acceptance/T51.spec.ts (II.1)

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008:L98
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // T48 III.1

const ALIAS_PERIODS_PERSISTED = ['periods_persisted', 'periodspersisted'];
const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_CANDIDATE_CONTROL_REPORT = ['candidate_control_report', 'candidatecontrolreport'];

const periodsPersistedDe = (r: unknown): number | null => champNombre(r, ALIAS_PERIODS_PERSISTED);

function trajectoryKeyDe(r: unknown): string | null {
  const t = tableauProfond(r, ALIAS_TRAJECTOIRES);
  if (t === null || !Array.isArray(t.valeur) || t.valeur.length === 0) return null;
  return champTexte(t.valeur[0], ALIAS_TRAJECTORY_KEY);
}

/** `candidate_control_report[trajectory_key].periods` (forme FIXEE par
 *  acceptance/T52.spec.ts, II.2). */
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

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t57-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t57-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

/** `bench pilot-conduct` sur la campagne `ctx`, mode `claude-cli --live`,
 *  manifeste PARAMETRE (jamais fixe en dur ici : A1/A2 reutilisent le
 *  manifeste DEUX periodes de T49, A3 le manifeste QUATRE periodes de T52). */
function conduire(ctx: Contexte, manifest: string, extra: string[], env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [
      manifest,
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
function candidateControlReportDirect(trajectoryKey: string, db: string): AppelCli {
  return lancer(SOUS_COMMANDE_CONTROL_REPORT, [DRAPEAU_CAMPAGNE, trajectoryKey, DRAPEAU_PG, db]);
}

/* ───────────────── manifestes et fixtures, JAMAIS des sources de T57 */

/** REPRIS A L'IDENTIQUE de acceptance/T49.spec.ts (II)/T52/T54/T55/T56 : UNE
 *  trajectoire, DEUX periodes — suffit pour A1/A2 (`fifo@1` est du a P2). */
const MANIFEST_DEUX_PERIODES = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t49-claude-cli-small.json');
/** REPRIS A L'IDENTIQUE de acceptance/T52.spec.ts : QUATRE periodes —
 *  necessaire pour A3, qui exige `isolation@1` (du SEULEMENT a P4). */
const MANIFEST_QUATRE_PERIODES = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t52-claude-cli-four-periods.json');
for (const m of [MANIFEST_DEUX_PERIODES, MANIFEST_QUATRE_PERIODES]) {
  if (!fs.existsSync(m)) throw new Error(`FIXTURE-ABSENTE : ${m}`);
}

/** REPRIS A L'IDENTIQUE de acceptance/T51.spec.ts (fixtures)/T52/T55/T56 :
 *  le candidat de reference qui respecte `bench.candidate/2`. Section IV :
 *  cette suite l'INVOQUE DIRECTEMENT pour observer les formes REELLES qu'il
 *  produit (A1) — jamais pour en relire le code comme une implementation. */
const REFERENCE_V2 = path.join(REPO, 'acceptance', 'fixtures', 'candidates', 'reservation-candidate-v2.mjs');
if (!fs.existsSync(REFERENCE_V2)) throw new Error(`FIXTURE-ABSENTE : ${REFERENCE_V2}`);
const CONTENU_CANDIDAT_CORRECT = fs.readFileSync(REFERENCE_V2, 'utf8');
const ENTREE_CANDIDATE = 'candidate.mjs'; // FIXE par acceptance/T52.spec.ts (II.4)

/** Module de derivation de CETTE tache (zone ACCEPTANCE, publie par T57). */
const MODULE_DERIVATION_T57 = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't57-derive-reference-candidate.mjs');
if (!fs.existsSync(MODULE_DERIVATION_T57)) throw new Error(`FIXTURE-ABSENTE : ${MODULE_DERIVATION_T57}`);

/* Les cinq identifiants FIXES par ADR-009:L34, et leur table d'echeance
 * CUMULEE, REPRISE A L'IDENTIQUE de acceptance/T51.spec.ts (II.6)/
 * T56.spec.ts (II.3). Jamais re-derivee ici. */
const CONTROLES_FIXES = ['reserve@1', 'idempotence@1', 'cancel@1', 'fifo@1', 'isolation@1'] as const;
type IdControle = (typeof CONTROLES_FIXES)[number];
const ECHEANCE_CONTROLE: Record<IdControle, number> = {
  'reserve@1': 1,
  'idempotence@1': 1,
  'cancel@1': 2,
  'fifo@1': 2,
  'isolation@1': 4,
};
function nombreControlesDus(k: number): number {
  return CONTROLES_FIXES.filter((id) => ECHEANCE_CONTROLE[id] <= k).length;
}
function controlesDusA(k: number): IdControle[] {
  return CONTROLES_FIXES.filter((id) => ECHEANCE_CONTROLE[id] <= k);
}

/* ════════════════════ oracle de l'enonce de periode (reprise T53/T56 —
 * JAMAIS re-verifie ici, sert SEULEMENT d'ORACLE pour A2) */

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

let ORACLE: { charge: boolean; flat: Map<string, unknown>; attempts: string[] } = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };
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
  ORACLE = { charge: unCharge, flat, attempts };
}, CASE_TIMEOUT_MS);
function assertOracleLoaded(): void {
  exige(
    ORACLE.charge,
    'oracle-packages-scenario-ou-activities-charges',
    `AUCUN-DES-DEUX-PAQUETS-N-A-PU-ETRE-CHARGE (oracle de l'enonce indisponible) : ${ORACLE.attempts.join(' | ')}`,
  );
}

const MARQUEUR_CONTRAT = 'bench.candidate/2'; // acceptance/T50.spec.ts (III)
const NOMS_OPERATIONS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint']; // acceptance/T50.spec.ts (III)
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

const PERIODES = ['P1', 'P2', 'P3', 'P4'] as const;
type Periode = (typeof PERIODES)[number];

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
const NOM_AGREGAT_DES_EXPORTS = '(ensemble des exports aplatis)';
function candidatsDescription(): { nom: string; valeur: unknown }[] {
  const out: { nom: string; valeur: unknown }[] = [];
  for (const [k, v] of ORACLE.flat.entries()) {
    if (v !== null && typeof v === 'object') out.push({ nom: k, valeur: v });
  }
  out.push({ nom: NOM_AGREGAT_DES_EXPORTS, valeur: Object.fromEntries(ORACLE.flat.entries()) });
  return out;
}
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
    'oracle-description-unifiee-resolue',
    `ORACLE-DESCRIPTION-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT} et au moins deux enonces de periode. Exports vus : ${rendu([...ORACLE.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}
function enonceDe(description: Json, p: Periode): string | null {
  const node = noeudPeriode(description, p);
  if (node === null) return null;
  return champTexte(node, ['statement', 'enonce', 'narrative', 'prose', 'text']);
}

/* ════════════════════════════════════ III — contrat bench.candidate/2, FIXE
 * par acceptance/T50.spec.ts/T52.spec.ts (REPRIS A L'IDENTIQUE), et la FORME
 * CANONIQUE + le detecteur MULTI-EXEMPLES, NOUVEAUX a cette suite (II.1-3). */

type OperationV2 = { op: string; args: string[]; reponse: string[] };
const OPERATIONS_V2: OperationV2[] = [
  { op: 'create_tenant', args: ['tenant_id'], reponse: [] },
  { op: 'advance_clock', args: ['to'], reponse: [] },
  { op: 'write', args: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key'], reponse: ['decision'] },
  { op: 'read', args: ['tenant_id', 'key'], reponse: ['value'] },
  { op: 'probe_cancel', args: ['tenant_id', 'key'], reponse: ['decision'] },
  { op: 'fingerprint', args: [], reponse: ['sha256'] },
];

const echapperRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `jeton` figure-t-il dans `source` comme jeton ENTIER ? Insensible a la
 *  casse — REPRIS A L'IDENTIQUE de acceptance/T56.spec.ts. */
const contientJeton = (source: string, jeton: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_])${echapperRe(jeton)}(?![A-Za-z0-9_])`, 'iu').test(source);

/** La FORME CANONIQUE d'une valeur JSON (section II.1 de l'en-tete) : cles
 *  (triees) et TYPES, recursivement — jamais les valeurs elles-memes. Lecture
 *  LITTERALE de l'acceptation T57.A1 (« cles et types, recursivement, valeurs
 *  exceptees »). */
function formeDe(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map((x) => formeDe(x)).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Json;
    const cles = Object.keys(o).sort();
    return `{${cles.map((k) => `${JSON.stringify(k)}:${formeDe(o[k])}`).join(',')}}`;
  }
  return typeof v;
}

/** Segments `{...}` equilibres — REPRIS A L'IDENTIQUE de T56.spec.ts. */
function segmentsAccolades(texte: string): { texte: string; debut: number; fin: number }[] {
  const out: { texte: string; debut: number; fin: number }[] = [];
  let profondeur = 0;
  let debut = -1;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (c === '{') {
      if (profondeur === 0) debut = i;
      profondeur += 1;
    } else if (c === '}') {
      profondeur -= 1;
      if (profondeur === 0 && debut >= 0) {
        out.push({ texte: texte.slice(debut, i + 1), debut, fin: i + 1 });
        debut = -1;
      } else if (profondeur < 0) {
        profondeur = 0;
      }
    }
  }
  return out;
}
type EnveloppeJSON = { texte: string; debut: number; fin: number; valeur: Json | null };
function enveloppesJSON(texte: string): EnveloppeJSON[] {
  return segmentsAccolades(texte).map((s) => {
    let valeur: Json | null = null;
    try {
      valeur = JSON.parse(s.texte) as Json;
    } catch {
      valeur = null;
    }
    return { ...s, valeur };
  });
}
function argsOntLesClefs(v: Json, requis: readonly string[]): boolean {
  const args = v.args;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return requis.length === 0;
  return requis.every((a) => Object.prototype.hasOwnProperty.call(args, a));
}
function resultALesClefs(v: Json, requis: readonly string[]): boolean {
  const result = v.result;
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return requis.length === 0;
  return requis.every((r) => Object.prototype.hasOwnProperty.call(result, r));
}

const FENETRE_PROXIMITE_EXEMPLE = 600; // REPRISE A L'IDENTIQUE de T56.spec.ts

/** EXTENSION du detecteur de T56.spec.ts (`exempleDetecte`, qui s'arretait au
 *  PREMIER match) : TOUTES les FORMES CANONIQUES distinctes que le prompt
 *  montre, en exemple public, pour `operation` — necessaire pour `read`, qui
 *  peut repondre sous PLUSIEURS formes (section II.3 de l'en-tete). MEME
 *  ancrage requete (op+args du contrat), mais lecture JSON DIRECTE du
 *  fragment (segments a accolades equilibrees, DEJA ETABLI), jamais une
 *  extraction de cles par regex — necessaire pour comparer des formes
 *  RECURSIVES. */
function formesExemplesPourOperation(promptBrut: string, operation: OperationV2): Set<string> {
  const enveloppes = enveloppesJSON(promptBrut);
  const formes = new Set<string>();
  for (let i = 0; i < enveloppes.length; i += 1) {
    const req = enveloppes[i] as EnveloppeJSON;
    if (req.valeur === null) continue;
    if (req.valeur.op !== operation.op) continue;
    if (!argsOntLesClefs(req.valeur, operation.args)) continue;
    for (let j = i + 1; j < enveloppes.length; j += 1) {
      const res = enveloppes[j] as EnveloppeJSON;
      if (res.debut < req.fin) continue;
      if (res.debut - req.fin > FENETRE_PROXIMITE_EXEMPLE) break;
      if (res.valeur === null) continue;
      if (res.valeur.ok !== true) continue;
      if (!resultALesClefs(res.valeur, operation.reponse)) continue;
      formes.add(formeDe(res.valeur.result));
      break; // la PROCHAINE enveloppe requete (boucle externe) peut reveler une AUTRE forme
    }
  }
  return formes;
}

/* ════════════════════════════════════ IV — observation DIRECTE du « modele
 * attendu » (acceptance/fixtures/candidates/reservation-candidate-v2.mjs,
 * section II.2/3 de l'en-tete) : les FORMES REELLES qu'il produit, par appel
 * NDJSON direct — jamais une relecture de son code comme une implementation. */

const FIXTURE_RESERVATION = JSON.parse(fs.readFileSync(path.join(REPO, 'acceptance', 'reference', 'F-RESERVATION.json'), 'utf8')) as Json;
function valeurGelee(chemin: readonly string[]): unknown {
  let cur: unknown = FIXTURE_RESERVATION;
  for (const seg of chemin) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[seg];
  }
  return (cur as Json | undefined)?.valeur;
}
const LOCATAIRE_INITIAL = valeurGelee(['valeurs', 'locataire_initial']) as string; // F-RESERVATION.json:valeurs.locataire_initial
const ACTEURS = valeurGelee(['valeurs', 'acteurs']) as string[]; // F-RESERVATION.json:valeurs.acteurs
const HORLOGE_INITIALE = valeurGelee(['valeurs', 'horloge_initiale']) as string; // F-RESERVATION.json:valeurs.horloge_initiale
exige(
  typeof LOCATAIRE_INITIAL === 'string' && Array.isArray(ACTEURS) && ACTEURS.length >= 2 && typeof HORLOGE_INITIALE === 'string',
  'racine-gelee-F-RESERVATION-lisible',
  `valeurs lues : locataire=${rendu(LOCATAIRE_INITIAL)} acteurs=${rendu(ACTEURS)} horloge=${rendu(HORLOGE_INITIALE)}`,
);

/** Invoque `cheminCandidat` comme un PROCESSUS NEUF (reprise de la discipline
 *  « chaque invocation est un processus neuf » de T51.spec.ts, section III) :
 *  ALIMENTE la batterie `requetes` sur son entree standard, LIT chaque ligne
 *  de sa sortie standard comme une enveloppe NDJSON `{id,ok,result}`. */
function appellerCandidatDirectement(cheminCandidat: string, requetes: Json[]): Map<string, Json> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 't57-a1-candidat-'));
  WORKSPACES_CREES.push(cwd);
  const entree = `${requetes.map((r) => JSON.stringify(r)).join('\n')}\n`;
  let sortie = '';
  try {
    sortie = execFileSync('node', [cheminCandidat], {
      cwd,
      input: entree,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stdout?: unknown };
    sortie = String(err.stdout ?? '');
  }
  const parId = new Map<string, Json>();
  for (const ligne of sortie.split('\n')) {
    const t = ligne.trim();
    if (t.length === 0) continue;
    try {
      const j = JSON.parse(t) as Json;
      if (typeof j.id === 'string') parId.set(j.id, j);
    } catch {
      /* ligne non-JSON (bruit de demarrage, ex. {"ready":true}) : ignoree */
    }
  }
  return parId;
}

/** La batterie de requetes de A1 (section II.2 de l'en-tete) : EXERCE
 *  deliberement les TROIS formes de `read` (titulaire, en attente, cle
 *  inconnue) en MEME temps que l'UNIQUE forme de chaque autre operation —
 *  arguments issus de la racine gelee F-RESERVATION, JAMAIS inventes. */
function batterieFormesCompletes(): { id: string; op: string; args: Json }[] {
  const [acteurA, acteurB] = ACTEURS;
  return [
    { id: 'f1', op: 'create_tenant', args: { tenant_id: LOCATAIRE_INITIAL } },
    { id: 'f2', op: 'advance_clock', args: { to: HORLOGE_INITIALE } },
    { id: 'f3', op: 'write', args: { op: 'reserve', actor: acteurA, tenant_id: LOCATAIRE_INITIAL, admission_seq: 1, operation_key: 't57-a1-k1' } },
    { id: 'f4', op: 'write', args: { op: 'reserve', actor: acteurB, tenant_id: LOCATAIRE_INITIAL, admission_seq: 2, operation_key: 't57-a1-k2' } },
    { id: 'f5', op: 'read', args: { tenant_id: LOCATAIRE_INITIAL, key: acteurA } }, // forme « titulaire » (une cle)
    { id: 'f6', op: 'read', args: { tenant_id: LOCATAIRE_INITIAL, key: acteurB } }, // forme « en attente » (deux cles)
    { id: 'f7', op: 'read', args: { tenant_id: LOCATAIRE_INITIAL, key: 't57-a1-cle-inconnue' } }, // forme « valeur nulle »
    { id: 'f8', op: 'probe_cancel', args: { tenant_id: LOCATAIRE_INITIAL, key: acteurA } },
    { id: 'f9', op: 'fingerprint', args: {} },
  ];
}

/** `{operation.op -> {forme canonique -> true}}` REELLEMENT observe en
 *  appelant acceptance/fixtures/candidates/reservation-candidate-v2.mjs. */
function formesObserveesDuModeleAttendu(): Map<string, Set<string>> {
  const requetes = batterieFormesCompletes();
  const reponses = appellerCandidatDirectement(REFERENCE_V2, requetes);
  const parOp = new Map<string, Set<string>>();
  for (const op of OPERATIONS_V2) parOp.set(op.op, new Set<string>());
  for (const req of requetes) {
    const rep = reponses.get(req.id);
    if (rep === undefined || rep.ok !== true) continue;
    (parOp.get(req.op) as Set<string>).add(formeDe(rep.result));
  }
  return parOp;
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T57 — montrer au candidat la forme exacte des reponses controlees', () => {
  test(
    'T57.A1 pour chaque operation du contrat, chaque forme de reponse que le modele attendu peut produire (cles et types, recursivement, valeurs exceptees) est la forme d un exemple public du prompt reel, et aucun exemple n a une forme jamais produite (ADR-014)',
    () => {
      const formesObservees = formesObserveesDuModeleAttendu();
      // Garde de sanite SUR CETTE SUITE ELLE-MEME : la batterie doit avoir
      // reellement exerce les TROIS formes de `read` chez le modele attendu
      // (sans quoi la comparaison qui suit ne prouverait rien).
      exige(
        (formesObservees.get('read') as Set<string>).size === 3,
        'la-batterie-exerce-bien-les-trois-formes-de-read-chez-le-modele-attendu',
        `vu ${rendu([...(formesObservees.get('read') as Set<string>)])} — la batterie ou le modele attendu a change de forme sans que cette suite en soit avertie`,
      );

      const ctx = nouveauContexte('a1');
      const plan = nouveauPlanDeRecord('a1');
      const env = envEcritureConstante({
        relPath: ENTREE_CANDIDATE,
        content: CONTENU_CANDIDAT_CORRECT,
        recordPlanDir: plan.dir,
        recordPlanCounterFile: plan.counterFile,
      });
      const run = conduire(ctx, MANIFEST_DEUX_PERIODES, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A1)', run));
      exige(periodsPersistedDe(run.resultat) === 2, 'deux-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      const prompts: string[] = [promptBrutPlanN(plan.dir, 0), promptBrutPlanN(plan.dir, 1)];
      exige(prompts[0]!.length > 0, 'prompt-reel-periode-1-capture', `AUCUN prompt capture a ${plan.dir}/record-0.json — argv ${rendu(argvPlanN(plan.dir, 0))}`);
      exige(prompts[1]!.length > 0, 'prompt-reel-periode-2-capture', `AUCUN prompt capture a ${plan.dir}/record-1.json — argv ${rendu(argvPlanN(plan.dir, 1))}`);

      const formesExemples = new Map<string, Set<string>>();
      for (const op of OPERATIONS_V2) {
        const union = new Set<string>();
        for (const p of prompts) for (const f of formesExemplesPourOperation(p, op)) union.add(f);
        formesExemples.set(op.op, union);
      }

      const manquants: string[] = [];
      const superflus: string[] = [];
      for (const op of OPERATIONS_V2) {
        const observees = formesObservees.get(op.op) as Set<string>;
        const exemples = formesExemples.get(op.op) as Set<string>;
        for (const forme of observees) if (!exemples.has(forme)) manquants.push(`${op.op}:${forme}`);
        for (const forme of exemples) if (!observees.has(forme)) superflus.push(`${op.op}:${forme}`);
      }

      exige(
        manquants.length === 0,
        'chaque-forme-reellement-produite-est-la-forme-d-au-moins-un-exemple-public',
        `FORME(S) PRODUITE(S) PAR LE MODELE ATTENDU SANS EXEMPLE PUBLIC CORRESPONDANT : ${rendu(manquants)} — prompts observes : ${rendu(prompts.map((p) => court(p, 800)))}`,
      );
      exige(
        superflus.length === 0,
        'aucun-exemple-public-n-a-une-forme-que-le-modele-attendu-ne-produit-jamais',
        `EXEMPLE(S) PUBLIC(S) DE FORME JAMAIS PRODUITE PAR LE MODELE ATTENDU : ${rendu(superflus)} — formes reellement produites : ${rendu(
          Object.fromEntries(OPERATIONS_V2.map((o) => [o.op, [...(formesObservees.get(o.op) as Set<string>)]])),
        )}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T57.A2 l enonce de chaque periode decrit, pour chaque controle du a cette periode, la forme de la reponse qu il compare avec ses noms de champs (ADR-014)',
    () => {
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();

      const periodesAvecEnonce = PERIODES.filter((p) => enonceDe(description, p) !== null);
      exige(
        periodesAvecEnonce.length >= 1,
        'au-moins-une-periode-avec-enonce',
        `periodes avec enonce : ${rendu(periodesAvecEnonce)} — description ${rendu(description)}`,
      );

      // Controles DUS dont la forme comparee est DEJA grounded par ADR-014 :
      // reserve@1/idempotence@1/cancel@1 comparent `write`/`probe_cancel`
      // ({decision}, DEJA etabli par T50/T56) ; fifo@1 compare `read.value`
      // sous sa forme a DEUX champs ({status, waiting_position} — les deux
      // noms que « Ce que le premier pilote reel a montre » cite mot pour
      // mot). isolation@1 N'EST PAS evaluee ici : voir en-tete, section II.4.
      const manquantsDecision: string[] = [];
      const manquantsFifo: string[] = [];
      for (const p of periodesAvecEnonce) {
        const k = PERIODES.indexOf(p) + 1;
        const enonce = enonceDe(description, p) as string;
        const dus = controlesDusA(k);
        const decisionDu = dus.some((id) => id === 'reserve@1' || id === 'idempotence@1' || id === 'cancel@1');
        const fifoDu = dus.includes('fifo@1');
        if (decisionDu && !contientJeton(enonce, 'decision')) manquantsDecision.push(p);
        if (fifoDu) {
          if (!contientJeton(enonce, 'status')) manquantsFifo.push(`${p}:status`);
          if (!contientJeton(enonce, 'waiting_position')) manquantsFifo.push(`${p}:waiting_position`);
        }
      }

      exige(
        manquantsDecision.length === 0,
        'l-enonce-nomme-decision-a-chaque-periode-ou-un-controle-fonde-sur-la-decision-est-du',
        `PERIODE(S) SANS LE CHAMP 'decision' ALORS QU'UN CONTROLE DU LE COMPARE : ${rendu(manquantsDecision)}`,
      );
      exige(
        manquantsFifo.length === 0,
        'l-enonce-nomme-status-ET-waiting_position-a-chaque-periode-ou-fifo-1-est-du',
        `CHAMP(S) DE LA FORME COMPAREE PAR fifo@1 ABSENT(S) DE L'ENONCE : ${rendu(manquantsFifo)} — c'est EXACTEMENT l'incident reel d'ADR-014 (« Ni l'enonce ni le contrat ne decrivent la forme de value »)`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T57.A3 un candidat de reference dont la structure des reponses vient des seuls exemples et enonce recus (pilot-conduct --provider claude-cli --live) satisfait chaque controle du a chaque periode, fifo@1 et isolation@1 compris (ADR-014)',
    async () => {
      const ctx = nouveauContexte('a3');
      const deriveLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 't57-a3-derive-log-'));
      WORKSPACES_CREES.push(deriveLogDir);
      const env = envCandidatDerivePar(MODULE_DERIVATION_T57, { deriveLogDir });

      const run = conduire(ctx, MANIFEST_QUATRE_PERIODES, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A3)', run));
      exige(periodsPersistedDe(run.resultat) === 4, 'quatre-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      // Preuve que la derivation a REELLEMENT eu lieu depuis le prompt REEL
      // (jamais une coincidence de valeur par defaut) : le journal de
      // derivation de chaque periode doit porter un `lecture.statusField`
      // RESOLU (pas un marqueur `<absent-du-prompt:...>`) au plus tard a
      // compter de la periode ou `fifo@1` devient du.
      const log2 = (() => {
        const f = path.join(deriveLogDir, 'derived-1.json'); // periode 2 = index 1 (0-based)
        if (!fs.existsSync(f)) return null;
        try {
          return JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
        } catch {
          return null;
        }
      })();
      exige(log2 !== null, 'derivation-journalisee-periode-2', `AUCUN journal a ${deriveLogDir}/derived-1.json`);
      const lectureP2 = ((log2 as Json).params as Json | undefined)?.lecture as Json | undefined;
      exige(
        lectureP2 !== undefined && typeof lectureP2.statusField === 'string' && !(lectureP2.statusField as string).startsWith('<absent-du-prompt:'),
        'la-derivation-reelle-p2-retrouve-un-nom-de-champ-de-statut-depuis-le-prompt',
        `vu ${rendu(lectureP2)} — prompt ${rendu(court(String((log2 as Json).prompt ?? ''), 1500))}`,
      );

      const trajKey = trajectoryKeyDe(run.resultat);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible', `vu ${rendu(trajKey)} dans ${rendu(run.resultat)}`);
      const periodesSelfReport = controlPeriodsDe(run.resultat, trajKey as string);
      const rapportDirect = candidateControlReportDirect(trajKey as string, ctx.db);
      exige(rapportDirect.resultat !== null && rapportDirect.exit === 0, 'candidate-control-report-direct-execute', messageEchec('candidate-control-report', rapportDirect));

      const echecsParPeriode: string[] = [];
      for (const k of [1, 2, 3, 4]) {
        const duesAK = nombreControlesDus(k);
        const ligne = periodesSelfReport.find((p) => p.period_index === k);
        if (ligne === undefined) {
          echecsParPeriode.push(`${k}:absente(${rendu(periodesSelfReport)})`);
          continue;
        }
        if (ligne.violated !== 0 || ligne.satisfied !== duesAK) {
          echecsParPeriode.push(`${k}:satisfied=${ligne.satisfied},violated=${ligne.violated}(dus=${duesAK},controles=${rendu(controlesDusA(k))})`);
        }
      }
      exige(
        echecsParPeriode.length === 0,
        'le-candidat-derive-de-la-forme-satisfait-chaque-controle-du-a-chaque-periode',
        `PERIODE(S) EN ECHEC : ${rendu(echecsParPeriode)} — fifo@1 du a compter de P2, isolation@1 du a compter de P4 (table ECHEANCE_CONTROLE)`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
