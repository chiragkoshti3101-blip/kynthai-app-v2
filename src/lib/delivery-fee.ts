/**
 * Kynthai home-collection travel pricing.
 *
 * Policy:
 *   - Under 5 km: fixed $8.00 travel charge.
 *   - At or beyond 5 km: the provider sets the travel charge; the patient
 *     must see and accept that quote before a booking can be created.
 *   - Unknown distance: do not book silently; the patient must contact the
 *     provider or use in-lab collection.
 *
 * Distances are calculated from the curated ZIP coordinate table below. The
 * table is intentionally conservative: an unknown ZIP never becomes free.
 */

const MILES_PER_KILOMETRE = 0.6213711922
const KILOMETRES_PER_MILE = 1 / MILES_PER_KILOMETRE
export const FIXED_SHORT_DISTANCE_FEE_CENTS = 800
export const LONG_DISTANCE_THRESHOLD_KM = 5
export const DELIVERY_PLATFORM_FEE_PCT = 18

export interface DeliveryTier {
  minKm: number
  maxKm: number | null
  // Kept for consumers that previously displayed mileage boundaries.
  minMi: number
  maxMi: number | null
  feeCents: number
  label: string
  contactLab: boolean
  quoteRequired: boolean
}

export const DELIVERY_TIERS: DeliveryTier[] = [
  {
    minKm: 0,
    maxKm: LONG_DISTANCE_THRESHOLD_KM,
    minMi: 0,
    maxMi: LONG_DISTANCE_THRESHOLD_KM * MILES_PER_KILOMETRE,
    feeCents: FIXED_SHORT_DISTANCE_FEE_CENTS,
    label: '$8.00',
    contactLab: false,
    quoteRequired: false,
  },
  {
    minKm: LONG_DISTANCE_THRESHOLD_KM,
    maxKm: null,
    minMi: LONG_DISTANCE_THRESHOLD_KM * MILES_PER_KILOMETRE,
    maxMi: null,
    feeCents: 0,
    label: 'Provider quote',
    contactLab: false,
    quoteRequired: true,
  },
]

// ── Haversine distance ──────────────────────────────────────────────────────
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in miles between two lat/lng points. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Great-circle distance in kilometres between two lat/lng points. */
export function haversineKilometres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineMiles(lat1, lng1, lat2, lng2) * KILOMETRES_PER_MILE
}

// ── Zip code lookup ──────────────────────────────────────────────────────────
// Curated list of major US ZIP codes for distance estimation. In production,
// replace this table with a full ZIP database or geocoding provider.
const ZIP_COORDS: Record<string, [number, number]> = {
  // Texas
  '78701': [30.2672, -97.7431],
  '78702': [30.2500, -97.7200],
  '78745': [30.2200, -97.7900],
  '75201': [32.7872, -96.7985],
  '75202': [32.7850, -96.8000],
  '77001': [29.7604, -95.3698],
  '77002': [29.7545, -95.3550],
  '78201': [29.4684, -98.5255],
  '79901': [31.7619, -106.4850],
  // California
  '90001': [33.9425, -118.2551],
  '90210': [34.0901, -118.4065],
  '94102': [37.7749, -122.4194],
  '94105': [37.7890, -122.3940],
  '92101': [32.7157, -117.1611],
  '95101': [37.3382, -121.8863],
  // New York
  '10001': [40.7484, -73.9967],
  '10013': [40.7201, -74.0048],
  '11201': [40.6932, -73.9903],
  '10451': [40.8203, -73.9235],
  '10301': [40.6433, -74.0764],
  // Florida
  '33101': [25.7617, -80.1918],
  '32801': [28.5383, -81.3792],
  '33601': [27.9506, -82.4572],
  '32301': [30.4383, -84.2807],
  // Illinois
  '60601': [41.8819, -87.6278],
  '60602': [41.8805, -87.6305],
  // Pennsylvania
  '19101': [39.9526, -75.1652],
  '15201': [40.4406, -79.9959],
  // Ohio
  '43215': [39.9612, -82.9988],
  '44101': [41.4993, -81.6944],
  '45202': [39.1031, -84.5120],
  // Georgia
  '30301': [33.7490, -84.3880],
  // North Carolina
  '28201': [35.2271, -80.8431],
  '27601': [35.7796, -78.6382],
  // Washington
  '98101': [47.6062, -122.3321],
  '98052': [47.6696, -122.1273],
  // Massachusetts
  '02101': [42.3601, -71.0589],
  // Colorado
  '80201': [39.7392, -104.9903],
  // Arizona
  '85001': [33.4484, -112.0740],
  // Tennessee
  '37201': [36.1627, -86.7816],
  // Missouri
  '63101': [38.6270, -90.1994],
  // Maryland
  '21201': [39.2904, -76.6122],
  // Wisconsin
  '53201': [43.0389, -87.9065],
  // Minnesota
  '55401': [44.9778, -93.2650],
  // Oregon
  '97201': [45.5155, -122.6789],
  // Nevada
  '89101': [36.1699, -115.1398],
  // Michigan
  '48201': [42.3314, -83.0458],
  // Indiana
  '46201': [39.7684, -86.1581],
  // Utah
  '84101': [40.7608, -111.8910],
  // Virginia
  '23219': [37.5407, -77.4360],
  // Kansas
  '66101': [39.1067, -94.6773],
  // New Mexico
  '87101': [35.0844, -106.6504],
  // Oklahoma
  '73101': [35.4676, -97.5164],
  // Kentucky
  '40202': [38.2527, -85.7585],
  // Louisiana
  '70112': [29.9511, -90.0715],
  // Alabama
  '35203': [33.5207, -86.8025],
  // South Carolina
  '29401': [32.7765, -79.9311],
  // Connecticut
  '06103': [41.7658, -72.6734],
}

