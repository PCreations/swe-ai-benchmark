# ADR-012 — Les propriétés du pilote, vérifiées sur le chemin réel

    statut : ACCEPTÉ — par le mandant le 16/10/2026 (« oui », en réponse à
             « Tu retiens l'option A pour SC-004 et tu acceptes ADR-012 ? »)
    ouvert : 16/10/2026
    porte  : `bench pilot-conduct --provider claude-cli` et tout ce qu'il
             appelle (T49 à T54)
    origine : second essai réel (docs/pilot/essai-reel-2026-10-16.json)

## Ce que le second essai réel a montré

55/55 tâches prouvées. Sur données réelles :

- **Corrigé** : le rapport de fin agrège les tokens (T54.A1) ; l'écriture de
  cache est ventilée, 45 691 en écriture à 1 h (T54.A3).
- **Non corrigé** : la période 1 est encore contrôlée sur les cinq exigences.
  `controlIdsDueAt` (T54) filtre la commande `candidate-control-period`, pas
  `controlCandidateCommitOnce`, que le pilote appelle.
- **Non corrigé** : le candidat n'a pas reçu l'énoncé. `buildCandidatePeriodPrompt`
  (T53) n'est pas importé par `run-period-claude-cli.ts` ; le candidat a
  répondu `accepted` au lieu de `confirmed`.

## Le défaut de fond, pour la troisième fois

T52 (ADR-010) a introduit un test de bout en bout parce que les pièces étaient
vérifiées séparément. T53 et T54 ont été écrites après, et leurs cas ont de
nouveau été vérifiés sur leur propre pièce — le constructeur de l'énoncé, la
commande de contrôle — jamais sur le pilote. Chaque propriété du pilote réel
doit être vérifiée **à l'entrée du pilote**, par la vraie commande, avec le
seul modèle remplacé.

## Décision proposée

Brancher l'énoncé dans le prompt réel et le filtre dans le contrôle réel
(livrables déjà acceptés de T53 et T54), et vérifier chaque propriété du
candidat réel sur `bench pilot-conduct --provider claude-cli --live`, avec un
faux `claude` qui **enregistre le prompt qu'il reçoit**.

## Spécification de la tâche T55

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T55, et `bench spec-lint` le vérifie contre ce fichier.

**T55 — Vérifier les propriétés du pilote sur le chemin réel**

Dépendances : T52, T53 et T54. Livrables : le prompt réel du pilote construit à partir de l'énoncé de T53 ; le contrôle réel du pilote restreint aux exigences dues ; un faux `claude` qui enregistre le prompt reçu, et une suite qui vérifie chaque propriété du candidat réel par la commande du pilote elle-même.

Acceptation : `T55.A1` lancé par `bench pilot-conduct --provider claude-cli --live`, le prompt reçu par la session de chaque période contient l'énoncé de T53 de cette période et ne contient ni le champ `satisfied` ni une règle d'une période suivante ; `A2` à chaque période d'une exécution du pilote, les contrôles persistés sont exactement ceux des exigences dues à cette période ; `A3` avec un candidat de référence conforme au seul prompt reçu, chaque contrôle dû est satisfait à chaque période ; `A4` le rapport de fin d'une exécution du pilote dont une sortie brute contient des retours à la ligne et le caractère `|` agrège exactement l'usage persisté.

Commande : `pnpm verify:task T55`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
