'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getCsrfToken, clearCsrfCache } from '@/lib/client-fetch'
import { runWhenIdle } from '@/components/performance-wrapper'
import { useAppStore, selectors, type AuthUser } from '@/lib/store'

interface AuthGuardProps {
  redirectTo?: string
  onUnauthorized?: () => void
  disableMountCheck?: boolean
}

// Must mirror the public/passthrough sets in portal-client.tsx — any path
// missing here gets the mount-time /api/auth/me check, and unauthenticated
// visitors are bounced to /login (which is why /register, /forgot-password,
// /ccpa, etc. appeared to "redirect to the landing/login page" after hydration).
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/privacy',
  '/terms',
  '/cookies',
  '/accessibility',
  '/medical-disclaimer',
  '/pricing',
  '/checkout',
  '/grievance',
  '/refund-cancellation',
  // Passthrough helper/legal pages — never auth-gated
  '/forgot-password',
  '/reset-password',
  '/ccpa',
  '/patient-rights',
  '/privacy-practices',
  '/feedback',
  '/admin-login',
] as string[]

const PASSTHROUGH_PATHS = [
  '/forgot-password',
  '/reset-password',
  '/ccpa',
  '/grievance',
  '/patient-rights',
  '/privacy-practices',
  '/feedback',
  '/admin-login',
]

const PROTECTED_PATHS = ['/settings', '/dashboard']

const PORTAL_PREFIXES = ['/patient', '/doctor', '/lab', '/caretaker', '/family', '/admin']

/**
 * Strip a single trailing slash (except the bare root "/") so '/terms/' and
 * '/terms' classify identically. Keeps every path-based check consistent —
 * otherwise a trailing-slash variant of a public path would be treated as
 * "unknown" and could trigger the mount-time auth bounce to /login.
 */
