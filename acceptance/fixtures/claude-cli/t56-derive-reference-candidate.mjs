// acceptance/fixtures/claude-cli/t56-derive-reference-candidate.mjs — zone ACCEPTANCE.
//
// GENERATEUR DU CANDIDAT DE REFERENCE DE T56.A4, DERIVE DU SEUL PROMPT RECU —
// ET, NOUVEAU PAR RAPPORT A T55 (acceptance/fixtures/claude-cli/
// t55-derive-reference-candidate.mjs, dont ce fichier REPREND la partie
// « valeurs metier » SANS LA MODIFIER), DERIVANT AUSSI SES NOMS DE CHAMPS DE
// PROTOCOLE depuis le prompt, jamais codes en dur.
//
// ADR-013, « Ce que le troisieme essai reel a montre » : un candidat qui tire
// ses VALEURS du prompt (T55.A3) mais code ses NOMS DE CHAMPS en dur
// (`decision`, `operation_key`) echoue silencieusement si l'enonce emploie un
// AUTRE vocabulaire (« statut », « idempotency_key ») — « les deux textes du
// prompt se contredisent [...] T55.A3 ne pouvait pas le voir ». ADR-013,
// Decision, troisieme alinea : « Un candidat de reference qui tire AUSSI ses
// noms de champs du prompt. » C'est EXACTEMENT ce que ce module ajoute.
//
// DEUX NOMS DE CHAMPS DE PROTOCOLE SONT EN JEU (les deux seuls que l'incident
// reel d'ADR-013 nomme) :
//
//   - `decisionField` — le nom que le candidat donne, dans sa REPONSE a
//     `write`/`probe_cancel`, au champ qui porte la decision. Contrat :
//     `decision` (acceptance/T50.spec.ts, III). DERIVE ICI en cherchant, dans
//     le prompt ENTIER (enonce ET exemples — peu importe OU la bonne/mauvaise
//     forme apparait), le nom de champ qui precede IMMEDIATEMENT une valeur
//     de decision CONNUE. Cette valeur connue n'est JAMAIS hypothesee a
//     l'avance par ce module : elle est la valeur `statut_tenu`/
//     `statut_attente`/`statut_annule` que ce meme module vient d'EXTRAIRE de
//     l'enonce, par CONTEXTE, en section I ci-dessous (mecanisme DEJA ACCEPTE
//     pour T55, jamais re-invente ici) — jamais une liste de litteraux fixee
//     a l'avance dans ce fichier. C'est la SEULE facon de rester sensible a
//     une mutation qui ne renommerait le champ que dans la PROSE de l'enonce
//     (perturbation EXACTE de cases.extensions.lock.json#T56.A4 : « renommer
//     decision en status DANS L'ENONCE SEULEMENT ») : une extraction qui ne
//     lirait que le bloc JSON d'exemple (A2) resterait aveugle a CETTE
//     mutation precise, puisque A2 exige que l'exemple, lui, reste conforme
//     au contrat — c'est l'ENONCE, pas l'exemple, que la perturbation vise.
//
//   - `operationKeyField` — le nom que le MOTEUR REEL emploie, dans SA
//     REQUETE `write`, pour la cle d'idempotence. Contrat : `operation_key`.
//     DERIVE ICI depuis le bloc JSON d'exemple de `write` (A2) : les QUATRE
//     AUTRES noms d'argument (`op`, `actor`, `tenant_id`, `admission_seq`) ne
//     sont PAS en cause dans l'incident reel et servent d'ANCRES — le
//     cinquieme nom, QUEL QU'IL SOIT, est `operationKeyField`. Ce champ n'est
//     JAMAIS invente par devinette lexicale (« contient key ») : seule la
//     POSITION (le seul argument restant d'un ensemble de cinq) le designe —
//     la discipline qu'ADR-001 nomme aveuglement PROCEDURAL : deriver un role
//     par son CONTEXTE, jamais par sa propre valeur attendue.
//
// Valeur ou nom INTROUVABLE dans le prompt -> JAMAIS invente : un marqueur
// `<absent-du-prompt:ROLE>` prend sa place (meme regle que T55). Un candidat
// qui repond ou qui NOMME un champ par ce marqueur echoue tout controle qui
// l'observe — c'est la direction d'erreur voulue (faux rouge possible,
// jamais faux vert).
//
// Appele par le faux `claude` (acceptance/fixtures/claude-cli/bin/claude,
// variable BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE, mecanisme ADDITIF FIXE
// par acceptance/T55.spec.ts, A3 — AUCUNE modification de ce fixture par ce
// module : `deriver` reste SYNCHRONE, exactement la forme que ce fixture
// appelle sans l'attendre) et, pour le scenario NEGATIF de T56.A4 (prompt qui
// nomme `decision` autrement que le contrat), importe et appele DIRECTEMENT
// par acceptance/T56.spec.ts avec un texte de prompt CONSTRUIT par cette
// suite (jamais une invocation reelle de session pour cette branche).

