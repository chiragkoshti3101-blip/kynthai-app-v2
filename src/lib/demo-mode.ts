/**
 * Demo mode must never activate in production builds.
 * NEXT_PUBLIC_ENABLE_DEMO is inlined at build time — even if someone sets it
 * true on Vercel production, NODE_ENV==='production' forces this off.
 */
export function isDemoEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (process.env.VERCEL_ENV === 'production') return false
  return process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true'
}

/**
 * Explicit demo sign-in is safe to expose in production because it performs a
 * normal, authenticated login against the seeded read-only account. Keep this
 * separate from isDemoEnabled(): that flag also controls the development-only
 * unauthenticated portal bypass used by local previews and middleware.
 */
export function isDemoLoginEnabled(): boolean {
  return true
}

/**
 * True for an explicitly flagged demo account or one of the seeded demo
 * identities. Never infer demo mode from an email domain: real providers,
 * staff, or customers may use a Kynthai-owned address.
 */
const SEEDED_DEMO_EMAILS = new Set([
  'patient@kynthai.app',
  'patient@demo.kynthai.app',
  'caretaker@kynthai.app',
  'caretaker@demo.kynthai.app',
  'doctor@kynthai.app',
  'priya@demo.kynthai.app',
  'lab@kynthai.app',
  'pathlabs@demo.kynthai.app',
  'admin@kynthai.app',
  'admin@demo.kynthai.app',
])

export function isDemoUser(user?: { isDemo?: boolean; email?: string | null } | null): boolean {
  if (!user) return false
  if (user.isDemo === true) return true
  return SEEDED_DEMO_EMAILS.has((user.email || '').trim().toLowerCase())
}
