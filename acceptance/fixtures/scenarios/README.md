# Fixtures de source de scénario — T06

Cahier L209, condition de fin de T06 : « un pack réservation quatre périodes est
compilable ». Ce dossier EST cette source, avec ses deux variantes fautives. Il
est en zone ACCEPTANCE (`verification/ownership.json`), écrit par le rôle
`test-author`.

Le cahier place les « cas figés » dans `fixtures/` (§C), mais
`verification/ownership.json` ne revendique pas cette racine : un chemin qu'aucune
zone ne réclame déclenche `UNCLAIMED_PATHS`. L'archive vit donc ici, où le rôle
qui écrit les tests peut la porter sans mêler une zone d'implémentation à une
zone de jugement.

| Fichier | Rôle | Cas |
|---|---|---|
| `reservation-4-periodes.json` | source VALIDE, quatre périodes, onze événements, sept exigences versionnées, neuf réponses client | A1, A2, A3, A4, A6 ; volet positif d'A5 |
| `invalide-cycle.json` | les deux probes de frontière de P3 se dépendent mutuellement | A5 |
| `invalide-dependance-pendante.json` | `EVT-P4-MIGRATION-LEGACY` dépend de `EVT-INEXISTANT-T06` | A5 |

Les deux variantes fautives ne diffèrent du pack sain **que** par le défaut
nommé : `acceptance/T06.spec.ts` les RÉPARE et exige l'égalité profonde avec
`reservation-4-periodes.json` avant d'asserter quoi que ce soit sur le refus.

## Contrat de forme

Une source est un objet `bench.scenario.source/1` portant `scenario_id`,
`corpus_provenance` (L24), `period_count` et `periods`. Chaque période porte :

- `period_index` (à partir de 1, L78) et `business_clock` (UTC ISO 8601, L80) ;
- `events[]` : `event_id`, `depends_on[]`, `sentinel`, `payload` ;
- `requirements[]` : les champs de `Requirement` (L88) — `requirement_id`,
  `version`, `key`, `capability_id`, `weight`, `due_at_period`, `replaces`,
  `criticality`, `source` ;
- `requirement_withdrawals[]` : les clés désactivées **à cette période** ;
- `customer_answers[]` : `question_id`, `answer`, `source_reference`, `sentinel`.

**La période de révélation d'un objet est celle qui le contient.** C'est ce qui
permet à D-2 (« une révélation de période k ne contient ni besoins, ni réponses
métier, ni tests privés de k+1 », L63) d'être une propriété observable : le
remplacement de `A@1` est déclaré par `A@2` en P3, et le retrait de `B@1` par la
période P4 elle-même — jamais par une annonce anticipée qui apprendrait à l'agent
en P1 ce qui doit lui arriver en P4.

## Sentinelles

Chaque événement, chaque exigence, chaque réponse client et chaque période porte
une sentinelle distincte, de la forme
`SENTINELLE-T06-P<k>-<ROLE>[-<n>]-<16 hexadécimaux>`. Il y en a 31, deux à deux
distinctes ; `acceptance/T06.spec.ts` le vérifie avant de s'en servir. La partie
hexadécimale est `sha256("bench.T06.sentinelle:<étiquette>")` tronquée à 16
caractères : elle est reproductible et ne peut pas apparaître par accident dans
une sortie.

La sentinelle d'un événement est écrite **deux fois** : sur l'événement et dans
sa charge utile. La première sert l'assertion d'ABSENCE (une fuite de la période
future se voit, quelle que soit la partie de l'objet qui a fuité) ; la seconde
sert l'assertion de PRÉSENCE (une charge utile métier est remise verbatim à
l'agent, ce qu'une reconstruction champ à champ des métadonnées ne garantit pas).

## Provenance des littéraux

Aucune valeur métier de ce dossier n'a été saisie à la main. Toutes sont LUES
dans `acceptance/reference/**`, racine gelée par `docs/FROZEN_ROOTS.json` :

- horloges des quatre périodes, créneau `S1`, locataire `legacy`, faits de P1 à
  P4, règle des 24 h et instant de la frontière : `F-RESERVATION` (cahier L119,
  L123, L125) ;
- identifiants et poids de `A@1`, `A@2`, `B@1`, `C@1`, et le retrait de `B@1` en
  P4 : `F-QUALITY` (cahier L109) ;
- `cancel@1`, `cancel@2`, `isolation@1` et leurs instants : `F-REGRESSION`
  (cahier L129).

Chaque entrée de `customer_answers` porte `source_reference.path`, le chemin
exact d'où sa valeur vient. `acceptance/T06.spec.ts` **re-résout ce chemin dans
la racine gelée** et exige que la fixture y soit conforme (première assertion
d'A3) ; la valeur attendue comparée à l'implémentation est celle de la racine
gelée, jamais le champ `answer` de ce dossier. Une dérive de cette archive est
donc rouge, et rouge en nommant l'écart.

Ce que le cahier ne fixe pas, et qui est donc libre ici : les `event_id`, les
`question_id`, les poids de `cancel@1`, `cancel@2` et `isolation@1`
(`F-REGRESSION` les déclare non fixés), la criticité et les valeurs de
sentinelle.

## Questions hors table

`acceptance/T06.spec.ts` sonde A4 avec `capacite_du_creneau_s2`,
`delai_minimal_avant_annulation_minutes` et
`tarif_de_la_reservation_en_micro_usd`. Aucune n'apparaît dans ce dossier — la
suite le vérifie. La deuxième est choisie pour être INFÉRABLE : une
implémentation qui « invente une règle » (L207) déduirait 1440 minutes des 24
heures publiées en P3, et A4 exige que cette valeur n'apparaisse pas.
