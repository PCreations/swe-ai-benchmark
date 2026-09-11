# ADR-003 — Garage plutôt que MinIO

Statut : accepté · 11/09/2026.

MinIO est sous AGPL-3.0 ; Garage sous Apache-2.0. À contrat égal — binaire
statique unique, sans démon Docker, politiques d'identité par préfixe qu'exige
`T14.A4` — la licence permissive est retenue.

Épinglé : Garage v2.1.0, `x86_64-unknown-linux-musl`. Aucune somme de contrôle
n'est publiée à l'URL de téléchargement (404 sur `.sha256` et `.sha256sum`,
vérifié le 11/09/2026) : l'épinglage est donc du *Trust On First Use*, ce que
`docs/toolchain.json` nomme explicitement plutôt que d'afficher un faux
digest éditeur.

MinIO reste une alternative équivalente si le besoin change.
