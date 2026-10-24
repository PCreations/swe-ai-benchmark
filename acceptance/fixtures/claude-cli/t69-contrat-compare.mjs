// acceptance/fixtures/claude-cli/t69-contrat-compare.mjs — zone ACCEPTANCE.
//
// FONCTIONS PURES d'acceptance/T69.spec.ts (A1, A2), isolees ici pour etre
// relisibles et rejouables hors de Jest. Aucune ne lit ni n'execute une source
// de T69 : elles recoivent les attentes (`expect`) que le MODELE ATTENDU
// exporte produit, et le texte du prompt reel.
//
// 1. CE QUE LE NOTATEUR COMPARE — une attente du modele attendu v4 a la forme
//    `{kind, ...}` (observee sur `generateDiscriminatingSequences`, livrable de
//    T68, et sur `ExpectedModelV4#apply`) :
//      {kind:'ok'}                         -> reponse de succes, `result` libre
//      {kind:'decision', decision}         -> `result: {decision}`
//      {kind:'value', value}               -> `result: {value}` (valeur exacte)
//      {kind:'balance', balance}           -> `result: {balance}`
//      {kind:'events'[, first]}            -> `result: {events: [...]}`, le
//                                             premier evenement portant les
//                                             cles de `first`
//      {kind:'error', code}                -> reponse d'erreur, `error.code`
//    Lecture du test-author, signalee comme telle : `first` designe le premier
//    element du tableau d'evenements (ADR-019 : « l'historique d'une
//    reservation, liste ordonnee d'evenements » ; ADR-018 P10 : « commence
//    par `migrated` »).
// 2. LES VALEURS COMPAREES (A1) — chaque feuille TEXTE d'une attente, hors
//    `kind`, qui est un jeton de vocabulaire (`[A-Za-z][A-Za-z0-9_]*`), avec
//    le nom de la cle qui la porte : `decision`, `status`, `code`, `type`...
//    Une date ou un identifiant libre n'est pas un jeton de vocabulaire.
// 3. LA FORME COMPAREE (A2) — cles et types, recursivement, valeurs exceptees ;
//    `ok` (vrai/faux) fait partie de la forme, puisqu'il separe succes et
//    erreur. L'enveloppe (`{id, ok, result}` / `{id, ok, error}`), `result` et
//    une valeur de `read` sont FERMES (memes cles exactement : `{status}` et
//    `{status, waiting_position}` sont deux formes distinctes) ; `error` et
//    l'element d'un tableau d'evenements sont OUVERTS (les cles comparees
//    doivent y etre, avec leur type ; `message`, `at` peuvent s'y ajouter —
//    ADR-019 fixe `{type, status, at}`, le notateur ne compare que `first`).

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const JETON = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Forme (fermee) d'une valeur JSON. */
export function formeDe(v) {
  if (v === null) return { t: 'null' };
  if (Array.isArray(v)) return { t: 'array', elem: v.length > 0 ? formeDe(v[0]) : null };
  if (estObjet(v)) {
    const keys = {};
    for (const k of Object.keys(v).sort()) keys[k] = formeDe(v[k]);
    return { t: 'object', keys, open: false };
  }
  if (typeof v === 'string') return { t: 'string' };
  if (typeof v === 'number') return { t: 'number' };
  if (typeof v === 'boolean') return { t: 'boolean' };
  return { t: 'any' };
}

const ouvrir = (f) => (f.t === 'object' ? { ...f, open: true } : f);

/** La forme de reponse NDJSON que le notateur compare pour une attente. */
export function formeAttendue(expect) {
  if (!estObjet(expect) || typeof expect.kind !== 'string') return null;
  if (expect.kind === 'error') {
    const keys = {};
    for (const [k, v] of Object.entries(expect)) if (k !== 'kind') keys[k] = formeDe(v);
    return {
      t: 'object',
      open: false,
      keys: { id: { t: 'string' }, ok: { t: 'false' }, error: { t: 'object', open: true, keys } },
    };
  }
  let result;
  if (expect.kind === 'ok') {
    result = { t: 'any' };
  } else {
    const keys = {};
    for (const [k, v] of Object.entries(expect)) {
      if (k === 'kind' || k === 'first') continue;
      keys[k] = formeDe(v);
    }
    if (expect.kind === 'events') {
      keys.events = { t: 'array', elem: estObjet(expect.first) ? ouvrir(formeDe(expect.first)) : null };
    } else if (!Object.prototype.hasOwnProperty.call(keys, expect.kind)) {
      keys[expect.kind] = { t: 'any' };
    }
    result = { t: 'object', open: false, keys };
  }
  return { t: 'object', open: false, keys: { id: { t: 'string' }, ok: { t: 'true' }, result } };
}

