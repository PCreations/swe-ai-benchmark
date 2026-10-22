/**
 * acceptance/T67.spec.ts — suite d'acceptation de la tache T67.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T67.A1 behaviour — le contrat `bench.candidate/4` porte `slot_id` sur
 *                      `write`, `read`, `probe_cancel`, `history` et
 *                      `transfer`, et l'operation `create_slot` avec
 *                      `tenant_id`, `slot_id`, `start`, `capacity` et
 *                      `price` ; chaque forme de reponse a un exemple public
 *                      de cette forme exacte
 *   T67.A2 behaviour — l'enonce de chaque periode ou l'un des huit points
 *                      d'ADR-019 s'applique l'enonce tel qu'ADR-019 le
 *                      tranche
 *   T67.A3 behaviour — le modele attendu rejoue sur la trajectoire
 *                      principale de F-LONG produit chaque fait de
 *                      acceptance/reference-long/F-LONG.json
 *   T67.A4 behaviour — le modele attendu applique chacun des huit points
 *                      tels qu'ADR-019 les tranche, chacun verifie par une
 *                      sequence qui le distingue de l'autre choix
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T67 EST UNE TACHE D'EXTENSION : elle ne vient PAS du cahier. Le registre
 * qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE
 * (docs/adr/ADR-019-creneaux-dans-le-contrat-et-controles-discriminants.md,
 * lignes 92-98), jamais le cahier directement. L'auteur de cette suite est
 * AVEUGLE aux `source_paths` que verification/tasks.extensions.json declare
 * pour T67 — `packages/activities`, `packages/oracle`, `packages/scenario` —
 * et ne les a lus ni directement ni par `git show` (ADR-001 : aveuglement
 * PROCEDURAL, discipline auditable au diff, jamais une barriere technique).
 * Le contrat teste ci-dessous est derive de docs/specs/T67.md et de sa
 * source, le MEME document ACCEPTE, lignes 92-98, AINSI QUE du corps
 * narratif du MEME document hors de cette plage (section « Decision »,
 * L47-85) — la meme liberte que prennent deja acceptance/T48.spec.ts a
 * acceptance/T64.spec.ts face a leur propre ADR.
 *
 *   L49-59 decision 1, mot pour mot : le contrat `bench.candidate/4` —
 *          onze operations de la v3 plus `slot_id` sur cinq d'entre elles et
 *          la nouvelle operation `create_slot {tenant_id, slot_id, start,
 *          capacity, price} -> {decision}`.
 *   L61-76 decision 2, mot pour mot : les huit points tranches —
 *          designation `(tenant_id, key, slot_id)` (L63-64), fuseau
 *          `Europe/Paris` pour TOUS les locataires (L65), annulation permise
 *          strictement avant le debut du creneau et refusee avec
 *          `CANCELLATION_TOO_LATE` a partir du debut (L66-67), remboursement
 *          sur le montant effectivement debite (L68), promotion de
 *          `quota@1` qui saute l'acteur a deux confirmes (L69-70),
 *          annulation d'une reservation en attente sans remboursement
 *          (L71-72), evenement d'historique `{type, status, at}` (L73),
 *          confirme retrograde qui garde la tete de file jusqu'a la
 *          prochaine reordonnance imposee (L74-76).
 *   L78-79 « Aucun fait gele de F-LONG.json ne change » — ancrage decisif de
 *          A3.
 *   L96   les quatre cas d'acceptation, mot pour mot (docs/specs/T67.md).
 *   L98   commande : `pnpm verify:task T67`. « Aucun service externe
 *         requis ; aucun appel reel. »
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions DEJA FIXEES par les
 * suites ACCEPTEES dont elle etend le socle (jamais les sources de T67) :
 *   - acceptance/T62.spec.ts (II.1-II.3) : le chargement ESM direct de
 *     `packages/scenario` et `packages/activities`, la navigation JSON
 *     generique (`noeuds`/`champTexte`), le marqueur de contrat
 *     (`porteContratV3`, etendu ici en `porteContratV4`), la resolution de
 *     LA description unifiee et la resolution tolerante du texte d'enonce
 *     d'une periode (`ROLES_STATEMENT_BUILDER`, `enonceDePeriode`) —
 *     REPRISES A L'IDENTIQUE, puis prolongees pour le contrat v4.
 *   - acceptance/T61.spec.ts (III-IV) : le chargement de `packages/oracle`,
 *     le role `replayFLong()` (sans argument) et la table des champs de
 *     `facts` par periode — REPRISE A L'IDENTIQUE comme oracle des faits
 *     geles de F-LONG, jamais recalculee une seconde fois ici (ADR-001).
 *   - acceptance/reference-long/F-LONG.json — RACINE GELEE, jamais
 *     recalculee : tout litteral compare dans A3 et dans la moitie de A4 qui
 *     s'appuie sur des faits geles (remboursement de P7, quota de P8) en
 *     provient, porte un commentaire `// ADR-018:L<n>` ou `// ADR-019:L<n>`
 *     resoluble.
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE FIXE ELLE-MEME (ADR-001 : aucune des valeurs ci-dessous
 * n'a ete obtenue en executant une implementation de T67 — aucun module de
 * T67 n'existe encore au moment ou elle est ecrite ; ADR-019 decrit des
 * POINTS tranches, jamais une signature de fonction).
 *
 * 1. LE TEMOIN DU CONTRAT v4 (`porteContratV4`) : le marqueur litteral
 *    `bench.candidate/4`, ou a defaut au moins 8 des 12 noms d'operation
 *    (OPS_V3 + `create_slot`) — meme discipline de seuil proportionnel que
 *    `porteContratV3` (acceptance/T62.spec.ts II.1 : 7 sur 11).
 * 2. LE VOCABULAIRE TEXTUEL D'UN EXEMPLE PUBLIC. ADR-019 ne fixe aucun
 *    format de stockage pour les exemples publics (prose candidate, noeud
 *    structure, ou les deux) : cette suite cherche donc la co-presence de
 *    jetons dans la CONCATENATION de TOUTES les valeurs textuelles de la
 *    description unifiee (`texteComplet`, prolongement de `motifsProches`
 *    d'acceptance/T62.spec.ts), jamais dans la seule prose candidate d'une
 *    periode — un exemple public peut vivre dans un noeud dedie au contrat,
 *    hors du texte adresse au candidat.
 * 3. LE ROLE `replayFLong` (REPRIS DE T61) RESTE LE POINT D'ENTREE DE A3 :
 *    ADR-019 L78-79 dit explicitement qu'aucun fait gele ne change: un
 *    modele etendu pour le contrat v4 peut donc parfaitement garder le MEME
 *    export. Cette suite tente en outre, avant `replayFLong`, une courte
 *    liste d'alias nommes `v4` (`replayFLongV4`, `replayCandidateV4`,
 *    `replayFLongCandidate4`) — AUCUN DES DEUX CHOIX N'EST IMPOSE, l'un ou
 *    l'autre suffit.
 * 4. LE ROLE `resolveAdr019Points` (FIXE ICI, AUCUNE SOURCE NE NOMME de
 *    fonction pour les quatre points d'ADR-019 qui n'ont pas de fait gele
 *    disponible — designation, fuseau, frontiere d'annulation, forme d'un
 *    evenement d'historique, retrogradation) : un export SANS ARGUMENT
 *    (meme geste que `replayFLong`, ADR-019 decrit un SCENARIO particulier,
 *    pas un moteur generique) qui rend, directement ou sous `points`/
 *    `results`/`decisions`, un objet ou un tableau portant CES SIX cles (ou
 *    leur equivalent en tableau `{id, ...}`) — alias tolerants au meme titre
 *    que REGLES_ADR :
 *      `designation`            — { slotBAccepted, slotAOwner, slotBOwner }
 *      `timezone`                — { deadlineAllowed, afterDeadlineAllowed }
 *      `cancellationBoundary`    — { allowedBeforeStart, refusedAtStart,
 *                                    errorCodeAtStart }
 *      `waitingCancellable`      — { accepted, refunded }
 *      `historyEventShape`       — { firstEventKeys: string[] } (ou un objet
 *                                    `firstEvent` dont cette suite prend
 *                                    elle-meme les cles)
 *      `demotedHeadRetention`    — { remainsHeadUntilReorder }
 *    Deux points d'ADR-019 (remboursement sur le montant debite, promotion
 *    de quota@1) ont DEJA un fait gele disponible dans F-LONG.json (P7, P8)
 *    — cette suite les verifie via `replayFLong`/`FAIT`, jamais via
 *    `resolveAdr019Points`, pour ne rien faire tenir d'un role invente alors
 *    qu'une racine gelee suffit.
 * 5. `CANCELLATION_TOO_LATE` — ADR-019:L67, litteral.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * LES DANGERS PROPRES A T67, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER DE CHERCHER `slot_id` N'IMPORTE OU. La
 *     co-presence est exigee DANS UNE FENETRE AUTOUR DU NOM DE L'OPERATION
 *     (`motifsProches`, repris de T62), jamais une simple inclusion globale
 *     des deux jetons dans tout le document — un document qui mentionne
 *     `slot_id` une fois pour `write` et jamais pour `read` passerait une
 *     verification globale a tort.
 * (2) A2 NE DOIT PAS SE CONTENTER DE L'ABSENCE DU CHOIX CONTRAIRE : un enonce
 *     MUET sur un point (ni choix ni contraire) le laisserait passer a tort.
 *     Chaque assertion de A2 exige donc la PRESENCE du motif qui porte le
 *     choix DECIDE, jamais seulement l'absence du motif contraire.
 * (3) A3 NE DOIT PAS SE CONTENTER D'UNE PERIODE : comme T61.A1, cette suite
 *     exige un enregistrement EXPLOITABLE pour LES DOUZE periodes avant de
 *     comparer le moindre fait, et compare CHAQUE champ de la table reprise
 *     de T61 (IV), jamais un sous-ensemble choisi a la main.
 * (4) A4 NE DOIT PAS SE CONTENTER D'UN OBJET VIDE POUR UN POINT NON
 *     OBSERVABLE. `requireAdr019Point` echoue nommement si le point demande
 *     est absent de la resolution — jamais par un acces a une propriete
 *     `undefined` qui laisserait l'assertion suivante tourner sur `NaN`
 *     ou `undefined === undefined`.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne reverifie aucune regle metier de F-LONG deja PROUVEE par
 *    T07/T61/T62 : elle les tient pour ACQUISES et ne relit F-LONG.json que
 *    pour les quelques faits que A3/A4 citent nommement.
 *  • Elle n'exerce ni un contrat NDJSON reel ni une session `claude -p`
 *    (ADR-008) : aucun processus nomme `claude` n'est jamais lance, et aucun
 *    executable candidat n'est invoque — import ESM pur.
 *  • Elle ne genere ni ne note aucune sequence CACHEE par regle (T68) : les
 *    huit sequences de A4 sont ECRITES EN DUR par cette suite, jamais
 *    generees a partir d'une graine.
 *  • Elle ne mesure ni la couverture d'operations par regle, ni le score
 *    d'une regle sur un lot — objets distincts de T68.
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

function egal(obtenu: unknown, attendu: unknown, quoi: string): void {
  const o = rendu(obtenu);
  const a = rendu(attendu);
  expect(o === a ? 'egal' : `DIVERGENT ${quoi} : obtenu=${o} attendu=${a}`).toBe('egal');
}

/* ═══════════════ chargement de packages/scenario + activities + oracle ═ */

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
  for (const pkg of ['scenario', 'activities', 'oracle']) {
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
    'packages-scenario-activities-ou-oracle-charges',
    `AUCUN-DES-TROIS-PAQUETS-N-A-PU-ETRE-CHARGE : ${LOADED.attempts.join(' | ')}`,
  );
}

