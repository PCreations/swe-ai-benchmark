# ADR-008 — Le candidat réel : une session `claude -p` par période

    statut : ACCEPTÉ — par le mandant le 07/10/2026 (« Oui », en réponse
             à « Tu acceptes ADR-008 tel quel ? »)
    ouvert : 05/10/2026
    porte  : `run-period` (phase DEVELOPING), `pilot-conduct` (fournisseur),
             le candidat de période (aujourd'hui une application scriptée),
             ADR-002 (unité), ADR-007 (pilote longitudinal)
    origine : décision du mandant — « Il ne faut pas passer par une clé mais
              par une session avec claude -p à chaque fois », puis « Oui » à
              la rédaction de cet ADR

## Ce que j'ai constaté avant de proposer quoi que ce soit

**1. Le moteur ne fait développer aucun vrai candidat.** Pendant une période,
le « candidat » est une application simulée en mémoire
(`createScriptedApplication`, `packages/scenario/src/demo-application.ts`),
que le moteur exerce puis contrôle face à l'oracle. Rien ne transforme le
travail d'un agent en une application déployée et exercée. C'est conforme au
cahier, qui garde le candidat scripté (L21, `recorded`) ; mais le pilote
longitudinal d'ADR-007 mesure donc une mécanique, pas un agent.

**2. Le seul accès à un vrai modèle passe par une clé.** `packages/agents`
appelle `POST /v1/messages` avec `x-api-key` (T28). Le mandant est au
forfait : il n'a pas de clé, et n'en veut pas.

**3. `pilot-conduct` refuse tout autre fournisseur que le faux**
(`packages/activities/src/pilot-conduct.ts`, « exige --provider fake »).

**4. La CLI est là, et authentifiée par l'abonnement.** Mesuré dans ce
conteneur : `claude` 2.1.289 ; `claude auth status` déclare
`authMethod: oauth_token`, `apiProvider: firstParty` ; aucune
`ANTHROPIC_API_KEY` définie.

**5. Ce que la documentation de Claude Code dit, et ce qu'elle ne dit pas.**
Relevé par un agent de documentation, chaque point avec sa source :

- **Priorité d'authentification** (`authentication.md`) : `ANTHROPIC_API_KEY`
  passe AVANT l'abonnement ; en mode `-p`, elle est utilisée sans demander.
  Une clé présente dans l'environnement ferait donc basculer en silence la
  facturation de l'abonnement vers l'API.
- **`--bare` ne lit pas le jeton OAuth** : il est donc exclu, bien qu'il eût
  été le moyen le plus simple d'isoler la session.
- **Sortie `--output-format json`** : un objet `result` portant `subtype`,
  `is_error`, `session_id`, `num_turns`, `usage` (`input_tokens`,
  `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`)
  et `modelUsage`, indexé par identifiant de modèle. **Une même session peut
  employer plusieurs modèles** (un plus petit pour des sous-agents).
- **Non documenté** : la ventilation de l'écriture de cache entre 5 min et
  1 h ; un `subtype` propre à l'épuisement du quota d'abonnement ; le schéma
  exact de la sortie CLI (déduit des types du SDK, pas publié comme tel).
- `--max-budget-usd` **ne s'applique pas** à l'authentification par
  abonnement.

## Décision proposée

**Une session neuve par période.** Chaque période lance un `claude -p` neuf,
sans persistance de session (`--no-session-persistence`). Le candidat n'a
donc aucune mémoire implicite d'une période à l'autre : sa mémoire est son
dépôt de code et ce que le moteur lui révèle. C'est la propriété longitudinale
que l'on veut mesurer — ce qu'un agent fait d'un code qu'il a écrit et ne se
rappelle pas avoir écrit.

**L'abonnement, et lui seul.** L'environnement de la session est expurgé de
`ANTHROPIC_API_KEY` et de `ANTHROPIC_AUTH_TOKEN`, et `claude auth status` est
lu avant la première session : une authentification par clé d'API refuse la
période avant tout appel. On ne laisse pas la facturation changer de nature
sans que personne le décide.

**Ce qu'on enregistre** : par période et par modèle déclaré dans `modelUsage`,
le modèle et ses tokens, dans les catégories d'ADR-002 — `input_fresh`
(`inputTokens`), `cache_read`, `output`, et l'écriture de cache. La durée de
cette écriture n'étant pas déclarée, ses tokens vont dans une catégorie
explicite **d'écriture non ventilée par durée**, jamais répartis entre
`cache_write_5m` et `cache_write_1h` : même discipline que T44.A4. Le champ
`total_cost_usd` est ignoré (ADR-002 : le token est l'unité ; au forfait, ce
montant ne correspond à aucune dépense). La sortie JSON brute est archivée.

**Échec fermé.** Tout ce qui n'est pas un `success` lisible — erreur
déclarée, sortie de forme inconnue, code de sortie non nul, quota épuisé —
laisse la période **non persistée**, avec la sortie brute conservée et un
motif nommé. La relance reprend cette période (T46.A2). Comme l'épuisement du
quota n'a pas de signal documenté, on ne cherche pas à le reconnaître : on le
traite comme tout autre échec, sans jamais le compter comme un résultat.

**Le candidat écrit du vrai code, que le moteur exerce.** Un dépôt git par
trajectoire, restauré au début de chaque période et sauvegardé à la fin. Un
contrat d'application : le moteur lance le code du candidat comme un
processus qui échange du JSON ligne par ligne sur l'entrée et la sortie
standard, avec les opérations de l'application scriptée (créer un locataire,
écrire, lire, sonder une annulation, rendre une empreinte). Un adaptateur fait
passer ce processus pour l'application scriptée auprès des contrôles
existants : les contrôles ne changent pas, seul ce qu'ils contrôlent devient
réel.

