// acceptance/fixtures/claude-cli/t55-derive-reference-candidate.mjs — zone ACCEPTANCE.
//
// GENERATEUR DU CANDIDAT DE REFERENCE DE T55.A3, DERIVE DU SEUL PROMPT RECU.
//
// ADR-012:L48, T55.A3 : « avec un candidat de reference conforme au SEUL
// prompt recu, chaque controle du est satisfait a chaque periode ». Un
// candidat FIXE a l'avance (reservation-candidate-v2.mjs, T51) ne prouve
// PAS cela : son code ne depend pas du prompt, donc retirer le vocabulaire
// du prompt reel (perturbation prescrite par cases.extensions.lock.json#
// T55.A3) le laisserait vert — cas creux, mesure par la porte GATES.
//
// Ce module est appele par le faux `claude` (acceptance/fixtures/claude-cli/
// bin/claude, variable BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE) avec le
// texte EXACT du prompt que la session a recu (l'argument d'argv qui suit
// `-p`, convention FIXEE par acceptance/T49.spec.ts II.4). Il en EXTRAIT,
// role par role, chaque valeur que les controles comparent ou que la logique
// metier parametre, puis ecrit un `candidate.mjs` dont le SQUELETTE metier
// (bench.candidate/2, file FIFO par admission_seq, idempotence par cle
// d'operation, isolation par premier locataire) est fixe, mais dont CHAQUE
// litteral de reponse (statuts, codes d'erreur) et CHAQUE parametre (debut du
// creneau, delai, frontiere, capacite) vient du prompt.
//
// REGLES (non negociables, c'est tout l'objet du fichier) :
//   1. AUCUN litteral de vocabulaire du domaine n'apparait dans CE fichier ni
//      dans le squelette qu'il emet : chaque valeur est CAPTUREE dans le
//      prompt par un motif de CONTEXTE (la phrase qui l'introduit), jamais
//      cherchee par sa propre valeur. acceptance/T55.spec.ts (A3) le verifie
//      sur le source emis : tout jeton de vocabulaire present dans le
//      candidat doit figurer dans le prompt de sa periode.
//   2. Valeur introuvable dans le prompt -> JAMAIS inventee : un marqueur
//      `<absent-du-prompt:ROLE>` prend sa place, de sorte que le candidat
//      repond une valeur qu'aucun controle n'attend et ECHOUE.
//   3. Regle non enoncee par le prompt -> NON appliquee (le prompt de P1/P2
//      dit lui-meme « aucune regle d'annulation et aucune isolation entre
//      locataires ne sont encore enoncees ») : pas de frontiere d'annulation
//      sans frontiere extraite, pas d'isolation sans code de refus extrait.
//   4. SEULE exception, documentee : la CAPACITE du creneau. Le prompt de P2
//      la designe (« au-dela de la capacite du creneau », « en plus des
//      regles de P1 ») sans la redonner ; une vraie session la retrouve dans
//      SON PROPRE code de la periode precedente, present dans son repertoire
//      de travail (chaine commit-k -> session-k+1, T52). Ce generateur fait
//      exactement cela : il relit les PARAMS du `candidate.mjs` deja present
//      dans le cwd, pour la capacite SEULEMENT (un nombre, jamais un terme de
//      vocabulaire), et trace cette provenance (`heritee-du-depot`).
//
// Les motifs ci-dessous sont lies a la FORMULATION de l'enonce de T53 (DEJA
// ACCEPTE). Une reformulation de cet enonce ferait echouer l'extraction : le
// candidat porterait alors un marqueur et A3 ROUGIRAIT — faux rouge possible,
// jamais faux vert. C'est la direction d'erreur voulue.

const MARQUEUR_PARAMS = '/*__PARAMS_DERIVES_DU_PROMPT__*/';

const ISO = '(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z)';
const BAS = '([a-z][a-z0-9_]*)';
const CODE = '([A-Z][A-Z0-9_]*)';

