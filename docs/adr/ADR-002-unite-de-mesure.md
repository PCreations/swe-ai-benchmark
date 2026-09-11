# ADR-002 — Unité de mesure : tokens pondérés, grille tarifaire API comme proxy

Statut : accepté · 11/09/2026 · **révise A-001, puis se révise lui-même.**

## Historique de la décision

1. A-001 retenait les **tokens pondérés** comme métrique de décision.
2. Une revue externe a objecté que, sur forfait, les coefficients ne découlent
   d'aucune mesure ; passage temporaire au **brut, poids 1**.
3. **Décision finale : pondérés**, sur l'argument suivant, qui est le bon.

## Pourquoi le brut fausserait l'étude

Des tokens de catégories différentes ne représentent ni le même travail ni les
mêmes **leviers d'action**. C'est le point décisif :

| Catégorie | Levier pour la réduire |
|---|---|
| entrée fraîche | resserrer le contexte, lire moins de fichiers |
| écriture de cache | stabiliser le préfixe du prompt, choisir le bon TTL |
| lecture de cache | **aucun levier utile — c'est déjà l'optimum** |
| sortie | être moins verbeux, moins de réécritures complètes |

À poids 1, une configuration qui cache bien et une qui refait tout à chaque tour
se ressemblent, alors qu'elles diffèrent d'un facteur ~50 entre lecture de cache
et sortie. La métrique deviendrait aveugle au principal levier d'optimisation
d'une boucle agentique. **Le brut est donc le choix qui fausse l'étude, pas
l'inverse.**

## Deux pondérations documentées — et elles divergent

C'est le fait qui doit gouverner la prudence de l'analyse.

**A. Grille tarifaire (retenue).** Documentée : lecture de cache ≈ 0,1× le prix
d'entrée de base (0,025× sur Fable 5.1), écriture 1,25× à TTL 5 min et **2× à
TTL 1 h**, sortie 5× l'entrée (Opus 5 : 5 $/25 $ par MTok ; Sonnet 5 : 2 $/10 $).

**B. Grille des limites de débit.** Également documentée, et différente :

> On the Claude API, cache reads **do not count toward input-token rate limits**
> on most models (Haiku 3.5 is the documented exception).

Contre un plafond de débit, une lecture de cache pèse donc ≈ **0**, pas 0,1.

Les deux grilles décrivent des mécanismes réels mais **distincts**. Choisir A
n'est pas neutre, et il faut le dire.

## Décision

**`WeightedTokenCount` devient la métrique de décision et le budget.**

Grille retenue (`weights_id: "api-price/2026-09"`), cinq catégories :

| Catégorie | Poids |
|---|---|
| `input_fresh` | 1 |
| `cache_write_5m` | 1,25 |
| `cache_write_1h` | 2 |
| `cache_read` | 0,1 |
| `output` | 5 |

Cinq et non quatre : l'écriture de cache est tarifée différemment selon le TTL,
et le rapport d'usage les sépare effectivement. Les agréger perdrait l'écart
qu'une boucle attendant un humain entre deux tours paie en double.

Trois garde-fous, non négociables :

1. **Le vecteur brut à cinq composantes est toujours exporté**, en entiers
   exacts. La pondération est une vue dérivée ; si la formule réelle d'un
   forfait devenait connue, toute l'étude se réagrège sans réexécution.
2. **`weights_digest` est gelé dans le manifeste** avant campagne. Changer la
   grille change l'identité de la métrique, jamais silencieusement les
   résultats.
3. **Analyse de sensibilité obligatoire** : la décision est recalculée sous la
   grille B (débit). **Si le verdict s'inverse entre A et B, le rapport doit le
   dire** — une conclusion qui dépend du choix d'une grille non vérifiée est
   fragile, et la masquer serait la faute la plus grave possible ici.

## Ce qui n'est PAS établi

La motivation invoquée est que les forfaits Pro et Max fonctionneraient sur un
système pondéré. **Ce point n'est documenté nulle part dans les sources dont je
dispose** : aucune mention du décompte interne d'un quota d'abonnement.

La grille A est donc un **proxy plausible**, appuyé sur une tarification réelle,
et non une mesure du quota commercial. Aucune correspondance n'a été établie. Le
rapport doit l'écrire ainsi, et jamais présenter `WeightedTokenCount` comme
« ce que consomme ton forfait ».

La limitation commerciale du forfait reste enregistrée comme **événement
distinct** ; les tokens mesurés ne sont pas supposés reproduire sa règle interne.

## Sémantique documentée des compteurs

La disjonction des catégories n'est pas une hypothèse de conception :

> `input_tokens` **is the uncached remainder only.**
> Total prompt size = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`

Le rapport d'usage d'organisation ventile de même, en séparant les deux TTL :
`uncached_input_tokens`, `cache_read_input_tokens`,
`cache_creation.ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`,
`output_tokens`.

Conséquences : la somme est **directe** pour ce fournisseur, aucune
normalisation n'est requise, et l'adaptateur l'**affirme par assertion** plutôt
que de la présumer. Un autre fournisseur exposant un total d'entrée incluant le
cache normaliserait dans son propre adaptateur.

## Fixtures

`F-TOKENS` — vecteur brut, poids 1, catégories disjointes :
100 entrée fraîche + 40 lecture de cache + 10 écriture + 20 sortie = **170**.
Un sous-agent consommant 30 porte le total à **200**.

`F-WEIGHTED` — même trace sous la grille A :
100×1 + 40×0,1 + 10×1,25 + 20×5 = 100 + 4 + 12,5 + 100 = **216,5**.
La sortie pèse ici presque autant que tout le reste : c'est exactement l'écart
que le brut effacerait.

Les deux fixtures coexistent : le brut reste la donnée, le pondéré la décision.

`F-MONEY` redevient un test auxiliaire de l'arithmétique entière et de la
disjonction des champs ; elle ne prouve plus le gate d'usage.
