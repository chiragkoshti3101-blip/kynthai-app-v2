/** Explicit, fail-closed opt-in. DATABASE_URL alone never selects Prisma. */
export function isCiFixture(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DATABASE_BACKEND !== 'ci-prisma') return false
  const fail = () => { throw new Error('Unsafe CI database fixture configuration') }
  if (env.CI !== 'true' || env.VERCEL || env.VERCEL_ENV || env.K_SERVICE || env.RENDER) fail()
  if (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY) fail()
  if (!/^[a-f0-9]{64}$/i.test(env.ENCRYPTION_KEY || '') || env.ENCRYPTION_TRANSITIONAL !== 'false') fail()
  if (!env.E2E_FIXTURE_PASSWORD || env.E2E_FIXTURE_PASSWORD.length < 32 || env.E2E_FIXTURE_PASSWORD === 'Demo@2024') fail()
  const url = new URL(env.DATABASE_URL || 'invalid:')
  // Only literal loopback or the CI Docker bridge range; never DNS/prod hosts.
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/test' ||
      !/^(127\.0\.0\.1|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(url.hostname)) fail()
  if (env.DIRECT_URL && env.DIRECT_URL !== env.DATABASE_URL) fail()
  return true
}
