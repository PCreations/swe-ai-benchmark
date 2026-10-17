// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — description UNIQUE, EXPORTÉE, du contrat
// `bench.candidate/2` (T52, ADR-010 L38-L44, L62 : « une description unique
// et exportée du contrat [...] convention de lancement et format des
// messages compris, dont dérivent le prompt et l'adaptateur »).
//
// POURQUOI UN FICHIER SÉPARÉ. Avant T52, le prompt d'une session
// (`./run-period-claude-cli.ts`, T50) tenait sa PROPRE traduction des six
// opérations (`OPERATIONS_V2`/`describeContractV2`) et ne disait RIEN de la
// mécanique de transport (comment le candidat sera lancé, quel signal de
// démarrage il doit émettre, la forme de l'enveloppe requête/réponse) ;
// l'adaptateur de contrôle (`./candidate-control-period.ts`, T51) attendait
// cette même mécanique, mais seulement par CONVENTION, jamais vérifiée contre
// le prompt (ADR-010, « Ce que la relecture a trouvé », points 3/4). Ce
// fichier fixe donc UNE SEULE fois :
//
//   - les six opérations métier (déjà fixées par acceptance/T50.spec.ts,
//     section III, PAR PARALLÉLISME avec `bench.candidate/1`/T48) ;
//   - la convention de lancement (ADR-010 L42-44) : le candidat livre son
//     point d'entrée à un chemin FIXE, `candidate.mjs`, à la racine de son
//     espace de travail ; le moteur le lance TEL QUEL, par
//     `node candidate.mjs`, depuis ce répertoire ;
//   - le format des messages (REPRIS À L'IDENTIQUE de acceptance/
//     T48.spec.ts, III.2, déjà prouvé par T48/T51) : signal de démarrage
//     `{"ready":true}`, requête `{id,op,args}`, réponse `{id,ok:true,result}`
//     ou `{id,ok:false,error:{code,message}}`.
//
// `./run-period-claude-cli.ts` (le prompt, T49/T50/T52) et
// `./candidate-control-period.ts` (l'adaptateur de lancement, T51/T52)
// importent TOUS DEUX ces constantes — jamais une copie locale — pour que
// A1 (T52) soit vrai PAR CONSTRUCTION : une seule valeur exportée, jamais
// deux descriptions qui pourraient diverger.
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidateOperationV2 {
  readonly op: string
  readonly args: readonly string[]
  readonly reponse: readonly string[]
}

/** Marqueur du contrat v2 (ADR-009 L44-51 ; acceptance/T50.spec.ts, III). */
export const CANDIDATE_PROTOCOL_MARKER_V2 = 'bench.candidate/2'

/** Les six opérations, dans cet ordre — REPRISES À L'IDENTIQUE de
 *  acceptance/T50.spec.ts (III), par parallélisme avec `bench.candidate/1`
 *  (acceptance/T48.spec.ts, III.3). */
export const CANDIDATE_OPERATIONS_V2: readonly CandidateOperationV2[] = [
  { op: 'create_tenant', args: ['tenant_id'], reponse: [] },
  { op: 'advance_clock', args: ['to'], reponse: [] },
  { op: 'write', args: ['op', 'actor', 'tenant_id', 'admission_seq', 'operation_key'], reponse: ['decision'] },
  { op: 'read', args: ['tenant_id', 'key'], reponse: ['value'] },
  { op: 'probe_cancel', args: ['tenant_id', 'key'], reponse: ['decision'] },
  { op: 'fingerprint', args: [], reponse: ['sha256'] },
]

/** Convention de lancement (ADR-010 L42-44, T52 — FIXÉE ICI) : le point
 *  d'entrée que la session doit produire, à la racine du dépôt dérivé. */
export const CANDIDATE_ENTRYPOINT_FILENAME = 'candidate.mjs'

/** La commande de lancement elle-même — l'adaptateur de contrôle (T51/T52)
 *  la lance TELLE QUELLE, CWD = le dépôt dérivé de la période contrôlée. */
