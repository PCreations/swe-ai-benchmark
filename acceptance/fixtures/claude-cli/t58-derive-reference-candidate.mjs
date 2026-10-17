// acceptance/fixtures/claude-cli/t58-derive-reference-candidate.mjs — zone ACCEPTANCE.
//
// GENERATEUR DU CANDIDAT DE REFERENCE DE T58.A4, DERIVE DU SEUL PROMPT RECU —
// ET, NOUVEAU PAR RAPPORT A T57 (acceptance/fixtures/claude-cli/
// t57-derive-reference-candidate.mjs, dont ce module IMPORTE ET REUTILISE
// `deriver` SANS MODIFICATION pour tout ce qui n'est pas en cause ici :
// `operationKeyField`, `decisionField`, les valeurs metier `statut.*`/`code.*`/
// `creneau`/`capacite`/`frontiere`, la forme imbriquee de `read`
// (`lecture.statusField`/`lecture.positionField`) — DERIVANT EN OUTRE SI LA
// REGLE D'ISOLATION INTER-LOCATAIRE DOIT ETRE RENDUE COMME UNE REPONSE
// D'ERREUR (`{"ok":false,"error":{...}}`) OU COMME UNE DECISION ORDINAIRE
// (`{"ok":true,"result":{"<decisionField>":...}}`) :
//
//   ADR-015, « Ce que le second pilote reel a montre » : « isolation@1 n'est
//   pas attribuable. Le controle attend [...] une REPONSE D'ERREUR
//   {"id","ok":false,"error":{"code":"NOT_FOUND",...}}. Aucun exemple public
//   ne montre une reponse d'erreur ; l'enonce de P4 dit que toute tentative
//   "renvoie le verdict NOT_FOUND". Sonnet a repondu {"decision":"NOT_FOUND"}
//   — une lecture raisonnable du mot "verdict". » Decision : « Chaque
//   reponse d'erreur [...] a un exemple public de cette forme exacte. »
//
// t56-derive-reference-candidate.mjs ET t57-derive-reference-candidate.mjs
// traitent DEJA l'isolation comme une erreur INCONDITIONNELLEMENT (leur
// `ko(P.code.autre_locataire)` est appele sans jamais regarder si le prompt
// MONTRE effectivement cette forme) : reutiliser leur squelette TEL QUEL
// rendrait T58.A4 creux — isolation@1 serait satisfait MEME si le prompt ne
// montrait jamais d'exemple d'erreur, exactement la lacune que ADR-015
// documente, puisque le candidat connaitrait deja, par construction du
// generateur (jamais du prompt), qu'il faut emettre `ok:false`. Ce module
// ecrit donc SON PROPRE squelette, identique a celui de t57 pour toute
// operation AUTRE que le branchement d'isolation (copie verbatim, jamais
// reinventee), et REMPLACE CE SEUL BRANCHEMENT par une version dont le choix
// ok:false/ok:true provient de `exempleErreurPourOperation` ci-dessous, PAR OPERATION — jamais
// deduit du lexique de l'enonce (ADR-001 : derivation PAR FORME, jamais par
// mot).
//
// exempleErreurPourOperation : INSPECTE LA FORME, PAR OPERATION, jamais la valeur ni le lexique
// ('verdict'/'erreur' n'est cherche nulle part, et la valeur du code non plus
// — voir acceptance/T58.spec.ts, formeDe : chaque exemple existant du
// protocole emploie deja des valeurs-gabarit, jamais la valeur metier reelle,
// et exiger celle-ci dans l'exemple d'erreur serait une exigence qu'aucune
// source n'etablit). Le mecanisme cherche, n'importe ou dans le prompt
// (enonce ET exemples), un exemple requete→reponse de L'OPERATION en cause
// dont la reponse, LIEE par `id` a sa requete (`pairesExemples`, jamais une
// fenetre de proximite textuelle), est de la forme `{"ok":false,"error":
// {"code":...}}` sans `result`. AUCUNE forme de ce type dans le prompt (l'etat actuel, avant
// implementation de T58) -> le candidat retombe sur
// `ok({[decisionField]: ANCHOR_NOT_FOUND})` — REPRODUCTION DELIBEREE de
// l'incident reel (Sonnet traitant NOT_FOUND comme une decision), jamais une
// invention : c'est exactement la chaine causale qu'isolation@1 doit alors
// voir echouer.
//
// isolationEnoncee : VRAI si l'ancrage ANCHOR_NOT_FOUND figure QUELQUE PART
// dans le prompt (enonce ou exemples) — jamais conditionne par le mot
// 'verdict' (qui disparait precisement par cette tache). Si l'ancrage est
// absent (periodes P1-P3, « aucune isolation enoncee a cette periode »),
// aucun controle d'isolation n'est applique, comme avant.
//
// Appele par le faux `claude` (acceptance/fixtures/claude-cli/bin/claude,
// variable BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE, mecanisme ADDITIF FIXE
// par acceptance/T55.spec.ts, A3 — AUCUNE modification de ce fixture) par
// acceptance/T58.spec.ts (A4).
//
// COMPATIBILITE D'HERITAGE DE LA CAPACITE ENTRE PERIODES : comme t57 le fait
// pour t56, ce module ecrit SON PROPRE candidate.mjs (jamais celui de t57) et
// EMBARQUE EN PLUS, dans de simples COMMENTAIRES jamais executes, les MEMES
// marqueurs `/*__T57_PARAMS_DERIVES_DU_PROMPT__*/` et
// `/*__T56_PARAMS_DERIVES_DU_PROMPT__*/` portant les MEMES params — pour que
// l'heritage de `capacite` entre periodes, deja etabli et ACCEPTE par T56,
// continue de fonctionner SANS MODIFICATION de t56-derive-reference-
// candidate.mjs NI de t57-derive-reference-candidate.mjs.