const MARQUEUR_PARAMS = '/*__T56_PARAMS_DERIVES_DU_PROMPT__*/';

/* ───────────────────────── I. valeurs metier — REPRIS A L'IDENTIQUE de
 * acceptance/fixtures/claude-cli/t55-derive-reference-candidate.mjs (DEJA
 * ACCEPTE pour T55, jamais re-derive ici). Seule la section II (noms de
 * champs de protocole) est nouvelle. */

const ISO = '(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z)';
const BAS = '([a-z][a-z0-9_]*)';
const CODE = '([A-Z][A-Z0-9_]*)';

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

/* ───────────────────────── II. noms de champs de protocole — NOUVEAU PAR CE
 * MODULE (T56). Jamais code en dur : chaque nom est LU dans le prompt, par
 * CONTEXTE (position ou valeur voisine), jamais devine par sa propre
 * identite attendue. */

/** Segments `{...}` equilibres (bornes a la premiere fermeture qui ramene la
 *  profondeur a zero) — suffisant pour les enveloppes de messages (primitifs
 *  seulement sous `args`/`result`, jamais de tableau ni d'objet imbrique). */
function segmentsAccolades(texte) {
  const out = [];
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

function clesDe(fragment) {
  const out = [];
  const re = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g;
  let m;
  while ((m = re.exec(fragment)) !== null) out.push(m[1]);
  return out;
}

function sousObjet(enveloppe, nomChamp) {
  const re = new RegExp(`"${nomChamp}"\\s*:\\s*(\\{[^{}]*\\})`, 'u');
  const m = re.exec(enveloppe);
  return m !== null ? m[1] : null;
}

/** `operationKeyField` — le CINQUIEME nom d'argument de l'exemple `write`
 *  (A2), les quatre autres (`op`,`actor`,`tenant_id`,`admission_seq`) servant
 *  d'ANCRES jamais mises en cause. Position, jamais lexique : voir en-tete. */
export function extraireOperationKeyField(promptBrut) {
  const texte = typeof promptBrut === 'string' ? promptBrut : '';
  const ANCRES = ['op', 'actor', 'tenant_id', 'admission_seq'];
  for (const enveloppe of segmentsAccolades(texte)) {
    if (!/"op"\s*:\s*"write"/u.test(enveloppe.texte)) continue;
    const argsTexte = sousObjet(enveloppe.texte, 'args');
    if (argsTexte === null) continue;
    const cles = clesDe(argsTexte);
    if (!ANCRES.every((a) => cles.includes(a))) continue;
    const reste = cles.filter((c) => !ANCRES.includes(c));
    if (reste.length === 1) return { valeur: reste[0], extrait: enveloppe.texte };
  }
  return null;
}

/** `decisionField` — le nom de champ qui precede IMMEDIATEMENT, N'IMPORTE OU
 *  dans le prompt (enonce OU exemple), la PREMIERE occurrence d'une valeur de
 *  `valeursConnues` (les valeurs de decision que la section I vient
 *  d'extraire de l'enonce par CONTEXTE — jamais une liste hypothesee ici).
 *  PREMIERE occurrence dans le texte : si l'enonce (qui precede les exemples,
 *  convention `sectionEnonce` ci-dessus, DEJA ETABLIE par T53/T55) nomme le
 *  champ autrement que l'exemple, c'est CETTE occurrence-la qui gagne —
 *  exactement la sensibilite que cases.extensions.lock.json#T56.A4 exige. */
export function extraireDecisionField(promptBrut, valeursConnues) {
  const texte = typeof promptBrut === 'string' ? promptBrut : '';
  const valeurs = (Array.isArray(valeursConnues) ? valeursConnues : []).filter((v) => typeof v === 'string' && v.length > 0);
  if (valeurs.length === 0) return null;
  const alt = [...new Set(valeurs)].map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`["'\`]?([A-Za-z_][A-Za-z0-9_]*)["'\`]?\\s*[:=]\\s*["'\`](${alt})["'\`]`, 'u');
  const m = re.exec(texte);
  return m !== null ? { valeur: m[1], extrait: m[0] } : null;
}

/* ─────────────────────────────────────────────────────────── derivation */

/**
 * @param {{prompt: string, cwd: string, fs: typeof import('node:fs'), path: typeof import('node:path')}} entree
 * @returns {{relPath: string, content: string, params: object}}
 */