export const CANDIDATE_LAUNCH_COMMAND: readonly string[] = ['node', CANDIDATE_ENTRYPOINT_FILENAME]
export const CANDIDATE_LAUNCH_COMMAND_TEXT = CANDIDATE_LAUNCH_COMMAND.join(' ')

/** Format des messages (REPRIS À L'IDENTIQUE de acceptance/T48.spec.ts,
 *  III.2, déjà prouvé par T48/T51) — jamais réinventé ici. */
export const CANDIDATE_READY_SIGNAL = '{"ready":true}'
export const CANDIDATE_REQUEST_SHAPE = '{"id","op","args"}'
export const CANDIDATE_RESPONSE_OK_SHAPE = '{"id","ok":true,"result"}'
export const CANDIDATE_RESPONSE_ERROR_SHAPE = '{"id","ok":false,"error":{"code","message"}}'

/**
 * La description complète — contrat métier ET mécanique de transport — telle
 * qu'énoncée au candidat dans le prompt d'une session (T50/T52, A1). Seule
 * fonction qui assemble ce texte : `./run-period-claude-cli.ts` ne construit
 * plus sa propre traduction.
 */
export function describeCandidateProtocolV2(): string {
  const lignes = CANDIDATE_OPERATIONS_V2.map((o) => `- ${o.op}(${o.args.join(', ')}) -> {${o.reponse.join(', ')}}`)
  return [
    `Contrat d'application ${CANDIDATE_PROTOCOL_MARKER_V2} : le processus candidat échangera, plus tard, exactement les opérations suivantes en JSON ligne à ligne sur son entrée et sa sortie standard (write.op vaut 'reserve' ou 'cancel') :`,
    ...lignes,
    `Convention de lancement : livre le point d'entrée de ce candidat au fichier \`${CANDIDATE_ENTRYPOINT_FILENAME}\` à la racine de ce dépôt ; le moteur le lancera tel quel, par \`${CANDIDATE_LAUNCH_COMMAND_TEXT}\`, depuis ce répertoire.`,
    `Signal de démarrage : dès que le processus est prêt à échanger, il doit écrire exactement une ligne JSON ${CANDIDATE_READY_SIGNAL} sur sa sortie standard, avant toute autre ligne.`,
    `Forme des requêtes : chaque requête arrive en JSON ligne à ligne sur l'entrée standard, de la forme ${CANDIDATE_REQUEST_SHAPE}.`,
    `Forme des réponses : chaque réponse s'écrit en JSON ligne à ligne sur la sortie standard, de la forme ${CANDIDATE_RESPONSE_OK_SHAPE} en cas de succès, ou ${CANDIDATE_RESPONSE_ERROR_SHAPE} en cas d'échec.`,
  ].join('\n\n')
}

/* ═══════════════════ ADR-013 : exemples publics du protocole (T56) ═══════
 * « Le prompt montre, pour chaque opération, un échange requête → réponse
 * dans le format exact des messages. Ces exemples fixent la forme ; ils ne
 * révèlent aucune valeur attendue par un contrôle de la période. » — chaque
 * valeur ci-dessous est un GABARIT sans portée métier (jamais un statut, un
 * code de refus ni une valeur que `@bench/oracle` pourrait comparer), pour
 * rester valable identiquement à N'IMPORTE QUELLE période (le contrôle ne
 * change jamais la FORME des messages, seulement les règles métier). Noms de
 * champs REPRIS de `CANDIDATE_OPERATIONS_V2` ci-dessus — jamais une seconde
 * liste qui pourrait diverger.
 *
 * ADR-014 (T57) : « quand une opération peut répondre sous plusieurs formes
 * (objet, valeur nulle, erreur), chacune a son exemple ». C'est le cas de
 * `read` : le modèle attendu renvoie `value` sous TROIS formes distinctes
 * (clés et types, récursivement) — une clé titulaire ou annulée (`{status}`,
 * une seule clé), une clé en file d'attente (`{status, waiting_position}`,
 * deux clés) ou une clé inconnue/sans effet (`null`). Les TROIS figurent donc
 * ci-dessous, chacune avec son propre exemple requête → réponse (incident
 * réel d'ADR-014 : un unique exemple `{"value":"exemple"}`, de forme chaîne,
 * ne montrait AUCUNE de ces trois formes).
 *
 * `minPeriodIndex` (optionnel) : la forme « en file d'attente » n'existe
 * QUE depuis que la file d'attente elle-même est une règle active — P2
 * (`./candidate-requirements-statement.ts#P2`, « une file d'attente [...]
 * s'applique désormais » : la MÊME période que celle où cette même règle
 * entre dans l'énoncé). L'inclure dès P1 ferait fuir, vers le prompt de P1,
 * le jeton `waiting` (sous-chaîne de la clé `waiting_position`) alors
 * qu'aucune règle de file d'attente n'est encore énoncée à P1 — exactement
 * la fuite qu'acceptance/T55.spec.ts#A1 (ACCEPTÉE, gelée) interdit (« ni
 * [...] une règle d'une période suivante »). `describeCandidateProtocolExamplesV2`
 * filtre donc, PAR PÉRIODE, les exemples dont `minPeriodIndex` dépasse la
 * période courante — jamais les DEUX autres formes de `read` (`status` seul,
 * `null`), valables identiquement à toute période. */
