import { describe, expect, it } from 'vitest'
import {
  DOCTOR_BASE_FEE_PCT,
  DOCTOR_MIN_FEE_PCT,
  NO_SHOW_POLICY,
  commissionReversal,
  computeCommission,
  resolveTier,
} from '@/lib/commission'

describe('computeCommission', () => {
  it('charges the 12% doctor base rate to a free patient and Bronze doctor', () => {
    const r = computeCommission('free', 0, 10_000)
    expect(r.ratePct).toBeCloseTo(DOCTOR_BASE_FEE_PCT / 100)
    expect(r.commission).toBe(1_200)
    expect(r.net).toBe(8_800)
  })

  it('lowers the rate for a doctor on the Pro subscription', () => {
    const free = computeCommission('free', 0, 10_000, 'free')
    const pro = computeCommission('free', 0, 10_000, 'pro')
    expect(pro.ratePct).toBeCloseTo(0.1)
    expect(pro.commission).toBeLessThan(free.commission)
    expect(pro.commission).toBe(1_000)
  })

  it('lowers the rate further for an Enterprise doctor', () => {
    const r = computeCommission('free', 0, 10_000, 'enterprise')
    expect(r.ratePct).toBeCloseTo(0.07) // 12 - 5
    expect(r.commission).toBe(700)
  })

  it('never drops below the 7% floor, even with loyalty + Pro stacked', () => {
    // Platinum = 5% loyalty, Pro = 2%: 12 - 7 = 5 -> floored to 7.
    const r = computeCommission('free', 300, 10_000, 'pro')
    expect(r.ratePct).toBeCloseTo(DOCTOR_MIN_FEE_PCT / 100)
    expect(r.commission).toBe(700)
  })

  it('applies the patient Plus rate then floors at 7%', () => {
    // Plus 8% - Silver 2% = 6% -> floored to 7%.
    const r = computeCommission('plus', 50, 10_000, 'free')
    expect(r.ratePct).toBeCloseTo(0.07)
  })

  it('respects the Family Pro 10% rate with a Gold doctor', () => {
    // 10% - 3% = 7% (exactly the floor, no flooring needed).
    const r = computeCommission('family_pro', 150, 10_000, 'free')
    expect(r.ratePct).toBeCloseTo(0.07)
    expect(r.commission).toBe(700)
  })

  it('ignores an unknown subscription tier', () => {
    const r = computeCommission('free', 0, 10_000, 'not-a-tier')
    expect(r.ratePct).toBeCloseTo(DOCTOR_BASE_FEE_PCT / 100)
  })
})

describe('commissionReversal', () => {
  it('returns a negative amount for the ledger clawback', () => {
    expect(commissionReversal(1_200)).toBe(-1_200)
    expect(commissionReversal(-1_200)).toBe(-1_200)
    expect(commissionReversal(0)).toBe(0)
  })
})

describe('resolveTier', () => {
  it('maps thresholds to tiers', () => {
    expect(resolveTier(0)).toBe('Bronze')
    expect(resolveTier(50)).toBe('Silver')
    expect(resolveTier(150)).toBe('Gold')
    expect(resolveTier(300)).toBe('Platinum')
  })
})

describe('NO_SHOW_POLICY', () => {
  it('fully refunds and claws back commission on a provider no-show', () => {
    expect(NO_SHOW_POLICY.doctorNoShow.patientRefundPct).toBe(100)
    expect(NO_SHOW_POLICY.doctorNoShow.commissionClawbackPct).toBe(100)
    expect(NO_SHOW_POLICY.labNoShow.travelFeeRefunded).toBe(true)
  })

  it('encodes the patient cancellation windows explicitly', () => {
    expect(NO_SHOW_POLICY.patientCancel.fullRefundHoursBefore).toBe(24)
    expect(NO_SHOW_POLICY.patientCancel.partialRefundHoursBefore).toBe(2)
    expect(NO_SHOW_POLICY.patientCancel.partialRefundPct).toBe(50)
    expect(NO_SHOW_POLICY.patientCancel.noRefundWithinHours).toBe(2)
  })
})
