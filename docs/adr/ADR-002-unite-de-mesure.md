# ADR-002 — Unité de mesure : tokens bruts décisionnels, pondérés diagnostiques

Statut : accepté · 11/09/2026 · révise l'amendement A-001.

## Contexte

A-001 faisait des **tokens pondérés** (1 / 1,25 / 0,1 / 5) la métrique de
décision. Objection retenue : sur un forfait, ces coefficients ne découlent
d'aucune mesure — ils viennent d'une grille tarifaire API que personne ne paie.
Les présenter comme le compteur du quota commercial supposerait une
correspondance que nous n'avons pas établie.

## Décision

**`usage_tokens_total`, poids 1, est la mesure principale et le budget.**

- Type `TokenCount` : entier non négatif, portée explicite (appel, période,
  trajectoire, campagne).
- Catégories **disjointes**, et c'est documenté, pas supposé (voir plus bas) :
  entrée fraîche, lecture de cache, écriture de cache (deux TTL), sortie.
  L'adaptateur **vérifie** la disjonction par assertion au lieu de normaliser
  à l'aveugle ; si un autre fournisseur exposait un total d'entrée incluant le
  cache, c'est son adaptateur qui normaliserait avant de sommer.
- Couvre **tous** les appels du candidat : agent principal, sous-agents,
  compactages, et retries ayant réellement consommé.
- Une catégorie absente vaut `UNKNOWN`, **jamais zéro**.

**`WeightedTokenCount` est un type DISTINCT**, portant son `weights_digest`,
publié en diagnostic. Changer la grille ne change ni le total brut ni la
décision.

La grille diagnostique compte **cinq** catégories, pas quatre : l'écriture de
cache est tarifée différemment selon le TTL (≈1,25× à 5 minutes, ≈2× à 1 heure)
et le rapport d'usage les sépare effectivement. Les agréger perdrait justement
l'écart que le diagnostic doit rendre visible.

Les tokens du moteur (fabrique et évaluation des scénarios) sont comptés
séparément de ceux du candidat.

## Fixture

`F-TOKENS` remplace `F-MONEY` comme preuve du gate d'usage :
100 entrée fraîche + 40 lecture de cache + 10 écriture + 20 sortie = **170**.
Un sous-agent consommant 30 porte le total à **200**.

`F-MONEY` reste un test auxiliaire de l'arithmétique monétaire et de la
disjonction des champs ; elle ne prouve plus le gate d'usage.

## Sémantique documentée des compteurs de cache

La disjonction n'est pas une hypothèse de conception : elle est la sémantique
publiée de l'API.

> `input_tokens` **is the uncached remainder only.**
> Total prompt size = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`

| Champ | Contenu |
|---|---|
| `input_tokens` | reste NON caché, tarifé plein |
| `cache_creation_input_tokens` | tokens écrits dans le cache lors de cette requête |
| `cache_read_input_tokens` | tokens servis depuis le cache |
| `output_tokens` | sortie |

Le rapport d'usage d'organisation les ventile de la même façon, en séparant en
outre les deux TTL d'écriture :
`uncached_input_tokens`, `cache_read_input_tokens`,
`cache_creation.ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`,
`output_tokens`.

Conséquences pour le socle :

1. `usage_tokens_total` est une **somme directe** des quatre champs par appel.
   Aucune normalisation n'est requise pour ce fournisseur ; l'adaptateur
   l'**affirme** par assertion plutôt que de la présumer.
2. Un cas d'acceptation gratuit et probant pour la passerelle (T17/T28) : deux
   requêtes identiques successives doivent donner
   `cache_read_input_tokens > 0` à la seconde. Un zéro persistant trahit un
   invalidateur silencieux du préfixe — un écart de coût réel, sans erreur ni
   message.

## Limite assumée

La limitation commerciale du forfait est enregistrée comme **événement
distinct**. Les tokens mesurés ne sont pas supposés reproduire sa règle interne :
la sémantique ci-dessus décrit des compteurs d'API, pas le décompte interne
d'un quota d'abonnement.
