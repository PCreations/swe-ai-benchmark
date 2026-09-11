export const meta = {
  name: 'bench-driver',
  description: 'Pilote une iteration du benchmark : preflight, classification, puis T00..T43 a travers les portes aveugles',
  whenToUse:
    "Une iteration autonome du socle swe-ai-benchmark. A relancer en boucle : chaque etage pousse, donc une coupure ne perd qu'un etage.",
  phases: [
    { title: 'Preflight', detail: 'bench resume + doctor + bootstrap infra — la seule source de verite' },
    { title: 'Classify', detail: "proof_kind des 279 cas, en UN commit (cases.lock.json est une entree GLOBALE)" },
    { title: 'Spec', detail: 'extraction verbatim du cahier, zone SPEC' },
    { title: 'Fixtures', detail: 'DOUBLE transcription du §F, cadrages opposes, scellee seulement si les deux concordent' },
    { title: 'Tests', detail: 'suite + mutants, zones ACCEPTANCE/MUTANT — aveugle a l implementation' },
    { title: 'Red', detail: 'bench red : chaque cas requis observe ROUGE avant toute implementation' },
    { title: 'Impl', detail: 'zones IMPL/HARNESS — jamais dans le meme commit qu une zone de jugement' },
    { title: 'Audit', detail: 'auditeurs block-only : leur silence n accorde rien' },
    { title: 'Accept', detail: 'bench accept : clean-room, attestation, push' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// AXIOME (plan initial, §« Boucle ultracode dynamique ») : l'historique de ce
// workflow est un CACHE. `refs/heads/<branche>` et `refs/heads/<branche>-ledger`
// sont la verite. Perdre entierement ce workflow ne coute rien : `bench resume`
// affiche la meme frontiere, et un agent pilotant les commandes a la main
// atteint un ledger byte-identique.
//
// DEUX ECARTS ASSUMES PAR RAPPORT AU PSEUDOCODE DU PLAN, ET POURQUOI :
//
// 1. PAS DE `sh()`. Le script d'un Workflow tourne dans un contexte JS isole :
//    ni systeme de fichiers, ni shell. Chaque `sh('bench X')` du pseudocode
//    devient donc un AGENT dont l'unique tache est de lancer la commande et de
//    rendre son issue structuree. La structure survit, le mecanisme change.
//    Consequence utile : l'agent voit la sortie et peut la diagnostiquer, la
//    ou `sh()` n'aurait rendu qu'un code.
//
// 2. LES PORTES 2-4 N'EXISTENT PAS ENCORE. `bench necessity`, `bench mutate`,
//    `bench integrate` sont des livrables de T01 (« rendre le systeme de preuve
//    non contournable par accident »). Tant que T01 n'est pas prouvee, l'etage
//    GATES ne peut pas mentir : il EXECUTE ce qui existe et NOMME ce qui manque
//    dans la limitation de l'attestation. Il ne simule aucune porte absente.
//    Des que T01 livre ces commandes, l'etage les appelle sans changer d'ici.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = '/home/user/swe-ai-benchmark'
const BRANCH = 'claude/gallant-fermi-51jlsx'
const LEDGER = 'claude/gallant-fermi-51jlsx-ledger'

/** Cap du plan : 2 taches de front sur 4 coeurs, fermetures disjointes. */
const MAX_CONCURRENT = 2

/* ────────────────────────────────────────────────────────────────── schemas */

const OUTCOME = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: "true seulement si l'etage a atteint son etat cible" },
    state: { type: 'string', description: 'etat atteint, ou le refus nomme' },
    detail: { type: 'string', description: 'ce qui a ete OBSERVE : commandes, codes de sortie, extraits' },
    commit: { type: 'string', description: "sha du commit produit, ou chaine vide si aucun" },
    pushed: { type: 'boolean', description: 'les refs sont-elles sur origin' },
  },
  required: ['ok', 'state', 'detail', 'pushed'],
}

const WORLD = {
  type: 'object',
  properties: {
    resume_exit: { type: 'integer', description: '0 actionnable · 2 registre invalide · 3 tout prouve · 4 divergence · 11 rien actionnable' },
    head: { type: 'string' },
    clean: { type: 'boolean' },
    proven: { type: 'array', items: { type: 'string' } },
    ready: { type: 'array', items: { type: 'string' } },
    actionable: {
      type: 'array',
      items: { type: 'string' },
      description:
        "champ `actionable` de `bench resume --json` : les taches sur lesquelles il y a QUELQUE CHOSE A FAIRE. C'est READY *plus* les PERIMEES dont les dependances tiennent. Recopie-le tel quel.",
    },
    blocked: { type: 'array', items: { type: 'string' } },
    contested: { type: 'array', items: { type: 'string' } },
    capabilities_absent: { type: 'array', items: { type: 'string' } },
    unclassified_tasks: { type: 'array', items: { type: 'string' }, description: "taches dont un cas requis est encore UNCLASSIFIED dans verification/cases.lock.json" },
    halt: { type: 'string', description: "nom du refus fail-closed si l'iteration doit s'arreter, sinon chaine vide" },
    detail: { type: 'string' },
  },
  required: ['resume_exit', 'actionable', 'head', 'proven', 'ready', 'blocked', 'unclassified_tasks', 'halt', 'detail'],
}