export function deriver({ prompt, cwd, fs, path }) {
  const promptBrut = typeof prompt === 'string' ? prompt : '';
  const texte = sectionEnonce(promptBrut);

  // I — valeurs metier, D'ABORD : extraites UNIQUEMENT de la section ENONCE,
  // par CONTEXTE (jamais par leur propre valeur) — mecanisme REPRIS de T55.
  const provenance = {};
  const v = {};
  for (const role of Object.keys(MOTIFS)) {
    const c = capturer(texte, MOTIFS[role]);
    if (c !== null) {
      v[role] = c.valeur;
      provenance[role] = { source: 'prompt', extrait: c.extrait };
    }
  }

  if (v.capacite === undefined) {
    const h = paramsHerites(fs, path, cwd);
    if (h !== null && Number.isInteger(h.capacite)) {
      v.capacite = String(h.capacite);
      provenance.capacite = { source: 'heritee-du-depot', depuis: 'candidate.mjs de la periode precedente' };
    }
  }

  let frontiere = v.frontiere ?? null;
  if (frontiere === null && v.creneau_debut !== undefined && v.delai_heures !== undefined) {
    frontiere = new Date(Date.parse(v.creneau_debut) - Number(v.delai_heures) * 3_600_000).toISOString().replace('.000Z', 'Z');
    provenance.frontiere = { source: 'calculee', depuis: ['creneau_debut', 'delai_heures'] };
  }

  // II — noms de champs de protocole : la valeur `statut_*` CAPTUREE ci-dessus
  // (jamais une liste fixee a l'avance) sert de BALISE pour retrouver, dans
  // le prompt ENTIER, le nom du champ qui la porte.
  const valeursDeDecisionConnues = [v.statut_tenu, v.statut_attente, v.statut_annule].filter((x) => typeof x === 'string');
  const dOperationKey = extraireOperationKeyField(promptBrut);
  const dDecision = extraireDecisionField(promptBrut, valeursDeDecisionConnues);
  const operationKeyField = dOperationKey !== null ? dOperationKey.valeur : absent('operation_key_field');
  const decisionField = dDecision !== null ? dDecision.valeur : absent('decision_field');
  provenance.operationKeyField = dOperationKey !== null ? { source: 'exemple-write(A2)', extrait: dOperationKey.extrait } : { source: 'absent' };
  provenance.decisionField = dDecision !== null ? { source: 'cle-avant-valeur-de-decision-connue', extrait: dDecision.extrait } : { source: 'absent' };

  const params = {
    operationKeyField,
    decisionField,
    statut: {
      tenu: v.statut_tenu ?? absent('statut_tenu'),
      // Regle de file NON enoncee -> null : le candidat n'ouvre AUCUNE file
      // (et repond un marqueur au-dela de la capacite), conforme a « aucune
      // file d'attente » (P1).
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

/** Le squelette bench.candidate/2 — AUCUN nom de champ de protocole en dur
 *  pour « operation_key »/« decision » : tout passe par `P.operationKeyField`/
 *  `P.decisionField`, calcules en II ci-dessus. Les autres noms (`op`,
 *  `actor`, `tenant_id`, `admission_seq`, `value`, `sha256`, `id`, `ok`,
 *  `result`, `error`, `args`) restent FIXES : l'incident reel d'ADR-013 ne
 *  les met pas en cause, et packages/contracts (hors de portee de ce
 *  module, jamais lu par lui) n'en negocie aucun par le prompt. */
function squelette(params) {
  return `#!/usr/bin/env node
// candidate.mjs — candidat de reference de T56.A4, DERIVE du prompt recu par
// cette session (acceptance/fixtures/claude-cli/t56-derive-reference-candidate.mjs).
// Noms de champs de protocole ET valeurs metier viennent tous deux de P ci-dessous.
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
      const operationKey = args[P.operationKeyField];
      const reste = { ...args };
      delete reste[P.operationKeyField];
      const empreinte = JSON.stringify(canon(reste));
      if (operationKey !== undefined && e.vus[operationKey] !== undefined) {
        const deja = e.vus[operationKey];
        if (deja.empreinte !== empreinte) { ko(P.code.conflit); break; }
        if (deja.erreur !== undefined) ko(deja.erreur); else ok({ [P.decisionField]: deja.decision });
        break;
      }
      if (!autorise(args.tenant_id)) { ko(P.code.autre_locataire); break; }
      const r = ecrire(args);
      if (operationKey !== undefined) e.vus[operationKey] = { empreinte, ...r };
      sauver();
      if (r.erreur !== undefined) ko(r.erreur); else ok({ [P.decisionField]: r.decision });
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
      ok({ [P.decisionField]: r.erreur !== undefined ? r.erreur : P.statut.annule }); break;
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
