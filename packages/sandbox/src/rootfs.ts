// ─────────────────────────────────────────────────────────────────────────────
// Squelette de système de fichiers du conteneur candidat (L321).
//
// CE QUI EST MONTÉ, ET CE QUI NE L'EST JAMAIS. Le candidat reçoit une vue
// MINIMALE : `/usr`, `/etc` (lecture seule, pour les interpréteurs et
// bibliothèques partagées de l'hôte — `python3` en particulier, requis par la
// suite §I), quelques périphériques nommés un par un, et `workspaceDir` en
// lecture-écriture sous `/workspace`. `controlRepoRoot` et
// `privateSentinelPath` (entrées de `buildSandboxProfile`) NE SONT JAMAIS
// montés nulle part — ce n'est pas une exclusion explicite, c'est une
// conséquence de la liste blanche : seuls les chemins listés ci-dessous
// existent dans la vue du candidat (L321 : « pas de montage du dépôt de
// contrôle »).
//
// POURQUOI DES PÉRIPHÉRIQUES UN PAR UN (bind mount) PLUTÔT QUE `/dev` ENTIER.
// Lier `/dev` entier exposerait les nœuds de périphériques bloc/caractère
// réels de l'hôte (disques compris) à un candidat qui tourne comme root réel
// du noyau (limite connue, documentée dans le message du commit IMPL de
// T19 : ce paquet ne crée pas de user namespace séparé pour le candidat,
// cf. runtime.ts) : la seule mitigation bon marché est de ne JAMAIS faire
// apparaître ces chemins dans la vue du candidat, plutôt que de compter sur
// un filtre.
// ─────────────────────────────────────────────────────────────────────────────
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'

const DEVICES = ['null', 'zero', 'full', 'random', 'urandom', 'tty'] as const

export function buildRootfsSkeleton(rootfs: string): void {
  for (const d of ['usr', 'etc', 'proc', 'sys', 'dev', 'workspace', 'tmp']) {
    mkdirSync(`${rootfs}/${d}`, { recursive: true })
  }
  for (const [link, target] of [
    ['bin', 'usr/bin'],
    ['sbin', 'usr/sbin'],
    ['lib', 'usr/lib'],
    ['lib64', 'usr/lib64'],
  ] as const) {
    try {
      symlinkSync(target, `${rootfs}/${link}`)
    } catch {
      /* déjà présent (relance sur un répertoire recyclé) */
    }
  }
}

/** Script exécuté APRÈS `chroot`, comme PID 1 de son propre espace de noms —
 * seul un processus dans ce contexte peut monter un `/proc` qui reflète CET
 * espace de noms (cf. runtime.ts). */
export function writeInitScript(rootfs: string): void {
  const initSh = [
    '#!/bin/sh',
    'mount -t proc proc /proc 2>/dev/null',
    'cd /workspace',
    `exec sh -c 'while true; do sleep 3600; done'`,
    '',
  ].join('\n')
  writeFileSync(`${rootfs}/init.sh`, initSh)
  chmodSync(`${rootfs}/init.sh`, 0o755)
}

/** Script de préparation du système de fichiers — exécuté DANS le nouveau
 * mount namespace (déjà en place au moment où ce script démarre, cf.
 * runtime.ts), donc ses montages ne fuient jamais vers l'hôte ni vers un
 * autre sandbox. Se termine par `exec unshare --pid --fork` : c'est l'ÉTAPE
 * SÉPARÉE qui crée l'espace de noms PID (cf. runtime.ts pour pourquoi elle
 * n'est pas combinée avec le mount namespace dans le même appel `unshare`). */
export function writeMountSetupScript(dir: string, rootfs: string, workspaceDir: string): string {
  const lines: string[] = ['#!/bin/sh', 'set -e']
  lines.push(`mount --bind /usr ${rootfs}/usr`)
  lines.push(`mount -o remount,bind,ro /usr ${rootfs}/usr`)
  lines.push(`mount --bind /etc ${rootfs}/etc`)
  lines.push(`mount -o remount,bind,ro /etc ${rootfs}/etc`)
  lines.push(`mount -t tmpfs -o size=1048576,nosuid,mode=755 tmpfs ${rootfs}/dev`)
  for (const d of DEVICES) {
    lines.push(`touch ${rootfs}/dev/${d}`)
    lines.push(`mount --bind /dev/${d} ${rootfs}/dev/${d}`)
  }
  lines.push(`mount --bind ${workspaceDir} ${rootfs}/workspace`)
  lines.push(`mount -t tmpfs -o size=67108864,nosuid,nodev,mode=1777 tmpfs ${rootfs}/tmp`)
  lines.push(`exec unshare --pid --fork -- chroot ${rootfs} /init.sh`)
  const path = `${dir}/mountsetup.sh`
  writeFileSync(path, `${lines.join('\n')}\n`)
  chmodSync(path, 0o755)
  return path
}