const CLASSIFICATION = {
  type: 'object',
  properties: {
    cases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          proof_kind: { type: 'string', description: 'behaviour | refusal | artifact' },
          perturbation: { type: 'string', description: 'la mutation ciblee qui DOIT rendre ce cas rouge' },
          justification: { type: 'string', description: 'la phrase du cahier qui impose ce mode de preuve' },
        },
        required: ['id', 'proof_kind', 'perturbation', 'justification'],
      },
    },
  },
  required: ['cases'],
}

const AUDIT = {
  type: 'object',
  properties: {
    blocking: { type: 'boolean', description: "true UNIQUEMENT si une violation concrete et citable est constatee" },
    violations: { type: 'array', items: { type: 'string' } },
    detail: { type: 'string' },
  },
  required: ['blocking', 'violations', 'detail'],
}

/**
 * LES AUDITEURS — un angle ET un modele chacun.
 *
 * POURQUOI FABLE. Le plan promettait de « decorreler » les auditeurs par le
 * modele. Tant que tout heritait du modele de la session, les trois auditeurs
 * ET l'implementeur etaient le MEME modele : un relecteur qui partage les
 * angles morts de ce qu'il relit, c'est-a-dire le biais coder-reviewer que ce
 * depot existe pour casser (ADR-001).
 *
 * Fable 5.1 n'est pas un palier inferieur : c'est le modele le plus capable
 * d'Anthropic. Sous block-only, un auditeur plus faible serait nuisible — il ne
 * peut que RATER un blocage legitime, jamais en inventer un utile. Fable est
 * donc le seul choix qui decorrele SANS affaiblir. Les tarifs vont dans le meme
 * sens pour ce role : 10$/50$ par MTok contre 5$/25$, mais les lectures de
 * cache sont a 0,25$/MTok contre 0,50$ pour Opus 5 — et un auditeur relit sans
 * cesse le meme diff, donc l'essentiel de ses tokens sont des lectures.
 *
 * La correlation ENTRE les trois reste, et c'est assume : elle est traitee par
 * la diversite des angles, qui les fait chercher des choses differentes.
 *
 * RISQUE CONNU, et c'est pour lui que l'etage est fail-closed ci-dessous :
 * Fable 5.1 rejette `tool_choice` force (400), or `schema:` force un appel a
 * l'outil de sortie structuree. Si cette combinaison ne passe pas, les trois
 * agents rendent `null` — et il ne faut SURTOUT pas que ca ressemble a un audit
 * clair.
 */
const AUDITORS = [
  { lens: 'provenance', model: 'fable' },
  { lens: 'partition', model: 'fable' },
  { lens: 'vacuite', model: 'fable' },
]

/* ──────────────────────────────────────────────────────────────── le socle */

/**
 * Rappel commun a tous les agents. On ne recopie PAS CLAUDE.md : il est deja
 * injecte. On nomme seulement ce que l'etage doit savoir et que le fichier ne
 * dit pas — la branche, la maniere de committer, et l'interdit qui tue.
 */
const BASE = `Depot : ${REPO}. Branche de travail : ${BRANCH} (ledger : ${LEDGER}).

COMMITTER ET POUSSER — obligatoire a la fin de ton etage, sinon ton travail
n'existe pas (le conteneur est ephemere) :
  git -c core.hooksPath=.githooks commit -F - <<'EOF'
  <sujet>

  <corps : ce que tu as OBSERVE, pas ce que tu esperes>

  Bench-Task: <Txx>
  Bench-Role: <ton role>

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Qi32UrVNfvtYcyqYoWS1F1
  EOF
  git push -u origin ${BRANCH}
En cas d'echec reseau du push : reessaie 4 fois (2s, 4s, 8s, 16s).

CE QUI TE FERA REFUSER PLUS TARD, MECANIQUEMENT :
- melanger dans UN commit une zone d'implementation (IMPL, HARNESS) et une zone
  de jugement (ACCEPTANCE, REFERENCE, MUTANT, GENERATOR) -> PROOF_TAINTED.
  Deux commits, deux Bench-Role.
- ecrire hors des zones de ton role (verification/ownership.json) -> PARTITION_VIOLATION.
- toucher acceptance/reference/** apres le gel sans ouvrir un SPEC_CONFLICT.
- affaiblir un cas : les cas requis et les empreintes ne peuvent que CROITRE.

N'INFERE JAMAIS l'avancement. \`node tools/bench resume\` est la seule autorite.
Rends un compte rendu de ce qui a ete EXECUTE et OBSERVE. Si tu n'as pas pu
atteindre l'etat cible, dis-le : ok=false avec le refus nomme. Un etage qui
ment coute plus cher qu'un etage qui echoue.`

/* ───────────────────────────────────────────────────────────────── prompts */

