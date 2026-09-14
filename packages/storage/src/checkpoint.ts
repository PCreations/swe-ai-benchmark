// ─────────────────────────────────────────────────────────────────────────────
// SQUELETTE — checkpoints coherents (cahier L281-L290, tache T15).
//
// Etage ROUGE : aucune regle metier n'est ecrite ici. Ni fermeture des
// entrees d'ecriture, ni drainage des operations en vol, ni capture des
// composants (base, fichiers, files, code, memoire), ni verification des
// artefacts, ni publication transactionnelle du manifeste, ni restauration.
// Les six roles ci-dessous LEVENT `NotImplemented` (@bench/contracts), dont
// le message porte le prefixe `NOT_IMPLEMENTED` que
// `verification/runner/red.mjs` sait lire.
//
// CE QUE CE FICHIER AJOUTE, ET SUR QUOI IL S'APPUIE.
// T15 depend de T09 (workload/horloge), T12 (schema central PostgreSQL,
// `packages/storage/src/store.ts`), T13 (port ArtifactStore local,
// `packages/storage/src/artifacts.ts`) et T14 (adaptateur S3 du meme port).
// Ce squelette ne redeclare aucun de ces roles deja publies : il ajoute les
// SIX roles que `acceptance/T15.spec.ts` nomme en §IV de son en-tete, fixes
// par la suite elle-meme puisque le cahier ne dicte pas de noms d'exports —
// sans alias : la liste d'alias que la suite tolere est une tolerance de
// NOMMAGE cote appelant, jamais une invitation a en inventer un ici.
//
//   openCheckpointCoordinator({ admin_dsn, app_database, artifact_store })
//       ouvre un coordinateur sur une base applicative et un magasin
//       d'artefacts donnes. N'ETABLIT PAS de connexion a l'ouverture (meme
//       convention que `openStore`, T12) : le premier appel reel dira si la
//       base et le magasin repondent.
//   applyOperation(handle, { operation_sequence, fact })
//       applique une operation metier numerotee (L61 D.6 : la sequence est
//       l'identite d'ordonnancement, pas une repetition scientifique).
//   beginCheckpoint(handle, { after_operation })
//       ferme la barriere d'ecriture APRES l'operation nommee, draine les
//       operations en vol, et rend un jeton que `finishCheckpoint` doit
//       recevoir. Aucune ecriture applicative posterieure a l'ouverture de la
//       barriere ne doit etre visible dans le checkpoint qui en resultera
//       (L285, verifie par T15.A7).
//   finishCheckpoint(handle, token, { components })
//       capture les composants nommes, verifie les artefacts qu'elle
//       reference, publie le manifeste par transaction, et ROUVRE la
//       barriere. Un objet d'artefact manquant ou corrompu doit etre refuse
//       (`CHECKPOINT_INCOMPLETE`, L287) plutot que publie a moitie (L285 :
//       « le stockage publie un pointeur ; il ne donne pas une transaction
//       distribuee magique entre objets et PostgreSQL »).
//   listCheckpoints(handle)
//       relit les checkpoints COMPLETS et publies ; un checkpoint jamais
//       fini (barriere fermee puis abandonnee) n'y figure pas (L287, T15.A2).
//   restoreCheckpoint(handle, { checkpoint_id })
//       restaure un checkpoint identifie sur l'ENVIRONNEMENT VIERGE que
//       `handle` designe (L289) : base fraiche, meme magasin d'artefacts.
//       Ne restaure JAMAIS le registre central des couts (invariant D.4,
//       L66, T15.A6) : ce registre n'est pas un composant capturable par ce
//       role.
//
// CE QUE CE SQUELETTE NE PRETEND PAS FAIRE. Aucun de ces six roles ne rend
// de valeur plausible : chacun leve immediatement. Les cas de refus (A3, A4)
// et d'absence (A2, A6, A7) de T15 restent ROUGES malgre tout — pas par
// hasard, mais parce que `verification/mutants/T15.json` documente pour
// chacun un CONTROLE POSITIF qu'une exception ne peut pas simuler : A2 exige
// qu'un checkpoint interrompu soit ABSENT de `listCheckpoints`, ce qu'un
// stub qui leve avant meme d'ecrire quoi que ce soit ne peut pas distinguer
// d'une implementation qui n'ecrirait jamais rien ; A6 et A7 relisent un
// TEMOIN INDEPENDANT (le registre central, la barriere) que ce fichier ne
// touche pas encore.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Cible d'ouverture d'un coordinateur de checkpoint (L283, L289). */
export interface CheckpointCoordinatorTarget {
  /** DSN admin PostgreSQL, utilise pour creer/recreer la base applicative. */
  readonly admin_dsn: string
  /** Nom de la base applicative que ce coordinateur pilote. */
  readonly app_database: string
  /** Magasin d'artefacts (T13 local ou T14 S3) ou vivent les composants. */
  readonly artifact_store: unknown
}

/** Une operation metier numerotee, appliquee via {@link applyOperation}. */
export interface CheckpointOperation {
  readonly operation_sequence: number
  readonly fact: Record<string, unknown>
}

/** Fenetre de capture ouverte par {@link beginCheckpoint}. */
export interface BeginCheckpointRequest {
  readonly after_operation: number
}

/** Composants nommes que {@link finishCheckpoint} doit capturer (L283). */
export interface FinishCheckpointRequest {
  readonly components: Record<string, unknown>
}

/** Identite d'un checkpoint restaurable (L287). */
export interface RestoreCheckpointRequest {
  readonly checkpoint_id: string
}

/**
 * Ouvre un coordinateur de checkpoint sur une base applicative et un magasin
 * d'artefacts donnes (L283, L289).
 */
export function openCheckpointCoordinator(target: unknown): unknown {
  void target
  throw new NotImplemented('storage.openCheckpointCoordinator')
}

/** Applique une operation metier numerotee (L61 D.6). */
export function applyOperation(handle: unknown, operation: unknown): unknown {
  void handle
  void operation
  throw new NotImplemented('storage.applyOperation')
}

/** Ferme la barriere d'ecriture apres l'operation nommee (L285). */
export function beginCheckpoint(handle: unknown, request: unknown): unknown {
  void handle
  void request
  throw new NotImplemented('storage.beginCheckpoint')
}

/** Capture, verifie et publie le checkpoint par transaction (L285, L287). */
export function finishCheckpoint(handle: unknown, token: unknown, request: unknown): unknown {
  void handle
  void token
  void request
  throw new NotImplemented('storage.finishCheckpoint')
}

/** Relit les checkpoints COMPLETS et publies (L287). */
export function listCheckpoints(handle: unknown): unknown {
  void handle
  throw new NotImplemented('storage.listCheckpoints')
}

/** Restaure un checkpoint sur l'environnement vierge de `handle` (L289). */
export function restoreCheckpoint(handle: unknown, request: unknown): unknown {
  void handle
  void request
  throw new NotImplemented('storage.restoreCheckpoint')
}
