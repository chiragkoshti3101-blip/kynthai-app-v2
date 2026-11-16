import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), gate: vi.fn() }))
vi.mock('@/lib/db', () => {
  const model = { count: m.count, findMany: m.findMany, findFirst: m.findFirst }
  return { db: { user: model, pushSubscription: model, reminder: model, medication: model, notificationLog: model } }
})
vi.mock('@/lib/operator-token', () => ({ requireOperatorToken: m.gate }))
import { GET } from '@/app/api/admin/diag/notifications/route'
beforeEach(() => { vi.resetAllMocks(); m.gate.mockReturnValue(null); m.count.mockResolvedValue(0); m.findMany.mockResolvedValue([]); m.findFirst.mockResolvedValue(null) })
it('checks operator auth before reads', async () => {
  m.gate.mockReturnValue(Response.json({}, { status: 401 }))
  expect((await GET(new NextRequest('https://test/'))).status).toBe(401)
  expect(m.count).not.toHaveBeenCalled()
})
it('reports canonical reminder store and aggregates only', async () => {
  const response = await GET(new NextRequest('https://test/'))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, reminderTable: 'reminders', pushSubsDistinctUsers: 0 })
  expect(m.findMany.mock.calls.every(([args]) => !args.select.token && !args.select.body && !args.select.email)).toBe(true)
})
it('does not report healthy when adapter reads fail', async () => {
  m.count.mockRejectedValue(new Error('missing schema'))
  const response = await GET(new NextRequest('https://test/'))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ ok: false, usersTotal: null, unavailable: expect.arrayContaining(['usersTotal']) })
})
