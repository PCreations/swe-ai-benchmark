// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — description UNIQUE, EXPORTÉE, du contrat
// `bench.candidate/3` (T62, ADR-018 L184 : « contrat `bench.candidate/3`
// (opérations de F-LONG, dont la modification de capacité, le niveau, le
// solde, l'historique et le transfert) »).
//
// CE QUE CE FICHIER AJOUTE. `bench.candidate/2` (./candidate-protocol-v2.ts,
// T52) fixe déjà six opérations et toute la mécanique de transport (lancement,
// signal de démarrage, format NDJSON des messages) — REPRISE ICI À
// L'IDENTIQUE, jamais redéclarée séparément. `bench.candidate/3` AJOUTE cinq
// opérations, pour les règles actives à partir de P5 de F-LONG (ADR-018) :
//
//   set_capacity {tenant_id,slot_id,capacity} -> {decision}   (capacity@1, P5)
//   set_level    {tenant_id,actor,level}      -> {decision}   (priority@1, P6)
//   balance      {tenant_id,actor}            -> {balance}    (price@1, P7)
//   history      {tenant_id,key}              -> {events}     (history@1, P10)
//   transfer     {tenant_id,key,to_tenant_id} -> {decision}   (transfer@1, P12)
//
// Les noms de méthode eux-mêmes ne sont fixés par AUCUNE source (ADR-018 L184
// ne nomme que les CAPACITÉS, jamais un nom de méthode) : FIXÉS ICI, une seule
// fois, jamais une seconde liste qui pourrait diverger (même discipline que
// `CANDIDATE_OPERATIONS_V2`, T52).
// ─────────────────────────────────────────────────────────────────────────────
import {
  CANDIDATE_OPERATIONS_V2,
  CANDIDATE_PROTOCOL_MARKER_V2,
  CANDIDATE_REQUEST_SHAPE,
  CANDIDATE_RESPONSE_ERROR_SHAPE,
  CANDIDATE_RESPONSE_OK_SHAPE,
  type CandidateOperationV2,
} from './candidate-protocol-v2.js'

/** Marqueur du contrat v3 (ADR-018 L184 ; T62). */
export const CANDIDATE_PROTOCOL_MARKER_V3 = 'bench.candidate/3'

/** Les cinq opérations NOUVELLES de `bench.candidate/3` — FIXÉES ICI (voir l'en-tête). */
export const CANDIDATE_OPERATIONS_V3_NEW: readonly CandidateOperationV2[] = [
  { op: 'set_capacity', args: ['tenant_id', 'slot_id', 'capacity'], reponse: ['decision'] },
  { op: 'set_level', args: ['tenant_id', 'actor', 'level'], reponse: ['decision'] },
  { op: 'balance', args: ['tenant_id', 'actor'], reponse: ['balance'] },
  { op: 'history', args: ['tenant_id', 'key'], reponse: ['events'] },
  { op: 'transfer', args: ['tenant_id', 'key', 'to_tenant_id'], reponse: ['decision'] },
]

/** `bench.candidate/3` = les six opérations de `bench.candidate/2` PLUS ces cinq. */
export const CANDIDATE_OPERATIONS_V3: readonly CandidateOperationV2[] = [
  ...CANDIDATE_OPERATIONS_V2,
  ...CANDIDATE_OPERATIONS_V3_NEW,
]

/**
 * La description complète du contrat `bench.candidate/3` — mécanique de
 * transport REPRISE à l'identique de `bench.candidate/2` (jamais réénoncée),
 * onze opérations listées.
 */
export function describeCandidateProtocolV3(): string {
  const lignes = CANDIDATE_OPERATIONS_V3.map((o) => `- ${o.op}(${o.args.join(', ')}) -> {${o.reponse.join(', ')}}`)
  return [
    `Contrat d'application ${CANDIDATE_PROTOCOL_MARKER_V3} : prolonge ${CANDIDATE_PROTOCOL_MARKER_V2} (même mécanique de transport NDJSON, requête ${CANDIDATE_REQUEST_SHAPE} -> réponse ${CANDIDATE_RESPONSE_OK_SHAPE} ou ${CANDIDATE_RESPONSE_ERROR_SHAPE}) avec onze opérations au total :`,
    ...lignes,
  ].join('\n')
}
