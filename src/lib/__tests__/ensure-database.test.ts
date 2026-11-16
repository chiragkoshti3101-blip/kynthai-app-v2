import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureDatabase } from '@/lib/api-helpers'

describe('ensureDatabase', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 503 JSON when DATABASE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const res = ensureDatabase()
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
    const body = await res!.json()
    expect(body.code).toBe('DATABASE_UNAVAILABLE')
  })

  it('returns null when the REST server configuration is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
    expect(ensureDatabase()).toBeNull()
  })
})
