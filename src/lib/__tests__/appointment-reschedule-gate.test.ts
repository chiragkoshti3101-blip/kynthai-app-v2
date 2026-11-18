import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  appointmentFindUnique: vi.fn(),
  appointmentFindMany: vi.fn(),
  appointmentUpdate: vi.fn(),
  slotFindMany: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    appointment: {
      findUnique: mocks.appointmentFindUnique,
      findMany: mocks.appointmentFindMany,
      update: mocks.appointmentUpdate,
    },
    doctorAvailabilitySlot: { findMany: mocks.slotFindMany },
  },
}))
vi.mock('@/lib/api-helpers', () => ({
  requireAuthWithCsrf: async () => ({
    user: { id: 'doc-user-1', role: 'doctor', name: 'Doc', email: 'doc@example.test' },
  }),
  checkConsent: () => null,
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
vi.mock('@/lib/security', () => ({ sanitizeText: (v: string) => v }))
vi.mock('@/lib/auth', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ sendNotification: mocks.notify }))
vi.mock('@/lib/notification-time', () => ({ formatNotificationDate: () => 'Mon, Nov 23 at 10:00 AM' }))
vi.mock('@/lib/logger', () => ({
  logger: { phiSafeError: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}))

import { PATCH } from '@/app/api/appointments/[id]/route'

/** Monday 23 Nov 2026, 10:00 America/New_York (EST). */
const MONDAY_10AM_NY = '2026-11-23T15:00:00.000Z'

const APPOINTMENT = {
  id: 'appt-1',
  doctorId: 'doc-1',
  patientId: 'patient-1',
  status: 'confirmed',
  price: 100,
  commission: 15,
  paymentCaptured: true,
  durationMinutes: 30,
  scheduledAt: new Date('2026-11-24T15:00:00.000Z'),
  // Windows below are New York wall-clock times.
  doctor: {
    id: 'doc-1',
    userId: 'doc-user-1',
    videoCallEnabled: true,
    user: { id: 'doc-user-1', name: 'Dr House', timezone: 'America/New_York' },
  },
  patient: { id: 'patient-1', name: 'Pat', timezone: 'America/New_York' },
}

const patch = (body: Record<string, unknown> = { scheduledAt: MONDAY_10AM_NY }) =>
  PATCH(
    new NextRequest('https://example.test/api/appointments/appt-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ id: 'appt-1' }) }
  )

beforeEach(() => {
  vi.resetAllMocks()
  mocks.appointmentFindUnique.mockResolvedValue(APPOINTMENT)
  mocks.appointmentFindMany.mockResolvedValue([])
  mocks.slotFindMany.mockResolvedValue([{ day: 'monday', start: '09:00', end: '12:30' }])
  mocks.notify.mockResolvedValue(undefined)
  mocks.appointmentUpdate.mockImplementation(async ({ data }: any) => ({
    ...APPOINTMENT,
    scheduledAt: data.scheduledAt,
  }))
})

describe('PATCH /api/appointments/[id] — reschedule gate', () => {
  it('moves a confirmed appointment to a slot inside clinic hours', async () => {
    const res = await patch()
    expect(res.status).toBe(200)
    expect(mocks.appointmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { scheduledAt: new Date(MONDAY_10AM_NY) },
      })
    )
  })

  it('excludes the appointment being moved from the overlap scan', async () => {
    await patch()
    expect(mocks.appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          doctorId: 'doc-1',
          id: { not: 'appt-1' },
          status: { in: ['pending', 'confirmed', 'rescheduled'] },
        }),
      })
    )
  })

  it('rejects a time in the lunch gap with the clinic hours', async () => {
    // 13:00 New York
    const res = await patch({ scheduledAt: '2026-11-23T18:00:00.000Z' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('OUTSIDE_AVAILABILITY')
    expect(body.error).toContain('monday')
    expect(body.error).toContain('America/New_York')
    expect(mocks.appointmentUpdate).not.toHaveBeenCalled()
  })

  it('reads the hours in the doctor zone, not the server or caller zone', async () => {
    mocks.appointmentFindUnique.mockResolvedValue({
      ...APPOINTMENT,
      doctor: { ...APPOINTMENT.doctor, user: { ...APPOINTMENT.doctor.user, timezone: 'Asia/Tokyo' } },
    })
    // 00:30Z is 09:30 Monday in Tokyo, 19:30 Sunday in New York.
    const ok = await patch({ scheduledAt: '2026-11-23T00:30:00.000Z' })
    expect(ok.status).toBe(200)

    const res = await patch({ scheduledAt: '2026-11-23T15:00:00.000Z' })
    expect(res.status).toBe(409)
  })

  it('rejects an overlap with another live appointment', async () => {
    mocks.appointmentFindMany.mockResolvedValue([
      { id: 'appt-2', scheduledAt: new Date('2026-11-23T15:15:00.000Z'), durationMinutes: 30 },
    ])
    const res = await patch()
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SLOT_UNAVAILABLE')
    expect(mocks.appointmentUpdate).not.toHaveBeenCalled()
  })

  it('allows a back-to-back time that only touches the next booking', async () => {
    // Existing 10:30–11:00 New York; 10:00–10:30 only touches it.
    mocks.appointmentFindMany.mockResolvedValue([
      { id: 'appt-2', scheduledAt: new Date('2026-11-23T15:30:00.000Z'), durationMinutes: 30 },
    ])
    const res = await patch()
    expect(res.status).toBe(200)
  })

  it('requires the whole appointment to fit before the window closes', async () => {
    // 12:15 New York + 30 minutes runs past 12:30.
    const res = await patch({ scheduledAt: '2026-11-23T17:15:00.000Z' })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('OUTSIDE_AVAILABILITY')
  })

  it('turns a lost race (exclusion constraint) into 409 instead of 500', async () => {
    mocks.appointmentUpdate.mockRejectedValue(
      Object.assign(
        new Error(
          'conflicting key value violates exclusion constraint "appointments_doctor_slot_no_overlap"'
        ),
        { code: '23P01' }
      )
    )
    const res = await patch()
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SLOT_UNAVAILABLE')
  })

  it('still rejects a past time before any availability lookup', async () => {
    const res = await patch({ scheduledAt: '2020-01-01T15:00:00.000Z' })
    expect(res.status).toBe(400)
    expect(mocks.slotFindMany).not.toHaveBeenCalled()
  })

  it('still refuses to reschedule a cancelled appointment', async () => {
    mocks.appointmentFindUnique.mockResolvedValue({ ...APPOINTMENT, status: 'cancelled' })
    const res = await patch()
    expect(res.status).toBe(400)
    expect(mocks.slotFindMany).not.toHaveBeenCalled()
  })
})
