import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  doctorFindUnique: vi.fn(),
  slotFindMany: vi.fn(),
  appointmentFindMany: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    doctorProfile: { findUnique: mocks.doctorFindUnique },
    doctorAvailabilitySlot: { findMany: mocks.slotFindMany },
    appointment: { findMany: mocks.appointmentFindMany },
  },
}))
vi.mock('@/lib/api-helpers', () => ({
  requireAuth: async () => ({ user: { id: 'patient-1', role: 'patient' } }),
  jsonOk: (body: unknown, status = 200) => Response.json(body, { status }),
  jsonError: (error: string, status = 400) => Response.json({ error }, { status }),
}))
vi.mock('@/lib/security', () => ({ rateLimit: () => null }))

import { GET } from '@/app/api/doctors/[id]/slots/route'

// Monday, far enough ahead that no slot is filtered as past.
const DATE = '2030-01-07'
const ZONE = 'America/New_York'

const get = (query = '') =>
  GET(
    new NextRequest(
      `https://example.test/api/doctors/doc-1/slots?date=${DATE}&timeZone=${encodeURIComponent(ZONE)}${query}`
    ),
    { params: Promise.resolve({ id: 'doc-1' }) }
  )

const labels = async (query = '') => {
  const res = await get(query)
  expect(res.status).toBe(200)
  const body = await res.json()
  return (body.slots as { label: string; available: boolean }[])
    .filter((s) => s.available)
    .map((s) => s.label)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.doctorFindUnique.mockResolvedValue({ id: 'doc-1', user: { timezone: ZONE } })
  mocks.slotFindMany.mockResolvedValue([{ day: 'monday', start: '09:00', end: '12:30' }])
  mocks.appointmentFindMany.mockResolvedValue([])
})

describe('GET /api/doctors/[id]/slots — duration', () => {
  it('keeps the 30-minute grid when no duration is given', async () => {
    expect(await labels()).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
    ])
  })

  it('offers every 30-minute start that fits a 60-minute visit', async () => {
    expect(await labels('&duration=60')).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
    ])
  })

  it('drops a start that would run past the window for a 60-minute visit', async () => {
    // 12:00 fits a 30-minute visit but must not be offered for a full hour
    // when the window closes at 12:30.
    expect(await labels()).toContain('12:00')
    expect(await labels('&duration=60')).not.toContain('12:00')
  })

  it('clamps an oversized duration to the 120-minute maximum', async () => {
    expect(await labels('&duration=600')).toEqual(await labels('&duration=120'))
    expect(await labels('&duration=120')).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })

  it('falls back to the default grid for a non-positive or unparsable duration', async () => {
    const fallback = await labels()
    expect(await labels('&duration=0')).toEqual(fallback)
    expect(await labels('&duration=abc')).toEqual(fallback)
  })

  it('leaves an existing 30-minute booking alone in both grids', async () => {
    // 09:30 and 11:15 in clinic time: each start must account for the whole
    // visit, not just its first 30 minutes.
    mocks.appointmentFindMany.mockResolvedValue([
      { scheduledAt: new Date('2030-01-07T14:30:00Z'), durationMinutes: 30 },
      { scheduledAt: new Date('2030-01-07T16:15:00Z'), durationMinutes: 30 },
    ])

    // 09:00 fits before the 09:30 booking in the default grid.
    expect(await labels()).toContain('09:00')
    // As a 60-minute visit it would run into it, and 11:00 would run into 11:15.
    expect(await labels('&duration=60')).toEqual(['10:00'])
  })

  it('offers nothing when the window is shorter than the visit', async () => {
    mocks.slotFindMany.mockResolvedValue([{ day: 'monday', start: '09:00', end: '09:45' }])

    expect(await labels()).toEqual(['09:00'])
    expect(await labels('&duration=60')).toEqual([])
  })
})
