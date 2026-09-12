// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE T06 — les quatre points d'entrée que `acceptance/T06.spec.ts`
// appelle, et rien d'autre. Aucune règle métier n'est écrite ici.
//
// POURQUOI CE FICHIER EXISTE AVANT TOUTE IMPLÉMENTATION.
// Sans lui, les six cas de T06 échouent sur `CONTRAT-NON-SATISFAIT`, c'est-à-
// dire sur l'absence d'un NOM — et `verification/runner/red.mjs` refuse ce
// rouge-là : un module introuvable est « la forme par défaut du TDD », elle ne
// dit rien de ce que la suite vérifie. Le squelette déplace l'échec sur les
// assertions qui portent le contrat.
//
// POURQUOI `NotImplemented` ET PAS UNE ERREUR MÉTIER.
// T06 porte trois cas de refus (A2, A4, A5) dont les codes attendus sont
// `NOT_RELEASED` et `UNSPECIFIED` (cahier L207). Un squelette qui lèverait l'un
// de ces deux codes se ferait passer pour la porte qu'il ne contient pas, et
// rendrait VERT un cas qui n'a rien observé — exactement le faux PASS que
// `verification/mutants/T06.json` nomme (« un stub qui lève rend le cas VERT
// sans rien prouver »). `NOT_IMPLEMENTED` ne contient ni `NOT_RELEASED` ni
// `UNSPECIFIED` : la recherche textuelle de codes de la suite ne peut pas le
// confondre avec un refus qualifié.
//
// CE QUE LE SQUELETTE NE FAIT PAS, ET C'EST LE POINT.
// Il ne lit pas sa source, ne compare aucune période à un curseur, ne consulte
// aucune table de réponses, ne résout aucun remplacement d'exigence. Les volets
// POSITIFS des six cas — le pack sain compile (A5), la révélation de k porte la
// sentinelle de k (A1), la question couverte et publiée est servie (A3, A4), la
// période déjà passée se relit (A2), les quatre jeux d'exigences actives (A6) —
// tombent donc tous, et c'est ce qui fait le rouge.
//
// Ce fichier disparaît quand T06 devient vert : aucun export public du paquet
// ne doit lever `NotImplemented` une fois les règles écrites.
// ─────────────────────────────────────────────────────────────────────────────
import { NotImplemented } from '@bench/contracts'

/**
 * Source de scénario soumise au compilateur, telle que l'archive de
 * `acceptance/fixtures/scenarios/` la porte. Volontairement opaque au
 * squelette : en typer la forme reviendrait à recopier ici le contrat que T06
 * doit encore écrire.
 */
export type ScenarioSource = Readonly<Record<string, unknown>>

/** Pack compilé. Opaque pour la même raison que `ScenarioSource`. */
export type ScenarioPack = Readonly<Record<string, unknown>>

/**
 * Compile une source de scénario en pack public/privé indexé par période
 * (cahier L205).
 *
 * @throws NotImplemented — T06 n'est pas implémentée.
 */
export function compileScenarioPack(_source: ScenarioSource): ScenarioPack {
  throw new NotImplemented('scenario.compileScenarioPack')
}

/**
 * Rend la vue disponible de la période `cible`. Le TROISIÈME argument est le
 * CURSEUR de révélation, positionnel : `cible > curseur` est une lecture
 * anticipée, et doit être refusée `NOT_RELEASED` (cahier L207). La convention
 * d'appel est fixée par `acceptance/T06.spec.ts` §III et par
 * `verification/mutants/T06.json` (T06.M2).
 *
 * @throws NotImplemented — T06 n'est pas implémentée.
 */
export function revealPeriod(_pack: ScenarioPack, _cible: number, _curseur?: number): unknown {
  throw new NotImplemented('scenario.revealPeriod')
}

/**
 * Répond à une question client à la période donnée : réponse disponible, refus
 * `NOT_RELEASED` si elle n'est pas encore publiée, refus `UNSPECIFIED` si elle
 * n'est couverte par aucune entrée de la table (cahier L207).
 *
 * @throws NotImplemented — T06 n'est pas implémentée.
 */
export function answerCustomerQuestion(
  _pack: ScenarioPack,
  _periode: number,
  _question: string,
): unknown {
  throw new NotImplemented('scenario.answerCustomerQuestion')
}

/**
 * Versions d'exigence actives à la période donnée — remplacements et retraits
 * résolus (cahier L88, F-QUALITY L109, F-REGRESSION L129).
 *
 * @throws NotImplemented — T06 n'est pas implémentée.
 */
export function activeRequirements(_pack: ScenarioPack, _periode: number): unknown {
  throw new NotImplemented('scenario.activeRequirements')
}
