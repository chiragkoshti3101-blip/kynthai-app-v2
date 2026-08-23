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

/** True for seeded demo accounts (patient@kynthai.app, etc.) even in production. */
export function isDemoUser(user?: { isDemo?: boolean; email?: string | null } | null): boolean {
  if (!user) return false
  if (user.isDemo) return true
  const email = (user.email || '').toLowerCase()
  return email.endsWith('@kynthai.app') || email.endsWith('@demo.kynthai.app')
}
