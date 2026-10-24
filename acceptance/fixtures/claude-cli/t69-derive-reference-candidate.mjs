// acceptance/fixtures/claude-cli/t69-derive-reference-candidate.mjs — zone ACCEPTANCE.
//
// GENERATEUR DU CANDIDAT DE REFERENCE DE T69.A3, DERIVE DU SEUL PROMPT RECU,
// pour le scenario F-LONG (contrat `bench.candidate/4`).
//
// ADR-020, decision 3 : « Un candidat de reference qui tire ses noms de
// champs, ses valeurs de vocabulaire et ses formes de reponse du seul prompt
// recu obtient un score de 1 sur chaque regle active a chaque periode, lance
// par `bench pilot-conduct --provider claude-cli --live` avec le faux
// executable `claude`. » ADR-020, « Ce que le pilote F-LONG a montre » :
// « T66.A1 ne pouvait pas le voir : son candidat fixture connait le
// vocabulaire par construction. » Ce module est la reponse a cette phrase,
// comme t56/t57/t58-derive-reference-candidate.mjs l'ont ete pour
// F-RESERVATION (ADR-013 a 015).
//
// ─────────────────────────────────────────────────────── CE QUI EST DERIVE
// Le COMPORTEMENT (les regles de F-LONG, les huit points d'ADR-019) est celui
// du candidat de reference v4 (acceptance/fixtures/candidates/
// f-long-reference-candidate-v4.mjs, ecrit par le test-author de T68, prouve
// a 1 par T66.A1 et T68.A1), embarque TEL QUEL dans le candidate.mjs ecrit.
// Ce module ne change que ce que le candidat EMET : chaque reponse que v4
// produirait est TRADUITE, a la sortie, dans le vocabulaire et les formes
// LUS DANS LE PROMPT RECU. Les etats internes de v4 (`waiting`, `confirmed`,
// `QUOTA_EXCEEDED`...) ne sont que des IDENTIFIANTS INTERNES : la table
// `ROLE_INTERNE` les rattache a un ROLE NEUTRE (ATTENTE, TENU, QUOTA...), et
// la valeur emise pour ce role est celle que le prompt cite — jamais
// l'identifiant interne. Un role que le prompt ne permet pas de nommer est
// emis comme le marqueur `<absent-du-prompt:ROLE>` (meme regle que T55-T58 :
// faux rouge possible, jamais faux vert). AUCUNE valeur ni AUCUN nom de champ
// de reponse n'a de valeur de repli codee en dur.
//
//   1. LES FORMES — depuis les EXEMPLES PUBLICS (ADR-020 decision 2), lus par
//      `pairesExemples` (repris a l'identique de t58-derive-reference-
//      candidate.mjs) : une requete JSON `{id, op, args}` suivie
//      IMMEDIATEMENT d'une reponse JSON `{id, ok, ...}` de meme `id`.
//        - champ de decision      : unique cle (texte) du `result` d'un
//                                   exemple de succes de l'operation (ou, a
//                                   defaut, de `write`) ;
//        - champ de valeur de read: unique cle du `result` d'un exemple de
//                                   succes de `read` ;
//        - champ de statut        : cle commune, a valeur texte, de toutes les
//                                   valeurs-objets des exemples de `read` ;
//        - champ de position      : cle a valeur NOMBRE d'une valeur-objet de
//                                   `read` qui porte aussi le champ de statut ;
//        - champ de solde         : unique cle (nombre) d'un exemple `balance` ;
//        - champ d'evenements     : unique cle (tableau) d'un exemple `history` ;
//        - champs d'un evenement  : dans le premier element d'un tableau
//                                   d'evenements exemple, la cle a valeur
//                                   date ISO 8601 (`at`), la cle homonyme du
//                                   champ de statut (statut), la cle texte
//                                   restante (type) ;
//        - champs d'une erreur    : dans `error` d'un exemple `ok:false`, la
//                                   cle a laquelle le prompt associe un code
//                                   (texte en MAJUSCULES) — sinon celle dont
//                                   la valeur d'exemple est en majuscules — et
//                                   l'autre cle (message).
//      Repli, pour les seules cles de `result` : la signature publique
//      `op(args) -> {champ}` du contrat cite dans le prompt.
//   2. LES VALEURS — depuis les PAIRES « champ -> valeur » du prompt
//      (ADR-020 decision 1 : chaque valeur « avec son nom de champ ») : un
//      jeton entre guillemets ou accents graves, precede SUR LA MEME LIGNE, a
//      moins de 120 caracteres, du nom de champ (`pairesChampValeur`). Le role
//      d'une valeur (TENU, ATTENTE, ANNULE, QUOTA, TROP_TARD, INTROUVABLE,
//      MIGRE, REFUSE, ACCEPTE, CREE, TRANSFERE) se lit comme un lecteur le
//      lirait : par le SENS du jeton lui-meme ou du texte qui l'entoure
//      (`INDICES` : radicaux francais et anglais — « attente »/« wait »,
//      « quota », « tard »/« late »...). C'est une lecture du prompt, jamais
//      une valeur attendue : un prompt qui nomme la decision d'attente
//      `waitlisted` fait emettre `waitlisted` (temoin negatif de
//      acceptance/T69.spec.ts, A3).
//
// CE QUI N'EST PAS DERIVE (hors du perimetre d'ADR-020, qui porte sur le
// vocabulaire et les formes des REPONSES) : les noms des ARGUMENTS de requete
// (`tenant_id`, `slot_id`...) que v4 lit tels que le moteur les envoie, et la
// mecanique de transport NDJSON (`{"ready":true}`, enveloppe `id`/`ok`/
// `result`/`error`), fixee depuis bench.candidate/2 et prouvee par T48.
//
// Appele par le faux `claude` (acceptance/fixtures/claude-cli/bin/claude,
// variable BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE, mecanisme FIXE par
// acceptance/T55.spec.ts — AUCUNE modification du faux executable), au
// travers d'un petit module d'emballage ecrit par acceptance/T69.spec.ts
// (qui lui passe `journal`, et, pour le temoin negatif, un prompt renomme).
// `deriver` reste SYNCHRONE, la forme que le faux executable appelle.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as nodePath from 'node:path';

