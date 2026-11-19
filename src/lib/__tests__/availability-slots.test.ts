import { describe, expect, it } from 'vitest'
import {
  buildDaySlots,
  checkAvailability,
  findNextBookableSlot,
  zonedTimeToUtc,
} from '@/lib/doctor-availability'
import { availabilityUpdateSchema } from '@/lib/schemas/security'

const NY = 'America/New_York'
/** Monday 23 Nov 2026, 09:00–12:30 New York (EST). */
const MONDAY_MORNING = [{ day: 'monday', start: '09:00', end: '12:30' }]

describe('zonedTimeToUtc', () => {
  it('reads a wall clock in winter-time New York', () => {
    expect(zonedTimeToUtc(2026, 11, 23, 9, 0, NY).toISOString()).toBe('2026-11-23T14:00:00.000Z')
  })

  it('follows the DST switch', () => {
    // 08 Mar 2026 is the US spring-forward day, so 09:00 is EDT (UTC-4).
    expect(zonedTimeToUtc(2026, 3, 8, 9, 0, NY).toISOString()).toBe('2026-03-08T13:00:00.000Z')
  })
})

describe('buildDaySlots', () => {
  it('lays the clinic grid out in the viewer zone for a same-zone viewer', () => {
    const slots = buildDaySlots({
      windows: MONDAY_MORNING,
      viewerDate: '2026-11-23',
      viewerTimeZone: NY,
      clinicTimeZone: NY,
      now: new Date('2026-11-01T00:00:00.000Z'),
    })
    expect(slots.map((s) => s.label)).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
    ])
    expect(slots[0]?.at).toBe('2026-11-23T14:00:00.000Z')
    expect(slots.every((s) => s.available)).toBe(true)
  })

  it('keeps the clinic hours fixed when the viewer is in another zone', () => {
    // Tokyo's 24 Nov runs 23 Nov 15:00Z – 24 Nov 15:00Z. The doctor's Monday
    // morning (14:00–17:30Z) therefore only partly lands inside it. Tuesday is
    // not configured, so (with a Monday-only schedule) it stays closed instead
    // of borrowing the clinic grid.
    const slots = buildDaySlots({
      windows: MONDAY_MORNING,
      viewerDate: '2026-11-24',
      viewerTimeZone: 'Asia/Tokyo',
      clinicTimeZone: NY,
      now: new Date('2026-11-01T00:00:00.000Z'),
    })
    expect(slots.map((s) => s.label)).toEqual([
      '00:00',
      '00:30',
      '01:00',
      '01:30',
      '02:00',
    ])
    const midnight = slots.find((s) => s.label === '00:00')
    expect(midnight?.at).toBe('2026-11-23T15:00:00.000Z')
  })

  it('marks slots covered by a longer consult as booked', () => {
    const slots = buildDaySlots({
      windows: MONDAY_MORNING,
      viewerDate: '2026-11-23',
      viewerTimeZone: NY,
      clinicTimeZone: NY,
      booked: [{ at: '2026-11-23T14:00:00.000Z', durationMinutes: 60 }],
      now: new Date('2026-11-01T00:00:00.000Z'),
    })
    expect(slots.find((s) => s.label === '09:00')).toMatchObject({
      available: false,
      reason: 'booked',
    })
    expect(slots.find((s) => s.label === '09:30')).toMatchObject({
      available: false,
      reason: 'booked',
    })
    expect(slots.find((s) => s.label === '10:00')?.available).toBe(true)
  })

  it('marks slots that have already passed', () => {
    const slots = buildDaySlots({
      windows: MONDAY_MORNING,
      viewerDate: '2026-11-23',
      viewerTimeZone: NY,
      clinicTimeZone: NY,
      now: new Date('2026-11-23T14:45:00.000Z'),
    })
    expect(slots.find((s) => s.label === '09:30')).toMatchObject({
      available: false,
      reason: 'past',
    })
    expect(slots.find((s) => s.label === '10:00')?.available).toBe(true)
  })
})

