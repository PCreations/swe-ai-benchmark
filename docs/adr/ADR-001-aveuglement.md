# ADR-001 — L'aveuglement est PROCÉDURAL, pas structurel

Statut : accepté · 11/09/2026 · corrige une affirmation fausse du plan initial.

## Ce que le plan affirmait, et pourquoi c'était faux

Le plan initial soutenait qu'un worktree matérialisé « à un commit où le code
n'existe pas » était **structurel**, et « strictement plus fort que le
sparse-checkout ». C'est faux : un worktree lié partage l'*object database* du
dépôt. Se positionner sur un commit ancien ne supprime ni les objets ni les
références des commits plus récents.

## Contre-exemple reproduit ici

Dépôt jetable, commit 1 « spec seule », commit 2 ajoutant `implementation.txt`,
puis `git worktree add --detach ./wt <commit1>` :

    $ ls                                    # spec.txt
    $ [ -f implementation.txt ] && echo OUI || echo non
    non
    $ git show master:implementation.txt
    SECRET_IMPLEMENTATION                   # <- le contenu « invisible »
    $ git log --all --oneline | grep -c implementation
    1

Le fichier est absent du checkout ; son contenu reste lisible en une commande.

## Décision

1. **Étiqueter honnêtement.** Toute attestation dépendant d'un rôle aveugle
   porte `blinding: "procedural"`. Le mot `structural` est réservé au cas où
   l'object database n'est pas partagée, et n'est jamais employé par défaut.
2. **Le vrai mécanisme** est l'export vers un dépôt neuf :
   `git archive <base> -- <chemins autorisés> | tar -x -C $WS`, puis
   `git init` sans remote, puis réimport par `format-patch` + `git apply`.
   Là, les artefacts cachés sont réellement absents du système de fichiers ET
   de l'object database.
3. **Ce qui reste structurel sans cet export** : la règle des deux clés. Elle
   porte sur ce qu'un commit *écrit*, pas sur ce qu'un agent *lit* — elle est
   donc inattaquable par `git show`, et c'est elle qui porte l'anti-biais
   coder-reviewer.

## Limite assumée

Un prompt de rôle, un nonce de spawn et un audit ne rendent pas toute lecture
indue détectable. Tant que l'export n'est pas implémenté, la séparation des
rôles est une discipline auditable au diff, pas une barrière technique.
