// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE DE T11 — le pilote de période scripté, déclaré et non écrit.
//
// Étage ROUGE de T11. Aucune règle métier n'est ici : ni révélation rejouée, ni
// décision de fixture, ni validation, ni usage, ni métrique. Le seul rôle que ce
// fichier apporte est le NOM sous lequel `acceptance/T11.spec.ts` cherche le
// pilote, afin que les six cas échouent sur un APPEL RÉEL plutôt que sur
// l'absence d'un export.
//
// CE QUI A ÉTÉ OBSERVÉ AVANT, ET POURQUOI CE FICHIER EXISTE.
// `jest acceptance/T11.spec.ts` sur l'arbre propre : six cas rouges, tous sur la
// même assertion —
//
//   « ROLE-ABSENT runDemo : aucun des alias [runDemo, …, demo] n'est exporté par
//     packages/{domain,scenario,workload} »
//
// C'est un rouge qui ne prouve que l'absence d'un identifiant. Il ne dit rien de
// ce que A1..A6 vérifient, et `verification/runner/red.mjs` range explicitement
// cette famille (`MODULE_NOT_FOUND`) parmi les rouges qui ne sont pas des
// preuves : « c'est la forme par défaut du TDD, et elle ne dit rien de ce que le
// test vérifie ».
//
// POURQUOI `@bench/scenario` ET PAS `@bench/domain` NI `@bench/workload`.
// Le registre (`verification/tasks.json`) donne à T11 quatre `source_paths` :
// `apps/cli`, `packages/domain`, `packages/scenario`, `packages/workload`. La
// suite n'importe JAMAIS `apps/cli` — une entrée de commande qui s'exécute à
// l'import emporterait la suite entière — donc le rôle `runDemo` doit vivre dans
// l'un des trois paquets restants. Entre eux, le départage est celui des
// assertions DÉCISIVES :
//
//   A2 « remplacement de règle en P3 visible, ancienne règle retirée » et A6
//   « l'exigence isolation@1 est nommée en P4 » portent sur les EXIGENCES
//   ACTIVES d'une période et sur leur remplacement — ce que ce paquet possède
//   déjà, avec `activeRequirements` et `revealPeriod` (T06, L203-L210).
//
// Ce que les deux autres paquets fournissent reste chez eux : `@bench/domain`
// garde la machine à états de période et les métriques (T04, T05),
// `@bench/workload` garde l'horloge métier isolée et l'exécution des intentions
// (T08). Le pilote les ASSEMBLERA (L249) ; il ne les réécrit pas.
//
// POURQUOI LE STUB LÈVE, ET NE REND RIEN DE PLAUSIBLE.
// Rendre un objet vide, ou un résultat partiellement rempli, ferait passer les
// premières assertions de plusieurs cas (« un résultat a été rendu », « les
// champs L24 sont présents ») sans qu'aucune trajectoire n'ait été jouée : un
// vert partiel est précisément le faux PASS que §G interdit. Lever laisse chaque
// cas rouge sur son PREMIER contrôle, et le message porte le préfixe
// `NOT_IMPLEMENTED` — `verification/runner/red.mjs` n'admet comme rouge légitime
// que `ASSERTION_FAILED` et `STUB_NOT_IMPLEMENTED`, et un stub muet ne se
// distinguerait pas d'un échec accidentel dans un rapport.
//
// `NotImplemented` vient de `@bench/contracts` : un stub qui lèverait une
// `ContractViolation` se ferait passer pour la garde métier qu'il ne contient
// pas.
//
// Ce fichier disparaît, dans sa forme actuelle, quand T11 devient vert : aucun
// export public ne doit lever `NotImplemented` une fois le pilote écrit.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/**
 * Convention d'appel du pilote : un objet PLAT, et rien d'autre.
 *
 * `mode` et `storage` reprennent littéralement les deux drapeaux de la commande
 * de L247 (`bench demo --mode recorded --storage memory`). `variant` désigne la
 * trajectoire jouée ; son absence vaut trajectoire nominale. Les deux valeurs
 * que la suite emploie sont des littéraux du cahier : le nom de la fixture
 * `F-FAILURE` (L121) et le nom de variante `cross-tenant-read` (L251).
 *
 * Aucun champ n'est validé ici : la validation est celle du pilote, qui n'existe
 * pas encore. Déclarer la forme n'est pas la garder.
 */
export interface DemoOptions {
  readonly mode: string
  readonly storage: string
  readonly variant?: string | undefined
}

/**
 * Le pilote de période scripté de L247 — déclaré, non écrit.
 *
 * Il rendra la trajectoire verticale en mémoire : les quatre périodes dans
 * l'ordre de leurs horloges métier, leurs exigences actives et remplacées, leurs
 * dépenses et leurs métriques, l'historique métier, les contrôles métier nommés,
 * les métadonnées volatiles déclarées (L559) et la limite du jalon (L253).
 */
export function runDemo(_options: DemoOptions): never {
  throw new NotImplemented('scenario.runDemo')
}
