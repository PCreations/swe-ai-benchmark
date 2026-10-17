// acceptance/fixtures/claude-cli/t57-derive-reference-candidate.mjs — zone ACCEPTANCE.
//
// GENERATEUR DU CANDIDAT DE REFERENCE DE T57.A3, DERIVE DU SEUL PROMPT RECU —
// ET, NOUVEAU PAR RAPPORT A T56 (acceptance/fixtures/claude-cli/
// t56-derive-reference-candidate.mjs, dont ce module IMPORTE ET REUTILISE
// `deriver` SANS MODIFICATION pour tout ce qui n'est pas en cause ici :
// `operationKeyField`, `decisionField`, les valeurs metier `statut.*`/`code.*`/
// `creneau`/`capacite`/`frontiere`), DERIVANT EN OUTRE LES NOMS DE CHAMPS DE LA
// FORME IMBRIQUEE de la reponse `read` — exactement ce qu'ADR-014 vise :
//
//   ADR-014, « Ce que le premier pilote reel a montre » : « L'exemple public
//   de `read` (T56) montre `{"value":"exemple"}` — une chaine — alors que le
//   controle compare un objet `{"status":…, "waiting_position":…}`. Sonnet a
//   suivi l'exemple a la lettre [...] Ni l'enonce ni le contrat ne decrivent
//   la forme de `value`. » Decision : « pour chaque operation, la FORME de
//   chaque reponse que les controles comparent [...] est montree au candidat
//   par un exemple de cette forme exacte [...] L'enonce [...] decrit [...] la
//   forme qu'il compare. »
//
// Le module t56 HARDCODE deja les noms 'status'/'waiting_position' dans son
// propre squelette (acceptance/T56.spec.ts ne teste jamais la FORME de
// `read` — seulement le vocabulaire de `write`/`probe_cancel`). Reutiliser ce
// squelette TEL QUEL rendrait T57.A3 creux : le candidat reussirait fifo@1
// MEME si le prompt ne montrait jamais la forme a deux cles, puisque les noms
// seraient deja corrects par construction, jamais DERIVES. Ce module ecrit
// donc SON PROPRE squelette, identique a celui de t56 pour toute operation
// AUTRE que `read` (copie verbatim, jamais reinventee), et REMPLACE le seul
// cas `read` par une version dont les noms de champs proviennent de
// `extraireFormesLecture` ci-dessous — jamais 'status'/'waiting_position' en
// dur dans CE fichier.
//
// extraireFormesLecture : INSPECTE LA FORME, jamais le lexique. Le mecanisme
// cherche, n'importe ou dans le prompt (enonce ET exemples), un sous-objet
// JSON `"value": {...}` a DEUX cles dont l'une porte une valeur NOMBRE et
// l'autre une valeur CHAINE (discipline ADR-001 : role derive par POSITION/
// TYPE structurel, jamais par le nom attendu) : la cle a valeur NOMBRE devient
// `positionField`, la cle a valeur CHAINE devient `statusField`. A DEFAUT
// (aucune forme a deux cles presente dans le prompt — exactement l'incident
// reel), le mecanisme retombe sur la PREMIERE forme `"value":{...}` a UNE
// SEULE cle (chaine) pour `statusField` SEUL ; `positionField` reste `null` et
// la cle correspondante est alors OMISE de la reponse — JAMAIS inventee. Cette
// omission est la consequence VOULUE : un prompt qui ne montre jamais la forme
// a deux cles (T57.A1 insatisfait) produit un candidat qui ne peut, par
// construction, pas satisfaire fifo@1 — exactement la chaine causale que
// l'incident reel documente et que verification/cases.extensions.lock.json#
// T57.A3 nomme (« rendre l'exemple de read sous une forme que fifo@1 ne
// compare pas : fifo@1 doit echouer »).
//
// Valeur ou nom INTROUVABLE -> JAMAIS invente (meme regle que t55/t56) : un
// candidat qui ne peut pas deriver `statusField` repond sous la cle marqueur
// `__t57_status_field_absent__`, qu'aucun controle ne reconnait.
//
// Appele par le faux `claude` (acceptance/fixtures/claude-cli/bin/claude,
// variable BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE, mecanisme ADDITIF FIXE
// par acceptance/T55.spec.ts, A3 — AUCUNE modification de ce fixture) par
// acceptance/T57.spec.ts (A3).
//
// COMPATIBILITE D'HERITAGE DE LA CAPACITE ENTRE PERIODES : le `deriver` de
// t56, REUTILISE ici, retrouve `capacite` (si l'enonce de la periode courante
// ne la repete pas) en relisant, dans candidate.mjs DEJA ECRIT par la periode
// PRECEDENTE, son propre marqueur `/*__T56_PARAMS_DERIVES_DU_PROMPT__*/`
// (`paramsHerites`, t56-derive-reference-candidate.mjs). Puisque CE module
// ecrit SON PROPRE candidate.mjs (jamais celui de t56), il EMBARQUE EN PLUS,
// dans un simple COMMENTAIRE jamais execute, le MEME marqueur portant les
// MEMES params — pour que cette inheritance, deja etablie et ACCEPTEE par
// T56, continue de fonctionner SANS MODIFICATION de t56-derive-reference-
// candidate.mjs.

