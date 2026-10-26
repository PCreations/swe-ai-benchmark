// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T73, ADR-021 décision 4 : une période F-PLATFORM sur le
// chemin `bench run-period --provider claude-cli --scenario-id F-PLATFORM`
// (et donc `bench pilot-conduct`, qui l'appelle).
//
//   DOCUMENTS     à l'entrée de chaque période, le moteur réécrit dans le dépôt
//                 du candidat les trois fichiers courants que rend
//                 `renderPlatformPeriodDocs` (@bench/scenario) : docs/spec.md,
//                 docs/api.md et docs/tickets/Pnn.md. RIEN D'AUTRE n'est
//                 touché : ni le reste de docs/, ni les tickets des périodes
//                 précédentes (de l'historique, conservé tel que le candidat
//                 l'a laissé), ni le code, les tests ou les notes du candidat.
//   PROMPT        court, comme un ticket assigné : il renvoie aux trois
//                 fichiers et ne recopie le texte d'aucune clause.
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  F_PLATFORM_PERIOD_COUNT,
  PLATFORM_API_PATH,
  PLATFORM_SPEC_PATH,
  platformTicketPath,
  renderPlatformPeriodDocs,
} from '@bench/scenario'

/** Identifiant du scénario (convention de `F-LONG`). */
export const F_PLATFORM_SCENARIO_ID = 'F-PLATFORM'

export { F_PLATFORM_PERIOD_COUNT }

function verifierPeriode(periodIndex: number): void {
  if (!Number.isInteger(periodIndex) || periodIndex < 1 || periodIndex > F_PLATFORM_PERIOD_COUNT) {
    throw new Error(`F-PLATFORM : periode ${String(periodIndex)} hors de P1..P${String(F_PLATFORM_PERIOD_COUNT)}`)
  }
}

/**
 * Le prompt d'une session F-PLATFORM : le ticket assigné et les deux documents
 * de référence, par leur chemin dans le dépôt. Aucune règle n'y est recopiée.
 */
export function buildFPlatformPilotPrompt(periodIndex: number): string {
  verifierPeriode(periodIndex)
  const key = `P${String(periodIndex).padStart(2, '0')}`
  const ticket = platformTicketPath(periodIndex)
  return [
    `Scenario F-PLATFORM, periode ${key} sur ${String(F_PLATFORM_PERIOD_COUNT)}. Ce depot est celui d'une plateforme de reservation que tu fais evoluer ticket apres ticket ; le ticket ${key} t'est assigne.`,
    [
      `- ${ticket} : le ticket de la periode (ce qui est ajoute, remplace ou retire, et les criteres d'acceptation, avec des exemples) ;`,
      `- ${PLATFORM_SPEC_PATH} : la specification consolidee, a jour pour cette periode ;`,
      `- ${PLATFORM_API_PATH} : le contrat d'interface en vigueur (operations, reponses, valeurs exactes, codes d'erreur, exemples).`,
    ].join('\n'),
    `Lis le ticket, puis la specification et le contrat, et fais evoluer le code pour que l'application respecte toutes les regles en vigueur a cette periode, pas seulement les nouvelles.`,
    `Ces trois fichiers sont reecrits par le moteur au debut de chaque periode. Tout le reste du depot t'appartient et est conserve d'une periode a l'autre : ton code, tes tests, tes notes et les tickets des periodes precedentes.`,
  ].join('\n\n')
}

/**
 * Écrit les trois documents courants de la période dans l'espace du candidat,
 * en remplaçant ceux qui s'y trouvent ; ne touche à aucun autre fichier.
 * Rend les chemins relatifs écrits.
 */
export function materializeFPlatformPeriodDocs(workspaceDir: string, periodIndex: number): readonly string[] {
  verifierPeriode(periodIndex)
  const docs = renderPlatformPeriodDocs(periodIndex)
  const ecrits: string[] = []
  for (const [rel, contenu] of Object.entries(docs)) {
    const cible = path.join(workspaceDir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(cible), { recursive: true })
    // Un candidat a pu remplacer le fichier par un répertoire ou un lien : on
    // reprend l'emplacement, et lui seul.
    try {
      const st = fs.lstatSync(cible)
      if (!st.isFile()) fs.rmSync(cible, { recursive: true, force: true })
    } catch {
      /* absent */
    }
    fs.writeFileSync(cible, contenu, 'utf8')
    ecrits.push(rel)
  }
  return ecrits
}