import { deriver as deriverBase } from './t57-derive-reference-candidate.mjs';

const MARQUEUR_PARAMS_T58 = '/*__T58_PARAMS_DERIVES_DU_PROMPT__*/';
const MARQUEUR_PARAMS_T57_COMPAT = '/*__T57_PARAMS_DERIVES_DU_PROMPT__*/'; // voir en-tete, § compatibilite
const MARQUEUR_PARAMS_T56_COMPAT = '/*__T56_PARAMS_DERIVES_DU_PROMPT__*/'; // voir en-tete, § compatibilite

/** Ancrage GELE, repris A L'IDENTIQUE de acceptance/T53.spec.ts (L535) :
 *  acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant
 *  (cahier_line 123) — jamais une invention de ce module. */
const ANCHOR_NOT_FOUND = 'NOT_FOUND';

/** Segments `{...}` equilibres — IDENTIQUE a celui de t56/t57-derive-
 *  reference-candidate.mjs (dupliquee ici, ces fichiers n'exportant pas la
 *  leur). */
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

/** Enveloppes JSON VALIDES parmi les segments `{...}` equilibres — lecture
 *  JSON DIRECTE, jamais une extraction de cles par regex (necessaire pour
 *  distinguer une enveloppe d'erreur reelle d'une simple mention textuelle). */
function enveloppesJSON(texte) {
  return segmentsAccolades(texte).map((s) => {
    let valeur = null;
    try {
      valeur = JSON.parse(s.texte);
    } catch {
      valeur = null;
    }
    return { ...s, valeur };
  });
}

/** Les cles d'argument de chaque operation qui peut echouer — ANCRES pour
 *  isoler l'exemple d'UNE operation precise, jamais un exemple flottant sans
 *  rapport (meme discipline que le detecteur DEJA ACCEPTE de T56/T57). */
