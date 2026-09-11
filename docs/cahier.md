**Cahier de délégation — Implémentation du benchmark longitudinal de développement logiciel par IA**

Version 1.0 — 11 septembre 2026. Destinataire : agent chargé de l’implémentation. Ce document spécifie le travail à réaliser ; le moteur et les commandes décrits ne sont pas encore implémentés. Les validations annoncées sont les conditions d’acceptation futures, pas des tests déjà exécutés sur un produit existant.

Ce cahier opérationnalise le protocole du 10 septembre 2026. Il est autonome pour construire une première version du moteur. Il comporte 44 tâches, T00 à T43, avec dépendances, livrables, cas déterministes et preuves de fin. Les cas de réservation et montants sont des données de test fictives ; aucune mesure sur un modèle réel n’est fournie.

**A. Mission à transmettre à l’agent**

Construis un moteur capable de faire évoluer plusieurs applications indépendantes selon des besoins révélés progressivement, de les soumettre à des usages simulés, de conserver leurs états et de mesurer leurs coûts et leur qualité. Respecte les contrats de ce document. Travaille par tâches vérifiables ; une tâche n’est terminée que si son contrôle et ceux de ses dépendances réussissent sur le commit livré.

Commence par T00. À chaque tâche : lis ses dépendances, matérialise les fixtures indiquées, rends le test d’acceptation rouge pour la raison attendue, implémente, exécute le contrôle ciblé, puis écris le rapport de preuve. Les changements purement documentaires se vérifient par schémas, références et commandes, sans inventer de test comportemental sans objet.

N’invente ni credentials, ni résultats réels, ni tarifs courants. Les décisions de conception non précisées ici peuvent être résolues sans interrompre le travail ; consigne-les dans un ADR. Toute modification d’un résultat attendu, d’une règle scientifique ou de la séparation d’accès exige une modification explicite et tracée de ce cahier, jamais l’assouplissement silencieux d’un test.

La plateforme doit pouvoir s’exécuter sans intervention humaine dans les trajectoires. Les appels de développement et de génération passent par des interfaces substituables. Les workflows, vérifications critiques et statistiques sont des programmes déterministes.

**B. Deux modes, et trois états de livraison**

| Mode | Source des décisions des agents | Objet de la validation |
| --- | --- | --- |
| `recorded` | Agent scripté, réponses et coûts fictifs archivés | Prouver le comportement du moteur sur des entrées connues |
| `live` | Fournisseur réel explicitement configuré | Mesurer des résultats stochastiques, sans exiger un code ou un score prédéfini |

Les résultats portent toujours `execution_mode`, `cost_origin` et `corpus_provenance`. Un rapport réel ne peut contenir des coûts fictifs sans être rejeté. Les tests ordinaires n’appellent aucun fournisseur externe. Les erreurs techniques et résultats métier sont des champs distincts, conformément aux enums de E.

États à publier séparément : `CORE_VERIFIED` après T38 ; `PILOT_READY` après T39 et T40 ; `HANDOFF_COMPLETE` après T43. `LIVE_VALIDATED` est une attestation supplémentaire, seulement si un smoke test réel a effectivement été exécuté avec modèle, date, budgets et factures identifiés. Aucune de ces attestations ne signifie qu’une étude scientifique confirmatoire a été menée.

Un défaut de prérequis produit `BLOCKED`, jamais `PASS`. Une vraie IA qui échoue à développer produit un résultat candidat `FAILED` dans une exécution du moteur éventuellement valide. Ne pas confondre ces deux niveaux.

**C. Socle technique et frontières**

Décisions de départ : TypeScript en mode strict, Node.js LTS compatible avec le SDK Temporal retenu, pnpm, PostgreSQL 18, stockage compatible S3, Temporal, Jest pour TypeScript, Python 3.12 et pytest pour l’analyse. T00 choisit et verrouille les versions exactes compatibles ; elles ne sont pas remplacées par `latest` à chaque exécution. Les images sont enregistrées avec leur digest. L’agent ne doit pas changer de framework pour éviter une assertion.

Le cœur métier ne dépend ni de Temporal, ni de Docker, ni d’un SDK fournisseur. Les interfaces sont implémentées par adaptateurs. Le premier pilote traite une API métier ; une interface graphique n’est pas un prérequis de livraison du moteur.

| Chemin proposé dans le dépôt à créer | Responsabilité |
| --- | --- |
| `packages/contracts` | Schémas de messages, identités, manifeste, unités et erreurs |
| `packages/domain` | Transitions de période, versionnement des exigences, métriques pures |
| `packages/scenario` | Compilation, validation et révélation des scénarios |
| `packages/oracle` | Modèle métier indépendant et vérification des observations |
| `packages/workload` | Horloge métier, intentions et perturbations |
| `packages/storage` | PostgreSQL, artefacts, snapshots et migrations de la plateforme |
| `packages/billing` | Réservations, facturation et réconciliation |
| `packages/gateway` | Passerelle modèles, outils, quotas et journal d’appel |
| `packages/agents` | Agent scripté et adaptateurs réels |
| `packages/sandbox` | Provisionnement, isolation, exécution et arrêt |
| `packages/evaluation` | Validation des livraisons, audits et incidents |
| `packages/activities` | Effets externes des workflows |
| `packages/workflows` | Orchestration Temporal déterministe |
| `apps/cli` | Commandes de campagne et de vérification |
| `analysis` | Agrégats, bootstrap, décision et dimensionnement |
| `fixtures` | Cas figés ; sous-dossiers publics, privés et attaques de test |
| `acceptance` | Scénarios d’acceptation et résultats attendus indépendants |
| `verification` | Registre des tâches, scripts et rapports de preuve |
| `infra` | Composition locale, images, profils de ressources |
| `docs` | ADR, guide de lancement et contrat de délégation |

Utiliser un petit dépôt cohérent plutôt que 44 microservices. Les paquets définissent des frontières logiques. Seuls les composants ayant besoin d’identités, permissions ou ressources distinctes doivent être des processus séparés.

**D. Invariants non négociables**

1. L’état applicatif d’une trajectoire persiste ; aucun retour automatique à une base idéale.
2. Une révélation de période k ne contient ni besoins, ni réponses métier, ni tests privés de k+1.
3. Le candidat n’a pas les identifiants du stockage de recherche, de la base centrale ou de l’évaluateur.
4. Un rollback de l’application ne restaure jamais le registre central des coûts.
5. Un échec conserve ses dépenses, ses intentions non servies et son backlog.
6. Une tâche peut être rejouée par l’orchestrateur ; les effets validés sont dédupliqués par clé d’opération et empreinte d’entrée.
7. Un appel fournisseur dont la réponse est perdue n’est pas relancé aveuglément. Son état reste ambigu tant qu’il n’est pas réconcilié.
8. Les graines, budgets, conditions, versions et règles de validation sont figés avant une campagne de mesure.
9. Les dépenses utilisent des entiers exacts, jamais une addition de flottants monétaires.
10. Le nombre d’assertions ou de tests ne détermine pas le poids d’une fonctionnalité.
11. Les répétitions et variantes ne sont pas de nouveaux projets indépendants.
12. Un résultat `PASS` nécessite l’exécution des assertions obligatoires ; ni test sauté, ni rapport absent, ni simple code de sortie d’un sous-processus ne suffisent.

**E. Identités et contrats de données**

Identité complète d’une trajectoire : `campaign_id / parent_project_id / scenario_id / configuration_id / repetition_id / budget_id`. Une période ajoute `period_index` commençant à 1. Une opération ajoute `phase`, `operation_kind`, `operation_sequence` et `logical_attempt`. Ainsi, les appels 1 et 2 d’une même période sont distincts sans devenir deux répétitions scientifiques. Les retries techniques conservent cette identité ; une nouvelle demande après résultat perdu reçoit une nouvelle tentative logique suivant la politique figée.

Les JSON de domaine sont stricts : propriétés inconnues rejetées, enums explicites, timestamps UTC ISO 8601, nombres non finis interdits. Les montants sont des chaînes d’entiers non négatifs en micro-USD ; `1000000` vaut 1 USD. Les ajustements sont des écritures séparées signées, pas l’édition d’une facture déjà inscrite.

Les empreintes utilisent SHA-256 sur des octets canoniques documentés. Objets JSON triés récursivement par clé ; ordre des tableaux conservé ; UTF-8 ; aucun timestamp technique ajouté à un objet métier déterministe. Les graines sont dérivées par identifiants et flux (`scenario`, `workload`, `assignment`, `bootstrap`) pour que l’ajout d’un tirage dans un composant ne change pas tous les autres.

| Contrat | Champs minimaux obligatoires |
| --- | --- |
| `CampaignManifest` | version, mode, corpus et empreintes, configurations, budgets, graines, périodes, politiques, métriques, statut de gel |
| `PeriodState` | phase, identité, snapshot courant, déploiement courant, contrats actifs, backlog, budget, horloge métier |
| `Requirement` | id, version, capability_id, poids, date de révélation, échéance, remplacement éventuel, criticité, source |
| `Intent` | id stable, acteur externe, locataire, instant métier, opération, arguments, cible métier attendue |
| `Observation` | intention, réponse, faits métier observés, indisponibilité éventuelle, horodatage métier, trace technique |
| `AgentRun` | modèle/adaptateur, contexte autorisé, outillage, budget, idempotency_key, état de session |
| `ModelCall` | identifiant logique, empreinte requête, réservation, état d’émission, id fournisseur éventuel, usage, facture, résultat |
| `Submission` | identité, exigences revendiquées, empreinte artefact, migration, tentative, résultat de validation |
| `CheckpointManifest` | schéma, code, données, fichiers, files, mémoire, horloge, exigences, backlog, versions et empreintes |
| `PeriodResult` | dépenses, exigences évaluées, intentions offertes/réussies, incidents, Q, R, G, statut et empreintes de preuve |

