'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { MotionConfig } from 'framer-motion'
import { ServiceWorkerRegister } from '@/components/service-worker-register'
import { AutoEnableNotifications } from '@/components/kynthai/auto-enable-notifications'
import { AuthGuard } from '@/components/kynthai/auth-guard'
import { Toaster } from '@/components/ui/toaster'
import { CookieConsent, hasConsented } from '@/components/kynthai/cookie-consent'
import { runWhenIdle } from '@/components/performance-wrapper'
import { useEffect, useState } from 'react'
import { GlobalErrorCatcher } from '@/components/kynthai/global-error-catcher'
import { initConsentAwareTelemetry } from '@/lib/analytics-consent'

function DeferredAuthGuard() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id =
      typeof window !== 'undefined' && (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(() => setReady(true), { timeout: 200 })
        : setTimeout(() => setReady(true), 50)
    return () => {
      if (typeof id === 'number') {
        if (typeof window !== 'undefined' && (window as any).cancelIdleCallback) {
          ;(window as any).cancelIdleCallback(id)
        } else {
          clearTimeout(id)
        }
      }
    }
  }, [])
  // Render AuthGuard with disableMountCheck on server to avoid hydration mismatch
  return <AuthGuard disableMountCheck={!ready} />
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    /* `reducedMotion="user"` makes every Framer Motion transform/layout
       animation app-wide respect prefers-reduced-motion (opacity still
       animates). Single source of truth for the motion a11y contract. */
    <MotionConfig reducedMotion="user">
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <GlobalErrorCatcher />
      <ServiceWorkerRegister />
      <AutoEnableNotifications />
      <DeferredAuthGuard />
      {children}
      <CookieConsent />
      <TelemetryBootstrap />
      <Toaster />
    </ThemeProvider>
    </MotionConfig>
  )
}

function TelemetryBootstrap() {
  useEffect(() => {
    if (hasConsented()) {
      initConsentAwareTelemetry()
      return
    }

    const onChange = () => {
      if (hasConsented()) {
        initConsentAwareTelemetry()
      }
    }

    window.addEventListener('kynthai-consent-change', onChange)
    return () => window.removeEventListener('kynthai-consent-change', onChange)
  }, [])

  return null
}