const ARGS_PAR_OPERATION = {
  write: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key'],
  read: ['tenant_id', 'key'],
  probe_cancel: ['tenant_id', 'key'],
};
function argsOntLesClefs(v, requis) {
  const args = v.args;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return requis.length === 0;
  return requis.every((a) => Object.prototype.hasOwnProperty.call(args, a));
}
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Les paires requete→reponse du prompt, LIEES STRUCTURELLEMENT — jamais par
 * une fenetre de proximite textuelle. Une requete est une enveloppe JSON
 * VALIDE portant `id` (texte) et `op` (texte) ; SA reponse est l'enveloppe
 * `{...}` equilibree IMMEDIATEMENT suivante (aucune autre enveloppe entre les
 * deux), JSON valide, portant `ok` (booleen), AUCUN `op`, et le MEME `id` que
 * la requete (lien requete/reponse du protocole NDJSON de T48). IDENTIQUE a
 * `pairesExemples` de acceptance/T58.spec.ts.
 *
 * POURQUOI (mesure reelle, gate de mutation T58.M4) : la version precedente
 * ancrait la REQUETE par `op` puis acceptait la PREMIERE enveloppe `ok:false`
 * rencontree dans les 600 caracteres suivants — meme celle de l'exemple d'une
 * AUTRE operation. Sous T58.M4 (exemple d'erreur de `read` remplace par une
 * reponse de SUCCES `{"ok":true,"result":{"decision":"NOT_FOUND"}}`),
 * `parOperation.read` restait VRAI grace a l'exemple de `probe_cancel` de la
 * ligne suivante, et T58.A4 restait VERT.
 * @param {string} texte
 * @returns {{op: string, requete: object, reponse: object}[]}
 */
export function pairesExemples(texte) {
  const enveloppes = enveloppesJSON(typeof texte === 'string' ? texte : '');
  const out = [];
  for (let i = 0; i + 1 < enveloppes.length; i += 1) {
    const req = enveloppes[i].valeur;
    const res = enveloppes[i + 1].valeur;
    if (!estObjet(req) || typeof req.id !== 'string' || typeof req.op !== 'string') continue;
    if (!estObjet(res) || res.id !== req.id || typeof res.ok !== 'boolean') continue;
    if (Object.prototype.hasOwnProperty.call(res, 'op')) continue;
    out.push({ op: req.op, requete: req, reponse: res });
  }
  return out;
}

/**
 * VRAI si le prompt montre, pour L'OPERATION `opName` SPECIFIQUEMENT (requete
 * ANCREE par `op`+cles d'argument, mecanisme DEJA ACCEPTE de T56/T57), un
 * exemple dont la reponse LIEE par `id` a CETTE requete (`pairesExemples`)
 * est une enveloppe d'erreur : `"ok":false`, un sous-objet `error` portant un
 * `code` texte, et AUCUN `result` — PAR FORME, jamais par VALEUR ni par
 * lexique (voir en-tete : chaque exemple existant du protocole emploie deja
 * des valeurs-gabarit, `tenant-exemple`/`{"decision":"exemple"}` ; exiger la
 * valeur metier reelle NOT_FOUND dans l'exemple serait une exigence qu'aucune
 * source n'etablit — le risque de FAUX ROUGE qu'ADR-001 met en garde contre).
 * PAR OPERATION, jamais globalement au prompt entier : ADR-015 cite
 * LITTERALEMENT « pour une LECTURE faite depuis un autre locataire » — le
 * controle isolation@1 porte sur `read` specifiquement, et un exemple
 * d'erreur montre pour `write`/`probe_cancel` SEULS ne doit pas, par un effet
 * de bord (global OU de proximite textuelle), faire reussir `read`.
 * @param {string} promptBrut
 * @param {string} opName
 * @returns {boolean}
 */
