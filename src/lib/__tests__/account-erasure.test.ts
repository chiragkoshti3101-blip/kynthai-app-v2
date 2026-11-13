import { describe, expect, it } from 'vitest'
import { STRIPE_ERASURE_NOTE } from '@/lib/account-erasure'

describe('account erasure inventory (KYN-HIGH-006)', () => {
  it('documents Stripe handling for ops', () => {
    expect(STRIPE_ERASURE_NOTE).toMatch(/Stripe/i)
  })
})
