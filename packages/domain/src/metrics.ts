// ─────────────────────────────────────────────────────────────────────────────
// Métriques de période et leurs dénominateurs (T04, L185–L194).
//
// CE QUE CE FICHIER CALCULE, ET D'OÙ CHAQUE RÈGLE VIENT.
//
//   Q   moyenne PONDÉRÉE des exigences ACTIVES DUES de la période. Une exigence
//       est active si elle figure dans `requirements`, due si son échéance est
//       atteinte (`due_at_period <= period_index`) — les deux conditions
//       ensemble sont ce que L189 appelle « active due ». Le poids entre au
//       dénominateur ; la satisfaction décide seule du numérateur. Le CARDINAL
//       des assertions n'est jamais lu : L129 « compter par id/version active,
//       pas par nombre d'assertions », invariant D.10 (L72).
//       `null` « si aucun poids d'exigence active due » (L111) — dénominateur
//       vide, donc absence de mesure et non mesure nulle.
//   R   `intents_succeeded / intents_offered`. `null` « lorsqu'aucune intention
//       admissible n'est proposée » ; 0 — jamais `null` — pour une trajectoire
//       indisponible face à des intentions prévues (L111). Les deux moitiés
//       sortent de la MÊME expression : le seul discriminant est le
//       DÉNOMINATEUR, jamais le numérateur.
//   V   moyenne TEMPORELLE de Q sur les périodes où Q est défini (L107).
//   U   moyenne TEMPORELLE de R sur les seules périodes EXPOSÉES (L111).
//   exposition   part de la série que couvre U — publiée à part, « avec
//       l'exposition publiée » (L111).
//   réussite agrégée par intention   QUOTIENT DES SOMMES, et non moyenne des
//       taux : (4+2+0+1)/(4+4+0+2) = 7/10 quand U vaut 2/3 (L107). « Ces trois
//       derniers nombres sont différents et doivent rester identifiés » : ils
//       portent ici trois noms distincts et trois calculs distincts.
//   G / G_new   régressions ouvertes et nouvelles (L189, L129) — voir plus bas.
//
// POURQUOI « MOYENNE TEMPORELLE » EST PONDÉRÉE PAR LA DURÉE.
// L107 prend soin d'écrire « quatre périodes DE MÊME DURÉE » avant d'annoncer
// V=13/16 : la mention ne servirait à rien si la moyenne ignorait la durée.
// V, U et l'exposition sont donc pondérés par `duration`, ce qui redonne
// exactement la moyenne arithmétique quand les durées sont égales — le cas de
// toutes les fixtures du §F. La réussite agrégée, elle, n'est PAS temporelle :
// c'est un quotient de cardinaux d'intentions, et le pondérer trahirait L107.
//
// LA RÈGLE DE RÉGRESSION, MOT POUR MOT (L189).
// « G compte les régressions actuellement ouvertes, c'est-à-dire les exigences
// actives dues, autrefois satisfaites et actuellement violées. `G_new` compte
// celles qui étaient satisfaites à la période précédente comparable et
// deviennent violées. Une régression persistante contribue à G, sans redevenir
// nouvelle à chaque période. »
//
// Trois conditions, trois états portés par la boucle :
//   • ACTIVE DUE      — le filtre d'échéance, le même que celui de Q ;
//   • AUTREFOIS SATISFAITE — `jadisSatisfaites`, alimenté par les périodes
//     STRICTEMENT antérieures ; une exigence cassée dès son entrée n'a jamais
//     été satisfaite et n'est donc pas une régression ;
//   • ACTUELLEMENT VIOLÉE — état COURANT : une exigence réparée sort de G, ce
//     qui interdit à G de devenir cumulatif.
// `G_new` ajoute la seule condition « satisfaite à la période précédente »,
// donc une régression qui traverse deux périodes est ouverte aux deux et
// nouvelle à la première seulement ; réparée puis rouverte, elle redevient
// nouvelle, parce qu'elle était bien satisfaite à la période précédente.
//
// CE QUE LE RETRAIT D'UNE EXIGENCE NE FAIT PAS. L129 : « le retrait de
// `cancel@1` ne produit pas de régression ». Aucune ligne ci-dessous ne lit
// `retired` pour décider d'une régression : une exigence retirée n'est plus
// ACTIVE, donc elle sort de G par la première condition de L189, qu'elle ait
// été remplacée ou simplement retirée. `retired` ne sert qu'à PUBLIER les
// « exigences remplacées » que L187 nomme parmi les livrables.
//
// AUCUNE NOTE LLM N'INTERVIENT (L193). La propriété est structurelle et non
// déclarative : ce paquet compile sous `types: []` et n'importe que
// `@bench/contracts` — aucun client de modèle, aucun `node:*`, aucune horloge
// ne peut s'y glisser sans faire échouer la compilation. Le calcul est une
// fonction PURE de sa série (L187) : même entrée, mêmes octets de sortie.
// ─────────────────────────────────────────────────────────────────────────────
import { ContractViolation } from '@bench/contracts'

