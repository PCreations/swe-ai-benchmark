// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — T76, ADR-021 décision 5 : les BRAS d'un pilote, déclarés
// dans le manifeste `bench.pilot.manifest/1` par un champ ADDITIF :
//
//   arms: [ { arm: "A", configuration: "<id de configurations>", label?,
//             method_instruction: string | null } , ... ]
//
// Chaque bras est UNE configuration du manifeste ; `repetitions` donne le
// nombre de trajectoires par bras. `method_instruction` est le texte EXACT
// ajouté au prompt de chaque période du bras (`null` : aucune consigne). La
// seule différence entre les prompts de deux bras à une même période est donc
// cette consigne, séparée du prompt commun par une ligne vide.
// ─────────────────────────────────────────────────────────────────────────────

export interface PilotArm {
  readonly arm: string
  readonly configuration: string
  readonly label: string | null
  readonly method_instruction: string | null
}

/** Séparateur entre le prompt commun et la consigne de méthode (blancs seulement). */
export const METHOD_INSTRUCTION_SEPARATOR = '\n\n'

/**
 * Lit et valide `arms` : absent, aucun bras (`[]`). Sinon chaque entrée nomme
 * un bras distinct, une configuration DÉCLARÉE et distincte, et une consigne
 * texte ou `null`. Toute autre forme est refusée (avant tout appel).
 */
export function parsePilotArms(raw: unknown, configurations: readonly string[]): PilotArm[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new Error('bench pilot-conduct refusé : `arms` doit être une liste')
  const arms: PilotArm[] = []
  for (const [i, entry] of raw.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`bench pilot-conduct refusé : arms[${String(i)}] n'est pas un objet`)
    }
    const e = entry as Record<string, unknown>
    const arm = e['arm']
    const configuration = e['configuration']
    const label = e['label']
    const instruction = e['method_instruction']
    if (typeof arm !== 'string' || arm.trim() === '') throw new Error(`bench pilot-conduct refusé : arms[${String(i)}].arm absent`)
    if (typeof configuration !== 'string' || !configurations.includes(configuration)) {
      throw new Error(`bench pilot-conduct refusé : arms[${String(i)}].configuration=${JSON.stringify(configuration)} absente de configurations`)
    }
    if (instruction !== null && instruction !== undefined && typeof instruction !== 'string') {
      throw new Error(`bench pilot-conduct refusé : arms[${String(i)}].method_instruction doit être un texte ou null`)
    }
    if (label !== undefined && label !== null && typeof label !== 'string') {
      throw new Error(`bench pilot-conduct refusé : arms[${String(i)}].label doit être un texte`)
    }
    if (arms.some((a) => a.arm === arm)) throw new Error(`bench pilot-conduct refusé : bras ${JSON.stringify(arm)} déclaré deux fois`)
    if (arms.some((a) => a.configuration === configuration)) {
      throw new Error(`bench pilot-conduct refusé : configuration ${JSON.stringify(configuration)} affectée à deux bras`)
    }
    arms.push({
      arm,
      configuration,
      label: typeof label === 'string' ? label : null,
      method_instruction: typeof instruction === 'string' && instruction.trim() !== '' ? instruction : null,
    })
  }
  return arms
}

export function armOfConfiguration(arms: readonly PilotArm[], configurationId: string): PilotArm | null {
  return arms.find((a) => a.configuration === configurationId) ?? null
}

/** Le prompt d'un bras : le prompt commun, puis, s'il y en a une, la consigne de méthode mot pour mot. */
export function withMethodInstruction(prompt: string, instruction: string | null | undefined): string {
  if (instruction === null || instruction === undefined || instruction.trim() === '') return prompt
  return `${prompt}${METHOD_INSTRUCTION_SEPARATOR}${instruction}`
}

/**
 * Le couple (référence, traitement) du rapport de coût : le bras `A` et le
 * bras `B` s'ils sont déclarés, sinon les deux premiers bras ; `null` s'il y a
 * moins de deux bras.
 */
export function comparedArms(arms: readonly PilotArm[]): { readonly reference: PilotArm; readonly treatment: PilotArm } | null {
  if (arms.length < 2) return null
  const a = arms.find((x) => x.arm === 'A')
  const b = arms.find((x) => x.arm === 'B')
  if (a !== undefined && b !== undefined) return { reference: a, treatment: b }
  return { reference: arms[0] as PilotArm, treatment: arms[1] as PilotArm }
}
