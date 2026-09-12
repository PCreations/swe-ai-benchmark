// ─────────────────────────────────────────────────────────────────────────────
// LE PORT `ArtifactStore` (tâche T13, cahier L265-L272).
//
// L267 énumère trois livrables : « port `ArtifactStore`, adaptateur local et
// manifeste de contenu ». Ce fichier est le PORT — la façade que le reste du
// moteur appelle, et la seule surface que T14 devra reproduire sur un service
// objet réel (L273). L'adaptateur local vit dans src/artifact-local.ts,
// l'extraction bornée dans src/artifact-archive.ts, et le manifeste de contenu
// est la valeur que toute écriture acceptée rend.
//
// POURQUOI UN PORT SÉPARÉ DE SON ADAPTATEUR, ALORS QU'IL N'EN EXISTE QU'UN.
// L34 : « le cœur métier ne dépend ni de Temporal, ni de Docker […] les
// interfaces sont implémentées par adaptateurs. » Un appelant qui importerait
// `LocalArtifactStore` ferait entrer le système de fichiers dans sa propre
// définition ; il n'importe ici que six rôles, dont aucun ne nomme un disque.
//
// LES SIX RÔLES, ET CE QUE CHACUN DOIT AU CAHIER.
//   openArtifactStore({ root })                    adaptateur local     L267
//   putArtifact(h, octets, opts?)                  manifeste de contenu L267
//   getArtifact(h, ref)                            relecture exacte     L269
//   listArtifacts(h)                               objets FINAUX        L269
//   extractArchive(h, { archive_path, dest_dir })  extraction bornée    L269
//   artifactSizeLimit()                            limite déclarée      L271
//
// AUCUN DE CES RÔLES NE LÈVE `NotImplemented` : le squelette a disparu avec
// l'implémentation qu'il annonçait. Ce qu'ils lèvent désormais est un
// `ArtifactRefusal`, qui porte un code nommant sa cause — `ARTIFACT_CORRUPT`
// et `ARTIFACT_MISSING` sont les deux que L269 fixe littéralement.
//
// CE QUE T13 NE PRÉTEND PAS FAIRE. Rien sur un service objet réel, les
// identités limitées par préfixe ni les transferts repris : c'est T14 (L273).
// Rien sur la cohérence d'un point de reprise entre base, fichiers et files :
// c'est T15 (L281). Rien sur l'isolation du candidat : c'est T19 (L317). T13
// n'en porte que la part qui vit dans le stockage — un nom de fichier fourni
// par un candidat n'atteint jamais un chemin du stockage central (L271).
// ─────────────────────────────────────────────────────────────────────────────

import {
  ARTIFACT_SIZE_LIMIT_BYTES,
  getLocalArtifact,
  listLocalArtifacts,
  openLocalArtifactStore,
  putLocalArtifact,
} from './artifact-local.js'
import { extractArchiveInto } from './artifact-archive.js'
import type { ArtifactManifest } from './artifact-local.js'
import type { ExtractArchiveReport } from './artifact-archive.js'

export {
  ARTIFACT_DIGEST_ALGORITHM,
  ARTIFACT_SIZE_LIMIT_BYTES,
  LocalArtifactStore,
  isLocalArtifactStore,
} from './artifact-local.js'
export type {
  ArtifactFault,
  ArtifactManifest,
  ArtifactStoreTarget,
  PutArtifactOptions,
} from './artifact-local.js'
export type { ExtractArchiveReport, ExtractArchiveRequest } from './artifact-archive.js'

/**
 * Ouvre l'adaptateur local sur une racine de répertoire existante (L267).
 *
 * La cible est un objet PLAT et STRICT : `{ root }`, et rien d'autre. L80 veut
 * qu'une propriété inconnue soit rejetée, et un contrat qui accepterait
 * silencieusement une clé qu'il ignore laisserait un appelant croire qu'il a
 * configuré quelque chose.
 */
export function openArtifactStore(target: unknown): unknown {
  return openLocalArtifactStore(target)
}

/**
 * Écrit des octets bruts et rend le MANIFESTE DE CONTENU (L267).
 *
 * Le manifeste PUBLIE l'empreinte : sans elle, « empreintes vérifiées avant
 * usage » (L271) serait invérifiable depuis l'extérieur, et la vérification se
 * réduirait à une promesse interne.
 *
 * Le troisième argument porte le point d'injection nommé de L141. C'est un
 * livrable : une écriture interrompue doit être reproductible, sinon A5 se
 * réduirait à espérer une panne au bon moment.
 */
export function putArtifact(
  handle: unknown,
  bytes: unknown,
  options?: unknown,
): ArtifactManifest {
  return putLocalArtifact(handle, bytes, options)
}

/**
 * Relit les octets EXACTS d'une référence, ou refuse par un code nommé
 * (`ARTIFACT_CORRUPT`, `ARTIFACT_MISSING` — L269).
 *
 * Une lecture refusée ne rend AUCUN octet. Rendre un tampon vide serait la
 * permissivité que A4 condamne : l'appelant ne pourrait plus distinguer un
 * objet vide d'un objet absent.
 */
export function getArtifact(handle: unknown, ref: unknown): Uint8Array {
  return getLocalArtifact(handle, ref)
}

/**
 * Rend ce que le magasin publie comme objets FINAUX (L269).
 *
 * C'est ce rôle qui rend la VISIBILITÉ observable, donc « n'est pas visible
 * comme objet final » vérifiable. Une écriture restée en transit n'y figure
 * pas : elle n'a jamais franchi sa publication.
 */
export function listArtifacts(handle: unknown): readonly ArtifactManifest[] {
  return listLocalArtifacts(handle)
}

/**
 * Extraction bornée à la destination (L269, L271).
 *
 * Le magasin passé en premier argument n'est pas consulté : une extraction est
 * bornée par la destination qu'on lui donne. Le rôle vit néanmoins sur le port
 * du stockage, parce que c'est là qu'est écrite la règle de L271 sur les noms
 * de fichiers fournis par un candidat.
 */
export function extractArchive(_handle: unknown, request: unknown): ExtractArchiveReport {
  return extractArchiveInto(request)
}

/**
 * LA LIMITE DE TAILLE DÉCLARÉE de L271, en octets.
 *
 * Elle est appliquée à chaque écriture et à chaque entrée d'archive ; la
 * publier sans l'imposer en ferait le nom d'une limite, pas une limite.
 */
export function artifactSizeLimit(): number {
  return ARTIFACT_SIZE_LIMIT_BYTES
}