/* ═══════════════════ navigation JSON generique (reprise T62/T64) ═══════ */

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

/** Comme champTexte, mais rend la valeur QUEL QUE SOIT SON TYPE (bool, nombre,
 * tableau...) — necessaire pour les points d'ADR-019 (II.4), dont la plupart
 * des champs sont des booleens ou des nombres, pas des chaines. */
function champValeur(r: unknown, alias: readonly string[]): unknown {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(r)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== undefined && n.valeur !== null) {
      return n.valeur;
    }
  }
  return undefined;
}

/* ═══════════════════ contrat bench.candidate/4 (II.1) ══════════════════ */

const MARQUEUR_CONTRAT_V4 = 'bench.candidate/4';
const OPS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint'];
const OPS_V3_NOUVELLES = ['set_capacity', 'set_level', 'balance', 'history', 'transfer'];
const OPS_V3 = [...OPS_V2, ...OPS_V3_NOUVELLES];
const OPS_V4 = [...OPS_V3, 'create_slot'];
const OPS_SLOTEES = ['write', 'read', 'probe_cancel', 'history', 'transfer'] as const;

function porteContratV4(racine: unknown): boolean {
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && n.valeur === MARQUEUR_CONTRAT_V4) return true;
  }
  const vues = new Set<string>();
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && OPS_V4.includes(n.valeur)) vues.add(n.valeur);
  }
  return vues.size >= 8;
}