export interface CandidateProtocolExampleV2 {
  readonly op: string
  readonly args: Readonly<Record<string, unknown>>
  readonly result: Readonly<Record<string, unknown>>
  readonly minPeriodIndex?: number
}

/** P2 — voir le commentaire de `CandidateProtocolExampleV2.minPeriodIndex`
 *  ci-dessus : la file d'attente devient une règle active À PARTIR de P2. */
const FIFO_FORM_MIN_PERIOD_INDEX = 2

export const CANDIDATE_PROTOCOL_EXAMPLES_V2: readonly CandidateProtocolExampleV2[] = [
  { op: 'create_tenant', args: { tenant_id: 'tenant-exemple' }, result: {} },
  { op: 'advance_clock', args: { to: '2000-01-01T00:00:00Z' }, result: {} },
  {
    op: 'write',
    args: { op: 'reserve', actor: 'acteur-exemple', tenant_id: 'tenant-exemple', admission_seq: 1, operation_key: 'cle-exemple' },
    result: { decision: 'exemple' },
  },
  // Forme « titulaire ou annulée » de `read` : une seule clé, `status`.
  { op: 'read', args: { tenant_id: 'tenant-exemple', key: 'acteur-exemple-titulaire' }, result: { value: { status: 'exemple-statut' } } },
  // Forme « en file d'attente » de `read` : deux clés, `status` ET `waiting_position`.
  // `minPeriodIndex` : voir le commentaire ci-dessus.
  {
    op: 'read',
    args: { tenant_id: 'tenant-exemple', key: 'acteur-exemple-en-attente' },
    result: { value: { status: 'exemple-statut', waiting_position: 1 } },
    minPeriodIndex: FIFO_FORM_MIN_PERIOD_INDEX,
  },
  // Forme « clé inconnue ou sans effet » de `read` : valeur nulle.
  { op: 'read', args: { tenant_id: 'tenant-exemple', key: 'cle-exemple-inconnue' }, result: { value: null } },
  { op: 'probe_cancel', args: { tenant_id: 'tenant-exemple', key: 'acteur-exemple' }, result: { decision: 'exemple' } },
  { op: 'fingerprint', args: {}, result: { sha256: '0'.repeat(64) } },
]

/**
 * Le texte des exemples publics requête → réponse, un par opération, au
 * format EXACT des messages (`{"id","op","args"}` -> `{"id","ok":true,
 * "result"}`, repris à l'identique de `CANDIDATE_REQUEST_SHAPE`/
 * `CANDIDATE_RESPONSE_OK_SHAPE` ci-dessus — jamais une seconde forme de
 * sérialisation). Inclus dans le prompt RÉEL de chaque période
 * (`./run-period-claude-cli.ts`) : un vérificateur de forme public (voir
 * `buildCandidateProtocolFormVerificationScriptV2` ci-dessous) rejoue ces
 * MÊMES exemples contre le candidat.
 *
 * `periodIndex` (optionnel, 1-based) : filtre les exemples dont
 * `minPeriodIndex` dépasse cette période (voir le commentaire de
 * `CandidateProtocolExampleV2.minPeriodIndex` ci-dessus) — omis, TOUS les
 * exemples sont inclus (compatibilité des appelants qui ne connaissent pas
 * la période, et sens de ce texte pris isolément, hors du prompt réel d'une
 * période).
 */
