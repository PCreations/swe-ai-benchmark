/**
 * acceptance/T55.spec.ts — suite d'acceptation de la tache T55.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T55.A1 absence   — lance par `bench pilot-conduct --provider claude-cli
 *                      --live`, le prompt RECU par la session de chaque
 *                      periode contient l'enonce de T53 de cette periode et
 *                      ne contient ni le champ `satisfied` ni une regle
 *                      d'une periode suivante
 *   T55.A2 behaviour — a chaque periode d'une execution du pilote, les
 *                      controles PERSISTES sont exactement ceux des
 *                      exigences dues a cette periode
 *   T55.A3 behaviour — avec un candidat de reference conforme au seul
 *                      prompt recu, chaque controle du est satisfait a
 *                      chaque periode
 *   T55.A4 numeric   — le rapport de fin d'une execution du pilote dont une
 *                      sortie brute contient des retours a la ligne et le
 *                      caractere `|` agrege exactement l'usage PERSISTE
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T55 EST UNE TACHE D'EXTENSION (ADR-012) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T55 — `packages/
 * activities`, `apps/cli` — et ne les a lus ni directement ni par `git
 * show` (ADR-001 : aveuglement PROCEDURAL, discipline auditable au diff,
 * pas une barriere technique). Le contrat teste ci-dessous est derive de
 * docs/specs/T55.md et de sa source, docs/adr/ADR-012-proprietes-du-pilote-
 * sur-le-chemin-reel.md, lignes 44 a 50 (la plage que la carte de T55
 * epingle dans verification/tasks.extensions.json#spec_source) :
 *
 *   L44  titre : « Verifier les proprietes du pilote sur le chemin reel »
 *   L46  dependances T52, T53 et T54 ; livrables, mot pour mot : « le
 *        prompt reel du pilote construit a partir de l'enonce de T53 ; le
 *        controle reel du pilote restreint aux exigences dues ; un faux
 *        `claude` qui enregistre le prompt recu, et une suite qui verifie
 *        chaque propriete du candidat reel par la commande du pilote
 *        elle-meme »
 *   L48  les quatre cas d'acceptation, mot pour mot
 *   L50  commande : `pnpm verify:task T55`. « PostgreSQL, le stockage objet
 *        et le faux executable `claude` sont requis ; aucun appel reel. »
 *
 * Cette suite lit en outre, dans le corps narratif du MEME document ACCEPTE
 * (hors de la plage L44-50 epinglee par la carte — exactement la liberte
 * que prennent deja acceptance/T48.spec.ts a T54.spec.ts face a leur propre
 * ADR), les sections « Ce que le second essai reel a montre » et « Le
 * defaut de fond, pour la troisieme fois », qui NOMMENT le defaut precis
 * que T55 doit desormais verifier SUR LE CHEMIN REEL (jamais sur une piece
 * isolee) :
 *
 *   « Non corrige » #1 : « la periode 1 est encore controlee sur les cinq
 *     exigences. `controlIdsDueAt` (T54) filtre la commande
 *     `candidate-control-period`, PAS `controlCandidateCommitOnce`, que le
 *     pilote appelle. » — EXACTEMENT ce que T55.A2 doit fermer : T54.A2
 *     (DEJA ACCEPTE) a prouve le filtre sur `candidate-control-period`
 *     APPELE DIRECTEMENT ; il n'a JAMAIS exerce `pilot-conduct` — c'est le
 *     chemin que cette suite ajoute.
 *   « Non corrige » #2 : « le candidat n'a pas recu l'enonce.
 *     `buildCandidatePeriodPrompt` (T53) n'est pas importe par
 *     `run-period-claude-cli.ts` ; le candidat a repondu `accepted` au lieu
 *     de `confirmed`. » — EXACTEMENT ce que T55.A1 doit fermer : T53.A1-A4
 *     (DEJA ACCEPTES) ont prouve l'enonce au niveau de la fonction/
 *     description EXPORTEE de `packages/scenario`/`packages/activities`,
 *     JAMAIS au niveau de la session REELLEMENT lancee par
 *     `pilot-conduct --provider claude-cli --live` — c'est le chemin que
 *     cette suite ajoute.
 *   « Decision proposee » : « Brancher l'enonce dans le prompt reel et le
 *     filtre dans le controle reel (livrables DEJA ACCEPTES de T53 et
 *     T54), et verifier chaque propriete du candidat reel sur
 *     `bench pilot-conduct --provider claude-cli --live`, avec un faux
 *     `claude` qui ENREGISTRE le prompt qu'il recoit. » — cette suite
 *     NE REDERIVE NI L'ENONCE (T53) NI LE FILTRE (T54) : elle les traite
 *     comme des oracles DEJA ACCEPTES (meme discipline que acceptance/
 *     T52.spec.ts face a T49/T50/T51, acceptance/T54.spec.ts face a T47),
 *     et verifie SEULEMENT qu'ils atteignent reellement le chemin que
 *     `pilot-conduct --provider claude-cli --live` emprunte.
 *
 * Cette suite REPREND, SANS LES RELIRE, les conventions et contrats DEJA
 * FIXES par les suites ACCEPTEES dont elle depend (jamais des sources de
 * T55) :
 *   - acceptance/T53.spec.ts (III) : l'ENONCE d'une periode est le texte
 *     exporte, resolu depuis UNE description unifiee de `packages/
 *     scenario`/`packages/activities` qui porte a la fois un temoin de
 *     `bench.candidate/2` et, pour P1..P4, un noeud {enonce, vocabulaire}.
 *     Les ancrages geles `S1` (creneau, actif depuis P1), `waiting` (file
 *     d'attente, actif depuis P2), `2030-01-02T12:00:00Z` (frontiere
 *     d'annulation, actif depuis P3), `NOT_FOUND` (isolation inter-
 *     locataire, actif a P4 seulement) et `satisfied` (verdict de controle,
 *     JAMAIS dans un prompt) — REPRIS A L'IDENTIQUE, jamais re-derives.
 *   - acceptance/T51.spec.ts (II.6, table `ECHEANCE_CONTROLE`, ajout trace
 *     par SC-003 option A) : les CINQ identifiants de controle fixes
 *     (ADR-009:L34) sont dus, PAR PERIODE CUMULEE, ainsi — `reserve@1`/
 *     `idempotence@1` a P1, `cancel@1`/`fifo@1` a P2 (en plus des deux de
 *     P1), `isolation@1` a P4 (en plus des quatre precedents) — REPRISE A
 *     L'IDENTIQUE, jamais re-derivee : cette table a DEJA ete ancree par
 *     T51.spec.ts contre la racine gelee acceptance/reference/
 *     F-RESERVATION.json, et T54.spec.ts (A2) en a DEJA prouve le premier
 *     palier (P1) sur `candidate-control-period` appele directement.
 *   - acceptance/T52.spec.ts (II.1-4) : `bench pilot-conduct <manifest.json>
 *     --campaign-id <id> --postgres-database <db> --s3-bucket <bucket>
 *     --mode recorded --provider claude-cli --live --candidate-workspace-
 *     root <dir> [--test-stop-after-periods <n>]`, le champ de sortie
 *     `candidate_control_report: [{trajectory_key, periods: [{period_index,
 *     satisfied, violated}]}]`, et le rappel INDEPENDANT, sur le MEME
 *     `trajectory_key`, de `candidate-control-report --campaign-id <id>
 *     --postgres-database <db>` (T51, DEJA PROUVE) comme second temoin.
 *   - acceptance/T54.spec.ts (II/III.1) : la technique de SORTIE BRUTE
 *     HOSTILE (JSON valide, mais contenant REELLEMENT un retour a la ligne
 *     — indentation `JSON.stringify(obj,null,2)` — ET un caractere `|`
 *     litteral dans `session_id`), et l'oracle « deux periodes IDENTIQUES
 *     (meme environnement partage par `pilot-conduct`, DEJA observe par
 *     acceptance/T49.spec.ts A4) -> le total agrege doit DOUBLER
 *     exactement chaque categorie d'UNE periode ».
 *   - acceptance/T46.spec.ts (II.2) : `token_report`/`candidate_token_
 *     report` est un AGREGAT CUMULATIF, « de TOUS les appels regles
 *     PERSISTES A DATE pour cette campagne » — explicitement LU EN BASE
 *     a chaque invocation, jamais recalcule depuis la seule memoire du
 *     processus courant. C'est ce fait, DEJA etabli pour `pilot-conduct`
 *     en general, que T55.A4 exerce SPECIFIQUEMENT sur une sortie hostile
 *     relue depuis une invocation ANTERIEURE (II.4 ci-dessous).
 *   - acceptance/fixtures/candidates/reservation-candidate-v2.mjs (zone
 *     ACCEPTANCE, DEJA publie par T51, repris SANS MODIFICATION par T52) :
 *     le candidat de reference CORRECT, qui satisfait les cinq classes de
 *     controle a CHAQUE periode ou elles sont dues (T51, test A1 : « (5,0)
 *     nominal »).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUE CETTE SUITE AJOUTE OU FIXE ELLE-MEME (ADR-001 : aucune des valeurs
 * ci-dessous n'a ete obtenue en executant une implementation de T55 — aucune
 * n'existe au moment ou cette suite est ecrite)
 *
 * 1. EXTENSION ADDITIVE DU FIXTURE `acceptance/fixtures/claude-cli/bin/
 *    claude` (zone ACCEPTANCE, DEJA publie par T47, etendu par T49/T52) :
 *    DEUX nouvelles variables d'environnement, `BENCH_FAKE_CLAUDE_RECORD_
 *    FILE_PLAN_DIR` et `BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE`,
 *    documentees dans le fichier lui-meme. NECESSAIRES exactement pour la
 *    raison nommee par ADR-012 (« un faux `claude` qui enregistre le prompt
 *    qu'il recoit ») : le simple `BENCH_FAKE_CLAUDE_RECORD_FILE` (T47) est
 *    ECRASE a chaque invocation — DEJA observe par T49.spec.ts A4 pour
 *    `modelUsage` (« le fixture ne peut pas distinguer P1 de P2 par son
 *    propre etat ») — et ne peut donc PAS, par construction, faire la
 *    preuve exigee par T55.A1 : observer le prompt distinct RECU par
 *    CHACUNE des deux periodes d'UN MEME appel `pilot-conduct`. Le
 *    mecanisme ajoute (repertoire + compteur, N-ieme invocation ->
 *    `record-N.json`) est le PARALLELE EXACT, pour le prompt, de ce que
 *    acceptance/T52.spec.ts (II.7) a deja ajoute pour le CONTENU ecrit par
 *    le candidat (`WORKSPACE_WRITE_PLAN_FILE`/`_COUNTER_FILE`) — meme
 *    geste, compteur INDEPENDANT (jamais partage), aucun changement de
 *    comportement par defaut pour les suites qui ne le posent pas.
 * 2. REUTILISATION, SANS MODIFICATION, DE LA RESOLUTION DE L'ENONCE DE T53
 *    (acceptance/T53.spec.ts III.1-2) : cette suite reimplemente, a
 *    l'identique, `loadPackage`/`flatten` (import ESM direct de `packages/
 *    scenario` et `packages/activities`), `noeudPeriode`, `portecontratV2`,
 *    `resoudreDescriptionUnifiee` et `promptDePeriode` — PAS pour re-tester
 *    T53 (DEJA ACCEPTE, jamais re-verifie ici), mais pour SERVIR D'ORACLE :
 *    le texte et le vocabulaire qu'une implementation CORRECTE de T53
 *    produit pour P1 et P2, contre lequel cette suite compare le prompt
 *    REELLEMENT recu par la session relle de `pilot-conduct`.
 * 3. LE MANIFESTE REUTILISE, JAMAIS MODIFIE : `acceptance/fixtures/pilot-
 *    longitudinal/manifest-t49-claude-cli-small.json` (REPRIS A L'IDENTIQUE
 *    de T49/T52/T54 — UNE trajectoire, DEUX periodes, modele `bench-fake-
 *    claude-cli-model-a`). `source_scenario_id` y vaut `SCN-PILOT-SMALL`
 *    (identite de CAMPAGNE/corpus) — ce qui NE CHANGE PAS le scenario
 *    METIER scripte que `run-period`/`pilot-conduct` appliquent par DEFAUT
 *    en l'absence de `--scenario-id` : `SCN-F-RESERVATION` (FIXE par
 *    acceptance/T45.spec.ts, II, ANCRE sur ADR-007:L117), celui-la meme
 *    contre lequel acceptance/T51.spec.ts/T52.spec.ts ont DEJA observe la
 *    repartition (5,0)/(4,1) SUR CE MEME MANIFESTE, sans jamais passer
 *    `--scenario-id`. Cette suite n'en fait donc PAS une hypothese
 *    nouvelle : elle REUTILISE un fait DEJA exploite par deux suites
 *    ACCEPTEES.
 * 4. LA STRUCTURE « REPRISE » DE T55.A4 (DEUX appels `pilot-conduct`
 *    successifs sur LA MEME campagne — `--test-stop-after-periods 1` puis
 *    sans plafond). AUCUNE suite anterieure n'exerce cette sequence avec
 *    une sortie HOSTILE : T54.A1 construit sa preuve de doublage en UN SEUL
 *    appel continu (periode 1 et periode 2 dans LE MEME processus, jamais
 *    relu depuis une invocation anterieure acheve), et T46.A2 exerce la
 *    reprise (II.2 ci-dessus) mais JAMAIS avec une sortie hostile. ADR-012
 *    L48 dit « l'usage PERSISTE », pas « l'usage produit » : cette suite
 *    prend ce mot au pied de la lettre et force le rapport de fin de la
 *    SECONDE invocation a incorporer l'usage de la PREMIERE periode,
 *    PERSISTEE par un processus qui n'existe plus — le seul moyen d'exercer
 *    un chemin de relecture (potentiellement par `psql`) QUI NE SOIT PAS
 *    simplement la memoire du processus courant, exactement ce que la
 *    perturbation nommee par cases.extensions.lock.json#T55.A4 decrit
 *    (« relire l'usage par decoupe psql dans le chemin DU PILOTE »).
 * 5. LE CANDIDAT DE REFERENCE DE T55.A3, DERIVE DU SEUL PROMPT RECU
 *    (acceptance/fixtures/claude-cli/t55-derive-reference-candidate.mjs, et
 *    la variable ADDITIVE `BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE`/
 *    `_LOG_DIR` du faux `claude`). Un candidat FIXE a l'avance (le
 *    `reservation-candidate-v2.mjs` de T51, qu'A1/A2 continuent d'ecrire)
 *    ne depend PAS du prompt : retirer le vocabulaire du prompt reel (la
 *    perturbation prescrite pour A3) le laissait VERT — cas creux, mesure
 *    par la porte GATES. Pour A3, le faux `claude` passe le prompt de CETTE
 *    invocation au generateur, qui en EXTRAIT par motifs de CONTEXTE (la
 *    phrase qui introduit la valeur, jamais la valeur elle-meme) chaque
 *    statut, chaque code d'erreur et chaque parametre (debut du creneau,
 *    delai, frontiere, capacite) ; le squelette metier est fixe, mais chaque
 *    litteral que les controles comparent vient du prompt. Valeur absente :
 *    marqueur `<absent-du-prompt:ROLE>`, jamais une valeur inventee. SEULE
 *    exception, un nombre et jamais un terme de vocabulaire : la capacite,
 *    que le prompt de P2 designe sans la redonner (« en plus des regles de
 *    P1 »), est relue dans le `candidate.mjs` de la periode precedente
 *    present dans le depot de la session — ce qu'une vraie session ferait.
 *    A3 verifie en outre, periode par periode, que le generateur a consomme
 *    le prompt REELLEMENT enregistre (II.1) et que le source ecrit ne porte
 *    AUCUN litteral de vocabulaire (vocabulaire declare P1..P4, litteraux en
 *    dur du candidat fixe, ancrages geles) absent de ce prompt.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 *   `pilot-conduct`,`run-period`,`candidate-control-period`,
 *   `candidate-control-report`,`--campaign-id`,`--postgres-database`,
 *   `--s3-bucket`,`--mode`,`recorded`,`--provider`,`claude-cli`,`--live`,
 *   `--candidate-workspace-root`,`--test-stop-after-periods`,
 *   `--test-reread-period`                                    — apps/cli/README.md (zone DOCS,
 *                                                                jamais une source de T55 ; ces
 *                                                                sous-commandes et drapeaux sont
 *                                                                DEJA ACCEPTES par T45/T46/T48/
 *                                                                T49/T51/T52)
 *   `candidate_token_report`,`by_model`,`trajectories`,
 *   `trajectory_key`,`periods_persisted`                       — acceptance/T46.spec.ts/T49.spec.ts (II)
 *   `candidate_control_report`,`periods`,`period_index`,
 *   `satisfied`,`violated`                                      — acceptance/T51.spec.ts (II.3)/T52.spec.ts (II.2)
 *   `reserve@1`,`idempotence@1`,`cancel@1`,`fifo@1`,`isolation@1`,
 *   table ECHEANCE_CONTROLE                                     — acceptance/T51.spec.ts (II.6, SC-003 option A)
 *   `S1`,`2030-01-03T12:00:00Z`(debut creneau),`waiting`,
 *   `2030-01-02T12:00:00Z`(frontiere P3),`NOT_FOUND`,`satisfied`
 *   (absence de verdict)                                        — acceptance/T53.spec.ts (IV), lui-meme
 *                                                                ancre sur acceptance/reference/
 *                                                                F-RESERVATION.json
 *   `reservation-candidate-v2.mjs`, repartition (5,0) nominal    — acceptance/T51.spec.ts (test A1)/T52.spec.ts (II.8)
 *   `input_fresh`,`cache_read`,`output`                          — acceptance/T44.spec.ts (III)/T54.spec.ts
 *   `bench-fake-claude-cli-model-a`,`manifest-t49-claude-cli-
 *   small.json`,`periods_per_trajectory=2`                      — acceptance/T49.spec.ts (II)
 *   `SCN-F-RESERVATION` (scenario par defaut)                    — acceptance/T45.spec.ts (II), ancre ADR-007:L117
 *   « agregat CUMULATIF [...] lues en base »                     — acceptance/T46.spec.ts (II.2)
 *   « buildCandidatePeriodPrompt [...] n'est pas importe
 *     par run-period-claude-cli.ts [...] accepted au lieu
 *     de confirmed »                                             — docs/adr/ADR-012-proprietes-du-pilote-sur-le-chemin-reel.md
 *   « controlIdsDueAt [...] filtre [...] PAS
 *     controlCandidateCommitOnce »                                — docs/adr/ADR-012-proprietes-du-pilote-sur-le-chemin-reel.md
 *
 * `BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR`/`_COUNTER_FILE` : FIXES ICI
 * (section II.1), par PARALLELISME EXACT avec `BENCH_FAKE_CLAUDE_WORKSPACE_
 * WRITE_PLAN_FILE`/`_COUNTER_FILE` (acceptance/T52.spec.ts, II.7).
 *
 * Les perturbations exactes de A1-A4 sont celles de
 * verification/cases.extensions.lock.json#T55, citees mot pour mot dans la
 * section IV ci-dessous ; verification/mutants/T55.json les realise.
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T55, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 — LE DANGER NOMME (cases.extensions.lock.json) : « construire le
 *     prompt du pilote sans l'enonce de T53 : le cas doit rougir ». Cette
 *     suite n'accepte PAS qu'un prompt REEL contenant SEULEMENT le contrat
 *     `bench.candidate/2` (DEJA exige par T50.A3/T52.A1, jamais re-exerce a
 *     l'identique ici) suffise : elle exige, en PLUS, que CHAQUE valeur du
 *     VOCABULAIRE que packages/scenario declare DYNAMIQUEMENT pour la
 *     periode (jamais une liste hypothese a l'avance par cette suite)
 *     figure litteralement dans le prompt REELLEMENT capture par le faux
 *     `claude` au moment ou `pilot-conduct --provider claude-cli --live`
 *     tourne — fermant exactement le trou qu'ADR-012 nomme (l'enonce
 *     n'atteignait jamais `run-period-claude-cli.ts`). Elle exige en outre
 *     l'ABSENCE, du prompt de P1, du jeton `waiting` — DONT elle verifie
 *     D'ABORD qu'il appartient reellement au vocabulaire DECLARE de P2 et
 *     PAS a celui de P1 (garde CONTROLE-INVALIDE), pour ne jamais confondre
 *     « cette suite n'a pas su le trouver » et « il n'y est reellement
 *     pas ». Une implementation qui enverrait le vocabulaire de TOUTES les
 *     periodes a chaque session (fuite) laisserait cette absence tomber.
 * (2) A2 — LE DANGER NOMME : « controler les cinq exigences a la periode 1
 *     dans controlCandidateCommitOnce : le cas doit rougir ». Cette suite
 *     n'invoque JAMAIS `candidate-control-period` directement (DEJA fait
 *     par T54.A2) : elle passe UNIQUEMENT par `pilot-conduct --provider
 *     claude-cli --live`, qui appelle `controlCandidateCommitOnce` en
 *     interne (ADR-012, « Non corrige » #1, nomme cette fonction par son
 *     nom). Elle exige, pour P1, `satisfied+violated===2` (jamais 5) ET,
 *     pour P2, `satisfied+violated===4` (jamais 5) — table ECHEANCE_
 *     CONTROLE CUMULEE, reprise de T51, jamais re-derivee — par DEUX
 *     temoins INDEPENDANTS (le self-report `candidate_control_report` de
 *     `pilot-conduct` lui-meme, ET un rappel SEPARE de `candidate-control-
 *     report` sur le MEME `trajectory_key`) : une implementation qui
 *     filtrerait correctement dans SON self-report mais persisterait
 *     encore les cinq statuts en base (« evalues ET persistes », l'ADR
 *     nomme les deux) resterait rouge sous le second temoin.
 * (3) A3 — LE DANGER NOMME : « priver le candidat de reference de l'enonce
 *     et observer qu'un controle du echoue malgre une implementation
 *     correcte : le cas doit rougir » (lecture de « avec un candidat de
 *     reference conforme AU SEUL PROMPT RECU, chaque controle du est
 *     satisfait » — ADR L48). Cette suite exige `violated===0` A CHAQUE
 *     periode persistee (P1 ET P2), PAS seulement que le COMPTE des
 *     controles dus soit correct (A2) : un pilote qui filtrerait
 *     correctement QUELS controles evaluer (A2 vert) mais romprait la
 *     CHAINE commit-periode-k -> session-periode-k+1 (T52.A3/A4, DEJA
 *     prouves isolement, jamais re-exerces ici) ferait echouer le candidat
 *     de reference CORRECT sur un controle DU, et A3 — mais pas
 *     necessairement A2 — tomberait.
 *     Et, depuis la mesure GATES (II.5) : le candidat de reference est
 *     DERIVE du prompt recu, de sorte qu'un prompt prive de son vocabulaire
 *     (perturbation prescrite : « retirer le vocabulaire de l'enonce envoye
 *     a la session ») produit un candidat qui repond des marqueurs
 *     `<absent-du-prompt:...>` et viole les controles dus — A3 rougit pour
 *     la raison meme qu'il nomme : le prompt ne suffit plus.
 * (4) A4 — LE DANGER NOMME : « relire l'usage par decoupe psql dans le
 *     chemin du pilote : le cas doit rougir ». Cette suite ne RECYCLE PAS
 *     la preuve d'A1 de T54 (DEJA ACCEPTEE, en UN SEUL appel continu) : elle
 *     force une REPRISE (II.4) — periode 1 persistee par un PREMIER appel
 *     `pilot-conduct`, puis periode 2 ET le rapport de fin PAR UN SECOND
 *     appel, processus NEUF, sur la MEME campagne. Le rapport de fin du
 *     SECOND appel ne peut PAS obtenir l'usage de la periode 1 depuis la
 *     memoire d'un processus qui n'existe plus : il doit la RELIRE
 *     (necessairement depuis PostgreSQL, T44/T46). Une relecture qui
 *     decoupe cette valeur relue sur `\n`/`|` romprait l'egalite numerique
 *     EXACTE (doublage) exigee ici, meme si le PREMIER appel, lui, avait
 *     persiste la valeur intacte.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne redemontre ni l'enonce de T53 au niveau de la description
 *    exportee (acceptance/T53.spec.ts, DEJA ACCEPTE), ni le filtre de T54
 *    au niveau de `candidate-control-period` appele directement (DEJA
 *    ACCEPTE), ni l'enchainement session->commit->controle de T52 (DEJA
 *    ACCEPTE) : elle REUTILISE ces resultats comme des oracles ou des
 *    briques, jamais ne les re-prouve.
 *  • Elle n'exerce que P1 et P2 (le manifeste repris, II.3, n'en porte que
 *    deux) : elle ne fait AUCUNE affirmation sur P3/P4, sauf par les
 *    ancrages geles STATIQUES de T53 (absence de `2030-01-02T12:00:00Z`/
 *    `NOT_FOUND`, jamais actives avant P3/P4).
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` : garde explicite
 *    `verifierFauxEnTetePath`, REPRISE A L'IDENTIQUE de T47/T49/T51/T52/
 *    T54.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;
type Ns = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle
 * commun (repris, sans le reinventer, de acceptance/T52.spec.ts/T54.spec.ts
 * pour le socle CLI+PostgreSQL, et de acceptance/T53.spec.ts pour l'oracle
 * de resolution de l'enonce)
 */

