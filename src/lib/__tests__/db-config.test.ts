import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDatabaseConfigured } from '@/lib/db'

describe('database configuration', () => {
  const original = process.env.DATABASE_URL

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = original
    }
    vi.resetModules()
  })

  it('isDatabaseConfigured is false when DATABASE_URL is unset', () => {
    delete process.env.DATABASE_URL
    expect(isDatabaseConfigured()).toBe(false)
  })

  it('isDatabaseConfigured accepts file: and postgresql:// URLs', () => {
    process.env.DATABASE_URL = 'file:./dev.db'
    expect(isDatabaseConfigured()).toBe(true)
    process.env.DATABASE_URL = 'postgresql://localhost:5432/kynthai'
    expect(isDatabaseConfigured()).toBe(true)
  })

  it('db accessor throws DatabaseNotConfiguredError instead of TypeError', async () => {
    delete process.env.DATABASE_URL
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
