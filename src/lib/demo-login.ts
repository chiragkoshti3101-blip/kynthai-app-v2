'use client'

import { useAppStore } from '@/lib/store'

/**
 * runDemoLogin — perform a real demo sign-in (Supabase session + store user)
 * for a given role. Shared by the login page's "Try the demo" button AND the
 * /login?demo=1 auto-login effect so the demo flow is one consistent action
 * with no duplicate/reload dance.
 *
 * Returns true on success (the session cookie + persisted store user are set),
 * false on any failure so callers can fall back to the sign-in form.
 */
export type DemoRole = 'patient' | 'doctor' | 'caretaker' | 'lab' | 'admin'

const DEMO_ACCOUNTS: Record<DemoRole, string> = {
  patient: 'patient@kynthai.app',
  doctor: 'doctor@kynthai.app',
  caretaker: 'caretaker@kynthai.app',
  lab: 'lab@kynthai.app',
  admin: 'admin@kynthai.app',
}

export const DEMO_ROLES: DemoRole[] = ['patient', 'doctor', 'caretaker', 'lab', 'admin']

export async function runDemoLogin(role: DemoRole): Promise<boolean> {
  const email = DEMO_ACCOUNTS[role]
  if (!email) return false
  try {
    // 1. CSRF token (sets the kynthai-csrf cookie + returns the token)
    const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' })
    const { token: csrf } = await csrfRes.json()
    if (!csrf) return false

    // 2. Real sign-in — sets the kynthai-session cookie on success
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        email,
        password: 'Demo@2024',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })
    if (!res.ok) return false

    // 3. Source the full profile (incl. consent flags) from /me and persist it
    //    so the portal renders directly on the hard reload (no ConsentGate).
    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'include' })
      if (meRes.ok) {
        const me = await meRes.json()
        if (me?.user) {
          me.user.isDemo = true
          useAppStore.getState().login(me.user)
        }
      }
    } catch { /* portal clients self-recover via /me */ }

    // 4. Demo accounts are pre-seeded & pre-consented — skip onboarding.
    useAppStore.getState().completeOnboarding(role)
    return true
  } catch {
    return false
  }
}

/** The URL segment for a demo role (matches the top-level portal routes). */
export function demoRolePath(role: DemoRole): string {
  return `/${role}`
}
