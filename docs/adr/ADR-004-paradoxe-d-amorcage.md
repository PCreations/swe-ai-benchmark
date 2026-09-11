# ADR-004 — Le paradoxe d'amorçage, et l'exception de zone qu'il impose

Statut : accepté · 11/09/2026.

## Le problème

`T00` livre « le vérificateur minimal ». `T01` rend le système de preuve non
contournable. Autrement dit : **les deux tâches construisent la machine qui les
atteste**. Aucune quantité d'ingénierie ne ferme ce cercle ; on peut seulement
en réduire le rayon et le déclarer.

Conséquence immédiate et concrète : la partition de zones range
`verification/runner/**` et `tools/**` dans `HARNESS`, écrivable par le seul
rôle `integrator`. Or l'implémenteur de T00 doit précisément y écrire, puisque
c'est le livrable. La règle, appliquée telle quelle, rendrait T00
inimplémentable.

## Décision

1. **Exception nommée, bornée à T00 et T01.** Leur rôle implémenteur peut écrire
   dans `HARNESS`. L'exception est inscrite ici et dans le registre, jamais
   improvisée au moment du commit.
2. **La règle des deux clés reste entière.** L'exception élargit les zones
   *écrivables*, elle ne touche pas à l'interdiction de mêler `IMPL` et une zone
   de jugement (`ACCEPTANCE`, `REFERENCE`, `MUTANT`, `GENERATOR`) dans un même
   commit. Le code et le test qui le juge restent séparés — c'est la protection
   qui porte réellement l'anti-biais, et elle n'est pas négociable.
3. **Les deux attestations portent la limitation en clair**, dans un champ
   `limitation`, jamais sous-entendue par un `PASS`.

## Ce qui réduit le rayon, sans le fermer

- Le tree oid de `verification/runner` est une composante **globale** de
  `input_digest` : toucher au vérificateur re-périme les 44 tâches, sous un diff
  qui nomme qui a changé les règles.
- Les auteurs de tests de T00/T01 travaillent **aveugles au runner** : ils
  dérivent le contrat des quatre issues depuis le cahier seul. Un test écrit en
  lisant l'implémentation décrirait ce qui est au lieu de vérifier ce qui doit
  être.
- `bench selftest` fabrique les conditions dangereuses et observe le
  comportement réel, au lieu d'affirmer sur papier.
- Deux auditeurs aveugles sont pointés sur le runner lui-même.

Aucun de ces quatre mécanismes ne ferme le cercle. Ils le rendent coûteux à
franchir et visible au diff.

## Limite assumée

`T00` et `T01` sont attestées par un dispositif qu'elles ont elles-mêmes
produit. Cette limitation est **portée explicitement dans leurs attestations**
et doit remonter jusqu'au rapport final : le socle ne peut pas prouver sa propre
correction, seulement rendre sa compromission détectable.