États de phase : `PENDING`, `RESTORING`, `REVEALING`, `DEVELOPING`, `VALIDATING`, `DEPLOYING`, `EXERCISING`, `AUDITING`, `CHECKPOINTING`, `COMPLETED`. Les états d’arrêt de calcul `BUDGET_EXHAUSTED`, `RUNNER_BLOCKED` et `CANCELLED` n’effacent pas la période de l’analyse. `attempt_outcome` vaut `SUCCESS`, `FAILED` ou `CANCELLED` ; `deployment_coverage` vaut `NO_DEPLOYMENT`, `PARTIAL` ou `ACCEPTED`. Une tentative FAILED peut coexister avec un déploiement antérieur PARTIAL encore utile. Ces champs ne remplacent pas Q et R.

États d’appel : `RESERVED`, `DISPATCH_STARTED`, `RESPONSE_STORED`, `SETTLED`, `UNKNOWN`, `CANCELLED_BEFORE_DISPATCH`. L’écriture `DISPATCH_STARTED` précède l’envoi réseau ; même un crash immédiatement après cette écriture est traité comme potentiellement facturé.

**F. Fixtures maîtresses à matérialiser sans recalcul depuis l’implémentation**

`F-MONEY`. Grille fictive : entrée non cachée 2 micro-USD/token ; entrée cachée 1 ; sortie 5. Un appel de 100 tokens non cachés, 40 cachés et 20 de sortie vaut 340 micro-USD. Deux appels identiques valent 680. Les champs d’entrée sont disjoints : si un fournisseur inclut le cache dans un total, son adaptateur le normalise avant facturation.

`F-BUDGET`. Budget 1000 ; deux réservations concurrentes de 600 ne peuvent pas être toutes deux acceptées. Après règlement à 340 de la réservation acceptée, `spent=340`, `reserved=0`, `available=660`. Depuis cet état, tester séparément : une réservation de 600 est admissible et laisse 60 disponibles ; une de 661 est refusée et laisse 660. Dans un troisième sous-cas indépendant avec budget frais et zéro dépense, une réservation ambiguë de 600 maintient `available=400` tant qu’elle n’est pas réconciliée.

`F-QUALITY`. Quatre périodes de même durée avec `Q=[1, 1/2, 3/4, 1]` donnent `V=13/16=0.8125`. `R=[1, 1/2, null, 1/2]`, intentions offertes `[4,4,0,2]` et réussies `[4,2,0,1]` donnent `U=2/3`, exposition `3/4` et réussite agrégée par intention `7/10`. Ces trois derniers nombres sont différents et doivent rester identifiés.

Entrées exactes de Q : P1 exige A@1 et B@1, poids 1 chacun, tous deux satisfaits ; P2 ajoute C@1 de poids 2, non satisfaite, A et B restant satisfaites ; P3 remplace A@1 par A@2 de poids 1 satisfaite, B@1 est violée et C@1 satisfaite ; P4 retire B, A@2 et C@1 restent satisfaites. Toutes les exigences citées sont dues à la période concernée. Le test négatif ajoute une exigence révélée mais non encore due : son poids ne doit pas entrer dans Q avant son échéance.

Convention : R vaut `null` lorsqu’aucune intention admissible n’est proposée. U est la moyenne temporelle sur les périodes exposées, avec l’exposition publiée. Une campagne confirmatoire exige une exposition prédéfinie non nulle ; une trajectoire indisponible face à des intentions prévues a R=0, jamais `null`. Q est `null` si aucun poids d’exigence active due ; le préflight interdit ce cas dans une période confirmatoire mesurée. Les séries de simple préparation restent marquées hors mesure.

`F-COST-RATIO`. Deux projets de poids égal : A coûte `[10,90]`, B `[20,100]`. Moyennes A=50 et B=60 ; ratio principal A/B=`5/6`. La moyenne des ratios serait `0.7` et constitue un résultat incorrect pour cette métrique.

`F-CLUSTERS`. Projet P1 : A=10, B=20 sur dix répétitions identiques. Projet P2 : A=90, B=100 sur une répétition. Moyennes interprojets encore 50 et 60. Une moyenne naïve sur onze lignes ne doit pas remplacer cette agrégation. Dupliquer toutes les répétitions de P1 laisse l’estimation ponctuelle inchangée.

`F-BOOTSTRAP`. Sur les deux projets précédents, forcer la liste de rééchantillonnages `[P1,P1]`, `[P1,P2]`, `[P2,P1]`, `[P2,P2]`. Les quatre ratios coût A/B sont `[1/2,5/6,5/6,9/10]`. Pour la convention de quantile empirique inverse, l’intervalle 2,5 %–97,5 % de cette liste est `[1/2,9/10]`. Cette fixture valide le calcul, pas une couverture suffisante avec deux projets.

`F-RESERVATION`. Horloge initiale `2030-01-01T00:00:00Z`. Acteurs A, B et C ; locataire initial `legacy`. Créneau S1 de capacité 1 débutant `2030-01-03T12:00:00Z`. P1 : réservation de A acceptée, rejeu de sa clé idempotente sans doublon, demande concurrente de B rejetée sans surbooking. P2 : B puis C en attente ; annulation de A ; B devient confirmé, C reste premier en attente. P3 : règle d’annulation au moins 24 heures avant le début, frontière incluse. Sur deux clones du même état, B peut annuler exactement le `2030-01-02T12:00:00Z`, et reçoit un refus métier à `12:00:00.001Z`. P4 : données existantes migrées vers `legacy`, création d’un locataire `other` ; ses acteurs ne peuvent ni lire ni modifier les réservations `legacy`. Évaluer l’état métier exporté, pas un nom de table imposé.

`F-FAILURE`. À K=4, un candidat sans déploiement sur les quatre périodes conserve quatre lignes avec Q=0 et R=0 si les exigences et usages y sont présents. Ses coûts `[100,50,0,0]` totalisent 150. Un arrêt de calcul après P2 ne supprime pas P3 et P4 ; aucune facture imaginaire n’y est ajoutée.

Dans F-RESERVATION, les probes de frontière P3 sont des clones jetables ; elles ne modifient pas l’état persistant principal. À l’entrée de P4, celui-ci conserve A annulé, B confirmé et C en attente. Sur le clone où B annule exactement à 24 h, C devient confirmé. FIFO est ordonné par séquence d’admission explicite, pas par égalité possible de timestamps. Le contrat intertenant de la fixture renvoie `NOT_FOUND` sans donnée métier divulguée.

Horloges principales de F-RESERVATION : P1 commence le 1er janvier 2030 à 00:00 UTC, P2 à 01:00, P3 le 2 janvier à 11:00, P4 à 13:00. Les probes privées P3 utilisent leurs heures propres et sont jetées. Les instants synthétiques accélèrent ici les périodes ; les résultats ne les présentent pas comme quatre mois réels.

`F-POWER`. Quatre petites campagnes statistiques, chacune avec deux parents distincts P1/P2 portant les mêmes valeurs. Dans chaque parent, B coûte 100 et a V=U=1 ; A a respectivement pour les quatre campagnes `(coût,V,U)` : `(80,1,1)`, `(100,1,1)`, `(80,0.96,1)`, `(80,0.99,0.99)`. Comptabilité résolue, absence de violation critique, valeurs connues sur les deux bras. Les tirages parents exhaustifs donnent des distributions ponctuelles ; les bornes de ratio sont donc 0,8 / 1 / 0,8 / 0,8, celles de ΔV 0 / 0 / −0,04 / −0,01, celles de ΔU 0 / 0 / 0 / −0,01. T34 doit produire `[vrai,faux,faux,vrai]`. Cette fixture traverse agrégation, bootstrap et décision, sans supposer qu’une estimation ponctuelle générale suffit à décider.

`F-REGRESSION`. Exigence `cancel@1` satisfaite en P2 puis remplacée en P3 par `cancel@2` : le retrait de `cancel@1` ne produit pas de régression. Une exigence `isolation@1` satisfaite en P3 puis violée en P4 en produit une. Compter par id/version active, pas par nombre d’assertions.

**G. Règle universelle de fin et commande de vérification**

T00 crée `pnpm verify:task Txx`. Une tâche exécutée renvoie : code 0 si toutes ses assertions requises et ses dépendances réussissent ; code 1 si une assertion échoue ; code 2 si un prérequis est absent. Aucun des deux derniers cas n’est accepté comme terminé.

Chaque tâche possède `acceptance/Txx.spec.ts` ou `analysis/tests/test_Txx.py`, un manifeste de cas attendus, et écrit `verification/results/Txx.json`. Le résultat inclut : id de tâche, commit, empreinte des fixtures, versions, commandes, assertions attendues/exécutées, statuts individuels, fichiers de preuves, durée observée et prérequis. L’heure et la durée sont des métadonnées volatiles, exclues de la comparaison canonique des résultats métier.

Éviter la circularité des preuves : committer d’abord les sources, tests et fixtures ; exécuter ensuite sur cet arbre source propre ; placer `verification/results` hors des fichiers Git suivis, puis archiver les attestations avec `subject_commit`. Produire cette archive ne change donc pas le commit certifié. Tout diff de source non committé interdit une attestation finale. Les preuves intermédiaires de développement peuvent être étiquetées `dirty=true`, sans valider la fin d’une tâche.

Une preuve comporte des sorties effectivement observées et des assertions indépendantes. Un programme qui écrit seulement `passed=true`, un test avec zéro assertion, une capture d’écran ou la phrase « ça marche » ne satisfait pas le contrat. Le vérificateur refuse les tests sautés et les identifiants manquants. La racine des fixtures de référence est gelée après T01 ; toute modification est visible dans le diff et invalide les preuves précédentes.

Les tests d’ordonnancement emploient horloges contrôlées, barrières et points d’injection nommés. Un timeout borne un blocage ; il ne démontre pas qu’un événement aurait dû arriver en 100 ms. Les checks d’intégration utilisent réellement PostgreSQL, le stockage et les workers lorsque le contrat porte sur ces composants.

Les nombres exacts se vérifient en entier ou rationnel. Les fonctions statistiques utilisant des flottants précisent leur tolérance, au maximum `1e-12` pour les fixtures arithmétiques ci-dessus. Une version et un algorithme pseudo-aléatoire figés sont requis pour les sorties simulées.

**H. Décomposition en tâches**

