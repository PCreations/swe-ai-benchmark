# ADR-014 — La forme des réponses montrée au candidat est celle qu'on contrôle

    statut : ACCEPTÉ — en vertu de la délégation du mandant du 16/10/2026
             (« Oui vasy fais tout en autonomie jusqu'à avoir un vrai
             résultat. Pas besoin de me demander »)
    ouvert : 17/10/2026
    porte  : exemples publics et énoncé (T56), contrôles à candidat réel (T51)
    origine : premier pilote longitudinal réel (docs/pilot/pilote-reel-2026-10-17.json)

## Ce que le premier pilote réel a montré

Une trajectoire, quatre périodes, deux modèles (Haiku 4.5, Sonnet 5.5), sur
l'abonnement du mandant. Pour la première fois, les candidats satisfont des
contrôles : `reserve@1`, `idempotence@1` et `cancel@1` à chaque période pour
les deux ; `isolation@1` en P4 pour Sonnet, pas pour Haiku.

Mais **`fifo@1` échoue pour les deux modèles à chaque période, à cause du
moteur.** L'exemple public de `read` (T56) montre `{"value":"exemple"}` — une
chaîne — alors que le contrôle compare un objet `{"status":…,
"waiting_position":…}`. Sonnet a suivi l'exemple à la lettre et répondu
`{"value":"confirmed"}`. Ni l'énoncé ni le contrat ne décrivent la forme de
`value`.

## Décision

Pour chaque opération, la **forme** de chaque réponse que les contrôles
comparent — clés et types, récursivement, valeurs exceptées — est montrée au
candidat par un exemple de cette forme exacte ; quand une opération peut
répondre sous plusieurs formes (objet, valeur nulle, erreur), chacune a son
exemple. L'énoncé de chaque période décrit, pour chaque contrôle dû, la forme
qu'il compare.

## Spécification de la tâche T57

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T57, et `bench spec-lint` le vérifie contre ce fichier.

**T57 — Montrer au candidat la forme exacte des réponses contrôlées**

Dépendances : T56. Livrables : exemples publics dont chaque réponse a la forme exacte qu'emploie le modèle attendu, une par forme possible ; énoncé de chaque période décrivant la forme comparée par chaque contrôle dû.

Acceptation : `T57.A1` pour chaque opération du contrat, chaque forme de réponse que le modèle attendu peut produire — clés et types, récursivement, valeurs exceptées — est la forme d'au moins un exemple public, et aucun exemple n'a une forme que le modèle attendu ne produit jamais ; `A2` l'énoncé de chaque période décrit, pour chaque contrôle dû à cette période, la forme de la réponse qu'il compare, avec ses noms de champs ; `A3` lancé par `bench pilot-conduct --provider claude-cli --live`, un candidat de référence dont la structure des réponses provient des seuls exemples et énoncé reçus satisfait chaque contrôle dû à chaque période, `fifo@1` et `isolation@1` compris.

Commande : `pnpm verify:task T57`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
