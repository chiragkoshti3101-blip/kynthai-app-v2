import { describe, expect, it } from 'vitest'
import { isCiFixture } from './ci-fixture'
const safe = {
  DATABASE_BACKEND: 'ci-prisma', CI: 'true', DATABASE_URL: 'postgresql://postgres:postgres@172.18.0.2:5432/test',
  ENCRYPTION_KEY: 'a'.repeat(64), ENCRYPTION_TRANSITIONAL: 'false', E2E_FIXTURE_PASSWORD: 'b'.repeat(64),
}
describe('CI backend isolation', () => {
  it('does not opt in from DATABASE_URL alone', () => {
    expect(isCiFixture({ DATABASE_URL: safe.DATABASE_URL })).toBe(false)
  })
  it('accepts explicit disposable bridge fixture', () => expect(isCiFixture(safe)).toBe(true))
  for (const override of [
    { CI: 'false' }, { VERCEL: '1' }, { VERCEL_ENV: 'preview' },
    { SUPABASE_SERVICE_ROLE_KEY: 'real-key' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://prod.test' },
    { DATABASE_URL: 'postgresql://postgres:postgres@production.test:5432/test' },
    { DATABASE_URL: 'postgresql://postgres:postgres@172.18.0.2:5432/production' },
    { ENCRYPTION_KEY: '' }, { ENCRYPTION_TRANSITIONAL: 'true' }, { E2E_FIXTURE_PASSWORD: 'Demo@2024' },
    { DIRECT_URL: 'postgresql://prod/db' },
  ]) {
    it(`rejects unsafe ${Object.keys(override)[0]} configuration`, () => {
      expect(() => isCiFixture({ ...safe, ...override })).toThrow('Unsafe CI')
    })
  }
})
