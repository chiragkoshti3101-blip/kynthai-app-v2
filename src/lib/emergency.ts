export type EmergencyCountry = {
  code: string
  name: string
  number: string
  dialNumber: string
  note?: string
}

// Curated from national emergency services and ITU E.129 references.
// A country may have separate police/fire/ambulance numbers; where that is
// true, the displayed value keeps the alternatives visible and dialNumber
// chooses the most broadly useful emergency route for a health app.
export const EMERGENCY_COUNTRIES: EmergencyCountry[] = [
  { code: 'AR', name: 'Argentina', number: '911', dialNumber: '911' },
  { code: 'AU', name: 'Australia', number: '000', dialNumber: '000' },
  { code: 'AT', name: 'Austria', number: '112', dialNumber: '112' },
  { code: 'BD', name: 'Bangladesh', number: '999', dialNumber: '999' },
  { code: 'BE', name: 'Belgium', number: '112', dialNumber: '112' },
  { code: 'BR', name: 'Brazil', number: '190 / 192 / 193', dialNumber: '192', note: 'Police / ambulance / fire' },
  { code: 'CA', name: 'Canada', number: '911', dialNumber: '911' },
  { code: 'CN', name: 'China', number: '110 / 120 / 119', dialNumber: '120', note: 'Police / ambulance / fire' },
  { code: 'FR', name: 'France', number: '112', dialNumber: '112' },
  { code: 'DE', name: 'Germany', number: '112', dialNumber: '112' },
  { code: 'IN', name: 'India', number: '112', dialNumber: '112' },
  { code: 'ID', name: 'Indonesia', number: '112', dialNumber: '112', note: 'Availability can vary by region' },
  { code: 'IE', name: 'Ireland', number: '112 / 999', dialNumber: '112' },
  { code: 'IT', name: 'Italy', number: '112', dialNumber: '112' },
  { code: 'JP', name: 'Japan', number: '119', dialNumber: '119', note: 'Ambulance / fire; police is 110' },
  { code: 'MY', name: 'Malaysia', number: '999', dialNumber: '999' },
  { code: 'MX', name: 'Mexico', number: '911', dialNumber: '911' },
  { code: 'NL', name: 'Netherlands', number: '112', dialNumber: '112' },
  { code: 'NZ', name: 'New Zealand', number: '111', dialNumber: '111' },
  { code: 'PK', name: 'Pakistan', number: '1122', dialNumber: '1122', note: 'Rescue / ambulance' },
  { code: 'PT', name: 'Portugal', number: '112', dialNumber: '112' },
  { code: 'SG', name: 'Singapore', number: '995 / 999', dialNumber: '995', note: 'Ambulance / police' },
  { code: 'ZA', name: 'South Africa', number: '112', dialNumber: '112', note: 'From a mobile phone' },
  { code: 'KR', name: 'South Korea', number: '119', dialNumber: '119', note: 'Ambulance / fire; police is 112' },
  { code: 'ES', name: 'Spain', number: '112', dialNumber: '112' },
  { code: 'SE', name: 'Sweden', number: '112', dialNumber: '112' },
  { code: 'CH', name: 'Switzerland', number: '112', dialNumber: '112' },
  { code: 'AE', name: 'United Arab Emirates', number: '998 / 999', dialNumber: '998', note: 'Ambulance / police' },
  { code: 'GB', name: 'United Kingdom', number: '999 / 112', dialNumber: '999' },
  { code: 'US', name: 'United States', number: '911', dialNumber: '911' },
  { code: 'ZZ', name: 'Other / international', number: '112', dialNumber: '112', note: 'Use 112 only where supported; check local guidance' },
]

export const DEFAULT_EMERGENCY_COUNTRY = 'ZZ'
const STORAGE_KEY = 'kynthai:emergency-country'

export function getEmergencyCountry(code: string): EmergencyCountry {
  return EMERGENCY_COUNTRIES.find(country => country.code === code)
    ?? EMERGENCY_COUNTRIES.find(country => country.code === DEFAULT_EMERGENCY_COUNTRY)!
}

export function getStoredEmergencyCountry(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const code = window.localStorage.getItem(STORAGE_KEY)
    return code && EMERGENCY_COUNTRIES.some(country => country.code === code) ? code : null
  } catch {
    return null
  }
}

export function detectEmergencyCountry(): string {
  if (typeof navigator === 'undefined') return DEFAULT_EMERGENCY_COUNTRY
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const timezoneCountry: Array<[string, string]> = [
    ['Australia/', 'AU'], ['Pacific/Auckland', 'NZ'], ['Asia/Kolkata', 'IN'],
    ['Asia/Calcutta', 'IN'], ['Asia/Tokyo', 'JP'], ['Asia/Seoul', 'KR'],
    ['Asia/Singapore', 'SG'], ['Asia/Kuala_Lumpur', 'MY'], ['Asia/Dhaka', 'BD'],
    ['Asia/Karachi', 'PK'], ['Asia/Dubai', 'AE'], ['America/Toronto', 'CA'],
    ['America/Vancouver', 'CA'], ['America/Edmonton', 'CA'], ['America/Winnipeg', 'CA'],
    ['America/Halifax', 'CA'], ['America/St_Johns', 'CA'], ['America/', 'US'],
    ['Europe/London', 'GB'], ['Europe/Dublin', 'IE'], ['Europe/', 'ZZ'],
  ]
  const byTimezone = timezoneCountry.find(([prefix]) => timezone.startsWith(prefix))
  if (byTimezone) return byTimezone[1]
  const region = (navigator.language || '').split('-')[1]?.toUpperCase()
  if (region && EMERGENCY_COUNTRIES.some(country => country.code === region)) return region
  return DEFAULT_EMERGENCY_COUNTRY
}

export function setStoredEmergencyCountry(code: string): void {
  if (typeof window === 'undefined' || !EMERGENCY_COUNTRIES.some(country => country.code === code)) return
  try {
    window.localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Storage can be unavailable in private browsing; in-memory state still works.
  }
}
