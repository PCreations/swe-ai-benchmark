/**
 * acceptance/T19.spec.ts — suite d'acceptation de la tache T19.
 *
 * Cas requis (verification/cases.lock.json, gele) :
 *   T19.A1 refusal — fichier sentinelle prive illisible depuis le sandbox
 *   T19.A2 refusal — base centrale, Temporal et autre trajectoire
 *                    inaccessibles depuis le sandbox
 *   T19.A3 refusal — appel fournisseur direct et sortie vers un collecteur
 *                    interdit bloques
 *   T19.A4 refusal — identite de trajectoire revendiquee frauduleusement
 *                    refusee par la passerelle
 *   T19.A5 refusal — depassement memoire/processus termine avec raison
 *                    observable
 *   T19.A6 absence — destruction n'affecte pas une autre trajectoire
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.json declare pour T19 — `packages/sandbox` et `infra`
 * — et ne les a lus ni directement ni par `git show` (ADR-001 : aveuglement
 * PROCEDURAL, discipline auditable au diff). Le contrat teste ci-dessous est
 * derive de docs/specs/T19.md, c'est-a-dire des lignes du cahier que la
 * carte de specification epingle sur T19 :
 *
 *   L319  dependances T14, T15, T17, T18 ; livrables MOT POUR MOT :
 *         « SandboxRunner Linux, profil d'execution borne, reseau du
 *         candidat et procedure de destruction ».
 *   L321  profil pilote : « conteneurs non privilegies, identites et
 *         volumes distincts, pas de socket Docker dans le candidat, pas de
 *         montage du depot de controle, pas de cles fournisseurs. Le
 *         candidat n'accede qu'a ses services, au miroir autorise et a la
 *         passerelle. Les permissions et le filtrage sont controles HORS DU
 *         PROCESSUS CANDIDAT. Le profil exact est archive. »
 *   L323  les six cas d'acceptation, mot pour mot.
 *   L325  fin : « essais hostiles executes dans le vrai profil. Si l'hote ne
 *         permet pas ces proprietes, renvoyer BLOCKED ; ne pas desactiver le
 *         filtrage pour obtenir un test vert. »
 *   L65   invariant D3 : « Le candidat n'a pas les identifiants du stockage
 *         de recherche, de la base centrale ou de l'evaluateur. » — fonde
 *         A1 et la moitie « base centrale » d'A2.
 *   L15   « Les tests ordinaires n'appellent aucun fournisseur externe » —
 *         A3 n'exerce donc PAS de reseau reel vers un fournisseur, mais un
 *         temoin local qui joue son role (cf. IV).
 *
 * Cette suite reprend, sans les relire, les conventions deja fixees par
 * acceptance/T14.spec.ts, acceptance/T17.spec.ts et acceptance/T18.spec.ts —
 * chargement par role, `essayer`, `rendu`, `court`, `findRepoRoot` — au meme
 * titre que T18 a repris telles quelles les conventions de T17 et T12.
 * Elle s'appuie en outre sur verification/runner/doctor.mjs (zone HARNESS,
 * pas source de T19) pour DEUX faits mesures sur cet hote, pas supposes :
 *   1. un consommateur memoire REEL (allocation anonyme, pas un fichier)
 *      est necessaire pour observer `memory.failcnt` incrementer sous une
 *      limite cgroup v1 — doctor.mjs y parvient avec un script Python qui
 *      accumule des `bytearray(4 MiB)`. Cette suite exige donc que
 *      l'environnement d'execution du candidat publie `python3` sur le
 *      PATH pour cette seule sonde ; c'est une EXIGENCE DE PROFIL que cette
 *      suite FIXE (cf. II), pas une lecture de packages/sandbox.
 *   2. un depassement `pids.max` s'observe par une boucle shell qui bifurque
 *      des `sleep` en arriere-plan — doctor.mjs y parvient avec `/bin/sh`
 *      seul, sans binaire additionnel. Cette suite reutilise exactement
 *      cette forme pour A5.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * PROVENANCE DES LITTERAUX — la regle qui ferme la boucle du test rouge.
 *
 * Litteraux RELEVES DANS LE CAHIER (`// cahier:L<n>`) : aucun litteral
 * numerique ou enum n'est fixe par le cahier pour T19 (contrairement a
 * T17/§F ou T18/L309) — §H ne nomme ni export, ni code de refus, ni valeur
 * de limite pour SandboxRunner. Les seules citations mot pour mot sont
 * textuelles (« pas de montage du depot de controle », L321) et servent de
 * PREUVE DE SETUP (cf. A1 : le sentinel est place au chemin meme du depot de
 * controle), pas de valeur comparee dans une assertion numerique.
 *
 * CE QUE CETTE SUITE FIXE, FAUTE D'ENONCE DANS LE CAHIER (meme geste que
 * T14 fixant ses 8 roles, ou T18 fixant `INVALID_MODEL_RESPONSE`) :
 *   - les SIX noms d'export/methode de `packages/sandbox` (§III) ;
 *   - le code de refus `TRAJECTORY_IDENTITY_MISMATCH` (A4) ;
 *   - l'exigence de profil « python3 sur le PATH candidat » pour A5 (cf. I).
 * Tout le reste comparé — marqueurs de secret, adresses de talon, contenu de
 * workspace — est FABRIQUE PAR CETTE SUITE (identifiants aleatoires, ports
 * ephemeres) et n'est donc pas un litteral a faire remonter.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * CONTRAT — CE QUE T19 DOIT PUBLIER, ET SOUS QUELS NOMS
 *
 * Paquet interroge : `packages/sandbox` (source_paths de T19, FIXE ICI). Le
 * chargement ne LEVE jamais : chaque cas asserte lui-meme le chargement,
 * en le NOMMANT (verification/runner/red.mjs classerait sinon un import
 * casse SUITE_FAILED_TO_RUN, refuse comme preuve).
 *
 * 1. `buildSandboxProfile(input)` -> `Profile`
 *    PURE — aucune E/S, aucune ressource ouverte. `input` :
 *      { trajectoryId: string,
 *        workspaceDir: string,        // hote, monte rw comme cwd candidat
 *        memoryLimitBytes: number,
 *        pidsMax: number,
 *        allowedEgress: Array<{ label, host, port }>,   // liste blanche
 *        controlRepoRoot: string,     // JAMAIS monte (L321)
 *        privateSentinelPath: string, // JAMAIS lisible (L321, D3/L65)
 *      }
 *    `Profile` DOIT etre archivable : serialisable JSON sans perte
 *    (`JSON.parse(JSON.stringify(p))` egal a `p` par valeur) et DOIT
 *    republier `memoryLimitBytes`, `pidsMax` et `allowedEgress` tels que
 *    fournis (L321 : « le profil exact est archive »).
 *
 * 2. `provisionSandbox(profile)` -> `Promise<SandboxHandle>`
 *    `SandboxHandle` :
 *      `trajectoryId: string`
 *      `execShell(command: string, opts?: { timeoutMs? }) ->
 *         Promise<{ exitCode, stdout, stderr, terminated, terminationReason }>`
 *         — invoque `/bin/sh -c "<command>"` DANS le conteneur candidat.
 *         `terminated` est `true` UNIQUEMENT quand le processus a ete
 *         arrete par une limite de ressource (memoire ou pids) plutot que
 *         termine de lui-meme ; `terminationReason` est alors une chaine
 *         NON VIDE qui NOMME la cause (L321 : filtrage hors du processus
 *         candidat — la raison est donc rendue par le controleur, jamais
 *         auto-declaree par le candidat).
 *      `probeTcp(host, port, opts?) -> Promise<{ reachable: boolean }>`
 *         — tente une connexion TCP DEPUIS le reseau du candidat vers
 *         `host:port` ; ne leve jamais, rend `reachable:false` sur refus,
 *         timeout ou route absente.
 *      `exposeProbeListener() -> Promise<{ host: string; port: number }>`
 *         — ouvre, a l'interieur du reseau du candidat, une adresse a
 *         laquelle CE sandbox peut etre sonde (temoin de A2/A6).
 *      `mintGatewayCredential() -> Promise<{ token: string }>`
 *         — emet un jeton lie a `trajectoryId` (la « liaison jeton ->
 *         trajectoire » que verification/cases.lock.json nomme pour A4).
 *      `readResourceEvidence() -> Promise<{ memoryFailcnt: number;
 *         pidsLimitHit: boolean }>`
 *         — observation INDEPENDANTE des limites (meme discipline que
 *         doctor.mjs : ne jamais se fier au seul code de sortie).
 *      `destroy() -> Promise<void>` — procedure de destruction (L319).
 *         Apres `destroy()`, tout appel a `execShell`/`probeTcp` sur CE
 *         handle doit echouer (rejet ou `exitCode` non nul portant une
 *         cause) : la destruction doit etre REELLE, pas un no-op qui
 *         laisserait A6 vert par accident.
 *
 * 3. `verifyTrajectoryClaim(claimedTrajectoryId, token)` ->
 *    `Promise<{ accepted: boolean; code?: string }>`
 *    Le point de decision de « la passerelle » (L323, A4) : verifie qu'un
 *    jeton emis par `mintGatewayCredential()` est presente avec l'identite
 *    de trajectoire a laquelle il est REELLEMENT lie. `accepted:false`
 *    porte un `code` NON VIDE (FIXE ici a titre d'exemple :
 *    `TRAJECTORY_IDENTITY_MISMATCH`, mais cette suite n'exige que la
 *    PRESENCE d'un code, jamais sa valeur exacte — cf. A4).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 *
 *  • Elle n'exerce pas les adresses reseau REELLES de PostgreSQL/Temporal du
 *    socle : depuis un netns candidat isole, l'adresse de loopback de l'hote
 *    (127.0.0.1) n'est de toute facon JAMAIS routable (propriete du noyau,
 *    pas du profil) — l'exercer donnerait un cas vert par construction,
 *    quelle que soit la qualite du filtrage, exactement le defaut que
 *    §G/L139 interdit (« une preuve comporte des sorties effectivement
 *    observees »). La topologie precise (bridge, veth, NAT) est en outre
 *    fixee par `infra/`, source de T19 dont cette suite reste aveugle. A2
 *    fait donc tenir le role de « base centrale »/« Temporal » par des
 *    talons TCP que cette suite heberge elle-meme sur l'interface routable
 *    non-loopback de l'hote (jamais dans `allowedEgress`) : la propriete
 *    exercee — une destination HORS liste blanche reste inaccessible — est
 *    exactement celle que L321 enonce (« le candidat n'accede qu'a ses
 *    services, au miroir autorise et a la passerelle »), independamment de
 *    l'identite precise de la destination.
 *  • Elle n'exerce pas de vrai fournisseur reseau (L15) : le talon
 *    « appel-fournisseur-direct » de A3 est un serveur TCP local qui ferme
 *    la connexion, pas un fournisseur reel.
 *  • Elle ne juge pas la resistance a une faille noyau (L321 : « sa
 *    validation ne pretend pas prouver resistance a toute faille du
 *    noyau ») — uniquement les trois controles nommes par L323.
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 180_000;

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

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
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

const court = (s: string, n = 600): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function messageDe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as unknown as Json).code;
    return `${err.name}${typeof code === 'string' ? `(${code})` : ''}: ${err.message}`;
  }
  return rendu(err);
}

async function essayer<T>(
  thunk: () => T | Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; err: unknown }> {
  try {
    const value = await thunk();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, err };
  }
}

/* ═══════════════════ les litteraux fixes par cette suite (cf. II) ═══════ */

