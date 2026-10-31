// acceptance/fixtures/claude-cli/t76-two-arms-derive.mjs — zone ACCEPTANCE (test-author de T76).
//
// MODULE DE DERIVATION du faux executable `claude` (acceptance/fixtures/claude-cli/bin/claude,
// mecanisme BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE de T55, sortie par session ajoutee par
// T76) pour le pilote F-PLATFORM a deux bras (ADR-021 decision 5, acceptance/T76.spec.ts).
//
// Il joue, a chaque session, un developpeur qui LIT SON PROMPT :
//   - si le prompt contient la consigne de methode (texte exact de
//     BENCH_FAKE_CLAUDE_T76_INSTRUCTION, la consigne que le manifeste declare pour le bras B),
//     il « obeit » : petites fonctions sans branche, un module par ticket, des tests
//     d'acceptation `node:test` ecrits d'abord (bras B, « discipline ») ;
//   - sinon il code « naturellement » : un seul module, une seule fonction qui grossit de
//     blocs copies-colles et ramifies, aucun test (bras A, « naturel »).
//   Le comportement de la plateforme, lui, est le MEME dans les deux bras : `candidate.mjs`
//   pose ses variables puis importe le candidat de reference de T74
//   (acceptance/fixtures/candidates/f-platform-reference-candidate.mjs, protocole
//   bench.platform/1). Une seule trajectoire s'en ecarte : la DEUXIEME du bras A prive la
//   clause P6.R2 a partir de P9 (BENCH_DROP_CLAUSE), pour qu'une regression ait lieu.
//
// IDENTITE DE TRAJECTOIRE. A la premiere session d'un depot, le module alloue un RANG k
// (1, 2, ...) propre au bras, par creation exclusive (flag 'wx') d'un fichier
// `<etat>/rang-<bras>-<k>` — sur meme si plusieurs trajectoires tournent en parallele — et
// l'inscrit dans le depot (`.bench-t76/trajectoire.json`, conserve d'une periode a l'autre
// comme tout fichier du candidat, T73.A4).
//
// PERIODE. Le plus grand n tel que `docs/tickets/Pnn.md` existe dans le depot (T73 : le
// moteur y ecrit le ticket de la periode AVANT la session).
//
// COUTS. Chaque session rend (champ `stdout`, extension T76 du faux executable) un JSON
// « success » dont TOUS les comptes sont proportionnels a un facteur entier
// f = facteurDeCout(bras, k, n) : tokens (1000 f entrants, 300 f sortants, 5000 f lus en
// cache, 200 f ecrits en cache), `num_turns` = f, `duration_ms` = 1500 f, cout = f / 1000 USD.
// Toute mesure de cout lineaire en ces comptes est donc proportionnelle a f, avec le meme
// coefficient dans les deux bras : le rapport B/A ne depend pas de la mesure retenue.
//
// JOURNAUX (sous BENCH_FAKE_CLAUDE_T76_STATE_DIR, noms uniques, jamais de compteur partage) :
//   sessions/<bras>-<k>-Pnn-<pid>-<alea>.json : {prompt, cwd, bras, rang, periode, f,
//     tokens, turns, tests, privation, ...} — une entree par session ;
//   lancements/<bras>-<k>-Pnn.log : une ligne par DEMARRAGE du `candidate.mjs` ecrit a la
//     periode n de cette trajectoire (preuve que le notateur a execute CE commit).
//
// Variables (posees par la suite) :
//   BENCH_FAKE_CLAUDE_T76_INSTRUCTION — la consigne de methode du bras B, mot pour mot ;
//   BENCH_FAKE_CLAUDE_T76_STATE_DIR   — repertoire d'etat et de journaux de la suite.
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as nodePath from 'node:path';

const ICI = nodePath.dirname(fileURLToPath(import.meta.url));
export const CANDIDAT_REFERENCE = nodePath.resolve(ICI, '..', 'candidates', 'f-platform-reference-candidate.mjs');

export const CLAUSE_PRIVEE = 'P6.R2';
export const PERIODE_DE_PRIVATION = 9;
export const RANG_PRIVE = 2; // du bras A

/** Facteur de cout entier d'une session (bras, rang k, periode n). */
export function facteurDeCout(bras, k, n) {
  if (bras === 'B') return 30 + n + 7 * k * (1 + (n % 3));
  return 4 + 3 * n + 5 * k;
}

