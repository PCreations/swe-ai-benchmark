// ─────────────────────────────────────────────────────────────────────────────
// @bench/activities — les DEUX Activities du workflow de trajectoire (cahier
// L361-L370, tâche T24) : `getPeriodCount`, et l'Activity `'model-call'` que
// `packages/workflows/src/trajectory-workflow.ts` invoque une fois par
// période. `runPeriodOnce` (T23, `./run-period.js`) sert directement
// d'Activity `'run-period'` — aucun wrapper : sa forme `{ok,result}|{ok,
// reason}` est déjà celle que le workflow attend.
//
// POURQUOI UN FOURNISSEUR FACTICE EN SINGLETON DE PROCESSUS. `bench
// run-trajectory` (apps/cli) héberge, DANS UN SEUL PROCESSUS Node, à la fois
// le Worker Temporal ET le Client qui attend le résultat (ADR du fichier CLI) :
// les Activities s'exécutent donc dans CE MÊME processus. `fakeProviderCallsTotal`
// expose le compteur VIVANT du fournisseur factice (L15, L301) à ce processus,
// pour que la commande puisse publier `fake_provider_calls` (section III de
// `acceptance/T24.spec.ts`) sans faire traverser cette mesure par le workflow
// (qui n'en a pas besoin pour son propre contrat).
//
// LA DÉDUPLICATION (invariant 6, L68 ; A4) N'EST PAS RÉIMPLÉMENTÉE ICI : elle
// vit dans `dispatchModelCall` (@bench/gateway, T17) — cette Activity n'est
// qu'un appelant de plus. Deux invocations avec le MÊME `model_call_id` (même
// période) retrouvent donc la MÊME ligne `SETTLED` sans recontacter le
// fournisseur, que l'appelant soit un retry Temporal ou le point d'injection
// `--test-duplicate-activity` de T24.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from 'node:fs'
import * as os from 'node:os'

import { applyMigrations, closeStore, openStore } from '@bench/storage'
import { openBudget, reserveBudget } from '@bench/billing'
import { createFakeProvider, dispatchModelCall } from '@bench/gateway'
import type { FakeProvider } from '@bench/gateway'
import { runDemo } from '@bench/scenario'

/* ══════════════════════════════════ PostgreSQL réel (dsn), même motif que ═
 * `./run-period.ts`, `packages/billing/src/psql.ts`, `packages/gateway/src/
 * psql.ts` : un petit helper dupliqué plutôt qu'une dépendance croisée pour
 * trois lignes (même choix déjà fait trois fois dans ce dépôt). */
function socketDir(): string {
  const h = process.env.PGHOST
  if (h !== undefined && h.startsWith('/') && fs.existsSync(h)) return h
  return '/var/run/postgresql'
}
function pgUser(): string {
  return process.env.PGUSER ?? os.userInfo().username
}
function dsnFor(db: string): string {
  return `postgresql://${encodeURIComponent(pgUser())}@/${encodeURIComponent(db)}?host=${encodeURIComponent(socketDir())}`
}

/* ══════════════════════════ 'getPeriodCount' — K, cahier:L121 (F-FAILURE) ═
 * Même source de vérité que `runPeriodOnce` (T23) : `@bench/scenario`,
 * `runDemo`, JAMAIS une constante recopiée à la main ici.
 */
export async function getPeriodCount(input: { readonly mode: string }): Promise<number> {
  const demo = await runDemo({ mode: input.mode, storage: 'memory' })
  return demo.periods.length
}

/* ══════════════════════ le fournisseur factice, SINGLETON DE PROCESSUS ════ */

let sharedProvider: FakeProvider | null = null
const callsByModelCallId = new Map<string, number>()

function provider(): FakeProvider {
  if (sharedProvider === null) {
    sharedProvider = createFakeProvider({
      responses: [],
      onRequest: (request: unknown) => {
        const r = request as { readonly model_call_id?: unknown } | null
        const id = r !== null && typeof r === 'object' ? r.model_call_id : undefined
        if (typeof id === 'string') callsByModelCallId.set(id, (callsByModelCallId.get(id) ?? 0) + 1)
      },
    })
  }
  return sharedProvider
}

/** Nombre total d'appels RÉELS au fournisseur factice dans CE processus (section III). */
export function fakeProviderCallsTotal(): number {
  return sharedProvider?.calls ?? 0
}

/* ══════════════════════════════════ 'model-call' (L365, L99, T17) ═══════ */

const TARIFF = { input_uncached_per_token: 1, input_cached_per_token: 1, output_per_token: 2 }

export interface ModelCallActivityInput {
  readonly campaignId: string
  readonly postgresDatabase: string
  /** L'identité de l'opération (D-6, L68) : la MÊME période produit la MÊME identité. */
  readonly periodIndex: number
}

export interface ModelCallActivityResult {
  readonly model_call_id: string
  readonly status: string
  readonly cost: string | null
  readonly usage: unknown
  readonly response: unknown
  /** Appels RÉELS au fournisseur factice pour CETTE identité d'opération (A4). */
  readonly calls_observed: number
}

export async function modelCallActivity(input: ModelCallActivityInput): Promise<ModelCallActivityResult> {
  const dsn = dsnFor(input.postgresDatabase)
  await applyMigrations({ dsn })
  const handle = openStore({ dsn })
  try {
    const budgetId = `BDG-T24-${input.campaignId}`
    await openBudget(handle, { budget_id: budgetId, limit: '1000000000' })
    const reservation = await reserveBudget(handle, { budget_id: budgetId, amount: '1000' })
    if (!reservation.accepted || reservation.reservation_id === undefined) {
      throw new Error(`modelCallActivity : réservation refusée (${JSON.stringify(reservation)})`)
    }
    // Identité stable par période (D-6, L68) : un retry Temporal ET le point
    // d'injection `--test-duplicate-activity` partagent cette MÊME identité.
    const modelCallId = `mc-${input.campaignId}-${String(input.periodIndex)}`
    const idempotencyKey = `idem-${modelCallId}`
    const request = {
      model_call_id: modelCallId,
      campaign_id: input.campaignId,
      period_index: input.periodIndex,
    }
    const result = await dispatchModelCall(handle, {
      model_call_id: modelCallId,
      idempotency_key: idempotencyKey,
      budget_id: budgetId,
      reservation_id: reservation.reservation_id,
      provider: provider(),
      request,
      tariff: TARIFF,
    })
    return {
      model_call_id: modelCallId,
      status: result.status,
      cost: result.cost ?? null,
      usage: result.usage ?? null,
      response: result.response ?? null,
      calls_observed: callsByModelCallId.get(modelCallId) ?? 0,
    }
  } finally {
    await closeStore(handle)
  }
}
