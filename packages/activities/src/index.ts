// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE — @bench/activities : effets externes de l'admission des
// livraisons, de la migration protégée et de la reprise de bascule (cahier
// L337-L343, tâche T21).
//
// Étage ROUGE : aucune règle métier n'est écrite ici. Ni comparaison
// d'ensembles d'identités, ni décision d'admission, ni écriture au registre de
// coûts, ni arbitrage de bascule. Les trois rôles ci-dessous LÈVENT
// `NotImplemented` (@bench/contracts), dont le message porte le préfixe
// `NOT_IMPLEMENTED` que `verification/runner/red.mjs` sait lire.
//
// CE QUI A ÉTÉ OBSERVÉ AVANT. `packages/activities` — un des trois
// `source_paths` que `verification/tasks.json` déclare pour T21 (avec
// `packages/evaluation` et `packages/domain`, déjà matérialisés par T10 et
// T05) — n'existait pas. `specifiersForPackage('activities')` ne retrouvant ni
// manifeste ni `src/index.ts`, elle ne proposait que le spécificateur
// conventionnel `@bench/activities`, que le mappeur générique de
// `jest.config.mjs` réécrit vers `packages/activities/src/index.ts` — un
// fichier absent, donc `import(...) -> Cannot find module`. `LOADED.ok`
// restait néanmoins `true` (les deux autres paquets, déjà présents, se
// chargeaient), mais aucun des trois rôles `admitDelivery`,
// `runProtectedMigration`, `resumeDeploymentSwitch` ne se résolvait :
// `requireRole` échouait avec `ROLE-INTROUVABLE` pour chacun — un rouge qui ne
// prouve que l'absence du paquet, pas ce que les huit cas vérifient.
//
// LES TROIS RÔLES, ET D'OÙ VIENNENT LEURS NOMS. Ils ne sont pas choisis ici :
// la section III de l'en-tête de `acceptance/T21.spec.ts` les fixe (le cahier
// ne nomme aucun export pour T21), et `verification/mutants/T21.json` les
// cible par ce même nom primaire (« l'export d'admission des soumissions de la
// gestion de livraisons », « l'export `runProtectedMigration` », « l'export
// `resumeDeploymentSwitch` »). Noms primaires sans alias : la liste d'alias
// que la suite tolère est une tolérance de NOMMAGE côté appelant, jamais une
// invitation à en inventer un ici.
//
//   admitDelivery(input) -> Promise<AdmitDeliveryResult>
//       Décide ADMITTED/REJECTED selon la limite de tentatives
//       (SUBMISSION_LIMIT, L341), la protection des exigences actives
//       (F-REGRESSION, L129) et des invariants critiques (L341), publie une
//       ligne de coût dans `ledger_entries` sur `ledger_dsn` — MÊME quand le
//       verdict est REJECTED (D5, L65) — et calcule `deployment_coverage`,
//       `backlog` et `q` (rationnel exact, L143) quand la soumission est
//       admise.
//   runProtectedMigration(input) -> Promise<RunProtectedMigrationResult>
//       Éprouve `migration_sql` sur un CLONE JETABLE de `from_dsn` (jamais
//       d'abord sur `from_dsn`, L343), compare l'ensemble des identités
//       métier avant/après, et n'applique la migration pour de vrai sur
//       `from_dsn` que si rien n'a été perdu ; sinon `MIGRATION_REJECTED`
//       (L341, verbatim) et `from_dsn` reste octets pour octets inchangé.
//   resumeDeploymentSwitch(input) -> Promise<ResumeDeploymentSwitchResult>
//       Arbitre, après une panne entre préparation et bascule, entre
//       `prepared_version_id` (si `switch_committed`) et `active_version_id`
//       d'entrée (sinon) — une seule version active cohérente, jamais une
//       troisième valeur.
//
// CE QUE CE SQUELETTE NE PRÉTEND PAS FAIRE. Aucun des trois rôles ne rend de
// valeur plausible : chacun lève immédiatement. Les cas `refusal` de T21 (A2,
// A3, A5) restent ROUGES malgré tout, y compris leurs CONTRÔLES POSITIFS :
// `acceptance/T21.spec.ts` appelle chaque rôle à travers `essayer()`, note
// l'échec avec un message NOMMÉ (« TENTATIVE-1-EN-ECHEC »,
// « CONTROLE-MIGRATION-EN-ECHEC », etc.), et chaque cas échoue donc AVANT
// d'atteindre son assertion principale — pas un faux vert
// (`verification/mutants/T21.json` documente précisément pourquoi un stub qui
// lève ne peut PAS verdir un cas `refusal` : il ferait échouer le contrôle
// positif du même cas exactement comme le cas réel, ce qui est visible ici
// puisque TOUS les appels échouent, contrôle compris).
//
// Ce fichier ne redéclare aucun rôle de `packages/evaluation` ni
// `packages/domain` (T10, T05) : aucun fichier de ces paquets n'est touché par
// ce commit.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/* ══════════════════════ formes du contrat (section III de la suite) ═══════ */

