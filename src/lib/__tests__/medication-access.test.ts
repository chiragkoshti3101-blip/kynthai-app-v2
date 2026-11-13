import { describe, expect, it } from 'vitest'
import { canAccessMedication } from '@/lib/medication-access'

describe('medication access (KYN-HIGH-001)', () => {
  it('denies other users when userId is null and caller is not family caretaker', () => {
    expect(
      canAccessMedication({ userId: null, familyMemberId: null }, 'user-a', false),
    ).toBe(false)
  })

  it('allows direct owner', () => {
    expect(
      canAccessMedication({ userId: 'user-a', familyMemberId: null }, 'user-a', false),
    ).toBe(true)
  })

  it('allows family caretaker for family member medications', () => {
    expect(
      canAccessMedication({ userId: null, familyMemberId: 'fm-1' }, 'caretaker', true),
    ).toBe(true)
  })
})