function findRepoRoot(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
const REPO = findRepoRoot();

function rendu(v: unknown, profondeur = 0, vus: Set<unknown> = new Set()): string {
  if (profondeur > 10) return '"…"';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'symbol') return String(v);
  if (t === 'function') return `[fonction ${(v as { name?: string }).name ?? ''}]`;
  if (vus.has(v)) return '"[cycle]"';
  vus.add(v);
  if (v instanceof Error) {
    const code = (v as unknown as Json).code;
    return `${v.name}${typeof code === 'string' ? `(${code})` : ''}: ${v.message}`;
  }
  if (Array.isArray(v)) return `[${v.map((x) => rendu(x, profondeur + 1, vus)).join(',')}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .map((k) => `${JSON.stringify(k)}:${rendu(o[k], profondeur + 1, vus)}`)
    .join(',')}}`;
}
const court = (s: string, n = 900): string => (s.length <= n ? s : `${s.slice(0, n)}…`);

function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t55_${process.pid.toString(36)}_${Date.now().toString(36)}`;

const SOCKET_DIR = ((): string => {
  const h = process.env.PGHOST;
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h;
  return '/var/run/postgresql';
})();
const PG_USER = process.env.PGUSER ?? os.userInfo().username;

function psql(db: string, sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsnFor(db), '-c', sql], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.trim() };
  }
}
function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(PG_USER)}@/${encodeURIComponent(db)}?host=${encodeURIComponent(SOCKET_DIR)}`;
}
const ADMIN_DB = ((): string => {
  for (const cand of ['postgres', PG_USER, 'template1']) {
    if (psql(cand, 'SELECT 1').ok) return cand;
  }
  return 'postgres';
})();

