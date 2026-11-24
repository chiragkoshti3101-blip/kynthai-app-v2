import { beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const m = vi.hoisted(() => ({ members: vi.fn(), atomic: vi.fn(), notify: vi.fn(), sms: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { familyMember: { findMany: m.members } } }))
vi.mock('@/lib/supabase-db', () => ({ createRecordsAtomically: m.atomic }))
vi.mock('@/lib/api-helpers', () => ({ requireAuthWithCsrf: async () => ({ user: { id: 'u', name: 'Caller', phone: '+14155550100' } }), jsonError: (error: string, status: number) => Response.json({ error }, { status }), readJson: async () => ({}), isUserMinor: () => false }))
vi.mock('@/lib/auth', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/security', () => ({ sanitizeText: () => '' }))
vi.mock('@/lib/notifications', () => ({ sendNotification: m.notify }))
vi.mock('@/lib/integrations', () => ({ sendSMSReal: m.sms, isSMSEnabled: () => false }))
vi.mock('@/lib/logger', () => ({ logger: { phiSafeError: vi.fn() } }))
import { POST } from '@/app/api/emergency-sos/route'
beforeEach(() => { vi.clearAllMocks(); m.atomic.mockImplementation(async (records) => records.map((_: unknown, i: number) => ({ id: String(i) }))) })
it('deduplicates families and recipients, includes an owner without a member row', async () => {
  const membership = { id: 'm', familyId: 'f', family: { owner: { id: 'owner', name: 'Owner' } } }
  m.members.mockResolvedValueOnce([membership, membership, { ...membership, familyId: 'f2' }]).mockResolvedValue([{ user: { id: 'other', name: 'Other' } }, { user: { id: 'owner', name: 'Owner' } }])
  const response = await POST({} as any)
  expect(response.status).toBe(200)
  const records = m.atomic.mock.calls[0][0]
  expect(records.filter((r: any) => r.model === 'emergencyAlert')).toHaveLength(2)
  expect(records.filter((r: any) => r.model === 'familyHealthAlert')).toHaveLength(2)
  expect(m.notify.mock.calls.map(([target]) => target.userId).sort()).toEqual(['other', 'owner'])
})
it('does not deliver notifications if atomic persistence fails', async () => {
  m.members.mockResolvedValueOnce([{ id: 'm', familyId: 'f', family: { owner: { id: 'owner' } } }]).mockResolvedValue([])
  m.atomic.mockRejectedValueOnce(new Error('offline'))
  expect((await POST({} as any)).status).toBe(500)
  expect(m.notify).not.toHaveBeenCalled()
})
it('migration creates owner membership in the family transaction and backfills legacy families', () => {
  const sql = readFileSync('supabase/migrations/20261116070000_family_owner_membership.sql', 'utf8')
  expect(sql).toContain('AFTER INSERT OR UPDATE OF "ownerId"')
  expect(sql).toContain('FROM public.families FOR UPDATE')
  expect(sql).toContain("'self', 'caretaker', 'accepted'")
  expect(sql).toContain('IF NOT FOUND THEN')
})