/* ═══════════════════ les douze periodes (II) ════════════════════════════ */

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
    if (!porteContratV4(c.valeur)) continue;
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
    'description-unifiee-v4-resolue',
    `DESCRIPTION-UNIFIEE-V4-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT_V4} et au moins deux enonces de periode. Exports vus : ${rendu([...LOADED.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}

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
    texte !== null && texte.length > 0,
    `enonce-${cle}-resolu`,
    `ENONCE-INTROUVABLE-OU-VIDE-POUR ${cle}.`,
  );
  return (texte as string).toLowerCase();
}

/** Concatenation, en minuscules, de TOUTES les valeurs textuelles atteignables
 * depuis la description unifiee (II.2) — un exemple public peut vivre hors du
 * texte adresse au candidat (noeud de contrat dedie). */
function texteComplet(description: Json): string {
  const morceaux: string[] = [];
  for (const n of noeuds(description)) {
    if (typeof n.valeur === 'string' && n.valeur.length > 0) morceaux.push(n.valeur);
  }
  return morceaux.join('\n').toLowerCase();
}

/** Repris d'acceptance/T62.spec.ts (II.4) : vrai si CHAQUE motif de `motifs`
 * apparait dans `texte`, avec au moins une occurrence du PREMIER motif pour
 * laquelle TOUS les autres apparaissent dans une fenetre de `fenetre`
 * caracteres autour d'elle. */
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

/* ═══════ les douze ensembles de regles — oracle (reprise T61.V) ════════ */
// ADR-018:L61-65 et L86-155. Repris d'acceptance/T61.spec.ts (V), suite
// ACCEPTEE, PROUVEE a HEAD : jamais recalcule ici.
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

/* ═══════════════ racine gelee F-LONG (reprise T61) ══════════════════════ */

const REFERENCE_LONG_DIR = path.join(REPO, 'acceptance', 'reference-long');
const LONG = JSON.parse(fs.readFileSync(path.join(REFERENCE_LONG_DIR, 'F-LONG.json'), 'utf8')) as Json;

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
const LV = (chemin: string): unknown => refValue(LONG, `valeurs.${chemin}`);
/** Fait attendu `valeurs.<periode>.faits.<cle>.valeur` de F-LONG.json — P5 a
 *  P12 SEULEMENT (voir le bloc F-RESERVATION ci-dessous pour P1 a P4). */
const FAIT = (periode: string, cle: string): unknown => LV(`${periode}.faits.${cle}.valeur`);

/* ═══════════ racine gelee F-RESERVATION (P1 a P4, reprise T61) ══════════
 * ADR-018:L86-89 : « P1 à P4 reprennent F-RESERVATION [...] à l'identique ».
 * L'entree `valeurs.P1_a_P4` de F-LONG.json n'est qu'une note de renvoi
 * (`reference`/`adr_lines`/`note`/`regles`/`etat_S1_a_l_entree_de_P5`) :
 * elle NE PORTE AUCUN `faits` — appeler `FAIT('P1', ...)` leve
 * REFERENCE-CHEMIN-ABSENT quel que soit le modele attendu, bloque sur la cle
 * `faits` elle-meme, jamais une divergence de VALEUR. C'est acceptance/
 * T61.spec.ts (ACCEPTEE, PROUVEE a HEAD, section II « fixture de reference
 * (racine gelee, F-RESERVATION) ») qui etablit la VRAIE source de P1 a P4 —
 * REPRISE A L'IDENTIQUE ci-dessous (memes chemins, memes litteraux, meme
 * normalisation de statut ; ADR-001 : jamais re-derivee depuis les
 * source_paths de T67). */
const REFERENCE_DIR = path.join(REPO, 'acceptance', 'reference');
const RESERVATION = JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, 'F-RESERVATION.json'), 'utf8')) as Json;
const S = (chemin: string): string => String(refValue(RESERVATION, chemin));
const ACTEURS_RESERVATION = (refValue(RESERVATION, 'valeurs.acteurs.valeur') as unknown[]).map(String);
const [ACTEUR_A, ACTEUR_B, ACTEUR_C] = ACTEURS_RESERVATION as [string, string, string];
const P4_ENTREE_A = S('valeurs.P4.etat_persistant_a_l_entree.A.valeur');
const P4_ENTREE_B = S('valeurs.P4.etat_persistant_a_l_entree.B.valeur');
const P4_ENTREE_C = S('valeurs.P4.etat_persistant_a_l_entree.C.valeur');
const CODE_NOT_FOUND = 'NOT_FOUND'; // cahier:L123, repris par T07/T61

/** Memes statuts normalises que T61 (section II) — jamais une comparaison
 *  litterale d'une etiquette de statut brute. */
type Statut = 'confirme' | 'attente' | 'annule';
function normaliserStatut(brut: string): Statut | string {
  const t = brut.toLowerCase();
  if (/annul|cancel/.test(t)) return 'annule';
  if (/confirm|booked|reserved|held/.test(t)) return 'confirme';
  if (/attente|wait|queue|pending/.test(t)) return 'attente';
  return `STATUT-ILLISIBLE(${brut})`;
}
/** Champs dont la valeur est un LIBELLE de statut (compares par
 *  `normaliserStatut`, jamais par egalite litterale de l'etiquette — T61,
 *  ou acceptance/reference-long/F-LONG.json porte un libelle FRANCAIS,
 *  p.ex. `"annulé"`, alors que `facts` rend un code court, p.ex.
 *  `"cancelled"` : une egalite litterale les declare a tort DIVERGENTS).
 *  Reprise A L'IDENTIQUE des champs qu'acceptance/T61.spec.ts compare via
 *  `STATUT`/`normaliser`, jamais via `FAIT`/`egal` brut — P1 a P4 inclus. */
const CHAMPS_STATUT_NORMALISES = new Set([
  's1_status',
  'base_a_status',
  'base_b_status',
  'base_c_status',
  's2_a_status',
  'd_s4_status',
  'd_s5_status',
  'e_s2_history_first_status',
  'd_s6_status',
  'b_s1_from_other',
]);
/** @deprecated alias retenu pour la lisibilite du bloc P1-P4 ci-dessous. */
const CHAMPS_STATUT_P1_A_P4 = CHAMPS_STATUT_NORMALISES;

/** Valeur ATTENDUE d'un fait de P1 a P4 — F-RESERVATION (ci-dessus), jamais
 *  F-LONG.json. `P2.waiting_order` est traite a part dans T67.A3 (seul le
 *  premier element, ACTEUR_C, est fixe par la racine — T61 ne compare pas le
 *  tableau entier). */
function faitP1AP4(periode: string, cle: string): unknown {
  switch (`${periode}.${cle}`) {
    case 'P1.s1_owner':
      return ACTEUR_A;
    case 'P1.s1_status':
      return 'confirme';
    case 'P1.duplicate_idempotent_no_dup':
      return true;
    case 'P1.b_rejected_no_overbooking':
      return true;
    case 'P2.s1_owner':
      return ACTEUR_B;
    case 'P2.s1_status':
      return 'confirme';
    case 'P3.clone_at_boundary_allowed':
      return true;
    case 'P3.clone_at_boundary_new_owner':
      return ACTEUR_C;
    case 'P3.clone_after_boundary_allowed':
      return false;
    case 'P4.base_a_status':
      return P4_ENTREE_A;
    case 'P4.base_b_status':
      return P4_ENTREE_B;
    case 'P4.base_c_status':
      return P4_ENTREE_C;
    case 'P4.other_tenant_read_legacy_s1':
      return CODE_NOT_FOUND;
    default:
      throw new Error(`FAIT-P1-A-P4-INCONNU ${periode}.${cle} (voir faitP1AP4)`);
  }
}
/** Periodes dont les faits sont lus dans F-LONG.json (reprise T61, III). */
const PERIODES_LONGUES = new Set(['P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12']);

// IV (reprise d'acceptance/T61.spec.ts, section IV) : les champs de `facts`
// par periode, pour exiger que CHAQUE fait gele soit reproduit par A3 — pas
// un sous-ensemble choisi a la main.
const CHAMPS_FACTS: Record<Periode, string[]> = {
  P1: ['s1_owner', 's1_status', 'duplicate_idempotent_no_dup', 'b_rejected_no_overbooking'],
  P2: ['s1_owner', 's1_status', 'waiting_order'],
  P3: ['clone_at_boundary_allowed', 'clone_at_boundary_new_owner', 'clone_after_boundary_allowed'],
  P4: ['base_a_status', 'base_b_status', 'base_c_status', 'other_tenant_read_legacy_s1'],
  P5: ['s2_capacity_final', 's2_owner', 's2_waiting_order'],
  P6: ['s2_owner', 's2_waiting_order', 's2_a_status'],
  P7: ['b_refund', 'c_refund', 'c_cancel_allowed', 'balance_B', 'balance_C'],
  P8: ['d_s4_status', 'd_s5_status', 'd_s6_result', 'd_s6_waiting', 'd_s6_debited'],
  P9: ['refund_at_deadline', 'refund_after_deadline'],
  P10: ['e_s2_history_first_event', 'e_s2_history_first_status'],
  P11: ['s8_owner', 's8_waiting_order', 'd_s6_status'],
  P12: ['b_s1_from_other', 'b_s1_from_legacy', 'b_s1_from_third'],
};

/* ═══════════════ resolution tolerante du replay (reprise T61.III) ══════ */

const ROLES_REPLAY_FLONG = [
  // Alias « v4 » d'abord (II.3) : un modele qui expose un export DEDIE au
  // contrat v4 est prefere s'il existe, mais n'est JAMAIS exige.
  'replayFLongV4',
  'replayCandidateV4',
  'replayFLongCandidate4',
  // Alias repris d'acceptance/T61.spec.ts (III) — le meme export suffit,
  // ADR-019:L78-79 : « Aucun fait gele de F-LONG.json ne change ».
  'replayFLong',
  'runFLong',
  'replayLongScenario',
  'playFLong',
  'executeFLong',
  'buildFLong',
  'runLongScenario',
  'createLongScenarioOracle',
] as const;

type EnregistrementPeriode = { activeRules: string[]; facts: Json };

function extraireEnregistrements(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v !== null && typeof v === 'object') {
    for (const k of ['periods', 'periodes', 'records']) {
      const x = (v as Json)[k];
      if (Array.isArray(x)) return x;
    }
    return Object.values(v as Json);
  }
  return null;
}

let REPLAY_CACHE: unknown[] | null = null;
let REPLAY_NOM: string | null = null;

async function resoudreReplay(): Promise<unknown[] | null> {
  if (REPLAY_CACHE !== null) return REPLAY_CACHE;
  for (const nom of ROLES_REPLAY_FLONG) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    const res = await essayer(() => (fn as () => unknown)());
    if (!res.ok) continue;
    const lot = extraireEnregistrements(res.value);
    if (lot !== null) {
      REPLAY_CACHE = lot;
      REPLAY_NOM = nom;
      return lot;
    }
  }
  return null;
}

function trouverEnregistrement(lot: unknown[], cle: Periode): Json | null {
  for (const entree of lot) {
    if (entree === null || typeof entree !== 'object') continue;
    const idTexte = champTexte(entree, ['period', 'periode', 'id', 'name']);
    if (idTexte !== null && normKey(idTexte) === normKey(cle)) return entree as Json;
  }
  return null;
}

async function requirePeriode(cle: Periode): Promise<EnregistrementPeriode> {
  const lot = await resoudreReplay();
  exige(
    lot !== null,
    'replay-flong-resolu',
    `REPLAY-FLONG-INTROUVABLE parmi ${rendu([...ROLES_REPLAY_FLONG])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  const entree = trouverEnregistrement(lot as unknown[], cle);
  exige(
    entree !== null,
    `periode-${cle}-exploitable-${REPLAY_NOM ?? ''}`,
    `PERIODE-${cle}-INTROUVABLE-DANS-LE-REPLAY (export ${REPLAY_NOM ?? '?'}) : ${rendu(lot)}`,
  );
  const activeRulesBrut = champValeur(entree, ['active_rules', 'activeRules', 'regles_actives', 'rules']);
  const factsBrut = champValeur(entree, ['facts', 'faits']);
  exige(
    Array.isArray(activeRulesBrut) && (activeRulesBrut as unknown[]).length > 0,
    `periode-${cle}-active-rules-non-vide`,
    `${cle}-SANS-ACTIVE_RULES-EXPLOITABLE : ${rendu(entree)}`,
  );
  exige(
    factsBrut !== undefined && factsBrut !== null && typeof factsBrut === 'object',
    `periode-${cle}-facts-exploitable`,
    `${cle}-SANS-FACTS-EXPLOITABLE : ${rendu(entree)}`,
  );
  return { activeRules: (activeRulesBrut as unknown[]).map(String), facts: factsBrut as Json };
}

