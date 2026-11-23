/**
 * Payout ledger — pure money math (no DB, safe to unit-test).
 *
 * The ledger is a list of Payout rows. Normal payouts carry a positive
 * `netAmount`; commission reversals (refunds / no-shows) are written as
 * `clawback` rows with a negative `netAmount`. Netting is just summing them,
 * so a clawback automatically reduces the partner's next payout.
 */
import { PAYOUT_POLICY } from './commission'

export type PayoutLedgerRow = {
  amount: number
  platformFee: number
  netAmount: number
  status: string
  createdAt: Date | string
  paidAt?: Date | string | null
}

export type PayoutStatement = {
  currency: string
  /** Gross booking value of open payout rows. */
  gross: number
  /** Platform fees withheld from open payout rows. */
  platformFees: number
  /** Commission clawed back (positive number, already netted out of `net`). */
  clawbacks: number
  /** Sum of every open row's netAmount (payouts minus clawbacks). */
  net: number
  /** Net that has cleared the hold window and may be paid now. */
  eligibleNet: number
  /** Net still inside the hold window. */
  heldNet: number
  /** Number of open ledger rows. */
  entries: number
  minPayoutCents: number
  holdDays: number
  /** True when eligibleNet clears the minimum payout threshold. */
  payoutDue: boolean
}

export const OPEN_PAYOUT_STATUSES = ['pending', 'processing', 'clawback'] as const

function toMs(value: Date | string | null | undefined): number {
  if (!value) return NaN
  return (value instanceof Date ? value : new Date(value)).getTime()
}

/** Summarize open payout rows into a partner statement. */
export function summarizePayoutLedger(
  rows: ReadonlyArray<PayoutLedgerRow>,
  opts?: { now?: Date; holdDays?: number; minPayoutUsd?: number },
): PayoutStatement {
  const now = opts?.now ?? new Date()
  const holdDays = opts?.holdDays ?? PAYOUT_POLICY.holdDays
  const minPayoutCents = Math.round((opts?.minPayoutUsd ?? PAYOUT_POLICY.minPayoutUsd) * 100)
  const holdMs = holdDays * 24 * 60 * 60 * 1000

  let gross = 0
  let platformFees = 0
  let clawbacks = 0
  let net = 0
  let eligibleNet = 0
  let heldNet = 0
  let entries = 0

  for (const row of rows) {
    if (!OPEN_PAYOUT_STATUSES.includes(row.status as (typeof OPEN_PAYOUT_STATUSES)[number])) continue
    const rowNet = Number(row.netAmount) || 0
    const createdMs = toMs(row.createdAt)

    if (row.status === 'clawback') {
      clawbacks += Math.abs(row.platformFee || rowNet)
    } else {
      gross += Number(row.amount) || 0
      platformFees += Number(row.platformFee) || 0
    }

    net += rowNet
    entries += 1
    if (!Number.isNaN(createdMs) && now.getTime() - createdMs >= holdMs) eligibleNet += rowNet
    else heldNet += rowNet
  }

  return {
    currency: PAYOUT_POLICY.currency,
    gross,
    platformFees,
    clawbacks,
    net,
    eligibleNet,
    heldNet,
    entries,
    minPayoutCents,
    holdDays,
    payoutDue: eligibleNet > 0 && eligibleNet >= minPayoutCents,
  }
}
