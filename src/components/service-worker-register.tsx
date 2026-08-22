'use client'

/**
 * ServiceWorkerRegister
 *
 * Production-only. Ensures new deploys reach users quickly:
 * - Registers /sw.js?v=<deployVersion> so the SW script itself is cache-busted
 * - Calls registration.update() on load, focus, and visibilitychange
 * - Reloads once when a new SW takes control (controllerchange / SW_ACTIVATED)
 * - Guards against reload loops via sessionStorage
 *
 * Dev is skipped — HMR + SW fight each other.
 */

import * as React from 'react'

const RELOAD_GUARD_KEY = 'kynthai-sw-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

function canReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0')
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
    return true
  } catch {
    return true
  }
}

function safeReload() {
  if (!canReload()) return
  window.location.reload()
}

export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    const pageVersion =
      document.documentElement.dataset.deployVersion || 'local'
    const wasControlled = !!navigator.serviceWorker.controller
    let refreshing = false

    const onControllerChange = () => {
      if (refreshing) return
      if (!wasControlled) return
      refreshing = true
      safeReload()
    }

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_ACTIVATED' && wasControlled) {
        if (refreshing) return
        refreshing = true
        safeReload()
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    navigator.serviceWorker.addEventListener('message', onMessage)

    let registration: ServiceWorkerRegistration | null = null
    let intervalId: number | undefined

    const checkForUpdate = () => {
      if (!registration) return
      void registration.update().catch(() => {})
    }

    const register = async () => {
      try {
        // Query param forces browsers that cache /sw.js to fetch the new script
        registration = await navigator.serviceWorker.register(
          `/sw.js?v=${encodeURIComponent(pageVersion)}`,
          { scope: '/', updateViaCache: 'none' },
        )

        checkForUpdate()

        // If a waiting worker is already sitting there, activate it now
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration?.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // New worker ready — ask it to skip waiting (also handled in install)
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        // While the app stays open, keep looking for deploys
        intervalId = window.setInterval(checkForUpdate, 60_000)
      } catch (e) {
        console.warn('[sw] registration failed', e)
      }
    }

    // Optional: silent push subscribe when already signed in
    const maybePush = async () => {
      try {
        const authRes = await fetch('/api/auth/me', { credentials: 'include' })
        if (!authRes.ok) return
        const authData = await authRes.json()
        if (!authData?.user) return
        // Only re-sync an already-granted subscription — never prompt on every load
        const { enablePush, pushSupported, permissionState } = await import(
          '@/lib/push'
        )
        if (!pushSupported()) return
        if (permissionState() === 'granted') {
          await enablePush()
        }
      } catch {
        // ignore
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', onVisible)

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(
        () => {
          void register().then(() => void maybePush())
        },
        { timeout: 3000 },
      )
    } else {
      window.setTimeout(() => {
        void register().then(() => void maybePush())
      }, 1200)
    }

    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      )
      navigator.serviceWorker.removeEventListener('message', onMessage)
      window.removeEventListener('focus', checkForUpdate)
      document.removeEventListener('visibilitychange', onVisible)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [])

  return null
}
