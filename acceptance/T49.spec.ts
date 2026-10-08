/**
 * acceptance/T49.spec.ts — suite d'acceptation de la tache T49.
 *
 * Cas requis (verification/cases.extensions.lock.json, gele) :
 *   T49.A1 behaviour — avec le fournisseur `claude-cli`, chaque periode
 *                      persistee reference la session qui l'a developpee,
 *                      sa sortie brute archivee, son commit de fin et son
 *                      usage par modele
 *   T49.A2 absence   — le prompt d'une periode contient les exigences
 *                      revelees de cette periode et le contrat d'application,
 *                      et ne contient NI les exigences des periodes
 *                      suivantes NI les attentes de l'oracle
 *   T49.A3 behaviour — une session en echec laisse la periode non
 *                      persistee, et la relance reprend cette meme periode,
 *                      sans periode dupliquee ni sautee
 *   T49.A4 numeric   — le rapport de fin agrege les tokens du candidat par
 *                      modele et par categorie, et chaque total egale la
 *                      somme persistee correspondante
 *   T49.A5 behaviour — avec le fournisseur factice, le comportement de T46
 *                      est inchange
 *   T49.A6 refusal   — sans le drapeau `--live`, le fournisseur `claude-cli`
 *                      est refuse avec un motif nomme avant que la CLI soit
 *                      invoquee
 *
 * ─────────────────────────────────────────────────────────────────────── I
 * CE QUE CETTE SUITE OBSERVE, ET D'OU ELLE LE TIENT
 *
 * T49 EST UNE TACHE D'EXTENSION (ADR-008) : elle ne vient PAS du cahier. Le
 * registre qui la porte est verification/tasks.extensions.json, distinct de
 * verification/tasks.json, et son `spec_source` epingle un ADR ACCEPTE, pas
 * le cahier. L'auteur de cette suite est AVEUGLE aux `source_paths` que
 * verification/tasks.extensions.json declare pour T49 — `packages/activities`
 * et `apps/cli` — et ne les a lus ni directement ni par `git show` (ADR-001 :
 * aveuglement PROCEDURAL, discipline auditable au diff, pas une barriere
 * technique). Le contrat teste ci-dessous est derive de docs/specs/T49.md et
 * de sa source, docs/adr/ADR-008-candidat-reel-par-session-claude-p.md,
 * lignes 147 a 153 (la plage que la carte de T49 epingle dans
 * verification/tasks.extensions.json#spec_source) :
 *
 *   L147  titre : « Conduire un pilote longitudinal avec un candidat reel »
 *   L149  dependances T46, T47, T48 ; livrables, mot pour mot : «
 *         `run-period` et `pilot-conduct` acceptent le fournisseur
 *         `claude-cli` ; en phase DEVELOPING, une session T47 travaille dans
 *         l'espace de travail T48 sur les exigences revelees de la periode ;
 *         les phases suivantes deploient, exercent et controlent le code
 *         produit ; un essai reel n'est declenche que par un drapeau
 *         explicite »
 *   L151  les six cas d'acceptation, mot pour mot
 *   L153  commande : `pnpm verify:task T49` ; « PostgreSQL, le stockage objet
 *         et le faux executable `claude` sont requis ; les verifications
 *         passent `--live` avec ce faux executable en tete du PATH, et
 *         n'emettent aucun appel reel. L'essai reel est hors verification. »
 *
 * Cette suite lit en outre, dans le corps narratif du MEME document ACCEPTE
 * (hors de la plage L147-153 epinglee par la carte, exactement la liberte
 * que prend deja acceptance/T48.spec.ts, section I, avec L86-94 du meme
 * ADR) :
 *   L96-101 « Les verifications n'appellent jamais la vraie CLI [...] Le
 *           drapeau `--live` est un consentement explicite a invoquer le
 *           `claude` du PATH : sans lui, le fournisseur `claude-cli` est
 *           refuse. » — fixe le litteral `--live` (A6) et l'ORDRE : le
 *           refus precede tout appel.
 *   L70-75  « par periode et par modele declare dans `modelUsage` [...]
 *           `input_fresh`, `cache_read`, `output`, et l'ecriture de cache
 *           [...] jamais repartis entre `cache_write_5m` et
 *           `cache_write_1h` » — repris A L'IDENTIQUE de
 *           acceptance/T47.spec.ts (deja prouve), jamais re-derive ici.
 *
 * Trois dependances DIRECTES de T49 publient deja un contrat que cette suite
 * REPREND sans le relire (meme geste que acceptance/T46.spec.ts face a
 * T39/T44/T45) :
 *   - acceptance/T46.spec.ts : `pilot-conduct <manifest.json> --campaign-id
 *     <id> --postgres-database <db> --s3-bucket <bucket> --provider fake
 *     --mode recorded|live [--test-stop-after-periods <n>]`, et sa sortie
 *     JSON (`trajectories[]`, `periods[]`, `token_report.by_model`,
 *     `missing_prerequisites`) — REPRISE A L'IDENTIQUE pour A5 (regression).
 *   - acceptance/T47.spec.ts : la forme `Usage` d'une session (`input_fresh`,
 *     `cache_read`, `output`, `cache_write_5m`, `cache_write_1h` TOUJOURS 0,
 *     `cache_write_unresolved`), et le litteral de refus-d'authentification
 *     `claude auth status` → `authMethod`. Le fixture
 *     `acceptance/fixtures/claude-cli/bin/claude` (zone ACCEPTANCE, DEJA
 *     publie par T47) est REPRIS A L'IDENTIQUE, et seulement ETENDU de
 *     maniere ADDITIVE par cette suite (section II.3) : aucune variable
 *     d'environnement existante n'est retiree ni redefinie, T47.spec.ts
 *     continue de s'executer sans modification.
 *   - acceptance/T48.spec.ts : le nom de drapeau `--candidate-workspace-root`
 *     (fixe par T48 pour SA propre sous-commande `candidate-period`) et le
 *     protocole `bench.candidate/1`, repris comme MARQUEUR DE PRESENCE du
 *     contrat d'application dans le prompt (A2), jamais comme invocation du
 *     protocole NDJSON lui-meme (T49 ne re-exerce PAS `candidate-period` :
 *     voir V).
 *
 * ─────────────────────────────────────────────────────────────────────── II
 * CE QUI EST FIXE PAR CETTE SUITE, FAUTE D'ENONCE DANS L'ADR SUR LA FORME
 * EXACTE DE LA COMMANDE (meme geste que T45 fixant `--scenario-id`, T46
 * fixant `pilot-conduct`, T48 fixant `--candidate-*`)
 *
 * 1. NOUVEAUX DRAPEAUX de `bench run-period`, actifs seulement quand
 *    `--provider claude-cli` est present :
 *
 *      --provider claude-cli       (valeur NOMMEE par l'ADR, L149)
 *      --live                      (litteral NOMME par l'ADR, L98 — FIXE ICI
 *                                   que c'est un drapeau SANS valeur,
 *                                   distinct de `--mode live` qui existe deja
 *                                   pour T39/T41 et designe autre chose)
 *      --model <id>                (FIXE ICI : « le modele de la
 *                                   configuration », L151/A1 — run-period,
 *                                   appele directement par cette suite hors
 *                                   de tout manifeste de pilote, a besoin
 *                                   d'un moyen explicite de le recevoir)
 *      --candidate-workspace-root <dir>  (NOM REPRIS de T48, III.1 — le
 *                                   repertoire de base sous lequel le moteur
 *                                   derive l'espace de travail git de CETTE
 *                                   trajectoire, L149 « espace de travail
 *                                   T48 »)
 *      --test-reread-period <n>    (POINT D'INJECTION NOMME, FIXE ICI, meme
 *                                   convention que `--test-stop-after-
 *                                   periods` (T46) ou `--test-stop-after-
 *                                   phase` (T23) : au lieu d'avancer une
 *                                   NOUVELLE periode, relit et rend EXACTEMENT
 *                                   la meme forme de sortie pour la periode
 *                                   `<n>` DEJA persistee de cette trajectoire,
 *                                   STRICTEMENT depuis l'etat persistant
 *                                   (jamais depuis la memoire du processus
 *                                   qui l'a ecrite — c'est un processus NEUF
 *                                   qui relit). Necessaire ici au meme titre
 *                                   que le rappel direct de `run-period` dans
 *                                   acceptance/T46.spec.ts (I) : sans canal de
 *                                   RELECTURE independant du self-report
 *                                   d'ecriture, A1/A3/A4 ne distingueraient
 *                                   pas une archive REELLEMENT durable d'un
 *                                   JSON renvoye en memoire par le MEME
 *                                   processus qui vient de l'ecrire.
 *
 *    SORTIE de `run-period`, quand `--provider claude-cli` (ou
 *    `--test-reread-period`) est en jeu — FIXEE ICI, champ `candidate` AJOUTE
 *    a la sortie EXISTANTE de T23/T45 (period_index/scenario_id/
 *    configuration_id, inchanges) :
 *
 *      persisted             boolean  — true SSI cette periode a ete
 *                              DURABLEMENT ecrite (A3 : false si la session a
 *                              echoue)
 *      failure_reason         string | null — motif NOMME, present SSI
 *                              persisted===false
 *      candidate: {
 *        provider              'claude-cli'
 *        session_id             string  — `session_id` declare par la
 *                                session (A1)
 *        raw_output             string  — sortie BRUTE complete de la
 *                                session, archivee (A1)
 *        commit_sha             string  — commit GIT sauvegarde a la FIN de
 *                                cette periode dans l'espace de travail
 *                                derive de --candidate-workspace-root (A1,
 *                                L149 « espace de travail T48 »)
 *        workspace_dir          string  — chemin ABSOLU REEL du depot derive
 *                                (LU ici, jamais devine)
 *        usage: [ { model, input_fresh, cache_read, output, cache_write_5m,
 *                    cache_write_1h, cache_write_unresolved } ]
 *                               — UNE entree par modele declare par la
 *                                session, FORME IDENTIQUE a `Usage` de
 *                                acceptance/T47.spec.ts (III.1), reprise SANS
 *                                MODIFICATION (A1, A4)
 *      }
 *
 * 2. NOUVEAUX DRAPEAUX de `bench pilot-conduct`, en plus de ceux DEJA fixes
 *    par acceptance/T46.spec.ts (II) : `--provider claude-cli`, `--live`,
 *    `--candidate-workspace-root <dir>` (meme nom, meme role qu'en 1 — UNE
 *    seule racine pour toute la campagne, le moteur derive un sous-chemin PAR
 *    trajectoire, meme discipline d'isolation que T48.A2). AUCUN drapeau
 *    `--model` : le modele de chaque trajectoire se lit dans le manifeste
 *    (`model.name`, champ DEJA etabli par acceptance/T39.spec.ts, repris sans
 *    le re-deriver).
 *
 *    SORTIE de `pilot-conduct`, en plus des champs DEJA fixes par
 *    acceptance/T46.spec.ts (II) — AJOUTE ICI, actif seulement quand
 *    `--provider claude-cli` :
 *
 *      candidate_token_report: { by_model: { <model>: { input_fresh,
 *                                cache_read, output, cache_write_5m,
 *                                cache_write_1h, cache_write_unresolved } } }
 *                               — agregat CUMULATIF, par modele, des usages
 *                                `candidate.usage` de TOUTES les periodes
 *                                REELLEMENT persistees a date pour cette
 *                                campagne (A4). DISTINCT du `token_report`
 *                                deja fixe par T46 (ce dernier agrege les
 *                                appels REGLES via packages/gateway/T44, un
 *                                canal que `claude-cli` ne traverse PAS,
 *                                ADR:L18-19 « le seul acces a un vrai modele
 *                                passe par une cle [...] le mandant n'a pas
 *                                de cle » — cette suite ne fait donc AUCUNE
 *                                hypothese sur `token_report` sous
 *                                `--provider claude-cli` et ne l'inspecte
 *                                jamais dans ce mode).
 *
 * 3. EXTENSION ADDITIVE du fixture `acceptance/fixtures/claude-cli/bin/claude`
 *    (DEJA publie par T47, zone ACCEPTANCE) : deux nouvelles variables
 *    d'environnement, `BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH` et
 *    `BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT`, documentees dans le fichier
 *    lui-meme. Quand les DEUX sont fournies, le faux executable ecrit ce
 *    contenu a ce chemin RELATIF AU CWD DE L'APPEL (donc dans l'espace de
 *    travail que l'appelant a derive, s'il est passe en `cwd`) avant de
 *    repondre — simule ce qu'une VRAIE session `claude -p` ecrirait avec ses
 *    propres outils, sans quoi A1 ne pourrait jamais observer de DIFFERENCE
 *    entre « le moteur sauvegarde reellement un commit de fin » et « le
 *    moteur rend toujours le MEME commit vide, jamais modifie ». Absentes
 *    (cas de acceptance/T47.spec.ts), aucune ecriture n'a lieu : comportement
 *    T47 inchange.
 *
 * 4. PROMPT (A2) : cette suite FIXE que le texte envoye comme prompt a la
 *    session est l'argument de `argv` qui suit IMMEDIATEMENT `-p` (meme
 *    convention shell que `claude -p "<texte>"`) — L135/T47.A1 nomme
 *    litteralement `-p` sans jamais nommer d'argument qui le suit (ADR
 *    L50-51 : « Elle ne fixe ni la presence ni la forme d'un prompt [...]
 *    c'est l'objet de T49.A2 », deja note par acceptance/T47.spec.ts, IV).
 *    Ce choix est observable SANS modifier le fixture : le canal
 *    `BENCH_FAKE_CLAUDE_RECORD_FILE`, DEJA publie par T47, enregistre `argv`
 *    tel quel.
 *
 * ─────────────────────────────────────────────────────────────────────── III
 * PROVENANCE DES LITTERAUX
 *
 * T49 n'a pas de ligne de cahier : sa source est l'ADR epingle par
 * verification/tasks.extensions.json#spec_source. Chaque litteral COMPARE
 * porte donc un commentaire `// source:docs/adr/ADR-008-candidat-reel-par-
 * session-claude-p.md:L<n>` resolvable par `sed -n '<n>p'`, ou une reference
 * explicite a la suite d'acceptation DEJA PUBLIEE d'une dependance dont le
 * vocabulaire est repris a l'identique (meme discipline que III de
 * acceptance/T46.spec.ts) :
 *
 *   `--live`                                          — source:ADR:L98
 *   `claude-cli`                                       — source:ADR:L149
 *   `input_fresh`,`cache_read`,`output`,
 *   `cache_write_5m`,`cache_write_1h`,
 *   `cache_write_unresolved`                            — acceptance/T47.spec.ts (III.1)
 *   `bench.candidate/1`                                 — acceptance/T48.spec.ts (III.3,
 *                                                          fixture reference-app.mjs)
 *   `--candidate-workspace-root`                        — acceptance/T48.spec.ts (III.1)
 *   `campaign_id`,`trajectory_count`,`period_count`,
 *   `periods_persisted`,`ready`,`missing_prerequisites`,
 *   `trajectories`,`periods`,`trajectory_key`,
 *   `token_report`,`by_model`,`model_call_ids`           — acceptance/T46.spec.ts (II)
 *   `model.name` (champ du manifeste)                    — acceptance/T39.spec.ts (II.1)
 *   « il ne peut pas consulter les oracles »             — acceptance/T18.spec.ts (deja
 *                                                          publie, cite litteralement en
 *                                                          IV.(2) ci-dessous)
 *   `audit`,`controls`,`expected` (noms de champ)         — acceptance/T23.spec.ts (deja
 *                                                          publie ; OBSERVE, pas invente :
 *                                                          `node tools/bench` sur un registre
 *                                                          de developpement rend, pour une
 *                                                          periode `run-period` menee a bien,
 *                                                          `audit.controls[].expected`
 *                                                          litteralement — c'est le canal
 *                                                          que IV.(2) exploite pour « les
 *                                                          attentes de l'oracle »)
 *
 * Les noms `--model`, `--test-reread-period`, `candidate`, `persisted`,
 * `failure_reason`, `raw_output`, `workspace_dir`, `candidate_token_report`,
 * les deux variables d'environnement du fixture (II.3), et les manifestes
 * `acceptance/fixtures/pilot-longitudinal/manifest-t49-claude-cli-small.json` :
 * FIXES ICI (section II), jamais obtenus en executant une implementation de
 * T49 et en figeant ce qu'on a vu passer — aucune implementation de T49
 * n'existe au moment ou cette suite est ecrite (ADR-001).
 *
 * ─────────────────────────────────────────────────────────────────────── IV
 * LES DANGERS PROPRES A T49, ET LEUR CONTROLE DANS CETTE SUITE
 *
 * (1) A1 NE DOIT PAS SE CONTENTER DE CROIRE LE SELF-REPORT DU PROCESSUS QUI
 *     VIENT D'ECRIRE LA PERIODE. cases.extensions.lock.json le nomme :
 *     « persister la periode sans reference a sa session ni a sa sortie
 *     brute ». Cette suite exige donc DEUX lectures CONCORDANTES de la MEME
 *     periode : celle rendue par l'appel qui l'a ECRITE, et celle rendue par
 *     un appel ULTERIEUR, processus NEUF, `--test-reread-period` (II.1) —
 *     meme discipline que acceptance/T46.spec.ts (I) rappelant `run-period`
 *     en canal independant. Le commit de fin est en outre verifie par une
 *     TROISIEME source, hors de tout CLI : `git -C <workspace_dir> show
 *     <commit_sha>:<chemin>` lit directement le depot et doit rendre EXACTEMENT
 *     le contenu que le fixture a ecrit (II.3) — une implementation qui
 *     rendrait un `commit_sha` STABLE mais FAUX (par exemple le commit
 *     INITIAL, jamais celui de fin) echouerait ici, pas seulement sur
 *     l'egalite JSON/JSON.
 * (2) A2 EST UN CAS `absence`, ET LE DANGER EST LA FUITE D'INFORMATION, PAS
 *     SEULEMENT SON OMISSION (cases.extensions.lock.json : « inclure les
 *     exigences de la periode suivante dans le prompt »). Cette suite
 *     n'invente donc AUCUN contenu d'exigences : elle les OBSERVE
 *     INDEPENDAMMENT, par un canal qui n'a jamais lu le prompt lui-meme —
 *     une execution PREALABLE, en mode `fake` (scripte, DEJA prouve), de LA
 *     MEME trajectoire fraiche jusqu'a la periode 2, dont elle extrait le
 *     champ `exigences`/`requirements` (role DEJA fixe par
 *     acceptance/T23.spec.ts et acceptance/T45.spec.ts, jamais re-derive
 *     ici) de P1 et de P2. Elle exige alors que le prompt REEL de la session
 *     `claude-cli` de P1 CONTIENNE (sous-chaine, apres normalisation des
 *     espaces) la forme canonique de P1 et NE CONTIENNE PAS celle de P2 —
 *     une implementation qui recopierait l'etat ENTIER de la trajectoire
 *     (passe ET futur) dans chaque prompt echouerait ici precisement parce
 *     que P1 et P2 different reellement (observe, pas suppose). Pour « les
 *     attentes de l'oracle », cette suite s'appuie sur un invariant DEJA
 *     publie par une dependance plus ancienne (acceptance/T18.spec.ts : « il
 *     ne peut pas consulter les oracles ») : le mot `oracle` (insensible a la
 *     casse) ne doit JAMAIS apparaitre dans le prompt d'une session. Cette
 *     suite va en outre plus loin qu'un mot-cle : la MEME execution de
 *     reference (fake, P1) porte deja, dans sa propre sortie DEJA prouvee par
 *     acceptance/T23.spec.ts, le champ `audit.controls[].expected` — LA forme
 *     CONCRETE que prend « l'attente de l'oracle » dans ce depot (l'obligation
 *     de preuve d'un controle, pas son resultat observe, donc VALABLE quel
 *     que soit le candidat exerce). Cette suite exige qu'AUCUNE de ces
 *     chaines `expected` n'apparaisse dans le prompt de P1 — un controle
 *     DECISIF contre l'erreur la plus probante (serialiser le gabarit de
 *     periode ENTIER, audit compris, dans le prompt), la que le mot-cle seul
 *     ne verrait pas si l'implementation omettait le mot `oracle` lui-meme
 *     tout en recopiant quand meme ces chaines.
 * (3) A3 EST UN CAS `behaviour`, ET LE DANGER EST LA DUPLICATION/LE SAUT
 *     SILENCIEUX (meme avertissement que T46.A2). Cette suite ne se contente
 *     donc pas d'un code de sortie non nul sur la session en echec : elle
 *     exige en outre, par `--test-reread-period 1` (processus NEUF), qu'AUCUNE
 *     periode 1 ne soit lisible pour cette trajectoire apres l'echec — puis,
 *     apres relance REUSSIE, que la periode ecrite porte EXACTEMENT
 *     `period_index=1` (jamais 2 : pas de periode SAUTEE pour la tentative
 *     ratee ; jamais une SECONDE periode 1 en plus d'une premiere qui aurait
 *     ete ecrite malgre l'echec : pas de periode DUPLIQUEE).
 * (4) A4 EST UN CAS `numeric` : LE DANGER DECISIF (meme avertissement que
 *     T46.A3 — « omettre les tokens d'un appel dans l'agregat »). Un rapport
 *     qui s'auto-certifierait correct ne prouverait rien : cette suite
 *     exerce une session qui declare DEUX modeles dans `modelUsage` sur
 *     chacune des deux periodes du manifeste reduit (II), relit CHAQUE
 *     periode INDEPENDAMMENT par `--test-reread-period`, reconstruit a la
 *     main l'agregat `by_model` sur les SIX categories, et exige l'EGALITE
 *     STRUCTURELLE complete avec `candidate_token_report.by_model` de
 *     `pilot-conduct` — pas seulement une somme globale, qu'une permutation
 *     entre modeles ferait passer a tort.
 * (5) A5 EST LA REGRESSION ELLE-MEME (cases.extensions.lock.json : « faire
 *     passer le fournisseur factice par la session claude -p »). Cette suite
 *     ne REINVENTE donc rien : elle REJOUE, mot pour mot, l'invocation de
 *     `acceptance/T46.spec.ts` (`--provider fake --mode recorded`, SANS
 *     `--live`, SANS `--candidate-workspace-root`) sur le MEME manifeste
 *     (`manifest-t46-small.json`) et exige les MEMES proprietes qu'A1/A3 de
 *     T46 (periods_persisted=N×P, trajectories distinctes, aucun champ
 *     `candidate` — sa PRESENCE serait la preuve que le fournisseur factice a
 *     ete route, meme partiellement, par le code `claude-cli`).
 * (6) A6 EST UN CAS `refusal` : LE DANGER CLASSIQUE (meme avertissement que
 *     T00.M3/T39.A2/T45.A3/T46.A4/T47.A4-A5) — un stub qui refuserait TOUJOURS
 *     `--provider claude-cli` laisserait A6 vert SANS RIEN PROUVER. Cette
 *     suite exige donc, dans le MEME cas, un TEMOIN POSITIF : le MEME appel,
 *     SEULE DIFFERENCE `--live` ajoute, doit REELLEMENT invoquer le faux
 *     executable (marqueur `BENCH_FAKE_CLAUDE_AUTH_MARKER_FILE`, DEJA publie
 *     par T47, PRESENT apres l'appel). Sans `--live`, ce MEME marqueur DOIT
 *     etre ABSENT — preuve que le refus precede TOUT appel, pas seulement
 *     qu'il aboutit a un code de sortie non nul.
 * (7) ISOLATION DES SERVICES REELS ET DES ESPACES DE TRAVAIL. Chaque cas
 *     cree sa PROPRE base PostgreSQL, son propre nom de bucket S3
 *     (cahier:L557) et son propre repertoire temporaire pour
 *     `--candidate-workspace-root` (`fs.mkdtempSync`) — aucun cas ne depend
 *     de l'ordre d'execution d'un autre.
 * (8) CHAQUE INVOCATION CLI EST UN PROCESSUS NEUF (`execFileSync`), jamais un
 *     rappel en memoire — meme discipline que T23/T39/T45/T46/T48.
 * (9) AUCUN APPEL REEL. `PATH` est TOUJOURS prefixe par le repertoire du
 *     fixture `acceptance/fixtures/claude-cli/bin/claude` avant toute
 *     invocation `--provider claude-cli` ; un garde explicite
 *     (`verifierFauxEnTetePath`) resout `claude` dans l'environnement
 *     CONSTRUIT par cette suite et exige qu'il pointe vers CE fixture, jamais
 *     vers `/opt/node22/bin/claude` ni un autre `claude` du systeme — AVANT
 *     tout appel qui pourrait invoquer `--provider claude-cli`.
 *
 * ─────────────────────────────────────────────────────────────────────── V
 * CE QUE CETTE SUITE NE PROUVE PAS
 *
 *  • Elle ne re-teste pas l'orchestration multi-trajectoires de
 *    `pilot-conduct` (N×P periodes, reprise par trajectoire, budget) : DEJA
 *    couvert par acceptance/T46.spec.ts, et A5 la REJOUE seulement pour
 *    prouver l'ABSENCE de regression, jamais pour la re-prouver depuis zero.
 *  • Elle n'exerce JAMAIS le protocole NDJSON ni la sous-commande
 *    `candidate-period` (T48) : aucun des six cas requis de T49 ne porte sur
 *    le resultat d'un DEPLOIEMENT/EXERCICE/CONTROLE du code produit par la
 *    session — seulement sur la comptabilite de la session elle-meme
 *    (reference, sortie brute, commit, usage, prompt, reprise, agregat). Le
 *    fixture de cette suite ne repond donc JAMAIS au protocole
 *    `bench.candidate/1` : il simule seulement l'ECRITURE d'un fichier par la
 *    session EN PHASE DEVELOPING (II.3), jamais un candidat exerce en phase
 *    EXERCISING.
 *  • Elle n'exige aucune chaine exacte pour `failure_reason` : seulement sa
 *    presence et la non-persistance qu'elle accompagne (A3).
 *  • Elle n'invoque JAMAIS la vraie CLI `claude` (L96-101) : voir IV.(9).
 *  • Elle ne fixe aucune regle de derivation precise du sous-repertoire
 *    qu'un `--candidate-workspace-root` donne — seulement qu'il designe un
 *    depot git REEL et REUTILISABLE entre l'ecriture et la relecture d'UNE
 *    MEME periode (A1).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CASE_TIMEOUT_MS = 1_200_000;
const PROC_TIMEOUT_MS = 240_000;
const BUILD_TIMEOUT_MS = 300_000;

type Json = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────── socle */

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

