# ADR-020 — Le prompt F-LONG donne le vocabulaire et les formes que le notateur compare

    statut : PROPOSÉ — rédigé le 24/10/2026, soumis au mandant
    ouvert : 24/10/2026
    porte  : prompt du pilote F-LONG (T62, T67, T66), notateur v4 (T68, T66)
    origine : sixième pilote réel, premier sur F-LONG
              (docs/pilot/pilote-reel-2026-10-24-f-long.json)

## Ce que le pilote F-LONG a montré

180 sessions réelles : 5 configurations, 12 périodes, 3 répétitions. Le
moteur était entièrement prouvé (69/69 à `4893946`). Résultat :

| Configuration | Séquences satisfaites |
|---|---|
| Sonnet 5.5 medium | 0 / 4680 |
| Haiku 5.5 | 503 / 4680 |
| Opus 5.5 medium | 0 / 4680 |
| Sonnet 5.5 xhigh | 0 / 4680 |
| Opus 5.5 xhigh | 0 / 4680 |

**Ce n'est pas une mesure des candidats.** Le prompt F-LONG
(`buildFLongPilotPrompt`) donne les noms des opérations et la forme de
l'enveloppe NDJSON. Il ne donne aucune des valeurs que le notateur compare :
- la décision d'une réservation en attente, `waiting` (le prompt dit seulement
  « attente ») ;
- la forme de la réponse de `read` (`{status, waiting_position}`) ;
- les codes d'erreur `QUOTA_EXCEEDED`, `CANCELLATION_TOO_LATE` et `NOT_FOUND` ;
- la forme de `balance` et de `history` (`{type, status, at}`).

Rejoué à la main, le même notateur donne 0/20 au code de Sonnet en P5 sur
`capacity@1`, parce que Sonnet répond `waitlisted` au lieu de `waiting`. Il
donne 20/20 à la fixture de référence. Les 503 séquences de Haiku viennent de
répétitions où il a employé `waiting` par hasard.

C'est le défaut que les ADR-013, 014 et 015 avaient corrigé pour F-RESERVATION
(un seul vocabulaire, un exemple public de chaque forme de réponse, un
candidat de référence dérivé du seul prompt). Cette discipline n'a pas été
reportée sur F-LONG. T66.A1 ne pouvait pas le voir : son candidat fixture
connaît le vocabulaire par construction. Et le rapport ne garde pas la raison
d'un échec, ce qui a rendu le diagnostic manuel.

## Décision

**1. Le vocabulaire.** L'énoncé de chaque période de F-LONG cite
littéralement, avec son nom de champ, chaque valeur que le notateur compare
pour une règle active à cette période : décisions, statuts, codes d'erreur.

**2. Les formes.** Pour chaque opération que le notateur juge, chaque forme de
réponse qu'il compare — succès et erreur, clés et types, récursivement — a au
moins un exemple public de cette forme exacte dans le prompt. Aucun exemple ne
reproduit une valeur attendue par une séquence.

**3. Le critère, mécanique.** Un candidat de référence qui tire ses noms de
champs, ses valeurs de vocabulaire et ses formes de réponse du seul prompt reçu
obtient un score de 1 sur chaque règle active à chaque période, lancé par
`bench pilot-conduct --provider claude-cli --live` avec le faux exécutable
`claude`.

**4. Le diagnostic.** Chaque période persistée garde, pour chaque règle notée
sous 1, la première étape non satisfaite d'au moins une séquence : opération,
attendu et réponse reçue.

## Spécification de la tâche T69

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T69, et `bench spec-lint` le vérifie contre ce fichier.

**T69 — Donner au candidat F-LONG le vocabulaire et les formes que le notateur compare**

Dépendances : T66. Livrables : énoncés F-LONG qui citent chaque valeur comparée par le notateur ; exemples publics de chaque forme de réponse jugée ; diagnostic des échecs persisté avec chaque période.

Acceptation : `T69.A1` pour chaque période de F-LONG, chaque décision, statut et code d'erreur que le notateur compare pour une règle active à cette période figure littéralement dans le prompt de la période, avec le nom du champ qui le porte ; `A2` pour chaque opération que le notateur juge, chaque forme de réponse qu'il compare, succès et erreur, a au moins un exemple public de cette forme exacte dans le prompt, et aucun exemple ne reproduit une valeur attendue par une séquence ; `A3` lancé par `bench pilot-conduct --provider claude-cli --live` avec le faux exécutable `claude`, un candidat de référence dont les noms de champs, les valeurs et les formes proviennent du seul prompt reçu obtient un score de 1 sur chaque règle active à chaque période ; `A4` chaque période persistée porte, pour chaque règle notée sous 1, l'opération, l'attendu et la réponse reçue de la première étape non satisfaite d'au moins une séquence.

Commande : `pnpm verify:task T69`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.

## Coût

Une tâche de plus, puis un nouveau pilote réel F-LONG : environ 15 heures
d'exécution sur l'abonnement du mandant pour les cinq configurations. Il peut
être réduit (une répétition, ou trois configurations) pour vérifier la
correction avant la campagne complète.