export function exempleErreurPourOperation(promptBrut, opName) {
  const requis = ARGS_PAR_OPERATION[opName] ?? [];
  return pairesExemples(promptBrut).some(({ op, requete, reponse }) => {
    if (op !== opName || !argsOntLesClefs(requete, requis)) return false;
    if (reponse.ok !== false || Object.prototype.hasOwnProperty.call(reponse, 'result')) return false;
    return estObjet(reponse.error) && typeof reponse.error.code === 'string';
  });
}

const echapperRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `jeton` figure-t-il dans `source` comme jeton ENTIER ? Insensible a la
 *  casse — REPRIS A L'IDENTIQUE de acceptance/T56.spec.ts/T57.spec.ts. */
const contientJeton = (source, jeton) => new RegExp(`(?<![A-Za-z0-9_])${echapperRe(jeton)}(?![A-Za-z0-9_])`, 'iu').test(source);

/**
 * VRAI si la regle d'isolation inter-locataire est enoncee a cette periode —
 * detecte par la PRESENCE de l'ancrage GELE `ANCHOR_NOT_FOUND` N'IMPORTE OU
 * dans le prompt, jamais par le mot 'verdict' (que cette tache retire).
 * @param {string} promptBrut
 * @returns {boolean}
 */
export function isolationEnoncee(promptBrut) {
  return contientJeton(typeof promptBrut === 'string' ? promptBrut : '', ANCHOR_NOT_FOUND);
}

/* ─────────────────────────────────────────────────────────── derivation */

/**
 * @param {{prompt: string, cwd: string, fs: typeof import('node:fs'), path: typeof import('node:path')}} entree
 * @returns {{relPath: string, content: string, params: object}}
 */
export function deriver({ prompt, cwd, fs, path }) {
  // Noms de champs de protocole, valeurs metier ET forme imbriquee de `read`
  // (T56/T57, DEJA ACCEPTES) sont REUTILISES A L'IDENTIQUE — jamais re-
  // derives par ce module (voir en-tete).
  const base = deriverBase({ prompt, cwd, fs, path });

  const promptBrut = typeof prompt === 'string' ? prompt : '';
  const isolation = {
    enoncee: isolationEnoncee(promptBrut),
    parOperation: {
      write: exempleErreurPourOperation(promptBrut, 'write'),
      read: exempleErreurPourOperation(promptBrut, 'read'),
      probe_cancel: exempleErreurPourOperation(promptBrut, 'probe_cancel'),
    },
  };

  const params = { ...base.params, isolation };

  return { relPath: 'candidate.mjs', content: squelette(params, base.params), params };
}

/** Le squelette bench.candidate/2 — IDENTIQUE a celui de t57-derive-
 *  reference-candidate.mjs pour TOUTE operation AUTRE que le branchement
 *  d'isolation (copie verbatim de ce module ACCEPTE, jamais reinventee).
 *  SEUL ce branchement change : le choix ok:false/ok:true vient de
 *  `P.isolation.parOperation[opName]`, PAR OPERATION, jamais d'un lexique ('verdict') ni
 *  d'une certitude codee en dur ('isolation = toujours une erreur'). */
