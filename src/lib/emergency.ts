export type EmergencyCountry = {
  code: string
  name: string
  number: string
  dialNumber: string
  callingCode: string
  note?: string
}

// Curated from national emergency services and ITU E.129 references.
// `callingCode` lets the account phone number determine the emergency route;
// the browser locale is never used for SOS routing.
export const EMERGENCY_COUNTRIES: EmergencyCountry[] = [
  { code: 'AR', name: 'Argentina', number: '911', dialNumber: '911', callingCode: '+54' },
  { code: 'AU', name: 'Australia', number: '000', dialNumber: '000', callingCode: '+61' },
  { code: 'AT', name: 'Austria', number: '112', dialNumber: '112', callingCode: '+43' },
  { code: 'BD', name: 'Bangladesh', number: '999', dialNumber: '999', callingCode: '+880' },
  { code: 'BE', name: 'Belgium', number: '112', dialNumber: '112', callingCode: '+32' },
  { code: 'BR', name: 'Brazil', number: '190 / 192 / 193', dialNumber: '192', callingCode: '+55', note: 'Police / ambulance / fire' },
  { code: 'CA', name: 'Canada', number: '911', dialNumber: '911', callingCode: '+1' },
  { code: 'CN', name: 'China', number: '110 / 120 / 119', dialNumber: '120', callingCode: '+86', note: 'Police / ambulance / fire' },
  { code: 'FR', name: 'France', number: '112', dialNumber: '112', callingCode: '+33' },
  { code: 'DE', name: 'Germany', number: '112', dialNumber: '112', callingCode: '+49' },
  { code: 'IN', name: 'India', number: '112', dialNumber: '112', callingCode: '+91' },
  { code: 'ID', name: 'Indonesia', number: '112', dialNumber: '112', callingCode: '+62', note: 'Availability can vary by region' },
  { code: 'IE', name: 'Ireland', number: '112 / 999', dialNumber: '112', callingCode: '+353' },
  { code: 'IT', name: 'Italy', number: '112', dialNumber: '112', callingCode: '+39' },
  { code: 'JP', name: 'Japan', number: '119', dialNumber: '119', callingCode: '+81', note: 'Ambulance / fire; police is 110' },
  { code: 'MY', name: 'Malaysia', number: '999', dialNumber: '999', callingCode: '+60' },
  { code: 'MX', name: 'Mexico', number: '911', dialNumber: '911', callingCode: '+52' },
  { code: 'NL', name: 'Netherlands', number: '112', dialNumber: '112', callingCode: '+31' },
  { code: 'NZ', name: 'New Zealand', number: '111', dialNumber: '111', callingCode: '+64' },
  { code: 'PK', name: 'Pakistan', number: '1122', dialNumber: '1122', callingCode: '+92', note: 'Rescue / ambulance' },
  { code: 'PT', name: 'Portugal', number: '112', dialNumber: '112', callingCode: '+351' },
  { code: 'SG', name: 'Singapore', number: '995 / 999', dialNumber: '995', callingCode: '+65', note: 'Ambulance / police' },
  { code: 'ZA', name: 'South Africa', number: '112', dialNumber: '112', callingCode: '+27', note: 'From a mobile phone' },
  { code: 'KR', name: 'South Korea', number: '119', dialNumber: '119', callingCode: '+82', note: 'Ambulance / fire; police is 112' },
  { code: 'ES', name: 'Spain', number: '112', dialNumber: '112', callingCode: '+34' },
  { code: 'SE', name: 'Sweden', number: '112', dialNumber: '112', callingCode: '+46' },
  { code: 'CH', name: 'Switzerland', number: '112', dialNumber: '112', callingCode: '+41' },
  { code: 'AE', name: 'United Arab Emirates', number: '998 / 999', dialNumber: '998', callingCode: '+971', note: 'Ambulance / police' },
  { code: 'GB', name: 'United Kingdom', number: '999 / 112', dialNumber: '999', callingCode: '+44' },
  { code: 'US', name: 'United States', number: '911', dialNumber: '911', callingCode: '+1' },
  { code: 'ZZ', name: 'Unknown / international', number: 'Local emergency number', dialNumber: '', callingCode: '', note: 'Country-specific number unavailable; verify local guidance before calling' },
]

export const DEFAULT_EMERGENCY_COUNTRY = 'ZZ'

export function getEmergencyCountry(code: string): EmergencyCountry {
  return EMERGENCY_COUNTRIES.find(country => country.code === code)
    ?? EMERGENCY_COUNTRIES.find(country => country.code === DEFAULT_EMERGENCY_COUNTRY)!
}

/**
 * Derive the emergency route from the phone captured at account creation.
 * Formatting characters are ignored. Shared calling code +1 defaults to the
 * US entry because an area-code-level country distinction is not reliable
 * without a separate numbering-plan database; both countries use 911.
 */
export function getEmergencyCountryFromPhone(phone?: string | null): EmergencyCountry {
  const normalized = String(phone ?? '').replace(/[^\d+]/g, '')
  if (!normalized.startsWith('+')) return getEmergencyCountry(DEFAULT_EMERGENCY_COUNTRY)

  const matches = EMERGENCY_COUNTRIES
    .filter(country => country.callingCode && normalized.startsWith(country.callingCode))
    .sort((a, b) => b.callingCode.length - a.callingCode.length)

  if (matches.length === 0) return getEmergencyCountry(DEFAULT_EMERGENCY_COUNTRY)
  if (normalized.startsWith('+1')) return getEmergencyCountry('US')
  return matches[0]!
}
