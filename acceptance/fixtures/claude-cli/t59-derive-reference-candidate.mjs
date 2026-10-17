// acceptance/fixtures/claude-cli/t59-derive-reference-candidate.mjs — zone ACCEPTANCE.
//
// GENERATEUR DU CANDIDAT DE REFERENCE DE T59.A3, DERIVE DU SEUL PROMPT RECU —
// ET, NOUVEAU PAR RAPPORT A T58 (acceptance/fixtures/claude-cli/
// t58-derive-reference-candidate.mjs, dont ce module IMPORTE ET REUTILISE
// `deriver` SANS MODIFICATION pour tout ce qui n'est pas en cause ici :
// `operationKeyField`, `decisionField`, les valeurs metier `statut.*`/
// `code.*`/`creneau`/`capacite`/`frontiere`, la forme imbriquee de `read`,
// ET la detection PAR FORME de l'exemple d'erreur par operation
// (`isolation.enoncee`/`isolation.parOperation`, deja ACCEPTEE par T58) —
// DERIVANT EN OUTRE, DANS LE SEUL CAS `read`, SI UNE CLE EST RESOLUE AVANT
// de decider du refus d'isolation :
//
//   docs/adr/ADR-016, « Ce que le troisieme pilote reel a montre » : « Dans le
//   scenario scripte, l'usage `sonde-intertenant` est une lecture faite
//   **par** l'acteur `Z` du locataire `other`. La traduction vers le contrat
//   [...] place l'acteur dans l'argument `key` : le candidat recoit
//   `read(tenant_id: "other", key: "Z")`, la lecture d'une cle que personne
//   n'a jamais creee. Selon l'enonce et l'exemple public, une cle inconnue
//   repond `{value: null}` ; c'est ce que les deux candidats ont repondu. [...]
//   Les deux candidats implementent pourtant l'isolation : lire, depuis un
//   autre locataire, la cle d'un acteur de legacy renvoie chez eux
//   NOT_FOUND. » Decision : « la sonde d'isolation lit, depuis le locataire
//   `other`, la cle d'un acteur qui detient une reservation dans `legacy`. »
//
// t58-derive-reference-candidate.mjs (comme t56/t57 avant lui) decide du
// refus d'isolation de `read` INCONDITIONNELLEMENT, AVANT tout examen de la
// cle (`isole && !estProprietaire(args.tenant_id)`, en tete du cas `read`).
// Reutiliser ce squelette TEL QUEL rendrait T59.A3 CREUX, pour la RAISON
// EXACTE que cette tache existe : un refus inconditionnel-par-tenant realise
// isolation@1 AUSSI BIEN sous l'ANCIEN defaut (`key: 'Z'`, un acteur qui n'a
// JAMAIS ete ecrit nulle part) que sous sa correction (`key` d'un acteur
// REELLEMENT detenteur dans `legacy`) — il ne depend JAMAIS de la cle recue,
// et ne peut donc JAMAIS rougir sous le mutant nomme par verification/
// cases.extensions.lock.json#T59.A3 (« revenir a key=Z [...] : isolation@1
// doit echouer »). Ce module ecrit donc SON PROPRE squelette, identique a
// celui de t58 pour TOUTE operation AUTRE que `read` (copie verbatim, jamais
// reinventee), et REMPLACE le SEUL cas `read` par une version qui reproduit
// FIDELEMENT l'incident reel que ADR-016 documente : une cle est d'abord
// RESOLUE dans l'etat (global, jamais partitionne par locataire — exactement
// le modele de donnees qu'un candidat qui suit l'enonce et l'exemple public a
// la lettre, « cle inconnue -> {value:null} », impose implicitement) ; LE
// REFUS D'ISOLATION N'EST DECIDE QUE SI CETTE RESOLUTION REUSSIT. Avec
// `key:'Z'` (jamais ecrite), la resolution echoue TOUJOURS -> {value:null},
// isolation@1 jamais flagree : RED. Avec la cle d'un acteur REELLEMENT
// detenteur dans `legacy` (la correction que T59 livre), la resolution
// REUSSIT -> le refus d'isolation se declenche -> NOT_FOUND (ou la decision
// equivalente, selon `P.isolation.parOperation.read`, EXACTEMENT comme t58) :
// GREEN. `write`/`probe_cancel` restent INCHANGES (refus INCONDITIONNEL par
// tenant, comme t58) : ADR-016 ne porte QUE sur la lecture de la sonde
// d'isolation (« la sonde d'isolation LIT »), jamais sur ces deux operations.
//
// Appele par le faux `claude` (acceptance/fixtures/claude-cli/bin/claude,
// variable BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE, mecanisme ADDITIF FIXE
// par acceptance/T55.spec.ts, A3 — AUCUNE modification de ce fixture) par
// acceptance/T59.spec.ts (A3).
//
// COMPATIBILITE D'HERITAGE DE LA CAPACITE ENTRE PERIODES : comme t57/t58 le
// font pour leur propre predecesseur, ce module ecrit SON PROPRE
// candidate.mjs (jamais celui de t58) et EMBARQUE EN PLUS, dans de simples
// COMMENTAIRES jamais executes, les MEMES marqueurs
// `/*__T58_PARAMS_DERIVES_DU_PROMPT__*/`, `/*__T57_PARAMS_DERIVES_DU_PROMPT__*/`
// et `/*__T56_PARAMS_DERIVES_DU_PROMPT__*/` portant les MEMES params — pour
// que l'heritage de `capacite` entre periodes, deja etabli et ACCEPTE par
// T56 (sa seule lecture reelle, `paramsHerites`), continue de fonctionner
// SANS MODIFICATION de t56/t57/t58-derive-reference-candidate.mjs.

