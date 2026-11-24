import { describe, expect, it } from 'vitest'
import { summarizePayoutLedger, type PayoutLedgerRow } from '@/lib/payout-ledger'

const NOW = new Date('2026-11-23T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function row(overrides: Partial<PayoutLedgerRow>): PayoutLedgerRow {
  return {
    amount: 10_000,
    platformFee: 1_200,
    netAmount: 8_800,
    status: 'pending',
    createdAt: daysAgo(30),
    ...overrides,
  }
}

describe('summarizePayoutLedger', () => {
  it('returns zeros for an empty ledger', () => {
    const s = summarizePayoutLedger([], { now: NOW })
    expect(s.net).toBe(0)
    expect(s.eligibleNet).toBe(0)
    expect(s.payoutDue).toBe(false)
    expect(s.entries).toBe(0)
  })

  it('reports a cleared payout above the minimum as due', () => {
    const s = summarizePayoutLedger([row({ netAmount: 8_800 })], { now: NOW })
    expect(s.gross).toBe(10_000)
    expect(s.platformFees).toBe(1_200)
    expect(s.net).toBe(8_800)
    expect(s.eligibleNet).toBe(8_800)
    expect(s.payoutDue).toBe(true) // 8800 >= 5000 cents
  })

  it('holds a payout newer than the hold window', () => {
    const s = summarizePayoutLedger([row({ netAmount: 8_800, createdAt: daysAgo(3) })], { now: NOW })
    expect(s.eligibleNet).toBe(0)
    expect(s.heldNet).toBe(8_800)
    expect(s.payoutDue).toBe(false)
  })

  it('nets a commission clawback against payouts', () => {
    const s = summarizePayoutLedger(
      [
        row({ netAmount: 8_800 }),
        row({ status: 'clawback', amount: 0, platformFee: -1_200, netAmount: -1_200 }),
      ],
      { now: NOW },
    )
    expect(s.clawbacks).toBe(1_200)
    expect(s.net).toBe(7_600)
    expect(s.eligibleNet).toBe(7_600)
  })

  it('does not pay when the net falls below the minimum after clawbacks', () => {
    const s = summarizePayoutLedger(
      [
        row({ netAmount: 5_500 }),
        row({ status: 'clawback', amount: 0, platformFee: -1_200, netAmount: -1_200 }),
      ],
      { now: NOW },
    )
    expect(s.net).toBe(4_300)
    expect(s.payoutDue).toBe(false) // below $50
  })

  it('ignores already-paid rows', () => {
    const s = summarizePayoutLedger(
      [row({ status: 'paid', netAmount: 8_800 }), row({ status: 'paid', netAmount: 8_800 })],
      { now: NOW },
    )
    expect(s.entries).toBe(0)
    expect(s.payoutDue).toBe(false)
  })
})
