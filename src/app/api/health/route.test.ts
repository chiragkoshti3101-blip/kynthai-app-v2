import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { user: { findFirst } } }))
vi.mock('@/lib/api-helpers', () => ({ applyStandardHeaders: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { phiSafeError: vi.fn() } }))
import { GET } from './route'
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })
describe('selected-backend health', () => {
  it('probes a narrow read and returns no records', async () => {
    findFirst.mockResolvedValue({ id: 'not-public' })
    const res = await GET(new NextRequest('http://localhost/api/health'))
    expect(res.status).toBe(200)
    expect(findFirst).toHaveBeenCalledWith({ select: { id: true } })
    expect(await res.text()).not.toContain('not-public')
  })
  it('returns 503 on dependency failure', async () => {
    findFirst.mockRejectedValue(new Error('private connection details'))
    const res = await GET(new NextRequest('http://localhost/api/health'))
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('private')
  })
  it('bounds a hung backend to five seconds', async () => {
    vi.useFakeTimers()
    findFirst.mockReturnValue(new Promise(() => {}))
    const pending = GET(new NextRequest('http://localhost/api/health'))
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).status).toBe(503)
  })
})