/** Comptes rendus par la session (tous proportionnels a f). */
export function comptes(f) {
  return {
    input_fresh: 1000 * f,
    output: 300 * f,
    cache_read: 5000 * f,
    cache_write: 200 * f,
    turns: f,
    duration_ms: 1500 * f,
    cost_usd: f / 1000,
  };
}

/** Nombre de tests `node:test` ecrits par le bras B, rang k, au ticket q (constant en q). */
export const testsParTicket = (k) => k + 1;

const nn = (n) => String(n).padStart(2, '0');

function periodeDuDepot(fs, path, cwd) {
  const dir = path.join(cwd, 'docs', 'tickets');
  let max = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^P(\d{2})\.md$/.exec(f);
      if (m !== null) max = Math.max(max, Number(m[1]));
    }
  } catch {
    /* aucun ticket : periode inconnue (0) */
  }
  return max;
}

function allouerRang(fs, path, etat, bras, cwd) {
  fs.mkdirSync(etat, { recursive: true });
  for (let k = 1; k < 1000; k += 1) {
    try {
      fs.writeFileSync(path.join(etat, `rang-${bras}-${k}`), cwd, { flag: 'wx' });
      return k;
    } catch (e) {
      if (!(e && e.code === 'EEXIST')) throw e;
    }
  }
  throw new Error('t76 : plus de rang disponible');
}

/* ─────────────────────────────────────────── bras A : un module qui grossit */

function blocNaturel(op) {
  return [
    `  if (op === '${op}') {`,
    '    let total = 0;',
    '    for (const item of args.items || []) {',
    "      if (item.kind === 'seat') { total += item.price * item.qty; }",
    "      else if (item.kind === 'group') { total += item.price * item.qty * 0.9; }",
    "      else if (item.kind === 'credit') { total -= item.amount; }",
    '      else { total += 0; }',
    '    }',
    '    if (total < 0) { total = 0; }',
    "    if (args.currency === 'EUR') { total = Math.round(total * 100) / 100; }",
    "    else if (args.currency === 'USD') { total = Math.round(total * 100) / 100; }",
    '    return { ok: true, total };',
    '  }',
  ];
}

function codeNaturel(k, n) {
  const lignes = ['// Application de reservation : tout est ici.', 'export function handle(op, args) {'];
  for (let q = 1; q <= n; q += 1) {
    lignes.push(...blocNaturel(`op_${nn(q)}`), ...blocNaturel(`op_${nn(q)}_bis`));
  }
  for (let j = 1; j <= k; j += 1) lignes.push(`  if (op === 'extra_${j}') { return { ok: false, extra: ${j} }; }`);
  lignes.push("  return { ok: false, error: 'UNKNOWN_OPERATION' };", '}', '');
  return { 'src/app.mjs': lignes.join('\n') };
}

/* ────────────────────── bras B : un module par ticket, tests d'abord (ATDD) */

function codeDiscipline(k, n) {
  const fichiers = {};
  for (let q = 1; q <= n; q += 1) {
    const t = `P${nn(q)}`;
    fichiers[`src/${t.toLowerCase()}.mjs`] = [
      `// Ticket ${t} : une regle, une responsabilite par fonction.`,
      `export function montant${t}(prix, quantite) {`,
      `  return prix * quantite + ${q};`,
      '}',
      '',
      `export function capaciteRestante${t}(capacite) {`,
      `  return capacite - ${q * 7};`,
      '}',
      '',
    ].join('\n');
    const tests = [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      `import { montant${t} } from '../src/${t.toLowerCase()}.mjs';`,
      '',
    ];
    for (let i = 1; i <= testsParTicket(k); i += 1) {
      tests.push(
        `test('${t} critere ${i} : ${i} place(s) a ${q + i}', () => {`,
        `  assert.equal(montant${t}(${q + i}, ${i}), ${(q + i) * i + q});`,
        '});',
        '',
      );
    }
    fichiers[`tests/${t.toLowerCase()}.test.mjs`] = tests.join('\n');
  }
  return fichiers;
}

/* ───────────────────────────────────────────────────────────── derivation */