import { deriver as deriverBase } from './t56-derive-reference-candidate.mjs';

const MARQUEUR_PARAMS_T57 = '/*__T57_PARAMS_DERIVES_DU_PROMPT__*/';
const MARQUEUR_PARAMS_T56_COMPAT = '/*__T56_PARAMS_DERIVES_DU_PROMPT__*/'; // voir en-tete, § compatibilite

/** Segments `{...}` equilibres — IDENTIQUE a celui de t56-derive-reference-
 *  candidate.mjs (dupliquee ici, ce fichier n'exportant pas la sienne). */
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

/** Le sous-objet JSON `"nomChamp": {...}` immediatement apres la cle, borne
 *  par comptage de profondeur (jamais une regex `[^{}]*`, insuffisante pour
 *  un objet imbrique comme `"value":{"status":...,"waiting_position":...}`). */
function sousObjetJSON(texte, nomChamp) {
  const motif = new RegExp(`"${nomChamp}"\\s*:\\s*`, 'u');
  const m = motif.exec(texte);
  if (m === null) return null;
  const debutRecherche = m.index + m[0].length;
  if (texte[debutRecherche] !== '{') return null; // valeur non-objet (chaine, null...) : pas une forme imbriquee
  let profondeur = 0;
  for (let i = debutRecherche; i < texte.length; i += 1) {
    if (texte[i] === '{') profondeur += 1;
    else if (texte[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return texte.slice(debutRecherche, i + 1);
    }
  }
  return null;
}

/**
 * `{statusField, positionField}` — voir en-tete pour le mecanisme complet.
 * @param {string} promptBrut
 * @returns {{statusField: string|null, positionField: string|null}}
 */
export function extraireFormesLecture(promptBrut) {
  const texte = typeof promptBrut === 'string' ? promptBrut : '';
  let statusField = null;
  let positionField = null;
  for (const enveloppe of segmentsAccolades(texte)) {
    const sousTexte = sousObjetJSON(enveloppe.texte, 'value');
    if (sousTexte === null) continue;
    let valeur;
    try {
      valeur = JSON.parse(sousTexte);
    } catch {
      continue;
    }
    if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) continue;
    const cles = Object.keys(valeur);
    if (cles.length === 2) {
      const cleNombre = cles.find((k) => typeof valeur[k] === 'number');
      const cleChaine = cles.find((k) => typeof valeur[k] === 'string');
      if (cleNombre !== undefined && cleChaine !== undefined && cleNombre !== cleChaine) {
        // Forme COMPLETE (deux cles, types distincts) : priorite absolue, source
        // la PLUS INFORMATIVE possible — on arrete la recherche ici.
        return { statusField: cleChaine, positionField: cleNombre };
      }
    } else if (cles.length === 1 && statusField === null && typeof valeur[cles[0]] === 'string') {
      // Forme PARTIELLE (une seule cle) : secours SEULEMENT si aucune forme a
      // deux cles n'est jamais trouvee ailleurs dans le prompt.
      statusField = cles[0];
    }
  }
  return { statusField, positionField };
}