function champFait(facts: Json, cle: string): unknown {
  // Acces DIRECT d'abord (meme geste que `champ()` d'acceptance/T61.spec.ts,
  // section II) : `facts` est un dictionnaire PLAT, jamais une description
  // a forme libre. `champValeur` (generique, II.1) exclut DELIBEREMENT les
  // valeurs `null` (il cherche "une" valeur significative parmi plusieurs
  // noeuds candidats) — exactement le defaut qui rendrait
  // `P12.b_s1_from_legacy` (ADR-018:L154-155, valeur ATTENDUE `null`)
  // irresolvable quelle que soit l'implementation. L'acces direct distingue
  // "absent" de "present et nul" ; le detour par `champValeur` ne reste
  // qu'un FILET pour un `facts` exceptionnellement imbrique.
  if (cle in facts) return facts[cle];
  return champValeur(facts, [cle]);
}

/* ═══════ resolution tolerante de resolveAdr019Points (II.4, FIXE ICI) ══ */

const ROLES_ADR019_POINTS = [
  'resolveAdr019Points',
  'resolveAdr019Decisions',
  'decideAdr019Points',
  'replayAdr019Points',
  'buildAdr019DiscriminatingSequences',
  'applyAdr019Decisions',
] as const;

function extrairePointsAdr019(v: unknown): Json | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Json;
  const conteneur = o.points ?? o.results ?? o.decisions ?? o;
  if (conteneur === null || typeof conteneur !== 'object') return null;
  if (Array.isArray(conteneur)) {
    const out: Json = {};
    for (const entree of conteneur as unknown[]) {
      if (entree === null || typeof entree !== 'object') continue;
      const id = champTexte(entree, ['id', 'key', 'name', 'point']);
      if (id !== null) out[id] = entree;
    }
    return out;
  }
  return conteneur as Json;
}

