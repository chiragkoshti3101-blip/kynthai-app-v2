'use client'

import { installFetchTimeout } from '@/lib/fetch-timeout'
import { installGlobalCsrf } from '@/lib/client-fetch'

// App-wide: every page (including /login) gets CSRF + sane fetch timeouts
if (typeof window !== 'undefined') {
  installGlobalCsrf()
  installFetchTimeout()
}


import { ThemeProvider } from '@/components/theme-provider'
import { MotionConfig } from 'framer-motion'
import { ServiceWorkerRegister } from '@/components/service-worker-register'
import { bootstrapNativeShell } from '@/lib/native-shell-bootstrap'
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

function BootSplashCleanup() {
  // The splash is raw HTML inside a React-owned shell (layout.tsx) so React's
  // className rewrites cannot re-opaque it during hydration. The inline
  // pre-paint script fades it once the theme class has settled (never reveal
  // the page while next-themes has no theme applied). Drop the shell after the
  // fade finishes — removing it mid-transition is itself a visible pop — and
  // force the fade if the inline script never got there.
  useEffect(() => {
    const shell = document.getElementById('kynthai-boot-shell')
    if (!shell) return
    const boot = document.getElementById('kynthai-boot')
    const started = Date.now()
    let cancelled = false
    let timer = 0
    const finish = () => {
      boot?.classList.add('done')
      timer = window.setTimeout(() => shell.remove(), 260)
    }
    const tick = () => {
      if (cancelled) return
      if (boot?.classList.contains('done') || Date.now() - started > 1600) {
        finish()
        return
      }
      timer = window.setTimeout(tick, 60)
    }
    tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    /* `reducedMotion="user"` makes every Framer Motion transform/layout
       animation app-wide respect prefers-reduced-motion (opacity still
       animates). Single source of truth for the motion a11y contract. */
    <MotionConfig reducedMotion="user">
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <BootSplashCleanup />
      <GlobalErrorCatcher />
      <ServiceWorkerRegister />
      <NativeShellBootstrap />
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


function NativeShellBootstrap() {
  useEffect(() => {
    void bootstrapNativeShell()
  }, [])
  return null
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
