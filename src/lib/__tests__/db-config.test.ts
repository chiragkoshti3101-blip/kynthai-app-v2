import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDatabaseConfigured } from '@/lib/db'

describe('database configuration', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('isDatabaseConfigured is false when server configuration is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(isDatabaseConfigured()).toBe(false)
  })

  it('requires an HTTPS REST endpoint and server credential, not DATABASE_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-test-key')
    expect(isDatabaseConfigured()).toBe(true)
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(isDatabaseConfigured()).toBe(false)
  })

  it('db accessor throws DatabaseNotConfiguredError instead of TypeError', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.resetModules()
    const { db } = await import('@/lib/db')
    try {
      // Property access on the lazy proxy triggers client initialization.
      const _trigger = db.user
      void _trigger
    } catch (err) {
      expect(err).toMatchObject({
        name: 'DatabaseNotConfiguredError',
        code: 'DATABASE_NOT_CONFIGURED',
      })
      expect(String(err)).not.toMatch(/startsWith/)
      return
    }
    throw new Error('expected db access to throw when DATABASE_URL is unset')
  })
})