const preflightPrompt = `${BASE}

ETAGE 0 — PREFLIGHT. Tu ne produis aucun code. Tu etablis l'etat reel.

1. RESYNCHRONISATION. \`git fetch origin\` puis, si et seulement si c'est un
   fast-forward, \`git merge --ff-only\`. Ne jamais forcer, ne jamais rebaser le
   ledger (le hook pre-push le refuse, et il a raison : il porte les preuves).

2. SONDES. \`node tools/bench doctor\`. Les sondes ne sont JAMAIS mises en cache
   entre deux boots — c'est voulu, une attestation produite sur un hote plus
   capable ne vaut pas ici.

3. BOOTSTRAP SI NECESSAIRE. Si doctor nomme des capacites absentes parmi
   postgres18, s3, temporal, temporal-timeskip, net.veth-egress : lance
   \`bash infra/bootstrap/run-all.sh\` puis re-lance doctor. Ces scripts existent
   et ont ete verifies joignables. Tu es root. Une capacite qui reste absente
   apres bootstrap n'est PAS un echec de ton etage : rapporte-la, elle produira
   des verdicts BLOCKED nommes, jamais un PASS affaibli.

4. ETAT. \`node tools/bench resume --json\`. Rends ses champs tels quels.

5. CLASSIFICATION RESTANTE. Lis verification/cases.lock.json et rends la liste
   des taches dont au moins un cas porte proof_kind UNCLASSIFIED.

6. PRECONDITIONS FAIL-CLOSED. Pose halt (et n'ecris rien) si l'un de ces etats
   est constate : digest du cahier qui ne correspond plus, registre invalide,
   cases.lock plus etroit que les cartes, racine gelee modifiee, chemins
   revendiques par aucune zone, SPEC_CONFLICT ouvert, tache CONTESTED.
   OU CHERCHER UN SPEC_CONFLICT : docs/spec-conflicts/*.md. Une entree portant
   « statut : OUVERT » est un halt — une question de specification non tranchee
   se propagerait a tous les etages en aval. Une entree « RESOLU » ne bloque
   rien : elle fait autorite sur son sujet et les etages la consultent.
   Si le ledger n'est pas en avance rapide, ou si des refs ne sont pas poussees,
   corrige-le (push atomique des deux refs) et dis-le — ce n'est pas un halt.

Sinon halt = chaine vide.`

const classifyPrompt = (batch) => `${BASE}

ROLE : spec-extractor. ETAGE CLASSIFY, lot ${batch.join(', ')}.

TU N'ECRIS AUCUN FICHIER. Tu rends des donnees ; un seul agent les ecrira, en
un seul commit — parce que verification/cases.lock.json est une entree GLOBALE
de input_digest : chaque modification re-perime les 44 attestations.

Pour CHAQUE cas requis des taches ${batch.join(', ')} :

1. Lis son enonce dans docs/cahier.md a la ligne \`cahier_line\` que
   verification/cases.lock.json donne deja pour ce cas. C'est la seule source.
   Tu ne lis AUCUNE implementation : la classification doit rester derivable du
   cahier seul.

2. Classe-le, en te servant du champ proof_kinds de cases.lock.json :
   - behaviour : le cas exerce un export metier et observe son resultat.
     Perturbation valide : stuber les exports du module.
   - refusal : le cas affirme qu'une entree est REFUSEE (erreur, code non nul,
     exception). PIEGE DECISIF : un stub qui leve rend ce cas VERT sans rien
     prouver. La perturbation correcte est INVERSE — rendre l'implementation
     PERMISSIVE et exiger que le cas devienne rouge.
   - artifact : le cas affirme une propriete d'un fichier ou d'une
     configuration, sans appeler d'export metier. Stuber n'y change rien ; seule
     la mutation de l'artefact mord.

3. Ecris la perturbation CIBLEE : la modification precise qui doit faire virer
   ce cas au rouge, decrite par son ROLE dans le programme, jamais par un chemin
   de fichier (l'implementation n'existe pas encore pour la plupart des taches).

Mesure sur T00, deja classe et qui te sert d'etalon : 2 cas behaviour, 3 refusal,
1 artifact. Appliquer la regle universelle du stub aurait produit un faux PASS
sur 4 cas sur 6 des la premiere tache. Ne classe pas par defaut en behaviour.`

const classifyWriterPrompt = (payload) => `${BASE}

ROLE : spec-extractor. ETAGE CLASSIFY — ecriture, UN SEUL COMMIT.

Voici les classifications produites par les extracteurs, en JSON :

${payload}

1. Applique-les a verification/cases.lock.json : pour chaque cas, remplace
   proof_kind UNCLASSIFIED par la valeur donnee et renseigne perturbation.
   NE TOUCHE A RIEN D'AUTRE — ni les ids, ni les cahier_line, ni requires, ni
   blockable, ni le nombre de cas. Aucun cas ne disparait, aucun n'est ajoute.

2. Verifie : \`node tools/bench registry lint\` doit rester vert, et le compte de
   cas doit rester 279. Refuse et rapporte si l'un des deux bouge.

3. Commit UNIQUE, zone REGISTRY, Bench-Role: spec-extractor. Puis push.

4. CONSEQUENCE A ASSUMER, PAS A MASQUER : cases.lock.json est une entree
   GLOBALE de input_digest. Ce commit re-perime l'attestation de T00, qui
   passera STALE. Relance donc \`node tools/bench accept T00\` apres le push, puis
   \`git push --atomic origin ${BRANCH} ${LEDGER}\`, et verifie par
   \`node tools/bench resume\` que T00 est bien revenue en [H]. Si elle n'y revient
   pas, c'est ok=false : ne le contourne sous aucun pretexte.`

