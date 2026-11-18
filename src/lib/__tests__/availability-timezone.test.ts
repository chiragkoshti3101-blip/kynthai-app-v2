import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  // Reassigned per test: GET serves doctors and patients differently.
  authUser: { id: 'doc-user-1', role: 'doctor', timezone: 'America/Chicago' as string | null },
  doctorFindUnique: vi.fn(),
  slotFindFirst: vi.fn(),
  slotFindMany: vi.fn(),
  slotCreate: vi.fn(),
  slotUpdate: vi.fn(),
  slotUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    doctorProfile: { findUnique: mocks.doctorFindUnique },
    doctorAvailabilitySlot: {
      findFirst: mocks.slotFindFirst,
      findMany: mocks.slotFindMany,
      create: mocks.slotCreate,
      update: mocks.slotUpdate,
      updateMany: mocks.slotUpdateMany,
    },
    user: { update: mocks.userUpdate },
  },
}))
vi.mock('@/lib/api-helpers', () => ({
  requireAuth: async () => ({ user: mocks.authUser }),
  requireAuthWithCsrf: async () => ({ user: mocks.authUser }),
  readJson: (req: NextRequest) => req.json(),
  jsonOk: (body: unknown, status = 200) => Response.json(body, { status }),
  jsonError: (
    error: string,
    status = 400,
    codeOrExtras?: string | Record<string, unknown>,
    details?: unknown
  ) =>
    Response.json(
      {
        error,
        ...(typeof codeOrExtras === 'string' ? { code: codeOrExtras } : codeOrExtras ?? {}),
        ...(details !== undefined ? { details } : {}),
      },
      { status }
    ),
}))
vi.mock('@/lib/security', () => ({ rateLimit: () => null }))
vi.mock('@/lib/auth', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/audit-logger', () => ({ recordAuditSync: vi.fn() }))

import { GET, POST } from '@/app/api/doctors/availability/route'

const SCHEDULE = [{ day: 'monday', slots: [{ start: '09:00', end: '17:00' }] }]

const post = (body: unknown) =>
  new NextRequest('https://example.test/api/doctors/availability', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.authUser = { id: 'doc-user-1', role: 'doctor', timezone: 'America/Chicago' }
  mocks.doctorFindUnique.mockResolvedValue({ id: 'doc-1', userId: 'doc-user-1' })
  mocks.slotFindFirst.mockResolvedValue(null)
  mocks.slotCreate.mockResolvedValue({})
  mocks.slotUpdate.mockResolvedValue({})
  mocks.slotUpdateMany.mockResolvedValue({ count: 0 })
  mocks.slotFindMany.mockResolvedValue([{ day: 'monday', start: '09:00', end: '17:00' }])
  mocks.userUpdate.mockResolvedValue({})
})

describe('POST /api/doctors/availability — clinic timezone', () => {
  it('stores the clinic timezone on the doctor user row', async () => {
    const res = await POST(post({ schedule: SCHEDULE, timeZone: 'America/Denver' }))
    expect(res.status).toBe(200)
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-user-1' },
      data: { timezone: 'America/Denver' },
    })
    const body = await res.json()
    expect(body.timeZone).toBe('America/Denver')
    expect(body.clinicTimeZone).toBe('America/Denver')
  })

  it('trims the submitted zone before storing it', async () => {
    const res = await POST(post({ schedule: SCHEDULE, timeZone: '  Asia/Tokyo  ' }))
    expect(res.status).toBe(200)
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-user-1' },
      data: { timezone: 'Asia/Tokyo' },
    })
  })

  it('rejects an invalid zone without writing anything', async () => {
    const res = await POST(post({ schedule: SCHEDULE, timeZone: 'Mars/Olympus' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.details.fields.timeZone).toContain('IANA')
    expect(mocks.userUpdate).not.toHaveBeenCalled()
    expect(mocks.slotCreate).not.toHaveBeenCalled()
    expect(mocks.slotUpdateMany).not.toHaveBeenCalled()
  })

  it('clears the zone with null so the clinic fallback applies', async () => {
    const res = await POST(post({ schedule: SCHEDULE, timeZone: null }))
    expect(res.status).toBe(200)
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-user-1' },
      data: { timezone: null },
    })
    const body = await res.json()
    expect(body.timeZone).toBeNull()
    expect(body.clinicTimeZone).toBe('America/New_York')
  })

  it('leaves the stored zone alone when the payload omits it', async () => {
    const res = await POST(post({ schedule: SCHEDULE }))
    expect(res.status).toBe(200)
    expect(mocks.userUpdate).not.toHaveBeenCalled()
    expect((await res.json()).timeZone).toBe('America/Chicago')
  })
})

const get = (query = '') =>
  new NextRequest(`https://example.test/api/doctors/availability${query}`)

describe('GET /api/doctors/availability — clinic timezone', () => {
  it('serves the stored clinic zone from the permission lookup', async () => {
    mocks.doctorFindUnique
      .mockResolvedValueOnce({ id: 'doc-1' })
      .mockResolvedValueOnce({ id: 'doc-1', user: { timezone: 'Europe/Berlin' } })

    const res = await GET(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.timeZone).toBe('Europe/Berlin')
    expect(body.clinicTimeZone).toBe('Europe/Berlin')
    expect(body.schedule.monday).toEqual([{ start: '09:00', end: '17:00' }])
    // Own profile id + permission/zone: the read no longer needs a third lookup.
    expect(mocks.doctorFindUnique).toHaveBeenCalledTimes(2)
  })

  it('falls back to America/New_York when the doctor never set a zone', async () => {
    mocks.doctorFindUnique
      .mockResolvedValueOnce({ id: 'doc-1' })
      .mockResolvedValueOnce({ id: 'doc-1', user: { timezone: null } })

    const body = await (await GET(get())).json()
    expect(body.timeZone).toBeNull()
    expect(body.clinicTimeZone).toBe('America/New_York')
  })

  it("returns the doctor's zone to a patient, not the viewer's", async () => {
    mocks.authUser = { id: 'patient-1', role: 'patient', timezone: 'America/Chicago' }
    mocks.doctorFindUnique.mockResolvedValue({
      verified: true,
      user: { timezone: 'Asia/Kolkata' },
    })

    const res = await GET(get('?doctorId=doc-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.timeZone).toBe('Asia/Kolkata')
    expect(body.clinicTimeZone).toBe('Asia/Kolkata')
    expect(mocks.doctorFindUnique).toHaveBeenCalledTimes(1)
  })

  it('hides an unverified doctor\'s zone behind a 404', async () => {
    mocks.authUser = { id: 'patient-1', role: 'patient', timezone: 'America/Chicago' }
    mocks.doctorFindUnique.mockResolvedValue({
      verified: false,
      user: { timezone: 'Asia/Kolkata' },
    })

    const res = await GET(get('?doctorId=doc-1'))
    expect(res.status).toBe(404)
    expect(mocks.slotFindMany).not.toHaveBeenCalled()
  })

  it('returns an empty schedule and the fallback zone for a doctor with no profile yet', async () => {
    // No profile to read a zone from, and no zone on the session row either.
    mocks.authUser = { id: 'doc-user-1', role: 'doctor', timezone: null }
    mocks.doctorFindUnique.mockResolvedValue(null)

    const res = await GET(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.doctorId).toBeNull()
    expect(body.schedule.monday).toEqual([])
    expect(body.clinicTimeZone).toBe('America/New_York')
    expect(mocks.slotFindMany).not.toHaveBeenCalled()
  })
})