const ICI = nodePath.dirname(fileURLToPath(import.meta.url));
const SOURCE_V4 = nodePath.join(ICI, '..', 'candidates', 'f-long-reference-candidate-v4.mjs');

const absent = (role) => `<absent-du-prompt:${role}>`;
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ───────────────────────────────────────────── I. exemples publics (formes) */

/** Segments `{...}` equilibres — IDENTIQUE a t56/t57/t58-derive. */
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

/**
 * Paires requete -> reponse du prompt, liees par `id` — REPRISE A L'IDENTIQUE
 * de `pairesExemples` (acceptance/fixtures/claude-cli/t58-derive-reference-
 * candidate.mjs, acceptance/T58.spec.ts).
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

/** Cles de `result` des signatures publiques `op(args) -> {champ}`. */
export function signatures(texte) {
  const out = {};
  const re = /(?<![A-Za-z0-9_])([a-z_][a-z0-9_]*)\(([^()\n]*)\)\s*->\s*\{([^{}\n]*)\}/gu;
  let m;
  while ((m = re.exec(typeof texte === 'string' ? texte : '')) !== null) {
    const champs = m[3].split(',').map((s) => s.trim().replace(/^["'`]|["'`]$/g, '')).filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
    out[m[1]] = champs; // la DERNIERE signature citee l'emporte (contrat le plus recent)
  }
  return out;
}

/* ─────────────────────────────────────── II. paires champ -> valeur (valeurs) */

const FENETRE = 120;

/**
 * Chaque jeton entre guillemets/accents graves (`valeur`), avec les noms de
 * champ (identifiants entiers) qui le precedent sur la MEME ligne a moins de
 * FENETRE caracteres. Definition PARTAGEE avec acceptance/T69.spec.ts (A1).
 * @param {string} texte
 * @returns {{valeur: string, champs: string[], index: number, contexte: string}[]}
 */
export function pairesChampValeur(texte) {
  const t = typeof texte === 'string' ? texte : '';
  const out = [];
  const re = /(["'`])([A-Za-z][A-Za-z0-9_]*)\1/gu;
  let m;
  while ((m = re.exec(t)) !== null) {
    const debutLigne = t.lastIndexOf('\n', m.index) + 1;
    const finLigneBrute = t.indexOf('\n', m.index);
    const finLigne = finLigneBrute < 0 ? t.length : finLigneBrute;
    const avant = t.slice(Math.max(debutLigne, m.index - FENETRE), m.index);
    const champs = [];
    const reId = /(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])/gu;
    let k;
    while ((k = reId.exec(avant)) !== null) champs.push(k[1]);
    const contexte = `${t.slice(Math.max(debutLigne, m.index - FENETRE), m.index)} ${t.slice(m.index + m[0].length, Math.min(finLigne, m.index + m[0].length + FENETRE))}`;
    out.push({ valeur: m[2], champs, index: m.index, contexte });
    re.lastIndex = m.index + 1; // un jeton peut fermer la citation du precedent
  }
  return out;
}

/** Valeurs citees AVEC le nom de champ `champ` (ADR-020 decision 1). */
export function valeursDuChamp(texte, champ) {
  return pairesChampValeur(texte).filter((p) => p.champs.includes(champ));
}

/* ────────────────────────────────────────── III. roles (lecture du sens) */

/** Indices de sens : radicaux d'un lecteur francophone ou anglophone. */
const INDICES = {
  TENU: /confirm/iu,
  ATTENTE: /attente|wait/iu,
  ANNULE: /annul|cancel/iu,
  REFUSE: /refus/iu,
  ACCEPTE: /accept/iu,
  CREE: /cr[ée]{1,2}|creat/iu,
  TRANSFERE: /transf/iu,
  QUOTA: /quota/iu,
  TROP_TARD: /tard|late/iu,
  INTROUVABLE: /introuvable|not.?found|inconnu|inexistant/iu,
  MIGRE: /migr/iu,
};

/**
 * Pour un role, la valeur citee avec le champ qui le lit le mieux : d'abord
 * par le sens du jeton lui-meme, puis par le texte qui l'entoure ; a egalite,
 * la plus souvent citee.
 */
function choisirRole(paires, role, filtre, exclus) {
  const indice = INDICES[role];
  const score = new Map();
  for (const p of paires) {
    if (!filtre(p.valeur) || exclus.has(p.valeur)) continue;
    let s = 0;
    if (indice.test(p.valeur)) s += 1000;
    else if (indice.test(p.contexte)) s += 10;
    else continue;
    score.set(p.valeur, (score.get(p.valeur) ?? 0) + s + 1);
  }
  let meilleur = null;
  let max = -1;
  for (const [v, s] of score) {
    if (s > max) {
      max = s;
      meilleur = v;
    }
  }
  return meilleur ?? absent(role);
}

/* ────────────────────────────────────────────── IV. noms de champs (formes) */

function cleUnique(o, type) {
  if (!estObjet(o)) return null;
  const cles = Object.keys(o);
  if (cles.length !== 1) return null;
  const v = o[cles[0]];
  if (type === 'array' ? !Array.isArray(v) : type === 'any' ? false : typeof v !== type) return null;
  return cles[0];
}

function succes(exemples, op) {
  return exemples.filter((e) => e.op === op && e.reponse.ok === true && Object.prototype.hasOwnProperty.call(e.reponse, 'result'));
}

const estIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));

/**
 * Tous les parametres que le candidat tire du prompt.
 * @param {string} promptBrut
 */
export function deriverParametres(promptBrut) {
  const prompt = typeof promptBrut === 'string' ? promptBrut : '';
  const exemples = pairesExemples(prompt);
  const sig = signatures(prompt);
  const provenance = {};

  const depuisSignature = (op) => (Array.isArray(sig[op]) && sig[op].length === 1 ? sig[op][0] : null);

  // Champ de decision, par operation (exemple de succes, sinon signature),
  // repli sur celui de `write`.
  const champDecisionDe = (op) => {
    for (const e of succes(exemples, op)) {
      const k = cleUnique(e.reponse.result, 'string');
      if (k !== null) return k;
    }
    return depuisSignature(op);
  };
  const decisionWrite = champDecisionDe('write');
  const champs = {
    decision: {},
    value: null,
    status: null,
    position: null,
    balance: null,
    events: null,
    evType: null,
    evStatus: null,
    evAt: null,
    code: null,
    message: null,
    sha256: depuisSignature('fingerprint'),
  };
  for (const op of ['write', 'probe_cancel', 'create_slot', 'set_capacity', 'set_level', 'transfer']) {
    champs.decision[op] = champDecisionDe(op) ?? decisionWrite ?? absent(`champ_decision_${op}`);
  }

  // read : champ de valeur, puis forme de la valeur-objet.
  for (const e of succes(exemples, 'read')) {
    const k = cleUnique(e.reponse.result, 'any');
    if (k !== null) {
      champs.value = k;
      break;
    }
  }
  if (champs.value === null) champs.value = depuisSignature('read');
  const valeursObjets = champs.value === null
    ? []
    : succes(exemples, 'read').map((e) => e.reponse.result?.[champs.value]).filter(estObjet);
  if (valeursObjets.length > 0) {
    const communes = Object.keys(valeursObjets[0]).filter((k) =>
      valeursObjets.every((o) => typeof o[k] === 'string'),
    );
    if (communes.length === 1) champs.status = communes[0];
    if (champs.status !== null) {
      for (const o of valeursObjets) {
        if (typeof o[champs.status] !== 'string') continue;
        const nombres = Object.keys(o).filter((k) => k !== champs.status && typeof o[k] === 'number');
        if (nombres.length === 1) {
          champs.position = nombres[0];
          break;
        }
      }
    }
  }
  provenance.formesRead = valeursObjets;

  // balance / history.
  for (const e of succes(exemples, 'balance')) {
    const k = cleUnique(e.reponse.result, 'number');
    if (k !== null) {
      champs.balance = k;
      break;
    }
  }
  if (champs.balance === null) champs.balance = depuisSignature('balance');
  for (const e of succes(exemples, 'history')) {
    const k = cleUnique(e.reponse.result, 'array');
    if (k === null) continue;
    champs.events = k;
    const premier = e.reponse.result[k][0];
    if (estObjet(premier)) {
      const cles = Object.keys(premier);
      champs.evAt = cles.find((c) => estIso(premier[c])) ?? null;
      champs.evStatus = champs.status !== null && cles.includes(champs.status) ? champs.status : null;
      const restantes = cles.filter((c) => c !== champs.evAt && c !== champs.evStatus && typeof premier[c] === 'string');
      if (champs.evStatus === null && restantes.length === 2) {
        // sans champ de statut connu : celui qui est aussi cite avec une valeur
        // de statut de reservation l'emporte (lecture des paires, II).
        const pairesStatut = pairesChampValeur(prompt);
        const parlant = restantes.find((c) => pairesStatut.some((p) => p.champs.includes(c) && INDICES.TENU.test(p.valeur)));
        if (parlant !== undefined) champs.evStatus = parlant;
      }
      const types = cles.filter((c) => c !== champs.evAt && c !== champs.evStatus && typeof premier[c] === 'string');
      if (types.length === 1) champs.evType = types[0];
    }
    break;
  }
  if (champs.events === null) champs.events = depuisSignature('history');

  // erreur : `error` d'un exemple ok:false.
  const toutesPaires = pairesChampValeur(prompt);
  const estCode = (v) => /^[A-Z][A-Z0-9_]+$/.test(v);
  for (const e of exemples) {
    if (e.reponse.ok !== false || !estObjet(e.reponse.error)) continue;
    const cles = Object.keys(e.reponse.error);
    const parPaire = cles.find((c) => toutesPaires.some((p) => p.champs.includes(c) && estCode(p.valeur)));
    const parValeur = cles.find((c) => typeof e.reponse.error[c] === 'string' && estCode(e.reponse.error[c]));
    champs.code = parPaire ?? parValeur ?? null;
    if (champs.code !== null) {
      const autres = cles.filter((c) => c !== champs.code);
      champs.message = autres.length === 1 ? autres[0] : null;
      break;
    }
  }

  // Noms de champs connus : jamais pris pour une valeur.
  const nomsDeChamps = new Set();
  const collecter = (v) => {
    if (Array.isArray(v)) v.forEach(collecter);
    else if (estObjet(v)) for (const [k, x] of Object.entries(v)) {
      nomsDeChamps.add(k);
      collecter(x);
    }
  };
  for (const e of exemples) {
    collecter(e.requete);
    collecter(e.reponse);
  }
  for (const liste of Object.values(sig)) for (const c of liste) nomsDeChamps.add(c);

  const minuscule = (v) => /^[a-z][a-z0-9_]*$/.test(v);
  const pairesDe = (champ) => (typeof champ === 'string' ? toutesPaires.filter((p) => p.champs.includes(champ)) : []);
  const pDecision = [...new Set(Object.values(champs.decision))].flatMap(pairesDe);
  const pStatut = pairesDe(champs.status);
  const pEvStatut = champs.evStatus !== null && champs.evStatus !== champs.status ? pairesDe(champs.evStatus) : pStatut;
  const pCode = pairesDe(champs.code);
  const pType = pairesDe(champs.evType);

  const roles = (paires, liste, filtre) =>
    Object.fromEntries(liste.map((r) => [r, choisirRole(paires, r, filtre, nomsDeChamps)]));
  const valeurs = {
    decision: roles(pDecision, ['TENU', 'ATTENTE', 'ANNULE', 'REFUSE', 'ACCEPTE', 'CREE', 'TRANSFERE'], minuscule),
    statut: roles(pStatut, ['TENU', 'ATTENTE', 'ANNULE'], minuscule),
    statutEvenement: roles(pEvStatut, ['TENU', 'ATTENTE', 'ANNULE'], minuscule),
    code: roles(pCode, ['QUOTA', 'TROP_TARD', 'INTROUVABLE'], estCode),
    typeEvenement: roles(pType, ['MIGRE'], minuscule),
  };

  for (const [k, v] of Object.entries(champs)) {
    if (k === 'decision') continue;
    if (v === null) champs[k] = absent(`champ_${k}`);
  }

  return { champs, valeurs, exemples: exemples.length, signatures: sig, _provenance: provenance };
}

/* ─────────────────────────────────────────────── V. le candidat ecrit */

const REMPLACEMENTS = [
  ['    ecrireLigne({ id, ok: true, result });', '    ecrireLigne(__t69Succes(id, op, args, result));'],
  [
    "      ecrireLigne({ id, ok: false, error: { code: e.code, message: e.message } });",
    '      ecrireLigne(__t69Erreur(id, e.code, e.message));',
  ],
  [
    "      ecrireLigne({ id, ok: false, error: { code: 'INTERNAL', message: String(e?.message ?? e) } });",
    "      ecrireLigne(__t69Erreur(id, '__INTERNE__', String(e?.message ?? e)));",
  ],
];

function sourceV4Traduite() {
  let src = readFileSync(SOURCE_V4, 'utf8');
  if (src.startsWith('#!')) src = src.slice(src.indexOf('\n') + 1);
  for (const [avant, apres] of REMPLACEMENTS) {
    const n = src.split(avant).length - 1;
    if (n !== 1) throw new Error(`t69-derive : point de sortie de v4 introuvable ou ambigu (${n}) : ${avant.trim()}`);
    src = src.replace(avant, apres);
  }
  return src;
}

/** Bloc de traduction (execute dans le candidat). Les cles de ROLE_INTERNE
 *  sont les identifiants INTERNES de v4 ; seules les valeurs de __T69_P (lues
 *  dans le prompt) sont emises. */
const TRADUCTION = `
const ROLE_INTERNE = {
  decision: { confirmed: 'TENU', waiting: 'ATTENTE', cancelled: 'ANNULE', refused: 'REFUSE', accepted: 'ACCEPTE', created: 'CREE', transferred: 'TRANSFERE' },
  statut: { confirmed: 'TENU', waiting: 'ATTENTE', cancelled: 'ANNULE' },
  code: { QUOTA_EXCEEDED: 'QUOTA', CANCELLATION_TOO_LATE: 'TROP_TARD', NOT_FOUND: 'INTROUVABLE' },
  typeEvenement: { migrated: 'MIGRE' },
};
const __absent = (role) => '<absent-du-prompt:' + role + '>';
function __traduire(famille, interne, table) {
  const role = ROLE_INTERNE[famille][interne];
  if (role === undefined) return __absent(famille + ':' + String(interne).length);
  return table[role] ?? __absent(role);
}
function __t69Succes(id, op, args, result) {
  const C = __T69_P.champs;
  const V = __T69_P.valeurs;
  let r = {};
  if (op === 'read') {
    const v = result.value;
    if (v === null || v === undefined) r = { [C.value]: null };
    else {
      const o = { [C.status]: __traduire('statut', v.status, V.statut) };
      if (v.status === 'waiting' && typeof v.waiting_position === 'number' && !String(C.position).startsWith('<absent')) {
        o[C.position] = v.waiting_position;
      }
      r = { [C.value]: o };
    }
  } else if (op === 'balance') {
    r = { [C.balance]: result.balance };
  } else if (op === 'history') {
    r = {
      [C.events]: (result.events ?? []).map((e) => ({
        [C.evType]: __traduire('typeEvenement', e.type, V.typeEvenement),
        [C.evStatus]: __traduire('statut', e.status, V.statutEvenement),
        [C.evAt]: e.at,
      })),
    };
  } else if (op === 'fingerprint') {
    r = { [C.sha256 ?? '<absent-du-prompt:champ_sha256>']: result.sha256 };
  } else if (Object.prototype.hasOwnProperty.call(C.decision, op)) {
    r = typeof result.decision === 'string' ? { [C.decision[op]]: __traduire('decision', result.decision, V.decision) } : {};
  }
  return { id, ok: true, result: r };
}
function __t69Erreur(id, code, message) {
  const C = __T69_P.champs;
  const err = { [C.code]: __traduire('code', code, __T69_P.valeurs.code) };
  if (!String(C.message).startsWith('<absent')) err[C.message] = String(message);
  return { id, ok: false, error: err };
}
`;

/**
 * @param {{prompt: string, cwd?: string, fs?: unknown, path?: unknown, journal?: string}} entree
 * @returns {{relPath: string, content: string, params: object}}
 */
export function deriver({ prompt, journal }) {
  const params = deriverParametres(prompt);
  const content = [
    '#!/usr/bin/env node',
    '// candidate.mjs — candidat de reference de T69.A3, DERIVE du prompt recu par cette session',
    '// (acceptance/fixtures/claude-cli/t69-derive-reference-candidate.mjs). Comportement : v4',
    '// (acceptance/fixtures/candidates/f-long-reference-candidate-v4.mjs) ; vocabulaire et formes',
    '// emis : __T69_P ci-dessous, lu dans le prompt.',
    `const __T69_P = ${JSON.stringify(params)};`,
    "process.env.BENCH_DROP_RULE = '';",
    `process.env.BENCH_TRAFFIC_LOG = ${JSON.stringify(typeof journal === 'string' ? journal : '')};`,
    TRADUCTION,
    sourceV4Traduite(),
  ].join('\n');
  return { relPath: 'candidate.mjs', content, params };
}