export function describeCandidateProtocolExamplesV2(periodIndex?: number): string {
  const exemples = CANDIDATE_PROTOCOL_EXAMPLES_V2.filter(
    (e) => typeof periodIndex !== 'number' || e.minPeriodIndex === undefined || periodIndex >= e.minPeriodIndex,
  )
  const lignes = exemples.map((exemple, index) => {
    const id = `ex-${exemple.op}-${String(index + 1)}`
    const requete = JSON.stringify({ id, op: exemple.op, args: exemple.args })
    const reponse = JSON.stringify({ id, ok: true, result: exemple.result })
    return `${requete} -> ${reponse}`
  })
  return [
    `Exemples publics du protocole ${CANDIDATE_PROTOCOL_MARKER_V2} (requête → réponse, format exact des messages ${CANDIDATE_REQUEST_SHAPE} -> ${CANDIDATE_RESPONSE_OK_SHAPE}) : les valeurs ci-dessous sont des gabarits sans portée métier, choisis pour ne reproduire aucune valeur qu'un contrôle pourrait attendre à une période quelconque.`,
    ...lignes,
  ].join('\n')
}

/* ═══════════════════ ADR-013 : vérificateur public de forme (T56) ════════
 * « Un vérificateur de forme dans l'espace de travail. Un script public
 * rejoue ces exemples contre le candidat et signale tout écart de forme. Le
 * candidat peut le lancer ; il ne connaît pas les attentes des contrôles. »
 * — ce script REJOUE un exemple par opération (jamais une valeur attendue par
 * un contrôle — exactement la discipline qu'exige ADR-013) contre
 * `node candidate.mjs`, et ne vérifie QUE la FORME de la réponse (présence
 * des clés de `CANDIDATE_OPERATIONS_V2.reponse`), jamais la forme IMBRIQUÉE
 * ni une valeur métier.
 *
 * POURQUOI UN EXEMPLE PAR OPÉRATION, PAS TOUT `CANDIDATE_PROTOCOL_EXAMPLES_V2`
 * (T57). `CANDIDATE_PROTOCOL_EXAMPLES_V2` porte, pour `read`, TROIS exemples
 * (une forme par forme possible de `value`, ADR-014) — nécessaire au PROMPT
 * (`describeCandidateProtocolExamplesV2`, T57.A1 compare des FORMES), mais ce
 * script-ci ne compare QUE la présence de la clé top-level `value`, jamais sa
 * forme interne : les trois exemples y seraient redondants. Pire, la forme
 * « en file d'attente » embarque la clé `waiting_position`, dont la SOUS-
 * CHAÎNE `waiting` coïncide, par accident lexical, avec la valeur métier
 * `waiting` qu'un contrôle compare (acceptance/T56.spec.ts#A3, déjà ACCEPTÉE,
 * gelée : fuite détectée par simple inclusion de sous-chaîne, pas par jeton).
 * Ce script embarque donc, pour CHAQUE opération, le PREMIER exemple de
 * `CANDIDATE_PROTOCOL_EXAMPLES_V2` qui la concerne (`read` : la forme
 * « titulaire », une seule clé `status`, sans `waiting_position`) — toujours
 * un exemple RÉEL de cette même liste, jamais une valeur réinventée ici. */
export const CANDIDATE_PROTOCOL_FORM_VERIFICATION_SCRIPT_FILENAME = 'verify-protocol-shape.mjs'

function representativeExamplesForVerificationScript(): readonly CandidateProtocolExampleV2[] {
  const parOp = new Map<string, CandidateProtocolExampleV2>()
  for (const exemple of CANDIDATE_PROTOCOL_EXAMPLES_V2) {
    if (!parOp.has(exemple.op)) parOp.set(exemple.op, exemple)
  }
  return CANDIDATE_OPERATIONS_V2.map((o) => parOp.get(o.op)).filter((e): e is CandidateProtocolExampleV2 => e !== undefined)
}