describe('findNextBookableSlot', () => {
  it('skips an existing booking and returns the next free instant', () => {
    const next = findNextBookableSlot({
      windows: MONDAY_MORNING,
      clinicTimeZone: NY,
      from: new Date('2026-11-23T14:00:00.000Z'),
      booked: [{ at: '2026-11-23T14:00:00.000Z', durationMinutes: 15 }],
    })
    expect(next?.toISOString()).toBe('2026-11-23T14:30:00.000Z')
  })

  it('skips unconfigured days instead of borrowing the clinic grid', () => {
    // Saturday 21 Nov 2026 has no configured hours, so the Monday-only
    // doctor is closed until Monday 23 Nov.
    const next = findNextBookableSlot({
      windows: MONDAY_MORNING,
      clinicTimeZone: NY,
      from: new Date('2026-11-21T14:00:00.000Z'),
    })
    expect(next?.toISOString()).toBe('2026-11-23T14:00:00.000Z')
  })

  it('treats a backwards window as unconfigured and uses the clinic grid', () => {
    const next = findNextBookableSlot({
      windows: [{ day: 'monday', start: '18:00', end: '09:00' }],
      clinicTimeZone: NY,
      from: new Date('2026-11-23T14:00:00.000Z'),
      maxDays: 2,
    })
    expect(next?.toISOString()).toBe('2026-11-23T14:00:00.000Z')
  })
})

describe('availabilityUpdateSchema — clinic timezone', () => {
  const schedule = [{ day: 'monday' as const, slots: [{ start: '09:00', end: '17:00' }] }]

  it('accepts an IANA clinic zone alongside the schedule', () => {
    const parsed = availabilityUpdateSchema.safeParse({ schedule, timeZone: 'America/Chicago' })
    expect(parsed.success).toBe(true)
  })

  it('accepts null so a doctor can clear the zone', () => {
    const parsed = availabilityUpdateSchema.safeParse({ schedule, timeZone: null })
    expect(parsed.success).toBe(true)
  })

  it('keeps a schedule-only payload valid', () => {
    expect(availabilityUpdateSchema.safeParse({ schedule }).success).toBe(true)
  })

  it('rejects a zone Intl does not know', () => {
    const parsed = availabilityUpdateSchema.safeParse({ schedule, timeZone: 'Mars/Olympus' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(['timeZone'])
  })

  it('rejects an inverted window (end before start)', () => {
    const bad = [{ day: 'monday' as const, slots: [{ start: '17:00', end: '09:00' }] }]
    expect(availabilityUpdateSchema.safeParse({ schedule: bad }).success).toBe(false)
  })

  it('rejects a zero-length window', () => {
    const bad = [{ day: 'monday' as const, slots: [{ start: '09:00', end: '09:00' }] }]
    expect(availabilityUpdateSchema.safeParse({ schedule: bad }).success).toBe(false)
  })

  it('rejects overlapping windows on the same day', () => {
    const bad = [{ day: 'monday' as const, slots: [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '14:00' }] }]
    expect(availabilityUpdateSchema.safeParse({ schedule: bad }).success).toBe(false)
  })

  it('accepts adjacent (non-overlapping) windows', () => {
    const ok = [{ day: 'monday' as const, slots: [{ start: '09:00', end: '12:00' }, { start: '12:00', end: '17:00' }] }]
    expect(availabilityUpdateSchema.safeParse({ schedule: ok }).success).toBe(true)
  })
})

describe('checkAvailability', () => {
  it('measures the instant in the clinic zone', () => {
    const inside = checkAvailability({
      slots: MONDAY_MORNING,
      instant: new Date('2026-11-23T14:00:00.000Z'),
      durationMinutes: 15,
      timeZone: NY,
    })
    expect(inside.allowed).toBe(true)
    expect(inside.localTime).toBe('09:00')

    // 15:00 in New York: inside the configured Monday? No — the day has
    // hours of its own, so the clinic-grid fallback does not apply.
    const outside = checkAvailability({
      slots: MONDAY_MORNING,
      instant: new Date('2026-11-23T20:00:00.000Z'),
      durationMinutes: 15,
      timeZone: NY,
    })
    expect(outside.allowed).toBe(false)
  })
})
