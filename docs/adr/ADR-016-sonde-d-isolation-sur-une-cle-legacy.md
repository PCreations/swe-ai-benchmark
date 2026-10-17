# ADR-016 — La sonde d'isolation lit la réservation d'un acteur de `legacy`

    statut : ACCEPTÉ — en vertu de la délégation du mandant du 16/10/2026
             (« Oui vasy fais tout en autonomie jusqu'à avoir un vrai
             résultat. Pas besoin de me demander »)
    ouvert : 17/10/2026
    porte  : traduction des actions scriptées vers `bench.candidate/2` (T51),
             contrôle `isolation@1`
    origine : troisième pilote réel (docs/pilot/pilote-reel-2026-10-17-c.json)

## Ce que le troisième pilote réel a montré

Sur Haiku 4.5 comme sur Sonnet 5.5, `reserve@1`, `idempotence@1`, `cancel@1`
et `fifo@1` sont satisfaits à chaque période où ils sont dus. `isolation@1`
échoue pour les deux en P4 — et ce n'est pas imputable aux candidats.

Dans le scénario scripté, l'usage `sonde-intertenant` est une lecture faite
**par** l'acteur `Z` du locataire `other`. La traduction vers le contrat
(`argsForAction`, `candidate-control-period.ts`) place l'acteur dans l'argument
`key` : le candidat reçoit `read(tenant_id: "other", key: "Z")`, la lecture
d'une clé que personne n'a jamais créée. Selon l'énoncé et l'exemple public,
une clé inconnue répond `{value: null}` ; c'est ce que les deux candidats ont
répondu. Le modèle attendu, lui, répond `NOT_FOUND` à toute lecture dans
`other`. Les deux candidats implémentent pourtant l'isolation : lire, depuis un
autre locataire, la clé d'un acteur de `legacy` renvoie chez eux `NOT_FOUND`.

Le cahier (F-RESERVATION, L119) dit : « ses acteurs ne peuvent ni lire ni
modifier les réservations `legacy` ». La sonde doit donc demander, depuis
`other`, la réservation d'un acteur de `legacy`.

## Décision

À candidat réel, la sonde d'isolation lit, depuis le locataire `other`, la clé
d'un acteur qui détient une réservation dans `legacy`. Le scénario scripté
(T11) n'est pas modifié : seule la traduction vers le contrat change.

## Spécification de la tâche T59

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T59, et `bench spec-lint` le vérifie contre ce fichier.

**T59 — Faire porter la sonde d'isolation sur une réservation de `legacy`**

Dépendances : T58. Livrables : traduction de la sonde d'isolation vers le contrat `bench.candidate/2` qui lit, depuis le locataire `other`, la clé d'un acteur détenant une réservation dans `legacy`.

Acceptation : `T59.A1` à candidat réel, la requête de la sonde d'isolation lit, depuis le locataire `other`, la clé d'un acteur qui détient une réservation dans `legacy` à cette période ; `A2` un candidat de référence qui répond `{value: null}` à une clé inconnue et une réponse d'erreur `NOT_FOUND` à la lecture, depuis un autre locataire, de la clé d'un acteur de `legacy` satisfait `isolation@1`, et un candidat qui divulgue la réservation de cet acteur la viole ; `A3` lancé par `bench pilot-conduct --provider claude-cli --live`, un candidat de référence dont la structure des réponses provient du seul prompt reçu satisfait chaque contrôle dû à chaque période, `isolation@1` compris.

Commande : `pnpm verify:task T59`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
