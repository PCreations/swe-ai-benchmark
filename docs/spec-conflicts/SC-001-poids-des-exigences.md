# SC-001 — Le poids d'une exigence persiste-t-il d'une période à l'autre ?

    statut : RESOLU
    ouvert : 2026-09-11
    porte  : F-QUALITY (§F), et par extension toute fixture où une exigence
             traverse plusieurs périodes
    origine : divergence DIV-3 entre deux transcriptions indépendantes du §F,
              scellement refusé — ledger, commit f17785e0

## Les deux passages

**§F, ligne 107** énonce le résultat :

> `F-QUALITY`. Quatre périodes de même durée avec `Q=[1, 1/2, 3/4, 1]` donnent `V=13/16=0.8125`.

**§F, ligne 109** énonce les entrées, et n'énonce chaque poids **qu'une fois**,
à l'introduction de l'exigence :

> Entrées exactes de Q : P1 exige A@1 et B@1, poids 1 chacun, tous deux
> satisfaits ; P2 ajoute C@1 de poids 2, non satisfaite, A et B restant
> satisfaites ; P3 remplace A@1 par A@2 de poids 1 satisfaite, B@1 est violée et
> C@1 satisfaite ; P4 retire B, A@2 et C@1 restent satisfaites.

Le poids de `B@1` et de `C@1` en P3 et P4 n'est donc écrit nulle part.

## Pourquoi l'arithmétique ne tranche pas

C'est le point qui rend cette entrée nécessaire, et il a été **vérifié**, pas
supposé. La transcription A a propagé les poids (`B@1=1`, `C@1=2`) :

    Q3 = (1 + 2) / (1 + 1 + 2) = 3/4   ✓

La transcription B a refusé de propager et a exhibé un contre-exemple
(`B@1=3`, `C@1=8`) :

    Q3 = (1 + 8) / (1 + 3 + 8) = 9/12 = 3/4   ✓
    Q4 = (1 + 8) / (1 + 8)     = 1           ✓

Les deux jeux de poids reproduisent `Q=[1, 1/2, 3/4, 1]`, donc aussi
`V=13/16`, `U=2/3` et le ratio d'intentions `7/10`. **Aucune valeur énoncée par
le cahier ne distingue les deux lectures.** Un test ne peut pas arbitrer ceci :
c'est pourquoi la question remonte ici plutôt que de se résoudre en vert.

## Effet si on se trompe

`acceptance/reference/**` est **gelée après T01** (`verification/ownership.json`,
note « frozen ») : la corriger ensuite déplace `docs/FROZEN_ROOTS.json` et
invalide les 44 attestations. Et l'erreur serait **silencieuse** — elle
reproduit toute valeur que le cahier affirme, donc aucun cas d'acceptation ne la
rougirait.

## Résolution

**Règle retenue, confirmée explicitement par le responsable du cahier le
2026-09-11 :**

> Le poids d'une exigence est fixé à son introduction et ne change pas tant
> qu'elle est active.

Les poids de la transcription A sont donc les bons : en P3 et P4, `B@1` pèse 1
et `C@1` pèse 2.

**Appui textuel** — §H ligne 129, à propos de F-REGRESSION :

> Compter par id/version active, pas par nombre d'assertions.

Le cahier traite donc une exigence comme une identité stable (`id@version`), ce
qui rend naturel que ses propriétés lui restent attachées. C'est un appui, pas
une démonstration : la ligne parle de comptage de régressions, pas de poids.

**Ce qui reste une hypothèse, et doit être lu comme telle.** La règle ci-dessus
n'est épinglée par aucune valeur du cahier. Elle est retenue parce qu'elle est
la seule des deux lectures qui n'invente aucun nombre — A réutilise des poids
énoncés, l'alternative de B exigerait d'en fabriquer — et parce qu'elle est
observationnellement inerte : sous cette lecture, toutes les valeurs énoncées se
reproduisent. Si elle est fausse, cette entrée dit exactement ce qui a été
supposé et pourquoi, plutôt que de laisser croire que le cahier l'énonçait.

## Les deux autres divergences du même scellement — réglées sans arbitrage

Elles ne sont **pas** des conflits de spécification : ce sont des faits de texte
vérifiables, tranchés en exécutant.

- **DIV-1 · F-FAILURE, unité des coûts.** B inscrivait `unite: "micro-USD"` en
  l'attribuant à la ligne 121. Contrôle exécuté :
  `sed -n '121p' docs/cahier.md | grep -c 'micro-USD'` → **0**. La chaîne
  n'apparaît qu'en ligne 103 (F-MONEY). L'attribution n'est pas soutenue par sa
  source déclarée. **A avait raison** : l'unité reste non spécifiée.
- **DIV-2 · F-REGRESSION, nombre attendu.** B refusait le chiffre comme « un
  calcul du transcripteur ». La ligne 129 dit littéralement : « Une exigence
  `isolation@1` satisfaite en P3 puis violée en P4 **en produit une**. »
  C'est une transcription. **A avait raison** : la valeur est 1.

## Ce que cette entrée prouve du dispositif

Chaque transcripteur a attrapé une vraie erreur de l'autre : A a inventé une
propagation, B a inventé une unité et l'a attribuée à une ligne qui ne la
contient pas. Avec un seul transcripteur, l'une ou l'autre aurait été gelée en
silence, définitivement. C'est exactement ce pour quoi la double transcription à
cadrages opposés existe.
