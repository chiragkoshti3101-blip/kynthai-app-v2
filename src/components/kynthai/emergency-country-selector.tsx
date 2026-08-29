'use client'

import * as React from 'react'
import { Globe2, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getEmergencyCountryFromPhone } from '@/lib/emergency'

/**
 * SOS routing is derived from the signed-in account phone number. There is no
 * country selector here: users choose their country only indirectly by giving
 * the phone number required during account creation.
 */
export function useEmergencyCountry(phone?: string | null) {
  const [country, setCountry] = React.useState(() => getEmergencyCountryFromPhone(phone))

  React.useEffect(() => {
    setCountry(getEmergencyCountryFromPhone(phone))
  }, [phone])

  return { country }
}

export function EmergencyNumberCard({ phone, className }: { phone?: string | null; className?: string }) {
  const { country } = useEmergencyCountry(phone)

  return (
    <div className={cn('rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-left', className)}>
      <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Globe2 className="h-4 w-4 text-rose-600" />
        Emergency number for your account
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
        <span>
          Automatically set from your sign-in phone number:{' '}
          <a href={`tel:${country.dialNumber}`} className="font-semibold text-foreground underline underline-offset-2">
            {country.number}
          </a>
          {country.note ? ` — ${country.note}` : ''}
        </span>
      </p>
    </div>
  )
}