**Les vérifications n'appellent jamais la vraie CLI.** Un faux exécutable
`claude` placé en tête du `PATH` rend des sorties enregistrées. Le drapeau
`--live` est un consentement explicite à invoquer le `claude` du `PATH` :
sans lui, le fournisseur `claude-cli` est refusé. Les vérifications le passent
avec le faux exécutable ; l'essai réel, avec la vraie CLI, n'a lieu que sur
demande du mandant.

## Limites assumées — à dire, pas à masquer

- **Les outils du candidat ne tournent pas dans le sandbox de T19.** Claude
  Code exécute ses propres outils (lecture, édition, commandes) dans le
  répertoire de l'espace de travail, pas dans le conteneur isolé. Les outils
  autorisés sont restreints par `--allowedTools` et `--permission-mode
  dontAsk`, ce qui borne, sans isoler. Lancer `claude` dans le conteneur de
  T19 est possible plus tard ; ce n'est pas dans cet ADR.
- **Le temps n'est pas une mesure.** Les limites de débit de l'abonnement
  ralentissent une configuration sans rien dire de l'agent : la durée reste
  une métadonnée descriptive, jamais comparée.
- **La forme de la sortie est déduite, pas garantie.** Le premier essai réel
  enregistre une sortie authentique ; tant qu'il n'a pas eu lieu, les
  vérifications reposent sur la forme documentée par le SDK.
- **Aucun reçu indépendant.** Au forfait, il n'y a pas de facture : les
  tokens sont ceux que la session déclare. `LIVE_VALIDATED`, qui exige une
  facture (cahier:L26), reste non attestée, et c'est le statut correct.

## Où vivent ces tâches

Comme T44 à T46 : dans `verification/tasks.extensions.json` et
`verification/cases.extensions.lock.json`, avec cet ADR pour source épinglée.

## Spécification des tâches T47 à T49

Format calqué sur le cahier. Ces blocs sont la source verbatim des cartes de
spec de T47 à T49, et `bench spec-lint` les vérifie contre ce fichier.

**T47 — Lancer une période de candidat par une session `claude -p`**

Dépendances : T44. Livrables : adaptateur qui lance, pour une période, une session `claude -p` neuve dans l'espace de travail donné, avec le modèle de la configuration, et rend la sortie brute ainsi que l'usage par modèle ; refus avant tout appel si l'authentification déclarée est une clé d'API.