/** Rendu TEXTUEL PROFOND — les messages d'echec doivent NOMMER ce qu'ils ont vu. */
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

/** L'assertion elementaire : une comparaison de chaines, pour nommer ce qui a ete vu. */
function exige(condition: boolean, sain: string, defaut: string): void {
  expect(condition ? sain : court(defaut)).toBe(sain);
}

/* ─────────────────────────────── navigation JSON generique (reprise de T45/T46) */

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

type Noeud = { chemin: string; cle: string; valeur: unknown };

function noeuds(racine: unknown, profMax = 9): Noeud[] {
  const out: Noeud[] = [];
  const vus = new Set<unknown>();
  const file: { chemin: string; cle: string; v: unknown; p: number }[] = [
    { chemin: '$', cle: '', v: racine, p: 0 },
  ];
  while (file.length > 0) {
    const n = file.shift() as { chemin: string; cle: string; v: unknown; p: number };
    out.push({ chemin: n.chemin, cle: n.cle, valeur: n.v });
    if (n.p >= profMax || n.v === null || typeof n.v !== 'object') continue;
    if (vus.has(n.v)) continue;
    vus.add(n.v);
    if (Array.isArray(n.v)) {
      n.v.forEach((x, i) => file.push({ chemin: `${n.chemin}[${i}]`, cle: n.cle, v: x, p: n.p + 1 }));
    } else {
      for (const [k, x] of Object.entries(n.v as Json)) {
        file.push({ chemin: `${n.chemin}.${k}`, cle: k, v: x, p: n.p + 1 });
      }
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

/* ─────────────────── litteraux de cette suite, chacun avec sa provenance */

const MODE = 'recorded'; // convention T23/T39/T45/T46 (cahier:L21)
const PROVIDER_FAKE = 'fake'; // convention T39/T41/T46
const PROVIDER_CLAUDE_CLI = 'claude-cli'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L149

const SOUS_COMMANDE_RUN_PERIOD = 'run-period'; // cahier:L355, repris de T23/T45/T46
const SOUS_COMMANDE_CONDUIRE = 'pilot-conduct'; // FIXE par acceptance/T46.spec.ts (II.1)

const DRAPEAU_MODE = '--mode';
const DRAPEAU_PROVIDER = '--provider';
const DRAPEAU_CAMPAGNE = '--campaign-id';
const DRAPEAU_PG = '--postgres-database';
const DRAPEAU_S3 = '--s3-bucket';
const DRAPEAU_LIVE = '--live'; // source:docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L98
const DRAPEAU_MODEL = '--model'; // FIXE ICI (II.1)
const DRAPEAU_WORKSPACE_ROOT = '--candidate-workspace-root'; // NOM REPRIS de acceptance/T48.spec.ts (III.1)
const DRAPEAU_REREAD = '--test-reread-period'; // FIXE ICI (II.1)
const DRAPEAU_SCENARIO = '--scenario-id'; // FIXE par acceptance/T45.spec.ts (II)

/** Les six categories de `Usage`, reprises A L'IDENTIQUE de acceptance/T47.spec.ts (III.1),
 *  elle-meme derivee de docs/adr/ADR-008-candidat-reel-par-session-claude-p.md:L70-75. */
const CATEGORIES_USAGE = [
  'input_fresh',
  'cache_read',
  'output',
  'cache_write_5m',
  'cache_write_1h',
  'cache_write_unresolved',
] as const;
type CategorieUsage = (typeof CATEGORIES_USAGE)[number];
type VecteurUsage = Record<CategorieUsage, number>;
const vecteurVide = (): VecteurUsage => ({
  input_fresh: 0,
  cache_read: 0,
  output: 0,
  cache_write_5m: 0,
  cache_write_1h: 0,
  cache_write_unresolved: 0,
});

const ALIAS_PERIOD_INDEX = ['period_index', 'periodindex', 'index', 'numero', 'rang'];
const ALIAS_PERSISTED = ['persisted'];
const ALIAS_FAILURE_REASON = ['failure_reason', 'failurereason', 'reason', 'motif'];
const ALIAS_CANDIDATE = ['candidate', 'candidat'];
const ALIAS_SESSION_ID = ['session_id', 'sessionid'];
const ALIAS_RAW_OUTPUT = ['raw_output', 'rawoutput', 'raw'];
const ALIAS_COMMIT_SHA = ['commit_sha', 'commitsha'];
const ALIAS_WORKSPACE_DIR = ['workspace_dir', 'workspacedir'];
const ALIAS_USAGE = ['usage'];
const ALIAS_MODEL = ['model'];
const ALIAS_EXIGENCES = [
  'requirements',
  'exigences',
  'due_requirements',
  'exigences_dues',
  'evaluated_requirements',
  'exigences_evaluees',
];
const ALIAS_AUDIT = ['audit'];
const ALIAS_CONTROLS = ['controls'];
const ALIAS_EXPECTED = ['expected'];
const ALIAS_PERIODS_PERSISTED = ['periods_persisted', 'periodspersisted'];
const ALIAS_TRAJECTOIRES = ['trajectories'];
const ALIAS_PERIODES = ['periods'];
const ALIAS_TRAJECTORY_KEY = ['trajectory_key', 'trajectorykey'];
const ALIAS_CANDIDATE_TOKEN_REPORT = ['candidate_token_report', 'candidatetokenreport'];
const ALIAS_BY_MODEL = ['by_model', 'bymodel'];
const ALIAS_MISSING = ['missing_prerequisites', 'missingprerequisites'];

/** Ce qui N'EST PAS un refus : un plantage (meme convention que T00/T17/T25/T37/T39/T45/T46). */
const MARQUEURS_DE_PLANTAGE =
  /TypeError|ReferenceError|is not a function|Cannot read (?:propert|of)|of undefined|of null|ECONNREFUSED|ECONNRESET/;

/* ════════════════════════════════════ PostgreSQL REEL (cahier L141, L557) */

const RUN = `t49_${process.pid.toString(36)}_${Date.now().toString(36)}`;

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

function creerBase(suffixe: string): string {
  const nom = `bench_${RUN}_${suffixe}`.toLowerCase().slice(0, 60);
  psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  const r = psql(ADMIN_DB, `CREATE DATABASE "${nom}"`);
  exige(r.ok, 'base-postgresql-creee', `POSTGRESQL-INDISPONIBLE ${nom} : ${court(r.out, 400)}`); // cahier:L141
  BASES_CREEES.push(nom);
  return nom;
}

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

/** Une invocation `node <entree> <sousCommande> <drapeaux>`, avec un ENVIRONNEMENT
 *  explicite (processus neuf, jamais un rappel en memoire). */
function lancer(sousCommande: string, drapeaux: string[], envExtra: NodeJS.ProcessEnv = {}): AppelCli {
  const tentatives: AppelCli['tentatives'] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: SOCKET_DIR, PGUSER: PG_USER, ...envExtra };
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
  return `${label} : ${appel.tentatives
    .map((t) => `${t.label} [exit ${String(t.exit)}] ${t.sortie.split('\n')[0]}`)
    .join(' | ') || 'aucune entree candidate dans apps/cli ni tools/bench'}`;
}

function texteComplet(appel: AppelCli): string {
  const j = appel.resultat !== null ? rendu(appel.resultat) : '';
  const brut = appel.tentatives.map((t) => t.sortie).join('\n');
  return `${j}\n${brut}`;
}

/* ───────────────────────────────── extraction de champs sur UNE reponse */

const champTexte = (r: unknown, alias: readonly string[]): string | null => {
  const v = champProfond(r, alias);
  return v !== null && typeof v.valeur === 'string' ? v.valeur : null;
};
const champBool = (r: unknown, alias: readonly string[]): boolean | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  return typeof v.valeur === 'boolean' ? v.valeur : v.valeur === 'true' ? true : v.valeur === 'false' ? false : null;
};
const champNombre = (r: unknown, alias: readonly string[]): number | null => {
  const v = champProfond(r, alias);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
};

const periodIndexDe = (r: unknown): number | null => champNombre(r, ALIAS_PERIOD_INDEX);
const persistedDe = (r: unknown): boolean | null => champBool(r, ALIAS_PERSISTED);
const failureReasonDe = (r: unknown): string | null => champTexte(r, ALIAS_FAILURE_REASON);

type Usage = { model: string } & VecteurUsage;

function candidateDe(r: unknown): {
  provider: string | null;
  sessionId: string | null;
  rawOutput: string | null;
  commitSha: string | null;
  workspaceDir: string | null;
  usage: Usage[];
} | null {
  const c = champProfond(r, ALIAS_CANDIDATE);
  if (c === null || c.valeur === null || typeof c.valeur !== 'object') return null;
  const v = c.valeur;
  const usageNoeud = tableauProfond(v, ALIAS_USAGE);
  const usage: Usage[] = usageNoeud !== null && Array.isArray(usageNoeud.valeur)
    ? (usageNoeud.valeur as unknown[]).map((x) => {
        const modele = champTexte(x, ALIAS_MODEL) ?? '';
        const vecteur = vecteurVide();
        for (const cat of CATEGORIES_USAGE) {
          const n = champNombre(x, [cat]);
          if (n !== null) vecteur[cat] = n;
        }
        return { model: modele, ...vecteur };
      })
    : [];
  return {
    provider: champTexte(v, ['provider']),
    sessionId: champTexte(v, ALIAS_SESSION_ID),
    rawOutput: champTexte(v, ALIAS_RAW_OUTPUT),
    commitSha: champTexte(v, ALIAS_COMMIT_SHA),
    workspaceDir: champTexte(v, ALIAS_WORKSPACE_DIR),
    usage,
  };
}

function exigencesDe(r: unknown): unknown {
  const v = champProfond(r, ALIAS_EXIGENCES) ?? tableauProfond(r, ALIAS_EXIGENCES);
  return v !== null ? v.valeur : null;
}

/** « Les attentes de l'oracle » (A2) : le champ `expected` de CHAQUE controle d'audit —
 *  le vocabulaire OBSERVE (jamais invente) de la sortie reelle de `run-period` deja prouvee
 *  par acceptance/T23.spec.ts (`audit.controls[].expected`). Reste VALABLE quel que soit le
 *  candidat exerce : `expected` decrit l'obligation de preuve du scenario/periode, pas ce
 *  qu'un candidat PARTICULIER a produit. */
function attentesOracleDe(r: unknown): string[] {
  const audit = champProfond(r, ALIAS_AUDIT);
  if (audit === null) return [];
  const controls = tableauProfond(audit.valeur, ALIAS_CONTROLS);
  if (controls === null || !Array.isArray(controls.valeur)) return [];
  return (controls.valeur as unknown[])
    .map((c) => champTexte(c, ALIAS_EXPECTED))
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/** Serialisation canonique (cles triees recursivement) — pour une comparaison de sous-chaine
 *  robuste a l'ordre d'enumeration des cles, jamais a leur contenu. */
function canonique(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonique);
  if (v !== null && typeof v === 'object') {
    const o: Json = {};
    for (const k of Object.keys(v as Json).sort()) o[k] = canonique((v as Json)[k]);
    return o;
  }
  return v;
}
const normaliserEspaces = (s: string): string => s.replace(/\s+/g, ' ').trim();

/* ════════════════════════════ fixture claude-cli (reprise + extension T47) */

const CLAUDE_FIXTURE_BIN_DIR = path.join(REPO, 'acceptance', 'fixtures', 'claude-cli', 'bin');
const CLAUDE_FIXTURE_BIN = path.join(CLAUDE_FIXTURE_BIN_DIR, 'claude');

/** IV.(9) — garde explicite : `claude` DOIT resoudre vers CE fixture dans l'environnement
 *  CONSTRUIT par cette suite, jamais vers la vraie CLI (`/opt/node22/bin/claude` ou tout
 *  autre), AVANT tout appel qui pourrait invoquer `--provider claude-cli`. */
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

type SondeFixture = {
  authMarkerFile: string;
  recordFile: string;
  env: NodeJS.ProcessEnv;
};

/** Construit l'environnement d'UNE invocation `--provider claude-cli` : PATH prefixe par le
 *  fixture, et des fichiers de preuve NEUFS (jamais partages entre deux appels). */
function sondeClaudeCli(opts: {
  authMethod?: string;
  stdoutRaw?: string;
  exitCode?: number;
  workspaceWrite?: { relPath: string; content: string };
}): SondeFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't49-sonde-'));
  const authMarkerFile = path.join(dir, 'auth-marker.json');
  const recordFile = path.join(dir, 'record.json');
  const env: NodeJS.ProcessEnv = {
    PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    BENCH_FAKE_CLAUDE_AUTH_MARKER_FILE: authMarkerFile,
    BENCH_FAKE_CLAUDE_RECORD_FILE: recordFile,
  };
  if (opts.authMethod !== undefined) env.BENCH_FAKE_CLAUDE_AUTH_METHOD = opts.authMethod;
  if (opts.stdoutRaw !== undefined) env.BENCH_FAKE_CLAUDE_STDOUT_RAW = opts.stdoutRaw;
  if (opts.exitCode !== undefined) env.BENCH_FAKE_CLAUDE_EXIT_CODE = String(opts.exitCode);
  if (opts.workspaceWrite !== undefined) {
    env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_RELPATH = opts.workspaceWrite.relPath;
    env.BENCH_FAKE_CLAUDE_WORKSPACE_WRITE_CONTENT = opts.workspaceWrite.content;
  }
  verifierFauxEnTetePath(env);
  return { authMarkerFile, recordFile, env };
}