/** role -> motifs de CONTEXTE (premier qui capture gagne). Jamais la valeur elle-meme. */
const MOTIFS = {
  statut_tenu: [
    new RegExp(`statut parmi ${BAS} ou ${BAS}`, 'u'),
    new RegExp(`devient ${BAS} dès qu`, 'u'),
    new RegExp(`file d'attente ${BAS}/${BAS}/${BAS}`, 'u'),
  ],
  statut_attente: [
    new RegExp(`reçoit le statut ${BAS}`, 'u'),
    { re: new RegExp(`file d'attente ${BAS}/${BAS}/${BAS}`, 'u'), groupe: 2 },
  ],
  statut_annule: [
    { re: new RegExp(`statut parmi ${BAS} ou ${BAS}`, 'u'), groupe: 2 },
    new RegExp(`annulée porte le statut ${BAS}`, 'u'),
    { re: new RegExp(`file d'attente ${BAS}/${BAS}/${BAS}`, 'u'), groupe: 3 },
  ],
  code_conflit: [
    new RegExp(`arguments différents renvoie ${CODE}`, 'u'),
    new RegExp(`\\(${CODE} si les arguments diffèrent\\)`, 'u'),
  ],
  code_trop_tard: [
    new RegExp(`trop tardive renvoie ${CODE}`, 'u'),
    { re: new RegExp(`frontière incluse à ${ISO}, sinon ${CODE}`, 'u'), groupe: 2 },
  ],
  code_sans_effet_actif: [new RegExp(`plus d'effet actif renvoie ${CODE}`, 'u')],
  code_autre_locataire: [new RegExp(`renvoie le verdict ${CODE}`, 'u')],
  creneau_id: [new RegExp(`créneau ([A-Z][A-Za-z0-9_-]*) \\(début`, 'u'), new RegExp(`créneau ([A-Z][A-Za-z0-9_-]*), début`, 'u')],
  creneau_debut: [new RegExp(`début ${ISO}`, 'u')],
  delai_heures: [new RegExp(`(\\d+) heures avant le début`, 'u')],
  frontiere: [new RegExp(`exactement à ${ISO}`, 'u'), new RegExp(`frontière incluse à ${ISO}`, 'u')],
  capacite: [new RegExp(`capacité de (\\d+)`, 'u')],
};

/** Groupe 1 par defaut ; `groupe` explicite pour les motifs a plusieurs captures. */
function capturer(texte, motifs) {
  for (const m of motifs) {
    const re = m instanceof RegExp ? m : m.re;
    const g = m instanceof RegExp ? 1 : m.groupe;
    const r = re.exec(texte);
    if (r === null) continue;
    const v = r[g];
    if (typeof v === 'string' && v.length > 0) return { valeur: v, extrait: r[0] };
  }
  return null;
}

/** La section ENONCE du prompt (le reste — contrat, transport, exigences JSON — n'en fait pas partie). */
function sectionEnonce(prompt) {
  const t = prompt.replace(/\s+/g, ' ');
  const i = t.search(/Enonc[eé] des exigences/u);
  if (i < 0) return t;
  const apres = t.slice(i);
  const j = apres.search(/Exigences r[eé]v[eé]l[eé]es/u);
  return j < 0 ? apres : apres.slice(0, j);
}

function absent(role) {
  return `<absent-du-prompt:${role}>`;
}

function paramsHerites(fs, path, cwd) {
  try {
    const src = fs.readFileSync(path.join(cwd, 'candidate.mjs'), 'utf8');
    const i = src.indexOf(MARQUEUR_PARAMS);
    if (i < 0) return null;
    const debut = src.indexOf('{', i);
    const fin = src.indexOf('\n', debut);
    return JSON.parse(src.slice(debut, fin).replace(/;\s*$/, ''));
  } catch {
    return null;
  }
}

/**
 * @param {{prompt: string, cwd: string, fs: typeof import('node:fs'), path: typeof import('node:path')}} entree
 * @returns {{relPath: string, content: string, params: object}}
 */