export function deriver({ prompt, cwd, fs, path }) {
  const etat = process.env.BENCH_FAKE_CLAUDE_T76_STATE_DIR;
  const consigne = process.env.BENCH_FAKE_CLAUDE_T76_INSTRUCTION;
  if (etat === undefined || etat === '') throw new Error('t76 : BENCH_FAKE_CLAUDE_T76_STATE_DIR absente');
  const bras = typeof consigne === 'string' && consigne.length > 0 && prompt.includes(consigne) ? 'B' : 'A';

  const marque = path.join(cwd, '.bench-t76', 'trajectoire.json');
  let traj = null;
  try {
    traj = JSON.parse(fs.readFileSync(marque, 'utf8'));
  } catch {
    traj = null;
  }
  if (traj === null || typeof traj.rang !== 'number') {
    traj = { bras, rang: allouerRang(fs, path, etat, bras, cwd), sessions: 0 };
  }
  traj.sessions += 1;
  const k = traj.rang;
  const n = periodeDuDepot(fs, path, cwd);

  const fichiers = bras === 'B' ? codeDiscipline(k, n) : codeNaturel(k, n);
  for (const [rel, contenu] of Object.entries(fichiers)) {
    const cible = path.join(cwd, ...rel.split('/'));
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, contenu);
  }
  fs.mkdirSync(path.dirname(marque), { recursive: true });
  fs.writeFileSync(marque, `${JSON.stringify({ bras: traj.bras, rang: k, sessions: traj.sessions })}\n`);

  const privation = bras === 'A' && traj.bras === 'A' && k === RANG_PRIVE && n >= PERIODE_DE_PRIVATION ? CLAUSE_PRIVEE : '';
  const lancements = path.join(etat, 'lancements', `${bras}-${k}-P${nn(n)}.log`);
  fs.mkdirSync(path.dirname(lancements), { recursive: true });
  const content = [
    `// candidate.mjs — point d'entree bench.platform/1, ecrit par le faux \`claude\` (acceptance/T76.spec.ts).`,
    `// Bras ${bras}, trajectoire ${k}, ticket P${nn(n)}.`,
    "import { appendFileSync } from 'node:fs';",
    `appendFileSync(${JSON.stringify(lancements)}, \`\${process.pid} \${process.env.BENCH_DATA_DIR ?? ''}\\n\`);`,
    `process.env.BENCH_DROP_CLAUSE = ${JSON.stringify(privation)};`,
    "process.env.BENCH_FAULT_LOCK = '';",
    "process.env.BENCH_TRAFFIC_LOG = '';",
    `await import(${JSON.stringify(pathToFileURL(CANDIDAT_REFERENCE).href)});`,
    '',
  ].join('\n');

  const f = facteurDeCout(bras, k, n);
  const c = comptes(f);
  const testsEcrits = bras === 'B' ? n * testsParTicket(k) : 0;
  const stdout = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: `bench-fake-t76-${bras}-${k}-P${nn(n)}`,
    num_turns: c.turns,
    duration_ms: c.duration_ms,
    duration_api_ms: c.duration_ms,
    total_cost_usd: c.cost_usd,
    usage: {
      input_tokens: c.input_fresh,
      output_tokens: c.output,
      cache_creation_input_tokens: c.cache_write,
      cache_read_input_tokens: c.cache_read,
    },
    modelUsage: {
      'bench-fake-claude-cli-model-a': {
        inputTokens: c.input_fresh,
        outputTokens: c.output,
        cacheReadInputTokens: c.cache_read,
        cacheCreationInputTokens: c.cache_write,
        costUSD: c.cost_usd,
      },
    },
  });

  const params = {
    bras,
    bras_de_la_trajectoire: traj.bras,
    rang: k,
    periode: n,
    session_de_la_trajectoire: traj.sessions,
    f,
    comptes: c,
    tests_ecrits: testsEcrits,
    privation,
    fichiers: Object.keys(fichiers).sort(),
  };
  const journal = path.join(etat, 'sessions', `${bras}-${k}-P${nn(n)}-${process.pid}-${randomBytes(4).toString('hex')}.json`);
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  fs.writeFileSync(journal, JSON.stringify({ prompt, cwd, ...params }));

  return { relPath: 'candidate.mjs', content, params, stdout };
}