const specPrompt = (T) => `${BASE}

ROLE : spec-extractor. ETAGE SPEC, tache ${T}.

Produis docs/specs/${T}.md : la carte de specification de ${T}.

REGLE UNIQUE ET NON NEGOCIABLE — extraction VERBATIM. Chaque affirmation de la
carte est un bloc copie octet a octet depuis docs/cahier.md, accompagne de sa
plage de lignes, de sorte que \`sed -n '<a>,<b>p' docs/cahier.md\` la reproduise
exactement. AUCUNE prose propre a l'extracteur.

POURQUOI CETTE SEVERITE. L'attaque la plus probable contre ce dispositif est le
spec-card poisoning : sept roles « independants » lisant tous une paraphrase
ecrite en quatre-vingt-dix secondes par un seul agent. Supprimer une clause
d'un cas suffit a corrompre toute la chaine en aval, silencieusement. Une
paraphrase fidele est indistinguable d'une paraphrase empoisonnee ; un bloc
verbatim, non.

Verifie ton propre travail : pour chaque bloc, relance le \`sed\` et compare.
Rapporte le nombre de blocs et le resultat de cette comparaison.

Commit zone SPEC, Bench-Role: spec-extractor. Puis push.`

/**
 * LES DEUX TRANSCRIPTEURS DE FIXTURES.
 *
 * §F impose de materialiser les fixtures maitresses « sans recalcul depuis
 * l'implementation ». Un seul transcripteur ne peut pas satisfaire ca de facon
 * verifiable : rien ne distingue une transcription fidele d'une transcription
 * fautive, et une fixture fausse rend VERTS des cas qui devraient rougir —
 * pour toujours, puisque REFERENCE est gelee apres T01.
 *
 * D'ou DEUX transcriptions a CADRAGES OPPOSES, ecrites sans se voir :
 *   A part de la SOURCE  — il lit §F fixture par fixture et materialise.
 *   B part des CONSOMMATEURS — il lit les cas d'acceptation qui citent chaque
 *     fixture et deduit ce qu'elle doit contenir pour que ces cas aient un sens.
 * Une erreur de A devrait etre reproduite a l'identique par B pour survivre.
 * Les deux ecrivent dans .bench/ (gitignore) : aucun n'ecrit dans le depot, donc
 * aucune course sur l'index, et la comparaison reste possible.
 */
const fixturePrompt = (T, side) => `${BASE}

ROLE : fixture-transcriber (${side}). ETAGE FIXTURES, tache ${T}.

Tu materialises les fixtures maitresses de la section §F du cahier
(docs/cahier.md, autour des lignes 101-135 : F-MONEY, F-BUDGET, F-QUALITY,
F-COST-RATIO, F-CLUSTERS, F-BOOTSTRAP, F-RESERVATION, F-FAILURE, F-POWER,
F-REGRESSION, et toute autre F-* que tu y trouves — verifie, ne te fie pas a
cette liste).

TON CADRAGE, ET LUI SEUL :
${
  side === 'A'
    ? `Tu pars de la SOURCE. Tu lis §F fixture par fixture, dans l'ordre du
cahier, et tu materialises exactement ce que le texte enonce. Tu ne consultes
AUCUN cas d'acceptation, AUCUNE suite de tests, AUCUNE implementation.`
    : `Tu pars des CONSOMMATEURS. Pour chaque fixture, tu cherches d'abord quels
cas d'acceptation la citent (verification/cases.lock.json, docs/cahier.md §H) et
tu deduis ce que la fixture doit contenir pour que ces cas aient un sens ; tu
confrontes ensuite au texte de §F. Tu ne consultes AUCUNE implementation.`
}

OU ECRIRE : \`.bench/fixtures/${side}/\` — un fichier JSON par fixture, nomme
d'apres elle (\`F-MONEY.json\`, \`F-QUALITY.json\`, …). N'ECRIS RIEN dans le
depot : pas de git add, pas de commit. Ton etage ne produit aucun commit, et
c'est voulu — c'est l'etage de scellement qui materialise, si et seulement si
toi et l'autre transcripteur concordez.

REGLES :
- Les valeurs viennent du CAHIER, jamais d'un calcul fait par une implementation.
  Chaque valeur porte sa ligne source (champ \`cahier_line\`), verifiable par
  \`sed -n '<n>p' docs/cahier.md\`.
- Les nombres exacts sont exacts : \`V=13/16=0.8125\`, \`340\`, \`2720\`, \`16320\`,
  les horloges de F-RESERVATION. Une valeur arrondie est une fixture fausse.
- Si le cahier est ambigu sur un point, NE TRANCHE PAS : consigne l'ambiguite
  dans un champ \`ambiguites\` du fichier concerne. L'etage de scellement
  s'arretera dessus, ce qui est le bon resultat.
- Conventions explicites du cahier (par ex. « R vaut null lorsqu'aucune intention
  admissible n'est proposee ») : elles font partie de la fixture.

Rends : le nombre de fixtures ecrites, leur liste, les ambiguites relevees.
ok=true si tu as ecrit tes fichiers ; commit vide, pushed=false — c'est normal
pour cet etage.`

/**
 * LE SCELLEMENT. C'est ici, et nulle part ailleurs, que REFERENCE est ecrite.
 * Un desaccord entre A et B n'est PAS un incident a resoudre au jugement : c'est
 * le signal que le §F a ete lu de deux facons, donc qu'il ne sera pas lu de la
 * meme facon par les sept roles en aval. On s'arrete.
 */