/**
 * Une exigence ACTIVE à une période, telle qu'elle entre dans la mesure.
 *
 * `satisfied` est l'issue d'évaluation de la période : c'est une ENTRÉE de la
 * fonction pure (L187), jamais quelque chose que ce module décide.
 *
 * `assertions` est porté parce que le contrat Requirement (L88) le porte — et
 * parce que son cardinal ne doit RIEN changer au poids d'une exigence (L72,
 * L129). Le champ existe donc pour que l'invariance soit observable, pas pour
 * être lu par le calcul de Q : aucune ligne de ce fichier ne le consulte.
 */
export interface MetricRequirement {
  readonly id: string
  readonly version: number
  readonly capability_id: string
  readonly weight: number
  readonly revealed_at_period: number
  readonly due_at_period: number
  readonly criticality: string
  readonly source: string
  readonly satisfied: boolean
  readonly assertions: readonly string[]
}

/**
 * Une exigence RETIRÉE à une période, avec son « remplacement éventuel » (L88).
 *
 * `replaced_by` nul signifie un simple retrait. La distinction n'est pas
 * décorative : elle est PUBLIÉE en `replaced`, livrable « exigences
 * remplacées » de L187.
 */
export interface RetiredRequirement {
  readonly id: string
  readonly version: number
  readonly replaced_by: { readonly id: string; readonly version: number } | null
}

/** Une période de la série mesurée (L78, L107, L109). */
export interface MetricPeriod {
  readonly period_index: number
  readonly duration: number
  readonly requirements: readonly MetricRequirement[]
  readonly retired: readonly RetiredRequirement[]
  readonly intents_offered: number
  readonly intents_succeeded: number
}

/** La série soumise : forme nommée, ou tableau nu. */
export type MetricSeriesInput = { readonly periods: readonly MetricPeriod[] } | readonly MetricPeriod[]

/**
 * Options d'EXÉCUTION d'une mesure. Comme pour `compileCampaignManifest`, elles
 * ne sont jamais un facteur scientifique et le calcul ne les lit pas.
 */
export interface MetricOptions {
  readonly [option: string]: unknown
}

/** Les grandeurs d'une période. `null` porte les conventions de L111. */
export interface PeriodMetrics {
  readonly period_index: number
  readonly Q: number | null
  readonly R: number | null
  readonly G: number
  readonly G_new: number
  /** Les identités `id@version` des régressions OUVERTES (L189). */
  readonly regressions: readonly string[]
  /** Les identités `id@version` des régressions NOUVELLES (L189). */
  readonly new_regressions: readonly string[]
  /** Les exigences actives dues NON satisfaites — le backlog de L187. */
  readonly backlog: readonly string[]
  /** Les retraits par remplacement, `ancienne->nouvelle` (L88, L187). */
  readonly replaced: readonly string[]
}

/** Les agrégats de campagne (L107, L111). */
export interface CampaignAggregates {
  readonly V: number | null
  readonly U: number | null
  readonly exposure: number
  readonly intent_success_rate: number | null
}

/** La mesure complète d'une série. */
export interface SeriesMetrics {
  readonly periods: readonly PeriodMetrics[]
  readonly aggregates: CampaignAggregates
}

/** L'identité de comptage d'une exigence : `id@version` (L109, L129). */
const cle = (id: string, version: number): string => `${id}@${String(version)}`

