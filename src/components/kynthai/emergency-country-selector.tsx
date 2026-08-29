'use client'

import * as React from 'react'
import { detectEmergencyCountry, getEmergencyCountryFromPhone } from '@/lib/emergency'

export function useEmergencyCountry(phone?: string | null) {
  const [country, setCountry] = React.useState(() => getEmergencyCountryFromPhone(phone))

  React.useEffect(() => {
    const detected = phone ? getEmergencyCountryFromPhone(phone) : detectEmergencyCountry()
    setCountry(detected)
  }, [phone])

  return { country }
}
