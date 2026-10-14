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
