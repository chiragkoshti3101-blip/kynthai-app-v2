import { describe, it, expect } from 'vitest'
import { resolveDisplayName, resolveInitial } from '../display-name'

describe('resolveDisplayName', () => {
  it('prefers an explicit name', () => {
    expect(
      resolveDisplayName({ name: 'Sarah Johnson', email: 'x@y.z', role: 'patient' }),
    ).toBe('Sarah Johnson')
  })

  it('uses the seeded demo name for a demo account with no name', () => {
    expect(
      resolveDisplayName({ name: null, email: 'patient@kynthai.app', role: 'patient', isDemo: true }),
    ).toBe('Demo Patient')
    expect(
      resolveDisplayName({ name: '', email: 'admin@kynthai.app', role: 'admin', isDemo: true }),
    ).toBe('Demo Admin')
    expect(
      resolveDisplayName({ name: null, email: 'lab@kynthai.app', role: 'lab', isDemo: true }),
    ).toBe('Demo Lab')
  })

  it('derives a humanised name from the email local part for real users', () => {
    expect(
      resolveDisplayName({ name: null, email: 'jane.doe42@example.com', role: 'patient', isDemo: false }),
    ).toBe('Jane Doe')
  })

  it('falls back when nothing is available', () => {
    expect(resolveDisplayName(null)).toBe('Member')
    expect(resolveDisplayName({ name: '   ', email: null })).toBe('Member')
  })

  it('never returns an empty string', () => {
    expect(resolveDisplayName({ name: '', email: '' }).length).toBeGreaterThan(0)
  })

  it('ignores whitespace-only names', () => {
    expect(resolveDisplayName({ name: '  ', email: 'sam@x.y' })).toBe('Sam')
  })
})

describe('resolveInitial', () => {
  it('returns an uppercase first letter, never a placeholder', () => {
    expect(
      resolveInitial({ name: null, email: 'patient@kynthai.app', role: 'patient', isDemo: true }),
    ).toBe('D')
    expect(resolveInitial({ name: 'sarah', email: 's@x.y' })).toBe('S')
    expect(resolveInitial(null)).toBe('M')
  })
})