function normalizePath(pathname: string): string {
  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

/**
 * True when `pathname` is a real app route (public, passthrough, protected,
 * or a portal subtree). Unknown paths are server-rendered 404 pages and must
 * never run the mount-time auth check — otherwise unauthenticated visitors
 * get bounced to /login instead of seeing the 404 page.
 */
function isKnownAppPath(pathname: string): boolean {
  const p = normalizePath(pathname)
  if (PUBLIC_PATHS.includes(p)) return true
  if (PASSTHROUGH_PATHS.includes(p)) return true
  if (PROTECTED_PATHS.includes(p)) return true
  if (p.startsWith('/family/members/')) return true
  return PORTAL_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'))
}

const isBrowser = () => typeof window !== 'undefined'

export function AuthGuard({ redirectTo = '/login', onUnauthorized, disableMountCheck }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()

  // Use selectors to subscribe only to needed state — avoids re-renders on _hydrated changes
  const login = useAppStore(selectors.login)
  const user = useAppStore(selectors.user)

  const handleUnauthorized = React.useCallback(() => {
    clearCsrfCache()
    try { void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}) } catch { /* ignore */ }
    try {
      localStorage.removeItem('kynthai-store-v2')
    } catch { /* ignore */ }
    onUnauthorized?.()
    router.replace(redirectTo)
  }, [redirectTo, onUnauthorized, router])

  // ── Mount-time session validation ────────────────────────────────────────
  // Checks Supabase session via /api/auth/me and populates Zustand store
  // so the portal renders without requiring a separate login page visit.
  React.useEffect(() => {
    if (disableMountCheck) return
    // Normalize once so trailing-slash variants classify the same as the
    // canonical path (e.g. '/terms/' === '/terms').
    const p = normalizePath(pathname)
    if (PUBLIC_PATHS.includes(p)) return
    // Unknown paths render the server 404 — never auth-bounce them to /login.
    if (!isKnownAppPath(p)) return
    let mounted = true

    const runCheck = async () => {
      if (!mounted) return
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!mounted) return
        const data = await res.json().catch(() => ({}))
        const authenticated = Boolean((data as any)?.authenticated)
        const userData = (data as any)?.user ?? null
        if (!authenticated || !userData) {
          handleUnauthorized()
          return
        }
        // Populate Zustand store if not already set (e.g., direct navigation to /patient)
        if (!user || user.id !== userData.id) {
          const authUser: AuthUser = {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
            phone: userData.phone,
            subscriptionTier: userData.subscriptionTier,
            consentAccepted: userData.consentAccepted,
            dataProcessingConsent: userData.dataProcessingConsent,
            aiTrainingConsent: userData.aiTrainingConsent,
          }
          login(authUser)
        }
        // Best-effort: sync the browser's IANA timezone so the reminder cron
        // fires doses on the user's local wall clock (not New York time).
        // Runs at most once per session; silent on any failure.
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
          const key = 'kynthai_tz_synced'
          if (tz && userData.id && sessionStorage.getItem(key) !== userData.id) {
            const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' })
            const csrf = (await csrfRes.json().catch(() => null))?.token
            if (csrf) {
              const put = await fetch('/api/user/timezone', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'X-CSRF-Token': csrf,
                },
                credentials: 'include',
                body: JSON.stringify({ timezone: tz }),
              })
              if (put.ok) sessionStorage.setItem(key, userData.id)
            }
          }
        } catch {
          /* timezone sync is best-effort only */
        }
      } catch {
        // Network error — ignore; don't bounce the user on flaky connections.
      }
    }

    const cancel = runWhenIdle(runCheck)
    return () => {
      mounted = false
      cancel?.()
    }
  }, [disableMountCheck, handleUnauthorized, pathname, user, login])

  // ─── Fetch interceptor for 401 responses ─────────────────────────────────
  // Wrapping window.fetch is a hot path — defer the monkey-patch until idle
  // so it does NOT run during the initial hydration frame.
  // DISABLED: causes "Rendered more hooks" hydration error in React 19
  // React.useEffect(() => {
  //   if (!isBrowser()) return
  //   let mounted = true
  //   let patched = false
  //
  //   const patchFetch = () => {
  //     if (patched || (window as any).__kynthaiAuthGuard) return
  //     const originalFetch = window.fetch
  //     ;(window as any).__kynthaiFetchOriginal = originalFetch
  //     ;(window as any).__kynthaiAuthGuard = true
  //     patched = true
  //
  //     window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  //       const method = (init?.method ?? 'GET').toUpperCase()
  //       const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  //       const nextInit: RequestInit = isMutation ? { ...(init ?? {}) } : init ?? {}
  //
  //       if (isMutation) {
  //         try {
  //           const token = await getCsrfToken()
  //           if (token) {
  //             const headers = new Headers(nextInit.headers as HeadersInit | undefined)
  //             headers.set('x-csrf-token', token)
  //             nextInit.headers = headers
  //           }
  //         } catch { /* ignore */ }
  //       }
  //
  //       const res = await originalFetch(input, nextInit)
  //       if (mounted) {
  //         try {
  //           const url = typeof input === 'string' ? input : (input as Request).url ?? ''
  //           const isKynthaiApi = url.startsWith('/api/') || url.includes('/api/')
  //           if (isKynthaiApi && res.status === 401) {
  //             if (!PUBLIC_PATHS.includes(pathname)) {
  //               handleUnauthorized()
  //             }
  //           }
  //         } catch { /* ignore */ }
  //       }
  //       return res
  //     }) as typeof window.fetch
  //   }
  //
  //   // Fire the patch during idle so it doesn't add to the TBT window
  //   const cancel = runWhenIdle(patchFetch)
  //   // Pre-fetch CSRF token after idle too
  //   const cancelCsrf = runWhenIdle(() => { void getCsrfToken().catch(() => {}) })
  //
  //   return () => {
  //     mounted = false
  //     if (patched) {
  //       window.fetch = (window as any).__kynthaiFetchOriginal ?? window.fetch
  //       ;(window as any).__kynthaiAuthGuard = false
  //       patched = false
  //     }
  //     cancel?.()
  //     cancelCsrf?.()
  //   }
  // }, [handleUnauthorized, pathname])

  return null
}