/** Les deux formes d'entrée acceptées, ramenées à la série. */
function periodesDe(series: MetricSeriesInput): readonly MetricPeriod[] {
  if (Array.isArray(series)) return series as readonly MetricPeriod[]
  const nommee = series as { readonly periods?: readonly MetricPeriod[] }
  if (Array.isArray(nommee.periods)) return nommee.periods
  throw new ContractViolation('TYPE_MISMATCH', 'series', 'attendu { periods: [...] } ou un tableau de périodes')
}

/** L80 : « nombres non finis interdits ». Sans exception, et avant tout calcul. */
function fini(v: number, chemin: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ContractViolation('NON_FINITE_NUMBER', chemin, `valeur reçue : ${String(v)}`)
  }
  return v
}

/** Un poids d'exigence : fini et non négatif, sans quoi la moyenne n'en est plus une. */
function poidsDe(v: number, chemin: string): number {
  const n = fini(v, chemin)
  if (n < 0) throw new ContractViolation('TYPE_MISMATCH', chemin, 'un poids négatif fausserait le dénominateur de Q')
  return n
}

/** Un cardinal d'intentions : entier non négatif. */
function cardinalDe(v: number, chemin: string): number {
  const n = fini(v, chemin)
  if (n < 0 || !Number.isInteger(n)) {
    throw new ContractViolation('TYPE_MISMATCH', chemin, 'un cardinal d’intentions est un entier non négatif')
  }
  return n
}

/**
 * La durée d'une période : strictement positive, parce qu'elle PONDÈRE les
 * moyennes temporelles (L107) et qu'une durée nulle y serait une période
 * silencieusement effacée de la série.
 */
function dureeDe(v: number, chemin: string): number {
  const n = fini(v, chemin)
  if (n <= 0) throw new ContractViolation('TYPE_MISMATCH', chemin, 'une durée de période est strictement positive')
  return n
}

/** Une exigence retenue par le filtre d'échéance, réduite à ce que la mesure lit. */
interface ActiveDue {
  readonly key: string
  readonly weight: number
  readonly satisfied: boolean
}

/**
 * Le FILTRE D'ÉCHÉANCE, appliqué avant tout calcul : seules les exigences
 * ACTIVES et DUES entrent dans Q comme dans G (L109, L189). « Une exigence
 * révélée mais non encore due : son poids ne doit pas entrer dans Q avant son
 * échéance » (L109) — elle n'entre donc ni au numérateur, ni au dénominateur,
 * ni dans le décompte des régressions.
 *
 * Les doublons d'identité sont réduits à une occurrence : L129 compte « par
 * id/version active », donc répéter une exigence ne peut pas doubler son poids,
 * pas plus que répéter ses assertions ne peut le changer.
 */
function activesDues(periode: MetricPeriod, chemin: string): ActiveDue[] {
  const exigences = Array.isArray(periode.requirements) ? periode.requirements : []
  const index = fini(periode.period_index, `${chemin}.period_index`)
  const retenues: ActiveDue[] = []
  const vues = new Set<string>()
  let rang = 0
  for (const exigence of exigences) {
    const ou = `${chemin}.requirements[${String(rang)}]`
    rang += 1
    const echeance = fini(exigence.due_at_period, `${ou}.due_at_period`)
    if (echeance > index) continue
    const key = cle(exigence.id, exigence.version)
    if (vues.has(key)) continue
    vues.add(key)
    retenues.push({
      key,
      weight: poidsDe(exigence.weight, `${ou}.weight`),
      satisfied: exigence.satisfied === true,
    })
  }
  return retenues
}

/** Les retraits PAR REMPLACEMENT d'une période, `ancienne->nouvelle` (L88, L187). */
function remplaceesDe(periode: MetricPeriod): string[] {
  const retraits = Array.isArray(periode.retired) ? periode.retired : []
  const out: string[] = []
  for (const retrait of retraits) {
    const remplacante = retrait.replaced_by
    if (remplacante === null || remplacante === undefined) continue
    out.push(`${cle(retrait.id, retrait.version)}->${cle(remplacante.id, remplacante.version)}`)
  }
  return out
}