const BASES_CREEES: string[] = [];
const WORKSPACES_CREES: string[] = [];

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  for (const dir of WORKSPACES_CREES) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/* ─────────────────────────────── la commande, observee comme un PROCESSUS */

function entreesCli(): { label: string; argv: string[] }[] {
  const out: { label: string; argv: string[] }[] = [];
  const dir = path.join(REPO, 'apps', 'cli');
  const ajouter = (label: string, f: string): void => {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return;
    if (out.some((c) => c.argv[0] === f)) return;
    out.push({ label, argv: [f] });
  };
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Json;
      const bin = j.bin;
      if (typeof bin === 'string') ajouter('apps/cli:bin', path.resolve(dir, bin));
      else if (bin !== null && typeof bin === 'object') {
        for (const v of Object.values(bin as Json)) if (typeof v === 'string') ajouter('apps/cli:bin', path.resolve(dir, v));
      }
      if (typeof j.main === 'string') ajouter('apps/cli:main', path.resolve(dir, j.main));
    } catch {
      /* manifeste illisible : on retombe sur les chemins usuels */
    }
  }
  for (const rel of ['dist/index.js', 'dist/cli.js', 'bin/bench.js', 'index.js', 'src/index.ts']) {
    ajouter(`apps/cli:${rel}`, path.join(dir, rel));
  }
  ajouter('tools/bench', path.join(REPO, 'tools', 'bench'));
  return out;
}

function executer(argv: string[], env: NodeJS.ProcessEnv): { exit: number | null; sortie: string; stdout: string } {
  try {
    const stdout = execFileSync('node', argv, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: PROC_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { exit: 0, sortie: stdout, stdout };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    const so = String(err.stdout ?? '');
    const se = String(err.stderr ?? '');
    return { exit: err.status ?? null, sortie: `${so}\n${se}`, stdout: so };
  }
}

function jsonDeSortie(s: string): Json | null {
  const essai = (t: string): Json | null => {
    try {
      const v = JSON.parse(t) as unknown;
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
    } catch {
      return null;
    }
  };
  const direct = essai(s.trim());
  if (direct !== null) return direct;
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) {
    const bloc = essai(s.slice(i, j + 1));
    if (bloc !== null) return bloc;
  }
  for (const ligne of s.split('\n').reverse()) {
    const l = essai(ligne.trim());
    if (l !== null) return l;
  }
  return null;
}

