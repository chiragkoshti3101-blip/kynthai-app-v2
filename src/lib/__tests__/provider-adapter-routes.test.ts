import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const m = vi.hoisted(() => ({ doctors: vi.fn(), labs: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { doctorProfile: { findMany: m.doctors }, labProfile: { findMany: m.labs } } }))
vi.mock('@/lib/security', () => ({ rateLimit: () => null }))
vi.mock('@/lib/csrf', () => ({ checkCsrf: vi.fn() }))
vi.mock('@/lib/api-helpers', () => ({ jsonOk: (v: unknown) => Response.json(v), jsonError: (error: string, status: number) => Response.json({ error }, { status }), parseJsonCol: (v: string) => JSON.parse(v) }))
import { GET as doctors } from '@/app/api/doctors/route'
import { GET as labs } from '@/app/api/labs/route'
it('lists doctors through the adapter with verified-only filtering and actual provider name', async () => {
  m.doctors.mockResolvedValue([{ id: 'd', consultationFee: 5000, user: { name: 'Dr Test' }, documents: 'private' }])
  const res = await doctors({ nextUrl: new URL('http://localhost/api?city=Boston') } as any)
  expect(m.doctors.mock.calls[0][0].where).toEqual({ verified: true, city: { contains: 'Boston', mode: 'insensitive' } })
  const data = await res.json(); expect(JSON.stringify(data)).toContain('Dr Test'); expect(JSON.stringify(data)).not.toContain('private')
})
it('lists labs through the server adapter without anonymous REST grants', async () => {
  m.labs.mockResolvedValue([])
  expect((await labs({ nextUrl: new URL('http://localhost/api') } as any)).status).toBe(200)
  expect(m.labs.mock.calls[0][0].where).toEqual({ verified: true })
})
it('provider routes contain no raw SQL, runtime DDL or direct REST calls', () => {
  for (const route of ['doctors', 'labs', 'doctors/[id]', 'labs/[id]']) {
    const source = readFileSync(`src/app/api/${route}/route.ts`, 'utf8')
    expect(source).not.toMatch(/\$executeRaw|\$queryRaw|ALTER TABLE|rest\/v1/)
  }
})