function squelette(params, paramsBaseT57Compat) {
  return `#!/usr/bin/env node
// candidate.mjs — candidat de reference de T58.A4, DERIVE du prompt recu par
// cette session (acceptance/fixtures/claude-cli/t58-derive-reference-candidate.mjs).
// Noms de champs de protocole, valeurs metier et forme imbriquee de \`read\`
// viennent de P ci-dessous (herites de T56/T57, jamais re-derives) ; SEULE la
// FORME de la reponse d'isolation (erreur ou decision) depend de
// P.isolation.parOperation[opName], PAR OPERATION, jamais d'un lexique fixe a l'avance.
//
// Lignes de compatibilite d'heritage (voir en-tete du module generateur,
// section « COMPATIBILITE D'HERITAGE DE LA CAPACITE ENTRE PERIODES ») —
// JAMAIS executees, relues SEULEMENT par t56-derive-reference-candidate.mjs
// (\`paramsHerites\`) a la periode SUIVANTE :
// ${MARQUEUR_PARAMS_T56_COMPAT} ${JSON.stringify(paramsBaseT57Compat)}
// ${MARQUEUR_PARAMS_T57_COMPAT} ${JSON.stringify(paramsBaseT57Compat)}
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const P = ${MARQUEUR_PARAMS_T58} ${JSON.stringify(params)};

const ETAT = './state.json';
const vierge = () => ({ proprietaire: null, horloge: null, tenus: [], file: [], annules: [], vus: {} });
let e = vierge();
if (existsSync(ETAT)) { try { e = { ...vierge(), ...JSON.parse(readFileSync(ETAT, 'utf8')) }; } catch { e = vierge(); } }
const sauver = () => writeFileSync(ETAT, JSON.stringify(e));

const canon = (x) => Array.isArray(x) ? x.map(canon) : x !== null && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;

const sortie = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
sortie({ ready: true });

const isole = P.isolation.enoncee;
const estProprietaire = (t) => e.proprietaire !== null && t === e.proprietaire;
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
  // SEUL BRANCHEMENT NOUVEAU PAR CE MODULE (T58) : si l'isolation est enoncee
  // (ancrage ${JSON.stringify(ANCHOR_NOT_FOUND)} present dans le prompt recu) ET que
  // le tenant_id de la requete n'est pas le proprietaire, le choix de la
  // FORME de refus depend de P.isolation.parOperation[opName] — PAR
  // OPERATION (voir en-tete du generateur : ADR-015 cite une LECTURE,
  // jamais globalement), jamais d'un lexique, jamais d'une certitude codee
  // en dur.
  const refusIsolation = (opName, apresOk, apresKo) => {
    if (!P.isolation.parOperation[opName]) { ok(apresOk()); return true; }
    ko(apresKo()); return true;
  };
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
      if (isole && !estProprietaire(args.tenant_id)) {
        refusIsolation('write', () => ({ [P.decisionField]: ${JSON.stringify(ANCHOR_NOT_FOUND)} }), () => ${JSON.stringify(ANCHOR_NOT_FOUND)});
        break;
      }
      const r = ecrire(args);
      if (operationKey !== undefined) e.vus[operationKey] = { empreinte, ...r };
      sauver();
      if (r.erreur !== undefined) ko(r.erreur); else ok({ [P.decisionField]: r.decision });
      break;
    }
    case 'read': {
      if (isole && !estProprietaire(args.tenant_id)) {
        refusIsolation('read', () => ({ [P.decisionField]: ${JSON.stringify(ANCHOR_NOT_FOUND)} }), () => ${JSON.stringify(ANCHOR_NOT_FOUND)});
        break;
      }
      const k = args.key;
      const champStatus = typeof P.lecture.statusField === 'string' && !P.lecture.statusField.startsWith('<absent-du-prompt:')
        ? P.lecture.statusField
        : '__t58_status_field_absent__';
      const champPosition = P.lecture.positionField;
      let value = null;
      if (e.tenus.includes(k)) {
        value = { [champStatus]: P.statut.tenu };
      } else {
        const pos = e.file.findIndex((q) => q.actor === k);
        if (pos >= 0) {
          value = typeof champPosition === 'string'
            ? { [champStatus]: P.statut.attente, [champPosition]: pos + 1 }
            : { [champStatus]: P.statut.attente };
        } else if (e.annules.includes(k)) {
          value = { [champStatus]: P.statut.annule };
        }
      }
      ok({ value });
      break;
    }
    case 'probe_cancel': {
      if (isole && !estProprietaire(args.tenant_id)) {
        refusIsolation('probe_cancel', () => ({ [P.decisionField]: ${JSON.stringify(ANCHOR_NOT_FOUND)} }), () => ${JSON.stringify(ANCHOR_NOT_FOUND)});
        break;
      }
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