const fixtureSealPrompt = (T) => `${BASE}

ROLE : fixture-transcriber (scellement). ETAGE FIXTURES, tache ${T}.

Deux transcriptions independantes du §F t'attendent dans \`.bench/fixtures/A/\`
et \`.bench/fixtures/B/\`, ecrites par deux agents a cadrages opposes qui ne se
sont pas vus.

0. LIS D'ABORD LES ARBITRAGES DEJA RENDUS : docs/spec-conflicts/*.md. Une
   entree portant « statut : RESOLU » fait AUTORITE sur la divergence qu'elle
   couvre — applique sa regle et ne rebloque pas dessus. Une entree « OUVERT »
   bloque au contraire l'etage : la question n'est pas tranchee.
   SC-001 tranche le poids des exigences : un poids est fixe a l'introduction de
   l'exigence et ne change pas tant qu'elle est active. En F-QUALITY, B@1 pese
   donc 1 et C@1 pese 2 en P3 et P4. SC-001 regle aussi, sans arbitrage, l'unite
   des couts de F-FAILURE (non specifiee : « micro-USD » n'est PAS en ligne 121,
   verifie par grep) et le nombre attendu de F-REGRESSION (1, ligne 129, « en
   produit une »).
   N'INVENTE PAS d'arbitrage toi-meme et n'en deduis pas d'une entree resolue
   vers un autre sujet : tout ce qui n'est pas couvert par une entree RESOLU
   arrete l'etage, comme ci-dessous.

1. COMPARE-LES, valeur par valeur (pas fichier par fichier : la mise en forme
   peut differer legitimement, les VALEURS non). Toute divergence de valeur, et
   toute \`ambiguites\` non vide, ARRETE l'etage : rends ok=false, state
   \`FIXTURES_DISCORDANTES\` ou \`FIXTURES_AMBIGUES\`, et NOMME la divergence
   exacte (fixture, champ, valeur A, valeur B, ligne du cahier). N'arbitre pas,
   ne choisis pas « la plus plausible » : deux lectures divergentes du §F, c'est
   precisement ce que la double transcription existe pour attraper, et le gel
   rendrait l'erreur permanente.
   UNE AMBIGUITE N'EST BLOQUANTE QUE SI ELLE PORTE SUR UNE VALEUR QUE TU DOIS
   ECRIRE. Une question consignee par un transcripteur qui ne change aucune
   valeur materialisee (par ex. sur un cas d'acceptation, ou sur un champ que ni
   A ni B n'inscrivent) se reporte : cite-la dans ton compte rendu et continue.
   Bloquer sur une ambiguite sans effet ferait de la prudence un arret
   permanent.

2. SI ET SEULEMENT SI elles concordent : materialise \`acceptance/reference/**\`
   depuis la transcription commune. Un fichier par fixture, chaque valeur portant
   sa \`cahier_line\`.

3. GELE : ecris \`docs/FROZEN_ROOTS.json\` avec le tree oid de
   \`acceptance/reference\` (\`git rev-parse HEAD:acceptance/reference\` APRES le
   commit — donc ecris-le en second commit, ou inscris l'oid calcule par
   \`git write-tree\` sur l'index ; explique ce que tu as fait). Ce fichier est
   ce qui rend toute alteration ulterieure detectable.

4. ARCHIVE LES DEUX TRANSCRIPTIONS sur le ledger, sous
   \`fixtures-transcripts/${T}/\` (le repertoire existe deja). C'est ce qui rend
   la concordance AUDITABLE plus tard, et pas seulement affirmee maintenant.
   Utilise la plomberie du ledger, jamais un checkout de la branche de ledger.

5. Commit zone REFERENCE (\`acceptance/reference/**\` et
   \`docs/FROZEN_ROOTS.json\` sont tous deux dans cette zone),
   Bench-Role: fixture-transcriber. Puis push les deux refs.

Rends le nombre de fixtures scellees, le tree oid gele, et le resultat de la
comparaison A/B en clair.`

const testsPrompt = (T) => `${BASE}

ROLE : test-author. ETAGE TESTS, tache ${T}.

TU ES AVEUGLE A L'IMPLEMENTATION. Tu derives le contrat de docs/specs/${T}.md et
du cahier. Tu ne lis pas les sources de la tache, et tu ne les lis pas non plus
par \`git show\`. ADR-001 est explicite : cet aveuglement est PROCEDURAL, pas
structurel — rien ne t'en empeche techniquement, c'est une discipline auditable
au diff. La respecter est la seule chose qui donne du sens a ton etage.

Produis deux artefacts :

1. La suite d'acceptation, au chemin que verification/tasks.json declare dans
   acceptance_entry de ${T} (zone ACCEPTANCE). Elle doit couvrir TOUS les cas
   requis de ${T}, et le nom de chaque test doit contenir l'identifiant du cas
   (ex. « ${T}.A1 … ») : c'est ainsi que le runner projette les tests observes
   sur les cas requis.

2. verification/mutants/${T}.json (zone MUTANT) : un mutant par cas requis,
   conforme au proof_kind fixe par verification/cases.lock.json. Prends
   verification/mutants/T00.json comme modele de forme et de rigueur.

PROVENANCE DES LITTERAUX. Tout litteral compare dans une assertion provient soit
d'un import de acceptance/reference/**, soit porte un commentaire \`// cahier:L<n>\`
resolvable. Cela ferme la fermeture la plus courante d'un test rouge : « je
lance, je vois ce que ca donne, je fige ».

Un cas qui n'observe rien ne vaut rien : pas de test a zero assertion, pas de
tautologie, pas de retour anticipe conditionne par l'environnement.

ACCEPTANCE et MUTANT sont deux zones de jugement : elles peuvent entrer dans le
meme commit, mais JAMAIS avec IMPL ou HARNESS. Bench-Role: test-author. Puis push.`