/** L321 : le libelle exact, utilise comme temoin de setup dans A1 (jamais
 * compare a une valeur du cahier — seule la CITATION textuelle du chemin
 * « depot de controle » motive le placement du sentinel). */
const CITATION_PAS_DE_MONTAGE_CONTROLE = 'pas de montage du dépôt de contrôle'; // cahier:L321

/** Code de refus d'A4 — FIXE PAR CETTE SUITE, le cahier ne le nomme pas (cf. II). */
const CODE_IDENTITE_ATTENDU_PREFIXE = 'TRAJECTORY_IDENTITY_MISMATCH';

const RUN = `t19_${process.pid.toString(36)}_${Date.now().toString(36)}`;
let COMPTEUR = 0;
function nomUnique(suffixe: string): string {
  COMPTEUR += 1;
  return `${RUN}_${COMPTEUR}_${suffixe}`;
}

/* ═════════════════════ helpers reseau hote (talons de test) ════════════ */

/** Interface IPv4 NON-loopback de l'hote — jamais 127.0.0.1 (cf. IV : une
 * adresse de loopback n'est routable depuis AUCUN netns isole, quelle que
 * soit la qualite du filtrage, ce qui rendrait le controle vide). */
function adresseHoteRoutable(): string {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '0.0.0.0';
}

