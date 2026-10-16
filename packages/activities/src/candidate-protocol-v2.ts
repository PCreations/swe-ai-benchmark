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
 * liste qui pourrait diverger. */
export interface CandidateProtocolExampleV2 {
  readonly op: string
  readonly args: Readonly<Record<string, unknown>>
  readonly result: Readonly<Record<string, unknown>>
}

export const CANDIDATE_PROTOCOL_EXAMPLES_V2: readonly CandidateProtocolExampleV2[] = [
  { op: 'create_tenant', args: { tenant_id: 'tenant-exemple' }, result: {} },
  { op: 'advance_clock', args: { to: '2000-01-01T00:00:00Z' }, result: {} },
  {
    op: 'write',
    args: { op: 'reserve', actor: 'acteur-exemple', tenant_id: 'tenant-exemple', admission_seq: 1, operation_key: 'cle-exemple' },
    result: { decision: 'exemple' },
  },
  { op: 'read', args: { tenant_id: 'tenant-exemple', key: 'acteur-exemple' }, result: { value: 'exemple' } },
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
 */
export function describeCandidateProtocolExamplesV2(): string {
  const lignes = CANDIDATE_PROTOCOL_EXAMPLES_V2.map((exemple, index) => {
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
 * — ce script REJOUE `CANDIDATE_PROTOCOL_EXAMPLES_V2` ci-dessus (une seule
 * source, jamais deux listes qui pourraient diverger) contre
 * `node candidate.mjs`, et ne vérifie QUE la FORME de la réponse (présence
 * des clés de `CANDIDATE_OPERATIONS_V2.reponse`), jamais une valeur
 * attendue par un contrôle — exactement la discipline qu'exige ADR-013. */
export const CANDIDATE_PROTOCOL_FORM_VERIFICATION_SCRIPT_FILENAME = 'verify-protocol-shape.mjs'

/** Sérialise les littéraux ci-dessus (contrat + exemples) pour qu'ils soient
 *  INCLUS dans le texte du script — un script PUBLIC, qui ne dépend d'aucun
 *  paquet de ce dépôt, lisible et relançable par le candidat lui-même, SANS
 *  jamais importer `@bench/activities`. */
export function buildCandidateProtocolFormVerificationScriptV2(): string {
  const operationsJson = JSON.stringify(CANDIDATE_OPERATIONS_V2)
  const examplesJson = JSON.stringify(CANDIDATE_PROTOCOL_EXAMPLES_V2)
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