function lireJsonSiPresent(p: string): Json | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Json;
  } catch {
    return null;
  }
}

/** Un succes `claude -p --output-format json` typique, avec `modelUsage` CONTROLE par le test. */
function resultSucces(sessionId: string, modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage,
  });
}

/** Un echec `claude -p` typique (ADR:L135/T47.A4 : subtype d'erreur, aucun usage valide). */
function resultEchec(sessionId: string): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'error_during_execution', // acceptance/T47.spec.ts (II), cases.extensions.lock.json:T47.A4
    is_error: true,
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
  });
}

/* ════════════════════════════════════════════════════════ contextes de cas */

type Contexte = { campaignId: string; db: string; bucket: string; workspaceRoot: string };

function nouveauContexte(suffixe: string): Contexte {
  return {
    campaignId: `t49-${RUN}-${suffixe}-${randomUUID()}`,
    db: creerBase(suffixe),
    bucket: `bench-${RUN}-${suffixe}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
    workspaceRoot: fs.mkdtempSync(path.join(os.tmpdir(), `t49-ws-${suffixe}-`)),
  };
}

/** `bench run-period` sous provider `claude-cli`, avec un environnement de fixture explicite. */
function runPeriodClaudeCli(
  ctx: Contexte,
  env: NodeJS.ProcessEnv,
  opts: { live?: boolean; model?: string; extra?: string[] } = {},
): AppelCli {
  const drapeaux = [
    DRAPEAU_MODE,
    MODE,
    DRAPEAU_CAMPAGNE,
    ctx.campaignId,
    DRAPEAU_PG,
    ctx.db,
    DRAPEAU_S3,
    ctx.bucket,
    DRAPEAU_PROVIDER,
    PROVIDER_CLAUDE_CLI,
    DRAPEAU_WORKSPACE_ROOT,
    ctx.workspaceRoot,
    DRAPEAU_MODEL,
    opts.model ?? 'bench-fake-claude-cli-model-a',
    ...(opts.live === false ? [] : [DRAPEAU_LIVE]),
    ...(opts.extra ?? []),
  ];
  return lancer(SOUS_COMMANDE_RUN_PERIOD, drapeaux, env);
}

/** `bench run-period --test-reread-period <n>`, processus NEUF, AUCUNE invocation de session
 *  (le point d'injection II.1 : relecture STRICTEMENT depuis l'etat persistant). */
function relirePeriode(ctx: Contexte, n: number): AppelCli {
  return lancer(SOUS_COMMANDE_RUN_PERIOD, [
    DRAPEAU_MODE,
    MODE,
    DRAPEAU_CAMPAGNE,
    ctx.campaignId,
    DRAPEAU_PG,
    ctx.db,
    DRAPEAU_S3,
    ctx.bucket,
    DRAPEAU_REREAD,
    String(n),
  ]);
}

/** `bench run-period` en mode SCRIPTE (fake, DEJA prouve), pour observer INDEPENDAMMENT les
 *  exigences revelees — AUCUN rapport avec le provider claude-cli (IV.(2)). */
function runPeriodFake(ctx: Contexte, extra: string[] = []): AppelCli {
  return lancer(SOUS_COMMANDE_RUN_PERIOD, [
    DRAPEAU_MODE,
    MODE,
    DRAPEAU_CAMPAGNE,
    ctx.campaignId,
    DRAPEAU_PG,
    ctx.db,
    DRAPEAU_S3,
    ctx.bucket,
    ...extra,
  ]);
}

/** `bench pilot-conduct` sur la campagne `ctx`, avec un manifeste et des drapeaux additionnels. */
function conduire(ctx: Contexte, manifest: string, extra: string[], env: NodeJS.ProcessEnv = {}): AppelCli {
  return lancer(
    SOUS_COMMANDE_CONDUIRE,
    [
      manifest,
      DRAPEAU_CAMPAGNE,
      ctx.campaignId,
      DRAPEAU_PG,
      ctx.db,
      DRAPEAU_S3,
      ctx.bucket,
      DRAPEAU_MODE,
      MODE,
      ...extra,
    ],
    env,
  );
}

/* ═══════════════════════════════════════════════════════════════════ cas */

describe('T49 — conduire un pilote longitudinal avec un candidat reel', () => {
  test(
    'T49.A1 avec le fournisseur claude-cli, chaque periode persistee reference sa session, sa sortie brute archivee, son commit de fin et son usage par modele',
    () => {
      const ctx = nouveauContexte('a1');
      const relPath = 'candidate-written-by-session.txt';
      const content = `bench-t49-a1-${randomUUID()}`;
      const sonde = sondeClaudeCli({
        stdoutRaw: resultSucces('sess-t49-a1', {
          'bench-fake-claude-cli-model-a': {
            inputTokens: 11,
            outputTokens: 22,
            cacheReadInputTokens: 33,
            cacheCreationInputTokens: 44,
          },
        }),
        workspaceWrite: { relPath, content },
      });

      const p1 = runPeriodClaudeCli(ctx, sonde.env);
      exige(p1.resultat !== null && p1.exit === 0, 'p1-claude-cli-executee', messageEchec('run-period(claude-cli,P1)', p1));
      exige(persistedDe(p1.resultat) !== false, 'p1-persistee', `vu persisted=${rendu(persistedDe(p1.resultat))} dans ${rendu(p1.resultat)}`);

      const cand1 = candidateDe(p1.resultat);
      exige(cand1 !== null, 'p1-champ-candidate-present', `AUCUN champ candidate dans ${rendu(p1.resultat)}`);
      exige(
        typeof cand1?.sessionId === 'string' && cand1.sessionId.length > 0,
        'p1-session_id-present',
        `vu ${rendu(cand1?.sessionId)} dans ${rendu(p1.resultat)}`,
      );
      exige(
        typeof cand1?.rawOutput === 'string' && cand1.rawOutput.length > 0,
        'p1-raw_output-present',
        `vu ${rendu(cand1?.rawOutput)} dans ${rendu(p1.resultat)}`,
      );
      exige(
        typeof cand1?.commitSha === 'string' && cand1.commitSha.length > 0,
        'p1-commit_sha-present',
        `vu ${rendu(cand1?.commitSha)} dans ${rendu(p1.resultat)}`,
      );
      exige(
        typeof cand1?.workspaceDir === 'string' && fs.existsSync(cand1.workspaceDir),
        'p1-workspace_dir-reel',
        `vu ${rendu(cand1?.workspaceDir)} (existe=${rendu(cand1?.workspaceDir !== null ? fs.existsSync(cand1.workspaceDir) : null)})`,
      );
      exige(
        (cand1?.usage.length ?? 0) === 1 && cand1?.usage[0]?.model === 'bench-fake-claude-cli-model-a',
        'p1-usage-un-modele-present',
        `vu ${rendu(cand1?.usage)}`,
      );
      exige(
        cand1?.usage[0]?.input_fresh === 11 && cand1?.usage[0]?.cache_read === 33 && cand1?.usage[0]?.output === 22,
        'p1-usage-categories-exactes',
        `vu ${rendu(cand1?.usage[0])} — attendu input_fresh=11 cache_read=33 output=22`,
      );

      // TROISIEME source, hors de tout CLI : le depot GIT lui-meme (IV.(1)).
      const montre = execFileSync('git', ['-C', cand1!.workspaceDir!, 'show', `${cand1!.commitSha}:${relPath}`], {
        encoding: 'utf8',
      });
      exige(
        montre.trim() === content,
        'p1-commit-de-fin-contient-reellement-l-ecriture-de-la-session',
        `vu ${rendu(montre.trim())} attendu ${rendu(content)} (git show ${cand1!.commitSha}:${relPath} dans ${cand1!.workspaceDir})`,
      );

      // RELECTURE INDEPENDANTE, processus NEUF (II.1/IV.(1)) : jamais le self-report du MEME appel.
      const relue = relirePeriode(ctx, 1);
      exige(relue.resultat !== null && relue.exit === 0, 'p1-relue', messageEchec('run-period(--test-reread-period 1)', relue));
      const candRelu = candidateDe(relue.resultat);
      exige(
        candRelu?.sessionId === cand1?.sessionId && candRelu?.commitSha === cand1?.commitSha && candRelu?.rawOutput === cand1?.rawOutput,
        'p1-relecture-concorde-avec-l-ecriture',
        `ecrit=${rendu(cand1)} relu=${rendu(candRelu)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T49.A2 le prompt d une periode contient les exigences revelees de cette periode et le contrat d application, et exclut les exigences de la periode suivante et les attentes de l oracle',
    () => {
      const ctxRef = nouveauContexte('a2-reference');

      // Canal INDEPENDANT (IV.(2)) : la MEME trajectoire en mode scripte, pour observer
      // SANS LES INVENTER les exigences revelees de P1 et de P2.
      const refP1 = runPeriodFake(ctxRef, [DRAPEAU_SCENARIO, 'SCN-F-RESERVATION']);
      exige(refP1.resultat !== null, 'reference-p1-executee', messageEchec('run-period(fake,P1,reference)', refP1));
      const exigencesP1 = exigencesDe(refP1.resultat);
      exige(exigencesP1 !== null, 'reference-p1-exigences-presentes', `AUCUNE exigence dans ${rendu(refP1.resultat)}`);
      const attentesOracleP1 = attentesOracleDe(refP1.resultat);
      exige(
        attentesOracleP1.length > 0,
        'reference-p1-attentes-oracle-observees',
        `CONTROLE-INVALIDE : audit.controls[].expected introuvable dans ${rendu(refP1.resultat)} — le test ne peut rien distinguer`,
      );

      const refP2 = runPeriodFake(ctxRef);
      exige(refP2.resultat !== null, 'reference-p2-executee', messageEchec('run-period(fake,P2,reference)', refP2));
      const exigencesP2 = exigencesDe(refP2.resultat);
      exige(exigencesP2 !== null, 'reference-p2-exigences-presentes', `AUCUNE exigence dans ${rendu(refP2.resultat)}`);

      const serialP1 = normaliserEspaces(JSON.stringify(canonique(exigencesP1)));
      const serialP2 = normaliserEspaces(JSON.stringify(canonique(exigencesP2)));
      exige(
        serialP1 !== serialP2,
        'reference-p1-et-p2-revelent-des-exigences-distinctes',
        `CONTROLE-INVALIDE : P1 et P2 identiques (${rendu(serialP1)}) — le test ne peut rien distinguer`,
      );

      // La trajectoire REELLE, sous `claude-cli`, SUR LE MEME SCENARIO que la reference.
      const ctx = nouveauContexte('a2-claude-cli');
      const sonde = sondeClaudeCli({ stdoutRaw: resultSucces('sess-t49-a2', {}) });
      const p1 = runPeriodClaudeCli(ctx, sonde.env, { extra: [DRAPEAU_SCENARIO, 'SCN-F-RESERVATION'] });
      exige(p1.resultat !== null && p1.exit === 0, 'p1-claude-cli-executee', messageEchec('run-period(claude-cli,P1)', p1));

      const enreg = lireJsonSiPresent(sonde.recordFile);
      exige(enreg !== null, 'enregistrement-de-session-present', `AUCUN enregistrement a ${sonde.recordFile} — la session n a jamais ete lancee`);
      const argv = Array.isArray(enreg?.argv) ? (enreg!.argv as unknown[]).map(String) : [];
      const idxP = argv.indexOf('-p');
      exige(idxP >= 0 && idxP + 1 < argv.length, 'argv-contient-p-suivi-d-un-argument', `argv vu ${rendu(argv)}`);
      const prompt = normaliserEspaces(argv[idxP + 1] ?? '');

      exige(
        prompt.includes(normaliserEspaces(JSON.stringify(canonique(exigencesP1)))),
        'prompt-contient-les-exigences-de-cette-periode',
        `exigences P1 (reference) ${rendu(exigencesP1)} introuvables dans le prompt ${rendu(court(prompt, 2000))}`,
      );
      exige(
        prompt.toLowerCase().includes('bench.candidate/1'),
        'prompt-contient-le-marqueur-du-contrat-d-application',
        `marqueur "bench.candidate/1" (acceptance/T48.spec.ts, III.3) introuvable dans le prompt ${rendu(court(prompt, 2000))}`,
      );
      exige(
        !prompt.includes(normaliserEspaces(JSON.stringify(canonique(exigencesP2)))),
        'prompt-exclut-les-exigences-de-la-periode-suivante',
        `exigences P2 (reference) ${rendu(exigencesP2)} TROUVEES dans le prompt de P1 ${rendu(court(prompt, 2000))}`,
      );
      exige(
        !prompt.toLowerCase().includes('oracle'),
        'prompt-exclut-le-mot-oracle',
        `mot "oracle" (acceptance/T18.spec.ts : « il ne peut pas consulter les oracles ») TROUVE dans le prompt ${rendu(court(prompt, 2000))}`,
      );
      const fuite = attentesOracleP1.filter((a) => prompt.includes(normaliserEspaces(a)));
      exige(
        fuite.length === 0,
        'prompt-exclut-les-attentes-reelles-de-l-oracle',
        `attente(s) d'oracle (audit.controls[].expected, reference) TROUVEE(S) dans le prompt : ${rendu(fuite)} — prompt ${rendu(court(prompt, 2000))}`,
      );
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T49.A3 une session en echec laisse la periode non persistee, et la relance reprend cette meme periode, sans periode dupliquee ni sautee',
    () => {
      const ctx = nouveauContexte('a3');

      const sondeEchec = sondeClaudeCli({ stdoutRaw: resultEchec('sess-t49-a3-echec'), exitCode: 1 });
      const tentativeEchouee = runPeriodClaudeCli(ctx, sondeEchec.env);
      exige(
        persistedDe(tentativeEchouee.resultat) === false || tentativeEchouee.exit !== 0,
        'tentative-echouee-signalee-comme-telle',
        `vu exit=${rendu(tentativeEchouee.exit)} persisted=${rendu(persistedDe(tentativeEchouee.resultat))} dans ${rendu(tentativeEchouee.resultat)}`,
      );
      if (tentativeEchouee.resultat !== null) {
        exige(
          persistedDe(tentativeEchouee.resultat) !== true,
          'tentative-echouee-jamais-persisted-true',
          `vu ${rendu(tentativeEchouee.resultat)}`,
        );
        exige(
          failureReasonDe(tentativeEchouee.resultat) !== null,
          'tentative-echouee-motif-nomme',
          `AUCUN motif dans ${rendu(tentativeEchouee.resultat)}`,
        );
      }
      exige(
        !MARQUEURS_DE_PLANTAGE.test(texteComplet(tentativeEchouee)),
        'echec-signale-proprement-pas-un-plantage',
        `plantage detecte dans ${court(texteComplet(tentativeEchouee), 600)}`,
      );

      // CONTROLE DE NON-ECRITURE (processus NEUF) : la periode 1 ne doit PAS etre lisible.
      const relue1 = relirePeriode(ctx, 1);
      const persisteeApresEchec = relue1.resultat !== null && (persistedDe(relue1.resultat) === true || candidateDe(relue1.resultat) !== null);
      exige(
        !persisteeApresEchec,
        'periode-1-illisible-apres-l-echec',
        `une periode 1 EST lisible malgre l'echec : ${rendu(relue1.resultat)}`,
      );

      // RELANCE REUSSIE : reprend EXACTEMENT la periode 1 (ni sautee a 2, ni dupliquee).
      const sondeSucces = sondeClaudeCli({
        stdoutRaw: resultSucces('sess-t49-a3-succes', {
          'bench-fake-claude-cli-model-a': { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        }),
      });
      const relance = runPeriodClaudeCli(ctx, sondeSucces.env);
      exige(relance.resultat !== null && relance.exit === 0, 'relance-executee', messageEchec('run-period(claude-cli,relance)', relance));
      exige(
        persistedDe(relance.resultat) !== false,
        'relance-persistee',
        `vu persisted=${rendu(persistedDe(relance.resultat))} dans ${rendu(relance.resultat)}`,
      );
      exige(
        periodIndexDe(relance.resultat) === 1,
        'relance-reprend-exactement-la-periode-1',
        `vu period_index=${rendu(periodIndexDe(relance.resultat))} dans ${rendu(relance.resultat)} — ni sautee (2), ni dupliquee (une seconde 1 en plus d'une premiere deja ecrite)`,
      );

      // Aucune periode 2 ne doit exister : UNE SEULE periode persistee pour cette trajectoire.
      const relue2 = relirePeriode(ctx, 2);
      const periode2Existe = relue2.resultat !== null && candidateDe(relue2.resultat) !== null && persistedDe(relue2.resultat) !== false;
      exige(!periode2Existe, 'aucune-periode-2-apres-une-seule-relance-reussie', `periode 2 trouvee : ${rendu(relue2.resultat)}`);
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T49.A4 le rapport de fin agrege les tokens du candidat par modele et par categorie, et chaque total egale la somme persistee correspondante',
    () => {
      const ctx = nouveauContexte('a4');
      const manifest = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t49-claude-cli-small.json');
      exige(fs.existsSync(manifest), 'manifeste-t49-present', `fixture absente : ${manifest}`);

      // DEUX modeles (primaire + secondaire/sous-agent, ADR:L46 « une meme session peut
      // employer plusieurs modeles ») — chaque periode de `pilot-conduct` lance un processus
      // `claude` NEUF (ADR:L58-60) heritant du MEME environnement que le processus
      // `pilot-conduct` a lui-meme recu de cette suite : le fixture ne peut donc PAS
      // distinguer P1 de P2 par son propre etat, et cette suite fournit volontairement le
      // MEME `modelUsage` aux deux (la somme independante, ci-dessous, en tient compte en le
      // comptant deux fois). Le signal que T49.M4 (omission d'un modele secondaire dans
      // l'agregat) doit faire rougir reste intact : DEUX modeles DISTINCTS doivent
      // apparaitre dans le total final, quel que soit le nombre de periodes qui les portent.
      const dirSondes = fs.mkdtempSync(path.join(os.tmpdir(), 't49-a4-sondes-'));
      const modelUsageParPeriode = {
        'bench-fake-claude-cli-model-a': { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 2, cacheCreationInputTokens: 1 },
        'bench-fake-claude-cli-model-b-subagent': { inputTokens: 3, outputTokens: 4, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      };
      const env = {
        PATH: `${CLAUDE_FIXTURE_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
        BENCH_FAKE_CLAUDE_AUTH_MARKER_FILE: path.join(dirSondes, 'auth-marker.json'),
        BENCH_FAKE_CLAUDE_RECORD_FILE: path.join(dirSondes, 'record.json'),
        BENCH_FAKE_CLAUDE_STDOUT_RAW: resultSucces('sess-t49-a4', modelUsageParPeriode),
      };
      verifierFauxEnTetePath(env);

      const run = conduire(ctx, manifest, [
        DRAPEAU_PROVIDER,
        PROVIDER_CLAUDE_CLI,
        DRAPEAU_LIVE,
        DRAPEAU_WORKSPACE_ROOT,
        ctx.workspaceRoot,
      ], env);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-claude-cli-execute', messageEchec('pilot-conduct(claude-cli)', run));
      exige(
        periodsPersistedDe(run.resultat) === 2,
        'deux-periodes-persistees',
        `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)}`,
      );

      const trajectoires = tableauProfond(run.resultat, ALIAS_TRAJECTOIRES);
      exige(trajectoires !== null && Array.isArray(trajectoires.valeur) && trajectoires.valeur.length === 1, 'une-trajectoire-compilee', `vu ${rendu(run.resultat)}`);
      const trajKey = champTexte((trajectoires!.valeur as unknown[])[0], ALIAS_TRAJECTORY_KEY);
      exige(typeof trajKey === 'string' && trajKey.length > 0, 'trajectory_key-lisible', `vu ${rendu(trajKey)} dans ${rendu(run.resultat)}`);

      // RELECTURE INDEPENDANTE (IV.(4)) : chaque periode de CETTE trajectoire, canal distinct
      // du self-report cumulatif de pilot-conduct.
      const attendu = new Map<string, VecteurUsage>();
      const ajouter = (u: Usage): void => {
        const v = attendu.get(u.model) ?? vecteurVide();
        for (const cat of CATEGORIES_USAGE) v[cat] += u[cat];
        attendu.set(u.model, v);
      };
      for (const n of [1, 2]) {
        const ctxTraj: Contexte = { ...ctx, campaignId: trajKey! };
        const relue = relirePeriode(ctxTraj, n);
        exige(relue.resultat !== null && relue.exit === 0, `periode-${n}-relue`, messageEchec(`run-period(--test-reread-period ${n})`, relue));
        const cand = candidateDe(relue.resultat);
        exige(cand !== null && cand.usage.length > 0, `periode-${n}-usage-present`, `vu ${rendu(relue.resultat)}`);
        for (const u of cand!.usage) ajouter(u);
      }

      const rapport = champProfond(run.resultat, ALIAS_CANDIDATE_TOKEN_REPORT);
      exige(rapport !== null, 'candidate_token_report-present', `AUCUN candidate_token_report dans ${rendu(run.resultat)}`);
      const parModele = champProfond(rapport!.valeur, ALIAS_BY_MODEL);
      exige(parModele !== null, 'candidate_token_report.by_model-present', `AUCUN by_model dans ${rendu(rapport!.valeur)}`);

      for (const [modele, vAttendu] of attendu) {
        const noeud = champProfond(parModele!.valeur, [modele]);
        exige(noeud !== null, `rapport-contient-le-modele-${modele}`, `modele ${rendu(modele)} ABSENT de ${rendu(parModele!.valeur)} (modeles presents cote independant : ${[...attendu.keys()].join(', ')})`);
        for (const cat of CATEGORIES_USAGE) {
          const vu = champNombre(noeud!.valeur, [cat]) ?? 0;
          exige(
            vu === vAttendu[cat],
            `rapport.${modele}.${cat}=${vAttendu[cat]}`,
            `vu ${vu} (somme independante des periodes relues, modele ${modele}, categorie ${cat}) dans ${rendu(parModele!.valeur)}`,
          );
        }
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T49.A5 avec le fournisseur factice, le comportement de T46 est inchange',
    () => {
      const ctx = nouveauContexte('a5');
      const manifest = path.join(REPO, 'acceptance', 'fixtures', 'pilot-longitudinal', 'manifest-t46-small.json');
      exige(fs.existsSync(manifest), 'manifeste-t46-reutilise-present', `fixture absente : ${manifest}`);

      // REJOUE MOT POUR MOT acceptance/T46.spec.ts (IV.(5)) : --provider fake, SANS --live,
      // SANS --candidate-workspace-root.
      const run = conduire(ctx, manifest, [DRAPEAU_PROVIDER, PROVIDER_FAKE]);
      exige(run.resultat !== null && run.exit === 0, 'pilot-conduct-fake-execute', messageEchec('pilot-conduct(fake)', run));
      exige(
        periodsPersistedDe(run.resultat) === 6,
        'six-periodes-persistees-comme-sous-t46',
        `vu ${rendu(periodsPersistedDe(run.resultat))} dans ${rendu(run.resultat)} (manifest-t46-small.json : N=2, P=3)`,
      );

      const trajectoires = tableauProfond(run.resultat, ALIAS_TRAJECTOIRES);
      exige(
        trajectoires !== null && Array.isArray(trajectoires.valeur) && trajectoires.valeur.length === 2,
        'deux-trajectoires-comme-sous-t46',
        `vu ${rendu(run.resultat)}`,
      );

      const periodes = tableauProfond(run.resultat, ALIAS_PERIODES);
      const toutes = periodes !== null && Array.isArray(periodes.valeur) ? (periodes.valeur as unknown[]) : [];
      exige(toutes.length === 6, 'six-entrees-periodes-comme-sous-t46', `vu ${rendu(toutes.length)} dans ${rendu(run.resultat)}`);
      for (const p of toutes) {
        exige(
          candidateDe(p) === null,
          'aucune-periode-fake-ne-porte-de-champ-candidate',
          `un champ candidate est PRESENT sous --provider fake : ${rendu(p)} — le fournisseur factice aurait ete route par le code claude-cli`,
        );
      }
    },
    CASE_TIMEOUT_MS,
  );

  test(
    'T49.A6 sans le drapeau --live, le fournisseur claude-cli est refuse avec un motif nomme avant que la CLI soit invoquee',
    () => {
      const ctx = nouveauContexte('a6');

      // NEGATIF : --live ABSENT.
      const sondeSansLive = sondeClaudeCli({ stdoutRaw: resultSucces('sess-t49-a6-ne-doit-jamais-tourner', {}) });
      const refuse = runPeriodClaudeCli(ctx, sondeSansLive.env, { live: false });
      exige(refuse.exit !== 0, 'refuse-sans-live-exit-non-nul', messageEchec('run-period(claude-cli,sans --live)', refuse));
      exige(
        !fs.existsSync(sondeSansLive.authMarkerFile) && !fs.existsSync(sondeSansLive.recordFile),
        'sans-live-la-cli-n-est-jamais-invoquee',
        `marqueur(s) trouve(s) malgre le refus : auth=${fs.existsSync(sondeSansLive.authMarkerFile)} session=${fs.existsSync(sondeSansLive.recordFile)}`,
      );
      exige(
        !MARQUEURS_DE_PLANTAGE.test(texteComplet(refuse)),
        'refus-signale-proprement-pas-un-plantage',
        `plantage detecte dans ${court(texteComplet(refuse), 600)}`,
      );
      const motif = failureReasonDe(refuse.resultat);
      const texte = texteComplet(refuse);
      exige(
        (motif !== null && motif.length > 0) || /live/i.test(texte),
        'refus-porte-un-motif-nomme',
        `aucun motif identifiable (failure_reason=${rendu(motif)}) dans ${court(texte, 600)}`,
      );

      // TEMOIN POSITIF (IV.(6)) : LE MEME appel, SEULE DIFFERENCE --live AJOUTE, invoque
      // REELLEMENT le faux executable — sans quoi un refus UNIVERSEL de claude-cli passerait
      // A6 sans rien prouver.
      const ctx2 = nouveauContexte('a6-controle-positif');
      const sondeAvecLive = sondeClaudeCli({
        stdoutRaw: resultSucces('sess-t49-a6-controle', {
          'bench-fake-claude-cli-model-a': { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        }),
      });
      const accepte = runPeriodClaudeCli(ctx2, sondeAvecLive.env, { live: true });
      exige(accepte.resultat !== null && accepte.exit === 0, 'avec-live-accepte', messageEchec('run-period(claude-cli,avec --live)', accepte));
      exige(
        fs.existsSync(sondeAvecLive.authMarkerFile) || fs.existsSync(sondeAvecLive.recordFile),
        'avec-live-la-cli-est-reellement-invoquee',
        `AUCUN marqueur trouve malgre --live : auth=${fs.existsSync(sondeAvecLive.authMarkerFile)} session=${fs.existsSync(sondeAvecLive.recordFile)}`,
      );
    },
    CASE_TIMEOUT_MS,
  );
});

function periodsPersistedDe(r: unknown): number | null {
  const v = champProfond(r, ALIAS_PERIODS_PERSISTED);
  if (v === null) return null;
  const n = nombre(v.valeur);
  return Number.isFinite(n) ? n : null;
}

afterAll(() => {
  for (const db of BASES_CREEES) psql(ADMIN_DB, `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
});