Les sections suivantes sont les unités de délégation. Une dépendance signifie un contrat déjà validé, pas seulement un fichier présent. Les chemins sont des chemins cibles à créer dans le futur dépôt.

**T00 — Initialiser le dépôt et le vérificateur minimal**

Dépendances : aucune. Livrables : workspace pnpm, configuration TypeScript/Jest, environnement Python verrouillé, `verification/tasks.json`, script `verify:task`, `docs/toolchain.json` et première CI. Le registre contient dès maintenant les 44 identifiants avec statut non implémenté ; ne pas créer 44 tests verts vides.

Travail : choisir des versions compatibles, les verrouiller et documenter l’installation. Le runner minimal distingue tâche inconnue, non implémentée, échec et succès. Il produit une preuve seulement à partir d’un résultat de test observé.

Acceptation déterministe : `T00.A1` installe à partir des lockfiles et compile un module de contrat ; `A2` un test vrai donne 0 ; `A3` sa variante volontairement fausse donne 1 ; `A4` `T99` est refusé ; `A5` T01 marquée non implémentée dans un registre synthétique isolé n’est pas déclarée réussie ; `A6` le lockfile reste inchangé après installation figée. Les cas de statut utilisent des registres de test indépendants de l’avancement réel : réexécuter T00 après T43 doit rester possible.

Commande de fin : `pnpm verify:task T00`. Preuves : versions, empreintes des lockfiles et résultats A1–A6. Aucun accès à une API IA n’est nécessaire.

**T01 — Rendre le système de preuve non contournable par accident**

Dépendances : T00. Livrables : schéma du rapport, registre d’assertions, contrôles du runner et fixtures maîtresses F de ce document dans `acceptance/reference`.

Travail : recenser les assertions attendues par tâche ; échouer si elles manquent, sont sautées ou proviennent d’un ancien commit. Calculer une empreinte des fixtures et préserver le rapport d’échec. Un sous-processus qui sort avec 0 sans produire ses preuves n’est pas suffisant.

Acceptation : `T01.A1` rapport vide refusé ; `A2` assertion sautée refusée ; `A3` identifiant obligatoire absent refusé ; `A4` fixture modifiée après exécution invalide la preuve ; `A5` rapport d’un ancien commit ne valide pas le commit courant ; `A6` la corruption de F-MONEY, par exemple attendu 341 au lieu de 340, est détectée par la vérification des références.

Commande : `pnpm verify:task T01`. Fin : les six variantes négatives sont détectées, le cas valide passe, et le registre référence réellement tous les cas du cahier. Le hash est un contrôle de cohérence ; l’agent ayant accès au dépôt n’est pas magiquement incapable de modifier aussi le vérificateur. Les modifications restent auditées par diff.

**T02 — Implémenter les types primitifs déterministes**

Dépendances : T01. Livrables : montants, identités, sérialisation canonique, horloge injectable et dérivation de graines dans `contracts`.

Acceptation : `T02.A1` deux objets ayant les mêmes clés dans un ordre différent donnent les mêmes octets canoniques ; `A2` inverser un tableau change l’empreinte ; `A3` le SHA-256 des octets `abc` vaut `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` ; `A4` montants négatifs hors écriture d’ajustement, décimaux et NaN sont rejetés ; `A5` dériver le flux workload est indépendant du nombre de tirages du flux bootstrap ; `A6` rejouer une suite avec la même graine et version d’algorithme donne la même suite, avec vecteur publié.

Commande : `pnpm verify:task T02`. Fin : absence de dépendance à `Date.now()` ou au hasard global dans les fonctions de domaine, vérifiée par règle d’import et tests à horloge imposée. Les timestamps techniques sont produits uniquement par adaptateur.

**T03 — Définir les schémas et compiler un manifeste de campagne**

Dépendances : T02. Livrables : schémas des contrats E, validation structurée et planificateur pur de cellules.

Acceptation : `T03.A1` un manifeste 1 projet × 1 scénario × 2 configurations × 3 répétitions × 1 budget produit exactement six identités distinctes ; `A2` changer le nombre de workers ne change pas ces identités ; `A3` un id en doublon est rejeté ; `A4` propriété inconnue ou budget absent rejeté avec chemin exact ; `A5` un scénario de provenance synthétique reste étiqueté synthétique dans toutes les cellules ; `A6` empreinte vérifiée avant toute exécution et mismatch refusé.

Commande : `pnpm verify:task T03`. Fin : fixtures JSON minimales et invalides archivées ; aucune création de worker pendant une compilation de manifeste. Ajouter des cellules ne nécessite pas un appel LLM.

**T04 — Implémenter les métriques de période et leurs dénominateurs**

Dépendances : T02 et T03. Livrables : fonctions pures pour Q, R, V, U, backlog, exigences remplacées et régressions.

Précision : G compte les régressions actuellement ouvertes, c’est-à-dire les exigences actives dues, autrefois satisfaites et actuellement violées. `G_new` compte celles qui étaient satisfaites à la période précédente comparable et deviennent violées. Une régression persistante contribue à G, sans redevenir nouvelle à chaque période.

Acceptation : `T04.A1` F-QUALITY donne exactement les résultats annoncés ; `A2` dupliquer les assertions d’une exigence ne change pas Q ; `A3` F-REGRESSION exclut `cancel@1` et compte `isolation@1` ; `A4` deux périodes consécutives cassées donnent G=1 aux deux et G_new=1 puis 0 ; `A5` zéro usage donne R=null, panne avec quatre usages donne R=0 ; `A6` exigence non encore due absente du dénominateur.

Commande : `pnpm verify:task T04`. Fin : tests de bornes [0,1], cas vides et sommes exactes ; aucune note LLM n’intervient.

**T05 — Programmer les transitions d’une période sans infrastructure**

Dépendances : T03 et T04. Livrables : machine à états pure dans `domain`, événements, commandes attendues et erreurs de transition.

Acceptation : `T05.A1` parcours nominal respecte les phases de E ; `A2` déployer avant validation est refusé ; `A3` rejouer un événement d’identité et contenu identiques est sans effet supplémentaire ; `A4` même identité avec contenu différent donne `IDEMPOTENCY_CONFLICT` ; `A5` budget épuisé déclenche mesure de la version existante, pas succès fictif ; `A6` sans déploiement, la clôture d’une période produit les demandes non servies prévues par F-FAILURE.

Commande : `pnpm verify:task T05`. Fin : table exhaustive des transitions autorisées, erreurs typées et test de réduction d’un journal en état final. Les effets réseau sont des commandes à exécuter par adaptateurs, pas des appels cachés dans le reducer.

**T06 — Compiler les scénarios et contrôler leur révélation**

Dépendances : T03. Livrables : pack public/privé, index de périodes, table de réponses client et versionnement des exigences.

Acceptation : `T06.A1` une sentinelle distincte dans chaque événement futur ne figure jamais dans les entrées de l’agent avant sa révélation ; `A2` lecture anticipée renvoie `NOT_RELEASED` ; `A3` une question connue produit la réponse disponible exacte ; `A4` une question non couverte donne `UNSPECIFIED`, sans inventer de règle ; `A5` une dépendance cyclique ou vers un événement inexistant est rejetée ; `A6` remplacer une exigence désactive la bonne version au bon instant.

Commande : `pnpm verify:task T06`. Fin : un pack réservation quatre périodes est compilable ; le paquet futur complet ne sera jamais envoyé à un workflow ou sandbox accessible au développeur. L’infrastructure conserve seulement les références privées nécessaires.

**T07 — Construire l’oracle métier indépendant de réservation**

Dépendances : T02 et T06. Livrables : machine à états de réservation, projection métier canonique et catalogue de résultats attendus, sans SQL ni HTTP.

Acceptation : `T07.A1` F-RESERVATION P1 n’a qu’une réservation confirmée et aucun doublon idempotent ; `A2` P2 promeut B avant C ; `A3` annulation permise exactement à 24 h ; `A4` refus 1 ms après la frontière ; `A5` acteur other ne voit aucune donnée legacy ; `A6` répétition d’une opération avec même clé et arguments différents donne un conflit explicite ; `A7` une annulation répétée ne promeut pas deux personnes.

Commande : `pnpm verify:task T07`. Fin : toutes les transitions sont déterministes. L’oracle ne réutilise ni les handlers, ni les requêtes SQL, ni les validateurs métier des applications témoins. Une erreur commune peut subsister ; les cas de référence documentent ce qui est effectivement couvert.

**T08 — Générer et exécuter les intentions d’usage**

Dépendances : T06 et T07. Livrables : modèle d’intention, plan d’usage seedé, résolution d’identifiants externes et horloge métier isolée.

Acceptation : `T08.A1` même scénario/graine donne les mêmes intentions, même avec un nombre de workers différent ; `A2` les quatre usages de F-QUALITY sont toujours proposés si le candidat n’a créé aucune donnée ; `A3` référence manquante à cause d’un échec antérieur produit une intention non servie, pas une suppression ; `A4` les essais négatifs de sécurité alimentent conformité/criticité sans gonfler artificiellement les échecs des parcours métier valides ; `A5` avance du temps de A ne change pas celui de B ; `A6` contrôle de la frontière 24 h sans attendre 24 heures physiques.

Commande : `pnpm verify:task T08`. Fin : conservation du nombre d’intentions offertes et séparations entre temps métier, attente technique et temps de calcul.

**T09 — Fournir les applications témoins et les migrations connues**

Dépendances : T07. Livrables : quatre versions d’une petite API de réservation, base PostgreSQL applicative, contrat HTTP public et fixtures fautives nommées.

Travail : les témoins sont des programmes de test du moteur, pas les solutions à transmettre aux candidats. Exposer des opérations métier et une exportation canonique contrôlée. Les migrations portent sur les données réellement créées aux périodes précédentes.

Acceptation : `T09.A1` témoin conforme réalise F-RESERVATION ; `A2` double réservation concurrente synchronisée par barrière ne dépasse pas la capacité ; `A3` migration P4 préserve 100 réservations et les rattache à legacy ; `A4` témoin `drop-one-row` perd exactement une réservation et est distinguable de l’état attendu ; `A5` restauration d’un export métier retrouve les mêmes faits sans exiger un schéma SQL identique.