const HOTE_IP = adresseHoteRoutable();

interface Talon {
  host: string;
  port: number;
  label: string;
  close: () => Promise<void>;
}

/** Demarre un serveur TCP minimal (accepte puis ferme) sur l'interface
 * routable de l'hote — joue le role de « base centrale », « Temporal »,
 * « autre trajectoire », « fournisseur direct » ou « collecteur interdit »
 * selon le `label` fourni, JAMAIS inscrit dans `allowedEgress`. */
function demarrerTalon(label: string): Promise<Talon> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer((sock) => {
      sock.end();
    });
    srv.on('error', reject);
    srv.listen(0, HOTE_IP, () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error(`talon ${label} : adresse invalide`));
        return;
      }
      resolve({
        host: HOTE_IP,
        port: addr.port,
        label,
        close: () => new Promise((res) => srv.close(() => res())),
      });
    });
  });
}

const TALONS_A_FERMER: Talon[] = [];
async function talonNomme(label: string): Promise<Talon> {
  const t = await demarrerTalon(label);
  TALONS_A_FERMER.push(t);
  return t;
}

/* ═══════════════ chargement du paquet declare par le registre ═════════ */

const PACKAGES = ['sandbox'] as const;

interface Loaded {
  chargesPar: Set<string>;
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
  const chargesPar = new Set<string>();
  const flat = new Map<string, unknown>();
  for (const pkg of PACKAGES) {
    let charge = false;
    for (const s of specifiersFor(pkg)) {
      if (charge) break;
      try {
        const mod = (await import(s)) as Ns;
        flatten(mod, flat);
        chargesPar.add(pkg);
        charge = true;
      } catch (e) {
        attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    if (!charge) attempts.push(`paquet packages/${pkg} : aucun specificateur n'a repondu`);
  }
  return { chargesPar, flat, attempts };
}

let LOADED: Loaded = { chargesPar: new Set(), flat: new Map(), attempts: ['beforeAll non execute'] };

beforeAll(async () => {
  LOADED = await loadPackages();
}, CASE_TIMEOUT_MS);

function assertPackageLoaded(pkg: string): void {
  expect(
    LOADED.chargesPar.has(pkg)
      ? `packages/${pkg}-charge`
      : `PAQUET-NON-CHARGEABLE packages/${pkg} : ${LOADED.attempts.join(' | ')}`,
  ).toBe(`packages/${pkg}-charge`);
}

/* ─────────────────────────────────────────────── resolution par role */

type Fn = (...args: unknown[]) => unknown;

const ROLES: Record<string, readonly string[]> = {
  buildSandboxProfile: [
    'buildSandboxProfile', 'createSandboxProfile', 'defineSandboxProfile', 'buildProfile',
  ],
  provisionSandbox: [
    'provisionSandbox', 'createSandbox', 'startSandbox', 'openSandbox',
  ],
  verifyTrajectoryClaim: [
    'verifyTrajectoryClaim', 'checkTrajectoryClaim', 'assertTrajectoryClaim',
    'verifyTrajectoryIdentity',
  ],
};

function resolveRole(name: string): { fn?: Fn; tried: readonly string[] } {
  const aliases = ROLES[name];
  if (aliases === undefined) throw new Error(`role inconnu de la suite : ${name}`);
  for (const a of aliases) {
    const v = LOADED.flat.get(a);
    if (typeof v === 'function') return { fn: v as Fn, tried: aliases };
  }
  return { tried: aliases };
}

function requireRole(name: string): Fn {
  const { fn, tried } = resolveRole(name);
  expect(
    fn !== undefined ? `role-${name}-trouve` : `ROLE-INTROUVABLE ${name} (essaye : ${tried.join(', ')})`,
  ).toBe(`role-${name}-trouve`);
  return fn as Fn;
}

/* ═══════════════════════ forme du SandboxHandle (fixee, §III) ═══════════ */

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  terminated: boolean;
  terminationReason: string | null;
}
interface ProbeResult {
  reachable: boolean;
}
interface ProbeListener {
  host: string;
  port: number;
}
interface GatewayCredential {
  token: string;
}
interface ResourceEvidence {
  memoryFailcnt: number;
  pidsLimitHit: boolean;
}
interface SandboxHandle {
  trajectoryId: string;
  execShell: (command: string, opts?: { timeoutMs?: number }) => Promise<ExecResult>;
  probeTcp: (host: string, port: number, opts?: { timeoutMs?: number }) => Promise<ProbeResult>;
  exposeProbeListener: () => Promise<ProbeListener>;
  mintGatewayCredential: () => Promise<GatewayCredential>;
  readResourceEvidence: () => Promise<ResourceEvidence>;
  destroy: () => Promise<void>;
}

function assertHandleShape(h: unknown, contexte: string): SandboxHandle {
  const requis = [
    'execShell', 'probeTcp', 'exposeProbeListener', 'mintGatewayCredential',
    'readResourceEvidence', 'destroy',
  ] as const;
  const o = h as Json | null;
  const manquants = requis.filter((k) => typeof o?.[k] !== 'function');
  expect(
    manquants.length === 0
      ? `handle-${contexte}-conforme`
      : `HANDLE-NON-CONFORME ${contexte} : methodes manquantes ${manquants.join(', ')} (recu : ${court(rendu(h))})`,
  ).toBe(`handle-${contexte}-conforme`);
  expect(typeof o?.trajectoryId).toBe('string');
  return h as SandboxHandle;
}

/* ═════════════════════ provisionnement + nettoyage global ══════════════ */

const HANDLES_A_DETRUIRE: SandboxHandle[] = [];
const WORKSPACES_A_SUPPRIMER: string[] = [];

interface ProfilOverrides {
  memoryLimitBytes?: number;
  pidsMax?: number;
  allowedEgress?: Array<{ label: string; host: string; port: number }>;
}

/** Cree un workspace jetable + sentinel prive jetable, construit le profil
 * via le role `buildSandboxProfile`, provisionne via `provisionSandbox`,
 * enregistre le handle pour destruction en fin de suite. */
async function provisionner(
  suffixe: string,
  overrides: ProfilOverrides = {},
): Promise<{
  handle: SandboxHandle;
  trajectoryId: string;
  workspaceDir: string;
  workspaceMarker: string;
  sentinelPath: string;
  sentinelMarker: string;
}> {
  const trajectoryId = nomUnique(`traj-${suffixe}`);
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t19-ws-${suffixe}-`));
  WORKSPACES_A_SUPPRIMER.push(workspaceDir);
  const workspaceMarker = `WORKSPACE-OK-${nomUnique('wsmark')}`;
  fs.writeFileSync(path.join(workspaceDir, 'hello.txt'), workspaceMarker, 'utf8');

  const sentinelDir = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t19-priv-${suffixe}-`));
  WORKSPACES_A_SUPPRIMER.push(sentinelDir);
  const sentinelMarker = `SECRET-SENTINEL-${nomUnique('sentmark')}`;
  const sentinelPath = path.join(sentinelDir, 'sentinel.txt');
  fs.writeFileSync(
    sentinelPath,
    `${sentinelMarker}\n// ${CITATION_PAS_DE_MONTAGE_CONTROLE}\n`,
    'utf8',
  );

  const buildSandboxProfile = requireRole('buildSandboxProfile');
  const provisionSandbox = requireRole('provisionSandbox');

  const input = {
    trajectoryId,
    workspaceDir,
    memoryLimitBytes: overrides.memoryLimitBytes ?? 256 * 1024 * 1024,
    pidsMax: overrides.pidsMax ?? 256,
    allowedEgress: overrides.allowedEgress ?? [],
    controlRepoRoot: REPO,
    privateSentinelPath: sentinelPath,
  };

  const profil = await essayer(() => buildSandboxProfile(input));
  expect(
    profil.ok ? 'profil-construit' : `PROFIL-EN-ECHEC ${messageDe((profil as { err: unknown }).err)}`,
  ).toBe('profil-construit');

  const handleRes = await essayer(() => provisionSandbox((profil as { ok: true; value: unknown }).value));
  expect(
    handleRes.ok
      ? 'sandbox-provisionne'
      : `PROVISIONNEMENT-EN-ECHEC ${messageDe((handleRes as { err: unknown }).err)}`,
  ).toBe('sandbox-provisionne');

  const handle = assertHandleShape((handleRes as { ok: true; value: unknown }).value, `provision-${suffixe}`);
  HANDLES_A_DETRUIRE.push(handle);

  return { handle, trajectoryId, workspaceDir, workspaceMarker, sentinelPath, sentinelMarker };
}