let BUILD_TENTE = false;
function construireUneFois(tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[]): void {
  if (BUILD_TENTE) return;
  BUILD_TENTE = true;
  try {
    execFileSync('pnpm', ['build'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: BUILD_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tentatives.push({ label: 'pnpm build', argv: ['pnpm', 'build'], exit: 0, sortie: 'build ok' });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: unknown; stderr?: unknown };
    tentatives.push({
      label: 'pnpm build',
      argv: ['pnpm', 'build'],
      exit: err.status ?? null,
      sortie: court(`${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}`, 400),
    });
  }
}

type AppelCli = {
  resultat: Json | null;
  exit: number | null;
  tentatives: { label: string; argv: string[]; exit: number | null; sortie: string }[];
};

function envDeBase(): NodeJS.ProcessEnv {
  return { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER };
}

function lancer(sousCommande: string, drapeaux: string[], envSupp: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env = { ...envDeBase(), ...envSupp };
  let dernierExit: number | null = null;
  const essayer = (): Json | null => {
    for (const c of entreesCli()) {
      const argv = [...c.argv, sousCommande, ...drapeaux];
      const r = executer(argv, env);
      dernierExit = r.exit;
      const j = jsonDeSortie(r.stdout);
      tentatives.push({ label: c.label, argv, exit: r.exit, sortie: court(r.sortie, 500) });
      if (j !== null) return j;
    }
    return null;
  };
  const premier = essayer();
  if (premier !== null) return { resultat: premier, exit: dernierExit, tentatives };
  construireUneFois(tentatives);
  const second = essayer();
  return { resultat: second, exit: dernierExit, tentatives };
}

function messageEchec(label: string, appel: AppelCli): string {
  return `${label} : ${
    appel.tentatives.map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`).join(' | ') ||
    'aucune entree candidate dans apps/cli ni tools/bench'
  }`;
}

/* ───────────────────────────── extraction de champs — FORME SOUPLE */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 10): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [{ chemin: '$', cle: '', v: racine, p: 0 }];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
    }
  }
  return out;
}
function champProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && n.valeur !== null && n.valeur !== undefined) return n;
  }
  return null;
}
function tableauProfond(racine: unknown, alias: readonly string[]): Noeud | null {
  const cible = new Set(alias.map(normKey));
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && cible.has(normKey(n.cle)) && Array.isArray(n.valeur)) return n;
  }
  return null;
}
const nombre = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : NaN;
const champTexte = (r: unknown, alias: readonly string[]): string | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
};
const champNombre = (r: unknown, alias: readonly string[]): number | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};
function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

/* ════════════════════════ fixture claude-cli (reprise T47/T49/T52/T54) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');

/** Garde explicite — JAMAIS la vraie CLI (`/opt/node22/bin/claude` ou toute autre). */
function verifierFauxEnTetePath(env: NodeJS.ProcessEnv): void {
  const pathVal = env.PATH ?? '';
  const dirs = pathVal.split(path.delimiter).filter((d) => d.length > 0);
  let trouve: string | null = null;
  for (const d of dirs) {
    const cand = path.join(d, 'claude');
    if (fs.existsSync(cand)) {
      trouve = cand;
      break;
    }
  }
  exige(
    trouve !== null && path.resolve(trouve) === path.resolve(CLAUDE_FIXTURE_BIN),
    'claude-resout-vers-le-faux-executable-de-cette-suite',
    `DANGER-APPEL-REEL-POSSIBLE : claude resout vers ${rendu(trouve)}, attendu ${rendu(CLAUDE_FIXTURE_BIN)}`,
  );
}

/** Environnement avec le pair RELPATH/CONTENT (T49, II.3) — UN seul contenu, constant pour
 *  TOUTES les invocations de l'appel qui le recevra. */
function envEcritureConstante(opts: { relPath: string; content: string; recordPlanDir?: string; recordPlanCounterFile?: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH: opts.relPath,
    BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT: opts.content,
  };
  if (opts.recordPlanDir !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR = opts.recordPlanDir;
  if (opts.recordPlanCounterFile !== undefined) env.BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE = opts.recordPlanCounterFile;
  verifierFauxEnTetePath(env);
  return env;
}

/** Repertoire + fichier compteur du PLAN DE PROMPTS (II.1, NOUVEAU par cette suite) — un
 *  `record-N.json` distinct par invocation successive de session. */
function nouveauPlanDeRecord(suffixe: string): { dir: string; counterFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t55-record-plan-${suffixe}-`));
  WORKSPACES_CREES.push(dir);
  return { dir, counterFile: path.join(dir, 'counter.txt') };
}
function recordPlanN(dir: string, n: number): Json | null {
  const f = path.join(dir, `record-${n}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
  } catch {
    return null;
  }
}
const normaliserEspaces = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** Le prompt (convention FIXEE par acceptance/T49.spec.ts, II.4 : « l'argument d'argv qui
 *  suit -p »), normalise (espaces, casse), depuis le N-ieme enregistrement du plan. */
function promptPlanN(dir: string, n: number): string {
  const enreg = recordPlanN(dir, n);
  const argv = Array.isArray(enreg?.argv) ? (enreg!.argv as unknown[]).map(String) : [];
  const idxP = argv.indexOf('-p');
  if (idxP < 0 || idxP + 1 >= argv.length) return '';
  return normaliserEspaces(argv[idxP + 1] ?? '').toLowerCase();
}
function argvPlanN(dir: string, n: number): string[] {
  const enreg = recordPlanN(dir, n);
  return Array.isArray(enreg?.argv) ? (enreg!.argv as unknown[]).map(String) : [];
}
/** Le prompt BRUT (ni normalise ni mis en minuscules) du N-ieme enregistrement — celui que
 *  T55.A3 confronte, octet pour octet, au prompt que le generateur de candidat a consomme. */
function promptBrutPlanN(dir: string, n: number): string | null {
  const argv = argvPlanN(dir, n);
  const idxP = argv.indexOf('-p');
  return idxP >= 0 && idxP + 1 < argv.length ? (argv[idxP + 1] as string) : null;
}

/** T55.A3 (II.5) : le candidat de reference est DERIVE, par le faux `claude` lui-meme, du
 *  prompt que CHAQUE invocation recoit — jamais un contenu fixe (RELPATH/CONTENT ou PLAN
 *  sont ABSENTS de cet environnement, sans quoi ils seraient prioritaires). */
const MODULE_DERIVATION_A3 = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 't55-derive-reference-candidate.mjs');
function envCandidatDeriveDuPrompt(opts: { deriveLogDir: string; recordPlanDir: string; recordPlanCounterFile: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...envDeBase(),
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_MODULE: MODULE_DERIVATION_A3,
    BENCH_FAKE_CLAUDE_WORKSPACE_DERIVE_LOG_DIR: opts.deriveLogDir,
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_DIR: opts.recordPlanDir,
    BENCH_FAKE_CLAUDE_RECORD_FILE_PLAN_COUNTER_FILE: opts.recordPlanCounterFile,
  };
  delete env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH;
  delete env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT;
  delete env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_FILE;
  delete env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_PLAN_COUNTER_FILE;
  verifierFauxEnTetePath(env);
  return env;
}
type Derivation = { prompt: string; cwd: string; relPath: string; content: string; params: unknown };
function derivationN(dir: string, n: number): Derivation | null {
  const f = path.join(dir, `derived-${n}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as Json;
    if (typeof j.prompt !== 'string' || typeof j.content !== 'string') return null;
    return j as unknown as Derivation;
  } catch {
    return null;
  }
}
const echapperRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `jeton` figure-t-il dans `source` comme jeton ENTIER (pas comme fragment d'un identifiant) ? */
const contientJeton = (source: string, jeton: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_])${echapperRe(jeton)}(?![A-Za-z0-9_])`).test(source);

/* ════════════════════════ drapeaux et sous-commandes (repris T46/T49/T52) */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21), reprise T49/T52
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008:L149, reprise T49/T52

const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)
const SOUS_COMMANDE_RUN_PERIOD = 'run-period'; // cahier:L355, repris T23/T45/T46/T49/T52
const SOUS_COMMANDE_CONTROL_REPORT = 'candidate-control-report'; // FIXE par acceptance/T51.spec.ts (II.1)

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008:L98
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // T48 III.1, repris T49/T52/T54
const DRAPEAU_REREAD = '--test-reread-period'; // FIXE par acceptance/T49.spec.ts (II.1)
const DRAPEAU_ARRET_PERIODES = '--test-stop-after-periods'; // FIXE par acceptance/T46.spec.ts (II.1)

const CHAMP_INPUT_FRESH = 'input_fresh'; // source:docs/adr/ADR-008:L135
const CHAMP_CACHE_READ = 'cache_read'; // source:docs/adr/ADR-008:L135
const CHAMP_OUTPUT = 'output'; // source:docs/adr/ADR-008:L135

const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_CANDIDATE_TOKEN_REPORT = ['candidate_token_report', 'candidatetokenreport'];
const ALIAS_BY_MODEL = ['by_model', 'bymodel'];
const ALIAS_PERIODS_PERSISTED = ['periods_persisted', 'periodspersisted'];
const ALIAS_CANDIDATE_CONTROL_REPORT = ['candidate_control_report', 'candidatecontrolreport'];
const ALIAS_RAW_OUTPUT = ['raw_output', 'rawoutput', 'raw'];
const ALIAS_CANDIDATE = ['candidate', 'candidat'];

const periodsPersistedDe = (r: unknown): number | null => champNombre(r, ALIAS_PERIODS_PERSISTED);

function candidateDe(r: unknown): { rawOutput: string | null } | null {
  const c = champProfond(r, ALIAS_CANDIDATE);
  if (c === null || c.valeur === null || typeof c.valeur !== 'object') return null;
  return { rawOutput: champTexte(c.valeur, ALIAS_RAW_OUTPUT) };
}

function trajectoryKeyDe(r: unknown): string | null {
  const t = tableauProfond(r, ALIAS_TRAJECTOIRES);
  if (t === null || !Array.isArray(t.valeur) || t.valeur.length === 0) return null;
  return champTexte(t.valeur[0], ALIAS_TRAJECTORY_KEY);
}

/** `candidate_control_report[trajectory_key].periods` (forme FIXEE par acceptance/T52.spec.ts, II.2). */
function controlPeriodsDe(r: unknown, trajectoryKey: string): { period_index: number; satisfied: number; violated: number }[] {
  const liste = tableauProfond(r, ALIAS_CANDIDATE_CONTROL_REPORT);
  if (liste === null || !Array.isArray(liste.valeur)) return [];
  for (const entree of liste.valeur as unknown[]) {
    if (champTexte(entree, ALIAS_TRAJECTORY_KEY) === trajectoryKey) {
      const per = tableauProfond(entree, ['periods']);
      if (per !== null && Array.isArray(per.valeur)) {
        return (per.valeur as unknown[]).map((p) => ({
          period_index: champNombre(p, ['period_index']) ?? -1,
          satisfied: champNombre(p, ['satisfied']) ?? -1,
          violated: champNombre(p, ['violated']) ?? -1,
        }));
      }
    }
  }
  return [];
}
/** `candidate-control-report --campaign-id <trajectory_key>` appele DIRECTEMENT (second
 *  temoin INDEPENDANT, DEJA etabli par acceptance/T51.spec.ts/T52.spec.ts). */
function controlPeriodsRapportDirectDe(r: unknown): { period_index: number; satisfied: number; violated: number }[] {
  const per = tableauProfond(r, ['periods']);
  if (per === null || !Array.isArray(per.valeur)) return [];
  return (per.valeur as unknown[]).map((p) => ({
    period_index: champNombre(p, ['period_index']) ?? -1,
    satisfied: champNombre(p, ['satisfied']) ?? -1,
    violated: champNombre(p, ['violated']) ?? -1,
  }));
}

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };
function nouveauContexte(suffixe: string): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `bench-t55-${suffixe}-`));
  WORKSPACES_CREES.push(racine);
  return {
    campaignId: `t55-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: racine,
  };
}

