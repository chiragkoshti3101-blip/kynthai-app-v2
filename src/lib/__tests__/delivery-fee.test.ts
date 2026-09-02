import { describe, it, expect } from 'vitest'
import {
  DELIVERY_TIERS,
  DELIVERY_PLATFORM_FEE_PCT,
  FIXED_SHORT_DISTANCE_FEE_CENTS,
  LONG_DISTANCE_THRESHOLD_KM,
  haversineMiles,
  haversineKilometres,
  zipCoords,
  deliveryTierForDistance,
  calculateDeliveryFee,
  extractZip,
} from '../delivery-fee'

describe('DELIVERY_TIERS', () => {
  it('defines the fixed short-distance tier and provider-quote tier', () => {
    expect(DELIVERY_TIERS.map((t) => t.label)).toEqual(['$8.00', 'Provider quote'])
    expect(DELIVERY_TIERS.map((t) => t.feeCents)).toEqual([FIXED_SHORT_DISTANCE_FEE_CENTS, 0])
    expect(DELIVERY_TIERS[0]).toMatchObject({ minKm: 0, maxKm: 5, quoteRequired: false })
    expect(DELIVERY_TIERS[1]).toMatchObject({ minKm: 5, maxKm: null, quoteRequired: true })
  })

  it('uses the documented 5 km boundary and 18% platform fee', () => {
    expect(LONG_DISTANCE_THRESHOLD_KM).toBe(5)
    expect(DELIVERY_PLATFORM_FEE_PCT).toBe(18)
  })
})

describe('deliveryTierForDistance', () => {
  it('uses the fixed $8 charge below 5 km', () => {
    expect(deliveryTierForDistance(0).label).toBe('$8.00')
    expect(deliveryTierForDistance(4.99).label).toBe('$8.00')
    expect(deliveryTierForDistance(4.999).quoteRequired).toBe(false)
  })

  it('requires a provider quote at 5 km and beyond', () => {
    expect(deliveryTierForDistance(5).quoteRequired).toBe(true)
    expect(deliveryTierForDistance(5.01).quoteRequired).toBe(true)
    expect(deliveryTierForDistance(500).label).toBe('Provider quote')
  })

  it('returns a tier for every non-negative distance', () => {
    for (let km = 0; km <= 500; km += 0.5) {
      expect(deliveryTierForDistance(km)).toBeDefined()
    }
  })
})

describe('haversine distance', () => {
  it('is 0 for identical coordinates', () => {
    expect(haversineMiles(30.2672, -97.7431, 30.2672, -97.7431)).toBe(0)
    expect(haversineKilometres(30.2672, -97.7431, 30.2672, -97.7431)).toBe(0)
  })

  it('is ~183 mi / ~294 km between Austin and Dallas', () => {
    const miles = haversineMiles(30.2672, -97.7431, 32.7872, -96.7985)
    const kilometres = haversineKilometres(30.2672, -97.7431, 32.7872, -96.7985)
    expect(miles).toBeGreaterThan(182)
    expect(miles).toBeLessThan(184)
    expect(kilometres).toBeGreaterThan(293)
    expect(kilometres).toBeLessThan(295)
  })

  it('is symmetric', () => {
    const d1 = haversineMiles(30.2672, -97.7431, 32.7872, -96.7985)
    const d2 = haversineMiles(32.7872, -96.7985, 30.2672, -97.7431)
    expect(d1).toBeCloseTo(d2, 10)
  })
})

describe('zipCoords', () => {
  it('looks up a known zip', () => {
    expect(zipCoords('78701')).toEqual([30.2672, -97.7431])
  })

  it('normalizes zip+4 to the 5-digit prefix', () => {
    expect(zipCoords('78701-1234')).toEqual([30.2672, -97.7431])
  })

  it('trims surrounding whitespace', () => {
    expect(zipCoords('  78701  ')).toEqual([30.2672, -97.7431])
  })

  it('returns null for unknown, empty, or malformed zips', () => {
    expect(zipCoords('00000')).toBeNull()
    expect(zipCoords('')).toBeNull()
    expect(zipCoords('787')).toBeNull()
    expect(zipCoords('not-a-zip')).toBeNull()
  })
})

describe('calculateDeliveryFee', () => {
  it('charges a fixed $8 for a known address under 5 km', () => {
    // Austin 78701 -> Austin 78702 is about 2.9 km.
    const result = calculateDeliveryFee('78701', '78702')
    expect(result.contactLab).toBe(false)
    expect(result.quoteRequired).toBe(false)
    expect(result.quoteAvailable).toBe(true)
    expect(result.deliveryFeeCents).toBe(800)
    expect(result.platformFeeCents).toBe(144)
    expect(result.tier.label).toBe('$8.00')
    expect(result.distanceLabel).toContain('fixed $8.00 travel charge')
  })

  it('requires a provider quote for a known long-distance address', () => {
    // Beverly Hills 90210 -> Los Angeles 90001 is about 21.5 km.
    const result = calculateDeliveryFee('90210', '90001')
    expect(result.contactLab).toBe(false)
    expect(result.quoteRequired).toBe(true)
    expect(result.quoteAvailable).toBe(false)
    expect(result.providerQuoteCents).toBeNull()
    expect(result.deliveryFeeCents).toBe(0)
    expect(result.platformFeeCents).toBe(0)
    expect(result.distanceLabel).toMatch(/provider quote required/)
  })

  it('uses the provider quote and computes the platform share', () => {
    const result = calculateDeliveryFee('90210', '90001', 1500)
    expect(result.quoteRequired).toBe(true)
    expect(result.quoteAvailable).toBe(true)
    expect(result.providerQuoteCents).toBe(1500)
    expect(result.deliveryFeeCents).toBe(1500)
    expect(result.platformFeeCents).toBe(270)
    expect(result.distanceLabel).toContain('provider quote $15.00')
  })

  it('applies the same provider-quote rule to medium distances', () => {
    // Seattle 98101 -> Redmond 98052 is about 16.9 km.
    const result = calculateDeliveryFee('98101', '98052', 1200)
    expect(result.distanceKm).toBe(16.9)
    expect(result.distanceMi).toBe(10.5)
    expect(result.deliveryFeeCents).toBe(1200)
    expect(result.platformFeeCents).toBe(216)
  })

  it('does not silently book when either zip is unknown', () => {
    const result = calculateDeliveryFee('00000', '78701')
    expect(result.contactLab).toBe(true)
    expect(result.deliveryFeeCents).toBe(0)
    expect(result.platformFeeCents).toBe(0)
    expect(result.distanceKm).toBeNull()
    expect(result.distanceMi).toBeNull()
    expect(result.distanceLabel).toBe('Distance unavailable — please contact the provider')
  })

  it('returns rounded kilometre and legacy mile values', () => {
    const result = calculateDeliveryFee('98101', '98052', 1200)
    expect(result.distanceKm).toBeGreaterThan(16)
    expect(result.distanceKm).toBeLessThan(18)
    expect(result.distanceMi).toBe(10.5)
  })
})

describe('extractZip', () => {
  it('extracts a zip from a full address', () => {
    expect(extractZip('123 Main St, Austin TX 78701')).toBe('78701')
    expect(extractZip('PO Box 90210, Beverly Hills CA 90210')).toBe('90210')
  })

  it('extracts zip+4 as the 5-digit base', () => {
    expect(extractZip('400 Broad St, Seattle WA 98101-1234')).toBe('98101')
  })

  it('returns null when no zip is present', () => {
    expect(extractZip('No zip here')).toBeNull()
    expect(extractZip('')).toBeNull()
  })
})
