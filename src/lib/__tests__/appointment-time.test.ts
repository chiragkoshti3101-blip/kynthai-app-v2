import { describe, expect, it } from 'vitest'
import { formatAppointmentTime } from '../appointment-time'

describe('formatAppointmentTime', () => {
  const instant = '2026-01-15T15:00:00.000Z'

  it('formats a valid appointment instant in the requested timezone', () => {
    expect(formatAppointmentTime(instant, 'Asia/Kolkata')).toBe('8:30 PM')
    expect(formatAppointmentTime(instant, 'America/New_York')).toBe('10:00 AM')
  })

  it('returns an empty display value for malformed timestamps', () => {
    expect(formatAppointmentTime('not-a-timestamp')).toBe('')
    expect(formatAppointmentTime(null)).toBe('')
    expect(formatAppointmentTime(undefined)).toBe('')
  })

  it('falls back to local formatting for an invalid timezone without throwing', () => {
    expect(formatAppointmentTime(instant, 'not/a-real-zone')).not.toBe('')
  })
})