const redPrompt = (T) => `${BASE}

ETAGE RED, tache ${T}. Aucun code metier ici.

1. Si les exports que la suite appelle n'existent pas encore, ecris le SQUELETTE
   minimal : chaque export leve NotImplemented. Zone IMPL (ou HARNESS si la
   tache livre le verificateur). Commit Bench-Role: implementer, puis push.
   C'est bien un commit d'implementation : il ne doit contenir AUCUN fichier de
   zone de jugement.

2. Lance \`node tools/bench red ${T}\`.

CE QUE LA PORTE REFUSE, ET QU'IL NE FAUT PAS CONTOURNER :
 - suite qui ne se charge pas -> zero cas execute, donc aucune preuve ;
 - MODULE_NOT_FOUND ou TYPE_ERROR -> c'est la forme par defaut du TDD en
   monorepo TypeScript, elle ne dit rien de ce que le test verifie. Seuls
   ASSERTION_FAILED et STUB_NOT_IMPLEMENTED comptent comme rouge legitime ;
 - un cas deja VERT est VACUOUS, sauf contre-epreuve par mutation : tu dois
   alors APPLIQUER reellement le mutant nomme dans verification/mutants/${T}.json,
   OBSERVER le cas virer au rouge, restaurer, et passer la preuve a
   \`bench red ${T} --proof='{"${T}.Ax":{"killed_by":"${T}.Mx","note":"..."}}'\`.
   Une note qui decrit une mutation que tu n'as pas executee est un faux.

La porte s'enregistre sur le ledger. Pousse les deux refs :
\`git push --atomic origin ${BRANCH} ${LEDGER}\`.

ok=true seulement si le verdict est RED_RECORDED.`

const implPrompt = (T) => `${BASE}

ROLE : implementer. ETAGE IMPL, tache ${T}.

Rends verts les cas requis de ${T}. Zones autorisees : IMPL, HARNESS, INFRA.

TU NE TOUCHES A AUCUNE ZONE DE JUGEMENT. Si un test te parait faux, tu ne le
corriges pas : tu le RAPPORTES avec l'ecart precis entre ce que le cahier exige
et ce que le test affirme. Un implementeur qui corrige le test qui le juge est
exactement le biais que toute cette partition existe pour rendre impossible —
et le verificateur le detectera comme PROOF_TAINTED de toute facon.

Interdit, sans exception : remplacer un service reel declare dans \`requires\` par
un mock pour clore une tache bloquee. Un prerequis absent produit BLOCKED,
jamais PASS.

Boucle : implemente, \`node tools/bench verify:task ${T}\`, corrige, recommence.
ok=true seulement quand la commande sort en 0 avec reason=PASS et les six cas
verts. Commit Bench-Role: implementer, puis push.`

const gatesPrompt = (T) => `${BASE}

ETAGE GATES, tache ${T}. Tu n'implementes rien, tu executes les portes.

1. PORTE MUTATION. Pour chaque mutant de verification/mutants/${T}.json :
   applique-le REELLEMENT, relance \`node tools/bench verify:task ${T}\`, exige que
   le cas nomme par kills_case devienne ROUGE, puis restaure l'arbre exactement
   (\`git checkout --\` sur les fichiers touches ; verifie par \`git status --porcelain\`).
   Un mutant qui laisse la suite verte denonce un CAS CREUX, pas une
   implementation correcte : rapporte-le comme violation, n'essaie pas de le
   « reparer » en touchant le test.
   Casser au build ne compte pas comme tuer un cas.

2. PORTES QUI N'EXISTENT PAS ENCORE. \`bench necessity\` et \`bench mutate\` sont
   des livrables de T01. Verifie s'ils existent (\`node tools/bench help\`).
   - s'ils existent : lance-les, leur verdict fait foi ;
   - sinon : NE SIMULE RIEN. Rapporte-les comme portes absentes. Elles seront
     nommees dans les limitations de l'attestation, pas masquees.

Ne committe que si tu as du restaurer quelque chose. Rends le tableau
mutant -> cas tue -> observe.`

const auditPrompt = (T, lens) => `${BASE}

ROLE : auditor (${lens}). ETAGE AUDIT, tache ${T}. TU N'ECRIS RIEN.

Tu es BLOCK-ONLY : ton silence n'accorde rien, et tu n'as aucun pouvoir
d'approbation. \`bench accept\` reste la seule autorite. Tu ne peux que produire
un BLOCAGE, et seulement adosse a une violation concrete et citable — fichier,
ligne, commande observee.

Ton angle : ${lens}.

- provenance : un litteral compare dans une assertion vient-il d'une reference
  ou d'une ligne du cahier citee et resolvable ? Ou a-t-il ete fige apres
  observation d'une execution ?
- partition : un commit de la plage melange-t-il implementation et jugement ?
  Le trailer Bench-Role correspond-il aux zones reellement touchees ?
  (\`git log\`, \`git show --name-only\`, verification/ownership.json.)
- vacuite : un cas requis passerait-il encore si l'implementation etait
  remplacee par un stub inerte ? Un cas de type refusal reste-t-il vert sous un
  stub qui leve — donc sans rien prouver ?

Dans le doute, NE BLOQUE PAS : un blocage sans violation citable coute une
iteration a tout le monde. blocking=true exige une citation.`