Commande : `pnpm verify:task T09`. Fin : tests sur PostgreSQL réel, images témoins identifiées par digest et résultats oracle indépendants.

**T10 — Qualifier les oracles et détecter les tests défectueux**

Dépendances : T07, T08 et T09. Livrables : pipeline de qualification, registre de mutants sémantiques et file de quarantaine.

Acceptation : `T10.A1` témoin conforme accepté ; `A2` mutants surbooking, doublon idempotent, FIFO inversé, frontière 24 h fausse, fuite intertenant et perte de migration chacun détectés par son contrôle nommé ; `A3` une assertion contradictoire au contrat met le scénario en quarantaine ; `A4` un évaluateur factice qui alterne succès/échec est reconnu instable ; `A5` aucun cas mis en quarantaine n’entre dans un manifeste confirmatoire ; `A6` raisons et proportions d’exclusion restent exportables.

Commande : `pnpm verify:task T10`. Fin : matrice témoin/mutant/contrôle enregistrée. Il ne suffit pas que le mutant plante au build : pour les fautes métier obligatoires, le programme doit démarrer puis échouer sur la propriété ciblée. Dix répétitions détectent l’instabilité de la fixture, sans prétendre exclure toutes les instabilités rares.

**T11 — Livrer une première trajectoire verticale en mémoire**

Dépendances : T04, T05, T06, T08 et T10. Livrables : commande `bench demo --mode recorded --storage memory`, pilote de période scripté, résultats JSON.

Travail : assembler révélation, décision de fixture, validation, usages et métriques sans dépendre encore de Temporal ni du stockage distribué. Le pilote fournit des observations connues ; il n’a pas le droit de lire les valeurs finales attendues du test.

Acceptation : `T11.A1` quatre périodes dans l’ordre ; `A2` remplacement de règle en P3 visible et ancienne règle retirée ; `A3` historique métier présent en P4 ; `A4` F-FAILURE conserve quatre résultats ; `A5` deux exécutions identiques ont le même résultat canonique ; `A6` la variante `cross-tenant-read` fait échouer le contrôle métier associé.

Commande : `pnpm verify:task T11`. Fin : une démonstration de bout en bout du domaine fonctionne. Les coûts non encore exercés sont explicitement fictifs et ce jalon ne valide ni persistence réelle ni isolation. Cette limite apparaît dans le résultat.

**T12 — Persister les événements et résultats dans PostgreSQL**

Dépendances : T03 et T05. Livrables : migrations du schéma central, repositories, outbox et publication transactionnelle.

Tables minimales : campaigns, trajectories, periods, operations, domain_events, deployments, incidents, artifact_refs, checkpoints, model_calls, ledger_entries, budget_reservations et outbox. Séparer schéma central et bases des applications. Les migrations futures sont ajoutées comme nouveaux fichiers, jamais réécriture d’une migration appliquée.

Acceptation : `T12.A1` arrêt/reconnexion retrouve le même état ; `A2` vingt publications concurrentes d’un même résultat donnent un seul résultat logique ; `A3` même clé/autre digest donne conflit ; `A4` panne avant commit ne laisse ni résultat ni événement orphelin visible ; `A5` panne après commit puis reprise ne duplique rien ; `A6` une transaction concurrente conflictuelle est reprise selon une limite fixée, sans perdre l’unicité.

Commande : `pnpm verify:task T12`. Fin : tests sur PostgreSQL réel et preuves SQL des contraintes uniques. Les transactions garantissent les effets locaux ; elles ne rendent pas une requête fournisseur distante exactement unique.

**T13 — Construire le stockage immuable d’artefacts**

Dépendances : T02 et T03. Livrables : port `ArtifactStore`, adaptateur local et manifeste de contenu.

Acceptation : `T13.A1` mêmes octets donnent la même référence de contenu ; `A2` un octet changé donne une autre référence ; `A3` lecture après corruption donne `ARTIFACT_CORRUPT` ; `A4` fichier absent donne `ARTIFACT_MISSING` ; `A5` une écriture interrompue n’est pas visible comme objet final ; `A6` extraction d’une archive contenant `../escape`, chemin absolu ou lien sortant est refusée sans écriture hors destination.

Commande : `pnpm verify:task T13`. Fin : interface testée en contrat, limites de taille déclarées, empreintes vérifiées avant usage. Un nom de fichier fourni par le candidat n’est jamais concaténé directement à un chemin du stockage central.

**T14 — Ajouter l’adaptateur S3 et son test de contrat réel**

Dépendances : T13. Livrables : adaptateur S3, service S3 compatible pour les tests locaux et identités limitées par usage.

Acceptation : `T14.A1` tous les cas du contrat ArtifactStore passent sur le service réel de test ; `A2` un transfert interrompu puis repris ne crée pas deux objets logiques ; `A3` deux uploads simultanés des mêmes octets donnent la même référence ; `A4` une identité limitée à un préfixe ne peut pas lire le préfixe privé d’évaluation ; `A5` expiration d’une autorisation donne un refus explicite, jamais un fallback anonyme ; `A6` les erreurs ne publient aucun secret dans les rapports.

Commande : `pnpm verify:task T14`. Fin : empreintes des images et preuves d’appels enregistrées. Les préfixes ne sont pas, seuls, un mécanisme d’autorisation ; le contrôle doit être exercé par le stockage ou un service d’accès.

**T15 — Capturer et restaurer des checkpoints cohérents**

Dépendances : T09, T12, T13 et T14. Livrables : barrière d’écriture, export/import base, fichiers, files, code, mémoire et publication du manifeste.

Travail : fermer les entrées d’écriture, drainer les opérations en vol, capturer les composants, vérifier les artefacts, puis publier le checkpoint par transaction. Le stockage publie un pointeur ; il ne donne pas une transaction distribuée magique entre objets et PostgreSQL.

Acceptation : `T15.A1` snapshot après opération 42 et avant 43 restaure exactement l’état métier après 42 ; `A2` arrêter après chaque upload ne publie aucun checkpoint complet ; `A3` objet manquant donne `CHECKPOINT_INCOMPLETE` ; `A4` corruption est refusée ; `A5` deux finalisations identiques renvoient la même identité ; `A6` restaurer code/base/mémoire ne réduit pas les dépenses centrales ; `A7` aucune écriture applicative n’échappe à la barrière testée.

Commande : `pnpm verify:task T15`. Fin : restauration sur environnement vierge et vérification des faits métier, plutôt qu’égalité binaire de deux exports PostgreSQL recréés.

**T16 — Implémenter le budget et les écritures comptables atomiques**

Dépendances : T02 et T12. Livrables : réservations, calcul tarifaire, règlement, ajustements, écritures de facturation et rapprochement.

Acceptation : `T16.A1` F-MONEY donne 340 ; `A2` F-BUDGET respecte tous ses montants sous transactions concurrentes ; `A3` dix importations d’un même reçu ne le comptent qu’une fois ; `A4` deux reçus distincts de même montant restent deux dépenses ; `A5` un coût inconnu ne devient jamais zéro ; `A6` une correction est ajoutée comme écriture liée à l’original ; `A7` une réservation dont le coût maximal est non borné est refusée en mode plafond strict avec `UNBOUNDED_COST`.

Commande : `pnpm verify:task T16`. Fin : invariants `spent + reserved + available = limit` dans les cas sans dépassement fournisseur, entiers exacts, et état explicite de dépassement si la facture finale excède exceptionnellement la borne. Un plafond absolu n’est promis que lorsque l’adaptateur possède une borne fiable ; sinon le mode strict bloque l’émission.

**T17 — Construire la passerelle modèle et gérer la réponse perdue**

Dépendances : T12 et T16. Livrables : journal durable d’appel, fournisseur factice avec compteurs, idempotence logique et endpoint de réconciliation.

Acceptation : `T17.A1` une requête reçue par le fournisseur possède déjà `DISPATCH_STARTED` ; `A2` panne après facture 340 et avant réception de réponse donne UNKNOWN, un seul appel et réservation maintenue ; `A3` reprise de la même opération n’émet pas un deuxième appel ; `A4` ingestion du reçu règle 340 sans inventer de réponse textuelle ; `A5` panne avant DISPATCH_STARTED permet reprise avec zéro réception préalable ; `A6` panne juste après DISPATCH_STARTED reste conservativement UNKNOWN même si le fournisseur factice a reçu zéro appel ; `A7` même clé avec autre requête est rejetée.

Commande : `pnpm verify:task T17`. Fin : retries automatiques du SDK et transport configurés explicitement ; nouvelles tentatives scientifiques créées avec nouvelles identités et coûts. Les ambiguïtés non réconciliées restent dans l’export.

**T18 — Formaliser le contrat AgentRunner avec un agent scripté**

Dépendances : T03, T06, T15 et T17. Livrables : `start`, `observe`, `submit`, `stop`, `resume` et événements de session dans `agents`.

Travail : l’agent reçoit workspace, faits disponibles, outils autorisés et limites. Son script consomme des réponses modèle archivées, applique des patches témoins et produit des soumissions ; il ne peut pas consulter les oracles.

Acceptation : `T18.A1` même script donne les mêmes patches et appels logiques ; `A2` mémoire autorisée restaurée à la période suivante ; `A3` contexte neuf ne contient pas d’historique conversationnel non autorisé ; `A4` arrêt ne produit plus de nouvelle soumission ; `A5` réponses invalides donnent erreur typée et dépense conservée ; `A6` accès au service client respecte T06 ; `A7` événements de l’agent n’ont pas autorité pour fixer eux-mêmes `accepted=true`.

Commande : `pnpm verify:task T18`. Fin : suite de contrat réutilisable par l’adaptateur réel, et script volontairement incapable disponible pour les tests d’échec du moteur.

**T19 — Exécuter le candidat dans une isolation réellement testée**

Dépendances : T14, T15, T17 et T18. Livrables : SandboxRunner Linux, profil d’exécution borné, réseau du candidat et procédure de destruction.