/**
 * Mesure une série de périodes : métriques par période et agrégats de campagne.
 *
 * FONCTION PURE (L187) : elle ne lit ni horloge, ni hasard, ni environnement, et
 * ne mute pas son entrée. Deux appels sur la même série rendent les mêmes
 * octets.
 *
 * L'ORDRE DU TABLEAU EST L'ORDRE CHRONOLOGIQUE. L78 pose que `period_index`
 * commence à 1 et numérote la suite ; « la période précédente comparable »
 * (L189) est donc l'élément qui précède dans la série soumise.
 */
export function computePeriodMetrics(series: MetricSeriesInput, _options?: MetricOptions): SeriesMetrics {
  const periodes = periodesDe(series)

  // « autrefois satisfaite » (L189) : alimenté par les périodes STRICTEMENT
  // antérieures — jamais par la période en cours, sans quoi une exigence
  // satisfaite ici serait « autrefois satisfaite » d'elle-même.
  const jadisSatisfaites = new Set<string>()
  // « satisfaite à la période précédente comparable » (L189).
  let precedentesSatisfaites = new Set<string>()

  const lignes: PeriodMetrics[] = []

  let tempsTotal = 0
  let tempsMesure = 0
  let sommeQ = 0
  let tempsExpose = 0
  let sommeR = 0
  let offertesTotal = 0
  let reussiesTotal = 0

  let rang = 0
  for (const periode of periodes) {
    const chemin = `periods[${String(rang)}]`
    rang += 1

    const duree = dureeDe(periode.duration, `${chemin}.duration`)
    const actives = activesDues(periode, chemin)

    // Q — moyenne pondérée des actives dues ; `null` si aucun poids (L111).
    let poidsTotal = 0
    let poidsSatisfait = 0
    for (const active of actives) {
      poidsTotal += active.weight
      if (active.satisfied) poidsSatisfait += active.weight
    }
    const Q = poidsTotal === 0 ? null : poidsSatisfait / poidsTotal

    // R — le DÉNOMINATEUR est le seul discriminant du `null` (L111).
    const offertes = cardinalDe(periode.intents_offered, `${chemin}.intents_offered`)
    const reussies = cardinalDe(periode.intents_succeeded, `${chemin}.intents_succeeded`)
    if (reussies > offertes) {
      throw new ContractViolation(
        'TYPE_MISMATCH',
        `${chemin}.intents_succeeded`,
        'plus d’intentions réussies que proposées : R sortirait de [0,1]',
      )
    }
    const R = offertes === 0 ? null : reussies / offertes

    // G / G_new — les trois conditions de L189, dans l'ordre où L189 les pose.
    const regressions: string[] = []
    const nouvelles: string[] = []
    const backlog: string[] = []
    for (const active of actives) {
      if (active.satisfied) continue
      backlog.push(active.key)
      if (!jadisSatisfaites.has(active.key)) continue
      regressions.push(active.key)
      if (precedentesSatisfaites.has(active.key)) nouvelles.push(active.key)
    }

    lignes.push({
      period_index: periode.period_index,
      Q,
      R,
      G: regressions.length,
      G_new: nouvelles.length,
      regressions,
      new_regressions: nouvelles,
      backlog,
      replaced: remplaceesDe(periode),
    })

    // Agrégats : moyennes TEMPORELLES pour V et U, quotient des SOMMES pour la
    // réussite agrégée par intention (L107).
    tempsTotal += duree
    if (Q !== null) {
      tempsMesure += duree
      sommeQ += duree * Q
    }
    if (R !== null) {
      tempsExpose += duree
      sommeR += duree * R
    }
    offertesTotal += offertes
    reussiesTotal += reussies

    // Bascule d'historique : ce que cette période laisse à la suivante.
    const satisfaitesIci = new Set<string>()
    for (const active of actives) {
      if (!active.satisfied) continue
      jadisSatisfaites.add(active.key)
      satisfaitesIci.add(active.key)
    }
    precedentesSatisfaites = satisfaitesIci
  }

  const aggregates: CampaignAggregates = {
    V: tempsMesure === 0 ? null : sommeQ / tempsMesure,
    U: tempsExpose === 0 ? null : sommeR / tempsExpose,
    exposure: tempsTotal === 0 ? 0 : tempsExpose / tempsTotal,
    intent_success_rate: offertesTotal === 0 ? null : reussiesTotal / offertesTotal,
  }

  return { periods: lignes, aggregates }
}
