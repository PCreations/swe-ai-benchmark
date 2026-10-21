# ADR-019 — Des créneaux dans le contrat, et des contrôles qui discriminent

    statut : PROPOSÉ — rédigé le 21/10/2026, soumis au mandant
    ouvert : 21/10/2026
    porte  : contrat du candidat (T62), contrôles générés (T64), pilote F-LONG
             (T66)
    origine : renforcement de T64.A3 par le test-author (45ccfd8)

## Ce que le renforcement de T64 a montré

Pour rendre T64.A3 non creux, le test-author a écrit un candidat de référence
fidèle à F-LONG (`acceptance/fixtures/candidates/f-long-reference-candidate.mjs`)
qui reproduit chaque fait gelé de `acceptance/reference-long/F-LONG.json`. Ce
travail a mis au jour deux défauts, que T62 et T64 satisfont pourtant à la
lettre.

**1. Le contrat `bench.candidate/3` ne désigne aucun créneau.** `write`,
`read`, `probe_cancel`, `history` et `transfer` n'ont pas d'argument
`slot_id`, et aucune opération ne crée de créneau (début, capacité, prix).
F-LONG compte pourtant huit créneaux, S1 à S8. Le notateur de T64 passe
l'identifiant de créneau dans `operation_key`, et le candidat de référence doit
le deviner : à partir de `slot_id`, puis de `operation_key`, puis par défaut
`S1`.

**2. Les séquences cachées ne discriminent pas.** Observées par leur trafic,
toutes les séquences, pour toutes les règles, créent un locataire, envoient
deux réservations et vérifient que la seconde attend. Aucune n'appelle
`set_capacity`, `set_level`, `balance`, `history` ni `transfer`. Une file
d'attente de capacité 1 obtient donc un score de 1 sur toutes les règles,
`price@1`, `quota@1` et `cancel@4` compris. La mesure qu'ADR-018 voulait large
est en réalité aveugle.

**3. Huit points d'ADR-018 laissés ouverts.** Le candidat de référence a dû
les trancher. Un candidat réel devrait les deviner de la même façon, et serait
alors jugé sur des choix qu'on ne lui a pas donnés :
- quelle réservation désignent `read`, `history`, `probe_cancel` et
  `transfer` quand seul l'acteur est donné ;
- le fuseau horaire des locataires autres que `legacy` ;
- si l'annulation reste permise à l'instant du début du créneau ;
- si le remboursement se calcule sur le montant payé ou sur le prix courant ;
- si `quota@1` s'applique à une promotion depuis la file d'attente ;
- si une réservation en attente peut être annulée ;
- les noms des champs d'un événement d'historique ;
- comment une réordonnance traite un confirmé rétrogradé en tête de file.

## Décision

**1. Un contrat `bench.candidate/4`.** Le contrat v3 ne change pas, car il est
prouvé par T62. La version 4 reprend les onze opérations de la version 3, avec
ces changements :
- `write`, `read`, `probe_cancel`, `history` et `transfer` portent un argument
  `slot_id` ;
- une nouvelle opération,
  `create_slot {tenant_id, slot_id, start, capacity, price} -> {decision}`,
  crée un créneau.

À partir de P1, la trajectoire principale crée chaque créneau par
`create_slot`, et les énoncés F-LONG passent à ce contrat.

**2. Les huit points sont tranchés, dans les énoncés et dans le modèle
attendu :**
- chaque opération qui vise une réservation la désigne par
  `(tenant_id, key, slot_id)` ;
- tous les locataires de F-LONG sont à l'heure de `Europe/Paris` ;
- l'annulation est permise strictement avant le début du créneau, et refusée
  avec `CANCELLATION_TOO_LATE` à partir du début ;
- le remboursement se calcule sur le montant effectivement débité ;
- sous `quota@1`, une promotion saute l'acteur qui détient déjà deux
  confirmés, et il reste en attente ;
- une réservation en attente peut être annulée, sans remboursement puisque
  rien n'a été débité ;
- un événement d'historique est `{type, status, at}` ;
- un confirmé rétrogradé garde la tête de la file jusqu'à la prochaine
  réordonnance imposée par une règle : changement de niveau sous
  `priority@1`, ou passage à `fifo@2`.

Ces choix modifient des faits qui ne sont pas gelés. Aucun fait gelé de
`F-LONG.json` ne change.

**3. Des séquences qui discriminent.** Les séquences d'une règle exercent
cette règle : elles appellent ses opérations, et placent ses frontières (prix,
échéances, quotas, ordre de file) là où une implémentation qui l'ignore se
trompe. Le critère, mécanique, est un candidat de référence privé de cette
seule règle.

## Spécification des tâches T67 et T68

Format calqué sur le cahier. Chaque bloc est la source verbatim de la carte
de spec de sa tâche, et `bench spec-lint` le vérifie contre ce fichier.

**T67 — Le contrat bench.candidate/4 : créneaux désignés et points tranchés**

Dépendances : T64. Livrables : contrat `bench.candidate/4` (onze opérations de `bench.candidate/3`, `slot_id` sur `write`, `read`, `probe_cancel`, `history` et `transfer`, opération `create_slot`) ; énoncés des douze périodes de F-LONG et modèle attendu qui tranchent les huit points d'ADR-019.

Acceptation : `T67.A1` le contrat `bench.candidate/4` porte `slot_id` sur `write`, `read`, `probe_cancel`, `history` et `transfer`, et l'opération `create_slot` avec `tenant_id`, `slot_id`, `start`, `capacity` et `price`, et chaque forme de réponse a un exemple public de cette forme exacte ; `A2` l'énoncé de chaque période où l'un des huit points d'ADR-019 s'applique l'énonce tel qu'ADR-019 le tranche ; `A3` le modèle attendu rejoué sur la trajectoire principale de F-LONG produit chaque fait de `acceptance/reference-long/F-LONG.json` ; `A4` le modèle attendu applique chacun des huit points tels qu'ADR-019 les tranche, chacun vérifié par une séquence qui le distingue de l'autre choix.

Commande : `pnpm verify:task T67`. Aucun service externe requis ; aucun appel réel.

**T68 — Des séquences cachées qui discriminent chaque règle**

Dépendances : T67. Livrables : génération de séquences par règle qui exercent les opérations et les frontières de cette règle, sur le contrat `bench.candidate/4`.

Acceptation : `T68.A1` pour chaque règle active à partir de P5, un candidat de référence qui implémente toutes les règles de F-LONG obtient un score de 1 sur chaque règle active à chaque période ; `A2` pour chaque règle active à partir de P5, le même candidat privé de cette seule règle obtient sur elle un score strictement inférieur à 1 ; `A3` les séquences de chaque règle appellent au moins une fois chaque opération que la règle introduit.

Commande : `pnpm verify:task T68`. PostgreSQL et le stockage objet sont requis ; aucun appel réel.

## Effet sur T66

T66 dépendra de T68 en plus de T65 : le pilote F-LONG ne sera pas lancé tant
que les contrôles ne discriminent pas.
