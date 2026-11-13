import { afterEach, describe, expect, it } from 'vitest'
import { ensureDatabase } from '@/lib/api-helpers'

describe('ensureDatabase', () => {
  const original = process.env.DATABASE_URL

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = original
    }
  })

  it('returns 503 JSON when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    const res = ensureDatabase()
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
    const body = await res!.json()
    expect(body.code).toBe('DATABASE_UNAVAILABLE')
  })

  it('returns null when DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'file:./dev.db'
    expect(ensureDatabase()).toBeNull()
  })
})
