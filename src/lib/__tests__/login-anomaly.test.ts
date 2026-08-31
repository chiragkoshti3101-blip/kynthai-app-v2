import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  phiSafeError: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { auditLog: { findMany: mocks.findMany } },
}))

vi.mock('@/lib/logger', () => ({
  logger: { phiSafeError: mocks.phiSafeError },
}))

import { assessLoginRisk } from '@/lib/login-anomaly'

describe('login anomaly detection', () => {
  beforeEach(() => {
    mocks.findMany.mockReset()
    mocks.phiSafeError.mockReset()
  })

  it('fails open when audit history is unavailable', async () => {
    mocks.findMany.mockRejectedValue(new Error('audit history unavailable'))

    const result = await assessLoginRisk({
      userId: 'user-1',
      email: 'patient@demo.kynthai.app',
      ip: '127.0.0.1',
      userAgent: 'test-agent',
      deviceFingerprint: 'device-1',
      timestamp: new Date('2026-08-31T12:00:00Z'),
    })

    expect(result).toEqual({
      score: 0,
      level: 'low',
      factors: [],
      shouldChallenge: false,
      shouldBlock: false,
    })
    expect(mocks.phiSafeError).toHaveBeenCalledWith(
      expect.any(Error),
      'auth.login.risk-history',
    )
  })
})
