import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), gate: vi.fn(), auth: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { pushSubscription: { upsert: m.upsert, deleteMany: m.deleteMany }, user: { findUnique: async () => ({ id: 'session-user' }), updateMany: m.updateMany, count: m.count } } }))
vi.mock('@/lib/security', () => ({ rateLimit: () => null }))
vi.mock('@/lib/auth', () => ({ logAudit: m.audit }))
vi.mock('@/lib/operator-token', () => ({ requireOperatorToken: m.gate }))
vi.mock('@/lib/api-helpers', () => ({ requireAuth: m.auth, requireAuthWithCsrf: m.auth, jsonOk: (b: unknown) => Response.json(b), jsonError: (error: string, status: number) => Response.json({ error }, { status }) }))
import { POST as subscribe } from '@/app/api/notifications/subscribe/route'
import { POST as register, DELETE as unregister } from '@/app/api/notifications/fcm-register/route'
import { POST as timezone } from '@/app/api/admin/diag/timezone/route'
const req = (body: unknown) => new NextRequest('https://example.test/api/test', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ user: { id: 'session-user' } }); m.gate.mockReturnValue(null) })
it('stores webpush for the session owner, ignoring a supplied user', async () => {
  m.upsert.mockResolvedValue({})
  expect((await subscribe(req({ endpoint: 'https://push.test/x', userId: 'attacker' }))).status).toBe(200)
  expect(m.upsert.mock.calls[0][0].create.userId).toBe('session-user')
})
it('fails without runtime DDL or retry on subscription storage failure', async () => {
  m.upsert.mockRejectedValue(new Error('missing table'))
  expect((await subscribe(req({ endpoint: 'https://push.test/x' }))).status).toBe(500)
  expect(m.upsert).toHaveBeenCalledTimes(1)
  expect(m.audit).not.toHaveBeenCalled()
})
it('registers native token only to the verified session', async () => {
  m.upsert.mockResolvedValue({})
  expect((await register(req({ token: 'a'.repeat(30), email: 'victim@test' }))).status).toBe(200)
  expect(m.upsert.mock.calls[0][0].create).toMatchObject({ userId: 'session-user', type: 'fcm' })
})
it('does not claim successful native unregister when storage fails', async () => {
  m.deleteMany.mockRejectedValue(new Error('offline'))
  expect((await unregister(req({ token: 'a'.repeat(30) }))).status).toBe(500)
  expect(m.audit).not.toHaveBeenCalled()
})
it('preserves operator gate before any timezone write', async () => {
  m.gate.mockReturnValue(Response.json({}, { status: 401 }))
  expect((await timezone(req({ timezone: 'UTC', allMissing: true }))).status).toBe(401)
  expect(m.updateMany).not.toHaveBeenCalled()
})
it('backfills only missing timezone through adapter and returns no email', async () => {
  m.updateMany.mockResolvedValue({ count: 2 }); m.count.mockResolvedValue(3)
  const response = await timezone(req({ timezone: 'UTC', allMissing: true }))
  expect(await response.json()).toEqual({ ok: true, updated: 2, usersWithTimezone: 3, scope: 'allMissing' })
  expect(m.updateMany).toHaveBeenCalledWith({ where: { OR: [{ timezone: null }, { timezone: '' }] }, data: { timezone: 'UTC' } })
})
it('rejects null JSON and invalid timezone before writing', async () => {
  expect((await timezone(req(null))).status).toBe(400)
  expect((await timezone(req({ timezone: 'Bad/Zone', allMissing: true }))).status).toBe(400)
  expect(m.updateMany).not.toHaveBeenCalled()
})