/** `bench pilot-conduct` sur la campagne `ctx`, mode `claude-cli --live` (II.3 — AUCUN
 *  drapeau nouveau par rapport a T46/T49/T52/T54). */
function conduire(ctx: Contexte, extra: string[], env: NodeJS.ProcessEnv): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [
      MANIFEST_T55,
      DRAPEAU_CAMPAGNE, ctx.campaignId,
      DRAPEAU_PG, ctx.db,
      DRAPEAU_S3, ctx.bucket,
      DRAPEAU_MODE, MODE,
      DRAPEAU_PROVIDER, PROVIDER_CLAUDE_CLI,
      DRAPEAU_LIVE,
      DRAPEAU_WORKSPACE_ROOT, ctx.workspaceRoot,
      ...extra,
    ],
    env,
  );
}
/** `bench run-period --test-reread-period <n>`, processus NEUF, AUCUNE session (reprise T49/T54). */
function relirePeriode(trajectoryKey: string, db: string, bucket: string, n: number): AppelCli {
  return lancer(SOUS_COMMANDE_RUN_PERIOD, [
    DRAPEAU_MODE, MODE,
    DRAPEAU_CAMPAGNE, trajectoryKey,
    DRAPEAU_PG, db,
    DRAPEAU_S3, bucket,
    DRAPEAU_REREAD, String(n),
  ]);
}
/** `bench candidate-control-report` DIRECT sur l'identite de TRAJECTOIRE (temoin
 *  independant de `pilot-conduct`, commande DEJA prouvee par acceptance/T51.spec.ts). */
function candidateControlReportDirect(trajectoryKey: string, db: string): AppelCli {
  return lancer(SOUS_COMMANDE_CONTROL_REPORT, [DRAPEAU_CAMPAGNE, trajectoryKey, DRAPEAU_PG, db]);
}

/* ───────────────── manifeste et fixture de candidat, JAMAIS des sources de T55 */

/** REPRIS A L'IDENTIQUE de acceptance/T49.spec.ts (II)/T52.spec.ts/T54.spec.ts : UNE
 *  trajectoire, DEUX periodes, modele `bench-fake-claude-cli-model-a` (II.3). */
const MANIFEST_T55 = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t49-claude-cli-small.json');
const MODELE_MANIFESTE = 'bench-fake-claude-cli-model-a';

/** REPRIS A L'IDENTIQUE de acceptance/T51.spec.ts (fixtures)/T52.spec.ts (II.8) : le
 *  candidat de reference qui respecte `bench.candidate/2` ET satisfait les cinq classes
 *  de controle a chaque periode ou elles sont dues. Contenu JAMAIS lu ni recopie. */
const FIXTURES_CANDIDATS_DIR = path.join(REPO, 'acceptance', 'fixtures', 'candidates');
const REFERENCE_V2 = path.join(FIXTURES_CANDIDATS_DIR, 'reservation-candidate-v2.mjs');
if (!fs.existsSync(REFERENCE_V2)) throw new Error(`FIXTURE-ABSENTE : ${REFERENCE_V2}`);
const CONTENU_CANDIDAT_CORRECT = fs.readFileSync(REFERENCE_V2, 'utf8');
const ENTREE_CANDIDATE = 'candidate.mjs'; // FIXE par acceptance/T52.spec.ts (II.4)

/* Les cinq identifiants FIXES par ADR-009:L34, et leur table d'echeance CUMULEE, REPRISE
 * A L'IDENTIQUE de acceptance/T51.spec.ts (II.6, table ECHEANCE_CONTROLE, SC-003 option A).
 * Jamais re-derivee ici. */
const CONTROLES_FIXES = ['reserve@1', 'idempotence@1', 'cancel@1', 'fifo@1', 'isolation@1'] as const;
type IdControle = (typeof CONTROLES_FIXES)[number];
const ECHEANCE_CONTROLE: Record<IdControle, number> = {
  'reserve@1': 1,
  'idempotence@1': 1,
  'cancel@1': 2,
  'fifo@1': 2,
  'isolation@1': 4,
};
/** Le nombre de controles DUS, cumulativement, a la periode k. */
function nombreControlesDus(k: number): number {
  return CONTROLES_FIXES.filter((id) => ECHEANCE_CONTROLE[id] <= k).length;
}

/* ════════════════════ oracle de l'enonce de periode (reprise T53, III.1-2,
 * JAMAIS re-verifiee ici — sert SEULEMENT a comparer contre le prompt REEL) */

