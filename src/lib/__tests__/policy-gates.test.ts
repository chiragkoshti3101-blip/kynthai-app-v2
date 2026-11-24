import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSeedDemoDisabled } from '@/lib/seed-demo-policy'
import { t } from '@/lib/i18n'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSeedDemoDisabled', () => {
  it('is disabled in production by default', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_SEED_DEMO', '')
    expect(isSeedDemoDisabled()).toBe(true)
  })

  it('can be explicitly allowed in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_SEED_DEMO', 'true')
    expect(isSeedDemoDisabled()).toBe(false)
  })

  it('is allowed outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ALLOW_SEED_DEMO', '')
    expect(isSeedDemoDisabled()).toBe(false)
  })
})

describe('i18n', () => {
  it('returns the key itself when a translation is missing', () => {
    expect(t('__definitely_missing_key__')).toBe('__definitely_missing_key__')
  })
})