export function deriver({ prompt, cwd, fs, path }) {
  const texte = sectionEnonce(typeof prompt === 'string' ? prompt : '');
  const provenance = {};
  const v = {};
  for (const role of Object.keys(MOTIFS)) {
    const c = capturer(texte, MOTIFS[role]);
    if (c !== null) {
      v[role] = c.valeur;
      provenance[role] = { source: 'prompt', extrait: c.extrait };
    }
  }

  // Exception 4 (en-tete) : la capacite, et elle seule, peut venir du depot de la session.
  if (v.capacite === undefined) {
    const h = paramsHerites(fs, path, cwd);
    if (h !== null && Number.isInteger(h.capacite)) {
      v.capacite = String(h.capacite);
      provenance.capacite = { source: 'heritee-du-depot', depuis: 'candidate.mjs de la periode precedente' };
    }
  }

  // Frontiere : explicite si le prompt la donne, sinon CALCULEE depuis le debut et le delai
  // s'ils sont TOUS DEUX dans le prompt ; jamais supposee.
  let frontiere = v.frontiere ?? null;
  if (frontiere === null && v.creneau_debut !== undefined && v.delai_heures !== undefined) {
    frontiere = new Date(Date.parse(v.creneau_debut) - Number(v.delai_heures) * 3_600_000).toISOString().replace('.000Z', 'Z');
    provenance.frontiere = { source: 'calculee', depuis: ['creneau_debut', 'delai_heures'] };
  }

  const params = {
    statut: {
      tenu: v.statut_tenu ?? absent('statut_tenu'),
      // Regle de file NON enoncee -> null : le candidat n'ouvre AUCUNE file (et repond un
      // marqueur au-dela de la capacite), conforme a « aucune file d'attente » (P1).
      attente: v.statut_attente ?? null,
      annule: v.statut_annule ?? absent('statut_annule'),
    },
    code: {
      conflit: v.code_conflit ?? absent('code_conflit'),
      trop_tard: v.code_trop_tard ?? absent('code_trop_tard'),
      sans_effet_actif: v.code_sans_effet_actif ?? absent('code_sans_effet_actif'),
      // null -> isolation NON appliquee (« aucune isolation entre locataires » avant P4).
      autre_locataire: v.code_autre_locataire ?? null,
      hors_depassement: absent('statut_au_dela_de_la_capacite'),
    },
    creneau: { id: v.creneau_id ?? absent('creneau_id'), debut: v.creneau_debut ?? absent('creneau_debut') },
    capacite: v.capacite !== undefined ? Number(v.capacite) : absent('capacite'),
    // null -> aucune regle d'annulation (P1/P2). Frontiere incluse si le prompt le dit.
    frontiere,
    frontiere_incluse: /frontière incluse/u.test(texte),
    _provenance: provenance,
  };

  return { relPath: 'candidate.mjs', content: squelette(params), params };
}