import { deriver as deriverBase } from './t58-derive-reference-candidate.mjs';

const MARQUEUR_PARAMS_T59 = '/*__T59_PARAMS_DERIVES_DU_PROMPT__*/';
const MARQUEUR_PARAMS_T58_COMPAT = '/*__T58_PARAMS_DERIVES_DU_PROMPT__*/'; // voir en-tete, § compatibilite
const MARQUEUR_PARAMS_T57_COMPAT = '/*__T57_PARAMS_DERIVES_DU_PROMPT__*/'; // voir en-tete, § compatibilite
const MARQUEUR_PARAMS_T56_COMPAT = '/*__T56_PARAMS_DERIVES_DU_PROMPT__*/'; // voir en-tete, § compatibilite — LA SEULE reellement relue (paramsHerites)

/** Ancrage GELE, repris A L'IDENTIQUE de acceptance/T53.spec.ts (L535) /
 *  acceptance/T58.spec.ts (III) :
 *  acceptance/reference/F-RESERVATION.json:valeurs.P4.verdict_intertenant
 *  (cahier_line 123) — jamais une invention de ce module. */
const ANCHOR_NOT_FOUND = 'NOT_FOUND';

/**
 * T59 ne change NI le prompt NI la detection de la forme d'erreur
 * (`isolation.enoncee`/`isolation.parOperation`) : ces champs sont REPRIS
 * A L'IDENTIQUE de `base.params` (calcules par t58, lui-meme par t57/t56),
 * jamais recalcules ici. SEULE la FONCTION du squelette qui decide du refus
 * d'isolation de `read` change (voir en-tete).
 * @param {{prompt: string, cwd: string, fs: typeof import('node:fs'), path: typeof import('node:path')}} entree
 * @returns {{relPath: string, content: string, params: object}}
 */
export function deriver({ prompt, cwd, fs, path }) {
  const base = deriverBase({ prompt, cwd, fs, path });
  const params = base.params;
  return { relPath: 'candidate.mjs', content: squelette(params), params };
}

/** Le squelette bench.candidate/2 — IDENTIQUE a celui de t58-derive-
 *  reference-candidate.mjs pour TOUTE operation AUTRE que `read`. SEUL le cas
 *  `read` change : la cle est RESOLUE D'ABORD (etat global, jamais
 *  partitionne par locataire) ; le refus d'isolation (ok:false/ok:true selon
 *  `P.isolation.parOperation.read`, EXACTEMENT comme t58) n'est decide QUE si
 *  cette resolution a REUSSI — jamais inconditionnellement par tenant. */
function squelette(params) {
  return `#!/usr/bin/env node
// candidate.mjs — candidat de reference de T59.A3, DERIVE du prompt recu par
// cette session (acceptance/fixtures/claude-cli/t59-derive-reference-candidate.mjs).
// Noms de champs de protocole, valeurs metier, forme imbriquee de \`read\` et
// detection de la forme d'erreur d'isolation viennent de P ci-dessous
// (herites de T56/T57/T58, jamais re-derives) ; SEUL le cas \`read\` resout la
// cle AVANT de decider du refus d'isolation (jamais inconditionnellement par
// tenant) — c'est le SEUL point que ce module change face a T58.
//
// Lignes de compatibilite d'heritage (voir en-tete du module generateur,
// section « COMPATIBILITE D'HERITAGE DE LA CAPACITE ENTRE PERIODES ») —
// JAMAIS executees, relues SEULEMENT par t56-derive-reference-candidate.mjs
// (\`paramsHerites\`) a la periode SUIVANTE :
// ${MARQUEUR_PARAMS_T56_COMPAT} ${JSON.stringify(params)}
// ${MARQUEUR_PARAMS_T57_COMPAT} ${JSON.stringify(params)}
// ${MARQUEUR_PARAMS_T58_COMPAT} ${JSON.stringify(params)}
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const P = ${MARQUEUR_PARAMS_T59} ${JSON.stringify(params)};

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
      // SEUL BRANCHEMENT NOUVEAU PAR CE MODULE (T59) : la cle est RESOLUE
      // D'ABORD, dans un etat GLOBAL jamais partitionne par locataire
      // (exactement le modele qu'impose « cle inconnue -> {value:null} »,
      // suivi a la lettre) ; le refus d'isolation n'est decide QUE si cette
      // resolution a REUSSI — jamais inconditionnellement par tenant comme
      // dans T58. Reproduction FIDELE de l'incident reel d'ADR-016.
      const k = args.key;
      const champStatus = typeof P.lecture.statusField === 'string' && !P.lecture.statusField.startsWith('<absent-du-prompt:')
        ? P.lecture.statusField
        : '__t59_status_field_absent__';
      const champPosition = P.lecture.positionField;
      let value = null;
      let resolue = false;
      if (e.tenus.includes(k)) {
        value = { [champStatus]: P.statut.tenu };
        resolue = true;
      } else {
        const pos = e.file.findIndex((q) => q.actor === k);
        if (pos >= 0) {
          value = typeof champPosition === 'string'
            ? { [champStatus]: P.statut.attente, [champPosition]: pos + 1 }
            : { [champStatus]: P.statut.attente };
          resolue = true;
        } else if (e.annules.includes(k)) {
          value = { [champStatus]: P.statut.annule };
          resolue = true;
        }
      }
      if (resolue && isole && !estProprietaire(args.tenant_id)) {
        refusIsolation('read', () => ({ [P.decisionField]: ${JSON.stringify(ANCHOR_NOT_FOUND)} }), () => ${JSON.stringify(ANCHOR_NOT_FOUND)});
        break;
      }
      ok({ value: !estProprietaire(args.tenant_id) ? null : value });
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
