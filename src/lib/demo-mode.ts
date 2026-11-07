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
  // The auto "Try the demo" sign-in logs into a seeded account with a known
  // password. On a real production deployment this is an unnecessary
  // known-credential entry, so it is OFF by default in production and can be
  // re-enabled only with an explicit opt-in (NEXT_PUBLIC_ENABLE_DEMO_LOGIN).
  const explicit = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN
  if (explicit === 'true') return true
  if (explicit === 'false') return false
  // Hydration-safe: this is called from client components, so we must only
  // read values that Next.js inlines into the client bundle. NODE_ENV and
  // NEXT_PUBLIC_* are inlined on both server and client, so they stay
  // consistent (no React #418 mismatch). VERCEL_ENV is NOT inlined client-side
  // (it's undefined in the browser), so relying on it would desync SSR/client.
  return process.env.NODE_ENV !== 'production'
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
