# ADR-013 — Un seul vocabulaire, et des exemples publics du protocole

    statut : ACCEPTÉ — par le mandant le 16/10/2026 (« Oui vasy fais tout en
             autonomie jusqu'à avoir un vrai résultat. Pas besoin de me
             demander », en réponse à « Je rédige cet ADR ? », la proposition
             décrite ci-dessous ayant été exposée dans le même message)
    ouvert : 16/10/2026
    porte  : l'énoncé de T53, le contrat `bench.candidate/2` (T50, T52), le
             prompt réel du pilote (T55)
    origine : troisième essai réel (docs/pilot/essai-reel-2026-10-16-b.json)

## Ce que le troisième essai réel a montré

56/56 tâches prouvées. Sur données réelles, la période 1 n'est plus contrôlée
que sur ses deux exigences dues, et le candidat emploie le vocabulaire attendu
(`confirmed`). Il obtient pourtant 0 contrôle satisfait sur 2 : il répond
`{ok, status: "confirmed", reservation_id}` là où le contrat attend
`{decision: "confirmed"}`.

Le candidat n'est pas en faute : **les deux textes du prompt se contredisent.**
L'énoncé (T53) dit « chaque réservation porte un *statut* » et nomme la clé
`idempotency_key` ; le contrat dit `write(…, operation_key) -> {decision}`.
T55.A3 ne pouvait pas le voir : son candidat de référence tire les **valeurs**
du prompt, mais ses **noms de champs** sont écrits en dur.

## Le défaut de fond

Chaque essai réel révèle un nouvel écart entre ce qu'on dit au candidat et ce
qu'on contrôle, et chacun coûte un cycle. Deux causes : deux textes rédigés
séparément pour dire la même chose, et un candidat qui n'a aucun moyen de
vérifier lui-même la forme de ses réponses avant d'être jugé.

## Décision

**Un seul vocabulaire.** Chaque nom de champ, d'argument ou de réponse que
l'énoncé cite est un nom du contrat, tiré de la même description exportée.

**Des exemples publics du protocole.** Le prompt montre, pour chaque
opération, un échange requête → réponse dans le format exact des messages.
Ces exemples fixent la *forme* ; ils ne révèlent aucune valeur attendue par
un contrôle de la période.

**Un vérificateur de forme dans l'espace de travail.** Un script public
rejoue ces exemples contre le candidat et signale tout écart de forme. Le
candidat peut le lancer ; il ne connaît pas les attentes des contrôles.

**Un candidat de référence qui tire aussi ses noms de champs du prompt.**

## Limite assumée

Les exemples montrent la forme des réponses, donc une partie du vocabulaire.
On l'accepte : le vocabulaire est déjà dans l'énoncé (T53), et les valeurs que
les contrôles comparent dépendent de l'enchaînement des opérations, que les
exemples ne reproduisent pas.

## Spécification de la tâche T56

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T56, et `bench spec-lint` le vérifie contre ce fichier.

**T56 — Un seul vocabulaire et des exemples publics du protocole**

Dépendances : T55. Livrables : énoncé de chaque période dont chaque nom de champ, d'argument et de réponse est un nom du contrat `bench.candidate/2` ; exemples publics requête → réponse pour chaque opération, inclus dans le prompt ; script public de vérification de forme écrit dans l'espace de travail du candidat.

Acceptation : `T56.A1` chaque nom de champ, d'argument ou de réponse cité par l'énoncé d'une période est un nom du contrat `bench.candidate/2`, et l'énoncé ne cite aucun autre nom de champ ; `A2` le prompt réel de chaque période contient, pour chaque opération du contrat, au moins un exemple de requête et de réponse au format exact des messages, et aucun de ces exemples ne reproduit une valeur attendue par un contrôle dû à cette période ; `A3` l'espace de travail de chaque période contient un script public qui rejoue ces exemples contre `node candidate.mjs` et signale chaque écart de forme, sans connaître les valeurs attendues des contrôles ; `A4` lancé par `bench pilot-conduct --provider claude-cli --live`, un candidat de référence dont les noms de champs et les valeurs proviennent du seul prompt reçu satisfait chaque contrôle dû à chaque période, et ce même candidat échoue si le prompt nomme un champ autrement que le contrat.

Commande : `pnpm verify:task T56`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