Profil pilote : conteneurs non privilégiés, identités et volumes distincts, pas de socket Docker dans le candidat, pas de montage du dépôt de contrôle, pas de clés fournisseurs. Le candidat n’accède qu’à ses services, au miroir autorisé et à la passerelle. Les permissions et le filtrage sont contrôlés hors du processus candidat. Le profil exact est archivé ; sa validation ne prétend pas prouver résistance à toute faille du noyau.

Acceptation : `T19.A1` fichier sentinelle privé illisible ; `A2` base centrale, Temporal et autre trajectoire inaccessibles depuis le sandbox ; `A3` appel fournisseur direct et sortie vers un collecteur interdit bloqués ; `A4` identité de trajectoire revendiquée frauduleusement refusée par la passerelle ; `A5` dépassement mémoire/processus terminé avec raison observable ; `A6` destruction n’affecte pas une autre trajectoire.

Commande : `pnpm verify:task T19`. Fin : essais hostiles exécutés dans le vrai profil. Si l’hôte ne permet pas ces propriétés, renvoyer BLOCKED ; ne pas désactiver le filtrage pour obtenir un test vert.

**T20 — Exécuter l’évaluateur sur des copies privées jetables**

Dépendances : T10, T15 et T19. Livrables : runner de validation, runner d’audit et canal de retour borné.

Travail : les tests cachés potentiellement destructifs s’exécutent sur une copie privée du checkpoint, dans une frontière d’accès distincte. Ce profil n’hérite ni du credential développeur, ni de la passerelle modèle, ni du miroir documentaire ; aucune sortie ou file persistante accessible ensuite au développeur n’est autorisée. Seuls les services d’exécution privés nécessaires au test sont joignables. Les usages ordinaires destinés à faire vivre le produit s’exécutent sur son état persistant. Ne jamais restituer au développeur la copie ayant reçu les données privées de test.

Acceptation : `T20.A1` une sentinelle créée par les tests n’apparaît ensuite ni dans la base, ni dans les fichiers, ni dans les logs accessibles au développeur ; `A2` un candidat renvoyant un faux verdict JSON ne peut pas changer le verdict signé côté contrôle ; `A3` validation et audit utilisent des jeux distincts ; `A4` retour limité contient le cas opérationnel autorisé sans révéler le fichier de test ; `A5` témoins et mutants T10 donnent toujours leurs verdicts ; `A6` un test interrompu donne `EVALUATION_INCOMPLETE`, pas succès ; `A7` une application tentant d’exfiltrer la sentinelle via la passerelle, le miroir ou un stockage de développement échoue, avec zéro réception de la sentinelle côté collecteurs.

Commande : `pnpm verify:task T20`. Fin : origine et empreinte de chaque verdict vérifiées, nettoyage de chaque copie et coût de recherche distingué.

**T21 — Admettre les livraisons et protéger les migrations**

Dépendances : T05, T09, T15 et T20. Livrables : gestion des soumissions, version active, validation de compatibilité et procédure de déploiement.

Acceptation : `T21.A1` migration correcte conserve 100 réservations ; `A2` migration perdant une réservation donne `MIGRATION_REJECTED` et laisse la version active et ses données inchangées ; `A3` livraison ne préservant pas une exigence précédemment livrée et encore active, ou un invariant critique applicable, est refusée ; `A4` exigence remplacée n’empêche pas la livraison ; `A5` quatrième soumission après limite de trois donne `SUBMISSION_LIMIT` ; `A6` panne entre préparation et bascule permet retrouver une seule version active cohérente ; `A7` coûts des refus conservés ; `A8` deux exigences nouvelles dues, une seule revendiquée et correctement livrée avec exigences protégées préservées : déploiement partiel admis, exigence restante au backlog et Q inférieur à 1.

Commande : `pnpm verify:task T21`. Fin : contrat de bascule et récupération documenté. La migration est d’abord éprouvée sur copie ; le déploiement réel utilise sauvegarde, barrière et reprise idempotente. La plateforme n’impose pas de livrer tout le backlog pour accepter un sous-ensemble cohérent.

**T22 — Transformer les observations en incidents et backlog**

Dépendances : T04, T08, T20 et T21. Livrables : classification déterministe des défauts observés, déduplication, politique de révélation et action critique.

Acceptation : `T22.A1` même symptôme/signature observé trois fois produit un incident et trois occurrences ; `A2` problème distinct produit un second incident ; `A3` ticket apparaît à la période suivante prévue, sans solution cachée ; `A4` panne extérieure prévue est distinguée d’un défaut du candidat ; `A5` violation critique déclenche exactement la politique figée, par exemple mise hors service jusqu’à correction, et dégrade le service mesuré ; `A6` tri du backlog suit priorité, échéance puis identifiant, indépendamment de l’ordre des threads.

Commande : `pnpm verify:task T22`. Fin : aucune IA n’invente librement les incidents principaux ; un résumé narratif peut être ajouté sans modifier les faits structurés, les priorités ou le coût.

**T23 — Assembler une période persistante complète**

Dépendances : T12, T15, T18, T19, T20, T21 et T22. Livrables : services d’application et commande `bench run-period` utilisant les adaptateurs réels locaux.

Acceptation : `T23.A1` trajet nominal réalise révélation, agent, validation, déploiement, usage, audit et checkpoint ; `A2` résultats T11 et T23 identiques pour les mêmes faits métier ; `A3` candidat invalide conserve version active et facture ; `A4` nouveau processus reprend la période suivante depuis le checkpoint ; `A5` une période incomplète ne publie pas un faux état final ; `A6` les sorties distinguent dépenses de développement, exploitation et recherche.

Commande : `pnpm verify:task T23`. Fin : exécution locale avec PostgreSQL, stockage, sandbox et fournisseur factice. Les étapes forment des opérations nommées pouvant ensuite devenir des Activities Temporal sans changer les règles métier.

**T24 — Orchestrer les trajectoires avec Temporal et tester le replay**

Dépendances : T05 et T23. Livrables : workflow de campagne, workflow de trajectoire, Activities, paramètres explicites de retry et tests de replay.

Travail : faire une chaîne séquentielle par trajectoire ; passer des références et petits résultats dans l’historique, pas les dépôts, bases ou conversations complets. Les appels externes se trouvent dans les Activities. Le journal externe de T17 protège les appels modèles lors des reprises.

Acceptation : `T24.A1` quatre périodes démarrent dans l’ordre et chacune après checkpoint de la précédente ; `A2` replay d’un historique terminé sans adaptateur externe accessible produit zéro nouvel appel et zéro nouvelle écriture ; `A3` une fixture changeant volontairement l’ordre de commandes produit une erreur de déterminisme ; `A4` retry d’une Activity déjà publiée retrouve son résultat ; `A5` un test de continuation avec seuil artificiellement bas conserve identité et état sans refaire les périodes.