const acceptPrompt = (T) => `${BASE}

ETAGE ACCEPT, tache ${T}. Tu n'ecris aucun code.

1. \`git status --porcelain\` doit etre vide, et les deux refs poussees. Sinon
   committe ce qui reste sous le bon role, ou rapporte ok=false.

2. \`node tools/bench accept ${T}\`.

La commande refait TOUTE la porte elle-meme, en clean-room : arbre propre,
sources poussees, porte rouge presente sur le ledger et ancetre de HEAD, regle
des deux cles re-derivee sur la plage depuis la porte rouge, capacites
re-sondees ce boot, worktree detache neuf, installation figee. Tu ne peux ni
l'aider ni la contourner : c'est le but.

Si elle REFUSE, le verdict est nomme (PROOF_TAINTED, NO_RED_GATE, BLOCKED,
DIRTY_TREE, SOURCE_NOT_PUSHED, NOT_PROVEN…). Rapporte-le tel quel avec son
detail. NE TENTE AUCUN CONTOURNEMENT : ni --no-verify, ni edition du registre,
ni suppression d'un cas.

3. Si elle accepte : \`git push --atomic origin ${BRANCH} ${LEDGER}\`.

4. Verifie par \`node tools/bench resume\` que ${T} apparait bien en [H] prouve.
   C'est la SEULE confirmation qui compte — pas la sortie de accept, pas ton
   impression. ok=true exige ce [H].`

/* ─────────────────────────────────────────────────────────────────── corps */

phase('Preflight')
const world = await agent(preflightPrompt, { label: 'preflight', phase: 'Preflight', schema: WORLD })

if (!world) return { halted: 'PREFLIGHT_FAILED', detail: "l'etage preflight n'a rien rendu" }
if (world.halt) {
  log(`HALT fail-closed : ${world.halt}`)
  return { halted: world.halt, detail: world.detail, world }
}
if (world.resume_exit === 3) {
  log('Les 44 taches sont prouvees a HEAD.')
  return { done: true, world }
}

// ACTIONNABLE, PAS `ready`. Une tache PERIMEE n'est pas dans `ready` et c'est
// pourtant l'action la plus urgente : ses entrees ont change, sa preuve ne lie
// plus HEAD. Le meme piege avait fait sortir `bench resume` en 11 ; le corriger
// dans resume sans corriger SON CONSOMMATEUR laissait la boucle s'arreter sur
// NO_READY_TASK des qu'une entree GLOBALE bougeait — c'est-a-dire a chaque tour,
// puisque chaque etage touche le registre ou le runner. Observe en vrai.
const todo = world.actionable?.length ? world.actionable : world.ready
log(`HEAD ${world.head.slice(0, 8)} · prouvees ${world.proven.length}/44 · actionnables ${todo.length} · bloquees ${world.blocked.length}`)
if (world.capabilities_absent?.length) log(`capacites absentes apres bootstrap : ${world.capabilities_absent.join(', ')}`)

// ── CLASSIFY. En UN passage, jamais tache par tache : cases.lock.json est une
// entree GLOBALE de input_digest, donc chaque ecriture re-perime les 44
// attestations. Classer au fil de l'eau couterait un clean-room complet par
// tache deja prouvee — un cout quadratique pour une raison purement procedurale.
let classification = null
if (world.unclassified_tasks.length) {
  phase('Classify')
  log(`${world.unclassified_tasks.length} tache(s) sans proof_kind — classification en un seul commit`)

  const BATCH = 8
  const batches = []
  for (let i = 0; i < world.unclassified_tasks.length; i += BATCH) {
    batches.push(world.unclassified_tasks.slice(i, i + BATCH))
  }

  const classified = await parallel(
    batches.map((b, i) => () =>
      agent(classifyPrompt(b), { label: `classify:${b[0]}..${b[b.length - 1]}`, phase: 'Classify', schema: CLASSIFICATION })
    )
  )
  const cases = classified.filter(Boolean).flatMap((c) => c.cases)
  log(`${cases.length} cas classes par ${classified.filter(Boolean).length}/${batches.length} extracteurs`)

  // Un seul ecrivain : un commit unique sur cases.lock.json, puis re-attestation
  // de T00 que ce commit vient mecaniquement de perimer.
  classification = await agent(classifyWriterPrompt(JSON.stringify({ cases }, null, 1)), {
    label: 'classify:ecriture',
    phase: 'Classify',
    schema: OUTCOME,
  })
  if (!classification?.ok) {
    return { halted: 'CLASSIFY_FAILED', detail: classification?.detail ?? 'aucun retour', world }
  }
}

// ── FRONTIERE. Le plan impose un cap de 2 : les fermetures doivent etre
// DISJOINTES, pas seulement les source_paths, et les schemas partages sont
// serialises chez l'integrateur.
const frontier = todo.slice(0, MAX_CONCURRENT)
if (!frontier.length) {
  log(`Rien d'actionnable. Bloquees : ${world.blocked.join(', ') || 'aucune'}`)
  return { halted: 'NO_READY_TASK', blocked: world.blocked, capabilities_absent: world.capabilities_absent, world }
}
log(`Frontiere : ${frontier.join(', ')}`)