let ADR019_CACHE: Json | null = null;
let ADR019_NOM: string | null = null;

async function resoudreAdr019Points(): Promise<Json | null> {
  if (ADR019_CACHE !== null) return ADR019_CACHE;
  for (const nom of ROLES_ADR019_POINTS) {
    const fn = LOADED.flat.get(nom);
    if (typeof fn !== 'function') continue;
    const res = await essayer(() => (fn as () => unknown)());
    if (!res.ok) continue;
    const points = extrairePointsAdr019(res.value);
    if (points !== null) {
      ADR019_CACHE = points;
      ADR019_NOM = nom;
      return points;
    }
  }
  return null;
}

/** Trouve le sous-objet d'un point par un ensemble d'alias de cle (tolerant
 * aux variantes snake/camel : `cancellation_boundary`, `cancellationBoundary`,
 * `cancellationBoundaryPoint`...). */
function trouverPoint(points: Json, alias: readonly string[]): Json | null {
  const cible = new Set(alias.map(normKey));
  for (const [k, v] of Object.entries(points)) {
    if (cible.has(normKey(k)) && v !== null && typeof v === 'object') return v as Json;
  }
  return null;
}

async function requirePoint(alias: readonly string[], libelle: string): Promise<Json> {
  const points = await resoudreAdr019Points();
  exige(
    points !== null,
    'resolveAdr019Points-resolu',
    `RESOLVEADR019POINTS-INTROUVABLE parmi ${rendu([...ROLES_ADR019_POINTS])} (exports vus : ${rendu([...LOADED.flat.keys()])})`,
  );
  const p = trouverPoint(points as Json, alias);
  exige(
    p !== null,
    `point-adr019-${libelle}-resolu`,
    `POINT-ADR019-${libelle}-INTROUVABLE (export ${ADR019_NOM ?? '?'}) parmi les cles ${rendu(Object.keys(points as Json))} ; alias cherches ${rendu([...alias])}`,
  );
  return p as Json;
}

