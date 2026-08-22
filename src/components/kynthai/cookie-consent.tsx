/**
 * CookieConsent — US privacy compliance banner (CCPA/CPRA + US privacy).
 *
 * Shows on first visit, asks for consent before setting non-essential
 * cookies. Stores the user's choice in localStorage for 12 months.
 *
 * CALIFORNIA CONSUMER RIGHTS: California residents have the right to opt
 * out of the sale or sharing of personal information under CCPA/CPRA.
 * Health data is treated as Protected Health Information (sensitive health data) under
 * US privacy and the HITECH Act, which impose heightened security safeguards.
 *
 * FLOW: "Accept all" is explicit opt-in (enables analytics/marketing
 * cookies). "Essential only" opts the user out of non-essential cookies.
 * "Manage" opens the cookie preferences page. The close/dismiss button
 * acts as a rejection (essential only).
 *
 * Essential cookies (authentication, session, preferences) are always
 * active because they are strictly necessary for the service to function.
 * All non-essential cookies and scripts are gated on hasConsented().
 */

'use client'

import * as React from 'react'
import { Cookie, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import { usePathname, useRouter } from 'next/navigation'

const CONSENT_KEY = 'kynthai-cookie-consent-v1'
const CONSENT_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000 // 12 months

// Public routes where a cookie banner would obscure essential UX.
const PUBLIC_PATHS = ['/login', '/register', '/pricing', '/checkout', '/privacy', '/terms', '/cookies', '/accessibility', '/medical-disclaimer', '/grievance', '/refund-cancellation', '/forgot-password', '/reset-password']

interface ConsentRecord {
  accepted: boolean
  timestamp: number
}

function getStoredConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const parsed: ConsentRecord = JSON.parse(raw)
    if (Date.now() - parsed.timestamp > CONSENT_EXPIRY_MS) {
      localStorage.removeItem(CONSENT_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function setStoredConsent(accepted: boolean) {
  if (typeof window === 'undefined') return
  const record: ConsentRecord = { accepted, timestamp: Date.now() }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(record))
  window.dispatchEvent(new CustomEvent('kynthai-consent-change', { detail: { accepted } }))
}

/**
 * hasConsented — call this before loading any non-essential (analytics,
 * marketing, advertising) cookies or scripts.
 * Returns true only for accepted=true AND non-expired consent.
 *
 *   if (hasConsented()) { initAnalytics() }
 */
export function hasConsented(): boolean {
  if (typeof window === 'undefined') return false
  const stored = getStoredConsent()
  return stored?.accepted ?? false
}

/**
 * COMPLIANCE: denyNonEssentialCookies — purge any non-essential cookies
 * that may have been set without consent or after explicit rejection.
 */
export function denyNonEssentialCookies(): void {
  if (typeof window === 'undefined') return
  const nonEssentialNames = [
    '_ga', '_gid', '_gat', '_gtag_*',
    'fbp', 'fbc',
    'ads_prefs',
    'li_sugr', 'liap',
  ]
  for (const name of nonEssentialNames) {
    const prefix = name.replace('*', '')
    document.cookie.split(';').forEach((c) => {
      const cookieName = c.split('=')[0]?.trim() ?? ''
      if (cookieName === prefix || (name.endsWith('*') && cookieName.startsWith(prefix))) {
        document.cookie = cookieName + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
        document.cookie = cookieName + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + window.location.hostname
      }
    })
  }
}

export function clearCookieConsent() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CONSENT_KEY)
  denyNonEssentialCookies()
}

export function CookieConsent() {
  const pathname = usePathname()
  const { setScreen } = useAppStore()
  const router = useRouter()
  const [visible, setVisible] = React.useState(false)

  // Suppress the banner while the first-run onboarding flow is on screen:
  // a signed-in user who hasn't completed onboarding sees the Welcome/role
  // flow instead of the portal, and the banner would obscure it.
  const user = useAppStore((s) => s.user)
  const onboardingComplete = useAppStore((s) => s.onboardingComplete)

  // Don't show the cookie banner on public utility pages — it would obscure
  // essential page content (login form, legal pages, pricing, etc.).
  React.useEffect(() => {
    const stored = getStoredConsent()
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
    const inOnboarding = !!user && !onboardingComplete
    if (!stored && !isPublic && !inOnboarding) {
      const timer = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(timer)
    }
    setVisible(false)
    if (stored && !stored.accepted) {
      denyNonEssentialCookies()
    }
    return undefined;
  }, [pathname])

  function accept() {
    setStoredConsent(true)
    setVisible(false)
  }

  function reject() {
    denyNonEssentialCookies()
    setStoredConsent(false)
    setVisible(false)
  }

  function manage() {
    clearCookieConsent()
    setVisible(false)
    router.push('/cookies')
  }

  if (!visible) return null

  const isPortal = /^\/(patient|doctor|lab|caretaker|family|admin)(\/|$)/.test(pathname || '')

  return (
    <div
      className={
        isPortal
          ? 'fixed inset-x-0 z-40 p-3 sm:p-6 animate-in slide-in-from-bottom-4 duration-300 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]'
          : 'fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-6 animate-in slide-in-from-bottom-4 duration-300'
      }
    >
      <Card className="mx-auto max-w-3xl border-emerald-500/30 shadow-2xl">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Cookie className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-6">We use cookies</h3>
                <button
                  onClick={reject}
                  className="shrink-0 -mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Essential cookies keep Kynthai working. With your consent we
                use analytics cookies. See our{' '}
                <button
                  onClick={() => {
                    setVisible(false)
                    router.push('/privacy')
                  }}
                  className="rounded-md px-1 -mx-1 py-2 -my-2 font-medium text-emerald-600 underline"
                >
                  Privacy Policy
                </button>{' '}
                for your CCPA/CPRA rights.
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <Button
                  onClick={accept}
                  className="col-span-2 h-11 min-h-11 w-full text-xs sm:col-span-1 sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                >
                  Accept all
                </Button>
                <Button
                  variant="outline"
                  onClick={reject}
                  className="h-11 min-h-11 w-full text-xs sm:text-sm"
                >
                  Essential only
                </Button>
                <Button
                  variant="ghost"
                  onClick={manage}
                  className="h-11 min-h-11 w-full text-xs sm:text-sm"
                >
                  Manage
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
