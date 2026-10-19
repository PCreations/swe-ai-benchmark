# SC-005 — Élargir le gel à une seconde racine, `acceptance/reference-long`

    statut : RESOLU — par l'ADR-018, accepté par le mandant le 19/10/2026
             (« Oui, j'accepte l'ADR-018, lance T61 sans me demander
             l'autorisation à chaque fois »)
    ouvert : 19/10/2026
    porte  : docs/FROZEN_ROOTS.json, verification/ownership.json (zone REFERENCE)

## Pourquoi un SPEC_CONFLICT

`docs/FROZEN_ROOTS.json` dit : « Le modifier après le gel exige un
SPEC_CONFLICT ouvert : il invalide les 44 attestations. » Ce document est
cette trace.

## Ce qui change

L'ADR-018 (Décision, point 1) fige les faits du scénario F-LONG dans une
nouvelle racine, `acceptance/reference-long`, distincte de la racine du cahier.
La déclaration **élargit** le périmètre gelé ; elle ne retire rien :

- `acceptance/reference` est inchangée, octet pour octet, et garde son oid ;
- `acceptance/reference-long` est ajoutée à la zone REFERENCE de
  `verification/ownership.json` (seul le rôle fixture-transcriber l'écrit) et
  déclarée dans `docs/FROZEN_ROOTS.json` avec l'oid constaté au commit du gel.

Les faits ont été transcrits d'ADR-018, ligne source par ligne source, et
recalculés indépendamment par le test-author de T61 : aucun désaccord.

## Effet

Toutes les attestations sont re-périmées par le changement de
`docs/FROZEN_ROOTS.json` et de `verification/ownership.json` ; elles sont
re-prouvées par `bench accept`, comme après tout changement de registre.
Toute modification ultérieure de `acceptance/reference-long` exige un nouveau
SPEC_CONFLICT.
