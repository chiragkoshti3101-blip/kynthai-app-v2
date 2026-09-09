/**
 * Kynthai Commission System — single source of truth
 * --------------------------------------------------
 * Owner-level model:
 *  - Doctors pay a 15% platform fee on every consult and medicine order
 *    routed through their practice (doctor keeps 85%).
 *  - Labs pay an 18% platform fee on every test booking fulfilled through
 *    Kynthai's network (lab keeps 82%).
 *  - Loyalty tiers reduce the platform fee as partners grow with us.
 *
 * NOTE: previous versions of the dashboards used stale 15% / 10% numbers.
 * Always import from this file so the numbers never drift again.
 */

export type LoyaltyTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum'

export interface TierConfig {
  /** Minimum lifetime fulfilled orders required to enter this tier. */
  min: number
  /** Next tier to graduate to, if any. */
  next: LoyaltyTier | null
  /** Platform-fee discount applied on top of the base rate (in percentage points). */
  feeDiscountPct: number
  /** Tailwind gradient for the tier card. */
  tint: string
  /** Emoji badge. */
  icon: string
  /** Short blurb shown to partners. */
  blurb: string
}

export const DOCTOR_BASE_FEE_PCT = 15 // platform fee on consults + medicine orders
export const DOCTOR_MIN_CONSULTATION_FEE_USD = 25 // Minimum consultation fee $25
export const LAB_BASE_FEE_PCT = 18 // platform fee on test bookings

export const LOYALTY_TIERS: Record<LoyaltyTier, TierConfig> = {
  Bronze: {
    min: 0,
    next: 'Silver',
    feeDiscountPct: 0,
    tint: 'from-amber-600 to-amber-800',
    // WGL4 glyphs (not emoji): render identically on every platform.
    icon: '●',
    blurb: 'Welcome aboard — base platform fee applies.',
  },
  Silver: {
    min: 50,
    next: 'Gold',
    feeDiscountPct: 1,
    tint: 'from-slate-400 to-slate-600',
    icon: '○',
    blurb: '50+ fulfilled orders — 1% fee discount unlocked.',
  },
  Gold: {
    min: 150,
    next: 'Platinum',
    feeDiscountPct: 2,
    tint: 'from-amber-400 to-amber-600',
    icon: '★',
    blurb: '150+ fulfilled orders — 2% fee discount unlocked.',
  },
  Platinum: {
    min: 300,
    next: null,
    feeDiscountPct: 3,
    tint: 'from-violet-400 via-fuchsia-400 to-emerald-400',
    icon: '◆',
    blurb: '300+ fulfilled orders — top tier, 3% fee discount.',
  },
}

/** Resolve the loyalty tier for a given number of lifetime fulfilled orders. */
export function resolveTier(lifetimeFulfilled: number): LoyaltyTier {
  const tiers = Object.entries(LOYALTY_TIERS).reverse() as [LoyaltyTier, TierConfig][]
  for (const [name, cfg] of tiers) {
    if (lifetimeFulfilled >= cfg.min) return name
  }
  return 'Bronze'
}

/** Effective platform fee for a doctor at a given loyalty tier. */
export function doctorFeePct(lifetimeFulfilled: number): number {
  const tier = resolveTier(lifetimeFulfilled)
  return Math.max(5, DOCTOR_BASE_FEE_PCT - LOYALTY_TIERS[tier].feeDiscountPct)
}

/** Effective platform fee for a lab at a given loyalty tier. */
export function labFeePct(lifetimeFulfilled: number): number {
  const tier = resolveTier(lifetimeFulfilled)
  return Math.max(5, LAB_BASE_FEE_PCT - LOYALTY_TIERS[tier].feeDiscountPct)
}

/** Payout policy shown to partners. */
export const PAYOUT_POLICY = {
  scheduleLabel: 'Weekly, every Friday',
  minPayoutUsd: 50,
  holdDays: 7,
  currency: 'USD',
} as const

/** Kynthai subscription tiers — prices in USD per month. */
export const SUBSCRIPTION_TIERS = {
  free: { monthly: 0, yearly: 0 },
  plus: { monthly: 19.99, yearly: 199.99 },
  family_pro: { monthly: 39.99, yearly: 399.99 },
} as const

/**
 * Founding-member rates, honoured permanently for early adopters who
 * subscribed under the published "forever pricing" commitment.
 */
export const LEGACY_SUBSCRIPTION_TIERS = {
  free: { monthly: 0, yearly: 0 },
  plus: { monthly: 9.99, yearly: 99.99 },
  family_pro: { monthly: 19.99, yearly: 199.99 },
} as const

/** Promotional intro prices in USD per month (first 3 months, then standard). */
export const EARLY_ADOPTER_TIERS = {
  individual: { monthly: 9.99, yearly: 99.99 },
  family: { monthly: 19.99, yearly: 199.99 },
} as const

/** Platform commission for appointments — uses DOCTOR_BASE_FEE_PCT as base,
 *  adjusted by patient subscription tier and doctor loyalty. */
export function computeCommission(
  patientTier: string,
  doctorCompletedAppointments: number,
  baseAmount: number,
): { commission: number; net: number; ratePct: number } {
  const tierRate = patientTier === 'family_pro' ? 0.1 : patientTier === 'plus' ? 0.15 : DOCTOR_BASE_FEE_PCT / 100
  const loyaltyTier = resolveTier(doctorCompletedAppointments)
  const loyaltyDiscount = LOYALTY_TIERS[loyaltyTier].feeDiscountPct / 100
  let ratePct = Math.max(0.05, tierRate - loyaltyDiscount)
  const commission = Math.round(baseAmount * ratePct)
  return { commission, net: baseAmount - commission, ratePct }
}
