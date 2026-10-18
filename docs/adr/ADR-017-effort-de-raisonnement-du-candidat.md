# ADR-017 — L'effort de raisonnement du candidat est une variable du manifeste

    statut : ACCEPTÉ — demandé par le mandant le 18/10/2026 (« Ajoute Opus
             5.5, effort medium et xhigh, et pareil pour Sonnet 5.5, effort
             medium et xhigh. Et remplace haïku par le nouveau modèle Haïku
             5.5 »)
    ouvert : 18/10/2026
    porte  : lancement réel du candidat (`launchClaudeCliPeriod`), manifeste
             et rapport de `bench pilot-conduct --provider claude-cli`
    origine : quatrième pilote réel (docs/pilot/pilote-reel-2026-10-18.json)

## Contexte

Le mandant veut comparer, à modèle égal, deux niveaux d'effort de
raisonnement (`medium` et `xhigh`) pour Opus 5.5 et Sonnet 5.5. La CLI
`claude` (2.1.302) expose `--effort <level>` avec les niveaux `low`, `medium`,
`high`, `xhigh` et `max`.

Aujourd'hui, le manifeste ne porte que `model.name`. Le moteur lance
`claude -p … --model <m>` sans effort : la CLI applique son défaut, que la
mesure ignore. Régler l'effort hors du moteur (variable d'environnement,
réglage utilisateur) laisserait une variable de l'expérience sans trace dans
les périodes persistées : deux campagnes différeraient sans que les données
disent en quoi.

## Décision

L'effort est un champ optionnel du manifeste, `model.effort`. Quand il est
présent, chaque invocation de la CLI pour la campagne reçoit `--effort
<niveau>`. Quand il est absent, aucun drapeau n'est passé et l'effort est
enregistré comme non spécifié. Une valeur hors de la liste est refusée avant
toute invocation et toute écriture. L'effort utilisé est persisté avec chaque
période et figure dans le rapport de la campagne.

## Spécification de la tâche T60

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T60, et `bench spec-lint` le vérifie contre ce fichier.

**T60 — Faire de l'effort de raisonnement du candidat une variable du manifeste**

Dépendances : T59. Livrables : champ optionnel `model.effort` du manifeste de `bench pilot-conduct --provider claude-cli`, transmis à chaque invocation de la CLI par `--effort` ; effort persisté avec chaque période et rapporté par la campagne.

Acceptation : `T60.A1` quand le manifeste porte `model.effort` égal à l'un de `low`, `medium`, `high`, `xhigh` ou `max`, chaque invocation de la CLI `claude` de la campagne reçoit `--effort` suivi de cette valeur, et quand il ne le porte pas, aucune invocation ne reçoit `--effort` ; `A2` une valeur de `model.effort` hors de cette liste est refusée avant toute invocation de la CLI et avant toute écriture en base, par une erreur qui nomme la valeur ; `A3` chaque période persistée à candidat réel et le rapport de `bench pilot-conduct` portent l'effort utilisé, et la valeur nulle quand le manifeste n'en porte pas.

Commande : `pnpm verify:task T60`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
