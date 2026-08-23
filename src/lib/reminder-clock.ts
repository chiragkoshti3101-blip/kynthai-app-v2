/**
 * Time helpers for medication reminder cron + in-app inbox.
 *
 * Reminder rows store a local-looking "HH:MM" plus a date. The app is US-first,
 * so cron matching uses America/New_York unless a caller passes another zone.
 * Never use UTC clock parts for dose times — 08:00 ET is 12:00/13:00 UTC.
 */

export const DEFAULT_TZ = 'America/New_York'

export interface ClockParts {
  dateStr: string
  timeStr: string
  prevDateStr: string
  prevTimeStr: string
  isoDate: string
}

function partsInZone(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const bag = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
  const dateStr = `${bag.year}-${bag.month}-${bag.day}`
  const hour = String(bag.hour ?? '00').padStart(2, '0')
  const minute = String(bag.minute ?? '00').padStart(2, '0')
  return { dateStr, timeStr: `${hour}:${minute}` }
}

export function clockParts(timeZone = DEFAULT_TZ, now = new Date()): ClockParts {
  const cur = partsInZone(now, timeZone)
  const prev = partsInZone(new Date(now.getTime() - 60_000), timeZone)
  return {
    dateStr: cur.dateStr,
    timeStr: cur.timeStr,
    prevDateStr: prev.dateStr,
    prevTimeStr: prev.timeStr,
    isoDate: `${cur.dateStr}T00:00:00.000Z`,
  }
}

/** True when a stored "HH:MM" is due now (or within the previous minute). */
export function isDueNow(time: string, clock: ClockParts): boolean {
  return time === clock.timeStr || time === clock.prevTimeStr
}