function flatten(ns: Ns, into: Map<string, unknown>): void {
  const put = (k: string, v: unknown): void => {
    if (!into.has(k)) into.set(k, v);
  };
  for (const [k, v] of Object.entries(ns)) {
    if (k === '__esModule') continue;
    put(k, v);
  }
  const def: unknown = ns.default;
  if (def !== null && def !== undefined && typeof def === 'object') {
    for (const [k, v] of Object.entries(def as Ns)) put(k, v);
  }
}
function specifiersForPackage(pkgDirName: string): string[] {
  const dir = path.join(REPO, 'packages', pkgDirName);
  const out: string[] = [];
  const manifest = path.join(dir, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: unknown };
      if (typeof j.name === 'string' && j.name.length > 0) out.push(j.name);
    } catch {
      /* manifeste illisible : on retombe sur le chemin de fichier */
    }
  }
  for (const rel of ['dist/index.js', 'src/index.ts', 'index.ts']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(pathToFileURL(f).href);
  }
  return out;
}
async function loadPackage(pkgDirName: string): Promise<{ ns: Ns | null; attempts: string[] }> {
  const attempts: string[] = [];
  for (const s of specifiersForPackage(pkgDirName)) {
    try {
      const mod = (await import(s)) as Ns;
      return { ns: mod, attempts };
    } catch (e) {
      attempts.push(`import(${s}) -> ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  attempts.push(`paquet packages/${pkgDirName} : aucun specificateur n'a repondu`);
  return { ns: null, attempts };
}

let ORACLE: { charge: boolean; flat: Map<string, unknown>; attempts: string[] } = { charge: false, flat: new Map(), attempts: ['beforeAll non execute'] };
beforeAll(async () => {
  const flat = new Map<string, unknown>();
  const attempts: string[] = [];
  let unCharge = false;
  for (const pkg of ['scenario', 'activities']) {
    const { ns, attempts: a } = await loadPackage(pkg);
    attempts.push(...a);
    if (ns !== null) {
      flatten(ns, flat);
      unCharge = true;
    }
  }
  ORACLE = { charge: unCharge, flat, attempts };
}, CASE_TIMEOUT_MS);
function assertOracleLoaded(): void {
  exige(
    ORACLE.charge,
    'oracle-packages-scenario-ou-activities-charges',
    `AUCUN-DES-DEUX-PAQUETS-N-A-PU-ETRE-CHARGE (oracle de l'enonce T53 indisponible) : ${ORACLE.attempts.join(' | ')}`,
  );
}

const MARQUEUR_CONTRAT = 'bench.candidate/2'; // acceptance/T50.spec.ts (III)
const NOMS_OPERATIONS_V2 = ['create_tenant', 'advance_clock', 'write', 'read', 'probe_cancel', 'fingerprint']; // acceptance/T50.spec.ts (III)
function portecontratV2(racine: unknown): boolean {
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && n.valeur === MARQUEUR_CONTRAT) return true;
  }
  let trouvees = 0;
  const vusOps = new Set<string>();
  for (const n of noeuds(racine)) {
    if (typeof n.valeur === 'string' && NOMS_OPERATIONS_V2.includes(n.valeur) && !vusOps.has(n.valeur)) {
      vusOps.add(n.valeur);
      trouvees += 1;
    }
  }
  return trouvees >= 4;
}

const PERIODES = ['P1', 'P2', 'P3', 'P4'] as const;
type Periode = (typeof PERIODES)[number];

/** Le noeud-objet qui represente la periode `cle` — REPRIS A L'IDENTIQUE de
 *  acceptance/T53.spec.ts (III.1). */
function noeudPeriode(racine: unknown, cle: Periode): Json | null {
  const cibleNorm = normKey(cle);
  for (const n of noeuds(racine)) {
    if (n.cle !== '' && normKey(n.cle) === cibleNorm && n.valeur !== null && typeof n.valeur === 'object' && !Array.isArray(n.valeur)) {
      return n.valeur as Json;
    }
  }
  const indexAttendu = PERIODES.indexOf(cle);
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur)) {
      for (let i = 0; i < n.valeur.length; i += 1) {
        const entree = n.valeur[i];
        if (entree === null || typeof entree !== 'object') continue;
        const idTexte = champTexte(entree, ['id', 'key', 'period', 'periode', 'periodid', 'periodkey']);
        if (idTexte !== null && normKey(idTexte) === cibleNorm) return entree as Json;
      }
    }
  }
  for (const n of noeuds(racine)) {
    if (Array.isArray(n.valeur) && n.valeur.length === PERIODES.length) {
      const entree = n.valeur[indexAttendu];
      if (entree !== null && typeof entree === 'object' && champTexte(entree, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) {
        return entree as Json;
      }
    }
  }
  return null;
}
const NOM_AGREGAT_DES_EXPORTS = '(ensemble des exports aplatis)';
function candidatsDescription(): { nom: string; valeur: unknown }[] {
  const out: { nom: string; valeur: unknown }[] = [];
  for (const [k, v] of ORACLE.flat.entries()) {
    if (v !== null && typeof v === 'object') out.push({ nom: k, valeur: v });
  }
  out.push({ nom: NOM_AGREGAT_DES_EXPORTS, valeur: Object.fromEntries(ORACLE.flat.entries()) });
  return out;
}
/** LA description unifiee — REPRISE A L'IDENTIQUE de acceptance/T53.spec.ts (III.1). */
function resoudreDescriptionUnifiee(): { valeur: Json; nom: string } | null {
  for (const c of candidatsDescription()) {
    if (!portecontratV2(c.valeur)) continue;
    let periodesAvecEnonce = 0;
    for (const p of PERIODES) {
      const n = noeudPeriode(c.valeur, p);
      if (n !== null && champTexte(n, ['statement', 'enonce', 'narrative', 'prose', 'text']) !== null) periodesAvecEnonce += 1;
    }
    if (periodesAvecEnonce >= 2) return { valeur: c.valeur as Json, nom: c.nom };
  }
  return null;
}
function requireDescriptionUnifiee(): Json {
  const r = resoudreDescriptionUnifiee();
  exige(
    r !== null,
    'oracle-description-unifiee-resolue',
    `ORACLE-DESCRIPTION-INTROUVABLE : aucun export de packages/scenario ni packages/activities ne porte a la fois un temoin de ${MARQUEUR_CONTRAT} et au moins deux enonces de periode. Exports vus : ${rendu([...ORACLE.flat.keys()])}`,
  );
  return (r as { valeur: Json }).valeur;
}
function vocabulaireDe(description: Json, p: Periode): string[] {
  const node = noeudPeriode(description, p);
  if (node === null) return [];
  const vocab = tableauProfond(node, ['vocabulary', 'vocabulaire', 'responsevalues', 'valeursdereponse', 'expectedvalues', 'values']);
  if (vocab === null || !Array.isArray(vocab.valeur)) return [];
  return vocab.valeur.filter((v): v is string => typeof v === 'string');
}

/* ════════════════════ litteraux geles — REPRIS A L'IDENTIQUE de acceptance/T53.spec.ts
 * (IV), eux-memes ancres sur acceptance/reference/F-RESERVATION.json (gelee) */

const ANCHOR_SLOT_ID = 'S1'; // acceptance/reference/F-RESERVATION.json:valeurs.creneau.id (cahier_line 119) — actif depuis P1
const ANCHOR_DEBUT_CRENEAU = '2030-01-03T12:00:00Z'; // idem, actif depuis P1
const ANCHOR_WAITING = 'waiting'; // cases.extensions.lock.json:T53.A2 — actif depuis P2, PAS a P1
const ANCHOR_FRONTIERE = '2030-01-02T12:00:00Z'; // acceptance/reference/F-RESERVATION.json:valeurs.P3.frontiere — actif depuis P3, PAS a P1/P2
const CHAMP_SATISFIED = 'satisfied'; // source:docs/adr/ADR-011:L107 — JAMAIS dans un prompt

/** T55.A3 (II.5) : les litteraux qu'un candidat de reference FIXE porterait EN DUR sans les
 *  tenir du prompt — ceux que reservation-candidate-v2.mjs (T51) code en dur au-dela du
 *  vocabulaire declare par T53 (decisions de `probe_cancel`/d'annulation refusee). Unis, dans
 *  le cas A3, au vocabulaire DECLARE par l'oracle pour P1..P4 et aux ancrages geles ci-dessus. */
