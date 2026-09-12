// ─────────────────────────────────────────────────────────────────────────────
// @bench/storage — SQUELETTE de la persistance des événements et résultats dans
// PostgreSQL (cahier L255-L263, tâche T12).
//
// CE FICHIER N'IMPLÉMENTE RIEN, ET C'EST SON RÔLE.
//
// L'étage ROUGE exige que `acceptance/T12.spec.ts` échoue POUR LA RAISON
// ATTENDUE. `verification/runner/red.mjs` n'admet que deux formes de rouge —
// `ASSERTION_FAILED` et `STUB_NOT_IMPLEMENTED` — et refuse explicitement
// `MODULE_NOT_FOUND`, `TYPE_ERROR` et `SUITE_FAILED_TO_RUN` : « c'est la forme
// par défaut du TDD en monorepo TypeScript, elle ne dit rien de ce que le test
// vérifie ».
//
// CE QUI A ÉTÉ OBSERVÉ SANS CE FICHIER. `packages/storage` — le seul
// `source_path` que `verification/tasks.json` déclare pour T12 — n'existait pas.
// `specifiersFor('storage')` ne rendait aucun spécificateur, et les SIX cas
// tombaient tous sur la même assertion d'`assertLoaded()` :
//
//   « PAQUET-NON-CHARGEABLE paquet packages/storage : aucun spécificateur n'a
//     répondu »
//
// C'est un rouge qui ne prouve que l'absence d'un répertoire, pas ce que les six
// cas vérifient. Avec ce squelette le paquet se charge depuis la SOURCE, les
// rôles se résolvent, la suite APPELLE réellement les exports, et chaque cas
// échoue sur ce qu'il OBSERVE.
//
// LES SIX RÔLES, ET D'OÙ VIENNENT LEURS NOMS. Ils ne sont pas choisis ici :
// `acceptance/T12.spec.ts` §IV les nomme (nom primaire, puis une courte liste
// d'alias tolérés), et `verification/mutants/T12.json` reprend les sept
// conventions d'appel telles quelles. Les noms primaires sont retenus, sans
// alias : un alias est une tolérance de NOMMAGE du côté de la suite, jamais une
// invitation à en inventer un ici.
//
//   applyMigrations({ dsn })                  schéma central          (L257)
//   openStore({ dsn })                        repository              (L257)
//   closeStore(handle)                        arrêt observable        (L261 A1)
//   publishPeriodResult(h, env, opts?)        publication transac.    (L257)
//   readPeriodResult(h, { idempotency_key })  relecture               (L261 A1)
//   publishRetryLimit()                       la limite fixée         (L261 A6)
//
// POURQUOI AUCUN RÔLE NE REND UNE VALEUR « PLAUSIBLE ».
// T12 porte un cas de refus (A3) et deux cas d'absence (A4, A5), et
// `verification/mutants/T12.json` dit pourquoi la règle universelle du stub n'y
// vaut pas : « un stub qui lève rend le cas VERT : un programme mort refuse
// tout, y compris ce qu'il devrait accepter » ; et, pour les cas d'absence,
// « une implémentation qui n'écrit JAMAIS rien satisfait "aucun orphelin
// visible" et "aucun doublon" sans rien prouver ».
//
// Ces trois cas restent pourtant ROUGES ici, et pas par chance : chacun embarque
// un CONTRÔLE POSITIF que lever ne peut pas simuler. A3 exige d'abord qu'un
// rejeu à l'identique soit ACCEPTÉ (L68) ; A4 exige que la même publication,
// sans point d'injection, soit VISIBLE en base ; A5 exige que le commit ait bien
// EU LIEU avant la panne. Un squelette qui rendrait une valeur complaisante —
// un reçu vide, une relecture `null`, un profil supposé — verdirait au contraire
// ces moitiés-là à vide. Lever est donc la seule réponse honnête : elle ne
// simule ni acceptation ni refus.
//
// POURQUOI `publishRetryLimit` LÈVE AUSSI, PLUTÔT QUE DE RENDRE UN NOMBRE.
// La suite lit la limite au lieu de la coder en dur — L261 dit « selon une
// limite fixée » sans en donner la valeur — puis exige que le COMPORTEMENT la
// respecte exactement (`attempts == limite`). Publier ici un nombre choisi au
// hasard ferait passer les deux premières assertions d'A6 pour satisfaites alors
// qu'aucune boucle de reprise n'existe : ce serait annoncer une borne que rien
// ne borne, c'est-à-dire exactement ce que T12.M9 est chargé de tuer. La suite
// le dit dans ses propres termes : « une limite qui lève n'est pas une limite ».
// A6 échoue donc sur `LIMITE-DE-REPRISE-NON-PUBLIEE`, qui est vrai.
//
// `NotImplemented` vient de `@bench/contracts` et son message porte le préfixe
// `NOT_IMPLEMENTED` — un stub qui lèverait une `ContractViolation` se ferait
// passer pour la garde qu'il ne contient pas.
//
// Ce fichier disparaît quand T12 devient vert : aucun export public ne doit
// lever `NotImplemented` une fois les migrations, les repositories, l'outbox et
// la publication transactionnelle écrits.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/* ──────────────────────────────────────────────── formes, déclarées seulement */

