import { describe, expect, it } from 'vitest'
import { clockParts, isDueNow } from '../reminder-clock'

describe('clockParts', () => {
  it('returns ET date/time for a known UTC instant', () => {
    // 2026-08-23 12:05 UTC = 08:05 America/New_York (EDT, UTC-4)
    const now = new Date('2026-08-23T12:05:00.000Z')
    const c = clockParts('America/New_York', now)
    expect(c.dateStr).toBe('2026-08-23')
    expect(c.timeStr).toBe('08:05')
    expect(c.prevTimeStr).toBe('08:04')
    expect(c.isoDate).toBe('2026-08-23T00:00:00.000Z')
  })

  it('rolls the previous minute across midnight', () => {
    // 2026-08-24 04:00 UTC = 00:00 ET
    const now = new Date('2026-08-24T04:00:00.000Z')
    const c = clockParts('America/New_York', now)
    expect(c.dateStr).toBe('2026-08-24')
    expect(c.timeStr).toBe('00:00')
    expect(c.prevDateStr).toBe('2026-08-23')
    expect(c.prevTimeStr).toBe('23:59')
  })

  it('isDueNow matches current and previous minute only', () => {
    const c = clockParts('America/New_York', new Date('2026-08-23T12:05:00.000Z'))
    expect(isDueNow('08:05', c)).toBe(true)
    expect(isDueNow('08:04', c)).toBe(true)
    expect(isDueNow('08:00', c)).toBe(false)
  })
})
