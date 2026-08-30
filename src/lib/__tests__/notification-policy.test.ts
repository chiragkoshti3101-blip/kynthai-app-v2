import { describe, expect, it } from 'vitest'
import { preferenceKeyForType, readNotificationPrefs } from '../notifications'
import { formatNotificationDate } from '../notification-time'

describe('notification policy', () => {
  it('maps every core event family to the matching preference', () => {
    expect(preferenceKeyForType('appointment_reminder')).toBe('reminders')
    expect(preferenceKeyForType('reminder_escalation')).toBe('reminders')
    expect(preferenceKeyForType('lab_booking_update')).toBe('reminders')
    expect(preferenceKeyForType('lab_results')).toBe('labResults')
    expect(preferenceKeyForType('family_escalation_missed_dose')).toBe('reminders')
    expect(preferenceKeyForType('emergency_sos')).toBe('emergency')
    expect(preferenceKeyForType('doctor_nudge')).toBe('family')
    expect(preferenceKeyForType('weekly_insight')).toBe('insights')
    expect(preferenceKeyForType('system')).toBeNull()
  })

  it('defaults safely and preserves explicit opt-outs', () => {
    expect(readNotificationPrefs('{"emergency":false,"family":false}')).toEqual({
      reminders: true,
      labResults: true,
      emergency: false,
      insights: true,
      family: false,
    })
    expect(readNotificationPrefs('not-json').reminders).toBe(true)
  })
})

describe('recipient-local notification time', () => {
  const instant = '2026-01-15T15:00:00.000Z'

  it('renders the same appointment instant in each recipient timezone', () => {
    expect(formatNotificationDate(instant, 'Asia/Kolkata')).toContain('8:30 PM')
    expect(formatNotificationDate(instant, 'America/New_York')).toContain('10:00 AM')
  })

  it('falls back without throwing for an invalid timezone', () => {
    expect(formatNotificationDate(instant, 'not/a-real-zone')).toContain('10:00 AM')
  })
})