const LITTERAUX_EN_DUR_DU_CANDIDAT_FIXE = ['refused', 'accepted'] as const; // acceptance/fixtures/candidates/reservation-candidate-v2.mjs

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T55 — verifier les proprietes du pilote sur le chemin reel', () => {
  test(
    'T55.A1 le prompt RECU par la session de chaque periode, via pilot-conduct --provider claude-cli --live, contient l enonce de T53 de cette periode et ni satisfied ni une regle d une periode suivante (ADR-012:L48)',
    async () => {
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();

      // L'ORACLE (II.2) : le vocabulaire DYNAMIQUEMENT DECLARE par packages/scenario pour
      // P1 et P2 — jamais une liste hypothese a l'avance par cette suite.
      const vocabP1 = vocabulaireDe(description, 'P1');
      const vocabP2 = vocabulaireDe(description, 'P2');
      exige(vocabP1.length > 0, 'oracle-vocabulaire-P1-non-vide', `VOCABULAIRE-P1-ABSENT dans ${rendu(noeudPeriode(description, 'P1'))}`);
      exige(vocabP2.length > 0, 'oracle-vocabulaire-P2-non-vide', `VOCABULAIRE-P2-ABSENT dans ${rendu(noeudPeriode(description, 'P2'))}`);

      // GARDE CONTROLE-INVALIDE (IV.1) : `waiting` doit appartenir au vocabulaire DECLARE
      // de P2 et PAS a celui de P1 — sinon l'absence testee plus bas a P1 ne distinguerait
      // rien (ancrage REPRIS de acceptance/T53.spec.ts, IV, jamais re-invente).
      exige(
        vocabP2.some((v) => v.toLowerCase() === ANCHOR_WAITING) && !vocabP1.some((v) => v.toLowerCase() === ANCHOR_WAITING),
        'controle-invalide-waiting-est-bien-une-regle-de-P2-pas-de-P1',
        `vocabulaireP1=${rendu(vocabP1)} vocabulaireP2=${rendu(vocabP2)} — attendu ${ANCHOR_WAITING} dans P2 seulement`,
      );

      // LE CHEMIN REEL : `pilot-conduct --provider claude-cli --live`, DEUX periodes, UN
      // SEUL appel (meme environnement partage entre les deux invocations de session —
      // c'est exactement pourquoi le PLAN de record, II.1, est necessaire).
      const ctx = nouveauContexte('a1');
      const plan = nouveauPlanDeRecord('a1');
      const env = envEcritureConstante({
        relPath: ENTREE_CANDIDATE,
        content: CONTENU_CANDIDAT_CORRECT,
        recordPlanDir: plan.dir,
        recordPlanCounterFile: plan.counterFile,
      });
      const run = conduire(ctx, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A1)', run));
      exige(periodsPersistedDe(run.resultat) === 2, 'deux-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      // LE PROMPT REEL, RECU PAR LA SESSION — jamais la sortie de buildCandidatePeriodPrompt
      // prise isolement (T53, DEJA ACCEPTE) : c'est exactement le chemin qu'ADR-012 nomme
      // comme rompu (« n'est pas importe par run-period-claude-cli.ts »).
      const prompt1 = promptPlanN(plan.dir, 0);
      const prompt2 = promptPlanN(plan.dir, 1);
      exige(prompt1.length > 0, 'prompt-reel-periode-1-capture', `AUCUN prompt capture a ${plan.dir}/record-0.json — argv ${rendu(argvPlanN(plan.dir, 0))}`);
      exige(prompt2.length > 0, 'prompt-reel-periode-2-capture', `AUCUN prompt capture a ${plan.dir}/record-1.json — argv ${rendu(argvPlanN(plan.dir, 1))}`);
      exige(prompt1 !== prompt2, 'prompts-reels-P1-et-P2-distincts', `IDENTIQUES — ${court(prompt1, 400)}`);

      // L'ASSERTION DECISIVE (proof_kind=absence) : CHAQUE valeur du vocabulaire DECLARE de
      // P1 figure dans le prompt REEL de P1.
      const manquantesP1 = vocabP1.filter((v) => !prompt1.includes(v.toLowerCase()));
      exige(
        manquantesP1.length === 0,
        'prompt-reel-P1-contient-tout-le-vocabulaire-declare-de-P1',
        `vocabulaire P1 MANQUANT du prompt REEL : ${rendu(manquantesP1)} (declare ${rendu(vocabP1)}) — prompt ${rendu(court(prompt1, 2000))}`,
      );
      const manquantesP2 = vocabP2.filter((v) => !prompt2.includes(v.toLowerCase()));
      exige(
        manquantesP2.length === 0,
        'prompt-reel-P2-contient-tout-le-vocabulaire-declare-de-P2',
        `vocabulaire P2 MANQUANT du prompt REEL : ${rendu(manquantesP2)} (declare ${rendu(vocabP2)}) — prompt ${rendu(court(prompt2, 2000))}`,
      );

      // ABSENCE D'UNE REGLE D'UNE PERIODE SUIVANTE (perturbation NOMMEE) : P1 ne contient
      // PAS `waiting` (regle de P2, controlee CONTROLE-INVALIDE ci-dessus) ; P2 ne contient
      // PAS la frontiere d'annulation (regle de P3, ancrage gele STATIQUE de T53).
      exige(
        !prompt1.includes(ANCHOR_WAITING),
        'prompt-reel-P1-n-enonce-pas-encore-la-regle-de-P2',
        `P1-ENONCE-DEJA ${ANCHOR_WAITING} (regle de P2, fuite vers une periode anterieure) : ${court(prompt1)}`,
      );
      exige(
        !prompt2.includes(ANCHOR_FRONTIERE.toLowerCase()),
        'prompt-reel-P2-n-enonce-pas-encore-la-regle-de-P3',
        `P2-ENONCE-DEJA-LA-FRONTIERE-D-ANNULATION ${ANCHOR_FRONTIERE} (regle de P3, fuite) : ${court(prompt2)}`,
      );

      // AUCUN CHAMP `satisfied` DANS LE PROMPT REEL (SC-004/ADR-011:L107, REPRIS ici sur le
      // chemin complet du pilote, jamais seulement sur la piece isolee de T53).
      exige(!prompt1.includes(CHAMP_SATISFIED), 'prompt-reel-P1-exclut-satisfied', `P1-PROMPT-CONTIENT ${CHAMP_SATISFIED} : ${court(prompt1)}`);
      exige(!prompt2.includes(CHAMP_SATISFIED), 'prompt-reel-P2-exclut-satisfied', `P2-PROMPT-CONTIENT ${CHAMP_SATISFIED} : ${court(prompt2)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T55.A2 a chaque periode d une execution du pilote (pilot-conduct --provider claude-cli --live), les controles persistes sont exactement ceux des exigences dues a cette periode, jamais les cinq (ADR-012:L48)',
    () => {
      const ctx = nouveauContexte('a2');
      const env = envEcritureConstante({ relPath: ENTREE_CANDIDATE, content: CONTENU_CANDIDAT_CORRECT });

      const run = conduire(ctx, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A2)', run));
      exige(periodsPersistedDe(run.resultat) === 2, 'deux-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      const trajKey = trajectoryKeyDe(run.resultat);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible', `vu ${rendu(trajKey)} dans ${rendu(run.resultat)}`);

      // PREMIER TEMOIN : le self-report de `pilot-conduct` lui-meme (champ
      // `candidate_control_report`, FIXE par acceptance/T52.spec.ts, II.2).
      const periodesSelfReport = controlPeriodsDe(run.resultat, trajKey as string);
      // SECOND TEMOIN, INDEPENDANT (processus NEUF, meme discipline que T54.A2) : rappel
      // DIRECT de `candidate-control-report` sur le MEME `trajectory_key`.
      const rapportDirect = candidateControlReportDirect(trajKey as string, ctx.db);
      exige(rapportDirect.resultat !== null && rapportDirect.exit === 0, 'candidate-control-report-direct-execute', messageEchec('candidate-control-report', rapportDirect));
      const periodesDirect = controlPeriodsRapportDirectDe(rapportDirect.resultat);

      for (const k of [1, 2]) {
        const duesAK = nombreControlesDus(k); // table ECHEANCE_CONTROLE CUMULEE, reprise de T51 — 2 a P1, 4 a P2
        const ligneSelf = periodesSelfReport.find((p) => p.period_index === k);
        exige(
          ligneSelf !== undefined,
          `periode-${k}-presente-dans-le-self-report-pilot-conduct`,
          `ABSENTE de ${rendu(periodesSelfReport)}`,
        );
        exige(
          (ligneSelf as { satisfied: number; violated: number }).satisfied + (ligneSelf as { satisfied: number; violated: number }).violated === duesAK,
          `periode-${k}-self-report-exactement-les-controles-dus-${duesAK}`,
          `vu satisfied=${(ligneSelf as Json).satisfied} violated=${(ligneSelf as Json).violated} (somme ${
            (ligneSelf as { satisfied: number; violated: number }).satisfied + (ligneSelf as { satisfied: number; violated: number }).violated
          }) — attendu ${duesAK} (ECHEANCE_CONTROLE cumulee) — JAMAIS 5 (defaut ADR-012 : controlCandidateCommitOnce evalue les cinq)`,
        );

        const ligneDirect = periodesDirect.find((p) => p.period_index === k);
        exige(ligneDirect !== undefined, `periode-${k}-presente-dans-le-rapport-direct-independant`, `ABSENTE de ${rendu(periodesDirect)}`);
        exige(
          (ligneDirect as { satisfied: number; violated: number }).satisfied + (ligneDirect as { satisfied: number; violated: number }).violated === duesAK,
          `periode-${k}-rapport-direct-exactement-les-controles-dus-${duesAK}-PERSISTES`,
          `vu satisfied=${(ligneDirect as Json).satisfied} violated=${(ligneDirect as Json).violated} — attendu ${duesAK} — PERSISTES, pas seulement RENDUS par pilot-conduct lui-meme`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T55.A3 avec un candidat de reference conforme au seul prompt recu, chaque controle du est satisfait a chaque periode d une execution du pilote (violated=0, ADR-012:L48)',
    () => {
      // L'ORACLE (II.2) sert ICI a borner l'univers des litteraux de vocabulaire qu'un candidat
      // pourrait porter EN DUR (assertion de DERIVATION ci-dessous) — jamais a construire le
      // candidat, qui ne voit QUE le prompt recu.
      assertOracleLoaded();
      const description = requireDescriptionUnifiee();
      const vocabDeclare = new Map<Periode, string[]>(PERIODES.map((p) => [p, vocabulaireDe(description, p)]));
      const univers = [
        ...new Set([
          ...PERIODES.flatMap((p) => vocabDeclare.get(p) ?? []),
          ...LITTERAUX_EN_DUR_DU_CANDIDAT_FIXE,
          ANCHOR_SLOT_ID,
          ANCHOR_DEBUT_CRENEAU,
          ANCHOR_FRONTIERE,
          ANCHOR_WAITING,
        ]),
      ];
      // GARDE CONTROLE-INVALIDE : l'univers doit au moins couvrir le vocabulaire declare de P1
      // et P2, sans quoi l'absence de litteral « non tenu du prompt » ne prouverait rien.
      exige(
        (vocabDeclare.get('P1') ?? []).length > 0 && (vocabDeclare.get('P2') ?? []).length > 0,
        'controle-invalide-univers-de-vocabulaire-couvre-P1-et-P2',
        `vocabulaire declare P1=${rendu(vocabDeclare.get('P1'))} P2=${rendu(vocabDeclare.get('P2'))}`,
      );
      exige(fs.existsSync(MODULE_DERIVATION_A3), 'generateur-de-candidat-derive-present', `FIXTURE-ABSENTE : ${MODULE_DERIVATION_A3}`);

      // LE CANDIDAT DE REFERENCE EST DERIVE DU SEUL PROMPT RECU (II.5) : le faux `claude`
      // passe a t55-derive-reference-candidate.mjs le prompt de CETTE invocation, qui en
      // extrait chaque valeur de reponse et chaque parametre ; une valeur absente du prompt
      // devient un marqueur `<absent-du-prompt:...>` que les controles n'attendent pas.
      const ctx = nouveauContexte('a3');
      const plan = nouveauPlanDeRecord('a3');
      const deriveLogDir = path.join(plan.dir, 'derivations');
      const env = envCandidatDeriveDuPrompt({ deriveLogDir, recordPlanDir: plan.dir, recordPlanCounterFile: plan.counterFile });

      const run = conduire(ctx, [], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-live-execute', messageEchec('pilot-conduct(claude-cli,--live,A3)', run));
      exige(periodsPersistedDe(run.resultat) === 2, 'deux-periodes-persistees', `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`);

      const trajKey = trajectoryKeyDe(run.resultat);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible', `vu ${rendu(trajKey)} dans ${rendu(run.resultat)}`);

      const periodesSelfReport = controlPeriodsDe(run.resultat, trajKey as string);
      const rapportDirect = candidateControlReportDirect(trajKey as string, ctx.db);
      exige(rapportDirect.resultat !== null && rapportDirect.exit === 0, 'candidate-control-report-direct-execute', messageEchec('candidate-control-report', rapportDirect));
      const periodesDirect = controlPeriodsRapportDirectDe(rapportDirect.resultat);

      for (const k of [1, 2]) {
        const duesAK = nombreControlesDus(k);

        const ligneSelf = periodesSelfReport.find((p) => p.period_index === k);
        exige(ligneSelf !== undefined, `periode-${k}-presente-dans-le-self-report`, `ABSENTE de ${rendu(periodesSelfReport)}`);
        // L'ASSERTION DECISIVE : AUCUN controle DU n'est VIOLE — un candidat de reference
        // CORRECT, conforme au prompt reel, doit satisfaire TOUS les controles dus.
        exige(
          (ligneSelf as Json).violated === 0,
          `periode-${k}-self-report-aucun-controle-du-viole`,
          `vu violated=${(ligneSelf as Json).violated} dans ${rendu(ligneSelf)} — un candidat de reference CORRECT ne doit JAMAIS violer un controle DU`,
        );
        exige(
          (ligneSelf as Json).satisfied === duesAK,
          `periode-${k}-self-report-tous-les-controles-dus-satisfaits`,
          `vu satisfied=${(ligneSelf as Json).satisfied} attendu ${duesAK} dans ${rendu(ligneSelf)}`,
        );

        const ligneDirect = periodesDirect.find((p) => p.period_index === k);
        exige(ligneDirect !== undefined, `periode-${k}-presente-dans-le-rapport-direct`, `ABSENTE de ${rendu(periodesDirect)}`);
        exige(
          (ligneDirect as Json).violated === 0,
          `periode-${k}-rapport-direct-aucun-controle-du-viole-PERSISTE`,
          `vu violated=${(ligneDirect as Json).violated} dans ${rendu(ligneDirect)}`,
        );
        exige(
          (ligneDirect as Json).satisfied === duesAK,
          `periode-${k}-rapport-direct-tous-les-controles-dus-satisfaits-PERSISTES`,
          `vu satisfied=${(ligneDirect as Json).satisfied} attendu ${duesAK} dans ${rendu(ligneDirect)}`,
        );

        // LA DERIVATION ELLE-MEME : le candidat qui a satisfait ces controles a bien ete ecrit
        // depuis le prompt que la session de la periode k a REELLEMENT recu, et ne porte aucun
        // litteral de vocabulaire que ce prompt ne contenait pas.
        const periode = PERIODES[k - 1] as Periode;
        const derive = derivationN(deriveLogDir, k - 1);
        const erreurs = path.join(deriveLogDir, 'errors.log');
        exige(
          derive !== null,
          `periode-${k}-candidat-derive-du-prompt-ecrit-par-le-faux-claude`,
          `AUCUNE derivation a ${deriveLogDir}/derived-${k - 1}.json — ${fs.existsSync(erreurs) ? court(fs.readFileSync(erreurs, 'utf8'), 600) : 'pas de journal d erreur'}`,
        );
        const promptRecu = promptBrutPlanN(plan.dir, k - 1);
        exige(
          promptRecu !== null && promptRecu.length > 0 && (derive as Derivation).prompt === promptRecu,
          `periode-${k}-candidat-derive-du-prompt-REELLEMENT-recu-par-la-session`,
          `prompt consomme par le generateur ${rendu(court((derive as Derivation).prompt, 300))} vs prompt enregistre ${rendu(court(promptRecu ?? '', 300))}`,
        );
        const source = (derive as Derivation).content;
        const enDurHorsPrompt = univers.filter((t) => contientJeton(source, t) && !(promptRecu as string).includes(t));
        exige(
          enDurHorsPrompt.length === 0,
          `periode-${k}-candidat-aucun-litteral-de-vocabulaire-absent-du-prompt-recu`,
          `litteraux PORTES par le candidat SANS figurer dans le prompt de P${k} : ${rendu(enDurHorsPrompt)} — le candidat n'est pas derive du seul prompt recu`,
        );
        const vocabDuPromptNonPorte = (vocabDeclare.get(periode) ?? []).filter(
          (t) => (promptRecu as string).includes(t) && !contientJeton(source, t),
        );
        exige(
          vocabDuPromptNonPorte.length === 0,
          `periode-${k}-candidat-porte-le-vocabulaire-que-son-prompt-enonce`,
          `vocabulaire de P${k} present dans le prompt mais ABSENT du candidat derive : ${rendu(vocabDuPromptNonPorte)}`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T55.A4 le rapport de fin d une REPRISE de pilot-conduct (deux appels successifs sur la meme campagne) dont une sortie brute contient des retours a la ligne et le caractere | agrege exactement l usage PERSISTE (ADR-012:L48)',
    () => {
      const ctx = nouveauContexte('a4');
      const USAGE = { inputTokens: 13, outputTokens: 24, cacheReadInputTokens: 35, cacheCreationInputTokens: 46 };

      // SORTIE BRUTE HOSTILE (reprise EXACTE de acceptance/T54.spec.ts, I.1) : JSON valide,
      // mais contenant REELLEMENT des octets de retour a la ligne (indentation
      // `JSON.stringify(obj,null,2)`) ET un caractere `|` litteral (dans session_id).
      const sessionIdHostile = `sess-t55-a4-${randomUUID()} | compte-rendu-markdown : statut | valeur`;
      const brut = JSON.stringify(
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: sessionIdHostile,
          num_turns: 1,
          total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          modelUsage: { [MODELE_MANIFESTE]: USAGE },
        },
        null,
        2,
      );
      exige(
        brut.includes('\n') && brut.includes('|'),
        'sortie-brute-hostile-contient-bien-retour-a-la-ligne-et-pipe',
        `CONTROLE-INVALIDE : la sortie construite par ce cas ne contient ni le retour a la ligne ni le | attendus : ${rendu(court(brut, 300))}`,
      );

      const env: NodeJS.ProcessEnv = {
        ...envDeBase(),
        PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
        BENCH_FAKE_CLAUDE_STDOUT_RAW: brut,
      };
      verifierFauxEnTetePath(env);

      // PREMIER APPEL : arrete APRES avoir persiste exactement 1 periode au total pour
      // cette campagne (II.4) — la periode 1 est PERSISTEE par CE processus, qui se termine
      // ensuite completement.
      const run1 = conduire(ctx, [DRAPEAU_ARRET_PERIODES, '1'], env);
      exige(run1.resultat !== null && run1.exit === 0, 'pilot-conduct-premier-appel-execute', messageEchec('pilot-conduct(claude-cli,--live,A4,appel-1)', run1));
      exige(periodsPersistedDe(run1.resultat) === 1, 'premier-appel-exactement-une-periode-persistee', `vu ${rendu(periodsPersistedDe(run1.resultat))} dans ${rendu(run1.resultat)}`);

      const trajKey = trajectoryKeyDe(run1.resultat);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible-apres-le-premier-appel', `vu ${rendu(trajKey)} dans ${rendu(run1.resultat)}`);

      // RELECTURE INDEPENDANTE DE LA PERIODE 1, APRES LE PREMIER APPEL, AVANT LE SECOND :
      // confirme que l'octet hostile a bien ete persiste intact par CE premier processus,
      // qui va maintenant se terminer completement (jamais partager sa memoire avec le
      // second appel ci-dessous).
      const relue1Avant = relirePeriode(trajKey as string, ctx.db, ctx.bucket, 1);
      exige(relue1Avant.resultat !== null && relue1Avant.exit === 0, 'periode-1-relue-avant-le-second-appel', messageEchec('run-period(--test-reread-period 1)', relue1Avant));
      const cand1Avant = candidateDe(relue1Avant.resultat);
      exige(
        cand1Avant !== null && cand1Avant.rawOutput === brut,
        'periode-1-raw-output-persiste-intact-avant-le-second-appel',
        `ecrit (${brut.length} caracteres) vs relu ${rendu(court(cand1Avant?.rawOutput ?? '', 400))}`,
      );

      // SECOND APPEL, PROCESSUS NEUF, MEME CAMPAGNE : termine la trajectoire (periode 2) ET
      // produit le rapport de fin. Ce rapport ne peut PAS obtenir l'usage de la periode 1
      // depuis la memoire d'un processus different — il doit le RELIRE (II.4 ci-dessus).
      const run2 = conduire(ctx, [], env);
      exige(run2.resultat !== null && run2.exit === 0, 'pilot-conduct-second-appel-reprise-execute', messageEchec('pilot-conduct(claude-cli,--live,A4,appel-2,reprise)', run2));
      exige(periodsPersistedDe(run2.resultat) === 2, 'second-appel-deux-periodes-persistees-au-total', `vu ${rendu(periodsPersistedDe(run2.resultat))} dans ${rendu(run2.resultat)}`);

      // LE RAPPORT DE FIN DU SECOND APPEL AGREGE EXACTEMENT L'USAGE PERSISTE DES DEUX
      // PERIODES (II.4) : deux periodes IDENTIQUES (meme sortie hostile reinjectee au
      // second appel) -> total = 2x chaque categorie d'UNE periode. Comparaison a une
      // valeur CALCULEE depuis les litteraux PASSES au fixture, jamais au rapport lui-meme.
      const rapport = champProfond(run2.resultat, ALIAS_CANDIDATE_TOKEN_REPORT);
      exige(rapport !== null, 'candidate_token_report-present-apres-reprise', `AUCUN candidate_token_report dans ${rendu(run2.resultat)}`);
      const parModele = champProfond(rapport!.valeur, ALIAS_BY_MODEL);
      exige(parModele !== null, 'candidate_token_report.by_model-present-apres-reprise', `AUCUN by_model dans ${rendu(rapport!.valeur)}`);
      const noeud = champProfond(parModele!.valeur, [MODELE_MANIFESTE]);
      exige(noeud !== null, `rapport-apres-reprise-contient-le-modele-${MODELE_MANIFESTE}`, `modele ABSENT de ${rendu(parModele!.valeur)}`);

      exige(
        champNombre(noeud!.valeur, [CHAMP_INPUT_FRESH]) === USAGE.inputTokens * 2,
        'rapport-apres-reprise-input-fresh-double-exactement-usage-persiste',
        `vu ${rendu(champNombre(noeud!.valeur, [CHAMP_INPUT_FRESH]))} attendu ${USAGE.inputTokens * 2} dans ${rendu(noeud!.valeur)}`,
      );
      exige(
        champNombre(noeud!.valeur, [CHAMP_CACHE_READ]) === USAGE.cacheReadInputTokens * 2,
        'rapport-apres-reprise-cache-read-double-exactement-usage-persiste',
        `vu ${rendu(champNombre(noeud!.valeur, [CHAMP_CACHE_READ]))} attendu ${USAGE.cacheReadInputTokens * 2} dans ${rendu(noeud!.valeur)}`,
      );
      exige(
        champNombre(noeud!.valeur, [CHAMP_OUTPUT]) === USAGE.outputTokens * 2,
        'rapport-apres-reprise-output-double-exactement-usage-persiste',
        `vu ${rendu(champNombre(noeud!.valeur, [CHAMP_OUTPUT]))} attendu ${USAGE.outputTokens * 2} dans ${rendu(noeud!.valeur)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
