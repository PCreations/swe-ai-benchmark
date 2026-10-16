# SC-004 — Le prompt contient-il les exigences révélées avec leur verdict ?

    statut : OUVERT — en attente de l'arbitrage du mandant
    ouvert : 2026-10-16
    porte  : T49.A2 (ADR-008) contre T53.A4 (ADR-011)
    origine : second essai réel (docs/pilot/essai-reel-2026-10-16.json) et
              lecture du chemin du pilote à `cf277a8`, 55/55 prouvées

## Les faits

`T49.A2` exige que le prompt d'une période contienne **exactement** la
sérialisation canonique des exigences révélées de cette période
(`acceptance/T49.spec.ts`, ~L1165 : `prompt.includes(JSON.stringify(canonique(exigencesP1)))`).
Ces exigences portent le champ `satisfied: true` — le verdict de
l'application scriptée.

`T53.A4` exige que le prompt « ne contient ni verdict de contrôle, ni le champ
`satisfied`, ni valeur attendue calculée ».

Les deux suites sont vertes aujourd'hui parce que l'énoncé de T53 n'est **pas
branché** dans le prompt réel du pilote : `run-period-claude-cli.ts` n'importe
pas `buildCandidatePeriodPrompt`. Dès qu'on l'y branche — ce que le livrable
de T53 exige (« inclus dans le prompt de la période ») — l'une des deux
tombe. Le second essai réel l'a montré : le candidat a répondu `accepted` au
lieu de `confirmed`, faute d'énoncé.

## Options

**A — Le prompt contient les exigences révélées sans champ de verdict.** La
suite de T49 compare le prompt à la sérialisation des exigences privées de
`satisfied` (et de tout champ de verdict). Le reste de T49.A2 est inchangé :
exigences de cette période présentes, période suivante absente, attentes de
l'oracle absentes. *Coût* : une relecture tracée d'une suite prouvée.

**B — T49.A2 l'emporte ; T53.A4 est retiré.** Interdit par la monotonie, et
le verdict de l'application scriptée continue de fuir vers le candidat.

## Recommandation

**A.** C'est la seule qui ne transmet pas au candidat le verdict qu'on va
ensuite lui opposer.
