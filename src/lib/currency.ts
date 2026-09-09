/**
 * Kynthai Currency System
 * -----------------------------
 * Prices use the user's selected currency.
 * No country-specific tax is included in displayed prices.
 * Taxes or local charges, where applicable, are shown at checkout.
 */

export type Currency = 'USD' | 'EUR' | 'GBP'

export const CURRENCIES: Record<
  Currency,
  { symbol: string; locale: string; label: string; flag: string }
> = {
  USD: { symbol: '$', locale: 'en-US', label: 'USD', flag: '🇺🇸' },
  EUR: { symbol: '€', locale: 'en-IE', label: 'EUR', flag: '🇪🇺' },
  GBP: { symbol: '£', locale: 'en-GB', label: 'GBP', flag: '🇬🇧' },
}

export const CURRENCY_ORDER: Currency[] = ['USD', 'EUR', 'GBP']

/** Patient subscription prices — per month, before local taxes */
export const PRICING: Record<
  Currency,
  {
    plus: { monthly: number; yearly: number }
    family_pro: { monthly: number; yearly: number }
  }
> = {
  USD: {
    plus: { monthly: 19.99, yearly: 199.99 },
    family_pro: { monthly: 39.99, yearly: 399.99 },
  },
  EUR: {
    plus: { monthly: 19.99, yearly: 199.99 },
    family_pro: { monthly: 39.99, yearly: 399.99 },
  },
  GBP: {
    plus: { monthly: 16.99, yearly: 169.99 },
    family_pro: { monthly: 33.99, yearly: 339.99 },
  },
}

/**
 * Founding-member (grandfathered) prices.
 *
 * Kynthai published "forever pricing" to early adopters at these rates, so
 * those subscriptions are honoured for as long as they stay active. Verify a
 * legacy renewal with `legacyAmountMatchesTier` — NOT `amountMatchesTier`,
 * which only accepts current prices. New customers are charged PRICING above.
 */
export const LEGACY_PRICING: Record<
  Currency,
  {
    plus: { monthly: number; yearly: number }
    family_pro: { monthly: number; yearly: number }
  }
> = {
  USD: {
    plus: { monthly: 9.99, yearly: 99.99 },
    family_pro: { monthly: 19.99, yearly: 199.99 },
  },
  EUR: {
    plus: { monthly: 9.99, yearly: 99.99 },
    family_pro: { monthly: 19.99, yearly: 199.99 },
  },
  GBP: {
    plus: { monthly: 7.99, yearly: 79.99 },
    family_pro: { monthly: 15.99, yearly: 159.99 },
  },
}

/** Early Adopter prices — per month, before local taxes */
export const EARLY_ADOPTER_PRICING = {
  USD: {
    individual: { monthly: 9.99, yearly: 99.99 },
    family: { monthly: 19.99, yearly: 199.99 },
  },
}

/** Months the promotional intro rate applies before standard pricing begins. */
export const EARLY_ADOPTER_INTRO_MONTHS = 3

/**
 * Renewal price shown alongside any promotional rate. Disclosing this before
 * checkout is required: the customer must see what they pay after the intro
 * period ends.
 */
export function renewalPrice(
  tier: TierKey,
  currency: Currency = 'USD',
  cycle: 'monthly' | 'yearly' = 'monthly'
): number {
  return PRICING[currency][tier][cycle]
}

/** Format a price amount with the currency symbol. */
export function formatPrice(amount: number, currency: Currency): string {
  const c = CURRENCIES[currency]
  return `${c.symbol}${amount}`
}

/** Yearly savings percentage for display. */
export function yearlySavingsPct(currency: Currency, tier: 'plus' | 'family_pro'): number {
  const p = PRICING[currency][tier]
  const monthlyAnnual = p.monthly * 12
  if (monthlyAnnual === 0) return 0
  return Math.round((1 - p.yearly / monthlyAnnual) * 100)
}

/** Auto-detect a supported currency from the browser region. Falls back to USD. */
export function detectCurrency(): Currency {
  if (typeof navigator === 'undefined') return 'USD'
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const region = (navigator.language || '').split('-')[1]?.toUpperCase()
  if (region === 'GB' || timezone === 'Europe/London') return 'GBP'
  const euroRegions = new Set(['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'])
  if (region && euroRegions.has(region)) return 'EUR'
  if (timezone.startsWith('Europe/') && !timezone.startsWith('Europe/London')) return 'EUR'
  return 'USD'
}

/**
 * Subscribable tier keys. Client-facing claims use 'plus' | 'family';
 * DB/webhook canonical keys are 'plus' | 'family_pro'.
 */
export type TierKey = 'plus' | 'family_pro'

/**
 * Map a client or webhook tier claim to the canonical DB tier key.
 * Unknown claims return null (caller must reject).
 */
export function tierFromClaim(claim: string | undefined | null): TierKey | null {
  if (claim === 'family' || claim === 'family_pro') return 'family_pro'
  if (claim === 'plus') return 'plus'
  return null
}

/**
 * Server-side verification that a paid amount (in dollars) matches a tier's
 * published monthly or yearly price for a currency. Tolerance guards float
 * rounding (0.01). Used by the Stripe webhook so metadata can never be the
 * sole authority for granting a tier.
 */
export function amountMatchesTier(
  amountDollars: number,
  currency: string,
  tier: TierKey,
  tolerance = 0.01
): boolean {
  const code = currency.toUpperCase() as Currency
  const pricing = PRICING[code]
  if (!pricing) return false
  const prices = pricing[tier]
  return (
    Math.abs(amountDollars - prices.monthly) <= tolerance ||
    Math.abs(amountDollars - prices.yearly) <= tolerance
  )
}

/**
 * Verification for a GRANDFATHERED renewal.
 *
 * Founding members were promised their original rate permanently, so their
 * recurring charge arrives at a legacy amount that no longer matches PRICING.
 *
 * This is deliberately NOT folded into `amountMatchesTier`: the new Individual
 * price ($19.99) equals the legacy Family price, so accepting both sets in one
 * check would let an Individual payment satisfy a Family claim — the
 * upgrade-underpay attack. Callers must therefore prove the subscription is a
 * pre-existing founding-member one (e.g. an existing Stripe subscription whose
 * price ID predates the change) before consulting this function.
 */
export function legacyAmountMatchesTier(
  amountDollars: number,
  currency: string,
  tier: TierKey,
  tolerance = 0.01
): boolean {
  const legacy = LEGACY_PRICING[currency.toUpperCase() as Currency]
  if (!legacy) return false
  const prices = legacy[tier]
  return (
    Math.abs(amountDollars - prices.monthly) <= tolerance ||
    Math.abs(amountDollars - prices.yearly) <= tolerance
  )
}
