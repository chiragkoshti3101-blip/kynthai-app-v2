import { describe, expect, it } from 'vitest'
import {
  portalRoleAllowed,
  requiresAuthenticatedApi,
} from '@/lib/api-edge-auth'

describe('API edge auth (KYN-HIGH-010)', () => {
  it('requires auth for /api/user routes by default', () => {
    expect(requiresAuthenticatedApi('/api/user/data-export', 'GET')).toBe(true)
    expect(requiresAuthenticatedApi('/api/user/account', 'DELETE')).toBe(true)
  })

  it('leaves public auth endpoints open', () => {
    expect(requiresAuthenticatedApi('/api/auth/login', 'POST')).toBe(false)
    expect(requiresAuthenticatedApi('/api/health', 'GET')).toBe(false)
  })
})

describe('portal role at edge (KYN-HIGH-011)', () => {
  it('blocks patient sessions from admin portal when role cookie present', () => {
    expect(portalRoleAllowed('patient', '/admin')).toBe(false)
    expect(portalRoleAllowed('admin', '/admin')).toBe(true)
  })
})