/** Sérialise les littéraux ci-dessus (contrat + exemples) pour qu'ils soient
 *  INCLUS dans le texte du script — un script PUBLIC, qui ne dépend d'aucun
 *  paquet de ce dépôt, lisible et relançable par le candidat lui-même, SANS
 *  jamais importer `@bench/activities`. */
export function buildCandidateProtocolFormVerificationScriptV2(): string {
  const operationsJson = JSON.stringify(CANDIDATE_OPERATIONS_V2)
  const examplesJson = JSON.stringify(representativeExamplesForVerificationScript())
  return `#!/usr/bin/env node
// ${CANDIDATE_PROTOCOL_FORM_VERIFICATION_SCRIPT_FILENAME} — script PUBLIC de vérification de FORME
// (ADR-013, T56). Écrit par le moteur dans l'espace de travail du candidat à
// chaque période ; ce fichier ne connaît AUCUNE valeur attendue par un
// contrôle — il rejoue les exemples publics du protocole ${CANDIDATE_PROTOCOL_MARKER_V2}
// contre \`${CANDIDATE_LAUNCH_COMMAND_TEXT}\` et ne compare que la FORME de la
// réponse (les noms de clés que le contrat attend), jamais une valeur
// métier. Lancement : \`node ${CANDIDATE_PROTOCOL_FORM_VERIFICATION_SCRIPT_FILENAME}\`
// depuis la racine de ce dépôt — le candidat peut l'exécuter lui-même.
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const OPERATIONS = ${operationsJson};
const EXAMPLES = ${examplesJson};

function operationFor(op) {
  return OPERATIONS.find((o) => o.op === op) ?? null;
}

async function main() {
  const child = spawn('node', ['${CANDIDATE_ENTRYPOINT_FILENAME}'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = readline.createInterface({ input: child.stdout, terminal: false });
  const iterator = lines[Symbol.asyncIterator]();

  // Première ligne attendue : le signal de démarrage ${CANDIDATE_READY_SIGNAL}.
  await iterator.next();

  const ecarts = [];
  for (let i = 0; i < EXAMPLES.length; i += 1) {
    const exemple = EXAMPLES[i];
    const operation = operationFor(exemple.op);
    if (operation === null) continue;
    const id = 'verif-' + String(i + 1);
    child.stdin.write(JSON.stringify({ id, op: exemple.op, args: exemple.args }) + '\\n');
    const prochaine = await iterator.next();
    if (prochaine.done) {
      ecarts.push(exemple.op + ' : aucune reponse recue (process termine)');
      continue;
    }
    let reponse;
    try {
      reponse = JSON.parse(prochaine.value);
    } catch (e) {
      ecarts.push(exemple.op + ' : reponse non-JSON (' + String(prochaine.value).slice(0, 200) + ')');
      continue;
    }
    if (reponse.ok !== true) {
      ecarts.push(exemple.op + ' : ok !== true (' + JSON.stringify(reponse) + ')');
      continue;
    }
    const result = reponse.result !== null && typeof reponse.result === 'object' ? reponse.result : {};
    for (const cle of operation.reponse) {
      if (!(cle in result)) ecarts.push(exemple.op + " : cle de reponse manquante '" + cle + "' (vu " + JSON.stringify(result) + ')');
    }
  }
  child.stdin.end();
  child.kill();

  if (ecarts.length === 0) {
    process.stdout.write('FORME-OK : chaque exemple rejoue correspond a la forme attendue du contrat ${CANDIDATE_PROTOCOL_MARKER_V2}.\\n');
    process.exitCode = 0;
  } else {
    process.stdout.write('ECART(S)-DE-FORME :\\n' + ecarts.map((e) => '  - ' + e).join('\\n') + '\\n');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  process.stdout.write('ERREUR-VERIFICATEUR : ' + String(e && e.stack ? e.stack : e) + '\\n');
  process.exitCode = 1;
});
`
}