/** Look up coordinates for a US ZIP code. */
export function zipCoords(zip: string): [number, number] | null {
  const cleaned = zip.trim().slice(0, 5)
  return ZIP_COORDS[cleaned] ?? null
}

export interface DeliveryFeeResult {
  distanceKm: number | null
  /** Legacy-compatible mileage value for existing booking records. */
  distanceMi: number | null
  tier: DeliveryTier
  deliveryFeeCents: number
  platformFeeCents: number
  /** True only when distance cannot be calculated. */
  contactLab: boolean
  /** True when the provider must supply a quote. */
  quoteRequired: boolean
  /** False when a long-distance provider quote has not been configured. */
  quoteAvailable: boolean
  providerQuoteCents: number | null
  distanceLabel: string
}

/** Select the policy tier for a distance in kilometres. */
export function deliveryTierForDistance(distanceKm: number): DeliveryTier {
  for (const tier of DELIVERY_TIERS) {
    if (tier.maxKm !== null
      ? distanceKm >= tier.minKm && distanceKm < tier.maxKm
      : distanceKm >= tier.minKm) {
      return tier
    }
  }
  return DELIVERY_TIERS[DELIVERY_TIERS.length - 1]!
}

/**
 * Calculate the home-collection travel charge.
 * `providerQuoteCents` is optional because the public calculator can tell the
 * patient that a quote is required before the provider has configured one.
 */
export function calculateDeliveryFee(
  patientZip: string,
  labZip: string,
  providerQuoteCents?: number | null,
): DeliveryFeeResult {
  const patientCoords = zipCoords(patientZip)
  const labCoords = zipCoords(labZip)

  if (!patientCoords || !labCoords) {
    return {
      distanceKm: null,
      distanceMi: null,
      tier: {
        minKm: 0,
        maxKm: null,
        minMi: 0,
        maxMi: null,
        feeCents: 0,
        label: 'Distance unavailable',
        contactLab: true,
        quoteRequired: false,
      },
      deliveryFeeCents: 0,
      platformFeeCents: 0,
      contactLab: true,
      quoteRequired: false,
      quoteAvailable: false,
      providerQuoteCents: null,
      distanceLabel: 'Distance unavailable — please contact the provider',
    }
  }

  // Use the unrounded distance for the 5 km boundary; round only values
  // displayed/stored for the patient so 4.96 km is not misclassified as 5 km.
  const exactDistanceKm = haversineKilometres(
    patientCoords[0], patientCoords[1], labCoords[0], labCoords[1],
  )
  const distanceKm = Math.round(exactDistanceKm * 10) / 10
  const distanceMi = Math.round((exactDistanceKm * MILES_PER_KILOMETRE) * 10) / 10
  const tier = deliveryTierForDistance(exactDistanceKm)
  const normalizedQuote = Number.isFinite(Number(providerQuoteCents)) && Number(providerQuoteCents) > 0
    ? Math.round(Number(providerQuoteCents))
    : null
  const quoteAvailable = !tier.quoteRequired || normalizedQuote !== null
  const deliveryFeeCents = tier.quoteRequired ? (normalizedQuote ?? 0) : FIXED_SHORT_DISTANCE_FEE_CENTS
  const platformFeeCents = Math.round(deliveryFeeCents * (DELIVERY_PLATFORM_FEE_PCT / 100))

  const distanceLabel = tier.quoteRequired
    ? normalizedQuote === null
      ? `${distanceKm} km — provider quote required`
      : `${distanceKm} km — provider quote $${(normalizedQuote / 100).toFixed(2)}`
    : `${distanceKm} km — fixed $8.00 travel charge`

  return {
    distanceKm,
    distanceMi,
    tier,
    deliveryFeeCents,
    platformFeeCents,
    contactLab: false,
    quoteRequired: tier.quoteRequired,
    quoteAvailable,
    providerQuoteCents: normalizedQuote,
    distanceLabel,
  }
}

/** Extract the first five-digit ZIP from a full address. */
export function extractZip(address: string): string | null {
  const match = address.match(/\b(\d{5})\b/)
  return match?.[1] ?? null
}
