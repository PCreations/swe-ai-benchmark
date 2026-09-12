// ─────────────────────────────────────────────────────────────────────────────
// @bench/storage — SQUELETTE du stockage immuable d'artefacts (tâche T13,
// cahier L265-L272).
//
// CE FICHIER NE CONTIENT AUCUNE RÈGLE MÉTIER. Il déclare les rôles que
// `acceptance/T13.spec.ts` nomme en §IV de son en-tête, et chacun lève
// `NotImplemented`. C'est l'étage ROUGE : le contrat existe, le comportement
// n'existe pas encore.
//
// POURQUOI DÉCLARER PLUTÔT QUE LAISSER ABSENT.
// Sans ces exports, les six cas de T13 tombent tous sur la MÊME assertion,
// `CONTRAT-NON-SATISFAIT` : un rouge qui ne prouve que l'absence d'un nom.
// `verification/runner/red.mjs` refuse précisément ce genre de rouge par
// défaut (« un rouge dont la cause est un module introuvable […] n'est PAS une
// preuve »). Une fois les rôles déclarés, chaque cas échoue sur un APPEL RÉEL,
// à l'endroit que le cas vérifie.
//
// POURQUOI AUCUN RÔLE NE REND DE VALEUR PLAUSIBLE.
// T13 porte trois cas de refus (A3, A4, A6) et un cas d'absence (A5).
// `verification/mutants/T13.json` le dit en toutes lettres : « pour les cas
// refusal, un stub qui lève rend le cas VERT ; pour le cas absence, une
// implémentation qui n'écrit JAMAIS rien satisfait "l'écriture interrompue
// n'est pas visible" sans rien prouver ». Ces quatre cas restent pourtant
// rouges ici, et pas par chance : chacun embarque un CONTRÔLE POSITIF qu'une
// exception ne peut pas simuler — A3 relit les octets AVANT de corrompre, A4
// relit la référence là où l'objet EST, A5 écrit un témoin SANS interruption
// dans un magasin jumeau, A6 extrait une archive BÉNIGNE. Rendre un buffer
// vide, `null` ou une liste vide verdirait au contraire ces moitiés-là à vide.
//
// `artifactSizeLimit` lève aussi, au lieu de rendre un nombre. L271 exige une
// « limite de taille déclarée » et n'en donne aucune valeur ; publier ici un
// entier choisi au hasard satisferait l'assertion d'A1 alors qu'aucune limite
// n'est appliquée nulle part. Ce serait le NOM d'une limite, pas une limite.
//
// Les noms primaires sont retenus, sans alias : la liste d'alias de la suite
// est une tolérance de NOMMAGE du côté de qui appelle, jamais une invitation à
// en inventer un ici.
// ─────────────────────────────────────────────────────────────────────────────

import { NotImplemented } from '@bench/contracts'

/** Cible de l'adaptateur LOCAL (L267) : la racine d'un répertoire existant. */
export interface ArtifactStoreTarget {
  /** Chemin absolu d'un répertoire existant. */
  root: string
}

/**
 * Le MANIFESTE DE CONTENU de L267, rendu par une écriture acceptée.
 *
 * L'empreinte est PUBLIÉE, et non seulement interne : sans cela, « empreintes
 * vérifiées avant usage » (L271) serait invérifiable de l'extérieur.
 */
export interface ArtifactManifest {
  /** La référence de contenu (L269). Le cahier n'en fixe pas le format. */
  ref: string
  /** SHA-256 hexadécimal des octets écrits (L82). */
  digest: string
  /** Taille en octets. */
  size: number
}

/**
 * Le POINT D'INJECTION NOMMÉ de L141, seule valeur admise.
 *
 * `INTERRUPT_BEFORE_PUBLISH` : les octets sont écrits, puis l'écriture est
 * interrompue AVANT la publication de l'objet final. Sans lui, « une écriture
 * interrompue » (A5) ne serait pas reproductible.
 */
export type ArtifactFault = 'INTERRUPT_BEFORE_PUBLISH'

export interface PutArtifactOptions {
  fault?: ArtifactFault
}

/** Les deux chemins ABSOLUS d'une extraction bornée (L269). */
export interface ExtractArchiveRequest {
  archive_path: string
  dest_dir: string
}

/** Ce qu'une extraction acceptée rapporte. Une extraction réussie peut ne rien rendre. */
export interface ExtractArchiveReport {
  entries: readonly string[]
}

/**
 * Ouvre l'adaptateur local sur une racine de répertoire (L267).
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function openArtifactStore(_target: unknown): unknown {
  throw new NotImplemented('storage.openArtifactStore')
}

/**
 * Écrit des octets bruts et rend le manifeste de contenu (L267).
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function putArtifact(
  _handle: unknown,
  _bytes: unknown,
  _options?: PutArtifactOptions,
): ArtifactManifest {
  throw new NotImplemented('storage.putArtifact')
}

/**
 * Relit les octets EXACTS d'une référence, ou refuse par un code nommé
 * (`ARTIFACT_CORRUPT`, `ARTIFACT_MISSING` — L269).
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function getArtifact(_handle: unknown, _ref: unknown): Uint8Array {
  throw new NotImplemented('storage.getArtifact')
}

/**
 * Rend ce que le magasin publie comme objets FINAUX (L269) : c'est ce rôle qui
 * rend la visibilité observable, donc le cas d'absence A5 vérifiable.
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function listArtifacts(_handle: unknown): readonly ArtifactManifest[] {
  throw new NotImplemented('storage.listArtifacts')
}

/**
 * Extraction bornée à la destination (L269, L271) : un nom de fichier porté par
 * une archive n'est jamais concaténé directement à un chemin du stockage.
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function extractArchive(
  _handle: unknown,
  _request: ExtractArchiveRequest,
): ExtractArchiveReport {
  throw new NotImplemented('storage.extractArchive')
}

/**
 * La LIMITE DE TAILLE DÉCLARÉE de L271. Le cahier n'en fixe pas la valeur ; ce
 * squelette n'en invente donc aucune.
 *
 * SQUELETTE — lève `NotImplemented`.
 */
export function artifactSizeLimit(): number {
  throw new NotImplemented('storage.artifactSizeLimit')
}