Acceptation : `T47.A1` chaque session est lancée avec `-p`, `--output-format json`, `--no-session-persistence` et le modèle de la configuration, dans le répertoire de l'espace de travail, et sans `ANTHROPIC_API_KEY` ni `ANTHROPIC_AUTH_TOKEN` dans son environnement, même lorsque l'appelant les définit ; `A2` pour chaque modèle déclaré par la session, l'usage rendu porte ce modèle et ses tokens `input_fresh`, `cache_read` et `output`, en entiers égaux à ceux que la session a déclarés ; `A3` des tokens d'écriture de cache dont la durée n'est pas déclarée sont conservés dans une catégorie explicite d'écriture non ventilée par durée, et aucune de leurs unités n'est attribuée à `cache_write_5m` ni à `cache_write_1h` ; `A4` une session terminée en erreur, une sortie illisible ou de forme inconnue, ou un code de sortie non nul produit un échec nommé qui conserve la sortie brute et ne rend aucun usage comme réussi ; `A5` si `claude auth status` déclare une authentification par clé d'API, la période est refusée avant toute session.

Commande : `pnpm verify:task T47`. Un faux exécutable `claude` placé en tête du `PATH` remplace la CLI ; aucun appel réel.

**T48 — Donner au candidat un espace de travail et un contrat d'application**

Dépendances : T11 et T23. Livrables : un dépôt git par trajectoire, restauré au début de chaque période depuis l'état persistant et sauvegardé à la fin ; un contrat d'application par lequel le moteur lance le code du candidat comme un processus et l'exerce avec les opérations de l'application scriptée ; un adaptateur qui présente ce processus aux contrôles existants comme l'application scriptée.

Acceptation : `T48.A1` la période k+1 d'une trajectoire part exactement du commit sauvegardé à la fin de la période k, relu depuis l'état persistant ; `A2` deux trajectoires ne partagent ni espace de travail ni commit écrit pendant une période ; `A3` une application de référence respectant le contrat, exercée par le moteur, obtient exactement les mêmes statuts de contrôle que l'application scriptée sur le même scénario ; `A4` un code candidat qui ne démarre pas, ne répond pas dans le délai ou viole le format du contrat est déclaré non déployé avec un motif nommé, sans que la période elle-même échoue ; `A5` la sonde d'annulation ne modifie pas l'état du code candidat, constaté par son empreinte avant et après.

Commande : `pnpm verify:task T48`. PostgreSQL et le stockage objet réels sont requis ; aucun appel de modèle.

**T49 — Conduire un pilote longitudinal avec un candidat réel**

Dépendances : T46, T47 et T48. Livrables : `run-period` et `pilot-conduct` acceptent le fournisseur `claude-cli` ; en phase DEVELOPING, une session T47 travaille dans l'espace de travail T48 sur les exigences révélées de la période ; les phases suivantes déploient, exercent et contrôlent le code produit ; un essai réel n'est déclenché que par un drapeau explicite.

Acceptation : `T49.A1` avec le fournisseur `claude-cli`, chaque période persistée référence la session qui l'a développée, sa sortie brute archivée, son commit de fin et son usage par modèle ; `A2` le prompt d'une période contient les exigences révélées de cette période et le contrat d'application, et ne contient ni les exigences des périodes suivantes ni les attentes de l'oracle ; `A3` une session en échec laisse la période non persistée, et la relance reprend cette même période, sans période dupliquée ni sautée ; `A4` le rapport de fin agrège les tokens du candidat par modèle et par catégorie, et chaque total égale la somme persistée correspondante ; `A5` avec le fournisseur factice, le comportement de T46 est inchangé ; `A6` sans le drapeau `--live`, le fournisseur `claude-cli` est refusé avec un motif nommé avant que la CLI soit invoquée.

Commande : `pnpm verify:task T49`. PostgreSQL, le stockage objet et le faux exécutable `claude` sont requis ; les vérifications passent `--live` avec ce faux exécutable en tête du `PATH`, et n'émettent aucun appel réel. L'essai réel est hors vérification : `bench pilot-conduct --provider claude-cli --live` avec la vraie CLI, déclenché par le mandant.
