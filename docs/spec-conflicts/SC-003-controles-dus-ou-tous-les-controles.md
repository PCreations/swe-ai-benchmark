# SC-003 — À la période k, contrôle-t-on les exigences dues ou toutes les exigences ?

    statut : RESOLU — option A, arbitrée par le mandant le 2026-10-16
             (« Oui », en réponse à « Tu retiens l'option A ? »)
    ouvert : 2026-10-16
    porte  : T51.A2, T51.A3, T51.A4 (ADR-009) contre T54.A2 (ADR-011)
    origine : settle du tour wf_f0051268 — `bench accept T51` refusé à
              l'identique sur 16 itérations, HEAD 29fb2db

## Les faits, mesurés

`T54` a été implémentée (`fdf9d56`) et acceptée : PASS 4/4 en clean-room.
Depuis, `T51` ne se prouve plus : `ASSERTION_FAILED`, cas `A2`, `A3`, `A4`.
Jest, sur `acceptance/T51.spec.ts`, à `29fb2db` :

- `T51.A2` — attend un statut pour chacun des cinq contrôles ; reçoit
  `vu 4 : ["reserve@1","idempotence@1","cancel@1","fifo@1"]` ;
- `T51.A3` — attend les cinq contrôles évalués et violés pour un candidat non
  déployé ; reçoit `vu 2 : ["reserve@1","idempotence@1"]` (période 1) ;
- `T51.A4` — attend des comptes sur cinq contrôles ; reçoit `vu 2+0`.

Aucun défaut d'implémentation : `T54.A2` exige exactement ce comportement.

## Les deux textes acceptés

**ADR-009, T51** (accepté le 12/10/2026) : « `A2` chaque période persistée à
candidat réel porte, pour chaque contrôle, son identifiant, son statut et les
deux termes comparés » ; « `A3` [...] dont les contrôles sont évalués et
échouent, sans qu'aucun soit omis ». La suite de T51 lit « chaque contrôle »
comme les cinq contrôles du scénario, à toute période.

**ADR-011, T54** (accepté le 15/10/2026) : « `A2` à la période k, seuls les
contrôles des exigences dues à une période inférieure ou égale à k sont
évalués et persistés ». Motif, mesuré sur le premier essai réel : la période 1
était jugée sur `cancel@1`, `fifo@1` et `isolation@1`, dus en P2 à P4 — des
règles que le candidat n'a pas encore reçues.

Les deux ne peuvent pas être vrais ensemble.

## Options

**A — L'ADR le plus récent l'emporte ; la suite de T51 est relue.** « Chaque
contrôle » et « aucun omis » s'entendent des contrôles **dus** à la période.
Le test-author de T51 adapte A2, A3 et A4 : à chaque période, chaque contrôle
dû porte identifiant, statut et termes comparés ; pour un candidat non
déployé, chaque contrôle dû est évalué et violé, aucun omis ; les comptes
portent sur les contrôles dus. Aucun cas n'est retiré ; les assertions se
déplacent du « cinq » fixe vers « l'ensemble dû », que T54.A2 fixe déjà.
*Coût* : une modification d'une suite d'acceptation prouvée, qui doit être
tracée ici et ne peut se faire que par le test-author.

**B — T51 l'emporte ; T54.A2 est retiré.** On revient à cinq contrôles à
toute période. *Coût* : retirer un cas requis — `ACCEPTANCE_WEAKENED`, que la
monotonie interdit — et réintroduire un défaut mesuré sur données réelles :
juger un candidat sur des règles qu'on ne lui a pas données.

**C — Les deux mesures coexistent.** Persister les cinq statuts, mais marquer
ceux des exigences non dues comme « non dus » et les exclure des comptes et du
rapport. *Coût* : une sémantique de plus, et une modification des deux suites.

## Recommandation

**A.** B est interdit par la monotonie et rétablit un défaut réel. C ajoute
une complexité sans usage. A est la lecture que l'ADR le plus récent rend
explicite, et la seule qui ne juge pas un candidat sur une règle future.

## Arbitrage

**Option A**, retenue par le mandant le 2026-10-16. « Chaque contrôle » et
« aucun omis » (T51.A2, T51.A3) s'entendent des contrôles **dus** à la
période, au sens de T54.A2. Le test-author de T51 adapte A2, A3 et A4 en
conséquence ; aucun cas requis n'est retiré, et chaque assertion porte sur
l'ensemble dû, que T54.A2 fixe. Ce document est la trace exigée.

## Écart constaté en appliquant l'arbitrage — dette nommée, non bloquante

Le test-author de T51 a mesuré (`e924160`) que les métadonnées du scénario et
les contrôles persistés divergent :

- `revealedRequirementsForPeriod` déclare `isolation@1` due en **P3** et
  remplace `cancel@1` par `cancel@2` en P3 — conforme au cahier
  (F-REGRESSION, L129 : `isolation@1` « satisfaite en P3 puis violée en P4 ») ;
- `candidate-control-period` ne contrôle `isolation@1` qu'en **P4**, et
  contrôle encore `cancel@1` en P3.

La suite de T51 suit les contrôles persistés (P4), cohérents avec l'énoncé de
T53 et avec la racine gelée `F-RESERVATION.json`, où les locataires
n'apparaissent qu'en P4. Effet sur le pilote : nul en pratique — en P3 aucun
autre locataire n'existe, l'isolation y est trivialement satisfaite. Mais
l'écart au cahier est réel : à aligner (une entrée dans `ECHEANCE_CONTROLE`
de la suite, et le filtre de `candidate-control-period`) par un ADR ultérieur.