/* ═══════════════════════════════ T67.A1 ════════════════════════════════ */

test(
  "T67.A1 — le contrat bench.candidate/4 porte slot_id sur write/read/probe_cancel/history/transfer et l'operation create_slot (tenant_id, slot_id, start, capacity, price) ; chaque forme de reponse a un exemple public de forme exacte",
  async () => {
    assertPackagesLoaded();
    const description = requireDescriptionUnifiee();

    exige(
      porteContratV4(description),
      'description-porte-le-contrat-v4',
      `DESCRIPTION-NE-PORTE-PAS-LE-TEMOIN-DE ${MARQUEUR_CONTRAT_V4} (ni marqueur litteral, ni au moins 8 des 12 noms d'operation OPS_V4).`,
    );

    const texte = texteComplet(description);

    // (a) slot_id sur chacune des cinq operations qui visent une reservation
    // (ADR-019:L52-53).
    for (const op of OPS_SLOTEES) {
      exige(
        motifsProches(texte, [op, 'slot_id'], 200),
        `${op}-porte-slot_id`,
        `${op.toUpperCase()}-NE-PORTE-PAS-slot_id-A-PROXIMITE dans la description resolue.`,
      );
    }

    // (b) create_slot {tenant_id, slot_id, start, capacity, price} -> {decision}
    // (ADR-019:L54-56, litteral).
    exige(
      motifsProches(texte, ['create_slot', 'tenant_id', 'slot_id', 'start', 'capacity', 'price'], 250),
      'create_slot-porte-ses-cinq-champs',
      `CREATE_SLOT-INCOMPLET : tenant_id/slot_id/start/capacity/price non tous co-presents a proximite de create_slot dans la description resolue.`,
    );
    exige(
      motifsProches(texte, ['create_slot', 'decision'], 250),
      'create_slot-rend-decision',
      `CREATE_SLOT-SANS-CHAMP-decision a proximite dans la description resolue.`,
    );

    // (c) chaque forme de reponse a un EXEMPLE PUBLIC de forme exacte —
    // enveloppe NDJSON etablie par acceptance/T48.spec.ts (III.2), reprise
    // par acceptance/T62.spec.ts (II.4). Deux formes exigees nommement :
    // create_slot reussi, et une operation sloetee reussie qui ECHO son
    // slot_id en argument (forme exacte de l'enveloppe de requete/reponse).
    exige(
      motifsProches(texte, ['create_slot', 'ok":true', 'decision'], 300),
      'exemple-public-create_slot-reussi',
      `CREATE_SLOT-SANS-EXEMPLE-PUBLIC-DE-REUSSITE (ok":true + decision a proximite) dans la description resolue.`,
    );
    exige(
      motifsProches(texte, ['slot_id', 'ok":true'], 300),
      'exemple-public-operation-sloetee-reussie',
      `AUCUNE-OPERATION-SLOTEE-N-A-D-EXEMPLE-PUBLIC-DE-REUSSITE (slot_id + ok":true a proximite) dans la description resolue.`,
    );
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T67.A2 ════════════════════════════════ */

test(
  "T67.A2 — l'enonce de chaque periode ou l'un des huit points d'ADR-019 s'applique l'enonce tel qu'ADR-019 le tranche",
  async () => {
    assertPackagesLoaded();
    const description = requireDescriptionUnifiee();

    const enonces = new Map<Periode, string>();
    for (const p of PERIODES) enonces.set(p, await requireEnonce(p, description));
    const corpus = [...enonces.values()].join('\n');

    // Ancrage DECISIF (cases.extensions.lock.json#T67.A2) : l'enonce de P7
    // doit dire que le remboursement porte sur le montant DEBITE —
    // ADR-019:L68, et distinct de P7 lui-meme sous ADR-018 (price@1,
    // introduite a P7).
    const p7 = enonces.get('P7') as string;
    exige(
      motifsProches(p7, ['remboursement', 'débit'], 400) || motifsProches(p7, ['remboursement', 'debit'], 400),
      'P7-enonce-le-remboursement-sur-le-montant-debite',
      `P7-N-ENONCE-PAS-QUE-LE-REMBOURSEMENT-PORTE-SUR-LE-MONTANT-DEBITE (ADR-019:L68) : ${court(p7)}`,
    );

    // Les sept autres points : cherches dans le CORPUS entier des douze
    // enonces (II.2 : ADR-019 ne fixe pas de periode precise pour chacun,
    // hors P7 ci-dessus) — motif qui porte le choix DECIDE, jamais la seule
    // absence du choix contraire (III.2).
    const POINTS: { libelle: string; motifs: string[] }[] = [
      // ADR-019:L63-64 — designation par le triplet.
      { libelle: 'designation-par-tenant-key-slot_id', motifs: ['tenant_id', 'key', 'slot_id'] },
      // ADR-019:L65 — fuseau Europe/Paris pour TOUS les locataires.
      { libelle: 'fuseau-europe-paris-pour-tous-les-locataires', motifs: ['europe/paris'] },
      // ADR-019:L66-67 — frontiere d'annulation au debut du creneau.
      { libelle: 'annulation-stricte-avant-le-debut', motifs: ['avant', 'début', 'créneau'] },
      { libelle: 'code-cancellation_too_late', motifs: ['cancellation_too_late'] },
      // ADR-019:L69-70 — promotion de quota@1 qui saute l'acteur a deux confirmes.
      { libelle: 'quota-promotion-saute-deux-confirmes', motifs: ['quota', 'deux', 'confirmé'] },
      // ADR-019:L71-72 — annulation d'une reservation en attente, sans remboursement.
      { libelle: 'attente-annulable-sans-remboursement', motifs: ['attente', 'annul'] },
      // ADR-019:L73 — forme de l'evenement d'historique.
      { libelle: 'evenement-historique-type-status-at', motifs: ['type', 'status', 'at'] },
      // ADR-019:L74-76 — confirme retrograde garde la tete de file.
      { libelle: 'retrograde-garde-la-tete-de-file', motifs: ['retrograd', 'tête', 'file'] },
    ];
    for (const { libelle, motifs } of POINTS) {
      exige(
        motifsProches(corpus, motifs, 400),
        `corpus-enonce-${libelle}`,
        `AUCUN-ENONCE-DE-PERIODE-NE-PORTE ${libelle} (motifs attendus ${rendu(motifs)} co-presents) : corpus de ${corpus.length} caracteres.`,
      );
    }
  },
  CASE_TIMEOUT_MS,
);

/* ═══════════════════════════════ T67.A3 ════════════════════════════════ */

test(
  'T67.A3 — le modele attendu rejoue sur la trajectoire principale de F-LONG produit chaque fait de acceptance/reference-long/F-LONG.json',
  async () => {
    assertPackagesLoaded();

    for (const periode of PERIODES) {
      const { facts } = await requirePeriode(periode);
      for (const cle of CHAMPS_FACTS[periode]) {
        const obtenu = champFait(facts, cle);

        if (!PERIODES_LONGUES.has(periode)) {
          // P1 a P4 : F-RESERVATION (ADR-018:L86-89), jamais F-LONG.json —
          // son entree `P1_a_P4` n'est qu'une note de renvoi, sans `faits`
          // (voir le bloc F-RESERVATION ci-dessus pour la citation complete).
          if (periode === 'P2' && cle === 'waiting_order') {
            exige(
              Array.isArray(obtenu),
              'P2-waiting_order-est-un-tableau',
              `P2.WAITING_ORDER-PAS-UN-TABLEAU : ${rendu(obtenu)}`,
            );
            egal((obtenu as unknown[])[0], ACTEUR_C, 'P2.waiting_order[0] (F-RESERVATION)');
            continue;
          }
          const attenduReservation = faitP1AP4(periode, cle);
          if (CHAMPS_STATUT_P1_A_P4.has(cle)) {
            egal(
              normaliserStatut(String(obtenu)),
              normaliserStatut(String(attenduReservation)),
              `${periode}.${cle} (F-RESERVATION, statut normalise)`,
            );
          } else {
            egal(obtenu, attenduReservation, `${periode}.${cle} (F-RESERVATION)`);
          }
          continue;
        }

        const attendu = FAIT(periode, cle);
        if (CHAMPS_STATUT_NORMALISES.has(cle)) {
          // Meme raison que pour P1-P4 ci-dessus : F-LONG.json porte un
          // libelle FRANCAIS ("annulé", "confirmé"...), jamais le code court
          // que `facts` rend ("cancelled", "confirmed"...) — T61 ne compare
          // JAMAIS ces champs par egalite litterale (reprise a l'identique).
          egal(normaliserStatut(String(obtenu)), normaliserStatut(String(attendu)), `${periode}.${cle} (reference-long, statut normalise)`);
        } else {
          egal(obtenu, attendu, `${periode}.${cle} (reference-long)`);
        }
      }
    }
  },
  CASE_TIMEOUT_MS * 2,
);

/* ═══════════════════════════════ T67.A4 ════════════════════════════════ */

test(
  "T67.A4 — le modele attendu applique chacun des huit points d'ADR-019 tels qu'ils sont tranches, chacun verifie par une sequence qui le distingue de l'autre choix",
  async () => {
    assertPackagesLoaded();

    // ── Points 4 et 5 (ADR-019:L68 et L69-70) : DEJA un fait gele dans
    // F-LONG.json (P7, P8) — verifies via le replay, jamais via
    // resolveAdr019Points (II.4, dernier paragraphe).
    {
      const p7 = await requirePeriode('P7');
      const bRefund = champFait(p7.facts, 'b_refund');
      egal(bRefund, FAIT('P7', 'b_refund'), 'P7.b_refund (remboursement sur le montant debite, ADR-019:L68)'); // ADR-018:L113-114
      // Anti-tautologie : le remboursement decide (999, 50% du montant
      // DEBITE 1999) differe du prix COURANT du creneau au moment de
      // l'annulation — s'il se calculait sur le prix courant, l'implementation
      // contraire produirait une autre valeur que le montant debite.
      const prixS3 = LV('P7.creneaux.S3.prix');
      exige(
        bRefund !== prixS3,
        'P7-remboursement-distinct-du-prix-courant',
        `P7-REMBOURSEMENT-EGAL-AU-PRIX-COURANT : b_refund=${rendu(bRefund)} prix=${rendu(prixS3)} — ne distingue pas montant debite de prix courant.`,
      );
    }
    {
      const p8 = await requirePeriode('P8');
      egal(
        champFait(p8.facts, 'd_s6_result'),
        FAIT('P8', 'd_s6_result'),
        'P8.d_s6_result (promotion de quota@1 qui saute l\'acteur a deux confirmes, ADR-019:L69-70)',
      ); // ADR-018:L123
      egal(champFait(p8.facts, 'd_s6_waiting'), FAIT('P8', 'd_s6_waiting'), 'P8.d_s6_waiting (reste en attente)'); // ADR-018:L120
    }

    // ── Point 1 (ADR-019:L63-64) : designation par (tenant_id, key, slot_id).
    {
      const p = await requirePoint(['designation', 'designation_by_slot', 'reservationDesignation'], 'designation');
      const accepte = champValeur(p, ['slotBAccepted', 'slot_b_accepted', 'secondAccepted']);
      const proprioA = champValeur(p, ['slotAOwner', 'slot_a_owner']);
      const proprioB = champValeur(p, ['slotBOwner', 'slot_b_owner']);
      exige(
        accepte === true,
        'designation-slot-b-accepte',
        `DESIGNATION-SLOT-B-NON-ACCEPTE : une seconde reservation de MEME key sur un slot_id DIFFERENT doit etre acceptee comme une identite DISTINCTE (slotBAccepted=${rendu(accepte)}) — sinon l'implementation conflate (tenant_id,key) sans slot_id.`,
      );
      exige(
        typeof proprioA === 'string' && typeof proprioB === 'string' && proprioA !== proprioB,
        'designation-deux-proprietaires-distincts',
        `DESIGNATION-MEME-PROPRIETAIRE-SUR-LES-DEUX-SLOTS : slotAOwner=${rendu(proprioA)} slotBOwner=${rendu(proprioB)} — la designation par slot_id doit distinguer les deux reservations.`,
      );
    }

    // ── Point 2 (ADR-019:L65) : fuseau Europe/Paris pour TOUS les
    // locataires, pas seulement legacy.
    {
      const p = await requirePoint(['timezone', 'nonLegacyTimezone', 'tenant_timezone'], 'timezone');
      const avant = champValeur(p, ['deadlineAllowed', 'deadline_allowed']);
      const apres = champValeur(p, ['afterDeadlineAllowed', 'after_deadline_allowed']);
      exige(
        avant === true,
        'timezone-frontiere-pile-autorisee',
        `TIMEZONE-FRONTIERE-PILE-REFUSEE pour un locataire non-legacy : deadlineAllowed=${rendu(avant)} (meme frontiere Europe/Paris que legacy, ADR-018:L130-131 / ADR-019:L65).`,
      );
      exige(
        apres === false,
        'timezone-apres-frontiere-refusee',
        `TIMEZONE-APRES-FRONTIERE-AUTORISEE pour un locataire non-legacy : afterDeadlineAllowed=${rendu(apres)} — si le fuseau n'etait pas Europe/Paris pour ce locataire, la frontiere d'une milliseconde ne tomberait pas au meme instant que pour legacy.`,
      );
    }

    // ── Point 3 (ADR-019:L66-67) : annulation permise strictement avant le
    // debut du creneau, refusee avec CANCELLATION_TOO_LATE a partir du debut.
    {
      const p = await requirePoint(['cancellationBoundary', 'cancellation_boundary', 'cancelAtSlotStart'], 'cancellationBoundary');
      const avant = champValeur(p, ['allowedBeforeStart', 'allowed_before_start']);
      const refusAuDebut = champValeur(p, ['refusedAtStart', 'refused_at_start']);
      const code = champValeur(p, ['errorCodeAtStart', 'error_code_at_start', 'code']);
      exige(
        avant === true,
        'annulation-avant-debut-autorisee',
        `ANNULATION-AVANT-LE-DEBUT-REFUSEE : allowedBeforeStart=${rendu(avant)} (ADR-019:L66 : « permise strictement avant le debut »).`,
      );
      exige(
        refusAuDebut === true,
        'annulation-a-l-instant-du-debut-refusee',
        `ANNULATION-A-L-INSTANT-DU-DEBUT-AUTORISEE : refusedAtStart=${rendu(refusAuDebut)} — c'est exactement la perturbation prescrite par verification/cases.extensions.lock.json#T67.A4 (« autoriser l'annulation a l'instant du debut du creneau »).`,
      );
      egal(code, 'CANCELLATION_TOO_LATE', 'cancellationBoundary.errorCodeAtStart (ADR-019:L67)');
    }

    // ── Point 6 (ADR-019:L71-72) : une reservation EN ATTENTE peut etre
    // annulee, sans remboursement puisque rien n'a ete debite.
    {
      const p = await requirePoint(['waitingCancellable', 'waiting_cancellable', 'cancelWhileWaiting'], 'waitingCancellable');
      const accepte = champValeur(p, ['accepted', 'cancelAccepted']);
      const rembourse = champValeur(p, ['refunded', 'refund']);
      exige(
        accepte === true,
        'annulation-en-attente-acceptee',
        `ANNULATION-D-UNE-RESERVATION-EN-ATTENTE-REFUSEE : accepted=${rendu(accepte)} (ADR-019:L71 : « une reservation en attente peut etre annulee »).`,
      );
      egal(rembourse, 0, 'waitingCancellable.refunded (rien n\'a ete debite, ADR-019:L71-72)');
    }

    // ── Point 7 (ADR-019:L73) : un evenement d'historique est
    // {type, status, at} — exactement ces trois champs.
    {
      const p = await requirePoint(['historyEventShape', 'history_event_shape', 'historyEvent'], 'historyEventShape');
      let cles = champValeur(p, ['firstEventKeys', 'first_event_keys']) as unknown;
      if (!Array.isArray(cles)) {
        const evt = champValeur(p, ['firstEvent', 'first_event']);
        if (evt !== null && typeof evt === 'object' && !Array.isArray(evt)) cles = Object.keys(evt as Json);
      }
      exige(
        Array.isArray(cles),
        'historyEventShape-cles-exploitables',
        `HISTORYEVENTSHAPE-SANS-CLES-EXPLOITABLES : ${rendu(p)}`,
      );
      const clesNorm = [...new Set((cles as unknown[]).map((k) => normKey(String(k))))].sort();
      egal(clesNorm, ['at', 'status', 'type'], "historyEventShape : cles exactes {type, status, at} (ADR-019:L73)");
    }

    // ── Point 8 (ADR-019:L74-76) : un confirme retrograde garde la tete de
    // file jusqu'a la prochaine reordonnance imposee (priority@1 ou fifo@2).
    {
      const p = await requirePoint(['demotedHeadRetention', 'demoted_head_retention', 'demotedConfirmedKeepsHead'], 'demotedHeadRetention');
      const garde = champValeur(p, ['remainsHeadUntilReorder', 'remains_head_until_reorder']);
      exige(
        garde === true,
        'demote-garde-la-tete-de-file',
        `CONFIRME-RETROGRADE-NE-GARDE-PAS-LA-TETE-DE-FILE : remainsHeadUntilReorder=${rendu(garde)} (ADR-019:L74-76).`,
      );
    }
  },
  CASE_TIMEOUT_MS * 2,
);
