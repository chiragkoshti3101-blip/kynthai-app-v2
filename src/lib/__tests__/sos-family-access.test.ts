import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ memberships: vi.fn(), alerts: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { familyMember: { findMany: m.memberships }, emergencyAlert: { findMany: m.alerts } } }))
vi.mock('@/lib/supabase-db', () => ({ createRecordsAtomically: vi.fn() }))
vi.mock('@/lib/api-helpers', () => ({ requireAuth: async () => ({ user: { id: 'u' } }), requireAuthWithCsrf: vi.fn(), jsonOk: (data: unknown) => Response.json(data), jsonError: (error: string, status: number) => Response.json({ error }, { status }), readJson: vi.fn(), isUserMinor: vi.fn() }))
vi.mock('@/lib/auth', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/security', () => ({ rateLimit: () => null, sanitizeText: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ sendNotification: vi.fn() }))
vi.mock('@/lib/integrations', () => ({ sendSMSReal: vi.fn(), isSMSEnabled: () => false }))
vi.mock('@/lib/logger', () => ({ logger: { phiSafeError: vi.fn() } }))
import { GET as alerts } from '@/app/api/emergency-sos/route'
import { GET as contacts } from '@/app/api/emergency-sos/contacts/route'
beforeEach(() => { vi.clearAllMocks(); m.memberships.mockResolvedValue([]); m.alerts.mockResolvedValue([]) })
it('only accepted membership can discover emergency alerts', async () => {
  expect((await alerts({} as any)).status).toBe(200)
  expect(m.memberships.mock.calls[0][0].where).toEqual({ userId: 'u', inviteStatus: 'accepted' })
})
it('only accepted membership can discover emergency contact phone numbers', async () => {
  m.memberships.mockResolvedValueOnce([{ familyId: 'f' }]).mockResolvedValueOnce([])
  expect((await contacts({} as any)).status).toBe(200)
  expect(m.memberships.mock.calls[0][0].where.inviteStatus).toBe('accepted')
  expect(m.memberships.mock.calls[1][0].where.inviteStatus).toBe('accepted')
})
