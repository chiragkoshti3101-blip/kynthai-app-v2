'use client'

import * as React from 'react'
import { Globe2, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_EMERGENCY_COUNTRY,
  detectEmergencyCountry,
  EMERGENCY_COUNTRIES,
  getEmergencyCountry,
  getStoredEmergencyCountry,
  setStoredEmergencyCountry,
} from '@/lib/emergency'

export function useEmergencyCountry() {
  const [countryCode, setCountryCode] = React.useState(DEFAULT_EMERGENCY_COUNTRY)

  React.useEffect(() => {
    setCountryCode(getStoredEmergencyCountry() ?? detectEmergencyCountry())
    const handleCountryChange = (event: Event) => {
      const code = (event as CustomEvent<string>).detail
      if (typeof code === 'string') setCountryCode(code)
    }
    window.addEventListener('kynthai:emergency-country-change', handleCountryChange)
    return () => window.removeEventListener('kynthai:emergency-country-change', handleCountryChange)
  }, [])

  const selectCountry = React.useCallback((code: string) => {
    setCountryCode(code)
    setStoredEmergencyCountry(code)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kynthai:emergency-country-change', { detail: code }))
    }
  }, [])

  return {
    countryCode,
    country: getEmergencyCountry(countryCode),
    selectCountry,
  }
}

export function EmergencyCountrySelector({
  countryCode,
  onChange,
  className,
}: {
  countryCode: string
  onChange: (code: string) => void
  className?: string
}) {
  const country = getEmergencyCountry(countryCode)

  return (
    <div className={cn('rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-left', className)}>
      <label htmlFor="emergency-country" className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Globe2 className="h-4 w-4 text-rose-600" />
        Emergency country
      </label>
      <select
        id="emergency-country"
        value={countryCode}
        onChange={event => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        aria-describedby="emergency-country-help"
      >
        {EMERGENCY_COUNTRIES.map(option => (
          <option key={option.code} value={option.code}>{option.name}</option>
        ))}
      </select>
      <p id="emergency-country-help" className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
        <span>Emergency number: <a href={`tel:${country.dialNumber}`} className="font-semibold text-foreground underline underline-offset-2">{country.number}</a>{country.note ? ` — ${country.note}` : ''}</span>
      </p>
    </div>
  )
}
