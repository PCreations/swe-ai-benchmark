// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — `bench report build <analysis.json> [--live-receipts
// <recus.json>]` (T42, cahier L523-L529 ; les quatre états, cahier:L26).
//
// Lit SEULEMENT les fichiers désignés (le squelette T41 ne porte qu'un chemin
// positionnel, et T42 y ajoute `--live-receipts`) : aucun accès réseau, aucune
// base, aucun magasin d'objets — cette commande ne juge que ce que ces deux
// fichiers portent.
//
//   CORE_VERIFIED     publiée quand le rapport d'analyse fourni porte au
//                      moins une trajectoire ET au moins une période (T38) —
//                      la seule chose que `<analysis.json>` permet de
//                      constater directement, jamais une liste de tâches
//                      prouvées inventée ici.
//   PILOT_READY        cette commande ne reçoit aucune donnée de pilotage
//                      (T39/T40) : jamais publiée, motif nommé.
//   HANDOFF_COMPLETE    T43 n'est pas encore atteint par construction d'un
//                      rapport T42 : jamais publiée, motif nommé.
//   LIVE_VALIDATED      cahier:L26, verbatim : « une attestation
//                      SUPPLÉMENTAIRE, seulement si un smoke test réel a
//                      effectivement été exécuté avec modèle, date, budgets
//                      et factures identifiés ». Un reçu est COMPLET s'il
//                      porte les quatre champs `model`/`date`/
//                      `budget_micro_usd`/`invoice_id`, chacun une chaîne non
//                      vide (cahier:L26, les quatre identifiants, mot pour
//                      mot) ; `receipts_count` compte les reçus COMPLETS, pas
//                      la taille brute du fichier (A6 : un ensemble de reçus
//                      vide, ou un reçu auquel `invoice_id` manque, ne publie
//                      jamais cette attestation).
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from 'node:fs'

interface LiveReceiptCandidate {
  readonly model?: unknown
  readonly date?: unknown
  readonly budget_micro_usd?: unknown
  readonly invoice_id?: unknown
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isCompleteReceipt(r: unknown): r is Required<LiveReceiptCandidate> {
  if (r === null || typeof r !== 'object') return false
  const o = r as LiveReceiptCandidate
  return nonEmptyString(o.model) && nonEmptyString(o.date) && nonEmptyString(o.budget_micro_usd) && nonEmptyString(o.invoice_id)
}

export interface BuildReportInput {
  readonly analysisPath: string
  readonly liveReceiptsPath?: string | undefined
}

export interface ReportState {
  readonly published: boolean
  readonly reason: string
}

export interface LiveValidatedState extends ReportState {
  readonly receipts_count: number
}

export interface BuildReportResult {
  readonly schema: 'bench.t42.report/1'
  readonly states: {
    readonly CORE_VERIFIED: ReportState
    readonly PILOT_READY: ReportState
    readonly HANDOFF_COMPLETE: ReportState
    readonly LIVE_VALIDATED: LiveValidatedState
  }
}

/** `bench report build` (T42, section II.4). */
// eslint-disable-next-line @typescript-eslint/require-await
export async function buildReport(input: BuildReportInput): Promise<BuildReportResult> {
  const analysisRaw = fs.readFileSync(input.analysisPath, 'utf8')
  const analysis = JSON.parse(analysisRaw) as Record<string, unknown>
  const trajectoryCount = typeof analysis['trajectory_count'] === 'number' ? (analysis['trajectory_count'] as number) : 0
  const periodCount = typeof analysis['period_count'] === 'number' ? (analysis['period_count'] as number) : 0
  const coreVerified = trajectoryCount > 0 && periodCount > 0

  let receiptsFileRead = false
  let receipts: readonly unknown[] = []
  if (input.liveReceiptsPath !== undefined) {
    const raw = fs.readFileSync(input.liveReceiptsPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    receipts = Array.isArray(parsed) ? parsed : []
    receiptsFileRead = true
  }
  const completeReceipts = receipts.filter(isCompleteReceipt)
  const liveValidatedPublished = receiptsFileRead && completeReceipts.length > 0

  return {
    schema: 'bench.t42.report/1',
    states: {
      CORE_VERIFIED: {
        published: coreVerified,
        reason: coreVerified
          ? "le rapport d'analyse fourni porte au moins une trajectoire et une periode (T38)"
          : "le rapport d'analyse fourni ne porte aucune trajectoire/periode exploitable",
      },
      PILOT_READY: {
        published: false,
        reason: "bench report build ne recoit aucune donnee de pilotage (T39/T40) : etat non constate ici",
      },
      HANDOFF_COMPLETE: {
        published: false,
        reason: "le paquet de passation (T43) n'est pas encore produit",
      },
      LIVE_VALIDATED: {
        published: liveValidatedPublished,
        reason: !receiptsFileRead
          ? 'aucun --live-receipts fourni : aucun smoke test reel atteste'
          : completeReceipts.length === 0
            ? 'aucun recu complet (model, date, budget_micro_usd, invoice_id) dans --live-receipts'
            : `${String(completeReceipts.length)} recu(s) complet(s) attestent un smoke test reel`,
        receipts_count: completeReceipts.length,
      },
    },
  }
}
