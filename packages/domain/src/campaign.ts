// ─────────────────────────────────────────────────────────────────────────────
// Planificateur PUR de cellules de campagne (T03, livrable 3 de L179).
//
// CE QUE COMPILER UN MANIFESTE VEUT DIRE.
// L179 nomme trois livrables — schémas, validation structurée, planificateur pur
// — et L181 les observe par un seul geste : valider, puis déplier. Une cellule
// est une TRAJECTOIRE au sens de L78, c'est-à-dire le sextuplet
// `campaign_id / parent_project_id / scenario_id / configuration_id /
// repetition_id / budget_id`. Le plan est le produit cartésien de ces axes, et
// rien d'autre : « ajouter des cellules ne nécessite pas un appel LLM » (L183)
// parce qu'ajouter une cellule, c'est ajouter une ligne à un produit.
//
// POURQUOI « PUR » N'EST PAS UN ADJECTIF DÉCORATIF.
//   • Aucune entrée hors du manifeste : pas d'horloge, pas d'aléa, pas
//     d'environnement. Deux appels sur le même manifeste rendent le même plan
//     (T03.A1) — et §D-8 fige graines et budgets avant la mesure, ce qu'une
//     compilation dépendant de l'heure rendrait faux.
//   • Aucune option d'EXÉCUTION ne peut entrer dans le plan. `workers` dit
//     comment on exécutera, jamais QUOI : le nombre de workers ne change pas une
//     identité (T03.A2). Ici, la garantie est structurelle — la fonction ne LIT
//     pas ses options. On ne peut pas oublier de ne pas les lire.
//   • Aucune ressource lourde : ce paquet compile sous `types: []`, donc
//     `node:worker_threads` et `node:child_process` lui sont inaccessibles.
//     « Aucune création de worker pendant une compilation de manifeste » (L183)
//     est une impossibilité de typage, pas une intention.
//
// LE PIÈGE QUE CE FICHIER DOIT ÉVITER : LE PLAN CONSTANT.
// Un planificateur rendant toujours six cellules `synthetic` satisferait
// littéralement « six identités » et « reste synthétique ». Les axes sont donc
// TOUS lus du manifeste soumis, et la provenance est lue sur LE SCÉNARIO — pas
// sur le corpus, pas sur une valeur par défaut. C'est ce que L181 A5 exige :
// l'étiquette suit la source du scénario.
// ─────────────────────────────────────────────────────────────────────────────
import type { CampaignManifest, CorpusProvenance } from '@bench/contracts'
import { validateCampaignManifest } from './manifest-validation.js'

/**
 * Options d'EXÉCUTION d'une compilation.
 *
 * Elles ne sont jamais un facteur scientifique : §G distingue le namespace
 * technique d'une suite (`test_run_id`, ressources, parallélisme) de
 * l'assignation scientifique, « qu'il ne modifie pas ». `workers`,
 * `worker_count` et `concurrency` sont de la première espèce.
 *
 * Le type est accepté et DÉLIBÉRÉMENT non lu : voir `compileCampaignManifest`.
 */
export interface CompileOptions {
  readonly [option: string]: unknown
}

/**
 * Une cellule planifiée : une trajectoire du §E, avant toute exécution.
 *
 * Les six composantes sont à PLAT. Une identité est ce par quoi deux
 * trajectoires se distinguent ; la nicher sous un sous-objet ajouterait un
 * niveau que ni L78 ni les comparaisons canoniques de §G ne demandent.
 *
 * `corpus_provenance` et `execution_mode` accompagnent l'identité parce que L24
 * l'impose : « les résultats portent toujours `execution_mode`, `cost_origin` et
 * `corpus_provenance` ». `cost_origin` manque ici, et c'est volontaire : il naît
 * d'une dépense observée (T16/T17), pas d'un plan. L'inventer maintenant
 * remplirait un champ du §E avec une valeur que rien n'a mesurée.
 */
export interface CampaignCell {
  readonly campaign_id: string
  readonly parent_project_id: string
  readonly scenario_id: string
  readonly configuration_id: string
  readonly repetition_id: string
  readonly budget_id: string
  readonly corpus_provenance: CorpusProvenance
  readonly execution_mode: CampaignManifest['execution_mode']
}

/** Le plan compilé : les cellules, et de quoi les rattacher à leur manifeste. */
export interface CampaignPlan {
  readonly schema: 'bench.campaign_plan/1'
  readonly campaign_id: string
  readonly cell_count: number
  readonly cells: readonly CampaignCell[]
}

/**
 * §D-11 : « les répétitions et variantes ne sont pas de nouveaux projets
 * indépendants ». L'identifiant d'une répétition ne porte donc AUCUNE autre
 * composante : le composer avec la configuration ferait de chaque répétition une
 * branche distincte, et six cellules deviendraient six projets — exactement la
 * confusion que l'invariant interdit.
 */
const repetitionId = (rang: number): string => `REP-${String(rang)}`

/**
 * Compile un manifeste de campagne en cellules d'exécution.
 *
 * Valide d'abord — forme stricte, identités uniques, empreinte du corpus — puis
 * déplie le produit cartésien. Un refus LÈVE une `ManifestRejection` et ne
 * produit aucune cellule : « empreinte vérifiée avant toute exécution et
 * mismatch refusé » (L181) n'est tenu que si le refus précède la production.
 *
 * `_options` N'EST PAS LU, ET C'EST LE CONTRAT. Le paramètre existe pour que la
 * signature accepte les options d'exécution que l'appelant transporte
 * (`workers`, `worker_count`, `concurrency`) ; les ignorer en bloc est la forme
 * la plus forte de « changer le nombre de workers ne change pas ces identités »
 * (L181 A2). Une implémentation qui les lirait « sans les utiliser » devrait
 * prouver à chaque évolution qu'elle ne les utilise toujours pas.
 */
export function compileCampaignManifest(
  manifest: unknown,
  _options?: CompileOptions,
): CampaignPlan {
  const m = validateCampaignManifest(manifest)

  const cells: CampaignCell[] = []

  // L'ordre d'itération est celui de L78, de la composante la plus englobante à
  // la plus fine. Il rend le plan reproductible sans avoir à le trier.
  for (const projet of m.projects) {
    for (const scenario of projet.scenarios) {
      for (const configuration of m.configurations) {
        for (let rang = 1; rang <= m.repetitions; rang += 1) {
          for (const budget of m.budgets) {
            cells.push(
              Object.freeze({
                campaign_id: m.campaign_id,
                parent_project_id: projet.parent_project_id,
                scenario_id: scenario.scenario_id,
                configuration_id: configuration.configuration_id,
                repetition_id: repetitionId(rang),
                budget_id: budget.budget_id,
                // L'étiquette suit LE SCÉNARIO. Pas `m.corpus.corpus_provenance`
                // : un manifeste peut mêler des scénarios de provenances
                // différentes, et chaque cellule doit porter celle de sa source.
                corpus_provenance: scenario.corpus_provenance,
                execution_mode: m.execution_mode,
              }),
            )
          }
        }
      }
    }
  }

  return Object.freeze({
    schema: 'bench.campaign_plan/1' as const,
    campaign_id: m.campaign_id,
    cell_count: cells.length,
    cells: Object.freeze(cells),
  })
}