/** Convention d'appel IV.1 : objet PLAT et STRICT (L80). */
export interface StoreTarget {
  readonly dsn: string
}

/**
 * Les six identifiants de L78, plus `period_index`. Déclarés, jamais validés
 * ici : la validation est celle de `@bench/contracts` (T02), pas du stockage.
 */
export interface PeriodIdentity {
  readonly campaign_id: string
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
  readonly repetition_id: string
  readonly budget_id: string
  readonly period_index: number
}

/**
 * Enveloppe de publication, convention d'appel IV.1 : `events` est la liste des
 * événements de domaine à écrire DANS LA MÊME TRANSACTION que le résultat
 * (L257 : « outbox et publication transactionnelle »).
 */
export interface PublishEnvelope {
  readonly idempotency_key: string
  readonly input_digest: string
  readonly identity: PeriodIdentity
  readonly result: Readonly<Record<string, unknown>>
  readonly events: readonly Readonly<Record<string, unknown>>[]
}

/**
 * POINTS D'INJECTION NOMMÉS (L141). Un livrable, pas une commodité de test :
 * sans eux, une panne « avant commit » ne serait pas reproductible.
 */
export type PublishFault =
  | 'BEFORE_COMMIT'
  | 'AFTER_COMMIT'
  | 'CONFLICT_ONCE'
  | 'CONFLICT_EVERY_ATTEMPT'

/**
 * Convention d'appel IV.3 et IV.4. `barrier` est attendue une fois par
 * tentative, après l'ouverture de la transaction et AVANT l'écriture décisive :
 * c'est ce qui permet à N appelants d'arriver au même point avant d'être
 * libérés ensemble (L141).
 */
export interface PublishOptions {
  readonly fault?: PublishFault
  readonly barrier?: () => Promise<void>
}

/** Convention d'appel IV.6 : la clé, et rien d'autre. */
export interface ReadQuery {
  readonly idempotency_key: string
}

/* ─────────────────────────────────────────────────────────── les six rôles */

/** Migrations du schéma central — les treize tables de L259 (L257). */
export function applyMigrations(_target: StoreTarget): never {
  throw new NotImplemented('storage.applyMigrations')
}

/** Ouverture d'un repository sur le schéma central (L257). */
export function openStore(_target: StoreTarget): never {
  throw new NotImplemented('storage.openStore')
}

/** Arrêt du repository — A1 exige qu'il soit OBSERVABLE, pas supposé (L261). */
export function closeStore(_handle: unknown): never {
  throw new NotImplemented('storage.closeStore')
}

/** Publication transactionnelle : résultat, événements et outbox (L257). */
export function publishPeriodResult(
  _handle: unknown,
  _envelope: PublishEnvelope,
  _options?: PublishOptions,
): never {
  throw new NotImplemented('storage.publishPeriodResult')
}

/** Relecture de l'enregistrement publié, ou vide si la clé est inconnue (L261). */
export function readPeriodResult(_handle: unknown, _query: ReadQuery): never {
  throw new NotImplemented('storage.readPeriodResult')
}

/**
 * La limite fixée de reprise sur conflit (L261, A6).
 *
 * Elle lève tant que la boucle de reprise n'existe pas : annoncer une borne
 * qu'aucun code ne respecte serait le nom d'une limite, pas une limite.
 */
export function publishRetryLimit(): never {
  throw new NotImplemented('storage.publishRetryLimit')
}
