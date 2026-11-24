'use client'

/**
 * landing-route.tsx
 *
 * The `/` route's interactive landing.
 *
 * The server page (app/page.tsx) renders this so the marketing page arrives in
 * the very first HTML byte. Previously `PortalClient` rendered a compact SEO
 * fallback as `children` on the server and replaced it with this component
 * after hydration — a swap from ~1.8k px to ~11k px that moved the hero 190 px
 * down and made the whole landing appear to re-render on slower devices.
 *
 * Behaviour that used to live in PortalClient's landing branch is kept here:
 * signed-in visitors are sent to their portal instead of the marketing page.
 */

import { useRouter } from 'next/navigation'
import { LandingPage } from '@/components/kynthai/landing-page'
import { AppLoader } from '@/components/kynthai/app-loader'
import { useAppStore, selectors, type LoginPortal } from '@/lib/store'

const PORTAL_BY_ROLE: Record<string, string> = {
  caretaker: 'caretaker',
  family: 'caretaker',
  patient: 'patient',
  doctor: 'doctor',
  lab: 'lab',
  admin: 'admin',
}

export function LandingRoute() {
  const router = useRouter()
  const user = useAppStore(selectors.user)
  const hydrated = useAppStore(selectors._hydrated)
  const currency = useAppStore(selectors.currency)
  const setLoginPortal = useAppStore((s) => s.setLoginPortal)

  // `hydrated` keeps the first client render identical to the server render
  // (the persisted user is only known after rehydration), then redirects.
  if (hydrated && user) {
    router.replace('/' + (PORTAL_BY_ROLE[user.role] ?? 'caretaker'))
    return <AppLoader label="Opening your portal…" />
  }

  return (
    <LandingPage
      onGetStarted={(type?: string) => {
        setLoginPortal((type ?? 'caretaker') as LoginPortal)
        router.push('/login/')
      }}
      onPickPortal={(portal: LoginPortal) => {
        setLoginPortal(portal)
        router.push('/login/')
      }}
      currency={currency}
    />
  )
}