afterAll(async () => {
  for (const h of HANDLES_A_DETRUIRE.splice(0)) {
    try {
      await h.destroy();
    } catch {
      /* deja detruit ou jamais provisionne correctement : ne bloque pas le nettoyage */
    }
  }
  for (const t of TALONS_A_FERMER.splice(0)) {
    try {
      await t.close();
    } catch {
      /* ignore */
    }
  }
  for (const dir of WORKSPACES_A_SUPPRIMER.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}, CASE_TIMEOUT_MS);

/* ══════════════════════════════ T19.A1 ══════════════════════════════════ */

test(
  'T19.A1 — fichier sentinelle prive illisible depuis le sandbox',
  async () => {
    assertPackageLoaded('sandbox');

    const { handle, workspaceMarker, sentinelPath, sentinelMarker } = await provisionner('a1');

    // CONTROLE : le sandbox fonctionne reellement et son workspace legitime
    // est lisible — sans ce controle, une implementation qui refuse TOUT
    // (execShell echoue toujours) verdirait A1 sans rien prouver.
    const lectureWorkspace = await essayer(() => handle.execShell('cat hello.txt'));
    expect(
      lectureWorkspace.ok
        ? 'workspace-execShell-repond'
        : `WORKSPACE-EXEC-EN-ECHEC ${messageDe((lectureWorkspace as { err: unknown }).err)}`,
    ).toBe('workspace-execShell-repond');
    const resWs = (lectureWorkspace as { ok: true; value: ExecResult }).value;
    expect(
      resWs.exitCode === 0 && resWs.stdout.includes(workspaceMarker)
        ? 'workspace-lisible'
        : `WORKSPACE-ILLISIBLE exitCode=${resWs.exitCode} stdout=${court(resWs.stdout)}`,
    ).toBe('workspace-lisible');

    // PRINCIPAL : le marqueur secret n'apparait NULLE PART dans le systeme
    // de fichiers du conteneur candidat — recherche a l'echelle du
    // filesystem entier, independante de tout schema de chemin suppose.
    const recherche = await essayer(() =>
      handle.execShell(`grep -r -- "${sentinelMarker}" / 2>/dev/null; echo GREP-FIN`),
    );
    expect(
      recherche.ok ? 'recherche-executee' : `RECHERCHE-EN-ECHEC ${messageDe((recherche as { err: unknown }).err)}`,
    ).toBe('recherche-executee');
    const resGrep = (recherche as { ok: true; value: ExecResult }).value;
    expect(
      !resGrep.stdout.includes(sentinelMarker)
        ? 'sentinel-absent-du-conteneur'
        : `SENTINEL-LISIBLE-A-TORT : ${court(resGrep.stdout)}`,
    ).toBe('sentinel-absent-du-conteneur');

    // PRINCIPAL (bis) : une tentative de lecture DIRECTE au chemin hote du
    // sentinel echoue explicitement (couvre le cas ou ce chemin exact serait
    // monte — la mutation nominale de cases.lock.json).
    const lectureDirecte = await essayer(() => handle.execShell(`cat "${sentinelPath}"`));
    expect(
      lectureDirecte.ok
        ? 'lecture-directe-executee'
        : `LECTURE-DIRECTE-EN-ECHEC ${messageDe((lectureDirecte as { err: unknown }).err)}`,
    ).toBe('lecture-directe-executee');
    const resDirect = (lectureDirecte as { ok: true; value: ExecResult }).value;
    expect(
      resDirect.exitCode !== 0 && !resDirect.stdout.includes(sentinelMarker)
        ? 'lecture-directe-refusee'
        : `LECTURE-DIRECTE-ACCEPTEE-A-TORT exitCode=${resDirect.exitCode} stdout=${court(resDirect.stdout)}`,
    ).toBe('lecture-directe-refusee');
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T19.A2 ══════════════════════════════════ */

test(
  'T19.A2 — base centrale, Temporal et autre trajectoire inaccessibles depuis le sandbox',
  async () => {
    assertPackageLoaded('sandbox');

    const talonBaseCentrale = await talonNomme('base-centrale');
    const talonTemporal = await talonNomme('temporal');

    const { handle: handleA } = await provisionner('a2-a');
    const { handle: handleB } = await provisionner('a2-b');

    // CONTROLE : le mecanisme de sonde fonctionne — le sandbox A peut
    // joindre SA PROPRE ecoute exposee. Sans ce controle, un `probeTcp` qui
    // rend toujours `reachable:false` verdirait A2 sans rien prouver.
    const ecouteA = await essayer(() => handleA.exposeProbeListener());
    expect(
      ecouteA.ok ? 'ecoute-a-exposee' : `ECOUTE-A-EN-ECHEC ${messageDe((ecouteA as { err: unknown }).err)}`,
    ).toBe('ecoute-a-exposee');
    const adresseA = (ecouteA as { ok: true; value: ProbeListener }).value;
    const soiMeme = await essayer(() => handleA.probeTcp(adresseA.host, adresseA.port));
    expect(
      soiMeme.ok ? 'sonde-executee' : `SONDE-SOI-EN-ECHEC ${messageDe((soiMeme as { err: unknown }).err)}`,
    ).toBe('sonde-executee');
    expect(
      (soiMeme as { ok: true; value: ProbeResult }).value.reachable
        ? 'sonde-fonctionnelle'
        : 'SONDE-TOUJOURS-NEGATIVE — mecanisme non concluant',
    ).toBe('sonde-fonctionnelle');

    // PRINCIPAL : « autre trajectoire » — l'ecoute du sandbox B, hors de
    // `allowedEgress` de A, reste hors d'atteinte de A.
    const ecouteB = await essayer(() => handleB.exposeProbeListener());
    expect(
      ecouteB.ok ? 'ecoute-b-exposee' : `ECOUTE-B-EN-ECHEC ${messageDe((ecouteB as { err: unknown }).err)}`,
    ).toBe('ecoute-b-exposee');
    const adresseB = (ecouteB as { ok: true; value: ProbeListener }).value;
    const versB = await essayer(() => handleA.probeTcp(adresseB.host, adresseB.port));
    expect(
      versB.ok ? 'sonde-vers-b-executee' : `SONDE-VERS-B-EN-ECHEC ${messageDe((versB as { err: unknown }).err)}`,
    ).toBe('sonde-vers-b-executee');
    expect(
      !(versB as { ok: true; value: ProbeResult }).value.reachable
        ? 'autre-trajectoire-inaccessible'
        : 'AUTRE-TRAJECTOIRE-ACCESSIBLE-A-TORT',
    ).toBe('autre-trajectoire-inaccessible');

    // PRINCIPAL : « base centrale » et « Temporal » — deux destinations
    // hors liste blanche (cf. IV sur le choix de talons plutot que les
    // adresses reelles du socle).
    for (const talon of [talonBaseCentrale, talonTemporal]) {
      const sonde = await essayer(() => handleA.probeTcp(talon.host, talon.port));
      expect(
        sonde.ok
          ? `sonde-${talon.label}-executee`
          : `SONDE-${talon.label}-EN-ECHEC ${messageDe((sonde as { err: unknown }).err)}`,
      ).toBe(`sonde-${talon.label}-executee`);
      expect(
        !(sonde as { ok: true; value: ProbeResult }).value.reachable
          ? `${talon.label}-inaccessible`
          : `${talon.label}-ACCESSIBLE-A-TORT`,
      ).toBe(`${talon.label}-inaccessible`);
    }
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T19.A3 ══════════════════════════════════ */

test(
  'T19.A3 — appel fournisseur direct et sortie vers un collecteur interdit bloques',
  async () => {
    assertPackageLoaded('sandbox');

    const talonPasserelle = await talonNomme('passerelle');
    const talonFournisseurDirect = await talonNomme('appel-fournisseur-direct');
    const talonCollecteur = await talonNomme('collecteur-interdit');

    const { handle } = await provisionner('a3', {
      allowedEgress: [{ label: 'passerelle', host: talonPasserelle.host, port: talonPasserelle.port }],
    });

    // CONTROLE : la destination EXPLICITEMENT autorisee (la passerelle) est
    // reellement joignable — sans ce controle, un profil qui bloque TOUT le
    // reseau verdirait A3 sans distinguer liste blanche et black-hole total.
    const versPasserelle = await essayer(() => handle.probeTcp(talonPasserelle.host, talonPasserelle.port));
    expect(
      versPasserelle.ok
        ? 'sonde-passerelle-executee'
        : `SONDE-PASSERELLE-EN-ECHEC ${messageDe((versPasserelle as { err: unknown }).err)}`,
    ).toBe('sonde-passerelle-executee');
    expect(
      (versPasserelle as { ok: true; value: ProbeResult }).value.reachable
        ? 'passerelle-accessible'
        : 'PASSERELLE-INACCESSIBLE — reseau completement bloque, controle non concluant',
    ).toBe('passerelle-accessible');

    // PRINCIPAL : ni l'appel fournisseur direct, ni la sortie vers le
    // collecteur interdit n'aboutissent, bien qu'aucun des deux ne soit
    // distingue de la passerelle autrement que par la liste blanche.
    for (const talon of [talonFournisseurDirect, talonCollecteur]) {
      const sonde = await essayer(() => handle.probeTcp(talon.host, talon.port));
      expect(
        sonde.ok
          ? `sonde-${talon.label}-executee`
          : `SONDE-${talon.label}-EN-ECHEC ${messageDe((sonde as { err: unknown }).err)}`,
      ).toBe(`sonde-${talon.label}-executee`);
      expect(
        !(sonde as { ok: true; value: ProbeResult }).value.reachable
          ? `${talon.label}-bloque`
          : `${talon.label}-ACCEPTE-A-TORT`,
      ).toBe(`${talon.label}-bloque`);
    }
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T19.A4 ══════════════════════════════════ */

test(
  'T19.A4 — identite de trajectoire revendiquee frauduleusement refusee par la passerelle',
  async () => {
    assertPackageLoaded('sandbox');

    const verifyTrajectoryClaim = requireRole('verifyTrajectoryClaim');

    const { handle: handleA, trajectoryId: trajA } = await provisionner('a4-a');
    const { handle: handleB, trajectoryId: trajB } = await provisionner('a4-b');

    const credA = await essayer(() => handleA.mintGatewayCredential());
    expect(
      credA.ok ? 'jeton-a-emis' : `JETON-A-EN-ECHEC ${messageDe((credA as { err: unknown }).err)}`,
    ).toBe('jeton-a-emis');
    const tokenA = (credA as { ok: true; value: GatewayCredential }).value.token;
    expect(typeof tokenA === 'string' && tokenA.length > 0 ? 'jeton-a-non-vide' : 'JETON-A-VIDE').toBe(
      'jeton-a-non-vide',
    );

    // deuxieme trajectoire, pour distinguer un refus generique d'un refus
    // qui verifie reellement LA liaison jeton -> trajectoire.
    await handleB.mintGatewayCredential();

    // CONTROLE : la revendication GENUINE (le jeton de A avec l'identite de
    // A) est acceptee — sans ce controle, une passerelle qui refuse TOUT
    // verdirait A4 sans avoir verifie une liaison quelconque.
    const revendicationGenuine = await essayer(() => verifyTrajectoryClaim(trajA, tokenA));
    expect(
      revendicationGenuine.ok
        ? 'verification-genuine-executee'
        : `VERIFICATION-GENUINE-EN-ECHEC ${messageDe((revendicationGenuine as { err: unknown }).err)}`,
    ).toBe('verification-genuine-executee');
    const resGenuine = (revendicationGenuine as { ok: true; value: { accepted: boolean; code?: string } }).value;
    expect(resGenuine.accepted ? 'revendication-genuine-acceptee' : `REVENDICATION-GENUINE-REFUSEE-A-TORT ${rendu(resGenuine)}`).toBe(
      'revendication-genuine-acceptee',
    );

    // PRINCIPAL : le jeton de A, presente en revendiquant l'identite de B,
    // est REFUSE et porte un code de refus NON VIDE.
    const revendicationFrauduleuse = await essayer(() => verifyTrajectoryClaim(trajB, tokenA));
    expect(
      revendicationFrauduleuse.ok
        ? 'verification-frauduleuse-executee'
        : `VERIFICATION-FRAUDULEUSE-EN-ECHEC ${messageDe((revendicationFrauduleuse as { err: unknown }).err)}`,
    ).toBe('verification-frauduleuse-executee');
    const resFraude = (revendicationFrauduleuse as { ok: true; value: { accepted: boolean; code?: string } })
      .value;
    expect(
      !resFraude.accepted
        ? 'revendication-frauduleuse-refusee'
        : `REVENDICATION-FRAUDULEUSE-ACCEPTEE-A-TORT ${rendu(resFraude)}`,
    ).toBe('revendication-frauduleuse-refusee');
    expect(
      typeof resFraude.code === 'string' && resFraude.code.length > 0
        ? 'code-de-refus-present'
        : `CODE-DE-REFUS-ABSENT ${rendu(resFraude)}`,
    ).toBe('code-de-refus-present');
    // Le code exact n'est pas exige (cf. §III) ; ce prefixe documente
    // seulement la valeur FIXEE par cette suite a titre d'exemple.
    void CODE_IDENTITE_ATTENDU_PREFIXE;

    // PRINCIPAL (bis) : un jeton inexistant est egalement refuse — la
    // passerelle ne doit pas accepter une identite non liee a AUCUN jeton.
    const jetonInvente = await essayer(() =>
      verifyTrajectoryClaim(trajA, `jeton-invente-${nomUnique('bogus')}`),
    );
    expect(
      jetonInvente.ok
        ? 'verification-jeton-invente-executee'
        : `VERIFICATION-JETON-INVENTE-EN-ECHEC ${messageDe((jetonInvente as { err: unknown }).err)}`,
    ).toBe('verification-jeton-invente-executee');
    expect(
      !(jetonInvente as { ok: true; value: { accepted: boolean } }).value.accepted
        ? 'jeton-invente-refuse'
        : 'JETON-INVENTE-ACCEPTE-A-TORT',
    ).toBe('jeton-invente-refuse');
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T19.A5 ══════════════════════════════════ */

test(
  'T19.A5 — depassement memoire/processus termine avec raison observable',
  async () => {
    assertPackageLoaded('sandbox');

    /* ── volet memoire ───────────────────────────────────────────────── */
    const LIMITE_MEMOIRE = 32 * 1024 * 1024; // 32 MiB — valeur mesuree operante par doctor.mjs sur cet hote
    const { handle: handleMem } = await provisionner('a5-mem', {
      memoryLimitBytes: LIMITE_MEMOIRE,
      pidsMax: 64,
    });

    // CONTROLE : sous la meme limite, une petite allocation reussit — sans
    // ce controle, un profil qui tue TOUT processus verdirait A5 sans avoir
    // exerce la LIMITE precisement.
    const petiteAlloc = await essayer(() =>
      handleMem.execShell(
        `python3 -c "b=bytearray(4*1024*1024); import sys; sys.stdout.write('SMALL-OK '+str(len(b)))"`,
      ),
    );
    expect(
      petiteAlloc.ok
        ? 'petite-allocation-executee'
        : `PETITE-ALLOCATION-EN-ECHEC ${messageDe((petiteAlloc as { err: unknown }).err)}`,
    ).toBe('petite-allocation-executee');
    const resPetit = (petiteAlloc as { ok: true; value: ExecResult }).value;
    expect(
      resPetit.exitCode === 0 && resPetit.stdout.includes('SMALL-OK')
        ? 'petite-allocation-reussie'
        : `PETITE-ALLOCATION-A-TORT-BLOQUEE exitCode=${resPetit.exitCode} stdout=${court(resPetit.stdout)} stderr=${court(resPetit.stderr)}`,
    ).toBe('petite-allocation-reussie');

    // PRINCIPAL : un consommateur memoire REEL (allocation anonyme
    // accumulee, meme methode que verification/runner/doctor.mjs) sous la
    // limite de 32 MiB est termine, avec une raison observable.
    const grosseAlloc = await essayer(() =>
      handleMem.execShell(
        `python3 -c "` +
          `import sys; b=[]; sys.stderr.write('HOG-START\\n'); sys.stderr.flush()\n` +
          `while True:\n    b.append(bytearray(4*1024*1024))` +
          `"`,
        { timeoutMs: 30_000 },
      ),
    );
    expect(
      grosseAlloc.ok
        ? 'grosse-allocation-executee'
        : `GROSSE-ALLOCATION-EN-ECHEC ${messageDe((grosseAlloc as { err: unknown }).err)}`,
    ).toBe('grosse-allocation-executee');
    const resGros = (grosseAlloc as { ok: true; value: ExecResult }).value;
    expect(
      resGros.terminated
        ? 'depassement-memoire-termine'
        : `DEPASSEMENT-MEMOIRE-NON-TERMINE exitCode=${resGros.exitCode} terminated=${resGros.terminated}`,
    ).toBe('depassement-memoire-termine');
    expect(
      typeof resGros.terminationReason === 'string' && resGros.terminationReason.length > 0
        ? 'raison-observable-presente'
        : `RAISON-ABSENTE ${rendu(resGros.terminationReason)}`,
    ).toBe('raison-observable-presente');

    // PRINCIPAL (bis) : observation INDEPENDANTE de l'auto-declaration
    // d'`execShell` — meme discipline que doctor.mjs (ne jamais se fier au
    // seul code de sortie / champ auto-rapporte).
    const preuveMem = await essayer(() => handleMem.readResourceEvidence());
    expect(
      preuveMem.ok ? 'preuve-memoire-lue' : `PREUVE-MEMOIRE-EN-ECHEC ${messageDe((preuveMem as { err: unknown }).err)}`,
    ).toBe('preuve-memoire-lue');
    expect(
      (preuveMem as { ok: true; value: ResourceEvidence }).value.memoryFailcnt > 0
        ? 'memory-failcnt-positif'
        : `MEMORY-FAILCNT-NUL ${rendu((preuveMem as { ok: true; value: ResourceEvidence }).value)}`,
    ).toBe('memory-failcnt-positif');

    /* ── volet processus ─────────────────────────────────────────────── */
    const { handle: handlePids } = await provisionner('a5-pids', {
      memoryLimitBytes: 512 * 1024 * 1024,
      pidsMax: 16,
    });

    // CONTROLE : sous la meme limite, un petit nombre de processus reussit.
    const petiteCharge = await essayer(() =>
      handlePids.execShell('i=0; while [ $i -lt 3 ]; do sleep 1 & i=$((i+1)); done; wait; echo PIDS-SMALL-OK'),
    );
    expect(
      petiteCharge.ok
        ? 'petite-charge-pids-executee'
        : `PETITE-CHARGE-PIDS-EN-ECHEC ${messageDe((petiteCharge as { err: unknown }).err)}`,
    ).toBe('petite-charge-pids-executee');
    expect(
      (petiteCharge as { ok: true; value: ExecResult }).value.stdout.includes('PIDS-SMALL-OK')
        ? 'petite-charge-pids-reussie'
        : `PETITE-CHARGE-PIDS-A-TORT-BLOQUEE ${rendu((petiteCharge as { ok: true; value: ExecResult }).value)}`,
    ).toBe('petite-charge-pids-reussie');

    // PRINCIPAL : depasser `pids.max` (16) en bifurquant 40 processus
    // termine l'execution avec une raison observable (meme forme que la
    // sonde `containers.cgroup-pids` de doctor.mjs, sans binaire additionnel).
    const grosseCharge = await essayer(() =>
      handlePids.execShell(
        'i=0; while [ $i -lt 40 ]; do sleep 5 & i=$((i+1)); done; wait',
        { timeoutMs: 30_000 },
      ),
    );
    expect(
      grosseCharge.ok
        ? 'grosse-charge-pids-executee'
        : `GROSSE-CHARGE-PIDS-EN-ECHEC ${messageDe((grosseCharge as { err: unknown }).err)}`,
    ).toBe('grosse-charge-pids-executee');
    const resPidsGros = (grosseCharge as { ok: true; value: ExecResult }).value;
    expect(
      resPidsGros.terminated
        ? 'depassement-pids-termine'
        : `DEPASSEMENT-PIDS-NON-TERMINE exitCode=${resPidsGros.exitCode} terminated=${resPidsGros.terminated}`,
    ).toBe('depassement-pids-termine');
    expect(
      typeof resPidsGros.terminationReason === 'string' && resPidsGros.terminationReason.length > 0
        ? 'raison-observable-pids-presente'
        : `RAISON-PIDS-ABSENTE ${rendu(resPidsGros.terminationReason)}`,
    ).toBe('raison-observable-pids-presente');

    const preuvePids = await essayer(() => handlePids.readResourceEvidence());
    expect(
      preuvePids.ok ? 'preuve-pids-lue' : `PREUVE-PIDS-EN-ECHEC ${messageDe((preuvePids as { err: unknown }).err)}`,
    ).toBe('preuve-pids-lue');
    expect(
      (preuvePids as { ok: true; value: ResourceEvidence }).value.pidsLimitHit
        ? 'pids-limit-hit-vrai'
        : `PIDS-LIMIT-HIT-FAUX ${rendu((preuvePids as { ok: true; value: ResourceEvidence }).value)}`,
    ).toBe('pids-limit-hit-vrai');
  },
  CASE_TIMEOUT_MS,
);

/* ══════════════════════════════ T19.A6 ══════════════════════════════════ */

test(
  'T19.A6 — destruction n\'affecte pas une autre trajectoire',
  async () => {
    assertPackageLoaded('sandbox');

    const { handle: handleX, workspaceMarker: markerX } = await provisionner('a6-x');
    const { handle: handleY, workspaceMarker: markerY } = await provisionner('a6-y');

    const ecouteY = await essayer(() => handleY.exposeProbeListener());
    expect(
      ecouteY.ok ? 'ecoute-y-exposee' : `ECOUTE-Y-EN-ECHEC ${messageDe((ecouteY as { err: unknown }).err)}`,
    ).toBe('ecoute-y-exposee');
    const adresseY = (ecouteY as { ok: true; value: ProbeListener }).value;

    // ETAT AVANT : Y fonctionne, lit son propre workspace, sa propre ecoute
    // est joignable par elle-meme.
    const avantY = await essayer(() => handleY.execShell('cat hello.txt'));
    expect(
      avantY.ok && (avantY as { ok: true; value: ExecResult }).value.stdout.includes(markerY)
        ? 'y-fonctionnel-avant'
        : `Y-NON-FONCTIONNEL-AVANT ${rendu(avantY)}`,
    ).toBe('y-fonctionnel-avant');
    const sondeAvant = await essayer(() => handleY.probeTcp(adresseY.host, adresseY.port));
    expect(
      sondeAvant.ok && (sondeAvant as { ok: true; value: ProbeResult }).value.reachable
        ? 'y-joignable-avant'
        : `Y-NON-JOIGNABLE-AVANT ${rendu(sondeAvant)}`,
    ).toBe('y-joignable-avant');

    // DESTRUCTION de X, et RIEN d'autre.
    await handleX.destroy();
    // retire X de la liste globale de nettoyage : deja detruit ici.
    const idxX = HANDLES_A_DETRUIRE.indexOf(handleX);
    if (idxX >= 0) HANDLES_A_DETRUIRE.splice(idxX, 1);

    // TEMOIN : la destruction de X est REELLE — sans ce temoin, un
    // `destroy()` qui ne fait rien laisserait A6 vert par accident.
    const xApres = await essayer(() => handleX.execShell('echo still-alive'));
    expect(
      !xApres.ok ||
        (xApres as { ok: true; value: ExecResult }).value.exitCode !== 0 ||
        !(xApres as { ok: true; value: ExecResult }).value.stdout.includes('still-alive')
        ? 'x-effectivement-detruit'
        : 'X-TOUJOURS-VIVANT-APRES-DESTROY — le temoin de destruction reelle echoue',
    ).toBe('x-effectivement-detruit');

    // PRINCIPAL : Y n'est PAS affecte par la destruction de X.
    const apresY = await essayer(() => handleY.execShell('cat hello.txt'));
    expect(
      apresY.ok
        ? 'y-execShell-repond-apres'
        : `Y-EXEC-EN-ECHEC-APRES ${messageDe((apresY as { err: unknown }).err)}`,
    ).toBe('y-execShell-repond-apres');
    expect(
      (apresY as { ok: true; value: ExecResult }).value.stdout.includes(markerY)
        ? 'y-workspace-intact-apres'
        : `Y-WORKSPACE-AFFECTE-APRES ${rendu((apresY as { ok: true; value: ExecResult }).value)}`,
    ).toBe('y-workspace-intact-apres');

    const sondeApres = await essayer(() => handleY.probeTcp(adresseY.host, adresseY.port));
    expect(
      sondeApres.ok
        ? 'y-sonde-apres-executee'
        : `Y-SONDE-APRES-EN-ECHEC ${messageDe((sondeApres as { err: unknown }).err)}`,
    ).toBe('y-sonde-apres-executee');
    expect(
      (sondeApres as { ok: true; value: ProbeResult }).value.reachable
        ? 'y-joignable-apres'
        : 'Y-NON-JOIGNABLE-APRES — dommage collateral de la destruction de X',
    ).toBe('y-joignable-apres');
  },
  CASE_TIMEOUT_MS,
);