/** `v` a-t-elle la forme `f` ? */
export function formeConvient(v, f) {
  if (f === null || f === undefined) return false;
  switch (f.t) {
    case 'any':
      return v !== undefined;
    case 'string':
      return typeof v === 'string';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'true':
      return v === true;
    case 'false':
      return v === false;
    case 'null':
      return v === null;
    case 'array':
      return Array.isArray(v) && (f.elem === null || (v.length > 0 && formeConvient(v[0], f.elem)));
    case 'object': {
      if (!estObjet(v)) return false;
      for (const [k, fk] of Object.entries(f.keys)) {
        if (!Object.prototype.hasOwnProperty.call(v, k) || !formeConvient(v[k], fk)) return false;
      }
      return f.open || Object.keys(v).every((k) => Object.prototype.hasOwnProperty.call(f.keys, k));
    }
    default:
      return false;
  }
}

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (estObjet(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
}
export const cleCanonique = (v) => JSON.stringify(canon(v));

/** Lisible : `{id:string, ok:true, result:{value:{status:string}}}`. */
export function formeLisible(f) {
  if (f === null || f === undefined) return '?';
  switch (f.t) {
    case 'array':
      return `[${f.elem === null ? '…' : formeLisible(f.elem)}]`;
    case 'object':
      return `{${Object.entries(f.keys).map(([k, x]) => `${k}:${formeLisible(x)}`).join(', ')}${f.open ? ', …' : ''}}`;
    default:
      return f.t;
  }
}

/** Les valeurs de vocabulaire comparees par une attente, avec leur champ. */
export function valeursComparees(expect) {
  const out = [];
  const visiter = (v, champ) => {
    if (typeof v === 'string') {
      if (champ !== null && champ !== 'kind' && JETON.test(v)) out.push({ champ, valeur: v });
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) visiter(x, champ);
      return;
    }
    if (estObjet(v)) for (const [k, x] of Object.entries(v)) visiter(x, k);
  };
  visiter(expect, null);
  return out;
}

/** La reponse `reponse` satisfait-elle l'attente (memes valeurs comparees) ? */
export function satisfait(expect, reponse) {
  if (!estObjet(expect) || !estObjet(reponse)) return false;
  if (expect.kind === 'error') {
    return reponse.ok === false && estObjet(reponse.error) && reponse.error.code === expect.code;
  }
  if (reponse.ok !== true) return false;
  if (expect.kind === 'ok') return true;
  const r = reponse.result;
  if (!estObjet(r)) return false;
  if (expect.kind === 'events') {
    if (!Array.isArray(r.events)) return false;
    if (!estObjet(expect.first)) return true;
    const e0 = r.events[0];
    return estObjet(e0) && Object.entries(expect.first).every(([k, v]) => cleCanonique(e0[k]) === cleCanonique(v));
  }
  return Object.entries(expect)
    .filter(([k]) => k !== 'kind')
    .every(([k, v]) => cleCanonique(r[k]) === cleCanonique(v));
}

/**
 * Sondes du test-author pour les regles que le generateur v4 ne couvre pas
 * (P1 a P4) : des ETAPES ecrites ici, dont les ATTENTES sont celles que rend le
 * modele attendu exporte — jamais une valeur posee par cette suite.
 * @param {string} horloge instant d'ouverture de la periode (F-LONG.json gele)
 * @param {boolean} isolation isolation@1 active a cette periode
 */
export function sondes(horloge, isolation) {
  const t0 = Date.parse(horloge);
  const debut = new Date(t0 + 30 * 24 * 3_600_000).toISOString().replace('.000Z', 'Z');
  const A = 't69-sonde-a';
  const S = 't69-creneau';
  const etapes = [
    { op: 'advance_clock', args: { to: horloge } },
    { op: 'create_tenant', args: { tenant_id: A } },
    { op: 'create_slot', args: { tenant_id: A, slot_id: S, start: debut, capacity: 1, price: 0 } },
    { op: 'write', args: { op: 'reserve', actor: 'sonde-1', tenant_id: A, admission_seq: 1, operation_key: 't69-k1', slot_id: S } },
    { op: 'write', args: { op: 'reserve', actor: 'sonde-2', tenant_id: A, admission_seq: 2, operation_key: 't69-k2', slot_id: S } },
    { op: 'read', args: { tenant_id: A, key: 'sonde-1', slot_id: S } },
    { op: 'read', args: { tenant_id: A, key: 'sonde-2', slot_id: S } },
    { op: 'probe_cancel', args: { tenant_id: A, key: 'sonde-1', slot_id: S } },
    { op: 'write', args: { op: 'cancel', actor: 'sonde-2', tenant_id: A, operation_key: 't69-k3', slot_id: S } },
    { op: 'read', args: { tenant_id: A, key: 'sonde-2', slot_id: S } },
  ];
  if (isolation) {
    etapes.push({ op: 'create_tenant', args: { tenant_id: 't69-sonde-b' } });
    etapes.push({ op: 'read', args: { tenant_id: 't69-sonde-b', key: 'sonde-1', slot_id: S } });
  }
  return etapes.map((e, i) => ({ id: `t69-sonde-${i + 1}`, ...e }));
}

/** Indice, dans `sondes()`, de la seconde reservation (celle qui attend). */
export const SONDE_SECONDE_RESERVATION = 4;
