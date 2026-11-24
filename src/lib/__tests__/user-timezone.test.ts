import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ update: vi.fn(), findUnique: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { user: { update: mocks.update, findUnique: mocks.findUnique } } }))
vi.mock('@/lib/security', () => ({ rateLimit: () => null }))
vi.mock('@/lib/auth', () => ({ logAudit: mocks.audit }))
vi.mock('@/lib/api-helpers', () => ({
  requireAuthWithCsrf: async () => ({ user: { id: 'current-user' } }),
  readJson: (req: NextRequest) => req.json(),
  jsonOk: (body: unknown) => Response.json(body),
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
}))
import { GET, PUT } from '@/app/api/user/timezone/route'

beforeEach(() => vi.resetAllMocks())
const request = (timezone: string) => new NextRequest('https://example.test/api/user/timezone', {
  method: 'PUT', body: JSON.stringify({ timezone }), headers: { 'Content-Type': 'application/json' },
})
describe('user timezone persistence', () => {
  it('stores a valid timezone for the authenticated user through the adapter', async () => {
    mocks.update.mockResolvedValue({})
    const response = await PUT(request('America/Los_Angeles'))
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'current-user' }, data: { timezone: 'America/Los_Angeles' } })
    expect(mocks.audit).toHaveBeenCalledWith('current-user', 'user.timezone.set', 'America/Los_Angeles')
  })
  it('rejects invalid zones without writing', async () => {
    expect((await PUT(request('Not/AZone'))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('reports a failed write without auditing success', async () => {
    mocks.update.mockRejectedValue(new Error('unavailable'))
    expect((await PUT(request('UTC'))).status).toBe(500)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('reads the authenticated user timezone through the adapter', async () => {
    mocks.findUnique.mockResolvedValue({ timezone: 'Asia/Kolkata' })
    const response = await GET(new NextRequest('https://example.test/api/user/timezone'))
    expect(await response.json()).toEqual({ timezone: 'Asia/Kolkata' })
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'current-user' }, select: { timezone: true } })
  })
  it('returns null for a missing user record', async () => {
    mocks.findUnique.mockResolvedValue(null)
    expect(await (await GET(new NextRequest('https://example.test/api/user/timezone'))).json()).toEqual({ timezone: null })
  })
})
