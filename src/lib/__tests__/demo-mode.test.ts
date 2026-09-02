import { describe, expect, it } from 'vitest'
import { isDemoUser } from '../demo-mode'

describe('isDemoUser', () => {
  it('recognizes seeded demo identities', () => {
    expect(isDemoUser({ email: 'doctor@kynthai.app' })).toBe(true)
    expect(isDemoUser({ email: 'priya@demo.kynthai.app' })).toBe(true)
  })

  it('does not classify every Kynthai-domain customer as demo', () => {
    expect(isDemoUser({ email: 'real.doctor@kynthai.app' })).toBe(false)
    expect(isDemoUser({ email: 'clinic@demo.kynthai.app' })).toBe(false)
  })

  it('honors an explicit demo flag for any seeded test identity', () => {
    expect(isDemoUser({ email: 'qa@example.test', isDemo: true })).toBe(true)
    expect(isDemoUser({ email: 'doctor@kynthai.app', isDemo: false })).toBe(true)
  })
})