Commande : `pnpm verify:task T24`. Fin : historique de référence versionné, replay en CI et séparation démontrée entre rejouer une décision et refaire un effet. La documentation Temporal impose cette distinction : [déterminisme des workflows](https://docs.temporal.io/workflow-definition).

**T25 — Résister aux workers périmés et à l’annulation**

Dépendances : T17, T19, T23 et T24. Livrables : baux, jetons de fencing, arrêt de session et réconciliation après annulation.

Acceptation : `T25.A1` worker A avec jeton 7, puis B avec jeton 8 : A ne peut plus appeler la passerelle ni publier de checkpoint, erreurs `STALE_EXECUTION` ; `A2` A n’écrit pas sur les volumes restaurés de B ; `A3` arrêt avec deux appels partis et trois en attente annule les trois, mais conserve le suivi des deux ; `A4` aucun nouvel appel admis après révocation ; `A5` appel ancien potentiellement facturé reste dans le journal ; `A6` un heartbeat tardif ne réactive pas le jeton 7.

Commande : `pnpm verify:task T25`. Fin : les services qui protègent les effets contrôlent le jeton, pas seulement le scheduler. Utiliser barrières et horloge de bail contrôlées dans les tests, sans attente fragile au temps réel.

**T26 — Réguler le parallélisme et les quotas équitablement**

Dépendances : T03, T17, T24 et T25. Livrables : admission globale, quotas par fournisseur, ordre d’affectation seedé et métriques de file.

Acceptation : `T26.A1` dix appels prêts, plafond deux et fournisseur bloqué par barrière donnent deux appels actifs et huit en attente ; `A2` libérer un slot n’en admet qu’un ; `A3` ordre de file annoncé respecté ; `A4` Retry-After=4 interdit tout nouvel essai avant quatre secondes d’horloge contrôlée ; `A5` la consommation attendue est identique avec un, deux ou six workers pour des agents scriptés ; `A6` temps en file et temps actif sont enregistrés séparément.

Commande : `pnpm verify:task T26`. Fin : aucun dépassement du nombre maximal observé. Les tests n’exigent pas une durée murale identique ni que la même transaction remporte une course lorsque l’ordre n’est pas spécifié. La file d’admission suit une politique fixe, indépendante des scores.

**T27 — Créer les branches expérimentales et les politiques de maintenance**

Dépendances : T15, T16, T24 et T26. Livrables : commande `bench fork`, filiation des branches et configuration de politique de travail.

Acceptation : `T27.A1` deux branches partent du même état métier mais de volumes et identités distincts ; `A2` modifier A ne change ni B ni le parent ; `A3` parent à coût 10000, dépense supplémentaire 2000, branches à 300 et 500 : dépenses physiques globales 12800, coût marginal des branches 300/500 ; `A4` le préfixe ancestral n’est pas facturé deux fois dans ce total ; `A5` politique réservant 15 % d’un budget 1000 identifie 150 pour maintenance sans porter le budget à 1150 ; `A6` état inéligible au contrôle est signalé, pas effacé.

Commande : `pnpm verify:task T27`. Fin : les branches ne réinjectent jamais leurs solutions dans la trajectoire principale. L’effet réel d’une consigne de maintenance sera mesuré ; le test vérifie le budget, l’assignation et la trace, pas que l’agent devient plus maintenable.

**T28 — Ajouter un premier adaptateur de modèle réel**

Dépendances : T17, T18, T19 et T25. Livrables : adaptateur natif Anthropic Messages via SDK TypeScript verrouillé, boucle d’outils et configuration de modèle sans identifiant inventé.

Périmètre initial : réponses non streamées, outils lecture/écriture/exécution dans le sandbox, question client et soumission. Les modèles exacts et tarifs sont renseignés dans la campagne ; le choix de ce premier connecteur n’est pas une comparaison de performance entre fournisseurs. Les autres connecteurs doivent satisfaire le même contrat AgentRunner.

Acceptation : `T28.A1` serveur HTTP factice conforme au contrat reçoit la bonne requête ; `A2` réponse avec appel d’outil est validée, exécutée dans le sandbox puis renvoyée au modèle ; `A3` outil inconnu ou arguments invalides refusés ; `A4` usage/cache normalisés sans double comptage ; `A5` erreurs 429, authentification et réponse tronquée classées correctement ; `A6` perte de réponse respecte T17 ; `A7` aucune clé dans le sandbox ou les traces publiables.

Commande : `pnpm verify:task T28`. Fin déterministe : contrat HTTP et boucle d’outils validés sans appel payant. `bench smoke-live` est séparé : credentials et plafond explicitement configurés, résultat réel archivé, aucune assertion de texte exact ou de réussite du logiciel. Référence : [SDK officiel TypeScript](https://github.com/anthropics/anthropic-sdk-typescript).

**T29 — Automatiser la fabrique de scénarios sans auto-certification libre**

Dépendances : T06, T07, T10, T17 et T28. Livrables : générateur de scénarios via modèle, parser de source, DSL métier borné et qualification automatique.

Travail : première version limitée au DSL réservation et variantes compatibles avec les transitions de l’oracle. L’IA choisit besoins, textes, paramètres et ordre admissible ; elle ne remplace pas arbitrairement le moteur de vérité. L’extension à un nouveau domaine implique un nouvel oracle et une nouvelle qualification. Les documents historiques sont fournis par paquets explicitement disponibles, pas récupérés dans des comptes privés supposés accessibles.

Acceptation : `T29.A1` réponse modèle enregistrée produit un pack compilable et qualifié ; `A2` source citée mais absente donne `SOURCE_UNVERIFIED` ; `A3` cycle, règle hors DSL ou contradiction mène à quarantaine ; `A4` futures règles absentes du paquet de révélation courant ; `A5` refaire la compilation des mêmes octets donne le même hash ; `A6` sortie réelle stochastique peut être rejetée sans être régénérée indéfiniment ; limite de tentatives et coûts sont enregistrés.

Commande : `pnpm verify:task T29`. Fin : la génération est automatisée et bornée, sa provenance reste synthétique ou hybride selon les sources. Un grand nombre de variantes de réservation ne vaut pas plusieurs familles métier indépendantes.

**T30 — Geler et préenregistrer les campagnes**

Dépendances : T03 et T10. Livrables : préflight, export canonique signé/haché, split par projet parent et port d’horodatage. La qualification de packs déjà matérialisés permet de construire ce module avant la fabrique IA ; il partage avec elle le contrat de scénario.

Acceptation : `T30.A1` même parent dans calibration et test refusé ; `A2` scénario non qualifié ou modèle/tarif non renseigné refusé ; `A3` modification d’une graine ou marge après gel donne mismatch ; `A4` mode confirmé exige métriques, effectif, budgets et règles d’arrêt renseignés ; `A5` signature ou reçu falsifié rejeté ; `A6` reçu local de test porte `test_only=true` et ne peut pas être présenté comme horodatage indépendant réel.

Commande : `pnpm verify:task T30`. Fin : campagne scellée exportable et `registration_status` fidèle. L’intégration vers une archive externe nécessite une destination accessible et configurée ; l’absence de cette preuve bloque une revendication de préenregistrement, sans empêcher les campagnes de développement étiquetées comme telles.

**T31 — Exporter des données d’analyse complètes et traçables**

Dépendances : T04, T12 et T16. Livrables : exports JSONL/Parquet, schéma versionné, manifeste de contenu et validateur d’intégrité. Les tests utilisent d’abord des journaux persistés et filiations connus ; leur alimentation par les vraies trajectoires sera vérifiée à T38 et T42.

Acceptation : `T31.A1` F-FAILURE exporte quatre périodes et total 150 ; `A2` montants conservés exactement ; `A3` somme des appels facturés concorde avec le registre selon les ajustements ; `A4` coût UNKNOWN reste accompagné de bornes ou statut inconnu ; `A5` branche déclare parent et coûts marginaux ; `A6` ordre des lignes source ne change pas l’export canonique trié ; `A7` mélange de coûts recorded avec un rapport live confirmatoire rejeté.

Commande : `pnpm verify:task T31`. Fin : aucun filtre implicite de survivants et aucune valeur vide convertie en zéro. L’export porte versions, hashes et unités ; la normalisation n’enlève jamais les identifiants de projet, le budget ou les champs déterminant l’analyse.

**T32 — Implémenter les estimations au niveau des projets**

Dépendances : T04 et T31. Livrables : package Python d’analyse, agrégation répétition/scénario/projet et tableaux de contraste.

Acceptation : `T32.A1` F-COST-RATIO donne moyennes 50/60 et ratio 5/6 ; `A2` F-CLUSTERS ne change pas après duplication des répétitions P1 ; `A3` F-QUALITY conserve V=13/16, U=2/3 et ratio intentions 7/10 comme colonnes distinctes ; `A4` quatre trajectoires de coûts [4,6,3,5] dont deux réussites donnent coût moyen 4,5 et réussite 1/2 ; `A5` dénominateur nul produit null/`ZERO_DENOMINATOR`, sans epsilon ; `A6` poids des scénarios appliqués à l’intérieur du parent avant poids entre parents.

Commande : `pnpm verify:task T32`. Fin : résultats rationnels des fixtures vérifiés et jeu de mutations détectant moyenne des ratios, pooling des lignes et exclusion des échecs.

**T33 — Implémenter le bootstrap apparié et les bandes**

Dépendances : T02 et T32. Livrables : rééchantillonneur parent, strates, quantile empirique inverse et manifeste de tirages.

Acceptation : `T33.A1` F-BOOTSTRAP donne les quatre ratios et l’intervalle [1/2,9/10] ; `A2` les deux bras suivent exactement les mêmes indices parents ; `A3` multiplier tous les coûts par 7 ne change ni ratio ni intervalle ; `A4` A=B donne tous les ratios égaux à 1 ; `A5` permuter les lignes ou dupliquer des répétitions identiques ne change pas les résultats avec la même liste de tirages parents ; `A6` une seule grappe donne `INSUFFICIENT_CLUSTERS` pour l’inférence interprojets ; `A7` les bandes ponctuelles ne sont jamais étiquetées simultanées.

Commande : `pnpm verify:task T33`. Fin : algorithme de tirage et convention de quantile archivés. Le bootstrap principal rééchantillonne les moyennes par parent ; une variante hiérarchique devient une méthode distincte déclarée. Une sortie déterministe n’implique pas une couverture fréquentiste garantie.

**T34 — Coder la règle de décision économique et ses limites**

Dépendances : T03, T32 et T33. Livrables : décision structurée, correction des comparaisons et justification par critères. Les politiques sont des entrées validées ; leur gel réel par T30 est contrôlé lors de l’intégration.

Règle : supériorité coût si borne supérieure du ratio <1 ; non-infériorité V/U si leurs bornes inférieures >−marge ; aucune violation critique interdite ; comptabilité résolue et données admissibles. Marges d’exemple 0,02. Pour J contrastes et trois critères inférentiels, la famille contient 3J intervalles ; niveau marginal `1−0,05/(3J)` avec correction de Bonferroni. L’absence de violation observée n’est pas un intervalle de sécurité universel.

Acceptation : `T34.A1` bornes ratio 0,8, ΔV=0, ΔU=0 et critiques absentes donnent supériorité sur fixture ; `A2` borne ratio=1 refuse ; `A3` borne ΔV=−0,02 refuse ; `A4` coût plus faible mais ΔU=−0,04 refuse ; `A5` UNKNOWN ou grappe unique donne `INCONCLUSIVE` ; `A6` J=2 donne six intervalles et niveau marginal 1−0,05/6 ; `A7` une violation critique bloque le qualificatif de livraison fiable.

Commande : `pnpm verify:task T34`. Fin : décision par fonctions pures et motifs calculés ; aucun LLM ne choisit le gagnant.

**T35 — Programmer le dimensionnement par simulation**

Dépendances : T02, T32, T33 et T34. Livrables : générateur de campagnes statistiques, grille d’effectifs, sélection prédéfinie et estimation d’erreur Monte-Carlo.

Travail : simuler la règle complète coût/V/U, en conservant variabilité entre projets, corrélation des bras et échecs. Séparer effet supposé, seuil de décision et précision recherchée. La première implémentation accepte un générateur injectable de campagnes ; le générateur calibré sur données du pilote est versionné ultérieurement, sans inventer ses paramètres. Paramètres obligatoires : grille croissante du nombre de parents, nombre de répétitions, nombre de simulations, générateur et paramètres, graine, risque familial, marges, puissance cible et erreur standard Monte-Carlo maximale. La sélection retourne le plus petit effectif de la grille dont la puissance estimée atteint la cible et dont l’erreur standard respecte la limite, ou TARGET_NOT_REACHED. Publier les estimations et leur incertitude ; cette règle n’est pas une garantie sur la vraie puissance.

Acceptation : `T35.A1` F-POWER traversant le vrai pipeline d’analyse produit décisions [vrai,faux,faux,vrai], puissance 0,5 et erreur standard 0,25 ; `A2` 1800 succès sur 2000 donnent 0,9 et sqrt(0,09/2000) ; `A3` effet attendu 20 % ne transforme pas le seuil coût en 0,8 ; `A4` grille sans effectif satisfaisant renvoie `TARGET_NOT_REACHED` ; `A5` même entrée/version/graine donne même sortie ; `A6` arrêt anticipé à la première significativité interdit dans ce plan à effectif fixé ; `A7` cible 0,90 et erreur maximale 0,01, résultats fournis N=10/p=0,85/se=0,01, N=20/p=0,91/se=0,005, N=30/p=0,95/se=0,01 : sélection N=20.

Commande : `pnpm verify:task T35`. Fin : fixtures de calcul, limites d’exécution et hypothèses exportées. L’effectif adéquat pour une étude réelle n’est pas un nombre que cette tâche peut fournir avant calibration.

**T36 — Générer un rapport dont les nombres proviennent des résultats**

Dépendances : T31, T32, T33 et T34. Livrables : rapport Markdown/HTML et graphiques statiques exportables, tous liés au manifeste de données.

Le rendu narratif repose sur des templates et des références structurées `fact_id`. Si un LLM propose une phrase, il fournit les références aux faits ; le moteur insère lui-même les nombres. Du texte libre contenant des affirmations numériques non rattachées à un fait calculé n’entre pas dans le rapport certifié. Il n’est pas demandé de résoudre automatiquement toute contradiction possible du langage naturel.

Acceptation : `T36.A1` F-QUALITY affiche 0,8125 et 2/3 avec arrondi annoncé, sans remplacer U par 0,7 ; `A2` F-COST-RATIO affiche 5/6 et les deux moyennes ; `A3` une trajectoire échouée reste dans les courbes ; `A4` chaque graphique porte unités, mode, population et nature des bandes ; `A5` coût non réconcilié et données manquantes apparaissent dans le rapport ; `A6` une note narrative contenant un chiffre contradictoire est refusée ou supprimée sans changer le tableau calculé.

Commande : `pnpm verify:task T36`. Fin : comparer les données sous-jacentes des graphiques et leurs métadonnées, pas un hash de pixels sensible à la plateforme. Le rapport par templates est suffisant ; une rédaction LLM est facultative et ne conditionne pas le jalon.

**T37 — Balayer les points de panne et vérifier les reprises**

Dépendances : T15, T17, T20, T23, T24, T25, T26 et T31. Livrables : catalogue de points d’injection, fixtures d’historique et runner de fault tests.

Points obligatoires : avant/après upload ; avant/après commit de résultat ; avant/après DISPATCH_STARTED ; après réception fournisseur avant sauvegarde de réponse ; après sauvegarde avant règlement ; après déploiement avant accusé ; pendant checkpoint ; avant publication de période ; bail expiré.

Acceptation : `T37.A1` chaque point a un scénario et une attente explicite ; `A2` effets locaux contrôlés rejoués sans double publication ; `A3` réponse distante ambiguë aboutit à UNKNOWN ou réconciliation prouvée, jamais à zéro ; `A4` anciennes copies d’évaluation détruites et aucune sentinelle divulguée ; `A5` pertes ou doublons de reçus détectés ; `A6` arrêt répété ne retire aucune période du calendrier ; `A7` journal de reprise complet avec identités stables.

Commande : `pnpm verify:task T37`. Fin : tous les cas obligatoires exécutés. L’équivalence au nominal porte sur les états métier lorsque la reprise est effectivement déterminable ; pour un effet distant irréconciliable, le résultat attendu est l’ambiguïté explicite, pas une fausse équivalence.

**T38 — Valider six trajectoires complètes avec un résultat chiffré exact**

Dépendances : T23, T24, T26, T30, T31, T32, T33, T34, T36 et T37. Livrables : fixture `golden-six`, commande `bench campaign fixtures/golden-six.json` et attestation CORE_VERIFIED.

Fixture : un projet, un scénario de quatre périodes, deux configurations scriptées conformes, trois répétitions, deux appels F-MONEY par période. Tous les autres tarifs valent explicitement zéro dans cette fixture fictive. Tous les parcours valides et exigences actives sont satisfaits.

Acceptation : `T38.A1` six trajectoires et 24 périodes ; `A2` 48 appels reçus et réglés ; `A3` 2720 micro-USD par trajectoire, 16320 au total ; `A4` Q=R=V=U=1 et G=0 ; `A5` un, deux et six workers donnent mêmes résultats métier, comptes et verdicts ; `A6` application indisponible forcée pendant un workload conserve toutes ses intentions et fait baisser R ; `A7` F-FAILURE produit un échec produit dans une exécution moteur terminée ; `A8` inférence interprojets refusée sur cette fixture à un seul parent, malgré six trajectoires.

Commande : `pnpm verify:task T38`. Fin : attestation uniquement après tous les cas. Les 16320 micro-USD sont une vérité de test, pas une estimation du prix d’une expérience réelle.

**T39 — Fournir la recette d’un pilote complet et son préflight**

Dépendances : T28, T29, T30, T35 et T38. Livrables : manifeste modèle pour six projets sources, douze périodes, deux configurations et trois répétitions ; commande de préparation et export d’hypothèses.

Acceptation : `T39.A1` compile 36 trajectoires et 432 périodes ; `A2` missing modèle, prix, corpus, exposition ou budget produit une liste complète de prérequis manquants avant tout appel ; `A3` six clones d’un même scénario conservent un seul parent statistique et ne sont pas vendus comme six projets indépendants ; `A4` le profil recorded peut tester la mécanique du pilote avec ses labels fictifs ; `A5` une campagne live autorisée par sa configuration respecte ses plafonds et laisse des résultats même si tous les candidats échouent ; `A6` le préflight ne lance jamais implicitement la campagne.

Commande : `pnpm verify:task T39`. Fin : recette exécutable et admission testée avec fournisseur factice. Le lancement réel, le corpus représentatif et les paramètres de puissance calibrés sont des opérations de recherche séparées. Leur absence ne doit pas être masquée par une attestation de préparation.

**T40 — Vérifier la capacité de distribution sans facture IA massive**

Dépendances : T24, T25, T26, T31 et T38. Livrables : profil de charge, plan de distribution et mesures de ressources de contrôle.

Acceptation : `T40.A1` plan 30 projets × 2 scénarios × 3 configurations × 5 répétitions × 1 budget produit 900 trajectoires et 21600 périodes ; `A2` la validation du plan fait zéro appel modèle ; `A3` test borné de 100 workflows courts avec Activities factices termine avec 100 résultats, sans doublon ; `A4` plafond dix jobs actifs jamais dépassé, observé avec barrière ; `A5` arrêt/reprise du scheduler ne perd aucun job ; `A6` les historiques contiennent des références aux gros artefacts et non leur contenu.

Commande : `pnpm verify:task T40`. Fin : nombres et invariants validés ; consommation et durée mesurées à titre descriptif. Ce test ne garantit ni 900 sandboxes simultanés sur une machine donnée, ni une accélération linéaire, ni un débit fournisseur.

**T41 — Livrer les commandes opérationnelles et la CI de qualification**

Dépendances : T30, T36, T37, T38, T39 et T40. Livrables : CLI complète, composition locale, CI et nettoyage ciblé.

Commandes minimales : `bench doctor`, `scenario validate`, `campaign plan`, `campaign preflight`, `campaign run`, `campaign status`, `campaign cancel`, `campaign resume`, `checkpoint inspect`, `checkpoint fork`, `billing reconcile`, `analysis export`, `analysis run`, `report build`. Syntaxe exacte et codes de sortie figés dans le help et testés.

Acceptation : `T41.A1` doctor identifie chaque dépendance absente ; `A2` aucune clé réelle nécessaire pour tous les gates recorded ; `A3` l’option live sans modèle/budget/credential échoue avant émission ; `A4` annuler une campagne ne supprime pas ses artefacts ni ceux d’une autre ; `A5` un échec d’acceptation fait échouer la CI ; `A6` nettoyage ne cible que les ressources portant l’identité de test ; `A7` les commandes documentées correspondent aux commandes parsées.

Commande : `pnpm verify:task T41`. Fin : installation dans un environnement vierge, procédure de préparation des dépendances, puis tests avec réseau externe désactivé hors services locaux explicitement requis. Les downloads initiaux ne sont pas confondus avec des appels réseau de l’expérience.

**T42 — Effectuer une qualification indépendante de bout en bout**

Dépendances : T00 à T41. Livrables : jeu d’acceptation final séparé des tests unitaires, scripts de rejeu et rapport d’audit.

Acceptation : `T42.A1` les 42 tâches précédentes possèdent leurs preuves courantes ; `A2` le pack golden-six se rejoue depuis une installation vierge ; `A3` une version volontairement altérée du calcul de coût, de la garde de révélation, du dénominateur R, de l’appariement statistique et de l’état UNKNOWN échoue chacune au gate concerné ; `A4` reconstruction du rapport depuis les seuls exports donne mêmes valeurs ; `A5` vérifier un échantillon fixé de checkpoints sur processus neuf ; `A6` aucune attestation LIVE_VALIDATED si aucun reçu live n’existe.

Commande : `pnpm verify:task T42`. Fin : l’indépendance signifie ici données de référence et vérification extérieure au candidat, pas garantie que le même agent implémenteur soit infaillible. Si un autre agent relit, il utilise les mêmes commandes et n’accorde aucune dérogation subjective aux sorties attendues.

**T43 — Produire le paquet de passation et l’état final exact**

Dépendances : T42. Livrables : dépôt versionné, guide opératoire, manifeste des tâches, fixtures, contrats, preuves, limitations et exemples de commandes.

Acceptation : `T43.A1` toutes les références documentaires pointent vers des fichiers existants ; `A2` un utilisateur du dépôt peut identifier pour chaque tâche dépendances, commande et preuve ; `A3` aucun TODO non résolu sur un chemin obligatoire ni test sauté dans les suites d’acceptation ; `A4` résumé final liste CORE_VERIFIED, PILOT_READY, HANDOFF_COMPLETE et statut live exact ; `A5` versions et commit de livraison correspondent aux preuves ; `A6` refaire le recalcul numérique à partir du paquet ne nécessite ni clé API ni mémoire de la conversation.

Commande : `pnpm verify:task T43`. Fin : paquet complet, autonome et auditable. Ne pas annoncer qu’un modèle est meilleur, qu’un prix réel est établi ou que la représentativité scientifique est démontrée au seul motif que l’implémentation est terminée.

**I. Ordre conseillé, jalons et parallélisme d’implémentation**

Les numéros donnent un ordre de lecture, pas l’obligation de terminer T29 avant de commencer T30. Le registre de dépendances fait autorité. Un agent unique peut suivre l’ordre numérique ; plusieurs agents peuvent travailler sur les branches prêtes, avec le même intégrateur.

| Jalon | Résultat concret | Tâches déterminantes |
| --- | --- | --- |
| J0 | Contrats et preuves vérifiables | T00–T03 |
| J1 | Une histoire de produit rejouable en mémoire | T04–T11 |
| J2 | État persistant et comptabilité de chaque appel | T12–T18 |
| J3 | Un vrai logiciel de test isolé évolue sur quatre périodes | T19–T23 |
| J4 | Trajectoires durables, distribuées et reprenables | T24–T27 |
| J5 | Connecteur réel et fabrique de scénarios qualifiés | T28–T30 |
| J6 | Analyse statistique et rapports vérifiés | T31–T36 |
| J7 | Instrument qualifié sur campagne déterministe | T37–T38 |
| J8 | Pilote et distribution préparés, passation complète | T39–T43 |

Après T03, trois branches peuvent commencer : domaine/métriques T04–T05, scénario/oracle T06–T10, artefacts T13–T14. PostgreSQL T12 devient disponible après T05 ; comptabilité T16–T17 suit. L’analyse T31–T36 peut ensuite avancer sur des journaux connus, pendant que l’isolation et l’orchestration sont construites. Les intégrations T23, T38 et T42 raccordent les contrats effectivement testés.

Attribution de propriété : un agent possède une tâche et ses fichiers de test ; un intégrateur possède les schémas partagés et les exports de paquets. Les modifications d’un contrat publié passent d’abord par ce responsable. Les branches parallèles ne réécrivent pas le même lockfile, la même migration ou le même registre de tâches. Des worktrees distincts sont préférables ; la fusion déclenche les contrôles des contrats modifiés et des consommateurs concernés.

Chaque suite d’intégration reçoit un `test_run_id` technique unique, ses bases/schémas, préfixes d’artefacts, files et ressources. Ce namespace évite les interférences ; il ne modifie pas les graines métier ou l’assignation scientifique. Les comparaisons canonisent uniquement les ids de lancement et métadonnées explicitement volatiles, en conservant projet, scénario, configuration, budget, répétition, période et résultat.

La comparaison un/deux/six workers de T38 emploie des namespaces vierges distincts : réutiliser des résultats idempotents existants et compter zéro nouvel appel ne valide pas le parallélisme. Les tests de performance physique sont séparés des contrôles d’ordonnancement et utilisent des ressources réservées.

**J. Registre compact des dépendances**

À transcrire dans `verification/tasks.json`. Le validateur refuse id inconnu, cycle, doublon ou dépendance absente. Les livrables et cas d’acceptation détaillés restent ceux de H.

| Tâche | Dépendances directes |
| --- | --- |
| T00 | — |
| T01 | T00 |
| T02 | T01 |
| T03 | T02 |
| T04 | T02, T03 |
| T05 | T03, T04 |
| T06 | T03 |
| T07 | T02, T06 |
| T08 | T06, T07 |
| T09 | T07 |
| T10 | T07, T08, T09 |
| T11 | T04, T05, T06, T08, T10 |
| T12 | T03, T05 |
| T13 | T02, T03 |
| T14 | T13 |
| T15 | T09, T12, T13, T14 |
| T16 | T02, T12 |
| T17 | T12, T16 |
| T18 | T03, T06, T15, T17 |
| T19 | T14, T15, T17, T18 |
| T20 | T10, T15, T19 |
| T21 | T05, T09, T15, T20 |
| T22 | T04, T08, T20, T21 |
| T23 | T12, T15, T18, T19, T20, T21, T22 |
| T24 | T05, T23 |
| T25 | T17, T19, T23, T24 |
| T26 | T03, T17, T24, T25 |
| T27 | T15, T16, T24, T26 |
| T28 | T17, T18, T19, T25 |
| T29 | T06, T07, T10, T17, T28 |
| T30 | T03, T10 |
| T31 | T04, T12, T16 |
| T32 | T04, T31 |
| T33 | T02, T32 |
| T34 | T03, T32, T33 |
| T35 | T02, T32, T33, T34 |
| T36 | T31, T32, T33, T34 |
| T37 | T15, T17, T20, T23, T24, T25, T26, T31 |
| T38 | T23, T24, T26, T30, T31, T32, T33, T34, T36, T37 |
| T39 | T28, T29, T30, T35, T38 |
| T40 | T24, T25, T26, T31, T38 |
| T41 | T30, T36, T37, T38, T39, T40 |
| T42 | Toutes les tâches T00 à T41 |
| T43 | T42 |

Exemple de fiche à créer pour T17 :

```json
{
  "id": "T17",
  "title": "Passerelle modele et reponse perdue",
  "depends_on": ["T12", "T16"],
  "source_paths": ["packages/gateway", "packages/billing"],
  "acceptance_entry": "acceptance/T17.spec.ts",
  "required_cases": ["T17.A1", "T17.A2", "T17.A3", "T17.A4", "T17.A5", "T17.A6", "T17.A7"],
  "verification_command": ["pnpm", "verify:task", "T17"],
  "requires": ["postgres", "fake-provider"],
  "requires_live_credentials": false,
  "status": "NOT_IMPLEMENTED"
}
```

`status` décrit l’avancement déclaré. Le vérificateur calcule sa propre décision à partir des preuves ; éditer ce champ en DONE ne valide rien. Les listes de cas définissent un minimum : des tests supplémentaires sont possibles lorsqu’ils couvrent un risque concret. Les tests de comportement sont obligatoires ici parce que les coûts, états distribués et résultats scientifiques dépendent directement de ces propriétés.

**K. Contrat de reprise du travail par l’agent**

À chaque reprise de session, l’agent lit le cahier, le registre des tâches et les derniers rapports. Il vérifie le commit, les empreintes et les blocages. Il choisit une tâche non terminée dont toutes les dépendances sont acceptées. Il n’infère pas la réussite d’une tâche d’après un résumé de conversation.

Le compte rendu d’une tâche fournit exactement : id ; commit source ; fichiers ou paquets modifiés ; commande exécutée ; cas passés/échoués ; référence du rapport ; limite éventuelle. Un blocage identifie le prérequis manquant et toutes les tâches indépendantes encore réalisables. L’agent poursuit ces tâches au lieu de remplacer un service réel requis par un mock pour clore artificiellement la tâche bloquée.

Si une nouvelle exigence de ce cahier rend une précédente fixture contradictoire, inscrire une entrée `SPEC_CONFLICT` avec les deux passages et leur effet. Résoudre la contradiction explicitement avant de déclarer le test terminé. La revue a déjà fixé les ambiguïtés de budget, de continuation P3, de métriques vides et de preuve liée au commit ; l’agent ne doit pas réintroduire une autre convention implicitement.

Des contrôles ciblés suffisent pendant le développement. Aux jalons, et après un changement d’interface, exécuter les dépendances et consommateurs impactés. T42 réexécute les gates complets sur le commit de qualification ; aucun ancien rapport ne prouve le commit final. Les preuves générées sont archivées hors du dépôt source suivi.

**L. Frontières du périmètre de livraison**

Obligatoire : moteur autonome ; scénario réservation et ses variantes DSL ; agents scriptés ; premier connecteur réel testé contractuellement ; facturation ; isolation ; persistence ; évolution des données ; workflows ; distribution ; analyses ; rapports ; CLI ; preuves de qualification.

Extensions pouvant être déléguées après T43, chacune avec nouveaux contrats et fixtures : autres domaines métier ; second fournisseur de modèles ; navigateur et évaluation d’interfaces graphiques ; simulation d’endurance en temps réel ; collecte et calibration sur historiques autorisés ; déploiement de workers sur un cloud particulier. Leur absence ne doit pas être cachée dans le rapport final.

Un connecteur contractuellement vérifié sans credential est une implémentation disponible, pas une intégration live déjà observée. Un corpus de variantes de réservation qualifié est un terrain expérimental, pas une population représentative de l’ensemble du logiciel. L’indépendance statistique, les coûts inconnus et ces limites sont des données du rapport, pas des phrases ajoutées après un résultat décevant.

**M. Références techniques guidant les contrats**

- Les workflows Temporal doivent rester compatibles avec le replay ; les interactions externes appartiennent aux Activities. Cette propriété motive T24 et ne dispense pas du journal de facturation. [Définition et déterminisme des workflows](https://docs.temporal.io/workflow-definition).
- Temporal documente les tests de workflows, d’Activities et les environnements de test avec saut de temps. Le temps du serveur de test peut être commun à plusieurs tests ; utiliser des environnements séparés lorsque leurs horloges sont incompatibles. [Tests TypeScript](https://docs.temporal.io/develop/typescript/best-practices/testing-suite).
- Les exécutions d’Activities peuvent connaître reprises et retries ; leurs effets distants nécessitent une stratégie explicite de déduplication ou de réconciliation. [Exécution des Activities](https://docs.temporal.io/activity-execution).
- L’isolation des transactions PostgreSQL est une propriété du stockage local ; elle n’étend pas une transaction à un appel API externe. Les tests T12/T16 exercent les races pertinentes. [Isolation des transactions](https://www.postgresql.org/docs/current/transaction-iso.html).
- `pg_dump` produit une sauvegarde cohérente de la base. La cohérence avec le code, les fichiers et les files reste à assurer par la barrière T15. [Documentation pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).
- Le SDK TypeScript officiel Anthropic fournit le premier connecteur proposé ; sa version, son schéma de réponse et ses options effectives doivent être verrouillés lors de l’implémentation. [Dépôt officiel du SDK](https://github.com/anthropics/anthropic-sdk-typescript).

Les propriétés scientifiques, fixtures et seuils de décision de ce cahier sont des choix explicites d’instrumentation. Les références techniques ne constituent pas une validation empirique du benchmark proposé.
