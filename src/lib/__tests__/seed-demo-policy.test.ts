import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSeedDemoDisabled, seedDemoResponseBody } from '@/lib/seed-demo-policy'

describe('seed-demo policy (KYN-HIGH-005)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('disables seed in production unless ALLOW_SEED_DEMO=true', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_SEED_DEMO', '')
    expect(isSeedDemoDisabled()).toBe(true)
    vi.stubEnv('ALLOW_SEED_DEMO', 'true')
    expect(isSeedDemoDisabled()).toBe(false)
  })

  it('never returns password material in response body', () => {
    const body = seedDemoResponseBody(2, [{ email: 'a@test', action: 'updated' }])
    expect(body).not.toHaveProperty('password')
    expect(JSON.stringify(body)).not.toMatch(/Demo@/i)
  })
})
