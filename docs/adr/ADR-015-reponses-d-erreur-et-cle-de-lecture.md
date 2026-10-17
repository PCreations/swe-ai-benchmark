# ADR-015 — Les réponses d'erreur et la clé de lecture, montrées au candidat

    statut : ACCEPTÉ — en vertu de la délégation du mandant du 16/10/2026
             (« Oui vasy fais tout en autonomie jusqu'à avoir un vrai
             résultat. Pas besoin de me demander »)
    ouvert : 17/10/2026
    porte  : exemples publics (T56, T57), énoncé (T53), contrôle `isolation@1`
    origine : second pilote réel (docs/pilot/pilote-reel-2026-10-17-b.json),
              58/58 prouvées

## Ce que le second pilote réel a montré

Sur un moteur entièrement prouvé, quatre contrôles sur cinq sont désormais
attribuables aux candidats : Sonnet 5.5 satisfait `reserve@1`,
`idempotence@1`, `cancel@1` et `fifo@1` à chaque période où ils sont dus.

Deux écarts restent imputables au moteur, au moins en partie :

**1. `isolation@1` n'est pas attribuable.** Le contrôle attend, pour une
lecture faite depuis un autre locataire, une **réponse d'erreur**
`{"id","ok":false,"error":{"code":"NOT_FOUND",…}}`. Aucun exemple public ne
montre une réponse d'erreur ; l'énoncé de P4 dit que toute tentative « renvoie
le verdict NOT_FOUND ». Sonnet a répondu `{"decision":"NOT_FOUND"}` — une
lecture raisonnable du mot « verdict ».

**2. Le sens de l'argument `key` de `read` n'est écrit nulle part.** Le moteur
y place l'identifiant de l'acteur ; seul l'exemple public le suggère
(`acteur-exemple-titulaire`). Haiku l'a lu comme la clé d'opération.

T57.A1 ne vérifiait que les formes de réponse réussies.

## Décision

Chaque réponse d'erreur que le modèle attendu peut produire a un exemple
public de cette forme exacte. L'énoncé dit, pour chaque règle qui se traduit
par une erreur, que la réponse est une réponse d'erreur et nomme le champ qui
porte le code. Le contrat et l'énoncé disent que l'argument `key` de `read` est
l'identifiant de l'acteur.

## Spécification de la tâche T58

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T58, et `bench spec-lint` le vérifie contre ce fichier.

**T58 — Montrer au candidat les réponses d'erreur et le sens de la clé de lecture**

Dépendances : T57. Livrables : exemples publics de chaque forme de réponse d'erreur que le modèle attendu peut produire ; énoncé qui décrit chaque règle produisant une erreur comme une réponse d'erreur dont le champ `error.code` porte la valeur ; contrat et énoncé qui disent que l'argument `key` de `read` est l'identifiant de l'acteur.

Acceptation : `T58.A1` pour chaque opération, chaque forme de réponse d'erreur que le modèle attendu peut produire a au moins un exemple public de cette forme exacte ; `A2` l'énoncé de chaque période où une règle produit une erreur la décrit comme une réponse d'erreur dont le champ `error.code` porte la valeur, et n'emploie pour elle ni le mot « verdict » ni le champ `decision` ; `A3` le contrat et l'énoncé disent que l'argument `key` de `read` est l'identifiant de l'acteur ; `A4` lancé par `bench pilot-conduct --provider claude-cli --live`, un candidat de référence dont la structure des réponses, erreurs comprises, provient du seul prompt reçu satisfait chaque contrôle dû à chaque période, `isolation@1` compris.

Commande : `pnpm verify:task T58`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