// ── PIPELINE. Chaque etage est IDEMPOTENT : il lit l'etat reel de la tache
// avant d'agir, donc rejouer la boucle apres une coupure converge sans
// retravail. Pas de barriere entre les etages : une tache peut etre en Impl
// pendant que l'autre est encore en Tests.
const results = await pipeline(
  frontier,
  (T) => agent(specPrompt(T), { label: `spec:${T}`, phase: 'Spec', schema: OUTCOME }),
  // FIXTURES. Les deux transcripteurs en parallele — ils n'ecrivent que dans
  // .bench/, donc aucune course sur l'index — puis le scellement, qui refuse de
  // materialiser si leurs valeurs divergent. Sans cet etage, T01.A6 (« F-MONEY
  // corrompue a 341 detectee ») ne peut pas rougir : acceptance/reference/**
  // n'existe pas, et l'implementeur n'a pas le droit de l'ecrire.
  (prev, T) =>
    prev?.ok === false
      ? null
      : parallel(
          ['A', 'B'].map((side) => () =>
            agent(fixturePrompt(T, side), { label: `fixtures:${T}:${side}`, phase: 'Fixtures', schema: OUTCOME })
          )
        ).then((sides) => {
          const dead = ['A', 'B'].filter((_, i) => !sides[i])
          if (dead.length)
            return { ok: false, state: 'FIXTURES_TRANSCRIPTION_ABSENTE', detail: `transcripteur(s) sans rendu : ${dead.join(', ')} — une seule transcription ne vaut rien, c'est la CONCORDANCE qui prouve`, pushed: false }
          const ko = sides.filter((v) => v.ok === false)
          if (ko.length) return { ok: false, state: 'FIXTURES_TRANSCRIPTION_ECHOUEE', detail: ko.map((v) => v.state).join(' | '), pushed: false }
          return agent(fixtureSealPrompt(T), { label: `fixtures:${T}:scellement`, phase: 'Fixtures', schema: OUTCOME })
        }),
  (prev, T) => (prev?.ok === false ? null : agent(testsPrompt(T), { label: `tests:${T}`, phase: 'Tests', schema: OUTCOME })),
  (prev, T) => (prev?.ok === false ? null : agent(redPrompt(T), { label: `red:${T}`, phase: 'Red', schema: OUTCOME })),
  (prev, T) => (prev?.ok === false ? null : agent(implPrompt(T), { label: `impl:${T}`, phase: 'Impl', schema: OUTCOME })),
  (prev, T) => (prev?.ok === false ? null : agent(gatesPrompt(T), { label: `gates:${T}`, phase: 'Audit', schema: OUTCOME })),
  (prev, T) =>
    prev?.ok === false
      ? null
      : parallel(
          AUDITORS.map((a) => () =>
            agent(auditPrompt(T, a.lens), {
              label: `audit:${T}:${a.lens}@${a.model}`,
              phase: 'Audit',
              schema: AUDIT,
              model: a.model,
            })
          )
        ).then((votes) => {
          const who = AUDITORS.map((a) => `${a.lens}@${a.model}`).join(', ')
          // FAIL-CLOSED, ET C'EST LE POINT DE TOUT L'ETAGE.
          //
          // `parallel` resout un agent mort a `null`. L'ancien code faisait
          // `votes.filter(Boolean)` : un auditeur qui PLANTE devenait donc
          // indistinguable d'un auditeur qui n'a rien trouve. Sous block-only
          // — « le silence n'accorde rien » — c'est un faux PASS, et le pire
          // possible : trois auditeurs morts rendaient AUDIT_CLEAR en
          // annoncant « 0 auditeurs, aucun blocage citable ».
          //
          // Un audit ABSENT n'est pas un audit CLAIR. On exige les trois.
          const dead = AUDITORS.filter((_, i) => !votes[i])
          if (dead.length) {
            log(`AUDIT INCOMPLET ${T} : ${dead.map((a) => `${a.lens}@${a.model}`).join(', ')} sans verdict`)
            return {
              ok: false,
              state: 'AUDIT_INCOMPLETE',
              detail:
                `auditeur(s) sans verdict : ${dead.map((a) => `${a.lens}@${a.model}`).join(', ')}. ` +
                `Un audit absent n'est pas un audit clair. Cause probable si le modele est fable : ` +
                `Fable 5.1 rejette tool_choice force (400) et \`schema:\` force l'outil de sortie structuree.`,
              auditors: who,
              pushed: true,
            }
          }
          // Block-only : un blocage suffit a arreter la tache — aucune majorite
          // n'est requise pour bloquer, et aucune unanimite n'accorde quoi que
          // ce soit. `who` part dans l'issue pour que la correlation des
          // auditeurs reste VISIBLE, comme le plan l'exigeait.
          const blocking = votes.filter((v) => v.blocking)
          return blocking.length
            ? { ok: false, state: 'AUDIT_BLOCKED', detail: blocking.flatMap((v) => v.violations).join(' | '), auditors: who, pushed: true }
            : { ok: true, state: 'AUDIT_CLEAR', detail: `${votes.length} auditeurs (${who}), aucun blocage citable`, auditors: who, pushed: true }
        }),
  (prev, T) => (prev?.ok === false ? null : agent(acceptPrompt(T), { label: `accept:${T}`, phase: 'Accept', schema: OUTCOME }))
)

// L'issue rendue ici est un COMPTE RENDU, pas une preuve. La seule preuve est
// ce que `bench resume` recalcule depuis les objets git au prochain appel.
return {
  head_au_depart: world.head,
  classification: classification ? classification.state : 'deja classee',
  frontiere: frontier,
  issues: frontier.map((T, i) => ({ task: T, resultat: results[i] })),
  rappel: 'Verdict reel : relancer `node tools/bench resume`. Ce retour n\'atteste rien.',
}