/** Une exigence due à la période, section III.1 de `acceptance/T21.spec.ts`. */
export interface DueRequirement {
  readonly id: string
  readonly version: number
  readonly weight: number
  /** Déjà satisfaite par une soumission ADMISE antérieure, à cette version. */
  readonly prior_satisfied: boolean
}

/** Le candidat évalué par `admitDelivery`, section III.1. */
export interface DeliverySubmission {
  readonly artifact_digest: string
  readonly satisfied_requirement_keys: readonly string[]
  readonly preserved_invariant_ids: readonly string[]
  /** Entier exact (cahier D9, L63) : jamais un flottant monétaire. */
  readonly cost: number
}

/** Entrée de `admitDelivery`, section III.1. */
export interface AdmitDeliveryInput {
  readonly trajectory_id: string
  readonly period_index: number
  readonly attempt: number
  readonly due_requirements: readonly DueRequirement[]
  readonly critical_invariants: readonly string[]
  readonly ledger_dsn: string
  readonly submission: DeliverySubmission
}

/** Sortie de `admitDelivery`, section III.1. */
export interface AdmitDeliveryResult {
  readonly verdict: 'ADMITTED' | 'REJECTED'
  readonly reason?: string
  readonly deployment_coverage: 'NO_DEPLOYMENT' | 'PARTIAL' | 'ACCEPTED'
  readonly backlog: ReadonlyArray<{ readonly id: string; readonly version: number }>
  /** Rationnel exact (cahier L143) — `null` si aucune exigence due. */
  readonly q: { readonly num: number; readonly den: number } | null
}

/** Entrée de `runProtectedMigration`, section III.2. */
export interface RunProtectedMigrationInput {
  readonly from_dsn: string
  readonly read_identities_sql: string
  readonly migration_sql: string
}

/** Sortie de `runProtectedMigration`, section III.2. */
export interface RunProtectedMigrationResult {
  readonly verdict: 'MIGRATED' | 'MIGRATION_REJECTED'
  readonly reason?: string
  readonly record_count_before: number
  readonly record_count_after: number
}

/** Entrée de `resumeDeploymentSwitch`, section III.3. */
export interface ResumeDeploymentSwitchInput {
  readonly active_version_id: string
  readonly prepared_version_id: string
  readonly switch_committed: boolean
}

/** Sortie de `resumeDeploymentSwitch`, section III.3. */
export interface ResumeDeploymentSwitchResult {
  readonly active_version_id: string
}

/* ══════════════════════════════════ rôles ══════════════════════════════════ */

/** Admission d'une soumission de livraison (L341 A3/A4/A5/A7/A8). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function admitDelivery(_input: AdmitDeliveryInput): Promise<AdmitDeliveryResult> {
  throw new NotImplemented('activities.admitDelivery')
}

/** Migration éprouvée sur copie avant bascule réelle (L341 A1/A2, L343). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function runProtectedMigration(
  _input: RunProtectedMigrationInput,
): Promise<RunProtectedMigrationResult> {
  throw new NotImplemented('activities.runProtectedMigration')
}

/** Reprise d'une bascule interrompue par une panne (L341 A6). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function resumeDeploymentSwitch(
  _input: ResumeDeploymentSwitchInput,
): Promise<ResumeDeploymentSwitchResult> {
  throw new NotImplemented('activities.resumeDeploymentSwitch')
}
