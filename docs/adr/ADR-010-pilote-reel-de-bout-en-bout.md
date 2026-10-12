# ADR-010 — Le pilote réel, de bout en bout

    statut : PROPOSÉ — en attente de la décision du mandant
    ouvert : 13/10/2026
    porte  : `pilot-conduct --provider claude-cli` (T49, T50), le contrôle
             du code candidat (T51), le contrat `bench.candidate/2`
    origine : relecture de T51 avant son acceptation

## Ce que la relecture a trouvé

T50 est prouvée ; T51 passe ses cinq cas. Pourtant le pilote réel ne
fonctionnerait toujours pas, parce qu'aucun cas, dans aucun ADR, n'exerce la
chaîne complète. Chaque pièce est vérifiée seule ; leur assemblage, jamais.

**1. Le pilote n'appelle pas le contrôle.** `pilot-conduct --provider
claude-cli` lance la session puis commit l'espace de travail
(`run-period-claude-cli.ts`). Le contrôle de T51 est une commande séparée,
`bench candidate-control-period`, que rien n'appelle.

**2. Le code contrôlé n'est pas celui que la session a écrit.** La session
écrit dans un répertoire dérivé de `--candidate-workspace-root`. Le contrôle
de T51 restaure son propre espace de travail depuis son préfixe S3 `t51/`.

**3. Le candidat ne sait pas comment il sera lancé ni comment répondre.** Le
prompt (T50) donne le nom de chaque opération et de ses champs. Il ne dit ni
quelle commande le moteur exécutera, ni le format des messages : signal de
démarrage `{"ready":true}`, requête `{id,op,args}`, réponse
`{id,ok,result|error}`. Ces conventions existent dans l'adaptateur ; un vrai
candidat ne peut pas les deviner.

**4. Deux descriptions du contrat.** Le prompt lit `OPERATIONS_V2`, privée à
`run-period-claude-cli.ts` ; l'adaptateur de T51 a sa propre traduction.
Elles concordent aujourd'hui, par accord et non par construction.

## Décision proposée

**Une seule description, exportée, complète.** Opérations, champs, réponses,
commande de lancement et format des messages : une seule valeur exportée,
dont le prompt et l'adaptateur dérivent tous deux.

**Une convention de lancement fixe.** Le candidat livre un exécutable à un
chemin fixé à la racine de son espace de travail ; le moteur le lance tel
quel, depuis ce répertoire. Le prompt l'énonce.

**Une période à candidat réel est une seule opération.** Session, commit,
puis lancement et contrôle du code de ce commit, dans le même espace de
travail. La période suivante repart de ce commit.

**Un test de bout en bout, sans appel réel.** Un faux `claude` placé en tête
du `PATH` écrit, pendant la « session », un candidat de référence conforme au
seul texte du prompt. La commande réelle du pilote doit alors produire les
statuts de contrôle de l'application scriptée. C'est ce test qui manquait.

## Spécification de la tâche T52

Format calqué sur le cahier. Ce bloc est la source verbatim de la carte de
spec de T52, et `bench spec-lint` le vérifie contre ce fichier.

**T52 — Conduire le pilote réel de bout en bout**

Dépendances : T49, T50 et T51. Livrables : une description unique et exportée du contrat `bench.candidate/2`, convention de lancement et format des messages compris, dont dérivent le prompt et l'adaptateur ; une période à candidat réel qui enchaîne la session, le commit, puis le lancement et le contrôle du code de ce commit dans le même espace de travail ; le rapport de fin qui réunit tokens et statuts de contrôle.

Acceptation : `T52.A1` le prompt d'une période et l'adaptateur dérivent d'une même description exportée, et le prompt énonce la commande de lancement, le signal de démarrage, la forme des requêtes et celle des réponses ; `A2` avec un faux `claude` qui écrit dans l'espace de travail un candidat de référence conforme au prompt, `bench pilot-conduct --provider claude-cli --live` persiste pour chaque période les statuts de contrôle de l'application scriptée nominale, et un candidat de référence fautif ceux de la variante fautive ; `A3` le code contrôlé à une période est exactement le commit de fin produit par la session de cette période ; `A4` la session de la période k+1 démarre dans l'espace de travail du commit de fin de la période k ; `A5` le rapport de fin donne, pour la même exécution, les tokens par modèle et par catégorie et les statuts de contrôle par période, égaux aux valeurs persistées.

Commande : `pnpm verify:task T52`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; aucun appel réel.