function absent(role) {
  return `<absent-du-prompt:${role}>`;
}

/* ─────────────────────────────────────────────────────────── derivation */

/**
 * @param {{prompt: string, cwd: string, fs: typeof import('node:fs'), path: typeof import('node:path')}} entree
 * @returns {{relPath: string, content: string, params: object}}
 */
export function deriver({ prompt, cwd, fs, path }) {
  // Les noms de champs de PROTOCOLE deja en cause pour T56 (decisionField,
  // operationKeyField) ET toutes les valeurs METIER (statut.*, code.*,
  // creneau, capacite, frontiere) sont REUTILISEES A L'IDENTIQUE — jamais
  // re-derivees par ce module (voir en-tete).
  const base = deriverBase({ prompt, cwd, fs, path });

  const promptBrut = typeof prompt === 'string' ? prompt : '';
  const lecture = extraireFormesLecture(promptBrut);

  const params = {
    ...base.params,
    lecture: {
      statusField: lecture.statusField ?? absent('status_field'),
      positionField: lecture.positionField, // null DELIBERE (jamais un marqueur) : voir en-tete, "omission voulue"
    },
  };

  return { relPath: 'candidate.mjs', content: squelette(params, base.params), params };
}

/** Le squelette bench.candidate/2 — IDENTIQUE a celui de t56-derive-
 *  reference-candidate.mjs pour TOUTE operation AUTRE que `read` (copie
 *  verbatim de ce module ACCEPTE, jamais reinventee). SEUL le cas `read`
 *  change : les noms de champs de SA forme imbriquee viennent de
 *  `P.lecture.statusField`/`P.lecture.positionField`, jamais en dur. */
function squelette(params, paramsBaseT56Compat) {
  return `#!/usr/bin/env node
// candidate.mjs — candidat de reference de T57.A3, DERIVE du prompt recu par
// cette session (acceptance/fixtures/claude-cli/t57-derive-reference-candidate.mjs).
// Noms de champs de protocole, valeurs metier ET forme imbriquee de \`read\`
// viennent tous trois de P ci-dessous — jamais d'un lexique fixe a l'avance.
//
// Ligne de compatibilite d'heritage (voir en-tete du module generateur,
// section « COMPATIBILITE D'HERITAGE DE LA CAPACITE ENTRE PERIODES ») —
// JAMAIS executee, relue SEULEMENT par t56-derive-reference-candidate.mjs
// (\`paramsHerites\`) a la periode SUIVANTE :
// ${MARQUEUR_PARAMS_T56_COMPAT} ${JSON.stringify(paramsBaseT56Compat)}
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const P = ${MARQUEUR_PARAMS_T57} ${JSON.stringify(params)};

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
      // SEUL CAS QUI DIFFERE DE t56-derive-reference-candidate.mjs : les noms
      // de champs de la forme imbriquee viennent de P.lecture, jamais en dur
      // ('status'/'waiting_position' n'apparaissent NULLE PART dans ce fichier).
      if (!autorise(args.tenant_id)) { ko(P.code.autre_locataire); break; }
      const k = args.key;
      const champStatus = typeof P.lecture.statusField === 'string' && !P.lecture.statusField.startsWith('<absent-du-prompt:')
        ? P.lecture.statusField
        : '__t57_status_field_absent__';
      const champPosition = P.lecture.positionField; // null -> cle OMISE (voir en-tete)
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
