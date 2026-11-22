import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  doctorFindUnique: vi.fn(),
  slotFindMany: vi.fn(),
  appointmentFindMany: vi.fn(),
  appointmentCreate: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    doctorProfile: { findUnique: mocks.doctorFindUnique },
    doctorAvailabilitySlot: { findMany: mocks.slotFindMany },
    appointment: { findMany: mocks.appointmentFindMany, create: mocks.appointmentCreate },
  },
}))
vi.mock('@/lib/api-helpers', () => ({
  requireAuthWithCsrf: async () => ({
    user: {
      id: 'patient-1',
      role: 'patient',
      name: 'Pat Patient',
      email: 'pat@example.test',
      timezone: 'America/New_York',
    },
  }),
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
vi.mock('@/lib/security', () => ({ rateLimit: () => null, sanitizeText: (v: string) => v }))
vi.mock('@/lib/auth', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ sendNotification: mocks.notify }))
vi.mock('@/lib/notification-time', () => ({ formatNotificationDate: () => 'Mon, Nov 23 at 10:00 AM' }))
vi.mock('@/lib/logger', () => ({
  logger: { phiSafeError: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}))

import { POST } from '@/app/api/appointments/route'

const DOCTOR = {
  id: 'doc-1',
  userId: 'doc-user-1',
  verified: true,
  verificationStatus: 'verified',
  consultationFee: 100,
  // The doctor's own zone: the windows below are New York wall-clock times.
  user: { timezone: 'America/New_York' },
}

/** Monday 23 Nov 2026, 10:00 America/New_York (EST) = 15:00Z. */
const MONDAY_10AM_NY = '2026-11-23T15:00:00.000Z'

const book = (body: Record<string, unknown>) =>
  new NextRequest('https://example.test/api/appointments', {
    method: 'POST',
    body: JSON.stringify({ doctorId: 'doc-1', ...body }),
    headers: { 'Content-Type': 'application/json' },
  })

const created = () => mocks.appointmentCreate.mock.calls[0][0].data

beforeEach(() => {
  vi.resetAllMocks()
  mocks.doctorFindUnique.mockResolvedValue(DOCTOR)
  mocks.slotFindMany.mockResolvedValue([{ day: 'monday', start: '09:00', end: '12:30' }])
  mocks.appointmentFindMany.mockResolvedValue([])
  mocks.notify.mockResolvedValue(undefined)
  mocks.appointmentCreate.mockImplementation(async ({ data }: any) => ({
    id: 'appt-1',
    scheduledAt: data.scheduledAt,
    patient: { timezone: 'America/New_York' },
    doctor: {
      user: { id: 'doc-user-1', name: 'Dr House', email: 'dr@example.test', timezone: 'UTC' },
    },
  }))
})

describe('POST /api/appointments — availability gate', () => {
  it('books a time inside the doctor weekly window', async () => {
    const res = await POST(book({ scheduledAt: MONDAY_10AM_NY }))
    expect(res.status).toBe(201)
    expect(created()).toMatchObject({
      doctorId: 'doc-1',
      patientId: 'patient-1',
      durationMinutes: 30,
      status: 'pending',
    })
  })

  it('rejects a time in the lunch gap with the day hours in the error', async () => {
    // 13:00 New York
    const res = await POST(book({ scheduledAt: '2026-11-23T18:00:00.000Z' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('OUTSIDE_AVAILABILITY')
    expect(body.error).toContain('monday')
    expect(body.error).toContain('09:00')
    expect(mocks.appointmentCreate).not.toHaveBeenCalled()
  })

  it('rejects a booking that would run past the end of the window', async () => {
    // 12:20 New York, 30 minute consult ends 12:50 > 12:30
    const res = await POST(
      book({ scheduledAt: '2026-11-23T17:20:00.000Z', durationMinutes: 30 })
    )
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('OUTSIDE_AVAILABILITY')
  })

  it('persists the requested duration instead of the model default', async () => {
    const res = await POST(book({ scheduledAt: MONDAY_10AM_NY, durationMinutes: 45 }))
    expect(res.status).toBe(201)
    expect(created().durationMinutes).toBe(45)
  })

  it('ignores a caller-supplied timeZone and reads the hours in the clinic zone', async () => {
    // 03:00Z is 22:00 the previous evening in New York but 17:00 in Kiritimati;
    // claiming the far-east zone must not move the doctor's morning.
    const res = await POST(
      book({ scheduledAt: '2026-11-24T03:00:00.000Z', timeZone: 'Pacific/Kiritimati' })
    )
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('OUTSIDE_AVAILABILITY')
    expect(mocks.appointmentCreate).not.toHaveBeenCalled()
  })

  it('follows the doctor to another zone instead of the patient', async () => {
    mocks.doctorFindUnique.mockResolvedValue({ ...DOCTOR, user: { timezone: 'Asia/Tokyo' } })
    // 00:30Z is 09:30 Monday in Tokyo; the same clock is Monday 19:30 in NY.
    const inside = await POST(book({ scheduledAt: '2026-11-23T00:30:00.000Z' }))
    expect(inside.status).toBe(201)

    // 15:00Z is 00:00 Tuesday in Tokyo — outside every Monday window.
    const outside = await POST(book({ scheduledAt: '2026-11-23T15:00:00.000Z' }))
    expect(outside.status).toBe(409)
    expect((await outside.json()).code).toBe('OUTSIDE_AVAILABILITY')
  })

  it('rejects a weekday with no configured windows now that the clinic grid is not borrowed', async () => {
    // Saturday 28 Nov 2026, 10:00 New York = 15:00Z. The doctor only saved
    // Monday, so Saturday is closed rather than inheriting the default hours.
    const res = await POST(book({ scheduledAt: '2026-11-28T15:00:00.000Z' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('OUTSIDE_AVAILABILITY')
    expect(mocks.appointmentCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/appointments — slot collisions', () => {
  it('rejects an overlapping live appointment', async () => {
    mocks.appointmentFindMany.mockResolvedValue([
      { id: 'a1', scheduledAt: new Date('2026-11-23T15:05:00.000Z'), durationMinutes: 15 },
    ])
    const res = await POST(book({ scheduledAt: MONDAY_10AM_NY }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SLOT_UNAVAILABLE')
    expect(mocks.appointmentCreate).not.toHaveBeenCalled()
  })

  it('rejects a slot inside a longer existing consultation', async () => {
    // Existing 10:00–11:00; the old ±30 minute client window let 10:45 through.
    mocks.appointmentFindMany.mockResolvedValue([
      { id: 'a1', scheduledAt: new Date('2026-11-23T15:00:00.000Z'), durationMinutes: 60 },
    ])
    const res = await POST(book({ scheduledAt: '2026-11-23T15:45:00.000Z' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SLOT_UNAVAILABLE')
  })

  it('allows a back-to-back appointment that only touches', async () => {
    mocks.appointmentFindMany.mockResolvedValue([
      { id: 'a1', scheduledAt: new Date('2026-11-23T15:30:00.000Z'), durationMinutes: 15 },
    ])
    const res = await POST(book({ scheduledAt: MONDAY_10AM_NY }))
    expect(res.status).toBe(201)
  })

  it('turns a lost race (exclusion constraint) into 409 instead of 500', async () => {
    mocks.appointmentCreate.mockRejectedValue(
      Object.assign(
        new Error(
          'conflicting key value violates exclusion constraint "appointments_doctor_slot_no_overlap"'
        ),
        { code: '23P01' }
      )
    )
    const res = await POST(book({ scheduledAt: MONDAY_10AM_NY }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SLOT_UNAVAILABLE')
  })
})
