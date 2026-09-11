# swe-ai-benchmark

## La seule règle

    pnpm bench resume

**N'infère jamais l'avancement depuis une conversation** — ni depuis un résumé,
ni depuis un message d'assistant précédent, ni depuis ta propre mémoire, ni
depuis le champ `status` de `verification/tasks.json` (il est figé à
`NOT_IMPLEMENTED` et le validateur le rejette s'il dit autre chose).

Une tâche est terminée si et seulement si `bench resume` la marque `[H]`
(*proven at HEAD*). Cette décision est recalculée à chaque appel depuis les
objets git et les sondes de capacité du boot courant. Rien d'autre ne fait foi.

## Pourquoi

Le cahier (`docs/cahier.md`, épinglé par `docs/CAHIER_SHA256`) impose en §G
qu'aucune tâche ne soit déclarée terminée sans assertions réellement exécutées,
et en §K que l'agent relise le registre et les preuves à chaque reprise de
session plutôt que de déduire la réussite d'un résumé.

Ce dépôt rend cette discipline mécanique : `DONE` est **dérivé, jamais stocké**.

## Contrat de reprise

| Code de sortie | Signification |
|---|---|
| `0` | du travail actionnable reste — `bench resume` nomme la prochaine action |
| `2` | registre invalide (id inconnu, cycle, doublon, dépendance absente) |
| `3` | tout est prouvé à HEAD |
| `4` | divergence de ledger, ou preuves non poussées — **rien n'est durable tant que ce n'est pas poussé** |
| `11` | rien d'actionnable : tout est `BLOCKED`, `CONTESTED` ou `QUARANTINED` |

## Ce qui est interdit

- Éditer `acceptance/reference/**` après le gel (`docs/FROZEN_ROOTS.json`) sans
  ouvrir un `SPEC_CONFLICT`.
- Committer à la fois de l'implémentation et des tests/fixtures (règle des deux
  clés — le vérificateur marque `PROOF_TAINTED`).
- Remplacer un service réel déclaré dans `requires` par un mock pour clore une
  tâche bloquée. Un prérequis absent produit `BLOCKED`, jamais `PASS`.
- Affaiblir un cas d'acceptation : les cas requis et les empreintes d'assertions
  ne peuvent que croître.