/** Le squelette bench.candidate/2. AUCUN terme de vocabulaire du domaine : tout passe par P. */
function squelette(params) {
  return `#!/usr/bin/env node
// candidate.mjs — candidat de reference de T55.A3, DERIVE du prompt recu par cette session
// (acceptance/fixtures/claude-cli/t55-derive-reference-candidate.mjs). Chaque valeur de
// reponse et chaque parametre metier viennent de P ci-dessous, extrait du prompt.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const P = ${MARQUEUR_PARAMS} ${JSON.stringify(params)};

const ETAT = './state.json';
const vierge = () => ({ proprietaire: null, horloge: null, tenus: [], file: [], annules: [], vus: {} });
let e = vierge();
if (existsSync(ETAT)) { try { e = { ...vierge(), ...JSON.parse(readFileSync(ETAT, 'utf8')) }; } catch { e = vierge(); } }
const sauver = () => writeFileSync(ETAT, JSON.stringify(e));

const canon = (x) => Array.isArray(x) ? x.map(canon) : x !== null && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;

const sortie = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
sortie({ ready: true });

const isole = typeof P.code.autre_locataire === 'string';
const autorise = (t) => !isole || (e.proprietaire !== null && t === e.proprietaire);
const tropTard = () => typeof P.frontiere === 'string' && e.horloge !== null &&
  (P.frontiere_incluse ? Date.parse(e.horloge) > Date.parse(P.frontiere) : Date.parse(e.horloge) >= Date.parse(P.frontiere));
const trierFile = () => e.file.sort((a, b) => a.admission_seq - b.admission_seq);

function evaluerAnnulation(acteur) {
  if (!e.tenus.includes(acteur)) return { erreur: P.code.sans_effet_actif };
  if (tropTard()) return { erreur: P.code.trop_tard };
  return { ok: true };
}

function ecrire(a) {
  const { op, actor, admission_seq } = a;
  if (op === 'reserve') {
    if (e.tenus.includes(actor)) return { decision: P.statut.tenu };
    if (e.file.some((q) => q.actor === actor)) return { decision: P.statut.attente };
    if (typeof P.capacite === 'number' && e.tenus.length < P.capacite) { e.tenus.push(actor); return { decision: P.statut.tenu }; }
    if (typeof P.statut.attente !== 'string') return { decision: P.code.hors_depassement };
    e.file.push({ actor, admission_seq }); trierFile();
    return { decision: P.statut.attente };
  }
  if (op === 'cancel') {
    const r = evaluerAnnulation(actor);
    if (r.erreur !== undefined) return r;
    e.tenus = e.tenus.filter((x) => x !== actor);
    e.annules.push(actor);
    trierFile();
    while (typeof P.capacite === 'number' && e.tenus.length < P.capacite && e.file.length > 0) e.tenus.push(e.file.shift().actor);
    return { decision: P.statut.annule };
  }
  return { erreur: 'UNSUPPORTED_WRITE_OP' };
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (ligne) => {
  let req; try { req = JSON.parse(ligne); } catch { return; }
  const { id, op } = req; const args = req.args ?? {};
  const ok = (result) => sortie({ id, ok: true, result });
  const ko = (code) => sortie({ id, ok: false, error: { code, message: String(code) } });
  switch (op) {
    case 'create_tenant': if (e.proprietaire === null) e.proprietaire = args.tenant_id; sauver(); ok({}); break;
    case 'advance_clock': e.horloge = args.to; sauver(); ok({}); break;
    case 'write': {
      const { operation_key, ...reste } = args;
      const empreinte = JSON.stringify(canon(reste));
      if (operation_key !== undefined && e.vus[operation_key] !== undefined) {
        const deja = e.vus[operation_key];
        if (deja.empreinte !== empreinte) { ko(P.code.conflit); break; }
        if (deja.erreur !== undefined) ko(deja.erreur); else ok({ decision: deja.decision });
        break;
      }
      if (!autorise(args.tenant_id)) { ko(P.code.autre_locataire); break; }
      const r = ecrire(args);
      if (operation_key !== undefined) e.vus[operation_key] = { empreinte, ...r };
      sauver();
      if (r.erreur !== undefined) ko(r.erreur); else ok({ decision: r.decision });
      break;
    }
    case 'read': {
      if (!autorise(args.tenant_id)) { ko(P.code.autre_locataire); break; }
      const k = args.key; let value = null;
      if (e.tenus.includes(k)) value = { status: P.statut.tenu };
      else if (e.file.some((q) => q.actor === k)) value = { status: P.statut.attente, waiting_position: e.file.findIndex((q) => q.actor === k) + 1 };
      else if (e.annules.includes(k)) value = { status: P.statut.annule };
      ok({ value }); break;
    }
    case 'probe_cancel': {
      if (!autorise(args.tenant_id)) { ko(P.code.autre_locataire); break; }
      const r = evaluerAnnulation(args.key);
      ok({ decision: r.erreur !== undefined ? r.erreur : P.statut.annule }); break;
    }
    case 'fingerprint':
      ok({ sha256: createHash('sha256').update(JSON.stringify(canon({ p: e.proprietaire, t: e.tenus, f: e.file, a: e.annules })), 'utf8').digest('hex') });
      break;
    default: ko('UNSUPPORTED_OPERATION');
  }
});
rl.on('close', () => process.exit(0));
`;
}
