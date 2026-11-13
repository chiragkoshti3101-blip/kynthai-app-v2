import { describe, expect, it } from 'vitest'
import { isDistributedRateLimitActive } from '@/lib/rate-limit'

describe('distributed rate limit readiness (KYN-HIGH-014)', () => {
  it('exposes whether Upstash limiter is configured', () => {
    expect(typeof isDistributedRateLimitActive()).toBe('boolean')
  })
})
